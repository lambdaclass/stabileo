import { describe, it, expect } from 'vitest';
import { checkSteelMember } from '../../verification-service';
import { profileToSectionFull, PROFILE_FAMILIES } from '../../../data/steel-profiles';
import { steelCheckRows, elementOutcome, concreteCheckRows } from '../check-rows';

describe('verifier results as check rows', () => {
  it('turns a CIRSOC 301 result into rows with clause, formula and the common outcome', () => {
    const sec = profileToSectionFull(PROFILE_FAMILIES.IPE.find((p) => p.name === 'IPE 300')!);
    const v = checkSteelMember(1, { Nc: 200, Nt: 0, MuStrong: 80, MuWeak: 0, Vu: 40, diagram: [] }, sec, { fy: 250, fu: 400, e: 200000 }, { L: 4, Lb: 4 })!;
    const rows = steelCheckRows(v);
    expect(rows.map((r) => r.clause)).toEqual(expect.arrayContaining(['E.3', 'F.2', 'G.2']));
    const o = elementOutcome(1, 'steelMember', 'cirsoc-301', rows);
    expect(o.utilization).toBeCloseTo(Math.max(...rows.map((r) => r.ratio ?? 0)), 12);
    expect(o.governing!.ratio).toBe(o.utilization);
  });

  it('a member with no checks is not verified, not ok', () => {
    expect(elementOutcome(2, 'beam', 'cirsoc-201', concreteCheckRows({ checks: [] } as never)).status).toBe('notVerified');
  });
});
