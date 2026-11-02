/**
 * The collapse load of a plane frame by the kinematic and static theorems on
 * its critical sections: the elementary mechanisms, the least λ over all their
 * combinations, and the moments at that λ. A hinge under a distributed load
 * starts at the middle of the load and moves to where the moment at collapse
 * peaks (where the shear vanishes), until it stays: the classical search of
 * dλ/dx = 0. A search that has not settled in MAX_MOVES, or settles with a moment
 * above Mp anywhere along a member, gives null.
 */
import type { SolverInput } from '../types';
import {
  limitModel, elementaryMechanisms, minimumOver, mechanismMoments, combinationOf,
  type LimitModel, type Elementary, type Mechanism, type Distribution,
} from './limit';
import { momentAt, checkPoints } from './sections';
import { cubicStationaryPoints } from '../cubic-stationary';

export interface LimitSolution {
  lm: LimitModel;
  elementary: Elementary[];
  best: Mechanism;
  moments: Distribution;
  /** The best mechanism in the elementary ones. */
  combination: number[];
  /** Where each distributed-load hinge ended (t along its member). */
  positions: Map<number, number>;
  /** Each trial of the search: positions and λ. */
  history: Array<{ positions: Map<number, number>; lambda: number }>;
}

const MAX_MOVES = 30;

export function solveLimit(input: SolverInput, mpOf: (member: number) => number): LimitSolution | null {
  let positions = new Map<number, number>();
  const history: LimitSolution['history'] = [];
  let out: LimitSolution | null = null;
  for (let it = 0; it < MAX_MOVES; it++) {
    const lm = limitModel(input, mpOf, { span: positions });
    const best = minimumOver(lm, lm.basis);
    if (!best) return null;
    const moments = mechanismMoments(lm, best);
    if (!moments) return null;
    const elementary = elementaryMechanisms(lm);
    out = { lm, elementary, best, moments, combination: combinationOf(elementary, best.d), positions, history };
    history.push({ positions, lambda: best.lambda });
    const next = new Map(positions);
    let moved = false;
    lm.sm.sections.forEach((s, k) => {
      if (s.kind !== 'span') return;
      next.set(s.member, s.t);
      const t = peakInside(lm, s.member, moments.M, best.lambda);
      if (t === null) return;
      const at = Math.abs(momentAt(lm.sm, s.member, t, moments.M, best.lambda)) / s.mp;
      if (at > 1 + 1e-9 && Math.abs(t - s.t) > 1e-7) { next.set(s.member, t); moved = true; }
      void k;
    });
    if (!moved) return moments.ratio <= 1 + 1e-6 ? out : null;
    positions = next;
  }
  return null;
}

/** Where |M| peaks strictly inside a member (its ends excluded), or null: at a station, a load boundary or a zero of the shear. */
export function peakInside(lm: LimitModel, member: number, M: number[], lambda: number): number | null {
  const f = (t: number) => Math.abs(momentAt(lm.sm, member, t, M, lambda));
  const edges = checkPoints(lm.sm, member, 1);
  const candidates = [...edges];
  for (let k = 0; k + 1 < edges.length; k++) candidates.push(...cubicStationaryPoints((t) => momentAt(lm.sm, member, t, M, lambda), edges[k], edges[k + 1]));
  let best = -1, bt: number | null = null;
  for (const t of candidates) {
    if (!(t > 1e-9 && t < 1 - 1e-9)) continue;
    const v = f(t);
    if (v > best) { best = v; bt = t; }
  }
  return bt;
}
