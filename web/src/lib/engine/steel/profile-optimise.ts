/**
 * The lightest catalogue profile that passes, for a steel member or for every member sharing a
 * section.
 *
 * ── What it does ──────────────────────────────────────────────────
 *
 * For each candidate in the family, lightest first, every member of the group is checked with
 * the SAME computation the verification runs (`checkSteelMember`), against the demands of the
 * current analysis and with each member's own lengths. The first candidate that passes every
 * member is the answer.
 *
 * ── What it deliberately does not do ──────────────────────────────
 *
 * It does not re-analyse. The demands are those of the solve on hand, and in a statically
 * indeterminate structure changing a section changes them — a lighter beam attracts less moment,
 * a lighter column lets the frame sway more. So a pick is a proposal made against one analysis:
 * applying it leaves the model "designed but not re-verified", and it is the user's re-analysis
 * that says whether the picks still hold (`store/steel-optimise.svelte.ts`). Iterating to a fixed
 * point here, out of sight, would present a converged answer the user never saw converge — and
 * a loop that does not converge would present nothing at all.
 */

import { PROFILE_FAMILIES, profileToSectionFull, type ProfileFamily, type SteelProfile } from '../../data/steel-profiles';
import { checkSteelMember, steelGoverningRatio, type SteelMemberDemand } from '../verification-service';

export interface OptimiseMember {
  elementId: number;
  demand: SteelMemberDemand;
  lengths: { L: number; Lb: number; Kx?: number; Ky?: number };
}

/**
 * What a candidate must satisfy beyond the strength check.
 *
 * `deflection` carries, per member with a deflection rule, the deflection of the analysis on hand
 * in each local plane and the limit, with the current section's inertias. A candidate's deflection
 * is read as the current one times the inverse ratio of inertias in each plane: exact for a
 * member whose loads do not depend on its stiffness (a simply supported or cantilever member), an
 * estimate for one in a frame, which the re-verification after the next solve then checks.
 */
export interface OptimiseCriteria {
  /** Families searched. Absent means the current profile's own. */
  families?: readonly ProfileFamily[];
  hMinMm?: number;
  hMaxMm?: number;
  bMaxMm?: number;
  /** Largest acceptable utilisation. One unless stated. */
  target?: number;
  deflection?: ReadonlyArray<{
    elementId: number;
    /** Deflection along local y (bending about z) and along local z (bending about y), m. */
    v: number; w: number;
    direction: 'resultant' | 'localY' | 'localZ';
    limit: number;
    /** The current section's second moments, m⁴. */
    iy: number; iz: number;
  }>;
}

/** Families the member checker can read: its expressions are those of doubly symmetric I and H. */
export const I_FAMILIES: readonly ProfileFamily[] = ['IPE', 'IPN', 'HEA', 'HEB', 'HEM', 'W', 'HP', 'M'];

/** The candidates, lightest first, across the families asked for and within the size limits. */
export function candidates(criteria: OptimiseCriteria, current: ProfileFamily): SteelProfile[] {
  const fams = criteria.families?.length ? criteria.families : [current];
  return fams.flatMap((f) => familyByWeight(f))
    .filter((p) => (criteria.hMinMm == null || p.h >= criteria.hMinMm) && (criteria.hMaxMm == null || p.h <= criteria.hMaxMm) && (criteria.bMaxMm == null || p.b <= criteria.bMaxMm))
    .sort((a, b) => a.weight - b.weight || a.h - b.h);
}

/** The largest deflection over limit of a candidate, from the current deflections scaled by inertia. */
export function deflectionRatio(profile: SteelProfile, deflection: NonNullable<OptimiseCriteria['deflection']>): number {
  const iy = profile.iy * 1e-8, iz = profile.iz * 1e-8;
  let worst = 0;
  for (const d of deflection) {
    const v = d.v * (d.iz / iz), w = d.w * (d.iy / iy);
    const read = d.direction === 'localY' ? Math.abs(v) : d.direction === 'localZ' ? Math.abs(w) : Math.hypot(v, w);
    if (d.limit > 0) worst = Math.max(worst, read / d.limit);
  }
  return worst;
}

/** A candidate's verdict on a group: the worst member and its ratio. */
export interface CandidateVerdict {
  profile: SteelProfile;
  /** Largest utilisation over the group's members. */
  ratio: number;
  /** The member that governs. */
  elementId: number;
  passes: boolean;
  /** Estimated deflection over limit, when a deflection criterion was given. */
  deflectionRatio?: number;
}

/** A family's profiles, lightest first (ties by depth, so the shallower one wins). */
export function familyByWeight(family: ProfileFamily): SteelProfile[] {
  return [...(PROFILE_FAMILIES[family] ?? [])].sort((a, b) => a.weight - b.weight || a.h - b.h);
}

/** How one profile does on a group. Null when the checker cannot run on it (missing inputs). */
export function verdictFor(
  profile: SteelProfile,
  members: readonly OptimiseMember[],
  material: { fy?: number; e?: number; fu?: number },
  criteria: OptimiseCriteria = {},
): CandidateVerdict | null {
  const target = criteria.target ?? 1;
  const section = profileToSectionFull(profile);
  let worst: { ratio: number; elementId: number } | null = null;
  let passes = true;
  for (const m of members) {
    const v = checkSteelMember(m.elementId, m.demand, section, material, m.lengths);
    if (!v) return null;
    const r = steelGoverningRatio(v);
    if (v.overallStatus === 'fail' || !(r <= target)) passes = false;
    if (!worst || r > worst.ratio) worst = { ratio: r, elementId: m.elementId };
  }
  if (!worst) return null;
  if (criteria.deflection?.length) {
    const dr = deflectionRatio(profile, criteria.deflection);
    return { profile, ratio: worst.ratio, elementId: worst.elementId, passes: passes && dr <= 1, deflectionRatio: dr };
  }
  return { profile, ratio: worst.ratio, elementId: worst.elementId, passes };
}

export interface OptimiseResult {
  /** The lightest passing profile, or null when no candidate passes. */
  chosen: CandidateVerdict | null;
  /** The heaviest checked when none passes, so the user sees how far off the family is. */
  best: CandidateVerdict | null;
  /** How many candidates were checked. */
  tried: number;
}

/** The lightest profile, of `family` or of the criteria's families, that passes every member of the group. */
export function lightestPassing(
  family: ProfileFamily,
  members: readonly OptimiseMember[],
  material: { fy?: number; e?: number; fu?: number },
  criteria: OptimiseCriteria = {},
): OptimiseResult {
  let tried = 0;
  let best: CandidateVerdict | null = null;
  for (const p of candidates(criteria, family)) {
    const v = verdictFor(p, members, material, criteria);
    if (!v) continue;
    tried++;
    if (v.passes) return { chosen: v, best: v, tried };
    if (!best || v.ratio < best.ratio) best = v;
  }
  return { chosen: null, best, tried };
}
