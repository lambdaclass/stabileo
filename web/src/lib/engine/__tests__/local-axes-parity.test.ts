/**
 * Cross-solver local axes parity test.
 *
 * Verifies that computeLocalAxes3D produces the SAP2000/textbook convention
 * for every canonical element orientation. If either solver's convention
 * drifts, these tests catch it immediately.
 *
 * Convention (auto-orient, no explicit localY):
 *   - Non-vertical (|ex . Y| <= 0.999): ey_ref = [0,1,0]
 *   - Vertical     (|ex . Y| >  0.999): ey_ref = [0,0,1]
 *   - ez = normalize(ex x ey_ref)
 *   - ey = ez x ex
 */

import { describe, it, expect } from 'vitest';
import { computeLocalAxes3D } from '../local-axes-3d';
import type { SolverNode3D } from '../types-3d';

// ─── Helpers ─────────────────────────────────────────────────────

function dot(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: number[], b: number[]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function norm3(v: number[]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function normalize3(v: number[]): [number, number, number] {
  const n = norm3(v);
  return [v[0] / n, v[1] / n, v[2] / n];
}

/** Determinant of 3x3 matrix [row0; row1; row2] = scalar triple product */
function det3(r0: number[], r1: number[], r2: number[]): number {
  return dot(r0, cross3(r1, r2));
}

/**
 * Compute expected local axes using the SAP2000/textbook reference algorithm.
 * This is the "ground truth" we check both solvers against.
 */
function expectedAxes(
  dx: number, dy: number, dz: number,
): { ex: [number, number, number]; ey: [number, number, number]; ez: [number, number, number] } {
  const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const ex: [number, number, number] = [dx / L, dy / L, dz / L];

  // Vertical detection: |ex . Y| > 0.999
  const eyRef: [number, number, number] = Math.abs(ex[1]) > 0.999
    ? [0, 0, 1]
    : [0, 1, 0];

  const ezRaw = cross3(ex, eyRef);
  const ez = normalize3(ezRaw);
  const ey = normalize3(cross3(ez, ex));

  return { ex, ey, ez };
}

/** Assert two vectors are component-wise close */
function expectVec(actual: number[], expected: number[], tol = 1e-10) {
  expect(actual[0]).toBeCloseTo(expected[0], 9);
  expect(actual[1]).toBeCloseTo(expected[1], 9);
  expect(actual[2]).toBeCloseTo(expected[2], 9);
}

/** Assert orthogonality and right-handedness of a triad */
function assertOrthonormalRightHanded(
  ex: number[], ey: number[], ez: number[],
  label: string,
) {
  const tol = 1e-10;
  // Orthogonality
  expect(Math.abs(dot(ex, ey))).toBeLessThan(tol);
  expect(Math.abs(dot(ey, ez))).toBeLessThan(tol);
  expect(Math.abs(dot(ex, ez))).toBeLessThan(tol);
  // Unit vectors
  expect(Math.abs(norm3(ex) - 1)).toBeLessThan(tol);
  expect(Math.abs(norm3(ey) - 1)).toBeLessThan(tol);
  expect(Math.abs(norm3(ez) - 1)).toBeLessThan(tol);
  // Right-handedness: det([ex; ey; ez]) = 1
  expect(det3(ex, ey, ez)).toBeCloseTo(1, 9);
}

// ─── Orientation Cases ───────────────────────────────────────────

interface OrientationCase {
  label: string;
  dx: number; dy: number; dz: number;
}

const orientations: OrientationCase[] = [
  { label: 'Horizontal +X',          dx:  5, dy:  0, dz:  0 },
  { label: 'Horizontal -X',          dx: -5, dy:  0, dz:  0 },
  { label: 'Horizontal +Z',          dx:  0, dy:  0, dz:  5 },
  { label: 'Horizontal -Z',          dx:  0, dy:  0, dz: -5 },
  { label: 'Vertical +Y',            dx:  0, dy:  5, dz:  0 },
  { label: 'Vertical -Y',            dx:  0, dy: -5, dz:  0 },
  { label: 'Diagonal XY (45 deg)',   dx:  3, dy:  3, dz:  0 },
  { label: 'Diagonal XZ',            dx:  3, dy:  0, dz:  4 },
  { label: 'Diagonal XYZ (arbitrary)', dx: 3, dy: 4, dz: 5 },
];

// ─── Tests ───────────────────────────────────────────────────────

describe('Local axes parity — SAP2000/textbook convention', () => {
  for (const tc of orientations) {
    it(`${tc.label}: matches reference algorithm`, () => {
      const nI: SolverNode3D = { id: 1, x: 0, y: 0, z: 0 };
      const nJ: SolverNode3D = { id: 2, x: tc.dx, y: tc.dy, z: tc.dz };
      const axes = computeLocalAxes3D(nI, nJ);
      const ref = expectedAxes(tc.dx, tc.dy, tc.dz);

      expectVec(axes.ex, ref.ex);
      expectVec(axes.ey, ref.ey);
      expectVec(axes.ez, ref.ez);
    });

    it(`${tc.label}: orthonormal right-handed triad`, () => {
      const nI: SolverNode3D = { id: 1, x: 0, y: 0, z: 0 };
      const nJ: SolverNode3D = { id: 2, x: tc.dx, y: tc.dy, z: tc.dz };
      const axes = computeLocalAxes3D(nI, nJ);
      assertOrthonormalRightHanded(axes.ex, axes.ey, axes.ez, tc.label);
    });
  }
});

describe('Local axes parity — rollAngle', () => {
  const angles = [30, 45, 90, 180, -45, 270];

  for (const angle of angles) {
    it(`+X bar with rollAngle=${angle} deg: orthonormal & right-handed`, () => {
      const nI: SolverNode3D = { id: 1, x: 0, y: 0, z: 0 };
      const nJ: SolverNode3D = { id: 2, x: 5, y: 0, z: 0 };
      const axes = computeLocalAxes3D(nI, nJ, undefined, angle);
      assertOrthonormalRightHanded(axes.ex, axes.ey, axes.ez, `roll ${angle}`);
      // ex should be unchanged by roll
      expectVec(axes.ex, [1, 0, 0]);
    });

    it(`Diagonal XYZ with rollAngle=${angle} deg: orthonormal & right-handed`, () => {
      const nI: SolverNode3D = { id: 1, x: 0, y: 0, z: 0 };
      const nJ: SolverNode3D = { id: 2, x: 3, y: 4, z: 5 };
      const axes = computeLocalAxes3D(nI, nJ, undefined, angle);
      assertOrthonormalRightHanded(axes.ex, axes.ey, axes.ez, `diag roll ${angle}`);
    });
  }

  it('+X bar rollAngle=90: ey rotates to ez, ez rotates to -ey', () => {
    const nI: SolverNode3D = { id: 1, x: 0, y: 0, z: 0 };
    const nJ: SolverNode3D = { id: 2, x: 5, y: 0, z: 0 };
    const base = computeLocalAxes3D(nI, nJ);
    const rolled = computeLocalAxes3D(nI, nJ, undefined, 90);
    // After 90 deg roll: ey_new = cos(90)*ey + sin(90)*ez = ez
    expectVec(rolled.ey, base.ez);
    // ez_new = -sin(90)*ey + cos(90)*ez = -ey
    expectVec(rolled.ez, [-base.ey[0], -base.ey[1], -base.ey[2]]);
  });
});

describe('Local axes parity — leftHand option', () => {
  for (const tc of orientations) {
    it(`${tc.label}: leftHand negates ey, det = -1`, () => {
      const nI: SolverNode3D = { id: 1, x: 0, y: 0, z: 0 };
      const nJ: SolverNode3D = { id: 2, x: tc.dx, y: tc.dy, z: tc.dz };
      const rh = computeLocalAxes3D(nI, nJ);
      const lh = computeLocalAxes3D(nI, nJ, undefined, undefined, true);

      // ex unchanged
      expectVec(lh.ex, rh.ex);
      // ey negated
      expectVec(lh.ey, [-rh.ey[0], -rh.ey[1], -rh.ey[2]]);
      // ez unchanged
      expectVec(lh.ez, rh.ez);
      // Left-handed: det = -1
      expect(det3(lh.ex, lh.ey, lh.ez)).toBeCloseTo(-1, 9);
    });
  }
});
