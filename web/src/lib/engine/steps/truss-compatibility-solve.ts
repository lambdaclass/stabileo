/**
 * The numbers of the compatibility-matrix method (truss-compatibility writes
 * the document): p = A q, K = Aᵀ k A, K q = Q, P = k p + P⁰, then end
 * forces, reactions and the joint residual.
 *
 * Two formulations:
 *
 * - Flexible (the default): every free joint displacement is a global
 *   coordinate and every member stretches by EA/L. It is the matrix solve
 *   itself, so it agrees with the engine to rounding.
 * - Inextensible frame members (the classical hand formulation): the frame
 *   members (those that bend) keep their length, (u_J − u_I)·e = 0, so the
 *   joint translations are tied together. The free displacements split into
 *   independent ones, the global coordinates q, and dependent ones, u = T q.
 *   The frame members lose their elongation coordinate (it is identically
 *   zero), A's columns are the unit states of the independent coordinates
 *   with the dependent ones moving along, Q is the work of the loads through
 *   each unit state (Q = Tᵀ Q*), and the frame members' axial forces, which
 *   k no longer gives, come from the equilibrium of the joints. Truss
 *   members (and frame members hinged at both ends) keep their EA/L: they
 *   only work axially, so making them rigid would leave nothing to compute.
 *
 * The split is the one row reduction gives, pivots searched from the last
 * displacement backwards, so the dependent displacements are the later ones
 * and the independent ones read like the classical choice (the first joint
 * of a storey carries its sway). When the assumption cannot be applied (no
 * frame member, constraints that are not independent so the axial forces
 * are not fixed by equilibrium, nothing left to move, or a mechanism) the
 * flexible formulation is used and `inext` says why.
 */
import type { PlaneModel, PMember } from './plane-model';
import { loadsOn, membersAt, nodalLoadAt } from './plane-model';
import { fixedEnd } from './fem';
import { rref } from './sway-modes';
import { EPS, nodeName, pinEnded, solveDense } from './truss-common';

export type DofKind = 'ux' | 'uz' | 'ry';
export interface Dof { node: number; kind: DofKind }
export type MKind = 'frame' | 'hingeI' | 'hingeJ' | 'truss';
export interface Coord { member: number; local: 1 | 2 | 3 }

export interface FixedEndActs { Mi: number; Mj: number; Vi: number; Vj: number; Ni: number; Nj: number; loaded: boolean }

/** How the inextensible assumption went: applied, not asked for, or why it fell back to flexible members. */
export type InextStatus = 'off' | 'on' | 'truss' | 'redundant' | 'none' | 'mechanism';

/** A joint equation giving the axial forces of the inextensible members: known + Σ coef·N = 0. */
export interface AxialRow { dof: number; known: number; coefs: Map<number, number> }

export interface Compat {
  inext: InextStatus;
  /** Every free joint displacement, and where each is in `all`. */
  all: Dof[];
  allIndex: Map<string, number>;
  /** The global coordinates q: the independent displacements (all of them when flexible). */
  dofs: Dof[];
  indep: number[];
  /** u = T q: each free displacement in terms of q (all × n). */
  T: number[][];
  /** The dependent displacements (inextensible only), by index in `all`. */
  deps: number[];
  /** The frame members held at constant length. */
  rigid: Set<number>;
  coords: Coord[];
  byMember: Map<number, number[]>;
  kinds: Map<number, MKind>;
  kBlock: Map<number, number[][]>;
  A: number[][]; k: number[][]; K: number[][];
  /** Loads on every free displacement (Q*), and projected on q. */
  QjAll: number[]; QeAll: number[];
  Qj: number[]; Qe: number[]; Q: number[];
  q: number[];
  /** Every free displacement, u = T q. */
  u: number[];
  p: number[]; P0: number[]; P: number[];
  fe: Map<number, FixedEndActs>;
  axialRows: AxialRow[];
  /** End actions on each member (local): N tension positive at each end, V along +y, M counter-clockwise. */
  ends: Map<number, { Ni: number; Nj: number; Vi: number; Vj: number; Mi: number; Mj: number }>;
  reactions: Map<number, { rx: number; rz: number; my: number }>;
  residual: number;
}

export const memberKind = (m: PMember): MKind => (pinEnded(m) ? 'truss' : m.hingeI ? 'hingeI' : m.hingeJ ? 'hingeJ' : 'frame');
const localsOf = (k: MKind): Array<1 | 2 | 3> => (k === 'frame' ? [1, 2, 3] : k === 'hingeI' ? [2, 3] : k === 'hingeJ' ? [1, 3] : [3]);
export const rigidAt = (m: PMember, node: number) => !pinEnded(m) && ((m.i === node && !m.hingeI) || (m.j === node && !m.hingeJ));

/** The uncoupled stiffness of a member in its own coordinates (a hinged end condensed out: 3EI/L); without the axial term when it keeps its length. */
function memberK(m: PMember, kind: MKind, rigid: boolean): number[][] {
  const a = m.EA / m.L, b4 = (4 * m.EI) / m.L, b2 = (2 * m.EI) / m.L, b3 = (3 * m.EI) / m.L;
  if (kind === 'truss') return [[a]];
  if (kind === 'frame') return rigid ? [[b4, b2], [b2, b4]] : [[b4, b2, 0], [b2, b4, 0], [0, 0, a]];
  return rigid ? [[b3]] : [[b3, 0], [0, a]];
}

/** Element coordinate `local` of member m for the joint movements u (a node's ux, uz, θ). */
export function coordOf(m: PMember, local: 1 | 2 | 3, u: (node: number) => { x: number; z: number; r: number }): number {
  const ui = u(m.i), uj = u(m.j);
  const dux = uj.x - ui.x, duz = uj.z - ui.z;
  const delta = dux * m.c + duz * m.s;
  const psi = (-dux * m.s + duz * m.c) / m.L;
  const v = local === 3 ? delta : local === 1 ? ui.r - psi : uj.r - psi;
  return Math.abs(v) < 1e-14 ? 0 : v;
}

/** The fixed-end actions of a member's span loads, with a hinged end released (as the engine condenses them). */
function fixedEndActs(pm: PlaneModel, m: PMember, kind: MKind): FixedEndActs {
  const loads = loadsOn(pm, m.id).filter((l) => l.kind !== 'thermal');
  if (!loads.length) return { Mi: 0, Mj: 0, Vi: 0, Vj: 0, Ni: 0, Nj: 0, loaded: false };
  const fe = fixedEnd(m, loads, { i: nodeName(pm, m.i), j: nodeName(pm, m.j) });
  let { Mi, Mj, Vi, Vj } = fe;
  let dMi = 0, dMj = 0;
  if (kind === 'truss') { dMi = -Mi; dMj = -Mj; }
  else if (kind === 'hingeI') { dMi = -Mi; dMj = -Mi / 2; }
  else if (kind === 'hingeJ') { dMj = -Mj; dMi = -Mj / 2; }
  Mi += dMi; Mj += dMj; Vi += (dMi + dMj) / m.L; Vj -= (dMi + dMj) / m.L;
  // Axial point loads: a fixed bar takes P·b/L in tension before the load and P·a/L in compression after it.
  let Ni = 0, px = 0;
  for (const l of loads) if (l.kind === 'point' && Math.abs(l.px) > EPS) { Ni += (l.px * (m.L - l.a)) / m.L; px += l.px; }
  return { Mi, Mj, Vi, Vj, Ni, Nj: Ni - px, loaded: true };
}

/** Every free joint displacement: ux, uz where no support holds them, θ where a member is rigidly connected. */
function freeDofs(pm: PlaneModel): Dof[] {
  const out: Dof[] = [];
  for (const id of pm.nodeOrder) {
    const s = pm.supports.get(id);
    const at = membersAt(pm, id);
    if (at.length === 0) continue;
    if (!s?.ux) out.push({ node: id, kind: 'ux' });
    if (!s?.uz) out.push({ node: id, kind: 'uz' });
    if (!s?.ry && at.some((m) => rigidAt(m, id))) out.push({ node: id, kind: 'ry' });
  }
  return out;
}

/** The length constraints of the frame members over the free displacements: one row (u_J − u_I)·e per member. */
function lengthRows(members: PMember[], idx: Map<string, number>, n: number): number[][] {
  return members.map((m) => {
    const r = new Array(n).fill(0);
    const put = (node: number, sg: number) => {
      const ix = idx.get(`${node}:ux`), iz = idx.get(`${node}:uz`);
      if (ix !== undefined) r[ix] += sg * m.c;
      if (iz !== undefined) r[iz] += sg * m.s;
    };
    put(m.i, -1); put(m.j, 1);
    return r.map((v) => (Math.abs(v) < 1e-14 ? 0 : v));
  });
}

/**
 * The independent/dependent split of the free displacements under the length
 * constraints: row reduction with the columns taken last to first, so the
 * pivots (the dependent displacements) fall on the later ones. Null when the
 * constraints are not independent (rank below the number of members).
 */
function splitDofs(rows: number[][], n: number): { indep: number[]; deps: number[]; T: number[][] } | null {
  const rev = rows.map((r) => [...r].reverse());
  const { R, pivots } = rref(rev, n);
  if (pivots.length < rows.length) return null;
  const orig = (c: number) => n - 1 - c;
  const freeRev = [...Array(n).keys()].filter((c) => !pivots.includes(c));
  const indep = freeRev.map(orig).sort((a, b) => a - b);
  const T = Array.from({ length: n }, () => new Array(indep.length).fill(0));
  indep.forEach((o, j) => {
    const f = n - 1 - o;
    T[o][j] = 1;
    pivots.forEach((p, r) => { const v = -R[r][f]; T[orig(p)][j] = Math.abs(v) < 1e-12 ? 0 : v; });
  });
  return { indep, deps: pivots.map(orig).sort((a, b) => a - b), T };
}

export function compatSolve(pm: PlaneModel, inextensible = false): Compat | null {
  const members = pm.memberOrder.map((id) => pm.members.get(id)!);
  const all = freeDofs(pm);
  const nAll = all.length;
  const allIndex = new Map(all.map((d, k) => [`${d.node}:${d.kind}`, k]));
  const kinds = new Map(members.map((m) => [m.id, memberKind(m)]));

  let status: InextStatus = inextensible ? 'on' : 'off';
  let rigid = new Set<number>();
  let split: { indep: number[]; deps: number[]; T: number[][] } | null = null;
  let rows: number[][] = [];
  if (inextensible) {
    const bending = members.filter((m) => kinds.get(m.id) !== 'truss');
    rows = lengthRows(bending, allIndex, nAll);
    split = bending.length ? splitDofs(rows, nAll) : null;
    if (!bending.length) status = 'truss';
    else if (!split) status = 'redundant';
    else if (split.indep.length === 0) status = 'none';
    if (status === 'on') rigid = new Set(bending.map((m) => m.id));
    else split = null;
  }
  const flexible = () => ({ indep: all.map((_, k) => k), deps: [] as number[], T: all.map((_, i) => all.map((__, j) => (i === j ? 1 : 0))) });
  const { indep, deps, T } = split ?? flexible();

  const solved = assemble(pm, members, all, allIndex, kinds, rigid, indep, deps, T, rows, status);
  if (solved) return solved;
  // A mechanism once the frame members are held rigid: fall back to flexible members.
  if (status === 'on') {
    const f = flexible();
    return assemble(pm, members, all, allIndex, kinds, new Set(), f.indep, f.deps, f.T, [], 'mechanism');
  }
  return null;
}

function assemble(
  pm: PlaneModel, members: PMember[], all: Dof[], allIndex: Map<string, number>, kinds: Map<number, MKind>,
  rigid: Set<number>, indep: number[], deps: number[], T: number[][], lenRows: number[][], inext: InextStatus,
): Compat | null {
  const nAll = all.length, n = indep.length;
  const dofs = indep.map((k) => all[k]);
  const coords: Coord[] = [];
  const byMember = new Map<number, number[]>();
  const kBlock = new Map<number, number[][]>();
  for (const m of members) {
    const kind = kinds.get(m.id)!;
    const idx: number[] = [];
    for (const l of localsOf(kind)) {
      if (l === 3 && rigid.has(m.id)) continue;
      idx.push(coords.length); coords.push({ member: m.id, local: l });
    }
    byMember.set(m.id, idx);
    kBlock.set(m.id, memberK(m, kind, rigid.has(m.id)));
  }
  const M = coords.length;
  // A, column by column: the element coordinates of each unit state of q (dependent displacements moving along).
  const unitState = (j: number) => (node: number) => {
    const g = (kd: DofKind) => { const i = allIndex.get(`${node}:${kd}`); return i === undefined ? 0 : T[i][j]; };
    return { x: g('ux'), z: g('uz'), r: g('ry') };
  };
  const A = coords.map(() => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    const u = unitState(j);
    coords.forEach((c, r) => { A[r][j] = coordOf(pm.members.get(c.member)!, c.local, u); });
  }
  const k = coords.map(() => new Array(M).fill(0));
  for (const m of members) {
    const idx = byMember.get(m.id)!, kb = kBlock.get(m.id)!;
    idx.forEach((r, a) => idx.forEach((c, b) => { k[r][c] = kb[a][b]; }));
  }
  const kA = k.map((row) => dofs.map((_, j) => row.reduce((s, v, r) => s + v * A[r][j], 0)));
  const K = dofs.map((_, i) => dofs.map((_, j) => A.reduce((s, row, r) => s + row[i] * kA[r][j], 0)));

  const QjAll = all.map((d) => { const l = nodalLoadAt(pm, d.node); return d.kind === 'ux' ? l.fx : d.kind === 'uz' ? l.fz : l.my; });
  const QeAll = new Array(nAll).fill(0);
  const fe = new Map<number, FixedEndActs>();
  for (const m of members) {
    const f = fixedEndActs(pm, m, kinds.get(m.id)!);
    fe.set(m.id, f);
    if (!f.loaded) continue;
    // The fixed ends hold the member with these forces; the joints take them reversed.
    const gi = { x: -f.Ni * m.c - f.Vi * m.s, z: -f.Ni * m.s + f.Vi * m.c, m: f.Mi };
    const gj = { x: f.Nj * m.c - f.Vj * m.s, z: f.Nj * m.s + f.Vj * m.c, m: f.Mj };
    for (const [node, g] of [[m.i, gi], [m.j, gj]] as const) {
      const ix = allIndex.get(`${node}:ux`), iz = allIndex.get(`${node}:uz`), ir = allIndex.get(`${node}:ry`);
      if (ix !== undefined) QeAll[ix] -= g.x;
      if (iz !== undefined) QeAll[iz] -= g.z;
      if (ir !== undefined && rigidAt(m, node)) QeAll[ir] -= g.m;
    }
  }
  // Q = Tᵀ Q*: the work of the loads through each unit state.
  const project = (v: number[]) => dofs.map((_, j) => v.reduce((s, x, i) => s + T[i][j] * x, 0));
  const Qj = project(QjAll), Qe = project(QeAll);
  const Q = Qj.map((v, i) => v + Qe[i]);
  const q = n ? solveDense(K, Q) : [];
  if (!q) return null;
  const u = T.map((row) => row.reduce((s, v, j) => s + v * q[j], 0));
  const p = A.map((row) => row.reduce((s, v, j) => s + v * q[j], 0));
  const P0 = coords.map((c) => { const f = fe.get(c.member)!; return c.local === 1 ? f.Mi : c.local === 2 ? f.Mj : f.Ni; });
  const P = coords.map((_, r) => k[r].reduce((s, v, c) => s + v * p[c], 0) + P0[r]);

  // End actions without the axial force of the rigid members, which equilibrium gives next.
  const partial = new Map<number, { Ni: number; Nj: number; Vi: number; Vj: number; Mi: number; Mj: number }>();
  for (const m of members) {
    const idx = byMember.get(m.id)!, cs = idx.map((r) => coords[r].local);
    const val = (l: 1 | 2 | 3) => { const at = cs.indexOf(l); return at >= 0 ? P[idx[at]] : 0; };
    const f = fe.get(m.id)!;
    const Mi = val(1), Mj = val(2);
    const Ni = rigid.has(m.id) ? 0 : val(3);
    const Nj = Ni - (f.Ni - f.Nj);
    // The span load's simple-beam reactions plus the shear that balances the end moments.
    const Vsi = f.Vi - (f.Mi + f.Mj) / m.L, Vsj = f.Vj + (f.Mi + f.Mj) / m.L;
    const Vi = Vsi + (Mi + Mj) / m.L, Vj = Vsj - (Mi + Mj) / m.L;
    partial.set(m.id, { Ni, Nj, Vi, Vj, Mi, Mj });
  }
  const nodeForces = (ends: typeof partial) => {
    const F = new Map<number, { x: number; z: number; m: number }>();
    const add = (node: number, x: number, z: number, mm: number) => { const o = F.get(node) ?? { x: 0, z: 0, m: 0 }; o.x += x; o.z += z; o.m += mm; F.set(node, o); };
    for (const m of members) {
      const e = ends.get(m.id)!;
      add(m.i, -e.Ni * m.c - e.Vi * m.s, -e.Ni * m.s + e.Vi * m.c, e.Mi);
      add(m.j, e.Nj * m.c - e.Vj * m.s, e.Nj * m.s + e.Vj * m.c, e.Mj);
    }
    return F;
  };

  // The rigid members' axial forces: at every free translation, Σ forces − load = 0, with
  // N entering through the same coefficients as the length constraint (Cᵀ N = −r).
  const axialRows: AxialRow[] = [];
  const ends = new Map(partial);
  if (rigid.size) {
    const rigidList = members.filter((m) => rigid.has(m.id));
    const F = nodeForces(partial);
    const r = all.map((d) => {
      if (d.kind === 'ry') return 0;
      const f = F.get(d.node) ?? { x: 0, z: 0, m: 0 };
      const l = nodalLoadAt(pm, d.node);
      return d.kind === 'ux' ? f.x - l.fx : f.z - l.fz;
    });
    all.forEach((d, i) => {
      if (d.kind === 'ry') return;
      const coefs = new Map<number, number>();
      rigidList.forEach((m, a) => { if (lenRows[a][i] !== 0) coefs.set(m.id, lenRows[a][i]); });
      if (coefs.size) axialRows.push({ dof: i, known: r[i], coefs });
    });
    // (C Cᵀ) N = −C r: the constraints are independent, so this has one solution.
    const CCt = lenRows.map((a) => lenRows.map((b) => a.reduce((s, v, i) => s + v * b[i], 0)));
    const rhs = lenRows.map((a) => -a.reduce((s, v, i) => s + v * r[i], 0));
    const N = solveDense(CCt, rhs);
    if (!N) return null;
    rigidList.forEach((m, a) => {
      const e = partial.get(m.id)!;
      const f = fe.get(m.id)!;
      ends.set(m.id, { ...e, Ni: N[a], Nj: N[a] - (f.Ni - f.Nj) });
    });
  }

  const F = nodeForces(ends);
  const reactions = new Map<number, { rx: number; rz: number; my: number }>();
  let residual = 0;
  for (const id of pm.nodeOrder) {
    const f = F.get(id) ?? { x: 0, z: 0, m: 0 };
    const l = nodalLoadAt(pm, id);
    const s = pm.supports.get(id);
    const r = { rx: f.x - l.fx, rz: f.z - l.fz, my: f.m - l.my };
    const hasRy = allIndex.has(`${id}:ry`) || !!s?.ry;
    if (s) reactions.set(id, { rx: s.ux ? r.rx : 0, rz: s.uz ? r.rz : 0, my: s.ry ? r.my : 0 });
    if (!s?.ux) residual = Math.max(residual, Math.abs(r.rx));
    if (!s?.uz) residual = Math.max(residual, Math.abs(r.rz));
    if (!s?.ry && hasRy) residual = Math.max(residual, Math.abs(r.my));
  }
  return {
    inext, all, allIndex, dofs, indep, T, deps, rigid, coords, byMember, kinds, kBlock, A, k, K,
    QjAll, QeAll, Qj, Qe, Q, q, u, p, P0, P, fe, axialRows, ends, reactions, residual,
  };
}

/** A member's displaced shape: axial motion linear, transverse by the Hermite cubic from end displacements and rotations. */
export function memberShape(pm: PlaneModel, m: PMember, kind: MKind, u: (node: number) => { x: number; z: number; r: number }, n = 12): Array<{ x: number; z: number }> {
  const a = pm.nodes.get(m.i)!, b = pm.nodes.get(m.j)!;
  const ua = u(m.i), ub = u(m.j);
  const vI = -ua.x * m.s + ua.z * m.c, vJ = -ub.x * m.s + ub.z * m.c;
  const wI = ua.x * m.c + ua.z * m.s, wJ = ub.x * m.c + ub.z * m.s;
  const psi = (vJ - vI) / m.L;
  let tI = ua.r, tJ = ub.r;
  if (kind === 'truss') { tI = psi; tJ = psi; }
  else if (kind === 'hingeI') tI = psi - (tJ - psi) / 2;
  else if (kind === 'hingeJ') tJ = psi - (tI - psi) / 2;
  const pts: Array<{ x: number; z: number }> = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, L = m.L;
    const h1 = 1 - 3 * t * t + 2 * t ** 3, h2 = L * (t - 2 * t * t + t ** 3), h3 = 3 * t * t - 2 * t ** 3, h4 = L * (-t * t + t ** 3);
    const v = h1 * vI + h2 * tI + h3 * vJ + h4 * tJ;
    const w = wI + (wJ - wI) * t;
    const x0 = a.x + (b.x - a.x) * t, z0 = a.z + (b.z - a.z) * t;
    pts.push({ x: x0 + w * m.c - v * m.s, z: z0 + w * m.s + v * m.c });
  }
  return pts;
}

/** Bending moment along a member (sagging positive), from its end actions and span loads. */
export function momentAlong(pm: PlaneModel, m: PMember, e: { Vi: number; Mi: number }, t: number): number {
  const x = t * m.L;
  let M = -e.Mi + e.Vi * x;
  for (const l of loadsOn(pm, m.id)) {
    if (l.kind === 'dist') {
      const hi = Math.min(x, l.b);
      if (hi <= l.a) continue;
      const q = (s: number) => (l.b > l.a ? l.qa + ((l.qb - l.qa) * (s - l.a)) / (l.b - l.a) : 0);
      // ∫ q(s)(x − s) ds over [a, min(x, b)]: a cubic, Simpson is exact.
      const mid = (l.a + hi) / 2;
      M += ((hi - l.a) / 6) * (q(l.a) * (x - l.a) + 4 * q(mid) * (x - mid) + q(hi) * (x - hi));
    } else if (l.kind === 'point' && l.a < x) {
      M += l.p * (x - l.a) - l.m;
    }
  }
  return M;
}
