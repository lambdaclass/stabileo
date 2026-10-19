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
