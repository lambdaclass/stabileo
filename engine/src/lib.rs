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

/// Serialize a result to a JsValue with maps as plain JS objects, matching the
/// shape `JSON.parse(serde_json::to_string(...))` produced on the JS side.
/// Used by the hot-path exports to skip the JSON text round trip.
fn to_js_value<T: serde::Serialize>(value: &T) -> Result<JsValue, JsValue> {
    serde::Serialize::serialize(
        value,
        &serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true),
    )
    .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Deserialize a hot-path input passed straight from JS (plain objects, no
/// JSON text). Id-keyed maps are `HashMap<String, _>` on the Rust side, so JS
/// object keys (already strings) round-trip natively.
fn from_js_value<T: serde::de::DeserializeOwned>(value: JsValue) -> Result<T, JsValue> {
    serde_wasm_bindgen::from_value(value)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))
}

/// Solve 2D linear static analysis. JsValue in → JsValue out (hot path).
#[wasm_bindgen]
pub fn solve_2d(input: JsValue) -> Result<JsValue, JsValue> {
    let input: types::SolverInput = from_js_value(input)?;
    let results = solver::linear::solve_2d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    to_js_value(&results)
}

/// Solve 3D linear static analysis. JsValue in → JsValue out (hot path).
#[wasm_bindgen]
pub fn solve_3d(input: JsValue) -> Result<JsValue, JsValue> {
    let input: types::SolverInput3D = from_js_value(input)?;
    let results = solver::linear::solve_3d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    to_js_value(&results)
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
    let results = solver::corotational::solve_corotational_2d(&input, max_iter, tolerance, n_increments, false)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Solve 3D co-rotational (large displacement) analysis. JSON in → JSON out.
#[wasm_bindgen]
pub fn solve_corotational_3d(json: &str, max_iter: usize, tolerance: f64, n_increments: usize) -> Result<String, JsValue> {
    let input: types::SolverInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let results = solver::corotational::solve_corotational_3d(&input, max_iter, tolerance, n_increments, false)
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

/// Combine 2D results with factors. JsValue in → JsValue out (hot path).
#[wasm_bindgen]
pub fn combine_results_2d(input: JsValue) -> Result<JsValue, JsValue> {
    let input: postprocess::combinations::CombinationInput = from_js_value(input)?;
    match postprocess::combinations::combine_results(&input) {
        Some(result) => to_js_value(&result),
        None => Ok(JsValue::NULL),
    }
}

/// Combine 3D results with factors. JsValue in → JsValue out (hot path).
#[wasm_bindgen]
pub fn combine_results_3d(input: JsValue) -> Result<JsValue, JsValue> {
    let input: postprocess::combinations::CombinationInput3D = from_js_value(input)?;
    match postprocess::combinations::combine_results_3d(&input) {
        Some(result) => to_js_value(&result),
        None => Ok(JsValue::NULL),
    }
}

/// Compute 2D envelope. JsValue in → JsValue out (hot path).
#[wasm_bindgen]
pub fn compute_envelope_2d(input: JsValue) -> Result<JsValue, JsValue> {
    let results: Vec<types::AnalysisResults> = from_js_value(input)?;
    match postprocess::combinations::compute_envelope(&results) {
        Some(env) => to_js_value(&env),
        None => Ok(JsValue::NULL),
    }
}

/// Compute 3D envelope. JsValue in → JsValue out (hot path).
#[wasm_bindgen]
pub fn compute_envelope_3d(input: JsValue) -> Result<JsValue, JsValue> {
    let results: Vec<types::AnalysisResults3D> = from_js_value(input)?;
    match postprocess::combinations::compute_envelope_3d(&results) {
        Some(env) => to_js_value(&env),
        None => Ok(JsValue::NULL),
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

/// Compute 3D section stress from raw internal forces (no element forces interpolation).
/// JSON: { N, Vy, Vz, Mx, My, Mz, section, fy?, yFiber?, zFiber? }
#[wasm_bindgen]
pub fn compute_section_stress_3d_from_forces(json: &str) -> Result<String, JsValue> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Input {
        #[serde(rename = "N")]
        n: f64,
        #[serde(rename = "Vy")]
        vy: f64,
        #[serde(rename = "Vz")]
        vz: f64,
        #[serde(rename = "Mx")]
        mx: f64,
        #[serde(rename = "My")]
        my: f64,
        #[serde(rename = "Mz")]
        mz: f64,
        section: postprocess::section_stress::SectionGeometry,
        #[serde(default)]
        fy: Option<f64>,
        #[serde(default)]
        y_fiber: Option<f64>,
        #[serde(default)]
        z_fiber: Option<f64>,
    }
    let d: Input = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let result = postprocess::section_stress_3d::compute_stress_3d_from_raw(
        d.n, d.vy, d.vz, d.mx, d.my, d.mz,
        &d.section, d.fy, d.y_fiber, d.z_fiber,
    );
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Compute 2D diagram value at position t for one element. JSON: { kind, t, elementForces }
#[wasm_bindgen]
pub fn compute_diagram_value_at(json: &str) -> Result<f64, JsValue> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Input {
        kind: String,
        t: f64,
        element_forces: types::ElementForces,
    }
    let d: Input = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    Ok(postprocess::diagrams::compute_diagram_value_at(&d.kind, d.t, &d.element_forces))
}

/// Compute 3D diagram value at position t for one element. JSON: { kind, t, elementForces }
#[wasm_bindgen]
pub fn compute_diagram_value_at_3d(json: &str) -> Result<f64, JsValue> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Input {
        kind: String,
        t: f64,
        element_forces: types::ElementForces3D,
    }
    let d: Input = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    Ok(postprocess::diagrams_3d::evaluate_diagram_3d_at(&d.element_forces, &d.kind, d.t))
}

// ==================== Multi-Case Load Combinations ====================

/// Solve 2D multi-case load combinations with envelope. JsValue in → JsValue out (hot path).
#[wasm_bindgen]
pub fn solve_multi_case_2d(input: JsValue) -> Result<JsValue, JsValue> {
    let input: solver::load_cases::MultiCaseInput = from_js_value(input)?;
    let result = solver::load_cases::solve_multi_case_2d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    to_js_value(&result)
}

/// Solve 3D multi-case load combinations with envelope. JsValue in → JsValue out (hot path).
#[wasm_bindgen]
pub fn solve_multi_case_3d(input: JsValue) -> Result<JsValue, JsValue> {
    let input: solver::load_cases::MultiCaseInput3D = from_js_value(input)?;
    let result = solver::load_cases::solve_multi_case_3d(&input)
        .map_err(|e| JsValue::from_str(&e))?;
    to_js_value(&result)
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

// ==================== Canonical Section Geometry ====================
//
// Wire convention: JSON strings in, JSON strings out, matching the existing
// `analyze_section` export. These are cold paths called once per section
// change, not per solve, so the JsValue boundary used by `solve_2d`/`solve_3d`
// would buy nothing and would split the section API across two conventions.
//
// Every export is versioned through the payload it returns and validates its
// inputs before use, so a malformed request produces an actionable message
// rather than a panic across the boundary.

/// Build canonical geometry for a parametric or catalogue section.
///
/// Request: `{ "kind": "...", ...dimensions }`. Every builder REQUIRES each
/// dimension it needs; nothing is inferred from a name and no thickness is
/// invented, which is what makes the missing-dimension defect unrepresentable
/// rather than merely unlikely.
#[wasm_bindgen]
pub fn build_section_geometry(json: &str) -> Result<String, JsValue> {
    use section::catalogue as cat;

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase", rename_all_fields = "camelCase", tag = "kind", deny_unknown_fields)]
    enum Request {
        Rect { b: f64, h: f64 },
        Circle { d: f64, #[serde(default)] arc_segments: Option<usize> },
        Chs { d: f64, t: f64, #[serde(default)] arc_segments: Option<usize> },
        #[serde(rename = "iSection")]
        ISection {
            h: f64, b: f64, tw: f64, tf: f64,
            #[serde(default)] root_radius: f64,
            #[serde(default)] arc_segments: Option<usize>,
            #[serde(default)] profile_id: Option<String>,
            #[serde(default)] standard: Option<String>,
        },
        /// IPN — tapered flanges, radii per DIN 1025-1's own rules.
        Ipn {
            h: f64, b: f64, tw: f64, tf: f64,
            #[serde(default)] arc_segments: Option<usize>,
            #[serde(default)] profile_id: Option<String>,
            #[serde(default)] standard: Option<String>,
        },
        /// UPN — tapered flanges, radii per DIN 1025-5's own rules.
        Upn {
            h: f64, b: f64, tw: f64, tf: f64,
            #[serde(default)] arc_segments: Option<usize>,
            #[serde(default)] profile_id: Option<String>,
            #[serde(default)] standard: Option<String>,
        },
        Tee {
            h: f64, b: f64, tw: f64, tf: f64,
            #[serde(default)] root_radius: f64,
            #[serde(default)] toe_radius: f64,
            #[serde(default)] arc_segments: Option<usize>,
            #[serde(default)] profile_id: Option<String>,
            #[serde(default)] standard: Option<String>,
        },
        Angle {
            h: f64, b: f64, t: f64,
            #[serde(default)] root_radius: f64,
            #[serde(default)] toe_radius: f64,
            #[serde(default)] arc_segments: Option<usize>,
            #[serde(default)] profile_id: Option<String>,
            #[serde(default)] standard: Option<String>,
        },
        Channel {
            h: f64, b: f64, tw: f64, tf: f64,
            #[serde(default)] slope: f64,
            #[serde(default)] root_radius: f64,
            #[serde(default)] toe_radius: f64,
            /// Where `tf` is quoted, from the web's outer face. Defaults to
            /// mid-overhang, which is what the American tables use.
            #[serde(default)] taper_ref: Option<f64>,
            #[serde(default)] arc_segments: Option<usize>,
            #[serde(default)] profile_id: Option<String>,
            #[serde(default)] standard: Option<String>,
        },
        Rhs {
            b: f64, h: f64, t: f64,
            #[serde(default)] corner_radius: f64,
            #[serde(default)] arc_segments: Option<usize>,
            #[serde(default)] profile_id: Option<String>,
            #[serde(default)] standard: Option<String>,
        },
        Custom { outer: Vec<[f64; 2]>, #[serde(default)] holes: Vec<Vec<[f64; 2]>> },
    }

    let req: Request = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {e}")))?;
    let segs = |o: Option<usize>| o.unwrap_or(cat::DEFAULT_ARC_SEGMENTS);
    // A `profileId` is what makes an outline a catalogue profile rather than a
    // shape the user drew; the standard travels with it so provenance survives
    // into the digest.
    let catalogue_source = |id: Option<String>, std_: Option<String>, default_std: &str, shape: &str| {
        match id {
            Some(profile_id) => cat::GeometrySource::Catalogue {
                profile_id,
                standard: std_.unwrap_or_else(|| default_std.into()),
            },
            None => cat::GeometrySource::Parametric { shape: shape.into() },
        }
    };

    let geometry = match req {
        Request::Rect { b, h } => cat::rectangle(b, h),
        Request::Circle { d, arc_segments } => cat::solid_circle(d, segs(arc_segments)),
        Request::Chs { d, t, arc_segments } => cat::circular_hollow(d, t, segs(arc_segments)),
        Request::ISection { h, b, tw, tf, root_radius, arc_segments, profile_id, standard } => {
            let source = match profile_id {
                Some(id) => cat::GeometrySource::Catalogue {
                    profile_id: id,
                    standard: standard.unwrap_or_else(|| "EN 10365".into()),
                },
                None => cat::GeometrySource::Parametric { shape: "i".into() },
            };
            cat::i_section(h, b, tw, tf, root_radius, segs(arc_segments), source)
        }
        Request::Ipn { h, b, tw, tf, arc_segments, profile_id, standard } => {
            cat::ipn_section(h, b, tw, tf, segs(arc_segments),
                catalogue_source(profile_id, standard, "DIN 1025-1", "ipn"))
        }
        Request::Upn { h, b, tw, tf, arc_segments, profile_id, standard } => {
            cat::upn_section(h, b, tw, tf, segs(arc_segments),
                catalogue_source(profile_id, standard, "DIN 1025-5", "upn"))
        }
        Request::Tee { h, b, tw, tf, root_radius, toe_radius, arc_segments, profile_id, standard } => {
            cat::tee_section_filleted(h, b, tw, tf, root_radius, toe_radius, segs(arc_segments),
                catalogue_source(profile_id, standard, "IRAM-IAS U 500-561", "tee"))
        }
        Request::Angle { h, b, t, root_radius, toe_radius, arc_segments, profile_id, standard } => {
            cat::angle_section_filleted(h, b, t, root_radius, toe_radius, segs(arc_segments),
                catalogue_source(profile_id, standard, "EN 10056-1", "angle"))
        }
        Request::Channel { h, b, tw, tf, slope, root_radius, toe_radius, taper_ref,
                           arc_segments, profile_id, standard } => {
            cat::tapered_channel(h, b, tw, tf, slope, root_radius, toe_radius,
                taper_ref.unwrap_or(tw + (b - tw) / 2.0), segs(arc_segments),
                catalogue_source(profile_id, standard, "IRAM-IAS U 500-509-4", "channel"))
        }
        Request::Rhs { b, h, t, corner_radius, arc_segments, profile_id, standard } => {
            cat::rectangular_hollow_rounded(b, h, t, corner_radius, segs(arc_segments),
                catalogue_source(profile_id, standard, "IRAM-IAS U 500-218", "rhs"))
        }
        Request::Custom { outer, holes } => cat::custom(outer, holes),
    }
    .map_err(|e| JsValue::from_str(&e))?;

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Response {
        geometry: cat::CanonicalGeometry,
        digest: String,
        properties: section::SectionProperties,
    }

    let properties = section::analyze_section(&section::SectionInput {
        polygons: geometry.polygons.clone(),
        modular_ratios: Default::default(),
    })
    .map_err(|e| JsValue::from_str(&e))?;

    serde_json::to_string(&Response { digest: geometry.digest(), geometry, properties })
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {e}")))
}

/// Axial and unsymmetrical-bending stress over canonical geometry.
///
/// Uses the complete centroidal inertia tensor including `Iyz`, so angles,
/// channels and arbitrary asymmetric polygons are handled correctly rather
/// than being treated as if their geometric axes were principal.
///
/// The response echoes the geometry digest so a caller can prove the drawing
/// and the numbers came from the same section.
#[wasm_bindgen]
pub fn analyze_section_bending(json: &str) -> Result<String, JsValue> {
    use section::bending::{analyze_bending, SectionForces};
    use section::catalogue::CanonicalGeometry;

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Request {
        geometry: CanonicalGeometry,
        #[serde(default)]
        n: f64,
        #[serde(default)]
        my: f64,
        #[serde(default)]
        mz: f64,
        /// When set, `my`/`mz` are element-local and are rotated into section
        /// coordinates by the geometry's own rotation.
        #[serde(default)]
        forces_are_local: bool,
    }

    let req: Request = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {e}")))?;

    let forces = if req.forces_are_local {
        SectionForces::from_local(req.n, req.my, req.mz, req.geometry.rotation)
    } else {
        SectionForces { n: req.n, my: req.my, mz: req.mz }
    };

    let result = analyze_bending(&req.geometry.polygons, forces)
        .map_err(|e| JsValue::from_str(&e))?;

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Response {
        #[serde(flatten)]
        result: section::bending::BendingResult,
        digest: String,
        geometry_version: u32,
    }

    serde_json::to_string(&Response {
        digest: req.geometry.digest(),
        geometry_version: req.geometry.version,
        result,
    })
    .map_err(|e| JsValue::from_str(&format!("Serialize error: {e}")))
}

/// Digest, version and provenance of a canonical geometry.
///
/// Exists so the drawing layer can assert it is rendering the same section the
/// numerical path analysed, without recomputing the geometry itself.
#[wasm_bindgen]
pub fn section_geometry_digest(json: &str) -> Result<String, JsValue> {
    use section::catalogue::CanonicalGeometry;
    let g: CanonicalGeometry = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {e}")))?;

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Response {
        digest: String,
        version: u32,
        arc_segments: usize,
        rotation: f64,
        source: section::catalogue::GeometrySource,
        solid_count: usize,
        hole_count: usize,
    }

    serde_json::to_string(&Response {
        digest: g.digest(),
        version: g.version,
        arc_segments: g.arc_segments,
        rotation: g.rotation,
        solid_count: g.polygons.iter().filter(|p| !p.is_void).count(),
        hole_count: g.polygons.iter().filter(|p| p.is_void).count(),
        source: g.source,
    })
    .map_err(|e| JsValue::from_str(&format!("Serialize error: {e}")))
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

// ==================== Beam Station Extraction ====================

/// Extract 2D beam design stations with per-combo forces and governing values. JSON: BeamStationInput
#[wasm_bindgen]
pub fn extract_beam_stations(json: &str) -> Result<String, JsValue> {
    let input: postprocess::beam_stations::BeamStationInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let result = postprocess::beam_stations::extract_beam_stations(&input);
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Extract 3D beam design stations with per-combo forces and governing values. JSON: BeamStationInput3D
#[wasm_bindgen]
pub fn extract_beam_stations_3d(json: &str) -> Result<String, JsValue> {
    let input: postprocess::beam_stations::BeamStationInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let result = postprocess::beam_stations::extract_beam_stations_3d(&input);
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Extract 2D beam stations grouped by member with member-level governing summaries. JSON: BeamStationInput
#[wasm_bindgen]
pub fn extract_beam_stations_grouped(json: &str) -> Result<String, JsValue> {
    let input: postprocess::beam_stations::BeamStationInput = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let result = postprocess::beam_stations::extract_beam_stations_grouped(&input);
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Extract 3D beam stations grouped by member with member-level governing summaries. JSON: BeamStationInput3D
#[wasm_bindgen]
pub fn extract_beam_stations_grouped_3d(json: &str) -> Result<String, JsValue> {
    let input: postprocess::beam_stations::BeamStationInput3D = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    let result = postprocess::beam_stations::extract_beam_stations_grouped_3d(&input);
    serde_json::to_string(&result)
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
            nodes_map.insert(id.to_string(), SolverNode { id, x, z: y });
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
                kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
            });
        }
        SolverInput { nodes: nodes_map, materials: mats_map, sections: secs_map, elements: elems_map, supports: sups_map, loads, constraints: vec![] , connectors: HashMap::new(), solver_options: None }
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
        assert!((r1.rz - 30.0).abs() < 0.5, "R1z={}", r1.rz);
        assert!((r2.rz - 30.0).abs() < 0.5, "R2z={}", r2.rz);
    }

    #[test]
    fn test_cantilever() {
        let input = make_input(
            vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
            vec![(1, 200000.0, 0.3)],
            vec![(1, 0.15, 0.003125)],
            vec![(1, "frame", 1, 2, 1, 1, false, false)],
            vec![(1, 1, "fixed")],
            vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -50.0, my: 0.0 })],
        );
        let results = super::solver::linear::solve_2d(&input).unwrap();
        let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
        assert!((r1.rz - 50.0).abs() < 0.5, "Rz={}", r1.rz);
        assert!((r1.my.abs() - 200.0).abs() < 1.0, "My={}", r1.my);
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
            vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -10.0, my: 0.0 })],
        );
        let results = super::solver::linear::solve_2d(&input).unwrap();
        let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
        let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
        assert!((r1.rz + r2.rz - 10.0).abs() < 0.01);
        assert!((r1.rz - 5.0).abs() < 0.01);
    }

    /// Barycentric locate over a field export's mesh: index of the triangle
    /// containing `p`, or the nearest by centroid — the same contract as
    /// `SectionMesh::locate`, re-implemented here so the test exercises the
    /// exported nodes/triangles rather than the internal mesh.
    fn locate_field(nodes: &[[f64; 2]], triangles: &[[usize; 3]], p: [f64; 2]) -> usize {
        let mut best: Option<(f64, usize)> = None;
        for (i, &t) in triangles.iter().enumerate() {
            let [a, b, c] = [nodes[t[0]], nodes[t[1]], nodes[t[2]]];
            let d = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
            if d.abs() > 0.0 {
                let l1 = ((b[0] - p[0]) * (c[1] - p[1]) - (c[0] - p[0]) * (b[1] - p[1])) / d;
                let l2 = ((c[0] - p[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (c[1] - p[1])) / d;
                let l3 = 1.0 - l1 - l2;
                if l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9 {
                    return i;
                }
            }
            let cy = (a[0] + b[0] + c[0]) / 3.0 - p[0];
            let cz = (a[1] + b[1] + c[1]) / 3.0 - p[1];
            let dist = cy * cy + cz * cz;
            if best.map_or(true, |(d0, _)| dist < d0) {
                best = Some((dist, i));
            }
        }
        best.unwrap().1
    }

    fn i_section_geometry() -> serde_json::Value {
        let built = super::build_section_geometry(
            &serde_json::json!({
                "kind": "iSection", "h": 0.3, "b": 0.15, "tw": 0.007, "tf": 0.01,
                "rootRadius": 0.012
            })
            .to_string(),
        )
        .unwrap();
        let v: serde_json::Value = serde_json::from_str(&built).unwrap();
        v["geometry"].clone()
    }

    #[test]
    fn section_shear_field_matches_point_query() {
        let geometry = i_section_geometry();
        // The last point is deliberately OUTSIDE the section: both paths must
        // then agree through the nearest-triangle fallback, which is the whole
        // reason locate has one. (Interior points must sit strictly inside a
        // triangle — on a shared edge, float rounding may legitimately pick
        // different neighbours in the two frames, and tau is piecewise
        // constant per triangle.)
        for p in [[0.03, 0.10], [-0.05, -0.12], [0.0, 0.0], [0.25, 0.25]] {
            let point = super::analyze_section_shear(
                &serde_json::json!({ "geometry": geometry, "at": p }).to_string(),
            )
            .unwrap();
            let point: serde_json::Value = serde_json::from_str(&point).unwrap();
            let field = super::analyze_section_shear_field(
                &serde_json::json!({ "geometry": geometry }).to_string(),
            )
            .unwrap();
            let field: serde_json::Value = serde_json::from_str(&field).unwrap();

            let nodes: Vec<[f64; 2]> = serde_json::from_value(field["nodes"].clone()).unwrap();
            let triangles: Vec<[usize; 3]> =
                serde_json::from_value(field["triangles"].clone()).unwrap();
            let i = locate_field(&nodes, &triangles, p);

            for axis in ["vy", "vz"] {
                let tau: Vec<[f64; 2]> =
                    serde_json::from_value(field[axis]["tau"].clone()).unwrap();
                let at: [f64; 2] = serde_json::from_value(point[axis]["at"].clone()).unwrap();
                for k in 0..2 {
                    let denom = at[k].abs().max(1.0);
                    assert!(
                        ((tau[i][k] - at[k]) / denom).abs() < 1e-9,
                        "{axis} at {p:?}: field={} point={}",
                        tau[i][k],
                        at[k]
                    );
                }
                let tm0 = field[axis]["tauMax"].as_f64().unwrap();
                let tm1 = point[axis]["tauMax"].as_f64().unwrap();
                assert!((tm0 - tm1).abs() / tm1 < 1e-12, "tauMax {axis}: {tm0} vs {tm1}");
            }
        }
    }

    #[test]
    fn section_torsion_field_matches_point_query() {
        let geometry = i_section_geometry();
        // Last point is outside the section on purpose — see the shear test.
        for p in [[0.03, 0.10], [-0.05, -0.12], [0.0, 0.0], [0.25, 0.25]] {
            let point = super::analyze_section_torsion(
                &serde_json::json!({ "geometry": geometry, "at": p }).to_string(),
            )
            .unwrap();
            let point: serde_json::Value = serde_json::from_str(&point).unwrap();
            let field = super::analyze_section_torsion_field(
                &serde_json::json!({ "geometry": geometry }).to_string(),
            )
            .unwrap();
            let field: serde_json::Value = serde_json::from_str(&field).unwrap();

            let nodes: Vec<[f64; 2]> = serde_json::from_value(field["nodes"].clone()).unwrap();
            let triangles: Vec<[usize; 3]> =
                serde_json::from_value(field["triangles"].clone()).unwrap();
            let tau: Vec<[f64; 2]> = serde_json::from_value(field["tau"].clone()).unwrap();
            let at: [f64; 2] = serde_json::from_value(point["at"].clone()).unwrap();
            let i = locate_field(&nodes, &triangles, p);
            for k in 0..2 {
                let denom = at[k].abs().max(1.0);
                assert!(
                    ((tau[i][k] - at[k]) / denom).abs() < 1e-9,
                    "torsion at {p:?}: field={} point={}",
                    tau[i][k],
                    at[k]
                );
            }
            let j0 = field["j"].as_f64().unwrap();
            let j1 = point["j"].as_f64().unwrap();
            assert!((j0 - j1).abs() / j1 < 1e-12, "j: {j0} vs {j1}");
        }
    }
}

/// Shared prologue of the mesh-based section exports: analyse the polygons,
/// normalise to a ~100-unit frame, and mesh.
///
/// The caller's units are its own business — the web side works in metres, so
/// a section is 0.3 across and its target triangle area is ~1e-6 — and a
/// Delaunay refiner carries absolute robustness tolerances that such small
/// coordinates walk straight into, yielding a mesh far coarser than asked for
/// and a J tens of percent low. Scaling the outline so its largest dimension
/// is ~100 units makes the result independent of the caller's units; every
/// quantity then scales back by its own power of `s` (J by s⁴, stress by s²,
/// Cw by s⁶, lengths by s).
///
/// Returns the mesh in the scaled frame, the scale factor, and the section
/// properties in the CALLER's units.
fn normalize_and_mesh(
    geometry: &section::catalogue::CanonicalGeometry,
    max_area: Option<f64>,
) -> Result<(section::mesh::SectionMesh, f64, section::SectionProperties), JsValue> {
    use section::mesh::{mesh_section, MeshParams};

    let props = section::analyze_section(&section::SectionInput {
        polygons: geometry.polygons.clone(),
        modular_ratios: Default::default(),
    })
    .map_err(|e| JsValue::from_str(&e))?;

    let extent = geometry
        .polygons
        .iter()
        .flat_map(|p| p.vertices.iter())
        .fold(0.0_f64, |m, v| m.max(v[0].abs()).max(v[1].abs()));
    if !(extent > 0.0) || !extent.is_finite() {
        return Err(JsValue::from_str("geometry has no finite extent"));
    }
    let scale = 100.0 / extent;

    let mut scaled = geometry.polygons.clone();
    for poly in &mut scaled {
        for v in &mut poly.vertices {
            v[0] *= scale;
            v[1] *= scale;
        }
    }

    let mut params = MeshParams::default();
    // Roughly two thousand triangles: J converges at the field's rate rather
    // than the gradient's, so this is ample and keeps the solve within a few
    // milliseconds — which matters, because this runs per model section.
    let scaled_area = props.a * scale * scale;
    params.max_area = max_area.map(|a| a * scale * scale).unwrap_or(scaled_area / 2000.0);

    let mesh = mesh_section(&scaled, &params).map_err(|e| JsValue::from_str(&e))?;
    Ok((mesh, scale, props))
}

/// Mesh nodes serialised for a field export: centroid-relative, in the
/// caller's units, so a query point in that same frame needs no shift.
fn field_nodes(mesh: &section::mesh::SectionMesh, scale: f64, yc: f64, zc: f64) -> Vec<[f64; 2]> {
    mesh.nodes
        .iter()
        .map(|n| [n[0] / scale - yc, n[1] / scale - zc])
        .collect()
}

/// Saint-Venant torsion constant and shear field for canonical geometry.
///
/// This is what retires the `Iz * 0.001` placeholder. It is a real solve — mesh
/// the section, solve Prandtl's stress function, integrate — so it costs
/// milliseconds rather than microseconds and is meant to be computed once per
/// section and cached, not called per element.
///
/// Handles closed sections as well as open ones: the unknown constant on each
/// hole boundary is fixed by Bredt's circulation condition.
#[wasm_bindgen]
pub fn analyze_section_torsion(json: &str) -> Result<String, JsValue> {
    use section::poisson::SolveStrategy;

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct Request {
        geometry: section::catalogue::CanonicalGeometry,
        /// Largest triangle area, in the geometry's own units squared. Omitted
        /// means "size it from the section", which is what callers should do.
        #[serde(default)]
        max_area: Option<f64>,
        /// Optional query point, CENTROID-RELATIVE, in the caller's units.
        #[serde(default)]
        at: Option<[f64; 2]>,
    }

    let req: Request = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {e}")))?;

    let (mesh, scale, props) = normalize_and_mesh(&req.geometry, req.max_area)?;
    let mut res = section::torsion::solve_torsion(&mesh, SolveStrategy::Sparse)
        .map_err(|e| JsValue::from_str(&e))?;
    // Back to the caller's units: J is L^4, shear under unit twist rate is L.
    res.j /= scale.powi(4);
    res.tau_max /= scale;

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Response {
        j: f64,
        /// Peak shear under unit twist rate, for scaling a real state.
        tau_max: f64,
        /// `[tau_xy, tau_xz]` at the query point under unit twist rate.
        #[serde(skip_serializing_if = "Option::is_none")]
        at: Option<[f64; 2]>,
        triangles: usize,
        residual: f64,
    }
    let at = req.at.and_then(|p| {
        mesh.locate([p[0] * scale + props.yc * scale, p[1] * scale + props.zc * scale])
            .map(|i| [res.tau[i][0] / scale, res.tau[i][1] / scale])
    });
    serde_json::to_string(&Response {
        j: res.j,
        tau_max: res.tau_max,
        at,
        triangles: mesh.triangles.len(),
        residual: res.residual,
    })
    .map_err(|e| JsValue::from_str(&format!("Serialize error: {e}")))
}

/// The torsion solve as a reusable field: mesh plus the per-triangle shear
/// under unit twist rate.
///
/// `analyze_section_torsion` answers ONE query point per mesh-and-solve; a
/// caller sweeping many points (the stress panel's fibre slider, at one call
/// per drag tick) would pay the full solve for every one of them. This export
/// returns the solved field once — the caller caches it per geometry digest
/// and locates triangles locally, which is free by comparison.
///
/// Nodes are centroid-relative and in the caller's units, and `tau` is already
/// scaled back to those units, so a query needs no frame arithmetic at all.
#[wasm_bindgen]
pub fn analyze_section_torsion_field(json: &str) -> Result<String, JsValue> {
    use section::poisson::SolveStrategy;

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct Request {
        geometry: section::catalogue::CanonicalGeometry,
        #[serde(default)]
        max_area: Option<f64>,
    }

    let req: Request = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {e}")))?;

    let (mesh, scale, props) = normalize_and_mesh(&req.geometry, req.max_area)?;
    let res = section::torsion::solve_torsion(&mesh, SolveStrategy::Sparse)
        .map_err(|e| JsValue::from_str(&e))?;

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Response {
        j: f64,
        tau_max: f64,
        /// Mesh nodes, centroid-relative, in the caller's units.
        nodes: Vec<[f64; 2]>,
        /// Triangles as node indices.
        triangles: Vec<[usize; 3]>,
        /// `[tau_xy, tau_xz]` per triangle under unit twist rate, in the
        /// caller's units.
        tau: Vec<[f64; 2]>,
        residual: f64,
    }
    serde_json::to_string(&Response {
        // J is L⁴, shear under unit twist rate is L.
        j: res.j / scale.powi(4),
        tau_max: res.tau_max / scale,
        nodes: field_nodes(&mesh, scale, props.yc, props.zc),
        triangles: mesh.triangles.clone(),
        tau: res.tau.iter().map(|t| [t[0] / scale, t[1] / scale]).collect(),
        residual: res.residual,
    })
    .map_err(|e| JsValue::from_str(&format!("Serialize error: {e}")))
}

/// Transverse shear over canonical geometry, for unit forces on both axes.
///
/// This is what lets angles, closed tubes and arbitrary polygons report a shear
/// stress at all: Jourawski's `V*Q/(I*b)` needs one well-defined width and they
/// have none, so the legacy path refused them outright.
///
/// Like torsion, it meshes and solves, so it is a per-section cost meant to be
/// cached rather than a per-query one.
#[wasm_bindgen]
pub fn analyze_section_shear(json: &str) -> Result<String, JsValue> {
    use section::poisson::SolveStrategy;
    use section::shear::ShearInertia;

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct Request {
        geometry: section::catalogue::CanonicalGeometry,
        #[serde(default)]
        max_area: Option<f64>,
        /// Optional query point, CENTROID-RELATIVE, in the caller's units.
        #[serde(default)]
        at: Option<[f64; 2]>,
    }

    let req: Request = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {e}")))?;

    // Same unit normalisation as torsion, and for the same reason. Shear
    // stress is force over area, so it scales back by `s^2`.
    let (mesh, scale, props) = normalize_and_mesh(&req.geometry, req.max_area)?;
    let res = section::shear::solve_shear(
        &mesh,
        [props.yc * scale, props.zc * scale],
        ShearInertia { iy: props.iy * scale.powi(4), iz: props.iz * scale.powi(4) },
        SolveStrategy::Sparse,
    )
    .map_err(|e| JsValue::from_str(&e))?;

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Axis {
        tau_max: f64,
        kappa: f64,
        /// `[tau_xy, tau_xz]` at the query point, per unit force. Absent when
        /// no point was asked for.
        #[serde(skip_serializing_if = "Option::is_none")]
        at: Option<[f64; 2]>,
    }
    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Response {
        vy: Axis,
        vz: Axis,
        /// Shear centre, centroid-relative, in the caller's units.
        shear_centre: [f64; 2],
        triangles: usize,
        residual: f64,
    }
    // Unit force over scaled geometry gives stress in scaled units; a stress is
    // force per area, so undo `s^2`.
    let s2 = scale * scale;
    // The query arrives centroid-relative; the mesh is in absolute scaled
    // coordinates, so shift it onto the centroid before locating.
    let located = req.at.and_then(|p| {
        mesh.locate([p[0] * scale + props.yc * scale, p[1] * scale + props.zc * scale])
    });
    let at_of = |f: &section::shear::ShearField| {
        located.map(|i| [f.tau[i][0] * s2, f.tau[i][1] * s2])
    };
    serde_json::to_string(&Response {
        vy: Axis { tau_max: res.vy.tau_max * s2, kappa: res.vy.kappa, at: at_of(&res.vy) },
        vz: Axis { tau_max: res.vz.tau_max * s2, kappa: res.vz.kappa, at: at_of(&res.vz) },
        // A length, so it scales back by `s` alone.
        shear_centre: [res.shear_centre[0] / scale, res.shear_centre[1] / scale],
        triangles: mesh.triangles.len(),
        residual: res.residual,
    })
    .map_err(|e| JsValue::from_str(&format!("Serialize error: {e}")))
}

/// The shear solve as a reusable field: mesh plus the per-triangle stress for
/// a unit force on each axis.
///
/// Same motive as `analyze_section_torsion_field`: `analyze_section_shear`
/// answers one query point per mesh-and-solve, and a sweeping caller (the
/// stress panel's fibre slider) would re-solve per drag tick. Cache this per
/// geometry digest and locate triangles locally instead. Nodes are
/// centroid-relative in the caller's units and `tau` is already scaled back,
/// so a query needs no frame arithmetic.
#[wasm_bindgen]
pub fn analyze_section_shear_field(json: &str) -> Result<String, JsValue> {
    use section::poisson::SolveStrategy;
    use section::shear::ShearInertia;

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct Request {
        geometry: section::catalogue::CanonicalGeometry,
        #[serde(default)]
        max_area: Option<f64>,
    }

    let req: Request = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {e}")))?;

    let (mesh, scale, props) = normalize_and_mesh(&req.geometry, req.max_area)?;
    let res = section::shear::solve_shear(
        &mesh,
        [props.yc * scale, props.zc * scale],
        ShearInertia { iy: props.iy * scale.powi(4), iz: props.iz * scale.powi(4) },
        SolveStrategy::Sparse,
    )
    .map_err(|e| JsValue::from_str(&e))?;

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct AxisField {
        tau_max: f64,
        kappa: f64,
        /// `[tau_xy, tau_xz]` per triangle, per unit force, in the caller's units.
        tau: Vec<[f64; 2]>,
    }
    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Response {
        vy: AxisField,
        vz: AxisField,
        /// Shear centre, centroid-relative, in the caller's units.
        shear_centre: [f64; 2],
        /// Mesh nodes, centroid-relative, in the caller's units.
        nodes: Vec<[f64; 2]>,
        /// Triangles as node indices.
        triangles: Vec<[usize; 3]>,
        residual: f64,
    }
    // Unit force over scaled geometry gives stress in scaled units; a stress is
    // force per area, so undo `s^2`.
    let s2 = scale * scale;
    let axis_field = |f: &section::shear::ShearField| AxisField {
        tau_max: f.tau_max * s2,
        kappa: f.kappa,
        tau: f.tau.iter().map(|t| [t[0] * s2, t[1] * s2]).collect(),
    };
    serde_json::to_string(&Response {
        vy: axis_field(&res.vy),
        vz: axis_field(&res.vz),
        shear_centre: [res.shear_centre[0] / scale, res.shear_centre[1] / scale],
        nodes: field_nodes(&mesh, scale, props.yc, props.zc),
        triangles: mesh.triangles.clone(),
        residual: res.residual,
    })
    .map_err(|e| JsValue::from_str(&format!("Serialize error: {e}")))
}

/// Plastic section moduli for canonical geometry.
///
/// `Z` is what a limit-state check needs, and it is taken about the PLASTIC
/// neutral axis — the equal-area line, not the centroid. The two coincide only
/// for a doubly-symmetric section; for a tee or a channel, using the centroid
/// understates the result.
#[wasm_bindgen]
pub fn analyze_section_plastic(json: &str) -> Result<String, JsValue> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct Request {
        geometry: section::catalogue::CanonicalGeometry,
        #[serde(default)]
        max_area: Option<f64>,
    }

    let req: Request = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {e}")))?;

    let (mesh, scale, props) = normalize_and_mesh(&req.geometry, req.max_area)?;
    let z = section::plastic::solve_plastic(&mesh).map_err(|e| JsValue::from_str(&e))?;

    // Warping needs the shear centre as its pole, so it comes from the shear
    // solve. A shear failure is a real numerical problem and must surface —
    // only the WARPING solve may quietly decline: a closed section has no
    // meaningful Cw, and reporting that as absent rather than as an error is
    // honest, because a tube having no warping constant is an answer.
    let cw = {
        use section::shear::{solve_shear, ShearInertia};
        let c = [props.yc * scale, props.zc * scale];
        let sh = solve_shear(
            &mesh, c,
            ShearInertia { iy: props.iy * scale.powi(4), iz: props.iz * scale.powi(4) },
            section::poisson::SolveStrategy::Sparse,
        )
        .map_err(|e| JsValue::from_str(&format!("shear solve failed on the way to Cw: {e}")))?;
        section::warping::solve_warping(
            &mesh, c, sh.shear_centre, section::poisson::SolveStrategy::Sparse,
        )
        .ok()
        // Cw is a sixth moment.
        .map(|w| w.cw / scale.powi(6))
    };

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Response {
        zy: f64,
        zz: f64,
        /// Elastic moduli, so the caller has the shape factor without a second call.
        sy: f64,
        sz: f64,
        pna_z: f64,
        pna_y: f64,
        /// Warping constant. Absent for a closed section, where it is negligible.
        #[serde(skip_serializing_if = "Option::is_none")]
        cw: Option<f64>,
    }
    // Z is a third moment, so it scales back by `s^3`; the neutral axes are
    // lengths and are returned centroid-relative.
    let s3 = scale.powi(3);
    let half_z = req.geometry.polygons.iter().flat_map(|p| p.vertices.iter())
        .fold(0.0_f64, |m, v| m.max((v[1] - props.zc).abs()));
    let half_y = req.geometry.polygons.iter().flat_map(|p| p.vertices.iter())
        .fold(0.0_f64, |m, v| m.max((v[0] - props.yc).abs()));
    serde_json::to_string(&Response {
        zy: z.zy / s3,
        zz: z.zz / s3,
        sy: if half_z > 0.0 { props.iy / half_z } else { 0.0 },
        sz: if half_y > 0.0 { props.iz / half_y } else { 0.0 },
        pna_z: z.pna_z / scale - props.zc,
        pna_y: z.pna_y / scale - props.yc,
        cw,
    })
    .map_err(|e| JsValue::from_str(&format!("Serialize error: {e}")))
}
