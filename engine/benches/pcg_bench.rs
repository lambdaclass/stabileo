//! Crossover benchmarks: sparse direct Cholesky vs PCG (Jacobi / SSOR / IC(0)
//! / shifted-IC / MIC).
//!
//! Measures only the solve phase (assembly is done once at setup). Families:
//! simply-supported MITC4 plates under uniform pressure (10×10, 20×20, 30×30,
//! 50×50) and 3D building frames (~1.5k and ~4.3k free DOFs). The results
//! feed the `ITERATIVE_THRESHOLD` auto-selection constant in
//! `solver/linear.rs`.

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use dedaliano_engine::linalg::{
    numeric_cholesky, pcg_solve, sparse_cholesky_solve, symbolic_cholesky, CscMatrix,
    Ic0Preconditioner, JacobiPreconditioner, SsorPreconditioner,
};
use dedaliano_engine::linalg::preconditioner::{MicPreconditioner, ShiftedIcPreconditioner};
use dedaliano_engine::solver::assembly::assemble_sparse_3d;
use dedaliano_engine::solver::dof::DofNumbering;
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

    // Lateral (X) + gravity (Z) loads at each floor
    let mut loads = Vec::new();
    for level in 1..=stories {
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: node_id(level, 0, 0),
            fx: 10.0, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }));
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

// ─── Solve paths under measurement ──────────────────────────

/// Direct: symbolic + numeric factorization + triangular solves.
fn direct_solve(k_ff: &CscMatrix, f_f: &[f64]) -> Vec<f64> {
    let sym = std::rc::Rc::new(symbolic_cholesky(k_ff));
    let num = numeric_cholesky(&sym, k_ff).expect("direct numeric factorization failed in bench");
    sparse_cholesky_solve(&num, f_f)
}

fn pcg_jacobi(k_ff: &CscMatrix, f_f: &[f64], max_iter: usize) {
    let pre = JacobiPreconditioner::new(k_ff).expect("jacobi build failed in bench");
    pcg_solve(k_ff, f_f, &pre, 1e-8, max_iter);
}

fn pcg_ssor(k_ff: &CscMatrix, f_f: &[f64], max_iter: usize) {
    let pre = SsorPreconditioner::new(k_ff, 1.0).expect("ssor build failed in bench");
    pcg_solve(k_ff, f_f, &pre, 1e-8, max_iter);
}

fn pcg_ic0(k_ff: &CscMatrix, f_f: &[f64], max_iter: usize) {
    let pre = Ic0Preconditioner::new(k_ff).expect("ic0 build failed in bench");
    pcg_solve(k_ff, f_f, &pre, 1e-8, max_iter);
}

fn pcg_ics(k_ff: &CscMatrix, f_f: &[f64], max_iter: usize) {
    let pre = ShiftedIcPreconditioner::new(k_ff, 0.0);
    pcg_solve(k_ff, f_f, &pre, 1e-8, max_iter);
}

fn pcg_mic(k_ff: &CscMatrix, f_f: &[f64], max_iter: usize) {
    let pre = MicPreconditioner::new(k_ff).expect("mic build failed in bench");
    pcg_solve(k_ff, f_f, &pre, 1e-8, max_iter);
}

/// One-off sanity info (not measured): iterations / convergence per variant.
/// Returns which variants converged (jacobi, ssor, ic0, ics, mic) — variants
/// that did not converge must not be benchmarked: their timing would measure
/// a stalled attempt, not a solve.
fn report_convergence(label: &str, k_ff: &CscMatrix, f_f: &[f64], max_iter: usize) -> (bool, bool, bool, bool, bool) {
    let f_norm: f64 = f_f.iter().map(|v| v * v).sum::<f64>().sqrt();
    let report = |name: &str, res: dedaliano_engine::linalg::PcgResult| {
        let ku = k_ff.sym_mat_vec(&res.x);
        let true_rel: f64 = ku
            .iter()
            .zip(f_f.iter())
            .map(|(a, b)| (a - b).powi(2))
            .sum::<f64>()
            .sqrt()
            / f_norm.max(1e-30);
        eprintln!(
            "    [{label}] {name}: converged={} iters={} final_rel={:.2e} true_rel={:.2e}",
            res.converged, res.iterations, res.final_rel_residual, true_rel
        );
        res.converged && true_rel <= 1e-6
    };
    let jacobi_ok = match JacobiPreconditioner::new(k_ff) {
        Some(pre) => report("jacobi", pcg_solve(k_ff, f_f, &pre, 1e-8, max_iter)),
        None => false,
    };
    let ssor_ok = match SsorPreconditioner::new(k_ff, 1.0) {
        Some(pre) => report("ssor", pcg_solve(k_ff, f_f, &pre, 1e-8, max_iter)),
        None => false,
    };
    let ic0_ok = match Ic0Preconditioner::new(k_ff) {
        Some(pre) => report("ic0", pcg_solve(k_ff, f_f, &pre, 1e-8, max_iter)),
        None => {
            eprintln!("    [{label}] ic0: BUILD FAILED (non-SPD pivot on pattern)");
            false
        }
    };
    let ics_pre = ShiftedIcPreconditioner::new(k_ff, 0.0);
    eprintln!("    [{label}] ics: perturbations={}", ics_pre.perturbations());
    let ics_ok = report("ics", pcg_solve(k_ff, f_f, &ics_pre, 1e-8, max_iter));
    let mic_ok = match MicPreconditioner::new(k_ff) {
        Some(pre) => report("mic", pcg_solve(k_ff, f_f, &pre, 1e-8, max_iter)),
        None => {
            eprintln!("    [{label}] mic: BUILD FAILED (non-SPD pivot on pattern)");
            false
        }
    };
    (jacobi_ok, ssor_ok, ic0_ok, ics_ok, mic_ok)
}

fn bench_model(group: &mut criterion::BenchmarkGroup<'_, criterion::measurement::WallTime>,
               label: &str, input: &SolverInput3D) {
    let dof_num = DofNumbering::build_3d(input);
    let nf = dof_num.n_free;
    let asm = assemble_sparse_3d(input, &dof_num, false);
    let k_ff = asm.k_ff;
    let f_f: Vec<f64> = asm.f[..nf].to_vec();
    let max_iter = 1000usize.max(nf / 4);
    eprintln!("  [{label}] n_free={nf} nnz(k_ff)={}", k_ff.nnz());
    let (jacobi_ok, ssor_ok, ic0_ok, ics_ok, mic_ok) = report_convergence(label, &k_ff, &f_f, max_iter);

    group.bench_with_input(BenchmarkId::new("direct", label), &(), |b, _| {
        b.iter(|| direct_solve(&k_ff, &f_f));
    });
    if jacobi_ok {
        group.bench_with_input(BenchmarkId::new("pcg_jacobi", label), &(), |b, _| {
            b.iter(|| pcg_jacobi(&k_ff, &f_f, max_iter));
        });
    }
    if ssor_ok {
        group.bench_with_input(BenchmarkId::new("pcg_ssor", label), &(), |b, _| {
            b.iter(|| pcg_ssor(&k_ff, &f_f, max_iter));
        });
    }
    if ic0_ok {
        group.bench_with_input(BenchmarkId::new("pcg_ic0", label), &(), |b, _| {
            b.iter(|| pcg_ic0(&k_ff, &f_f, max_iter));
        });
    }
    if ics_ok {
        group.bench_with_input(BenchmarkId::new("pcg_ics", label), &(), |b, _| {
            b.iter(|| pcg_ics(&k_ff, &f_f, max_iter));
        });
    }
    if mic_ok {
        group.bench_with_input(BenchmarkId::new("pcg_mic", label), &(), |b, _| {
            b.iter(|| pcg_mic(&k_ff, &f_f, max_iter));
        });
    }
}

fn bench_pcg_crossover(c: &mut Criterion) {
    let mut group = c.benchmark_group("pcg_crossover");
    group.sample_size(10);
    group.warm_up_time(Duration::from_secs(1));
    group.measurement_time(Duration::from_secs(2));

    for &n in &[10usize, 20, 30, 50] {
        let input = make_ss_plate_3d(n);
        bench_model(&mut group, &format!("shell_{n}x{n}"), &input);
    }
    for &(stories, bx, by) in &[(10usize, 4usize, 4usize), (20, 5, 5)] {
        let input = make_building_frame_3d(stories, bx, by);
        bench_model(&mut group, &format!("frame_{stories}s_{bx}x{by}b"), &input);
    }
    group.finish();
}

criterion_group!(benches, bench_pcg_crossover);
criterion_main!(benches);
