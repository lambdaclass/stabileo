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

/// Mixed model: frame columns + quad slab at each storey level.
fn make_mixed_frame_slab_3d(n_stories: usize, nx: usize, ny: usize) -> SolverInput3D {
    use dedaliano_engine::types::*;

    let lx = 12.0;
    let ly = 12.0;
    let storey_h = 3.5;

    let mut nodes = HashMap::new();
    let mut nid = 1;

    // Column base nodes at z=0
    let corner_coords = [(0.0, 0.0), (lx, 0.0), (lx, ly), (0.0, ly)];
    let mut level_corner_ids: Vec<[usize; 4]> = Vec::new();

    // Ground level corner nodes
    let mut base_ids = [0usize; 4];
    for (c, &(x, y)) in corner_coords.iter().enumerate() {
        nodes.insert(nid.to_string(), SolverNode3D { id: nid, x, y, z: 0.0 });
        base_ids[c] = nid;
        nid += 1;
    }

    // Slab grids for each storey
    let mut all_grids = Vec::new();
    for s in 0..n_stories {
        let z = (s + 1) as f64 * storey_h;
        let mut grid = vec![vec![0usize; ny + 1]; nx + 1];
        for i in 0..=nx {
            for j in 0..=ny {
                let x = (i as f64 / nx as f64) * lx;
                let y = (j as f64 / ny as f64) * ly;
                nodes.insert(nid.to_string(), SolverNode3D { id: nid, x, y, z });
                grid[i][j] = nid;
                nid += 1;
            }
        }
        let corners = [grid[0][0], grid[nx][0], grid[nx][ny], grid[0][ny]];
        level_corner_ids.push(corners);
        all_grids.push(grid);
    }

    // Frame columns: vertical segments at 4 corners
    let mut elements = HashMap::new();
    let mut eid = 1;
    for c in 0..4 {
        let mut bottom = base_ids[c];
        for s in 0..n_stories {
            let top = level_corner_ids[s][c];
            elements.insert(eid.to_string(), SolverElement3D {
                id: eid,
                elem_type: "frame".to_string(),
                node_i: bottom, node_j: top,
                material_id: 1, section_id: 1,
                hinge_start: false, hinge_end: false,
                local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
            });
            eid += 1;
            bottom = top;
        }
    }

    // Quad slabs at each storey
    let mut quads = HashMap::new();
    let mut qid = 1;
    for grid in &all_grids {
        for i in 0..nx {
            for j in 0..ny {
                quads.insert(qid.to_string(), SolverQuadElement {
                    id: qid,
                    nodes: [grid[i][j], grid[i+1][j], grid[i+1][j+1], grid[i][j+1]],
                    material_id: 1,
                    thickness: 0.2,
                });
                qid += 1;
            }
        }
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: 30_000.0, nu: 0.2 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: 0.16, iy: 2.13e-3, iz: 2.13e-3, j: 3.6e-3,
        cw: None, as_y: None, as_z: None,
    });

    // Fixed base supports
    let mut supports = HashMap::new();
    let mut sid = 1;
    for &base in &base_ids {
        supports.insert(sid.to_string(), SolverSupport3D {
            node_id: base, rx: true, ry: true, rz: true,
            rrx: true, rry: true, rrz: true,
            kx: None, ky: None, kz: None,
            krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None,
            drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None, rw: None, kw: None,
        });
        sid += 1;
    }

    // Pressure on all slab quads + lateral nodal load at top
    let n_quads = quads.len();
    let mut loads: Vec<SolverLoad3D> = (1..=n_quads).map(|eid| {
        SolverLoad3D::QuadPressure(SolverPressureLoad { element_id: eid, pressure: -5.0 })
    }).collect();
    // Lateral load at top corner
    if let Some(top_corners) = level_corner_ids.last() {
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: top_corners[0],
            fx: 20.0, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }));
    }

    SolverInput3D {
        nodes, materials: mats, sections, elements, supports, loads,
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads, quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![], connectors: HashMap::new(),
    }
}

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
        plates: HashMap::new(), quads, quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(),
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

// ─── Large 3D Assembly: Serial vs Parallel ──────────────

fn bench_assembly_3d_large(c: &mut Criterion) {
    use dedaliano_engine::solver::dof::DofNumbering as DN;

    let mut group = c.benchmark_group("assembly_3d_large");
    group.sample_size(10);

    for &(nx, ny) in &[(20, 20), (30, 30), (50, 50), (100, 100)] {
        let input = make_flat_plate_3d(nx, ny);
        let dof_num = DN::build_3d(&input);
        let label = format!("{}x{}", nx, ny);

        group.bench_with_input(
            BenchmarkId::new("serial_3d", &label),
            &(&input, &dof_num),
            |b, (inp, dn)| {
                b.iter(|| assembly::assemble_sparse_3d(inp, dn));
            },
        );

        group.bench_with_input(
            BenchmarkId::new("parallel_3d", &label),
            &(&input, &dof_num),
            |b, (inp, dn)| {
                b.iter(|| sparse_assembly::assemble_sparse_3d_parallel(inp, dn));
            },
        );
    }

    group.finish();
}

// ─── Mixed Model (Frames + Quads): Serial vs Parallel ───

fn bench_assembly_3d_mixed(c: &mut Criterion) {
    use dedaliano_engine::solver::dof::DofNumbering as DN;

    let mut group = c.benchmark_group("assembly_3d_mixed");
    group.sample_size(10);

    // (n_stories, nx, ny) → increasing model size
    for &(ns, nx, ny) in &[(3, 4, 4), (5, 6, 6), (8, 8, 8)] {
        let input = make_mixed_frame_slab_3d(ns, nx, ny);
        let dof_num = DN::build_3d(&input);
        let label = format!("{}s_{}x{}", ns, nx, ny);

        group.bench_with_input(
            BenchmarkId::new("serial_mixed", &label),
            &(&input, &dof_num),
            |b, (inp, dn)| {
                b.iter(|| assembly::assemble_sparse_3d(inp, dn));
            },
        );

        group.bench_with_input(
            BenchmarkId::new("parallel_mixed", &label),
            &(&input, &dof_num),
            |b, (inp, dn)| {
                b.iter(|| sparse_assembly::assemble_sparse_3d_parallel(inp, dn));
            },
        );
    }

    group.finish();
}

// ─── Quad9 Mesh Generator ───────────────────────────────

/// Flat plate meshed with 9-node serendipity quads, SS on all edges.
fn make_flat_plate_quad9(nx: usize, ny: usize) -> SolverInput3D {
    let lx = 10.0;
    let ly = 10.0;
    let t = 0.1;
    let e = 200_000.0;
    let nu = 0.3;

    // Node grid: (2*nx+1) x (2*ny+1)
    let gx = 2 * nx + 1;
    let gy = 2 * ny + 1;
    let mut nodes = HashMap::new();
    let mut grid = vec![vec![0usize; gy]; gx];
    let mut nid = 1;
    for i in 0..gx {
        for j in 0..gy {
            let x = (i as f64 / (gx - 1) as f64) * lx;
            let y = (j as f64 / (gy - 1) as f64) * ly;
            nodes.insert(nid.to_string(), SolverNode3D { id: nid, x, y, z: 0.0 });
            grid[i][j] = nid;
            nid += 1;
        }
    }

    // Each quad9 element picks 9 nodes from its 2x2 sub-grid
    let mut quad9s = HashMap::new();
    let mut qid = 1;
    for i in 0..nx {
        for j in 0..ny {
            let gi = 2 * i;
            let gj = 2 * j;
            // 4 corners, 4 midside, 1 center
            let q9_nodes: [usize; 9] = [
                grid[gi][gj], grid[gi+2][gj], grid[gi+2][gj+2], grid[gi][gj+2],    // corners
                grid[gi+1][gj], grid[gi+2][gj+1], grid[gi+1][gj+2], grid[gi][gj+1], // midside
                grid[gi+1][gj+1],                                                     // center
            ];
            quad9s.insert(qid.to_string(), SolverQuad9Element {
                id: qid,
                nodes: q9_nodes,
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
    for j in 0..gy { boundary.push(grid[0][j]); boundary.push(grid[gx-1][j]); }
    for i in 0..gx { boundary.push(grid[i][0]); boundary.push(grid[i][gy-1]); }
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

    let n_quads = quad9s.len();
    let loads: Vec<SolverLoad3D> = (1..=n_quads).map(|eid| {
        SolverLoad3D::Quad9Pressure(SolverPressureLoad { element_id: eid, pressure: -1.0 })
    }).collect();

    SolverInput3D {
        nodes, materials: mats, sections: HashMap::new(),
        elements: HashMap::new(), supports, loads,
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s,
        solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![], connectors: HashMap::new(),
    }
}

// ─── Hemisphere Curved-Shell Generator ──────────────────

/// Quarter-hemisphere meshed with curved-shell elements, radial normals.
fn make_hemisphere_curved_shell(n: usize) -> SolverInput3D {
    let r = 10.0;
    let t = 0.04;
    let e = 68_250.0; // MPa
    let nu = 0.3;

    // Map (i,j) ∈ [0,n]² to octant of hemisphere
    // θ = i/n * π/2, φ = j/n * π/2
    let np = n + 1;
    let mut nodes = HashMap::new();
    let mut grid = vec![vec![0usize; np]; np];
    let mut nid = 1;
    for i in 0..np {
        for j in 0..np {
            let theta = (i as f64 / n as f64) * std::f64::consts::FRAC_PI_2;
            let phi = (j as f64 / n as f64) * std::f64::consts::FRAC_PI_2;
            let x = r * theta.sin() * phi.cos();
            let y = r * theta.sin() * phi.sin();
            let z = r * theta.cos();
            nodes.insert(nid.to_string(), SolverNode3D { id: nid, x, y, z });
            grid[i][j] = nid;
            nid += 1;
        }
    }

    let mut curved_shells = HashMap::new();
    let mut eid = 1;
    for i in 0..n {
        for j in 0..n {
            let n0 = grid[i][j];
            let n1 = grid[i+1][j];
            let n2 = grid[i+1][j+1];
            let n3 = grid[i][j+1];
            // Compute radial normals for each node
            let mut normals = [[0.0f64; 3]; 4];
            for (k, &nid_k) in [n0, n1, n2, n3].iter().enumerate() {
                let node = &nodes[&nid_k.to_string()];
                let len = (node.x * node.x + node.y * node.y + node.z * node.z).sqrt();
                if len > 1e-12 {
                    normals[k] = [node.x / len, node.y / len, node.z / len];
                } else {
                    normals[k] = [0.0, 0.0, 1.0];
                }
            }
            curved_shells.insert(eid.to_string(), SolverCurvedShellElement {
                id: eid,
                nodes: [n0, n1, n2, n3],
                material_id: 1,
                thickness: t,
                normals: Some(normals),
            });
            eid += 1;
        }
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e, nu });

    // Symmetry BCs: fix UX on θ=0 plane, UY on φ=0 plane
    let mut supports = HashMap::new();
    let mut sid = 1;
    // Bottom edge (i=0): constrain UZ (pole region)
    for j in 0..np {
        supports.insert(sid.to_string(), SolverSupport3D {
            node_id: grid[0][j], rx: false, ry: false, rz: true,
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
    // Left edge (j=0): constrain UY (symmetry)
    for i in 1..np {
        supports.insert(sid.to_string(), SolverSupport3D {
            node_id: grid[i][0], rx: false, ry: true, rz: false,
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
    // Right edge (j=n): constrain UX (symmetry)
    for i in 1..np {
        supports.insert(sid.to_string(), SolverSupport3D {
            node_id: grid[i][n], rx: true, ry: false, rz: false,
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
    // Pin pole node
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

    // Point load at equator node
    let equator_node = grid[n][0];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: equator_node,
        fx: 1.0, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    SolverInput3D {
        nodes, materials: mats, sections: HashMap::new(),
        elements: HashMap::new(), supports, loads,
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells,
        curved_beams: vec![], connectors: HashMap::new(),
    }
}

// ─── Quad9 Assembly: Serial vs Parallel ─────────────────

fn bench_assembly_3d_quad9(c: &mut Criterion) {
    use dedaliano_engine::solver::dof::DofNumbering as DN;

    let mut group = c.benchmark_group("assembly_3d_quad9");
    group.sample_size(10);

    for &(nx, ny) in &[(10, 10), (20, 20), (30, 30)] {
        let input = make_flat_plate_quad9(nx, ny);
        let dof_num = DN::build_3d(&input);
        let label = format!("{}x{}", nx, ny);

        group.bench_with_input(
            BenchmarkId::new("serial_quad9", &label),
            &(&input, &dof_num),
            |b, (inp, dn)| {
                b.iter(|| assembly::assemble_sparse_3d(inp, dn));
            },
        );

        group.bench_with_input(
            BenchmarkId::new("parallel_quad9", &label),
            &(&input, &dof_num),
            |b, (inp, dn)| {
                b.iter(|| sparse_assembly::assemble_sparse_3d_parallel(inp, dn));
            },
        );
    }

    group.finish();
}

// ─── Curved Shell Assembly: Serial vs Parallel ──────────

fn bench_assembly_3d_curved_shell(c: &mut Criterion) {
    use dedaliano_engine::solver::dof::DofNumbering as DN;

    let mut group = c.benchmark_group("assembly_3d_curved_shell");
    group.sample_size(10);

    for &n in &[8, 16, 32] {
        let input = make_hemisphere_curved_shell(n);
        let dof_num = DN::build_3d(&input);
        let label = format!("{}x{}", n, n);

        group.bench_with_input(
            BenchmarkId::new("serial_curved", &label),
            &(&input, &dof_num),
            |b, (inp, dn)| {
                b.iter(|| assembly::assemble_sparse_3d(inp, dn));
            },
        );

        group.bench_with_input(
            BenchmarkId::new("parallel_curved", &label),
            &(&input, &dof_num),
            |b, (inp, dn)| {
                b.iter(|| sparse_assembly::assemble_sparse_3d_parallel(inp, dn));
            },
        );
    }

    group.finish();
}

// ─── Full 3D Solve Benchmark ────────────────────────────

fn bench_full_solve_3d(c: &mut Criterion) {
    let mut group = c.benchmark_group("full_solve_3d");
    group.sample_size(10);

    for &(nx, ny) in &[(20, 20), (50, 50)] {
        let input = make_flat_plate_3d(nx, ny);
        let label = format!("{}x{}", nx, ny);

        group.bench_with_input(
            BenchmarkId::new("solve_3d", &label),
            &input,
            |b, inp| {
                b.iter(|| linear::solve_3d(inp).unwrap());
            },
        );
    }

    group.finish();
}

// ─── Solve Phase Breakdown ──────────────────────────────

fn bench_solve_phases(c: &mut Criterion) {
    use dedaliano_engine::solver::dof::DofNumbering as DN;
    use dedaliano_engine::linalg::*;

    let mut group = c.benchmark_group("solve_phases");
    group.sample_size(10);

    for &(nx, ny) in &[(20, 20), (50, 50)] {
        let input = make_flat_plate_3d(nx, ny);
        let dof_num = DN::build_3d(&input);
        let nf = dof_num.n_free;
        let label = format!("{}x{}", nx, ny);

        // Assembly phase
        group.bench_with_input(
            BenchmarkId::new("assembly", &label),
            &(&input, &dof_num),
            |b, (inp, dn)| {
                b.iter(|| sparse_assembly::assemble_sparse_3d_parallel(inp, dn));
            },
        );

        // Factor phases: build assembly once, then benchmark symbolic + numeric + solve
        let asm = sparse_assembly::assemble_sparse_3d_parallel(&input, &dof_num);
        let f_f: Vec<f64> = asm.f[..nf].to_vec();

        group.bench_with_input(
            BenchmarkId::new("symbolic_cholesky", &label),
            &asm.k_ff,
            |b, kff| {
                b.iter(|| symbolic_cholesky(kff));
            },
        );

        let sym = symbolic_cholesky(&asm.k_ff);
        if let Some(num) = numeric_cholesky(&sym, &asm.k_ff) {
            group.bench_with_input(
                BenchmarkId::new("numeric_cholesky", &label),
                &(&sym, &asm.k_ff),
                |b, (s, kff)| {
                    b.iter(|| numeric_cholesky(s, kff));
                },
            );
            group.bench_with_input(
                BenchmarkId::new("triangular_solve", &label),
                &(&num, &f_f),
                |b, (factor, rhs)| {
                    b.iter(|| sparse_cholesky_solve(factor, rhs));
                },
            );
        }
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
    bench_assembly_3d_large,
    bench_assembly_3d_mixed,
    bench_assembly_3d_quad9,
    bench_assembly_3d_curved_shell,
    bench_full_solve_3d,
    bench_solve_phases,
);
criterion_main!(benches);
