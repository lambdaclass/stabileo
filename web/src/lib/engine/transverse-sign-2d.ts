/**
 * The plane member's transverse axis: the one drawn, and the solver's.
 *
 * ── Two axes that disagreed ────────────────────────────────────────
 *
 * The solver's transverse axis is x turned 90° counter-clockwise. The local
 * axes the app draws — and the ones the space model uses — put z up for any
 * member that is not vertical, and along +X for a vertical one. For a member
 * drawn left to right, or a column drawn downward, the two coincide. For one
 * drawn right to left, or a column drawn upward, they point opposite ways,
 * and everything measured against "the local transverse axis" meant the
 * solver's: a local load of −10 on a beam drawn right to left pushed it up,
 * a gradient heated the other face, and the same sagging moment read with
 * opposite signs depending on which end was clicked first.
 *
 * ── The convention now ─────────────────────────────────────────────
 *
 * Everything the user reads or types is in the drawn axes. `transverseSign`
 * is +1 where the two axes agree and −1 where they do not. On the way in, a
 * local transverse load and a temperature gradient are multiplied by it
 * (solver-service); on the way out, the transverse quantities of a member's
 * forces — V, M, and the loads the diagram rebuilds M(x) from — are
 * multiplied by it before the results are published (results store), and
 * the canvas draws positive values toward the drawn z. The solver, and every
 * engine-side consumer of its results, keeps its own convention.
 */
import type { AnalysisResults, ElementForces, FullEnvelope, EnvelopeDiagramData } from './types';

/**
 * +1 when the drawn z of a member from (xi, vi) to (xj, vj) — v the vertical
 * coordinate of the plane — is the solver's transverse axis, −1 otherwise.
 * "Vertical" is the space convention's own test (|cos| to the vertical above
 * 0.999), so the sign always matches the axes drawn.
 */
export function transverseSign(dx: number, dv: number): 1 | -1 {
  const L = Math.hypot(dx, dv);
  if (L < 1e-12) return 1;
  if (Math.abs(dv) / L > 0.999) return dv > 0 ? -1 : 1;
  return dx > 0 ? 1 : -1;
}

export function flipElementForces2D(ef: ElementForces): ElementForces {
  return {
    ...ef,
    vStart: -ef.vStart, vEnd: -ef.vEnd,
    mStart: -ef.mStart, mEnd: -ef.mEnd,
    qI: -ef.qI, qJ: -ef.qJ,
    pointLoads: ef.pointLoads?.map((p) => ({ ...p, p: -p.p, ...(p.my !== undefined ? { my: -p.my } : {}) })),
    distributedLoads: ef.distributedLoads?.map((d) => ({ ...d, qI: -d.qI, qJ: -d.qJ })),
  };
}

export type SignOf = (elementId: number) => 1 | -1;

export function resultsToDrawnAxes(r: AnalysisResults, signOf: SignOf): AnalysisResults {
  if (!r?.elementForces?.some((ef) => signOf(ef.elementId) < 0)) return r;
  return { ...r, elementForces: r.elementForces.map((ef) => (signOf(ef.elementId) < 0 ? flipElementForces2D(ef) : ef)) };
}

function envelopeKind(d: EnvelopeDiagramData | undefined, signOf: SignOf): EnvelopeDiagramData | undefined {
  if (!d?.elements || d.kind === 'axial') return d;
  return {
    ...d,
    elements: d.elements.map((e) => (signOf(e.elementId) < 0
      ? { ...e, posValues: e.negValues.map((v) => -v), negValues: e.posValues.map((v) => -v) }
      : e)),
  };
}

export function envelopeToDrawnAxes(env: FullEnvelope, signOf: SignOf): FullEnvelope {
  if (!env) return env;
  return {
    ...env,
    moment: envelopeKind(env.moment, signOf)!,
    shear: envelopeKind(env.shear, signOf)!,
    axial: env.axial,
    maxAbsResults: env.maxAbsResults && resultsToDrawnAxes(env.maxAbsResults, signOf),
  };
}
