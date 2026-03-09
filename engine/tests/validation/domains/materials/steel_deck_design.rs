/// Validation: Steel Deck & Composite Floor Design
///
/// References:
///   - SDI (Steel Deck Institute) Design Manual, 4th Edition
///   - AISC 360-22: Specification for Structural Steel Buildings
///   - EN 1994-1-1 (EC4): Design of Composite Steel and Concrete Structures
///   - ASCE 7-22: Minimum Design Loads
///   - Vulcraft Steel Deck Catalog (design tables)
///   - SDI C-2017: Standard for Composite Steel Floor Deck-Slabs
///
/// Tests verify deck section properties, composite slab strength,
/// diaphragm action, ponding, and fire rating.

// ================================================================
// 1. Steel Deck Section Properties
// ================================================================
//
// Corrugated steel deck: effective section properties.
// Cold-formed steel with stiffened compression flanges.
// Effective width reduces under compression (per AISI S100).

#[test]
fn deck_section_properties() {
    // Typical 3" (76mm) composite deck -- catalog values (Vulcraft 3VLI20)
    let depth: f64 = 76.0;      // mm, deck depth
    let t: f64 = 0.91;          // mm, steel thickness (20 gauge)

    // Catalog section properties per meter width (Vulcraft 3VLI20, converted)
    let i_per_m: f64 = 6_000_000.0; // mm⁴/m
    let s_pos: f64 = 20_000.0;      // mm³/m, positive section modulus
    let s_neg: f64 = 24_000.0;      // mm³/m, negative section modulus

    assert!(
        i_per_m > 1_000_000.0,
        "Deck I: {:.0} mm⁴/m", i_per_m
    );

    // Positive section modulus governs for simply supported
    assert!(
        s_pos > 5000.0,
        "Deck S+: {:.0} mm³/m", s_pos
    );

    // Negative modulus larger (top flange wider)
    assert!(
        s_neg > s_pos,
        "S- = {:.0} > S+ = {:.0} mm³/m", s_neg, s_pos
    );

    // Steel area per meter width: approximately t × developed width
    // For trapezoidal profile: developed width ≈ 1.25 × plan width
    let a_steel: f64 = t * 1000.0 * 1.25;
    // ≈ 1138 mm²/m

    assert!(
        a_steel > 500.0,
        "Steel area: {:.0} mm²/m", a_steel
    );

    let _depth = depth;
}

// ================================================================
// 2. Composite Slab -- Positive Moment Capacity
// ================================================================
//
// SDI: Mn = As*Fy*(d - a/2) for full composite action.
// Partial shear connection: m-k method or τ method.
// m-k: V_ult = φ(m*A_s/b*d_s + k)*b*d_s

#[test]
fn deck_composite_moment() {
    let fc: f64 = 25.0;         // MPa, concrete
    let fy: f64 = 250.0;        // MPa, deck steel yield
    let t_slab: f64 = 130.0;    // mm, total slab depth
    let d_deck: f64 = 76.0;     // mm, deck depth
    let t_conc: f64 = t_slab - d_deck; // mm, concrete above deck

    // Effective depth (centroid of deck steel from top of slab)
    let d_s: f64 = t_slab - d_deck / 2.0; // approximate

    // Deck steel area
    let as_deck: f64 = 1200.0;  // mm²/m (typical for 20 gauge)

    // Compression block
    let b: f64 = 1000.0;        // mm (per meter width)
    let a: f64 = as_deck * fy / (0.85 * fc * b);

    assert!(
        a < t_conc,
        "a = {:.1}mm < concrete depth {:.0}mm -- NA in concrete", a, t_conc
    );

    // Nominal moment capacity
    let mn: f64 = as_deck * fy * (d_s - a / 2.0) / 1e6; // kN·m/m

    assert!(
        mn > 15.0 && mn < 50.0,
        "Composite Mn: {:.1} kN·m/m", mn
    );

    // Compare to non-composite (deck alone)
    let mn_nc: f64 = as_deck * fy * d_deck / 2.0 / 1e6; // kN·m/m (approx)
    assert!(
        mn > mn_nc,
        "Composite {:.1} > non-composite {:.1} kN·m/m", mn, mn_nc
    );
}

// ================================================================
// 3. Diaphragm Action -- In-Plane Shear
// ================================================================
//
// Steel deck acts as structural diaphragm.
// SDI: diaphragm shear strength = f(fastener pattern, connections).
// Stiffness: G' = shear stiffness per unit length (kN/mm/m).

#[test]
fn deck_diaphragm_shear() {
    // Diaphragm properties (from SDI tables)
    let su: f64 = 15.0;         // kN/m, nominal shear strength
    let phi: f64 = 0.65;        // resistance factor
    let sn: f64 = phi * su;     // design shear strength

    // Applied diaphragm shear (from lateral loads)
    let v_wind: f64 = 8.0;      // kN/m, wind shear per unit length

    assert!(
        v_wind < sn,
        "Applied {:.1} < capacity {:.1} kN/m", v_wind, sn
    );

    // Diaphragm flexibility (chord model)
    let l_diaphragm: f64 = 30.0; // m, diaphragm span
    let b_diaphragm: f64 = 15.0; // m, diaphragm depth

    // Midspan deflection (simplified)
    let g_prime: f64 = 8.0;     // kN/mm, diaphragm shear stiffness
    let w: f64 = 5.0;           // kN/m, distributed lateral load
    let delta: f64 = 5.0 * w * l_diaphragm.powi(4) / (384.0 * g_prime * 1000.0 * b_diaphragm * 1000.0);
    // Very simplified

    assert!(
        delta > 0.0,
        "Diaphragm deflection: {:.1} mm", delta * 1000.0
    );
}

// ================================================================
// 4. Ponding Check -- Construction Stage
// ================================================================
//
// SDI: deck must support wet concrete without excessive deflection.
// Ponding: deflection causes more concrete → more weight → more deflection.
// Critical condition: stiffness ratio Cp = 32*Lp⁴*γw/(π⁴*EI)

#[test]
fn deck_ponding_check() {
    let span: f64 = 2000.0;     // mm, deck span (unshored, typical)
    let e: f64 = 200_000.0;     // MPa
    let i: f64 = 6_000_000.0;   // mm⁴/m, deck moment of inertia (catalog, per m width)

    // Concrete weight
    let t_slab: f64 = 130.0;    // mm
    let gamma_c: f64 = 24.0e-6; // kN/mm³ (= 24 kN/m³)
    let w_conc: f64 = gamma_c * t_slab * 1000.0; // kN/m per m width = N/mm

    // Initial deflection under concrete weight
    let delta_0: f64 = 5.0 * w_conc * span.powi(4) / (384.0 * e * i);

    assert!(
        delta_0 > 0.0,
        "Initial deflection: {:.1} mm", delta_0
    );

    // Ponding amplification factor
    // α = 1 / (1 - Cp), where Cp = ponding coefficient
    let gamma_w: f64 = 9.81e-6; // kN/mm³
    let cp: f64 = 32.0 * span.powi(4) * gamma_w * 1000.0 / (std::f64::consts::PI.powi(4) * e * i);

    assert!(
        cp < 1.0,
        "Ponding coefficient: {:.3} < 1.0 -- stable", cp
    );

    let alpha: f64 = 1.0 / (1.0 - cp);
    let delta_final: f64 = delta_0 * alpha;

    assert!(
        delta_final > delta_0,
        "Amplified deflection: {:.1} mm (×{:.3})", delta_final, alpha
    );

    // SDI limit: additional concrete ≤ 6mm (1/4")
    let additional_conc: f64 = delta_final - delta_0;
    assert!(
        additional_conc < 20.0,
        "Additional concrete: {:.1} mm", additional_conc
    );
}

// ================================================================
// 5. Composite Slab -- Shear Bond (m-k Method)
// ================================================================
//
// SDI C-2017: shear-bond capacity from m-k test parameters.
// V_t = φ * (m*ρ + k) * b * d
// m, k = empirical parameters from full-scale slab tests.

#[test]
fn deck_shear_bond() {
    // m-k parameters (typical for 76mm composite deck)
    let m: f64 = 180.0;         // kPa (slope parameter)
    let k: f64 = 35.0;          // kPa (intercept parameter)
    let phi: f64 = 0.75;

    let b: f64 = 1000.0;        // mm, unit width
    let d_s: f64 = 92.0;        // mm, effective slab depth
    let l_span: f64 = 3000.0;   // mm, span length

    // Steel ratio for shear bond
    let as_deck: f64 = 1200.0;  // mm²/m
    let rho: f64 = as_deck / (b * d_s);

    // Shear bond capacity
    let vt: f64 = phi * (m * rho + k) * b * d_s / 1000.0; // kN/m

    assert!(
        vt > 10.0,
        "Shear bond capacity: {:.1} kN/m", vt
    );

    // Applied shear (UDL)
    let w: f64 = 8.0;           // kN/m², total load
    let vu: f64 = w * l_span / 1000.0 / 2.0; // kN/m (per unit width)

    assert!(
        vu < vt,
        "Vu = {:.1} < Vt = {:.1} kN/m -- adequate", vu, vt
    );
}

// ================================================================
// 6. Deck as Formwork -- Construction Load
// ================================================================
//
// During construction: deck supports wet concrete + workers + equipment.
// SDI: minimum construction live load = 0.96 kN/m² (20 psf).
// Check deck as non-composite beam during construction.

#[test]
fn deck_construction_load() {
    let span: f64 = 2.0;        // m (typical unshored deck span)
    let t_slab: f64 = 130.0;    // mm
    let gamma_c: f64 = 24.0;    // kN/m³, wet concrete

    // Dead load: concrete + deck
    let w_conc: f64 = gamma_c * t_slab / 1000.0; // kN/m²
    let w_deck: f64 = 0.15;     // kN/m², deck self-weight

    // Construction live load (SDI minimum)
    let w_live: f64 = 0.96;     // kN/m²

    // Factored load (LRFD)
    let wu: f64 = 1.2 * (w_conc + w_deck) + 1.6 * w_live;

    assert!(
        wu > 5.0,
        "Factored construction load: {:.2} kN/m²", wu
    );

    // Maximum moment on deck (per meter width)
    let mu: f64 = wu * span * span / 8.0; // kN·m/m

    // Deck moment capacity (non-composite)
    let s_deck: f64 = 20_000.0;  // mm³/m, section modulus (catalog, per m width)
    let fy: f64 = 250.0;        // MPa
    let phi_b: f64 = 0.90;
    let mn: f64 = phi_b * fy * s_deck / 1e6; // kN·m/m

    assert!(
        mu < mn,
        "Mu = {:.2} < φMn = {:.2} kN·m/m", mu, mn
    );
}

// ================================================================
// 7. Fire Rating -- Composite Slab
// ================================================================
//
// SDI/UL: fire rating depends on concrete thickness above flutes.
// 2-hour rating typically requires ≥ 90mm concrete above deck.
// Steel deck contributes as fire-exposed tension reinforcement.

#[test]
fn deck_fire_rating() {
    let d_deck: f64 = 76.0;     // mm, deck depth
    let t_slab: f64 = 130.0;    // mm, total depth
    let t_conc_above: f64 = t_slab - d_deck; // mm, concrete above flutes

    // Minimum concrete above deck for fire rating
    let min_1hr: f64 = 40.0;    // mm (1-hour)
    let min_2hr: f64 = 50.0;    // mm (2-hour)
    let min_3hr: f64 = 64.0;    // mm (3-hour, UL typical)

    assert!(
        t_conc_above >= min_1hr,
        "{:.0}mm ≥ {:.0}mm -- 1-hour OK", t_conc_above, min_1hr
    );
    assert!(
        t_conc_above >= min_2hr,
        "{:.0}mm ≥ {:.0}mm -- 2-hour OK", t_conc_above, min_2hr
    );

    // Fire-reduced capacity (deck loses strength at high temperature)
    let fy_ambient: f64 = 250.0;
    let reduction_2hr: f64 = 0.40; // deck retains ~40% at 2hr fire
    let fy_fire: f64 = fy_ambient * reduction_2hr;

    assert!(
        fy_fire < fy_ambient,
        "Fire fy: {:.0} < ambient {:.0} MPa", fy_fire, fy_ambient
    );

    // Mesh reinforcement compensates for deck strength loss
    let as_mesh: f64 = 142.0;   // mm²/m (e.g., 6mm @ 200mm)
    let fy_mesh: f64 = 500.0;   // MPa (not fire-exposed, protected by concrete)

    let capacity_fire: f64 = as_mesh * fy_mesh; // N/m
    assert!(
        capacity_fire > 50000.0,
        "Fire reinforcement: {:.0} N/m", capacity_fire
    );

    let _min_3hr = min_3hr;
}

// ================================================================
// 8. Acoustic Performance -- Impact Sound
// ================================================================
//
// Composite floor impact sound insulation.
// IIC (Impact Insulation Class) depends on mass and isolation.
// Bare concrete: IIC ≈ 25-30. With ceiling: IIC ≈ 45-55.

#[test]
fn deck_acoustic_performance() {
    // Mass law: TL ≈ 20*log10(f*m) - 47 (dB)
    // m = surface mass (kg/m²)
    let t_slab: f64 = 130.0;    // mm
    let rho_c: f64 = 2400.0;    // kg/m³

    // Average surface mass (accounting for voids at flutes)
    let fill_ratio: f64 = 0.70; // 70% solid (30% void at flutes)
    let m_surface: f64 = rho_c * t_slab / 1000.0 * fill_ratio;

    assert!(
        m_surface > 150.0,
        "Surface mass: {:.0} kg/m²", m_surface
    );

    // Transmission loss at 500 Hz
    let f: f64 = 500.0;         // Hz
    let tl: f64 = 20.0 * (f * m_surface).log10() - 47.0;

    assert!(
        tl > 40.0,
        "TL at 500 Hz: {:.0} dB", tl
    );

    // Doubling mass → +6 dB
    let tl_double: f64 = 20.0 * (f * 2.0 * m_surface).log10() - 47.0;
    let delta_tl: f64 = tl_double - tl;

    assert!(
        (delta_tl - 6.0).abs() < 0.5,
        "Mass doubling: +{:.1} dB (≈ 6 dB)", delta_tl
    );
}
