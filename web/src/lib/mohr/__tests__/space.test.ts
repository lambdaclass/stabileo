import { describe, it, expect } from 'vitest';
import { PRESETS, principal3, invariants3, onPlane, normalFromAngles, anglesFromNormal, octahedralNormal, octahedralShear, sphereSamples, matrixOf, planeBasis, planeThroughCube, splitTraction, maxShearNormal, type Vec3, type Tensor3 } from '../space';

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

  it('the octahedral plane is taken on the principal axes: σn is the mean stress and τn the octahedral shear', () => {
    const cases: Tensor3[] = [
      s,
      { xx: 100, yy: 50, zz: -40, xy: 0, xz: 0, yz: 0 },
      { xx: -12, yy: 7, zz: 3, xy: -9, xz: 4, yz: 11 },
      ...Object.values(PRESETS),
      { xx: 30, yy: 30, zz: -10, xy: 0, xz: 0, yz: 0 },
      { xx: 5, yy: 5, zz: 5, xy: 2, xz: 2, yz: 2 },
      { xx: 0, yy: 0, zz: 0, xy: 0, xz: 0, yz: 0 },
    ];
    for (const t of cases) {
      const p = principal3(t);
      const n = octahedralNormal(p.directions);
      expect(Math.hypot(...n)).toBeCloseTo(1, 12);
      expect(n[2]).toBeGreaterThanOrEqual(0);
      for (const d of p.directions) expect(Math.abs(d[0] * n[0] + d[1] * n[1] + d[2] * n[2])).toBeCloseTo(1 / Math.sqrt(3), 9);
      const on = onPlane(t, n);
      const scale = Math.max(1, ...Object.values(t).map(Math.abs));
      expect(Math.abs(on.sigmaN - invariants3(t).mean)).toBeLessThan(1e-9 * scale);
      expect(Math.abs(on.tauN - octahedralShear(p.values))).toBeLessThan(1e-7 * scale);
    }
    expect(onPlane(s, octahedralNormal(principal3(s).directions)).sigmaN).toBeCloseTo(70 / 3, 9);
    expect(octahedralShear([100, 50, -40])).toBeCloseTo(Math.sqrt(50 ** 2 + 90 ** 2 + 140 ** 2) / 3, 12);
    expect(octahedralShear([-60, -60, -60])).toBe(0);
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

describe('the cutting plane on the element', () => {
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  it('a face plane cuts the cube in a square, the octahedral plane in a hexagon, all points on the plane and in order', () => {
    for (const [n, count] of [[[1, 0, 0], 4], [[0, 0, 1], 4], [[1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)], 6], [[r, r, 0], 4], [normalFromAngles(30, 60), 6]] as [Vec3, number][]) {
      const poly = planeThroughCube(n, 2);
      expect(poly).toHaveLength(count);
      for (const p of poly) {
        expect(dot(p, n)).toBeCloseTo(0, 9);
        expect(Math.max(...p.map(Math.abs))).toBeLessThanOrEqual(2 + 1e-9);
      }
      const [e1, e2] = planeBasis(n);
      const angles = poly.map((p) => Math.atan2(dot(p, e2), dot(p, e1)));
      expect([...angles].sort((a, b) => a - b)).toEqual(angles);
    }
  });
  it('the plane basis is orthonormal and right-handed with n', () => {
    for (const n of [[0, 0, 1], [1, 0, 0], normalFromAngles(30, 60)] as Vec3[]) {
      const [e1, e2] = planeBasis(n);
      expect(dot(e1, e2)).toBeCloseTo(0, 12);
      expect(dot(e1, n)).toBeCloseTo(0, 12);
      expect(Math.hypot(...e2)).toBeCloseTo(1, 12);
      const cross: Vec3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      close(cross, n, 12);
    }
  });
  it('splits the traction into σn along n and τn in the plane', () => {
    const n = normalFromAngles(30, 60);
    const { t, normal, shear, sigmaN, tauN } = splitTraction(PRESETS.general, n);
    close(normal.map((v, i) => v + shear[i]), t, 12);
    expect(dot(shear, n)).toBeCloseTo(0, 9);
    expect(Math.hypot(...shear)).toBeCloseTo(tauN, 9);
    expect(sigmaN).toBeCloseTo(59.73, 2);
  });
  it('the plane halfway between σ1 and σ3 carries τmax', () => {
    const p = principal3(PRESETS.general);
    const { tauN } = onPlane(PRESETS.general, maxShearNormal(p.directions));
    expect(tauN).toBeCloseTo(invariants3(PRESETS.general).tauMax, 8);
  });
});
