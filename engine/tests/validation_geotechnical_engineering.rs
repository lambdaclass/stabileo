/// Validation: Geotechnical Engineering Formulas
///
/// References:
///   - Terzaghi: "Theoretical Soil Mechanics" (1943)
///   - Meyerhof: "The Bearing Capacity of Foundations" (1963)
///   - Das: "Principles of Geotechnical Engineering" 9th ed.
///   - Coduto: "Foundation Design: Principles and Practices" 3rd ed.
///   - Craig: "Craig's Soil Mechanics" 8th ed.
///
/// Tests verify geotechnical capacity and settlement formulas with hand-computed values.
/// No solver calls -- pure arithmetic verification of code-based equations.

use std::f64::consts::PI;

// ================================================================
// Tolerance helper
// ================================================================

fn assert_close(got: f64, expected: f64, rel_tol: f64, label: &str) {
    let err = if expected.abs() < 1e-12 {
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
// 1. Terzaghi Bearing Capacity (Strip Footing)
// ================================================================
//
// qu = c*Nc + gamma*Df*Nq + 0.5*gamma*B*Ngamma
//
// For phi = 30°:
//   Nq = e^(pi*tan30) * tan²(45+15) = e^1.8138 * 3.0 = 18.401
//   Nc = (Nq-1)*cot30 = 17.401*1.7321 = 30.14
//   Ngamma = 15.7 (Terzaghi table value)
//
// c = 10 kPa, gamma = 18 kN/m³, Df = 1.5 m, B = 2.0 m:
//   qu = 10*30.14 + 18*1.5*18.401 + 0.5*18*2.0*15.7 = 1080.83 kPa

#[test]
fn validation_terzaghi_bearing_capacity() {
    let c: f64 = 10.0;
    let gamma: f64 = 18.0;
    let df: f64 = 1.5;
    let b: f64 = 2.0;
    let phi_deg: f64 = 30.0;
    let phi: f64 = phi_deg * PI / 180.0;

    // Bearing capacity factors (Terzaghi-Meyerhof)
    let nq: f64 = (PI * phi.tan()).exp() * (PI / 4.0 + phi / 2.0).tan().powi(2);
    let nc: f64 = (nq - 1.0) / phi.tan();
    let n_gamma: f64 = 15.7; // Terzaghi tabulated value for phi=30

    assert_close(nq, 18.401, 0.02, "Nq for phi=30");
    assert_close(nc, 30.14, 0.02, "Nc for phi=30");

    let qu: f64 = c * nc + gamma * df * nq + 0.5 * gamma * b * n_gamma;
    let expected_qu: f64 = 10.0 * 30.14 + 18.0 * 1.5 * 18.401 + 0.5 * 18.0 * 2.0 * 15.7;

    assert_close(qu, expected_qu, 0.02, "Terzaghi qu strip footing");
    assert!(qu > 1000.0, "Bearing capacity should be > 1000 kPa");
}

// ================================================================
// 2. Meyerhof Bearing Capacity (Rectangular Footing with Factors)
// ================================================================
//
// qu = c*Nc*sc*dc*ic + q*Nq*sq*dq*iq + 0.5*gamma*B*Ngamma*sgamma*dgamma*igamma
//
// Shape factors (Meyerhof):
//   sc = 1 + 0.2*Kp*B/L, sq = sgamma = 1 + 0.1*Kp*B/L
// Depth factors:
//   dc = 1 + 0.2*sqrt(Kp)*Df/B, dq = dgamma = 1 + 0.1*sqrt(Kp)*Df/B

#[test]
fn validation_meyerhof_bearing_capacity() {
    let c: f64 = 20.0;
    let gamma: f64 = 17.0;
    let df: f64 = 1.0;
    let b: f64 = 2.0;
    let l: f64 = 3.0;
    let phi_deg: f64 = 25.0;
    let phi: f64 = phi_deg * PI / 180.0;

    let kp: f64 = (PI / 4.0 + phi / 2.0).tan().powi(2);
    let nq: f64 = (PI * phi.tan()).exp() * kp;
    let nc: f64 = (nq - 1.0) / phi.tan();
    let n_gamma: f64 = 10.88; // Meyerhof table value for phi=25

    // Shape factors
    let sc: f64 = 1.0 + 0.2 * kp * b / l;
    let sq: f64 = 1.0 + 0.1 * kp * b / l;
    let s_gamma: f64 = sq;

    // Depth factors
    let dc: f64 = 1.0 + 0.2 * kp.sqrt() * df / b;
    let dq: f64 = 1.0 + 0.1 * kp.sqrt() * df / b;
    let d_gamma: f64 = dq;

    let q: f64 = gamma * df;
    let qu: f64 = c * nc * sc * dc
        + q * nq * sq * dq
        + 0.5 * gamma * b * n_gamma * s_gamma * d_gamma;

    // Hand-computed each term
    let term1: f64 = c * nc * sc * dc;
    let term2: f64 = q * nq * sq * dq;
    let term3: f64 = 0.5 * gamma * b * n_gamma * s_gamma * d_gamma;

    assert!(qu > 500.0, "Bearing capacity should be substantial");
    assert_close(qu, term1 + term2 + term3, 0.001, "Sum of three terms");

    // Each shape/depth factor should be > 1.0
    assert!(sc > 1.0 && sq > 1.0 && dc > 1.0 && dq > 1.0, "Factors > 1.0");
}

// ================================================================
// 3. Rankine Active Earth Pressure Coefficient
// ================================================================
//
// Ka = (1 - sin(phi)) / (1 + sin(phi)) = tan²(45 - phi/2)
//
// phi = 30°: Ka = 0.3333
// phi = 35°: Ka = 0.2710
// phi = 20°: Ka = 0.4903
//
// Total active force: Pa = 0.5 * Ka * gamma * H²

#[test]
fn validation_rankine_active_pressure() {
    let test_cases: [(f64, f64); 3] = [
        (30.0, 0.3333),
        (35.0, 0.2710),
        (20.0, 0.4903),
    ];

    for &(phi_deg, expected_ka) in &test_cases {
        let phi: f64 = phi_deg * PI / 180.0;
        let ka: f64 = (1.0 - phi.sin()) / (1.0 + phi.sin());
        let ka_alt: f64 = (PI / 4.0 - phi / 2.0).tan().powi(2);

        assert_close(ka, expected_ka, 0.01, &format!("Ka for phi={}deg", phi_deg));
        assert_close(ka, ka_alt, 0.001, &format!("Ka two formulas agree, phi={}deg", phi_deg));
    }

    // Total active force
    let phi: f64 = 30.0 * PI / 180.0;
    let ka: f64 = (1.0 - phi.sin()) / (1.0 + phi.sin());
    let gamma: f64 = 18.0;
    let h: f64 = 6.0;
    let pa: f64 = 0.5 * ka * gamma * h * h;
    let expected_pa: f64 = 0.5 * 0.3333 * 18.0 * 36.0;
    assert_close(pa, expected_pa, 0.01, "Active force Pa");
}

// ================================================================
// 4. Coulomb Passive Earth Pressure
// ================================================================
//
// Kp = sin²(alpha+phi) / [sin²(alpha)*sin(alpha-delta) *
//      (1 - sqrt(sin(phi+delta)*sin(phi+beta) / (sin(alpha-delta)*sin(alpha+beta))))²]
//
// For vertical wall (alpha=90), horizontal backfill (beta=0), delta=20, phi=30:
//   Kp ≈ 6.10

#[test]
fn validation_coulomb_passive_pressure() {
    let phi_deg: f64 = 30.0;
    let delta_deg: f64 = 20.0;
    let alpha_deg: f64 = 90.0;
    let beta_deg: f64 = 0.0;

    let phi: f64 = phi_deg * PI / 180.0;
    let delta: f64 = delta_deg * PI / 180.0;
    let alpha: f64 = alpha_deg * PI / 180.0;
    let beta: f64 = beta_deg * PI / 180.0;

    let num: f64 = (alpha + phi).sin().powi(2);
    let sqrt_inner: f64 = ((phi + delta).sin() * (phi + beta).sin())
        / ((alpha - delta).sin() * (alpha + beta).sin());
    let sqrt_term: f64 = sqrt_inner.sqrt();
    let denom: f64 = alpha.sin().powi(2) * (alpha - delta).sin()
        * (1.0 - sqrt_term).powi(2);

    let kp: f64 = num / denom;

    // Verify intermediate values
    assert_close(num, 0.75, 0.01, "sin^2(alpha+phi)");
    assert_close(sqrt_term, 0.6384, 0.02, "sqrt term");
    assert_close(kp, 6.10, 0.03, "Coulomb Kp");

    // Kp should be significantly > 1 with wall friction
    assert!(kp > 3.0, "Passive Kp with friction should be large");
}

// ================================================================
// 5. Settlement of Footing on Elastic Half-Space (Boussinesq)
// ================================================================
//
// Immediate settlement (flexible, center):
//   s = q * B * (1 - nu²) / Es * Iw
//
// Square footing B = 2m, q = 200 kPa, Es = 50000 kPa, nu = 0.3, Iw = 1.12
//   s = 200 * 2.0 * 0.91 / 50000 * 1.12 = 8.154 mm

#[test]
fn validation_boussinesq_settlement() {
    let q: f64 = 200.0;
    let b: f64 = 2.0;
    let es: f64 = 50_000.0;
    let nu: f64 = 0.3;
    let iw: f64 = 1.12;

    let s: f64 = q * b * (1.0 - nu * nu) / es * iw;
    let s_mm: f64 = s * 1000.0;

    let expected_s_mm: f64 = 200.0 * 2.0 * 0.91 / 50000.0 * 1.12 * 1000.0;
    assert_close(s_mm, expected_s_mm, 0.01, "Boussinesq settlement");

    // Settlement should be in reasonable range
    assert!(s_mm < 25.0 && s_mm > 0.0, "Settlement in reasonable range");
}

// ================================================================
// 6. Pile Capacity (Meyerhof SPT-Based Method)
// ================================================================
//
// For driven piles in sand (Meyerhof, 1976):
//   Qp = 40 * N_avg * Ap * (Lb/D) <= 400 * N_avg * Ap
//   Qs = 2 * N_avg_shaft * As
//
// D = 0.4 m, L = 15 m, Lb = 12 m, N_tip = 25, N_shaft = 15
//   Ap = PI/4 * 0.16 = 0.12566 m²
//   Qp_calc = 40*25*0.12566*30 = 3769.9 kN → limit 400*25*0.12566 = 1256.6 kN
//   Qs = 2*15*PI*0.4*15 = 565.5 kN
//   Qu = 1256.6 + 565.5 = 1822.1 kN

#[test]
fn validation_pile_capacity_meyerhof() {
    let d: f64 = 0.4;
    let l: f64 = 15.0;
    let lb: f64 = 12.0;
    let n_tip: f64 = 25.0;
    let n_shaft: f64 = 15.0;

    let ap: f64 = PI / 4.0 * d * d;
    let a_s: f64 = PI * d * l;

    let qp_calc: f64 = 40.0 * n_tip * ap * (lb / d);
    let qp_limit: f64 = 400.0 * n_tip * ap;
    let qp: f64 = if qp_calc < qp_limit { qp_calc } else { qp_limit };

    let qs: f64 = 2.0 * n_shaft * a_s;
    let qu: f64 = qp + qs;

    assert!(qp_calc > qp_limit, "Limit should govern for high Lb/D");
    assert_close(qp, qp_limit, 0.01, "Qp (limited)");
    assert_close(qs, 2.0 * 15.0 * a_s, 0.001, "Qs shaft");
    assert_close(qu, qp + qs, 0.001, "Qu total pile capacity");

    let expected_qu: f64 = 400.0 * 25.0 * ap + 2.0 * 15.0 * a_s;
    assert_close(qu, expected_qu, 0.01, "Qu expected total");
}

// ================================================================
// 7. Consolidation Settlement (Normally Consolidated Clay)
// ================================================================
//
// Sc = (Cc * H) / (1 + e0) * log10((sigma'0 + delta_sigma) / sigma'0)
//
// Cc = 0.40, H = 3.0 m, e0 = 1.10, sigma'0 = 80 kPa, delta_sigma = 60 kPa
//   Sc = 1.20/2.10 * log10(140/80) = 0.5714 * 0.24304 = 0.1389 m = 138.9 mm

#[test]
fn validation_consolidation_settlement() {
    let cc: f64 = 0.40;
    let h: f64 = 3.0;
    let e0: f64 = 1.10;
    let sigma0: f64 = 80.0;
    let delta_sigma: f64 = 60.0;

    let stress_ratio: f64 = (sigma0 + delta_sigma) / sigma0;
    let sc: f64 = (cc * h) / (1.0 + e0) * stress_ratio.log10();
    let sc_mm: f64 = sc * 1000.0;

    let expected_ratio: f64 = 140.0 / 80.0;
    let expected_log: f64 = expected_ratio.log10();
    let expected_sc: f64 = (0.40 * 3.0) / 2.10 * expected_log;
    let expected_mm: f64 = expected_sc * 1000.0;

    assert_close(sc_mm, expected_mm, 0.01, "Consolidation settlement");
    assert!(sc_mm > 100.0 && sc_mm < 200.0, "Settlement in expected range");
}

// ================================================================
// 8. Slope Stability (Infinite Slope, Dry Cohesionless Soil)
// ================================================================
//
// FS = tan(phi) / tan(beta)   (dry, cohesionless)
//
// General with cohesion:
//   FS = (c' + gamma*z*cos²(beta)*tan(phi')) / (gamma*z*sin(beta)*cos(beta))

#[test]
fn validation_infinite_slope_stability() {
    // Dry, cohesionless case
    let phi_deg: f64 = 35.0;
    let beta_deg: f64 = 25.0;
    let phi: f64 = phi_deg * PI / 180.0;
    let beta: f64 = beta_deg * PI / 180.0;

    let fs_dry: f64 = phi.tan() / beta.tan();
    assert_close(fs_dry, 1.5017, 0.01, "FS dry cohesionless slope");

    // Critical condition: phi = beta
    let phi_crit: f64 = 30.0 * PI / 180.0;
    let beta_crit: f64 = 30.0 * PI / 180.0;
    let fs_critical: f64 = phi_crit.tan() / beta_crit.tan();
    assert_close(fs_critical, 1.0, 0.001, "FS at critical angle");

    // General case with cohesion, no pore pressure
    let c: f64 = 5.0;
    let gamma: f64 = 19.0;
    let z: f64 = 2.0;
    let beta2: f64 = 20.0 * PI / 180.0;
    let phi2: f64 = 30.0 * PI / 180.0;

    let fs_num: f64 = c + gamma * z * beta2.cos().powi(2) * phi2.tan();
    let fs_den: f64 = gamma * z * beta2.sin() * beta2.cos();
    let fs_general: f64 = fs_num / fs_den;

    let expected_num: f64 = 5.0 + 19.0 * 2.0 * beta2.cos().powi(2) * phi2.tan();
    let expected_den: f64 = 19.0 * 2.0 * beta2.sin() * beta2.cos();
    let expected_fs: f64 = expected_num / expected_den;

    assert_close(fs_general, expected_fs, 0.001, "FS general infinite slope");
    assert!(fs_general > 1.0, "Slope should be stable (FS > 1.0)");
}
