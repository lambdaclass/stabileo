import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import '../../../store/index';
import { placeFrame, placeRamp, placeSlabs, placeWall } from '../build-on-grid';
import { physicalGroups } from '../../../store/physical';
import type { FrameBetweenAxes, StructuralGrid } from '../../grid';

const grid: StructuralGrid = {
  axes: [
    { id: 'A', name: 'A', axis: 'x', at: 0 }, { id: 'B', name: 'B', axis: 'x', at: 6 },
    { id: '1', name: '1', axis: 'y', at: 0 }, { id: '2', name: '2', axis: 'y', at: 5 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }, { id: 'N2', name: 'P2', z: 6 }],
};

const S = { sectionId: 1, materialId: 1 };
const frame = (levels: [string, string], parts: Partial<FrameBetweenAxes>): FrameBetweenAxes =>
  ({ x: ['A', 'B'], y: ['1', '2'], levels, columns: null, beamsX: null, beamsY: null, ...parts });

describe('a building on the grid', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('columns at every intersection, one element per stack, fixed at the base, in one undo step', () => {
    const r = placeFrame(grid, frame(['N0', 'N2'], { columns: S }), { fixBase: true, columnTypology: 'concrete' });
    expect(r).toMatchObject({ created: 4, elements: 8 });
    expect(modelStore.supports.size).toBe(4);
    const cols = physicalGroups().filter((g) => g.physical.kind === 'column');
    expect(cols).toHaveLength(4);
    expect(cols[0]!.physical).toMatchObject({ levelFrom: 'N0', levelTo: 'N2', typology: 'concrete' });
    expect(cols.every((c) => c.members.elements?.length === 2)).toBe(true);
    historyStore.undo();
    expect(modelStore.elements.size).toBe(0);
    expect(physicalGroups()).toHaveLength(0);
  });

  it('beams frame into the columns\' own nodes, one element per axis and level', () => {
    placeFrame(grid, frame(['N0', 'N2'], { columns: S }));
    const nodesBefore = modelStore.nodes.size;
    const r = placeFrame(grid, frame(['N0', 'N2'], { beamsX: S, beamsY: S }), { beamTypology: 'dropped' });
    expect(r).toMatchObject({ created: 8, elements: 8, nodes: 0 });
    expect(modelStore.nodes.size).toBe(nodesBefore);
    // Building the same frame again adds no bar and no second element.
    const again = placeFrame(grid, frame(['N0', 'N2'], { columns: S, beamsX: S, beamsY: S }));
    expect(again).toMatchObject({ created: 0, elements: 0, duplicates: 16 });
    expect(modelStore.elements.size).toBe(16);
    expect(physicalGroups()).toHaveLength(12);
  });

  it('nothing to lay out in the range is said', () => {
    expect(placeFrame(grid, frame(['N1', 'N1'], { columns: S })).refused).toBe('nothing');
  });

  it('a slab in the bay, meshed, cuts the beams at its edge nodes and the beam stays one element', () => {
    placeFrame(grid, frame(['N0', 'N1'], { columns: S, beamsX: S, beamsY: S }));
    const r = placeSlabs(grid, { levels: ['N1'], thickness: 0.15, materialId: 1, meshSize: 1, typology: 'solid' });
    expect(r.created).toBe(1);
    expect(r.shells).toBeGreaterThanOrEqual(30);
    const beams = physicalGroups().filter((g) => g.physical.kind === 'beam');
    expect(beams).toHaveLength(4);
    // Each beam now holds the pieces the slab cut it into.
    expect(beams.every((b) => (b.members.elements?.length ?? 0) > 1)).toBe(true);
  });

  it('a wall between two axes, one per storey', () => {
    const r = placeWall(grid, { axis: '1', from: 'A', to: 'B', levelFrom: 'N0', levelTo: 'N2', thickness: 0.2, materialId: 1, meshSize: 1 });
    expect(r.created).toBe(2);
    expect(physicalGroups().filter((g) => g.physical.kind === 'wall')).toHaveLength(2);
  });

  it('a wall with a window and a door: the window a hole, the door a notch, on every storey', () => {
    const r = placeWall(grid, {
      axis: '1', from: 'A', to: 'B', levelFrom: 'N0', levelTo: 'N2', thickness: 0.2, materialId: 1, meshSize: 0.5,
      openings: [{ offset: 0.5, width: 1, sill: 0, height: 2.1 }, { offset: 3, width: 1.5, sill: 0.9, height: 1.2 }],
    });
    expect(r.created).toBe(2);
    // No shell centre falls inside the window or the door of the ground storey.
    const centres = [...modelStore.quads.values(), ...modelStore.plates.values()].map((sh) => {
      const ps = sh.nodes.map((id) => modelStore.nodes.get(id)!);
      return [ps.reduce((a, p) => a + p.x, 0) / ps.length, ps.reduce((a, p) => a + (p.z ?? 0), 0) / ps.length];
    });
    expect(centres.some(([x, z]) => x > 3.05 && x < 4.45 && z > 0.95 && z < 2.05)).toBe(false);
    expect(centres.some(([x, z]) => x > 0.55 && x < 1.45 && z < 2.05)).toBe(false);
    // The panel's area is the wall's less its openings: 2 × (6 × 3 − 2.1 − 1.8).
    const area = (ids: number[]) => ids.reduce((acc, id) => {
      const sh = modelStore.quads.get(id) ?? modelStore.plates.get(id)!;
      const ps = sh.nodes.map((n) => modelStore.nodes.get(n)!);
      let a2 = 0;
      for (let i = 0; i < ps.length; i++) { const p = ps[i]!, q = ps[(i + 1) % ps.length]!; a2 += p.x * (q.z ?? 0) - q.x * (p.z ?? 0); }
      return acc + Math.abs(a2) / 2;
    }, 0);
    const walls = physicalGroups().filter((g) => g.physical.kind === 'wall');
    const total = walls.reduce((acc, w) => acc + area([...(w.members.quads ?? []), ...(w.members.plates ?? [])]), 0);
    expect(total).toBeCloseTo(2 * (18 - 2.1 - 1.8), 6);
  });

  it('an opening that does not fit refuses the wall', () => {
    const r = placeWall(grid, {
      axis: '1', from: 'A', to: 'B', levelFrom: 'N0', levelTo: 'N1', thickness: 0.2, materialId: 1, meshSize: 1,
      openings: [{ offset: 5.5, width: 1, sill: 0.9, height: 1 }],
    });
    expect(r).toMatchObject({ created: 0, refused: 'opening' });
    expect(modelStore.quads.size).toBe(0);
  });

  it('slabs fill whatever panels the beams close, and a ring of beams inside one stays open', () => {
    // An L of beams at +3 with a 1 × 1 well inside its long leg.
    const ring = (pts: Array<[number, number]>) => {
      const ids = pts.map(([x, y]) => modelStore.addNode(x, y, 3));
      return ids.map((id, k) => modelStore.addElement(id, ids[(k + 1) % ids.length]!));
    };
    ring([[0, 0], [6, 0], [6, 3], [3, 3], [3, 6], [0, 6]]);
    ring([[1, 1], [2, 1], [2, 2], [1, 2]]);
    const r = placeSlabs(grid, { levels: ['N1'], thickness: 0.15, materialId: 1, meshSize: 0.5, typology: 'solid' });
    expect(r.created).toBe(1);
    const centres = [...modelStore.quads.values(), ...modelStore.plates.values()].map((sh) => {
      const ps = sh.nodes.map((id) => modelStore.nodes.get(id)!);
      return [ps.reduce((a, p) => a + p.x, 0) / ps.length, ps.reduce((a, p) => a + p.y, 0) / ps.length];
    });
    expect(centres.some(([x, y]) => x > 1.05 && x < 1.95 && y > 1.05 && y < 1.95)).toBe(false);
    expect(centres.some(([x, y]) => x > 3.05 && y > 3.05)).toBe(false);
    // Placing it again adds nothing and says why.
    expect(placeSlabs(grid, { levels: ['N1'], thickness: 0.15, materialId: 1, meshSize: 0.5 })).toMatchObject({ created: 0, refused: 'occupied' });
  });
});

describe('copying a level to others', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('copies the floor and the storey below it, by kind, declared at the levels they land on', async () => {
    const { copyToLevels } = await import('../copy-levels');
    placeFrame(grid, frame(['N0', 'N1'], { columns: S, beamsX: S, beamsY: S }), { fixBase: true });
    placeSlabs(grid, { levels: ['N1'], thickness: 0.15, materialId: 1, meshSize: 1 });
    const before = physicalGroups().length; // 4 columns, 4 beams, 1 slab
    const r = copyToLevels(grid, { from: 'N1', to: ['N2'], kinds: ['column', 'beam', 'slab'] });
    expect(r).toEqual({ copied: before, levels: 1 });
    const atN2 = physicalGroups().filter((g) => g.physical.levelTo === 'N2');
    expect(atN2).toHaveLength(9);
    expect(atN2.filter((g) => g.physical.kind === 'column').every((g) => g.physical.levelFrom === 'N1')).toBe(true);
    expect(new Set(physicalGroups().map((g) => g.name)).size).toBe(physicalGroups().length);
    // Copying it again adds no element.
    const n = physicalGroups().length, bars = modelStore.elements.size;
    copyToLevels(grid, { from: 'N1', to: ['N2'], kinds: ['column', 'beam'] });
    expect(modelStore.elements.size).toBe(bars);
    expect(physicalGroups()).toHaveLength(n);
    historyStore.undo();
    expect(physicalGroups()).toHaveLength(n);
  });

  it('a kind filter copies only that kind', async () => {
    const { copyToLevels } = await import('../copy-levels');
    placeFrame(grid, frame(['N0', 'N1'], { columns: S, beamsX: S, beamsY: S }));
    expect(copyToLevels(grid, { from: 'N1', to: ['N2'], kinds: ['beam'] })).toEqual({ copied: 4, levels: 1 });
    expect(physicalGroups().filter((g) => g.physical.kind === 'column')).toHaveLength(4);
  });
});

describe('a ramp', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('rises across the bay from one level to the next and shares the beams\' nodes at both ends', () => {
    placeFrame(grid, frame(['N0', 'N1'], { columns: S, beamsX: S, beamsY: S }));
    const r = placeRamp(grid, { x: ['A', 'B'], y: ['1', '2'], levelLow: 'N0', levelHigh: 'N1', rises: 'x', thickness: 0.2, materialId: 1, meshSize: 1 });
    expect(r.created).toBe(1);
    const ramp = physicalGroups().find((g) => g.physical.typology === 'ramp')!;
    expect(ramp.physical).toMatchObject({ kind: 'slab', levelFrom: 'N0', levelTo: 'N1' });
    // Every shell node lies on the plane z = x / 2, and the beam at the top (x = 6, z = 3) was cut at them.
    for (const q of modelStore.quads.values()) for (const id of q.nodes) {
      const n = modelStore.nodes.get(id)!;
      expect(n.z ?? 0).toBeCloseTo(n.x / 2, 9);
    }
    const top = [...modelStore.elements.values()].filter((e) => [e.nodeI, e.nodeJ].every((id) => {
      const n = modelStore.nodes.get(id)!; return Math.abs(n.x - 6) < 1e-9 && Math.abs((n.z ?? 0) - 3) < 1e-9;
    }));
    expect(top.length).toBeGreaterThan(1);
  });
});

describe('fixed point and alignment', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('a column held by its corner is offset by half its footprint, which turns with the section', () => {
    const off = (angle: number) => {
      modelStore.clear();
      const id = modelStore.addSection({ name: '30×50', a: 0.15, iz: 0.003125, iy: 0.001125, b: 0.3, h: 0.5, shape: 'rect' } as never);
      placeFrame(grid, frame(['N0', 'N1'], { columns: { sectionId: id, materialId: 1 } }), { columnFixedPoint: [-1, -1], columnAngle: angle });
      return [...modelStore.elements.values()][0]!.offset!.i!;
    };
    const a = off(0), b = off(90);
    // Half of 0.30 one way and half of 0.50 the other, towards +X and +Y from the corner.
    expect(Math.min(a.x, a.y)).toBeCloseTo(0.15, 9);
    expect(Math.max(a.x, a.y)).toBeCloseTo(0.25, 9);
    expect(a.x).toBeGreaterThan(0); expect(a.y).toBeGreaterThan(0);
    expect(b.x).toBeCloseTo(a.y, 9); expect(b.y).toBeCloseTo(a.x, 9);
  });

  it('a beam along X aligned to one side is offset along Y by half its width plus the eccentricity', () => {
    const id = modelStore.addSection({ name: '20×50', a: 0.1, iz: 0.002, iy: 0.0003, b: 0.2, h: 0.5, shape: 'rect' } as never);
    placeFrame(grid, frame(['N0', 'N1'], { beamsX: { sectionId: id, materialId: 1 } }), { beamAlign: 1, beamEccentricity: 0.05 });
    for (const e of modelStore.elements.values()) expect(e.offset).toEqual({ frame: 'global', i: { x: 0, y: expect.closeTo(0.15, 9), z: 0 }, j: { x: 0, y: expect.closeTo(0.15, 9), z: 0 } });
  });
});
