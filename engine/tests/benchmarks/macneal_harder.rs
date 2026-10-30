#![allow(dead_code)]
use serde_json::Value;
use std::sync::LazyLock;

pub static DATA: LazyLock<Value> = LazyLock::new(|| serde_json::from_str(include_str!("macneal_harder.json")).unwrap());

pub fn case(id: &str) -> &'static Value {
    DATA["cases"].as_array().unwrap().iter().find(|c| c["id"] == id).unwrap()
}

pub fn reference(key: &str) -> f64 {
    DATA["shellReferences"][key].as_f64().unwrap()
}
