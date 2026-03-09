/// Validation: Soil Dynamics and Earthquake Geotechnical Engineering
///
/// References:
///   - Kramer: "Geotechnical Earthquake Engineering" (1996), Ch. 7-10
///   - Seed & Idriss: "Simplified Procedure for Evaluating Soil
///     Liquefaction Potential", JSMFD ASCE 97(9), 1971
///   - ASCE 7-22: Ch. 11 and 20 (Site Classification, Spectral Accelerations)
///   - Meyerhof: "Seismic Bearing Capacity" (1963)
///   - Mononobe-Okabe: Seismic Earth Pressure (1929)
///   - API RP 2A-WSD: "Recommended Practice for Planning, Designing and
///     Constructing Fixed Offshore Platforms" (p-y curves)
///   - Gazetas: "Foundation Vibrations", Ch. 15 in Foundation Engineering Handbook (1991)
///   - Newmark: "Effects of Earthquakes on Dams and Embankments" (1965)
///
/// Tests verify soil dynamics and geotechnical earthquake engineering formulas.
/// No solver calls -- pure arithmetic verification of analytical expressions.

use std::f64::consts::PI;

// ================================================================
// Tolerance helper
// ================================================================

fn assert_close(got: f64, expected: f64, rel_tol: f64, label: &str) {
    let err: f64 = if expected.abs() < 1e-12 {
        got.abs()
    } else {
        (got - expected).abs() / expected.abs()
    };
    assert!(
        err < rel_tol,
        "{}: got {:.6}, expected {:.6}, rel err = {:.4}%",
        label, got, expected, err * 100.0
    );
}

// ================================================================
// 1. Site Amplification Factors: Fa and Fv (ASCE 7 Tables 11.4-1/11.4-2)
// ================================================================
//
// For Site Class D (stiff soil) at Ss = 0.50g:
//   Fa = 1.4 (ASCE 7-22 Table 11.4-1)
// For Site Class D at S1 = 0.20g:
//   Fv = 1.8 (ASCE 7-22 Table 11.4-2)
//
// Design spectral accelerations:
//   SDS = (2/3) * Fa * Ss = (2/3)*1.4*0.50 = 0.4667g
//   SD1 = (2/3) * Fv * S1 = (2/3)*1.8*0.20 = 0.240g
//
// Transition periods:
//   Ts = SD1/SDS = 0.240/0.4667 = 0.5143 s
//   T0 = 0.2*Ts = 0.1029 s

#[test]
fn validation_site_amplification_factors() {
    let ss: f64 = 0.50;
    let s1: f64 = 0.20;
    let fa: f64 = 1.4;  // Site Class D, Ss = 0.50g
    let fv: f64 = 1.8;  // Site Class D, S1 = 0.20g

    // Design spectral acceleration parameters (ASCE 7-22 Eq. 11.4-3, 11.4-4)
    let sds: f64 = (2.0 / 3.0) * fa * ss;
    let sd1: f64 = (2.0 / 3.0) * fv * s1;

    let sds_expected: f64 = (2.0 / 3.0) * 1.4 * 0.50;
    let sd1_expected: f64 = (2.0 / 3.0) * 1.8 * 0.20;

    assert_close(sds, sds_expected, 0.001, "SDS = (2/3)*Fa*Ss");
    assert_close(sd1, sd1_expected, 0.001, "SD1 = (2/3)*Fv*S1");

    // Transition periods
    let ts: f64 = sd1 / sds;
    let t0: f64 = 0.2 * ts;

    assert_close(ts, sd1_expected / sds_expected, 0.001, "Ts = SD1/SDS");
    assert_close(t0, 0.2 * ts, 1e-10, "T0 = 0.2*Ts");

    // Verify amplification: soft sites amplify more at long periods
    // Fa increases from B to D: B=1.0, C=1.2, D=1.4 at Ss=0.50g
    let fa_b: f64 = 1.0;
    let fa_c: f64 = 1.2;
    let fa_d: f64 = 1.4;
    assert!(fa_b < fa_c && fa_c < fa_d, "Fa increases from B to D");

    // At very high Ss (>= 1.25g), Site Class D deamplifies
    let fa_d_high: f64 = 1.0;
    assert!(fa_d_high <= fa_d, "Fa decreases at high Ss for soft sites");

    // Sa at T = 1.0 s: Sa(T) = SD1/T = 0.240/1.0 = 0.240g
    let t_check: f64 = 1.0;
    let sa_1s: f64 = sd1 / t_check;
    assert_close(sa_1s, sd1, 0.001, "Sa(1.0s) = SD1 for T >= Ts");
}

// ================================================================
// 2. Liquefaction Potential: CRR from SPT N-value (Seed & Idriss)
// ================================================================
//
// CRR7.5 = 1/(34 - N1_60) + N1_60/135 + 50/(10*N1_60 + 45)^2 - 1/200
// (for N1_60 < 30, clean sand with FC < 5%)
//
// CSR = 0.65 * (amax/g) * (sigma_v/sigma_v') * rd
//
// Factor of safety: FS = CRR / CSR
// FS >= 1.0 means no liquefaction

#[test]
fn validation_liquefaction_crr_from_spt() {
    // SPT data: N1_60 = 15 (corrected blow count)
    let n1_60: f64 = 15.0;

    // CRR for magnitude 7.5 (Seed et al. deterministic curve, clean sand)
    // Simplified Youd et al. (2001) equation:
    let crr_75: f64 = 1.0 / (34.0 - n1_60) + n1_60 / 135.0
        + 50.0 / ((10.0 * n1_60 + 45.0) * (10.0 * n1_60 + 45.0)) - 1.0 / 200.0;

    // Hand calculation:
    // 1/(34-15) = 1/19 = 0.05263
    // 15/135 = 0.11111
    // 50/(195)^2 = 50/38025 = 0.001315
    // -1/200 = -0.005
    // CRR = 0.05263 + 0.11111 + 0.001315 - 0.005 = 0.1601
    let expected_crr: f64 = 1.0 / 19.0 + 15.0 / 135.0 + 50.0 / (195.0 * 195.0) - 0.005;
    assert_close(crr_75, expected_crr, 0.001, "CRR_7.5 for N1_60=15");

    // CSR calculation
    let amax: f64 = 0.25;       // g
    let sigma_v: f64 = 120.0;   // kPa, total vertical stress
    let sigma_v_eff: f64 = 80.0; // kPa, effective vertical stress
    let z: f64 = 6.0;           // m, depth
    let rd: f64 = 1.0 - 0.00765 * z; // stress reduction factor (z <= 9.15 m)

    let csr: f64 = 0.65 * amax * (sigma_v / sigma_v_eff) * rd;
    let expected_csr: f64 = 0.65 * 0.25 * (120.0 / 80.0) * (1.0 - 0.00765 * 6.0);
    assert_close(csr, expected_csr, 0.001, "CSR");

    // Magnitude scaling factor for M != 7.5:
    // MSF = 10^2.24 / Mw^2.56 (Idriss, 1999)
    let mw: f64 = 6.5;
    let msf: f64 = 10.0_f64.powf(2.24) / mw.powf(2.56);
    assert!(msf > 1.0, "MSF > 1 for M < 7.5 (less severe)");

    // Adjusted CRR = CRR_7.5 * MSF
    let crr_adj: f64 = crr_75 * msf;
    assert!(crr_adj > crr_75, "Adjusted CRR > CRR_7.5 for M < 7.5");

    // Factor of safety against liquefaction
    let fs: f64 = crr_adj / csr;
    assert!(fs > 0.0, "Factor of safety is positive");

    // Higher N1_60 should give higher CRR (more resistant)
    let n1_60_high: f64 = 25.0;
    let crr_high: f64 = 1.0 / (34.0 - n1_60_high) + n1_60_high / 135.0
        + 50.0 / ((10.0 * n1_60_high + 45.0) * (10.0 * n1_60_high + 45.0)) - 1.0 / 200.0;
    assert!(crr_high > crr_75, "Higher N1_60 gives higher CRR");
}

// ================================================================
// 3. Newmark Sliding Block: Permanent Displacement
// ================================================================
//
// Newmark (1965) rigid block on inclined plane:
// Displacement: D = V^2 / (2*g*(a_y/g))  (simplified upper bound)
// where a_y = yield acceleration, V = max velocity
//
// Empirical (Jibson, 2007):
//   log(D) = 0.215 + log((1 - a_y/amax)^2.341 * (a_y/amax)^(-1.438))
// where D in cm, amax = PGA

#[test]
fn validation_newmark_sliding_block() {
    let ay: f64 = 0.15;    // g, yield acceleration
    let amax: f64 = 0.40;  // g, peak ground acceleration
    let g: f64 = 9.81;     // m/s^2

    // Ratio of yield to peak acceleration
    let ac_ratio: f64 = ay / amax;
    assert_close(ac_ratio, 0.375, 0.001, "ay/amax ratio");
    assert!(ac_ratio < 1.0, "Yield accel < PGA for sliding to occur");

    // Jibson (2007) empirical equation for rigid block displacement
    // log(D) = 0.215 + log((1 - ay/amax)^2.341 * (ay/amax)^(-1.438))
    // D in cm
    let log_d_cm: f64 = 0.215 + ((1.0 - ac_ratio).powf(2.341) * ac_ratio.powf(-1.438)).log10();
    let d_cm: f64 = 10.0_f64.powf(log_d_cm);
    let d_m: f64 = d_cm / 100.0;

    assert!(d_cm > 0.0, "Displacement is positive");
    assert!(d_m < 1.0, "Displacement < 1 m for moderate earthquake");

    // Higher PGA (lower ratio) should give more displacement
    let amax_high: f64 = 0.60;
    let ac_ratio_high: f64 = ay / amax_high;
    let log_d_high: f64 = 0.215 + ((1.0 - ac_ratio_high).powf(2.341) * ac_ratio_high.powf(-1.438)).log10();
    let d_high: f64 = 10.0_f64.powf(log_d_high);
    assert!(d_high > d_cm, "Higher PGA gives more displacement");

    // Higher yield acceleration should give less displacement
    let ay_high: f64 = 0.30;
    let ac_ratio_high_ay: f64 = ay_high / amax;
    let log_d_high_ay: f64 = 0.215 + ((1.0 - ac_ratio_high_ay).powf(2.341) * ac_ratio_high_ay.powf(-1.438)).log10();
    let d_high_ay: f64 = 10.0_f64.powf(log_d_high_ay);
    assert!(d_high_ay < d_cm, "Higher yield accel gives less displacement");

    // Simplified Newmark upper bound: D = V_max^2 / (2*a_y*g)
    // Using PGV estimate: V_max ~ amax * g / (2*pi*f_dom), f_dom ~ 2 Hz
    let f_dom: f64 = 2.0;
    let v_max: f64 = amax * g / (2.0 * PI * f_dom);
    let d_upper: f64 = v_max * v_max / (2.0 * ay * g);
    assert!(d_upper > 0.0, "Upper bound displacement is positive");
}

// ================================================================
// 4. Ground Response: 1D Wave Propagation
// ================================================================
//
// Uniform soil layer over rigid bedrock:
// Impedance ratio: alpha_z = (rho_1 * Vs_1) / (rho_2 * Vs_2)
// Amplification at surface (undamped): |F(w)| = 1 / cos(w*H/Vs)
// Fundamental frequency: f1 = Vs / (4*H)
// With damping: |F_res| ~ 2/(pi*xi) at resonance

#[test]
fn validation_ground_response_1d() {
    let rho_soil: f64 = 1800.0;   // kg/m^3
    let vs_soil: f64 = 200.0;     // m/s
    let rho_rock: f64 = 2500.0;   // kg/m^3
    let vs_rock: f64 = 800.0;     // m/s
    let h: f64 = 20.0;            // m, layer thickness
    let xi: f64 = 0.05;           // 5% damping

    // Impedance ratio
    let z_soil: f64 = rho_soil * vs_soil;
    let z_rock: f64 = rho_rock * vs_rock;
    let alpha_z: f64 = z_soil / z_rock;

    assert_close(z_soil, 360_000.0, 0.001, "Soil impedance");
    assert_close(z_rock, 2_000_000.0, 0.001, "Rock impedance");
    assert_close(alpha_z, 0.18, 0.001, "Impedance ratio");
    assert!(alpha_z < 1.0, "Soil impedance < rock impedance");

    // Fundamental frequency
    let f1: f64 = vs_soil / (4.0 * h);
    assert_close(f1, 2.5, 0.001, "Fundamental frequency f1");

    // Site period
    let t_site: f64 = 1.0 / f1;
    assert_close(t_site, 0.4, 0.001, "Site period");

    // Amplification at resonance with damping
    let amp_res: f64 = 2.0 / (PI * xi);
    assert_close(amp_res, 2.0 / (PI * 0.05), 0.001, "Damped resonance amplification");

    // Amplification at non-resonant frequency (1 Hz)
    let f_test: f64 = 1.0;
    let omega_test: f64 = 2.0 * PI * f_test;
    let cos_arg: f64 = omega_test * h / vs_soil;
    let amp_1hz: f64 = 1.0 / cos_arg.cos().abs();
    assert!(amp_1hz > 1.0, "Surface amplification > 1 at 1 Hz");

    // Higher modes: f_n = (2n-1) * f1
    let f2: f64 = 3.0 * f1;
    let f3: f64 = 5.0 * f1;
    assert_close(f2, 7.5, 0.001, "Second mode frequency");
    assert_close(f3, 12.5, 0.001, "Third mode frequency");
}

// ================================================================
// 5. Seismic Bearing Capacity: Meyerhof Reduction Factors
// ================================================================
//
// Static bearing capacity: qu = c*Nc + q*Nq + 0.5*gamma*B*Ngamma
// Seismic reduction (Richards et al. 1993):
//   qu_seismic = qu_static * (1 - kh*tan(phi))
//
// For phi=30deg, kh=0.2:
//   Reduction = 1 - 0.2*tan(30) = 1 - 0.1155 = 0.8845

#[test]
fn validation_seismic_bearing_capacity() {
    let c: f64 = 20.0;        // kPa
    let phi_deg: f64 = 30.0;
    let phi: f64 = phi_deg * PI / 180.0;
    let gamma: f64 = 18.0;    // kN/m^3
    let b: f64 = 2.0;         // m
    let df: f64 = 1.5;        // m
    let q: f64 = gamma * df;  // overburden pressure

    // Bearing capacity factors
    let nq: f64 = (PI * phi.tan()).exp() * (PI / 4.0 + phi / 2.0).tan().powi(2);
    let nc: f64 = (nq - 1.0) / phi.tan();
    let n_gamma: f64 = 2.0 * (nq + 1.0) * phi.tan(); // Vesic approximation

    assert_close(nq, 18.401, 0.02, "Nq for phi=30");
    assert_close(nc, 30.14, 0.02, "Nc for phi=30");

    // Static bearing capacity
    let qu_static: f64 = c * nc + q * nq + 0.5 * gamma * b * n_gamma;

    // Seismic reduction
    let kh: f64 = 0.2;
    let rf: f64 = 1.0 - kh * phi.tan();
    let qu_seismic: f64 = qu_static * rf;

    assert_close(rf, 1.0 - 0.2 * (30.0_f64 * PI / 180.0).tan(), 0.001, "Reduction factor");
    assert!(rf > 0.0 && rf < 1.0, "Reduction factor in (0,1)");
    assert!(qu_seismic < qu_static, "Seismic < static bearing capacity");

    // Higher kh gives more reduction
    let kh_high: f64 = 0.4;
    let rf_high: f64 = 1.0 - kh_high * phi.tan();
    assert!(rf_high < rf, "Higher kh gives more reduction");

    // Factor of safety
    let q_applied: f64 = 200.0; // kPa, applied pressure
    let fs_static: f64 = qu_static / q_applied;
    let fs_seismic: f64 = qu_seismic / q_applied;
    assert!(fs_seismic < fs_static, "Seismic FS < static FS");
}

// ================================================================
// 6. Lateral Earth Pressure (Mononobe-Okabe): Seismic Active Pressure
// ================================================================
//
// KAE = cos^2(phi - theta - beta) /
//       [cos(theta)*cos^2(beta)*cos(delta+beta+theta) *
//        (1 + sqrt(sin(phi+delta)*sin(phi-theta-i) / (cos(delta+beta+theta)*cos(i-beta))))^2]
//
// For vertical wall (beta=0), horizontal backfill (i=0):
//   theta = atan(kh/(1-kv))
//   phi=35deg, delta=17.5deg, kh=0.1, kv=0

#[test]
fn validation_mononobe_okabe_pressure() {
    let phi_deg: f64 = 35.0;
    let phi: f64 = phi_deg * PI / 180.0;
    let delta_deg: f64 = 17.5; // wall friction = phi/2
    let delta: f64 = delta_deg * PI / 180.0;
    let kh: f64 = 0.1;
    let kv: f64 = 0.0;
    let beta: f64 = 0.0;  // vertical wall
    let i: f64 = 0.0;     // horizontal backfill

    // Seismic inertia angle
    let theta: f64 = (kh / (1.0 - kv)).atan();
    assert_close(theta, kh.atan(), 0.001, "Theta for kv=0");

    // Mononobe-Okabe active earth pressure coefficient
    let num: f64 = (phi - theta - beta).cos().powi(2);
    let sin_term: f64 = ((phi + delta).sin() * (phi - theta - i).sin()
        / ((delta + beta + theta).cos() * (i - beta).cos())).sqrt();
    let denom: f64 = theta.cos() * beta.cos().powi(2) * (delta + beta + theta).cos()
        * (1.0 + sin_term).powi(2);

    let kae: f64 = num / denom;

    // Static Coulomb active coefficient (theta=0)
    let num_static: f64 = (phi - beta).cos().powi(2);
    let sin_term_static: f64 = ((phi + delta).sin() * (phi - i).sin()
        / ((delta + beta).cos() * (i - beta).cos())).sqrt();
    let denom_static: f64 = beta.cos().powi(2) * (delta + beta).cos()
        * (1.0 + sin_term_static).powi(2);
    let ka_static: f64 = num_static / denom_static;

    // KAE should be greater than static Ka (seismic increases active pressure)
    assert!(kae > ka_static, "Seismic KAE > static Ka");

    // Compute earth pressure force
    let gamma: f64 = 18.0;  // kN/m^3
    let h_wall: f64 = 6.0;  // m
    let pae: f64 = 0.5 * gamma * h_wall * h_wall * kae;
    let pa_static: f64 = 0.5 * gamma * h_wall * h_wall * ka_static;

    assert!(pae > pa_static, "Seismic force > static force");

    // Dynamic increment
    let delta_pae: f64 = pae - pa_static;
    assert!(delta_pae > 0.0, "Dynamic increment is positive");

    // Point of application: static at H/3, dynamic increment at 0.6H
    let h_static: f64 = h_wall / 3.0;
    let h_dynamic: f64 = 0.6 * h_wall;
    let h_resultant: f64 = (pa_static * h_static + delta_pae * h_dynamic) / pae;
    assert!(h_resultant > h_static, "Resultant acts higher than H/3");
    assert!(h_resultant < h_wall, "Resultant below top of wall");
}

// ================================================================
// 7. p-y Curves: API Sand p-y Curve at Given Depth
// ================================================================
//
// API RP 2A: p-y curve for sand
//   p_u = min(p_us, p_ud) where:
//     p_us = (C1*z + C2*D) * gamma' * z  (shallow)
//     p_ud = C3 * D * gamma' * z          (deep)
//   p = A * p_u * tanh(k*z*y / (A*p_u))
//
// where A = 0.9 for cyclic, 3.0 - 0.8*z/D >= 0.9 for static

#[test]
fn validation_api_sand_py_curve() {
    let phi_deg: f64 = 35.0;
    let phi: f64 = phi_deg * PI / 180.0;
    let gamma_eff: f64 = 10.0;  // kN/m^3, effective unit weight (submerged)
    let d: f64 = 1.0;           // m, pile diameter
    let z: f64 = 5.0;           // m, depth below mudline

    // API coefficients for phi = 35deg (from API charts/tables)
    let c1: f64 = 2.2;
    let c2: f64 = 2.5;
    let c3: f64 = 40.0;
    let k_initial: f64 = 25_000.0; // kN/m^3, initial modulus of subgrade reaction

    // Ultimate soil resistance
    let p_us: f64 = (c1 * z + c2 * d) * gamma_eff * z;
    let p_ud: f64 = c3 * d * gamma_eff * z;
    let p_u: f64 = p_us.min(p_ud);

    // Hand calculation:
    // p_us = (2.2*5 + 2.5*1)*10*5 = (11+2.5)*50 = 675 kN/m
    // p_ud = 40*1*10*5 = 2000 kN/m
    // p_u = min(675, 2000) = 675 kN/m (shallow controls)
    assert_close(p_us, (2.2 * 5.0 + 2.5 * 1.0) * 10.0 * 5.0, 0.001, "p_us shallow");
    assert_close(p_ud, 40.0 * 1.0 * 10.0 * 5.0, 0.001, "p_ud deep");
    assert_close(p_u, p_us, 0.001, "Shallow mechanism controls");

    // Static loading factor
    let a_static: f64 = (3.0 - 0.8 * z / d).max(0.9);
    assert_close(a_static, (3.0_f64 - 4.0).max(0.9), 0.001, "A_static");

    // Cyclic loading factor
    let a_cyclic: f64 = 0.9;

    // p-y curve: p = A*pu*tanh(k*z*y/(A*pu))
    let y_test: f64 = 0.01; // m, lateral displacement
    let p_static: f64 = a_static * p_u * (k_initial * z * y_test / (a_static * p_u)).tanh();
    let p_cyclic: f64 = a_cyclic * p_u * (k_initial * z * y_test / (a_cyclic * p_u)).tanh();

    assert!(p_static > 0.0, "Static p is positive");
    assert!(p_cyclic > 0.0, "Cyclic p is positive");
    assert!(p_cyclic <= p_static + 1e-10, "Cyclic p <= static p");

    // At large y, p approaches A*pu (asymptote)
    let y_large: f64 = 1.0;
    let p_large: f64 = a_static * p_u * (k_initial * z * y_large / (a_static * p_u)).tanh();
    assert!((p_large - a_static * p_u).abs() / (a_static * p_u) < 0.01, "p approaches A*pu at large y");

    // Initial stiffness = k*z
    let stiffness: f64 = k_initial * z;
    assert_close(stiffness, 125_000.0, 0.001, "Initial p-y stiffness");

    let _ = phi; // acknowledge
}

// ================================================================
// 8. Dynamic Soil Stiffness: Impedance Functions (Gazetas)
// ================================================================
//
// Surface circular footing on elastic half-space (Gazetas 1991):
//   K_v = 4*G*R/(1-nu)              (vertical)
//   K_h = 32*(1-nu)*G*R/(7-8*nu)    (horizontal/sliding)
//   K_r = 8*G*R^3/(3*(1-nu))        (rocking)
//
// where G = shear modulus, R = footing radius, nu = Poisson's ratio
//
// G from Vs: G = rho * Vs^2

#[test]
fn validation_dynamic_soil_stiffness_gazetas() {
    let rho: f64 = 1800.0;    // kg/m^3
    let vs: f64 = 200.0;      // m/s
    let nu: f64 = 0.33;       // Poisson's ratio
    let r: f64 = 2.0;         // m, footing radius

    // Shear modulus
    let g: f64 = rho * vs * vs;
    assert_close(g, 72_000_000.0, 0.001, "Shear modulus G = rho*Vs^2");

    // Vertical stiffness
    let k_v: f64 = 4.0 * g * r / (1.0 - nu);
    let expected_kv: f64 = 4.0 * 72e6 * 2.0 / (1.0 - 0.33);
    assert_close(k_v, expected_kv, 0.001, "Vertical stiffness K_v");

    // Horizontal (sliding) stiffness
    let k_h: f64 = 32.0 * (1.0 - nu) * g * r / (7.0 - 8.0 * nu);
    let expected_kh: f64 = 32.0 * 0.67 * 72e6 * 2.0 / (7.0 - 2.64);
    assert_close(k_h, expected_kh, 0.001, "Horizontal stiffness K_h");

    // Rocking stiffness
    let k_r: f64 = 8.0 * g * r.powi(3) / (3.0 * (1.0 - nu));
    let expected_kr: f64 = 8.0 * 72e6 * 8.0 / (3.0 * 0.67);
    assert_close(k_r, expected_kr, 0.001, "Rocking stiffness K_r");

    // Stiffness ratios
    assert!(k_v > k_h, "Vertical stiffness > horizontal stiffness");
    assert!(k_r > 0.0, "Rocking stiffness is positive");

    // Vertical natural frequency of footing-soil system
    // f_v = (1/(2*pi)) * sqrt(K_v / m_footing)
    let m_footing: f64 = 50_000.0; // kg
    let f_v: f64 = (1.0 / (2.0 * PI)) * (k_v / m_footing).sqrt();
    assert!(f_v > 1.0, "Vertical natural frequency > 1 Hz");

    // Doubling shear modulus doubles all stiffnesses
    let k_v_2g: f64 = 4.0 * (2.0 * g) * r / (1.0 - nu);
    assert_close(k_v_2g / k_v, 2.0, 0.001, "Doubling G doubles K_v");

    // Stiffness proportional to R for vertical, R^3 for rocking
    let r2: f64 = 3.0;
    let k_v_r2: f64 = 4.0 * g * r2 / (1.0 - nu);
    let k_r_r2: f64 = 8.0 * g * r2.powi(3) / (3.0 * (1.0 - nu));
    assert_close(k_v_r2 / k_v, r2 / r, 0.001, "K_v proportional to R");
    assert_close(k_r_r2 / k_r, (r2 / r).powi(3), 0.001, "K_r proportional to R^3");
}
