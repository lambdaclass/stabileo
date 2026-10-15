//! An axial span load on a plane member (`SolverLoad::AxialDistributed`), the twin of
//! `SolverDistributedLoad3D::q_xi`/`q_xj` (axial_distributed_3d.rs).
//!
//! The part of a load in global axes that runs along an inclined member used to reach the
//! plane solve as equivalent loads at the end nodes: displacements and reactions were right,
//! but the member saw no span load and N came out constant — the average of its true end
//! values. Every number below is closed form, from the member's free body.
mod common;
use common::make_input;
use dedaliano_engine::postprocess::{
    combinations::{combine_results_refs, CombinationFactor},
    diagrams::compute_diagram_value_at,
};
use dedaliano_engine::solver::{
    assembly::{assemble_load_vector_2d, assemble_sparse_2d},
    corotational::solve_corotational_2d,
    dof::DofNumbering,
    linear::solve_2d,
};
use dedaliano_engine::types::*;

fn close(a: f64, b: f64) {
    assert!((a - b).abs() < 1e-7, "{a} != {b}");
}

fn axial(element_id: usize, q_i: f64, q_j: f64, a: Option<f64>, b: Option<f64>) -> SolverLoad {
    SolverLoad::AxialDistributed(SolverAxialDistributedLoad { element_id, q_i, q_j, a, b })
}

fn transverse(element_id: usize, q: f64) -> SolverLoad {
    SolverLoad::Distributed(SolverDistributedLoad { element_id, q_i: q, q_j: q, a: None, b: None })
}

/// A 3:4:5 member from (0,0) to (4,3), pinned at I and on a horizontal roller at J, under
/// 10 kN/m vertical along its length: 8 kN/m across it and 6 kN/m along it, toward I.
fn inclined(elem_type: &str) -> SolverInput {
    make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 3.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![(1, elem_type, 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![transverse(1, -8.0), axial(1, -6.0, -6.0, None, None)],
    )
}

#[test]
fn inclined_member_under_vertical_load_has_n_from_minus_15_to_15() {
    let r = solve_2d(&inclined("frame")).unwrap();
    let ra = r.reactions.iter().find(|x| x.node_id == 1).unwrap();
    let rb = r.reactions.iter().find(|x| x.node_id == 2).unwrap();
    close(ra.rx, 0.0);
    close(ra.rz, 25.0);
    close(rb.rz, 25.0);
    let f = &r.element_forces[0];
    close(f.n_start, -15.0);
    close(f.n_end, 15.0);
    for (t, n) in [(0.0, -15.0), (0.25, -7.5), (0.5, 0.0), (1.0, 15.0)] {
        close(compute_diagram_value_at("axial", t, f), n);
    }
    // The transverse part is untouched: V = ±20, M = qL²/8 = 25.
    close(f.v_start.abs(), 20.0);
    close(compute_diagram_value_at("moment", 0.5, f).abs(), 25.0);
}

#[test]
fn three_hinged_gable_rafters() {
    // A(0,0) – C(4,3) – B(8,0), pinned at A and B, a hinge at the apex. 10 kN/m vertical
    // along both rafters: thrust 33.333, N = −56.667 at the bases and −26.667 at the apex.
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 3.0), (3, 8.0, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![(1, "frame", 1, 2, 1, 1, false, true), (2, "frame", 2, 3, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 3, "pinned")],
        vec![
            transverse(1, -8.0), axial(1, -6.0, -6.0, None, None),
            transverse(2, -8.0), axial(2, 6.0, 6.0, None, None),
        ],
    );
    let r = solve_2d(&input).unwrap();
    close(r.reactions.iter().find(|x| x.node_id == 1).unwrap().rx, 100.0 / 3.0);
    let left = r.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let right = r.element_forces.iter().find(|f| f.element_id == 2).unwrap();
    close(left.n_start, -170.0 / 3.0);
    close(left.n_end, -80.0 / 3.0);
    close(right.n_start, -80.0 / 3.0);
    close(right.n_end, -170.0 / 3.0);
    close(compute_diagram_value_at("axial", 0.5, left), -125.0 / 3.0);
    close(left.m_end, 0.0);
}

#[test]
fn a_truss_bar_carries_it_as_a_hinged_frame_does() {
    let t = solve_2d(&inclined("truss")).unwrap();
    let f = solve_2d(&make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 3.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![(1, "frame", 1, 2, 1, 1, true, true)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![transverse(1, -8.0), axial(1, -6.0, -6.0, None, None)],
    ))
    .unwrap();
    let (et, ef) = (&t.element_forces[0], &f.element_forces[0]);
    close(et.n_start, ef.n_start);
    close(et.n_end, ef.n_end);
    close(et.n_start, -15.0);
    close(compute_diagram_value_at("axial", 0.5, et), 0.0);
}

/// A column from (0,0) to (0,4) fixed at its base, as axial_distributed_3d.rs's.
fn column(q_i: f64, q_j: f64, a: f64, b: f64) -> SolverInput {
    make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, 4.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![axial(1, q_i, q_j, Some(a), Some(b))],
    )
}

#[test]
fn uniform_axial_load_has_varying_force_and_consistent_displacement() {
    let r = solve_2d(&column(-4.0, -4.0, 0.0, 4.0)).unwrap();
    let f = &r.element_forces[0];
    close(r.reactions[0].rz, 16.0);
    close(f.n_start, -16.0);
    close(f.n_end, 0.0);
    close(compute_diagram_value_at("axial", 0.5, f), -8.0);
    close(
        r.displacements.iter().find(|d| d.node_id == 2).unwrap().uz,
        -4.0 * 4.0 * 4.0 / (2.0 * 200_000_000.0 * 0.01),
    );
}

#[test]
fn partial_triangle_survives_combination_and_diagram_recovery() {
    let r = solve_2d(&column(0.0, -6.0, 1.0, 3.0)).unwrap();
    let f = &r.element_forces[0];
    for (t, expected) in [(0.0, -6.0), (0.25, -6.0), (0.5, -4.5), (0.75, 0.0), (1.0, 0.0)] {
        close(compute_diagram_value_at("axial", t, f), expected);
    }
    let c = combine_results_refs(&[CombinationFactor { case_id: 1, factor: 2.0 }], &[(1, &r)]).unwrap();
    close(c.element_forces[0].n_start, -12.0);
    close(compute_diagram_value_at("axial", 0.5, &c.element_forces[0]), -9.0);
}

#[test]
fn axial_load_assembly_dense_and_sparse_agree() {
    // Opposite intensities: zero resultant, nonzero consistent nodal forces.
    let input = column(-3.0, 3.0, 1.0, 3.0);
    let dofs = DofNumbering::build_2d(&input);
    let dense = assemble_load_vector_2d(&input, &input.loads, &dofs, &[]);
    let sparse = assemble_sparse_2d(&input, &dofs).f;
    for (a, b) in dense.iter().zip(&sparse) {
        close(*a, *b);
    }
    close(dense[dofs.global_dof(1, 1).unwrap()], -0.5);
    close(dense[dofs.global_dof(2, 1).unwrap()], 0.5);
    #[cfg(feature = "parallel")]
    {
        let parallel = dedaliano_engine::solver::sparse_assembly::assemble_elements_parallel_2d(&input, &dofs);
        for (a, b) in dense.iter().zip(&parallel.f) {
            close(*a, *b);
        }
    }
}

#[test]
fn corotational_reads_the_same_span_load() {
    // A small load: the large-displacement solve meets the linear one.
    let input = inclined("frame");
    let lin = solve_2d(&input).unwrap();
    let cr = solve_corotational_2d(&input, 50, 1e-10, 1, false).unwrap();
    assert!(cr.converged);
    let (fl, fc) = (&lin.element_forces[0], &cr.results.element_forces[0]);
    assert!((fl.n_start - fc.n_start).abs() < 1e-3, "{} vs {}", fl.n_start, fc.n_start);
    assert!((fl.n_end - fc.n_end).abs() < 1e-3, "{} vs {}", fl.n_end, fc.n_end);
    assert_eq!(fc.distributed_loads_x.len(), 1);
}

#[test]
fn wire_format_is_the_axial_distributed_variant() {
    let load: SolverLoad = serde_json::from_str(
        r#"{"type":"axialDistributed","data":{"elementId":1,"qI":-6,"qJ":-6}}"#,
    )
    .unwrap();
    assert!(matches!(load, SolverLoad::AxialDistributed(SolverAxialDistributedLoad { element_id: 1, a: None, b: None, .. })));
    let r = solve_2d(&inclined("frame")).unwrap();
    let json = serde_json::to_value(&r.element_forces[0]).unwrap();
    assert_eq!(json["distributedLoadsX"][0]["qI"], -6.0);
}

#[test]
fn an_axial_point_load_on_a_truss_bar_steps_its_n() {
    // A horizontal bar pinned at I, on a roller at J, pulled 10 kN toward J at a = 2 of 6:
    // tension 10 up to the load, nothing past it.
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![(1, "truss", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id: 1, a: 2.0, p: 0.0, px: Some(10.0), my: None })],
    );
    let r = solve_2d(&input).unwrap();
    let f = &r.element_forces[0];
    close(f.n_start, 10.0);
    close(f.n_end, 0.0);
    close(compute_diagram_value_at("axial", 0.2, f), 10.0);
    close(compute_diagram_value_at("axial", 0.5, f), 0.0);
    close(compute_diagram_value_at("moment", 0.5, f), 0.0);
}
