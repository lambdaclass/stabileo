/// Validation: Deep Excavation & Earth Retaining Systems
///
/// References:
///   - Terzaghi, Peck & Mesri: "Soil Mechanics in Engineering Practice" 3rd ed. (1996)
///   - EN 1997-1 (EC7): Geotechnical Design
///   - Ou: "Deep Excavation: Theory and Practice" (2006)
///   - FHWA-NHI-06-089: Geotechnical Engineering Circular No. 4
///   - Clough & O'Rourke (1990): "Construction Induced Movements of In Situ Walls"
///   - BS 8002: Code of Practice for Earth Retaining Structures
///
/// Tests verify active/passive pressures, sheet pile design,
/// strutted excavation, base stability, and ground movements.

// ================================================================
// 1. Active Earth Pressure -- Rankine Theory
// ================================================================
//
// σa = γ*z*Ka - 2c*√Ka
// Ka = tan²(45° - φ/2) = (1-sinφ)/(1+sinφ)
// For c = 0: pressure is zero at surface, linear with depth.

#[test]
fn excavation_active_pressure() {
    let gamma: f64 = 18.0;      // kN/m³
    let phi: f64 = 30.0_f64.to_radians();
    let _c: f64 = 0.0;          // cohesionless
    let h: f64 = 8.0;           // m, excavation depth

    // Active earth pressure coefficient
    let ka: f64 = (std::f64::consts::FRAC_PI_4 - phi / 2.0).tan().powi(2);
    // = tan²(30°) = 1/3

    assert!(
        (ka - 1.0 / 3.0).abs() < 0.01,
        "Ka = {:.4} ≈ 1/3 for φ=30°", ka
    );

    // Pressure at base
    let sigma_a: f64 = gamma * h * ka;
    // = 18 * 8 * 0.333 = 48 kPa

    assert!(
        sigma_a > 40.0 && sigma_a < 60.0,
        "Active pressure at base: {:.1} kPa", sigma_a
    );

    // Total active force
    let pa: f64 = 0.5 * gamma * h * h * ka;
    // = 0.5 * 18 * 64 * 0.333 = 192 kN/m

    assert!(
        pa > 150.0,
        "Total active force: {:.0} kN/m", pa
    );

    // Acting at H/3 from base
    let y_pa: f64 = h / 3.0;
    let moment_about_base: f64 = pa * y_pa;

    assert!(
        moment_about_base > 400.0,
        "Overturning moment: {:.0} kN·m/m", moment_about_base
    );
}

// ================================================================
// 2. Passive Earth Pressure
// ================================================================
//
// σp = γ*z*Kp + 2c*√Kp
// Kp = tan²(45° + φ/2) = (1+sinφ)/(1-sinφ) = 1/Ka

#[test]
fn excavation_passive_pressure() {
    let gamma: f64 = 18.0;
    let phi: f64 = 30.0_f64.to_radians();
    let d: f64 = 4.0;           // m, embedment below excavation

    // Passive pressure coefficient
    let kp: f64 = (std::f64::consts::FRAC_PI_4 + phi / 2.0).tan().powi(2);

    // Kp = 1/Ka for Rankine
    let ka: f64 = (std::f64::consts::FRAC_PI_4 - phi / 2.0).tan().powi(2);
    let kp_check: f64 = 1.0 / ka;

    assert!(
        (kp - kp_check).abs() < 0.01,
        "Kp = {:.2} = 1/Ka = {:.2}", kp, kp_check
    );

    // Kp for φ=30°: = 3.0
    assert!(
        (kp - 3.0).abs() < 0.1,
        "Kp = {:.2} ≈ 3.0 for φ=30°", kp
    );

    // Passive force over embedment depth
    let pp: f64 = 0.5 * gamma * d * d * kp;

    // Passive >> Active for same depth
    let pa_d: f64 = 0.5 * gamma * d * d * ka;
    assert!(
        pp > pa_d * 5.0,
        "Passive/active ratio = Kp/Ka = {:.0}", kp / ka
    );
}

// ================================================================
// 3. Strutted Excavation -- Apparent Pressure
// ================================================================
//
// Terzaghi & Peck apparent pressure diagrams:
// Sand: uniform pressure = 0.65 × γ × H × Ka
// Soft clay: (γH/c > 4): maximum = γH(1 - 4c/(γH))
// Stiff clay: 0.2γH to 0.4γH

#[test]
fn excavation_apparent_pressure() {
    let gamma: f64 = 18.0;
    let h: f64 = 10.0;          // m, excavation depth

    // Sand case
    let phi: f64 = 35.0_f64.to_radians();
    let ka: f64 = (std::f64::consts::FRAC_PI_4 - phi / 2.0).tan().powi(2);
    let p_sand: f64 = 0.65 * gamma * h * ka;

    assert!(
        p_sand > 20.0 && p_sand < 50.0,
        "Apparent pressure (sand): {:.1} kPa", p_sand
    );

    // Soft clay case
    let c: f64 = 25.0;          // kPa, undrained shear strength
    let stability_number: f64 = gamma * h / c;

    assert!(
        stability_number > 4.0,
        "Stability number: {:.1} > 4 -- soft clay diagram", stability_number
    );

    let p_clay: f64 = gamma * h * (1.0 - 4.0 * c / (gamma * h));

    assert!(
        p_clay > 0.0,
        "Apparent pressure (clay): {:.1} kPa", p_clay
    );

    // Strut loads (for 3-level strut system)
    let n_struts: f64 = 3.0;
    let spacing_h: f64 = h / (n_struts + 1.0); // vertical spacing
    let strut_spacing_plan: f64 = 3.0; // m, horizontal spacing

    // Maximum strut load
    let f_strut: f64 = p_sand * spacing_h * strut_spacing_plan;

    assert!(
        f_strut > 50.0,
        "Maximum strut load: {:.0} kN", f_strut
    );
}

// ================================================================
// 4. Sheet Pile -- Cantilever Design (Free Earth Support)
// ================================================================
//
// Cantilever sheet pile: active pressure on retained side,
// passive pressure below excavation level.
// Equilibrium of moments about tie/anchor (or base for cantilever).

#[test]
fn excavation_sheet_pile() {
    let gamma: f64 = 18.0;
    let phi: f64 = 30.0_f64.to_radians();
    let h: f64 = 4.0;           // m, retained height (cantilever limit)

    let ka: f64 = (std::f64::consts::FRAC_PI_4 - phi / 2.0).tan().powi(2);
    let kp: f64 = (std::f64::consts::FRAC_PI_4 + phi / 2.0).tan().powi(2);

    // Active force
    let pa: f64 = 0.5 * gamma * h * h * ka;
    let ya: f64 = h / 3.0;      // from excavation level

    // Required embedment d: moment equilibrium
    // Passive force below excavation: Pp = 0.5*γ*d²*(Kp-Ka)
    // taking moments about base of pile:
    // Pa*(d + ya) = 0.5*γ*d²*(Kp-Ka) * d/3
    // Solve iteratively or use simplified: d ≈ 1.5H for φ=30°

    // Simplified estimation
    let d_approx: f64 = h * 1.5; // initial estimate

    // Check moment equilibrium at excavation level
    let pp_d: f64 = 0.5 * gamma * d_approx * d_approx * (kp - ka);
    let m_active: f64 = pa * (d_approx + ya);
    let m_passive: f64 = pp_d * d_approx / 3.0;

    // Factor of safety on passive
    let fs_passive: f64 = m_passive / m_active;

    assert!(
        fs_passive > 1.0,
        "Passive FS = {:.2} > 1.0", fs_passive
    );

    // Total pile length
    let total_length: f64 = h + d_approx * 1.2; // add 20% for safety
    assert!(
        total_length > 8.0,
        "Required pile length: {:.1} m", total_length
    );
}

// ================================================================
// 5. Base Heave Stability
// ================================================================
//
// Factor of safety against base heave:
// FS = Nc*cu / (γ*H - q)
// Nc depends on excavation geometry (Terzaghi: 5.7 for wide, to 7.5 narrow)

#[test]
fn excavation_base_heave() {
    let gamma: f64 = 18.0;
    let h: f64 = 10.0;          // m, excavation depth
    let cu: f64 = 50.0;         // kPa, undrained shear strength
    let b_exc: f64 = 20.0;      // m, excavation width

    // Bjerrum & Eide bearing capacity factor
    // Nc varies with H/B ratio
    let hb_ratio: f64 = h / b_exc;
    let nc: f64 = if hb_ratio < 0.5 {
        5.14 + 0.5 * hb_ratio
    } else {
        5.14 + 0.25 * (hb_ratio - 0.5) + 0.25
    };

    // Base heave FS
    let fs_heave: f64 = nc * cu / (gamma * h);

    assert!(
        fs_heave > 1.0,
        "Base heave FS = {:.2}", fs_heave
    );

    // Minimum required: FS ≥ 1.5 (typical)
    // If FS < 1.5: need deeper wall embedment or ground improvement
    let adequate: bool = fs_heave >= 1.5;
    if !adequate {
        // Need wall toe extending below base
        let toe_depth: f64 = 2.0; // m
        let fs_improved: f64 = nc * cu / (gamma * (h - toe_depth));
        assert!(
            fs_improved > fs_heave,
            "With toe: FS = {:.2} > {:.2}", fs_improved, fs_heave
        );
    }
}

// ================================================================
// 6. Ground Movement -- Settlement Profile
// ================================================================
//
// Clough & O'Rourke (1990): settlement profile behind excavation.
// Maximum settlement ≈ 0.15% to 0.5% of excavation depth.
// Settlement trough extends to 2-3 × excavation depth from wall.

#[test]
fn excavation_ground_settlement() {
    let h: f64 = 12.0;          // m, excavation depth

    // Maximum settlement (0.3% of H for average workmanship)
    let delta_max: f64 = 0.003 * h * 1000.0; // mm
    // = 36 mm

    assert!(
        delta_max > 20.0 && delta_max < 60.0,
        "Max settlement: {:.0} mm", delta_max
    );

    // Influence zone (extends 2H from wall)
    let influence: f64 = 2.0 * h; // m

    // Settlement at distance x from wall (spandrel type)
    let x: f64 = 10.0;          // m from wall
    let settlement_x: f64 = delta_max * (1.0 - x / influence).max(0.0);

    assert!(
        settlement_x < delta_max,
        "Settlement at {:.0}m: {:.0} mm", x, settlement_x
    );

    // Building damage classification (Burland 1995)
    let angular_distortion: f64 = delta_max / 1000.0 / (influence / 3.0); // rad
    let damage_category = if angular_distortion < 1.0 / 500.0 {
        "negligible to slight"
    } else if angular_distortion < 1.0 / 150.0 {
        "moderate"
    } else {
        "severe"
    };

    assert!(
        !damage_category.is_empty(),
        "Damage: {} (Δ/L = 1/{:.0})", damage_category, 1.0 / angular_distortion
    );
}

// ================================================================
// 7. Diaphragm Wall -- Structural Design
// ================================================================
//
// Reinforced concrete diaphragm wall: designed for bending + shear.
// Earth pressure + water pressure on retained side.
// Wall depth typically 20-40m, thickness 600-1500mm.

#[test]
fn excavation_diaphragm_wall() {
    let t_wall: f64 = 800.0;    // mm, wall thickness
    let d: f64 = 700.0;         // mm, effective depth
    let fc: f64 = 35.0;         // MPa
    let fy: f64 = 500.0;        // MPa
    let b: f64 = 1000.0;        // mm (per meter run)

    // Design moment (from earth + water pressure analysis)
    let m_design: f64 = 800.0;  // kN·m/m

    // Required reinforcement
    let k: f64 = m_design * 1e6 / (b * d * d * fc); // normalized moment
    let z: f64 = d * (0.5 + (0.25 - k / 1.134).sqrt().min(0.95)); // lever arm

    let as_req: f64 = m_design * 1e6 / (0.87 * fy * z);

    assert!(
        as_req > 1000.0,
        "Required As: {:.0} mm²/m", as_req
    );

    // Minimum reinforcement (0.13% of gross area)
    let as_min: f64 = 0.0013 * b * t_wall;
    assert!(
        as_req > as_min,
        "As_req {:.0} > As_min {:.0} mm²/m", as_req, as_min
    );

    // Shear check
    let v_design: f64 = 300.0;  // kN/m
    let v_stress: f64 = v_design * 1000.0 / (b * d);
    let v_rd: f64 = 0.18 * (1.0 + (200.0 / d).sqrt()) * (100.0 * as_req / (b * d) * fc).powf(1.0 / 3.0);

    assert!(
        v_stress < v_rd * 2.0,
        "Shear: {:.2} MPa", v_stress
    );
}

// ================================================================
// 8. Dewatering -- Flow into Excavation
// ================================================================
//
// Steady-state flow: Q = k × i × A (Darcy's law)
// For sheet pile cofferdam: seepage around wall toe.
// Flow net method or analytical solutions for quantity.

#[test]
fn excavation_dewatering() {
    let h_water: f64 = 6.0;     // m, water head difference
    let k_soil: f64 = 1e-4;     // m/s, soil permeability (sandy soil)
    let l_exc: f64 = 30.0;      // m, excavation length
    let b_exc: f64 = 15.0;      // m, excavation width
    let d_wall: f64 = 12.0;     // m, sheet pile depth below GWT

    // Number of equipotential drops (typical flow net)
    let n_d: f64 = 8.0;         // potential drops
    let n_f: f64 = 3.0;         // flow channels

    // Seepage flow (2D, per unit length)
    let q_2d: f64 = k_soil * h_water * n_f / n_d; // m³/s per m

    // Total flow (perimeter)
    let perimeter: f64 = 2.0 * (l_exc + b_exc);
    let q_total: f64 = q_2d * perimeter; // m³/s

    assert!(
        q_total > 0.0,
        "Seepage flow: {:.4} m³/s ({:.1} L/min)", q_total, q_total * 60000.0
    );

    // Pump capacity needed (with safety factor)
    let sf: f64 = 1.5;
    let q_pump: f64 = q_total * sf * 60.0 * 1000.0; // L/min

    assert!(
        q_pump > 1.0,
        "Required pumping: {:.0} L/min", q_pump
    );

    // Seepage velocity check (piping risk)
    let v_exit: f64 = k_soil * h_water / d_wall; // approximate exit gradient × k
    let i_exit: f64 = h_water / d_wall;
    let i_critical: f64 = 1.0;  // approximate (γ'/γw for most soils)

    let fs_piping: f64 = i_critical / i_exit;
    assert!(
        fs_piping > 1.5,
        "Piping FS = {:.2} > 1.5", fs_piping
    );

    let _v_exit = v_exit;
}
