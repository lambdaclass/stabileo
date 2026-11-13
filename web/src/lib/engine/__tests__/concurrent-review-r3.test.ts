import { expect, it } from 'vitest';
import { ConcurrentDemand } from '../concurrent-demand';
import { checkSteelInteraction, interactionRatios, verifySteelElement, type SteelDesignParams } from '../codes/argentina/cirsoc301';
import { checkSteelMember, steelDemandOf, checkVariableSteelMember, type SteelMemberDemand } from '../verification-service';
import { normalizeCirsoc301 } from '../design-check-results';
import { maskAxialDemand } from '../design/behaviour-demands';
import { profileByName, profileToSectionFull } from '../../data/steel-profiles';
import type { AnalysisResults3D } from '../types-3d';
import type { ElementStationResult } from '../station-design-forces';

const section = { ...profileToSectionFull(profileByName('IPE 300')!), fabrication: 'rolled' as const };
const steel = { fy: 250, fu: 400, e: 200000 };
const lengths = { L: 8, Lb: 8, loadPosition: 'web' as const };
const packet = (n: number, m: number, comboId = 1, axis: 'My' | 'Mz' = 'My') => ConcurrentDemand.fromTuples([{
  comboId, comboName: `comb ${comboId}`, forces: { n, my: axis === 'My' ? m : 0, mz: axis === 'Mz' ? m : 0,
    vy: 0, vz: 0, torsion: 0, t: 0.5, x: 4 },
}])[0]!;
const demand = (concurrent: readonly ConcurrentDemand[], Nc = 0, Nt = 0): SteelMemberDemand => ({
  Nc, Nt, MuStrong: Math.max(...concurrent.map(d => Math.abs(d.my))), MuWeak: 0, Vu: 0, diagram: [], concurrent,
});
const ef = { elementId: 1, length: 8, nStart: 0, nEnd: 0, myStart: 0, myEnd: 0,
  mzStart: 0, mzEnd: 0, vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0, mxStart: 0, mxEnd: 0,
} as AnalysisResults3D['elementForces'][number];
const params: SteelDesignParams = { Fy: steel.fy, Fu: steel.fu, E: steel.e, A: section.a!, Iz: section.iy!, Iy: section.iz!,
  h: section.h!, b: section.b!, tw: section.tw!, tf: section.tf!, J: 1e-7, shape: 'I', builtUp: false,
  ...lengths, Lb: 1, LbNeg: 8 };

it.fails('#1316 — held D.2 retains maximum tension and its own combination apart from interaction', () => {
  const a = packet(100, 0, 1), b = packet(40, 60, 2);
  const v = checkSteelMember(1, demand([a, b], 0, 100), section, steel, lengths)!;
  expect(v.tension!.Pu).toBe(100);
  expect(v.governingCombos).toMatchObject({ tension: { comboId: 1 }, interaction: { comboId: 2 } });
  const row = normalizeCirsoc301([v], new Map())[0]!.checks.find(c => c.name === 'Tension')!;
  expect(row.demand).toBe(100);
  expect(row.comboName).toBe('comb 1');
});

for (const connected of [false, true]) {
  it(`#2080 — tension and shear maxima survive order reversal with connection=${connected}`, () => {
    const a = packet(100, 0, 1), b = packet(40, 60, 2);
    const len = connected ? { ...lengths, tensionConnection: { resolved: { Ae: section.a!, steps: [] } } } : lengths;
    const v = checkSteelMember(1, demand([b, a], 0, 100), section, steel, len)!;
    expect(v.tension!.Pu).toBe(100);
    const single = checkSteelMember(1, demand([a], 0, 100), section, steel, len)!;
    expect(v.tension).toEqual(single.tension);
  });
}

for (const axis of ['My', 'Mz'] as const) {
  for (const entry of ['single', 'batch'] as const) {
    it.fails(`#2080 — ${entry} ${axis} negative moment uses the longer bottom flange length`, () => {
      const d = packet(-20, -20, 1, axis).section(axis);
      const expected = checkSteelInteraction({ ...params, Lb: params.LbNeg!, LbNeg: undefined }, d).ratio;
      const actual = entry === 'single' ? checkSteelInteraction(params, d).ratio : interactionRatios([{ params, demand: d }])![0];
      expect(actual).toBe(expected);
      expect(expected).toBeGreaterThan(checkSteelInteraction({ ...params, LbNeg: undefined }, d).ratio);
    });
  }
  for (const moment of [0, 20]) {
    it(`#2080 — ${axis} moment ${moment} keeps the top flange in all entry points`, () => {
      const d = packet(-20, moment, 1, axis).section(axis);
      const expected = checkSteelInteraction({ ...params, LbNeg: undefined }, d).ratio;
      expect(checkSteelInteraction(params, d).ratio).toBe(expected);
      expect(interactionRatios([{ params, demand: d }])![0]).toBe(expected);
      const v = verifySteelElement({ elementId: 1, params, demand: d });
      if (moment === 0) expect(v.interaction).toBeUndefined();
      else expect(v.interaction!.ratio).toBe(expected);
    });
  }
}

for (const n of [-100, 100]) {
  for (const entry of ['concurrent', 'tuples', 'stations'] as const) {
    it.fails(`#2080 — ${entry} preserves interior signed axial ${n} with zero endpoint envelopes`, () => {
      const d = packet(n, 20);
      const expected = checkSteelMember(1, demand([d], Math.max(0, -n), Math.max(0, n)), section, steel, lengths)!;
      const stations: ElementStationResult = { elementId: 1, length: 8, stationTs: [0.5],
        comboResults: [{ comboId: 1, comboName: 'comb 1', stations: [{ ...d.forces }] }] };
      const input = entry === 'stations' ? steelDemandOf(ef, undefined, stations) : entry === 'tuples'
        ? { ...demand([]), concurrent: undefined, tuples: [{ N: -n, MStrong: 20, MWeak: 0, VStrong: 0, VWeak: 0, comboId: 1, comboName: 'comb 1', t: 0.5 }] }
        : demand([d]);
      const v = checkSteelMember(1, input, section, steel, lengths)!;
      expect(v.interaction!.ratio).toBe(expected.interaction!.ratio);
      expect(n < 0 ? v.compression!.Pu : v.tension!.Pu).toBe(Math.abs(n));
    });
  }
}

for (const behaviour of ['tensionOnly', 'cable', 'compressionOnly', undefined]) {
  it(`#2080 — explicit behaviour ${behaviour} masks tuples and packets together`, () => {
    const ds = [packet(-100, 0, 1), packet(100, 0, 2)];
    const input = maskAxialDemand(demand(ds, 100, 100), behaviour);
    const v = checkSteelMember(1, input, section, steel, lengths)!;
    expect(!!v.compression).toBe(behaviour !== 'tensionOnly' && behaviour !== 'cable');
    expect(!!v.tension).toBe(behaviour !== 'compressionOnly');
    const stations: ElementStationResult = { elementId: 1, length: 8, stationTs: [0.5],
      comboResults: ds.map(d => ({ comboId: d.comboId, comboName: d.comboName, stations: [{ ...d.forces }] })) };
    const variable = checkVariableSteelMember(1, { sectionId: 1, behaviour }, new Map([[1, section]]) as never, steel, stations, lengths)!;
    expect(!!variable.compression).toBe(!!v.compression);
    expect(!!variable.tension).toBe(!!v.tension);
  });
}

it.fails('#2080 — flexure attribution follows utilization with its own Cb instead of the moment envelope', () => {
  const seed = checkSteelMember(1, demand([packet(-1, 1)], 1), section, steel, lengths)!;
  const M = 0.5 * seed.flexureZ.phiMn;
  const ts = [0, 0.25, 0.5, 0.75, 1];
  const stations: ElementStationResult = { elementId: 1, length: 8, stationTs: ts, comboResults: [
    { comboId: 1, comboName: 'uniform', stations: ts.map(t => ({ ...packet(0, M).forces, t, x: 8 * t })) },
    { comboId: 2, comboName: 'end moment', stations: ts.map(t => ({ ...packet(0, t === 0 ? 1.8 * M : 0).forces, t, x: 8 * t })) },
  ] };
  const actual = checkSteelMember(1, steelDemandOf(ef, undefined, stations), section, steel, lengths)!;
  const own = stations.comboResults.map(c => checkSteelMember(1, steelDemandOf(ef, undefined, { ...stations, comboResults: [c] }), section, steel, lengths)!);
  expect(own[0]!.flexureZ.ratio).toBeGreaterThan(own[1]!.flexureZ.ratio);
  expect(actual.flexureZ.ratio).toBe(own[0]!.flexureZ.ratio);
  expect(actual.governingCombos!.flexure!.comboId).toBe(1);
});
