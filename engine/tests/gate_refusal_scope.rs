//! What the pre-solve gates may refuse, and what they must.
//!
//! Refused by name: an element that cannot be integrated over — a collapsed
//! or folded shell — including one whose determinants are NaN, and including
//! on the constrained path, which does not go through `prepare_static_3d`.
//! Not refused: a frame whose orientation vector is zero or nearly parallel
//! to its axis. The gate reports that as an `Error`, but the local axes fall
//! back to a default reference and the model solves, as it did before the
//! refusal existed. (`f1`/`f5`/`f9`: the review findings on PR #199.)

#[path = "common/mod.rs"]
mod common;

use common::make_3d_input;
use dedaliano_engine::solver::linear::solve_3d;
use dedaliano_engine::solver::pre_solve_gates::run_pre_solve_gates_3d;
use dedaliano_engine::types::*;
use std::collections::HashMap;

const FIXED: [bool; 6] = [true; 6];

fn lateral_load(node: usize) -> SolverLoad3D {
    SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: node, fx: 10.0, fy: 5.0, fz: -20.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })
}

/// Cantilever column from the origin to `top`, with an optional custom local-y vector.
fn column(top: (f64, f64, f64), local_y: Option<(f64, f64, f64)>) -> SolverInput3D {
    let mut input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, top.0, top.1, top.2)],
        vec![(1, 210_000.0, 0.3)],
        vec![(1, 0.01, 1e-4, 2e-4, 1e-4)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, FIXED.to_vec())],
        vec![lateral_load(2)],
    );
    if let Some((x, y, z)) = local_y {
        let e = input.elements.get_mut("1").unwrap();
        e.local_yx = Some(x);
        e.local_yy = Some(y);
        e.local_yz = Some(z);
    }
    input
}

fn dump_gate_errors(input: &SolverInput3D) {
    for d in run_pre_solve_gates_3d(input) {
        eprintln!("  gate: {:?} {:?}: {}", d.severity, d.code, d.message);
    }
}

fn assert_solves(what: &str, input: SolverInput3D) -> AnalysisResults3D {
    dump_gate_errors(&input);
    match std::panic::catch_unwind(move || solve_3d(&input)) {
        Ok(Ok(r)) => r,
        Ok(Err(e)) => panic!("{what}: solve_3d refused a model compute_local_axes_3d handles: {e}"),
        Err(_) => panic!("{what}: panicked"),
    }
}

fn tip_disp(r: &AnalysisResults3D, node: usize) -> [f64; 3] {
    let d = r.displacements.iter().find(|d| d.node_id == node).expect("tip node");
    [d.ux, d.uy, d.uz]
}

// ---------------- #1: local-axis gate Errors now refuse solvable models ----------------

/// Column tilted 2° from global Z with local y = global Z: |cos| = 0.99939 > 0.999,
/// so the gate emits Error, yet ez = ex × ey_ref has magnitude sin 2° = 0.035 ≫ 1e-10:
/// the axes are perfectly well-defined.
#[test]
fn f1_tilted_column_with_near_parallel_local_y_still_solves() {
    let t = 2.0_f64.to_radians();
    let r = assert_solves(
        "2°-tilted column, local_y=(0,0,1)",
        column((3.0 * t.sin(), 0.0, 3.0 * t.cos()), Some((0.0, 0.0, 1.0))),
    );
    let u = tip_disp(&r, 2);
    assert!(u.iter().all(|v| v.is_finite()) && u.iter().any(|v| v.abs() > 0.0));
}

/// Exactly vertical column with local y = global Z: compute_local_axes_3d takes its
/// documented `ez_mag < 1e-10` fallback.
#[test]
fn f1_vertical_column_with_parallel_local_y_still_solves() {
    let r = assert_solves(
        "vertical column, local_y=(0,0,1)",
        column((0.0, 0.0, 3.0), Some((0.0, 0.0, 1.0))),
    );
    let u = tip_disp(&r, 2);
    assert!(u.iter().all(|v| v.is_finite()));
}

/// local y = (0,0,0): compute_local_axes_3d falls back to the default reference
/// (`mag > 1e-10` else default_ey_ref), so it must give the same answer as no vector.
#[test]
fn f1_zero_local_y_vector_still_solves_like_default() {
    let r0 = assert_solves("beam, local_y=(0,0,0)", column((4.0, 0.0, 0.0), Some((0.0, 0.0, 0.0))));
    let rd = assert_solves("beam, no local_y", column((4.0, 0.0, 0.0), None));
    let (a, b) = (tip_disp(&r0, 2), tip_disp(&rd, 2));
    for i in 0..3 {
        assert!((a[i] - b[i]).abs() <= 1e-12 * b[i].abs().max(1e-12), "{a:?} vs {b:?}");
    }
}

/// The gate's zero-length Error (len < 1e-15) is a strict subset of
/// validate_input_3d's zero-length rejection (l < 1e-10), which runs first.
/// Expected to PASS: the new refusal is unreachable for this diagnostic.
#[test]
fn f1_zero_length_element_is_already_rejected_by_validate_input() {
    let input = column((0.0, 0.0, 0.0), None);
    let e = solve_3d(&input).expect_err("zero-length element");
    eprintln!("  zero-length: {e}");
    assert!(e.contains("zero length") && !e.starts_with("Invalid model"), "got: {e}");
}

// ---------------- #5 / #9: collapsed quads ----------------

/// Four collinear nodes along `dir`, a frame chain through them, and one quad over all four.
fn collinear_quad_model(dir: [f64; 3]) -> SolverInput3D {
    let nodes = (0..4)
        .map(|i| (i, dir[0] * i as f64, dir[1] * i as f64, dir[2] * i as f64))
        .collect();
    let mut input = make_3d_input(
        nodes,
        vec![(1, 210_000.0, 0.3)],
        vec![(1, 0.01, 1e-4, 1e-4, 1e-4)],
        vec![(0, "frame", 0, 1, 1, 1), (1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1)],
        vec![(0, FIXED.to_vec())],
        vec![lateral_load(3)],
    );
    input.quads = HashMap::from([(
        "0".to_string(),
        SolverQuadElement { id: 0, nodes: [0, 1, 2, 3], material_id: 1, thickness: 0.2 },
    )]);
    input
}

fn assert_refused_by_name(what: &str, input: SolverInput3D) {
    dump_gate_errors(&input);
    match std::panic::catch_unwind(move || solve_3d(&input)) {
        Ok(Err(e)) => {
            eprintln!("  {what}: Err({e})");
            assert!(
                e.contains("Quad 0") && e.contains("collapsed"),
                "{what}: refusal should name the collapsed quad, got: {e}"
            );
        }
        Ok(Ok(_)) => panic!("{what}: a quad with no area must not be analysed"),
        Err(_) => panic!("{what}: panicked"),
    }
}

/// Collinear along global Z: quad_local_axes gives ex = 0/0 = NaN, every det_j is NaN,
/// f64::min/max skip NaN so quad_check_jacobian returns (INF, -INF) → classified Reversed.
#[test]
fn f5_gate_flags_z_collinear_quad_as_error() {
    let diags = run_pre_solve_gates_3d(&collinear_quad_model([0.0, 0.0, 1.0]));
    for d in &diags {
        eprintln!("  gate: {:?} {:?}: {}", d.severity, d.code, d.message);
    }
    assert!(
        diags.iter().any(|d| d.severity == Severity::Error && d.element_ids.contains(&0)),
        "a Z-collinear quad has no area and must produce an Error diagnostic"
    );
}

#[test]
fn f5_z_collinear_quad_is_refused_by_name() {
    assert_refused_by_name("Z-collinear quad", collinear_quad_model([0.0, 0.0, 1.0]));
}

/// Control: the PR's own X-collinear case (expected to PASS).
#[test]
fn f5_control_x_collinear_quad_is_refused_by_name() {
    assert_refused_by_name("X-collinear quad", collinear_quad_model([1.0, 0.0, 0.0]));
}

/// The PR's collapsed-quad model plus one harmless constraint: solve_3d delegates to
/// solve_constrained_3d, which never consults the pre-solve gates.
#[test]
fn f9_collapsed_quad_with_constraint_is_refused_by_name() {
    let mut input = collinear_quad_model([1.0, 0.0, 0.0]);
    input.constraints = vec![Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 2,
        slave_node: 3,
        dofs: vec![2],
    })];
    assert_refused_by_name("X-collinear quad + EqualDOF", input);
}
