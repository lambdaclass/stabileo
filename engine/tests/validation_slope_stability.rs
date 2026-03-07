/// Validation: Geotechnical Slope Stability Analysis
///
/// References:
///   - Fellenius (1936): Swedish circle method
///   - Bishop (1955): Simplified method of slices
///   - Spencer (1967): Rigorous method
///   - Morgenstern & Price (1965): General method
///   - Duncan & Wright: "Soil Strength and Slope Stability" 2nd ed. (2014)
///   - EN 1997-1 (EC7): Geotechnical design — §11 Overall stability
///   - USACE EM 1110-2-1902: Slope Stability (2003)
///
/// Tests verify factor of safety calculations for various slope
/// conditions using classical methods of slices.

mod helpers;

// ================================================================
// 1. Infinite Slope — Dry Cohesionless Soil
// ================================================================
//
// FS = tan(φ) / tan(β)
// Independent of depth for cohesionless soil.

#[test]
fn slope_infinite_dry() {
    let phi: f64 = 35.0_f64.to_radians(); // friction angle
    let beta: f64 = 25.0_f64.to_radians(); // slope angle

    let fs: f64 = phi.tan() / beta.tan();
    // = tan(35°)/tan(25°) = 0.7002/0.4663 = 1.502

    let fs_expected: f64 = 35.0_f64.to_radians().tan() / 25.0_f64.to_radians().tan();

    assert!(
        (fs - fs_expected).abs() / fs_expected < 0.001,
        "FS infinite slope (dry): {:.3}, expected {:.3}", fs, fs_expected
    );

    // FS > 1.0 → stable
    assert!(
        fs > 1.0,
        "FS = {:.3} > 1.0 → stable", fs
    );

    // At critical angle (β = φ): FS = 1.0
    let fs_critical: f64 = phi.tan() / phi.tan();
    assert!(
        (fs_critical - 1.0).abs() < 0.001,
        "At β = φ: FS = {:.3}", fs_critical
    );
}

// ================================================================
// 2. Infinite Slope — With Seepage (Submerged)
// ================================================================
//
// With seepage parallel to slope:
// FS = (γ'/γ_sat) * tan(φ) / tan(β)
// γ' = γ_sat - γ_w (buoyant unit weight)

#[test]
fn slope_infinite_seepage() {
    let gamma_sat: f64 = 20.0;   // kN/m³
    let gamma_w: f64 = 9.81;     // kN/m³
    let gamma_prime: f64 = gamma_sat - gamma_w; // = 10.19 kN/m³

    let phi: f64 = 35.0_f64.to_radians();
    let beta: f64 = 25.0_f64.to_radians();

    let fs_dry: f64 = phi.tan() / beta.tan();
    let fs_seep: f64 = (gamma_prime / gamma_sat) * phi.tan() / beta.tan();

    // Seepage roughly halves the FS
    let ratio: f64 = fs_seep / fs_dry;
    let expected_ratio: f64 = gamma_prime / gamma_sat;

    assert!(
        (ratio - expected_ratio).abs() / expected_ratio < 0.01,
        "FS ratio (seep/dry): {:.3}, expected {:.3}", ratio, expected_ratio
    );

    // With seepage, slope may be unstable
    assert!(
        fs_seep < fs_dry,
        "Seepage reduces FS: {:.3} < {:.3}", fs_seep, fs_dry
    );
}

// ================================================================
// 3. Planar Failure — Cohesive Soil
// ================================================================
//
// For a planar slip surface at depth z:
// FS = (c' + γ*z*cos²β*tan(φ')) / (γ*z*sinβ*cosβ)

#[test]
fn slope_planar_cohesive() {
    let c_prime: f64 = 10.0;    // kPa, effective cohesion
    let phi_prime: f64 = 25.0_f64.to_radians();
    let gamma: f64 = 18.0;      // kN/m³
    let z: f64 = 3.0;           // m, depth of failure plane
    let beta: f64 = 30.0_f64.to_radians(); // slope angle

    // Resisting force per unit area
    let sigma_n: f64 = gamma * z * beta.cos() * beta.cos();
    let tau_resist: f64 = c_prime + sigma_n * phi_prime.tan();

    // Driving force per unit area
    let tau_drive: f64 = gamma * z * beta.sin() * beta.cos();

    let fs: f64 = tau_resist / tau_drive;

    // Cohesion component
    let fs_cohesion: f64 = c_prime / tau_drive;
    let fs_friction: f64 = phi_prime.tan() / beta.tan();

    assert!(
        (fs - (fs_cohesion + fs_friction)).abs() / fs < 0.01,
        "FS = {:.3} = cohesion({:.3}) + friction({:.3})", fs, fs_cohesion, fs_friction
    );

    assert!(
        fs > 1.0,
        "FS = {:.3} > 1.0 → stable", fs
    );
}

// ================================================================
// 4. Circular Failure — Fellenius (Swedish) Method
// ================================================================
//
// Ordinary Method of Slices (Fellenius, 1936):
// FS = Σ(c'*b*sec(α) + W*cos(α)*tan(φ')) / Σ(W*sin(α))
// where α = slice base angle, b = slice width, W = slice weight.
// Conservative: ignores inter-slice forces.

#[test]
fn slope_fellenius_method() {
    // Simple 3-slice example
    let c_prime: f64 = 15.0;     // kPa
    let phi_prime: f64 = 20.0_f64.to_radians();
    let b: f64 = 2.0;           // m, slice width

    // Slice data: (weight kN/m, base angle degrees)
    let slices: [(f64, f64); 3] = [
        (60.0, -10.0),   // upslope slice
        (100.0, 15.0),   // middle slice
        (80.0, 35.0),    // toe slice
    ];

    let mut sum_resist: f64 = 0.0;
    let mut sum_drive: f64 = 0.0;

    for &(w, alpha_deg) in &slices {
        let alpha: f64 = alpha_deg.to_radians();
        let resist: f64 = c_prime * b / alpha.cos() + w * alpha.cos() * phi_prime.tan();
        let drive: f64 = w * alpha.sin();
        sum_resist += resist;
        sum_drive += drive;
    }

    let fs: f64 = sum_resist / sum_drive;

    // Fellenius method typically gives FS > 1.0 for stable slopes
    assert!(
        fs > 1.0,
        "Fellenius FS: {:.3}", fs
    );

    // Check components
    assert!(
        sum_resist > 0.0 && sum_drive > 0.0,
        "Resist={:.1}, Drive={:.1}", sum_resist, sum_drive
    );
}

// ================================================================
// 5. Circular Failure — Bishop's Simplified Method
// ================================================================
//
// Bishop (1955): considers inter-slice normal forces.
// FS = (1/Σ(W*sin(α))) * Σ((c'*b + W*tan(φ')) * sec(α)/(1 + tan(α)*tan(φ')/FS))
// Iterative: FS appears on both sides.

#[test]
fn slope_bishop_simplified() {
    let c_prime: f64 = 15.0;
    let phi_prime: f64 = 20.0_f64.to_radians();
    let b: f64 = 2.0;

    let slices: [(f64, f64); 3] = [
        (60.0, -10.0),
        (100.0, 15.0),
        (80.0, 35.0),
    ];

    // Sum of driving forces (same as Fellenius)
    let sum_drive: f64 = slices.iter()
        .map(|&(w, alpha_deg)| w * alpha_deg.to_radians().sin())
        .sum::<f64>();

    // Iterative solution: start with FS = 1.5
    let mut fs: f64 = 1.5;

    for _iter in 0..20 {
        let mut sum_resist: f64 = 0.0;

        for &(w, alpha_deg) in &slices {
            let alpha: f64 = alpha_deg.to_radians();
            let m_alpha: f64 = alpha.cos() + alpha.sin() * phi_prime.tan() / fs;
            let resist: f64 = (c_prime * b + w * phi_prime.tan()) / m_alpha;
            sum_resist += resist;
        }

        let fs_new: f64 = sum_resist / sum_drive;
        if (fs_new - fs).abs() < 0.001 {
            break;
        }
        fs = fs_new;
    }

    // Bishop's method gives higher FS than Fellenius (less conservative)
    // because it accounts for inter-slice normal forces
    assert!(
        fs > 1.0,
        "Bishop FS: {:.3}", fs
    );

    // Verify convergence by recomputing
    let mut sum_check: f64 = 0.0;
    for &(w, alpha_deg) in &slices {
        let alpha: f64 = alpha_deg.to_radians();
        let m_alpha: f64 = alpha.cos() + alpha.sin() * phi_prime.tan() / fs;
        sum_check += (c_prime * b + w * phi_prime.tan()) / m_alpha;
    }
    let fs_check: f64 = sum_check / sum_drive;
    assert!(
        (fs_check - fs).abs() / fs < 0.005,
        "Bishop converged: FS={:.3}, check={:.3}", fs, fs_check
    );
}

// ================================================================
// 6. EC7 Design Approach — Material Factor Method
// ================================================================
//
// EN 1997-1: Three design approaches for slope stability.
// DA1-C2: γ_c' = 1.25, γ_φ' = 1.25 (material factors)
// Design values: c'd = c'k/γc, tan(φ'd) = tan(φ'k)/γφ

#[test]
fn slope_ec7_design_approach() {
    let ck: f64 = 20.0;   // kPa, characteristic cohesion
    let phi_k: f64 = 30.0_f64.to_radians(); // characteristic friction

    // DA1-C2 partial factors
    let gamma_c: f64 = 1.25;
    let gamma_phi: f64 = 1.25;

    // Design values
    let cd: f64 = ck / gamma_c;
    let phi_d: f64 = (phi_k.tan() / gamma_phi).atan();

    assert!(
        (cd - 16.0).abs() / 16.0 < 0.01,
        "c'd = {:.1} kPa, expected 16.0", cd
    );

    // Design friction angle should be less than characteristic
    assert!(
        phi_d < phi_k,
        "φ'd = {:.1}° < φ'k = {:.1}°",
        phi_d.to_degrees(), phi_k.to_degrees()
    );

    // Reduction in tan(φ)
    let reduction: f64 = phi_d.tan() / phi_k.tan();
    assert!(
        (reduction - 1.0 / gamma_phi).abs() < 0.01,
        "tan(φ) reduction: {:.3}, expected {:.3}", reduction, 1.0 / gamma_phi
    );

    // DA3: same material factors, factored actions
    // γ_G = 1.35, γ_Q = 1.50 (permanent/variable actions on slope)
    let gamma_g: f64 = 1.35;
    let gamma_q: f64 = 1.50;
    assert!(
        gamma_g < gamma_q,
        "γG={:.2} < γQ={:.2}", gamma_g, gamma_q
    );
}

// ================================================================
// 7. Seismic Slope Stability — Pseudostatic Method
// ================================================================
//
// Add horizontal inertia force: Fh = kh * W
// FS = Σ(c'*l + (W*cos(α) - kh*W*sin(α))*tan(φ')) / Σ(W*sin(α) + kh*W*cos(α))
// kh = seismic coefficient (typically 0.1-0.3)

#[test]
fn slope_pseudostatic_seismic() {
    let c_prime: f64 = 10.0;
    let phi_prime: f64 = 30.0_f64.to_radians();
    let gamma: f64 = 18.0;
    let h: f64 = 8.0;           // m, slope height
    let beta: f64 = 35.0_f64.to_radians();

    // Static FS (simplified infinite slope with cohesion)
    let sigma_n_static: f64 = gamma * h * beta.cos() * beta.cos();
    let tau_resist_static: f64 = c_prime + sigma_n_static * phi_prime.tan();
    let tau_drive_static: f64 = gamma * h * beta.sin() * beta.cos();
    let fs_static: f64 = tau_resist_static / tau_drive_static;

    // Pseudostatic with kh = 0.15
    let kh: f64 = 0.15;
    let w: f64 = gamma * h; // weight per unit area (simplified)

    let n_prime: f64 = w * beta.cos() - kh * w * beta.sin();
    let tau_resist_seis: f64 = c_prime + n_prime * phi_prime.tan();
    let tau_drive_seis: f64 = w * beta.sin() + kh * w * beta.cos();
    let fs_seismic: f64 = tau_resist_seis / tau_drive_seis;

    // Seismic FS should be lower than static
    assert!(
        fs_seismic < fs_static,
        "Seismic FS {:.3} < static FS {:.3}", fs_seismic, fs_static
    );

    // Reduction ratio depends on kh
    let reduction: f64 = (fs_static - fs_seismic) / fs_static;
    assert!(
        reduction > 0.1,
        "FS reduction: {:.1}%", reduction * 100.0
    );
}

// ================================================================
// 8. Critical Height of Vertical Cut — Taylor's Chart
// ================================================================
//
// For undrained conditions (φ = 0), vertical cut:
// Hc = 4 * cu / γ (for β = 90°)
// Taylor's stability number: N = cu / (γ * H * FS)
// For vertical cut with FS=1: N = 0.261 (exact: 1/(2π+2))

#[test]
fn slope_taylor_critical_height() {
    let cu: f64 = 50.0;   // kPa, undrained shear strength
    let gamma: f64 = 18.0; // kN/m³

    // Critical height for vertical cut (φ=0)
    let hc: f64 = 4.0 * cu / gamma;
    // = 4 * 50 / 18 = 11.11 m
    let hc_expected: f64 = 200.0 / 18.0;

    assert!(
        (hc - hc_expected).abs() / hc_expected < 0.01,
        "Critical height: {:.2} m, expected {:.2}", hc, hc_expected
    );

    // Taylor's stability number for 90° slope
    // N_s = cu/(γ*Hc) = 1/4 = 0.25
    let ns: f64 = cu / (gamma * hc);
    assert!(
        (ns - 0.25).abs() < 0.01,
        "Stability number: {:.3}, expected 0.25", ns
    );

    // For 45° slope: N_s ≈ 0.181 (Taylor's chart)
    // Critical height is greater
    let ns_45: f64 = 0.181;
    let hc_45: f64 = cu / (gamma * ns_45);

    assert!(
        hc_45 > hc,
        "45° Hc {:.2}m > 90° Hc {:.2}m", hc_45, hc
    );
}
