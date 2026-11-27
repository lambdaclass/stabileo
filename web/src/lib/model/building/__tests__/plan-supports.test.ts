import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import '../../../store/index';
import { beamFromRect, footprintAt, placeBeamOnPlan, placeColumnOnPlan } from '../draw-on-plan';
import { placeWallOnPlan } from '../wall-on-plan';
import { beamEnds, clipToSupports, supportsAtLevel } from '../plan-supports';
import type { Level } from '../../grid';

const levels: Level[] = [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }];
const column = (x: number, y: number) =>
  placeColumnOnPlan({ footprint: footprintAt({ x, y }, 0.3, 0.3, 0, [0, 0]), fixedPoint: [0, 0], levels, levelFrom: 'N0', levelTo: 'N1', materialId: 1 });
const beam = (p: { x: number; y: number }, q: { x: number; y: number }) => {
  const l = beamFromRect(p, q)!;
  return placeBeamOnPlan({ a: l.a, b: l.b, width: l.width, height: 0.5, level: levels[1]!, materialId: 1 });
};
const at = (id: number) => { const n = modelStore.nodes.get(id)!; return [n.x, n.y, n.z ?? 0].map((v) => Math.round(v * 1e9) / 1e9); };
const barEnds = (id: number) => { const e = modelStore.elements.get(id)!; return [at(e.nodeI), at(e.nodeJ)]; };

describe('where a beam drawn on the plan frames in', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('an end a little short of a column reaches its face and frames into its node; the outline says which', () => {
    column(0, 0); column(6, 0);
    const e = beamEnds({ x: 0.3, y: 0 }, { x: 5.7, y: 0 }, supportsAtLevel(3));
    expect([e.start?.kind, e.end?.kind]).toEqual(['column', 'column']);
    expect([e.start?.name, e.end?.name]).toEqual(['C1', 'C2']);
    expect(e.a.x).toBeCloseTo(0.15, 6);
    expect(e.b.x).toBeCloseTo(5.85, 6);
    const r = beam({ x: 0.3, y: -0.1 }, { x: 5.7, y: 0.1 });
    expect(r.bars).toHaveLength(1);
    expect(barEnds(r.bars[0]!)).toEqual([[0, 0, 3], [6, 0, 3]]);
    expect(modelStore.elements.get(r.bars[0]!)!.offset).toMatchObject({ i: { x: expect.closeTo(0.15, 6) }, j: { x: expect.closeTo(-0.15, 6) } });
  });

  it('an end too far from anything stays free', () => {
    column(0, 0);
    const e = beamEnds({ x: 0.6, y: 0 }, { x: 4, y: 0 }, supportsAtLevel(3));
    expect([e.start, e.end]).toEqual([null, null]);
  });

  it('a beam drawn to the face of another frames into it there, splitting it', () => {
    column(0, 0); column(6, 0); column(0, 5); column(6, 5);
    beam({ x: 0.15, y: -0.1 }, { x: 5.85, y: 0.1 });
    beam({ x: 0.15, y: 4.9 }, { x: 5.85, y: 5.1 });
    const before = modelStore.elements.size;
    const r = beam({ x: 2.9, y: 0.1 }, { x: 3.1, y: 4.9 });
    expect(r.bars).toHaveLength(1);
    expect(barEnds(r.bars[0]!), 'on the two beams, at their axes').toEqual([[3, 0, 3], [3, 5, 3]]);
    expect(modelStore.elements.size, 'each beam cut in two, plus the new one').toBe(before + 3);
  });

  it('frames into a wall at its nearest node on the level', () => {
    column(6, 0);
    const l = beamFromRect({ x: -0.1, y: -2 }, { x: 0.1, y: 2 })!;
    placeWallOnPlan({ a: l.a, b: l.b, thickness: 0.2, levels, levelFrom: 'N0', levelTo: 'N1', materialId: 1, meshSize: 1 });
    const r = beam({ x: 0.1, y: -0.1 }, { x: 5.85, y: 0.1 });
    expect(r.bars).toHaveLength(1);
    const [i, j] = barEnds(r.bars[0]!);
    expect(i![0], 'on the wall').toBeCloseTo(0, 9);
    expect(i![2]).toBe(3);
    expect(j).toEqual([6, 0, 3]);
  });

  it('a band captured across several columns is cut at the ones on each side of the click', () => {
    column(0, 0); column(5, 0); column(10, 0);
    const c = clipToSupports({ x: -0.15, y: 0 }, { x: 10.15, y: 0 }, { x: 7, y: 0 }, supportsAtLevel(3));
    expect(c.a.x).toBeCloseTo(5.15, 6);
    expect(c.b.x).toBeCloseTo(9.85, 6);
  });
});
