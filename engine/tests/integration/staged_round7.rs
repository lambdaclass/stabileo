use dedaliano_engine::solver::kinematic::{analyze_kinematics_2d, analyze_kinematics_3d};
use dedaliano_engine::types::{SolverInput, SolverInput3D};

fn round7_constrained_spring(dim: usize) {
    let models: serde_json::Value =
        serde_json::from_str(include_str!("../fixtures/staged-round7.json")).unwrap();
    for unit in [1.0, 1e-3, 1e3] {
        for unrelated in [1.0, 1e12] {
            for spring in [1.0, 1e-30, 0.0] {
                let mut v = models[dim.to_string()].clone();
                for n in v["nodes"].as_object_mut().unwrap().values_mut() {
                    for axis in ["x", "y", "z"] {
                        if let Some(x) = n[axis].as_f64() {
                            n[axis] = (x * unit).into();
                        }
                    }
                }
                v["materials"]["1"]["e"] = (0.001 * unit).into();
                v["materials"]["2"]["e"] = (0.001 * unit * unrelated).into();
                v["supports"]["2"]["kx"] = spring.into();
                let result = if dim == 2 {
                    analyze_kinematics_2d(&serde_json::from_value::<SolverInput>(v).unwrap())
                } else {
                    analyze_kinematics_3d(&serde_json::from_value::<SolverInput3D>(v).unwrap())
                };
                assert!(result.invalid_input.is_none(), "{result:?}");
                assert_eq!(
                    result.is_solvable,
                    spring > 0.0,
                    "{dim}D unit={unit} unrelated={unrelated} spring={spring}: {result:?}"
                );
                assert_eq!(
                    result.mechanism_modes,
                    usize::from(spring == 0.0),
                    "{result:?}"
                );
            }
        }
    }
}

#[test]
fn issue_1943_round7_constrained_spring_2d() {
    round7_constrained_spring(2);
}

#[test]
fn issue_1943_round7_constrained_spring_3d() {
    round7_constrained_spring(3);
}

#[test]
fn issue_1943_round7_review_spring_model() {
    let models: serde_json::Value =
        serde_json::from_str(include_str!("../fixtures/staged-round7.json")).unwrap();
    let two: SolverInput = serde_json::from_value(models["2"].clone()).unwrap();
    let three: SolverInput3D = serde_json::from_value(models["3"].clone()).unwrap();
    use dedaliano_engine::solver::{
        assembly::{assemble_2d, assemble_3d},
        constraints::FreeConstraintSystem,
        dof::DofNumbering,
    };
    for (dof, asm, cs, rotation) in [
        {
            let dof = DofNumbering::build_2d(&two);
            let asm = assemble_2d(&two, &dof);
            let cs = FreeConstraintSystem::build_2d(&two, &dof).unwrap().unwrap();
            (dof, asm, cs, 2)
        },
        {
            let dof = DofNumbering::build_3d(&three);
            let asm = assemble_3d(&three, &dof);
            let cs = FreeConstraintSystem::build_3d(&three, &dof)
                .unwrap()
                .unwrap();
            (dof, asm, cs, 4)
        },
    ] {
        let free: Vec<_> = (0..dof.n_free)
            .flat_map(|i| {
                let k = &asm.k;
                let n = dof.n_total;
                (0..dof.n_free).map(move |j| k[i * n + j])
            })
            .collect();
        let reduced = cs.reduce_matrix(&free);
        let a = cs.map_dof_to_reduced(dof.map[&(1, 0)]).unwrap();
        let b = cs.map_dof_to_reduced(dof.map[&(1, rotation)]).unwrap();
        let stiff = cs.map_dof_to_reduced(dof.map[&(6, 0)]).unwrap();
        let n = cs.n_free_indep;
        assert_eq!(
            [
                reduced[a * n + a],
                reduced[a * n + b],
                reduced[b * n + a],
                reduced[b * n + b]
            ],
            [2.0, 0.0, 0.0, 2.0]
        );
        assert_eq!(reduced[stiff * n + stiff], 1e12);
    }
    let a = analyze_kinematics_2d(&two);
    let b = analyze_kinematics_3d(&three);
    eprintln!("review unit spring 2D: {a:?}; 3D: {b:?}");
    assert!(a.is_solvable && a.mechanism_modes == 0 && a.invalid_input.is_none());
    assert!(b.is_solvable && b.mechanism_modes == 0 && b.invalid_input.is_none());
}

#[test]
fn issue_1943_round7_public_inclined_refusal_and_flat_control() {
    use dedaliano_engine::solver::staged::solve_staged_2d;
    use dedaliano_engine::types::StagedInput;
    let models: serde_json::Value =
        serde_json::from_str(include_str!("../fixtures/staged-round7.json")).unwrap();
    let mut input: StagedInput = serde_json::from_value(models["inclined"].clone()).unwrap();
    assert!(solve_staged_2d(&input)
        .unwrap_err()
        .contains("Inclined supports are not yet supported"));
    input.supports.get_mut("2").unwrap().support_type = "rollerX".into();
    let result = solve_staged_2d(&input).unwrap();
    assert_eq!(
        result
            .final_results
            .reactions
            .iter()
            .map(|r| r.node_id)
            .collect::<Vec<_>>(),
        [1, 2]
    );
    let tip = result
        .final_results
        .reactions
        .iter()
        .find(|r| r.node_id == 2)
        .unwrap();
    assert_eq!(tip.rx, 0.0);
    assert_eq!(tip.rz, 2.0);
}

#[test]
fn issue_1943_round7_constrained_spring_limit_entry() {
    use dedaliano_engine::solver::plastic_limit::limit_analysis_2d;
    use dedaliano_engine::types::{SolverLoad, SolverNodalLoad};
    use std::collections::HashMap;
    let models: serde_json::Value =
        serde_json::from_str(include_str!("../fixtures/staged-round7.json")).unwrap();
    for spring in [1.0, 0.0] {
        let mut input: SolverInput = serde_json::from_value(models["2"].clone()).unwrap();
        input.supports.get_mut("2").unwrap().kx = Some(spring);
        input.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1,
            fx: 1.0,
            fz: 0.0,
            my: 0.0,
        })];
        let result = limit_analysis_2d(
            &input,
            &HashMap::from([(2, 1.0)]),
            &HashMap::from([(1, 1.0)]),
        );
        if spring == 0.0 {
            assert!(result.is_err());
        } else {
            let result = result.unwrap();
            assert!((result.lambda - 2.0).abs() <= 1e-10, "{result:?}");
        }
    }
}
