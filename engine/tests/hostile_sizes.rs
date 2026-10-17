//! Sizes and steps taken from a model file are bounded before they drive an
//! allocation or a loop. A hostile project must get an `Err` back, not exhaust
//! memory, spin forever, or wrap an id into an existing one.

#[path = "common/mod.rs"]
mod common;

use common::make_3d_input;
use dedaliano_engine::types::*;
use std::collections::HashMap;

fn beam_2d() -> SolverInput {
    let mut nodes = HashMap::new();
    nodes.insert("1".into(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".into(), SolverNode { id: 2, x: 4.0, z: 0.0 });
    let mut materials = HashMap::new();
    materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert("1".into(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });
    let mut elements = HashMap::new();
    elements.insert("1".into(), SolverElement {
        id: 1, elem_type: "frame".into(), node_i: 1, node_j: 2,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });
    let mut supports = HashMap::new();
    supports.insert("1".into(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".into(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });
    SolverInput {
        nodes, materials, sections, elements, supports,
        loads: vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -10.0, my: 0.0 })],
        constraints: vec![],
        connectors: HashMap::new(),
        solver_options: None,
    }
}

/// A fixed 3D cantilever with an arc from node 1 through node 3 to node 2.
fn arc_3d(num_segments: usize) -> SolverInput3D {
    let mut s = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 4.0, 0.0, 0.0), (3, 2.0, 0.0, 1.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4, 1e-4, 2e-4)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true; 6])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 0.0, fz: -10.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    s.curved_beams.push(CurvedBeamInput {
        node_start: 1, node_mid: 3, node_end: 2,
        material_id: 1, section_id: 1, num_segments,
        hinge_start: false, hinge_end: false,
    });
    s
}

// ---------------------------------------------------------------- curved beams

#[test]
fn curved_beam_control_still_solves() {
    use dedaliano_engine::solver::linear::solve_3d;
    solve_3d(&arc_3d(8)).expect("a curved beam of 8 segments solves");
}

#[test]
fn curved_beam_huge_segment_count_is_refused() {
    use dedaliano_engine::solver::linear::solve_3d;
    let err = solve_3d(&arc_3d(usize::MAX)).expect_err("must refuse");
    assert!(err.contains("numSegments"), "{err}");
    let err = solve_3d(&arc_3d(dedaliano_engine::element::MAX_CURVED_BEAM_SEGMENTS + 1)).expect_err("must refuse");
    assert!(err.contains("numSegments"), "{err}");
}

#[test]
fn curved_beam_total_segment_count_is_refused() {
    use dedaliano_engine::element::{MAX_CURVED_BEAM_SEGMENTS, MAX_CURVED_BEAM_SEGMENTS_TOTAL};
    use dedaliano_engine::solver::linear::solve_3d;
    let mut s = arc_3d(MAX_CURVED_BEAM_SEGMENTS);
    let cb = s.curved_beams[0].clone();
    for _ in 0..MAX_CURVED_BEAM_SEGMENTS_TOTAL / MAX_CURVED_BEAM_SEGMENTS {
        s.curved_beams.push(cb.clone());
    }
    let err = solve_3d(&s).expect_err("must refuse");
    assert!(err.contains("in total"), "{err}");
}

#[test]
fn curved_beam_ids_cannot_wrap() {
    use dedaliano_engine::solver::linear::{expand_curved_beams_3d, solve_3d};
    // A node id at the top of the range: the expansion's new ids would wrap to
    // 0, 1, … and could alias existing nodes.
    let mut s = arc_3d(4);
    let n2 = s.nodes.remove("2").unwrap();
    s.nodes.insert(usize::MAX.to_string(), SolverNode3D { id: usize::MAX, ..n2 });
    s.elements.get_mut("1").unwrap().node_j = usize::MAX;
    s.curved_beams[0].node_end = usize::MAX;
    if let SolverLoad3D::Nodal(l) = &mut s.loads[0] {
        l.node_id = usize::MAX;
    }
    // Left unexpanded (no wrapped ids are produced)…
    let expanded = expand_curved_beams_3d(&s);
    assert_eq!(expanded.curved_beams.len(), 1);
    assert_eq!(expanded.nodes.len(), s.nodes.len());
    // …and refused.
    let err = solve_3d(&s).expect_err("must refuse");
    assert!(err.contains("too large"), "{err}");
}

// ---------------------------------------------------------------- moving loads

#[test]
fn moving_loads_degenerate_step_is_refused() {
    use dedaliano_engine::solver::moving_loads::solve_moving_loads_2d;
    let train = LoadTrain { name: "t".into(), axles: vec![Axle { offset: 0.0, weight: 10.0 }] };
    for step in [0.0, -1.0, f64::NAN, f64::INFINITY, 1e-9] {
        let input = MovingLoadInput {
            solver: beam_2d(), train: train.clone(), step: Some(step), path_element_ids: None,
        };
        let err = solve_moving_loads_2d(&input).expect_err("must refuse");
        assert!(err.contains("step"), "step {step}: {err}");
    }
    let ok = MovingLoadInput { solver: beam_2d(), train, step: Some(0.5), path_element_ids: None };
    solve_moving_loads_2d(&ok).expect("a sane step solves");
}

// ---------------------------------------------------------------- influence lines

#[test]
fn influence_points_per_element_is_bounded() {
    use dedaliano_engine::postprocess::influence::{compute_influence_line, InfluenceLineInput};
    let make = |n| InfluenceLineInput {
        solver: beam_2d(), quantity: "Ry".into(), target_node_id: Some(1),
        target_element_id: None, target_position: 0.5, n_points_per_element: n,
    };
    for n in [0, usize::MAX] {
        let err = compute_influence_line(&make(n)).expect_err("must refuse");
        assert!(err.contains("nPointsPerElement"), "{err}");
    }
    compute_influence_line(&make(4)).expect("a sane count solves");
}

// ---------------------------------------------------------------- time history

#[test]
fn time_history_step_count_is_bounded() {
    use dedaliano_engine::solver::time_integration::solve_time_history_2d;
    let input = TimeHistoryInput {
        solver: beam_2d(),
        densities: HashMap::from([("1".to_string(), 7850.0)]),
        time_step: 0.01,
        n_steps: usize::MAX,
        method: "newmark".into(),
        beta: 0.25,
        gamma: 0.5,
        alpha: None,
        damping_xi: None,
        ground_accel: None,
        ground_direction: None,
        force_history: None,
    };
    let err = solve_time_history_2d(&input).expect_err("must refuse");
    assert!(err.contains("n_steps"), "{err}");
}

// ---------------------------------------------------------------- beam stations

#[test]
fn beam_station_count_is_clamped() {
    use dedaliano_engine::postprocess::beam_stations::{
        extract_beam_stations, BeamStationInput, MAX_NUM_STATIONS,
    };
    let r = extract_beam_stations(&BeamStationInput {
        members: vec![], combinations: vec![], num_stations: Some(usize::MAX),
    });
    assert_eq!(r.num_stations_per_member, MAX_NUM_STATIONS);
}
