/**
 * Sway storeys (§6.6.4.3) and δs (§6.6.4.6.2), by hand. One storey, two 3 m columns carrying
 * 1000 kN each and 50 kN of shear each along X. Q = ΣPu·Δo/(Vus·lc) = 2000·Δo/(100·3):
 *   Δo = 6 mm  → Q = 0,04, non-sway;
 *   Δo = 12 mm → Q = 0,08, δs = 1/(1 − 0,08) = 1,0870;
 *   Δo = 60 mm → Q = 0,40, 1/(1 − Q) = 1,67 > 1,5, so δs = 1/(1 − ΣPu/(0,75·ΣPc)).
 */
import { describe, it, expect } from 'vitest';
import { storeyStability, swayK } from '../sway';
import { computeLocalAxes3D } from '../../local-axes-3d';

const nodes = new Map([
  [1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 3 }],
  [3, { id: 3, x: 5, y: 0, z: 0 }], [4, { id: 4, x: 5, y: 0, z: 3 }],
]);
const elements = new Map([
  [10, { id: 10, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }],
  [11, { id: 11, nodeI: 3, nodeJ: 4, sectionId: 1, materialId: 1 }],
]);
const sections = new Map([[1, { iz: 0.0016, iy: 0.0016 }]]); // 40×40
const materials = new Map([[1, { e: 25000 }]]);

function results(drift: number) {
  const ax = computeLocalAxes3D({ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 0, y: 0, z: 3 });
  // A shear of 50 kN along global X, written in the column's local y and z.
  const vy = 50 * ax.ey[0], vz = 50 * ax.ez[0];
  const f = (id: number) => ({ elementId: id, length: 3, nStart: -1000, nEnd: -1000, vyStart: vy, vyEnd: vy, vzStart: vz, vzEnd: vz, mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0 });
  const d = (id: number, ux: number) => ({ nodeId: id, ux, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 });
  return new Map([[1, { elementForces: [f(10), f(11)], displacements: [d(1, 0), d(2, drift), d(3, 0), d(4, drift)], reactions: [] } as never]]);
}

const run = (drift: number) => storeyStability({ nodes, elements, sections, materials, columns: [10, 11], perCombo: results(drift), psi: () => ({ psiA: 1, psiB: 1 }) })[0]!;

describe('sway storeys', () => {
  it('Q under 0,05 is a non-sway storey', () => {
    const s = run(0.006);
    expect(s.Q).toBeCloseTo(0.04, 9);
    expect(s.sway).toBe(false);
    expect(s.deltaS).toBe(1);
  });

  it('a sway storey gets δs = 1/(1 − Q) while that is at most 1,5', () => {
    const s = run(0.012);
    expect(s.Q).toBeCloseTo(0.08, 9);
    expect(s.direction).toBe('X');
    expect(s.method).toBe('Q');
    expect(s.deltaS).toBeCloseTo(1 / 0.92, 9);
  });

  it('past 1,5 it is read from ΣPc, with the sway k', () => {
    // k = √((1,6·1·1 + 4·2 + 7,5)/(2 + 7,5)) = √(17,1/9,5) = 1,3416.
    expect(swayK(1, 1)).toBeCloseTo(Math.sqrt(17.1 / 9.5), 9);
    const k = Math.sqrt(17.1 / 9.5);
    const Pc = (Math.PI ** 2 * 0.4 * 25e6 * 0.0016) / (k * 3) ** 2;
    const s = run(0.06);
    expect(s.method).toBe('Pc');
    expect(s.deltaS).toBeCloseTo(1 / (1 - 2000 / (0.75 * 2 * Pc)), 9);
  });

  it('a storey whose load reaches 0,75·ΣPc is unstable', () => {
    const weak = new Map([[1, { iz: 1e-6, iy: 1e-6 }]]);
    const s = storeyStability({ nodes, elements, sections: weak, materials, columns: [10, 11], perCombo: results(0.06), psi: () => ({ psiA: 1, psiB: 1 }) })[0]!;
    expect(s.method).toBe('unstable');
    expect(s.deltaS).toBe(Number.POSITIVE_INFINITY);
  });
});
