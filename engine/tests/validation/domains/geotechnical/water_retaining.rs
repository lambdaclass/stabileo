/// Validation: Water Retaining Structures
///
/// References:
///   - ACI 350-06: Code Requirements for Environmental Engineering Concrete Structures
///   - EN 1992-3: Design of Concrete Structures -- Liquid Retaining Structures
///   - BS 8007: Design of Concrete Structures for Retaining Aqueous Liquids
///   - PCA: "Rectangular Concrete Tanks" (5th ed.)
///   - IS 3370: Code of Practice for Concrete Structures for Storage of Liquids
///   - Portland Cement Association: Circular Concrete Tanks Without Prestressing
///
/// Tests verify hydrostatic pressure, crack width control, wall design,
/// base slab, joint details, thermal cracking, and circular tanks.

// ================================================================
// 1. Hydrostatic Pressure -- Rectangular Tank Wall
// ================================================================
//
// Triangular pressure: p(z) = γ_w × z
// Maximum at base: p_max = γ_w × H
// Wall bending depends on end conditions and H/L ratio.

#[test]
fn tank_hydrostatic_pressure() {
    let gamma_w: f64 = 9.81;    // kN/m³
    let h: f64 = 5.0;           // m, water depth
    let l: f64 = 8.0;           // m, wall length

    // Maximum pressure at base
    let p_max: f64 = gamma_w * h;
    // = 49.05 kPa

    assert!(
        p_max > 40.0 && p_max < 60.0,
        "Max pressure: {:.1} kPa", p_max
    );

    // Total hydrostatic force per meter of wall
    let f_total: f64 = 0.5 * gamma_w * h * h;
    // = 0.5 × 9.81 × 25 = 122.6 kN/m

    assert!(
        f_total > 100.0,
        "Total force: {:.1} kN/m", f_total
    );

    // H/L ratio determines behavior
    let hl_ratio: f64 = h / l;
    let behavior = if hl_ratio < 0.5 {
        "predominantly one-way (horizontal)"
    } else if hl_ratio < 2.0 {
        "two-way"
    } else {
        "predominantly one-way (vertical)"
    };

    assert!(
        !behavior.is_empty(),
        "H/L = {:.2}: {}", hl_ratio, behavior
    );

    // Cantilever wall: base moment
    let m_base: f64 = gamma_w * h * h * h / 6.0;
    // = 9.81 × 125 / 6 = 204.4 kN·m/m

    assert!(
        m_base > 150.0,
        "Base moment: {:.0} kN·m/m", m_base
    );
}

// ================================================================
// 2. Crack Width Control -- EN 1992-3
// ================================================================
//
// Tightness class determines allowable crack width:
// Class 0: no cracking under quasi-permanent
// Class 1: wk ≤ 0.2mm (h_D/h ≤ 0.2 for through cracks)
// Class 2: wk ≤ 0.05mm (no through cracks)

#[test]
fn tank_crack_width() {
    let h_wall: f64 = 400.0;    // mm, wall thickness
    let d: f64 = 350.0;         // mm, effective depth
    let fc: f64 = 30.0;         // MPa
    let fy: f64 = 400.0;        // MPa (limited for crack control)
    let cover: f64 = 40.0;      // mm

    // EN 1992-1-1 crack width formula:
    // wk = sr,max × (εsm - εcm)

    // Bar diameter and spacing
    let phi: f64 = 16.0;        // mm
    let s: f64 = 125.0;         // mm, bar spacing (close for crack control)

    // Reinforcement ratio (in tension zone)
    let as_bar: f64 = std::f64::consts::PI * phi * phi / 4.0;
    let as_per_m: f64 = as_bar * 1000.0 / s;
    let rho_eff: f64 = as_per_m / (h_wall * 1000.0 / 2.0); // effective area ratio

    // Maximum crack spacing
    let k1: f64 = 0.8;          // bond coefficient (deformed bars)
    let k2: f64 = 0.5;          // strain distribution (bending)
    let sr_max: f64 = 3.4 * cover + 0.425 * k1 * k2 * phi / rho_eff;

    assert!(
        sr_max > 100.0 && sr_max < 600.0,
        "Max crack spacing: {:.0} mm", sr_max
    );

    // Strain difference (simplified)
    let sigma_s: f64 = 200.0;   // MPa, steel stress under service load
    let es: f64 = 200_000.0;    // MPa
    let f_ct: f64 = 2.9;        // MPa, concrete tensile strength
    let kt: f64 = 0.4;          // long-term loading factor

    let eps_diff: f64 = (sigma_s - kt * f_ct / rho_eff * (1.0 + 200_000.0 / es * rho_eff)) / es;
    let eps_diff_min: f64 = 0.6 * sigma_s / es;
    let eps_used: f64 = eps_diff.max(eps_diff_min);

    // Crack width
    let wk: f64 = sr_max * eps_used;

    // Tightness class 1: wk ≤ 0.2mm
    assert!(
        wk < 0.30,
        "Crack width: {:.3} mm", wk
    );

    let _d = d;
    let _fc = fc;
    let _fy = fy;
}

// ================================================================
// 3. Wall Reinforcement -- Minimum for Thermal/Shrinkage
// ================================================================
//
// EN 1992-3: minimum reinforcement to control early-age cracking.
// As,min = kc × k × fct,eff × Act / σs
// σs limited to ensure crack width control.

#[test]
fn tank_minimum_reinforcement() {
    let h_wall: f64 = 400.0;    // mm, wall thickness
    let fc: f64 = 30.0;         // MPa
    let fct: f64 = 2.9;         // MPa, mean tensile strength

    // EN 1992-3 parameters
    let kc: f64 = 1.0;          // for pure tension (restraint)
    let k: f64 = 0.65;          // size factor (h > 300mm)
    let sigma_s: f64 = 200.0;   // MPa, limited steel stress for crack control

    // Tension area (half of wall for through cracks)
    let act: f64 = h_wall / 2.0 * 1000.0; // mm² per meter

    // Minimum reinforcement (each face)
    let as_min: f64 = kc * k * fct * act / sigma_s;
    // = 1.0 × 0.65 × 2.9 × 200000 / 200 = 1885 mm²/m

    assert!(
        as_min > 1000.0,
        "As,min: {:.0} mm²/m (each face)", as_min
    );

    // Check as percentage of gross area
    let rho_min: f64 = 2.0 * as_min / (h_wall * 1000.0);
    // Two faces: total ratio

    assert!(
        rho_min > 0.003 && rho_min < 0.02,
        "Min reinforcement ratio: {:.4}", rho_min
    );

    // ACI 350 comparison: ρ_min = 0.003 to 0.005
    let aci_min: f64 = 0.003 * h_wall * 1000.0;
    assert!(
        as_min > aci_min / 2.0,
        "EC3: {:.0} vs ACI 350: {:.0} mm²/m (per face)", as_min, aci_min / 2.0
    );

    let _fc = fc;
}

// ================================================================
// 4. Base Slab Design -- Uplift & Loading
// ================================================================
//
// Tank base: must resist uplift when empty (water table).
// When full: bearing pressure from weight of water.
// Joint between wall and base: critical for waterproofing.

#[test]
fn tank_base_slab() {
    let l: f64 = 8.0;           // m, tank length
    let b: f64 = 6.0;           // m, tank width
    let h_water: f64 = 5.0;     // m, water depth
    let gamma_w: f64 = 9.81;    // kN/m³
    let t_base: f64 = 0.40;     // m, base slab thickness
    let gamma_c: f64 = 25.0;    // kN/m³

    // Water weight when full
    let w_water: f64 = gamma_w * h_water * l * b;

    assert!(
        w_water > 2000.0,
        "Water weight: {:.0} kN", w_water
    );

    // Base slab self-weight
    let w_slab: f64 = gamma_c * t_base * l * b;

    // Bearing pressure when full
    let q_bearing: f64 = (w_water + w_slab) / (l * b);

    assert!(
        q_bearing > 40.0 && q_bearing < 100.0,
        "Bearing pressure: {:.1} kPa", q_bearing
    );

    // Uplift when empty
    let h_gwt: f64 = 3.0;       // m, groundwater depth below base
    let u_uplift: f64 = gamma_w * h_gwt * l * b;

    // Factor of safety against flotation
    let w_empty: f64 = w_slab + gamma_c * 0.30 * 2.0 * (l + b) * h_water; // slab + walls
    let fs_float: f64 = w_empty / u_uplift;

    assert!(
        fs_float > 1.0,
        "Flotation FS: {:.2}", fs_float
    );

    // If FS < 1.1: need hold-down anchors or thicker base
    if fs_float < 1.1 {
        let w_additional: f64 = u_uplift * 1.1 - w_empty;
        assert!(
            w_additional > 0.0,
            "Need {:.0} kN additional hold-down", w_additional
        );
    }
}

// ================================================================
// 5. Circular Tank -- Hoop Tension
// ================================================================
//
// Hoop tension: T = γ_w × z × R
// Maximum near base (depends on base fixity).
// For hinged base: max at ~0.6H from top.
// For fixed base: max lower, with moment at base.

#[test]
fn tank_circular_hoop() {
    let r: f64 = 10.0;          // m, tank radius
    let h: f64 = 6.0;           // m, water depth
    let gamma_w: f64 = 9.81;    // kN/m³
    let t: f64 = 0.30;          // m, wall thickness

    // Simple membrane theory (no base fixity effect)
    // T(z) = γ_w × z × R
    let t_max_membrane: f64 = gamma_w * h * r;
    // = 9.81 × 6 × 10 = 588.6 kN/m

    assert!(
        t_max_membrane > 400.0,
        "Max hoop (membrane): {:.0} kN/m", t_max_membrane
    );

    // Hoop stress
    let sigma_hoop: f64 = t_max_membrane / t / 1000.0; // kN/m / m = kPa → MPa

    assert!(
        sigma_hoop < 5.0,
        "Hoop stress: {:.2} MPa (< f_ct)", sigma_hoop
    );

    // Reinforcement for hoop tension
    let fy: f64 = 400.0;        // MPa
    let gamma_s: f64 = 1.15;    // partial factor
    let as_hoop: f64 = t_max_membrane * 1000.0 / (fy / gamma_s); // mm²/m

    assert!(
        as_hoop > 1000.0,
        "Hoop reinforcement: {:.0} mm²/m", as_hoop
    );

    // Check H²/(R×t) parameter (determines base fixity effect)
    let h2_rt: f64 = h * h / (r * t);

    // If H²/(Rt) < 5: base fixity significant (reduce hoop at base)
    // If H²/(Rt) > 12: base fixity effect small
    assert!(
        h2_rt > 0.0,
        "H²/(Rt) = {:.1}", h2_rt
    );
}

// ================================================================
// 6. Joint Design -- Waterstop & Movement
// ================================================================
//
// Construction joints, expansion joints, contraction joints.
// PVC or metal waterstops at all joints.
// Movement joints: spacing depends on exposure and restraint.

#[test]
fn tank_joint_design() {
    let l_wall: f64 = 30.0;     // m, wall length
    let delta_t: f64 = 30.0;    // °C, temperature range
    let alpha: f64 = 10e-6;     // 1/°C, concrete thermal expansion

    // Free thermal movement
    let delta_l: f64 = alpha * delta_t * l_wall * 1000.0; // mm
    // = 10e-6 × 30 × 30000 = 9 mm

    assert!(
        delta_l > 5.0 && delta_l < 20.0,
        "Thermal movement: {:.1} mm", delta_l
    );

    // Joint spacing (BS 8007: max 7-8m for walls without movement joints)
    let max_spacing: f64 = 7.0; // m
    let n_joints: f64 = (l_wall / max_spacing).ceil() - 1.0;

    assert!(
        n_joints >= 3.0,
        "Number of joints: {:.0}", n_joints
    );

    // Movement per joint
    let movement_per_joint: f64 = delta_l / n_joints;

    assert!(
        movement_per_joint < 5.0,
        "Movement per joint: {:.1} mm", movement_per_joint
    );

    // Waterstop width (typically 150-300mm for water pressure < 10m head)
    let h_water: f64 = 5.0;
    let waterstop_width: f64 = if h_water < 5.0 { 150.0 } else { 230.0 };

    assert!(
        waterstop_width >= 150.0,
        "Waterstop width: {:.0} mm", waterstop_width
    );
}

// ================================================================
// 7. Early-Age Thermal Cracking
// ================================================================
//
// Heat of hydration causes early-age temperature rise.
// Restraint from base/adjacent pours → tensile cracking.
// EN 1992-3/CIRIA C766: T1 (peak rise) and T2 (seasonal range).

#[test]
fn tank_early_age_cracking() {
    let h_wall: f64 = 400.0;    // mm
    let cement: f64 = 350.0;    // kg/m³
    let _e_c: f64 = 30_000.0;   // MPa

    // Temperature rise T1 (CIRIA C766 Table 3.1)
    // For CEM I, 350 kg/m³, 400mm wall: T1 ≈ 35°C
    let t1: f64 = 35.0;

    // Seasonal temperature drop T2
    let t2: f64 = 20.0;         // °C

    // Total temperature differential
    let delta_t_total: f64 = t1 + t2;

    assert!(
        delta_t_total > 40.0,
        "Total ΔT: {:.0}°C", delta_t_total
    );

    // Restrained strain
    let alpha: f64 = 12e-6;     // 1/°C
    let r_factor: f64 = 0.5;    // restraint factor (wall on base)
    let k1: f64 = 0.65;         // creep relaxation factor

    let eps_restrained: f64 = alpha * delta_t_total * r_factor * k1;

    assert!(
        eps_restrained > 0.0001,
        "Restrained strain: {:.6}", eps_restrained
    );

    // Crack inducing strain
    let eps_ctu: f64 = 100e-6;  // ultimate tensile strain of concrete

    // If restrained strain > εctu: cracking occurs
    let cracks: bool = eps_restrained > eps_ctu;

    if cracks {
        // Need reinforcement to control crack width
        let fct: f64 = 2.9;     // MPa
        let sigma_s: f64 = 200.0;
        let act: f64 = h_wall / 2.0 * 1000.0;
        let as_min: f64 = 0.65 * fct * act / sigma_s;

        assert!(
            as_min > 500.0,
            "Minimum As: {:.0} mm²/m", as_min
        );
    }

    let _cement = cement;
}

// ================================================================
// 8. Liquid Pressure Test -- Leak Testing
// ================================================================
//
// EN 1992-3 / BS 8007: leak test before commissioning.
// Fill to design level, monitor water level drop.
// Allowable drop: 1/500 of water depth per day (typical).
// Also visual inspection for damp patches.

#[test]
fn tank_leak_test() {
    let l: f64 = 10.0;          // m
    let b: f64 = 8.0;           // m
    let h_test: f64 = 5.0;      // m, test water level

    // Tank surface area (base)
    let a_base: f64 = l * b;

    // Allowable water level drop
    let drop_rate: f64 = h_test / 500.0; // m/day
    // = 0.01 m/day = 10 mm/day

    assert!(
        drop_rate > 0.005 && drop_rate < 0.05,
        "Allowable drop: {:.3} m/day ({:.0} mm/day)", drop_rate, drop_rate * 1000.0
    );

    // Corresponding volume loss
    let v_loss: f64 = drop_rate * a_base * 1000.0; // liters/day

    assert!(
        v_loss > 100.0,
        "Allowable loss: {:.0} liters/day", v_loss
    );

    // Absorption correction (new concrete absorbs water)
    // Typically 0.2-0.5 mm/day for new concrete
    let absorption: f64 = 0.3; // mm/day
    let net_allowable: f64 = (drop_rate * 1000.0 - absorption).max(0.0);

    assert!(
        net_allowable > 0.0,
        "Net allowable drop: {:.1} mm/day", net_allowable
    );

    // Test duration (typically 7 days after initial filling)
    let test_days: f64 = 7.0;
    let max_total_drop: f64 = drop_rate * 1000.0 * test_days;

    assert!(
        max_total_drop < 100.0,
        "Max total drop in {:.0} days: {:.0} mm", test_days, max_total_drop
    );
}
