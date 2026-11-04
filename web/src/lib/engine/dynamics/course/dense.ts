/**
 * Small dense matrices as arrays of rows, for the classroom dynamics: a few
 * dozen degrees of freedom at most, where clarity beats speed.
 */

export type Mat = number[][];

export const zeros = (n: number, m = n): Mat => Array.from({ length: n }, () => new Array<number>(m).fill(0));
export const identity = (n: number): Mat => zeros(n).map((r, i) => { r[i] = 1; return r; });
export const transpose = (a: Mat): Mat => (a.length ? a[0].map((_, j) => a.map((r) => r[j])) : []);
export const dot = (a: readonly number[], b: readonly number[]): number => a.reduce((s, v, i) => s + v * b[i], 0);
export const matVec = (a: Mat, x: readonly number[]): number[] => a.map((r) => dot(r, x));

export function matMul(a: Mat, b: Mat): Mat {
  const n = a.length, m = b[0]?.length ?? 0, p = b.length;
  const out = zeros(n, m);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < p; k++) {
      const v = a[i][k];
      if (v === 0) continue;
      for (let j = 0; j < m; j++) out[i][j] += v * b[k][j];
    }
  }
  return out;
}

/** Aᵀ·B·A. */
export const congruence = (a: Mat, b: Mat): Mat => matMul(transpose(a), matMul(b, a));

export const pick = (a: Mat, rows: readonly number[], cols: readonly number[]): Mat => rows.map((i) => cols.map((j) => a[i][j]));

/** A·X = B by Gaussian elimination with partial pivoting; B has one column per right-hand side. */
export function solveMany(a: Mat, b: Mat): Mat {
  const n = a.length;
  const m = b[0]?.length ?? 0;
  const w = a.map((r, i) => [...r, ...b[i]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(w[i][k]) > Math.abs(w[p][k])) p = i;
    const scale = Math.max(...w.map((r) => Math.abs(r[k])), 1e-300);
    if (Math.abs(w[p][k]) < 1e-13 * scale) throw new Error('singular');
    [w[k], w[p]] = [w[p], w[k]];
    for (let i = k + 1; i < n; i++) {
      const f = w[i][k] / w[k][k];
      if (f === 0) continue;
      for (let j = k; j < n + m; j++) w[i][j] -= f * w[k][j];
    }
  }
  const x = zeros(n, m);
  for (let c = 0; c < m; c++) {
    for (let i = n - 1; i >= 0; i--) {
      let s = w[i][n + c];
      for (let j = i + 1; j < n; j++) s -= w[i][j] * x[j][c];
      x[i][c] = s / w[i][i];
    }
  }
  return x;
}

export const solve = (a: Mat, b: readonly number[]): number[] => solveMany(a, b.map((v) => [v])).map((r) => r[0]);
export const inverse = (a: Mat): Mat => solveMany(a, identity(a.length));

/** Lower-triangular L with L·Lᵀ = A, for a symmetric positive definite A. */
export function cholesky(a: Mat): Mat {
  const n = a.length;
  const l = zeros(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a[i][j];
      for (let k = 0; k < j; k++) s -= l[i][k] * l[j][k];
      if (i === j) {
        if (!(s > 0)) throw new Error('not positive definite');
        l[i][i] = Math.sqrt(s);
      } else l[i][j] = s / l[j][j];
    }
  }
  return l;
}

/** Eigenvalues and eigenvectors (columns) of a symmetric matrix, by cyclic Jacobi rotations. */
export function symmetricEigen(a0: Mat): { values: number[]; vectors: Mat } {
  const n = a0.length;
  const a = a0.map((r) => [...r]);
  const v = identity(n);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0, norm = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { norm += a[i][j] ** 2; if (i !== j) off += a[i][j] ** 2; }
    if (off <= 1e-26 * Math.max(norm, 1e-300)) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: a.map((r, i) => r[i]), vectors: v };
}

/**
 * K·φ = λ·M·φ for K symmetric and M symmetric positive definite: λ ascending,
 * φ as columns, each scaled so φᵀ·M·φ = 1.
 */
export function generalizedEigen(k: Mat, m: Mat): { lambda: number[]; phi: Mat } {
  const n = k.length;
  const l = cholesky(m);
  const linv = inverse(l);
  const a = matMul(matMul(linv, k), transpose(linv));
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) a[i][j] = a[j][i] = (a[i][j] + a[j][i]) / 2;
  const { values, vectors } = symmetricEigen(a);
  const order = values.map((_, i) => i).sort((x, y) => values[x] - values[y]);
  const y = order.map((i) => vectors.map((r) => r[i]));
  const lt = transpose(linv);
  const cols = y.map((yc) => {
    const phi = matVec(lt, yc);
    let big = 0;
    for (const v of phi) if (Math.abs(v) > Math.abs(big)) big = v;
    return big < 0 ? phi.map((v) => -v) : phi;
  });
  return { lambda: order.map((i) => values[i]), phi: transpose(cols) };
}

export const column = (a: Mat, j: number): number[] => a.map((r) => r[j]);
export const maxAbs = (v: readonly number[]): number => v.reduce((s, x) => Math.max(s, Math.abs(x)), 0);
