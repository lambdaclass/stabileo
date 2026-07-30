/**
 * Design-code adapter seam.
 *
 * PR15 implements exactly one adapter (CIRSOC 201) plus an honest "unsupported"
 * adapter for the codes that have a WASM ratio-checker but no rebar model. The seam
 * is REAL, not speculative: the candidate search, the outcome classifier, the
 * section-advice workflow and the UI all consume this interface only, and a
 * conformance test suite is parameterised over the registry so a future Eurocode
 * adapter is validated by the same tests without touching the RC Design UI.
 *
 * Eurocode is NOT implemented here.
 *
 * Pure: adapters must not import a store. Everything they need arrives in
 * `MemberContext`.
 */

import type { ProvidedReinforcement } from '../../store/model.svelte';
import type { ProvidedRebarResult } from '../station-design-forces';
import type { MemberContext } from './member-context';
import type { CandidateGenerator } from './candidate-generator';
import type {
  LimitingConstraint, SectionRecommendation, DesignReason,
  UTILIZATION_CONVENTION,
} from './outcome';
import type { ObjectiveSpec } from './objective';
import type { AdviceDemands } from './section-advice';
import type { CapabilityMatrix } from '../../codes/capability';

export type DesignCodeId = 'cirsoc' | 'cirsoc-2005' | 'aci-aisc' | 'eurocode' | 'nds' | 'masonry' | 'cfs';

export interface CodeCapabilities {
  beams: {
    flexure: boolean; shear: boolean; torsion: boolean;
    regions: boolean; curtailment: boolean; anchorage: boolean;
  };
  columns: {
    axialFlexure: boolean; biaxial: boolean; slenderness: boolean; ties: boolean;
  };
  walls: boolean;
  sectionShapes: Array<'rect' | 'T' | 'L' | 'circular'>;
  /** False when the code cannot propose reinforcement (only rate a given one). */
  candidateGeneration: boolean;
  sectionRecommendation: boolean;
}

export interface DemandRequirement {
  needsCombinations: boolean;
  minCombinations: number;
  /** Demand categories the code needs present to design at all. */
  categories: string[];
}

export interface InputValidation {
  ok: boolean;
  blocking: LimitingConstraint[];
  reasons: DesignReason[];
}

export interface DetailingLimits {
  /** Minimum clear spacing between parallel bars (m). */
  minClearSpacing: number;
  /** Development length for a straight bar of the given diameter (m). */
  ld(diameterMm: number): number;
  /** Development length for a standard hook (m). */
  ldh(diameterMm: number): number;
  /** Lap-splice length (m). */
  lapSplice(diameterMm: number): number;
  /** Minimum longitudinal steel ratio for this member type. */
  rhoMin: number;
  /** Maximum longitudinal steel ratio for this member type. */
  rhoMax: number;
}

export interface CodeProvenance {
  codeId: DesignCodeId;
  codeName: string;
  codeVersion: string;
  /** Identifier of the authoritative verifier, recorded in every certificate.
   *  Bumped when verification semantics change so old results are never confused
   *  with new ones. */
  verifierId: string;
  /** Clause references surfaced in reports. */
  clauses: string[];
}

export interface DesignCodeAdapter {
  readonly id: DesignCodeId;
  readonly name: string;
  readonly version: string;
  readonly utilizationConvention: typeof UTILIZATION_CONVENTION;
  readonly capabilities: CodeCapabilities;
  /**
   * Five-facet capability declaration — THE authority on what the code supports.
   * `capabilities` above is the older coarse view kept for existing UI call sites; where
   * the two disagree, this one is correct.
   */
  readonly capabilityMatrix: CapabilityMatrix;

  requiredDemands(): DemandRequirement;
  validateInputs(ctx: MemberContext): InputValidation;
  detailingLimits(ctx: MemberContext): DetailingLimits;

  /** Deterministic, bounded, feedback-driven candidate generation. */
  createGenerator(ctx: MemberContext): CandidateGenerator | null;

  /** THE authority. The same function the UI renders. */
  verify(ctx: MemberContext, rebar: ProvidedReinforcement): ProvidedRebarResult;

  classifyFailure(v: ProvidedRebarResult, ctx: MemberContext): LimitingConstraint[];
  optimizationObjective(ctx: MemberContext): ObjectiveSpec;
  adviceDemands(ctx: MemberContext): AdviceDemands;
  recommendSection(ctx: MemberContext, limiting: LimitingConstraint[]): SectionRecommendation | null;
  /** Capability gaps for THIS member (e.g. a non-rectangular section). */
  unsupported(ctx: MemberContext): LimitingConstraint[];
  provenance(): CodeProvenance;
}

// ─── Registry ────────────────────────────────────────────────

const registry = new Map<DesignCodeId, DesignCodeAdapter>();

export function registerDesignCode(adapter: DesignCodeAdapter): void {
  registry.set(adapter.id, adapter);
}

export function getDesignCode(id: DesignCodeId): DesignCodeAdapter | undefined {
  return registry.get(id);
}

export function listDesignCodes(): DesignCodeAdapter[] {
  return [...registry.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Test/reset helper — never used by app code. */
export function _clearDesignCodeRegistry(): void {
  registry.clear();
}
