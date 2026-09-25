//! Integration tests for the PCG solver path: parity vs direct solvers,
//! preconditioner selection, fallback with diagnostics, determinism,
//! prescribed displacements, option validation, and backward compatibility.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use std::collections::HashMap;

// ==================== Model builders ====================

/// 2D continuous beam: 30 frame elements (93 DOFs, 90 free ≥ sparse threshold).
fn make_beam_2d() -> SolverInput {
    let n_elem = 30;
    let mut nodes = HashMap::new();
    for i in 0..=n_elem {
        nodes.insert(
            (i + 1).to_string(),
            SolverNode { id: i + 1, x: i as f64 * 0.5, z: 0.0 },
        );
    }
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });
    let mut elements = HashMap::new();
    for i in 0..n_elem {
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
            id: 2, node_id: n_elem + 1, support_type: "rollerX".to_string(),
            kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
        },
    );
    let loads: Vec<SolverLoad> = (1..=n_elem)
        .map(|eid| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: eid, q_i: -10.0, q_j: -10.0, a: None, b: None,
            })
        })
        .collect();
    SolverInput {
        nodes, materials, sections, elements, supports, loads,
        constraints: vec![],
        connectors: HashMap::new(),
        solver_options: None,
    }
}

/// Same beam with an imposed settlement at the roller support.
fn make_beam_2d_settlement() -> SolverInput {
    let mut input = make_beam_2d();
    input.supports.get_mut("2").unwrap().dz = Some(0.01);
    input
}

/// 3D cantilever: 15 frame elements (96 DOFs, 90 free ≥ sparse threshold).
fn make_cantilever_3d() -> SolverInput3D {
    let n_elem = 15;
    let mut nodes = HashMap::new();
    for i in 0..=n_elem {
        nodes.insert(
            (i + 1).to_string(),
            SolverNode3D { id: i + 1, x: i as f64 * 0.5, y: 0.0, z: 0.0 },
        );
    }
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert(
        "1".to_string(),
        SolverSection3D {
            id: 1, name: None, a: 0.01, iy: 1e-4, iz: 1e-4, j: 2e-4,
            cw: None, as_y: None, as_z: None,
        },
    );
    let mut elements = HashMap::new();
    for i in 0..n_elem {
        elements.insert(
            (i + 1).to_string(),
            SolverElement3D {
                id: i + 1,
                elem_type: "frame".to_string(),
                node_i: i + 1,
                node_j: i + 2,
                material_id: 1,
                section_id: 1,
                release_my_start: false, release_my_end: false,
                release_mz_start: false, release_mz_end: false,
                release_t_start: false, release_t_end: false,
                local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
            },
        );
    }
    let mut supports = HashMap::new();
    supports.insert(
        "1".to_string(),
        SolverSupport3D {
            node_id: 1,
            rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
            kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
            rw: None, kw: None,
            normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
        },
    );
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n_elem + 1, fx: 2.0, fy: -10.0, fz: 5.0, mx: 0.5, my: 1.0, mz: -0.3, bw: None,
        }),
        SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: 7, q_yi: -4.0, q_yj: -4.0, q_zi: 1.0, q_zj: 1.0, a: None, b: None,
        }),
    ];
    SolverInput3D {
        nodes, materials, sections, elements, supports, loads,
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

/// Simply-supported 8×8 MITC4 plate with uniform pressure (~454 free DOFs).
fn make_ss_plate_3d() -> SolverInput3D {
    make_ss_plate_3d_n(8)
}

/// Simply-supported n×n MITC4 plate with uniform pressure.
fn make_ss_plate_3d_n(n: usize) -> SolverInput3D {
    let nx = n;
    let ny = n;
    let lx = 10.0;
    let ly = 10.0;

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

/// 2D truss bar on elastic foundation: 65 truss elements along X with an
/// elastic spring at every node (132 free DOFs ≥ sparse threshold).
/// K_ff is a strictly diagonally dominant tridiagonal M-matrix, so every
/// preconditioner builds and PCG converges quickly on each requested path.
fn make_truss_chain_2d() -> SolverInput {
    let n_elem = 65;
    let mut nodes = HashMap::new();
    for i in 0..=n_elem {
        nodes.insert(
            (i + 1).to_string(),
            SolverNode { id: i + 1, x: i as f64 * 0.5, z: 0.0 },
        );
    }
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });
    let mut elements = HashMap::new();
    for i in 0..n_elem {
        elements.insert(
            (i + 1).to_string(),
            SolverElement {
                id: i + 1,
                elem_type: "truss".to_string(),
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
    for i in 0..=n_elem {
        supports.insert(
            (i + 1).to_string(),
            SolverSupport {
                id: i + 1, node_id: i + 1, support_type: "spring".to_string(),
                kx: Some(4e6), ky: Some(4e6), kz: None,
                dx: None, dz: None, dry: None, angle: None,
            },
        );
    }
    let loads: Vec<SolverLoad> = (1..=n_elem + 1)
        .map(|nid| {
            SolverLoad::Nodal(SolverNodalLoad { node_id: nid, fx: 10.0, fz: 0.0, my: 0.0 })
        })
        .collect();
    SolverInput {
        nodes, materials, sections, elements, supports, loads,
        constraints: vec![],
        connectors: HashMap::new(),
        solver_options: None,
    }
}

// ==================== Helpers ====================

fn set_opts_2d(input: &mut SolverInput, opts: serde_json::Value) {
    input.solver_options = serde_json::from_value(opts).unwrap();
}

fn set_opts_3d(input: &mut SolverInput3D, opts: serde_json::Value) {
    input.solver_options = serde_json::from_value(opts).unwrap();
}

fn solver_path_2d(r: &AnalysisResults) -> &str {
    &r.solver_run_meta.as_ref().unwrap().solver_path
}

fn solver_path_3d(r: &AnalysisResults3D) -> &str {
    &r.solver_run_meta.as_ref().unwrap().solver_path
}

/// Relative L2 difference of nodal displacements (2D).
fn rel_diff_2d(a: &AnalysisResults, b: &AnalysisResults) -> f64 {
    assert_eq!(a.displacements.len(), b.displacements.len());
    let mut num = 0.0;
    let mut den = 0.0;
    for (da, db) in a.displacements.iter().zip(b.displacements.iter()) {
        assert_eq!(da.node_id, db.node_id);
        for (x, y) in [(da.ux, db.ux), (da.uz, db.uz), (da.ry, db.ry)] {
            num += (x - y).powi(2);
            den += y * y;
        }
    }
    num.sqrt() / den.sqrt().max(1e-30)
}

/// Relative L2 difference of nodal displacements (3D).
fn rel_diff_3d(a: &AnalysisResults3D, b: &AnalysisResults3D) -> f64 {
    assert_eq!(a.displacements.len(), b.displacements.len());
    let mut num = 0.0;
    let mut den = 0.0;
    for (da, db) in a.displacements.iter().zip(b.displacements.iter()) {
        assert_eq!(da.node_id, db.node_id);
        for (x, y) in [
            (da.ux, db.ux), (da.uy, db.uy), (da.uz, db.uz),
            (da.rx, db.rx), (da.ry, db.ry), (da.rz, db.rz),
        ] {
            num += (x - y).powi(2);
            den += y * y;
        }
    }
    num.sqrt() / den.sqrt().max(1e-30)
}

// ==================== Tests ====================

/// Measurement (Phase 3.3 decision input): which preconditioner does PCG
/// actually use on the 2D beam (whose pattern breaks strict IC(0)) and on a
/// large MITC4 shell, with explicit `ics`/`mic` and with the auto chain?
///   cargo test --release --test pcg_solver_tests diagnose_ics_dispatch -- --ignored --nocapture
#[test]
#[ignore]
fn diagnose_ics_dispatch() {
    for precond in ["ic0", "ics", "mic"] {
        let mut i = make_beam_2d();
        set_opts_2d(&mut i, serde_json::json!({"method": "pcg", "preconditioner": precond}));
        let r = linear::solve_2d(&i).unwrap();
        println!("beam_2d preconditioner={}: solver_path={}", precond, solver_path_2d(&r));
        for d in &r.solver_diagnostics {
            println!("    [{}][{}] {}", d.category, d.severity, d.message);
        }
    }
    // Auto chain on the same beam (forced pcg): ShiftedIc first.
    let mut i = make_beam_2d();
    set_opts_2d(&mut i, serde_json::json!({"method": "pcg"}));
    let r = linear::solve_2d(&i).unwrap();
    println!("beam_2d auto: solver_path={}", solver_path_2d(&r));

    // Large shell (30×30, nf=5644 ≥ ITERATIVE_THRESHOLD): auto dispatch.
    let mut i = make_ss_plate_3d_n(30);
    set_opts_3d(&mut i, serde_json::json!({}));
    let r = linear::solve_3d(&i).unwrap();
    println!("shell_30x30 auto: solver_path={}", solver_path_3d(&r));
    for d in &r.solver_diagnostics {
        println!("    [{}][{}] {}", d.category, d.severity, d.message);
    }
}


#[test]
fn pcg_parity_2d_frame() {
    let direct = linear::solve_2d(&{
        let mut i = make_beam_2d();
        set_opts_2d(&mut i, serde_json::json!({"method": "direct"}));
        i
    })
    .unwrap();
    assert_eq!(solver_path_2d(&direct), "sparse_cholesky");

    let pcg = linear::solve_2d(&{
        let mut i = make_beam_2d();
        set_opts_2d(&mut i, serde_json::json!({"method": "pcg"}));
        i
    })
    .unwrap();
    assert!(
        solver_path_2d(&pcg).starts_with("pcg_"),
        "expected pcg path, got {}",
        solver_path_2d(&pcg)
    );
    let diff = rel_diff_2d(&pcg, &direct);
    assert!(diff < 1e-6, "2D PCG vs direct rel diff: {}", diff);
}

#[test]
fn pcg_parity_3d_frame() {
    let direct = linear::solve_3d(&{
        let mut i = make_cantilever_3d();
        set_opts_3d(&mut i, serde_json::json!({"method": "direct"}));
        i
    })
    .unwrap();
    assert_eq!(solver_path_3d(&direct), "sparse_cholesky");

    let pcg = linear::solve_3d(&{
        let mut i = make_cantilever_3d();
        set_opts_3d(&mut i, serde_json::json!({"method": "pcg", "tolerance": 1e-10}));
        i
    })
    .unwrap();
    assert!(
        solver_path_3d(&pcg).starts_with("pcg_"),
        "expected pcg path, got {}",
        solver_path_3d(&pcg)
    );

    // PCG telemetry is exposed in timings
    let t = pcg.timings.as_ref().unwrap();
    assert!(t.pcg_iterations.is_some());
    assert!(t.pcg_final_residual.is_some());

    let diff = rel_diff_3d(&pcg, &direct);
    assert!(diff < 1e-6, "3D PCG vs direct rel diff: {}", diff);
}

#[test]
fn pcg_parity_mitc4_plate() {
    let direct = linear::solve_3d(&{
        let mut i = make_ss_plate_3d();
        set_opts_3d(&mut i, serde_json::json!({"method": "direct"}));
        i
    })
    .unwrap();
    assert_eq!(solver_path_3d(&direct), "sparse_cholesky");

    let pcg = linear::solve_3d(&{
        let mut i = make_ss_plate_3d();
        set_opts_3d(&mut i, serde_json::json!({"method": "pcg", "tolerance": 1e-10}));
        i
    })
    .unwrap();
    assert!(
        solver_path_3d(&pcg).starts_with("pcg_"),
        "expected pcg path, got {}",
        solver_path_3d(&pcg)
    );
    let diff = rel_diff_3d(&pcg, &direct);
    assert!(diff < 1e-6, "plate PCG vs direct rel diff: {}", diff);
}

#[test]
fn auto_mode_small_models_stay_direct() {
    // nf < ITERATIVE_THRESHOLD: auto must keep the direct path
    let r2d = linear::solve_2d(&{
        let mut i = make_beam_2d();
        set_opts_2d(&mut i, serde_json::json!({"method": "auto"}));
        i
    })
    .unwrap();
    assert_eq!(solver_path_2d(&r2d), "sparse_cholesky");

    let r3d = linear::solve_3d(&{
        let mut i = make_cantilever_3d();
        set_opts_3d(&mut i, serde_json::json!({"method": "auto"}));
        i
    })
    .unwrap();
    assert_eq!(solver_path_3d(&r3d), "sparse_cholesky");

    // No options at all → legacy behavior, no solver diagnostics emitted
    let legacy = linear::solve_2d(&make_beam_2d()).unwrap();
    assert_eq!(solver_path_2d(&legacy), "sparse_cholesky");
    assert!(legacy.solver_diagnostics.is_empty());
}

#[test]
fn pcg_max_iter_forces_fallback_with_warning() {
    let direct = linear::solve_2d(&make_beam_2d()).unwrap();

    let fb = linear::solve_2d(&{
        let mut i = make_beam_2d();
        set_opts_2d(&mut i, serde_json::json!({"method": "pcg", "maxIterations": 1}));
        i
    })
    .unwrap();

    // The direct fallback chain solved the model: identical displacements
    assert_eq!(solver_path_2d(&fb), "pcg_fallback_sparse_cholesky");
    for (a, b) in direct.displacements.iter().zip(fb.displacements.iter()) {
        assert_eq!(a.ux, b.ux);
        assert_eq!(a.uz, b.uz);
        assert_eq!(a.ry, b.ry);
    }

    // Fallback warning present in both diagnostic channels
    assert!(
        fb.solver_diagnostics
            .iter()
            .any(|d| d.severity == "warning" && d.message.contains("PCG")),
        "expected legacy PCG fallback warning, got {:?}",
        fb.solver_diagnostics
    );
    assert!(
        fb.structured_diagnostics
            .iter()
            .any(|d| d.code == DiagnosticCode::PcgFallbackDirect && d.severity == Severity::Warning),
        "expected structured PcgFallbackDirect warning"
    );

    // Same in 3D
    let direct3d = linear::solve_3d(&make_cantilever_3d()).unwrap();
    let fb3d = linear::solve_3d(&{
        let mut i = make_cantilever_3d();
        set_opts_3d(&mut i, serde_json::json!({"method": "pcg", "maxIterations": 1}));
        i
    })
    .unwrap();
    assert_eq!(solver_path_3d(&fb3d), "pcg_fallback_sparse_cholesky");
    for (a, b) in direct3d.displacements.iter().zip(fb3d.displacements.iter()) {
        assert_eq!(a.ux, b.ux);
        assert_eq!(a.uy, b.uy);
        assert_eq!(a.uz, b.uz);
        assert_eq!(a.rx, b.rx);
        assert_eq!(a.ry, b.ry);
        assert_eq!(a.rz, b.rz);
    }
    assert!(
        fb3d
            .structured_diagnostics
            .iter()
            .any(|d| d.code == DiagnosticCode::PcgFallbackDirect && d.severity == Severity::Warning),
        "expected structured PcgFallbackDirect warning (3D)"
    );
}

#[test]
fn pcg_deterministic_bitwise() {
    let run = || {
        linear::solve_3d(&{
            let mut i = make_cantilever_3d();
            set_opts_3d(&mut i, serde_json::json!({"method": "pcg"}));
            i
        })
        .unwrap()
    };
    let r1 = run();
    let r2 = run();
    assert!(solver_path_3d(&r1).starts_with("pcg_"));
    for (a, b) in r1.displacements.iter().zip(r2.displacements.iter()) {
        assert_eq!(a.ux.to_bits(), b.ux.to_bits());
        assert_eq!(a.uy.to_bits(), b.uy.to_bits());
        assert_eq!(a.uz.to_bits(), b.uz.to_bits());
        assert_eq!(a.rx.to_bits(), b.rx.to_bits());
        assert_eq!(a.ry.to_bits(), b.ry.to_bits());
        assert_eq!(a.rz.to_bits(), b.rz.to_bits());
    }
}

#[test]
fn pcg_parity_prescribed_displacement_2d() {
    let direct = linear::solve_2d(&{
        let mut i = make_beam_2d_settlement();
        set_opts_2d(&mut i, serde_json::json!({"method": "direct"}));
        i
    })
    .unwrap();
    let pcg = linear::solve_2d(&{
        let mut i = make_beam_2d_settlement();
        set_opts_2d(&mut i, serde_json::json!({"method": "pcg"}));
        i
    })
    .unwrap();
    assert!(solver_path_2d(&pcg).starts_with("pcg_"));
    let diff = rel_diff_2d(&pcg, &direct);
    assert!(diff < 1e-6, "prescribed PCG vs direct rel diff: {}", diff);

    // The prescribed settlement is honored in both runs
    let roller_node = 31;
    let uz_pcg = pcg
        .displacements
        .iter()
        .find(|d| d.node_id == roller_node)
        .unwrap()
        .uz;
    assert!((uz_pcg - 0.01).abs() < 1e-12, "prescribed uz: {}", uz_pcg);
}

#[test]
fn invalid_method_string_warns_and_falls_back_to_auto() {
    // Small model (nf < sparse threshold): auto resolves to dense
    let mut nodes = HashMap::new();
    for i in 0..=4 {
        nodes.insert(
            (i + 1).to_string(),
            SolverNode { id: i + 1, x: i as f64, z: 0.0 },
        );
    }
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });
    let mut elements = HashMap::new();
    for i in 0..4 {
        elements.insert(
            (i + 1).to_string(),
            SolverElement {
                id: i + 1, elem_type: "frame".to_string(),
                node_i: i + 1, node_j: i + 2, material_id: 1, section_id: 1,
                hinge_start: false, hinge_end: false,
            },
        );
    }
    let mut supports = HashMap::new();
    supports.insert(
        "1".to_string(),
        SolverSupport {
            id: 1, node_id: 1, support_type: "fixed".to_string(),
            kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
        },
    );
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: 0.0, fz: -10.0, my: 0.0,
    })];
    let mut input = SolverInput {
        nodes, materials, sections, elements, supports, loads,
        constraints: vec![],
        connectors: HashMap::new(),
        solver_options: None,
    };
    set_opts_2d(&mut input, serde_json::json!({"method": "conjgate"}));

    let r = linear::solve_2d(&input).unwrap();
    assert_eq!(solver_path_2d(&r), "dense_lu");
    // Validation runs at prepare time, so the warning reaches the structured
    // channel even on the dense path (which never consults solver options).
    assert!(
        r.structured_diagnostics
            .iter()
            .any(|d| d.code == DiagnosticCode::UnknownSolverOption
                && d.severity == Severity::Warning
                && d.message.contains("conjgate")),
        "expected unknown-method warning, got {:?}",
        r.structured_diagnostics
    );
}

#[test]
fn pcg_all_preconditioners_parity() {
    // Truss chain: K_ff is a tridiagonal M-matrix, so every preconditioner —
    // including IC(0) — builds and PCG converges on the requested path.
    let direct = linear::solve_2d(&{
        let mut i = make_truss_chain_2d();
        set_opts_2d(&mut i, serde_json::json!({"method": "direct"}));
        i
    })
    .unwrap();
    assert_eq!(solver_path_2d(&direct), "sparse_cholesky");

    for (precond, expected_path) in [
        ("ic0", "pcg_ic0"),
        ("ics", "pcg_ics"),
        ("mic", "pcg_mic"),
        ("ssor", "pcg_ssor"),
        ("jacobi", "pcg_jacobi"),
        ("none", "pcg_none"),
    ] {
        let r = linear::solve_2d(&{
            let mut i = make_truss_chain_2d();
            set_opts_2d(
                &mut i,
                serde_json::json!({"method": "pcg", "preconditioner": precond, "tolerance": 1e-10}),
            );
            i
        })
        .unwrap();
        assert_eq!(
            solver_path_2d(&r),
            expected_path,
            "preconditioner {}",
            precond
        );
        let diff = rel_diff_2d(&r, &direct);
        assert!(
            diff < 1e-6,
            "preconditioner {} vs direct rel diff: {}",
            precond,
            diff
        );
    }

    // Frame models must also converge under every explicit preconditioner
    // (degrading IC(0) → SSOR when it breaks down), with parity vs direct.
    let direct_beam = linear::solve_2d(&{
        let mut i = make_beam_2d();
        set_opts_2d(&mut i, serde_json::json!({"method": "direct"}));
        i
    })
    .unwrap();
    for precond in ["ic0", "ssor", "jacobi", "none"] {
        let r = linear::solve_2d(&{
            let mut i = make_beam_2d();
            set_opts_2d(
                &mut i,
                serde_json::json!({"method": "pcg", "preconditioner": precond, "tolerance": 1e-10}),
            );
            i
        })
        .unwrap();
        assert!(
            solver_path_2d(&r).starts_with("pcg_"),
            "preconditioner {} did not produce a pcg path: {}",
            precond,
            solver_path_2d(&r)
        );
        let diff = rel_diff_2d(&r, &direct_beam);
        assert!(
            diff < 1e-6,
            "beam preconditioner {} vs direct rel diff: {}",
            precond,
            diff
        );
    }
}

#[test]
fn pcg_explicit_ic0_degrades_with_warning_when_not_spd_on_pattern() {
    // The 2D beam's ragged DOF blocks make exact Cholesky fill outside the
    // pattern of K_ff, so IC(0) hits a non-positive pivot and must degrade
    // to Jacobi (first net after IC-family failures) with a warning — the
    // solve still succeeds and matches direct.
    let direct = linear::solve_2d(&{
        let mut i = make_beam_2d();
        set_opts_2d(&mut i, serde_json::json!({"method": "direct"}));
        i
    })
    .unwrap();

    let r = linear::solve_2d(&{
        let mut i = make_beam_2d();
        set_opts_2d(&mut i, serde_json::json!({"method": "pcg", "preconditioner": "ic0"}));
        i
    })
    .unwrap();
    assert_eq!(solver_path_2d(&r), "pcg_jacobi");
    assert!(
        r.solver_diagnostics
            .iter()
            .any(|d| d.severity == "warning" && d.message.contains("ic0")),
        "expected ic0 degradation warning, got {:?}",
        r.solver_diagnostics
    );
    let diff = rel_diff_2d(&r, &direct);
    assert!(diff < 1e-6, "degraded PCG vs direct rel diff: {}", diff);
}

#[test]
fn pcg_explicit_ics_survives_non_spd_pattern() {
    // Same 2D beam: shifted-IC never fails to build (degraded pivots are
    // restored); PCG must either converge with parity vs direct or fall back
    // to the direct chain with a verified result — never return unverified.
    let direct = linear::solve_2d(&{
        let mut i = make_beam_2d();
        set_opts_2d(&mut i, serde_json::json!({"method": "direct"}));
        i
    })
    .unwrap();

    let r = linear::solve_2d(&{
        let mut i = make_beam_2d();
        set_opts_2d(&mut i, serde_json::json!({"method": "pcg", "preconditioner": "ics"}));
        i
    })
    .unwrap();
    let path = solver_path_2d(&r).to_string();
    assert!(
        path.starts_with("pcg_") || path == "pcg_fallback_sparse_cholesky",
        "unexpected solver path: {}",
        path
    );
    let diff = rel_diff_2d(&r, &direct);
    assert!(diff < 1e-6, "ics PCG vs direct rel diff: {}", diff);
}

#[test]
fn pcg_explicit_mic_on_spd_pattern() {
    // Truss chain: strict IC(0) builds, so MIC(0) must also build and
    // converge with parity vs direct.
    let direct = linear::solve_2d(&{
        let mut i = make_truss_chain_2d();
        set_opts_2d(&mut i, serde_json::json!({"method": "direct"}));
        i
    })
    .unwrap();

    let r = linear::solve_2d(&{
        let mut i = make_truss_chain_2d();
        set_opts_2d(&mut i, serde_json::json!({"method": "pcg", "preconditioner": "mic", "tolerance": 1e-10}));
        i
    })
    .unwrap();
    assert_eq!(solver_path_2d(&r), "pcg_mic");
    let diff = rel_diff_2d(&r, &direct);
    assert!(diff < 1e-6, "mic PCG vs direct rel diff: {}", diff);
}

#[test]
fn solver_options_backward_compatibility() {
    // JSON without solverOptions deserializes and solves as before
    let json = serde_json::json!({
        "nodes": {
            "1": {"id": 1, "x": 0.0, "z": 0.0},
            "2": {"id": 2, "x": 5.0, "z": 0.0}
        },
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 0.0001}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}
        },
        "supports": {
            "1": {"id": 1, "nodeId": 1, "type": "fixed"}
        },
        "loads": [
            {"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fz": -10.0, "my": 0.0}}
        ]
    });
    let input: SolverInput = serde_json::from_value(json.clone()).unwrap();
    assert!(input.solver_options.is_none());
    let r = linear::solve_2d(&input).unwrap();
    assert_eq!(solver_path_2d(&r), "dense_lu");

    // Top-level "solverOptions" key maps to the field
    let mut with_opts = json;
    with_opts["solverOptions"] = serde_json::json!({"method": "direct"});
    let input2: SolverInput = serde_json::from_value(with_opts).unwrap();
    assert_eq!(
        input2.solver_options.as_ref().unwrap().method.as_deref(),
        Some("direct")
    );

    // camelCase wire names map to the struct fields
    let opts: SolverOptions = serde_json::from_value(
        serde_json::json!({"method": "pcg", "preconditioner": "ssor", "tolerance": 1e-9, "maxIterations": 42}),
    )
    .unwrap();
    assert_eq!(opts.method.as_deref(), Some("pcg"));
    assert_eq!(opts.preconditioner.as_deref(), Some("ssor"));
    assert_eq!(opts.tolerance, Some(1e-9));
    assert_eq!(opts.max_iterations, Some(42));

    // SolverInput3D without solverOptions also deserializes
    let json3d = serde_json::json!({
        "nodes": {
            "1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0},
            "2": {"id": 2, "x": 5.0, "y": 0.0, "z": 0.0}
        },
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 0.0001, "iz": 0.0001, "j": 0.0002}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}
        },
        "supports": {
            "1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}
        },
        "loads": [
            {"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fy": -10.0, "fz": 0.0, "mx": 0.0, "my": 0.0, "mz": 0.0}}
        ]
    });
    let input3d: SolverInput3D = serde_json::from_value(json3d).unwrap();
    assert!(input3d.solver_options.is_none());
    let r3d = linear::solve_3d(&input3d).unwrap();
    assert_eq!(solver_path_3d(&r3d), "dense_lu");
}
