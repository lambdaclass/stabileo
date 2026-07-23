//! Parity tests: sparse mass matrix (CSC) vs dense mass matrix on the
//! eigen/dynamic paths. The sparse paths (modal 3D, buckling 2D/3D, harmonic
//! 3D) now assemble M directly as CSC and use `CscMatrix::sym_mat_vec` for
//! M·x inside the shift-invert Lanczos operator. These tests pin:
//!   1. Sparse mass assembly == dense mass assembly (free block).
//!   2. Eigenvalues/load factors from the new sparse-mass Lanczos == the
//!      pre-refactor dense-mass sparse-Lanczos (golden values captured from
//!      the same models on origin/main). The K factorization is identical on
//!      both sides — only the M·x representation changed — so agreement is
//!      expected to ~1e-12 and gated at 1e-10.
//!   3. Cross-method sanity: sparse-mass Lanczos vs fully-dense generalized
//!      Lanczos on a well-conditioned frame model (1e-8).

use std::collections::HashMap;
use dedaliano_engine::types::*;
use dedaliano_engine::linalg::{
    lanczos_generalized_eigen, lanczos_generalized_eigen_sparse,
    extract_submatrix, CscMatrix,
};
use dedaliano_engine::solver::assembly::assemble_sparse_3d;
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::mass_matrix::{
    assemble_mass_matrix_2d, assemble_mass_matrix_2d_sparse,
    assemble_mass_matrix_3d, assemble_mass_matrix_3d_sparse,
};
use dedaliano_engine::solver::{buckling, modal};
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 1e-4;
const J: f64 = 1.5e-4;
const DENSITY: f64 = 7_850.0;

fn make_densities() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), DENSITY);
    d
}

// ─── Helpers ────────────────────────────────────────────────

/// Assert CSC (lower triangle) matches a dense row-major matrix entrywise.
/// Values come from identical element routines; only summation order differs.
fn assert_csc_matches_dense(csc: &CscMatrix, dense: &[f64], n: usize, label: &str) {
    assert_eq!(csc.n, n, "{}: dimension mismatch", label);
    let max_abs = dense.iter().fold(0.0f64, |a, &v| a.max(v.abs()));
    assert!(max_abs > 0.0, "{}: dense matrix is all zeros", label);
    let tol = max_abs * 1e-12;
    let csc_dense = csc.to_dense_symmetric();
    let mut max_diff = 0.0f64;
    for i in 0..n * n {
        max_diff = max_diff.max((csc_dense[i] - dense[i]).abs());
    }
    assert!(
        max_diff <= tol,
        "{}: max entry diff {:.3e} exceeds tol {:.3e} (matrix scale {:.3e})",
        label, max_diff, tol, max_abs
    );
}

/// Compare actual values against golden reference values (same length after
/// filtering values ≤ `min_val` as near-zero noise modes), relative tolerance.
fn assert_matches_golden(actual: &[f64], golden: &[f64], min_val: f64, rel_tol: f64, label: &str) {
    let a: Vec<f64> = actual.iter().copied().filter(|&v| v > min_val).collect();
    assert_eq!(
        a.len(), golden.len(),
        "{}: expected {} modes above {}, got {}",
        label, golden.len(), min_val, a.len()
    );
    let mut worst = 0.0f64;
    for i in 0..golden.len() {
        let rel = (a[i] - golden[i]).abs() / golden[i].abs().max(1e-30);
        worst = worst.max(rel);
        assert!(
            rel < rel_tol,
            "{}: mode {} mismatch: new={:.12e}, golden={:.12e}, rel={:.2e}",
            label, i, a[i], golden[i], rel
        );
    }
    println!("{}: {} modes match golden, worst rel err = {:.2e}", label, golden.len(), worst);
}

/// 8×8 simply-supported MITC4 plate (same builder as sparse_shell_gates).
fn make_ss_plate(nx: usize, ny: usize) -> SolverInput3D {
    let lx = 10.0;
    let ly = 10.0;
    let t = 0.1;

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
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });

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

    SolverInput3D {
        nodes,
        materials: mats,
        sections: HashMap::new(),
        elements: HashMap::new(),
        supports,
        loads: vec![],
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

/// Braced 3D plane frame (columns along Z, beams along X) with the first
/// beam's in-plane moment ends released — that element gets lumped
/// (diagonal) mass while all others keep consistent mass.
fn make_frame_with_released_beam(n_stories: usize, n_bays: usize) -> SolverInput3D {
    let h = 3.0;
    let w = 6.0;

    let mut nodes = HashMap::new();
    let mut node_id = 1;
    for level in 0..=n_stories {
        for col in 0..=n_bays {
            nodes.insert(
                node_id.to_string(),
                SolverNode3D { id: node_id, x: col as f64 * w, y: 0.0, z: level as f64 * h },
            );
            node_id += 1;
        }
    }
    let cols = n_bays + 1;

    let mut elems = HashMap::new();
    let mut eid = 1;
    for level in 0..n_stories {
        for col in 0..=n_bays {
            let ni = level * cols + col + 1;
            let nj = (level + 1) * cols + col + 1;
            elems.insert(eid.to_string(), SolverElement3D {
                id: eid, elem_type: "frame".to_string(), node_i: ni, node_j: nj,
                material_id: 1, section_id: 1,
                release_my_start: false, release_my_end: false,
                release_mz_start: false, release_mz_end: false,
                release_t_start: false, release_t_end: false,
                local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
            });
            eid += 1;
        }
    }
    for level in 1..=n_stories {
        for bay in 0..n_bays {
            let ni = level * cols + bay + 1;
            let nj = level * cols + bay + 2;
            // First beam (level 1, bay 0): release mz at both ends → lumped mass.
            let released = level == 1 && bay == 0;
            elems.insert(eid.to_string(), SolverElement3D {
                id: eid, elem_type: "frame".to_string(), node_i: ni, node_j: nj,
                material_id: 1, section_id: 1,
                release_my_start: false, release_my_end: false,
                release_mz_start: released, release_mz_end: released,
                release_t_start: false, release_t_end: false,
                local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
            });
            eid += 1;
        }
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs = HashMap::new();
    secs.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: A, iy: IY, iz: IZ, j: J, cw: None, as_y: None, as_z: None,
    });

    let mut sups = HashMap::new();
    for col in 0..=n_bays {
        let nid = col + 1;
        sups.insert(nid.to_string(), SolverSupport3D {
            node_id: nid,
            rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
            kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None, rw: None, kw: None,
        });
    }

    SolverInput3D {
        nodes, materials: mats, sections: secs, elements: elems,
        supports: sups, loads: vec![], constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![], connectors: HashMap::new(),
    }
}

// ─── 1. Mass assembly parity ────────────────────────────────

#[test]
fn mass_assembly_2d_sparse_matches_dense() {
    // Frame element with a hinge (lumped mass) + truss element.
    let nodes = vec![(1, 0.0, 0.0), (2, 5.0, 0.0), (3, 10.0, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, true, false),
        (2, "truss", 2, 3, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed")];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, vec![]);
    let densities = make_densities();

    let dof_num = DofNumbering::build_2d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    let m_dense_full = assemble_mass_matrix_2d(&input, &dof_num, &densities);
    let free_idx: Vec<usize> = (0..nf).collect();
    let m_dense_ff = extract_submatrix(&m_dense_full, n, &free_idx, &free_idx);

    let m_sparse_ff = assemble_mass_matrix_2d_sparse(&input, &dof_num, &densities);
    assert_csc_matches_dense(&m_sparse_ff, &m_dense_ff, nf, "2D mass assembly");
}

#[test]
fn mass_assembly_3d_sparse_matches_dense_frame() {
    // Braced frame with a moment-released beam (consistent + lumped mass).
    let input = make_frame_with_released_beam(3, 2);
    let densities = make_densities();

    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    let m_dense_full = assemble_mass_matrix_3d(&input, &dof_num, &densities);
    let free_idx: Vec<usize> = (0..nf).collect();
    let m_dense_ff = extract_submatrix(&m_dense_full, n, &free_idx, &free_idx);

    let m_sparse_ff = assemble_mass_matrix_3d_sparse(&input, &dof_num, &densities);
    assert_csc_matches_dense(&m_sparse_ff, &m_dense_ff, nf, "3D frame mass assembly");
}

#[test]
fn mass_assembly_3d_sparse_matches_dense_shell() {
    let input = make_ss_plate(4, 4);
    let densities = make_densities();

    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    let m_dense_full = assemble_mass_matrix_3d(&input, &dof_num, &densities);
    let free_idx: Vec<usize> = (0..nf).collect();
    let m_dense_ff = extract_submatrix(&m_dense_full, n, &free_idx, &free_idx);

    let m_sparse_ff = assemble_mass_matrix_3d_sparse(&input, &dof_num, &densities);
    assert_csc_matches_dense(&m_sparse_ff, &m_dense_ff, nf, "3D shell mass assembly");
}

// ─── 2. Modal eigenvalue parity (golden: pre-refactor sparse Lanczos) ───

/// ω² eigenvalues from the pre-refactor (dense-mass) sparse Lanczos on the
/// 10×4 frame with one released beam (nf=300, k=6).
const GOLDEN_MODAL_FRAME_LAMBDA: [f64; 6] = [
    1.325751722604326e0,
    1.121821791770904e1,
    4.877528458424633e1,
    1.002777317104620e2,
    1.409613359649071e2,
    2.240048464337852e2,
];

/// ω values from pre-refactor `solve_modal_3d` on the same model.
const GOLDEN_MODAL_FRAME_OMEGA: [f64; 6] = [
    1.151412924456003e0,
    3.349360822262815e0,
    6.983930453852353e0,
    1.001387695702629e1,
    1.187271392584303e1,
    1.496679145420905e1,
];

/// ω² eigenvalues from the pre-refactor sparse Lanczos on the 8×8 plate
/// (first near-zero noise mode excluded by the λ > 1 filter).
const GOLDEN_MODAL_SHELL_LAMBDA: [f64; 5] = [
    9.400951695707770e2,
    6.490503387654004e3,
    6.578035468712640e3,
    1.644839161977838e4,
    3.104636892300242e4,
];

#[test]
fn modal_3d_sparse_mass_parity_frame() {
    // nf = 300 > 80 → exercises the sparse Lanczos path.
    let input = make_frame_with_released_beam(10, 4);
    let densities = make_densities();
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    let sasm = assemble_sparse_3d(&input, &dof_num, false);
    let m_csc = assemble_mass_matrix_3d_sparse(&input, &dof_num, &densities);
    let sparse_eigen = lanczos_generalized_eigen_sparse(&sasm.k_ff, &m_csc, 6, 0.0)
        .expect("sparse-mass Lanczos failed");

    // Golden parity vs pre-refactor dense-mass sparse Lanczos (1e-10).
    assert_matches_golden(&sparse_eigen.values, &GOLDEN_MODAL_FRAME_LAMBDA, 1e-10, 1e-10,
        "modal frame golden");

    // Cross-method sanity vs fully-dense generalized Lanczos (1e-8).
    let k_dense = sasm.k_ff.to_dense_symmetric();
    let m_full = assemble_mass_matrix_3d(&input, &dof_num, &densities);
    let free_idx: Vec<usize> = (0..nf).collect();
    let m_dense = extract_submatrix(&m_full, n, &free_idx, &free_idx);
    let dense_eigen = lanczos_generalized_eigen(&k_dense, &m_dense, nf, 6, 0.0)
        .expect("dense generalized Lanczos failed");
    for i in 0..6 {
        let rel = (sparse_eigen.values[i] - dense_eigen.values[i]).abs()
            / dense_eigen.values[i].abs().max(1e-30);
        assert!(
            rel < 1e-8,
            "modal frame cross-method mode {}: sparse={:.12e}, dense={:.12e}, rel={:.2e}",
            i, sparse_eigen.values[i], dense_eigen.values[i], rel
        );
    }
}

#[test]
fn modal_3d_sparse_mass_parity_shell() {
    // nf ≈ 450 → sparse Lanczos path. The plate has near-zero noise modes
    // (drilling DOFs) — filtered by λ > 1.
    let input = make_ss_plate(8, 8);
    let densities = make_densities();
    let dof_num = DofNumbering::build_3d(&input);

    let sasm = assemble_sparse_3d(&input, &dof_num, false);
    let m_csc = assemble_mass_matrix_3d_sparse(&input, &dof_num, &densities);
    let sparse_eigen = lanczos_generalized_eigen_sparse(&sasm.k_ff, &m_csc, 6, 0.0)
        .expect("sparse-mass Lanczos failed");

    assert_matches_golden(&sparse_eigen.values, &GOLDEN_MODAL_SHELL_LAMBDA, 1.0, 1e-10,
        "modal shell golden");
}

/// End-to-end: solve_modal_3d (sparse-mass path) frequencies vs golden
/// pre-refactor output, plus participation-factor sanity.
#[test]
fn modal_3d_solve_frequencies_parity() {
    let input = make_frame_with_released_beam(10, 4);
    let densities = make_densities();

    let result = modal::solve_modal_3d(&input, &densities, 6).unwrap();
    let omegas: Vec<f64> = result.modes.iter().map(|m| m.omega).collect();
    assert_matches_golden(&omegas, &GOLDEN_MODAL_FRAME_OMEGA, 0.0, 1e-10,
        "solve_modal_3d golden");

    // Participation/effective masses still computed (finite, non-trivial).
    assert!(result.total_mass > 0.0);
    for m in &result.modes {
        assert!(m.effective_mass_x.is_finite() && m.effective_mass_z.is_finite());
        assert!(m.participation_x.is_finite() && m.participation_z.is_finite());
    }
}

// ─── 3. Buckling load-factor parity (golden: pre-refactor) ──

/// Load factors from pre-refactor `solve_buckling_2d` on the pinned–rollerX
/// column (n_elem=80 → nf=240 > 200 → sparse op path).
const GOLDEN_BUCKLING_2D: [f64; 4] = [
    7.888987780325381e1,
    3.163866483634928e2,
    7.061725745531301e2,
    1.253561406311530e3,
];

/// Load factors from pre-refactor `solve_buckling_3d` on the 3D cantilever
/// column with Iy=2e-4, Iz=1e-4 (n_elem=60 → nf=354 → sparse op path).
const GOLDEN_BUCKLING_3D: [f64; 4] = [
    4.383805480010719e0,
    9.774115886329612e0,
    4.200290006507944e1,
    9.513806022923396e1,
];

#[test]
fn buckling_2d_sparse_op_parity() {
    let n_elem = 80;
    let p = 100.0;
    let input = make_column(n_elem, 5.0, E, A, IZ, "pinned", "rollerX", -p);

    let result = buckling::solve_buckling_2d(&input, 4).unwrap();
    let actual: Vec<f64> = result.modes.iter().map(|m| m.load_factor).collect();
    assert_matches_golden(&actual, &GOLDEN_BUCKLING_2D, 0.0, 1e-10, "buckling 2D golden");
}

#[test]
fn buckling_3d_sparse_op_parity() {
    // Non-degenerate section (Iy != Iz) so the first modes are separated.
    let n_elem = 60;
    let p = 100.0;
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n_elem + 1,
        fx: -p, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_beam(n_elem, 10.0, E, 0.3, A, 2e-4, IZ, J, vec![true; 6], None, loads);

    let result = buckling::solve_buckling_3d(&input, 4).unwrap();
    let actual: Vec<f64> = result.modes.iter().map(|m| m.load_factor).collect();
    assert_matches_golden(&actual, &GOLDEN_BUCKLING_3D, 0.0, 1e-10, "buckling 3D golden");
}
