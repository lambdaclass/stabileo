//! Benchmark gate tests: ensure sparse Cholesky survives shell matrices,
//! fill ratio stays bounded, and sparse/dense results match.

use dedaliano_engine::solver::linear;
use dedaliano_engine::solver::assembly::{assemble_sparse_3d, assemble_3d};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::linalg::{symbolic_cholesky, symbolic_cholesky_with, numeric_cholesky, CholOrdering, cholesky_solve, extract_submatrix, extract_subvec, lu_solve, mat_vec_rect};
use dedaliano_engine::types::*;
use std::collections::HashMap;

/// Build an nx×ny simply-supported MITC4 plate with uniform pressure.
fn make_ss_plate(nx: usize, ny: usize) -> SolverInput3D {
    let lx = 10.0;
    let ly = 10.0;
    let t = 0.1;
    let e = 200_000.0;
    let nu = 0.3;

    let mut nodes = HashMap::new();
    let mut grid = vec![vec![0usize; ny + 1]; nx + 1];
    let mut nid = 1;
    for i in 0..=nx {
        for j in 0..=ny {
            let x = (i as f64 / nx as f64) * lx;
            let y = (j as f64 / ny as f64) * ly;
            nodes.insert(nid.to_string(), SolverNode3D { id: nid, x, y, z: 0.0 });
            grid[i][j] = nid;
            nid += 1;
        }
    }

    let mut quads = HashMap::new();
    let mut qid = 1;
    for i in 0..nx {
        for j in 0..ny {
            quads.insert(
                qid.to_string(),
                SolverQuadElement {
                    id: qid,
                    nodes: [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]],
                    material_id: 1,
                    thickness: t,
                },
            );
            qid += 1;
        }
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e, nu });

    // Simply-supported edges: restrain z on all boundary nodes
    let mut supports = HashMap::new();
    let mut sid = 1;
    let mut boundary = Vec::new();
    for j in 0..=ny {
        boundary.push(grid[0][j]);
        boundary.push(grid[nx][j]);
    }
    for i in 0..=nx {
        boundary.push(grid[i][0]);
        boundary.push(grid[i][ny]);
    }
    boundary.sort();
    boundary.dedup();
    for &n in &boundary {
        supports.insert(
            sid.to_string(),
            SolverSupport3D {
                node_id: n,
                rx: false, ry: false, rz: true,
                rrx: false, rry: false, rrz: false,
                kx: None, ky: None, kz: None,
                krx: None, kry: None, krz: None,
                dx: None, dy: None, dz: None,
                drx: None, dry: None, drz: None,
                normal_x: None, normal_y: None, normal_z: None,
                is_inclined: None, rw: None, kw: None,
            },
        );
        sid += 1;
    }
    // Pin one corner fully to prevent rigid body modes
    supports.insert(
        sid.to_string(),
        SolverSupport3D {
            node_id: grid[0][0],
            rx: true, ry: true, rz: true,
            rrx: false, rry: false, rrz: false,
            kx: None, ky: None, kz: None,
            krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None,
            drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None, rw: None, kw: None,
        },
    );

    let n_quads = quads.len();
    let loads: Vec<SolverLoad3D> = (1..=n_quads)
        .map(|eid| SolverLoad3D::QuadPressure(SolverPressureLoad { element_id: eid, pressure: -1.0 }))
        .collect();

    SolverInput3D {
        nodes,
        materials: mats,
        sections: HashMap::new(),
        elements: HashMap::new(),
        supports,
        loads,
        constraints: vec![],
        left_hand: None,
        plates: HashMap::new(),
        quads,
        quad9s: HashMap::new(),
        solid_shells: HashMap::new(),
        curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}

/// Gate 1: Sparse path survives a 20×20 shell plate (no dense fallback).
#[test]
fn no_dense_fallback_on_shell() {
    let input = make_ss_plate(20, 20);
    let result = linear::solve_3d(&input).unwrap();
    let t = result.timings.as_ref().expect("Expected timings from sparse path");

    assert_eq!(
        t.dense_fallback_us, 0,
        "Dense fallback triggered ({} us) — sparse Cholesky should survive shell matrices",
        t.dense_fallback_us
    );
    assert!(
        t.solve_us > 0,
        "Sparse solve_us is 0 — factorization may have failed"
    );
}

/// Gate 2: Fill ratio stays bounded with RCM ordering.
#[test]
fn fill_ratio_below_threshold() {
    let input = make_ss_plate(50, 50);
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let asm = assemble_sparse_3d(&input, &dof_num, false);

    let sym = symbolic_cholesky_with(&asm.k_ff, CholOrdering::Rcm);
    let nnz_kff = asm.k_ff.col_ptr[nf];
    let nnz_l = sym.l_nnz;
    let fill_ratio = nnz_l as f64 / nnz_kff as f64;

    assert!(
        fill_ratio < 200.0,
        "Fill ratio {:.1}× exceeds 200× threshold (nnz_L={}, nnz_Kff={})",
        fill_ratio, nnz_l, nnz_kff
    );
}

/// Gate 3: Sparse and dense paths produce matching displacements.
#[test]
fn sparse_vs_dense_parity() {
    let input = make_ss_plate(10, 10);
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;
    let nr = n - nf;

    // Sparse solve via full solve_3d
    let sparse_result = linear::solve_3d(&input).unwrap();

    // Dense solve
    let asm_d = assemble_3d(&input, &dof_num);
    let free_idx: Vec<usize> = (0..nf).collect();
    let rest_idx: Vec<usize> = (nf..n).collect();
    let k_ff_d = extract_submatrix(&asm_d.k, n, &free_idx, &free_idx);
    let f_f_d = extract_subvec(&asm_d.f, &free_idx);
    let k_fr = extract_submatrix(&asm_d.k, n, &free_idx, &rest_idx);
    let u_r = vec![0.0; nr]; // no prescribed displacements
    let kfr_ur = mat_vec_rect(&k_fr, &u_r, nf, nr);
    let mut f_work = f_f_d.clone();
    for i in 0..nf { f_work[i] -= kfr_ur[i]; }

    let u_dense = {
        let mut k_work = k_ff_d.clone();
        match cholesky_solve(&mut k_work, &f_work, nf) {
            Some(u) => u,
            None => {
                let mut k_work = k_ff_d;
                let mut f_lu = f_work.clone();
                lu_solve(&mut k_work, &mut f_lu, nf).expect("Dense LU also failed")
            }
        }
    };

    // Direct sparse solve quality check: factorize sparse K_ff and solve
    let asm_s = assemble_sparse_3d(&input, &dof_num, false);
    let sym = symbolic_cholesky(&asm_s.k_ff);
    let num = numeric_cholesky(&sym, &asm_s.k_ff).expect("Sparse Cholesky should succeed");
    let f_s = asm_s.f[..nf].to_vec();
    let u_sparse_direct = dedaliano_engine::linalg::sparse_cholesky_solve(&num, &f_s);

    // Residual check: ||K_ff * u - f|| / ||f||
    let residual = asm_s.k_ff.sym_mat_vec(&u_sparse_direct);
    let mut res_norm = 0.0f64;
    let mut f_norm = 0.0f64;
    for i in 0..nf {
        res_norm += (residual[i] - f_s[i]).powi(2);
        f_norm += f_s[i].powi(2);
    }
    let rel_res = (res_norm / f_norm.max(1e-30)).sqrt();
    println!("Sparse solve relative residual: {:.6e}", rel_res);

    // Compare direct sparse solve with dense solve (use max displacement as scale)
    let max_disp = u_dense.iter().map(|v| v.abs()).fold(0.0f64, f64::max);
    let mut max_rel_err = 0.0f64;
    let mut worst_dof = 0;
    for i in 0..nf {
        let rel = (u_sparse_direct[i] - u_dense[i]).abs() / max_disp.max(1e-20);
        if rel > max_rel_err {
            max_rel_err = rel;
            worst_dof = i;
        }
    }
    println!("Direct sparse vs dense u_f: max_rel_err={:.6e} at dof {} (sparse={:.6e}, dense={:.6e}), max_disp={:.6e}",
        max_rel_err, worst_dof, u_sparse_direct[worst_dof], u_dense[worst_dof], max_disp);

    // Also compare solve_3d output
    let sparse_disps = &sparse_result.displacements;
    let mut max_rel_err_solve3d = 0.0f64;
    for disp in sparse_disps {
        for local_dof in 0..6 {
            if let Some(&global) = dof_num.map.get(&(disp.node_id, local_dof)) {
                if global < nf {
                    let sparse_val = match local_dof {
                        0 => disp.ux,
                        1 => disp.uy,
                        2 => disp.uz,
                        3 => disp.rx,
                        4 => disp.ry,
                        5 => disp.rz,
                        _ => 0.0,
                    };
                    let dense_val = u_dense[global];
                    let rel = (sparse_val - dense_val).abs() / max_disp.max(1e-20);
                    max_rel_err_solve3d = max_rel_err_solve3d.max(rel);
                }
            }
        }
    }
    println!("solve_3d vs dense: max_rel_err={:.6e}", max_rel_err_solve3d);

    assert!(
        max_rel_err < 1e-6,
        "Direct sparse vs dense max relative error = {:.2e} (exceeds 1e-6)",
        max_rel_err
    );
}

/// Diagnostic: check what happens to shell pivots and diagonal shifts.
#[test]
fn diagnose_shell_pivots() {
    let input = make_ss_plate(5, 5);
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let asm = assemble_sparse_3d(&input, &dof_num, false);

    // Check diagonal entries of K_ff
    let mut min_diag = f64::MAX;
    let mut max_diag = 0.0f64;
    let mut near_zero_count = 0;
    let mut negative_count = 0;
    let mut missing_diag_count = 0;
    for j in 0..nf {
        let mut found = false;
        for p in asm.k_ff.col_ptr[j]..asm.k_ff.col_ptr[j + 1] {
            if asm.k_ff.row_idx[p] == j {
                let d = asm.k_ff.values[p];
                if d < min_diag { min_diag = d; }
                if d > max_diag { max_diag = d; }
                if d.abs() / max_diag.max(1.0) < 1e-6 { near_zero_count += 1; }
                if d < 0.0 { negative_count += 1; }
                found = true;
                break;
            }
        }
        if !found { missing_diag_count += 1; }
    }
    println!("K_ff: nf={}, min_diag={:.6e}, max_diag={:.6e}", nf, min_diag, max_diag);
    println!("K_ff: min/max ratio={:.6e}, near_zero={}, negative={}, missing_diag={}",
        min_diag / max_diag, near_zero_count, negative_count, missing_diag_count);

    let sym = symbolic_cholesky(&asm.k_ff);
    println!("nnz_L={}, fill_ratio={:.1}", sym.l_nnz, sym.l_nnz as f64 / asm.k_ff.col_ptr[nf] as f64);

    let num = numeric_cholesky(&sym, &asm.k_ff);
    match &num {
        Some(n) => println!("Cholesky OK: perturbations={}, max_pert={:.2e}", n.pivot_perturbations, n.max_perturbation),
        None => println!("Cholesky FAILED (no shift)"),
    }

    // Try diagonal shifts
    for &alpha in &[1e-6, 1e-4, 1e-2, 1e-1, 1.0, 10.0, 100.0] {
        let shift = alpha * max_diag;
        let mut k_reg = asm.k_ff.clone();
        let mut applied = 0;
        for j in 0..nf {
            for p in k_reg.col_ptr[j]..k_reg.col_ptr[j + 1] {
                if k_reg.row_idx[p] == j {
                    k_reg.values[p] += shift;
                    applied += 1;
                    break;
                }
            }
        }
        let result = numeric_cholesky(&sym, &k_reg);
        match &result {
            Some(_) => println!("alpha={:.0e}: shift={:.2e}, applied={}/{} => OK", alpha, shift, applied, nf),
            None => println!("alpha={:.0e}: shift={:.2e}, applied={}/{} => FAILED", alpha, shift, applied, nf),
        }
    }

    // Also check: does dense Cholesky fail?
    let asm_d = assemble_3d(&input, &dof_num);
    let free_idx: Vec<usize> = (0..nf).collect();
    let mut k_ff_d = extract_submatrix(&asm_d.k, dof_num.n_total, &free_idx, &free_idx);
    let f_f_d = extract_subvec(&asm_d.f, &free_idx);
    let dense_chol = cholesky_solve(&mut k_ff_d, &f_f_d, nf);
    println!("Dense Cholesky: {}", if dense_chol.is_some() { "OK" } else { "FAILED" });

    // Dense Cholesky of the PERMUTED matrix PAP^T, to verify symbolic structure
    let k_ff_dense_full = extract_submatrix(&asm_d.k, dof_num.n_total, &free_idx, &free_idx);
    let perm = &sym.perm;
    let mut pap = vec![0.0f64; nf * nf];
    for i in 0..nf {
        for j in 0..nf {
            pap[i * nf + j] = k_ff_dense_full[perm[i] * nf + perm[j]];
        }
    }
    let mut pap_chol = pap.clone();
    let b_dummy = vec![1.0; nf];
    let pap_ok = cholesky_solve(&mut pap_chol, &b_dummy, nf);
    println!("Dense Cholesky of PAP^T: {}", if pap_ok.is_some() { "OK" } else { "FAILED" });

    // Count nonzeros in dense L factor of PAP^T
    if pap_ok.is_some() {
        // pap_chol now contains L in the lower triangle
        let mut dense_l_nnz = 0;
        for j in 0..nf {
            for i in j..nf {
                if pap_chol[i * nf + j].abs() > 1e-15 {
                    dense_l_nnz += 1;
                }
            }
        }
        println!("Dense L nnz (threshold 1e-15): {} vs sparse symbolic nnz_L: {}",
            dense_l_nnz, sym.l_nnz);

        // Check which entries in dense L are nonzero but missing from sparse structure
        let mut missing_count = 0;
        let mut max_missing_val = 0.0f64;
        for j in 0..nf {
            for i in (j+1)..nf {
                let dense_val = pap_chol[i * nf + j].abs();
                if dense_val > 1e-10 {
                    // Check if (i,j) is in sparse structure
                    let mut found = false;
                    for p in sym.l_col_ptr[j]..sym.l_col_ptr[j + 1] {
                        if sym.l_row_idx[p] == i {
                            found = true;
                            break;
                        }
                    }
                    if !found {
                        missing_count += 1;
                        max_missing_val = max_missing_val.max(dense_val);
                    }
                }
            }
        }
        println!("Missing from sparse structure: {} entries (max_val={:.6e})", missing_count, max_missing_val);
    }

    // Compare sparse vs dense K_ff: max absolute difference
    let k_ff_dense_full = extract_submatrix(&asm_d.k, dof_num.n_total, &free_idx, &free_idx);
    let mut max_diff = 0.0f64;
    let mut max_diff_ij = (0, 0);
    for j in 0..nf {
        for p in asm.k_ff.col_ptr[j]..asm.k_ff.col_ptr[j + 1] {
            let i = asm.k_ff.row_idx[p];
            let sparse_val = asm.k_ff.values[p];
            let dense_val = k_ff_dense_full[i * nf + j]; // lower triangle entry
            let diff = (sparse_val - dense_val).abs();
            if diff > max_diff {
                max_diff = diff;
                max_diff_ij = (i, j);
            }
        }
    }
    println!("Sparse vs Dense K_ff: max_diff={:.6e} at ({},{})", max_diff, max_diff_ij.0, max_diff_ij.1);

    // Check symmetry of sparse K_ff: for each (i,j) in lower tri, check if (j,i) exists
    let mut asym_count = 0;
    let mut max_asym = 0.0f64;
    for j in 0..nf {
        for p in asm.k_ff.col_ptr[j]..asm.k_ff.col_ptr[j + 1] {
            let i = asm.k_ff.row_idx[p];
            if i == j { continue; }
            // Find (j, i) in column i (i.e., row j in col i)
            let mut found = false;
            for q in asm.k_ff.col_ptr[i]..asm.k_ff.col_ptr[i + 1] {
                if asm.k_ff.row_idx[q] == j {
                    // This is K_ff stored as lower-tri CSC; (j,i) with j < i means
                    // we need to find entry at row j in column i. But in lower-tri,
                    // col i only has rows >= i, so row j < i won't exist.
                    found = true;
                    break;
                }
            }
            // In lower-triangular CSC, the (j,i) entry with j<i won't be stored.
            // Instead, check via the transposed entry in the dense matrix.
            let lower_val = asm.k_ff.values[p]; // K[i,j]
            let upper_val = k_ff_dense_full[j * nf + i]; // dense K[j,i]
            let diff = (lower_val - upper_val).abs();
            if diff > 1e-10 {
                asym_count += 1;
                max_asym = max_asym.max(diff);
            }
        }
    }
    println!("Sparse K[i,j] vs Dense K[j,i] asymmetry: count={}, max={:.6e}", asym_count, max_asym);
}
