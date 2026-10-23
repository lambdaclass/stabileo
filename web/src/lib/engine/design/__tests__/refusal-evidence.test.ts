/**
 * What a refusal claims, and the evidence behind it.
 *
 * SECTION_INADEQUATE says no reinforcement makes the section work. That needs a proof: a bound
 * of the code no reinforcement lifts, exceeded (`section-bounds.ts`). A search that runs out of
 * the arrangements it enumerates (finite diameters, rows, layouts, seats, the first options per
 * region) shows only that none of THOSE passes, which is SEARCH_EXHAUSTED with what was tried and
 * what is not implemented.
 *
 * Before: the 22 beams of the flagship frame refused for congestion and anchorage read
 * SECTION_INADEQUATE because the section advice had a driver for congestion; the same refusal on
 * anchorage alone read SEARCH_EXHAUSTED. Neither carried a proof.
 */
import { describe, expect, it } from 'vitest';
import frame from '../../../templates/fixtures/rc-design-frame.json';
import qa8 from '../../../templates/fixtures/rc-design-qa-8.json';
import { designMember, runDesign, exhaustionOf } from '../candidate-search';
import { cirsoc201Adapter } from '../adapters/cirsoc201-adapter';
import { assertOutcomeInvariants, type MemberDesignOutcome } from '../outcome';
import { demonstratedInsufficiency } from '../section-bounds';
import { noticesOf } from '../notice-catalogue';
import { solveFixture, syntheticBeamContext } from './helpers';
import type { MemberContext } from '../member-context';

const demand = (category: string, absValue: number) => ({ category, value: absValue, absValue, comboId: 1, comboName: 'U1', stationX: 3, stationT: 0.5 });

describe('SECTION_INADEQUATE needs a proof', () => {
  /*
   * 30×60, H-30, cover 25 mm, smallest admissible stirrup Ø6 and bar Ø10:
   *   d,max = 0,60 − 0,025 − 0,006 − 0,005 = 0,564 m
   *   φ·(0,42 + 0,66)·√30·1000·0,30·0,564 = 0,75·1,08·5,4772·169,2 = 750,7 kN
   */
  it('a shear the section cannot take with any steel: §22.5.1.2 with Vc at its ceiling, by hand', () => {
    const ctx = syntheticBeamContext({ demands: { elementId: 1, demands: [demand('Vz', 900), demand('My+', 50)] } as never });
    const p = demonstratedInsufficiency(ctx)!;
    expect(p.bound).toBe('shearSectionLimit');
    expect(p.clause).toBe('22.5.1.2');
    expect(p.demand).toBe(900);
    expect(p.capacity).toBeCloseTo(0.75 * 1.08 * Math.sqrt(30) * 1000 * 0.3 * 0.564, 2);
    expect(p.capacity).toBeCloseTo(750.7, 1);
    expect(demonstratedInsufficiency(syntheticBeamContext({ demands: { elementId: 1, demands: [demand('Vz', 700)] } as never }))).toBeNull();
  });

  it('a column whose axial load exceeds the most steel the code admits, by hand', () => {
    // 30×30, H-30, fy 420: Po(ρ = 0,08) = 0,85·30·(0,09 − 0,0072) + 420·0,0072 = 2,1114 + 3,024 MN = 5135,4 kN; 0,75·0,85·Po = 3273,8 kN
    const base = syntheticBeamContext();
    const ctx: MemberContext = {
      ...base, elementType: 'column', section: { ...base.section, b: 0.3, h: 0.3 },
      axes: { ...base.axes, bFlex: 0.3, hFlex: 0.3 },
      demands: { elementId: 1, demands: [demand('N_compression', 3500)] } as never,
    };
    const p = demonstratedInsufficiency(ctx)!;
    expect(p.bound).toBe('axialCapacityAtMaxSteel');
    expect(p.capacity).toBeCloseTo(0.75 * 0.85 * (0.85 * 30 * (0.09 - 0.0072) + 420 * 0.0072) * 1000, 1);
    expect(p.capacity).toBeCloseTo(3273.8, 1);
  });

  it('a web that cannot hold two of the smallest bars', () => {
    // 10 cm web, cover 25 mm, Ø6 stirrup: 3,8 cm inside; two Ø10 with 4/3 × 19 mm aggregate clearance need 4,533 cm.
    const base = syntheticBeamContext();
    const ctx: MemberContext = { ...base, section: { ...base.section, b: 0.1 }, axes: { ...base.axes, bFlex: 0.1 } };
    const p = demonstratedInsufficiency(ctx)!;
    expect([p.bound, p.clause, p.demand, p.capacity, p.unit]).toEqual(['minimumBarRowDoesNotFit', '25.2.1', 4.533, 3.8, 'cm']);
  });

  it('the search states the proof: outcome, limiting, numbers and notice', () => {
    // The frame's beam with the largest shear, its web cut to 15 cm and its depth to 90 % of
    // what §22.5.1.2 needs at the ceiling of Vc: the demands are the real ones.
    const beams = [...solveFixture(frame).contexts.values()].filter((c) => c.elementType === 'beam');
    const vz = (c: MemberContext) => Math.max(0, ...(c.demands?.demands ?? []).filter((d) => d.category === c.axes.shear).map((d) => d.absValue));
    const ctx0 = beams.reduce((a, b) => (vz(b) > vz(a) ? b : a));
    const vu = vz(ctx0);
    const dNeed = vu / (0.75 * 1.08 * Math.sqrt(ctx0.material.fc) * 1000 * 0.15);
    const h = Math.max(0.2, 0.9 * dNeed + ctx0.material.cover + 0.006 + 0.005);
    const ctx: MemberContext = { ...ctx0, section: { ...ctx0.section, b: 0.15, h }, axes: { ...ctx0.axes, bFlex: 0.15, hFlex: h } };
    const o = designMember(cirsoc201Adapter, ctx);
    expect(o.outcome).toBe('SECTION_INADEQUATE');
    expect(o.insufficiency?.bound).toBe('shearSectionLimit');
    expect(o.insufficiency!.demand).toBeCloseTo(vu, 3);
    expect(o.insufficiency!.capacity).toBeLessThan(o.insufficiency!.demand);
    expect(o.limiting).toContain('shear');
    expect(o.reasons[0]).toMatchObject({ key: 'design.reason.insufficiency.shearSectionLimit', params: { clause: '22.5.1.2' } });
    expect(noticesOf(o)[0]!.code).toBe('D001');
    expect(o.exhaustion).toBeUndefined();
  });

  it('the contract refuses SECTION_INADEQUATE without a proof, or with a bound that holds', () => {
    const base = {
      elementId: 1, elementType: 'beam', codeId: 'cirsoc', codeVersion: '2025', limiting: ['congestion'], reasons: [{ key: 'x' }],
      searchStats: { candidatesTried: 10, verifierCalls: 10, ms: 1, truncated: false, envelopeExhausted: true },
    };
    expect(() => assertOutcomeInvariants({ ...base, outcome: 'SECTION_INADEQUATE', sectionAdvice: {} } as never)).toThrow(/without a demonstrated insufficiency/);
    expect(() => assertOutcomeInvariants({ ...base, outcome: 'SECTION_INADEQUATE', insufficiency: { bound: 'shearSectionLimit', clause: '22.5.1.2', demand: 10, capacity: 20, unit: 'kN', basis: {} } } as never)).toThrow(/bound holds/);
    // An exhausted envelope is a SEARCH_EXHAUSTED claim, stated with what was tried.
    expect(() => assertOutcomeInvariants({ ...base, outcome: 'SEARCH_EXHAUSTED' } as never)).toThrow(/without saying what was exhausted/);
    expect(() => assertOutcomeInvariants({
      ...base, outcome: 'SEARCH_EXHAUSTED',
      exhaustion: { scope: 'implementedAlternatives', limiting: ['congestion'], tried: {} as never, notImplemented: ['bundledBars'] },
    } as never)).not.toThrow();
  });
});

describe('the flagship frame: the beams refused for congestion and anchorage are an exhausted search, not a proven section', () => {
  const s = runDesign(cirsoc201Adapter, solveFixture(frame).contexts.values(), { maxRunMs: 120_000 });
  const refused = [...s.outcomes.values()].filter((o) => o.outcome === 'SECTION_INADEQUATE' || o.outcome === 'SEARCH_EXHAUSTED');
  // The 22 that read SECTION_INADEQUATE before (limiting congestion, 13 with anchorage).
  // Six of them (169–172, 197, 198) verify since the ductility check of §9.3.3.1 steers the
  // search (autodesign-regression.test.ts, header). Four more (165–168) verify since the minimum
  // shear reinforcement of §9.6.3.1 prunes the stirrup options under Av,min (same header); the
  // lap-aware column seeds now also allow beams 182 and 188 to verify; ten remain.
  const REMAINING = [161, 164, 180, 181, 183, 184, 186, 187, 196, 199];

  it('none reads SECTION_INADEQUATE: no bound proves any of them; the 10 left read SEARCH_EXHAUSTED', () => {
    expect(s.sectionInadequate).toBe(0);
    for (const id of [182, 188]) expect(s.outcomes.get(id)!.outcome, `e${id}`).toBe('VERIFIED');
    for (const id of REMAINING) expect([id, s.outcomes.get(id)!.outcome], `e${id}`).toEqual([id, 'SEARCH_EXHAUSTED']);
    expect(s.searchExhausted).toBe(refused.length);
  });

  it('each says what was tried and what was not, and none carries a proof', () => {
    for (const o of refused as MemberDesignOutcome[]) {
      expect(o.insufficiency, `e${o.elementId}`).toBeUndefined();
      expect(o.exhaustion?.scope, `e${o.elementId}`).toBe('implementedAlternatives');
      expect(o.exhaustion!.tried.maxRows).toBe(3);
      expect(o.exhaustion!.tried.optionsRetained).toBe(40);
      expect(o.exhaustion!.notImplemented).toEqual(expect.arrayContaining(['bundledBars', 'optionsBeyondRetained']));
      if (o.limiting.includes('anchorage')) expect(o.exhaustion!.notImplemented).toEqual(expect.arrayContaining(['headedBars', 'mechanicalAnchorage', 'columnCageChange']));
      if (o.limiting.includes('congestion')) expect(o.exhaustion!.notImplemented).toContain('columnCageChange');
      // The suites declare the beams' role (`SUITE_LATERAL`): no «declare the role» note here.
      expect(o.exhaustion!.notImplemented.includes('lateralRoleUndeclared'), `e${o.elementId}`).toBe(false);
      expect(o.reasons.map((r) => r.key)).toContain('design.reason.alternativesExhausted');
      expect(noticesOf(o)[0]!.code).toBe('D006');
    }
  });
}, 180_000);

describe('the QA frame with its columns cut to 90 × 120 mm: the columns proven, the beams exhausted', () => {
  // `design-convergence.test.ts`'s starved model, the one the e2e `h1e-refused-state` builds.
  const fixture = JSON.parse(JSON.stringify(qa8)) as { sections: Array<{ id: number; b: number; h: number; a: number; iy: number; iz: number; j: number }> };
  const s = fixture.sections.find((x) => x.id === 1)!;
  const r = 0.09 / 0.12, beta = (1 / 3) * (1 - 0.63 * r + 0.052 * r ** 5);
  Object.assign(s, { b: 0.09, h: 0.12, a: 0.09 * 0.12, iy: (0.09 * 0.12 ** 3) / 12, iz: (0.12 * 0.09 ** 3) / 12, j: beta * 0.12 * 0.09 ** 3 });
  const summary = runDesign(cirsoc201Adapter, solveFixture(fixture as never).contexts.values(), { maxRunMs: 180_000 });
  const of = (t: string) => [...summary.outcomes.values()].filter((o) => o.elementType === t);

  it('every column is SECTION_INADEQUATE with the bound that rules it out, every beam SEARCH_EXHAUSTED', () => {
    const cols = of('column');
    expect(cols.length).toBeGreaterThan(0);
    for (const o of cols) {
      expect([o.outcome, o.insufficiency?.bound], `c${o.elementId}`).toEqual(['SECTION_INADEQUATE', 'minimumBarRowDoesNotFit']);
      // 9 cm, less the cover and two Ø6 stirrups, against two Ø10 with the column's clear spacing.
      expect(o.insufficiency!.capacity).toBeLessThan(o.insufficiency!.demand);
    }
    for (const o of of('beam').filter((x) => x.outcome !== 'VERIFIED')) {
      expect([o.outcome, o.insufficiency], `b${o.elementId}`).toEqual(['SEARCH_EXHAUSTED', undefined]);
    }
  });
}, 300_000);

describe('an anchorage refusal under the undeclared lateral role says that declaring it could change it', () => {
  it('undeclared: the note; declared either way: none; another limit: none', () => {
    const ctx = syntheticBeamContext();
    const gaps = (c: MemberContext, limiting: Parameters<typeof exhaustionOf>[2]) => exhaustionOf(cirsoc201Adapter, c, limiting, 10, false).notImplemented;
    expect(gaps(ctx, ['anchorage'])).toContain('lateralRoleUndeclared');
    expect(gaps({ ...ctx, lateral: { role: 'undeclared' } as never }, ['anchorage'])).toContain('lateralRoleUndeclared');
    expect(gaps({ ...ctx, lateral: { role: 'gravity', source: 'project' } as never }, ['anchorage'])).not.toContain('lateralRoleUndeclared');
    expect(gaps({ ...ctx, lateral: { role: 'lateral', source: 'project' } as never }, ['anchorage'])).not.toContain('lateralRoleUndeclared');
    expect(gaps(ctx, ['congestion'])).not.toContain('lateralRoleUndeclared');
  });
});
