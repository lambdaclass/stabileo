use wasm_bindgen::prelude::*;
#[wasm_bindgen]
pub fn form_find(q: f64, load: f64) -> Result<String, JsError> {
    let form = form_finding_pastrana_2026::four_bar(q, load).map_err(|e| JsError::new(&e))?;
    serde_json::to_string(&form).map_err(|e| JsError::new(&e.to_string()))
}
