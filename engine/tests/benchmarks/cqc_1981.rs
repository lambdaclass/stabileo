use dedaliano_engine::{solver::{modal, spectral}, types::*};
use serde_json::{json, Value};
use std::collections::HashMap;

#[test]
fn close_modes_against_closed_form() {
    let case: Value = serde_json::from_str(include_str!("cqc_1981.json")).unwrap();
    let solver: SolverInput3D = serde_json::from_value(case["solver"].clone()).unwrap();
    let densities: HashMap<String, f64> = serde_json::from_value(case["densities"].clone()).unwrap();
    let modes = modal::solve_modal_3d(&solver, &densities, 2).unwrap();
    let tolerance = case["relativeTolerance"].as_f64().unwrap();
    let close = |got: f64, want: f64| {
        assert!(got.is_finite() && (got - want).abs() <= tolerance * want.abs(), "{got} != {want}");
    };
    assert_eq!(modes.modes.len(), 2);
    for (i, mode) in modes.modes.iter().enumerate() {
        close(mode.frequency, case["reference"]["frequencies"][i].as_f64().unwrap());
    }
    close(modes.cumulative_mass_ratio_x, 1.0);
    let mut results = json!({"modal": modes});
    for rule in ["SRSS", "CQC"] {
        let input: SpectralInput3D = serde_json::from_value(json!({
            "solver": solver, "densities": densities, "modes": modes.modes,
            "spectrum": case["spectrum"], "direction": case["direction"],
            "xi": case["xi"], "rule": rule
        })).unwrap();
        let result = spectral::solve_spectral_3d(&input).unwrap();
        close(result.base_shear, case["reference"][rule].as_f64().unwrap());
        for (i, id) in [5, 6].iter().enumerate() {
            let displacement = result.displacements.iter().find(|d| d.node_id == *id).unwrap();
            close(displacement.ux, case["reference"][format!("roof{rule}")][i].as_f64().unwrap());
        }
        println!("{rule}: reference={} Stabileo={:.12} kN", case["reference"][rule], result.base_shear);
        results[rule] = serde_json::to_value(result).unwrap();
    }
    assert!(results["CQC"]["baseShear"].as_f64().unwrap() > results["SRSS"]["baseShear"].as_f64().unwrap() * 1.1);
    if let Ok(path) = std::env::var("CQC_REPLAY_OUTPUT") {
        std::fs::write(path, serde_json::to_string_pretty(&json!({"case":case,"results":results})).unwrap() + "\n").unwrap();
    }
}
