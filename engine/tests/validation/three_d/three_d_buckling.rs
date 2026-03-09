/// Validation: 3D Buckling Analysis
///
/// Tests linearized buckling in 3D:
///   1. Euler buckling for various BCs (fixed-free, pinned-pinned, fixed-pinned)
///   2. Weak-axis buckling governs for asymmetric sections
///   3. Load factor proportional to 1/L²
///   4. Effective length factors from element data
///   5. Multiple buckling modes
///
/// References:
///   - Euler: Pcr = π²EI/(kL)² where k depends on boundary conditions
///   - Timoshenko & Gere, "Theory of Elastic Stability", Ch. 2
///   - AISC 360 Ch. E: Compression member design
use dedaliano_engine::solver::buckling;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const E_EFF: f64 = E * 1000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 2e-4;
const J: f64 = 1.5e-4;

// ================================================================
// 1. Cantilever Column (Fixed-Free): k = 2.0
// ================================================================
//
// Pcr = π²·E·I_min / (2L)² = π²·E·I_min / (4L²)

#[test]
fn validation_3d_buckling_cantilever() {
    let l: f64 = 5.0;
    let n = 8;
    let p = -100.0;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed
        None, // free
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: p, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let buck = buckling::solve_buckling_3d(&input, 2).unwrap();

    let i_min = IY.min(IZ);
    let pcr_cantilever = std::f64::consts::PI.powi(2) * E_EFF * i_min / (4.0 * l.powi(2));
    let pcr_3d = buck.modes[0].load_factor * p.abs();

    let ratio = pcr_3d / pcr_cantilever;
    assert!(
        (ratio - 1.0).abs() < 0.15,
        "Cantilever buckling: Pcr_3d={:.1}, Pcr_exact={:.1}, ratio={:.3}",
        pcr_3d, pcr_cantilever, ratio
    );
}

// ================================================================
// 2. Pinned-Pinned Column: k = 1.0
// ================================================================
//
// Pcr = π²·E·I_min / L²

#[test]
fn validation_3d_buckling_pinned_pinned() {
    let l: f64 = 5.0;
    let n = 8;
    let p = -100.0;

    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems,
        vec![
            (1, vec![true, true, true, true, false, false]),      // pin
            (n + 1, vec![false, true, true, true, false, false]), // roller
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: p, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let buck = buckling::solve_buckling_3d(&input, 2).unwrap();

    let i_min = IY.min(IZ);
    let pcr_euler = std::f64::consts::PI.powi(2) * E_EFF * i_min / l.powi(2);
    let pcr_3d = buck.modes[0].load_factor * p.abs();

    let ratio = pcr_3d / pcr_euler;
    assert!(
        (ratio - 1.0).abs() < 0.15,
        "Pinned-pinned buckling: Pcr_3d={:.1}, Pcr_euler={:.1}, ratio={:.3}",
        pcr_3d, pcr_euler, ratio
    );
}

// ================================================================
// 3. Fixed-Pinned Column: k ≈ 0.7
// ================================================================
//
// Pcr = π²·E·I_min / (0.7L)² ≈ 2.04 × π²EI/L²

#[test]
fn validation_3d_buckling_fixed_pinned() {
    let l: f64 = 5.0;
    let n = 8;
    let p = -100.0;

    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems,
        vec![
            (1, vec![true, true, true, true, true, true]),        // fixed
            (n + 1, vec![false, true, true, true, false, false]), // pinned (free ux + rotations)
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: p, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let buck = buckling::solve_buckling_3d(&input, 2).unwrap();

    let i_min = IY.min(IZ);
    let pcr_euler = std::f64::consts::PI.powi(2) * E_EFF * i_min / l.powi(2);
    let _pcr_fixed_pin = pcr_euler / (0.7_f64).powi(2); // k=0.7
    let pcr_3d = buck.modes[0].load_factor * p.abs();

    // Fixed-pinned should be higher than pinned-pinned
    assert!(
        pcr_3d > pcr_euler * 0.95,
        "Fixed-pinned Pcr={:.1} should exceed pinned-pinned Pcr={:.1}",
        pcr_3d, pcr_euler
    );

    // Should be approximately 2× Euler (k=0.7 → factor ≈ 2.04)
    let ratio = pcr_3d / pcr_euler;
    assert!(
        ratio > 1.5 && ratio < 2.5,
        "Fixed-pinned ratio to Euler: {:.2}, expected ≈2.04", ratio
    );
}

// ================================================================
// 4. Weak Axis Governs for Asymmetric Section
// ================================================================
//
// With Iy < Iz, buckling occurs about weak axis (Y direction movement → Iy governs).

#[test]
fn validation_3d_buckling_weak_axis_governs() {
    let l: f64 = 5.0;
    let n = 8;
    let p = -100.0;

    let iy_weak = 5e-5;  // weak axis
    let iz_strong = 5e-4; // strong axis (10× larger)

    let input = make_3d_beam(
        n, l, E, NU, A, iy_weak, iz_strong, J,
        vec![true, true, true, true, true, true], // fixed
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: p, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let buck = buckling::solve_buckling_3d(&input, 2).unwrap();
    let pcr_3d = buck.modes[0].load_factor * p.abs();

    // Weak-axis critical load
    let pcr_weak = std::f64::consts::PI.powi(2) * E_EFF * iy_weak / (4.0 * l.powi(2));
    // Strong-axis critical load
    let pcr_strong = std::f64::consts::PI.powi(2) * E_EFF * iz_strong / (4.0 * l.powi(2));

    // First mode should be weak axis (lower Pcr)
    assert!(
        pcr_weak < pcr_strong,
        "Test setup: weak < strong: {:.1} < {:.1}", pcr_weak, pcr_strong
    );

    let ratio = pcr_3d / pcr_weak;
    assert!(
        (ratio - 1.0).abs() < 0.20,
        "First mode should be weak axis: Pcr_3d={:.1}, Pcr_weak={:.1}, ratio={:.3}",
        pcr_3d, pcr_weak, ratio
    );
}

// ================================================================
// 5. Load Factor Scales as 1/L²
// ================================================================
//
// Doubling the length should reduce Pcr by factor of 4.

#[test]
fn validation_3d_buckling_length_scaling() {
    let l1: f64 = 3.0;
    let l2: f64 = 6.0;
    let n = 8;
    let p = -100.0;

    let make_col = |l: f64| -> SolverInput3D {
        make_3d_beam(
            n, l, E, NU, A, IY, IZ, J,
            vec![true, true, true, true, true, true],
            None,
            vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: n + 1, fx: p, fy: 0.0, fz: 0.0,
                mx: 0.0, my: 0.0, mz: 0.0, bw: None,
            })],
        )
    };

    let buck1 = buckling::solve_buckling_3d(&make_col(l1), 1).unwrap();
    let buck2 = buckling::solve_buckling_3d(&make_col(l2), 1).unwrap();

    let pcr1 = buck1.modes[0].load_factor * p.abs();
    let pcr2 = buck2.modes[0].load_factor * p.abs();

    // Pcr ∝ 1/L² → Pcr1/Pcr2 = (L2/L1)² = 4.0
    let ratio = pcr1 / pcr2;
    let expected = (l2 / l1).powi(2);

    assert!(
        (ratio - expected).abs() / expected < 0.15,
        "Length scaling: Pcr1/Pcr2={:.3}, expected (L2/L1)²={:.1}",
        ratio, expected
    );
}

// ================================================================
// 6. Element Buckling Data: Axial Force and Critical Force
// ================================================================
//
// Element data should report correct axial forces and critical loads.

#[test]
fn validation_3d_buckling_element_data() {
    let l: f64 = 5.0;
    let n = 4;
    let p = -100.0;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: p, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let buck = buckling::solve_buckling_3d(&input, 1).unwrap();

    // Each element should have axial force data
    assert!(
        !buck.element_data.is_empty(),
        "Should have element buckling data"
    );

    for ed in &buck.element_data {
        // Axial force should be close to applied load
        assert!(
            (ed.axial_force.abs() - p.abs()).abs() / p.abs() < 0.05,
            "Element {} axial={:.1}, expected {:.1}", ed.element_id, ed.axial_force.abs(), p.abs()
        );

        // Critical force should be positive
        assert!(
            ed.critical_force > 0.0,
            "Element {} critical force should be > 0", ed.element_id
        );

        // Effective length should be reasonable
        assert!(
            ed.effective_length > 0.0,
            "Element {} effective length should be > 0", ed.element_id
        );
    }
}

// ================================================================
// 7. Multiple Modes: Second Mode > First Mode
// ================================================================
//
// Higher buckling modes should have higher load factors.

#[test]
fn validation_3d_buckling_multiple_modes() {
    let l: f64 = 5.0;
    let n = 8;
    let p = -100.0;

    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems,
        vec![
            (1, vec![true, true, true, true, false, false]),
            (n + 1, vec![false, true, true, true, false, false]),
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: p, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let buck = buckling::solve_buckling_3d(&input, 3).unwrap();

    assert!(buck.modes.len() >= 2, "Should have at least 2 buckling modes");

    // Load factors should be in ascending order (or very close for degenerate axes)
    for i in 1..buck.modes.len() {
        assert!(
            buck.modes[i].load_factor >= buck.modes[i - 1].load_factor * 0.95,
            "Mode {} load_factor={:.3} should be ≥ mode {} load_factor={:.3}",
            i + 1, buck.modes[i].load_factor, i, buck.modes[i - 1].load_factor
        );
    }
}
