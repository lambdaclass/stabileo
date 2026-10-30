/**
 * A plane frame as the second-order teaching solver sees it: the unknowns (the free nodal
 * displacements, or the independent ones once members keep their length), the load vector
 * with the span loads as first-order fixed-end actions, and the assembly of K(N) for a given
 * axial force in every member.
 *
 * Built on the explained methods' plane model (`steps/plane-model.ts`), so the members, the
 * supports and the loads are read exactly as every other explained method reads them.
 */
import type { SolverInput } from '../types';
import { planeModel, type PlaneModel, type PMember } from '../steps/plane-model';
import { fixedEnd } from '../steps/fem';
import { axialEquivalentLoads } from '../axial-span-2d';
import { nullspace, rref, solveDense } from '../steps/sway-modes';
import type { Txt } from '../steps/doc';
import { tx } from '../steps/doc';
import { memberStiffness, rotation, type GeomMethod, type MemberStiffness } from './member-matrices';
import { matMul, transpose, zeros, type Mat } from './dense';

export interface SecondOrderOptions {
  method: GeomMethod;
  /** Members keep their length: no EA, a constraint per member, N from equilibrium. */
  axialRigid: boolean;
}

export interface SoSystem {
  pm: PlaneModel;
  members: PMember[];
  /** Global index of node `id`'s DOF k (0 ux, 1 uz, 2 θ). */
  dof: (node: number, k: number) => number;
  nTotal: number;
  /** Global indices of the free DOFs, in order: the unknowns before any constraint. */
  free: number[];
  /** Restrained global DOF → prescribed value. */
  prescribed: Map<number, number>;
  springs: Array<{ dof: number; k: number }>;
  /** External loads, global, nodal loads plus the members' equivalent loads. */
  F: number[];
  /** The nodal loads alone. */
  Fnodal: number[];
  /** Each member's equivalent end loads in its own axes, uncondensed (−fixed-end reactions). */
  memberLoads: Map<number, number[]>;
  /** The free DOFs no member or spring stiffens (a rotation where only hinges meet): held at 0. */
  idle: number[];
  axialRigid: boolean;
  /**
   * With rigid members: free displacements = Tq, and the members' elongations Cf·D (rows by
   * member). q are the free displacements at positions `indep` of `free`; the rest follow.
   */
  rigid?: { T: Mat; C: Mat; Cfull: Mat; indep: number[] };
}

export type Built = { ok: true; sys: SoSystem } | { ok: false; reason: Txt };

/** The largest system the teaching solver assembles densely. */
export const TEACHING_MAX_DOFS = 300;

export function unsupported(input: SolverInput): Txt | null {
  if (input.constraints?.length) return tx('course.second-order.refuse.constraints');
  if (input.connectors?.size) return tx('course.second-order.refuse.constraints');
  if (input.loads.some((l) => l.type === 'thermal')) return tx('course.second-order.refuse.thermal');
  for (const s of input.supports.values()) {
    if (s.type === 'inclinedRoller' || (s.type === 'spring' && s.angle)) return tx('course.second-order.refuse.inclined');
  }
  return null;
}

export function buildSystem(input: SolverInput, opts: SecondOrderOptions): Built {
  const refusal = unsupported(input);
  if (refusal) return { ok: false, reason: refusal };
  const pm = planeModel(input);
  const members = pm.memberOrder.map((id) => pm.members.get(id)!);
  if (!members.length) return { ok: false, reason: tx('steps.req.noMembers') };
  const index = new Map(pm.nodeOrder.map((id, k) => [id, k]));
  const dof = (node: number, k: number) => 3 * index.get(node)! + k;
  const nTotal = 3 * pm.nodeOrder.length;

  const prescribed = new Map<number, number>();
  const springs: Array<{ dof: number; k: number }> = [];
  for (const s of pm.supports.values()) {
    const vals = [s.dx ?? 0, s.dz ?? 0, s.dry ?? 0];
    [s.ux, s.uz, s.ry].forEach((held, k) => { if (held) prescribed.set(dof(s.node, k), vals[k]); });
    if (s.type === 'spring') {
      [s.kx, s.kz, s.kr].forEach((kv, k) => { if (kv && kv > 0) springs.push({ dof: dof(s.node, k), k: kv }); });
    }
  }
  if (opts.axialRigid && [...prescribed.values()].some((v) => v !== 0)) return { ok: false, reason: tx('course.second-order.refuse.rigidSettlement') };

  const F = new Array(nTotal).fill(0);
  for (const l of pm.nodalLoads) {
    F[dof(l.node, 0)] += l.fx; F[dof(l.node, 1)] += l.fz; F[dof(l.node, 2)] += l.my;
  }
  const memberLoads = new Map<number, number[]>();
  for (const m of members) {
    const p = new Array(6).fill(0);
    const loads = pm.memberLoads.filter((l) => l.member === m.id);
    if (!loads.length) continue;
    if (!m.truss) {
      const fe = fixedEnd(m, loads, { i: 'I', j: 'J' });
      p[1] = -fe.Vi; p[2] = -fe.Mi; p[4] = -fe.Vj; p[5] = -fe.Mj;
    }
    for (const l of loads) {
      if (l.kind !== 'point') continue;
      p[0] += l.px * (m.L - l.a) / m.L;
      p[3] += l.px * l.a / m.L;
      if (m.truss) { p[1] += l.p * (m.L - l.a) / m.L; p[4] += l.p * l.a / m.L; }
    }
    if (m.truss) for (const l of loads) if (l.kind === 'dist') {
      const [pi, pj] = axialEquivalentLoads(l.qa, l.qb, l.a, l.b, m.L);
      p[1] += pi; p[4] += pj;
    }
    memberLoads.set(m.id, p);
  }

  const sys: SoSystem = { pm, members, dof, nTotal, free: [], prescribed, springs, F, Fnodal: F.slice(), memberLoads, idle: [], axialRigid: opts.axialRigid };
  addEquivalentLoads(sys);

  const K0 = assemble(sys, new Map(), 'none', true);
  const free: number[] = [];
  const idle: number[] = [];
  for (let d = 0; d < nTotal; d++) {
    if (prescribed.has(d)) continue;
    if (K0.K[d].every((v) => v === 0)) idle.push(d); else free.push(d);
  }
  sys.free = free;
  sys.idle = idle;
  if (free.length === 0) return { ok: false, reason: tx('course.second-order.refuse.noFree') };
  if (free.length > TEACHING_MAX_DOFS) return { ok: false, reason: tx('course.second-order.refuse.tooBig', { n: free.length, max: TEACHING_MAX_DOFS }) };

  if (opts.axialRigid) {
    const Cfull = members.map((m) => {
      const row = new Array(nTotal).fill(0);
      row[dof(m.i, 0)] -= m.c; row[dof(m.i, 1)] -= m.s; row[dof(m.j, 0)] += m.c; row[dof(m.j, 1)] += m.s;
      return row;
    });
    const C = Cfull.map((row) => free.map((d) => row[d]));
    const CCt = matMul(C, transpose(C));
    const probe = solveDense(CCt, new Array(C.length).fill(1));
    if (!probe) return { ok: false, reason: tx('course.second-order.refuse.rigidIndeterminate') };
    const basis = nullspace(C, free.length);
    if (!basis.length) return { ok: false, reason: tx('course.second-order.refuse.rigidLocked') };
    const T = zeros(free.length, basis.length);
    basis.forEach((v, j) => v.forEach((x, i) => { T[i][j] = x; }));
    const { pivots } = rref(C, free.length);
    const indep = free.map((_, k) => k).filter((k) => !pivots.includes(k));
    sys.rigid = { T, C, Cfull, indep };
  }
  return { ok: true, sys };
}

/** Each member's equivalent end loads, condensed with its elastic release relation and turned global. */
function addEquivalentLoads(sys: SoSystem): void {
  for (const m of sys.members) {
    const p = sys.memberLoads.get(m.id);
    if (!p) continue;
    const { T } = memberStiffness(m, 0, 'none');
    const pc = transpose(T).map((r) => r.reduce((s, v, j) => s + v * p[j], 0));
    const g = transpose(rotation(m.c, m.s)).map((r) => r.reduce((s, v, j) => s + v * pc[j], 0));
    const ids = memberDofs(sys, m);
    ids.forEach((d, k) => { sys.F[d] += g[k]; });
  }
}

export const memberDofs = (sys: Pick<SoSystem, 'dof'>, m: PMember): number[] =>
  [sys.dof(m.i, 0), sys.dof(m.i, 1), sys.dof(m.i, 2), sys.dof(m.j, 0), sys.dof(m.j, 1), sys.dof(m.j, 2)];

export interface Assembled {
  K: Mat;
  local: Map<number, MemberStiffness>;
}

/** K(N) over every DOF of the model, with the members' axial forces `N` (tension positive, 0 when absent). */
export function assemble(sys: Pick<SoSystem, 'members' | 'nTotal' | 'dof' | 'springs' | 'axialRigid'>, N: Map<number, number>, method: GeomMethod, withAxial = !sys.axialRigid): Assembled {
  const K = zeros(sys.nTotal, sys.nTotal);
  const local = new Map<number, MemberStiffness>();
  for (const m of sys.members) {
    const ms = memberStiffness(m, N.get(m.id) ?? 0, method, withAxial);
    local.set(m.id, ms);
    const R = rotation(m.c, m.s);
    const kg = matMul(transpose(R), matMul(ms.k, R));
    const ids = memberDofs(sys, m);
    for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) K[ids[a]][ids[b]] += kg[a][b];
  }
  for (const s of sys.springs) K[s.dof][s.dof] += s.k;
  return { K, local };
}

/** The member's end displacements in its own axes. */
export function localDisplacements(sys: SoSystem, m: PMember, D: number[]): number[] {
  const ids = memberDofs(sys, m);
  const R = rotation(m.c, m.s);
  const g = ids.map((d) => D[d]);
  return R.map((r) => r.reduce((s, v, j) => s + v * g[j], 0));
}

/** Mean axial force from the elongation, EA·δ/L, the force the engine builds K_G from. */
export function elasticAxial(sys: SoSystem, D: number[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const m of sys.members) {
    const d = localDisplacements(sys, m, D);
    out.set(m.id, (m.EA * (d[3] - d[0])) / m.L);
  }
  return out;
}
