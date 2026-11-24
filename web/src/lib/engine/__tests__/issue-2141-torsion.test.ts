import { declaredTestDemands } from './helpers/declared-demands';
import { expect, it } from 'vitest';
import { verifyElement } from '../codes/argentina/cirsoc201';
import { checkTorsion2025 } from '../../codes/cirsoc201/torsion';

const p = { b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
for (const edition of ['2005', '2025'] as const) {
  it(`known wrong result: #2141 shear-designed stirrups cannot pass torsion ${edition}`, () => {
    const demand = declaredTestDemands([{ comboId: 1, comboName: 'torsion', forces: {
      t: 0, x: 0, n: 0, my: 20, mz: 0, vy: 0, vz: 0, torsion: 30,
    } }])[0]!.section('My');
    const v = verifyElement({ ...p, edition, elementId: 1, elementType: 'beam', demand,
      Mu: 20, Muy: 0, Nu: 0, Vu: 0, Tu: 30 } as never);
    const actual = checkTorsion2025({ ...p, d: v.shear.d, stirrupDiaMm: p.stirrupDia,
      fyt: p.fy, demand, stirrup: { diameter: p.stirrupDia, legs: v.shear.stirrupLegs, spacing: v.shear.spacing } });
    expect(actual.ratio).toBeGreaterThan(1);
    expect(v.torsion!.status).toBe('fail');
    expect(v.overallStatus).toBe('fail');
  });
}
