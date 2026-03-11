use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use dedaliano_engine::linalg::*;
use dedaliano_engine::solver::contact::{self, ContactInput};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::{assembly, corotational, linear};
use dedaliano_engine::types::*;
use std::collections::HashMap;

// ─── 2D Helpers ─────────────────────────────────────────────

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

fn make_frame(n_stories: usize, n_bays: usize) -> SolverInput {
    let h = 3.0;
    let w = 6.0;
    let e = 200_000.0;
    let a = 0.01;
    let iz = 1e-4;

    let mut nodes = Vec::new();
    let mut node_id = 1;
    let cols = n_bays + 1;
    for j in 0..=n_stories {
        for i in 0..=n_bays {
            nodes.push((node_id, i as f64 * w, j as f64 * h));
            node_id += 1;
        }
    }

    let mut elems = Vec::new();
    let mut eid = 1;
    for j in 0..n_stories {
        for i in 0..=n_bays {
            let ni = j * cols + i + 1;
            let nj = (j + 1) * cols + i + 1;
            elems.push((eid, "frame", ni, nj, 1, 1, false, false));
            eid += 1;
        }
    }
    for j in 1..=n_stories {
        for i in 0..n_bays {
            let ni = j * cols + i + 1;
            let nj = j * cols + i + 2;
            elems.push((eid, "frame", ni, nj, 1, 1, false, false));
            eid += 1;
        }
    }

    let mut sups = Vec::new();
    for i in 0..=n_bays {
        sups.push((i + 1, i + 1, "fixed"));
    }

    let mut loads = Vec::new();
    for j in 1..=n_stories {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: j * cols + 1,
            fx: 10.0,
            fy: 0.0,
            mz: 0.0,
        }));
        for i in 0..=n_bays {
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: j * cols + i + 1,
                fx: 0.0,
                fy: -50.0,
                mz: 0.0,
            }));
        }
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

// ─── 3D Helpers ─────────────────────────────────────────────

fn make_input_3d(
    nodes: Vec<(usize, f64, f64, f64)>,
    mats: Vec<(usize, f64, f64)>,
    secs: Vec<(usize, f64, f64, f64, f64)>,
    elems: Vec<(usize, &str, usize, usize, usize, usize)>,
    sups: Vec<(usize, usize, bool, bool, bool, bool, bool, bool)>,
    loads: Vec<SolverLoad3D>,
) -> SolverInput3D {
    let mut nodes_map = HashMap::new();
    for (id, x, y, z) in nodes {
        nodes_map.insert(id.to_string(), SolverNode3D { id, x, y, z });
    }
    let mut mats_map = HashMap::new();
    for (id, e, nu) in mats {
        mats_map.insert(id.to_string(), SolverMaterial { id, e, nu });
    }
    let mut secs_map = HashMap::new();
    for (id, a, iy, iz, j) in secs {
        secs_map.insert(
            id.to_string(),
            SolverSection3D { id, name: None, a, iy, iz, j, cw: None, as_y: None, as_z: None },
        );
    }
    let mut elems_map = HashMap::new();
    for (id, t, ni, nj, mi, si) in elems {
        elems_map.insert(
            id.to_string(),
            SolverElement3D {
                id,
                elem_type: t.to_string(),
                node_i: ni,
                node_j: nj,
                material_id: mi,
                section_id: si,
                hinge_start: false,
                hinge_end: false,
                local_yx: None,
                local_yy: None,
                local_yz: None,
                roll_angle: None,
            },
        );
    }
    let mut sups_map = HashMap::new();
    for (id, nid, rx, ry, rz, rrx, rry, rrz) in sups {
        sups_map.insert(
            id.to_string(),
            SolverSupport3D {
                node_id: nid,
                rx, ry, rz, rrx, rry, rrz,
                kx: None, ky: None, kz: None,
                krx: None, kry: None, krz: None,
                dx: None, dy: None, dz: None,
                drx: None, dry: None, drz: None,
                normal_x: None, normal_y: None, normal_z: None,
                is_inclined: None, rw: None, kw: None,
            },
        );
    }
    SolverInput3D {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads,
        constraints: vec![],
        left_hand: None,
        plates: HashMap::new(),
        quads: HashMap::new(), quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}

fn make_frame_3d(n_stories: usize, n_bays: usize) -> SolverInput3D {
    let h = 3.0;
    let w = 6.0;
    let e = 200_000.0;
    let a = 0.01;
    let iy = 1e-4;
    let iz = 1e-4;
    let j = 1.5e-4;
    let cols = n_bays + 1;

    let mut nodes = Vec::new();
    let mut node_id = 1;
    for level in 0..=n_stories {
        for col in 0..=n_bays {
            nodes.push((node_id, col as f64 * w, 0.0, level as f64 * h));
            node_id += 1;
        }
    }

    let mut elems = Vec::new();
    let mut eid = 1;
    for level in 0..n_stories {
        for col in 0..=n_bays {
            let ni = level * cols + col + 1;
            let nj = (level + 1) * cols + col + 1;
            elems.push((eid, "frame", ni, nj, 1, 1));
            eid += 1;
        }
    }
    for level in 1..=n_stories {
        for bay in 0..n_bays {
            let ni = level * cols + bay + 1;
            let nj = level * cols + bay + 2;
            elems.push((eid, "frame", ni, nj, 1, 1));
            eid += 1;
        }
    }

    let mut sups = Vec::new();
    for col in 0..=n_bays {
        sups.push((col + 1, col + 1, true, true, true, true, true, true));
    }

    let mut loads = Vec::new();
    for level in 1..=n_stories {
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: level * cols + 1,
            fx: 10.0, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }));
        for col in 0..=n_bays {
            loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: level * cols + col + 1,
                fx: 0.0, fy: 0.0, fz: -50.0,
                mx: 0.0, my: 0.0, mz: 0.0, bw: None,
            }));
        }
    }

    make_input_3d(
        nodes,
        vec![(1, e, 0.3)],
        vec![(1, a, iy, iz, j)],
        elems,
        sups,
        loads,
    )
}

fn make_ss_beam(n_elem: usize) -> SolverInput {
    let l = 10.0;
    let e = 200_000.0;
    let a = 0.01;
    let iz = 1e-4;
    let q = -10.0;
    let elem_len = l / n_elem as f64;

    let nodes: Vec<_> = (0..=n_elem)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n_elem)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1, "pinned"), (2, n_elem + 1, "rollerX")];
    let loads: Vec<_> = (0..n_elem)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();

    make_input(
        nodes,
        vec![(1, e, 0.3)],
        vec![(1, a, iz)],
        elems,
        sups,
        loads,
    )
}

// ─── 4B: End-to-end 2D workflow (JSON → parse → solve → serialize) ──

fn bench_e2e_2d(c: &mut Criterion) {
    let mut group = c.benchmark_group("e2e_2d");

    for &(stories, bays) in &[(5, 3), (10, 4), (20, 5), (50, 5), (100, 5)] {
        let input = make_frame(stories, bays);
        let json = serde_json::to_string(&input).unwrap();
        let label = format!("{}s_{}b", stories, bays);
        group.bench_with_input(BenchmarkId::new("workflow", &label), &json, |b, json| {
            b.iter(|| {
                let input: SolverInput = serde_json::from_str(json).unwrap();
                let result = linear::solve_2d(&input).unwrap();
                serde_json::to_string(&result).unwrap()
            });
        });
    }
    group.finish();
}

// ─── 4C: End-to-end 3D workflow ─────────────────────────────────────

fn bench_e2e_3d(c: &mut Criterion) {
    let mut group = c.benchmark_group("e2e_3d");

    for &(stories, bays) in &[(5, 3), (10, 4), (20, 5), (50, 5)] {
        let input = make_frame_3d(stories, bays);
        let json = serde_json::to_string(&input).unwrap();
        let label = format!("{}s_{}b", stories, bays);
        group.bench_with_input(BenchmarkId::new("workflow", &label), &json, |b, json| {
            b.iter(|| {
                let input: SolverInput3D = serde_json::from_str(json).unwrap();
                let result = linear::solve_3d(&input).unwrap();
                serde_json::to_string(&result).unwrap()
            });
        });
    }
    group.finish();
}

// ─── 4D: Dense vs sparse solve comparison ───────────────────────────

fn bench_dense_vs_sparse(c: &mut Criterion) {
    let mut group = c.benchmark_group("dense_vs_sparse");
    group.sample_size(20);

    for &n_elem in &[100, 500, 1000, 2000] {
        let input = make_ss_beam(n_elem);
        let dof_num = DofNumbering::build_2d(&input);
        let nf = dof_num.n_free;

        // Dense path
        group.bench_with_input(
            BenchmarkId::new("dense", n_elem),
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

        // Sparse path
        group.bench_with_input(
            BenchmarkId::new("sparse", n_elem),
            &n_elem,
            |b, _| {
                let sasm = assembly::assemble_sparse_2d(&input, &dof_num);
                let f_f = extract_subvec(&sasm.f, &(0..nf).collect::<Vec<_>>());
                b.iter(|| sparse_cholesky_solve_full(&sasm.k_ff, &f_f));
            },
        );
    }
    group.finish();
}

// ─── 4E: Nonlinear workflow benchmarks ──────────────────────────────

fn bench_corotational_e2e(c: &mut Criterion) {
    let mut group = c.benchmark_group("corotational_e2e");
    group.sample_size(10);

    for &(stories, bays) in &[(5, 3), (10, 4), (20, 5)] {
        let input = make_frame(stories, bays);
        let label = format!("{}s_{}b", stories, bays);
        group.bench_with_input(BenchmarkId::new("solve", &label), &input, |b, input| {
            b.iter(|| corotational::solve_corotational_2d(input, 20, 1e-6, 10).unwrap());
        });
    }
    group.finish();
}

fn bench_contact_e2e(c: &mut Criterion) {
    let mut group = c.benchmark_group("contact_e2e");
    group.sample_size(20);

    for &n_elem in &[10, 50, 100] {
        let solver = make_ss_beam(n_elem);
        let mut behaviors = HashMap::new();
        // Make every other element tension-only
        for i in (1..=n_elem).step_by(2) {
            behaviors.insert(i.to_string(), "tension_only".to_string());
        }
        let input = ContactInput {
            solver,
            element_behaviors: behaviors,
            gap_elements: vec![],
            uplift_supports: vec![],
            max_iter: Some(30),
            tolerance: Some(1e-6),
            augmented_lagrangian: None,
            max_flips: None,
            damping_coefficient: None,
            al_max_iter: None,
            contact_type: contact::ContactType::default(),
            node_to_surface_pairs: vec![],
        };
        group.bench_with_input(BenchmarkId::from_parameter(n_elem), &input, |b, input| {
            b.iter(|| contact::solve_contact_2d(input).unwrap());
        });
    }
    group.finish();
}

// ─── 3D Shell End-to-End ─────────────────────────────────────────────

fn make_flat_plate_3d(nx: usize, ny: usize) -> SolverInput3D {
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

fn bench_e2e_3d_shell(c: &mut Criterion) {
    let mut group = c.benchmark_group("e2e_3d_shell");
    group.sample_size(10);

    for &(nx, ny) in &[(6, 6), (10, 10), (15, 15)] {
        let input = make_flat_plate_3d(nx, ny);
        let json = serde_json::to_string(&input).unwrap();
        let label = format!("{}x{}", nx, ny);
        group.bench_with_input(BenchmarkId::new("workflow", &label), &json, |b, json| {
            b.iter(|| {
                let input: SolverInput3D = serde_json::from_str(json).unwrap();
                let result = linear::solve_3d(&input).unwrap();
                serde_json::to_string(&result).unwrap()
            });
        });
    }
    group.finish();
}

criterion_group!(
    benches,
    bench_e2e_2d,
    bench_e2e_3d,
    bench_e2e_3d_shell,
    bench_dense_vs_sparse,
    bench_corotational_e2e,
    bench_contact_e2e,
);
criterion_main!(benches);
