/// Validation: Rock Mechanics and Rock Engineering
///
/// References:
///   - Hoek & Brown, "Underground Excavations in Rock" (1980)
///   - Goodman, "Introduction to Rock Mechanics", 2nd ed. (1989)
///   - ISRM Suggested Methods for Rock Characterization
///   - Barton, Lien & Lunde, "Rock Mass Classification" (1974)
///   - Barton & Bandis, "Review of predictive capabilities of JRC-JCS model" (1990)
///   - EN 1997-1 (Eurocode 7): Geotechnical design
///   - Hoek, Carranza-Torres & Corkum, "Hoek-Brown failure criterion" (2002)
///   - Laubscher & Jakubec, "The MRMR system" (2001)
///
/// Tests verify classical rock mechanics formulas:
///   1. Hoek-Brown failure criterion (generalized)
///   2. Rock mass classification (RMR to GSI conversion)
///   3. Tunnel support pressure (Barton Q-system)
///   4. Rock bolt design (bolt capacity and spacing)
///   5. Rock slope stability (plane failure)
///   6. In-situ stress estimation (Sheorey model)
///   7. Rock joint shear strength (Barton-Bandis JRC-JCS model)
///   8. Pillar design in mining (tributary area method)

// ================================================================
// 1. Hoek-Brown Failure Criterion (Generalized)
// ================================================================
//
// The generalized Hoek-Brown criterion for rock masses:
//   sigma_1 = sigma_3 + sigma_ci * (m_b * sigma_3/sigma_ci + s)^a
//
// where:
//   m_b = m_i * exp((GSI - 100) / (28 - 14D))
//   s   = exp((GSI - 100) / (9 - 3D))
//   a   = 0.5 + (1/6) * (exp(-GSI/15) - exp(-20/3))
//
// Reference: Hoek, Carranza-Torres & Corkum (2002)

#[test]
fn rock_hoek_brown_failure_criterion() {
    // Intact rock properties
    let sigma_ci: f64 = 100.0;  // MPa, uniaxial compressive strength
    let m_i: f64 = 25.0;        // Hoek-Brown constant for granite
    let gsi: f64 = 65.0;        // Geological Strength Index
    let d: f64 = 0.0;           // disturbance factor (undisturbed)

    // Hoek-Brown parameters for the rock mass
    let m_b: f64 = m_i * ((gsi - 100.0) / (28.0 - 14.0 * d)).exp();
    // = 25 * exp((65-100)/(28)) = 25 * exp(-1.25) = 25 * 0.2865 = 7.163
    let m_b_expected: f64 = 25.0 * (-1.25_f64).exp();

    assert!(
        (m_b - m_b_expected).abs() / m_b_expected < 0.001,
        "m_b: {:.3}, expected {:.3}", m_b, m_b_expected
    );

    let s: f64 = ((gsi - 100.0) / (9.0 - 3.0 * d)).exp();
    // = exp((65-100)/9) = exp(-3.889) = 0.02040
    let s_expected: f64 = (-35.0 / 9.0_f64).exp();

    assert!(
        (s - s_expected).abs() / s_expected < 0.001,
        "s: {:.5}, expected {:.5}", s, s_expected
    );

    let a: f64 = 0.5 + (1.0 / 6.0) * ((-gsi / 15.0).exp() - (-20.0_f64 / 3.0).exp());
    // a should be close to 0.5 for high GSI, increases for low GSI
    assert!(
        a > 0.5 && a < 0.65,
        "a: {:.4} should be between 0.5 and 0.65 for GSI=65", a
    );

    // Check failure criterion at sigma_3 = 10 MPa confining pressure
    let sigma_3: f64 = 10.0;  // MPa
    let sigma_1: f64 = sigma_3 + sigma_ci * (m_b * sigma_3 / sigma_ci + s).powf(a);

    // sigma_1 should be significantly greater than sigma_3
    assert!(
        sigma_1 > sigma_3,
        "sigma_1 = {:.2} MPa must exceed sigma_3 = {:.2} MPa", sigma_1, sigma_3
    );

    // For sigma_3=0 (uniaxial case): sigma_1 = sigma_ci * s^a
    let _ucs_mass: f64 = sigma_ci * s.powf(a);
    assert!(
        _ucs_mass > 0.0 && _ucs_mass < sigma_ci,
        "Rock mass UCS = {:.2} MPa should be between 0 and sigma_ci = {:.0}", _ucs_mass, sigma_ci
    );

    // Tensile strength: sigma_t = -s * sigma_ci / m_b
    let sigma_t: f64 = -s * sigma_ci / m_b;
    assert!(
        sigma_t < 0.0 && sigma_t.abs() < sigma_ci * 0.05,
        "Tensile strength: {:.3} MPa (should be small negative)", sigma_t
    );
}

// ================================================================
// 2. Rock Mass Classification (RMR to GSI Conversion)
// ================================================================
//
// The Geological Strength Index (GSI) can be estimated from
// Bieniawski's Rock Mass Rating (RMR):
//   GSI = RMR_89 - 5   (for RMR > 23)
//
// RMR components: intact strength, RQD, joint spacing, joint
// condition, groundwater (Bieniawski 1989).
//
// Reference: Hoek & Brown (1997), ISRM Suggested Methods

#[test]
fn rock_mass_classification_rmr_gsi() {
    // RMR component ratings (Bieniawski 1989)
    let _r1_strength: f64 = 12.0;       // UCS 100-250 MPa -> rating 12
    let _r2_rqd: f64 = 17.0;            // RQD 75-90% -> rating 17
    let _r3_spacing: f64 = 15.0;        // Joint spacing 0.6-2m -> rating 15
    let _r4_condition: f64 = 20.0;       // Slightly rough, slightly weathered -> rating 20
    let _r5_groundwater: f64 = 10.0;     // Damp -> rating 10

    let rmr_89: f64 = _r1_strength + _r2_rqd + _r3_spacing + _r4_condition + _r5_groundwater;
    let rmr_expected: f64 = 74.0;

    assert!(
        (rmr_89 - rmr_expected).abs() < 0.01,
        "RMR_89: {:.0}, expected {:.0}", rmr_89, rmr_expected
    );

    // GSI from RMR (for RMR > 23)
    let gsi: f64 = rmr_89 - 5.0;
    let gsi_expected: f64 = 69.0;

    assert!(
        (gsi - gsi_expected).abs() < 0.01,
        "GSI: {:.0}, expected {:.0}", gsi, gsi_expected
    );

    // Rock mass quality classification
    // RMR 61-80: Good rock (Class II)
    assert!(
        rmr_89 > 61.0 && rmr_89 <= 80.0,
        "RMR = {:.0} should be Class II (Good rock, 61-80)", rmr_89
    );

    // Estimate rock mass deformation modulus (Hoek & Diederichs 2006)
    // E_rm = 100000 * [(1 - D/2) / (1 + exp((75 + 25D - GSI)/11))]  [MPa]
    let d: f64 = 0.0; // undisturbed
    let e_rm: f64 = 100_000.0 * ((1.0 - d / 2.0)
        / (1.0 + ((75.0 + 25.0 * d - gsi) / 11.0).exp()));
    // = 100000 / (1 + exp((75-69)/11)) = 100000 / (1 + exp(0.545))
    // = 100000 / (1 + 1.725) = 100000 / 2.725 = 36697 MPa

    assert!(
        e_rm > 10_000.0 && e_rm < 80_000.0,
        "E_rm: {:.0} MPa should be in range 10-80 GPa for GSI=69", e_rm
    );

    // Verify E_rm increases with GSI
    let gsi_low: f64 = 40.0;
    let e_rm_low: f64 = 100_000.0 * ((1.0 - d / 2.0)
        / (1.0 + ((75.0 + 25.0 * d - gsi_low) / 11.0).exp()));

    assert!(
        e_rm > e_rm_low,
        "E_rm(GSI=69) = {:.0} MPa > E_rm(GSI=40) = {:.0} MPa", e_rm, e_rm_low
    );
}

// ================================================================
// 3. Tunnel Support Pressure (Barton Q-System)
// ================================================================
//
// The Q-system (Barton, Lien & Lunde 1974):
//   Q = (RQD/Jn) * (Jr/Ja) * (Jw/SRF)
//
// Support pressure (Barton 2002):
//   P_roof = (2/3) * Jn^0.5 * Q^(-1/3) / (3*Jr)  [MPa]
//
// Equivalent dimension: De = D/ESR
//   where D = excavation span, ESR = excavation support ratio
//
// Reference: Barton et al. (1974), NGI classification

#[test]
fn rock_tunnel_support_q_system() {
    // Q-system input parameters
    let rqd: f64 = 80.0;    // Rock Quality Designation (%)
    let jn: f64 = 9.0;      // Joint set number (3 joint sets)
    let jr: f64 = 1.5;      // Joint roughness number (rough, undulating)
    let ja: f64 = 2.0;      // Joint alteration number (slightly altered walls)
    let jw: f64 = 1.0;      // Joint water reduction (dry)
    let srf: f64 = 2.5;     // Stress Reduction Factor (medium stress)

    // Q-value
    let q: f64 = (rqd / jn) * (jr / ja) * (jw / srf);
    // = (80/9) * (1.5/2.0) * (1.0/2.5)
    // = 8.889 * 0.75 * 0.4 = 2.667
    let q_expected: f64 = (80.0 / 9.0) * (1.5 / 2.0) * (1.0 / 2.5);

    assert!(
        (q - q_expected).abs() / q_expected < 0.001,
        "Q-value: {:.3}, expected {:.3}", q, q_expected
    );

    // Q classification: 1 < Q < 4 -> Poor rock
    assert!(
        q > 1.0 && q < 4.0,
        "Q = {:.2} should be Poor rock class (1-4)", q
    );

    // Support pressure for roof
    let p_roof: f64 = (2.0 / 3.0) * jn.sqrt() * q.powf(-1.0 / 3.0) / (3.0 * jr);
    // = 0.667 * 3.0 * 0.721 / 4.5 = 0.320 MPa

    assert!(
        p_roof > 0.0 && p_roof < 2.0,
        "Roof support pressure: {:.3} MPa", p_roof
    );

    // Equivalent dimension for tunnel sizing
    let span: f64 = 10.0;   // m, tunnel span
    let esr: f64 = 1.0;     // road tunnel
    let de: f64 = span / esr;

    assert!(
        (de - 10.0).abs() < 0.01,
        "Equivalent dimension: {:.1} m", de
    );

    // Verify higher Q gives lower support pressure
    let q_better: f64 = 10.0;
    let p_better: f64 = (2.0 / 3.0) * jn.sqrt() * q_better.powf(-1.0 / 3.0) / (3.0 * jr);

    assert!(
        p_better < p_roof,
        "Better Q={:.0}: P={:.3} MPa < P={:.3} MPa for Q={:.2}",
        q_better, p_better, p_roof, q
    );
}

// ================================================================
// 4. Rock Bolt Design
// ================================================================
//
// Rock bolt capacity and pattern design:
//   Bolt capacity: T_b = A_s * f_y  (steel yield)
//   Required bolt density: n = P_support * S_t * S_l / T_b
//   Factor of safety: FoS = T_b / (P * S_t * S_l)
//
// Reference: Hoek & Brown (1980), Goodman (1989)

#[test]
fn rock_bolt_design() {
    // Rock bolt properties
    let d_bolt: f64 = 25.0;            // mm, bolt diameter
    let f_y: f64 = 500.0;              // MPa, steel yield strength
    let a_s: f64 = std::f64::consts::PI * (d_bolt / 2.0).powi(2); // mm²
    let a_s_expected: f64 = std::f64::consts::PI * 12.5_f64.powi(2); // = 490.87 mm²

    assert!(
        (a_s - a_s_expected).abs() / a_s_expected < 0.001,
        "Bolt area: {:.1} mm², expected {:.1}", a_s, a_s_expected
    );

    // Bolt tensile capacity
    let t_b: f64 = a_s * f_y / 1000.0; // kN
    // = 490.87 * 500 / 1000 = 245.4 kN
    let t_b_expected: f64 = a_s_expected * f_y / 1000.0;

    assert!(
        (t_b - t_b_expected).abs() / t_b_expected < 0.001,
        "Bolt capacity: {:.1} kN, expected {:.1}", t_b, t_b_expected
    );

    // Support pressure from bolt pattern
    let s_t: f64 = 1.5;   // m, transverse spacing
    let s_l: f64 = 1.5;   // m, longitudinal spacing
    let p_support: f64 = t_b / (s_t * s_l); // kN/m²
    // = 245.4 / 2.25 = 109.1 kN/m² = 0.109 MPa

    let p_support_mpa: f64 = p_support / 1000.0;
    assert!(
        p_support_mpa > 0.05 && p_support_mpa < 0.5,
        "Support pressure from bolts: {:.3} MPa", p_support_mpa
    );

    // Required bolt length (empirical: L_bolt = 1.5 + 0.15 * B for roof)
    let _b_span: f64 = 10.0; // m, tunnel span
    let l_bolt: f64 = 1.5 + 0.15 * _b_span;
    let l_expected: f64 = 3.0; // m

    assert!(
        (l_bolt - l_expected).abs() / l_expected < 0.01,
        "Bolt length: {:.1} m, expected {:.1}", l_bolt, l_expected
    );

    // Factor of safety against bolt failure
    let p_demand: f64 = 0.08; // MPa, required support pressure
    let fos: f64 = p_support_mpa / p_demand;

    assert!(
        fos > 1.0,
        "Bolt FoS: {:.2} should be > 1.0", fos
    );
}

// ================================================================
// 5. Rock Slope Stability (Plane Failure)
// ================================================================
//
// Plane failure analysis for a rock slope with a through-going
// discontinuity dipping into the excavation.
//
// Factor of Safety (dry slope, no tension crack):
//   FoS = [c * A + W * cos(alpha_p) * tan(phi)] / [W * sin(alpha_p)]
//
// where:
//   alpha_p = dip of failure plane
//   alpha_f = slope face angle
//   W = weight of sliding block
//   A = area of failure plane
//
// Reference: Hoek & Bray, "Rock Slope Engineering", 3rd ed. (1981)

#[test]
fn rock_slope_plane_failure() {
    let alpha_f: f64 = 70.0_f64.to_radians(); // slope face angle
    let alpha_p: f64 = 40.0_f64.to_radians(); // failure plane dip
    let h: f64 = 20.0;                         // m, slope height
    let gamma_r: f64 = 26.0;                   // kN/m³, rock unit weight
    let c: f64 = 25.0;                         // kPa, cohesion on failure plane
    let phi: f64 = 35.0_f64.to_radians();      // friction angle on failure plane

    // Kinematic check: failure possible when alpha_p < alpha_f and alpha_p > phi
    assert!(
        alpha_p < alpha_f,
        "Failure plane dip ({:.0} deg) < slope face ({:.0} deg) -- kinematically possible",
        alpha_p.to_degrees(), alpha_f.to_degrees()
    );
    assert!(
        alpha_p > phi,
        "Failure plane dip ({:.0} deg) > friction angle ({:.0} deg) -- sliding tendency",
        alpha_p.to_degrees(), phi.to_degrees()
    );

    // Weight of the sliding block per unit width (2D plane strain)
    // W = 0.5 * gamma_r * H² * [(1/tan(alpha_p)) - (1/tan(alpha_f))]
    let w: f64 = 0.5 * gamma_r * h * h
        * (1.0 / alpha_p.tan() - 1.0 / alpha_f.tan());

    assert!(
        w > 0.0,
        "Block weight: {:.1} kN/m should be positive", w
    );

    // Area of failure plane per unit width
    // A = H / sin(alpha_p)
    let area: f64 = h / alpha_p.sin();

    assert!(
        area > h,
        "Failure plane length: {:.1} m > height {:.0} m", area, h
    );

    // Factor of safety (dry, no tension crack)
    let fos: f64 = (c * area + w * alpha_p.cos() * phi.tan()) / (w * alpha_p.sin());

    // FoS should be a reasonable value (usually 0.5 to 3.0 for design checks)
    assert!(
        fos > 0.3 && fos < 5.0,
        "Factor of safety: {:.3}", fos
    );

    // Verify that increasing cohesion increases FoS
    let c_higher: f64 = 50.0; // kPa
    let fos_higher_c: f64 = (c_higher * area + w * alpha_p.cos() * phi.tan())
        / (w * alpha_p.sin());

    assert!(
        fos_higher_c > fos,
        "Higher cohesion FoS={:.3} > FoS={:.3}", fos_higher_c, fos
    );

    // Verify that increasing friction angle increases FoS
    let phi_higher: f64 = 45.0_f64.to_radians();
    let fos_higher_phi: f64 = (c * area + w * alpha_p.cos() * phi_higher.tan())
        / (w * alpha_p.sin());

    assert!(
        fos_higher_phi > fos,
        "Higher friction FoS={:.3} > FoS={:.3}", fos_higher_phi, fos
    );
}

// ================================================================
// 6. In-Situ Stress Estimation (Sheorey Model)
// ================================================================
//
// The Sheorey (1994) model for horizontal-to-vertical stress ratio:
//   k = 0.25 + 7*E_h * (0.001 + 1/z)
//
// where E_h = deformation modulus (GPa), z = depth (m).
//
// Vertical stress:
//   sigma_v = gamma * z
//
// Horizontal stress:
//   sigma_h = k * sigma_v
//
// Reference: Sheorey (1994), Hoek & Brown (1980)

#[test]
fn rock_in_situ_stress_estimation() {
    let gamma: f64 = 0.027;      // MN/m³ (= 27 kN/m³ typical crystalline rock)
    let z: f64 = 500.0;          // m, depth below surface
    let e_h: f64 = 40.0;         // GPa, horizontal deformation modulus

    // Vertical stress (overburden pressure)
    let sigma_v: f64 = gamma * z; // MPa
    // = 0.027 * 500 = 13.5 MPa
    let sigma_v_expected: f64 = 13.5;

    assert!(
        (sigma_v - sigma_v_expected).abs() / sigma_v_expected < 0.01,
        "Vertical stress: {:.1} MPa, expected {:.1}", sigma_v, sigma_v_expected
    );

    // Sheorey k-ratio
    let k: f64 = 0.25 + 7.0 * e_h * (0.001 + 1.0 / z);
    // = 0.25 + 7 * 40 * (0.001 + 0.002) = 0.25 + 280 * 0.003 = 0.25 + 0.84 = 1.09

    assert!(
        k > 0.3 && k < 3.0,
        "k-ratio: {:.3} should be in typical range 0.3-3.0", k
    );

    // Horizontal stress
    let sigma_h: f64 = k * sigma_v;

    assert!(
        sigma_h > 0.0,
        "Horizontal stress: {:.2} MPa", sigma_h
    );

    // At shallow depth, k should be larger (stress ratio increases)
    let z_shallow: f64 = 100.0;
    let k_shallow: f64 = 0.25 + 7.0 * e_h * (0.001 + 1.0 / z_shallow);

    assert!(
        k_shallow > k,
        "k_shallow({:.0}m) = {:.3} > k_deep({:.0}m) = {:.3}",
        z_shallow, k_shallow, z, k
    );

    // At great depth, k approaches 0.25 + 7*E_h*0.001
    let z_deep: f64 = 5000.0;
    let k_deep: f64 = 0.25 + 7.0 * e_h * (0.001 + 1.0 / z_deep);
    let k_limit: f64 = 0.25 + 7.0 * e_h * 0.001;

    assert!(
        (k_deep - k_limit).abs() / k_limit < 0.15,
        "Deep k = {:.4} approaches limit {:.4}", k_deep, k_limit
    );

    // Verify gravitational gradient: sigma_v increases linearly with depth
    let z2: f64 = 1000.0;
    let sigma_v2: f64 = gamma * z2;
    let ratio: f64 = sigma_v2 / sigma_v;

    assert!(
        (ratio - 2.0).abs() < 0.01,
        "Stress doubles with double depth: ratio = {:.3}", ratio
    );
}

// ================================================================
// 7. Rock Joint Shear Strength (Barton-Bandis JRC-JCS Model)
// ================================================================
//
// The Barton-Bandis empirical shear strength criterion for rock joints:
//   tau = sigma_n * tan(JRC * log10(JCS/sigma_n) + phi_r)
//
// where:
//   JRC = Joint Roughness Coefficient (0-20)
//   JCS = Joint Wall Compressive Strength (MPa)
//   sigma_n = normal stress on joint (MPa)
//   phi_r = residual friction angle (degrees)
//
// Reference: Barton (1973), Barton & Choubey (1977)

#[test]
fn rock_joint_shear_barton_bandis() {
    let jrc: f64 = 10.0;         // Joint Roughness Coefficient (moderately rough)
    let jcs: f64 = 80.0;         // MPa, Joint Wall Compressive Strength
    let phi_r: f64 = 30.0;       // degrees, residual friction angle
    let sigma_n: f64 = 1.0;      // MPa, normal stress on joint

    // Barton-Bandis shear strength
    let angle_deg: f64 = jrc * (jcs / sigma_n).log10() + phi_r;
    let tau: f64 = sigma_n * angle_deg.to_radians().tan();

    // JRC * log10(JCS/sigma_n) = 10 * log10(80) = 10 * 1.903 = 19.03
    // Total angle = 19.03 + 30 = 49.03 degrees
    let jrc_contribution: f64 = jrc * (jcs / sigma_n).log10();
    let expected_angle: f64 = jrc_contribution + phi_r;

    assert!(
        (angle_deg - expected_angle).abs() < 0.01,
        "Peak friction angle: {:.2} deg, expected {:.2}", angle_deg, expected_angle
    );

    assert!(
        tau > 0.0,
        "Shear strength: {:.3} MPa should be positive", tau
    );

    // Upper limit check: total angle should not exceed 70 degrees (empirical limit)
    assert!(
        angle_deg < 70.0,
        "Peak angle {:.1} deg should be < 70 deg (Barton limit)", angle_deg
    );

    // Higher normal stress reduces the dilation component
    let sigma_n_high: f64 = 10.0; // MPa
    let angle_high: f64 = jrc * (jcs / sigma_n_high).log10() + phi_r;
    let tau_high: f64 = sigma_n_high * angle_high.to_radians().tan();

    assert!(
        angle_high < angle_deg,
        "Higher sigma_n: angle {:.1} < {:.1} deg (less dilation)", angle_high, angle_deg
    );

    // But shear strength still increases with normal stress (Mohr-Coulomb-like)
    assert!(
        tau_high > tau,
        "tau(sigma_n={:.0}) = {:.3} > tau(sigma_n={:.0}) = {:.3}",
        sigma_n_high, tau_high, sigma_n, tau
    );

    // At sigma_n = JCS, JRC contribution = 0, angle = phi_r
    let sigma_n_jcs: f64 = jcs;
    let angle_at_jcs: f64 = jrc * (jcs / sigma_n_jcs).log10() + phi_r;
    // log10(1) = 0, so angle = phi_r

    assert!(
        (angle_at_jcs - phi_r).abs() < 0.01,
        "At sigma_n=JCS: angle={:.2} should equal phi_r={:.1}", angle_at_jcs, phi_r
    );
}

// ================================================================
// 8. Pillar Design in Mining (Tributary Area Method)
// ================================================================
//
// Pillar stress from tributary area:
//   sigma_p = gamma * H * (w_o + w_p)^2 / w_p^2
//
// where w_o = opening width, w_p = pillar width, H = depth.
//
// Pillar strength (Obert-Duvall / Hedley-Grant):
//   S_p = k * sigma_c * w_p^alpha / h_p^beta
//   (Hedley-Grant: alpha=0.5, beta=0.75, k=constant)
//
// Factor of safety: FoS = S_p / sigma_p
//
// Reference: Brady & Brown, "Rock Mechanics for Underground Mining" (2004)

#[test]
fn rock_pillar_design_mining() {
    let gamma: f64 = 0.027;      // MN/m³ (27 kN/m³)
    let depth: f64 = 300.0;      // m, mining depth
    let w_o: f64 = 6.0;          // m, opening (room) width
    let w_p: f64 = 8.0;          // m, pillar width
    let h_p: f64 = 3.0;          // m, pillar height (mining height)
    let sigma_c: f64 = 60.0;     // MPa, intact rock UCS

    // Extraction ratio
    // For square pillars in a regular grid: e = 1 - (w_p/(w_o+w_p))^2
    let extraction_ratio: f64 = 1.0 - (w_p / (w_o + w_p)).powi(2);
    // = 1 - (8/14)^2 = 1 - 0.3265 = 0.6735
    let _e_expected: f64 = 1.0 - (8.0 / 14.0_f64).powi(2);

    assert!(
        (extraction_ratio - _e_expected).abs() < 0.001,
        "Extraction ratio: {:.4}, expected {:.4}", extraction_ratio, _e_expected
    );

    assert!(
        extraction_ratio > 0.0 && extraction_ratio < 1.0,
        "Extraction ratio {:.2} must be between 0 and 1", extraction_ratio
    );

    // Average pillar stress (tributary area)
    let sigma_v: f64 = gamma * depth; // MPa, virgin vertical stress
    let sigma_p: f64 = sigma_v / (1.0 - extraction_ratio);
    // = 8.1 / (1 - 0.6735) = 8.1 / 0.3265 = 24.81 MPa

    // Alternative formula: sigma_p = gamma * H * (w_o + w_p)^2 / w_p^2
    let sigma_p_alt: f64 = gamma * depth * (w_o + w_p).powi(2) / w_p.powi(2);

    assert!(
        (sigma_p - sigma_p_alt).abs() / sigma_p < 0.01,
        "Pillar stress: {:.2} MPa, alt formula: {:.2} MPa", sigma_p, sigma_p_alt
    );

    // Pillar strength (Hedley-Grant formula for hard rock)
    // S_p = k * sigma_c * (w_p^0.5 / h_p^0.75)
    let k_hg: f64 = 0.42; // empirical constant (Hedley & Grant 1972)
    let s_p: f64 = k_hg * sigma_c * w_p.powf(0.5) / h_p.powf(0.75);
    // = 0.42 * 60 * 2.828 / 2.280 = 31.25 MPa

    assert!(
        s_p > 0.0,
        "Pillar strength: {:.2} MPa", s_p
    );

    // Factor of safety
    let fos: f64 = s_p / sigma_p;

    assert!(
        fos > 0.5 && fos < 5.0,
        "Pillar FoS: {:.3}", fos
    );

    // Width-to-height ratio check
    let w_h_ratio: f64 = w_p / h_p;
    assert!(
        w_h_ratio > 1.0,
        "w/h ratio = {:.2} should be > 1.0 for squat pillar", w_h_ratio
    );

    // Verify wider pillar is stronger
    let w_p_wider: f64 = 12.0;
    let sigma_p_wider: f64 = gamma * depth * (w_o + w_p_wider).powi(2) / w_p_wider.powi(2);
    let s_p_wider: f64 = k_hg * sigma_c * w_p_wider.powf(0.5) / h_p.powf(0.75);
    let fos_wider: f64 = s_p_wider / sigma_p_wider;

    assert!(
        fos_wider > fos,
        "Wider pillar FoS={:.3} > original FoS={:.3}", fos_wider, fos
    );
}
