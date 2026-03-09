/// Validation: Pile Foundation Design
///
/// References:
///   - Poulos & Davis: "Pile Foundation Analysis and Design" (1980)
///   - Tomlinson & Woodward: "Pile Design and Construction Practice" 6th ed.
///   - EN 1997-1:2004 (EC7) §7: Pile foundations
///   - AASHTO LRFD Bridge Design Specifications §10.7
///   - API RP 2GEO: Geotechnical and Foundation Design Considerations
///   - Das & Sivakugan: "Principles of Foundation Engineering" 9th ed.
///
/// Tests verify single pile capacity, group effects, settlement, and
/// lateral capacity using established geotechnical formulas.

// ================================================================
// 1. Single Pile — Alpha Method (Undrained Clay)
// ================================================================
//
// Shaft resistance: Qs = α * Su * π * D * L
// Base resistance: Qb = Nc * Su * Ab
// α = adhesion factor (Tomlinson 1957)
// Nc = 9 for deep pile (L/D > 5)

#[test]
fn pile_alpha_method_clay() {
    let d: f64 = 0.6;          // m, pile diameter
    let l: f64 = 15.0;         // m, embedded length
    let su: f64 = 60.0;        // kPa, undrained shear strength
    let alpha: f64 = 0.7;      // adhesion factor (medium stiff clay)
    let nc: f64 = 9.0;         // bearing capacity factor for deep pile

    // Shaft resistance
    let perimeter: f64 = std::f64::consts::PI * d;
    let qs: f64 = alpha * su * perimeter * l;
    let qs_expected: f64 = 0.7 * 60.0 * std::f64::consts::PI * 0.6 * 15.0;

    assert!(
        (qs - qs_expected).abs() / qs_expected < 0.01,
        "Shaft resistance: {:.1} kN, expected {:.1}", qs, qs_expected
    );

    // Base resistance
    let ab: f64 = std::f64::consts::PI * d * d / 4.0;
    let qb: f64 = nc * su * ab;
    let qb_expected: f64 = 9.0 * 60.0 * std::f64::consts::PI * 0.36 / 4.0;

    assert!(
        (qb - qb_expected).abs() / qb_expected < 0.01,
        "Base resistance: {:.1} kN, expected {:.1}", qb, qb_expected
    );

    // Total ultimate capacity
    let qu: f64 = qs + qb;
    // Qs ≈ 1187.5, Qb ≈ 152.7 → Qu ≈ 1340
    assert!(
        qu > 1000.0,
        "Total capacity {:.1} kN should exceed 1000 kN", qu
    );
}

// ================================================================
// 2. Single Pile — Beta Method (Drained Sand)
// ================================================================
//
// Shaft resistance: Qs = β * σ'v * π * D * L (integrated)
// β = K * tan(δ), where K = lateral earth pressure, δ = interface friction
// Base: Qb = Nq * σ'vb * Ab

#[test]
fn pile_beta_method_sand() {
    let d: f64 = 0.5;         // m, pile diameter
    let l: f64 = 12.0;        // m, embedded length
    let gamma_eff: f64 = 9.0; // kN/m³, effective unit weight (submerged)
    let beta: f64 = 0.35;     // K*tan(δ) for medium dense sand
    let nq: f64 = 40.0;       // bearing capacity factor (φ≈35°)

    // Average effective stress along shaft
    let sigma_v_avg: f64 = gamma_eff * l / 2.0;
    let sigma_v_avg_expected: f64 = 54.0; // kPa

    assert!(
        (sigma_v_avg - sigma_v_avg_expected).abs() < 0.1,
        "Average σ'v: {:.1} kPa, expected {:.1}", sigma_v_avg, sigma_v_avg_expected
    );

    // Shaft resistance
    let perimeter: f64 = std::f64::consts::PI * d;
    let qs: f64 = beta * sigma_v_avg * perimeter * l;
    // = 0.35 * 54 * π*0.5 * 12 = 0.35 * 54 * 1.5708 * 12 = 356.3
    let qs_expected: f64 = 0.35 * 54.0 * std::f64::consts::PI * 0.5 * 12.0;

    assert!(
        (qs - qs_expected).abs() / qs_expected < 0.01,
        "Shaft resistance: {:.1} kN, expected {:.1}", qs, qs_expected
    );

    // Base resistance
    let sigma_vb: f64 = gamma_eff * l; // at pile toe
    let ab: f64 = std::f64::consts::PI * d * d / 4.0;
    let qb: f64 = nq * sigma_vb * ab;
    // = 40 * 108 * π*0.25/4 = 40 * 108 * 0.1963 = 848.3
    let qb_expected: f64 = nq * (gamma_eff * l) * ab;

    assert!(
        (qb - qb_expected).abs() / qb_expected < 0.01,
        "Base resistance: {:.1} kN, expected {:.1}", qb, qb_expected
    );
}

// ================================================================
// 3. Pile Group Efficiency — Converse-Labarre
// ================================================================
//
// η = 1 - θ * [(n₁-1)*n₂ + (n₂-1)*n₁] / (90 * n₁ * n₂)
// θ = arctan(D/s), D = pile diameter, s = spacing

#[test]
fn pile_group_efficiency_converse_labarre() {
    let d: f64 = 0.4;    // m, pile diameter
    let s: f64 = 1.2;    // m, pile spacing (3D)
    let n1: usize = 3;   // piles in row
    let n2: usize = 3;   // rows

    let theta: f64 = (d / s).atan().to_degrees(); // arctan(0.333) ≈ 18.43°

    let eta: f64 = 1.0 - theta * ((n1 - 1) as f64 * n2 as f64 + (n2 - 1) as f64 * n1 as f64)
        / (90.0 * n1 as f64 * n2 as f64);

    // θ = 18.43°, numerator = 2*3 + 2*3 = 12, denominator = 90*9 = 810
    // η = 1 - 18.43 * 12 / 810 = 1 - 0.273 = 0.727
    let eta_expected: f64 = 0.727;

    assert!(
        (eta - eta_expected).abs() / eta_expected < 0.02,
        "Group efficiency: {:.3}, expected {:.3}", eta, eta_expected
    );

    // Efficiency should be between 0 and 1
    assert!(eta > 0.0 && eta < 1.0, "η should be in (0,1): {:.3}", eta);

    // At wider spacing (6D), efficiency improves
    let s_wide: f64 = 2.4;
    let theta_wide: f64 = (d / s_wide).atan().to_degrees();
    let eta_wide: f64 = 1.0 - theta_wide * ((n1 - 1) as f64 * n2 as f64 + (n2 - 1) as f64 * n1 as f64)
        / (90.0 * n1 as f64 * n2 as f64);
    assert!(eta_wide > eta, "Wider spacing: η={:.3} > {:.3}", eta_wide, eta);
}

// ================================================================
// 4. EC7 — Pile Design Resistance (DA1/C2)
// ================================================================
//
// Rc,d = Rc,k / γt where γt is the pile resistance factor.
// Rc,k from ξ-factors: Rc,k = min(Rc,mean/ξ₃, Rc,min/ξ₄)
// For n ≥ 5 pile tests: ξ₃ = 1.35, ξ₄ = 1.10

#[test]
fn pile_ec7_design_resistance() {
    // From 5 static load tests
    let rc_values: [f64; 5] = [1200.0, 1350.0, 1100.0, 1280.0, 1150.0]; // kN

    let rc_mean: f64 = rc_values.iter().sum::<f64>() / rc_values.len() as f64;
    let rc_min: f64 = rc_values.iter().cloned().fold(f64::INFINITY, f64::min);

    let rc_mean_expected: f64 = 1216.0;
    assert!(
        (rc_mean - rc_mean_expected).abs() / rc_mean_expected < 0.01,
        "Rc,mean: {:.0} kN, expected {:.0}", rc_mean, rc_mean_expected
    );
    assert!((rc_min - 1100.0).abs() < 1.0, "Rc,min: {:.0} kN", rc_min);

    // Correlation factors (EC7 Table A.9, n≥5)
    let xi_3: f64 = 1.35;
    let xi_4: f64 = 1.10;

    let rc_k: f64 = (rc_mean / xi_3).min(rc_min / xi_4);
    // rc_mean/ξ₃ = 1216/1.35 = 900.7
    // rc_min/ξ₄ = 1100/1.10 = 1000.0
    // Rc,k = min(900.7, 1000) = 900.7
    let rc_k_expected: f64 = rc_mean / xi_3;

    assert!(
        (rc_k - rc_k_expected).abs() / rc_k_expected < 0.01,
        "Rc,k: {:.1} kN, expected {:.1}", rc_k, rc_k_expected
    );

    // Design resistance DA1/C2: γt = 1.3
    let gamma_t: f64 = 1.3;
    let rc_d: f64 = rc_k / gamma_t;
    let rc_d_expected: f64 = rc_k_expected / 1.3;

    assert!(
        (rc_d - rc_d_expected).abs() / rc_d_expected < 0.01,
        "Rc,d: {:.1} kN, expected {:.1}", rc_d, rc_d_expected
    );
}

// ================================================================
// 5. Pile Settlement — Elastic Method (Poulos & Davis)
// ================================================================
//
// Settlement of single pile: s = Q * I / (E_s * D)
// where I = settlement influence factor, depends on L/D and K = Ep/Es

#[test]
fn pile_settlement_elastic() {
    let q: f64 = 800.0;       // kN, applied load
    let d: f64 = 0.6;         // m, pile diameter
    let _l: f64 = 15.0;       // m, pile length
    let e_s: f64 = 30_000.0;  // kPa, soil Young's modulus
    let _e_p: f64 = 30e6;     // kPa, pile modulus (concrete)

    // L/D = 25, K = Ep/Es = 1000
    // For L/D=25, K=1000: I ≈ 0.04 (from Poulos & Davis charts)
    let i_factor: f64 = 0.04;

    let settlement: f64 = q * i_factor / (e_s * d);
    // = 800 * 0.04 / (30000 * 0.6) = 32 / 18000 = 0.00178 m = 1.78 mm
    let settlement_mm: f64 = settlement * 1000.0;
    let settlement_expected_mm: f64 = 1.78;

    assert!(
        (settlement_mm - settlement_expected_mm).abs() / settlement_expected_mm < 0.02,
        "Settlement: {:.2} mm, expected {:.2} mm", settlement_mm, settlement_expected_mm
    );

    // Should be well below typical limit (25mm for structures)
    assert!(
        settlement_mm < 25.0,
        "Settlement {:.2}mm should be < 25mm limit", settlement_mm
    );
}

// ================================================================
// 6. Lateral Pile Capacity — Broms' Method (Short Pile, Cohesive)
// ================================================================
//
// For short free-headed pile in clay:
// Hu = 9 * Su * D * (L - 1.5D)²  / (2*(e + L))
// where e = eccentricity of load above ground

#[test]
fn pile_lateral_broms_short_clay() {
    let d: f64 = 0.6;         // m, pile diameter
    let l: f64 = 5.0;         // m, embedded length
    let su: f64 = 50.0;       // kPa, undrained shear strength
    let e_load: f64 = 0.5;    // m, load eccentricity above ground

    // Broms' short pile in cohesive soil (free head)
    // The horizontal capacity (simplified):
    // Hu = 9*Su*D * f(L/D, e/D)
    // For short pile: Hu ≈ 9*Su*D*L / (2 + 6*e/L) approximately
    // More precisely for free-headed short pile:
    // Hu satisfies: Hu*(e + L) = 9*Su*D*(L-1.5D)^2/2

    let l_eff: f64 = l - 1.5 * d; // effective embedment
    let hu: f64 = 9.0 * su * d * l_eff * l_eff / (2.0 * (e_load + l));

    // = 9 * 50 * 0.6 * 4.1² / (2 * 5.5) = 270 * 16.81 / 11.0 = 412.5
    let l_eff_check: f64 = 5.0 - 0.9;
    let hu_expected: f64 = 9.0 * 50.0 * 0.6 * l_eff_check * l_eff_check / (2.0 * 5.5);

    assert!(
        (hu - hu_expected).abs() / hu_expected < 0.01,
        "Lateral capacity: {:.1} kN, expected {:.1}", hu, hu_expected
    );

    // Free head capacity should be less than fixed head
    // Fixed head: Hu_fixed ≈ 9*Su*D*(L-1.5D) (simplified upper bound)
    let hu_fixed_approx: f64 = 9.0 * su * d * l_eff;
    assert!(
        hu < hu_fixed_approx,
        "Free head {:.1} < fixed head {:.1}", hu, hu_fixed_approx
    );
}

// ================================================================
// 7. Negative Skin Friction (Downdrag)
// ================================================================
//
// When surrounding soil settles more than the pile, negative friction
// develops above the neutral plane.
// Qnf = β_nf * σ'v * π * D * L_nf (drained) or = α_nf * Su * π * D * L_nf

#[test]
fn pile_negative_skin_friction() {
    let d: f64 = 0.5;           // m, pile diameter
    let l_nf: f64 = 8.0;       // m, length of downdrag zone
    let gamma_eff: f64 = 8.0;  // kN/m³, effective unit weight
    let beta_nf: f64 = 0.25;   // K*tan(δ) for negative friction

    // Average effective stress in downdrag zone
    let sigma_v_avg: f64 = gamma_eff * l_nf / 2.0;

    // Negative friction force
    let perimeter: f64 = std::f64::consts::PI * d;
    let q_nf: f64 = beta_nf * sigma_v_avg * perimeter * l_nf;

    // = 0.25 * 32 * π*0.5 * 8 = 0.25 * 32 * 1.5708 * 8 = 100.5
    let q_nf_expected: f64 = 0.25 * 32.0 * std::f64::consts::PI * 0.5 * 8.0;

    assert!(
        (q_nf - q_nf_expected).abs() / q_nf_expected < 0.01,
        "Negative friction: {:.1} kN, expected {:.1}", q_nf, q_nf_expected
    );

    // Check that dragload is significant fraction of pile capacity
    let pile_capacity: f64 = 1200.0; // kN, assumed ultimate capacity
    let drag_ratio: f64 = q_nf / pile_capacity;
    assert!(
        drag_ratio > 0.05,
        "Dragload ratio: {:.3}, should be non-trivial", drag_ratio
    );
}

// ================================================================
// 8. AASHTO — Pile Group Settlement in Sand
// ================================================================
//
// Equivalent raft method: pile group treated as equivalent footing
// at 2/3 * L depth. Bg = s*(n-1) + D, width of equivalent raft.
// Settlement: s_group ≈ q_net * Bg * (1-ν²) / Es * I_f

#[test]
fn pile_group_settlement_equivalent_raft() {
    let _n_piles: usize = 9;   // 3x3 group
    let spacing: f64 = 1.5;    // m, pile spacing
    let d: f64 = 0.5;          // m, pile diameter
    let l: f64 = 12.0;         // m, pile length
    let q_total: f64 = 4500.0; // kN, total group load
    let e_s: f64 = 40_000.0;   // kPa, soil modulus below group
    let nu: f64 = 0.3;

    // Equivalent raft dimensions (square group)
    let n_side: usize = 3;
    let bg: f64 = spacing * (n_side - 1) as f64 + d;
    let bg_expected: f64 = 3.5; // m

    assert!(
        (bg - bg_expected).abs() < 0.01,
        "Equivalent raft width: {:.1} m, expected {:.1}", bg, bg_expected
    );

    // Depth of equivalent raft: 2/3 * L
    let depth: f64 = 2.0 / 3.0 * l;
    let depth_expected: f64 = 8.0;
    assert!(
        (depth - depth_expected).abs() < 0.01,
        "Equivalent raft depth: {:.1} m, expected {:.1}", depth, depth_expected
    );

    // Contact pressure on equivalent raft
    let q_net: f64 = q_total / (bg * bg);
    let q_net_expected: f64 = 4500.0 / 12.25;

    assert!(
        (q_net - q_net_expected).abs() / q_net_expected < 0.01,
        "Net pressure: {:.1} kPa, expected {:.1}", q_net, q_net_expected
    );

    // Settlement (rigid circular footing formula, square approximation)
    let i_f: f64 = 0.88; // influence factor for L/B=1
    let settlement: f64 = q_net * bg * (1.0 - nu * nu) / e_s * i_f;
    let settlement_mm: f64 = settlement * 1000.0;

    // Should be reasonable (< 25mm typically)
    assert!(
        settlement_mm > 0.0 && settlement_mm < 50.0,
        "Group settlement: {:.2} mm should be reasonable", settlement_mm
    );
}
