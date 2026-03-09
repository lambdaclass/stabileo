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

    for &n_elem in &[10, 100] {
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

    for &n_elem in &[10, 100] {
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

criterion_group!(
    benches,
    bench_assembly,
    bench_conditioning,
    bench_linear_solve,
);
criterion_main!(benches);
