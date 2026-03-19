/// Validation: Connection Mechanics Extended (Solver-Based Verification)
///
/// References:
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed.
///   - Hibbeler, "Structural Analysis", 10th Ed.
///   - Leet, Uang & Gilbert, "Fundamentals of Structural Analysis", 5th Ed.
///   - AISC Steel Construction Manual, 15th Ed.
///   - Kassimali, "Structural Analysis", 6th Ed.
///
/// Tests use the 2D solver to verify how connection details (hinges,
/// semi-rigid joints, mixed connections) affect force distribution
/// and deflections in beam and frame structures.
///
/// Tests:
///   1. Hinge effect: beam with internal hinge vs continuous beam
///   2. Truss bar: axial-only member (hinge both ends, tiny Iz)
///   3. Propped cantilever: fixed-roller reaction comparison
///   4. Two-span beam with internal hinge at midspan
///   5. Portal frame: pinned vs fixed column bases
///   6. Three-bar truss: equilibrium and force distribution
///   7. Cantilever with hinge at midspan (moment release)
///   8. Mixed connection frame: one pinned base, one fixed base
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Hinge Effect on Simply-Supported Beam
// ================================================================
//
// A simply-supported beam of length L with a point load P at midspan.
// Case A: Continuous beam -> M_mid = PL/4
// Case B: Internal hinge at midspan -> beam becomes a mechanism
//         for midspan loading, so we place the hinge at L/3.
//         With hinge at L/3, moment is zero at the hinge location.
//
// Reference: Hibbeler, "Structural Analysis", Ch. 3

#[test]
fn validation_hinge_releases_moment_at_joint() {
    let l: f64 = 9.0;
    let p: f64 = 30.0;
    let e_eff: f64 = E * 1000.0;

    // Case A: Continuous beam with point load at node 4 (x=4.5m, midspan)
    // 6 elements, 7 nodes, nodes at 0, 1.5, 3.0, 4.5, 6.0, 7.5, 9.0
    let n = 6;
    let input_a = make_beam(
        n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let res_a = linear::solve_2d(&input_a).unwrap();

    // Midspan deflection for SS beam with center point load: PL^3/(48EI)
    let delta_exact: f64 = p * l.powi(3) / (48.0 * e_eff * IZ);
    let mid_a = res_a.displacements.iter().find(|d| d.node_id == 4).unwrap();
    let err_a: f64 = (mid_a.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(
        err_a < 0.02,
        "Continuous beam midspan deflection: actual={:.6e}, exact={:.6e}, err={:.2}%",
        mid_a.uz.abs(), delta_exact, err_a * 100.0
    );

    // Case B: Two separate beams joined at node 3 (x=3.0m) with hinges.
    // Element 3 has hinge_end=true, element 4 has hinge_start=true.
    // This creates a moment release at node 4 ... but we do it at node 3.
    // We build manually: hinge at the junction of element 2 and element 3
    // i.e., element 2 hinge_end=true, element 3 hinge_start=true
    let input_b = make_input(
        vec![(1,0.0,0.0),(2,1.5,0.0),(3,3.0,0.0),(4,4.5,0.0),(5,6.0,0.0),(6,7.5,0.0),(7,9.0,0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, true),   // hinge at end (node 3)
            (3, "frame", 3, 4, 1, 1, true, false),    // hinge at start (node 3)
            (4, "frame", 4, 5, 1, 1, false, false),
            (5, "frame", 5, 6, 1, 1, false, false),
            (6, "frame", 6, 7, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 7, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let res_b = linear::solve_2d(&input_b).unwrap();

    // At the hinge (node 3): moment must be zero in both adjacent elements
    let ef2 = res_b.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = res_b.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert!(
        ef2.m_end.abs() < 1e-3,
        "Moment at hinge (elem 2 end): {:.6}, should be ~0",
        ef2.m_end
    );
    assert!(
        ef3.m_start.abs() < 1e-3,
        "Moment at hinge (elem 3 start): {:.6}, should be ~0",
        ef3.m_start
    );

    // Beam with hinge should deflect more than continuous beam
    let mid_b = res_b.displacements.iter().find(|d| d.node_id == 4).unwrap();
    assert!(
        mid_b.uz.abs() > mid_a.uz.abs(),
        "Hinged beam deflects more: hinged={:.6e} > continuous={:.6e}",
        mid_b.uz.abs(), mid_a.uz.abs()
    );
}

// ================================================================
// 2. Truss Bar: Axial-Only Member (Hinges Both Ends, Tiny Iz)
// ================================================================
//
// A single bar with hinges at both ends and very small Iz acts as
// a truss element: it carries only axial force, no moment.
//
// Bar from (0,0) to (L,0), pinned-rollerX, axial load P at free end.
// Axial deformation: delta = PL/(EA_eff)
//
// Reference: Kassimali, "Structural Analysis", Ch. 4

#[test]
fn validation_truss_bar_axial_only() {
    let l: f64 = 5.0;
    let p: f64 = 100.0;
    let iz_tiny: f64 = 1e-8;
    let e_eff: f64 = E * 1000.0;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, l, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, iz_tiny)],
        vec![(1, "frame", 1, 2, 1, 1, true, true)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: p, fz: 0.0, my: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Axial deformation: delta_x = PL/(EA)
    let delta_exact: f64 = p * l / (e_eff * A);
    let disp = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let err: f64 = (disp.ux - delta_exact).abs() / delta_exact;
    assert!(
        err < 0.01,
        "Truss axial: ux={:.6e}, exact PL/(EA)={:.6e}, err={:.2}%",
        disp.ux, delta_exact, err * 100.0
    );

    // Element forces: should be pure axial, negligible moment
    let ef = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!(
        ef.m_start.abs() < 1e-3 && ef.m_end.abs() < 1e-3,
        "Truss moments should be ~0: m_start={:.6}, m_end={:.6}",
        ef.m_start, ef.m_end
    );

    // Axial force should equal applied load
    assert!(
        (ef.n_start.abs() - p).abs() / p < 0.01,
        "Axial force: n_start={:.4}, expected={:.1}",
        ef.n_start.abs(), p
    );
}

// ================================================================
// 3. Propped Cantilever: Fixed-Roller Reaction Comparison
// ================================================================
//
// Propped cantilever (fixed at left, roller at right) with UDL q.
// Reactions from beam theory:
//   R_A = 5qL/8  (fixed end, vertical)
//   R_B = 3qL/8  (roller end, vertical)
//   M_A = qL^2/8 (fixed end moment)
//
// Reference: Gere & Goodno, Table D-1

#[test]
fn validation_propped_cantilever_reactions() {
    let l: f64 = 8.0;
    let q: f64 = -12.0;  // kN/m downward
    let n: usize = 8;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let q_abs: f64 = q.abs();

    // R_A (fixed end, node 1)
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let ra_exact: f64 = 5.0 * q_abs * l / 8.0;
    let err_ra: f64 = (ra.rz - ra_exact).abs() / ra_exact;
    assert!(
        err_ra < 0.02,
        "R_A: actual={:.4}, exact 5qL/8={:.4}, err={:.2}%",
        ra.rz, ra_exact, err_ra * 100.0
    );

    // R_B (roller end, last node)
    let rb = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let rb_exact: f64 = 3.0 * q_abs * l / 8.0;
    let err_rb: f64 = (rb.rz - rb_exact).abs() / rb_exact;
    assert!(
        err_rb < 0.02,
        "R_B: actual={:.4}, exact 3qL/8={:.4}, err={:.2}%",
        rb.rz, rb_exact, err_rb * 100.0
    );

    // Fixed end moment M_A = qL^2/8 (hogging, negative by convention)
    let ma_exact: f64 = q_abs * l * l / 8.0;
    let err_ma: f64 = (ra.my.abs() - ma_exact).abs() / ma_exact;
    assert!(
        err_ma < 0.02,
        "M_A: actual={:.4}, exact qL^2/8={:.4}, err={:.2}%",
        ra.my.abs(), ma_exact, err_ma * 100.0
    );

    // Total vertical reaction = total load
    let total_load: f64 = q_abs * l;
    let total_reaction: f64 = ra.rz + rb.rz;
    let err_eq: f64 = (total_reaction - total_load).abs() / total_load;
    assert!(
        err_eq < 0.01,
        "Equilibrium: sum_R={:.4}, qL={:.4}, err={:.2}%",
        total_reaction, total_load, err_eq * 100.0
    );
}

// ================================================================
// 4. Two-Span Beam with Internal Hinge
// ================================================================
//
// Two-span continuous beam (each span L) with supports at ends
// and center. An internal hinge is placed at the center of span 1
// (at L/2). Under UDL on both spans, the hinge eliminates
// moment transfer, so each half of span 1 acts more independently.
//
// Reference: Leet et al., "Fundamentals of Structural Analysis", Ch. 5

#[test]
fn validation_two_span_beam_with_hinge() {
    let l: f64 = 6.0;  // each span
    let q: f64 = -10.0;
    let n_per_span: usize = 4;
    let total_elems: usize = n_per_span * 2;

    // Build continuous beam without hinge first
    let mut loads_a = Vec::new();
    for i in 0..total_elems {
        loads_a.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input_a = make_continuous_beam(
        &[l, l], n_per_span, E, A, IZ, loads_a,
    );
    let res_a = linear::solve_2d(&input_a).unwrap();

    // Build beam with internal hinge at junction of elem 2 and elem 3 (x = L/2 = 3.0m)
    // Nodes: 1(0), 2(1.5), 3(3.0), 4(4.5), 5(6.0), 6(7.5), 7(9.0), 8(10.5), 9(12.0)
    let elem_len: f64 = l / n_per_span as f64;
    let total_nodes: usize = total_elems + 1;
    let nodes: Vec<(usize, f64, f64)> = (0..total_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();

    let mut elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = Vec::new();
    for i in 0..total_elems {
        let hs = i == 2; // hinge at start of elem 3 (node 3)
        let he = i == 1; // hinge at end of elem 2 (node 3)
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, hs, he));
    }

    let mut loads_b = Vec::new();
    for i in 0..total_elems {
        loads_b.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input_b = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        vec![(1, 1, "pinned"), (2, n_per_span + 1, "rollerX"), (3, total_nodes, "rollerX")],
        loads_b,
    );
    let res_b = linear::solve_2d(&input_b).unwrap();

    // Moment at hinge location should be zero
    let ef2 = res_b.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = res_b.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert!(
        ef2.m_end.abs() < 1e-3,
        "Hinge moment (elem 2 end): {:.6}, should be ~0",
        ef2.m_end
    );
    assert!(
        ef3.m_start.abs() < 1e-3,
        "Hinge moment (elem 3 start): {:.6}, should be ~0",
        ef3.m_start
    );

    // The continuous beam should have a non-zero moment at this location
    let ef2_a = res_a.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(
        ef2_a.m_end.abs() > 1.0,
        "Continuous beam moment at same location should be significant: {:.4}",
        ef2_a.m_end
    );

    // Hinged beam should deflect more somewhere due to reduced stiffness
    let mid_node: usize = n_per_span / 2 + 1; // node in first half of span 1
    let disp_a = res_a.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    let disp_b = res_b.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert!(
        disp_b.uz.abs() > disp_a.uz.abs() * 0.9,
        "Hinged beam deflection at node {}: {:.6e} vs continuous: {:.6e}",
        mid_node, disp_b.uz.abs(), disp_a.uz.abs()
    );
}

// ================================================================
// 5. Portal Frame: Pinned vs Fixed Column Bases
// ================================================================
//
// Portal frame with lateral load at beam level.
// Pinned bases: columns carry no base moment, lateral drift is larger.
// Fixed bases: base moments develop, lateral drift is smaller.
//
// Reference: McGuire et al., "Matrix Structural Analysis", Ch. 6

#[test]
fn validation_portal_frame_pinned_vs_fixed_bases() {
    let h: f64 = 4.0;   // column height
    let w: f64 = 6.0;   // beam span
    let f_lat: f64 = 50.0; // kN lateral load

    // Fixed base portal frame
    let input_fixed = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let res_fixed = linear::solve_2d(&input_fixed).unwrap();

    // Pinned base portal frame
    // Nodes: 1(0,0), 2(0,h), 3(w,h), 4(w,0)
    let input_pinned = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 4, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f_lat, fz: 0.0, my: 0.0,
        })],
    );
    let res_pinned = linear::solve_2d(&input_pinned).unwrap();

    // Fixed bases should have moment reactions
    let r1_fixed = res_fixed.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4_fixed = res_fixed.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert!(
        r1_fixed.my.abs() > 1.0,
        "Fixed base moment at node 1: {:.4} should be significant",
        r1_fixed.my
    );
    assert!(
        r4_fixed.my.abs() > 1.0,
        "Fixed base moment at node 4: {:.4} should be significant",
        r4_fixed.my
    );

    // Pinned bases should have zero moment reactions
    let r1_pinned = res_pinned.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4_pinned = res_pinned.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert!(
        r1_pinned.my.abs() < 1e-3,
        "Pinned base moment at node 1: {:.6} should be ~0",
        r1_pinned.my
    );
    assert!(
        r4_pinned.my.abs() < 1e-3,
        "Pinned base moment at node 4: {:.6} should be ~0",
        r4_pinned.my
    );

    // Lateral drift: pinned bases should produce larger drift
    let drift_fixed = res_fixed.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let drift_pinned = res_pinned.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    assert!(
        drift_pinned.abs() > drift_fixed.abs(),
        "Pinned drift ({:.6e}) > Fixed drift ({:.6e})",
        drift_pinned.abs(), drift_fixed.abs()
    );

    // Equilibrium: sum of horizontal reactions = applied load
    let sum_rx_fixed: f64 = res_fixed.reactions.iter().map(|r| r.rx).sum();
    assert!(
        (sum_rx_fixed + f_lat).abs() < 0.1,
        "Fixed frame H-equilibrium: sum_rx={:.4}, F_lat={:.4}",
        sum_rx_fixed, f_lat
    );
    let sum_rx_pinned: f64 = res_pinned.reactions.iter().map(|r| r.rx).sum();
    assert!(
        (sum_rx_pinned + f_lat).abs() < 0.1,
        "Pinned frame H-equilibrium: sum_rx={:.4}, F_lat={:.4}",
        sum_rx_pinned, f_lat
    );
}

// ================================================================
// 6. Three-Bar Truss: Equilibrium and Force Distribution
// ================================================================
//
// Classic three-bar truss: nodes at (0,0), (L,0), (L/2,h).
// Pinned at (0,0) and (L,0). Vertical load P at apex.
// By symmetry: bar forces equal in the two inclined members.
// Horizontal bar carries zero force (no horizontal load).
//
// Inclined bar force: N = -P/(2*sin(theta))
// where theta = atan(h/(L/2))
//
// Reference: Kassimali, "Structural Analysis", Ch. 4

#[test]
fn validation_three_bar_truss_equilibrium() {
    let l: f64 = 6.0;
    let h: f64 = 4.0;
    let p: f64 = 80.0; // kN downward
    let iz_tiny: f64 = 1e-8;

    // Bar length
    let bar_len: f64 = ((l / 2.0).powi(2) + h.powi(2)).sqrt();
    let sin_theta: f64 = h / bar_len;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, l, 0.0), (3, l / 2.0, h)],
        vec![(1, E, 0.3)],
        vec![(1, A, iz_tiny)],
        vec![
            (1, "frame", 1, 3, 1, 1, true, true), // left inclined bar
            (2, "frame", 2, 3, 1, 1, true, true), // right inclined bar
            (3, "frame", 1, 2, 1, 1, true, true), // horizontal bar
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: -p, my: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // By symmetry, vertical reactions should be P/2 each
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    let err_r1: f64 = (r1.rz - p / 2.0).abs() / (p / 2.0);
    assert!(
        err_r1 < 0.02,
        "R1_y: actual={:.4}, expected P/2={:.4}, err={:.2}%",
        r1.rz, p / 2.0, err_r1 * 100.0
    );
    let err_r2: f64 = (r2.rz - p / 2.0).abs() / (p / 2.0);
    assert!(
        err_r2 < 0.02,
        "R2_y: actual={:.4}, expected P/2={:.4}, err={:.2}%",
        r2.rz, p / 2.0, err_r2 * 100.0
    );

    // Inclined bar force: compression N = P/(2*sin(theta))
    let n_exact: f64 = p / (2.0 * sin_theta);
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    // Bars are in compression (negative axial)
    let n1: f64 = ef1.n_start.abs().max(ef1.n_end.abs());
    let n2: f64 = ef2.n_start.abs().max(ef2.n_end.abs());
    let err_n1: f64 = (n1 - n_exact).abs() / n_exact;
    assert!(
        err_n1 < 0.02,
        "Bar 1 axial: actual={:.4}, exact P/(2sin_t)={:.4}, err={:.2}%",
        n1, n_exact, err_n1 * 100.0
    );
    let err_n2: f64 = (n2 - n_exact).abs() / n_exact;
    assert!(
        err_n2 < 0.02,
        "Bar 2 axial: actual={:.4}, exact P/(2sin_t)={:.4}, err={:.2}%",
        n2, n_exact, err_n2 * 100.0
    );

    // Horizontal bar force should be near zero by symmetry
    // (actually it carries the horizontal component: N_h = P/(2*tan(theta)))
    let cos_theta: f64 = (l / 2.0) / bar_len;
    let n_h_exact: f64 = p * cos_theta / (2.0 * sin_theta);
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    let n3: f64 = ef3.n_start.abs().max(ef3.n_end.abs());
    let err_n3: f64 = (n3 - n_h_exact).abs() / n_h_exact;
    assert!(
        err_n3 < 0.05,
        "Horizontal bar axial: actual={:.4}, exact={:.4}, err={:.2}%",
        n3, n_h_exact, err_n3 * 100.0
    );

    // All moments should be negligible (truss behavior)
    for ef in &results.element_forces {
        assert!(
            ef.m_start.abs() < 0.1 && ef.m_end.abs() < 0.1,
            "Truss elem {} moments: m_start={:.6}, m_end={:.6}",
            ef.element_id, ef.m_start, ef.m_end
        );
    }
}

// ================================================================
// 7. Propped Cantilever with Internal Hinge (Moment Release)
// ================================================================
//
// Propped cantilever (fixed left, roller right) of length L with
// an internal hinge at L/2. This is statically determinate.
// Under a UDL q, the hinge ensures zero moment at the hinge point.
//
// With hinge at midspan, the structure is determinate.
// The right half acts as a simply-supported beam between the
// hinge and the roller, so M=0 at both ends of right half.
//
// For the right half (L/2 to L) under UDL q:
//   Shear and moment follow simply-supported beam formulas.
//   R_B = q*(L/2)/2 = qL/4 (roller reaction from right half equilibrium)
//   At the hinge: M = 0 (released)
//
// Reference: Leet et al., "Fundamentals of Structural Analysis", Ch. 5

#[test]
fn validation_propped_cantilever_with_internal_hinge() {
    let l: f64 = 8.0;
    let q: f64 = -15.0;
    let n: usize = 8;
    let elem_len: f64 = l / n as f64; // = 1.0m

    // Hinge at midspan: between elem 4 and elem 5 (node 5 at x=4.0m)
    let nodes: Vec<(usize, f64, f64)> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();

    let mut elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = Vec::new();
    for i in 0..n {
        let he = i == 3; // elem 4: hinge at end (node 5)
        let hs = i == 4; // elem 5: hinge at start (node 5)
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, hs, he));
    }

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        vec![(1, 1, "fixed"), (2, n + 1, "rollerX")],
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Moment at hinge should be zero
    let ef4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    let ef5 = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();
    assert!(
        ef4.m_end.abs() < 1e-2,
        "Hinge moment (elem 4 end): {:.6} should be ~0",
        ef4.m_end
    );
    assert!(
        ef5.m_start.abs() < 1e-2,
        "Hinge moment (elem 5 start): {:.6} should be ~0",
        ef5.m_start
    );

    // Right half (L/2 to L) acts as simply-supported under UDL.
    // Roller reaction R_B = q_abs*(L/2)/2 = qL/4
    let q_abs: f64 = q.abs();
    let rb_exact: f64 = q_abs * l / 4.0;
    let rb = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let err_rb: f64 = (rb.rz - rb_exact).abs() / rb_exact;
    assert!(
        err_rb < 0.02,
        "Roller R_B: actual={:.4}, exact qL/4={:.4}, err={:.2}%",
        rb.rz, rb_exact, err_rb * 100.0
    );

    // Total vertical equilibrium: R_A + R_B = qL
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let total_load: f64 = q_abs * l;
    let total_r: f64 = ra.rz + rb.rz;
    let err_eq: f64 = (total_r - total_load).abs() / total_load;
    assert!(
        err_eq < 0.01,
        "Equilibrium: R_A+R_B={:.4}, qL={:.4}, err={:.2}%",
        total_r, total_load, err_eq * 100.0
    );

    // Fixed end should have moment reaction
    assert!(
        ra.my.abs() > 1.0,
        "Fixed end moment should be significant: {:.4}",
        ra.my
    );
}

// ================================================================
// 8. Mixed Connection Frame: One Pinned Base, One Fixed Base
// ================================================================
//
// Portal frame with asymmetric base conditions:
//   Left column: fixed base
//   Right column: pinned base
// Under lateral load, the fixed column attracts more shear and
// moment than the pinned column. The frame sways more than
// a symmetric fixed-fixed frame but less than pinned-pinned.
//
// Reference: McGuire et al., "Matrix Structural Analysis", Ch. 6

#[test]
fn validation_mixed_base_portal_frame() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let f_lat: f64 = 40.0;

    // Mixed: fixed left, pinned right
    let input_mixed = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 4, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f_lat, fz: 0.0, my: 0.0,
        })],
    );
    let res_mixed = linear::solve_2d(&input_mixed).unwrap();

    // Fixed-fixed for comparison
    let input_ff = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let res_ff = linear::solve_2d(&input_ff).unwrap();

    // Pinned-pinned for comparison
    let input_pp = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 4, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f_lat, fz: 0.0, my: 0.0,
        })],
    );
    let res_pp = linear::solve_2d(&input_pp).unwrap();

    // Lateral drift ordering: pinned-pinned > mixed > fixed-fixed
    let drift_ff: f64 = res_ff.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    let drift_mixed: f64 = res_mixed.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    let drift_pp: f64 = res_pp.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    assert!(
        drift_pp > drift_mixed && drift_mixed > drift_ff,
        "Drift ordering: PP={:.6e} > Mixed={:.6e} > FF={:.6e}",
        drift_pp, drift_mixed, drift_ff
    );

    // Fixed base (node 1) should have non-zero moment reaction
    let r1_mixed = res_mixed.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(
        r1_mixed.my.abs() > 1.0,
        "Fixed base moment: {:.4} should be significant",
        r1_mixed.my
    );

    // Pinned base (node 4) should have zero moment reaction
    let r4_mixed = res_mixed.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert!(
        r4_mixed.my.abs() < 1e-3,
        "Pinned base moment: {:.6} should be ~0",
        r4_mixed.my
    );

    // Horizontal equilibrium: sum of horizontal reactions = lateral load
    let sum_rx: f64 = res_mixed.reactions.iter().map(|r| r.rx).sum();
    assert!(
        (sum_rx + f_lat).abs() < 0.1,
        "Mixed frame H-equilibrium: sum_rx={:.4}, F_lat={:.4}",
        sum_rx, f_lat
    );

    // The fixed column (left) should attract more horizontal shear than the pinned column
    let r1_rx: f64 = r1_mixed.rx.abs();
    let r4_rx: f64 = r4_mixed.rx.abs();
    assert!(
        r1_rx > r4_rx,
        "Fixed column carries more shear: {:.4} > {:.4}",
        r1_rx, r4_rx
    );
}
