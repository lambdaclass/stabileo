import { expect, it } from 'vitest';
import { ConcurrentDemand } from '../concurrent-demand';
import { checkFlexure, prepareElementVerification, verifyElement, amplifiedDemand, type ConcurrentVerificationInput } from '../codes/argentina/cirsoc201';
import { verifyConcurrentElement } from '../concurrent-verification';
import { evaluateBeamSection } from '../codes/argentina/cirsoc201-beam-kernel';
import { verifyElement as manual } from './helpers/verify-element';

const geometry = { b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 };
const station = (t: number, m: number) => ({ t, x: 4 * t, n: -300, my: m, mz: m, vy: 0, vz: 0, torsion: 0 });
for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) {
  for (const elementType of ['beam', 'column', 'wall'] as const) {
    it(`#2080 selected bars determine depth and shared capacity ${edition} ${axis} ${elementType}`, () => {
      const inputs = ConcurrentDemand.fromTuples([20, 100].map((m, i) => ({ comboId: i, comboName: `${i}`, forces: { ...station(0.5, m), n: 0 } })))
        .map(d => ({ ...geometry, edition, elementId: 1, elementType, demand: d.section(axis) }));
      const large = verifyElement(inputs[1]!).flexure;
      const depth = geometry.h - geometry.cover - geometry.stirrupDia / 1000 - large.barDia / 2000;
      const oracle = evaluateBeamSection({ edition, fc: geometry.fc * 1e6, fy: geometry.fy * 1e6, b: geometry.b, h: geometry.h,
        d: depth, As: large.AsProv * 1e-4, AsComp: 0, dPrime: 0, Ag: geometry.b * geometry.h, NuCompression: 0 })!;
      const staleDepth = { ...large, d: 0.399 };
      for (const v of [verifyElement(inputs[1]!), verifyElement(inputs[0]!, { flexure: large }),
        prepareElementVerification(inputs[0]!)({ flexure: staleDepth }),
        ...verifyConcurrentElement(inputs).concurrentChecks!.map(c => c.verification)]) {
        expect(v.flexure.d).toBe(depth);
        expect(v.flexure.phiMn).toBe(oracle.phiMn / 1000);
      }
    });
  }
  for (const Lu of [4, 6]) for (const loading of [true, undefined]) for (const elementType of ['column', 'wall'] as const) {
    it(`#2080 transverse or unknown load forbids end gradient ${edition} ${axis} ${elementType} ${loading} Lu=${Lu}`,  () => {
      const demands = ConcurrentDemand.fromStations({ elementId: 1, length: 4, stationTs: [0, 0.5, 1], comboResults: [{
        comboId: 1, comboName: 'loaded', transverseLoading: { My: loading, Mz: loading },
        stations: [station(0, -20), station(0.5, 60), station(1, 20)],
      }] } as Parameters<typeof ConcurrentDemand.fromStations>[0]);
      const inputs: ConcurrentVerificationInput[] = demands.map(d => ({ ...geometry, edition, elementId: 1, elementType, Lu, demand: d.section(axis) }));
      for (const v of [verifyElement(inputs[1]!), prepareElementVerification(inputs[1]!)(), ...verifyConcurrentElement(inputs).concurrentChecks!.map(c => c.verification)]) {
        expect(v.slender!.isSlender).toBe(true);
        expect(v.slender!.Cm).toBe(1);
        expect(v.slenderSecondary!.Cm).toBe(1);
      }
      const equivalent = { ...inputs[1]!, M1: 60, M2: 60, M1Secondary: 60, M2Secondary: 60 };
      expect(amplifiedDemand(inputs[1]!).Mu).toBe(amplifiedDemand(equivalent).Mu);
    });
  }
}
for (const extra of [{ NuShear: 0 }, { axialLoads: [0] }, { NuShear: -20, axialLoads: [0, 50] }]) {
  it(`#2080 manual adapter retains its distinct compression ${JSON.stringify(extra)}`, () => {
    const result = manual({ ...geometry, elementId: 1, elementType: 'column', Mu: 30, Vu: 10, Nu: 300, ...extra });
    expect(result.concurrentChecks?.map(c => c.demand.section('Mz').Nu) ?? [result.column!.Nu]).toContain(300);
  });
}
it('correct independent flexural capacity remains the kernel answer', () => {
  const f = checkFlexure(geometry, 100);
  const d = geometry.h - geometry.cover - geometry.stirrupDia / 1000 - f.barDia / 2000;
  expect(f.phiMn).toBe(evaluateBeamSection({ edition: '2025', fc: geometry.fc * 1e6, fy: geometry.fy * 1e6,
    b: geometry.b, h: geometry.h, d, As: f.AsProv * 1e-4, AsComp: 0, dPrime: 0, Ag: geometry.b * geometry.h, NuCompression: 0 })!.phiMn / 1000);
});

for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) {
  it(`known unloaded end gradient remains available ${edition} ${axis}`, () => {
    const source = ConcurrentDemand.fromStations({ elementId: 1, length: 4, stationTs: [0, 1], comboResults: [{
      comboId: 1, comboName: 'end actions', transverseLoading: { My: false, Mz: false }, stations: [station(0, -20), station(1, 20)],
    }] })[0]!;
    const v = verifyElement({ ...geometry, edition, elementId: 1, elementType: 'column', Lu: 8, demand: source.section(axis) });
    expect(v.slender!.Cm).toBe(0.4);
    expect(v.slenderSecondary!.Cm).toBe(0.4);
  });
}
for (const factor of [1 - 1e-8, 1, 1 + 1e-8]) it(`unknown loading uses the conservative slenderness boundary ${factor}`, () => {
  const d = ConcurrentDemand.fromTuples([{ comboId: 1, comboName: 'unknown', forces: station(0.5, 20) }])[0]!;
  const v = verifyElement({ ...geometry, elementId: 1, elementType: 'column', Lu: 0.3 * geometry.h * 22 * factor, demand: d.section('My') });
  expect(v.slender!.isSlender).toBe(factor > 1);
  expect(v.slender!.Cm).toBe(1);
});
for (const delta of [-1e-7, 0, 1e-7]) it(`fixed selected cage keeps its capacity boundary ${delta}`, () => {
  const cage = checkFlexure(geometry, 100);
  const oracle = cage.phiMn;
  const demand = ConcurrentDemand.fromTuples([{ comboId: 1, comboName: 'boundary', forces: { ...station(0.5, oracle * (1 + delta)), n: 0 } }])[0]!;
  const v = verifyElement({ ...geometry, elementId: 1, elementType: 'beam', demand: demand.section('My') }, { flexure: cage });
  expect(v.flexure.phiMn).toBe(oracle);
  expect(v.flexure.ratio).toBeCloseTo(1 + delta, 12);
  expect(v.flexure.status === 'fail').toBe(delta > 0);
});

for (const stirrupDia of [8, 12]) it(`#2080 a fixed cage derives depth from the receiving section and stirrups ${stirrupDia}`, () => {
  const cage = checkFlexure(geometry, 100);
  const section = { ...geometry, h: 0.45, stirrupDia };
  const demand = ConcurrentDemand.fromTuples([{ comboId: 1, comboName: 'fixed', forces: { ...station(0.5, 20), n: 0 } }])[0]!;
  const v = verifyElement({ ...section, elementId: 1, elementType: 'beam', demand: demand.section('My') }, { flexure: cage });
  const d = section.h - section.cover - stirrupDia / 1000 - cage.barDia / 2000;
  expect(v.flexure.d).toBe(d);
  expect(v.flexure.phiMn).toBe(evaluateBeamSection({ edition: '2025', fc: section.fc * 1e6, fy: section.fy * 1e6, b: section.b, h: section.h,
    d, As: cage.AsProv * 1e-4, AsComp: 0, dPrime: 0, Ag: section.b * section.h, NuCompression: 0 })!.phiMn / 1000);
});
