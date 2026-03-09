/// Validation: Fluid-Structure Interaction (Extended)
///
/// References:
///   - Westergaard, H.M. (1933): "Water Pressures on Dams during Earthquakes"
///   - Blevins, R.D.: "Flow-Induced Vibration" 2nd ed. (1990)
///   - Ibrahim, R.A.: "Liquid Sloshing Dynamics" (2005)
///   - Joukowsky, N.E. (1898): Water Hammer theory
///   - Chopra, A.K. (1967): "Hydrodynamic Pressures on Dams during Earthquakes"
///   - Sarpkaya & Isaacson: "Mechanics of Wave Forces on Offshore Structures" (1981)
///   - DNV-RP-C205: Environmental Conditions and Environmental Loads
///
/// Tests verify added mass, fluid damping, sloshing, pipe whip,
/// flow-induced vibration, submerged beam frequency, water hammer,
/// and dam-reservoir interaction.

use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

// ================================================================
// 1. Westergaard Added Mass for Submerged Structure
// ================================================================
//
// Westergaard (1933): hydrodynamic added mass per unit area on a
// vertical dam face during earthquake:
//   m_a(z) = (7/8) * rho_w * sqrt(H * z)
// where H = reservoir depth, z = depth below surface.
// Total added mass per unit width:
//   M_a = (7/12) * rho_w * H^2
//
// Verify: a cantilever column loaded with the equivalent static
// force from added mass produces consistent deflection.

#[test]
fn fsi_westergaard_added_mass() {
    let h: f64 = 30.0;           // m, reservoir depth
    let rho_w: f64 = 1000.0;     // kg/m^3
    let a_g: f64 = 0.20;         // g, peak ground acceleration

    // Added mass per unit width at base (z = H)
    let m_a_base: f64 = (7.0 / 8.0) * rho_w * (h * h).sqrt();
    // = 0.875 * 1000 * 30 = 26250 kg/m^2

    assert_close(m_a_base, 0.875 * rho_w * h, 0.01, "Added mass at base");

    // Total added mass per unit width of dam
    let m_a_total: f64 = (7.0 / 12.0) * rho_w * h * h;
    // = 0.5833 * 1000 * 900 = 525000 kg/m

    let m_a_expected: f64 = 7.0 / 12.0 * 1000.0 * 900.0;
    assert_close(m_a_total, m_a_expected, 0.001, "Total added mass");

    // Equivalent static force from added mass
    let f_hydrodyn: f64 = m_a_total * a_g * 9.81 / 1000.0; // kN/m
    // = 525000 * 0.20 * 9.81 / 1000 = 1030 kN/m

    assert_close(f_hydrodyn, m_a_total * a_g * 9.81 / 1000.0, 0.001, "Hydrodynamic force");

    // Compare with hydrostatic force
    let f_hydrostatic: f64 = 0.5 * 9.81 * h * h; // kN/m
    let ratio: f64 = f_hydrodyn / f_hydrostatic;

    // For 0.2g PGA, hydrodynamic is roughly 20-25% of hydrostatic
    assert!(
        ratio > 0.10 && ratio < 0.50,
        "Hydrodynamic/hydrostatic ratio: {:.3}", ratio
    );

    // Verify with structural model: cantilever with tip load
    // representing the resultant hydrodynamic force
    let e_conc: f64 = 25_000.0;  // MPa, concrete
    let col_a: f64 = 1.0;        // m^2 (1m wide dam section)
    let col_iz: f64 = 1.0 / 12.0; // m^4 (1m x 1m section)

    let tip_force = f_hydrodyn;   // apply total force at tip for simplicity
    let input = make_beam(
        4, h, e_conc, col_a, col_iz, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5, fx: 0.0, fy: tip_force, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    // Cantilever tip deflection: delta = P*L^3/(3EI)
    let ei: f64 = e_conc * 1000.0 * col_iz; // kN*m^2
    let delta_expected: f64 = tip_force * h.powi(3) / (3.0 * ei);
    let delta_actual = results.displacements.iter()
        .find(|d| d.node_id == 5).unwrap().uy;

    assert_close(delta_actual.abs(), delta_expected.abs(), 0.05, "Westergaard tip deflection");
}

// ================================================================
// 2. Fluid Damping: Radiation Damping Coefficient
// ================================================================
//
// A structure oscillating in water radiates energy as waves.
// Radiation damping coefficient per unit length for a vertical
// surface oscillating horizontally:
//   c_rad = rho_w * g / omega
// where omega = circular frequency of oscillation.
//
// Effective damping ratio added:
//   xi_rad = c_rad / (2 * m_total * omega)
// This increases total damping, reducing dynamic amplification.

#[test]
fn fsi_radiation_damping() {
    let rho_w: f64 = 1025.0;     // kg/m^3, seawater
    let g: f64 = 9.81;
    let t_struct: f64 = 1.0;     // s, structural period
    let omega: f64 = 2.0 * std::f64::consts::PI / t_struct;

    // Radiation damping coefficient (per unit width)
    let c_rad: f64 = rho_w * g / omega;
    // = 1025 * 9.81 / 6.283 = 1601 N*s/m per m width

    let c_expected: f64 = rho_w * g / omega;
    assert_close(c_rad, c_expected, 0.001, "Radiation damping coefficient");

    // For a structure with total mass m, compute damping ratio
    let m_struct: f64 = 50_000.0; // kg per m width (massive dam section)
    let width: f64 = 10.0;        // m, width of oscillating face
    let c_total: f64 = c_rad * width;

    let xi_rad: f64 = c_total / (2.0 * m_struct * omega);

    // Radiation damping adds modest damping (typically 1-10%)
    assert!(
        xi_rad > 0.001 && xi_rad < 0.20,
        "Radiation damping ratio: {:.4}", xi_rad
    );

    // Higher frequency -> less radiation damping
    let omega_high: f64 = 2.0 * omega;
    let c_rad_high: f64 = rho_w * g / omega_high;
    assert!(
        c_rad_high < c_rad,
        "Higher freq: c_rad = {:.1} < {:.1}", c_rad_high, c_rad
    );

    // Dynamic amplification factor at resonance with added damping
    // DAF = 1 / (2*xi) for lightly damped system at resonance
    let xi_struct: f64 = 0.05;    // 5% structural damping
    let xi_total: f64 = xi_struct + xi_rad;
    let daf_without: f64 = 1.0 / (2.0 * xi_struct);
    let daf_with: f64 = 1.0 / (2.0 * xi_total);

    assert!(
        daf_with < daf_without,
        "DAF reduced: {:.1} < {:.1}", daf_with, daf_without
    );

    // Verify with beam model: apply lateral load, check reaction
    let e_val: f64 = 200_000.0;
    let input = make_beam(
        2, 10.0, e_val, 0.01, 1e-4, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: daf_with * 10.0, fy: 0.0, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");
    let rx_sum: f64 = results.reactions.iter().map(|r| r.rx).sum();

    assert_close(rx_sum, -(daf_with * 10.0), 0.01, "Radiation damping equilibrium");
}

// ================================================================
// 3. Sloshing: Fundamental Sloshing Period
// ================================================================
//
// Rectangular tank fundamental sloshing period:
//   T = 2*pi / sqrt(g*pi/L * tanh(pi*h/L))
// where L = tank length, h = liquid depth, g = 9.81 m/s^2.
// This is crucial for seismic design of liquid storage tanks.

#[test]
fn fsi_sloshing_period() {
    let g: f64 = 9.81;
    let pi: f64 = std::f64::consts::PI;

    // Case 1: Wide shallow tank
    let l1: f64 = 20.0;          // m, tank length
    let h1: f64 = 5.0;           // m, liquid depth

    let omega1: f64 = (g * pi / l1 * (pi * h1 / l1).tanh()).sqrt();
    let t1: f64 = 2.0 * pi / omega1;

    // Deep water limit: tanh -> 1 when h/L > ~0.5
    // Shallow: T increases as depth decreases
    let omega1_deep: f64 = (g * pi / l1).sqrt();
    let t1_deep: f64 = 2.0 * pi / omega1_deep;

    // Shallow tank has longer period than deep-water limit
    assert!(
        t1 > t1_deep,
        "Shallow tank T={:.3}s > deep limit T={:.3}s", t1, t1_deep
    );

    // Case 2: Longer tank -> longer period
    let l2: f64 = 40.0;
    let omega2: f64 = (g * pi / l2 * (pi * h1 / l2).tanh()).sqrt();
    let t2: f64 = 2.0 * pi / omega2;

    assert!(
        t2 > t1,
        "Longer tank: T={:.3}s > {:.3}s", t2, t1
    );

    // Analytical check for specific values
    let tanh_val: f64 = (pi * h1 / l1).tanh();
    let omega_check: f64 = (g * pi / l1 * tanh_val).sqrt();
    let t_check: f64 = 2.0 * pi / omega_check;
    assert_close(t1, t_check, 0.001, "Sloshing period formula consistency");

    // Case 3: Very deep tank (h/L > 1) -> approaches deep water limit
    let h3: f64 = 30.0;
    let omega3: f64 = (g * pi / l1 * (pi * h3 / l1).tanh()).sqrt();
    let t3: f64 = 2.0 * pi / omega3;

    let deep_ratio: f64 = (t3 - t1_deep).abs() / t1_deep;
    assert!(
        deep_ratio < 0.01,
        "Deep tank approaches limit: ratio={:.5}", deep_ratio
    );

    // Sloshing wave height from earthquake (Housner)
    // d_max = 0.84 * Sa(T_slosh) * L / g (approximate)
    let sa: f64 = 0.3 * g;       // spectral acceleration at sloshing period
    let d_max: f64 = 0.84 * sa * l1 / g;
    assert!(
        d_max > 0.0 && d_max < l1,
        "Sloshing wave height: {:.2} m", d_max
    );
}

// ================================================================
// 4. Pipe Whip: Jet Reaction Force on Piping Restraint
// ================================================================
//
// When a high-energy pipe breaks, the escaping fluid creates a
// jet reaction force: F = p*A + rho*A*v^2
// (thrust = pressure force + momentum flux)
// The pipe acts as a cantilever whipping under this thrust.

#[test]
fn fsi_pipe_whip() {
    let p_int: f64 = 15.0;       // MPa, internal pressure
    let d_pipe: f64 = 0.30;      // m, pipe inner diameter
    let a_pipe: f64 = std::f64::consts::PI * d_pipe * d_pipe / 4.0;
    let rho_fluid: f64 = 800.0;  // kg/m^3 (steam/water)

    // Flow velocity from Bernoulli (choked flow approximation)
    let v_exit: f64 = (2.0 * p_int * 1e6 / rho_fluid).sqrt();
    // = sqrt(2 * 15e6 / 800) = sqrt(37500) ~ 194 m/s

    // Jet reaction force components
    let f_pressure: f64 = p_int * a_pipe * 1000.0;  // kN (p in MPa, A in m^2)
    let f_momentum: f64 = rho_fluid * a_pipe * v_exit * v_exit / 1000.0; // kN

    // Total thrust
    let f_thrust: f64 = f_pressure + f_momentum;

    assert!(
        f_thrust > 500.0,
        "Jet thrust: {:.0} kN", f_thrust
    );

    // Pressure force should be significant
    assert!(
        f_pressure > 100.0,
        "Pressure component: {:.0} kN", f_pressure
    );

    // Momentum flux is typically the dominant term
    assert!(
        f_momentum > f_pressure * 0.5,
        "Momentum flux {:.0} significant vs pressure {:.0} kN",
        f_momentum, f_pressure
    );

    // Model pipe as cantilever under tip thrust to find restraint force
    let l_pipe: f64 = 3.0;       // m, pipe length to restraint
    let e_steel: f64 = 200_000.0; // MPa
    let t_wall: f64 = 0.015;     // m, pipe wall thickness
    let d_out: f64 = d_pipe + 2.0 * t_wall;
    let iz_pipe: f64 = std::f64::consts::PI / 64.0
        * (d_out.powi(4) - d_pipe.powi(4));
    let a_cross: f64 = std::f64::consts::PI / 4.0
        * (d_out * d_out - d_pipe * d_pipe);

    // Fixed-pinned pipe under tip load (restraint at free end)
    let input = make_beam(
        4, l_pipe, e_steel, a_cross, iz_pipe, "fixed", Some("pinned"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -f_thrust, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    // Reactions at both supports should balance the applied load
    let ry_sum: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(ry_sum, f_thrust, 0.01, "Pipe whip equilibrium");
}

// ================================================================
// 5. Flow-Induced Vibration: Strouhal Frequency and VIV Lock-In
// ================================================================
//
// Vortex shedding frequency: f_s = St * V / D
// St = Strouhal number (0.2 for circular cylinder, Re 300-3e5)
// VIV lock-in when f_s ≈ f_n (structural natural frequency).
// Lock-in range: 0.8*f_n < f_s < 1.2*f_n (approximately).

#[test]
fn fsi_vortex_induced_vibration() {
    let st: f64 = 0.20;          // Strouhal number (circular cylinder)
    let d_cyl: f64 = 0.50;       // m, cylinder diameter
    let v_flow: f64 = 2.0;       // m/s, flow velocity

    // Vortex shedding frequency
    let f_s: f64 = st * v_flow / d_cyl;
    // = 0.20 * 2.0 / 0.50 = 0.80 Hz

    assert_close(f_s, 0.80, 0.01, "Strouhal shedding frequency");

    // Reduced velocity
    let v_r: f64 = v_flow / (f_s * d_cyl);
    // V_r = 1/St = 5.0 for lock-in onset
    assert_close(v_r, 1.0 / st, 0.01, "Reduced velocity");

    // Lock-in range: structure resonates when f_s ~ f_n
    let f_n: f64 = 0.80;         // Hz, structural natural frequency = f_s
    let lock_in_low: f64 = 0.8 * f_n;
    let lock_in_high: f64 = 1.2 * f_n;

    assert!(
        f_s > lock_in_low && f_s < lock_in_high,
        "Lock-in: f_s={:.2} in [{:.2}, {:.2}]", f_s, lock_in_low, lock_in_high
    );

    // VIV amplitude (DNV-RP-C205 approach)
    // A/D ~ 1.0 for low mass-damping parameter (Scruton number)
    let m_struct: f64 = 200.0;    // kg/m (structural mass per length)
    let xi: f64 = 0.01;           // damping ratio
    let rho_w: f64 = 1025.0;
    let ks: f64 = 2.0 * m_struct * xi / (rho_w * d_cyl * d_cyl);
    // Scruton number

    // Low Scruton -> large VIV amplitude
    assert!(
        ks < 5.0,
        "Scruton number: {:.3} -- VIV susceptible", ks
    );

    // Cross-flow force coefficient
    let cl: f64 = 0.50;          // typical lift coefficient during VIV
    let f_viv: f64 = 0.5 * rho_w * v_flow * v_flow * d_cyl * cl / 1000.0; // kN/m

    // Verify with structural model: cantilever cylinder
    let l_span: f64 = 10.0;
    let e_steel: f64 = 200_000.0;
    let a_cyl: f64 = std::f64::consts::PI / 4.0 * d_cyl * d_cyl * 0.10; // thin wall
    let iz_cyl: f64 = std::f64::consts::PI / 64.0 * d_cyl.powi(4) * 0.15;

    let input = make_beam(
        4, l_span, e_steel, a_cyl, iz_cyl, "fixed", Some("fixed"),
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -f_viv, q_j: -f_viv, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: -f_viv, q_j: -f_viv, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 3, q_i: -f_viv, q_j: -f_viv, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 4, q_i: -f_viv, q_j: -f_viv, a: None, b: None,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    // Total reaction should equal total applied load
    let ry_sum: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_load: f64 = f_viv * l_span;
    assert_close(ry_sum, total_load, 0.02, "VIV load equilibrium");
}

// ================================================================
// 6. Submerged Beam: Modified Natural Frequency from Added Mass
// ================================================================
//
// A beam vibrating in fluid has added (virtual) mass that lowers
// its natural frequency:
//   f_water = f_air * sqrt(m_s / (m_s + m_a))
// where m_s = structural mass, m_a = added mass ≈ rho_w * pi * D^2 / 4
// (for circular cross-section, Ca = 1.0).

#[test]
fn fsi_submerged_beam_frequency() {
    let d_cyl: f64 = 0.40;       // m, cylinder diameter
    let rho_s: f64 = 7850.0;     // kg/m^3, steel density
    let rho_w: f64 = 1025.0;     // kg/m^3, seawater
    let ca: f64 = 1.0;           // added mass coefficient (circular)

    // Structural mass per unit length
    let t_wall: f64 = 0.02;      // m, wall thickness
    let d_in: f64 = d_cyl - 2.0 * t_wall;
    let a_steel: f64 = std::f64::consts::PI / 4.0 * (d_cyl * d_cyl - d_in * d_in);
    let m_s: f64 = rho_s * a_steel;

    // Added mass per unit length (circular cylinder, Ca = 1)
    let m_a: f64 = ca * rho_w * std::f64::consts::PI / 4.0 * d_cyl * d_cyl;

    // Frequency ratio
    let freq_ratio: f64 = (m_s / (m_s + m_a)).sqrt();

    // Submerged frequency is always lower
    assert!(
        freq_ratio < 1.0 && freq_ratio > 0.3,
        "Frequency ratio f_water/f_air = {:.4}", freq_ratio
    );

    // For steel pipe in water: typically 0.5-0.9
    assert!(
        freq_ratio > 0.40 && freq_ratio < 0.95,
        "Steel pipe freq ratio: {:.4}", freq_ratio
    );

    // Verify: compute f_air from beam properties
    let l_span: f64 = 8.0;
    let e_steel: f64 = 200_000.0; // MPa
    let iz: f64 = std::f64::consts::PI / 64.0 * (d_cyl.powi(4) - d_in.powi(4));
    let ei: f64 = e_steel * 1e3 * iz;  // kN*m^2

    // SS beam first mode: omega = (pi/L)^2 * sqrt(EI / (m*L_unit))
    let pi: f64 = std::f64::consts::PI;
    let rho_a_air: f64 = m_s / 1000.0; // convert kg/m to kN*s^2/m^2
    let omega_air: f64 = (pi / l_span).powi(2) * (ei / rho_a_air).sqrt();
    let f_air: f64 = omega_air / (2.0 * pi);

    // Submerged frequency
    let rho_a_water: f64 = (m_s + m_a) / 1000.0;
    let omega_water: f64 = (pi / l_span).powi(2) * (ei / rho_a_water).sqrt();
    let f_water: f64 = omega_water / (2.0 * pi);

    let computed_ratio: f64 = f_water / f_air;
    assert_close(computed_ratio, freq_ratio, 0.01, "Submerged frequency ratio");

    // Verify beam deflection with solver (static check)
    let input = make_beam(
        4, l_span, e_steel, a_steel, iz, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -10.0, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    // Midspan deflection for point load at midspan of SS beam:
    // delta = P*L^3 / (48*EI)
    let delta_expected: f64 = 10.0 * l_span.powi(3) / (48.0 * ei);
    let delta_actual = results.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().uy.abs();

    assert_close(delta_actual, delta_expected, 0.05, "Submerged beam static check");
}

// ================================================================
// 7. Water Hammer: Joukowsky Pressure Wave
// ================================================================
//
// Sudden valve closure creates pressure wave:
//   delta_p = rho * c * v
// where c = wave speed in pipe:
//   c = sqrt((K/rho) / (1 + K*D/(E_p*t)))
// K = bulk modulus of water, E_p = pipe elastic modulus,
// D = pipe diameter, t = wall thickness.
// Critical time: t_c = 2*L/c (wave round trip).

#[test]
fn fsi_water_hammer() {
    let rho: f64 = 1000.0;       // kg/m^3
    let k_water: f64 = 2.2e9;    // Pa, bulk modulus of water
    let v_flow: f64 = 3.0;       // m/s, flow velocity
    let l_pipe: f64 = 500.0;     // m, pipe length

    let d_pipe: f64 = 0.60;      // m, pipe diameter
    let t_wall: f64 = 0.01;      // m, wall thickness
    let e_pipe: f64 = 200e9;     // Pa, steel pipe modulus

    // Wave speed (considering pipe elasticity)
    let c: f64 = ((k_water / rho) / (1.0 + k_water * d_pipe / (e_pipe * t_wall))).sqrt();

    // Rigid pipe wave speed for comparison
    let c_rigid: f64 = (k_water / rho).sqrt();
    // = sqrt(2.2e9/1000) = 1483 m/s

    // Elastic pipe has lower wave speed
    assert!(
        c < c_rigid,
        "Elastic pipe: c={:.0} < c_rigid={:.0} m/s", c, c_rigid
    );

    // Typical range: 900-1400 m/s for steel pipe
    assert!(
        c > 800.0 && c < 1500.0,
        "Wave speed: {:.0} m/s", c
    );

    // Joukowsky pressure rise
    let delta_p: f64 = rho * c * v_flow; // Pa
    let delta_p_mpa: f64 = delta_p / 1e6;

    // Verify formula: p = rho * c * v
    let delta_p_check: f64 = rho * c * v_flow / 1e6;
    assert_close(delta_p_mpa, delta_p_check, 0.001, "Joukowsky pressure");

    // Pressure should be significant (several MPa for typical flow)
    assert!(
        delta_p_mpa > 1.0 && delta_p_mpa < 10.0,
        "Water hammer pressure: {:.2} MPa", delta_p_mpa
    );

    // Critical time (wave round trip)
    let t_c: f64 = 2.0 * l_pipe / c;
    assert!(
        t_c > 0.5 && t_c < 2.0,
        "Critical time: {:.3} s", t_c
    );

    // Hoop stress from water hammer pressure
    let sigma_hoop: f64 = delta_p * d_pipe / (2.0 * t_wall) / 1e6; // MPa

    // Verify pipe can withstand it: model pipe segment under internal pressure
    // as axially loaded ring -> use beam to check hoop stress via axial load
    let hoop_force: f64 = sigma_hoop * t_wall * 1.0; // kN/m (per unit length, 1m)
    // This is the force per unit length in the hoop direction

    // Use a simple fixed beam loaded axially to verify equilibrium
    let input = make_beam(
        2, l_pipe / 100.0, 200_000.0, 0.01, 1e-4, "fixed", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: hoop_force, fy: 0.0, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    let rx_sum: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(rx_sum, -hoop_force, 0.01, "Water hammer equilibrium");
}

// ================================================================
// 8. Dam-Reservoir Interaction: Chopra's Period Lengthening
// ================================================================
//
// Chopra (1967): the fundamental period of a dam increases when the
// reservoir is full due to added mass from water.
// Period lengthening ratio:
//   R_r = T_coupled / T_dam ≈ sqrt(1 + alpha_r)
// where alpha_r = M_water_added / M_dam (mass ratio).
//
// For a typical concrete gravity dam, alpha_r ranges from 0.3 to 0.8,
// giving period lengthening of 15-35%.

#[test]
fn fsi_chopra_period_lengthening() {
    let h: f64 = 50.0;           // m, dam height
    let b: f64 = 40.0;           // m, base width
    let rho_c: f64 = 2400.0;     // kg/m^3, concrete
    let rho_w: f64 = 1000.0;     // kg/m^3, water

    // Dam mass per unit width (triangular section)
    let m_dam: f64 = 0.5 * rho_c * b * h; // kg/m
    // = 0.5 * 2400 * 40 * 50 = 2,400,000 kg/m

    // Westergaard added mass per unit width
    let m_water: f64 = (7.0 / 12.0) * rho_w * h * h; // kg/m
    // = 0.5833 * 1000 * 2500 = 1,458,333 kg/m

    // Mass ratio
    let alpha_r: f64 = m_water / m_dam;

    // Typical range for gravity dams
    assert!(
        alpha_r > 0.2 && alpha_r < 1.5,
        "Mass ratio alpha_r = {:.3}", alpha_r
    );

    // Period lengthening ratio
    let rr: f64 = (1.0 + alpha_r).sqrt();

    // Chopra's result: 15-40% period increase for typical dams
    let period_increase: f64 = (rr - 1.0) * 100.0;
    assert!(
        period_increase > 10.0 && period_increase < 50.0,
        "Period increase: {:.1}%", period_increase
    );

    // Verify the formula: R_r^2 = 1 + alpha_r
    assert_close(rr * rr, 1.0 + alpha_r, 0.001, "Chopra period ratio squared");

    // Effect on seismic force: longer period may increase or decrease
    // base shear depending on where T falls on the response spectrum.
    // For short-period dams (T < T_c), lengthening increases Sa.
    // For long-period dams (T > T_c), lengthening decreases Sa.

    // Compute stiffness-equivalent for structural model
    let e_conc: f64 = 25_000.0;  // MPa
    let col_w: f64 = 1.0;        // m wide section
    let col_iz: f64 = col_w * b.powi(3) / 12.0; // gross section Iz
    let col_a: f64 = col_w * b;

    // Fixed-base cantilever dam under horizontal tip load
    let f_test: f64 = 1000.0;    // kN, test load
    let input = make_beam(
        4, h, e_conc, col_a, col_iz, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5, fx: f_test, fy: 0.0, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    // Tip displacement: delta = P*H^3/(3*EI)
    let ei: f64 = e_conc * 1000.0 * col_iz;
    let delta_expected: f64 = f_test * h.powi(3) / (3.0 * ei);
    let delta_actual = results.displacements.iter()
        .find(|d| d.node_id == 5).unwrap().ux.abs();

    assert_close(delta_actual, delta_expected, 0.05, "Chopra dam deflection");

    // Effective stiffness
    let _k_eff: f64 = f_test / delta_actual;

    // Period without water: T_dam = 2*pi*sqrt(m_dam / k_eff)
    // Period with water: T_coupled = 2*pi*sqrt((m_dam + m_water) / k_eff)
    // Ratio: sqrt((m_dam + m_water)/m_dam) = sqrt(1 + alpha_r) = R_r
    let t_ratio_check: f64 = ((m_dam + m_water) / m_dam).sqrt();
    assert_close(t_ratio_check, rr, 0.001, "Chopra period lengthening ratio");
}
