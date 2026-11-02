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
  const rows = p.rows.map((r) => {
    const w = Math.max(...r.a.map(Math.abs), 0) || 1;
    const a = r.a.map((v) => v / w), b = r.b / w;
    return b < 0 ? { a: a.map((v) => -v), op: (r.op === '<=' ? '>=' : r.op === '>=' ? '<=' : '=') as LpOp, b: -b } : { a, op: r.op, b };
  });
  const nSlack = rows.filter((r) => r.op !== '=').length;
  const nArt = rows.filter((r) => r.op !== '<=').length;
  const width = nx + nSlack + nArt + 1;
  const T: number[][] = [];
  const basis: number[] = [];
  let si = nx, ai = nx + nSlack;
  const artCols: number[] = [];
  for (const r of rows) {
    const row = new Array(width).fill(0);
    cols.forEach((c, k) => { row[k] = c.s * (r.a[c.v] ?? 0); });
    row[width - 1] = r.b;
    if (r.op === '<=') { row[si] = 1; basis.push(si++); }
    else if (r.op === '>=') { row[si++] = -1; row[ai] = 1; artCols.push(ai); basis.push(ai++); }
    else { row[ai] = 1; artCols.push(ai); basis.push(ai++); }
    T.push(row);
  }
  let aScale = 0, bScale = 0;
  for (const r of T) {
    for (let k = 0; k < width - 1; k++) aScale = Math.max(aScale, Math.abs(r[k]));
    bScale = Math.max(bScale, Math.abs(r[width - 1]));
  }
  const tol = EPS * Math.max(aScale, 1e-300);

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
    const rcTol = EPS * Math.max(...cost.map(Math.abs), 1e-300);
    for (let iter = 0; iter < MAX_ITER; iter++) {
      let enter = -1;
      for (let col = 0; col < width - 1; col++) {
        if (!allowed(col) || basis.includes(col)) continue;
        let rc = cost[col];
        for (let r = 0; r < T.length; r++) rc -= cost[basis[r]] * T[r][col];
        if (rc < -rcTol) { enter = col; break; }
      }
      if (enter < 0) return 'optimal';
      let leave = -1, best = Infinity;
      for (let r = 0; r < T.length; r++) {
        if (T[r][enter] <= tol) continue;
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
    let infeas = 0;
    for (let r = 0; r < T.length; r++) if (artCols.includes(basis[r])) infeas += T[r][width - 1];
    if (infeas > 1e-9 * Math.max(bScale, 1e-300)) return { status: 'infeasible' };
    for (let r = 0; r < T.length; r++) {
      if (!artCols.includes(basis[r])) continue;
      const col = T[r].findIndex((v, k) => k < nx + nSlack && Math.abs(v) > tol);
      if (col >= 0) pivot(r, col);
    }
  }
  const cost2 = new Array(width).fill(0);
  cols.forEach((c, k) => { cost2[k] = c.s * p.c[c.v]; });
  const isArt = new Set(artCols);
  const phase2 = run(cost2, (col) => !isArt.has(col));
  if (phase2 !== 'optimal') return { status: phase2 };
  const x = new Array(n).fill(0);
  for (let r = 0; r < T.length; r++) {
    const k = basis[r];
    if (k < nx) x[cols[k].v] += cols[k].s * T[r][width - 1];
  }
  if (!satisfies(p, x, free)) return { status: 'inaccurate' };
  const value = p.c.reduce((s, cj, j) => s + cj * x[j], 0);
  return { status: 'optimal', x, value };
}

/** The returned x checked against the problem as given: every row and every sign bound, to a tolerance scaled by its terms. */
function satisfies(p: LpProblem, x: number[], free: boolean[]): boolean {
  const xs = Math.max(...x.map(Math.abs), 0);
  if (x.some((v, j) => !free[j] && v < -1e-9 * Math.max(xs, 1e-300))) return false;
  return p.rows.every((r) => {
    const ax = r.a.reduce((s, a, j) => s + a * (x[j] ?? 0), 0);
    const tol = 1e-7 * (Math.abs(r.b) + r.a.reduce((s, a, j) => s + Math.abs(a * (x[j] ?? 0)), 0)) + 1e-12 * Math.max(...r.a.map(Math.abs), 0) * xs + 1e-300;
    return r.op === '<=' ? ax <= r.b + tol : r.op === '>=' ? ax >= r.b - tol : Math.abs(ax - r.b) <= tol;
  });
}

