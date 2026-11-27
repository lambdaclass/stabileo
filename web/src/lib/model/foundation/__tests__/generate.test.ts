import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, resultsStore } from '../../../store';
import { placeFrame, placeWall } from '../../building/build-on-grid';
import { anchorsFor, combineFootings, placeFootings, placeFoundationBeams, proposeStraps, proposeTies, stripUnderWall, supportedNodes } from '../generate';
import { presizeModelFootings } from '../../../store/foundation-tools';
import { physicalGroups } from '../../../store/physical';
import type { StructuralGrid } from '../../grid';

// Three axes along X (0, 6, 12), two along Y (0, 5), one storey.
const grid: StructuralGrid = {
  axes: [
    { id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 6 }, { id: 'x2', name: '3', axis: 'x', at: 12 },
    { id: 'y0', name: 'A', axis: 'y', at: 0 }, { id: 'y1', name: 'B', axis: 'y', at: 5 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }],
};

function building() {
  modelStore.setGrid(grid);
  const sec = modelStore.addSection({ name: '40×40', a: 0.16, iz: 0.00213, iy: 0.00213, b: 0.4, h: 0.4, shape: 'rect' } as never);
  placeFrame(grid, { x: ['x0', 'x2'], y: ['y0', 'y1'], levels: ['N0', 'N1'], columns: { sectionId: sec, materialId: 1 }, beamsX: null, beamsY: null }, { fixBase: true });
  const soil = modelStore.addSoilProfile('Arena');
  modelStore.updateSoilProfile(soil, { bearing: { kind: 'allowablePressure', allowableBearingKPa: 200 } });
  modelStore.setDefaultSoilProfile(soil);
  // Service reactions: 400 dead and 200 live at every base.
  const res = (fz: number) => ({
    displacements: [], elementForces: [], quadStresses: [],
    reactions: supportedNodes().all.map((nodeId) => ({ nodeId, fx: 0, fy: 0, fz, mx: 0, my: 0, mz: 0 })),
  }) as never;
  resultsStore.setCombinationResults3D(new Map([[1, res(-400)], [2, res(-200)]]), new Map([[1, res(-900)]]), {} as never);
  return { soil };
}

describe('foundations in the model', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); resultsStore.clear(); });

  it('footings under every support, held at the property line, sized from the reactions, in foundation undo steps', () => {
    building();
    const { bare } = supportedNodes();
    expect(bare).toHaveLength(6);
    const anchors = anchorsFor(bare, { minX: true });
    const ids = placeFootings(bare, { kind: 'isolated', thickness: 0.5, anchors });
    expect(ids).toHaveLength(6);
    expect([...modelStore.model.footings.values()].filter((f) => f.anchor?.[0] === -1)).toHaveLength(2);
    expect([...modelStore.model.footings.values()].every((f) => f.columnElementId !== undefined)).toBe(true);
    const out = presizeModelFootings();
    expect(out.every((o) => 'size' in o)).toBe(true);
    const inner = [...modelStore.model.footings.values()].find((f) => !f.anchor)!;
    // 600 / (200 − 12.5) = 3.2 m² → square 1.80 m round a 40 cm column.
    expect(inner).toMatchObject({ B: 1.8, L: 1.8, eccentricityB: 0 });
    const edge = [...modelStore.model.footings.values()].find((f) => f.anchor?.[0] === -1)!;
    expect(edge.eccentricityB).toBeCloseTo(edge.B / 2 - 0.2, 9);
    // The sizes undo as one step, and the footings stay.
    historyStore.undo();
    expect(modelStore.model.footings.get(inner.id)!.B).toBe(0);
    expect(modelStore.model.footings.size).toBe(6);
  });

  it('ties by distance and visibility, straps inwards from the property line', () => {
    building();
    const { bare } = supportedNodes();
    placeFootings(bare, { kind: 'isolated', thickness: 0.5, anchors: anchorsFor(bare, { minX: true }) });
    // Within 6.5 m: the four 6 m ties along X and the three 5 m ties along Y; the 7.8 m
    // diagonals are too far.
    const ties = proposeTies(6.5, 45);
    expect(ties).toHaveLength(7);
    // With 9 m and a wide visibility angle, the diagonals are seen past the ties already made.
    expect(proposeTies(9, 30).length).toBeGreaterThan(7);
    const straps = proposeStraps();
    expect(straps).toHaveLength(2);
    const sec = [...modelStore.sections.keys()][0]!;
    const before = modelStore.elements.size;
    expect(placeFoundationBeams([...straps, ...ties.filter((t) => !straps.some((s) => (s.a === t.a && s.b === t.b) || (s.a === t.b && s.b === t.a)))], { sectionId: sec, materialId: 1 })).toBe(7);
    expect(modelStore.elements.size).toBe(before + 7);
    expect(physicalGroups().filter((g) => g.physical.typology === 'strap')).toHaveLength(2);
    expect(physicalGroups().filter((g) => g.physical.typology === 'tie')).toHaveLength(5);
    // Each footing a strap leaves is balanced by it, toward the footing at its other end.
    for (const s of straps) {
      const f = [...modelStore.model.footings.values()].find((x) => x.nodeId === s.a)!;
      expect(f.straps!.map((x) => modelStore.model.footings.get(x.toFootingId)!.nodeId)).toContain(s.b);
    }
    // Proposed again, nothing new.
    expect(proposeTies(6.5, 45)).toHaveLength(0);
  });

  it('a combined footing on two columns, a strip under a wall', () => {
    building();
    const { bare } = supportedNodes();
    const [a, b] = bare;
    const id = combineFootings([a!, b!], 0.6)!;
    expect(modelStore.model.footings.get(id)).toMatchObject({ kind: 'combined', supportedNodeIds: [b] });
    const out = presizeModelFootings([id]);
    expect('size' in out[0]!).toBe(true);
    // A wall on axis B between 1 and 2, its base supported, on a strip.
    placeWall(grid, { axis: 'y1', from: 'x0', to: 'x1', levelFrom: 'N0', levelTo: 'N1', thickness: 0.2, materialId: 1, meshSize: 1 });
    const wall = physicalGroups().find((g) => g.physical.kind === 'wall')!;
    const strip = stripUnderWall(wall.id, 0.4)!;
    const f = modelStore.model.footings.get(strip)!;
    expect(f.kind).toBe('strip');
    expect(1 + (f.supportedNodeIds?.length ?? 0)).toBe(7); // 6 m at 1 m: 7 base nodes
    expect(f.rotationDeg).toBeCloseTo(0, 9);
  });
});

it('known wrong result: #1928 only the sheet generator uses a column face beyond the outer support axes', () => {
  modelStore.clear();
  const points = [[0.15, 0, 0.3], [0.25, 5, 0.5], [6, 2.5, 0.4]];
  const bases = points.map(([x, y, side]) => {
    const base = modelStore.addNode(x!, y!, 0);
    const top = modelStore.addNode(x!, y!, 3);
    const section = modelStore.addSection({ name: 'square', b: side, h: side, a: side! ** 2, iz: side! ** 4 / 12, iy: side! ** 4 / 12, shape: 'rect' });
    modelStore.updateElement(modelStore.addElement(base, top), { sectionId: section });
    return base;
  });
  expect([...anchorsFor(bases, { minX: true }).values()]).toEqual([[-1, 0], [__PUBLIC_FEATURES__.proRcSheets ? -1 : 0, 0], [0, 0]]);
  expect([...anchorsFor(bases, {}).values()]).toEqual([[0, 0], [0, 0], [0, 0]]);
  const nodes = [0, 0.0005, 0.001, 0.002].map(x => modelStore.addNode(x, 9, 0));
  expect([...anchorsFor(nodes, { minX: true }).values()]).toEqual([[-1, 0], [-1, 0], [0, 0], [0, 0]]);
});

it.each([false, true])('known wrong result: #1928 explicit wall foundation placement respects the available analytical base, meshed %s', async meshed => {
  modelStore.clear();
  const { createPlate, plateEntry, planPlateMesh, applyPlateMeshes } = await import('../../../store/physical-plates');
  const { supportWallBase, wallBaseNodes } = await import('../generate');
  const outline = [[0, 0], [4, 0], [4, 3], [0, 3]].map(([x, z]) => modelStore.addNode(x!, 0, z!));
  const wall = createPlate({ outline, thickness: 0.2, materialId: 1 });
  if ('problem' in wall) throw Error(wall.problem);
  if (meshed) expect(applyPlateMeshes([planPlateMesh(wall.id, { size: 1 })!]).refused).toEqual([]);
  const nodes = wallBaseNodes(wall.id);
  const active = meshed || __PUBLIC_FEATURES__.proPlatesUnified === true;
  expect(nodes.length > 0).toBe(active);
  if (meshed) expect(nodes.length).toBeGreaterThan(2);
  if (active) modelStore.addSupport(nodes[0]!, 'pinned3d');
  expect(supportWallBase(wall.id)).toBe(active ? nodes.length - 1 : 0);
  expect([...modelStore.supports.values()].map(s => [s.nodeId, s.type])).toEqual(nodes.map((n, i) => [n, i === 0 ? 'pinned3d' : 'fixed3d']));
  expect(plateEntry(wall.id)!.surface.edgeSupports?.length ?? 0).toBe(__PUBLIC_FEATURES__.proPlatesUnified ? 1 : 0);
  const strip = stripUnderWall(wall.id, 0.4);
  if (!active) expect(strip).toBeNull();
  else {
    const f = modelStore.model.footings.get(strip!)!;
    expect(new Set([f.nodeId, ...f.supportedNodeIds!])).toEqual(new Set(nodes));
  }
});

it.skip.each(['sync', 'async', 'foundation undo', 'renumber', 'reopen'] as const)('known wrong result: #1928 wall-linked strip sizing collects reactions at the current mesh through %s', async route => {
  modelStore.clear();
  historyStore.clear();
  resultsStore.clear();
  const { createPlate, planPlateMesh, applyPlateMeshes } = await import('../../../store/physical-plates');
  const { supportWallBase, wallBaseNodes } = await import('../generate');
  const outline = [[0, 0], [4, 0], [4, 3], [0, 3]].map(([x, z]) => modelStore.addNode(x!, 0, z!));
  const wall = createPlate({ outline, thickness: 0.2, materialId: 1 });
  if ('problem' in wall) throw Error(wall.problem);
  const mesh = (size: number) => expect(applyPlateMeshes([planPlateMesh(wall.id, { size })!]).refused).toEqual([]);
  mesh(4);
  supportWallBase(wall.id);
  const soil = modelStore.addSoilProfile('Arena');
  modelStore.updateSoilProfile(soil, { bearing: { kind: 'allowablePressure', allowableBearingKPa: 200 } });
  modelStore.setDefaultSoilProfile(soil);
  const id = stripUnderWall(wall.id, 0.4)!;
  const original = modelStore.model.footings.get(id)!;
  const originalIds = [original.nodeId, ...original.supportedNodeIds!];
  if (route === 'async') {
    const { applyPlateMeshesAsync } = await import('../../../store/physical-plates');
    expect((await applyPlateMeshesAsync([planPlateMesh(wall.id, { size: 1 })!])).refused).toEqual([]);
  } else mesh(1);
  supportWallBase(wall.id);
  let base = wallBaseNodes(wall.id);
  expect(base.length).toBeGreaterThan(originalIds.length);
  if (route === 'reopen') {
    const saved = modelStore.snapshot();
    const strip = saved.footings!.find(([n]) => n === id)![1];
    strip.supportedNodeIds = originalIds.filter(n => n !== strip.nodeId);
    modelStore.clear();
    modelStore.restore(saved);
  }
  if (route === 'foundation undo') {
    const snapshot = modelStore.snapshot();
    modelStore.removeFooting(id);
    modelStore.restoreFoundationOnly(snapshot);
  }
  if (route === 'renumber') {
    const { renumber } = await import('../../edit/renumber');
    expect(renumber({ nodes: true, members: false, order: 'xyz', start: 100 })).toHaveProperty('changedNodes');
    base = wallBaseNodes(wall.id);
  }
  const reactions = (fz: number) => ({
    displacements: [], elementForces: [], quadStresses: [],
    reactions: base.map(nodeId => ({ nodeId, fx: 0, fy: 0, fz, mx: 0, my: 0, mz: 0 })),
  }) as never;
  resultsStore.setCombinationResults3D(new Map([[1, reactions(-400)], [2, reactions(-200)]]), new Map([[1, reactions(-900)]]), {} as never);
  const current = presizeModelFootings([id]);
  const f = modelStore.model.footings.get(id)!;
  modelStore.updateFooting(id, { supportedNodeIds: base.filter(n => n !== f.nodeId) });
  const complete = presizeModelFootings([id]);
  expect(complete[0]).toHaveProperty('size');
  expect(current).toEqual(complete);
});

it.skip('known wrong result: #1928 renumbering keeps the second carried reaction and the strap endpoint on the same physical points', async () => {
  modelStore.clear();
  const nodes = [3, 2, 1].map(x => modelStore.addNode(x, 0, 0));
  const a = modelStore.addFooting(nodes[0]!);
  const b = modelStore.addFooting(nodes[1]!);
  modelStore.updateFooting(a, { kind: 'combined', supportedNodeIds: [nodes[2]!], straps: [{ toFootingId: b, nodeId: nodes[1]! }] });
  const { renumber } = await import('../../edit/renumber');
  expect(renumber({ nodes: true, members: false, order: 'xyz' })).toHaveProperty('changedNodes');
  const f = modelStore.footings.get(a)!;
  expect([f.nodeId, ...f.supportedNodeIds!, f.straps![0]!.nodeId!].map(id => modelStore.nodes.get(id)!.x)).toEqual([3, 1, 2]);
});
