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
}

fn parse<T: DeserializeOwned>(json: &str) -> Result<T, JsValue> {
    serde_json::from_str(json).map_err(|error| JsValue::from_str(&format!("Parse error: {error}")))
}

#[wasm_bindgen]
pub fn solve_experimental_beam_study_2d(json: &str) -> Result<String, JsValue> {
    let result = super::beam_study::from_json(json)
        .map_err(|error| JsValue::from_str(&error))?;
    crate::to_json(&result)
}

#[wasm_bindgen]
pub fn solve_experimental_corotational_2d(json: &str, options: &str) -> Result<String, JsValue> {
    let input: SolverInput = parse(json)?;
    let options: Options = parse(options)?;
    let result = super::solve_corotational_2d_stepped(
        &input,
        None,
        options.max_iter,
        options.tolerance,
        options.n_increments,
        options.method,
        options.stepping,
    )
    .map_err(|error| JsValue::from_str(&error))?;
    crate::to_json(&result)
}

#[wasm_bindgen]
pub fn solve_experimental_corotational_3d(json: &str, options: &str) -> Result<String, JsValue> {
    let input = parse::<ElasticInput3D>(json)?.into_legacy();
    let options: Options = parse(options)?;
    let result = super::solve_corotational_3d_stepped(
        &input,
        options.max_iter,
        options.tolerance,
        options.n_increments,
        options.method,
        options.stepping,
    )
    .map_err(|error| JsValue::from_str(&error))?;
    crate::to_json(&result)
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
