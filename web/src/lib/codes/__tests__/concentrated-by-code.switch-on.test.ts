/**
 * Main's admission check (#2207) under every family: a concentrated load the code asks for in
 * place of the uniform one refuses the plan (ASCE 7-22 §4.4, as CIRSOC 101 §4.4); EN 1991-1-1's
 * Qk, which acts alone for local verifications (6.2.1(4)), is said beside a plan that stays ready.
 */
import { describe, expect, it } from 'vitest';
import { buildLoadPlan } from '../../engine/loads/load-plan';
import { otherRefusals, planInput } from './family-plan-helpers';

describe('concentrated live loads by family', () => {
  it('EN 1991-1-1: offices (B, Qk = 4,5 kN) are planned, with Qk named for the local checks', () => {
    const p = buildLoadPlan(planInput('eurocode', { occupancyKey: 'ec-B' }));
    expect(p.blockedKeys).toEqual([]);
    const note = p.assumptions.find((m) => m.key === 'loads.ec.live.localQk');
    expect(note?.params?.force).toBe(4.5);
    expect(p.refs.some((r) => r.clause === '6.2.1(4)')).toBe(true);
  });

  it('ASCE 7-22: offices are refused by name for their 2,000 lb, residences are not', () => {
    const offices = buildLoadPlan(planInput('us', { occupancyKey: 'offices' }));
    expect(offices.blockedKeys.map((m) => m.key)).toContain('loads.asce7.blocked.concentratedLive');
    expect(otherRefusals(offices)).toEqual([]);
    const home = buildLoadPlan(planInput('us', { occupancyKey: 'residentialPrivate' }));
    expect(home.blockedKeys.map((m) => m.key)).not.toContain('loads.asce7.blocked.concentratedLive');
  });

  it('TS 498: its table has no concentrated load, so nothing is refused for one', () => {
    const p = buildLoadPlan(planInput('turkey', { occupancyKey: 'tr_office' }));
    expect(p.blockedKeys.filter((m) => /concentrated/i.test(m.key))).toEqual([]);
  });
});
