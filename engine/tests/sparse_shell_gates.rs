//! Benchmark gate tests: ensure sparse Cholesky survives shell matrices,
//! fill ratio stays bounded, and sparse/dense results match.

use dedaliano_engine::solver::{linear, modal, buckling};
use dedaliano_engine::solver::assembly::{assemble_sparse_3d, assemble_3d};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::reduction::{GuyanInput3D, CraigBamptonInput3D};
use dedaliano_engine::linalg::{symbolic_cholesky, symbolic_cholesky_with, numeric_cholesky, CholOrdering, cholesky_solve, extract_submatrix, extract_subvec, lu_solve, mat_vec_rect, cholesky_decompose, forward_solve, back_solve, pcg_solve, Ic0Preconditioner, JacobiPreconditioner, SsorPreconditioner, Preconditioner};
use dedaliano_engine::linalg::preconditioner::{MicPreconditioner, ShiftedIcPreconditioner};
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
        solver_options: None,
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
        t.dense_fallback_ms, 0.0,
        "Dense fallback triggered ({} ms) — sparse Cholesky should survive shell matrices",
        t.dense_fallback_ms
    );
    assert!(
        t.solve_ms > 0.0,
        "Sparse solve_ms is 0 — factorization may have failed"
    );
}

/// Gate 2: Fill ratio stays bounded with AMD ordering (the default).
#[test]
fn fill_ratio_below_threshold() {
    let input = make_ss_plate(50, 50);
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let asm = assemble_sparse_3d(&input, &dof_num, false);

    let sym = symbolic_cholesky_with(&asm.k_ff, CholOrdering::Amd);
    let nnz_kff = asm.k_ff.col_ptr[nf];
    let nnz_l = sym.l_nnz;
    let fill_ratio = nnz_l as f64 / nnz_kff as f64;

    assert!(
        fill_ratio < 50.0,
        "Fill ratio {:.1}× exceeds 50× threshold (nnz_L={}, nnz_Kff={})",
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
    let sym = std::rc::Rc::new(symbolic_cholesky(&asm_s.k_ff));
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

/// Measurement harness for Phase 3.1 (shifted-IC design input): sweeps a
/// global diagonal shift α·max_diag on the K_ff of SS MITC4 plates and checks
/// which α makes the strict IC(0) factorization succeed on the pattern, plus
/// the PCG iteration count when it does. Also reports Jacobi/SSOR convergence
/// for reference. Ignored by default — run manually with:
///   cargo test --release --test sparse_shell_gates diagnose_ic0_shift_sweep -- --ignored --nocapture
///
/// Measured 2026-09-22 (Apple M3, release): strict IC(0) needs α ≥ 1e-1 on
/// 10×10/20×20 and α ≥ 1e-2 on 30×30 to factorize at all; Jacobi/SSOR
/// appeared to stall from 20×20 up — later shown by `diagnose_pcg_stall_curve`
/// to be the fixed 50-iteration stagnation safeguard aborting legitimate slow
/// convergence, not divergence (fixed in `pcg_solve`: the stall window now
/// scales with √n). This harness fixed the Shifted-IC design (per-pivot
/// restore + optional small global shift) — see `diagnose_shifted_ic_sweep`
/// below for the per-pivot variant that this harness motivated.
#[test]
#[ignore]
fn diagnose_ic0_shift_sweep() {
    for &(nx, ny) in &[(10usize, 10usize), (20, 20), (30, 30)] {
        let input = make_ss_plate(nx, ny);
        let dof_num = DofNumbering::build_3d(&input);
        let nf = dof_num.n_free;
        let asm = assemble_sparse_3d(&input, &dof_num, false);
        let k_ff = &asm.k_ff;
        let f_f: Vec<f64> = asm.f[..nf].to_vec();
        let max_iter = 1000usize.max(nf / 4);
        let f_norm: f64 = f_f.iter().map(|v| v * v).sum::<f64>().sqrt();

        let mut max_diag = 0.0f64;
        for j in 0..nf {
            for p in k_ff.col_ptr[j]..k_ff.col_ptr[j + 1] {
                if k_ff.row_idx[p] == j {
                    max_diag = max_diag.max(k_ff.values[p]);
                    break;
                }
            }
        }
        println!("=== plate {}x{}: nf={}, nnz={}, max_diag={:.6e} ===", nx, ny, nf, k_ff.nnz(), max_diag);

        // Reference: Jacobi / SSOR on the unshifted matrix.
        let report = |name: &str, pre: &dyn dedaliano_engine::linalg::Preconditioner| {
            let res = pcg_solve(k_ff, &f_f, pre, 1e-8, max_iter);
            let ku = k_ff.sym_mat_vec(&res.x);
            let true_rel: f64 = ku.iter().zip(f_f.iter())
                .map(|(a, b)| (a - b).powi(2)).sum::<f64>().sqrt() / f_norm.max(1e-30);
            println!("  {}: converged={} iters={} true_rel={:.2e}", name, res.converged, res.iterations, true_rel);
        };
        if let Some(pre) = JacobiPreconditioner::new(k_ff) { report("jacobi", &pre); }
        if let Some(pre) = SsorPreconditioner::new(k_ff, 1.0) { report("ssor", &pre); }

        // Sweep α: shift the diagonal by α·max_diag, try strict IC(0).
        for &alpha in &[0.0, 1e-8, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1] {
            let shift = alpha * max_diag;
            let mut k_reg = k_ff.clone();
            if shift > 0.0 {
                for j in 0..nf {
                    for p in k_reg.col_ptr[j]..k_reg.col_ptr[j + 1] {
                        if k_reg.row_idx[p] == j {
                            k_reg.values[p] += shift;
                            break;
                        }
                    }
                }
            }
            match Ic0Preconditioner::new(&k_reg) {
                Some(pre) => {
                    let res = pcg_solve(&k_reg, &f_f, &pre, 1e-8, max_iter);
                    let ku = k_reg.sym_mat_vec(&res.x);
                    let true_rel: f64 = ku.iter().zip(f_f.iter())
                        .map(|(a, b)| (a - b).powi(2)).sum::<f64>().sqrt() / f_norm.max(1e-30);
                    println!(
                        "  alpha={:.0e} shift={:.2e}: IC0 OK, converged={} iters={} true_rel={:.2e}",
                        alpha, shift, res.converged, res.iterations, true_rel
                    );
                }
                None => println!("  alpha={:.0e} shift={:.2e}: IC0 FAILED", alpha, shift),
            }
        }
    }
}

/// Measurement harness for Phase 3.1/3.2 (default selection): runs PCG with
/// ShiftedIcPreconditioner across shift_rel values and with MicPreconditioner
/// on SS MITC4 plates, reporting restored pivots, iterations and the true
/// relative residual. The chosen production default is `ICS_SHIFT_REL` in
/// `solver/linear.rs`. Ignored by default — run manually with:
///   cargo test --release --test sparse_shell_gates diagnose_shifted_ic_sweep -- --ignored --nocapture
#[test]
#[ignore]
fn diagnose_shifted_ic_sweep() {
    for &(nx, ny) in &[(10usize, 10usize), (20, 20), (30, 30), (50, 50)] {
        let input = make_ss_plate(nx, ny);
        let dof_num = DofNumbering::build_3d(&input);
        let nf = dof_num.n_free;
        let asm = assemble_sparse_3d(&input, &dof_num, false);
        let k_ff = &asm.k_ff;
        let f_f: Vec<f64> = asm.f[..nf].to_vec();
        let max_iter = 1000usize.max(nf / 4);
        let f_norm: f64 = f_f.iter().map(|v| v * v).sum::<f64>().sqrt();
        println!("=== plate {}x{}: nf={}, nnz={} ===", nx, ny, nf, k_ff.nnz());

        for &shift_rel in &[0.0, 1e-6, 1e-4, 1e-3, 1e-2] {
            let pre = ShiftedIcPreconditioner::new(k_ff, shift_rel);
            let res = pcg_solve(k_ff, &f_f, &pre, 1e-8, max_iter);
            let ku = k_ff.sym_mat_vec(&res.x);
            let true_rel: f64 = ku.iter().zip(f_f.iter())
                .map(|(a, b)| (a - b).powi(2)).sum::<f64>().sqrt() / f_norm.max(1e-30);
            println!(
                "  ics shift_rel={:.0e}: perturbations={} converged={} iters={} true_rel={:.2e}",
                shift_rel, pre.perturbations(), res.converged, res.iterations, true_rel
            );
        }
        match MicPreconditioner::new(k_ff) {
            Some(pre) => {
                let res = pcg_solve(k_ff, &f_f, &pre, 1e-8, max_iter);
                let ku = k_ff.sym_mat_vec(&res.x);
                let true_rel: f64 = ku.iter().zip(f_f.iter())
                    .map(|(a, b)| (a - b).powi(2)).sum::<f64>().sqrt() / f_norm.max(1e-30);
                println!(
                    "  mic: converged={} iters={} true_rel={:.2e}",
                    res.converged, res.iterations, true_rel
                );
            }
            None => println!("  mic: BUILD FAILED (non-SPD pivot on pattern)"),
        }
    }
}

/// Debug harness (Phase 3.2): why does PCG abort with Shifted-IC on shells?
/// Prints the drilling diagonal scale, which DOFs get restored pivots, and
/// the magnitude of z = M⁻¹r after the first application.
#[test]
#[ignore]
fn diagnose_shifted_ic_breakdown() {
    let (nx, ny) = (10usize, 10usize);
    let input = make_ss_plate(nx, ny);
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let asm = assemble_sparse_3d(&input, &dof_num, false);
    let k_ff = &asm.k_ff;
    let f_f: Vec<f64> = asm.f[..nf].to_vec();

    // Diagonal stats per DOF-within-node (3D solids/shells: 6 dofs per node,
    // local_dof 5 = rz = drilling for flat plates in the XY plane).
    let mut max_diag = 0.0f64;
    let mut diag = vec![0.0f64; nf];
    for j in 0..nf {
        for p in k_ff.col_ptr[j]..k_ff.col_ptr[j + 1] {
            if k_ff.row_idx[p] == j {
                diag[j] = k_ff.values[p];
                max_diag = max_diag.max(k_ff.values[p]);
                break;
            }
        }
    }
    let mut per_slot: [usize; 6] = [0; 6];
    let mut min_slot: [f64; 6] = [f64::MAX; 6];
    let mut max_slot: [f64; 6] = [0.0; 6];
    for j in 0..nf {
        let s = j % 6;
        per_slot[s] += 1;
        min_slot[s] = min_slot[s].min(diag[j]);
        max_slot[s] = max_slot[s].max(diag[j]);
    }
    println!("nf={}, max_diag={:.3e}", nf, max_diag);
    for s in 0..6 {
        println!("  dof_slot {}: count={} min_diag={:.3e} max_diag={:.3e}", s, per_slot[s], min_slot[s], max_slot[s]);
    }

    let pre = ShiftedIcPreconditioner::new(k_ff, 0.0);
    println!("perturbations={}", pre.perturbations());

    let mut z = vec![0.0; nf];
    pre.apply(&f_f, &mut z);
    let rz: f64 = f_f.iter().zip(z.iter()).map(|(a, b)| a * b).sum();
    let z_max = z.iter().map(|v| v.abs()).fold(0.0f64, f64::max);
    let f_max = f_f.iter().map(|v| v.abs()).fold(0.0f64, f64::max);
    let z_nan = z.iter().filter(|v| !v.is_finite()).count();
    println!("first apply: r·z={:.6e}, |z|max={:.3e}, |f|max={:.3e}, non-finite z entries={}", rz, z_max, f_max, z_nan);
}

/// Experiment harness (Phase 3.2): which pivot-restore policy makes IC-family
/// preconditioners work on MITC4 shells? Restoring the original DOF diagonal
/// (production Cholesky heuristic) produces non-finite z = M⁻¹r on shells
/// (see `diagnose_shifted_ic_breakdown`) because hundreds of pivots degrade
/// without fill-in and the restored columns explode. This sweeps:
///   - restore-up: degraded pivot → restore_rel · max_diag (Ajiz-Jennings up)
///   - diag-scaled global shift: factorize K + alpha·diag(K) with strict IC(0)
/// Ignored by default — run manually with:
///   cargo test --release --test sparse_shell_gates diagnose_ic_restore_policy -- --ignored --nocapture
#[test]
#[ignore]
fn diagnose_ic_restore_policy() {
    /// Local IC(0) factorization with parameterized pivot restore policy.
    /// Returns (perturbations, iterations, converged, true_rel).
    fn ic0_restore_sweep(
        k_ff: &dedaliano_engine::linalg::CscMatrix,
        f_f: &[f64],
        shift_diag_rel: f64,   // global shift: diag += alpha·diag(K)
        restore_rel: f64,      // degraded pivot target = restore_rel · max_diag
    ) -> (usize, usize, bool, f64) {
        let n = k_ff.n;
        let mut a_diag = vec![0.0f64; n];
        let mut max_diag = 0.0f64;
        for j in 0..n {
            for k in k_ff.col_ptr[j]..k_ff.col_ptr[j + 1] {
                if k_ff.row_idx[k] == j {
                    a_diag[j] = k_ff.values[k];
                    max_diag = max_diag.max(k_ff.values[k]);
                    break;
                }
            }
        }
        let mut col_ptr = vec![0usize; n + 1];
        let mut row_idx = Vec::with_capacity(k_ff.nnz() + n);
        let mut l_values = Vec::with_capacity(k_ff.nnz() + n);
        for j in 0..n {
            col_ptr[j] = row_idx.len();
            row_idx.push(j);
            l_values.push(a_diag[j] * (1.0 + shift_diag_rel));
            for k in k_ff.col_ptr[j]..k_ff.col_ptr[j + 1] {
                let i = k_ff.row_idx[k];
                if i != j {
                    row_idx.push(i);
                    l_values.push(k_ff.values[k]);
                }
            }
            col_ptr[j + 1] = row_idx.len();
        }
        let mut nz_cols_for_row: Vec<Vec<(usize, usize)>> = vec![Vec::new(); n];
        for k in 0..n {
            for p in (col_ptr[k] + 1)..col_ptr[k + 1] {
                nz_cols_for_row[row_idx[p]].push((k, p));
            }
        }
        let soft = 1e-8 * max_diag;
        let restore_target = restore_rel * max_diag;
        let mut perturbations = 0usize;
        let mut pos_of = vec![usize::MAX; n];
        for j in 0..n {
            let (cs, ce) = (col_ptr[j], col_ptr[j + 1]);
            for p in cs..ce {
                pos_of[row_idx[p]] = p;
            }
            for &(k, pos_jk) in &nz_cols_for_row[j] {
                let ljk = l_values[pos_jk];
                if ljk == 0.0 {
                    continue;
                }
                for p in col_ptr[k]..col_ptr[k + 1] {
                    let slot = pos_of[row_idx[p]];
                    if slot != usize::MAX {
                        l_values[slot] -= ljk * l_values[p];
                    }
                }
            }
            let diag = l_values[cs];
            for p in cs..ce {
                pos_of[row_idx[p]] = usize::MAX;
            }
            let diag = if !diag.is_finite() || diag <= soft {
                perturbations += 1;
                restore_target
            } else {
                diag
            };
            let ljj = diag.sqrt();
            l_values[cs] = ljj;
            for v in &mut l_values[(cs + 1)..ce] {
                *v /= ljj;
            }
        }

        struct L {
            n: usize,
            col_ptr: Vec<usize>,
            row_idx: Vec<usize>,
            l_values: Vec<f64>,
        }
        impl Preconditioner for L {
            fn apply(&self, r: &[f64], z: &mut [f64]) {
                z.copy_from_slice(r);
                for j in 0..self.n {
                    let (cs, ce) = (self.col_ptr[j], self.col_ptr[j + 1]);
                    z[j] /= self.l_values[cs];
                    for p in (cs + 1)..ce {
                        z[self.row_idx[p]] -= self.l_values[p] * z[j];
                    }
                }
                for j in (0..self.n).rev() {
                    let (cs, ce) = (self.col_ptr[j], self.col_ptr[j + 1]);
                    let mut s = z[j];
                    for p in (cs + 1)..ce {
                        s -= self.l_values[p] * z[self.row_idx[p]];
                    }
                    z[j] = s / self.l_values[cs];
                }
            }
            fn name(&self) -> &'static str {
                "experiment"
            }
        }
        let pre = L { n, col_ptr, row_idx, l_values };
        // Instrument the first application: is M numerically SPD?
        let mut z0 = vec![0.0; n];
        pre.apply(f_f, &mut z0);
        let rz0: f64 = f_f.iter().zip(z0.iter()).map(|(a, b)| a * b).sum();
        let nf_z = z0.iter().filter(|v| !v.is_finite()).count();
        let z0_max = z0.iter().copied().filter(|v| v.is_finite()).fold(0.0f64, |m, v| m.max(v.abs()));
        println!(
            "    [probe] perturbations={} r·z={:.3e} nonfinite_z={} |z|max={:.3e}",
            perturbations, rz0, nf_z, z0_max
        );
        let max_iter = 1000usize.max(n / 4);
        let res = pcg_solve(k_ff, f_f, &pre, 1e-8, max_iter);
        let ku = k_ff.sym_mat_vec(&res.x);
        let f_norm: f64 = f_f.iter().map(|v| v * v).sum::<f64>().sqrt();
        let true_rel: f64 = ku.iter().zip(f_f.iter())
            .map(|(a, b)| (a - b).powi(2)).sum::<f64>().sqrt() / f_norm.max(1e-30);
        (perturbations, res.iterations, res.converged, true_rel)
    }

    for &(nx, ny) in &[(10usize, 10usize), (20, 20), (30, 30)] {
        let input = make_ss_plate(nx, ny);
        let dof_num = DofNumbering::build_3d(&input);
        let nf = dof_num.n_free;
        let asm = assemble_sparse_3d(&input, &dof_num, false);
        let f_f: Vec<f64> = asm.f[..nf].to_vec();
        println!("=== plate {}x{}: nf={} ===", nx, ny, nf);

        for &restore_rel in &[1e-2, 1e-1, 1.0] {
            let (pert, iters, conv, true_rel) =
                ic0_restore_sweep(&asm.k_ff, &f_f, 0.0, restore_rel);
            println!(
                "  restore-up {:.0e}: perturbations={} converged={} iters={} true_rel={:.2e}",
                restore_rel, pert, conv, iters, true_rel
            );
        }
        for &alpha in &[1e-4, 1e-3, 1e-2, 1e-1] {
            let (pert, iters, conv, true_rel) =
                ic0_restore_sweep(&asm.k_ff, &f_f, alpha, 1e-1);
            println!(
                "  diag-shift {:.0e} (+restore 1e-1): perturbations={} converged={} iters={} true_rel={:.2e}",
                alpha, pert, conv, iters, true_rel
            );
        }
    }
}

/// Experiment harness (Phase 3.2): does fill-reducing ordering rescue IC(0)
/// on MITC4 shells? IC(0) quality is ordering-sensitive; AMD reduces the
/// effective dropped fill. Factorizes the AMD-permuted K_ff with strict IC(0),
/// then Shifted-IC, and reports PCG convergence on the permuted system.
///   cargo test --release --test sparse_shell_gates diagnose_ic0_ordering -- --ignored --nocapture
#[test]
#[ignore]
fn diagnose_ic0_ordering() {
    for &(nx, ny) in &[(10usize, 10usize), (20, 20), (30, 30)] {
        let input = make_ss_plate(nx, ny);
        let dof_num = DofNumbering::build_3d(&input);
        let nf = dof_num.n_free;
        let asm = assemble_sparse_3d(&input, &dof_num, false);
        let k_ff = &asm.k_ff;
        let f_f: Vec<f64> = asm.f[..nf].to_vec();
        let f_norm: f64 = f_f.iter().map(|v| v * v).sum::<f64>().sqrt();
        let max_iter = 1000usize.max(nf / 4);
        println!("=== plate {}x{}: nf={} ===", nx, ny, nf);

        for ordering in [CholOrdering::Amd, CholOrdering::Rcm] {
            let sym = symbolic_cholesky_with(k_ff, ordering);
            let k_perm = k_ff.permute_symmetric(&sym.perm);
            let f_perm: Vec<f64> = (0..nf).map(|i| f_f[sym.perm[i]]).collect();
            let label = match ordering {
                CholOrdering::Amd => "amd",
                CholOrdering::Rcm => "rcm",
            };

            match Ic0Preconditioner::new(&k_perm) {
                Some(pre) => {
                    let res = pcg_solve(&k_perm, &f_perm, &pre, 1e-8, max_iter);
                    let ku = k_perm.sym_mat_vec(&res.x);
                    let true_rel: f64 = ku.iter().zip(f_perm.iter())
                        .map(|(a, b)| (a - b).powi(2)).sum::<f64>().sqrt() / f_norm.max(1e-30);
                    println!(
                        "  {} ic0: converged={} iters={} true_rel={:.2e}",
                        label, res.converged, res.iterations, true_rel
                    );
                }
                None => println!("  {} ic0: BUILD FAILED", label),
            }

            let pre = ShiftedIcPreconditioner::new(&k_perm, 0.0);
            let mut z0 = vec![0.0; nf];
            pre.apply(&f_perm, &mut z0);
            let nf_z = z0.iter().filter(|v| !v.is_finite()).count();
            let res = pcg_solve(&k_perm, &f_perm, &pre, 1e-8, max_iter);
            let ku = k_perm.sym_mat_vec(&res.x);
            let true_rel: f64 = ku.iter().zip(f_perm.iter())
                .map(|(a, b)| (a - b).powi(2)).sum::<f64>().sqrt() / f_norm.max(1e-30);
            println!(
                "  {} ics: perturbations={} nonfinite_z={} converged={} iters={} true_rel={:.2e}",
                label, pre.perturbations(), nf_z, res.converged, res.iterations, true_rel
            );
        }
    }
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

    let sym = std::rc::Rc::new(symbolic_cholesky(&asm.k_ff));
    println!("nnz_L={}, fill_ratio={:.1}", sym.l_nnz, sym.l_nnz as f64 / asm.k_ff.col_ptr[nf] as f64);

    let num = numeric_cholesky(&sym, &asm.k_ff);
    match &num {
        Some(_) => println!("Cholesky OK (strict, no shift)"),
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
            let mut _found = false;
            for q in asm.k_ff.col_ptr[i]..asm.k_ff.col_ptr[i + 1] {
                if asm.k_ff.row_idx[q] == j {
                    _found = true;
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
// Wall-clock timing test — run manually or in perf gates, not default CI
#[test]
#[ignore]
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

/// Gate 5c: Fill ratio stays bounded for known mesh sizes with AMD ordering (the default).
#[test]
fn fill_ratio_regression() {
    for &(nx, ny, bound) in &[(10, 10, 3.5), (30, 30, 6.5)] {
        let input = make_ss_plate(nx, ny);
        let dof_num = DofNumbering::build_3d(&input);
        let nf = dof_num.n_free;
        let asm = assemble_sparse_3d(&input, &dof_num, false);

        let sym = symbolic_cholesky_with(&asm.k_ff, CholOrdering::Amd);
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

/// Gate: Harmonic modal path matches direct path within tolerance.
#[test]
fn harmonic_modal_parity() {
    let nx = 8;
    let ny = 8;
    let damping_ratio = 0.05;
    let n_freq = 20;

    let input = make_ss_plate(nx, ny);
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);

    // Pick center node
    let center_node = ((nx / 2) * (ny + 1) + ny / 2) + 1;

    let frequencies: Vec<f64> = (0..n_freq)
        .map(|i| 0.5 + 99.5 * i as f64 / (n_freq - 1) as f64)
        .collect();

    // Build matrices
    let sasm = assemble_sparse_3d(&input, &dof_num, false);
    let k_ff = sasm.k_ff.to_dense_symmetric();
    let f_ff: Vec<f64> = sasm.f[..nf].to_vec();
    let m_full = dedaliano_engine::solver::mass_matrix::assemble_mass_matrix_3d(&input, &dof_num, &densities);
    let free_idx: Vec<usize> = (0..nf).collect();
    let m_ff = extract_submatrix(&m_full, n, &free_idx, &free_idx);

    // Get target DOF for z at center node
    let target_dof = *dof_num.map.get(&(center_node, 2)).expect("Center node z DOF not found");
    assert!(target_dof < nf, "Target DOF is restrained");

    // === Modal path (what solve_harmonic_3d now uses) ===
    let harmonic_input = dedaliano_engine::solver::harmonic::HarmonicInput3D {
        solver: input,
        densities: densities.clone(),
        frequencies: frequencies.clone(),
        damping_ratio,
        response_node_id: center_node,
        response_dof: "z".to_string(),
    };
    let modal_result = dedaliano_engine::solver::harmonic::solve_harmonic_3d(&harmonic_input)
        .expect("Harmonic modal solve failed");

    // === Direct path (explicit block LU per frequency) ===
    let ns = nf; // no constraints
    let (a0, a1) = {
        let eigen = dedaliano_engine::linalg::lanczos_generalized_eigen(&k_ff, &m_ff, ns, 2, 0.0);
        if let Some(ref res) = eigen {
            let positive: Vec<f64> = res.values.iter().copied().filter(|&v| v > 1e-10).collect();
            if positive.len() >= 2 {
                dedaliano_engine::solver::damping::rayleigh_coefficients(positive[0].sqrt(), positive[1].sqrt(), damping_ratio)
            } else {
                (0.0, 0.0)
            }
        } else {
            (0.0, 0.0)
        }
    };
    let c_s = dedaliano_engine::solver::damping::rayleigh_damping_matrix(&m_ff, &k_ff, ns, a0, a1);

    let mut direct_amps = Vec::new();
    let mut direct_peak_amp = 0.0f64;
    let mut direct_peak_freq = 0.0f64;
    for &freq in &frequencies {
        let omega = 2.0 * std::f64::consts::PI * freq;
        let (u_real, u_imag) = dedaliano_engine::solver::harmonic::solve_complex_system(
            &k_ff, &m_ff, &c_s, &f_ff, ns, omega,
        ).expect("Direct solve failed");
        let re = u_real[target_dof];
        let im = u_imag[target_dof];
        let amp = (re * re + im * im).sqrt();
        if amp > direct_peak_amp {
            direct_peak_amp = amp;
            direct_peak_freq = freq;
        }
        direct_amps.push(amp);
    }

    // Compare peak frequency
    let peak_freq_err = (modal_result.peak_frequency - direct_peak_freq).abs()
        / direct_peak_freq.max(1e-20);
    println!("Peak freq: modal={:.4} Hz, direct={:.4} Hz, rel_err={:.2e}",
        modal_result.peak_frequency, direct_peak_freq, peak_freq_err);

    // Compare amplitude at each frequency using absolute-or-relative check.
    // Modal truncation is accurate near resonances but loses accuracy at high
    // frequencies where amplitudes are very small — use peak amplitude as scale.
    let scale = direct_peak_amp.max(1e-30);
    let mut max_norm_err = 0.0f64;
    for (i, &freq) in frequencies.iter().enumerate() {
        let modal_amp = modal_result.response_points[i].amplitude;
        let direct_amp = direct_amps[i];
        let abs_err = (modal_amp - direct_amp).abs();
        // Normalized error: absolute difference / peak amplitude
        let norm_err = abs_err / scale;
        if norm_err > max_norm_err {
            max_norm_err = norm_err;
        }
        if norm_err > 0.01 {
            println!("  freq={:.2} Hz: modal={:.6e}, direct={:.6e}, norm_err={:.2e}",
                freq, modal_amp, direct_amp, norm_err);
        }
    }
    println!("Max normalized error (vs peak): {:.2e}", max_norm_err);

    // 5% of peak amplitude is a tight enough tolerance for modal superposition
    assert!(
        max_norm_err < 0.05,
        "Modal vs direct max normalized error = {:.2e} (exceeds 5% of peak)",
        max_norm_err
    );
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
        solver_options: None,
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
        solver_options: None,
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
    let mut kg = dedaliano_engine::solver::geometric_stiffness::build_kg_from_forces_3d(&input, &dof_num, &lin.element_forces);
    if !input.quads.is_empty() {
        let mut u_full = vec![0.0; n];
        for d in &lin.displacements {
            let vals = [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz];
            for (i, &v) in vals.iter().enumerate() {
                if let Some(&dof) = dof_num.map.get(&(d.node_id, i)) { u_full[dof] = v; }
            }
        }
        dedaliano_engine::solver::geometric_stiffness::add_quad_geometric_stiffness_3d(&input, &dof_num, &u_full, &mut kg);
    }

    let sasm = assemble_sparse_3d(&input, &dof_num, false);
    let k_ff_dense = sasm.k_ff.to_dense_symmetric();
    // Kg triplets cover the free block directly; densify for the Jacobi reference.
    let kg_ff = kg.into_csc().to_dense_symmetric();
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

// ==================== Buckling Runtime Gate ====================

/// Gate: sparse buckling should complete in reasonable time on a 10×10 plate.
/// This measures end-to-end buckling solve time (including linear pre-solve for Kg).
#[test]
fn sparse_buckling_runtime() {
    let input = make_compressed_plate(10, 10);

    // Warmup
    let _ = buckling::solve_buckling_3d(&input, 3);

    let t0 = Instant::now();
    let result = buckling::solve_buckling_3d(&input, 3)
        .expect("Sparse buckling solve failed");
    let elapsed_ms = t0.elapsed().as_millis();

    println!("10x10 compressed plate: buckling in {}ms, {} modes",
        elapsed_ms, result.modes.len());

    // Generous bound — catches catastrophic regression, not tight perf gate
    // On Apple M1 this is typically <500ms.
    assert!(
        elapsed_ms < 15000,
        "Buckling solve too slow: {}ms on 10×10 plate", elapsed_ms
    );
    assert!(result.modes.len() >= 3, "Should find at least 3 buckling modes");
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
// Wall-clock timing test — run manually or in perf gates, not default CI
#[test]
#[ignore]
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

/// Gate: Guyan 3D displacements match full linear solve (mathematically exact for static).
#[test]
fn guyan_3d_vs_linear_parity() {
    let nx = 8;
    let ny = 8;
    let (input, grid) = make_ss_plate_with_grid(nx, ny);
    let boundary_nodes = perimeter_nodes(&grid, nx, ny);

    // Full linear solve
    let linear_result = linear::solve_3d(&input).expect("Linear solve failed");

    // Guyan reduction
    let guyan_input = GuyanInput3D { solver: input, boundary_nodes };
    let guyan_result = dedaliano_engine::solver::reduction::guyan_reduce_3d(&guyan_input)
        .expect("Guyan reduction failed");

    // Compare displacements: Guyan should be exact for static problems
    assert_eq!(
        guyan_result.displacements.len(), linear_result.displacements.len(),
        "Displacement count mismatch"
    );

    let mut max_rel_err = 0.0f64;
    let max_disp = linear_result.displacements.iter()
        .flat_map(|d| vec![d.ux.abs(), d.uy.abs(), d.uz.abs(), d.rx.abs(), d.ry.abs(), d.rz.abs()])
        .fold(0.0f64, f64::max);

    for ld in &linear_result.displacements {
        let gd = guyan_result.displacements.iter()
            .find(|d| d.node_id == ld.node_id)
            .expect(&format!("Missing node {} in Guyan result", ld.node_id));

        for &(lv, gv, _name) in &[
            (ld.ux, gd.ux, "ux"), (ld.uy, gd.uy, "uy"), (ld.uz, gd.uz, "uz"),
            (ld.rx, gd.rx, "rx"), (ld.ry, gd.ry, "ry"), (ld.rz, gd.rz, "rz"),
        ] {
            let err = (lv - gv).abs() / max_disp.max(1e-20);
            if err > max_rel_err {
                max_rel_err = err;
            }
        }
    }

    println!("Guyan 3D vs linear: max_rel_err={:.2e}, max_disp={:.6e}", max_rel_err, max_disp);

    assert!(
        max_rel_err < 1e-6,
        "Guyan 3D vs linear parity: max relative error {:.2e} exceeds 1e-6",
        max_rel_err
    );

    // Verify the result has proper 3D displacement fields (uz should be nonzero for a plate)
    let max_uz = guyan_result.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0f64, f64::max);
    assert!(
        max_uz > 1e-10,
        "Guyan 3D uz should be nonzero for a loaded plate (max_uz={:.6e})",
        max_uz
    );
}

/// Measurement (Phase 3.4, ITERATIVE_THRESHOLD decision): end-to-end cost of
/// the auto-mode PCG attempt vs direct on SS plates. After the preconditioner
/// investigation of 2026-09-22 (size-scaled stall window), auto CONVERGES via
/// PCG-Jacobi on ≥20×20 shells: measured −71% (20×20), −75% (30×30) and −85%
/// (50×50) end-to-end vs direct. The 10×10 row stays direct (nf=684 <
/// threshold).
///   cargo test --release --test sparse_shell_gates diagnose_pcg_attempt_overhead -- --ignored --nocapture
#[test]
#[ignore]
fn diagnose_pcg_attempt_overhead() {
    for &(nx, ny) in &[(10usize, 10usize), (20, 20), (30, 30), (50, 50)] {
        let timed = |method: Option<&str>| -> (f64, String) {
            let mut input = make_ss_plate(nx, ny);
            if let Some(m) = method {
                input.solver_options = Some(SolverOptions {
                    method: Some(m.to_string()),
                    preconditioner: None,
                    tolerance: None,
                    max_iterations: None,
                });
            }
            // Warmup
            let _ = linear::solve_3d(&input).unwrap();
            let t0 = Instant::now();
            let r = linear::solve_3d(&input).unwrap();
            let ms = t0.elapsed().as_secs_f64() * 1000.0;
            (ms, r.solver_run_meta.as_ref().unwrap().solver_path.clone())
        };
        let (auto_ms, auto_path) = timed(None);
        let (direct_ms, direct_path) = timed(Some("direct"));
        let overhead_pct = (auto_ms - direct_ms) / direct_ms.max(1e-9) * 100.0;
        println!(
            "plate {}x{}: auto={:.1}ms ({}) direct={:.1}ms ({}) overhead={:+.1}%",
            nx, ny, auto_ms, auto_path, direct_ms, direct_path, overhead_pct
        );
    }
}

// ==================== PCG Preconditioner Investigation (2026-09-22) ====================

/// Local symmetric scaling B = S A S (S = diag(s)) for the equilibration
/// experiments below. Deliberately NOT production code: measured neutral on
/// MITC4 shells (see `diagnose_precond_sweep` results in the investigation
/// report — PCG-Jacobi on the scaled matrix is mathematically the same
/// iteration as Jacobi on the original).
fn symmetric_scale_local(a: &dedaliano_engine::linalg::CscMatrix, s: &[f64]) -> dedaliano_engine::linalg::CscMatrix {
    let mut out = a.clone();
    for j in 0..a.n {
        for k in a.col_ptr[j]..a.col_ptr[j + 1] {
            out.values[k] = a.values[k] * s[a.row_idx[k]] * s[j];
        }
    }
    out
}

/// Local nodal block-Jacobi (dense Cholesky per contiguous DOF block with a
/// 1e-12 relative pivot floor), for the H3/H5 experiments. Deliberately NOT
/// production code: measured neutral vs point-Jacobi on MITC4 shells (same
/// iteration count, ~1.5× per-iteration cost), so it was not promoted.
struct LocalBlockJacobi {
    bounds: Vec<usize>,
    factors: Vec<f64>,
    factor_offsets: Vec<usize>,
}

impl LocalBlockJacobi {
    fn new(a: &dedaliano_engine::linalg::CscMatrix, bounds: &[usize]) -> Option<Self> {
        if bounds.len() < 2 || bounds[0] != 0 || bounds[bounds.len() - 1] != a.n {
            return None;
        }
        let n_blocks = bounds.len() - 1;
        let mut factors = Vec::new();
        let mut factor_offsets = vec![0usize];
        for b in 0..n_blocks {
            let (s, e) = (bounds[b], bounds[b + 1]);
            let m = e - s;
            if m == 0 || m > 8 {
                return None;
            }
            let mut blk = vec![0.0; m * m];
            let mut max_diag = 0.0f64;
            for j in s..e {
                for k in a.col_ptr[j]..a.col_ptr[j + 1] {
                    let i = a.row_idx[k];
                    if i >= s && i < e {
                        blk[(i - s) * m + (j - s)] = a.values[k];
                        if i == j {
                            max_diag = max_diag.max(a.values[k]);
                        }
                    }
                }
            }
            let floor = 1e-12 * max_diag.max(1.0);
            for j in 0..m {
                for k in 0..j {
                    let mut l_jk = blk[j * m + k];
                    for p in 0..k {
                        l_jk -= blk[j * m + p] * blk[k * m + p];
                    }
                    blk[j * m + k] = l_jk / blk[k * m + k];
                }
                let mut d = blk[j * m + j];
                for p in 0..j {
                    d -= blk[j * m + p] * blk[j * m + p];
                }
                blk[j * m + j] = if !d.is_finite() || d <= floor { floor } else { d }.sqrt();
            }
            factors.extend_from_slice(&blk);
            factor_offsets.push(factors.len());
        }
        Some(Self { bounds: bounds.to_vec(), factors, factor_offsets })
    }
}

impl Preconditioner for LocalBlockJacobi {
    fn apply(&self, r: &[f64], z: &mut [f64]) {
        for b in 0..self.bounds.len() - 1 {
            let (s, e) = (self.bounds[b], self.bounds[b + 1]);
            let m = e - s;
            let l = &self.factors[self.factor_offsets[b]..self.factor_offsets[b + 1]];
            for i in 0..m {
                let mut acc = r[s + i];
                for j in 0..i {
                    acc -= l[i * m + j] * z[s + j];
                }
                z[s + i] = acc / l[i * m + i];
            }
            for i in (0..m).rev() {
                let mut acc = z[s + i];
                for j in (i + 1)..m {
                    acc -= l[j * m + i] * z[s + j];
                }
                z[s + i] = acc / l[i * m + i];
            }
        }
    }
    fn name(&self) -> &'static str {
        "bjacobi-local"
    }
}

/// Block boundaries of the free DOFs grouped by node. Free-DOF numbering is
/// node-major (`solver::dof::DofNumbering::build_3d` iterates sorted node ids
/// and, per node, local DOFs 0..dofs_per_node pushing free ones first), so
/// each node's free DOFs form one contiguous ascending range.
fn free_node_block_bounds(dof_num: &DofNumbering, nf: usize) -> Vec<usize> {
    let mut bounds = vec![0usize];
    let mut count = 0usize;
    for &nid in &dof_num.node_order {
        let before = count;
        for ld in 0..dof_num.dofs_per_node {
            if let Some(&d) = dof_num.map.get(&(nid, ld)) {
                if d < nf {
                    assert_eq!(d, count, "free DOF numbering is not node-contiguous");
                    count += 1;
                }
            }
        }
        if count > before {
            bounds.push(count);
        }
    }
    assert_eq!(count, nf);
    bounds
}

/// Instrumented PCG identical to `linalg::pcg::pcg_solve` but WITHOUT the
/// stagnation safeguard, logging ‖r‖/‖b‖ every `log_every` iterations.
/// Diagnostic only — answers "is the observed Jacobi/SSOR stall a divergence
/// or slow convergence the safeguard aborts?".
fn pcg_trace_no_guard(
    a: &dedaliano_engine::linalg::CscMatrix,
    b: &[f64],
    pre: &dyn Preconditioner,
    tol: f64,
    max_iter: usize,
    log_every: usize,
) -> (dedaliano_engine::linalg::PcgResult, Vec<(usize, f64)>) {
    let n = a.n;
    let bnorm: f64 = b.iter().map(|v| v * v).sum::<f64>().sqrt();
    let mut x = vec![0.0; n];
    let mut r = b.to_vec();
    let mut z = vec![0.0; n];
    let mut p = vec![0.0; n];
    let mut trace = Vec::new();

    pre.apply(&r, &mut z);
    let mut rz: f64 = r.iter().zip(z.iter()).map(|(ri, zi)| ri * zi).sum();
    if !rz.is_finite() || rz <= 0.0 {
        return (
            dedaliano_engine::linalg::PcgResult { x, iterations: 0, final_rel_residual: 1.0, converged: false },
            trace,
        );
    }
    p.copy_from_slice(&z);

    let mut iterations = 0;
    let mut final_rel = 1.0;
    let mut converged = false;

    for iter in 0..max_iter {
        let ap = a.sym_mat_vec(&p);
        let pap: f64 = p.iter().zip(ap.iter()).map(|(pi, api)| pi * api).sum();
        if !pap.is_finite() || pap <= 0.0 {
            println!("  [trace] BREAKDOWN at iter {}: pᵀAp={:.3e}", iter, pap);
            break;
        }
        let alpha = rz / pap;
        for ((x_i, r_i), (p_i, ap_i)) in x.iter_mut().zip(r.iter_mut()).zip(p.iter().zip(ap.iter())) {
            *x_i += alpha * p_i;
            *r_i -= alpha * ap_i;
        }
        iterations = iter + 1;
        let rnorm: f64 = r.iter().map(|v| v * v).sum::<f64>().sqrt();
        let rel = rnorm / bnorm;
        final_rel = rel;
        if iter % log_every == 0 || rel <= tol {
            trace.push((iterations, rel));
        }
        if rel <= tol {
            converged = true;
            break;
        }
        pre.apply(&r, &mut z);
        let rz_new: f64 = r.iter().zip(z.iter()).map(|(ri, zi)| ri * zi).sum();
        if !rz_new.is_finite() || rz_new <= 0.0 {
            println!("  [trace] BREAKDOWN at iter {}: rᵀz={:.3e}", iter, rz_new);
            break;
        }
        let beta = rz_new / rz;
        rz = rz_new;
        for (p_i, z_i) in p.iter_mut().zip(z.iter()) {
            *p_i = z_i + beta * *p_i;
        }
    }
    (
        dedaliano_engine::linalg::PcgResult { x, iterations, final_rel_residual: final_rel, converged },
        trace,
    )
}

/// H1: is the Jacobi/SSOR "stall" on ≥20×20 plates divergence, or slow
/// convergence that the 50-iteration stagnation safeguard aborts? Runs the
/// production PCG recurrence without the safeguard and prints the residual
/// curve plus an asymptotic rate / κ(M⁻¹K) estimate.
///
/// Measured 2026-09-22 (Apple M3, release): SLOW CONVERGENCE, not divergence.
/// Jacobi converges (tol 1e-8) on every size once the safeguard is removed —
/// 10×10: 109 iters, 20×20: 235 (with ‖r‖/‖b‖ climbing to ≈11 around iter
/// 100 before collapsing — CG's 2-norm residual is not monotone), 30×30: 338,
/// 50×50: 495. This motivated the size-scaled stall window in `pcg_solve`.
///   cargo test --release --test sparse_shell_gates diagnose_pcg_stall_curve -- --ignored --nocapture
#[test]
#[ignore]
fn diagnose_pcg_stall_curve() {
    for &(nx, ny) in &[(10usize, 10usize), (20, 20), (30, 30), (50, 50)] {
        let input = make_ss_plate(nx, ny);
        let dof_num = DofNumbering::build_3d(&input);
        let nf = dof_num.n_free;
        let asm = assemble_sparse_3d(&input, &dof_num, false);
        let k_ff = &asm.k_ff;
        let f_f: Vec<f64> = asm.f[..nf].to_vec();
        println!("=== plate {}x{}: nf={}, nnz={} ===", nx, ny, nf, k_ff.nnz());

        for which in ["jacobi", "ssor"] {
            let pre: Box<dyn Preconditioner> = match which {
                "jacobi" => Box::new(JacobiPreconditioner::new(k_ff).unwrap()),
                _ => Box::new(SsorPreconditioner::new(k_ff, 1.0).unwrap()),
            };
            let t0 = Instant::now();
            let (res, trace) = pcg_trace_no_guard(k_ff, &f_f, pre.as_ref(), 1e-8, 20000, 500);
            let ms = t0.elapsed().as_secs_f64() * 1000.0;
            println!(
                "  {}: converged={} iters={} final_rel={:.3e} time={:.1}ms",
                which, res.converged, res.iterations, res.final_rel_residual, ms
            );
            for &(it, rel) in &trace {
                println!("    iter {:>5}: rel={:.6e}", it, rel);
            }
            // Asymptotic rate from the last quarter of the trace:
            // r per iter, κ(M⁻¹K) ≈ ((1+r)/(1-r))² (CG worst-case bound).
            if trace.len() >= 4 {
                let q = trace.len() * 3 / 4;
                let (i0, r0) = trace[q];
                let (i1, r1) = trace[trace.len() - 1];
                if r1 > 0.0 && r1 < r0 && i1 > i0 {
                    let rate = (r1 / r0).powf(1.0 / (i1 - i0) as f64);
                    let kappa = ((1.0 + rate) / (1.0 - rate)).powi(2);
                    println!(
                        "    asymptotic rate/iter={:.6} over iters {}..{} → κ(M⁻¹K) ≈ {:.3e}",
                        rate, i0, i1, kappa
                    );
                }
            }
        }
    }
}

/// H1b: plateau length under the production stagnation criterion — the max
/// run of consecutive iterations without improving the best residual by the
/// 0.99 factor. Grounds the size-scaled stall limit in `pcg_solve`: a fixed
/// 50-iteration window aborts legitimate convergence (measured plateaus:
/// Jacobi 164 @ 20×20, 272 @ 30×30, 426 @ 50×50, 527 @ 70×70 — ≈ 3.2·√nf).
///   cargo test --release --test sparse_shell_gates diagnose_pcg_plateau_length -- --ignored --nocapture
#[test]
#[ignore]
fn diagnose_pcg_plateau_length() {
    for &(nx, ny) in &[(10usize, 10usize), (20, 20), (30, 30), (50, 50), (70, 70)] {
        let input = make_ss_plate(nx, ny);
        let dof_num = DofNumbering::build_3d(&input);
        let nf = dof_num.n_free;
        let asm = assemble_sparse_3d(&input, &dof_num, false);
        let k_ff = &asm.k_ff;
        let f_f: Vec<f64> = asm.f[..nf].to_vec();

        for which in ["jacobi", "ssor"] {
            let pre: Box<dyn Preconditioner> = match which {
                "jacobi" => Box::new(JacobiPreconditioner::new(k_ff).unwrap()),
                _ => Box::new(SsorPreconditioner::new(k_ff, 1.0).unwrap()),
            };
            // Manual PCG tracking the production stall counters (0.99 factor).
            let n = k_ff.n;
            let bnorm: f64 = f_f.iter().map(|v| v * v).sum::<f64>().sqrt();
            let mut x = vec![0.0; n];
            let mut r = f_f.clone();
            let mut z = vec![0.0; n];
            let mut p = vec![0.0; n];
            pre.apply(&r, &mut z);
            let mut rz: f64 = r.iter().zip(z.iter()).map(|(a, b)| a * b).sum();
            p.copy_from_slice(&z);
            let mut best_rel = 1.0f64;
            let mut stall = 0usize;
            let mut max_stall = 0usize;
            let mut iters = 0usize;
            let mut converged = false;
            for _ in 0..20000 {
                let ap = k_ff.sym_mat_vec(&p);
                let pap: f64 = p.iter().zip(ap.iter()).map(|(a, b)| a * b).sum();
                let alpha = rz / pap;
                for ((x_i, r_i), (p_i, ap_i)) in
                    x.iter_mut().zip(r.iter_mut()).zip(p.iter().zip(ap.iter()))
                {
                    *x_i += alpha * p_i;
                    *r_i -= alpha * ap_i;
                }
                iters += 1;
                let rel = r.iter().map(|v| v * v).sum::<f64>().sqrt() / bnorm;
                if rel <= 1e-8 {
                    converged = true;
                    break;
                }
                if rel < 0.99 * best_rel {
                    best_rel = rel;
                    stall = 0;
                } else {
                    stall += 1;
                    max_stall = max_stall.max(stall);
                }
                pre.apply(&r, &mut z);
                let rz_new: f64 = r.iter().zip(z.iter()).map(|(a, b)| a * b).sum();
                let beta = rz_new / rz;
                rz = rz_new;
                for (p_i, z_i) in p.iter_mut().zip(z.iter()) {
                    *p_i = z_i + beta * *p_i;
                }
            }
            println!(
                "  {}x{} {}: converged={} iters={} max_stall_run={} (prod stall limit now max(50, 8·√n))",
                nx, ny, which, converged, iters, max_stall
            );
        }
    }
}

/// H2/H3/H5: symmetric diagonal equilibration (D⁻¹ᐟ²KD⁻¹ᐟ²) and nodal
/// block-Jacobi (6×6), alone and combined, vs the existing point
/// preconditioners on SS MITC4 plates 10/20/30/50. Times preconditioner build
/// and the PCG run separately; checks the TRUE residual against the original
/// (unscaled) system. max_iter is generous (4·nf) to observe slow convergence;
/// the production default is 1000.max(nf/4) — flagged per row when exceeded.
///
/// Measured 2026-09-22 (Apple M3, release, without the old 50-iter stall
/// abort): Jacobi is the winner on every size — 109/235/338/495 iters for
/// 10/20/30/50×50, 4-11× faster than the direct solve. Equilibration changes
/// nothing (PCG-Jacobi on D⁻¹ᐟ²KD⁻¹ᐟ² is the same iteration), block-Jacobi
/// matches Jacobi's iteration count at ~1.5× per-iteration cost, SSOR needs
/// ~1.7× more iterations at ~4× per-iteration cost, and IC(0)/MIC still fail
/// to factorize even after scaling (shifted-IC still breaks PCG down at
/// iteration 0). Conclusion: no cheap preconditioner beats Jacobi here; the
/// fix was the stall safeguard, not the preconditioner.
///   cargo test --release --test sparse_shell_gates diagnose_precond_sweep -- --ignored --nocapture
#[test]
#[ignore]
fn diagnose_precond_sweep() {
    let variants = [
        "jacobi", "ssor", "bjacobi",
        "scaled+jacobi", "scaled+ssor", "scaled+bjacobi",
        "scaled+ic0", "scaled+ics", "scaled+mic",
    ];

    for &(nx, ny) in &[(10usize, 10usize), (20, 20), (30, 30), (50, 50)] {
        let input = make_ss_plate(nx, ny);
        let dof_num = DofNumbering::build_3d(&input);
        let nf = dof_num.n_free;
        let asm = assemble_sparse_3d(&input, &dof_num, false);
        let k_ff = &asm.k_ff;
        let f_f: Vec<f64> = asm.f[..nf].to_vec();
        let f_norm: f64 = f_f.iter().map(|v| v * v).sum::<f64>().sqrt();
        let bounds = free_node_block_bounds(&dof_num, nf);
        let prod_cap = 1000usize.max(nf / 4);
        let max_iter = 4 * nf;

        // Direct reference (symbolic + numeric + solve).
        let t0 = Instant::now();
        let sym = std::rc::Rc::new(symbolic_cholesky(k_ff));
        let num = numeric_cholesky(&sym, k_ff).expect("direct factorization failed");
        let _u = dedaliano_engine::linalg::sparse_cholesky_solve(&num, &f_f);
        let direct_ms = t0.elapsed().as_secs_f64() * 1000.0;
        println!(
            "=== plate {}x{}: nf={}, nnz={}, blocks={} | direct={:.1}ms, prod_max_iter={} ===",
            nx, ny, nf, k_ff.nnz(), bounds.len() - 1, direct_ms, prod_cap
        );

        // Equilibration: s_i = 1/sqrt(diag_i)
        let mut diag = vec![0.0f64; nf];
        for j in 0..nf {
            for p in k_ff.col_ptr[j]..k_ff.col_ptr[j + 1] {
                if k_ff.row_idx[p] == j {
                    diag[j] = k_ff.values[p];
                    break;
                }
            }
        }
        let s: Vec<f64> = diag.iter().map(|&d| 1.0 / d.sqrt()).collect();
        let ks = symmetric_scale_local(k_ff, &s);
        let fs: Vec<f64> = f_f.iter().zip(s.iter()).map(|(f, si)| f * si).collect();

        for &v in &variants {
            let scaled = v.starts_with("scaled+");
            let inner = if scaled { &v["scaled+".len()..] } else { v };
            let (mat, rhs): (&dedaliano_engine::linalg::CscMatrix, &Vec<f64>) =
                if scaled { (&ks, &fs) } else { (k_ff, &f_f) };

            let t0 = Instant::now();
            let pre: Option<Box<dyn Preconditioner>> = match inner {
                "jacobi" => JacobiPreconditioner::new(mat).map(|p| Box::new(p) as _),
                "ssor" => SsorPreconditioner::new(mat, 1.0).map(|p| Box::new(p) as _),
                "bjacobi" => LocalBlockJacobi::new(mat, &bounds).map(|p| Box::new(p) as _),
                "ic0" => Ic0Preconditioner::new(mat).map(|p| Box::new(p) as _),
                "ics" => Some(Box::new(ShiftedIcPreconditioner::new(mat, 0.0)) as _),
                "mic" => MicPreconditioner::new(mat).map(|p| Box::new(p) as _),
                _ => unreachable!(),
            };
            let build_ms = t0.elapsed().as_secs_f64() * 1000.0;
            let Some(pre) = pre else {
                println!("  {:>15}: BUILD FAILED", v);
                continue;
            };

            let t0 = Instant::now();
            let (res, _trace) = pcg_trace_no_guard(mat, rhs, pre.as_ref(), 1e-8, max_iter, 1_000_000);
            let solve_ms = t0.elapsed().as_secs_f64() * 1000.0;

            // Unscale and verify against the ORIGINAL system.
            let x: Vec<f64> = if scaled {
                res.x.iter().zip(s.iter()).map(|(y, si)| y * si).collect()
            } else {
                res.x.clone()
            };
            let ku = k_ff.sym_mat_vec(&x);
            let true_rel: f64 = ku.iter().zip(f_f.iter())
                .map(|(a, b)| (a - b).powi(2)).sum::<f64>().sqrt() / f_norm.max(1e-30);

            let over_cap = if res.iterations > prod_cap { " [>prod_cap]" } else { "" };
            println!(
                "  {:>15}: converged={} iters={:>6} true_rel={:.2e} build={:.1}ms solve={:.1}ms{}",
                v, res.converged, res.iterations, true_rel, build_ms, solve_ms, over_cap
            );
        }
    }
}

// ==================== Shifted-IC / MIC Gates (Phase 3) ====================

/// Gate: shifted-IC factorizes the MITC4 shell pattern that breaks strict
/// IC(0), and reports the restored pivots. (Convergence quality is a separate
/// question — measured in `diagnose_shifted_ic_sweep`; on these shells the
/// shifted factor does not make PCG converge, which is why Auto degrades on
/// verified convergence rather than on build success.)
#[test]
fn shifted_ic_factorizes_shell_pattern_that_breaks_ic0() {
    let input = make_ss_plate(10, 10);
    let dof_num = DofNumbering::build_3d(&input);
    let asm = assemble_sparse_3d(&input, &dof_num, false);

    assert!(
        Ic0Preconditioner::new(&asm.k_ff).is_none(),
        "strict IC(0) unexpectedly succeeded on the MITC4 pattern — update this gate"
    );
    let pre = ShiftedIcPreconditioner::new(&asm.k_ff, 0.0);
    assert!(
        pre.perturbations() > 0,
        "shifted-IC should report restored pivots on the MITC4 pattern"
    );
}

/// Gate: a forced PCG solve on a large MITC4 shell (30×30, nf=5644) never
/// returns an unverified result. Measured 2026-09-22 (after the size-scaled
/// stall window in `pcg_solve`): shifted-IC breaks down at iteration 0
/// (restored drilling pivots make M non-SPD) and the chain degrades to
/// Jacobi, which converges — the path is `pcg_jacobi` with displacements
/// matching the direct solve. If a future change makes every preconditioner
/// fail here, the verified direct fallback keeps this gate green as well.
#[test]
fn pcg_shell_30x30_verified_or_direct_fallback() {
    let pcg = linear::solve_3d(&{
        let mut i = make_ss_plate(30, 30);
        i.solver_options = Some(SolverOptions {
            method: Some("pcg".to_string()),
            preconditioner: None,
            tolerance: None,
            max_iterations: None,
        });
        i
    })
    .expect("PCG-forced 30x30 shell solve failed");

    let path = pcg.solver_run_meta.as_ref().unwrap().solver_path.clone();
    assert!(
        path.starts_with("pcg_"),
        "expected a pcg_* path (succeeded or verified fallback), got {}",
        path
    );

    // Whatever path produced the result, the residual must be verified small.
    let eq = pcg.equilibrium.as_ref().expect("should have equilibrium");
    assert!(eq.residual_ok, "residual should be ok on path {}", path);

    // Parity vs the direct solve.
    let direct = linear::solve_3d(&{
        let mut i = make_ss_plate(30, 30);
        i.solver_options = Some(SolverOptions {
            method: Some("direct".to_string()),
            preconditioner: None,
            tolerance: None,
            max_iterations: None,
        });
        i
    })
    .expect("direct 30x30 shell solve failed");
    assert_eq!(direct.solver_run_meta.as_ref().unwrap().solver_path, "sparse_cholesky");

    let max_disp = direct.displacements.iter()
        .flat_map(|d| [d.ux.abs(), d.uy.abs(), d.uz.abs(), d.rx.abs(), d.ry.abs(), d.rz.abs()])
        .fold(0.0f64, f64::max);
    let mut max_rel_err = 0.0f64;
    for (a, b) in pcg.displacements.iter().zip(direct.displacements.iter()) {
        assert_eq!(a.node_id, b.node_id);
        for (x, y) in [
            (a.ux, b.ux), (a.uy, b.uy), (a.uz, b.uz),
            (a.rx, b.rx), (a.ry, b.ry), (a.rz, b.rz),
        ] {
            max_rel_err = max_rel_err.max((x - y).abs() / max_disp.max(1e-20));
        }
    }
    assert!(
        max_rel_err < 1e-9,
        "PCG-forced vs direct max relative error {:.2e} exceeds 1e-9",
        max_rel_err
    );
}

// ==================== 2D Sparse Runtime Gate ====================

/// Build a long 2D multi-span beam with many elements to test 2D sparse path.
fn make_2d_multi_span(n_elements: usize) -> SolverInput {
    let mut nodes = HashMap::new();
    for i in 0..=n_elements {
        nodes.insert(i.to_string(), SolverNode { id: i, x: i as f64, z: 0.0 });
    }

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200e3, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });

    let mut elements = HashMap::new();
    for i in 0..n_elements {
        elements.insert(i.to_string(), SolverElement {
            id: i, elem_type: "frame".to_string(),
            node_i: i, node_j: i + 1,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
    }

    let mut supports = HashMap::new();
    // Pin first node, roller every 10th
    supports.insert("0".to_string(), SolverSupport {
        id: 0, node_id: 0, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    for i in (10..=n_elements).step_by(10) {
        supports.insert(i.to_string(), SolverSupport {
            id: i, node_id: i, support_type: "pinned".to_string(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None, angle: None,
        });
    }

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_elements / 2, fx: 0.0, fz: -10.0, my: 0.0,
    })];

    SolverInput {
        solver_options: None,
        nodes, materials, sections, elements, supports, loads,
        constraints: vec![], connectors: HashMap::new(),
    }
}

#[test]
fn sparse_2d_runtime() {
    let input = make_2d_multi_span(200);

    // Warmup
    let _ = linear::solve_2d(&input);

    let t0 = Instant::now();
    let result = linear::solve_2d(&input).expect("2D sparse solve failed");
    let elapsed_ms = t0.elapsed().as_millis();

    println!("200-element 2D beam: {}ms, {} displacements", elapsed_ms, result.displacements.len());

    // Should be fast (typically <100ms)
    assert!(elapsed_ms < 2000, "2D sparse solve too slow: {}ms", elapsed_ms);

    // Equilibrium should be good
    let eq = result.equilibrium.as_ref().expect("should have equilibrium");
    assert!(eq.equilibrium_ok, "equilibrium should pass");
    assert!(eq.max_imbalance < 1e-3, "imbalance: {}", eq.max_imbalance);
}

#[test]
fn large_3d_equilibrium_gate() {
    // 10x10 shell plate — verify equilibrium summary is populated and correct
    let input = make_ss_plate(10, 10);
    let result = linear::solve_3d(&input).expect("3D solve failed");

    let eq = result.equilibrium.as_ref().expect("should have equilibrium");
    assert!(eq.equilibrium_ok, "equilibrium should pass for 10x10 plate");
    assert!(eq.residual_ok, "residual should be ok");

    // Structured diagnostics should be present (sparse path)
    assert!(!result.structured_diagnostics.is_empty(),
        "10x10 plate should have structured diagnostics");

    // Should have residual diagnostic
    let has_residual = result.structured_diagnostics.iter()
        .any(|d| d.code == DiagnosticCode::ResidualOk || d.code == DiagnosticCode::ResidualHigh);
    assert!(has_residual, "should have residual diagnostic");
}

// ==================== Modal Mass Parity Gates (fully-sparse eigensolver) ====================

/// Reference modal quantities (frequencies and per-direction effective mass
/// sums) computed from dense K_ff / M_ff, mirroring modal.rs post-processing.
fn dense_modal_masses(
    input: &SolverInput3D,
    densities: &HashMap<String, f64>,
    num_modes: usize,
) -> (Vec<f64>, [f64; 3]) {
    let dof_num = DofNumbering::build_3d(input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;
    let sasm = assemble_sparse_3d(input, &dof_num, false);
    let k_dense = sasm.k_ff.to_dense_symmetric();
    let m_full = dedaliano_engine::solver::mass_matrix::assemble_mass_matrix_3d(input, &dof_num, densities);
    let free_idx: Vec<usize> = (0..nf).collect();
    let m_ff = extract_submatrix(&m_full, n, &free_idx, &free_idx);

    let eigen = dedaliano_engine::linalg::lanczos_generalized_eigen(&k_dense, &m_ff, nf, num_modes, 0.0)
        .expect("Dense Lanczos failed");

    // Influence vectors for X, Y, Z translational DOFs (same as modal.rs)
    let mut r = [vec![0.0; nf], vec![0.0; nf], vec![0.0; nf]];
    for &node_id in &dof_num.node_order {
        for (axis, r_axis) in r.iter_mut().enumerate() {
            if let Some(&d) = dof_num.map.get(&(node_id, axis)) {
                if d < nf { r_axis[d] = 1.0; }
            }
        }
    }

    // lanczos_generalized_eigen may return more converged Ritz pairs than the
    // k requested; solve_modal_3d reports exactly num_modes, so cap the
    // reference to keep the mass sums over the same retained set.
    let nk = eigen.values.len().min(num_modes);
    let mut freqs = Vec::new();
    let mut meff_sum = [0.0f64; 3];
    for idx in 0..nk {
        let lam = eigen.values[idx];
        if lam <= 1e-10 { continue; }
        freqs.push(lam.sqrt() / (2.0 * std::f64::consts::PI));

        let phi: Vec<f64> = (0..nf).map(|i| eigen.vectors[i * nk + idx]).collect();
        let mut m_phi = vec![0.0; nf];
        for i in 0..nf {
            let mut s = 0.0;
            for j in 0..nf { s += m_ff[i * nf + j] * phi[j]; }
            m_phi[i] = s;
        }
        let phi_m_phi: f64 = phi.iter().zip(m_phi.iter()).map(|(a, b)| a * b).sum();
        if phi_m_phi.abs() < 1e-30 { continue; }
        for (axis, r_axis) in r.iter().enumerate() {
            let phi_m_r: f64 = r_axis.iter().zip(m_phi.iter()).map(|(a, b)| a * b).sum();
            let gamma = phi_m_r / phi_m_phi;
            meff_sum[axis] += gamma * gamma * phi_m_phi;
        }
    }
    (freqs, meff_sum)
}

fn assert_modal_mass_parity(input: &SolverInput3D, densities: &HashMap<String, f64>, num_modes: usize, label: &str) {
    let sparse = modal::solve_modal_3d(input, densities, num_modes)
        .unwrap_or_else(|e| panic!("{}: sparse modal failed: {}", label, e));
    let (dense_freqs, dense_meff) = dense_modal_masses(input, densities, num_modes);

    // Frequencies, paired mode-by-mode
    let min_freq = 0.1;
    let sparse_freqs: Vec<f64> = sparse.modes.iter()
        .map(|m| m.frequency)
        .filter(|&f| f > min_freq)
        .collect();
    let dense_freqs: Vec<f64> = dense_freqs.into_iter().filter(|&f| f > min_freq).collect();
    let n_compare = sparse_freqs.len().min(dense_freqs.len());
    assert!(n_compare > 0, "{}: no modes to compare", label);
    for i in 0..n_compare {
        let rel_err = (sparse_freqs[i] - dense_freqs[i]).abs() / dense_freqs[i].max(1e-20);
        assert!(
            rel_err < 1e-2,
            "{}: mode {} frequency mismatch: sparse={:.6}, dense={:.6}, rel_err={:.2e}",
            label, i, sparse_freqs[i], dense_freqs[i], rel_err
        );
    }

    // Effective masses: compared as sums over the retained modes because
    // eigenvectors can mix within degenerate clusters (symmetric plate modes).
    // γ²·φᵀMφ is scale-invariant, so eigenvector normalization is irrelevant.
    let sparse_meff = [
        sparse.modes.iter().map(|m| m.effective_mass_x).sum::<f64>(),
        sparse.modes.iter().map(|m| m.effective_mass_y).sum::<f64>(),
        sparse.modes.iter().map(|m| m.effective_mass_z).sum::<f64>(),
    ];
    for axis in 0..3 {
        let diff = (sparse_meff[axis] - dense_meff[axis]).abs();
        println!(
            "{}: axis {} meff sparse={:.6e}, dense={:.6e}, diff={:.2e}",
            label, axis, sparse_meff[axis], dense_meff[axis], diff
        );
        assert!(
            diff < 0.02 * sparse.total_mass,
            "{}: axis {} effective mass sum mismatch: sparse={:.6e}, dense={:.6e} (total_mass={:.6e})",
            label, axis, sparse_meff[axis], dense_meff[axis], sparse.total_mass
        );
    }
}

/// Gate: fully-sparse modal solve (sparse M + sparse eigensolve + sym_mat_vec
/// post-processing) matches dense-computed frequencies and modal masses on an
/// 8×8 MITC4 plate.
#[test]
fn sparse_modal_mass_parity() {
    let input = make_ss_plate(8, 8);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);
    // 7 modes: the 6th mode (~28.2 Hz) belongs to a degenerate pair; retaining
    // only one member makes the effective-mass sum depend on the arbitrary
    // eigenvector rotation inside the cluster, so both members are retained.
    assert_modal_mass_parity(&input, &densities, 7, "plate_8x8");
}

/// Cantilever 3D frame along Z (iy ≠ iz breaks flexural degeneracy).
fn make_cantilever_frame_3d(n_elem: usize) -> SolverInput3D {
    let l = 6.0;
    let mut nodes = HashMap::new();
    for i in 0..=n_elem {
        let id = i + 1;
        nodes.insert(id.to_string(), SolverNode3D {
            id, x: 0.0, y: 0.0, z: i as f64 * l / n_elem as f64,
        });
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: 0.0625, iy: 2.0e-4, iz: 3.2552e-4, j: 5.0e-4,
        cw: None, as_y: None, as_z: None,
    });

    let mut elements = HashMap::new();
    for i in 0..n_elem {
        let id = i + 1;
        elements.insert(id.to_string(), SolverElement3D {
            id, elem_type: "frame".to_string(), node_i: id, node_j: id + 1,
            material_id: 1, section_id: 1,
            release_my_start: false, release_my_end: false,
            release_mz_start: false, release_mz_end: false,
            release_t_start: false, release_t_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
    }

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport3D {
        node_id: 1,
        rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None, rw: None, kw: None,
    });

    SolverInput3D {
        solver_options: None,
        nodes, materials: mats, sections, elements, supports,
        loads: vec![],
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![], connectors: HashMap::new(),
    }
}

/// Gate: same mass parity on a 3D frame (16 elements → 96 free DOFs, above the
/// n≤80 dense fallback so the sparse Lanczos path is exercised).
#[test]
fn sparse_modal_mass_parity_frame() {
    let input = make_cantilever_frame_3d(16);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);
    assert_modal_mass_parity(&input, &densities, 5, "frame_cantilever_16");
}
