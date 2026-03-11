/// Validation Test #1: Euler Column Buckling — All 4 Classical Boundary Conditions
///
/// Reference: Timoshenko & Gere, *Theory of Elastic Stability*
///
/// Tests verify critical load (Pcr) for:
///   1. Pinned-pinned:  Pcr = π²EI/L²      (K=1.0)
///   2. Fixed-free:     Pcr = π²EI/(4L²)    (K=2.0)
///   3. Fixed-pinned:   Pcr = 20.1907·EI/L² (K≈0.699)
///   4. Fixed-fixed:    Pcr = 4π²EI/L²      (K=0.5)
use dedaliano_engine::solver::buckling;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

// Shared constants (same as existing buckling tests)
const E: f64 = 200_000.0;  // MPa
const A: f64 = 0.01;       // m²
const IZ: f64 = 1e-4;      // m⁴
const EI: f64 = 20_000.0;  // kN·m² (= E * 1000 * IZ)
const L: f64 = 5.0;        // m
const P: f64 = 100.0;      // kN applied load

// Exact critical loads
const PCR_PINNED_PINNED: f64 = 9.8696 * EI / (L * L); // π²·EI/L²
const PCR_FIXED_FREE: f64 = 2.4674 * EI / (L * L);    // π²·EI/(4L²)
const PCR_FIXED_PINNED: f64 = 20.1907 * EI / (L * L); // tan(βL)=βL first root
const PCR_FIXED_FIXED: f64 = 39.4784 * EI / (L * L);  // 4π²·EI/L²

// 3D section constants
const IY: f64 = 1e-4;
const J: f64 = 1.5e-4;

/// Build a cantilever column (fixed at base, free at tip — no end support).
fn make_cantilever(n_elem: usize, axial_load: f64) -> SolverInput {
    let elem_len = L / n_elem as f64;
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
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        vec![(1, 1, "fixed")], // Only fixed at base, free tip
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_elem + 1,
            fx: axial_load,
            fy: 0.0,
            mz: 0.0,
        })],
    )
}

/// Build a 3D column along X-axis.
fn make_3d_column_input(
    n_elem: usize,
    start_sup: (bool, bool, bool, bool, bool, bool),
    end_sup: Option<(bool, bool, bool, bool, bool, bool)>,
    axial_load: f64,
) -> SolverInput3D {
    let elem_len = L / n_elem as f64;
    let nodes: Vec<_> = (0..=n_elem)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0))
        .collect();
    let elems: Vec<_> = (0..n_elem)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1))
        .collect();

    let mut sups = vec![(1, 1, start_sup.0, start_sup.1, start_sup.2,
                         start_sup.3, start_sup.4, start_sup.5)];
    if let Some(es) = end_sup {
        sups.push((2, n_elem + 1, es.0, es.1, es.2, es.3, es.4, es.5));
    }

    let loads = if axial_load.abs() > 1e-20 {
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n_elem + 1,
            fx: axial_load,
            fy: 0.0,
            fz: 0.0,
            mx: 0.0,
            my: 0.0,
            mz: 0.0, bw: None })]
    } else {
        vec![]
    };

    make_3d_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IY, IZ, J)], elems, sups, loads)
}

fn make_3d_input(
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
        secs_map.insert(id.to_string(), SolverSection3D { id, name: None, a, iy, iz, j, cw: None, as_y: None, as_z: None });
    }
    let mut elems_map = HashMap::new();
    for (id, t, ni, nj, mi, si) in elems {
        elems_map.insert(id.to_string(), SolverElement3D {
            id,
            elem_type: t.to_string(),
            node_i: ni, node_j: nj,
            material_id: mi, section_id: si,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None,
            roll_angle: None,
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
        elements: elems_map, supports: sups_map, loads, constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_beams: vec![],
            curved_shells: HashMap::new(),
        connectors: HashMap::new(),    }
}

// ═══════════════════════════════════════════════════════════════
// 1. Pinned-Pinned: Pcr = π²EI/L²
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_euler_pinned_pinned_exact() {
    let input = make_column(8, L, E, A, IZ, "pinned", "rollerX", -P);
    let result = buckling::solve_buckling_2d(&input, 1).unwrap();
    let lambda1 = result.modes[0].load_factor;
    let pcr = lambda1 * P;
    let error = (pcr - PCR_PINNED_PINNED).abs() / PCR_PINNED_PINNED;
    assert!(
        error < 0.01,
        "Pinned-pinned: Pcr={:.2}, expected={:.2}, error={:.4}%",
        pcr, PCR_PINNED_PINNED, error * 100.0
    );
}

#[test]
fn validation_euler_pinned_pinned_convergence() {
    let mut prev_error = f64::INFINITY;
    for n_elem in [2, 4, 8, 16] {
        let input = make_column(n_elem, L, E, A, IZ, "pinned", "rollerX", -P);
        let result = buckling::solve_buckling_2d(&input, 1).unwrap();
        let pcr = result.modes[0].load_factor * P;
        let error = (pcr - PCR_PINNED_PINNED).abs() / PCR_PINNED_PINNED;
        assert!(
            error < prev_error,
            "Pinned-pinned convergence: n={}, error={:.4}% should < prev={:.4}%",
            n_elem, error * 100.0, prev_error * 100.0
        );
        prev_error = error;
    }
}

#[test]
fn validation_euler_pinned_pinned_higher_mode() {
    let input = make_column(8, L, E, A, IZ, "pinned", "rollerX", -P);
    let result = buckling::solve_buckling_2d(&input, 4).unwrap();
    assert!(result.modes.len() >= 2, "need at least 2 modes");
    let ratio = result.modes[1].load_factor / result.modes[0].load_factor;
    // λ₂/λ₁ = n²: second mode has n=2, so ratio = 4
    assert!(
        ratio > 3.5 && ratio < 4.5,
        "Pinned-pinned mode ratio λ₂/λ₁={:.2}, expected ~4.0", ratio
    );
}

#[test]
fn validation_euler_pinned_pinned_3d_parity() {
    // 3D: pinned = all translations + torsion restrained, rollerX = ry+rz+torsion
    let start = (true, true, true, true, false, false);
    let end = Some((false, true, true, true, false, false));
    let input_3d = make_3d_column_input(8, start, end, -P);
    let result_3d = buckling::solve_buckling_3d(&input_3d, 2).unwrap();

    let input_2d = make_column(8, L, E, A, IZ, "pinned", "rollerX", -P);
    let result_2d = buckling::solve_buckling_2d(&input_2d, 1).unwrap();

    let pcr_3d = result_3d.modes[0].load_factor * P;
    let pcr_2d = result_2d.modes[0].load_factor * P;
    let error = (pcr_3d - pcr_2d).abs() / pcr_2d;
    assert!(
        error < 0.01,
        "Pinned-pinned 3D parity: Pcr_3d={:.2}, Pcr_2d={:.2}, error={:.4}%",
        pcr_3d, pcr_2d, error * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Fixed-Free (Cantilever): Pcr = π²EI/(4L²)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_euler_fixed_free_exact() {
    let input = make_cantilever(8, -P);
    let result = buckling::solve_buckling_2d(&input, 1).unwrap();
    let lambda1 = result.modes[0].load_factor;
    let pcr = lambda1 * P;
    let error = (pcr - PCR_FIXED_FREE).abs() / PCR_FIXED_FREE;
    assert!(
        error < 0.01,
        "Fixed-free: Pcr={:.2}, expected={:.2}, error={:.4}%",
        pcr, PCR_FIXED_FREE, error * 100.0
    );
}

#[test]
fn validation_euler_fixed_free_convergence() {
    let mut prev_error = f64::INFINITY;
    for n_elem in [2, 4, 8, 16] {
        let input = make_cantilever(n_elem, -P);
        let result = buckling::solve_buckling_2d(&input, 1).unwrap();
        let pcr = result.modes[0].load_factor * P;
        let error = (pcr - PCR_FIXED_FREE).abs() / PCR_FIXED_FREE;
        assert!(
            error < prev_error,
            "Fixed-free convergence: n={}, error={:.4}% should < prev={:.4}%",
            n_elem, error * 100.0, prev_error * 100.0
        );
        prev_error = error;
    }
}

#[test]
fn validation_euler_fixed_free_higher_mode() {
    let input = make_cantilever(8, -P);
    let result = buckling::solve_buckling_2d(&input, 4).unwrap();
    assert!(result.modes.len() >= 2, "need at least 2 modes");
    let ratio = result.modes[1].load_factor / result.modes[0].load_factor;
    // Cantilever: λ₂/λ₁ = (3/1)² = 9 (odd modes: 1,3,5,...)
    assert!(
        ratio > 7.0 && ratio < 11.0,
        "Fixed-free mode ratio λ₂/λ₁={:.2}, expected ~9.0", ratio
    );
}

#[test]
fn validation_euler_fixed_free_3d_parity() {
    // 3D: fixed at base = all restrained, no end support
    let start = (true, true, true, true, true, true);
    let input_3d = make_3d_column_input(8, start, None, -P);
    let result_3d = buckling::solve_buckling_3d(&input_3d, 2).unwrap();

    let input_2d = make_cantilever(8, -P);
    let result_2d = buckling::solve_buckling_2d(&input_2d, 1).unwrap();

    let pcr_3d = result_3d.modes[0].load_factor * P;
    let pcr_2d = result_2d.modes[0].load_factor * P;
    let error = (pcr_3d - pcr_2d).abs() / pcr_2d;
    assert!(
        error < 0.01,
        "Fixed-free 3D parity: Pcr_3d={:.2}, Pcr_2d={:.2}, error={:.4}%",
        pcr_3d, pcr_2d, error * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Fixed-Pinned: Pcr = 20.1907·EI/L²
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_euler_fixed_pinned_exact() {
    let input = make_column(8, L, E, A, IZ, "fixed", "rollerX", -P);
    let result = buckling::solve_buckling_2d(&input, 1).unwrap();
    let pcr = result.modes[0].load_factor * P;
    let error = (pcr - PCR_FIXED_PINNED).abs() / PCR_FIXED_PINNED;
    assert!(
        error < 0.01,
        "Fixed-pinned: Pcr={:.2}, expected={:.2}, error={:.4}%",
        pcr, PCR_FIXED_PINNED, error * 100.0
    );
}

#[test]
fn validation_euler_fixed_pinned_convergence() {
    let mut prev_error = f64::INFINITY;
    for n_elem in [2, 4, 8, 16] {
        let input = make_column(n_elem, L, E, A, IZ, "fixed", "rollerX", -P);
        let result = buckling::solve_buckling_2d(&input, 1).unwrap();
        let pcr = result.modes[0].load_factor * P;
        let error = (pcr - PCR_FIXED_PINNED).abs() / PCR_FIXED_PINNED;
        assert!(
            error < prev_error,
            "Fixed-pinned convergence: n={}, error={:.4}% should < prev={:.4}%",
            n_elem, error * 100.0, prev_error * 100.0
        );
        prev_error = error;
    }
}

#[test]
fn validation_euler_fixed_pinned_higher_mode() {
    let input = make_column(8, L, E, A, IZ, "fixed", "rollerX", -P);
    let result = buckling::solve_buckling_2d(&input, 4).unwrap();
    assert!(result.modes.len() >= 2, "need at least 2 modes");
    let ratio = result.modes[1].load_factor / result.modes[0].load_factor;
    // Fixed-pinned: λ₂/λ₁ ≈ 3.4 (from transcendental equation roots)
    assert!(
        ratio > 2.5 && ratio < 4.5,
        "Fixed-pinned mode ratio λ₂/λ₁={:.2}, expected ~3.4", ratio
    );
}

#[test]
fn validation_euler_fixed_pinned_3d_parity() {
    // 3D: fixed at base, rollerX at top (ry+rz restrained, ux free)
    let start = (true, true, true, true, true, true);
    let end = Some((false, true, true, false, false, false));
    let input_3d = make_3d_column_input(8, start, end, -P);
    let result_3d = buckling::solve_buckling_3d(&input_3d, 2).unwrap();

    let input_2d = make_column(8, L, E, A, IZ, "fixed", "rollerX", -P);
    let result_2d = buckling::solve_buckling_2d(&input_2d, 1).unwrap();

    let pcr_3d = result_3d.modes[0].load_factor * P;
    let pcr_2d = result_2d.modes[0].load_factor * P;
    let error = (pcr_3d - pcr_2d).abs() / pcr_2d;
    assert!(
        error < 0.01,
        "Fixed-pinned 3D parity: Pcr_3d={:.2}, Pcr_2d={:.2}, error={:.4}%",
        pcr_3d, pcr_2d, error * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. Fixed-Fixed: Pcr = 4π²EI/L²
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_euler_fixed_fixed_exact() {
    let input = make_column(8, L, E, A, IZ, "fixed", "guidedX", -P);
    let result = buckling::solve_buckling_2d(&input, 1).unwrap();
    let pcr = result.modes[0].load_factor * P;
    let error = (pcr - PCR_FIXED_FIXED).abs() / PCR_FIXED_FIXED;
    assert!(
        error < 0.01,
        "Fixed-fixed: Pcr={:.2}, expected={:.2}, error={:.4}%",
        pcr, PCR_FIXED_FIXED, error * 100.0
    );
}

#[test]
fn validation_euler_fixed_fixed_convergence() {
    let mut prev_error = f64::INFINITY;
    for n_elem in [2, 4, 8, 16] {
        let input = make_column(n_elem, L, E, A, IZ, "fixed", "guidedX", -P);
        let result = buckling::solve_buckling_2d(&input, 1).unwrap();
        let pcr = result.modes[0].load_factor * P;
        let error = (pcr - PCR_FIXED_FIXED).abs() / PCR_FIXED_FIXED;
        assert!(
            error < prev_error,
            "Fixed-fixed convergence: n={}, error={:.4}% should < prev={:.4}%",
            n_elem, error * 100.0, prev_error * 100.0
        );
        prev_error = error;
    }
}

#[test]
fn validation_euler_fixed_fixed_higher_mode() {
    let input = make_column(8, L, E, A, IZ, "fixed", "guidedX", -P);
    let result = buckling::solve_buckling_2d(&input, 4).unwrap();
    assert!(result.modes.len() >= 2, "need at least 2 modes");
    let ratio = result.modes[1].load_factor / result.modes[0].load_factor;
    // Fixed-fixed: 1st symmetric (βL)²=39.48, 2nd antisymmetric (βL)²≈80.76 → ratio ≈ 2.05
    assert!(
        ratio > 1.8 && ratio < 2.3,
        "Fixed-fixed mode ratio λ₂/λ₁={:.2}, expected ~2.05", ratio
    );
}

#[test]
fn validation_euler_fixed_fixed_3d_parity() {
    // 3D: fixed at base, guidedX at top = (rx=false, ry=true, rz=false, rrx=false, rry=false, rrz=true)
    // ux free, uy restrained, rz restrained (2D equivalent)
    // In 3D we also restrain uz and rotations about x,y for the in-plane behavior
    let start = (true, true, true, true, true, true);
    let end = Some((false, true, true, true, true, true)); // guided: ux free, rest fixed
    let input_3d = make_3d_column_input(8, start, end, -P);
    let result_3d = buckling::solve_buckling_3d(&input_3d, 2).unwrap();

    let input_2d = make_column(8, L, E, A, IZ, "fixed", "guidedX", -P);
    let result_2d = buckling::solve_buckling_2d(&input_2d, 1).unwrap();

    let pcr_3d = result_3d.modes[0].load_factor * P;
    let pcr_2d = result_2d.modes[0].load_factor * P;
    let error = (pcr_3d - pcr_2d).abs() / pcr_2d;
    assert!(
        error < 0.01,
        "Fixed-fixed 3D parity: Pcr_3d={:.2}, Pcr_2d={:.2}, error={:.4}%",
        pcr_3d, pcr_2d, error * 100.0
    );
}
