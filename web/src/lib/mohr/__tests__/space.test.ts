import { describe, it, expect } from 'vitest';
import { PRESETS, principal3, invariants3, onPlane, normalFromAngles, anglesFromNormal, OCTAHEDRAL, sphereSamples, matrixOf, type Vec3, type Tensor3 } from '../space';

const close = (a: number[], b: number[], digits = 9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));
const r = Math.SQRT1_2;

function checkEigen(s: Tensor3) {
  const { values, directions } = principal3(s);
  const m = matrixOf(s);
  for (let k = 0; k < 3; k++) {
    const v = directions[k];
    const mv = m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
    close(mv, v.map((c) => c * values[k]), 8);
    expect(Math.hypot(...v)).toBeCloseTo(1, 12);
    for (let j = k + 1; j < 3; j++) expect(v[0] * directions[j][0] + v[1] * directions[j][1] + v[2] * directions[j][2]).toBeCloseTo(0, 12);
  }
  expect(values[0]).toBeGreaterThanOrEqual(values[1]);
  expect(values[1]).toBeGreaterThanOrEqual(values[2]);
  expect([...values, ...directions.flat()].every(Number.isFinite)).toBe(true);
}

describe('principal stresses in space', () => {
  it('uniaxial tension', () => {
    const p = principal3(PRESETS.uniaxial);
    expect(p.values).toEqual([100, 0, 0]);
    close(p.directions[0], [1, 0, 0]);
    checkEigen(PRESETS.uniaxial);
  });

  it('biaxial tension has two equal principal values and no NaN', () => {
    const p = principal3(PRESETS.biaxial);
    expect(p.values).toEqual([100, 100, 0]);
    close(p.directions[2], [0, 0, 1]);
    checkEigen(PRESETS.biaxial);
  });

  it('pure shear: 50, 0, −50 along the diagonals and z', () => {
    const p = principal3(PRESETS.shear);
    close(p.values, [50, 0, -50], 12);
    close(p.directions[0], [r, r, 0]);
    close(p.directions[1], [0, 0, 1]);
    close(p.directions[2], [r, -r, 0]);
  });

  it('hydrostatic pressure: all three equal, directions still orthonormal', () => {
    const p = principal3(PRESETS.hydrostatic);
    expect(p.values).toEqual([-60, -60, -60]);
    checkEigen(PRESETS.hydrostatic);
    expect(invariants3(PRESETS.hydrostatic).vonMises).toBe(0);
    expect(invariants3(PRESETS.hydrostatic).tauMax).toBe(0);
  });

  it('the zero tensor', () => {
    const p = principal3({ xx: 0, yy: 0, zz: 0, xy: 0, xz: 0, yz: 0 });
    expect(p.values).toEqual([0, 0, 0]);
    checkEigen({ xx: 0, yy: 0, zz: 0, xy: 0, xz: 0, yz: 0 });
  });

  it('triaxial on principal axes is read straight off the diagonal', () => {
    const p = principal3(PRESETS.triaxial);
    expect(p.values).toEqual([100, 50, -40]);
    close(p.directions[0], [1, 0, 0]);
    close(p.directions[1], [0, 1, 0]);
    close(p.directions[2], [0, 0, 1]);
  });

  it('a general state', () => {
    const s = PRESETS.general;
    const p = principal3(s);
    close(p.values, [92.53, 14.57, -37.10], 2);
    close(p.directions[0], [0.926, 0.377, -0.029], 3);
    checkEigen(s);
    const inv = invariants3(s);
    expect(inv.i1).toBe(70);
    expect(p.values[0] + p.values[1] + p.values[2]).toBeCloseTo(inv.i1, 9);
    expect(p.values[0] * p.values[1] * p.values[2]).toBeCloseTo(inv.i3, 6);
    expect(p.values[0] * p.values[1] + p.values[1] * p.values[2] + p.values[2] * p.values[0]).toBeCloseTo(inv.i2, 6);
    expect(inv.mean).toBeCloseTo(23.3333, 4);
    expect(inv.vonMises).toBeCloseTo(113.03, 2);
    const [a, b, c] = p.values;
    expect(inv.vonMises).toBeCloseTo(Math.sqrt(((a - b) ** 2 + (b - c) ** 2 + (c - a) ** 2) / 2), 8);
    expect(inv.tauMax).toBeCloseTo(64.81, 2);
  });

  it('nearly repeated values stay finite and ordered', () => {
    for (const eps of [1e-6, 1e-10, 1e-14]) checkEigen({ xx: 50, yy: 50 + eps, zz: 50, xy: eps, xz: 0, yz: -eps });
  });
});

describe('traction on a plane', () => {
  const s = PRESETS.general;

  it('Face x reads the first column', () => {
    const p = onPlane(s, [1, 0, 0]);
    expect(p.t).toEqual([80, 30, -10]);
    expect(p.sigmaN).toBe(80);
    expect(p.tauN).toBeCloseTo(Math.hypot(30, 10), 12);
  });

  it('Face z reads the third column', () => {
    const p = onPlane(s, normalFromAngles(0, 0));
    close(p.t, [-10, 15, -30], 12);
    expect(p.sigmaN).toBeCloseTo(-30, 12);
    expect(p.tauN).toBeCloseTo(Math.hypot(10, 15), 12);
  });

  it('the octahedral plane', () => {
    const n = normalFromAngles(OCTAHEDRAL.phi, OCTAHEDRAL.theta);
    close(n, [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)], 12);
    const p = onPlane(s, n);
    expect(p.sigmaN).toBeCloseTo(140 / 3, 9);
    expect(p.tauN).toBeCloseTo(52.6519, 3);
    const principalOct = onPlane({ xx: 100, yy: 50, zz: -40, xy: 0, xz: 0, yz: 0 }, n);
    expect(principalOct.sigmaN).toBeCloseTo(110 / 3, 9);
    expect(principalOct.tauN).toBeCloseTo(Math.sqrt((50 ** 2 + 90 ** 2 + 140 ** 2)) / 3, 9);
  });

  it('the plane at φ = 30°, θ = 60°', () => {
    const n = normalFromAngles(30, 60);
    close(n, [0.75, Math.sqrt(3) / 4, 0.5], 12);
    const p = onPlane(s, n);
    expect(p.sigmaN).toBeCloseTo(59.73, 2);
    expect(p.tauN).toBeCloseTo(52.97, 2);
  });

  it('every plane lands inside the three Mohr circles', () => {
    const [a, b, c] = principal3(s).values;
    for (const n of sphereSamples(400)) {
      const { sigmaN, tauN } = onPlane(s, n);
      const outer = (sigmaN - (a + c) / 2) ** 2 + tauN ** 2 - ((a - c) / 2) ** 2;
      const inner12 = (sigmaN - (a + b) / 2) ** 2 + tauN ** 2 - ((a - b) / 2) ** 2;
      const inner23 = (sigmaN - (b + c) / 2) ** 2 + tauN ** 2 - ((b - c) / 2) ** 2;
      expect(outer).toBeLessThanOrEqual(1e-6);
      expect(inner12).toBeGreaterThanOrEqual(-1e-6);
      expect(inner23).toBeGreaterThanOrEqual(-1e-6);
    }
  });
});

describe('plane angles', () => {
  it('round-trip through the normal', () => {
    for (const [phi, theta] of [[30, 60], [-120, 10], [180, 90], [0, 0], [45, 180]]) {
      const back = anglesFromNormal(normalFromAngles(phi, theta));
      expect(back.theta).toBeCloseTo(theta, 9);
      if (theta % 180 !== 0) expect(((back.phi - phi) % 360 + 360) % 360 < 1e-9 || ((back.phi - phi) % 360 + 360) % 360 > 360 - 1e-9).toBe(true);
    }
  });

  it('sphere samples are unit vectors', () => {
    const samples = sphereSamples(250);
    expect(samples).toHaveLength(250);
    for (const v of samples as Vec3[]) expect(Math.hypot(...v)).toBeCloseTo(1, 12);
  });
});
