/**
 * Floor loads kept as definitions and load zones: what they expand to, against the closed forms,
 * and their loads following the model when it moves under them.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import { addFloorLoadDef, addLoadZone, syncDefinedLoads, removeFloorLoadDef } from '../../../store/defined-loads';
import { expandDefinition, definitionsCurrent, expandAll, type DefinitionModel, type FloorLoadDef } from '../floor-definitions';

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
