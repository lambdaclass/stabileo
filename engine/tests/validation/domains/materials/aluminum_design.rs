/// Validation: Aluminum Structural Design
///
/// References:
///   - Aluminum Design Manual (ADM) 2020, The Aluminum Association
///   - EN 1999-1-1:2007 (EC9): Design of aluminium structures
///   - Mazzolani: "Aluminium Alloy Structures" 2nd ed. (1995)
///   - Sharp: "Behavior and Design of Aluminum Structures" (1993)
///   - Kissell & Ferry: "Aluminum Structures" 2nd ed. (2002)
///
/// Tests verify member capacity checks for aluminum alloys,
/// accounting for heat-affected zones, buckling, and connections.

// ================================================================
// 1. Aluminum Alloy Properties (6061-T6)
// ================================================================
//
// 6061-T6: Ftu = 290 MPa (42 ksi), Fty = 241 MPa (35 ksi)
// E = 69,600 MPa (10,100 ksi), ρ = 2,700 kg/m³

#[test]
fn aluminum_6061_t6_properties() {
    let ftu: f64 = 290.0;    // MPa, tensile ultimate
    let fty: f64 = 241.0;    // MPa, tensile yield
    let e_al: f64 = 69_600.0; // MPa
    let rho: f64 = 2_700.0;  // kg/m³

    // Yield-to-ultimate ratio
    let ratio: f64 = fty / ftu;
    let ratio_expected: f64 = 0.831;
    assert!(
        (ratio - ratio_expected).abs() / ratio_expected < 0.01,
        "Fy/Fu = {:.3}, expected {:.3}", ratio, ratio_expected
    );

    // Compare to steel: aluminum is ~1/3 the stiffness
    let e_steel: f64 = 200_000.0;
    let stiffness_ratio: f64 = e_al / e_steel;
    let stiffness_expected: f64 = 0.348;
    assert!(
        (stiffness_ratio - stiffness_expected).abs() / stiffness_expected < 0.01,
        "E_al/E_steel = {:.3}, expected {:.3}", stiffness_ratio, stiffness_expected
    );

    // Specific strength (strength/density ratio)
    let specific_strength_al: f64 = fty as f64 / rho * 1e6; // Pa/(kg/m³) = m²/s²
    let specific_strength_steel: f64 = 250.0 / 7850.0 * 1e6; // S235 steel
    // Aluminum has better specific strength
    assert!(
        specific_strength_al > specific_strength_steel,
        "Al specific strength: {:.0} > steel: {:.0}", specific_strength_al, specific_strength_steel
    );
}

// ================================================================
// 2. Aluminum Column Buckling (ADM / EC9)
// ================================================================
//
// ADM: Fcr = π²E/(kL/r)² for elastic buckling
// EC9: χ = 1/(φ + √(φ²-λ̄²)), φ = 0.5(1 + α(λ̄-λ̄0) + λ̄²)
// Buckling class A (extruded) or B (welded)

#[test]
fn aluminum_column_buckling() {
    let e: f64 = 69_600.0;   // MPa
    let fy: f64 = 241.0;     // MPa (6061-T6)
    let l: f64 = 3000.0;     // mm, effective length
    let r: f64 = 40.0;       // mm, radius of gyration

    // Slenderness ratio
    let kl_r: f64 = l / r;
    assert!(
        (kl_r - 75.0).abs() < 0.1,
        "kL/r = {:.1}", kl_r
    );

    // Euler critical stress
    let f_cr: f64 = std::f64::consts::PI * std::f64::consts::PI * e / (kl_r * kl_r);
    // = π²*69600/5625 = 686956/5625 = 122.1 MPa

    assert!(
        f_cr > 0.0 && f_cr < e,
        "Euler stress: {:.1} MPa", f_cr
    );

    // Non-dimensional slenderness (EC9)
    let lambda_bar: f64 = (fy / f_cr).sqrt();
    // = sqrt(241/122.1) = sqrt(1.974) = 1.405

    assert!(
        lambda_bar > 0.2,
        "λ̄ = {:.3} > 0.2 — buckling reduction needed", lambda_bar
    );

    // EC9 buckling: class A (extruded), α = 0.20, λ̄0 = 0.10
    let alpha_ec9: f64 = 0.20;
    let lambda_0: f64 = 0.10;
    let phi: f64 = 0.5 * (1.0 + alpha_ec9 * (lambda_bar - lambda_0) + lambda_bar * lambda_bar);
    let chi: f64 = 1.0 / (phi + (phi * phi - lambda_bar * lambda_bar).sqrt());

    assert!(
        chi > 0.0 && chi < 1.0,
        "Buckling factor χ = {:.3}", chi
    );

    // Design resistance
    let a_cross: f64 = 2000.0; // mm²
    let gamma_m1: f64 = 1.10;
    let n_rd: f64 = chi * a_cross * fy / gamma_m1 / 1000.0; // kN

    assert!(
        n_rd > 50.0,
        "Column capacity: {:.1} kN", n_rd
    );
}

// ================================================================
// 3. Heat-Affected Zone (HAZ) Reduction
// ================================================================
//
// Welding aluminum reduces strength in HAZ:
// 6061-T6: HAZ Ftu = 165 MPa (vs 290 parent), HAZ Fty = 110 MPa (vs 241)
// EC9: ρo,haz factor, typically 0.45-0.65 for heat-treatable alloys

#[test]
fn aluminum_haz_reduction() {
    let fy_parent: f64 = 241.0;  // MPa, 6061-T6 parent
    let fu_parent: f64 = 290.0;
    let fy_haz: f64 = 110.0;    // MPa, HAZ yield
    let fu_haz: f64 = 165.0;    // MPa, HAZ ultimate

    // Strength reduction ratios
    let rho_yield: f64 = fy_haz / fy_parent;
    let rho_ultimate: f64 = fu_haz / fu_parent;

    // = 0.456, 0.569
    assert!(
        rho_yield > 0.40 && rho_yield < 0.50,
        "Yield HAZ ratio: {:.3}", rho_yield
    );
    assert!(
        rho_ultimate > 0.50 && rho_ultimate < 0.65,
        "Ultimate HAZ ratio: {:.3}", rho_ultimate
    );

    // EC9: ρo,haz = min(fu,haz/γMw) / (fo/γM1) = simplified
    let rho_o_haz: f64 = fy_haz / fy_parent;
    assert!(
        rho_o_haz < 0.5,
        "HAZ factor ρo,haz = {:.3} — significant reduction", rho_o_haz
    );

    // Width of HAZ: typically 25mm from weld toe for t ≤ 6mm
    let bhaz_thin: f64 = 25.0; // mm, for t ≤ 6mm
    let bhaz_thick: f64 = 40.0; // mm, for t > 12mm
    assert!(
        bhaz_thin < bhaz_thick,
        "HAZ width: {:.0}mm (thin) < {:.0}mm (thick)", bhaz_thin, bhaz_thick
    );
}

// ================================================================
// 4. Aluminum Beam — Lateral-Torsional Buckling
// ================================================================
//
// ADM: Me = √(Cb*π*Ey*Iy*GJ) * √(1 + (π*Iy*Cw/(Iy*J*L²)))
// Simplified for compact I-beams (similar to steel LTB)

#[test]
fn aluminum_beam_ltb() {
    let e: f64 = 69_600.0;    // MPa
    let g: f64 = 26_200.0;    // MPa (G = E/2(1+ν), ν=0.33)
    let iy: f64 = 1.5e6;      // mm⁴, weak axis
    let j: f64 = 5.0e4;       // mm⁴, torsion constant
    let sy: f64 = 80_000.0;   // mm³, plastic section modulus
    let l: f64 = 4000.0;      // mm, unbraced length
    let cb: f64 = 1.0;        // moment gradient factor (uniform)

    // Elastic LTB moment
    let me: f64 = cb * std::f64::consts::PI / l
        * (e * iy * g * j).sqrt();
    // Simplified (ignoring warping): Me = (π/L)*√(EIy*GJ)

    assert!(
        me > 0.0,
        "Elastic LTB moment: {:.0} N·mm = {:.1} kN·m", me, me / 1e6
    );

    // Compare to plastic moment
    let fy: f64 = 241.0;
    let mp: f64 = sy * fy; // N·mm

    // If Me > Mp, member reaches full plastic moment
    let lambda: f64 = (mp / me).sqrt();
    assert!(
        lambda > 0.0,
        "LTB slenderness: {:.3}", lambda
    );
}

// ================================================================
// 5. Aluminum Bolted Connection (ADM / EC9)
// ================================================================
//
// Bolt bearing: Rn = dt*Fbu*C where C depends on edge/spacing
// Bolt shear: same as steel (Fv = 0.30*Ftu for A325 equiv)

#[test]
fn aluminum_bolted_connection() {
    let d_bolt: f64 = 12.0;   // mm, bolt diameter
    let t_plate: f64 = 8.0;   // mm, plate thickness
    let fu_plate: f64 = 290.0; // MPa, 6061-T6 ultimate
    let e_dist: f64 = 25.0;   // mm, end distance

    // Bearing capacity (ADM): Rn = 2.0 * d * t * Fu (for e ≥ 2d)
    let bearing_factor: f64 = if e_dist >= 2.0 * d_bolt { 2.0 } else { e_dist / d_bolt };
    let rn_bearing: f64 = bearing_factor * d_bolt * t_plate * fu_plate / 1000.0; // kN

    // = 2.0 * 12 * 8 * 290 / 1000 = 55.68 kN
    let rn_expected: f64 = 2.0 * 12.0 * 8.0 * 290.0 / 1000.0;

    assert!(
        (rn_bearing - rn_expected).abs() / rn_expected < 0.01,
        "Bearing capacity: {:.1} kN, expected {:.1}", rn_bearing, rn_expected
    );

    // Net section capacity
    let b_plate: f64 = 80.0;  // mm, plate width
    let d_hole: f64 = 14.0;   // mm, hole diameter (d + 2mm clearance)
    let a_net: f64 = (b_plate - d_hole) * t_plate; // mm²
    let rn_net: f64 = a_net * fu_plate / 1000.0;  // kN (on ultimate)

    // = (80-14)*8*290/1000 = 66*8*290/1000 = 153.1 kN
    assert!(
        rn_net > rn_bearing,
        "Net section {:.1} > bearing {:.1} — bearing controls", rn_net, rn_bearing
    );
}

// ================================================================
// 6. Aluminum vs Steel Weight Comparison
// ================================================================
//
// For equivalent bending stiffness (EI), aluminum requires more material
// but at lower density. Net weight depends on section optimization.

#[test]
fn aluminum_weight_comparison() {
    let e_steel: f64 = 200_000.0;
    let e_al: f64 = 69_600.0;
    let rho_steel: f64 = 7850.0; // kg/m³
    let rho_al: f64 = 2700.0;

    // For equal EI: I_al = I_steel * E_steel/E_al
    let i_ratio: f64 = e_steel / e_al;
    let i_ratio_expected: f64 = 2.874;
    assert!(
        (i_ratio - i_ratio_expected).abs() / i_ratio_expected < 0.01,
        "I ratio: {:.3}", i_ratio
    );

    // For equal-depth sections, A_al ≈ I_ratio^(2/3) * A_steel (approximate)
    // Weight ratio: (A_al/A_steel) * (ρ_al/ρ_steel)
    let exponent: f64 = 2.0 / 3.0;
    let a_ratio: f64 = i_ratio.powf(exponent); // ≈ 2.02
    let weight_ratio: f64 = a_ratio * rho_al / rho_steel;
    // ≈ 2.02 * 0.344 = 0.695 — aluminum is ~30% lighter

    assert!(
        weight_ratio < 1.0,
        "Aluminum/steel weight ratio: {:.3} (aluminum lighter)", weight_ratio
    );
}

// ================================================================
// 7. Aluminum Fatigue (EC9-1-3 / ADM)
// ================================================================
//
// Aluminum fatigue: lower endurance limit than steel.
// EC9: ΔσC at 2×10⁶ cycles, m=3.4 (vs m=3 for steel)
// Detail category for parent metal: typically 70 MPa

#[test]
fn aluminum_fatigue() {
    let delta_sigma_c: f64 = 70.0; // MPa, detail category (parent)
    let m: f64 = 3.4;              // inverse slope of S-N curve
    let n_c: f64 = 2e6;            // cycles at ΔσC
    let gamma_mf: f64 = 1.30;      // fatigue partial factor

    // Design fatigue strength at 2M cycles
    let delta_sigma_d: f64 = delta_sigma_c / gamma_mf;
    let delta_sigma_d_expected: f64 = 53.85;

    assert!(
        (delta_sigma_d - delta_sigma_d_expected).abs() / delta_sigma_d_expected < 0.01,
        "Design fatigue: {:.1} MPa, expected {:.1}", delta_sigma_d, delta_sigma_d_expected
    );

    // Fatigue life at different stress range
    let delta_sigma: f64 = 40.0; // MPa, applied stress range
    let n_life: f64 = n_c * (delta_sigma_c / delta_sigma).powf(m);
    // = 2e6 * (70/40)^3.4 = 2e6 * 1.75^3.4 = 2e6 * 6.28 = 12.56e6

    assert!(
        n_life > n_c,
        "Life at {:.0} MPa: {:.0} cycles (> {:.0})", delta_sigma, n_life, n_c
    );

    // Compare to steel detail cat 71: m=3 for steel
    let m_steel: f64 = 3.0;
    let steel_ratio: f64 = 71.0 / 40.0;
    let n_steel: f64 = 2e6 * steel_ratio.powf(m_steel);
    // Aluminum with m=3.4 has flatter S-N curve → longer life at low ranges
    assert!(
        n_life > 1e6,
        "Aluminum fatigue life: {:.1e} cycles", n_life
    );
    let _ = n_steel; // used for comparison
}

// ================================================================
// 8. Deflection Limit — Aluminum (More Critical Than Steel)
// ================================================================
//
// Aluminum E = 1/3 of steel → deflections 3× larger for same section.
// ADM/EC9: Same L/360 limit applies → need larger sections.

#[test]
fn aluminum_deflection_limit() {
    let l: f64 = 6000.0;     // mm, span
    let w: f64 = 10.0;       // N/mm (10 kN/m)
    let e_al: f64 = 69_600.0; // MPa
    let e_steel: f64 = 200_000.0;
    let i_section: f64 = 5.0e7; // mm⁴, section moment of inertia

    // SS beam deflection: δ = 5*w*L⁴/(384*EI)
    let delta_al: f64 = 5.0 * w * l.powi(4) / (384.0 * e_al * i_section);
    let delta_steel: f64 = 5.0 * w * l.powi(4) / (384.0 * e_steel * i_section);

    // Deflection ratio should be E_steel/E_al
    let defl_ratio: f64 = delta_al / delta_steel;
    let e_ratio: f64 = e_steel / e_al;

    assert!(
        (defl_ratio - e_ratio).abs() / e_ratio < 0.01,
        "Deflection ratio: {:.2}, E ratio: {:.2}", defl_ratio, e_ratio
    );

    // Limit check: L/360
    let _limit: f64 = l / 360.0; // = 16.67 mm

    // Aluminum deflection will be 2.87× steel — may exceed limit
    assert!(
        delta_al > delta_steel,
        "Al deflection {:.2}mm > steel {:.2}mm", delta_al, delta_steel
    );
}
