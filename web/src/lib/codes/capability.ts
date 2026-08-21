/**
 * Five-facet capability model.
 *
 * The problem this replaces: `CodeCapabilities` in the design-code adapter used a single
 * boolean per feature, and `curtailment: true` meant "the verifier can rate a curtailment
 * you gave it". The UI read the same flag as "the app can produce a curtailment for you"
 * and offered a feature that does not exist. One boolean cannot answer both questions.
 *
 * So a capability is split into five independent facets, each of which is a separate
 * engineering claim:
 *
 *   verify      — given a design, the app can decide pass/fail against the code
 *   generate    — the app can produce a compliant design, not merely rate one
 *   coordinate  — the app can make it consistent across adjacent members
 *   document    — the app can draw and schedule it well enough for an engineer to review
 *   gate        — a failure of this capability blocks the model reaching a complete state
 *
 * `gate` is what stops "we could not check punching shear" from quietly becoming a floor
 * marked complete. A capability that is unsupported but gated is honest; a capability
 * that is unsupported and ungated is a false completeness claim.
 *
 * Pure: no store imports.
 */

import type { ClauseRef } from './regulation';

// ─── Facets ──────────────────────────────────────────────────────

export const FACETS = ['verify', 'generate', 'coordinate', 'document', 'gate'] as const;
export type Facet = (typeof FACETS)[number];

export type FacetSet = Readonly<Record<Facet, boolean>>;

const NONE: FacetSet = Object.freeze({
  verify: false, generate: false, coordinate: false, document: false, gate: false,
});

export function facets(partial: Partial<Record<Facet, boolean>>): FacetSet {
  return Object.freeze({ ...NONE, ...partial });
}

// ─── Capability keys ─────────────────────────────────────────────

/**
 * Everything the product may claim. Adding a member here without adding a row to every
 * adapter is a compile error, which is the point: a new capability cannot be introduced
 * without each code stating whether it supports it.
 */
export const CAPABILITY_KEYS = [
  // Beams and columns
  'beamFlexure', 'beamShear', 'beamTorsion', 'beamRegions', 'curtailment', 'anchorage',
  'columnAxialFlexure', 'columnBiaxial', 'columnSlenderness', 'ties',
  // Detailing
  'bentBars', 'lapsSplices', 'joints', 'jointShear',
  // Element families
  'slabsOneWay', 'slabsTwoWay', 'walls', 'foundations', 'diaphragms',
  // Section families
  'nonRectangularSections',
  // Seismic
  'seismicAnalysis', 'seismicDetailing',
  // Output
  'floorPlans', 'barSchedules',
  /*
   * Structural steel.
   *
   * Listed here, in the ONE place the product declares what it may claim, rather than in a
   * metallic vocabulary of their own. The point of this list is that a capability cannot be
   * introduced without every code stating whether it supports it, and a parallel list would
   * defeat that for exactly the material where over-claiming is most likely right now.
   *
   * Every one of these is `false` on every registered adapter today. That is the honest
   * state, and it is the state the metallic surface reads to explain itself.
   */
  'steelTension', 'steelCompression', 'steelFlexure', 'steelLateralTorsionalBuckling',
  'steelShear', 'steelInteraction', 'steelSectionClassification',
  'steelConnections', 'steelBracing', 'steelMemberSchedules',
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

export interface CapabilityDeclaration {
  facets: FacetSet;
  /** Clauses that govern this capability under the declaring edition. */
  refs: readonly ClauseRef[];
  /**
   * Why a facet is false, when the reason is not simply "not built yet".
   * Surfaced verbatim to the user, so it must read as an explanation, not an excuse.
   */
  limitation?: string;
  /**
   * The exact solver output that would unblock this, when the blocker is solver-side.
   * Recorded so an escalation can be written from data instead of memory.
   */
  missingSolverOutput?: string;
}

export type CapabilityMatrix = Readonly<Record<CapabilityKey, CapabilityDeclaration>>;

/** Every capability off. Adapters spread this and override what they support. */
export function emptyMatrix(): Record<CapabilityKey, CapabilityDeclaration> {
  const out = {} as Record<CapabilityKey, CapabilityDeclaration>;
  for (const key of CAPABILITY_KEYS) out[key] = { facets: NONE, refs: [] };
  return out;
}

// ─── Queries the UI and the workflow use ─────────────────────────

export function supports(matrix: CapabilityMatrix, key: CapabilityKey, facet: Facet): boolean {
  return matrix[key].facets[facet];
}

/**
 * A UI affordance is offered only when EVERY facet it needs is supported.
 *
 * This is the check that fixes the curtailment over-claim: the "generate curtailment"
 * button asks for `['generate', 'document']` and CIRSOC 201 declares `generate: false`,
 * so the button does not render at all — instead of rendering and producing nothing.
 */
export function offers(matrix: CapabilityMatrix, key: CapabilityKey, needed: readonly Facet[]): boolean {
  return needed.every((f) => matrix[key].facets[f]);
}

export interface UnsupportedNotice {
  key: CapabilityKey;
  missingFacets: Facet[];
  limitation?: string;
  missingSolverOutput?: string;
  refs: readonly ClauseRef[];
}

/** What to tell the user when `offers()` said no. Never an empty message. */
export function explainUnsupported(
  matrix: CapabilityMatrix,
  key: CapabilityKey,
  needed: readonly Facet[],
): UnsupportedNotice | null {
  const missing = needed.filter((f) => !matrix[key].facets[f]);
  if (missing.length === 0) return null;
  const decl = matrix[key];
  return {
    key,
    missingFacets: missing,
    limitation: decl.limitation,
    missingSolverOutput: decl.missingSolverOutput,
    refs: decl.refs,
  };
}

/**
 * Capabilities that block completeness: unsupported AND gated.
 *
 * A model with any of these in play cannot be reported as complete or constructible,
 * regardless of how many other checks pass.
 */
export function gatingGaps(matrix: CapabilityMatrix, inPlay: readonly CapabilityKey[]): CapabilityKey[] {
  return inPlay.filter((k) => matrix[k].facets.gate && !matrix[k].facets.verify);
}

/** Every capability the code can actually produce output for, for the UI's feature list. */
export function generatableCapabilities(matrix: CapabilityMatrix): CapabilityKey[] {
  return CAPABILITY_KEYS.filter((k) => matrix[k].facets.generate);
}

/** Stable, deterministic summary used in certificates and golden tests. */
export function summariseMatrix(matrix: CapabilityMatrix): string {
  return CAPABILITY_KEYS
    .map((k) => {
      const f = matrix[k].facets;
      const bits = FACETS.map((x) => (f[x] ? x[0].toUpperCase() : '-')).join('');
      return `${k}:${bits}`;
    })
    .join(' ');
}
