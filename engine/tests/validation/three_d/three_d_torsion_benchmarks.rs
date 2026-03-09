/// Validation: 3D Torsion and Combined Loading Benchmarks
///
/// References:
///   - Timoshenko & Goodier, "Theory of Elasticity"
///   - Przemieniecki, "Theory of Matrix Structural Analysis"
///   - Roark's Formulas for Stress and Strain, 9th Ed.
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed.
///
/// Tests:
///   1. Cantilever pure torsion: θ = TL/(GJ)
///   2. Fixed-fixed torsion: T at midspan, each support takes T/2
///   3. Combined bending + torsion: superposition principle
///   4. Space grid: torsional equilibrium at joint
///   5. Torsion stiffness scales with 1/L
///   6. Cantilever combined: axial + bending + torsion
///   7. Two-span beam torsion: intermediate support reaction
///   8. Frame torsional equilibrium: ΣM_x = 0
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 2e-4;
const J: f64 = 1.5e-4;

// ================================================================
// 1. Cantilever Pure Torsion: θ = TL/(GJ)
// ================================================================
//
// Fixed at one end, torque T at free end.
// Angle of twist: θ_tip = T·L / (G·J)

#[test]
fn validation_3d_torsion_cantilever_pure() {
    let l: f64 = 4.0;
    let n = 4;
    let t = 10.0; // kN·m torque about X-axis
    let g = E * 1000.0 / (2.0 * (1.0 + NU)); // shear modulus

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // θ_x = T·L/(G·J)
    let theta_exact = t * l / (g * J);
    let error = (tip.rx.abs() - theta_exact).abs() / theta_exact;
    assert!(error < 0.05,
        "Pure torsion: θ_x={:.6e}, exact TL/(GJ)={:.6e}, err={:.1}%",
        tip.rx.abs(), theta_exact, error * 100.0);
}

// ================================================================
// 2. Fixed-Fixed Beam Torsion: Each End Reacts T/2
// ================================================================
//
// Both ends fully fixed, torque T applied at midspan.
// By symmetry, each support resists T/2.

#[test]
fn validation_3d_torsion_fixed_fixed_midspan() {
    let l: f64 = 6.0;
    let n = 8;
    let t = 20.0;
    let mid = n / 2 + 1;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed start
        Some(vec![true, true, true, true, true, true]), // fixed end
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: mid, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();

    // Sum of torsional reactions should equal applied torque
    let sum_mx: f64 = results.reactions.iter().map(|r| r.mx).sum();
    let eq_err = (sum_mx + t).abs() / t;
    assert!(eq_err < 0.01,
        "Torsion equilibrium: ΣMx={:.4}, applied T={:.4}", sum_mx, t);

    // By symmetry, each reaction should be ≈ -T/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let err_sym = (r1.mx.abs() - r2.mx.abs()).abs() / (t / 2.0);
    assert!(err_sym < 0.02,
        "Torsion symmetry: Mx1={:.4}, Mx2={:.4}", r1.mx, r2.mx);

    let err_half = (r1.mx.abs() - t / 2.0).abs() / (t / 2.0);
    assert!(err_half < 0.02,
        "Each reaction ≈ T/2: Mx1={:.4}, expected {:.4}", r1.mx.abs(), t / 2.0);
}

// ================================================================
// 3. Combined Bending + Torsion: Superposition
// ================================================================
//
// Verify that combined torsion + bending produces same result as
// sum of individual load cases.

#[test]
fn validation_3d_torsion_bending_superposition() {
    let l: f64 = 5.0;
    let n = 6;
    let t = 10.0;
    let fz = -15.0;

    let fixed = vec![true, true, true, true, true, true];

    // Torsion only
    let input_t = make_3d_beam(n, l, E, NU, A, IY, IZ, J,
        fixed.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })]);
    let res_t = linear::solve_3d(&input_t).unwrap();
    let tip_t = res_t.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Bending only (Z load)
    let input_b = make_3d_beam(n, l, E, NU, A, IY, IZ, J,
        fixed.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);
    let res_b = linear::solve_3d(&input_b).unwrap();
    let tip_b = res_b.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Combined
    let input_c = make_3d_beam(n, l, E, NU, A, IY, IZ, J,
        fixed.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })]);
    let res_c = linear::solve_3d(&input_c).unwrap();
    let tip_c = res_c.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Superposition check
    let check = |name: &str, combined: f64, sum: f64| {
        let denom = combined.abs().max(1e-12);
        let err = (combined - sum).abs() / denom;
        assert!(err < 0.01,
            "Superposition {}: combined={:.6e}, sum={:.6e}, err={:.2}%",
            name, combined, sum, err * 100.0);
    };

    check("uz", tip_c.uz, tip_t.uz + tip_b.uz);
    check("rx", tip_c.rx, tip_t.rx + tip_b.rx);
    check("ry", tip_c.ry, tip_t.ry + tip_b.ry);
}

// ================================================================
// 4. Space Grid: Joint Torsional Equilibrium
// ================================================================
//
// L-shaped grid: two beams meeting at a right angle in the XZ plane.
// Beam 1 along X, beam 2 along Z. Load on beam 2 induces torsion in beam 1.
// Global equilibrium must hold: ΣR = applied load.

#[test]
fn validation_3d_torsion_grid_equilibrium() {
    let span = 4.0;
    let p = 10.0;

    // Cantilever L-grid: beam 1 along X, beam 2 along Z, load at free tip.
    // No support at tip — load must travel through junction to fixed support.
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, span, 0.0, 0.0),  // junction
        (3, span, 0.0, span), // free tip of second beam
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),  // fixed only at node 1
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Global Y equilibrium: ΣRy = P (only node 1 has support)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let err = (r1.fy - p).abs() / p;
    assert!(err < 0.01,
        "Grid equilibrium: Ry_1={:.4}, P={:.4}, err={:.2}%", r1.fy, p, err * 100.0);

    // Node 1 (fixed) must resist moment — beam 2 bending transfers through junction
    let max_moment = r1.mx.abs().max(r1.my.abs()).max(r1.mz.abs());
    assert!(max_moment > 0.01,
        "Fixed support should resist moment: Mx={:.6}, My={:.6}, Mz={:.6}",
        r1.mx, r1.my, r1.mz);
}

// ================================================================
// 5. Torsion Stiffness Scales with 1/L
// ================================================================
//
// k_t = GJ/L. Doubling length halves torsional stiffness.

#[test]
fn validation_3d_torsion_stiffness_scaling() {
    let l1: f64 = 3.0;
    let l2: f64 = 6.0;
    let n = 4;
    let t = 10.0;

    let fixed = vec![true, true, true, true, true, true];

    let make_torsion = |l: f64| -> SolverInput3D {
        make_3d_beam(n, l, E, NU, A, IY, IZ, J,
            fixed.clone(), None,
            vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
                mx: t, my: 0.0, mz: 0.0, bw: None,
            })])
    };

    let res1 = linear::solve_3d(&make_torsion(l1)).unwrap();
    let res2 = linear::solve_3d(&make_torsion(l2)).unwrap();

    let theta1 = res1.displacements.iter().find(|d| d.node_id == n + 1).unwrap().rx.abs();
    let theta2 = res2.displacements.iter().find(|d| d.node_id == n + 1).unwrap().rx.abs();

    // θ = TL/(GJ), so θ₂/θ₁ = L₂/L₁ = 2
    let ratio = theta2 / theta1;
    let expected = l2 / l1;
    let error = (ratio - expected).abs() / expected;
    assert!(error < 0.05,
        "Torsion scaling: θ₂/θ₁={:.3}, expected L₂/L₁={:.1}, err={:.1}%",
        ratio, expected, error * 100.0);
}

// ================================================================
// 6. Cantilever Combined: Axial + Bending + Torsion
// ================================================================
//
// All three load types simultaneously. Verify each displacement
// component matches its individual analytical solution.

#[test]
fn validation_3d_torsion_combined_all_three() {
    let l: f64 = 4.0;
    let n = 8;
    let fx = 50.0;    // axial
    let fz = -10.0;   // bending in Z
    let mx = 5.0;     // torsion
    let e_eff = E * 1000.0;
    let g = e_eff / (2.0 * (1.0 + NU));

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx, fy: 0.0, fz,
            mx, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Axial: δx = FL/(EA)
    let ux_exact = fx * l / (e_eff * A);
    let err_ux = (tip.ux.abs() - ux_exact).abs() / ux_exact;
    assert!(err_ux < 0.05,
        "Axial: ux={:.6e}, exact={:.6e}, err={:.1}%", tip.ux.abs(), ux_exact, err_ux * 100.0);

    // Bending: δz = FL³/(3EIy)
    let uz_exact = fz.abs() * l.powi(3) / (3.0 * e_eff * IY);
    let err_uz = (tip.uz.abs() - uz_exact).abs() / uz_exact;
    assert!(err_uz < 0.05,
        "Bending: uz={:.6e}, exact={:.6e}, err={:.1}%", tip.uz.abs(), uz_exact, err_uz * 100.0);

    // Torsion: θx = TL/(GJ)
    let rx_exact = mx * l / (g * J);
    let err_rx = (tip.rx.abs() - rx_exact).abs() / rx_exact;
    assert!(err_rx < 0.05,
        "Torsion: θx={:.6e}, exact={:.6e}, err={:.1}%", tip.rx.abs(), rx_exact, err_rx * 100.0);
}

// ================================================================
// 7. Two-Span Beam Under Torsion
// ================================================================
//
// Continuous beam: fixed-roller-roller, torsion at free end.
// Interior support should not resist torsion if only translational (uy fixed).

#[test]
fn validation_3d_torsion_two_span() {
    let l: f64 = 4.0;
    let n = 4;
    let t = 10.0;

    let nodes: Vec<_> = (0..=(2 * n)).map(|i| (i + 1, i as f64 * l / n as f64, 0.0, 0.0)).collect();
    let elems: Vec<_> = (0..(2 * n)).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();

    let sups = vec![
        (1, vec![true, true, true, true, true, true]),       // fixed at start
        (n + 1, vec![false, true, true, false, false, false]), // roller at mid-support (uy, uz only)
        (2 * n + 1, vec![false, true, true, false, false, false]), // roller at end
    ];

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2 * n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
        mx: t, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Fixed end should carry all torsional reaction
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let err = (r1.mx.abs() - t).abs() / t;
    assert!(err < 0.05,
        "Fixed end torsion: Mx={:.4}, expected T={:.4}", r1.mx.abs(), t);
}

// ================================================================
// 8. 3D Portal Frame Torsional Equilibrium
// ================================================================
//
// Portal frame in XZ plane with torque applied at beam-column joint.
// Verify global moment equilibrium.

#[test]
fn validation_3d_torsion_portal_equilibrium() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let t = 15.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, 0.0, h),
        (3, w, 0.0, h),
        (4, w, 0.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
        (3, "frame", 3, 4, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (4, vec![true, true, true, true, true, true]),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: 0.0, fz: 0.0,
        mx: t, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Global torsion equilibrium: ΣMx_reactions = -T (opposing applied)
    let sum_mx: f64 = results.reactions.iter().map(|r| r.mx).sum();
    let eq_err = (sum_mx + t).abs() / t;
    assert!(eq_err < 0.01,
        "Portal torsion equilibrium: ΣMx={:.4}, applied T={:.4}", sum_mx, t);

    // Both supports should resist some torsion
    for r in &results.reactions {
        assert!(r.mx.abs() > 0.01,
            "Node {} should resist torsion: Mx={:.6}", r.node_id, r.mx);
    }
}
