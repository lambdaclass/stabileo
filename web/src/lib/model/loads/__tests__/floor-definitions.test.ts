/**
 * Floor loads kept as definitions and load zones: what they expand to, against the closed forms,
 * and their loads following the model when it moves under them.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import { addFloorLoadDef, addLoadZone, syncDefinedLoads, removeFloorLoadDef, removeLoadZone } from '../../../store/defined-loads';
import { removeLoads, scaleLoads, moveLoadsToCase, duplicateCase } from '../../../store/load-ops';
import { copyTransformed } from '../../edit/transformed-copy';
import { transformInPlace } from '../../edit/transform-in-place';
import { translation } from '../../edit/affine';
import {
  expandDefinition, definitionsCurrent, expandAll, zoneOutline, zoneOutlineProblem, zoneArea, zoneChanged, rangeTarget, isDefinedLoad,
  type DefinitionModel, type FloorLoadDef,
} from '../floor-definitions';

/** A 8 × 6 m bay at z = 3 on four columns, with a 2 × 2 m slab quad in a corner. */
function bay() {
  modelStore.clear();
  const n = [[0, 0], [8, 0], [8, 6], [0, 6]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
  const beams = n.map((a, i) => modelStore.addElement(a, n[(i + 1) % 4]!));
  const s = [[0, 0], [2, 0], [2, 2], [0, 2]].map(([x, y], i) => (i === 0 ? n[0]! : modelStore.addNode(x!, y!, 3)));
  const quad = modelStore.addQuad(s as [number, number, number, number], 1, 0.2);
  const caseId = modelStore.addLoadCase('L', 'L');
  return { n, beams, quad, caseId };
}
const m = () => modelStore.model as unknown as DefinitionModel;
const total = (loads: ReturnType<typeof expandDefinition>['loads']) => loads.reduce((t, l) => {
  if (l.type !== 'distributed3d') return t;
  const d = l.data; const len = (d.b ?? 0) - (d.a ?? 0) || 0;
  return t + (len > 0 ? -(d.qZI + d.qZJ) / 2 * len : 0);
}, 0);

describe('a floor-load definition', () => {
  beforeEach(() => { modelStore.clear(); });

  it('on a level, two way: q times the bay, as member loads marked with it', () => {
    const { caseId } = bay();
    const def: FloorLoadDef = { caseId, q: 2, target: { by: 'level', z: 3 }, distribution: 'twoWay' };
    const e = expandDefinition(m(), def, {}, 9, { leftHand: false });
    expect(e.totalKN).toBeCloseTo(96, 6);
    expect(e.loads.every((l) => (l.data as { fromDef?: number }).fromDef === 9 && l.data.caseId === caseId)).toBe(true);
  });

  it('in a zone with an opening: only the zone less the opening', () => {
    const { caseId, n } = bay();
    const zone = addLoadZone('left', [n[0]!, modelStore.addNode(4, 0, 3), modelStore.addNode(4, 6, 3), n[3]!]);
    const open = addLoadZone('hole', [modelStore.addNode(1, 2, 3), modelStore.addNode(3, 2, 3), modelStore.addNode(3, 4, 3), modelStore.addNode(1, 4, 3)]);
    modelStore.setGroupData(zone, { openings: [open] });
    const def: FloorLoadDef = { caseId, q: 1, target: { by: 'zone', zoneId: zone }, distribution: 'twoWay' };
    const e = expandDefinition(m(), def, {}, 1, { leftHand: false });
    expect(e.result?.loadedArea).toBeCloseTo(24 - 4, 6);
  });

  it('onto the slab: a surface load on each shell, limited to the zone', () => {
    const { caseId, quad } = bay();
    const def: FloorLoadDef = { caseId, q: 3, target: { by: 'level', z: 3 }, distribution: 'slab' };
    const e = expandDefinition(m(), def, {}, 2, { leftHand: false });
    expect(e.loads).toEqual([{ type: 'surface3d', data: { id: 0, quadId: quad, q: 3, caseId, fromDef: 2 } }]);
  });

  it('in a box of coordinates', () => {
    const { caseId } = bay();
    const none = expandDefinition(m(), { caseId, q: 1, target: { by: 'range', z: [10, 12] }, distribution: 'twoWay' }, {}, 3, { leftHand: false });
    expect(none.problem).toBe('nothingTargeted');
    const all = expandDefinition(m(), { caseId, q: 1, target: { by: 'range', x: [-1, 9], z: [2, 4] }, distribution: 'twoWay' }, {}, 3, { leftHand: false });
    expect(all.totalKN).toBeCloseTo(48, 6);
  });
});

describe('its loads follow the model', () => {
  beforeEach(() => { modelStore.clear(); });

  it('are written with it, kept current, rewritten when a node moves, undone in one step', () => {
    const { caseId, n } = bay();
    const before = modelStore.loads.length;
    const id = addFloorLoadDef('L floor', { caseId, q: 2, target: { by: 'level', z: 3 }, distribution: 'twoWay' });
    const written = modelStore.loads.length;
    expect(written).toBeGreaterThan(before);
    expect(syncDefinedLoads()).toBeNull();
    expect(definitionsCurrent(modelStore.loads, expandAll(m(), { leftHand: false }))).toBe(true);
    // The bay grows to 10 m: the loads are rewritten for 60 m².
    modelStore.updateNode(n[1]!, 10, 0, 3);
    modelStore.updateNode(n[2]!, 10, 6, 3);
    expect(definitionsCurrent(modelStore.loads, expandAll(m(), { leftHand: false }))).toBe(false);
    expect(syncDefinedLoads()).toBeGreaterThan(0);
    const sum = modelStore.loads.filter((l) => l.type === 'distributed3d').reduce((t, l) => t + total([l]), 0);
    expect(sum).toBeCloseTo(120, 6);
    // Removing it takes its loads.
    removeFloorLoadDef(id);
    expect(modelStore.loads.filter((l) => (l.data as { fromDef?: number }).fromDef !== undefined)).toHaveLength(0);
    historyStore.undo();
    expect(modelStore.loads.some((l) => (l.data as { fromDef?: number }).fromDef === id)).toBe(true);
  });
});

const defLoads = () => modelStore.loads.filter((l) => (l.data as { fromDef?: number }).fromDef !== undefined);

describe('zones', () => {
  beforeEach(() => { modelStore.clear(); });

  it('an opening two zones share is an opening of each', () => {
    // A lists B and C as openings, and B lists C too. One set of the zones seen was shared by the
    // siblings, so walking B marked C and A's own opening C was skipped.
    const { n } = bay();
    const sq = (x: number, y: number) => [modelStore.addNode(x, y, 3), modelStore.addNode(x + 1, y, 3), modelStore.addNode(x + 1, y + 1, 3), modelStore.addNode(x, y + 1, 3)];
    const c = addLoadZone('C', sq(5, 1));
    const b = addLoadZone('B', sq(1, 1), [], [c]);
    const a = addLoadZone('A', n, [], [b, c]);
    expect(zoneOutline(m(), a)!.holes).toHaveLength(2);
    // A ring of openings still ends.
    modelStore.setGroupData(c, { openings: [a] });
    expect(zoneOutline(m(), a)!.holes).toHaveLength(2);
  });

  it('a slab load on a zone is written only on the shells it reaches', () => {
    // Four 2 × 2 m quads; the zone covers the left two. Every shell of the zone's plane was given a
    // load, the two outside it with nothing on them.
    modelStore.clear();
    const g = new Map<string, number>();
    for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) g.set(`${i},${j}`, modelStore.addNode(2 * i, 2 * j, 3));
    const at = (i: number, j: number) => g.get(`${i},${j}`)!;
    const quads: number[] = [];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) quads.push(modelStore.addQuad([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)], 1, 0.2));
    const caseId = modelStore.addLoadCase('L', 'L');
    const zone = addLoadZone('left', [at(0, 0), at(1, 0), at(1, 2), at(0, 2)]);
    const e = expandDefinition(m(), { caseId, q: 2, target: { by: 'zone', zoneId: zone }, distribution: 'slab' }, {}, 1, { leftHand: false });
    expect(e.loads.map((l) => (l.data as { quadId: number }).quadId).sort()).toEqual([quads[0], quads[1]].sort());
  });

  it('refuses an outline picked out of order, and says the area less its openings', () => {
    const { n } = bay();
    // 0,0 → 8,6 → 8,0 → 0,6 crosses itself.
    const crossed = [n[0]!, n[2]!, n[1]!, n[3]!];
    expect(zoneOutlineProblem(m(), crossed)).toBe('selfIntersecting');
    const groups = modelStore.model.groups.size;
    expect(addLoadZone('bow tie', crossed)).toBe(-1);
    expect(modelStore.model.groups.size).toBe(groups);
    expect(zoneOutlineProblem(m(), n.slice(0, 2))).toBe('needNodes');
    expect(zoneOutlineProblem(m(), n)).toBeNull();
    const hole = addLoadZone('hole', [modelStore.addNode(1, 1, 3), modelStore.addNode(3, 1, 3), modelStore.addNode(3, 3, 3), modelStore.addNode(1, 3, 3)]);
    const zone = addLoadZone('all', n, [], [hole]);
    expect(zoneArea(m(), zone)).toBeCloseTo(48 - 4, 9);
  });

  it('removed: other zones lose it as an opening, and the loads follow', () => {
    const { n, caseId } = bay();
    const hole = addLoadZone('hole', [modelStore.addNode(1, 1, 3), modelStore.addNode(3, 1, 3), modelStore.addNode(3, 3, 3), modelStore.addNode(1, 3, 3)]);
    const zone = addLoadZone('all', n, [], [hole]);
    addFloorLoadDef('L', { caseId, q: 1, target: { by: 'zone', zoneId: zone }, distribution: 'twoWay' });
    removeLoadZone(hole);
    expect((modelStore.model.groups.get(zone)!.data as { openings?: number[] } | undefined)?.openings ?? []).toEqual([]);
    expect(definitionsCurrent(modelStore.loads, expandAll(m(), { leftHand: false }))).toBe(true);
  });

  it('a corner node deleted is flagged: the outline is not the one drawn', () => {
    const { n } = bay();
    const extra = modelStore.addNode(4, -1, 3);
    const zone = addLoadZone('five', [n[0]!, extra, n[1]!, n[2]!, n[3]!]);
    expect(zoneChanged(m(), zone)).toBe(false);
    modelStore.removeNode(extra);
    expect(zoneChanged(m(), zone)).toBe(true);
  });
});

describe('a box of coordinates', () => {
  it('with a bound unreadable or given on one side only, is refused, not widened', () => {
    const blank = { x0: '', x1: '', y0: '', y1: '', z0: '', z1: '' };
    expect(rangeTarget({ ...blank, z0: '2', z1: '4' })).toEqual({ by: 'range', z: [2, 4] });
    expect(rangeTarget({ ...blank, x0: '1', z0: '2', z1: '4' })).toBeNull();
    expect(rangeTarget({ ...blank, x0: 'a', x1: '3' })).toBeNull();
    expect(rangeTarget(blank)).toEqual({ by: 'range' });
  });
});

describe('copies of what a definition loads', () => {
  beforeEach(() => { modelStore.clear(); });

  it('carry its loads as plain loads, which the next rewrite leaves', () => {
    const { n, beams, caseId } = bay();
    addFloorLoadDef('L', { caseId, q: 2, target: { by: 'level', z: 3 }, distribution: 'twoWay' });
    const r = copyTransformed({ nodes: n, elements: beams }, [translation([0, 0, 3])], { withLoads: true });
    const copied = new Set(r.elements);
    const onCopies = () => modelStore.loads.filter((l) => copied.has((l.data as { elementId?: number }).elementId ?? -1));
    expect(onCopies().length).toBeGreaterThan(0);
    expect(onCopies().every((l) => (l.data as { fromDef?: number }).fromDef === undefined)).toBe(true);
    syncDefinedLoads();
    expect(onCopies().length).toBeGreaterThan(0);
  });

  it('a definition copied with what it loads writes the copy, without a second set', () => {
    const { beams, caseId } = bay();
    addFloorLoadDef('own', { caseId, q: 2, target: { by: 'own' }, distribution: 'twoWay' }, { elements: beams });
    const ends = [...new Set(beams.flatMap((id) => { const e = modelStore.elements.get(id)!; return [e.nodeI, e.nodeJ]; }))];
    const r = copyTransformed({ nodes: ends, elements: beams }, [translation([0, 0, 3])], { withLoads: true });
    syncDefinedLoads();
    const copied = new Set(r.elements);
    const sum = modelStore.loads.filter((l) => l.type === 'distributed3d' && copied.has(l.data.elementId)).reduce((t, l) => t + total([l]), 0);
    expect(sum).toBeCloseTo(96, 6);
  });

  it('a case duplicated takes them as plain loads too', () => {
    const { caseId } = bay();
    addFloorLoadDef('L', { caseId, q: 2, target: { by: 'level', z: 3 }, distribution: 'twoWay' });
    const dup = duplicateCase(caseId, 'L copy')!;
    const inDup = () => modelStore.loads.filter((l) => l.data.caseId === dup);
    expect(inDup().length).toBeGreaterThan(0);
    syncDefinedLoads();
    expect(inDup().length).toBeGreaterThan(0);
    expect(inDup().every((l) => (l.data as { fromDef?: number }).fromDef === undefined)).toBe(true);
  });
});

describe('a floor moved as a whole', () => {
  beforeEach(() => { modelStore.clear(); });

  it('takes the level and the box its definitions name with it', () => {
    const { n, beams, caseId } = bay();
    const level = addFloorLoadDef('level', { caseId, q: 2, target: { by: 'level', z: 3 }, distribution: 'twoWay' });
    const box = addFloorLoadDef('box', { caseId, q: 1, target: { by: 'range', x: [-1, 9], z: [2, 4] }, distribution: 'twoWay' });
    const all = [...modelStore.nodes.keys()];
    transformInPlace({ nodes: all, elements: beams }, translation([0, 0, 0.5]));
    expect((modelStore.model.groups.get(level)!.data as unknown as FloorLoadDef).target).toEqual({ by: 'level', z: 3.5 });
    expect((modelStore.model.groups.get(box)!.data as unknown as FloorLoadDef).target).toEqual({ by: 'range', x: [-1, 9], z: [2.5, 4.5] });
    syncDefinedLoads();
    const sum = modelStore.loads.filter((l) => l.type === 'distributed3d').reduce((t, l) => t + total([l]), 0);
    expect(sum).toBeCloseTo(96 + 48, 6);
    expect(expandAll(m(), { leftHand: false }).every((e) => !e.problem)).toBe(true);
    // Part of it moved is no longer the floor: the level stays.
    transformInPlace({ nodes: [n[0]!], elements: [] }, translation([0, 0, 1]));
    expect((modelStore.model.groups.get(level)!.data as unknown as FloorLoadDef).target).toEqual({ by: 'level', z: 3.5 });
  });
});

describe('loads a definition wrote', () => {
  beforeEach(() => { modelStore.clear(); });

  it('are its alone: the store will not edit, move, scale or remove one', () => {
    const { caseId } = bay();
    addFloorLoadDef('L', { caseId, q: 2, target: { by: 'level', z: 3 }, distribution: 'twoWay' });
    const l = defLoads()[0]!;
    expect(isDefinedLoad(l)).toBe(true);
    const before = JSON.stringify(modelStore.loads);
    expect(modelStore.updateLoad(l.data.id, { qZI: -99 })).toBe(false);
    modelStore.removeLoad(l.data.id);
    modelStore.updateLoadCaseId(l.data.id, 1);
    removeLoads([l.data.id]);
    scaleLoads([l.data.id], 3);
    moveLoadsToCase([l.data.id], 1);
    expect(JSON.stringify(modelStore.loads)).toBe(before);
    // A rewrite still replaces them.
    modelStore.updateNode(modelStore.elements.get((l.data as { elementId: number }).elementId)!.nodeJ, 9, 0, 3);
    expect(syncDefinedLoads()).toBeGreaterThan(0);
  });
});
