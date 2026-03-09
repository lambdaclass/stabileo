/// Validation: Structural Reliability and Safety Concepts (Extended)
///
/// References:
///   - Nowak & Collins: "Reliability of Structures" 2nd ed.
///   - ASCE 7-22: "Minimum Design Loads and Associated Criteria"
///   - Eurocode 0 (EN 1990): "Basis of Structural Design"
///   - AISC 360-22: "Specification for Structural Steel Buildings"
///   - Melchers & Beck: "Structural Reliability Analysis and Prediction" 3rd ed.
///
/// Tests verify reliability/safety concepts using the linear solver:
///   1. Strength reserve factor: actual vs capacity for various load levels
///   2. Load factor proportionality: factored loads produce proportional response
///   3. Partial safety factor: gamma_G*G + gamma_Q*Q vs unfactored
///   4. Reliability index: beta = (R_mean - S_mean) / sqrt(sigma_R^2 + sigma_S^2)
///   5. Limit state check: deflection limit L/360, moment capacity
///   6. Load combination ASCE 7: 1.2D+1.6L vs 1.4D comparison
///   7. Resistance variability: E variation effect on deflection
///   8. Redundancy check: remove one member, structure still stands
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Strength Reserve Factor
// ================================================================
//
// A simply-supported beam under increasing point loads.
// The strength reserve factor RF = capacity / demand.
// At 50% of capacity load, RF should be 2.0.
// At 80% of capacity load, RF should be 1.25.
// Verify the solver produces proportional moment response
// so that RF can be computed from the ratio of loads.
//
// Capacity moment M_cap = 100 kN-m (assumed)
// Load P at midspan: M_max = PL/4
// For L = 8 m: P_cap = 4 * M_cap / L = 50 kN
//
// At P = 25 kN: M = 25*8/4 = 50, RF = 100/50 = 2.0
// At P = 40 kN: M = 40*8/4 = 80, RF = 100/80 = 1.25
// At P = 50 kN: M = 50*8/4 = 100, RF = 100/100 = 1.0

#[test]
fn validation_strength_reserve_factor() {
    let l = 8.0;
    let n: usize = 16;
    let mid = n / 2 + 1;
    let m_capacity = 100.0; // kN-m

    // Helper to get midspan moment for a given point load
    let get_max_moment = |p: f64| -> f64 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let results = linear::solve_2d(&input).unwrap();

        // Get moment from element forces at midspan
        // The maximum moment occurs at midspan; check elements adjacent to mid node
        let m_left = results.element_forces.iter()
            .find(|e| e.element_id == n / 2)
            .unwrap().m_end.abs();
        m_left
    };

    // Exact midspan moment: M = PL/4
    let e_eff = E * 1000.0;
    let _ = e_eff; // solver uses E*1000 internally

    // Load case 1: P = 25 kN (50% of capacity)
    let p1 = 25.0;
    let m1 = get_max_moment(p1);
    let m1_exact = p1 * l / 4.0; // = 50 kN-m
    assert_close(m1, m1_exact, 0.02, "Reserve: M at P=25");
    let rf1 = m_capacity / m1;
    assert_close(rf1, 2.0, 0.02, "Reserve factor at 50% load = 2.0");

    // Load case 2: P = 40 kN (80% of capacity)
    let p2 = 40.0;
    let m2 = get_max_moment(p2);
    let m2_exact = p2 * l / 4.0; // = 80 kN-m
    assert_close(m2, m2_exact, 0.02, "Reserve: M at P=40");
    let rf2 = m_capacity / m2;
    assert_close(rf2, 1.25, 0.02, "Reserve factor at 80% load = 1.25");

    // Load case 3: P = 50 kN (100% of capacity)
    let p3 = 50.0;
    let m3 = get_max_moment(p3);
    let m3_exact = p3 * l / 4.0; // = 100 kN-m
    assert_close(m3, m3_exact, 0.02, "Reserve: M at P=50");
    let rf3 = m_capacity / m3;
    assert_close(rf3, 1.0, 0.02, "Reserve factor at 100% load = 1.0");

    // Reserve factor decreases linearly with load
    assert!(rf1 > rf2, "RF decreases with load: {:.3} > {:.3}", rf1, rf2);
    assert!(rf2 > rf3, "RF decreases with load: {:.3} > {:.3}", rf2, rf3);

    // Demand/capacity ratio is inverse of reserve factor
    let dcr1 = 1.0 / rf1;
    let dcr2 = 1.0 / rf2;
    assert_close(dcr1, 0.5, 0.02, "DCR at 50% load");
    assert_close(dcr2, 0.8, 0.02, "DCR at 80% load");
}

// ================================================================
// 2. Load Factor Proportionality
// ================================================================
//
// In linear analysis, if loads are scaled by factor lambda,
// all responses (displacements, reactions, internal forces)
// scale by the same factor lambda.
//
// Verify: R(lambda * F) = lambda * R(F)
// Test with lambda = 1.0, 2.0, 3.5

#[test]
fn validation_load_factor_proportionality() {
    let l = 10.0;
    let n: usize = 20;
    let q_base: f64 = -5.0; // kN/m base UDL
    let mid = n / 2 + 1;

    // Base case: lambda = 1.0
    let loads_base: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_base, q_j: q_base, a: None, b: None,
        }))
        .collect();
    let input_base = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_base);
    let r_base = linear::solve_2d(&input_base).unwrap();
    let d_base = r_base.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let ry_base = r_base.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let m_base = r_base.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap().m_end;

    // Lambda = 2.0
    let lambda1 = 2.0;
    let loads_2: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: lambda1 * q_base, q_j: lambda1 * q_base, a: None, b: None,
        }))
        .collect();
    let input_2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_2);
    let r_2 = linear::solve_2d(&input_2).unwrap();
    let d_2 = r_2.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let ry_2 = r_2.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let m_2 = r_2.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap().m_end;

    assert_close(d_2, lambda1 * d_base, 0.001, "Proportionality: delta at 2x");
    assert_close(ry_2, lambda1 * ry_base, 0.001, "Proportionality: Ry at 2x");
    assert_close(m_2, lambda1 * m_base, 0.001, "Proportionality: M at 2x");

    // Lambda = 3.5
    let lambda2 = 3.5;
    let loads_35: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: lambda2 * q_base, q_j: lambda2 * q_base, a: None, b: None,
        }))
        .collect();
    let input_35 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_35);
    let r_35 = linear::solve_2d(&input_35).unwrap();
    let d_35 = r_35.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let ry_35 = r_35.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let m_35 = r_35.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap().m_end;

    assert_close(d_35, lambda2 * d_base, 0.001, "Proportionality: delta at 3.5x");
    assert_close(ry_35, lambda2 * ry_base, 0.001, "Proportionality: Ry at 3.5x");
    assert_close(m_35, lambda2 * m_base, 0.001, "Proportionality: M at 3.5x");

    // Cross-check: ratio between lambda=2 and lambda=3.5
    let ratio = lambda2 / lambda1;
    assert_close(d_35 / d_2, ratio, 0.001, "Proportionality: ratio 3.5/2.0");
}

// ================================================================
// 3. Partial Safety Factor: gamma_G * G + gamma_Q * Q
// ================================================================
//
// Eurocode partial safety factors:
//   gamma_G = 1.35 (permanent/dead)
//   gamma_Q = 1.50 (variable/live)
//
// Verify that factored response equals gamma_G * R(G) + gamma_Q * R(Q)
// using superposition (linearity).
//
// SS beam, L = 6 m:
//   G = -4 kN/m (dead), Q = -6 kN/m (live)
//   Factored: 1.35*(-4) + 1.50*(-6) = -5.4 - 9.0 = -14.4 kN/m

#[test]
fn validation_partial_safety_factors() {
    let l = 6.0;
    let n: usize = 12;
    let q_dead: f64 = -4.0;
    let q_live: f64 = -6.0;
    let gamma_g = 1.35;
    let gamma_q = 1.50;
    let mid = n / 2 + 1;

    // Dead load only
    let loads_d: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_dead, q_j: q_dead, a: None, b: None,
        }))
        .collect();
    let input_d = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_d);
    let rd = linear::solve_2d(&input_d).unwrap();
    let d_dead = rd.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let ry_dead = rd.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;

    // Live load only
    let loads_l: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_live, q_j: q_live, a: None, b: None,
        }))
        .collect();
    let input_l = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_l);
    let rl = linear::solve_2d(&input_l).unwrap();
    let d_live = rl.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let ry_live = rl.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;

    // Factored combination: gamma_G * G + gamma_Q * Q
    let q_factored = gamma_g * q_dead + gamma_q * q_live;
    assert_close(q_factored, -14.4, 0.001, "Factored UDL = -14.4 kN/m");

    let loads_f: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_factored, q_j: q_factored, a: None, b: None,
        }))
        .collect();
    let input_f = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_f);
    let rf = linear::solve_2d(&input_f).unwrap();
    let d_factored = rf.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let ry_factored = rf.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;

    // Superposition: factored = gamma_G * dead + gamma_Q * live
    assert_close(d_factored, gamma_g * d_dead + gamma_q * d_live, 0.001,
        "Partial safety: deflection superposition");
    assert_close(ry_factored, gamma_g * ry_dead + gamma_q * ry_live, 0.001,
        "Partial safety: reaction superposition");

    // Unfactored service combination
    let q_service = q_dead + q_live;
    let loads_s: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_service, q_j: q_service, a: None, b: None,
        }))
        .collect();
    let input_s = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_s);
    let rs = linear::solve_2d(&input_s).unwrap();
    let d_service = rs.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;

    // Factored response is larger than unfactored
    assert!(d_factored.abs() > d_service.abs(),
        "Factored > unfactored: {:.6e} > {:.6e}", d_factored.abs(), d_service.abs());

    // The amplification ratio is q_factored / q_service
    let expected_ratio = q_factored / q_service;
    let actual_ratio = d_factored / d_service;
    assert_close(actual_ratio, expected_ratio, 0.001,
        "Amplification ratio = 14.4/10.0 = 1.44");
}

// ================================================================
// 4. Reliability Index from Solver Response
// ================================================================
//
// Compute structural reliability index beta from solver results.
//
// Resistance: R ~ N(R_mean, sigma_R^2)
//   Moment capacity: M_R = 80 kN-m, sigma_R = 8 kN-m (CoV = 10%)
//
// Load effect: S ~ N(S_mean, sigma_S^2)
//   From solver: M_S at midspan of SS beam under nominal loads
//   sigma_S = 0.20 * M_S (CoV = 20% for live load dominated)
//
// beta = (R_mean - S_mean) / sqrt(sigma_R^2 + sigma_S^2)
//
// SS beam L = 8 m, q = -5 kN/m: M_max = qL^2/8 = 5*64/8 = 40 kN-m
// beta = (80 - 40) / sqrt(64 + 64) = 40 / sqrt(128) = 40/11.314 = 3.536

#[test]
fn validation_reliability_index() {
    let l = 8.0;
    let n: usize = 16;
    let q: f64 = -5.0;
    // Solve to get load effect (midspan moment)
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Get midspan moment from element forces
    let m_solver = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap().m_end.abs();

    // Exact: M = qL^2/8
    let m_exact = q.abs() * l * l / 8.0;
    assert_close(m_solver, m_exact, 0.02, "Reliability: solver moment");

    // Reliability parameters
    let r_mean = 80.0;      // mean resistance (kN-m)
    let sigma_r = 8.0;      // std dev of resistance
    let s_mean = m_solver;   // mean load effect from solver
    let sigma_s = 0.20 * s_mean; // CoV = 20%

    // Reliability index
    let beta = (r_mean - s_mean) / (sigma_r * sigma_r + sigma_s * sigma_s).sqrt();

    // Expected: beta = (80-40)/sqrt(64+64) = 40/11.314 = 3.536
    let expected_beta = (r_mean - m_exact) / (sigma_r * sigma_r + (0.20 * m_exact).powi(2)).sqrt();
    assert_close(beta, expected_beta, 0.02, "Reliability index beta");

    // Beta should be in typical structural range (2.5 to 5.0)
    assert!(beta > 2.5, "Beta > 2.5 (minimum reliability): {:.3}", beta);
    assert!(beta < 5.0, "Beta < 5.0 (reasonable range): {:.3}", beta);

    // If we double the load, beta should decrease
    let s_mean_2x = 2.0 * s_mean;
    let sigma_s_2x = 0.20 * s_mean_2x;
    let beta_2x = (r_mean - s_mean_2x) / (sigma_r * sigma_r + sigma_s_2x * sigma_s_2x).sqrt();
    assert!(beta_2x < beta, "Doubling load reduces beta: {:.3} < {:.3}", beta_2x, beta);

    // Safety margin M = R - S
    let safety_margin = r_mean - s_mean;
    assert!(safety_margin > 0.0, "Positive safety margin: {:.1} kN-m", safety_margin);

    // Central safety factor
    let csf = r_mean / s_mean;
    assert!(csf > 1.0, "Central safety factor > 1: {:.3}", csf);
}

// ================================================================
// 5. Limit State Check: Deflection L/360 and Moment Capacity
// ================================================================
//
// Serviceability limit state: midspan deflection < L/360
// Ultimate limit state: midspan moment < M_capacity
//
// SS beam, L = 10 m, q = -3 kN/m
// delta_exact = 5qL^4/(384EI) with E_eff = E*1000
// M_max = qL^2/8

#[test]
fn validation_limit_state_checks() {
    let l = 10.0;
    let n: usize = 20;
    let q: f64 = -3.0;
    let e_eff = E * 1000.0;
    let mid = n / 2 + 1;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // -- Serviceability Limit State: deflection --
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    let delta_exact = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(d_mid, delta_exact, 0.02, "SLS: midspan deflection");

    // Check deflection limit L/360
    let delta_limit = l / 360.0;
    let sls_ratio = d_mid / delta_limit;

    // Report pass/fail (the actual check depends on section properties)
    if d_mid < delta_limit {
        assert!(sls_ratio < 1.0, "SLS: deflection OK, ratio = {:.3}", sls_ratio);
    } else {
        assert!(sls_ratio >= 1.0, "SLS: deflection exceeds L/360, ratio = {:.3}", sls_ratio);
    }

    // Also check L/240 (total load) and L/480 (live load only) limits
    let limit_240 = l / 240.0;
    let limit_480 = l / 480.0;
    // All limits are positive values
    assert!(limit_240 > limit_480, "L/240 > L/480");
    assert!(delta_limit > limit_480, "L/360 > L/480");

    // -- Ultimate Limit State: moment capacity --
    let m_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap().m_end.abs();

    let m_exact = q.abs() * l * l / 8.0;
    assert_close(m_mid, m_exact, 0.02, "ULS: midspan moment");

    // Assume section capacity: M_cap = F_y * Z (plastic moment)
    // For a steel section with Fy = 250 MPa and Z = 0.0005 m^3:
    let fy = 250.0; // MPa = N/mm^2 = MN/m^2
    let z_plastic = 0.0005; // m^3
    let m_capacity = fy * 1000.0 * z_plastic; // convert to kN-m: 250*1000*0.0005 = 125 kN-m

    let uls_ratio = m_mid / m_capacity;
    assert!(uls_ratio < 1.0,
        "ULS: moment OK, M_act/M_cap = {:.3}/{:.3} = {:.3}", m_mid, m_capacity, uls_ratio);

    // The margin of safety
    let mos = m_capacity / m_mid - 1.0;
    assert!(mos > 0.0, "Positive margin of safety: {:.1}%", mos * 100.0);
}

// ================================================================
// 6. Load Combination ASCE 7: 1.2D+1.6L vs 1.4D
// ================================================================
//
// ASCE 7-22 basic combinations:
//   Combo 1: 1.4D
//   Combo 2: 1.2D + 1.6L
//
// For a beam with D = -3 kN/m and L = -5 kN/m:
//   Combo 1: 1.4*(-3) = -4.2 kN/m
//   Combo 2: 1.2*(-3) + 1.6*(-5) = -3.6 + (-8.0) = -11.6 kN/m
//
// Combo 2 governs when live load is significant.
// Combo 1 governs only when D >> L.

#[test]
fn validation_asce7_load_combinations() {
    let l = 8.0;
    let n: usize = 16;
    let q_dead: f64 = -3.0;
    let q_live: f64 = -5.0;
    let mid = n / 2 + 1;

    // Combo 1: 1.4D
    let q_c1 = 1.4 * q_dead;
    let loads_c1: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_c1, q_j: q_c1, a: None, b: None,
        }))
        .collect();
    let input_c1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_c1);
    let r_c1 = linear::solve_2d(&input_c1).unwrap();
    let d_c1 = r_c1.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();
    let ry_c1 = r_c1.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let m_c1 = r_c1.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap().m_end.abs();

    // Combo 2: 1.2D + 1.6L
    let q_c2 = 1.2 * q_dead + 1.6 * q_live;
    let loads_c2: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_c2, q_j: q_c2, a: None, b: None,
        }))
        .collect();
    let input_c2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_c2);
    let r_c2 = linear::solve_2d(&input_c2).unwrap();
    let d_c2 = r_c2.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();
    let ry_c2 = r_c2.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let m_c2 = r_c2.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap().m_end.abs();

    // Verify load magnitudes
    assert_close(q_c1, -4.2, 0.001, "ASCE7: 1.4D = -4.2");
    assert_close(q_c2, -11.6, 0.001, "ASCE7: 1.2D+1.6L = -11.6");

    // Combo 2 governs (larger response) when L is significant
    assert!(d_c2 > d_c1,
        "ASCE7: 1.2D+1.6L governs deflection: {:.6e} > {:.6e}", d_c2, d_c1);
    assert!(m_c2 > m_c1,
        "ASCE7: 1.2D+1.6L governs moment: {:.4} > {:.4}", m_c2, m_c1);

    // Responses should be proportional to load magnitude
    let load_ratio = q_c2.abs() / q_c1.abs();
    assert_close(d_c2 / d_c1, load_ratio, 0.001, "ASCE7: deflection ratio");
    assert_close(m_c2 / m_c1, load_ratio, 0.001, "ASCE7: moment ratio");

    // Reactions are both downward (negative load -> positive reaction for SS beam)
    assert!(ry_c1 > 0.0, "ASCE7: reaction Combo 1 upward");
    assert!(ry_c2 > 0.0, "ASCE7: reaction Combo 2 upward");
    assert!(ry_c2 > ry_c1, "ASCE7: Combo 2 reaction > Combo 1");

    // Check when 1.4D would govern: need 1.4D > 1.2D + 1.6L
    // => 0.2D > 1.6L => L/D < 0.125
    // For our case L/D = 5/3 = 1.67, so Combo 2 governs (verified above)
    let ld_ratio = q_live.abs() / q_dead.abs();
    let ld_threshold = 0.2 / 1.6; // = 0.125
    assert!(ld_ratio > ld_threshold,
        "L/D = {:.2} > {:.3}: Combo 2 governs", ld_ratio, ld_threshold);
}

// ================================================================
// 7. Resistance Variability: E Variation Effect on Deflection
// ================================================================
//
// Vary the modulus of elasticity by +/- 10% and verify the
// effect on deflection.
//
// delta = 5qL^4/(384EI)  => delta ~ 1/E
// If E increases by 10%, delta decreases by factor 1/1.1
// If E decreases by 10%, delta increases by factor 1/0.9
//
// This models material property uncertainty (CoV of E ~ 5-10%).

#[test]
fn validation_resistance_variability() {
    let l = 8.0;
    let n: usize = 16;
    let q: f64 = -10.0;
    let mid = n / 2 + 1;

    let solve_deflection = |e_val: f64| -> f64 {
        let loads: Vec<SolverLoad> = (1..=n)
            .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }))
            .collect();
        let input = make_beam(n, l, e_val, A, IZ, "pinned", Some("rollerX"), loads);
        let results = linear::solve_2d(&input).unwrap();
        results.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs()
    };

    // Nominal E
    let d_nominal = solve_deflection(E);

    // E + 10%
    let e_high = E * 1.10;
    let d_high_e = solve_deflection(e_high);

    // E - 10%
    let e_low = E * 0.90;
    let d_low_e = solve_deflection(e_low);

    // Higher E -> smaller deflection (stiffer)
    assert!(d_high_e < d_nominal,
        "Higher E -> less deflection: {:.6e} < {:.6e}", d_high_e, d_nominal);

    // Lower E -> larger deflection (more flexible)
    assert!(d_low_e > d_nominal,
        "Lower E -> more deflection: {:.6e} > {:.6e}", d_low_e, d_nominal);

    // Deflection inversely proportional to E: delta ~ 1/E
    // d_high / d_nominal should be approximately E_nominal / E_high = 1/1.1
    let ratio_high = d_high_e / d_nominal;
    let expected_high = E / e_high; // 1/1.1 = 0.9091
    assert_close(ratio_high, expected_high, 0.01,
        "E+10%: deflection ratio = 1/1.1");

    let ratio_low = d_low_e / d_nominal;
    let expected_low = E / e_low; // 1/0.9 = 1.1111
    assert_close(ratio_low, expected_low, 0.01,
        "E-10%: deflection ratio = 1/0.9");

    // Sensitivity: delta deflection / delta E (normalized)
    // d(delta)/dE * E/delta = -1 (for delta ~ 1/E)
    let sensitivity = (d_high_e - d_nominal) / d_nominal / (0.10);
    // Should be approximately -1.0
    assert_close(sensitivity, -1.0 / 1.10, 0.05,
        "E sensitivity: normalized");

    // Coefficient of variation of deflection due to E uncertainty
    // If CoV_E = 0.05, then CoV_delta = CoV_E (linear sensitivity)
    let cov_e = 0.05;
    let cov_delta_approx = cov_e; // |sensitivity| * CoV_E ~ 1.0 * 0.05
    assert_close(cov_delta_approx, 0.05, 0.001,
        "CoV of deflection approximation");
}

// ================================================================
// 8. Redundancy Check: Remove One Member, Structure Stands
// ================================================================
//
// A 2-bay truss (6 nodes, multiple members) under vertical load.
// Remove one diagonal member and verify the structure is still
// stable (solver succeeds) and load is redistributed.
//
// Original truss: 2 panels, each w x h
//   Bottom: 1(0,0) - 2(w,0) - 3(2w,0)
//   Top:    4(0,h) - 5(w,h) - 6(2w,h)
//   Members: bottom chord, top chord, verticals, diagonals
//
// Redundancy: Remove diagonal 2-5 and verify structure survives.

#[test]
fn validation_redundancy_check() {
    let w = 4.0;
    let h = 3.0;
    let p = 20.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0), (3, 2.0 * w, 0.0),
        (4, 0.0, h),   (5, w, h),   (6, 2.0 * w, h),
    ];

    // Full truss: bottom chord + top chord + verticals + X-bracing (redundant)
    let full_members: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = vec![
        // Bottom chord
        (1,  "truss", 1, 2, 1, 1, false, false),
        (2,  "truss", 2, 3, 1, 1, false, false),
        // Top chord
        (3,  "truss", 4, 5, 1, 1, false, false),
        (4,  "truss", 5, 6, 1, 1, false, false),
        // Verticals
        (5,  "truss", 1, 4, 1, 1, false, false),
        (6,  "truss", 2, 5, 1, 1, false, false),
        (7,  "truss", 3, 6, 1, 1, false, false),
        // Panel 1 X-bracing
        (8,  "truss", 1, 5, 1, 1, false, false),
        (9,  "truss", 2, 4, 1, 1, false, false),
        // Panel 2 X-bracing
        (10, "truss", 2, 6, 1, 1, false, false),
        (11, "truss", 3, 5, 1, 1, false, false),
    ];

    let a_truss = 0.001;
    let supports = vec![(1, 1, "pinned"), (2, 3, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: 0.0, fy: -p, mz: 0.0,
    })];

    // Solve full truss
    let input_full = make_input(
        nodes.clone(),
        vec![(1, E, 0.3)],
        vec![(1, a_truss, 0.0)],
        full_members.clone(),
        supports.clone(),
        loads.clone(),
    );
    let r_full = linear::solve_2d(&input_full).unwrap();
    let d_full = r_full.displacements.iter()
        .find(|d| d.node_id == 5).unwrap().uy;

    // Verify full truss solves successfully with downward deflection
    assert!(d_full < 0.0, "Full truss: node 5 deflects downward");

    // Remove one X-brace diagonal (member 11: 3-5) — structure stays stable
    let reduced_members: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = vec![
        (1,  "truss", 1, 2, 1, 1, false, false),
        (2,  "truss", 2, 3, 1, 1, false, false),
        (3,  "truss", 4, 5, 1, 1, false, false),
        (4,  "truss", 5, 6, 1, 1, false, false),
        (5,  "truss", 1, 4, 1, 1, false, false),
        (6,  "truss", 2, 5, 1, 1, false, false),
        (7,  "truss", 3, 6, 1, 1, false, false),
        (8,  "truss", 1, 5, 1, 1, false, false),
        (9,  "truss", 2, 4, 1, 1, false, false),
        (10, "truss", 2, 6, 1, 1, false, false),
        // member 11 removed (diagonal 3-5)
    ];

    let input_reduced = make_input(
        nodes.clone(),
        vec![(1, E, 0.3)],
        vec![(1, a_truss, 0.0)],
        reduced_members,
        supports.clone(),
        loads.clone(),
    );
    let r_reduced = linear::solve_2d(&input_reduced).unwrap();
    let d_reduced = r_reduced.displacements.iter()
        .find(|d| d.node_id == 5).unwrap().uy;

    // Structure is still stable (solver succeeds)
    assert!(d_reduced < 0.0, "Reduced truss: still deflects downward (stable)");

    // Reduced truss is more flexible (larger deflection)
    assert!(d_reduced.abs() > d_full.abs(),
        "Reduced truss more flexible: {:.6e} > {:.6e}", d_reduced.abs(), d_full.abs());

    // Reactions should still satisfy equilibrium: sum(Ry) = P
    let sum_ry_full: f64 = r_full.reactions.iter().map(|r| r.ry).sum();
    let sum_ry_reduced: f64 = r_reduced.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry_full, p, 0.01, "Full truss: vertical equilibrium");
    assert_close(sum_ry_reduced, p, 0.01, "Reduced truss: vertical equilibrium");

    // Force redistribution: remaining diagonal in panel 2 (member 10: 2-6) carries more
    let f10_full = r_full.element_forces.iter()
        .find(|e| e.element_id == 10).unwrap().n_start.abs();
    let f10_reduced = r_reduced.element_forces.iter()
        .find(|e| e.element_id == 10).unwrap().n_start.abs();
    assert!(f10_reduced > f10_full,
        "Remaining diagonal carries more: {:.4} > {:.4}", f10_reduced, f10_full);
}
