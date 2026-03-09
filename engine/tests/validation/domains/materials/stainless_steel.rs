/// Validation: Stainless Steel Structural Design
///
/// References:
///   - EN 1993-1-4: Design of Steel Structures — Stainless Steel
///   - SCI/BSCA: Design Manual for Structural Stainless Steel (4th ed., 2017)
///   - AISC Design Guide 27: Structural Stainless Steel (2013)
///   - Ramberg & Osgood (1943): Stress-strain relationship
///   - Gardner & Nethercot: "Experiments on Stainless Steel Hollow Sections" (2004)
///   - Arrayago, Real & Gardner: "Description of stress-strain curves for stainless steel" (2015)
///
/// Tests verify Ramberg-Osgood model, section classification,
/// member design, and CSM (Continuous Strength Method).

// ================================================================
// 1. Ramberg-Osgood Stress-Strain Curve
// ================================================================
//
// ε = σ/E + 0.002*(σ/σ_0.2)^n
// n = ln(20) / ln(σ_0.2 / σ_0.01)
// σ_0.2 = 0.2% proof stress (equivalent to yield)

#[test]
fn stainless_ramberg_osgood() {
    let e: f64 = 200_000.0;    // MPa, Young's modulus
    let sigma_02: f64 = 210.0; // MPa, 0.2% proof stress (austenitic 1.4301)
    let n: f64 = 7.0;          // Ramberg-Osgood exponent (typical austenitic)

    // Strain at proof stress
    let eps_at_02: f64 = sigma_02 / e + 0.002 * (sigma_02 / sigma_02).powf(n);
    // = 210/200000 + 0.002 * 1 = 0.00105 + 0.002 = 0.00305

    // Total strain = elastic + plastic offset
    let eps_elastic: f64 = sigma_02 / e;
    let eps_plastic: f64 = 0.002; // by definition at σ_0.2

    assert!(
        (eps_at_02 - (eps_elastic + eps_plastic)).abs() < 0.0001,
        "ε at σ_0.2: {:.5} = {:.5} + {:.5}", eps_at_02, eps_elastic, eps_plastic
    );

    // At 50% of proof stress: mostly elastic
    let sigma_half: f64 = 0.5 * sigma_02;
    let ratio_half: f64 = sigma_half / sigma_02;
    let eps_half: f64 = sigma_half / e + 0.002 * ratio_half.powf(n);

    let eps_elastic_half: f64 = sigma_half / e;
    let plastic_fraction: f64 = (eps_half - eps_elastic_half) / eps_half;

    assert!(
        plastic_fraction < 0.05,
        "At 50% σ_0.2: plastic fraction = {:.4} — small", plastic_fraction
    );

    // At 80% of proof stress: noticeable nonlinearity
    let sigma_80: f64 = 0.8 * sigma_02;
    let ratio_80: f64 = sigma_80 / sigma_02;
    let eps_80: f64 = sigma_80 / e + 0.002 * ratio_80.powf(n);
    let secant_mod: f64 = sigma_80 / eps_80;

    assert!(
        secant_mod < e,
        "Secant modulus at 0.8σ_0.2: {:.0} < E = {:.0} MPa", secant_mod, e
    );
}

// ================================================================
// 2. Stainless vs Carbon Steel Properties
// ================================================================
//
// Key differences:
// - Lower proportional limit (earlier yielding)
// - Higher strain hardening (σ_u/σ_0.2 ≈ 1.5-2.0 vs 1.1-1.2)
// - No distinct yield plateau
// - Higher ductility (εu ≈ 40-60%)

#[test]
fn stainless_property_comparison() {
    // Austenitic 1.4301 (304)
    let _e_ss: f64 = 200_000.0;
    let sigma_02_ss: f64 = 210.0;
    let sigma_u_ss: f64 = 520.0;
    let eps_u_ss: f64 = 0.45;  // 45% uniform elongation

    // Carbon steel S355
    let _e_cs: f64 = 210_000.0;
    let fy_cs: f64 = 355.0;
    let fu_cs: f64 = 470.0;
    let eps_u_cs: f64 = 0.15;  // 15% uniform elongation

    // Strain hardening ratio
    let sh_ratio_ss: f64 = sigma_u_ss / sigma_02_ss; // ≈ 2.48
    let sh_ratio_cs: f64 = fu_cs / fy_cs;             // ≈ 1.32

    assert!(
        sh_ratio_ss > sh_ratio_cs,
        "SS strain hardening {:.2} > CS {:.2}", sh_ratio_ss, sh_ratio_cs
    );

    // Ductility
    assert!(
        eps_u_ss > eps_u_cs * 2.0,
        "SS ductility {:.0}% > 2× CS {:.0}%", eps_u_ss * 100.0, eps_u_cs * 100.0
    );

    // Lower proof stress
    assert!(
        sigma_02_ss < fy_cs,
        "SS σ_0.2 = {:.0} < CS f_y = {:.0} MPa", sigma_02_ss, fy_cs
    );
}

// ================================================================
// 3. Section Classification — EN 1993-1-4
// ================================================================
//
// Similar to EN 1993-1-1 but with modified ε:
// ε = sqrt(235/σ_0.2) * sqrt(E/210000)
// Different b/t limits for each class.

#[test]
fn stainless_section_classification() {
    let sigma_02: f64 = 210.0; // MPa
    let e: f64 = 200_000.0;    // MPa

    // Modified epsilon
    let epsilon: f64 = (235.0 / sigma_02).sqrt() * (e / 210_000.0).sqrt();
    // = 1.058 * 0.976 = 1.033

    // For carbon steel (ε = sqrt(235/fy)):
    let cs_ratio: f64 = 235.0 / 355.0;
    let epsilon_cs: f64 = cs_ratio.sqrt(); // = 0.814

    // Stainless steel has higher epsilon → more favorable classification
    assert!(
        epsilon > epsilon_cs,
        "SS ε = {:.3} > CS ε = {:.3}", epsilon, epsilon_cs
    );

    // Class 1 limit for outstand flange: c/t ≤ 9ε
    let class1_limit: f64 = 9.0 * epsilon;
    let class1_limit_cs: f64 = 9.0 * epsilon_cs;

    assert!(
        class1_limit > class1_limit_cs,
        "SS Class 1 c/t ≤ {:.1} > CS c/t ≤ {:.1}",
        class1_limit, class1_limit_cs
    );

    // Class 3 limit for internal element: c/t ≤ 42ε
    let class3_internal: f64 = 42.0 * epsilon;
    assert!(
        class3_internal > 40.0,
        "Class 3 internal: c/t ≤ {:.1}", class3_internal
    );
}

// ================================================================
// 4. Continuous Strength Method (CSM)
// ================================================================
//
// CSM uses a base curve to determine cross-section deformation capacity:
// ε_csm / ε_y = f(λ̄_p)
// For λ̄_p ≤ 0.68: ε_csm/ε_y = min(15, 0.25/λ̄_p^3.6 + ... )
// Allows use of strain hardening for non-slender sections.

#[test]
fn stainless_csm_capacity() {
    let sigma_02: f64 = 210.0;
    let sigma_u: f64 = 520.0;
    let e: f64 = 200_000.0;
    let eps_y: f64 = sigma_02 / e;

    // Cross-section slenderness
    let lambda_p: f64 = 0.40; // non-slender section

    // CSM deformation capacity
    let eps_ratio: f64 = if lambda_p <= 0.68 {
        let ratio_val: f64 = 0.25 / lambda_p.powf(3.6);
        ratio_val.min(15.0)
    } else {
        // Slender: no strain hardening benefit
        1.0
    };

    let eps_csm: f64 = eps_ratio * eps_y;

    // Strain hardening slope: Esh = (σu - σ0.2) / (0.16*εu - εy) approximately
    let eps_u: f64 = 0.45;
    let esh: f64 = (sigma_u - sigma_02) / (0.16 * eps_u - eps_y);

    // CSM stress
    let sigma_csm: f64 = sigma_02 + esh * (eps_csm - eps_y);
    // Should be > σ_0.2 (strain hardening benefit)

    assert!(
        sigma_csm > sigma_02,
        "CSM stress {:.0} > proof stress {:.0} MPa", sigma_csm, sigma_02
    );

    // CSM moment capacity = σ_csm * W_el (conservative)
    // Actual: M_csm = W_pl * σ_0.2 + W_el * E_sh * (ε_csm - ε_y)
    let benefit: f64 = (sigma_csm - sigma_02) / sigma_02;
    assert!(
        benefit > 0.05,
        "CSM benefit: {:.1}% increase over proof stress", benefit * 100.0
    );
}

// ================================================================
// 5. Lateral-Torsional Buckling — EN 1993-1-4
// ================================================================
//
// Same approach as EN 1993-1-1 but with modified imperfection factor.
// α_LT = 0.76 (more conservative than carbon steel α_LT = 0.34-0.76)
// due to lower proportional limit.

#[test]
fn stainless_ltb() {
    let sigma_02: f64 = 210.0;

    // Non-dimensional slenderness
    let lambda_lt: f64 = 1.0; // intermediate

    // Imperfection factor (EN 1993-1-4)
    let alpha_lt: f64 = 0.76; // for hollow sections

    // Reduction factor
    let phi: f64 = 0.5 * (1.0 + alpha_lt * (lambda_lt - 0.4) + lambda_lt * lambda_lt);
    let chi_lt: f64 = 1.0 / (phi + (phi * phi - lambda_lt * lambda_lt).sqrt());
    let chi_lt: f64 = chi_lt.min(1.0);

    assert!(
        chi_lt > 0.0 && chi_lt <= 1.0,
        "χ_LT = {:.3} at λ̄_LT = {:.1}", chi_lt, lambda_lt
    );

    // Design moment
    let wpl: f64 = 500_000.0; // mm³, plastic section modulus
    let mb_rd: f64 = chi_lt * wpl * sigma_02 / 1e6 / 1.10; // kN·m

    assert!(
        mb_rd > 0.0,
        "LTB resistance: {:.1} kN·m", mb_rd
    );

    // Carbon steel comparison: lower imperfection factor → higher chi
    let alpha_cs: f64 = 0.34; // curve a for hot-rolled I
    let phi_cs: f64 = 0.5 * (1.0 + alpha_cs * (lambda_lt - 0.2) + lambda_lt * lambda_lt);
    let chi_cs: f64 = (1.0 / (phi_cs + (phi_cs * phi_cs - lambda_lt * lambda_lt).sqrt())).min(1.0);

    assert!(
        chi_cs > chi_lt,
        "CS χ_LT = {:.3} > SS χ_LT = {:.3}", chi_cs, chi_lt
    );
}

// ================================================================
// 6. Duplex Stainless Steel Properties
// ================================================================
//
// Duplex (1.4462): higher strength than austenitic
// σ_0.2 ≈ 450 MPa, σ_u ≈ 650 MPa
// Lower strain hardening ratio, lower ductility than austenitic

#[test]
fn stainless_duplex() {
    // Duplex 1.4462 (2205)
    let sigma_02_duplex: f64 = 450.0;
    let sigma_u_duplex: f64 = 650.0;
    let n_duplex: f64 = 9.0; // higher n → less pronounced nonlinearity

    // Austenitic 1.4301 (304)
    let sigma_02_aust: f64 = 210.0;
    let _sigma_u_aust: f64 = 520.0;
    let _n_aust: f64 = 7.0;

    // Duplex has higher proof stress
    assert!(
        sigma_02_duplex > sigma_02_aust * 2.0,
        "Duplex σ_0.2 = {:.0} > 2× austenitic {:.0} MPa",
        sigma_02_duplex, sigma_02_aust
    );

    // Lower strain hardening ratio
    let sh_duplex: f64 = sigma_u_duplex / sigma_02_duplex; // ≈ 1.44
    let sh_aust: f64 = 520.0 / sigma_02_aust;              // ≈ 2.48

    assert!(
        sh_duplex < sh_aust,
        "Duplex SH {:.2} < austenitic SH {:.2}", sh_duplex, sh_aust
    );

    // Higher n means more linear behavior (closer to elastic-perfectly-plastic)
    assert!(
        n_duplex > _n_aust,
        "Duplex n = {:.0} > austenitic n = {:.0}", n_duplex, _n_aust
    );

    // Cost benefit: higher strength → less material
    let weight_ratio: f64 = sigma_02_aust / sigma_02_duplex;
    assert!(
        weight_ratio < 0.5,
        "Duplex needs {:.0}% of austenitic thickness", weight_ratio * 100.0
    );
}

// ================================================================
// 7. Fire Design — EN 1993-1-2 / EN 1993-1-4
// ================================================================
//
// Stainless steel retains strength better at high temperatures.
// At 600°C: SS retains ~40% of σ_0.2 vs CS retains ~47% of fy
// But SS has higher emissivity → heats faster

#[test]
fn stainless_fire_resistance() {
    // Retention factors at various temperatures (kσ,θ = σ_0.2,θ / σ_0.2)
    let temps: [f64; 4] = [400.0, 500.0, 600.0, 700.0]; // °C

    // Austenitic SS (1.4301)
    let k_ss: [f64; 4] = [0.78, 0.60, 0.40, 0.22];

    // Carbon steel (S355)
    let k_cs: [f64; 4] = [1.0, 0.78, 0.47, 0.23];

    // At 600°C: CS retains more relatively
    assert!(
        k_cs[2] > k_ss[2],
        "At 600°C: CS retains {:.0}% vs SS {:.0}%",
        k_cs[2] * 100.0, k_ss[2] * 100.0
    );

    // But stainless starts with lower σ_0.2, so absolute comparison:
    let sigma_02_ss: f64 = 210.0;
    let fy_cs: f64 = 355.0;

    let sigma_600_ss: f64 = k_ss[2] * sigma_02_ss;
    let sigma_600_cs: f64 = k_cs[2] * fy_cs;

    assert!(
        sigma_600_cs > sigma_600_ss,
        "At 600°C: CS {:.0} > SS {:.0} MPa", sigma_600_cs, sigma_600_ss
    );

    // Monotonically decreasing retention
    for i in 1..4 {
        assert!(
            k_ss[i] < k_ss[i - 1],
            "SS retention decreases: k({:.0}) < k({:.0})",
            temps[i], temps[i - 1]
        );
    }
}

// ================================================================
// 8. Deflection — Secant Modulus Approach
// ================================================================
//
// For serviceability: use secant modulus to account for nonlinearity.
// E_s = σ / ε = σ / (σ/E + 0.002*(σ/σ_0.2)^n)
// At service stress (60% of σ_0.2): E_s ≈ 0.95*E

#[test]
fn stainless_deflection_secant() {
    let e: f64 = 200_000.0;
    let sigma_02: f64 = 210.0;
    let n: f64 = 7.0;

    // At service stress: 60% of proof stress
    let sigma_sls: f64 = 0.6 * sigma_02; // = 126 MPa

    let ratio: f64 = sigma_sls / sigma_02;
    let eps: f64 = sigma_sls / e + 0.002 * ratio.powf(n);
    let e_secant: f64 = sigma_sls / eps;

    // Secant modulus reduction
    let reduction: f64 = e_secant / e;
    assert!(
        reduction > 0.90 && reduction < 1.0,
        "E_secant/E = {:.4} at 0.6*σ_0.2", reduction
    );

    // At 80% of proof stress
    let sigma_80: f64 = 0.8 * sigma_02;
    let ratio_80: f64 = sigma_80 / sigma_02;
    let eps_80: f64 = sigma_80 / e + 0.002 * ratio_80.powf(n);
    let e_secant_80: f64 = sigma_80 / eps_80;

    // Higher stress → lower secant modulus
    assert!(
        e_secant_80 < e_secant,
        "E_s(0.8σ) = {:.0} < E_s(0.6σ) = {:.0} MPa", e_secant_80, e_secant
    );

    // Deflection increase factor = E / E_secant
    let defl_factor_60: f64 = e / e_secant;
    let defl_factor_80: f64 = e / e_secant_80;

    assert!(
        defl_factor_80 > defl_factor_60,
        "Deflection factor: {:.3} (80%) > {:.3} (60%)", defl_factor_80, defl_factor_60
    );
}
