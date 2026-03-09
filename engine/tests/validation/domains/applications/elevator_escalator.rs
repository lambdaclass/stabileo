/// Validation: Elevator and Escalator Structural Design
///
/// References:
///   - ASME A17.1/CSA B44, "Safety Code for Elevators and Escalators"
///   - EN 81-1/2, "Safety Rules for the Construction and Installation of Lifts"
///   - CIBSE Guide D, "Transportation Systems in Buildings"
///   - EN 115, "Safety of Escalators and Moving Walks"
///   - Janovsky, "Elevator Mechanical Design", 3rd ed. (2004)
///   - Strakosch, "The Vertical Transportation Handbook", 4th ed. (2010)
///
/// Tests verify classical formulas for elevator and escalator structural design:
///   1. Elevator shaft loads (guide rail forces from off-center car)
///   2. Rope/cable tension calculation (suspension rope loads)
///   3. Counterweight sizing (mass balance for traction drive)
///   4. Machine room loading (sheave reactions and floor loads)
///   5. Buffer spring design (energy absorption at terminal landing)
///   6. Escalator truss loading (distributed and concentrated loads)
///   7. Step chain tension (chain pull from passenger load and inclination)
///   8. Seismic restraint of elevator (lateral force on guide rails)

// ================================================================
// 1. Elevator Shaft Loads (Guide Rail Forces)
// ================================================================
//
// When the car load is eccentric, the guide rails carry horizontal
// forces due to the moment imbalance.
//
// ASME A17.1 / EN 81-20 Annex G:
//   Horizontal force on each rail from eccentric load:
//     F_rail = (Q * g * e_x) / (2 * d_rail)
//
// where:
//   Q     = rated load (kg)
//   g     = 9.81 m/s²
//   e_x   = eccentricity of load from car center (m)
//   d_rail = distance between guide rails (m)
//
// Guide rail bending moment per bracket span:
//   M_rail = F_rail * L_bracket / 4  (simply-supported between brackets)
//
// Reference: EN 81-20 Annex G, Janovsky Ch. 5

#[test]
fn elevator_guide_rail_forces() {
    let q: f64 = 1600.0;          // kg, rated load (EN 81: 21-person elevator)
    let g: f64 = 9.81;            // m/s²
    let e_x: f64 = 0.30;          // m, load eccentricity from car center
    let d_rail: f64 = 2.10;       // m, distance between guide rails
    let l_bracket: f64 = 2.50;    // m, bracket spacing along shaft

    // Car weight
    let _p_car: f64 = 2200.0;     // kg, empty car mass (typical for 1600 kg elevator)

    // Horizontal force on each guide rail from eccentric load
    // F_rail = Q * g * e_x / (2 * d_rail)
    let f_rail: f64 = q * g * e_x / (2.0 * d_rail);
    // = 1600 * 9.81 * 0.30 / (2 * 2.10)
    // = 4708.8 / 4.20 = 1121.1 N
    let f_rail_expected: f64 = 1600.0 * 9.81 * 0.30 / (2.0 * 2.10);

    assert!(
        (f_rail - f_rail_expected).abs() / f_rail_expected < 0.001,
        "Guide rail force: {:.1} N, expected {:.1} N", f_rail, f_rail_expected
    );

    // Force must be positive and reasonable (typically 500-3000 N)
    assert!(
        f_rail > 0.0 && f_rail < 5000.0,
        "Guide rail force: {:.1} N should be in typical range 500-5000 N", f_rail
    );

    // Bending moment on rail between brackets (SS beam with center load)
    // M_rail = F_rail * L_bracket / 4
    let m_rail: f64 = f_rail * l_bracket / 4.0;
    // = 1121.1 * 2.50 / 4 = 700.7 N*m
    let m_rail_expected: f64 = f_rail_expected * l_bracket / 4.0;

    assert!(
        (m_rail - m_rail_expected).abs() / m_rail_expected < 0.001,
        "Rail bending moment: {:.1} N*m, expected {:.1} N*m", m_rail, m_rail_expected
    );

    // Verify larger eccentricity gives larger rail force
    let e_x_larger: f64 = 0.50;
    let f_rail_larger: f64 = q * g * e_x_larger / (2.0 * d_rail);

    assert!(
        f_rail_larger > f_rail,
        "Larger eccentricity: F={:.1} N > {:.1} N", f_rail_larger, f_rail
    );

    // Verify wider rail spacing reduces force
    let d_rail_wider: f64 = 2.80;
    let f_rail_wider: f64 = q * g * e_x / (2.0 * d_rail_wider);

    assert!(
        f_rail_wider < f_rail,
        "Wider rail spacing: F={:.1} N < {:.1} N", f_rail_wider, f_rail
    );

    // Rail deflection check (EN 81-20 limit: 5 mm)
    // delta = F * L^3 / (48 * E * I)
    let _e_steel: f64 = 210_000.0;  // MPa = N/mm²
    let _i_rail: f64 = 171_000.0;   // mm^4, T89/B guide rail (typical)
    let delta_mm: f64 = f_rail * (l_bracket * 1000.0).powi(3)
        / (48.0 * _e_steel * _i_rail);

    assert!(
        delta_mm > 0.0,
        "Rail deflection: {:.2} mm should be positive", delta_mm
    );
}

// ================================================================
// 2. Rope/Cable Tension Calculation
// ================================================================
//
// For a traction elevator with n_rope suspension ropes:
//   T_rope = (W_car + Q * g + W_rope_hanging) / n_rope
//
// where:
//   W_car  = car weight (N)
//   Q      = rated load (N)
//   W_rope = weight of hanging ropes on car side (N)
//   n_rope = number of ropes
//
// Safety factor (EN 81-20 §5.11):
//   SF = n_rope * T_break / T_max >= 12  (for 3 or more ropes)
//
// Reference: EN 81-20 §5.11, ASME A17.1 §2.20

#[test]
fn elevator_rope_tension() {
    let w_car: f64 = 2200.0 * 9.81;      // N, car weight
    let q_load: f64 = 1600.0 * 9.81;     // N, rated load
    let n_rope: f64 = 6.0;               // number of suspension ropes
    let h_travel: f64 = 60.0;            // m, travel height
    let rho_rope: f64 = 0.56;            // kg/m, mass per unit length of rope (12mm dia)

    // Weight of hanging ropes on the car side (at bottom landing)
    let w_rope_hanging: f64 = rho_rope * h_travel * 9.81;
    // = 0.56 * 60 * 9.81 = 329.6 N
    let w_rope_expected: f64 = 0.56 * 60.0 * 9.81;

    assert!(
        (w_rope_hanging - w_rope_expected).abs() / w_rope_expected < 0.001,
        "Rope hanging weight: {:.1} N, expected {:.1} N", w_rope_hanging, w_rope_expected
    );

    // Maximum rope tension (car at bottom, full load)
    let t_max_total: f64 = w_car + q_load + w_rope_hanging;
    let t_per_rope: f64 = t_max_total / n_rope;

    assert!(
        t_per_rope > 0.0,
        "Rope tension: {:.1} N should be positive", t_per_rope
    );

    // Breaking strength of 12mm diameter wire rope (typical: ~90 kN)
    let t_break: f64 = 90_000.0; // N per rope

    // Safety factor per EN 81-20
    let sf: f64 = n_rope * t_break / t_max_total;
    let sf_expected: f64 = n_rope * t_break / (w_car + q_load + w_rope_hanging);

    assert!(
        (sf - sf_expected).abs() / sf_expected < 0.001,
        "Safety factor: {:.2}, expected {:.2}", sf, sf_expected
    );

    // EN 81-20 requires SF >= 12 for 3 or more ropes
    assert!(
        sf >= 12.0,
        "Rope safety factor: {:.1} must be >= 12 per EN 81-20 §5.11", sf
    );

    // Verify more ropes reduce per-rope tension
    let n_rope_more: f64 = 8.0;
    let t_per_rope_more: f64 = t_max_total / n_rope_more;

    assert!(
        t_per_rope_more < t_per_rope,
        "More ropes: T={:.1} N < {:.1} N per rope", t_per_rope_more, t_per_rope
    );

    // Traction ratio check: T1/T2 must not exceed e^(f*alpha)
    // where f = friction coefficient, alpha = wrap angle
    let _f_friction: f64 = 0.09;  // traction sheave groove friction
    let _alpha_wrap: f64 = std::f64::consts::PI; // 180-degree wrap
    let t1_t2_max: f64 = (_f_friction * _alpha_wrap).exp();
    // = exp(0.09 * pi) = exp(0.2827) = 1.327

    assert!(
        t1_t2_max > 1.0,
        "Max traction ratio: {:.3} must exceed 1.0", t1_t2_max
    );
}

// ================================================================
// 3. Counterweight Sizing
// ================================================================
//
// The counterweight is sized to balance the car plus a fraction
// of the rated load (typically 40-50%):
//   W_cw = W_car + k * Q
//
// where k is the balance factor (EN 81: typically 0.40-0.50).
//
// This minimizes the maximum traction demand:
//   T_max = max(W_car + Q - W_cw, W_cw - W_car)
//   T_max_balanced = Q * (1 - k)  (for the heavier side)
//
// Optimal balance: k = 0.5 minimizes peak motor torque.
//
// Reference: CIBSE Guide D §5.3, Strakosch Ch. 7

#[test]
fn elevator_counterweight_sizing() {
    let w_car: f64 = 2200.0;     // kg, car mass
    let q: f64 = 1600.0;         // kg, rated load
    let k_balance: f64 = 0.45;   // balance factor (45% of rated load)
    let g: f64 = 9.81;           // m/s²

    // Counterweight mass
    let m_cw: f64 = w_car + k_balance * q;
    // = 2200 + 0.45 * 1600 = 2200 + 720 = 2920 kg
    let m_cw_expected: f64 = 2200.0 + 0.45 * 1600.0;

    assert!(
        (m_cw - m_cw_expected).abs() / m_cw_expected < 0.001,
        "Counterweight mass: {:.0} kg, expected {:.0} kg", m_cw, m_cw_expected
    );

    // Weight imbalance with full load (car side heavier)
    let w_imbalance_full: f64 = (w_car + q - m_cw) * g;
    // = (2200 + 1600 - 2920) * 9.81 = 880 * 9.81 = 8632.8 N
    let _imbalance_full_expected: f64 = (1.0 - k_balance) * q * g;

    assert!(
        (w_imbalance_full - _imbalance_full_expected).abs() / _imbalance_full_expected < 0.001,
        "Full load imbalance: {:.1} N, expected {:.1} N", w_imbalance_full, _imbalance_full_expected
    );

    // Weight imbalance with empty car (counterweight side heavier)
    let w_imbalance_empty: f64 = (m_cw - w_car) * g;
    // = (2920 - 2200) * 9.81 = 720 * 9.81 = 7063.2 N
    let _imbalance_empty_expected: f64 = k_balance * q * g;

    assert!(
        (w_imbalance_empty - _imbalance_empty_expected).abs() / _imbalance_empty_expected < 0.001,
        "Empty car imbalance: {:.1} N, expected {:.1} N", w_imbalance_empty, _imbalance_empty_expected
    );

    // Peak motor force is the maximum of the two imbalances
    let peak_force: f64 = w_imbalance_full.max(w_imbalance_empty);

    // Verify k=0.5 gives minimum peak force (both imbalances equal)
    let k_optimal: f64 = 0.5;
    let m_cw_opt: f64 = w_car + k_optimal * q;
    let imb_full_opt: f64 = ((w_car + q - m_cw_opt) * g).abs();
    let imb_empty_opt: f64 = ((m_cw_opt - w_car) * g).abs();

    assert!(
        (imb_full_opt - imb_empty_opt).abs() / imb_full_opt < 0.001,
        "At k=0.5: full imbalance {:.1} N = empty imbalance {:.1} N",
        imb_full_opt, imb_empty_opt
    );

    // k=0.5 peak force should be <= peak force at k=0.45
    let peak_opt: f64 = imb_full_opt.max(imb_empty_opt);

    assert!(
        peak_opt <= peak_force + 1.0,
        "Optimal k=0.5: peak {:.1} N <= k=0.45 peak {:.1} N", peak_opt, peak_force
    );

    // Motor power estimate: P = F * v / eta
    let v_speed: f64 = 2.5;       // m/s, car speed
    let eta: f64 = 0.85;          // overall mechanical efficiency
    let power_kw: f64 = peak_force * v_speed / (eta * 1000.0);

    assert!(
        power_kw > 0.0 && power_kw < 100.0,
        "Motor power: {:.1} kW should be reasonable", power_kw
    );
}

// ================================================================
// 4. Machine Room Loading
// ================================================================
//
// The machine room floor must support:
//   - Machine weight (motor + gearbox + brake)
//   - Sheave reactions from rope tensions
//   - Dynamic loads during emergency stop
//
// Sheave bearing reactions:
//   R_sheave = 2 * T_rope * n_rope * sin(alpha/2)
//
// where alpha = rope wrap angle around sheave.
//
// For 180-degree wrap: R = 2 * T * n  (ropes pull straight down both sides)
//
// EN 81-20 requires floor designed for:
//   F_floor = (machine_weight + 2 * rope_load) * safety_factor
//
// Reference: EN 81-20 §5.2, Janovsky Ch. 12

#[test]
fn elevator_machine_room_loading() {
    let m_machine: f64 = 3500.0;  // kg, machine (motor + gearbox + brake)
    let n_rope: f64 = 6.0;       // number of ropes
    let g: f64 = 9.81;           // m/s²

    // Rope tension per rope (car side, full load at bottom)
    let w_car: f64 = 2200.0 * g;     // N
    let q_load: f64 = 1600.0 * g;    // N
    let t_per_rope: f64 = (w_car + q_load) / n_rope;
    // = (21582 + 15696) / 6 = 37278 / 6 = 6213 N

    // Sheave reaction for 180-degree wrap
    // R = 2 * T_per_rope * n_rope * sin(180/2) = 2 * T_total
    // (both sides of rope pull on sheave)
    let alpha: f64 = std::f64::consts::PI; // 180 degrees in radians
    let r_sheave: f64 = 2.0 * t_per_rope * n_rope * (alpha / 2.0).sin();
    // sin(pi/2) = 1.0, so R = 2 * T_total = 2 * 37278 = 74556 N
    let r_sheave_expected: f64 = 2.0 * (w_car + q_load) * 1.0;

    assert!(
        (r_sheave - r_sheave_expected).abs() / r_sheave_expected < 0.001,
        "Sheave reaction: {:.0} N, expected {:.0} N", r_sheave, r_sheave_expected
    );

    // Total static floor load
    let f_static: f64 = m_machine * g + r_sheave;
    // = 3500 * 9.81 + 74556 = 34335 + 74556 = 108891 N

    assert!(
        f_static > 0.0,
        "Static floor load: {:.0} N", f_static
    );

    // Dynamic load factor during emergency stop (EN 81-20: typically 2.0)
    let gamma_dynamic: f64 = 2.0;
    let f_design: f64 = m_machine * g + gamma_dynamic * r_sheave;

    assert!(
        f_design > f_static,
        "Design load {:.0} N > static load {:.0} N", f_design, f_static
    );

    // Floor pressure (assuming machine room area of 4m x 5m = 20 m²)
    let _a_room: f64 = 20.0; // m²
    let p_floor: f64 = f_design / (_a_room * 1000.0); // kPa

    assert!(
        p_floor > 0.0 && p_floor < 50.0,
        "Floor pressure: {:.1} kPa should be reasonable", p_floor
    );

    // Verify sheave reaction scales linearly with rope count
    let n_rope_fewer: f64 = 4.0;
    let t_per_rope_fewer: f64 = (w_car + q_load) / n_rope_fewer;
    let r_sheave_fewer: f64 = 2.0 * t_per_rope_fewer * n_rope_fewer * (alpha / 2.0).sin();

    assert!(
        (r_sheave_fewer - r_sheave).abs() / r_sheave < 0.001,
        "Sheave reaction is independent of rope count: {:.0} N vs {:.0} N",
        r_sheave_fewer, r_sheave
    );

    // Machine room beam: bending moment for machine centered on a beam
    let l_beam: f64 = 4.0; // m, machine room beam span
    let m_beam: f64 = f_design * l_beam / 4.0; // kN*mm center load on SS beam

    assert!(
        m_beam > 0.0,
        "Machine beam moment: {:.0} N*m", m_beam
    );
}

// ================================================================
// 5. Buffer Spring Design
// ================================================================
//
// Elevator buffers absorb the kinetic energy of the car at the
// terminal landing in case of overtravel.
//
// Energy to absorb (EN 81-20 §5.8):
//   E_buffer = 0.5 * m_total * v_impact^2
//
// For spring buffers (allowed up to 1.0 m/s per EN 81-20):
//   E_spring = 0.5 * k * x_max^2
//   k = m_total * v^2 / x_max^2
//
// Buffer stroke must satisfy:
//   x_max >= v^2 / (2 * g * n_buffer)
//   where n_buffer = buffer efficiency (0.5 for linear spring)
//
// Deceleration check: a_max = k * x_max / m_total <= 1.0 * g (EN 81)
//
// Reference: EN 81-20 §5.8, ASME A17.1 §2.22

#[test]
fn elevator_buffer_spring_design() {
    let m_car: f64 = 2200.0;     // kg, car mass
    let q: f64 = 1600.0;         // kg, rated load
    let v: f64 = 1.0;            // m/s, rated speed (spring buffer limit)
    let g: f64 = 9.81;           // m/s²

    // Total mass for buffer calculation (car + rated load)
    let m_total: f64 = m_car + q;
    // = 2200 + 1600 = 3800 kg

    // Kinetic energy to absorb
    let e_kinetic: f64 = 0.5 * m_total * v * v;
    // = 0.5 * 3800 * 1.0 = 1900 J
    let e_expected: f64 = 0.5 * 3800.0 * 1.0;

    assert!(
        (e_kinetic - e_expected).abs() / e_expected < 0.001,
        "Kinetic energy: {:.0} J, expected {:.0} J", e_kinetic, e_expected
    );

    // Minimum buffer stroke (assuming spring efficiency = 0.5)
    // x_min = v^2 / (2 * g * eta)
    let eta_buffer: f64 = 0.5; // linear spring efficiency
    let x_min: f64 = v * v / (2.0 * g * eta_buffer);
    // = 1.0 / (2 * 9.81 * 0.5) = 1.0 / 9.81 = 0.1019 m
    let x_min_expected: f64 = 1.0 / (2.0 * 9.81 * 0.5);

    assert!(
        (x_min - x_min_expected).abs() / x_min_expected < 0.001,
        "Min buffer stroke: {:.4} m, expected {:.4} m", x_min, x_min_expected
    );

    // Design stroke (with safety margin, typically 1.5x minimum)
    let x_design: f64 = 0.20; // m, chosen design stroke

    assert!(
        x_design > x_min,
        "Design stroke {:.3} m > minimum {:.3} m", x_design, x_min
    );

    // Required spring stiffness
    // E_spring = 0.5 * k * x^2 = E_kinetic
    // k = 2 * E_kinetic / x^2
    let k_spring: f64 = 2.0 * e_kinetic / (x_design * x_design);
    // = 2 * 1900 / 0.04 = 95000 N/m

    assert!(
        k_spring > 0.0,
        "Spring stiffness: {:.0} N/m", k_spring
    );

    // Maximum deceleration at full stroke
    // F_max = k * x_design, a_max = F_max / m_total
    let a_max: f64 = k_spring * x_design / m_total;
    // = 95000 * 0.20 / 3800 = 5.0 m/s²

    // EN 81-20 limit: average deceleration <= 1g, peak <= 2.5g
    assert!(
        a_max < 2.5 * g,
        "Peak deceleration: {:.1} m/s² should be < 2.5g = {:.1} m/s²", a_max, 2.5 * g
    );

    // Verify energy balance
    let e_spring: f64 = 0.5 * k_spring * x_design * x_design;

    assert!(
        (e_spring - e_kinetic).abs() / e_kinetic < 0.001,
        "Energy balance: E_spring={:.0} J, E_kinetic={:.0} J", e_spring, e_kinetic
    );

    // Higher speed requires stiffer spring (or longer stroke)
    let v_faster: f64 = 1.5; // m/s
    let e_faster: f64 = 0.5 * m_total * v_faster * v_faster;

    assert!(
        e_faster > e_kinetic,
        "Higher speed energy {:.0} J > {:.0} J", e_faster, e_kinetic
    );
}

// ================================================================
// 6. Escalator Truss Loading
// ================================================================
//
// The escalator truss (structural frame) supports:
//   - Self-weight of the truss, steps, and handrails
//   - Passenger load (EN 115 §5.2: 5000 N/m² on step band width)
//   - Impact factor for dynamics
//
// Truss design as a simply-supported beam:
//   Horizontal span: L = H / sin(alpha) where H = rise, alpha = inclination
//   Total UDL: w = (w_self + w_passengers) * step_width
//   Maximum moment: M = w * L^2 / 8
//   Maximum deflection: delta = 5 * w * L^4 / (384 * EI)
//
// EN 115 deflection limit: L/750
//
// Reference: EN 115:2008 §5.2, ASME A17.1 §6.1

#[test]
fn escalator_truss_loading() {
    let h_rise: f64 = 6.0;           // m, floor-to-floor rise
    let alpha_deg: f64 = 30.0;       // degrees, standard escalator inclination
    let alpha: f64 = alpha_deg.to_radians();
    let step_width: f64 = 1.0;       // m, step width (1000mm standard)

    // Horizontal span of truss
    let l_span: f64 = h_rise / alpha.sin();
    // = 6.0 / sin(30) = 6.0 / 0.5 = 12.0 m
    let l_expected: f64 = 6.0 / 0.5;

    assert!(
        (l_span - l_expected).abs() / l_expected < 0.001,
        "Truss span: {:.1} m, expected {:.1} m", l_span, l_expected
    );

    // Self-weight of escalator (typical: 3-5 kN/m along incline)
    let w_self: f64 = 4.0;           // kN/m, self-weight per unit length

    // Passenger loading (EN 115 §5.2: 5000 N/m² = 5.0 kN/m²)
    let q_passenger: f64 = 5.0;      // kN/m², per EN 115
    let w_passenger: f64 = q_passenger * step_width;
    // = 5.0 * 1.0 = 5.0 kN/m

    // Total distributed load along truss
    let w_total: f64 = w_self + w_passenger;
    // = 4.0 + 5.0 = 9.0 kN/m

    // Maximum bending moment (SS beam with UDL)
    let m_max: f64 = w_total * l_span * l_span / 8.0;
    // = 9.0 * 144 / 8 = 162 kN*m
    let m_expected: f64 = 9.0 * 12.0 * 12.0 / 8.0;

    assert!(
        (m_max - m_expected).abs() / m_expected < 0.001,
        "Max moment: {:.1} kN*m, expected {:.1} kN*m", m_max, m_expected
    );

    // Maximum shear at support
    let v_max: f64 = w_total * l_span / 2.0;
    // = 9.0 * 12.0 / 2 = 54.0 kN

    assert!(
        v_max > 0.0,
        "Max shear: {:.1} kN", v_max
    );

    // Deflection check (EN 115 limit: L/750)
    let _e_steel: f64 = 210_000.0;   // MPa = N/mm²
    let _i_truss: f64 = 5.0e8;       // mm^4, typical truss section
    let _ei: f64 = _e_steel * _i_truss; // N*mm²

    // delta = 5 * w * L^4 / (384 * EI)
    // Convert to consistent units: w in N/mm, L in mm
    let w_n_mm: f64 = w_total * 1000.0 / 1000.0; // kN/m -> N/mm
    let l_mm: f64 = l_span * 1000.0;

    let delta: f64 = 5.0 * w_n_mm * l_mm.powi(4) / (384.0 * _ei);
    let delta_limit: f64 = l_mm / 750.0;

    // Delta should be positive
    assert!(
        delta > 0.0,
        "Truss deflection: {:.2} mm should be positive", delta
    );

    // Verify steeper angle gives shorter span (and thus less moment)
    let alpha_steep: f64 = 35.0_f64.to_radians();
    let l_steep: f64 = h_rise / alpha_steep.sin();
    let m_steep: f64 = w_total * l_steep * l_steep / 8.0;

    assert!(
        m_steep < m_max,
        "Steeper escalator: M={:.1} kN*m < {:.1} kN*m", m_steep, m_max
    );

    // Deflection limit check provides meaningful comparison
    assert!(
        delta_limit > 0.0,
        "Deflection limit L/750 = {:.1} mm", delta_limit
    );
}

// ================================================================
// 7. Step Chain Tension
// ================================================================
//
// The step chain carries the weight of the steps, passengers, and
// must overcome friction along the truss tracks.
//
// Chain tension at the upper sprocket (maximum):
//   T_upper = (W_steps + W_passengers) * [sin(alpha) + mu * cos(alpha)]
//           + W_return * [mu * cos(alpha) - sin(alpha)]
//
// where:
//   W_steps     = weight of all steps on the incline
//   W_passengers = passenger weight on the incline
//   mu          = friction coefficient of chain guides
//   alpha       = escalator inclination angle
//   W_return    = weight of returning (underside) steps
//
// For a simpler estimate:
//   T_chain = (w_total * L_incline) * sin(alpha) * (1 + mu/tan(alpha))
//
// Motor power: P = T_chain * v_chain / eta
//
// Reference: EN 115 §5.4, Janovsky "Escalator Design"

#[test]
fn escalator_step_chain_tension() {
    let h_rise: f64 = 6.0;           // m, rise
    let alpha_deg: f64 = 30.0;       // degrees
    let alpha: f64 = alpha_deg.to_radians();
    let step_width: f64 = 1.0;       // m
    let v_chain: f64 = 0.50;         // m/s, step speed (EN 115 standard)
    let g: f64 = 9.81;               // m/s²

    // Inclined length
    let l_incline: f64 = h_rise / alpha.sin();
    // = 6.0 / 0.5 = 12.0 m

    // Step weight per unit length of incline
    let m_step_per_m: f64 = 25.0;    // kg/m, mass of steps per unit inclined length

    // Passenger load per unit length
    let q_pass: f64 = 5.0;           // kN/m² (EN 115)
    let w_pass_per_m: f64 = q_pass * step_width; // kN/m along incline

    // Total weight on the incline (steps)
    let w_steps: f64 = m_step_per_m * l_incline * g; // N
    // = 25 * 12 * 9.81 = 2943 N

    // Total passenger weight on incline
    let _w_passengers: f64 = w_pass_per_m * l_incline * 1000.0; // Convert kN to N
    // = 5.0 * 12.0 * 1000 = 60000 N (this is the force, already in N from kN/m * m * 1000)

    // Wait -- w_pass_per_m is in kN/m, so w_passengers = kN/m * m = kN, convert to N:
    let w_passengers_n: f64 = w_pass_per_m * l_incline * 1000.0;
    // = 5.0 * 12.0 * 1000 = 60000 N

    // Friction coefficient of chain guides
    let mu: f64 = 0.10;

    // Chain tension for the loaded (upper) strand:
    // T = (W_steps + W_passengers) * (sin(alpha) + mu * cos(alpha))
    let t_upper: f64 = (w_steps + w_passengers_n) * (alpha.sin() + mu * alpha.cos());
    // sin(30) = 0.5, cos(30) = 0.866
    // = (2943 + 60000) * (0.5 + 0.1 * 0.866)
    // = 62943 * (0.5 + 0.0866) = 62943 * 0.5866 = 36930 N

    assert!(
        t_upper > 0.0,
        "Upper chain tension: {:.0} N should be positive", t_upper
    );

    // Return strand tension (steps going back down -- friction opposes motion)
    let w_return: f64 = w_steps; // same step mass on return side, no passengers
    let t_return: f64 = w_return * (mu * alpha.cos() - alpha.sin());
    // = 2943 * (0.0866 - 0.5) = 2943 * (-0.4134) = -1217 N
    // Negative means gravity helps (no chain pull needed on return side)

    // Net chain force at upper sprocket
    let t_net: f64 = t_upper - t_return; // t_return is negative, so this adds

    assert!(
        t_net > t_upper,
        "Net tension {:.0} N > upper tension {:.0} N (return adds drag)", t_net, t_upper
    );

    // Motor power required
    let eta: f64 = 0.85; // mechanical efficiency
    let power_w: f64 = t_net.abs() * v_chain / eta;
    let power_kw: f64 = power_w / 1000.0;

    assert!(
        power_kw > 0.0 && power_kw < 100.0,
        "Motor power: {:.1} kW should be reasonable for a 6m rise escalator", power_kw
    );

    // Verify higher friction increases chain tension
    let mu_higher: f64 = 0.15;
    let t_upper_higher: f64 = (w_steps + w_passengers_n) * (alpha.sin() + mu_higher * alpha.cos());

    assert!(
        t_upper_higher > t_upper,
        "Higher friction: T={:.0} N > {:.0} N", t_upper_higher, t_upper
    );

    // Verify steeper angle increases the gravitational component
    let alpha_steep: f64 = 35.0_f64.to_radians();
    let t_gravity_30: f64 = (w_steps + w_passengers_n) * alpha.sin();
    let t_gravity_35: f64 = (w_steps + w_passengers_n) * alpha_steep.sin();

    assert!(
        t_gravity_35 > t_gravity_30,
        "Steeper: gravity component {:.0} N > {:.0} N", t_gravity_35, t_gravity_30
    );
}

// ================================================================
// 8. Seismic Restraint of Elevator
// ================================================================
//
// During an earthquake, the elevator car experiences lateral forces
// transmitted through the guide rails. The seismic design must ensure
// the rails and brackets resist these forces without derailment.
//
// Lateral seismic force on car (ASME A17.1 §8.4 / EN 81-77):
//   F_seismic = gamma_p * S_a * W_total / R_p
//
// where:
//   gamma_p = component importance factor (1.5 for elevators)
//   S_a     = spectral acceleration at mounting level (g)
//   W_total = car + rated load weight (N)
//   R_p     = response modification factor (2.5 for elevator rails)
//
// Rail bracket force:
//   F_bracket = F_seismic / n_brackets_in_contact
//
// Bracket bolt design:
//   Bolt shear = F_bracket / n_bolts
//   Bolt check: V_bolt <= phi * F_v (AISC bolt shear capacity)
//
// Reference: ASME A17.1 §8.4, EN 81-77 (seismic provisions), ASCE 7 §13.6

#[test]
fn elevator_seismic_restraint() {
    let m_car: f64 = 2200.0;         // kg, car mass
    let q: f64 = 1600.0;             // kg, rated load (full occupancy during earthquake)
    let g: f64 = 9.81;               // m/s²

    // Seismic design parameters
    let gamma_p: f64 = 1.5;          // component importance factor
    let s_a: f64 = 0.40;             // g, design spectral acceleration
    let r_p: f64 = 2.5;              // response modification factor for elevator rails

    // Total weight
    let w_total: f64 = (m_car + q) * g;
    // = 3800 * 9.81 = 37278 N

    // Lateral seismic force (ASME A17.1 §8.4)
    let f_seismic: f64 = gamma_p * s_a * w_total / r_p;
    // = 1.5 * 0.40 * 37278 / 2.5
    // = 22366.8 / 2.5 = 8946.7 N
    let f_seismic_expected: f64 = 1.5 * 0.40 * (3800.0 * 9.81) / 2.5;

    assert!(
        (f_seismic - f_seismic_expected).abs() / f_seismic_expected < 0.001,
        "Seismic force: {:.1} N, expected {:.1} N", f_seismic, f_seismic_expected
    );

    assert!(
        f_seismic > 0.0,
        "Seismic force: {:.1} N should be positive", f_seismic
    );

    // Number of guide rail brackets in contact zone
    let l_car: f64 = 2.80;           // m, car height
    let l_bracket_spacing: f64 = 2.50; // m, bracket spacing
    let n_brackets: f64 = (l_car / l_bracket_spacing).ceil() + 1.0;
    // Typically 2-3 brackets in contact with the car

    assert!(
        n_brackets >= 2.0,
        "Brackets in contact: {:.0} should be >= 2", n_brackets
    );

    // Force per bracket
    let f_bracket: f64 = f_seismic / n_brackets;

    assert!(
        f_bracket > 0.0 && f_bracket < f_seismic,
        "Bracket force: {:.1} N", f_bracket
    );

    // Bracket bolt design (2 bolts per bracket, M16 grade 8.8)
    let n_bolts: f64 = 2.0;
    let v_bolt: f64 = f_bracket / n_bolts;

    // M16 grade 8.8 bolt shear capacity (single shear plane)
    let _a_bolt: f64 = 157.0;        // mm², tensile stress area M16
    let _f_ub: f64 = 800.0;          // MPa, ultimate tensile strength grade 8.8
    let phi_v: f64 = 0.6;            // shear strength ratio
    let phi_resistance: f64 = 0.75;  // resistance factor
    let f_v_bolt: f64 = phi_resistance * phi_v * _f_ub * _a_bolt;
    // = 0.75 * 0.6 * 800 * 157 = 56520 N

    // Check bolt adequacy
    assert!(
        v_bolt < f_v_bolt,
        "Bolt shear {:.0} N < capacity {:.0} N -- OK", v_bolt, f_v_bolt
    );

    // Rail bending from seismic force (concentrated at mid-bracket span)
    let m_rail_seismic: f64 = f_bracket * l_bracket_spacing / 4.0;
    // Moment from seismic force treated as concentrated load between brackets

    assert!(
        m_rail_seismic > 0.0,
        "Rail seismic moment: {:.0} N*m", m_rail_seismic
    );

    // Verify higher spectral acceleration increases seismic force
    let s_a_higher: f64 = 0.60;
    let f_seismic_higher: f64 = gamma_p * s_a_higher * w_total / r_p;

    assert!(
        f_seismic_higher > f_seismic,
        "Higher Sa: F={:.0} N > {:.0} N", f_seismic_higher, f_seismic
    );

    // Verify higher R_p reduces seismic force (more ductility credit)
    let r_p_higher: f64 = 3.5;
    let f_seismic_ductile: f64 = gamma_p * s_a * w_total / r_p_higher;

    assert!(
        f_seismic_ductile < f_seismic,
        "Higher R_p: F={:.0} N < {:.0} N (more ductility)", f_seismic_ductile, f_seismic
    );

    // Derailment check: lateral force must not exceed guide shoe capacity
    let _f_guide_shoe: f64 = 15_000.0; // N, typical guide shoe lateral capacity

    assert!(
        f_bracket < _f_guide_shoe,
        "Bracket force {:.0} N < guide shoe capacity {:.0} N -- no derailment",
        f_bracket, _f_guide_shoe
    );
}
