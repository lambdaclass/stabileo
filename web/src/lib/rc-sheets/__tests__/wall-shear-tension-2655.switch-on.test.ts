import { expect, it } from 'vitest';
import { wallRow } from '../wall-row';
import { makeFmt } from '../format';

it('known wrong result: #2655 pairs shear with signed axial force in each sheet combination', () => {
  const length = 4, thickness = 0.2;
  const fc = 25, fy = 420;
  const ag = length * thickness;
  const puLimit = -3500 * ag;
  const pu = [1, 0, -400, puLimit + 1, puLimit, puLimit - 1];
  const adopted = { curtains: 2 as const, vertical: { diameter: 20, spacing: 0.1 }, horizontal: { diameter: 10, spacing: 0.2 } };
  const combos = pu.map((p, i) => ({ pu: p, combo: String(i), mu: 0, vu: 500, muV: 0, muH: 0 }));
  const sheet = wallRow({ key: 'wall', name: 'wall', length, thickness, height: 3, combos },
    { mat: { fc, fy }, cover: 0.025, diameters: [10, 20], barDia: 10 }, adopted, makeFmt('.'));
  const rho = 2 * 0.785 * 1e-4 / (adopted.horizontal.spacing * thickness);
  const area = 2 * (Math.floor(length / adopted.vertical.spacing) + 1) * Math.PI * 0.01 ** 2;
  for (const [i, row] of sheet.combos.rows.entries()) {
    const p = pu[i]!;
    const alpha = 0.17 * Math.max(0, 1 + Math.min(0, p) / (3500 * ag));
    const shear = 0.75 * Math.min(0.66 * Math.sqrt(fc), alpha * Math.sqrt(fc) + rho * fy) * ag * 1000;
    expect(Number(row.values[0])).toBe(p);
    expect(row.ratio).toBeCloseTo(Math.max(500 / shear, -p / (0.9 * fy * area * 1000)), 6);
  }
});
