/**
 * Limit analysis of a plane frame on its critical sections: the mechanisms
 * (kinematic theorem) and the moment distributions (static theorem) the plastic
 * unit works with, for the explained methods and the mechanism a user draws.
 *
 * - The mechanisms of the structure with every critical section released span
 *   a space of dimension m = N − GH (independent mechanisms); every mechanism
 *   of the structure is in it, with the hinges it needs released and the other
 *   sections held (zero rotation jump).
 * - Their virtual-work equations Σ M_i θ_i = λ W are the equilibrium equations
 *   of the section moments: a distribution satisfying them for a basis of
 *   that space is in equilibrium with λ times the loads.
 * - A mechanism's λ is Σ Mp_i |θ_i| / W; the smallest over the space is a
 *   linear program, and so is the distribution that keeps max |M|/Mp lowest
 *   once some moments are set to ±Mp (a partial mechanism leaves redundants).
 */
import type { SolverInput } from '../types';
import { buildKinematics, dot, type KinModel } from './kinematics';
import { buildSections, momentAt, momentForm, checkPoints, type SectionModel, type SectionOptions } from './sections';
import { rref } from '../steps/sway-modes';
import { solveLp } from './lp';

export interface LimitModel {
  sm: SectionModel;
  km: KinModel;
  /** A basis of the mechanisms with every section released. */
  basis: number[][];
  /** N: critical sections; m: independent mechanisms; ghF = N − m, the redundants that bending involves. */
  N: number;
  m: number;
  ghF: number;
  /** Redundants that stay with every section released: they involve no bending (the axial force of a beam between two walls). */
  sAxial: number;
}

export interface Mechanism {
  d: number[];
  theta: number[];
  /** Work of the reference loads, Σ P·δ. */
  W: number;
  /** Σ Mp_i |θ_i|. */
  Wi: number;
  lambda: number;
}

const TOL = 1e-8;

function nullspaceOf(A: number[][], n: number, order?: number[]): number[][] {
  const perm = order ?? [...Array(n).keys()];
  const P = A.map((r) => perm.map((c) => r[c]));
  const { R, pivots } = rref(P, n);
  const free = [...Array(n).keys()].filter((c) => !pivots.includes(c));
  return free.map((f) => {
    const v = new Array(n).fill(0);
    v[f] = 1;
    pivots.forEach((p, r) => { v[p] = -R[r][f]; });
    const out = new Array(n).fill(0);
    perm.forEach((c, k) => { out[c] = v[k]; });
    return out;
  });
}

const rankOf = (A: number[][], n: number) => (A.length ? rref(A, n).pivots.length : 0);

export function limitModel(input: SolverInput, mpOf: (member: number) => number, opts: SectionOptions = {}): LimitModel {
  const sm = buildSections(input, mpOf, opts);
  const km = buildKinematics(input, sm.sections.map((s) => ({ member: s.member, t: s.t })));
  const basis = nullspaceOf(km.rows, km.n);
  const sAxial = km.rows.length - rankOf(km.rows, km.n);
  const N = sm.sections.length;
  return { sm, km, basis, N, m: basis.length, ghF: N - basis.length, sAxial };
}

/** The mechanisms with the sections in `free` released and every other section held. */
export function mechanismSpace(lm: LimitModel, free: ReadonlySet<number>, extra: number[][] = [], order?: number[]): number[][] {
  const held = lm.km.rotation.filter((_, s) => !free.has(s));
  return nullspaceOf([...lm.km.rows, ...held, ...extra], lm.km.n, order);
}

/** Remaining static indeterminacy with the sections in `free` released (rows minus rank). */
export function remainingRedundants(lm: LimitModel, free: ReadonlySet<number>): number {
  const A = [...lm.km.rows, ...lm.km.rotation.filter((_, s) => !free.has(s))];
  return A.length - rankOf(A, lm.km.n);
}

/**
 * A motion as a mechanism: turned so the loads do positive work, and scaled
 * so its smallest hinge rotation is 1 (the others read as multiples of θ).
 */
export function asMechanism(lm: LimitModel, d0: number[]): Mechanism {
  let theta = lm.km.rotation.map((r) => dot(r, d0));
  const big = Math.max(0, ...theta.map(Math.abs));
  const nz = theta.map(Math.abs).filter((v) => v > TOL * Math.max(big, 1e-300));
  const unit = nz.length ? Math.min(...nz) : Math.max(...d0.map(Math.abs), 1e-300);
  let d = d0.map((v) => v / unit);
  let W = dot(lm.km.work, d);
  if (W < 0) { d = d.map((v) => -v); W = -W; }
  theta = lm.km.rotation.map((r) => dot(r, d)).map((v) => (Math.abs(v) < TOL * Math.max(big / unit, 1) ? 0 : v));
  const Wi = theta.reduce((s, v, k) => s + lm.sm.sections[k].mp * Math.abs(v), 0);
  const scale = Math.max(1, ...lm.km.work.map(Math.abs)) * Math.max(1, ...d.map(Math.abs));
  return { d, theta, W, Wi, lambda: W > 1e-9 * scale ? Wi / W : Infinity };
}

/** The mechanism of least λ among the combinations of `space` (null when the loads do no work on any). */
export function minimumOver(lm: LimitModel, space: number[][]): Mechanism | null {
  const k = space.length, N = lm.N;
  if (k === 0) return null;
  if (k === 1) { const m = asMechanism(lm, space[0]); return Number.isFinite(m.lambda) ? m : null; }
  const th = space.map((d) => lm.km.rotation.map((r) => dot(r, d)));
  const w = space.map((d) => dot(lm.km.work, d));
  const c = [...new Array(k).fill(0), ...lm.sm.sections.map((s) => s.mp)];
  const rows = [];
  for (let s = 0; s < N; s++) {
    const plus = new Array(k + N).fill(0), minus = new Array(k + N).fill(0);
    for (let j = 0; j < k; j++) { plus[j] = -th[j][s]; minus[j] = th[j][s]; }
    plus[k + s] = 1; minus[k + s] = 1;
    rows.push({ a: plus, op: '>=' as const, b: 0 }, { a: minus, op: '>=' as const, b: 0 });
  }
  rows.push({ a: [...w, ...new Array(N).fill(0)], op: '=' as const, b: 1 });
  const res = solveLp({ c, rows, free: [...new Array(k).fill(true), ...new Array(N).fill(false)] });
  if (res.status !== 'optimal') return null;
  const d = new Array(lm.km.n).fill(0);
  space.forEach((v, j) => v.forEach((x, i) => { d[i] += res.x[j] * x; }));
  return asMechanism(lm, d);
}

export type ElementaryKind = 'beam' | 'joint' | 'sway' | 'basic';
export interface Elementary { kind: ElementaryKind; member?: number; node?: number; mech: Mechanism }

/**
 * The elementary mechanisms as a course lists them: one beam mechanism per
 * interior section (its member's ends and that section), one joint mechanism
 * per joint with several sections of its own, and the sway (panel) mechanisms
 * with the beams straight and those joints still. When they do not span the
 * space (a shape the rules do not cover), a plain basis instead.
 */
export function elementaryMechanisms(lm: LimitModel): Elementary[] {
  const { sm, km } = lm;
  const out: Elementary[] = [];
  const endSections = (member: number) => {
    const set = new Set<number>();
    for (const end of ['I', 'J'] as const) {
      const l = sm.ends.get(`${member}:${end}`);
      if (l) set.add(l.section);
    }
    return set;
  };
  sm.sections.forEach((s, k) => {
    if (s.t <= 1e-9 || s.t >= 1 - 1e-9) return;
    const free = new Set([k, ...endSections(s.member)]);
    const space = mechanismSpace(lm, free);
    const pick = space.length === 1 ? space[0] : projectWork(lm, space);
    if (!pick) return;
    const mech = asMechanism(lm, pick);
    if (Math.abs(mech.theta[k]) > 0) out.push({ kind: 'beam', member: s.member, mech });
  });
  const jointNodes: number[] = [];
  for (const [node, j] of km.joint) {
    const own = sm.sections.filter((s) => s.node === node && s.kind === 'joint').length;
    if (own < 2 && !(own === 1 && sm.input.loads.some((l) => l.type === 'nodal' && l.data.nodeId === node && Math.abs(l.data.my) > 1e-12))) continue;
    const d = new Array(km.n).fill(0);
    d[j] = 1;
    if (km.rows.some((r) => Math.abs(dot(r, d)) > 1e-12)) continue;
    jointNodes.push(node);
    out.push({ kind: 'joint', node, mech: asMechanism(lm, d) });
  }
  const interiorFree = new Set(sm.sections.map((s, k) => (s.t <= 1e-9 || s.t >= 1 - 1e-9 ? k : -1)).filter((k) => k >= 0));
  const still = jointNodes.map((node) => { const r = new Array(km.n).fill(0); r[km.joint.get(node)!] = 1; return r; });
  const nodeZ = [...km.nodePoint].sort((a, b) => sm.input.nodes.get(a[0])!.z - sm.input.nodes.get(b[0])!.z);
  const order = [
    ...[...Array(km.n).keys()].filter((c) => c >= 2 * km.points.length),
    ...[...Array(km.points.length).keys()].map((p) => 2 * p + 1),
    ...[...Array(km.points.length).keys()].filter((p) => !nodeZ.some(([, q]) => q === p)).map((p) => 2 * p),
    ...nodeZ.map(([, p]) => 2 * p),
  ];
  for (const d of mechanismSpace(lm, interiorFree, still, order)) out.push({ kind: 'sway', mech: asMechanism(lm, d) });
  const A = out.map((e) => e.mech.d);
  if (out.length === lm.m && rankOf(A, km.n) === lm.m) return out;
  return lm.basis.map((d) => ({ kind: 'basic' as const, mech: asMechanism(lm, d) }));
}

/** The motion of `space` along which the loads do the most work (their projection on it). */
export function projectWork(lm: LimitModel, space: number[][]): number[] | null {
  if (!space.length) return null;
  const k = space.length;
  const G = space.map((a) => space.map((b) => dot(a, b)));
  const g = space.map((a) => dot(a, lm.km.work));
  const M = G.map((r, i) => [...r, g[i]]);
  const { R, pivots } = rref(M, k);
  const c = new Array(k).fill(0);
  pivots.forEach((p, r) => { c[p] = R[r][k]; });
  if (c.every((v) => Math.abs(v) < 1e-14)) return space[0];
  const d = new Array(lm.km.n).fill(0);
  space.forEach((v, j) => v.forEach((x, i) => { d[i] += c[j] * x; }));
  return d;
}

/** Coefficients of `d` in the elementary mechanisms (least squares; exact when they span). */
export function combinationOf(els: Elementary[], d: number[]): number[] {
  const k = els.length;
  const G = els.map((a) => els.map((b) => dot(a.mech.d, b.mech.d)));
  const g = els.map((a) => dot(a.mech.d, d));
  const { R, pivots } = rref(G.map((r, i) => [...r, g[i]]), k);
  const c = new Array(k).fill(0);
  pivots.forEach((p, r) => { c[p] = R[r][k]; });
  return c.map((v) => (Math.abs(v) < 1e-9 ? 0 : v));
}

export interface Distribution {
  /** Moment at every section (sagging positive). */
  M: number[];
  lambda: number;
  /** max |M|/Mp over the structure, where it is and the moment there. */
  ratio: number;
  worst: { member: number; t: number; M: number; mp: number } | null;
  /** Redundants left free once the fixed moments are set (chosen to keep the ratio lowest). */
  free: number;
}

/**
 * Section moments in equilibrium with λ times the loads, with the moments in
 * `fixed` set; whatever equilibrium leaves free is chosen to make the largest
 * |M|/Mp as small as possible. Null when the fixed moments contradict
 * equilibrium.
 */
export function distribution(lm: LimitModel, fixed: Map<number, number>, lambda: number): Distribution | null {
  const N = lm.N;
  const E = lm.basis.map((d) => lm.km.rotation.map((r) => dot(r, d)));
  const rhs = lm.basis.map((d, k) => lambda * dot(lm.km.work, d) - [...fixed].reduce((s, [i, v]) => s + E[k][i] * v, 0));
  const freeIdx = [...Array(N).keys()].filter((i) => !fixed.has(i));
  const nf = freeIdx.length;
  const aug = E.map((row, k) => [...freeIdx.map((i) => row[i]), rhs[k]]);
  const { R, pivots } = rref(aug, nf);
  const scale = Math.max(1, ...rhs.map(Math.abs));
  for (let r = pivots.length; r < R.length; r++) if (Math.abs(R[r][nf]) > 1e-6 * scale) return null;
  const part = new Array(nf).fill(0);
  pivots.forEach((p, r) => { part[p] = R[r][nf]; });
  const nonPivot = [...Array(nf).keys()].filter((c) => !pivots.includes(c));
  const Z = nonPivot.map((f) => { const v = new Array(nf).fill(0); v[f] = 1; pivots.forEach((p, r) => { v[p] = -R[r][f]; }); return v; });
  const compose = (y: number[]) => {
    const M = new Array(N).fill(0);
    for (const [i, v] of fixed) M[i] = v;
    freeIdx.forEach((i, k) => { M[i] = part[k] + Z.reduce((s, z, j) => s + z[k] * y[j], 0); });
    return M;
  };
  let M = compose([]);
  if (Z.length) {
    const forms: Array<{ c0: number; cy: number[]; mp: number }> = [];
    for (const [member] of lm.sm.members) {
      for (const t of checkPoints(lm.sm, member)) {
        const f = momentForm(lm.sm, member, t);
        let c0 = lambda * f.load;
        const cy = new Array(Z.length).fill(0);
        for (const [s, c] of f.coef) {
          const at = freeIdx.indexOf(s);
          if (at < 0) c0 += c * (fixed.get(s) ?? 0);
          else { c0 += c * part[at]; Z.forEach((z, j) => { cy[j] += c * z[at]; }); }
        }
        forms.push({ c0, cy, mp: lm.sm.mpOf(member) });
      }
    }
    const nz = Z.length;
    const rows = forms.flatMap((f) => [
      { a: [...f.cy, -f.mp], op: '<=' as const, b: -f.c0 },
      { a: [...f.cy.map((v) => -v), -f.mp], op: '<=' as const, b: f.c0 },
    ]);
    const res = solveLp({ c: [...new Array(nz).fill(0), 1], rows, free: [...new Array(nz).fill(true), false] });
    if (res.status === 'optimal') M = compose(res.x.slice(0, nz));
  }
  const peak = peakRatio(lm.sm, M, lambda);
  return { M, lambda, ratio: peak.ratio, worst: peak.worst, free: Z.length };
}

/** The largest |M|/Mp along every frame member, found on a fine grid and refined around its peak. */
export function peakRatio(sm: SectionModel, M: number[], lambda: number): { ratio: number; worst: Distribution['worst'] } {
  let ratio = 0;
  let worst: Distribution['worst'] = null;
  for (const [member] of sm.members) {
    const mp = sm.mpOf(member);
    const ts = new Set(checkPoints(sm, member, 64));
    for (const t of [...ts]) {
      const v = momentAt(sm, member, t, M, lambda);
      if (Math.abs(v) / mp > ratio + 1e-12) { ratio = Math.abs(v) / mp; worst = { member, t, M: v, mp }; }
    }
  }
  if (worst) {
    const { member, mp } = worst;
    let lo = Math.max(0, worst.t - 1 / 64), hi = Math.min(1, worst.t + 1 / 64);
    const f = (t: number) => Math.abs(momentAt(sm, member, t, M, lambda));
    for (let i = 0; i < 60; i++) {
      const a = lo + (hi - lo) * 0.382, b = lo + (hi - lo) * 0.618;
      if (f(a) > f(b)) hi = b; else lo = a;
    }
    const t = (lo + hi) / 2;
    if (f(t) / mp > ratio) { ratio = f(t) / mp; worst = { member, t, M: momentAt(sm, member, t, M, lambda), mp }; }
  }
  return { ratio, worst };
}

/** The moments of a mechanism at its own λ: ±Mp at its hinges, the rest from equilibrium. */
export function mechanismMoments(lm: LimitModel, mech: Mechanism): Distribution | null {
  const fixed = new Map<number, number>();
  mech.theta.forEach((th, s) => { if (th !== 0) fixed.set(s, Math.sign(th) * lm.sm.sections[s].mp); });
  return distribution(lm, fixed, mech.lambda);
}
