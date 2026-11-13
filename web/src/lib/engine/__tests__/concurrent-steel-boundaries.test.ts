import { expect, it } from 'vitest';
import { steelDemandOf, checkSteelMember, checkVariableSteelMember, type SteelMemberDemand } from '../verification-service';
import { profileByName, profileToSectionFull } from '../../data/steel-profiles';
import type { AnalysisResults3D } from '../types-3d';
import { extractGoverningDemands, type ElementStationResult } from '../station-design-forces';

const section = profileToSectionFull(profileByName('IPE 300')!);
const steel = { fy: 250, fu: 400, e: 200000 };
const lengths = { L: 4, Lb: 4 };
const ef = { elementId: 1, length: 4, nStart: -300, nEnd: 0, myStart: 0, myEnd: 60,
  mzStart: 0, mzEnd: 0, vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 20, mxStart: 0, mxEnd: 0,
} as AnalysisResults3D['elementForces'][number];
const tuples = [
  { N: 300, MStrong: 0, MWeak: 0, VStrong: 0, VWeak: 0, comboId: 0, comboName: '', t: 0 },
  { N: 0, MStrong: 60, MWeak: 0, VStrong: 20, VWeak: 0, comboId: 0, comboName: '', t: 1 },
];
const base: SteelMemberDemand = { Nc: 300, Nt: 0, MuStrong: 60, MuWeak: 0, Vu: 20, diagram: [] };

it('#1316 — the endpoint adapter never rates steel N at one end with M at the other', () => {
  const expected = checkSteelMember(1, { ...base, tuples }, section, steel, lengths)!;
  const actual = checkSteelMember(1, steelDemandOf(ef), section, steel, lengths)!;
  expect(actual.interaction!.ratio).toBe(expected.interaction!.ratio);
  expect(actual.governingCombos!.interaction!.t).toBe(expected.governingCombos!.interaction!.t);
  expect(steelDemandOf(ef).tuples).toEqual(tuples.map(t => expect.objectContaining(t)));
  const control = { ...ef, nEnd: ef.nStart, myEnd: ef.myStart, vzEnd: ef.vzStart };
  expect(checkSteelMember(1, steelDemandOf(control), section, steel, lengths)!.interaction!.ratio)
    .toBe(checkSteelMember(1, { ...base, MuStrong: 0, Vu: 0, tuples: [tuples[0]!] }, section, steel, lengths)!.interaction!.ratio);
});

it('#1316 — a steel force envelope is refused and a declared simultaneous case is answered', () => {
  expect(() => checkSteelMember(1, base, section, steel, lengths)).toThrow(/concurrent/i);
  expect(checkSteelMember(1, { ...base, tuples: [{ ...tuples[0]!, MStrong: 60 }] }, section, steel, lengths)!.interaction!.ratio).toBeGreaterThan(0);
});

it('#1316 — variable-section steel keeps each station combination concurrent', () => {
  const stations: ElementStationResult = { elementId: 1, length: 4, stationTs: [0.5], comboResults: [
    { comboId: 1, comboName: 'axial', stations: [{ t: 0.5, x: 2, n: -300, my: 0, mz: 0, vy: 0, vz: 0, torsion: 0 }] },
    { comboId: 2, comboName: 'moment', stations: [{ t: 0.5, x: 2, n: 0, my: 60, mz: 0, vy: 0, vz: 20, torsion: 0 }] },
  ] };
  const sections = new Map([[1, { ...section, id: 1 }]]);
  const actual = checkVariableSteelMember(1, { sectionId: 1 }, sections as never, steel, stations, lengths)!;
  const expected = checkSteelMember(1, { ...base, tuples: tuples.map((t, k) => ({ ...t, comboId: k + 1, comboName: k ? 'moment' : 'axial', t: 0.5 })) }, section, steel, lengths)!;
  expect(actual.interaction!.ratio).toBe(expected.interaction!.ratio);
  expect(actual.governingCombos!.interaction).toEqual(expected.governingCombos!.interaction);
});

for (const fraction of [0.5, 0.7]) {
  it(`#1316 — steel interaction uses its own Cb at M/Mn=${fraction}`, () => {
    const sec = { ...section, fabrication: 'rolled' as const };
    const len = { L: 8, Lb: 8, loadPosition: 'web' as const };
    const seed = checkSteelMember(1, { ...base, Nc: 1, MuStrong: 1, Vu: 0, tuples: [{ ...tuples[0]!, N: 1, MStrong: 1 }] }, sec, steel, len)!;
    const N = 0.4 * seed.compression!.phiPn;
    const M = fraction * seed.flexureZ.phiMn;
    const ts = [0, 0.25, 0.5, 0.75, 1];
    const stations: ElementStationResult = { elementId: 1, length: 8, stationTs: ts, comboResults: [
      { comboId: 1, comboName: 'uniform with compression', stations: ts.map(t => ({ t, x: 8 * t, n: -N, my: M, mz: 0, vy: 0, vz: 0, torsion: 0 })) },
      { comboId: 2, comboName: 'end moment without compression', stations: ts.map(t => ({ t, x: 8 * t, n: 0, my: t === 0 ? 1.8 * M : 0, mz: 0, vy: 0, vz: 0, torsion: 0 })) },
    ] };
    const own = stations.comboResults.map(c => {
      const single = { ...stations, comboResults: [c] };
      return checkSteelMember(1, steelDemandOf(ef, extractGoverningDemands(single), single), sec, steel, len)!;
    });
    const hand = 0.4 + (8 / 9) * fraction;
    expect(own[0]!.interaction!.ratio).toBeCloseTo(hand, 8);
    const actual = checkSteelMember(1, steelDemandOf(ef, extractGoverningDemands(stations), stations), sec, steel, len)!;
    expect(actual.interaction!.ratio).toBe(Math.max(...own.map(v => v.interaction!.ratio)));
    expect(actual.overallStatus).toBe(hand > 1 ? 'fail' : 'ok');
    expect(actual.governingCombos!.interaction!.comboName).toBe('uniform with compression');
  });
}
