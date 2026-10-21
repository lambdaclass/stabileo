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
import { concreteBelowTopBars } from '../../../codes/cirsoc201/anchorage';
import type { ProvidedRebarResult } from '../../station-design-forces';
import type { ProvidedReinforcement } from '../../../store/model.svelte';
import { peakMy, peakMz, peakVy, peakVz, peakAxial } from '../design-axes';
import type { MemberContext } from '../member-context';
import type { CandidateGenerator } from '../candidate-generator';
import { createBeamCandidateGenerator, BEAM_LIMITS } from '../candidate-enumerate-beam';
import { demonstratedInsufficiency } from '../section-bounds';
import { createColumnCandidateGenerator, COLUMN_LIMITS } from '../candidate-enumerate-column';
import { recommendSection, type AdviceDemands } from '../section-advice';
import { wallMemberMinimumChecks } from '../wall-minimum-steel';
import { DEFAULT_OBJECTIVE, STANDARD_LONG_DIAS, STANDARD_STIRRUP_DIAS, type ObjectiveSpec } from '../objective';
import { UTILIZATION_CONVENTION, type LimitingConstraint, type SectionRecommendation, type DesignReason, type InsufficiencyProof } from '../outcome';
import {
  minClearSpacingFor,
} from '../../../codes/cirsoc201/spacing';
import {
  transverseSpacingSupportedForEdition,
} from '../../../codes/cirsoc201/transverse-spacing';
import { clause } from '../../../codes/regulation';
import { jointThreading, jointThreadingChecks } from '../joint-threading-check';
import { supportInputOf, bottomReach, endSupportChecks, endSupportVerdicts, inflectionChecks, type EndSupportInput } from '../end-support-anchorage';

/**
 * Every row of bars that ends in a column, checked by `planSupportEnd` on that column, and
 * §9.7.3.8.3 for the positive steel. An end no column can anchor fails here, so the search looks
 * for bars that anchor.
 */
function withSupportAnchorage(ctx: MemberContext, input: EndSupportInput, res: ProvidedRebarResult): ProvidedRebarResult {
  const verdicts = endSupportVerdicts(input);
  const extra = [...endSupportChecks(verdicts, input.lateral), ...inflectionChecks({ ...input, ...(ctx.stations ? { stations: ctx.stations } : {}), axes: ctx.axes, L: ctx.L })];
  // The bars through the column cages at its joints, as the detailing coordinates them.
  const threading = jointThreading(ctx, input.rebar, input);
  const checks = [...res.checks, ...extra, ...jointThreadingChecks(threading)];
  const rank = { none: -1, ok: 0, warn: 1, fail: 2 } as const;
  const overallStatus = checks.reduce<ProvidedRebarResult['overallStatus']>((w, c) => (rank[c.status] > rank[w] ? c.status : w), res.overallStatus);
  return { ...res, checks, overallStatus, supportAnchorage: verdicts, jointThreading: threading };
}
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
  beams: { flexure: true, shear: true, torsion: true, regions: true, curtailment: false, anchorage: true },
  columns: { axialFlexure: true, biaxial: true, slenderness: true, ties: true },
  walls: false,
  sectionShapes: ['rect', 'circular', 'T', 'L'],
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
    /*
     * One ld per diameter, with no face and no layout: the «other cases» row of Tabla 25.4.2.3,
     * and for a beam the top-bar ψt of §25.4.2.5 when its depth leaves more than 300 mm below
     * the top steel — the longer of its two faces, since this answer is not told which one it
     * is for. A column's bars are vertical and take ψt = 1. The verifier, which has the layout,
     * establishes the favourable row itself where it holds.
     */
    const dev = (d: number) => requiredLd(d, fc, fy, {
      concreteBelowM: isColumn ? 0 : concreteBelowTopBars(ctx.section.h, ctx.material.cover, ctx.material.stirrupDia, d),
    });
    return {
      minClearSpacing: spacing.minClear,
      ld: dev,
      ldh: (d: number) => requiredLdh(d, fc, fy),
      lapSplice: (d: number) => 1.3 * dev(d),
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
    const support = supportInputOf(ctx, rebar);
    const res = verifyProvidedReinforcement(
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
        // A sway storey's δs magnifies the column's moments too (§6.6.4.6), on top of δns.
        slenderDeltaNs: ctx.slenderDeltaNs * (ctx.slenderDeltaS ?? 1),
        ...(ctx.torsionStiffness !== undefined ? { torsionStiffness: ctx.torsionStiffness } : {}),
        ...(ctx.shape ? { shape: ctx.shape } : {}),
        spacingRule: {
          edition: ctx.codeEdition,
          maxAggregateSizeMm: ctx.material.maxAggregateSize.value,
        },
        // Present only after coordination has moved this member's steel. It shifts the
        // layer centroids and nothing else — the section and its true cover are unchanged.
        finalGeometry: ctx.finalGeometry,
        // The bottom bars' ends as the detailing lays them: the region rows measure to there.
        ...(support ? { bottomReach: bottomReach(support) } : {}),
      },
    );
    if (support && res.hasProvided) return withSupportAnchorage(ctx, support, res);
    // A wall's own minimum, Tabla 11.6.1 (or §11.6.2), besides the flexural one of the beam path.
    if (ctx.elementType !== 'wall' || !res.hasProvided) return res;
    const { b, h } = ctx.section;
    const vu = h >= b ? peakVz(ctx.demands) : peakVy(ctx.demands);
    const extra = wallMemberMinimumChecks(rebar, { b, h, L: ctx.L, fc: ctx.material.fc, fy: ctx.material.fy, vu });
    if (!extra.length) return res;
    const checks = [...res.checks, ...extra];
    const rank = { none: -1, ok: 0, warn: 1, fail: 2 } as const;
    const overallStatus = checks.reduce<ProvidedRebarResult['overallStatus']>((w, c) => (rank[c.status] > rank[w] ? c.status : w), res.overallStatus);
    return { ...res, checks, overallStatus };
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
      Mu: primaryM * ctx.slenderDeltaNs * (ctx.slenderDeltaS ?? 1),
      Vu: primaryV,
      Nu: peakAxial(ctx.demands),
    };
  },

  recommendSection(ctx: MemberContext, limiting: LimitingConstraint[]): SectionRecommendation | null {
    return recommendSection(ctx, limiting, this.adviceDemands(ctx));
  },

  insufficiency(ctx: MemberContext): InsufficiencyProof | null {
    return demonstratedInsufficiency(ctx);
  },

  alternatives(ctx: MemberContext) {
    const beam = ctx.elementType !== 'column';
    return {
      longDiametersMm: [...(ctx.material.longDiametersMm?.length ? ctx.material.longDiametersMm : STANDARD_LONG_DIAS)],
      maxRows: beam ? BEAM_LIMITS.maxRows : 1,
      optionsRetained: beam ? BEAM_LIMITS.maxRegionOptions : COLUMN_LIMITS.maxLongOptions,
      stirrupDiametersMm: [...(ctx.material.stirrupDiametersMm?.length ? ctx.material.stirrupDiametersMm : STANDARD_STIRRUP_DIAS)],
      maxLegs: beam ? BEAM_LIMITS.maxLegs : COLUMN_LIMITS.maxLegs,
    };
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

    /**
     * A beam with significant bending about BOTH axes, refused here rather than searched.
     *
     * ── What the verifier actually does ────────────────────────────
     *
     * For a beam or a wall it checks the primary axis pair only; the secondary pair is never
     * evaluated. When `resolveDesignAxes` finds the secondary moment above the biaxial
     * threshold, the verifier declines to certify — correctly, because certifying would pass
     * a member whose significant secondary bending nobody checked.
     *
     * ── Why that refusal belongs at THIS gate ──────────────────────
     *
     * Because it is a property of the MEMBER and the verifier, not of any candidate. Every
     * arrangement the generator can produce fails it identically, so the search cannot
     * succeed and cannot learn anything by trying: it spent its full budget — 50 candidates
     * each on 117 members of `pro-edificio-7p`, some 5 800 verifier calls — to arrive at the
     * answer that was available before the first one.
     *
     * And it arrived at the WRONG answer. `SEARCH_EXHAUSTED` means "a bounded search found
     * nothing; feasibility is not established", which tells an engineer to try a bigger
     * section or a longer run. Neither helps. The truth is the one this gate exists to state:
     * a required check is not implemented for this member, so no arrangement can be
     * certified — exactly the reasoning the transverse-spacing refusal above is written from.
     *
     * Columns are unaffected: their biaxial check IS implemented, and `ctx.axes.biaxial`
     * drives it rather than refusing it.
     *
     * ── Not when the orientation is already in doubt ───────────────
     *
     * `axes.biaxial` is derived from the member's demands, so a model with gravity authored
     * in the horizontal component produces a secondary moment that looks significant and is
     * an artefact. This gate runs BEFORE the orientation refusal, so without this condition
     * such a member would be told it has real biaxial bending — sending an engineer to brace
     * a beam when what is wrong is the load case. Where the orientation is suspect, that is
     * the finding, and it is the one the search reports.
     */
    if (ctx.elementType !== 'column' && ctx.axes.biaxial && !ctx.orientationSuspect) {
      out.push('biaxial');
    }

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
