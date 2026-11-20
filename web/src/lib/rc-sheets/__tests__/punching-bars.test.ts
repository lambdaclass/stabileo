/**
 * A punching joint's stirrups as bars: the legs the plan rings, counted once in the bending
 * schedule and stood in the 3D view where the plan puts them, through the slab between its bars,
 * none past a free edge.
 */
import { describe, it, expect } from 'vitest';
import type { PunchingDemand, PunchingFigure } from '../punching-row';
import { rulesFor } from '../codes';
import { makeFmt } from '../format';
import { freeSides, punchingLegs } from '../punching-bars';
import { scheduleElements } from '../schedule/pieces';
import { punchingBars3d } from '../rebar-3d-punching';
import type { SlabJointForce } from '../slab-punching';

const f = makeFmt('.');
const P = (x: number, y: number) => ({ x, y, z: 3 });
const adjoining = [
  { elementId: 1, nodeIds: [1, 2, 5, 4], points: [P(0, 0), P(3, 0), P(3, 3), P(0, 3)] },
  { elementId: 2, nodeIds: [2, 3, 6, 5], points: [P(3, 0), P(6, 0), P(6, 3), P(3, 3)] },
  { elementId: 3, nodeIds: [5, 6, 9, 8], points: [P(3, 3), P(6, 3), P(6, 6), P(3, 6)] },
  { elementId: 4, nodeIds: [4, 5, 8, 7], points: [P(0, 3), P(3, 3), P(3, 6), P(0, 6)] },
];
const force: SlabJointForce = { combinationId: 1, combinationName: 'U', axialBelow: 1250, axialAbove: 600, directlyDelivered: 0, unbalancedMomentX: 0, unbalancedMomentY: 0 };
const demand: PunchingDemand = {
  key: 'punching:1:0', name: 'C1', level: 'N1', thickness: 0.22, adjoining,
  joint: { nodeId: 5, at: { x: 3, y: 3 }, columnElementId: 101, b: 0.4, h: 0.4, elementBelow: 101, elementAbove: 102, forces: [force] },
};
const ctx = { fc: 25, fy: 420, cover: 0.025, topBarDia: 12 };
const o = { code: 'cirsoc201-2025' as const, slabCover: 0.025 };

describe('a punching joint\'s stirrups as bars', () => {
  const row = rulesFor('cirsoc201-2025').punchingRow(demand, ctx, f);
  const fig = row.figure!, s = fig.reinforcement!;

  it('rings the column with every line\'s legs, s/2 + i·s from its faces, and the schedule and the 3D view take the same legs', () => {
    expect(s.overCeiling).toBe(false);
    const legs = punchingLegs(fig);
    expect(legs.length).toBe(s.lines * s.legs);
    const rings = Array.from({ length: s.lines }, (_, i) => s.spacing / 2 + i * s.spacing);
    for (const [x, y] of legs) expect(rings.some((r) => Math.abs(Math.max(Math.abs(x) - fig.b / 2, Math.abs(y) - fig.h / 2) - r) < 1e-9)).toBe(true);
    for (const r of rings) expect(legs.filter(([x, y]) => Math.abs(Math.max(Math.abs(x) - fig.b / 2, Math.abs(y) - fig.h / 2) - r) < 1e-9).length).toBe(s.legs);

    const [el] = scheduleElements({ line: [], column: [], slab: [], wall: [], punching: [row] }, o);
    expect(el).toMatchObject({ key: row.key, family: 'punching', pieces: [{ kind: 'punchingLeg', count: legs.length }] });
    expect(el!.pieces[0]!.shape.dia).toBe(s.legDiameter);

    const bars = punchingBars3d(row, { o: [3, 3, 3], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, o, rulesFor(o.code).bends);
    expect(bars.length).toBe(legs.length);
    for (const b of bars) {
      const zs = b.segments.flat().map((p) => p[2]);
      expect(Math.min(...zs)).toBeGreaterThanOrEqual(3 - 0.11 - 1e-6);
      expect(Math.max(...zs)).toBeLessThanOrEqual(3 + 0.11 + 1e-6);
      expect(b).toMatchObject({ family: 'punching', kind: 'punchingLeg', element: row.key, level: 'N1' });
    }
  });

  it('leaves the free sides of an edge or corner joint without legs', () => {
    expect(freeSides({ position: 'edge', openBearingDeg: 0 })).toEqual(new Set(['px']));
    expect(freeSides({ position: 'corner', openBearingDeg: 45 })).toEqual(new Set(['px', 'py']));
    expect(freeSides({ position: 'interior', openBearingDeg: null })).toEqual(new Set());
    const edge: PunchingFigure = { ...fig, position: 'edge', openBearingDeg: 0 };
    const legs = punchingLegs(edge);
    expect(legs.length).toBe(s.lines * s.legs);
    expect(legs.every(([x]) => x <= fig.b / 2 + 1e-9)).toBe(true);
  });
});
