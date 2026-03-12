//! One-shot phase breakdown: prints SolveTimings for various MITC4 plate sizes.
//! Run with: cargo test --release --test bench_phases -- --nocapture

use dedaliano_engine::solver::{linear, modal, assembly, dof::DofNumbering};
use dedaliano_engine::solver::harmonic::{HarmonicInput3D};
use dedaliano_engine::solver::reduction::{GuyanInput3D, CraigBamptonInput3D};
use dedaliano_engine::solver::mass_matrix::assemble_mass_matrix_3d;
use dedaliano_engine::solver::damping::{rayleigh_coefficients, rayleigh_damping_matrix};
use dedaliano_engine::linalg::{extract_submatrix, extract_subvec, lu_solve, symbolic_cholesky_with, CholOrdering, lanczos_generalized_eigen, cholesky_decompose, forward_solve, back_solve};
use dedaliano_engine::types::*;
use std::collections::HashMap;
use std::time::Instant;

fn make_flat_plate(nx: usize, ny: usize) -> SolverInput3D {
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
    // Pin one corner fully
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

#[test]
fn phase_breakdown_mitc4() {
    println!("\n=== MITC4 Plate Phase Breakdown (release build) ===\n");
    println!(
        "{:>10} {:>6} {:>6} {:>9} {:>9} {:>9} {:>7} {:>7} {:>10} {:>7} {:>8} {:>9} {:>6} {:>8} {:>8} {:>8} {:>10}",
        "mesh", "nodes", "elems", "asm(us)", "sym(us)", "num(us)", "slv",
        "res", "fallback", "rxn", "stress", "total(us)", "nf", "nnz_kff", "nnz_L",
        "perturbs", "max_pert"
    );
    println!("{}", "-".repeat(172));

    for &(nx, ny) in &[(10, 10), (20, 20), (30, 30), (50, 50)] {
        let input = make_flat_plate(nx, ny);
        let n_nodes = (nx + 1) * (ny + 1);
        let n_elems = nx * ny;
        let result = linear::solve_3d(&input).unwrap();

        let label = format!("{}x{}", nx, ny);
        if let Some(t) = &result.timings {
            println!(
                "{:>10} {:>6} {:>6} {:>9} {:>9} {:>9} {:>7} {:>7} {:>10} {:>7} {:>8} {:>9} {:>6} {:>8} {:>8} {:>8} {:>10.2e}",
                label, n_nodes, n_elems,
                t.assembly_us, t.symbolic_us, t.numeric_us,
                t.solve_us, t.residual_us, t.dense_fallback_us,
                t.reactions_us, t.stress_recovery_us,
                t.total_us, t.n_free, t.nnz_kff, t.nnz_l,
                t.pivot_perturbations, t.max_perturbation,
            );
        } else {
            println!("{:>10} {:>6} {:>6} (dense fallback)", label, n_nodes, n_elems);
        }
    }
}

/// Measure assembly+extraction: dense path vs sparse path.
///
/// Dense path:  assemble_3d (builds n×n K) → extract_submatrix (copies nf×nf block)
/// Sparse path: assemble_sparse_3d (builds CSC k_ff directly) → to_dense_symmetric (nf×nf)
///
/// This is the step that changed for modal/buckling/harmonic/reduction solvers.
#[test]
fn assembly_extraction_dense_vs_sparse() {
    let max_n_dense = 6000; // n_total limit for dense path (avoids multi-GB allocs)

    println!("\n=== Assembly + K_ff Extraction: Dense vs Sparse (release build) ===\n");
    println!(
        "{:>10} {:>6} {:>6} {:>8} | {:>12} {:>12} {:>12} | {:>12} {:>12} {:>12} | {:>8} {:>10} {:>10}",
        "mesh", "n_tot", "nf", "elems",
        "dense_asm", "dense_ext", "dense_tot",
        "sparse_asm", "sparse_cvt", "sparse_tot",
        "speedup", "dense_MB", "sparse_MB",
    );
    println!("{}", "-".repeat(160));

    for &(nx, ny) in &[(10, 10), (20, 20), (30, 30), (50, 50)] {
        let input = make_flat_plate(nx, ny);
        let dof_num = DofNumbering::build_3d(&input);
        let nf = dof_num.n_free;
        let n = dof_num.n_total;
        let n_elems = nx * ny;
        let label = format!("{}x{}", nx, ny);

        // Memory: dense path allocates n×n for asm.k, then nf×nf for k_ff
        // sparse path allocates CSC (nnz) for k_ff, then nf×nf for to_dense_symmetric
        let dense_peak_mb = (n * n + nf * nf) as f64 * 8.0 / 1_048_576.0;
        let sparse_kff_mb = (nf * nf) as f64 * 8.0 / 1_048_576.0; // to_dense_symmetric output

        // --- Dense path ---
        let dense_result = if n <= max_n_dense {
            let t0 = Instant::now();
            let asm = assembly::assemble_3d(&input, &dof_num);
            let asm_us = t0.elapsed().as_micros() as u64;

            let t1 = Instant::now();
            let free_idx: Vec<usize> = (0..nf).collect();
            let _k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
            let ext_us = t1.elapsed().as_micros() as u64;

            Some((asm_us, ext_us))
        } else {
            None
        };

        // --- Sparse path ---
        let t0 = Instant::now();
        let sasm = assembly::assemble_sparse_3d(&input, &dof_num, false);
        let sparse_asm_us = t0.elapsed().as_micros() as u64;

        let t1 = Instant::now();
        let _k_ff = sasm.k_ff.to_dense_symmetric();
        let sparse_cvt_us = t1.elapsed().as_micros() as u64;

        let sparse_tot = sparse_asm_us + sparse_cvt_us;

        match dense_result {
            Some((asm_us, ext_us)) => {
                let dense_tot = asm_us + ext_us;
                let speedup = if sparse_tot > 0 { dense_tot as f64 / sparse_tot as f64 } else { 0.0 };
                println!(
                    "{:>10} {:>6} {:>6} {:>8} | {:>10}us {:>10}us {:>10}us | {:>10}us {:>10}us {:>10}us | {:>7.1}x {:>9.1}MB {:>9.1}MB",
                    label, n, nf, n_elems,
                    asm_us, ext_us, dense_tot,
                    sparse_asm_us, sparse_cvt_us, sparse_tot,
                    speedup, dense_peak_mb, sparse_kff_mb,
                );
            }
            None => {
                println!(
                    "{:>10} {:>6} {:>6} {:>8} | {:>10} {:>10} {:>10} | {:>10}us {:>10}us {:>10}us | {:>8} {:>9.1}MB {:>9.1}MB",
                    label, n, nf, n_elems,
                    "N/A", "N/A", "N/A",
                    sparse_asm_us, sparse_cvt_us, sparse_tot,
                    "N/A", dense_peak_mb, sparse_kff_mb,
                );
            }
        }
    }
}

/// Isolate the overhead: element computation vs CSC construction vs triplet collection.
/// Times each component separately.
#[test]
fn assembly_overhead_breakdown() {
    println!("\n=== Assembly Overhead Breakdown (release build) ===\n");
    println!(
        "{:>10} {:>8} {:>8} | {:>12} {:>12} | {:>12} {:>12} {:>12} | {:>12}",
        "mesh", "nf", "n_trip",
        "dense_asm", "dense_ext",
        "elem_only", "csc_full", "csc_ff",
        "filt_copy",
    );
    println!("{}", "-".repeat(120));

    for &(nx, ny) in &[(10, 10), (20, 20), (30, 30)] {
        let input = make_flat_plate(nx, ny);
        let dof_num = DofNumbering::build_3d(&input);
        let nf = dof_num.n_free;
        let n = dof_num.n_total;

        // Dense path: assembly + extraction
        let t0 = Instant::now();
        let asm = assembly::assemble_3d(&input, &dof_num);
        let dense_asm_us = t0.elapsed().as_micros() as u64;

        let t0 = Instant::now();
        let free_idx: Vec<usize> = (0..nf).collect();
        let _k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
        let dense_ext_us = t0.elapsed().as_micros() as u64;

        // Sparse path: full assembly (includes element stiffness + triplet scatter + CSC)
        let t0 = Instant::now();
        let _sasm = assembly::assemble_sparse_3d(&input, &dof_num, true);
        let _sparse_total_us = t0.elapsed().as_micros() as u64;

        // Isolate CSC construction: build synthetic triplets mimicking the assembly
        // (use the actual assembly to generate real triplets, then time just from_triplets)
        // We can approximate: sparse_total - elem_time ≈ CSC overhead
        // But to directly measure, let's re-assemble and capture triplet count
        let sasm = assembly::assemble_sparse_3d(&input, &dof_num, true);
        let k_full = sasm.k_full.as_ref().unwrap();
        let nnz_full = k_full.values.len();
        let nnz_ff = sasm.k_ff.values.len();

        // Build random triplets matching the nnz count, then time from_triplets
        let mut trip_r = Vec::with_capacity(nnz_full * 2);
        let mut trip_c = Vec::with_capacity(nnz_full * 2);
        let mut trip_v = Vec::with_capacity(nnz_full * 2);
        // Expand CSC back to triplets for k_full
        for j in 0..n {
            for k in k_full.col_ptr[j]..k_full.col_ptr[j + 1] {
                trip_r.push(k_full.row_idx[k]);
                trip_c.push(j);
                trip_v.push(k_full.values[k]);
            }
        }
        let n_trip = trip_r.len();

        let t0 = Instant::now();
        let _k_full_csc = dedaliano_engine::linalg::sparse::CscMatrix::from_triplets(n, &trip_r, &trip_c, &trip_v);
        let csc_full_us = t0.elapsed().as_micros() as u64;

        // Filter for free DOFs
        let t0 = Instant::now();
        let mut ff_r = Vec::with_capacity(n_trip);
        let mut ff_c = Vec::with_capacity(n_trip);
        let mut ff_v = Vec::with_capacity(n_trip);
        for i in 0..trip_r.len() {
            if trip_r[i] < nf && trip_c[i] < nf {
                ff_r.push(trip_r[i]);
                ff_c.push(trip_c[i]);
                ff_v.push(trip_v[i]);
            }
        }
        let filt_us = t0.elapsed().as_micros() as u64;

        let t0 = Instant::now();
        let _k_ff_csc = dedaliano_engine::linalg::sparse::CscMatrix::from_triplets(nf, &ff_r, &ff_c, &ff_v);
        let csc_ff_us = t0.elapsed().as_micros() as u64;

        // Element-only time ≈ sparse_total - csc_full - csc_ff - filter
        // (rough: doesn't account for triplet push overhead)

        println!(
            "{:>10} {:>8} {:>8} | {:>10}us {:>10}us | {:>12} {:>10}us {:>10}us | {:>10}us",
            format!("{}x{}", nx, ny), nf, n_trip,
            dense_asm_us, dense_ext_us,
            "—",
            csc_full_us, csc_ff_us,
            filt_us,
        );
    }
}

/// Long-running sparse assembly loop for profiling with `sample`.
/// Run: cargo test --release --test bench_phases profile_sparse_asm -- --nocapture --ignored
/// Then in another terminal: sample <pid> 5 -f /tmp/sparse_profile.txt
#[test]
#[ignore]
fn profile_sparse_asm() {
    let input = make_flat_plate(30, 30);
    let dof_num = DofNumbering::build_3d(&input);

    // Print PID so we can attach the profiler
    println!("PID: {}", std::process::id());
    println!("Warming up...");

    // Warmup
    for _ in 0..3 {
        let _ = assembly::assemble_sparse_3d(&input, &dof_num, true);
    }

    println!("Profiling loop started — attach `sample` now");
    let t0 = Instant::now();
    let mut iters = 0u64;
    while t0.elapsed().as_secs() < 10 {
        let _ = assembly::assemble_sparse_3d(&input, &dof_num, true);
        iters += 1;
    }
    let elapsed = t0.elapsed();
    println!("{} iterations in {:.2}s ({:.1}ms/iter)",
        iters, elapsed.as_secs_f64(), elapsed.as_secs_f64() / iters as f64 * 1000.0);
}

/// Long-running dense assembly loop for comparison profiling.
/// Run: cargo test --release --test bench_phases profile_dense_asm -- --nocapture --ignored
#[test]
#[ignore]
fn profile_dense_asm() {
    let input = make_flat_plate(30, 30);
    let dof_num = DofNumbering::build_3d(&input);

    println!("PID: {}", std::process::id());
    println!("Warming up...");

    for _ in 0..3 {
        let _ = assembly::assemble_3d(&input, &dof_num);
    }

    println!("Profiling loop started — attach `sample` now");
    let t0 = Instant::now();
    let mut iters = 0u64;
    while t0.elapsed().as_secs() < 10 {
        let _ = assembly::assemble_3d(&input, &dof_num);
        iters += 1;
    }
    let elapsed = t0.elapsed();
    println!("{} iterations in {:.2}s ({:.1}ms/iter)",
        iters, elapsed.as_secs_f64(), elapsed.as_secs_f64() / iters as f64 * 1000.0);
}

/// Measure raw MITC4 element stiffness computation cost
#[test]
fn mitc4_element_cost() {
    use dedaliano_engine::element::quad::{mitc4_local_stiffness, quad_transform_3d};
    use dedaliano_engine::linalg::transform_stiffness;

    let coords = [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 1.0, 0.0], [0.0, 1.0, 0.0]];
    let e = 200_000_000.0;
    let nu = 0.3;
    let t = 0.1;

    // Warmup
    for _ in 0..100 {
        let k_local = mitc4_local_stiffness(&coords, e, nu, t);
        let t_quad = quad_transform_3d(&coords);
        let _k_glob = transform_stiffness(&k_local, &t_quad, 24);
    }

    let n_iter = 900;
    let t0 = Instant::now();
    for _ in 0..n_iter {
        let k_local = mitc4_local_stiffness(&coords, e, nu, t);
        let t_quad = quad_transform_3d(&coords);
        let _k_glob = transform_stiffness(&k_local, &t_quad, 24);
    }
    let elapsed_us = t0.elapsed().as_micros() as u64;
    let per_elem_us = elapsed_us as f64 / n_iter as f64;
    println!("\n{} MITC4 elements: {}us total, {:.1}us/elem", n_iter, elapsed_us, per_elem_us);
    println!("For comparison: dense asm 30x30 (900 quads) = ~15ms → ~16.7us/elem");
    println!("This means element computation is ~{:.0}% of dense assembly", per_elem_us / 16.7 * 100.0);
}

/// Like `make_flat_plate` but also returns the `grid[ix][iy] -> node_id` mapping.
fn make_flat_plate_with_grid(nx: usize, ny: usize) -> (SolverInput3D, Vec<Vec<usize>>) {
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
    // Pin one corner fully
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

/// Dense LU solve timing for a single model. Returns elapsed microseconds,
/// or None if nf > max_nf (too expensive).
fn dense_solve_us(input: &SolverInput3D, max_nf: usize) -> Option<u64> {
    let dof_num = DofNumbering::build_3d(input);
    let nf = dof_num.n_free;
    if nf > max_nf {
        return None;
    }
    let n = dof_num.n_total;
    let asm = assembly::assemble_3d(input, &dof_num);
    let free_idx: Vec<usize> = (0..nf).collect();
    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
    let f_f = extract_subvec(&asm.f, &free_idx);

    let t0 = Instant::now();
    let mut k = k_ff;
    let _ = lu_solve(&mut k, &mut f_f.clone(), nf);
    Some(t0.elapsed().as_micros() as u64)
}

#[test]
fn sparse_vs_dense_comparison() {
    // Skip dense for nf > 6000 (dense LU on 5644 DOFs takes ~30s)
    let max_nf_dense = 6000;

    println!("\n=== MITC4 Plate: Sparse vs Dense (release build) ===\n");
    println!(
        "{:>10} {:>6} {:>8} | {:>12} | {:>12} | {:>8} | {:>5} {:>8}",
        "mesh", "nodes", "nf", "sparse_us", "dense_us", "speedup", "fill", "perturbs"
    );
    println!("{}", "-".repeat(86));

    for &(nx, ny) in &[(10, 10), (20, 20), (30, 30), (50, 50)] {
        let input = make_flat_plate(nx, ny);
        let n_nodes = (nx + 1) * (ny + 1);

        // Sparse path (full solve_3d)
        let result = linear::solve_3d(&input).unwrap();
        let t = result.timings.as_ref().unwrap();
        let sparse_us = t.total_us;
        let nf = t.n_free;
        let fill = if t.nnz_kff > 0 {
            t.nnz_l as f64 / t.nnz_kff as f64
        } else {
            0.0
        };

        // Dense path (assembly + LU only, no postprocessing)
        let dense = dense_solve_us(&input, max_nf_dense);

        let dense_str = match dense {
            Some(d) => format!("{}", d),
            None => "N/A".to_string(),
        };
        let speedup_str = match dense {
            Some(d) if sparse_us > 0 => format!("{:.1}x", d as f64 / sparse_us as f64),
            _ => "N/A".to_string(),
        };

        println!(
            "{:>10} {:>6} {:>8} | {:>12} | {:>12} | {:>8} | {:>5.1}x {:>8}",
            format!("{}x{}", nx, ny), n_nodes, nf,
            sparse_us, dense_str, speedup_str,
            fill, t.pivot_perturbations,
        );
    }
}

/// Compare AMD vs RCM fill ratios across mesh sizes.
#[test]
fn amd_vs_rcm_fill_comparison() {
    println!("\n=== AMD vs RCM Fill Comparison (release build) ===\n");
    println!(
        "{:>10} {:>6} {:>8} | {:>10} {:>10} | {:>10} {:>10} | {:>8}",
        "mesh", "nf", "nnz_kff",
        "nnz_L_rcm", "fill_rcm",
        "nnz_L_amd", "fill_amd",
        "winner",
    );
    println!("{}", "-".repeat(90));

    for &(nx, ny) in &[(10, 10), (20, 20), (30, 30), (50, 50)] {
        let input = make_flat_plate(nx, ny);
        let dof_num = DofNumbering::build_3d(&input);
        let nf = dof_num.n_free;
        let asm = assembly::assemble_sparse_3d(&input, &dof_num, false);
        let nnz_kff = asm.k_ff.col_ptr[nf];

        let sym_rcm = symbolic_cholesky_with(&asm.k_ff, CholOrdering::Rcm);
        let sym_amd = symbolic_cholesky_with(&asm.k_ff, CholOrdering::Amd);

        let fill_rcm = sym_rcm.l_nnz as f64 / nnz_kff as f64;
        let fill_amd = sym_amd.l_nnz as f64 / nnz_kff as f64;

        let winner = if fill_rcm <= fill_amd { "RCM" } else { "AMD" };

        println!(
            "{:>10} {:>6} {:>8} | {:>10} {:>9.2}x | {:>10} {:>9.2}x | {:>8}",
            format!("{}x{}", nx, ny), nf, nnz_kff,
            sym_rcm.l_nnz, fill_rcm,
            sym_amd.l_nnz, fill_amd,
            winner,
        );
    }
}

/// Time sparse modal vs dense modal on 20×20 MITC4 plate.
#[test]
fn modal_sparse_vs_dense_timing() {
    let input = make_flat_plate(20, 20);
    let num_modes = 5;
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);

    // Sparse modal (current default — uses sparse Lanczos for no-constraint models)
    let t0 = Instant::now();
    let result_sparse = modal::solve_modal_3d(&input, &densities, num_modes)
        .expect("Sparse modal failed");
    let sparse_us = t0.elapsed().as_micros();

    // Dense modal: manually assemble dense K, then call dense Lanczos
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    let t0 = Instant::now();
    let sasm = assembly::assemble_sparse_3d(&input, &dof_num, false);
    let k_ff_dense = sasm.k_ff.to_dense_symmetric();
    let m_full = dedaliano_engine::solver::mass_matrix::assemble_mass_matrix_3d(&input, &dof_num, &densities);
    let free_idx: Vec<usize> = (0..nf).collect();
    let m_ff = extract_submatrix(&m_full, n, &free_idx, &free_idx);
    let _ = dedaliano_engine::linalg::lanczos_generalized_eigen(
        &k_ff_dense, &m_ff, nf, num_modes, 0.0
    ).expect("Dense Lanczos failed");
    let dense_us = t0.elapsed().as_micros();

    println!("\n=== Modal 20×20 MITC4: Sparse vs Dense ===");
    println!("  nf = {}", nf);
    println!("  Sparse modal (full solve): {} us", sparse_us);
    println!("  Dense eigen (assembly + to_dense + Lanczos): {} us", dense_us);
    if dense_us > 0 {
        println!("  Speedup: {:.1}x", dense_us as f64 / sparse_us.max(1) as f64);
    }
    println!("  Sparse modes: {:?}", result_sparse.modes.iter().map(|m| m.frequency).collect::<Vec<_>>());
}

// ==================== Phase Breakdown Benchmarks ====================

/// Harmonic 3D phase breakdown: measure wall time of each phase in solve_harmonic_3d.
#[test]
#[ignore] // ~600s on CI runners — run locally with `cargo test -- --ignored`
fn harmonic_phase_breakdown() {
    let nx = 20;
    let ny = 20;
    let n_freq = 50;
    let damping_ratio = 0.05;

    let (input, grid) = make_flat_plate_with_grid(nx, ny);
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    // Center node for response target
    let center_node = grid[nx / 2][ny / 2];

    // Frequency list: 0.1 to 100 Hz in n_freq steps
    let frequencies: Vec<f64> = (0..n_freq)
        .map(|i| 0.1 + (100.0 - 0.1) * i as f64 / (n_freq - 1) as f64)
        .collect();

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);

    println!("\n=== Harmonic 3D Phase Breakdown ({}x{} MITC4, {} freq steps) ===", nx, ny, n_freq);
    println!("  nf={}  n_freq={}", nf, n_freq);

    // Phase 1: sparse assembly
    let t0 = Instant::now();
    let sasm = assembly::assemble_sparse_3d(&input, &dof_num, false);
    let sparse_asm_us = t0.elapsed().as_micros() as u64;

    // Phase 2: dense conversion
    let t0 = Instant::now();
    let k_ff = sasm.k_ff.to_dense_symmetric();
    let dense_conv_us = t0.elapsed().as_micros() as u64;

    let f_ff: Vec<f64> = sasm.f[..nf].to_vec();

    // Phase 3: mass matrix assembly + extraction
    let t0 = Instant::now();
    let m_full = assemble_mass_matrix_3d(&input, &dof_num, &densities);
    let free_idx: Vec<usize> = (0..nf).collect();
    let m_ff = extract_submatrix(&m_full, n, &free_idx, &free_idx);
    let mass_matrix_us = t0.elapsed().as_micros() as u64;

    // No constraints in this model → k_s = k_ff, m_s = m_ff, f_s = f_ff
    let ns = nf;

    // Phase 4: Rayleigh eigen (2 modes for damping coefficients)
    let t0 = Instant::now();
    let eigen_result = lanczos_generalized_eigen(&k_ff, &m_ff, ns, 2, 0.0);
    let (a0, a1) = if let Some(ref res) = eigen_result {
        let positive: Vec<f64> = res.values.iter().copied().filter(|&v| v > 1e-10).collect();
        if positive.len() >= 2 {
            rayleigh_coefficients(positive[0].sqrt(), positive[1].sqrt(), damping_ratio)
        } else if positive.len() == 1 {
            rayleigh_coefficients(positive[0].sqrt(), 3.0 * positive[0].sqrt(), damping_ratio)
        } else {
            (0.0, 0.0)
        }
    } else {
        (0.0, 0.0)
    };
    let rayleigh_eigen_us = t0.elapsed().as_micros() as u64;

    // Phase 5: damping matrix
    let t0 = Instant::now();
    let c_s = rayleigh_damping_matrix(&m_ff, &k_ff, ns, a0, a1);
    let damping_us = t0.elapsed().as_micros() as u64;

    // Phase 6: frequency sweep
    // Replicate solve_complex_system inline: (K - ω²M + iωC)u = F → 2n×2n real block LU
    let t0 = Instant::now();
    for &freq in &frequencies {
        let omega = 2.0 * std::f64::consts::PI * freq;
        let omega2 = omega * omega;
        let n2 = 2 * ns;
        let mut a = vec![0.0; n2 * n2];
        let mut rhs = vec![0.0; n2];

        for i in 0..ns {
            for j in 0..ns {
                let kd = k_ff[i * ns + j] - omega2 * m_ff[i * ns + j];
                let wc = omega * c_s[i * ns + j];
                a[i * n2 + j] = kd;
                a[i * n2 + (ns + j)] = -wc;
                a[(ns + i) * n2 + j] = wc;
                a[(ns + i) * n2 + (ns + j)] = kd;
            }
        }
        for i in 0..ns {
            rhs[i] = f_ff[i];
        }

        let _ = lu_solve(&mut a, &mut rhs, n2);
    }
    let freq_sweep_us = t0.elapsed().as_micros() as u64;

    let sum_phases = sparse_asm_us + dense_conv_us + mass_matrix_us + rayleigh_eigen_us + damping_us + freq_sweep_us;

    println!("  sparse_asm:      {:>8} us", sparse_asm_us);
    println!("  dense_conv:      {:>8} us", dense_conv_us);
    println!("  mass_matrix:     {:>8} us", mass_matrix_us);
    println!("  rayleigh_eigen:  {:>8} us", rayleigh_eigen_us);
    println!("  damping:         {:>8} us", damping_us);
    println!("  freq_sweep:      {:>8} us  ({} us/step)", freq_sweep_us, freq_sweep_us / n_freq as u64);
    println!("  --------------------------------");
    println!("  sum_phases:      {:>8} us", sum_phases);

    // Full solver for comparison
    let harmonic_input = HarmonicInput3D {
        solver: input,
        densities,
        frequencies,
        damping_ratio,
        response_node_id: center_node,
        response_dof: "z".to_string(),
    };
    let t0 = Instant::now();
    let _result = dedaliano_engine::solver::harmonic::solve_harmonic_3d(&harmonic_input)
        .expect("Harmonic solve failed");
    let full_solver_us = t0.elapsed().as_micros() as u64;

    println!("  full_solver:     {:>8} us", full_solver_us);
}

/// Guyan 3D phase breakdown: measure wall time of each phase in guyan_reduce_3d.
#[test]
fn guyan_phase_breakdown() {
    let nx = 20;
    let ny = 20;

    let (input, grid) = make_flat_plate_with_grid(nx, ny);
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;

    // Boundary nodes = all perimeter nodes
    let mut boundary_nodes = Vec::new();
    for j in 0..=ny {
        boundary_nodes.push(grid[0][j]);
        boundary_nodes.push(grid[nx][j]);
    }
    for i in 0..=nx {
        boundary_nodes.push(grid[i][0]);
        boundary_nodes.push(grid[i][ny]);
    }
    boundary_nodes.sort();
    boundary_nodes.dedup();

    println!("\n=== Guyan 3D Phase Breakdown ({}x{} MITC4) ===", nx, ny);
    println!("  nf={}  boundary_nodes={}", nf, boundary_nodes.len());

    // Phase 1: sparse assembly
    let t0 = Instant::now();
    let sasm = assembly::assemble_sparse_3d(&input, &dof_num, false);
    let sparse_asm_us = t0.elapsed().as_micros() as u64;

    // Phase 2: dense conversion
    let t0 = Instant::now();
    let k_ff = sasm.k_ff.to_dense_symmetric();
    let dense_conv_us = t0.elapsed().as_micros() as u64;

    let f_f: Vec<f64> = sasm.f[..nf].to_vec();

    // No constraints → ns = nf
    let ns = nf;

    // Phase 3: DOF partition
    let t0 = Instant::now();
    let mut boundary_dofs = Vec::new();
    let mut interior_dofs = Vec::new();
    for i in 0..ns {
        let is_boundary = dof_num.map.iter().any(|(&(nid, _), &gdof)| {
            gdof == i && boundary_nodes.contains(&nid)
        });
        if is_boundary {
            boundary_dofs.push(i);
        } else {
            interior_dofs.push(i);
        }
    }
    let nb = boundary_dofs.len();
    let ni = interior_dofs.len();
    let dof_partition_us = t0.elapsed().as_micros() as u64;

    println!("  nb={}  ni={}", nb, ni);

    // Phase 4: block extraction
    let t0 = Instant::now();
    let k_bb = extract_submatrix(&k_ff, ns, &boundary_dofs, &boundary_dofs);
    let k_bi = extract_submatrix(&k_ff, ns, &boundary_dofs, &interior_dofs);
    let k_ib = extract_submatrix(&k_ff, ns, &interior_dofs, &boundary_dofs);
    let k_ii = extract_submatrix(&k_ff, ns, &interior_dofs, &interior_dofs);
    let f_b: Vec<f64> = boundary_dofs.iter().map(|&d| f_f[d]).collect();
    let f_i: Vec<f64> = interior_dofs.iter().map(|&d| f_f[d]).collect();
    let block_extract_us = t0.elapsed().as_micros() as u64;

    // Phase 5: interior solves (Cholesky factorize-once + nb+1 back-substitutions)
    let t0 = Instant::now();
    let mut l_ii = k_ii.clone();
    assert!(cholesky_decompose(&mut l_ii, ni), "K_II not SPD");
    let chol_factor_us = t0.elapsed().as_micros() as u64;

    let t0 = Instant::now();
    let y = forward_solve(&l_ii, &f_i, ni);
    let _kii_inv_fi = back_solve(&l_ii, &y, ni);

    let mut kii_inv_kib = vec![0.0; ni * nb];
    for j in 0..nb {
        let col: Vec<f64> = (0..ni).map(|i| k_ib[i * nb + j]).collect();
        let y = forward_solve(&l_ii, &col, ni);
        let sol = back_solve(&l_ii, &y, ni);
        for i in 0..ni {
            kii_inv_kib[i * nb + j] = sol[i];
        }
    }
    let back_subs_us = t0.elapsed().as_micros() as u64;
    let interior_solves_us = chol_factor_us + back_subs_us;

    // Phase 6: condensed assembly (K_c = K_BB - K_BI * Ψ)
    let t0 = Instant::now();
    let mut k_condensed = k_bb.clone();
    for i in 0..nb {
        for j in 0..nb {
            let mut sum = 0.0;
            for p in 0..ni {
                sum += k_bi[i * ni + p] * kii_inv_kib[p * nb + j];
            }
            k_condensed[i * nb + j] -= sum;
        }
    }
    let mut f_condensed = f_b.clone();
    for i in 0..nb {
        let mut sum = 0.0;
        for p in 0..ni {
            sum += k_bi[i * ni + p] * _kii_inv_fi[p];
        }
        f_condensed[i] -= sum;
    }
    let condensed_asm_us = t0.elapsed().as_micros() as u64;

    // Phase 7: condensed solve + interior recovery
    let t0 = Instant::now();
    let mut k_work = k_condensed.clone();
    let mut f_work = f_condensed.clone();
    let u_b = lu_solve(&mut k_work, &mut f_work, nb).expect("Condensed singular");

    let mut rhs_i = f_i;
    for i in 0..ni {
        let mut sum = 0.0;
        for j in 0..nb {
            sum += k_ib[i * nb + j] * u_b[j];
        }
        rhs_i[i] -= sum;
    }
    let mut k_work = k_ii;
    let mut b_work = rhs_i;
    let _u_i = lu_solve(&mut k_work, &mut b_work, ni).expect("K_II singular (recovery)");
    let condensed_solve_us = t0.elapsed().as_micros() as u64;

    let sum_phases = sparse_asm_us + dense_conv_us + dof_partition_us + block_extract_us
        + interior_solves_us + condensed_asm_us + condensed_solve_us;

    println!("  sparse_asm:      {:>8} us", sparse_asm_us);
    println!("  dense_conv:      {:>8} us", dense_conv_us);
    println!("  dof_partition:   {:>8} us", dof_partition_us);
    println!("  block_extract:   {:>8} us", block_extract_us);
    println!("  interior_solves: {:>8} us  (Cholesky {}us + {} back-subs {}us on {}x{} K_II)", interior_solves_us, chol_factor_us, nb + 1, back_subs_us, ni, ni);
    println!("  condensed_asm:   {:>8} us", condensed_asm_us);
    println!("  condensed_solve: {:>8} us", condensed_solve_us);
    println!("  --------------------------------");
    println!("  sum_phases:      {:>8} us", sum_phases);

    // Full solver for comparison
    let guyan_input = GuyanInput3D {
        solver: input,
        boundary_nodes,
    };
    let t0 = Instant::now();
    let _result = dedaliano_engine::solver::reduction::guyan_reduce_3d(&guyan_input)
        .expect("Guyan solve failed");
    let full_solver_us = t0.elapsed().as_micros() as u64;

    println!("  full_solver:     {:>8} us", full_solver_us);
}

/// Craig-Bampton 3D phase breakdown: measure wall time of each phase in craig_bampton_3d.
#[test]
fn craig_bampton_phase_breakdown() {
    let nx = 20;
    let ny = 20;
    let n_modes = 10;

    let (input, grid) = make_flat_plate_with_grid(nx, ny);
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);

    // Boundary nodes = perimeter
    let mut boundary_nodes = Vec::new();
    for j in 0..=ny {
        boundary_nodes.push(grid[0][j]);
        boundary_nodes.push(grid[nx][j]);
    }
    for i in 0..=nx {
        boundary_nodes.push(grid[i][0]);
        boundary_nodes.push(grid[i][ny]);
    }
    boundary_nodes.sort();
    boundary_nodes.dedup();

    println!("\n=== Craig-Bampton 3D Phase Breakdown ({}x{} MITC4, {} modes) ===", nx, ny, n_modes);
    println!("  nf={}  boundary_nodes={}", nf, boundary_nodes.len());

    // Phase 1: sparse assembly
    let t0 = Instant::now();
    let sasm = assembly::assemble_sparse_3d(&input, &dof_num, false);
    let sparse_asm_us = t0.elapsed().as_micros() as u64;

    // Phase 2: dense conversion
    let t0 = Instant::now();
    let k_ff = sasm.k_ff.to_dense_symmetric();
    let dense_conv_us = t0.elapsed().as_micros() as u64;

    // Phase 3: mass matrix assembly + extraction
    let t0 = Instant::now();
    let m_full = assemble_mass_matrix_3d(&input, &dof_num, &densities);
    let free_idx: Vec<usize> = (0..nf).collect();
    let m_ff = extract_submatrix(&m_full, n, &free_idx, &free_idx);
    let mass_matrix_us = t0.elapsed().as_micros() as u64;

    let ns = nf;

    // Phase 4: DOF partition
    let t0 = Instant::now();
    let mut boundary_dofs = Vec::new();
    let mut interior_dofs = Vec::new();
    for i in 0..ns {
        let is_boundary = dof_num.map.iter().any(|(&(nid, _), &gdof)| {
            gdof == i && boundary_nodes.contains(&nid)
        });
        if is_boundary {
            boundary_dofs.push(i);
        } else {
            interior_dofs.push(i);
        }
    }
    let nb = boundary_dofs.len();
    let ni = interior_dofs.len();
    let dof_partition_us = t0.elapsed().as_micros() as u64;

    println!("  nb={}  ni={}", nb, ni);

    // Phase 5: block extraction (K and M)
    let t0 = Instant::now();
    let k_bb = extract_submatrix(&k_ff, ns, &boundary_dofs, &boundary_dofs);
    let k_bi = extract_submatrix(&k_ff, ns, &boundary_dofs, &interior_dofs);
    let k_ib = extract_submatrix(&k_ff, ns, &interior_dofs, &boundary_dofs);
    let k_ii = extract_submatrix(&k_ff, ns, &interior_dofs, &interior_dofs);
    let _m_bb = extract_submatrix(&m_ff, ns, &boundary_dofs, &boundary_dofs);
    let _m_bi = extract_submatrix(&m_ff, ns, &boundary_dofs, &interior_dofs);
    let _m_ib = extract_submatrix(&m_ff, ns, &interior_dofs, &boundary_dofs);
    let m_ii = extract_submatrix(&m_ff, ns, &interior_dofs, &interior_dofs);
    let block_extract_us = t0.elapsed().as_micros() as u64;

    // Phase 6: constraint modes (Cholesky factorize-once + nb back-subs)
    let t0 = Instant::now();
    let mut l_ii = k_ii.clone();
    assert!(cholesky_decompose(&mut l_ii, ni), "K_II not SPD");
    let cb_chol_factor_us = t0.elapsed().as_micros() as u64;

    let t0 = Instant::now();
    let mut psi_s = vec![0.0; ni * nb];
    for j in 0..nb {
        let col: Vec<f64> = (0..ni).map(|i| k_ib[i * nb + j]).collect();
        let y = forward_solve(&l_ii, &col, ni);
        let sol = back_solve(&l_ii, &y, ni);
        for i in 0..ni {
            psi_s[i * nb + j] = -sol[i];
        }
    }
    let cb_back_subs_us = t0.elapsed().as_micros() as u64;
    let constraint_modes_us = cb_chol_factor_us + cb_back_subs_us;

    // Phase 7: interior eigenproblem (K_II φ = ω² M_II φ) via Lanczos shift-invert
    // Lanczos factorizes K_II (SPD), not M_II — works even if M_II has zero-mass DOFs
    let t0 = Instant::now();
    let eigen_opt = lanczos_generalized_eigen(&k_ii, &m_ii, ni, n_modes, 0.0);
    let interior_eigen_us = t0.elapsed().as_micros() as u64;

    let (n_modes_kept, reduced_asm_us) = if let Some(eigen) = eigen_opt {
        let n_modes_kept = n_modes.min(eigen.values.len());
        let nk = eigen.values.len();

        let mut phi_m = vec![0.0; ni * n_modes_kept];
        for m in 0..n_modes_kept {
            let mut max_val = 0.0f64;
            for i in 0..ni {
                let v = eigen.vectors[i * nk + m].abs();
                if v > max_val { max_val = v; }
            }
            for i in 0..ni {
                phi_m[i * n_modes_kept + m] = if max_val > 1e-20 {
                    eigen.vectors[i * nk + m] / max_val
                } else {
                    0.0
                };
            }
        }

        // Phase 8: reduced assembly (T^T K T and T^T M T)
        let t0 = Instant::now();
        let nr = nb + n_modes_kept;

        let mut k_ii_phi = vec![0.0; ni * n_modes_kept];
        for i in 0..ni {
            for m in 0..n_modes_kept {
                let mut s = 0.0;
                for p in 0..ni { s += k_ii[i * ni + p] * phi_m[p * n_modes_kept + m]; }
                k_ii_phi[i * n_modes_kept + m] = s;
            }
        }
        let mut k_ii_psi = vec![0.0; ni * nb];
        for i in 0..ni {
            for j in 0..nb {
                let mut s = 0.0;
                for p in 0..ni { s += k_ii[i * ni + p] * psi_s[p * nb + j]; }
                k_ii_psi[i * nb + j] = s;
            }
        }
        let mut _k_reduced = vec![0.0; nr * nr];
        for i in 0..nb {
            for j in 0..nb {
                let mut val = k_bb[i * nb + j];
                for p in 0..ni {
                    val += k_bi[i * ni + p] * psi_s[p * nb + j];
                    val += psi_s[p * nb + i] * k_ib[p * nb + j];
                }
                for p in 0..ni { val += psi_s[p * nb + i] * k_ii_psi[p * nb + j]; }
                _k_reduced[i * nr + j] = val;
            }
        }
        for i in 0..nb {
            for m in 0..n_modes_kept {
                let mut val = 0.0;
                for p in 0..ni {
                    val += k_bi[i * ni + p] * phi_m[p * n_modes_kept + m];
                    val += psi_s[p * nb + i] * k_ii_phi[p * n_modes_kept + m];
                }
                _k_reduced[i * nr + (nb + m)] = val;
                _k_reduced[(nb + m) * nr + i] = val;
            }
        }
        for m1 in 0..n_modes_kept {
            for m2 in 0..n_modes_kept {
                let mut val = 0.0;
                for p in 0..ni { val += phi_m[p * n_modes_kept + m1] * k_ii_phi[p * n_modes_kept + m2]; }
                _k_reduced[(nb + m1) * nr + (nb + m2)] = val;
            }
        }
        let reduced_asm_us = t0.elapsed().as_micros() as u64;
        (n_modes_kept, reduced_asm_us)
    } else {
        (0, 0)
    };

    let sum_phases = sparse_asm_us + dense_conv_us + mass_matrix_us + dof_partition_us
        + block_extract_us + constraint_modes_us + interior_eigen_us + reduced_asm_us;

    println!("  sparse_asm:       {:>8} us", sparse_asm_us);
    println!("  dense_conv:       {:>8} us", dense_conv_us);
    println!("  mass_matrix:      {:>8} us", mass_matrix_us);
    println!("  dof_partition:    {:>8} us", dof_partition_us);
    println!("  block_extract:    {:>8} us", block_extract_us);
    println!("  constraint_modes: {:>8} us  (Cholesky {}us + {} back-subs {}us on {}x{} K_II)", constraint_modes_us, cb_chol_factor_us, nb, cb_back_subs_us, ni, ni);
    let eigen_ok = n_modes_kept > 0;
    if eigen_ok {
        println!("  interior_eigen:   {:>8} us  (Lanczos {} modes from {}x{})", interior_eigen_us, n_modes_kept, ni, ni);
        println!("  reduced_asm:      {:>8} us  (K only, {}x{} reduced)", reduced_asm_us, nb + n_modes_kept, nb + n_modes_kept);
    } else {
        println!("  interior_eigen:   {:>8} us  (FAILED — Lanczos failed, {}x{})", interior_eigen_us, ni, ni);
        println!("  reduced_asm:      {:>8}", "N/A");
    }
    println!("  --------------------------------");
    println!("  sum_phases:       {:>8} us", sum_phases);

    // Full solver for comparison
    let cb_input = CraigBamptonInput3D {
        solver: input,
        boundary_nodes,
        n_modes,
        densities,
    };
    let t0 = Instant::now();
    let result = dedaliano_engine::solver::reduction::craig_bampton_3d(&cb_input);
    let full_solver_us = t0.elapsed().as_micros() as u64;

    match result {
        Ok(r) => {
            println!("  full_solver:      {:>8} us", full_solver_us);
            println!("  interior freqs:   {:?}", r.interior_frequencies);
        }
        Err(e) => {
            println!("  full_solver:      {:>8} us  (FAILED: {})", full_solver_us, e);
        }
    }
}

/// Harmonic 3D: modal vs direct timing comparison.
/// The modal path eigensolves once then sweeps at O(p) per step;
/// the direct path does a full 2n×2n LU per frequency step.
#[test]
#[ignore] // ~600s on CI runners — run locally with `cargo test -- --ignored`
fn harmonic_modal_vs_direct_timing() {
    let nx = 20;
    let ny = 20;
    let n_freq = 50;
    let damping_ratio = 0.05;

    let (input, grid) = make_flat_plate_with_grid(nx, ny);
    let center_node = grid[nx / 2][ny / 2];

    let frequencies: Vec<f64> = (0..n_freq)
        .map(|i| 0.1 + (100.0 - 0.1) * i as f64 / (n_freq - 1) as f64)
        .collect();

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);

    println!("\n=== Harmonic Modal vs Direct ({}x{} MITC4, {} freq steps) ===", nx, ny, n_freq);

    // Modal path (via solve_harmonic_3d which now uses modal superposition)
    let harmonic_input = HarmonicInput3D {
        solver: input.clone(),
        densities: densities.clone(),
        frequencies: frequencies.clone(),
        damping_ratio,
        response_node_id: center_node,
        response_dof: "z".to_string(),
    };
    let t0 = Instant::now();
    let modal_result = dedaliano_engine::solver::harmonic::solve_harmonic_3d(&harmonic_input)
        .expect("Modal harmonic solve failed");
    let modal_us = t0.elapsed().as_micros() as u64;

    // Direct path: manual assembly + block LU per frequency
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;
    let sasm = assembly::assemble_sparse_3d(&input, &dof_num, false);
    let k_ff = sasm.k_ff.to_dense_symmetric();
    let f_ff: Vec<f64> = sasm.f[..nf].to_vec();
    let m_full = assemble_mass_matrix_3d(&input, &dof_num, &densities);
    let free_idx: Vec<usize> = (0..nf).collect();
    let m_ff = extract_submatrix(&m_full, n, &free_idx, &free_idx);

    let (a0, a1) = {
        let eigen = lanczos_generalized_eigen(&k_ff, &m_ff, nf, 2, 0.0);
        if let Some(ref res) = eigen {
            let positive: Vec<f64> = res.values.iter().copied().filter(|&v| v > 1e-10).collect();
            if positive.len() >= 2 {
                rayleigh_coefficients(positive[0].sqrt(), positive[1].sqrt(), damping_ratio)
            } else {
                (0.0, 0.0)
            }
        } else {
            (0.0, 0.0)
        }
    };
    let c_s = rayleigh_damping_matrix(&m_ff, &k_ff, nf, a0, a1);

    let t0 = Instant::now();
    for &freq in &frequencies {
        let omega = 2.0 * std::f64::consts::PI * freq;
        let _ = dedaliano_engine::solver::harmonic::solve_complex_system(
            &k_ff, &m_ff, &c_s, &f_ff, nf, omega,
        );
    }
    let direct_sweep_us = t0.elapsed().as_micros() as u64;

    let speedup = if modal_us > 0 { direct_sweep_us as f64 / modal_us as f64 } else { 0.0 };

    println!("  nf = {}", nf);
    println!("  Modal (full solve_harmonic_3d): {} us", modal_us);
    println!("  Direct (sweep only, {} steps):  {} us", n_freq, direct_sweep_us);
    println!("  Speedup: {:.1}x", speedup);
    println!("  Modal peak: {:.4} Hz, amp={:.6e}", modal_result.peak_frequency, modal_result.peak_amplitude);
}
