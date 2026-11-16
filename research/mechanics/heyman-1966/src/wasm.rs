use wasm_bindgen::prelude::*;

use crate::Weights;

#[wasm_bindgen]
pub fn self_weight_run(alpha_deg: f64, voussoirs: usize, centreline: bool) -> String {
    let weights = if centreline { Weights::Centreline } else { Weights::True };
    match crate::run::self_weight(alpha_deg, voussoirs, weights) {
        Ok(v) => v.to_string(),
        Err(e) => serde_json::json!({ "error": format!("{e:?}") }).to_string(),
    }
}

#[wasm_bindgen]
pub fn point_load_run(voussoirs: usize, thickness: f64, position: f64) -> String {
    match crate::run::point_load(voussoirs, thickness, position) {
        Ok(v) => v.to_string(),
        Err(e) => serde_json::json!({ "error": format!("{e:?}") }).to_string(),
    }
}
