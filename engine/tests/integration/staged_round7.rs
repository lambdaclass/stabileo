use dedaliano_engine::solver::kinematic::{analyze_kinematics_2d, analyze_kinematics_3d};
use dedaliano_engine::types::{SolverInput, SolverInput3D};

fn round7_constrained_spring(dim: usize) {
    let models: serde_json::Value = serde_json::from_str(include_str!("../fixtures/staged-round7.json")).unwrap();
        for unit in [1.0, 1e-3, 1e3] {
            for unrelated in [1.0, 1e12] {
                for spring in [1.0, 1e-30, 0.0] {
                    let mut v = models[dim.to_string()].clone();
                    for n in v["nodes"].as_object_mut().unwrap().values_mut() {
                        for axis in ["x", "y", "z"] {
                            if let Some(x) = n[axis].as_f64() { n[axis] = (x * unit).into(); }
                        }
                    }
                    v["materials"]["1"]["e"] = unit.into();
                    v["materials"]["2"]["e"] = (unit * unrelated).into();
                    v["supports"]["2"]["kx"] = spring.into();
                    let result = if dim == 2 {
                        analyze_kinematics_2d(&serde_json::from_value::<SolverInput>(v).unwrap())
                    } else {
                        analyze_kinematics_3d(&serde_json::from_value::<SolverInput3D>(v).unwrap())
                    };
                    assert!(result.invalid_input.is_none(), "{result:?}");
                    assert_eq!(result.is_solvable, spring > 0.0, "{dim}D unit={unit} unrelated={unrelated} spring={spring}: {result:?}");
                    assert_eq!(result.mechanism_modes, usize::from(spring == 0.0), "{result:?}");
                }
            }
        }
}

#[test]
#[ignore = "known wrong result: #1943"]
fn issue_1943_round7_constrained_spring_2d() { round7_constrained_spring(2); }

#[test]
#[ignore = "known wrong result: #1943"]
fn issue_1943_round7_constrained_spring_3d() { round7_constrained_spring(3); }

#[test]
#[ignore = "known wrong result: #1943"]
fn issue_1943_round7_review_spring_model() {
    let models: serde_json::Value = serde_json::from_str(include_str!("../fixtures/staged-round7.json")).unwrap();
    let two: SolverInput = serde_json::from_value(models["2"].clone()).unwrap();
    let three: SolverInput3D = serde_json::from_value(models["3"].clone()).unwrap();
    let a = analyze_kinematics_2d(&two);
    let b = analyze_kinematics_3d(&three);
    eprintln!("review unit spring 2D: {a:?}; 3D: {b:?}");
    assert!(a.is_solvable && a.mechanism_modes == 0 && a.invalid_input.is_none());
    assert!(b.is_solvable && b.mechanism_modes == 0 && b.invalid_input.is_none());
}
