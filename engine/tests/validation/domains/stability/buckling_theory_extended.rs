/// Validation: Buckling Theory Extended — Advanced Pure-Math Formulas
///
/// References:
///   - Timoshenko & Gere, "Theory of Elastic Stability", 2nd ed. (1961)
///   - Bazant & Cedolin, "Stability of Structures" (1991)
///   - Galambos & Surovek, "Structural Stability of Steel" (2008)
///   - EN 1993-1-1 (Eurocode 3), Clause 6.3 (Buckling Resistance)
///   - Southwell, "On the Analysis of Experimental Observations in
///     Problems of Elastic Stability", Proc. Royal Soc. A, 1932
///   - Perry, "Note on the Deflection of Struts", The Engineer, 1886
///   - Chen & Atsuta, "Theory of Beam-Columns", Vol. 1 (1976)
///   - Brush & Almroth, "Buckling of Bars, Plates, and Shells" (1975)
///
/// These tests cover buckling topics NOT in validation_buckling_theory.rs:
///   1. Southwell plot for experimental Pcr estimation
///   2. Perry-Robertson formula (initial imperfection)
///   3. Secant formula (eccentric compression)
///   4. Rayleigh quotient energy method for Pcr
///   5. Stepped column (piecewise EI) buckling
///   6. Elastica post-buckling load-deflection
///   7. Plate buckling under pure shear
///   8. Double modulus (reduced modulus) theory

use std::f64::consts::PI;

// ================================================================
// 1. Southwell Plot — Experimental Pcr Estimation
// ================================================================
//
// The Southwell plot linearizes the buckling response to estimate Pcr
// from pre-buckling deflection data.
//
// For a column with initial imperfection e0, the midspan deflection is:
//   delta = e0 / (1 - P/Pcr)
//
// Rearranging to Southwell form:
//   delta/P = delta/Pcr + e0/Pcr
//
// Plotting delta/P vs delta gives a straight line with slope 1/Pcr.
//
// Test: E = 200 GPa, I = 1e-4 m^4, L = 5 m, e0 = L/500
//   Pcr = pi^2 * EI / L^2 = pi^2 * 200e6 * 1e-4 / 25 = 78957 kN
//
// Generate synthetic deflection data at P = 0.2, 0.4, 0.6, 0.8 Pcr,
// then fit a line to delta/P vs delta. Slope should be 1/Pcr.

#[test]
fn validation_southwell_plot_pcr_estimation() {
    let e: f64 = 200_000.0; // MPa
    let i_val: f64 = 1e-4; // m^4
    let l: f64 = 5.0; // m
    let ei: f64 = e * 1000.0 * i_val; // kN*m^2
    let pcr = PI * PI * ei / (l * l);
    let e0: f64 = l / 500.0; // initial imperfection = 0.01 m

    // Generate deflection data at various load levels
    let load_fractions: [f64; 4] = [0.2, 0.4, 0.6, 0.8];
    let mut deltas = Vec::new();
    let mut loads = Vec::new();

    for &alpha in &load_fractions {
        let p = alpha * pcr;
        // Additional lateral deflection due to amplification of initial imperfection:
        // delta = e0 * (P/Pcr) / (1 - P/Pcr) = e0 * alpha / (1 - alpha)
        let delta = e0 * alpha / (1.0 - alpha);
        deltas.push(delta);
        loads.push(p);
    }

    // Southwell coordinates: x = delta, y = delta/P
    let mut sx = Vec::new();
    let mut sy = Vec::new();
    for i in 0..4 {
        sx.push(deltas[i]);
        sy.push(deltas[i] / loads[i]);
    }

    // Least-squares linear fit: y = m*x + b
    // m should be 1/Pcr, b should be e0/Pcr
    let n: f64 = 4.0;
    let sum_x: f64 = sx.iter().sum();
    let sum_y: f64 = sy.iter().sum();
    let sum_xy: f64 = sx.iter().zip(sy.iter()).map(|(x, y)| x * y).sum();
    let sum_x2: f64 = sx.iter().map(|x| x * x).sum();

    let m = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x);
    let b = (sum_y - m * sum_x) / n;

    let pcr_estimated = 1.0 / m;
    let e0_estimated = b * pcr_estimated;

    crate::common::assert_close(pcr_estimated, pcr, 0.001, "Southwell Pcr estimation");
    crate::common::assert_close(e0_estimated, e0, 0.001, "Southwell e0 estimation");
}

// ================================================================
// 2. Perry-Robertson Formula — Initial Imperfection Buckling
// ================================================================
//
// The Perry-Robertson formula accounts for initial bow imperfection:
//
//   sigma_fail = 0.5 * [(sigma_y + (1+eta)*sigma_e)
//                 - sqrt( (sigma_y + (1+eta)*sigma_e)^2 - 4*sigma_y*sigma_e )]
//
// where:
//   sigma_e = pi^2 * E / lambda^2  (Euler stress, lambda = L/r)
//   eta = a0 * (lambda / pi) * sqrt(sigma_y / E)  (Perry factor, ~0.003*lambda)
//   a0 = imperfection parameter (Robertson constant)
//
// For Robertson constant a0 = 0.003*L/r (standard British approach):
//   eta = 0.003 * lambda
//
// Test: E = 200 GPa, sigma_y = 250 MPa, lambda = 80
//   sigma_e = pi^2 * 200000 / 6400 = 308.43 MPa
//   eta = 0.003 * 80 = 0.24
//   sum = 250 + (1+0.24)*308.43 = 250 + 382.45 = 632.45
//   sigma_fail = 0.5*(632.45 - sqrt(632.45^2 - 4*250*308.43))
//              = 0.5*(632.45 - sqrt(399832.8 - 308430))
//              = 0.5*(632.45 - sqrt(91402.8))
//              = 0.5*(632.45 - 302.33) = 165.06 MPa

#[test]
fn validation_perry_robertson_imperfection() {
    let e: f64 = 200_000.0; // MPa
    let sigma_y: f64 = 250.0; // MPa

    let test_lambdas: [f64; 4] = [40.0, 80.0, 120.0, 200.0];

    let mut prev_sigma_fail: f64 = f64::MAX;

    for &lambda in &test_lambdas {
        let sigma_e = PI * PI * e / (lambda * lambda);
        let eta = 0.003 * lambda; // Robertson constant

        let sum_term = sigma_y + (1.0 + eta) * sigma_e;
        let discriminant: f64 = sum_term * sum_term - 4.0 * sigma_y * sigma_e;
        assert!(discriminant >= 0.0,
            "Discriminant must be non-negative at lambda={}", lambda);

        let sigma_fail = 0.5 * (sum_term - discriminant.sqrt());

        // sigma_fail must be less than both sigma_y and sigma_e
        assert!(sigma_fail < sigma_y,
            "sigma_fail ({:.2}) < sigma_y ({:.2}) at lambda={}",
            sigma_fail, sigma_y, lambda);
        assert!(sigma_fail < sigma_e || lambda > 100.0,
            "sigma_fail ({:.2}) should be bounded by Euler stress ({:.2})",
            sigma_fail, sigma_e);

        // sigma_fail must decrease with increasing slenderness
        assert!(sigma_fail < prev_sigma_fail,
            "sigma_fail should decrease: {:.2} < {:.2} at lambda={}",
            sigma_fail, prev_sigma_fail, lambda);
        prev_sigma_fail = sigma_fail;

        // For stocky columns (lambda=40), sigma_fail should be close to sigma_y
        if lambda == 40.0 {
            assert!(sigma_fail > 0.85 * sigma_y,
                "Stocky column sigma_fail ({:.2}) > 85% of sigma_y", sigma_fail);
        }

        // For very slender columns (lambda=200), sigma_fail approaches Euler
        if lambda == 200.0 {
            let ratio_to_euler = sigma_fail / sigma_e;
            assert!(ratio_to_euler > 0.5 && ratio_to_euler < 1.0,
                "Slender column ratio to Euler: {:.3}", ratio_to_euler);
        }
    }

    // Specific numerical check at lambda = 80
    let lambda: f64 = 80.0;
    let sigma_e = PI * PI * e / (lambda * lambda);
    let eta = 0.003 * lambda;
    let sum_term = sigma_y + (1.0 + eta) * sigma_e;
    let sigma_fail = 0.5 * (sum_term - (sum_term * sum_term - 4.0 * sigma_y * sigma_e).sqrt());

    // Recompute expected value precisely
    let expected_sigma_e = PI * PI * 200_000.0 / 6400.0;
    crate::common::assert_close(sigma_e, expected_sigma_e, 1e-10, "Euler stress at lambda=80");

    let expected_sum = 250.0 + (1.0 + 0.24) * expected_sigma_e;
    let expected_disc: f64 = expected_sum * expected_sum - 4.0 * 250.0 * expected_sigma_e;
    let expected_fail = 0.5 * (expected_sum - expected_disc.sqrt());
    crate::common::assert_close(sigma_fail, expected_fail, 1e-10, "Perry-Robertson at lambda=80");
}

// ================================================================
// 3. Secant Formula — Eccentric Compression
// ================================================================
//
// For a column with eccentric axial load:
//   sigma_max = (P/A) * [1 + (ec/r^2) * sec(L/(2r) * sqrt(P/(EA)))]
//
// where e = eccentricity, c = distance to extreme fiber, r = radius of gyration.
//
// The secant formula predicts maximum stress including second-order effects.
//
// Test: E = 200 GPa, A = 0.01 m^2, I = 1e-4 m^4, L = 5 m
//   r = sqrt(I/A) = sqrt(0.01) = 0.1 m
//   e = 0.05 m (50 mm eccentricity)
//   c = 0.15 m (distance to extreme fiber)
//   P = 500 kN
//   P/A = 50000 kPa = 50 MPa
//   arg = (5.0/(2*0.1)) * sqrt(500/(200e6*0.01))
//       = 25 * sqrt(500/2000000)
//       = 25 * sqrt(0.00025) = 25 * 0.015811 = 0.3953
//   sec(0.3953) = 1/cos(0.3953) = 1/0.9228 = 1.0837
//   sigma_max = 50 * (1 + 0.05*0.15/0.01 * 1.0837)
//             = 50 * (1 + 0.75 * 1.0837) = 50 * 1.8128 = 90.64 MPa

#[test]
fn validation_secant_formula_eccentric_compression() {
    let e_mod: f64 = 200_000.0; // MPa
    let e_eff: f64 = e_mod * 1000.0; // kN/m^2
    let a: f64 = 0.01; // m^2
    let i_val: f64 = 1e-4; // m^4
    let l: f64 = 5.0; // m
    let r: f64 = (i_val / a).sqrt(); // radius of gyration = 0.1 m
    let ecc: f64 = 0.05; // m, eccentricity
    let c: f64 = 0.15; // m, extreme fiber distance

    crate::common::assert_close(r, 0.1, 1e-10, "radius of gyration");

    // Test at several load levels
    let loads: [f64; 4] = [200.0, 500.0, 1000.0, 2000.0]; // kN
    let pcr = PI * PI * e_eff * i_val / (l * l); // Euler load

    let mut prev_sigma: f64 = 0.0;

    for &p in &loads {
        let sigma_avg = p / a; // kN/m^2 -> kPa
        let arg = (l / (2.0 * r)) * (p / (e_eff * a)).sqrt();

        // arg must be < pi/2 for sec to be defined (column hasn't buckled)
        assert!(arg < PI / 2.0,
            "Secant argument {:.4} must be < pi/2 at P={:.0} kN", arg, p);

        let sec_val = 1.0 / arg.cos();
        let sigma_max = sigma_avg * (1.0 + (ecc * c / (r * r)) * sec_val);

        // Maximum stress must exceed average stress (eccentricity amplifies)
        assert!(sigma_max > sigma_avg,
            "sigma_max ({:.2}) > sigma_avg ({:.2}) at P={:.0}", sigma_max, sigma_avg, p);

        // Amplification factor increases with load (nonlinear)
        let amp = sigma_max / sigma_avg;
        assert!(amp > 1.0, "Amplification > 1 at P={:.0}", p);

        // Higher load → higher maximum stress (monotonic)
        assert!(sigma_max > prev_sigma,
            "sigma_max should increase: {:.2} > {:.2} at P={:.0}",
            sigma_max, prev_sigma, p);
        prev_sigma = sigma_max;
    }

    // Specific check at P = 500 kN
    let p: f64 = 500.0;
    let sigma_avg = p / a;
    let arg = (l / (2.0 * r)) * (p / (e_eff * a)).sqrt();
    let sec_val = 1.0 / arg.cos();
    let sigma_max = sigma_avg * (1.0 + (ecc * c / (r * r)) * sec_val);

    // Recompute expected
    let expected_arg: f64 = 25.0 * (500.0_f64 / (200_000_000.0_f64 * 0.01)).sqrt();
    crate::common::assert_close(arg, expected_arg, 1e-10, "secant arg at P=500");

    let expected_sec = 1.0 / expected_arg.cos();
    let expected_sigma = (p / a) * (1.0 + (0.05 * 0.15 / 0.01) * expected_sec);
    crate::common::assert_close(sigma_max, expected_sigma, 1e-10, "secant sigma_max at P=500");

    // As P approaches Pcr, secant diverges
    let p_near_pcr = 0.99 * pcr;
    let arg_near: f64 = (l / (2.0 * r)) * (p_near_pcr / (e_eff * a)).sqrt();
    // arg_near should be close to pi/2
    assert!(arg_near > 1.0 && arg_near < PI / 2.0,
        "Near Pcr, arg = {:.4} should approach pi/2", arg_near);
}

// ================================================================
// 4. Rayleigh Quotient — Energy Method for Pcr
// ================================================================
//
// The Rayleigh quotient provides an upper-bound estimate of Pcr:
//
//   Pcr >= EI * integral(y''^2 dx) / integral(y'^2 dx)
//
// For pinned-pinned with assumed shape y = sin(pi*x/L):
//   y' = (pi/L) * cos(pi*x/L)
//   y'' = -(pi/L)^2 * sin(pi*x/L)
//
//   integral(y''^2 dx) from 0 to L = (pi/L)^4 * L/2 = pi^4/(2*L^3)
//   integral(y'^2 dx)  from 0 to L = (pi/L)^2 * L/2 = pi^2/(2*L)
//
//   Pcr = EI * pi^4/(2*L^3) / (pi^2/(2*L)) = pi^2*EI/L^2
//
// This gives the exact Euler load because sin(pi*x/L) is the exact mode shape.
//
// For a parabolic assumed shape y = x*(L-x), the Rayleigh quotient gives
// an upper bound:
//   y' = L - 2x
//   y'' = -2
//   integral(y''^2 dx) = 4*L
//   integral(y'^2 dx) = L^3/3
//   Pcr_approx = EI * 4*L / (L^3/3) = 12*EI/L^2
//
// Compare: 12/pi^2 = 1.2159 → 21.6% higher than exact Euler load.

#[test]
fn validation_rayleigh_quotient_energy_method() {
    let e: f64 = 200_000.0; // MPa
    let i_val: f64 = 1e-4; // m^4
    let l: f64 = 6.0; // m
    let ei: f64 = e * 1000.0 * i_val; // kN*m^2

    let pcr_exact = PI * PI * ei / (l * l);

    // === Exact sine mode shape: y = sin(pi*x/L) ===
    // Numerical integration using Simpson's rule with 1000 segments
    let n = 1000;
    let dx = l / n as f64;

    let mut int_ypp_sq: f64 = 0.0; // integral of (y'')^2
    let mut int_yp_sq: f64 = 0.0; // integral of (y')^2

    for i in 0..=n {
        let x = i as f64 * dx;
        let ypp = -(PI / l).powi(2) * (PI * x / l).sin(); // y''
        let yp = (PI / l) * (PI * x / l).cos(); // y'

        let w = if i == 0 || i == n { 1.0 }
                else if i % 2 == 1 { 4.0 }
                else { 2.0 };

        int_ypp_sq += w * ypp * ypp;
        int_yp_sq += w * yp * yp;
    }
    int_ypp_sq *= dx / 3.0;
    int_yp_sq *= dx / 3.0;

    let pcr_sine = ei * int_ypp_sq / int_yp_sq;
    crate::common::assert_close(pcr_sine, pcr_exact, 0.001,
        "Rayleigh quotient with exact sine shape");

    // === Parabolic assumed shape: y = x*(L-x) ===
    let mut int_ypp_sq_para: f64 = 0.0;
    let mut int_yp_sq_para: f64 = 0.0;

    for i in 0..=n {
        let x = i as f64 * dx;
        let ypp_para: f64 = -2.0; // constant curvature
        let yp_para = l - 2.0 * x; // y' = L - 2x

        let w = if i == 0 || i == n { 1.0 }
                else if i % 2 == 1 { 4.0 }
                else { 2.0 };

        int_ypp_sq_para += w * ypp_para * ypp_para;
        int_yp_sq_para += w * yp_para * yp_para;
    }
    int_ypp_sq_para *= dx / 3.0;
    int_yp_sq_para *= dx / 3.0;

    let pcr_para = ei * int_ypp_sq_para / int_yp_sq_para;

    // Parabolic Rayleigh quotient = 12*EI/L^2
    let pcr_para_exact = 12.0 * ei / (l * l);
    crate::common::assert_close(pcr_para, pcr_para_exact, 0.001,
        "Parabolic Rayleigh quotient numerical");

    // Parabolic gives upper bound: 12/pi^2 = 1.2159 ratio
    let ratio = pcr_para / pcr_exact;
    let expected_ratio = 12.0 / (PI * PI);
    crate::common::assert_close(ratio, expected_ratio, 0.001,
        "Parabolic/exact ratio = 12/pi^2");

    // Upper bound property: Rayleigh quotient >= exact
    assert!(pcr_para > pcr_exact,
        "Parabolic ({:.2}) should be upper bound of exact ({:.2})",
        pcr_para, pcr_exact);
}

// ================================================================
// 5. Stepped Column — Piecewise EI Buckling via Rayleigh-Ritz
// ================================================================
//
// A pinned-pinned column of total length L with EI1 on [0, L/2] and
// EI2 on [L/2, L]. The Rayleigh-Ritz energy method with a sine trial
// function y = sin(pi*x/L) gives:
//
//   Pcr_RR = integral(EI(x) * y''^2 dx) / integral(y'^2 dx)
//
// With y = sin(pi*x/L):
//   y'' = -(pi/L)^2 * sin(pi*x/L)
//   y'  = (pi/L) * cos(pi*x/L)
//
// Numerator = (pi/L)^4 * [EI1 * integral_0^{L/2} sin^2 dx
//                        + EI2 * integral_{L/2}^L sin^2 dx]
//           = (pi/L)^4 * [(EI1 + EI2) * L/4]
//           = (pi/L)^4 * (EI1 + EI2) * L / 4
//
// Denominator = (pi/L)^2 * L/2
//
// Pcr_RR = (pi/L)^2 * (EI1 + EI2) / 2 = pi^2 * EI_avg / L^2
//
// where EI_avg = (EI1 + EI2)/2 is the arithmetic mean.
//
// This is an upper bound (Rayleigh quotient property).
// The exact Pcr lies between pi^2*EI_min/L^2 and pi^2*EI_max/L^2.
//
// Reference: Bazant & Cedolin, "Stability of Structures", Ch. 5

#[test]
fn validation_stepped_column_piecewise_ei() {
    let e: f64 = 200_000.0; // MPa
    let i1: f64 = 2e-4; // m^4 (larger section, lower half)
    let i2: f64 = 1e-4; // m^4 (smaller section, upper half)
    let l: f64 = 8.0; // m
    let e_eff: f64 = e * 1000.0; // kN/m^2

    let ei1: f64 = e_eff * i1;
    let ei2: f64 = e_eff * i2;

    // Exact Pcr bounds for uniform columns
    let pcr_large = PI * PI * ei1 / (l * l); // entire column with EI1
    let pcr_small = PI * PI * ei2 / (l * l); // entire column with EI2

    // Rayleigh-Ritz with sine trial function: Pcr_RR = pi^2*(EI1+EI2)/(2*L^2)
    let ei_avg = (ei1 + ei2) / 2.0;
    let pcr_rr_analytic = PI * PI * ei_avg / (l * l);

    // Verify by numerical integration (Simpson's rule, 2000 segments)
    let n = 2000;
    let dx = l / n as f64;
    let mut num: f64 = 0.0; // integral of EI(x)*y''^2
    let mut den: f64 = 0.0; // integral of y'^2

    for i in 0..=n {
        let x = i as f64 * dx;
        let ei_x = if x <= l / 2.0 { ei1 } else { ei2 };
        let ypp = -(PI / l).powi(2) * (PI * x / l).sin();
        let yp = (PI / l) * (PI * x / l).cos();

        let w = if i == 0 || i == n { 1.0 }
                else if i % 2 == 1 { 4.0 }
                else { 2.0 };

        num += w * ei_x * ypp * ypp;
        den += w * yp * yp;
    }
    num *= dx / 3.0;
    den *= dx / 3.0;

    let pcr_rr_numerical = num / den;

    // Analytical and numerical Rayleigh-Ritz should match
    crate::common::assert_close(pcr_rr_numerical, pcr_rr_analytic, 0.005,
        "Rayleigh-Ritz analytical vs numerical");

    // Pcr_RR should be an upper bound: between small and large uniform Pcr
    assert!(pcr_rr_analytic > pcr_small,
        "RR Pcr ({:.2}) > small uniform ({:.2})", pcr_rr_analytic, pcr_small);
    assert!(pcr_rr_analytic < pcr_large,
        "RR Pcr ({:.2}) < large uniform ({:.2})", pcr_rr_analytic, pcr_large);

    // RR with arithmetic mean should be exactly midpoint of bounds
    let pcr_midpoint = (pcr_large + pcr_small) / 2.0;
    crate::common::assert_close(pcr_rr_analytic, pcr_midpoint, 1e-10,
        "RR Pcr equals midpoint of uniform bounds");

    // Verify specific values
    crate::common::assert_close(ei1, 40_000.0, 1e-10, "EI1 = 40000 kN*m^2");
    crate::common::assert_close(ei2, 20_000.0, 1e-10, "EI2 = 20000 kN*m^2");
    crate::common::assert_close(ei_avg, 30_000.0, 1e-10, "EI_avg = 30000 kN*m^2");

    let expected_pcr_rr = PI * PI * 30_000.0 / 64.0;
    crate::common::assert_close(pcr_rr_analytic, expected_pcr_rr, 1e-10,
        "Pcr_RR = pi^2 * 30000 / 64");

    // The Rayleigh quotient with a different trial function (parabolic)
    // gives a different (less accurate) upper bound.
    let mut num_para: f64 = 0.0;
    let mut den_para: f64 = 0.0;
    for i in 0..=n {
        let x = i as f64 * dx;
        let ei_x = if x <= l / 2.0 { ei1 } else { ei2 };
        let ypp_para: f64 = -2.0;
        let yp_para = l - 2.0 * x;

        let w = if i == 0 || i == n { 1.0 }
                else if i % 2 == 1 { 4.0 }
                else { 2.0 };

        num_para += w * ei_x * ypp_para * ypp_para;
        den_para += w * yp_para * yp_para;
    }
    num_para *= dx / 3.0;
    den_para *= dx / 3.0;

    let pcr_para = num_para / den_para;

    // Parabolic gives a higher (less accurate) upper bound than sine
    assert!(pcr_para > pcr_rr_numerical,
        "Parabolic RR ({:.2}) > sine RR ({:.2})", pcr_para, pcr_rr_numerical);
}

// ================================================================
// 6. Elastica Post-Buckling — Large Deflection Load-Deflection
// ================================================================
//
// Beyond the Euler critical load, a perfectly straight column follows
// the elastica solution. For a pinned-pinned column:
//
//   P/Pcr = (K(k)/K_0)^2 = (K(k) / (pi/2))^2
//
// where K(k) is the complete elliptic integral of the first kind,
// and k = sin(theta_0/2) with theta_0 the end rotation.
//
// The midspan deflection is:
//   delta/L = 1 - E_complete(k) / K(k)
//
// where E_complete(k) is the complete elliptic integral of the second kind.
//
// For small rotations (k -> 0): P/Pcr -> 1, delta -> 0 (matches Euler).
// For theta_0 = 30 deg (k = sin(15 deg) = 0.2588):
//   K(0.2588) ≈ 1.6253, E(0.2588) ≈ 1.5162
//   P/Pcr = (1.6253/(pi/2))^2 = (1.0342)^2 = 1.0696
//   delta/L = 1 - 1.5162/1.6253 = 1 - 0.9329 = 0.0671
//
// The post-buckling path shows increasing P slightly above Pcr as
// deformation grows.

#[test]
fn validation_elastica_post_buckling() {
    // Approximate complete elliptic integral K(k) using AGM (arithmetic-geometric mean)
    let elliptic_k = |k: f64| -> f64 {
        let mut a: f64 = 1.0;
        let mut b: f64 = (1.0 - k * k).sqrt();
        for _ in 0..30 {
            let a_new = 0.5 * (a + b);
            let b_new = (a * b).sqrt();
            a = a_new;
            b = b_new;
        }
        PI / (2.0 * a)
    };

    // Approximate complete elliptic integral E(k) using Legendre series
    let elliptic_e = |k: f64| -> f64 {
        // Numerical integration using Simpson's rule
        let n = 1000;
        let d_theta = (PI / 2.0) / n as f64;
        let mut integral: f64 = 0.0;
        for i in 0..=n {
            let theta = i as f64 * d_theta;
            let integrand: f64 = (1.0 - k * k * theta.sin().powi(2)).sqrt();
            let w = if i == 0 || i == n { 1.0 }
                    else if i % 2 == 1 { 4.0 }
                    else { 2.0 };
            integral += w * integrand;
        }
        integral * d_theta / 3.0
    };

    // At k = 0: K(0) = pi/2, E(0) = pi/2
    let k0_k = elliptic_k(0.0);
    let k0_e = elliptic_e(0.0);
    crate::common::assert_close(k0_k, PI / 2.0, 0.001, "K(0) = pi/2");
    crate::common::assert_close(k0_e, PI / 2.0, 0.001, "E(0) = pi/2");

    // At k = 0 (no deformation): P/Pcr = 1, delta = 0
    let p_ratio_0 = (k0_k / (PI / 2.0)).powi(2);
    let delta_ratio_0 = 1.0 - k0_e / k0_k;
    crate::common::assert_close(p_ratio_0, 1.0, 0.001, "P/Pcr at k=0");
    crate::common::assert_close(delta_ratio_0, 0.0, 0.001, "delta/L at k=0");

    // At theta_0 = 30 deg -> k = sin(15 deg) = 0.2588
    let k_30: f64 = (15.0_f64 * PI / 180.0).sin();
    let kk_30 = elliptic_k(k_30);
    let ee_30 = elliptic_e(k_30);

    let p_ratio_30 = (kk_30 / (PI / 2.0)).powi(2);
    let delta_ratio_30 = 1.0 - ee_30 / kk_30;

    // P/Pcr should be slightly above 1.0 (post-buckling stiffening)
    assert!(p_ratio_30 > 1.0,
        "Post-buckling: P/Pcr = {:.4} > 1.0 at theta_0=30", p_ratio_30);
    assert!(p_ratio_30 < 1.15,
        "Post-buckling: P/Pcr = {:.4} should be modest increase", p_ratio_30);

    // delta/L should be positive and moderate
    assert!(delta_ratio_30 > 0.0 && delta_ratio_30 < 0.15,
        "Post-buckling: delta/L = {:.4} at theta_0=30", delta_ratio_30);

    // Larger deformation: theta_0 = 60 deg -> k = sin(30 deg) = 0.5
    let k_60: f64 = 0.5;
    let kk_60 = elliptic_k(k_60);
    let ee_60 = elliptic_e(k_60);

    let p_ratio_60 = (kk_60 / (PI / 2.0)).powi(2);
    let delta_ratio_60 = 1.0 - ee_60 / kk_60;

    // More deformation → higher P/Pcr and larger delta
    assert!(p_ratio_60 > p_ratio_30,
        "P/Pcr at 60 ({:.4}) > P/Pcr at 30 ({:.4})", p_ratio_60, p_ratio_30);
    assert!(delta_ratio_60 > delta_ratio_30,
        "delta at 60 ({:.4}) > delta at 30 ({:.4})", delta_ratio_60, delta_ratio_30);
}

// ================================================================
// 7. Plate Buckling Under Pure Shear
// ================================================================
//
// For a simply-supported rectangular plate under pure shear:
//
//   tau_cr = k_s * pi^2 * D / (b^2 * t)
//          = k_s * pi^2 * E / (12*(1-nu^2)) * (t/b)^2
//
// The shear buckling coefficient k_s depends on the aspect ratio phi = a/b:
//   For phi >= 1: k_s = 5.34 + 4.00/phi^2  (long plate)
//   For phi < 1:  k_s = 5.34/phi^2 + 4.00  (short plate, transverse shear)
//
// Reference: Timoshenko & Gere, §9.7; Gerard & Becker, NACA TN 3781
//
// Test: E = 200 GPa, nu = 0.3, t = 8 mm, b = 400 mm
//   For a/b = 1: k_s = 5.34 + 4.00 = 9.34
//   For a/b = 2: k_s = 5.34 + 4.00/4 = 5.34 + 1.00 = 6.34
//   For a/b = infinity: k_s -> 5.34

#[test]
fn validation_plate_shear_buckling() {
    let e: f64 = 200_000.0; // MPa
    let nu: f64 = 0.3;
    let t: f64 = 8.0; // mm
    let b: f64 = 400.0; // mm

    // Shear buckling coefficient
    let k_s = |phi: f64| -> f64 {
        if phi >= 1.0 {
            5.34 + 4.00 / (phi * phi)
        } else {
            5.34 / (phi * phi) + 4.00
        }
    };

    // Test values
    let test_cases: [(f64, f64); 5] = [
        (0.5, 5.34 / 0.25 + 4.00),   // phi=0.5: k_s = 21.36 + 4 = 25.36
        (1.0, 5.34 + 4.00),           // phi=1.0: k_s = 9.34
        (2.0, 5.34 + 1.00),           // phi=2.0: k_s = 6.34
        (3.0, 5.34 + 4.00 / 9.0),    // phi=3.0: k_s = 5.7844
        (10.0, 5.34 + 4.00 / 100.0), // phi=10: k_s = 5.38
    ];

    for &(phi, expected_ks) in &test_cases {
        let ks = k_s(phi);
        crate::common::assert_close(ks, expected_ks, 0.001,
            &format!("k_s at a/b={:.1}", phi));
    }

    // Verify k_s approaches 5.34 for long plates
    let ks_inf = k_s(100.0);
    crate::common::assert_close(ks_inf, 5.34, 0.01, "k_s for very long plate");

    // Square plate: k_s = 9.34
    let ks_square = k_s(1.0);
    crate::common::assert_close(ks_square, 9.34, 1e-10, "k_s for square plate");

    // Critical shear stress for square plate
    let tau_cr_square = ks_square * PI * PI * e / (12.0 * (1.0 - nu * nu))
        * (t / b) * (t / b);

    // Expected value
    let plate_factor = PI * PI * e / (12.0 * (1.0 - 0.09));
    let expected_tau = 9.34 * plate_factor * (8.0 / 400.0) * (8.0 / 400.0);
    crate::common::assert_close(tau_cr_square, expected_tau, 1e-10, "tau_cr square plate");

    // tau_cr should decrease with increasing aspect ratio (lower k_s)
    let tau_cr = |phi: f64| -> f64 {
        let ks_val = k_s(phi);
        ks_val * PI * PI * e / (12.0 * (1.0 - nu * nu)) * (t / b) * (t / b)
    };

    let tau_1 = tau_cr(1.0);
    let tau_2 = tau_cr(2.0);
    let tau_5 = tau_cr(5.0);

    assert!(tau_1 > tau_2, "Square plate tau ({:.2}) > rectangular ({:.2})", tau_1, tau_2);
    assert!(tau_2 > tau_5, "phi=2 tau ({:.2}) > phi=5 ({:.2})", tau_2, tau_5);

    // Verify the ratio of shear to compression buckling
    // For a square plate: k_compression = 4.0, k_shear = 9.34
    // tau_cr / sigma_cr = 9.34 / 4.0 = 2.335
    let sigma_cr_square = 4.0 * plate_factor * (t / b) * (t / b);
    let ratio = tau_cr_square / sigma_cr_square;
    crate::common::assert_close(ratio, 9.34 / 4.0, 1e-10,
        "Shear/compression buckling ratio for square plate");
}

// ================================================================
// 8. Double Modulus (Reduced Modulus) Theory
// ================================================================
//
// Engesser-von Karman reduced modulus theory for inelastic buckling:
//
// The reduced modulus accounts for both loading (tangent modulus Et)
// and unloading (elastic modulus E) zones of the cross section:
//
//   Er = 4*E*Et / (sqrt(E) + sqrt(Et))^2
//
// This gives a critical load between the tangent modulus load and
// the Euler elastic load:
//   Pcr_tangent <= Pcr_reduced <= Pcr_elastic
//
// The Shanley model shows that the actual critical load equals the
// tangent modulus load (columns begin to deflect at Pt, not Pr).
//
// For a rectangular cross section:
//   Er = 4*E*Et / (sqrt(E) + sqrt(Et))^2
//
// Test: E = 200 GPa, Et = 80 GPa (at some stress level)
//   Er = 4 * 200000 * 80000 / (sqrt(200000) + sqrt(80000))^2
//      = 64e9 / (447.21 + 282.84)^2
//      = 64e9 / (730.05)^2
//      = 64e9 / 532974.6
//      = 120074 MPa

#[test]
fn validation_double_modulus_reduced_modulus_theory() {
    let e: f64 = 200_000.0; // MPa (elastic modulus)

    // Test at several tangent modulus levels
    let et_values: [f64; 5] = [180_000.0, 120_000.0, 80_000.0, 40_000.0, 10_000.0];

    for &et in &et_values {
        let sqrt_e: f64 = e.sqrt();
        let sqrt_et: f64 = et.sqrt();
        let denom = (sqrt_e + sqrt_et).powi(2);
        let er = 4.0 * e * et / denom;

        // Er must be between Et and E
        assert!(er >= et,
            "Er ({:.2}) >= Et ({:.2}) at Et={:.0}", er, et, et);
        assert!(er <= e,
            "Er ({:.2}) <= E ({:.2}) at Et={:.0}", er, e, et);

        // When Et = E, Er should equal E (elastic case)
        if (et - e).abs() < 1.0 {
            crate::common::assert_close(er, e, 0.001, "Er = E when Et = E");
        }

        // Critical loads for a column: Pcr = pi^2 * E_x * I / L^2
        let i_val: f64 = 1e-4;
        let l: f64 = 5.0;
        let pcr_elastic = PI * PI * (e * 1000.0) * i_val / (l * l);
        let pcr_tangent = PI * PI * (et * 1000.0) * i_val / (l * l);
        let pcr_reduced = PI * PI * (er * 1000.0) * i_val / (l * l);

        // Ordering: tangent <= reduced <= elastic
        assert!(pcr_tangent <= pcr_reduced + 1e-6,
            "Pcr_tangent ({:.2}) <= Pcr_reduced ({:.2}) at Et={:.0}",
            pcr_tangent, pcr_reduced, et);
        assert!(pcr_reduced <= pcr_elastic + 1e-6,
            "Pcr_reduced ({:.2}) <= Pcr_elastic ({:.2}) at Et={:.0}",
            pcr_reduced, pcr_elastic, et);
    }

    // Specific numerical check at Et = 80000 MPa
    let et: f64 = 80_000.0;
    let sqrt_e: f64 = e.sqrt();
    let sqrt_et: f64 = et.sqrt();
    let er = 4.0 * e * et / (sqrt_e + sqrt_et).powi(2);

    let expected_er = 4.0 * 200_000.0 * 80_000.0 / (200_000.0_f64.sqrt() + 80_000.0_f64.sqrt()).powi(2);
    crate::common::assert_close(er, expected_er, 1e-10, "Er at Et=80000");

    // Verify the formula limit: when Et -> 0, Er -> 0
    let et_small: f64 = 1.0;
    let er_small = 4.0 * e * et_small / (e.sqrt() + et_small.sqrt()).powi(2);
    assert!(er_small < 10.0,
        "Er should approach 0 as Et -> 0: Er = {:.4}", er_small);

    // Verify the formula limit: when Et = E, Er = E
    let er_elastic = 4.0 * e * e / (e.sqrt() + e.sqrt()).powi(2);
    crate::common::assert_close(er_elastic, e, 1e-10, "Er = E when Et = E");

    // The reduced modulus is always the harmonic-like mean:
    // For Et = E/2: Er = 4*E*(E/2) / (sqrt(E) + sqrt(E/2))^2
    //             = 2*E^2 / (1 + 1/sqrt(2))^2 * E
    let et_half = e / 2.0;
    let er_half = 4.0 * e * et_half / (e.sqrt() + et_half.sqrt()).powi(2);
    let expected_er_half = 2.0 * e / (1.0 + (0.5_f64).sqrt()).powi(2);
    crate::common::assert_close(er_half, expected_er_half, 0.001, "Er at Et = E/2");

    // Er/E as a function of Et/E should be monotonically increasing
    let er_ratio = |r: f64| -> f64 {
        4.0 * r / (1.0 + r.sqrt()).powi(2)
    };
    let r1 = er_ratio(0.2);
    let r2 = er_ratio(0.5);
    let r3 = er_ratio(0.8);
    assert!(r1 < r2 && r2 < r3,
        "Er/E should increase monotonically: {:.4} < {:.4} < {:.4}", r1, r2, r3);
}
