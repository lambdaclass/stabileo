/**
 * WASM solver wrapper — replaces the pure-TS solver pipeline.
 * Serializes SolverInput (with Maps) → JSON → Rust/WASM → JSON → AnalysisResults.
 */

import initWasm, {
  solve_2d as wasmSolve2d,
  solve_3d as wasmSolve3d,
  solve_pdelta_2d as wasmSolvePdelta2d,
  solve_buckling_2d as wasmSolveBuckling2d,
  solve_modal_2d as wasmSolveModal2d,
  solve_spectral_2d as wasmSolveSpectral2d,
  solve_plastic_2d as wasmSolvePlastic2d,
  solve_moving_loads_2d as wasmSolveMovingLoads2d,
  analyze_kinematics_2d as wasmAnalyzeKinematics2d,
  analyze_kinematics_3d as wasmAnalyzeKinematics3d,
  combine_results_2d as wasmCombineResults2d,
  combine_results_3d as wasmCombineResults3d,
  compute_envelope_2d as wasmComputeEnvelope2d,
  compute_envelope_3d as wasmComputeEnvelope3d,
  compute_influence_line as wasmComputeInfluenceLine,
  compute_section_stress_2d as wasmComputeSectionStress2d,
  compute_section_stress_3d as wasmComputeSectionStress3d,
  extract_beam_stations as wasmExtractBeamStations,
  extract_beam_stations_3d as wasmExtractBeamStations3d,
  extract_beam_stations_grouped as wasmExtractBeamStationsGrouped,
  extract_beam_stations_grouped_3d as wasmExtractBeamStationsGrouped3d,
} from '../wasm/dedaliano_engine';

import type { SolverInput, AnalysisResults, FullEnvelope, BeamStationInput, BeamStationResult, GroupedBeamStationResult } from './types';
import type { SolverInput3D, AnalysisResults3D, FullEnvelope3D, BeamStationInput3D, BeamStationResult3D, GroupedBeamStationResult3D } from './types-3d';

let wasmReady = false;
let wasmInitPromise: Promise<void> | null = null;

/** Initialize the WASM module. Call once at app startup. */
export async function initSolver(): Promise<void> {
  if (wasmReady) return;
  if (wasmInitPromise) return wasmInitPromise;
  wasmInitPromise = (async () => {
    await initWasm();
    wasmReady = true;
  })();
  return wasmInitPromise;
}

/** Check if WASM solver is ready. */
export function isSolverReady(): boolean {
  return wasmReady;
}

// ─── Serialization helpers ──────────────────────────────────────

/** Convert Map<number, T> to { "key": T } for JSON serialization. */
export function mapToObj<T>(map: Map<number, T>): Record<string, T> {
  const obj: Record<string, T> = {};
  for (const [k, v] of map) {
    obj[String(k)] = v;
  }
  return obj;
}

/** Serialize SolverInput (with Maps) to JSON string for WASM. */
function serializeInput2D(input: SolverInput): string {
  return JSON.stringify({
    nodes: mapToObj(input.nodes),
    materials: mapToObj(input.materials),
    sections: mapToObj(input.sections),
    elements: mapToObj(input.elements),
    supports: mapToObj(input.supports),
    loads: input.loads,
  });
}

/** Serialize SolverInput3D (with Maps) to JSON string for WASM. */
function serializeInput3D(input: SolverInput3D): string {
  return JSON.stringify({
    nodes: mapToObj(input.nodes),
    materials: mapToObj(input.materials),
    sections: mapToObj(input.sections),
    elements: mapToObj(input.elements),
    supports: mapToObj(input.supports),
    loads: input.loads,
    leftHand: (input as any).leftHand,
  });
}

// ─── Solver functions ───────────────────────────────────────────

/** Solve 2D linear static analysis via WASM. */
export function solve(input: SolverInput): AnalysisResults {
  if (!wasmReady) throw new Error('WASM solver not initialized. Call initSolver() first.');
  const json = serializeInput2D(input);
  const resultJson = wasmSolve2d(json);
  return JSON.parse(resultJson);
}

/** Solve 3D linear static analysis via WASM. */
export function solve3D(input: SolverInput3D): AnalysisResults3D {
  if (!wasmReady) throw new Error('WASM solver not initialized. Call initSolver() first.');
  const json = serializeInput3D(input);
  const resultJson = wasmSolve3d(json);
  return JSON.parse(resultJson);
}

/** Solve 2D P-Delta analysis via WASM. */
export function solvePDelta(input: SolverInput, maxIter = 20, tolerance = 1e-4) {
  if (!wasmReady) throw new Error('WASM solver not initialized.');
  const json = serializeInput2D(input);
  const resultJson = wasmSolvePdelta2d(json, maxIter, tolerance);
  return JSON.parse(resultJson);
}

/** Solve 2D buckling analysis via WASM. */
export function solveBuckling(input: SolverInput, numModes = 4) {
  if (!wasmReady) throw new Error('WASM solver not initialized.');
  const json = serializeInput2D(input);
  const resultJson = wasmSolveBuckling2d(json, numModes);
  return JSON.parse(resultJson);
}

/** Solve 2D modal analysis via WASM. */
export function solveModal(
  input: SolverInput,
  densities: Map<number, number>,
  numModes = 6,
) {
  if (!wasmReady) throw new Error('WASM solver not initialized.');
  const payload = JSON.stringify({
    solver: {
      nodes: mapToObj(input.nodes),
      materials: mapToObj(input.materials),
      sections: mapToObj(input.sections),
      elements: mapToObj(input.elements),
      supports: mapToObj(input.supports),
      loads: input.loads,
    },
    densities: mapToObj(densities),
  });
  const resultJson = wasmSolveModal2d(payload, numModes);
  return JSON.parse(resultJson);
}

/** Solve 2D spectral analysis via WASM. */
export function solveSpectral(config: {
  solver: SolverInput;
  modes: any[];
  densities: Map<number, number>;
  spectrum: { name: string; points: { period: number; sa: number }[]; inG?: boolean };
  direction: 'X' | 'Y';
  rule?: 'SRSS' | 'CQC';
  xi?: number;
  importanceFactor?: number;
  reductionFactor?: number;
}) {
  if (!wasmReady) throw new Error('WASM solver not initialized.');
  const payload = JSON.stringify({
    solver: {
      nodes: mapToObj(config.solver.nodes),
      materials: mapToObj(config.solver.materials),
      sections: mapToObj(config.solver.sections),
      elements: mapToObj(config.solver.elements),
      supports: mapToObj(config.solver.supports),
      loads: config.solver.loads,
    },
    modes: config.modes,
    densities: mapToObj(config.densities),
    spectrum: config.spectrum,
    direction: config.direction,
    rule: config.rule,
    xi: config.xi,
    importanceFactor: config.importanceFactor,
    reductionFactor: config.reductionFactor,
  });
  const resultJson = wasmSolveSpectral2d(payload);
  return JSON.parse(resultJson);
}

/** Solve 2D plastic analysis via WASM. */
export function solvePlastic(config: {
  solver: SolverInput;
  sections: Map<number, { a: number; iz: number; materialId: number; b?: number; h?: number }>;
  materials: Map<number, { fy?: number }>;
  maxHinges?: number;
  mpOverrides?: Map<number, number>;
}) {
  if (!wasmReady) throw new Error('WASM solver not initialized.');
  const payload = JSON.stringify({
    solver: {
      nodes: mapToObj(config.solver.nodes),
      materials: mapToObj(config.solver.materials),
      sections: mapToObj(config.solver.sections),
      elements: mapToObj(config.solver.elements),
      supports: mapToObj(config.solver.supports),
      loads: config.solver.loads,
    },
    sections: mapToObj(config.sections),
    materials: mapToObj(config.materials),
    maxHinges: config.maxHinges,
    mpOverrides: config.mpOverrides ? mapToObj(config.mpOverrides) : undefined,
  });
  const resultJson = wasmSolvePlastic2d(payload);
  return JSON.parse(resultJson);
}

/** Solve 2D moving loads analysis via WASM. */
export function solveMovingLoads(config: {
  solver: SolverInput;
  train: { name: string; axles: { offset: number; weight: number }[] };
  step?: number;
  pathElementIds?: number[];
}) {
  if (!wasmReady) throw new Error('WASM solver not initialized.');
  const payload = JSON.stringify({
    solver: {
      nodes: mapToObj(config.solver.nodes),
      materials: mapToObj(config.solver.materials),
      sections: mapToObj(config.solver.sections),
      elements: mapToObj(config.solver.elements),
      supports: mapToObj(config.solver.supports),
      loads: config.solver.loads,
    },
    train: config.train,
    step: config.step,
    pathElementIds: config.pathElementIds,
  });
  const resultJson = wasmSolveMovingLoads2d(payload);
  return JSON.parse(resultJson);
}

// ─── Kinematic analysis ──────────────────────────────────────────

/** Analyze 2D kinematic stability via WASM. */
export function analyzeKinematics(input: SolverInput) {
  if (!wasmReady) throw new Error('WASM solver not initialized.');
  const json = serializeInput2D(input);
  return JSON.parse(wasmAnalyzeKinematics2d(json));
}

/** Analyze 3D kinematic stability via WASM. */
export function analyzeKinematics3D(input: SolverInput3D) {
  if (!wasmReady) throw new Error('WASM solver not initialized.');
  const json = serializeInput3D(input);
  return JSON.parse(wasmAnalyzeKinematics3d(json));
}

// ─── Combinations & Envelope ─────────────────────────────────────

/** Combine 2D results with factors via WASM. */
export function combineResults(
  factors: Array<{ caseId: number; factor: number }>,
  perCase: Map<number, AnalysisResults>,
): AnalysisResults | null {
  if (!wasmReady) throw new Error('WASM solver not initialized.');
  const cases = factors
    .filter(f => perCase.has(f.caseId))
    .map(f => ({ caseId: f.caseId, results: perCase.get(f.caseId)! }));
  if (cases.length === 0) return null;
  const payload = JSON.stringify({ factors, cases });
  const result = wasmCombineResults2d(payload);
  return JSON.parse(result);
}

/** Combine 3D results with factors via WASM. */
export function combineResults3D(
  factors: Array<{ caseId: number; factor: number }>,
  perCase: Map<number, AnalysisResults3D>,
): AnalysisResults3D | null {
  if (!wasmReady) throw new Error('WASM solver not initialized.');
  const cases = factors
    .filter(f => perCase.has(f.caseId))
    .map(f => ({ caseId: f.caseId, results: perCase.get(f.caseId)! }));
  if (cases.length === 0) return null;
  const payload = JSON.stringify({ factors, cases });
  const result = wasmCombineResults3d(payload);
  return JSON.parse(result);
}

/** Compute 2D envelope via WASM. */
export function computeEnvelope(results: AnalysisResults[]): FullEnvelope | null {
  if (!wasmReady) throw new Error('WASM solver not initialized.');
  if (results.length === 0) return null;
  const payload = JSON.stringify({ results });
  return JSON.parse(wasmComputeEnvelope2d(payload));
}

/** Compute 3D envelope via WASM. */
export function computeEnvelope3D(results: AnalysisResults3D[]): FullEnvelope3D | null {
  if (!wasmReady) throw new Error('WASM solver not initialized.');
  if (results.length === 0) return null;
  const payload = JSON.stringify({ results });
  return JSON.parse(wasmComputeEnvelope3d(payload));
}

// ─── Influence Lines ─────────────────────────────────────────────

/** Compute influence line via WASM. Takes a pre-built InfluenceLineInput object. */
export function computeInfluenceLineWasm(ilInput: {
  solver: SolverInput;
  quantity: string;
  targetNodeId?: number;
  targetElementId?: number;
  targetPosition?: number;
  nPointsPerElement?: number;
}) {
  if (!wasmReady) throw new Error('WASM solver not initialized.');
  const payload = JSON.stringify({
    solver: {
      nodes: mapToObj(ilInput.solver.nodes),
      materials: mapToObj(ilInput.solver.materials),
      sections: mapToObj(ilInput.solver.sections),
      elements: mapToObj(ilInput.solver.elements),
      supports: mapToObj(ilInput.solver.supports),
      loads: ilInput.solver.loads,
    },
    quantity: ilInput.quantity,
    targetNodeId: ilInput.targetNodeId,
    targetElementId: ilInput.targetElementId,
    targetPosition: ilInput.targetPosition ?? 0.5,
    nPointsPerElement: ilInput.nPointsPerElement ?? 20,
  });
  return JSON.parse(wasmComputeInfluenceLine(payload));
}

// ─── Section Stress ──────────────────────────────────────────────

/** Compute 2D section stress via WASM. Takes pre-resolved geometry. */
export function computeSectionStress2D(input: {
  elementForces: any;
  section: any;
  fy?: number | null;
  t: number;
  yFiber?: number | null;
}) {
  if (!wasmReady) throw new Error('WASM solver not initialized.');
  return JSON.parse(wasmComputeSectionStress2d(JSON.stringify(input)));
}

/** Compute 3D section stress via WASM. Takes pre-resolved geometry. */
export function computeSectionStress3D(input: any) {
  if (!wasmReady) throw new Error('WASM solver not initialized.');
  return JSON.parse(wasmComputeSectionStress3d(JSON.stringify(input)));
}

// ─── Beam Station Extraction ─────────────────────────────────────

/** Extract 2D beam design stations with per-combo forces and governing values. */
export function extractBeamStations(input: BeamStationInput): BeamStationResult {
  if (!wasmReady) throw new Error('WASM solver not initialized.');
  return JSON.parse(wasmExtractBeamStations(JSON.stringify(input)));
}

/** Extract 3D beam design stations with per-combo forces and governing values. */
export function extractBeamStations3D(input: BeamStationInput3D): BeamStationResult3D {
  if (!wasmReady) throw new Error('WASM solver not initialized.');
  return JSON.parse(wasmExtractBeamStations3d(JSON.stringify(input)));
}

/** Extract 2D beam stations grouped by member with member-level governing summaries. */
export function extractBeamStationsGrouped(input: BeamStationInput): GroupedBeamStationResult {
  if (!wasmReady) throw new Error('WASM solver not initialized.');
  return JSON.parse(wasmExtractBeamStationsGrouped(JSON.stringify(input)));
}

/** Extract 3D beam stations grouped by member with member-level governing summaries. */
export function extractBeamStationsGrouped3D(input: BeamStationInput3D): GroupedBeamStationResult3D {
  if (!wasmReady) throw new Error('WASM solver not initialized.');
  return JSON.parse(wasmExtractBeamStationsGrouped3d(JSON.stringify(input)));
}
