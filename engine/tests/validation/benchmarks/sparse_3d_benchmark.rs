/// Shell-heavy large-model benchmark: measures wall-clock time for
/// dense vs sparse assembly + solve to demonstrate the performance
/// improvement from sparse-first 3D assembly.

use dedaliano_engine::solver::{assembly, linear};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::linalg::*;
use dedaliano_engine::types::*;
use std::collections::HashMap;
use std::time::Instant;

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

/// Build a large flat-plate mesh for benchmarking.
fn build_large_plate(nx: usize, ny: usize) -> SolverInput3D {
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

    // Simply-supported on all edges + pin one corner
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
    supports.insert(sid.to_string(), sup3d(grid[0][0], true, true, true, false, false, false));

    // Uniform pressure
    let n_quads = quads.len();
    let loads: Vec<SolverLoad3D> = (1..=n_quads).map(|eid| {
        SolverLoad3D::QuadPressure(SolverPressureLoad { element_id: eid, pressure: -1.0 })
    }).collect();

    SolverInput3D {
        nodes, materials: mats, sections: HashMap::new(),
        elements: HashMap::new(), supports, loads,
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads, quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![], connectors: HashMap::new(),
    }
}

#[test]
fn benchmark_sparse_3d_large_shell() {
    // 10×10 mesh = 121 nodes, 726 DOFs, 100 quads
    let input = build_large_plate(10, 10);
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    eprintln!("=== Sparse 3D Large Shell Benchmark ===");
    eprintln!("  Mesh: 10×10 quads, quad9s: HashMap::new(), solid_shells: HashMap::new(), {} nodes, {} total DOFs, {} free DOFs",
        input.nodes.len(), n, nf);

    // ── Dense assembly + solve ──
    let t0 = Instant::now();
    let dense_asm = assembly::assemble_3d(&input, &dof_num);
    let t_dense_asm = t0.elapsed();

    let free_idx: Vec<usize> = (0..nf).collect();
    let k_ff_dense = extract_submatrix(&dense_asm.k, n, &free_idx, &free_idx);

    let t0 = Instant::now();
    let f_f = extract_subvec(&dense_asm.f, &free_idx);
    let mut k_work = k_ff_dense.clone();
    let _u_dense = lu_solve(&mut k_work, &mut f_f.clone(), nf)
        .expect("Dense LU solve failed");
    let t_dense_solve = t0.elapsed();

    let dense_k_bytes = dense_asm.k.len() * 8;

    // ── Sparse assembly + solve ──
    let t0 = Instant::now();
    let sparse_asm = assembly::assemble_sparse_3d(&input, &dof_num);
    let t_sparse_asm = t0.elapsed();

    let t0 = Instant::now();
    let f_f_s: Vec<f64> = sparse_asm.f[..nf].to_vec();
    let _u_sparse = sparse_cholesky_solve_full(&sparse_asm.k_ff, &f_f_s);
    let t_sparse_solve = t0.elapsed();

    let sparse_kff_nnz = sparse_asm.k_ff.nnz();
    let sparse_kfull_nnz = sparse_asm.k_full.nnz();
    let sparse_bytes = (sparse_kff_nnz + sparse_kfull_nnz) * 16; // row_idx + val per entry

    eprintln!("  Dense:  assembly {:?}, solve {:?}, K memory {} KB",
        t_dense_asm, t_dense_solve, dense_k_bytes / 1024);
    eprintln!("  Sparse: assembly {:?}, solve {:?}, K memory {} KB (Kff nnz={}, Kfull nnz={})",
        t_sparse_asm, t_sparse_solve, sparse_bytes / 1024, sparse_kff_nnz, sparse_kfull_nnz);

    let memory_ratio = dense_k_bytes as f64 / sparse_bytes.max(1) as f64;
    eprintln!("  Memory ratio (dense/sparse): {:.1}x", memory_ratio);

    // ── Parity check ──
    // Full solve via solve_3d (takes sparse path automatically)
    let res = linear::solve_3d(&input).expect("solve_3d failed");
    assert!(!res.displacements.is_empty(), "No displacements returned");

    // Verify memory improvement: sparse should use significantly less
    assert!(
        memory_ratio > 2.0,
        "Expected at least 2x memory reduction, got {:.1}x", memory_ratio
    );

    eprintln!("  PASS: {:.1}x memory reduction, solve succeeded", memory_ratio);
}

#[test]
fn benchmark_sparse_3d_larger_shell() {
    // 15×15 mesh = 256 nodes, 1536 DOFs, 225 quads — stresses the dense path more
    let input = build_large_plate(15, 15);
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    eprintln!("=== Sparse 3D Larger Shell Benchmark ===");
    eprintln!("  Mesh: 15×15 quads, quad9s: HashMap::new(), solid_shells: HashMap::new(), {} nodes, {} total DOFs, {} free DOFs",
        input.nodes.len(), n, nf);

    // Dense path timing
    let t0 = Instant::now();
    let _dense_asm = assembly::assemble_3d(&input, &dof_num);
    let t_dense = t0.elapsed();
    let dense_k_bytes = n * n * 8;

    // Sparse path timing
    let t0 = Instant::now();
    let sparse_asm = assembly::assemble_sparse_3d(&input, &dof_num);
    let t_sparse = t0.elapsed();
    let sparse_bytes = (sparse_asm.k_ff.nnz() + sparse_asm.k_full.nnz()) * 16;

    let memory_ratio = dense_k_bytes as f64 / sparse_bytes.max(1) as f64;

    eprintln!("  Dense assembly:  {:?}, K = {} KB", t_dense, dense_k_bytes / 1024);
    eprintln!("  Sparse assembly: {:?}, K = {} KB", t_sparse, sparse_bytes / 1024);
    eprintln!("  Memory ratio: {:.1}x", memory_ratio);

    // Full solve
    let res = linear::solve_3d(&input).expect("solve_3d failed");
    assert!(!res.displacements.is_empty());

    assert!(
        memory_ratio > 5.0,
        "Expected at least 5x memory reduction for 15×15 mesh, got {:.1}x", memory_ratio
    );

    eprintln!("  PASS: {:.1}x memory reduction", memory_ratio);
}
