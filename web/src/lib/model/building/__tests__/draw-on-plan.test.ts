import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import '../../../store/index';
import { physicalGroups } from '../../../store/physical';
import { planHalf } from '../build-on-grid';
import {
  beamAxis, beamFromFaces, columnSnapPoints, footprintAt, footprintFromCorners, footprintFromSide,
  placeBeamOnPlan, placeColumnOnPlan,
} from '../draw-on-plan';
import { computeLocalAxes3D } from '../../../engine/local-axes-3d';
import type { Level } from '../../grid';

const levels: Level[] = [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }, { id: 'N2', name: 'P2', z: 6 }];
const column = (x: number, y: number, b = 0.3, h = 0.3) =>
  placeColumnOnPlan({ footprint: footprintAt({ x, y }, b, h, 0, [0, 0]), fixedPoint: [0, 0], levels, levelFrom: 'N0', levelTo: 'N1', materialId: 1 });
const beam = (a: { x: number; y: number }, b: { x: number; y: number }, o: { width?: number; height?: number; topFlush?: boolean } = {}) =>
  placeBeamOnPlan({ a, b, width: o.width ?? 0.2, height: o.height ?? 0.5, level: levels[1]!, materialId: 1, ...(o.topFlush ? { topFlush: true } : {}) });
const nodeOf = (id: number) => modelStore.nodes.get(id)!;
const ends = (id: number) => { const e = modelStore.elements.get(id)!; return [nodeOf(e.nodeI), nodeOf(e.nodeJ)]; };

describe('a column drawn on the plan', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('from two corners: its section, its nodes on the centre of what was drawn at every level with no offset, in one undo step', () => {
    const r = placeColumnOnPlan({ footprint: footprintFromCorners({ x: 0, y: 0 }, { x: 0.4, y: 0.3 }), fixedPoint: [-1, -1], levels, levelFrom: 'N0', levelTo: 'N2', materialId: 1, fixBase: true, typology: 'concrete' });
    expect(r.created).toBe(1);
    expect(r.bars).toHaveLength(2);
    for (const id of r.bars) {
      const e = modelStore.elements.get(id)!;
      expect(ends(id).map((n) => [n.x, n.y])).toEqual([[0.2, 0.15], [0.2, 0.15]]);
      expect(e.offset).toBeUndefined();
      const [hx, hy] = planHalf(id)!;
      expect(hx).toBeCloseTo(0.2, 9);
      expect(hy).toBeCloseTo(0.15, 9);
    }
    expect([...modelStore.supports.values()].map((s) => nodeOf(s.nodeId).z ?? 0)).toEqual([0]);
    const [g] = physicalGroups();
    expect(g!.physical).toMatchObject({ kind: 'column', levelFrom: 'N0', levelTo: 'N2', fixedPoint: [-1, -1], typology: 'concrete' });
    historyStore.undo();
    expect([modelStore.elements.size, modelStore.nodes.size, physicalGroups().length]).toEqual([0, 0, 0]);
  });

  it('standing on a column of another section, it takes that column\'s node and is offset from it, so the two are joined', () => {
    placeColumnOnPlan({ footprint: footprintFromCorners({ x: 0, y: 0 }, { x: 0.4, y: 0.4 }), fixedPoint: [-1, -1], levels, levelFrom: 'N0', levelTo: 'N1', materialId: 1 });
    const r = placeColumnOnPlan({ footprint: footprintFromCorners({ x: 0, y: 0 }, { x: 0.3, y: 0.3 }), fixedPoint: [-1, -1], levels, levelFrom: 'N1', levelTo: 'N2', materialId: 1 });
    const e = modelStore.elements.get(r.bars[0]!)!;
    expect(ends(r.bars[0]!).map((n) => [n.x, n.y, n.z])).toEqual([[0.2, 0.2, 3], [0.15, 0.15, 6]]);
    expect(e.offset?.i?.x).toBeCloseTo(-0.05, 9);
    expect(e.offset?.i?.y).toBeCloseTo(-0.05, 9);
    expect(Math.hypot(e.offset!.j!.x, e.offset!.j!.y)).toBe(0);
  });

  it('turned: its section lies on the footprint drawn, b along its local y', () => {
    const f = footprintFromSide({ x: 0, y: 0 }, { x: 0.5 * Math.cos(Math.PI / 6), y: 0.5 * Math.sin(Math.PI / 6) }, { x: -0.1, y: 0.3 })!;
    expect(f.b).toBeCloseTo(0.5, 9);
    const r = placeColumnOnPlan({ footprint: f, fixedPoint: [0, 0], levels, levelFrom: 'N0', levelTo: 'N1', materialId: 1 });
    const e = modelStore.elements.get(r.bars[0]!)!;
    const [a, b] = ends(e.id);
    const ax = computeLocalAxes3D({ id: 1, x: a.x, y: a.y, z: a.z ?? 0 }, { id: 2, x: b.x, y: b.y, z: b.z ?? 0 }, undefined, e.rollAngle);
    const sec = modelStore.sections.get(e.sectionId)!;
    const along = (d: { x: number; y: number }) => Math.abs(ax.ey[0] * d.x + ax.ey[1] * d.y) * sec.b! + Math.abs(ax.ez[0] * d.x + ax.ez[1] * d.y) * sec.h!;
    expect(along(f.u)).toBeCloseTo(0.5, 9);
    expect(along(f.v)).toBeCloseTo(Math.round(f.h * 100) / 100, 9);
  });

  it('on a stack already declared, adds nothing', () => {
    column(0, 0);
    const r = column(0, 0);
    expect(r.created).toBe(0);
    expect(modelStore.elements.size).toBe(1);
  });

  it('is fixed at its base only when it starts on the lowest level', () => {
    placeColumnOnPlan({ footprint: footprintAt({ x: 0, y: 0 }, 0.3, 0.3, 0, [0, 0]), fixedPoint: [0, 0], levels, levelFrom: 'N1', levelTo: 'N2', materialId: 1, fixBase: true });
    expect(modelStore.supports.size).toBe(0);
    placeColumnOnPlan({ footprint: footprintAt({ x: 0, y: 0 }, 0.3, 0.3, 0, [0, 0]), fixedPoint: [0, 0], levels, levelFrom: 'N0', levelTo: 'N1', materialId: 1, fixBase: true });
    expect([...modelStore.supports.values()].map((s) => nodeOf(s.nodeId).z ?? 0)).toEqual([0]);
  });

  it('declared over the storeys it adds, not the ones another column already holds', () => {
    column(0, 0);
    const r = placeColumnOnPlan({ footprint: footprintAt({ x: 0, y: 0 }, 0.3, 0.3, 0, [0, 0]), fixedPoint: [0, 0], levels, levelFrom: 'N0', levelTo: 'N2', materialId: 1 });
    expect(r.bars).toHaveLength(1);
    expect(physicalGroups().find((g) => g.id === r.groupId)!.physical).toMatchObject({ levelFrom: 'N1', levelTo: 'N2' });
  });

  it('with a section of the model, keeps it', () => {
    const r = placeColumnOnPlan({ footprint: footprintAt({ x: 0, y: 0 }, 0.2, 0.2, 0, [0, 0]), fixedPoint: [0, 0], levels, levelFrom: 'N0', levelTo: 'N1', materialId: 1, sectionId: 1 });
    expect(modelStore.elements.get(r.bars[0]!)!.sectionId).toBe(1);
  });

  it('refuses one level, or no size', () => {
    expect(placeColumnOnPlan({ footprint: footprintAt({ x: 0, y: 0 }, 0.3, 0.3, 0, [0, 0]), fixedPoint: [0, 0], levels, levelFrom: 'N1', levelTo: 'N1', materialId: 1 }).refused).toBe('levels');
    expect(placeColumnOnPlan({ footprint: footprintAt({ x: 0, y: 0 }, 0, 0.3, 0, [0, 0]), fixedPoint: [0, 0], levels, levelFrom: 'N0', levelTo: 'N1', materialId: 1 }).refused).toBe('size');
  });
});

describe('a beam drawn on the plan', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('frames into the columns its ends fall in, offset onto the line drawn, flush with their outer face', () => {
    const c0 = column(0, 0), c1 = column(6, 0);
    const top = (r: typeof c0) => ends(r.bars[0]!).find((n) => n.z === 3)!.id;
    const axis = beamAxis({ x: -0.15, y: -0.15 }, { x: 6.15, y: -0.15 }, 0.2, 1);
    expect(axis.a.y).toBeCloseTo(-0.05, 12);
    const r = beam(axis.a, axis.b, { topFlush: true });
    expect(r.bars).toHaveLength(1);
    const e = modelStore.elements.get(r.bars[0]!)!;
    expect([e.nodeI, e.nodeJ]).toEqual([top(c0), top(c1)]);
    expect(e.offset!.i).toEqual({ x: expect.closeTo(-0.15, 9), y: expect.closeTo(-0.05, 9), z: -0.25 });
    expect(e.offset!.j).toEqual({ x: expect.closeTo(0.15, 9), y: expect.closeTo(-0.05, 9), z: -0.25 });
    const sec = modelStore.sections.get(e.sectionId)!;
    expect([sec.b, sec.h]).toEqual([0.2, 0.5]);
    expect(physicalGroups().filter((g) => g.physical.kind === 'beam')[0]!.physical).toMatchObject({ levelFrom: 'N1', levelTo: 'N1' });
  });

  it('is cut at a column it crosses', () => {
    column(0, 0); column(3, 0.05); column(6, 0);
    const r = beam({ x: 0, y: 0 }, { x: 6, y: 0 });
    expect(r.bars).toHaveLength(2);
    expect(modelStore.elements.get(r.bars[0]!)!.offset!.j).toEqual({ x: 0, y: expect.closeTo(-0.05, 9), z: 0 });
  });

  it('meeting another beam at its middle, cuts it there', () => {
    beam({ x: 0, y: 0 }, { x: 6, y: 0 });
    const r = beam({ x: 3, y: 0 }, { x: 3, y: 4 });
    expect(r.bars).toHaveLength(1);
    expect(modelStore.elements.size).toBe(3);
    const at = ends(r.bars[0]!)[0]!;
    expect([...modelStore.elements.values()].filter((e) => e.nodeI === at.id || e.nodeJ === at.id)).toHaveLength(3);
  });

  it('ending on another beam drawn off its nodes, joins it on its own line and cuts it there', () => {
    column(0, 0); column(6, 0);
    beam({ x: -0.15, y: -0.05 }, { x: 6.15, y: -0.05 });
    const r = beam({ x: 3, y: -0.05 }, { x: 3, y: 4 });
    expect(modelStore.elements.size).toBe(2 + 3);
    const e = modelStore.elements.get(r.bars[0]!)!;
    const at = nodeOf(e.nodeI);
    expect([at.x, at.y, at.z]).toEqual([expect.closeTo(3, 9), expect.closeTo(0, 9), 3]);
    expect(e.offset!.i).toEqual({ x: expect.closeTo(0, 9), y: expect.closeTo(-0.05, 9), z: 0 });
    expect([...modelStore.elements.values()].filter((b) => b.nodeI === at.id || b.nodeJ === at.id)).toHaveLength(3);
  });

  it('crossing another beam, both are cut at the crossing and share its node', () => {
    beam({ x: 0, y: 2 }, { x: 6, y: 2 });
    const r = beam({ x: 3, y: 0 }, { x: 3, y: 4 });
    expect(r.bars).toHaveLength(2);
    expect(modelStore.elements.size).toBe(4);
    const shared = [...modelStore.nodes.values()].find((n) => Math.hypot(n.x - 3, n.y - 2) < 1e-9 && n.z === 3)!;
    expect([...modelStore.elements.values()].filter((b) => b.nodeI === shared.id || b.nodeJ === shared.id)).toHaveLength(4);
  });

  it('does not frame into a vertical bar declared as something else', () => {
    const a = modelStore.addNode(2, 0, 0), b = modelStore.addNode(2, 0, 3);
    const id = modelStore.addElement(a, b);
    modelStore.updateElement(id, { sectionId: 1 });
    modelStore.addGroup('D1', 'physicalMember', { elements: [id] }, { origin: 'user', data: { kind: 'brace', provenance: 'declared' } });
    expect(columnSnapPoints(3)).toEqual([]);
  });

  it('from its two faces: the axis between them and the width', () => {
    const f = beamFromFaces({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 2, y: 0.25 })!;
    expect(f.width).toBeCloseTo(0.25, 12);
    expect([f.a.y, f.b.y]).toEqual([0.125, 0.125]);
  });

  it('refuses a beam too short or with no width', () => {
    expect(beam({ x: 0, y: 0 }, { x: 0.01, y: 0 }).refused).toBe('length');
    expect(beam({ x: 0, y: 0 }, { x: 2, y: 0 }, { width: 0 }).refused).toBe('size');
  });
});

describe('snapping to the columns drawn', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('offers their corners, the middles of their faces and their centres on the level', () => {
    column(1, 1, 0.4, 0.2);
    const pts = columnSnapPoints(3);
    expect(pts.filter((p) => p.kind === 'corner').map((p) => [+p.x.toFixed(6), +p.y.toFixed(6)]).sort()).toEqual([[0.8, 0.9], [0.8, 1.1], [1.2, 0.9], [1.2, 1.1]]);
    expect(pts.filter((p) => p.kind === 'center')).toEqual([{ x: 1, y: 1, kind: 'center' }]);
    expect(columnSnapPoints(6)).toEqual([]);
  });
});
