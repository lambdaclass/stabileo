use wasm_bindgen::prelude::*;

use crate::run::RunError;
use crate::Weights;

fn reply(result: Result<serde_json::Value, RunError>) -> String {
    match result {
        Ok(v) => v.to_string(),
        Err(RunError::Lp(e)) => serde_json::json!({ "error": format!("{e:?}") }).to_string(),
        Err(RunError::Input(field)) => serde_json::json!({ "error": "Input", "field": field }).to_string(),
    }
}

#[wasm_bindgen]
pub fn self_weight_run(alpha_deg: f64, voussoirs: usize, centreline: bool) -> String {
    reply(crate::run::self_weight(alpha_deg, voussoirs, if centreline { Weights::Centreline } else { Weights::True }))
}

#[wasm_bindgen]
pub fn point_load_run(voussoirs: usize, thickness: f64, position: f64) -> String {
    reply(crate::run::point_load(voussoirs, thickness, position))
}
