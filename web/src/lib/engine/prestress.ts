/**
 * A tendon in a member, solved as its equivalent loads.
 *
 * ── The tendon ──────────────────────────────────────────────────────
 *
 * A force P (the tension after losses) along a parabola through three eccentricities, at end I, at
 * mid-length and at end J, measured along the member's local −z: below the axis of a member whose
 * local z points up. Straight when the middle one is the mean of the ends.
 *
 * ── Its equivalent loads ────────────────────────────────────────────
 *
 * What the tendon does to the member, on the connected structure:
 *
 *   · at each anchor, the tendon force along the tendon, pressing on the member: P along x into
 *     the member and P·e′ across it, at the tendon's height, so a moment −P·e_I about local y at I
 *     and +P·e_J at J;
 *   · along the member, the push of the curved tendon: q_z = −P·e″, constant on a parabola
 *     (8·P·f/L² upward for a sag f below the chord).
 *
 * The set is in equilibrium on its own, so it moves no support of a free member and only the
 * restraint of an indeterminate one shows.
 *
 * The anchors act on the member's ends, which is where the engine's loads at the member's end
 * nodes act: a joined end (a hinge, a joint, a semi-rigid connection) is given a node of its own
 * for it (`variable-members.ts`), so the anchor moment does not go through the hinge into what
 * meets the member there. They are tagged with their member: a one-way member the active-set loop
 * takes out takes its tendon with it (`member-behaviour.ts`). That is the exact load of the tendon in a linear
 * analysis: the member's forces are those of the concrete section (a restrained member's
 * shortening goes into its restraint), the secondary moments included.
 *
 * The slopes are the small-angle ones of the method: P along x, P·e′ across.
 *
 * ── Split along the member ──────────────────────────────────────────
 *
 * A parabola restricted to a stretch is a parabola: a piece of a cut member takes the
 * eccentricities of the tendon at its own ends and middle, and the anchor loads of neighbouring
 * pieces cancel at the node they share. Splitting is exact.
 *
 * Pure: no store.
 */
import type { SolverLoad3D } from './types-3d';
import type { MemberRef, Vec3 } from './member-loads';
import { assembledMagnitudes3D, LoadScalar, LoadVector, zero } from './accounting-math';

export interface PrestressLike { force: number; eI: number; eM: number; eJ: number }

/** The tendon's eccentricity at ξ = x/L. */
export function tendonEccentricity(d: PrestressLike, xi: number): number {
  return d.eI * (1 - xi) * (1 - 2 * xi) + 4 * d.eM * xi * (1 - xi) + d.eJ * xi * (2 * xi - 1);
}

function evaluateTerms([i, m, j]: [LoadScalar, LoadScalar, LoadScalar], factor: number, divisor: number) {
  return {
    amount: i.add(m).add(j).scale(factor).divide(divisor),
    magnitude: Math.abs(factor) * (Math.abs(i.value) + Math.abs(m.value) + Math.abs(j.value)) / divisor,
  };
}

function slopeAt(d: PrestressLike, xi: number, L: number) {
  return evaluateTerms([
    new LoadScalar(d.eI).scale(4 * xi - 3),
    new LoadScalar(4).scale(d.eM).scale(1 - 2 * xi),
    new LoadScalar(d.eJ).scale(4 * xi - 1),
  ], 1, L);
}

export function tendonLineIntensity(d: PrestressLike, L: number) {
  return evaluateTerms([
    new LoadScalar(4).scale(d.eI),
    new LoadScalar(-8).scale(d.eM),
    new LoadScalar(4).scale(d.eJ),
  ], -d.force, L * L);
}

/** de/dx at ξ, for a member of length L. */
export function tendonSlope(d: PrestressLike, xi: number, L: number): number {
  return slopeAt(d, xi, L).amount.value;
}

/** The constant transverse load of the curved tendon, along local z, kN/m. */
export function tendonLoad(d: PrestressLike, L: number): number {
  return tendonLineIntensity(d, L).amount.value;
}

/** The tendon of the stretch [x0, x1] of a member of length L, as a tendon of that stretch. */
export function tendonStretch<T extends PrestressLike>(d: T, x0: number, x1: number, L: number): T {
  return { ...d, eI: tendonEccentricity(d, x0 / L), eM: tendonEccentricity(d, (x0 + x1) / (2 * L)), eJ: tendonEccentricity(d, x1 / L) };
}

/** The engine loads of a tendon in a member that bends. */
export function prestressToSolver(m: MemberRef, d: PrestressLike): SolverLoad3D[] {
  const { ex, ey, ez, L } = m.axes;
  if (!(L > 0) || d.force === 0) return [];
  const P = d.force;
  // Anchor forces on the member: along the tendon, into the member. z_t = −e.
  const chord = LoadVector.from(ex), transverse = LoadVector.from(ez), bending = LoadVector.from(ey);
  const at = (nodeId: number, xi: number, axial: number, eccentricity: number, arm?: Vec3): SolverLoad3D => {
    const slope = slopeAt(d, xi, L);
    const across = transverse.scale(slope.amount.scale(-axial), Math.abs(axial) * slope.magnitude);
    const force = chord.scale(axial).add(across);
    const couple = bending.scale(new LoadScalar(-axial).scale(eccentricity)).add(arm ? force.momentAt(arm) : LoadVector.from(zero()));
    const [fx, fy, fz] = force.value, [mx, my, mz] = couple.value;
    const load: SolverLoad3D = { type: 'nodal', data: { nodeId, fx, fy, fz, mx, my, mz, tendonOf: m.elementId } };
    assembledMagnitudes3D.set(load, { force, couple });
    return load;
  };
  const out = [at(m.nodeI, 0, P, d.eI, m.armI), at(m.nodeJ, 1, -P, d.eJ, m.armJ)];
  const { amount: { value: q, underflow }, magnitude: qScale } = tendonLineIntensity(d, L);
  if (Math.abs(q) > 1e-12) {
    const load: SolverLoad3D = { type: 'distributed', data: { elementId: m.elementId, qYI: 0, qYJ: 0, qZI: q, qZJ: q } };
    const intensity = LoadVector.from([0, 0, q], [0, 0, qScale], [0, 0, underflow]);
    assembledMagnitudes3D.set(load, { qI: intensity, qJ: intensity, source: 'prestress' });
    out.push(load);
  }
  return out;
}
