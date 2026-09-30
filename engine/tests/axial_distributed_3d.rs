mod common;
use common::make_3d_input;
use dedaliano_engine::types::*;
use dedaliano_engine::solver::{linear::solve_3d, dof::DofNumbering, assembly::{assemble_load_vector_3d_dense, assemble_load_vector_3d_sparse}};
use dedaliano_engine::postprocess::{diagrams_3d::evaluate_diagram_3d_at, combinations::{combine_results_3d_refs, CombinationFactor}};

fn column(qi: f64, qj: f64, a: f64, b: f64) -> SolverInput3D {
    make_3d_input(
        vec![(1, 0., 0., 0.), (2, 0., 0., 4.)],
        vec![(1, 200_000., 0.3)], vec![(1, 0.01, 1e-4, 1e-4, 1e-4)],
        vec![(1, "frame", 1, 2, 1, 1)], vec![(1, vec![true; 6])],
        vec![SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: 1, q_xi: qi, q_xj: qj, q_yi: 0., q_yj: 0., q_zi: 0., q_zj: 0., a: Some(a), b: Some(b),
        })],
    )
}
fn close(a: f64, b: f64) { assert!((a-b).abs() < 1e-9, "{a} != {b}"); }

#[test]
fn uniform_axial_load_has_varying_force_and_consistent_displacement() {
    let input = column(-4., -4., 0., 4.);
    let r = solve_3d(&input).unwrap();
    let f = &r.element_forces[0];
    close(r.reactions[0].fz, 16.);
    close(f.n_start, -16.); close(f.n_end, 0.);
    close(evaluate_diagram_3d_at(f, "axial", 0.5), -8.);
    close(r.displacements.iter().find(|d| d.node_id == 2).unwrap().uz, -4.*4.*4./(2.*200_000_000.*0.01));
}

#[test]
fn partial_triangle_survives_combination_and_diagram_recovery() {
    let input = column(0., -6., 1., 3.);
    let r = solve_3d(&input).unwrap();
    let f = &r.element_forces[0];
    for (t, expected) in [(0., -6.), (0.25, -6.), (0.5, -4.5), (0.75, 0.), (1., 0.)] {
        close(evaluate_diagram_3d_at(f, "axial", t), expected);
    }
    let c = combine_results_3d_refs(&[CombinationFactor { case_id: 1, factor: 2. }], &[(1, &r)]).unwrap();
    close(evaluate_diagram_3d_at(&c.element_forces[0], "axial", 0.5), -9.);
}

#[test]
fn axial_load_assembly_dense_sparse_and_parallel_agree() {
    // Opposite intensities have zero resultant but nonzero consistent nodal forces.
    let input = column(-3., 3., 1., 3.);
    let dofs = DofNumbering::build_3d(&input);
    let dense = assemble_load_vector_3d_dense(&input, &input.loads, &dofs, &[]);
    let sparse = assemble_load_vector_3d_sparse(&input, &input.loads, &dofs, &[]);
    for (a,b) in dense.iter().zip(&sparse) { close(*a, *b); }
    close(dense[dofs.global_dof(1,2).unwrap()], -0.5);
    close(dense[dofs.global_dof(2,2).unwrap()], 0.5);
    #[cfg(feature = "parallel")]
    {
        let parallel = dedaliano_engine::solver::sparse_assembly::assemble_load_vector_3d_sparse_parallel(&input, &input.loads, &dofs, &[]);
        for (a,b) in dense.iter().zip(&parallel) { close(*a, *b); }
    }
}
