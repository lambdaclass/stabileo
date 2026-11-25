use dedaliano_engine::{
    metamorphic::reversal::reverse_3d,
    solver::{linear::SPARSE_THRESHOLD, material_nonlinear::solve_nonlinear_material_3d},
    types::{NonlinearMaterialInput3D, SolverInput3D},
};

fn archived_1090() -> SolverInput3D {
    let model = crate::corpus::parse(include_str!(
        "../metamorphic_corpus/stability/issue-1090.json"
    ));
    let crate::corpus::Model::D3(input) = model.unwrap() else {
        panic!("expected a spatial model")
    };
    input
}

fn material_input(solver: SolverInput3D) -> NonlinearMaterialInput3D {
    NonlinearMaterialInput3D {
        solver,
        material_models: Default::default(),
        section_capacities: Default::default(),
        max_iter: 60,
        tolerance: 1e-10,
        n_increments: 4,
    }
}

fn separate_cantilevers(source: &SolverInput3D, count: usize) -> SolverInput3D {
    let mut model = source.clone();
    for i in 1..count {
        let first = 2 * i + 1;
        let second = first + 1;
        for (original, id) in [("1", first), ("2", second)] {
            let mut node = source.nodes[original].clone();
            node.id = id;
            node.x += i as f64 * (source.nodes["2"].x - source.nodes["1"].x).abs();
            model.nodes.insert(id.to_string(), node);
        }
        let mut element = source.elements["1"].clone();
        element.id = i + 1;
        element.node_i += 2 * i;
        element.node_j += 2 * i;
        model.elements.insert(element.id.to_string(), element);
        let mut support = source.supports["1"].clone();
        support.node_id = first;
        model.supports.insert(first.to_string(), support);
    }
    model
}

#[test]
fn issue_1090_material_tangent_preserves_the_released_tip() {
    use dedaliano_engine::solver::dof::DofNumbering;
    let source = archived_1090();
    let reversed = reverse_3d(&source, &|_| true).unwrap();
    let dense_count = DofNumbering::build_3d(&source).n_free;
    let sparse = separate_cantilevers(&reversed, SPARSE_THRESHOLD.div_ceil(dense_count));
    assert!(dense_count < SPARSE_THRESHOLD);
    assert!(DofNumbering::build_3d(&sparse).n_free >= SPARSE_THRESHOLD);

    let mut constrained = reversed.clone();
    constrained
        .constraints
        .push(dedaliano_engine::types::Constraint::LinearMPC(
            dedaliano_engine::types::LinearMPCConstraint {
                terms: vec![dedaliano_engine::types::MPCTerm {
                    node_id: 2,
                    dof: 0,
                    coefficient: 1.0,
                }],
            },
        ));
    let mut unhinged = reversed.clone();
    unhinged.elements.get_mut("1").unwrap().release_my_start = false;
    let mut cases = Vec::new();
    let mut failures = Vec::new();
    for (label, model) in [
        ("original", source),
        ("reversed", reversed),
        ("reversed sparse", sparse),
        ("reversed with translation constraint", constrained),
        ("unhinged", unhinged),
    ] {
        let expected = model.supports["1"].dz.unwrap();
        let input = material_input(model);
        assert_ne!(expected, 0.0);
        match solve_nonlinear_material_3d(&input) {
            Ok(result) if result.converged => {
                let actual = result
                    .results
                    .displacements
                    .iter()
                    .find(|d| d.node_id == 2)
                    .unwrap()
                    .uz;
                let relative_error = ((actual - expected) / expected).abs();
                assert!(
                    relative_error <= crate::common::tolerance::parity::REL_TOL_DISP,
                    "{label}: {actual} vs {expected}"
                );
            }
            other => failures.push(format!("{label}: {other:?}")),
        }
        cases.push(serde_json::json!({
            "label": label, "input": input, "expected": expected,
            "relTol": crate::common::tolerance::parity::REL_TOL_DISP
        }));
    }
    if let Some(path) = std::env::var_os("MATERIAL_RELEASE_WASM_CASES") {
        std::fs::write(path, serde_json::to_vec(&cases).unwrap()).unwrap();
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
#[ignore = "known wrong result: #1635"]
fn issue_1635_modal_reversal_recovers_the_massless_released_tip() {
    use dedaliano_engine::{
        certify::modal::certify_modal_3d,
        solver::modal::solve_modal_3d,
        types::{Constraint, LinearMPCConstraint, MPCTerm},
    };
    let model = crate::corpus::parse(include_str!(
        "../metamorphic_corpus/stability/issue-1635.json"
    ));
    let crate::corpus::Model::D3(input) = model.unwrap() else {
        panic!("expected a spatial model")
    };
    let case = crate::case::Case3::new("replay", input);
    let reversed = reverse_3d(&case.s, &|_| true).unwrap();
    let e = &case.s.elements["1"];
    let a = &case.s.nodes[&e.node_i.to_string()];
    let b = &case.s.nodes[&e.node_j.to_string()];
    let (_, _, released_axis) = dedaliano_engine::element::compute_local_axes_3d(
        a.x,
        a.y,
        a.z,
        b.x,
        b.y,
        b.z,
        e.local_yx,
        e.local_yy,
        e.local_yz,
        e.roll_angle,
        false,
    );
    let axis = (0..3)
        .max_by(|&i, &j| released_axis[i].abs().total_cmp(&released_axis[j].abs()))
        .unwrap();
    let mut reference = case.s.clone();
    reference
        .constraints
        .push(Constraint::LinearMPC(LinearMPCConstraint {
            terms: vec![MPCTerm {
                node_id: 2,
                dof: axis + 3,
                coefficient: 1.0,
            }],
        }));

    let expected = solve_modal_3d(&reference, &case.dens, 6).unwrap();
    assert_eq!(expected.modes.len(), 3);
    let expected: Vec<_> = expected.modes.iter().map(|mode| mode.omega).collect();
    let mut failures = Vec::new();
    let mut cases = Vec::new();
    for (label, model) in [
        ("original", case.s),
        ("reversed", reversed),
        ("reference", reference),
    ] {
        for (entry, result) in [
            ("modal", solve_modal_3d(&model, &case.dens, 6)),
            (
                "certified modal",
                certify_modal_3d(&model, &case.dens, 6).map(|value| value.results),
            ),
        ] {
            match result {
                Ok(result) => {
                    assert_eq!(result.modes.len(), expected.len(), "{label} {entry}");
                    for (mode, &reference) in result.modes.iter().zip(&expected) {
                        let relative_error = ((mode.omega - reference) / reference).abs();
                        assert!(
                            relative_error <= 1e-12,
                            "{label} {entry}: {} vs {reference}",
                            mode.omega
                        );
                    }
                }
                Err(error) => failures.push(format!("{label} {entry}: {error}")),
            }
        }
        cases.push(serde_json::json!({
            "label": label, "input": {"solver": model, "densities": case.dens}, "expected": expected,
        }));
    }
    if let Some(path) = std::env::var_os("MODAL_RELEASE_WASM_CASES") {
        std::fs::write(path, serde_json::to_vec(&cases).unwrap()).unwrap();
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
