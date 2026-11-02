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
 * Number of negative eigenvalues of a symmetric matrix: the larger of two counts, the negative pivots of a
 * Bunch–Kaufman LDLᵀ (Sylvester, exact up to the rounding of each pivot) and the negative eigenvalues of D·A·D
 * with D = |diag A|^(−1/2) beyond round-off.
 */
export function negativeEigenvalues(A: Mat): number {
  if (!A.length) return 0;
  const d = A.map((r, i) => (Math.abs(r[i]) > 0 && Number.isFinite(r[i]) ? 1 / Math.sqrt(Math.abs(r[i])) : 1));
  const { values } = symmetricEigen(A.map((r, i) => r.map((v, j) => d[i] * v * d[j])));
  const tol = 1e-14 * Math.max(0, ...values.map(Math.abs));
  return Math.max(values.filter((v) => v < -tol).length, ldltNegatives(A));
}

/** Negative eigenvalues counted on the block-diagonal factor of a Bunch–Kaufman symmetric LDLᵀ. */
export function ldltNegatives(S: Mat): number {
  const n = S.length;
  const A = S.map((r) => r.slice());
  const alpha = (1 + Math.sqrt(17)) / 8;
  const swap = (i: number, j: number) => {
    if (i === j) return;
    [A[i], A[j]] = [A[j], A[i]];
    for (const r of A) [r[i], r[j]] = [r[j], r[i]];
  };
  let neg = 0;
  let k = 0;
  while (k < n) {
    let lambda = 0, r = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > lambda) { lambda = Math.abs(A[i][k]); r = i; }
    const akk = Math.abs(A[k][k]);
    let size = 1;
    if (lambda === 0) {
      if (A[k][k] < 0) neg++;
      k++;
      continue;
    }
    if (akk < alpha * lambda) {
      let sigma = 0;
      for (let i = k; i < n; i++) if (i !== r) sigma = Math.max(sigma, Math.abs(A[i][r]));
      if (akk * sigma >= alpha * lambda * lambda) size = 1;
      else if (Math.abs(A[r][r]) >= alpha * sigma) { swap(k, r); size = 1; }
      else { swap(k + 1, r); size = 2; }
    }
    if (size === 1) {
      const p = A[k][k];
      if (p < 0) neg++;
      for (let i = k + 1; i < n; i++) {
        const f = A[i][k] / p;
        if (f === 0) continue;
        for (let j = k + 1; j < n; j++) A[i][j] -= f * A[k][j];
      }
      k++;
    } else {
      const a = A[k][k], b = A[k + 1][k], c = A[k + 1][k + 1];
      const det = a * c - b * b;
      if (det < 0) neg++;
      else if (a + c < 0) neg += 2;
      for (let i = k + 2; i < n; i++) {
        const u = A[i][k], v = A[i][k + 1];
        const x = (c * u - b * v) / det, y = (a * v - b * u) / det;
        for (let j = k + 2; j < n; j++) A[i][j] -= x * A[k][j] + y * A[k + 1][j];
      }
      k += 2;
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
    const small = (p: number, q: number) => Math.abs(A[p][q]) <= 1e-15 * Math.sqrt(Math.abs(A[p][p] * A[q][q])) + 1e-300;
    let done = true;
    for (let p = 0; p < n - 1 && done; p++) for (let q = p + 1; q < n; q++) if (!small(p, q)) { done = false; break; }
    if (done) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p][q];
        if (small(p, q)) continue;
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
/**
 * How far μ can be from an eigenvalue of the symmetric C, for its computed vector v: the residual
 * ‖Cv − μv‖/‖v‖ plus the rounding of that product, 2(n + 1)·ε·‖|C||v| + |μv|‖/‖v‖.
 */
export function eigenErrorBound(C: Mat, mu: number, v: number[]): number {
  const n = v.length;
  const nv = norm2(v);
  if (!(nv > 0)) return Infinity;
  let r2 = 0, a2 = 0;
  for (let i = 0; i < n; i++) {
    let r = -mu * v[i], a = Math.abs(mu * v[i]);
    for (let j = 0; j < n; j++) { r += C[i][j] * v[j]; a += Math.abs(C[i][j] * v[j]); }
    r2 += r * r; a2 += a * a;
  }
  return (Math.sqrt(r2) + 2 * (n + 1) * Number.EPSILON * Math.sqrt(a2)) / nv;
}

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
  const out: Array<{ lambda: number; vector: number[] }> = [];
  values.forEach((mu, k) => {
    if (!(mu > eigenErrorBound(C, mu, vectors.map((r) => r[k])))) return;
    out.push({ lambda: 1 / mu, vector: triSolve(L, vectors.map((r) => r[k]), true) });
  });
  return out.sort((a, b) => a.lambda - b.lambda);
}
