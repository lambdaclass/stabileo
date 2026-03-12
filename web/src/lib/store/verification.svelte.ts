// Verification results store — global cache for CIRSOC 201/301 verification results
// Enables 3D viewport color mapping by verification status/ratio.

import type { ElementVerification } from '../engine/codes/argentina/cirsoc201';
import type { SteelVerification } from '../engine/codes/argentina/cirsoc301';

export type VerificationStatus = 'ok' | 'warn' | 'fail';

function createVerificationStore() {
  let concreteVerifs = $state<ElementVerification[]>([]);
  let steelVerifs = $state<SteelVerification[]>([]);

  // Lookup maps (rebuilt on set)
  let concreteMap = $state<Map<number, ElementVerification>>(new Map());
  let steelMap = $state<Map<number, SteelVerification>>(new Map());

  function rebuildMaps() {
    const cm = new Map<number, ElementVerification>();
    for (const v of concreteVerifs) cm.set(v.elementId, v);
    concreteMap = cm;

    const sm = new Map<number, SteelVerification>();
    for (const v of steelVerifs) sm.set(v.elementId, v);
    steelMap = sm;
  }

  return {
    get concrete() { return concreteVerifs; },
    get steel() { return steelVerifs; },
    get concreteMap() { return concreteMap; },
    get steelMap() { return steelMap; },

    /** Whether any verification results exist */
    get hasResults() { return concreteVerifs.length > 0 || steelVerifs.length > 0; },

    /** Set concrete (CIRSOC 201) verification results */
    setConcrete(verifs: ElementVerification[]) {
      concreteVerifs = verifs;
      rebuildMaps();
    },

    /** Set steel (CIRSOC 301) verification results */
    setSteel(verifs: SteelVerification[]) {
      steelVerifs = verifs;
      rebuildMaps();
    },

    /** Get the worst (max) utilization ratio for an element.
     *  Returns null if element has no verification. */
    getMaxRatio(elementId: number): number | null {
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
      const cv = concreteMap.get(elementId);
      if (cv) return cv.overallStatus;
      const sv = steelMap.get(elementId);
      if (sv) return sv.overallStatus;
      return null;
    },

    /** Clear all verification results */
    clear() {
      concreteVerifs = [];
      steelVerifs = [];
      concreteMap = new Map();
      steelMap = new Map();
    },
  };
}

export const verificationStore = createVerificationStore();
