/**
 * The joint translations of a plane frame whose members keep their length
 * (axial deformation neglected), as the classical methods need them: moment
 * distribution with sway and slope-deflection (methods/frames).
 *
 * - Unknowns: the translations ux, uz of every node with members.
 * - Constraints: the translations each support holds, and every member
 *   keeping its length, (u_j − u_i)·e_ij = 0 (inclined members included).
 * - The sway modes are a basis of the nullspace of those constraints, found
 *   by row reduction. The basis is then re-chosen by reducing the chord
 *   rotations, so that each mode rotates its own pivot member and none of
 *   the others: for an orthogonal frame, one story drifting with the rest
 *   held (the classical story modes). Each mode is scaled so its largest
 *   translation is +1.
 * - Chord rotation of a member in a mode: ψ = (u_j − u_i)·n / L, n the member's
 *   local +y, counter-clockwise positive (the documents' convention for end
 *   moments and joint rotations too).
 * - Each mode's equilibrium equation, by virtual work on the mode as a
 *   mechanism of rigid chords with the joints not rotating:
 *   −Σ ψ_m,k (M_ij + M_ji) = W_k, W_k the work of the loads, with each span
 *   load acting on the joints as its reversed simple-beam reactions. With a
 *   fictitious restraint holding the mode, the force it supplies is
 *   R_k = −Σ ψ_m,k (M_ij + M_ji) − W_k.
 *
 * Also the node kinds the methods read (fixed, rotating joint, released end)
 * and the small dense linear algebra all of this uses.
 */
import type { PlaneModel, PMember } from './plane-model';
import { nodalLoadAt, orientation } from './plane-model';

// ─── Small dense linear algebra ─────────────────────────────────────────────

/** Row-reduced echelon form, pivots searched in the first `ncols` columns only (the rest ride along). */
export function rref(A: number[][], ncols: number): { R: number[][]; pivots: number[] } {
  const R = A.map((r) => r.slice());
  let scale = 0;
  for (const r of R) for (let c = 0; c < ncols; c++) scale = Math.max(scale, Math.abs(r[c]));
  const tol = 1e-10 * Math.max(scale, 1e-300);
  const pivots: number[] = [];
  let row = 0;
  for (let c = 0; c < ncols && row < R.length; c++) {
    let p = row;
    for (let r = row + 1; r < R.length; r++) if (Math.abs(R[r][c]) > Math.abs(R[p][c])) p = r;
    if (Math.abs(R[p][c]) <= tol) continue;
    [R[row], R[p]] = [R[p], R[row]];
    const pv = R[row][c];
    for (let k = 0; k < R[row].length; k++) R[row][k] /= pv;
    for (let r = 0; r < R.length; r++) {
      if (r === row || R[r][c] === 0) continue;
      const f = R[r][c];
      for (let k = 0; k < R[r].length; k++) R[r][k] -= f * R[row][k];
    }
    pivots.push(c);
    row++;
  }
  return { R, pivots };
}

/** A basis of {x : A x = 0}, one vector per free column. */
export function nullspace(A: number[][], n: number): number[][] {
  const { R, pivots } = rref(A, n);
  const free = [...Array(n).keys()].filter((c) => !pivots.includes(c));
  return free.map((f) => {
    const v = new Array(n).fill(0);
    v[f] = 1;
    pivots.forEach((p, r) => { v[p] = -R[r][f]; });
    return v;
  });
}

/** Gaussian elimination with partial pivoting; null when singular. */
export function solveDense(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, k) => [...r, b[k]]);
  let scale = 0;
  for (const r of A) for (const v of r) scale = Math.max(scale, Math.abs(v));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) <= 1e-12 * Math.max(scale, 1e-300)) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}


// ─── Node kinds and sway modes ──────────────────────────────────────────────

export type EndKind = 'fixed' | 'joint' | 'released';
export type EndSide = 'i' | 'j';

export interface Mode {
  /** Translation of each node for a unit amplitude (the largest component is +1). */
  phi: Map<number, { x: number; z: number }>;
  /** Chord rotation of each member for a unit amplitude, counter-clockwise positive. */
  psi: Map<number, number>;
  /** Vertical columns of one story drifting by the unit, nothing else rotating. */
  story: boolean;
  /** The node carrying the unit component. */
  lead: number;
}

export interface FrameKin {
  pm: PlaneModel;
  /** Nodes with members, in naming order. */
  nodes: number[];
  degree: Map<number, number>;
  kind: Map<number, EndKind>;
  /** Rotating joints (θ unknown), in naming order. */
  joints: number[];
  released: number[];
  fixed: number[];
  /** Applied couple at each node, counter-clockwise. */
  couple: Map<number, number>;
  modes: Mode[];
  /** For the count of sway modes: translations, constraints by kind, independent constraints. */
  nTrans: number;
  nSupportCons: number;
  nMemberCons: number;
  rank: number;
}

/** Read the frame: node kinds and sway modes; null when a translation rotates no member. */
export function frameKinematics(pm: PlaneModel): FrameKin | null {
  const degree = new Map<number, number>();
  for (const m of pm.members.values()) {
    degree.set(m.i, (degree.get(m.i) ?? 0) + 1);
    degree.set(m.j, (degree.get(m.j) ?? 0) + 1);
  }
  const nodes = pm.nodeOrder.filter((n) => degree.has(n));
  const col = new Map(nodes.map((n, k) => [n, k]));
  const nv = 2 * nodes.length;
  const rows: number[][] = [];
  let nSupportCons = 0;
  for (const s of pm.supports.values()) {
    const k = col.get(s.node);
    if (k === undefined) continue;
    if (s.ux) { const r = new Array(nv).fill(0); r[2 * k] = 1; rows.push(r); nSupportCons++; }
    if (s.uz) { const r = new Array(nv).fill(0); r[2 * k + 1] = 1; rows.push(r); nSupportCons++; }
  }
  // Each member keeps its length: (u_j − u_i)·e = 0.
  for (const m of pm.members.values()) {
    const r = new Array(nv).fill(0);
    const ki = col.get(m.i)!, kj = col.get(m.j)!;
    r[2 * ki] -= m.c; r[2 * ki + 1] -= m.s;
    r[2 * kj] += m.c; r[2 * kj + 1] += m.s;
    rows.push(r);
  }
  const rank = rref(rows, nv).pivots.length;
  const basis = nullspace(rows, nv);

  const mids = pm.memberOrder;
  const psiOf = (v: number[], m: PMember) => {
    const ki = col.get(m.i)!, kj = col.get(m.j)!;
    const dx = v[2 * kj] - v[2 * ki], dz = v[2 * kj + 1] - v[2 * ki + 1];
    return (-m.s * dx + m.c * dz) / m.L;
  };
  // Re-choose the basis by reducing the chord rotations [Ψᵀ | Nᵀ]: each new
  // mode rotates its pivot member and none of the other pivot members.
  const aug = basis.map((v) => [...mids.map((id) => psiOf(v, pm.members.get(id)!)), ...v]);
  const red = rref(aug, mids.length);
  // A translation that rotates no member is a mechanism the frame cannot resist by bending.
  if (red.pivots.length < basis.length) return null;

  const modes: Mode[] = red.R.map((r) => {
    const v = r.slice(mids.length);
    let big = 0;
    for (const x of v) big = Math.max(big, Math.abs(x));
    let idx = v.findIndex((x) => Math.abs(x) >= big * (1 - 1e-9));
    if (idx < 0) idx = 0;
    const f = 1 / v[idx];
    const w = v.map((x) => (Math.abs(x * f) < 1e-12 ? 0 : x * f));
    const phi = new Map<number, { x: number; z: number }>();
    nodes.forEach((n, k) => phi.set(n, { x: w[2 * k], z: w[2 * k + 1] }));
    const psi = new Map<number, number>();
    for (const id of mids) {
      const p = psiOf(w, pm.members.get(id)!);
      psi.set(id, Math.abs(p) < 1e-12 ? 0 : p);
    }
    const rotating = mids.filter((id) => psi.get(id) !== 0);
    const story = rotating.length > 0
      && rotating.every((id) => { const m = pm.members.get(id)!; return orientation(m) === 'vertical' && Math.abs(psi.get(id)! * m.L + 1) < 1e-9; })
      && [...phi.values()].every((p) => p.z === 0);
    return { phi, psi, story, lead: nodes[Math.floor(idx / 2)] };
  });

  const kind = new Map<number, EndKind>();
  for (const n of nodes) {
    const s = pm.supports.get(n);
    kind.set(n, s?.ry ? 'fixed' : degree.get(n)! >= 2 ? 'joint' : 'released');
  }
  const couple = new Map(nodes.map((n) => [n, nodalLoadAt(pm, n).my]));
  return {
    pm, nodes, degree, kind, couple, modes, rank, nTrans: nv, nSupportCons, nMemberCons: pm.members.size,
    joints: nodes.filter((n) => kind.get(n) === 'joint'),
    released: nodes.filter((n) => kind.get(n) === 'released'),
    fixed: nodes.filter((n) => kind.get(n) === 'fixed'),
  };
}


/** The key of a member end in the end-moment maps: member id and side. */
export const endKey = (id: number, e: EndSide) => `${id}${e}`;

// ─── Loads on the joints and the work of a mode ─────────────────────────────

/** What a member hands its end joints: its simple-beam reactions (local +y) and its axial point loads. */
export interface SpanTransfer { m: PMember; V0i: number; V0j: number; px: number }

/** The loads acting on each node: its own, plus each member's span loads as reversed simple-beam reactions. */
export function jointLoads(fk: FrameKin, members: Iterable<SpanTransfer>): Map<number, { x: number; z: number }> {
  const F = new Map<number, { x: number; z: number }>();
  for (const n of fk.nodes) { const l = nodalLoadAt(fk.pm, n); F.set(n, { x: l.fx, z: l.fz }); }
  for (const d of members) {
    const nx = -d.m.s, nz = d.m.c;
    const fi = F.get(d.m.i)!, fj = F.get(d.m.j)!;
    fi.x += -d.V0i * nx + d.px * d.m.c; fi.z += -d.V0i * nz + d.px * d.m.s;
    fj.x += -d.V0j * nx; fj.z += -d.V0j * nz;
  }
  return F;
}

/** Work of the joint loads F through the translations of mode k: W_k. */
export function modeWork(fk: FrameKin, F: Map<number, { x: number; z: number }>, k: number): number {
  let W = 0;
  for (const [n, f] of F) { const p = fk.modes[k].phi.get(n)!; W += f.x * p.x + f.z * p.z; }
  return W;
}

/** Generalised force a fictitious restraint of mode k must supply: R_k = −Σ ψ (M_ij + M_ji) − W_k. */
export function restraint(fk: FrameKin, M: Map<string, number>, k: number, W: number): number {
  let s = 0;
  for (const [id, p] of fk.modes[k].psi) if (p !== 0) s += p * ((M.get(endKey(id, 'i')) ?? 0) + (M.get(endKey(id, 'j')) ?? 0));
  return -s - W;
}


/** The number of sway modes of the frame, or null when a translation rotates no member (a mechanism). */
export function swayModeCount(pm: PlaneModel): number | null {
  const fk = frameKinematics(pm);
  return fk ? fk.modes.length : null;
}
