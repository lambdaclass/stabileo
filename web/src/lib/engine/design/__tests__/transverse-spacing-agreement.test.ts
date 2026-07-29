/**
 * Generator and verifier agree on Table 9.7.6.2.2 — both columns.
 *
 * The failure mode this guards is specific and has happened before in this codebase: the
 * generator enumerates arrangements the verifier will reject wholesale, the search runs out
 * of candidates, and the member is reported SEARCH_EXHAUSTED — which reads as "no legal
 * arrangement exists" when in fact the generator simply never proposed the legal one.
 *
 * The across-width column makes that concrete. A 300 mm web in row 2 has 242 mm between its
 * two leg centres against a 200 mm limit, so a 2-leg stirrup is illegal there however tight
 * the longitudinal spacing. If `buildStirrupOptions` started at 2 legs, every option it
 * produced for a row-2 member would be rejected.
 *
 * Both sides are exercised through the real functions the production path calls — the
 * generator's own entry point and the adapter's authoritative verifier — not through a
 * reimplementation of the rule.
 */

import { describe, expect, it } from 'vitest';
import { buildStirrupOptions } from '../candidate-enumerate-beam';
import { syntheticBeamContext } from './helpers';
import {
  transverseSpacingForDemand, checkTransverseSpacing, rowThreshold,
} from '../../../codes/cirsoc201/transverse-spacing';
import type { MemberContext } from '../member-context';

/** The synthetic helper predates the edition field; the production path always carries it. */
function ctx(over: Record<string, unknown> = {}): MemberContext {
  return syntheticBeamContext({
    codeEdition: '2025',
    material: {
      fc: 30, fy: 420, cover: 0.025, stirrupDia: 8,
      maxAggregateSize: { value: 19, origin: 'project', refs: [] },
    },
    ...over,
  } as never);
}

/**
 * `buildStirrupOptions` derives d as `h − cover − d_s − 0,008`, so for the 300×600 synthetic
 * beam d = 0,600 − 0,025 − 0,008 − 0,008 = 0,559 m. Stated here rather than assumed, because
 * every threshold below is computed from it.
 */
const D = 0.600 - 0.025 - 0.008 - 0.008;
const B = 0.3;

/** V_u that puts the member in a given row, via V_s req = V_u/0,75 − V_c. */
function VuForRow(row: 'row1' | 'row2', stirrupDiaMm = 8): number {
  const Vc = (1 / 6) * Math.sqrt(30) * (B * 1000) * (D * 1000) / 1000;
  const threshold = rowThreshold(30, B, D);
  void stirrupDiaMm;
  return row === 'row1' ? 0.75 * Vc : 0.75 * (threshold + Vc) * 1.2;
}

describe('the generator honours BOTH columns of Table 9.7.6.2.2', () => {
  it('a row-1 demand enumerates 2-leg options, because 2 legs are legal there', () => {
    const table = transverseSpacingForDemand('2025', {
      Vu: VuForRow('row1'), bw: B, d: D, fc: 30, cover: 0.025, stirrupDiaMm: 8,
    });
    expect(table.row).toBe('row1');
    expect(table.requiredLegs).toBe(2);

    const opts = buildStirrupOptions(ctx(), VuForRow('row1'));
    expect(opts.length).toBeGreaterThan(0);
    expect(Math.min(...opts.map((o) => o.legs))).toBe(2);
  });

  it('a row-2 demand NEVER enumerates a 2-leg option, because none is legal', () => {
    const Vu = VuForRow('row2');
    const table = transverseSpacingForDemand('2025', {
      Vu, bw: B, d: D, fc: 30, cover: 0.025, stirrupDiaMm: 8,
    });
    expect(table.row).toBe('row2');
    // 300 − 50 − 8 = 242 mm of web against min(d/2, 200) = 200 mm → a third leg.
    expect(table.acrossMax).toBeCloseTo(0.200, 6);
    expect(table.acrossSpan).toBeCloseTo(0.242, 9);
    expect(table.requiredLegs).toBe(3);

    const opts = buildStirrupOptions(ctx(), Vu);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.some((o) => o.legs === 2)).toBe(false);
    expect(Math.min(...opts.map((o) => o.legs))).toBe(3);
  });

  it('every option the generator produces passes the verifier it will be judged by', () => {
    // The agreement itself, stated as a property rather than a sample. If either side of the
    // rule is ever reimplemented, this fails.
    for (const row of ['row1', 'row2'] as const) {
      const Vu = VuForRow(row);
      for (const o of buildStirrupOptions(ctx(), Vu)) {
        const c = checkTransverseSpacing('2025', {
          VsRequired: Math.max(0, Vu / 0.75
            - (1 / 6) * Math.sqrt(30) * (B * 1000) * (D * 1000) / 1000),
          bw: B, d: D, fc: 30, cover: 0.025, stirrupDiaMm: o.diameter,
        }, { spacing: o.spacing, legs: o.legs });
        expect(c.ok, `${row}: Ø${o.diameter} ${o.legs}L @ ${o.spacing * 1000} mm`).toBe(true);
      }
    }
  });

  it('the along-length cap is 400 mm in row 1, so a deep member may be spaced wider', () => {
    // d = 559 mm → d/2 = 279,5 mm, below the 400 mm cap, so the depth term governs and the
    // widest option the generator offers is the grid step at or below it. Under the previous
    // 300 mm cap this member would have been capped 20,5 mm too tight; a member with
    // d > 800 mm would have been capped 100 mm too tight.
    const table = transverseSpacingForDemand('2025', {
      Vu: VuForRow('row1'), bw: B, d: D, fc: 30, cover: 0.025, stirrupDiaMm: 8,
    });
    expect(table.alongGovernedBy).toBe('depthTerm');
    expect(table.alongMax).toBeCloseTo(D / 2, 6);
    const widest = Math.max(...buildStirrupOptions(ctx(), VuForRow('row1')).map((o) => o.spacing));
    expect(widest).toBeLessThanOrEqual(table.alongMax);
  });

  it('a wide member escalates the leg count further, and the generator can host it', () => {
    // 900 mm web, row 1: 900 − 50 − 8 = 842 mm at 400 mm → 1 + ceil(2,105) = 4 legs.
    const wide = ctx({
      section: { id: 1, name: '900×600', b: 0.9, h: 0.6 },
      axes: { ...syntheticBeamContext().axes, bFlex: 0.9 },
    });
    const table = transverseSpacingForDemand('2025', {
      Vu: VuForRow('row1'), bw: 0.9, d: D, fc: 30, cover: 0.025, stirrupDiaMm: 8,
    });
    expect(table.requiredLegs).toBe(4);
    const opts = buildStirrupOptions(wide, VuForRow('row1'));
    // BEAM_LIMITS.maxLegs is 4, so 4 is reachable and nothing below it is offered.
    expect(opts.length).toBeGreaterThan(0);
    expect(Math.min(...opts.map((o) => o.legs))).toBe(4);
  });
});
