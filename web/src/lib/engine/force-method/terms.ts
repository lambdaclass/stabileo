/**
 * The terms of the flexibility coefficients that are not an integral over a
 * bar: springs, written as the classroom writes them (R̄ᵢ·R̄ⱼ/k, M̄ᵢ·M̄ⱼ/k_θ),
 * and the choice of which coefficients keep their axial term when the reader
 * leaves it out.
 */
import type { SolverSupport } from '../types';
import type { TermRow } from './result-types';

type Disp = (nodeId: number) => [number, number, number];

/**
 * A spring's force in its own axes for a state: R = −k·u, the force it puts on
 * the structure. Its axes turn by `angle` from the global ones.
 */
export function springForces(sup: SolverSupport, disp: Disp): Array<{ component: number; k: number; R: number }> {
  const [u, w, th] = disp(sup.nodeId);
  const a = sup.angle ?? 0;
  const c = Math.cos(a), s = Math.sin(a);
  const local = [c * u + s * w, -s * u + c * w, th];
  const out: Array<{ component: number; k: number; R: number }> = [];
  [sup.kx, sup.ky, sup.kz].forEach((k, comp) => {
    if ((k ?? 0) > 0) out.push({ component: comp, k: k!, R: -k! * local[comp] });
  });
  return out;
}

/** The direction of a spring component in global axes, as a unit load (fx, fz, my). */
export function springDirection(sup: SolverSupport, component: number): [number, number, number] {
  const a = sup.angle ?? 0;
  const c = Math.cos(a), s = Math.sin(a);
  if (component === 0) return [c, s, 0];
  if (component === 1) return [-s, c, 0];
  return [0, 0, 1];
}

/** Σ R̄ᵢ·R̄ⱼ/k over one spring's components, one row each. */
export function springRows(sup: SolverSupport, a: Disp, b: Disp): TermRow[] {
  const fa = springForces(sup, a), fb = springForces(sup, b);
  return fa.map((x, k) => ({
    elementId: null, source: 'spring' as const, value: (x.R * fb[k].R) / x.k,
    detail: { nodeId: sup.nodeId, component: x.component, a: x.R, b: fb[k].R, k: x.k },
  }));
}

/**
 * Which unknowns a square system cannot determine: Gaussian elimination with
 * complete pivoting, stopping where every pivot left is below 1e-9 of the
 * largest entry. The columns never pivoted are the unknowns left free.
 */
export function undetermined(A: number[][]): number[] {
  const n = A.length;
  const M = A.map((r) => [...r]);
  const cols = [...Array(n).keys()];
  let big = 0;
  for (const r of M) for (const v of r) big = Math.max(big, Math.abs(v));
  if (!(big > 0)) return cols;
  for (let k = 0; k < n; k++) {
    let pi = k, pj = k;
    for (let i = k; i < n; i++) for (let j = k; j < n; j++) if (Math.abs(M[i][j]) > Math.abs(M[pi][pj])) { pi = i; pj = j; }
    if (!(Math.abs(M[pi][pj]) > 1e-9 * big)) return cols.slice(k);
    [M[k], M[pi]] = [M[pi], M[k]];
    for (const r of M) [r[k], r[pj]] = [r[pj], r[k]];
    [cols[k], cols[pj]] = [cols[pj], cols[k]];
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / M[k][k];
      for (let j = k; j < n; j++) M[i][j] -= f * M[k][j];
    }
  }
  return [];
}

/**
 * With the axial term left out, a redundant that works only axially (the
 * horizontal reaction of a beam) would have no flexibility at all and its
 * equation would say nothing. Such redundants keep the axial term in their
 * row and column; the rest go without it. `droppable` marks the rows that the
 * option removes (frame members' axial terms; a biela's stays).
 */
export function axialKept(terms: TermRow[][][], full: number[][], droppable: (row: TermRow) => boolean): Set<number> {
  const n = full.length;
  const kept = new Set<number>();
  const reduced = () => terms.map((r, i) => r.map((rows, j) => (kept.has(i) || kept.has(j)
    ? full[i][j] : rows.filter((q) => !droppable(q)).reduce((s, q) => s + q.value, 0))));
  let D = reduced();
  const maxDiag = Math.max(0, ...D.map((r, j) => Math.abs(r[j])));
  for (let j = 0; j < n; j++) if (!(Math.abs(D[j][j]) > 1e-9 * Math.max(maxDiag, Math.abs(full[j][j])))) kept.add(j);
  D = reduced();
  for (let pass = 0; pass < n; pass++) {
    const free = undetermined(D);
    if (!free.length || free.every((j) => kept.has(j))) break;
    for (const j of free) kept.add(j);
    D = reduced();
  }
  return kept;
}
