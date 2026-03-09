/// Validation: Steel Fiber Reinforced Concrete (SFRC)
///
/// References:
///   - fib Model Code 2010: Chapter 5.6 (Fibre Reinforced Concrete)
///   - ACI 544.4R: Design Considerations for SFRC
///   - EN 14651: Test Method for SFRC
///   - RILEM TC 162-TDF: σ-ε Design Method (2003)
///   - EN 1992-1-1 + National Annexes allowing SFRC
///   - Naaman: "High Performance Fiber Reinforced Cement Composites" (2008)
///
/// Tests verify residual strength, flexural capacity, shear enhancement,
/// crack width control, and industrial floor design.

// ================================================================
// 1. Residual Flexural Strength -- EN 14651 Beam Test
// ================================================================
//
// Three-point bending test on notched beam (150×150×550mm, span 500mm).
// fR,j = (3*Fj*L) / (2*b*hsp²) at CMOD_j
// CMOD1 = 0.5mm, CMOD2 = 1.5mm, CMOD3 = 2.5mm, CMOD4 = 3.5mm

#[test]
fn sfrc_residual_strength() {
    // Beam test geometry
    let l: f64 = 500.0;         // mm, span
    let b: f64 = 150.0;         // mm, width
    let h: f64 = 150.0;         // mm, height
    let notch: f64 = 25.0;      // mm, notch depth
    let hsp: f64 = h - notch;   // mm, height above notch

    // Test loads at CMOD values (typical for 40 kg/m³ steel fibers)
    let f1: f64 = 18.0;         // kN at CMOD = 0.5mm
    let f3: f64 = 15.0;         // kN at CMOD = 2.5mm

    // Residual strengths (F in kN → N with ×1000, result in MPa)
    let fr1: f64 = 3.0 * f1 * 1000.0 * l / (2.0 * b * hsp * hsp);
    let fr3: f64 = 3.0 * f3 * 1000.0 * l / (2.0 * b * hsp * hsp);

    assert!(
        fr1 > 2.0,
        "fR1 = {:.2} MPa", fr1
    );

    // fib MC2010: classification
    // Strength class: a = fR1 value (e.g., 3.0 → class "3.0")
    // Ratio: b = fR3/fR1 (a, b, c, d, e)
    let ratio: f64 = fr3 / fr1;

    assert!(
        ratio > 0.5,
        "fR3/fR1 = {:.2} > 0.5 -- class 'c' or better", ratio
    );

    // Serviceability (SLS) and ultimate (ULS) residual strengths
    let fftus: f64 = 0.45 * fr1;    // SLS (fib MC2010)
    let fftuu: f64 = fr3 / 3.0;     // ULS characteristic

    assert!(
        fftus > 0.0 && fftuu > 0.0,
        "SLS: {:.2}, ULS: {:.2} MPa", fftus, fftuu
    );
}

// ================================================================
// 2. SFRC Flexural Capacity -- Partial Rebar Replacement
// ================================================================
//
// Combined SFRC + conventional rebar:
// Fibers contribute additional tensile capacity in cracked zone.
// Mn = As*fy*(d-a/2) + σ_ftu*b*(h-xu)*(h-xu)/(2*(h-a/2))

#[test]
fn sfrc_flexural_capacity() {
    let b: f64 = 300.0;         // mm
    let h: f64 = 500.0;         // mm
    let d: f64 = 450.0;         // mm
    let fc: f64 = 35.0;         // MPa
    let fy: f64 = 500.0;        // MPa
    let as_bar: f64 = 600.0;    // mm², reduced rebar (vs 1200 without fibers)
    let fftuu: f64 = 1.5;       // MPa, SFRC residual tensile strength

    // Rebar-only capacity
    let a_bar: f64 = as_bar * fy / (0.85 * fc * b);
    let mn_bar: f64 = as_bar * fy * (d - a_bar / 2.0) / 1e6;

    // Fiber contribution (rectangular stress block in tension zone)
    let h_tension: f64 = h - a_bar; // tension zone height
    let fiber_force: f64 = fftuu * b * h_tension / 1000.0; // kN
    let fiber_arm: f64 = h_tension / 2.0; // from neutral axis
    let mn_fiber: f64 = fiber_force * fiber_arm / 1000.0; // kN·m

    // Combined capacity
    let mn_total: f64 = mn_bar + mn_fiber;

    assert!(
        mn_total > mn_bar,
        "SFRC total {:.1} > bar only {:.1} kN·m", mn_total, mn_bar
    );

    // Fiber contribution percentage
    let fiber_pct: f64 = mn_fiber / mn_total * 100.0;
    assert!(
        fiber_pct > 10.0,
        "Fiber contributes {:.0}% of capacity", fiber_pct
    );
}

// ================================================================
// 3. SFRC Shear Enhancement
// ================================================================
//
// Fibers bridge shear cracks, adding to shear capacity.
// fib MC2010: V_f = 0.7 * k_f * fFtuk * b * d
// k_f = factor for fiber orientation (1.0 for favorable)

#[test]
fn sfrc_shear_capacity() {
    let b: f64 = 300.0;         // mm
    let d: f64 = 450.0;         // mm
    let fc: f64 = 35.0;         // MPa
    let fftuk: f64 = 1.5;       // MPa, characteristic residual strength

    // Concrete shear capacity (EC2, without fibers)
    let rho_l: f64 = 0.01;      // longitudinal reinforcement ratio
    let k: f64 = 1.0 + (200.0 / d).sqrt();
    let vrd_c: f64 = 0.18 * k * (100.0 * rho_l * fc).powf(1.0 / 3.0) * b * d / 1000.0; // kN

    // Fiber contribution to shear (fib MC2010)
    let k_f: f64 = 1.0;         // favorable fiber orientation
    let vf: f64 = 0.7 * k_f * fftuk * b * d / 1000.0; // kN

    // Total shear capacity
    let vrd_total: f64 = vrd_c + vf;

    assert!(
        vrd_total > vrd_c,
        "SFRC shear {:.0} > concrete {:.0} kN", vrd_total, vrd_c
    );

    // Enhancement ratio
    let enhancement: f64 = vrd_total / vrd_c;
    assert!(
        enhancement > 1.30,
        "Shear enhancement: {:.0}%", (enhancement - 1.0) * 100.0
    );
}

// ================================================================
// 4. Crack Width Control
// ================================================================
//
// SFRC limits crack widths through fiber bridging.
// Residual strength provides post-cracking tensile capacity.
// EC2 crack width formula modified for SFRC: w = sr × (εsm - εcm)
// εcm includes fiber contribution.

#[test]
fn sfrc_crack_width() {
    let sr_max: f64 = 200.0;    // mm, maximum crack spacing (reduced by fibers)
    let sigma_s: f64 = 300.0;   // MPa, steel stress
    let es: f64 = 200_000.0;    // MPa

    // Without fibers
    let eps_sm: f64 = sigma_s / es;
    let kt: f64 = 0.6;          // long-term loading
    let fcteff: f64 = 3.0;      // MPa, effective tensile strength
    let rho_eff: f64 = 0.02;
    let eps_cm: f64 = kt * fcteff / (es * rho_eff);

    let w_no_fiber: f64 = sr_max * (eps_sm - eps_cm).max(0.6 * eps_sm);

    // With fibers: residual tension reduces steel stress
    let sigma_f: f64 = 1.5;     // MPa, fiber stress contribution
    // Effective steel stress is reduced
    let _sigma_s_eff: f64 = sigma_s - sigma_f * 300.0 * 500.0 / (600.0 * es) * es; // simplified
    // Actually: fibers reduce tension in steel
    let sigma_s_sfrc: f64 = sigma_s * 0.85; // ~15% reduction (simplified)
    let eps_sm_sfrc: f64 = sigma_s_sfrc / es;

    let w_sfrc: f64 = sr_max * (eps_sm_sfrc - eps_cm).max(0.6 * eps_sm_sfrc);

    assert!(
        w_sfrc < w_no_fiber,
        "SFRC crack {:.3}mm < plain {:.3}mm", w_sfrc, w_no_fiber
    );
}

// ================================================================
// 5. Industrial Floor -- Slab on Grade
// ================================================================
//
// SFRC slabs on grade: common for warehouses.
// Design for concentrated load (forklift wheel) and UDL.
// Westergaard theory for interior/edge/corner loads.
// Fiber dosage: typically 20-40 kg/m³ (steel) or 4-8 kg/m³ (macro synthetic).

#[test]
fn sfrc_industrial_floor() {
    let h: f64 = 150.0;         // mm, slab thickness
    let fc: f64 = 30.0;         // MPa
    let k: f64 = 0.05;          // MPa/mm, subgrade modulus

    // Modulus of rupture (SFRC enhanced)
    let fr_plain: f64 = 0.7 * fc.sqrt(); // ≈ 3.83 MPa
    let re3: f64 = 0.50;        // Re,3 = residual strength ratio (fiber benefit)
    let fr_sfrc: f64 = fr_plain * (1.0 + re3);

    assert!(
        fr_sfrc > fr_plain,
        "SFRC fr = {:.2} > plain {:.2} MPa", fr_sfrc, fr_plain
    );

    // Radius of relative stiffness
    let e: f64 = 30_000.0;      // MPa
    let mu: f64 = 0.15;
    let l: f64 = (e * h.powi(3) / (12.0 * (1.0 - mu * mu) * k)).powf(0.25);

    assert!(
        l > 400.0,
        "Radius of relative stiffness: {:.0} mm", l
    );

    // Interior load capacity (Meyerhof formula)
    let _p_interior: f64 = 2.0 * std::f64::consts::PI * fr_sfrc * h * h / (6.0 * 1000.0);
    // Simplified: P = 2π × MR / (6000) for interior load

    // Actually Meyerhof: P = (2π/(3)) × (fr × h²/6) × (1 + ...)
    // Simplified: capacity is proportional to fr × h²
    let capacity_ratio: f64 = fr_sfrc / fr_plain;

    assert!(
        capacity_ratio > 1.3,
        "SFRC gives {:.0}% more floor load capacity", (capacity_ratio - 1.0) * 100.0
    );
}

// ================================================================
// 6. Fiber Dosage -- Volume Fraction
// ================================================================
//
// Volume fraction: Vf = dosage / density_fiber
// Typical steel fibers: 7850 kg/m³, 20-60 kg/m³ dosage → Vf = 0.25-0.76%
// Synthetic fibers: 910 kg/m³, 4-8 kg/m³ → Vf = 0.44-0.88%

#[test]
fn sfrc_fiber_dosage() {
    // Steel fiber
    let dosage_steel: f64 = 40.0;    // kg/m³
    let density_steel: f64 = 7850.0; // kg/m³
    let vf_steel: f64 = dosage_steel / density_steel * 100.0; // %

    assert!(
        vf_steel > 0.3 && vf_steel < 1.0,
        "Steel Vf = {:.2}%", vf_steel
    );

    // Macro synthetic fiber
    let dosage_synth: f64 = 6.0;     // kg/m³
    let density_synth: f64 = 910.0;  // kg/m³
    let vf_synth: f64 = dosage_synth / density_synth * 100.0;

    assert!(
        vf_synth > 0.3,
        "Synthetic Vf = {:.2}%", vf_synth
    );

    // Number of fibers per m³
    // For steel: L=60mm, d=0.75mm
    let l_f: f64 = 60.0;            // mm
    let d_f: f64 = 0.75;            // mm
    let v_fiber: f64 = std::f64::consts::PI * d_f * d_f / 4.0 * l_f; // mm³
    let density_mm3: f64 = density_steel * 1e-9; // kg/mm³
    let mass_fiber: f64 = density_mm3 * v_fiber; // kg

    let _n_fibers: f64 = dosage_steel / mass_fiber * 1e-9; // per mm³ → per m³
    // Actually: dosage in kg/m³, mass per fiber in kg
    let n_per_m3: f64 = dosage_steel / (density_steel * v_fiber * 1e-9);

    assert!(
        n_per_m3 > 100_000.0,
        "Fibers per m³: {:.0}", n_per_m3
    );

    // Aspect ratio (key performance parameter)
    let aspect_ratio: f64 = l_f / d_f;
    assert!(
        aspect_ratio > 40.0 && aspect_ratio < 100.0,
        "Aspect ratio: {:.0}", aspect_ratio
    );
}

// ================================================================
// 7. Tunnel Segment -- SFRC Application
// ================================================================
//
// TBM tunnel segments: SFRC increasingly used (with or without rebar).
// Thrust + bending during handling, erection, and in-service.
// fib MC2010: ULS check for combined N + M.

#[test]
fn sfrc_tunnel_segment() {
    let b: f64 = 1500.0;        // mm, segment width
    let h: f64 = 300.0;         // mm, segment thickness
    let fc: f64 = 50.0;         // MPa
    let fftuu: f64 = 2.0;       // MPa, ULS residual tensile strength

    // Thrust from TBM and ground pressure
    let n: f64 = 1500.0;        // kN/m, axial force
    let m: f64 = 100.0;         // kN·m/m, bending moment

    // Eccentricity
    let e: f64 = m / n * 1000.0; // mm
    // = 66.7 mm

    // Check if within kernel (h/6 = 50mm)
    let in_kernel: bool = e < h / 6.0;

    // Even if outside kernel: SFRC provides tension capacity
    if !in_kernel {
        // Tension side stress (simplified linear elastic)
        let sigma_tension: f64 = n * 1000.0 / (b * h) - 6.0 * m * 1e6 / (b * h * h);
        // If negative → tension exists

        // SFRC can handle tension up to fftuu
        let tension_ok: bool = sigma_tension.abs() < fftuu || sigma_tension > 0.0;
        assert!(
            tension_ok,
            "Tension {:.2} < fftuu {:.1} MPa", sigma_tension.abs(), fftuu
        );
    }

    // Compressive stress check
    let sigma_max: f64 = n * 1000.0 / (b * h) + 6.0 * m * 1e6 / (b * h * h);
    assert!(
        sigma_max < 0.6 * fc,
        "Max compression {:.1} < 0.6fc = {:.1} MPa", sigma_max, 0.6 * fc
    );
}

// ================================================================
// 8. SFRC Punching Shear
// ================================================================
//
// SFRC enhances punching shear capacity of flat slabs.
// Additional contribution similar to shear: V_f term.
// Particularly effective for reducing/eliminating shear studs.

#[test]
fn sfrc_punching_shear() {
    let d: f64 = 200.0;         // mm, effective depth
    let fc: f64 = 35.0;         // MPa
    let fftuk: f64 = 1.5;       // MPa, SFRC residual strength

    // Column dimensions
    let c: f64 = 400.0;         // mm, square column side

    // Control perimeter (EC2: at 2d from column face)
    let u: f64 = 4.0 * c + 2.0 * std::f64::consts::PI * 2.0 * d;

    // Concrete punching capacity (EC2)
    let k: f64 = 1.0 + (200.0 / d).sqrt();
    let rho_l: f64 = 0.01;
    let vrd_c: f64 = 0.18 * k * (100.0 * rho_l * fc).powf(1.0 / 3.0) * u * d / 1000.0; // kN

    // SFRC enhancement
    let vf: f64 = 0.7 * fftuk * u * d / 1000.0; // kN

    let vrd_sfrc: f64 = vrd_c + vf;

    assert!(
        vrd_sfrc > vrd_c * 1.20,
        "SFRC punching {:.0} > 1.2 × concrete {:.0} kN",
        vrd_sfrc, vrd_c
    );

    // Reduction in shear reinforcement need
    let v_demand: f64 = 500.0;  // kN
    let needs_studs_plain: bool = v_demand > vrd_c;
    let needs_studs_sfrc: bool = v_demand > vrd_sfrc;

    // SFRC may eliminate need for shear studs
    assert!(
        !needs_studs_sfrc || needs_studs_plain,
        "SFRC reduces/eliminates punching reinforcement"
    );
}
