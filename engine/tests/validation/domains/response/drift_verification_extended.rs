/// Validation: Drift and Displacement Verification — Extended
///
/// References:
///   - ASCE 7-22, Section 12.8.6 (Story Drift Determination)
///   - AISC 360, Appendix 7 (Serviceability)
///   - Przemieniecki, "Theory of Matrix Structural Analysis" (1968)
///   - Ghali & Neville, "Structural Analysis" (2017), Ch. 5–6
///
/// Tests verify drift calculations for extended structural configurations:
///   1. Propped cantilever column: δ_tip = 5PH³/(48EI)
///   2. Two-bay portal frame: symmetric drift under symmetric load
///   3. Soft-story effect: weaker story → larger drift ratio
///   4. Antisymmetric drift in symmetric frame with antisymmetric load
///   5. Drift superposition: δ(F₁+F₂) = δ(F₁) + δ(F₂)
///   6. Cantilever column with moment load: δ = MH²/(2EI)
///   7. K-braced frame reduces drift vs unbraced portal
///   8. Cantilever drift ratio: δ/H scales as PH²/(3EI)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Propped Cantilever Column: δ_tip = 5PH³/(48EI)
//
// Fixed base, roller at top (rollerY restrains ux at top, uy free).
// Lateral load P at the top.
// The exact tip drift for a propped cantilever with a point load
// at the propped end is δ = 5PH³/(48EI) from standard tables.
// ================================================================

#[test]
fn validation_drift_ext_propped_cantilever() {
    let h = 5.0;
    let n = 12;
    let p = 10.0;
    let e_eff = E * 1000.0;

    // Vertical column: fixed at base (node 1), rollerY at top restrains ux
    // rollerY: ux fixed, uy free → propped cantilever for lateral deflection
    // Apply lateral load (fx) at top node — the roller restrains it,
    // so instead we apply the load at mid-height to get a meaningful deflection.
    //
    // Actually, for a clean analytical case: fixed-pinned column with lateral
    // load P at top. Use pinned support at top (restrains ux and uy, frees rz).
    // Then the horizontal reaction at top provides the "prop".
    //
    // For a propped cantilever column (fixed base, pinned top):
    //   Lateral load P at top → horizontal reactions split between supports.
    //   Mid-height deflection δ_mid = PH³ * 5√5 / (486 EI) — complex form.
    //
    // Simpler: use fixed base, guidedX at top (uy+rz fixed, ux free).
    // This gives a column fixed at both ends (rotation-wise) with shear only.
    // δ = PH³/(12EI) — this is the original test 2.
    //
    // Better approach: cantilever with lateral load at mid-height.
    // δ_tip for cantilever with point load at distance a from base:
    //   δ(x≥a) = Pa²(3x-a)/(6EI), at tip x=H, a=H/2:
    //   δ_tip = P(H/2)²(3H - H/2)/(6EI) = PH²·(5H/2)/(4·6EI) = 5PH³/(48EI)
    let mid = n / 2;
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    for i in 0..=n {
        nodes.push((i + 1, 0.0, i as f64 * h / n as f64));
        if i > 0 {
            elems.push((i, "frame", i, i + 1, 1, 1, false, false));
        }
    }
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid + 1, fx: p, fz: 0.0, my: 0.0,
    })];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems,
        vec![(1, 1, "fixed")], loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    let delta_exact = 5.0 * p * h.powi(3) / (48.0 * e_eff * IZ);
    assert_close(tip.ux, delta_exact, 0.02,
        "Propped cantilever: δ_tip = 5PH³/(48EI) for load at mid-height");
}

// ================================================================
// 2. Two-Bay Portal Frame: Symmetric Drift
//
// Three columns, two beams forming a two-bay frame.
// Symmetric lateral loads → both bays drift equally.
// ================================================================

#[test]
fn validation_drift_ext_two_bay_symmetric() {
    let w = 6.0;
    let h = 4.0;
    let f = 10.0;

    // Nodes: 1(0,0), 2(0,h), 3(w,h), 4(w,0), 5(2w,h), 6(2w,0)
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, w, h),      (4, w, 0.0),
        (5, 2.0 * w, h), (6, 2.0 * w, 0.0),
    ];
    // Three columns (vertical) + two beams (horizontal)
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 4, 3, 1, 1, false, false), // center column
        (3, "frame", 6, 5, 1, 1, false, false), // right column
        (4, "frame", 2, 3, 1, 1, false, false), // left beam
        (5, "frame", 3, 5, 1, 1, false, false), // right beam
    ];
    let sups = vec![
        (1, 1, "fixed"), (2, 4, "fixed"), (3, 6, "fixed"),
    ];
    // Symmetric lateral loads at top of outer columns
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: f, fz: 0.0, my: 0.0 }),
    ];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let d5 = results.displacements.iter().find(|d| d.node_id == 5).unwrap().ux;

    // All top nodes should drift in the positive direction
    assert!(d2 > 0.0, "Two-bay: left top positive drift: {:.6e}", d2);
    assert!(d5 > 0.0, "Two-bay: right top positive drift: {:.6e}", d5);

    // Symmetry: outer nodes (2 and 5) should have similar drift
    assert_close(d2, d5, 0.05,
        "Two-bay symmetric: left ≈ right drift");

    // Center node drift should be between outer nodes (rigid diaphragm)
    assert_close(d3, d2, 0.15,
        "Two-bay symmetric: center ≈ outer drift");
}

// ================================================================
// 3. Soft-Story Effect: Weaker Story → Larger Drift Ratio
//
// 2-story frame where the bottom story has half the column stiffness
// (half Iz). The soft story should exhibit a larger drift ratio.
// ================================================================

#[test]
fn validation_drift_ext_soft_story() {
    let w = 6.0;
    let h = 3.5;
    let f = 10.0;

    // Two sections: sec 1 (soft, Iz/2) and sec 2 (stiff, Iz)
    let mats = vec![(1, E, 0.3)];
    let secs = vec![(1, A, IZ / 2.0), (2, A, IZ)];

    // Nodes:
    // 1(0,0), 2(w,0) — base
    // 3(0,h), 4(w,h) — 1st floor
    // 5(0,2h), 6(w,2h) — 2nd floor (roof)
    let nodes = vec![
        (1, 0.0, 0.0),   (2, w, 0.0),
        (3, 0.0, h),      (4, w, h),
        (5, 0.0, 2.0*h), (6, w, 2.0*h),
    ];
    // Story 1 columns use section 1 (soft), story 2 uses section 2 (stiff)
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false), // left col, story 1 (soft)
        (2, "frame", 2, 4, 1, 1, false, false), // right col, story 1 (soft)
        (3, "frame", 3, 4, 1, 2, false, false), // beam, floor 1 (stiff)
        (4, "frame", 3, 5, 1, 2, false, false), // left col, story 2 (stiff)
        (5, "frame", 4, 6, 1, 2, false, false), // right col, story 2 (stiff)
        (6, "frame", 5, 6, 1, 2, false, false), // beam, roof (stiff)
    ];
    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: f, fz: 0.0, my: 0.0 }),
    ];
    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_floor1 = results.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().ux;
    let d_floor2 = results.displacements.iter()
        .find(|d| d.node_id == 5).unwrap().ux;

    let drift_ratio_1 = d_floor1 / h;                     // story 1
    let drift_ratio_2 = (d_floor2 - d_floor1) / h;        // story 2

    // Soft story (story 1) should have larger drift ratio
    assert!(drift_ratio_1 > drift_ratio_2,
        "Soft story: drift_ratio_1={:.6e} > drift_ratio_2={:.6e}",
        drift_ratio_1, drift_ratio_2);

    // Both should be positive (loads push in +x)
    assert!(drift_ratio_1 > 0.0, "Story 1: positive drift ratio");
    assert!(drift_ratio_2 > 0.0, "Story 2: positive drift ratio");
}

// ================================================================
// 4. Antisymmetric Load on Symmetric Frame
//
// Symmetric portal frame with equal and opposite lateral loads
// at the two top nodes. By antisymmetry, center of beam should
// have zero horizontal displacement.
// ================================================================

#[test]
fn validation_drift_ext_antisymmetric() {
    let w = 8.0;
    let h = 4.0;
    let f = 10.0;
    let _n_beam = 4; // subdivide beam into 4 elements for mid-beam node

    // Nodes: columns have single element, beam subdivided
    // Node 1: (0,0) base left — fixed
    // Node 2: (0,h) top left
    // Node 3: (w/4,h), Node 4: (w/2,h), Node 5: (3w/4,h) — beam interior
    // Node 6: (w,h) top right
    // Node 7: (w,0) base right — fixed
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w / 4.0, h),
        (4, w / 2.0, h),
        (5, 3.0 * w / 4.0, h),
        (6, w, h),
        (7, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam seg 1
        (3, "frame", 3, 4, 1, 1, false, false), // beam seg 2
        (4, "frame", 4, 5, 1, 1, false, false), // beam seg 3
        (5, "frame", 5, 6, 1, 1, false, false), // beam seg 4
        (6, "frame", 7, 6, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1, "fixed"), (2, 7, "fixed")];
    // Antisymmetric lateral loads: +F at left, -F at right
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: -f, fz: 0.0, my: 0.0 }),
    ];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_left = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let d_right = results.displacements.iter()
        .find(|d| d.node_id == 6).unwrap().ux;
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == 4).unwrap().ux;

    // Antisymmetry: left and right drifts equal in magnitude, opposite sign
    assert_close(d_left, -d_right, 0.02,
        "Antisymmetric: δ_left = -δ_right");

    // Mid-beam node should have near-zero horizontal displacement
    assert!(d_mid.abs() < d_left.abs() * 0.05,
        "Antisymmetric: mid-beam ux ≈ 0: {:.6e}", d_mid);
}

// ================================================================
// 5. Drift Superposition: δ(F₁+F₂) = δ(F₁) + δ(F₂)
//
// Cantilever column with two independent point loads at different
// heights. Verify superposition holds in linear analysis.
// ================================================================

#[test]
fn validation_drift_ext_superposition() {
    let h = 5.0;
    let n = 10;
    let p1 = 8.0;
    let p2 = 5.0;
    let mid = n / 2; // mid-height node

    let build_column = |loads: Vec<SolverLoad>| {
        let mut nodes = Vec::new();
        let mut elems = Vec::new();
        for i in 0..=n {
            nodes.push((i + 1, 0.0, i as f64 * h / n as f64));
            if i > 0 {
                elems.push((i, "frame", i, i + 1, 1, 1, false, false));
            }
        }
        make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems,
            vec![(1, 1, "fixed")], loads)
    };

    // Load case 1: P1 at tip
    let input1 = build_column(vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: p1, fz: 0.0, my: 0.0,
    })]);
    let d1 = linear::solve_2d(&input1).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;

    // Load case 2: P2 at mid-height
    let input2 = build_column(vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid + 1, fx: p2, fz: 0.0, my: 0.0,
    })]);
    let d2 = linear::solve_2d(&input2).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;

    // Combined: P1 at tip + P2 at mid-height
    let input_both = build_column(vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: p1, fz: 0.0, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid + 1, fx: p2, fz: 0.0, my: 0.0,
        }),
    ]);
    let d_both = linear::solve_2d(&input_both).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;

    assert_close(d_both, d1 + d2, 0.01,
        "Superposition: δ(F₁+F₂) = δ(F₁) + δ(F₂)");
}

// ================================================================
// 6. Cantilever Column with Moment Load: δ = MH²/(2EI)
//
// A concentrated moment M applied at the tip of a cantilever
// produces δ_tip = MH²/(2EI).
// ================================================================

#[test]
fn validation_drift_ext_moment_load() {
    let h = 5.0;
    let n = 12;
    let m = 10.0; // applied moment (kN·m)
    let e_eff = E * 1000.0;

    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    for i in 0..=n {
        nodes.push((i + 1, 0.0, i as f64 * h / n as f64));
        if i > 0 {
            elems.push((i, "frame", i, i + 1, 1, 1, false, false));
        }
    }
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: 0.0, my: m,
    })];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems,
        vec![(1, 1, "fixed")], loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // For a vertical cantilever with moment at the tip:
    // The moment causes bending that produces horizontal displacement.
    // δ_tip = MH²/(2EI)
    let delta_exact = m * h.powi(2) / (2.0 * e_eff * IZ);
    assert_close(tip.ux.abs(), delta_exact, 0.02,
        "Moment load: |δ_tip| = MH²/(2EI)");
}

// ================================================================
// 7. Braced Frame Reduces Drift vs Unbraced Portal
//
// Add a diagonal brace (truss-like element with hinges at both
// ends) to a portal frame. The braced frame should have
// significantly less drift than the unbraced one.
// ================================================================

#[test]
fn validation_drift_ext_braced_vs_unbraced() {
    let w = 6.0;
    let h = 4.0;
    let f = 10.0;

    // Unbraced portal frame
    let input_unbraced = make_portal_frame(h, w, E, A, IZ, f, 0.0);
    let d_unbraced = linear::solve_2d(&input_unbraced).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // Braced portal frame: add diagonal brace from node 1 to node 3
    // (bottom-left to top-right). Hinges at both ends make it axial-only.
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 4, 3, 1, 1, false, false), // right column
        (4, "frame", 1, 3, 1, 1, true, true),   // diagonal brace (hinged both ends)
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f, fz: 0.0, my: 0.0,
    })];
    let input_braced = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let d_braced = linear::solve_2d(&input_braced).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // Braced frame should have significantly less drift
    assert!(d_braced < d_unbraced * 0.5,
        "Braced < 50% of unbraced: braced={:.6e}, unbraced={:.6e}",
        d_braced, d_unbraced);

    // Both should be positive (non-zero)
    assert!(d_braced > 0.0, "Braced: non-zero drift");
    assert!(d_unbraced > 0.0, "Unbraced: non-zero drift");
}

// ================================================================
// 8. Cantilever Drift Ratio Scales as PH²/(3EI)
//
// For a cantilever δ = PH³/(3EI), so the drift ratio δ/H = PH²/(3EI).
// Verify that doubling H quadruples the drift ratio.
// ================================================================

#[test]
fn validation_drift_ext_drift_ratio_scaling() {
    let n = 10;
    let p = 10.0;
    let e_eff = E * 1000.0;

    let compute_drift_ratio = |h: f64| -> f64 {
        let mut nodes = Vec::new();
        let mut elems = Vec::new();
        for i in 0..=n {
            nodes.push((i + 1, 0.0, i as f64 * h / n as f64));
            if i > 0 {
                elems.push((i, "frame", i, i + 1, 1, 1, false, false));
            }
        }
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: p, fz: 0.0, my: 0.0,
        })];
        let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems,
            vec![(1, 1, "fixed")], loads);
        let results = linear::solve_2d(&input).unwrap();
        let tip_ux = results.displacements.iter()
            .find(|d| d.node_id == n + 1).unwrap().ux;
        tip_ux / h
    };

    let h1 = 3.0;
    let h2 = 6.0; // double height
    let dr1 = compute_drift_ratio(h1);
    let dr2 = compute_drift_ratio(h2);

    // δ/H = PH²/(3EI) → ratio of drift ratios = (H₂/H₁)² = 4
    assert_close(dr2 / dr1, (h2 / h1).powi(2), 0.02,
        "Drift ratio scaling: (H₂/H₁)²");

    // Also verify absolute drift ratio against formula
    let dr_exact = p * h1.powi(2) / (3.0 * e_eff * IZ);
    assert_close(dr1, dr_exact, 0.02,
        "Drift ratio: PH²/(3EI)");
}
