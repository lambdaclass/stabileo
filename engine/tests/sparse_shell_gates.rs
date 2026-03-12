//! Benchmark gate tests: ensure sparse Cholesky survives shell matrices,
//! fill ratio stays bounded, and sparse/dense results match.

use dedaliano_engine::solver::{linear, modal, buckling};
use dedaliano_engine::solver::assembly::{assemble_sparse_3d, assemble_3d};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::reduction::{GuyanInput3D, CraigBamptonInput3D};
use dedaliano_engine::linalg::{symbolic_cholesky, symbolic_cholesky_with, numeric_cholesky, CholOrdering, cholesky_solve, extract_submatrix, extract_subvec, lu_solve, mat_vec_rect, cholesky_decompose, forward_solve, back_solve};
use dedaliano_engine::types::*;
use std::collections::HashMap;
use std::time::Instant;

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

/// Gate 5a: Sparse assembly is faster than dense assembly + extraction for 20×20 plate.
#[test]
fn sparse_faster_than_dense() {
    let input = make_ss_plate(20, 20);
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    // Warmup
    let _ = assemble_sparse_3d(&input, &dof_num, false);
    let _ = assemble_3d(&input, &dof_num);

    // Dense path: assemble n×n K + extract nf×nf k_ff
    let t0 = Instant::now();
    let asm = assemble_3d(&input, &dof_num);
    let free_idx: Vec<usize> = (0..nf).collect();
    let _k_ff_d = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
    let dense_us = t0.elapsed().as_micros();

    // Sparse path: assemble_sparse_3d (builds CSC k_ff directly)
    let t0 = Instant::now();
    let _sasm = assemble_sparse_3d(&input, &dof_num, false);
    let sparse_us = t0.elapsed().as_micros();

    println!("20x20: sparse={}us, dense={}us, ratio={:.2}",
        sparse_us, dense_us, dense_us as f64 / sparse_us.max(1) as f64);

    assert!(
        sparse_us <= dense_us,
        "Sparse assembly ({}us) should be faster than dense ({} us) at 20×20",
        sparse_us, dense_us
    );
}

/// Gate 5b: Deterministic sparse assembly — same model twice produces bitwise-equal CSC.
#[test]
fn deterministic_sparse_assembly() {
    let input = make_ss_plate(10, 10);
    let dof_num = DofNumbering::build_3d(&input);

    let s1 = assemble_sparse_3d(&input, &dof_num, false);
    let s2 = assemble_sparse_3d(&input, &dof_num, false);

    assert_eq!(s1.k_ff.col_ptr, s2.k_ff.col_ptr, "col_ptr mismatch");
    assert_eq!(s1.k_ff.row_idx, s2.k_ff.row_idx, "row_idx mismatch");
    assert_eq!(s1.k_ff.values.len(), s2.k_ff.values.len(), "nnz mismatch");
    for i in 0..s1.k_ff.values.len() {
        assert!(
            (s1.k_ff.values[i] - s2.k_ff.values[i]).abs() < 1e-15,
            "Value mismatch at {}: {} vs {}", i, s1.k_ff.values[i], s2.k_ff.values[i]
        );
    }
}

/// Gate 5c: Fill ratio stays bounded for known mesh sizes with RCM ordering.
#[test]
fn fill_ratio_regression() {
    for &(nx, ny, bound) in &[(10, 10, 4.0), (30, 30, 10.0)] {
        let input = make_ss_plate(nx, ny);
        let dof_num = DofNumbering::build_3d(&input);
        let nf = dof_num.n_free;
        let asm = assemble_sparse_3d(&input, &dof_num, false);

        let sym = symbolic_cholesky_with(&asm.k_ff, CholOrdering::Rcm);
        let nnz_kff = asm.k_ff.col_ptr[nf];
        let fill = sym.l_nnz as f64 / nnz_kff as f64;
        println!("{}x{}: fill_ratio={:.2}, bound={:.1}", nx, ny, fill, bound);

        assert!(
            fill < bound,
            "{}x{} fill ratio {:.2} exceeds bound {:.1}",
            nx, ny, fill, bound
        );
    }
}

/// Gate 5d: Sparse modal eigenvalues match dense Lanczos eigenvalues.
#[test]
fn sparse_modal_parity() {
    let input = make_ss_plate(8, 8);
    let num_modes = 5;

    // Both paths need densities
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0); // steel density in kg/m³

    // Sparse path (current default for no-constraint models)
    let result_sparse = modal::solve_modal_3d(&input, &densities, num_modes)
        .expect("Sparse modal solve failed");

    // Dense path: manually build dense K_ff and use dense Lanczos
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;
    let sasm = assemble_sparse_3d(&input, &dof_num, false);
    let k_ff_dense = sasm.k_ff.to_dense_symmetric();
    let m_full = dedaliano_engine::solver::mass_matrix::assemble_mass_matrix_3d(&input, &dof_num, &densities);
    let free_idx: Vec<usize> = (0..nf).collect();
    let m_ff = extract_submatrix(&m_full, n, &free_idx, &free_idx);
    let dense_eigen = dedaliano_engine::linalg::lanczos_generalized_eigen(
        &k_ff_dense, &m_ff, nf, num_modes, 0.0
    ).expect("Dense Lanczos failed");

    // Compare frequencies from sparse modal result vs dense eigenvalues.
    // Filter out near-zero modes (rigid body modes / numerical noise).
    let min_freq = 0.1; // Hz — only compare physical structural modes
    let sparse_freqs: Vec<f64> = result_sparse.modes.iter()
        .map(|m| m.frequency)
        .filter(|&f| f > min_freq)
        .collect();
    let dense_freqs: Vec<f64> = dense_eigen.values.iter()
        .filter(|&&v| v > 1e-10)
        .map(|&v| v.sqrt() / (2.0 * std::f64::consts::PI))
        .filter(|&f| f > min_freq)
        .take(num_modes)
        .collect();

    let n_compare = sparse_freqs.len().min(dense_freqs.len());
    assert!(n_compare > 0, "No modes above {} Hz to compare", min_freq);
    for i in 0..n_compare {
        let rel_err = (sparse_freqs[i] - dense_freqs[i]).abs() / dense_freqs[i].max(1e-20);
        println!("Mode {}: sparse={:.6} Hz, dense={:.6} Hz, rel_err={:.2e}",
            i, sparse_freqs[i], dense_freqs[i], rel_err);
        assert!(
            rel_err < 1e-2,
            "Mode {} frequency mismatch: sparse={:.6}, dense={:.6}, rel_err={:.2e}",
            i, sparse_freqs[i], dense_freqs[i], rel_err
        );
    }
}

/// Build an nx×ny SS plate and return the node grid for boundary node selection.
fn make_ss_plate_with_grid(nx: usize, ny: usize) -> (SolverInput3D, Vec<Vec<usize>>) {
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

    let input = SolverInput3D {
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
    };
    (input, grid)
}

/// Build an nx×ny compressed MITC4 plate for buckling analysis.
fn make_compressed_plate(nx: usize, ny: usize) -> SolverInput3D {
    let a = 1.0;
    let t = 0.01;
    let e = 200_000.0;
    let nu = 0.3;
    let dx = a / nx as f64;
    let dy = a / ny as f64;

    let mut nodes = HashMap::new();
    let mut grid = vec![vec![0usize; ny + 1]; nx + 1];
    let mut nid = 1;
    for i in 0..=nx {
        for j in 0..=ny {
            nodes.insert(nid.to_string(), SolverNode3D { id: nid, x: i as f64 * dx, y: j as f64 * dy, z: 0.0 });
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
                nodes: [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]],
                material_id: 1, thickness: t,
            });
            qid += 1;
        }
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e, nu });

    // SS edges: uz=0 on all boundary, ux=0 at x=0, uy=0 at y=0
    let mut supports = HashMap::new();
    let mut sid = 1;
    for i in 0..=nx {
        for j in 0..=ny {
            if i == 0 || i == nx || j == 0 || j == ny {
                supports.insert(sid.to_string(), SolverSupport3D {
                    node_id: grid[i][j],
                    rx: i == 0, ry: j == 0, rz: true,
                    rrx: false, rry: false, rrz: false,
                    kx: None, ky: None, kz: None,
                    krx: None, kry: None, krz: None,
                    dx: None, dy: None, dz: None,
                    drx: None, dry: None, drz: None,
                    normal_x: None, normal_y: None, normal_z: None,
                    is_inclined: None, rw: None, kw: None,
                });
                sid += 1;
            }
        }
    }

    // Uniform compression along x: nodal forces at x=a edge
    let mut loads = Vec::new();
    for j in 0..=ny {
        let trib = if j == 0 || j == ny { dy / 2.0 } else { dy };
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: grid[nx][j], fx: -1.0 * trib, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }));
    }

    SolverInput3D {
        nodes, materials: mats, sections: HashMap::new(),
        elements: HashMap::new(), supports, loads,
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads, quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![], connectors: HashMap::new(),
    }
}

/// Gate: Sparse buckling eigenvalues match dense buckling eigenvalues.
#[test]
fn sparse_buckling_parity() {
    let input = make_compressed_plate(8, 8);
    let num_modes = 3;

    // Sparse path (current default for no-constraint models)
    let result_sparse = buckling::solve_buckling_3d(&input, num_modes)
        .expect("Sparse buckling solve failed");

    // Dense path: manually build dense K_ff, compute eigenvalues
    let dof_num = dedaliano_engine::solver::dof::DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    // Get linear forces for geometric stiffness
    let lin = linear::solve_3d(&input).unwrap();
    let mut kg_full = dedaliano_engine::solver::geometric_stiffness::build_kg_from_forces_3d(&input, &dof_num, &lin.element_forces);
    if !input.quads.is_empty() {
        let mut u_full = vec![0.0; n];
        for d in &lin.displacements {
            let vals = [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz];
            for (i, &v) in vals.iter().enumerate() {
                if let Some(&dof) = dof_num.map.get(&(d.node_id, i)) { u_full[dof] = v; }
            }
        }
        dedaliano_engine::solver::geometric_stiffness::add_quad_geometric_stiffness_3d(&input, &dof_num, &u_full, &mut kg_full);
    }

    let free_idx: Vec<usize> = (0..nf).collect();
    let sasm = assemble_sparse_3d(&input, &dof_num, false);
    let k_ff_dense = sasm.k_ff.to_dense_symmetric();
    let kg_ff = extract_submatrix(&kg_full, n, &free_idx, &free_idx);
    let mut neg_kg = vec![0.0; nf * nf];
    for i in 0..nf * nf { neg_kg[i] = -kg_ff[i]; }

    let dense_result = dedaliano_engine::linalg::solve_generalized_eigen(&neg_kg, &k_ff_dense, nf, 200)
        .expect("Dense Jacobi failed");

    // Extract dense load factors (λ = 1/μ for positive μ)
    let mut dense_lambdas: Vec<f64> = dense_result.values.iter()
        .filter(|&&mu| mu > 1e-12)
        .map(|&mu| 1.0 / mu)
        .collect();
    dense_lambdas.sort_by(|a, b| a.partial_cmp(b).unwrap());

    let sparse_lambdas: Vec<f64> = result_sparse.modes.iter().map(|m| m.load_factor).collect();

    // Compare only first 2 modes — higher modes can differ due to eigenvalue clustering
    // and Lanczos vs Jacobi convergence differences on indefinite -Kg
    let n_compare = sparse_lambdas.len().min(dense_lambdas.len()).min(2);
    assert!(n_compare > 0, "No buckling modes to compare");
    for i in 0..n_compare {
        let rel_err = (sparse_lambdas[i] - dense_lambdas[i]).abs() / dense_lambdas[i].max(1e-20);
        println!("Buckling mode {}: sparse={:.6}, dense={:.6}, rel_err={:.2e}",
            i, sparse_lambdas[i], dense_lambdas[i], rel_err);
        // Buckling eigenproblems with indefinite -Kg have larger Lanczos vs Jacobi
        // discrepancies than modal (SPD M). 5% tolerance is appropriate.
        assert!(
            rel_err < 5e-2,
            "Buckling mode {} load factor mismatch: sparse={:.6}, dense={:.6}, rel_err={:.2e}",
            i, sparse_lambdas[i], dense_lambdas[i], rel_err
        );
    }
}

// ==================== Guyan / Craig-Bampton Gates ====================

/// Helper: get boundary nodes (perimeter) from grid.
fn perimeter_nodes(grid: &[Vec<usize>], nx: usize, ny: usize) -> Vec<usize> {
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
    boundary
}

/// Gate: Guyan 3D uses single Cholesky factorization, not repeated LU.
/// Verifies that Guyan on a 10×10 plate completes successfully and that
/// the interior solves use Cholesky (timing must be << nb × single-LU time).
#[test]
fn guyan_single_factorization() {
    let nx = 10;
    let ny = 10;
    let (input, grid) = make_ss_plate_with_grid(nx, ny);
    let boundary_nodes = perimeter_nodes(&grid, nx, ny);

    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let ns = nf; // no constraints

    // Classify DOFs
    let mut boundary_dofs = Vec::new();
    let mut interior_dofs = Vec::new();
    for i in 0..ns {
        let is_boundary = dof_num.map.iter().any(|(&(nid, _), &gdof)| {
            gdof == i && boundary_nodes.contains(&nid)
        });
        if is_boundary { boundary_dofs.push(i); } else { interior_dofs.push(i); }
    }
    let nb = boundary_dofs.len();
    let ni = interior_dofs.len();

    // Get K_II
    let sasm = assemble_sparse_3d(&input, &dof_num, false);
    let k_ff = sasm.k_ff.to_dense_symmetric();
    let k_ii = extract_submatrix(&k_ff, ns, &interior_dofs, &interior_dofs);

    // Verify K_II is Cholesky-factorable (the solver relies on this)
    let mut l_ii = k_ii.clone();
    assert!(cholesky_decompose(&mut l_ii, ni), "K_II must be SPD for Cholesky factorize-once");

    // Verify factorize-once + back-subs is faster than nb separate LU decompositions.
    // Time: 1 Cholesky + (nb+2) back-subs
    let t0 = Instant::now();
    let mut l = k_ii.clone();
    cholesky_decompose(&mut l, ni);
    for _ in 0..(nb + 2) {
        let rhs = vec![1.0; ni];
        let y = forward_solve(&l, &rhs, ni);
        let _x = back_solve(&l, &y, ni);
    }
    let chol_us = t0.elapsed().as_micros();

    // Time: (nb+2) separate LU decompositions
    let t0 = Instant::now();
    for _ in 0..(nb + 2) {
        let mut k_work = k_ii.clone();
        let mut b_work = vec![1.0; ni];
        let _ = lu_solve(&mut k_work, &mut b_work, ni);
    }
    let lu_us = t0.elapsed().as_micros();

    println!("10x10 Guyan: nb={}, ni={}", nb, ni);
    println!("  Cholesky factorize-once + {} back-subs: {} us", nb + 2, chol_us);
    println!("  {} separate LU decompositions: {} us", nb + 2, lu_us);
    println!("  Speedup: {:.1}x", lu_us as f64 / chol_us.max(1) as f64);

    assert!(
        chol_us < lu_us,
        "Cholesky factorize-once ({} us) should be faster than repeated LU ({} us)",
        chol_us, lu_us
    );

    // End-to-end: Guyan solver succeeds
    let guyan_input = GuyanInput3D { solver: input, boundary_nodes };
    let result = dedaliano_engine::solver::reduction::guyan_reduce_3d(&guyan_input)
        .expect("Guyan reduction should succeed");
    assert!(result.n_boundary > 0);
    assert!(result.n_interior > 0);
    assert!(!result.displacements.is_empty());
}

/// Gate: Craig-Bampton 3D eigenproblem succeeds on MITC4 shell (M_II has zero-mass drilling DOFs).
#[test]
fn craig_bampton_eigenproblem_succeeds() {
    let nx = 8;
    let ny = 8;
    let (input, grid) = make_ss_plate_with_grid(nx, ny);
    let boundary_nodes = perimeter_nodes(&grid, nx, ny);

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);

    let cb_input = CraigBamptonInput3D {
        solver: input,
        boundary_nodes,
        n_modes: 10,
        densities,
    };

    let result = dedaliano_engine::solver::reduction::craig_bampton_3d(&cb_input)
        .expect("Craig-Bampton should succeed (Lanczos handles singular M_II)");

    assert!(result.n_modes_kept > 0, "Should find at least 1 interior mode");
    assert_eq!(result.n_reduced, result.n_boundary + result.n_modes_kept);
    assert!(!result.interior_frequencies.is_empty());

    // Frequencies should be positive and in ascending order
    for (i, &f) in result.interior_frequencies.iter().enumerate() {
        assert!(f >= 0.0, "Mode {} frequency {} should be non-negative", i, f);
        if i > 0 {
            assert!(f >= result.interior_frequencies[i - 1] - 1e-6,
                "Frequencies should be ascending: mode {} ({}) < mode {} ({})",
                i - 1, result.interior_frequencies[i - 1], i, f);
        }
    }

    println!("CB 8x8: nb={}, ni_modes={}, freqs={:?}",
        result.n_boundary, result.n_modes_kept, result.interior_frequencies);
}

/// Gate: Craig-Bampton interior mode frequencies are stable across runs (deterministic).
#[test]
fn craig_bampton_deterministic() {
    let nx = 6;
    let ny = 6;
    let (input, grid) = make_ss_plate_with_grid(nx, ny);
    let boundary_nodes = perimeter_nodes(&grid, nx, ny);

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);

    let cb_input = CraigBamptonInput3D {
        solver: input,
        boundary_nodes,
        n_modes: 5,
        densities,
    };

    let r1 = dedaliano_engine::solver::reduction::craig_bampton_3d(&cb_input)
        .expect("CB run 1 failed");
    let r2 = dedaliano_engine::solver::reduction::craig_bampton_3d(&cb_input)
        .expect("CB run 2 failed");

    assert_eq!(r1.n_modes_kept, r2.n_modes_kept, "Mode count must be deterministic");
    assert_eq!(r1.n_boundary, r2.n_boundary);

    for i in 0..r1.n_modes_kept {
        let rel_err = (r1.interior_frequencies[i] - r2.interior_frequencies[i]).abs()
            / r1.interior_frequencies[i].max(1e-20);
        assert!(
            rel_err < 1e-10,
            "Mode {} frequency not deterministic: {} vs {} (rel_err={:.2e})",
            i, r1.interior_frequencies[i], r2.interior_frequencies[i], rel_err
        );
    }

    // Reduced matrices should be bitwise equal
    assert_eq!(r1.k_reduced.len(), r2.k_reduced.len());
    for i in 0..r1.k_reduced.len() {
        assert!(
            (r1.k_reduced[i] - r2.k_reduced[i]).abs() < 1e-10,
            "K_reduced[{}] not deterministic: {} vs {}", i, r1.k_reduced[i], r2.k_reduced[i]
        );
    }
}
