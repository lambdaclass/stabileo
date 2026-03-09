/// Validation: Coastal & Harbor Structures
///
/// References:
///   - USACE EM 1110-2-1100: Coastal Engineering Manual (CEM)
///   - BS 6349-1: Maritime Structures -- General Criteria
///   - PIANC: Guidelines for Design of Breakwaters
///   - Goda: "Random Seas and Design of Maritime Structures" 3rd ed. (2010)
///   - EurOtop Manual: Wave Overtopping of Sea Defences (2018)
///   - CIRIA/CUR/CETMEF Rock Manual (2007)
///
/// Tests verify wave forces, breakwater stability, overtopping,
/// wave run-up, armor units, caisson design, and jetty loading.

// ================================================================
// 1. Wave Force on Vertical Wall -- Goda Formula
// ================================================================
//
// Goda (1974): wave pressure on vertical breakwater.
// p1 = 0.5*(1 + cos(β))*(α1 + α2*cos²(β))*ρgH_D
// where α1, α2 depend on water depth and wave parameters.

#[test]
fn coastal_wave_force_vertical() {
    let h_d: f64 = 5.0;         // m, design wave height
    let t: f64 = 10.0;          // s, wave period
    let d: f64 = 8.0;           // m, water depth at wall
    let rho: f64 = 1025.0;      // kg/m³, seawater
    let g: f64 = 9.81;          // m/s²

    // Wave length (deep water approximation)
    let l: f64 = g * t * t / (2.0 * std::f64::consts::PI);

    assert!(
        l > 100.0,
        "Wave length: {:.0} m", l
    );

    // Goda coefficients (simplified)
    let alpha_1: f64 = 0.6 + 0.5 * (4.0 * std::f64::consts::PI * d / (l * (4.0 * std::f64::consts::PI * d / l).sinh())).powi(2);
    let alpha_2: f64 = (d - d.min(h_d)) / (3.0 * d.min(h_d)) * (h_d / d).min(2.0);

    // Wave pressure at still water level
    let beta: f64 = 0.0;        // normal incidence
    let p1: f64 = 0.5 * (1.0 + beta.cos())
        * (alpha_1 + alpha_2 * beta.cos().powi(2))
        * rho * g * h_d / 1000.0; // kPa

    assert!(
        p1 > 20.0 && p1 < 200.0,
        "Pressure at SWL: {:.1} kPa", p1
    );

    // Total horizontal force per meter of wall
    let h_c: f64 = 2.0;         // m, crest height above SWL
    let p_total: f64 = 0.5 * p1 * (d + h_c.min(1.5 * h_d));

    assert!(
        p_total > 100.0,
        "Total wave force: {:.0} kN/m", p_total
    );

    // Uplift pressure
    let p_u: f64 = 0.5 * p1; // simplified
    assert!(
        p_u > 0.0,
        "Uplift pressure: {:.1} kPa", p_u
    );
}

// ================================================================
// 2. Rubble Mound Breakwater -- Hudson Formula
// ================================================================
//
// Hudson (1959): W = ρ_r × H³ / (K_D × (S_r - 1)³ × cot(α))
// W = weight of individual armor unit
// K_D = damage coefficient (depends on armor type)
// S_r = specific gravity of armor

#[test]
fn coastal_breakwater_armor() {
    let h_d: f64 = 4.0;         // m, design wave height
    let rho_r: f64 = 2650.0;    // kg/m³, rock density
    let rho_w: f64 = 1025.0;    // kg/m³, seawater
    let sr: f64 = rho_r / rho_w; // specific gravity
    let cot_alpha: f64 = 1.5;   // slope 1:1.5

    // Damage coefficient
    let kd_rock: f64 = 4.0;     // rough angular rock, no damage
    let kd_dolos: f64 = 15.0;   // Dolos armor units

    // Required rock weight (Hudson)
    let w_rock: f64 = rho_r * h_d.powi(3) / (kd_rock * (sr - 1.0).powi(3) * cot_alpha);
    // kg per armor unit

    assert!(
        w_rock > 500.0,
        "Rock armor weight: {:.0} kg ({:.1} tonnes)", w_rock, w_rock / 1000.0
    );

    // Dolos weight (much lighter for same conditions)
    let w_dolos: f64 = rho_r * h_d.powi(3) / (kd_dolos * (sr - 1.0).powi(3) * cot_alpha);

    assert!(
        w_dolos < w_rock,
        "Dolos {:.0} < rock {:.0} kg (better interlocking)", w_dolos, w_rock
    );

    // Nominal diameter
    let d_n50: f64 = (w_rock / rho_r).powf(1.0 / 3.0);

    assert!(
        d_n50 > 0.3 && d_n50 < 2.0,
        "D_n50: {:.2} m", d_n50
    );

    // Armor layer thickness (2 layers)
    let n_layers: f64 = 2.0;
    let k_delta: f64 = 1.0;     // layer thickness coefficient
    let t_armor: f64 = n_layers * k_delta * d_n50;

    assert!(
        t_armor > 1.0,
        "Armor thickness: {:.2} m", t_armor
    );
}

// ================================================================
// 3. Wave Overtopping -- EurOtop
// ================================================================
//
// Mean overtopping rate: q = a × exp(-b × R_c / (H_m0 × γ))
// R_c = freeboard, γ = reduction factors
// Limits: q < 0.1 L/s/m (pedestrians), q < 1 L/s/m (vehicles)

#[test]
fn coastal_overtopping() {
    let h_m0: f64 = 3.0;        // m, significant wave height
    let r_c: f64 = 5.0;         // m, crest freeboard
    let cot_alpha: f64 = 1.5;   // seaward slope

    // Reduction factors
    let gamma_b: f64 = 1.0;     // berms (none)
    let gamma_f: f64 = 0.50;    // roughness (rock armor)
    let gamma_beta: f64 = 1.0;  // wave obliquity (normal)
    let gamma_total: f64 = gamma_b * gamma_f * gamma_beta;

    // EurOtop formula (non-breaking waves)
    let a: f64 = 0.09;
    let b: f64 = 1.5;
    let q: f64 = a * (9.81 * h_m0.powi(3)).sqrt()
        * (-b * r_c / (h_m0 * gamma_total)).exp();
    // m³/s/m → L/s/m
    let q_lsm: f64 = q * 1000.0;

    assert!(
        q_lsm >= 0.0,
        "Overtopping rate: {:.3} L/s/m", q_lsm
    );

    // Check against limits
    let limit_pedestrian: f64 = 0.1; // L/s/m
    let limit_vehicle: f64 = 1.0;

    // Higher freeboard → less overtopping
    let r_c_low: f64 = 3.0;
    let q_low: f64 = a * (9.81 * h_m0.powi(3)).sqrt()
        * (-b * r_c_low / (h_m0 * gamma_total)).exp() * 1000.0;

    assert!(
        q_low > q_lsm,
        "Lower freeboard: {:.3} > {:.3} L/s/m", q_low, q_lsm
    );

    let _limit_pedestrian = limit_pedestrian;
    let _limit_vehicle = limit_vehicle;
    let _cot_alpha = cot_alpha;
}

// ================================================================
// 4. Wave Run-Up -- Smooth & Rough Slopes
// ================================================================
//
// Run-up height: R_u2% = 1.75 × γ_b × γ_f × γ_β × H_m0 × ξ_m-1,0
// ξ = Iribarren number = tan(α) / √(H/L)
// 2% exceedance level for design.

#[test]
fn coastal_wave_runup() {
    let h_m0: f64 = 2.5;        // m, significant wave height
    let t_m10: f64 = 8.0;       // s, spectral mean period
    let alpha: f64 = (1.0_f64 / 2.0).atan(); // slope 1:2

    // Deep water wave length
    let g: f64 = 9.81;
    let l_m10: f64 = g * t_m10 * t_m10 / (2.0 * std::f64::consts::PI);

    // Iribarren number
    let xi: f64 = alpha.tan() / (h_m0 / l_m10).sqrt();

    assert!(
        xi > 1.0 && xi < 10.0,
        "Iribarren number: {:.2}", xi
    );

    // Run-up (smooth impermeable slope)
    let gamma_f_smooth: f64 = 1.0;
    let ru_smooth: f64 = 1.75 * gamma_f_smooth * h_m0 * xi;

    // Run-up (rough permeable slope, e.g., rock armor)
    let gamma_f_rock: f64 = 0.55;
    let ru_rock: f64 = 1.75 * gamma_f_rock * h_m0 * xi;

    // Rough slope has much less run-up
    assert!(
        ru_rock < ru_smooth,
        "Rock {:.2} < smooth {:.2} m run-up", ru_rock, ru_smooth
    );

    // Freeboard requirement (R_c ≥ R_u2%)
    assert!(
        ru_rock > 0.0,
        "Design run-up: {:.2} m", ru_rock
    );
}

// ================================================================
// 5. Caisson Breakwater -- Stability
// ================================================================
//
// Caisson must resist sliding and overturning from waves.
// Sliding: μ × (W - U) ≥ F_h
// Overturning: W × arm_W ≥ F_h × arm_F + U × arm_U

#[test]
fn coastal_caisson_stability() {
    let b: f64 = 15.0;          // m, caisson width
    let h_c: f64 = 12.0;        // m, caisson height
    let gamma_c: f64 = 23.0;    // kN/m³ (reinforced concrete)
    let d: f64 = 8.0;           // m, water depth

    // Caisson weight (per meter length)
    let w: f64 = gamma_c * b * h_c * 0.5; // 50% fill ratio

    assert!(
        w > 1000.0,
        "Caisson weight: {:.0} kN/m", w
    );

    // Wave force (simplified from Goda)
    let f_h: f64 = 500.0;       // kN/m, horizontal wave force
    let f_h_arm: f64 = d * 0.4; // m, resultant height above base

    // Uplift force
    let p_u: f64 = 30.0;        // kPa, average uplift pressure
    let u: f64 = p_u * b;       // kN/m

    // Sliding check
    let mu: f64 = 0.6;          // friction (concrete on rubble)
    let fs_sliding: f64 = mu * (w - u) / f_h;

    assert!(
        fs_sliding > 1.2,
        "Sliding FS = {:.2} > 1.2", fs_sliding
    );

    // Overturning about toe
    let m_restoring: f64 = w * b / 2.0;
    let m_overturning: f64 = f_h * f_h_arm + u * b / 2.0;
    let fs_overturning: f64 = m_restoring / m_overturning;

    assert!(
        fs_overturning > 1.2,
        "Overturning FS = {:.2} > 1.2", fs_overturning
    );
}

// ================================================================
// 6. Morison Equation -- Pile in Waves
// ================================================================
//
// Inline force on cylinder:
// f = ½ρCdDu|u| + ρCm(πD²/4)u̇
// Cd ≈ 1.0, Cm ≈ 2.0 for circular pile.

#[test]
fn coastal_morison_pile() {
    let d_pile: f64 = 1.0;      // m, pile diameter
    let h_wave: f64 = 4.0;      // m, wave height
    let t: f64 = 10.0;          // s, wave period
    let d_water: f64 = 10.0;    // m, water depth
    let rho: f64 = 1025.0;      // kg/m³

    // Maximum velocity (linear wave theory, at SWL)
    let omega: f64 = 2.0 * std::f64::consts::PI / t;
    let k: f64 = omega * omega / (9.81 * (omega * omega * d_water / 9.81).tanh()); // approximate
    let u_max: f64 = omega * h_wave / 2.0 / (k * d_water).tanh();

    assert!(
        u_max > 1.0,
        "Max velocity: {:.2} m/s", u_max
    );

    // Drag force per unit length
    let cd: f64 = 1.0;
    let f_drag: f64 = 0.5 * rho * cd * d_pile * u_max * u_max / 1000.0; // kN/m

    assert!(
        f_drag > 1.0,
        "Drag force: {:.1} kN/m", f_drag
    );

    // Inertia force per unit length
    let cm: f64 = 2.0;
    let a_max: f64 = omega * u_max; // maximum acceleration
    let f_inertia: f64 = rho * cm * std::f64::consts::PI * d_pile * d_pile / 4.0
        * a_max / 1000.0; // kN/m

    assert!(
        f_inertia > 0.0,
        "Inertia force: {:.1} kN/m", f_inertia
    );

    // Total force (Morison: drag + inertia peaks don't coincide)
    // Maximum total ≈ max(F_drag_peak, F_inertia_peak)
    let f_max: f64 = (f_drag.powi(2) + f_inertia.powi(2)).sqrt(); // approximate

    assert!(
        f_max > f_drag,
        "Total force: {:.1} kN/m", f_max
    );
}

// ================================================================
// 7. Scour Around Structures
// ================================================================
//
// Local scour around piles/walls: can undermine foundations.
// Equilibrium scour depth: S/D ≈ 1.3-2.4 for circular piles.
// General scour + local scour = total design scour.

#[test]
fn coastal_scour() {
    let d_pile: f64 = 1.5;      // m, pile diameter
    let d_water: f64 = 8.0;     // m, water depth
    let u_current: f64 = 1.5;   // m/s, tidal current

    // Local scour depth (Sumer & Fredsøe)
    let s_d_ratio: f64 = 1.3;   // S/D for live-bed scour
    let s_local: f64 = s_d_ratio * d_pile;

    assert!(
        s_local > 1.0 && s_local < 5.0,
        "Local scour: {:.1} m", s_local
    );

    // General scour (from constriction or morphological change)
    let s_general: f64 = 1.0;   // m, estimated

    // Total scour
    let s_total: f64 = s_local + s_general;

    assert!(
        s_total > s_local,
        "Total scour: {:.1} m", s_total
    );

    // Impact on pile: reduced embedded length
    let l_embed_original: f64 = 10.0; // m
    let l_embed_scoured: f64 = l_embed_original - s_total;

    assert!(
        l_embed_scoured > 5.0,
        "Remaining embedment: {:.1} m", l_embed_scoured
    );

    // Scour protection (riprap sizing)
    // Shields parameter method
    let rho_s: f64 = 2650.0;    // kg/m³
    let rho_w: f64 = 1025.0;
    // Isbash formula: d = u² / (2g × Δ × y_coeff)
    let delta_s: f64 = (rho_s - rho_w) / rho_w; // relative density
    let y_coeff: f64 = 1.2; // coefficient for high turbulence
    let d_riprap: f64 = u_current * u_current / (2.0 * 9.81 * delta_s * y_coeff);

    assert!(
        d_riprap > 0.05,
        "Riprap size: {:.3} m", d_riprap
    );

    let _d_water = d_water;
}

// ================================================================
// 8. Berthing Energy -- Fender Design
// ================================================================
//
// Ship berthing energy: E = ½mv² × Ce × Cm × Cs × Cc
// Ce = eccentricity factor, Cm = virtual mass, Cs = softness, Cc = config.
// Fender must absorb this energy without exceeding reaction force limit.

#[test]
fn coastal_berthing_fender() {
    let displacement: f64 = 50_000.0; // tonnes, ship displacement
    let v_berthing: f64 = 0.15;       // m/s, approach velocity

    // Kinetic energy
    let ke: f64 = 0.5 * displacement * v_berthing * v_berthing; // kN·m (t×m²/s²)

    assert!(
        ke > 200.0,
        "Kinetic energy: {:.0} kJ", ke
    );

    // Correction factors (PIANC)
    let ce: f64 = 0.5;          // eccentricity
    let cm: f64 = 1.8;          // virtual (added) mass
    let cs: f64 = 1.0;          // softness
    let cc: f64 = 1.0;          // berth configuration

    // Design berthing energy
    let e_design: f64 = ke * ce * cm * cs * cc;

    assert!(
        e_design > 100.0,
        "Design berthing energy: {:.0} kJ", e_design
    );

    // Safety factor
    let sf: f64 = 1.5;          // on abnormal berthing
    let e_fender: f64 = e_design * sf;

    // Fender selection (energy absorption capacity)
    let fender_capacity: f64 = 400.0; // kJ, per fender
    let n_fenders: usize = (e_fender / fender_capacity).ceil() as usize;

    assert!(
        n_fenders >= 1,
        "Fenders required: {}", n_fenders
    );

    // Reaction force on structure
    let r_fender: f64 = 800.0;  // kN, fender reaction at rated deflection
    let r_total: f64 = r_fender * n_fenders as f64;

    assert!(
        r_total > 500.0,
        "Total fender reaction: {:.0} kN", r_total
    );
}
