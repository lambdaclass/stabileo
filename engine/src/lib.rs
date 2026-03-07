pub mod types;
pub mod linalg;
pub mod element;
pub mod solver;
pub mod postprocess;

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
        SolverInput { nodes: nodes_map, materials: mats_map, sections: secs_map, elements: elems_map, supports: sups_map, loads }
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
