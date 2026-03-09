/// Validation: Soil-Structure Interaction
///
/// References:
///   - Bowles, "Foundation Analysis and Design", 5th Ed., McGraw-Hill
///   - Das, "Principles of Foundation Engineering", 9th Ed.
///   - Vesic, "Bending of Beams Resting on Isotropic Elastic Solid", ASCE 1961
///   - Biot, "Bending of an Infinite Beam on an Elastic Foundation", J. Appl. Mech. 1937
///   - Meyerhof, "Bearing Capacity and Settlement of Pile Foundations", ASCE 1976
///   - Broms, "Lateral Resistance of Piles in Cohesive Soils", ASCE 1964
///   - Gazetas, "Foundation Vibrations", Ch. 15 in "Foundation Engineering Handbook"
///   - Poulos & Davis, "Pile Foundation Analysis and Design", Wiley
///
/// Tests verify soil-structure interaction formulas without calling the solver.
/// Pure arithmetic verification of analytical expressions.

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
// 1. Winkler Modulus from Soil Bearing Capacity
// ================================================================
//
// The Winkler spring constant (coefficient of subgrade reaction) k_s
// can be estimated from the allowable bearing capacity q_a and
// allowable settlement delta_a:
//   k_s = q_a / delta_a
//
// For a square footing of width B on the surface of a clay:
//   k_s(BxB) = k_s1 * [(B + 0.305)/(2B)]^2    (Terzaghi, for B in meters)
// where k_s1 is for a 0.305m (1 ft) plate.
//
// Reference: Bowles, Ch. 9; Terzaghi, "Evaluation of Subgrade Reaction"

#[test]
fn validation_winkler_modulus_from_bearing() {
    let q_a: f64 = 200.0;   // kN/m2, allowable bearing pressure
    let delta_a: f64 = 0.025; // m, allowable settlement (25 mm)

    // Direct estimate
    let k_s: f64 = q_a / delta_a;
    assert_close(k_s, 8000.0, 1e-10, "k_s = q_a/delta_a = 8000 kN/m3");

    // Terzaghi correction for footing size (clay)
    let k_s1: f64 = 24000.0; // kN/m3 for 0.305m plate (typical stiff clay)
    let b: f64 = 2.0;        // m, footing width

    let size_factor: f64 = ((b + 0.305) / (2.0 * b)).powi(2);
    let k_s_corrected: f64 = k_s1 * size_factor;

    let expected_factor: f64 = (2.305_f64 / 4.0).powi(2);
    assert_close(size_factor, expected_factor, 1e-10, "Terzaghi size factor");

    // k_s decreases with increasing footing size
    let b2: f64 = 4.0;
    let factor2: f64 = ((b2 + 0.305) / (2.0 * b2)).powi(2);
    assert!(factor2 < size_factor, "Larger footing -> lower k_s");

    assert_close(k_s_corrected, k_s1 * expected_factor, 1e-10, "Corrected k_s value");
}

// ================================================================
// 2. Coefficient of Subgrade Reaction (Vesic, Biot)
// ================================================================
//
// Vesic (1961) proposed a formula relating k_s to soil elastic modulus:
//   k_s = 0.65 * 12th_root(E_s B^4 / (EI)) * E_s / (1 - nu_s^2)
//
// Biot (1937) characteristic length for beam on elastic foundation:
//   lambda = 4th_root(k_s B / (4 EI))
//   Characteristic length L_c = 1/lambda
//
// Reference: Vesic (1961), ASCE; Biot (1937)

#[test]
fn validation_subgrade_reaction_vesic_biot() {
    let e_s: f64 = 20000.0;  // kN/m2, soil elastic modulus
    let nu_s: f64 = 0.35;    // soil Poisson's ratio
    let b_beam: f64 = 0.5;   // m, beam (footing) width
    let ei: f64 = 50000.0;   // kN*m2, beam flexural stiffness

    // Vesic formula
    let vesic_factor: f64 = (e_s * b_beam.powi(4) / ei).powf(1.0 / 12.0);
    let k_s_vesic: f64 = 0.65 * vesic_factor * e_s / (1.0 - nu_s * nu_s);

    let expected_denom: f64 = 1.0 - 0.1225;
    assert_close(1.0 - nu_s * nu_s, expected_denom, 1e-10, "1-nu^2 = 0.8775");

    // k_s should be positive and in a reasonable range
    assert!(k_s_vesic > 0.0, "k_s > 0");
    assert!(k_s_vesic > 1000.0 && k_s_vesic < 100000.0,
        "k_s = {} in reasonable range for medium soil", k_s_vesic);

    // Biot characteristic length
    let k_s: f64 = k_s_vesic;
    let lambda: f64 = (k_s * b_beam / (4.0 * ei)).powf(0.25);
    let l_c: f64 = 1.0 / lambda;

    // Verify: lambda^4 = k_s B / (4 EI)
    let lambda4_check: f64 = k_s * b_beam / (4.0 * ei);
    assert_close(lambda.powi(4), lambda4_check, 1e-10, "lambda^4 = k_s B/(4EI)");

    // The beam is "rigid" if L < pi/(2*lambda), "flexible" if L > pi/lambda
    let l_rigid: f64 = PI / (2.0 * lambda);
    let l_flexible: f64 = PI / lambda;
    assert!(l_flexible > l_rigid, "Flexible length > rigid length");
    assert_close(l_flexible, 2.0 * l_rigid, 1e-10, "L_flex = 2 L_rigid");
    assert!(l_c > 0.0, "Characteristic length > 0");
}

// ================================================================
// 3. Mat Foundation Stiffness (6-DOF Springs)
// ================================================================
//
// A rigid circular foundation of radius R on a half-space (E_s, nu_s):
//   Vertical:    K_z = 4 G R / (1 - nu)
//   Horizontal:  K_h = 8 G R / (2 - nu)
//   Rocking:     K_r = 8 G R^3 / (3(1 - nu))
//   Torsional:   K_t = 16 G R^3 / 3
//
// G = E_s / (2(1+nu))
//
// Reference: Gazetas (1991), "Foundation Vibrations"; Poulos & Davis

#[test]
fn validation_mat_foundation_stiffness() {
    let e_s: f64 = 50000.0;   // kN/m2, soil modulus
    let nu_s: f64 = 0.3;
    let r: f64 = 5.0;         // m, equivalent circular radius

    let g: f64 = e_s / (2.0 * (1.0 + nu_s));
    assert_close(g, 50000.0 / 2.6, 1e-10, "G = E/(2(1+nu))");

    // Vertical stiffness
    let k_z: f64 = 4.0 * g * r / (1.0 - nu_s);
    let expected_kz: f64 = 4.0 * g * 5.0 / 0.7;
    assert_close(k_z, expected_kz, 1e-10, "K_z = 4GR/(1-nu)");

    // Horizontal stiffness
    let k_h: f64 = 8.0 * g * r / (2.0 - nu_s);
    let expected_kh: f64 = 8.0 * g * 5.0 / 1.7;
    assert_close(k_h, expected_kh, 1e-10, "K_h = 8GR/(2-nu)");

    // Rocking stiffness
    let k_r: f64 = 8.0 * g * r.powi(3) / (3.0 * (1.0 - nu_s));
    let expected_kr: f64 = 8.0 * g * 125.0 / 2.1;
    assert_close(k_r, expected_kr, 1e-10, "K_r = 8GR^3/(3(1-nu))");

    // Torsional stiffness
    let k_t: f64 = 16.0 * g * r.powi(3) / 3.0;
    let expected_kt: f64 = 16.0 * g * 125.0 / 3.0;
    assert_close(k_t, expected_kt, 1e-10, "K_t = 16GR^3/3");

    // K_z > K_h for nu < 0.5
    assert!(k_z > k_h, "K_z > K_h for nu < 0.5");

    // K_r/K_z ratio = 2R^2/3
    let kr_kz_ratio: f64 = k_r / k_z;
    let expected_ratio: f64 = 2.0 * r * r / 3.0;
    assert_close(kr_kz_ratio, expected_ratio, 1e-10, "K_r/K_z = 2R^2/3");
}

// ================================================================
// 4. Pile Axial Capacity (Meyerhof End Bearing + Side Friction)
// ================================================================
//
// Meyerhof (1976) method for driven piles in sand:
//   Q_p = A_p * q_p     (end bearing)
//   Q_s = Sum f_si * A_si  (side friction)
//   Q_ult = Q_p + Q_s
//
// End bearing: q_p = N_q * sigma'_v at tip
// Side friction: f_s = K_s * sigma'_v * tan(delta)
//
// Reference: Meyerhof (1976), ASCE; Das, Ch. 11

#[test]
fn validation_pile_axial_capacity() {
    let d: f64 = 0.4;       // m, pile diameter
    let l: f64 = 15.0;      // m, pile length
    let gamma: f64 = 18.0;  // kN/m3, unit weight of soil
    let phi: f64 = 35.0;    // degrees, friction angle
    let delta: f64 = 0.75 * phi; // pile-soil friction angle
    let k_s: f64 = 1.2;     // lateral earth pressure coefficient

    // Pile tip area
    let a_p: f64 = PI * d * d / 4.0;
    let expected_ap: f64 = PI * 0.16 / 4.0;
    assert_close(a_p, expected_ap, 1e-10, "Pile tip area");

    // Effective vertical stress at tip
    let sigma_v_tip: f64 = gamma * l;
    assert_close(sigma_v_tip, 270.0, 1e-10, "sigma'_v at tip = gamma*L");

    // Bearing capacity factor N_q
    let phi_rad: f64 = phi * PI / 180.0;
    let n_q: f64 = (PI * phi_rad.tan()).exp() * (PI / 4.0 + phi_rad / 2.0).tan().powi(2);
    assert!(n_q > 30.0 && n_q < 40.0, "N_q = {} approx 33 for phi=35", n_q);

    // End bearing capacity
    let q_p: f64 = n_q * sigma_v_tip;
    let q_ult_tip: f64 = q_p * a_p;

    // Side friction: f_s = K_s * sigma'_v,avg * tan(delta)
    let sigma_v_avg: f64 = gamma * l / 2.0;
    let delta_rad: f64 = delta * PI / 180.0;
    let f_s: f64 = k_s * sigma_v_avg * delta_rad.tan();

    // Side friction area
    let a_s: f64 = PI * d * l;
    let expected_as: f64 = PI * 0.4 * 15.0;
    assert_close(a_s, expected_as, 1e-10, "Pile side area pi*d*L");

    let q_ult_side: f64 = f_s * a_s;

    // Total capacity
    let q_ult: f64 = q_ult_tip + q_ult_side;
    assert!(q_ult > q_ult_tip, "Total > end bearing alone");
    assert!(q_ult > q_ult_side, "Total > side friction alone");

    // Allowable capacity with FoS = 2.5
    let fos: f64 = 2.5;
    let q_allow: f64 = q_ult / fos;
    assert_close(q_allow, q_ult / 2.5, 1e-10, "Allowable = Q_ult/FoS");
}

// ================================================================
// 5. Lateral Pile Response -- Broms Method
// ================================================================
//
// Broms (1964) method for short piles in cohesive soil:
//   Ultimate lateral capacity: H_u = 9 c_u d (L - 1.5d)  (approx.)
//
// For long piles (failure by pile yielding):
//   M_y = H_u(1.5d + H_u/(18 c_u d))
//
// Reference: Broms (1964), ASCE; Poulos & Davis, Ch. 5

#[test]
fn validation_lateral_pile_broms() {
    let d: f64 = 0.6;      // m, pile diameter
    let l: f64 = 8.0;      // m, embedded length
    let c_u: f64 = 50.0;   // kN/m2, undrained shear strength
    let m_y: f64 = 500.0;  // kN*m, pile yield moment

    // Broms "short pile" ultimate lateral load (cohesive soil)
    let h_short: f64 = 9.0 * c_u * d * (l - 1.5 * d);
    let expected_h: f64 = 9.0 * 50.0 * 0.6 * (8.0 - 0.9);
    assert_close(h_short, expected_h, 1e-10, "Broms short pile H_u");

    // For "long pile" mode, H_u from M_max = M_y
    // M_y = H(1.5d + H/(18 c_u d))
    // Quadratic: H^2/(18 c_u d) + 1.5d H - M_y = 0
    let a_coeff: f64 = 1.0 / (18.0 * c_u * d);
    let b_coeff: f64 = 1.5 * d;
    let c_coeff: f64 = -m_y;

    let discriminant: f64 = b_coeff * b_coeff - 4.0 * a_coeff * c_coeff;
    assert!(discriminant > 0.0, "Discriminant > 0 for real solution");

    let h_long: f64 = (-b_coeff + discriminant.sqrt()) / (2.0 * a_coeff);
    assert!(h_long > 0.0, "H_long > 0");

    // Governing mode: smaller of short and long pile capacities
    let h_governing: f64 = h_short.min(h_long);
    assert!(h_governing > 0.0, "Governing H_u > 0");

    // Verify quadratic: a H^2 + b H + c = 0
    let check: f64 = a_coeff * h_long * h_long + b_coeff * h_long + c_coeff;
    assert_close(check, 0.0, 1e-8, "Quadratic equation satisfied");
}

// ================================================================
// 6. Group Pile Efficiency Factor
// ================================================================
//
// For a pile group of n_r rows x n_c columns at spacing s:
//   Converse-Labarre efficiency:
//     eta = 1 - theta[(n_c-1)n_r + (n_r-1)n_c] / (90 n_r n_c)
//   where theta = atan(d/s) in degrees
//
// Reference: Das, Ch. 11; Bowles, Ch. 16

#[test]
fn validation_group_pile_efficiency() {
    let d: f64 = 0.4;      // m, pile diameter
    let s: f64 = 1.2;      // m, center-to-center spacing (= 3d)
    let n_r: f64 = 3.0;    // rows
    let n_c: f64 = 3.0;    // columns

    // Converse-Labarre: theta = atan(d/s) in degrees
    let theta_rad: f64 = (d / s).atan();
    let theta_deg: f64 = theta_rad * 180.0 / PI;
    assert_close(theta_deg, (0.4_f64 / 1.2).atan() * 180.0 / PI, 1e-10, "theta in degrees");

    // Efficiency
    let numerator: f64 = theta_deg * ((n_c - 1.0) * n_r + (n_r - 1.0) * n_c);
    let denominator: f64 = 90.0 * n_r * n_c;
    let eta: f64 = 1.0 - numerator / denominator;

    let expected_numer: f64 = theta_deg * 12.0;
    assert_close(numerator, expected_numer, 1e-10, "Numerator = theta * 12");

    // eta should be between 0 and 1
    assert!(eta > 0.5 && eta < 1.0, "eta = {} in reasonable range", eta);

    // At larger spacing (s = 6d), efficiency improves
    let s2: f64 = 6.0 * d;
    let theta2_deg: f64 = (d / s2).atan() * 180.0 / PI;
    let eta2: f64 = 1.0 - theta2_deg * 12.0 / denominator;
    assert!(eta2 > eta, "Wider spacing -> higher efficiency");

    // Group capacity = eta * n * Q_single
    let n_piles: f64 = n_r * n_c;
    let q_single: f64 = 500.0; // kN, single pile capacity
    let q_group: f64 = eta * n_piles * q_single;
    assert_close(q_group, eta * 9.0 * 500.0, 1e-10, "Group capacity = eta n Q");
}

// ================================================================
// 7. Dynamic Impedance Functions (Gazetas)
// ================================================================
//
// Gazetas (1991) dynamic impedance for circular foundation on half-space:
//   K_z(omega) = K_z,static * [k_z(a0) + i a0 c_z(a0)]
//
// where a0 = omega*R/V_s is the dimensionless frequency.
//
// Static stiffness: K_z,static = 4GR/(1-nu)
// Radiation damping: C_z = K_z,static * c_z * R / V_s
//
// Reference: Gazetas (1991), Foundation Engineering Handbook

#[test]
fn validation_dynamic_impedance_gazetas() {
    let g: f64 = 20000.0;   // kN/m2, shear modulus
    let nu: f64 = 0.33;
    let rho: f64 = 1800.0;  // kg/m3, soil density
    let r: f64 = 4.0;       // m, foundation radius

    // Shear wave velocity: V_s = sqrt(G/rho) (consistent units)
    let v_s: f64 = (g * 1000.0 / rho).sqrt();
    let expected_vs: f64 = (20e6_f64 / 1800.0).sqrt();
    assert_close(v_s, expected_vs, 1e-10, "V_s = sqrt(G/rho)");

    // Static vertical stiffness
    let k_z_static: f64 = 4.0 * g * r / (1.0 - nu);
    let expected_kz: f64 = 4.0 * 20000.0 * 4.0 / 0.67;
    assert_close(k_z_static, expected_kz, 1e-10, "K_z,static = 4GR/(1-nu)");

    // Dimensionless frequency for f = 5 Hz excitation
    let freq: f64 = 5.0;
    let omega: f64 = 2.0 * PI * freq;
    let a0: f64 = omega * r / v_s;

    // Low-frequency coefficients
    let k_coeff: f64 = 1.0;   // stiffness multiplier ~ 1.0 at low a0
    let c_coeff: f64 = 0.85;  // damping coefficient

    // Dynamic stiffness (real part)
    let k_z_dynamic: f64 = k_z_static * k_coeff;
    assert_close(k_z_dynamic, k_z_static, 1e-10, "K_z(omega) ~ K_z,static at low freq");

    // Radiation damping coefficient
    let c_z: f64 = k_z_static * c_coeff * r / v_s;
    assert!(c_z > 0.0, "Radiation damping > 0");

    // Damping ratio: xi = C_z omega / (2 K_z)
    let xi: f64 = c_z * omega / (2.0 * k_z_dynamic);
    assert!(xi > 0.0 && xi < 1.0, "Damping ratio {} in physical range", xi);

    // Confirm low-frequency regime
    assert!(a0 < 2.0, "a0 = {} confirms low-frequency regime", a0);
}

// ================================================================
// 8. Foundation Rocking Frequency
// ================================================================
//
// The rocking natural frequency of a rigid foundation on soil:
//   omega_r = sqrt(K_r / I_mass)
//
// where K_r = 8GR^3/(3(1-nu)) is the rocking stiffness
// and I_mass is the mass moment of inertia about the rocking axis.
//
// For a cylindrical foundation of mass m, radius R, height h:
//   I_base = m(R^2/4 + h^2/3) via parallel axis theorem
//
// Reference: Gazetas (1991); Richart, Hall & Woods, "Vibrations of Soils"

#[test]
fn validation_foundation_rocking_frequency() {
    let g_soil: f64 = 30000.0;  // kN/m2, shear modulus
    let nu: f64 = 0.3;
    let r: f64 = 3.0;           // m, foundation radius
    let h: f64 = 1.5;           // m, foundation height
    let rho_c: f64 = 2400.0;    // kg/m3, concrete density

    // Rocking stiffness
    let k_r: f64 = 8.0 * g_soil * r.powi(3) / (3.0 * (1.0 - nu));
    let expected_kr: f64 = 8.0 * 30000.0 * 27.0 / 2.1;
    assert_close(k_r, expected_kr, 1e-10, "K_r = 8GR^3/(3(1-nu))");

    // Foundation mass (kN*s^2/m for structural dynamics)
    let volume: f64 = PI * r * r * h;
    let mass: f64 = rho_c * volume / 1000.0;
    let expected_mass: f64 = 2400.0 * PI * 9.0 * 1.5 / 1000.0;
    assert_close(mass, expected_mass, 1e-10, "Foundation mass");

    // Mass moment of inertia about base center (rocking axis)
    let i_mass: f64 = mass * (r * r / 4.0 + h * h / 3.0);
    let expected_i: f64 = mass * (9.0 / 4.0 + 2.25 / 3.0);
    assert_close(i_mass, expected_i, 1e-10, "I_mass = m(R^2/4 + h^2/3)");

    // Rocking frequency
    let omega_r: f64 = (k_r / i_mass).sqrt();
    let f_r: f64 = omega_r / (2.0 * PI);

    // Verify omega^2 = K_r / I_mass
    assert_close(omega_r * omega_r, k_r / i_mass, 1e-10, "omega^2 = K_r/I");

    // Rocking period
    let t_r: f64 = 1.0 / f_r;
    assert!(t_r > 0.0, "Period > 0");
    assert_close(t_r, 2.0 * PI / omega_r, 1e-10, "T = 2*pi/omega");

    // Rocking frequency should be in reasonable range
    assert!(f_r > 1.0 && f_r < 50.0, "f_r = {} Hz in reasonable range", f_r);
}
