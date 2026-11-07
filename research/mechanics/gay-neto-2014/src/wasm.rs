use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn simulation_run(pull: f64, lift: f64, friction: f64) -> String {
    match crate::run::riser(pull, lift, friction) {
        Ok(v) => v.to_string(),
        Err(e) => serde_json::json!({ "error": e }).to_string(),
    }
}
