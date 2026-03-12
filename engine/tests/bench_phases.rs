//! One-shot phase breakdown: prints SolveTimings for various MITC4 plate sizes.
//! Run with: cargo test --release --test bench_phases -- --nocapture

use dedaliano_engine::solver::{linear, assembly, dof::DofNumbering};
use dedaliano_engine::linalg::{extract_submatrix, extract_subvec, lu_solve};
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
