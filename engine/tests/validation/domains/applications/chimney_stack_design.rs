/// Validation: Chimney & Stack Design
///
/// References:
///   - ACI 307-08: Design and Construction of Reinforced Concrete Chimneys
///   - EN 13084-1: Free-Standing Chimneys -- General Requirements
///   - EN 13084-2: Concrete Chimneys
///   - EN 13084-7: Steel Chimneys
///   - CICIND Model Code for Concrete Chimneys (2011)
///   - Vickery & Basu: "Across-Wind Vibrations of Chimneys" (1983)
///   - ASME STS-1: Steel Stacks (2016)
///
/// Tests verify wind load, vortex shedding, thermal gradient,
/// shell buckling, foundation, liner design, and fatigue.

// ================================================================
// 1. Wind Load on Chimney -- Along-Wind
// ================================================================
//
// Wind force: F = Cf × qp(z) × D × dz
// Drag coefficient: Cd depends on Re, roughness, slenderness.
// Circular section: Cd ≈ 0.6-1.2 depending on Re.

#[test]
fn chimney_along_wind() {
    let h: f64 = 80.0;          // m, chimney height
    let d: f64 = 5.0;           // m, outer diameter
    let v_ref: f64 = 30.0;      // m/s, reference wind speed

    // Wind profile (power law)
    let z_ref: f64 = 10.0;
    let alpha: f64 = 0.16;

    // Drag coefficient (Re > 5×10⁵: post-critical)
    let cd: f64 = 0.7;          // smooth circular, post-critical

    // Integrate wind force over height (5 segments)
    let n_seg: usize = 5;
    let dz: f64 = h / n_seg as f64;
    let rho: f64 = 1.225;       // kg/m³

    let mut f_total: f64 = 0.0;
    let mut m_base: f64 = 0.0;

    for i in 0..n_seg {
        let z: f64 = (i as f64 + 0.5) * dz;
        let v_z: f64 = v_ref * (z / z_ref).powf(alpha);
        let qp: f64 = 0.5 * rho * v_z * v_z / 1000.0; // kN/m²
        let f_seg: f64 = cd * qp * d * dz;
        f_total += f_seg;
        m_base += f_seg * z;
    }

    assert!(
        f_total > 100.0 && f_total < 1000.0,
        "Total wind force: {:.0} kN", f_total
    );

    assert!(
        m_base > 2000.0,
        "Base moment: {:.0} kN·m", m_base
    );

    // Overturning check: moment about base
    // Foundation must resist M_base
    let _v_ref = v_ref;
}

// ================================================================
// 2. Vortex Shedding -- Across-Wind
// ================================================================
//
// Chimneys are particularly susceptible to vortex-induced vibration.
// Critical speed: V_cr = f_n × D / St
// St ≈ 0.20 for circular cylinders
// Lock-in amplitude can cause fatigue failure.

#[test]
fn chimney_vortex_shedding() {
    let d: f64 = 5.0;           // m, diameter
    let h: f64 = 80.0;          // m, height
    let st: f64 = 0.20;         // Strouhal number

    // Natural frequency (cantilever: f ≈ 0.015/H for concrete chimney)
    // More precisely: f1 = (1.875²/(2π)) × √(EI/(m*L⁴))
    let fn1: f64 = 0.5;         // Hz (typical for 80m chimney)

    // Critical wind speed
    let v_cr: f64 = fn1 * d / st;
    // = 0.5 × 5 / 0.2 = 12.5 m/s

    assert!(
        v_cr > 5.0 && v_cr < 30.0,
        "Critical speed: {:.1} m/s", v_cr
    );

    // Scruton number (mass-damping parameter)
    let m: f64 = 8000.0;        // kg/m, mass per unit length
    let rho: f64 = 1.225;
    let xi: f64 = 0.01;         // structural damping ratio
    let sc: f64 = 2.0 * m * xi / (rho * d * d);

    // Sc > 10: vortex shedding unlikely to cause problems
    // Sc < 5: likely significant vibration
    assert!(
        sc > 0.0,
        "Scruton number: {:.1}", sc
    );

    // Response amplitude (EN 1991-1-4 Annex E)
    // y_max/D ≈ 1/(St² × Sc) × K_w × clat
    let clat: f64 = 0.2;        // lateral force coefficient
    let kw: f64 = 0.6;          // mode shape correction
    let y_max: f64 = d * clat * kw / (st * st * sc);

    assert!(
        y_max > 0.0,
        "Peak amplitude: {:.3} m ({:.1}% of D)", y_max, y_max / d * 100.0
    );

    let _h = h;
}

// ================================================================
// 3. Thermal Gradient -- Differential Temperature
// ================================================================
//
// Hot flue gas inside, ambient outside.
// Thermal gradient through shell causes bending.
// σ_thermal = E × α × ΔT / (2*(1-ν))

#[test]
fn chimney_thermal_gradient() {
    let t_inner: f64 = 200.0;   // °C, flue gas temperature
    let t_outer: f64 = 10.0;    // °C, ambient
    let t_shell: f64 = 0.30;    // m, shell thickness

    // Temperature at shell faces (with insulation)
    let t_insulation: f64 = 0.10; // m, insulation thickness
    let k_insulation: f64 = 0.05; // W/(m·K)
    let k_concrete: f64 = 1.5;    // W/(m·K)

    // Temperature drop across insulation
    let r_insulation: f64 = t_insulation / k_insulation;
    let r_concrete: f64 = t_shell / k_concrete;
    let r_total: f64 = r_insulation + r_concrete;

    let t_inner_face: f64 = t_outer + (t_inner - t_outer) * r_concrete / r_total;
    let t_outer_face: f64 = t_outer + (t_inner - t_outer) * 0.01; // near ambient

    let delta_t: f64 = t_inner_face - t_outer_face;

    assert!(
        delta_t > 10.0 && delta_t < 100.0,
        "Shell ΔT: {:.1}°C", delta_t
    );

    // Thermal stress
    let e: f64 = 30_000.0;      // MPa, concrete
    let alpha: f64 = 10e-6;     // 1/°C
    let nu: f64 = 0.2;

    let sigma_thermal: f64 = e * alpha * delta_t / (2.0 * (1.0 - nu));

    assert!(
        sigma_thermal > 0.0 && sigma_thermal < 10.0,
        "Thermal stress: {:.2} MPa", sigma_thermal
    );

    // Cracking check
    let f_ct: f64 = 3.0;        // MPa, concrete tensile strength
    if sigma_thermal > f_ct {
        // Need minimum reinforcement for crack control
        let as_min_ratio: f64 = f_ct / 500.0; // fy = 500 MPa
        assert!(
            as_min_ratio > 0.001,
            "Min reinforcement ratio: {:.4}", as_min_ratio
        );
    }
}

// ================================================================
// 4. Shell Stress -- Combined Actions
// ================================================================
//
// ACI 307: vertical stress = N/(2πRt) ± M/(πR²t)
// Must check compression + tension under wind + dead load.

#[test]
fn chimney_shell_stress() {
    let r: f64 = 2.5;           // m, mean radius
    let t: f64 = 0.30;          // m, shell thickness
    let h: f64 = 80.0;          // m, height

    // Dead load (shell weight)
    let gamma: f64 = 25.0;      // kN/m³
    let circumference: f64 = 2.0 * std::f64::consts::PI * r;
    let w_shell: f64 = circumference * t * gamma; // kN/m per unit height
    let n_dead: f64 = w_shell * h; // kN at base

    // Axial stress (uniform compression)
    let sigma_n: f64 = n_dead / (circumference * t) / 1000.0; // MPa

    assert!(
        sigma_n > 0.5 && sigma_n < 5.0,
        "Axial stress: {:.2} MPa", sigma_n
    );

    // Wind moment at base
    let m_wind: f64 = 15_000.0; // kN·m (from wind analysis)

    // Bending stress
    let i_shell: f64 = std::f64::consts::PI * r * r * r * t; // m⁴ (thin ring)
    let sigma_m: f64 = m_wind * r / i_shell / 1000.0; // MPa

    // Combined: max compression on windward side
    let sigma_max_comp: f64 = sigma_n + sigma_m;
    // Max tension on leeward side
    let sigma_tension: f64 = sigma_m - sigma_n;

    assert!(
        sigma_max_comp > sigma_n,
        "Max compression: {:.2} MPa", sigma_max_comp
    );

    // If tension exists: reinforcement required
    if sigma_tension > 0.0 {
        // Vertical reinforcement
        let as_vert: f64 = sigma_tension * 1000.0 * t * 1000.0 / 500.0; // mm²/m
        assert!(
            as_vert > 0.0,
            "Required vertical reinforcement: {:.0} mm²/m", as_vert
        );
    }
}

// ================================================================
// 5. Steel Stack Buckling -- ASME STS-1
// ================================================================
//
// Thin steel cylinder under wind + self-weight: buckling critical.
// σ_cr = 0.605 × E × t/R (classical)
// Knockdown factor for imperfections: 0.2-0.5 typically.

#[test]
fn chimney_steel_buckling() {
    let d: f64 = 3.0;           // m, diameter
    let r: f64 = d / 2.0;       // m, radius
    let t: f64 = 0.012;         // m (12mm plate)
    let e: f64 = 210_000.0;     // MPa

    // R/t ratio
    let r_t: f64 = r * 1000.0 / (t * 1000.0);
    assert!(
        r_t > 50.0 && r_t < 500.0,
        "R/t = {:.0}", r_t
    );

    // Classical buckling stress
    let sigma_cr: f64 = 0.605 * e * t * 1000.0 / (r * 1000.0);
    // = 0.605 × 210000 × 12 / 1500 = 1016 MPa

    assert!(
        sigma_cr > 500.0,
        "Classical σ_cr: {:.0} MPa", sigma_cr
    );

    // Knockdown factor (ASME STS-1)
    let alpha_knock: f64 = 0.30; // typical for fabricated cylinders

    let sigma_design: f64 = alpha_knock * sigma_cr;

    assert!(
        sigma_design > 100.0,
        "Design σ_cr: {:.0} MPa", sigma_design
    );

    // Applied stress (wind bending + dead load)
    let m_applied: f64 = 5000.0; // kN·m
    let i_shell: f64 = std::f64::consts::PI * (r * 1000.0).powi(3) * t * 1000.0; // mm⁴
    let sigma_b: f64 = m_applied * 1e6 * r * 1000.0 / i_shell;

    // Utilization
    let util: f64 = sigma_b / sigma_design;
    assert!(
        util < 1.0,
        "Buckling utilization: {:.2}", util
    );
}

// ================================================================
// 6. Foundation -- Ring Footing
// ================================================================
//
// Chimney on annular (ring) foundation.
// Must resist overturning from wind + seismic.
// Stability factor = restoring moment / overturning moment ≥ 1.5

#[test]
fn chimney_foundation() {
    let m_wind: f64 = 15_000.0; // kN·m, overturning moment
    let v_wind: f64 = 300.0;    // kN, horizontal shear
    let w_chimney: f64 = 3000.0; // kN, chimney weight
    let w_found: f64 = 5000.0;  // kN, foundation weight

    // Ring footing dimensions
    let r_outer: f64 = 6.0;     // m, outer radius
    let r_inner: f64 = 3.0;     // m, inner radius
    let _t_found: f64 = 2.0;    // m, depth

    // Restoring moment (weight × lever arm)
    // For ring: centroid at (2/3)*(R_o³ - R_i³)/(R_o² - R_i²) from center
    // Simplified: restoring moment = (W_chimney + W_foundation) × 0
    // Overturning stability:
    let w_total: f64 = w_chimney + w_found;
    let m_restoring: f64 = w_total * r_outer * 0.7; // approximate edge of kern

    let fs_overturning: f64 = m_restoring / m_wind;

    assert!(
        fs_overturning > 1.5,
        "Overturning FS = {:.2} > 1.5", fs_overturning
    );

    // Bearing pressure (M/W eccentricity check)
    let e: f64 = m_wind / w_total;
    let a_ring: f64 = std::f64::consts::PI * (r_outer * r_outer - r_inner * r_inner);

    // If e < (R_o - R_i)/6: full compression
    let kern_limit: f64 = (r_outer - r_inner) / 6.0;
    assert!(
        e < r_outer,
        "Eccentricity: {:.2} m", e
    );

    let sigma_max: f64 = w_total / a_ring * (1.0 + 6.0 * e / (r_outer + r_inner));

    assert!(
        sigma_max > 0.0,
        "Max bearing: {:.0} kPa", sigma_max
    );

    let _v_wind = v_wind;
    let _kern_limit = kern_limit;
}

// ================================================================
// 7. Liner Design -- Independent Steel Liner
// ================================================================
//
// Many concrete chimneys have internal steel liner.
// Liner carries flue gas temperature + chemical attack.
// Must be free to expand independently (centering guides).

#[test]
fn chimney_liner_design() {
    let d_liner: f64 = 3.0;     // m, liner diameter
    let t_liner: f64 = 6.0;     // mm, liner thickness
    let e: f64 = 210_000.0;     // MPa
    let alpha: f64 = 12e-6;     // 1/°C

    // Operating temperature
    let t_gas: f64 = 250.0;     // °C
    let t_ambient: f64 = 20.0;
    let delta_t: f64 = t_gas - t_ambient;

    // Free thermal expansion
    let h_liner: f64 = 80.0;    // m
    let delta_h: f64 = alpha * delta_t * h_liner * 1000.0; // mm
    // = 12e-6 × 230 × 80000 = 220.8 mm

    assert!(
        delta_h > 100.0 && delta_h < 500.0,
        "Thermal growth: {:.1} mm", delta_h
    );

    // If liner is restrained: thermal stress
    let sigma_restrained: f64 = e * alpha * delta_t;
    // = 210000 × 12e-6 × 230 = 579.6 MPa (> yield!)

    assert!(
        sigma_restrained > 400.0,
        "Restrained stress: {:.0} MPa (must allow expansion!)", sigma_restrained
    );

    // Liner self-weight
    let rho_steel: f64 = 78.5;  // kN/m³
    let circumference: f64 = std::f64::consts::PI * d_liner;
    let w_liner: f64 = circumference * (t_liner / 1000.0) * rho_steel; // kN/m
    let total_weight: f64 = w_liner * h_liner;

    assert!(
        total_weight > 50.0,
        "Liner weight: {:.0} kN", total_weight
    );

    // Guide spacing (lateral support)
    let guide_spacing: f64 = 10.0; // m, typical
    let n_guides: f64 = (h_liner / guide_spacing).ceil();

    assert!(
        n_guides > 5.0,
        "Number of guides: {:.0}", n_guides
    );
}

// ================================================================
// 8. Fatigue -- Vortex-Induced Oscillation
// ================================================================
//
// Chimneys can accumulate millions of stress cycles from vortex shedding.
// ACI 307/CICIND: limit deflection amplitude to control fatigue.
// Steel chimneys: weld detail category critical.

#[test]
fn chimney_fatigue() {
    // Vortex shedding parameters
    let y_max: f64 = 0.050;     // m, peak displacement at top
    let d: f64 = 5.0;           // m, diameter
    let h: f64 = 80.0;          // m, height

    // Amplitude ratio
    let y_d: f64 = y_max / d;

    assert!(
        y_d < 0.10,
        "y/D = {:.3} (< 0.10 limit for fatigue)", y_d
    );

    // Stress at base from vortex oscillation
    // σ = E × κ × y_max (where κ = curvature ≈ 3.516² × y_max / H²)
    // For first mode: κ_max ≈ (1.875/H)² × y_max × 2 (at base)
    let kappa: f64 = (1.875 / h).powi(2) * y_max * 2.0;
    let e_concrete: f64 = 30_000.0; // MPa (concrete)
    let r: f64 = 2.5;              // m, radius

    // Outer fiber stress
    let sigma_vortex: f64 = e_concrete * kappa * r * 1000.0 / 1e6; // MPa

    assert!(
        sigma_vortex > 0.0,
        "Vortex stress range: {:.2} MPa", sigma_vortex
    );

    // Number of cycles per year
    let f_n: f64 = 0.5;         // Hz, natural frequency
    let hours_per_year: f64 = 200.0; // hours of significant vortex shedding
    let n_cycles_year: f64 = f_n * hours_per_year * 3600.0;

    // Design life cycles
    let design_life: f64 = 50.0; // years
    let n_total: f64 = n_cycles_year * design_life;

    assert!(
        n_total > 1e6,
        "Total cycles: {:.2e}", n_total
    );

    // Steel chimney: detail category check
    let delta_sigma_c: f64 = 71.0; // MPa, detail category (butt weld)
    let delta_sigma_d: f64 = delta_sigma_c * (2e6 / n_total).powf(1.0 / 3.0); // constant amplitude limit
    // If stress range < this → infinite life

    assert!(
        delta_sigma_d > 0.0,
        "Fatigue limit at {:.2e} cycles: {:.1} MPa", n_total, delta_sigma_d
    );
}
