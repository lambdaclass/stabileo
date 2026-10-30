use topopt_andreassen_2011::{Config, Optimizer};
use wasm_bindgen::prelude::*;

pub fn parse_config(json: &str) -> Result<Config, String> {
    let c: Config = serde_json::from_str(json).map_err(|e| e.to_string())?;
    c.validate()?;
    Ok(c)
}

#[wasm_bindgen]
pub struct Topopt { inner: Optimizer }
#[wasm_bindgen]
impl Topopt {
    #[wasm_bindgen(constructor)]
    pub fn new(json: &str) -> Result<Topopt, JsValue> {
        let config = parse_config(json).map_err(|e| JsValue::from_str(&e))?;
        Ok(Self { inner: Optimizer::new(config).map_err(|e| JsValue::from_str(&e))? })
    }
    pub fn step(&mut self) -> Result<String, JsValue> {
        let s = self.inner.step().map_err(|e| JsValue::from_str(&e))?;
        serde_json::to_string(&s).map_err(|e| JsValue::from_str(&e.to_string()))
    }
    pub fn finished(&self) -> bool { self.inner.finished() }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn limits_before_allocation() {
        for changes in [serde_json::json!({"nelx":100000000}),serde_json::json!({"nely":-1}),serde_json::json!({"ft":0}),serde_json::json!({"volfrac":null})] {
            let mut c=serde_json::to_value(Config::default()).unwrap();
            for (k,v) in changes.as_object().unwrap() { c[k]=v.clone(); }
            assert!(parse_config(&c.to_string()).is_err());
        }
        assert!(parse_config(&serde_json::to_string(&Config::default()).unwrap()).is_ok());
    }
}
