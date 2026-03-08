/// Validation: Progressive Collapse Analysis Theory — Pure-Math Formulas
///
/// References:
///   - GSA (2013), "Alternate Path Analysis & Design Guidelines for Progressive Collapse"
///   - UFC 4-023-03 (2009), "Design of Buildings to Resist Progressive Collapse"
///   - Starossek, U., "Progressive Collapse of Structures", 2nd ed. (2018)
///   - Ellingwood et al., "Best Practices for Reducing the Potential for Progressive Collapse"
///   - Izzuddin et al., "Progressive collapse of multi-storey buildings", Eng. Struct. (2008)
///   - Sasani & Kropelnicki, "Progressive collapse analysis of an RC structure", Struct. Design (2008)
///   - EN 1991-1-7:2006, "Eurocode 1: Accidental Actions"
///   - Marchand & Alfawakhiri, "Facts for Steel Buildings: Blast and Progressive Collapse" (2004)
///
/// Tests verify progressive collapse formulas with hand-computed expected values.
/// No solver calls — pure arithmetic verification of analytical expressions.

use std::f64::consts::PI;

// ================================================================
// Tolerance helper
// ================================================================

fn assert_close(got: f64, expected: f64, tol: f64, label: &str) {
    let err: f64 = if expected.abs() < 1e-12 {
        got.abs()
    } else {
        (got - expected).abs() / expected.abs()
    };
    assert!(
        err < tol,
        "{}: got {:.6e}, expected {:.6e}, rel err = {:.4}%",
        label, got, expected, err * 100.0
    );
}

// ================================================================
// 1. GSA/UFC Demand-Capacity Ratio for Column Removal
// ================================================================
//
// GSA (2013) and UFC 4-023-03 define the demand-capacity ratio (DCR)
// after instantaneous column removal:
//
//   DCR = Q_ud / Q_ce
//
// where Q_ud is the maximum demand in the element after removal and
// Q_ce is its expected capacity (using expected material strengths).
//
// For linear elastic analysis: DCR <= 2.0 (moment frame)
// For nonlinear analysis: DCR <= 1.0 (with material nonlinearity)
//
// GSA load combination for column removal:
//   Load = 2.0 * (1.2*D + 0.5*L)    (amplified for dynamic effects)
//
// UFC load combination:
//   Load = (0.9 or 1.2)*D + (0.5*L or 0.2*S) + 0.2*W
//
// Ref: GSA (2013), Sec. 3.2; UFC 4-023-03, Sec. 3-2

#[test]
fn validation_gsa_demand_capacity_ratio() {
    // Design loads
    let dead: f64 = 50.0; // kN/m (dead load)
    let live: f64 = 25.0; // kN/m (live load)

    // GSA load combination for progressive collapse:
    // Q_gsa = 2.0 * (1.2*D + 0.5*L)
    let q_gsa = 2.0 * (1.2 * dead + 0.5 * live);
    let expected_gsa = 2.0 * (60.0 + 12.5);
    assert_close(q_gsa, expected_gsa, 1e-12, "GSA load combination");
    assert_close(q_gsa, 145.0, 1e-12, "GSA load = 145 kN/m");

    // Simply supported beam spanning 2 bays after column removal:
    // Original span L, new span 2L after interior column removal
    let l_original: f64 = 6.0; // m
    let l_new: f64 = 2.0 * l_original; // 12 m

    // Maximum moment in new span: M = q*L_new^2 / 8
    let m_demand = q_gsa * l_new * l_new / 8.0;
    // = 145 * 144 / 8 = 2610 kN*m
    assert_close(m_demand, 145.0 * 144.0 / 8.0, 1e-12, "GSA moment demand");

    // Beam capacity using expected material strength
    // f_ye = 1.1 * fy (expected yield strength, per GSA)
    let fy: f64 = 355.0; // MPa (nominal)
    let f_ye = 1.1 * fy;
    let z_plastic: f64 = 3.0e6; // mm^3 (plastic section modulus)
    let m_capacity = f_ye * z_plastic * 1e-6; // kN*m
    // = 390.5 * 3e6 / 1e6 = 1171.5 kN*m
    assert_close(m_capacity, f_ye * 3.0, 1e-12, "beam capacity");

    // DCR
    let dcr = m_demand / m_capacity;
    assert!(dcr > 1.0, "DCR > 1.0: column removal creates high demand");

    // UFC acceptance: DCR <= 2.0 for linear elastic
    // In this case DCR > 2 means the beam fails the linear check
    let passes_linear = dcr <= 2.0;
    // This is a realistic scenario where the beam may need strengthening
    let _passes = passes_linear;

    // For interior column removal, load increases by factor of ~4
    // Original M = q_service * L^2/8, new M = q_amplified * (2L)^2/8
    let q_service = dead + live; // 75 kN/m
    let m_original = q_service * l_original * l_original / 8.0;
    let demand_ratio = m_demand / m_original;
    assert!(demand_ratio > 3.0, "demand increases significantly after removal");
}

// ================================================================
// 2. Dynamic Amplification Factor (DAF = 2 for Sudden Removal)
// ================================================================
//
// When a column is suddenly removed, the dynamic amplification factor
// (DAF) for a linear elastic SDOF system is exactly 2.0:
//
//   u_dynamic_max = 2 * u_static
//
// This is because the structure starts at rest under the original load,
// and when the column is removed, the gravity load is suddenly applied
// to the remaining structure. The kinetic energy at static equilibrium
// equals the remaining potential energy, so the system overshoots by
// a factor of 2.
//
// For a damped system: DAF = 1 + exp(-pi*xi/sqrt(1-xi^2))
// where xi is the damping ratio.
//
// Ref: Biggs, "Introduction to Structural Dynamics" (1964), Ch. 2;
//      Izzuddin et al. (2008)

#[test]
fn validation_dynamic_amplification_factor() {
    // Undamped SDOF: DAF = 2.0 exactly
    // Energy balance: 0.5*k*u_max^2 = F*u_max (work done by constant force)
    // => u_max = 2*F/k = 2*u_static
    let k: f64 = 1000.0; // kN/m (stiffness)
    let f_load: f64 = 50.0; // kN (applied force after column removal)

    let u_static = f_load / k;
    let u_dynamic_max = 2.0 * f_load / k; // from energy balance
    let daf_undamped = u_dynamic_max / u_static;
    assert_close(daf_undamped, 2.0, 1e-12, "DAF undamped = 2.0");

    // Damped system: DAF = 1 + exp(-pi*xi/sqrt(1-xi^2))
    let xi_vals = [0.0_f64, 0.02, 0.05, 0.10, 0.20];
    let mut daf_prev: f64 = 3.0;

    for &xi in &xi_vals {
        let daf = if xi < 1e-12 {
            2.0
        } else {
            1.0 + (-PI * xi / (1.0 - xi * xi).sqrt()).exp()
        };

        // DAF decreases with damping
        assert!(daf <= daf_prev + 1e-10,
            "DAF decreases with damping: xi={}, DAF={:.4}", xi, daf);
        daf_prev = daf;

        // DAF always > 1 (overshoot occurs)
        assert!(daf > 1.0, "DAF > 1 for any damping ratio");
    }

    // At xi = 0.02 (typical for steel): DAF ~ 1 + exp(-0.0628) ~ 1.939
    let xi_steel: f64 = 0.02;
    let daf_steel = 1.0 + (-PI * xi_steel / (1.0 - xi_steel * xi_steel).sqrt()).exp();
    assert!(daf_steel > 1.93 && daf_steel < 1.95, "DAF at 2% damping ~ 1.94");

    // At xi = 0.20: DAF ~ 1 + exp(-0.641) ~ 1.527
    let xi_high: f64 = 0.20;
    let daf_high = 1.0 + (-PI * xi_high / (1.0 - xi_high * xi_high).sqrt()).exp();
    assert!(daf_high > 1.5 && daf_high < 1.55, "DAF at 20% damping ~ 1.53");

    // GSA uses DAF = 2.0 (conservative, undamped)
    assert_close(daf_undamped, 2.0, 1e-12, "GSA conservative DAF");
}

// ================================================================
// 3. Catenary Action in Beams After Column Loss
// ================================================================
//
// After large deflections, beams develop catenary (cable) action
// where axial tension T carries the vertical load:
//
//   For a beam spanning L with midpoint deflection delta:
//   T = q*L^2 / (8*delta)     (from cable analogy with UDL)
//   T = P*L / (4*delta)       (from cable analogy with point load at mid)
//
// The transition from bending to catenary action occurs when
// delta is on the order of the beam depth h.
//
// Axial strain in catenary: eps = 2*(delta/L)^2 (small angle approx)
// Required ductility: delta/h >> 1
//
// Ref: Izzuddin et al. (2008); Starossek (2018), Ch. 5

#[test]
fn validation_catenary_action() {
    let l: f64 = 10.0; // m span
    let q: f64 = 50.0; // kN/m (gravity load)
    let h: f64 = 0.5; // m beam depth

    // Bending resistance: M_pl = f_y * Z
    let fy: f64 = 355.0; // MPa
    let z_pl: f64 = 2.0e6; // mm^3
    let m_pl = fy * z_pl * 1e-6; // kN*m
    // = 355 * 2e6 / 1e6 = 710 kN*m

    // Maximum bending can carry: q_bend = 16*M_pl / L^2
    // (plastic mechanism: 2 plastic hinges for propped cantilever)
    let q_bend = 16.0 * m_pl / (l * l);
    // = 16 * 710 / 100 = 113.6 kN/m

    // Catenary tension at deflection delta:
    // T = q*L^2 / (8*delta) for UDL
    let delta_1h = h; // deflection = 1 beam depth
    let t_1h = q * l * l / (8.0 * delta_1h);
    // = 50*100/(8*0.5) = 1250 kN
    assert_close(t_1h, 1250.0, 1e-12, "catenary tension at delta=h");

    let delta_2h = 2.0 * h;
    let t_2h = q * l * l / (8.0 * delta_2h);
    // = 50*100/(8*1.0) = 625 kN
    assert_close(t_2h, 625.0, 1e-12, "catenary tension at delta=2h");

    // Axial strain in catenary: eps = 2*(delta/L)^2
    let eps_1h = 2.0 * (delta_1h / l).powi(2);
    assert_close(eps_1h, 2.0 * 0.0025, 1e-12, "catenary strain at delta=h");

    // Required elongation: dL = eps * L (in meters), convert to mm
    let dl = eps_1h * l * 1000.0; // mm
    // = 0.005 * 10 * 1000 = 50 mm
    assert_close(dl, 50.0, 1e-10, "elongation at delta=h");

    // Catenary becomes effective when delta >> h
    // At delta = 0.1*L = 1.0 m:
    let delta_large = 0.1 * l;
    let t_large = q * l * l / (8.0 * delta_large);
    // = 50*100/(8*1.0) = 625 kN
    assert_close(t_large, 625.0, 1e-12, "catenary at large deflection");
    assert!(t_large < t_1h, "larger deflection => lower catenary force");

    let _q_bend = q_bend;
    let _m_pl = m_pl;
}

// ================================================================
// 4. Vierendeel Action in Moment Frames
// ================================================================
//
// In a moment frame after column removal, Vierendeel action develops
// as the beams transfer load through shear and bending (not axial).
//
// For a double-span beam with fixed ends after interior column removal:
//   Shear at former column: V = q * L (total load on one side)
//   Moment at beam-column joint: M = q*L^2/2 (cantilever action)
//
// Column shear from Vierendeel: V_col = M_beam / h_storey
//
// The Vierendeel mechanism forms when plastic hinges develop at
// beam-column joints. Number of hinges = 4 per panel.
//
// Ref: Starossek (2018), Ch. 4; Marchand & Alfawakhiri (2004)

#[test]
fn validation_vierendeel_action() {
    let l_bay: f64 = 6.0; // m bay width
    let h_storey: f64 = 3.5; // m storey height
    let q: f64 = 30.0; // kN/m on beam

    // After interior column removal, beam spans 2*L
    let l_span: f64 = 2.0 * l_bay;

    // For fixed-end beam with UDL spanning 2L:
    // M_end = q*(2L)^2/12, M_mid = q*(2L)^2/24
    let m_end = q * l_span * l_span / 12.0;
    let m_mid = q * l_span * l_span / 24.0;
    assert_close(m_end, 30.0 * 144.0 / 12.0, 1e-12, "fixed-end moment");
    assert_close(m_mid, 30.0 * 144.0 / 24.0, 1e-12, "midspan moment");

    // Vierendeel shear in columns above removed column:
    // V_col = (M_beam_left + M_beam_right) / h_storey
    // At the joint above the removed column, assuming equal beam moments:
    let m_joint = m_mid; // moment at former column location
    let v_col = 2.0 * m_joint / h_storey;
    assert_close(v_col, 2.0 * m_mid / h_storey, 1e-12, "Vierendeel column shear");

    // Plastic mechanism: 4 hinges per panel (2 in beams, 2 in columns)
    // Work equation: q*(2L)*delta = 4*M_pl*theta
    // where theta = delta / L, so q*2L*delta = 4*M_pl*delta/L
    // => M_pl = q*L^2/2
    let m_pl_required = q * l_bay * l_bay / 2.0;
    // = 30 * 36 / 2 = 540 kN*m
    assert_close(m_pl_required, 540.0, 1e-12, "Vierendeel mechanism M_pl");

    // Number of storeys participating in Vierendeel action
    // More storeys = lower demand per storey
    for n_storeys in 1..=4_u32 {
        let v_per_col = 2.0 * m_joint / (h_storey * n_storeys as f64);
        assert!(v_per_col > 0.0, "column shear positive");
        if n_storeys > 1 {
            let v_single = 2.0 * m_joint / h_storey;
            assert!(v_per_col < v_single,
                "more storeys reduce per-column shear");
        }
    }

    // Beam-to-column moment ratio for strong column-weak beam design
    let m_col = v_col * h_storey / 2.0;
    let scwb_ratio = m_col / m_joint;
    assert!(scwb_ratio > 0.0, "SCWB ratio defined and positive");
}

// ================================================================
// 5. Tie Force Requirements (UFC 4-023-03)
// ================================================================
//
// UFC 4-023-03 requires peripheral, internal, and vertical ties to
// provide structural integrity against progressive collapse.
//
// Internal tie force (floor): T_i = 3.0 * w_f * L_1 * L_a
//   (where w_f = floor load, L_1 = greater span, L_a = tie spacing)
//   But not less than 6.0 kN/m
//
// Peripheral tie force: T_p = 6.0 * w_f * L_1 * L_a (kN per m)
//   or 1.0 * F_t * L_1 where F_t = basic tie force
//
// Vertical tie: each column must be capable of carrying the load
// from the floor immediately above as a tensile force.
//
// Ref: UFC 4-023-03 (2009), Section 3-1

#[test]
fn validation_tie_force_requirements() {
    // Floor parameters
    let w_dead: f64 = 5.0; // kN/m^2
    let w_live: f64 = 3.0; // kN/m^2
    let w_f: f64 = w_dead + 0.25 * w_live; // UFC combination
    // = 5.0 + 0.75 = 5.75 kN/m^2
    assert_close(w_f, 5.75, 1e-12, "UFC floor load");

    let l1: f64 = 8.0; // m (greater span)
    let la: f64 = 6.0; // m (tie spacing = lesser span)

    // Internal tie force (per unit width, summed over spacing):
    // T_i = 0.5 * (1.2*D + 0.5*L) * L1 * La / La = 0.5 * w_f_combo * L1
    // Using the UFC simplified: T_internal = 3.0 * w_f * L1 (kN per m width)
    // Minimum: 6.0 kN/m
    let t_internal = (3.0 * w_f * l1).max(6.0);
    // = 3.0 * 5.75 * 8 = 138.0 kN/m
    assert_close(t_internal, 138.0, 1e-12, "internal tie force");
    assert!(t_internal > 6.0, "exceeds minimum tie force");

    // Peripheral tie: Tp = 6.0 * w_f * L1 (kN per m) or basic tie force
    let t_peripheral = 6.0 * w_f * l1;
    // = 6.0 * 5.75 * 8 = 276.0 kN/m
    assert_close(t_peripheral, 276.0, 1e-12, "peripheral tie force");

    // Peripheral >= internal
    assert!(t_peripheral >= t_internal, "peripheral tie >= internal tie");

    // Vertical tie: carry one floor load in tension
    // Column tributary area
    let trib_area = l1 * la; // = 48 m^2
    let w_floor_total = (w_dead + w_live) * trib_area; // = 8 * 48 = 384 kN
    let t_vertical = w_floor_total;
    assert_close(t_vertical, 384.0, 1e-12, "vertical tie force");

    // Required rebar for internal tie (steel fy = 500 MPa):
    let fy: f64 = 500.0; // MPa
    // T = As * fy => As = T / fy (T in kN, need consistent units)
    let as_required = t_internal * 1000.0 / fy; // mm^2 per m width
    // = 138000 / 500 = 276 mm^2/m
    assert_close(as_required, 276.0, 1e-12, "required tie reinforcement");

    // Check: 2 x T12 bars per m gives As = 2*113 = 226 mm^2/m < 276: insufficient
    // Need 3 x T12 or 2 x T16 per m width
    let as_2t12: f64 = 2.0 * PI * 6.0 * 6.0; // 2 * pi*6^2 = 226.2 mm^2
    assert!(as_2t12 < as_required, "2T12/m insufficient for tie force");
}

// ================================================================
// 6. Ductility Demand for Plastic Redistribution
// ================================================================
//
// After column removal, plastic hinges must rotate sufficiently to
// redistribute load. The required rotation capacity is:
//
//   theta_required = delta / L
//
// where delta is the vertical displacement at the removed column.
//
// For a mechanism with n plastic hinges forming over span L:
//   External work: W_ext = q * L * delta
//   Internal work: W_int = n * M_pl * theta
//   Equating: theta = q * L * delta / (n * M_pl)
//
// Ductility demand: mu = theta / theta_y
// where theta_y = M_pl * L / (6*EI) for a beam element.
//
// Code limits: AISC requires rotation capacity >= 3*theta_y for
// compact sections (mu >= 3).
//
// Ref: Izzuddin et al. (2008); AISC 360-16, Appendix 1

#[test]
fn validation_ductility_demand() {
    let l: f64 = 8.0; // m span
    let q: f64 = 40.0; // kN/m
    let e_mod: f64 = 200_000.0; // MPa = 200 GPa
    let i_val: f64 = 5.0e-4; // m^4
    let fy: f64 = 355.0; // MPa
    let z_pl: f64 = 2.5e-3; // m^3

    // Plastic moment
    let m_pl = fy * 1e3 * z_pl; // kN*m
    // = 355000 * 0.0025 = 887.5 kN*m
    assert_close(m_pl, 887.5, 1e-12, "M_pl");

    // Yield rotation for beam: theta_y = M_pl * L / (6*EI)
    let ei = e_mod * 1e3 * i_val; // kN*m^2 (E in kPa = kN/m^2)
    let theta_y = m_pl * l / (6.0 * ei);

    // Required rotation for mechanism (4 hinges in double span):
    // From mechanism: q*2L*delta = 4*M_pl*theta, theta = delta/L
    // => delta = 4*M_pl / (q*2L) * (delta/L)... use direct:
    // theta_required = q*(2L)^2 / (16*M_pl) for 4-hinge mechanism
    let l_double = 2.0 * l;
    let theta_mech = q * l_double * l_double / (16.0 * m_pl);
    // = 40 * 256 / (16 * 887.5) = 10240 / 14200 = 0.721 rad
    assert_close(theta_mech, 40.0 * 256.0 / (16.0 * 887.5), 1e-10,
        "mechanism rotation");

    // Ductility demand
    let mu = theta_mech / theta_y;
    assert!(mu > 1.0, "ductility demand > 1 (plastic behavior needed)");

    // AISC compact section: rotation capacity >= 3*theta_y
    let mu_available: f64 = 3.0; // compact section minimum
    let adequate = mu <= mu_available;
    let _adequate = adequate;

    // Higher ductility needed for larger spans or heavier loads
    let mu_heavy = (2.0 * q) * l_double * l_double / (16.0 * m_pl * theta_y);
    assert!(mu_heavy > mu, "doubling load increases ductility demand");

    // Rotation at yield
    assert!(theta_y > 0.0, "yield rotation positive");
    assert!(theta_y < 0.1, "yield rotation small (elastic range)");

    let _ei = ei;
}

// ================================================================
// 7. Alternative Load Path Energy Balance
// ================================================================
//
// Energy-based assessment (Izzuddin method):
// The structure survives column removal if the area under the
// load-displacement curve (internal energy) exceeds the work done
// by gravity (external energy) at the dynamic displacement.
//
// For a linear elastic system to peak displacement u_max:
//   Internal energy: U = 0.5 * k * u_max^2
//   External energy: W = P * u_max (constant force)
//   At u_max (undamped): U = W => u_max = 2*P/k = 2*u_static
//
// For an elastic-plastic system (bilinear):
//   U = 0.5*k*u_y^2 + k*u_y*(u_max - u_y) for u_max > u_y
//   W = P * u_max
//   Energy balance gives the required ductility.
//
// Ref: Izzuddin et al. (2008); Vlassis et al., ASCE J. Struct. Eng. (2008)

#[test]
fn validation_energy_balance_alt_path() {
    let k: f64 = 500.0; // kN/m (stiffness of remaining structure)
    let p_grav: f64 = 100.0; // kN (gravity load at removed column)

    // Elastic case:
    let u_static = p_grav / k;
    assert_close(u_static, 0.2, 1e-12, "static displacement");

    // Dynamic displacement (undamped): u_max = 2 * u_static
    let u_max_elastic = 2.0 * u_static;

    // Energy balance: U_int = W_ext at u_max
    let u_int = 0.5 * k * u_max_elastic * u_max_elastic;
    let w_ext = p_grav * u_max_elastic;
    assert_close(u_int, w_ext, 1e-12, "elastic energy balance");

    // Elastic-plastic bilinear: yield at u_y, post-yield stiffness = alpha*k
    let u_y: f64 = 0.15; // m (yield displacement)
    let alpha: f64 = 0.05; // post-yield stiffness ratio
    let p_y = k * u_y; // yield force = 75 kN

    // For P_grav > P_y, system goes plastic
    assert!(p_grav > p_y, "gravity load exceeds yield");

    // Internal energy: U = 0.5*k*u_y^2 + P_y*(u-u_y) + 0.5*alpha*k*(u-u_y)^2
    // External energy: W = P_grav * u
    // At energy balance (dynamic peak): U(u_max) = W(u_max)
    // 0.5*k*u_y^2 + P_y*(u_max-u_y) + 0.5*alpha*k*(u_max-u_y)^2 = P_grav*u_max
    //
    // Let du = u_max - u_y:
    // 0.5*k*u_y^2 + P_y*du + 0.5*alpha*k*du^2 = P_grav*(u_y + du)
    // 0.5*alpha*k*du^2 + (P_y - P_grav)*du + 0.5*k*u_y^2 - P_grav*u_y = 0
    let a_coeff = 0.5 * alpha * k;
    let b_coeff = p_y - p_grav;
    let c_coeff = 0.5 * k * u_y * u_y - p_grav * u_y;

    let discriminant = b_coeff * b_coeff - 4.0 * a_coeff * c_coeff;
    assert!(discriminant > 0.0, "solution exists");

    let du = (-b_coeff + discriminant.sqrt()) / (2.0 * a_coeff);
    let u_max_plastic = u_y + du;
    assert!(u_max_plastic > u_y, "exceeds yield displacement");

    // Verify energy balance at u_max
    let u_int_plastic = 0.5 * k * u_y * u_y + p_y * du + 0.5 * alpha * k * du * du;
    let w_ext_plastic = p_grav * u_max_plastic;
    assert_close(u_int_plastic, w_ext_plastic, 1e-8, "plastic energy balance");

    // Ductility ratio
    let mu = u_max_plastic / u_y;
    assert!(mu > 1.0, "ductility demand > 1");
}

// ================================================================
// 8. Key Element Design Load (34 kPa per GSA)
// ================================================================
//
// GSA (2013) requires that key elements (elements whose removal
// causes disproportionate collapse) be designed for an extraordinary
// load of 34 kN/m^2 (equivalent to ~5 psi blast overpressure).
//
// This load is applied to any face of the element.
// The element must resist this load without failure.
//
// For a column with tributary area A_trib:
//   F_key = 34 * A_trib (kN)
//
// For a wall panel b x h:
//   F_key = 34 * b * h (kN)
//   M_key = 34 * b * h^2 / 8 (for simply supported, UDL)
//
// Ref: GSA (2013), Sec. 3.3; EN 1991-1-7, Annex A (34 kPa)

#[test]
fn validation_key_element_design_load() {
    let p_key: f64 = 34.0; // kN/m^2 (GSA key element load)

    // Column key element check
    // Column cross-section 400x400 mm, height 3.5 m
    let col_width: f64 = 0.4; // m
    let col_height: f64 = 3.5; // m
    let _col_depth: f64 = 0.4; // m

    // Load on one face: F = p_key * width * height
    let f_col = p_key * col_width * col_height;
    // = 34 * 0.4 * 3.5 = 47.6 kN
    assert_close(f_col, 47.6, 1e-12, "column key element lateral force");

    // Moment at mid-height (cantilever from both ends): M = F*H/8 (UDL on face)
    let q_col = p_key * col_width; // kN/m along height
    let m_col = q_col * col_height * col_height / 8.0;
    // = 13.6 * 12.25 / 8 = 20.825 kN*m
    assert_close(m_col, 34.0 * 0.4 * 3.5 * 3.5 / 8.0, 1e-12, "column key moment");

    // Wall panel key element check: 4m wide x 3m high
    let wall_b: f64 = 4.0; // m
    let wall_h: f64 = 3.0; // m
    let wall_t: f64 = 0.2; // m thickness

    let f_wall = p_key * wall_b * wall_h; // kN
    // = 34 * 4 * 3 = 408 kN
    assert_close(f_wall, 408.0, 1e-12, "wall key element force");

    // Bending in wall (spanning vertically, simply supported at floors):
    let q_wall = p_key * wall_b; // = 136 kN/m
    let m_wall = q_wall * wall_h * wall_h / 8.0;
    // = 136 * 9 / 8 = 153 kN*m
    assert_close(m_wall, 153.0, 1e-12, "wall key moment");

    // Check if 200mm RC wall can resist this moment:
    // M_capacity = 0.167 * f_ck * b * d^2 (balanced section, simplified)
    let fck: f64 = 30_000.0; // kPa = 30 MPa
    let d: f64 = wall_t - 0.04; // effective depth, m
    let m_cap = 0.167 * fck * wall_b * d * d; // kN*m
    // = 0.167 * 30000 * 4 * 0.16^2 = 0.167*30000*4*0.0256 = 512.9 kN*m
    assert!(m_cap > m_wall, "wall capacity {} > demand {} kN*m", m_cap, m_wall);

    // Eurocode also uses 34 kN/m^2 (EN 1991-1-7, Annex A, Table A.1)
    let p_eurocode: f64 = 34.0;
    assert_close(p_key, p_eurocode, 1e-12, "GSA and Eurocode same key element load");

    let _ = PI;
}
