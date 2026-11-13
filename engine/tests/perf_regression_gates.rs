//! Performance regression gate tests.
//!
//! These tests enforce timing and scale bounds on key solver operations
//! so that algorithmic regressions (e.g. O(n^2) -> O(n^3)) are caught by
//! `cargo test` without needing a separate benchmark runner.
//!
//! Bounds are deliberately generous (5-10x expected time) so they pass on
//! slow CI machines but still catch catastrophic regressions.
//!
//! Run selectively:  cargo test perf_regression -- --nocapture

use dedaliano_engine::solver::linear;
use dedaliano_engine::solver::assembly::{assemble_sparse_2d, assemble_sparse_3d, assemble_3d};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::types::*;
use std::collections::HashMap;
use std::time::Instant;

// ==================== Model Builders ====================

/// Build a simply-supported 2D multi-span beam with `n` frame elements.
fn make_2d_beam(n: usize) -> SolverInput {
    let mut nodes = HashMap::new();
    for i in 0..=n {
        nodes.insert(
            i.to_string(),
            SolverNode {
                id: i,
                x: i as f64,
                z: 0.0,
            },
        );
    }

    let mut materials = HashMap::new();
    materials.insert(
        "1".to_string(),
        SolverMaterial {
            id: 1,
            e: 200e3,
            nu: 0.3,
        },
    );

    let mut sections = HashMap::new();
    sections.insert(
        "1".to_string(),
        SolverSection {
            id: 1,
            a: 0.01,
            iz: 1e-4,
            as_y: None,
        },
    );

    let mut elements = HashMap::new();
    for i in 0..n {
        elements.insert(
            i.to_string(),
            SolverElement {
                id: i,
                elem_type: "frame".to_string(),
                node_i: i,
                node_j: i + 1,
                material_id: 1,
                section_id: 1,
                hinge_start: false,
                hinge_end: false,
            },
        );
    }

    let mut supports = HashMap::new();
    // Fixed at first node
    supports.insert(
        "0".to_string(),
        SolverSupport {
            id: 0,
            node_id: 0,
            support_type: "fixed".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: None,
            dry: None,
            angle: None,
        },
    );
    // Roller supports every 10 elements (or at the end)
    let step = if n >= 10 { 10 } else { n };
    for i in (step..=n).step_by(step) {
        supports.insert(
            i.to_string(),
            SolverSupport {
                id: i,
                node_id: i,
                support_type: "pinned".to_string(),
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

    // Point load at midspan
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2,
        fx: 0.0,
        fz: -10.0,
        my: 0.0,
    })];

    SolverInput {
        solver_options: None, masses: Default::default(),
        nodes,
        materials,
        sections,
        elements,
        supports,
        loads,
        constraints: vec![],
        connectors: HashMap::new(),
    }
}

/// Build an nx*ny simply-supported MITC4 plate with uniform pressure.
fn make_plate_3d(nx: usize, ny: usize) -> SolverInput3D {
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
            nodes.insert(
                nid.to_string(),
                SolverNode3D {
                    id: nid,
                    x,
                    y,
                    z: 0.0,
                },
            );
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

    // Simply-supported edges: rz on all boundary, pin corner fully
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
                rx: false,
                ry: n == grid[nx][0],
                rz: true,
                rrx: false,
                rry: false,
                rrz: false,
                kx: None,
                ky: None,
                kz: None,
                krx: None,
                kry: None,
                krz: None,
                dx: None,
                dy: None,
                dz: None,
                drx: None,
                dry: None,
                drz: None,
                normal_x: None,
                normal_y: None,
                normal_z: None,
                is_inclined: None,
                rw: None,
                kw: None,
            },
        );
        sid += 1;
    }
    supports.insert(
        sid.to_string(),
        SolverSupport3D {
            node_id: grid[0][0],
            rx: true,
            ry: true,
            rz: true,
            rrx: false,
            rry: false,
            rrz: false,
            kx: None,
            ky: None,
            kz: None,
            krx: None,
            kry: None,
            krz: None,
            dx: None,
            dy: None,
            dz: None,
            drx: None,
            dry: None,
            drz: None,
            normal_x: None,
            normal_y: None,
            normal_z: None,
            is_inclined: None,
            rw: None,
            kw: None,
        },
    );

    let n_quads = quads.len();
    let loads: Vec<SolverLoad3D> = (1..=n_quads)
        .map(|eid| SolverLoad3D::QuadPressure(SolverPressureLoad { element_id: eid, pressure: -1.0 }))
        .collect();

    SolverInput3D {
        solver_options: None, masses: Default::default(),
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

// ==================== 1. Solver Timing Gates ====================

/// Gate: 10-element 2D frame solve must complete in < 100ms.
#[test]
fn solve_2d_10_elements_under_100ms() {
    let input = make_2d_beam(10);

    // Warmup
    let _ = linear::solve_2d(&input);

    let t0 = Instant::now();
    let result = linear::solve_2d(&input).expect("2D solve failed");
    let elapsed = t0.elapsed();

    println!(
        "10-element 2D frame: {:.1}ms, {} displacements",
        elapsed.as_secs_f64() * 1000.0,
        result.displacements.len()
    );

    dedaliano_engine::wall_clock::budget(
        elapsed.as_millis() < 100,
        || format!("10-element 2D solve took {}ms (limit: 100ms)", elapsed.as_millis()),
    );
    assert!(!result.displacements.is_empty());
}

/// Gate: 100-element 2D frame solve must complete in < 500ms.
#[test]
fn solve_2d_100_elements_under_500ms() {
    let input = make_2d_beam(100);

    // Warmup
    let _ = linear::solve_2d(&input);

    let t0 = Instant::now();
    let result = linear::solve_2d(&input).expect("2D solve failed");
    let elapsed = t0.elapsed();

    println!(
        "100-element 2D frame: {:.1}ms, {} displacements",
        elapsed.as_secs_f64() * 1000.0,
        result.displacements.len()
    );

    dedaliano_engine::wall_clock::budget(
        elapsed.as_millis() < 500,
        || format!("100-element 2D solve took {}ms (limit: 500ms)", elapsed.as_millis()),
    );
    assert!(!result.displacements.is_empty());
}

/// Gate: 5x5 MITC4 plate (25 elements) 3D solve must complete in < 2s.
#[test]
fn solve_3d_5x5_plate_under_2s() {
    let input = make_plate_3d(5, 5);

    // Warmup
    let _ = linear::solve_3d(&input);

    let t0 = Instant::now();
    let result = linear::solve_3d(&input).expect("3D solve failed");
    let elapsed = t0.elapsed();

    println!(
        "5x5 MITC4 plate (25 elems): {:.1}ms, {} displacements",
        elapsed.as_secs_f64() * 1000.0,
        result.displacements.len()
    );

    dedaliano_engine::wall_clock::budget(
        elapsed.as_secs() < 2,
        || format!("5x5 plate 3D solve took {:.1}s (limit: 2s)", elapsed.as_secs_f64()),
    );
    assert!(!result.displacements.is_empty());
}

// ==================== 2. Assembly Timing Gates ====================

/// Gate: 2D sparse assembly for 100 elements must complete in < 200ms.
#[test]
fn assembly_2d_100_elements_under_200ms() {
    let input = make_2d_beam(100);
    let dof_num = DofNumbering::build_2d(&input);

    // Warmup
    let _ = assemble_sparse_2d(&input, &dof_num);

    let t0 = Instant::now();
    let asm = assemble_sparse_2d(&input, &dof_num);
    let elapsed = t0.elapsed();

    let nf = dof_num.n_free;
    let nnz = asm.k_ff.col_ptr[nf];
    println!(
        "100-element 2D assembly: {:.1}ms, nf={}, nnz={}",
        elapsed.as_secs_f64() * 1000.0,
        nf,
        nnz
    );

    dedaliano_engine::wall_clock::budget(
        elapsed.as_millis() < 200,
        || format!("100-element 2D assembly took {}ms (limit: 200ms)", elapsed.as_millis()),
    );
    assert!(nnz > 0, "Assembled matrix should have nonzeros");
}

/// Gate: 3D sparse assembly for 10x10 plate (100 elements) must complete in < 500ms.
#[test]
fn assembly_3d_100_elements_under_500ms() {
    let input = make_plate_3d(10, 10);
    let dof_num = DofNumbering::build_3d(&input);

    // Warmup
    let _ = assemble_sparse_3d(&input, &dof_num, false);

    let t0 = Instant::now();
    let asm = assemble_sparse_3d(&input, &dof_num, false);
    let elapsed = t0.elapsed();

    let nf = dof_num.n_free;
    let nnz = asm.k_ff.col_ptr[nf];
    println!(
        "10x10 plate 3D assembly: {:.1}ms, nf={}, nnz={}",
        elapsed.as_secs_f64() * 1000.0,
        nf,
        nnz
    );

    dedaliano_engine::wall_clock::budget(
        elapsed.as_millis() < 500,
        || format!("10x10 plate 3D assembly took {}ms (limit: 500ms)", elapsed.as_millis()),
    );
    assert!(nnz > 0, "Assembled matrix should have nonzeros");
}

// ==================== 3. Scale / Complexity Gates ====================

/// Gate: 2D solve scales sub-cubically.
///
/// For sparse solvers on banded 1D problems, solve time should grow as
/// roughly O(N). We test at N=50 and N=200 and verify the time ratio is
/// < 10x (would be ~4x for O(N), ~5.6x for O(N^1.5), 64x for O(N^3)).
#[test]
fn scale_2d_solve_sub_cubic() {
    let small = make_2d_beam(50);
    let large = make_2d_beam(200);

    // Warmup both sizes
    let _ = linear::solve_2d(&small);
    let _ = linear::solve_2d(&large);

    // Measure small
    let t0 = Instant::now();
    for _ in 0..3 {
        let _ = linear::solve_2d(&small);
    }
    let small_us = t0.elapsed().as_micros() / 3;

    // Measure large
    let t0 = Instant::now();
    for _ in 0..3 {
        let _ = linear::solve_2d(&large);
    }
    let large_us = t0.elapsed().as_micros() / 3;

    let ratio = large_us as f64 / small_us.max(1) as f64;
    let n_ratio = 200.0 / 50.0; // = 4
    // O(N^1.5) => ratio ~ 4^1.5 = 8. O(N^3) => ratio ~ 4^3 = 64.
    // We allow up to 10x to stay CI-safe while still catching cubic blowup.

    println!(
        "2D scale test: 50 elems = {}us, 200 elems = {}us, ratio = {:.1}x (N ratio = {:.0}x)",
        small_us, large_us, ratio, n_ratio
    );

    dedaliano_engine::wall_clock::budget(
        ratio < 10.0,
        || format!("2D solve time ratio {:.1}x exceeds 10x for 4x element increase — suggests worse-than-N^1.5 scaling", ratio),
    );
}

/// Gate: 3D assembly scales sub-cubically.
///
/// For sparse assembly, time should grow roughly O(N). We test at 5x5 (25 elems)
/// and 14x14 (196 elems) and verify the ratio is < 12x.
#[test]
fn scale_3d_assembly_sub_cubic() {
    let small = make_plate_3d(5, 5);
    let large = make_plate_3d(14, 14);
    let small_dof = DofNumbering::build_3d(&small);
    let large_dof = DofNumbering::build_3d(&large);

    // Warmup
    let _ = assemble_sparse_3d(&small, &small_dof, false);
    let _ = assemble_sparse_3d(&large, &large_dof, false);

    // Measure small (average of 3 runs)
    let t0 = Instant::now();
    for _ in 0..3 {
        let _ = assemble_sparse_3d(&small, &small_dof, false);
    }
    let small_us = t0.elapsed().as_micros() / 3;

    // Measure large (average of 3 runs)
    let t0 = Instant::now();
    for _ in 0..3 {
        let _ = assemble_sparse_3d(&large, &large_dof, false);
    }
    let large_us = t0.elapsed().as_micros() / 3;

    let ratio = large_us as f64 / small_us.max(1) as f64;
    let n_elem_ratio = (14.0 * 14.0) / (5.0 * 5.0); // ~7.8x elements

    println!(
        "3D assembly scale: 5x5 = {}us, 14x14 = {}us, ratio = {:.1}x (elem ratio = {:.1}x)",
        small_us, large_us, ratio, n_elem_ratio
    );

    // O(N) assembly => ratio ~ 7.8. O(N^2) => ratio ~ 61.
    // 12x threshold catches quadratic blowup while being generous for CI.
    dedaliano_engine::wall_clock::budget(
        ratio < 12.0,
        || format!("3D assembly time ratio {:.1}x exceeds 12x for {:.1}x element increase — regression likely", ratio, n_elem_ratio),
    );
}

/// Gate: 3D end-to-end solve scales sub-cubically.
///
/// Test at 5x5 (25 elems) and 10x10 (100 elems). For sparse Cholesky on
/// a 2D plate mesh, expected scaling is O(N^1.5) where N is DOF count
/// (i.e. O(n_elem^1.5)). 4x elements => ~8x time.
/// We allow up to 15x to stay CI-safe.
#[test]
fn scale_3d_solve_sub_cubic() {
    let small = make_plate_3d(5, 5);
    let large = make_plate_3d(10, 10);

    // Warmup
    let _ = linear::solve_3d(&small);
    let _ = linear::solve_3d(&large);

    // Measure small (average of 3 runs)
    let t0 = Instant::now();
    for _ in 0..3 {
        let _ = linear::solve_3d(&small);
    }
    let small_us = t0.elapsed().as_micros() / 3;

    // Measure large (average of 3 runs)
    let t0 = Instant::now();
    for _ in 0..3 {
        let _ = linear::solve_3d(&large);
    }
    let large_us = t0.elapsed().as_micros() / 3;

    let ratio = large_us as f64 / small_us.max(1) as f64;
    let n_elem_ratio = (10.0 * 10.0) / (5.0 * 5.0); // = 4

    println!(
        "3D solve scale: 5x5 = {}us, 10x10 = {}us, ratio = {:.1}x (elem ratio = {:.0}x)",
        small_us, large_us, ratio, n_elem_ratio
    );

    // O(N^1.5) on DOFs => 4^1.5 * DOF-per-elem factor. Practically ~8-12x.
    // 15x catches cubic blowup; 4^3 = 64x.
    dedaliano_engine::wall_clock::budget(
        ratio < 15.0,
        || format!("3D solve time ratio {:.1}x exceeds 15x for 4x element increase — possible cubic regression", ratio),
    );
}

// ==================== 4. Sparse vs Dense Parity Gate ====================

/// Gate: sparse 3D solve must not be slower than dense 3D solve for a 10x10 plate.
///
/// This verifies that the sparse path delivers the expected speedup on models
/// above the sparse threshold. The sparse path should always win at 100+ elements.
///
/// Marked #[ignore] because wall-clock comparisons can be flaky on loaded CI
/// machines. Run explicitly: `cargo test perf_regression -- --ignored --nocapture`
#[test]
#[ignore]
fn sparse_not_slower_than_dense_3d() {
    let input = make_plate_3d(10, 10);
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    // Warmup both paths
    let _ = assemble_sparse_3d(&input, &dof_num, false);
    let _ = assemble_3d(&input, &dof_num);

    // Dense path: assemble + extract K_ff + solve
    let t0 = Instant::now();
    let asm_d = assemble_3d(&input, &dof_num);
    let free_idx: Vec<usize> = (0..nf).collect();
    let k_ff_d = dedaliano_engine::linalg::extract_submatrix(&asm_d.k, n, &free_idx, &free_idx);
    let f_f_d = dedaliano_engine::linalg::extract_subvec(&asm_d.f, &free_idx);
    let mut k_work = k_ff_d;
    let _ = dedaliano_engine::linalg::cholesky_solve(&mut k_work, &f_f_d, nf);
    let dense_us = t0.elapsed().as_micros();

    // Sparse path: assemble sparse + symbolic + numeric + solve
    let t0 = Instant::now();
    let asm_s = assemble_sparse_3d(&input, &dof_num, false);
    let sym = std::rc::Rc::new(dedaliano_engine::linalg::symbolic_cholesky(&asm_s.k_ff));
    let num = dedaliano_engine::linalg::numeric_cholesky(&sym, &asm_s.k_ff)
        .expect("Sparse Cholesky should succeed");
    let f_s = asm_s.f[..nf].to_vec();
    let _ = dedaliano_engine::linalg::sparse_cholesky_solve(&num, &f_s);
    let sparse_us = t0.elapsed().as_micros();

    let speedup = dense_us as f64 / sparse_us.max(1) as f64;
    println!(
        "10x10 plate: sparse={}us, dense={}us, speedup={:.1}x",
        sparse_us, dense_us, speedup
    );

    dedaliano_engine::wall_clock::budget(
        sparse_us <= dense_us * 2,
        || format!("Sparse path ({}us) is more than 2x slower than dense ({}us) on 10x10 plate — regression", sparse_us, dense_us),
    );
}

// ==================== Per-load-case cost on a prepared model ====================

/// How long this thread takes to do a fixed amount of the solver's kind of arithmetic: forty
/// dense 400 × 400 matrix-vector products. A budget in units of it holds on a slow runner and
/// under a loaded one, where a budget in milliseconds does not (these gates ran three times
/// slower under the web suite than alone).
fn calibration_ms() -> f64 {
    let n = 400;
    let a: Vec<f64> = (0..n * n).map(|i| 1.0 + (i % 97) as f64 * 1e-3).collect();
    let mut x: Vec<f64> = (0..n).map(|i| (i as f64).sin()).collect();
    let t0 = Instant::now();
    for _ in 0..40 {
        let mut y = vec![0.0; n];
        for (i, yi) in y.iter_mut().enumerate() {
            *yi = a[i * n..(i + 1) * n].iter().zip(&x).map(|(p, q)| p * q).sum();
        }
        let scale = y.iter().map(|v| v.abs()).fold(0.0f64, f64::max).max(1e-300);
        for v in &mut y { *v /= scale; }
        x = y;
    }
    assert!(x.iter().all(|v| v.is_finite()));
    t0.elapsed().as_secs_f64() * 1000.0
}

/// The median over three rounds of `run`'s time in calibrations, each round calibrated first.
fn cost_in_calibrations(mut run: impl FnMut()) -> (f64, f64) {
    let mut rounds: Vec<(f64, f64)> = (0..3).map(|_| {
        let unit = calibration_ms();
        let t0 = Instant::now();
        run();
        let ms = t0.elapsed().as_secs_f64() * 1000.0;
        (ms, ms / unit)
    }).collect();
    rounds.sort_by(|a, b| a.1.total_cmp(&b.1));
    rounds[1]
}

/// Gate: on a prepared 600-element 2D frame, ten load cases through `solve_loads` cost at most
/// `CASES_2D_LIMIT` calibrations together. The per-case path (load vector, triangular solve,
/// recovery, the small-displacement and second-order screens, the self-checks) is what every case
/// of a combination solve pays; in November 2026 the screens alone cost 15 times the solve, and
/// these ten cases measured 12,2 calibrations (3D: 9,0) against 1,6 (3D: 1,1) once fixed. Each
/// limit is near the geometric mean of the two: the regression fails it and the fixed cost has
/// close to three times its room.
const CASES_2D_LIMIT: f64 = 4.5;
const CASES_3D_LIMIT: f64 = 3.0;

#[test]
fn prepared_2d_ten_load_cases_within_budget() {
    let input = make_2d_beam(600);
    let prepared = linear::prepare_static_2d(&input).expect("prepare failed");
    let cases: Vec<Vec<SolverLoad>> = (1..=10)
        .map(|k| vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 60 * k - 30, fx: 0.0, fz: -10.0 * k as f64, my: 0.0 })])
        .collect();

    // Warmup
    let _ = prepared.solve_loads(&cases[0]).expect("case solve failed");

    let (ms, ratio) = cost_in_calibrations(|| {
        for loads in &cases {
            let result = prepared.solve_loads(loads).expect("case solve failed");
            assert!(!result.displacements.is_empty());
        }
    });

    println!("600-element 2D frame, 10 prepared cases: {ms:.1}ms, {ratio:.2} calibrations");

    dedaliano_engine::wall_clock::budget(
        ratio < CASES_2D_LIMIT,
        || format!("10 prepared 2D load cases took {ms:.0}ms, {ratio:.2} calibrations (limit: {CASES_2D_LIMIT})"),
    );
}

// ==================== 3D frame builder (as engine/benches/workflow_bench.rs) ====================

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
            SolverSection3D { id, name: None, a, iy, iz, j, cw: None, as_y: None, as_z: None, shear_center_y: None, shear_center_z: None },
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
        constraints: vec![],
        left_hand: None,
        plates: HashMap::new(),
        quads: HashMap::new(), quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),

        solver_options: None, masses: Default::default(),    }
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


/// Gate: on a prepared 20-storey, 5-bay 3D frame (220 members), ten load cases through
/// `solve_loads` cost at most `CASES_3D_LIMIT` calibrations together; see
/// `prepared_2d_ten_load_cases_within_budget`.
#[test]
fn prepared_3d_ten_load_cases_within_budget() {
    let input = make_frame_3d(20, 5);
    let prepared = linear::prepare_static_3d(&input).expect("prepare failed");
    let cases: Vec<Vec<SolverLoad3D>> = (1..=10)
        .map(|k| input.loads.iter().cloned().map(|l| match l {
            SolverLoad3D::Nodal(mut n) => { n.fz *= k as f64; SolverLoad3D::Nodal(n) }
            other => other,
        }).collect())
        .collect();

    // Warmup
    let _ = prepared.solve_loads(&cases[0]).expect("case solve failed");

    let (ms, ratio) = cost_in_calibrations(|| {
        for loads in &cases {
            let result = prepared.solve_loads(loads).expect("case solve failed");
            assert!(!result.displacements.is_empty());
        }
    });

    println!("20x5 3D frame, 10 prepared cases: {ms:.1}ms, {ratio:.2} calibrations");

    dedaliano_engine::wall_clock::budget(
        ratio < CASES_3D_LIMIT,
        || format!("10 prepared 3D load cases took {ms:.0}ms, {ratio:.2} calibrations (limit: {CASES_3D_LIMIT})"),
    );
}
