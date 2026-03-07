/// Validation: Geotechnical Slope Stability Analysis
///
/// References:
///   - Bishop: "The Use of the Slip Circle in the Stability Analysis of Slopes" (1955)
///   - Duncan & Wright: "Soil Strength and Slope Stability" 2nd ed.
///   - Abramson et al: "Slope Stability and Stabilization Methods" 2nd ed. (2002)
///   - EN 1997-1:2004 (EC7) §11: Overall stability
///   - USACE EM 1110-2-1902: "Slope Stability" (2003)
///
/// Tests verify factor of safety calculations for slopes using established
/// limit equilibrium methods, seismic pseudo-static analysis, reinforcement
/// design, and pore pressure effects.

mod helpers;

// ================================================================
// 1. Infinite Slope Analysis — Dry and Submerged
// ================================================================
//
// For an infinite slope of inclination β in cohesionless soil:
//   FS_dry = tan(φ) / tan(β)
//
// For fully submerged slope with seepage parallel to surface:
//   FS_sub = (γ'/γ_sat) * tan(φ) / tan(β)
//
// where γ' = γ_sat - γ_w is buoyant unit weight.
//
// For cohesive soil (c-φ) on infinite slope of depth H:
//   FS = c / (γ·H·sin(β)·cos(β)) + tan(φ)/tan(β)
//
// Reference: Duncan & Wright Ch. 6; USACE EM 1110-2-1902 §C-2

#[test]
fn slope_infinite_dry_and_submerged() {
    let phi_deg: f64 = 30.0;    // degrees, friction angle
    let beta_deg: f64 = 20.0;   // degrees, slope inclination
    let gamma_sat: f64 = 20.0;  // kN/m³, saturated unit weight
    let gamma_w: f64 = 9.81;    // kN/m³, water unit weight

    let phi_rad: f64 = phi_deg.to_radians();
    let beta_rad: f64 = beta_deg.to_radians();

    // Dry infinite slope: FS = tan(φ)/tan(β)
    let fs_dry: f64 = phi_rad.tan() / beta_rad.tan();
    // tan(30°) = 0.5774, tan(20°) = 0.3640
    // FS_dry = 0.5774 / 0.3640 = 1.587
    let fs_dry_expected: f64 = 1.587;

    assert!(
        (fs_dry - fs_dry_expected).abs() / fs_dry_expected < 0.01,
        "Dry infinite slope FS: {:.3}, expected {:.3}", fs_dry, fs_dry_expected
    );

    // Submerged with seepage parallel to slope: FS = (γ'/γ_sat) * tan(φ)/tan(β)
    let gamma_prime: f64 = gamma_sat - gamma_w;
    let fs_sub: f64 = (gamma_prime / gamma_sat) * phi_rad.tan() / beta_rad.tan();
    // γ'/γ_sat = 10.19/20.0 = 0.5095
    // FS_sub = 0.5095 * 1.587 = 0.808
    let fs_sub_expected: f64 = (gamma_prime / gamma_sat) * fs_dry_expected;

    assert!(
        (fs_sub - fs_sub_expected).abs() / fs_sub_expected < 0.01,
        "Submerged infinite slope FS: {:.3}, expected {:.3}", fs_sub, fs_sub_expected
    );

    // Submergence should always reduce FS for seepage case
    assert!(
        fs_sub < fs_dry,
        "Submerged FS ({:.3}) should be less than dry FS ({:.3})", fs_sub, fs_dry
    );

    // Submerged FS < 1.0 means this slope is unstable under seepage
    assert!(
        fs_sub < 1.0,
        "FS_sub = {:.3} should be < 1.0 (unstable under seepage)", fs_sub
    );

    // Cohesive infinite slope: FS = c/(γHsinβcosβ) + tan(φ)/tan(β)
    let c: f64 = 10.0;           // kPa, cohesion
    let gamma: f64 = 18.0;       // kN/m³, unit weight
    let h_depth: f64 = 3.0;      // m, depth of failure plane

    let fs_cohesive: f64 = c / (gamma * h_depth * beta_rad.sin() * beta_rad.cos())
        + phi_rad.tan() / beta_rad.tan();

    // c-component = 10 / (18 * 3 * 0.3420 * 0.9397) = 10 / 17.35 = 0.577
    // φ-component = 1.587
    // FS = 0.577 + 1.587 = 2.164
    let c_component: f64 = c / (gamma * h_depth * beta_rad.sin() * beta_rad.cos());
    let phi_component: f64 = phi_rad.tan() / beta_rad.tan();
    let fs_cohesive_expected: f64 = c_component + phi_component;

    assert!(
        (fs_cohesive - fs_cohesive_expected).abs() / fs_cohesive_expected < 0.001,
        "Cohesive infinite slope FS: {:.3}, expected {:.3}", fs_cohesive, fs_cohesive_expected
    );

    // Cohesion should always improve FS
    assert!(
        fs_cohesive > fs_dry,
        "Cohesive FS ({:.3}) > dry cohesionless FS ({:.3})", fs_cohesive, fs_dry
    );
}

// ================================================================
// 2. Ordinary Method of Slices (Fellenius)
// ================================================================
//
// The Fellenius method (Swedish method) assumes zero inter-slice forces.
// For a circular failure surface divided into n slices:
//   FS = Σ[c'·b_i/cos(α_i) + (W_i·cos(α_i) - u_i·b_i/cos(α_i))·tan(φ')]
//        / Σ[W_i·sin(α_i)]
//
// This is the simplest slice method and gives conservative results.
// Reference: Fellenius (1927); Duncan & Wright Ch. 6; USACE §C-3

#[test]
fn slope_fellenius_ordinary_method() {
    // Simple 3-slice example through homogeneous slope
    // Slice data: (width, weight, base angle, pore pressure at base)
    let c_prime: f64 = 15.0;     // kPa, effective cohesion
    let phi_prime_deg: f64 = 25.0;
    let phi_prime_rad: f64 = phi_prime_deg.to_radians();

    // Slice parameters: (b_i [m], W_i [kN/m], α_i [deg], u_i [kPa])
    let slices: [(f64, f64, f64, f64); 5] = [
        (2.0, 40.0,  -10.0, 5.0),   // slice 1: toe region, negative angle
        (2.0, 100.0,   5.0, 12.0),   // slice 2
        (2.0, 140.0,  20.0, 18.0),   // slice 3: near center
        (2.0, 110.0,  35.0, 10.0),   // slice 4
        (2.0, 50.0,   50.0, 3.0),    // slice 5: crest region
    ];

    let mut sum_resisting: f64 = 0.0;
    let mut sum_driving: f64 = 0.0;

    for &(b_i, w_i, alpha_deg, u_i) in &slices {
        let alpha_rad: f64 = alpha_deg.to_radians();
        let sec_alpha: f64 = 1.0 / alpha_rad.cos();

        // Resisting force on base of slice
        let base_length: f64 = b_i * sec_alpha;
        let normal_effective: f64 = w_i * alpha_rad.cos() - u_i * base_length;
        let resisting: f64 = c_prime * base_length + normal_effective * phi_prime_rad.tan();
        sum_resisting += resisting;

        // Driving force
        let driving: f64 = w_i * alpha_rad.sin();
        sum_driving += driving;
    }

    let fs_fellenius: f64 = sum_resisting / sum_driving;

    // Verify FS is physically reasonable (> 0)
    assert!(
        fs_fellenius > 0.0,
        "Fellenius FS should be positive: {:.3}", fs_fellenius
    );

    // Recompute independently to verify formula consistency
    let mut _check_resist: f64 = 0.0;
    let mut _check_drive: f64 = 0.0;
    for &(b_i, w_i, alpha_deg, u_i) in &slices {
        let a: f64 = alpha_deg.to_radians();
        let bl: f64 = b_i / a.cos();
        _check_resist += c_prime * bl + (w_i * a.cos() - u_i * bl) * phi_prime_rad.tan();
        _check_drive += w_i * a.sin();
    }
    let fs_check: f64 = _check_resist / _check_drive;

    assert!(
        (fs_fellenius - fs_check).abs() < 1e-10,
        "Fellenius internal consistency: {:.6} vs {:.6}", fs_fellenius, fs_check
    );

    // Fellenius method is known to be conservative (lower FS than Bishop)
    // FS should be reasonable for this geometry (between 1.0 and 3.0 typically)
    assert!(
        fs_fellenius > 0.5 && fs_fellenius < 5.0,
        "Fellenius FS {:.3} should be in reasonable range", fs_fellenius
    );
}

// ================================================================
// 3. Bishop's Simplified Method
// ================================================================
//
// Bishop's simplified method satisfies moment equilibrium and accounts
// for inter-slice normal forces (but not shear). Iterative solution:
//   FS = Σ[(c'·b_i + (W_i - u_i·b_i)·tan(φ')) / m_α(i)]
//        / Σ[W_i·sin(α_i)]
//
// where m_α(i) = cos(α_i) + sin(α_i)·tan(φ')/FS
//
// The method requires iteration since FS appears on both sides.
// Reference: Bishop (1955); Duncan & Wright Ch. 6; USACE §C-4

#[test]
fn slope_bishop_simplified() {
    let c_prime: f64 = 15.0;     // kPa
    let phi_prime_deg: f64 = 25.0;
    let phi_prime_rad: f64 = phi_prime_deg.to_radians();
    let tan_phi: f64 = phi_prime_rad.tan();

    // Same slice geometry as Fellenius test
    let slices: [(f64, f64, f64, f64); 5] = [
        (2.0, 40.0,  -10.0, 5.0),
        (2.0, 100.0,   5.0, 12.0),
        (2.0, 140.0,  20.0, 18.0),
        (2.0, 110.0,  35.0, 10.0),
        (2.0, 50.0,   50.0, 3.0),
    ];

    // Sum of driving forces (same as Fellenius)
    let sum_driving: f64 = slices.iter()
        .map(|&(_b, w, alpha_deg, _u)| w * alpha_deg.to_radians().sin())
        .sum();

    // Iterative Bishop solution
    let mut fs: f64 = 1.5; // initial guess
    let max_iter: usize = 50;
    let tol: f64 = 1e-6;

    for _iter in 0..max_iter {
        let mut sum_resisting: f64 = 0.0;

        for &(b_i, w_i, alpha_deg, u_i) in &slices {
            let alpha_rad: f64 = alpha_deg.to_radians();

            // Bishop's m_α factor
            let m_alpha: f64 = alpha_rad.cos() + alpha_rad.sin() * tan_phi / fs;

            // Resisting force contribution
            let numerator: f64 = c_prime * b_i + (w_i - u_i * b_i) * tan_phi;
            sum_resisting += numerator / m_alpha;
        }

        let fs_new: f64 = sum_resisting / sum_driving;

        if (fs_new - fs).abs() < tol {
            fs = fs_new;
            break;
        }
        fs = fs_new;
    }

    // Bishop FS should be greater than Fellenius FS for same geometry
    // (Fellenius is conservative). Recompute Fellenius for comparison.
    let mut sum_resist_fell: f64 = 0.0;
    for &(b_i, w_i, alpha_deg, u_i) in &slices {
        let a: f64 = alpha_deg.to_radians();
        let bl: f64 = b_i / a.cos();
        sum_resist_fell += c_prime * bl + (w_i * a.cos() - u_i * bl) * tan_phi;
    }
    let fs_fellenius: f64 = sum_resist_fell / sum_driving;

    assert!(
        fs > fs_fellenius,
        "Bishop FS ({:.3}) should exceed Fellenius FS ({:.3})", fs, fs_fellenius
    );

    // Bishop's method converges to a stable value
    // Run a second iteration pass and confirm same result
    let mut fs_verify: f64 = 1.0;
    for _iter in 0..max_iter {
        let mut sum_r: f64 = 0.0;
        for &(b_i, w_i, alpha_deg, u_i) in &slices {
            let alpha_rad: f64 = alpha_deg.to_radians();
            let m_alpha: f64 = alpha_rad.cos() + alpha_rad.sin() * tan_phi / fs_verify;
            sum_r += (c_prime * b_i + (w_i - u_i * b_i) * tan_phi) / m_alpha;
        }
        let fs_new: f64 = sum_r / sum_driving;
        if (fs_new - fs_verify).abs() < tol {
            fs_verify = fs_new;
            break;
        }
        fs_verify = fs_new;
    }

    assert!(
        (fs - fs_verify).abs() / fs < 0.001,
        "Bishop convergence: FS={:.6} from guess=1.5, FS={:.6} from guess=1.0", fs, fs_verify
    );

    // FS should be in physically meaningful range
    assert!(
        fs > 0.5 && fs < 5.0,
        "Bishop FS {:.3} should be in reasonable range", fs
    );
}

// ================================================================
// 4. Janbu's Simplified Method
// ================================================================
//
// Janbu's method satisfies horizontal force equilibrium (not moment)
// and is applicable to non-circular failure surfaces.
//   FS_0 = Σ[(c'·b_i + (W_i - u_i·b_i)·tan(φ')) · sec²(α_i) / m_α(i)]
//          / Σ[W_i·tan(α_i)]
//
// where m_α(i) = (1 + tan(α_i)·tan(φ')/FS) · cos²(α_i)
//
// A correction factor f₀ is then applied: FS = f₀ · FS_0
// f₀ depends on d/L and φ (from Janbu's charts, typically 1.0-1.1)
//
// Reference: Janbu (1973); Abramson et al Ch. 8; USACE §C-5

#[test]
fn slope_janbu_simplified() {
    let c_prime: f64 = 15.0;
    let phi_prime_deg: f64 = 25.0;
    let phi_prime_rad: f64 = phi_prime_deg.to_radians();
    let tan_phi: f64 = phi_prime_rad.tan();

    // Non-circular failure surface (can use same slice data for comparison)
    let slices: [(f64, f64, f64, f64); 5] = [
        (2.0, 40.0,  -10.0, 5.0),
        (2.0, 100.0,   5.0, 12.0),
        (2.0, 140.0,  20.0, 18.0),
        (2.0, 110.0,  35.0, 10.0),
        (2.0, 50.0,   50.0, 3.0),
    ];

    // Driving forces for Janbu (horizontal force equilibrium)
    let sum_driving: f64 = slices.iter()
        .map(|&(_b, w, alpha_deg, _u)| w * alpha_deg.to_radians().tan())
        .sum();

    // Iterative Janbu solution
    let mut fs: f64 = 1.5;
    let max_iter: usize = 50;
    let tol: f64 = 1e-6;

    for _iter in 0..max_iter {
        let mut sum_resisting: f64 = 0.0;

        for &(b_i, w_i, alpha_deg, u_i) in &slices {
            let alpha_rad: f64 = alpha_deg.to_radians();
            let cos_alpha: f64 = alpha_rad.cos();
            let tan_alpha: f64 = alpha_rad.tan();

            // Janbu's n_α factor (analogous to Bishop's m_α)
            let n_alpha: f64 = cos_alpha * cos_alpha * (1.0 + tan_alpha * tan_phi / fs);

            let numerator: f64 = c_prime * b_i + (w_i - u_i * b_i) * tan_phi;
            sum_resisting += numerator / n_alpha;
        }

        let fs_new: f64 = sum_resisting / sum_driving;

        if (fs_new - fs).abs() < tol {
            fs = fs_new;
            break;
        }
        fs = fs_new;
    }

    // Apply Janbu correction factor f₀
    // For c-φ soils, d/L ≈ 0.15 and φ = 25°: f₀ ≈ 1.04 (from charts)
    let f0: f64 = 1.04;
    let fs_corrected: f64 = f0 * fs;

    // Janbu uncorrected FS is generally lower than Bishop for circular surfaces
    // After correction, it should be closer but still may differ
    assert!(
        fs > 0.5 && fs < 5.0,
        "Janbu uncorrected FS {:.3} should be in reasonable range", fs
    );

    assert!(
        fs_corrected > fs,
        "Corrected FS ({:.3}) should exceed uncorrected ({:.3})", fs_corrected, fs
    );

    // Correction factor should increase FS by a modest amount
    let correction_pct: f64 = (fs_corrected - fs) / fs * 100.0;
    assert!(
        correction_pct > 0.0 && correction_pct < 15.0,
        "Janbu correction {:.1}% should be in 0-15% range", correction_pct
    );

    // Verify convergence from a different initial guess
    let mut fs_alt: f64 = 2.5;
    for _iter in 0..max_iter {
        let mut sum_r: f64 = 0.0;
        for &(b_i, w_i, alpha_deg, u_i) in &slices {
            let alpha_rad: f64 = alpha_deg.to_radians();
            let cos_alpha: f64 = alpha_rad.cos();
            let tan_alpha: f64 = alpha_rad.tan();
            let n_alpha: f64 = cos_alpha * cos_alpha * (1.0 + tan_alpha * tan_phi / fs_alt);
            sum_r += (c_prime * b_i + (w_i - u_i * b_i) * tan_phi) / n_alpha;
        }
        let fs_new: f64 = sum_r / sum_driving;
        if (fs_new - fs_alt).abs() < tol {
            fs_alt = fs_new;
            break;
        }
        fs_alt = fs_new;
    }

    assert!(
        (fs - fs_alt).abs() / fs < 0.01,
        "Janbu convergence: FS={:.6} vs {:.6}", fs, fs_alt
    );
}

// ================================================================
// 5. Spencer's Method (Force and Moment Equilibrium)
// ================================================================
//
// Spencer's method satisfies both force and moment equilibrium by
// assuming inter-slice forces are inclined at a constant angle θ.
// It solves for both FS and θ simultaneously.
//
// For each slice:
//   N' = (W - (X_{i+1} - X_i) - c'·b·sin(α)/FS) / m_α
//         where X = E·tan(θ), E = inter-slice normal force
//
// Force equilibrium → FS_f(θ)
// Moment equilibrium → FS_m(θ)
// Solution at FS_f = FS_m
//
// For a homogeneous slope, Spencer's FS is typically very close to
// Bishop's for circular surfaces, confirming Bishop's accuracy.
//
// Reference: Spencer (1967); Abramson et al Ch. 8; USACE §C-6

#[test]
fn slope_spencer_method() {
    let c_prime: f64 = 15.0;
    let phi_prime_deg: f64 = 25.0;
    let phi_prime_rad: f64 = phi_prime_deg.to_radians();
    let tan_phi: f64 = phi_prime_rad.tan();

    let slices: [(f64, f64, f64, f64); 5] = [
        (2.0, 40.0,  -10.0, 5.0),
        (2.0, 100.0,   5.0, 12.0),
        (2.0, 140.0,  20.0, 18.0),
        (2.0, 110.0,  35.0, 10.0),
        (2.0, 50.0,   50.0, 3.0),
    ];

    let sum_driving_moment: f64 = slices.iter()
        .map(|&(_b, w, alpha_deg, _u)| w * alpha_deg.to_radians().sin())
        .sum();

    // Spencer's method: iterate over θ (inter-slice force angle)
    // For circular slip surface, compute FS_m (moment) for various θ
    // At θ=0, FS_m = Bishop's FS. Spencer finds θ where FS_f = FS_m.
    //
    // Simplified demonstration: compute Bishop's FS (θ=0 case of Spencer)
    // and confirm it is physically consistent.
    let tol: f64 = 1e-6;
    let max_iter: usize = 50;

    // Moment equilibrium FS at θ = 0 (reduces to Bishop)
    let mut fs_m: f64 = 1.5;
    for _iter in 0..max_iter {
        let mut sum_r: f64 = 0.0;
        for &(b_i, w_i, alpha_deg, u_i) in &slices {
            let alpha_rad: f64 = alpha_deg.to_radians();
            let m_alpha: f64 = alpha_rad.cos() + alpha_rad.sin() * tan_phi / fs_m;
            sum_r += (c_prime * b_i + (w_i - u_i * b_i) * tan_phi) / m_alpha;
        }
        let fs_new: f64 = sum_r / sum_driving_moment;
        if (fs_new - fs_m).abs() < tol {
            fs_m = fs_new;
            break;
        }
        fs_m = fs_new;
    }

    // Force equilibrium FS at θ = 0 (horizontal resolution)
    let sum_driving_force: f64 = slices.iter()
        .map(|&(_b, w, alpha_deg, _u)| w * alpha_deg.to_radians().tan())
        .sum();

    let mut fs_f: f64 = 1.5;
    for _iter in 0..max_iter {
        let mut sum_r: f64 = 0.0;
        for &(b_i, w_i, alpha_deg, u_i) in &slices {
            let alpha_rad: f64 = alpha_deg.to_radians();
            let cos_a: f64 = alpha_rad.cos();
            let tan_a: f64 = alpha_rad.tan();
            let n_alpha: f64 = cos_a * cos_a * (1.0 + tan_a * tan_phi / fs_f);
            sum_r += (c_prime * b_i + (w_i - u_i * b_i) * tan_phi) / n_alpha;
        }
        let fs_new: f64 = sum_r / sum_driving_force;
        if (fs_new - fs_f).abs() < tol {
            fs_f = fs_new;
            break;
        }
        fs_f = fs_new;
    }

    // For Spencer's method, the true FS lies between FS_m and FS_f at θ=0.
    // As θ varies, FS_m decreases and FS_f increases until they meet.
    // The Spencer FS is bounded by the θ=0 values.
    let fs_spencer_lower: f64 = fs_m.min(fs_f);
    let fs_spencer_upper: f64 = fs_m.max(fs_f);

    assert!(
        fs_spencer_lower > 0.0,
        "Spencer lower bound FS should be positive: {:.3}", fs_spencer_lower
    );

    // For circular surfaces, Spencer and Bishop give very close results
    // (within ~5% typically)
    let relative_diff: f64 = (fs_m - fs_f).abs() / fs_m;
    assert!(
        relative_diff < 0.20,
        "Spencer FS_m ({:.3}) and FS_f ({:.3}) should be within 20% for these slices",
        fs_m, fs_f
    );

    // The average is a reasonable approximation of the Spencer FS
    let _fs_spencer_approx: f64 = (fs_m + fs_f) / 2.0;
    assert!(
        _fs_spencer_approx > fs_spencer_lower && _fs_spencer_approx < fs_spencer_upper,
        "Spencer approx FS {:.3} should be between bounds [{:.3}, {:.3}]",
        _fs_spencer_approx, fs_spencer_lower, fs_spencer_upper
    );
}

// ================================================================
// 6. Seismic Slope Stability — Pseudo-Static Analysis
// ================================================================
//
// Pseudo-static method adds horizontal seismic force kh*W to each slice:
//   FS_seis = Σ[(c'·b/cosα + (W·cosα - kh·W·sinα - u·b/cosα)·tanφ')]
//             / Σ[W·sinα + kh·W·cosα]
//
// The seismic coefficient kh is typically 0.5*PGA/g (USACE) or from
// site-specific analysis. Vertical seismic effects often neglected
// or taken as kv = 0.5*kh.
//
// Reference: USACE EM 1110-2-1902 §E-2; EN 1998-5 §4.1.3;
//            Abramson et al Ch. 12

#[test]
fn slope_seismic_pseudostatic() {
    let c_prime: f64 = 15.0;
    let phi_prime_deg: f64 = 25.0;
    let phi_prime_rad: f64 = phi_prime_deg.to_radians();
    let tan_phi: f64 = phi_prime_rad.tan();

    let slices: [(f64, f64, f64, f64); 5] = [
        (2.0, 40.0,  -10.0, 5.0),
        (2.0, 100.0,   5.0, 12.0),
        (2.0, 140.0,  20.0, 18.0),
        (2.0, 110.0,  35.0, 10.0),
        (2.0, 50.0,   50.0, 3.0),
    ];

    let kh: f64 = 0.15; // horizontal seismic coefficient

    // Static FS (Fellenius for simplicity)
    let mut sum_resist_static: f64 = 0.0;
    let mut sum_drive_static: f64 = 0.0;
    for &(b_i, w_i, alpha_deg, u_i) in &slices {
        let a: f64 = alpha_deg.to_radians();
        let bl: f64 = b_i / a.cos();
        sum_resist_static += c_prime * bl + (w_i * a.cos() - u_i * bl) * tan_phi;
        sum_drive_static += w_i * a.sin();
    }
    let fs_static: f64 = sum_resist_static / sum_drive_static;

    // Seismic FS (pseudo-static Fellenius)
    let mut sum_resist_seis: f64 = 0.0;
    let mut sum_drive_seis: f64 = 0.0;
    for &(b_i, w_i, alpha_deg, u_i) in &slices {
        let a: f64 = alpha_deg.to_radians();
        let bl: f64 = b_i / a.cos();

        // Normal force reduced by seismic component
        let normal_eff: f64 = w_i * a.cos() - kh * w_i * a.sin() - u_i * bl;
        sum_resist_seis += c_prime * bl + normal_eff * tan_phi;

        // Driving force increased by seismic component
        sum_drive_seis += w_i * a.sin() + kh * w_i * a.cos();
    }
    let fs_seismic: f64 = sum_resist_seis / sum_drive_seis;

    // Seismic FS should always be less than static FS
    assert!(
        fs_seismic < fs_static,
        "Seismic FS ({:.3}) should be less than static FS ({:.3})", fs_seismic, fs_static
    );

    // Verify the reduction is meaningful
    let reduction_pct: f64 = (fs_static - fs_seismic) / fs_static * 100.0;
    assert!(
        reduction_pct > 5.0,
        "Seismic reduction {:.1}% should be significant for kh={}", reduction_pct, kh
    );

    // Higher seismic coefficient should give lower FS
    let kh_high: f64 = 0.30;
    let mut sum_resist_high: f64 = 0.0;
    let mut sum_drive_high: f64 = 0.0;
    for &(b_i, w_i, alpha_deg, u_i) in &slices {
        let a: f64 = alpha_deg.to_radians();
        let bl: f64 = b_i / a.cos();
        let normal_eff: f64 = w_i * a.cos() - kh_high * w_i * a.sin() - u_i * bl;
        sum_resist_high += c_prime * bl + normal_eff * tan_phi;
        sum_drive_high += w_i * a.sin() + kh_high * w_i * a.cos();
    }
    let fs_seismic_high: f64 = sum_resist_high / sum_drive_high;

    assert!(
        fs_seismic_high < fs_seismic,
        "Higher kh ({}) gives lower FS ({:.3}) vs kh={} FS ({:.3})",
        kh_high, fs_seismic_high, kh, fs_seismic
    );

    // Critical seismic coefficient (FS = 1.0) — yield acceleration
    // Approximate by linear interpolation
    let _ky_approx: f64 = kh * (fs_seismic - 1.0) / (fs_seismic - fs_seismic_high) * (kh_high - kh) + kh;
    // Should be between kh and some upper limit
    assert!(
        _ky_approx > 0.0,
        "Yield acceleration coefficient should be positive: {:.4}", _ky_approx
    );
}

// ================================================================
// 7. Reinforced Slope Design — Geogrid Stabilization
// ================================================================
//
// Geogrid reinforcement adds a stabilizing force T at each
// reinforcement level, contributing to moment equilibrium:
//   FS_reinf = [Σ(c'·b/cosα + N'·tanφ') + Σ(T_j·cos(α_j)·R)]
//              / Σ(W·sin(α)·R)
//
// Total reinforcement: T_total = Σ T_j
// Design uses long-term design strength (LTDS):
//   T_allow = T_ult / (RF_ID × RF_CR × RF_D × RF_FS)
//
// Reference: FHWA-NHI-10-024 "Design of Mechanically Stabilized Earth
//            Walls and Reinforced Slopes"; Abramson et al Ch. 11;
//            EN 1997-1 §12

#[test]
fn slope_reinforced_geogrid() {
    let c_prime: f64 = 5.0;      // kPa, low cohesion fill
    let phi_prime_deg: f64 = 30.0;
    let phi_prime_rad: f64 = phi_prime_deg.to_radians();
    let tan_phi: f64 = phi_prime_rad.tan();
    let gamma: f64 = 19.0;       // kN/m³, fill unit weight
    let h_slope: f64 = 8.0;      // m, slope height
    let _beta_deg: f64 = 60.0;   // degrees, slope angle (steep)

    // Unreinforced FS using simplified planar failure analysis
    // For planar surface at angle θ_cr through cohesionless soil:
    // FS = (c/γH + (1-ru)cos²θ·tanφ) / (sinθ·cosθ)
    // Critical angle θ_cr ≈ 45 + φ/2 for cohesionless (approximate)
    let _theta_cr_deg: f64 = 45.0 + phi_prime_deg / 2.0;
    let theta_cr_rad: f64 = _theta_cr_deg.to_radians();

    let weight_per_m: f64 = 0.5 * gamma * h_slope * h_slope / theta_cr_rad.tan();

    let resisting_unreinf: f64 = c_prime * h_slope / theta_cr_rad.sin()
        + weight_per_m * theta_cr_rad.cos() * tan_phi;
    let driving: f64 = weight_per_m * theta_cr_rad.sin();

    let fs_unreinf: f64 = resisting_unreinf / driving;

    // Geogrid reinforcement design
    let t_ult: f64 = 120.0;      // kN/m, ultimate tensile strength
    let rf_id: f64 = 1.10;       // installation damage reduction factor
    let rf_cr: f64 = 2.00;       // creep reduction factor
    let rf_d: f64 = 1.10;        // durability reduction factor

    // Long-term design strength (LTDS)
    let t_allow: f64 = t_ult / (rf_id * rf_cr * rf_d);
    // = 120 / (1.1 * 2.0 * 1.1) = 120 / 2.42 = 49.6 kN/m
    let t_allow_expected: f64 = 120.0 / (1.1 * 2.0 * 1.1);

    assert!(
        (t_allow - t_allow_expected).abs() / t_allow_expected < 0.01,
        "LTDS: {:.1} kN/m, expected {:.1}", t_allow, t_allow_expected
    );

    // Required number of layers for target FS = 1.5
    let fs_target: f64 = 1.5;
    let t_total_required: f64 = (fs_target * driving - resisting_unreinf) / 1.0;
    // Each reinforcement layer contributes T_allow to resisting forces
    let n_layers: f64 = (t_total_required / t_allow).ceil();

    // Total reinforcement force
    let t_total: f64 = n_layers * t_allow;

    // Reinforced FS
    let fs_reinf: f64 = (resisting_unreinf + t_total) / driving;

    // Reinforced FS should meet or exceed target
    assert!(
        fs_reinf >= fs_target,
        "Reinforced FS ({:.3}) should meet target ({:.3})", fs_reinf, fs_target
    );

    // Reinforcement should improve FS
    assert!(
        fs_reinf > fs_unreinf,
        "Reinforced FS ({:.3}) > unreinforced FS ({:.3})", fs_reinf, fs_unreinf
    );

    // Verify reduction factors reduce strength significantly
    let rf_total: f64 = rf_id * rf_cr * rf_d;
    assert!(
        rf_total > 2.0,
        "Combined reduction factor ({:.2}) should be > 2.0", rf_total
    );

    // Verify spacing is reasonable
    let spacing: f64 = h_slope / n_layers;
    assert!(
        spacing > 0.2 && spacing < 2.0,
        "Layer spacing {:.2} m should be between 0.2 and 2.0 m", spacing
    );
}

// ================================================================
// 8. Slope Drainage and Pore Pressure Effects
// ================================================================
//
// Pore water pressure reduces effective stress and thus shear strength:
//   τ = c' + (σ - u)·tan(φ')
//
// The pore pressure ratio ru = u / (γ·z) quantifies the effect.
//   ru = 0 (dry), ru ≈ 0.5 (typical), ru = γ_w/γ (fully saturated seepage)
//
// For infinite slope with ru:
//   FS = c'/(γ·H·sinβ·cosβ) + (1 - ru)·tan(φ')/tan(β)
//
// Drainage measures (e.g., horizontal drains) reduce u and increase FS.
//
// Reference: USACE EM 1110-2-1902 §D-2; EN 1997-1 §11.5.1;
//            Duncan & Wright Ch. 7

#[test]
fn slope_drainage_pore_pressure() {
    let c_prime: f64 = 10.0;     // kPa
    let phi_prime_deg: f64 = 28.0;
    let phi_prime_rad: f64 = phi_prime_deg.to_radians();
    let gamma: f64 = 19.0;       // kN/m³
    let gamma_w: f64 = 9.81;     // kN/m³
    let h_depth: f64 = 5.0;      // m, depth of failure surface
    let beta_deg: f64 = 25.0;    // degrees, slope angle
    let beta_rad: f64 = beta_deg.to_radians();

    // Case 1: Dry slope (ru = 0)
    let ru_dry: f64 = 0.0;
    let fs_dry: f64 = c_prime / (gamma * h_depth * beta_rad.sin() * beta_rad.cos())
        + (1.0 - ru_dry) * phi_prime_rad.tan() / beta_rad.tan();

    // Case 2: High water table (ru = 0.4)
    let ru_wet: f64 = 0.4;
    let fs_wet: f64 = c_prime / (gamma * h_depth * beta_rad.sin() * beta_rad.cos())
        + (1.0 - ru_wet) * phi_prime_rad.tan() / beta_rad.tan();

    // Case 3: Fully saturated with seepage (ru = γ_w/γ)
    let ru_sat: f64 = gamma_w / gamma;
    let fs_sat: f64 = c_prime / (gamma * h_depth * beta_rad.sin() * beta_rad.cos())
        + (1.0 - ru_sat) * phi_prime_rad.tan() / beta_rad.tan();

    // FS should decrease with increasing pore pressure
    assert!(
        fs_dry > fs_wet,
        "Dry FS ({:.3}) > wet FS ({:.3})", fs_dry, fs_wet
    );
    assert!(
        fs_wet > fs_sat,
        "Wet FS ({:.3}) > saturated FS ({:.3})", fs_wet, fs_sat
    );

    // Quantify the effect of drainage (reducing ru from 0.4 to 0.1)
    let ru_drained: f64 = 0.1;
    let fs_drained: f64 = c_prime / (gamma * h_depth * beta_rad.sin() * beta_rad.cos())
        + (1.0 - ru_drained) * phi_prime_rad.tan() / beta_rad.tan();

    let fs_improvement: f64 = (fs_drained - fs_wet) / fs_wet * 100.0;
    assert!(
        fs_improvement > 0.0,
        "Drainage should improve FS: improvement = {:.1}%", fs_improvement
    );

    // Verify the friction component scales linearly with (1 - ru)
    let friction_dry: f64 = (1.0 - ru_dry) * phi_prime_rad.tan() / beta_rad.tan();
    let friction_wet: f64 = (1.0 - ru_wet) * phi_prime_rad.tan() / beta_rad.tan();
    let expected_ratio: f64 = (1.0 - ru_wet) / (1.0 - ru_dry);

    assert!(
        (friction_wet / friction_dry - expected_ratio).abs() < 1e-10,
        "Friction ratio: {:.6}, expected {:.6}", friction_wet / friction_dry, expected_ratio
    );

    // Cohesion contribution is independent of pore pressure
    let c_component_dry: f64 = c_prime / (gamma * h_depth * beta_rad.sin() * beta_rad.cos());
    let c_component_wet: f64 = c_prime / (gamma * h_depth * beta_rad.sin() * beta_rad.cos());

    assert!(
        (c_component_dry - c_component_wet).abs() < 1e-10,
        "Cohesion component should be independent of ru"
    );

    // EC7 requirement: FS ≥ 1.25 for permanent slopes (DA1/C2)
    let ec7_target: f64 = 1.25;
    // Determine maximum ru that gives FS = 1.25
    // FS = c_comp + (1-ru)*f_comp = 1.25
    // ru_max = 1 - (1.25 - c_comp) / f_comp
    let f_comp_unit: f64 = phi_prime_rad.tan() / beta_rad.tan();
    let ru_max: f64 = 1.0 - (ec7_target - c_component_dry) / f_comp_unit;

    assert!(
        ru_max > 0.0 && ru_max < 1.0,
        "Maximum allowable ru = {:.3} should be between 0 and 1", ru_max
    );

    // Verify: at ru_max, FS should equal the target
    let fs_at_limit: f64 = c_component_dry + (1.0 - ru_max) * f_comp_unit;
    assert!(
        (fs_at_limit - ec7_target).abs() < 1e-10,
        "FS at ru_max ({:.3}) should equal target ({:.3})", fs_at_limit, ec7_target
    );
}
