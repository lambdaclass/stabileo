use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn simulation_run(theta: f64, delta: f64) -> String {
    match crate::run::path(theta, delta) {
        Ok(v) => v.to_string(),
        Err(e) => serde_json::json!({ "error": e }).to_string(),
    }
}
