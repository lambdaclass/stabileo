/**
 * The small dense linear algebra the second-order teaching solver needs on top of
 * `steps/sway-modes.ts` (row reduction, null space, Gaussian elimination): products, the
 * Cholesky factor, the inertia of a symmetric matrix, a determinant, and the symmetric
 * eigenproblem by Jacobi rotations. Classroom sizes: a few hundred unknowns at most.
 */

export type Mat = number[][];

export const zeros = (r: number, c: number): Mat => Array.from({ length: r }, () => new Array(c).fill(0));

export function matMul(A: Mat, B: Mat): Mat {
  const n = A.length, m = B[0]?.length ?? 0, p = B.length;
  const C = zeros(n, m);
  for (let i = 0; i < n; i++) {
    const Ai = A[i], Ci = C[i];
    for (let k = 0; k < p; k++) {
      const a = Ai[k];
      if (a === 0) continue;
      const Bk = B[k];
      for (let j = 0; j < m; j++) Ci[j] += a * Bk[j];
    }
  }
  return C;
}

export const transpose = (A: Mat): Mat => (A[0] ?? []).map((_, j) => A.map((r) => r[j]));

export const matVec = (A: Mat, x: number[]): number[] => A.map((r) => r.reduce((s, v, j) => s + v * x[j], 0));

/** Tᵀ·A·T. */
export const congruent = (A: Mat, T: Mat): Mat => matMul(transpose(T), matMul(A, T));

export const norm2 = (x: number[]): number => Math.sqrt(x.reduce((s, v) => s + v * v, 0));

/** Lower Cholesky factor of a symmetric positive definite matrix, or null when it is not. */
export function cholesky(A: Mat): Mat | null {
  const n = A.length;
  const L = zeros(n, n);
  for (let j = 0; j < n; j++) {
    let d = A[j][j];
    for (let k = 0; k < j; k++) d -= L[j][k] * L[j][k];
    if (!(d > 1e-14 * Math.abs(A[j][j]))) return null;
    const ljj = Math.sqrt(d);
    L[j][j] = ljj;
    for (let i = j + 1; i < n; i++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = s / ljj;
    }
  }
  return L;
}

/** Solves L·y = b (lower) or Lᵀ·y = b. */
function triSolve(L: Mat, b: number[], upper: boolean): number[] {
  const n = b.length;
  const y = new Array(n).fill(0);
  if (!upper) {
    for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
  } else {
    for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * y[k]; y[i] = s / L[i][i]; }
  }
  return y;
}

/**
 * Number of negative eigenvalues of a symmetric matrix (Sylvester's law of inertia), from the
 * signs of the pivots of symmetric elimination. A pivot that is exactly zero is nudged.
 */
export function negativeEigenvalues(A: Mat): number {
  const n = A.length;
  const M = A.map((r) => r.slice());
  let scale = 0;
  for (let i = 0; i < n; i++) scale = Math.max(scale, Math.abs(M[i][i]));
  let neg = 0;
  for (let c = 0; c < n; c++) {
    let p = M[c][c];
    if (p === 0 || !Number.isFinite(p)) p = 1e-300 + 1e-14 * scale;
    if (p < 0) neg++;
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / p;
      if (f === 0) continue;
      const Mr = M[r], Mc = M[c];
      for (let k = c + 1; k < n; k++) Mr[k] -= f * Mc[k];
    }
  }
  return neg;
}

/** The determinant as sign and log₁₀ of its magnitude (LU with partial pivoting). */
export function logDet(A: Mat): { sign: number; log10: number } {
  const n = A.length;
  const M = A.map((r) => r.slice());
  let sign = 1, log10 = 0;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (M[p][c] === 0) return { sign: 0, log10: -Infinity };
    if (p !== c) { [M[p], M[c]] = [M[c], M[p]]; sign = -sign; }
    const pv = M[c][c];
    if (pv < 0) sign = -sign;
    log10 += Math.log10(Math.abs(pv));
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / pv;
      if (f === 0) continue;
      for (let k = c + 1; k < n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return { sign, log10 };
}

/** Eigenvalues and eigenvectors (columns) of a symmetric matrix by cyclic Jacobi rotations. */
export function symmetricEigen(S: Mat): { values: number[]; vectors: Mat } {
  const n = S.length;
  const A = S.map((r) => r.slice());
  const V = zeros(n, n);
  for (let i = 0; i < n; i++) V[i][i] = 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0, diag = 0;
    for (let i = 0; i < n; i++) { diag += A[i][i] * A[i][i]; for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j]; }
    if (off <= 1e-30 * Math.max(diag, 1e-300)) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p][q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: A.map((r, i) => r[i]), vectors: V };
}

/**
 * The positive λ of K·x = λ·G·x with K symmetric positive definite and G symmetric (any sign),
 * ascending, each with its vector. Null when K is not positive definite.
 */
export function generalizedEigen(K: Mat, G: Mat): Array<{ lambda: number; vector: number[] }> | null {
  const L = cholesky(K);
  if (!L) return null;
  const n = K.length;
  const Y = zeros(n, n);
  for (let j = 0; j < n; j++) {
    const col = triSolve(L, G.map((r) => r[j]), false);
    for (let i = 0; i < n; i++) Y[i][j] = col[i];
  }
  const C = zeros(n, n);
  for (let i = 0; i < n; i++) {
    const row = triSolve(L, Y[i], false);
    for (let j = 0; j < n; j++) C[i][j] = row[j];
  }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const m = (C[i][j] + C[j][i]) / 2; C[i][j] = m; C[j][i] = m; }
  const { values, vectors } = symmetricEigen(C);
  const maxMu = Math.max(0, ...values.map(Math.abs));
  const out: Array<{ lambda: number; vector: number[] }> = [];
  values.forEach((mu, k) => {
    if (!(mu > 1e-6 * maxMu)) return;
    out.push({ lambda: 1 / mu, vector: triSolve(L, vectors.map((r) => r[k]), true) });
  });
  return out.sort((a, b) => a.lambda - b.lambda);
}
