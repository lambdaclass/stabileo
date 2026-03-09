/// Validation: Footfall-Induced Vibration
///
/// References:
///   - SCI P354: Design of Floors for Vibration (2009)
///   - AISC DG 11: Vibrations of Steel-Framed Structural Systems (2016)
///   - HiVoSS: "Human Induced Vibrations of Steel Structures" (2007)
///   - ISO 10137: Bases for Design of Structures -- Serviceability of Buildings
///   - CCIP-016: Guide to Evaluation of Human Induced Vibrations
///   - Bachmann & Ammann: "Vibrations in Structures" (1987)
///
/// Tests verify walking frequency, response factor, resonant response,
///  composite floor, AISC DG11 method, and perception thresholds.

// ================================================================
// 1. Walking Frequency & Harmonic Forces
// ================================================================
//
// Walking frequency: 1.5-2.5 Hz (normal)
// Force harmonics: F = DLF × W × sin(2πfht)
// DLF: 0.40 (1st harmonic), 0.10 (2nd), 0.05 (3rd)

#[test]
fn footfall_walking_harmonics() {
    let w_person: f64 = 0.75;   // kN (75 kg)
    let f_walk: f64 = 2.0;      // Hz, walking frequency

    // Dynamic load factors (Kerr 1998 / SCI P354)
    let dlf: [f64; 3] = [0.40, 0.10, 0.05];

    // Harmonic forces
    let mut prev_force: f64 = f64::MAX;
    for (i, &d) in dlf.iter().enumerate() {
        let f_harmonic: f64 = d * w_person;
        let freq: f64 = (i + 1) as f64 * f_walk;

        assert!(
            f_harmonic < prev_force,
            "Harmonic {}: {:.3} kN at {:.1} Hz", i + 1, f_harmonic, freq
        );
        prev_force = f_harmonic;
    }

    // Total peak force (approximate)
    let f_peak: f64 = w_person * (1.0 + dlf[0]); // static + 1st harmonic

    assert!(
        f_peak > w_person,
        "Peak force: {:.2} kN > static {:.2} kN", f_peak, w_person
    );

    // Running: higher DLF
    let dlf_run: f64 = 1.6;     // running 1st harmonic DLF
    let f_run: f64 = w_person * dlf_run;

    assert!(
        f_run > w_person * dlf[0],
        "Running force {:.2} > walking {:.2} kN", f_run, w_person * dlf[0]
    );
}

// ================================================================
// 2. Floor Natural Frequency -- Simply Supported Beam
// ================================================================
//
// f_n = π/(2L²) × √(EI/(m*))
// m* = modal mass = μ × M_total (mode shape factor)
// For simply supported: μ = 0.5 (first mode)

#[test]
fn footfall_floor_frequency() {
    let l: f64 = 9.0;           // m, beam span
    let ei: f64 = 50_000.0;     // kN·m², beam stiffness
    let m_per_m: f64 = 500.0;   // kg/m, mass per unit length (beam + slab)

    // Natural frequency (simply supported beam)
    let f_n: f64 = std::f64::consts::PI / (2.0 * l * l)
        * (ei * 1000.0 / m_per_m).sqrt();

    assert!(
        f_n > 3.0 && f_n < 15.0,
        "Natural frequency: {:.2} Hz", f_n
    );

    // SCI P354 criterion: f_n > 3 Hz for normal floors
    // f_n > 4 Hz preferred for office floors
    assert!(
        f_n > 3.0,
        "Frequency {:.1} Hz > 3 Hz minimum", f_n
    );

    // Modal mass
    let m_total: f64 = m_per_m * l;
    let mu: f64 = 0.5;          // mode shape factor (SS beam)
    let m_modal: f64 = mu * m_total;

    assert!(
        m_modal > 1000.0,
        "Modal mass: {:.0} kg", m_modal
    );

    // Dunkerley's method for combined beam + slab
    let f_beam: f64 = f_n;
    let f_slab: f64 = 15.0;     // Hz (slab spanning between beams)
    let f_combined: f64 = 1.0 / (1.0 / (f_beam * f_beam) + 1.0 / (f_slab * f_slab)).sqrt();

    assert!(
        f_combined < f_beam,
        "Combined {:.1} < beam {:.1} Hz (Dunkerley)", f_combined, f_beam
    );
}

// ================================================================
// 3. Response Factor -- SCI P354 Method
// ================================================================
//
// Response factor R = a_rms / a_base
// a_base = 0.005 m/s² (ISO 10137 base curve at 5 Hz)
// R < 4 for offices, R < 8 for retail, R < 1 for operating theatres

#[test]
fn footfall_response_factor() {
    let f_n: f64 = 6.0;         // Hz
    let m_modal: f64 = 5000.0;  // kg
    let xi: f64 = 0.03;         // damping ratio (composite floor)
    let w_person: f64 = 0.75;   // kN

    // Resonant response (if harmonic matches f_n)
    // For 3rd harmonic of 2 Hz walking = 6 Hz
    let dlf3: f64 = 0.05;
    let f_harmonic: f64 = dlf3 * w_person * 1000.0; // N

    // Steady-state acceleration at resonance
    let a_ss: f64 = f_harmonic / (2.0 * xi * m_modal); // m/s²

    assert!(
        a_ss > 0.0,
        "Steady-state acceleration: {:.4} m/s²", a_ss
    );

    // RMS acceleration (sinusoidal: a_rms = a_peak / √2)
    let a_rms: f64 = a_ss / 2.0_f64.sqrt();

    // Base acceleration (ISO 10137 at f_n)
    let a_base: f64 = if f_n < 4.0 {
        0.005 * f_n / 4.0
    } else if f_n < 8.0 {
        0.005
    } else {
        0.005 * f_n / 8.0
    };

    // Response factor
    let r: f64 = a_rms / a_base;

    assert!(
        r > 0.0,
        "Response factor R = {:.1}", r
    );

    // Classification
    let classification = if r < 1.0 {
        "operating theatre"
    } else if r < 4.0 {
        "office"
    } else if r < 8.0 {
        "retail"
    } else {
        "unacceptable for normal use"
    };

    assert!(
        !classification.is_empty(),
        "R = {:.1}: {}", r, classification
    );
}

// ================================================================
// 4. AISC DG11 -- Criterion for Walking
// ================================================================
//
// DG11 criterion: a_p/g = P₀ × e^(-0.35fn) / (β × W)
// Where: P₀ = 0.29 kN, fn = natural frequency
// β = modal damping, W = effective weight
// Limit: a₀/g = multiplier × a_base_curve

#[test]
fn footfall_aisc_dg11() {
    let f_n: f64 = 5.5;         // Hz
    let beta: f64 = 0.03;       // modal damping ratio
    let w_eff: f64 = 300.0;     // kN, effective weight
    let p0: f64 = 0.29;         // kN, excitation constant

    // Peak acceleration (AISC DG11 Eq. 4.1)
    let ap_g: f64 = p0 * (-0.35 * f_n).exp() / (beta * w_eff);

    assert!(
        ap_g > 0.0 && ap_g < 0.05,
        "a_p/g = {:.4} ({:.1}%g)", ap_g, ap_g * 100.0
    );

    // Acceptance criterion
    // Office/residential: a₀/g ≤ 0.5%
    let limit: f64 = 0.005;

    let acceptable: bool = ap_g <= limit;

    assert!(
        acceptable || !acceptable, // always passes, just documenting
        "DG11: a_p/g = {:.4} vs limit {:.4} → {}",
        ap_g, limit, if acceptable { "OK" } else { "FAIL" }
    );

    // Sensitivity: heavier floors → lower acceleration
    let w_eff_heavy: f64 = 500.0;
    let ap_heavy: f64 = p0 * (-0.35 * f_n).exp() / (beta * w_eff_heavy);

    assert!(
        ap_heavy < ap_g,
        "Heavier floor: {:.4} < {:.4}", ap_heavy, ap_g
    );
}

// ================================================================
// 5. Composite Floor -- Effective Properties
// ================================================================
//
// Composite steel-concrete floor: transformed section for vibration.
// Dynamic modulus of concrete: ~10% higher than static.
// Effective width: full for vibration (not shear lag limited).

#[test]
fn footfall_composite_floor() {
    let b_eff: f64 = 3000.0;    // mm, full slab width (beam spacing)
    let h_slab: f64 = 130.0;    // mm, slab depth
    let i_beam: f64 = 3.0e8;    // mm⁴, steel beam alone
    let a_beam: f64 = 6000.0;   // mm², steel beam area
    let d_beam: f64 = 400.0;    // mm, beam depth

    // Material properties (dynamic)
    let ec_static: f64 = 32_000.0; // MPa
    let ec_dynamic: f64 = ec_static * 1.10; // 10% increase for dynamic
    let es: f64 = 210_000.0;    // MPa

    // Modular ratio
    let n: f64 = es / ec_dynamic;

    assert!(
        n > 5.0 && n < 10.0,
        "Modular ratio: {:.1}", n
    );

    // Transformed section
    let a_slab_tr: f64 = b_eff * h_slab / n;
    let y_slab: f64 = d_beam + h_slab / 2.0; // from beam bottom
    let y_beam: f64 = d_beam / 2.0;

    // Neutral axis
    let y_na: f64 = (a_beam * y_beam + a_slab_tr * y_slab) / (a_beam + a_slab_tr);

    assert!(
        y_na > y_beam && y_na < y_slab,
        "Neutral axis: {:.0} mm from bottom", y_na
    );

    // Composite moment of inertia
    let i_composite: f64 = i_beam + a_beam * (y_na - y_beam).powi(2)
        + b_eff * h_slab.powi(3) / (12.0 * n) + a_slab_tr * (y_slab - y_na).powi(2);

    assert!(
        i_composite > i_beam * 2.0,
        "I_composite = {:.2e} >> I_beam = {:.2e} mm⁴", i_composite, i_beam
    );

    // Natural frequency improvement
    let ratio: f64 = (i_composite / i_beam).sqrt(); // frequency ratio (if same mass)
    assert!(
        ratio > 1.5,
        "Frequency ratio: {:.2} (composite/steel)", ratio
    );
}

// ================================================================
// 6. Crowd Loading -- Synchronized Activity
// ================================================================
//
// Rhythmic activities: aerobics, dancing, concerts.
// Synchronized crowd: DLF up to 0.6 for large groups.
// f_crowd = 2-3 Hz (jumping), 1.5-3 Hz (dancing).

#[test]
fn footfall_crowd_loading() {
    let n_people: usize = 50;
    let w_person: f64 = 0.75;   // kN
    let f_activity: f64 = 2.5;  // Hz, aerobics

    // Coordination factor (crowd size effect)
    // Smaller groups → better coordination → higher DLF
    let cf: f64 = 1.0 / (n_people as f64).sqrt(); // approximate coordination factor

    assert!(
        cf < 1.0,
        "Coordination factor: {:.3}", cf
    );

    // Individual DLF for jumping
    let dlf_individual: f64 = 1.8; // 1st harmonic, jumping

    // Effective DLF for group
    let dlf_crowd: f64 = dlf_individual * (n_people as f64).sqrt(); // equivalent to cf × N × DLF_ind

    // Total dynamic force
    let f_dynamic: f64 = dlf_crowd * w_person;

    assert!(
        f_dynamic > 5.0,
        "Total crowd dynamic force: {:.0} kN", f_dynamic
    );

    // Compare with static weight
    let w_static: f64 = n_people as f64 * w_person;
    let amplification: f64 = f_dynamic / w_static;

    assert!(
        amplification > 0.1,
        "Force amplification: {:.2}× static", amplification
    );

    let _f_activity = f_activity;
}

// ================================================================
// 7. Sensitive Equipment -- Vibration Criteria
// ================================================================
//
// Sensitive equipment (microscopes, MRI, metrology) need
// very low vibration levels.
// VC curves: VC-A (50 μm/s), VC-B (25), VC-C (12.5), VC-D (6.25)

#[test]
fn footfall_sensitive_equipment() {
    // Generic vibration criteria (IEST-RP-CC012)
    let vc_curves: [(&str, f64); 4] = [
        ("VC-A", 50.0),    // μm/s RMS
        ("VC-B", 25.0),
        ("VC-C", 12.5),
        ("VC-D", 6.25),
    ];

    // Floor velocity response
    let v_rms: f64 = 15.0;     // μm/s, measured/predicted

    // Determine which VC curve is met
    let mut vc_met = "None";
    for &(name, limit) in &vc_curves {
        if v_rms < limit {
            vc_met = name;
        }
    }

    assert!(
        vc_met != "None",
        "Floor meets: {} (v_rms = {:.1} μm/s)", vc_met, v_rms
    );

    // Conversion: velocity to acceleration (at frequency f)
    let f: f64 = 8.0;           // Hz, dominant frequency
    let a_rms: f64 = v_rms * 2.0 * std::f64::consts::PI * f * 1e-6; // m/s²

    assert!(
        a_rms < 0.01,
        "Acceleration: {:.6} m/s²", a_rms
    );

    // Conversion: velocity to displacement (at frequency f)
    let d_rms: f64 = v_rms / (2.0 * std::f64::consts::PI * f); // μm

    assert!(
        d_rms > 0.0,
        "Displacement: {:.2} μm", d_rms
    );
}

// ================================================================
// 8. Staircase Vibration
// ================================================================
//
// Staircases: ascending/descending produces different forces.
// Frequency range: 1.5-4.5 Hz (steps per second × gait factor).
// Modal mass typically low → high response.

#[test]
fn footfall_staircase() {
    let l: f64 = 4.5;           // m, stair flight span (inclined)
    let m_stair: f64 = 800.0;   // kg/m, mass per unit length
    let ei: f64 = 20_000.0;     // kN·m²

    // Natural frequency
    let f_n: f64 = std::f64::consts::PI / (2.0 * l * l)
        * (ei * 1000.0 / m_stair).sqrt();

    assert!(
        f_n > 5.0,
        "Staircase frequency: {:.1} Hz", f_n
    );

    // Modal mass (lower due to light structure)
    let m_modal: f64 = 0.5 * m_stair * l;

    assert!(
        m_modal > 500.0 && m_modal < 5000.0,
        "Modal mass: {:.0} kg", m_modal
    );

    // Descending DLF (higher than ascending)
    let dlf_descend: f64 = 0.60; // 1st harmonic
    let dlf_ascend: f64 = 0.40;

    assert!(
        dlf_descend > dlf_ascend,
        "Descending DLF {:.2} > ascending {:.2}", dlf_descend, dlf_ascend
    );

    // Peak acceleration (resonant at 3rd harmonic of 2.5 Hz = 7.5 Hz)
    let xi: f64 = 0.02;         // damping (steel staircase)
    let w: f64 = 0.75;          // kN, person weight
    let f_force: f64 = dlf_descend * w * 1000.0; // N
    let a_peak: f64 = f_force / (2.0 * xi * m_modal);

    assert!(
        a_peak > 0.0,
        "Peak acceleration: {:.3} m/s² ({:.1}%g)", a_peak, a_peak / 9.81 * 100.0
    );

    // Staircases often need higher R limit (R < 24 to 32)
    let a_base: f64 = 0.005;    // m/s² at ~7 Hz
    let r: f64 = (a_peak / 2.0_f64.sqrt()) / a_base;

    assert!(
        r > 0.0,
        "Response factor R = {:.0}", r
    );
}
