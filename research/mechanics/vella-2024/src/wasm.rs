use crate::dynamics::Settings;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn simulation_run(settings: &str) -> Result<String, JsValue> {
    let settings: Settings = serde_json::from_str(settings).map_err(|e| JsValue::from_str(&e.to_string()))?;
    crate::run::page(&settings, &mut |_| false)
        .and_then(|p| serde_json::to_string(&p).map_err(|e| e.to_string()))
        .map_err(|e| JsValue::from_str(&e))
}
