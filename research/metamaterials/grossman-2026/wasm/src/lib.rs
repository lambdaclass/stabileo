//! wasm-bindgen surface of the spring-network research crate: JSON in, JSON out.

use springs_grossman_2026::experiment::{run_periodic, run_strip, PeriodicSpec, StripSpec};
use wasm_bindgen::prelude::*;

/// The paper's clamped strip (or any finite sample): a `StripSpec` as JSON; a `StripResult`.
#[wasm_bindgen]
pub fn springs_strip(spec: &str) -> Result<String, JsError> {
    let s: StripSpec = serde_json::from_str(spec).map_err(|e| JsError::new(&e.to_string()))?;
    let r = run_strip(&s).map_err(|e| JsError::new(&e))?;
    Ok(serde_json::to_string(&r).unwrap())
}

/// Effective moduli of a periodic network: a `PeriodicSpec` as JSON; a `PeriodicResult`.
#[wasm_bindgen]
pub fn springs_periodic(spec: &str) -> Result<String, JsError> {
    let s: PeriodicSpec = serde_json::from_str(spec).map_err(|e| JsError::new(&e.to_string()))?;
    let r = run_periodic(&s).map_err(|e| JsError::new(&e))?;
    Ok(serde_json::to_string(&r).unwrap())
}
