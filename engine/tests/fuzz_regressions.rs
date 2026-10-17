//! Regressions found by the cargo-fuzz targets (engine/fuzz,
//! docs/verification/FUZZ_MUTANTS.md): every number in an `Ok` result of a
//! WASM entry point is finite unless its field documents +∞.

use dedaliano_engine::certify::dynamics::certify_time_history_3d;
use dedaliano_engine::certify::harmonic::{certify_harmonic_2d, HarmonicCertificate};
use dedaliano_engine::solver::harmonic::HarmonicInput;
use dedaliano_engine::types::TimeHistoryInput3D;
use serde_json::json;

/// json_dynamics: a simply supported beam whose target DOF (axial, at the
/// roller) the load does not excite. ũ_t = 0 made the interval sum of squares
/// [−5e−324, …] and its square root NaN, so a "certified" result carried NaN
/// amplitude enclosures and error bounds.
#[test]
fn harmonic_zero_response_is_finite() {
    let input: HarmonicInput = serde_json::from_value(json!({
        "dampingRatio": 0.05, "densities": { "1": 7850.0 }, "frequencies": [0.5, 2.0, 8.0],
        "responseDof": "x", "responseNodeId": 2,
        "solver": {
            "nodes": { "1": { "id": 1, "x": 0, "y": 0 }, "2": { "id": 2, "x": 5.546562490053475, "y": 0 } },
            "materials": { "1": { "id": 1, "e": 200000, "nu": 0.3 } },
            "sections": { "1": { "id": 1, "a": 0.036127987215295435, "iz": 0.0006057270002784208 } },
            "elements": { "1": { "id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1 } },
            "supports": { "1": { "id": 1, "nodeId": 1, "type": "pinned" }, "2": { "id": 2, "nodeId": 2, "type": "rollerX" } },
            "loads": [
                { "type": "distributed", "data": { "elementId": 1, "qI": -16.29882680857554, "qJ": -3.3391052349470556 } },
                { "type": "nodal", "data": { "nodeId": 1, "fx": -6.373789701610804, "fy": -19.225311417831108, "mz": 0 } }
            ]
        }
    }))
    .unwrap();
    let out = certify_harmonic_2d(&input).unwrap();
    let HarmonicCertificate::Certified { points, peak_amplitude, max_reported_error, reported_within, .. } = out.certificate else {
        panic!("expected a certificate: {:?}", out.certificate);
    };
    assert!(reported_within);
    assert!(peak_amplitude.lo == 0.0 && peak_amplitude.hi.is_finite() && max_reported_error.is_finite());
    for p in &points {
        assert!(p.amplitude.lo == 0.0 && p.amplitude.hi.is_finite() && p.amplitude.hi < 1e-15, "{p:?}");
        assert!(p.reported_error.is_finite() && p.reported_error < 1e-15, "{p:?}");
    }
}

/// json_dynamics: a 3D frame with every translation restrained under a ground
/// acceleration along X stays at rest. The relative update residuals divided
/// the subnormal interval residual of exact zeros by max‖u‖ = 0 and reported
/// +∞ (`null` in JSON, read as a number by the web).
#[test]
fn time_history_zero_solution_residuals_are_finite() {
    let sup = |n: usize, rot: bool| {
        json!({ "nodeId": n, "rx": true, "ry": true, "rz": true, "rrx": rot, "rry": rot, "rrz": rot })
    };
    let input: TimeHistoryInput3D = serde_json::from_value(json!({
        "timeStep": 0.01, "nSteps": 40, "densities": { "1": 7850.0 }, "groundAccelX": vec![0.5; 40],
        "solver": {
            "nodes": {
                "1": { "id": 1, "x": 0, "y": 0, "z": 0 },
                "2": { "id": 2, "x": 7.312289858935401, "y": 0, "z": 0 },
                "3": { "id": 3, "x": 2.882278245132921, "y": 0, "z": 2.6604336351156235 }
            },
            "materials": { "1": { "id": 1, "e": 200000, "nu": 0.3 } },
            "sections": { "1": { "id": 1, "a": 0.00538, "iy": 0.00008356, "iz": 0.00000604, "j": 2.01e-7 } },
            "elements": {
                "1": { "id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1 },
                "2": { "id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1 }
            },
            "supports": { "1": sup(1, true), "2": sup(2, false), "3": sup(3, false) },
            "loads": []
        }
    }))
    .unwrap();
    let out = certify_time_history_3d(&input).unwrap();
    let r = out.certificate.residual.expect("residual report");
    assert!(r.max_rel_displacement_update.is_finite() && r.max_rel_displacement_update < 1e-12, "{r:?}");
    assert!(r.max_rel_velocity_update.is_finite() && r.max_rel_velocity_update < 1e-12, "{r:?}");
}
