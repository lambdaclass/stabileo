// Suppress Clippy lints for numerical/scientific code patterns
#![allow(
    clippy::identity_op,
    clippy::erasing_op,
    clippy::manual_memcpy,
    clippy::too_many_arguments,
    clippy::needless_range_loop,
    clippy::manual_clamp,
    clippy::ptr_arg,
    clippy::derivable_impls,
    clippy::redundant_closure,
    clippy::empty_line_after_doc_comments,
    clippy::doc_lazy_continuation,
    clippy::new_without_default,
    clippy::collapsible_if,
    clippy::let_and_return,
    clippy::unnecessary_map_or,
    clippy::if_same_then_else,
    clippy::needless_lifetimes,
    clippy::map_clone,
    clippy::needless_borrowed_reference,
    clippy::unnecessary_unwrap,
    clippy::needless_borrow,
    clippy::for_kv_map,
    clippy::manual_range_patterns,
    clippy::get_first,
    clippy::unused_enumerate_index,
    clippy::useless_vec,
    clippy::len_zero,
    clippy::type_complexity,
    clippy::never_loop,
)]

pub mod types;
pub mod linalg;
pub mod element;
pub mod solver;
pub mod postprocess;
pub mod section;

use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// Solve 2D linear static analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_2d(json: &str) -> Result<String, JsValue> {
    let input: types::SolverInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::linear::solve_2d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 3D linear static analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_3d(json: &str) -> Result<String, JsValue> {
    let input: types::SolverInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::linear::solve_3d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 2D P-Delta analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_pdelta_2d(json: &str, max_iter: usize, tolerance: f64) -> Result<String, JsValue> {
    let input: types::SolverInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::pdelta::solve_pdelta_2d(&input, max_iter, tolerance)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 2D buckling analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_buckling_2d(json: &str, num_modes: usize) -> Result<String, JsValue> {
    let input: types::SolverInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::buckling::solve_buckling_2d(&input, num_modes)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 2D modal analysis. JSON in → JSON out.
/// densities_json: { "materialId": density_kg_m3, ... }
#[wasm_bindgen]
pub fn solve_modal_2d(json: &str, num_modes: usize) -> Result<String, JsValue> {
    let input: types::ModalInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::modal::solve_modal_2d(&input.solver, &input.densities, num_modes)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 2D spectral analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_spectral_2d(json: &str) -> Result<String, JsValue> {
    let input: types::SpectralInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::spectral::solve_spectral_2d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 3D P-Delta analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_pdelta_3d(json: &str, max_iter: usize, tolerance: f64) -> Result<String, JsValue> {
    let input: types::SolverInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::pdelta::solve_pdelta_3d(&input, max_iter, tolerance)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 3D buckling analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_buckling_3d(json: &str, num_modes: usize) -> Result<String, JsValue> {
    let input: types::SolverInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::buckling::solve_buckling_3d(&input, num_modes)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 3D modal analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_modal_3d(json: &str, num_modes: usize) -> Result<String, JsValue> {
    let input: types::ModalInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::modal::solve_modal_3d(&input.solver, &input.densities, num_modes)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 3D spectral analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_spectral_3d(json: &str) -> Result<String, JsValue> {
    let input: types::SpectralInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::spectral::solve_spectral_3d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 2D plastic analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_plastic_2d(json: &str) -> Result<String, JsValue> {
    let input: types::PlasticInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::plastic::solve_plastic_2d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 3D plastic (pushover) analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_plastic_3d(json: &str) -> Result<String, JsValue> {
    let input: types::PlasticInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::plastic::solve_plastic_3d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 2D moving loads analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_moving_loads_2d(json: &str) -> Result<String, JsValue> {
    let input: types::MovingLoadInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::moving_loads::solve_moving_loads_2d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 3D moving loads analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_moving_loads_3d(json: &str) -> Result<String, JsValue> {
    let input: types::MovingLoadInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::moving_loads::solve_moving_loads_3d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== Co-rotational Analysis ====================

/// Solve 2D co-rotational (large displacement) analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_corotational_2d(json: &str, max_iter: usize, tolerance: f64, n_increments: usize) -> Result<String, JsValue> {
    let input: types::SolverInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::corotational::solve_corotational_2d(&input, max_iter, tolerance, n_increments)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 3D co-rotational (large displacement) analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_corotational_3d(json: &str, max_iter: usize, tolerance: f64, n_increments: usize) -> Result<String, JsValue> {
    let input: types::SolverInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::corotational::solve_corotational_3d(&input, max_iter, tolerance, n_increments)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== Nonlinear Material Analysis ====================

/// Solve 2D nonlinear material analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_nonlinear_material_2d(json: &str) -> Result<String, JsValue> {
    let input: types::NonlinearMaterialInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::material_nonlinear::solve_nonlinear_material_2d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 3D nonlinear material analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_nonlinear_material_3d(json: &str) -> Result<String, JsValue> {
    let input: types::NonlinearMaterialInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::material_nonlinear::solve_nonlinear_material_3d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== Time History Analysis ====================

/// Solve 2D time-history analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_time_history_2d(json: &str) -> Result<String, JsValue> {
    let input: types::TimeHistoryInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::time_integration::solve_time_history_2d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 3D linear time-history analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_time_history_3d(json: &str) -> Result<String, JsValue> {
    let input: types::TimeHistoryInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::time_integration::solve_time_history_3d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== Staged Construction Analysis ====================

/// Solve 2D staged construction analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_staged_2d(json: &str) -> Result<String, JsValue> {
    let input: types::StagedInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::staged::solve_staged_2d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 3D staged construction analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_staged_3d(json: &str) -> Result<String, JsValue> {
    let input: types::StagedInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::staged::solve_staged_3d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== Cable Analysis ====================

/// Solve 2D cable analysis. JSON in → JSON out.
/// Input: { "solver": SolverInput, "densities": { materialId: density_kg_m3 } }
#[wasm_bindgen]
pub fn solve_cable_2d(json: &str, max_iter: usize, tolerance: f64) -> Result<String, JsValue> {
    let input: types::ModalInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let result = solver::cable::solve_cable_2d(&input.solver, &input.densities, max_iter, tolerance)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&result.results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== Kinematic Analysis ====================

/// Analyze 2D kinematic stability. JSON in → JSON out.
#[wasm_bindgen]
pub fn analyze_kinematics_2d(json: &str) -> Result<String, JsValue> {
    let input: types::SolverInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let result = solver::kinematic::analyze_kinematics_2d(&input);
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Analyze 3D kinematic stability. JSON in → JSON out.
#[wasm_bindgen]
pub fn analyze_kinematics_3d(json: &str) -> Result<String, JsValue> {
    let input: types::SolverInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let result = solver::kinematic::analyze_kinematics_3d(&input);
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== Diagrams ====================

/// Compute 2D diagrams (moment, shear, axial). JSON: { input: SolverInput, results: AnalysisResults }
#[wasm_bindgen]
pub fn compute_diagrams_2d(json: &str) -> Result<String, JsValue> {
    #[derive(serde::Deserialize)]
    struct Input {
        input: types::SolverInput,
        results: types::AnalysisResults,
    }
    let data: Input = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let diagrams = postprocess::diagrams::compute_diagrams_2d(&data.input, &data.results);
    serde_json::to_string(&diagrams)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Compute 3D diagrams. JSON: AnalysisResults3D
#[wasm_bindgen]
pub fn compute_diagrams_3d(json: &str) -> Result<String, JsValue> {
    let results: types::AnalysisResults3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let diagrams = postprocess::diagrams_3d::compute_diagrams_3d(&results);
    serde_json::to_string(&diagrams)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Compute deformed shape for one element. JSON wrapper.
#[wasm_bindgen]
pub fn compute_deformed_shape(json: &str) -> Result<String, JsValue> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Input {
        node_ix: f64, node_iy: f64,
        node_jx: f64, node_jy: f64,
        u_ix: f64, u_iy: f64, r_iz: f64,
        u_jx: f64, u_jy: f64, r_jz: f64,
        scale: f64,
        length: f64,
        hinge_start: bool,
        hinge_end: bool,
        #[serde(default)]
        ei: Option<f64>,
        #[serde(default)]
        load_qi: Option<f64>,
        #[serde(default)]
        load_qj: Option<f64>,
        #[serde(default)]
        load_points: Vec<(f64, f64)>,
        #[serde(default)]
        dist_loads: Vec<(f64, f64, f64, f64)>,
    }
    let d: Input = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let result = postprocess::diagrams::compute_deformed_shape(
        d.node_ix, d.node_iy, d.node_jx, d.node_jy,
        d.u_ix, d.u_iy, d.r_iz, d.u_jx, d.u_jy, d.r_jz,
        d.scale, d.length, d.hinge_start, d.hinge_end,
        d.ei, d.load_qi, d.load_qj,
        &d.load_points, &d.dist_loads,
    );
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== Combinations + Envelope ====================

/// Combine 2D results with factors. JSON: CombinationInput
#[wasm_bindgen]
pub fn combine_results_2d(json: &str) -> Result<String, JsValue> {
    let input: postprocess::combinations::CombinationInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    match postprocess::combinations::combine_results(&input) {
        Some(result) => serde_json::to_string(&result)
            .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e))),
        None => Ok("null".to_string()),
    }
}

/// Combine 3D results with factors. JSON: CombinationInput3D
#[wasm_bindgen]
pub fn combine_results_3d(json: &str) -> Result<String, JsValue> {
    let input: postprocess::combinations::CombinationInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    match postprocess::combinations::combine_results_3d(&input) {
        Some(result) => serde_json::to_string(&result)
            .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e))),
        None => Ok("null".to_string()),
    }
}

/// Compute 2D envelope. JSON: array of AnalysisResults
#[wasm_bindgen]
pub fn compute_envelope_2d(json: &str) -> Result<String, JsValue> {
    let results: Vec<types::AnalysisResults> = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    match postprocess::combinations::compute_envelope(&results) {
        Some(env) => serde_json::to_string(&env)
            .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e))),
        None => Ok("null".to_string()),
    }
}

/// Compute 3D envelope. JSON: array of AnalysisResults3D
#[wasm_bindgen]
pub fn compute_envelope_3d(json: &str) -> Result<String, JsValue> {
    let results: Vec<types::AnalysisResults3D> = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    match postprocess::combinations::compute_envelope_3d(&results) {
        Some(env) => serde_json::to_string(&env)
            .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e))),
        None => Ok("null".to_string()),
    }
}

// ==================== Influence Lines ====================

/// Compute influence line. JSON: InfluenceLineInput
#[wasm_bindgen]
pub fn compute_influence_line(json: &str) -> Result<String, JsValue> {
    let input: postprocess::influence::InfluenceLineInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let result = postprocess::influence::compute_influence_line(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Compute 3D influence line. JSON: InfluenceLineInput3D
#[wasm_bindgen]
pub fn compute_influence_line_3d(json: &str) -> Result<String, JsValue> {
    let input: postprocess::influence::InfluenceLineInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let result = postprocess::influence::compute_influence_line_3d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== Section Stress ====================

/// Compute 2D section stress. JSON: SectionStressInput
#[wasm_bindgen]
pub fn compute_section_stress_2d(json: &str) -> Result<String, JsValue> {
    let input: postprocess::section_stress::SectionStressInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let result = postprocess::section_stress::compute_section_stress_2d(&input);
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Compute 3D section stress. JSON: SectionStressInput3D
#[wasm_bindgen]
pub fn compute_section_stress_3d(json: &str) -> Result<String, JsValue> {
    let input: postprocess::section_stress_3d::SectionStressInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let result = postprocess::section_stress_3d::compute_section_stress_3d(&input);
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== Multi-Case Load Combinations ====================

/// Solve 2D multi-case load combinations with envelope. JSON: MultiCaseInput
#[wasm_bindgen]
pub fn solve_multi_case_2d(json: &str) -> Result<String, JsValue> {
    let input: solver::load_cases::MultiCaseInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let result = solver::load_cases::solve_multi_case_2d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 3D multi-case load combinations with envelope. JSON: MultiCaseInput3D
#[wasm_bindgen]
pub fn solve_multi_case_3d(json: &str) -> Result<String, JsValue> {
    let input: solver::load_cases::MultiCaseInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let result = solver::load_cases::solve_multi_case_3d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== Harmonic Analysis ====================

/// Solve 2D harmonic (frequency response) analysis. JSON: HarmonicInput
#[wasm_bindgen]
pub fn solve_harmonic_2d(json: &str) -> Result<String, JsValue> {
    let input: solver::harmonic::HarmonicInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let result = solver::harmonic::solve_harmonic_2d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 3D harmonic (frequency response) analysis. JSON: HarmonicInput3D
#[wasm_bindgen]
pub fn solve_harmonic_3d(json: &str) -> Result<String, JsValue> {
    let input: solver::harmonic::HarmonicInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let result = solver::harmonic::solve_harmonic_3d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== Winkler Foundation ====================

/// Solve 2D beam on Winkler elastic foundation. JSON: WinklerInput
#[wasm_bindgen]
pub fn solve_winkler_2d(json: &str) -> Result<String, JsValue> {
    let input: solver::winkler::WinklerInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let result = solver::winkler::solve_winkler_2d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 3D beam on Winkler elastic foundation. JSON: WinklerInput3D
#[wasm_bindgen]
pub fn solve_winkler_3d(json: &str) -> Result<String, JsValue> {
    let input: solver::winkler::WinklerInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let result = solver::winkler::solve_winkler_3d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== Constrained Analysis ====================

/// Solve 2D constrained analysis (rigid links, diaphragms, MPCs). JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_constrained_2d(json: &str) -> Result<String, JsValue> {
    let input: solver::constraints::ConstrainedInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::constraints::solve_constrained_2d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 3D constrained analysis (rigid links, diaphragms, MPCs). JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_constrained_3d(json: &str) -> Result<String, JsValue> {
    let input: solver::constraints::ConstrainedInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::constraints::solve_constrained_3d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== Contact / Gap Analysis ====================

/// Solve 2D contact analysis (tension/compression-only, gaps, uplift). JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_contact_2d(json: &str) -> Result<String, JsValue> {
    let input: solver::contact::ContactInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::contact::solve_contact_2d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 3D contact analysis (tension/compression-only, gaps, uplift). JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_contact_3d(json: &str) -> Result<String, JsValue> {
    let input: solver::contact::ContactInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::contact::solve_contact_3d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== SSI Analysis ====================

/// Solve 2D soil-structure interaction with nonlinear p-y/t-z/q-z curves. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_ssi_2d(json: &str) -> Result<String, JsValue> {
    let input: solver::ssi::SSIInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::ssi::solve_ssi_2d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 3D soil-structure interaction with nonlinear p-y/t-z/q-z curves. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_ssi_3d(json: &str) -> Result<String, JsValue> {
    let input: solver::ssi::SSIInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::ssi::solve_ssi_3d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== Arc-Length / Displacement Control ====================

/// Solve arc-length (Crisfield) analysis for snap-through/snap-back. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_arc_length(json: &str) -> Result<String, JsValue> {
    let input: solver::arc_length::ArcLengthInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::arc_length::solve_arc_length(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve displacement-controlled analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_displacement_control(json: &str) -> Result<String, JsValue> {
    let input: solver::arc_length::DisplacementControlInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::arc_length::solve_displacement_control(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== Fiber Beam-Column Analysis ====================

/// Solve 2D fiber beam-column nonlinear analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_fiber_nonlinear_2d(json: &str) -> Result<String, JsValue> {
    let input: solver::fiber_nonlinear::FiberNonlinearInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::fiber_nonlinear::solve_fiber_nonlinear_2d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 3D fiber beam-column nonlinear analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_fiber_nonlinear_3d(json: &str) -> Result<String, JsValue> {
    let input: solver::fiber_nonlinear::FiberNonlinearInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::fiber_nonlinear::solve_fiber_nonlinear_3d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve time-dependent 2D analysis with creep and shrinkage. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_creep_shrinkage_2d(json: &str) -> Result<String, JsValue> {
    let input: solver::creep_shrinkage::CreepShrinkageInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::creep_shrinkage::solve_creep_shrinkage_2d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== Section Analysis ====================

/// Compute cross-section properties from polygon geometry. JSON: SectionInput
#[wasm_bindgen]
pub fn analyze_section(json: &str) -> Result<String, JsValue> {
    let input: section::SectionInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let result = section::analyze_section(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== Steel Design Check ====================

/// Check steel members per AISC 360 (LRFD). JSON: SteelCheckInput
#[wasm_bindgen]
pub fn check_steel_members(json: &str) -> Result<String, JsValue> {
    let input: postprocess::steel_check::SteelCheckInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = postprocess::steel_check::check_steel_members(&input);
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

#[wasm_bindgen]
pub fn check_rc_members(json: &str) -> Result<String, JsValue> {
    let input: postprocess::rc_check::RCCheckInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = postprocess::rc_check::check_rc_members(&input);
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

#[wasm_bindgen]
pub fn check_timber_members(json: &str) -> Result<String, JsValue> {
    let input: postprocess::timber_check::TimberCheckInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = postprocess::timber_check::check_timber_members(&input);
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

#[wasm_bindgen]
pub fn check_serviceability(json: &str) -> Result<String, JsValue> {
    let input: postprocess::serviceability::ServiceabilityInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = postprocess::serviceability::check_serviceability(&input);
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

#[wasm_bindgen]
pub fn check_bolt_groups(json: &str) -> Result<String, JsValue> {
    let input: postprocess::connection_check::BoltGroupInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = postprocess::connection_check::check_bolt_groups(&input);
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

#[wasm_bindgen]
pub fn check_weld_groups(json: &str) -> Result<String, JsValue> {
    let input: postprocess::connection_check::WeldGroupInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = postprocess::connection_check::check_weld_groups(&input);
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

#[wasm_bindgen]
pub fn check_masonry_members(json: &str) -> Result<String, JsValue> {
    let input: postprocess::masonry_check::MasonryCheckInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = postprocess::masonry_check::check_masonry_members(&input);
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

#[wasm_bindgen]
pub fn check_ec3_members(json: &str) -> Result<String, JsValue> {
    let input: postprocess::ec3_check::Ec3CheckInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = postprocess::ec3_check::check_ec3_members(&input);
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

#[wasm_bindgen]
pub fn check_cirsoc201_members(json: &str) -> Result<String, JsValue> {
    let input: postprocess::cirsoc201_check::Cirsoc201CheckInput =
        serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = postprocess::cirsoc201_check::check_cirsoc201_members(&input);
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

#[wasm_bindgen]
pub fn check_ec2_members(json: &str) -> Result<String, JsValue> {
    let input: postprocess::ec2_check::Ec2CheckInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = postprocess::ec2_check::check_ec2_members(&input);
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

#[wasm_bindgen]
pub fn check_cfs_members(json: &str) -> Result<String, JsValue> {
    let input: postprocess::cfs_check::CfsCheckInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = postprocess::cfs_check::check_cfs_members(&input);
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

#[wasm_bindgen]
pub fn check_spread_footings(json: &str) -> Result<String, JsValue> {
    let input: postprocess::foundation_check::SpreadFootingInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = postprocess::foundation_check::check_spread_footings(&input);
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== Imperfections ====================

/// Apply imperfections to a 2D model and solve. JSON in → JSON out.
///
/// Input: { "solver": SolverInput, "imperfections": ImperfectionInput }
/// Applies geometric imperfections, adds notional loads, then solves linearly.
#[wasm_bindgen]
pub fn solve_with_imperfections_2d(json: &str) -> Result<String, JsValue> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Input {
        solver: types::SolverInput,
        imperfections: types::ImperfectionInput,
    }
    let mut input: Input = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;

    // Apply geometric imperfections
    solver::imperfections::apply_geometric_imperfections_2d(
        &mut input.solver, &input.imperfections.node_imperfections,
    );

    // Add notional loads
    for notional in &input.imperfections.notional_loads {
        let loads = solver::imperfections::notional_loads_2d(&input.solver, notional);
        input.solver.loads.extend(loads);
    }

    let results = solver::linear::solve_2d(&input.solver)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Apply imperfections to a 3D model and solve. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_with_imperfections_3d(json: &str) -> Result<String, JsValue> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Input {
        solver: types::SolverInput3D,
        imperfections: types::ImperfectionInput,
    }
    let mut input: Input = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;

    solver::imperfections::apply_geometric_imperfections_3d(
        &mut input.solver, &input.imperfections.node_imperfections,
    );

    for notional in &input.imperfections.notional_loads {
        let loads = solver::imperfections::notional_loads_3d(&input.solver, notional);
        input.solver.loads.extend(loads);
    }

    let results = solver::linear::solve_3d(&input.solver)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== Creep/Shrinkage 3D ====================

/// Solve 3D time-dependent analysis with creep and shrinkage (EC2). JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_creep_shrinkage_3d(json: &str) -> Result<String, JsValue> {
    let input: solver::creep_shrinkage::CreepShrinkageInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::creep_shrinkage::solve_creep_shrinkage_3d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ==================== Model Reduction ====================

/// Guyan (static) condensation of a 2D model. JSON in → JSON out.
#[wasm_bindgen]
pub fn guyan_reduce_2d(json: &str) -> Result<String, JsValue> {
    let input: solver::reduction::GuyanInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::reduction::guyan_reduce_2d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Craig-Bampton reduction of a 2D model. JSON in → JSON out.
#[wasm_bindgen]
pub fn craig_bampton_2d(json: &str) -> Result<String, JsValue> {
    let input: solver::reduction::CraigBamptonInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::reduction::craig_bampton_2d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::types::*;
    use std::collections::HashMap;

    fn make_input(
        nodes: Vec<(usize, f64, f64)>,
        mats: Vec<(usize, f64, f64)>,
        secs: Vec<(usize, f64, f64)>,
        elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)>,
        sups: Vec<(usize, usize, &str)>,
        loads: Vec<SolverLoad>,
    ) -> SolverInput {
        let mut nodes_map = HashMap::new();
        for (id, x, y) in nodes {
            nodes_map.insert(id.to_string(), SolverNode { id, x, y });
        }
        let mut mats_map = HashMap::new();
        for (id, e, nu) in mats {
            mats_map.insert(id.to_string(), SolverMaterial { id, e, nu });
        }
        let mut secs_map = HashMap::new();
        for (id, a, iz) in secs {
            secs_map.insert(id.to_string(), SolverSection { id, a, iz, as_y: None });
        }
        let mut elems_map = HashMap::new();
        for (id, t, ni, nj, mi, si, hs, he) in elems {
            elems_map.insert(id.to_string(), SolverElement {
                id, elem_type: t.to_string(), node_i: ni, node_j: nj,
                material_id: mi, section_id: si, hinge_start: hs, hinge_end: he,
            });
        }
        let mut sups_map = HashMap::new();
        for (id, nid, t) in sups {
            sups_map.insert(id.to_string(), SolverSupport {
                id, node_id: nid, support_type: t.to_string(),
                kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
            });
        }
        SolverInput { nodes: nodes_map, materials: mats_map, sections: secs_map, elements: elems_map, supports: sups_map, loads, constraints: vec![] , connectors: HashMap::new() }
    }

    #[test]
    fn test_simply_supported_beam() {
        let input = make_input(
            vec![(1, 0.0, 0.0), (2, 6.0, 0.0)],
            vec![(1, 200000.0, 0.3)], // E in MPa
            vec![(1, 0.15, 0.003125)], // A=0.3*0.5, Iz=0.3*0.5^3/12
            vec![(1, "frame", 1, 2, 1, 1, false, false)],
            vec![(1, 1, "pinned"), (2, 2, "rollerX")],
            vec![SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 1, q_i: -10.0, q_j: -10.0, a: None, b: None,
            })],
        );
        let results = super::solver::linear::solve_2d(&input).unwrap();
        let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
        let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
        assert!((r1.ry - 30.0).abs() < 0.5, "R1y={}", r1.ry);
        assert!((r2.ry - 30.0).abs() < 0.5, "R2y={}", r2.ry);
    }

    #[test]
    fn test_cantilever() {
        let input = make_input(
            vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
            vec![(1, 200000.0, 0.3)],
            vec![(1, 0.15, 0.003125)],
            vec![(1, "frame", 1, 2, 1, 1, false, false)],
            vec![(1, 1, "fixed")],
            vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: -50.0, mz: 0.0 })],
        );
        let results = super::solver::linear::solve_2d(&input).unwrap();
        let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
        assert!((r1.ry - 50.0).abs() < 0.5, "Ry={}", r1.ry);
        assert!((r1.mz.abs() - 200.0).abs() < 1.0, "Mz={}", r1.mz);
    }

    #[test]
    fn test_truss() {
        let input = make_input(
            vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 2.0, 3.0)],
            vec![(1, 200000.0, 0.3)],
            vec![(1, 0.001, 0.0)],
            vec![
                (1, "truss", 1, 2, 1, 1, false, false),
                (2, "truss", 1, 3, 1, 1, false, false),
                (3, "truss", 2, 3, 1, 1, false, false),
            ],
            vec![(1, 1, "pinned"), (2, 2, "rollerX")],
            vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: -10.0, mz: 0.0 })],
        );
        let results = super::solver::linear::solve_2d(&input).unwrap();
        let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
        let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
        assert!((r1.ry + r2.ry - 10.0).abs() < 0.01);
        assert!((r1.ry - 5.0).abs() < 0.01);
    }
}
