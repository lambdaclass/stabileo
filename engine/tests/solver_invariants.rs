//! Solver invariant tests: physical and numerical properties that must hold
//! for any correctly solved structural model.
//!
//! Tests cover:
//! 1. Equilibrium preservation (reactions balance applied loads)
//! 2. Stiffness matrix symmetry (K[i][j] == K[j][i])
//! 3. Energy bounds (non-negative strain energy, work-energy theorem)
//! 4. Zero-load zero-displacement
//! 5. Deterministic solve (bitwise reproducibility)
//! 6. Reaction count matches constrained DOFs

#[path = "common/mod.rs"]
mod common;

use common::{make_input, make_beam, make_portal_frame, make_3d_input, make_3d_beam};
use dedaliano_engine::solver::linear;
use dedaliano_engine::solver::assembly::{assemble_2d, assemble_sparse_2d, assemble_3d, assemble_sparse_3d};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::types::*;

// ==================== Constants ====================

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.15;
const IZ: f64 = 0.003125;
const IY: f64 = 0.003125;
const J: f64 = 1.0e-4;

// ==================== Model Builders ====================

fn make_2d_cantilever_tip_load(fz: f64) -> SolverInput {
    make_beam(
        4, 4.0, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5, fx: 0.0, fz, my: 0.0,
        })],
    )
}

fn make_2d_ss_beam_udl(q: f64) -> SolverInput {
    let n_elements = 4;
    let length = 6.0;
    let elem_len = length / n_elements as f64;
    let nodes: Vec<_> = (0..=n_elements)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n_elements)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1, "pinned"), (2, n_elements + 1, "rollerX")];
    let mut loads = Vec::new();
    for i in 0..n_elements {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    make_input(nodes, vec![(1, E, NU)], vec![(1, A, IZ)], elems, sups, loads)
}

fn make_2d_portal_lateral(lateral: f64) -> SolverInput {
    make_portal_frame(4.0, 6.0, E, A, IZ, lateral, 0.0)
}

fn make_3d_cantilever_tip_z(fz: f64) -> SolverInput3D {
    make_3d_beam(
        4, 4.0, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 5, fx: 0.0, fy: 0.0, fz, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    )
}

fn make_3d_portal_frame(fx: f64, fz: f64) -> SolverInput3D {
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, 0.0, 4.0),
        (3, 6.0, 0.0, 4.0),
        (4, 6.0, 0.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
        (3, "frame", 3, 4, 1, 1),
    ];
    let fixed_dofs = vec![true, true, true, true, true, true];
    let sups = vec![(1, fixed_dofs.clone()), (4, fixed_dofs)];
    let mut loads = Vec::new();
    if fx.abs() > 1e-20 {
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }));
    }
    if fz.abs() > 1e-20 {
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 0.0, fz, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }));
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: 0.0, fz, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }));
    }
    make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    )
}

// ==================== 1. Equilibrium Preservation ====================

fn check_equilibrium_2d(input: &SolverInput, result: &AnalysisResults, label: &str) {
    let mut applied_fx = 0.0_f64;
    let mut applied_fz = 0.0_f64;

    for load in &input.loads {
        match load {
            SolverLoad::Nodal(nl) => {
                applied_fx += nl.fx;
                applied_fz += nl.fz;
            }
            SolverLoad::Distributed(dl) => {
                let elem = input.elements.values()
                    .find(|e| e.id == dl.element_id)
                    .expect("distributed load references missing element");
                let ni = input.nodes.values().find(|n| n.id == elem.node_i).unwrap();
                let nj = input.nodes.values().find(|n| n.id == elem.node_j).unwrap();
                let dx = nj.x - ni.x;
                let dz = nj.z - ni.z;
                let length = (dx * dx + dz * dz).sqrt();
                let total_q = (dl.q_i + dl.q_j) / 2.0 * length;
                let cos_a = dx / length;
                let sin_a = dz / length;
                applied_fx += -sin_a * total_q;
                applied_fz += cos_a * total_q;
            }
            _ => {}
        }
    }

    let sum_rx: f64 = result.reactions.iter().map(|r| r.rx).sum();
    let sum_rz: f64 = result.reactions.iter().map(|r| r.rz).sum();

    let fx_imbalance = (sum_rx + applied_fx).abs();
    let fz_imbalance = (sum_rz + applied_fz).abs();
    let fx_scale = applied_fx.abs().max(sum_rx.abs()).max(1e-9);
    let fz_scale = applied_fz.abs().max(sum_rz.abs()).max(1e-9);

    assert!(
        fx_imbalance / fx_scale < 1e-6 || fx_imbalance < 1e-9,
        "{}: X equilibrium violated: SRx={:.10}, SFx={:.10}, imbalance={:.2e}",
        label, sum_rx, applied_fx, fx_imbalance
    );
    assert!(
        fz_imbalance / fz_scale < 1e-6 || fz_imbalance < 1e-9,
        "{}: Z equilibrium violated: SRz={:.10}, SFz={:.10}, imbalance={:.2e}",
        label, sum_rz, applied_fz, fz_imbalance
    );
}

fn check_equilibrium_3d(input: &SolverInput3D, result: &AnalysisResults3D, label: &str) {
    // Force equilibrium: sum of reaction forces + sum of applied forces = 0
    let mut applied_f = [0.0_f64; 3];
    // Moment equilibrium about origin: sum(M + r x F) for reactions + applied = 0
    let mut applied_m = [0.0_f64; 3];

    for load in &input.loads {
        if let SolverLoad3D::Nodal(nl) = load {
            applied_f[0] += nl.fx;
            applied_f[1] += nl.fy;
            applied_f[2] += nl.fz;
            let node = input.nodes.values().find(|n| n.id == nl.node_id)
                .expect("load references missing node");
            applied_m[0] += nl.mx + (node.y * nl.fz - node.z * nl.fy);
            applied_m[1] += nl.my + (node.z * nl.fx - node.x * nl.fz);
            applied_m[2] += nl.mz + (node.x * nl.fy - node.y * nl.fx);
        }
    }

    let mut reaction_f = [0.0_f64; 3];
    let mut reaction_m = [0.0_f64; 3];
    for r in &result.reactions {
        reaction_f[0] += r.fx;
        reaction_f[1] += r.fy;
        reaction_f[2] += r.fz;
        let node = input.nodes.values().find(|n| n.id == r.node_id)
            .expect("reaction references missing node");
        reaction_m[0] += r.mx + (node.y * r.fz - node.z * r.fy);
        reaction_m[1] += r.my + (node.z * r.fx - node.x * r.fz);
        reaction_m[2] += r.mz + (node.x * r.fy - node.y * r.fx);
    }

    let dir_f = ["Fx", "Fy", "Fz"];
    for i in 0..3 {
        let imbalance = (reaction_f[i] + applied_f[i]).abs();
        let scale = applied_f[i].abs().max(reaction_f[i].abs()).max(1e-9);
        assert!(
            imbalance / scale < 1e-6 || imbalance < 1e-9,
            "{}: {} force equilibrium violated: SR={:.10}, SF={:.10}, imbalance={:.2e}",
            label, dir_f[i], reaction_f[i], applied_f[i], imbalance
        );
    }

    let dir_m = ["Mx", "My", "Mz"];
    for i in 0..3 {
        let imbalance = (reaction_m[i] + applied_m[i]).abs();
        let scale = applied_m[i].abs().max(reaction_m[i].abs()).max(1e-9);
        assert!(
            imbalance / scale < 1e-6 || imbalance < 1e-9,
            "{}: {} moment equilibrium violated: SMr={:.10}, SMa={:.10}, imbalance={:.2e}",
            label, dir_m[i], reaction_m[i], applied_m[i], imbalance
        );
    }
}

#[test]
fn equilibrium_2d_cantilever_point_load() {
    let input = make_2d_cantilever_tip_load(-50.0);
    let result = linear::solve_2d(&input).unwrap();
    check_equilibrium_2d(&input, &result, "2D cantilever point load");
}

#[test]
fn equilibrium_2d_ss_beam_distributed_load() {
    let input = make_2d_ss_beam_udl(-10.0);
    let result = linear::solve_2d(&input).unwrap();
    check_equilibrium_2d(&input, &result, "2D SS beam UDL");
}

#[test]
fn equilibrium_2d_portal_lateral() {
    let input = make_2d_portal_lateral(20.0);
    let result = linear::solve_2d(&input).unwrap();
    check_equilibrium_2d(&input, &result, "2D portal lateral");
}

#[test]
fn equilibrium_3d_cantilever_tip_z() {
    let input = make_3d_cantilever_tip_z(-30.0);
    let result = linear::solve_3d(&input).unwrap();
    check_equilibrium_3d(&input, &result, "3D cantilever tip Z");
}

#[test]
fn equilibrium_3d_portal_lateral_gravity() {
    let input = make_3d_portal_frame(15.0, -25.0);
    let result = linear::solve_3d(&input).unwrap();
    check_equilibrium_3d(&input, &result, "3D portal lateral+gravity");
}

// ==================== 2. Stiffness Matrix Symmetry ====================

fn check_dense_symmetry(k: &[f64], n: usize, label: &str) {
    let mut max_asym = 0.0_f64;
    let mut worst_ij = (0, 0);
    for i in 0..n {
        for j in (i + 1)..n {
            let kij = k[i * n + j];
            let kji = k[j * n + i];
            let diff = (kij - kji).abs();
            if diff > max_asym {
                max_asym = diff;
                worst_ij = (i, j);
            }
        }
    }
    assert!(
        max_asym < 1e-12,
        "{}: stiffness matrix not symmetric: K[{},{}] - K[{},{}] = {:.2e}",
        label, worst_ij.0, worst_ij.1, worst_ij.1, worst_ij.0, max_asym
    );
}

fn check_sparse_symmetry(k_ff: &dedaliano_engine::linalg::sparse::CscMatrix, label: &str) {
    let dense = k_ff.to_dense_symmetric();
    let n = k_ff.n;
    check_dense_symmetry(&dense, n, label);
}

#[test]
fn symmetry_2d_single_element() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![],
    );
    let dof_num = DofNumbering::build_2d(&input);
    let asm = assemble_2d(&input, &dof_num);
    check_dense_symmetry(&asm.k, dof_num.n_total, "2D single element (dense)");
}

#[test]
fn symmetry_2d_multi_element() {
    let input = make_beam(8, 10.0, E, A, IZ, "fixed", Some("pinned"), vec![]);
    let dof_num = DofNumbering::build_2d(&input);
    let asm = assemble_2d(&input, &dof_num);
    check_dense_symmetry(&asm.k, dof_num.n_total, "2D multi element (dense)");

    let sasm = assemble_sparse_2d(&input, &dof_num);
    check_sparse_symmetry(&sasm.k_ff, "2D multi element (sparse Kff)");
}

#[test]
fn symmetry_3d_single_element() {
    let input = make_3d_beam(
        1, 4.0, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        Some(vec![false, true, true, false, false, false]),
        vec![],
    );
    let dof_num = DofNumbering::build_3d(&input);
    let asm = assemble_3d(&input, &dof_num);
    check_dense_symmetry(&asm.k, dof_num.n_total, "3D single element (dense)");
}

#[test]
fn symmetry_3d_multi_element() {
    let input = make_3d_portal_frame(0.0, 0.0);
    let dof_num = DofNumbering::build_3d(&input);
    let asm = assemble_3d(&input, &dof_num);
    check_dense_symmetry(&asm.k, dof_num.n_total, "3D multi element (dense)");

    let sasm = assemble_sparse_3d(&input, &dof_num, false);
    check_sparse_symmetry(&sasm.k_ff, "3D multi element (sparse Kff)");
}

// ==================== 3. Energy Bounds ====================

/// For a linear elastic structure solved via K*u=F, the strain energy is
/// SE = 0.5 * u^T * K * u. The external work done by loads that ramp from
/// zero to their final value is W = 0.5 * F^T * u. Since K*u = F for the
/// free DOFs, SE = W exactly.

#[test]
fn energy_2d_cantilever() {
    let input = make_2d_cantilever_tip_load(-50.0);
    let result = linear::solve_2d(&input).unwrap();
    let dof_num = DofNumbering::build_2d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    let mut u_full = vec![0.0; n];
    for d in &result.displacements {
        if let Some(&g) = dof_num.map.get(&(d.node_id, 0)) { u_full[g] = d.ux; }
        if let Some(&g) = dof_num.map.get(&(d.node_id, 1)) { u_full[g] = d.uz; }
        if let Some(&g) = dof_num.map.get(&(d.node_id, 2)) { u_full[g] = d.ry; }
    }

    let sasm = assemble_sparse_2d(&input, &dof_num);
    let u_f: Vec<f64> = u_full[..nf].to_vec();
    let ku = sasm.k_ff.sym_mat_vec(&u_f);
    let strain_energy: f64 = 0.5 * u_f.iter().zip(ku.iter()).map(|(u, k)| u * k).sum::<f64>();

    assert!(
        strain_energy >= -1e-12,
        "2D cantilever: strain energy is negative: {:.6e}", strain_energy
    );
    assert!(
        strain_energy > 0.0,
        "2D cantilever: strain energy should be positive for a loaded structure"
    );

    // External work = 0.5 * F^T * u (factor 0.5 because load ramps from 0 to F)
    let f_f: Vec<f64> = sasm.f[..nf].to_vec();
    let ext_work: f64 = 0.5 * f_f.iter().zip(u_f.iter()).map(|(f, u)| f * u).sum::<f64>();

    let scale = strain_energy.abs().max(ext_work.abs()).max(1e-12);
    let rel_err = (strain_energy - ext_work).abs() / scale;
    assert!(
        rel_err < 1e-6,
        "2D cantilever: work-energy violated: SE={:.10e}, W={:.10e}, rel_err={:.2e}",
        strain_energy, ext_work, rel_err
    );
}

#[test]
fn energy_3d_cantilever() {
    let input = make_3d_cantilever_tip_z(-30.0);
    let result = linear::solve_3d(&input).unwrap();
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    let mut u_full = vec![0.0; n];
    for d in &result.displacements {
        let vals = [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz];
        for (local_dof, &v) in vals.iter().enumerate() {
            if let Some(&g) = dof_num.map.get(&(d.node_id, local_dof)) {
                u_full[g] = v;
            }
        }
    }

    let sasm = assemble_sparse_3d(&input, &dof_num, false);
    let u_f: Vec<f64> = u_full[..nf].to_vec();
    let ku = sasm.k_ff.sym_mat_vec(&u_f);
    let strain_energy: f64 = 0.5 * u_f.iter().zip(ku.iter()).map(|(u, k)| u * k).sum::<f64>();

    assert!(
        strain_energy >= -1e-12,
        "3D cantilever: strain energy is negative: {:.6e}", strain_energy
    );
    assert!(
        strain_energy > 0.0,
        "3D cantilever: strain energy should be positive for a loaded structure"
    );

    let f_f: Vec<f64> = sasm.f[..nf].to_vec();
    let ext_work: f64 = 0.5 * f_f.iter().zip(u_f.iter()).map(|(f, u)| f * u).sum::<f64>();

    let scale = strain_energy.abs().max(ext_work.abs()).max(1e-12);
    let rel_err = (strain_energy - ext_work).abs() / scale;
    assert!(
        rel_err < 1e-6,
        "3D cantilever: work-energy violated: SE={:.10e}, W={:.10e}, rel_err={:.2e}",
        strain_energy, ext_work, rel_err
    );
}

// ==================== 4. Zero-Load Zero-Displacement ====================

#[test]
fn zero_load_zero_displacement_2d() {
    let input = make_beam(4, 6.0, E, A, IZ, "fixed", Some("pinned"), vec![]);
    let result = linear::solve_2d(&input).unwrap();

    for d in &result.displacements {
        assert!(
            d.ux.abs() < 1e-15 && d.uz.abs() < 1e-15 && d.ry.abs() < 1e-15,
            "2D zero-load: non-zero displacement at node {}: ux={:.2e}, uz={:.2e}, ry={:.2e}",
            d.node_id, d.ux, d.uz, d.ry
        );
    }

    for r in &result.reactions {
        assert!(
            r.rx.abs() < 1e-12 && r.rz.abs() < 1e-12 && r.my.abs() < 1e-12,
            "2D zero-load: non-zero reaction at node {}: rx={:.2e}, rz={:.2e}, my={:.2e}",
            r.node_id, r.rx, r.rz, r.my
        );
    }
}

#[test]
fn zero_load_zero_displacement_3d() {
    let input = make_3d_beam(
        4, 6.0, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        Some(vec![true, true, true, false, false, false]),
        vec![],
    );
    let result = linear::solve_3d(&input).unwrap();

    for d in &result.displacements {
        let max_d = d.ux.abs()
            .max(d.uy.abs())
            .max(d.uz.abs())
            .max(d.rx.abs())
            .max(d.ry.abs())
            .max(d.rz.abs());
        assert!(
            max_d < 1e-15,
            "3D zero-load: non-zero displacement at node {}: max={:.2e}",
            d.node_id, max_d
        );
    }

    for r in &result.reactions {
        let max_r = r.fx.abs()
            .max(r.fy.abs())
            .max(r.fz.abs())
            .max(r.mx.abs())
            .max(r.my.abs())
            .max(r.mz.abs());
        assert!(
            max_r < 1e-12,
            "3D zero-load: non-zero reaction at node {}: max={:.2e}",
            r.node_id, max_r
        );
    }
}

// ==================== 5. Deterministic Solve ====================

#[test]
fn deterministic_2d() {
    let input = make_2d_cantilever_tip_load(-50.0);
    let r1 = linear::solve_2d(&input).unwrap();
    let r2 = linear::solve_2d(&input).unwrap();

    assert_eq!(r1.displacements.len(), r2.displacements.len());
    assert_eq!(r1.reactions.len(), r2.reactions.len());
    assert_eq!(r1.element_forces.len(), r2.element_forces.len());

    for (d1, d2) in r1.displacements.iter().zip(r2.displacements.iter()) {
        assert_eq!(d1.node_id, d2.node_id);
        assert!(
            d1.ux == d2.ux && d1.uz == d2.uz && d1.ry == d2.ry,
            "2D determinism: node {} displacements differ: ({}, {}, {}) vs ({}, {}, {})",
            d1.node_id, d1.ux, d1.uz, d1.ry, d2.ux, d2.uz, d2.ry
        );
    }

    for (r1r, r2r) in r1.reactions.iter().zip(r2.reactions.iter()) {
        assert_eq!(r1r.node_id, r2r.node_id);
        assert!(
            r1r.rx == r2r.rx && r1r.rz == r2r.rz && r1r.my == r2r.my,
            "2D determinism: node {} reactions differ", r1r.node_id
        );
    }

    for (e1, e2) in r1.element_forces.iter().zip(r2.element_forces.iter()) {
        assert_eq!(e1.element_id, e2.element_id);
        assert!(
            e1.n_start == e2.n_start && e1.n_end == e2.n_end
            && e1.v_start == e2.v_start && e1.v_end == e2.v_end
            && e1.m_start == e2.m_start && e1.m_end == e2.m_end,
            "2D determinism: element {} forces differ", e1.element_id
        );
    }
}

#[test]
fn deterministic_3d() {
    let input = make_3d_portal_frame(15.0, -25.0);
    let r1 = linear::solve_3d(&input).unwrap();
    let r2 = linear::solve_3d(&input).unwrap();

    assert_eq!(r1.displacements.len(), r2.displacements.len());
    assert_eq!(r1.reactions.len(), r2.reactions.len());

    for (d1, d2) in r1.displacements.iter().zip(r2.displacements.iter()) {
        assert_eq!(d1.node_id, d2.node_id);
        assert!(
            d1.ux == d2.ux && d1.uy == d2.uy && d1.uz == d2.uz
            && d1.rx == d2.rx && d1.ry == d2.ry && d1.rz == d2.rz,
            "3D determinism: node {} displacements differ", d1.node_id
        );
    }

    for (r1r, r2r) in r1.reactions.iter().zip(r2.reactions.iter()) {
        assert_eq!(r1r.node_id, r2r.node_id);
        assert!(
            r1r.fx == r2r.fx && r1r.fy == r2r.fy && r1r.fz == r2r.fz
            && r1r.mx == r2r.mx && r1r.my == r2r.my && r1r.mz == r2r.mz,
            "3D determinism: node {} reactions differ", r1r.node_id
        );
    }
}

// ==================== 6. Reaction Count Matches Constrained DOFs ====================

fn constrained_dofs_2d(support_type: &str) -> Vec<usize> {
    match support_type {
        "fixed" => vec![0, 1, 2],
        "pinned" => vec![0, 1],
        "rollerX" => vec![1],
        "rollerY" | "rollerZ" => vec![0],
        "guidedX" => vec![1, 2],
        "guidedY" | "guidedZ" => vec![0, 2],
        _ => vec![],
    }
}

#[test]
fn reaction_count_matches_constrained_dofs_2d() {
    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 3.0, 0.0), (3, 6.0, 0.0),
            (4, 9.0, 0.0), (5, 12.0, 0.0),
        ],
        vec![(1, E, NU)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
            (4, "frame", 4, 5, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 3, "pinned"), (3, 5, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 5.0, fz: -10.0, my: 0.0,
        })],
    );
    let result = linear::solve_2d(&input).unwrap();

    for sup in input.supports.values() {
        let constrained = constrained_dofs_2d(&sup.support_type);
        let reaction = result.reactions.iter()
            .find(|r| r.node_id == sup.node_id)
            .unwrap_or_else(|| panic!("Missing reaction for support node {}", sup.node_id));

        let reaction_components = [reaction.rx, reaction.rz, reaction.my];

        for dof in 0..3 {
            if !constrained.contains(&dof) {
                let dof_name = match dof { 0 => "rx", 1 => "rz", _ => "my" };
                assert!(
                    reaction_components[dof].abs() < 1e-9,
                    "Node {} ({}): unconstrained DOF {} has non-zero reaction {:.6e}",
                    sup.node_id, sup.support_type, dof_name, reaction_components[dof]
                );
            }
        }
    }
}

#[test]
fn reaction_count_matches_constrained_dofs_3d() {
    let input = make_3d_beam(
        4, 8.0, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        Some(vec![true, true, true, false, false, false]),
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 5.0, fy: 0.0, fz: -20.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let result = linear::solve_3d(&input).unwrap();

    let r5 = result.reactions.iter()
        .find(|r| r.node_id == 5)
        .expect("Missing reaction for node 5");

    assert!(r5.mx.abs() < 1e-9, "3D pinned node 5: mx should be zero, got {:.6e}", r5.mx);
    assert!(r5.my.abs() < 1e-9, "3D pinned node 5: my should be zero, got {:.6e}", r5.my);
    assert!(r5.mz.abs() < 1e-9, "3D pinned node 5: mz should be zero, got {:.6e}", r5.mz);
}

// ==================== Parameterized Variants ====================

#[test]
fn equilibrium_parametric_2d() {
    for &load in &[-1.0, -10.0, -100.0, -1000.0, 50.0, 0.001] {
        let input = make_2d_cantilever_tip_load(load);
        let result = linear::solve_2d(&input).unwrap();
        check_equilibrium_2d(&input, &result, &format!("2D cantilever fz={}", load));
    }
}

#[test]
fn equilibrium_parametric_3d() {
    for &(fx, fz) in &[(10.0, -20.0), (-5.0, -100.0), (0.0, -1.0), (50.0, 0.0)] {
        let input = make_3d_portal_frame(fx, fz);
        let result = linear::solve_3d(&input).unwrap();
        check_equilibrium_3d(&input, &result, &format!("3D portal fx={}, fz={}", fx, fz));
    }
}

#[test]
fn symmetry_parametric_2d() {
    for &n_elem in &[1, 2, 5, 10] {
        let input = make_beam(n_elem, 10.0, E, A, IZ, "fixed", Some("pinned"), vec![]);
        let dof_num = DofNumbering::build_2d(&input);
        let asm = assemble_2d(&input, &dof_num);
        check_dense_symmetry(&asm.k, dof_num.n_total, &format!("2D {} elements", n_elem));
    }
}

#[test]
fn energy_parametric_2d() {
    for &load in &[-10.0, -50.0, -200.0] {
        let input = make_2d_cantilever_tip_load(load);
        let result = linear::solve_2d(&input).unwrap();
        let dof_num = DofNumbering::build_2d(&input);
        let nf = dof_num.n_free;
        let n = dof_num.n_total;

        let mut u_full = vec![0.0; n];
        for d in &result.displacements {
            if let Some(&g) = dof_num.map.get(&(d.node_id, 0)) { u_full[g] = d.ux; }
            if let Some(&g) = dof_num.map.get(&(d.node_id, 1)) { u_full[g] = d.uz; }
            if let Some(&g) = dof_num.map.get(&(d.node_id, 2)) { u_full[g] = d.ry; }
        }

        let sasm = assemble_sparse_2d(&input, &dof_num);
        let u_f: Vec<f64> = u_full[..nf].to_vec();
        let ku = sasm.k_ff.sym_mat_vec(&u_f);
        let strain_energy: f64 = 0.5 * u_f.iter().zip(ku.iter()).map(|(u, k)| u * k).sum::<f64>();
        let f_f: Vec<f64> = sasm.f[..nf].to_vec();
        let ext_work: f64 = 0.5 * f_f.iter().zip(u_f.iter()).map(|(f, u)| f * u).sum::<f64>();

        assert!(strain_energy > 0.0, "load={}: strain energy should be positive", load);

        let scale = strain_energy.abs().max(ext_work.abs()).max(1e-12);
        let rel_err = (strain_energy - ext_work).abs() / scale;
        assert!(
            rel_err < 1e-6,
            "load={}: work-energy violated: SE={:.6e}, W={:.6e}, rel_err={:.2e}",
            load, strain_energy, ext_work, rel_err
        );
    }
}
