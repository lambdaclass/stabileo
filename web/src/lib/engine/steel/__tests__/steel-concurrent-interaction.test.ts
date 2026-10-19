import { describe, it, expect } from 'vitest';
import { checkSteelMember, type SteelMemberDemand } from '../../verification-service';
import { profileToSectionFull, PROFILE_FAMILIES } from '../../../data/steel-profiles';

const steel = { fy: 250, fu: 400, e: 200000 };
const sec = profileToSectionFull(PROFILE_FAMILIES.IPE.find((p) => p.name === 'IPE 300')!);

describe('steel interaction on forces that act together', () => {
  // Combination A compresses the member with no moment; combination B bends it with no axial.
  const base: SteelMemberDemand = { Nc: 300, Nt: 0, MuStrong: 60, MuWeak: 0, Vu: 20, diagram: [] };
  const tuples = [
    { N: 300, MStrong: 0, MWeak: 0, VStrong: 0, VWeak: 0, comboId: 1, comboName: 'A', t: 0.5 },
    { N: 0, MStrong: 60, MWeak: 0, VStrong: 20, VWeak: 0, comboId: 2, comboName: 'B', t: 0.5 },
  ];

  it('does not add an axial and a moment that never act at once', () => {
    const maxima = checkSteelMember(1, base, sec, steel, { L: 4, Lb: 4 })!;
    const together = checkSteelMember(1, { ...base, tuples }, sec, steel, { L: 4, Lb: 4 })!;
    // From the maxima, H.1 summed 300 kN and 60 kN·m; neither combination carries both.
    expect(together.interaction!.ratio).toBeLessThan(maxima.interaction!.ratio);
    expect(together.governingCombos?.interaction?.comboName).toBeDefined();
  });

  it('takes the worst tuple when one does carry both', () => {
    const both = [...tuples, { N: 250, MStrong: 50, MWeak: 0, VStrong: 15, VWeak: 0, comboId: 3, comboName: 'C', t: 0.25 }];
    const r = checkSteelMember(1, { ...base, tuples: both }, sec, steel, { L: 4, Lb: 4 })!;
    expect(r.governingCombos?.interaction).toEqual({ comboId: 3, comboName: 'C', t: 0.25 });
  });
});
