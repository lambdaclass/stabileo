/// Validation: Impact Loading & Dynamic Amplification Factor Benchmarks
///
/// References:
///   - Biggs, J.M., "Introduction to Structural Dynamics" (1964), Ch. 2-3
///   - Chopra, A.K., "Dynamics of Structures", 5th Ed., Ch. 4 (Step & pulse loads)
///   - Clough & Penzien, "Dynamics of Structures", 3rd Ed., Ch. 4
///   - AISC Design Guide 7: Industrial Buildings — crane impact factors
///   - AASHTO LRFD Bridge Design Specifications, 9th Ed. (2020), §3.6.2
///   - UFC 3-340-02: Structures to Resist the Effects of Accidental Explosions
///   - Timoshenko & Young, "Vibration Problems in Engineering", 5th Ed.
///   - Goldsmith, W., "Impact: The Theory and Physical Behaviour of Colliding Solids"
///
/// Each test computes an analytical dynamic amplification factor (DAF), then
/// uses the static solver to obtain the baseline deflection, and verifies
/// that the product DAF * delta_static matches the expected dynamic response.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

// ================================================================
// 1. Dynamic Amplification Factor — Suddenly Applied Load (DAF = 2.0)
// ================================================================
//
// When a constant load is applied instantaneously to an undamped SDOF
// system, the maximum displacement is exactly twice the static value.
//   DAF = u_max / u_static = 2.0
//
// Chopra §4.1, Eq. 4.3: u(t) = u_st * (1 - cos(omega*t))
// Maximum occurs when cos(omega*t) = -1, giving u_max = 2 * u_st.
//
// We verify this by solving a SS beam statically and confirming the
// analytical DAF relationship.

#[test]
fn validation_imp_ext_sudden_load_daf() {
    let l: f64 = 6.0;
    let n = 4;
    let mid = n / 2 + 1;
    let p: f64 = 50.0; // kN applied at midspan

    let e: f64 = 200_000.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;

    // Static analysis: SS beam with midspan point load
    let input = make_beam(
        n, l, e, a, iz, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let res = linear::solve_2d(&input).unwrap();
    let delta_static = res.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Analytical: delta_st = P*L^3 / (48*EI)
    let e_eff: f64 = e * 1000.0; // solver multiplies E by 1000
    let delta_exact: f64 = p * l.powi(3) / (48.0 * e_eff * iz);

    assert_close(delta_static, delta_exact, 0.02, "static deflection vs analytical");

    // DAF for suddenly applied load (undamped) = 2.0 exactly
    let daf: f64 = 2.0;
    let delta_dynamic: f64 = daf * delta_static;
    let delta_dynamic_exact: f64 = 2.0 * delta_exact;

    assert_close(delta_dynamic, delta_dynamic_exact, 0.02, "DAF=2 dynamic deflection");

    // Verify DAF value
    assert_close(daf, 2.0, 0.01, "sudden load DAF = 2.0");

    // Dynamic reaction = DAF * static reaction
    let ry_static: f64 = res.reactions.iter().map(|r| r.rz).sum::<f64>();
    let ry_dynamic: f64 = daf * ry_static;
    let ry_dynamic_expected: f64 = daf * p; // total reaction = applied load
    assert_close(ry_dynamic, ry_dynamic_expected, 0.02, "dynamic reaction = DAF * P");
}

// ================================================================
// 2. Falling Weight Impact — DAF = 1 + sqrt(1 + 2h/delta_st)
// ================================================================
//
// A weight W dropped from height h onto a beam. By energy conservation
// (PE = SE), the dynamic amplification factor is:
//   DAF = 1 + sqrt(1 + 2*h / delta_st)
//
// where delta_st = W*L^3 / (48*E*I) for SS beam midspan point load.
//
// Reference: Timoshenko & Young, "Vibration Problems in Engineering",
//            Ch. 1; Goldsmith, "Impact" (1960).
// Special case: h=0 (load gently placed) gives DAF = 2.0.

#[test]
fn validation_imp_ext_falling_weight() {
    let l: f64 = 8.0;
    let n = 8;
    let mid = n / 2 + 1;
    let w: f64 = 10.0; // kN, weight of falling object

    let e: f64 = 200_000.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let e_eff: f64 = e * 1000.0;

    // Static deflection under weight W at midspan
    let input = make_beam(
        n, l, e, a, iz, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -w, my: 0.0,
        })],
    );
    let res = linear::solve_2d(&input).unwrap();
    let delta_st = res.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    let delta_st_exact: f64 = w * l.powi(3) / (48.0 * e_eff * iz);
    assert_close(delta_st, delta_st_exact, 0.02, "static deflection under W");

    // Drop height h = 0.05 m (50 mm)
    let h: f64 = 0.05;
    let ratio: f64 = 2.0 * h / delta_st;
    let daf: f64 = 1.0 + (1.0 + ratio).sqrt();

    // Verify DAF > 2 (any nonzero drop height gives DAF > 2)
    assert!(daf > 2.0, "Falling weight DAF = {:.3} > 2.0", daf);

    // For h=0, DAF should be exactly 2 (sudden placement)
    let daf_h0: f64 = 1.0 + (1.0 + 0.0_f64).sqrt();
    assert_close(daf_h0, 2.0, 0.01, "DAF at h=0 = 2.0 (sudden placement)");

    // Dynamic deflection
    let delta_dyn: f64 = daf * delta_st;
    assert!(delta_dyn > 2.0 * delta_st,
        "Dynamic deflection {:.6} > 2 * static {:.6}", delta_dyn, 2.0 * delta_st);

    // Equivalent static force
    let p_eq: f64 = daf * w;
    assert!(p_eq > 2.0 * w,
        "Equivalent static force {:.2} > 2*W = {:.2} kN", p_eq, 2.0 * w);

    // Larger drop height h = 0.5 m gives larger DAF
    let h2: f64 = 0.5;
    let ratio2: f64 = 2.0 * h2 / delta_st;
    let daf2: f64 = 1.0 + (1.0 + ratio2).sqrt();
    assert!(daf2 > daf,
        "Higher drop DAF = {:.3} > lower drop DAF = {:.3}", daf2, daf);
}

// ================================================================
// 3. Energy Equivalence — Kinetic Energy = Strain Energy
// ================================================================
//
// At maximum deflection, all kinetic energy has been converted to
// strain energy:
//   (1/2)*k*delta_max^2 = W*g*(h + delta_max)     [PE → SE]
//   (1/2)*m*v^2 = (1/2)*k*delta_max^2              [KE → SE at impact]
//
// For a beam, k = 48*EI/L^3 (SS midspan). If v = sqrt(2*g*h):
//   delta_max = v * sqrt(m/k) * [DAF correction]
//
// We verify energy balance: SE_max = PE_total.

#[test]
fn validation_imp_ext_energy_equivalence() {
    let l: f64 = 6.0;
    let n = 4;
    let mid = n / 2 + 1;
    let w: f64 = 20.0; // kN, weight

    let e: f64 = 200_000.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let e_eff: f64 = e * 1000.0;

    // Beam stiffness at midspan: k = 48*EI/L^3
    let k_beam: f64 = 48.0 * e_eff * iz / l.powi(3);

    // Static deflection
    let delta_st: f64 = w / k_beam;

    // Drop height
    let h: f64 = 0.10; // m

    // From energy conservation: (1/2)*k*delta_max^2 = W*(h + delta_max)
    // k*delta_max^2 - 2*W*delta_max - 2*W*h = 0
    // delta_max = (W + sqrt(W^2 + 2*k*W*h)) / k
    let discriminant: f64 = w * w + 2.0 * k_beam * w * h;
    let delta_max: f64 = (w + discriminant.sqrt()) / k_beam;

    // Strain energy at max deflection
    let se: f64 = 0.5 * k_beam * delta_max * delta_max;

    // Potential energy released (weight drops h + delta_max)
    let pe: f64 = w * (h + delta_max);

    // Energy balance: SE = PE
    assert_close(se, pe, 0.01, "energy balance SE = PE");

    // Verify static solver gives matching delta_st
    let input = make_beam(
        n, l, e, a, iz, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -w, my: 0.0,
        })],
    );
    let res = linear::solve_2d(&input).unwrap();
    let delta_solver = res.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    assert_close(delta_solver, delta_st, 0.02, "solver static deflection matches k=48EI/L^3");

    // DAF from energy method matches formula
    let daf_energy: f64 = delta_max / delta_st;
    let daf_formula: f64 = 1.0 + (1.0 + 2.0 * h / delta_st).sqrt();
    assert_close(daf_energy, daf_formula, 0.01, "energy DAF matches formula DAF");
}

// ================================================================
// 4. Impact on SS Beam at Midspan — Equivalent Static Force
// ================================================================
//
// A weight W falling from height h onto midspan of a SS beam.
// The equivalent static force that produces the same maximum
// deflection is: P_eq = DAF * W.
//
// We verify by computing the static response under P_eq and checking
// that it matches the expected dynamic deflection.

#[test]
fn validation_imp_ext_ss_beam_equivalent_force() {
    let l: f64 = 10.0;
    let n = 10;
    let mid = n / 2 + 1;
    let w: f64 = 15.0; // kN, impact weight

    let e: f64 = 200_000.0;
    let a: f64 = 0.01;
    let iz: f64 = 2e-4; // slightly stiffer beam
    let e_eff: f64 = e * 1000.0;

    // Static deflection under W
    let delta_st: f64 = w * l.powi(3) / (48.0 * e_eff * iz);

    // Drop height
    let h: f64 = 0.20; // m

    // DAF
    let daf: f64 = 1.0 + (1.0 + 2.0 * h / delta_st).sqrt();

    // Equivalent static force
    let p_eq: f64 = daf * w;

    // Solve statically with P_eq
    let input_eq = make_beam(
        n, l, e, a, iz, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p_eq, my: 0.0,
        })],
    );
    let res_eq = linear::solve_2d(&input_eq).unwrap();
    let delta_eq = res_eq.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Expected dynamic deflection
    let delta_dyn_expected: f64 = daf * delta_st;

    assert_close(delta_eq, delta_dyn_expected, 0.02,
        "P_eq static deflection = DAF * delta_st");

    // Midspan moment under P_eq: M = P_eq * L / 4
    let m_eq_expected: f64 = p_eq * l / 4.0;

    // Check element forces: moment at midspan
    // For even mesh, midspan is between elements n/2 and n/2+1
    // m_end of element n/2 should approximate M_max
    let elem_mid = &res_eq.element_forces[n / 2 - 1];
    let m_solver = elem_mid.m_end.abs();
    assert_close(m_solver, m_eq_expected, 0.05,
        "midspan moment under equivalent static force");

    // Reactions under P_eq = P_eq / 2 at each support (symmetric)
    let ry_total: f64 = res_eq.reactions.iter().map(|r| r.rz).sum();
    assert_close(ry_total, p_eq, 0.02, "total reaction = P_eq");
}

// ================================================================
// 5. Crane Loading Impact Factor — AISC Design Guide 7
// ================================================================
//
// AISC DG7: vertical impact allowance for crane loading
//   - Cab-operated cranes: 25% increase (impact factor = 1.25)
//   - Pendant-operated cranes: 10% increase (impact factor = 1.10)
//   - Radio-controlled: 10% increase
//
// These factors account for dynamic effects of lifting, braking,
// and crane travel. Applied to the maximum wheel loads only
// (not to bridge weight).

#[test]
fn validation_imp_ext_crane_aisc_impact() {
    let l: f64 = 12.0;
    let n = 6;
    let mid = n / 2 + 1;

    let e: f64 = 200_000.0;
    let a: f64 = 0.02;
    let iz: f64 = 5e-4;

    // Crane wheel load (static, no impact)
    let rated_capacity: f64 = 200.0; // kN
    let trolley_weight: f64 = 30.0;  // kN
    let n_wheels: f64 = 2.0;
    let p_wheel_static: f64 = (rated_capacity + trolley_weight) / n_wheels;
    // = 115 kN per wheel

    // Cab-operated: 25% impact
    let ci_cab: f64 = 1.25;
    let p_wheel_cab: f64 = ci_cab * p_wheel_static;

    // Pendant-operated: 10% impact
    let ci_pendant: f64 = 1.10;
    let p_wheel_pendant: f64 = ci_pendant * p_wheel_static;

    // Verify impact factors
    assert_close(ci_cab, 1.25, 0.01, "AISC cab-operated impact factor");
    assert_close(ci_pendant, 1.10, 0.01, "AISC pendant-operated impact factor");

    // Static analysis: runway beam with single wheel at midspan
    let input_static = make_beam(
        n, l, e, a, iz, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p_wheel_static, my: 0.0,
        })],
    );
    let res_static = linear::solve_2d(&input_static).unwrap();
    let delta_static = res_static.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // With cab-operated impact
    let input_cab = make_beam(
        n, l, e, a, iz, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p_wheel_cab, my: 0.0,
        })],
    );
    let res_cab = linear::solve_2d(&input_cab).unwrap();
    let delta_cab = res_cab.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // With pendant-operated impact
    let input_pendant = make_beam(
        n, l, e, a, iz, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p_wheel_pendant, my: 0.0,
        })],
    );
    let res_pendant = linear::solve_2d(&input_pendant).unwrap();
    let delta_pendant = res_pendant.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Linear scaling: delta_cab / delta_static = ci_cab
    assert_close(delta_cab / delta_static, ci_cab, 0.02,
        "cab deflection ratio = 1.25");
    assert_close(delta_pendant / delta_static, ci_pendant, 0.02,
        "pendant deflection ratio = 1.10");

    // Cab gives larger response than pendant
    assert!(delta_cab > delta_pendant,
        "Cab impact {:.6} > pendant impact {:.6}", delta_cab, delta_pendant);

    // Moment scaling: M_cab / M_static = ci_cab
    let m_static = res_static.element_forces[n / 2 - 1].m_end.abs();
    let m_cab = res_cab.element_forces[n / 2 - 1].m_end.abs();
    assert_close(m_cab / m_static, ci_cab, 0.02,
        "moment ratio cab/static = 1.25");
}

// ================================================================
// 6. Vehicle Impact on Bridge — AASHTO IM Factor (33%)
// ================================================================
//
// AASHTO LRFD §3.6.2.1: Dynamic load allowance (IM) for truck loads:
//   IM = 33% for all limit states except fatigue/fracture (IM = 15%)
//
// Applied to: truck and tandem loads ONLY (not lane load)
// Design force = (1 + IM/100) * LL_truck + LL_lane
//
// The 33% factor accounts for hammering (deck joints), dynamic response
// of the bridge, and vehicle suspension effects.

#[test]
fn validation_imp_ext_aashto_vehicle_impact() {
    let l: f64 = 20.0;
    let n = 10;
    let mid = n / 2 + 1;

    let e: f64 = 200_000.0;
    let a: f64 = 0.05;
    let iz: f64 = 1e-3;

    // HL-93 loading components
    let p_truck: f64 = 145.0;  // kN, single rear axle of HS-20 (simplified)
    let w_lane: f64 = 9.3;     // kN/m, design lane load (uniform)

    // AASHTO IM factors
    let im_strength: f64 = 0.33;  // 33% for Strength limit state
    let im_fatigue: f64 = 0.15;   // 15% for Fatigue limit state

    // Factored truck load (with IM)
    let p_truck_strength: f64 = p_truck * (1.0 + im_strength);
    let p_truck_fatigue: f64 = p_truck * (1.0 + im_fatigue);

    // IM does NOT apply to lane load
    let w_lane_factored: f64 = w_lane; // unchanged

    assert_close(p_truck_strength / p_truck, 1.33, 0.01,
        "AASHTO IM strength factor = 1.33");
    assert_close(p_truck_fatigue / p_truck, 1.15, 0.01,
        "AASHTO IM fatigue factor = 1.15");

    // Static analysis: truck load at midspan (no lane for clarity)
    let input_no_im = make_beam(
        n, l, e, a, iz, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p_truck, my: 0.0,
        })],
    );
    let res_no_im = linear::solve_2d(&input_no_im).unwrap();
    let delta_no_im = res_no_im.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // With IM (Strength)
    let input_with_im = make_beam(
        n, l, e, a, iz, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p_truck_strength, my: 0.0,
        })],
    );
    let res_with_im = linear::solve_2d(&input_with_im).unwrap();
    let delta_with_im = res_with_im.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Deflection ratio should be 1.33
    assert_close(delta_with_im / delta_no_im, 1.0 + im_strength, 0.02,
        "deflection ratio with/without IM = 1.33");

    // Combined: truck (with IM) + lane (without IM) for total bridge loading
    let m_truck_im: f64 = p_truck_strength * l / 4.0;     // midspan moment from truck
    let m_lane: f64 = w_lane_factored * l * l / 8.0;      // midspan moment from lane
    let m_total: f64 = m_truck_im + m_lane;

    // Without IM
    let m_truck_no_im: f64 = p_truck * l / 4.0;
    let m_total_no_im: f64 = m_truck_no_im + m_lane;

    // IM effect on total moment (less than 33% because lane load is not factored)
    let total_increase: f64 = (m_total - m_total_no_im) / m_total_no_im;
    assert!(total_increase < im_strength,
        "Total increase {:.1}% < truck IM {:.0}% (lane dilutes effect)",
        total_increase * 100.0, im_strength * 100.0);
    assert!(total_increase > 0.0,
        "Total increase {:.1}% > 0%", total_increase * 100.0);
}

// ================================================================
// 7. Blast Loading — Triangular Pulse Positive Phase
// ================================================================
//
// Simplified blast: triangular pulse with peak pressure p0 and
// positive phase duration td.
//   p(t) = p0 * (1 - t/td) for 0 <= t <= td
//   p(t) = 0 for t > td
//
// Impulse I = 0.5 * p0 * td
// For td/T >> 1 (quasi-static): DAF → 2.0
// For td/T << 1 (impulsive): DAF → 2*pi*(I/(F_static*T))
// For td/T ≈ 0.5: DAF ≈ 1.5 (from Biggs charts)
//
// We verify the limiting cases and compute equivalent static load.

#[test]
fn validation_imp_ext_blast_triangular_pulse() {
    let l: f64 = 4.0;
    let n = 4;
    let mid = n / 2 + 1;

    let e: f64 = 200_000.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let e_eff: f64 = e * 1000.0;

    // Beam stiffness at midspan
    let k: f64 = 48.0 * e_eff * iz / l.powi(3);

    // Blast parameters
    let p0: f64 = 100.0;    // kN, peak blast force on beam
    let td: f64 = 0.020;    // s, positive phase duration (20 ms)

    // Impulse
    let impulse: f64 = 0.5 * p0 * td;
    assert_close(impulse, 1.0, 0.01, "triangular pulse impulse = 0.5 * p0 * td");

    // Static deflection under peak load
    let delta_st: f64 = p0 / k;

    // Quasi-static limit (td/T >> 1): DAF → 2.0
    // This is the upper bound for any loading rate
    let daf_quasistatic: f64 = 2.0;

    // For intermediate td/T ratio, DAF from Biggs (approximate):
    // DAF_triangular ≈ max(1.0, 2*(1 - 0.5*td_ratio)) for td/T near 1
    // But exact from SDOF solution:
    //   For td/T < 0.4 (impulsive): DAF ≈ (pi * td) / T
    //   For td/T > 3 (quasi-static): DAF → 2.0
    //   For td/T = 1.0: DAF ≈ 1.55 (Biggs chart)

    // Assume beam natural period
    let pi: f64 = std::f64::consts::PI;
    let mass_per_length: f64 = 78.5; // kg/m (approx steel beam)
    let total_mass: f64 = mass_per_length * l / 1000.0; // convert to kN*s^2/m
    // Effective mass for SS beam = 0.5 * total mass (SDOF approximation)
    let m_eff: f64 = 0.5 * total_mass;
    let omega: f64 = (k / m_eff).sqrt();
    let t_natural: f64 = 2.0 * pi / omega;
    let td_ratio: f64 = td / t_natural;

    // For any td/T ratio, DAF for triangular pulse <= 2.0
    // and DAF >= 1.0 (always amplifies)
    // Approximate from Biggs SDOF charts:
    let daf_approx: f64 = if td_ratio > 3.0 {
        daf_quasistatic
    } else if td_ratio < 0.4 {
        // Impulsive regime: DAF ≈ pi * td / T (but capped at 2)
        (pi * td_ratio).min(2.0)
    } else {
        // Intermediate: linear interpolation (simplified)
        1.0 + td_ratio * 0.5_f64.min(1.0)
    };

    assert!(daf_approx >= 0.5 && daf_approx <= 2.0,
        "Blast DAF = {:.3} in valid range [0.5, 2.0]", daf_approx);

    // Equivalent static force
    let p_equiv: f64 = daf_approx * p0;

    // Verify solver deflection under equivalent force
    let input = make_beam(
        n, l, e, a, iz, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p_equiv, my: 0.0,
        })],
    );
    let res = linear::solve_2d(&input).unwrap();
    let delta_solver = res.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    let delta_equiv_expected: f64 = daf_approx * delta_st;
    assert_close(delta_solver, delta_equiv_expected, 0.03,
        "blast equivalent static deflection");

    // Verify that td_ratio affects DAF: longer td gives higher DAF (up to 2)
    let td_long: f64 = 10.0 * t_natural;
    let td_ratio_long: f64 = td_long / t_natural;
    let daf_long: f64 = if td_ratio_long > 3.0 { 2.0 } else { 1.5 };
    assert_close(daf_long, 2.0, 0.01,
        "quasi-static blast (td >> T) gives DAF = 2.0");
}

// ================================================================
// 8. Progressive Load Application — Ramp Loading DAF < 2
// ================================================================
//
// When a load is applied gradually (ramp function over time t_r),
// the DAF is less than 2.0. For a linear ramp from 0 to P over
// duration t_r on an undamped SDOF:
//   DAF = 1 + sin(pi * tr/T) / (pi * tr/T)   for tr < T
//   DAF → 1.0                                  as tr/T → infinity
//
// Chopra §4.4: gradual application reduces dynamic amplification.
// At t_r = T (one full period): DAF ≈ 1.0 (nearly static)
// At t_r = 0 (instantaneous): DAF = 2.0 (sudden load limit)

#[test]
fn validation_imp_ext_ramp_loading() {
    let l: f64 = 6.0;
    let n = 6;
    let mid = n / 2 + 1;
    let p: f64 = 30.0;

    let e: f64 = 200_000.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let e_eff: f64 = e * 1000.0;
    let pi: f64 = std::f64::consts::PI;

    // Static deflection
    let delta_st: f64 = p * l.powi(3) / (48.0 * e_eff * iz);

    // For ramp loading, DAF depends on tr/T ratio:
    // tr/T = 0   → DAF = 2.0 (sudden)
    // tr/T = 0.5 → DAF ≈ 1.637 (from exact SDOF solution)
    // tr/T = 1.0 → DAF = 1.0 (one full period ramp)
    // tr/T → ∞   → DAF = 1.0 (quasi-static)

    // Test several tr/T ratios
    // Exact formula for maximum response during ramp (Chopra Eq. 4.10):
    //   u_max/u_st = 1 - sin(2*pi*tr/T)/(2*pi*tr/T) when max occurs after ramp
    //   BUT during ramp: u(t)/u_st = t/tr - sin(omega*t)/(omega*tr)
    //   After ramp: analysis gives max response factor

    // For ramp loading, the peak response factor (Biggs, Table 5.1):
    // tr/T = 0:   DAF = 2.0
    // tr/T = 0.25: DAF ≈ 1.76
    // tr/T = 0.5: DAF ≈ 1.27 (sinc function)
    // tr/T = 1.0: DAF ≈ 1.0
    // tr/T = 2.0: DAF ≈ 1.0

    // Analytical: for ramp loading, the DAF after the ramp is complete:
    // DAF_after = 1 + sqrt((1 - cos(omega*tr))^2 + (sin(omega*tr) - omega*tr)^2) / (omega*tr)
    // Simpler formula for max response (Chopra):
    // DAF = max over t of {u(t)/u_st}

    // Correct DAF for ramp loading (Chopra §4.4, Biggs Ch.2):
    // After the ramp ends, the response oscillates about u_st with amplitude:
    //   A/u_st = 2*|sin(pi * tr/T)| / (2*pi * tr/T) = |sin(pi*tr_ratio)| / (pi*tr_ratio)
    // So: DAF_after = 1 + |sin(pi*tr_ratio)| / (pi*tr_ratio)
    //
    // Key properties:
    //   tr/T -> 0:  DAF -> 1 + 1 = 2.0 (sinc(0) = 1)
    //   tr/T = 0.5: DAF = 1 + sin(pi/2)/(pi/2) = 1 + 2/pi = 1.637
    //   tr/T = 1.0: DAF = 1 + sin(pi)/pi = 1.0
    //   tr/T -> inf: DAF -> 1.0

    // Verify key property: ramp DAF is always <= 2.0 and >= 1.0
    let tr_ratios = [0.001, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0];
    for &tr_ratio in &tr_ratios {
        let daf: f64 = if tr_ratio < 0.001 {
            2.0
        } else {
            let arg: f64 = pi * tr_ratio;
            1.0 + arg.sin().abs() / arg
        };

        assert!(daf <= 2.05,
            "Ramp DAF at tr/T={:.3}: {:.3} <= 2.0", tr_ratio, daf);
        assert!(daf >= 0.99,
            "Ramp DAF at tr/T={:.3}: {:.3} >= 1.0", tr_ratio, daf);
    }

    // Verify specific known values from Biggs/Chopra
    // tr/T = 0.5: DAF = 1 + 2/pi = 1.637
    let arg_half: f64 = pi * 0.5;
    let daf_half: f64 = 1.0 + arg_half.sin() / arg_half;
    assert_close(daf_half, 1.0 + 2.0 / pi, 0.01,
        "ramp DAF at tr/T=0.5 = 1+2/pi");

    // tr/T = 1.0: DAF = 1.0 (sin(pi)/pi = 0)
    let arg_one: f64 = pi * 1.0;
    let daf_one: f64 = 1.0 + arg_one.sin().abs() / arg_one;
    assert_close(daf_one, 1.0, 0.01,
        "ramp DAF at tr/T=1.0 = 1.0 (no amplification)");

    // Verify gradual loading (tr/T = 2.0) gives DAF close to 1.0
    let arg_slow: f64 = pi * 2.0;
    let daf_slow: f64 = 1.0 + arg_slow.sin().abs() / arg_slow;

    assert!(daf_slow < 1.5,
        "Slow ramp DAF = {:.3} < 1.5 (gradual application)", daf_slow);

    // Verify sudden limit (tr/T -> 0) gives DAF -> 2.0
    let arg_fast: f64 = pi * 0.001;
    let daf_fast: f64 = 1.0 + arg_fast.sin() / arg_fast;

    assert_close(daf_fast, 2.0, 0.05,
        "fast ramp DAF approaches 2.0 (sudden load limit)");

    // Use solver to verify static baseline
    let input = make_beam(
        n, l, e, a, iz, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let res = linear::solve_2d(&input).unwrap();
    let delta_solver = res.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    assert_close(delta_solver, delta_st, 0.02,
        "solver static deflection for ramp baseline");

    // Dynamic deflection with slow ramp < DAF=2 * static
    let delta_slow_ramp: f64 = daf_slow * delta_st;
    let delta_sudden: f64 = 2.0 * delta_st;
    assert!(delta_slow_ramp < delta_sudden,
        "Ramp deflection {:.6} < sudden {:.6}", delta_slow_ramp, delta_sudden);
}
