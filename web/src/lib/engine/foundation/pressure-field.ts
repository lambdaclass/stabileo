/**
 * The soil pressure under a rigid rectangular base that cannot pull the ground: a plane
 * q = a + b·x + c·y where it is positive and nothing where it would be negative, in equilibrium with
 * the axial load and the two moments about the base's centroid. With the resultant in the kern the
 * plane is the familiar linear distribution; outside it part of the base lifts and the plane is
 * found by Newton iteration on the contact area (a 60 × 60 grid of cells). When the resultant leaves
 * the base there is no equilibrium and the base overturns.
 *
 * Local axes: x along B, y along L, origin at the centroid. Moments: My about y (it moves the
 * resultant along x, eB = My/N), Mx about x (along y, eL = Mx/N).
 */

export interface PressureField {
  /** Pressure at a point, kPa (0 where the base has lifted). */
  at(x: number, y: number): number;
  qMax: number;
  /** Share of the base in contact, 0 to 1. */
  contact: number;
  /** The plane where it is in contact. */
  plane: { a: number; b: number; c: number };
  /** Resultant offsets, m. */
  eB: number; eL: number;
  overturns: boolean;
}

export function pressureField(B: number, L: number, N: number, My: number, Mx: number): PressureField {
  const eB = N > 0 ? My / N : 0, eL = N > 0 ? Mx / N : 0;
  const lin = { a: N / (B * L), b: (12 * My) / (L * B ** 3), c: (12 * Mx) / (B * L ** 3) };
  const plane0 = (p: typeof lin) => (x: number, y: number) => p.a + p.b * x + p.c * y;
  const corners = [[-B / 2, -L / 2], [B / 2, -L / 2], [B / 2, L / 2], [-B / 2, L / 2]].map(([x, y]) => plane0(lin)(x!, y!));
  if (!(N > 0)) return { at: () => 0, qMax: 0, contact: 0, plane: { a: 0, b: 0, c: 0 }, eB, eL, overturns: false };
  if (Math.min(...corners) >= -1e-9) {
    return { at: (x, y) => Math.max(0, plane0(lin)(x, y)), qMax: Math.max(...corners), contact: 1, plane: lin, eB, eL, overturns: false };
  }
  if (Math.abs(eB) >= B / 2 - 1e-9 || Math.abs(eL) >= L / 2 - 1e-9 || Math.abs(eB) / (B / 2) + Math.abs(eL) / (L / 2) >= 1.5) {
    return { at: () => 0, qMax: Infinity, contact: 0, plane: lin, eB, eL, overturns: true };
  }
  // Newton on (a, b, c): the clamped plane's resultant must equal (N, My, Mx).
  const n = 60, dx = B / n, dy = L / n, dA = dx * dy;
  const xs = Array.from({ length: n }, (_, i) => -B / 2 + (i + 0.5) * dx), ys = Array.from({ length: n }, (_, j) => -L / 2 + (j + 0.5) * dy);
  let p = { ...lin };
  for (let it = 0; it < 80; it++) {
    let F0 = 0, F1 = 0, F2 = 0;
    const J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const x of xs) for (const y of ys) {
      const q = p.a + p.b * x + p.c * y;
      if (q <= 0) continue;
      F0 += q * dA; F1 += q * x * dA; F2 += q * y * dA;
      const v = [1, x, y];
      for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) J[r]![s]! += v[r]! * v[s]! * dA;
    }
    const R = [F0 - N, F1 - My, F2 - Mx];
    if (Math.abs(R[0]!) < 1e-6 * N && Math.abs(R[1]!) < 1e-6 * N * B && Math.abs(R[2]!) < 1e-6 * N * L) break;
    const d = solve3(J, R.map((v) => -v));
    if (!d) break;
    p = { a: p.a + d[0]!, b: p.b + d[1]!, c: p.c + d[2]! };
  }
  let qMax = 0, inContact = 0;
  for (const x of xs) for (const y of ys) { const q = p.a + p.b * x + p.c * y; if (q > 0) { inContact++; qMax = Math.max(qMax, q); } }
  for (const [x, y] of [[-B / 2, -L / 2], [B / 2, -L / 2], [B / 2, L / 2], [-B / 2, L / 2]]) qMax = Math.max(qMax, p.a + p.b * x! + p.c * y!);
  const fin = p;
  return { at: (x, y) => Math.max(0, fin.a + fin.b * x + fin.c * y), qMax, contact: inContact / (n * n), plane: fin, eB, eL, overturns: false };
}

function solve3(A: number[][], b: number[]): number[] | null {
  const m = A.map((r, i) => [...r, b[i]!]);
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    if (Math.abs(m[piv]![c]!) < 1e-14) return null;
    [m[c], m[piv]] = [m[piv]!, m[c]!];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / m[c]![c]!;
      for (let k = c; k < 4; k++) m[r]![k]! -= f * m[c]![k]!;
    }
  }
  return [m[0]![3]! / m[0]![0]!, m[1]![3]! / m[1]![1]!, m[2]![3]! / m[2]![2]!];
}
