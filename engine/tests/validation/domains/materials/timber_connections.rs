/// Validation: Timber Connection Design Formulas (NDS)
///
/// References:
///   - NDS 2018: "National Design Specification for Wood Construction"
///   - NDS Table 12.3.3: Dowel Bearing Strengths
///   - NDS 12.3.1: Yield Limit Equations for Single-Shear Connections
///   - NDS 10.3.6: Group Action Factor
///   - Breyer et al.: "Design of Wood Structures - ASD/LRFD" 8th ed.
///   - AF&PA/AWC Technical Report 12: "General Dowel Equations"
///
/// Tests verify NDS timber connection formulas with hand-computed values.
/// No solver calls -- pure arithmetic verification of analytical expressions.

use std::f64::consts::PI;

// ================================================================
// Tolerance helper
// ================================================================

fn assert_close(got: f64, expected: f64, rel_tol: f64, label: &str) {
    let err: f64 = if expected.abs() < 1e-12 {
        got.abs()
    } else {
        (got - expected).abs() / expected.abs()
    };
    assert!(
        err < rel_tol,
        "{}: got {:.6}, expected {:.6}, rel err = {:.4}%",
        label, got, expected, err * 100.0
    );
}

// ================================================================
// 1. NDS Dowel Bearing Strength (NDS Table 12.3.3)
// ================================================================
//
// Dowel bearing strength parallel to grain for softwood:
//   Fe_par = 11200 * G (psi)  for D <= 1/4"
//   Fe_par = 11200 * G (psi)  simplified for bolts
//
// Dowel bearing strength perpendicular to grain:
//   Fe_perp = 6100 * G^1.45 / sqrt(D) (psi)
//
// For Douglas Fir-Larch (G = 0.50), D = 0.75":
//   Fe_par = 11200 * 0.50 = 5600 psi
//   Fe_perp = 6100 * 0.50^1.45 / sqrt(0.75) = 6100 * 0.3660 / 0.8660
//           = 2232.6 / 0.8660 = 2578.2 psi

#[test]
fn validation_nds_dowel_bearing_strength() {
    let g: f64 = 0.50;         // specific gravity, Douglas Fir-Larch
    let d: f64 = 0.75;         // in, bolt diameter

    // Parallel to grain bearing strength
    let fe_par: f64 = 11200.0 * g;
    assert_close(fe_par, 5600.0, 0.001, "Fe_par for DF-L");

    // Perpendicular to grain bearing strength
    let fe_perp: f64 = 6100.0 * g.powf(1.45) / d.sqrt();
    let expected_fe_perp: f64 = 6100.0 * 0.50_f64.powf(1.45) / 0.75_f64.sqrt();
    assert_close(fe_perp, expected_fe_perp, 0.001, "Fe_perp for DF-L");

    // Fe_perp should be less than Fe_par (wood is weaker across grain)
    assert!(
        fe_perp < fe_par,
        "Fe_perp ({:.1}) should be < Fe_par ({:.1})",
        fe_perp, fe_par
    );

    // Check specific numerical value
    assert_close(fe_perp, 2578.0, 0.01, "Fe_perp numerical check");
}

// ================================================================
// 2. Hankinson Formula (NDS Appendix J)
// ================================================================
//
// Load at angle θ to grain:
//   Fn_theta = F_par * F_perp / (F_par * sin²θ + F_perp * cos²θ)
//
// For θ = 0°:  Fn = F_par (parallel)
// For θ = 90°: Fn = F_perp (perpendicular)
// For θ = 30°: intermediate value
//
// Using Fe_par = 5600 psi, Fe_perp = 2578 psi:
//   At θ = 30°:
//     sin²(30°) = 0.25, cos²(30°) = 0.75
//     Fn = 5600*2578 / (5600*0.25 + 2578*0.75)
//        = 14,436,800 / (1400 + 1933.5) = 14,436,800 / 3333.5
//        = 4330.1 psi

#[test]
fn validation_hankinson_formula() {
    let f_par: f64 = 5600.0;   // psi
    let f_perp: f64 = 2578.0;  // psi

    // Hankinson formula
    let hankinson = |theta_deg: f64| -> f64 {
        let theta: f64 = theta_deg * PI / 180.0;
        let sin2: f64 = theta.sin().powi(2);
        let cos2: f64 = theta.cos().powi(2);
        f_par * f_perp / (f_par * sin2 + f_perp * cos2)
    };

    // At θ = 0° should equal F_par
    let fn_0: f64 = hankinson(0.0);
    assert_close(fn_0, f_par, 0.001, "Hankinson at 0°");

    // At θ = 90° should equal F_perp
    let fn_90: f64 = hankinson(90.0);
    assert_close(fn_90, f_perp, 0.001, "Hankinson at 90°");

    // At θ = 30°
    let fn_30: f64 = hankinson(30.0);
    let sin2_30: f64 = 0.25;
    let cos2_30: f64 = 0.75;
    let expected_30: f64 = f_par * f_perp / (f_par * sin2_30 + f_perp * cos2_30);
    assert_close(fn_30, expected_30, 0.001, "Hankinson at 30°");

    // At θ = 45°
    let fn_45: f64 = hankinson(45.0);
    let expected_45: f64 = f_par * f_perp / (f_par * 0.5 + f_perp * 0.5);
    assert_close(fn_45, expected_45, 0.001, "Hankinson at 45°");

    // Monotonically decreasing from 0° to 90°
    assert!(fn_0 > fn_30, "Fn(0°) > Fn(30°)");
    assert!(fn_30 > fn_45, "Fn(30°) > Fn(45°)");
    assert!(fn_45 > fn_90, "Fn(45°) > Fn(90°)");
}

// ================================================================
// 3. Bolt Yield Modes (NDS 12.3.1 Yield Limit Equations)
// ================================================================
//
// Single-shear wood-to-wood connection, both members same species.
// D = 0.75", ls = lm = 3.0", Fe_m = Fe_s = 5600 psi, Fyb = 45000 psi
//
// Mode Im: Z = D * lm * Fem             = 0.75 * 3.0 * 5600 = 12600 lbs
// Mode Is: Z = D * ls * Fes             = 0.75 * 3.0 * 5600 = 12600 lbs
// Mode II: Z = k1 * D * ls * Fes        (requires k1 computation)
// Mode IIIm: Z = k2 * D * lm * Fem / (1+2Re)
// Mode IIIs: Z = k3 * D * ls * Fem / (2+Re)
// Mode IV: Z = D² / Rd * sqrt(2*Fem*Fyb / (3*(1+Re)))
//
// Where Re = Fem/Fes (= 1.0 for same species), Rd = 4*Kθ
// Kθ = 1 + 0.25*(θ/90) => Kθ = 1.0 for θ=0° (parallel)
// Rd = 4*1.0 = 4.0

#[test]
fn validation_bolt_yield_modes() {
    let d: f64 = 0.75;         // in, bolt diameter
    let lm: f64 = 3.0;         // in, main member bearing length
    let ls: f64 = 3.0;         // in, side member bearing length
    let fem: f64 = 5600.0;     // psi, main member dowel bearing
    let fes: f64 = 5600.0;     // psi, side member dowel bearing
    let fyb: f64 = 45000.0;    // psi, bolt bending yield strength
    let re: f64 = fem / fes;   // = 1.0
    let rd: f64 = 4.0;         // Rd for θ = 0°

    // Mode Im: bearing in main member
    let z_im: f64 = d * lm * fem / rd;
    assert_close(z_im, 0.75 * 3.0 * 5600.0 / 4.0, 0.001, "Mode Im");

    // Mode Is: bearing in side member
    let z_is: f64 = d * ls * fes / rd;
    assert_close(z_is, z_im, 0.001, "Mode Is = Mode Im (same species)");

    // Mode IV: bolt double bending
    let z_iv: f64 = d * d / rd * (2.0 * fem * fyb / (3.0 * (1.0 + re))).sqrt();
    let expected_iv: f64 = 0.75 * 0.75 / 4.0
        * (2.0_f64 * 5600.0 * 45000.0 / (3.0 * 2.0)).sqrt();
    assert_close(z_iv, expected_iv, 0.001, "Mode IV");

    // Mode IV gives the lowest capacity (ductile failure)
    assert!(z_iv < z_im, "Mode IV ({:.0}) < Mode Im ({:.0})", z_iv, z_im);

    // The controlling value is the minimum
    let z_min: f64 = z_im.min(z_is).min(z_iv);
    assert_close(z_min, z_iv, 0.001, "Controlling mode is IV");
}

// ================================================================
// 4. Group Action Factor Cg (NDS 10.3.6)
// ================================================================
//
// For multiple bolts in a row, the group action factor accounts for
// uneven load distribution among fasteners.
//
//   Cg = [m*(1-m^(2n))] / [n*((1+REA*m^n)^2 - (1+m^(2n)))]
//     * [(1+REA) / (1-m^(2n))]   -- simplified NDS formula
//
// where: m = u - sqrt(u² - 1)
//        u = 1 + γ*s/2 * (1/EA_main + 1/EA_side)
//        γ = load/slip modulus = 180000*D^1.5 (lb/in for wood)
//        REA = EA_smaller / EA_larger
//
// Example: 4 bolts in row, s = 4D = 3.0", D = 0.75"
//   EA_main = EA_side = 1.2e6 * 3.0 * 5.5 = 19.8e6 lb (SPF 2x6)
//   γ = 180000 * 0.75^1.5 = 180000 * 0.6495 = 116,913 lb/in

#[test]
fn validation_group_action_factor() {
    let d: f64 = 0.75;
    let n_bolts: f64 = 4.0;
    let s: f64 = 4.0 * d;      // bolt spacing = 4D = 3.0"

    // Load/slip modulus for bolts in wood
    let gamma: f64 = 180000.0 * d.powf(1.5);
    assert_close(gamma, 180000.0 * 0.6495, 0.01, "gamma");

    // Member stiffnesses (assume equal)
    let ea_main: f64 = 19.8e6;
    let ea_side: f64 = 19.8e6;
    let rea: f64 = ea_side.min(ea_main) / ea_side.max(ea_main);
    assert_close(rea, 1.0, 0.001, "REA for equal members");

    // u parameter
    let u: f64 = 1.0 + gamma * s / 2.0 * (1.0 / ea_main + 1.0 / ea_side);
    assert!(u > 1.0, "u must be > 1.0");

    // m parameter
    let m: f64 = u - (u * u - 1.0).sqrt();
    assert!(m > 0.0 && m < 1.0, "m must be in (0, 1)");

    // For equal stiffnesses, Cg < 1.0 (load not equally shared)
    // Use simplified formula for equal members:
    //   Cg = m*(1-m^(2n)) / (n*(1-m^2)*(1+m^(2n)))
    let n: f64 = n_bolts;
    let m2n: f64 = m.powf(2.0 * n);
    let cg: f64 = m * (1.0 - m2n) / (n * (1.0 - m * m) * (1.0 + m2n));
    assert!(
        cg > 0.3 && cg <= 1.0,
        "Cg = {:.4} should be between 0.3 and 1.0 for 4 bolts",
        cg
    );

    // For 2 bolts, Cg should be higher (closer to 1.0)
    let n2: f64 = 2.0;
    let m2n_2: f64 = m.powf(2.0 * n2);
    let cg_2: f64 = m * (1.0 - m2n_2) / (n2 * (1.0 - m * m) * (1.0 + m2n_2));
    assert!(
        cg_2 > cg,
        "Cg for 2 bolts ({:.4}) > Cg for 4 bolts ({:.4})",
        cg_2, cg
    );
}

// ================================================================
// 5. Nail Withdrawal and Lateral Capacity (NDS 12.2)
// ================================================================
//
// Nail withdrawal per inch of penetration (NDS Table 12.2C):
//   W = 1380 * G^(5/2) * D (lb/in)
//
// For common nail: D = 0.131" (16d), G = 0.50 (Douglas Fir-Larch)
//   W = 1380 * 0.50^2.5 * 0.131
//     = 1380 * 0.17678 * 0.131
//     = 31.95 lb/in
//
// Total withdrawal for p = 2.5" penetration:
//   W_total = W * p = 31.95 * 2.5 = 79.88 lb

#[test]
fn validation_nail_withdrawal_capacity() {
    let g: f64 = 0.50;          // specific gravity
    let d_nail: f64 = 0.131;    // in, 16d common nail shank diameter
    let p: f64 = 2.5;           // in, penetration depth

    // Withdrawal per inch of penetration
    let w_per_inch: f64 = 1380.0 * g.powf(2.5) * d_nail;
    let g_pow: f64 = 0.50_f64.powf(2.5);
    assert_close(g_pow, 0.17678, 0.01, "G^(5/2)");

    let expected_w: f64 = 1380.0 * 0.17678 * 0.131;
    assert_close(w_per_inch, expected_w, 0.01, "W per inch");

    // Total withdrawal capacity
    let w_total: f64 = w_per_inch * p;
    assert_close(w_total, expected_w * 2.5, 0.001, "W_total");

    // Verify w_total is in reasonable range (20-150 lb for a single nail)
    assert!(
        w_total > 20.0 && w_total < 150.0,
        "W_total = {:.1} lb should be in reasonable range",
        w_total
    );

    // For higher SG wood (e.g., G=0.67 Southern Pine), capacity increases
    let g_sp: f64 = 0.67;
    let w_sp: f64 = 1380.0 * g_sp.powf(2.5) * d_nail;
    assert!(
        w_sp > w_per_inch,
        "Higher SG ({:.2}) gives higher withdrawal ({:.1} > {:.1})",
        g_sp, w_sp, w_per_inch
    );
}

// ================================================================
// 6. Lag Screw Penetration and Adjusted Capacity (NDS 12.3.4)
// ================================================================
//
// Lag screw in withdrawal (NDS 12.2.3):
//   W = 1800 * G^(3/2) * D^(3/4) (lb/in of thread penetration)
//
// For 1/2" lag screw, G = 0.50:
//   W = 1800 * 0.50^1.5 * 0.50^0.75
//     = 1800 * 0.35355 * 0.59460
//     = 1800 * 0.21022
//     = 378.4 lb/in
//
// Minimum penetration: 4D = 2.0" for full capacity
// Reduced penetration factor: if p < 8D, use p/(8D) reduction
//
// For thread penetration p = 3.0":
//   p/(8D) = 3.0/4.0 = 0.75, but NDS requires minimum 4D = 2.0"
//   W_total = W * p * Cd (penetration reduction)

#[test]
fn validation_lag_screw_penetration() {
    let g: f64 = 0.50;
    let d_lag: f64 = 0.50;     // in, lag screw diameter
    let p_thread: f64 = 3.0;   // in, thread penetration

    // Withdrawal per inch (NDS 12.2.3)
    let w_per_inch: f64 = 1800.0 * g.powf(1.5) * d_lag.powf(0.75);
    let expected_w: f64 = 1800.0 * 0.50_f64.powf(1.5) * 0.50_f64.powf(0.75);
    assert_close(w_per_inch, expected_w, 0.001, "Lag screw W/in");

    // Minimum penetration check: 4D
    let min_pen: f64 = 4.0 * d_lag;
    assert_close(min_pen, 2.0, 0.001, "Min penetration 4D");
    assert!(
        p_thread >= min_pen,
        "Thread penetration {:.1} >= min {:.1}",
        p_thread, min_pen
    );

    // Penetration depth factor (if p < 8D, reduce proportionally)
    let full_pen: f64 = 8.0 * d_lag;   // 4.0"
    let cd_pen: f64 = if p_thread >= full_pen {
        1.0
    } else {
        p_thread / full_pen
    };
    assert_close(cd_pen, 3.0 / 4.0, 0.001, "Penetration factor");

    // Adjusted withdrawal capacity
    let w_adjusted: f64 = w_per_inch * p_thread * cd_pen;
    let expected_adj: f64 = expected_w * 3.0 * 0.75;
    assert_close(w_adjusted, expected_adj, 0.01, "Adjusted W capacity");

    // At full penetration (p = 8D = 4.0"), no reduction
    let p_full: f64 = full_pen;
    let cd_full: f64 = 1.0;
    let w_full: f64 = w_per_inch * p_full * cd_full;
    assert!(
        w_full > w_adjusted,
        "Full penetration ({:.1}) > partial ({:.1})",
        w_full, w_adjusted
    );
}

// ================================================================
// 7. Split Ring Connector Capacity (NDS Ch. 13)
// ================================================================
//
// Split ring connector (4" ring, NDS Table 13.2.1A):
//   Base capacity P = 4540 lb (parallel to grain, Group B species)
//   Geometry factor Cδ depends on edge distance, end distance, spacing
//
// Edge distance requirement: 2.75" for full load (unloaded edge)
// End distance: 5.5" for full load (tension)
// Spacing: 6.75" for full load
//
// If actual edge = 2.0" (< 2.75"):
//   Cδ_edge = actual/required = 2.0/2.75 = 0.7273
// If actual end = 4.0" (< 5.5"):
//   Cδ_end = actual/required = 4.0/5.5 = 0.7273
//
// Controlling Cδ = min(Cδ_edge, Cδ_end, Cδ_spacing)
// Adjusted capacity = P * Cδ

#[test]
fn validation_split_ring_connector() {
    let p_base: f64 = 4540.0;      // lb, base design value parallel to grain

    // Required geometry distances for 4" split ring
    let edge_req: f64 = 2.75;      // in, required edge distance (unloaded)
    let end_req: f64 = 5.5;        // in, required end distance (tension)
    let spacing_req: f64 = 6.75;   // in, required spacing

    // Actual distances
    let edge_actual: f64 = 2.0;
    let end_actual: f64 = 4.0;
    let spacing_actual: f64 = 6.75; // meets full requirement

    // Geometry factors (linear interpolation per NDS 13.3)
    let cd_edge: f64 = (edge_actual / edge_req).min(1.0);
    assert_close(cd_edge, 2.0 / 2.75, 0.001, "Cδ edge");

    let cd_end: f64 = (end_actual / end_req).min(1.0);
    assert_close(cd_end, 4.0 / 5.5, 0.001, "Cδ end");

    let cd_spacing: f64 = (spacing_actual / spacing_req).min(1.0);
    assert_close(cd_spacing, 1.0, 0.001, "Cδ spacing");

    // Controlling geometry factor
    let cd_controlling: f64 = cd_edge.min(cd_end).min(cd_spacing);
    assert_close(cd_controlling, cd_edge, 0.001, "Controlling Cδ");

    // Adjusted capacity
    let p_adj: f64 = p_base * cd_controlling;
    let expected_adj: f64 = 4540.0 * 2.0 / 2.75;
    assert_close(p_adj, expected_adj, 0.001, "Adjusted split ring capacity");

    // Adjusted must be less than base
    assert!(p_adj < p_base, "Adjusted < base capacity");
}

// ================================================================
// 8. Wood Screw Combined Loading: Hankinson (NDS 12.4.1)
// ================================================================
//
// For wood screws at an angle to grain, combined withdrawal (W')
// and lateral (Z') loading uses the Hankinson formula:
//
//   W_alpha' = W' * Z' / (W' * cos²α + Z' * sin²α)
//
// where α is the angle between screw axis and wood grain.
//
// Example: #10 wood screw (D = 0.190")
//   Withdrawal: W' = 108 lb/in * p = 108 * 1.5 = 162 lb
//   Lateral: Z' = 164 lb
//   Angle α = 60° (screw inclined to grain)
//
//   cos²(60°) = 0.25, sin²(60°) = 0.75
//   W_60 = 162 * 164 / (162 * 0.25 + 164 * 0.75)
//        = 26568 / (40.5 + 123.0) = 26568 / 163.5
//        = 162.5 lb

#[test]
fn validation_wood_screw_combined_loading() {
    let w_prime: f64 = 162.0;   // lb, adjusted withdrawal capacity
    let z_prime: f64 = 164.0;   // lb, adjusted lateral capacity

    // Hankinson for combined withdrawal + lateral
    let hankinson_combined = |alpha_deg: f64| -> f64 {
        let alpha: f64 = alpha_deg * PI / 180.0;
        let cos2: f64 = alpha.cos().powi(2);
        let sin2: f64 = alpha.sin().powi(2);
        w_prime * z_prime / (w_prime * cos2 + z_prime * sin2)
    };

    // At α = 0°: cos²=1,sin²=0 → W'Z'/W' = Z' (lateral governs)
    let w_0: f64 = hankinson_combined(0.0);
    assert_close(w_0, z_prime, 0.001, "α=0° gives Z'");

    // At α = 90°: cos²=0,sin²=1 → W'Z'/Z' = W' (withdrawal governs)
    let w_90: f64 = hankinson_combined(90.0);
    assert_close(w_90, w_prime, 0.001, "α=90° gives W'");

    // At α = 60°
    let w_60: f64 = hankinson_combined(60.0);
    let cos2_60: f64 = 0.25;
    let sin2_60: f64 = 0.75;
    let expected_60: f64 = w_prime * z_prime / (w_prime * cos2_60 + z_prime * sin2_60);
    assert_close(w_60, expected_60, 0.001, "Hankinson at 60°");

    // Hand-computed expected
    let denom_60: f64 = 162.0 * 0.25 + 164.0 * 0.75;
    let hand_60: f64 = 162.0 * 164.0 / denom_60;
    assert_close(w_60, hand_60, 0.001, "Hand-computed 60°");

    // At α = 45°: intermediate
    let w_45: f64 = hankinson_combined(45.0);
    let expected_45: f64 = w_prime * z_prime / (w_prime * 0.5 + z_prime * 0.5);
    assert_close(w_45, expected_45, 0.001, "Hankinson at 45°");

    // Result at 45° should be harmonic mean of W' and Z'
    let harmonic_mean: f64 = 2.0 * w_prime * z_prime / (w_prime + z_prime);
    assert_close(w_45, harmonic_mean, 0.001, "45° = harmonic mean");
}
