// Plastic analysis — incremental plastic hinge method

import type { SolverInput, SolverElement, SolverLoad, SolverNode, AnalysisResults, ElementForces } from './types';
import { solve, computeStaticDegree } from './solver-js';
import { t } from '../i18n';

export interface PlasticHinge {
  elementId: number;
  end: 'start' | 'end';
  moment: number;    // kN·m (moment at hinge formation)
  loadFactor: number; // cumulative load factor at formation
  step: number;
  /** Position along the original element (0 = start, 1 = end). Used for interior hinges. */
  position?: number;
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

// ─── Mesh refinement for interior plastic hinges ─────────────────

const N_SEG = 4; // Split each frame element into 4 sub-elements

interface RefinementMap {
  refined: SolverInput;
  /** refined element ID → original element ID */
  toOrig: Map<number, number>;
  /** refined element ID → { segment index (0-based), total segments } */
  segInfo: Map<number, { seg: number; nSeg: number }>;
  /** original element IDs (for filtering results) */
  originalNodeIds: Set<number>;
}

function refineInput(input: SolverInput): RefinementMap {
  let nextNodeId = Math.max(0, ...input.nodes.keys()) + 10000;
  let nextElemId = Math.max(0, ...input.elements.keys()) + 10000;

  const newNodes = new Map(input.nodes);
  const newElements = new Map<number, SolverElement>();
  const newLoads: SolverLoad[] = [];
  const toOrig = new Map<number, number>();
  const segInfo = new Map<number, { seg: number; nSeg: number }>();
  const originalNodeIds = new Set(input.nodes.keys());

  // Map original element ID → ordered list of sub-element IDs
  const origToSubs = new Map<number, number[]>();

  for (const [elemId, elem] of input.elements) {
    if (elem.type !== 'frame') {
      newElements.set(elemId, { ...elem });
      toOrig.set(elemId, elemId);
      segInfo.set(elemId, { seg: 0, nSeg: 1 });
      origToSubs.set(elemId, [elemId]);
      continue;
    }

    const nI = input.nodes.get(elem.nodeI)!;
    const nJ = input.nodes.get(elem.nodeJ)!;
    const dx = nJ.x - nI.x;
    const dy = nJ.y - nI.y;

    // Create intermediate nodes
    const segNodeIds: number[] = [elem.nodeI];
    for (let s = 1; s < N_SEG; s++) {
      const frac = s / N_SEG;
      const id = nextNodeId++;
      newNodes.set(id, { id, x: nI.x + frac * dx, y: nI.y + frac * dy });
      segNodeIds.push(id);
    }
    segNodeIds.push(elem.nodeJ);

    // Create sub-elements
    const subIds: number[] = [];
    for (let s = 0; s < N_SEG; s++) {
      const id = nextElemId++;
      newElements.set(id, {
        id,
        type: 'frame',
        nodeI: segNodeIds[s],
        nodeJ: segNodeIds[s + 1],
        materialId: elem.materialId,
        sectionId: elem.sectionId,
        hingeStart: s === 0 ? elem.hingeStart : false,
        hingeEnd: s === N_SEG - 1 ? elem.hingeEnd : false,
      });
      toOrig.set(id, elemId);
      segInfo.set(id, { seg: s, nSeg: N_SEG });
      subIds.push(id);
    }
    origToSubs.set(elemId, subIds);
  }

  // Redistribute loads
  for (const load of input.loads) {
    if (load.type === 'nodal') {
      newLoads.push(load);
    } else if (load.type === 'distributed') {
      const subs = origToSubs.get(load.data.elementId);
      if (!subs) continue;
      if (subs.length === 1 && subs[0] === load.data.elementId) {
        newLoads.push(load);
        continue;
      }
      for (let s = 0; s < subs.length; s++) {
        const frac0 = s / N_SEG;
        const frac1 = (s + 1) / N_SEG;
        const qStart = load.data.qI + (load.data.qJ - load.data.qI) * frac0;
        const qEnd = load.data.qI + (load.data.qJ - load.data.qI) * frac1;
        newLoads.push({
          type: 'distributed',
          data: { elementId: subs[s], qI: qStart, qJ: qEnd },
        });
      }
    } else if (load.type === 'pointOnElement') {
      const subs = origToSubs.get(load.data.elementId);
      if (!subs || subs.length <= 1) { newLoads.push(load); continue; }
      const elem = input.elements.get(load.data.elementId)!;
      const nI = input.nodes.get(elem.nodeI)!;
      const nJ = input.nodes.get(elem.nodeJ)!;
      const L = Math.sqrt((nJ.x - nI.x) ** 2 + (nJ.y - nI.y) ** 2);
      const segLen = L / N_SEG;
      const segIdx = Math.min(Math.floor(load.data.a / segLen), N_SEG - 1);
      const localA = load.data.a - segIdx * segLen;
      newLoads.push({
        type: 'pointOnElement',
        data: { ...load.data, elementId: subs[segIdx], a: localA },
      });
    } else if (load.type === 'thermal') {
      const subs = origToSubs.get(load.data.elementId);
      if (!subs) continue;
      for (const subId of subs) {
        newLoads.push({
          type: 'thermal',
          data: { ...load.data, elementId: subId },
        });
      }
    }
  }

  return {
    refined: {
      nodes: newNodes,
      materials: input.materials,
      sections: input.sections,
      elements: newElements,
      supports: input.supports,
      loads: newLoads,
    },
    toOrig,
    segInfo,
    originalNodeIds,
  };
}

/**
 * Map a hinge on a refined sub-element back to the original element.
 * Returns the position (0–1) along the original element.
 */
function mapHingeBack(
  hingeElemId: number,
  hingeEnd: 'start' | 'end',
  ref: RefinementMap,
): { origElemId: number; position: number; end: 'start' | 'end' } {
  const origId = ref.toOrig.get(hingeElemId) ?? hingeElemId;
  const info = ref.segInfo.get(hingeElemId);
  if (!info || info.nSeg === 1) {
    return { origElemId: origId, position: hingeEnd === 'start' ? 0 : 1, end: hingeEnd };
  }
  const seg = info.seg;
  const frac = hingeEnd === 'start' ? seg / info.nSeg : (seg + 1) / info.nSeg;
  // Map to 'start'/'end' only if at the actual endpoints
  const end: 'start' | 'end' = frac <= 0.001 ? 'start' : frac >= 0.999 ? 'end' : 'end';
  return { origElemId: origId, position: frac, end };
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
 * The mesh is automatically refined (each frame element → 4 sub-elements)
 * so that interior plastic hinges (e.g. midspan of a beam with distributed
 * load) are detected correctly.
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

  // Refine mesh to capture interior plastic hinges
  const ref = refineInput(input);
  const refinedInput = ref.refined;

  // Compute Mp for each section (uses original element→material mapping)
  const mpBySection = new Map<number, number>();
  for (const [secId, sec] of sections) {
    if (mpOverrides?.has(secId)) {
      mpBySection.set(secId, mpOverrides.get(secId)!);
      continue;
    }
    let fy = 250; // default MPa
    for (const elem of input.elements.values()) {
      if (elem.sectionId === secId) {
        const mat = materials.get(elem.materialId);
        if (mat?.fy) { fy = mat.fy; break; }
      }
    }
    mpBySection.set(secId, computeMp(sec, fy));
  }

  // Compute degree of static indeterminacy on ORIGINAL structure
  const { degree: redundancy } = computeStaticDegree(input);

  // Working copy of refined elements (to add hinges incrementally)
  const workingElements = new Map<number, SolverElement>();
  for (const [id, elem] of refinedInput.elements) {
    workingElements.set(id, { ...elem });
  }

  const allHinges: PlasticHinge[] = [];
  const steps: PlasticStep[] = [];
  let cumulativeLambda = 0;
  let isMechanism = false;

  // Track accumulated moments at each element end
  const accumulatedMoments = new Map<string, number>();
  for (const [id] of refinedInput.elements) {
    accumulatedMoments.set(`${id}:start`, 0);
    accumulatedMoments.set(`${id}:end`, 0);
  }

  for (let step = 0; step < maxHinges; step++) {
    // Build modified input with current hinges
    const modInput: SolverInput = {
      ...refinedInput,
      elements: new Map(
        Array.from(workingElements.entries()).map(([id, e]) => [id, { ...e }]),
      ),
    };

    // Solve under unit loads on the modified structure
    let results: AnalysisResults;
    try {
      results = solve(modInput);
    } catch {
      isMechanism = true;
      break;
    }

    // Find the element end(s) with the smallest Δλ to reach Mp
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

    const tol = minDeltaLambda * 0.01;
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

    // Form all simultaneous hinges — map back to original elements
    const stepHinges: PlasticHinge[] = [];
    for (const sh of simultaneousHinges) {
      const mapped = mapHingeBack(sh.elementId, sh.end, ref);
      const hinge: PlasticHinge = {
        elementId: mapped.origElemId,
        end: mapped.end,
        moment: sh.moment,
        loadFactor: cumulativeLambda,
        step,
        position: mapped.position,
      };
      allHinges.push(hinge);
      stepHinges.push(hinge);

      // Insert hinge in working elements (on the refined sub-element)
      const elem = workingElements.get(sh.elementId)!;
      if (sh.end === 'start') {
        elem.hingeStart = true;
      } else {
        elem.hingeEnd = true;
      }
    }

    // Map step results back: filter displacements to original nodes,
    // and aggregate sub-element forces to original elements
    const mappedResults = mapResultsBack(scaledResults, ref, input);

    steps.push({
      loadFactor: cumulativeLambda,
      hingesFormed: [...allHinges],
      results: mappedResults,
    });

    // Check if next solve will fail (mechanism check)
    try {
      const testInput: SolverInput = {
        ...refinedInput,
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

/**
 * Map refined mesh results back to original element IDs.
 * Sub-element forces are aggregated: first sub-element's start → original start,
 * last sub-element's end → original end.
 */
function mapResultsBack(
  results: AnalysisResults,
  ref: RefinementMap,
  origInput: SolverInput,
): AnalysisResults {
  // Displacements: keep only original nodes
  const displacements = results.displacements.filter(d => ref.originalNodeIds.has(d.nodeId));

  // Reactions: already on original nodes
  const reactions = results.reactions;

  // Element forces: group by original element and merge
  const forcesByOrig = new Map<number, ElementForces[]>();
  for (const ef of results.elementForces) {
    const origId = ref.toOrig.get(ef.elementId) ?? ef.elementId;
    if (!forcesByOrig.has(origId)) forcesByOrig.set(origId, []);
    forcesByOrig.get(origId)!.push(ef);
  }

  const elementForces: ElementForces[] = [];
  for (const [origId, subForces] of forcesByOrig) {
    // Sort sub-element forces by segment index
    subForces.sort((a, b) => {
      const sa = ref.segInfo.get(a.elementId)?.seg ?? 0;
      const sb = ref.segInfo.get(b.elementId)?.seg ?? 0;
      return sa - sb;
    });
    const first = subForces[0];
    const last = subForces[subForces.length - 1];
    const totalLength = subForces.reduce((s, f) => s + f.length, 0);

    elementForces.push({
      elementId: origId,
      nStart: first.nStart,
      nEnd: last.nEnd,
      vStart: first.vStart,
      vEnd: last.vEnd,
      mStart: first.mStart,
      mEnd: last.mEnd,
      length: totalLength,
      qI: first.qI,
      qJ: last.qJ,
      pointLoads: first.pointLoads,
      distributedLoads: first.distributedLoads,
      hingeStart: first.hingeStart,
      hingeEnd: last.hingeEnd,
    });
  }

  return { displacements, reactions, elementForces };
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
