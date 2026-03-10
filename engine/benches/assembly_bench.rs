use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use dedaliano_engine::solver::{linear, assembly, sparse_assembly, conditioning};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::types::*;
use std::collections::HashMap;

// ─── Helpers ─────────────────────────────────────────────

fn make_input(
    nodes: Vec<(usize, f64, f64)>,
    mats: Vec<(usize, f64, f64)>,
    secs: Vec<(usize, f64, f64)>,
    elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)>,
    sups: Vec<(usize, usize, &str)>,
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let mut nodes_map = HashMap::new();
    for (id, x, y) in nodes {
        nodes_map.insert(id.to_string(), SolverNode { id, x, y });
    }
    let mut mats_map = HashMap::new();
    for (id, e, nu) in mats {
        mats_map.insert(id.to_string(), SolverMaterial { id, e, nu });
    }
    let mut secs_map = HashMap::new();
    for (id, a, iz) in secs {
        secs_map.insert(id.to_string(), SolverSection { id, a, iz, as_y: None });
    }
    let mut elems_map = HashMap::new();
    for (id, t, ni, nj, mi, si, hs, he) in elems {
        elems_map.insert(
            id.to_string(),
            SolverElement {
                id,
                elem_type: t.to_string(),
                node_i: ni,
                node_j: nj,
                material_id: mi,
                section_id: si,
                hinge_start: hs,
                hinge_end: he,
            },
        );
    }
    let mut sups_map = HashMap::new();
    for (id, nid, t) in sups {
        sups_map.insert(
            id.to_string(),
            SolverSupport {
                id,
                node_id: nid,
                support_type: t.to_string(),
                kx: None,
                ky: None,
                kz: None,
                dx: None,
                dy: None,
                drz: None,
                angle: None,
            },
        );
    }
    SolverInput {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads,
        constraints: vec![],
        connectors: HashMap::new(),
    }
}

/// Simply-supported beam with n_elem frame elements and UDL.
fn make_ss_beam(n_elem: usize) -> SolverInput {
    let l = 10.0;
    let e = 200_000.0;
    let a = 0.01;
    let iz = 1e-4;
    let q = -10.0;
    let elem_len = l / n_elem as f64;

    let mut nodes = Vec::new();
    for i in 0..=n_elem {
        nodes.push((i + 1, i as f64 * elem_len, 0.0));
    }
    let mut elems = Vec::new();
    for i in 0..n_elem {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    let sups = vec![(1, 1, "pinned"), (2, n_elem + 1, "rollerX")];
    let mut loads = Vec::new();
    for i in 0..n_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    make_input(
        nodes,
        vec![(1, e, 0.3)],
        vec![(1, a, iz)],
        elems,
        sups,
        loads,
    )
}

// ─── Assembly Benchmarks ─────────────────────────────────

fn bench_assembly(c: &mut Criterion) {
    let mut group = c.benchmark_group("assembly");

    for &n_elem in &[10, 100, 500, 1000] {
        let input = make_ss_beam(n_elem);
        let dof_num = DofNumbering::build_2d(&input);

        group.bench_with_input(
            BenchmarkId::new("dense_2d", n_elem),
            &n_elem,
            |b, _| {
                b.iter(|| assembly::assemble_2d(&input, &dof_num));
            },
        );

        group.bench_with_input(
            BenchmarkId::new("sparse_existing_2d", n_elem),
            &n_elem,
            |b, _| {
                b.iter(|| assembly::assemble_sparse_2d(&input, &dof_num));
            },
        );

        group.bench_with_input(
            BenchmarkId::new("sparse_triplet_2d", n_elem),
            &n_elem,
            |b, _| {
                b.iter(|| {
                    let result = sparse_assembly::assemble_2d_sparse(&input, &dof_num);
                    result.triplets.to_csc()
                });
            },
        );

        group.bench_with_input(
            BenchmarkId::new("sparse_parallel_2d", n_elem),
            &n_elem,
            |b, _| {
                b.iter(|| {
                    let result = sparse_assembly::assemble_elements_parallel_2d(&input, &dof_num);
                    result.triplets.to_csc()
                });
            },
        );
    }

    group.finish();
}

// ─── Conditioning Benchmark ──────────────────────────────

fn bench_conditioning(c: &mut Criterion) {
    let mut group = c.benchmark_group("conditioning");

    for &n_elem in &[10, 100] {
        let input = make_ss_beam(n_elem);
        let dof_num = DofNumbering::build_2d(&input);
        let asm = assembly::assemble_2d(&input, &dof_num);
        let n = dof_num.n_total;

        group.bench_with_input(
            BenchmarkId::new("check_conditioning", n_elem),
            &n_elem,
            |b, _| {
                b.iter(|| conditioning::check_conditioning(&asm.k, n));
            },
        );
    }

    group.finish();
}

// ─── Linear Solve Benchmark ─────────────────────────────

fn bench_linear_solve(c: &mut Criterion) {
    let mut group = c.benchmark_group("linear_solve");

    for &n_elem in &[10, 100, 500, 1000] {
        let input = make_ss_beam(n_elem);

        group.bench_with_input(
            BenchmarkId::new("solve_2d", n_elem),
            &n_elem,
            |b, _| {
                b.iter(|| linear::solve_2d(&input).unwrap());
            },
        );
    }

    group.finish();
}

// ─── Dense vs Sparse Solve Comparison ────────────────────

fn bench_dense_vs_sparse_solve(c: &mut Criterion) {
    use dedaliano_engine::linalg::*;

    let mut group = c.benchmark_group("dense_vs_sparse_solve");
    group.sample_size(20);

    for &n_elem in &[200, 500] {
        let input = make_ss_beam(n_elem);
        let dof_num = DofNumbering::build_2d(&input);
        let nf = dof_num.n_free;

        // Dense assembly + Cholesky
        group.bench_with_input(
            BenchmarkId::new("dense_cholesky", n_elem),
            &n_elem,
            |b, _| {
                let asm = assembly::assemble_2d(&input, &dof_num);
                let n = dof_num.n_total;
                let free_idx: Vec<usize> = (0..nf).collect();
                let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
                let f_f = extract_subvec(&asm.f, &free_idx);
                b.iter(|| {
                    let mut k = k_ff.clone();
                    cholesky_solve(&mut k, &f_f, nf)
                });
            },
        );

        // Sparse assembly + sparse Cholesky
        group.bench_with_input(
            BenchmarkId::new("sparse_cholesky", n_elem),
            &n_elem,
            |b, _| {
                let sasm = assembly::assemble_sparse_2d(&input, &dof_num);
                let f_f = extract_subvec(&sasm.f, &(0..nf).collect::<Vec<_>>());
                b.iter(|| {
                    sparse_cholesky_solve_full(&sasm.k_ff, &f_f)
                });
            },
        );
    }

    group.finish();
}

// ─── 3D Shell Helpers ────────────────────────────────────

fn make_flat_plate_3d(nx: usize, ny: usize) -> SolverInput3D {
    use dedaliano_engine::types::{
        SolverNode3D, SolverSupport3D, SolverQuadElement, SolverLoad3D,
        SolverPressureLoad, SolverMaterial, SolverInput3D,
    };

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
        supports.insert(sid.to_string(), SolverSupport3D {
            node_id: n, rx: false, ry: false, rz: true,
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
    // Pin one corner fully
    supports.insert(sid.to_string(), SolverSupport3D {
        node_id: grid[0][0], rx: true, ry: true, rz: true,
        rrx: false, rry: false, rrz: false,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None, rw: None, kw: None,
    });

    let n_quads = quads.len();
    let loads: Vec<SolverLoad3D> = (1..=n_quads).map(|eid| {
        SolverLoad3D::QuadPressure(SolverPressureLoad { element_id: eid, pressure: -1.0 })
    }).collect();

    SolverInput3D {
        nodes, materials: mats, sections: HashMap::new(),
        elements: HashMap::new(), supports, loads,
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads,
        curved_beams: vec![], connectors: HashMap::new(),
    }
}

// ─── 3D Shell Assembly Benchmark ─────────────────────────

fn bench_assembly_3d_shell(c: &mut Criterion) {
    use dedaliano_engine::solver::dof::DofNumbering as DN;

    let mut group = c.benchmark_group("assembly_3d_shell");
    group.sample_size(20);

    for &(nx, ny) in &[(6, 6), (10, 10), (15, 15)] {
        let input = make_flat_plate_3d(nx, ny);
        let dof_num = DN::build_3d(&input);
        let label = format!("{}x{}", nx, ny);

        group.bench_with_input(
            BenchmarkId::new("dense_3d_assembly", &label),
            &(&input, &dof_num),
            |b, (inp, dn)| {
                b.iter(|| assembly::assemble_3d(inp, dn));
            },
        );

        group.bench_with_input(
            BenchmarkId::new("sparse_3d_assembly", &label),
            &(&input, &dof_num),
            |b, (inp, dn)| {
                b.iter(|| assembly::assemble_sparse_3d(inp, dn));
            },
        );
    }

    group.finish();
}

// ─── 3D Shell Solve Benchmark (dense LU vs sparse Cholesky) ─

fn bench_solve_3d_shell(c: &mut Criterion) {
    use dedaliano_engine::solver::dof::DofNumbering as DN;
    use dedaliano_engine::linalg::*;

    let mut group = c.benchmark_group("solve_3d_shell");
    group.sample_size(10);

    for &(nx, ny) in &[(6, 6), (10, 10), (15, 15)] {
        let input = make_flat_plate_3d(nx, ny);
        let dof_num = DN::build_3d(&input);
        let nf = dof_num.n_free;
        let n = dof_num.n_total;
        let label = format!("{}x{}", nx, ny);

        // Dense LU baseline
        group.bench_with_input(
            BenchmarkId::new("dense_lu_3d", &label),
            &(&input, &dof_num),
            |b, (inp, dn)| {
                let asm = assembly::assemble_3d(inp, dn);
                let free_idx: Vec<usize> = (0..nf).collect();
                let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
                let f_f = extract_subvec(&asm.f, &free_idx);
                b.iter(|| {
                    let mut k = k_ff.clone();
                    lu_solve(&mut k, &mut f_f.clone(), nf)
                });
            },
        );

        // Sparse Cholesky
        group.bench_with_input(
            BenchmarkId::new("sparse_cholesky_3d", &label),
            &(&input, &dof_num),
            |b, (inp, dn)| {
                let sasm = assembly::assemble_sparse_3d(inp, dn);
                let f_f: Vec<f64> = sasm.f[..nf].to_vec();
                b.iter(|| {
                    sparse_cholesky_solve_full(&sasm.k_ff, &f_f)
                });
            },
        );
    }

    group.finish();
}

criterion_group!(
    benches,
    bench_assembly,
    bench_conditioning,
    bench_linear_solve,
    bench_dense_vs_sparse_solve,
    bench_assembly_3d_shell,
    bench_solve_3d_shell,
);
criterion_main!(benches);
