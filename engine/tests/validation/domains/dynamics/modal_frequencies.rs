/// Validation: Natural frequencies for 4 classical beam boundary conditions.
///
/// Reference: Chopra *Dynamics of Structures*, Timoshenko *Vibration Problems*
///
/// Formula: ω_n = (βₙL/L)² × √(EI/ρA)
///
/// | BC | β₁L | ω₂/ω₁ |
/// |----|------|--------|
/// | Pinned-pinned | π | 4.0 |
/// | Fixed-free | 1.8751 | 6.27 |
/// | Fixed-pinned | 3.9266 | 3.24 |
/// | Fixed-fixed | 4.7300 | 2.76 |
use dedaliano_engine::solver::modal;
use dedaliano_engine::types::*;
use std::collections::HashMap;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const EI: f64 = 20_000.0;
const L: f64 = 5.0;
const DENSITY: f64 = 7_850.0;

// ρA in solver units (tonnes/m)
const RHO_A: f64 = DENSITY * A / 1000.0; // 0.0785

// 3D section constants
const IY: f64 = 1e-4;
const J: f64 = 1.5e-4;

fn make_densities() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), DENSITY);
    d
}

fn make_3d_input_modal(
    nodes: Vec<(usize, f64, f64, f64)>,
    mats: Vec<(usize, f64, f64)>,
    secs: Vec<(usize, f64, f64, f64, f64)>,
    elems: Vec<(usize, &str, usize, usize, usize, usize)>,
    sups: Vec<(usize, usize, bool, bool, bool, bool, bool, bool)>,
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
        secs_map.insert(id.to_string(), SolverSection3D { id, name: None, a, iy, iz, j, cw: None, as_y: None, as_z: None });
    }
    let mut elems_map = HashMap::new();
    for (id, t, ni, nj, mi, si) in elems {
        elems_map.insert(id.to_string(), SolverElement3D {
            id, elem_type: t.to_string(),
            node_i: ni, node_j: nj, material_id: mi, section_id: si,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
    }
    let mut sups_map = HashMap::new();
    for (id, nid, rx, ry, rz, rrx, rry, rrz) in sups {
        sups_map.insert(id.to_string(), SolverSupport3D {
            node_id: nid, rx, ry, rz, rrx, rry, rrz,
            kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
            });
    }
    SolverInput3D {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_beams: vec![],
            curved_shells: HashMap::new(),
        connectors: HashMap::new(),    }
}

fn omega_exact(beta_l: f64) -> f64 {
    (beta_l / L).powi(2) * (EI / RHO_A).sqrt()
}

// ═══════════════════════════════════════════════════════════════
// 1. Pinned-Pinned: β₁L = π, ω₂/ω₁ = 4.0
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_modal_pinned_pinned_exact() {
    let mut input = make_ss_beam_udl(8, L, E, A, IZ, 0.0);
    input.loads.clear();
    let result = modal::solve_modal_2d(&input, &make_densities(), 4).unwrap();

    let omega1 = result.modes[0].omega;
    let expected = omega_exact(std::f64::consts::PI);
    let error = (omega1 - expected).abs() / expected;
    assert!(error < 0.02, "PP ω₁={:.2}, expected={:.2}, error={:.2}%", omega1, expected, error * 100.0);
}

#[test]
fn validation_modal_pinned_pinned_convergence() {
    let expected = omega_exact(std::f64::consts::PI);
    let mut prev_error = f64::INFINITY;
    for n_elem in [4, 8, 16] {
        let mut input = make_ss_beam_udl(n_elem, L, E, A, IZ, 0.0);
        input.loads.clear();
        let result = modal::solve_modal_2d(&input, &make_densities(), 2).unwrap();
        let error = (result.modes[0].omega - expected).abs() / expected;
        assert!(error < prev_error + 0.001, "PP convergence n={}", n_elem);
        prev_error = error;
    }
}

#[test]
fn validation_modal_pinned_pinned_higher_mode() {
    let mut input = make_ss_beam_udl(8, L, E, A, IZ, 0.0);
    input.loads.clear();
    let result = modal::solve_modal_2d(&input, &make_densities(), 4).unwrap();
    assert!(result.modes.len() >= 2);
    let ratio = result.modes[1].omega / result.modes[0].omega;
    assert!(ratio > 3.5 && ratio < 4.5, "PP ω₂/ω₁={:.2}, expected ~4.0", ratio);
}

#[test]
fn validation_modal_pinned_pinned_3d_parity() {
    // 2D
    let mut input_2d = make_ss_beam_udl(8, L, E, A, IZ, 0.0);
    input_2d.loads.clear();
    let result_2d = modal::solve_modal_2d(&input_2d, &make_densities(), 2).unwrap();

    // 3D: pinned = all translations restrained, rollerX = uy,uz restrained
    let n = 8;
    let elem_len = L / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();
    let start = (true, true, true, true, false, false);
    let end = (false, true, true, true, false, false);
    let input_3d = make_3d_input_modal(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IY, IZ, J)],
        elems, vec![(1, 1, start.0, start.1, start.2, start.3, start.4, start.5),
                    (2, n + 1, end.0, end.1, end.2, end.3, end.4, end.5)],
    );
    let result_3d = modal::solve_modal_3d(&input_3d, &make_densities(), 4).unwrap();

    let omega_2d = result_2d.modes[0].omega;
    let omega_3d = result_3d.modes[0].omega;
    let error = (omega_3d - omega_2d).abs() / omega_2d;
    assert!(error < 0.02, "PP 3D parity: ω₃d={:.2}, ω₂d={:.2}, error={:.2}%", omega_3d, omega_2d, error * 100.0);
}

// ═══════════════════════════════════════════════════════════════
// 2. Fixed-Free (Cantilever): β₁L = 1.8751, ω₂/ω₁ ≈ 6.27
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_modal_fixed_free_exact() {
    let input = make_beam(8, L, E, A, IZ, "fixed", None, vec![]);
    let result = modal::solve_modal_2d(&input, &make_densities(), 4).unwrap();

    let omega1 = result.modes[0].omega;
    let expected = omega_exact(1.8751);
    let error = (omega1 - expected).abs() / expected;
    assert!(error < 0.02, "FF ω₁={:.2}, expected={:.2}, error={:.2}%", omega1, expected, error * 100.0);
}

#[test]
fn validation_modal_fixed_free_convergence() {
    let expected = omega_exact(1.8751);
    let mut prev_error = f64::INFINITY;
    for n_elem in [4, 8, 16] {
        let input = make_beam(n_elem, L, E, A, IZ, "fixed", None, vec![]);
        let result = modal::solve_modal_2d(&input, &make_densities(), 2).unwrap();
        let error = (result.modes[0].omega - expected).abs() / expected;
        assert!(error < prev_error + 0.001, "FF convergence n={}", n_elem);
        prev_error = error;
    }
}

#[test]
fn validation_modal_fixed_free_higher_mode() {
    let input = make_beam(8, L, E, A, IZ, "fixed", None, vec![]);
    let result = modal::solve_modal_2d(&input, &make_densities(), 4).unwrap();
    assert!(result.modes.len() >= 2);
    let ratio = result.modes[1].omega / result.modes[0].omega;
    // β₂L/β₁L = 4.6941/1.8751 = 2.503, ratio = 2.503² ≈ 6.27
    assert!(ratio > 5.0 && ratio < 7.5, "FF ω₂/ω₁={:.2}, expected ~6.27", ratio);
}

#[test]
fn validation_modal_fixed_free_3d_parity() {
    let input_2d = make_beam(8, L, E, A, IZ, "fixed", None, vec![]);
    let result_2d = modal::solve_modal_2d(&input_2d, &make_densities(), 2).unwrap();

    let n = 8;
    let elem_len = L / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();
    let input_3d = make_3d_input_modal(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IY, IZ, J)],
        elems, vec![(1, 1, true, true, true, true, true, true)],
    );
    let result_3d = modal::solve_modal_3d(&input_3d, &make_densities(), 4).unwrap();

    let omega_2d = result_2d.modes[0].omega;
    let omega_3d = result_3d.modes[0].omega;
    let error = (omega_3d - omega_2d).abs() / omega_2d;
    assert!(error < 0.02, "FF 3D parity: ω₃d={:.2}, ω₂d={:.2}", omega_3d, omega_2d);
}

// ═══════════════════════════════════════════════════════════════
// 3. Fixed-Pinned: β₁L = 3.9266, ω₂/ω₁ ≈ 3.24
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_modal_fixed_pinned_exact() {
    let input = make_beam(8, L, E, A, IZ, "fixed", Some("rollerX"), vec![]);
    let result = modal::solve_modal_2d(&input, &make_densities(), 4).unwrap();

    let omega1 = result.modes[0].omega;
    let expected = omega_exact(3.9266);
    let error = (omega1 - expected).abs() / expected;
    assert!(error < 0.02, "FP ω₁={:.2}, expected={:.2}, error={:.2}%", omega1, expected, error * 100.0);
}

#[test]
fn validation_modal_fixed_pinned_convergence() {
    let expected = omega_exact(3.9266);
    let mut prev_error = f64::INFINITY;
    for n_elem in [4, 8, 16] {
        let input = make_beam(n_elem, L, E, A, IZ, "fixed", Some("rollerX"), vec![]);
        let result = modal::solve_modal_2d(&input, &make_densities(), 2).unwrap();
        let error = (result.modes[0].omega - expected).abs() / expected;
        assert!(error < prev_error + 0.001, "FP convergence n={}", n_elem);
        prev_error = error;
    }
}

#[test]
fn validation_modal_fixed_pinned_higher_mode() {
    let input = make_beam(8, L, E, A, IZ, "fixed", Some("rollerX"), vec![]);
    let result = modal::solve_modal_2d(&input, &make_densities(), 4).unwrap();
    assert!(result.modes.len() >= 2);
    let ratio = result.modes[1].omega / result.modes[0].omega;
    // β₂L/β₁L = 7.0686/3.9266 ≈ 1.800 → ratio ≈ 3.24
    assert!(ratio > 2.5 && ratio < 4.0, "FP ω₂/ω₁={:.2}, expected ~3.24", ratio);
}

#[test]
fn validation_modal_fixed_pinned_3d_parity() {
    let input_2d = make_beam(8, L, E, A, IZ, "fixed", Some("rollerX"), vec![]);
    let result_2d = modal::solve_modal_2d(&input_2d, &make_densities(), 2).unwrap();

    let n = 8;
    let elem_len = L / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();
    let input_3d = make_3d_input_modal(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IY, IZ, J)],
        elems, vec![
            (1, 1, true, true, true, true, true, true),
            (2, n + 1, false, true, true, false, false, false),
        ],
    );
    let result_3d = modal::solve_modal_3d(&input_3d, &make_densities(), 4).unwrap();

    let omega_2d = result_2d.modes[0].omega;
    let omega_3d = result_3d.modes[0].omega;
    let error = (omega_3d - omega_2d).abs() / omega_2d;
    assert!(error < 0.02, "FP 3D parity: ω₃d={:.2}, ω₂d={:.2}", omega_3d, omega_2d);
}

// ═══════════════════════════════════════════════════════════════
// 4. Fixed-Fixed: β₁L = 4.7300, ω₂/ω₁ ≈ 2.76
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_modal_fixed_fixed_exact() {
    let input = make_beam(8, L, E, A, IZ, "fixed", Some("guidedX"), vec![]);
    let result = modal::solve_modal_2d(&input, &make_densities(), 4).unwrap();

    let omega1 = result.modes[0].omega;
    let expected = omega_exact(4.7300);
    let error = (omega1 - expected).abs() / expected;
    assert!(error < 0.02, "FxFx ω₁={:.2}, expected={:.2}, error={:.2}%", omega1, expected, error * 100.0);
}

#[test]
fn validation_modal_fixed_fixed_convergence() {
    let expected = omega_exact(4.7300);
    let mut prev_error = f64::INFINITY;
    for n_elem in [4, 8, 16] {
        let input = make_beam(n_elem, L, E, A, IZ, "fixed", Some("guidedX"), vec![]);
        let result = modal::solve_modal_2d(&input, &make_densities(), 2).unwrap();
        let error = (result.modes[0].omega - expected).abs() / expected;
        assert!(error < prev_error + 0.001, "FxFx convergence n={}", n_elem);
        prev_error = error;
    }
}

#[test]
fn validation_modal_fixed_fixed_higher_mode() {
    let input = make_beam(8, L, E, A, IZ, "fixed", Some("guidedX"), vec![]);
    let result = modal::solve_modal_2d(&input, &make_densities(), 4).unwrap();
    assert!(result.modes.len() >= 2);
    let ratio = result.modes[1].omega / result.modes[0].omega;
    // β₂L/β₁L = 7.8532/4.7300 ≈ 1.660 → ratio ≈ 2.76
    assert!(ratio > 2.2 && ratio < 3.3, "FxFx ω₂/ω₁={:.2}, expected ~2.76", ratio);
}

#[test]
fn validation_modal_fixed_fixed_3d_parity() {
    let input_2d = make_beam(8, L, E, A, IZ, "fixed", Some("guidedX"), vec![]);
    let result_2d = modal::solve_modal_2d(&input_2d, &make_densities(), 2).unwrap();

    let n = 8;
    let elem_len = L / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();
    let input_3d = make_3d_input_modal(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IY, IZ, J)],
        elems, vec![
            (1, 1, true, true, true, true, true, true),
            (2, n + 1, false, true, true, true, true, true),
        ],
    );
    let result_3d = modal::solve_modal_3d(&input_3d, &make_densities(), 4).unwrap();

    let omega_2d = result_2d.modes[0].omega;
    let omega_3d = result_3d.modes[0].omega;
    let error = (omega_3d - omega_2d).abs() / omega_2d;
    assert!(error < 0.02, "FxFx 3D parity: ω₃d={:.2}, ω₂d={:.2}", omega_3d, omega_2d);
}
