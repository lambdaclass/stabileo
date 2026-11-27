use super::*;

const COLUMN: &str =
    include_str!("../../../../../scripts/tests/fixtures/experimental-beam-column.json");
const ARCH: &str =
    include_str!("../../../../../scripts/tests/fixtures/experimental-beam-arch.json");

#[test]
fn json_study_preserves_native_equilibria_and_exports_parity_cases() {
    let mut cases = Vec::new();
    for json in [COLUMN, ARCH] {
        let study = from_json(json).unwrap();
        assert!(study.completed);
        assert!(study.critical.is_some());
        let request: Request = serde_json::from_str(json).unwrap();
        let path = match request.control {
            Control::Load {
                increments,
                max_iterations,
                tolerance,
            } => beam::solve_load_control(
                &request.model,
                beam::LoadControl {
                    increments,
                    max_iterations,
                    tolerance,
                    method: IterationMethod::Newton,
                    stepping: LoadStepping::Equal,
                },
            )
            .unwrap(),
            Control::Arc {
                steps,
                max_iterations,
                tolerance,
                initial_radius,
                min_radius,
                max_radius,
                load_weight,
            } => beam::solve_arc_length(
                &request.model,
                beam::ArcControl {
                    steps,
                    max_iterations,
                    tolerance,
                    initial_radius,
                    min_radius,
                    max_radius,
                    load_weight,
                },
            )
            .unwrap(),
        };
        assert_eq!(study.iterations, path.iterations);
        assert_eq!(
            format!("{:?}", study.last_equilibrium),
            format!("{:?}", path.last_equilibrium)
        );
        assert_eq!(study.states.len(), path.steps.len());
        for (checked, original) in study.states.iter().zip(&path.steps) {
            // Scaling a physical rotation back to solver coordinates can round by an ulp.
            for (a, b) in checked
                .equilibrium
                .displacements
                .iter()
                .flatten()
                .zip(original.displacements.iter().flatten())
            {
                assert!((a - b).abs() <= 1e-14 * (1.0 + b.abs()));
            }
        }
        cases.push(
            serde_json::from_str::<serde_json::Value>(&crate::boundary::to_json(&study).unwrap())
                .unwrap(),
        );
    }
    if let Some(output) = std::env::var_os("BEAM_STUDY_NATIVE_OUTPUT") {
        std::fs::write(output, serde_json::to_string(&cases).unwrap()).unwrap();
    }
}

#[test]
fn json_contract_rejects_unsupported_physics_and_invalid_budgets() {
    let original: serde_json::Value = serde_json::from_str(COLUMN).unwrap();
    for (pointer, value) in [
        ("/control/increments", serde_json::json!(1001)),
        ("/control/tolerance", serde_json::json!(0.1)),
        ("/equilibriumTolerance", serde_json::json!(0.1)),
        ("/model/members/0/young", serde_json::json!(-1)),
        ("/model/members/0/nodes/1", serde_json::json!(999)),
    ] {
        let mut invalid = original.clone();
        *invalid.pointer_mut(pointer).unwrap() = value;
        assert!(from_json(&invalid.to_string()).is_err());
    }
    let mut invalid = original.clone();
    invalid["model"]["followerLoads"] = serde_json::json!(true);
    assert!(from_json(&invalid.to_string()).is_err());
    let mut invalid = original;
    invalid["model"]["members"][0]["release"] = serde_json::json!(true);
    assert!(from_json(&invalid.to_string()).is_err());
    assert!(from_json(&" ".repeat(1_048_577)).is_err());
    assert!(from_json("{\"model\":NaN}").is_err());
}

#[test]
fn study_serialization_refuses_nonfinite_nested_results() {
    let mut study = from_json(COLUMN).unwrap();
    study.states[0].stability.minimum = Some(f64::INFINITY);
    assert!(crate::boundary::to_json(&study).is_err());
}
