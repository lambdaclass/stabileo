/**
 * Collapse mechanisms as the plastic panel shows them: the one the step-by-step
 * analysis ends in, and one the user draws by placing hinges.
 *
 * A user's mechanism is checked the way a course does: how many degrees of
 * freedom the hinges leave (none: not a mechanism; more than one: pick or
 * combine), how many hinges against GH + 1 (complete, partial, over-complete),
 * λ by virtual work, and the moments at that λ against Mp: admissible
 * everywhere, λ is the collapse load (uniqueness); if not, λ is an upper bound
 * and λ·Mp/|M|max a lower one.
 */
import type { SolverInput } from '../types';
import type { PlasticCollapseResult } from '../plastic-collapse';
import { buildKinematics, dot, type KinModel } from './kinematics';
import {
  limitModel, mechanismSpace, asMechanism, minimumOver, mechanismMoments, remainingRedundants, projectWork,
  type LimitModel, type Mechanism, type Distribution,
} from './limit';
import { checkPoints, momentAt, endKey } from './sections';
import { rref } from '../steps/sway-modes';
import { countStaticDegree2D } from '../kinematic-2d';

export interface DrawnHinge { member: number; t: number; p: number; theta: number }
export interface MechanismView { km: KinModel; d: number[]; hinges: DrawnHinge[]; dof: number }

const pointOf = (km: KinModel, member: number, t: number) => km.stations.get(member)?.find((s) => Math.abs(s.t - t) < 1e-7)?.p ?? -1;

/** The mechanism the step-by-step analysis ended in: its hinges released, its yielded bars removed. */
export function collapseMechanism(input: SolverInput, r: PlasticCollapseResult): MechanismView | null {
  if (!r.isMechanism) return null;
  const bending = r.hinges.filter((h) => h.kind === 'bending');
  const removed = new Set(r.hinges.filter((h) => h.kind === 'axial').map((h) => h.elementId));
  const secs = bending.map((h) => ({ member: h.elementId, t: h.position ?? (h.end === 'start' ? 0 : 1) }));
  const km = buildKinematics(input, secs, removed);
  const { R, pivots } = rref(km.rows, km.n);
  const free = [...Array(km.n).keys()].filter((c) => !pivots.includes(c));
  const space = free.map((f) => { const v = new Array(km.n).fill(0); v[f] = 1; pivots.forEach((p, k) => { v[p] = -R[k][f]; }); return v; });
  if (!space.length) return null;
  const pseudo = { km } as LimitModel;
  let d = space.length === 1 ? space[0] : projectWork(pseudo, space)!;
  const theta0 = km.rotation.map((row) => dot(row, d));
  const big = Math.max(0, ...theta0.map(Math.abs));
  const nz = theta0.map(Math.abs).filter((v) => v > 1e-8 * big);
  const unit = nz.length ? Math.min(...nz) : Math.max(1e-300, ...d.map(Math.abs));
  d = d.map((v) => v / unit);
  if (dot(km.work, d) < 0) d = d.map((v) => -v);
  const hinges = secs.map((s, k) => {
    const th = dot(km.rotation[k], d);
    return { ...s, p: pointOf(km, s.member, s.t), theta: Math.abs(th) < 1e-8 * Math.max(1, big / unit) ? 0 : th };
  });
  return { km, d, hinges, dof: space.length };
}

export interface UserHinge { member: number; t: number }
export type IgnoredWhy = 'truss' | 'zero' | 'duplicate';

export type UserVerdict =
  | { kind: 'empty' }
  /** Still stable: `remaining` redundants that bending involves are left. */
  | { kind: 'notMechanism'; remaining: number }
  | { kind: 'multi'; dof: number }
  | { kind: 'noWork' }
  | {
    kind: 'mechanism';
    mech: Mechanism;
    dist: Distribution | null;
    admissible: boolean;
    /** λ·Mp/|M|max: a lower bound when the moments go past Mp. */
    lower: number;
    type: 'complete' | 'partial' | 'overcomplete';
    /** Placed hinges (indices into the given list) that do not turn in this mechanism. */
    still: number[];
    combined: boolean;
  };

export interface UserMechanism {
  verdict: UserVerdict;
  ignored: Array<{ hinge: number; why: IgnoredWhy }>;
  /** Hinges that count, after the ignored ones. */
  n: number;
  gh: number;
  ghF: number;
  lm: LimitModel;
  /** Section of each placed hinge (−1 when ignored). */
  sectionOf: number[];
  view: MechanismView | null;
}

const ADMISSIBLE = 1 + 1e-6;

export function evaluateUserMechanism(input: SolverInput, mpOf: (member: number) => number, hinges: UserHinge[], opts: { combine?: boolean } = {}): UserMechanism {
  const ignored: UserMechanism['ignored'] = [];
  const kept: Array<{ i: number; h: UserHinge }> = [];
  hinges.forEach((h, i) => {
    const e = input.elements.get(h.member);
    if (!e || e.type === 'truss') { ignored.push({ hinge: i, why: 'truss' }); return; }
    kept.push({ i, h });
  });
  const lm = limitModel(input, mpOf, { span: null, extra: kept.map((k) => k.h) });
  const gh = countStaticDegree2D(input).degree;
  const sectionOf = hinges.map(() => -1);
  const used = new Set<number>();
  for (const { i, h } of kept) {
    let s = -1;
    if (h.t <= 1e-9 || h.t >= 1 - 1e-9) {
      const link = lm.sm.ends.get(endKey(h.member, h.t < 0.5 ? 'I' : 'J'));
      if (!link) { ignored.push({ hinge: i, why: 'zero' }); continue; }
      s = link.section;
    } else {
      s = lm.sm.sections.findIndex((x) => x.member === h.member && Math.abs(x.t - h.t) < 1e-7);
    }
    if (s < 0) { ignored.push({ hinge: i, why: 'zero' }); continue; }
    if (used.has(s)) { ignored.push({ hinge: i, why: 'duplicate' }); continue; }
    used.add(s);
    sectionOf[i] = s;
  }
  ignored.sort((a, b) => a.hinge - b.hinge);
  const n = used.size;
  const base = { ignored, n, gh, ghF: lm.ghF, lm, sectionOf };
  if (n === 0) return { ...base, verdict: { kind: 'empty' }, view: null };
  const space = mechanismSpace(lm, used);
  if (space.length === 0) {
    const remaining = Math.max(0, remainingRedundants(lm, used) - lm.sAxial);
    return { ...base, verdict: { kind: 'notMechanism', remaining }, view: null };
  }
  if (space.length > 1 && !opts.combine) return { ...base, verdict: { kind: 'multi', dof: space.length }, view: null };
  const mech = space.length === 1 ? asMechanism(lm, space[0]) : minimumOver(lm, space);
  if (!mech || !Number.isFinite(mech.lambda)) return { ...base, verdict: { kind: 'noWork' }, view: viewOf(lm, space[0], used) };
  const dist = mechanismMoments(lm, mech);
  const ratio = dist?.ratio ?? Infinity;
  const active = mech.theta.filter((v) => v !== 0).length;
  const type = n > lm.ghF + 1 ? 'overcomplete' : active < lm.ghF + 1 ? 'partial' : 'complete';
  const still = hinges.map((_, i) => i).filter((i) => sectionOf[i] >= 0 && mech.theta[sectionOf[i]] === 0);
  return {
    ...base,
    verdict: { kind: 'mechanism', mech, dist, admissible: ratio <= ADMISSIBLE, lower: mech.lambda / Math.max(ratio, 1), type, still, combined: space.length > 1 },
    view: viewOf(lm, mech.d, used, mech.theta),
  };
}

function viewOf(lm: LimitModel, d: number[], used: Set<number>, theta?: number[]): MechanismView {
  const hinges = [...used].map((s) => {
    const sec = lm.sm.sections[s];
    return { member: sec.member, t: sec.t, p: pointOf(lm.km, sec.member, sec.t), theta: theta?.[s] ?? dot(lm.km.rotation[s], d) };
  });
  return { km: lm.km, d, hinges, dof: 1 };
}

/** The moment diagram of a distribution, sampled along every frame member (sagging positive), for drawing. */
export function sampledMoments(lm: LimitModel, M: number[], lambda: number, inside = 16): Map<number, Array<[number, number]>> {
  const out = new Map<number, Array<[number, number]>>();
  for (const [member] of lm.sm.members) out.set(member, checkPoints(lm.sm, member, inside).map((t) => [t, momentAt(lm.sm, member, t, M, lambda)]));
  return out;
}
