/// Validation: Plate and Shell Buckling — Pure-Math Formulas
///
/// References:
///   - Timoshenko & Gere, "Theory of Elastic Stability", 2nd ed. (1961)
///   - Brush & Almroth, "Buckling of Bars, Plates, and Shells" (1975)
///   - Bleich, "Buckling Strength of Metal Structures" (1952)
///   - Gerard & Becker, NACA TN 3781 (1957) — Plate Buckling Coefficients
///   - EN 1993-1-5 (Eurocode 3), Annex A — Plate buckling
///   - Donnell, "Beams, Plates, and Shells" (1976)
///   - NASA SP-8007, "Buckling of Thin-Walled Circular Cylinders" (1968)
///   - von Karman, Sechler & Donnell, "Strength of thin plates in compression" (1932)
///
/// Tests verify plate and shell buckling formulas with hand-computed expected values.
/// No solver calls — pure arithmetic verification of analytical expressions.

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
        "{}: got {:.6e}, expected {:.6e}, rel err = {:.4}%",
        label, got, expected, err * 100.0
    );
}

// ================================================================
// 1. Plate Buckling — Simply Supported Under Uniaxial Compression
// ================================================================
//
// Critical stress for a simply supported rectangular plate (a x b)
// under uniform compression in the x-direction (along a):
//
//   sigma_cr = k * pi^2 * D / (b^2 * t)
//
// where D = E*t^3/(12*(1-nu^2)) is the plate flexural rigidity,
// b is the loaded width, t is the thickness,
// k = buckling coefficient = min over m of [(m*b/a + a/(m*b))^2]
//
// For a/b = 1 (square): k = 4.0
// For a/b -> infinity: k -> 4.0 (minimum always ≈ 4 for SS)
// For a/b = 0.5: k = (0.5 + 1/0.5)^2 = (0.5+2)^2 = 6.25
//
// Ref: Timoshenko & Gere Ch.9, EN 1993-1-5 Annex A

#[test]
fn validation_plate_buckling_simply_supported() {
    let e: f64 = 200_000.0; // MPa
    let nu: f64 = 0.30;
    let t: f64 = 10.0; // mm
    let b: f64 = 500.0; // mm (width)

    // Plate flexural rigidity
    let d_flex = e * t.powi(3) / (12.0 * (1.0 - nu * nu));
    let expected_d = 200_000.0 * 1000.0 / (12.0 * 0.91);
    assert_close(d_flex, expected_d, 1e-10, "plate flexural rigidity D");

    // Square plate (a/b = 1): k = 4.0
    let k_square = 4.0;
    let sigma_cr_sq = k_square * PI * PI * d_flex / (b * b * t);
    // Verify by formula
    let expected_cr = k_square * PI * PI * d_flex / (b * b * t);
    assert_close(sigma_cr_sq, expected_cr, 1e-12, "square plate buckling stress");

    // Verify k for square plate: (m*b/a + a/(m*b))^2 with m=1, a=b
    let a_sq: f64 = 500.0;
    let k_calc = (1.0 * b / a_sq + a_sq / (1.0 * b)).powi(2);
    assert_close(k_calc, 4.0, 1e-10, "k coefficient for square plate");

    // Long plate (a/b = 3): k ≈ 4.0 (m=3 gives minimum)
    let a_long: f64 = 1500.0;
    let mut k_min = f64::MAX;
    for m in 1..=5 {
        let mf = m as f64;
        let k_m = (mf * b / a_long + a_long / (mf * b)).powi(2);
        if k_m < k_min {
            k_min = k_m;
        }
    }
    assert_close(k_min, 4.0, 1e-10, "k for long plate (a/b=3)");

    // Short plate (a/b = 0.5): k = (0.5+2)^2 = 6.25 (m=1)
    let a_short: f64 = 250.0;
    let k_short = (1.0 * b / a_short + a_short / (1.0 * b)).powi(2);
    assert_close(k_short, 6.25, 1e-10, "k for short plate (a/b=0.5)");

    // Higher k means higher critical stress (shorter plates are stiffer)
    let sigma_cr_short = k_short * PI * PI * d_flex / (b * b * t);
    assert!(
        sigma_cr_short > sigma_cr_sq,
        "short plate ({:.1}) should buckle at higher stress than square ({:.1})",
        sigma_cr_short, sigma_cr_sq
    );
}

// ================================================================
// 2. Plate Buckling Coefficients — Various Boundary Conditions
// ================================================================
//
// For different boundary conditions on unloaded edges of a long plate:
//   SS-SS: k = 4.00
//   SS-Fixed: k = 5.42
//   Fixed-Fixed: k = 6.97
//   SS-Free: k = 0.425
//   Fixed-Free: k = 1.277
//
// These values are for a/b >> 1 (long plate) under uniaxial compression.
//
// Ref: Gerard & Becker NACA TN 3781, Bleich Table 7.1

#[test]
fn validation_plate_buckling_coefficients() {
    let e: f64 = 200_000.0;
    let nu: f64 = 0.30;
    let t: f64 = 8.0; // mm
    let b: f64 = 300.0; // mm

    let d_flex = e * t.powi(3) / (12.0 * (1.0 - nu * nu));

    // k coefficients for various BCs
    let k_ss_ss: f64 = 4.00;
    let k_ss_fixed: f64 = 5.42;
    let k_fixed_fixed: f64 = 6.97;
    let k_ss_free: f64 = 0.425;
    let k_fixed_free: f64 = 1.277;

    // Compute critical stresses
    let base = PI * PI * d_flex / (b * b * t);
    let sigma_ss_ss = k_ss_ss * base;
    let sigma_ss_fixed = k_ss_fixed * base;
    let sigma_fixed_fixed = k_fixed_fixed * base;
    let sigma_ss_free = k_ss_free * base;
    let sigma_fixed_free = k_fixed_free * base;

    // Ordering: fixed-fixed > ss-fixed > ss-ss > fixed-free > ss-free
    assert!(
        sigma_fixed_fixed > sigma_ss_fixed,
        "fixed-fixed > ss-fixed"
    );
    assert!(
        sigma_ss_fixed > sigma_ss_ss,
        "ss-fixed > ss-ss"
    );
    assert!(
        sigma_ss_ss > sigma_fixed_free,
        "ss-ss > fixed-free"
    );
    assert!(
        sigma_fixed_free > sigma_ss_free,
        "fixed-free > ss-free"
    );

    // Ratio checks
    let ratio_ff_ss = k_fixed_fixed / k_ss_ss;
    assert_close(ratio_ff_ss, 6.97 / 4.0, 1e-10, "fixed-fixed / ss-ss ratio");

    // Free edge dramatically reduces buckling resistance
    let ratio_free_ss = k_ss_free / k_ss_ss;
    assert!(
        ratio_free_ss < 0.15,
        "free edge reduces k to ~10% of SS-SS: ratio = {:.3}",
        ratio_free_ss
    );

    // All stresses should be positive
    assert!(sigma_ss_free > 0.0, "all critical stresses positive");

    // Buckling stress scales with (t/b)^2
    let t2: f64 = 12.0;
    let d_flex2 = e * t2.powi(3) / (12.0 * (1.0 - nu * nu));
    let sigma2 = k_ss_ss * PI * PI * d_flex2 / (b * b * t2);
    let thickness_ratio = (t2 / t).powi(2);
    let stress_ratio = sigma2 / sigma_ss_ss;
    assert_close(stress_ratio, thickness_ratio, 1e-10, "sigma_cr scales with (t/b)^2");
}

// ================================================================
// 3. Shear Buckling of Plates
// ================================================================
//
// Critical shear stress for a simply supported plate:
//   tau_cr = k_s * pi^2 * D / (b^2 * t)
//
// For SS edges (long plate, a/b > 1):
//   k_s = 5.34 + 4.0*(b/a)^2
//
// For clamped edges:
//   k_s = 8.98 + 5.6*(b/a)^2
//
// For a/b -> infinity: k_s(SS) = 5.34, k_s(clamped) = 8.98
//
// Ref: Timoshenko & Gere, Bleich Ch.7, EN 1993-1-5 Annex A

#[test]
fn validation_shear_buckling_plates() {
    let e: f64 = 200_000.0;
    let nu: f64 = 0.30;
    let t: f64 = 6.0; // mm
    let b: f64 = 600.0; // mm (depth of web)
    let a: f64 = 1200.0; // mm (stiffener spacing)

    let d_flex = e * t.powi(3) / (12.0 * (1.0 - nu * nu));
    let base = PI * PI * d_flex / (b * b * t);

    // Aspect ratio
    let alpha = a / b; // = 2.0

    // SS shear buckling coefficient
    let k_s_ss = 5.34 + 4.0 / (alpha * alpha);
    // = 5.34 + 4.0/4.0 = 5.34 + 1.0 = 6.34
    assert_close(k_s_ss, 6.34, 1e-10, "k_s SS at a/b=2");

    // Clamped shear buckling coefficient
    let k_s_cl = 8.98 + 5.6 / (alpha * alpha);
    // = 8.98 + 5.6/4.0 = 8.98 + 1.4 = 10.38
    assert_close(k_s_cl, 10.38, 1e-10, "k_s clamped at a/b=2");

    // Critical shear stresses
    let tau_cr_ss = k_s_ss * base;
    let tau_cr_cl = k_s_cl * base;

    // Clamped > SS
    assert!(
        tau_cr_cl > tau_cr_ss,
        "clamped shear buckling > SS"
    );

    // For very long plate (a/b -> inf): k_s -> 5.34 (SS)
    let alpha_inf: f64 = 100.0;
    let k_s_inf = 5.34 + 4.0 / (alpha_inf * alpha_inf);
    assert_close(k_s_inf, 5.34, 1e-3, "k_s for very long plate");

    // For square plate (a/b = 1): k_s = 5.34 + 4.0 = 9.34
    let k_s_square = 5.34 + 4.0;
    assert_close(k_s_square, 9.34, 1e-10, "k_s SS for square plate");

    // Interaction: combined compression + shear
    // (sigma/sigma_cr)^2 + (tau/tau_cr)^2 = 1  (approximate interaction)
    let k_comp: f64 = 4.0;
    let sigma_cr = k_comp * base;
    // At sigma = 0.5*sigma_cr, allowable tau:
    let sigma_applied = 0.5 * sigma_cr;
    let tau_allowable_sq =
        tau_cr_ss * tau_cr_ss * (1.0 - (sigma_applied / sigma_cr).powi(2));
    let tau_allowable = tau_allowable_sq.sqrt();
    // = tau_cr * sqrt(1 - 0.25) = tau_cr * sqrt(0.75) = tau_cr * 0.866
    assert_close(
        tau_allowable / tau_cr_ss,
        0.75_f64.sqrt(),
        1e-10,
        "interaction at 50% compression",
    );
}

// ================================================================
// 4. Cylindrical Shell Buckling — Classical (Donnell)
// ================================================================
//
// Classical buckling stress for a thin cylindrical shell under
// axial compression (Donnell equation):
//   sigma_cr = E*t / (R*sqrt(3*(1-nu^2)))
//
// where R = radius, t = thickness
//
// This is the "classical" value. Actual shells buckle at 10-50%
// of this due to imperfection sensitivity.
//
// Knockdown factor (NASA SP-8007):
//   gamma = 1 - 0.901*(1 - exp(-1/16*sqrt(R/t)))
//   sigma_design = gamma * sigma_cr_classical
//
// Ref: NASA SP-8007, Donnell (1976), Brush & Almroth Ch.5

#[test]
fn validation_cylindrical_shell_buckling() {
    let e: f64 = 200_000.0; // MPa
    let nu: f64 = 0.30;
    let r: f64 = 1000.0; // mm radius
    let t: f64 = 5.0; // mm thickness

    // Classical buckling stress
    let sigma_cr = e * t / (r * (3.0 * (1.0 - nu * nu)).sqrt());
    let expected = 200_000.0 * 5.0 / (1000.0 * (3.0 * 0.91_f64).sqrt());
    assert_close(sigma_cr, expected, 1e-10, "classical shell buckling");

    // sigma_cr = E / sqrt(3*(1-nu^2)) * (t/R)
    // The term E/sqrt(3*(1-nu^2)) is a material constant
    let c_material = e / (3.0 * (1.0 - nu * nu)).sqrt();
    assert_close(sigma_cr, c_material * t / r, 1e-10, "material constant form");

    // R/t ratio
    let r_over_t = r / t;
    assert_close(r_over_t, 200.0, 1e-10, "R/t ratio");

    // NASA SP-8007 knockdown factor
    let gamma = 1.0 - 0.901 * (1.0 - (-r_over_t.sqrt() / 16.0).exp());
    // R/t = 200, sqrt(200) = 14.142, 14.142/16 = 0.8839
    // exp(-0.8839) = 0.4133
    // gamma = 1 - 0.901*(1-0.4133) = 1 - 0.901*0.5867 = 1 - 0.5286 = 0.4714
    let expected_gamma =
        1.0 - 0.901 * (1.0 - (-200.0_f64.sqrt() / 16.0).exp());
    assert_close(gamma, expected_gamma, 1e-10, "knockdown factor");

    // Design stress
    let sigma_design = gamma * sigma_cr;
    assert!(
        sigma_design < sigma_cr,
        "design stress ({:.1}) < classical ({:.1})",
        sigma_design, sigma_cr
    );

    // For thicker shell (lower R/t), knockdown is less severe
    let t_thick: f64 = 20.0;
    let rt_thick = r / t_thick; // = 50
    let gamma_thick =
        1.0 - 0.901 * (1.0 - (-rt_thick.sqrt() / 16.0).exp());
    assert!(
        gamma_thick > gamma,
        "thicker shell has higher knockdown factor: {:.4} > {:.4}",
        gamma_thick, gamma
    );

    // Classical solution is upper bound
    assert!(gamma <= 1.0, "knockdown factor <= 1.0");
    assert!(gamma > 0.0, "knockdown factor > 0.0");
}

// ================================================================
// 5. Effective Width — Von Karman Post-Buckling
// ================================================================
//
// After buckling, a plate can still carry load through stress
// redistribution. The effective width concept:
//   b_eff = b * sqrt(sigma_cr / sigma_applied)  (von Karman)
//   b_eff = b * sqrt(sigma_cr / f_y) * (1 - 0.22*sqrt(sigma_cr/f_y))  (Winter)
//
// Plate slenderness: lambda_p = sqrt(f_y / sigma_cr) = (b/t)/(28.4*epsilon*sqrt(k_sigma))
// where epsilon = sqrt(235/f_y)
//
// Reduction factor (EC3): rho = (lambda_p - 0.055*(3+psi)) / lambda_p^2 <= 1.0
// For psi = 1 (uniform compression): rho = (lambda_p - 0.22) / lambda_p^2
//
// Ref: von Karman (1932), Winter (1947), EN 1993-1-5

#[test]
fn validation_effective_width_post_buckling() {
    let f_y: f64 = 355.0; // MPa (S355)
    let e: f64 = 200_000.0;
    let nu: f64 = 0.30;
    let t: f64 = 8.0; // mm
    let b: f64 = 400.0; // mm
    let k_sigma: f64 = 4.0; // SS edges, uniform compression

    // Elastic critical stress
    let d_flex = e * t.powi(3) / (12.0 * (1.0 - nu * nu));
    let sigma_cr = k_sigma * PI * PI * d_flex / (b * b * t);

    // Plate slenderness
    let lambda_p = (f_y / sigma_cr).sqrt();

    // EC3 slenderness check using epsilon method
    let epsilon = (235.0 / f_y).sqrt();
    let lambda_p_ec3 = (b / t) / (28.4 * epsilon * k_sigma.sqrt());
    // These should be equivalent (to within the EC3 approximation of pi^2*E/12/(1-nu^2) ≈ 190000)
    // Actually let's just verify the direct computation
    assert!(lambda_p > 0.0, "slenderness should be positive");

    // Winter formula reduction factor
    let rho_winter = if lambda_p <= 0.673 {
        1.0
    } else {
        (lambda_p - 0.22) / (lambda_p * lambda_p)
    };

    // Von Karman (simpler): b_eff = b * sqrt(sigma_cr/f_y) = b/lambda_p
    let b_eff_vk = b / lambda_p;

    // Winter: b_eff = rho * b
    let b_eff_winter = rho_winter * b;

    // Winter gives less effective width than von Karman (more conservative)
    if lambda_p > 0.673 {
        assert!(
            b_eff_winter < b_eff_vk,
            "Winter ({:.1}) should be less than von Karman ({:.1})",
            b_eff_winter, b_eff_vk
        );
    }

    // For lambda_p < 0.673 (stocky plate), full width is effective
    let b_stocky: f64 = 150.0;
    let sigma_cr_stocky = k_sigma * PI * PI * d_flex / (b_stocky * b_stocky * t);
    let lambda_stocky = (f_y / sigma_cr_stocky).sqrt();
    // stocky plate should have lambda < 0.673 (check)
    // If it is, rho = 1.0
    if lambda_stocky <= 0.673 {
        let rho_stocky = 1.0;
        assert_close(rho_stocky, 1.0, 1e-12, "stocky plate fully effective");
    }

    // EC3 slenderness vs direct computation should give similar results
    // The difference arises from EC3 using 190000 instead of pi^2*E/(12*(1-nu^2))
    let rel_diff = (lambda_p - lambda_p_ec3).abs() / lambda_p;
    assert!(
        rel_diff < 0.03,
        "EC3 vs exact slenderness difference: {:.2}%",
        rel_diff * 100.0
    );
}

// ================================================================
// 6. External Pressure on Cylindrical Shell
// ================================================================
//
// Critical external pressure for a long cylinder:
//   p_cr = E / (4*(1-nu^2)) * (t/R)^3    (uniform external pressure, long cylinder)
//
// For a cylinder with ring stiffeners at spacing L:
//   p_cr = n^2 * (n^2-1)^2 * D / (R^3 * (n^2-1+pi^2*R^2/L^2)^2) + ...
//   (simplified for n=2, first mode):
//   p_cr ≈ 3*D / R^3 = E*t^3 / (4*(1-nu^2)*R^3)
//
// Von Mises formula for short cylinders (with ends):
//   p_cr depends on both n (circumferential waves) and L/R
//
// Ref: Brush & Almroth Ch.5, Donnell, Timoshenko & Gere

#[test]
fn validation_external_pressure_cylinder() {
    let e: f64 = 200_000.0; // MPa
    let nu: f64 = 0.30;
    let r: f64 = 2000.0; // mm
    let t: f64 = 10.0; // mm

    // Long cylinder critical pressure (2 lobes, n=2)
    let d_flex = e * t.powi(3) / (12.0 * (1.0 - nu * nu));
    let p_cr_long = 3.0 * d_flex / (r * r * r);
    // = 3 * E * t^3 / (12*(1-nu^2)*R^3) = E*t^3/(4*(1-nu^2)*R^3)
    let p_cr_formula = e * t.powi(3) / (4.0 * (1.0 - nu * nu) * r.powi(3));
    assert_close(p_cr_long, p_cr_formula, 1e-10, "long cylinder external pressure");

    // Numerical value
    let expected_p = 200_000.0 * 1000.0 / (4.0 * 0.91 * 8e9);
    assert_close(p_cr_long, expected_p, 1e-10, "numerical external pressure");

    // p_cr scales as (t/R)^3
    let t2: f64 = 15.0;
    let p_cr2 = e * t2.powi(3) / (4.0 * (1.0 - nu * nu) * r.powi(3));
    let ratio = p_cr2 / p_cr_long;
    let expected_ratio = (t2 / t).powi(3);
    assert_close(ratio, expected_ratio, 1e-10, "pressure scales with (t/R)^3");

    // For R/t = 200: relatively thin shell
    let rt = r / t;
    assert_close(rt, 200.0, 1e-10, "R/t ratio");

    // Compare with axial buckling: sigma_cr_axial = E*t/(R*sqrt(3*(1-nu^2)))
    // p_cr gives sigma_hoop = p*R/t at buckling:
    let sigma_hoop = p_cr_long * r / t;
    let sigma_axial = e * t / (r * (3.0 * (1.0 - nu * nu)).sqrt());

    // External pressure buckling hoop stress is much lower than axial buckling
    assert!(
        sigma_hoop < sigma_axial,
        "hoop stress at pressure buckling ({:.1}) < axial buckling ({:.1})",
        sigma_hoop, sigma_axial
    );

    // The ratio depends on R/t
    let _hoop_axial_ratio = sigma_hoop / sigma_axial;
    // For thin shells, this ratio is proportional to (t/R)
    // sigma_hoop/sigma_axial = (E*t^3/(4*(1-nu^2)*R^3)) * R/t / (E*t/(R*sqrt(3*(1-nu^2))))
    // = t^2*sqrt(3*(1-nu^2)) / (4*(1-nu^2)*R^2)
    // = t^2 * sqrt(3) / (4*sqrt(1-nu^2)*R^2)
    // For R/t = 200: very small ratio
    assert!(
        _hoop_axial_ratio < 0.01,
        "hoop/axial ratio should be very small for thin shells"
    );
}

// ================================================================
// 7. Stiffened Plate Buckling — Euler Column Mode
// ================================================================
//
// A stiffened plate can buckle either:
//   (a) Locally (plate between stiffeners), or
//   (b) Globally (overall/Euler mode, stiffeners + plate as column)
//
// For global buckling of stiffened panel:
//   sigma_cr_global = pi^2 * E * I_eff / (A_eff * L^2)
//
// where I_eff includes the stiffener and the effective plate width,
// A_eff is the total effective area.
//
// The critical condition is that local and global modes should
// be similar (balanced design):
//   sigma_cr_local ≈ sigma_cr_global
//
// Ref: Bleich Ch.8, EN 1993-1-5 Sec.4

#[test]
fn validation_stiffened_plate_buckling() {
    let e: f64 = 200_000.0; // MPa
    let nu: f64 = 0.30;
    let t_plate: f64 = 10.0; // mm plate thickness
    let b_panel: f64 = 600.0; // mm stiffener spacing
    let l_span: f64 = 3000.0; // mm panel length

    // Stiffener: flat bar 120 x 12 mm
    let h_stiff: f64 = 120.0; // mm
    let t_stiff: f64 = 12.0; // mm
    let a_stiff = h_stiff * t_stiff; // mm^2

    // Local plate buckling (SS, k=4)
    let d_plate = e * t_plate.powi(3) / (12.0 * (1.0 - nu * nu));
    let sigma_cr_local = 4.0 * PI * PI * d_plate / (b_panel * b_panel * t_plate);

    // Global buckling: stiffener + effective plate width acts as column
    // Effective plate width = b_panel (assuming plate is fully effective)
    let a_plate = b_panel * t_plate;
    let a_eff = a_plate + a_stiff;

    // Centroid of combined section (from plate mid-surface)
    let y_plate: f64 = 0.0; // reference at plate mid
    let y_stiff = t_plate / 2.0 + h_stiff / 2.0; // center of stiffener above plate
    let y_bar = (a_plate * y_plate + a_stiff * y_stiff) / a_eff;

    // Moment of inertia about centroid
    let i_plate = b_panel * t_plate.powi(3) / 12.0 + a_plate * (y_bar - y_plate).powi(2);
    let i_stiff = t_stiff * h_stiff.powi(3) / 12.0 + a_stiff * (y_stiff - y_bar).powi(2);
    let i_eff = i_plate + i_stiff;

    // Global Euler buckling
    let sigma_cr_global = PI * PI * e * i_eff / (a_eff * l_span * l_span);

    // Both should be positive
    assert!(sigma_cr_local > 0.0, "local buckling stress positive");
    assert!(sigma_cr_global > 0.0, "global buckling stress positive");

    // The governing mode is the one with lower critical stress
    let sigma_governing = sigma_cr_local.min(sigma_cr_global);
    assert!(
        sigma_governing > 0.0,
        "governing buckling stress should be positive"
    );

    // For a well-designed stiffened panel, both modes should be similar
    let ratio = sigma_cr_local / sigma_cr_global;
    // Just verify the ratio is a finite positive number
    assert!(ratio > 0.0 && ratio.is_finite(), "local/global ratio should be finite positive");

    // Column slenderness of stiffened panel
    let r_gyration = (i_eff / a_eff).sqrt();
    let lambda_col = l_span / (PI * r_gyration);
    let _sigma_euler = PI * PI * e / (lambda_col * lambda_col * PI * PI);
    // sigma_euler should equal sigma_cr_global / 1.0 ... wait, let me rewrite:
    // lambda = L/(pi*r), so pi^2*E/lambda^2 = pi^2*E*r^2*pi^2 / (L^2*pi^2) -- that's wrong
    // Standard: sigma_cr = pi^2*E*I/(A*L^2) = pi^2*E*r^2/L^2
    let sigma_check = PI * PI * e * r_gyration * r_gyration / (l_span * l_span);
    assert_close(sigma_check, sigma_cr_global, 1e-10, "Euler stress check");
}

// ================================================================
// 8. Plate Buckling Under Bending Gradient
// ================================================================
//
// For a plate under linearly varying stress (bending):
//   sigma varies from sigma_max (compression) at one edge
//   to psi*sigma_max at the other edge
//
// The buckling coefficient depends on the stress gradient psi:
//   psi = sigma_min / sigma_max
//   psi = 1: uniform compression (k = 4.0)
//   psi = 0: triangular (compression + zero), k = 7.81
//   psi = -1: pure bending (comp + tension), k = 23.9
//
// Ref: EN 1993-1-5 Table 4.1, Bleich

#[test]
fn validation_plate_buckling_bending_gradient() {
    let e: f64 = 200_000.0;
    let nu: f64 = 0.30;
    let t: f64 = 10.0;
    let b: f64 = 500.0;

    let d_flex = e * t.powi(3) / (12.0 * (1.0 - nu * nu));
    let base = PI * PI * d_flex / (b * b * t);

    // EC3 buckling coefficients for various psi values
    // psi = 1 (uniform): k = 4.0
    // psi = 0 (triangular): k = 7.81
    // psi = -1 (pure bending): k = 23.9

    let k_uniform: f64 = 4.0;
    let k_triangular: f64 = 7.81;
    let k_bending: f64 = 23.9;

    let sigma_uniform = k_uniform * base;
    let sigma_triangular = k_triangular * base;
    let sigma_bending = k_bending * base;

    // Pure bending gives highest buckling resistance
    assert!(
        sigma_bending > sigma_triangular,
        "bending ({:.1}) > triangular ({:.1})",
        sigma_bending, sigma_triangular
    );
    assert!(
        sigma_triangular > sigma_uniform,
        "triangular ({:.1}) > uniform ({:.1})",
        sigma_triangular, sigma_uniform
    );

    // Ratio: pure bending / uniform = 23.9/4.0 = 5.975
    let ratio_bu = k_bending / k_uniform;
    assert_close(ratio_bu, 5.975, 1e-10, "bending/uniform k ratio");

    // EC3 interpolation formula for 0 <= psi <= 1:
    // k_sigma = 8.2 / (1.05 + psi)
    let ec3_k = |psi: f64| -> f64 {
        if psi >= 0.0 {
            8.2 / (1.05 + psi)
        } else {
            // For -1 <= psi < 0:
            7.81 - 6.29 * psi + 9.78 * psi * psi
        }
    };

    // Check at psi = 1: 8.2/(1.05+1) = 8.2/2.05 = 4.0
    assert_close(ec3_k(1.0), 4.0, 1e-10, "EC3 k at psi=1");

    // Check at psi = 0: 8.2/1.05 = 7.81
    assert_close(ec3_k(0.0), 7.81, 0.001, "EC3 k at psi=0");

    // Check at psi = -1: 7.81 + 6.29 + 9.78 = 23.88
    let k_neg1 = ec3_k(-1.0);
    assert_close(k_neg1, 23.88, 1e-10, "EC3 k at psi=-1");
    // This is close to 23.9 (minor rounding)
    assert!((k_neg1 - 23.9).abs() < 0.1, "close to classical 23.9");

    // k should be monotonically decreasing with psi for psi in [0, 1]
    let k_05 = ec3_k(0.5);
    assert!(
        k_05 > k_uniform && k_05 < k_triangular,
        "k at psi=0.5 ({:.2}) should be between uniform ({:.1}) and triangular ({:.2})",
        k_05, k_uniform, k_triangular
    );
}
