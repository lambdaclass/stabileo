use wasm_bindgen::prelude::*;

use crate::Distribution;

#[wasm_bindgen]
pub fn simulation_run(theta: f64, delta: f64, q: f64, half_span: bool, elements: usize) -> String {
    let distribution = if half_span { Distribution::Asymmetric } else { Distribution::Uniform };
    match crate::run::path_with(theta, delta, q, distribution, elements) {
        Ok(v) => v.to_string(),
        Err(e) => serde_json::json!({ "error": e.to_string(), "code": e.code() }).to_string(),
    }
}
