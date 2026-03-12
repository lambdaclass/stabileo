// Plastic analysis — incremental plastic hinge method

import type { SolverInput, SolverElement, AnalysisResults, ElementForces } from './types';
import { solve, computeStaticDegree } from './solver-js';
import { t } from '../i18n';

export interface PlasticHinge {
  elementId: number;
  end: 'start' | 'end';
  moment: number;    // kN·m (moment at hinge formation)
  loadFactor: number; // cumulative load factor at formation
  step: number;
}

export interface PlasticStep {
  loadFactor: number;     // cumulative λ at this step
  hingesFormed: PlasticHinge[];
  results: AnalysisResults;
}

export interface PlasticResult {
  /** Load factor at collapse (mechanism formation) */
  collapseFactor: number;
  /** Sequence of plastic hinge formations */
  steps: PlasticStep[];
  /** All hinges in order of formation */
  hinges: PlasticHinge[];
  /** Whether a full mechanism was detected */
  isMechanism: boolean;
  /** Degree of static indeterminacy of the original structure
   *  (number of redundant constraints = #hinges needed for mechanism) */
  redundancy: number;
}

export interface PlasticConfig {
  /** Maximum number of plastic hinges before stopping (default 20) */
  maxHinges?: number;
  /** Map of sectionId → plastic moment Mp (kN·m).
   *  If not provided, Mp = fy × Zp where Zp is estimated from section geometry. */
  mpOverrides?: Map<number, number>;
}

/**
 * Compute plastic moment capacity for a section.
 * Mp = fy × Zp
 * For rectangular: Zp = b·h²/4
 * For generic: Zp ≈ 1.15 × Iz/(h/2) (shape factor ~1.15 for I-beams)
 */
function computeMp(
  section: { a: number; iz: number; b?: number; h?: number },
  fy: number, // MPa
): number {
  const fyKPa = fy * 1000; // MPa → kPa (= kN/m²)

  if (section.b !== undefined && section.h !== undefined && section.b > 0 && section.h > 0) {
    // Rectangular: Zp = b·h²/4
    const Zp = section.b * section.h * section.h / 4; // m³
    return fyKPa * Zp; // kN·m
  }

  // Generic: estimate h from Iz and A, then Zp ≈ 1.15·Iz/(h/2)
  const h = Math.sqrt(12 * section.iz / section.a);
  const Sel = section.iz / (h / 2); // elastic section modulus
  const Zp = 1.15 * Sel; // ~shape factor for I-sections
  return fyKPa * Zp;
}

/**
 * Incremental plastic analysis (proportional loading, Event-to-Event strategy).
 *
 * Algorithm:
 * At each step, we solve the CURRENT (modified) structure under unit loads.
 * The resulting moments M_unit tell us the moment distribution per unit of
 * additional load factor. We find the smallest Δλ such that some section
 * reaches its plastic moment capacity Mp.
 *
 * The key subtlety: we track ACCUMULATED moments at each section end.
 * After forming a hinge and re-solving, the moment at the hinge location
 * drops to zero (hinge release), but all other accumulated moments are
 * preserved via superposition.
 *
 * Accumulated moment at section end = sum of (Δλᵢ × Mᵢ_unit) for all steps,
 * where Mᵢ_unit is the unit-load moment from that step's structural config.
 *
 * References:
 *   - Neal, B.G. "The Plastic Methods of Structural Analysis" (1977)
 *   - Horne, M.R. "Plastic Theory of Structures" (1979)
 *   - Livesley, R.K. "Matrix Methods of Structural Analysis" (1975), Ch. 9
 */
export function solvePlastic(
  input: SolverInput,
  sections: Map<number, { a: number; iz: number; b?: number; h?: number }>,
  materials: Map<number, { fy?: number }>,
  config?: PlasticConfig,
): PlasticResult | string {
  const maxHinges = config?.maxHinges ?? 20;
  const mpOverrides = config?.mpOverrides;

  // Plastic analysis requires frame elements (moment-carrying)
  const hasFrames = Array.from(input.elements.values()).some(e => e.type === 'frame');
  if (!hasFrames) {
    return t('plastic.requiresFrames');
  }

  // Compute Mp for each section
  const mpBySection = new Map<number, number>();
  for (const [secId, sec] of sections) {
    if (mpOverrides?.has(secId)) {
      mpBySection.set(secId, mpOverrides.get(secId)!);
      continue;
    }
    // Find a material with fy assigned to elements using this section
    let fy = 250; // default MPa
    for (const elem of input.elements.values()) {
      if (elem.sectionId === secId) {
        const mat = materials.get(elem.materialId);
        if (mat?.fy) { fy = mat.fy; break; }
      }
    }
    mpBySection.set(secId, computeMp(sec, fy));
  }

  // Compute degree of static indeterminacy using corrected formula
  const { degree: redundancy } = computeStaticDegree(input);

  // Working copy of elements (to add hinges incrementally)
  const workingElements = new Map<number, SolverElement>();
  for (const [id, elem] of input.elements) {
    workingElements.set(id, { ...elem });
  }

  const allHinges: PlasticHinge[] = [];
  const steps: PlasticStep[] = [];
  let cumulativeLambda = 0;
  let isMechanism = false;

  // Track accumulated moments at each element end: key = "elemId:start" or "elemId:end"
  const accumulatedMoments = new Map<string, number>();
  for (const [id] of input.elements) {
    accumulatedMoments.set(`${id}:start`, 0);
    accumulatedMoments.set(`${id}:end`, 0);
  }

  for (let step = 0; step < maxHinges; step++) {
    // Build modified input with current hinges
    const modInput: SolverInput = {
      ...input,
      elements: new Map(
        Array.from(workingElements.entries()).map(([id, e]) => [id, { ...e }]),
      ),
    };

    // Solve under unit loads on the modified structure
    let results: AnalysisResults;
    try {
      results = solve(modInput);
    } catch {
      // Solver failed → mechanism formed
      isMechanism = true;
      break;
    }

    // Find the element end(s) with the smallest Δλ to reach Mp
    // Δλ = (Mp - |M_accumulated|) / |M_unit|
    // Collect ALL candidates, then find the minimum and form all hinges at that Δλ
    const candidates: Array<{
      deltaLambda: number;
      elementId: number;
      end: 'start' | 'end';
      moment: number;
    }> = [];

    for (const ef of results.elementForces) {
      const elem = workingElements.get(ef.elementId);
      if (!elem) continue;
      const mp = mpBySection.get(elem.sectionId) ?? Infinity;
      if (mp <= 0) continue;

      // Check start end (only if no hinge already there)
      if (!elem.hingeStart && Math.abs(ef.mStart) > 1e-10) {
        const mAcc = accumulatedMoments.get(`${ef.elementId}:start`) ?? 0;
        const remaining = mp - Math.abs(mAcc);
        if (remaining > 0) {
          const deltaLambda = remaining / Math.abs(ef.mStart);
          if (deltaLambda > 0) {
            const signM = mAcc + deltaLambda * ef.mStart;
            candidates.push({
              deltaLambda,
              elementId: ef.elementId,
              end: 'start',
              moment: signM >= 0 ? mp : -mp,
            });
          }
        }
      }

      // Check end
      if (!elem.hingeEnd && Math.abs(ef.mEnd) > 1e-10) {
        const mAcc = accumulatedMoments.get(`${ef.elementId}:end`) ?? 0;
        const remaining = mp - Math.abs(mAcc);
        if (remaining > 0) {
          const deltaLambda = remaining / Math.abs(ef.mEnd);
          if (deltaLambda > 0) {
            const signM = mAcc + deltaLambda * ef.mEnd;
            candidates.push({
              deltaLambda,
              elementId: ef.elementId,
              end: 'end',
              moment: signM >= 0 ? mp : -mp,
            });
          }
        }
      }
    }

    if (candidates.length === 0) break;

    // Find minimum Δλ and all hinges forming at that Δλ (within tolerance)
    candidates.sort((a, b) => a.deltaLambda - b.deltaLambda);
    const minDeltaLambda = candidates[0].deltaLambda;
    if (minDeltaLambda <= 1e-15) break;

    const tol = minDeltaLambda * 0.01; // 1% tolerance for simultaneous hinges
    const simultaneousHinges = candidates.filter(c => c.deltaLambda <= minDeltaLambda + tol);

    cumulativeLambda += minDeltaLambda;

    // Update accumulated moments for ALL element ends
    for (const ef of results.elementForces) {
      const keyS = `${ef.elementId}:start`;
      const keyE = `${ef.elementId}:end`;
      accumulatedMoments.set(keyS, (accumulatedMoments.get(keyS) ?? 0) + minDeltaLambda * ef.mStart);
      accumulatedMoments.set(keyE, (accumulatedMoments.get(keyE) ?? 0) + minDeltaLambda * ef.mEnd);
    }

    const scaledResults = scaleResults(results, minDeltaLambda);

    // Form all simultaneous hinges
    for (const sh of simultaneousHinges) {
      const hinge: PlasticHinge = {
        elementId: sh.elementId,
        end: sh.end,
        moment: sh.moment,
        loadFactor: cumulativeLambda,
        step,
      };
      allHinges.push(hinge);

      // Insert hinge in working elements
      const elem = workingElements.get(sh.elementId)!;
      if (sh.end === 'start') {
        elem.hingeStart = true;
      } else {
        elem.hingeEnd = true;
      }
    }

    steps.push({
      loadFactor: cumulativeLambda,
      hingesFormed: [...allHinges],
      results: scaledResults,
    });

    // Check if next solve will fail (mechanism check)
    try {
      const testInput: SolverInput = {
        ...input,
        elements: new Map(
          Array.from(workingElements.entries()).map(([id, e]) => [id, { ...e }]),
        ),
      };
      solve(testInput);
    } catch {
      isMechanism = true;
      break;
    }
  }

  if (allHinges.length === 0) {
    return t('plastic.noHingesFormed');
  }

  return {
    collapseFactor: cumulativeLambda,
    steps,
    hinges: allHinges,
    isMechanism,
    redundancy,
  };
}

function scaleResults(r: AnalysisResults, factor: number): AnalysisResults {
  return {
    displacements: r.displacements.map(d => ({
      nodeId: d.nodeId,
      ux: d.ux * factor,
      uy: d.uy * factor,
      rz: d.rz * factor,
    })),
    reactions: r.reactions.map(rc => ({
      nodeId: rc.nodeId,
      rx: rc.rx * factor,
      ry: rc.ry * factor,
      mz: rc.mz * factor,
    })),
    elementForces: r.elementForces.map(ef => ({
      ...ef,
      nStart: ef.nStart * factor,
      nEnd: ef.nEnd * factor,
      vStart: ef.vStart * factor,
      vEnd: ef.vEnd * factor,
      mStart: ef.mStart * factor,
      mEnd: ef.mEnd * factor,
    })),
  };
}
