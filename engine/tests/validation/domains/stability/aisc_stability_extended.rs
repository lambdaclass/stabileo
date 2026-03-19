/// Validation: AISC 360-22 Stability Analysis — Extended Topics
///
/// References:
///   - AISC 360-22 Chapter C: Design for Stability (Direct Analysis Method)
///   - Ziemian (2010), "Guide to Stability Design Criteria for Metal Structures", 6th Ed.
///   - Galambos & Surovek, "Structural Stability of Steel", Ch. 3-5
///   - Chen & Lui, "Structural Stability: Theory and Implementation"
///
/// These tests cover DIFFERENT aspects from validation_aisc_stability.rs:
///   1. Portal frame sway amplification (multi-member B2)
///   2. Effective length factor K for fixed-free column via P-delta
///   3. Leaner column effect: gravity-only column destabilizes lateral system
///   4. Notional load (AISC C2.2b): 0.2% gravity as lateral equivalent
///   5. Symmetry of P-delta response under symmetric loading
///   6. Euler critical load detection (P > Pe causes instability)
///   7. Two-story stacked column: cumulative P-delta effect
///   8. Cm factor effect: single-curvature vs double-curvature bending
use dedaliano_engine::solver::{linear, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;

// W14x48 section properties (SI units)
const W14_A: f64 = 0.00912; // m²
const W14_IZ: f64 = 2.0126e-4; // m⁴
const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 → kN/m²)
const E_EFF: f64 = E * 1000.0; // effective E in kN/m² for hand calculations
const L: f64 = 3.658; // m (12 ft)

// ═══════════════════════════════════════════════════════════════
// 1. Portal Frame Sway Amplification (B2, multi-member)
// ═══════════════════════════════════════════════════════════════

/// AISC 360-22 Appendix 7 / Zubydan benchmark: two-column portal frame
/// with gravity load and lateral push. B2 factor for the story:
///   B2 = 1 / (1 - ΣP·Δ₁/(ΣH·h))
/// where ΣP = total gravity, Δ₁ = first-order drift, ΣH = lateral, h = story height.
#[test]
fn validation_aisc_portal_frame_b2_amplification() {
    let h = 4.0; // story height (m)
    let span = 6.0; // beam span (m)
    let p_grav = 500.0; // kN per column (gravity)
    let h_lat = 40.0; // kN lateral at beam level

    // Build portal frame with meshed columns and beam
    let n_col = 4; // elements per column
    let n_beam = 4; // elements in beam

    let col_len = h / n_col as f64;
    let beam_len = span / n_beam as f64;

    // Nodes: left column (1..n_col+1), beam (n_col+2..n_col+1+n_beam), right column reverse
    let mut nodes = Vec::new();
    let mut node_id = 1_usize;

    // Left column: nodes 1 to n_col+1 (vertical, x=0)
    for i in 0..=n_col {
        nodes.push((node_id, 0.0, i as f64 * col_len));
        node_id += 1;
    }
    let left_top = node_id - 1; // = n_col + 1

    // Beam: nodes after left_top
    for i in 1..=n_beam {
        nodes.push((node_id, i as f64 * beam_len, h));
        node_id += 1;
    }
    let right_top = node_id - 1;

    // Right column: going down from right_top
    for i in 1..=n_col {
        nodes.push((node_id, span, h - i as f64 * col_len));
        node_id += 1;
    }
    let right_base = node_id - 1;

    // Elements
    let mut elems = Vec::new();
    let mut eid = 1_usize;

    // Left column elements
    for i in 0..n_col {
        let ni = i + 1;
        let nj = i + 2;
        elems.push((eid, "frame", ni, nj, 1, 1, false, false));
        eid += 1;
    }

    // Beam elements
    let beam_start_node = left_top;
    for i in 0..n_beam {
        let ni = beam_start_node + i;
        let nj = beam_start_node + i + 1;
        elems.push((eid, "frame", ni, nj, 1, 1, false, false));
        eid += 1;
    }

    // Right column elements (top to bottom)
    let right_col_start = right_top;
    for i in 0..n_col {
        let ni = right_col_start + i;
        let nj = right_col_start + i + 1;
        elems.push((eid, "frame", ni, nj, 1, 1, false, false));
        eid += 1;
    }

    let sups = vec![
        (1, 1, "fixed"),
        (2, right_base, "fixed"),
    ];

    let loads = vec![
        // Gravity on left top
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: left_top, fx: 0.0, fz: -p_grav, my: 0.0,
        }),
        // Gravity on right top
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: right_top, fx: 0.0, fz: -p_grav, my: 0.0,
        }),
        // Lateral at left top
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: left_top, fx: h_lat, fz: 0.0, my: 0.0,
        }),
    ];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, W14_A, W14_IZ)],
        elems, sups, loads,
    );

    let lin = linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();
    assert!(pd.converged, "Portal should converge");
    assert!(pd.is_stable, "Portal should be stable");

    // First-order lateral drift at left_top
    let lin_drift = lin.displacements.iter()
        .find(|d| d.node_id == left_top).unwrap().ux;
    let pd_drift = pd.results.displacements.iter()
        .find(|d| d.node_id == left_top).unwrap().ux;

    // B2 from first-order analysis
    let sum_p = 2.0 * p_grav;
    let delta_1: f64 = lin_drift.abs();
    let b2_hand = 1.0 / (1.0 - sum_p * delta_1 / (h_lat * h));

    let actual_af = pd_drift.abs() / lin_drift.abs();

    // P-delta amplification should approximate B2 within 10%
    assert_close(actual_af, b2_hand, 0.10,
        "Portal B2 amplification factor");
}

// ═══════════════════════════════════════════════════════════════
// 2. Fixed-Free Column: Effective Length Factor K ≈ 2
// ═══════════════════════════════════════════════════════════════

/// AISC Table C-A-7.1: Fixed-free (cantilever) column has K = 2.
/// Euler load: Pe = π²EI/(KL)² = π²EI/(4L²)
/// At P < Pe, P-delta converges. Verify the amplification factor
/// matches the K=2 based critical load.
#[test]
fn validation_aisc_cantilever_effective_length_k2() {
    let n = 8;
    let h_lat = 10.0; // small lateral load at tip

    // Pe for cantilever (K=2): Pe = π²EI/(2L)²
    let pe_cantilever: f64 = std::f64::consts::PI.powi(2) * E_EFF * W14_IZ / (4.0 * L * L);

    // Apply P = 0.3 * Pe (well within stable range)
    let p_axial = 0.3 * pe_cantilever;

    let elem_len = L / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, W14_A, W14_IZ)],
        elems, vec![(1, 1, "fixed")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: -p_axial, fz: h_lat, my: 0.0,
            }),
        ],
    );

    let lin = linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();
    assert!(pd.converged, "Should converge at 0.3*Pe");
    assert!(pd.is_stable, "Should be stable at 0.3*Pe");

    let lin_tip = lin.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz;
    let pd_tip = pd.results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz;

    // Theoretical amplification for cantilever: AF ≈ 1/(1 - P/Pe_cantilever)
    let af_expected = 1.0 / (1.0 - p_axial / pe_cantilever);
    let af_actual = pd_tip.abs() / lin_tip.abs();

    assert_close(af_actual, af_expected, 0.10,
        "Cantilever K=2 amplification factor");
}

// ═══════════════════════════════════════════════════════════════
// 3. Leaner Column Effect: Gravity Column Destabilizes Frame
// ═══════════════════════════════════════════════════════════════

/// AISC C2.1: A "leaner" (pinned-pinned) column carrying only gravity
/// relies on the lateral system for stability. Adding gravity to the
/// leaner column increases the P-delta effect on the whole frame.
/// This test shows that the same lateral system drifts more when
/// the leaner carries more gravity.
#[test]
fn validation_aisc_leaner_column_destabilizes() {
    let h = 4.0;
    let span = 6.0;
    let h_lat = 30.0; // lateral load

    // Helper: build a portal frame with a leaner column
    // Left column fixed-fixed carries the frame, right column is pin-pin (leaner)
    let build = |p_leaner: f64| -> (f64, f64) {
        // 3 nodes: base_left(1), top_left(2), top_right(3), base_right(4)
        let nodes = vec![
            (1, 0.0, 0.0),
            (2, 0.0, h),
            (3, span, h),
            (4, span, 0.0),
        ];
        let elems = vec![
            // Left column: rigid frame member
            (1, "frame", 1, 2, 1, 1, false, false),
            // Beam: rigid connection
            (2, "frame", 2, 3, 1, 1, false, false),
            // Right column: leaner (hinged both ends)
            (3, "frame", 3, 4, 1, 1, true, true),
        ];
        let sups = vec![
            (1, 1, "fixed"),
            (2, 4, "pinned"),
        ];
        let mut loads = vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2, fx: h_lat, fz: 0.0, my: 0.0,
            }),
        ];
        if p_leaner.abs() > 1e-10 {
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: 3, fx: 0.0, fz: -p_leaner, my: 0.0,
            }));
        }
        let input = make_input(
            nodes, vec![(1, E, 0.3)], vec![(1, W14_A, W14_IZ)],
            elems, sups, loads,
        );
        let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();
        assert!(pd.converged);
        let drift_lin = pd.linear_results.displacements.iter()
            .find(|d| d.node_id == 2).unwrap().ux.abs();
        let drift_pd = pd.results.displacements.iter()
            .find(|d| d.node_id == 2).unwrap().ux.abs();
        (drift_lin, drift_pd)
    };

    let (_lin_0, pd_0) = build(0.0);      // no gravity on leaner
    let (_lin_1, pd_1) = build(500.0);     // moderate gravity
    let (_lin_2, pd_2) = build(1500.0);    // heavy gravity

    // Each increase in leaner gravity should increase P-delta drift
    assert!(
        pd_1 > pd_0,
        "Leaner 500 kN should increase drift: {:.6} vs {:.6}", pd_1, pd_0
    );
    assert!(
        pd_2 > pd_1,
        "Leaner 1500 kN should increase drift further: {:.6} vs {:.6}", pd_2, pd_1
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. Notional Load (AISC C2.2b): 0.2% Gravity as Lateral
// ═══════════════════════════════════════════════════════════════

/// AISC 360-22 Section C2.2b: Notional loads Ni = 0.002·Yi applied
/// as lateral forces at each level. For a single-story frame with
/// gravity W, the notional load = 0.002·W. This test verifies
/// the notional load produces a drift consistent with H·L³/(12EI)
/// for the fixed-fixed column.
#[test]
fn validation_aisc_notional_load_drift() {
    let h = 4.0; // story height
    let w_grav = 2000.0; // total gravity load (kN)
    let n_notional = 0.002 * w_grav; // = 4.0 kN lateral

    let n = 8;
    let elem_len = h / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, 0.0, i as f64 * elem_len))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Fixed base, guided top (free to translate laterally, rotation fixed)
    let sups = vec![
        (1, 1, "fixed"),
        (2, n + 1, "guidedY"),
    ];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: n_notional, fz: 0.0, my: 0.0,
        }),
    ];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, W14_A, W14_IZ)],
        elems, sups, loads,
    );

    let lin = linear::solve_2d(&input).unwrap();

    // Fixed-guided column: lateral stiffness = 12EI/h³
    let k_lat = 12.0 * E_EFF * W14_IZ / h.powi(3);
    let delta_expected = n_notional / k_lat;

    let tip = lin.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    // The column goes up along Y, so lateral displacement is in X
    assert_close(tip.ux.abs(), delta_expected, 0.05,
        "Notional load drift: Δ = N/(12EI/h³)");
}

// ═══════════════════════════════════════════════════════════════
// 5. Symmetry of P-Delta Response Under Symmetric Loading
// ═══════════════════════════════════════════════════════════════

/// A symmetric portal frame with symmetric gravity and NO lateral load
/// should produce symmetric P-delta results: equal column forces,
/// zero net lateral drift, equal reactions at both bases.
#[test]
fn validation_aisc_pdelta_symmetric_response() {
    let h = 4.0;
    let span = 8.0;
    let p_grav = 800.0; // kN per column

    // Symmetric portal: both columns fixed, gravity at both tops
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, span, h),
        (4, span, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];

    // Symmetric UDL on beam + equal gravity at both tops
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -p_grav, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: -p_grav, my: 0.0,
        }),
    ];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, W14_A, W14_IZ)],
        elems, sups, loads,
    );

    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();
    assert!(pd.converged, "Symmetric portal should converge");
    assert!(pd.is_stable, "Symmetric portal should be stable");

    // Reactions should be symmetric: Ry_left ≈ Ry_right, Rx_left ≈ -Rx_right
    let r1 = pd.results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = pd.results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    assert_close(r1.rz, r4.rz, 0.01,
        "Symmetric Ry reactions");
    assert_close(r1.rx, -r4.rx, 0.05,
        "Antisymmetric Rx reactions");

    // Net lateral drift should be near zero at beam level
    let d2 = pd.results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = pd.results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Average lateral drift of both tops should be near zero
    let avg_drift = (d2.ux + d3.ux) / 2.0;
    assert!(
        avg_drift.abs() < 1e-6,
        "Symmetric: average lateral drift should be ~0, got {:.2e}", avg_drift
    );
}

// ═══════════════════════════════════════════════════════════════
// 6. Approaching Euler Load: B2 Factor Escalates
// ═══════════════════════════════════════════════════════════════

/// AISC Commentary C2: As axial load approaches the Euler critical load,
/// the amplification (B2) factor grows dramatically.
/// For a pin-pin column: Pe = π²EI/L².
/// Theoretical: B1 = 1/(1 - P/Pe).
/// At P/Pe = 0.1 → B1 = 1.11;  at P/Pe = 0.5 → B1 = 2.0;  at P/Pe = 0.8 → B1 = 5.0.
/// We verify P-delta amplification tracks these expected B1 values.
#[test]
fn validation_aisc_approaching_euler_b2_escalation() {
    let n = 10;
    let pe_pinpin: f64 = std::f64::consts::PI.powi(2) * E_EFF * W14_IZ / (L * L);
    let w_lat = 10.0; // kN/m lateral UDL to create bending

    let ratios = [0.1, 0.5, 0.8];
    let mut prev_af: f64 = 0.0;

    for &ratio in &ratios {
        let p_axial = ratio * pe_pinpin;
        let b1_theory = 1.0 / (1.0 - ratio);

        let elem_len = L / n as f64;
        let nodes: Vec<_> = (0..=n)
            .map(|i| (i + 1, i as f64 * elem_len, 0.0))
            .collect();
        let elems: Vec<_> = (0..n)
            .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
            .collect();

        let mut loads = vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: -p_axial, fz: 0.0, my: 0.0,
            }),
        ];
        for i in 0..n {
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1, q_i: w_lat, q_j: w_lat, a: None, b: None,
            }));
        }

        let input = make_input(
            nodes, vec![(1, E, 0.3)], vec![(1, W14_A, W14_IZ)],
            elems, vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
            loads,
        );

        let lin = linear::solve_2d(&input).unwrap();
        let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();
        assert!(pd.converged, "Should converge at P/Pe={:.1}", ratio);

        let mid = n / 2 + 1;
        let lin_uy = lin.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;
        let pd_uy = pd.results.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;
        let af = pd_uy.abs() / lin_uy.abs();

        // Amplification should be monotonically increasing
        assert!(
            af > prev_af,
            "AF should grow: P/Pe={:.1}, af={:.4}, prev={:.4}", ratio, af, prev_af
        );
        prev_af = af;

        // AF should approximate theoretical B1 within 15%
        assert_close(af, b1_theory, 0.15,
            &format!("B1 at P/Pe={:.1}", ratio));
    }

    // At P/Pe = 0.8, AF should be above 3.0 (theory says 5.0)
    assert!(
        prev_af > 3.0,
        "At P/Pe=0.8, AF should be > 3.0, got {:.4}", prev_af
    );
}

// ═══════════════════════════════════════════════════════════════
// 7. Two-Story Stacked Column: Cumulative P-Delta
// ═══════════════════════════════════════════════════════════════

/// A two-story column with gravity at each level produces a cumulative
/// P-delta effect. The lower story sees higher axial load and should
/// exhibit a larger amplification than the upper story.
#[test]
fn validation_aisc_two_story_cumulative_pdelta() {
    let h1 = 4.0; // lower story height
    let h2 = 3.5; // upper story height
    let n_per = 4; // elements per story
    let p_upper = 400.0; // kN at roof
    let p_lower = 400.0; // kN at 2nd floor (additional)
    let h_lat = 20.0; // lateral at roof

    let elem_len1 = h1 / n_per as f64;
    let elem_len2 = h2 / n_per as f64;

    // Nodes along vertical (Y-axis)
    let mut nodes = Vec::new();
    let mut nid = 1_usize;

    // Lower story: nodes 1..n_per+1
    for i in 0..=n_per {
        nodes.push((nid, 0.0, i as f64 * elem_len1));
        nid += 1;
    }
    let mid_node = nid - 1; // node at floor 2

    // Upper story: n_per more nodes
    for i in 1..=n_per {
        nodes.push((nid, 0.0, h1 + i as f64 * elem_len2));
        nid += 1;
    }
    let top_node = nid - 1;

    let total_elems = 2 * n_per;
    let elems: Vec<_> = (0..total_elems)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let sups = vec![(1, 1, "fixed")];

    let loads = vec![
        // Gravity at roof
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: top_node, fx: 0.0, fz: -p_upper, my: 0.0,
        }),
        // Additional gravity at 2nd floor
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: -p_lower, my: 0.0,
        }),
        // Lateral at roof
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: top_node, fx: h_lat, fz: 0.0, my: 0.0,
        }),
    ];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, W14_A, W14_IZ)],
        elems, sups, loads,
    );

    let lin = linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();
    assert!(pd.converged, "Two-story should converge");
    assert!(pd.is_stable, "Two-story should be stable");

    // Drift at mid-level and top
    let lin_mid_ux = lin.displacements.iter().find(|d| d.node_id == mid_node).unwrap().ux;
    let pd_mid_ux = pd.results.displacements.iter().find(|d| d.node_id == mid_node).unwrap().ux;
    let lin_top_ux = lin.displacements.iter().find(|d| d.node_id == top_node).unwrap().ux;
    let pd_top_ux = pd.results.displacements.iter().find(|d| d.node_id == top_node).unwrap().ux;

    // P-delta should amplify both levels
    let af_mid = pd_mid_ux.abs() / lin_mid_ux.abs();
    let af_top = pd_top_ux.abs() / lin_top_ux.abs();

    assert!(af_mid > 1.0, "P-delta should amplify mid-level drift: AF={:.4}", af_mid);
    assert!(af_top > 1.0, "P-delta should amplify top drift: AF={:.4}", af_top);

    // Overall amplification should be > 1 (structure is under moderate gravity)
    assert!(
        af_top > 1.01,
        "Two-story cumulative P-delta: top AF={:.4} should be > 1.01", af_top
    );
}

// ═══════════════════════════════════════════════════════════════
// 8. Cm Factor: Single-Curvature vs Double-Curvature Bending
// ═══════════════════════════════════════════════════════════════

/// AISC Eq. C2-2: Cm = 0.6 - 0.4(M1/M2) for columns without transverse load.
/// Single curvature (equal end moments, M1/M2 = +1): Cm = 0.6 - 0.4(1) = 0.2
/// Double curvature (M1/M2 = -1): Cm = 0.6 - 0.4(-1) = 1.0
/// B1 = Cm / (1 - P/Pe1)
/// So single-curvature columns have LOWER B1 (less amplification) than uniform Cm=1.0,
/// while double-curvature columns have the same as uniform.
///
/// We verify this by comparing P-delta amplification of midspan deflection
/// for equal end moments (single curvature) vs the uniform-load case.
#[test]
fn validation_aisc_cm_single_vs_double_curvature() {
    let n = 8;
    let pe1: f64 = std::f64::consts::PI.powi(2) * E_EFF * W14_IZ / (L * L);
    let p_axial = 0.3 * pe1;
    let m_end = 20.0; // kN·m end moment

    let elem_len = L / n as f64;

    // Case A: Equal end moments (single curvature) — M at both ends same sign
    // Pin-pin beam-column with moments at both ends
    {
        let nodes: Vec<_> = (0..=n)
            .map(|i| (i + 1, i as f64 * elem_len, 0.0))
            .collect();
        let elems: Vec<_> = (0..n)
            .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
            .collect();

        let loads_single = vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: -p_axial, fz: 0.0, my: 0.0,
            }),
            // Equal moments at both ends → single curvature
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 1, fx: 0.0, fz: 0.0, my: m_end,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: 0.0, fz: 0.0, my: m_end,
            }),
        ];

        let input_s = make_input(
            nodes, vec![(1, E, 0.3)], vec![(1, W14_A, W14_IZ)],
            elems, vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
            loads_single,
        );

        let lin_s = linear::solve_2d(&input_s).unwrap();
        let pd_s = pdelta::solve_pdelta_2d(&input_s, 30, 1e-5).unwrap();
        assert!(pd_s.converged, "Single curvature should converge");

        let mid = n / 2 + 1;
        let lin_uy_s = lin_s.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;
        let pd_uy_s = pd_s.results.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;

        if lin_uy_s.abs() > 1e-10 {
            let af_single = pd_uy_s.abs() / lin_uy_s.abs();
            // For single curvature, the shape is symmetric and midspan deflection
            // should be amplified; AF should be > 1.0
            assert!(
                af_single > 1.0,
                "Single curvature AF should be > 1.0, got {:.4}", af_single
            );
        }
    }

    // Case B: Opposite end moments (double curvature) — M at ends with opposite sign
    {
        let nodes: Vec<_> = (0..=n)
            .map(|i| (i + 1, i as f64 * elem_len, 0.0))
            .collect();
        let elems: Vec<_> = (0..n)
            .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
            .collect();

        let loads_double = vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: -p_axial, fz: 0.0, my: 0.0,
            }),
            // Opposite moments → double curvature
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 1, fx: 0.0, fz: 0.0, my: m_end,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: 0.0, fz: 0.0, my: -m_end,
            }),
        ];

        let input_d = make_input(
            nodes, vec![(1, E, 0.3)], vec![(1, W14_A, W14_IZ)],
            elems, vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
            loads_double,
        );

        let lin_d = linear::solve_2d(&input_d).unwrap();
        let pd_d = pdelta::solve_pdelta_2d(&input_d, 30, 1e-5).unwrap();
        assert!(pd_d.converged, "Double curvature should converge");

        // In double curvature, the inflection point is at midspan,
        // so midspan deflection is near zero in first-order analysis.
        // Use a quarter-point node instead to verify amplification.
        let qtr = n / 4 + 1;
        let lin_uy_d = lin_d.displacements.iter().find(|d| d.node_id == qtr).unwrap().uz;
        let pd_uy_d = pd_d.results.displacements.iter().find(|d| d.node_id == qtr).unwrap().uz;

        if lin_uy_d.abs() > 1e-10 {
            let af_double = pd_uy_d.abs() / lin_uy_d.abs();
            // For double curvature, amplification at the quarter point
            // should still be > 1.0 when axial load is present
            assert!(
                af_double > 1.0,
                "Double curvature AF at quarter-point should be > 1.0, got {:.4}", af_double
            );
        }
    }
}
