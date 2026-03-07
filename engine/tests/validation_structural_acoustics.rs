/// Validation: Structural Acoustics & Sound Insulation
///
/// References:
///   - Cremer, Heckl & Petersson: "Structure-Borne Sound" 3rd ed. (2005)
///   - EN 12354: Building Acoustics — Estimation of acoustic performance
///   - ASTM E413: Classification for Rating Sound Insulation (STC)
///   - ISO 140 / ISO 717: Acoustics — Rating of sound insulation
///   - Beranek & Ver: "Noise and Vibration Control Engineering" 2nd ed. (2006)
///   - Fahy & Gardonio: "Sound and Structural Vibration" 2nd ed. (2007)
///   - Sharp: "Prediction Methods for the Sound Transmission of Building Elements" (1978)
///
/// Tests verify fundamental formulas in structural acoustics:
///   1. Sound transmission loss via mass law (Cremer)
///   2. STC / Rw rating calculation (ASTM E413 / ISO 717)
///   3. Coincidence frequency (Cremer, Heckl & Petersson)
///   4. Double wall resonance frequency (Sharp / Beranek)
///   5. Impact sound insulation level L_nw (EN 12354-2)
///   6. Flanking transmission (EN 12354-1)
///   7. Room acoustics — Sabine reverberation time
///   8. Vibration isolation transmissibility for noise control

mod helpers;

// ================================================================
// 1. Sound Transmission Loss — Mass Law (Cremer)
// ================================================================
//
// The field-incidence mass law predicts TL of a single homogeneous
// panel below the coincidence frequency:
//
//   TL = 20 * log10(f * m') - 47  [dB]   (field incidence)
//
// where f = frequency [Hz], m' = surface mass density [kg/m^2].
//
// Normal-incidence mass law:
//   TL_0 = 20 * log10(pi * f * m' / (rho_0 * c_0)) [dB]
//
// For typical concrete slab: m' = 2400 kg/m^3 * 0.15 m = 360 kg/m^2.
// At 500 Hz: TL = 20*log10(500*360) - 47 = 20*log10(180000) - 47
//          = 20*5.2553 - 47 = 105.1 - 47 = 58.1 dB

#[test]
fn validation_acoustics_mass_law_tl() {
    let rho_concrete: f64 = 2400.0;   // kg/m^3
    let thickness: f64 = 0.15;         // m (150 mm slab)
    let m_surface: f64 = rho_concrete * thickness;  // 360 kg/m^2

    // Field-incidence mass law: TL = 20*log10(f*m') - 47
    let f_test: f64 = 500.0;  // Hz
    let tl_field: f64 = 20.0 * (f_test * m_surface).log10() - 47.0;
    let tl_expected: f64 = 20.0 * (180_000.0_f64).log10() - 47.0;

    assert!(
        (tl_field - tl_expected).abs() < 0.1,
        "Field mass law: TL = {:.1} dB, expected {:.1} dB", tl_field, tl_expected
    );

    // TL should be approximately 58 dB for 150mm concrete at 500 Hz
    assert!(
        tl_field > 55.0 && tl_field < 62.0,
        "150mm concrete at 500 Hz: TL = {:.1} dB, expected ~58 dB", tl_field
    );

    // Mass law: doubling mass increases TL by ~6 dB
    let m_double: f64 = 2.0 * m_surface;
    let tl_double: f64 = 20.0 * (f_test * m_double).log10() - 47.0;
    let delta_tl: f64 = tl_double - tl_field;

    assert!(
        (delta_tl - 6.0).abs() < 0.1,
        "Doubling mass: delta_TL = {:.2} dB, expected 6.0 dB", delta_tl
    );

    // Mass law: doubling frequency increases TL by ~6 dB
    let f_double: f64 = 2.0 * f_test;
    let tl_fdouble: f64 = 20.0 * (f_double * m_surface).log10() - 47.0;
    let delta_tl_f: f64 = tl_fdouble - tl_field;

    assert!(
        (delta_tl_f - 6.0).abs() < 0.1,
        "Doubling frequency: delta_TL = {:.2} dB, expected 6.0 dB", delta_tl_f
    );
}

// ================================================================
// 2. STC / Rw Rating Calculation (ASTM E413 / ISO 717)
// ================================================================
//
// STC (Sound Transmission Class) rating per ASTM E413:
//   - Reference contour shifted in 1 dB increments to measured TL curve
//   - Sum of deficiencies (reference - measured, where measured < reference)
//     must not exceed 32 dB total
//   - No single deficiency > 8 dB
//   - STC = value of reference contour at 500 Hz
//
// The ASTM E413 reference contour shape (relative to STC value at 500 Hz):
//   125 Hz: STC - 16 dB
//   250 Hz: STC - 8 dB
//   500 Hz: STC + 0 dB
//   1000 Hz: STC + 5 dB  (then flat to 4000 Hz)
//   2000 Hz: STC + 5 dB
//   4000 Hz: STC + 5 dB

#[test]
fn validation_acoustics_stc_rating() {
    // Simplified STC reference contour offsets at standard 1/3-octave bands
    // from 125 Hz to 4000 Hz (16 bands)
    // Offsets relative to STC value: the reference contour shape
    let ref_offsets: [f64; 16] = [
        -16.0, -13.0, -10.0, -7.0, -4.0, -1.0,  // 125 - 400 Hz
          0.0,   1.0,   2.0,  3.0,  4.0,  4.0,   // 500 - 1600 Hz
          4.0,   4.0,   4.0,  4.0,                 // 2000 - 4000 Hz
    ];

    // Example measured TL values for a concrete partition (dB)
    let measured_tl: [f64; 16] = [
        28.0, 30.0, 33.0, 37.0, 41.0, 44.0,  // 125 - 400 Hz
        47.0, 50.0, 52.0, 54.0, 55.0, 56.0,  // 500 - 1600 Hz
        56.0, 56.0, 55.0, 54.0,               // 2000 - 4000 Hz
    ];

    // Find STC by iterating: start with candidate and adjust
    // STC is the highest value where total deficiency <= 32 dB
    // and no single deficiency > 8 dB
    // Search for the correct STC rating
    let mut stc: f64 = 0.0;
    let mut candidate: f64 = 30.0;
    while candidate <= 70.0 {
        let mut total_deficiency: f64 = 0.0;
        let mut max_single: f64 = 0.0;

        for i in 0..16 {
            let ref_val: f64 = candidate + ref_offsets[i];
            if ref_val > measured_tl[i] {
                let deficiency: f64 = ref_val - measured_tl[i];
                total_deficiency += deficiency;
                if deficiency > max_single {
                    max_single = deficiency;
                }
            }
        }

        if total_deficiency <= 32.0 && max_single <= 8.0 {
            stc = candidate;
        }
        candidate += 1.0;
    }

    // STC should be a reasonable rating for a concrete partition
    assert!(
        stc >= 40.0 && stc <= 60.0,
        "STC = {:.0}, expected 40-60 for concrete partition", stc
    );

    // Verify the deficiency constraint is satisfied
    let mut total_def: f64 = 0.0;
    let mut max_def: f64 = 0.0;
    for i in 0..16 {
        let ref_val: f64 = stc + ref_offsets[i];
        if ref_val > measured_tl[i] {
            let d: f64 = ref_val - measured_tl[i];
            total_def += d;
            if d > max_def {
                max_def = d;
            }
        }
    }

    assert!(
        total_def <= 32.0,
        "Total deficiency = {:.1} dB <= 32 dB", total_def
    );
    assert!(
        max_def <= 8.0,
        "Max single deficiency = {:.1} dB <= 8 dB", max_def
    );

    // Increasing STC by 1 should violate constraints
    let stc_plus1: f64 = stc + 1.0;
    let mut def_plus1: f64 = 0.0;
    let mut max_def_plus1: f64 = 0.0;
    for i in 0..16 {
        let ref_val: f64 = stc_plus1 + ref_offsets[i];
        if ref_val > measured_tl[i] {
            let d: f64 = ref_val - measured_tl[i];
            def_plus1 += d;
            if d > max_def_plus1 {
                max_def_plus1 = d;
            }
        }
    }

    assert!(
        def_plus1 > 32.0 || max_def_plus1 > 8.0,
        "STC+1 should violate constraints: total_def = {:.1}, max_def = {:.1}",
        def_plus1, max_def_plus1
    );
}

// ================================================================
// 3. Coincidence Frequency (Cremer, Heckl & Petersson)
// ================================================================
//
// The critical (coincidence) frequency is where the bending
// wavelength in the plate equals the acoustic wavelength in air:
//
//   f_c = (c_0^2 / (2*pi)) * sqrt(rho_s * h / D)
//
// where:
//   c_0 = speed of sound in air (343 m/s at 20 C)
//   rho_s = plate density [kg/m^3]
//   h = plate thickness [m]
//   D = flexural rigidity = E*h^3 / (12*(1-nu^2)) [N*m]
//
// Simplified formula:
//   f_c = c_0^2 / (2*pi*h) * sqrt(12*rho_s*(1-nu^2) / E)
//
// For 150mm concrete: f_c ~ 100-130 Hz (well below audio range)
// For 6mm glass: f_c ~ 2000-2500 Hz
// For 1mm steel: f_c ~ 12000 Hz

#[test]
fn validation_acoustics_coincidence_frequency() {
    let c_0: f64 = 343.0;        // m/s, speed of sound in air
    let pi: f64 = std::f64::consts::PI;

    // --- Concrete slab ---
    let rho_c: f64 = 2400.0;     // kg/m^3
    let e_c: f64 = 30e9;         // Pa (30 GPa)
    let nu_c: f64 = 0.2;
    let h_c: f64 = 0.15;         // m

    let fc_concrete: f64 = (c_0 * c_0 / (2.0 * pi * h_c))
        * (12.0 * rho_c * (1.0 - nu_c * nu_c) / e_c).sqrt();

    assert!(
        fc_concrete > 80.0 && fc_concrete < 180.0,
        "Concrete 150mm: f_c = {:.0} Hz, expected ~100-130 Hz", fc_concrete
    );

    // --- Glass pane ---
    let rho_g: f64 = 2500.0;     // kg/m^3
    let e_g: f64 = 70e9;         // Pa (70 GPa)
    let nu_g: f64 = 0.22;
    let h_g: f64 = 0.006;        // m (6 mm)

    let fc_glass: f64 = (c_0 * c_0 / (2.0 * pi * h_g))
        * (12.0 * rho_g * (1.0 - nu_g * nu_g) / e_g).sqrt();

    assert!(
        fc_glass > 1500.0 && fc_glass < 3000.0,
        "Glass 6mm: f_c = {:.0} Hz, expected ~2000-2500 Hz", fc_glass
    );

    // --- Steel plate ---
    let rho_s: f64 = 7800.0;     // kg/m^3
    let e_s: f64 = 200e9;        // Pa (200 GPa)
    let nu_s: f64 = 0.3;
    let h_s: f64 = 0.001;        // m (1 mm)

    let fc_steel: f64 = (c_0 * c_0 / (2.0 * pi * h_s))
        * (12.0 * rho_s * (1.0 - nu_s * nu_s) / e_s).sqrt();

    assert!(
        fc_steel > 10000.0 && fc_steel < 15000.0,
        "Steel 1mm: f_c = {:.0} Hz, expected ~12000 Hz", fc_steel
    );

    // f_c scales inversely with thickness (for same material)
    let h_g2: f64 = 0.012;  // 12 mm glass (double thickness)
    let fc_glass2: f64 = (c_0 * c_0 / (2.0 * pi * h_g2))
        * (12.0 * rho_g * (1.0 - nu_g * nu_g) / e_g).sqrt();

    let ratio: f64 = fc_glass / fc_glass2;
    assert!(
        (ratio - 2.0).abs() < 0.01,
        "Doubling thickness halves f_c: ratio = {:.3}, expected 2.0", ratio
    );
}

// ================================================================
// 4. Double Wall Resonance Frequency (Sharp / Beranek)
// ================================================================
//
// The mass-air-mass resonance of a double wall system:
//
//   f_0 = (1 / (2*pi)) * sqrt(rho_0 * c_0^2 * (1/m1' + 1/m2') / d)
//
// where:
//   m1', m2' = surface mass densities of the two leaves [kg/m^2]
//   d = air gap depth [m]
//   rho_0 = air density [kg/m^3]
//   c_0 = speed of sound in air [m/s]
//
// Below f_0: double wall behaves as single wall of combined mass.
// Above f_0: TL increases at ~12 dB/octave (vs 6 dB/octave for single).
//
// For 2x 12.5mm gypsum + 100mm air gap:
//   m1' = m2' = 10 kg/m^2, d = 0.1 m
//   f_0 ≈ 66 Hz

#[test]
fn validation_acoustics_double_wall_resonance() {
    let rho_0: f64 = 1.21;       // kg/m^3, air density
    let c_0: f64 = 343.0;        // m/s
    let pi: f64 = std::f64::consts::PI;

    // --- Standard double gypsum wall ---
    let m1: f64 = 10.0;          // kg/m^2, 12.5mm gypsum
    let m2: f64 = 10.0;          // kg/m^2, 12.5mm gypsum
    let d: f64 = 0.100;          // m, air gap

    let f_0: f64 = (1.0 / (2.0 * pi))
        * (rho_0 * c_0 * c_0 * (1.0 / m1 + 1.0 / m2) / d).sqrt();

    assert!(
        f_0 > 50.0 && f_0 < 90.0,
        "Double gypsum wall: f_0 = {:.1} Hz, expected ~66 Hz", f_0
    );

    // --- Increasing air gap lowers resonance frequency ---
    let d_large: f64 = 0.200;    // m, double the air gap
    let f_0_large: f64 = (1.0 / (2.0 * pi))
        * (rho_0 * c_0 * c_0 * (1.0 / m1 + 1.0 / m2) / d_large).sqrt();

    // f_0 scales as 1/sqrt(d), so doubling d reduces f_0 by sqrt(2)
    let gap_ratio: f64 = f_0 / f_0_large;
    assert!(
        (gap_ratio - 2.0_f64.sqrt()).abs() < 0.01,
        "Doubling gap: f_0 ratio = {:.3}, expected {:.3}", gap_ratio, 2.0_f64.sqrt()
    );

    // --- Heavier leaves lower resonance ---
    let m1_heavy: f64 = 20.0;    // kg/m^2 (doubled mass)
    let m2_heavy: f64 = 20.0;
    let f_0_heavy: f64 = (1.0 / (2.0 * pi))
        * (rho_0 * c_0 * c_0 * (1.0 / m1_heavy + 1.0 / m2_heavy) / d).sqrt();

    assert!(
        f_0_heavy < f_0,
        "Heavier leaves: f_0 = {:.1} Hz < {:.1} Hz", f_0_heavy, f_0
    );

    // For equal leaves doubled: f_0 scales as 1/sqrt(m'), so factor = sqrt(2)
    let mass_ratio: f64 = f_0 / f_0_heavy;
    assert!(
        (mass_ratio - 2.0_f64.sqrt()).abs() < 0.01,
        "Doubling both masses: f_0 ratio = {:.3}, expected {:.3}",
        mass_ratio, 2.0_f64.sqrt()
    );
}

// ================================================================
// 5. Impact Sound Insulation Level L_nw (EN 12354-2)
// ================================================================
//
// The normalized impact sound pressure level for a bare homogeneous
// slab (Cremer / EN 12354-2):
//
//   L_n = 164 - 35 * log10(f * m')  [dB]
//
// where f = frequency [Hz], m' = surface mass density [kg/m^2].
//
// The weighted normalized impact sound level L_nw is determined by
// fitting the ISO 717-2 reference curve to the L_n spectrum.
//
// Adding a floating floor reduces L_n by:
//   delta_L = 40 * log10(f / f_r) for f > f_r [dB]
//
// where f_r = resonance frequency of the floating floor system:
//   f_r = (1/(2*pi)) * sqrt(s' / m_f)
//
// s' = dynamic stiffness per unit area [MN/m^3]
// m_f = surface mass density of floating floor [kg/m^2]

#[test]
fn validation_acoustics_impact_sound_insulation() {
    let pi: f64 = std::f64::consts::PI;

    // --- Bare slab L_n ---
    let m_slab: f64 = 360.0;     // kg/m^2, 150mm concrete
    let f_test: f64 = 500.0;     // Hz

    let ln_bare: f64 = 164.0 - 35.0 * (f_test * m_slab).log10();
    // = 164 - 35 * log10(180000) = 164 - 35 * 5.2553 = 164 - 183.9 = -19.9
    // Note: negative L_n indicates very heavy slab, typical range for heavy slabs

    let ln_expected: f64 = 164.0 - 35.0 * (180_000.0_f64).log10();
    assert!(
        (ln_bare - ln_expected).abs() < 0.1,
        "L_n bare: {:.1} dB, expected {:.1} dB", ln_bare, ln_expected
    );

    // Mass law for impact: doubling mass reduces L_n
    let m_double: f64 = 2.0 * m_slab;
    let ln_double: f64 = 164.0 - 35.0 * (f_test * m_double).log10();
    let delta_ln_mass: f64 = ln_bare - ln_double;

    // delta = 35 * log10(2) = 35 * 0.3010 = 10.5 dB
    assert!(
        (delta_ln_mass - 35.0 * 2.0_f64.log10()).abs() < 0.1,
        "Doubling mass reduces L_n by {:.1} dB, expected {:.1} dB",
        delta_ln_mass, 35.0 * 2.0_f64.log10()
    );

    // --- Floating floor improvement ---
    let s_prime: f64 = 10.0e6;   // N/m^3 (dynamic stiffness per unit area)
    let m_floor: f64 = 80.0;     // kg/m^2, floating floor mass

    // Resonance frequency of floating floor
    let f_r: f64 = (1.0 / (2.0 * pi)) * (s_prime / m_floor).sqrt();
    // = 1/(2*pi) * sqrt(10e6 / 80) = 1/(2*pi) * 353.6 = 56.3 Hz

    assert!(
        f_r > 40.0 && f_r < 80.0,
        "Floating floor resonance: f_r = {:.1} Hz, expected ~56 Hz", f_r
    );

    // Improvement at 500 Hz (well above f_r):
    let delta_l: f64 = 40.0 * (f_test / f_r).log10();

    assert!(
        delta_l > 30.0 && delta_l < 50.0,
        "Floating floor improvement at 500 Hz: {:.1} dB", delta_l
    );

    // L_n with floating floor
    let _ln_improved: f64 = ln_bare - delta_l;
}

// ================================================================
// 6. Flanking Transmission (EN 12354-1)
// ================================================================
//
// Total sound reduction index including flanking paths:
//
//   R'_w = -10 * log10(10^(-R_direct/10) + SUM(10^(-R_flank_j/10)))
//
// where R_direct = direct path TL, R_flank_j = flanking path TL.
//
// The flanking transmission of path ij:
//   R_ij = (R_i + R_j) / 2 + delta_R_ij + K_ij + 10*log10(S_s / (l_ij * l_f))
//
// Simplified: flanking reduces apparent TL. For N equal flanking
// paths each with R_flank:
//   R'_w = -10*log10(10^(-R_d/10) + N*10^(-R_f/10))

#[test]
fn validation_acoustics_flanking_transmission() {
    // --- Direct path + flanking paths ---
    let r_direct: f64 = 55.0;    // dB, separating element TL

    // 4 major flanking paths, each with R_flank = 65 dB
    let r_flank: f64 = 65.0;     // dB per flanking path
    let n_flanking: f64 = 4.0;

    // Total apparent R'
    let tau_direct: f64 = 10.0_f64.powf(-r_direct / 10.0);
    let tau_flank_total: f64 = n_flanking * 10.0_f64.powf(-r_flank / 10.0);
    let r_apparent: f64 = -10.0 * (tau_direct + tau_flank_total).log10();

    // R' < R_direct (flanking always degrades)
    assert!(
        r_apparent < r_direct,
        "Apparent R' = {:.1} dB < direct R = {:.1} dB", r_apparent, r_direct
    );

    // Flanking degradation should be modest for R_flank >> R_direct
    let degradation: f64 = r_direct - r_apparent;
    assert!(
        degradation > 0.0 && degradation < 5.0,
        "Flanking degradation = {:.1} dB (expected < 5 dB for R_f >> R_d)", degradation
    );

    // --- When flanking path equals direct path ---
    let r_flank_equal: f64 = r_direct;
    let tau_flank_eq: f64 = n_flanking * 10.0_f64.powf(-r_flank_equal / 10.0);
    let r_apparent_eq: f64 = -10.0 * (tau_direct + tau_flank_eq).log10();

    // With 4 equal flanking + 1 direct = 5 equal paths
    // R' = R - 10*log10(5) = R - 7.0 dB
    let expected_reduction: f64 = 10.0 * (1.0 + n_flanking).log10();
    let actual_reduction: f64 = r_direct - r_apparent_eq;

    assert!(
        (actual_reduction - expected_reduction).abs() < 0.1,
        "Equal paths reduction: {:.2} dB, expected {:.2} dB",
        actual_reduction, expected_reduction
    );

    // --- Improving direct path alone has diminishing returns ---
    let r_direct_improved: f64 = 65.0;  // +10 dB improvement to direct
    let tau_direct_imp: f64 = 10.0_f64.powf(-r_direct_improved / 10.0);
    // Flanking paths remain at 65 dB each
    let r_apparent_imp: f64 = -10.0 * (tau_direct_imp + tau_flank_total).log10();

    let improvement: f64 = r_apparent_imp - r_apparent;
    assert!(
        improvement < 10.0,
        "10 dB direct improvement yields only {:.1} dB apparent improvement",
        improvement
    );
}

// ================================================================
// 7. Room Acoustics — Sabine Reverberation Time
// ================================================================
//
// Sabine equation for reverberation time:
//
//   T_60 = 0.161 * V / A  [seconds]
//
// where:
//   V = room volume [m^3]
//   A = total absorption [m^2 Sabins] = SUM(alpha_i * S_i)
//   alpha_i = absorption coefficient of surface i
//   S_i = area of surface i [m^2]
//
// Eyring equation (more accurate for high absorption):
//   T_60 = 0.161 * V / (-S * ln(1 - alpha_bar))
//
// where alpha_bar = A / S_total (average absorption coefficient).
//
// For low absorption: Eyring -> Sabine (as alpha_bar -> 0,
//   -ln(1-alpha) -> alpha).

#[test]
fn validation_acoustics_sabine_reverberation() {
    // --- Standard rectangular room ---
    let length: f64 = 8.0;   // m
    let width: f64 = 6.0;    // m
    let height: f64 = 3.0;   // m
    let volume: f64 = length * width * height;  // 144 m^3

    // Surface areas
    let s_floor: f64 = length * width;                      // 48 m^2
    let s_ceiling: f64 = s_floor;                            // 48 m^2
    let s_walls: f64 = 2.0 * (length + width) * height;     // 84 m^2
    let _s_total: f64 = s_floor + s_ceiling + s_walls;       // 180 m^2

    // Absorption coefficients at 500 Hz (typical)
    let alpha_floor: f64 = 0.05;     // hard floor (concrete/tile)
    let alpha_ceiling: f64 = 0.70;   // acoustic ceiling tiles
    let alpha_walls: f64 = 0.10;     // plastered walls

    // Total absorption (Sabins)
    let a_total: f64 = alpha_floor * s_floor
        + alpha_ceiling * s_ceiling
        + alpha_walls * s_walls;
    // = 0.05*48 + 0.70*48 + 0.10*84 = 2.4 + 33.6 + 8.4 = 44.4 m^2

    // Sabine reverberation time
    let t60_sabine: f64 = 0.161 * volume / a_total;
    // = 0.161 * 144 / 44.4 = 23.184 / 44.4 = 0.522 s

    assert!(
        t60_sabine > 0.3 && t60_sabine < 1.0,
        "T60 (Sabine) = {:.2} s, expected 0.3-1.0 s for treated room", t60_sabine
    );

    // --- Eyring equation (more accurate for high absorption) ---
    let alpha_bar: f64 = a_total / _s_total;
    let t60_eyring: f64 = 0.161 * volume / (-_s_total * (1.0 - alpha_bar).ln());

    // Eyring gives shorter T60 than Sabine (always)
    assert!(
        t60_eyring <= t60_sabine,
        "Eyring T60 = {:.3} s <= Sabine T60 = {:.3} s", t60_eyring, t60_sabine
    );

    // For moderate absorption, difference should be small
    let diff_pct: f64 = (t60_sabine - t60_eyring) / t60_sabine * 100.0;
    assert!(
        diff_pct < 20.0,
        "Sabine vs Eyring difference: {:.1}%", diff_pct
    );

    // --- Doubling absorption halves T60 ---
    let a_doubled: f64 = 2.0 * a_total;
    let t60_doubled: f64 = 0.161 * volume / a_doubled;
    let ratio: f64 = t60_sabine / t60_doubled;

    assert!(
        (ratio - 2.0).abs() < 0.01,
        "Doubling absorption halves T60: ratio = {:.3}", ratio
    );

    // --- Larger room has longer T60 for same finishes ---
    let volume_large: f64 = 2.0 * volume;
    // Scale surfaces by cube root ratio (for geometrically similar room)
    let scale: f64 = 2.0_f64.powf(1.0 / 3.0);
    let a_large: f64 = a_total * scale * scale;  // surfaces scale as L^2
    let t60_large: f64 = 0.161 * volume_large / a_large;

    assert!(
        t60_large > t60_sabine,
        "Larger room: T60 = {:.2} s > {:.2} s", t60_large, t60_sabine
    );
}

// ================================================================
// 8. Vibration Isolation Transmissibility for Noise Control
// ================================================================
//
// The force transmissibility of a SDOF vibration isolation system:
//
//   T = sqrt((1 + (2*zeta*r)^2) / ((1 - r^2)^2 + (2*zeta*r)^2))
//
// where r = f/f_n (frequency ratio), zeta = damping ratio.
//
// For undamped case (zeta = 0):
//   T = 1 / |1 - r^2|
//
// Isolation occurs when r > sqrt(2) (i.e., f > sqrt(2) * f_n).
// For r >> 1: T -> 1/r^2 = (f_n/f)^2.
//
// The isolation mount natural frequency:
//   f_n = (1/(2*pi)) * sqrt(k/m)
//
// Insertion loss in dB:
//   IL = 20 * log10(1/T) = -20 * log10(T)

#[test]
fn validation_acoustics_vibration_isolation() {
    let pi: f64 = std::f64::consts::PI;

    // --- SDOF transmissibility ---
    let zeta: f64 = 0.05;        // light damping (rubber mount)
    let f_n: f64 = 10.0;         // Hz, natural frequency of isolator

    // Transmissibility function
    let transmissibility = |f: f64, fn_: f64, z: f64| -> f64 {
        let r: f64 = f / fn_;
        let num: f64 = 1.0 + (2.0 * z * r).powi(2);
        let den: f64 = (1.0 - r * r).powi(2) + (2.0 * z * r).powi(2);
        (num / den).sqrt()
    };

    // At resonance (r = 1): T = 1/(2*zeta) for lightly damped
    let t_resonance: f64 = transmissibility(f_n, f_n, zeta);
    let t_res_approx: f64 = 1.0 / (2.0 * zeta);

    assert!(
        (t_resonance - t_res_approx).abs() / t_res_approx < 0.05,
        "T at resonance: {:.1}, approx {:.1}", t_resonance, t_res_approx
    );

    // At r = sqrt(2): T = 1 (crossover point, approximately for low damping)
    let f_crossover: f64 = f_n * 2.0_f64.sqrt();
    let t_crossover: f64 = transmissibility(f_crossover, f_n, zeta);

    assert!(
        (t_crossover - 1.0).abs() < 0.2,
        "T at sqrt(2)*f_n: {:.3}, expected ~1.0", t_crossover
    );

    // Well above resonance (r = 5): effective isolation
    let f_high: f64 = 5.0 * f_n;  // 50 Hz
    let t_high: f64 = transmissibility(f_high, f_n, zeta);

    // For r >> 1, T -> 1/r^2 = 1/25 = 0.04 (undamped)
    assert!(
        t_high < 0.1,
        "T at 5*f_n: {:.4}, expected < 0.1 (good isolation)", t_high
    );

    // Insertion loss
    let il_high: f64 = -20.0 * t_high.log10();
    assert!(
        il_high > 20.0,
        "Insertion loss at 5*f_n: {:.1} dB, expected > 20 dB", il_high
    );

    // --- Lower f_n provides better isolation at operating frequency ---
    let f_operating: f64 = 50.0;  // Hz, machine operating frequency

    let f_n1: f64 = 10.0;  // softer mount
    let f_n2: f64 = 20.0;  // stiffer mount
    let t1: f64 = transmissibility(f_operating, f_n1, zeta);
    let t2: f64 = transmissibility(f_operating, f_n2, zeta);

    assert!(
        t1 < t2,
        "Softer mount (f_n={:.0} Hz): T = {:.4} < stiffer (f_n={:.0} Hz): T = {:.4}",
        f_n1, t1, f_n2, t2
    );

    // --- Static deflection related to natural frequency ---
    // f_n = (1/(2*pi)) * sqrt(g / delta_st)
    // delta_st = g / (2*pi*f_n)^2
    let g: f64 = 9.81;  // m/s^2
    let delta_st: f64 = g / (2.0 * pi * f_n).powi(2);
    // For f_n = 10 Hz: delta_st = 9.81 / (62.83)^2 = 9.81 / 3948 = 2.48 mm

    assert!(
        delta_st > 0.001 && delta_st < 0.01,
        "Static deflection for f_n = {:.0} Hz: {:.2} mm", f_n, delta_st * 1000.0
    );

    // Halving f_n quadruples static deflection
    let f_n_half: f64 = f_n / 2.0;
    let delta_st_half: f64 = g / (2.0 * pi * f_n_half).powi(2);
    let defl_ratio: f64 = delta_st_half / delta_st;

    assert!(
        (defl_ratio - 4.0).abs() < 0.01,
        "Halving f_n quadruples deflection: ratio = {:.3}", defl_ratio
    );
}
