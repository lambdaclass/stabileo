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

/** A candidate's verdict on a group: the worst member and its ratio. */
export interface CandidateVerdict {
  profile: SteelProfile;
  /** Largest utilisation over the group's members. */
  ratio: number;
  /** The member that governs. */
  elementId: number;
  passes: boolean;
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
): CandidateVerdict | null {
  const section = profileToSectionFull(profile);
  let worst: { ratio: number; elementId: number } | null = null;
  let passes = true;
  for (const m of members) {
    const v = checkSteelMember(m.elementId, m.demand, section, material, m.lengths);
    if (!v) return null;
    const r = steelGoverningRatio(v);
    if (v.overallStatus === 'fail' || !(r <= 1)) passes = false;
    if (!worst || r > worst.ratio) worst = { ratio: r, elementId: m.elementId };
  }
  if (!worst) return null;
  return { profile, ratio: worst.ratio, elementId: worst.elementId, passes };
}

export interface OptimiseResult {
  /** The lightest passing profile, or null when none in the family passes. */
  chosen: CandidateVerdict | null;
  /** The heaviest checked when none passes, so the user sees how far off the family is. */
  best: CandidateVerdict | null;
  /** How many candidates were checked. */
  tried: number;
}

/** The lightest profile of `family` that passes every member of the group. */
export function lightestPassing(
  family: ProfileFamily,
  members: readonly OptimiseMember[],
  material: { fy?: number; e?: number; fu?: number },
): OptimiseResult {
  let tried = 0;
  let best: CandidateVerdict | null = null;
  for (const p of familyByWeight(family)) {
    const v = verdictFor(p, members, material);
    if (!v) continue;
    tried++;
    if (v.passes) return { chosen: v, best: v, tried };
    if (!best || v.ratio < best.ratio) best = v;
  }
  return { chosen: null, best, tried };
}
