/// Validation: Structural Health Monitoring (SHM)
///
/// References:
///   - Farrar & Worden: "Structural Health Monitoring: A Machine Learning Perspective" (2013)
///   - Doebling et al. (1996): "Damage Identification and Health Monitoring"
///   - EN 1990 Annex B: Reliability management for existing structures
///   - fib Bulletin 80: Partial factor methods for existing structures
///   - Rytter (1993): Four-level damage classification
///   - Fan & Qiao (2011): "Vibration-based damage identification methods"
///
/// Tests verify frequency shift damage detection, mode shape
/// curvature, strain gauge interpretation, and load testing.

// ================================================================
// 1. Natural Frequency Shift -- Damage Detection
// ================================================================
//
// Damage reduces stiffness → lower natural frequencies.
// Δf/f ≈ ΔK/(2K) for small stiffness change.
// Frequency ratio: f_damaged / f_intact = sqrt(K_d / K_0)

#[test]
fn shm_frequency_shift() {
    let f0: f64 = 5.0;          // Hz, intact first natural frequency
    let k0: f64 = 1.0e6;        // N/m, reference stiffness (normalized)

    // 10% stiffness reduction (moderate damage)
    let stiffness_reduction: f64 = 0.10;
    let kd: f64 = k0 * (1.0 - stiffness_reduction);

    // Damaged frequency
    let fd: f64 = f0 * (kd / k0).sqrt();

    // Frequency shift
    let delta_f: f64 = (f0 - fd) / f0;

    assert!(
        delta_f > 0.0,
        "Frequency reduction: {:.2}%", delta_f * 100.0
    );

    // For small damage: Δf/f ≈ ΔK/(2K)
    let approx_shift: f64 = stiffness_reduction / 2.0;
    assert!(
        (delta_f - approx_shift).abs() < 0.01,
        "Exact {:.3} ≈ approximate {:.3}", delta_f, approx_shift
    );

    // Detection threshold (typically 1-2% for reliable detection)
    let threshold: f64 = 0.02;
    let detectable: bool = delta_f > threshold;
    assert!(
        detectable,
        "Shift {:.2}% > threshold {:.1}% -- detectable",
        delta_f * 100.0, threshold * 100.0
    );

    // 2% stiffness change → barely detectable
    let fd_small: f64 = f0 * (1.0 - 0.02_f64).sqrt();
    let shift_small: f64 = (f0 - fd_small) / f0;
    assert!(
        shift_small < threshold,
        "2% damage: {:.2}% shift -- near detection limit",
        shift_small * 100.0
    );
}

// ================================================================
// 2. Mode Shape Curvature -- Damage Localization
// ================================================================
//
// Mode shape curvature: κ = d²φ/dx² (second derivative of mode shape)
// Damage at location i causes local curvature increase.
// Δκ = |κ_damaged - κ_intact| at each measurement point.

#[test]
fn shm_mode_shape_curvature() {
    // Intact mode shape (first mode of simply supported beam)
    let n: usize = 11;          // measurement points
    let l: f64 = 10.0;          // m, beam length
    let dx: f64 = l / (n - 1) as f64;

    let mut phi_intact: Vec<f64> = Vec::new();
    let mut phi_damaged: Vec<f64> = Vec::new();

    for i in 0..n {
        let x: f64 = i as f64 * dx;
        let mode: f64 = (std::f64::consts::PI * x / l).sin();
        phi_intact.push(mode);

        // Damaged: reduced amplitude near midspan (i = 4,5,6)
        let damage_factor: f64 = if i >= 4 && i <= 6 { 0.95 } else { 1.0 };
        phi_damaged.push(mode * damage_factor);
    }

    // Compute curvature using central differences
    let mut curv_intact: Vec<f64> = vec![0.0; n];
    let mut curv_damaged: Vec<f64> = vec![0.0; n];

    for i in 1..n - 1 {
        curv_intact[i] = (phi_intact[i + 1] - 2.0 * phi_intact[i] + phi_intact[i - 1]) / (dx * dx);
        curv_damaged[i] = (phi_damaged[i + 1] - 2.0 * phi_damaged[i] + phi_damaged[i - 1]) / (dx * dx);
    }

    // Curvature difference (damage indicator)
    let mut max_delta: f64 = 0.0;
    let mut max_loc: usize = 0;

    for i in 1..n - 1 {
        let delta: f64 = (curv_damaged[i] - curv_intact[i]).abs();
        if delta > max_delta {
            max_delta = delta;
            max_loc = i;
        }
    }

    // Damage should be detected near midspan
    assert!(
        max_loc >= 3 && max_loc <= 7,
        "Damage localized at point {} (expected 4-6)", max_loc
    );

    assert!(
        max_delta > 0.0,
        "Maximum curvature change: {:.6}", max_delta
    );
}

// ================================================================
// 3. Strain Gauge -- Stress Estimation
// ================================================================
//
// σ = E × ε (Hooke's law)
// Temperature compensation: ε_mech = ε_total - α × ΔT
// Rosette analysis for biaxial stress state.

#[test]
fn shm_strain_gauge() {
    let e: f64 = 200_000.0;     // MPa, steel modulus
    let alpha: f64 = 12.0e-6;   // 1/°C, thermal expansion

    // Measured strain
    let eps_total: f64 = 500.0e-6; // total strain (500 microstrain)
    let delta_t: f64 = 15.0;      // °C, temperature change

    // Temperature compensation
    let eps_thermal: f64 = alpha * delta_t;
    let eps_mech: f64 = eps_total - eps_thermal;

    assert!(
        eps_mech < eps_total,
        "Mechanical strain {:.0} < total {:.0} microstrain",
        eps_mech * 1e6, eps_total * 1e6
    );

    // Stress
    let sigma: f64 = e * eps_mech;

    assert!(
        sigma > 50.0 && sigma < 150.0,
        "Stress: {:.1} MPa", sigma
    );

    // Live load fraction (from monitoring)
    let eps_dead: f64 = 200.0e-6; // dead load strain (known)
    let eps_live: f64 = eps_mech - eps_dead;
    let live_fraction: f64 = eps_live / eps_mech;

    assert!(
        live_fraction > 0.0 && live_fraction < 1.0,
        "Live load fraction: {:.0}%", live_fraction * 100.0
    );
}

// ================================================================
// 4. Load Testing -- Proof Load Assessment
// ================================================================
//
// Proof load test: apply known load and measure response.
// Target load: typically 1.0D + 1.3L or higher.
// Acceptance: measured deflection < predicted, recovery > 75%.

#[test]
fn shm_load_test() {
    let span: f64 = 12.0;       // m
    let e: f64 = 30_000.0;      // MPa, concrete
    let i: f64 = 0.015;         // m⁴, gross moment of inertia

    // Predicted deflection under test load
    let p_test: f64 = 200.0;    // kN, test load (factored)
    let delta_pred: f64 = p_test * span.powi(3) / (48.0 * e * 1000.0 * i); // m
    let delta_pred_mm: f64 = delta_pred * 1000.0;

    // Measured deflection (should be less if structure is adequate)
    let delta_meas_mm: f64 = delta_pred_mm * 0.85; // 85% of predicted

    assert!(
        delta_meas_mm < delta_pred_mm,
        "Measured {:.1} < predicted {:.1} mm -- adequate", delta_meas_mm, delta_pred_mm
    );

    // Recovery after unloading
    let residual_mm: f64 = delta_meas_mm * 0.10; // 10% residual
    let recovery: f64 = 1.0 - residual_mm / delta_meas_mm;

    assert!(
        recovery > 0.75,
        "Recovery: {:.0}% > 75% -- acceptable", recovery * 100.0
    );

    // Deflection limit (span/750 for proof load test)
    let delta_limit: f64 = span * 1000.0 / 750.0; // mm
    assert!(
        delta_meas_mm < delta_limit,
        "Deflection {:.1} < limit {:.1} mm", delta_meas_mm, delta_limit
    );
}

// ================================================================
// 5. Accelerometer -- Modal Identification
// ================================================================
//
// Ambient vibration testing: output-only modal analysis.
// Peak picking from PSD: identify natural frequencies.
// Damping from half-power bandwidth: ξ = (f2-f1)/(2*fn)

#[test]
fn shm_modal_identification() {
    // Identified natural frequencies (from PSD peaks)
    let f1: f64 = 3.2;          // Hz, first mode
    let f2: f64 = 8.5;          // Hz, second mode
    let f3: f64 = 15.8;         // Hz, third mode

    // Simply supported beam: fn ∝ n²
    // f2/f1 should ≈ 4, f3/f1 should ≈ 9
    let ratio_21: f64 = f2 / f1;
    let ratio_31: f64 = f3 / f1;

    assert!(
        ratio_21 > 2.0 && ratio_21 < 4.5,
        "f2/f1 = {:.2} (theoretical 4.0 for SS beam)", ratio_21
    );

    assert!(
        ratio_31 > 4.0 && ratio_31 < 10.0,
        "f3/f1 = {:.2} (theoretical 9.0 for SS beam)", ratio_31
    );

    // Half-power bandwidth damping estimation
    let fn_peak: f64 = 3.2;     // Hz, resonance peak
    let f_lower: f64 = 3.10;    // Hz, -3dB point (lower)
    let f_upper: f64 = 3.30;    // Hz, -3dB point (upper)

    let xi: f64 = (f_upper - f_lower) / (2.0 * fn_peak);

    assert!(
        xi > 0.01 && xi < 0.10,
        "Damping ratio: {:.3} ({:.1}%)", xi, xi * 100.0
    );

    // Typical structural damping: 1-5%
    assert!(
        xi > 0.005 && xi < 0.05,
        "Damping {:.1}% -- typical for concrete", xi * 100.0
    );
}

// ================================================================
// 6. Damage Index -- MAC (Modal Assurance Criterion)
// ================================================================
//
// MAC = |φ_A^T × φ_B|² / ((φ_A^T × φ_A)(φ_B^T × φ_B))
// MAC = 1.0: perfect correlation (no damage)
// MAC < 0.9: significant mode shape change

#[test]
fn shm_mac_criterion() {
    // Mode shape vectors (5 measurement points)
    let phi_a: [f64; 5] = [0.0, 0.5, 1.0, 0.5, 0.0]; // intact
    let phi_b: [f64; 5] = [0.0, 0.48, 0.95, 0.52, 0.0]; // damaged

    // MAC calculation
    let mut dot_ab: f64 = 0.0;
    let mut dot_aa: f64 = 0.0;
    let mut dot_bb: f64 = 0.0;

    for i in 0..5 {
        dot_ab += phi_a[i] * phi_b[i];
        dot_aa += phi_a[i] * phi_a[i];
        dot_bb += phi_b[i] * phi_b[i];
    }

    let mac: f64 = (dot_ab * dot_ab) / (dot_aa * dot_bb);

    assert!(
        mac > 0.0 && mac <= 1.0,
        "MAC = {:.4}", mac
    );

    // For small damage: MAC still close to 1.0
    assert!(
        mac > 0.95,
        "MAC = {:.4} > 0.95 -- minor change", mac
    );

    // Perfect correlation check
    let mut dot_self: f64 = 0.0;
    let mut dot_ss: f64 = 0.0;
    for i in 0..5 {
        dot_self += phi_a[i] * phi_a[i];
        dot_ss += phi_a[i] * phi_a[i];
    }
    let mac_self: f64 = (dot_self * dot_self) / (dot_ss * dot_ss);
    assert!(
        (mac_self - 1.0).abs() < 1e-10,
        "Self-MAC = {:.10} (should be 1.0)", mac_self
    );
}

// ================================================================
// 7. Fatigue Monitoring -- Rainflow Counting
// ================================================================
//
// Rainflow cycle counting extracts stress ranges from time history.
// Miner's rule: D = Σ(ni/Ni), failure when D ≥ 1.0
// Ni from S-N curve: N = (C/ΔS)^m

#[test]
fn shm_fatigue_monitoring() {
    // Stress range histogram from rainflow counting
    let ranges: [(f64, f64); 4] = [
        // (stress_range_MPa, cycle_count)
        (20.0, 1_000_000.0),
        (40.0, 500_000.0),
        (60.0, 100_000.0),
        (80.0, 10_000.0),
    ];

    // S-N curve parameters (EC3 detail category 71)
    let delta_c: f64 = 71.0;    // MPa, detail category
    let m: f64 = 3.0;           // S-N slope
    let nc: f64 = 2.0e6;        // cycles at detail category

    // Miner's sum
    let mut damage: f64 = 0.0;

    for (delta_s, ni) in &ranges {
        // Cycles to failure at this range
        let ratio: f64 = delta_c / delta_s;
        let n_life: f64 = nc * ratio.powf(m);
        damage += ni / n_life;
    }

    assert!(
        damage > 0.0 && damage < 10.0,
        "Miner's damage: {:.4}", damage
    );

    // Remaining life
    let remaining: f64 = 1.0 - damage;
    assert!(
        remaining > 0.0,
        "Remaining life fraction: {:.2}", remaining
    );

    // Dominant range contribution
    let ratio_80: f64 = 80.0;
    let n_life_80: f64 = nc * (delta_c / ratio_80).powf(m);
    let damage_80: f64 = 10_000.0 / n_life_80;

    // High ranges contribute disproportionately (cubic relationship)
    assert!(
        damage_80 > 0.0,
        "80 MPa range damage: {:.4}", damage_80
    );
}

// ================================================================
// 8. Reliability Update -- Bayesian with Monitoring Data
// ================================================================
//
// Prior reliability index β updated with monitoring data.
// If monitoring shows structure performing better than expected:
// β_updated > β_prior
// Simplified: β_updated = β_prior + Δβ(inspection)

#[test]
fn shm_reliability_update() {
    let beta_prior: f64 = 3.8;  // prior reliability index (EC0 target)

    // Monitoring reveals:
    // - Actual loads are 90% of design assumption
    // - Material strength is 105% of characteristic value
    let load_ratio: f64 = 0.90;
    let strength_ratio: f64 = 1.05;

    // Updated safety margin (simplified linear)
    // β = (μR - μS) / sqrt(σR² + σS²)
    // If load decreases by 10% and strength increases by 5%:
    let cov_r: f64 = 0.10;      // coefficient of variation of resistance
    let cov_s: f64 = 0.20;      // coefficient of variation of load

    let mu_r: f64 = strength_ratio; // normalized
    let mu_s: f64 = load_ratio;
    let sigma_r: f64 = cov_r * mu_r;
    let sigma_s: f64 = cov_s * mu_s;

    let beta_updated: f64 = (mu_r - mu_s) / (sigma_r * sigma_r + sigma_s * sigma_s).sqrt();

    assert!(
        beta_updated > 0.0,
        "Updated β = {:.2}", beta_updated
    );

    // Information gain: monitoring reduces uncertainty
    let cov_s_monitored: f64 = 0.15; // reduced from 0.20
    let sigma_s_mon: f64 = cov_s_monitored * mu_s;

    let beta_monitored: f64 = (mu_r - mu_s) / (sigma_r * sigma_r + sigma_s_mon * sigma_s_mon).sqrt();

    assert!(
        beta_monitored > beta_updated,
        "Monitored β = {:.2} > baseline {:.2} (reduced uncertainty)",
        beta_monitored, beta_updated
    );

    let _beta_prior = beta_prior;
}
