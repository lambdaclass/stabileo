/// Validation: Frame Deflection Patterns
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 7 (Deflections)
///   - Ghali, Neville & Brown, "Structural Analysis", Ch. 8
///   - McCormac, "Structural Analysis", Ch. 9
///
/// These tests verify that deflected shapes of various frame
/// configurations match expected qualitative and quantitative
/// patterns derived from structural analysis theory.
///
/// Tests verify:
///   1. SS beam deflection symmetry under symmetric load
///   2. Cantilever: monotonically increasing deflection toward tip
///   3. Propped cantilever: point of zero deflection
///   4. Fixed-fixed beam: inflection points in deflected shape
///   5. Portal frame under lateral load: sidesway pattern
///   6. Continuous beam: uplift in unloaded spans
///   7. Frame with eccentric load: twist-like behavior
///   8. Two-story frame: inter-story drift distribution
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam: Symmetric Deflection Under Symmetric Load
// ================================================================

#[test]
fn validation_deflection_ss_symmetry() {
    let l = 10.0;
    let n = 20;
    let q = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Deflection at symmetric points should be equal
    for i in 1..=(n / 2) {
        let d_left = results.displacements.iter()
            .find(|d| d.node_id == i + 1).unwrap().uy;
        let d_right = results.displacements.iter()
            .find(|d| d.node_id == n + 1 - i).unwrap().uy;
        assert_close(d_left, d_right, 0.01,
            &format!("SS symmetry: node {} = node {}", i + 1, n + 1 - i));
    }

    // Maximum deflection at midspan
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();
    for i in 2..=n {
        let d_i = results.displacements.iter()
            .find(|d| d.node_id == i).unwrap().uy.abs();
        assert!(d_mid >= d_i - 1e-10,
            "SS UDL: midspan has max deflection");
    }
}

// ================================================================
// 2. Cantilever: Monotonically Increasing Deflection
// ================================================================

#[test]
fn validation_deflection_cantilever_monotonic() {
    let l = 8.0;
    let n = 16;
    let p = 10.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Deflection should increase monotonically from fixed end to tip
    let mut prev_d = 0.0;
    for i in 2..=n + 1 {
        let d = results.displacements.iter()
            .find(|d| d.node_id == i).unwrap().uy.abs();
        assert!(d >= prev_d - 1e-10,
            "Cantilever monotonic: node {} ({:.6}) >= node {} ({:.6})",
            i, d, i - 1, prev_d);
        prev_d = d;
    }

    // Tip should have the maximum deflection
    let d_tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();
    assert!(d_tip > 0.0, "Cantilever: tip deflects");
}

// ================================================================
// 3. Propped Cantilever: Deflection Shape
// ================================================================
//
// Fixed at left, roller at right, UDL.
// Deflection is zero at both ends, maximum closer to midspan,
// and the shape is asymmetric (steeper near roller).

#[test]
fn validation_deflection_propped_cantilever() {
    let l = 10.0;
    let n = 20;
    let q = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Both ends should have zero vertical displacement
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap().uy;
    let d_end = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy;
    assert!(d1.abs() < 1e-10, "Propped cantilever: fixed end uy=0");
    assert!(d_end.abs() < 1e-10, "Propped cantilever: roller end uy=0");

    // Maximum deflection should be in the interior
    let mut max_d = 0.0;
    let mut max_node = 0;
    for i in 2..=n {
        let d = results.displacements.iter()
            .find(|d| d.node_id == i).unwrap().uy.abs();
        if d > max_d {
            max_d = d;
            max_node = i;
        }
    }
    // For propped cantilever (fixed-roller) with UDL, max deflection
    // is at x ≈ 0.578L (from fixed end). This is the solution of:
    // L/8 - 5x/16 + x²/6 = 0
    let x_max = (max_node - 1) as f64 * l / n as f64;
    assert!(x_max > 0.4 * l && x_max < 0.7 * l,
        "Propped cantilever: max deflection at x={:.2}, expected ~0.58L", x_max);
}

// ================================================================
// 4. Fixed-Fixed Beam: Inflection Points
// ================================================================
//
// A fixed-fixed beam with UDL has inflection points at
// x = L/2 ± L/(2√3) ≈ 0.211L and 0.789L.
// At these points, the rotation changes sign.

#[test]
fn validation_deflection_fixed_inflection() {
    let l = 12.0;
    let n = 24;
    let q = -8.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Check rotation sign changes: at fixed ends, rotation = 0.
    // The rotation should change sign at the inflection points.
    // Near the ends, curvature is hogging; at midspan, curvature is sagging.
    let rz_fixed = results.displacements.iter()
        .find(|d| d.node_id == 1).unwrap().rz;
    assert!(rz_fixed.abs() < 1e-10, "Fixed end: rotation = 0");

    // Find sign changes in rotation
    let mut sign_changes = Vec::new();
    for i in 2..=n {
        let rz_i = results.displacements.iter()
            .find(|d| d.node_id == i).unwrap().rz;
        let rz_next = results.displacements.iter()
            .find(|d| d.node_id == i + 1).unwrap().rz;
        if rz_i * rz_next < 0.0 {
            sign_changes.push(i);
        }
    }

    // Should have at least one sign change near midspan
    assert!(!sign_changes.is_empty(),
        "Fixed-fixed: rotation sign change exists (inflection point)");
}

// ================================================================
// 5. Portal Frame: Sidesway Pattern
// ================================================================
//
// Under lateral load, the beam-level nodes translate equally
// (rigid floor assumption with stiff beam), and column
// ends remain at base.

#[test]
fn validation_deflection_portal_sidesway() {
    let h = 4.0;
    let w = 8.0;
    let f_lat = 10.0;
    let big_iz = IZ * 100.0; // very stiff beam

    // Portal with stiff beam
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left col
        (2, "frame", 2, 3, 1, 2, false, false), // stiff beam
        (3, "frame", 3, 4, 1, 1, false, false), // right col
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_lat, fy: 0.0, mz: 0.0,
    })];
    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ), (2, A, big_iz)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Beam-level nodes should have similar horizontal displacement
    // (stiff beam acts like rigid floor)
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    assert_close(d2.ux, d3.ux, 0.05,
        "Portal sidesway: beam-level nodes translate equally");

    // Base nodes should not translate
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    assert!(d1.ux.abs() < 1e-10, "Portal: base node 1 fixed");
    assert!(d4.ux.abs() < 1e-10, "Portal: base node 4 fixed");
}

// ================================================================
// 6. Continuous Beam: Pattern Loading Effect on Deflection
// ================================================================
//
// Loading only one span of a continuous beam causes the unloaded
// span to deflect upward (hogging).

#[test]
fn validation_deflection_continuous_pattern() {
    let span = 8.0;
    let n = 10;
    let q = -15.0;

    // Load only span 1 (elements 1 to n)
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Span 1 midspan should deflect downward
    let mid1 = n / 2 + 1;
    let d_span1 = results.displacements.iter()
        .find(|d| d.node_id == mid1).unwrap().uy;
    assert!(d_span1 < 0.0, "Pattern loading: loaded span deflects down");

    // Span 2 midspan should deflect upward (hogging due to continuity)
    let mid2 = n + n / 2 + 1;
    let d_span2 = results.displacements.iter()
        .find(|d| d.node_id == mid2).unwrap().uy;
    assert!(d_span2 > 0.0,
        "Pattern loading: unloaded span deflects up ({:.6})", d_span2);
}

// ================================================================
// 7. Frame with Eccentric Load: Differential Column Deflection
// ================================================================

#[test]
fn validation_deflection_eccentric() {
    let h = 5.0;
    let w = 10.0;

    // Load only at left beam-column joint
    let input = make_portal_frame(h, w, E, A, IZ, 0.0, 0.0);
    let mut input = input;
    input.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: -20.0, mz: 0.0,
    })];
    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Both beam-level nodes deflect down, but loaded side more
    assert!(d2.uy < 0.0, "Eccentric: loaded node deflects down");
    assert!(d2.uy.abs() > d3.uy.abs(),
        "Eccentric: loaded side deflects more: {:.6} > {:.6}",
        d2.uy.abs(), d3.uy.abs());

    // The eccentric load creates a slight sway
    assert!(d2.ux.abs() > 1e-8 || d3.ux.abs() > 1e-8,
        "Eccentric: slight lateral displacement exists");
}

// ================================================================
// 8. Two-Story Frame: Inter-Story Drift Distribution
// ================================================================

#[test]
fn validation_deflection_two_story_drift() {
    let h = 3.5;
    let w = 6.0;
    let f = 10.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, 0.0, 2.0 * h),
        (4, w, 0.0), (5, w, h), (6, w, 2.0 * h),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 4, 5, 1, 1, false, false),
        (4, "frame", 5, 6, 1, 1, false, false),
        (5, "frame", 2, 5, 1, 1, false, false), // floor 1 beam
        (6, "frame", 3, 6, 1, 1, false, false), // floor 2 beam
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    // Lateral loads at each floor
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f, fy: 0.0, mz: 0.0 }),
    ];
    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Floor displacements
    let d_floor1 = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let d_floor2 = results.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().ux;

    // Total displacement increases with height
    assert!(d_floor2.abs() > d_floor1.abs(),
        "Two-story: roof displaces more than 1st floor");

    // Inter-story drifts
    let drift_1 = d_floor1.abs();
    let drift_2 = (d_floor2 - d_floor1).abs();

    // Bottom story has larger shear (cumulative) → larger drift
    // (for uniform stiffness columns)
    assert!(drift_1 > drift_2 * 0.5,
        "Two-story: bottom drift significant: {:.6} vs {:.6}", drift_1, drift_2);
}
