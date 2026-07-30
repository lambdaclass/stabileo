/**
 * CIRSOC 201 design-code adapter.
 *
 * Wraps the existing, well-tested pure capacity functions in
 * `station-design-forces.ts` behind the `DesignCodeAdapter` seam. The legacy
 * `checkFlexure` / `checkShear` / `checkColumn` estimators in `cirsoc201.ts` are
 * NOT used for verdicts any more — they remain as the required-steel seed and the
 * source of calculation memos. `checkColumn`'s straight-line interaction in
 * particular was the source of generator/verifier disagreement and never decides
 * pass/fail again.
 *
 * VERIFIER VERSION: 'cirsoc201.provided.v2'.
 *   v1 → v2 corrected the governing-axis selection (beams and columns), turned
 *   missing-reinforcement from a skipped check into an explicit failure, switched
 *   utilization to demand/capacity with a warn band, checked both column shear
 *   components, and threaded the slenderness magnifier. Statuses produced by v1
 *   are NOT comparable with v2 — v1 issued false passes.
 */

import { verifyProvidedReinforcement, requiredLd, requiredLdh } from '../../station-design-forces';
import type { ProvidedRebarResult } from '../../station-design-forces';
import type { ProvidedReinforcement } from '../../../store/model.svelte';
import { peakMy, peakMz, peakVy, peakVz, peakAxial } from '../design-axes';
import type { MemberContext } from '../member-context';
import type { CandidateGenerator } from '../candidate-generator';
import { createBeamCandidateGenerator } from '../candidate-enumerate-beam';
import { createColumnCandidateGenerator, COLUMN_LIMITS } from '../candidate-enumerate-column';
import { recommendSection, type AdviceDemands } from '../section-advice';
import { DEFAULT_OBJECTIVE, type ObjectiveSpec } from '../objective';
import { UTILIZATION_CONVENTION, type LimitingConstraint, type SectionRecommendation, type DesignReason } from '../outcome';
import {
  minClearSpacingFor,
} from '../../../codes/cirsoc201/spacing';
import {
  transverseSpacingSupportedForEdition,
} from '../../../codes/cirsoc201/transverse-spacing';
import { clause } from '../../../codes/regulation';
import type { RegulationEdition } from '../../../codes/regulation';
import {
  CIRSOC201_CAPABILITIES_2005, CIRSOC201_CAPABILITIES_2025, CIRSOC201_CLAUSES,
} from './cirsoc201-capabilities';
import {
  registerDesignCode,
  type CodeCapabilities, type CodeProvenance, type DemandRequirement,
  type DesignCodeAdapter, type DetailingLimits, type InputValidation,
} from '../code-adapter';

export const CIRSOC_VERIFIER_ID = 'cirsoc201.provided.v2';

/**
 * Legacy coarse flags, kept because the UI still reads them.
 *
 * `curtailment` is now FALSE. It was true, and it was an over-claim: the verifier can
 * rate a curtailment the user supplied, but the app cannot produce one. The two
 * questions have different answers and are now asked separately — see the five-facet
 * matrix in ./cirsoc201-capabilities.ts, which is the authority.
 */
const CAPABILITIES: CodeCapabilities = {
  beams: { flexure: true, shear: true, torsion: false, regions: true, curtailment: false, anchorage: true },
  columns: { axialFlexure: true, biaxial: true, slenderness: true, ties: true },
  walls: false,
  sectionShapes: ['rect'],
  candidateGeneration: true,
  sectionRecommendation: true,
};

function makeAdapter(edition: RegulationEdition): DesignCodeAdapter {
 return {
  id: edition === '2025' ? 'cirsoc' : 'cirsoc-2005',
  // Edition-qualified. Both editions are separate adapters with separate clause maps, and
  // naming them both "CIRSOC 201" is what put the same label in a picker twice.
  name: `CIRSOC 201-${edition}`,
  version: edition,
  utilizationConvention: UTILIZATION_CONVENTION,
  capabilities: CAPABILITIES,
  capabilityMatrix: edition === '2025' ? CIRSOC201_CAPABILITIES_2025 : CIRSOC201_CAPABILITIES_2005,

  requiredDemands(): DemandRequirement {
    return {
      needsCombinations: true,
      minCombinations: 1,
      categories: ['My+', 'My-', 'Mz+', 'Mz-', 'Vy', 'Vz', 'N_compression'],
    };
  },

  validateInputs(ctx: MemberContext): InputValidation {
    const blocking: LimitingConstraint[] = [];
    const reasons: DesignReason[] = [];
    for (const b of ctx.blocking) {
      blocking.push(b);
      switch (b) {
        case 'missingCombinations':
          reasons.push({ key: 'design.reason.missingCombinations', params: { elementId: ctx.elementId } });
          break;
        case 'missingDemand':
          reasons.push({ key: 'design.reason.missingDemand', params: { elementId: ctx.elementId } });
          break;
        case 'missingSection':
          reasons.push({ key: 'design.reason.missingSection', params: { elementId: ctx.elementId } });
          break;
        case 'missingMaterial':
          reasons.push({ key: 'design.reason.missingMaterial', params: { elementId: ctx.elementId } });
          break;
        default:
          reasons.push({ key: 'design.reason.generic', params: { detail: b } });
      }
    }
    if (ctx.material.fc > 80) {
      blocking.push('missingMaterial');
      reasons.push({ key: 'design.reason.notConcrete', params: { fc: ctx.material.fc } });
    }
    return { ok: blocking.length === 0, blocking: [...new Set(blocking)], reasons };
  },

  detailingLimits(ctx: MemberContext): DetailingLimits {
    const { fc, fy } = ctx.material;
    const isColumn = ctx.elementType === 'column';
    const rhoMin = isColumn
      ? COLUMN_LIMITS.rhoMin
      : Math.max(0.25 * Math.sqrt(fc) / fy, 1.4 / fy);
    // CIRSOC 201 §25.2.1/§25.2.3 (2025) or §7.6.1/§7.6.3 (2005). The bar diameter is
    // not known here, so this reports the requirement for the smallest standard bar;
    // the verifier and the generator evaluate the rule per actual diameter.
    const spacing = minClearSpacingFor(edition, isColumn ? 'column' : 'beam', {
      barDiameterMm: 8,
      maxAggregateSizeMm: ctx.material.maxAggregateSize.value,
    });
    return {
      minClearSpacing: spacing.minClear,
      ld: (d: number) => requiredLd(d, fc, fy),
      ldh: (d: number) => requiredLdh(d, fc, fy),
      lapSplice: (d: number) => 1.3 * requiredLd(d, fc, fy),
      rhoMin,
      rhoMax: isColumn ? COLUMN_LIMITS.rhoMax : 0.025,
    };
  },

  createGenerator(ctx: MemberContext): CandidateGenerator | null {
    if (ctx.section.b <= 0 || ctx.section.h <= 0) return null;
    if (ctx.elementType === 'column') return createColumnCandidateGenerator(ctx);
    if (ctx.elementType === 'beam') return createBeamCandidateGenerator(ctx);
    return null; // walls are declared unsupported
  },

  verify(ctx: MemberContext, rebar: ProvidedReinforcement): ProvidedRebarResult {
    return verifyProvidedReinforcement(
      ctx.elementId,
      ctx.elementType,
      rebar,
      ctx.demands,
      {
        // Area-based fallbacks are only used when no station data exists; the
        // capacity path is preferred and is what actually decides the verdict.
        flexure: { AsReq: 0 },
        shear: { AvOverS: 0, AvOverSMin: 0 },
      },
      {
        b: ctx.axes.bFlex, h: ctx.axes.hFlex,
        fc: ctx.material.fc, fy: ctx.material.fy,
        cover: ctx.material.cover, stirrupDia: ctx.material.stirrupDia,
      },
      ctx.stations,
      ctx.modelData as never,
      {
        axes: ctx.axes,
        slenderDeltaNs: ctx.slenderDeltaNs,
        spacingRule: {
          edition: ctx.codeEdition,
          maxAggregateSizeMm: ctx.material.maxAggregateSize.value,
        },
        // Present only after coordination has moved this member's steel. It shifts the
        // layer centroids and nothing else — the section and its true cover are unchanged.
        finalGeometry: ctx.finalGeometry,
      },
    );
  },

  classifyFailure(v: ProvidedRebarResult, ctx: MemberContext): LimitingConstraint[] {
    const out = new Set<LimitingConstraint>();
    for (const c of v.checks) {
      if (c.status === 'ok') continue;
      if (c.limiting) out.add(c.limiting as LimitingConstraint);
    }
    if (ctx.orientationSuspect) out.add('memberOrientationSuspect');
    return [...out];
  },

  optimizationObjective(_ctx: MemberContext): ObjectiveSpec {
    return DEFAULT_OBJECTIVE;
  },

  adviceDemands(ctx: MemberContext): AdviceDemands {
    const primaryM = ctx.axes.flexure === 'My' ? peakMy(ctx.demands) : peakMz(ctx.demands);
    const primaryV = ctx.axes.shear === 'Vy' ? peakVy(ctx.demands) : peakVz(ctx.demands);
    return {
      Mu: primaryM * ctx.slenderDeltaNs,
      Vu: primaryV,
      Nu: peakAxial(ctx.demands),
    };
  },

  recommendSection(ctx: MemberContext, limiting: LimitingConstraint[]): SectionRecommendation | null {
    return recommendSection(ctx, limiting, this.adviceDemands(ctx));
  },

  unsupported(ctx: MemberContext): LimitingConstraint[] {
    const out: LimitingConstraint[] = [];
    if (ctx.elementType === 'wall') out.push('unsupportedCheck');
    // Transverse reinforcement is required in every beam and column this adapter designs,
    // and its spacing rule (Table 9.7.6.2.2) is implemented for the 2025 edition ONLY. The
    // 2005 text is not supplied, so the rule cannot be applied, and the 2025 table is not
    // substituted — a certificate stamped 2005 whose governing spacing came from the 2025
    // table cites a rule it did not apply.
    //
    // Refused HERE, at the capability gate, so the outcome is UNSUPPORTED. Letting the
    // search run and come back empty would report SEARCH_EXHAUSTED, which asserts that the
    // code-permitted envelope was explored and found wanting — a different and false claim.
    if (!transverseSpacingSupportedForEdition(ctx.codeEdition)) out.push('unsupportedCheck');
    return out;
  },

  provenance(): CodeProvenance {
    return {
      codeId: edition === '2025' ? 'cirsoc' : 'cirsoc-2005',
      codeName: 'CIRSOC 201',
      codeVersion: edition,
      // v3 adds the edition to the verifier identity. A v2 certificate did not record
      // which edition produced it, so v2 and v3 results are not interchangeable.
      verifierId: `${CIRSOC_VERIFIER_ID}.${edition}`,
      clauses: CIRSOC201_CLAUSES[edition],
    };
  },
 };
}

/** CIRSOC 201-2025 — the edition in force. Default for new projects. */
export const cirsoc201Adapter2025: DesignCodeAdapter = makeAdapter('2025');

/**
 * CIRSOC 201-2005 — legacy, selectable for projects designed before the 2025 edition
 * came into force. An independent adapter with its own clause map; it shares an
 * implementation but never a rule or a clause identifier with 2025.
 */
export const cirsoc201Adapter2005: DesignCodeAdapter = makeAdapter('2005');

/** Back-compat alias: the default adapter is now the edition in force. */
export const cirsoc201Adapter = cirsoc201Adapter2025;

registerDesignCode(cirsoc201Adapter2025);
registerDesignCode(cirsoc201Adapter2005);
