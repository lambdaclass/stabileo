use super::*;

fn model(chord: [f64; 3], left_hand: bool, release: bool, shear: bool) -> SolverInput3D {
    let mut input: SolverInput3D = serde_json::from_value(serde_json::json!({
        "nodes": {
            "1": {"id": 1, "x": 400.0, "y": -200.0, "z": 70.0},
            "2": {"id": 2, "x": 400.0 + chord[0], "y": -200.0 + chord[1], "z": 70.0 + chord[2]}
        },
        "elements": {
            "10": {"id": 10, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1,
                "releaseMyEnd": release, "releaseMzStart": release, "releaseTEnd": release,
                "rollAngle": 0.31, "localYx": 0.0, "localYy": 0.0, "localYz": 1.0},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 1, "materialId": 1, "sectionId": 1},
            "3": {"id": 3, "type": "truss", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "4": {"id": 4, "type": "cable", "nodeI": 2, "nodeJ": 1, "materialId": 1, "sectionId": 1}
        },
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.03, "iy": 0.0001, "iz": 0.0002, "j": 0.00015}},
        "supports": {}, "loads": [], "leftHand": left_hand
    })).unwrap();
    if shear {
        let sec = input.sections.get_mut("1").unwrap();
        sec.as_y = Some(0.02);
        sec.as_z = Some(0.0);
    }
    input
}

fn compare(input: &SolverInput3D, states: impl IntoIterator<Item = Vec<f64>>) {
    let dofs = DofNumbering::build_3d(input);
    let left = input.left_hand.unwrap_or(false);
    let prepared = PreparedCorotational3D::new(input, &dofs, left).unwrap();
    for u in states {
        let mut old_force = vec![0.0; dofs.n_total];
        let mut new_force = old_force.clone();
        let (mut old_triplets, mut new_triplets) = (Vec::new(), Vec::new());
        assemble_corotational_3d_impl(
            input,
            &dofs,
            &u,
            &mut old_force,
            &mut |i, j, v| old_triplets.push((i, j, v.to_bits())),
            left,
        );
        prepared.assemble(
            &dofs,
            &u,
            &mut new_force,
            &mut |i, j, v| new_triplets.push((i, j, v.to_bits())),
            left,
        );
        assert_eq!(
            old_triplets, new_triplets,
            "every contribution must retain its value and order"
        );
        assert_eq!(
            old_force.iter().map(|v| v.to_bits()).collect::<Vec<_>>(),
            new_force.iter().map(|v| v.to_bits()).collect::<Vec<_>>()
        );
    }
}

#[test]
fn prepared_elements_preserve_all_contributions_across_states_and_sections() {
    for chord in [[3.0, 1.0, 2.0], [0.0, 0.0, 3.0], [1e-8, 0.0, 3.0]] {
        for left in [false, true] {
            for release in [false, true] {
                for shear in [false, true] {
                    let input = model(chord, left, release, shear);
                    let n = DofNumbering::build_3d(&input).n_total;
                    compare(
                        &input,
                        [0.0, 0.001, -0.1, 0.5, 0.0].map(|scale| {
                            (0..n)
                                .map(|i| ((i * 17 % 13) as f64 - 6.0) * scale)
                                .collect()
                        }),
                    );
                }
            }
        }
    }
}

#[test]
fn preparation_keeps_collapsed_and_nonfinite_state_behavior() {
    let input = model([3.0, 0.0, 0.0], false, false, false);
    let dofs = DofNumbering::build_3d(&input);
    let mut collapsed = vec![0.0; dofs.n_total];
    collapsed[dofs.global_dof(2, 0).unwrap()] = -3.0;
    let mut states = vec![collapsed];
    for v in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, f64::MAX] {
        let mut u = vec![0.0; dofs.n_total];
        u[dofs.global_dof(2, 0).unwrap()] = v;
        states.push(u);
    }
    states.push(vec![0.0; dofs.n_total]);
    compare(&input, states);
    // Even raw internal inputs whose static arithmetic overflows retain the legacy behavior.
    let mut input = input;
    input.materials.get_mut("1").unwrap().e = f64::MAX;
    compare(&input, [vec![0.0; dofs.n_total]]);
}

#[test]
fn reference_storage_budget_cannot_wrap_and_excess_models_use_fallback() {
    assert!(fits_budget(0));
    assert!(fits_budget(1));
    assert!(!fits_budget(usize::MAX));
    let limit = (1..100_000).find(|&n| !fits_budget(n)).unwrap();
    assert!(fits_budget(limit - 1));
    let mut input = model([3.0, 0.0, 0.0], false, false, false);
    let elem = input.elements["10"].clone();
    input.elements = (0..limit).map(|i| (i.to_string(), elem.clone())).collect();
    // Budget rejection happens before any indexing or allocation of reference matrices.
    let dofs = DofNumbering::build_3d(&input);
    assert!(PreparedCorotational3D::new(&input, &dofs, false).is_none());
}
