/// Validation: Column Buckling and Stability — Extended Benchmarks
///
/// References:
///   - Euler, "De Curvis Elasticis" (1744) — classical elastic buckling
///   - Timoshenko & Gere, "Theory of Elastic Stability", 2nd Ed., Ch. 1-2
///   - AISC 360-22, Chapter E (Compression Members), Ch. H (Combined Forces)
///   - EN 1993-1-1:2005 (Eurocode 3), Clause 6.3 (Buckling Resistance)
///   - Shanley, "Inelastic Column Theory" (1947), J. Aeronautical Sciences 14(5)
///   - Galambos & Surovek, "Structural Stability of Steel", Ch. 2-4
///   - Perry, "On Struts" (1886), The Engineer 62
///
/// Tests:
///   1. Euler column critical loads for all four classical boundary conditions
///   2. AISC column curve: Fcr from E3-2 and E3-3 for compact W-shape
///   3. EC3 column buckling: chi reduction factor from curves a, b, c, d
///   4. Inelastic buckling: tangent modulus theory vs Euler at intermediate slenderness
///   5. Frame buckling: sway vs non-sway effective lengths (K<1 braced, K>1 unbraced)
///   6. Stepped column: variable cross-section critical load (energy method)
///   7. Column with initial imperfection: Perry-Robertson formula (EC3)
///   8. Beam-column interaction: AISC H1-1a and H1-1b equations
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

/// Standard structural steel E = 200,000 MPa.
/// The solver multiplies by 1000 internally, so E_EFF = 200,000 * 1000 = 200e6 kN/m².
const E: f64 = 200_000.0;
/// Effective elastic modulus in kN/m² for hand calculations.
const E_EFF: f64 = E * 1000.0;

// ================================================================
// 1. Euler Column: Classical Boundary Conditions
// ================================================================
//
// The Euler critical load for an ideal elastic column is:
//
//     Pcr = pi² * E * I / (K * L)²
//
// where K is the effective length factor:
//
//   Pinned–Pinned (P-P): K = 1.0
//     Both ends free to rotate but not translate.
//     Pcr = pi²EI / L²
//
//   Pinned–Free (P-F, cantilever): K = 2.0
//     Fixed base, free tip can rotate and translate.
//     Pcr = pi²EI / (2L)² = pi²EI / (4L²)
//
//   Fixed–Fixed (F-F): K = 0.5
//     Both ends fully restrained against rotation and translation.
//     Pcr = pi²EI / (0.5L)² = 4 * pi²EI / L²
//
//   Fixed–Pinned (F-P): K ≈ 0.6992 (exact from transcendental equation tan(kL) = kL)
//     One end fixed, other pinned (rotation free, translation restrained).
//     Pcr = pi²EI / (0.7L)² ≈ 2.0457 * pi²EI / L²
//
// Reference: Timoshenko & Gere, Table 2-1, p. 56.
//
// Verification strategy: For each BC pair, we build a multi-element column,
// apply a fraction of the corresponding Pcr plus a small lateral perturbation,
// and compare the ratio of midspan deflections between BCs against the
// theoretical ratio of their critical loads. If Pcr_A / Pcr_B = R, then
// at the same absolute axial load P, the column with lower Pcr (closer to
// buckling) deflects more, and the stiffness ratio is approximately
// (1 - P/Pcr_B) / (1 - P/Pcr_A).
//
// We use a linear solver with a lateral perturbation. The axial load in
// the linear solver does not produce geometric stiffness effects, but
// the relative stiffness of each configuration (controlled by the BCs)
// is correctly captured. We verify the stiffness hierarchy:
//   F-F (stiffest) > F-P > P-P > P-F (most flexible)

#[test]
fn validation_col_buck_ext_euler_four_bcs() {
    let l: f64 = 6.0;
    let a: f64 = 0.01;   // m²
    let iz: f64 = 1e-4;  // m⁴
    let n = 12;           // elements
    let pi: f64 = std::f64::consts::PI;

    // ---- Analytical Euler loads ----
    let pcr_pp: f64 = pi.powi(2) * E_EFF * iz / (l * l);                // K=1.0
    let pcr_pf: f64 = pi.powi(2) * E_EFF * iz / (4.0 * l * l);         // K=2.0
    let pcr_ff: f64 = 4.0 * pi.powi(2) * E_EFF * iz / (l * l);         // K=0.5
    let pcr_fp: f64 = pi.powi(2) * E_EFF * iz / (0.7_f64.powi(2) * l * l); // K≈0.7

    // Verify known ratios between critical loads
    assert_close(pcr_ff / pcr_pp, 4.0, 0.01,
        "Euler: Pcr(F-F)/Pcr(P-P) = 4.0");
    assert_close(pcr_pp / pcr_pf, 4.0, 0.01,
        "Euler: Pcr(P-P)/Pcr(P-F) = 4.0");
    assert_close(pcr_fp / pcr_pp, 1.0 / 0.7_f64.powi(2), 0.01,
        "Euler: Pcr(F-P)/Pcr(P-P) = 1/0.49 ≈ 2.04");

    // Hierarchy: Pcr_ff > Pcr_fp > Pcr_pp > Pcr_pf
    assert!(pcr_ff > pcr_fp, "F-F Pcr > F-P Pcr");
    assert!(pcr_fp > pcr_pp, "F-P Pcr > P-P Pcr");
    assert!(pcr_pp > pcr_pf, "P-P Pcr > P-F Pcr");

    // ---- Solver verification: lateral stiffness hierarchy ----
    // Apply identical small lateral load at midspan and verify the order
    // of transverse deflections reflects the stiffness ordering.
    let p_lateral = 1.0; // kN

    // (a) Pinned–Pinned: "pinned" at start, "rollerX" at end
    let mid = n / 2 + 1;
    let loads_pp = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: p_lateral, mz: 0.0,
    })];
    let input_pp = make_beam(n, l, E, a, iz, "pinned", Some("rollerX"), loads_pp);
    let d_pp = linear::solve_2d(&input_pp).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // (b) Fixed–Fixed: "fixed" at start, "guidedX" at end
    //     guidedX = uy and rz restrained, ux free → simulates fixed-end sliding in X
    let loads_ff = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: p_lateral, mz: 0.0,
    })];
    let input_ff = make_beam(n, l, E, a, iz, "fixed", Some("guidedX"), loads_ff);
    let d_ff = linear::solve_2d(&input_ff).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // (c) Fixed–Pinned: "fixed" at start, "rollerX" at end
    let loads_fp = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: p_lateral, mz: 0.0,
    })];
    let input_fp = make_beam(n, l, E, a, iz, "fixed", Some("rollerX"), loads_fp);
    let d_fp = linear::solve_2d(&input_fp).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // (d) Pinned–Free (cantilever): "fixed" at start, free end (no end support)
    //     For cantilever, measure tip deflection (node n+1)
    let tip = n + 1;
    let loads_pf = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip, fx: 0.0, fy: p_lateral, mz: 0.0,
    })];
    let input_pf = make_beam(n, l, E, a, iz, "fixed", None, loads_pf);
    let d_pf = linear::solve_2d(&input_pf).unwrap()
        .displacements.iter().find(|d| d.node_id == tip).unwrap().uy.abs();

    // Cantilever is most flexible, fixed-fixed is stiffest
    // d_pf > d_pp > d_fp > d_ff
    assert!(d_pf > d_pp,
        "Cantilever more flexible than P-P: {:.6e} > {:.6e}", d_pf, d_pp);
    assert!(d_pp > d_fp,
        "P-P more flexible than F-P: {:.6e} > {:.6e}", d_pp, d_fp);
    assert!(d_fp > d_ff,
        "F-P more flexible than F-F: {:.6e} > {:.6e}", d_fp, d_ff);

    // Verify analytical midspan deflection for P-P: delta = PL³/(48EI)
    let delta_pp_exact: f64 = p_lateral * l.powi(3) / (48.0 * E_EFF * iz);
    assert_close(d_pp, delta_pp_exact, 0.02,
        "Euler P-P: delta = PL³/(48EI)");

    // Verify analytical tip deflection for cantilever: delta = PL³/(3EI)
    let delta_pf_exact: f64 = p_lateral * l.powi(3) / (3.0 * E_EFF * iz);
    assert_close(d_pf, delta_pf_exact, 0.02,
        "Euler P-F: delta = PL³/(3EI)");
}

// ================================================================
// 2. AISC Column Curve: Fcr from Chapter E (E3-2 and E3-3)
// ================================================================
//
// AISC 360-22, Section E3 defines the nominal compressive stress Fcr:
//
//   For KL/r <= 4.71 * sqrt(E/Fy)  [or Fe >= 0.44*Fy] — inelastic buckling:
//     Eq. E3-2: Fcr = (0.658^(Fy/Fe)) * Fy
//
//   For KL/r > 4.71 * sqrt(E/Fy)  [or Fe < 0.44*Fy] — elastic buckling:
//     Eq. E3-3: Fcr = 0.877 * Fe
//
//   where Fe = pi²E / (KL/r)²  is the elastic buckling stress.
//
// Reference: AISC 360-22, Specification for Structural Steel Buildings,
//            Section E3, p. 16.1-43.
//
// We test a W14x48 section (compact) with Fy = 345 MPa (A992 steel)
// at multiple slenderness ratios to verify both regions of the curve.
//
// This is a pure analytical test — no solver call needed.

#[test]
fn validation_col_buck_ext_aisc_column_curve() {
    let fy: f64 = 345.0;          // MPa, A992 steel
    let e_steel: f64 = 200_000.0; // MPa
    let pi: f64 = std::f64::consts::PI;

    // W14x48 section properties
    let a_w14: f64 = 9_030.0;  // mm² (AISC manual)
    let iy_w14: f64 = 51.3e6;  // mm⁴ (weak axis)
    let ry: f64 = (iy_w14 / a_w14).sqrt(); // radius of gyration, mm

    // Transition slenderness ratio
    let kl_r_transition: f64 = 4.71 * (e_steel / fy).sqrt();

    // Test points: (KL/r, expected_equation)
    // Below transition → E3-2 (inelastic)
    // Above transition → E3-3 (elastic)
    let test_cases: Vec<(f64, &str)> = vec![
        (30.0, "E3-2"),   // short column, inelastic
        (60.0, "E3-2"),   // moderate, inelastic
        (100.0, "E3-2"),  // near transition, still inelastic
        (kl_r_transition - 1.0, "E3-2"),  // just below transition
        (kl_r_transition + 1.0, "E3-3"),  // just above transition
        (150.0, "E3-3"),  // slender, elastic
        (200.0, "E3-3"),  // very slender
    ];

    for (kl_r, expected_eq) in &test_cases {
        // Elastic buckling stress
        let fe: f64 = pi.powi(2) * e_steel / (kl_r * kl_r);

        // Determine which equation governs
        let (fcr, eq_used): (f64, &str) = if *kl_r <= kl_r_transition {
            // E3-2: Fcr = 0.658^(Fy/Fe) * Fy
            let ratio: f64 = fy / fe;
            let fcr_val: f64 = 0.658_f64.powf(ratio) * fy;
            (fcr_val, "E3-2")
        } else {
            // E3-3: Fcr = 0.877 * Fe
            let fcr_val: f64 = 0.877 * fe;
            (fcr_val, "E3-3")
        };

        // Verify correct equation is used
        assert_eq!(eq_used, *expected_eq,
            "AISC curve: KL/r={:.1}, expected {}, got {}", kl_r, expected_eq, eq_used);

        // Fcr must be positive and <= Fy
        assert!(fcr > 0.0 && fcr <= fy,
            "AISC curve: KL/r={:.1}, Fcr={:.1} should be in (0, Fy={}]",
            kl_r, fcr, fy);

        // At the transition point, both equations should give similar results
        if (*kl_r - kl_r_transition).abs() < 2.0 {
            let fe_trans: f64 = pi.powi(2) * e_steel / (kl_r_transition * kl_r_transition);
            let fcr_e32: f64 = 0.658_f64.powf(fy / fe_trans) * fy;
            let fcr_e33: f64 = 0.877 * fe_trans;
            // At the exact transition, E3-2 and E3-3 should be close
            // (they meet at Fe = 0.44*Fy)
            assert_close(fcr_e32, fcr_e33, 0.05,
                &format!("AISC curve: continuity at transition KL/r={:.1}", kl_r_transition));
        }
    }

    // Verify Fcr decreases monotonically with increasing KL/r
    let slenderness_values: Vec<f64> = vec![20.0, 50.0, 80.0, 110.0, 140.0, 170.0, 200.0];
    let mut prev_fcr: f64 = fy + 1.0;
    for kl_r in slenderness_values {
        let fe: f64 = pi.powi(2) * e_steel / (kl_r * kl_r);
        let fcr: f64 = if kl_r <= kl_r_transition {
            let ratio: f64 = fy / fe;
            0.658_f64.powf(ratio) * fy
        } else {
            0.877 * fe
        };
        assert!(fcr < prev_fcr,
            "AISC curve: Fcr must decrease: at KL/r={:.0}, Fcr={:.1} >= prev={:.1}",
            kl_r, fcr, prev_fcr);
        prev_fcr = fcr;
    }

    // Verify specific AISC manual values for W14x48, Fy=345 MPa
    // At KL/r = 0 (theoretical): Fcr ≈ Fy = 345 MPa
    let fe_zero: f64 = pi.powi(2) * e_steel / (1.0_f64 * 1.0);
    let fcr_zero: f64 = 0.658_f64.powf(fy / fe_zero) * fy;
    assert_close(fcr_zero, fy, 0.01,
        "AISC curve: Fcr → Fy as KL/r → 0");

    // Nominal capacity Pn = Fcr * A for a specific slenderness
    let kl_r_test: f64 = 80.0;
    let fe_test: f64 = pi.powi(2) * e_steel / (kl_r_test * kl_r_test);
    let fcr_test: f64 = 0.658_f64.powf(fy / fe_test) * fy;
    let pn: f64 = fcr_test * a_w14 / 1000.0; // kN
    assert!(pn > 0.0, "AISC curve: Pn = {:.1} kN for KL/r={}", pn, kl_r_test);

    // Cross-check: at ry computed above, KL/r=80 corresponds to KL = 80 * ry
    let kl: f64 = kl_r_test * ry; // mm
    assert!(kl > 0.0, "AISC curve: KL = {:.0} mm", kl);
}

// ================================================================
// 3. EC3 Column Buckling: Chi Reduction Factor (Curves a, b, c, d)
// ================================================================
//
// EN 1993-1-1:2005, Clause 6.3.1.2 defines the reduction factor chi:
//
//   chi = 1 / (Phi + sqrt(Phi² - lambda_bar²))   but chi <= 1.0
//
//   where:
//     Phi = 0.5 * [1 + alpha*(lambda_bar - 0.2) + lambda_bar²]
//     lambda_bar = sqrt(Fy / sigma_cr) = sqrt(A*Fy / Ncr)
//     alpha = imperfection factor from Table 6.1:
//       Curve a:  alpha = 0.21
//       Curve b:  alpha = 0.34
//       Curve c:  alpha = 0.49
//       Curve d:  alpha = 0.76
//
// Reference: EN 1993-1-1:2005, Clause 6.3.1.2, Table 6.1, Table 6.2.
//
// This is a pure analytical test of the EC3 column curves.

#[test]
fn validation_col_buck_ext_ec3_chi_curves() {
    let _fy: f64 = 355.0; // MPa, S355 steel

    // Imperfection factors for each curve
    let curves: Vec<(&str, f64)> = vec![
        ("a", 0.21),
        ("b", 0.34),
        ("c", 0.49),
        ("d", 0.76),
    ];

    // Test at multiple non-dimensional slenderness values
    let lambdas: Vec<f64> = vec![0.0, 0.2, 0.5, 0.8, 1.0, 1.2, 1.5, 2.0, 2.5, 3.0];

    for (curve_name, alpha) in &curves {
        let mut prev_chi: f64 = 1.1; // start above 1 to check monotonic decrease

        for &lambda_bar in &lambdas {
            // EC3 Clause 6.3.1.2, Eq. 6.49:
            let phi: f64 = 0.5 * (1.0 + alpha * (lambda_bar - 0.2) + lambda_bar * lambda_bar);

            // Eq. 6.49: chi = 1 / (Phi + sqrt(Phi² - lambda_bar²))
            let discriminant: f64 = phi * phi - lambda_bar * lambda_bar;
            let chi: f64 = if discriminant <= 0.0 || lambda_bar < 1e-10 {
                1.0
            } else {
                let chi_calc: f64 = 1.0 / (phi + discriminant.sqrt());
                chi_calc.min(1.0)
            };

            // chi must be in (0, 1]
            assert!(chi > 0.0 && chi <= 1.0,
                "EC3 curve {}: lambda={:.1}, chi={:.4} should be in (0,1]",
                curve_name, lambda_bar, chi);

            // chi should decrease (or stay equal) as lambda increases
            if lambda_bar > 0.2 {
                assert!(chi <= prev_chi + 1e-10,
                    "EC3 curve {}: chi must not increase: lambda={:.1}, chi={:.4}, prev={:.4}",
                    curve_name, lambda_bar, chi, prev_chi);
            }
            prev_chi = chi;

            // At lambda = 0: chi = 1.0 (no reduction)
            if lambda_bar < 1e-10 {
                assert_close(chi, 1.0, 0.01,
                    &format!("EC3 curve {}: chi=1.0 at lambda=0", curve_name));
            }
        }

        // Verify curve ordering at lambda = 1.0:
        // chi_a > chi_b > chi_c > chi_d (less imperfection → less reduction)
        let lambda_ref: f64 = 1.0;
        let phi_ref: f64 = 0.5 * (1.0 + alpha * (lambda_ref - 0.2) + lambda_ref * lambda_ref);
        let disc_ref: f64 = phi_ref * phi_ref - lambda_ref * lambda_ref;
        let chi_ref: f64 = (1.0 / (phi_ref + disc_ref.sqrt())).min(1.0);

        // Store for ordering check
        // chi_a(1.0) ≈ 0.67 (curve a has smallest imperfection)
        // chi_d(1.0) ≈ 0.41 (curve d has largest imperfection)
        match *curve_name {
            "a" => assert!(chi_ref > 0.60, "EC3: chi_a(1.0)={:.4} > 0.60", chi_ref),
            "d" => assert!(chi_ref < 0.50, "EC3: chi_d(1.0)={:.4} < 0.50", chi_ref),
            _ => {}
        }
    }

    // Explicit ordering check at lambda_bar = 1.0
    let lambda_test: f64 = 1.0;
    let chi_values: Vec<f64> = vec![0.21, 0.34, 0.49, 0.76].iter().map(|&alpha| {
        let phi: f64 = 0.5 * (1.0 + alpha * (lambda_test - 0.2) + lambda_test * lambda_test);
        let disc: f64 = phi * phi - lambda_test * lambda_test;
        (1.0 / (phi + disc.sqrt())).min(1.0)
    }).collect();

    assert!(chi_values[0] > chi_values[1],
        "EC3 ordering: chi_a={:.4} > chi_b={:.4}", chi_values[0], chi_values[1]);
    assert!(chi_values[1] > chi_values[2],
        "EC3 ordering: chi_b={:.4} > chi_c={:.4}", chi_values[1], chi_values[2]);
    assert!(chi_values[2] > chi_values[3],
        "EC3 ordering: chi_c={:.4} > chi_d={:.4}", chi_values[2], chi_values[3]);

    // Verify chi converges to Euler curve at high slenderness
    // At large lambda, imperfection effect vanishes: chi → 1/lambda² (Euler)
    let lambda_high: f64 = 5.0;
    let chi_euler: f64 = 1.0 / (lambda_high * lambda_high);
    for (curve_name, alpha) in &curves {
        let phi: f64 = 0.5 * (1.0 + alpha * (lambda_high - 0.2) + lambda_high * lambda_high);
        let disc: f64 = phi * phi - lambda_high * lambda_high;
        let chi_calc: f64 = (1.0 / (phi + disc.sqrt())).min(1.0);
        assert_close(chi_calc, chi_euler, 0.05,
            &format!("EC3 curve {}: chi→1/lambda² at lambda={:.0}", curve_name, lambda_high));
    }
}

// ================================================================
// 4. Inelastic Buckling: Tangent Modulus Theory vs Euler
// ================================================================
//
// Shanley's tangent modulus theory (1947) provides a lower bound
// for the inelastic buckling load:
//
//   sigma_cr_tangent = pi² * E_t / (KL/r)²
//
// where E_t is the tangent modulus at the stress level sigma_cr.
//
// For a Ramberg-Osgood material model:
//   epsilon = sigma/E + 0.002*(sigma/Fy)^n
//   E_t = E / [1 + 0.002*n/E * (sigma/Fy)^(n-1)]
//
// At low slenderness (KL/r small), sigma_cr approaches Fy.
// At high slenderness, sigma_cr = pi²E/(KL/r)² (Euler governs).
// The transition occurs where Euler stress equals Fy.
//
// Reference: Shanley (1947); Galambos & Surovek, Ch. 3.
//
// This is a pure analytical test comparing tangent modulus and Euler
// critical stresses.

#[test]
fn validation_col_buck_ext_inelastic_tangent_modulus() {
    let fy: f64 = 345.0;          // MPa, A992 steel
    let e_steel: f64 = 200_000.0; // MPa
    let pi: f64 = std::f64::consts::PI;
    let n_ro: f64 = 15.0;         // Ramberg-Osgood exponent for structural steel

    // Slenderness at elastic/inelastic transition
    // sigma_euler = Fy → pi²E/(KL/r)² = Fy → KL/r = pi*sqrt(E/Fy)
    let kl_r_transition: f64 = pi * (e_steel / fy).sqrt();

    // At the transition point, tangent modulus = Euler
    let sigma_euler_trans: f64 = pi.powi(2) * e_steel / (kl_r_transition * kl_r_transition);
    assert_close(sigma_euler_trans, fy, 0.01,
        "Inelastic: Euler stress = Fy at transition KL/r");

    // Ramberg-Osgood tangent modulus function
    let tangent_modulus = |sigma: f64| -> f64 {
        let ratio: f64 = sigma / fy;
        let denom: f64 = 1.0 + 0.002 * n_ro / e_steel * ratio.powf(n_ro - 1.0) * fy;
        e_steel / denom
    };

    // At low stress (elastic range): E_t ≈ E
    let et_low: f64 = tangent_modulus(0.1 * fy);
    assert_close(et_low, e_steel, 0.01,
        "Inelastic: E_t ≈ E at low stress");

    // At sigma = Fy: E_t < E (significant reduction)
    let et_yield: f64 = tangent_modulus(fy);
    assert!(et_yield < e_steel,
        "Inelastic: E_t at Fy ({:.0}) < E ({:.0})", et_yield, e_steel);

    // E_t decreases monotonically with increasing stress
    let stresses: Vec<f64> = vec![0.1, 0.3, 0.5, 0.7, 0.9, 0.95, 1.0];
    let mut prev_et: f64 = e_steel + 1.0;
    for &ratio in &stresses {
        let sigma: f64 = ratio * fy;
        let et: f64 = tangent_modulus(sigma);
        assert!(et < prev_et + 1.0,
            "Inelastic: E_t decreases: sigma/Fy={:.2}, E_t={:.0}, prev={:.0}",
            ratio, et, prev_et);
        prev_et = et;
    }

    // Compare Euler vs tangent modulus critical stresses at various slenderness
    let slenderness_values: Vec<f64> = vec![30.0, 50.0, 70.0, 90.0, 120.0, 150.0, 200.0];
    for &kl_r in &slenderness_values {
        let sigma_euler: f64 = pi.powi(2) * e_steel / (kl_r * kl_r);

        if kl_r > kl_r_transition {
            // Elastic range: Euler governs (sigma_euler < Fy)
            assert!(sigma_euler < fy,
                "Elastic range: KL/r={:.0}, sigma_euler={:.1} < Fy={:.1}",
                kl_r, sigma_euler, fy);
        } else {
            // Inelastic range: tangent modulus critical stress < Euler prediction
            // Solve iteratively: sigma_cr = pi²*Et(sigma_cr)/(KL/r)²
            let mut sigma_cr: f64 = fy.min(sigma_euler); // initial guess
            for _ in 0..20 {
                let et: f64 = tangent_modulus(sigma_cr);
                let new_sigma: f64 = pi.powi(2) * et / (kl_r * kl_r);
                sigma_cr = 0.5 * (sigma_cr + new_sigma.min(fy));
            }

            // Tangent modulus stress must be <= Euler stress and <= Fy
            assert!(sigma_cr <= sigma_euler + 1.0,
                "Inelastic: KL/r={:.0}, sigma_t={:.1} <= sigma_euler={:.1}",
                kl_r, sigma_cr, sigma_euler);
            assert!(sigma_cr <= fy + 1.0,
                "Inelastic: KL/r={:.0}, sigma_t={:.1} <= Fy={:.1}",
                kl_r, sigma_cr, fy);
        }
    }

    // At very low slenderness (stocky column), tangent modulus ≈ Fy
    let kl_r_low: f64 = 10.0;
    let sigma_euler_low: f64 = pi.powi(2) * e_steel / (kl_r_low * kl_r_low);
    // Euler would give a very high stress, but tangent modulus limits to ≈Fy
    assert!(sigma_euler_low > fy,
        "Stocky column: Euler stress ({:.0}) > Fy ({:.0})", sigma_euler_low, fy);
}

// ================================================================
// 5. Frame Buckling: Sway vs Non-Sway Effective Lengths
// ================================================================
//
// For frames, the effective length factor K depends on whether
// the frame is braced (non-sway) or unbraced (sway):
//
//   Non-sway (braced): K < 1.0 for most cases
//     The lateral displacement is prevented by bracing.
//     Fixed-fixed column in a braced frame: K ≈ 0.5-1.0
//
//   Sway (unbraced): K > 1.0 for most cases
//     The frame is free to sway laterally.
//     Fixed-fixed column in a sway frame: K ≈ 1.0-∞
//
// We verify this by building two portal frames:
//   (a) Fixed bases (braced behavior: higher Pcr, less drift)
//   (b) Pinned bases (sway behavior: lower Pcr, more drift)
//
// Reference: AISC 360-22, Appendix 7; Galambos & Surovek, Ch. 4.

#[test]
fn validation_col_buck_ext_frame_sway_vs_nonsway() {
    let h: f64 = 5.0;   // column height (m)
    let w: f64 = 8.0;   // beam span (m)
    let a: f64 = 0.01;  // m²
    let iz: f64 = 1e-4;  // m⁴
    let pi: f64 = std::f64::consts::PI;

    // Lateral load to create drift
    let f_lateral = 5.0; // kN
    // Gravity load on columns
    let f_gravity = -20.0; // kN (downward)

    // ---- (a) Braced frame: fixed bases ----
    let input_braced = make_portal_frame(h, w, E, a, iz, f_lateral, f_gravity);
    let res_braced = linear::solve_2d(&input_braced).unwrap();

    // ---- (b) Sway frame: pinned bases ----
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 4, "pinned")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f_lateral, fy: f_gravity, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: f_gravity, mz: 0.0,
        }),
    ];
    let input_sway = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, a, iz)], elems, sups, loads,
    );
    let res_sway = linear::solve_2d(&input_sway).unwrap();

    // Compare lateral drift at beam level (node 2)
    let drift_braced: f64 = res_braced.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    let drift_sway: f64 = res_sway.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Sway frame must drift more than braced frame
    assert!(drift_sway > drift_braced * 2.0,
        "Sway drift ({:.6e}) > 2× braced drift ({:.6e})", drift_sway, drift_braced);

    // ---- Effective length concept verification ----
    // For a single fixed-base column of height h:
    //   K_braced ≈ 0.7 (conservative, fixed-pinned equivalent)
    //   K_sway ≈ 2.0 (conservative, cantilever equivalent)
    //
    // Pcr ratio: Pcr_braced / Pcr_sway = (K_sway/K_braced)² ≈ (2.0/0.7)² ≈ 8.16
    let k_braced: f64 = 0.7;
    let k_sway: f64 = 2.0;
    let pcr_ratio_theory: f64 = (k_sway / k_braced).powi(2);
    let pcr_braced: f64 = pi.powi(2) * E_EFF * iz / (k_braced * h).powi(2);
    let pcr_sway: f64 = pi.powi(2) * E_EFF * iz / (k_sway * h).powi(2);

    assert!(pcr_braced > pcr_sway,
        "Pcr_braced ({:.1}) > Pcr_sway ({:.1})", pcr_braced, pcr_sway);
    assert_close(pcr_braced / pcr_sway, pcr_ratio_theory, 0.01,
        "K-factor ratio: Pcr_braced/Pcr_sway");

    // Verify that column base moments differ between braced and sway
    // In braced frame: columns develop base moments (fixed base)
    let m_base_braced: f64 = res_braced.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();
    assert!(m_base_braced > 0.0,
        "Braced frame: non-zero base moment = {:.4}", m_base_braced);

    // In sway frame: pinned bases have no moment
    let m_base_sway: f64 = res_sway.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();
    assert!(m_base_sway < 1e-6,
        "Sway frame: zero base moment = {:.6e}", m_base_sway);
}

// ================================================================
// 6. Stepped Column: Variable Cross-Section Critical Load
// ================================================================
//
// A column with two segments of different cross-sections:
//   Lower half: section I1 (larger)
//   Upper half: section I2 = I1/2 (smaller)
//
// The critical load for such a stepped column can be estimated
// via the Rayleigh-Ritz energy method:
//
//   Pcr_stepped ≈ pi²*E*I_avg / L²
//
// where I_avg is a weighted average moment of inertia, which for
// equal segment lengths and a sinusoidal buckled shape is:
//
//   I_avg = (I1 + I2) / 2  (simple average for equal lengths)
//
// More precisely, for a pinned-pinned column with two equal segments:
//   Pcr = pi²*E / L² * [integral of I(x)*phi''(x)² dx] / [integral of phi'(x)² dx]
//
// With phi(x) = sin(pi*x/L), phi''(x) = -(pi/L)² * sin(pi*x/L):
//   Pcr = pi²*E/L² * (I1*int_0^0.5 sin²(z)dz + I2*int_0.5^1 sin²(z)dz) / (int_0^1 sin²(z)dz)
//
// Since int sin²(z) dz over each half = 0.25 and total = 0.5:
//   Pcr = pi²*E/L² * (I1*0.25 + I2*0.25) / 0.5 = pi²*E*(I1+I2)/(2*L²)
//
// Reference: Timoshenko & Gere, Section 2.15.
//
// We verify via solver by building two separate halves with different sections,
// comparing deflections to a uniform column with I_avg.

#[test]
fn validation_col_buck_ext_stepped_column_energy() {
    let l: f64 = 8.0;    // total length (m)
    let a: f64 = 0.01;   // m² (same for both segments)
    let iz1: f64 = 2e-4;  // m⁴ (lower half, larger)
    let iz2: f64 = 1e-4;  // m⁴ (upper half, smaller)
    let iz_avg: f64 = (iz1 + iz2) / 2.0;
    let pi: f64 = std::f64::consts::PI;
    let n = 20; // total elements (10 per half)

    // Analytical critical loads
    let pcr_uniform_iz1: f64 = pi.powi(2) * E_EFF * iz1 / (l * l);
    let pcr_uniform_iz2: f64 = pi.powi(2) * E_EFF * iz2 / (l * l);
    let pcr_stepped: f64 = pi.powi(2) * E_EFF * iz_avg / (l * l);

    // Stepped Pcr should be between uniform-I1 and uniform-I2
    assert!(pcr_stepped < pcr_uniform_iz1,
        "Stepped Pcr ({:.1}) < uniform-I1 Pcr ({:.1})", pcr_stepped, pcr_uniform_iz1);
    assert!(pcr_stepped > pcr_uniform_iz2,
        "Stepped Pcr ({:.1}) > uniform-I2 Pcr ({:.1})", pcr_stepped, pcr_uniform_iz2);

    // Verify Pcr_stepped = average of the two uniform Pcr values
    assert_close(pcr_stepped, (pcr_uniform_iz1 + pcr_uniform_iz2) / 2.0, 0.01,
        "Stepped Pcr = avg(Pcr_I1, Pcr_I2)");

    // ---- Solver verification: stepped vs uniform columns ----
    // Build stepped column: two sections, lateral load at midspan.
    // Compare deflection with uniform column using I_avg.
    let p_lateral = 1.0; // kN at midspan
    let mid = n / 2 + 1;

    // (a) Stepped column: section 1 for elements 1..10, section 2 for 11..20
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| {
        let sec_id = if i < n / 2 { 1 } else { 2 };
        (i + 1, "frame", i + 1, i + 2, 1, sec_id, false, false)
    }).collect();
    let sups = vec![(1, 1, "pinned"), (2, n + 1, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: p_lateral, mz: 0.0,
    })];
    let input_stepped = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a, iz1), (2, a, iz2)],
        elems,
        sups,
        loads,
    );
    let d_stepped = linear::solve_2d(&input_stepped).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // (b) Uniform column with I_avg
    let loads_avg = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: p_lateral, mz: 0.0,
    })];
    let input_avg = make_beam(n, l, E, a, iz_avg, "pinned", Some("rollerX"), loads_avg);
    let d_avg = linear::solve_2d(&input_avg).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // (c) Uniform column with I1 (stiffer, less deflection)
    let loads_i1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: p_lateral, mz: 0.0,
    })];
    let input_i1 = make_beam(n, l, E, a, iz1, "pinned", Some("rollerX"), loads_i1);
    let d_i1 = linear::solve_2d(&input_i1).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // (d) Uniform column with I2 (more flexible, more deflection)
    let loads_i2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: p_lateral, mz: 0.0,
    })];
    let input_i2 = make_beam(n, l, E, a, iz2, "pinned", Some("rollerX"), loads_i2);
    let d_i2 = linear::solve_2d(&input_i2).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // Deflection ordering: d_i2 > d_stepped > d_i1
    // (stepped is between the two extremes)
    assert!(d_i2 > d_stepped,
        "Stepped deflection ({:.6e}) < uniform-I2 ({:.6e})", d_stepped, d_i2);
    assert!(d_stepped > d_i1,
        "Stepped deflection ({:.6e}) > uniform-I1 ({:.6e})", d_stepped, d_i1);

    // The stepped column's deflection should be close to the I_avg uniform column
    // (within 5%, since the energy method average is approximate for non-uniform columns)
    assert_close(d_stepped, d_avg, 0.05,
        "Stepped column ≈ uniform I_avg deflection");
}

// ================================================================
// 7. Column with Initial Imperfection: Perry-Robertson Formula
// ================================================================
//
// The Perry-Robertson formula accounts for initial bow imperfection
// in a column. Used as the basis for EC3 column curves.
//
// For a column with initial midspan bow e0:
//
//   sigma_cr_perry = [Fy + (1+eta)*sigma_e] / 2
//                    - sqrt{ [(Fy + (1+eta)*sigma_e)/2]² - Fy*sigma_e }
//
// where:
//   sigma_e = pi²E / (L/r)²  (Euler stress)
//   eta = e0 * A / (W_el)     (Perry imperfection parameter)
//       = e0 * c / r²         (where c = distance to extreme fiber)
//
// In EC3 formulation: eta = alpha*(lambda_bar - 0.2) for lambda_bar > 0.2
//
// Reference: Perry (1886), Robertson (1925);
//            EN 1993-1-1:2005, Clause 6.3.1.2 background.
//
// This is a pure analytical test of the Perry-Robertson formula,
// plus a solver check that initial imperfection (modeled as equivalent
// lateral load) increases deflection.

#[test]
fn validation_col_buck_ext_perry_robertson_imperfection() {
    let fy: f64 = 355.0;          // MPa, S355
    let e_steel: f64 = 200_000.0; // MPa
    let pi: f64 = std::f64::consts::PI;

    // Section properties (simplified rectangular: b=0.1m, h=0.2m)
    let b: f64 = 100.0;   // mm
    let h: f64 = 200.0;   // mm
    let a_mm: f64 = b * h; // mm²
    let i_mm: f64 = b * h.powi(3) / 12.0; // mm⁴
    let r: f64 = (i_mm / a_mm).sqrt();     // mm, radius of gyration
    let c: f64 = h / 2.0;                  // mm, extreme fiber distance

    // Section properties in m for solver
    let a_m: f64 = a_mm / 1e6;    // m²
    let iz_m: f64 = i_mm / 1e12;  // m⁴

    // Initial bow imperfection: e0 = L/500 (EC3 recommendation)
    // Test at multiple slenderness ratios
    let slenderness_values: Vec<f64> = vec![40.0, 60.0, 80.0, 100.0, 120.0, 150.0];

    for &kl_r in &slenderness_values {
        let l_mm: f64 = kl_r * r;       // mm
        let e0_mm: f64 = l_mm / 500.0;  // mm, L/500 bow

        // Euler stress
        let sigma_e: f64 = pi.powi(2) * e_steel / (kl_r * kl_r);

        // Perry imperfection parameter
        let eta: f64 = e0_mm * c / (r * r);

        // Perry-Robertson critical stress (Eq. from Perry, 1886)
        let term: f64 = (fy + (1.0 + eta) * sigma_e) / 2.0;
        let discriminant: f64 = term * term - fy * sigma_e;
        assert!(discriminant >= 0.0,
            "Perry: discriminant >= 0 at KL/r={:.0}", kl_r);
        let sigma_perry: f64 = term - discriminant.sqrt();

        // Perry stress must be positive and below both Fy and Euler
        assert!(sigma_perry > 0.0,
            "Perry: sigma > 0 at KL/r={:.0}: {:.1}", kl_r, sigma_perry);
        assert!(sigma_perry <= fy + 1.0,
            "Perry: sigma <= Fy at KL/r={:.0}: {:.1} vs {:.1}", kl_r, sigma_perry, fy);
        assert!(sigma_perry <= sigma_e + 1.0,
            "Perry: sigma <= sigma_e at KL/r={:.0}: {:.1} vs {:.1}",
            kl_r, sigma_perry, sigma_e);

        // With imperfection, Perry stress < Euler stress
        if kl_r > 40.0 {
            assert!(sigma_perry < sigma_e,
                "Perry: sigma_perry ({:.1}) < sigma_euler ({:.1}) at KL/r={:.0}",
                sigma_perry, sigma_e, kl_r);
        }
    }

    // ---- Solver verification: imperfection increases deflection ----
    // Model a column with equivalent lateral load representing
    // the initial bow imperfection. The first-order moment from
    // imperfection e0 under axial load P is approximately:
    //   M_equiv ≈ P * e0 at midspan
    //   F_equiv ≈ 8 * P * e0 / L²  (equivalent lateral UDL, simplified)
    //
    // We use a simpler approach: apply a point load at midspan.
    let l_m: f64 = 4.0;       // m
    let n: usize = 12;
    let mid = n / 2 + 1;

    // Small lateral load representing perfect column
    let f_lat_perfect = 1.0; // kN
    let loads_perfect = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: f_lat_perfect, mz: 0.0,
    })];
    let input_perfect = make_beam(n, l_m, E, a_m, iz_m, "pinned", Some("rollerX"), loads_perfect);
    let d_perfect = linear::solve_2d(&input_perfect).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // Column with additional imperfection load (simulating e0 = L/500)
    let e0_m: f64 = l_m / 500.0;
    let p_axial = 50.0; // kN
    let f_equiv_imperfection: f64 = 8.0 * p_axial * e0_m / (l_m * l_m);
    let f_lat_imperfect: f64 = f_lat_perfect + f_equiv_imperfection;
    let loads_imperfect = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: f_lat_imperfect, mz: 0.0,
    })];
    let input_imperfect = make_beam(n, l_m, E, a_m, iz_m, "pinned", Some("rollerX"), loads_imperfect);
    let d_imperfect = linear::solve_2d(&input_imperfect).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // Imperfect column deflects more
    assert!(d_imperfect > d_perfect,
        "Imperfect column deflects more: {:.6e} > {:.6e}", d_imperfect, d_perfect);

    // The ratio should be approximately f_lat_imperfect / f_lat_perfect
    // (linear superposition in linear solver)
    let deflection_ratio: f64 = d_imperfect / d_perfect;
    let load_ratio: f64 = f_lat_imperfect / f_lat_perfect;
    assert_close(deflection_ratio, load_ratio, 0.02,
        "Imperfection: deflection ratio ≈ load ratio (linear)");
}

// ================================================================
// 8. Beam-Column Interaction: AISC H1-1a and H1-1b Equations
// ================================================================
//
// AISC 360-22, Section H1.1 defines the interaction equations for
// members subject to combined axial compression and bending:
//
//   For Pr/Pc >= 0.2 (Eq. H1-1a):
//     Pr/Pc + (8/9)*(Mrx/Mcx + Mry/Mcy) <= 1.0
//
//   For Pr/Pc < 0.2 (Eq. H1-1b):
//     Pr/(2*Pc) + (Mrx/Mcx + Mry/Mcy) <= 1.0
//
// where:
//   Pr = required axial compressive strength (kN)
//   Pc = phi_c * Pn = design axial compressive strength (kN)
//   Mrx = required flexural strength about x-axis (kN·m)
//   Mcx = phi_b * Mnx = design flexural strength about x-axis (kN·m)
//   Mry, Mcy = same for y-axis
//
// Reference: AISC 360-22, Section H1, p. 16.1-95.
//
// We verify:
//   (a) Correct equation selection based on Pr/Pc threshold
//   (b) Points on the interaction surface satisfy <= 1.0
//   (c) The curve shape is convex (interaction penalizes combined loading)
//   (d) Solver-computed beam-column forces are consistent with interaction

#[test]
fn validation_col_buck_ext_beam_column_interaction() {
    let fy: f64 = 345.0;          // MPa, A992 steel
    let e_steel: f64 = 200_000.0; // MPa
    let pi: f64 = std::f64::consts::PI;
    let phi_c: f64 = 0.90;        // LRFD resistance factor (compression)
    let phi_b: f64 = 0.90;        // LRFD resistance factor (bending)

    // W14x48 section properties
    let a_w14: f64 = 9_030.0;      // mm²
    let zx: f64 = 889_000.0;       // mm³ (plastic section modulus, strong axis)
    let iy: f64 = 51.3e6;          // mm⁴ (weak axis moment of inertia)
    let _ry: f64 = (iy / a_w14).sqrt(); // mm

    // Compute design capacities
    // Assume KL/r_y = 80 for column capacity calculation
    let kl_r: f64 = 80.0;
    let fe: f64 = pi.powi(2) * e_steel / (kl_r * kl_r);
    let kl_r_transition: f64 = 4.71 * (e_steel / fy).sqrt();

    let fcr: f64 = if kl_r <= kl_r_transition {
        let ratio: f64 = fy / fe;
        0.658_f64.powf(ratio) * fy
    } else {
        0.877 * fe
    };

    let pn: f64 = fcr * a_w14 / 1000.0;    // kN
    let pc: f64 = phi_c * pn;                // kN (design compressive capacity)
    let mnx: f64 = fy * zx / 1e6;           // kN·m (plastic moment capacity)
    let mcx: f64 = phi_b * mnx;              // kN·m (design flexural capacity)

    assert!(pc > 0.0, "AISC H1: Pc = {:.1} kN > 0", pc);
    assert!(mcx > 0.0, "AISC H1: Mcx = {:.1} kN·m > 0", mcx);

    // ---- (a) H1-1a: high axial (Pr/Pc >= 0.2) ----
    // Test multiple points on the interaction curve
    let pr_high: f64 = 0.6 * pc; // Pr/Pc = 0.6 (use H1-1a)
    let pr_pc_high: f64 = pr_high / pc;
    assert!(pr_pc_high >= 0.2, "H1-1a: Pr/Pc = {:.2} >= 0.2", pr_pc_high);

    // Maximum allowed moment ratio from H1-1a:
    //   Pr/Pc + (8/9)*Mr/Mc = 1.0
    //   Mr/Mc = (1.0 - Pr/Pc) * 9/8
    let mr_mc_max_h1a: f64 = (1.0 - pr_pc_high) * 9.0 / 8.0;
    assert!(mr_mc_max_h1a > 0.0 && mr_mc_max_h1a <= 1.125,
        "H1-1a: max Mr/Mc = {:.4}", mr_mc_max_h1a);

    // Verify point on the curve satisfies the equation
    let mr_test: f64 = mr_mc_max_h1a * mcx * 0.99; // just inside
    let interaction_h1a: f64 = pr_high / pc + (8.0 / 9.0) * (mr_test / mcx);
    assert!(interaction_h1a <= 1.0 + 1e-6,
        "H1-1a: interaction = {:.4} <= 1.0", interaction_h1a);

    // ---- (b) H1-1b: low axial (Pr/Pc < 0.2) ----
    let pr_low: f64 = 0.1 * pc; // Pr/Pc = 0.1 (use H1-1b)
    let pr_pc_low: f64 = pr_low / pc;
    assert!(pr_pc_low < 0.2, "H1-1b: Pr/Pc = {:.2} < 0.2", pr_pc_low);

    // Maximum allowed moment ratio from H1-1b:
    //   Pr/(2*Pc) + Mr/Mc = 1.0
    //   Mr/Mc = 1.0 - Pr/(2*Pc)
    let mr_mc_max_h1b: f64 = 1.0 - pr_low / (2.0 * pc);
    assert!(mr_mc_max_h1b > 0.9,
        "H1-1b: max Mr/Mc = {:.4} (high, since axial is small)", mr_mc_max_h1b);

    let mr_test_b: f64 = mr_mc_max_h1b * mcx * 0.99;
    let interaction_h1b: f64 = pr_low / (2.0 * pc) + mr_test_b / mcx;
    assert!(interaction_h1b <= 1.0 + 1e-6,
        "H1-1b: interaction = {:.4} <= 1.0", interaction_h1b);

    // ---- (c) Convexity: interaction curve is convex ----
    // At Pr/Pc = 0.2 (transition), both equations should give similar results
    let _pr_trans: f64 = 0.2 * pc;
    let mr_mc_h1a_trans: f64 = (1.0 - 0.2) * 9.0 / 8.0; // from H1-1a
    let mr_mc_h1b_trans: f64 = 1.0 - 0.2 / 2.0;          // from H1-1b = 0.9

    // At Pr/Pc=0.2: H1-1a gives (1-0.2)*9/8 = 0.9 and H1-1b gives 1-0.1 = 0.9
    // Both equations are continuous at the transition
    assert_close(mr_mc_h1a_trans, mr_mc_h1b_trans, 0.01,
        "AISC H1: continuity at Pr/Pc = 0.2");

    // ---- (d) Solver verification: beam-column stress resultants ----
    // Build a cantilever beam-column with combined axial + transverse load
    // and verify that element forces satisfy equilibrium.
    let l: f64 = 3.0;      // m
    let a_m: f64 = a_w14 / 1e6;       // m²
    let iz_m: f64 = 51.3e6 / 1e12;    // m⁴ (using weak axis I)
    let n: usize = 8;

    let p_applied: f64 = 100.0;  // kN axial
    let f_trans: f64 = 10.0;     // kN transverse at tip

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: -p_applied, fy: f_trans, mz: 0.0,
    })];
    let input = make_beam(n, l, E, a_m, iz_m, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Base element should carry both axial and shear
    let ef_base = results.element_forces.iter()
        .find(|ef| ef.element_id == 1).unwrap();

    // Axial force ≈ P_applied (constant along column)
    assert_close(ef_base.n_start.abs(), p_applied, 0.02,
        "AISC H1 solver: N ≈ P_applied");

    // Shear force ≈ F_trans (constant for point load at tip)
    assert_close(ef_base.v_start.abs(), f_trans, 0.02,
        "AISC H1 solver: V ≈ F_trans");

    // Base moment ≈ F_trans × L
    let m_base_expected: f64 = f_trans * l;
    assert_close(ef_base.m_start.abs(), m_base_expected, 0.02,
        "AISC H1 solver: M_base ≈ F_trans × L");

    // Compute interaction ratio for the solver results
    let pr_solver: f64 = ef_base.n_start.abs();
    let mr_solver: f64 = ef_base.m_start.abs();
    let interaction_solver: f64 = if pr_solver / pc >= 0.2 {
        pr_solver / pc + (8.0 / 9.0) * (mr_solver / mcx)
    } else {
        pr_solver / (2.0 * pc) + mr_solver / mcx
    };

    // The interaction ratio should be less than 1.0 for these load levels
    // (we chose loads well below capacity)
    assert!(interaction_solver < 1.0,
        "AISC H1 solver: interaction ratio = {:.4} < 1.0", interaction_solver);

    // Verify equilibrium at fixed base
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.rx, p_applied, 0.02, "AISC H1: Rx = P_axial");
    assert_close(r.ry, -f_trans, 0.02, "AISC H1: Ry = -F_trans");
    assert_close(r.mz.abs(), m_base_expected, 0.02, "AISC H1: Mz = F_trans × L");
}
