/**
 * Honest "unsupported" adapters.
 *
 * ACI 318 / AISC 360, Eurocode 2/3, NDS, TMS 402 and AISI S100 have WASM
 * ratio-checkers in this app, but no reinforcement model: they can rate a member,
 * they cannot propose or certify rebar. Rather than let the UI imply otherwise,
 * each is registered as an adapter that declares `candidateGeneration: false` and
 * always returns UNSUPPORTED from the design pipeline.
 *
 * This is what makes the code seam real and testable today: the conformance suite
 * runs over every registered adapter, and the UI's UNSUPPORTED rendering path is
 * exercised by a code the user can actually select.
 *
 * Eurocode is NOT implemented here. When it is, it replaces its entry in this
 * registry and inherits the same conformance tests without any UI change.
 */

import type { ProvidedRebarResult } from '../../station-design-forces';
import type { ProvidedReinforcement } from '../../../store/model.svelte';
import type { MemberContext } from '../member-context';
import { DEFAULT_OBJECTIVE, type ObjectiveSpec } from '../objective';
import { UTILIZATION_CONVENTION, type LimitingConstraint, type SectionRecommendation } from '../outcome';
import { emptyMatrix, type CapabilityMatrix } from '../../../codes/capability';
import {
  registerDesignCode,
  type CodeCapabilities, type CodeProvenance, type DemandRequirement,
  type DesignCodeAdapter, type DesignCodeId, type DetailingLimits, type InputValidation,
} from '../code-adapter';
import type { AdviceDemands } from '../section-advice';

const NO_CAPABILITIES: CodeCapabilities = {
  beams: { flexure: false, shear: false, torsion: false, regions: false, curtailment: false, anchorage: false },
  columns: { axialFlexure: false, biaxial: false, slenderness: false, ties: false },
  walls: false,
  sectionShapes: [],
  candidateGeneration: false,
  sectionRecommendation: false,
};

const NO_MATRIX: CapabilityMatrix = Object.freeze(emptyMatrix()) as CapabilityMatrix;

function makeUnsupported(id: DesignCodeId, name: string, version: string): DesignCodeAdapter {
  return {
    id, name, version,
    utilizationConvention: UTILIZATION_CONVENTION,
    capabilities: NO_CAPABILITIES,
    // Every facet false for every capability: this adapter exists precisely to say
    // "this code is not implemented" without pretending otherwise.
    capabilityMatrix: NO_MATRIX,

    requiredDemands(): DemandRequirement {
      return { needsCombinations: true, minCombinations: 1, categories: [] };
    },

    validateInputs(ctx: MemberContext): InputValidation {
      return {
        ok: false,
        blocking: ['unsupportedCheck'],
        reasons: [{ key: 'design.reason.codeUnsupported', params: { code: name, elementId: ctx.elementId } }],
      };
    },

    detailingLimits(_ctx: MemberContext): DetailingLimits {
      return {
        minClearSpacing: 0.025,
        ld: () => 0, ldh: () => 0, lapSplice: () => 0,
        rhoMin: 0, rhoMax: 0,
      };
    },

    createGenerator(): null { return null; },

    verify(ctx: MemberContext, _rebar: ProvidedReinforcement): ProvidedRebarResult {
      return {
        elementId: ctx.elementId, elementType: ctx.elementType,
        hasProvided: true, checks: [], overallStatus: 'none',
        worstUtilization: 0, checkedAxes: [], strengthCheckCount: 0,
      };
    },

    classifyFailure(): LimitingConstraint[] { return ['unsupportedCheck']; },
    optimizationObjective(): ObjectiveSpec { return DEFAULT_OBJECTIVE; },
    adviceDemands(): AdviceDemands { return { Mu: 0, Vu: 0, Nu: 0 }; },
    recommendSection(): SectionRecommendation | null { return null; },
    unsupported(): LimitingConstraint[] { return ['unsupportedCheck']; },

    provenance(): CodeProvenance {
      return {
        codeId: id, codeName: name, codeVersion: version,
        verifierId: `${id}.unsupported.v1`,
        clauses: [],
      };
    },
  };
}

export const unsupportedAdapters: DesignCodeAdapter[] = [
  makeUnsupported('aci-aisc', 'ACI 318 / AISC 360', '2019'),
  makeUnsupported('eurocode', 'Eurocode 2 / 3', 'EN 1992/1993'),
  makeUnsupported('nds', 'NDS (Timber)', '2018'),
  makeUnsupported('masonry', 'TMS 402 (Masonry)', '2016'),
  makeUnsupported('cfs', 'AISI S100 (CFS)', '2016'),
];

for (const a of unsupportedAdapters) registerDesignCode(a);
