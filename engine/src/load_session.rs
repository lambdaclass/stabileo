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
        let mut input: SolverInput = crate::from_js_value(input)?;
        input.loads.clear();
        let state = if input.constraints.is_empty() {
            State2D::Prepared(Box::new(
                prepare_static_2d(&input)
                    .map_err(|e| JsValue::from_str(&e))?
                    .into_owned(),
            ))
        } else {
            State2D::Constrained(Box::new(input))
        };
        Ok(Self { state })
    }
    pub fn solve(&self, loads: JsValue) -> Result<JsValue, JsValue> {
        let loads: Vec<SolverLoad> = crate::from_js_value(loads)?;
        let result = match &self.state {
            State2D::Prepared(p) => p.solve_loads(&loads),
            State2D::Constrained(input) => {
                let mut input = input.clone();
                input.loads = loads;
                solve_2d(&input)
            }
        }
        .map_err(|e| JsValue::from_str(&e))?;
        crate::to_js_value(&result)
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
        let mut input: SolverInput3D = crate::from_js_value(input)?;
        input.loads.clear();
        let state = if input.constraints.is_empty() {
            State3D::Prepared(Box::new(
                prepare_static_3d(&input).map_err(|e| JsValue::from_str(&e))?,
            ))
        } else {
            State3D::Constrained(Box::new(input))
        };
        Ok(Self { state })
    }
    pub fn solve(&self, loads: JsValue) -> Result<JsValue, JsValue> {
        let loads: Vec<SolverLoad3D> = crate::from_js_value(loads)?;
        let result = match &self.state {
            State3D::Prepared(p) => p.solve_loads(&loads),
            State3D::Constrained(input) => {
                let mut input = input.clone();
                input.loads = loads;
                solve_3d(&input)
            }
        }
        .map_err(|e| JsValue::from_str(&e))?;
        crate::to_js_value(&result)
    }
}
