import { expect, it, vi } from 'vitest';
import * as flange from '../codes/argentina/cirsoc301';
import { checkSteelMember, steelDemandOf, steelMemberLengths } from '../verification-service';
import { extractGoverningDemands, type ElementStationResult } from '../station-design-forces';
import { profileByName, profileToSectionFull } from '../../data/steel-profiles';
import { momentGradient } from '../steel/moment-gradient';
import type { AnalysisResults3D } from '../types-3d';

const section = { ...profileToSectionFull(profileByName('IPE 300')!), fabrication: 'rolled' as const };
const steel = { fy: 250, fu: 400, e: 200000 };
const ts = [0, 0.25, 0.5, 0.75, 1];
const esr: ElementStationResult = { elementId: 1, length: 16, stationTs: ts, comboResults: [{ comboId: 1, comboName: 'C',
  stations: ts.map(t => ({ t, x: 16 * t, n: -100, my: 80 * t, mz: 0, vy: 0, vz: 0, torsion: 0 })) }] };
const ef = { elementId: 1, length: 16, nStart: -100, nEnd: -100, myStart: 0, myEnd: 80, mzStart: 0, mzEnd: 0,
  vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0, mxStart: 0, mxEnd: 0, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0,
  distributedLoadsY: [], distributedLoadsZ: [], pointLoadsY: [], pointLoadsZ: [],
  releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false } satisfies AnalysisResults3D['elementForces'][number];
const demand = (t?: number) => {
  const source = t === undefined || ts.includes(t) ? esr : {
    ...esr, stationTs: [...ts, t].sort((a, b) => a - b),
    comboResults: esr.comboResults.map(c => ({ ...c, stations: [...c.stations,
      { ...c.stations[0]!, t, x: esr.length * t, my: ef.myEnd * t }].sort((a, b) => a.t - b.t) })),
  };
  return steelDemandOf(ef, extractGoverningDemands(source), source);
};
function checkAt(d: ReturnType<typeof demand>, lengths: Parameters<typeof checkSteelMember>[4], t: number, screen = false) {
  const cases = vi.spyOn(flange, 'verifyFlangeCases');
  try {
    checkSteelMember(1, d, section, steel, lengths, undefined, { screen });
    const checks = cases.mock.calls.flatMap(([inputs], i) => inputs.map((input, j) => ({
      t: input.demand.source.stationT, verification: { ...cases.mock.results[i]!.value[j]!.verification, interaction: cases.mock.results[i]!.value[j]!.interaction },
    })));
    const found = checks.find(c => c.t === t);
    expect(found).toBeDefined();
    return found!.verification;
  } finally {
    cases.mockRestore();
  }
}
for (const screen of [false, true]) for (const sign of [1, -1]) for (const t of [0, 0.25, 0.5, 0.75, 1]) {
  it(`known wrong result: #2088 unknown short span receives unity ${screen} ${sign} ${t}`, () => {
    const d = demand();
    if (sign < 0) {
      const s = { ...esr, comboResults: esr.comboResults.map(c => ({ ...c, stations: c.stations.map(s => ({ ...s, my: -s.my })) })) };
      d.concurrent = steelDemandOf(ef, extractGoverningDemands(s), s).concurrent!;
    }
    const lengths = { L: 16, Lb: 8, LbNeg: 8, loadPosition: 'web' as const };
    const actual = checkAt(d, lengths, t, screen);
    const unity = checkAt({ ...d, diagrams: undefined }, lengths, t, screen);
    expect(actual.flexureZ.phiMn).toBe(unity.flexureZ.phiMn);
    expect(actual.interaction!.ratio).toBe(unity.interaction!.ratio);
  });
}
for (const t of [0.499999, 0.5, 0.500001, 1]) {
  it(`known wrong result: #2088 known braces select the containing interval at ${t}`, () => {
    const d = demand(t);
    const lengths = steelMemberLengths({ bracing: { top: [8] }, steelLoadHeight: 'web' }, { L: 16, Lb: 16 });
    const actual = checkAt(d, lengths, t);
    const unity = checkAt({ ...d, diagrams: undefined }, lengths, t);
    const window = t < 0.5 ? [0, 0.5] : [0.5, 1];
    const cb = momentGradient({ stations: d.diagrams!.get(1)!, tStart: window[0]!, tEnd: window[1]!, shape: 'I' }).cb;
    expect(actual.flexureZ.phiMn).toBeCloseTo(unity.flexureZ.phiMn * cb, 8);
  });
}
for (const Lb of [0, 16 - 1e-12, 16, 16 + 1e-12, 16.000001]) it(`whole or unavailable span remains correct ${Lb}`, () => {
  const d = demand(), lengths = { L: 16, Lb, loadPosition: 'web' as const };
  const a = checkSteelMember(1, d, section, steel, lengths)!;
  const u = checkSteelMember(1, { ...d, diagrams: undefined }, section, steel, lengths)!;
  const cb = Lb === 16 ? momentGradient({ stations: d.diagrams!.get(1)!, tStart: 0, tEnd: 1, shape: 'I' }).cb : 1;
  expect(a.flexureZ.phiMn).toBeCloseTo(u.flexureZ.phiMn * cb, 8);
});

for (const screen of [false, true]) for (const reverse of [false, true]) for (const sign of [1, -1]) {
  it(`known wrong result: #2088 one combination caches each containing brace interval screen=${screen} reverse=${reverse} sign=${sign}`, () => {
    const stations = { ...esr, comboResults: esr.comboResults.map(c => ({ ...c, stations: c.stations.map(s => ({ ...s, my: sign * s.my })) })) };
    const d = steelDemandOf(ef, extractGoverningDemands(stations), stations);
    if (reverse) d.concurrent = [...d.concurrent!].reverse();
    const lengths = steelMemberLengths({ bracing: { top: [8], bottom: [8] }, steelLoadHeight: 'web' }, { L: 16, Lb: 16 });
    const full = checkSteelMember(1, d, section, steel, lengths, undefined, { screen })!;
    const own = checkAt(d, lengths, 1, screen);
    const unity = checkAt({ ...d, diagrams: undefined }, lengths, 1, screen);
    const cb = momentGradient({ stations: d.diagrams!.get(1)!, tStart: 0.5, tEnd: 1, shape: 'I' }).cb;
    expect(full.flexureZ.phiMn).toBeCloseTo(unity.flexureZ.phiMn * cb, 8);
    expect(full.flexureZ.phiMn).toBe(own.flexureZ.phiMn);
    expect(full.interaction!.ratio).toBe(own.interaction!.ratio);
  });
}
