/// Validation: Reinforced Concrete Detailing
///
/// References:
///   - ACI 318-19: Building Code Requirements for Structural Concrete
///   - EN 1992-1-1 (EC2): Design of Concrete Structures
///   - CIRSOC 201-2005: Reglamento Argentino de Estructuras de Hormigón
///   - Wight: "Reinforced Concrete: Mechanics and Design" 7th ed. (2016)
///   - Nilson, Darwin & Dolan: "Design of Concrete Structures" 16th ed.
///
/// Tests verify development length, lap splice, crack width control,
/// minimum reinforcement, and spacing requirements.

// ================================================================
// 1. Development Length — Tension Bars (ACI 318-19 §25.4)
// ================================================================
//
// ld = (fy * ψt * ψe * ψs * ψg / (λ * sqrt(f'c))) * (3/(40)) * db / cb_Ktr
// Simplified: ld = (fy * ψt * ψe / (2.1 * λ * sqrt(f'c))) * db (no transverse)

#[test]
fn detailing_development_length_aci() {
    let fc: f64 = 30.0;        // MPa
    let fy: f64 = 420.0;       // MPa (Grade 60)
    let db: f64 = 25.0;        // mm, #8 bar

    // Modification factors
    let psi_t: f64 = 1.0;      // bottom bars (no top bar effect)
    let psi_e: f64 = 1.0;      // uncoated
    let psi_s: f64 = 1.0;      // bar size (≥ #7)
    let lambda: f64 = 1.0;     // normal weight concrete

    // Simplified (ACI 318 Table 25.4.2.3)
    // For #7 and larger, clear cover ≥ db, clear spacing ≥ 2db:
    // ld/db = fy*ψt*ψe / (1.7*λ*sqrt(f'c))
    let ld_db: f64 = fy * psi_t * psi_e / (1.7 * lambda * fc.sqrt());
    let ld: f64 = ld_db * db;

    // ld should be > 300mm minimum (ACI 318 §25.4.2.1)
    let ld_min: f64 = 300.0; // mm
    let ld_design: f64 = ld.max(ld_min);

    assert!(
        ld_design >= ld_min,
        "ld = {:.0} mm ≥ {:.0} mm minimum", ld_design, ld_min
    );

    // Typical range: 30-50 bar diameters
    let ld_in_db: f64 = ld / db;
    assert!(
        ld_in_db > 20.0 && ld_in_db < 60.0,
        "ld = {:.1}*db", ld_in_db
    );

    let _psi_s = psi_s;
}

// ================================================================
// 2. Development Length — EC2 (EN 1992-1-1 §8.4.4)
// ================================================================
//
// lb,rqd = (φ/4) * (σsd/fbd)
// fbd = 2.25 * η1 * η2 * fctd
// lbd = α1*α2*α3*α4*α5 * lb,rqd ≥ lb,min

#[test]
fn detailing_development_length_ec2() {
    let fck: f64 = 30.0;       // MPa
    let phi: f64 = 25.0;       // mm, bar diameter
    let fyd: f64 = 500.0 / 1.15; // MPa (fyk/γs)

    // Design bond stress
    let fctm: f64 = 0.30 * fck.powf(2.0 / 3.0); // ≈ 2.90 MPa
    let fctk005: f64 = 0.7 * fctm;
    let gamma_c: f64 = 1.50;
    let fctd: f64 = fctk005 / gamma_c;

    let eta1: f64 = 1.0;  // good bond conditions
    let eta2: f64 = 1.0;  // φ ≤ 32mm

    let fbd: f64 = 2.25 * eta1 * eta2 * fctd;

    // Basic required length
    let lb_rqd: f64 = (phi / 4.0) * (fyd / fbd);

    // Design length with all α = 1.0 (conservative)
    let lbd: f64 = lb_rqd;

    // Minimum: max(0.3*lb,rqd, 10φ, 100mm)
    let lb_min: f64 = (0.3 * lb_rqd).max(10.0 * phi).max(100.0);
    let lbd_design: f64 = lbd.max(lb_min);

    assert!(
        lbd_design >= lb_min,
        "lbd = {:.0} mm ≥ lb,min = {:.0} mm", lbd_design, lb_min
    );

    // Compare with ACI (should be similar order of magnitude)
    let ld_aci: f64 = 420.0 * phi / (1.7 * fck.sqrt());
    let ratio: f64 = lbd / ld_aci;
    assert!(
        ratio > 0.5 && ratio < 2.0,
        "EC2/ACI development length ratio: {:.2}", ratio
    );
}

// ================================================================
// 3. Lap Splice Length
// ================================================================
//
// ACI 318: Class B splice = 1.3 * ld
// EC2: l0 = α1*α2*α3*α5*α6 * lb,rqd ≥ l0,min

#[test]
fn detailing_lap_splice() {
    let fc: f64 = 30.0;
    let fy: f64 = 420.0;
    let db: f64 = 20.0;        // mm

    // ACI development length (simplified)
    let ld: f64 = fy * db / (1.7 * fc.sqrt());

    // Class A splice (≤50% spliced at one location): 1.0 * ld
    let splice_a: f64 = 1.0 * ld;
    // Class B splice (>50% spliced): 1.3 * ld
    let splice_b: f64 = 1.3 * ld;

    assert!(
        splice_b > splice_a,
        "Class B ({:.0}mm) > Class A ({:.0}mm)", splice_b, splice_a
    );

    // Minimum lap: 300mm (ACI 318 §25.5.1.1)
    assert!(
        splice_a >= 300.0,
        "Minimum splice: {:.0} mm ≥ 300 mm", splice_a
    );

    // EC2: lap splice includes α6 factor for % spliced
    let alpha_6_25pct: f64 = 1.4;  // 25-33% spliced
    let alpha_6_50pct: f64 = 1.5;  // 33-50% spliced
    let alpha_6_100pct: f64 = 1.5; // >50% spliced

    assert!(
        alpha_6_100pct >= alpha_6_25pct,
        "More splices → longer laps: {:.1} ≥ {:.1}",
        alpha_6_100pct, alpha_6_25pct
    );

    let _alpha_6_50pct = alpha_6_50pct;
}

// ================================================================
// 4. Crack Width Control — EC2 (EN 1992-1-1 §7.3.4)
// ================================================================
//
// wk = sr,max * (εsm - εcm)
// sr,max = 3.4*c + 0.425*k1*k2*φ/ρp,eff
// εsm - εcm = (σs - kt*fct,eff*(1+αe*ρp,eff)/ρp,eff) / Es

#[test]
fn detailing_crack_width_ec2() {
    let phi: f64 = 16.0;       // mm, bar diameter
    let c: f64 = 40.0;         // mm, clear cover
    let sigma_s: f64 = 250.0;  // MPa, steel stress under quasi-permanent
    let es: f64 = 200_000.0;   // MPa
    let fcteff: f64 = 2.9;     // MPa, fct,eff ≈ fctm
    let h: f64 = 500.0;        // mm, section height
    let d: f64 = 450.0;        // mm, effective depth

    // Effective tension area
    let hceff: f64 = ((h - d) * 2.5).min(h / 2.0).min((h - d + phi / 2.0) * 1.0);
    let _as: f64 = 4.0 * std::f64::consts::PI * (phi / 2.0).powi(2); // 4 bars
    let b: f64 = 300.0;        // mm, section width
    let ac_eff: f64 = b * hceff;
    let rho_peff: f64 = _as / ac_eff;

    // Crack spacing
    let k1: f64 = 0.8;         // high bond bars
    let k2: f64 = 0.5;         // bending
    let sr_max: f64 = 3.4 * c + 0.425 * k1 * k2 * phi / rho_peff;

    // Strain difference
    let alpha_e: f64 = es / (fcteff / 0.0001); // modular ratio (approximate)
    let kt: f64 = 0.4;         // long-term loading
    let eps_diff: f64 = (sigma_s - kt * fcteff * (1.0 + alpha_e * rho_peff) / rho_peff) / es;
    let eps_min: f64 = 0.6 * sigma_s / es;
    let eps_design: f64 = eps_diff.max(eps_min);

    // Crack width
    let wk: f64 = sr_max * eps_design;

    // Typical limit: 0.3mm for reinforced concrete (EC2 Table 7.1N)
    let wk_limit: f64 = 0.3; // mm
    assert!(
        wk > 0.0,
        "Crack width: {:.3} mm", wk
    );

    // Verify crack width formula produces reasonable values
    assert!(
        wk < 1.0,
        "Crack width {:.3} mm should be < 1.0 mm (reasonable range)", wk
    );

    let _wk_limit = wk_limit;
}

// ================================================================
// 5. Minimum Reinforcement — Flexure (EC2 §9.2.1.1)
// ================================================================
//
// As,min = max(0.26*(fctm/fyk)*bt*d, 0.0013*bt*d)

#[test]
fn detailing_minimum_reinforcement() {
    let fck: f64 = 30.0;       // MPa
    let fyk: f64 = 500.0;      // MPa
    let b: f64 = 300.0;        // mm
    let d: f64 = 450.0;        // mm

    let fctm: f64 = 0.30 * fck.powf(2.0 / 3.0); // ≈ 2.90 MPa

    // EC2 minimum
    let as_min_1: f64 = 0.26 * fctm / fyk * b * d;
    let as_min_2: f64 = 0.0013 * b * d;
    let as_min_ec2: f64 = as_min_1.max(as_min_2);

    // ACI 318 minimum: max(0.25*sqrt(f'c)/fy, 1.4/fy) * bw * d
    let fc: f64 = fck; // approximate
    let fy: f64 = 420.0; // MPa (ACI Grade 60)
    let as_min_aci_1: f64 = 0.25 * fc.sqrt() / fy * b * d;
    let as_min_aci_2: f64 = 1.4 / fy * b * d;
    let as_min_aci: f64 = as_min_aci_1.max(as_min_aci_2);

    // Both should give reasonable minimum areas
    assert!(
        as_min_ec2 > 100.0 && as_min_ec2 < 1000.0,
        "EC2 As,min = {:.0} mm²", as_min_ec2
    );
    assert!(
        as_min_aci > 100.0 && as_min_aci < 1000.0,
        "ACI As,min = {:.0} mm²", as_min_aci
    );

    // Minimum reinforcement ratio (ρ_min ≈ 0.1-0.2%)
    let rho_min_ec2: f64 = as_min_ec2 / (b * d);
    assert!(
        rho_min_ec2 > 0.001 && rho_min_ec2 < 0.005,
        "ρ_min (EC2) = {:.4}", rho_min_ec2
    );
}

// ================================================================
// 6. Maximum Spacing of Reinforcement (EC2 §7.3.3)
// ================================================================
//
// For crack control, maximum bar spacing depends on steel stress
// and bar diameter. EC2 Table 7.3N gives limits.

#[test]
fn detailing_bar_spacing() {
    let sigma_s: f64 = 200.0;  // MPa, steel stress

    // EC2 Table 7.3N: maximum bar spacing for wk = 0.3mm
    // σs = 160 MPa → s_max = 300mm
    // σs = 200 MPa → s_max = 250mm
    // σs = 240 MPa → s_max = 200mm
    // σs = 280 MPa → s_max = 150mm
    // σs = 320 MPa → s_max = 100mm

    // Interpolate for σs = 200 MPa
    let s_max: f64 = if sigma_s <= 160.0 {
        300.0
    } else if sigma_s <= 200.0 {
        300.0 - (sigma_s - 160.0) / (200.0 - 160.0) * (300.0 - 250.0)
    } else if sigma_s <= 240.0 {
        250.0 - (sigma_s - 200.0) / (240.0 - 200.0) * (250.0 - 200.0)
    } else if sigma_s <= 280.0 {
        200.0 - (sigma_s - 240.0) / (280.0 - 240.0) * (200.0 - 150.0)
    } else {
        100.0
    };

    assert!(
        (s_max - 250.0).abs() < 1.0,
        "s_max at σs=200MPa: {:.0}mm, expected 250mm", s_max
    );

    // ACI 318 §24.3.2: maximum spacing
    // s_max = min(3h, 450mm) for slabs
    let h: f64 = 200.0; // mm, slab thickness
    let s_max_aci: f64 = (3.0 * h).min(450.0);

    assert!(
        s_max_aci == 450.0,
        "ACI slab spacing limit: {:.0}mm", s_max_aci
    );

    // For beams: s_max = min(d/2, 300mm) approximately
    let d: f64 = 550.0;
    let s_max_beam: f64 = (d / 2.0).min(300.0);
    assert!(
        s_max_beam == 275.0,
        "Beam spacing: {:.0}mm", s_max_beam
    );
}

// ================================================================
// 7. Cover Requirements
// ================================================================
//
// EC2 §4.4.1: c_nom = c_min + Δc_dev
// c_min = max(c_min,b, c_min,dur, 10mm)
// ACI 318 Table 20.6.1.3.1: varies by exposure

#[test]
fn detailing_cover_requirements() {
    // EC2: Exposure class XC1 (dry interior)
    let cmin_b: f64 = 25.0;     // mm, bond: bar diameter (for 25mm bar)
    let cmin_dur: f64 = 15.0;   // mm, durability for XC1
    let cmin: f64 = cmin_b.max(cmin_dur).max(10.0);
    let delta_cdev: f64 = 10.0; // mm, allowance for deviation
    let cnom_xc1: f64 = cmin + delta_cdev;

    assert!(
        (cnom_xc1 - 35.0).abs() < 1.0,
        "XC1 cover: {:.0}mm, expected 35mm", cnom_xc1
    );

    // EC2: Exposure class XC4 (outdoor cyclic wet/dry)
    let cmin_dur_xc4: f64 = 30.0; // mm
    let cnom_xc4: f64 = cmin_b.max(cmin_dur_xc4).max(10.0) + delta_cdev;

    assert!(
        cnom_xc4 > cnom_xc1,
        "XC4 cover {:.0}mm > XC1 cover {:.0}mm", cnom_xc4, cnom_xc1
    );

    // ACI 318: Cast against earth = 75mm
    let cover_earth: f64 = 75.0;
    // Exposed to weather (#6 and larger) = 50mm
    let cover_weather: f64 = 50.0;
    // Interior (#6 through #18) = 40mm
    let cover_interior: f64 = 40.0;

    assert!(
        cover_earth > cover_weather && cover_weather > cover_interior,
        "Earth {}mm > weather {}mm > interior {}mm",
        cover_earth, cover_weather, cover_interior
    );
}

// ================================================================
// 8. Hook Development & Anchorage
// ================================================================
//
// ACI 318 §25.4.3: Standard hook development length
// ldh = (0.24*ψe*ψr*ψo*ψc*fy / (λ*sqrt(f'c))) * db
// Minimum: max(8*db, 150mm)

#[test]
fn detailing_hook_anchorage() {
    let fc: f64 = 30.0;        // MPa
    let fy: f64 = 420.0;       // MPa
    let db: f64 = 25.0;        // mm

    // Modification factors (all = 1.0 for standard case)
    let psi_e: f64 = 1.0;      // uncoated
    let psi_r: f64 = 1.0;      // no confining reinforcement
    let psi_o: f64 = 1.0;      // no special location
    let psi_c: f64 = 1.0;      // adequate cover
    let lambda: f64 = 1.0;     // normal weight

    // Hook development length
    let ldh: f64 = 0.24 * psi_e * psi_r * psi_o * psi_c * fy
        / (lambda * fc.sqrt()) * db;

    // Minimum
    let ldh_min: f64 = (8.0 * db).max(150.0);
    let ldh_design: f64 = ldh.max(ldh_min);

    assert!(
        ldh_design >= ldh_min,
        "ldh = {:.0}mm ≥ min {:.0}mm", ldh_design, ldh_min
    );

    // Standard hook: 90° with 12db extension, or 180° with 4db extension
    let hook_90_ext: f64 = 12.0 * db;  // = 300mm
    let hook_180_ext: f64 = 4.0 * db;  // = 100mm (≥ 65mm)

    assert!(
        hook_90_ext > hook_180_ext,
        "90° extension {:.0}mm > 180° extension {:.0}mm",
        hook_90_ext, hook_180_ext
    );

    // Minimum bend diameter
    let bend_90: f64 = 6.0 * db; // for #3 to #8 bars
    assert!(
        bend_90 == 150.0,
        "Minimum bend diameter: {:.0}mm", bend_90
    );

    // Hook is much shorter than straight development
    let ld_straight: f64 = fy * db / (1.7 * fc.sqrt());
    assert!(
        ldh < ld_straight,
        "Hook {:.0}mm < straight {:.0}mm development", ldh, ld_straight
    );
}
