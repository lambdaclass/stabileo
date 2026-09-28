/**
 * Dense Gaussian elimination that knows the difference between a mechanism
 * and a mechanism the loads do not touch.
 *
 * ── Why the step-by-step solvers need it ───────────────────────────
 *
 * A structure can carry an infinitesimal mechanism — a truss node whose bars
 * all lie in one plane moves freely out of it — and still be in equilibrium
 * under loads that have no component along that mode. The analysis solver
 * returns an answer there, and the examples menu ships such a model (the space
 * truss). The pedagogical solvers used to stop at the zero pivot and call the
 * whole structure hypostatic, so the wizard refused a model the canvas had
 * just analysed.
 *
 * Here a column with no usable pivot is a FREE unknown: it is set to zero —
 * the mode is not excited, so any amount of it is equilibrium, and none is the
 * natural choice — and elimination carries on with the same row. At the end,
 * the rows that were never used must reduce to 0 = 0: if the load has a
 * component along the mode they do not, and THAT is a genuine mechanism,
 * reported as before.
 */
export interface NullModeSolve {
  x: Float64Array;
  /** Unknowns set to zero because the stiffness has no say over them. */
  freeDofs: number[];
  /** One null vector per free unknown: that unknown = 1, the pivots solved for zero load. */
  modes: Float64Array[];
}

export function solveAllowingNullModes(
  A: Float64Array, b: Float64Array, n: number, singularMessage: string,
): NullModeSolve {
  const a = new Float64Array(A);
  const bw = new Float64Array(b);

  let maxDiag = 0;
  for (let i = 0; i < n; i++) maxDiag = Math.max(maxDiag, Math.abs(A[i * n + i]));
  const tol = Math.max(1e-10, maxDiag * 1e-12);
  let maxB = 0;
  for (let i = 0; i < n; i++) maxB = Math.max(maxB, Math.abs(b[i]));

  const pivotCol: number[] = [];
  const freeDofs: number[] = [];
  let r = 0;
  for (let k = 0; k < n && r < n; k++) {
    let maxVal = 0;
    let maxRow = -1;
    for (let i = r; i < n; i++) {
      const v = Math.abs(a[i * n + k]);
      if (v > maxVal) { maxVal = v; maxRow = i; }
    }
    if (maxVal < tol) { freeDofs.push(k); continue; }
    if (maxRow !== r) {
      for (let j = 0; j < n; j++) {
        const tmp = a[r * n + j]; a[r * n + j] = a[maxRow * n + j]; a[maxRow * n + j] = tmp;
      }
      const tmp = bw[r]; bw[r] = bw[maxRow]; bw[maxRow] = tmp;
    }
    for (let i = r + 1; i < n; i++) {
      const f = a[i * n + k] / a[r * n + k];
      if (f === 0) continue;
      for (let j = k; j < n; j++) a[i * n + j] -= f * a[r * n + j];
      bw[i] -= f * bw[r];
    }
    pivotCol[r] = k;
    r++;
  }
  for (let k = pivotCol.length ? pivotCol[pivotCol.length - 1] + 1 : 0; k < n; k++) {
    if (!freeDofs.includes(k) && !pivotCol.includes(k)) freeDofs.push(k);
  }

  /* The unused rows must read 0 = 0; a load along the mode leaves them not. */
  for (let i = r; i < n; i++) {
    if (Math.abs(bw[i]) > 1e-9 * Math.max(maxB, 1e-12)) throw new Error(singularMessage);
  }

  const back = (rhs: (i: number) => number, x: Float64Array) => {
    for (let i = r - 1; i >= 0; i--) {
      const k = pivotCol[i];
      let s = rhs(i);
      for (let j = k + 1; j < n; j++) s -= a[i * n + j] * x[j];
      x[k] = s / a[i * n + k];
    }
    return x;
  };
  const x = back((i) => bw[i], new Float64Array(n));
  const modes = freeDofs.map((f) => {
    const v = new Float64Array(n);
    v[f] = 1;
    return back(() => 0, v);
  });
  return { x, freeDofs, modes };
}
