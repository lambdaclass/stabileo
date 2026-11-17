import { describe, it, expect } from 'vitest';
import type { PunchingDemand } from '../punching-row';
import { rulesFor } from '../codes';
import { punchingBeta } from '../ec2/punching-row';
import { makeFmt } from '../format';
import type { SlabJointForce } from '../slab-punching';

const f = makeFmt('.');
const P = (x: number, y: number) => ({ x, y, z: 3 });
const adjoining = [
  { elementId: 1, nodeIds: [1, 2, 5, 4], points: [P(0, 0), P(3, 0), P(3, 3), P(0, 3)] },
  { elementId: 2, nodeIds: [2, 3, 6, 5], points: [P(3, 0), P(6, 0), P(6, 3), P(3, 3)] },
  { elementId: 3, nodeIds: [5, 6, 9, 8], points: [P(3, 3), P(6, 3), P(6, 6), P(3, 6)] },
  { elementId: 4, nodeIds: [4, 5, 8, 7], points: [P(0, 3), P(3, 3), P(3, 6), P(0, 6)] },
];
const force = (o: Partial<SlabJointForce> = {}): SlabJointForce => ({ combinationId: 1, combinationName: 'ok', axialBelow: 900, axialAbove: 600, directlyDelivered: 0, unbalancedMomentX: 0, unbalancedMomentY: 0, ...o });
const demand = (forces: SlabJointForce[]): PunchingDemand => ({
  key: 'punching:1:0', name: 'C1', level: 'N1', thickness: 0.22, adjoining,
  joint: { nodeId: 5, at: { x: 3, y: 3 }, columnElementId: 101, b: 0.4, h: 0.4, elementBelow: 101, elementAbove: 102, forces },
});
const ctx = { fc: 25, fy: 420, cover: 0.025, topBarDia: 12 };

describe('punching', () => {
  it('leaves a joint unverified, in every code, where a combination\'s forces do not balance, even if another passes', () => {
    const d = demand([force(), force({ combinationId: 2, combinationName: 'broken', directlyDelivered: 500 })]);
    for (const code of ['cirsoc201-2025', 'en1992-1-1', 'ts500-2000'] as const) {
      const r = rulesFor(code).punchingRow(d, ctx, f);
      expect(r.status, code).toBe('none');
      expect(r.verifications[0]!.label, code).toBe('rcSheets.v.punchingUnsupported');
      expect(r.verifications[0]!.ok, code).toBe(false);
    }
    expect(rulesFor('ts500-2000').punchingRow(demand([force()]), ctx, f).status).not.toBe('none');
  });

  it('EN 1992 reads the moments a joint transfers: more moment, more shear stress', () => {
    expect(punchingBeta('interior', 0.4, 0.4, 0.18, 300, 0, 0)).toBeCloseTo(1.15, 9);
    expect(punchingBeta('interior', 0.4, 0.4, 0.18, 300, 120, 0)).toBeCloseTo(1 + 1.8 * (120 / 300) / (0.4 + 4 * 0.18), 9);
    const at = (mx: number) => parseFloat(rulesFor('en1992-1-1').punchingRow(demand([force({ unbalancedMomentX: mx })]), ctx, f).verifications[0]!.demand!.replace('vEd = ', ''));
    expect(at(150)).toBeGreaterThan(at(0) * 1.2);
  });
});

describe('the steps the sheets write', () => {
  const prose = /\b(the|of|where|at|as|bars|beam|shears|mean|links|principal|secondary|face|ends|carries)\b/;
  it('name a punching joint\'s position through a translated label in every code, and EN 1992 keeps its prose in labels', async () => {
    for (const code of ['cirsoc201-2025', 'en1992-1-1', 'ts500-2000'] as const) {
      const r = rulesFor(code).punchingRow(demand([force()]), ctx, f);
      const steps = r.steps.flatMap((g) => g.steps);
      expect(steps.some((s) => s.label === 'rcSheets.punchPos.interior'), code).toBe(true);
      expect(steps.some((s) => /interior|edge|corner/.test(s.value ?? '')), code).toBe(false);
      if (code === 'en1992-1-1') for (const s of steps) expect(s.formula ?? '', s.label).not.toMatch(prose);
    }
    const ec2 = rulesFor('en1992-1-1');
    const wall = ec2.wallRow({ key: 'wall:1:0', name: 'M1', length: 3, height: 3, thickness: 0.2, combos: [{ combo: 'U', pu: 500, mu: 200, vu: 300, muV: 0, muH: 0 }] }, { mat: { fc: 30, fy: 500 }, cover: 0.025, barDia: 10, diameters: [10, 12, 16] }, undefined, f);
    const m = (v: number) => ({ bottomX: { value: v }, bottomY: { value: v }, topX: { value: v }, topY: { value: v } });
    const slab = ec2.slabRow({ key: 'slab:1', name: 'L1', lx: 5, ly: 4, h: 0.15, m: m(8) }, { mat: { fc: 30, fy: 500 }, cover: 0.02, diameters: [8, 10, 12] }, undefined, f);
    for (const s of [...wall.steps, ...slab.steps].flatMap((g) => g.steps)) expect(s.formula ?? '', s.label).not.toMatch(prose);
  });
});
