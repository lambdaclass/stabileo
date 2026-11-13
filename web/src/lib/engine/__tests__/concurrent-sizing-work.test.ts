import { afterEach, expect, it, vi } from 'vitest';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyConcurrentElement } from '../concurrent-verification';
import { amplifiedDemand, checkColumn, verifyElement, verificationCase, type ConcurrentVerificationInput } from '../codes/argentina/cirsoc201';
import { engineRecheckElement } from '../codes/argentina/cirsoc201-engine-gate';
import * as engine from '../codes/argentina/cirsoc201-engine';

const cases = (['beam', 'column', 'wall'] as const).flatMap(elementType =>
  (['My', 'Mz'] as const).flatMap(axis => (['2005', '2025'] as const).map(edition => ({ elementType, axis, edition }))));

function inputsFor({ elementType, axis, edition }: typeof cases[number]): ConcurrentVerificationInput[] {
  return ConcurrentDemand.fromTuples([0, 1, 2, 3].map(i => ({ comboId: i + 1, comboName: `comb ${i + 1}`,
    forces: { n: [0, -100, 100, -300][i]!, my: [20, -65, 55, 20][i]!, mz: [15, 25, -35, 10][i]!,
      vy: 5 + i, vz: 10 - i, torsion: i, t: i / 3, x: i / 3 * 0.4 },
  }))).map(demand => ({ elementId: 1, elementType, edition, demand: demand.section(axis),
    b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8, Lu: 0.4 }));
}

function referenceChecks(inputs: readonly ConcurrentVerificationInput[]) {
  const first = inputs[0]!;
  const column = first.elementType !== 'beam' ? checkColumn(first, inputs.map(amplifiedDemand), { edition: first.edition }) : undefined;
  const fixedColumn = column ? { barCount: column.barCount, barDia: column.barDia } : undefined;
  const preliminary = inputs.map(i => verifyElement(i, { column: fixedColumn }));
  const maxFlexure = preliminary.reduce((a, b) => b.flexure.AsProv > a.flexure.AsProv ? b : a).flexure;
  const maxCompression = preliminary.reduce((a, b) => (b.flexure.AsComp ?? 0) > (a.flexure.AsComp ?? 0) ? b : a).flexure;
  const flexure = { ...maxFlexure, AsComp: maxCompression.AsComp, barCountComp: maxCompression.barCountComp,
    barDiaComp: maxCompression.barDiaComp, barsComp: maxCompression.barsComp, isDoublyReinforced: maxCompression.isDoublyReinforced };
  const shear = { spacing: Math.min(...preliminary.flatMap(v => [v.shear.spacing, v.shearSecondary?.spacing ?? Infinity])),
    legs: Math.max(...preliminary.flatMap(v => [v.shear.stirrupLegs, v.shearSecondary?.stirrupLegs ?? 0])) };
  return inputs.map(i => ({ demand: i.demand.source,
    verification: engineRecheckElement(verifyElement(i, { column: fixedColumn, flexure, shear }),
      { edition: i.edition, stirrupDia: i.stirrupDia, NuShear: verificationCase(i).Nu }),
  }));
}

afterEach(() => vi.restoreAllMocks());

it.fails.each(cases)('#2080 — $elementType $axis $edition sizes each station once while checking the shared cage', options => {
  const inputs = inputsFor(options);
  const get = engine.cirsoc201Engine;
  const sizing = vi.fn(get('designBeam'));
  vi.spyOn(engine, 'cirsoc201Engine').mockImplementation(<K extends keyof engine.Cirsoc201Engine>(key: K): engine.Cirsoc201Engine[K] =>
    key === 'designBeam' ? sizing as engine.Cirsoc201Engine[K] : get(key));
  inputs.forEach(i => verifyElement(i));
  const once = sizing.mock.calls.length;
  expect(once).toBeGreaterThan(0);
  sizing.mockClear();
  verifyConcurrentElement(inputs);
  expect(sizing).toHaveBeenCalledTimes(once);
});

it.each(cases)('$elementType $axis $edition retains every exact shared-cage result and certificate', options => {
  const inputs = inputsFor(options);
  expect(verifyConcurrentElement(inputs).concurrentChecks).toEqual(referenceChecks(inputs));
  expect(verifyConcurrentElement([inputs[0]!]).concurrentChecks).toEqual(referenceChecks([inputs[0]!]));
});

it('refuses an empty concurrent set', () => {
  expect(() => verifyConcurrentElement([])).toThrow('Concurrent demands are required for verification');
});
