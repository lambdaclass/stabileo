import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import '../../../store/index';
import { physicalGroups } from '../../../store/physical';
import { beamFromRect, footprintAt, placeColumnOnPlan } from '../draw-on-plan';
import { placeWallOnPlan } from '../wall-on-plan';
import { slabFraming } from '../slab-on-plan';
import type { Level } from '../../grid';

const levels: Level[] = [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }];
const column = (x: number, y: number) =>
  placeColumnOnPlan({ footprint: footprintAt({ x, y }, 0.3, 0.3, 0, [0, 0]), fixedPoint: [0, 0], levels, levelFrom: 'N0', levelTo: 'N1', materialId: 1, fixBase: true });
const wall = (p: { x: number; y: number }, q: { x: number; y: number }, o: { fixBase?: boolean } = {}) => {
  const l = beamFromRect(p, q)!;
  return placeWallOnPlan({ a: l.a, b: l.b, thickness: l.width, levels, levelFrom: 'N0', levelTo: 'N1', materialId: 1, meshSize: 1, fixBase: o.fixBase ?? true });
};

describe('a wall drawn on the plan', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('between two columns, reaches their lines, cuts them to share its mesh, holds its base and undoes in one step', () => {
    column(0, 0); column(6, 0);
    const supportsBefore = modelStore.supports.size;
    const r = wall({ x: 0.15, y: -0.1 }, { x: 5.85, y: 0.1 });
    expect(r.created).toBe(1);
    expect(r.shells).toBeGreaterThan(0);
    const g = physicalGroups().find((x) => x.physical.kind === 'wall')!;
    expect(g.physical).toMatchObject({ kind: 'wall', levelFrom: 'N0', levelTo: 'N1' });
    const nodes = new Set<number>();
    const m = modelStore.model.groups.get(g.id)!.members;
    for (const q of m.quads ?? []) for (const n of modelStore.quads.get(q)!.nodes) nodes.add(n);
    for (const q of m.plates ?? []) for (const n of modelStore.plates.get(q)!.nodes) nodes.add(n);
    const xs = [...nodes].map((n) => modelStore.nodes.get(n)!.x);
    expect([Math.min(...xs), Math.max(...xs)], 'from column line to column line').toEqual([0, 6]);
    const onColumn = [...modelStore.elements.values()].filter((e) => { const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!; return a.x === 0 && b.x === 0 && a.y === 0 && b.y === 0; });
    expect(onColumn.length, 'the column is cut where the mesh meets it').toBeGreaterThan(1);
    expect(modelStore.supports.size, 'its base is held').toBeGreaterThan(supportsBefore);
    historyStore.undo();
    expect(physicalGroups().some((x) => x.physical.kind === 'wall')).toBe(false);
  });

  it('carries a slab side along its top', () => {
    wall({ x: 0, y: -0.1 }, { x: 6, y: 0.1 }, { fixBase: false });
    expect(slabFraming([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 5 }, { x: 0, y: 5 }], 3)[0]!.support).toBe('wall');
  });

  it('refuses a wall with no length or no storey', () => {
    expect(placeWallOnPlan({ a: { x: 0, y: 0 }, b: { x: 0.05, y: 0 }, thickness: 0.2, levels, levelFrom: 'N0', levelTo: 'N1', materialId: 1, meshSize: 1 }).refused).toBe('size');
    expect(placeWallOnPlan({ a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, thickness: 0.2, levels, levelFrom: 'N1', levelTo: 'N1', materialId: 1, meshSize: 1 }).refused).toBe('levels');
  });
});
