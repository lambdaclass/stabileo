use serde::{de::DeserializeOwned, Deserialize};
use wasm_bindgen::prelude::*;

use super::{IterationMethod, LoadStepping};
use crate::types::{units::ElasticInput3D, SolverInput};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Options {
    max_iter: usize,
    tolerance: f64,
    n_increments: usize,
    method: IterationMethod,
    stepping: LoadStepping,
    #[serde(default)]
    profile: bool,
}

fn parse<T: DeserializeOwned>(json: &str) -> Result<T, JsValue> {
    serde_json::from_str(json).map_err(|error| JsValue::from_str(&format!("Parse error: {error}")))
}

#[wasm_bindgen]
pub fn solve_experimental_corotational_2d(json: &str, options: &str) -> Result<String, JsValue> {
    let input: SolverInput = parse(json)?;
    let options: Options = parse(options)?;
    let mut work = super::NonlinearWork::default();
    let result = super::solve_corotational_2d_profiled(
        &input,
        None,
        options.max_iter,
        options.tolerance,
        options.n_increments,
        options.method,
        options.stepping,
        &mut work,
    )
    .map_err(|error| JsValue::from_str(&error))?;
    if options.profile {
        crate::to_json(&serde_json::json!({ "result": result, "work": work }))
    } else {
        crate::to_json(&result)
    }
}

#[wasm_bindgen]
pub fn solve_experimental_corotational_3d(json: &str, options: &str) -> Result<String, JsValue> {
    let input = parse::<ElasticInput3D>(json)?.into_legacy();
    let options: Options = parse(options)?;
    let mut work = super::NonlinearWork::default();
    let result = super::solve_corotational_3d_profiled(
        &input,
        options.max_iter,
        options.tolerance,
        options.n_increments,
        options.method,
        options.stepping,
        &mut work,
    )
    .map_err(|error| JsValue::from_str(&error))?;
    if options.profile {
        crate::to_json(&serde_json::json!({ "result": result, "work": work }))
    } else {
        crate::to_json(&result)
    }
}

#[wasm_bindgen]
pub fn solve_experimental_arc_length(json: &str) -> Result<String, JsValue> {
    let result =
        super::solve_arc_length(&parse(json)?).map_err(|error| JsValue::from_str(&error))?;
    crate::to_json(&result)
}

#[wasm_bindgen]
pub fn solve_experimental_displacement_control(json: &str) -> Result<String, JsValue> {
    let result = super::solve_displacement_control(&parse(json)?)
        .map_err(|error| JsValue::from_str(&error))?;
    crate::to_json(&result)
}
