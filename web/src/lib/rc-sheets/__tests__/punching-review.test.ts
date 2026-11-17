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
