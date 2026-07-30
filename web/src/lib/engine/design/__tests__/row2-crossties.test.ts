/**
 * Table 9.7.6.2.2 ROW 2 on the production path — the case that needs crossties.
 *
 * qa-8 sits entirely in row 1, where a 300 mm web has 242 mm between its two leg centres
 * against a 400 mm across-width limit: two legs, no crosstie, and the across-width column
 * never bites. So qa-8 cannot prove the across-width requirement is implemented.
 *
 * This fixture makes it bite. A short, stocky bay (3,0 × 3,0 m, 500 mm columns, 300 kN/m
 * factored) puts the beams' required V_s above 0,33·√f'c·bw·d, which selects row 2, whose
 * across-width limit is the lesser of d/2 and 200 mm. 242 mm of web against 200 mm requires
 * a THIRD leg — a crosstie — and no amount of tightening the longitudinal spacing can
 * substitute for it.
 *
 * Everything is measured through the real chain: solve → design → detail. No seeded
 * reinforcement, no hand-written stirrup.
 */

import { describe, expect, it } from 'vitest';
import frame from '../../../templates/fixtures/rc-design-qa-row2.json';
import { runDesign } from '../candidate-search';
import { cirsoc201Adapter } from '../adapters/cirsoc201-adapter';
import { solveFixture } from './helpers';
import { buildStirrupOptions, computeBeamSeed } from '../candidate-enumerate-beam';
import {
  transverseSpacingForDemand, checkTransverseSpacing,
} from '../../../codes/cirsoc201/transverse-spacing';
import { tupleShear } from '../design-axes';

const solved = solveFixture(frame as never);
const summary = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });

/** Beams, in id order. The four columns are ids 1–4 in this fixture family. */
const beamIds = [...solved.contexts.entries()]
  .filter(([, c]) => c.elementType === 'beam').map(([id]) => id).sort((a, b) => a - b);

/** Peak |V| on the governing shear axis, from the solved stations. */
function peakShear(id: number): number {
  const ctx = solved.contexts.get(id)!;
  let peak = 0;
  for (const cr of ctx.stations?.comboResults ?? []) {
    for (const s of cr.stations) peak = Math.max(peak, Math.abs(tupleShear(s, ctx.axes.shear)));
  }
  return peak;
}

describe('the fixture really is in row 2 — measured, not assumed', () => {
  it('solves and designs every member', () => {
    expect(beamIds.length).toBe(4);
    expect(solved.contexts.size).toBe(8);
    // Honest gate: if the section cannot carry this shear the fixture is wrong, and saying
    // so here is better than silently proving nothing.
    for (const id of beamIds) {
      const o = summary.outcomes.get(id)!;
      expect(o.outcome, `element ${id}: ${o.reasons.map((r) => r.key).join(',')}`)
        .toBe('VERIFIED');
    }
  });

  it('the solved shear exceeds the row-2 threshold', () => {
    for (const id of beamIds) {
      const ctx = solved.contexts.get(id)!;
      const Vu = peakShear(id);
      const t = transverseSpacingForDemand(ctx.codeEdition, {
        Vu, bw: ctx.axes.bFlex, d: 0.509, fc: ctx.material.fc,
        cover: ctx.material.cover, stirrupDiaMm: 8,
      });
      expect(Vu, `element ${id}`).toBeGreaterThan(311.5);
      expect(t.row, `element ${id} at Vu=${Vu.toFixed(0)} kN`).toBe('row2');
    }
  });

  it('row 2 on a 300 mm web requires three legs — the across-width column biting', () => {
    const ctx = solved.contexts.get(beamIds[0])!;
    const t = transverseSpacingForDemand(ctx.codeEdition, {
      Vu: peakShear(beamIds[0]), bw: 0.300, d: 0.509, fc: 30,
      cover: 0.025, stirrupDiaMm: 8,
    });
    expect(t.acrossMax).toBeCloseTo(0.200, 6);   // lesser of d/2 = 254 and 200
    expect(t.acrossSpan).toBeCloseTo(0.242, 9);  // 300 − 2×25 − 8
    expect(t.requiredLegs).toBe(3);
    // The third leg is not optional: two legs leave 242 mm, over the limit by 21 %.
    expect(t.acrossSpan / t.acrossMax).toBeGreaterThan(1.2);
    // And it is genuinely the ACROSS-width column that forces it — the along-length limit
    // is satisfiable with two legs at any spacing.
    expect(t.alongMax).toBeCloseTo(Math.min(0.509 / 4, 0.200), 6);
  });
});

describe('the generator refuses two legs and offers a legal crosstied arrangement', () => {
  it('enumerates no two-leg option for these members', () => {
    for (const id of beamIds) {
      const ctx = solved.contexts.get(id)!;
      const opts = buildStirrupOptions(ctx, peakShear(id));
      expect(opts.length, `element ${id}`).toBeGreaterThan(0);
      expect(opts.some((o) => o.legs === 2), `element ${id}`).toBe(false);
      expect(Math.min(...opts.map((o) => o.legs)), `element ${id}`).toBe(3);
    }
  });

  it('every enumerated option satisfies BOTH columns of the table', () => {
    for (const id of beamIds) {
      const ctx = solved.contexts.get(id)!;
      const Vu = peakShear(id);
      for (const o of buildStirrupOptions(ctx, Vu)) {
        const c = checkTransverseSpacing(ctx.codeEdition, {
          VsRequired: Math.max(0, Vu / 0.75
            - (1 / 6) * Math.sqrt(ctx.material.fc) * (ctx.axes.bFlex * 1000) * 509 / 1000),
          bw: ctx.axes.bFlex, d: 0.509, fc: ctx.material.fc,
          cover: ctx.material.cover, stirrupDiaMm: o.diameter,
        }, { spacing: o.spacing, legs: o.legs });
        expect(c.ok, `element ${id}: Ø${o.diameter} ${o.legs}L @ ${o.spacing * 1000} mm`)
          .toBe(true);
      }
    }
  });
});

describe('the ACCEPTED design carries crossties, and the verifier agrees', () => {
  it('assigns THREE legs at the supports and two in the span — the table applied per region', () => {
    // MEASURED, and stronger than "every region has three legs", which was the first
    // assertion here and was wrong. The support region carries V_u = 450 kN (row 2, limit
    // 200 mm across, 242 mm of web, so a crosstie is mandatory); the span carries 180 kN,
    // which is row 1, where two legs are legal and a third would be steel the regulation
    // does not ask for.
    //
    // That the two regions land in DIFFERENT rows is the point: the evaluator is applied per
    // region against that region's own demand, not once per member.
    for (const id of beamIds) {
      const acc = summary.outcomes.get(id)!.accepted!;
      const sup = acc.regions!.stirrupsSupport!;
      const span = acc.regions!.stirrupsSpan!;
      expect(sup.legs, `element ${id} support`).toBe(3);
      expect(span.legs, `element ${id} span`).toBe(2);
    }
  });

  it('each region\'s leg count is exactly what the table requires for its own shear', () => {
    for (const id of beamIds) {
      const ctx = solved.contexts.get(id)!;
      const seed = computeBeamSeed(ctx);
      const acc = summary.outcomes.get(id)!.accepted!;
      const cases = [
        { label: 'support', Vu: seed.VuSupport, st: acc.regions!.stirrupsSupport! },
        { label: 'span', Vu: seed.VuSpan, st: acc.regions!.stirrupsSpan! },
      ];
      for (const c of cases) {
        const t = transverseSpacingForDemand(ctx.codeEdition, {
          Vu: c.Vu, bw: ctx.axes.bFlex, d: 0.509, fc: ctx.material.fc,
          cover: ctx.material.cover, stirrupDiaMm: c.st.diameter,
        });
        expect(c.st.legs, `element ${id} ${c.label} (${t.row})`)
          .toBeGreaterThanOrEqual(t.requiredLegs);
      }
      // And the support really is the row-2 one.
      expect(transverseSpacingForDemand(ctx.codeEdition, {
        Vu: seed.VuSupport, bw: ctx.axes.bFlex, d: 0.509, fc: ctx.material.fc,
        cover: ctx.material.cover, stirrupDiaMm: 8,
      }).row).toBe('row2');
      expect(transverseSpacingForDemand(ctx.codeEdition, {
        Vu: seed.VuSpan, bw: ctx.axes.bFlex, d: 0.509, fc: ctx.material.fc,
        cover: ctx.material.cover, stirrupDiaMm: 8,
      }).row).toBe('row1');
    }
  });

  it('the along-member spacing meets each region\'s own limit', () => {
    for (const id of beamIds) {
      const ctx = solved.contexts.get(id)!;
      const seed = computeBeamSeed(ctx);
      const acc = summary.outcomes.get(id)!.accepted!;
      for (const c of [
        { label: 'support', Vu: seed.VuSupport, st: acc.regions!.stirrupsSupport! },
        { label: 'span', Vu: seed.VuSpan, st: acc.regions!.stirrupsSpan! },
      ]) {
        const t = transverseSpacingForDemand(ctx.codeEdition, {
          Vu: c.Vu, bw: ctx.axes.bFlex, d: 0.509, fc: ctx.material.fc,
          cover: ctx.material.cover, stirrupDiaMm: c.st.diameter,
        });
        expect(c.st.spacing, `element ${id} ${c.label}`).toBeLessThanOrEqual(t.alongMax + 1e-9);
      }
    }
  });

  it('the authoritative verifier reports no transverse-spacing failure', () => {
    for (const id of beamIds) {
      const ctx = solved.contexts.get(id)!;
      const v = cirsoc201Adapter.verify(ctx, summary.outcomes.get(id)!.accepted!);
      const spacingFails = v.checks.filter(
        (c) => c.status === 'fail' && c.limiting === 'tieSpacing');
      expect(spacingFails.map((c) => c.category), `element ${id}`).toEqual([]);
      // And nothing was skipped as unsupported.
      expect(v.checks.filter((c) => c.limiting === 'unsupportedCheck')).toEqual([]);
    }
  });

  it('certifies against the same arrangement it assigned', () => {
    for (const id of beamIds) {
      const o = summary.outcomes.get(id)!;
      expect(o.certificate).toBeDefined();
      expect(o.certificate!.worstUtilization).toBeLessThanOrEqual(1.0);
    }
  });
});
