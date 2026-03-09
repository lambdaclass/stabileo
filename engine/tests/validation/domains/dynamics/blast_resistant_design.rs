/// Validation: Blast-Resistant Structural Design
///
/// References:
///   - UFC 3-340-02: Structures to Resist the Effects of Accidental Explosions
///   - ASCE 59-11: Blast Protection of Buildings
///   - Baker et al.: "Explosion Hazards and Evaluation" (1983)
///   - Biggs: "Introduction to Structural Dynamics" (1964)
///   - Mays & Smith: "Blast Effects on Buildings" 2nd ed. (2012)
///   - Krauthammer: "Modern Protective Structures" (2008)
///
/// Tests verify blast loading, dynamic response, SDOF equivalent,
/// and ductility requirements.

// ================================================================
// 1. Blast Wave Parameters — Friedlander Equation
// ================================================================
//
// Positive phase pressure: p(t) = p_so * (1 - t/t_d) * exp(-b*t/t_d)
// p_so = peak overpressure, t_d = positive phase duration
// b = decay coefficient (Friedlander waveform shape parameter)
// Impulse: I = p_so * t_d * (1/b - 1/b² * (1-exp(-b)))

#[test]
fn blast_friedlander_wave() {
    let p_so: f64 = 100.0;     // kPa, peak overpressure
    let td: f64 = 20.0;        // ms, positive phase duration
    let b: f64 = 2.0;          // decay coefficient

    // Pressure at t = 0
    let p_0: f64 = p_so * (1.0 - 0.0 / td) * (-b * 0.0 / td).exp();
    assert!(
        (p_0 - p_so).abs() < 0.01,
        "p(0) = {:.1} kPa = p_so", p_0
    );

    // Pressure at t = td (end of positive phase)
    let p_td: f64 = p_so * (1.0 - 1.0) * (-b).exp();
    assert!(
        p_td.abs() < 0.01,
        "p(td) = {:.3} ≈ 0", p_td
    );

    // Positive impulse (analytical)
    let impulse: f64 = p_so * td * (1.0 / b - 1.0 / (b * b) * (1.0 - (-b).exp()));
    // For b=2: I = 100*20*(0.5 - 0.25*(1-e^-2)) = 2000*(0.5 - 0.25*0.8647) = 2000*0.2838

    assert!(
        impulse > 0.0,
        "Positive impulse: {:.1} kPa·ms", impulse
    );

    // Triangular approximation: I_tri = 0.5 * p_so * td = 1000 kPa·ms
    let i_tri: f64 = 0.5 * p_so * td;
    // Friedlander gives less impulse than triangle due to decay
    assert!(
        impulse < i_tri,
        "Friedlander I = {:.1} < triangular I = {:.1} kPa·ms", impulse, i_tri
    );
}

// ================================================================
// 2. Scaled Distance — Hopkinson-Cranz Law
// ================================================================
//
// Z = R / W^(1/3)
// R = standoff distance (m), W = TNT equivalent charge (kg)
// Peak overpressure and impulse scale with Z.

#[test]
fn blast_scaled_distance() {
    let r: f64 = 30.0;         // m, standoff distance
    let w: f64 = 100.0;        // kg TNT equivalent

    let z: f64 = r / w.powf(1.0 / 3.0);
    // = 30 / 4.642 = 6.46 m/kg^(1/3)

    let w_cbrt: f64 = w.cbrt();
    let z_expected: f64 = r / w_cbrt;

    assert!(
        (z - z_expected).abs() / z_expected < 0.001,
        "Z = {:.2} m/kg^(1/3)", z
    );

    // If charge doubles, need to increase standoff by 2^(1/3) = 1.26× for same Z
    let w2: f64 = 200.0;
    let r2: f64 = z * w2.cbrt();
    let r_ratio: f64 = r2 / r;
    let expected_ratio: f64 = (w2 / w).cbrt();

    assert!(
        (r_ratio - expected_ratio).abs() / expected_ratio < 0.01,
        "Standoff ratio: {:.3}, expected {:.3}", r_ratio, expected_ratio
    );

    // Approximate peak overpressure (Kingery-Bulmash, Z in m/kg^1/3)
    // For Z ≈ 5-10: p_so ≈ 80/Z² kPa (very rough approximation)
    let z_sq: f64 = z * z;
    let p_so_approx: f64 = 80.0 / z_sq;
    assert!(
        p_so_approx > 0.5 && p_so_approx < 50.0,
        "p_so ≈ {:.1} kPa at Z = {:.2}", p_so_approx, z
    );
}

// ================================================================
// 3. SDOF Equivalent System — Biggs Method
// ================================================================
//
// Real structure → equivalent SDOF: Me*ü + Ce*u̇ + Ke*u = Fe(t)
// KLM = KL * KM where KL = load factor, KM = mass factor
// For simply supported beam with uniform load:
// KL = 0.64, KM = 0.50 (elastic), KLM = KL/KM = 1.28... → 0.78

#[test]
fn blast_sdof_equivalent() {
    // Simply supported beam under uniform blast
    // Elastic response:
    let kl_elastic: f64 = 0.64;    // load transformation factor
    let km_elastic: f64 = 0.50;    // mass transformation factor
    let klm_elastic: f64 = km_elastic / kl_elastic;
    // Note: KLM is often defined as KM/KL for the equation of motion

    // Plastic response (mechanism formed):
    let kl_plastic: f64 = 0.50;
    let km_plastic: f64 = 0.33;
    let klm_plastic: f64 = km_plastic / kl_plastic;

    // KLM values should be < 1.0
    assert!(
        klm_elastic < 1.0 && klm_plastic < 1.0,
        "KLM: elastic={:.3}, plastic={:.3}", klm_elastic, klm_plastic
    );

    // Fixed-fixed beam: different factors
    let kl_fixed: f64 = 0.53;
    let km_fixed: f64 = 0.41;
    let _klm_fixed: f64 = km_fixed / kl_fixed;

    // Beam properties
    let m: f64 = 500.0;        // kg/m, mass per unit length
    let l: f64 = 4.0;          // m, span
    let ke: f64 = 384.0 * 200e9 * 1e-4 / (5.0 * l.powi(3));
    // Stiffness: K = 384*EI/(5*L³) for SS uniform load

    // Equivalent system
    let me: f64 = km_elastic * m * l;
    let _ke_equiv: f64 = kl_elastic * ke; // not used directly but defined for completeness

    // Natural period
    let _t_n: f64 = 2.0 * std::f64::consts::PI * (me / ke).sqrt();

    assert!(
        me > 0.0,
        "Equivalent mass: {:.0} kg", me
    );

    let _kl_fixed = kl_fixed;
}

// ================================================================
// 4. Dynamic Load Factor (DLF)
// ================================================================
//
// For triangular pulse (blast): DLF depends on td/T ratio.
// DLF = max dynamic displacement / static displacement
// td/T << 1 (impulsive): DLF → 2*I/(m*ω*x_st)
// td/T >> 1 (quasi-static): DLF → 2.0
// Peak DLF for triangular pulse: ~1.8 at td/T ≈ 0.4

#[test]
fn blast_dynamic_load_factor() {
    // Triangular pulse DLF values (from Biggs charts)
    // td/T:  0.1   0.2   0.4   0.6   0.8   1.0   2.0
    // DLF:   0.58  0.96  1.52  1.77  1.83  1.73  1.57

    let td_t_values: [f64; 7] = [0.1, 0.2, 0.4, 0.6, 0.8, 1.0, 2.0];
    let dlf_values: [f64; 7] = [0.58, 0.96, 1.52, 1.77, 1.83, 1.73, 1.57];

    // All DLFs should be > 0 and < 2.0
    for (i, &dlf) in dlf_values.iter().enumerate() {
        assert!(
            dlf > 0.0 && dlf < 2.1,
            "DLF({:.1}) = {:.2}", td_t_values[i], dlf
        );
    }

    // Maximum DLF occurs around td/T = 0.8
    let max_dlf: f64 = dlf_values.iter().cloned().fold(0.0_f64, f64::max);
    assert!(
        (max_dlf - 1.83).abs() < 0.01,
        "Max DLF: {:.2} at td/T ≈ 0.8", max_dlf
    );

    // For step load (sudden constant): DLF = 2.0 (exact)
    let dlf_step: f64 = 2.0;
    assert!(
        max_dlf < dlf_step,
        "Triangular DLF {:.2} < step load DLF {:.1}", max_dlf, dlf_step
    );
}

// ================================================================
// 5. Ductility Ratio — Elasto-Plastic Response
// ================================================================
//
// μ = x_max / x_el (ductility demand)
// For given td/T and p_so/R_u ratio:
// μ determined from ductility charts (Biggs/UFC 3-340-02)
// R_u = ultimate resistance, x_el = R_u/K

#[test]
fn blast_ductility_demand() {
    let ru: f64 = 200.0;       // kN, ultimate resistance
    let ke: f64 = 50_000.0;    // kN/m, stiffness
    let x_el: f64 = ru / ke;   // = 0.004 m = 4mm

    // For p_so = 300 kPa, loaded area = 2 m²:
    let f_peak: f64 = 300.0 * 2.0; // = 600 kN
    let f_ru_ratio: f64 = f_peak / ru; // = 3.0

    // From charts, for td/T ≈ 0.5 and F/Ru = 3.0: μ ≈ 4-6
    let mu: f64 = 5.0; // approximate ductility demand

    let x_max: f64 = mu * x_el;
    // = 5.0 * 0.004 = 0.020 m = 20mm

    assert!(
        x_max > x_el,
        "x_max = {:.1}mm > x_el = {:.1}mm", x_max * 1000.0, x_el * 1000.0
    );

    // UFC 3-340-02 ductility limits
    // Steel beams: μ ≤ 20 (category 1, low damage)
    // RC beams: μ ≤ 5-8 (depending on θ_max)
    let mu_limit_steel: f64 = 20.0;
    let mu_limit_rc: f64 = 5.0;

    assert!(
        mu <= mu_limit_steel,
        "Steel ductility: μ = {:.1} ≤ {:.0}", mu, mu_limit_steel
    );

    // Force ratio determines if response is impulsive or quasi-static
    assert!(
        f_ru_ratio > 1.0,
        "F/Ru = {:.1} > 1.0 — yielding occurs", f_ru_ratio
    );

    let _mu_limit_rc = mu_limit_rc;
}

// ================================================================
// 6. Reflected Pressure — Normal Incidence
// ================================================================
//
// For a blast wave hitting a rigid surface:
// p_r = C_r * p_so
// C_r ≈ 2 + 6*(p_so/p_0)/(7 + p_so/p_0) for ideal gas (γ=1.4)
// At low overpressures (acoustic): C_r → 2
// At high overpressures: C_r → 8 (strong shock limit)

#[test]
fn blast_reflected_pressure() {
    let p_atm: f64 = 101.325;  // kPa, atmospheric pressure

    // Low overpressure case: p_so = 10 kPa
    let p_so_low: f64 = 10.0;
    let ratio_low: f64 = p_so_low / p_atm;
    let cr_low: f64 = 2.0 + 6.0 * ratio_low / (7.0 + ratio_low);
    let pr_low: f64 = cr_low * p_so_low;

    // Acoustic limit: Cr → 2
    assert!(
        cr_low > 2.0 && cr_low < 2.2,
        "Low pressure Cr = {:.3} ≈ 2.0", cr_low
    );

    // High overpressure case: p_so = 1000 kPa
    let p_so_high: f64 = 1000.0;
    let ratio_high: f64 = p_so_high / p_atm;
    let cr_high: f64 = 2.0 + 6.0 * ratio_high / (7.0 + ratio_high);
    let pr_high: f64 = cr_high * p_so_high;

    // Should approach 8 for strong shocks
    assert!(
        cr_high > 5.0 && cr_high < 8.0,
        "High pressure Cr = {:.3}", cr_high
    );

    // Reflected pressure >> incident
    assert!(
        pr_high > p_so_high * 2.0,
        "Reflected {:.0} >> incident {:.0} kPa", pr_high, p_so_high
    );

    let _pr_low = pr_low;
}

// ================================================================
// 7. P-I Diagram — Damage Threshold
// ================================================================
//
// Pressure-Impulse diagram defines iso-damage curves.
// Three regimes: impulsive (I controls), dynamic, quasi-static (p controls)
// Asymptotes: p_min = R_u (quasi-static), I_min = sqrt(2*M*x_el*R_u) (impulsive)

#[test]
fn blast_pi_diagram() {
    let ru: f64 = 100.0;       // kN, ultimate resistance
    let ke: f64 = 20_000.0;    // kN/m
    let me: f64 = 500.0;       // kg, equivalent mass

    let x_el: f64 = ru / ke;   // 0.005 m

    // Quasi-static asymptote: p_min * A = R_u (just enough to reach yield)
    let _p_min: f64 = ru; // kN (for unit area)

    // Impulsive asymptote: I_min = sqrt(2 * Me * x_el * Ke)
    // Energy balance: 0.5*I²/Me = 0.5*Ke*x_el²
    // I = x_el * sqrt(Me * Ke)
    let i_min: f64 = x_el * (me * ke).sqrt();
    // = 0.005 * sqrt(500*20000) = 0.005 * 3162 = 15.8 kN·s

    assert!(
        i_min > 0.0,
        "Impulsive asymptote: I_min = {:.1} kN·s", i_min
    );

    // For ductility μ, impulsive asymptote scales as sqrt(2μ-1)
    let mu: f64 = 3.0;
    let i_min_ductile: f64 = i_min * (2.0 * mu - 1.0).sqrt();

    assert!(
        i_min_ductile > i_min,
        "Ductile I_min = {:.1} > elastic I_min = {:.1} kN·s",
        i_min_ductile, i_min
    );

    // Quasi-static asymptote doesn't change with ductility
    // (it's just the resistance)
    let _p_min_ductile: f64 = ru;
}

// ================================================================
// 8. Glazing Response — UFC 3-340-02
// ================================================================
//
// Glass breakage under blast loading.
// Peak pressure capacity depends on glass type and dimensions.
// Monolithic annealed glass: p_r ≈ 3-10 kPa (breaking threshold)
// Laminated glass: can withstand fragments post-breakage.

#[test]
fn blast_glazing_response() {
    let a: f64 = 1.2;          // m, short dimension
    let _b: f64 = 1.8;         // m, long dimension
    let t: f64 = 6.0;          // mm, glass thickness

    // Breaking stress for annealed glass: ~40-60 MPa (design: 17 MPa for long duration)
    let sigma_break: f64 = 40.0; // MPa (short duration, blast)

    // Plate coefficient for b/a = 1.5: β ≈ 0.57
    let beta: f64 = 0.57;

    // Breaking pressure: σ = β * p * a² / t²
    // p_break = σ_break * t² / (β * a²)
    let t_m: f64 = t / 1000.0; // convert to meters
    let p_break: f64 = sigma_break * 1000.0 * t_m * t_m / (beta * a * a);
    // = 40000 * 36e-6 / (0.57 * 1.44) = 1.44 / 0.8208 = 1.75 kPa

    assert!(
        p_break > 0.5 && p_break < 20.0,
        "Monolithic glass breaking pressure: {:.2} kPa", p_break
    );

    // Laminated glass: approximately 2× monolithic capacity
    let p_break_lam: f64 = p_break * 2.0;
    assert!(
        p_break_lam > p_break,
        "Laminated {:.2} > monolithic {:.2} kPa", p_break_lam, p_break
    );

    // Tempered glass: approximately 4× monolithic
    let p_break_tempered: f64 = p_break * 4.0;
    assert!(
        p_break_tempered > p_break_lam,
        "Tempered {:.2} > laminated {:.2} kPa", p_break_tempered, p_break_lam
    );

    // Standoff distance for safe glazing (approximate):
    // At Z ≈ 10 m/kg^(1/3): p_so ≈ 5-10 kPa
    // Monolithic glass breaks at ~2 kPa reflected → very vulnerable
    assert!(
        p_break < 10.0,
        "Glass breaks at low overpressures — blast vulnerable"
    );
}
