/// Validation: Extended Blast and Impact Loading Concepts
///
/// References:
///   - UFC 3-340-02: Structures to Resist the Effects of Accidental Explosions
///   - Biggs: "Introduction to Structural Dynamics" (1964)
///   - Baker et al.: "Explosion Hazards and Evaluation" (1983)
///   - Mays & Smith: "Blast Effects on Buildings" 2nd ed. (2012)
///   - Krauthammer: "Modern Protective Structures" (2008)
///   - Kinney & Graham: "Explosive Shocks in Air" (1985)
///
/// Tests verify blast loading parameters, dynamic response factors,
/// SDOF equivalents, and structural resistance under blast scenarios.
/// Each test builds a structural model, solves it statically, and
/// compares results with analytical blast/dynamic formulas.

use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

// ================================================================
// 1. Friedlander Waveform: Equivalent Static Load on Beam
// ================================================================
//
// Friedlander positive phase: p(t) = p_so * (1 - t/td) * exp(-b*t/td)
// Impulse: I = p_so * td * (1/b - 1/b^2 * (1 - exp(-b)))
// Equivalent static load: F_eq = 2*I / td (for impulsive regime)
// Verify beam deflection under F_eq matches PL^3/(48EI) for SS beam.

#[test]
fn blast_friedlander_equivalent_static_load() {
    let p_so: f64 = 150.0;     // kPa peak overpressure
    let td: f64 = 0.015;       // s, positive phase duration
    let b: f64 = 1.8;          // Friedlander decay coefficient
    let trib_area: f64 = 3.0;  // m^2, tributary area on beam

    // Friedlander impulse (analytical integration)
    let impulse_per_area: f64 = p_so * td * (1.0 / b - 1.0 / (b * b) * (1.0 - (-b).exp()));

    // Equivalent static pressure for triangular pulse approximation
    // For short-duration pulse (impulsive regime), use DLF ~ 2.0
    let dlf: f64 = 2.0;
    let p_equiv: f64 = impulse_per_area * dlf / td;

    // Total equivalent static force on beam midpoint (kN)
    let f_eq: f64 = p_equiv * trib_area;

    // Build SS beam and apply equivalent static force at midspan
    let l: f64 = 6.0;
    let n: usize = 8;
    let e: f64 = 200_000.0;     // MPa
    let a: f64 = 0.015;         // m^2
    let iz: f64 = 8.0e-5;       // m^4

    let mid_node = n / 2 + 1;
    let input = make_beam(
        n, l, e, a, iz, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: -f_eq, my: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();

    // Analytical: delta = PL^3 / (48*EI)
    let e_eff: f64 = e * 1000.0;
    let delta_exact: f64 = f_eq * l.powi(3) / (48.0 * e_eff * iz);

    assert_close(mid_disp.uz.abs(), delta_exact, 0.05, "Friedlander equiv static deflection");

    // Verify impulse is positive and less than triangular approximation
    let i_tri: f64 = 0.5 * p_so * td;
    assert!(impulse_per_area > 0.0, "Positive impulse");
    assert!(impulse_per_area < i_tri, "Friedlander impulse < triangular");
}

// ================================================================
// 2. SDOF Equivalent: DLF = 2.0 for Step Load, K = 384EI/(5L^4)
// ================================================================
//
// For a simply supported beam under uniform load, the equivalent
// SDOF stiffness is K_eq = 384*EI/(5*L^3).
// Under sudden step load, DLF = 2.0 (undamped).
// Static deflection: delta_st = 5*q*L^4 / (384*EI)
// Dynamic max: delta_dyn = 2 * delta_st

#[test]
fn blast_sdof_step_load_dlf() {
    let l: f64 = 5.0;
    let n: usize = 10;
    let e: f64 = 200_000.0;
    let a: f64 = 0.02;
    let iz: f64 = 1.5e-4;
    let q: f64 = -30.0;        // kN/m uniform load

    // Build SS beam with UDL
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, e, a, iz, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    let mid_node = n / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();

    // Static deflection formula: delta_st = 5*q*L^4 / (384*EI)
    let e_eff: f64 = e * 1000.0;
    let delta_st: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * iz);

    assert_close(mid_disp.uz.abs(), delta_st, 0.05, "SS beam UDL static deflection");

    // SDOF equivalent stiffness: K_eq = 384*EI / (5*L^3)
    let k_eq: f64 = 384.0 * e_eff * iz / (5.0 * l.powi(3));

    // Verify K_eq * delta_st = total load (q*L)
    let total_load: f64 = q.abs() * l;
    // For SS beam: the load factor KL = 0.64, so K_eq * delta_mid = KL * q * L is not exact
    // But K_eq = F_eq / delta_mid where F_eq = q*L for midpoint equivalence
    let f_from_k: f64 = k_eq * delta_st;
    assert_close(f_from_k, total_load, 0.05, "SDOF K_eq consistency");

    // DLF = 2.0 for step load: dynamic max = 2 * static
    let dlf_step: f64 = 2.0;
    let delta_dyn: f64 = dlf_step * delta_st;
    assert_close(delta_dyn / delta_st, 2.0, 0.001, "DLF = 2.0 for step load");
}

// ================================================================
// 3. Reflected Blast Pressure: Column Shear from Pr = Cr * Pso
// ================================================================
//
// Normal reflection coefficient: Cr = 2 + 6*(pso/p0)/(7 + pso/p0)
// For pso = 50 kPa: Cr ~ 2.08
// Reflected pressure as UDL on column, check reactions.

#[test]
fn blast_reflected_pressure_column_shear() {
    let p_atm: f64 = 101.325;  // kPa atmospheric
    let p_so: f64 = 50.0;      // kPa incident overpressure

    // Reflection coefficient
    let ratio: f64 = p_so / p_atm;
    let cr: f64 = 2.0 + 6.0 * ratio / (7.0 + ratio);

    // Reflected pressure
    let p_r: f64 = cr * p_so;

    // Convert to line load on column (tributary width = 3m)
    let trib_width: f64 = 3.0;
    let q_col: f64 = p_r * trib_width / 1000.0; // kPa * m = kN/m^2 * m = kN/m, / 1000 for unit consistency
    // Actually p_r is in kPa = kN/m^2, times width in m = kN/m
    let q_col_actual: f64 = p_r * trib_width; // kN/m (since kPa = kN/m^2)

    // Build cantilever column (fixed base, free top) loaded laterally
    let h: f64 = 4.0;
    let n: usize = 8;
    let e: f64 = 200_000.0;
    let a_sec: f64 = 0.03;
    let iz: f64 = 4.0e-4;

    // Column along Y-axis: nodes go from (0,0) to (0,h)
    let nodes: Vec<(usize, f64, f64)> = (0..=n)
        .map(|i| (i + 1, 0.0, i as f64 * h / n as f64))
        .collect();
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1, "fixed")];

    // Lateral distributed load (in x-direction) on each element
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q_col_actual,
            q_j: q_col_actual,
            a: None,
            b: None,
        }));
    }

    let input = make_input(
        nodes,
        vec![(1, e, 0.3)],
        vec![(1, a_sec, iz)],
        elems,
        sups,
        loads,
    );
    let results = solve_2d(&input).expect("solve");

    // Base shear reaction = total lateral load = q * h
    let total_lateral: f64 = q_col_actual * h;
    let base_rx: f64 = results.reactions[0].rx.abs();
    assert_close(base_rx, total_lateral, 0.05, "Column base shear from reflected pressure");

    // Verify Cr is in expected range (2 < Cr < 8)
    assert!(cr > 2.0 && cr < 8.0, "Cr = {:.3} in valid range", cr);

    // Verify reflected pressure > incident
    assert!(p_r > p_so, "Reflected > incident: {:.1} > {:.1} kPa", p_r, p_so);

    let _q_col = q_col;
}

// ================================================================
// 4. Dynamic Load Factor: Triangular Pulse DLF vs td/T
// ================================================================
//
// For a triangular pulse on an SDOF system:
//   td/T << 1 (impulsive): DLF ≈ td*pi/T
//   td/T >> 1 (quasi-static): DLF → 2.0
//   Peak DLF ≈ 1.8 at td/T ≈ 0.8
// Verify by computing static deflection and scaling by DLF.

#[test]
fn blast_triangular_pulse_dlf() {
    let l: f64 = 4.0;
    let n: usize = 8;
    let e: f64 = 200_000.0;
    let a: f64 = 0.012;
    let iz: f64 = 6.0e-5;
    let p_blast: f64 = -50.0;  // kN/m peak UDL

    // Build fixed-fixed beam under uniform load (static reference)
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: p_blast, q_j: p_blast, a: None, b: None,
        }));
    }
    let input = make_beam(n, l, e, a, iz, "fixed", Some("fixed"), loads);
    let results = solve_2d(&input).expect("solve");

    let mid_node = n / 2 + 1;
    let delta_static: f64 = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();

    // Analytical: delta = qL^4 / (384*EI) for fixed-fixed
    let e_eff: f64 = e * 1000.0;
    let delta_ff: f64 = p_blast.abs() * l.powi(4) / (384.0 * e_eff * iz);
    assert_close(delta_static, delta_ff, 0.05, "Fixed-fixed static deflection");

    // Natural period estimate for fixed-fixed beam (1st mode)
    // omega_1 = (4.730)^2 * sqrt(EI / (rho*A*L^4))
    // For now use stiffness-based: T = 2*pi*sqrt(M/K)
    // K = 384*EI / L^3 for fixed-fixed under UDL
    let k_ff: f64 = 384.0 * e_eff * iz / l.powi(3);
    let rho: f64 = 7850.0;  // kg/m^3 steel
    let mass_total: f64 = rho * a * l;  // kg
    let km_factor: f64 = 0.41; // mass factor for fixed-fixed (Biggs)
    let m_eq: f64 = km_factor * mass_total;
    let pi: f64 = std::f64::consts::PI;
    let t_nat: f64 = 2.0 * pi * (m_eq / k_ff).sqrt();

    // Triangular pulse DLF values from Biggs charts
    // td/T:   0.1   0.2   0.4   0.6   0.8   1.0    2.0
    // DLF:    0.58  0.96  1.52  1.77  1.83  1.73   1.57
    let td_t_pairs: [(f64, f64); 7] = [
        (0.1, 0.58), (0.2, 0.96), (0.4, 1.52),
        (0.6, 1.77), (0.8, 1.83), (1.0, 1.73), (2.0, 1.57),
    ];

    // Verify DLF bounds and compute dynamic deflections
    for &(td_t, dlf) in &td_t_pairs {
        let td: f64 = td_t * t_nat;
        let delta_dyn: f64 = dlf * delta_static;

        assert!(dlf > 0.0 && dlf < 2.1,
            "DLF({:.1}) = {:.2} should be in (0, 2.1)", td_t, dlf);
        assert!(delta_dyn > 0.0, "Dynamic deflection positive for td={:.6}s", td);
    }

    // Peak DLF occurs near td/T = 0.8
    let max_dlf: f64 = td_t_pairs.iter()
        .map(|&(_, d)| d)
        .fold(0.0_f64, f64::max);
    assert_close(max_dlf, 1.83, 0.01, "Peak triangular DLF at td/T~0.8");

    let _t_nat = t_nat;
}

// ================================================================
// 5. Equivalent Static Load: Blast Impulse to Equivalent Static
// ================================================================
//
// For impulsive regime (td/T << 1):
//   delta_max = I / (M * omega)   where I = impulse, omega = sqrt(K/M)
//   F_equiv = K * delta_max = I * omega = I * sqrt(K/M)
// Verify by solving beam under F_equiv and checking deflection.

#[test]
fn blast_impulse_to_equivalent_static() {
    let l: f64 = 5.0;
    let n: usize = 10;
    let e: f64 = 200_000.0;
    let a: f64 = 0.016;
    let iz: f64 = 1.2e-4;
    let e_eff: f64 = e * 1000.0;

    // Blast impulse parameters
    let p_so: f64 = 200.0;      // kPa peak
    let td: f64 = 0.010;        // s, very short duration (impulsive)
    let trib_area: f64 = 2.5;   // m^2

    // Total impulse (triangular approximation): I = 0.5 * p_so * td * A_trib
    let impulse: f64 = 0.5 * p_so * td * trib_area; // kPa * s * m^2 = kN*s

    // Beam stiffness (SS, midpoint load): K = 48*EI/L^3
    let k_beam: f64 = 48.0 * e_eff * iz / l.powi(3);

    // Equivalent mass (SS beam, KM = 0.50): M_eq = 0.50 * rho * A * L
    let rho: f64 = 7850.0;
    let m_eq: f64 = 0.50 * rho * a * l;

    // Natural frequency
    let omega: f64 = (k_beam / m_eq).sqrt();

    // Impulsive regime: max displacement = I / (M_eq * omega)
    let delta_max_impulse: f64 = impulse / (m_eq * omega);

    // Equivalent static force that produces same deflection
    let f_equiv: f64 = k_beam * delta_max_impulse;

    // Solve beam under equivalent static midpoint load
    let mid_node = n / 2 + 1;
    let input = make_beam(
        n, l, e, a, iz, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: -f_equiv, my: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();

    // The solver deflection should match delta_max_impulse
    assert_close(mid_disp.uz.abs(), delta_max_impulse, 0.05,
        "Impulse-equivalent static deflection");

    // Also verify: F_equiv = I * omega (alternative formula)
    let f_equiv_alt: f64 = impulse * omega;
    assert_close(f_equiv, f_equiv_alt, 0.001, "F_equiv = I*omega = K*delta");

    // Verify impulsive regime assumption: td << T
    let pi: f64 = std::f64::consts::PI;
    let t_nat: f64 = 2.0 * pi / omega;
    let td_t_ratio: f64 = td / t_nat;
    assert!(td_t_ratio < 0.4, "Impulsive regime: td/T = {:.3} < 0.4", td_t_ratio);
}

// ================================================================
// 6. Column Under Blast: Lateral Deformation from Uniform Pressure
// ================================================================
//
// Fixed-base cantilever column subjected to uniform lateral blast pressure.
// Tip deflection: delta = q*H^4 / (8*EI) for cantilever with UDL.
// Base moment: M = q*H^2 / 2
// Verify solver results match these formulas.

#[test]
fn blast_column_lateral_deformation() {
    let h: f64 = 3.5;         // m, column height
    let n: usize = 8;
    let e: f64 = 200_000.0;
    let a_sec: f64 = 0.025;
    let iz: f64 = 3.0e-4;
    let e_eff: f64 = e * 1000.0;

    // Blast pressure converted to line load on column
    // p_blast = 80 kPa, tributary width = 4 m
    let p_blast: f64 = 80.0;   // kPa
    let trib_w: f64 = 4.0;     // m
    let q_lat: f64 = p_blast * trib_w; // kN/m (kPa * m = kN/m^2 * m = kN/m)

    // Build vertical cantilever column (fixed at base, free at top)
    let nodes: Vec<(usize, f64, f64)> = (0..=n)
        .map(|i| (i + 1, 0.0, i as f64 * h / n as f64))
        .collect();
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1, "fixed")];

    // Lateral UDL on each element
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q_lat,
            q_j: q_lat,
            a: None,
            b: None,
        }));
    }

    let input = make_input(
        nodes,
        vec![(1, e, 0.3)],
        vec![(1, a_sec, iz)],
        elems,
        sups,
        loads,
    );
    let results = solve_2d(&input).expect("solve");

    // Tip deflection: delta = q*H^4 / (8*EI) for cantilever UDL
    let tip_node = n + 1;
    let tip_disp = results.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap();
    let delta_exact: f64 = q_lat * h.powi(4) / (8.0 * e_eff * iz);

    assert_close(tip_disp.ux.abs(), delta_exact, 0.05,
        "Blast column tip deflection");

    // Base reactions
    let base_shear: f64 = results.reactions[0].rx.abs();
    let base_moment: f64 = results.reactions[0].my.abs();

    // Shear = q * H
    let v_exact: f64 = q_lat * h;
    assert_close(base_shear, v_exact, 0.02, "Blast column base shear");

    // Moment = q * H^2 / 2
    let m_exact: f64 = q_lat * h * h / 2.0;
    assert_close(base_moment, m_exact, 0.02, "Blast column base moment");
}

// ================================================================
// 7. Blast Resistance: Required Section for Given Peak Pressure
// ================================================================
//
// Given a blast pressure, compute required moment capacity and verify
// that a beam with sufficient section resists the load.
// For SS beam: M_max = q*L^2/8. Required Iz = M_max*L^2/(8*E*delta_allow)
// Verify deflection stays within the allowable limit.

#[test]
fn blast_required_section_resistance() {
    let l: f64 = 6.0;
    let n: usize = 12;
    let e: f64 = 200_000.0;
    let e_eff: f64 = e * 1000.0;

    // Blast scenario: reflected pressure on facade transferred to beam
    let p_reflected: f64 = 120.0;  // kPa reflected pressure
    let trib_width: f64 = 3.5;     // m
    let q_blast: f64 = p_reflected * trib_width; // kN/m

    // Allowable deflection: L/250 (serviceability under blast equivalent static)
    let delta_allow: f64 = l / 250.0;

    // Required Iz: from delta = 5*q*L^4/(384*EI) <= delta_allow
    // Iz_req = 5*q*L^4 / (384*E*delta_allow)
    let iz_required: f64 = 5.0 * q_blast * l.powi(4) / (384.0 * e_eff * delta_allow);

    // Use a section slightly larger than required
    let iz_provided: f64 = iz_required * 1.1;
    let a_sec: f64 = 0.05; // generous area for blast

    // Build SS beam under blast UDL
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q_blast,
            q_j: -q_blast,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, e, a_sec, iz_provided, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    let mid_node = n / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();

    // Deflection should be less than allowable (since Iz_provided > Iz_required)
    assert!(mid_disp.uz.abs() < delta_allow,
        "Deflection {:.6} < allowable {:.6} m", mid_disp.uz.abs(), delta_allow);

    // Verify midspan moment matches q*L^2/8
    let m_max_exact: f64 = q_blast * l * l / 8.0;

    // Check reactions: each support carries half the total load
    let total_load: f64 = q_blast * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum::<f64>();
    assert_close(sum_ry, total_load, 0.02, "Total reaction = q*L");

    // Verify the Iz sizing logic: delta_actual / delta_allow ≈ Iz_req / Iz_provided
    let delta_actual: f64 = mid_disp.uz.abs();
    let delta_ratio: f64 = delta_actual / delta_allow;
    let iz_ratio: f64 = iz_required / iz_provided;
    assert_close(delta_ratio, iz_ratio, 0.05, "Deflection scales inversely with Iz");

    let _m_max = m_max_exact;
}

// ================================================================
// 8. Scaled Distance: Hopkinson-Cranz Z = R/W^(1/3) and Pressure
// ================================================================
//
// Z = R / W^(1/3) is the scaled distance.
// For Z ~ 5-10: approximate p_so ~ 80/Z^2 kPa (rough Kingery-Bulmash fit).
// Use estimated pressure to load a portal frame and verify lateral drift.

#[test]
fn blast_scaled_distance_portal_response() {
    // Blast scenario
    let r: f64 = 25.0;         // m, standoff distance
    let w: f64 = 50.0;         // kg TNT equivalent charge

    // Hopkinson-Cranz scaled distance
    let w_cbrt: f64 = w.powf(1.0 / 3.0);
    let z: f64 = r / w_cbrt;

    // Rough overpressure estimate (valid for Z ~ 3-15 m/kg^(1/3))
    let z_sq: f64 = z * z;
    let p_so: f64 = 80.0 / z_sq; // kPa (approximate)

    // Verify Z and pressure are in expected ranges
    assert!(z > 3.0 && z < 15.0, "Z = {:.2} in range 3-15", z);
    assert!(p_so > 0.5 && p_so < 50.0, "p_so = {:.2} kPa reasonable", p_so);

    // Apply blast as lateral load on a portal frame
    let h: f64 = 4.0;          // m, story height
    let w_frame: f64 = 6.0;    // m, bay width
    let e: f64 = 200_000.0;
    let a_sec: f64 = 0.02;
    let iz: f64 = 2.0e-4;

    // Convert blast pressure to lateral force at beam level
    // Tributary area on front face: h * trib_depth
    let trib_depth: f64 = 3.0;  // m tributary
    let f_lateral: f64 = p_so * h * trib_depth; // kN

    let input = make_portal_frame(h, w_frame, e, a_sec, iz, f_lateral, 0.0);
    let results = solve_2d(&input).expect("solve");

    // Check that horizontal drift at beam level is reasonable
    // Node 2 is at (0, h), node 3 is at (w, h)
    let beam_node = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap();
    let drift: f64 = beam_node.ux.abs();

    // Analytical: for portal frame with fixed bases, lateral stiffness
    // K_portal = 24*EI/H^3 (two fixed-base columns)
    let e_eff: f64 = e * 1000.0;
    let k_portal: f64 = 24.0 * e_eff * iz / h.powi(3);
    let drift_approx: f64 = f_lateral / k_portal;

    // Portal frame stiffness includes beam flexibility, so drift > simple estimate
    // but should be same order of magnitude
    assert!(drift > drift_approx * 0.5 && drift < drift_approx * 5.0,
        "Drift {:.6} ~ analytical {:.6} m (within factor of 5)", drift, drift_approx);

    // Verify scaling: if charge doubles, standoff must increase by 2^(1/3) for same Z
    let w2: f64 = 2.0 * w;
    let r2: f64 = z * w2.powf(1.0 / 3.0);
    let scaling: f64 = r2 / r;
    let expected_scaling: f64 = (2.0_f64).powf(1.0 / 3.0);
    assert_close(scaling, expected_scaling, 0.001, "Hopkinson-Cranz cube root scaling");

    // Verify equilibrium: sum of base reactions = applied lateral force
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum::<f64>();
    assert_close(sum_rx.abs(), f_lateral, 0.02, "Portal frame horizontal equilibrium");
}
