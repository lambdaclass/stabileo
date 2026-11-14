import { expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyElement } from '../codes/argentina/cirsoc201';
import { computeStationDemands } from '../verification-service';
import { autoVerifyFromResults } from '../auto-verify';
import { verifyConcurrentElement } from '../concurrent-verification';

it('#2080 the recorded shared cage is regenerated from the selected bars', () => {
  const path = '../docs/results-changes/fixtures/2080-flange-span-witness.json';
  const fixture = JSON.parse(readFileSync(path, 'utf8'));
  const { momentCases, ...geometry } = fixture.sharedCage.input;
  const inputs = momentCases.map((m: number, i: number) => ({ ...geometry, elementId: 1,
    demand: ConcurrentDemand.fromTuples([{ comboId: i + 1, comboName: `C${i + 1}`, forces: {
      t: 0.5, x: 2, n: 0, my: m, mz: m, vy: 1, vz: 1, torsion: 0,
    } }])[0]!.section('My') }));
  const record = (f: ReturnType<typeof verifyElement>['flexure']) => ({ d: f.d, AsProv: f.AsProv, bars: f.bars, phiMn: f.phiMn, ratio: f.ratio, steps: f.steps });
  const fixed = { small: record(verifyElement(inputs[0]!).flexure), large: record(verifyElement(inputs[1]!).flexure),
    shared: record(verifyConcurrentElement(inputs).concurrentChecks![0]!.verification.flexure) };
  expect(fixed.shared.d).toBe(geometry.h - geometry.cover - geometry.stirrupDia / 1000 - verifyElement(inputs[1]!).flexure.barDia / 2000);
  expect(fixed.shared.phiMn).toBe(fixed.large.phiMn);
  if (process.env.REGENERATE_R8) {
    fixture.sharedCage.fixed = fixed;
    writeFileSync(path, JSON.stringify(fixture, null, 2) + '\n');
  }
  expect(fixture.sharedCage.fixed).toEqual(fixed);
});

it('#2080 main solved transverse column receives the unity control moment', () => {
  const fixture = JSON.parse(readFileSync('../docs/results-changes/fixtures/2080-round8-main-witness.json', 'utf8'));
  const solved = fixture.solved;
  const model = Object.fromEntries(Object.entries(solved.model).map(([key, entries]) => [key, new Map(entries as never)])) as never;
  const data = computeStationDemands(new Map([[1, solved.raw]]), [{ id: 1, name: 'transverse', factors: [] }], model);
  const v = autoVerifyFromResults(solved.raw, model, null, undefined, data.demands).concrete[0]!;
  expect(v.slender!.Cm).toBe(1);
  expect(v.slender!.Mc).toBe(solved.unity.slender.Mc);
  expect(solved.actual.slender.Mc).toBeLessThan(v.slender!.Mc);
});
