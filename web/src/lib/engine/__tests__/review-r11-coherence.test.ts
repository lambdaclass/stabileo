import { expect, it } from 'vitest';
import tower from '../../../../results-snapshots/design-steel-3d-tower.json';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyConcurrentElement } from '../concurrent-verification';
import { normalizeCirsoc201 } from '../design-check-results';
import { prepareElementVerification, verifyElement } from '../codes/argentina/cirsoc201';

it('#2080 tower e12 stores the concurrent interaction in its engine summary and recheck', () => {
  const v = tower.values['design.steel[e12]'];
  expect(v['engine.unityRatio']).toBe(v['interaction.ratio']);
  expect(v['engine.unityRatio']).toBe(v['engineRecheck.utilizationLower']);
  expect(v['engine.unityRatio']).toBe(v['engineRecheck.utilizationUpper']);
});

for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) {
  for (const elementType of ['column', 'wall'] as const) for (const sign of [-1, 1]) {
    it(`#2080 biaxial row keeps its concurrent resultant ${edition} ${axis} ${elementType} ${sign}`, () => {
      const demands = ConcurrentDemand.fromTuples([
        { comboId: 1, comboName: 'primary', forces: { n: -100, my: axis === 'My' ? sign * 100 : 1, mz: axis === 'Mz' ? sign * 100 : 1, vy: 0, vz: 0, torsion: 0, t: 0, x: 0 } },
        { comboId: 2, comboName: 'biaxial', forces: { n: -100, my: sign * 80, mz: 80, vy: 0, vz: 0, torsion: 0, t: 1, x: 1 } },
      ]);
      const inputs = demands.map(demand => ({ elementId: 1, elementType, edition, b: 0.4, h: 0.4,
        fc: 30, fy: 420, cover: 0.025, stirrupDia: 8, demand: demand.section(axis) }));
      const aggregate = verifyConcurrentElement(inputs);
      expect(aggregate.governingCombos!.column!.comboId).not.toBe(aggregate.governingCombos!.biaxial!.comboId);
      const own = aggregate.concurrentChecks!.find(c => c.demand.comboId === aggregate.governingCombos!.biaxial!.comboId)!.verification.biaxial!;
      for (const v of [aggregate, ...inputs.flatMap(i => [verifyElement(i), prepareElementVerification(i)()])]) {
        const biaxial = v.biaxial!;
        expect(biaxial.Mres).toBe(Math.hypot(biaxial.Muy, biaxial.Muz));
        for (const Mu of [v.Mu, 0, 999]) {
          const row = normalizeCirsoc201([{ ...v, Mu }], new Map())[0]!.checks.find(c => c.name === 'Biaxial (load contour)')!;
          expect(row.demand).toBe(Math.hypot(biaxial.Muy, biaxial.Muz));
          expect(row.ratio).toBe(biaxial.ratio);
          expect(row.capacity).toBe(biaxial.phiMn);
          expect(row.comboName).toBe(v.governingCombos?.biaxial?.comboName);
        }
      }
      expect(aggregate.biaxial).toEqual(own);
    });
  }
}
