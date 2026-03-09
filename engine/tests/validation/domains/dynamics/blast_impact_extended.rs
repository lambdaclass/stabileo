/// Validation: Blast and Impact Resistant Structural Design (Extended)
///
/// References:
///   - UFC 3-340-02: Structures to Resist the Effects of Accidental Explosions
///   - ASCE 59-11: Blast Protection of Buildings
///   - Krauthammer: "Modern Protective Structures" (2008)
///   - Mays & Smith: "Blast Effects on Buildings" 2nd ed. (2012)
///   - Biggs: "Introduction to Structural Dynamics" (1964)
///   - ConWep: Kingery-Bulmash blast parameter calculations
///   - EN 1991-1-7: Accidental Actions (impact and explosions)
///   - DoD Minimum Antiterrorism Standards (UFC 4-010-01)
///
/// Tests verify Hopkinson scaling, reflected pressure amplification,
/// SDOF equivalent static beam response, dynamic load factor on frames,
/// vehicle impact bollard design, protective wall resistance, fragment
/// penetration energy balance, and blast venting pressure relief.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E_STEEL: f64 = 200_000.0;  // MPa (solver multiplies by 1000 -> kN/m^2)
const A_BEAM: f64 = 0.01;        // m^2
const IZ_BEAM: f64 = 1e-4;       // m^4

// ================================================================
// 1. Hopkinson Scaled Distance — Charge Weight Equivalence
// ================================================================
//
// Hopkinson-Cranz (cube-root) scaling: Z = R / W^(1/3)
// At a given scaled distance Z, peak overpressure, impulse/W^(1/3),
// and positive phase duration/W^(1/3) are constant.
//
// Two scenarios at the same Z must produce the same peak overpressure.
// We model the resulting equivalent static pressure on a fixed-fixed
// beam and verify that both scenarios yield identical midspan deflection.
//
// Reference: UFC 3-340-02, Chapter 2; Baker et al. (1983) Sec. 2.3

#[test]
fn blast_hopkinson_scaled_distance_beam() {
    // Scenario A: W1 = 50 kg TNT at R1 = 15 m
    let w1: f64 = 50.0;
    let r1: f64 = 15.0;
    let z1: f64 = r1 / w1.powf(1.0 / 3.0);

    // Scenario B: W2 = 400 kg TNT — find R2 for same Z
    let w2: f64 = 400.0;
    let r2: f64 = z1 * w2.powf(1.0 / 3.0);

    // Both have the same scaled distance
    let z2: f64 = r2 / w2.powf(1.0 / 3.0);
    let z_diff: f64 = (z1 - z2).abs();
    assert!(
        z_diff < 1e-10,
        "Scaled distances must match: Z1={:.4}, Z2={:.4}", z1, z2
    );

    // R2/R1 = (W2/W1)^(1/3) = (8)^(1/3) = 2.0
    let r_ratio: f64 = r2 / r1;
    let expected_ratio: f64 = (w2 / w1).powf(1.0 / 3.0);
    assert_close(r_ratio, expected_ratio, 0.02, "Hopkinson standoff ratio");

    // At the same Z, the peak overpressure is the same -> same equivalent
    // static load on a beam. Model a fixed-fixed beam under that uniform load.
    // Use Kingery-Bulmash rough approximation: p_so ~ 80/Z^2 kPa
    let z_sq: f64 = z1 * z1;
    let p_so: f64 = 80.0 / z_sq; // kPa peak overpressure

    // Tributary width of 1.0 m => line load q = p_so kN/m
    let q = -p_so; // downward

    let l = 4.0;
    let n = 8;
    let e_eff: f64 = E_STEEL * 1000.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E_STEEL, A_BEAM, IZ_BEAM, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical midspan deflection for fixed-fixed UDL: delta = q*L^4/(384*EI)
    let delta_exact: f64 = q.abs() * l.powi(4) / (384.0 * e_eff * IZ_BEAM);

    let mid = n / 2 + 1;
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let error: f64 = (mid_d.uy.abs() - delta_exact).abs() / delta_exact;

    assert!(
        error < 0.05,
        "Hopkinson beam: solver delta={:.6e}, exact={:.6e}, err={:.1}%",
        mid_d.uy.abs(), delta_exact, error * 100.0
    );
}

// ================================================================
// 2. Reflected Pressure — Normal Incidence on Protective Wall
// ================================================================
//
// Blast wave reflecting off a rigid wall amplifies pressure.
// C_r = 2 + 6*(p_so/p_0) / (7 + p_so/p_0)  (ideal gas, gamma=1.4)
// Acoustic limit: C_r -> 2; strong shock: C_r -> 8.
//
// Model a simply-supported wall strip under reflected pressure and
// verify midspan deflection matches wL^4/(384EI) * (5/1) correction
// (SS vs fixed): delta_ss = 5*q*L^4/(384*EI).
//
// Reference: UFC 3-340-02 Fig. 2-15; Mays & Smith Ch. 3

#[test]
fn blast_reflected_pressure_wall_strip() {
    let p_atm: f64 = 101.325; // kPa
    let p_so: f64 = 200.0;    // kPa peak incident overpressure

    // Reflection coefficient
    let ratio: f64 = p_so / p_atm;
    let cr: f64 = 2.0 + 6.0 * ratio / (7.0 + ratio);
    let pr: f64 = cr * p_so; // reflected pressure

    // C_r should be between 2 and 8
    assert!(
        cr > 2.0 && cr < 8.0,
        "Reflection coefficient Cr={:.3} (expected 2 < Cr < 8)", cr
    );

    // Model wall strip (simply supported, tributary width = 1 m)
    let q = -pr; // kN/m (negative = downward in solver convention)
    let l = 3.0; // m, wall span between supports
    let n = 8;
    let e_eff: f64 = E_STEEL * 1000.0;

    // Use thicker section for wall strip
    let a_wall: f64 = 0.02;   // m^2
    let iz_wall: f64 = 5e-4;  // m^4

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E_STEEL, a_wall, iz_wall, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // SS beam midspan deflection: delta = 5*q*L^4/(384*EI)
    let delta_exact: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * iz_wall);

    let mid = n / 2 + 1;
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let error: f64 = (mid_d.uy.abs() - delta_exact).abs() / delta_exact;

    assert!(
        error < 0.05,
        "Reflected pressure wall: solver={:.6e}, exact={:.6e}, err={:.1}%",
        mid_d.uy.abs(), delta_exact, error * 100.0
    );

    // Verify reflected pressure is significantly amplified
    assert!(
        pr > 2.0 * p_so,
        "Reflected pressure {:.0} > 2x incident {:.0} kPa", pr, p_so
    );
}

// ================================================================
// 3. SDOF Equivalent — Beam Under Blast Load
// ================================================================
//
// Biggs SDOF method: real beam -> equivalent SDOF system.
// For simply-supported beam with uniform load:
//   K_L = 0.64, K_M = 0.50 (elastic phase)
//   K_LM = K_M/K_L = 0.78125
//   Equivalent stiffness: Ke = K_L * (384*EI/(5*L^3))
//   Equivalent mass: Me = K_M * m * L
//
// Verify that the static resistance R_u = (8*M_p)/L for a SS beam
// gives the correct reaction distribution: R_total = q*L.
//
// Reference: Biggs (1964), Table 5.1; UFC 3-340-02 Ch. 3

#[test]
fn blast_sdof_equivalent_beam_stiffness() {
    // Simply-supported beam parameters
    let l: f64 = 5.0;
    let n = 10;
    let e_eff: f64 = E_STEEL * 1000.0;

    // Transformation factors (elastic, SS, uniform load)
    let kl: f64 = 0.64;
    let km: f64 = 0.50;
    let klm: f64 = km / kl;

    assert!(
        (klm - 0.78125).abs() < 0.01,
        "KLM={:.5}, expected 0.78125", klm
    );

    // Beam stiffness for uniform load: K = 384*EI/(5*L^3)
    let k_beam: f64 = 384.0 * e_eff * IZ_BEAM / (5.0 * l.powi(3));

    // Equivalent stiffness
    let ke: f64 = kl * k_beam;
    assert!(ke > 0.0, "Equivalent stiffness Ke={:.2} kN/m", ke);

    // Apply a known uniform load and verify solver reaction sum = q*L
    let q = -20.0; // kN/m
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E_STEEL, A_BEAM, IZ_BEAM, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total vertical reaction should equal total applied load (equilibrium)
    let total_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_applied: f64 = q.abs() * l;

    assert_close(total_ry, total_applied, 0.02, "SDOF beam equilibrium: sum(Ry) = q*L");

    // Midspan deflection check: delta = 5*q*L^4/(384*EI)
    let delta_exact: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ_BEAM);
    let mid = n / 2 + 1;
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    assert_close(mid_d.uy.abs(), delta_exact, 0.05, "SDOF beam midspan deflection");
}

// ================================================================
// 4. Dynamic Load Factor — Portal Frame Under Lateral Blast
// ================================================================
//
// DLF converts dynamic blast load to equivalent static load.
// For triangular pulse with td/T ratio:
//   td/T << 1 (impulsive): DLF < 1
//   td/T ~ 0.8: DLF ~ 1.8 (peak for triangular pulse)
//   td/T >> 1 (quasi-static): DLF -> 2.0
//
// We apply DLF * F_blast as equivalent static lateral load on a
// portal frame and verify frame reactions balance the applied load.
//
// Reference: Biggs (1964) Fig. 2.14; UFC 3-340-02 Fig. 3-49

#[test]
fn blast_dynamic_load_factor_portal() {
    // Blast parameters
    let f_blast: f64 = 100.0; // kN, peak lateral force
    let dlf: f64 = 1.8;       // DLF for td/T ~ 0.8 (triangular pulse)

    // Equivalent static lateral load
    let f_equiv: f64 = dlf * f_blast; // 180 kN

    // DLF for triangular pulse should be < 2.0 (step load limit)
    assert!(
        dlf > 0.0 && dlf < 2.0,
        "DLF={:.2} must be between 0 and 2", dlf
    );

    // Model portal frame: fixed-fixed, lateral load at beam level
    let h = 4.0;
    let w = 6.0;
    let input = make_portal_frame(h, w, E_STEEL, A_BEAM, IZ_BEAM, f_equiv, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Horizontal equilibrium: sum of Rx at supports = -F_equiv
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(
        sum_rx, -f_equiv, 0.02,
        "Portal blast: horizontal equilibrium sum(Rx) = -F"
    );

    // Frame sway displacement at beam level (nodes 2, 3) should be equal
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    let sway_diff: f64 = (d2.ux - d3.ux).abs();
    assert!(
        sway_diff < 0.01 * d2.ux.abs().max(1e-10),
        "Beam-level sway: node2={:.6e}, node3={:.6e}, diff={:.6e}",
        d2.ux, d3.ux, sway_diff
    );

    // Approximate check: for a fixed-fixed portal under lateral load at top,
    // lateral stiffness K ~ 24*EI/h^3 (two fixed columns)
    // delta ~ F / K
    let e_eff: f64 = E_STEEL * 1000.0;
    let k_frame: f64 = 24.0 * e_eff * IZ_BEAM / h.powi(3);
    let delta_approx: f64 = f_equiv / k_frame;

    // Frame with beam has slightly different stiffness but should be same order
    let solver_sway: f64 = d2.ux.abs();
    let ratio: f64 = solver_sway / delta_approx;
    assert!(
        ratio > 0.3 && ratio < 3.0,
        "Sway ratio solver/approx = {:.2} (order-of-magnitude check)", ratio
    );
}

// ================================================================
// 5. Vehicle Impact Bollard — EN 1991-1-7 Equivalent Static
// ================================================================
//
// Vehicle impact on protective bollard: equivalent static force.
// EN 1991-1-7 Table 4.1: design force for car impact = 150 kN,
// for truck impact = 500 kN at bumper height ~ 0.5 m.
//
// Model bollard as a cantilever beam (fixed at base, free at top)
// with point load at impact height. Check tip deflection and base
// moment against analytical formulas.
//
// Reference: EN 1991-1-7 Sec. 4.3; UFC 4-010-01 Sec. B-4

#[test]
fn blast_vehicle_impact_bollard() {
    // Bollard properties (steel pipe, 200mm dia, 10mm wall)
    let d_outer: f64 = 0.200;
    let t_wall: f64 = 0.010;
    let d_inner: f64 = d_outer - 2.0 * t_wall;
    let a_bollard: f64 = std::f64::consts::PI / 4.0
        * (d_outer * d_outer - d_inner * d_inner);
    let iz_bollard: f64 = std::f64::consts::PI / 64.0
        * (d_outer.powi(4) - d_inner.powi(4));

    // Bollard height and impact force
    let h_bollard = 1.2; // m, total height above ground
    let f_impact: f64 = 150.0; // kN, car impact (EN 1991-1-7)
    let _h_impact = 0.5; // m, bumper height

    // Model as cantilever with point load at impact height
    // Use 4 elements over the full height; load at node closest to 0.5m
    let n = 4;
    let elem_len: f64 = h_bollard / n as f64; // 0.3 m per element

    // Impact at 0.5m -> closest node is node 2 at 0.3m or node 3 at 0.6m
    // Use node 3 (0.6m from base) as closest to 0.5m impact height
    let impact_node = 3;
    let actual_impact_h: f64 = (impact_node - 1) as f64 * elem_len;

    // Build cantilever along Y direction (beam along X in solver)
    // For a vertical bollard, we model it horizontally with:
    //   - fixed at node 1 (base)
    //   - free end at node n+1 (top)
    //   - lateral force as fy at impact node
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: impact_node, fx: 0.0, fy: -f_impact, mz: 0.0,
    })];

    let input = make_beam(n, h_bollard, E_STEEL, a_bollard, iz_bollard, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical: cantilever with point load P at distance a from fixed end
    // Tip deflection: delta_tip = P*a^2*(3L - a)/(6*EI)
    // Base moment: M_base = P * a
    let e_eff: f64 = E_STEEL * 1000.0;
    let a_load: f64 = actual_impact_h;
    let delta_tip_exact: f64 = f_impact * a_load * a_load
        * (3.0 * h_bollard - a_load) / (6.0 * e_eff * iz_bollard);

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(
        tip.uy.abs(), delta_tip_exact, 0.05,
        "Bollard tip deflection"
    );

    // Base moment check: M = P * a
    let m_base_exact: f64 = f_impact * a_load;
    let base_reaction = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(
        base_reaction.mz.abs(), m_base_exact, 0.05,
        "Bollard base moment"
    );

    // Base shear check: V = P
    assert_close(
        base_reaction.ry.abs(), f_impact, 0.02,
        "Bollard base shear"
    );
}

// ================================================================
// 6. Protective Wall Design — Fixed-Fixed Under Blast Pressure
// ================================================================
//
// Reinforced concrete wall resisting blast: modeled as fixed-fixed
// beam strip under uniform pressure. Check midspan deflection and
// fixed-end moments against standard formulas.
//
// M_fixed = q*L^2/12 (at supports), M_mid = q*L^2/24 (at midspan)
// delta_mid = q*L^4/(384*EI)
//
// Reference: UFC 3-340-02 Ch. 4; Krauthammer (2008) Sec. 6.4

#[test]
fn blast_protective_wall_fixed_beam() {
    // Wall properties (300mm thick RC, 1m strip)
    let t_wall: f64 = 0.300;
    let b_strip: f64 = 1.0;
    let a_wall: f64 = b_strip * t_wall; // 0.30 m^2
    let iz_wall: f64 = b_strip * t_wall.powi(3) / 12.0; // 2.25e-3 m^4

    // Concrete E = 30,000 MPa
    let e_conc: f64 = 30_000.0;
    let e_eff: f64 = e_conc * 1000.0;

    // Blast pressure (reflected, short standoff)
    let p_blast: f64 = 150.0; // kPa
    let q = -p_blast * b_strip; // kN/m line load on strip (negative = downward)

    // Wall span
    let l = 3.5;
    let n = 10;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, e_conc, a_wall, iz_wall, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan deflection: delta = q*L^4/(384*EI)
    let delta_exact: f64 = q.abs() * l.powi(4) / (384.0 * e_eff * iz_wall);
    let mid = n / 2 + 1;
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    assert_close(
        mid_d.uy.abs(), delta_exact, 0.05,
        "Protective wall midspan deflection"
    );

    // Fixed-end moment: M = q*L^2/12
    let m_fixed_exact: f64 = q.abs() * l * l / 12.0;

    // Check reactions at both supports
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(
        r1.mz.abs(), m_fixed_exact, 0.05,
        "Wall fixed-end moment (left)"
    );
    assert_close(
        r_end.mz.abs(), m_fixed_exact, 0.05,
        "Wall fixed-end moment (right)"
    );

    // Vertical reaction: R = q*L/2 at each support
    let r_vert_exact: f64 = q.abs() * l / 2.0;
    assert_close(
        r1.ry.abs(), r_vert_exact, 0.02,
        "Wall support reaction"
    );

    // Element forces at midspan: moment should be q*L^2/24
    let m_mid_exact: f64 = q.abs() * l * l / 24.0;
    // The element near midspan (element n/2) should have moments near this value
    let mid_elem = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();

    // m_end of element n/2 is at the midspan side
    let m_mid_solver: f64 = mid_elem.m_end.abs();
    assert_close(
        m_mid_solver, m_mid_exact, 0.15,
        "Wall midspan moment (from element forces)"
    );
}

// ================================================================
// 7. Fragment Penetration — Energy-Based Depth Estimate
// ================================================================
//
// A steel fragment impacting a structural member transfers kinetic
// energy. The equivalent static force is derived from energy balance:
//   KE = 0.5 * m_f * v_f^2
//   F_eq = KE / d_pen (penetration depth)
//
// We model a simply-supported beam hit at midspan by the equivalent
// static force and verify deflection matches P*L^3/(48*EI).
//
// Reference: UFC 3-340-02 Ch. 5; DoD 6055.9-STD

#[test]
fn blast_fragment_penetration_beam() {
    // Fragment properties
    let m_frag: f64 = 0.050;     // kg (50g fragment)
    let v_frag: f64 = 800.0;     // m/s (typical primary fragment velocity)
    let d_pen: f64 = 0.025;      // m (25mm penetration into mild steel)

    // Kinetic energy
    let ke: f64 = 0.5 * m_frag * v_frag * v_frag; // Joules = N*m
    // = 0.5 * 0.05 * 640000 = 16000 J

    assert!(
        ke > 1000.0,
        "Fragment KE = {:.0} J", ke
    );

    // Equivalent static force
    let f_eq: f64 = ke / d_pen / 1000.0; // convert N to kN
    // = 16000 / 0.025 / 1000 = 640 kN

    assert!(
        f_eq > 100.0,
        "Equivalent static force = {:.0} kN", f_eq
    );

    // Model SS beam with midspan point load
    let l = 3.0;
    let n = 8;
    let e_eff: f64 = E_STEEL * 1000.0;

    // Use heavier section to keep deflections reasonable
    let a_heavy: f64 = 0.05;
    let iz_heavy: f64 = 5e-4;

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -f_eq, mz: 0.0,
    })];

    let input = make_beam(n, l, E_STEEL, a_heavy, iz_heavy, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical: delta = P*L^3/(48*EI) for SS beam center point load
    let delta_exact: f64 = f_eq * l.powi(3) / (48.0 * e_eff * iz_heavy);

    let mid_d = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let error: f64 = (mid_d.uy.abs() - delta_exact).abs() / delta_exact;

    assert!(
        error < 0.05,
        "Fragment impact beam: solver={:.6e}, exact PL^3/(48EI)={:.6e}, err={:.1}%",
        mid_d.uy.abs(), delta_exact, error * 100.0
    );

    // Reactions should each be P/2
    let total_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(total_ry, f_eq, 0.02, "Fragment beam equilibrium: sum(Ry) = P");

    // Midspan moment: M = P*L/4
    let m_mid_exact: f64 = f_eq * l / 4.0;
    let mid_elem = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    assert_close(
        mid_elem.m_end.abs(), m_mid_exact, 0.10,
        "Fragment beam midspan moment"
    );
}

// ================================================================
// 8. Blast Vent Pressure — Reduced Internal Loading on Frame
// ================================================================
//
// Buildings with blow-out panels (frangible walls/vents) release
// internal pressure, reducing loads on the structural frame.
// Vented pressure: p_vent = p_internal * (1 - A_vent/A_wall)
// where A_vent = vent area, A_wall = total wall area.
//
// Compare portal frame response with full blast pressure vs.
// vented (reduced) pressure. Vented case must have proportionally
// smaller lateral displacement.
//
// Reference: UFC 3-340-02 Sec. 2-15; NFPA 68 (venting of deflagrations)

#[test]
fn blast_vent_pressure_relief_frame() {
    let h = 4.0;
    let w = 8.0;
    let a_frame: f64 = 0.015;
    let iz_frame: f64 = 3e-4;

    // Full internal blast pressure (no venting)
    let p_internal: f64 = 50.0; // kPa
    let tributary_h: f64 = h;   // full wall height tributary to beam level
    let f_full: f64 = p_internal * tributary_h; // kN/m * 1m width = 200 kN

    // Vented pressure: 40% of wall area is frangible panels
    let vent_ratio: f64 = 0.40;
    let p_vented: f64 = p_internal * (1.0 - vent_ratio);
    let f_vented: f64 = p_vented * tributary_h;

    // Pressure reduction check
    assert_close(
        p_vented, p_internal * 0.60, 0.02,
        "Vented pressure = 60% of internal"
    );

    // Model both cases as portal frames with lateral load
    let input_full = make_portal_frame(h, w, E_STEEL, a_frame, iz_frame, f_full, 0.0);
    let results_full = linear::solve_2d(&input_full).unwrap();

    let input_vent = make_portal_frame(h, w, E_STEEL, a_frame, iz_frame, f_vented, 0.0);
    let results_vent = linear::solve_2d(&input_vent).unwrap();

    // Beam-level sway comparison (node 2 is at top of left column)
    let sway_full = results_full.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    let sway_vent = results_vent.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Linear system: displacement ratio = force ratio
    let sway_ratio: f64 = sway_vent / sway_full;
    let force_ratio: f64 = f_vented / f_full;

    assert_close(
        sway_ratio, force_ratio, 0.02,
        "Vent sway ratio matches force ratio (linear)"
    );

    // Verify vented case has less sway
    assert!(
        sway_vent < sway_full,
        "Vented sway {:.6e} < full sway {:.6e}", sway_vent, sway_full
    );

    // Equilibrium check on vented case
    let sum_rx_vent: f64 = results_vent.reactions.iter().map(|r| r.rx).sum();
    assert_close(
        sum_rx_vent, -f_vented, 0.02,
        "Vented frame horizontal equilibrium"
    );

    // Base moment sum should also scale linearly
    let sum_mz_full: f64 = results_full.reactions.iter()
        .map(|r| r.mz.abs()).sum();
    let sum_mz_vent: f64 = results_vent.reactions.iter()
        .map(|r| r.mz.abs()).sum();
    let mz_ratio: f64 = sum_mz_vent / sum_mz_full;

    assert_close(
        mz_ratio, force_ratio, 0.05,
        "Vent moment ratio matches force ratio"
    );
}
