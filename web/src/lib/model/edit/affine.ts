/**
 * Rigid motions and reflections of the model: x ↦ A·x + t.
 *
 * Only isometries are built here — translations, rotations about an arbitrary axis, reflections
 * in an arbitrary plane — so A is orthogonal and det A = ±1. A reflection (det −1) is the case
 * the rest of the edit layer has to think about: it reverses handedness, and a member's local
 * frame, a shell's normal and a moment vector all feel it.
 *
 * Pure: no store.
 */

export type Vec3 = [number, number, number];
/** Row-major 3×3. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export interface Affine {
  A: Mat3;
  t: Vec3;
}

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export function unit(a: Vec3): Vec3 {
  const n = norm(a);
  if (!(n > 1e-12)) throw new Error('zero-length direction');
  return [a[0] / n, a[1] / n, a[2] / n];
}

export function mulMat(A: Mat3, v: Vec3): Vec3 {
  return [
    A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
    A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
    A[6] * v[0] + A[7] * v[1] + A[8] * v[2],
  ];
}

export function det(A: Mat3): number {
  return A[0] * (A[4] * A[8] - A[5] * A[7]) - A[1] * (A[3] * A[8] - A[5] * A[6]) + A[2] * (A[3] * A[7] - A[4] * A[6]);
}

export const applyPoint = (T: Affine, p: Vec3): Vec3 => {
  const q = mulMat(T.A, p);
  return [q[0] + T.t[0], q[1] + T.t[1], q[2] + T.t[2]];
};

/** Directions and forces move with A alone. */
export const applyVector = (T: Affine, v: Vec3): Vec3 => mulMat(T.A, v);

/**
 * Moments and rotations are axial vectors: under a reflection they turn the other way, so they
 * transform as det(A)·A·m, not as A·m.
 */
export const applyAxial = (T: Affine, m: Vec3): Vec3 => {
  const d = det(T.A) < 0 ? -1 : 1;
  const q = mulMat(T.A, m);
  return [d * q[0], d * q[1], d * q[2]];
};

export const isReflection = (T: Affine) => det(T.A) < 0;

export function translation(d: Vec3): Affine {
  return { A: [...IDENTITY], t: [...d] };
}

/** Rotation by `deg` about the axis through `p` along `axis`, right-hand rule. */
export function rotation(p: Vec3, axis: Vec3, deg: number): Affine {
  const [x, y, z] = unit(axis);
  const th = (deg * Math.PI) / 180;
  const c = Math.cos(th), s = Math.sin(th), C = 1 - c;
  const A: Mat3 = [
    c + x * x * C, x * y * C - z * s, x * z * C + y * s,
    y * x * C + z * s, c + y * y * C, y * z * C - x * s,
    z * x * C - y * s, z * y * C + x * s, c + z * z * C,
  ];
  // x' = A(x − p) + p
  const Ap = mulMat(A, p);
  return { A, t: [p[0] - Ap[0], p[1] - Ap[1], p[2] - Ap[2]] };
}

/** Reflection in the plane through `p` with normal `n`. */
export function reflection(p: Vec3, n: Vec3): Affine {
  const [a, b, c] = unit(n);
  const A: Mat3 = [
    1 - 2 * a * a, -2 * a * b, -2 * a * c,
    -2 * b * a, 1 - 2 * b * b, -2 * b * c,
    -2 * c * a, -2 * c * b, 1 - 2 * c * c,
  ];
  const Ap = mulMat(A, p);
  return { A, t: [p[0] - Ap[0], p[1] - Ap[1], p[2] - Ap[2]] };
}

/** T2 ∘ T1: first T1, then T2. */
export function compose(T2: Affine, T1: Affine): Affine {
  const A = T2.A, B = T1.A;
  const AB: Mat3 = [
    A[0] * B[0] + A[1] * B[3] + A[2] * B[6], A[0] * B[1] + A[1] * B[4] + A[2] * B[7], A[0] * B[2] + A[1] * B[5] + A[2] * B[8],
    A[3] * B[0] + A[4] * B[3] + A[5] * B[6], A[3] * B[1] + A[4] * B[4] + A[5] * B[7], A[3] * B[2] + A[4] * B[5] + A[5] * B[8],
    A[6] * B[0] + A[7] * B[3] + A[8] * B[6], A[6] * B[1] + A[7] * B[4] + A[8] * B[7], A[6] * B[2] + A[7] * B[5] + A[8] * B[8],
  ];
  const t = applyPoint(T2, T1.t);
  return { A: AB, t };
}

/**
 * When A maps the global axes onto signed global axes — a quarter-turn about a global axis, a
 * reflection in a global plane — the permutation that does it: global axis i goes to axis
 * `perm[i]` with sign `sign[i]`. Null otherwise.
 *
 * Joint masks and support restraints are stated per GLOBAL degree of freedom. They survive a
 * transform exactly only when it maps global axes onto global axes.
 */
export function axisPermutation(A: Mat3, tol = 1e-9): { perm: [number, number, number]; sign: [number, number, number] } | null {
  const perm: number[] = [], sign: number[] = [];
  for (let i = 0; i < 3; i++) {
    // Column i: the image of global axis i.
    const col: Vec3 = [A[i]!, A[3 + i]!, A[6 + i]!];
    const j = col.findIndex((v) => Math.abs(Math.abs(v) - 1) < tol);
    if (j < 0 || col.some((v, k) => k !== j && Math.abs(v) > tol)) return null;
    perm.push(j);
    sign.push(col[j]! > 0 ? 1 : -1);
  }
  return { perm: perm as [number, number, number], sign: sign as [number, number, number] };
}
