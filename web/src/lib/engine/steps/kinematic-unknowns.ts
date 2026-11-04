/**
 * The kinematic unknowns of a plane frame for the displacement method, as a
 * course counts them: the free joint rotations n_θ plus the independent joint
 * translations n_Δ, GIC = n_θ + n_Δ.
 *
 * Rotations, joint by joint: the member ends that arrive without a hinge
 * form one rigid group and turn together. A group held by a fixed support
 * does not rotate. A group of two or more ends, or one end on a rotational
 * spring, is one unknown θ. A group of a single end with nothing holding it,
 * and every hinged end, is a released end: its moment is known (the couple
 * applied there, or zero) and the member is taken with the modified
 * stiffness 3EI/L. With `releasedUnknown` those ends' rotations are counted
 * as unknowns instead and the members keep 4EI/L and 2EI/L.
 *
 * Translations: with members axially rigid, the sway modes of sway-modes.ts
 * (a basis of the translations the supports and the member lengths allow);
 * with axial stiffness, every joint translation no support holds.
 *
 * Also what estado 0 imposes: support settlements and, with rigid members,
 * the translations their thermal elongation forces (a particular solution of
 * the length conditions).
 */
import type { PlaneModel, PMember } from './plane-model';
import { nodalLoadAt } from './plane-model';
import { endKey, frameKinematics, lengthRow, rref, type EndSide, type FrameKin, type Mode } from './sway-modes';
import type { SolverInput } from '../types';
import { loadAlpha, loadDepth } from '../thermal-alpha';

export interface KinOptions { axial: boolean; releasedUnknown: boolean }

/** held: rotation known (a fixed support); joint: turns with its group's unknown; released: modified stiffness, moment known. */
export type EndRole = 'held' | 'joint' | 'released';

export interface EndInfo {
  member: number;
  e: EndSide;
  node: number;
  role: EndRole;
  /** Index of the rotation unknown this end turns with (joint), else −1. */
  unknown: number;
  /** A released end's known moment: the couple at its joint when it is the joint's only member end, else 0. */
  known: number;
  hinge: boolean;
}

export interface RotUnknown { kind: 'rot'; node: number; ends: string[]; hinge: boolean; spring: number }
export interface TransUnknown { kind: 'trans'; phi: Map<number, { x: number; z: number }>; psi: Map<number, number>; lead: number; dir: 'x' | 'z' | null; story: boolean }
export type Unknown = RotUnknown | TransUnknown;

export interface SpringDof { node: number; dir: 'x' | 'z' | 'r'; k: number }

export interface KinSet {
  pm: PlaneModel;
  opts: KinOptions;
  nodes: number[];
  ends: Map<string, EndInfo>;
  unknowns: Unknown[];
  nTheta: number;
  nDelta: number;
  /** Members whose EA/L enters (bielas always, every member with axial stiffness). */
  extensible: Set<number>;
  springs: SpringDof[];
  /** The count of translations: 2n, the support conditions r_t, the length conditions b and how many of all are independent. */
  count: { n: number; rt: number; b: number; rank: number };
  /** Rotations held by supports, ends released and joints where every member is hinged. */
  heldNodes: number[];
  pinJoints: number[];
  /** The sway modes when members are rigid (null when they are not). */
  fk: FrameKin | null;
  /** What estado 0 imposes: translations (settlements, thermal elongation of rigid members) and rotations of held ends. */
  up: Map<number, { x: number; z: number }>;
  thHeld: Map<number, number>;
  thermal: Map<number, { dt: number; dg: number; alpha: number; h: number }>;
}

export type KinResult = { ok: true; ks: KinSet } | { ok: false; key: string; params?: Record<string, string | number> };

export const hingedAt = (m: PMember, node: number) => m.truss || (m.i === node && m.hingeI) || (m.j === node && m.hingeJ);

export function thermalOf(input: SolverInput, pm: PlaneModel): Map<number, { dt: number; dg: number; alpha: number; h: number }> {
  const out = new Map<number, { dt: number; dg: number; alpha: number; h: number }>();
  for (const l of input.loads) {
    if (l.type !== 'thermal') continue;
    const m = pm.members.get(l.data.elementId);
    if (!m) continue;
    const alpha = loadAlpha(l.data);
    const h = loadDepth(l.data.depth, m.A, m.I);
    const o = out.get(m.id) ?? { dt: 0, dg: 0, alpha, h };
    o.dt += l.data.dtUniform; o.dg += l.data.dtGradient;
    out.set(m.id, o);
  }
  return out;
}

export function kinematicUnknowns(input: SolverInput, pm: PlaneModel, opts: KinOptions): KinResult {
  const members = pm.memberOrder.map((id) => pm.members.get(id)!);
  const at = new Map<number, Array<{ m: PMember; e: EndSide }>>();
  for (const m of members) {
    for (const [n, e] of [[m.i, 'i'], [m.j, 'j']] as const) {
      if (!at.has(n)) at.set(n, []);
      at.get(n)!.push({ m, e });
    }
  }
  const nodes = pm.nodeOrder.filter((n) => at.has(n));
  const ends = new Map<string, EndInfo>();
  const unknowns: Unknown[] = [];
  const heldNodes: number[] = [];
  const pinJoints: number[] = [];
  const springs: SpringDof[] = [];

  for (const n of nodes) {
    const s = pm.supports.get(n);
    const kr = s?.type === 'spring' ? s.kr ?? 0 : 0;
    const C = nodalLoadAt(pm, n).my;
    const list = at.get(n)!;
    const rigid = list.filter((x) => !hingedAt(x.m, n));
    const put = (x: { m: PMember; e: EndSide }, role: EndRole, unknown: number, known: number) =>
      ends.set(endKey(x.m.id, x.e), { member: x.m.id, e: x.e, node: n, role, unknown, known, hinge: hingedAt(x.m, n) });
    if (s?.ry) {
      heldNodes.push(n);
      for (const x of rigid) put(x, 'held', -1, 0);
    } else if (rigid.length >= 2 || kr > 0 || (rigid.length === 1 && opts.releasedUnknown)) {
      const k = unknowns.length;
      unknowns.push({ kind: 'rot', node: n, ends: rigid.map((x) => endKey(x.m.id, x.e)), hinge: false, spring: kr });
      for (const x of rigid) put(x, 'joint', k, 0);
      if (kr > 0) springs.push({ node: n, dir: 'r', k: kr });
    } else if (rigid.length === 1) {
      put(rigid[0], 'released', -1, C);
    } else {
      pinJoints.push(n);
      if (Math.abs(C) > 1e-12) return { ok: false, key: 'course.kinematics.req.coupleAtPin', params: { n: pm.nodes.get(n)!.name } };
    }
    for (const x of list) {
      if (!hingedAt(x.m, n)) continue;
      if (opts.releasedUnknown && !x.m.truss) {
        const k = unknowns.length;
        unknowns.push({ kind: 'rot', node: n, ends: [endKey(x.m.id, x.e)], hinge: true, spring: 0 });
        put(x, 'joint', k, 0);
      } else {
        put(x, 'released', -1, 0);
      }
    }
  }
  const nTheta = unknowns.length;

  for (const s of pm.supports.values()) {
    if (s.type !== 'spring' || !at.has(s.node)) continue;
    if ((s.kx ?? 0) > 0) springs.push({ node: s.node, dir: 'x', k: s.kx! });
    if ((s.kz ?? 0) > 0) springs.push({ node: s.node, dir: 'z', k: s.kz! });
  }

  const col = new Map(nodes.map((n, k) => [n, k]));
  const nv = 2 * nodes.length;
  let rt = 0;
  for (const s of pm.supports.values()) if (col.has(s.node)) rt += (s.ux ? 1 : 0) + (s.uz ? 1 : 0);
  const thermal = thermalOf(input, pm);
  const extensible = new Set(members.filter((m) => m.truss || opts.axial).map((m) => m.id));
  const bending = members.filter((m) => !m.truss);
  let fk: FrameKin | null = null;
  let rank = rt;
  const up = new Map<number, { x: number; z: number }>(nodes.map((n) => [n, { x: 0, z: 0 }]));
  for (const s of pm.supports.values()) {
    const u = up.get(s.node);
    if (!u) continue;
    if (s.ux && s.dx) u.x = s.dx;
    if (s.uz && s.dz) u.z = s.dz;
  }

  if (opts.axial) {
    for (const n of nodes) {
      const s = pm.supports.get(n);
      for (const dir of ['x', 'z'] as const) {
        if (dir === 'x' ? s?.ux : s?.uz) continue;
        const phi = new Map(nodes.map((q) => [q, { x: q === n && dir === 'x' ? 1 : 0, z: q === n && dir === 'z' ? 1 : 0 }]));
        unknowns.push({ kind: 'trans', phi, psi: psiOf(pm, phi), lead: n, dir, story: false });
      }
    }
  } else {
    fk = frameKinematics(pm);
    if (!fk) return { ok: false, key: 'course.kinematics.req.mechanism' };
    rank = fk.rank;
    for (const mode of fk.modes) unknowns.push(modeUnknown(mode));
    // The translations estado 0 imposes: supports' settlements and the thermal elongation of members that keep their length otherwise.
    const rows: number[][] = [], rhs: number[] = [];
    for (const s of pm.supports.values()) {
      const k = col.get(s.node);
      if (k === undefined) continue;
      if (s.ux) { const r = new Array(nv).fill(0); r[2 * k] = 1; rows.push(r); rhs.push(s.dx ?? 0); }
      if (s.uz) { const r = new Array(nv).fill(0); r[2 * k + 1] = 1; rows.push(r); rhs.push(s.dz ?? 0); }
    }
    for (const m of bending) {
      rows.push(lengthRow(m, col, nv));
      const t = thermal.get(m.id);
      rhs.push(t ? t.alpha * t.dt * m.L : 0);
    }
    if (rhs.some((v) => v !== 0)) {
      const { R, pivots } = rref(rows.map((r, k) => [...r, rhs[k]]), nv);
      const big = Math.max(...rhs.map(Math.abs));
      for (let r = pivots.length; r < R.length; r++) if (Math.abs(R[r][nv]) > 1e-9 * big) return { ok: false, key: 'course.kinematics.req.imposedRigid' };
      const v = new Array(nv).fill(0);
      pivots.forEach((p, r) => { v[p] = R[r][nv]; });
      nodes.forEach((n, k) => up.set(n, { x: clean(v[2 * k], big), z: clean(v[2 * k + 1], big) }));
    }
  }

  const thHeld = new Map<number, number>();
  for (const n of heldNodes) { const s = pm.supports.get(n)!; if (s.dry) thHeld.set(n, s.dry); }

  return {
    ok: true,
    ks: {
      pm, opts, nodes, ends, unknowns, nTheta, nDelta: unknowns.length - nTheta, extensible, springs,
      count: { n: nodes.length, rt, b: opts.axial ? 0 : bending.length, rank }, heldNodes, pinJoints, fk, up, thHeld, thermal,
    },
  };
}

const clean = (v: number, big: number) => (Math.abs(v) < 1e-12 * Math.max(big, 1e-300) ? 0 : v);

function psiOf(pm: PlaneModel, phi: Map<number, { x: number; z: number }>): Map<number, number> {
  const out = new Map<number, number>();
  for (const m of pm.members.values()) {
    const a = phi.get(m.i) ?? { x: 0, z: 0 }, b = phi.get(m.j) ?? { x: 0, z: 0 };
    const p = (-m.s * (b.x - a.x) + m.c * (b.z - a.z)) / m.L;
    out.set(m.id, Math.abs(p) < 1e-12 ? 0 : p);
  }
  return out;
}

const modeUnknown = (mode: Mode): TransUnknown => ({ kind: 'trans', phi: mode.phi, psi: mode.psi, lead: mode.lead, dir: null, story: mode.story });

/** Translation of a node in a unit state of unknown k. */
export function transOf(u: Unknown, node: number): { x: number; z: number } {
  return u.kind === 'trans' ? u.phi.get(node) ?? { x: 0, z: 0 } : { x: 0, z: 0 };
}

/** The unknown's symbol: TeX, plain text (matrix labels, figures) and prose (titles, where _ and ^ set sub- and superscripts). */
export function unknownSym(ks: KinSet, k: number): { tex: string; plain: string; prose: string } {
  const u = ks.unknowns[k];
  const nn = (n: number) => ks.pm.nodes.get(n)!.name;
  if (u.kind === 'rot') {
    if (u.hinge) {
      const e = ks.ends.get(u.ends[0])!;
      const m = ks.pm.members.get(e.member)!;
      const far = nn(e.e === 'i' ? m.j : m.i);
      return { tex: `\\theta_{${nn(u.node)}}^{${nn(u.node)}${far}}`, plain: `θ${nn(u.node)}(${nn(u.node)}${far})`, prose: `θ_${nn(u.node)}^{${nn(u.node)}${far}}` };
    }
    return { tex: `\\theta_{${nn(u.node)}}`, plain: `θ${nn(u.node)}`, prose: `θ_${nn(u.node)}` };
  }
  if (u.dir) return { tex: `\\Delta_{${u.dir},${nn(u.lead)}}`, plain: `Δ${u.dir}${nn(u.lead)}`, prose: `Δ_{${u.dir},${nn(u.lead)}}` };
  const j = k - ks.nTheta + 1;
  return { tex: `\\Delta_{${j}}`, plain: `Δ${j}`, prose: `Δ_${j}` };
}
