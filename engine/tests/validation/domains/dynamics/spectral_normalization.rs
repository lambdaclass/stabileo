/// Validation: modal participation and the published mode shape share one normalization.
///
/// `modal` publishes each shape scaled to a unit maximum, and `spectral` builds the modal
/// displacement as Γ·φ·Sd from exactly what `modal` published. Γ·φ is independent of how φ is
/// scaled only if Γ was computed on the same φ. These tests pin that, with two checks that do not
/// depend on any normalization choice:
///
///   1. A single-degree-of-freedom frame (massless columns, rigid heavy girder): Γ = 1 for the
///      sway mode normalized to a unit girder displacement, and the spectral girder displacement
///      is Sd = Sa/ω².
///   2. The modal expansion of the ground-motion load: with every mode kept,
///      Σ Γₙ·φₙ = M_ff⁻¹·(M·ι)_f = ι_f + M_ff⁻¹·M_fr·ι_r. With a consistent mass the free DOFs
///      are coupled to the moving supports (Chopra §9.7, the m_g term), so the expansion is
///      the influence vector ι_f (1 on every free DOF along the direction) plus that
///      correction; with a lumped mass, or away from the supports in the limit of a fine
///      mesh, it is ι_f alone (Chopra eq. 13.2.3).
///
/// Both are stated in 2D and in 3D, the expansion for every direction.
///
/// References:
///   - Chopra, "Dynamics of Structures", 5th Ed., §13.1–13.2 (eq. 13.2.3: Σ Γₙ φₙ = ι)
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::mass_matrix::{assemble_mass_matrix_2d, assemble_mass_matrix_3d};
use dedaliano_engine::solver::{modal, spectral};
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const H: f64 = 3.0;
const L: f64 = 4.0;
const E_COL: f64 = 30_000.0;
const COL_A: f64 = 0.09;
const COL_I: f64 = 6.75e-4; // 0.3 × 0.3 m
/// Girder: stiff enough to be rigid, heavy enough to carry all the mass.
const E_GIRDER: f64 = 3.0e8;
const GIRDER_DENSITY: f64 = 2_446.5; // kg/m³ — a 24 kN/m³ weight density
const COL_DENSITY: f64 = 1e-6;

/// A relative check that is relative at any magnitude. `assert_close` divides by
/// `max(|expected|, 1)`, so against Sd ≈ 5e-4 m its "1 %" is 0.01 m absolute — and
/// main's 3.13 × Sd passed it.
fn assert_rel(actual: f64, expected: f64, tol: f64, label: &str) {
    let rel = ((actual - expected) / expected).abs();
    assert!(rel < tol, "{label}: actual={actual:.6e}, expected={expected:.6e}, rel_err={:.3}%", rel * 100.0);
}

fn flat_spectrum_ms2(sa: f64) -> DesignSpectrum {
    DesignSpectrum {
        name: "flat".to_string(),
        points: vec![SpectrumPoint { period: 0.0, sa }, SpectrumPoint { period: 10.0, sa }],
        in_g: Some(false),
    }
}

fn densities() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), COL_DENSITY);
    d.insert("2".to_string(), GIRDER_DENSITY);
    d
}

fn sdof_frame_2d() -> SolverInput {
    make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, H), (3, L, H), (4, L, 0.0)],
        vec![(1, E_COL, 0.2), (2, E_GIRDER, 0.2)],
        vec![(1, COL_A, COL_I), (2, 1.0, 1.0)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 2, 2, false, false),
            (3, "frame", 4, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![],
    )
}

fn sdof_frame_3d() -> SolverInput3D {
    make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 0.0, 0.0, H), (3, L, 0.0, H), (4, L, 0.0, 0.0)],
        vec![(1, E_COL, 0.2), (2, E_GIRDER, 0.2)],
        vec![(1, COL_A, COL_I, COL_I, 2.0 * COL_I), (2, 1.0, 1.0, 1.0, 1.0)],
        vec![(1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 2, 2), (3, "frame", 4, 3, 1, 1)],
        vec![(1, vec![true; 6]), (4, vec![true; 6])],
        vec![],
    )
}

#[test]
fn sdof_participation_is_one_and_rsa_gives_sd_2d() {
    let input = sdof_frame_2d();
    let modal_res = modal::solve_modal_2d(&input, &densities(), 3).unwrap();
    let sway = modal_res.modes.iter()
        .max_by(|a, b| a.effective_mass_x.partial_cmp(&b.effective_mass_x).unwrap())
        .unwrap();

    assert_close(sway.effective_mass_x, modal_res.total_mass, 0.01, "sway mode carries the girder mass");
    assert_close(sway.participation_x.abs(), 1.0, 0.01, "Γ of a unit-normalized SDOF sway mode");

    let modes = vec![SpectralModeInput {
        frequency: sway.frequency, period: sway.period, omega: sway.omega,
        displacements: sway.displacements.iter()
            .map(|d| SpectralModeDisp { node_id: d.node_id, ux: d.ux, uz: d.uz, ry: d.ry })
            .collect(),
        participation_x: sway.participation_x, participation_y: sway.participation_y,
        effective_mass_x: sway.effective_mass_x, effective_mass_y: sway.effective_mass_y,
    }];
    let sa = 1.0;
    let res = spectral::solve_spectral_2d(&SpectralInput {
        solver: input, modes, densities: densities(), spectrum: flat_spectrum_ms2(sa),
        direction: "X".to_string(), rule: Some("SRSS".to_string()), xi: Some(0.05),
        importance_factor: Some(1.0), reduction_factor: Some(1.0), total_mass: Some(modal_res.total_mass),
    }).unwrap();

    let sd = sa / (sway.omega * sway.omega);
    let girder = res.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_rel(girder.ux.abs(), sd, 0.01, "RSA girder displacement = Sa/ω²");
}

#[test]
fn sdof_participation_is_one_and_rsa_gives_sd_3d() {
    let input = sdof_frame_3d();
    let modal_res = modal::solve_modal_3d(&input, &densities(), 4).unwrap();
    let sway = modal_res.modes.iter()
        .max_by(|a, b| a.effective_mass_x.partial_cmp(&b.effective_mass_x).unwrap())
        .unwrap();

    assert_close(sway.effective_mass_x, modal_res.total_mass, 0.01, "sway mode carries the girder mass");
    assert_close(sway.participation_x.abs(), 1.0, 0.01, "Γ of a unit-normalized SDOF sway mode");

    let modes = vec![SpectralModeInput3D {
        frequency: sway.frequency, period: sway.period, omega: sway.omega,
        displacements: sway.displacements.iter()
            .map(|d| SpectralModeDisp3D { node_id: d.node_id, ux: d.ux, uy: d.uy, uz: d.uz, rx: d.rx, ry: d.ry, rz: d.rz })
            .collect(),
        participation_x: sway.participation_x, participation_y: sway.participation_y,
        participation_z: sway.participation_z,
        effective_mass_x: sway.effective_mass_x, effective_mass_y: sway.effective_mass_y,
        effective_mass_z: sway.effective_mass_z,
    }];
    let sa = 1.0;
    let res = spectral::solve_spectral_3d(&SpectralInput3D {
        solver: input, modes, densities: densities(), spectrum: flat_spectrum_ms2(sa),
        direction: "X".to_string(), rule: Some("SRSS".to_string()), xi: Some(0.05),
        importance_factor: Some(1.0), reduction_factor: Some(1.0), total_mass: Some(modal_res.total_mass),
    }).unwrap();

    let sd = sa / (sway.omega * sway.omega);
    let girder = res.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_rel(girder.ux.abs(), sd, 0.01, "RSA girder displacement = Sa/ω²");
}

/// A three-element cantilever along the vertical, fixed at the base: 9 free DOFs in 2D.
fn cantilever_2d() -> SolverInput {
    make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, 1.0), (3, 0.0, 2.0), (4, 0.0, 3.0)],
        vec![(1, E_COL, 0.2)],
        vec![(1, COL_A, COL_I)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed")],
        vec![],
    )
}

/// x = M_ff⁻¹·(M·ι)_f from the full dense mass `m` (n×n), ι = 1 on `dirs` (all DOFs).
fn expansion_target(m: &[f64], n: usize, nf: usize, iota: &[f64]) -> Vec<f64> {
    let rhs: Vec<f64> = (0..nf).map(|i| (0..n).map(|j| m[i * n + j] * iota[j]).sum()).collect();
    // Gaussian elimination with partial pivoting on M_ff.
    let mut a: Vec<Vec<f64>> = (0..nf).map(|i| (0..nf).map(|j| m[i * n + j]).chain([rhs[i]]).collect()).collect();
    for c in 0..nf {
        let p = (c..nf).max_by(|&x, &y| a[x][c].abs().total_cmp(&a[y][c].abs())).unwrap();
        a.swap(c, p);
        for r in c + 1..nf {
            let f = a[r][c] / a[c][c];
            for k in c..=nf {
                a[r][k] -= f * a[c][k];
            }
        }
    }
    let mut x = vec![0.0; nf];
    for r in (0..nf).rev() {
        x[r] = (a[r][nf] - (r + 1..nf).map(|k| a[r][k] * x[k]).sum::<f64>()) / a[r][r];
    }
    x
}

#[test]
fn modal_expansion_of_the_influence_vector_2d() {
    let input = cantilever_2d();
    let mut d = HashMap::new();
    d.insert("1".to_string(), 2_446.5);
    let modal_res = modal::solve_modal_2d(&input, &d, 9).unwrap();
    assert_eq!(modal_res.modes.len(), 9, "every mode is needed for the expansion to close");
    let dof = DofNumbering::build_2d(&input);
    let (n, nf) = (dof.n_total, dof.n_free);
    let m = assemble_mass_matrix_2d(&input, &dof, &d);

    // Horizontal (participation_x) and vertical (participation_y) ground motion.
    for dir in 0..2 {
        let mut iota = vec![0.0; n];
        for &node in &dof.node_order {
            iota[dof.map[&(node, dir)]] = 1.0;
        }
        let target = expansion_target(&m, n, nf, &iota);
        let mut max_corr = 0.0f64;
        for node in [2usize, 3, 4] {
            let mut sum = [0.0f64; 3];
            for md in &modal_res.modes {
                let g = [md.participation_x, md.participation_y][dir];
                let phi = md.displacements.iter().find(|d| d.node_id == node).unwrap();
                for (k, v) in [phi.ux, phi.uz, phi.ry].into_iter().enumerate() {
                    sum[k] += g * v;
                }
            }
            for k in 0..3 {
                let t = target[dof.map[&(node, k)]];
                assert!((sum[k] - t).abs() < 1e-6 * t.abs().max(1.0), "dir {dir} node {node} comp {k}: Σ Γφ = {} vs {t}", sum[k]);
                if k == dir {
                    max_corr = max_corr.max((t - 1.0).abs());
                }
            }
        }
        // The support coupling is a correction concentrated next to the base.
        assert!(max_corr > 1e-3 && max_corr < 0.5, "dir {dir}: correction {max_corr}");
    }
}

/// The same cantilever in 3D, along global Z: 18 free DOFs. The 3D path is the one the
/// web calls, and it rescales Γx, Γy and Γz separately.
fn cantilever_3d() -> SolverInput3D {
    make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 0.0, 0.0, 1.0), (3, 0.0, 0.0, 2.0), (4, 0.0, 0.0, 3.0)],
        vec![(1, E_COL, 0.2)],
        vec![(1, COL_A, COL_I, 0.5 * COL_I, 2.0 * COL_I)],
        vec![(1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1), (3, "frame", 3, 4, 1, 1)],
        vec![(1, vec![true; 6])],
        vec![],
    )
}

#[test]
fn modal_expansion_of_the_influence_vector_3d() {
    let input = cantilever_3d();
    let mut d = HashMap::new();
    d.insert("1".to_string(), 2_446.5);
    let modal_res = modal::solve_modal_3d(&input, &d, 18).unwrap();
    assert_eq!(modal_res.modes.len(), 18, "every mode is needed for the expansion to close");
    let dof = DofNumbering::build_3d(&input);
    let (n, nf) = (dof.n_total, dof.n_free);
    let m = assemble_mass_matrix_3d(&input, &dof, &d);

    // For each direction, Σ Γ·φ is M_ff⁻¹(M·ι)_f: the rigid translation in that direction
    // plus the support-coupled correction (see the module notes).
    for dir in 0..3 {
        let mut iota = vec![0.0; n];
        for &node in &dof.node_order {
            iota[dof.map[&(node, dir)]] = 1.0;
        }
        let target = expansion_target(&m, n, nf, &iota);
        for node in [2usize, 3, 4] {
            let mut sum = [0.0f64; 6];
            for md in &modal_res.modes {
                let g = [md.participation_x, md.participation_y, md.participation_z][dir];
                let phi = md.displacements.iter().find(|d| d.node_id == node).unwrap();
                for (k, v) in [phi.ux, phi.uy, phi.uz, phi.rx, phi.ry, phi.rz].into_iter().enumerate() {
                    sum[k] += g * v;
                }
            }
            let axis = ["x", "y", "z"][dir];
            for k in 0..6 {
                let t = target[dof.map[&(node, k)]];
                assert!((sum[k] - t).abs() < 1e-6 * t.abs().max(1.0), "Σ Γ{axis}·φ component {k} at node {node}: {} vs {t}", sum[k]);
            }
        }
    }
}
