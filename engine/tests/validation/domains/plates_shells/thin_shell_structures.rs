/// Validation: Thin Shell Structures
///
/// References:
///   - Timoshenko & Woinowsky-Krieger: "Theory of Plates and Shells" 2nd ed. (1959)
///   - Billington: "Thin Shell Concrete Structures" 2nd ed. (1982)
///   - Flügge: "Stresses in Shells" 2nd ed. (1973)
///   - EN 1992-1-1: Design of Concrete Structures (shells)
///   - EN 1993-1-6: Strength and Stability of Shell Structures
///   - IASS Recommendations for Reinforced Concrete Shells (1979)
///
/// Tests verify membrane theory, bending theory, cylindrical shells,
/// domes, hyperbolic paraboloids, cooling towers, and buckling.

// ================================================================
// 1. Spherical Dome -- Membrane Theory
// ================================================================
//
// Meridional stress: Nφ = -q*R/(1+cosφ)
// Hoop stress: Nθ = q*R*(1/(1+cosφ) - cosφ)
// Hoop tension appears below φ ≈ 51.8° for uniform load.

#[test]
fn shell_spherical_dome_membrane() {
    let r: f64 = 30.0;          // m, radius
    let t: f64 = 0.15;          // m, shell thickness
    let q: f64 = 5.0;           // kN/m², self-weight + finishes

    // At crown (φ = 0)
    let phi_crown: f64 = 0.001_f64; // near zero (avoid division issues)
    let n_phi_crown: f64 = -q * r / (1.0 + phi_crown.cos());
    // ≈ -q*R/2 = -75 kN/m

    assert!(
        n_phi_crown < 0.0,
        "Crown meridional: {:.1} kN/m (compression)", n_phi_crown
    );

    // At base (φ = 60° = π/3 for hemisphere section)
    let phi_base: f64 = 60.0_f64.to_radians();
    let n_phi_base: f64 = -q * r / (1.0 + phi_base.cos());
    let n_theta_base: f64 = q * r * (1.0 / (1.0 + phi_base.cos()) - phi_base.cos());

    // Meridional always compressive
    assert!(
        n_phi_base < 0.0,
        "Base meridional: {:.1} kN/m (compression)", n_phi_base
    );

    // Hoop stress changes sign at φ ≈ 51.8°
    // At φ = 60° > 51.8°: hoop is tension
    assert!(
        n_theta_base > 0.0,
        "Base hoop: {:.1} kN/m (tension -- needs ring beam)", n_theta_base
    );

    // Stress in shell
    let sigma_phi: f64 = n_phi_base / t; // kPa → MPa by /1000
    assert!(
        (sigma_phi / 1000.0).abs() < 5.0,
        "Meridional stress: {:.2} MPa", sigma_phi / 1000.0
    );

    let _t = t;
}

// ================================================================
// 2. Cylindrical Shell Roof -- Barrel Vault
// ================================================================
//
// Long cylindrical shell (L/R > 5): beam theory applies.
// Longitudinal stress from beam bending, hoop stress from membrane.
// Edge beams carry shear.

#[test]
fn shell_cylindrical_roof() {
    let r: f64 = 15.0;          // m, radius
    let l: f64 = 30.0;          // m, span (length of barrel)
    let phi_half: f64 = 40.0_f64.to_radians(); // half-opening angle
    let t: f64 = 0.10;          // m, shell thickness
    let q: f64 = 4.0;           // kN/m², total load

    // Chord width
    let b: f64 = 2.0 * r * phi_half.sin();

    // Arch (hoop) thrust at crown
    let n_theta: f64 = -q * r; // compression
    // = -60 kN/m

    assert!(
        n_theta < 0.0,
        "Hoop force: {:.1} kN/m (compression)", n_theta
    );

    // Longitudinal bending (beam analogy)
    // Shell acts as beam spanning L with "depth" = sagitta
    let sagitta: f64 = r * (1.0 - phi_half.cos());
    let w_per_m: f64 = q * b; // load per meter of span

    // Moment at midspan
    let m_mid: f64 = w_per_m * l * l / 8.0;

    // Section modulus of shell cross-section (thin arc)
    // I ≈ 2*R³*t*(φ/2 - sin(2φ)/4) for circular arc
    // Simplified: lever arm ≈ 0.6 × sagitta
    let z_arm: f64 = 0.6 * sagitta;
    let n_long: f64 = m_mid / (b * z_arm); // longitudinal stress resultant

    assert!(
        n_long > 0.0,
        "Longitudinal force: {:.0} kN/m at midspan bottom", n_long
    );

    let _l = l;
    let _t = t;
}

// ================================================================
// 3. Hyperbolic Paraboloid (Hypar) -- Membrane Forces
// ================================================================
//
// z = c*x*y/(a*b) for hypar with rise c over plan a×b.
// Under uniform load: Nxy = q*a*b/(2*c) (constant shear!)
// Pure shear membrane → elegant for thin concrete roofs.

#[test]
fn shell_hypar_membrane() {
    let a: f64 = 20.0;          // m, plan dimension x
    let b: f64 = 20.0;          // m, plan dimension y
    let c: f64 = 5.0;           // m, rise/warp
    let q: f64 = 3.5;           // kN/m², uniform load

    // Membrane shear force (constant everywhere!)
    let nxy: f64 = q * a * b / (2.0 * c);
    // = 3.5 * 400 / 10 = 140 kN/m

    assert!(
        nxy > 50.0 && nxy < 500.0,
        "Membrane shear: {:.0} kN/m (constant!)", nxy
    );

    // Principal stresses (from pure shear)
    let n_1: f64 = nxy;   // tension (diagonal)
    let n_2: f64 = -nxy;  // compression (other diagonal)

    assert!(
        n_1 > 0.0 && n_2 < 0.0,
        "N1 = {:.0} (tension), N2 = {:.0} (compression)", n_1, n_2
    );

    // Edge beam forces (carry the membrane shear)
    // Edge beam tension: T = Nxy × edge_length / 2
    let edge_tension: f64 = nxy * ((a / 2.0).powi(2) + c.powi(2)).sqrt();

    assert!(
        edge_tension > 0.0,
        "Edge beam tension: {:.0} kN", edge_tension
    );

    // Shell thickness for compression
    let t: f64 = 0.075;         // m (75mm minimum)
    let sigma_c: f64 = nxy / t / 1000.0; // MPa

    assert!(
        sigma_c < 5.0,
        "Shear stress: {:.2} MPa", sigma_c
    );
}

// ================================================================
// 4. Cylindrical Shell Buckling -- EN 1993-1-6
// ================================================================
//
// Classical buckling: σ_cr = 0.605 × E × t/R
// Real buckling much lower due to imperfections.
// EN 1993-1-6: knockdown factor α depends on quality class.

#[test]
fn shell_buckling_cylindrical() {
    let r: f64 = 5.0;           // m, radius
    let t: f64 = 0.010;         // m (10mm steel)
    let l: f64 = 10.0;          // m, length
    let e: f64 = 210_000.0;     // MPa

    // Classical buckling stress (axial compression)
    let sigma_cr_classical: f64 = 0.605 * e * t * 1000.0 / (r * 1000.0);
    // = 0.605 * 210000 * 10 / 5000 = 254.1 MPa

    assert!(
        sigma_cr_classical > 200.0,
        "Classical σ_cr: {:.0} MPa", sigma_cr_classical
    );

    // Imperfection reduction (EN 1993-1-6)
    // Quality class B (normal): α = 0.6/(1 + 1.91*(Δw/t)^1.44)
    // Δw/t = fabrication tolerance parameter
    let dw_t: f64 = 1.0;        // typical for class B
    let alpha: f64 = 0.62 / (1.0 + 1.91 * dw_t.powf(1.44));
    // ≈ 0.21

    let sigma_cr_design: f64 = alpha * sigma_cr_classical;

    assert!(
        sigma_cr_design < sigma_cr_classical * 0.5,
        "Design σ_cr: {:.0} MPa (knockdown factor {:.2})", sigma_cr_design, alpha
    );

    // R/t ratio check (shell slenderness)
    let r_t: f64 = r * 1000.0 / (t * 1000.0);
    assert!(
        r_t > 100.0,
        "R/t = {:.0} (thin shell regime)", r_t
    );

    let _l = l;
}

// ================================================================
// 5. Cooling Tower -- Hyperbolic Shell
// ================================================================
//
// Cooling tower: hyperboloid of revolution.
// Meridional and hoop forces from self-weight and wind.
// Wind load distribution: Cp = Σ(an × cos(nθ))

#[test]
fn shell_cooling_tower() {
    let h: f64 = 120.0;         // m, total height
    let r_throat: f64 = 30.0;   // m, throat radius (minimum)
    let r_base: f64 = 50.0;     // m, base radius
    let r_top: f64 = 35.0;      // m, top radius
    let t: f64 = 0.20;          // m, shell thickness (average)
    let gamma_c: f64 = 25.0;    // kN/m³

    // Self-weight of shell (approximate)
    let r_avg: f64 = (r_base + r_throat + r_top) / 3.0;
    let surface_area: f64 = 2.0 * std::f64::consts::PI * r_avg * h; // approximate
    let w_shell: f64 = surface_area * t * gamma_c;

    assert!(
        w_shell > 10_000.0,
        "Shell weight: {:.0} kN", w_shell
    );

    // Meridional stress at base (self-weight)
    let perimeter_base: f64 = 2.0 * std::f64::consts::PI * r_base;
    let n_phi_base: f64 = -w_shell / perimeter_base; // kN/m

    let sigma_phi: f64 = n_phi_base / t / 1000.0; // MPa

    assert!(
        sigma_phi.abs() < 5.0,
        "Base meridional stress: {:.2} MPa", sigma_phi
    );

    // Wind load critical section (at throat)
    let q_wind: f64 = 1.5;      // kN/m², wind pressure
    let cp_max: f64 = -2.5;     // maximum suction (near 60-80°)
    let n_theta_wind: f64 = cp_max * q_wind * r_throat;

    assert!(
        n_theta_wind < 0.0,
        "Wind hoop force at throat: {:.1} kN/m", n_theta_wind
    );

    // Buckling check (wind suction critical)
    let e_c: f64 = 30_000.0;    // MPa, concrete modulus
    let sigma_cr: f64 = 0.605 * e_c * t * 1000.0 / (r_throat * 1000.0);
    let n_cr: f64 = sigma_cr * t * 1000.0; // kN/m

    assert!(
        n_cr.abs() > n_theta_wind.abs() * 3.0,
        "Buckling capacity/demand: {:.1}", n_cr / n_theta_wind.abs()
    );
}

// ================================================================
// 6. Ring Beam at Dome Base
// ================================================================
//
// Dome exerts outward horizontal thrust at base.
// Ring beam carries this as hoop tension.
// T_ring = H × R_base

#[test]
fn shell_ring_beam() {
    let r_dome: f64 = 25.0;     // m, dome radius
    let phi_base: f64 = 60.0_f64.to_radians(); // base angle
    let q: f64 = 5.0;           // kN/m², dome load

    // Horizontal thrust at base
    let r_base: f64 = r_dome * phi_base.sin(); // plan radius at base
    let n_phi: f64 = -q * r_dome / (1.0 + phi_base.cos());
    let h_thrust: f64 = n_phi * phi_base.cos(); // horizontal component (kN/m)

    // Ring beam hoop tension
    let t_ring: f64 = h_thrust.abs() * r_base;

    assert!(
        t_ring > 500.0,
        "Ring beam tension: {:.0} kN", t_ring
    );

    // Required reinforcement
    let fy: f64 = 500.0;        // MPa
    let as_ring: f64 = t_ring * 1000.0 / fy; // mm²

    assert!(
        as_ring > 1000.0,
        "Ring beam As: {:.0} mm²", as_ring
    );

    // Ring beam size
    // Typically 300×500 to 500×800 for medium domes
    let b_ring: f64 = 400.0;    // mm
    let h_ring: f64 = 600.0;    // mm
    let rho_s: f64 = as_ring / (b_ring * h_ring);

    assert!(
        rho_s < 0.04,
        "Reinforcement ratio: {:.3} < 4%", rho_s
    );
}

// ================================================================
// 7. Folded Plate Structure
// ================================================================
//
// Folded plates: series of flat plates at angles.
// Each plate acts as a deep beam in its own plane.
// Joint compatibility: ridge deflections must be equal.

#[test]
fn shell_folded_plate() {
    let l: f64 = 20.0;          // m, span
    let b: f64 = 3.0;           // m, plate width (along slope)
    let t: f64 = 0.10;          // m, plate thickness
    let theta: f64 = 30.0_f64.to_radians(); // plate inclination
    let q: f64 = 4.0;           // kN/m², total load

    // Vertical component of load
    let q_vert: f64 = q * theta.cos();

    // Horizontal projection of plate
    let b_h: f64 = b * theta.cos();

    // Each plate as beam (depth = b*sin(θ))
    let d_eff: f64 = b * theta.sin(); // effective depth

    // Bending moment (simply supported)
    let w: f64 = q_vert * b_h; // load per m of span
    let m: f64 = w * l * l / 8.0;

    // Longitudinal stress at ridge and valley
    // Section modulus of plate in its plane: Z ≈ b²*t/6 (as deep beam)
    let z: f64 = b * d_eff * t / 6.0 * 1000.0; // mm² × m → approximate

    assert!(
        m > 0.0,
        "Bending moment: {:.0} kN·m", m
    );

    // Transverse bending (plate action between ridges)
    let m_trans: f64 = q * b_h * b_h / 8.0; // per m of span

    assert!(
        m_trans < m,
        "Transverse M = {:.1} < longitudinal M = {:.0} kN·m", m_trans, m
    );

    let _z = z;
}

// ================================================================
// 8. Conical Shell -- Water Tank Roof
// ================================================================
//
// Conical shell (tank roof): meridional and hoop forces.
// Nφ = -q*R/(cosα) along generator
// Nθ = -q*R*cosα (hoop)
// where α = half-angle of cone.

#[test]
fn shell_conical_tank_roof() {
    let r_base: f64 = 10.0;     // m, base radius
    let alpha: f64 = 20.0_f64.to_radians(); // half-angle from vertical
    let q: f64 = 3.0;           // kN/m², dead + live load

    // At base ring (s = R_base / sin(α))
    let s: f64 = r_base / alpha.sin(); // slant distance from apex

    // Local radius of curvature (hoop direction)
    let _r_local: f64 = r_base / alpha.sin(); // ≈ s

    // Meridional force
    let n_phi: f64 = -q * s / (2.0 * alpha.cos());

    assert!(
        n_phi < 0.0,
        "Meridional force: {:.1} kN/m (compression)", n_phi
    );

    // Hoop force
    let n_theta: f64 = -q * r_base * alpha.cos() / alpha.sin();

    assert!(
        n_theta < 0.0,
        "Hoop force: {:.1} kN/m (compression)", n_theta
    );

    // Shell thickness check
    let t: f64 = 0.008;         // m (8mm steel)
    let sigma_max: f64 = n_phi.abs() / t / 1000.0; // MPa

    assert!(
        sigma_max < 200.0,
        "Max stress: {:.1} MPa", sigma_max
    );

    // Cone height
    let h_cone: f64 = r_base / alpha.tan();
    assert!(
        h_cone > r_base,
        "Cone height: {:.1} m", h_cone
    );
}
