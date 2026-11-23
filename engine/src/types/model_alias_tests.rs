use serde::{de::DeserializeOwned, Serialize};
use serde_json::{json, Value};

use super::*;

fn aliases<T: DeserializeOwned + Serialize>(canonical: Value, pairs: &[(&str, &str)]) {
    let expected = serde_json::to_value(serde_json::from_value::<T>(canonical.clone()).unwrap()).unwrap();
    for &(field, alias) in pairs {
        let mut legacy = canonical.clone();
        let value = legacy.as_object_mut().unwrap().remove(field).unwrap();
        legacy[alias] = value.clone();
        let actual = serde_json::to_value(serde_json::from_value::<T>(legacy.clone()).unwrap()).unwrap();
        assert_eq!(actual, expected);
        legacy[field] = value;
        let mut ambiguous = legacy.clone();
        ambiguous[alias] = json!(0);
        assert!(serde_json::from_value::<T>(ambiguous).is_err(), "{field}/{alias}");
        let actual = serde_json::to_value(serde_json::from_value::<T>(legacy).unwrap()).unwrap();
        assert_eq!(actual, expected);
    }
}

#[test]
#[ignore = "known wrong result: roadmap 2.4"]
fn canonical_model_alias_legacy_wire_records() {
    aliases::<SolverNode>(json!({"id":1,"x":0,"z":1}), &[("z", "y")]);
    aliases::<SolverSupport>(json!({"id":1,"nodeId":1,"type":"fixed","dz":1,"dry":1}), &[("dz", "dy"), ("dry", "drz")]);
    aliases::<SolverNodalLoad>(json!({"nodeId":1,"fx":0,"fz":1,"my":1}), &[("fz", "fy"), ("my", "mz")]);
    aliases::<SolverPointLoadOnElement>(json!({"elementId":1,"a":1,"p":0,"my":1}), &[("my", "mz")]);
    aliases::<NodalMass>(json!({"nodeId":1,"massZ":1,"iy":1}), &[("massZ", "massY"), ("iy", "iz")]);
    aliases::<SpectralModeDisp>(json!({"nodeId":1,"ux":0,"uz":1,"ry":1}), &[("uz", "uy"), ("ry", "rz")]);
}
