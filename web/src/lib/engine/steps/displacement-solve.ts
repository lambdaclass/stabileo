/**
 * The numbers of the displacement method as a course writes it: estado 0
 * (every unknown locked: fixed-end moments of the loads, settlements and
 * temperature, and the forces the fictitious restraints take), one estado per
 * unknown set to 1 (the members' end moments from 4EI/L, 2EI/L, 6EI/L², 3EI/L
 * and, where it enters, EA/L), the stiffness coefficients k_ij, the system
 * K·D = −R⁰ and the superposition M = M⁰ + Σ D_j M^(j).
 *
 * Every coefficient is the generalised force on unknown i in estado j, by
 * virtual work with the unit displacement of i: the end moments work on the
 * end rotations, −ψ(M_ij + M_ji) is the work of the member's shear through
 * its chord rotation, N·e that of the axial force through the elongation,
 * and a spring adds k·u·φ. For a rotation it is the sum of the end moments at
 * the joint; for a story drift, the story shear.
 */
import type { PlaneModel } from './plane-model';
import { nodalLoadAt } from './plane-model';
import { endKey, frameKinematics, solveDense, type EndKind, type EndSide, type FrameKin } from './sway-modes';
import { memberData, type MemberData } from './frames-common';
import type { KinSet } from './kinematic-unknowns';
import { transOf } from './kinematic-unknowns';

/** A member's end rotations (0 at released ends), chord rotation ψ and elongation e in one state. */
export interface MKin { thi: number; thj: number; psi: number; e: number }
/** End moments (counter-clockwise on the member) and, for an extensible member, the axial force at I (tension positive). */
export interface MAct { Mi: number; Mj: number; N: number | null }

export interface State { kin: Map<number, MKin>; act: Map<number, MAct> }

/** Estado 0's fixed-end moments of one member, by origin, before the released ends are let go. */
export interface Fem0 { load: [number, number]; settle: [number, number]; thermal: [number, number]; N: number | null }

export interface DispSolution {
  ks: KinSet;
  fk: FrameKin;
  md: Map<number, MemberData>;
  /** Loads on the joints: their own and the span loads' reversed simple-beam reactions. */
  F: Map<number, { x: number; z: number }>;
  W: number[];
  s0: State;
  fem0: Map<number, Fem0>;
  states: State[];
  K: number[][];
  R0: number[];
  D: number[];
  residual: number;
  M: Map<string, number>;
  N: Map<number, number>;
  springs: Map<number, { x: number; z: number; m: number }>;
  u: Map<number, { x: number; z: number }>;
  theta: Map<number, number>;
}

/** A FrameKin for the closing steps (shears, axial forces, reactions, diagrams) when the members are not held rigid. */
function plainKin(pm: PlaneModel): FrameKin {
  const fk = frameKinematics(pm);
  if (fk) return fk;
  const degree = new Map<number, number>();
  for (const m of pm.members.values()) for (const n of [m.i, m.j]) degree.set(n, (degree.get(n) ?? 0) + 1);
  const nodes = pm.nodeOrder.filter((n) => degree.has(n));
  const kind = new Map<number, EndKind>(nodes.map((n) => [n, pm.supports.get(n)?.ry ? 'fixed' : degree.get(n)! >= 2 ? 'joint' : 'released']));
  return {
    pm, nodes, degree, kind, couple: new Map(nodes.map((n) => [n, nodalLoadAt(pm, n).my])), modes: [],
    nTrans: 2 * nodes.length, nSupportCons: 0, nMemberCons: 0, rank: 0,
    joints: nodes.filter((n) => kind.get(n) === 'joint'), released: nodes.filter((n) => kind.get(n) === 'released'), fixed: nodes.filter((n) => kind.get(n) === 'fixed'),
  };
}

export const released = (ks: KinSet, id: number, e: EndSide) => ks.ends.get(endKey(id, e))?.role === 'released';

/** The thermal gradient's fixed-end moments: EI·α·ΔT_g/h, counter-clockwise at I, clockwise at J. */
export function thermalFem(ks: KinSet, d: MemberData): [number, number] {
  const t = ks.thermal.get(d.m.id);
  if (!t || !t.dg || !(t.h > 0) || d.m.truss) return [0, 0];
  const M = (d.m.EI * t.alpha * t.dg) / t.h;
  return [M, -M];
}

function kinOf(ks: KinSet, d: MemberData, u: (n: number) => { x: number; z: number }, th: (key: string) => number): MKin {
  const m = d.m;
  const a = u(m.i), b = u(m.j);
  const dx = b.x - a.x, dz = b.z - a.z;
  const clean = (v: number) => (Math.abs(v) < 1e-14 ? 0 : v);
  return {
    thi: released(ks, m.id, 'i') ? 0 : clean(th(endKey(m.id, 'i'))),
    thj: released(ks, m.id, 'j') ? 0 : clean(th(endKey(m.id, 'j'))),
    psi: clean((-m.s * dx + m.c * dz) / m.L),
    e: clean(m.c * dx + m.s * dz),
  };
}

/** End moments from the slope-deflection equation, then each released end let go to its known moment (half carried over). */
export function actOf(ks: KinSet, d: MemberData, k: MKin, fixed: [number, number] | null): MAct {
  const m = d.m, r = (2 * m.EI) / m.L;
  const [Fi, Fj] = fixed ?? [0, 0];
  const Mfi = Fi + r * (2 * k.thi + k.thj - 3 * k.psi);
  const Mfj = Fj + r * (2 * k.thj + k.thi - 3 * k.psi);
  const relI = released(ks, m.id, 'i'), relJ = released(ks, m.id, 'j');
  const Ki = fixed ? ks.ends.get(endKey(m.id, 'i'))!.known : 0;
  const Kj = fixed ? ks.ends.get(endKey(m.id, 'j'))!.known : 0;
  let Mi = Mfi, Mj = Mfj;
  if (relI && relJ) { Mi = Ki; Mj = Kj; }
  else if (relJ) { Mi = Mfi + (Kj - Mfj) / 2; Mj = Kj; }
  else if (relI) { Mj = Mfj + (Ki - Mfi) / 2; Mi = Ki; }
  let N: number | null = null;
  if (ks.extensible.has(m.id)) {
    const t = ks.thermal.get(m.id);
    const free = fixed && t ? t.alpha * t.dt * m.L : 0;
    N = (m.EA / m.L) * (k.e - free) + (fixed ? axialFixedEnd(d) : 0);
  }
  return { Mi, Mj, N };
}

/** The axial force at I of a bar fixed at both ends under its axial point loads: Σ P·(L − a)/L. */
export function axialFixedEnd(d: MemberData): number {
  let N = 0;
  for (const l of d.loads) if (l.kind === 'point' && l.px) N += (l.px * (d.m.L - l.a)) / d.m.L;
  return N;
}

/** The rotation of a node in a state: its group's unknown (or a held settlement). */
function nodeRot(ks: KinSet, n: number, D: (k: number) => number): number {
  const k = ks.unknowns.findIndex((u) => u.kind === 'rot' && !u.hinge && u.node === n);
  return k >= 0 ? D(k) : ks.thHeld.get(n) ?? 0;
}

/** Generalised force on unknown i of the member actions of a state (virtual work), springs included. */
export function work(ks: KinSet, kinI: Map<number, MKin>, act: Map<number, MAct>, springU: (node: number, dir: 'x' | 'z' | 'r') => number, i: number): number {
  let g = 0;
  for (const [id, k] of kinI) {
    const a = act.get(id)!;
    g += a.Mi * k.thi + a.Mj * k.thj - k.psi * (a.Mi + a.Mj) + (a.N ?? 0) * k.e;
  }
  const u = ks.unknowns[i];
  for (const s of ks.springs) {
    const phi = s.dir === 'r' ? (u.kind === 'rot' && !u.hinge && u.node === s.node ? 1 : 0) : transOf(u, s.node)[s.dir];
    if (phi) g += s.k * springU(s.node, s.dir) * phi;
  }
  return g;
}

export function solveDisplacement(ks: KinSet): DispSolution {
  const pm = ks.pm;
  const fk = ks.fk ?? plainKin(pm);
  const md = memberData(fk);
  const n = ks.unknowns.length;

  const F = new Map<number, { x: number; z: number }>();
  for (const q of ks.nodes) { const l = nodalLoadAt(pm, q); F.set(q, { x: l.fx, z: l.fz }); }
  for (const d of md.values()) {
    const nx = -d.m.s, nz = d.m.c;
    const fi = F.get(d.m.i)!, fj = F.get(d.m.j)!;
    fi.x -= d.V0i * nx; fi.z -= d.V0i * nz;
    fj.x += -d.V0j * nx + d.px * d.m.c; fj.z += -d.V0j * nz + d.px * d.m.s;
  }
  const W = ks.unknowns.map((u) => {
    let w = 0;
    for (const [q, f] of F) { const p = transOf(u, q); w += f.x * p.x + f.z * p.z; }
    if (u.kind === 'rot' && !u.hinge) w += nodalLoadAt(pm, u.node).my;
    return w;
  });

  const unitKin = (k: number) => {
    const u = ks.unknowns[k];
    const kin = new Map<number, MKin>();
    for (const d of md.values()) {
      kin.set(d.m.id, kinOf(ks, d, (q) => transOf(u, q), (key) => (ks.ends.get(key)?.unknown === k ? 1 : 0)));
    }
    return kin;
  };
  const kins = ks.unknowns.map((_, k) => unitKin(k));
  const states: State[] = kins.map((kin) => ({ kin, act: new Map([...kin].map(([id, k]) => [id, actOf(ks, md.get(id)!, k, null)])) }));

  const fem0 = new Map<number, Fem0>();
  const kin0 = new Map<number, MKin>();
  const act0 = new Map<number, MAct>();
  for (const d of md.values()) {
    const k = kinOf(ks, d, (q) => ks.up.get(q) ?? { x: 0, z: 0 }, (key) => {
      const e = ks.ends.get(key)!;
      return e.role === 'held' ? ks.thHeld.get(e.node) ?? 0 : 0;
    });
    kin0.set(d.m.id, k);
    const r = (2 * d.m.EI) / d.m.L;
    const settle: [number, number] = [r * (2 * k.thi + k.thj - 3 * k.psi), r * (2 * k.thj + k.thi - 3 * k.psi)];
    const thermal = thermalFem(ks, d);
    const a = actOf(ks, d, k, [d.fe.Mi + thermal[0], d.fe.Mj + thermal[1]]);
    act0.set(d.m.id, a);
    fem0.set(d.m.id, { load: [d.fe.Mi, d.fe.Mj], settle, thermal, N: a.N });
  }
  const s0: State = { kin: kin0, act: act0 };

  const up = (q: number) => ks.up.get(q) ?? { x: 0, z: 0 };
  const springAt = (D: (k: number) => number, base: boolean) => (q: number, dir: 'x' | 'z' | 'r') => {
    if (dir === 'r') return nodeRot(ks, q, D);
    let v = base ? up(q)[dir] : 0;
    ks.unknowns.forEach((u, k) => { if (u.kind === 'trans') v += D(k) * transOf(u, q)[dir]; });
    return v;
  };
  const K = ks.unknowns.map((_, i) => ks.unknowns.map((__, j) => work(ks, kins[i], states[j].act, springAt((k) => (k === j ? 1 : 0), false), i)));
  const R0 = ks.unknowns.map((_, i) => work(ks, kins[i], act0, springAt(() => 0, true), i) - W[i]);
  const D = solveDense(K, R0.map((v) => -v)) ?? new Array(n).fill(0);
  const residual = K.reduce((s, row, i) => Math.max(s, Math.abs(row.reduce((t, v, j) => t + v * D[j], 0) + R0[i])), 0);

  const M = new Map<string, number>();
  const N = new Map<number, number>();
  for (const d of md.values()) {
    const id = d.m.id;
    const a = act0.get(id)!;
    M.set(endKey(id, 'i'), a.Mi + states.reduce((s, st, j) => s + D[j] * st.act.get(id)!.Mi, 0));
    M.set(endKey(id, 'j'), a.Mj + states.reduce((s, st, j) => s + D[j] * st.act.get(id)!.Mj, 0));
    if (a.N !== null) N.set(id, a.N + states.reduce((s, st, j) => s + D[j] * st.act.get(id)!.N!, 0));
  }
  const u = new Map<number, { x: number; z: number }>();
  for (const q of ks.nodes) {
    const b = up(q);
    let x = b.x, z = b.z;
    ks.unknowns.forEach((un, k) => { const p = transOf(un, q); x += D[k] * p.x; z += D[k] * p.z; });
    u.set(q, { x, z });
  }
  const theta = new Map<number, number>();
  ks.unknowns.forEach((un, k) => { if (un.kind === 'rot' && !un.hinge) theta.set(un.node, D[k]); });
  const springs = new Map<number, { x: number; z: number; m: number }>();
  const final = springAt((k) => D[k], true);
  for (const s of ks.springs) {
    const o = springs.get(s.node) ?? { x: 0, z: 0, m: 0 };
    const v = -s.k * final(s.node, s.dir);
    if (s.dir === 'x') o.x += v; else if (s.dir === 'z') o.z += v; else o.m += v;
    springs.set(s.node, o);
  }
  return { ks, fk, md, F, W, s0, fem0, states, K, R0, D, residual, M, N, springs, u, theta };
}

