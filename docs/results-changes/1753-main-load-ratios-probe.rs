fn independent_rotations_with_a_free_axis(nodes: usize, pcg: bool) -> SolverInput3D {
    let mut input = common::make_3d_input(
        (1..=nodes).map(|i| (i, i as f64, 0.0, 0.0)).collect(),
        vec![(1, E, 0.3)], vec![(1, 1.0, 1.0, 1.0, 1.0)],
        (1..nodes).map(|i| (i, "frame", i, i + 1, 1, 1)).collect(),
        (1..=nodes).map(|i| (i, if i == 3 { vec![true, true, true, false, false, false] } else { vec![true; 6] })).collect(),
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 3, fx: 0.0, fy: 0.0, fz: 0.0, mx: 1e3, my: 0.0, mz: 1.0, bw: None })],
    );
    if nodes > 3 {
        let next = input.elements.get_mut("3").unwrap();
        next.release_my_start = true;
        next.release_mz_start = true;
        next.release_t_start = true;
    }
    let released = input.elements.get_mut("2").unwrap();
    released.release_my_end = true;
    released.release_mz_end = true;
    let support = input.supports.values_mut().find(|s| s.node_id == 3).unwrap();
    support.krx = Some(1e6);
    support.kry = Some(1e6);
    if pcg {
        input.solver_options = Some(serde_json::from_value(serde_json::json!({"method": "pcg"})).unwrap());
    }
    input
}

#[test]
fn issue_1753_main_realistic_load_ratio_probe() {
    let mut records = Vec::new();
    for ratio in [1e3, 1e6, 1e7, 1e8, 1e9] {
        for stiffness_ratio in [1.0, 1e3, 1e6, 1e9] {
            for (case, nodes, pcg) in [("free_rotation", 3, false), ("free_rotation", 12, false), ("free_rotation", 12, true), ("pcg_component", 12, true), ("pcg_none_component", 12, true)] {
                let mut input = independent_rotations_with_a_free_axis(nodes, pcg);
                if case == "pcg_none_component" { input.solver_options = Some(serde_json::from_value(serde_json::json!({"method": "pcg", "preconditioner": "none"})).unwrap()); }
                let support = input.supports.values_mut().find(|s| s.node_id == 3).unwrap();
                support.krx = Some(1e6);
                support.kry = Some(1e6 / stiffness_ratio);
                if case != "free_rotation" { support.krz = Some(1e6); }
                if let SolverLoad3D::Nodal(n) = &mut input.loads[0] {
                    n.mx = 1e3;
                    n.my = if case != "free_rotation" { 1e3 / ratio } else { 0.0 };
                    n.mz = if case == "free_rotation" { 1e3 / ratio } else { 0.0 };
                }
                for prepared in [false, true] {
                    let result = if prepared {
                        dedaliano_engine::solver::linear::prepare_static_3d(&input).and_then(|p| p.solve_loads(&input.loads))
                    } else { dedaliano_engine::solver::linear::solve_3d(&input) };
                    let value = match result {
                        Ok(result) => serde_json::json!({"ok": result}),
                        Err(error) => serde_json::json!({"error": error}),
                    };
                    records.push(serde_json::json!({"case": case, "load_ratio": ratio, "stiffness_ratio": stiffness_ratio, "nodes": nodes, "pcg": pcg, "prepared": prepared, "input": input, "result": value}));
                }
            }
        }
    }
    std::fs::write("probe.json", serde_json::to_string_pretty(&records).unwrap()).unwrap();
}
