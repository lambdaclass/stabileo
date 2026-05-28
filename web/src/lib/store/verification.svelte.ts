// Verification results store — global cache for design-check results.
// Enables 3D viewport color mapping by verification status/ratio.
// Supports both legacy CIRSOC-specific results and unified multi-code results.

import type { ElementVerification } from '../engine/codes/argentina/cirsoc201';
import type { SteelVerification } from '../engine/codes/argentina/cirsoc301';
import type { MemberDesignResult, DesignCheckSummary } from '../engine/design-check-results';

export type VerificationStatus = 'ok' | 'warn' | 'fail';

function createVerificationStore() {
  // Legacy CIRSOC-specific results (kept for backward compat with existing PRO flows)
  let concreteVerifs = $state<ElementVerification[]>([]);
  let steelVerifs = $state<SteelVerification[]>([]);
  let concreteMap = $state<Map<number, ElementVerification>>(new Map());
  let steelMap = $state<Map<number, SteelVerification>>(new Map());

  // Unified multi-code results (new — used by design surface + viewport overlay)
  let designResults = $state<MemberDesignResult[]>([]);
  let designMap = $state<Map<number, MemberDesignResult>>(new Map());
  let designSummary = $state<DesignCheckSummary | null>(null);

  function rebuildLegacyMaps() {
    const cm = new Map<number, ElementVerification>();
    for (const v of concreteVerifs) cm.set(v.elementId, v);
    concreteMap = cm;
    const sm = new Map<number, SteelVerification>();
    for (const v of steelVerifs) sm.set(v.elementId, v);
    steelMap = sm;
  }

  function rebuildDesignMap() {
    const dm = new Map<number, MemberDesignResult>();
    for (const r of designResults) dm.set(r.elementId, r);
    designMap = dm;
  }

  return {
    // Legacy accessors (backward compat)
    get concrete() { return concreteVerifs; },
    get steel() { return steelVerifs; },
    get concreteMap() { return concreteMap; },
    get steelMap() { return steelMap; },

    // Unified accessors
    get design() { return designResults; },
    get designMap() { return designMap; },
    get summary() { return designSummary; },

    /** Whether any verification results exist (legacy or unified) */
    get hasResults() { return concreteVerifs.length > 0 || steelVerifs.length > 0 || designResults.length > 0; },

    // Legacy setters
    setConcrete(verifs: ElementVerification[]) { concreteVerifs = verifs; rebuildLegacyMaps(); },
    setSteel(verifs: SteelVerification[]) { steelVerifs = verifs; rebuildLegacyMaps(); },

    /** Set unified design-check results (multi-code) */
    setDesignResults(results: MemberDesignResult[], summary: DesignCheckSummary) {
      designResults = results;
      designSummary = summary;
      rebuildDesignMap();
    },

    /** Get the worst (max) utilization ratio for an element.
     *  Checks unified results first, then falls back to legacy. */
    getMaxRatio(elementId: number): number | null {
      // Unified results take priority
      const dr = designMap.get(elementId);
      if (dr) return dr.utilization;

      // Legacy fallback
      const cv = concreteMap.get(elementId);
      if (cv) {
        const ratios = [cv.flexure.ratio, cv.shear.ratio];
        if (cv.column) ratios.push(cv.column.ratio);
        if (cv.torsion) ratios.push(cv.torsion.ratio);
        if (cv.biaxial) ratios.push(cv.biaxial.ratio);
        return Math.max(...ratios);
      }
      const sv = steelMap.get(elementId);
      if (sv) {
        const ratios: number[] = [];
        if (sv.interaction) ratios.push(sv.interaction.ratio);
        ratios.push(sv.flexureZ.ratio, sv.shear.ratio);
        if (sv.flexureY) ratios.push(sv.flexureY.ratio);
        if (sv.tension) ratios.push(sv.tension.ratio);
        if (sv.compression) ratios.push(sv.compression.ratio);
        return ratios.length > 0 ? Math.max(...ratios) : null;
      }
      return null;
    },

    /** Get overall status for an element */
    getStatus(elementId: number): VerificationStatus | null {
      const dr = designMap.get(elementId);
      if (dr) return dr.status;
      const cv = concreteMap.get(elementId);
      if (cv) return cv.overallStatus;
      const sv = steelMap.get(elementId);
      if (sv) return sv.overallStatus;
      return null;
    },

    /** Clear all verification results (legacy + unified) */
    clear() {
      concreteVerifs = [];
      steelVerifs = [];
      concreteMap = new Map();
      steelMap = new Map();
      designResults = [];
      designMap = new Map();
      designSummary = null;
    },
  };
}

export const verificationStore = createVerificationStore();
