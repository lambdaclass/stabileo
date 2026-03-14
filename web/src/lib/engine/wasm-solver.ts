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

// 2D advanced analysis WASM functions
let wasmSolveCorotational2d: ((json: string, maxIter: number, tolerance: number, nIncrements: number) => string) | null = null;
let wasmSolveNonlinearMaterial2d: ((json: string) => string) | null = null;
let wasmSolveTimeHistory2d: ((json: string) => string) | null = null;

// 3D solver WASM functions
let wasmSolvePdelta3d: ((json: string, maxIter: number, tolerance: number) => string) | null = null;
let wasmSolveModal3d: ((json: string, numModes: number) => string) | null = null;
let wasmSolveBuckling3d: ((json: string, numModes: number) => string) | null = null;
let wasmSolveSpectral3d: ((json: string) => string) | null = null;

// Kinematics
let wasmAnalyzeKinematics2d: ((json: string) => string) | null = null;
let wasmAnalyzeKinematics3d: ((json: string) => string) | null = null;

// Combinations & Envelope
let wasmCombineResults2d: ((json: string) => string) | null = null;
let wasmCombineResults3d: ((json: string) => string) | null = null;
let wasmComputeEnvelope2d: ((json: string) => string) | null = null;
let wasmComputeEnvelope3d: ((json: string) => string) | null = null;

// Influence Lines
let wasmComputeInfluenceLine: ((json: string) => string) | null = null;

// Section Stress
let wasmComputeSectionStress2d: ((json: string) => string) | null = null;
let wasmComputeSectionStress3d: ((json: string) => string) | null = null;

// Diagrams & Deformed Shape
let wasmComputeDiagrams2d: ((json: string) => string) | null = null;
let wasmComputeDiagrams3d: ((json: string) => string) | null = null;
let wasmComputeDeformedShape: ((json: string) => string) | null = null;

// 3D advanced solver WASM functions
let wasmSolveCorotational3d: ((json: string, maxIter: number, tolerance: number, nIncrements: number) => string) | null = null;
let wasmSolveNonlinearMaterial3d: ((json: string) => string) | null = null;
let wasmSolveTimeHistory3d: ((json: string) => string) | null = null;
let wasmSolvePlastic3d: ((json: string) => string) | null = null;
let wasmSolveMovingLoads3d: ((json: string) => string) | null = null;

// Constrained / contact / SSI / Winkler solvers
let wasmSolveConstrained2d: ((json: string) => string) | null = null;
let wasmSolveConstrained3d: ((json: string) => string) | null = null;
let wasmSolveContact2d: ((json: string) => string) | null = null;
let wasmSolveContact3d: ((json: string) => string) | null = null;
let wasmSolveSsi2d: ((json: string) => string) | null = null;
let wasmSolveSsi3d: ((json: string) => string) | null = null;
let wasmSolveWinkler2d: ((json: string) => string) | null = null;
let wasmSolveWinkler3d: ((json: string) => string) | null = null;

// Fiber nonlinear solvers
let wasmSolveFiberNonlinear2d: ((json: string) => string) | null = null;
let wasmSolveFiberNonlinear3d: ((json: string) => string) | null = null;

// Staged construction solvers
let wasmSolveStaged2d: ((json: string) => string) | null = null;
let wasmSolveStaged3d: ((json: string) => string) | null = null;

// Cable solver
let wasmSolveCable2d: ((json: string, maxIter: number, tolerance: number) => string) | null = null;

// Harmonic solvers
let wasmSolveHarmonic2d: ((json: string) => string) | null = null;
let wasmSolveHarmonic3d: ((json: string) => string) | null = null;

// Creep & shrinkage solvers
let wasmSolveCreepShrinkage2d: ((json: string) => string) | null = null;
let wasmSolveCreepShrinkage3d: ((json: string) => string) | null = null;

// Multi-case solvers
let wasmSolveMultiCase2d: ((json: string) => string) | null = null;
let wasmSolveMultiCase3d: ((json: string) => string) | null = null;

// Nonlinear path-following solvers
let wasmSolveArcLength: ((json: string) => string) | null = null;
let wasmSolveDisplacementControl: ((json: string) => string) | null = null;

// Imperfection solvers
let wasmSolveWithImperfections2d: ((json: string) => string) | null = null;
let wasmSolveWithImperfections3d: ((json: string) => string) | null = null;

// 3D influence line
let wasmComputeInfluenceLine3d: ((json: string) => string) | null = null;

// Section analysis
let wasmAnalyzeSection: ((json: string) => string) | null = null;

// Model reduction
let wasmGuyanReduce2d: ((json: string) => string) | null = null;
let wasmCraigBampton2d: ((json: string) => string) | null = null;

// Design Checks (not yet compiled into WASM binary — graceful fallback via ?? null)
let wasmCheckSteelMembers: ((json: string) => string) | null = null;
let wasmCheckRcMembers: ((json: string) => string) | null = null;
let wasmCheckTimberMembers: ((json: string) => string) | null = null;
let wasmCheckEc3Members: ((json: string) => string) | null = null;
let wasmCheckEc2Members: ((json: string) => string) | null = null;
let wasmCheckCirsoc201Members: ((json: string) => string) | null = null;
let wasmCheckCfsMembers: ((json: string) => string) | null = null;
let wasmCheckMasonryMembers: ((json: string) => string) | null = null;
let wasmCheckServiceability: ((json: string) => string) | null = null;
let wasmCheckBoltGroups: ((json: string) => string) | null = null;
let wasmCheckWeldGroups: ((json: string) => string) | null = null;
let wasmCheckSpreadFootings: ((json: string) => string) | null = null;

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
    // 2D advanced
    wasmSolveCorotational2d = wasm.solve_corotational_2d;
    wasmSolveNonlinearMaterial2d = wasm.solve_nonlinear_material_2d;
    wasmSolveTimeHistory2d = wasm.solve_time_history_2d;

    // 3D solvers
    wasmSolvePdelta3d = wasm.solve_pdelta_3d;
    wasmSolveModal3d = wasm.solve_modal_3d;
    wasmSolveBuckling3d = wasm.solve_buckling_3d;
    wasmSolveSpectral3d = wasm.solve_spectral_3d;

    // Kinematics
    wasmAnalyzeKinematics2d = wasm.analyze_kinematics_2d;
    wasmAnalyzeKinematics3d = wasm.analyze_kinematics_3d;

    // Combinations & Envelope
    wasmCombineResults2d = wasm.combine_results_2d;
    wasmCombineResults3d = wasm.combine_results_3d;
    wasmComputeEnvelope2d = wasm.compute_envelope_2d;
    wasmComputeEnvelope3d = wasm.compute_envelope_3d;

    // Influence Lines
    wasmComputeInfluenceLine = wasm.compute_influence_line;

    // Section Stress
    wasmComputeSectionStress2d = wasm.compute_section_stress_2d;
    wasmComputeSectionStress3d = wasm.compute_section_stress_3d;

    // Diagrams & Deformed Shape
    wasmComputeDiagrams2d = wasm.compute_diagrams_2d;
    wasmComputeDiagrams3d = wasm.compute_diagrams_3d;
    wasmComputeDeformedShape = wasm.compute_deformed_shape;

    // 3D advanced solvers
    wasmSolveCorotational3d = wasm.solve_corotational_3d ?? null;
    wasmSolveNonlinearMaterial3d = wasm.solve_nonlinear_material_3d ?? null;
    wasmSolveTimeHistory3d = wasm.solve_time_history_3d ?? null;
    wasmSolvePlastic3d = wasm.solve_plastic_3d ?? null;
    wasmSolveMovingLoads3d = wasm.solve_moving_loads_3d ?? null;

    // Constrained / contact / SSI / Winkler
    wasmSolveConstrained2d = wasm.solve_constrained_2d ?? null;
    wasmSolveConstrained3d = wasm.solve_constrained_3d ?? null;
    wasmSolveContact2d = wasm.solve_contact_2d ?? null;
    wasmSolveContact3d = wasm.solve_contact_3d ?? null;
    wasmSolveSsi2d = wasm.solve_ssi_2d ?? null;
    wasmSolveSsi3d = wasm.solve_ssi_3d ?? null;
    wasmSolveWinkler2d = wasm.solve_winkler_2d ?? null;
    wasmSolveWinkler3d = wasm.solve_winkler_3d ?? null;

    // Fiber nonlinear
    wasmSolveFiberNonlinear2d = wasm.solve_fiber_nonlinear_2d ?? null;
    wasmSolveFiberNonlinear3d = wasm.solve_fiber_nonlinear_3d ?? null;

    // Staged construction
    wasmSolveStaged2d = wasm.solve_staged_2d ?? null;
    wasmSolveStaged3d = wasm.solve_staged_3d ?? null;

    // Cable
    wasmSolveCable2d = wasm.solve_cable_2d ?? null;

    // Harmonic
    wasmSolveHarmonic2d = wasm.solve_harmonic_2d ?? null;
    wasmSolveHarmonic3d = wasm.solve_harmonic_3d ?? null;

    // Creep & shrinkage
    wasmSolveCreepShrinkage2d = wasm.solve_creep_shrinkage_2d ?? null;
    wasmSolveCreepShrinkage3d = wasm.solve_creep_shrinkage_3d ?? null;

    // Multi-case
    wasmSolveMultiCase2d = wasm.solve_multi_case_2d ?? null;
    wasmSolveMultiCase3d = wasm.solve_multi_case_3d ?? null;

    // Nonlinear path-following
    wasmSolveArcLength = wasm.solve_arc_length ?? null;
    wasmSolveDisplacementControl = wasm.solve_displacement_control ?? null;

    // Imperfections
    wasmSolveWithImperfections2d = wasm.solve_with_imperfections_2d ?? null;
    wasmSolveWithImperfections3d = wasm.solve_with_imperfections_3d ?? null;

    // 3D influence line
    wasmComputeInfluenceLine3d = wasm.compute_influence_line_3d ?? null;

    // Section analysis
    wasmAnalyzeSection = wasm.analyze_section ?? null;

    // Model reduction
    wasmGuyanReduce2d = wasm.guyan_reduce_2d ?? null;
    wasmCraigBampton2d = wasm.craig_bampton_2d ?? null;

    // Design Checks (may not exist in current WASM binary — ?? null prevents crash)
    wasmCheckSteelMembers = wasm.check_steel_members ?? null;
    wasmCheckRcMembers = wasm.check_rc_members ?? null;
    wasmCheckTimberMembers = wasm.check_timber_members ?? null;
    wasmCheckEc3Members = wasm.check_ec3_members ?? null;
    wasmCheckEc2Members = wasm.check_ec2_members ?? null;
    wasmCheckCirsoc201Members = wasm.check_cirsoc201_members ?? null;
    wasmCheckCfsMembers = wasm.check_cfs_members ?? null;
    wasmCheckMasonryMembers = wasm.check_masonry_members ?? null;
    wasmCheckServiceability = wasm.check_serviceability ?? null;
    wasmCheckBoltGroups = wasm.check_bolt_groups ?? null;
    wasmCheckWeldGroups = wasm.check_weld_groups ?? null;
    wasmCheckSpreadFootings = wasm.check_spread_footings ?? null;

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
export function serializeInput3D(input: SolverInput3D): string {
  return JSON.stringify({
    nodes: mapToObj(input.nodes),
    materials: mapToObj(input.materials),
    sections: mapToObj(input.sections),
    elements: mapToObj(input.elements),
    supports: mapToObj(input.supports),
    loads: input.loads,
    plates: input.plates ? mapToObj(input.plates) : {},
    quads: input.quads ? mapToObj(input.quads) : {},
    constraints: input.constraints ?? [],
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
  if (!wasmReady || !wasmSolveSpectral2d) throw new Error('WASM solver not available.');
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
  if (!wasmReady || !wasmSolvePlastic2d) throw new Error('WASM solver not available.');
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
  if (!wasmReady || !wasmSolveMovingLoads2d) throw new Error('WASM solver not available.');
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

// ─── 3D Advanced Analysis ─────────────────────────────────────────

/** Solve 3D P-Delta analysis via WASM. */
export function solvePDelta3D(input: SolverInput3D, maxIter = 20, tolerance = 1e-4) {
  if (!wasmReady || !wasmSolvePdelta3d) throw new Error('WASM P-Delta 3D solver not available.');
  const json = serializeInput3D(input);
  const resultJson = wasmSolvePdelta3d(json, maxIter, tolerance);
  return JSON.parse(resultJson);
}

/** Solve 3D modal analysis via WASM. */
export function solveModal3D(input: SolverInput3D, densities: Map<number, number>, numModes = 6) {
  if (!wasmReady || !wasmSolveModal3d) throw new Error('WASM Modal 3D solver not available.');
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
  const resultJson = wasmSolveModal3d(payload, numModes);
  return JSON.parse(resultJson);
}

/** Solve 3D buckling analysis via WASM. */
export function solveBuckling3D(input: SolverInput3D, numModes = 4) {
  if (!wasmReady || !wasmSolveBuckling3d) throw new Error('WASM Buckling 3D solver not available.');
  const json = serializeInput3D(input);
  const resultJson = wasmSolveBuckling3d(json, numModes);
  return JSON.parse(resultJson);
}

/** Solve 3D spectral analysis via WASM. */
export function solveSpectral3D(config: {
  solver: SolverInput3D;
  densities: Map<number, number>;
  spectrum: { name: string; points: { period: number; sa: number }[]; inG?: boolean };
  directions: Array<'X' | 'Y' | 'Z'>;
  combination: 'SRSS' | 'CQC';
  numModes?: number;
  xi?: number;
  importanceFactor?: number;
  reductionFactor?: number;
}) {
  if (!wasmReady || !wasmSolveSpectral3d) throw new Error('WASM Spectral 3D solver not available.');
  const payload = JSON.stringify({
    solver: {
      nodes: mapToObj(config.solver.nodes),
      materials: mapToObj(config.solver.materials),
      sections: mapToObj(config.solver.sections),
      elements: mapToObj(config.solver.elements),
      supports: mapToObj(config.solver.supports),
      loads: config.solver.loads,
    },
    densities: mapToObj(config.densities),
    spectrum: config.spectrum,
    directions: config.directions,
    combination: config.combination,
    numModes: config.numModes,
    xi: config.xi,
    importanceFactor: config.importanceFactor,
    reductionFactor: config.reductionFactor,
  });
  const resultJson = wasmSolveSpectral3d(payload);
  return JSON.parse(resultJson);
}

/** Solve 2D corotational (large displacement) analysis via WASM. */
export function solveCorotational2D(input: SolverInput, maxIter = 50, tolerance = 1e-6, nIncrements = 10) {
  if (!wasmReady || !wasmSolveCorotational2d) throw new Error('WASM Corotational solver not available.');
  const json = serializeInput2D(input);
  const resultJson = wasmSolveCorotational2d(json, maxIter, tolerance, nIncrements);
  return JSON.parse(resultJson);
}

/** Solve 2D time history analysis via WASM. */
export function solveTimeHistory2D(config: {
  solver: SolverInput;
  densities: Map<number, number>;
  accelerogram: { dt: number; values: number[] };
  direction: 'X' | 'Y';
  damping?: number;
  method?: 'Newmark' | 'Wilson';
}) {
  if (!wasmReady || !wasmSolveTimeHistory2d) throw new Error('WASM Time History solver not available.');
  const payload = JSON.stringify({
    solver: {
      nodes: mapToObj(config.solver.nodes),
      materials: mapToObj(config.solver.materials),
      sections: mapToObj(config.solver.sections),
      elements: mapToObj(config.solver.elements),
      supports: mapToObj(config.solver.supports),
      loads: config.solver.loads,
    },
    densities: mapToObj(config.densities),
    accelerogram: config.accelerogram,
    direction: config.direction,
    damping: config.damping,
    method: config.method,
  });
  const resultJson = wasmSolveTimeHistory2d(payload);
  return JSON.parse(resultJson);
}

// ─── Kinematic analysis ──────────────────────────────────────────

/** Analyze 2D kinematic stability via WASM. */
export function analyzeKinematics(input: SolverInput) {
  if (!wasmReady || !wasmAnalyzeKinematics2d) throw new Error('WASM solver not initialized.');
  const json = serializeInput2D(input);
  return JSON.parse(wasmAnalyzeKinematics2d(json));
}

/** Analyze 3D kinematic stability via WASM. */
export function analyzeKinematics3D(input: SolverInput3D) {
  if (!wasmReady || !wasmAnalyzeKinematics3d) throw new Error('WASM solver not initialized.');
  const json = serializeInput3D(input);
  return JSON.parse(wasmAnalyzeKinematics3d(json));
}

// ─── Combinations & Envelope ─────────────────────────────────────

/** Combine 2D results with factors via WASM. */
export function combineResults(
  factors: Array<{ caseId: number; factor: number }>,
  perCase: Map<number, AnalysisResults>,
): AnalysisResults | null {
  if (!wasmReady || !wasmCombineResults2d) throw new Error('WASM solver not initialized.');
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
  if (!wasmReady || !wasmCombineResults3d) throw new Error('WASM solver not initialized.');
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
  if (!wasmReady || !wasmComputeEnvelope2d) throw new Error('WASM solver not initialized.');
  if (results.length === 0) return null;
  const payload = JSON.stringify(results);
  return JSON.parse(wasmComputeEnvelope2d(payload));
}

/** Compute 3D envelope via WASM. */
export function computeEnvelope3D(results: AnalysisResults3D[]): FullEnvelope3D | null {
  if (!wasmReady || !wasmComputeEnvelope3d) throw new Error('WASM solver not initialized.');
  if (results.length === 0) return null;
  const payload = JSON.stringify(results);
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
  if (!wasmReady || !wasmComputeInfluenceLine) throw new Error('WASM solver not initialized.');
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
  if (!wasmReady || !wasmComputeSectionStress2d) throw new Error('WASM solver not initialized.');
  return JSON.parse(wasmComputeSectionStress2d(JSON.stringify(input)));
}

/** Compute 3D section stress via WASM. Takes pre-resolved geometry. */
export function computeSectionStress3D(input: any) {
  if (!wasmReady || !wasmComputeSectionStress3d) throw new Error('WASM solver not initialized.');
  return JSON.parse(wasmComputeSectionStress3d(JSON.stringify(input)));
}

// ─── Diagrams & Deformed Shape ───────────────────────────────────

/** Compute 2D diagrams (moment, shear, axial) via WASM. */
export function computeDiagrams2D(input: SolverInput, results: AnalysisResults) {
  if (!wasmReady || !wasmComputeDiagrams2d) throw new Error('WASM solver not initialized.');
  const payload = JSON.stringify({
    input: {
      nodes: mapToObj(input.nodes),
      materials: mapToObj(input.materials),
      sections: mapToObj(input.sections),
      elements: mapToObj(input.elements),
      supports: mapToObj(input.supports),
      loads: input.loads,
    },
    results,
  });
  return JSON.parse(wasmComputeDiagrams2d(payload));
}

/** Compute 3D diagrams (My, Mz, Vy, Vz, N, T) via WASM. */
export function computeDiagrams3D(input: SolverInput3D, results: AnalysisResults3D) {
  if (!wasmReady || !wasmComputeDiagrams3d) throw new Error('WASM solver not initialized.');
  const payload = JSON.stringify({
    input: {
      nodes: mapToObj(input.nodes),
      materials: mapToObj(input.materials),
      sections: mapToObj(input.sections),
      elements: mapToObj(input.elements),
      supports: mapToObj(input.supports),
      loads: input.loads,
    },
    results,
  });
  return JSON.parse(wasmComputeDiagrams3d(payload));
}

/** Compute deformed shape for one element via WASM. */
export function computeDeformedShape(input: any) {
  if (!wasmReady || !wasmComputeDeformedShape) throw new Error('WASM solver not initialized.');
  return JSON.parse(wasmComputeDeformedShape(JSON.stringify(input)));
}

// ─── Design Check Wrappers ───────────────────────────────────────
// These return null gracefully if the WASM function is not yet compiled.

/** AISC 360 LRFD steel member checks via WASM. */
export function checkSteelMembers(input: any): any | null {
  if (!wasmReady || !wasmCheckSteelMembers) return null;
  try { return JSON.parse(wasmCheckSteelMembers(JSON.stringify(input))); }
  catch { return null; }
}

/** Reinforced concrete member checks via WASM. */
export function checkRcMembers(input: any): any | null {
  if (!wasmReady || !wasmCheckRcMembers) return null;
  try { return JSON.parse(wasmCheckRcMembers(JSON.stringify(input))); }
  catch { return null; }
}

/** Timber member checks via WASM. */
export function checkTimberMembers(input: any): any | null {
  if (!wasmReady || !wasmCheckTimberMembers) return null;
  try { return JSON.parse(wasmCheckTimberMembers(JSON.stringify(input))); }
  catch { return null; }
}

/** Eurocode 3 steel member checks via WASM. */
export function checkEc3Members(input: any): any | null {
  if (!wasmReady || !wasmCheckEc3Members) return null;
  try { return JSON.parse(wasmCheckEc3Members(JSON.stringify(input))); }
  catch { return null; }
}

/** Eurocode 2 RC member checks via WASM. */
export function checkEc2Members(input: any): any | null {
  if (!wasmReady || !wasmCheckEc2Members) return null;
  try { return JSON.parse(wasmCheckEc2Members(JSON.stringify(input))); }
  catch { return null; }
}

/** CIRSOC 201 RC member checks via WASM. */
export function checkCirsoc201Members(input: any): any | null {
  if (!wasmReady || !wasmCheckCirsoc201Members) return null;
  try { return JSON.parse(wasmCheckCirsoc201Members(JSON.stringify(input))); }
  catch { return null; }
}

/** Cold-formed steel member checks via WASM. */
export function checkCfsMembers(input: any): any | null {
  if (!wasmReady || !wasmCheckCfsMembers) return null;
  try { return JSON.parse(wasmCheckCfsMembers(JSON.stringify(input))); }
  catch { return null; }
}

/** Masonry member checks via WASM. */
export function checkMasonryMembers(input: any): any | null {
  if (!wasmReady || !wasmCheckMasonryMembers) return null;
  try { return JSON.parse(wasmCheckMasonryMembers(JSON.stringify(input))); }
  catch { return null; }
}

/** Serviceability checks (deflection/vibration) via WASM. */
export function checkServiceability(input: any): any | null {
  if (!wasmReady || !wasmCheckServiceability) return null;
  try { return JSON.parse(wasmCheckServiceability(JSON.stringify(input))); }
  catch { return null; }
}

/** Bolt group capacity checks via WASM. */
export function checkBoltGroups(input: any): any | null {
  if (!wasmReady || !wasmCheckBoltGroups) return null;
  try { return JSON.parse(wasmCheckBoltGroups(JSON.stringify(input))); }
  catch { return null; }
}

/** Weld group capacity checks via WASM. */
export function checkWeldGroups(input: any): any | null {
  if (!wasmReady || !wasmCheckWeldGroups) return null;
  try { return JSON.parse(wasmCheckWeldGroups(JSON.stringify(input))); }
  catch { return null; }
}

/** Spread footing bearing checks via WASM. */
export function checkSpreadFootings(input: any): any | null {
  if (!wasmReady || !wasmCheckSpreadFootings) return null;
  try { return JSON.parse(wasmCheckSpreadFootings(JSON.stringify(input))); }
  catch { return null; }
}

/** Check if a specific WASM design check function is available. */
export function isDesignCheckAvailable(name: string): boolean {
  if (!wasmReady) return false;
  const checks: Record<string, any> = {
    steelMembers: wasmCheckSteelMembers,
    rcMembers: wasmCheckRcMembers,
    timberMembers: wasmCheckTimberMembers,
    ec3Members: wasmCheckEc3Members,
    ec2Members: wasmCheckEc2Members,
    cirsoc201Members: wasmCheckCirsoc201Members,
    cfsMembers: wasmCheckCfsMembers,
    masonryMembers: wasmCheckMasonryMembers,
    serviceability: wasmCheckServiceability,
    boltGroups: wasmCheckBoltGroups,
    weldGroups: wasmCheckWeldGroups,
    spreadFootings: wasmCheckSpreadFootings,
  };
  return checks[name] != null;
}

/** Solve 2D nonlinear material analysis via WASM. */
export function solveNonlinearMaterial2D(config: {
  solver: SolverInput;
  materialModels?: any;
  sectionCapacities?: any;
  maxIter?: number;
  tolerance?: number;
  nIncrements?: number;
}) {
  if (!wasmReady || !wasmSolveNonlinearMaterial2d) throw new Error('WASM nonlinear material solver not available.');
  const payload = JSON.stringify({
    solver: {
      nodes: mapToObj(config.solver.nodes),
      materials: mapToObj(config.solver.materials),
      sections: mapToObj(config.solver.sections),
      elements: mapToObj(config.solver.elements),
      supports: mapToObj(config.solver.supports),
      loads: config.solver.loads,
    },
    materialModels: config.materialModels,
    sectionCapacities: config.sectionCapacities,
    maxIter: config.maxIter,
    tolerance: config.tolerance,
    nIncrements: config.nIncrements,
  });
  return JSON.parse(wasmSolveNonlinearMaterial2d(payload));
}

// ─── 3D Advanced Solvers (new) ────────────────────────────────────

/** Solve 3D corotational (large displacement) analysis via WASM. */
export function solveCorotational3D(input: SolverInput3D, maxIter = 50, tolerance = 1e-6, nIncrements = 10): any {
  if (!wasmReady || !wasmSolveCorotational3d) throw new Error('WASM Corotational 3D solver not available.');
  return JSON.parse(wasmSolveCorotational3d(serializeInput3D(input), maxIter, tolerance, nIncrements));
}

/** Solve 3D nonlinear material analysis via WASM. */
export function solveNonlinearMaterial3D(config: any): any {
  if (!wasmReady || !wasmSolveNonlinearMaterial3d) throw new Error('WASM nonlinear material 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolveNonlinearMaterial3d(JSON.stringify(config)));
}

/** Solve 3D time history analysis via WASM. */
export function solveTimeHistory3D(config: any): any {
  if (!wasmReady || !wasmSolveTimeHistory3d) throw new Error('WASM time history 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolveTimeHistory3d(JSON.stringify(config)));
}

/** Solve 3D plastic analysis via WASM. */
export function solvePlastic3D(config: any): any {
  if (!wasmReady || !wasmSolvePlastic3d) throw new Error('WASM plastic 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolvePlastic3d(JSON.stringify(config)));
}

/** Solve 3D moving loads analysis via WASM. */
export function solveMovingLoads3D(config: any): any {
  if (!wasmReady || !wasmSolveMovingLoads3d) throw new Error('WASM moving loads 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolveMovingLoads3d(JSON.stringify(config)));
}

// ─── Constrained / Contact / SSI / Winkler Solvers ────────────────

/** Solve 2D constrained analysis via WASM. */
export function solveConstrained2D(config: any): any {
  if (!wasmReady || !wasmSolveConstrained2d) throw new Error('WASM constrained 2D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmSolveConstrained2d(JSON.stringify(config)));
}

/** Solve 3D constrained analysis via WASM. */
export function solveConstrained3D(config: any): any {
  if (!wasmReady || !wasmSolveConstrained3d) throw new Error('WASM constrained 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolveConstrained3d(JSON.stringify(config)));
}

/** Solve 2D contact analysis via WASM. */
export function solveContact2D(config: any): any {
  if (!wasmReady || !wasmSolveContact2d) throw new Error('WASM contact 2D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmSolveContact2d(JSON.stringify(config)));
}

/** Solve 3D contact analysis via WASM. */
export function solveContact3D(config: any): any {
  if (!wasmReady || !wasmSolveContact3d) throw new Error('WASM contact 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolveContact3d(JSON.stringify(config)));
}

/** Solve 2D soil-structure interaction via WASM. */
export function solveSSI2D(config: any): any {
  if (!wasmReady || !wasmSolveSsi2d) throw new Error('WASM SSI 2D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmSolveSsi2d(JSON.stringify(config)));
}

/** Solve 3D soil-structure interaction via WASM. */
export function solveSSI3D(config: any): any {
  if (!wasmReady || !wasmSolveSsi3d) throw new Error('WASM SSI 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolveSsi3d(JSON.stringify(config)));
}

/** Solve 2D Winkler foundation analysis via WASM. */
export function solveWinkler2D(config: any): any {
  if (!wasmReady || !wasmSolveWinkler2d) throw new Error('WASM Winkler 2D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmSolveWinkler2d(JSON.stringify(config)));
}

/** Solve 3D Winkler foundation analysis via WASM. */
export function solveWinkler3D(config: any): any {
  if (!wasmReady || !wasmSolveWinkler3d) throw new Error('WASM Winkler 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolveWinkler3d(JSON.stringify(config)));
}

// ─── Fiber Nonlinear Solvers ──────────────────────────────────────

/** Solve 2D fiber nonlinear analysis via WASM. */
export function solveFiberNonlinear2D(config: any): any {
  if (!wasmReady || !wasmSolveFiberNonlinear2d) throw new Error('WASM fiber nonlinear 2D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmSolveFiberNonlinear2d(JSON.stringify(config)));
}

/** Solve 3D fiber nonlinear analysis via WASM. */
export function solveFiberNonlinear3D(config: any): any {
  if (!wasmReady || !wasmSolveFiberNonlinear3d) throw new Error('WASM fiber nonlinear 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolveFiberNonlinear3d(JSON.stringify(config)));
}

// ─── Staged Construction Solvers ──────────────────────────────────

/** Solve 2D staged construction analysis via WASM. */
export function solveStaged2D(config: any): any {
  if (!wasmReady || !wasmSolveStaged2d) throw new Error('WASM staged 2D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmSolveStaged2d(JSON.stringify(config)));
}

/** Solve 3D staged construction analysis via WASM. */
export function solveStaged3D(config: any): any {
  if (!wasmReady || !wasmSolveStaged3d) throw new Error('WASM staged 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolveStaged3d(JSON.stringify(config)));
}

// ─── Cable Solver ─────────────────────────────────────────────────

/** Solve 2D cable analysis via WASM. */
export function solveCable2D(input: SolverInput, maxIter = 50, tolerance = 1e-6): any {
  if (!wasmReady || !wasmSolveCable2d) throw new Error('WASM cable 2D solver not available.');
  return JSON.parse(wasmSolveCable2d(serializeInput2D(input), maxIter, tolerance));
}

// ─── Harmonic Solvers ─────────────────────────────────────────────

/** Solve 2D harmonic analysis via WASM. */
export function solveHarmonic2D(config: any): any {
  if (!wasmReady || !wasmSolveHarmonic2d) throw new Error('WASM harmonic 2D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmSolveHarmonic2d(JSON.stringify(config)));
}

/** Solve 3D harmonic analysis via WASM. */
export function solveHarmonic3D(config: any): any {
  if (!wasmReady || !wasmSolveHarmonic3d) throw new Error('WASM harmonic 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolveHarmonic3d(JSON.stringify(config)));
}

// ─── Creep & Shrinkage Solvers ────────────────────────────────────

/** Solve 2D creep & shrinkage analysis via WASM. */
export function solveCreepShrinkage2D(config: any): any {
  if (!wasmReady || !wasmSolveCreepShrinkage2d) throw new Error('WASM creep/shrinkage 2D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmSolveCreepShrinkage2d(JSON.stringify(config)));
}

/** Solve 3D creep & shrinkage analysis via WASM. */
export function solveCreepShrinkage3D(config: any): any {
  if (!wasmReady || !wasmSolveCreepShrinkage3d) throw new Error('WASM creep/shrinkage 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolveCreepShrinkage3d(JSON.stringify(config)));
}

// ─── Multi-Case Solvers ───────────────────────────────────────────

/** Solve 2D multi-case analysis via WASM. */
export function solveMultiCase2D(config: any): any {
  if (!wasmReady || !wasmSolveMultiCase2d) throw new Error('WASM multi-case 2D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmSolveMultiCase2d(JSON.stringify(config)));
}

/** Solve 3D multi-case analysis via WASM. */
export function solveMultiCase3D(config: any): any {
  if (!wasmReady || !wasmSolveMultiCase3d) throw new Error('WASM multi-case 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolveMultiCase3d(JSON.stringify(config)));
}

// ─── Nonlinear Path-Following Solvers ─────────────────────────────

/** Solve arc-length (Riks) analysis via WASM. */
export function solveArcLength(config: any): any {
  if (!wasmReady || !wasmSolveArcLength) throw new Error('WASM arc-length solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    const is3D = config.solver.plates || config.solver.quads || config.solver.constraints;
    config = { ...config, solver: JSON.parse(is3D ? serializeInput3D(config.solver) : serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmSolveArcLength(JSON.stringify(config)));
}

/** Solve displacement-control analysis via WASM. */
export function solveDisplacementControl(config: any): any {
  if (!wasmReady || !wasmSolveDisplacementControl) throw new Error('WASM displacement-control solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    const is3D = config.solver.plates || config.solver.quads || config.solver.constraints;
    config = { ...config, solver: JSON.parse(is3D ? serializeInput3D(config.solver) : serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmSolveDisplacementControl(JSON.stringify(config)));
}

// ─── Imperfection Solvers ─────────────────────────────────────────

/** Solve 2D analysis with geometric imperfections via WASM. */
export function solveWithImperfections2D(config: any): any {
  if (!wasmReady || !wasmSolveWithImperfections2d) throw new Error('WASM imperfections 2D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmSolveWithImperfections2d(JSON.stringify(config)));
}

/** Solve 3D analysis with geometric imperfections via WASM. */
export function solveWithImperfections3D(config: any): any {
  if (!wasmReady || !wasmSolveWithImperfections3d) throw new Error('WASM imperfections 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolveWithImperfections3d(JSON.stringify(config)));
}

// ─── 3D Influence Line ────────────────────────────────────────────

/** Compute 3D influence line via WASM. */
export function computeInfluenceLine3D(config: any): any {
  if (!wasmReady || !wasmComputeInfluenceLine3d) throw new Error('WASM influence line 3D not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmComputeInfluenceLine3d(JSON.stringify(config)));
}

// ─── Section Analysis ─────────────────────────────────────────────

/** Analyze cross-section properties via WASM. */
export function analyzeSection(input: any): any {
  if (!wasmReady || !wasmAnalyzeSection) throw new Error('WASM section analysis not available.');
  return JSON.parse(wasmAnalyzeSection(JSON.stringify(input)));
}

// ─── Model Reduction ──────────────────────────────────────────────

/** Guyan (static) condensation of a 2D model via WASM. */
export function guyanReduce2D(config: any): any {
  if (!wasmReady || !wasmGuyanReduce2d) throw new Error('WASM Guyan reduction not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmGuyanReduce2d(JSON.stringify(config)));
}

/** Craig-Bampton substructure reduction of a 2D model via WASM. */
export function craigBampton2D(config: any): any {
  if (!wasmReady || !wasmCraigBampton2d) throw new Error('WASM Craig-Bampton reduction not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmCraigBampton2d(JSON.stringify(config)));
}
