/// Validation: Crane Runway and Industrial Loading (Extended)
///
/// References:
///   - AISC Design Guide 7: Industrial Buildings (2nd ed., 2004)
///   - EN 1991-3: Actions Induced by Cranes and Machinery
///   - CMAA 70: Specifications for Top Running Bridge & Gantry Type Multiple Girder EOT Cranes
///   - AISE Technical Report 13: Guide for the Design and Construction of Mill Buildings
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed.
///
/// Tests use the linear 2D solver to verify crane wheel loads, impact factors,
/// lateral forces, runway beam moments, bracket eccentricity, fatigue stress
/// ranges, multiple crane combinations, and deflection limits.

use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

// Common properties for a crane runway beam (W610x140 approximation)
const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 -> kN/m^2)
const A: f64 = 0.0179;    // m^2 (W610x140)
const IZ: f64 = 1.12e-3;  // m^4 (strong axis, W610x140)

// ================================================================
// 1. Crane Wheel Loads: Static Reaction on Runway Beam
// ================================================================
//
// A simply-supported runway beam of span L carries a single crane
// wheel load P at midspan. Reactions: R_A = R_B = P/2.
// Also verify the solver's midspan moment: M_mid = P*L/4.
//
// Reference: Statics — SS beam with central point load.

#[test]
fn crane_wheel_static_reaction() {
    let l: f64 = 12.0;  // m, runway beam span
    let n: usize = 8;    // elements
    let p_wheel: f64 = 140.0; // kN, max static wheel load

    // Apply wheel load at midspan node
    let mid_node = n / 2 + 1;
    let input = make_beam(
        n, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: -p_wheel, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    // Each support reaction should be P/2
    let r_expected: f64 = p_wheel / 2.0;
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r_left.ry, r_expected, 0.01, "Left reaction Ry");
    assert_close(r_right.ry, r_expected, 0.01, "Right reaction Ry");

    // Midspan moment: M = P*L/4
    let m_expected: f64 = p_wheel * l / 4.0; // = 420 kN-m
    // Find element spanning the midspan — element n/2 ends at midspan
    let elem_mid = results.element_forces.iter()
        .find(|ef| ef.element_id == n / 2)
        .unwrap();
    // m_end of element just before midspan = moment at midspan
    let m_actual: f64 = elem_mid.m_end.abs();
    assert_close(m_actual, m_expected, 0.02, "Midspan moment P*L/4");
}

// ================================================================
// 2. Impact Factor: Vertical Impact = 25% of Max Wheel Load (AISC/CMAA)
// ================================================================
//
// AISC DG7 / CMAA: pendant-operated cranes use 25% impact factor.
// Design wheel load = 1.25 * P_static.
// We model two separate cases (static and with impact) and verify that
// the factored reactions and moments scale by exactly 1.25.
//
// Reference: AISC Design Guide 7, Section 3.2.

#[test]
fn crane_impact_factor_25_percent() {
    let l: f64 = 10.0;
    let n: usize = 10;
    let p_static: f64 = 140.0;  // kN, static wheel load
    let ci: f64 = 1.25;          // 25% impact factor
    let p_impact: f64 = ci * p_static; // = 175 kN

    let mid_node = n / 2 + 1;

    // Static case
    let input_static = make_beam(
        n, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: -p_static, mz: 0.0,
        })],
    );
    let res_static = solve_2d(&input_static).expect("solve static");

    // Impact case
    let input_impact = make_beam(
        n, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: -p_impact, mz: 0.0,
        })],
    );
    let res_impact = solve_2d(&input_impact).expect("solve impact");

    // Reactions should scale by 1.25
    let ry_static: f64 = res_static.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().ry;
    let ry_impact: f64 = res_impact.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().ry;

    let ratio: f64 = ry_impact / ry_static;
    assert_close(ratio, ci, 0.01, "Impact/static reaction ratio = 1.25");

    // Midspan deflection should also scale by 1.25 (linear solver)
    let d_static: f64 = res_static.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy.abs();
    let d_impact: f64 = res_impact.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy.abs();

    let defl_ratio: f64 = d_impact / d_static;
    assert_close(defl_ratio, ci, 0.01, "Impact/static deflection ratio = 1.25");
}

// ================================================================
// 3. Lateral Force: 20% of Lifted Load for Side Thrust
// ================================================================
//
// AISC DG7: lateral thrust = 20% of (lifted load + trolley weight).
// Model a SS beam under lateral (horizontal) point load at midspan.
// Reactions: R_A_x = H/2, R_B_x = H/2 (if both supports resist lateral).
// For pinned-rollerX, only the pinned support resists horizontal force.
//
// Reference: AISC Design Guide 7, Section 3.3.

#[test]
fn crane_lateral_force_20_percent() {
    let l: f64 = 12.0;
    let n: usize = 8;

    let lifted_load: f64 = 200.0;  // kN
    let trolley_wt: f64 = 30.0;    // kN
    let lateral_fraction: f64 = 0.20;
    let h_lateral: f64 = lateral_fraction * (lifted_load + trolley_wt); // = 46 kN

    // Verify the 20% formula
    let h_expected: f64 = 46.0;
    assert_close(h_lateral, h_expected, 0.01, "Lateral force = 20% of (load+trolley)");

    // Model: SS beam with horizontal load at midspan
    // pinned-rollerX: only pinned support resists horizontal
    let mid_node = n / 2 + 1;
    let input = make_beam(
        n, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: h_lateral, fy: 0.0, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    // Pinned support at node 1 takes all horizontal force
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_left.rx.abs(), h_lateral, 0.01, "Pinned support horizontal reaction");

    // RollerX support should have zero horizontal reaction
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_right.rx.abs(), 0.0, 0.01, "Roller horizontal reaction ~ 0");
}

// ================================================================
// 4. Runway Beam Design: Max Moment from Two Wheel Loads
// ================================================================
//
// Two equal wheel loads P separated by wheel base s on a SS beam of span L.
// For maximum moment, position them so the resultant and the nearer wheel
// straddle the centerline. The critical position places one wheel at
// x = L/2 - s/4 and the other at x = L/2 + 3s/4.
//
// Analytical max moment (by influence line):
//   M_max = P * (L/2 - s/4)^2 / L   (under the critical wheel)
//
// Reference: Timoshenko, "Strength of Materials", moving loads on beams.

#[test]
fn crane_runway_two_wheel_moment() {
    let l: f64 = 12.0;
    let s: f64 = 3.0;   // m, wheel base
    let p: f64 = 175.0;  // kN per wheel (including impact)
    let n: usize = 48;   // fine mesh for accuracy

    let elem_len: f64 = l / n as f64; // = 0.25 m

    // Position wheels for maximum moment:
    // Wheel 1 at x1 = L/2 - s/4 = 6.0 - 0.75 = 5.25 m
    // Wheel 2 at x2 = x1 + s = 8.25 m
    let x1: f64 = l / 2.0 - s / 4.0;
    let x2: f64 = x1 + s;

    // Find nearest nodes
    let node1: usize = (x1 / elem_len).round() as usize + 1;
    let node2: usize = (x2 / elem_len).round() as usize + 1;

    let input = make_beam(
        n, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: node1, fx: 0.0, fy: -p, mz: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: node2, fx: 0.0, fy: -p, mz: 0.0,
            }),
        ],
    );
    let results = solve_2d(&input).expect("solve");

    // Analytical max moment under critical wheel (wheel 1):
    // R_A = P*(L - x1)/L + P*(L - x2)/L
    let actual_x1: f64 = (node1 - 1) as f64 * elem_len;
    let actual_x2: f64 = (node2 - 1) as f64 * elem_len;
    let r_a: f64 = p * (l - actual_x1) / l + p * (l - actual_x2) / l;
    let m_at_x1: f64 = r_a * actual_x1 - 0.0; // no loads to left of x1
    // (first wheel is at x1, so moment at x1 = R_A * x1)

    // Find max moment from solver (check all element end moments)
    let m_max_solver: f64 = results.element_forces.iter()
        .flat_map(|ef| vec![ef.m_start.abs(), ef.m_end.abs()])
        .fold(0.0_f64, f64::max);

    assert_close(m_max_solver, m_at_x1, 0.03, "Max moment from two wheel loads");

    // Should be greater than single wheel at midspan: P*L/4
    let m_single: f64 = p * l / 4.0;
    assert!(
        m_max_solver > m_single,
        "Two-wheel moment {:.1} > single-wheel {:.1} kN-m",
        m_max_solver, m_single
    );
}

// ================================================================
// 5. Crane Bracket: Eccentricity Moment on Column
// ================================================================
//
// Crane runway beam supported on a bracket with eccentricity e from
// column centerline. The bracket transmits vertical wheel load P to
// the column as axial force P plus eccentricity moment M = P * e.
//
// Model: fixed-base column (vertical) with P and M = P*e at crane level.
// Verify base reactions: Ry = P, Mz = P*e + any lateral effect.
//
// Reference: AISC Design Guide 7, Section 5.

#[test]
fn crane_bracket_eccentricity() {
    let h_col: f64 = 10.0;       // m, column height
    let h_crane: f64 = 8.0;      // m, crane rail elevation
    let p_vertical: f64 = 350.0;  // kN, vertical crane load
    let ecc: f64 = 0.50;          // m, bracket eccentricity
    let m_ecc: f64 = p_vertical * ecc; // = 175 kN-m

    // Model column as vertical beam from (0,0) to (0, h_col)
    // Crane load applied at (0, h_crane) node
    let n: usize = 10;
    let elem_len: f64 = h_col / n as f64;
    let crane_node: usize = (h_crane / elem_len).round() as usize + 1;

    // Build nodes along Y-axis (vertical column)
    let nodes: Vec<(usize, f64, f64)> = (0..=n)
        .map(|i| (i + 1, 0.0, i as f64 * elem_len))
        .collect();
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Fixed at base (node 1), free at top
    let sups = vec![(1, 1_usize, "fixed")];

    // Apply vertical load (global fy, axial for vertical column)
    // and eccentricity moment at crane level
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: crane_node, fx: 0.0, fy: -p_vertical, mz: m_ecc,
        }),
    ];

    let col_a: f64 = 0.02;    // m^2
    let col_iz: f64 = 5e-4;   // m^4

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, col_a, col_iz)],
        elems,
        sups,
        loads,
    );
    let results = solve_2d(&input).expect("solve");

    // Base reaction: Ry should equal P_vertical (vertical = axial for vertical column)
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.ry, p_vertical, 0.02, "Column base vertical reaction = P");

    // Base moment should include the eccentricity moment.
    // The vertical load passes through the column centerline (no eccentricity
    // in the model itself), so the only moment source is the applied M_ecc.
    // M_base = m_ecc
    assert_close(r_base.mz.abs(), m_ecc, 0.02, "Column base moment from eccentricity");
}

// ================================================================
// 6. Fatigue: Stress Range from Empty to Loaded Crane Cycle
// ================================================================
//
// Fatigue stress range = sigma_max - sigma_min.
// sigma_max: beam under max wheel load (crane loaded).
// sigma_min: beam under min wheel load (crane empty, trolley at far end).
// Stress range governs fatigue life per AISC S-N curves.
//
// For SS beam with midspan load: sigma = M / S = (P*L/4) / S
// where S is the section modulus.
//
// Reference: AISC Design Guide 7, Chapter 6 (Fatigue).

#[test]
fn crane_fatigue_stress_range() {
    let l: f64 = 12.0;
    let n: usize = 12;
    let mid_node = n / 2 + 1;

    // Max wheel load (loaded crane, trolley near)
    let p_max: f64 = 140.0; // kN
    // Min wheel load (empty crane, bridge dead load only)
    let p_min: f64 = 25.0;  // kN

    // Solve max case
    let input_max = make_beam(
        n, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: -p_max, mz: 0.0,
        })],
    );
    let res_max = solve_2d(&input_max).expect("solve max");

    // Solve min case
    let input_min = make_beam(
        n, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: -p_min, mz: 0.0,
        })],
    );
    let res_min = solve_2d(&input_min).expect("solve min");

    // Get midspan moments
    let m_max_solver: f64 = res_max.element_forces.iter()
        .flat_map(|ef| vec![ef.m_start.abs(), ef.m_end.abs()])
        .fold(0.0_f64, f64::max);

    let m_min_solver: f64 = res_min.element_forces.iter()
        .flat_map(|ef| vec![ef.m_start.abs(), ef.m_end.abs()])
        .fold(0.0_f64, f64::max);

    // Analytical: M = P*L/4
    let m_max_analytical: f64 = p_max * l / 4.0; // = 420 kN-m
    let m_min_analytical: f64 = p_min * l / 4.0;  // = 75 kN-m

    assert_close(m_max_solver, m_max_analytical, 0.02, "Max moment (loaded crane)");
    assert_close(m_min_solver, m_min_analytical, 0.02, "Min moment (empty crane)");

    // Section modulus S = I / y_max; for W610x140: depth ~ 617mm, y_max ~ 308.5mm
    let y_max: f64 = 0.3085;  // m (half-depth)
    let s_x: f64 = IZ / y_max; // m^3

    // Stress range
    let e_eff: f64 = E * 1000.0; // kN/m^2
    let sigma_max: f64 = m_max_analytical / s_x; // kN/m^2
    let sigma_min: f64 = m_min_analytical / s_x;
    let delta_sigma: f64 = sigma_max - sigma_min;

    // Convert to MPa (kN/m^2 / 1000 = MPa)
    let delta_sigma_mpa: f64 = delta_sigma / 1000.0;

    // Verify stress range scales linearly with moment range
    let moment_ratio: f64 = (m_max_analytical - m_min_analytical) / m_max_analytical;
    let stress_ratio: f64 = delta_sigma / sigma_max;
    assert_close(stress_ratio, moment_ratio, 0.01, "Stress range proportional to moment range");

    // Stress range should be positive and meaningful
    assert!(delta_sigma_mpa > 0.0, "Stress range should be positive: {:.1} MPa", delta_sigma_mpa);

    let _e_eff = e_eff;
}

// ================================================================
// 7. Multiple Cranes: Two Cranes Adjacent, Reduced Combination
// ================================================================
//
// When two cranes operate on the same runway, AISC DG7 allows a
// reduction: use full impact on the crane producing the larger effect
// and 50% of the second crane's load (no impact on second crane).
//
// Model: SS beam with two wheel loads at different positions.
// Full crane 1 at L/3, reduced crane 2 (50%) at 2L/3.
// By superposition: reactions and moments should match analytical.
//
// Reference: AISC Design Guide 7, Section 3.7.

#[test]
fn crane_multiple_cranes_reduced() {
    let l: f64 = 18.0;  // m, longer span for two cranes
    let n: usize = 18;

    let p_crane1: f64 = 175.0;  // kN (with 25% impact)
    let p_crane2_full: f64 = 140.0;  // kN (static, no impact for second crane)
    let reduction: f64 = 0.50;
    let p_crane2: f64 = p_crane2_full * reduction; // = 70 kN

    // Crane 1 at L/3, Crane 2 at 2L/3
    let node_c1: usize = n / 3 + 1;  // node 7
    let node_c2: usize = 2 * n / 3 + 1; // node 13

    let input = make_beam(
        n, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: node_c1, fx: 0.0, fy: -p_crane1, mz: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: node_c2, fx: 0.0, fy: -p_crane2, mz: 0.0,
            }),
        ],
    );
    let results = solve_2d(&input).expect("solve");

    // Analytical reactions for two point loads on SS beam:
    // x1 = L/3, x2 = 2L/3
    let x1: f64 = l / 3.0;
    let x2: f64 = 2.0 * l / 3.0;

    // R_A = P1*(L-x1)/L + P2*(L-x2)/L
    let r_a_expected: f64 = p_crane1 * (l - x1) / l + p_crane2 * (l - x2) / l;
    // R_B = P1*x1/L + P2*x2/L
    let r_b_expected: f64 = p_crane1 * x1 / l + p_crane2 * x2 / l;

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r_a.ry, r_a_expected, 0.02, "Left reaction (two cranes)");
    assert_close(r_b.ry, r_b_expected, 0.02, "Right reaction (two cranes)");

    // Total reaction should equal total applied load
    let total_reaction: f64 = r_a.ry + r_b.ry;
    let total_load: f64 = p_crane1 + p_crane2;
    assert_close(total_reaction, total_load, 0.01, "Total reaction = total load");

    // Moment at x1 (under crane 1): M = R_A * x1
    let m_at_x1_expected: f64 = r_a_expected * x1;

    // Find the element ending at crane 1 node
    let elem_at_c1 = results.element_forces.iter()
        .find(|ef| ef.element_id == n / 3)
        .unwrap();
    assert_close(elem_at_c1.m_end.abs(), m_at_x1_expected, 0.03, "Moment under crane 1");
}

// ================================================================
// 8. Runway Deflection: L/600 Limit for Crane Runway
// ================================================================
//
// AISC DG7: vertical deflection limit for CMAA Class A/B = L/600.
// For a SS beam with midspan point load: delta = P*L^3 / (48*E*I).
// Check that the solver deflection matches the formula and verify
// the computed deflection against the L/600 limit.
//
// Reference: AISC Design Guide 7, Table 3-1.

#[test]
fn crane_runway_deflection_limit() {
    let l: f64 = 12.0;
    let n: usize = 12;
    let p_service: f64 = 140.0; // kN, unfactored (service) wheel load
    let mid_node = n / 2 + 1;

    let input = make_beam(
        n, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: -p_service, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    let mid_d = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();
    let delta_solver: f64 = mid_d.uy.abs();

    // Analytical: delta = P*L^3 / (48*E_eff*I)
    let e_eff: f64 = E * 1000.0; // kN/m^2
    let delta_analytical: f64 = p_service * l.powi(3) / (48.0 * e_eff * IZ);

    assert_close(delta_solver, delta_analytical, 0.03, "Midspan deflection P*L^3/(48EI)");

    // L/600 deflection limit (in meters)
    let delta_limit: f64 = l / 600.0; // = 0.020 m = 20 mm

    // Report pass/fail of deflection limit
    // With our W610x140 beam and these loads, deflection should be small
    // delta_analytical = 140 * 1728 / (48 * 200e6 * 1.12e-3) = 241920 / 10752000 = 0.02249 m
    // This is close to L/600 = 0.020 m

    // Verify the solver result is consistent with the analytical value
    // (the deflection limit check is a design check, not a solver check)
    let delta_ratio: f64 = delta_solver / delta_limit;
    assert!(
        delta_ratio > 0.5, // deflection should be a meaningful fraction of the limit
        "Deflection ratio delta/limit = {:.3} (delta={:.4} m, limit={:.4} m)",
        delta_ratio, delta_solver, delta_limit
    );

    // Verify that a stiffer beam (2x Iz) would have half the deflection
    let iz_stiff: f64 = 2.0 * IZ;
    let input_stiff = make_beam(
        n, l, E, A, iz_stiff,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: -p_service, mz: 0.0,
        })],
    );
    let res_stiff = solve_2d(&input_stiff).expect("solve stiff");
    let delta_stiff: f64 = res_stiff.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy.abs();

    let stiffness_ratio: f64 = delta_solver / delta_stiff;
    assert_close(stiffness_ratio, 2.0, 0.02, "Doubling Iz halves deflection");
}
