use serde_json::Value;
fn compare(a: &Value, b: &Value) {
    match (a, b) {
        (Value::Number(a), Value::Number(b)) => {
            let a = a.as_f64().unwrap();
            let b = b.as_f64().unwrap();
            assert!(
                a.is_finite() && b.is_finite() && (a - b).abs() <= 1e-9 * (1. + a.abs()),
                "{a} != {b}"
            );
        }
        (Value::Array(a), Value::Array(b)) => {
            assert_eq!(a.len(), b.len());
            for (a, b) in a.iter().zip(b) {
                compare(a, b);
            }
        }
        (Value::Object(a), Value::Object(b)) => {
            assert_eq!(a.len(), b.len());
            for (k, v) in a {
                compare(v, &b[k]);
            }
        }
        _ => assert_eq!(a, b),
    }
}
#[test]
fn every_replay_frame_is_a_reproducible_production_arc_length_state() {
    let actual = koiter_ferrari_sigmund_2025::replay::reproduce();
    let expected: Value =
        serde_json::from_str(include_str!("../results/stabileo_results.json")).unwrap();
    compare(&actual, &expected);
    assert!(actual["koiter"].is_null());
}
