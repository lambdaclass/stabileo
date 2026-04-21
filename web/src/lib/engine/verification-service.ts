/**
 * Shared verification service — centralized station-based demand computation
 * and verification orchestration for PRO mode.
 *
 * This module eliminates the divergence between ProDesignTab (station-based)
 * and ProVerificationTab (endpoint-only) by providing a single source of truth
 * for force extraction and CIRSOC verification.
 *
 * Architecture note (from SOLVER_APP_COVERAGE_MAP.md §13):
 *   Eventually the solver (Rust/WASM) will own the full verification pipeline
 *   via a unified `verify_members` export. This service is the app-side
 *   intermediate step: it centralizes the computation so the UI components
 *   become render-only consumers. When the solver takes over, this service
 *   becomes a thin wrapper around the WASM call.
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
import type { ElementVerification } from './codes/argentina/cirsoc201';
import type { GoverningPerElement3D } from './governing-case';

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
