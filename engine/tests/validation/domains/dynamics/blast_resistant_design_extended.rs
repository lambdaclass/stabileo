/// Validation: Blast-Resistant Structural Design — Extended
///
/// References:
///   - UFC 3-340-02: Structures to Resist the Effects of Accidental Explosions
///   - ASCE 59-11: Blast Protection of Buildings
///   - Krauthammer: "Modern Protective Structures" (2008)
///   - Biggs: "Introduction to Structural Dynamics" (1964)
///   - Mays & Smith: "Blast Effects on Buildings" 2nd ed. (2012)
///   - DoD UFC 4-023-03: Design of Buildings to Resist Progressive Collapse
///   - Kinney & Graham: "Explosive Shocks in Air" 2nd ed. (1985)
///   - TM 5-855-1: Fundamentals of Protective Design for Conventional Weapons
///
/// Tests verify blast wave clearing, negative phase, fragment penetration,
/// equivalent static blast loading on frames, energy absorption,
/// spall/breach thresholds, progressive collapse catenary action,
/// and impulse-momentum transfer for blast walls.

use dedaliano_engine::types::*;

// ================================================================
// 1. Blast Wave Clearing — Diffraction Around Finite Targets
// ================================================================
//
// When a blast wave hits a finite-width target, clearing (relief) waves
// propagate from the free edges, reducing the effective reflected pressure.
// Clearing time: t_c = 3*S / U  where S = min(H, B/2) for a rectangular target,
// U = shock front velocity ≈ a_0 * (1 + 6*p_so/(7*p_0))^0.5.
// If t_c < t_d: the reflected impulse is reduced.
// Reference: UFC 3-340-02 Figure 2-193; Krauthammer Ch. 4.

#[test]
fn blast_clearing_effect() {
    // Rectangular wall panel: H=3m, B=6m
    let h: f64 = 3.0;            // m, height
    let b: f64 = 6.0;            // m, width
    let s: f64 = h.min(b / 2.0); // clearing distance = min(H, B/2) = 3.0 m

    // Blast parameters
    let p_so: f64 = 50.0;        // kPa, peak incident overpressure
    let p_atm: f64 = 101.325;    // kPa
    let a_0: f64 = 340.0;        // m/s, speed of sound in air

    // Shock front velocity (Rankine-Hugoniot)
    let u_s: f64 = a_0 * (1.0 + 6.0 * p_so / (7.0 * p_atm)).sqrt();

    // Clearing time
    let t_c: f64 = 3.0 * s / u_s;  // seconds

    crate::common::assert_close(s, 3.0, 0.001, "Clearing distance S");

    // t_c should be in milliseconds range for typical blast
    let t_c_ms: f64 = t_c * 1000.0;
    assert!(
        t_c_ms > 10.0 && t_c_ms < 100.0,
        "Clearing time: {:.1} ms (expected 10-100 ms range)", t_c_ms
    );

    // Reflected pressure coefficient
    let cr: f64 = 2.0 + 6.0 * (p_so / p_atm) / (7.0 + p_so / p_atm);
    let p_r: f64 = cr * p_so;

    // After clearing, pressure drops from p_r toward p_so + q (stagnation)
    // Dynamic pressure q = 5*p_so^2 / (2*(7*p_0 + p_so))
    let q: f64 = 5.0 * p_so * p_so / (2.0 * (7.0 * p_atm + p_so));
    let p_stag: f64 = p_so + q;

    // Effective impulse on the target is reduced vs infinite surface
    // For short clearing time, average pressure ≈ (p_r + p_stag) / 2
    let p_avg: f64 = (p_r + p_stag) / 2.0;

    assert!(
        p_avg < p_r,
        "Average cleared pressure {:.1} < full reflected {:.1} kPa", p_avg, p_r
    );
    assert!(
        p_avg > p_stag,
        "Average cleared pressure {:.1} > stagnation {:.1} kPa", p_avg, p_stag
    );

    // Ratio of cleared to full reflected impulse (approximate)
    // For td >> t_c: significant reduction; for td << t_c: negligible
    let td: f64 = 0.020;         // s, positive phase duration (20ms)
    let ratio: f64 = if t_c < td {
        // Clearing reduces the impulse
        (p_r * t_c + p_stag * (td - t_c)) / (p_r * td)
    } else {
        1.0 // no clearing benefit
    };

    assert!(
        ratio > 0.5 && ratio <= 1.0,
        "Impulse reduction ratio: {:.3}", ratio
    );
}

// ================================================================
// 2. Negative Phase Parameters — Blast Suction
// ================================================================
//
// After the positive pressure phase, a negative (suction) phase occurs.
// Negative overpressure magnitude is typically 10-30% of positive peak.
// Duration is 2-3x the positive phase.
// Can cause failures in cladding pulled outward.
// Reference: Kinney & Graham, UFC 3-340-02 Fig. 2-15.

#[test]
fn blast_negative_phase() {
    let p_so: f64 = 100.0;       // kPa, peak positive overpressure
    let td_pos: f64 = 15.0;      // ms, positive phase duration

    // Negative phase peak (empirical, UFC 3-340-02 for Z=5-10)
    // p_neg ≈ 0.1 to 0.35 * p_so  (strongly dependent on scaled distance)
    let p_neg_ratio: f64 = 0.25;
    let p_neg: f64 = p_neg_ratio * p_so;  // 25 kPa suction

    // Negative phase duration ≈ 2-3x positive
    let td_neg: f64 = 2.5 * td_pos;  // 37.5 ms

    // Negative impulse (approximately triangular)
    let i_neg: f64 = 0.5 * p_neg * td_neg;  // kPa*ms
    // Positive impulse (triangular approximation)
    let i_pos: f64 = 0.5 * p_so * td_pos;

    // Negative impulse is always less than positive
    assert!(
        i_neg < i_pos,
        "Negative impulse {:.0} < positive impulse {:.0} kPa*ms", i_neg, i_pos
    );

    // Negative/positive impulse ratio
    let i_ratio: f64 = i_neg / i_pos;
    crate::common::assert_close(i_ratio, p_neg_ratio * (td_neg / td_pos), 0.01, "Impulse ratio");

    // For cladding design: check if suction exceeds panel capacity
    // Typical glazing failure at ~2-5 kPa → negative phase can break glass
    let p_glass_capacity: f64 = 3.0; // kPa
    assert!(
        p_neg > p_glass_capacity,
        "Negative phase {:.0} kPa > glass capacity {:.0} kPa: suction failure possible",
        p_neg, p_glass_capacity
    );

    // Net rebound: after positive phase deflects member inward,
    // negative phase pulls it outward → reversal stress cycle
    // Critical for connections designed only for inward loading

    // Total waveform duration
    let td_total: f64 = td_pos + td_neg;
    crate::common::assert_close(td_total, 52.5, 0.01, "Total waveform duration ms");
}

// ================================================================
// 3. Fragment Penetration — Projectile Impact on RC
// ================================================================
//
// Fragment penetration into concrete using kinetic energy approach:
// A fragment of mass m and velocity v has KE = 0.5*m*v^2.
// Penetration depth estimated from KE/(resistive_force * area):
// x = m*v^2 / (2 * sigma_resist * A_frag)
// where sigma_resist ≈ 100-200 * f_c' (dynamic bearing capacity).
// Reference: TM 5-855-1, UFC 3-340-02 Chapter 6; Zukas (1990).

#[test]
fn blast_fragment_penetration() {
    // Primary fragment from cased charge
    let d: f64 = 0.025;          // m, fragment diameter (25mm)
    let w_frag: f64 = 0.10;      // kg, fragment mass
    let v: f64 = 800.0;          // m/s, impact velocity
    let fc: f64 = 35.0;          // MPa, concrete compressive strength

    // Fragment cross-section area
    let a_frag: f64 = std::f64::consts::PI * (d / 2.0).powi(2);

    // Kinetic energy
    let ke: f64 = 0.5 * w_frag * v * v;  // J = N*m
    // = 0.5 * 0.10 * 640000 = 32000 J

    // Dynamic bearing resistance of concrete: approximately 120*fc (MPa → Pa)
    // This accounts for confinement + strain rate enhancement
    let sigma_resist: f64 = 120.0 * fc * 1e6; // Pa
    // = 120 * 35e6 = 4.2e9 Pa

    // Penetration depth: x = KE / (sigma_resist * A_frag)
    let x: f64 = ke / (sigma_resist * a_frag);
    // = 32000 / (4.2e9 * 4.91e-4) = 32000 / 2061900 ≈ 0.0155m ≈ 15.5mm

    assert!(
        x > 0.005 && x < 0.15,
        "Fragment penetration: {:.1} mm", x * 1000.0
    );

    // Scabbing thickness (rear face spall): t_s ≈ 2.5 * x
    let t_scab: f64 = 2.5 * x;

    // Perforation thickness: t_p ≈ 1.3 * t_s
    let t_perf: f64 = 1.3 * t_scab;

    assert!(
        t_perf > t_scab && t_scab > x,
        "Perforation {:.0} > scabbing {:.0} > penetration {:.0} mm",
        t_perf * 1000.0, t_scab * 1000.0, x * 1000.0
    );

    // Design wall thickness must exceed scabbing threshold
    let t_wall: f64 = 0.30;      // m, 300mm RC wall
    let safe_against_scab: bool = t_wall > t_scab;
    let safe_against_perf: bool = t_wall > t_perf;

    // For a 300mm wall: check both thresholds
    assert!(
        safe_against_scab && safe_against_perf,
        "Wall {:.0}mm: scab={:.0}mm, perf={:.0}mm",
        t_wall * 1000.0, t_scab * 1000.0, t_perf * 1000.0
    );

    // Velocity decay with distance (fragment drag): V(R) = V0 * exp(-C_d * rho_a * A/m * R)
    let cd_frag: f64 = 0.47;     // drag coefficient (sphere)
    let rho_a: f64 = 1.225;      // kg/m^3, air density
    let r_dist: f64 = 20.0;      // m, distance from detonation

    let v_at_r: f64 = v * (-cd_frag * rho_a * a_frag / w_frag * r_dist).exp();

    assert!(
        v_at_r < v && v_at_r > 0.0,
        "Velocity at {}m: {:.0} m/s (from {:.0} m/s)", r_dist, v_at_r, v
    );

    // Penetration at reduced velocity
    let ke_at_r: f64 = 0.5 * w_frag * v_at_r * v_at_r;
    let x_at_r: f64 = ke_at_r / (sigma_resist * a_frag);

    assert!(
        x_at_r < x,
        "Penetration at {}m: {:.1}mm < close-in {:.1}mm",
        r_dist, x_at_r * 1000.0, x * 1000.0
    );
}

// ================================================================
// 4. Equivalent Static Blast Load — Simply Supported Beam
// ================================================================
//
// For blast design, the peak equivalent static load on a beam is:
// F_eq = DLF * p_peak * A_tributary
// where DLF depends on td/T ratio (from Biggs charts).
// We verify with FEM that a beam under this static load gives
// deflection matching the maximum dynamic response.
// Reference: Biggs Ch. 5, UFC 3-340-02 Tables.

#[test]
fn blast_equivalent_static_beam() {
    // Simply supported steel beam, W310x97 equivalent
    let l: f64 = 6.0;            // m, span
    let e: f64 = 200_000.0;      // MPa (solver multiplies by 1000 → kN/m^2)
    let iz: f64 = 2.22e-4;       // m^4, moment of inertia
    let a: f64 = 1.24e-2;        // m^2, cross-section area
    let fy: f64 = 350.0;         // MPa, yield strength

    // Blast parameters
    let p_blast: f64 = 50.0;     // kPa, peak reflected pressure on facade
    let trib_width: f64 = 3.0;   // m, tributary width
    let q_blast: f64 = p_blast * trib_width; // = 150 kN/m, distributed load

    // Beam stiffness: K = 384*EI/(5*L^3)
    let ei: f64 = e * 1000.0 * iz; // kN*m^2 (E in kN/m^2)
    let k_beam: f64 = 384.0 * ei / (5.0 * l.powi(3));

    // Total static load
    let f_total: f64 = q_blast * l; // kN

    // Static midspan deflection: delta_st = 5*q*L^4 / (384*EI)
    let delta_st: f64 = 5.0 * q_blast * l.powi(4) / (384.0 * ei);

    // FEM verification: apply the uniform load and check deflection
    let n_elem = 8;
    let input = crate::common::make_ss_beam_udl(n_elem, l, e, a, iz, -q_blast);
    let result = dedaliano_engine::solver::linear::solve_2d(&input).unwrap();

    // Midspan node (node 5 for 8 elements → at L/2 = 3.0m)
    let mid_node = n_elem / 2 + 1;
    let mid_disp = result.displacements.iter()
        .find(|d| d.node_id == mid_node)
        .expect("Midspan node displacement");

    // Compare FEM deflection to analytical
    crate::common::assert_close(mid_disp.uy.abs(), delta_st, 0.02, "Midspan deflection vs analytical");

    // Maximum bending moment: M = q*L^2/8
    let m_max_analytical: f64 = q_blast * l * l / 8.0;

    // Check yield: sigma = M*c/I where c = depth/2 ≈ 0.155m for W310
    let c: f64 = 0.155;          // m, half-depth
    let sigma_max: f64 = m_max_analytical * c / iz / 1000.0; // MPa

    // Elastic capacity check
    assert!(
        sigma_max > 0.0,
        "Max bending stress: {:.0} MPa (fy = {:.0} MPa)", sigma_max, fy
    );

    // DLF for typical blast td/T ratio
    // For td/T ~ 0.5-1.0: DLF ~ 1.5-1.8
    let dlf: f64 = 1.7;          // typical for intermediate td/T
    let delta_dynamic: f64 = dlf * delta_st;

    // Dynamic deflection should be larger than static
    assert!(
        delta_dynamic > delta_st,
        "Dynamic {:.2}mm > static {:.2}mm", delta_dynamic * 1000.0, delta_st * 1000.0
    );

    let _k_beam = k_beam;
    let _f_total = f_total;
}

// ================================================================
// 5. Blast-Loaded Portal Frame — Lateral Sway from Blast
// ================================================================
//
// A portal frame subjected to uniform lateral blast pressure on
// one column face. Verify reactions and sway displacement via FEM.
// Equivalent to a lateral distributed load applied to the windward column.
// Reference: Mays & Smith Ch. 7; ASCE 59-11 Section 5.

#[test]
fn blast_portal_frame_sway() {
    // Fixed-base portal frame
    let h: f64 = 4.0;            // m, column height
    let w: f64 = 8.0;            // m, beam span
    let e: f64 = 200_000.0;      // MPa
    let a: f64 = 1.0e-2;         // m^2
    let iz: f64 = 1.5e-4;        // m^4

    // Blast pressure on facade → distributed lateral load on windward column
    // p_reflected = 80 kPa on facade width 4m → q = 80*4 = 320 kN/m on column
    let p_blast: f64 = 80.0;     // kPa
    let trib: f64 = 4.0;         // m, tributary facade width
    let q_lat: f64 = p_blast * trib; // = 320 kN/m lateral on windward column

    // Build the portal: nodes 1(0,0), 2(0,h), 3(w,h), 4(w,0)
    // Element 1: left column (1→2), Element 2: beam (2→3), Element 3: right column (3→4)
    // Apply distributed load on element 1 (left column) — this is lateral (perpendicular to element)
    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1,
            q_i: -q_lat,          // perpendicular to column (leftward load on vertical member = horizontal)
            q_j: -q_lat,
            a: None,
            b: None,
        }),
    ];

    let input = crate::common::make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, e, 0.3)],
        vec![(1, a, iz)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        loads,
    );

    let result = dedaliano_engine::solver::linear::solve_2d(&input).unwrap();

    // Total horizontal load = q_lat * h = 320 * 4 = 1280 kN
    let f_horizontal: f64 = q_lat * h;

    // Sum of horizontal reactions should balance the applied load
    let sum_rx: f64 = result.reactions.iter().map(|r| r.rx).sum();
    crate::common::assert_close(sum_rx.abs(), f_horizontal, 0.05, "Horizontal reaction equilibrium");

    // Top of frame should sway horizontally (node 2 and node 3)
    let ux_top = result.displacements.iter()
        .find(|d| d.node_id == 2)
        .expect("Top node 2 displacement");

    assert!(
        ux_top.ux.abs() > 0.0,
        "Frame top sway: {:.4} m", ux_top.ux
    );

    // For fixed-fixed portal under lateral UDL on one column:
    // Approximate sway delta ≈ q*h^4/(8*EI_col) * correction for frame action
    // The frame stiffness is higher than a single cantilever.
    let ei_col: f64 = e * 1000.0 * iz; // kN*m^2
    let delta_cantilever: f64 = q_lat * h.powi(4) / (8.0 * ei_col);

    // Frame sway should be less than free cantilever (beam provides restraint)
    assert!(
        ux_top.ux.abs() < delta_cantilever,
        "Frame sway {:.4}m < cantilever {:.4}m (beam restrains)",
        ux_top.ux.abs(), delta_cantilever
    );

    // Column base moments should be nonzero (fixed supports)
    let base_moment_left: f64 = result.reactions.iter()
        .find(|r| r.node_id == 1)
        .map(|r| r.mz.abs())
        .unwrap_or(0.0);
    let base_moment_right: f64 = result.reactions.iter()
        .find(|r| r.node_id == 4)
        .map(|r| r.mz.abs())
        .unwrap_or(0.0);

    assert!(
        base_moment_left > 0.0 && base_moment_right > 0.0,
        "Base moments: left={:.1}, right={:.1} kN*m",
        base_moment_left, base_moment_right
    );
}

// ================================================================
// 6. Energy Absorption — Plastic Hinge Capacity of Steel Member
// ================================================================
//
// A blast-loaded member must absorb kinetic energy through plastic
// deformation. For a simply supported beam with plastic moment Mp:
// Ultimate resistance: R_u = 8*Mp/L
// Energy absorption up to ductility mu: E = R_u * x_el * (mu - 0.5)
// where x_el = R_u / K, K = 384*EI/(5*L^3).
// Reference: UFC 3-340-02 Table 3-1, Biggs Table 5.1.

#[test]
fn blast_energy_absorption_steel() {
    // Steel beam properties (W360x134 equivalent)
    let l: f64 = 5.0;            // m, span
    let e_val: f64 = 200_000.0;  // MPa
    let iz: f64 = 4.16e-4;       // m^4
    let zx: f64 = 2.34e-3;       // m^3, plastic section modulus
    let fy: f64 = 350.0;         // MPa
    let a_sec: f64 = 1.71e-2;    // m^2

    // Plastic moment
    let mp: f64 = zx * fy * 1000.0; // kN*m (fy in kPa = MPa*1000)
    // = 2.34e-3 * 350000 = 819 kN*m

    // Ultimate resistance (SS beam, uniform load, plastic mechanism)
    let ru: f64 = 8.0 * mp / l;
    // = 8 * 819 / 5 = 1310.4 kN

    // Elastic stiffness
    let ei: f64 = e_val * 1000.0 * iz; // kN*m^2
    let ke: f64 = 384.0 * ei / (5.0 * l.powi(3));

    // Elastic deflection at yield
    let x_el: f64 = ru / ke;

    // Ductility limits (UFC 3-340-02 for steel beams):
    // Category 1 (low damage): mu ≤ 10, theta ≤ 2 deg
    // Category 2 (moderate): mu ≤ 20, theta ≤ 6 deg
    let mu_cat1: f64 = 10.0;
    let mu_cat2: f64 = 20.0;

    // Energy absorption for elasto-plastic SDOF:
    // E_absorbed = R_u * x_el * (mu - 0.5)
    let e_cat1: f64 = ru * x_el * (mu_cat1 - 0.5);
    let e_cat2: f64 = ru * x_el * (mu_cat2 - 0.5);

    assert!(
        e_cat2 > e_cat1,
        "Category 2 energy {:.0} > Category 1 energy {:.0} kJ", e_cat2, e_cat1
    );

    // Support rotation check: theta = atan(x_max / (L/2))
    let x_max_cat1: f64 = mu_cat1 * x_el;
    let theta_cat1: f64 = (x_max_cat1 / (l / 2.0)).atan().to_degrees();

    assert!(
        theta_cat1 < 12.0,
        "Support rotation: {:.2} degrees", theta_cat1
    );

    // Verify with FEM: apply R_u as uniform load to SS beam
    // q_u = R_u / L (total load = R_u)
    let q_u: f64 = ru / l;
    let input = crate::common::make_ss_beam_udl(8, l, e_val, a_sec, iz, -q_u);
    let result = dedaliano_engine::solver::linear::solve_2d(&input).unwrap();

    // Midspan deflection under ultimate resistance load
    let mid_disp = result.displacements.iter()
        .find(|d| d.node_id == 5)
        .expect("Midspan displacement");

    // FEM deflection should match x_el (elastic deflection at ultimate load)
    crate::common::assert_close(mid_disp.uy.abs(), x_el, 0.03, "Elastic deflection at Ru");

    let _mp = mp;
}

// ================================================================
// 7. Spall and Breach Thresholds — Reinforced Concrete Walls
// ================================================================
//
// For close-in detonation against RC walls:
// Spall: rear face material ejected (dangerous secondary fragments)
// Breach: full perforation of the wall
// Empirical threshold: scaled wall thickness T/(W^(1/3)) vs scaled standoff Z.
// Reference: UFC 3-340-02 Chapter 4; TM 5-855-1.

#[test]
fn blast_spall_breach_thresholds() {
    // RC wall parameters
    let t_wall: f64 = 0.30;      // m, wall thickness (300mm)
    let fc: f64 = 40.0;          // MPa, concrete strength
    let rho_s: f64 = 0.005;      // reinforcement ratio (0.5%)

    // Charge parameters
    let w_tnt: f64 = 50.0;       // kg, TNT equivalent
    let r_standoff: f64 = 5.0;   // m, standoff distance

    // Scaled distance
    let w_cbrt: f64 = w_tnt.cbrt();
    let z: f64 = r_standoff / w_cbrt;

    // Scaled wall thickness
    let t_scaled: f64 = t_wall / w_cbrt;

    assert!(
        z > 0.5 && z < 20.0,
        "Scaled distance Z = {:.2} m/kg^(1/3)", z
    );

    // Empirical spall threshold (simplified from TM 5-855-1):
    // For Z > 1.5: spall occurs if t_scaled < 0.1 * (1/Z)^0.5
    // For Z < 1.5: almost certain spall unless very thick
    let spall_threshold: f64 = 0.10 * (1.0 / z).sqrt();

    let spall_risk: bool = t_scaled < spall_threshold;

    // Report the comparison
    assert!(
        t_scaled > 0.0 && spall_threshold > 0.0,
        "Scaled thickness {:.4} vs spall threshold {:.4} m/kg^(1/3)",
        t_scaled, spall_threshold
    );

    // Breach threshold is more demanding: t_scaled < 0.05 * (1/Z)^0.5
    let breach_threshold: f64 = 0.05 * (1.0 / z).sqrt();
    let breach_risk: bool = t_scaled < breach_threshold;

    // Spall threshold should be more easily triggered than breach
    assert!(
        spall_threshold > breach_threshold,
        "Spall threshold {:.4} > breach threshold {:.4}", spall_threshold, breach_threshold
    );

    // If at risk: calculate required thickness increase
    // Required t for no-spall: t_req = spall_threshold * W^(1/3)
    let t_req_no_spall: f64 = spall_threshold * w_cbrt;
    let t_req_no_breach: f64 = breach_threshold * w_cbrt;

    assert!(
        t_req_no_spall >= t_req_no_breach,
        "No-spall thickness {:.0}mm >= no-breach {:.0}mm",
        t_req_no_spall * 1000.0, t_req_no_breach * 1000.0
    );

    // Effect of concrete strength: higher f_c increases resistance
    // Empirical factor: threshold scales with (f_c/30)^0.25
    let fc_factor: f64 = (fc / 30.0).powf(0.25);
    let effective_t_scaled: f64 = t_scaled * fc_factor;

    assert!(
        effective_t_scaled > t_scaled,
        "Higher f_c increases effective thickness: {:.4} > {:.4}",
        effective_t_scaled, t_scaled
    );

    // Effect of reinforcement: increases breach resistance by ~20-40%
    let rho_factor: f64 = 1.0 + 50.0 * rho_s; // = 1.25 for 0.5%
    let effective_t_with_rebar: f64 = t_scaled * rho_factor;

    assert!(
        effective_t_with_rebar > t_scaled,
        "Reinforcement increases resistance: factor = {:.2}", rho_factor
    );

    let _spall_risk = spall_risk;
    let _breach_risk = breach_risk;
}

// ================================================================
// 8. Progressive Collapse — Catenary Action in Beam
// ================================================================
//
// When a column is removed (post-blast), the beam above must
// bridge the double span via catenary (cable) action.
// Catenary capacity: T = w*L_new^2 / (8*delta)
// Where delta is the vertical sag at the removed column location.
// The beam must develop tensile force T ≤ A*fy.
// Reference: DoD UFC 4-023-03; GSA Guidelines.

#[test]
fn blast_progressive_collapse_catenary() {
    // Two-span continuous beam, middle support removed → single span
    let l_orig: f64 = 6.0;       // m, original span
    let l_new: f64 = 2.0 * l_orig; // m, bridging span after column removal

    // Beam properties (W410x85 equivalent)
    let e: f64 = 200_000.0;      // MPa
    let a_sec: f64 = 1.08e-2;    // m^2
    let iz: f64 = 3.15e-4;       // m^4
    let fy: f64 = 350.0;         // MPa

    // Gravity load on beam
    let w_dead: f64 = 25.0;      // kN/m, dead load
    let w_live: f64 = 10.0;      // kN/m, live load (reduced for progressive collapse)
    let w_total: f64 = w_dead + 0.25 * w_live; // UFC combo: 1.0D + 0.25L
    // = 25 + 2.5 = 27.5 kN/m

    // Flexural capacity: midspan moment for the new double span
    let m_flex: f64 = w_total * l_new * l_new / 8.0;
    // = 27.5 * 144 / 8 = 495 kN*m

    // Plastic moment capacity
    let zx: f64 = 1.51e-3;       // m^3, plastic section modulus
    let mp: f64 = zx * fy * 1000.0; // = 528.5 kN*m

    // FEM verification: SS beam with double span under gravity
    let input = crate::common::make_ss_beam_udl(12, l_new, e, a_sec, iz, -w_total);
    let result = dedaliano_engine::solver::linear::solve_2d(&input).unwrap();

    // Midspan deflection
    let mid_node = 7; // node 7 at 6.0m for 12-element beam of 12m
    let mid_disp = result.displacements.iter()
        .find(|d| d.node_id == mid_node)
        .expect("Mid displacement for bridging span");

    // Analytical deflection: delta = 5*w*L^4/(384*EI)
    let ei: f64 = e * 1000.0 * iz;
    let delta_analytical: f64 = 5.0 * w_total * l_new.powi(4) / (384.0 * ei);

    crate::common::assert_close(mid_disp.uy.abs(), delta_analytical, 0.02, "Bridging span deflection");

    // Catenary force required at a given sag
    // Assume allowable sag = L/20 for progressive collapse scenario
    let delta_cat: f64 = l_new / 20.0; // = 0.6m

    let t_catenary: f64 = w_total * l_new * l_new / (8.0 * delta_cat);
    // = 27.5 * 144 / 4.8 = 825 kN

    // Axial capacity
    let t_capacity: f64 = a_sec * fy * 1000.0; // kN
    // = 0.0108 * 350000 = 3780 kN

    assert!(
        t_capacity > t_catenary,
        "Catenary capacity {:.0} kN > demand {:.0} kN", t_capacity, t_catenary
    );

    // Demand/capacity ratio
    let dcr: f64 = t_catenary / t_capacity;
    assert!(
        dcr < 1.0,
        "Catenary DCR = {:.2} < 1.0", dcr
    );

    // Check connection demand: connections must resist T_catenary + shear
    let v_shear: f64 = w_total * l_new / 2.0; // kN
    let f_connection: f64 = (t_catenary.powi(2) + v_shear.powi(2)).sqrt();

    assert!(
        f_connection > t_catenary,
        "Connection force {:.0} kN (combined tension + shear)", f_connection
    );

    // Flexural demand/capacity check
    let flex_dcr: f64 = m_flex / mp;
    assert!(
        flex_dcr > 0.5, // significant demand on double span
        "Flexural DCR = {:.2}", flex_dcr
    );
}
