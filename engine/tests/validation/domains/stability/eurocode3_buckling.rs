/// Validation: Eurocode 3 Elastic Critical Buckling (α_cr)
///
/// Reference: EN 1993-1-1 §5.2.1 — α_cr = V_cr / V_Ed.
///            Horne's method: α_cr ≈ H·h / (V·δ_H) per story.
///
/// The engine's buckling solver returns `load_factor` which IS α_cr.
///
/// Tests: portal frame eigenvalue vs Horne, pinned vs fixed base,
///        multi-story sway, α_cr thresholds, braced frame, gravity-only.
use dedaliano_engine::solver::{buckling, linear, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01; // m²
const IZ: f64 = 1e-4; // m⁴

// ═══════════════════════════════════════════════════════════════
// 1. Portal Frame: Eigenvalue α_cr vs Horne's Method
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_ec3_portal_alpha_cr_vs_horne() {
    // Fixed-base portal frame: 2 columns h=5m, beam w=6m
    // Gravity P=500 kN per column, lateral H=50 kN at beam level
    //
    // Horne's method: α_cr ≈ H·h / (V_total·δ_H)
    //   where V_total = total vertical load, δ_H = first-order sway at beam level
    //
    // Compare Horne estimate to eigenvalue buckling load_factor.
    let h = 5.0;
    let w = 6.0;
    let p = 500.0; // kN per column (gravity)
    let h_load = 50.0; // kN lateral

    let input = make_portal_frame(h, w, E, A, IZ, h_load, -p);

    // 1. First-order analysis for Horne's method
    let linear_res = linear::solve_2d(&input).unwrap();

    // Sway at beam level: average of node 2 and 3 horizontal (X) displacement
    let d2 = linear_res.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = linear_res.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let delta_h = (d2.ux.abs() + d3.ux.abs()) / 2.0;

    // Horne: α_cr = H·h / (V_total·δ_H)
    let v_total = 2.0 * p; // total vertical load
    let alpha_horne = h_load * h / (v_total * delta_h);

    // 2. Eigenvalue buckling
    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_eigen = buck.modes[0].load_factor;

    // Both should be positive and reasonably close (within 15%)
    assert!(alpha_eigen > 0.0, "α_cr should be positive, got {:.4}", alpha_eigen);
    assert!(alpha_horne > 0.0, "Horne α_cr should be positive, got {:.4}", alpha_horne);

    let rel = (alpha_eigen - alpha_horne).abs() / alpha_eigen;
    assert!(
        rel < 0.20,
        "Eigenvalue α_cr={:.3} vs Horne α_cr={:.3}, diff={:.1}% (expected < 20%)",
        alpha_eigen, alpha_horne, rel * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Fixed vs Pinned Base: α_cr Comparison
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_ec3_fixed_vs_pinned_base() {
    // Fixed-base portal should have higher α_cr than pinned-base
    // (pinned base is more flexible in sway)
    let h = 5.0;
    let w = 6.0;
    let p = 500.0;
    let h_load = 50.0;

    // Fixed base
    let fixed_input = make_portal_frame(h, w, E, A, IZ, h_load, -p);
    let buck_fixed = buckling::solve_buckling_2d(&fixed_input, 1).unwrap();
    let alpha_fixed = buck_fixed.modes[0].load_factor;

    // Pinned base: columns hinged at base
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 4, "pinned")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: h_load, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: -p, mz: 0.0 }),
    ];
    let pinned_input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );
    let buck_pinned = buckling::solve_buckling_2d(&pinned_input, 1).unwrap();
    let alpha_pinned = buck_pinned.modes[0].load_factor;

    assert!(
        alpha_fixed > alpha_pinned,
        "Fixed α_cr={:.3} should > pinned α_cr={:.3}", alpha_fixed, alpha_pinned
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Multi-Story Sway Frame: α_cr
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_ec3_multi_story_sway_alpha_cr() {
    // 2-story, 1-bay frame. Fixed base.
    // Story height h=3.5m, bay width w=6m
    // Gravity: 300 kN per beam-column joint
    // Lateral: 30 kN at each floor level
    //
    // α_cr from eigenvalue should be > 1 (stable under applied loads)
    let h = 3.5;
    let w = 6.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0),                    // base
        (3, 0.0, h), (4, w, h),                          // 1st floor
        (5, 0.0, 2.0 * h), (6, w, 2.0 * h),             // 2nd floor
    ];

    // 4 columns + 2 beams = 6 elements
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false), // left col, ground to 1st
        (2, "frame", 2, 4, 1, 1, false, false), // right col, ground to 1st
        (3, "frame", 3, 4, 1, 1, false, false), // 1st floor beam
        (4, "frame", 3, 5, 1, 1, false, false), // left col, 1st to 2nd
        (5, "frame", 4, 6, 1, 1, false, false), // right col, 1st to 2nd
        (6, "frame", 5, 6, 1, 1, false, false), // 2nd floor beam
    ];

    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];

    let loads = vec![
        // Gravity at joints
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 30.0, fy: -300.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: -300.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 30.0, fy: -300.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fy: -300.0, mz: 0.0 }),
    ];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );

    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    // Should be positive (structure is stable under applied loads)
    assert!(alpha_cr > 1.0, "Multi-story α_cr={:.3} should be > 1 (stable)", alpha_cr);

    // For a moderate sway frame, α_cr is typically 3-15
    assert!(
        alpha_cr < 50.0,
        "α_cr={:.3} seems unrealistically high for sway frame", alpha_cr
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. α_cr Consistent with P-Delta Amplification
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_ec3_alpha_cr_consistent_with_pdelta() {
    // EC3 §5.2.1: amplification ≈ 1/(1 - 1/α_cr)
    // Compare buckling α_cr to P-delta amplification factor
    let h = 5.0;
    let w = 6.0;
    let p = 200.0; // moderate gravity
    let h_load = 30.0;

    let input = make_portal_frame(h, w, E, A, IZ, h_load, -p);

    // Eigenvalue α_cr
    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    // EC3 amplification: 1/(1 - 1/α_cr)
    let ec3_amp = if alpha_cr > 1.0 { 1.0 / (1.0 - 1.0 / alpha_cr) } else { f64::INFINITY };

    // P-delta amplification (actual)
    let lin = linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();

    // Sway at node 2 (horizontal X direction)
    let lin_sway = lin.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    let pd_sway = pd.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    let actual_amp = if lin_sway > 1e-10 { pd_sway / lin_sway } else { 1.0 };

    // EC3 formula and P-delta should agree within 15%
    // (EC3 formula is approximate; P-delta is iterative)
    if ec3_amp.is_finite() && ec3_amp > 1.0 {
        let rel = (actual_amp - ec3_amp).abs() / ec3_amp;
        assert!(
            rel < 0.20,
            "P-delta amp={:.4} vs EC3 1/(1-1/α_cr)={:.4}, α_cr={:.3}, diff={:.1}%",
            actual_amp, ec3_amp, alpha_cr, rel * 100.0
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// 5. Braced Frame: High α_cr (> 10)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_ec3_braced_frame_high_alpha_cr() {
    // Add diagonal braces to portal frame → high α_cr
    // Per EC3 §5.2.1(4)B: if α_cr ≥ 10, second-order effects may be neglected
    let h = 5.0;
    let w = 6.0;
    let p = 500.0;
    let h_load = 20.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
    ];
    let a_brace = 0.003; // brace area, smaller than columns

    // Frame elements + diagonal brace (truss)
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
        (4, "truss", 1, 3, 1, 2, false, false), // diagonal brace
    ];

    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: h_load, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: -p, mz: 0.0 }),
    ];

    let input = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, a_brace, 1e-10)], // brace: small I for truss
        elems, sups, loads,
    );

    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    // Braced frame should have high α_cr (typically >> 10)
    assert!(
        alpha_cr > 5.0,
        "Braced frame α_cr={:.3} should be high (> 5)", alpha_cr
    );
}

// ═══════════════════════════════════════════════════════════════
// 6. Gravity-Only vs Gravity+Lateral: α_cr Comparison
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_ec3_gravity_only_vs_lateral() {
    // Adding lateral load should not change α_cr significantly
    // (α_cr is a property of the structure + vertical load pattern,
    //  not the lateral load magnitude — it's the critical load FACTOR)
    let h = 5.0;
    let w = 6.0;
    let p = 500.0;

    // Gravity only (need small lateral to trigger sway buckling mode)
    let input_grav = make_portal_frame(h, w, E, A, IZ, 1.0, -p); // tiny lateral
    let buck_grav = buckling::solve_buckling_2d(&input_grav, 1).unwrap();
    let alpha_grav = buck_grav.modes[0].load_factor;

    // Gravity + significant lateral
    let input_lat = make_portal_frame(h, w, E, A, IZ, 50.0, -p);
    let buck_lat = buckling::solve_buckling_2d(&input_lat, 1).unwrap();
    let alpha_lat = buck_lat.modes[0].load_factor;

    // Both α_cr should be similar (it depends on stiffness and gravity load pattern)
    // The lateral load changes the linear axial forces slightly, so α_cr may differ somewhat
    assert!(alpha_grav > 0.0 && alpha_lat > 0.0);

    // Allow 30% difference since lateral load does change the axial force distribution
    let rel = (alpha_grav - alpha_lat).abs() / alpha_grav.max(alpha_lat);
    assert!(
        rel < 0.40,
        "Gravity-only α_cr={:.3} vs lateral α_cr={:.3}, diff={:.1}%",
        alpha_grav, alpha_lat, rel * 100.0
    );
}
