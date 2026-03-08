/// Validation: Finite Element Convergence Theory — Pure-Math Formulas
///
/// References:
///   - Bathe, K.J., "Finite Element Procedures", 2nd ed. (2014)
///   - Hughes, T.J.R., "The Finite Element Method", Dover (2000)
///   - Strang & Fix, "An Analysis of the Finite Element Method", 2nd ed. (2008)
///   - Zienkiewicz, Taylor & Zhu, "The Finite Element Method", Vol. 1, 7th ed. (2013)
///   - Brezzi & Fortin, "Mixed and Hybrid Finite Element Methods", Springer (1991)
///   - Richardson, "The approximate arithmetical solution by finite differences", Phil. Trans. (1911)
///   - Szabo & Babuska, "Finite Element Analysis", Wiley (1991)
///
/// Tests verify FE convergence formulas with hand-computed expected values.
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
// 1. h-Refinement Convergence Rate (Linear Elements: O(h^2))
// ================================================================
//
// For a 1D Poisson problem -u'' = f on [0,1] with linear (P1) elements:
//   ||u - u_h||_L2 <= C * h^2 * |u|_{H^2}
//   ||u - u_h||_H1 <= C * h   * |u|_{H^2}
//
// If the exact solution is u(x) = sin(pi*x), f = pi^2*sin(pi*x).
// With N elements (h = 1/N), the L2 error should decrease as h^2.
//
// Manufactured errors: e(h) = C * h^p, convergence rate p estimated
// from two mesh sizes: p = log(e1/e2) / log(h1/h2).
//
// Ref: Strang & Fix (2008), Ch. 1; Bathe (2014), Ch. 4

#[test]
fn validation_h_refinement_convergence_rate() {
    // Manufactured data: 1D P1 elements solving -u'' = pi^2 sin(pi*x)
    // Exact nodal solution for P1 is NOT exact due to non-polynomial RHS.
    //
    // For P1 elements, L2 error = C * h^2.
    // We use known error formula for the 1D Galerkin FEM with linear elements.
    //
    // Error at mesh size h: e(h) = (pi^2 * h^2 / 12) * max|u''|
    //   u''(x) = -pi^2 sin(pi*x), max|u''| = pi^2
    //   => e(h) ~ pi^4 * h^2 / 12

    let pi2 = PI * PI;
    let c_const = pi2 * pi2 / 12.0;

    // Mesh sizes
    let n_vals = [4_u32, 8, 16, 32, 64];
    let errors: Vec<f64> = n_vals.iter()
        .map(|&n| {
            let h = 1.0 / n as f64;
            c_const * h * h
        })
        .collect();

    // Verify convergence rate p = log(e1/e2)/log(h1/h2) = 2
    for i in 0..errors.len() - 1 {
        let h1 = 1.0 / n_vals[i] as f64;
        let h2 = 1.0 / n_vals[i + 1] as f64;
        let rate = (errors[i] / errors[i + 1]).ln() / (h1 / h2).ln();
        assert_close(rate, 2.0, 1e-10,
            &format!("h-refinement rate N={}->{}", n_vals[i], n_vals[i + 1]));
    }

    // Error halves by factor 4 when h is halved (since p=2)
    for i in 0..errors.len() - 1 {
        let ratio = errors[i] / errors[i + 1];
        assert_close(ratio, 4.0, 1e-10,
            &format!("error ratio for h/2 at N={}", n_vals[i]));
    }

    // Finest mesh error should be very small
    // c_const = pi^4/12 ~ 8.117, h = 1/64, error = 8.117*(1/64)^2 ~ 0.00198
    assert!(errors.last().unwrap() < &1e-2, "finest mesh error < 0.01");
}

// ================================================================
// 2. p-Refinement Convergence Rate (Higher-Order Elements)
// ================================================================
//
// For smooth solutions, p-refinement achieves exponential convergence:
//   ||u - u_h||_E <= C * exp(-b * p)  (for analytic solutions)
//
// For algebraic convergence with polynomial degree p:
//   ||u - u_h||_L2 <= C * h^(p+1) * |u|_{H^{p+1}}
//
// For fixed mesh (h=1), increasing polynomial degree p:
//   e(p) = C / p^(2s) for H^s regularity (algebraic convergence)
//
// We verify the exponential convergence for a smooth function by
// checking that the error ratio increases with p.
//
// Ref: Szabo & Babuska (1991), Ch. 4; Bathe (2014), Ch. 5

#[test]
fn validation_p_refinement_convergence_rate() {
    // Approximate sin(pi*x) on [0,1] by truncated Taylor series of degree p.
    // The L2 error of best polynomial approximation of degree p to sin(pi*x)
    // decreases exponentially: e(p) ~ (pi/2)^(p+1) / (p+1)!
    //
    // We compute the relative magnitude of the first omitted Taylor term at x=0.5.

    let x_val: f64 = 0.5;
    let exact = (PI * x_val).sin(); // = 1.0

    // Taylor approximation errors: |sin(z) - T_p(z)| ~ |z|^(p+1)/(p+1)!
    let z = PI * x_val; // = pi/2

    // Compute z^(p+1) / (p+1)! for p = 1, 3, 5, 7, 9
    // (odd terms since sin is odd)
    let p_vals = [1_u32, 3, 5, 7, 9];
    let mut errors: Vec<f64> = Vec::new();

    for &p in &p_vals {
        let n = p + 1;
        let mut factorial: f64 = 1.0;
        for k in 1..=(n as u64) {
            factorial *= k as f64;
        }
        let err = z.powi(n as i32) / factorial;
        errors.push(err);
    }

    // Verify exponential decrease: each error is much smaller than previous
    for i in 1..errors.len() {
        assert!(errors[i] < errors[i - 1],
            "p-refinement: error decreases with p");
    }

    // Rate of decrease should accelerate (super-algebraic convergence)
    // Ratio e(p)/e(p+2) should increase
    let mut ratios: Vec<f64> = Vec::new();
    for i in 0..errors.len() - 1 {
        ratios.push(errors[i] / errors[i + 1]);
    }
    for i in 1..ratios.len() {
        assert!(ratios[i] > ratios[i - 1] * 0.5,
            "convergence accelerates with p");
    }

    // High-order approximation should be very accurate
    // z=pi/2~1.571, (pi/2)^10/10! ~ 93648/3628800 ~ 0.026
    assert!(errors.last().unwrap() < &1e-1, "p=9 Taylor error < 0.1");

    let _exact = exact;
}

// ================================================================
// 3. Patch Test for Constant Strain (2D Triangles)
// ================================================================
//
// The patch test verifies that a mesh of elements can reproduce a
// constant strain state exactly. For CST (constant strain triangle):
//
// Given displacement field u = a + bx + cy, v = d + ex + fy
// the strains are: eps_xx = b, eps_yy = f, gamma_xy = c + e
//
// If boundary nodes are prescribed u = a + bx + cy, then interior
// nodes should have the exact same displacement field, and the
// element strains should equal (b, f, c+e) exactly.
//
// Ref: Zienkiewicz et al. (2013), Ch. 8; Strang & Fix (2008)

#[test]
fn validation_patch_test_constant_strain() {
    // Displacement field: u = 0.001*x + 0.0005*y, v = 0.0003*x + 0.002*y
    let _a: f64 = 0.0;
    let b: f64 = 0.001;
    let c: f64 = 0.0005;
    let _d: f64 = 0.0;
    let e: f64 = 0.0003;
    let f: f64 = 0.002;

    // Expected constant strains
    let eps_xx = b;
    let eps_yy = f;
    let gamma_xy = c + e;

    assert_close(eps_xx, 0.001, 1e-12, "eps_xx = du/dx");
    assert_close(eps_yy, 0.002, 1e-12, "eps_yy = dv/dy");
    assert_close(gamma_xy, 0.0008, 1e-12, "gamma_xy = du/dy + dv/dx");

    // Interior point (3.0, 2.0) displacement
    let x_int: f64 = 3.0;
    let y_int: f64 = 2.0;
    let u_int = b * x_int + c * y_int;
    let v_int = e * x_int + f * y_int;

    assert_close(u_int, 0.001 * 3.0 + 0.0005 * 2.0, 1e-12, "u at interior");
    assert_close(v_int, 0.0003 * 3.0 + 0.002 * 2.0, 1e-12, "v at interior");

    // CST B-matrix for triangle with vertices (0,0), (4,0), (0,4):
    // Area = 0.5 * 4 * 4 = 8
    let x1: f64 = 0.0; let y1: f64 = 0.0;
    let x2: f64 = 4.0; let y2: f64 = 0.0;
    let x3: f64 = 0.0; let y3: f64 = 4.0;

    let area_2 = (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2)).abs();
    let area = area_2 / 2.0;
    assert_close(area, 8.0, 1e-12, "triangle area");

    // B-matrix coefficients (b_i = y_j - y_k, c_i = x_k - x_j):
    let b1 = y2 - y3; // = -4
    let b2 = y3 - y1; // = 4
    let b3 = y1 - y2; // = 0
    let c1 = x3 - x2; // = -4
    let c2 = x1 - x3; // = 0
    let c3 = x2 - x1; // = 4

    // Strains from B * u_nodes:
    // eps_xx = (1/2A) * (b1*u1 + b2*u2 + b3*u3)
    let u1 = b * x1 + c * y1;
    let u2 = b * x2 + c * y2;
    let u3 = b * x3 + c * y3;
    let v1 = e * x1 + f * y1;
    let v2 = e * x2 + f * y2;
    let v3 = e * x3 + f * y3;

    let eps_xx_fem = (b1 * u1 + b2 * u2 + b3 * u3) / area_2;
    let eps_yy_fem = (c1 * v1 + c2 * v2 + c3 * v3) / area_2;
    let gamma_xy_fem = (c1 * u1 + c2 * u2 + c3 * u3 + b1 * v1 + b2 * v2 + b3 * v3) / area_2;

    assert_close(eps_xx_fem, eps_xx, 1e-12, "CST eps_xx patch test");
    assert_close(eps_yy_fem, eps_yy, 1e-12, "CST eps_yy patch test");
    assert_close(gamma_xy_fem, gamma_xy, 1e-12, "CST gamma_xy patch test");
}

// ================================================================
// 4. Eigenvalue Convergence from Above (Rayleigh-Ritz)
// ================================================================
//
// The Rayleigh-Ritz theorem guarantees that FE eigenvalues converge
// from above to the exact eigenvalues:
//   omega_h >= omega_exact, with equality as h -> 0
//
// For a simply supported beam of length L:
//   omega_n = n^2 * pi^2 * sqrt(EI / (rho*A*L^4))
//
// An N-element FE model produces N eigenvalues. The i-th eigenvalue
// satisfies: omega_h(i) >= omega_exact(i).
//
// The Rayleigh quotient: omega^2 = (phi^T K phi) / (phi^T M phi) >= omega_1^2
// for any trial function phi.
//
// Ref: Bathe (2014), Ch. 10; Hughes (2000), Ch. 7

#[test]
fn validation_eigenvalue_convergence_from_above() {
    let e_mod: f64 = 200_000.0; // MPa
    let i_val: f64 = 1e-4; // m^4
    let rho: f64 = 7850.0; // kg/m^3
    let a_area: f64 = 0.01; // m^2
    let l: f64 = 5.0; // m

    let ei = e_mod * 1e6 * i_val; // N*m^2 (E in Pa)
    let rho_a = rho * a_area; // kg/m

    // Exact first natural frequency
    let omega_1_exact = PI * PI * (ei / (rho_a * l.powi(4))).sqrt();

    // Rayleigh quotient with trial function phi = sin(pi*x/L) (exact first mode):
    // integral of (phi'')^2 = pi^4/(2L^3), integral of phi^2 = L/2
    // omega^2 = EI * pi^4/(2L^3) / (rho*A * L/2) = EI*pi^4 / (rho*A*L^4)
    let omega_rq = (ei * PI.powi(4) / (rho_a * l.powi(4))).sqrt();
    assert_close(omega_rq, omega_1_exact, 1e-12, "Rayleigh quotient exact mode");

    // Rayleigh quotient with approximate trial phi = x*(L-x) (parabolic):
    // phi'' = -2, integral(phi''^2 dx, 0, L) = 4*L
    // integral(phi^2 dx, 0, L) = L^5/30
    // omega^2_approx = EI * 4*L / (rho*A * L^5/30) = 120*EI / (rho*A*L^4)
    let omega_approx_sq = 120.0 * ei / (rho_a * l.powi(4));
    let omega_approx = omega_approx_sq.sqrt();

    // Must be >= exact (Rayleigh-Ritz upper bound)
    assert!(omega_approx >= omega_1_exact * 0.9999,
        "approx omega {} >= exact omega {}", omega_approx, omega_1_exact);

    // 120 vs pi^4 = 97.41: approximate frequency is higher
    let ratio = omega_approx / omega_1_exact;
    assert_close(ratio, (120.0 / PI.powi(4)).sqrt(), 1e-10, "frequency ratio");
    assert!(ratio > 1.0, "approximate >= exact (Rayleigh-Ritz)");

    // Second mode exact: omega_2 = 4 * omega_1
    let omega_2_exact = 4.0 * omega_1_exact;
    assert!(omega_2_exact > omega_1_exact, "omega_2 > omega_1");

    // Ratio omega_2/omega_1 = 4 for SS beam
    assert_close(omega_2_exact / omega_1_exact, 4.0, 1e-12, "mode ratio");
}

// ================================================================
// 5. Inf-Sup Condition for Mixed Elements
// ================================================================
//
// For mixed formulations (e.g., displacement-pressure in incompressible
// elasticity), the inf-sup (LBB) condition must be satisfied:
//
//   inf_{q_h} sup_{v_h} [integral(q_h * div(v_h))] / (||q_h|| * ||v_h||) >= beta > 0
//
// Violation leads to spurious pressure modes. A simple numerical test:
// for a Q1-P0 element (bilinear displacement, piecewise constant pressure),
// count the constraint ratio: n_pressure / n_displacement.
//
// Stable elements require n_p < n_u (fewer pressure than displacement DOFs).
// For Q1-P0: n_u = 2*nodes, n_p = n_elements.
// Regular mesh NxN: nodes = (N+1)^2, elements = N^2.
//   n_u = 2*(N+1)^2, n_p = N^2
//   Ratio = N^2 / (2*(N+1)^2) -> 0.5 as N -> infinity
//
// The Q2-P1 (Taylor-Hood) element: n_u = 2*(2N+1)^2, n_p = (N+1)^2
//
// Ref: Brezzi & Fortin (1991); Bathe (2014), Ch. 4.5

#[test]
fn validation_inf_sup_condition() {
    // Q1-P0 element: bilinear velocity, constant pressure per element
    // Regular NxN mesh
    let mesh_sizes = [2_u32, 4, 8, 16, 32];

    for &n in &mesh_sizes {
        let n_nodes = (n + 1) * (n + 1);
        let n_elements = n * n;
        let n_u = 2 * n_nodes; // displacement DOFs
        let n_p = n_elements; // pressure DOFs

        // Q1-P0 passes inf-sup: n_p < n_u always
        assert!(n_p < n_u,
            "Q1-P0 N={}: n_p={} < n_u={}", n, n_p, n_u);

        // Ratio approaches 0.5
        let ratio = n_p as f64 / n_u as f64;
        let expected_ratio = (n * n) as f64 / (2 * (n + 1) * (n + 1)) as f64;
        assert_close(ratio, expected_ratio, 1e-12,
            &format!("Q1-P0 ratio N={}", n));
    }

    // Limiting ratio as N -> infinity
    let n_large: f64 = 1000.0;
    let ratio_limit = n_large * n_large / (2.0 * (n_large + 1.0) * (n_large + 1.0));
    assert_close(ratio_limit, 0.5, 0.01, "Q1-P0 ratio -> 0.5");

    // Q2-P1 (Taylor-Hood): known to be stable
    // Quadratic displacement: nodes = (2N+1)^2, n_u = 2*(2N+1)^2
    // Linear pressure: nodes = (N+1)^2, n_p = (N+1)^2
    let n_th: u32 = 4;
    let n_u_th = 2 * (2 * n_th + 1) * (2 * n_th + 1);
    let n_p_th = (n_th + 1) * (n_th + 1);
    assert!(n_p_th < n_u_th, "Taylor-Hood: n_p < n_u");

    // Q1-Q1 (equal order, unstable without stabilization):
    // n_u = 2*(N+1)^2, n_p = (N+1)^2
    // Ratio = 0.5 but fails inf-sup without PSPG/GLS stabilization.
    let n_q1q1 = 4_u32;
    let n_u_q1 = 2 * (n_q1q1 + 1) * (n_q1q1 + 1);
    let n_p_q1 = (n_q1q1 + 1) * (n_q1q1 + 1);
    let ratio_q1q1 = n_p_q1 as f64 / n_u_q1 as f64;
    assert_close(ratio_q1q1, 0.5, 1e-12, "Q1-Q1 ratio = 0.5 (needs stabilization)");
}

// ================================================================
// 6. Richardson Extrapolation for Mesh Independence
// ================================================================
//
// Given solutions f(h1) and f(h2) with h1 = 2*h2, and convergence
// order p, the Richardson extrapolate is:
//
//   f_exact ~ (2^p * f(h2) - f(h1)) / (2^p - 1)
//
// For second-order convergence (p=2):
//   f_exact ~ (4*f(h2) - f(h1)) / 3
//
// The Grid Convergence Index (GCI) estimates numerical uncertainty:
//   GCI = Fs * |epsilon| / (r^p - 1)
// where epsilon = (f2-f1)/f2, r = h1/h2, Fs = 1.25 (safety factor)
//
// Ref: Richardson (1911); Roache, "Verification and Validation in CFD", 1998

#[test]
fn validation_richardson_extrapolation() {
    // Problem: exact solution = pi^2 (known)
    let f_exact: f64 = PI * PI;

    // Simulated numerical solutions with O(h^2) error:
    // f(h) = f_exact + C*h^2
    let c_err: f64 = 100.0;
    let h1: f64 = 0.1;
    let h2: f64 = 0.05;  // h2 = h1/2
    let h3: f64 = 0.025; // h3 = h1/4

    let f1 = f_exact + c_err * h1 * h1;  // coarse
    let f2 = f_exact + c_err * h2 * h2;  // medium
    let f3 = f_exact + c_err * h3 * h3;  // fine

    // Richardson extrapolation with p=2, r=2:
    // f_rich = (4*f2 - f1) / 3
    let r: f64 = h1 / h2; // refinement ratio = 2
    let p_order: f64 = 2.0;
    let f_rich_12 = (r.powf(p_order) * f2 - f1) / (r.powf(p_order) - 1.0);
    assert_close(f_rich_12, f_exact, 1e-10, "Richardson extrapolation h1,h2");

    // Also from h2, h3
    let f_rich_23 = (r.powf(p_order) * f3 - f2) / (r.powf(p_order) - 1.0);
    assert_close(f_rich_23, f_exact, 1e-10, "Richardson extrapolation h2,h3");

    // Observed convergence order from three grids:
    // p_obs = ln((f1-f2)/(f2-f3)) / ln(r)
    let p_obs = ((f1 - f2) / (f2 - f3)).ln() / r.ln();
    assert_close(p_obs, 2.0, 1e-10, "observed convergence order");

    // GCI (Grid Convergence Index) for fine grid:
    let epsilon_21 = (f2 - f1) / f2;
    let fs: f64 = 1.25; // safety factor
    let gci_21 = fs * epsilon_21.abs() / (r.powf(p_order) - 1.0);
    assert!(gci_21 > 0.0, "GCI must be positive");

    // GCI_fine should be smaller than GCI_coarse (by factor r^p)
    let epsilon_32 = (f3 - f2) / f3;
    let gci_32 = fs * epsilon_32.abs() / (r.powf(p_order) - 1.0);
    assert!(gci_32 < gci_21, "fine grid GCI < coarse grid GCI");

    // Asymptotic range check: GCI_21 / (r^p * GCI_32) ~ 1
    let asymptotic_ratio = gci_21 / (r.powf(p_order) * gci_32);
    assert_close(asymptotic_ratio, 1.0, 0.02, "asymptotic range indicator");
}

// ================================================================
// 7. Gauss Quadrature Exactness (2n-1 Polynomial)
// ================================================================
//
// n-point Gauss-Legendre quadrature on [-1,1] is exact for
// polynomials of degree <= 2n-1.
//
// 1-point (n=1): exact for degree <= 1
//   Point: x=0, weight=2
//
// 2-point (n=2): exact for degree <= 3
//   Points: x = +-1/sqrt(3), weights = 1
//
// 3-point (n=3): exact for degree <= 5
//   Points: x = 0, +-sqrt(3/5), weights = 8/9, 5/9, 5/9
//
// Ref: Hughes (2000), Appendix 3; Zienkiewicz et al. (2013), Ch. 5

#[test]
fn validation_gauss_quadrature_exactness() {
    // 1-point rule: integral of x^k from -1 to 1
    // Exact for k <= 1.
    // Point: x0=0, w0=2
    let x0: f64 = 0.0;
    let w0: f64 = 2.0;

    // integral(1 dx) = 2
    let i_const = w0 * 1.0;
    assert_close(i_const, 2.0, 1e-12, "1pt Gauss: integral(1)");

    // integral(x dx) = 0
    let i_x = w0 * x0;
    assert_close(i_x, 0.0, 1e-12, "1pt Gauss: integral(x)");

    // integral(x^2 dx) = 2/3 -- 1-point CANNOT capture this
    let _i_x2_1pt = w0 * x0 * x0; // = 0 (wrong, exact is 2/3)

    // 2-point rule: exact for degree <= 3
    let inv_sqrt3 = 1.0 / 3.0_f64.sqrt();
    let gp2 = [(-inv_sqrt3, 1.0_f64), (inv_sqrt3, 1.0_f64)];

    // integral(x^2 dx, -1, 1) = 2/3
    let i_x2: f64 = gp2.iter().map(|(x, w)| w * x * x).sum();
    assert_close(i_x2, 2.0 / 3.0, 1e-12, "2pt Gauss: integral(x^2)");

    // integral(x^3 dx, -1, 1) = 0
    let i_x3: f64 = gp2.iter().map(|(x, w)| w * x * x * x).sum();
    assert_close(i_x3, 0.0, 1e-12, "2pt Gauss: integral(x^3)");

    // integral(x^4 dx, -1, 1) = 2/5 -- 2-point CANNOT capture this exactly
    let i_x4_2pt: f64 = gp2.iter().map(|(x, w)| w * x.powi(4)).sum();
    let _i_x4_exact = 2.0 / 5.0;
    // 2pt gives: 2 * (1/sqrt(3))^4 = 2 * 1/9 = 2/9 (wrong, exact is 2/5)
    assert_close(i_x4_2pt, 2.0 / 9.0, 1e-12, "2pt Gauss: integral(x^4) = 2/9");

    // 3-point rule: exact for degree <= 5
    let sqrt_3_5 = (3.0_f64 / 5.0).sqrt();
    let gp3 = [(-sqrt_3_5, 5.0 / 9.0), (0.0, 8.0 / 9.0), (sqrt_3_5, 5.0 / 9.0)];

    // integral(x^4 dx, -1, 1) = 2/5
    let i_x4: f64 = gp3.iter().map(|(x, w)| w * x.powi(4)).sum();
    assert_close(i_x4, 2.0 / 5.0, 1e-12, "3pt Gauss: integral(x^4)");

    // integral(x^5 dx, -1, 1) = 0
    let i_x5: f64 = gp3.iter().map(|(x, w)| w * x.powi(5)).sum();
    assert_close(i_x5, 0.0, 1e-12, "3pt Gauss: integral(x^5)");

    // Verify weights sum to 2 (length of interval)
    let sum_w3: f64 = gp3.iter().map(|(_, w)| w).sum();
    assert_close(sum_w3, 2.0, 1e-12, "3pt weights sum = 2");
}

// ================================================================
// 8. Isoparametric Mapping Jacobian Determinant
// ================================================================
//
// For a 4-node quadrilateral mapped from reference square [-1,1]^2:
//   x(xi,eta) = sum N_i(xi,eta) * x_i
//   y(xi,eta) = sum N_i(xi,eta) * y_i
//
// Shape functions: N_i = 0.25*(1+xi_i*xi)*(1+eta_i*eta)
//
// Jacobian: J = [[dx/dxi, dy/dxi], [dx/deta, dy/deta]]
// det(J) must be > 0 everywhere for valid mapping.
//
// For a rectangle of width a and height b:
//   det(J) = a*b/4 (constant)
//
// For a general quad, det(J) varies but must remain positive.
//
// Ref: Bathe (2014), Ch. 5; Hughes (2000), Ch. 3

#[test]
fn validation_isoparametric_jacobian() {
    // Rectangle: corners (0,0), (6,0), (6,4), (0,4)
    let x_nodes = [0.0_f64, 6.0, 6.0, 0.0];
    let y_nodes = [0.0_f64, 0.0, 4.0, 4.0];

    // Reference coordinates of nodes: (-1,-1), (1,-1), (1,1), (-1,1)
    let xi_nodes = [-1.0_f64, 1.0, 1.0, -1.0];
    let eta_nodes = [-1.0_f64, -1.0, 1.0, 1.0];

    // Evaluate Jacobian at center (xi=0, eta=0)
    let xi: f64 = 0.0;
    let eta: f64 = 0.0;

    // Shape function derivatives: dN_i/dxi, dN_i/deta
    let mut dx_dxi: f64 = 0.0;
    let mut dy_dxi: f64 = 0.0;
    let mut dx_deta: f64 = 0.0;
    let mut dy_deta: f64 = 0.0;

    for i in 0..4 {
        let dn_dxi = 0.25 * xi_nodes[i] * (1.0 + eta_nodes[i] * eta);
        let dn_deta = 0.25 * (1.0 + xi_nodes[i] * xi) * eta_nodes[i];

        dx_dxi += dn_dxi * x_nodes[i];
        dy_dxi += dn_dxi * y_nodes[i];
        dx_deta += dn_deta * x_nodes[i];
        dy_deta += dn_deta * y_nodes[i];
    }

    // For rectangle: dx/dxi = a/2, dy/deta = b/2, cross terms = 0
    let a: f64 = 6.0;
    let b: f64 = 4.0;
    assert_close(dx_dxi, a / 2.0, 1e-12, "dx/dxi for rectangle");
    assert_close(dy_deta, b / 2.0, 1e-12, "dy/deta for rectangle");
    assert_close(dy_dxi, 0.0, 1e-12, "dy/dxi = 0 for rectangle");
    assert_close(dx_deta, 0.0, 1e-12, "dx/deta = 0 for rectangle");

    // det(J) = (a/2)*(b/2) - 0 = a*b/4
    let det_j = dx_dxi * dy_deta - dy_dxi * dx_deta;
    assert_close(det_j, a * b / 4.0, 1e-12, "det(J) for rectangle");

    // Physical area from reference: A = integral of det(J) over [-1,1]^2
    // For constant det(J): A = det(J) * 4 = a*b
    let area_mapped = det_j * 4.0; // 4 = area of reference square
    assert_close(area_mapped, a * b, 1e-12, "mapped area = a*b");

    // Distorted quad: (0,0), (5,0), (6,4), (1,3) -- still valid
    let x_dist = [0.0_f64, 5.0, 6.0, 1.0];
    let y_dist = [0.0_f64, 0.0, 4.0, 3.0];

    // Check det(J) at several points
    let test_points = [(-0.5, -0.5), (0.0, 0.0), (0.5, 0.5), (-0.5, 0.5), (0.5, -0.5)];
    for &(xi_t, eta_t) in &test_points {
        let mut dxd: f64 = 0.0;
        let mut dyd: f64 = 0.0;
        let mut dxe: f64 = 0.0;
        let mut dye: f64 = 0.0;

        for i in 0..4 {
            let dn_dxi = 0.25 * xi_nodes[i] * (1.0 + eta_nodes[i] * eta_t);
            let dn_deta = 0.25 * (1.0 + xi_nodes[i] * xi_t) * eta_nodes[i];
            dxd += dn_dxi * x_dist[i];
            dyd += dn_dxi * y_dist[i];
            dxe += dn_deta * x_dist[i];
            dye += dn_deta * y_dist[i];
        }
        let det_j_dist = dxd * dye - dyd * dxe;
        assert!(det_j_dist > 0.0,
            "det(J) > 0 at ({}, {}): got {:.4}", xi_t, eta_t, det_j_dist);
    }
}
