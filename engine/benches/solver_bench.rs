use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use dedaliano_engine::element::fiber_beam::{rectangular_fiber_section, FiberMaterial};
use dedaliano_engine::solver::constraints::{self, ConstrainedInput};
use dedaliano_engine::solver::contact::{self, ContactInput};
use dedaliano_engine::solver::creep_shrinkage::{
    self, ConcreteCreepParams, CreepShrinkageInput, TimeStep,
};
use dedaliano_engine::solver::fiber_nonlinear::{self, FiberNonlinearInput};
use dedaliano_engine::solver::staged;
use dedaliano_engine::solver::winkler::{self, FoundationSpring, WinklerInput};
use dedaliano_engine::solver::{
    buckling, cable, corotational, linear, material_nonlinear, modal, moving_loads, pdelta, plastic,
};
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
        nodes_map.insert(id.to_string(), SolverNode { id, x, z: y });
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
                dz: None,
                dry: None,
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
        loads, constraints: vec![],
        connectors: HashMap::new(), }
}

/// Multi-element simply-supported beam with UDL.
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

/// Multi-story frame (n_stories × n_bays).
fn make_frame(n_stories: usize, n_bays: usize) -> SolverInput {
    let h = 3.0; // story height
    let w = 6.0; // bay width
    let e = 200_000.0;
    let a = 0.01;
    let iz = 1e-4;

    let mut nodes = Vec::new();
    let mut node_id = 1;
    // Grid: (n_bays+1) columns × (n_stories+1) rows
    for j in 0..=n_stories {
        for i in 0..=n_bays {
            nodes.push((node_id, i as f64 * w, j as f64 * h));
            node_id += 1;
        }
    }
    let cols = n_bays + 1;

    let mut elems = Vec::new();
    let mut eid = 1;
    // Columns
    for j in 0..n_stories {
        for i in 0..=n_bays {
            let ni = j * cols + i + 1;
            let nj = (j + 1) * cols + i + 1;
            elems.push((eid, "frame", ni, nj, 1, 1, false, false));
            eid += 1;
        }
    }
    // Beams
    for j in 1..=n_stories {
        for i in 0..n_bays {
            let ni = j * cols + i + 1;
            let nj = j * cols + i + 2;
            elems.push((eid, "frame", ni, nj, 1, 1, false, false));
            eid += 1;
        }
    }

    // Fixed supports at base
    let mut sups = Vec::new();
    for i in 0..=n_bays {
        sups.push((i + 1, i + 1, "fixed"));
    }

    // Lateral + gravity loads at each floor
    let mut loads = Vec::new();
    for j in 1..=n_stories {
        // Lateral at left node
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: j * cols + 1,
            fx: 10.0,
            fz: 0.0,
            my: 0.0,
        }));
        // Gravity at each node
        for i in 0..=n_bays {
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: j * cols + i + 1,
                fx: 0.0,
                fz: -50.0,
                my: 0.0,
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

/// Column for buckling analysis.
fn make_column(n_elem: usize) -> SolverInput {
    let l = 5.0;
    let e = 200_000.0;
    let a = 0.01;
    let iz = 1e-4;
    let p = -100.0;
    let elem_len = l / n_elem as f64;

    let mut nodes = Vec::new();
    for i in 0..=n_elem {
        nodes.push((i + 1, i as f64 * elem_len, 0.0));
    }
    let mut elems = Vec::new();
    for i in 0..n_elem {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }

    make_input(
        nodes,
        vec![(1, e, 0.3)],
        vec![(1, a, iz)],
        elems,
        vec![(1, 1, "pinned"), (2, n_elem + 1, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_elem + 1,
            fx: p,
            fz: 0.0,
            my: 0.0,
        })],
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
                release_my_start: false,
                release_my_end: false,
                release_mz_start: false,
                release_mz_end: false,
                release_t_start: false,
                release_t_end: false,
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
        constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(), curved_beams: vec![],
        connectors: HashMap::new(),    }
}

/// 3D cantilever beam along X-axis with tip load in Z.
fn make_ss_beam_3d(n_elem: usize) -> SolverInput3D {
    let l = 10.0;
    let e = 200_000.0;
    let a = 0.01;
    let iy = 1e-4;
    let iz = 1e-4;
    let j = 1.5e-4;
    let elem_len = l / n_elem as f64;

    let nodes: Vec<_> = (0..=n_elem)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0))
        .collect();
    let elems: Vec<_> = (0..n_elem)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1))
        .collect();
    // Fixed at node 1
    let sups = vec![(1, 1, true, true, true, true, true, true)];
    // Tip load at free end
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n_elem + 1,
        fx: 0.0, fy: 0.0, fz: -10.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None })];

    make_input_3d(
        nodes,
        vec![(1, e, 0.3)],
        vec![(1, a, iy, iz, j)],
        elems,
        sups,
        loads,
    )
}

/// 3D multi-story frame in X-Z plane (columns along Z, beams along X).
fn make_frame_3d(n_stories: usize, n_bays: usize) -> SolverInput3D {
    let h = 3.0; // story height (Z)
    let w = 6.0; // bay width (X)
    let e = 200_000.0;
    let a = 0.01;
    let iy = 1e-4;
    let iz = 1e-4;
    let j = 1.5e-4;

    let mut nodes = Vec::new();
    let mut node_id = 1;
    // Grid: (n_bays+1) columns × (n_stories+1) levels
    for level in 0..=n_stories {
        for col in 0..=n_bays {
            nodes.push((node_id, col as f64 * w, 0.0, level as f64 * h));
            node_id += 1;
        }
    }
    let cols = n_bays + 1;

    let mut elems = Vec::new();
    let mut eid = 1;
    // Columns (vertical, along Z)
    for level in 0..n_stories {
        for col in 0..=n_bays {
            let ni = level * cols + col + 1;
            let nj = (level + 1) * cols + col + 1;
            elems.push((eid, "frame", ni, nj, 1, 1));
            eid += 1;
        }
    }
    // Beams (horizontal, along X) at each floor
    for level in 1..=n_stories {
        for bay in 0..n_bays {
            let ni = level * cols + bay + 1;
            let nj = level * cols + bay + 2;
            elems.push((eid, "frame", ni, nj, 1, 1));
            eid += 1;
        }
    }

    // Fixed supports at base
    let mut sups = Vec::new();
    for col in 0..=n_bays {
        sups.push((col + 1, col + 1, true, true, true, true, true, true));
    }

    // Lateral (X) + gravity (Z) loads at each floor
    let mut loads = Vec::new();
    for level in 1..=n_stories {
        // Lateral at left node
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: level * cols + 1,
            fx: 10.0, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None }));
        // Gravity at each node
        for col in 0..=n_bays {
            loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: level * cols + col + 1,
                fx: 0.0, fy: 0.0, fz: -50.0,
                mx: 0.0, my: 0.0, mz: 0.0, bw: None }));
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

fn make_densities() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), 7850.0);
    d
}

// ─── JSON round-trip benchmark (simulates WASM boundary) ────

fn bench_json_roundtrip(c: &mut Criterion) {
    let mut group = c.benchmark_group("json_roundtrip");

    for n in [4, 16, 64] {
        let input = make_ss_beam(n);
        let json = serde_json::to_string(&input).unwrap();
        group.bench_with_input(BenchmarkId::new("serialize", n), &input, |b, input| {
            b.iter(|| serde_json::to_string(input).unwrap());
        });
        group.bench_with_input(
            BenchmarkId::new("deserialize", n),
            &json,
            |b, json| {
                b.iter(|| serde_json::from_str::<SolverInput>(json).unwrap());
            },
        );
    }
    group.finish();
}

// ─── 2D Linear solve benchmarks ─────────────────────────────

fn bench_linear_beam(c: &mut Criterion) {
    let mut group = c.benchmark_group("linear_beam");

    for n in [4, 16, 64, 500, 2000] {
        let input = make_ss_beam(n);
        group.bench_with_input(BenchmarkId::from_parameter(n), &input, |b, input| {
            b.iter(|| linear::solve_2d(input).unwrap());
        });
    }
    group.finish();
}

fn bench_linear_frame(c: &mut Criterion) {
    let mut group = c.benchmark_group("linear_frame");

    for &(stories, bays) in &[(3, 2), (5, 3), (10, 4), (20, 5), (50, 5), (100, 5)] {
        let input = make_frame(stories, bays);
        let label = format!("{}s_{}b", stories, bays);
        group.bench_with_input(BenchmarkId::new("solve", &label), &input, |b, input| {
            b.iter(|| linear::solve_2d(input).unwrap());
        });
    }
    group.finish();
}

// ─── Full WASM-like JSON solve ───────────────────────────────

fn bench_json_solve(c: &mut Criterion) {
    let mut group = c.benchmark_group("json_solve_2d");

    for &(stories, bays) in &[(3, 2), (10, 4)] {
        let input = make_frame(stories, bays);
        let json = serde_json::to_string(&input).unwrap();
        let label = format!("{}s_{}b", stories, bays);
        group.bench_with_input(BenchmarkId::new("full", &label), &json, |b, json| {
            b.iter(|| {
                let input: SolverInput = serde_json::from_str(json).unwrap();
                let result = linear::solve_2d(&input).unwrap();
                serde_json::to_string(&result).unwrap()
            });
        });
    }
    group.finish();
}

// ─── 2D Buckling benchmarks ─────────────────────────────────

fn bench_buckling(c: &mut Criterion) {
    let mut group = c.benchmark_group("buckling");

    for n in [4, 16, 64, 200] {
        let input = make_column(n);
        group.bench_with_input(BenchmarkId::from_parameter(n), &input, |b, input| {
            b.iter(|| buckling::solve_buckling_2d(input, 4).unwrap());
        });
    }
    group.finish();
}

// ─── 2D Modal benchmarks ────────────────────────────────────

fn bench_modal(c: &mut Criterion) {
    let mut group = c.benchmark_group("modal");

    let densities = make_densities();
    for n in [4, 16, 64, 500] {
        let input = make_ss_beam(n);

        group.bench_with_input(
            BenchmarkId::from_parameter(n),
            &(input, densities.clone()),
            |b, (input, dens)| {
                b.iter(|| modal::solve_modal_2d(input, dens, 4).unwrap());
            },
        );
    }
    group.finish();
}

// ─── 2D P-Delta benchmarks ──────────────────────────────────

fn bench_pdelta(c: &mut Criterion) {
    let mut group = c.benchmark_group("pdelta");

    for &(stories, bays) in &[(3, 2), (5, 3), (10, 4), (20, 5), (50, 5)] {
        let input = make_frame(stories, bays);
        let label = format!("{}s_{}b", stories, bays);
        group.bench_with_input(BenchmarkId::new("solve", &label), &input, |b, input| {
            b.iter(|| pdelta::solve_pdelta_2d(input, 20, 1e-4).unwrap());
        });
    }
    group.finish();
}

// ─── 2D Plastic benchmarks ──────────────────────────────────

fn bench_plastic(c: &mut Criterion) {
    let mut group = c.benchmark_group("plastic");

    let n_elem = 4;
    let a_area = 0.01;
    let iz = 1e-4;
    let fy = 250.0;
    let b_width = 0.1;
    let h_depth = 0.2;

    let solver = make_ss_beam(n_elem);
    let mut sections = HashMap::new();
    for i in 0..n_elem {
        sections.insert(
            (i + 1).to_string(),
            PlasticSectionData {
                a: a_area,
                iz,
                material_id: 1,
                b: Some(b_width),
                h: Some(h_depth),
            },
        );
    }
    let mut materials = HashMap::new();
    materials.insert(
        "1".to_string(),
        PlasticMaterialData { fy: Some(fy) },
    );
    let input = PlasticInput {
        solver,
        sections,
        materials,
        max_hinges: None,
        mp_overrides: None,
    };

    group.bench_function("ss_beam_4elem", |b| {
        b.iter(|| plastic::solve_plastic_2d(&input).unwrap());
    });
    group.finish();
}

// ─── 3D Linear solve benchmarks ─────────────────────────────

fn bench_linear_beam_3d(c: &mut Criterion) {
    let mut group = c.benchmark_group("linear_beam_3d");

    for n in [4, 16, 64, 500] {
        let input = make_ss_beam_3d(n);
        group.bench_with_input(BenchmarkId::from_parameter(n), &input, |b, input| {
            b.iter(|| linear::solve_3d(input).unwrap());
        });
    }
    group.finish();
}

fn bench_linear_frame_3d(c: &mut Criterion) {
    let mut group = c.benchmark_group("linear_frame_3d");

    for &(stories, bays) in &[(5, 3), (10, 4), (20, 5)] {
        let input = make_frame_3d(stories, bays);
        let label = format!("{}s_{}b", stories, bays);
        group.bench_with_input(BenchmarkId::new("solve", &label), &input, |b, input| {
            b.iter(|| linear::solve_3d(input).unwrap());
        });
    }
    group.finish();
}

// ─── 3D Modal benchmarks ────────────────────────────────────

fn bench_modal_3d(c: &mut Criterion) {
    let mut group = c.benchmark_group("modal_3d");

    let densities = make_densities();
    for n in [4, 16, 64, 200] {
        let input = make_ss_beam_3d(n);

        group.bench_with_input(
            BenchmarkId::from_parameter(n),
            &(input, densities.clone()),
            |b, (input, dens)| {
                b.iter(|| modal::solve_modal_3d(input, dens, 4).unwrap());
            },
        );
    }
    group.finish();
}

// ─── 3D P-Delta benchmarks ──────────────────────────────────

fn bench_pdelta_3d(c: &mut Criterion) {
    let mut group = c.benchmark_group("pdelta_3d");

    for &(stories, bays) in &[(5, 3), (10, 4)] {
        let input = make_frame_3d(stories, bays);
        let label = format!("{}s_{}b", stories, bays);
        group.bench_with_input(BenchmarkId::new("solve", &label), &input, |b, input| {
            b.iter(|| pdelta::solve_pdelta_3d(input, 20, 1e-4).unwrap());
        });
    }
    group.finish();
}

// ─── Moving Loads benchmarks ─────────────────────────────────

fn bench_moving_loads(c: &mut Criterion) {
    let mut group = c.benchmark_group("moving_loads");
    group.sample_size(20);

    for n in [16, 64, 200, 500] {
        let solver = make_ss_beam(n);
        let input = MovingLoadInput {
            solver,
            train: LoadTrain {
                name: "HL93".to_string(),
                axles: vec![
                    Axle { offset: 0.0, weight: 35.0 },
                    Axle { offset: 4.3, weight: 145.0 },
                    Axle { offset: 8.6, weight: 145.0 },
                ],
            },
            step: None,
            path_element_ids: None,
        };
        group.bench_with_input(BenchmarkId::from_parameter(n), &input, |b, input| {
            b.iter(|| moving_loads::solve_moving_loads_2d(input).unwrap());
        });
    }
    group.finish();
}

// ─── Cable benchmarks ────────────────────────────────────────

fn bench_cable(c: &mut Criterion) {
    let mut group = c.benchmark_group("cable");
    group.sample_size(20);

    let densities = make_densities();
    for n in [4, 16, 32] {
        let l = 20.0;
        let sag = l / 8.0; // 2.5m sag for 20m span
        let elem_len = l / n as f64;

        let mut nodes = Vec::new();
        for i in 0..=n {
            let x = i as f64 * elem_len;
            let y = -4.0 * sag * x * (l - x) / (l * l);
            nodes.push((i + 1, x, y));
        }
        let mut elems = Vec::new();
        for i in 0..n {
            elems.push((i + 1, "truss", i + 1, i + 2, 1, 1, false, false));
        }
        let sups = vec![(1, 1, "pinned"), (2, n + 1, "pinned")];
        let mut loads = Vec::new();
        for i in 1..n {
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: i + 1,
                fx: 0.0,
                fz: -5.0,
                my: 0.0,
            }));
        }
        let input = make_input(
            nodes,
            vec![(1, 200_000.0, 0.3)],
            vec![(1, 0.005, 1e-8)],  // larger cable area
            elems,
            sups,
            loads,
        );
        group.bench_with_input(
            BenchmarkId::from_parameter(n),
            &(input, densities.clone()),
            |b, (input, dens)| {
                b.iter(|| cable::solve_cable_2d(input, dens, 50, 1e-6).unwrap());
            },
        );
    }
    group.finish();
}

// ─── Constraints benchmarks ──────────────────────────────────

fn bench_constraints(c: &mut Criterion) {
    let mut group = c.benchmark_group("constraints");

    for &(stories, bays) in &[(5, 3), (10, 4), (20, 5)] {
        let solver = make_frame(stories, bays);
        let cols = bays + 1;
        let mut cons = Vec::new();
        for j in 1..=stories {
            let master = j * cols + 1;
            for i in 1..=bays {
                let slave = j * cols + i + 1;
                cons.push(Constraint::RigidLink(RigidLinkConstraint {
                    master_node: master,
                    slave_node: slave,
                    dofs: vec![0],
                }));
            }
        }
        let input = ConstrainedInput { solver, constraints: cons };
        let label = format!("{}s_{}b", stories, bays);
        group.bench_with_input(BenchmarkId::new("solve", &label), &input, |b, input| {
            b.iter(|| constraints::solve_constrained_2d(input).unwrap());
        });
    }
    group.finish();
}

// ─── Winkler benchmarks ─────────────────────────────────────

fn bench_winkler(c: &mut Criterion) {
    let mut group = c.benchmark_group("winkler");

    for n in [16, 64, 200, 500] {
        let solver = make_ss_beam(n);
        let springs: Vec<FoundationSpring> = (1..=n)
            .map(|id| FoundationSpring {
                element_id: id,
                kf: 1000.0,
            })
            .collect();
        let input = WinklerInput {
            solver,
            foundation_springs: springs,
        };
        group.bench_with_input(BenchmarkId::from_parameter(n), &input, |b, input| {
            b.iter(|| winkler::solve_winkler_2d(input).unwrap());
        });
    }
    group.finish();
}

// ─── Creep & Shrinkage benchmarks ───────────────────────────

fn bench_creep_shrinkage(c: &mut Criterion) {
    let mut group = c.benchmark_group("creep_shrinkage");
    group.sample_size(20);

    for n in [16, 64, 200] {
        let l = 10.0;
        let elem_len = l / n as f64;
        let mut nodes = Vec::new();
        for i in 0..=n {
            nodes.push((i + 1, i as f64 * elem_len, 0.0));
        }
        let mut elems = Vec::new();
        for i in 0..n {
            elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
        }
        let sups = vec![(1, 1, "pinned"), (2, n + 1, "rollerX")];
        let mut loads = Vec::new();
        for i in 0..n {
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: -10.0,
                q_j: -10.0,
                a: None,
                b: None,
            }));
        }
        let solver = make_input(
            nodes,
            vec![(1, 30_000.0, 0.2)],
            vec![(1, 0.3, 6.75e-4)],
            elems,
            sups,
            loads,
        );
        let mut creep_params = HashMap::new();
        creep_params.insert(
            "1".to_string(),
            ConcreteCreepParams {
                fc: 40.0,
                rh: 70.0,
                h0: 300.0,
                t0: 28.0,
                cement_class: "N".to_string(),
            },
        );
        let input = CreepShrinkageInput {
            solver,
            creep_params,
            time_steps: vec![
                TimeStep { t_days: 100.0, additional_loads: vec![] },
                TimeStep { t_days: 365.0, additional_loads: vec![] },
                TimeStep { t_days: 1000.0, additional_loads: vec![] },
                TimeStep { t_days: 10000.0, additional_loads: vec![] },
            ],
            aging_coefficient: 0.8,
        };
        group.bench_with_input(BenchmarkId::from_parameter(n), &input, |b, input| {
            b.iter(|| creep_shrinkage::solve_creep_shrinkage_2d(input).unwrap());
        });
    }
    group.finish();
}

// ─── Corotational benchmarks ────────────────────────────────

fn bench_corotational(c: &mut Criterion) {
    let mut group = c.benchmark_group("corotational");
    group.sample_size(10);

    for n in [4, 16, 64] {
        let l = 5.0;
        let elem_len = l / n as f64;
        let mut nodes = Vec::new();
        for i in 0..=n {
            nodes.push((i + 1, i as f64 * elem_len, 0.0));
        }
        let mut elems = Vec::new();
        for i in 0..n {
            elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
        }
        let input = make_input(
            nodes,
            vec![(1, 200_000.0, 0.3)],
            vec![(1, 0.01, 1e-4)],
            elems,
            vec![(1, 1, "fixed")],
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1,
                fx: 0.0,
                fz: -50.0,
                my: 0.0,
            })],
        );
        group.bench_with_input(BenchmarkId::from_parameter(n), &input, |b, input| {
            b.iter(|| corotational::solve_corotational_2d(input, 20, 1e-6, 10, false).unwrap());
        });
    }
    group.finish();
}

// ─── Material Nonlinear benchmarks ──────────────────────────

fn bench_material_nonlinear(c: &mut Criterion) {
    let mut group = c.benchmark_group("material_nonlinear");
    group.sample_size(10);

    for &(stories, bays) in &[(3, 2), (5, 3), (10, 4)] {
        let solver = make_frame(stories, bays);
        let mut material_models = HashMap::new();
        material_models.insert(
            "1".to_string(),
            MaterialModel {
                model_type: "bilinear".to_string(),
                fy: 250.0,
                alpha: Some(0.01),
            },
        );
        let mut section_capacities = HashMap::new();
        for key in solver.elements.keys() {
            section_capacities.insert(
                key.clone(),
                SectionCapacity {
                    np: 2500.0,
                    mp: 50.0,
                    zp: Some(2e-4),
                },
            );
        }
        let input = NonlinearMaterialInput {
            solver,
            material_models,
            section_capacities,
            max_iter: 30,
            tolerance: 1e-4,
            n_increments: 5,
        };
        let label = format!("{}s_{}b", stories, bays);
        group.bench_with_input(BenchmarkId::new("solve", &label), &input, |b, input| {
            b.iter(|| material_nonlinear::solve_nonlinear_material_2d(input).unwrap());
        });
    }
    group.finish();
}

// ─── Fiber Nonlinear benchmarks ─────────────────────────────

fn bench_fiber_nonlinear(c: &mut Criterion) {
    let mut group = c.benchmark_group("fiber_nonlinear");
    group.sample_size(10);

    let bw: f64 = 0.1;
    let hw: f64 = 0.2;
    let a_area = bw * hw;
    let iz_val = bw * hw.powi(3) / 12.0;

    for n in [4, 16] {
        let l = 5.0;
        let elem_len = l / n as f64;
        let mut nodes = Vec::new();
        for i in 0..=n {
            nodes.push((i + 1, i as f64 * elem_len, 0.0));
        }
        let mut elems = Vec::new();
        for i in 0..n {
            elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
        }
        let solver = make_input(
            nodes,
            vec![(1, 200_000.0, 0.3)],
            vec![(1, a_area, iz_val)],
            elems,
            vec![(1, 1, "fixed")],
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1,
                fx: 0.0,
                fz: -20.0,
                my: 0.0,
            })],
        );
        let section = rectangular_fiber_section(
            bw,
            hw,
            10,
            FiberMaterial::SteelBilinear {
                e: 200_000.0,
                fy: 250.0,
                hardening_ratio: 0.01,
            },
        );
        let mut fiber_sections = HashMap::new();
        fiber_sections.insert("1".to_string(), section);
        let input = FiberNonlinearInput {
            solver,
            fiber_sections,
            n_integration_points: 5,
            max_iter: 30,
            tolerance: 1e-6,
            n_increments: 5,
            modified_nr: false,
        };
        group.bench_with_input(BenchmarkId::from_parameter(n), &input, |b_iter, input| {
            b_iter.iter(|| fiber_nonlinear::solve_fiber_nonlinear_2d(input).unwrap());
        });
    }
    group.finish();
}

// ─── Contact benchmarks ──────────────────────────────────────

fn bench_contact(c: &mut Criterion) {
    let mut group = c.benchmark_group("contact");
    group.sample_size(20);

    for &(stories, bays) in &[(5, 3), (10, 4), (20, 5)] {
        let mut solver = make_frame(stories, bays);
        let cols = bays + 1;
        let mut eid = solver.elements.len() + 1;
        let mut behaviors = HashMap::new();

        // Add tension-only diagonal braces in each bay
        for j in 0..stories {
            for i in 0..bays {
                let ni = j * cols + i + 1;
                let nj = (j + 1) * cols + i + 2;
                solver.elements.insert(
                    eid.to_string(),
                    SolverElement {
                        id: eid,
                        elem_type: "truss".to_string(),
                        node_i: ni,
                        node_j: nj,
                        material_id: 1,
                        section_id: 1,
                        hinge_start: false,
                        hinge_end: false,
                    },
                );
                behaviors.insert(eid.to_string(), "tension_only".to_string());
                eid += 1;
            }
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
        let label = format!("{}s_{}b", stories, bays);
        group.bench_with_input(BenchmarkId::new("solve", &label), &input, |b, input| {
            b.iter(|| contact::solve_contact_2d(input).unwrap());
        });
    }
    group.finish();
}

// ─── Staged Construction benchmarks ──────────────────────────

fn bench_staged(c: &mut Criterion) {
    let mut group = c.benchmark_group("staged");
    group.sample_size(20);

    for n in [16, 64, 200] {
        let l = 10.0;
        let elem_len = l / n as f64;
        let half = n / 2;

        let mut nodes = HashMap::new();
        for i in 0..=n {
            nodes.insert(
                (i + 1).to_string(),
                SolverNode { id: i + 1, x: i as f64 * elem_len, z: 0.0 },
            );
        }
        let mut materials = HashMap::new();
        materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
        let mut sections = HashMap::new();
        sections.insert(
            "1".to_string(),
            SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None },
        );
        let mut elements = HashMap::new();
        for i in 0..n {
            elements.insert(
                (i + 1).to_string(),
                SolverElement {
                    id: i + 1,
                    elem_type: "frame".to_string(),
                    node_i: i + 1,
                    node_j: i + 2,
                    material_id: 1,
                    section_id: 1,
                    hinge_start: false,
                    hinge_end: false,
                },
            );
        }
        let mut supports = HashMap::new();
        supports.insert(
            "1".to_string(),
            SolverSupport {
                id: 1, node_id: 1, support_type: "pinned".to_string(),
                kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
            },
        );
        supports.insert(
            "2".to_string(),
            SolverSupport {
                id: 2, node_id: half + 1, support_type: "rollerX".to_string(),
                kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
            },
        );
        supports.insert(
            "3".to_string(),
            SolverSupport {
                id: 3, node_id: n + 1, support_type: "rollerX".to_string(),
                kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
            },
        );

        let mut loads = Vec::new();
        for i in 0..n {
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: -10.0,
                q_j: -10.0,
                a: None,
                b: None,
            }));
        }

        let input = StagedInput {
            nodes,
            materials,
            sections,
            elements,
            supports,
            loads,
            stages: vec![
                ConstructionStage {
                    name: "Phase 1".to_string(),
                    elements_added: (1..=half).collect(),
                    elements_removed: vec![],
                    load_indices: (0..half).collect(),
                    supports_added: vec![1, 2],
                    supports_removed: vec![],
                    prestress_loads: vec![],
                },
                ConstructionStage {
                    name: "Phase 2".to_string(),
                    elements_added: (half + 1..=n).collect(),
                    elements_removed: vec![],
                    load_indices: (half..n).collect(),
                    supports_added: vec![3],
                    supports_removed: vec![],
                    prestress_loads: vec![],
                },
            ],
            constraints: vec![],
        };
        group.bench_with_input(BenchmarkId::from_parameter(n), &input, |b, input| {
            b.iter(|| staged::solve_staged_2d(input).unwrap());
        });
    }
    group.finish();
}

// ─── Multi-case load-case factorization reuse (3D frame, sparse path) ─────

fn make_multi_case_input_3d(base: &SolverInput3D, n_cases: usize) -> dedaliano_engine::solver::load_cases::MultiCaseInput3D {
    use dedaliano_engine::solver::load_cases::*;
    let load_cases: Vec<LoadCase3D> = (0..n_cases)
        .map(|k| {
            let scale = 1.0 + k as f64 * 0.25;
            let loads: Vec<SolverLoad3D> = base
                .loads
                .iter()
                .map(|l| match l {
                    SolverLoad3D::Nodal(nl) => SolverLoad3D::Nodal(SolverNodalLoad3D {
                        node_id: nl.node_id,
                        fx: nl.fx * scale,
                        fy: nl.fy * scale,
                        fz: nl.fz * scale,
                        mx: nl.mx,
                        my: nl.my,
                        mz: nl.mz,
                        bw: nl.bw,
                    }),
                    other => other.clone(),
                })
                .collect();
            LoadCase3D { name: format!("Case{}", k + 1), loads }
        })
        .collect();
    let factors: HashMap<String, f64> = load_cases
        .iter()
        .map(|lc| (lc.name.clone(), 1.0))
        .collect();
    MultiCaseInput3D {
        solver: SolverInput3D { loads: vec![], ..base.clone() },
        load_cases,
        combinations: vec![CombinationDef { name: "All".to_string(), factors }],
    }
}

fn bench_multi_case(c: &mut Criterion) {
    let mut group = c.benchmark_group("multi_case");
    let base = make_frame_3d(10, 3);

    for n_cases in [1usize, 4, 16] {
        let input = make_multi_case_input_3d(&base, n_cases);

        // Baseline: N independent full solves (old multi-case behavior)
        group.bench_with_input(BenchmarkId::new("naive_full_solves", n_cases), &input, |b, input| {
            b.iter(|| {
                for lc in &input.load_cases {
                    let case_input = SolverInput3D {
                        nodes: input.solver.nodes.clone(),
                        materials: input.solver.materials.clone(),
                        sections: input.solver.sections.clone(),
                        elements: input.solver.elements.clone(),
                        supports: input.solver.supports.clone(),
                        loads: lc.loads.clone(),
                        left_hand: input.solver.left_hand,
                        plates: input.solver.plates.clone(),
                        quads: input.solver.quads.clone(),
                        quad9s: input.solver.quad9s.clone(),
                        solid_shells: input.solver.solid_shells.clone(),
                        curved_shells: input.solver.curved_shells.clone(),
                        curved_beams: input.solver.curved_beams.clone(),
                        constraints: vec![],
                        connectors: HashMap::new(),
                    };
                    criterion::black_box(linear::solve_3d(&case_input).unwrap());
                }
            });
        });

        // New: prepared multi-case (assemble + factorize once, rebuild only f per case)
        group.bench_with_input(BenchmarkId::new("prepared_multi_case", n_cases), &input, |b, input| {
            b.iter(|| {
                criterion::black_box(
                    dedaliano_engine::solver::load_cases::solve_multi_case_3d(input).unwrap(),
                );
            });
        });
    }
    group.finish();
}

// ─── Moving loads / influence line factorization reuse ─────

fn bench_moving_influence_reuse(c: &mut Criterion) {
    use dedaliano_engine::postprocess::influence::{
        compute_influence_line, influence_unit_loads_2d, InfluenceLineInput,
    };
    use dedaliano_engine::solver::moving_loads::{build_load_path, moving_loads_at_position_2d};

    let mut group = c.benchmark_group("moving_influence_reuse");
    group.sample_size(20);

    let train = LoadTrain {
        name: "HL93".to_string(),
        axles: vec![
            Axle { offset: 0.0, weight: 35.0 },
            Axle { offset: 4.3, weight: 145.0 },
            Axle { offset: 8.6, weight: 145.0 },
        ],
    };
    let step = 0.25;

    // Moving loads 2D: n=16 → dense path (nf=48), n=64 → sparse path (nf=192)
    for n in [16usize, 64] {
        let solver = make_ss_beam(n);
        let path = build_load_path(&solver, None).unwrap();
        let total_length: f64 = path.iter().map(|s| s.length).sum();
        let max_offset: f64 = train.axles.iter().map(|a| a.offset).fold(0.0, f64::max);

        // Legacy: clone + full solve per position
        group.bench_with_input(BenchmarkId::new("moving_2d_legacy", n), &solver, |b, solver| {
            b.iter(|| {
                let mut pos = -max_offset;
                while pos <= total_length + 1e-10 {
                    let loads = moving_loads_at_position_2d(solver, &train, &path, pos, total_length);
                    let mut mi = solver.clone();
                    mi.loads = loads;
                    criterion::black_box(linear::solve_2d(&mi).unwrap());
                    pos += step;
                }
            });
        });

        // Prepared: production path (prepare once + solve_loads per position)
        let input = MovingLoadInput {
            solver,
            train: train.clone(),
            step: Some(step),
            path_element_ids: None,
        };
        group.bench_with_input(BenchmarkId::new("moving_2d_prepared", n), &input, |b, input| {
            b.iter(|| moving_loads::solve_moving_loads_2d(input).unwrap());
        });
    }

    // Influence line 2D: unit load at 11 points on each of n elements
    let n_pts = 10usize;
    for n in [16usize, 64] {
        let solver = make_ss_beam(n);
        let node_pos: HashMap<usize, (f64, f64)> =
            solver.nodes.values().map(|nd| (nd.id, (nd.x, nd.z))).collect();

        // Legacy: full solve per sampled point
        group.bench_with_input(BenchmarkId::new("influence_2d_legacy", n), &solver, |b, solver| {
            b.iter(|| {
                let base = SolverInput { loads: vec![], ..solver.clone() };
                for elem in solver.elements.values() {
                    let (nix, niy) = node_pos[&elem.node_i];
                    let (njx, njy) = node_pos[&elem.node_j];
                    let dx = njx - nix;
                    let dy = njy - niy;
                    let l = (dx * dx + dy * dy).sqrt();
                    let cos_theta = dx / l;
                    let sin_theta = dy / l;
                    for k in 0..=n_pts {
                        let t = k as f64 / n_pts as f64;
                        let loads = influence_unit_loads_2d(elem, t * l, t, cos_theta, sin_theta);
                        let mut trial = base.clone();
                        trial.loads = loads;
                        criterion::black_box(linear::solve_2d(&trial).unwrap());
                    }
                }
            });
        });

        // Prepared: production path
        let input = InfluenceLineInput {
            solver,
            quantity: "M".to_string(),
            target_node_id: None,
            target_element_id: Some(1),
            target_position: 0.5,
            n_points_per_element: n_pts,
        };
        group.bench_with_input(BenchmarkId::new("influence_2d_prepared", n), &input, |b, input| {
            b.iter(|| compute_influence_line(input).unwrap());
        });
    }

    group.finish();
}

// ─── 2D sparse assembly vs legacy dense assembly (nf >= 64) ─────

fn bench_sparse_2d_assembly(c: &mut Criterion) {
    let mut group = c.benchmark_group("sparse_2d_assembly");

    for &(stories, bays) in &[(50usize, 5usize), (100, 5), (200, 5)] {
        let input = make_frame(stories, bays);
        let label = format!("{}s_{}b", stories, bays);

        // Legacy: dense n×n assembly + dense K_ff extraction + CSC conversion
        group.bench_with_input(BenchmarkId::new("dense_legacy", &label), &input, |b, input| {
            b.iter(|| {
                let prepared = linear::prepare_static_2d_dense_reference(input).unwrap();
                criterion::black_box(prepared.solve_loads(&input.loads).unwrap());
            });
        });

        // New: triplet sparse assembly + sparse Cholesky
        group.bench_with_input(BenchmarkId::new("triplet_sparse", &label), &input, |b, input| {
            b.iter(|| linear::solve_2d(input).unwrap());
        });
    }
    group.finish();
}

criterion_group!(
    benches,
    bench_json_roundtrip,
    bench_linear_beam,
    bench_linear_frame,
    bench_json_solve,
    bench_buckling,
    bench_modal,
    bench_pdelta,
    bench_plastic,
    bench_linear_beam_3d,
    bench_linear_frame_3d,
    bench_modal_3d,
    bench_pdelta_3d,
    bench_multi_case,
    bench_moving_influence_reuse,
    bench_sparse_2d_assembly,
    bench_moving_loads,
    bench_cable,
    bench_constraints,
    bench_winkler,
    bench_creep_shrinkage,
    bench_corotational,
    bench_material_nonlinear,
    bench_fiber_nonlinear,
    bench_contact,
    bench_staged,
);
criterion_main!(benches);
