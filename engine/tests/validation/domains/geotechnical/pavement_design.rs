/// Validation: Pavement & Highway Structural Design
///
/// References:
///   - AASHTO Guide for Design of Pavement Structures (1993)
///   - AASHTO Mechanistic-Empirical Pavement Design Guide (MEPDG)
///   - Huang: "Pavement Analysis and Design" 2nd ed. (2004)
///   - EN 13108: Bituminous Mixtures — Material Specifications
///   - PCA: "Thickness Design for Concrete Highways and Street Pavements" (1984)
///   - Shell Pavement Design Manual (1978)
///
/// Tests verify flexible pavement thickness, rigid pavement stress,
/// traffic loading, Boussinesq stress, and overlay design.

// ================================================================
// 1. AASHTO Flexible Pavement -- Structural Number
// ================================================================
//
// SN = a1*D1 + a2*m2*D2 + a3*m3*D3
// SN = structural number (required from design chart)
// ai = layer coefficient, mi = drainage coefficient, Di = thickness

#[test]
fn pavement_structural_number() {
    // Layer properties
    let a1: f64 = 0.44;         // HMA surface (high quality)
    let a2: f64 = 0.14;         // crushed stone base
    let a3: f64 = 0.11;         // subbase
    let m2: f64 = 1.0;          // drainage coefficient (good)
    let m3: f64 = 0.90;         // drainage coefficient (fair)

    // Layer thicknesses (inches, AASHTO convention)
    let d1: f64 = 4.0;          // HMA surface
    let d2: f64 = 8.0;          // base
    let d3: f64 = 12.0;         // subbase

    // Structural number
    let sn: f64 = a1 * d1 + a2 * m2 * d2 + a3 * m3 * d3;
    // = 0.44*4 + 0.14*1.0*8 + 0.11*0.9*12
    // = 1.76 + 1.12 + 1.19 = 4.07

    assert!(
        sn > 3.0 && sn < 6.0,
        "SN = {:.2}", sn
    );

    // HMA contributes most per unit thickness
    let contrib_hma: f64 = a1 * d1 / sn;
    assert!(
        contrib_hma > 0.30,
        "HMA contribution: {:.0}% of SN", contrib_hma * 100.0
    );
}

// ================================================================
// 2. AASHTO Design Equation -- Traffic
// ================================================================
//
// log(W18) = ZR*So + 9.36*log(SN+1) - 0.20 + log(ΔPSI/(4.2-1.5))/(0.40+1094/(SN+1)^5.19) + 2.32*log(MR)-8.07
// W18 = 18-kip ESAL, ZR = reliability, So = standard deviation
// ΔPSI = serviceability loss, MR = resilient modulus

#[test]
fn pavement_traffic_design() {
    let sn: f64 = 4.0;
    let mr: f64 = 50.0;         // MPa, subgrade resilient modulus (≈ 7250 psi)
    let mr_psi: f64 = mr * 145.04; // convert to psi

    // Design parameters
    let zr: f64 = -1.282;       // 90% reliability
    let so: f64 = 0.45;         // overall standard deviation
    let delta_psi: f64 = 4.2 - 2.5; // serviceability loss (p0=4.2, pt=2.5)

    // AASHTO design equation (simplified terms)
    let term1: f64 = zr * so;
    let term2: f64 = 9.36 * (sn + 1.0).log10() - 0.20;
    let num: f64 = (delta_psi / (4.2 - 1.5)).log10();
    let den: f64 = 0.40 + 1094.0 / (sn + 1.0).powf(5.19);
    let term3: f64 = num / den;
    let term4: f64 = 2.32 * mr_psi.log10() - 8.07;

    let log_w18: f64 = term1 + term2 + term3 + term4;
    let w18: f64 = 10.0_f64.powf(log_w18);

    assert!(
        w18 > 1.0e5 && w18 < 1.0e8,
        "Design ESALs: {:.2e}", w18
    );
}

// ================================================================
// 3. Rigid Pavement -- Westergaard Edge Stress
// ================================================================
//
// σ_edge = 3P(1+μ)/(π(3+μ)h²) × (log(Eh³/(100k*a⁴)) + 0.572)
// P = wheel load, h = slab thickness, k = modulus of subgrade reaction
// a = radius of loaded area

#[test]
fn pavement_rigid_stress() {
    let p: f64 = 45.0;          // kN, wheel load
    let h: f64 = 250.0;         // mm, slab thickness
    let e: f64 = 30_000.0;      // MPa, concrete modulus
    let mu: f64 = 0.15;         // Poisson's ratio
    let k: f64 = 0.054;         // MPa/mm, subgrade modulus (= 54 kPa/mm)
    let a: f64 = 150.0;         // mm, loaded radius

    // Radius of relative stiffness
    let l: f64 = (e * h.powi(3) / (12.0 * (1.0 - mu * mu) * k)).powf(0.25);

    assert!(
        l > 500.0 && l < 2000.0,
        "Radius of relative stiffness: {:.0} mm", l
    );

    // Interior stress (Westergaard)
    let b_param: f64 = if a < 1.724 * h {
        (1.6 * a * a + h * h).sqrt() - 0.675 * h
    } else {
        a
    };
    let sigma_int: f64 = 3.0 * p * 1000.0 * (1.0 + mu) / (2.0 * std::f64::consts::PI * h * h)
                        * ((e * h.powi(3) / (100.0 * k * b_param.powi(4))).ln() / std::f64::consts::LN_10
                           + 0.6159);

    assert!(
        sigma_int > 0.0,
        "Interior stress: {:.2} MPa", sigma_int
    );

    // Edge stress is higher than interior (critical for design)
    // Typically edge stress ≈ 1.5 × interior stress
    let edge_factor: f64 = 1.5;
    let sigma_edge: f64 = sigma_int * edge_factor;

    // Check against concrete flexural strength
    let fr: f64 = 0.7 * (40.0_f64).sqrt(); // modulus of rupture (f'c=40 MPa)

    assert!(
        sigma_edge < fr,
        "Edge stress {:.2} < fr = {:.2} MPa", sigma_edge, fr
    );
}

// ================================================================
// 4. Boussinesq -- Stress Distribution in Subgrade
// ================================================================
//
// Vertical stress under circular load:
// σz = q × (1 - z³/(z²+a²)^1.5)
// q = contact pressure, a = radius, z = depth

#[test]
fn pavement_boussinesq_stress() {
    let q: f64 = 0.7;           // MPa, tire contact pressure
    let a: f64 = 150.0;         // mm, contact radius

    // Stress at various depths
    let depths: [f64; 4] = [150.0, 300.0, 600.0, 1000.0];

    let mut prev_stress: f64 = q;

    for &z in &depths {
        let term: f64 = z.powi(3) / (z * z + a * a).powf(1.5);
        let sigma_z: f64 = q * (1.0 - term);

        assert!(
            sigma_z < prev_stress,
            "Stress at {:.0}mm: {:.4} MPa (decreasing)", z, sigma_z
        );
        prev_stress = sigma_z;
    }

    // At z = a: stress ≈ 0.646*q
    let z_eq_a: f64 = a;
    let sigma_a: f64 = q * (1.0 - z_eq_a.powi(3) / (z_eq_a * z_eq_a + a * a).powf(1.5));
    let expected_ratio: f64 = 1.0 - 1.0 / (2.0_f64).powf(1.5);

    assert!(
        ((sigma_a / q) - expected_ratio).abs() < 0.01,
        "At z=a: σ/q = {:.3} ≈ {:.3}", sigma_a / q, expected_ratio
    );
}

// ================================================================
// 5. Equivalent Single Axle Load (ESAL)
// ================================================================
//
// Load equivalency factor: LEF = (P/P_std)^4 (fourth power law)
// P_std = 80 kN (18 kip) standard axle

#[test]
fn pavement_esal_conversion() {
    let p_std: f64 = 80.0;      // kN, standard axle

    // Various axle loads
    let axles: [(f64, &str); 4] = [
        (40.0, "car"),
        (80.0, "standard"),
        (120.0, "overload"),
        (160.0, "heavy overload"),
    ];

    let mut prev_lef: f64 = 0.0;

    for (p, name) in &axles {
        let lef: f64 = (p / p_std).powi(4);

        assert!(
            lef > prev_lef || *name == "car",
            "{}: LEF = {:.4}", name, lef
        );
        prev_lef = lef;
    }

    // Fourth power law: doubling load → 16× damage
    let double_ratio: f64 = 160.0 / 80.0;
    let lef_double: f64 = double_ratio.powi(4);
    assert!(
        (lef_double - 16.0).abs() < 0.01,
        "Double load: LEF = {:.1} (= 2⁴ = 16)", lef_double
    );

    // 10% overload → 46% more damage
    let lef_10pct: f64 = (1.10_f64).powi(4);
    assert!(
        (lef_10pct - 1.4641).abs() < 0.01,
        "10% overload: {:.1}% more damage", (lef_10pct - 1.0) * 100.0
    );
}

// ================================================================
// 6. Overlay Design -- Effective Thickness
// ================================================================
//
// AASHTO: required overlay = SN_required - SN_effective
// SN_effective = condition factor × SN_existing
// Condition factor: 0.0 (failed) to 1.0 (new)

#[test]
fn pavement_overlay_design() {
    // Existing pavement
    let sn_existing: f64 = 4.5;
    let condition_factor: f64 = 0.60; // 60% remaining life

    // Effective structural number
    let sn_eff: f64 = sn_existing * condition_factor;

    // Required for future traffic
    let sn_required: f64 = 5.5;

    // Overlay structural number needed
    let sn_overlay: f64 = sn_required - sn_eff;

    assert!(
        sn_overlay > 0.0,
        "Required overlay SN: {:.2}", sn_overlay
    );

    // Convert to HMA overlay thickness
    let a_hma: f64 = 0.44;
    let d_overlay: f64 = sn_overlay / a_hma; // inches

    assert!(
        d_overlay > 2.0 && d_overlay < 12.0,
        "HMA overlay: {:.1} inches ({:.0} mm)",
        d_overlay, d_overlay * 25.4
    );
}

// ================================================================
// 7. Temperature Curling -- Rigid Pavement
// ================================================================
//
// Westergaard: curling stress = C × E × α × ΔT / 2
// C depends on Lx/l and Ly/l (slab dimensions / radius of relative stiffness)

#[test]
fn pavement_temperature_curling() {
    let e: f64 = 30_000.0;      // MPa
    let alpha: f64 = 10.0e-6;   // 1/°C
    let mu: f64 = 0.15;
    let delta_t: f64 = 12.0;    // °C, temperature differential top-bottom

    // Maximum curling stress (infinite slab, fully restrained)
    let sigma_max: f64 = e * alpha * delta_t / (2.0 * (1.0 - mu));

    assert!(
        sigma_max > 1.0 && sigma_max < 5.0,
        "Maximum curling stress: {:.2} MPa", sigma_max
    );

    // Curling correction factor (finite slab)
    // For typical slab 4.5m × 4.5m, l ≈ 1.0m:
    let cx: f64 = 0.80;         // correction factor (from tables)

    let sigma_curl: f64 = cx * sigma_max;

    assert!(
        sigma_curl < sigma_max,
        "Finite slab curling: {:.2} < infinite {:.2} MPa",
        sigma_curl, sigma_max
    );

    // Combined: traffic + curling (critical loading)
    let sigma_traffic: f64 = 1.5; // MPa (from Westergaard edge)
    let sigma_combined: f64 = sigma_traffic + sigma_curl;

    let fr: f64 = 4.5;          // MPa, modulus of rupture
    assert!(
        sigma_combined < fr,
        "Combined {:.2} < fr = {:.1} MPa", sigma_combined, fr
    );
}

// ================================================================
// 8. Fatigue -- Pavement Life
// ================================================================
//
// Flexible: Nf = k1 × (1/εt)^k2 × (1/E)^k3
// εt = tensile strain at bottom of HMA
// Asphalt Institute: k1 = 0.0796, k2 = 3.291, k3 = 0.854

#[test]
fn pavement_fatigue_life() {
    let e_hma: f64 = 3000.0;    // MPa, HMA modulus (at design temp)

    // Strain at bottom of HMA (from multi-layer analysis)
    let eps_t: f64 = 200.0e-6;  // tensile strain (200 microstrain)

    // Asphalt Institute fatigue model
    let k1: f64 = 0.0796;
    let k2: f64 = 3.291;
    let k3: f64 = 0.854;

    let nf: f64 = k1 * (1.0 / eps_t).powf(k2) * (1.0 / e_hma).powf(k3);

    assert!(
        nf > 1.0e5 && nf < 1.0e10,
        "Fatigue life: {:.2e} repetitions", nf
    );

    // Higher strain → much shorter life (power 3.3)
    let eps_high: f64 = 300.0e-6;
    let nf_high: f64 = k1 * (1.0 / eps_high).powf(k2) * (1.0 / e_hma).powf(k3);

    assert!(
        nf_high < nf,
        "50% more strain: life reduces {:.1}×", nf / nf_high
    );

    // Strain ratio to life ratio
    let strain_ratio: f64 = eps_high / eps_t;
    let life_ratio: f64 = nf / nf_high;
    let expected_ratio: f64 = strain_ratio.powf(k2);

    assert!(
        (life_ratio - expected_ratio).abs() / expected_ratio < 0.01,
        "Life ratio {:.1} = strain ratio^{:.1}", life_ratio, k2
    );
}
