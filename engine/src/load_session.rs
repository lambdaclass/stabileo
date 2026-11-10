//! Load-only solve sessions: one immutable model and factorization, many RHSs.
//! Constraints retain the ordinary constrained solver rather than silently
//! entering the unconstrained prepared path.
use crate::solver::linear::{
    prepare_static_2d, prepare_static_3d, solve_2d, solve_3d, PreparedStatic2D, PreparedStatic3D,
};
use crate::types::*;
use wasm_bindgen::prelude::*;

enum State2D {
    Prepared(Box<PreparedStatic2D<'static>>),
    Constrained(Box<SolverInput>),
}
#[wasm_bindgen]
pub struct LoadSession2D {
    state: State2D,
}
#[wasm_bindgen]
impl LoadSession2D {
    #[wasm_bindgen(constructor)]
    pub fn new(input: JsValue) -> Result<LoadSession2D, JsValue> {
        LoadSession2D::from_input(crate::from_js_value(input)?).map_err(|e| JsValue::from_str(&e))
    }
    pub fn solve(&self, loads: JsValue) -> Result<JsValue, JsValue> {
        let result = self.solve_loads(&crate::from_js_value::<Vec<SolverLoad>>(loads)?).map_err(|e| JsValue::from_str(&e))?;
        crate::to_js_value(&result)
    }
}
impl LoadSession2D {
    pub fn from_input(mut input: SolverInput) -> Result<LoadSession2D, String> {
        crate::solver::linear::validate_input_2d(&input)?;
        input.loads.clear();
        let state = if input.constraints.is_empty() {
            State2D::Prepared(Box::new(prepare_static_2d(&input)?.into_owned()))
        } else {
            State2D::Constrained(Box::new(input))
        };
        Ok(Self { state })
    }
    pub fn solve_loads(&self, loads: &[SolverLoad]) -> Result<AnalysisResults, String> {
        match &self.state {
            State2D::Prepared(p) => p.solve_loads(loads),
            State2D::Constrained(input) => {
                let mut input = input.clone();
                input.loads = loads.to_vec();
                solve_2d(&input)
            }
        }
    }
}
enum State3D {
    Prepared(Box<PreparedStatic3D>),
    Constrained(Box<SolverInput3D>),
}
#[wasm_bindgen]
pub struct LoadSession3D {
    state: State3D,
}
#[wasm_bindgen]
impl LoadSession3D {
    #[wasm_bindgen(constructor)]
    pub fn new(input: JsValue) -> Result<LoadSession3D, JsValue> {
        LoadSession3D::from_input(crate::from_js_value::<crate::types::units::ElasticInput3D>(input)?.into_legacy()).map_err(|e| JsValue::from_str(&e))
    }
    pub fn solve(&self, loads: JsValue) -> Result<JsValue, JsValue> {
        let result = self.solve_loads(&crate::from_js_value::<Vec<SolverLoad3D>>(loads)?).map_err(|e| JsValue::from_str(&e))?;
        crate::to_js_value(&result)
    }
}
impl LoadSession3D {
    pub fn from_input(mut input: SolverInput3D) -> Result<LoadSession3D, String> {
        crate::solver::linear::validate_input_3d(&input)?;
        let initial_loads = std::mem::take(&mut input.loads);
        let state = if input.constraints.is_empty() {
            let prepared = match prepare_static_3d(&input) {
                Ok(prepared) => prepared,
                Err(original) => {
                    input.loads = initial_loads;
                    return Err(prepare_static_3d(&input).err().unwrap_or(original));
                },
            };
            State3D::Prepared(Box::new(prepared))
        } else {
            State3D::Constrained(Box::new(input))
        };
        Ok(Self { state })
    }
    pub fn solve_loads(&self, loads: &[SolverLoad3D]) -> Result<AnalysisResults3D, String> {
        match &self.state {
            State3D::Prepared(p) => p.solve_loads(loads),
            State3D::Constrained(input) => {
                let mut input = input.clone();
                input.loads = loads.to_vec();
                solve_3d(&input)
            }
        }
    }
}
