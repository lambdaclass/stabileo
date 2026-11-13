/**
 * The vertical seismic component, each code by its own rule: INPRES-CIRSOC 103 by the project's
 * toggle (§3.5.2), TBDY 2018 in every building (4.4.3.2), ASCE 7-22 from SDS (§12.4.2.2, zero at
 * SDS ≤ 0,125) and EN 1998-1 above avg = 0,25 g or as typed (§4.3.3.5.2). The CIRSOC toggle reaches
 * none of the others.
 */
import { describe, expect, it } from 'vitest';
import { buildLoadPlan } from '../../engine/loads/load-plan';
import { planInput, SEISMIC_ON } from './family-plan-helpers';

const keys = (p: ReturnType<typeof buildLoadPlan>) => [...p.derivation, ...p.unsupportedKeys].map((m) => m.key);

describe('TBDY 2018: the vertical effect always enters', () => {
  const ci = { tbdy2018: { ss: 1.0, s1: 0.3, soil: 'ZC', bks: 3, system: 'A11' } };
  for (const vertical of [true, false]) {
    it(`with the CIRSOC toggle ${vertical ? 'on' : 'off'}`, () => {
      const p = buildLoadPlan(planInput('turkey', { codeInputs: ci, seismic: SEISMIC_ON(vertical) }));
      expect(p.outcome).toBe('READY');
      expect(p.combinations.some((c) => c.id.endsWith('-Ez'))).toBe(true);
      expect(keys(p)).toContain('loads.tr.seismic.derivation.vertical');
    });
  }
});

describe('ASCE 7-22: Ev = 0,2·SDS·D, zero at SDS ≤ 0,125', () => {
  const ci = (sds: number) => ({ 'asce7-22-seismic': { sds, sd1: 0.6 * sds, s1: 0.5 * sds, tl: 8, systemKey: 'steelSMF', periodKey: 'steelMRF' } });
  it('applies Ev from SDS with the CIRSOC toggle off', () => {
    const p = buildLoadPlan(planInput('us', { codeInputs: ci(1.0), seismic: SEISMIC_ON(false) }));
    expect(p.outcome).toBe('READY');
    expect(keys(p)).toContain('loads.asce7.seismic.derivation.ev');
    const withE = p.combinations.find((c) => c.terms.some((t) => t.symbol === 'E') && c.terms.find((t) => t.symbol === 'D')!.factor > 1.2);
    expect(withE?.terms.find((t) => t.symbol === 'D')?.factor).toBeCloseTo(1.2 + 0.2, 9);
  });
  it('takes Ev as zero at SDS = 0,12 and says so', () => {
    const p = buildLoadPlan(planInput('us', { codeInputs: ci(0.12), seismic: SEISMIC_ON(true) }));
    expect(keys(p)).toContain('loads.asce7.seismic.derivation.evZero');
    expect(keys(p)).not.toContain('loads.asce7.seismic.derivation.ev');
  });
});

describe('EN 1998-1: by avg against 0,25 g, or as typed', () => {
  const ci = (agR: number, vertical?: boolean) => ({ 'en1998-1': { agR, groundType: 'C', q: 3.9, ...(vertical === undefined ? {} : { vertical }) } });
  it('below the threshold: no vertical component, said in the derivation', () => {
    const p = buildLoadPlan(planInput('eurocode', { codeInputs: ci(0.25), seismic: SEISMIC_ON(true) }));
    expect(p.outcome).toBe('READY');
    expect(keys(p)).toContain('loads.ec.seismic.verticalBelow');
    expect(p.combinations.some((c) => c.id.includes('Ez'))).toBe(false);
  });
  it('above it: on by default, eq. 4.18–4.20 with the plateau 2,5·avg/1,5 on G', () => {
    const p = buildLoadPlan(planInput('eurocode', { codeInputs: ci(0.4), seismic: SEISMIC_ON(false) }));
    const avg = 0.9 * 0.4, kv = avg * 2.5 / 1.5;
    expect(keys(p)).toContain('loads.ec.seismic.verticalOn');
    expect(p.unsupportedKeys.map((m) => m.key)).toContain('loads.ec.seismic.verticalWhole');
    const lead = p.combinations.filter((c) => c.id.endsWith('+Ez'));
    expect(lead.length).toBeGreaterThan(0);
    for (const c of lead) {
      expect(c.terms.find((t) => t.symbol === 'D')?.factor).toBeCloseTo(1 + kv, 4);
      expect(c.terms.find((t) => t.symbol === 'E')?.factor).toBeCloseTo(0.3, 9);
    }
    const horizontal = p.combinations.filter((c) => c.id.endsWith('-0.3Ez'));
    for (const c of horizontal) expect(c.terms.find((t) => t.symbol === 'D')?.factor).toBeCloseTo(1 - 0.3 * kv, 4);
    // No combination with E is left without the vertical component.
    expect(p.combinations.filter((c) => c.terms.some((t) => t.symbol === 'E') && !c.id.includes('Ez'))).toEqual([]);
  });
  it('above it but turned off: no vertical component, and the plan says what §4.3.3.5.2 requires', () => {
    const p = buildLoadPlan(planInput('eurocode', { codeInputs: ci(0.4, false), seismic: SEISMIC_ON(true) }));
    expect(p.combinations.some((c) => c.id.includes('Ez'))).toBe(false);
    expect(p.unsupportedKeys.map((m) => m.key)).toContain('loads.ec.seismic.verticalOff');
  });
});

// INPRES-CIRSOC 103's toggle: `engine/loads/__tests__/load-plan.test.ts`, 'the vertical component splits each seismic combination'.
