//! wasm-bindgen surface of the phase-field research crate: one notched-plate simulation advanced
//! one load step at a time, so the page can draw and cache each step as it arrives.

use phasefield_shauer_2025::examples::NotchedPlate;
use phasefield_shauer_2025::solver::Solver;
use wasm_bindgen::prelude::*;

/// Upper bound on nodes for a browser run; larger meshes belong on a native build.
const MAX_NODES: usize = 40_000;

#[wasm_bindgen]
pub struct Simulation {
    solver: Solver,
}

#[wasm_bindgen]
impl Simulation {
    /// `config` is a JSON `NotchedPlate` (material, mesh, top_displacement, controls).
    #[wasm_bindgen(constructor)]
    pub fn new(config: &str) -> Result<Simulation, JsError> {
        let plate: NotchedPlate = serde_json::from_str(config).map_err(|e| JsError::new(&e.to_string()))?;
        let problem = plate.problem().map_err(|e| JsError::new(&e))?;
        if problem.mesh.n_nodes() > MAX_NODES {
            return Err(JsError::new(&format!("mesh has {} nodes; the browser limit is {MAX_NODES}", problem.mesh.n_nodes())));
        }
        Ok(Simulation { solver: Solver::new(problem).map_err(|e| JsError::new(&e))? })
    }

    #[wasm_bindgen(js_name = referenceConfig)]
    pub fn reference_config() -> String {
        serde_json::to_string(&NotchedPlate::reference()).unwrap()
    }

    /// Node coordinates, flattened [x0, y0, x1, y1, ...].
    pub fn nodes(&self) -> Vec<f64> {
        self.solver.problem.mesh.nodes.iter().flatten().copied().collect()
    }

    /// Element connectivity, flattened, four nodes per element.
    pub fn elements(&self) -> Vec<u32> {
        self.solver.problem.mesh.elements.iter().flatten().map(|&n| n as u32).collect()
    }

    /// Advance one load step; the step's results as JSON, or undefined when the run is complete.
    pub fn advance(&mut self) -> Result<Option<String>, JsError> {
        let step = self.solver.advance().map_err(|e| JsError::new(&e))?;
        Ok(step.map(|s| serde_json::to_string(&s).unwrap()))
    }

    pub fn damage(&self) -> Vec<f64> {
        self.solver.d.clone()
    }

    pub fn displacement(&self) -> Vec<f64> {
        self.solver.u.clone()
    }

    /// Degraded stress at each element centre, flattened [sxx, syy, sxy, ...].
    #[wasm_bindgen(js_name = elementStress)]
    pub fn element_stress(&self) -> Result<Vec<f64>, JsError> {
        let mut out = Vec::with_capacity(3 * self.solver.problem.mesh.elements.len());
        for e in 0..self.solver.problem.mesh.elements.len() {
            let (s, _) = self.solver.center_stress(e).map_err(|e| JsError::new(&e))?;
            out.extend_from_slice(&s);
        }
        Ok(out)
    }
}
