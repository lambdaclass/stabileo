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
  | { status: 'infeasible' | 'unbounded' };

const EPS = 1e-9;

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
  for (const r of rows) {
    const row = new Array(width).fill(0);
    cols.forEach((c, k) => { row[k] = c.s * (r.a[c.v] ?? 0); });
    row[width - 1] = r.b;
    if (r.op === '<=') { row[si] = 1; basis.push(si++); }
    else if (r.op === '>=') { row[si++] = -1; row[ai] = 1; artCols.push(ai); basis.push(ai++); }
    else { row[ai] = 1; artCols.push(ai); basis.push(ai++); }
    T.push(row);
  }
  let scale = 1;
  for (const r of T) for (const v of r) scale = Math.max(scale, Math.abs(v));
  const tol = EPS * scale;

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

  const run = (cost: number[], allowed: (col: number) => boolean): 'optimal' | 'unbounded' => {
    for (let iter = 0; iter < 5000; iter++) {
      let enter = -1;
      for (let col = 0; col < width - 1; col++) {
        if (!allowed(col) || basis.includes(col)) continue;
        let rc = cost[col];
        for (let r = 0; r < T.length; r++) rc -= cost[basis[r]] * T[r][col];
        if (rc < -tol) { enter = col; break; }
      }
      if (enter < 0) return 'optimal';
      let leave = -1, best = Infinity;
      for (let r = 0; r < T.length; r++) {
        if (T[r][enter] <= tol) continue;
        const ratio = T[r][width - 1] / T[r][enter];
        if (ratio < best - tol || (Math.abs(ratio - best) <= tol && basis[r] < basis[leave])) { best = ratio; leave = r; }
      }
      if (leave < 0) return 'unbounded';
      pivot(leave, enter);
    }
    return 'optimal';
  };

  if (nArt > 0) {
    const cost1 = new Array(width).fill(0);
    for (const a of artCols) cost1[a] = 1;
    run(cost1, () => true);
    let infeas = 0;
    for (let r = 0; r < T.length; r++) if (artCols.includes(basis[r])) infeas += T[r][width - 1];
    if (infeas > 1e-7 * scale) return { status: 'infeasible' };
    for (let r = 0; r < T.length; r++) {
      if (!artCols.includes(basis[r])) continue;
      const col = T[r].findIndex((v, k) => k < nx + nSlack && Math.abs(v) > tol);
      if (col >= 0) pivot(r, col);
    }
  }
  const cost2 = new Array(width).fill(0);
  cols.forEach((c, k) => { cost2[k] = c.s * p.c[c.v]; });
  const isArt = new Set(artCols);
  if (run(cost2, (col) => !isArt.has(col)) === 'unbounded') return { status: 'unbounded' };
  const x = new Array(n).fill(0);
  for (let r = 0; r < T.length; r++) {
    const k = basis[r];
    if (k < nx) x[cols[k].v] += cols[k].s * T[r][width - 1];
  }
  const value = p.c.reduce((s, cj, j) => s + cj * x[j], 0);
  return { status: 'optimal', x, value };
}
