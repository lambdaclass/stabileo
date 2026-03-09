/**
 * WASM solver wrapper — replaces the pure-TS solver pipeline.
 * Serializes SolverInput (with Maps) → JSON → Rust/WASM → JSON → AnalysisResults.
 *
 * Uses dynamic imports so the app works without the WASM build (falls back to JS solver).
 */

import type { SolverInput, AnalysisResults, FullEnvelope } from './types';
import type { SolverInput3D, AnalysisResults3D, FullEnvelope3D } from './types-3d';

let wasmReady = false;
let wasmInitPromise: Promise<void> | null = null;

// Dynamically loaded WASM functions
let wasmSolve2d: ((json: string) => string) | null = null;
let wasmSolve3d: ((json: string) => string) | null = null;
let wasmSolvePdelta2d: ((json: string, maxIter: number, tolerance: number) => string) | null = null;
let wasmSolveBuckling2d: ((json: string, numModes: number) => string) | null = null;
let wasmSolveModal2d: ((json: string, numModes: number) => string) | null = null;
let wasmSolveSpectral2d: ((json: string) => string) | null = null;
let wasmSolvePlastic2d: ((json: string) => string) | null = null;
let wasmSolveMovingLoads2d: ((json: string) => string) | null = null;

/** Initialize the WASM module. Call once at app startup. */
export async function initSolver(): Promise<void> {
  if (wasmReady) return;
  if (wasmInitPromise) return wasmInitPromise;
  wasmInitPromise = (async () => {
    // Use a variable path so Rollup/Vite doesn't try to resolve at build time
    const wasmPath = '../wasm/dedaliano_engine';
    const wasm = await import(/* @vite-ignore */ wasmPath);
    await wasm.default();
    wasmSolve2d = wasm.solve_2d;
    wasmSolve3d = wasm.solve_3d;
    wasmSolvePdelta2d = wasm.solve_pdelta_2d;
    wasmSolveBuckling2d = wasm.solve_buckling_2d;
    wasmSolveModal2d = wasm.solve_modal_2d;
    wasmSolveSpectral2d = wasm.solve_spectral_2d;
    wasmSolvePlastic2d = wasm.solve_plastic_2d;
    wasmSolveMovingLoads2d = wasm.solve_moving_loads_2d;
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
  });
}

// ─── Solver functions ───────────────────────────────────────────

/** Solve 2D linear static analysis via WASM. */
export function solve(input: SolverInput): AnalysisResults {
  if (!wasmReady || !wasmSolve2d) throw new Error('WASM solver not initialized. Call initSolver() first.');
  const json = serializeInput2D(input);
  const resultJson = wasmSolve2d(json);
  return JSON.parse(resultJson);
}

/** Solve 3D linear static analysis via WASM. */
export function solve3D(input: SolverInput3D): AnalysisResults3D {
  if (!wasmReady || !wasmSolve3d) throw new Error('WASM solver not initialized. Call initSolver() first.');
  const json = serializeInput3D(input);
  const resultJson = wasmSolve3d(json);
  return JSON.parse(resultJson);
}

/** Solve 2D P-Delta analysis via WASM. */
export function solvePDelta(input: SolverInput, maxIter = 20, tolerance = 1e-4) {
  if (!wasmReady || !wasmSolvePdelta2d) throw new Error('WASM solver not initialized.');
  const json = serializeInput2D(input);
  const resultJson = wasmSolvePdelta2d(json, maxIter, tolerance);
  return JSON.parse(resultJson);
}

/** Solve 2D buckling analysis via WASM. */
export function solveBuckling(input: SolverInput, numModes = 4) {
  if (!wasmReady || !wasmSolveBuckling2d) throw new Error('WASM solver not initialized.');
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
  if (!wasmReady || !wasmSolveModal2d) throw new Error('WASM solver not initialized.');
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
  if (!wasmReady) throw new Error('WASM solver not available.');
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
  if (!wasmSolveSpectral2d) throw new Error('WASM solver not available.');
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
  if (!wasmReady) throw new Error('WASM solver not available.');
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
  if (!wasmSolvePlastic2d) throw new Error('WASM solver not available.');
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
  if (!wasmReady) throw new Error('WASM solver not available.');
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
  if (!wasmSolveMovingLoads2d) throw new Error('WASM solver not available.');
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
