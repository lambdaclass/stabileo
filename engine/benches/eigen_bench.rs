//! Eigensolver benchmarks: fully-sparse modal and buckling analysis.
//!
//! End-to-end `solve_modal_3d` / `solve_buckling_3d` on simply-supported MITC4
//! plates (10/20/30×30) and a large 3D building frame. With the sparse mass
//! matrix and sparse shift-invert Lanczos (matvec O(nnz) instead of dense
//! O(n²)), these are the paths that replace the former dense-M pipeline.

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use dedaliano_engine::solver::{buckling, modal};
use dedaliano_engine::types::*;
use std::collections::HashMap;
use std::time::Duration;

// ─── Model builders ─────────────────────────────────────────

/// Simply-supported N×N MITC4 plate with uniform pressure.
fn make_ss_plate_3d(n: usize) -> SolverInput3D {
    let lx = 10.0;
    let ly = 10.0;

    let mut nodes = HashMap::new();
    let mut grid = vec![vec![0usize; n + 1]; n + 1];
    let mut nid = 1;
    for i in 0..=n {
        for j in 0..=n {
            let x = (i as f64 / n as f64) * lx;
            let y = (j as f64 / n as f64) * ly;
            nodes.insert(nid.to_string(), SolverNode3D { id: nid, x, y, z: 0.0 });
            grid[i][j] = nid;
            nid += 1;
        }
    }

    let mut quads = HashMap::new();
    let mut qid = 1;
    for i in 0..n {
        for j in 0..n {
            quads.insert(
                qid.to_string(),
                SolverQuadElement {
                    id: qid,
                    nodes: [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]],
                    material_id: 1,
                    thickness: 0.1,
                },
            );
            qid += 1;
        }
    }

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

    let mut supports = HashMap::new();
    let mut sid = 1;
    let mut boundary = Vec::new();
    for j in 0..=n {
        boundary.push(grid[0][j]);
        boundary.push(grid[n][j]);
    }
    for i in 0..=n {
        boundary.push(grid[i][0]);
        boundary.push(grid[i][n]);
    }
    boundary.sort();
    boundary.dedup();
    for &nd in &boundary {
        supports.insert(
            sid.to_string(),
            SolverSupport3D {
                node_id: nd,
                rx: false, ry: false, rz: true, rrx: false, rry: false, rrz: false,
                kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
                dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
                rw: None, kw: None,
                normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
            },
        );
        sid += 1;
    }
    // Pin one corner fully to prevent rigid body modes
    supports.insert(
        sid.to_string(),
        SolverSupport3D {
            node_id: grid[0][0],
            rx: true, ry: true, rz: true, rrx: false, rry: false, rrz: false,
            kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
            rw: None, kw: None,
            normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
        },
    );

    let n_quads = quads.len();
    let loads: Vec<SolverLoad3D> = (1..=n_quads)
        .map(|eid| SolverLoad3D::QuadPressure(SolverPressureLoad { element_id: eid, pressure: -1.0 }))
        .collect();

    SolverInput3D {
        nodes,
        materials,
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
        solver_options: None,
    }
}

/// N×N compressed MITC4 plate (in-plane load at the x=a edge) for buckling.
fn make_compressed_plate(n: usize) -> SolverInput3D {
    let a = 1.0;
    let t = 0.01;
    let d = a / n as f64;

    let mut nodes = HashMap::new();
    let mut grid = vec![vec![0usize; n + 1]; n + 1];
    let mut nid = 1;
    for i in 0..=n {
        for j in 0..=n {
            nodes.insert(nid.to_string(), SolverNode3D { id: nid, x: i as f64 * d, y: j as f64 * d, z: 0.0 });
            grid[i][j] = nid;
            nid += 1;
        }
    }

    let mut quads = HashMap::new();
    let mut qid = 1;
    for i in 0..n {
        for j in 0..n {
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

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

    // SS edges: uz=0 on all boundary, ux=0 at x=0, uy=0 at y=0
    let mut supports = HashMap::new();
    let mut sid = 1;
    for i in 0..=n {
        for j in 0..=n {
            if i == 0 || i == n || j == 0 || j == n {
                supports.insert(sid.to_string(), SolverSupport3D {
                    node_id: grid[i][j],
                    rx: i == 0, ry: j == 0, rz: true,
                    rrx: false, rry: false, rrz: false,
                    kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
                    dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
                    normal_x: None, normal_y: None, normal_z: None,
                    is_inclined: None, rw: None, kw: None,
                });
                sid += 1;
            }
        }
    }

    // Uniform compression along x: nodal forces at x=a edge
    let mut loads = Vec::new();
    for j in 0..=n {
        let trib = if j == 0 || j == n { d / 2.0 } else { d };
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: grid[n][j], fx: -1.0 * trib, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }));
    }

    SolverInput3D {
        nodes,
        materials,
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
        solver_options: None,
    }
}

/// 3D building frame: `stories` levels of a `bays_x` × `bays_y` column grid,
/// beams along X and Y at each floor, fixed base.
fn make_building_frame_3d(stories: usize, bays_x: usize, bays_y: usize) -> SolverInput3D {
    let h = 3.0;
    let w = 6.0;

    let per_floor = (bays_x + 1) * (bays_y + 1);
    let node_id = |level: usize, i: usize, j: usize| level * per_floor + j * (bays_x + 1) + i + 1;

    let mut nodes = HashMap::new();
    for level in 0..=stories {
        for j in 0..=bays_y {
            for i in 0..=bays_x {
                let id = node_id(level, i, j);
                nodes.insert(
                    id.to_string(),
                    SolverNode3D {
                        id,
                        x: i as f64 * w,
                        y: j as f64 * w,
                        z: level as f64 * h,
                    },
                );
            }
        }
    }

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert(
        "1".to_string(),
        SolverSection3D {
            id: 1, name: None, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1.5e-4,
            cw: None, as_y: None, as_z: None,
        },
    );

    let mut elements = HashMap::new();
    let mut eid = 1;
    let push_frame = |ni: usize, nj: usize, elements: &mut HashMap<String, SolverElement3D>, eid: &mut usize| {
        elements.insert(
            eid.to_string(),
            SolverElement3D {
                id: *eid,
                elem_type: "frame".to_string(),
                node_i: ni,
                node_j: nj,
                material_id: 1,
                section_id: 1,
                release_my_start: false, release_my_end: false,
                release_mz_start: false, release_mz_end: false,
                release_t_start: false, release_t_end: false,
                local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
            },
        );
        *eid += 1;
    };
    // Columns
    for level in 0..stories {
        for j in 0..=bays_y {
            for i in 0..=bays_x {
                push_frame(node_id(level, i, j), node_id(level + 1, i, j), &mut elements, &mut eid);
            }
        }
    }
    // Beams along X and Y at each floor
    for level in 1..=stories {
        for j in 0..=bays_y {
            for i in 0..bays_x {
                push_frame(node_id(level, i, j), node_id(level, i + 1, j), &mut elements, &mut eid);
            }
        }
        for j in 0..bays_y {
            for i in 0..=bays_x {
                push_frame(node_id(level, i, j), node_id(level, i, j + 1), &mut elements, &mut eid);
            }
        }
    }

    // Fixed base
    let mut supports = HashMap::new();
    for j in 0..=bays_y {
        for i in 0..=bays_x {
            let id = node_id(0, i, j);
            supports.insert(
                id.to_string(),
                SolverSupport3D {
                    node_id: id,
                    rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
                    kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
                    dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
                    normal_x: None, normal_y: None, normal_z: None,
                    is_inclined: None, rw: None, kw: None,
                },
            );
        }
    }

    // Gravity loads at each floor (buckling needs axial compression)
    let mut loads = Vec::new();
    for level in 1..=stories {
        for j in 0..=bays_y {
            for i in 0..=bays_x {
                loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                    node_id: node_id(level, i, j),
                    fx: 0.0, fy: 0.0, fz: -50.0,
                    mx: 0.0, my: 0.0, mz: 0.0, bw: None,
                }));
            }
        }
    }

    SolverInput3D {
        nodes,
        materials,
        sections,
        elements,
        supports,
        loads,
        constraints: vec![],
        left_hand: None,
        plates: HashMap::new(),
        quads: HashMap::new(),
        quad9s: HashMap::new(),
        solid_shells: HashMap::new(),
        curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
        solver_options: None,
    }
}

fn steel_densities() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), 7850.0);
    d
}

// ─── Benchmarks ─────────────────────────────────────────────

fn bench_modal_sparse(c: &mut Criterion) {
    let mut group = c.benchmark_group("eigen_modal_sparse");
    group.sample_size(10);
    group.warm_up_time(Duration::from_secs(1));
    group.measurement_time(Duration::from_secs(3));

    let densities = steel_densities();
    let num_modes = 5;

    for &n in &[10usize, 20, 30] {
        let input = make_ss_plate_3d(n);
        group.bench_with_input(BenchmarkId::new("shell", format!("{n}x{n}")), &input, |b, input| {
            b.iter(|| modal::solve_modal_3d(input, &densities, num_modes).unwrap());
        });
    }

    let frame = make_building_frame_3d(20, 5, 5);
    group.bench_with_input(BenchmarkId::new("frame", "20s_5x5b"), &frame, |b, input| {
        b.iter(|| modal::solve_modal_3d(input, &densities, num_modes).unwrap());
    });

    group.finish();
}

fn bench_buckling_sparse(c: &mut Criterion) {
    let mut group = c.benchmark_group("eigen_buckling_sparse");
    group.sample_size(10);
    group.warm_up_time(Duration::from_secs(1));
    group.measurement_time(Duration::from_secs(3));

    let num_modes = 3;

    for &n in &[10usize, 20, 30] {
        let input = make_compressed_plate(n);
        group.bench_with_input(BenchmarkId::new("shell", format!("{n}x{n}")), &input, |b, input| {
            b.iter(|| buckling::solve_buckling_3d(input, num_modes).unwrap());
        });
    }

    let frame = make_building_frame_3d(20, 5, 5);
    group.bench_with_input(BenchmarkId::new("frame", "20s_5x5b"), &frame, |b, input| {
        b.iter(|| buckling::solve_buckling_3d(input, num_modes).unwrap());
    });

    group.finish();
}

criterion_group!(benches, bench_modal_sparse, bench_buckling_sparse);
criterion_main!(benches);
