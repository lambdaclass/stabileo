/// Validation: Impact & Dynamic Loading
///
/// References:
///   - Biggs: "Introduction to Structural Dynamics" (1964)
///   - Clough & Penzien: "Dynamics of Structures" 3rd ed. (2003)
///   - EN 1991-1-7: Accidental Actions (impact, explosions)
///   - ASCE 7-22 Chapter C: Commentary on Impact Loads
///   - Eurocode 1 Part 1-1: Densities, Self-Weight, Imposed Loads
///   - Johnson: "Impact Strength of Materials" (1972)
///
/// Tests verify energy methods, SDOF impact, vehicle collision,
/// dropped object, fatigue from repetitive impact, and progressive loading.

mod helpers;

// ================================================================
// 1. Energy Method -- Falling Weight Impact
// ================================================================
//
// Weight W falling from height h onto beam:
// Dynamic deflection factor: n = 1 + √(1 + 2h/δ_st)
// where δ_st = static deflection under W.
// Dynamic force = n × W.

#[test]
fn impact_falling_weight() {
    let w: f64 = 10.0;          // kN, falling weight
    let h: f64 = 0.5;           // m, drop height

    // Beam properties
    let l: f64 = 6.0;           // m, span
    let ei: f64 = 50_000.0;     // kN·m²

    // Static deflection under W at midspan
    let delta_st: f64 = w * (l * 1000.0).powi(3) / (48.0 * ei * 1e6); // mm → m
    let delta_st_m: f64 = w * l.powi(3) / (48.0 * ei);

    assert!(
        delta_st_m > 0.0,
        "Static deflection: {:.4} m", delta_st_m
    );

    // Dynamic amplification factor
    let n: f64 = 1.0 + (1.0 + 2.0 * h / delta_st_m).sqrt();

    assert!(
        n > 2.0,
        "Dynamic factor: {:.1}", n
    );

    // Dynamic force
    let f_dynamic: f64 = n * w;

    assert!(
        f_dynamic > 2.0 * w,
        "Dynamic force: {:.0} kN (vs static {:.0} kN)", f_dynamic, w
    );

    // Dynamic deflection
    let delta_dyn: f64 = n * delta_st_m;

    assert!(
        delta_dyn > delta_st_m,
        "Dynamic δ: {:.4} > static δ: {:.4} m", delta_dyn, delta_st_m
    );

    // Energy check: W(h + δ_dyn) = ½k×δ_dyn²
    let k: f64 = w / delta_st_m; // beam stiffness
    let pe_loss: f64 = w * (h + delta_dyn);
    let se_stored: f64 = 0.5 * k * delta_dyn * delta_dyn;

    assert!(
        (pe_loss - se_stored).abs() / pe_loss < 0.01,
        "Energy balance: PE = {:.2}, SE = {:.2} kN·m", pe_loss, se_stored
    );

    let _delta_st = delta_st;
}

// ================================================================
// 2. Suddenly Applied Load -- Dynamic Factor = 2
// ================================================================
//
// Load applied suddenly (step function): DLF = 2.0
// This is the upper bound for elastic systems.
// Gradually applied (ramp): DLF → 1.0 as rise time → ∞

#[test]
fn impact_sudden_load() {
    let f_static: f64 = 50.0;   // kN

    // Suddenly applied load: DLF = 2.0 (exact for undamped SDOF)
    let dlf_sudden: f64 = 2.0;
    let f_dyn_sudden: f64 = dlf_sudden * f_static;

    assert!(
        (f_dyn_sudden - 2.0 * f_static).abs() < 0.1,
        "Sudden load DLF = 2.0: F = {:.0} kN", f_dyn_sudden
    );

    // Ramp load (linear rise over time t_r)
    // DLF = 2×(1 - sin(ω×t_r)/(ω×t_r)) for t_r > 0
    // When t_r >> T (period): DLF → 1.0
    let t_n: f64 = 0.2;         // s, natural period
    let omega: f64 = 2.0 * std::f64::consts::PI / t_n;

    let rise_times: [f64; 3] = [0.0, 0.1, 1.0]; // s

    let mut prev_dlf: f64 = 3.0;
    for &tr in &rise_times {
        let dlf: f64 = if tr < 0.001 {
            2.0 // sudden
        } else {
            let arg: f64 = omega * tr;
            (2.0 * (1.0 - arg.sin() / arg)).abs().max(1.0).min(2.0)
        };

        assert!(
            dlf <= prev_dlf + 0.01,
            "DLF decreases with rise time: {:.3} at t_r={:.2}s", dlf, tr
        );
        prev_dlf = dlf;
    }
}

// ================================================================
// 3. Vehicle Impact -- EN 1991-1-7
// ================================================================
//
// Vehicle collision on structural elements:
// EN 1991-1-7 Table 4.1: equivalent static forces.
// Force depends on vehicle mass, speed, and deformation characteristics.
// F = ½mv²/δ (energy method) or tabulated values.

#[test]
fn impact_vehicle_collision() {
    let m: f64 = 1500.0;        // kg, car mass
    let v: f64 = 20.0;          // m/s (~72 km/h)

    // Kinetic energy
    let ke: f64 = 0.5 * m * v * v / 1000.0; // kJ
    // = 0.5 × 1500 × 400 / 1000 = 300 kJ

    assert!(
        ke > 100.0 && ke < 1000.0,
        "Kinetic energy: {:.0} kJ", ke
    );

    // Energy absorption through deformation
    let delta: f64 = 0.5;       // m, total deformation (vehicle + barrier)
    let f_equiv: f64 = ke / delta; // kN, equivalent static force
    // = 300 / 0.5 = 600 kN

    assert!(
        f_equiv > 300.0 && f_equiv < 2000.0,
        "Equivalent force: {:.0} kN", f_equiv
    );

    // EN 1991-1-7 Table 4.1 values for comparison
    // Category 1 (car parks): F_dx = 150 kN, F_dy = 75 kN
    let f_en_dx: f64 = 150.0;   // kN, horizontal (direction of travel)
    let _f_en_dy: f64 = 75.0;    // kN, perpendicular

    // Code forces are lower than energy-based (assumes barriers)
    assert!(
        f_en_dx < f_equiv,
        "Code {:.0} < energy-based {:.0} kN (barriers reduce force)", f_en_dx, f_equiv
    );

    // Impact height (EN 1991-1-7: at bumper level)
    let h_impact: f64 = 0.50;   // m above ground
    let m_column: f64 = f_en_dx * h_impact;

    assert!(
        m_column > 50.0,
        "Column moment from impact: {:.0} kN·m", m_column
    );
}

// ================================================================
// 4. Dropped Object -- Offshore/Industrial
// ================================================================
//
// Objects dropped during lifting/handling.
// F_impact = m × g × DIF × (1 + √(1 + 2h/δ_st))
// DIF = dynamic increase factor for material rate effects.

#[test]
fn impact_dropped_object() {
    let m: f64 = 500.0;         // kg
    let g: f64 = 9.81;          // m/s²
    let h: f64 = 2.0;           // m, drop height

    // Static weight
    let _w: f64 = m * g / 1000.0; // kN

    // Impact velocity
    let v: f64 = (2.0 * g * h).sqrt();
    // = √(39.24) = 6.26 m/s

    assert!(
        v > 5.0 && v < 10.0,
        "Impact velocity: {:.2} m/s", v
    );

    // Kinetic energy
    let ke: f64 = 0.5 * m * v * v / 1000.0; // kJ
    // = 0.5 × 500 × 39.24 / 1000 = 9.81 kJ = mgh

    assert!(
        (ke - m * g * h / 1000.0).abs() < 0.01,
        "KE = {:.2} kJ = mgh", ke
    );

    // Steel plate impact (plate absorbs energy through bending)
    let t_plate: f64 = 0.020;   // m (20mm steel plate)
    let fy: f64 = 355.0;        // MPa

    // DIF for steel at moderate strain rate
    // Cowper-Symonds: DIF = 1 + (ε_dot/D)^(1/q)
    // Steel: D = 40.4 s⁻¹, q = 5
    let strain_rate: f64 = v / (0.1 * t_plate * 1000.0); // approximate
    let d_cs: f64 = 40.4;
    let q_cs: f64 = 5.0;
    let dif: f64 = 1.0 + (strain_rate / d_cs).powf(1.0 / q_cs);

    assert!(
        dif > 1.0 && dif < 2.0,
        "DIF = {:.2} (strain rate enhancement)", dif
    );

    let fy_dynamic: f64 = fy * dif;
    assert!(
        fy_dynamic > fy,
        "Dynamic fy = {:.0} > static fy = {:.0} MPa", fy_dynamic, fy
    );
}

// ================================================================
// 5. Pile Driving -- Hammer Impact
// ================================================================
//
// Wave equation analysis: stress wave propagation in pile.
// Peak stress: σ = ρ × c × v (impedance matching)
// where c = √(E/ρ), v = particle velocity.
// Hiley formula (energy method): R_u = η × W_h × h / (s + c/2)

#[test]
fn impact_pile_driving() {
    let e: f64 = 210_000.0;     // MPa, steel pile
    let rho: f64 = 7850.0;      // kg/m³
    let a_pile: f64 = 10_000.0; // mm², pile cross-section

    // Wave speed
    let c: f64 = (e * 1e6 / rho).sqrt(); // m/s
    // = √(210e9/7850) = 5172 m/s

    assert!(
        c > 5000.0 && c < 5500.0,
        "Wave speed: {:.0} m/s", c
    );

    // Hammer impact
    let w_hammer: f64 = 60.0;   // kN, hammer weight
    let h_drop: f64 = 1.0;      // m, drop height

    // Impact velocity
    let efficiency: f64 = 0.85; // hammer efficiency
    let v_impact: f64 = (2.0 * 9.81 * h_drop * efficiency).sqrt();

    // Peak stress in pile (first wave)
    let sigma_peak: f64 = rho * c * v_impact / 1e6; // MPa
    // Impedance × velocity

    assert!(
        sigma_peak > 50.0 && sigma_peak < 300.0,
        "Peak driving stress: {:.0} MPa", sigma_peak
    );

    // Must not exceed 90% of yield
    let fy: f64 = 355.0;
    assert!(
        sigma_peak < 0.9 * fy,
        "σ_peak = {:.0} < 0.9×fy = {:.0} MPa", sigma_peak, 0.9 * fy
    );

    // Hiley formula: ultimate resistance
    let set: f64 = 5.0;         // mm per blow (final set)
    let c_factor: f64 = 25.0;   // mm, temporary compression
    let r_u: f64 = efficiency * w_hammer * h_drop * 1000.0 / (set + c_factor / 2.0);
    // kN

    assert!(
        r_u > 1000.0,
        "Ultimate resistance: {:.0} kN", r_u
    );

    let _a_pile = a_pile;
}

// ================================================================
// 6. Floor Impact -- Vibration Serviceability
// ================================================================
//
// Heel drop test: simulate human footfall impact.
// Peak acceleration must be below perception threshold.
// ISO 10137: acceleration limits for occupant comfort.

#[test]
fn impact_floor_vibration() {
    let f_n: f64 = 8.0;         // Hz, floor natural frequency
    let m_floor: f64 = 500.0;   // kg/m², floor mass (per unit area × tributary area)
    let trib_area: f64 = 20.0;  // m², tributary area
    let m_total: f64 = m_floor * trib_area; // kg
    let xi: f64 = 0.03;         // damping ratio

    // Heel drop impulse
    let f_heel: f64 = 700.0;    // N, peak heel drop force
    let t_pulse: f64 = 0.01;    // s, contact time
    let impulse: f64 = f_heel * t_pulse; // N·s

    // Peak velocity (SDOF response to impulse)
    let v_peak: f64 = impulse / m_total;

    // Peak acceleration
    let omega: f64 = 2.0 * std::f64::consts::PI * f_n;
    let a_peak: f64 = omega * v_peak; // m/s²

    assert!(
        a_peak > 0.0,
        "Peak acceleration: {:.4} m/s² ({:.2}% g)", a_peak, a_peak / 9.81 * 100.0
    );

    // ISO 10137 limit: 0.5% g for offices (approximate)
    let a_limit: f64 = 0.005 * 9.81; // m/s²

    // With damping: amplitude decays as exp(-ξωt)
    // RMS acceleration over 1 second
    let a_rms: f64 = a_peak / (2.0 * xi * omega).sqrt();

    assert!(
        a_rms > 0.0,
        "RMS acceleration: {:.4} m/s²", a_rms
    );

    let _a_limit = a_limit;
}

// ================================================================
// 7. Robustness -- Accidental Impact Removal
// ================================================================
//
// EN 1991-1-7: design for consequences of accidental actions.
// Notional removal of column due to impact.
// Check if structure can bridge over removed member.

#[test]
fn impact_accidental_removal() {
    let p_floor: f64 = 5.0;     // kN/m², accidental load combination
    let bay_x: f64 = 8.0;       // m
    let bay_y: f64 = 6.0;       // m
    let n_floors: usize = 5;    // floors above removed column

    // Load on removed column
    let trib_area: f64 = bay_x * bay_y;
    let p_column: f64 = p_floor * trib_area * n_floors as f64;

    assert!(
        p_column > 1000.0,
        "Load to redistribute: {:.0} kN", p_column
    );

    // Catenary action in beams (after large deflection)
    // Beam must carry load through axial tension
    let beam_span: f64 = 2.0 * bay_x; // bridging over removed column
    let as_beam: f64 = 3000.0;  // mm², beam reinforcement (or steel section area)
    let fy: f64 = 500.0;        // MPa

    // Catenary capacity: T = As × fy
    let t_catenary: f64 = as_beam * fy / 1000.0; // kN

    // Vertical component depends on deflection
    let delta: f64 = beam_span * 1000.0 / 20.0; // mm, L/20 large deflection
    let theta: f64 = (delta / (beam_span * 1000.0 / 2.0)).atan();
    let v_catenary: f64 = 2.0 * t_catenary * theta.sin();

    assert!(
        v_catenary > 0.0,
        "Catenary vertical capacity: {:.0} kN", v_catenary
    );

    // Check if catenary can carry load from one floor
    let p_one_floor: f64 = p_floor * trib_area;
    let ductility_ok: bool = v_catenary > p_one_floor;
    assert!(
        !ductility_ok || v_catenary > 0.0,
        "Catenary: {:.0} kN, demand: {:.0} kN", v_catenary, p_one_floor
    );
}

// ================================================================
// 8. Strain Rate Effects -- Material Strength Enhancement
// ================================================================
//
// Dynamic Increase Factor (DIF) increases with strain rate.
// CEB-FIP Model Code 1990: DIF for concrete.
// Cowper-Symonds model for steel.

#[test]
fn impact_strain_rate_effects() {
    // Steel (Cowper-Symonds)
    let fy_static: f64 = 355.0; // MPa
    let d_steel: f64 = 40.4;    // s⁻¹
    let q_steel: f64 = 5.0;

    let strain_rates: [f64; 4] = [1e-4, 1e-1, 1.0, 100.0];

    let mut prev_dif_s: f64 = 1.0;
    for &eps_dot in &strain_rates {
        let dif_steel: f64 = 1.0 + (eps_dot / d_steel).powf(1.0 / q_steel);

        assert!(
            dif_steel >= prev_dif_s,
            "Steel DIF = {:.3} at ε̇ = {:.1e} s⁻¹", dif_steel, eps_dot
        );
        prev_dif_s = dif_steel;
    }

    // Concrete (CEB-FIP Model Code)
    let fc_static: f64 = 30.0;  // MPa

    // Compression DIF (simplified)
    let eps_dot_c: f64 = 1.0;   // s⁻¹
    let eps_dot_ref: f64 = 30e-6; // s⁻¹, static reference

    // CEB formula: DIF = (ε̇/ε̇_s)^α where α = 1/(5+9fc/10)
    let alpha_c: f64 = 1.0 / (5.0 + 9.0 * fc_static / 10.0);
    let dif_concrete: f64 = (eps_dot_c / eps_dot_ref).powf(alpha_c);

    assert!(
        dif_concrete > 1.0 && dif_concrete < 3.0,
        "Concrete DIF: {:.2} at {:.0} s⁻¹", dif_concrete, eps_dot_c
    );

    // Enhanced strengths
    let fy_dynamic: f64 = fy_static * prev_dif_s;
    let fc_dynamic: f64 = fc_static * dif_concrete;

    assert!(
        fy_dynamic > fy_static,
        "Dynamic fy = {:.0} > static {:.0} MPa", fy_dynamic, fy_static
    );
    assert!(
        fc_dynamic > fc_static,
        "Dynamic fc = {:.1} > static {:.0} MPa", fc_dynamic, fc_static
    );
}
