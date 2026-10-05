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
 * restraint of an indeterminate one shows. That is the exact load of the tendon in a linear
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

export interface PrestressLike { force: number; eI: number; eM: number; eJ: number }

/** The tendon's eccentricity at ξ = x/L. */
export function tendonEccentricity(d: PrestressLike, xi: number): number {
  return d.eI * (1 - xi) * (1 - 2 * xi) + 4 * d.eM * xi * (1 - xi) + d.eJ * xi * (2 * xi - 1);
}

/** de/dx at ξ, for a member of length L. */
export function tendonSlope(d: PrestressLike, xi: number, L: number): number {
  return (d.eI * (4 * xi - 3) + 4 * d.eM * (1 - 2 * xi) + d.eJ * (4 * xi - 1)) / L;
}

/** The constant transverse load of the curved tendon, along local z, kN/m. */
export function tendonLoad(d: PrestressLike, L: number): number {
  return (-d.force * (4 * d.eI - 8 * d.eM + 4 * d.eJ)) / (L * L);
}

/** The tendon of the stretch [x0, x1] of a member of length L, as a tendon of that stretch. */
export function tendonStretch<T extends PrestressLike>(d: T, x0: number, x1: number, L: number): T {
  return { ...d, eI: tendonEccentricity(d, x0 / L), eM: tendonEccentricity(d, (x0 + x1) / (2 * L)), eJ: tendonEccentricity(d, x1 / L) };
}

const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The engine loads of a tendon in a member that bends. */
export function prestressToSolver(m: MemberRef, d: PrestressLike): SolverLoad3D[] {
  const { ex, ey, ez, L } = m.axes;
  if (!(L > 0) || d.force === 0) return [];
  const P = d.force;
  // Anchor forces on the member: along the tendon, into the member. z_t = −e.
  const fI = add(scale(ex, P), ez, -P * tendonSlope(d, 0, L));
  const fJ = add(scale(ex, -P), ez, P * tendonSlope(d, 1, L));
  const mI = scale(ey, -P * d.eI), mJ = scale(ey, P * d.eJ);
  const at = (nodeId: number, f: Vec3, mm: Vec3, arm?: Vec3): SolverLoad3D => {
    const c = arm ? cross(arm, f) : [0, 0, 0];
    return { type: 'nodal', data: { nodeId, fx: f[0], fy: f[1], fz: f[2], mx: mm[0] + c[0]!, my: mm[1] + c[1]!, mz: mm[2] + c[2]! } };
  };
  const out: SolverLoad3D[] = [at(m.nodeI, fI, mI, m.armI), at(m.nodeJ, fJ, mJ, m.armJ)];
  const q = tendonLoad(d, L);
  if (Math.abs(q) > 1e-12) out.push({ type: 'distributed', data: { elementId: m.elementId, qYI: 0, qYJ: 0, qZI: q, qZJ: q } });
  return out;
}
