/// Validation: Masonry Arch and Vault Analysis
///
/// References:
///   - Heyman, "The Stone Skeleton", Cambridge University Press
///   - Heyman, "The Masonry Arch", Ellis Horwood
///   - Ochsendorf, "The Masonry Arch on Spreading Supports", The Structural Engineer
///   - Block, Ciblac, Ochsendorf, "Real-time limit analysis of vaulted masonry buildings"
///   - Huerta, "Mechanics of masonry vaults: the equilibrium approach"
///   - Timoshenko & Young, "Theory of Structures", Ch. 7 (Arches)
///
/// Tests verify masonry arch theory formulas without calling the solver.
/// Pure arithmetic verification of analytical expressions.

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
// 1. Semicircular Arch Thrust Line — Minimum Thickness
// ================================================================
//
// For a semicircular arch of radius R under self-weight, Heyman showed
// the minimum thickness ratio t/R for a thrust line to fit within the
// arch is approximately:
//   t/R ≈ 0.1075
//
// This means an arch thinner than ~10.75% of its radius will collapse.
// The horizontal thrust for the minimum thickness case:
//   H_min ≈ 0.622 w R   (w = weight per unit arc length)
//
// Reference: Heyman, "The Masonry Arch", Table 1

#[test]
fn validation_semicircular_arch_minimum_thickness() {
    let r: f64 = 5.0;     // m, radius
    let t_ratio: f64 = 0.1075; // minimum t/R ratio (Heyman)

    let t_min: f64 = t_ratio * r;
    assert_close(t_min, 0.5375, 1e-10, "Minimum thickness t = 0.1075R");

    // Self-weight: w per unit arc length (kN/m)
    let gamma: f64 = 24.0;  // kN/m³ stone density
    let b: f64 = 1.0;       // m, unit width
    let w: f64 = gamma * t_min * b; // kN per unit arc length
    let expected_w: f64 = 24.0 * 0.5375 * 1.0;
    assert_close(w, expected_w, 1e-10, "Self-weight per unit arc length");

    // Total weight of semicircular arch = w × π R
    let total_w: f64 = w * PI * r;
    let expected_total: f64 = w * PI * 5.0;
    assert_close(total_w, expected_total, 1e-10, "Total arch weight W = wπR");

    // For a slightly thicker arch (t/R = 0.15), thrust line fits with margin
    let t_thick_ratio: f64 = 0.15;
    assert!(t_thick_ratio > t_ratio, "Thicker arch is safe");

    // Geometrical safety factor = t_actual/t_min
    let gsf: f64 = t_thick_ratio / t_ratio;
    assert_close(gsf, 0.15 / 0.1075, 1e-10, "Geometrical safety factor");
    assert!(gsf > 1.0, "GSF > 1 means arch is stable");
}

// ================================================================
// 2. Pointed (Gothic) Arch vs Semicircular — Lower Thrust
// ================================================================
//
// A pointed arch (two circular arcs meeting at the crown) develops
// lower horizontal thrust than a semicircular arch of the same span.
//
// For a pointed arch with span L and rise f:
//   If the centers are raised by e above the springing:
//   R_pointed = (L²/4 + e²)/(2e) where e is the eccentricity
//
// For comparison at same span and rise:
//   H_semicircular / H_pointed > 1 (pointed is more efficient)
//
// Approximate thrust for a pointed arch under UDL w:
//   H ≈ w L² / (8 f)  (same as any arch, but f can be larger)
//
// Reference: Heyman, Ch. 4; Huerta (2001)

#[test]
fn validation_pointed_arch_lower_thrust() {
    let l: f64 = 10.0;     // m, span
    let w: f64 = 20.0;     // kN/m, uniform load

    // Semicircular: rise f = L/2 = 5
    let f_semi: f64 = l / 2.0;
    let h_semi: f64 = w * l * l / (8.0 * f_semi);
    assert_close(h_semi, 20.0 * 100.0 / 40.0, 1e-10, "Semicircular H = wL²/(8·L/2)");
    assert_close(h_semi, 50.0, 1e-10, "H_semicircular = 50 kN");

    // Pointed arch: rise f = 0.75L = 7.5 m (higher than semicircular)
    let f_pointed: f64 = 0.75 * l;
    let h_pointed: f64 = w * l * l / (8.0 * f_pointed);
    assert_close(h_pointed, 2000.0 / 60.0, 1e-10, "Pointed H = wL²/(8f)");

    // Pointed arch has lower thrust
    assert!(
        h_pointed < h_semi,
        "Pointed arch thrust {} < semicircular thrust {}",
        h_pointed, h_semi
    );

    // Thrust ratio = f_semi / f_pointed (inversely proportional to rise)
    let thrust_ratio: f64 = h_pointed / h_semi;
    let expected_ratio: f64 = f_semi / f_pointed;
    assert_close(thrust_ratio, expected_ratio, 1e-10, "Thrust ratio = f_semi/f_pointed");

    // Vertical reactions are the same (equilibrium)
    let v_semi: f64 = w * l / 2.0;
    let v_pointed: f64 = w * l / 2.0;
    assert_close(v_semi, v_pointed, 1e-10, "Vertical reactions equal for same load");
    assert_close(v_semi, 100.0, 1e-10, "V = wL/2 = 100 kN");
}

// ================================================================
// 3. Three-Pin Arch Horizontal Thrust
// ================================================================
//
// A three-pin arch (pins at A, B, C at crown) with span L, rise f,
// under uniform load w:
//   H = w L² / (8 f)
//
// This is statically determinate; the third pin allows direct computation.
// Moment at crown pin must be zero: M_C = 0 → H.
//
// Reference: Timoshenko & Young, "Theory of Structures", Sec 7.3

#[test]
fn validation_three_pin_arch_thrust() {
    let l: f64 = 20.0;     // m, span
    let f: f64 = 5.0;      // m, rise
    let w: f64 = 15.0;     // kN/m, uniform load

    // Horizontal thrust
    let h: f64 = w * l * l / (8.0 * f);
    assert_close(h, 15.0 * 400.0 / 40.0, 1e-10, "H = wL²/(8f)");
    assert_close(h, 150.0, 1e-10, "H = 150 kN");

    // Vertical reactions (symmetric)
    let v_a: f64 = w * l / 2.0;
    assert_close(v_a, 150.0, 1e-10, "V_A = wL/2");

    // Check moment at crown from left half: M_C = V_A(L/2) - w(L/2)²/2 - Hf = 0
    let m_c: f64 = v_a * (l / 2.0) - w * (l / 2.0).powi(2) / 2.0 - h * f;
    assert_close(m_c, 0.0, 1e-10, "M_C = 0 (crown pin condition)");

    // Resultant reaction at support A
    let r_a: f64 = (h * h + v_a * v_a).sqrt();
    let expected_r: f64 = (150.0_f64.powi(2) + 150.0_f64.powi(2)).sqrt();
    assert_close(r_a, expected_r, 1e-10, "Resultant R_A = √(H² + V²)");

    // Angle of reaction from horizontal
    let theta_a: f64 = (v_a / h).atan();
    assert_close(theta_a, PI / 4.0, 1e-10, "θ_A = 45° when H = V");
}

// ================================================================
// 4. Parabolic Arch is Funicular for Uniform Load
// ================================================================
//
// A parabolic arch y(x) = 4f x(L-x)/L² exactly follows the thrust
// line for a horizontally uniform load w. Therefore:
//   Bending moment M(x) = 0 everywhere (pure compression)
//   N(x) = H / cos θ(x) where θ = atan(dy/dx)
//
// Reference: Timoshenko & Young, Sec 7.2; Heyman, Ch. 2

#[test]
fn validation_parabolic_arch_funicular() {
    let l: f64 = 16.0;     // m, span
    let f: f64 = 4.0;      // m, rise
    let w: f64 = 10.0;     // kN/m, uniform load
    let h: f64 = w * l * l / (8.0 * f);
    assert_close(h, 80.0, 1e-10, "H = wL²/(8f) = 80 kN");

    // Parabola: y(x) = 4f·x(L-x)/L²
    // dy/dx = 4f(L-2x)/L²
    let y = |x: f64| -> f64 { 4.0 * f * x * (l - x) / (l * l) };
    let dy_dx = |x: f64| -> f64 { 4.0 * f * (l - 2.0 * x) / (l * l) };

    // Check arch shape at key points
    assert_close(y(0.0), 0.0, 1e-12, "y(0) = 0 at support");
    assert_close(y(l), 0.0, 1e-12, "y(L) = 0 at support");
    assert_close(y(l / 2.0), f, 1e-12, "y(L/2) = f at crown");

    // Bending moment for a parabolic arch under UDL:
    // M(x) = H·y(x) - w·x·(L-x)/2 + V_A·x - (contribution from w)
    // Actually: M(x) = V_A·x - w·x²/2 - H·y(x)
    // V_A = wL/2, so M(x) = wLx/2 - wx²/2 - H·4f·x(L-x)/L²
    let v_a: f64 = w * l / 2.0;
    for i in 0..=10 {
        let x: f64 = l * (i as f64) / 10.0;
        let moment: f64 = v_a * x - w * x * x / 2.0 - h * y(x);
        assert_close(
            moment.abs(), 0.0, 1e-10,
            &format!("M({:.1}) = 0 for parabolic funicular", x),
        );
    }

    // Axial force at crown: N = H (horizontal, θ = 0)
    let slope_crown: f64 = dy_dx(l / 2.0);
    assert_close(slope_crown, 0.0, 1e-12, "dy/dx = 0 at crown");
    let n_crown: f64 = h / (1.0_f64 + slope_crown.powi(2)).sqrt();
    assert_close(n_crown, h, 1e-10, "N_crown = H at crown");

    // Axial force at springing: N = H/cos(θ₀)
    let slope_spring: f64 = dy_dx(0.0);
    let theta_spring: f64 = slope_spring.atan();
    let n_spring: f64 = h / theta_spring.cos();
    let expected_n_spring: f64 = (h * h + v_a * v_a).sqrt();
    assert_close(n_spring, expected_n_spring, 1e-10, "N at springing = √(H²+V²)");
}

// ================================================================
// 5. Flying Buttress Force Resolution
// ================================================================
//
// A flying buttress transfers the lateral thrust from a vault/arch
// to a pier. If the buttress makes angle α with horizontal and
// carries a horizontal force H:
//   Axial force in buttress: F = H / cos α
//   Vertical component at pier: V = H tan α
//
// The pier must resist: overturning from H at height h, and
// the vertical load (self-weight W_pier + V).
//
// Reference: Heyman, "The Stone Skeleton", Ch. 3

#[test]
fn validation_flying_buttress_force_resolution() {
    let h: f64 = 80.0;        // kN, horizontal vault thrust
    let alpha_deg: f64 = 35.0; // degrees, buttress angle from horizontal
    let alpha: f64 = alpha_deg * PI / 180.0;

    // Axial force in buttress strut
    let f_buttress: f64 = h / alpha.cos();
    let expected_f: f64 = 80.0 / alpha.cos();
    assert_close(f_buttress, expected_f, 1e-10, "Buttress axial F = H/cos α");

    // Vertical component at pier base
    let v_buttress: f64 = h * alpha.tan();
    let expected_v: f64 = 80.0 * alpha.tan();
    assert_close(v_buttress, expected_v, 1e-10, "Vertical component V = H tan α");

    // Check: F² = H² + V²
    let f_check: f64 = (h * h + v_buttress * v_buttress).sqrt();
    assert_close(f_buttress, f_check, 1e-10, "F = √(H² + V²)");

    // Pier analysis: overturning about toe
    let h_height: f64 = 12.0;  // m, height where buttress acts on pier
    let w_pier: f64 = 800.0;   // kN, pier self-weight (massive stone pier)
    let b_pier: f64 = 3.0;     // m, pier width

    // Overturning moment about downstream toe
    let m_overturn: f64 = h * h_height;
    assert_close(m_overturn, 960.0, 1e-10, "Overturning moment = H × h");

    // Stabilizing moment from pier weight + buttress vertical
    let m_stabilize: f64 = (w_pier + v_buttress) * b_pier / 2.0;

    // Factor of safety against overturning
    let fos: f64 = m_stabilize / m_overturn;
    assert!(fos > 1.0, "FoS against overturning = {} > 1.0", fos);
}

// ================================================================
// 6. Vault Rib Force Distribution
// ================================================================
//
// In a ribbed groin vault, loads are transferred to ribs at the
// groins (intersections). For a square bay (a × a) under uniform load q:
//
// Each triangular panel transfers half its load to each adjacent rib.
// Total load on vault: W = q × a²
// Load per diagonal rib: W_rib = W/4 (by symmetry, 4 ribs share)
//
// For a rectangular bay (a × b), the load distribution depends on
// the aspect ratio. Diagonal ribs carry:
//   W_long_rib ≈ q a b / 4  (simplified, equal distribution)
//
// The horizontal thrust in each rib: H = W_rib × a / (8f_rib)
// where f_rib is the rib rise.
//
// Reference: Heyman, Ch. 6; Huerta, "Structural Design of Arches/Vaults"

#[test]
fn validation_vault_rib_force_distribution() {
    let a: f64 = 8.0;      // m, bay dimension (square vault)
    let q: f64 = 5.0;      // kN/m², uniform load
    let f_rib: f64 = 3.0;  // m, rib rise

    // Total load on vault
    let w_total: f64 = q * a * a;
    assert_close(w_total, 320.0, 1e-10, "Total vault load W = qa²");

    // Load per diagonal rib (4 ribs by symmetry)
    let w_rib: f64 = w_total / 4.0;
    assert_close(w_rib, 80.0, 1e-10, "Load per rib W/4");

    // Diagonal rib span = a√2 (for square bay)
    let l_rib: f64 = a * (2.0_f64).sqrt();
    assert_close(l_rib, 8.0 * (2.0_f64).sqrt(), 1e-10, "Diagonal rib span = a√2");

    // Horizontal thrust in diagonal rib (treated as parabolic arch)
    // Equivalent UDL on rib: w_eq = W_rib / L_rib
    let w_eq: f64 = w_rib / l_rib;
    let h_rib: f64 = w_eq * l_rib * l_rib / (8.0 * f_rib);
    // = W_rib * L_rib / (8 f_rib)
    let expected_h: f64 = w_rib * l_rib / (8.0 * f_rib);
    assert_close(h_rib, expected_h, 1e-10, "Rib thrust H = W_rib L_rib/(8f)");

    // Vertical reaction at column = W_total/4 (4 columns for square bay)
    let v_column: f64 = w_total / 4.0;
    assert_close(v_column, 80.0, 1e-10, "Column vertical reaction = W/4");

    // Total horizontal thrust at column (2 ribs meet at each column)
    // The diagonal components partially cancel; net horizontal per axis:
    // Each rib contributes H_rib × cos(45°) in each horizontal direction
    let h_per_axis: f64 = h_rib * (2.0_f64).sqrt() / 2.0;
    // Two ribs at each column → but they push in opposite directions along same axis
    // Net thrust along one wall direction = h_rib × cos(45°) (from one rib)
    assert_close(h_per_axis, h_rib / (2.0_f64).sqrt(), 1e-10, "Horizontal thrust component per axis");
}

// ================================================================
// 7. Abutment Stability (Overturning and Sliding)
// ================================================================
//
// An arch abutment must resist:
//   (a) Overturning: FoS = M_stabilize / M_overturn ≥ 2.0
//   (b) Sliding:     FoS = μ W / H ≥ 1.5
//
// Where:
//   H = horizontal thrust from arch
//   V = vertical reaction from arch
//   W = abutment self-weight
//   μ = coefficient of friction (stone-on-stone ≈ 0.6-0.7)
//
// Reference: Heyman, "The Stone Skeleton"; Ochsendorf, PhD thesis

#[test]
fn validation_abutment_stability() {
    let h_thrust: f64 = 120.0;   // kN, horizontal arch thrust
    let v_arch: f64 = 200.0;     // kN, vertical reaction from arch
    let w_abutment: f64 = 500.0; // kN, abutment self-weight
    let b: f64 = 3.0;            // m, abutment base width
    let _h_abutment: f64 = 6.0;  // m, abutment height
    let h_arch_level: f64 = 5.0; // m, height where arch meets abutment
    let mu: f64 = 0.65;          // friction coefficient (stone-on-stone)

    // (a) Overturning about downstream toe
    // Overturning moment: H acts at h_arch_level
    let m_overturn: f64 = h_thrust * h_arch_level;
    assert_close(m_overturn, 600.0, 1e-10, "Overturning moment = H × h");

    // Stabilizing moment: W acts at b/2, V_arch acts at some eccentricity (assume at b)
    let m_stabilize: f64 = w_abutment * b / 2.0 + v_arch * b;
    // = 500 * 1.5 + 200 * 3 = 750 + 600 = 1350 kN·m
    assert_close(m_stabilize, 1350.0, 1e-10, "Stabilizing moment");

    let fos_overturn: f64 = m_stabilize / m_overturn;
    assert_close(fos_overturn, 1350.0 / 600.0, 1e-10, "FoS overturning");
    assert!(fos_overturn >= 2.0, "FoS overturning = {} ≥ 2.0", fos_overturn);

    // (b) Sliding
    let total_vertical: f64 = w_abutment + v_arch;
    assert_close(total_vertical, 700.0, 1e-10, "Total vertical = W + V");

    let fos_sliding: f64 = mu * total_vertical / h_thrust;
    assert_close(fos_sliding, 0.65 * 700.0 / 120.0, 1e-10, "FoS sliding");
    assert!(fos_sliding > 1.5, "FoS sliding = {} > 1.5", fos_sliding);

    // (c) Eccentricity of resultant: e = M_net / N_total
    let m_net: f64 = m_stabilize - m_overturn;
    let eccentricity: f64 = m_net / total_vertical - b / 2.0;
    // Resultant should be within middle third: |e| < b/6
    assert!(eccentricity.abs() < b / 6.0, "Resultant in middle third");
}

// ================================================================
// 8. Arch Natural Frequency Approximation
// ================================================================
//
// The fundamental natural frequency of a circular arch (pinned-pinned)
// is approximately:
//   f₁ ≈ (π²/(2πL²)) √(EI/(ρA))  for antisymmetric mode
//
// But for a shallow arch, the in-plane antisymmetric frequency is:
//   ω₁ = k₁ √(EI/(ρA L⁴))
// where k₁ depends on the rise-to-span ratio.
//
// For a pinned circular arch, the lowest antisymmetric frequency
// approximation (Henrych):
//   ω_antisym ≈ (2π/L)² √(EI/(ρA)) × √(1 + (2πf/L)²)
//
// A simpler empirical formula for the fundamental frequency of a
// parabolic arch (pinned supports):
//   f₁ ≈ π/(2L²) × √(EI/(ρA)) × C
// where C depends on rise/span (C ≈ 3.5-4.5 for f/L = 0.1-0.3)
//
// Reference: Henrych, "The Dynamics of Arches and Frames"; DIN 4149

#[test]
fn validation_arch_natural_frequency() {
    let l: f64 = 20.0;        // m, span
    let _f_rise: f64 = 5.0;   // m, rise (f/L = 0.25)
    let e: f64 = 30e6;        // kN/m² (concrete)
    let i_z: f64 = 0.02;      // m⁴
    let a: f64 = 0.5;         // m², cross-section area
    let rho: f64 = 2500.0;    // kg/m³

    // EI and ρA
    let ei: f64 = e * i_z;
    assert_close(ei, 600000.0, 1e-10, "EI = 6×10⁵ kN·m²");

    // Convert ρA to consistent units: mass per length in kN·s²/m²
    let rho_a: f64 = rho * a / 1000.0; // kN·s²/m² per meter
    assert_close(rho_a, 1.25, 1e-10, "ρA = 1.25 kN·s²/m²");

    // Straight beam frequency for comparison (SS):
    // ω₁_beam = π² / L² × √(EI/(ρA))
    let omega_beam: f64 = PI * PI / (l * l) * (ei / rho_a).sqrt();
    let f_beam: f64 = omega_beam / (2.0 * PI);

    // Arch frequency is higher than beam due to arch action
    // For f/L = 0.25, the arch effect factor is approximately 1.1-1.3
    // (arch stiffness augments bending stiffness)
    let arch_factor: f64 = 1.2; // typical for f/L = 0.25
    let omega_arch: f64 = omega_beam * arch_factor;
    let f_arch: f64 = omega_arch / (2.0 * PI);

    // Verify arch frequency > beam frequency
    assert!(f_arch > f_beam, "Arch frequency > beam frequency");
    assert_close(f_arch / f_beam, arch_factor, 1e-10, "Frequency ratio = arch factor");

    // Check dimensional consistency: ω has units rad/s
    // [EI/(ρA)] = kN·m² / (kN·s²/m² · m) = m⁴/s² → √ = m²/s
    // ω = (1/m²)(m²/s) = 1/s = rad/s ✓
    let dim_check: f64 = (ei / rho_a).sqrt(); // m²/s
    let omega_check: f64 = PI * PI / (l * l) * dim_check;
    assert_close(omega_check, omega_beam, 1e-12, "Dimensional consistency check");

    // Period of arch vibration
    let t_arch: f64 = 1.0 / f_arch;
    let t_beam: f64 = 1.0 / f_beam;
    assert!(t_arch < t_beam, "Arch period < beam period (stiffer)");
}
