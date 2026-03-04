pub mod model;
pub mod solver;
pub mod results;
mod export;

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

// Re-exports for convenience
pub use model::*;
pub use solver::Solver;
pub use results::AnalysisResults;

// ============== WASM Bindings ==============

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

/// Initialize panic hook for better error messages
#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// WASM-friendly structure wrapper
#[wasm_bindgen]
pub struct Engine {
    structure: Structure,
}

#[wasm_bindgen]
impl Engine {
    /// Create a new empty structure
    #[wasm_bindgen(constructor)]
    pub fn new(name: &str) -> Engine {
        Engine {
            structure: Structure::new(name),
        }
    }

    /// Load structure from JSON
    #[wasm_bindgen(js_name = fromJson)]
    pub fn from_json(json: &str) -> Result<Engine, JsValue> {
        let structure: Structure = serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&format!("JSON parse error: {}", e)))?;
        Ok(Engine { structure })
    }

    /// Export structure to JSON
    #[wasm_bindgen(js_name = toJson)]
    pub fn to_json(&self) -> Result<String, JsValue> {
        serde_json::to_string_pretty(&self.structure)
            .map_err(|e| JsValue::from_str(&format!("JSON serialize error: {}", e)))
    }

    /// Add a node and return its ID
    #[wasm_bindgen(js_name = addNode)]
    pub fn add_node(&mut self, x: f64, y: f64) -> usize {
        self.structure.add_node(x, y)
    }

    /// Add steel material and return its ID
    #[wasm_bindgen(js_name = addSteel)]
    pub fn add_steel(&mut self) -> usize {
        self.structure.add_steel()
    }

    /// Add concrete material and return its ID
    #[wasm_bindgen(js_name = addConcrete)]
    pub fn add_concrete(&mut self) -> usize {
        self.structure.add_concrete()
    }

    /// Add custom material and return its ID
    #[wasm_bindgen(js_name = addMaterial)]
    pub fn add_material(&mut self, name: &str, e: f64, nu: f64, rho: f64) -> usize {
        self.structure.add_material(name, e, nu, rho)
    }

    /// Add rectangular section and return its ID
    #[wasm_bindgen(js_name = addRectangularSection)]
    pub fn add_rectangular_section(&mut self, name: &str, b: f64, h: f64) -> usize {
        self.structure.add_rectangular_section(name, b, h)
    }

    /// Add generic section and return its ID
    #[wasm_bindgen(js_name = addSection)]
    pub fn add_section(&mut self, name: &str, a: f64, iz: f64) -> usize {
        self.structure.add_section(name, a, iz)
    }

    /// Add frame element and return its ID
    #[wasm_bindgen(js_name = addFrame)]
    pub fn add_frame(&mut self, node_i: usize, node_j: usize, mat_id: usize, sec_id: usize) -> usize {
        self.structure.add_frame(node_i, node_j, mat_id, sec_id)
    }

    /// Add frame element with hinges and return its ID
    #[wasm_bindgen(js_name = addFrameWithHinge)]
    pub fn add_frame_with_hinge(
        &mut self,
        node_i: usize,
        node_j: usize,
        mat_id: usize,
        sec_id: usize,
        hinge_start: bool,
        hinge_end: bool,
    ) -> usize {
        self.structure.add_frame_with_hinge(node_i, node_j, mat_id, sec_id, hinge_start, hinge_end)
    }

    /// Add truss element and return its ID
    #[wasm_bindgen(js_name = addTruss)]
    pub fn add_truss(&mut self, node_i: usize, node_j: usize, mat_id: usize, sec_id: usize) -> usize {
        self.structure.add_truss(node_i, node_j, mat_id, sec_id)
    }

    /// Add fixed support
    #[wasm_bindgen(js_name = addFixedSupport)]
    pub fn add_fixed_support(&mut self, node_id: usize) -> usize {
        self.structure.add_fixed_support(node_id)
    }

    /// Add pinned support
    #[wasm_bindgen(js_name = addPinnedSupport)]
    pub fn add_pinned_support(&mut self, node_id: usize) -> usize {
        self.structure.add_pinned_support(node_id)
    }

    /// Add roller support (free in X)
    #[wasm_bindgen(js_name = addRollerX)]
    pub fn add_roller_x(&mut self, node_id: usize) -> usize {
        self.structure.add_roller_x(node_id)
    }

    /// Add roller support (free in Y)
    #[wasm_bindgen(js_name = addRollerY)]
    pub fn add_roller_y(&mut self, node_id: usize) -> usize {
        self.structure.add_roller_y(node_id)
    }

    /// Add nodal load
    #[wasm_bindgen(js_name = addNodalLoad)]
    pub fn add_nodal_load(&mut self, node_id: usize, fx: f64, fy: f64, mz: f64) -> usize {
        self.structure.add_nodal_load(node_id, fx, fy, mz)
    }

    /// Add uniformly distributed load on element
    #[wasm_bindgen(js_name = addDistributedLoad)]
    pub fn add_distributed_load(&mut self, element_id: usize, q: f64) -> usize {
        self.structure.add_distributed_load(element_id, q)
    }

    /// Add point load on element
    #[wasm_bindgen(js_name = addPointLoad)]
    pub fn add_point_load(&mut self, element_id: usize, a: f64, p: f64) -> usize {
        self.structure.add_point_load(element_id, a, p)
    }

    /// Get node count
    #[wasm_bindgen(js_name = nodeCount)]
    pub fn node_count(&self) -> usize {
        self.structure.node_count()
    }

    /// Get element count
    #[wasm_bindgen(js_name = elementCount)]
    pub fn element_count(&self) -> usize {
        self.structure.element_count()
    }

    /// Validate structure
    pub fn validate(&self) -> Result<(), JsValue> {
        self.structure.validate()
            .map_err(|e| JsValue::from_str(&e))
    }

    /// Run analysis and return results as JSON
    pub fn solve(&self) -> Result<String, JsValue> {
        let mut solver = Solver::new(self.structure.clone());
        let results = solver.solve()
            .map_err(|e| JsValue::from_str(&e))?;

        serde_json::to_string(&results)
            .map_err(|e| JsValue::from_str(&format!("Results serialize error: {}", e)))
    }

    /// Run analysis and return typed results
    #[wasm_bindgen(js_name = solveTyped)]
    pub fn solve_typed(&self) -> Result<JsValue, JsValue> {
        let mut solver = Solver::new(self.structure.clone());
        let results = solver.solve()
            .map_err(|e| JsValue::from_str(&e))?;

        serde_wasm_bindgen::to_value(&results)
            .map_err(|e| JsValue::from_str(&format!("Results convert error: {}", e)))
    }
}

/// Quick analysis function - takes JSON, returns JSON
#[wasm_bindgen]
pub fn analyze(structure_json: &str) -> Result<String, JsValue> {
    let structure: Structure = serde_json::from_str(structure_json)
        .map_err(|e| JsValue::from_str(&format!("JSON parse error: {}", e)))?;

    let mut solver = Solver::new(structure);
    let results = solver.solve()
        .map_err(|e| JsValue::from_str(&e))?;

    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Results serialize error: {}", e)))
}

// ============== Native Tests ==============

#[cfg(test)]
mod integration_tests {
    use super::*;

    /// Test: Simply supported beam with uniform load
    /// Expected: M_max = qL²/8, V_max = qL/2, δ_max = 5qL⁴/(384EI)
    #[test]
    fn test_simply_supported_beam_uniform_load() {
        let mut s = Structure::new("Simply Supported Beam");

        // 6m beam
        let n1 = s.add_node(0.0, 0.0);
        let n2 = s.add_node(6.0, 0.0);

        // Steel, rectangular 0.3m x 0.5m
        let mat = s.add_steel();
        let sec = s.add_rectangular_section("Beam", 0.3, 0.5);

        // Add element
        let e1 = s.add_frame(n1, n2, mat, sec);

        // Supports: pinned + roller
        s.add_pinned_support(n1);
        s.add_roller_x(n2);

        // Uniform load: 10 kN/m
        s.add_distributed_load(e1, -10.0); // negative = downward

        // Solve
        let mut solver = Solver::new(s);
        let results = solver.solve().expect("Analysis should succeed");

        // Expected values
        let q = 10.0;
        let l = 6.0;
        let m_max_expected = q * l * l / 8.0; // 45 kN·m
        let v_max_expected = q * l / 2.0;     // 30 kN

        // Check reactions (should be qL/2 at each support)
        let r1 = results.get_reaction(n1).expect("Reaction at n1");
        let r2 = results.get_reaction(n2).expect("Reaction at n2");

        assert!((r1.ry - v_max_expected).abs() < 0.1,
            "Reaction at n1: expected {}, got {}", v_max_expected, r1.ry);
        assert!((r2.ry - v_max_expected).abs() < 0.1,
            "Reaction at n2: expected {}, got {}", v_max_expected, r2.ry);

        // Check internal forces (absolute value due to sign convention)
        let forces = results.get_element_forces(e1).expect("Element forces");
        assert!((forces.v_start.abs() - v_max_expected).abs() < 0.1,
            "Shear at start: expected {}, got {}", v_max_expected, forces.v_start.abs());

        println!("Simply supported beam test passed!");
        println!("  Reactions: Ry1={:.2} kN, Ry2={:.2} kN", r1.ry, r2.ry);
        println!("  Expected M_max: {:.2} kN·m", m_max_expected);
    }

    /// Test: Cantilever beam with point load at tip
    /// Expected: M_max = PL at support, δ = PL³/(3EI) at tip
    #[test]
    fn test_cantilever_point_load() {
        let mut s = Structure::new("Cantilever");

        // 4m cantilever
        let n1 = s.add_node(0.0, 0.0);
        let n2 = s.add_node(4.0, 0.0);

        let mat = s.add_steel();
        let sec = s.add_rectangular_section("Beam", 0.3, 0.5);

        s.add_frame(n1, n2, mat, sec);
        s.add_fixed_support(n1);

        // Point load at tip: 50 kN downward
        s.add_nodal_load(n2, 0.0, -50.0, 0.0);

        let mut solver = Solver::new(s);
        let results = solver.solve().expect("Analysis should succeed");

        // Expected
        let p = 50.0;
        let l = 4.0;
        let m_expected = p * l; // 200 kN·m

        let r1 = results.get_reaction(n1).expect("Reaction at n1");

        assert!((r1.ry - p).abs() < 0.1,
            "Vertical reaction: expected {}, got {}", p, r1.ry);
        assert!((r1.mz.abs() - m_expected).abs() < 0.1,
            "Moment reaction: expected {}, got {}", m_expected, r1.mz.abs());

        println!("Cantilever test passed!");
        println!("  Reaction: Ry={:.2} kN, Mz={:.2} kN·m", r1.ry, r1.mz);
    }

    /// Test: Simple truss (triangle)
    #[test]
    fn test_simple_truss() {
        let mut s = Structure::new("Triangular Truss");

        // Triangle: base 4m, height 3m
        let n1 = s.add_node(0.0, 0.0);
        let n2 = s.add_node(4.0, 0.0);
        let n3 = s.add_node(2.0, 3.0);

        let mat = s.add_steel();
        let sec = s.add_section("Bar", 0.001, 0.0); // A = 10 cm²

        // Truss elements
        s.add_truss(n1, n2, mat, sec); // bottom
        s.add_truss(n1, n3, mat, sec); // left diagonal
        s.add_truss(n2, n3, mat, sec); // right diagonal

        // Supports
        s.add_pinned_support(n1);
        s.add_roller_x(n2);

        // Load at top node
        s.add_nodal_load(n3, 0.0, -10.0, 0.0);

        let mut solver = Solver::new(s);
        let results = solver.solve().expect("Analysis should succeed");

        // Check equilibrium
        let r1 = results.get_reaction(n1).expect("Reaction at n1");
        let r2 = results.get_reaction(n2).expect("Reaction at n2");

        // Sum of vertical reactions should equal applied load
        assert!((r1.ry + r2.ry - 10.0).abs() < 0.01,
            "Vertical equilibrium: {} + {} should equal 10", r1.ry, r2.ry);

        // By symmetry, each support takes half
        assert!((r1.ry - 5.0).abs() < 0.01, "R1y should be 5 kN");
        assert!((r2.ry - 5.0).abs() < 0.01, "R2y should be 5 kN");

        println!("Truss test passed!");
        println!("  Reactions: R1y={:.2} kN, R2y={:.2} kN", r1.ry, r2.ry);
    }

    /// Test: Portal frame with lateral load
    #[test]
    fn test_portal_frame() {
        let mut s = Structure::new("Portal Frame");

        // Portal: 6m span, 4m height
        let n1 = s.add_node(0.0, 0.0);
        let n2 = s.add_node(0.0, 4.0);
        let n3 = s.add_node(6.0, 4.0);
        let n4 = s.add_node(6.0, 0.0);

        let mat = s.add_steel();
        let sec = s.add_rectangular_section("Column", 0.3, 0.3);

        // Columns
        s.add_frame(n1, n2, mat, sec);
        s.add_frame(n4, n3, mat, sec);
        // Beam
        s.add_frame(n2, n3, mat, sec);

        // Fixed supports
        s.add_fixed_support(n1);
        s.add_fixed_support(n4);

        // Lateral load at top left
        s.add_nodal_load(n2, 20.0, 0.0, 0.0);

        let mut solver = Solver::new(s);
        let results = solver.solve().expect("Analysis should succeed");

        // Check horizontal equilibrium
        let r1 = results.get_reaction(n1).expect("Reaction at n1");
        let r4 = results.get_reaction(n4).expect("Reaction at n4");

        assert!((r1.rx + r4.rx + 20.0).abs() < 0.1,
            "Horizontal equilibrium failed: {} + {} + 20 = {}",
            r1.rx, r4.rx, r1.rx + r4.rx + 20.0);

        println!("Portal frame test passed!");
        println!("  Reactions: R1x={:.2}, R4x={:.2} kN", r1.rx, r4.rx);
    }
}
