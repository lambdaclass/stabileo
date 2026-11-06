use dedaliano_engine::certify::buckling::certify_buckling_3d;
use dedaliano_engine::metamorphic::transform::{transform_3d, Iso3};
use dedaliano_engine::metamorphic::units::{scale_load_3d, Units};
use dedaliano_engine::solver::buckling::solve_buckling_3d;
use dedaliano_engine::types::*;

fn issue_741() -> SolverInput3D {
    serde_json::from_str(include_str!("../fixtures/buckling-741.json")).unwrap()
}

fn loads_times(mut input: SolverInput3D, scale: f64) -> SolverInput3D {
    for load in &mut input.loads {
        scale_load_3d(load, &Units { length: 1.0, force: scale, time: 1.0 });
    }
    input
}

fn orientations() -> Vec<(String, Iso3)> {
    let mut out: Vec<(String, Iso3)> = (0..24).map(|k| (format!("axis permutation {k}"), Iso3::axis_permutation(k))).collect();
    out.push(("Euler (0.3, 1.1, -0.7)".into(), Iso3::from_euler(0.3, 1.1, -0.7)));
    out
}

#[test]
#[ignore = "known wrong result: #1548 3D buckling has no round-off compression gate"]
fn buckling_from_round_off_compression_is_refused_in_every_orientation_and_at_every_load_scale_1548() {
    let mut determinable_refusals = 0;
    for scale in [1e-6, 1.0, 1e6] {
        for (name, iso) in orientations() {
            let input = loads_times(transform_3d(&issue_741(), &iso).unwrap(), scale);
            let plain = solve_buckling_3d(&input, 1).map(|b| b.modes[0].load_factor).expect_err(&format!("×{scale:e}, {name}"));
            let certified = certify_buckling_3d(&input, 1).map(|c| c.results.modes[0].load_factor).expect_err(&format!("certified ×{scale:e}, {name}"));
            for error in [&plain, &certified] {
                assert!(error.contains("Buckling not determinable") || error.contains("No compressed elements"), "×{scale:e}, {name}: {error}");
            }
            if plain.contains("Buckling not determinable") {
                assert!(plain.contains("in element 3"), "×{scale:e}, {name}: {plain}");
                determinable_refusals += 1;
            }
        }
    }
    assert!(determinable_refusals >= 16, "{determinable_refusals} round-off refusals");
}

#[test]
#[ignore = "known wrong result: #1548 3D buckling has no round-off compression gate"]
fn the_buckling_bound_refusal_is_not_masked_by_rigid_motion_or_load_scale_1548() {
    let motions = [Iso3::from_euler(0.3, 1.1, -0.7).translated([1e4, -3e3, 7e3]), Iso3::axis_permutation(5).translated([-250.0, 40.0, 1e3])];
    for scale in [1e-6, 1.0, 1e6] {
        for iso in &motions {
            let input = loads_times(transform_3d(&issue_741(), iso).unwrap(), scale);
            assert!(certify_buckling_3d(&input, 1).is_err(), "×{scale:e}, moved by {:?}: a factor got through", iso.t);
        }
    }
}

fn column_beside_a_cantilever(p: f64, q: f64) -> SolverInput3D {
    serde_json::from_value(serde_json::json!({
        "nodes": {
            "1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "y": 0.0, "z": 4.0},
            "3": {"id": 3, "x": 5.0, "y": 0.0, "z": 0.0}, "4": {"id": 4, "x": 10.0, "y": 0.0, "z": 0.0}
        },
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4, "j": 1e-5}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 3, "nodeJ": 4, "materialId": 1, "sectionId": 1}
        },
        "supports": {
            "1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true},
            "3": {"nodeId": 3, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}
        },
        "loads": [
            {"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fy": 0.0, "fz": -p, "mx": 0.0, "my": 0.0, "mz": 0.0}},
            {"type": "distributed", "data": {"elementId": 2, "qYI": 0.0, "qYJ": 0.0, "qZI": -q, "qZJ": -q}}
        ]
    }))
    .unwrap()
}

#[test]
fn a_real_compression_is_still_solved_beside_a_member_whose_compression_is_round_off_1548() {
    let euler = std::f64::consts::PI.powi(2) * 200_000.0 * 1000.0 * 1e-4 / (4.0 * 4.0 * 4.0);
    for (p, q) in [(100.0, 0.0), (100.0, 1e6), (1e-3, 1e-3)] {
        for (name, iso) in orientations() {
            let input = transform_3d(&column_beside_a_cantilever(p, q), &iso).unwrap();
            let b = solve_buckling_3d(&input, 1).unwrap_or_else(|e| panic!("P {p}, q {q}, {name}: {e}"));
            let lambda = b.modes[0].load_factor * p;
            assert!((lambda / euler - 1.0).abs() < 1e-2, "P {p}, q {q}, {name}: λP {lambda} vs π²EI/4L² {euler}");
        }
    }
}
