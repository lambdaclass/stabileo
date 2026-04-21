/**
 * Shared verification service — centralized station-based demand computation
 * and verification orchestration for PRO mode.
 *
 * Phase 1 (current): Eliminates the divergence between ProDesignTab (station-based)
 * and ProVerificationTab (endpoint-only) by routing both through the same
 * station-based force extraction and CIRSOC JS verification.
 *
 * Phase 2 target (requires solver changes — not implemented here):
 *   The solver (Rust/WASM) should own the full pipeline via a unified
 *   `verify_members` WASM export (§13.5 of SOLVER_APP_COVERAGE_MAP.md).
 *   When that exists, this service becomes a thin wrapper:
 *     computeStationDemands → deleted (solver does it internally)
 *     runUnifiedVerification → calls WASM verify_members instead of JS autoVerifyFromResults
 *
 * Temporary app-side bridges in this module:
 *   - Station extraction is JS-side (should be solver-side beam_stations → design_demands)
 *   - CIRSOC verification is JS-side cirsoc201.ts (~600 LOC that Phase 3 would delete)
 *   - autoVerifyFromResults is the JS orchestrator (Phase 3 replaces with WASM call)
 */

import type { AnalysisResults3D } from './types-3d';
import type { LoadCombination } from '../store/model.svelte';
import {
  extractElementStations,
  extractGoverningDemands,
  type ElementDesignDemands,
  type ElementStationResult,
} from './station-design-forces';
import { autoVerifyFromResults, type AutoVerifyModelData } from './auto-verify';
import { classifyElement, type ElementVerification } from './codes/argentina/cirsoc201';
import { verifySteelElement, type SteelVerification, type SteelVerificationInput, type SteelDesignParams } from './codes/argentina/cirsoc301';
import type { GoverningPerElement3D } from './governing-case';
import type { CheckStatus, MemberDesignResult, DesignCheckSummary } from './design-check-results';

// ─── Station Demands ─────────────────────────────────────────

export interface StationDemandData {
  demands: Map<number, ElementDesignDemands>;
  stations: Map<number, ElementStationResult>;
}

/**
 * Compute station-based demands for all elements from per-combination 3D results.
 *
 * This is the canonical force-extraction path that both Design and Verification
 * should use. It evaluates interior stations (midspan, quarter points, load
 * positions, zero-shear points) across all combinations, preserving moment sign
 * and full concurrent force tuples.
 *
 * @param perCombo3D Per-combination results from resultsStore
 * @param combinations Model combinations (for name lookup)
 * @returns Station data for all elements, or empty maps if no combinations
 */
export function computeStationDemands(
  perCombo3D: Map<number, AnalysisResults3D>,
  combinations: LoadCombination[],
): StationDemandData {
  const demands = new Map<number, ElementDesignDemands>();
  const stations = new Map<number, ElementStationResult>();

  if (perCombo3D.size === 0) return { demands, stations };

  const comboNames = new Map<number, string>();
  for (const c of combinations) comboNames.set(c.id, c.name);

  const firstCombo = perCombo3D.values().next().value;
  if (!firstCombo) return { demands, stations };

  for (const ef of firstCombo.elementForces) {
    const esr = extractElementStations(ef.elementId, perCombo3D, comboNames);
    if (esr) {
      stations.set(ef.elementId, esr);
      demands.set(ef.elementId, extractGoverningDemands(esr));
    }
  }

  return { demands, stations };
}

// ─── Unified Verification ────────────────────────────────────

/**
 * Run CIRSOC 201 verification for all concrete elements using station-based
 * demands when available (the preferred path).
 *
 * This replaces the two divergent verification calls that previously lived in
 * ProDesignTab (station-aware) and ProVerificationTab (endpoint-only).
 *
 * @param results3D Solver analysis results
 * @param model Model data (elements, nodes, sections, materials, supports)
 * @param governing Optional governing combo metadata
 * @param stationDemands Pre-computed station demands (from computeStationDemands)
 * @returns Array of ElementVerification results
 */
export function runUnifiedVerification(
  results3D: AnalysisResults3D,
  model: AutoVerifyModelData,
  governing: Map<number, GoverningPerElement3D> | null,
  stationDemands?: Map<number, ElementDesignDemands>,
): ElementVerification[] {
  const { concrete } = autoVerifyFromResults(
    results3D,
    model,
    governing,
    undefined,
    stationDemands,
  );
  return concrete;
}

// ─── Full Design Orchestration ────────────────────────────────

import {
  normalizeCirsoc201, buildDesignSummary,
  type MemberDesignResult as MemberResult,
} from './design-check-results';
import { DESIGN_CODES, type DesignCodeId } from './codes/index';
import { verificationStore } from '../store/verification.svelte';

/**
 * Run the complete CIRSOC design pipeline: verification + normalization + store update.
 *
 * This is the single entry point for Design tab's "Run Design" action when using
 * CIRSOC. It replaces the multi-step inline logic that was in ProDesignTab.
 *
 * TEMPORARY Phase 1 bridge: Orchestrates JS-side verification + normalization.
 * Phase 2 target: WASM verify_members returns VerificationReport directly;
 * this function becomes a thin wrapper that stores the result.
 */
export function runCirsocDesign(
  results3D: AnalysisResults3D,
  model: AutoVerifyModelData,
  stationDemands: Map<number, ElementDesignDemands> | undefined,
  sectionNames: Map<number, string>,
  governing: Map<number, GoverningPerElement3D> | null,
): { normalized: MemberResult[]; concrete: ElementVerification[] } {
  const concrete = runUnifiedVerification(results3D, model, governing, stationDemands);
  const normalized = normalizeCirsoc201(concrete, sectionNames);

  // Update stores — single source of truth
  verificationStore.setConcrete(concrete);
  const codeInfo = DESIGN_CODES.find(c => c.id === 'cirsoc');
  const summaryData = buildDesignSummary(normalized, 'cirsoc', codeInfo?.label ?? 'CIRSOC');
  verificationStore.setDesignResults(summaryData.results, summaryData);

  return { normalized, concrete };
}

// ─── Steel Verification (reduced divergence) ─────────────────

/**
 * Run CIRSOC 301 steel verification for all steel elements.
 *
 * TEMPORARY Phase 1 bridge: Uses station-based demands for force extraction
 * (same source as RC), reducing the divergence with the RC path. The verification
 * itself is still JS-side cirsoc301.ts.
 *
 * Phase 2 target: Unified WASM verify_members handles both RC and steel.
 */
export function runSteelVerification(
  results3D: AnalysisResults3D,
  model: AutoVerifyModelData,
  stationDemands?: Map<number, ElementDesignDemands>,
): SteelVerification[] {
  const verifs: SteelVerification[] = [];

  for (const ef of results3D.elementForces) {
    const elem = model.elements.get(ef.elementId);
    if (!elem) continue;
    const section = model.sections.get(elem.sectionId);
    const material = model.materials.get(elem.materialId);
    if (!section || !material) continue;
    if (!material.fy || material.fy <= 80) continue; // RC, not steel

    const nI = model.nodes.get(elem.nodeI);
    const nJ = model.nodes.get(elem.nodeJ);
    if (!nI || !nJ) continue;
    const dx = nJ.x - nI.x, dy = nJ.y - nI.y, dz = (nJ.z ?? 0) - (nI.z ?? 0);
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (L <= 0) continue;

    // Use station demands when available (same path as RC), fallback to endpoints
    let NuMax: number, MuzMax: number, MuyMax: number, VuMax: number;
    const sd = stationDemands?.get(ef.elementId);
    if (sd) {
      const dems = sd.demands;
      NuMax = Math.max(
        dems.find(d => d.category === 'N_compression')?.value ?? 0,
        dems.find(d => d.category === 'N_tension')?.value ?? 0,
      );
      MuzMax = Math.max(
        dems.find(d => d.category === 'Mz+')?.value ?? 0,
        dems.find(d => d.category === 'Mz-')?.value ?? 0,
      );
      MuyMax = Math.max(
        dems.find(d => d.category === 'My+')?.value ?? 0,
        dems.find(d => d.category === 'My-')?.value ?? 0,
      );
      VuMax = Math.max(
        dems.find(d => d.category === 'Vy')?.value ?? 0,
        dems.find(d => d.category === 'Vz')?.value ?? 0,
      );
    } else {
      // Endpoint fallback (same as legacy path)
      NuMax = Math.max(Math.abs(ef.nStart), Math.abs(ef.nEnd));
      MuzMax = Math.max(Math.abs(ef.mzStart), Math.abs(ef.mzEnd));
      MuyMax = Math.max(Math.abs(ef.myStart), Math.abs(ef.myEnd));
      VuMax = Math.max(Math.abs(ef.vyStart), Math.abs(ef.vyEnd), Math.abs(ef.vzStart), Math.abs(ef.vzEnd));
    }

    const sdp: SteelDesignParams = {
      Fy: material.fy,
      Fu: (material as any).fu ?? material.fy * 1.25,
      E: material.e,
      A: section.a,
      Iz: section.iz,
      Iy: section.iy ?? section.iz,
      h: section.h ?? 0.3,
      b: section.b ?? 0.15,
      tw: (section as any).tw ?? (section.b ? section.b / 10 : 0.01),
      tf: (section as any).tf ?? (section.b ? section.b / 15 : 0.01),
      L, Lb: L,
      J: section.j ?? 0,
    };

    verifs.push(verifySteelElement({
      elementId: ef.elementId, Nu: NuMax, Muy: MuyMax, Muz: MuzMax, Vu: VuMax, params: sdp,
    }));
  }

  return verifs;
}

// ─── Unified VerificationReport ──────────────────────────────

/**
 * Unified verification report — app-side shape that mirrors the eventual
 * solver-side VerificationReport (§13.6 of SOLVER_APP_COVERAGE_MAP.md).
 *
 * Phase 1 (current): Assembled from JS-side verification results.
 * Phase 2 target: Returned directly from WASM verify_members.
 *
 * The shape is designed so that when the solver takes over:
 *   - `elements` maps directly to the Rust VerificationReport.elements
 *   - `summary` maps to aggregate counts
 *   - UI components consume this without knowing the source (JS or WASM)
 */
export interface VerificationReport {
  /** Code used for this verification run */
  codeId: string;
  codeName: string;
  /** Per-element normalized results (same shape regardless of source) */
  elements: MemberDesignResult[];
  /** Aggregate summary */
  summary: DesignCheckSummary;
  /** Station-based demands used for this run (absent in future WASM path) */
  stationData?: StationDemandData;
  /** Legacy CIRSOC-specific results (kept during Phase 1 for detailed memos/drawings) */
  concreteDetails?: ElementVerification[];
  /** Legacy CIRSOC 301 steel results */
  steelDetails?: SteelVerification[];
}

/**
 * Build a complete VerificationReport from the current app-side verification flow.
 *
 * This is the single function that assembles everything — demands, RC verification,
 * steel verification, normalization — into one report. Components should call this
 * instead of assembling pieces themselves.
 *
 * TEMPORARY Phase 1 bridge: Orchestrates multiple JS-side verification calls.
 * Phase 2 target: Single WASM call returns the report directly.
 */
