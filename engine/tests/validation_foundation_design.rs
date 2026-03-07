/// Validation: Foundation Design
///
/// References:
///   - ACI 318-19 Chapter 13: Foundations
///   - EN 1997-1:2004 (EC7): Geotechnical design
///   - Terzaghi (1943): Bearing capacity factors
///   - Meyerhof (1963): General bearing capacity equation
///   - Bowles: "Foundation Analysis and Design" 5th ed.
///   - Das: "Principles of Foundation Engineering" 9th ed.
///
/// Tests verify bearing capacity, footing sizing, and stability checks.

mod helpers;

use helpers::assert_close;
use std::f64::consts::PI;

// ================================================================
// 1. Terzaghi Bearing Capacity — Strip Footing on Clay (φ=0)
// ================================================================
//
// Terzaghi's equation for a strip footing:
//   qu = c·Nc + q·Nq + 0.5·γ·B·Nγ
//
// For undrained clay (φ = 0):
//   Nc = 5.14, Nq = 1.0, Nγ = 0.0
//
// Given:
//   c  = 50 kPa (undrained cohesion)
//   γ  = 18 kN/m³ (unit weight)
//   Df = 1.0 m (foundation depth)
//   q  = γ·Df = 18 kPa (overburden pressure)
//
// qu = 50·5.14 + 18·1.0 + 0.5·18·B·0 = 257.0 + 18.0 = 275.0 kPa

#[test]
fn validation_terzaghi_bearing_capacity_strip() {
    let c = 50.0;       // kPa, undrained cohesion
    let gamma = 18.0;   // kN/m³
    let df = 1.0;       // m, foundation depth
    let q = gamma * df;  // 18 kPa overburden

    // Bearing capacity factors for φ = 0 (Terzaghi)
    let nc = 5.14;
    let nq = 1.0;
    let n_gamma = 0.0;

    // Footing width (arbitrary for strip, appears only in Nγ term which is zero)
    let b = 1.0; // m

    // Ultimate bearing capacity
    let qu = c * nc + q * nq + 0.5 * gamma * b * n_gamma;

    let expected_qu = 275.0; // kPa

    assert_close(qu, expected_qu, 0.01,
        "Terzaghi strip footing on clay: qu = c·Nc + q·Nq");
}

// ================================================================
// 2. Meyerhof Bearing Capacity — Square Footing on Sand (φ=30°)
// ================================================================
//
// Meyerhof bearing capacity factors:
//   Nq = e^(π·tan φ) · tan²(45° + φ/2)
//   Nc = (Nq - 1)·cot φ
//   Nγ = 2·(Nq + 1)·tan φ
//
// For φ = 30°:
//   Nq = e^(π·tan30°) · tan²(60°) = e^(1.8138) · 3.0 = 6.1335 · 3.0 = 18.401
//   Nc = (18.401 - 1) · cot30° = 17.401 · 1.7321 = 30.140
//   Nγ = 2·(18.401 + 1)·tan30° = 2·19.401·0.5774 = 22.402
//
// Shape factors (Meyerhof, square footing B=L):
//   sc = 1 + 0.2·Kp·(B/L) where Kp = tan²(45+φ/2) = 3.0
//     sc = 1 + 0.2·3.0·1 = 1.60
//   sq = 1 + 0.1·Kp·(B/L) = 1 + 0.1·3.0·1 = 1.30   (for φ > 10°)
//   sγ = sq = 1.30                                     (for φ > 10°)
//
// Depth factors (Meyerhof):
//   dc = 1 + 0.2·√Kp·(Df/B) = 1 + 0.2·1.7321·(1/2) = 1.1732
//   dq = 1 + 0.1·√Kp·(Df/B) = 1 + 0.1·1.7321·0.5  = 1.0866  (for φ > 10°)
//   dγ = dq = 1.0866                                           (for φ > 10°)
//
// Given: c = 0 (sand), γ = 17 kN/m³, Df = 1 m, B = L = 2 m
//   q = γ·Df = 17 kPa
//
// qu = c·Nc·sc·dc + q·Nq·sq·dq + 0.5·γ·B·Nγ·sγ·dγ
//    = 0 + 17·18.401·1.30·1.0866 + 0.5·17·2·22.402·1.30·1.0866
//    = 17·18.401·1.4126 + 17·22.402·1.4126
//    = 441.76 + 537.68
//    = 979.4 kPa

#[test]
fn validation_meyerhof_bearing_capacity_square() {
    let phi_deg = 30.0;
    let phi = phi_deg * PI / 180.0;
    let c = 0.0;        // kPa (sand)
    let gamma = 17.0;   // kN/m³
    let df = 1.0;       // m
    let b = 2.0;        // m (square: B = L)
    let l = 2.0;        // m
    let q = gamma * df;  // 17 kPa

    // Meyerhof bearing capacity factors
    let nq = (PI * phi.tan()).exp() * (PI / 4.0 + phi / 2.0).tan().powi(2);
    let nc = (nq - 1.0) / phi.tan();
    let n_gamma = 2.0 * (nq + 1.0) * phi.tan();

    // Verify factors
    assert_close(nq, 18.401, 0.01, "Meyerhof Nq for φ=30°");
    assert_close(nc, 30.140, 0.01, "Meyerhof Nc for φ=30°");
    assert_close(n_gamma, 22.402, 0.01, "Meyerhof Nγ for φ=30°");

    // Kp = tan²(45 + φ/2)
    let kp = (PI / 4.0 + phi / 2.0).tan().powi(2);

    // Shape factors (Meyerhof, for φ > 10°)
    let sc = 1.0 + 0.2 * kp * (b / l);
    let sq = 1.0 + 0.1 * kp * (b / l);
    let s_gamma = sq;

    // Depth factors (Meyerhof, for φ > 10°)
    let dc = 1.0 + 0.2 * kp.sqrt() * (df / b);
    let dq = 1.0 + 0.1 * kp.sqrt() * (df / b);
    let d_gamma = dq;

    // Ultimate bearing capacity
    let qu = c * nc * sc * dc + q * nq * sq * dq + 0.5 * gamma * b * n_gamma * s_gamma * d_gamma;

    // Step-by-step expected:
    // Term 2: 17 * 18.401 * 1.30 * 1.0866 = 441.76
    let term2 = q * nq * sq * dq;
    assert_close(term2, 441.76, 0.02, "Meyerhof overburden term");

    // Term 3: 0.5 * 17 * 2 * 22.402 * 1.30 * 1.0866 = 537.68
    let term3 = 0.5 * gamma * b * n_gamma * s_gamma * d_gamma;
    assert_close(term3, 537.68, 0.02, "Meyerhof self-weight term");

    let expected_qu = 979.4;
    assert_close(qu, expected_qu, 0.02,
        "Meyerhof square footing on sand: qu with shape & depth factors");
}

// ================================================================
// 3. Footing Bearing Pressure Under Eccentric Load
// ================================================================
//
// Effective area method (Meyerhof):
//   B' = B - 2·ex,  L' = L - 2·ey
//   q = P / (B' · L')
//
// Given:
//   B = 2.0 m, L = 3.0 m
//   P = 500 kN (vertical)
//   ex = 0.2 m, ey = 0.15 m
//
// B' = 2.0 - 2·0.2  = 1.6 m
// L' = 3.0 - 2·0.15 = 2.7 m
// A_eff = 1.6 · 2.7 = 4.32 m²
// q = 500 / 4.32 = 115.74 kPa
//
// Also check with Navier formula for rectangular footing:
//   q_max = P/(B·L) · (1 + 6·ex/B + 6·ey/L)  (when ex < B/6 and ey < L/6)
// ex/B = 0.2/2.0 = 0.1,  ey/L = 0.15/3.0 = 0.05
// Both < 1/6 → full contact (no lift-off)
// q_max = 500/(2·3) · (1 + 6·0.1 + 6·0.05) = 83.333 · 1.90 = 158.33 kPa
// q_min = 500/(2·3) · (1 - 6·0.1 - 6·0.05) = 83.333 · 0.10 =   8.33 kPa

#[test]
fn validation_footing_bearing_pressure_eccentric() {
    let b = 2.0;   // m
    let l = 3.0;   // m
    let p = 500.0;  // kN
    let ex = 0.2;  // m, eccentricity in B-direction
    let ey = 0.15; // m, eccentricity in L-direction

    // --- Effective area method (Meyerhof) ---
    let b_eff = b - 2.0 * ex;
    let l_eff = l - 2.0 * ey;
    let a_eff = b_eff * l_eff;
    let q_eff = p / a_eff;

    assert_close(b_eff, 1.6, 0.01, "Effective width B'");
    assert_close(l_eff, 2.7, 0.01, "Effective length L'");
    assert_close(a_eff, 4.32, 0.01, "Effective area");
    assert_close(q_eff, 115.74, 0.02, "Effective bearing pressure (Meyerhof)");

    // --- Navier formula (trapezoidal distribution) ---
    // Check kern condition: ex < B/6, ey < L/6
    assert!(ex < b / 6.0, "ex must be within kern for full contact");
    assert!(ey < l / 6.0, "ey must be within kern for full contact");

    let q_avg = p / (b * l);
    let q_max = q_avg * (1.0 + 6.0 * ex / b + 6.0 * ey / l);
    let q_min = q_avg * (1.0 - 6.0 * ex / b - 6.0 * ey / l);

    assert_close(q_max, 158.33, 0.01, "Navier q_max under eccentric load");
    assert_close(q_min, 8.33, 0.02, "Navier q_min under eccentric load");

    // Verify average: (q_max + q_min) / 2 ≈ P / (B·L)
    let q_check = (q_max + q_min) / 2.0;
    assert_close(q_check, q_avg, 0.01, "Average pressure consistency");
}

// ================================================================
// 4. Overturning Stability Check
// ================================================================
//
// Factor of safety against overturning about the toe:
//   FS_ot = M_resist / M_overturning ≥ 2.0
//
// Given:
//   P = 400 kN (vertical load at centroid)
//   H = 50 kN (horizontal at height 3m above base)
//   Footing width B = 2.0 m
//
// Overturning moment about toe:
//   M_ot = H · h = 50 · 3.0 = 150 kN·m
//
// Resisting moment (vertical load × distance from toe to centroid):
//   M_r = P · (B/2) = 400 · 1.0 = 400 kN·m
//
// FS_ot = 400 / 150 = 2.667
// FS_ot > 2.0 → OK

#[test]
fn validation_overturning_stability_check() {
    let p = 400.0;  // kN, vertical load
    let h = 50.0;   // kN, horizontal force
    let height = 3.0; // m, height of horizontal force above base
    let b = 2.0;    // m, footing width

    // Overturning moment about toe
    let m_overturning = h * height;
    assert_close(m_overturning, 150.0, 0.01, "Overturning moment");

    // Resisting moment (vertical load about toe)
    let m_resisting = p * (b / 2.0);
    assert_close(m_resisting, 400.0, 0.01, "Resisting moment");

    // Factor of safety against overturning
    let fs_ot = m_resisting / m_overturning;
    assert_close(fs_ot, 2.667, 0.01, "FS against overturning");

    // Check minimum requirement
    assert!(fs_ot >= 2.0,
        "FS_ot = {:.3} must be ≥ 2.0 for overturning stability", fs_ot);
}

// ================================================================
// 5. Sliding Stability Check
// ================================================================
//
// Factor of safety against sliding:
//   FS_slide = (P·tan(δ) + c_a·A) / H ≥ 1.5
//
// For granular soil (no adhesion, c_a = 0):
//   FS_slide = P·tan(δ) / H
//
// Given:
//   P = 400 kN (vertical load)
//   H = 50 kN (horizontal force)
//   φ = 30° (soil friction angle)
//   δ = (2/3)·φ = 20° (base friction angle)
//
// FS_slide = 400 · tan(20°) / 50
//          = 400 · 0.36397 / 50
//          = 145.59 / 50
//          = 2.912

#[test]
fn validation_sliding_stability_check() {
    let p = 400.0;  // kN, vertical load
    let h = 50.0;   // kN, horizontal force
    let phi_deg = 30.0;
    let delta_deg = (2.0 / 3.0) * phi_deg; // 20°
    let delta = delta_deg * PI / 180.0;

    // Friction resistance (no adhesion)
    let resistance = p * delta.tan();
    let fs_slide = resistance / h;

    assert_close(delta_deg, 20.0, 0.01, "Base friction angle δ = 2/3·φ");
    assert_close(fs_slide, 2.912, 0.02, "FS against sliding");

    // Check minimum requirement
    assert!(fs_slide >= 1.5,
        "FS_slide = {:.3} must be ≥ 1.5 for sliding stability", fs_slide);

    // Also verify with adhesion for cohesive soil
    let c_a = 25.0;     // kPa, adhesion (typically 0.5-0.7 of c)
    let a_base = 2.0 * 3.0; // m², footing base area (2m × 3m)
    let fs_with_adhesion = (p * delta.tan() + c_a * a_base) / h;

    // (400·0.36397 + 25·6) / 50 = (145.59 + 150) / 50 = 5.912
    assert_close(fs_with_adhesion, 5.912, 0.02,
        "FS against sliding with adhesion");
}

// ================================================================
// 6. Elastic (Immediate) Settlement of Footing
// ================================================================
//
// Elastic settlement formula (Timoshenko/Bowles):
//   δ = q · B · (1 - ν²) · Ip / Es
//
// Where:
//   q  = applied bearing pressure
//   B  = footing width (or diameter)
//   ν  = Poisson's ratio of soil
//   Es = elastic modulus of soil
//   Ip = influence factor (depends on shape and rigidity)
//       For rigid circular footing on half-space: Ip = π/4 ≈ 0.79
//
// Given:
//   q  = 150 kPa
//   B  = 2.0 m
//   ν  = 0.3
//   Es = 20,000 kPa
//   Ip = 0.79 (rigid circular)
//
// δ = 150 · 2.0 · (1 - 0.09) · 0.79 / 20000
//   = 150 · 2.0 · 0.91 · 0.79 / 20000
//   = 215.46 / 20000
//   = 0.01077 m = 10.77 mm

#[test]
fn validation_settlement_elastic_immediate() {
    let q = 150.0;     // kPa, bearing pressure
    let b = 2.0;       // m, footing width/diameter
    let nu = 0.3;      // Poisson's ratio
    let es = 20_000.0; // kPa, soil elastic modulus
    let ip = 0.79;     // Influence factor (rigid circular)

    // Elastic settlement
    let delta_m = q * b * (1.0 - nu * nu) * ip / es;
    let delta_mm = delta_m * 1000.0; // convert to mm

    assert_close(delta_mm, 10.77, 0.02, "Immediate elastic settlement (mm)");

    // Verify intermediate calculation: (1 - ν²) = 0.91
    assert_close(1.0 - nu * nu, 0.91, 0.001, "1 - ν²");

    // Cross-check: for flexible circular footing, Ip = 1.0
    // δ_flex = 150 · 2.0 · 0.91 · 1.0 / 20000 = 0.01365 m = 13.65 mm
    let ip_flex = 1.0;
    let delta_flex_mm = q * b * (1.0 - nu * nu) * ip_flex / es * 1000.0;
    assert_close(delta_flex_mm, 13.65, 0.02, "Flexible footing settlement (mm)");

    // Rigid settlement should be less than flexible
    assert!(delta_mm < delta_flex_mm,
        "Rigid footing settlement ({:.2} mm) should be < flexible ({:.2} mm)",
        delta_mm, delta_flex_mm);
}

// ================================================================
// 7. ACI 318-19 One-Way Shear Check — Spread Footing (§22.5)
// ================================================================
//
// Nominal one-way shear strength (simplified):
//   Vc = 0.17 · λ · √f'c · b · d
//
// Where:
//   λ    = 1.0 (normal weight concrete)
//   f'c  = 28 MPa (concrete compressive strength)
//   b    = 2000 mm (footing width)
//   d    = 500 mm (effective depth)
//   √f'c = √28 = 5.2915 MPa^0.5
//
// Vc = 0.17 · 1.0 · 5.2915 · 2000 · 500
//    = 0.17 · 5.2915 · 1,000,000
//    = 899,555 N
//    = 899.6 kN
//
// Design shear strength: φ·Vc = 0.75 · 899.6 = 674.7 kN

#[test]
fn validation_aci318_one_way_shear() {
    let lambda = 1.0;       // normal weight concrete
    let fc_prime: f64 = 28.0;    // MPa
    let b = 2000.0;         // mm
    let d = 500.0;          // mm

    // Nominal shear capacity (ACI 318-19 §22.5.5.1)
    // Vc = 0.17·λ·√f'c · b · d  (in N when f'c in MPa, b and d in mm)
    let vc_n = 0.17 * lambda * fc_prime.sqrt() * b * d;
    let vc_kn = vc_n / 1000.0;

    assert_close(vc_kn, 899.6, 0.01, "ACI 318 one-way shear Vc (kN)");

    // Design shear strength with φ = 0.75 (ACI 318-19 §21.2.1)
    let phi_shear = 0.75;
    let phi_vc = phi_shear * vc_kn;

    assert_close(phi_vc, 674.7, 0.01, "Design one-way shear φ·Vc (kN)");

    // Two-way (punching) shear check for comparison
    // For square column c × c on square footing:
    //   b0 = 4·(c + d)  (critical perimeter at d/2 from column face)
    //   Vc_punch = 0.33·λ·√f'c · b0 · d
    let c_col = 400.0; // mm, column dimension
    let b0 = 4.0 * (c_col + d);
    let vc_punch_n = 0.33 * lambda * fc_prime.sqrt() * b0 * d;
    let vc_punch_kn = vc_punch_n / 1000.0;

    // b0 = 4·(400+500) = 3600 mm
    // Vc_punch = 0.33·5.2915·3600·500 = 3,142,871 N = 3142.9 kN
    assert_close(b0, 3600.0, 0.01, "Punching perimeter b0 (mm)");
    assert_close(vc_punch_kn, 3142.9, 0.01, "Punching shear Vc (kN)");
}

// ================================================================
// 8. EC7 Design Approach 1 (DA1) — Factored Bearing Resistance
// ================================================================
//
// EN 1997-1:2004 (EC7) Design Approach 1:
//   Combination 1 (A1 + M1 + R1): Factor actions, use characteristic soil
//   Combination 2 (A2 + M2 + R1): Partial factor on actions reduced,
//                                   factor soil strength parameters
//
// Partial factors (DA1 Combination 2):
//   Actions:  γ_G = 1.0, γ_Q = 1.3
//   Materials: γ_c' = 1.25, γ_φ' = 1.25, γ_cu = 1.4
//   Resistance: γ_R = 1.0
//
// Partial factors (DA1 Combination 1):
//   Actions:  γ_G = 1.35, γ_Q = 1.5
//   Materials: γ_c' = 1.0, γ_φ' = 1.0, γ_cu = 1.0
//   Resistance: γ_R = 1.0
//
// Given (characteristic values):
//   G_k = 300 kN (permanent), Q_k = 100 kN (variable)
//   c'_k = 10 kPa, φ'_k = 25°
//   γ_soil = 18 kN/m³, Df = 1.0 m, B = 2.0 m (strip)
//
// Combination 1 (A1 + M1 + R1):
//   V_d = 1.35·300 + 1.5·100 = 405 + 150 = 555 kN
//   c'_d = 10/1.0 = 10 kPa
//   φ'_d = atan(tan(25°)/1.0) = 25°
//   Nq = e^(π·tan25°)·tan²(45+12.5) = 10.662
//   Nc = (10.662-1)·cot25° = 20.721
//   Nγ = 2·(10.662+1)·tan25° = 10.877
//   qu = 10·20.721 + 18·10.662 + 0.5·18·2·10.877
//      = 207.21 + 191.92 + 195.79
//      = 594.9 kPa
//   R_d/m = 594.9 · 2.0 = 1189.8 kN/m  (per metre length for strip)
//
// Combination 2 (A2 + M2 + R1):
//   V_d = 1.0·300 + 1.3·100 = 300 + 130 = 430 kN
//   c'_d = 10/1.25 = 8.0 kPa
//   φ'_d = atan(tan(25°)/1.25) = atan(0.37305) = 20.458°
//   Nq(20.458°) = e^(π·tan20.458°)·tan²(45+10.229) = 6.698
//   Nc(20.458°) = (6.698-1)·cot(20.458°) = 15.290
//   Nγ(20.458°) = 2·(6.698+1)·tan(20.458°) = 5.738
//   qu = 8·15.290 + 18·6.698 + 0.5·18·2·5.738
//      = 122.32 + 120.56 + 103.29
//      = 346.2 kPa
//   R_d/m = 346.2 · 2.0 = 692.3 kN/m

#[test]
fn validation_ec7_design_approach_1() {
    // Characteristic loads
    let g_k = 300.0; // kN, permanent
    let q_k = 100.0; // kN, variable

    // Characteristic soil parameters
    let c_k = 10.0;       // kPa
    let phi_k_deg = 25.0;  // degrees
    let gamma_soil = 18.0; // kN/m³
    let df = 1.0;          // m
    let b = 2.0;           // m (strip footing)
    let q = gamma_soil * df; // 18 kPa overburden

    // Helper: compute Meyerhof bearing capacity factors for given φ
    let bearing_factors = |phi_deg: f64| -> (f64, f64, f64) {
        let phi = phi_deg * PI / 180.0;
        let nq = (PI * phi.tan()).exp() * (PI / 4.0 + phi / 2.0).tan().powi(2);
        let nc = (nq - 1.0) / phi.tan();
        let n_gamma = 2.0 * (nq + 1.0) * phi.tan();
        (nc, nq, n_gamma)
    };

    // ---- Combination 1 (A1 + M1 + R1): Factor actions ----
    let gamma_g_1 = 1.35;
    let gamma_q_1 = 1.5;
    let gamma_c_1 = 1.0;
    let gamma_phi_1 = 1.0;

    let v_d1 = gamma_g_1 * g_k + gamma_q_1 * q_k;
    assert_close(v_d1, 555.0, 0.01, "DA1-C1 design action");

    let c_d1 = c_k / gamma_c_1;
    let phi_d1_deg = ((phi_k_deg * PI / 180.0).tan() / gamma_phi_1).atan() * 180.0 / PI;
    assert_close(phi_d1_deg, 25.0, 0.01, "DA1-C1 design φ'");

    let (nc1, nq1, ng1) = bearing_factors(phi_d1_deg);
    assert_close(nq1, 10.662, 0.02, "DA1-C1 Nq");
    assert_close(nc1, 20.721, 0.02, "DA1-C1 Nc");
    assert_close(ng1, 10.877, 0.02, "DA1-C1 Nγ");

    let qu1 = c_d1 * nc1 + q * nq1 + 0.5 * gamma_soil * b * ng1;
    assert_close(qu1, 594.9, 0.02, "DA1-C1 ultimate bearing capacity (kPa)");

    let rd1_per_m = qu1 * b; // kN/m for strip footing
    assert_close(rd1_per_m, 1189.8, 0.02, "DA1-C1 design resistance per m");

    // ---- Combination 2 (A2 + M2 + R1): Factor materials ----
    let gamma_g_2 = 1.0;
    let gamma_q_2 = 1.3;
    let gamma_c_2 = 1.25;
    let gamma_phi_2 = 1.25;

    let v_d2 = gamma_g_2 * g_k + gamma_q_2 * q_k;
    assert_close(v_d2, 430.0, 0.01, "DA1-C2 design action");

    let c_d2 = c_k / gamma_c_2;
    assert_close(c_d2, 8.0, 0.01, "DA1-C2 design c'");

    let phi_d2_deg = ((phi_k_deg * PI / 180.0).tan() / gamma_phi_2).atan() * 180.0 / PI;
    assert_close(phi_d2_deg, 20.458, 0.02, "DA1-C2 design φ'");

    let (nc2, nq2, ng2) = bearing_factors(phi_d2_deg);
    assert_close(nq2, 6.698, 0.02, "DA1-C2 Nq");
    assert_close(nc2, 15.290, 0.02, "DA1-C2 Nc");
    assert_close(ng2, 5.738, 0.02, "DA1-C2 Nγ");

    let qu2 = c_d2 * nc2 + q * nq2 + 0.5 * gamma_soil * b * ng2;
    assert_close(qu2, 346.2, 0.02, "DA1-C2 ultimate bearing capacity (kPa)");

    let rd2_per_m = qu2 * b;
    assert_close(rd2_per_m, 692.3, 0.02, "DA1-C2 design resistance per m");

    // Combination 2 governs (lower resistance, relatively higher demand ratio)
    // V_d1 / R_d1 = 555 / 1189.8 = 0.466 per m width
    // V_d2 / R_d2 = 430 / 692.3  = 0.621 per m width → governs
    let ratio1 = v_d1 / rd1_per_m;
    let ratio2 = v_d2 / rd2_per_m;
    assert!(ratio2 > ratio1,
        "DA1-C2 should govern: ratio2={:.3} > ratio1={:.3}", ratio2, ratio1);
    assert!(ratio2 < 1.0,
        "Design is adequate: demand/capacity = {:.3} < 1.0", ratio2);
}
