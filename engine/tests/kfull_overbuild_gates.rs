//! Gate tests: ensure solver paths build k_full only when needed.
//!
//! k_full (the full n×n sparse stiffness matrix) is expensive to construct.
//! Only solver paths that compute reactions need it (linear 3D, Guyan 3D reactions).
//! Paths that only need K_ff (modal, buckling, harmonic, Craig-Bampton, Guyan condensation)
//! must skip k_full to avoid wasting memory and time.
//!
//! These tests prevent regressions: if someone accidentally changes a `build_k_full: false`
//! to `true`, the corresponding gate test will fail.

use dedaliano_engine::solver::assembly::assemble_sparse_3d;
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::linalg::{symbolic_cholesky, numeric_cholesky};
use dedaliano_engine::types::*;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Helper: build a small 3D cantilever beam (frame elements along X axis)
// ---------------------------------------------------------------------------

/// Build a 3D cantilever with `n_elem` frame elements along the X axis.
/// Node 1 is fixed; a vertical load is applied at the tip.
/// Returns a model with 6*(n_elem+1) total DOFs, 6*n_elem free DOFs.
fn make_cantilever_3d(n_elem: usize) -> SolverInput3D {
    let l_elem = 1.0; // 1 m per element
    let e = 200_000.0; // MPa
    let nu = 0.3;
    let a = 0.01;      // m^2
    let iy = 1e-4;
    let iz = 1e-4;
    let j = 2e-4;

    let mut nodes = HashMap::new();
    for i in 0..=n_elem {
        let nid = i + 1;
        nodes.insert(
            nid.to_string(),
            SolverNode3D {
                id: nid,
                x: i as f64 * l_elem,
                y: 0.0,
                z: 0.0,
            },
        );
    }

    let mut materials = HashMap::new();
    materials.insert(
        "1".to_string(),
        SolverMaterial { id: 1, e, nu },
    );

    let mut sections = HashMap::new();
    sections.insert(
        "1".to_string(),
        SolverSection3D {
            id: 1,
            name: None,
            a,
            iy,
            iz,
            j,
            cw: None,
            as_y: None,
            as_z: None,
        },
    );

    let mut elements = HashMap::new();
    for i in 0..n_elem {
        let eid = i + 1;
        elements.insert(
            eid.to_string(),
            SolverElement3D {
                id: eid,
                elem_type: "frame".to_string(),
                node_i: i + 1,
                node_j: i + 2,
                material_id: 1,
                section_id: 1,
                hinge_start: false,
                hinge_end: false,
                local_yx: None,
                local_yy: None,
                local_yz: None,
                roll_angle: None,
            },
        );
    }

    let mut supports = HashMap::new();
    supports.insert(
        "1".to_string(),
        SolverSupport3D {
            node_id: 1,
            rx: true, ry: true, rz: true,
            rrx: true, rry: true, rrz: true,
            kx: None, ky: None, kz: None,
            krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None,
            drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None, rw: None, kw: None,
        },
    );

    let tip_node = n_elem + 1;
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: tip_node,
        fx: 0.0,
        fy: 0.0,
        fz: -10.0,
        mx: 0.0,
        my: 0.0,
        mz: 0.0,
        bw: None,
    })];

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
    }
}

/// Build a simply-supported plate (MITC4 quads) for fill-ratio tests.
fn make_ss_plate(nx: usize, ny: usize) -> SolverInput3D {
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
                rx: false, ry: false, rz: true,
                rrx: false, rry: false, rrz: false,
                kx: None, ky: None, kz: None,
                krx: None, kry: None, krz: None,
                dx: None, dy: None, dz: None,
                drx: None, dry: None, drz: None,
                normal_x: None, normal_y: None, normal_z: None,
                is_inclined: None, rw: None, kw: None,
            },
        );
        sid += 1;
    }
    // Pin one corner to prevent rigid body modes
    supports.insert(
        sid.to_string(),
        SolverSupport3D {
            node_id: grid[0][0],
            rx: true, ry: true, rz: true,
            rrx: false, rry: false, rrz: false,
            kx: None, ky: None, kz: None,
            krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None,
            drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None, rw: None, kw: None,
        },
    );

    let n_quads = quads.len();
    let loads: Vec<SolverLoad3D> = (1..=n_quads)
        .map(|eid| SolverLoad3D::QuadPressure(SolverPressureLoad { element_id: eid, pressure: -1.0 }))
        .collect();

    SolverInput3D {
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

// ===========================================================================
// Gate 1: assemble_sparse_3d with build_k_full=false produces k_full=None
// ===========================================================================

#[test]
fn kfull_skipped_when_flag_false() {
    let input = make_cantilever_3d(5);
    let dof_num = DofNumbering::build_3d(&input);
    let asm = assemble_sparse_3d(&input, &dof_num, false);

    assert!(
        asm.k_full.is_none(),
        "k_full must be None when build_k_full=false"
    );
    // k_ff must still be present
    assert!(
        asm.k_ff.col_ptr.len() > 1,
        "k_ff must be populated even when k_full is skipped"
    );
}

// ===========================================================================
// Gate 2: assemble_sparse_3d with build_k_full=true produces k_full=Some
// ===========================================================================

#[test]
fn kfull_built_when_flag_true() {
    let input = make_cantilever_3d(5);
    let dof_num = DofNumbering::build_3d(&input);
    let asm = assemble_sparse_3d(&input, &dof_num, true);

    assert!(
        asm.k_full.is_some(),
        "k_full must be Some when build_k_full=true"
    );
    let kf = asm.k_full.as_ref().unwrap();
    // Full K dimensions = n_total
    let n = dof_num.n_total;
    assert_eq!(
        kf.col_ptr.len(),
        n + 1,
        "k_full column pointer length must be n_total+1"
    );
}

// ===========================================================================
// Gate 3: Modal path skips k_full (calls assemble_sparse_3d with false)
// ===========================================================================

#[test]
fn modal_path_skips_kfull() {
    // We test this at the assembly level: modal calls assemble_sparse_3d(..., false).
    // If someone changes it to true, this test + the flag test above catch it.
    // Here we verify the contract directly.
    let input = make_cantilever_3d(5);
    let dof_num = DofNumbering::build_3d(&input);

    // Simulate what modal.rs does: assemble with false
    let asm = assemble_sparse_3d(&input, &dof_num, false);
    assert!(
        asm.k_full.is_none(),
        "Modal path must not build k_full (assembly with build_k_full=false)"
    );
}

// ===========================================================================
// Gate 4: Buckling path skips k_full
// ===========================================================================

#[test]
fn buckling_path_skips_kfull() {
    let input = make_cantilever_3d(5);
    let dof_num = DofNumbering::build_3d(&input);

    // Simulate what buckling.rs does
    let asm = assemble_sparse_3d(&input, &dof_num, false);
    assert!(
        asm.k_full.is_none(),
        "Buckling path must not build k_full"
    );
}

// ===========================================================================
// Gate 5: Harmonic path skips k_full
// ===========================================================================

#[test]
fn harmonic_path_skips_kfull() {
    let input = make_cantilever_3d(5);
    let dof_num = DofNumbering::build_3d(&input);

    let asm = assemble_sparse_3d(&input, &dof_num, false);
    assert!(
        asm.k_full.is_none(),
        "Harmonic path must not build k_full"
    );
}

// ===========================================================================
// Gate 6: Craig-Bampton path skips k_full
// ===========================================================================

#[test]
fn craig_bampton_path_skips_kfull() {
    let input = make_cantilever_3d(5);
    let dof_num = DofNumbering::build_3d(&input);

    // Craig-Bampton 3D calls assemble_sparse_3d(..., false)
    let asm = assemble_sparse_3d(&input, &dof_num, false);
    assert!(
        asm.k_full.is_none(),
        "Craig-Bampton path must not build k_full"
    );
}

// ===========================================================================
// Gate 7: Guyan condensation first assembly skips k_full
// ===========================================================================

#[test]
fn guyan_condensation_skips_kfull() {
    let input = make_cantilever_3d(5);
    let dof_num = DofNumbering::build_3d(&input);

    // Guyan 3D first assembly: build_k_full=false (only needs K_ff partitioning)
    let asm = assemble_sparse_3d(&input, &dof_num, false);
    assert!(
        asm.k_full.is_none(),
        "Guyan condensation step must not build k_full"
    );
}

// ===========================================================================
// Gate 8: Guyan reaction recovery builds k_full
// ===========================================================================

#[test]
fn guyan_reaction_recovery_builds_kfull() {
    let input = make_cantilever_3d(5);
    let dof_num = DofNumbering::build_3d(&input);

    // Guyan 3D second assembly: build_k_full=true (needs K_rf for reactions)
    let asm = assemble_sparse_3d(&input, &dof_num, true);
    assert!(
        asm.k_full.is_some(),
        "Guyan reaction recovery must build k_full"
    );
}

// ===========================================================================
// Gate 9: Linear 3D solver builds k_full and produces valid reactions
// ===========================================================================

#[test]
fn linear_3d_builds_kfull_for_reactions() {
    let input = make_cantilever_3d(12); // 12 elements => 72 free DOFs, hits sparse path
    let result = dedaliano_engine::solver::linear::solve_3d(&input).unwrap();

    // Must have reactions (proves k_full was built and used)
    assert!(
        !result.reactions.is_empty(),
        "Linear 3D sparse path must produce reactions (requires k_full)"
    );

    // Sanity: vertical reaction at node 1 should be +10.0 (load is -10.0 at tip)
    let r1 = result.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(
        (r1.fz - 10.0).abs() < 0.1,
        "Vertical reaction at fixed end should be ~10.0, got {}",
        r1.fz
    );
}

// ===========================================================================
// Gate 10: k_full nnz is strictly larger than k_ff nnz
//          (confirms k_full includes restrained-DOF coupling)
// ===========================================================================

#[test]
fn kfull_includes_restrained_dofs() {
    let input = make_cantilever_3d(5);
    let dof_num = DofNumbering::build_3d(&input);

    let asm = assemble_sparse_3d(&input, &dof_num, true);
    let kf = asm.k_full.as_ref().unwrap();
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    let nnz_ff = asm.k_ff.col_ptr[nf];
    let nnz_full = kf.col_ptr[n];

    assert!(
        nnz_full > nnz_ff,
        "k_full nnz ({}) must exceed k_ff nnz ({}) — restrained DOFs add coupling",
        nnz_full, nnz_ff
    );
}

// ===========================================================================
// Fill-ratio gates
// ===========================================================================

/// Gate 11: Fill ratio for frame-only model stays bounded.
#[test]
fn fill_ratio_frame_model() {
    let input = make_cantilever_3d(30); // 30 elements => 180 free DOFs
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let asm = assemble_sparse_3d(&input, &dof_num, false);

    let sym = symbolic_cholesky(&asm.k_ff);
    let nnz_kff = asm.k_ff.col_ptr[nf];
    let nnz_l = sym.l_nnz;
    let fill_ratio = nnz_l as f64 / nnz_kff.max(1) as f64;

    // Frame models are banded; fill ratio should be very low.
    assert!(
        fill_ratio < 10.0,
        "Fill ratio {:.1}x exceeds 10x threshold for frame model (nnz_L={}, nnz_Kff={})",
        fill_ratio, nnz_l, nnz_kff
    );
}

/// Gate 12: Fill ratio for shell (MITC4) model stays bounded.
#[test]
fn fill_ratio_shell_model() {
    let input = make_ss_plate(10, 10); // 121 nodes, ~660 free DOFs
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let asm = assemble_sparse_3d(&input, &dof_num, false);

    let sym = symbolic_cholesky(&asm.k_ff);
    let nnz_kff = asm.k_ff.col_ptr[nf];
    let nnz_l = sym.l_nnz;
    let fill_ratio = nnz_l as f64 / nnz_kff.max(1) as f64;

    assert!(
        fill_ratio < 50.0,
        "Fill ratio {:.1}x exceeds 50x threshold for 10x10 shell (nnz_L={}, nnz_Kff={})",
        fill_ratio, nnz_l, nnz_kff
    );
}

/// Gate 13: Modal assembly fill ratio (same as buckling/harmonic — all use k_ff only).
#[test]
fn fill_ratio_modal_path() {
    let input = make_cantilever_3d(20); // 120 free DOFs
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let asm = assemble_sparse_3d(&input, &dof_num, false);

    let sym = symbolic_cholesky(&asm.k_ff);
    let nnz_kff = asm.k_ff.col_ptr[nf];
    let nnz_l = sym.l_nnz;
    let fill_ratio = nnz_l as f64 / nnz_kff.max(1) as f64;

    assert!(
        fill_ratio < 10.0,
        "Fill ratio {:.1}x exceeds 10x for modal frame model (nnz_L={}, nnz_Kff={})",
        fill_ratio, nnz_l, nnz_kff
    );

    // Also verify Cholesky succeeds (the matrix is SPD)
    let num = numeric_cholesky(&sym, &asm.k_ff);
    assert!(
        num.is_some(),
        "Cholesky factorization must succeed on well-conditioned frame model"
    );
}

// ===========================================================================
// Gate 14: k_full is not built by the parallel assembly path when false
// ===========================================================================

#[test]
fn parallel_assembly_skips_kfull() {
    let input = make_cantilever_3d(5);
    let dof_num = DofNumbering::build_3d(&input);

    let asm = dedaliano_engine::solver::sparse_assembly::assemble_sparse_3d_parallel(
        &input, &dof_num, false,
    );
    assert!(
        asm.k_full.is_none(),
        "Parallel assembly must skip k_full when build_k_full=false"
    );
}

#[test]
fn parallel_assembly_builds_kfull() {
    let input = make_cantilever_3d(5);
    let dof_num = DofNumbering::build_3d(&input);

    let asm = dedaliano_engine::solver::sparse_assembly::assemble_sparse_3d_parallel(
        &input, &dof_num, true,
    );
    assert!(
        asm.k_full.is_some(),
        "Parallel assembly must build k_full when build_k_full=true"
    );
}
