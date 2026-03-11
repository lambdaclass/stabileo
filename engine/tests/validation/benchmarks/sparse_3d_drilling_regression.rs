/// Regression test for the "tiny drilling regularization changes results" issue.
///
/// Shell elements have zero stiffness in the drilling DOF (rotation about
/// the element normal). The sparse assembly path collects triplets that may
/// include near-zero entries (~1e-30) from numerical noise. If these entries
/// are NOT dropped, they act as spurious regularization that causes the
/// sparse Cholesky to succeed where it should fail — producing wrong results.
///
/// The fix: `CscMatrix::drop_below_threshold(1e-30)` is applied to Kff
/// after CSC construction. This test verifies that the sparse path falls
/// back to dense LU (like the original dense path) and produces correct
/// results for shell models with drilling singularity.

use dedaliano_engine::solver::{assembly, linear};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::linalg::*;
use dedaliano_engine::types::*;
use std::collections::HashMap;

fn sup3d(
    node_id: usize, rx: bool, ry: bool, rz: bool,
    rrx: bool, rry: bool, rrz: bool,
) -> SolverSupport3D {
    SolverSupport3D {
        node_id, rx, ry, rz, rrx, rry, rrz,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None, rw: None, kw: None,
    }
}

/// Build a small flat shell (all quads coplanar in XY) which has
/// zero drilling stiffness — the drilling DOF (rz) has no physical
/// stiffness, making the stiffness matrix singular in that DOF.
///
/// This is the exact scenario that triggered the regression: sparse
/// Cholesky should NOT succeed here (or if it does via artificial
/// stiffness, must produce the same result as dense LU).
fn build_flat_shell_drilling_model(nx: usize, ny: usize) -> SolverInput3D {
    let lx = 1.0;
    let ly = 1.0;
    let t = 0.01;
    let e = 200_000.0;
    let nu = 0.3;

    let mut nodes = HashMap::new();
    let mut grid = vec![vec![0usize; ny + 1]; nx + 1];
    let mut nid = 1;
    for i in 0..=nx {
        for j in 0..=ny {
            nodes.insert(nid.to_string(), SolverNode3D {
                id: nid,
                x: (i as f64 / nx as f64) * lx,
                y: (j as f64 / ny as f64) * ly,
                z: 0.0,
            });
            grid[i][j] = nid;
            nid += 1;
        }
    }

    let mut quads = HashMap::new();
    let mut qid = 1;
    for i in 0..nx {
        for j in 0..ny {
            quads.insert(qid.to_string(), SolverQuadElement {
                id: qid,
                nodes: [grid[i][j], grid[i+1][j], grid[i+1][j+1], grid[i][j+1]],
                material_id: 1,
                thickness: t,
            });
            qid += 1;
        }
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e, nu });

    // Simply supported on all edges
    let mut supports = HashMap::new();
    let mut sid = 1;
    let mut boundary = Vec::new();
    for j in 0..=ny { boundary.push(grid[0][j]); boundary.push(grid[nx][j]); }
    for i in 0..=nx { boundary.push(grid[i][0]); boundary.push(grid[i][ny]); }
    boundary.sort();
    boundary.dedup();
    for &n in &boundary {
        supports.insert(sid.to_string(), sup3d(n, false, false, true, false, false, false));
        sid += 1;
    }
    // Pin one corner
    supports.insert(sid.to_string(), sup3d(grid[0][0], true, true, true, false, false, false));

    // Thermal gradient load — this is the load type that originally exposed the bug
    let n_quads = quads.len();
    let loads: Vec<SolverLoad3D> = (1..=n_quads).map(|eid| {
        SolverLoad3D::QuadThermal(SolverPlateThermalLoad {
            element_id: eid,
            dt_uniform: 0.0,
            dt_gradient: 20.0,
            alpha: Some(12e-6),
        })
    }).collect();

    SolverInput3D {
        nodes, materials: mats, sections: HashMap::new(),
        elements: HashMap::new(), supports, loads,
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads, quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![], connectors: HashMap::new(),
    }
}

/// The core regression test: sparse path must produce the same results
/// as the dense LU path for flat shell models with drilling singularity.
#[test]
fn regression_drilling_regularization_thermal_gradient() {
    // 4×4 mesh: 25 nodes, 150 DOFs — above SPARSE_THRESHOLD of 64
    let input = build_flat_shell_drilling_model(4, 4);
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;
    let nr = n - nf;

    assert!(nf >= 64, "Need nf >= 64, got {}", nf);

    // ── Dense path reference: assemble_3d + LU ──
    let dense_asm = assembly::assemble_3d(&input, &dof_num);
    let free_idx: Vec<usize> = (0..nf).collect();
    let rest_idx: Vec<usize> = (nf..n).collect();
    let k_ff_dense = extract_submatrix(&dense_asm.k, n, &free_idx, &free_idx);
    let k_fr = extract_submatrix(&dense_asm.k, n, &free_idx, &rest_idx);
    let u_r = vec![0.0; nr]; // no prescribed displacements
    let kfr_ur = mat_vec_rect(&k_fr, &u_r, nf, nr);
    let mut f_f = extract_subvec(&dense_asm.f, &free_idx);
    for i in 0..nf { f_f[i] -= kfr_ur[i]; }
    let mut k_work = k_ff_dense.clone();
    let u_dense = lu_solve(&mut k_work, &mut f_f.clone(), nf)
        .expect("Dense LU solve failed");

    // ── Sparse assembly: verify Kff has near-zero entries dropped ──
    let sparse_asm = assembly::assemble_sparse_3d(&input, &dof_num);

    // Verify that no entry in sparse Kff is below 1e-30 (the threshold)
    let kff_vals = &sparse_asm.k_ff.values;
    let tiny_count = kff_vals.iter().filter(|v| v.abs() < 1e-30 && v.abs() > 0.0).count();
    assert_eq!(
        tiny_count, 0,
        "Found {} entries below threshold in sparse Kff — drop_below_threshold not applied", tiny_count
    );

    // ── Full solve via solve_3d (takes sparse path) ──
    let res = linear::solve_3d(&input).expect("solve_3d failed");

    // Extract free-DOF displacements from results
    let mut u_solve3d = vec![0.0; nf];
    for d in &res.displacements {
        let dof_vals = [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz];
        for (local, &val) in dof_vals.iter().enumerate() {
            if let Some(&idx) = dof_num.map.get(&(d.node_id, local)) {
                if idx < nf {
                    u_solve3d[idx] = val;
                }
            }
        }
    }

    // ── Parity: solve_3d must match dense LU within tolerance ──
    let mut max_rel_err = 0.0f64;
    let mut max_abs_err = 0.0f64;
    for i in 0..nf {
        let diff = (u_solve3d[i] - u_dense[i]).abs();
        let scale = u_dense[i].abs().max(1e-15);
        let rel = diff / scale;
        if rel > max_rel_err { max_rel_err = rel; }
        if diff > max_abs_err { max_abs_err = diff; }
    }

    assert!(
        max_rel_err < 1e-4,
        "Drilling regression: sparse path diverged from dense LU — max_rel_err={:.3e}, max_abs_err={:.3e}",
        max_rel_err, max_abs_err
    );
}

/// Test with pressure load (another common load type on flat shells).
#[test]
fn regression_drilling_regularization_pressure() {
    let input = {
        let mut inp = build_flat_shell_drilling_model(4, 4);
        // Replace thermal loads with pressure
        let n_quads = inp.quads.len();
        inp.loads = (1..=n_quads).map(|eid| {
            SolverLoad3D::QuadPressure(SolverPressureLoad {
                element_id: eid,
                pressure: -10.0,
            })
        }).collect();
        inp
    };

    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;
    let nr = n - nf;

    // Dense reference
    let dense_asm = assembly::assemble_3d(&input, &dof_num);
    let free_idx: Vec<usize> = (0..nf).collect();
    let rest_idx: Vec<usize> = (nf..n).collect();
    let k_ff_dense = extract_submatrix(&dense_asm.k, n, &free_idx, &free_idx);
    let k_fr = extract_submatrix(&dense_asm.k, n, &free_idx, &rest_idx);
    let u_r = vec![0.0; nr];
    let kfr_ur = mat_vec_rect(&k_fr, &u_r, nf, nr);
    let mut f_f = extract_subvec(&dense_asm.f, &free_idx);
    for i in 0..nf { f_f[i] -= kfr_ur[i]; }
    let mut k_work = k_ff_dense;
    let u_dense = lu_solve(&mut k_work, &mut f_f.clone(), nf)
        .expect("Dense LU solve failed");

    // Sparse solve
    let res = linear::solve_3d(&input).expect("solve_3d failed");
    let mut u_sparse = vec![0.0; nf];
    for d in &res.displacements {
        let dof_vals = [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz];
        for (local, &val) in dof_vals.iter().enumerate() {
            if let Some(&idx) = dof_num.map.get(&(d.node_id, local)) {
                if idx < nf { u_sparse[idx] = val; }
            }
        }
    }

    let mut max_rel_err = 0.0f64;
    for i in 0..nf {
        let diff = (u_sparse[i] - u_dense[i]).abs();
        let scale = u_dense[i].abs().max(1e-15);
        let rel = diff / scale;
        if rel > max_rel_err { max_rel_err = rel; }
    }

    assert!(
        max_rel_err < 1e-4,
        "Drilling regression (pressure): max_rel_err={:.3e}", max_rel_err
    );
}

/// Test with a larger mesh to stress the sparse Cholesky fallback.
#[test]
fn regression_drilling_regularization_larger_mesh() {
    // 6×6 mesh: 49 nodes, 294 DOFs
    let input = build_flat_shell_drilling_model(6, 6);

    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;
    let nr = n - nf;

    // Dense reference
    let dense_asm = assembly::assemble_3d(&input, &dof_num);
    let free_idx: Vec<usize> = (0..nf).collect();
    let rest_idx: Vec<usize> = (nf..n).collect();
    let k_ff_dense = extract_submatrix(&dense_asm.k, n, &free_idx, &free_idx);
    let k_fr = extract_submatrix(&dense_asm.k, n, &free_idx, &rest_idx);
    let u_r = vec![0.0; nr];
    let kfr_ur = mat_vec_rect(&k_fr, &u_r, nf, nr);
    let mut f_f = extract_subvec(&dense_asm.f, &free_idx);
    for i in 0..nf { f_f[i] -= kfr_ur[i]; }
    let mut k_work = k_ff_dense;
    let u_dense = lu_solve(&mut k_work, &mut f_f.clone(), nf)
        .expect("Dense LU solve failed");

    // Sparse solve
    let res = linear::solve_3d(&input).expect("solve_3d failed");
    let mut u_sparse = vec![0.0; nf];
    for d in &res.displacements {
        let dof_vals = [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz];
        for (local, &val) in dof_vals.iter().enumerate() {
            if let Some(&idx) = dof_num.map.get(&(d.node_id, local)) {
                if idx < nf { u_sparse[idx] = val; }
            }
        }
    }

    let mut max_rel_err = 0.0f64;
    for i in 0..nf {
        let diff = (u_sparse[i] - u_dense[i]).abs();
        let scale = u_dense[i].abs().max(1e-15);
        let rel = diff / scale;
        if rel > max_rel_err { max_rel_err = rel; }
    }

    assert!(
        max_rel_err < 1e-4,
        "Drilling regression (6×6): max_rel_err={:.3e}", max_rel_err
    );
}
