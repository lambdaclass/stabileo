use dedaliano_engine::metamorphic::units::{scale_results_3d, Units};
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;

fn result() -> AnalysisResults3D {
    let cases: serde_json::Value = serde_json::from_str(include_str!("../fixtures/nightly-2026-11-13.json")).unwrap();
    let input: SolverInput3D = serde_json::from_value(cases["2023"].clone()).unwrap();
    let mut result = linear::solve_3d(&input).unwrap();
    result.element_forces[0].point_torques = vec![
        PointTorqueInfo { a: 0.5, p: 2.0, y: Some(-3.0), z: Some(5.0) },
        PointTorqueInfo { a: 1.0, p: 0.0, y: Some(0.0), z: None },
        PointTorqueInfo { a: 1.5, p: -2.0, y: None, z: Some(0.0) },
    ];
    result
}

fn check_component(transverse: usize) {
    let base = result();
    for (length, force) in [(2.0, 4.0), (0.5, 0.25), (1.0, 1.0), (2.0, 0.5)] {
        let units = Units::froude(length, force);
        let scaled = scale_results_3d(&base, &units);
        for (before, after) in base.element_forces[0].point_torques.iter().zip(&scaled.element_forces[0].point_torques) {
            assert_eq!(after.a, before.a * length);
            assert_eq!(after.p, before.p * units.moment());
            let (before, after) = if transverse == 0 { (before.y, after.y) } else { (before.z, after.z) };
            assert_eq!(after, before.map(|v| v * units.moment()), "length={length}, force={force}");
        }
        let restored = scale_results_3d(&scaled, &Units::froude(1.0 / length, 1.0 / force));
        assert_eq!(serde_json::to_value(&restored.element_forces[0].point_torques).unwrap(), serde_json::to_value(&base.element_forces[0].point_torques).unwrap());
    }
}

#[test]
#[ignore = "known wrong result: #2219"]
fn transverse_y_point_couples_scale_with_moment_units() {
    check_component(0);
}

#[test]
#[ignore = "known wrong result: #2219"]
fn transverse_z_point_couples_scale_with_moment_units() {
    check_component(1);
}
