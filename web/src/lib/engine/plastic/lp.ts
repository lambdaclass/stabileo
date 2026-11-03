/**
 * A small dense linear program, for the classroom-sized limit analyses of the
 * plastic unit: minimize c·x subject to rows a·x (≤ | ≥ | =) b, with each
 * variable either free or non-negative. Two-phase simplex on a full tableau
 * with Bland's rule, so it cannot cycle on the degenerate vertices a collapse
 * mechanism produces (several hinges reaching Mp at once).
 */

export type LpOp = '<=' | '>=' | '=';
export interface LpRow { a: number[]; op: LpOp; b: number }
export interface LpProblem {
  c: number[];
  rows: LpRow[];
  /** Per variable: true when it may take any sign. Absent: every variable is ≥ 0. */
  free?: boolean[];
}
export type LpResult =
  | { status: 'optimal'; x: number[]; value: number }
  | { status: 'infeasible' | 'unbounded' | 'iterationLimit' | 'inaccurate' };

const EPS = 1e-9;
const MAX_ITER = 5000;

export function solveLp(p: LpProblem): LpResult {
  const n = p.c.length;
  const free = p.free ?? new Array(n).fill(false);
  const cols: Array<{ v: number; s: 1 | -1 }> = [];
  for (let j = 0; j < n; j++) {
    cols.push({ v: j, s: 1 });
    if (free[j]) cols.push({ v: j, s: -1 });
  }
  const nx = cols.length;
  const rows = p.rows.map((r) => (r.b < 0
    ? { a: r.a.map((v) => -v), op: (r.op === '<=' ? '>=' : r.op === '>=' ? '<=' : '=') as LpOp, b: -r.b }
    : r));
  const nSlack = rows.filter((r) => r.op !== '=').length;
  const nArt = rows.filter((r) => r.op !== '<=').length;
  const width = nx + nSlack + nArt + 1;
  const T: number[][] = [];
  const basis: number[] = [];
  let si = nx, ai = nx + nSlack;
  const artCols: number[] = [];
  const artRow = new Map<number, number>();
  const unitCol: Array<{ k: number; s: 1 | -1 }> = [];
  for (const r of rows) {
    if (r.op !== '<=') artRow.set(ai, T.length);
    const row = new Array(width).fill(0);
    cols.forEach((c, k) => { row[k] = c.s * (r.a[c.v] ?? 0); });
    row[width - 1] = r.b;
    if (r.op === '<=') { unitCol.push({ k: si, s: 1 }); row[si] = 1; basis.push(si++); }
    else if (r.op === '>=') { unitCol.push({ k: si, s: -1 }); row[si++] = -1; row[ai] = 1; artCols.push(ai); basis.push(ai++); }
    else { unitCol.push({ k: ai, s: 1 }); row[ai] = 1; artCols.push(ai); basis.push(ai++); }
    T.push(row);
  }
  const A0 = T.map((r) => r.slice(0, nx));
  const b0 = T.map((r) => r[width - 1]);
  const T0 = T.map((r) => r.slice(0, width - 1));
  const basicValues = (): number[] | null => {
    const m = T0.length;
    const B = T0.map((row) => basis.map((k) => row[k]));
    const lu = B.map((r) => r.slice());
    const perm = Array.from({ length: m }, (_, i) => i);
    for (let c = 0; c < m; c++) {
      let pr = c;
      for (let r = c + 1; r < m; r++) if (Math.abs(lu[r][c]) > Math.abs(lu[pr][c])) pr = r;
      if (!(Math.abs(lu[pr][c]) > 0)) return null;
      [lu[c], lu[pr]] = [lu[pr], lu[c]];
      [perm[c], perm[pr]] = [perm[pr], perm[c]];
      for (let r = c + 1; r < m; r++) {
        const f = (lu[r][c] /= lu[c][c]);
        if (f !== 0) for (let k = c + 1; k < m; k++) lu[r][k] -= f * lu[c][k];
      }
    }
    const solve = (rhs: number[]) => {
      const y = perm.map((i) => rhs[i]);
      for (let r = 0; r < m; r++) for (let k = 0; k < r; k++) y[r] -= lu[r][k] * y[k];
      for (let r = m - 1; r >= 0; r--) { for (let k = r + 1; k < m; k++) y[r] -= lu[r][k] * y[k]; y[r] /= lu[r][r]; }
      return y;
    };
    const z = solve(b0);
    for (let step = 0; step < 2; step++) {
      const res = B.map((row, i) => row.reduce((s, v, j) => s - v * z[j], b0[i]));
      const dz = solve(res);
      for (let j = 0; j < m; j++) z[j] += dz[j];
    }
    return z.every(Number.isFinite) ? z : null;
  };
  const rowScale = (i: number, z: number[]) => {
    let s = Math.abs(b0[i]);
    for (let j = 0; j < basis.length; j++) s += Math.abs(T0[i][basis[j]] * z[j]);
    return s;
  };
  const rowTol = (row: number[]) => {
    let m = 0;
    for (let k = 0; k < width - 1; k++) m = Math.max(m, Math.abs(row[k]));
    return EPS * Math.max(m, 1e-300);
  };

  const pivot = (pr: number, pc: number) => {
    const pv = T[pr][pc];
    const row = T[pr];
    for (let k = 0; k < width; k++) row[k] /= pv;
    for (let r = 0; r < T.length; r++) {
      if (r === pr) continue;
      const f = T[r][pc];
      if (Math.abs(f) < 1e-300) continue;
      const tr = T[r];
      for (let k = 0; k < width; k++) tr[k] -= f * row[k];
    }
    basis[pr] = pc;
  };

  const run = (cost: number[], allowed: (col: number) => boolean): 'optimal' | 'unbounded' | 'iterationLimit' => {
    for (let iter = 0; iter < MAX_ITER; iter++) {
      let enter = -1;
      for (let col = 0; col < width - 1; col++) {
        if (!allowed(col) || basis.includes(col)) continue;
        let rc = cost[col], size = Math.abs(cost[col]);
        for (let r = 0; r < T.length; r++) { const t = cost[basis[r]] * T[r][col]; rc -= t; size += Math.abs(t); }
        if (rc < -EPS * Math.max(size, 1e-300)) { enter = col; break; }
      }
      if (enter < 0) return 'optimal';
      let leave = -1, best = Infinity;
      let colMax = 0;
      for (let r = 0; r < T.length; r++) colMax = Math.max(colMax, Math.abs(T[r][enter]));
      for (let r = 0; r < T.length; r++) {
        if (T[r][enter] <= Math.min(rowTol(T[r]), EPS * colMax)) continue;
        const ratio = T[r][width - 1] / T[r][enter];
        const tie = EPS * Math.max(Math.abs(ratio), best === Infinity ? 0 : Math.abs(best));
        if (ratio < best - tie || (Math.abs(ratio - best) <= tie && basis[r] < basis[leave])) { best = ratio; leave = r; }
      }
      if (leave < 0) return 'unbounded';
      pivot(leave, enter);
    }
    return 'iterationLimit';
  };

  if (nArt > 0) {
    const cost1 = new Array(width).fill(0);
    for (const a of artCols) cost1[a] = 1;
    if (run(cost1, () => true) === 'iterationLimit') return { status: 'iterationLimit' };
    const z = basicValues();
    if (!z) return { status: 'inaccurate' };
    for (let r = 0; r < T.length; r++) {
      const i = artRow.get(basis[r]);
      if (i === undefined) continue;
      if (z[r] > 1e-9 * rowScale(i, z) + 1e-300) return { status: 'infeasible' };
    }
    for (let r = 0; r < T.length; r++) {
      if (!artCols.includes(basis[r])) continue;
      const tol = rowTol(T[r]);
      const col = T[r].findIndex((v, k) => k < nx + nSlack && Math.abs(v) > tol);
      if (col >= 0) pivot(r, col);
    }
  }
  const cost2 = new Array(width).fill(0);
  cols.forEach((c, k) => { cost2[k] = c.s * p.c[c.v]; });
  const isArt = new Set(artCols);
  const phase2 = run(cost2, (col) => !isArt.has(col));
  if (phase2 !== 'optimal') return { status: phase2 };
  const z = basicValues();
  if (!z) return { status: 'inaccurate' };
  const x = new Array(n).fill(0);
  for (let r = 0; r < T.length; r++) {
    const k = basis[r];
    if (k < nx) x[cols[k].v] += cols[k].s * z[r];
  }
  if (!satisfies(p, x, free)) return { status: 'inaccurate' };
  const value = p.c.reduce((s, cj, j) => s + cj * x[j], 0);
  const reduced = (k: number) => {
    let rc = cost2[k];
    for (let r = 0; r < T.length; r++) rc -= cost2[basis[r]] * T[r][k];
    return rc;
  };
  const y = unitCol.map(({ k, s }) => -reduced(k) / s);
  if (!optimalDual(rows, A0, cost2.slice(0, nx), y, value)) return { status: 'inaccurate' };
  return { status: 'optimal', x, value };
}

/** y certifies the vertex optimal for the rows as solved: the right sign per row, no negative reduced cost, no duality gap. */
function optimalDual(rows: LpRow[], A: number[][], c: number[], y: number[], value: number): boolean {
  const TOL = 1e-7;
  const ys = Math.max(...y.map(Math.abs), 0);
  for (let r = 0; r < rows.length; r++) {
    if (rows[r].op === '<=' && y[r] > TOL * ys) return false;
    if (rows[r].op === '>=' && y[r] < -TOL * ys) return false;
  }
  for (let k = 0; k < c.length; k++) {
    let d = c[k], size = Math.abs(c[k]);
    for (let r = 0; r < rows.length; r++) { const t = y[r] * A[r][k]; d -= t; size += Math.abs(t); }
    if (d < -TOL * size - 1e-300) return false;
  }
  let dual = 0, size = Math.abs(value);
  for (let r = 0; r < rows.length; r++) { dual += y[r] * rows[r].b; size += Math.abs(y[r] * rows[r].b); }
  return Math.abs(value - dual) <= TOL * size + 1e-300;
}

/** The returned x checked against the problem as given: every row and every sign bound, to a tolerance scaled by its terms. */
function satisfies(p: LpProblem, x: number[], free: boolean[]): boolean {
  const scale = p.rows.map((r) => Math.abs(r.b) + r.a.reduce((s, a, j) => s + Math.abs(a * (x[j] ?? 0)), 0));
  for (let j = 0; j < x.length; j++) {
    if (free[j] || x[j] >= 0) continue;
    let bound = 0;
    p.rows.forEach((r, i) => { const a = Math.abs(r.a[j] ?? 0); if (a > 0) bound = Math.max(bound, scale[i] / a); });
    if (-x[j] > 1e-9 * bound + 1e-300) return false;
  }
  return p.rows.every((r, i) => {
    const ax = r.a.reduce((s, a, j) => s + a * (x[j] ?? 0), 0);
    const tol = 1e-7 * scale[i] + 1e-300;
    return r.op === '<=' ? ax <= r.b + tol : r.op === '>=' ? ax >= r.b - tol : Math.abs(ax - r.b) <= tol;
  });
}

