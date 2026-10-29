import { assertCalculationsAllowed, calculationLease, guardExports } from './calculation-gate';
import { registerColumnCapacityKernel } from './column-capacity-kernel';
import { noteEngineBuild } from '../provenance/build-identity';
import { registerCirsoc201BeamKernel } from './codes/argentina/cirsoc201-beam-kernel';
import { registerCirsoc301Kernel } from './codes/argentina/cirsoc301-kernel';
import { packedShellCombinationKernel, registerShellCombinationKernel } from './shell-combination-kernel';
import { registerCirsoc201Engine } from './codes/argentina/cirsoc201-engine';
import { registerCollisionKernel } from './detailing/collision-kernel';
/**
 * WASM solver wrapper — replaces the pure-TS solver pipeline.
 * Serializes SolverInput (with Maps) → JSON → Rust/WASM → JSON → AnalysisResults.
 *
 * The engine is the only source of engineering results. There is no JS solver to fall back to:
 * until `initSolver()` has finished, or if the WASM build is missing, every entry point here
 * either throws or returns a value its caller must read as "not computed" — never a number
 * computed some other way.
 */

import { mergeAllHingedJoints2D, restrainOrphanRotations2D } from './orphan-rotations-2d';
import { stripStabilisedReactions } from './stabilised-reactions';
import type { SpectralModeInput3D } from './dynamics/requests';
import type { SolverInput, AnalysisResults, FullEnvelope } from './types';
import type { SolverInput3D, SolverElement3D, SolverSection3D, AnalysisResults3D, FullEnvelope3D } from './types-3d';
import { bucklingWarpingInput, hasBucklingWarping, torsionGaps3D } from './buckling-warping';
import { finishSolve3D, finishPDelta3D } from './solve-finish';
import { plainDeepCopy, findUncloneablePath } from '../utils/plain-deep-copy';
import { errorText } from '../utils/error-text';
import { EngineUnavailableError, EngineCheckError } from './engine-unavailable';
import { tagCertifyJob } from './certify-tags';

let wasmReady = false;
let wasmInitPromise: Promise<void> | null = null;

interface NativeLoadSession { solve(loads: unknown): any; free(): void }
type LoadSessionConstructor = new (input: unknown) => NativeLoadSession;
let loadSession2D: LoadSessionConstructor | null = null;
let loadSession3D: LoadSessionConstructor | null = null;
let preparedLoadSessionsEnabled = true;
/** Reference/benchmark switch; production reuses the prepared factorization. */
export function setPreparedLoadSessionsEnabled(enabled: boolean): void { preparedLoadSessionsEnabled = enabled; }

// Dynamically loaded WASM functions
let wasmSolve2d: ((input: any) => any) | null = null;
let wasmSolve3d: ((input: any) => any) | null = null;
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
// Model sanity review (engine `sanity`)
let wasmReviewModelSanity: ((json: string) => string) | null = null;

// Combinations & Envelope
let wasmCombineResults2d: ((input: any) => any) | null = null;
let wasmCombineResults3d: ((input: any) => any) | null = null;
let wasmComputeEnvelope2d: ((input: any) => any) | null = null;
let wasmComputeEnvelope3d: ((input: any) => any) | null = null;

// Influence Lines
let wasmComputeInfluenceLine: ((json: string) => string) | null = null;

// Section Stress
let wasmBuildSectionGeometry: ((json: string) => string) | null = null;
let wasmAnalyzeSectionBending: ((json: string) => string) | null = null;
let wasmAnalyzeSectionTorsion: ((json: string) => string) | null = null;
let wasmAnalyzeSectionShear: ((json: string) => string) | null = null;
let wasmAnalyzeSectionTorsionField: ((json: string) => string) | null = null;
let wasmAnalyzeSectionShearField: ((json: string) => string) | null = null;
let wasmAnalyzeSectionPlastic: ((json: string) => string) | null = null;
let wasmSectionGeometryDigest: ((json: string) => string) | null = null;
let wasmComputeSectionStress2d: ((json: string) => string) | null = null;
let wasmComputeSectionStress3d: ((json: string) => string) | null = null;
let wasmComputeSectionStress3dFromForces: ((json: string) => string) | null = null;

// Diagrams & Deformed Shape
let wasmComputeDiagrams2d: ((json: string) => string) | null = null;
let wasmComputeDiagrams3d: ((json: string) => string) | null = null;
let wasmComputeDeformedShape: ((json: string) => string) | null = null;
let wasmComputeDiagramValueAt: ((json: string) => number) | null = null;
let wasmComputeDiagramValueAt3d: ((json: string) => number) | null = null;

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
let wasmSolveCable3d: ((json: string, maxIter: number, tolerance: number) => string) | null = null;

// Harmonic solvers
let wasmSolveHarmonic2d: ((json: string) => string) | null = null;
let wasmSolveHarmonic3d: ((json: string) => string) | null = null;

// Creep & shrinkage solvers
let wasmSolveCreepShrinkage2d: ((json: string) => string) | null = null;
let wasmSolveCreepShrinkage3d: ((json: string) => string) | null = null;

// Multi-case solvers
let wasmSolveMultiCase2d: ((input: any) => any) | null = null;
let wasmSolveMultiCase3d: ((input: any) => any) | null = null;

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

// Beam Station Extraction
let wasmExtractBeamStationBuffer3d: ((json: string) => Float64Array) | null = null;
let wasmExtractBeamStations: ((json: string) => string) | null = null;
let wasmExtractBeamStations3d: ((json: string) => string) | null = null;
let wasmExtractBeamStationsGrouped: ((json: string) => string) | null = null;
let wasmExtractBeamStationsGrouped3d: ((json: string) => string) | null = null;

// Design checks. A build without one of them leaves it null, and the wrapper says so.
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
let wasmLoadsRequest: ((json: string) => string) | null = null;
let wasmCheckIsolatedFootings: ((json: string) => string) | null = null;
let wasmCertifyIsolatedFootings: ((json: string) => string) | null = null;

// Certified results (docs/verification/CERTIFY.md). Absent from older WASM builds.
let wasmCertifyLinear2d: ((input: any) => any) | null = null;
let wasmCertifyLinear3d: ((input: any) => any) | null = null;
let wasmCertifyBuckling2d: ((json: string, numModes: number) => string) | null = null;
let wasmCertifyBuckling3d: ((json: string, numModes: number) => string) | null = null;

let wasmBytesPromise: Promise<ArrayBuffer> | null = null;

/** Fetch the WASM binary once. Shared between the main-thread init and the
 *  worker pool so the bytes cross the network a single time. A failed fetch
 *  is not cached — the next call retries. */
export function getWasmBytes(): Promise<ArrayBuffer> {
  if (!wasmBytesPromise) {
    const wasmUrl = new URL('../wasm/dedaliano_engine_bg.wasm', import.meta.url);
    wasmBytesPromise = fetch(wasmUrl)
      .then(resp => {
        if (!resp.ok) throw new Error(`Failed to fetch WASM binary: HTTP ${resp.status}`);
        return resp.arrayBuffer();
      })
      .catch(err => { wasmBytesPromise = null; throw err; });
  }
  return wasmBytesPromise;
}

/** The engine's own account of its version and commit; null from a build without the export. */
function engineInfoOf(wasm: unknown): { engineVersion?: string; engineCommit?: string } | null {
  const f = (wasm as { engine_build_info?: () => string }).engine_build_info;
  if (typeof f !== 'function') return null;
  try { return JSON.parse(f()); } catch { return null; }
}

/** Initialize the WASM module. Call once at app startup. */
export async function initSolver(): Promise<void> {
  if (wasmReady) return;
  if (wasmInitPromise) return wasmInitPromise;
  wasmInitPromise = (async () => {
    // Let Vite track and rewrite the generated WASM glue module for production.
    const module = await import('../wasm/dedaliano_engine.js');
    const wasm = guardExports(module);
    // In Node.js (vitest), fetch is not available for local file:// URLs.
    // Use initSync with a file buffer instead.
    if (typeof process !== 'undefined' && process.versions?.node) {
      const { readFileSync } = await import('fs');
      const { fileURLToPath } = await import('url');
      const wasmUrl = new URL('../wasm/dedaliano_engine_bg.wasm', import.meta.url);
      const wasmBytes = readFileSync(fileURLToPath(wasmUrl));
      wasm.initSync({ module: wasmBytes });
      noteEngineBuild(new Uint8Array(wasmBytes), engineInfoOf(wasm));
    } else {
      const bytes = await getWasmBytes();
      await wasm.default(bytes);
      // The worker pool compiles these same bytes, so one hash names the binary everywhere.
      noteEngineBuild(bytes, engineInfoOf(wasm));
    }
    registerCollisionKernel(wasm.CollisionGeometry ?? null);
    registerCirsoc201Engine({
      Section: wasm.Cirsoc201SectionKernel, basis: wasm.cirsoc201_basis, phi: wasm.cirsoc201_phi,
      designBeam: wasm.cirsoc201_design_beam, slabProvisions: wasm.cirsoc201_slab_provisions,
    });
    registerColumnCapacityKernel(wasm.solve_column_capacity_batch ?? null);
    registerCirsoc201BeamKernel(wasm.cirsoc201_beam_batch ?? null);
    registerCirsoc301Kernel({ check: wasm.check_cirsoc301_members ?? null, certify: wasm.certify_cirsoc301_members ?? null });
    loadSession2D = wasm.LoadSession2D ?? null;
    loadSession3D = wasm.LoadSession3D ?? null;
    registerShellCombinationKernel(wasm.combine_shell_stresses ? packedShellCombinationKernel(wasm.combine_shell_stresses) : null);
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

    // Canonical section geometry (JSON-string boundary, like analyze_section)
    wasmBuildSectionGeometry = wasm.build_section_geometry ?? null;
    wasmAnalyzeSectionBending = wasm.analyze_section_bending ?? null;
    wasmAnalyzeSectionTorsion = wasm.analyze_section_torsion ?? null;
    wasmAnalyzeSectionShear = wasm.analyze_section_shear ?? null;
    wasmAnalyzeSectionTorsionField = wasm.analyze_section_torsion_field ?? null;
    wasmAnalyzeSectionShearField = wasm.analyze_section_shear_field ?? null;
    wasmAnalyzeSectionPlastic = wasm.analyze_section_plastic ?? null;
    wasmSectionGeometryDigest = wasm.section_geometry_digest ?? null;

    // Section Stress
    wasmComputeSectionStress2d = wasm.compute_section_stress_2d;
    wasmComputeSectionStress3d = wasm.compute_section_stress_3d;
    wasmComputeSectionStress3dFromForces = wasm.compute_section_stress_3d_from_forces ?? null;

    // Diagrams & Deformed Shape
    wasmComputeDiagrams2d = wasm.compute_diagrams_2d;
    wasmComputeDiagrams3d = wasm.compute_diagrams_3d;
    wasmComputeDeformedShape = wasm.compute_deformed_shape;
    wasmComputeDiagramValueAt = wasm.compute_diagram_value_at ?? null;
    wasmComputeDiagramValueAt3d = wasm.compute_diagram_value_at_3d ?? null;

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
    wasmSolveCable3d = wasm.solve_cable_3d ?? null;

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
    wasmLoadsRequest = (wasm as Record<string, unknown>).loads_request as typeof wasmLoadsRequest ?? null;
    wasmCheckIsolatedFootings = (wasm as Record<string, unknown>).check_isolated_footings as typeof wasmCheckIsolatedFootings ?? null;
    wasmCertifyIsolatedFootings = (wasm as Record<string, unknown>).certify_isolated_footings as typeof wasmCertifyIsolatedFootings ?? null;

    // Beam Station Extraction
    wasmExtractBeamStationBuffer3d = wasm.extract_beam_station_buffer_3d ?? null;
    wasmExtractBeamStations = wasm.extract_beam_stations ?? null;
    wasmExtractBeamStations3d = wasm.extract_beam_stations_3d ?? null;
    wasmExtractBeamStationsGrouped = wasm.extract_beam_stations_grouped ?? null;
    wasmExtractBeamStationsGrouped3d = wasm.extract_beam_stations_grouped_3d ?? null;

    // Certified results (may not exist in older WASM builds)
    wasmCertifyLinear2d = wasm.certify_linear_2d ?? null;
    wasmCertifyLinear3d = wasm.certify_linear_3d ?? null;
    wasmCertifyBuckling2d = wasm.certify_buckling_2d ?? null;
    wasmCertifyBuckling3d = wasm.certify_buckling_3d ?? null;
    certifyExports.clear();
    for (const name of CERTIFY_EXPORTS) {
      const fn = (wasm as Record<string, unknown>)[name];
      if (typeof fn === 'function') certifyExports.set(name, fn as (...args: any[]) => any);
    }

    wasmReviewModelSanity = wasm.review_model_sanity ?? null;

    wasmReady = true;
  })();
  return wasmInitPromise;
}

/** Check if WASM solver is ready. */
export function isSolverReady(): boolean {
  return wasmReady;
}

/** Check if the canonical-section-geometry export is present. Older WASM
 *  builds (or builds from branches that predate the section engine) do not
 *  have it, and `buildSectionGeometry` would throw on call. */
export function hasCanonicalGeometryExport(): boolean {
  return wasmBuildSectionGeometry !== null;
}

/** Check if the reusable section-field exports are present. They were added
 *  after the point-query exports, so a WASM build can have
 *  `build_section_geometry` and still lack these — in that case callers fall
 *  back to the per-point exports. */
export function hasSectionFieldExport(): boolean {
  return wasmAnalyzeSectionShearField !== null && wasmAnalyzeSectionTorsionField !== null;
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

/**
 * Re-exported so callers reach them through the solver boundary they belong to rather than
 * through a utility path. The implementations are shared with the store, which carries the
 * same "no foreign proxies" obligation on the way in.
 */
export { plainDeepCopy, findUncloneablePath };

/** `plainDeepCopy` over a Map's values, emitting the `{ "id": value }` wire form. */
function mapToPlainObj<T>(map: Map<number, T>): Record<string, T> {
  const obj: Record<string, T> = {};
  for (const [k, v] of map) obj[String(k)] = plainDeepCopy(v);
  return obj;
}

/**
 * Guard for the JsValue boundary: `JSON.stringify` used to coerce NaN/Infinity
 * to `null`, which serde_json then rejected — non-finite inputs never reached
 * the solver. serde-wasm-bindgen would pass them through as f64. This walk
 * restores the old rejection semantics without a string round trip.
 */
export function assertFiniteWire(value: any, path = 'input'): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Non-finite number (${value}) at ${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) assertFiniteWire(value[i], `${path}[${i}]`);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const k of Object.keys(value)) assertFiniteWire(value[k], `${path}.${k}`);
  }
}

/** Convert SolverInput (with Maps) to the plain JSON-ready wire object,
 *  without a string round trip. */
export function input2DToWireObject(input: SolverInput): Record<string, any> {
  return {
    nodes: mapToObj(input.nodes),
    materials: mapToObj(input.materials),
    sections: mapToObj(input.sections),
    elements: mapToObj(input.elements),
    supports: mapToObj(input.supports),
    loads: input.loads,
    constraints: plainDeepCopy(input.constraints ?? []),
    connectors: input.connectors ? mapToPlainObj(input.connectors) : {},
  };
}

/** Serialize SolverInput (with Maps) to JSON string for WASM. */
function serializeInput2D(input: SolverInput): string {
  return JSON.stringify(input2DToWireObject(input));
}

/**
 * Convert SolverInput3D (with Maps) to the plain JSON-ready wire object, without a string
 * round trip.
 *
 * ── Why the small collections are COPIED and the big ones are not ──
 *
 * This object is handed to two consumers that both refuse a reactive proxy:
 * `worker.postMessage` (the structured-clone algorithm rejects an exotic object outright) and
 * serde-wasm-bindgen. `buildSolverInput3D` assembles nodes, elements, sections and supports as
 * fresh literals, so those are already plain — and they are the big ones, which is why they
 * are not copied again here.
 *
 * The rest used to be passed straight through BY REFERENCE: `constraints`, the `nodes` list of
 * every plate/quad/curved shell, and the connector records. Every one of those is read off a
 * reactive store, so every one of them could be a proxy. That was not hypothetical — it made
 * `solveCombinations3DParallel` throw `DataCloneError` on EVERY solve of any model carrying a
 * constraint, the sequential fallback swallowed the throw, and the worker pool had therefore
 * quietly stopped being used at all while the app still produced correct answers, just slower.
 * (Measured on the 7-storey building: 2,4 s sequential against 478 ms across the pool.)
 *
 * Copying HERE rather than at each call site is deliberate: this is the last common point
 * before both consumers, so "the payload is plain data" holds for every caller, present and
 * future.
 */
/** A section as the engine takes it: the web-only fields (`bucklingCw`, `torsionGap`) left out. */
function wireSection3D(s: SolverSection3D): SolverSection3D {
  if (!('bucklingCw' in s) && !('torsionGap' in s)) return s;
  const { bucklingCw: _cw, torsionGap: _gap, ...wire } = s;
  return wire;
}

export function input3DToWireObject(input: SolverInput3D): Record<string, any> {
  return {
    nodes: mapToObj(input.nodes),
    materials: mapToObj(input.materials),
    sections: mapToObj(new Map(Array.from(input.sections, ([id, s]) => [id, wireSection3D(s)]))),
    elements: mapToObj(input.elements),
    supports: mapToObj(input.supports),
    loads: input.loads,
    plates: input.plates ? mapToPlainObj(input.plates) : {},
    quads: input.quads ? mapToPlainObj(input.quads) : {},
    curvedShells: input.curvedShells ? mapToPlainObj(input.curvedShells) : {},
    constraints: plainDeepCopy(input.constraints ?? []),
    connectors: input.connectors ? mapToPlainObj(input.connectors) : {},
    leftHand: input.leftHand ?? false,
    // Nodal, line and area masses (the mass source); absent when there are none.
    ...(input.masses ? { masses: plainDeepCopy(input.masses) } : {}),
  };
}

/** Serialize SolverInput3D (with Maps) to JSON string for WASM. */
export function serializeInput3D(input: SolverInput3D): string {
  return JSON.stringify(input3DToWireObject(input));
}

/**
 * The engine owns both B₂ and stability: a converged indefinite system is
 * still unstable. Only restore the Infinity that JSON encodes as null;
 * recomputing stability from displacement ratios hides postcritical states.
 */
function normalizePDeltaResult(result: any): any {
  return { ...result, b2Factor: result.b2Factor === null ? Infinity : result.b2Factor };
}

// ─── Guards of the advanced analyses ───────────────────────────

/**
 * What P-Δ, buckling, modal and plastic collapse borrow from the static solve.
 *
 * They are called with a solver input, here, and used to hand it straight to
 * the engine. The static solve refuses a model first — a stray node, a
 * mechanism, a load on nothing — and says why; these did not, so the same
 * model came back as "Singular stiffness matrix", "Eigenvalue decomposition
 * failed", a converged P-Δ with rotations of 1e11 rad, or the frequencies of a
 * beam on two rollers with its rigid-body mode quietly dropped.
 *
 * The checks and their words live with the solve (`solver-service.ts`), which
 * imports this module, and this module is also the solver worker's: importing
 * them back would be a cycle and would pull the i18n store into the worker. So
 * `solver-service.ts` lends them once, when it loads. Every path that runs an
 * analysis on a user's model loads it (the model store does); a caller that
 * imports only this module gets the engine as it is.
 */
export interface AdvancedGuards {
  /** The static solve's refusal of this plane model, or null. */
  refuse2D(input: SolverInput): string | null;
  /** The static solve's refusal of this space model, or null. */
  refuse3D(input: SolverInput3D): string | null;
  /** The input of a space eigenvalue analysis: orphan rotations held exactly. */
  eigenInput3D(input: SolverInput3D): SolverInput3D;
  /** A message in the active language. */
  text(key: string, params?: Record<string, string | number>): string;
}
let guards: AdvancedGuards | null = null;
export function setAdvancedGuards(g: AdvancedGuards | null): void { guards = g; }

/** The text of whatever an engine call threw: wasm-bindgen throws raw strings (`utils/error-text`). */
const thrownText = (e: unknown): string => errorText(e, String(e));

function refuse(msg: string | null | undefined): void {
  if (msg) throw new Error(msg);
}

const NO_FREE_DOFS = /^No free DOFs/;

/** Largest nodal translation or rotation of a result. */
function maxDisplacement(r: { displacements?: Array<Record<string, number>> } | undefined): number {
  let m = 0;
  for (const d of r?.displacements ?? []) {
    for (const [k, v] of Object.entries(d)) if (k !== 'nodeId' && typeof v === 'number') m = Math.max(m, Math.abs(v));
  }
  return m;
}

/**
 * A P-Δ result that is the linear solve: nothing moves (no loads, or every
 * degree of freedom restrained), so there is nothing to amplify. The engine's
 * iteration measures the relative change of a zero displacement, never passes
 * its tolerance and reported such a model as "not converged, unstable"; with
 * every DOF restrained it stopped at "No free DOFs". `notice` says which.
 */
function linearPDelta<R>(linear: R, notice: 'noLoads' | 'noFreeDofs') {
  return { results: linear, linearResults: linear, iterations: 0, converged: true, isStable: true, b2Factor: 1, amplification: [], notice };
}

/**
 * The dominant degree of freedom of a mode shape, to say where a discarded
 * zero mode moves.
 */
function dominantDof(mode: { displacements?: Array<Record<string, number>> }): { nodeId: number; dof: string } | null {
  let best: { nodeId: number; dof: string; v: number } | null = null;
  for (const d of mode.displacements ?? []) {
    for (const [k, v] of Object.entries(d)) {
      if (k === 'nodeId' || typeof v !== 'number') continue;
      if (!best || Math.abs(v) > best.v) best = { nodeId: d.nodeId, dof: k, v: Math.abs(v) };
    }
  }
  return best ? { nodeId: best.nodeId, dof: best.dof } : null;
}

/**
 * A frequency under this is none: no structure in this app sways once in 20 minutes.
 *
 * Each mode is judged by its own value, never against the largest one found: one spurious or very
 * stiff mode in the batch (a load factor of 1e12 from a bar with almost no axial force, a
 * 20 000 Hz local mode) raised a relative cut above the structure's real modes and threw them
 * away as mechanisms — the real λcr = 3,5 went, and 1e12 was shown as the critical factor.
 */
const NULL_FREQUENCY_HZ = 1e-3;
/** And a load factor under this is none: the mechanism's zero, 1e-12 as the engine returns it. */
const NULL_LOAD_FACTOR = 1e-6;

export interface DiscardedMode { value: number; nodeId: number; dof: string }

/**
 * Remove the modes of a mechanism from an eigenvalue result.
 *
 * A zero eigenvalue is a direction the structure moves in without deforming,
 * not a vibration and not a buckling load. The engine's own cut is absolute
 * (ω² ≤ 1e-10 in modal, none in buckling), so a mechanism the loads do not
 * excite — a column free to spin about its own axis, which the static solve
 * accepts — came back as a first mode of 2e-6 Hz, or as a critical load
 * factor of 1e-12 shown as "λ = 0.00". Those modes are taken out and listed in
 * `discardedModes`, with where they move, for the caller to say the structure
 * is a mechanism in that direction; if nothing else is left, the analysis is
 * refused with the static solve's words for a mechanism.
 */
function withoutNullModes<M extends { displacements?: Array<Record<string, number>> }>(
  modes: M[], value: (m: M) => number, floor: number,
): { kept: M[]; discarded: DiscardedMode[] } {
  const kept: M[] = [], discarded: DiscardedMode[] = [];
  for (const m of modes) {
    if (!(value(m) >= floor)) {
      const at = dominantDof(m);
      discarded.push({ value: value(m), nodeId: at?.nodeId ?? 0, dof: at?.dof ?? '' });
    } else kept.push(m);
  }
  return { kept, discarded };
}

function mechanismOnly(): never {
  throw new Error(guards ? guards.text('advanced.mechanismOnlyModes') : 'Every mode found is a mechanism (zero eigenvalue)');
}

/** A modal result without its null modes, the mass sums and Rayleigh damping taken over what is kept. */
export function filterModal<R extends { modes: any[]; rayleigh?: any; [k: string]: any }>(result: R, dirs: string[]): R & { discardedModes: DiscardedMode[] } {
  const { kept, discarded } = withoutNullModes(result.modes ?? [], (m: any) => m.frequency, NULL_FREQUENCY_HZ);
  if (!discarded.length) return { ...result, discardedModes: [] };
  if (!kept.length) mechanismOnly();
  const out: any = { ...result, modes: kept, discardedModes: discarded };
  for (const d of dirs) out[`cumulativeMassRatio${d}`] = kept.reduce((a: number, m: any) => a + (m[`massRatio${d}`] ?? 0), 0);
  if (result.rayleigh && Array.isArray(result.rayleigh.dampingRatios)) {
    // Same two-mode fit, on the first two modes that are vibrations. With one left it is that
    // mode twice (a0 = ξω, a1 = ξ/ω): the engine's own fit ran through the discarded mode.
    const w1 = kept[0].omega, w2 = kept[1]?.omega ?? w1, xi = result.rayleigh.dampingRatios[0] ?? 0.05;
    out.rayleigh = { ...result.rayleigh, omega1: w1, omega2: w2, a0: (2 * xi * w1 * w2) / (w1 + w2), a1: (2 * xi) / (w1 + w2) };
  }
  return out;
}

/** A buckling result without its null modes. */
export function filterBuckling<R extends { modes: any[]; [k: string]: any }>(result: R): R & { discardedModes: DiscardedMode[] } {
  const { kept, discarded } = withoutNullModes(result.modes ?? [], (m: any) => m.loadFactor, NULL_LOAD_FACTOR);
  if (!discarded.length) return { ...result, discardedModes: [] };
  if (!kept.length) mechanismOnly();
  return { ...result, modes: kept, discardedModes: discarded };
}

/** Whether a linear result compresses any member (the engine's own test, on the member's mean N). */
function compressesAny(r: { elementForces?: Array<{ nStart: number; nEnd: number }> }): boolean {
  return (r.elementForces ?? []).some((ef) => (ef.nStart + ef.nEnd) / 2 < -1e-6);
}

/**
 * Buckling or modal on a model with every degree of freedom restrained (a
 * fixed-fixed beam of one member): the engine's "No free DOFs" in English,
 * put as what it means for the user.
 */
function noFreeDofs(kind: 'buckling' | 'modal', linear?: () => { elementForces?: Array<{ nStart: number; nEnd: number }> }): never {
  if (!guards) throw new Error('No free DOFs');
  // A beam no bar of which is compressed has nothing to buckle either way; say that, as for any other.
  if (kind === 'buckling' && linear && !compressesAny(linear())) throw new Error('No compressed elements — buckling not applicable');
  throw new Error(guards.text(kind === 'buckling' ? 'advanced.noFreeDofsBuckling' : 'advanced.noFreeDofsModal'));
}

const DECOMPOSITION_FAILED = /Eigenvalue decomposition failed/;
const SUPPORT_FLAG_3D: Record<string, 'rx' | 'ry' | 'rz' | 'rrx' | 'rry' | 'rrz'> = {
  ux: 'rx', uy: 'ry', uz: 'rz', rx: 'rrx', ry: 'rry', rz: 'rrz',
};

/**
 * A space eigenvalue analysis of a mechanism the static solve accepts.
 *
 * The static solve refuses a mechanism only when its loads move it
 * (`excitedMechanism3D`): a column on a pin free to spin about its own axis,
 * with the beams at its head released, carries its loads and is solved. Its
 * stiffness is singular all the same, and the eigenvalue analyses either
 * returned the spin as a mode of zero (dropped by `withoutNullModes`) or
 * failed their decomposition outright. Here the engine's rank analysis names
 * the degrees of freedom that carry the mechanism, they are held for the
 * analysis, and each is reported back as a discarded mode, so the caller can
 * say that the structure is a mechanism there. Null when the rank analysis
 * finds no mechanism: then the failure is something else and stands.
 */
function holdMechanism3D(input: SolverInput3D): { input: SolverInput3D; held: DiscardedMode[] } | null {
  let k;
  try { k = analyzeKinematics3D(input); } catch { return null; }
  const dofs: Array<{ nodeId: number; dof: string }> = k?.unconstrainedDofs ?? [];
  if (!(k?.mechanismModes > 0) || !dofs.length) return null;
  const supports = new Map(input.supports);
  const byNode = new Map<number, number>();
  for (const [id, sp] of supports) byNode.set(sp.nodeId, id);
  let nextId = Math.max(0, ...supports.keys()) + 1;
  const held: DiscardedMode[] = [];
  for (const { nodeId, dof } of dofs) {
    const flag = SUPPORT_FLAG_3D[dof];
    if (!flag) return null;
    const id = byNode.get(nodeId);
    const sp = id !== undefined ? { ...supports.get(id)! }
      : { nodeId, rx: false, ry: false, rz: false, rrx: false, rry: false, rrz: false, stabilised: 'created' as const };
    sp[flag] = true;
    if (id !== undefined) supports.set(id, sp);
    else { byNode.set(nodeId, nextId); supports.set(nextId++, sp); }
    held.push({ value: 0, nodeId, dof });
  }
  return { input: { ...input, supports }, held };
}

/** Run a space eigenvalue analysis, holding an unexcited mechanism if its decomposition fails. */
function eigen3D<R>(input: SolverInput3D, run: (i: SolverInput3D) => R): { result: R; held: DiscardedMode[] } {
  try {
    return { result: run(input), held: [] };
  } catch (e) {
    if (!guards || !DECOMPOSITION_FAILED.test(thrownText(e))) throw e;
    const hold = holdMechanism3D(input);
    if (!hold) throw e;
    return { result: run(hold.input), held: hold.held };
  }
}

// ─── Solver functions ───────────────────────────────────────────

/** Solve 2D linear static analysis via WASM. JsValue in/out — no JSON round trip. */
export function solve(input: SolverInput): AnalysisResults {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolve2d) throw new Error('WASM solver not initialized. Call initSolver() first.');
  const wire = input2DToWireObject(input);
  assertFiniteWire(wire);
  return wasmSolve2d(wire);
}

/** Solve 3D linear static analysis via WASM. JsValue in/out — no JSON round trip. */
export function solve3D(input: SolverInput3D): AnalysisResults3D {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolve3d) throw new Error('WASM solver not initialized. Call initSolver() first.');
  const wire = input3DToWireObject(input);
  assertFiniteWire(wire);
  // Intercept console.error to capture Rust panic messages from console_error_panic_hook
  const captured: string[] = [];
  const origError = console.error;
  console.error = (...args: any[]) => { captured.push(args.map(String).join(' ')); origError.apply(console, args); };
  try {
    return finishSolve3D(wasmSolve3d(wire), input);
  } catch (e: any) {
    // Include captured panic message in the error for better diagnostics
    const panicMsg = captured.length > 0 ? captured.join('\n') : '';
    const base = e?.message ?? String(e);
    throw new Error(panicMsg ? `${base}\n[WASM panic]: ${panicMsg}` : base);
  } finally {
    console.error = origError;
  }
}

/** Lazy construction preserves per-position error handling and avoids preparing
 * an already-cancelled run. Each session owns an immutable native model snapshot. */
function loadSession<L, R>(Constructor: LoadSessionConstructor | null, wire: () => Record<string, unknown>,
  fallback: (loads: L[]) => R, finish: (result: R, loads: L[]) => R) {
  const release = calculationLease();
  let native: NativeLoadSession | null = null;
  let closed = false;
  let attempted = false;
  let failure: unknown;
  let failed = false;
  const useNative = preparedLoadSessionsEnabled && Constructor !== null;
  return {
    solve(loads: L[]): R {
      if (closed) throw new Error('Load session has been freed');
      if (!useNative) return fallback(loads);
      if (!attempted) {
        attempted = true;
        try { const input = wire(); assertFiniteWire(input); native = new Constructor!(input); }
        catch (e) { failure = e; failed = true; }
      }
      if (failed) throw failure;
      assertFiniteWire(loads, 'loads');
      return finish(native!.solve(loads), loads);
    },
    free() { if (!closed) { closed = true; try { native?.free(); } finally { native = null; release(); } } },
  };
}
export function prepareLoadSession2D(input: SolverInput) {
  return loadSession<import('./types').SolverLoad, AnalysisResults>(loadSession2D,
    () => input2DToWireObject({ ...input, loads: [] }),
    loads => solve({ ...input, loads }), result => result);
}
export function prepareLoadSession3D(input: SolverInput3D) {
  return loadSession<import('./types-3d').SolverLoad3D, AnalysisResults3D>(loadSession3D,
    () => input3DToWireObject({ ...input, loads: [] }),
    loads => solve3D({ ...input, loads }), (result, loads) => finishSolve3D(result, { ...input, loads }));
}

// ─── Certified results (docs/verification/CERTIFY.md) ──────────

/**
 * A rigorous a-posteriori bound on the linear static solution, proved in Lean
 * (`verify/Certify`). `absBound` bounds ‖u* − ũ‖₂ over every free DOF (m and rad
 * mixed); `relBound` is `absBound / ‖ũ‖₂`, null when that is +∞.
 */
export type LinearCertificate =
  | { status: 'certified'; absBound: number; relBound: number | null; sigma: number; residualNorm: number }
  | { status: 'uncertified'; reason: string };

/** Per-member bound on |force(exact) − force(computed)|, kN / kN·m. */
export interface ForceBound2D { elementId: number; n: number; v: number; m: number }
/**
 * Per-member bound on |force(exact) − force(computed)|, local axes, kN / kN·m. `bimoment`
 * (kN·m², warping members; 0 otherwise) is null when it is unbounded.
 */
export interface ForceBound3D { elementId: number; n: number; vy: number; vz: number; t: number; my: number; mz: number; bimoment?: number | null }
/**
 * Per-shell bound on |resultant(exact) − resultant(computed)|, element axes, in the units the
 * solver reports them. `kind` keys the element: quads, plates and 9-node quads count ids apart.
 */
export interface ShellBound {
  elementId: number; kind: 'quad' | 'plate' | 'quad9';
  sigmaXx: number; sigmaYy: number; tauXy: number; mx: number; my: number; mxy: number;
  qx: number | null; qy: number | null;
}

/**
 * Per-member bound on |diagram(exact) − diagram(computed)|, valid at every point along the member
 * (so also for the extremes over any stations), kN / kN·m. `gaps`: how far the computed diagram
 * can rise above its largest station value (fall below its smallest) between stations, so the
 * exact extreme along the member lies within ±(bound + gap) of the station extreme shown. Absent
 * for envelopes.
 */
export interface StationBound2D {
  elementId: number; axial: number; shear: number; moment: number;
  gaps?: { axial: number; shear: number; moment: number };
}
export interface StationBound3D {
  elementId: number; axial: number; shearY: number; shearZ: number; torsion: number; momentY: number; momentZ: number;
  gaps?: { axial: number; shearY: number; shearZ: number; torsion: number; momentY: number; momentZ: number };
}
/** Per-member bound on every displayed translation of its deflection curve, at every point (m). */
export interface DeflectionBound { elementId: number; displacement: number }
/** Per-node bound on |reaction(exact) − reaction(reported)| (kN, kN·m). */
export interface ReactionBound2D { nodeId: number; rx: number; rz: number; my: number }
export interface ReactionBound3D { nodeId: number; fx: number; fy: number; fz: number; mx: number; my: number; mz: number }

/** The bounds on what the views compute after the solve (docs/verification/CERTIFY.md). */
export interface ShownBounds<S = StationBound2D | StationBound3D, R = ReactionBound2D | ReactionBound3D> {
  stationBounds?: S[];
  deflectionBounds?: DeflectionBound[];
  reactionBounds?: R[];
  /** Why reactions are not bounded (constraints, inclined supports), when they are not. */
  reactionReason?: string;
}

/**
 * The linear result checked against an independent re-assembly of the model (docs/verification/
 * CERTIFY.md, "End-to-end certificates"): `certified` bounds ‖u* − ũ‖₂ for the exact solution of the
 * model as written, over every DOF it determines; `failed` means the engine's K, f or displacements
 * disagree with the model; `uncertified` / `outOfScope` / `notChecked` say why there is no such bound.
 */
export type EndToEnd =
  | { status: 'certified'; absBound: number; relBound: number | null; mu: number; residualNorm: number;
      kDiscrepancy: number; fDiscrepancy: number; excludedDofs: Array<{ nodeId: number; dof: number }> }
  | { status: 'failed' | 'uncertified' | 'outOfScope'; reason: string }
  | { status: 'notChecked' };
/** How much of model → K → result a certified linear result covers. */
export type CertificateLevel = 'endToEnd' | 'assembled' | 'none';
/** The end-to-end fields of a certified linear answer (absent from older WASM builds). */
export interface EndToEndFields { endToEnd?: EndToEnd; certificateLevel?: CertificateLevel }

export interface CertifiedLinear2D extends ShownBounds<StationBound2D, ReactionBound2D>, EndToEndFields { results: AnalysisResults; certificate: LinearCertificate; forceBounds: ForceBound2D[] }
export interface CertifiedLinear3D extends ShownBounds<StationBound3D, ReactionBound3D>, EndToEndFields { results: AnalysisResults3D; certificate: LinearCertificate; forceBounds: ForceBound3D[]; shellBounds?: ShellBound[] }

/** One load case of a certified multi-case solve: a linear certificate of its own. */
export interface CaseCertificate<F> extends ShownBounds { name: string; certificate: LinearCertificate; forceBounds: F[] }
/**
 * A combination, or the envelope, of a certified multi-case solve. `dispAbsBound` bounds
 * ‖u*_c − ũ_c‖₂ (the envelope: every max-abs value within it of the exact envelope).
 */
export interface CombinationCertificate<F, S> {
  name: string; certified: boolean; reason?: string;
  dispAbsBound: number | null; forceBounds: F[]; stationBounds: S[];
  deflectionBounds?: DeflectionBound[]; reactionBounds?: Array<ReactionBound2D | ReactionBound3D>;
}
/** `certify_multi_case_2d/3d` without its results (the solve's, already on screen). */
export interface MultiCaseCertificate<F = ForceBound2D | ForceBound3D, S = StationBound2D | StationBound3D> {
  cases: CaseCertificate<F>[];
  combinations: CombinationCertificate<F, S>[];
  envelope: CombinationCertificate<F, S>;
}

/**
 * The structure is certified stable for every load factor ≤ `lambdaLower`, and
 * certified unstable at `lambdaUpper` (null when the computed mode gave no bound).
 */
export type BucklingCertificate =
  | { status: 'certified'; lambdaLower: number; lambdaUpper: number | null; lambdaComputed: number }
  | { status: 'uncertified'; reason: string };

/** Whether this WASM build carries the certificate exports. */
export function hasCertifyExport(): boolean {
  return wasmCertifyLinear2d !== null && wasmCertifyLinear3d !== null;
}

/** Solve and certify a 2D linear static analysis (a few times the cost of `solve`). */
export function certifyLinear2D(input: SolverInput): CertifiedLinear2D {
  if (!wasmReady || !wasmCertifyLinear2d) throw new Error('WASM certificate export not available.');
  const wire = input2DToWireObject(input);
  assertFiniteWire(wire);
  return wasmCertifyLinear2d(wire);
}

/** Solve and certify a 3D linear static analysis (a few times the cost of `solve3D`). */
export function certifyLinear3D(input: SolverInput3D): CertifiedLinear3D {
  if (!wasmReady || !wasmCertifyLinear3d) throw new Error('WASM certificate export not available.');
  const wire = input3DToWireObject(input);
  assertFiniteWire(wire);
  const out: CertifiedLinear3D = wasmCertifyLinear3d(wire);
  finishSolve3D(out.results, input);
  return out;
}

/** The certificate of a solve already prepared as a wire object, on this thread (the worker's fallback). */
export function certifyLinearWire(dim: '2d' | '3d', wire: Record<string, any>): LinearCertificateOnly {
  const certify = { '2d': wasmCertifyLinear2d, '3d': wasmCertifyLinear3d }[dim];
  if (!wasmReady || !certify) throw new Error('WASM certificate export not available.');
  assertFiniteWire(wire);
  return certificateOnly(certify(wire));
}

/** A linear certificate without the results it re-solved (3D carries the shells' bounds). */
export interface LinearCertificateOnly extends ShownBounds, EndToEndFields {
  certificate: LinearCertificate; forceBounds: Array<ForceBound2D | ForceBound3D>; shellBounds?: ShellBound[];
}

/** A certify answer without its results (what a worker posts back). */
export function certificateOnly(out: LinearCertificateOnly & { results?: unknown }): LinearCertificateOnly {
  const { certificate, forceBounds, shellBounds, stationBounds, deflectionBounds, reactionBounds, reactionReason, endToEnd, certificateLevel } = out;
  return { certificate, forceBounds, shellBounds: shellBounds ?? [], stationBounds, deflectionBounds, reactionBounds, reactionReason, endToEnd, certificateLevel };
}

/**
 * The engine's other certify exports, by name, called through `callCertify` (`certify-jobs.ts`
 * runs them in a worker when there is one). Absent from older WASM builds.
 */
const CERTIFY_EXPORTS = [
  'certify_multi_case_2d', 'certify_multi_case_3d',
  'certify_modal_2d', 'certify_modal_3d', 'certify_pdelta_2d', 'certify_pdelta_3d',
  'certify_spectral_2d', 'certify_spectral_3d', 'certify_harmonic_2d', 'certify_harmonic_3d',
  'certify_time_history_2d', 'certify_time_history_3d', 'certify_plastic_2d',
  'certify_steel_members', 'certify_ec3_members', 'certify_ec2_members',
  'certify_cirsoc201_members', 'certify_rc_members', 'certify_timber_members', 'certify_cfs_members',
  'export_linear_bundle_2d', 'export_linear_bundle_3d',
  'export_plastic_bundle_2d', 'export_plastic_bundle_3d',
  'export_combination_bundle_2d', 'export_combination_bundle_3d',
  // Not a certificate, but the same kind of job: a re-solve to hash, run off the main thread
  // (`store/result-provenance.ts` ensureEngineHashes).
  'engine_reproduce_hashes',
  // Not certificates: the discretization-error estimate and convergence check
  // (docs/verification/DISCRETIZATION.md) ride the same worker path because they re-solve too.
  'estimate_discretization_3d', 'convergence_study_3d',
] as const;
export type CertifyExport = (typeof CERTIFY_EXPORTS)[number];

/** The registry itself, for tests that walk it. */
export const CERTIFY_EXPORT_NAMES: readonly CertifyExport[] = CERTIFY_EXPORTS;

/**
 * Whether `name` is one of the exports above: the one registry both the main thread and the
 * worker (`solver-worker.ts`) dispatch by, so an export added here runs in the worker too (the
 * worker used to keep its own name pattern, and the discretization exports, which match none of
 * it, failed there while working on the main thread).
 */
export function isCertifyExport(name: string): name is CertifyExport {
  return (CERTIFY_EXPORTS as readonly string[]).includes(name);
}
const certifyExports = new Map<string, (...args: any[]) => any>();

/** Whether this WASM build carries the certify export `name`. */
export function hasCertify(name: string): boolean {
  return certifyExports.has(name);
}

/**
 * Call a certify export on this thread. A JSON-string answer is parsed, except a certificate
 * bundle's (`export_*_bundle_*`), which is returned as the text to save. The `results`
 * the certifying exports carry (a re-solve of what is on screen) are dropped.
 */
export function callCertify(name: string, args: unknown[]): any {
  const fn = certifyExports.get(name);
  if (!wasmReady || !fn) throw new Error(`WASM certificate export ${name} not available.`);
  for (const a of args) if (a && typeof a === 'object') assertFiniteWire(a);
  return readCertifyAnswer(name, fn(...args));
}

/** A certify export's answer as the callers read it (shared with the worker). */
export function readCertifyAnswer(name: string, raw: unknown): any {
  if (name.startsWith('export_')) return raw;
  const out = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (out && typeof out === 'object' && !Array.isArray(out)) {
    const { results: _r, ...rest } = out as Record<string, unknown>;
    // `certify_steel_multi_case_*` nests the analysis, results and all.
    if (rest.analysis && typeof rest.analysis === 'object') { const { results: _a, ...analysis } = rest.analysis as Record<string, unknown>; rest.analysis = analysis; }
    return rest;
  }
  return out;
}

/** 2D buckling with its certificate, through the same guards as `solveBuckling`. */
export function certifyBuckling2D(input: SolverInput, numModes = 4) {
  if (!wasmCertifyBuckling2d) throw new Error('WASM certificate export not available.');
  return solveBuckling(input, numModes);
}

/** 3D buckling with its certificate, through the same guards as `solveBuckling3D`. */
export function certifyBuckling3D(input: SolverInput3D, numModes = 4) {
  if (!wasmCertifyBuckling3d) throw new Error('WASM certificate export not available.');
  return solveBuckling3D(input, numModes);
}

/**
 * The buckling result with its certificate attached, or null to solve it plainly:
 * no certify export, or the certifier threw (the plain solve then reports its own error).
 */
function bucklingWithCertificate(certify: ((json: string, numModes: number) => string) | null, json: string, numModes: number): any | null {
  if (!certify) return null;
  try {
    const out = JSON.parse(certify(json, numModes));
    return { ...out.results, certificate: out.certificate as BucklingCertificate };
  } catch {
    return null;
  }
}

/** A certificate is about the first engine mode; once null modes are discarded it no longer describes what is shown. */
function withoutStaleCertificate<R extends { discardedModes: DiscardedMode[]; certificate?: BucklingCertificate }>(r: R): R {
  if (r.certificate && r.discardedModes.length > 0) { const { certificate: _, ...rest } = r; return rest as R; }
  return r;
}

/** Solve 2D P-Delta analysis via WASM. */
export function solvePDelta(input: SolverInput, maxIter = 20, tolerance = 1e-4) {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolvePdelta2d) throw new Error('WASM solver not initialized.');
  refuse(guards?.refuse2D(input));
  const merged = mergeAllHingedJoints2D(input);
  let result;
  const json = serializeInput2D(merged);
  try {
    result = normalizePDeltaResult(JSON.parse(wasmSolvePdelta2d(json, maxIter, tolerance)));
  } catch (e) {
    if (guards && NO_FREE_DOFS.test(thrownText(e))) return linearPDelta(solve(merged), 'noFreeDofs');
    throw e;
  }
  if (guards && result.linearResults && !(maxDisplacement(result.linearResults) > 0)) return linearPDelta(result.linearResults, 'noLoads');
  return tagCertifyJob(result, { name: 'certify_pdelta_2d', args: [json, maxIter, tolerance] });
}

/** Solve 2D buckling analysis via WASM. */
export function solveBuckling(input: SolverInput, numModes = 4) {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveBuckling2d) throw new Error('WASM solver not initialized.');
  refuse(guards?.refuse2D(input));
  // A joint where every member is hinged leaves a rotation that is its own
  // spurious first mode, and a node only truss bars meet one that breaks the
  // decomposition; see orphan-rotations-2d.ts.
  const merged = mergeAllHingedJoints2D(input);
  let result;
  try {
    const json = serializeInput2D(restrainOrphanRotations2D(merged));
    result = bucklingWithCertificate(wasmCertifyBuckling2d, json, numModes) ?? JSON.parse(wasmSolveBuckling2d(json, numModes));
  } catch (e) {
    if (NO_FREE_DOFS.test(thrownText(e))) noFreeDofs('buckling', () => solve(merged));
    throw e;
  }
  return withoutStaleCertificate(filterBuckling(result));
}

/** Solve 2D modal analysis via WASM. */
export function solveModal(
  input: SolverInput,
  densities: Map<number, number>,
  numModes = 6,
) {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveModal2d) throw new Error('WASM solver not initialized.');
  refuse(guards?.refuse2D(input));
  input = restrainOrphanRotations2D(mergeAllHingedJoints2D(input));
  // The whole model, constraints and connectors included, as every other 2D analysis sends it.
  const payload = JSON.stringify({
    solver: input2DToWireObject(input),
    densities: mapToObj(densities),
  });
  let result;
  try {
    result = JSON.parse(wasmSolveModal2d(payload, numModes));
  } catch (e) {
    if (NO_FREE_DOFS.test(thrownText(e))) noFreeDofs('modal');
    throw e;
  }
  return tagCertifyJob(filterModal(result, ['X', 'Y']), { name: 'certify_modal_2d', args: [payload, numModes] });
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
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveSpectral2d) throw new Error('WASM solver not available.');
  config = { ...config, solver: mergeAllHingedJoints2D(config.solver) };
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
  return tagCertifyJob(JSON.parse(resultJson), { name: 'certify_spectral_2d', args: [payload] });
}

/** Solve 2D plastic analysis via WASM. */
export function solvePlastic(config: {
  solver: SolverInput;
  sections: Map<number, { a: number; iz: number; materialId: number; b?: number; h?: number }>;
  materials: Map<number, { fy?: number }>;
  maxHinges?: number;
  mpOverrides?: Map<number, number>;
}) {
  assertCalculationsAllowed();
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
  assertCalculationsAllowed();
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

/**
 * Solve 3D P-Delta analysis via WASM, as the engine answers. Its member forces are
 * (K + Kg(N))·u − FEF, the geometric stiffness included, so they balance the reactions.
 */
export function solvePDelta3D(input: SolverInput3D, maxIter = 20, tolerance = 1e-4) {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolvePdelta3d) throw new Error('WASM P-Delta 3D solver not available.');
  const wire = input3DToWireObject(input);
  refuse(guards?.refuse3D(input));
  refuse(torsionGapRefusal(input, 'pdelta'));
  let result;
  const json = JSON.stringify(wire);
  try {
    result = JSON.parse(wasmSolvePdelta3d(json, maxIter, tolerance));
  } catch (e) {
    if (guards && NO_FREE_DOFS.test(thrownText(e))) return linearPDelta(solve3D(input), 'noFreeDofs');
    throw e;
  }
  // Same as `solve3D` (`solve-finish.ts`). The no-free-DOF answer above is solve3D's, already finished.
  finishPDelta3D(result, input);
  if (guards && result?.linearResults && !(maxDisplacement(result.linearResults) > 0)) return linearPDelta(result.linearResults, 'noLoads');
  return tagCertifyJob(normalizePDeltaResult(result), { name: 'certify_pdelta_3d', args: [json, maxIter, tolerance] });
}

/** Solve 3D modal analysis via WASM. */
export function solveModal3D(input: SolverInput3D, densities: Map<number, number>, numModes = 6) {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveModal3d) throw new Error('WASM Modal 3D solver not available.');
  refuse(guards?.refuse3D(input));
  let run;
  let payload = '';
  try {
    run = eigen3D(guards ? guards.eigenInput3D(input) : input, (i) => JSON.parse(wasmSolveModal3d!(payload = JSON.stringify({
      // The whole model, through the same serializer every other 3D analysis uses. This built its
      // own subset and left out quads, plates, constraints and connectors — so a slab contributed
      // neither stiffness nor mass to PRO's modal analysis.
      solver: input3DToWireObject(i),
      densities: mapToObj(densities),
    }), numModes)));
  } catch (e) {
    if (NO_FREE_DOFS.test(thrownText(e))) noFreeDofs('modal');
    throw e;
  }
  const out = filterModal(run.result, ['X', 'Y', 'Z']);
  return tagCertifyJob({ ...out, discardedModes: [...run.held, ...out.discardedModes] }, { name: 'certify_modal_3d', args: [payload, numModes] });
}

/** Solve 3D buckling analysis via WASM. */
export function solveBuckling3D(input: SolverInput3D, numModes = 4) {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveBuckling3d) throw new Error('WASM Buckling 3D solver not available.');
  refuse(guards?.refuse3D(input));
  refuse(torsionGapRefusal(input, 'buckling'));
  // Cw for the members that can take it, from their axial forces in the linear solve
  // (`buckling-warping.ts`). The static solve itself never sees `cw`.
  let axial: Map<number, number> | null = null;
  if (hasBucklingWarping(input)) {
    try {
      axial = new Map(solve3D(input).elementForces.map((f) => [f.elementId, (f.nStart + f.nEnd) / 2]));
    } catch { axial = null; /* The buckling solve below says why. */ }
  }
  let warpingMembers: number[] = [];
  let run;
  try {
    run = eigen3D(guards ? guards.eigenInput3D(input) : input, (i) => {
      const w = axial ? bucklingWarpingInput(i, axial) : { input: i, warped: [] };
      warpingMembers = w.warped;
      const json = serializeInput3D(w.input);
      return bucklingWithCertificate(wasmCertifyBuckling3d, json, numModes) ?? JSON.parse(wasmSolveBuckling3d!(json, numModes));
    });
  } catch (e) {
    if (NO_FREE_DOFS.test(thrownText(e))) noFreeDofs('buckling', () => solve3D(input));
    throw e;
  }
  const out = filterBuckling(run.result);
  return withoutStaleCertificate({ ...out, discardedModes: [...run.held, ...out.discardedModes], warpingMembers });
}

/**
 * The refusal of an analysis whose geometric stiffness needs a section's torsional data and does
 * not have it (`buckling-warping.ts`, `torsionGaps3D`): no J, or no shear centre for a tee,
 * channel or angle. Null when nothing is missing.
 */
export function torsionGapRefusal(input: SolverInput3D, analysis: 'buckling' | 'pdelta' | 'nonlinear'): string | null {
  const gaps = torsionGaps3D(input);
  if (gaps.length === 0) return null;
  const g = gaps[0]!;
  const list = g.elements.slice(0, 8).join(', ') + (g.elements.length > 8 ? ', …' : '');
  const params = { section: g.sectionName ? `${g.sectionId} (${g.sectionName})` : String(g.sectionId), members: list, analysis: guards ? guards.text(`svc.torsionGap.analysis.${analysis}`) : analysis };
  if (guards) return guards.text(g.kind === 'j' ? 'svc.torsionGap.j' : 'svc.torsionGap.shearCentre', params);
  return g.kind === 'j'
    ? `Section ${params.section} has no torsion constant J (members ${list}): ${analysis} cannot form their torsional buckling.`
    : `Section ${params.section} has no shear centre (members ${list}): ${analysis} cannot form their flexural-torsional buckling.`;
}

/**
 * Solve 3D spectral analysis via WASM, for ONE direction.
 *
 * The fields are `SpectralInput3D`'s, one for one. The previous signature took `directions`,
 * `combination` and `numModes`, none of which the struct has, and omitted `modes` and
 * `direction`, which it requires — every call failed to deserialise. The engine combines one
 * direction per run; run it once per direction.
 */
export function solveSpectral3D(config: {
  solver: SolverInput3D;
  modes: SpectralModeInput3D[];
  densities: Map<number, number>;
  spectrum: { name: string; points: { period: number; sa: number }[]; inG?: boolean };
  direction: 'X' | 'Y' | 'Z';
  rule: 'SRSS' | 'CQC';
  xi?: number;
  importanceFactor?: number;
  reductionFactor?: number;
}) {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveSpectral3d) throw new Error('WASM Spectral 3D solver not available.');
  const payload = JSON.stringify({
    solver: input3DToWireObject(config.solver),
    modes: config.modes,
    densities: mapToObj(config.densities),
    spectrum: config.spectrum,
    direction: config.direction,
    rule: config.rule,
    xi: config.xi,
    importanceFactor: config.importanceFactor,
    reductionFactor: config.reductionFactor,
  });
  const resultJson = wasmSolveSpectral3d(payload);
  return tagCertifyJob(JSON.parse(resultJson), { name: 'certify_spectral_3d', args: [payload] });
}

/** Solve 2D corotational (large displacement) analysis via WASM. */
export function solveCorotational2D(input: SolverInput, maxIter = 50, tolerance = 1e-6, nIncrements = 10) {
  assertCalculationsAllowed();
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
  assertCalculationsAllowed();
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
  return tagCertifyJob(JSON.parse(resultJson), { name: 'certify_time_history_2d', args: [payload] });
}

// ─── Kinematic analysis ──────────────────────────────────────────

/** Analyze 2D kinematic stability via WASM. */
export function analyzeKinematics(input: SolverInput) {
  if (!wasmReady || !wasmAnalyzeKinematics2d) throw new Error('WASM solver not initialized.');
  const json = serializeInput2D(input);
  return JSON.parse(wasmAnalyzeKinematics2d(json));
}

/**
 * The engine's model sanity review (`engine/src/sanity`): JSON `SanityInput` in, `SanityReport`
 * out. Null when the WASM build has no such export, so a caller can say the review did not run.
 */
export function reviewModelSanityWasm(json: string): string | null {
  if (!wasmReady || !wasmReviewModelSanity) return null;
  return wasmReviewModelSanity(json);
}

/** Analyze 3D kinematic stability via WASM. */
export function analyzeKinematics3D(input: SolverInput3D) {
  if (!wasmReady || !wasmAnalyzeKinematics3d) throw new Error('WASM solver not initialized.');
  const json = serializeInput3D(input);
  return JSON.parse(wasmAnalyzeKinematics3d(json));
}

// ─── Combinations & Envelope ─────────────────────────────────────

/** Combine 2D results with factors via WASM. JsValue in/out — no JSON round trip. */
export function combineResults(
  factors: Array<{ caseId: number; factor: number }>,
  perCase: Map<number, AnalysisResults>,
): AnalysisResults | null {
  if (!wasmReady || !wasmCombineResults2d) throw new Error('WASM solver not initialized.');
  const cases = factors
    .filter(f => perCase.has(f.caseId))
    .map(f => ({ caseId: f.caseId, results: perCase.get(f.caseId)! }));
  if (cases.length === 0) return null;
  // Guard the FACTORS only (user data, cheap). The per-case results are solver
  // output — produced after the input-side guard already rejected non-finite
  // model data — so re-walking multi-MB result trees per combo was pure cost.
  assertFiniteWire(factors);
  return wasmCombineResults2d({ factors, cases });
}

/** Combine 3D results with factors via WASM. JsValue in/out — no JSON round trip. */
export function combineResults3D(
  factors: Array<{ caseId: number; factor: number }>,
  perCase: Map<number, AnalysisResults3D>,
): AnalysisResults3D | null {
  if (!wasmReady || !wasmCombineResults3d) throw new Error('WASM solver not initialized.');
  const cases = factors
    .filter(f => perCase.has(f.caseId))
    .map(f => ({ caseId: f.caseId, results: perCase.get(f.caseId)! }));
  if (cases.length === 0) return null;
  // Same rationale as combineResults: guard factors (cheap), trust solver output.
  assertFiniteWire(factors);
  return wasmCombineResults3d({ factors, cases });
}

/** Compute 2D envelope via WASM. JsValue in/out — no JSON round trip. */
export function computeEnvelope(results: AnalysisResults[]): FullEnvelope | null {
  if (!wasmReady || !wasmComputeEnvelope2d) throw new Error('WASM solver not initialized.');
  if (results.length === 0) return null;
  // Solver output — no guard (see combineResults).
  return wasmComputeEnvelope2d(results);
}

/** Compute 3D envelope via WASM. JsValue in/out — no JSON round trip. */
export function computeEnvelope3D(results: AnalysisResults3D[]): FullEnvelope3D | null {
  if (!wasmReady || !wasmComputeEnvelope3d) throw new Error('WASM solver not initialized.');
  if (results.length === 0) return null;
  // Solver output — no guard (see combineResults).
  return wasmComputeEnvelope3d(results);
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

/** Compute 3D section stress from raw forces via WASM. */
export function computeSectionStress3DFromForces(input: {
  N: number; Vy: number; Vz: number; Mx: number; My: number; Mz: number;
  section: any;
  fy?: number | null;
  yFiber?: number | null;
  zFiber?: number | null;
}) {
  if (!wasmReady || !wasmComputeSectionStress3dFromForces) throw new Error('WASM solver not initialized.');
  return JSON.parse(wasmComputeSectionStress3dFromForces(JSON.stringify(input)));
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

/** Compute 2D diagram value at position t for one element via WASM. Returns null if WASM not available. */
export function computeDiagramValueAtWasm(kind: string, t: number, elementForces: any): number | null {
  if (!wasmReady || !wasmComputeDiagramValueAt) return null;
  return wasmComputeDiagramValueAt(JSON.stringify({ kind, t, elementForces }));
}

/** Compute 3D diagram value at position t for one element via WASM. Returns null if WASM not available. */
export function computeDiagramValueAt3DWasm(kind: string, t: number, elementForces: any): number | null {
  if (!wasmReady || !wasmComputeDiagramValueAt3d) return null;
  return wasmComputeDiagramValueAt3d(JSON.stringify({ kind, t, elementForces }));
}

/** Check if WASM solver is ready. */
export function isWasmReady(): boolean {
  return wasmReady;
}

// ─── Design Check Wrappers ───────────────────────────────────────
// Each returns the engine's parsed results, or throws: `EngineUnavailableError` when the engine
// (or this checker in the loaded build) is missing, `EngineCheckError` carrying the engine's own
// message when the check fails. They used to turn every failure into `null`, which lost the
// engine's reason; a caller that catches must still treat the member as not verified.

function runDesignCheck(what: string, check: ((json: string) => string) | null, input: unknown): any {
  if (!wasmReady || !check) throw new EngineUnavailableError(what);
  let raw: string;
  try { raw = check(JSON.stringify(input)); }
  catch (e) { throw new EngineCheckError(what, errorText(e, 'the engine raised an error without a message')); }
  try { return JSON.parse(raw); }
  catch (e) { throw new EngineCheckError(what, `unreadable answer (${errorText(e, 'not JSON')})`); }
}

/** AISC 360 LRFD steel member checks via WASM. Throws `EngineUnavailableError` without the engine, `EngineCheckError` with the engine's message when it fails. */
export function checkSteelMembers(input: any): any {
  return runDesignCheck('AISC 360 LRFD steel member checks', wasmCheckSteelMembers, input);
}

/** Reinforced concrete member checks via WASM. Throws `EngineUnavailableError` without the engine, `EngineCheckError` with the engine's message when it fails. */
export function checkRcMembers(input: any): any {
  return runDesignCheck('reinforced concrete member checks', wasmCheckRcMembers, input);
}

/** Timber member checks via WASM. Throws `EngineUnavailableError` without the engine, `EngineCheckError` with the engine's message when it fails. */
export function checkTimberMembers(input: any): any {
  return runDesignCheck('timber member checks', wasmCheckTimberMembers, input);
}

/** Eurocode 3 steel member checks via WASM. Throws `EngineUnavailableError` without the engine, `EngineCheckError` with the engine's message when it fails. */
export function checkEc3Members(input: any): any {
  return runDesignCheck('Eurocode 3 steel member checks', wasmCheckEc3Members, input);
}

/** Eurocode 2 RC member checks via WASM. Throws `EngineUnavailableError` without the engine, `EngineCheckError` with the engine's message when it fails. */
export function checkEc2Members(input: any): any {
  return runDesignCheck('Eurocode 2 RC member checks', wasmCheckEc2Members, input);
}

/** CIRSOC 201 RC member checks via WASM. Throws `EngineUnavailableError` without the engine, `EngineCheckError` with the engine's message when it fails. */
export function checkCirsoc201Members(input: any): any {
  return runDesignCheck('CIRSOC 201 RC member checks', wasmCheckCirsoc201Members, input);
}

/** Cold-formed steel member checks via WASM. Throws `EngineUnavailableError` without the engine, `EngineCheckError` with the engine's message when it fails. */
export function checkCfsMembers(input: any): any {
  return runDesignCheck('cold-formed steel member checks', wasmCheckCfsMembers, input);
}

/** Masonry member checks via WASM. Throws `EngineUnavailableError` without the engine, `EngineCheckError` with the engine's message when it fails. */
export function checkMasonryMembers(input: any): any {
  return runDesignCheck('masonry member checks', wasmCheckMasonryMembers, input);
}

/** Serviceability checks (deflection/vibration) via WASM. Throws `EngineUnavailableError` without the engine, `EngineCheckError` with the engine's message when it fails. */
export function checkServiceability(input: any): any {
  return runDesignCheck('serviceability checks (deflection/vibration)', wasmCheckServiceability, input);
}

/** Bolt group capacity checks via WASM. Throws `EngineUnavailableError` without the engine, `EngineCheckError` with the engine's message when it fails. */
export function checkBoltGroups(input: any): any {
  return runDesignCheck('bolt group capacity checks', wasmCheckBoltGroups, input);
}

/** Weld group capacity checks via WASM. Throws `EngineUnavailableError` without the engine, `EngineCheckError` with the engine's message when it fails. */
export function checkWeldGroups(input: any): any {
  return runDesignCheck('weld group capacity checks', wasmCheckWeldGroups, input);
}

/** Spread footing bearing checks via WASM. Throws `EngineUnavailableError` without the engine, `EngineCheckError` with the engine's message when it fails. */
export function checkSpreadFootings(input: any): any {
  return runDesignCheck('spread footing bearing checks', wasmCheckSpreadFootings, input);
}

/**
 * Load generation in the engine (`engine/src/loads`): CIRSOC 101 combinations, INPRES-CIRSOC 103
 * spectrum and static method. `req` is a `LoadsRequest` tagged by `op`. Throws
 * `EngineUnavailableError` without the engine, `EngineCheckError` with its message on a refusal.
 */
export function loadsRequest(req: { op: string } & Record<string, unknown>): any {
  return runDesignCheck(`load generation (${req.op})`, wasmLoadsRequest, req);
}

/** CIRSOC 201 isolated footings (`isolated_footing.rs`). Throws like the checks above. */
export function checkIsolatedFootings(input: any): any {
  return runDesignCheck('CIRSOC 201 isolated footing checks', wasmCheckIsolatedFootings, input);
}

/** Certified CIRSOC 201 isolated footings: the same formulas in interval arithmetic. */
export function certifyIsolatedFootings(input: any): any {
  return runDesignCheck('certified CIRSOC 201 isolated footing checks', wasmCertifyIsolatedFootings, input);
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
  assertCalculationsAllowed();
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
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveCorotational3d) throw new Error('WASM Corotational 3D solver not available.');
  refuse(torsionGapRefusal(input, 'nonlinear'));
  return JSON.parse(wasmSolveCorotational3d(serializeInput3D(input), maxIter, tolerance, nIncrements));
}

/** Solve 3D nonlinear material analysis via WASM. */
export function solveNonlinearMaterial3D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveNonlinearMaterial3d) throw new Error('WASM nonlinear material 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolveNonlinearMaterial3d(JSON.stringify(config)));
}

/** Solve 3D time history analysis via WASM. */
export function solveTimeHistory3D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveTimeHistory3d) throw new Error('WASM time history 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  const json = JSON.stringify(config);
  return tagCertifyJob(JSON.parse(wasmSolveTimeHistory3d(json)), { name: 'certify_time_history_3d', args: [json] });
}

/** Solve 3D plastic analysis via WASM. */
export function solvePlastic3D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolvePlastic3d) throw new Error('WASM plastic 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolvePlastic3d(JSON.stringify(config)));
}

/** Solve 3D moving loads analysis via WASM. */
export function solveMovingLoads3D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveMovingLoads3d) throw new Error('WASM moving loads 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolveMovingLoads3d(JSON.stringify(config)));
}

// ─── Constrained / Contact / SSI / Winkler Solvers ────────────────

/** Solve 2D constrained analysis via WASM. */
export function solveConstrained2D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveConstrained2d) throw new Error('WASM constrained 2D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmSolveConstrained2d(JSON.stringify(config)));
}

/** Solve 3D constrained analysis via WASM. */
export function solveConstrained3D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveConstrained3d) throw new Error('WASM constrained 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolveConstrained3d(JSON.stringify(config)));
}

/** Solve 2D contact analysis via WASM. */
export function solveContact2D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveContact2d) throw new Error('WASM contact 2D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmSolveContact2d(JSON.stringify(config)));
}

/** Solve 3D contact analysis via WASM. */
export function solveContact3D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveContact3d) throw new Error('WASM contact 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolveContact3d(JSON.stringify(config)));
}

/** Solve 2D soil-structure interaction via WASM. */
export function solveSSI2D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveSsi2d) throw new Error('WASM SSI 2D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmSolveSsi2d(JSON.stringify(config)));
}

/** Solve 3D soil-structure interaction via WASM. */
export function solveSSI3D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveSsi3d) throw new Error('WASM SSI 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  // As the engine answers: its caller finishes what it reads (`solve-finish.ts`).
  return JSON.parse(wasmSolveSsi3d(JSON.stringify(config)));
}

/** Solve 2D Winkler foundation analysis via WASM. */
export function solveWinkler2D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveWinkler2d) throw new Error('WASM Winkler 2D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmSolveWinkler2d(JSON.stringify(config)));
}

/** Solve 3D Winkler foundation analysis via WASM. */
export function solveWinkler3D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveWinkler3d) throw new Error('WASM Winkler 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolveWinkler3d(JSON.stringify(config)));
}

// ─── Fiber Nonlinear Solvers ──────────────────────────────────────

/** Solve 2D fiber nonlinear analysis via WASM. */
export function solveFiberNonlinear2D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveFiberNonlinear2d) throw new Error('WASM fiber nonlinear 2D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmSolveFiberNonlinear2d(JSON.stringify(config)));
}

/** Solve 3D fiber nonlinear analysis via WASM. */
export function solveFiberNonlinear3D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveFiberNonlinear3d) throw new Error('WASM fiber nonlinear 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolveFiberNonlinear3d(JSON.stringify(config)));
}

// ─── Staged Construction Solvers ──────────────────────────────────

/** Solve 2D staged construction analysis via WASM. */
export function solveStaged2D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveStaged2d) throw new Error('WASM staged 2D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmSolveStaged2d(JSON.stringify(config)));
}

/** Solve 3D staged construction analysis via WASM.
 *
 *  `StagedInput3D` is FLAT — nodes/materials/sections/elements/supports/loads
 *  sit beside `stages`, not under a `solver` key. Nesting them the way every
 *  other advanced solver does made the deserialiser stop at the first missing
 *  top-level field, so staged construction never ran once. Callers still pass
 *  `{ solver, stages }`; the flattening happens here, next to the contract. */
export function solveStaged3D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveStaged3d) throw new Error('WASM staged 3D solver not available.');
  const { solver, ...rest } = config;
  const wire = solver && solver.nodes instanceof Map
    ? JSON.parse(serializeInput3D(solver))
    : solver;
  return JSON.parse(wasmSolveStaged3d(JSON.stringify({ ...wire, ...rest })));
}

// ─── Cable Solver ─────────────────────────────────────────────────

/** Solve 2D cable analysis via WASM.
 *
 *  The export takes `{ solver, densities }`, not a bare solver input — passing
 *  the input on its own failed on a missing `solver` field before the cable
 *  iteration ever started. Densities are mass densities in kg/m³, the same
 *  units modal uses; cables are self-weight problems, so they matter. */
export function solveCable2D(
  input: SolverInput,
  maxIter = 50,
  tolerance = 1e-6,
  densities: Record<string, number> = {},
): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveCable2d) throw new Error('WASM cable 2D solver not available.');
  const payload = { solver: JSON.parse(serializeInput2D(input)), densities };
  return JSON.parse(wasmSolveCable2d(JSON.stringify(payload), maxIter, tolerance));
}

/** One cable element of a 3D cable analysis, SI units (kN, m). */
export interface CableForce3D {
  elementId: number;
  tension: number;
  horizontalThrust: number;
  sag: number;
  /** The equivalent (Ernst) modulus the iteration settled on, kN/m². */
  ernstModulus: number;
  /** The chord, or with a pretension given, the length it sets (#527). */
  unstretchedLength: number;
}

/** A 3D input whose members may also be typed `cable`: a truss that only `solveCable3D` treats as
 *  one, with its sag and tension-only stiffness. The other analyses take it as a truss. */
export type SolverInputCable3D = Omit<SolverInput3D, 'elements'> & {
  elements: Map<number, Omit<SolverElement3D, 'type'> & { type: SolverElement3D['type'] | 'cable' }>;
};

export interface CableAnalysis3D {
  results: AnalysisResults3D;
  iterations: number;
  converged: boolean;
  cableForces: CableForce3D[];
}

/**
 * Solve a 3D cable analysis via WASM: the members typed `cable` carry tension only, and their own
 * weight, from the densities, softens them (Ernst's equivalent modulus) and sets the sag they
 * report. It is not applied to them as a load. The rest of the model is linear. Same payload as
 * the 2D one, `{ solver, densities, pretension }`, with densities in kg/m³ and a pretension per
 * cable in kN (element id → its tension on the drawn chord under its own weight; #527).
 */
export function solveCable3D(
  input: SolverInputCable3D,
  maxIter = 50,
  tolerance = 1e-6,
  densities: Record<string, number> = {},
  pretension: Record<string, number> = {},
): CableAnalysis3D {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveCable3d) throw new Error('WASM cable 3D solver not available.');
  // The wire form does not look at the member type; it passes `cable` through to the engine.
  const payload = { solver: JSON.parse(serializeInput3D(input as unknown as SolverInput3D)), densities, pretension };
  // As the engine answers: its caller finishes the results (`solve-finish.ts`, member-behaviour.ts).
  return JSON.parse(wasmSolveCable3d(JSON.stringify(payload), maxIter, tolerance)) as CableAnalysis3D;
}

// ─── Harmonic Solvers ─────────────────────────────────────────────

/** Solve 2D harmonic analysis via WASM. */
export function solveHarmonic2D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveHarmonic2d) throw new Error('WASM harmonic 2D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput2D(config.solver)) };
  }
  const json = JSON.stringify(config);
  return tagCertifyJob(JSON.parse(wasmSolveHarmonic2d(json)), { name: 'certify_harmonic_2d', args: [json] });
}

/** Solve 3D harmonic analysis via WASM. */
export function solveHarmonic3D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveHarmonic3d) throw new Error('WASM harmonic 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  const json = JSON.stringify(config);
  return tagCertifyJob(JSON.parse(wasmSolveHarmonic3d(json)), { name: 'certify_harmonic_3d', args: [json] });
}

// ─── Creep & Shrinkage Solvers ────────────────────────────────────

/** Solve 2D creep & shrinkage analysis via WASM. */
export function solveCreepShrinkage2D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveCreepShrinkage2d) throw new Error('WASM creep/shrinkage 2D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmSolveCreepShrinkage2d(JSON.stringify(config)));
}

/** Solve 3D creep & shrinkage analysis via WASM. */
export function solveCreepShrinkage3D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveCreepShrinkage3d) throw new Error('WASM creep/shrinkage 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput3D(config.solver)) };
  }
  return JSON.parse(wasmSolveCreepShrinkage3d(JSON.stringify(config)));
}

// ─── Multi-Case Solvers ───────────────────────────────────────────

/** Solve 2D multi-case analysis via WASM. JsValue in/out — no JSON round trip. */
export function solveMultiCase2D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveMultiCase2d) throw new Error('WASM multi-case 2D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: input2DToWireObject(config.solver) };
  }
  assertFiniteWire(config);
  return wasmSolveMultiCase2d(config);
}

/** Solve 3D multi-case analysis via WASM. JsValue in/out — no JSON round trip. */
export function solveMultiCase3D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveMultiCase3d) throw new Error('WASM multi-case 3D solver not available.');
  // Kept before the wire conversion: the strip below reads the stabiliser's
  // mark off the supports, and both shapes carry it.
  const input = config.solver;
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: input3DToWireObject(config.solver) };
  }
  assertFiniteWire(config);
  const captured: string[] = [];
  const origError = console.error;
  console.error = (...args: any[]) => { captured.push(args.map(String).join(' ')); origError.apply(console, args); };
  try {
    const result = wasmSolveMultiCase3d(config);
    // As in `solve3D`, and for every case, combination and the envelope: this
    // is the path behind Calcular with load combinations, and a node the
    // stabiliser supported showed up in all of them as a zero reaction the
    // user never asked for.
    if (input && result) {
      for (const cr of result.caseResults ?? []) stripStabilisedReactions(cr.results, input);
      for (const cr of result.combinationResults ?? []) stripStabilisedReactions(cr.results, input);
      if (result.envelope?.maxAbsResults3D) stripStabilisedReactions(result.envelope.maxAbsResults3D, input);
    }
    return result;
  } catch (e: any) {
    const panicMsg = captured.length > 0 ? captured.join('\n') : '';
    const base = e?.message ?? String(e);
    throw new Error(panicMsg ? `${base}\n[WASM panic]: ${panicMsg}` : base);
  } finally {
    console.error = origError;
  }
}

// ─── Nonlinear Path-Following Solvers ─────────────────────────────

/** Solve arc-length (Riks) analysis via WASM. */
export function solveArcLength(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveArcLength) throw new Error('WASM arc-length solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    const is3D = config.solver.plates || config.solver.quads || config.solver.constraints;
    config = { ...config, solver: JSON.parse(is3D ? serializeInput3D(config.solver) : serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmSolveArcLength(JSON.stringify(config)));
}

/** Solve displacement-control analysis via WASM. */
export function solveDisplacementControl(config: any): any {
  assertCalculationsAllowed();
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
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveWithImperfections2d) throw new Error('WASM imperfections 2D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    config = { ...config, solver: JSON.parse(serializeInput2D(config.solver)) };
  }
  return JSON.parse(wasmSolveWithImperfections2d(JSON.stringify(config)));
}

/** Solve 3D analysis with geometric imperfections via WASM. */
export function solveWithImperfections3D(config: any): any {
  assertCalculationsAllowed();
  if (!wasmReady || !wasmSolveWithImperfections3d) throw new Error('WASM imperfections 3D solver not available.');
  if (config.solver && config.solver.nodes instanceof Map) {
    refuse(torsionGapRefusal(config.solver, 'nonlinear'));
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

// ─── Beam Station Extraction ─────────────────────────────────────

import type { BeamStationInput, BeamStationResult, GroupedBeamStationResult } from './types';
import type { BeamStationInput3D, BeamStationResult3D, GroupedBeamStationResult3D } from './types-3d';

/** Compact verification-only path. A missing export permits older WASM bundles. */
export function extractBeamStationBuffer3D(input: {
  members: Array<{ elementId: number; length: number }>;
  combinations: Array<{ comboId: number; elementForces: AnalysisResults3D['elementForces'] }>;
  numStations: number;
}): Float64Array | null {
  if (!wasmReady || !wasmExtractBeamStationBuffer3d) return null;
  return wasmExtractBeamStationBuffer3d(JSON.stringify(input));
}

/** Extract 2D beam design stations with per-combo forces and governing values. */
export function extractBeamStations(input: BeamStationInput): BeamStationResult {
  if (!wasmReady || !wasmExtractBeamStations) throw new Error('WASM beam station extraction not available.');
  return JSON.parse(wasmExtractBeamStations(JSON.stringify(input)));
}

/** Extract 3D beam design stations with per-combo forces and governing values. */
export function extractBeamStations3D(input: BeamStationInput3D): BeamStationResult3D {
  if (!wasmReady || !wasmExtractBeamStations3d) throw new Error('WASM beam station 3D extraction not available.');
  return JSON.parse(wasmExtractBeamStations3d(JSON.stringify(input)));
}

/** Extract 2D beam stations grouped by member with member-level governing summaries. */
export function extractBeamStationsGrouped(input: BeamStationInput): GroupedBeamStationResult {
  if (!wasmReady || !wasmExtractBeamStationsGrouped) throw new Error('WASM grouped beam station extraction not available.');
  return JSON.parse(wasmExtractBeamStationsGrouped(JSON.stringify(input)));
}

/** Extract 3D beam stations grouped by member with member-level governing summaries. */
export function extractBeamStationsGrouped3D(input: BeamStationInput3D): GroupedBeamStationResult3D {
  if (!wasmReady || !wasmExtractBeamStationsGrouped3d) throw new Error('WASM grouped beam station 3D extraction not available.');
  return JSON.parse(wasmExtractBeamStationsGrouped3d(JSON.stringify(input)));
}

// ─── Canonical section geometry ──────────────────────────────────
//
// JSON-string boundary, matching `analyze_section`. These are cold paths — one
// call per section change, not per solve — so the JsValue boundary used by
// `solve_2d`/`solve_3d` would buy nothing and would split the section API
// across two conventions.

/** A canonical polygon region. `isVoid` marks a hole. */
export interface CanonicalPolygon {
  vertices: Array<[number, number]>;
  materialId: number;
  isVoid: boolean;
}

export interface CanonicalGeometry {
  version: number;
  polygons: CanonicalPolygon[];
  source: Record<string, unknown>;
  arcSegments: number;
  rotation: number;
}

export interface CanonicalSectionProperties {
  a: number; yc: number; zc: number;
  iy: number; iz: number; iyz: number;
  i1: number; i2: number; thetaP: number;
  j: number; bbox: [number, number, number, number];
  [k: string]: unknown;
}

export interface CanonicalGeometryResponse {
  geometry: CanonicalGeometry;
  digest: string;
  properties: CanonicalSectionProperties;
}

/** Request shapes accepted by `build_section_geometry`. */
export type SectionGeometryRequest =
  | { kind: 'rect'; b: number; h: number }
  | { kind: 'circle'; d: number; arcSegments?: number }
  | { kind: 'chs'; d: number; t: number; arcSegments?: number }
  | { kind: 'iSection'; h: number; b: number; tw: number; tf: number; rootRadius?: number; arcSegments?: number; profileId?: string; standard?: string }
  | { kind: 'ipn'; h: number; b: number; tw: number; tf: number; arcSegments?: number; profileId?: string; standard?: string }
  | { kind: 'upn'; h: number; b: number; tw: number; tf: number; arcSegments?: number; profileId?: string; standard?: string }
  | { kind: 'tee'; h: number; b: number; tw: number; tf: number; rootRadius?: number; toeRadius?: number; arcSegments?: number; profileId?: string; standard?: string }
  | { kind: 'angle'; h: number; b: number; t: number; rootRadius?: number; toeRadius?: number; arcSegments?: number; profileId?: string; standard?: string }
  | { kind: 'channel'; h: number; b: number; tw: number; tf: number; slope?: number; rootRadius?: number; toeRadius?: number; taperRef?: number; arcSegments?: number; profileId?: string; standard?: string }
  | { kind: 'rhs'; b: number; h: number; t: number; cornerRadius?: number; arcSegments?: number; profileId?: string; standard?: string }
  | { kind: 'custom'; outer: Array<[number, number]>; holes?: Array<Array<[number, number]>> };

/** Build canonical geometry and its derived properties. */
export function buildSectionGeometry(req: SectionGeometryRequest): CanonicalGeometryResponse {
  if (!wasmReady || !wasmBuildSectionGeometry) throw new Error('WASM solver not initialized. Call initSolver() first.');
  return JSON.parse(wasmBuildSectionGeometry(JSON.stringify(req)));
}

export interface BendingStressPoint { y: number; z: number; sigma: number }

export interface BendingResponse {
  properties: CanonicalSectionProperties;
  forces: { n: number; my: number; mz: number };
  boundary: BendingStressPoint[];
  max: BendingStressPoint;
  min: BendingStressPoint;
  neutralAxis: { a: number; b: number; c: number; angle: number; uniform: boolean };
  kz: number;
  ky: number;
  digest: string;
  geometryVersion: number;
}

/**
 * Axial + unsymmetrical bending over canonical geometry.
 *
 * Uses the complete centroidal inertia tensor including Iyz, so angles,
 * channels and asymmetric polygons are not treated as if their geometric axes
 * were principal. The response echoes the geometry digest, which is how a
 * caller proves the drawing and the numbers describe the same section.
 */
export function analyzeSectionBending(input: {
  geometry: CanonicalGeometry;
  n?: number; my?: number; mz?: number;
  forcesAreLocal?: boolean;
}): BendingResponse {
  if (!wasmReady || !wasmAnalyzeSectionBending) throw new Error('WASM solver not initialized. Call initSolver() first.');
  return JSON.parse(wasmAnalyzeSectionBending(JSON.stringify(input)));
}

/** Digest, version and provenance of a canonical geometry. */
export function sectionGeometryDigest(geometry: CanonicalGeometry): {
  digest: string; version: number; arcSegments: number; rotation: number;
  source: Record<string, unknown>; solidCount: number; holeCount: number;
} {
  if (!wasmReady || !wasmSectionGeometryDigest) throw new Error('WASM solver not initialized. Call initSolver() first.');
  return JSON.parse(wasmSectionGeometryDigest(JSON.stringify(geometry)));
}

/** Saint-Venant torsion result for canonical geometry. */
export interface TorsionResponse {
  /** Torsion constant, in the geometry's own length unit to the fourth. */
  j: number;
  /** Peak shear under unit twist rate. */
  tauMax: number;
  /** `[tauXy, tauXz]` at the queried point, under unit twist rate. */
  at?: [number, number];
  triangles: number;
  residual: number;
}

/**
 * Solve Saint-Venant torsion for a canonical section.
 *
 * This meshes and solves, so it costs milliseconds — compute once per section
 * and cache it. Handles closed sections: the constant on each hole boundary
 * comes from Bredt's circulation condition.
 */
export function analyzeSectionTorsion(input: {
  geometry: CanonicalGeometry;
  maxArea?: number;
  /** Query point, centroid-relative, in the geometry's own units. */
  at?: [number, number];
}): TorsionResponse {
  if (!wasmReady || !wasmAnalyzeSectionTorsion) throw new Error('WASM solver not initialized. Call initSolver() first.');
  return JSON.parse(wasmAnalyzeSectionTorsion(JSON.stringify(input)));
}

/** Transverse shear response to unit forces on each centroidal axis. */
export interface ShearResponse {
  vy: { tauMax: number; kappa: number; at?: [number, number] };
  vz: { tauMax: number; kappa: number; at?: [number, number] };
  /**
   * Shear centre, centroid-relative.
   *
   * The point a transverse load must pass through to bend without twisting.
   * At the centroid for a doubly-symmetric profile; outside the section
   * entirely for a channel, which is why loading one through its web twists it.
   */
  shearCentre: [number, number];
  triangles: number;
  residual: number;
}

/**
 * Solve transverse shear for a canonical section.
 *
 * Works for shapes Jourawski cannot express — angles, closed tubes, arbitrary
 * polygons — because it solves the equilibrium problem instead of assuming a
 * single width. Meshes and solves, so cache the result per section.
 */
export function analyzeSectionShear(input: {
  geometry: CanonicalGeometry;
  maxArea?: number;
  /** Query point, centroid-relative, in the geometry's own units. */
  at?: [number, number];
}): ShearResponse {
  if (!wasmReady || !wasmAnalyzeSectionShear) throw new Error('WASM solver not initialized. Call initSolver() first.');
  return JSON.parse(wasmAnalyzeSectionShear(JSON.stringify(input)));
}

/**
 * The torsion solve as a reusable field: the mesh plus the per-triangle shear
 * under unit twist rate. Solve once per section (cache by geometry digest),
 * then locate triangles locally for any number of query points — calling
 * `analyzeSectionTorsion` per point re-meshes and re-solves every time.
 *
 * Nodes and `tau` are centroid-relative in the geometry's own units, so a
 * query point in that frame needs no further conversion.
 */
export interface TorsionFieldResponse {
  j: number;
  tauMax: number;
  nodes: Array<[number, number]>;
  triangles: Array<[number, number, number]>;
  /** `[tau_xy, tau_xz]` per triangle under unit twist rate. */
  tau: Array<[number, number]>;
  residual: number;
}

export function analyzeSectionTorsionField(input: {
  geometry: CanonicalGeometry;
  maxArea?: number;
}): TorsionFieldResponse {
  if (!wasmReady || !wasmAnalyzeSectionTorsionField) throw new Error('WASM solver not initialized (or predates the field exports). Call initSolver() first.');
  return JSON.parse(wasmAnalyzeSectionTorsionField(JSON.stringify(input)));
}

/**
 * The shear solve as a reusable field: per-triangle stress for a unit force
 * on each axis. Same caching contract as `TorsionFieldResponse`.
 */
export interface ShearFieldResponse {
  vy: { tauMax: number; kappa: number; tau: Array<[number, number]> };
  vz: { tauMax: number; kappa: number; tau: Array<[number, number]> };
  /** Shear centre, centroid-relative. */
  shearCentre: [number, number];
  nodes: Array<[number, number]>;
  triangles: Array<[number, number, number]>;
  residual: number;
}

export function analyzeSectionShearField(input: {
  geometry: CanonicalGeometry;
  maxArea?: number;
}): ShearFieldResponse {
  if (!wasmReady || !wasmAnalyzeSectionShearField) throw new Error('WASM solver not initialized (or predates the field exports). Call initSolver() first.');
  return JSON.parse(wasmAnalyzeSectionShearField(JSON.stringify(input)));
}

/** Plastic and elastic section moduli, plus the warping constant. */
export interface PlasticResponse {
  /** Plastic moduli about the horizontal and vertical axes. */
  zy: number;
  zz: number;
  /** Elastic moduli, so `zy/sy` gives the shape factor directly. */
  sy: number;
  sz: number;
  /** Plastic neutral axes, centroid-relative. Zero for a symmetric section. */
  pnaZ: number;
  pnaY: number;
  /**
   * Warping constant. Absent for a closed section, where the solver refuses
   * rather than overstate a value that is negligible in practice anyway.
   */
  cw?: number;
}

/**
 * Plastic moduli, elastic moduli and the warping constant for a section.
 *
 * `Z` is taken about the equal-area axis, not the centroid — they differ for a
 * tee or a channel, and using the centroid understates the result. `Cw` is what
 * lateral-torsional buckling needs alongside `J`.
 */
export function analyzeSectionPlastic(input: {
  geometry: CanonicalGeometry;
  maxArea?: number;
}): PlasticResponse {
  if (!wasmReady || !wasmAnalyzeSectionPlastic) throw new Error('WASM solver not initialized. Call initSolver() first.');
  return JSON.parse(wasmAnalyzeSectionPlastic(JSON.stringify(input)));
}
