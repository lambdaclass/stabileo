/// Validation: Structural Optimization Theory — Pure-Math Formulas
///
/// References:
///   - Bendsoe & Sigmund, "Topology Optimization", 2nd ed. (2003)
///   - Haftka & Gurdal, "Elements of Structural Optimization", 3rd ed. (1992)
///   - Michell, "The limits of economy of material in frame-structures", Phil. Mag. (1904)
///   - Rozvany, "Structural Design via Optimality Criteria", Springer (1989)
///   - Svanberg, "The method of moving asymptotes", IJNME (1987)
///   - Christensen & Klarbring, "An Introduction to Structural Optimization", Springer (2009)
///   - Arora, "Introduction to Optimum Design", 4th ed. (2017)
///   - Kirsch, "Structural Optimization", Springer (1993)
///
/// Tests verify structural optimization formulas with hand-computed expected values.
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
// 1. Fully Stressed Design Iteration Convergence
// ================================================================
//
// In a fully stressed design (FSD), each member area is resized so
// that stress equals the allowable stress:
//   A_new = A_old * (sigma_actual / sigma_allow)
//
// For a statically determinate structure, member forces do not change
// with area, so FSD converges in a single iteration.
//
// For an indeterminate structure the iteration is:
//   A_new_i = F_i(A) / sigma_allow
// where F_i depends on the stiffness distribution. We demonstrate
// convergence for a two-bar truss where equilibrium is determinate.
//
// Ref: Haftka & Gurdal (1992), Ch. 2

#[test]
fn validation_fsd_convergence() {
    let sigma_allow: f64 = 250.0; // MPa
    let alpha: f64 = PI / 4.0; // 45 degrees

    // Symmetric two-bar truss: vertical load P at apex
    // Each bar force = P / (2*sin(alpha))
    let p_load: f64 = 100_000.0; // N (100 kN)
    let f_bar = p_load / (2.0 * alpha.sin());
    let f_expected = p_load * 2.0_f64.sqrt() / 2.0;
    assert_close(f_bar, f_expected, 1e-12, "bar force in symmetric truss");

    // Optimal area: A = F / sigma_allow
    let a_optimal = f_bar / sigma_allow;

    // FSD iteration from arbitrary initial guess A0 = 1000 mm^2
    // For determinate truss: forces unchanged, so one iteration suffices.
    let a_0: f64 = 1000.0;
    let sigma_0 = f_bar / a_0;
    let a_1 = a_0 * (sigma_0 / sigma_allow);
    // a_1 = a_0 * (F/a_0) / sigma_allow = F / sigma_allow = a_optimal
    assert_close(a_1, a_optimal, 1e-12, "FSD converges in one step (determinate)");

    // Verify stress at optimum
    let sigma_opt = f_bar / a_optimal;
    assert_close(sigma_opt, sigma_allow, 1e-12, "stress at FSD optimum");

    // Bar length: L = h / sin(alpha), with h = 1000 mm
    let h: f64 = 1000.0;
    let bar_length = h / alpha.sin();
    assert_close(bar_length, h * 2.0_f64.sqrt(), 1e-12, "bar length at 45 deg");

    // Total volume (proportional to weight): V = 2 * A * L
    let volume = 2.0 * a_optimal * bar_length;
    let v_expected = 2.0 * (f_expected / sigma_allow) * h * 2.0_f64.sqrt();
    assert_close(volume, v_expected, 1e-12, "FSD total volume");

    let _ = PI;
}

// ================================================================
// 2. Lagrangian Multiplier for Weight Minimization
// ================================================================
//
// Minimize weight W = sum(A_i * L_i) subject to displacement constraint:
//   delta = sum(F_i^2 * L_i / (E * A_i)) <= delta_allow
//
// Lagrangian: L = sum(A_i * L_i) + lambda * [sum(F_i^2*L_i/(E*A_i)) - delta_allow]
// Stationarity: dL/dA_i = L_i - lambda*F_i^2*L_i/(E*A_i^2) = 0
//   => A_i = |F_i| * sqrt(lambda/E)
//
// Substituting back: delta_allow = sum(|F_i|*L_i) / sqrt(lambda*E)
//   => sqrt(lambda*E) = sum(|F_i|*L_i) / delta_allow
//
// Ref: Haftka & Gurdal (1992), Ch. 4; Arora (2017), Ch. 7

#[test]
fn validation_lagrangian_weight_minimization() {
    let e_mod: f64 = 200_000.0; // MPa
    let delta_allow: f64 = 10.0; // mm

    // Three-bar truss with known forces and lengths
    let forces = [50_000.0_f64, 80_000.0, 30_000.0]; // N
    let lengths = [1000.0_f64, 1500.0, 1200.0]; // mm

    // sum(|F_i| * L_i)
    let sum_fl: f64 = forces.iter().zip(lengths.iter())
        .map(|(f, l)| f.abs() * l)
        .sum();
    // = 50000*1000 + 80000*1500 + 30000*1200 = 5e7 + 1.2e8 + 3.6e7 = 2.06e8

    // Lagrange multiplier: lambda = [sum(|Fi|*Li)]^2 / (E * delta_allow^2)
    let lambda = sum_fl * sum_fl / (e_mod * delta_allow * delta_allow);

    // Optimal areas: A_i = |F_i| * sqrt(lambda/E) = |F_i| * sum_fl / (E * delta_allow)
    let scale = sum_fl / (e_mod * delta_allow);
    let a_opt: Vec<f64> = forces.iter().map(|f| f.abs() * scale).collect();

    // Verify constraint is active
    let delta_check: f64 = forces.iter().zip(lengths.iter()).zip(a_opt.iter())
        .map(|((f, l), a)| f * f * l / (e_mod * a))
        .sum();
    assert_close(delta_check, delta_allow, 1e-10, "displacement constraint active");

    // Verify KKT stationarity: L_i - lambda * F_i^2 * L_i / (E * A_i^2) = 0
    // Equivalently: lambda * F_i^2 / (E * A_i^2) = 1 for all i
    for i in 0..3 {
        let kkt_val = lambda * forces[i] * forces[i] / (e_mod * a_opt[i] * a_opt[i]);
        assert_close(kkt_val, 1.0, 1e-10,
            &format!("KKT optimality bar {}", i + 1));
    }

    // Minimum weight (volume): W = sum(A_i * L_i) = sum_fl^2 / (E * delta_allow)
    let w_min: f64 = a_opt.iter().zip(lengths.iter()).map(|(a, l)| a * l).sum();
    let w_expected = sum_fl * sum_fl / (e_mod * delta_allow);
    assert_close(w_min, w_expected, 1e-10, "minimum weight");

    assert!(lambda > 0.0, "Lagrange multiplier positive for active constraint");
}

// ================================================================
// 3. Topology Optimization SIMP Penalty Interpolation
// ================================================================
//
// SIMP (Solid Isotropic Material with Penalization):
//   E(x) = E_min + x^p * (E_0 - E_min)
//
// where x in [0,1] is the density variable, p >= 1 is the penalty.
//   x=0 => E = E_min (void)
//   x=1 => E = E_0 (solid)
//   dE/dx = p * x^(p-1) * (E_0 - E_min)
//
// Ref: Bendsoe & Sigmund (2003), Ch. 1-2

#[test]
fn validation_simp_penalty_interpolation() {
    let e_0: f64 = 200_000.0; // MPa
    let e_min: f64 = 1.0; // MPa (numerical stabilization)
    let de: f64 = e_0 - e_min;
    let p: f64 = 3.0;

    // Boundary values
    let e_at_0 = e_min + 0.0_f64.powf(p) * de;
    assert_close(e_at_0, e_min, 1e-12, "SIMP E at x=0");

    let e_at_1 = e_min + 1.0_f64.powf(p) * de;
    assert_close(e_at_1, e_0, 1e-12, "SIMP E at x=1");

    // Intermediate: x=0.5, p=3 => x^p = 0.125
    let x_half: f64 = 0.5;
    let e_half = e_min + x_half.powf(p) * de;
    let expected_half = e_min + 0.125 * de;
    assert_close(e_half, expected_half, 1e-12, "SIMP E at x=0.5, p=3");

    // Without penalization (p=1): E is linear in x
    let e_linear = e_min + x_half * de;
    let expected_linear = e_min + 0.5 * de;
    assert_close(e_linear, expected_linear, 1e-12, "SIMP E at x=0.5, p=1");

    // Penalization drives intermediate densities toward 0 or 1
    assert!(e_half < e_linear,
        "p=3 penalizes intermediate: {:.0} < {:.0}", e_half, e_linear);

    // Derivative: dE/dx at x=0.5 with p=3
    let de_dx = p * x_half.powf(p - 1.0) * de;
    let expected_deriv = 3.0 * 0.25 * de;
    assert_close(de_dx, expected_deriv, 1e-12, "SIMP dE/dx at x=0.5");

    // RAMP comparison: E(x) = E_min + x/(1+q*(1-x)) * (E_0 - E_min)
    let q: f64 = 3.0;
    let e_ramp = e_min + x_half / (1.0 + q * (1.0 - x_half)) * de;
    // = E_min + 0.5/2.5 * de = E_min + 0.2 * de
    let expected_ramp = e_min + 0.2 * de;
    assert_close(e_ramp, expected_ramp, 1e-12, "RAMP E at x=0.5, q=3");

    // Both penalization methods give less stiffness than linear at x=0.5
    assert!(e_ramp < e_linear, "RAMP also penalizes intermediate densities");
}

// ================================================================
// 4. Compliance Minimization Sensitivity Analysis
// ================================================================
//
// For compliance c = F^T u = u^T K u:
//   dc/dx_e = -u_e^T (dK_e/dx_e) u_e
//
// With SIMP: K_e(x_e) = x_e^p * K_e0
//   dc/dx_e = -p * x_e^(p-1) * u_e^T K_e0 u_e = -p * x_e^(p-1) * c_e0
//
// OC update: x_new = x_old * (-dc/dx / (lambda * dV/dx))^eta
//
// Ref: Bendsoe & Sigmund (2003), Ch. 1.3

#[test]
fn validation_compliance_sensitivity() {
    let p_pen: f64 = 3.0;
    let e_mod: f64 = 200_000.0;
    let area: f64 = 100.0; // mm^2
    let length: f64 = 1000.0; // mm

    // Full-density bar stiffness k_0 = EA/L
    let k_0 = e_mod * area / length;

    // Hypothetical element displacement
    let u_e: f64 = 0.5; // mm

    // Full-density element compliance: c_e0 = k_0 * u_e^2
    let c_e0 = k_0 * u_e * u_e;

    // At density x = 0.7
    let x_e: f64 = 0.7;
    let c_e = x_e.powf(p_pen) * c_e0;
    let c_e_expected = 0.7_f64.powf(3.0) * c_e0;
    assert_close(c_e, c_e_expected, 1e-12, "element compliance with SIMP");

    // Sensitivity: dc/dx_e = -p * x^(p-1) * c_e0
    let dc_dx = -p_pen * x_e.powf(p_pen - 1.0) * c_e0;
    let expected_sens = -3.0 * 0.7_f64.powi(2) * c_e0;
    assert_close(dc_dx, expected_sens, 1e-12, "compliance sensitivity");

    // Must be negative: adding material reduces compliance
    assert!(dc_dx < 0.0, "sensitivity must be negative");

    // OC update with eta=0.5: x_new = x * (-dc/dx / (lambda * V_e))^0.5
    let v_e = area * length;
    let lambda_oc: f64 = (-dc_dx) / v_e * 1.5; // arbitrary multiplier for balance
    let eta: f64 = 0.5;
    let x_new = (x_e * ((-dc_dx) / (lambda_oc * v_e)).powf(eta)).min(1.0).max(0.001);
    assert!(x_new > 0.0 && x_new <= 1.0, "OC update in valid range");

    // Volume sensitivity: dV/dx_e = V_e
    // At KKT optimality: dc/dx_e + lambda* dV/dx_e = 0
    // => lambda = -dc/dx_e / V_e
    let lambda_star = -dc_dx / v_e;
    assert!(lambda_star > 0.0, "optimal lambda positive");

    // Verify: at optimality all elements have same -dc/dx / (lambda* dV/dx)
    // For uniform mesh: this means all c_e0 * p * x^(p-1) are equal
    let be_val = -dc_dx / (lambda_star * v_e);
    assert_close(be_val, 1.0, 1e-12, "optimality condition B_e = 1");
}

// ================================================================
// 5. Shape Optimization Gradient Verification (Finite Difference)
// ================================================================
//
// Cantilever beam: delta = P*L^3 / (3*E*I), I = b*h^3/12
//   delta = 4*P*L^3 / (E*b*h^3)
//   d(delta)/dh = -12*P*L^3 / (E*b*h^4) = -3*delta/h
//
// Verified by central finite difference.
//
// Ref: Haftka & Gurdal (1992), Ch. 6

#[test]
fn validation_shape_optimization_gradient() {
    let p_load: f64 = 10_000.0; // N (10 kN)
    let l: f64 = 2000.0; // mm
    let e_mod: f64 = 200_000.0; // MPa
    let b: f64 = 100.0; // mm (width)
    let h: f64 = 300.0; // mm (depth)

    let i_val = b * h.powi(3) / 12.0;
    let delta = p_load * l.powi(3) / (3.0 * e_mod * i_val);

    // Analytical gradient: d(delta)/dh = -3*delta/h
    let grad_analytical = -3.0 * delta / h;

    // Central finite difference
    let eps: f64 = 0.1; // mm
    let i_plus = b * (h + eps).powi(3) / 12.0;
    let i_minus = b * (h - eps).powi(3) / 12.0;
    let delta_plus = p_load * l.powi(3) / (3.0 * e_mod * i_plus);
    let delta_minus = p_load * l.powi(3) / (3.0 * e_mod * i_minus);
    let grad_fd = (delta_plus - delta_minus) / (2.0 * eps);

    assert_close(grad_fd, grad_analytical, 1e-5, "shape gradient: FD vs analytical");

    // Gradient is negative (increasing depth reduces deflection)
    assert!(grad_analytical < 0.0, "d(delta)/dh < 0");

    // Second derivative: d^2(delta)/dh^2 = 12*delta/h^2
    let grad2_analytical = 12.0 * delta / (h * h);
    let grad2_fd = (delta_plus - 2.0 * delta + delta_minus) / (eps * eps);
    assert_close(grad2_fd, grad2_analytical, 1e-4, "shape 2nd derivative");

    // Verify the formula equivalence: delta = 4PL^3/(Ebh^3)
    let delta_alt = 4.0 * p_load * l.powi(3) / (e_mod * b * h.powi(3));
    assert_close(delta, delta_alt, 1e-12, "deflection formula equivalence");
}

// ================================================================
// 6. Pareto Front Multi-Objective (Weight vs Deflection)
// ================================================================
//
// Simply supported beam with UDL q, square section of side s:
//   A = s^2, I = s^4/12
//   Weight: W = rho * s^2 * L
//   Deflection: delta = 5qL^4 / (384EI) = 5qL^4*12 / (384*E*s^4)
//
// Pareto invariant: delta * A^2 = constant for given q, L, E.
// No design is simultaneously lighter and less deflected.
//
// Ref: Christensen & Klarbring (2009), Ch. 8

#[test]
fn validation_pareto_front_weight_deflection() {
    let q: f64 = 10.0; // N/mm
    let l: f64 = 5000.0; // mm
    let e_mod: f64 = 200_000.0; // MPa
    let rho: f64 = 7.85e-6; // kg/mm^3

    let sides = [50.0_f64, 100.0, 150.0, 200.0, 250.0];
    let mut weights: Vec<f64> = Vec::new();
    let mut deflections: Vec<f64> = Vec::new();

    for &s in &sides {
        let i_val = s.powi(4) / 12.0;
        let w = rho * s * s * l;
        let d = 5.0 * q * l.powi(4) / (384.0 * e_mod * i_val);
        weights.push(w);
        deflections.push(d);
    }

    // Monotonicity: weight up, deflection down
    for i in 1..weights.len() {
        assert!(weights[i] > weights[i - 1], "weight increases with section");
        assert!(deflections[i] < deflections[i - 1], "deflection decreases");
    }

    // Pareto invariant: delta * (s^2)^2 = delta * s^4 = constant
    let a_0 = sides[0] * sides[0];
    let invariant = deflections[0] * a_0 * a_0;
    for (idx, &s) in sides.iter().enumerate() {
        let a = s * s;
        let product = deflections[idx] * a * a;
        assert_close(product, invariant, 1e-10,
            &format!("Pareto invariant for s={}", s));
    }

    // Equivalence: 5qL^4/(384*E*I) = 5qL^4/(32*E*A^2) for square section
    let s_test: f64 = 120.0;
    let i_test = s_test.powi(4) / 12.0;
    let a_test = s_test * s_test;
    let d_from_i = 5.0 * q * l.powi(4) / (384.0 * e_mod * i_test);
    let d_from_a = 5.0 * q * l.powi(4) / (32.0 * e_mod * a_test * a_test);
    assert_close(d_from_i, d_from_a, 1e-10, "deflection formula equivalence");

    let _rho = rho;
}

// ================================================================
// 7. Stress Constraint KKT Conditions
// ================================================================
//
// min W = sum(A_i * L_i) subject to sigma_i = F_i/A_i <= sigma_allow
//
// KKT stationarity: L_i - mu_i * F_i / A_i^2 = 0
// Complementary slackness: mu_i * (sigma_i - sigma_allow) = 0
// At active constraint: A_i = F_i / sigma_allow
//   => mu_i = L_i * A_i^2 / F_i = L_i * F_i / sigma_allow^2
//
// Ref: Arora (2017), Ch. 4; Kirsch (1993), Ch. 2

#[test]
fn validation_stress_constraint_kkt() {
    let sigma_allow: f64 = 250.0; // MPa
    let a_min: f64 = 100.0; // mm^2 minimum gauge

    // Three tension bars
    let forces = [120_000.0_f64, 80_000.0, 15_000.0]; // N
    let lengths = [2000.0_f64, 3000.0, 1500.0]; // mm

    // Optimal areas: A_i = max(F_i / sigma_allow, A_min)
    let areas: Vec<f64> = forces.iter()
        .map(|f| (f / sigma_allow).max(a_min))
        .collect();
    // areas: [480, 320, 100(min gauge)]

    // Verify stress constraints
    for i in 0..3 {
        let sigma = forces[i] / areas[i];
        assert!(sigma <= sigma_allow + 1e-6,
            "bar {} stress {:.1} <= {:.1}", i, sigma, sigma_allow);

        if areas[i] > a_min + 1e-6 {
            // Active stress constraint
            assert_close(sigma, sigma_allow, 1e-10,
                &format!("bar {} at allowable stress", i));
        }
    }

    // KKT multipliers for active stress constraints
    for i in 0..3 {
        if areas[i] > a_min + 1e-6 {
            // mu_i = L_i * F_i / sigma_allow^2
            let mu_i = lengths[i] * forces[i] / (sigma_allow * sigma_allow);
            assert!(mu_i > 0.0, "KKT mu_{} > 0", i);

            // Verify stationarity: L_i - mu_i * F_i / A_i^2 = 0
            let residual = lengths[i] - mu_i * forces[i] / (areas[i] * areas[i]);
            assert_close(residual, 0.0, 1e-10,
                &format!("KKT stationarity bar {}", i));
        }
    }

    // Weight comparison: optimal vs uniform
    let w_opt: f64 = areas.iter().zip(lengths.iter()).map(|(a, l)| a * l).sum();
    let a_uniform = forces.iter().cloned().fold(0.0_f64, f64::max) / sigma_allow;
    let w_uniform: f64 = lengths.iter().map(|l| a_uniform * l).sum();
    assert!(w_opt < w_uniform, "optimized weight < uniform weight");
}

// ================================================================
// 8. Michell Truss Analytic Optimal Topology
// ================================================================
//
// Michell (1904): minimum-weight structure transmitting a force between
// two points. For equal tension/compression allowable stress sigma:
//
// Direct tie: V = P*d / sigma (collinear case, absolute minimum)
//
// Hemp (1973): half-plane cantilever with angle theta = pi/2:
//   V = P*R*(pi/2 + 1) / sigma
//
// Any feasible design must have V >= Michell lower bound.
//
// Ref: Michell (1904); Hemp, "Optimum Structures", 1973; Rozvany (1989)

#[test]
fn validation_michell_truss_optimal_topology() {
    let sigma_allow: f64 = 250.0; // MPa

    // Direct tie: P applied at distance d from support, collinear
    let p_load: f64 = 100_000.0; // N
    let d: f64 = 5000.0; // mm

    // Michell lower bound for collinear case: V = P*d / sigma
    let v_michell = p_load * d / sigma_allow;
    // = 100000 * 5000 / 250 = 2,000,000 mm^3
    assert_close(v_michell, 2_000_000.0, 1e-12, "Michell bound collinear");

    // Direct tie matches the bound exactly
    let a_tie = p_load / sigma_allow;
    let v_tie = a_tie * d;
    assert_close(v_tie, v_michell, 1e-12, "direct tie = Michell bound");

    // Two-bar V-truss: bars at angle theta from horizontal
    // F_bar = P / (2*sin(theta)), L_bar = h / sin(theta) for vertical h
    let h: f64 = 3000.0; // mm vertical offset
    let l_horiz: f64 = 4000.0; // mm horizontal half-span
    let l_bar = (h * h + l_horiz * l_horiz).sqrt();
    let sin_theta = h / l_bar;
    let f_bar = p_load / (2.0 * sin_theta);
    let a_bar = f_bar / sigma_allow;
    let v_two_bar = 2.0 * a_bar * l_bar;

    // V = P * (h^2 + L^2) / (sigma * h)
    let v_expected = p_load * (h * h + l_horiz * l_horiz) / (sigma_allow * h);
    assert_close(v_two_bar, v_expected, 1e-10, "two-bar truss volume");

    // Must exceed Michell bound: V >= P * L_horiz / sigma
    // (the horizontal projection sets the lower bound for non-collinear case)
    let v_bound = p_load * l_horiz / sigma_allow;
    assert!(v_two_bar > v_bound, "two-bar exceeds horizontal projection bound");

    // Hemp's result: half-plane cantilever, V = P*R*(pi/2 + 1) / sigma
    let r_val: f64 = 3000.0; // mm
    let v_hemp = p_load * r_val * (PI / 2.0 + 1.0) / sigma_allow;
    let v_simple = p_load * r_val / sigma_allow;
    let ratio = v_hemp / v_simple;
    assert_close(ratio, PI / 2.0 + 1.0, 1e-12, "Hemp factor pi/2 + 1");

    // The Hemp factor > 1 means the optimal curved layout uses more material
    // than a hypothetical direct path (which cannot exist in the half-plane geometry)
    assert!(ratio > 2.5 && ratio < 2.6, "Hemp factor ~ 2.571");
}
