// The sparse 2D constrained solve against the dense one, DOF by DOF.
//
// Above 64 free DOFs a constrained model takes the triplet assembly and the
// sparse reduction instead of the dense n×n path. The verdict must be the
// same numbers, not the same order of magnitude.
use crate::common::*;
use dedaliano_engine::solver::constraints::{solve_constrained_2d, solve_constrained_2d_dense, ConstrainedInput};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::types::*;
use std::collections::HashMap;

const E: f64 = 200000.0;
const A: f64 = 0.02;
const IZ: f64 = 1e-4;

/// A fixed-base portal of `bays`×`storeys` with an equalDOF diaphragm per floor.
fn diaphragm_frame(bays: usize, storeys: usize) -> (SolverInput, Vec<Constraint>) {
    let (span, h) = (6.0, 3.5);
    let id = |i: usize, k: usize| 1 + k * (bays + 1) + i;
    let mut nodes = HashMap::new();
    for k in 0..=storeys {
        for i in 0..=bays {
            nodes.insert(id(i, k).to_string(), SolverNode { id: id(i, k), x: span * i as f64, z: h * k as f64 });
        }
    }
    let mut elements = HashMap::new();
    let mut eid = 1;
    for k in 0..=storeys {
        for i in 0..bays {
            elements.insert(eid.to_string(), SolverElement {
                id: eid, elem_type: "frame".into(), node_i: id(i, k), node_j: id(i + 1, k),
                material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
            });
            eid += 1;
        }
    }
    for k in 0..storeys {
        for i in 0..=bays {
            elements.insert(eid.to_string(), SolverElement {
                id: eid, elem_type: "frame".into(), node_i: id(i, k), node_j: id(i, k + 1),
                material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
            });
            eid += 1;
        }
    }
    let supports = HashMap::from([
        ("1".to_string(), SolverSupport {
            id: 1, node_id: id(0, 0), support_type: "fixed".into(),
            kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
        }),
        ("2".to_string(), SolverSupport {
            id: 2, node_id: id(bays, 0), support_type: "fixed".into(),
            kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
        }),
    ]);
    let mut loads = Vec::new();
    for k in 1..=storeys {
        for i in 0..=bays {
            loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: id(i, k), fx: 2.0, fz: -50.0, my: 0.0 }));
        }
    }
    let input = SolverInput {
        nodes, materials: HashMap::from([("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 })]),
        sections: HashMap::from([("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None })]),
        elements, supports, loads, constraints: vec![],
        connectors: HashMap::new(), solver_options: None,
    };
    // One horizontal diaphragm per floor: every node's ux follows the first node's.
    let mut constraints = Vec::new();
    for k in 1..=storeys {
        for i in 1..=bays {
            constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
                master_node: id(0, k),
                slave_node: id(i, k),
                dofs: vec![0],
            }));
        }
    }
    (input, constraints)
}

fn disp_of<'a>(r: &'a AnalysisResults, node: usize) -> (f64, f64, f64) {
    let d = r.displacements.iter().find(|d| d.node_id == node).unwrap();
    (d.ux, d.uz, d.ry)
}

fn max_disp_diff(a: &AnalysisResults, b: &AnalysisResults) -> f64 {
    a.displacements.iter().map(|d| {
        let (ux, uz, ry) = disp_of(b, d.node_id);
        ((d.ux - ux).abs()).max((d.uz - uz).abs()).max((d.ry - ry).abs())
    }).fold(0.0, f64::max)
}

#[test]
fn sparse_and_dense_constrained_agree_on_a_diaphragm_frame() {
    // 4 bays × 8 storeys: 45 nodes, 135 DOFs, 127 free — past the threshold.
    let (input, constraints) = diaphragm_frame(4, 8);
    let dof_num = DofNumbering::build_2d(&input);
    let ci = ConstrainedInput { solver: input, constraints };
    let dense = solve_constrained_2d_dense(&ci, &dof_num).unwrap();
    let sparse = solve_constrained_2d(&ci).unwrap();
    // Discriminating: the sparse path was actually taken, not a silent dense fallback.
    assert!(sparse.structured_diagnostics.iter().any(|d| d.code == dedaliano_engine::types::DiagnosticCode::SparseCholesky),
        "expected the sparse Cholesky diagnostic, got {:?}", sparse.structured_diagnostics.iter().map(|d| d.code).collect::<Vec<_>>());
    let diff = max_disp_diff(&dense, &sparse);
    let scale = dense.displacements.iter().map(|d| d.ux.abs()).fold(0.0, f64::max);
    assert!(diff < 1e-9 * scale.max(1.0), "dense vs sparse max Δ = {diff} (scale {scale})");
    // Reactions add up identically.
    let sum = |r: &AnalysisResults, f: fn(&Reaction) -> f64| r.reactions.iter().map(f).sum::<f64>();
    assert!((sum(&dense, |r: &Reaction| r.rx) - sum(&sparse, |r: &Reaction| r.rx)).abs() < 1e-9);
    assert!((sum(&dense, |r: &Reaction| r.rz) - sum(&sparse, |r: &Reaction| r.rz)).abs() < 1e-9);
    // The diaphragm holds: a floor's ux is one value.
    let floor8 = 8 * 5 + 1;
    let ux0 = disp_of(&sparse, floor8).0;
    for i in 0..=4 {
        assert!((disp_of(&sparse, floor8 + i).0 - ux0).abs() < 1e-12, "diaphragm broken at node {}", floor8 + i);
    }
}

#[test]
fn sparse_and_dense_constrained_agree_with_a_settlement() {
    // The prescribed-displacement bookkeeping (u_r, u_p, K_fr·u_r) on both paths.
    let (mut input, constraints) = diaphragm_frame(4, 8);
    input.supports.get_mut("1").unwrap().dz = Some(-0.01);
    let dof_num = DofNumbering::build_2d(&input);
    let ci = ConstrainedInput { solver: input, constraints };
    let dense = solve_constrained_2d_dense(&ci, &dof_num).unwrap();
    let sparse = solve_constrained_2d(&ci).unwrap();
    let diff = max_disp_diff(&dense, &sparse);
    let scale = dense.displacements.iter().map(|d| d.uz.abs()).fold(0.0, f64::max).max(0.01);
    assert!(diff < 1e-9 * scale.max(1.0), "with settlement, dense vs sparse max Δ = {diff}");
}

#[test]
fn a_mechanism_at_size_is_reported_not_solved() {
    // Pinned bases and every beam end hinged: the sparse factorization must
    // fail and the dense fallback report the mechanism, never a garbage solve.
    let (mut input, constraints) = diaphragm_frame(4, 8);
    for e in input.elements.values_mut() {
        e.hinge_start = true;
        e.hinge_end = true;
    }
    for s in input.supports.values_mut() { s.support_type = "pinned".into(); }
    let ci = ConstrainedInput { solver: input, constraints };
    let result = solve_constrained_2d(&ci);
    assert!(result.is_err(), "a pinned, all-hinged diaphragm frame must not solve");
}

#[test]
fn creep_steps_keep_the_constraints() {
    // Each creep step re-solves loads on a prepared structure, and the prepared static
    // solve is the unconstrained one: a diaphragm's nodes moved apart. Without creep
    // parameters a step is the model's own loads, so it must be the constrained solve.
    use dedaliano_engine::solver::creep_shrinkage::{solve_creep_shrinkage_2d, CreepShrinkageInput, TimeStep};
    use dedaliano_engine::solver::linear;
    let (mut input, constraints) = diaphragm_frame(2, 2);
    input.constraints = constraints;
    let expected = linear::solve_2d(&input).unwrap();
    let cs = CreepShrinkageInput {
        solver: input, creep_params: HashMap::new(),
        time_steps: vec![TimeStep { t_days: 28.0, additional_loads: vec![] }], aging_coefficient: 0.8,
    };
    let step = &solve_creep_shrinkage_2d(&cs).unwrap().steps[0];
    for d in &expected.displacements {
        let s = step.displacements.iter().find(|x| x.node_id == d.node_id).unwrap();
        assert!((d.ux - s.ux).abs() < 1e-12 && (d.uz - s.uz).abs() < 1e-12,
            "node {}: step ({}, {}) vs constrained solve ({}, {})", d.node_id, s.ux, s.uz, d.ux, d.uz);
    }
}
