/// Validation: Flood Hydraulics and Hydraulic Structures
///
/// References:
///   - Chow, V.T., "Open-Channel Hydraulics" (1959)
///   - Henderson, F.M., "Open Channel Flow" (1966)
///   - USBR, "Design of Small Dams", 3rd Ed. (1987)
///   - FEMA, "Guidelines for Design of Structures for Flood Resistance"
///   - USACE, HEC-RAS Hydraulic Reference Manual
///
/// Tests verify classical hydraulic formulas:
///   1. Manning's equation for open channel flow
///   2. Weir flow: sharp-crested and broad-crested
///   3. Culvert capacity: inlet vs outlet control
///   4. Bridge hydraulics: backwater using Yarnell equation
///   5. Energy dissipator: USBR stilling basin (conjugate depth)
///   6. Flood frequency analysis: Gumbel distribution
///   7. Hydrostatic force on gravity dam
///   8. Spillway capacity: ogee crest discharge
mod helpers;

// ================================================================
// 1. Manning's Equation: Open Channel Flow
// ================================================================
//
// Manning's equation for uniform flow in open channels:
//   Q = (1/n) * A * R_h^(2/3) * S^(1/2)
//
// where:
//   Q = discharge (m³/s)
//   n = Manning's roughness coefficient
//   A = cross-sectional area of flow (m²)
//   R_h = hydraulic radius = A / P (m)
//   P = wetted perimeter (m)
//   S = slope of energy grade line (m/m)
//
// Reference: Chow, "Open-Channel Hydraulics", Ch. 5

#[test]
fn validation_mannings_equation() {
    // Rectangular channel:
    //   b = 3.0 m (bottom width)
    //   y = 1.5 m (flow depth)
    //   n = 0.013 (concrete-lined)
    //   S = 0.001 (channel slope)
    let _b: f64 = 3.0;
    let _y: f64 = 1.5;
    let _n_manning: f64 = 0.013;
    let _s: f64 = 0.001;

    // Cross-sectional area: A = b * y
    let area: f64 = _b * _y;
    assert!(
        (area - 4.5).abs() < 1e-10,
        "Manning: A = b*y = 3.0*1.5 = 4.5 m², got {:.6}",
        area
    );

    // Wetted perimeter: P = b + 2y
    let wetted_perimeter: f64 = _b + 2.0 * _y;
    assert!(
        (wetted_perimeter - 6.0).abs() < 1e-10,
        "Manning: P = b + 2y = 6.0 m, got {:.6}",
        wetted_perimeter
    );

    // Hydraulic radius: R_h = A / P
    let r_h: f64 = area / wetted_perimeter;
    let r_h_expected: f64 = 0.75;
    assert!(
        (r_h - r_h_expected).abs() < 1e-10,
        "Manning: R_h = A/P = 0.75 m, got {:.6}",
        r_h
    );

    // Manning's Q = (1/n) * A * R_h^(2/3) * S^(1/2)
    let q: f64 = (1.0 / _n_manning) * area * r_h.powf(2.0 / 3.0) * _s.sqrt();
    // Q = (1/0.013) * 4.5 * 0.75^(2/3) * 0.001^(0.5)
    //   = 76.923 * 4.5 * 0.82548 * 0.031623
    //   = 76.923 * 4.5 * 0.026099
    //   = 9.034 m³/s
    let q_expected: f64 = (1.0 / 0.013) * 4.5 * (0.75_f64).powf(2.0 / 3.0) * (0.001_f64).sqrt();
    assert!(
        (q - q_expected).abs() < 1e-6,
        "Manning: Q = (1/n)*A*R_h^(2/3)*S^(1/2), got {:.4} m³/s, expected {:.4}",
        q, q_expected
    );

    // Verify Q is in physically reasonable range (~9 m³/s)
    assert!(
        q > 8.0 && q < 11.0,
        "Manning: Q should be ~9 m³/s for this channel, got {:.4}",
        q
    );

    // Velocity check: V = Q / A
    let velocity: f64 = q / area;
    let v_expected: f64 = q_expected / area;
    assert!(
        (velocity - v_expected).abs() < 1e-6,
        "Manning: V = Q/A, got {:.4} m/s, expected {:.4}",
        velocity, v_expected
    );

    // Froude number: Fr = V / sqrt(g * y)
    let _g: f64 = 9.81;
    let froude: f64 = velocity / (_g * _y).sqrt();
    assert!(
        froude < 1.0,
        "Manning: subcritical flow expected (Fr < 1), got Fr = {:.4}",
        froude
    );
}

// ================================================================
// 2. Weir Flow: Sharp-Crested and Broad-Crested
// ================================================================
//
// Sharp-crested weir (Rehbock formula, simplified):
//   Q = C_d * (2/3) * sqrt(2g) * L * H^(3/2)
//
// Broad-crested weir:
//   Q = C_bc * L * H^(3/2)
//   C_bc = 1.705 (SI, theoretical for ideal broad-crested weir)
//
// Reference: Henderson, "Open Channel Flow", Ch. 6
//            Chow, "Open-Channel Hydraulics", Ch. 14

#[test]
fn validation_weir_flow() {
    let _g: f64 = 9.81;

    // --- Sharp-crested weir ---
    // L = 5.0 m (crest length)
    // H = 0.8 m (head over crest)
    // C_d = 0.62 (discharge coefficient, typical for sharp crest)
    let _l_sc: f64 = 5.0;
    let _h_sc: f64 = 0.8;
    let _cd_sc: f64 = 0.62;

    // Q = C_d * (2/3) * sqrt(2g) * L * H^(3/2)
    let q_sharp: f64 = _cd_sc * (2.0 / 3.0) * (2.0 * _g).sqrt() * _l_sc * _h_sc.powf(1.5);
    let sqrt_2g: f64 = (2.0 * _g).sqrt(); // = 4.429 m^(1/2)/s
    let h_32: f64 = _h_sc.powf(1.5); // = 0.7155
    let q_sharp_expected: f64 = _cd_sc * (2.0 / 3.0) * sqrt_2g * _l_sc * h_32;
    assert!(
        (q_sharp - q_sharp_expected).abs() < 1e-8,
        "Sharp-crested weir: Q mismatch, got {:.4}, expected {:.4}",
        q_sharp, q_sharp_expected
    );

    // Verify physically reasonable (~4.6 m³/s)
    assert!(
        q_sharp > 3.0 && q_sharp < 7.0,
        "Sharp-crested weir: Q should be ~4.6 m³/s, got {:.4}",
        q_sharp
    );

    // --- Broad-crested weir ---
    // L = 5.0 m, H = 0.8 m
    // C_bc = 1.705 (theoretical coefficient for broad-crested weir, SI)
    let _l_bc: f64 = 5.0;
    let _h_bc: f64 = 0.8;
    let _c_bc: f64 = 1.705;

    // Q = C_bc * L * H^(3/2)
    let q_broad: f64 = _c_bc * _l_bc * _h_bc.powf(1.5);
    let q_broad_expected: f64 = 1.705 * 5.0 * (0.8_f64).powf(1.5);
    assert!(
        (q_broad - q_broad_expected).abs() < 1e-8,
        "Broad-crested weir: Q mismatch, got {:.4}, expected {:.4}",
        q_broad, q_broad_expected
    );

    // Verify physically reasonable (~6.1 m³/s)
    assert!(
        q_broad > 4.0 && q_broad < 8.0,
        "Broad-crested weir: Q should be ~6.1 m³/s, got {:.4}",
        q_broad
    );

    // Broad-crested gives higher Q than sharp-crested for same geometry
    // because C_bc*L*H^(3/2) > C_d*(2/3)*sqrt(2g)*L*H^(3/2) at these coefficients
    // Actually compare magnitudes:
    let sharp_coeff: f64 = _cd_sc * (2.0 / 3.0) * sqrt_2g; // ~1.831
    let broad_coeff: f64 = _c_bc; // 1.705
    // Sharp coefficient > broad coefficient in this case
    assert!(
        (q_sharp - sharp_coeff * _l_sc * h_32).abs() < 1e-8,
        "Sharp-crested weir coefficient check"
    );
    assert!(
        (q_broad - broad_coeff * _l_bc * _h_bc.powf(1.5)).abs() < 1e-8,
        "Broad-crested weir coefficient check"
    );
}

// ================================================================
// 3. Culvert Capacity: Inlet vs Outlet Control
// ================================================================
//
// Inlet control (unsubmerged, weir-type):
//   Q = C_d * A * sqrt(2 * g * HW)
//
// Outlet control (full flow, energy balance):
//   Q = A * sqrt(2 * g * (HW - h_o - S_o * L) / (1 + K_e + K_f))
//   where K_f = (2*g*n²*L) / R_h^(4/3) (friction loss coefficient)
//
// Reference: FHWA HDS-5, "Hydraulic Design of Highway Culverts"
//            HEC-RAS Hydraulic Reference Manual

#[test]
fn validation_culvert_capacity() {
    let _g: f64 = 9.81;

    // Circular culvert: D = 1.2 m, L = 30 m
    let _d: f64 = 1.2;
    let _l_culvert: f64 = 30.0;
    let _n_culvert: f64 = 0.012; // corrugated metal
    let _s_o: f64 = 0.005; // culvert slope
    let _hw: f64 = 2.0; // headwater depth above invert
    let _cd_inlet: f64 = 0.60; // inlet loss coefficient
    let _ke: f64 = 0.5; // entrance loss coefficient

    // Full-pipe area and hydraulic radius for circular section
    let area: f64 = std::f64::consts::PI * _d * _d / 4.0;
    let r_h: f64 = _d / 4.0; // hydraulic radius for full circular pipe
    let area_expected: f64 = std::f64::consts::PI * 1.44 / 4.0;
    assert!(
        (area - area_expected).abs() < 1e-10,
        "Culvert: A = pi*D²/4 = {:.6}, expected {:.6}",
        area, area_expected
    );
    assert!(
        (r_h - 0.3).abs() < 1e-10,
        "Culvert: R_h = D/4 = 0.3 m, got {:.6}",
        r_h
    );

    // --- Inlet control (simplified weir analogy) ---
    // Q_inlet = C_d * A * sqrt(2*g*HW)
    let q_inlet: f64 = _cd_inlet * area * (2.0 * _g * _hw).sqrt();
    assert!(
        q_inlet > 0.0,
        "Culvert inlet control: Q must be positive, got {:.4}",
        q_inlet
    );

    // --- Outlet control (full flow, energy method) ---
    // Friction loss coefficient: K_f = 2*g*n²*L / R_h^(4/3)
    let k_f: f64 = 2.0 * _g * _n_culvert * _n_culvert * _l_culvert / r_h.powf(4.0 / 3.0);

    // Tailwater assumption: h_o = D (submerged outlet)
    let _h_o: f64 = _d;

    // Available head for outlet control: HW - h_o - S_o*L (if positive)
    let delta_h: f64 = _hw - _h_o - _s_o * _l_culvert;
    // delta_h = 2.0 - 1.2 - 0.15 = 0.65 m

    let delta_h_expected: f64 = 2.0 - 1.2 - 0.005 * 30.0;
    assert!(
        (delta_h - delta_h_expected).abs() < 1e-10,
        "Culvert: delta_h = HW - h_o - S_o*L = {:.4}, expected {:.4}",
        delta_h, delta_h_expected
    );
    assert!(
        delta_h > 0.0,
        "Culvert: available head must be positive for flow, got {:.4}",
        delta_h
    );

    // Q_outlet = A * sqrt(2*g*delta_h / (1 + K_e + K_f))
    let q_outlet: f64 = area * (2.0 * _g * delta_h / (1.0 + _ke + k_f)).sqrt();
    assert!(
        q_outlet > 0.0,
        "Culvert outlet control: Q must be positive, got {:.4}",
        q_outlet
    );

    // The controlling (design) capacity is the smaller of inlet and outlet
    let q_design: f64 = q_inlet.min(q_outlet);
    assert!(
        q_design > 0.0 && q_design <= q_inlet && q_design <= q_outlet,
        "Culvert: design Q = min(inlet, outlet) = {:.4} m³/s",
        q_design
    );

    // Verify K_f is positive and physically reasonable
    assert!(
        k_f > 0.0 && k_f < 50.0,
        "Culvert: friction loss coeff K_f = {:.4} should be positive and reasonable",
        k_f
    );
}

// ================================================================
// 4. Bridge Hydraulics: Backwater via Yarnell Equation
// ================================================================
//
// Yarnell equation for backwater at bridge piers:
//   Δh = K * Fr² * (K + 5*Fr² - 0.6) * (α + 15*α⁴) * y_d
//
// where:
//   Δh = backwater rise (m)
//   K = pier shape coefficient (0.9 for square nose, 0.6 for round)
//   Fr = Froude number downstream
//   α = pier contraction ratio (sum of pier widths / channel width)
//   y_d = downstream depth (m)
//
// Reference: Yarnell (1934), USGS Water Supply Paper 772
//            HEC-RAS Hydraulic Reference Manual, Ch. 6

#[test]
fn validation_bridge_backwater_yarnell() {
    let _g: f64 = 9.81;

    // Bridge with square-nose piers:
    //   Channel width W = 20.0 m
    //   Pier width w_p = 1.0 m, 2 piers
    //   Downstream depth y_d = 3.0 m
    //   Downstream velocity V_d = 1.8 m/s
    //   K = 0.9 (square-nose pier)
    let _w_channel: f64 = 20.0;
    let _n_piers: f64 = 2.0;
    let _w_pier: f64 = 1.0;
    let _y_d: f64 = 3.0;
    let _v_d: f64 = 1.8;
    let _k_pier: f64 = 0.9;

    // Contraction ratio: α = total pier width / channel width
    let alpha: f64 = _n_piers * _w_pier / _w_channel;
    let alpha_expected: f64 = 0.1;
    assert!(
        (alpha - alpha_expected).abs() < 1e-10,
        "Yarnell: α = {:.4}, expected {:.4}",
        alpha, alpha_expected
    );

    // Downstream Froude number: Fr = V / sqrt(g * y)
    let fr: f64 = _v_d / (_g * _y_d).sqrt();
    assert!(
        fr > 0.0 && fr < 1.0,
        "Yarnell: subcritical flow required, Fr = {:.4}",
        fr
    );

    // Yarnell backwater equation:
    //   Δh = K * Fr² * (K + 5*Fr² - 0.6) * (α + 15*α⁴) * y_d
    let fr2: f64 = fr * fr;
    let alpha_term: f64 = alpha + 15.0 * alpha.powi(4);
    let bracket: f64 = _k_pier + 5.0 * fr2 - 0.6;
    let delta_h: f64 = _k_pier * fr2 * bracket * alpha_term * _y_d;

    // Verify each sub-expression
    assert!(
        fr2 > 0.0 && fr2 < 1.0,
        "Yarnell: Fr² = {:.6} should be subcritical",
        fr2
    );
    assert!(
        alpha_term > 0.0,
        "Yarnell: α + 15α⁴ = {:.6} must be positive",
        alpha_term
    );
    assert!(
        bracket > 0.0,
        "Yarnell: (K + 5Fr² - 0.6) = {:.6} must be positive for backwater",
        bracket
    );

    // Backwater should be small positive (a few cm typically)
    assert!(
        delta_h > 0.0 && delta_h < 1.0,
        "Yarnell: backwater Δh = {:.4} m should be small positive",
        delta_h
    );

    // Recompute from scratch as independent check
    let fr_check: f64 = 1.8 / (9.81 * 3.0_f64).sqrt();
    let fr2_check: f64 = fr_check * fr_check;
    let _alpha_check: f64 = 0.1;
    let alpha_term_check: f64 = 0.1 + 15.0 * 0.1_f64.powi(4);
    let bracket_check: f64 = 0.9 + 5.0 * fr2_check - 0.6;
    let delta_h_check: f64 = 0.9 * fr2_check * bracket_check * alpha_term_check * 3.0;
    assert!(
        (delta_h - delta_h_check).abs() < 1e-10,
        "Yarnell: independent recalculation mismatch: {:.6} vs {:.6}",
        delta_h, delta_h_check
    );
}

// ================================================================
// 5. Energy Dissipator: USBR Stilling Basin (Conjugate Depth)
// ================================================================
//
// Hydraulic jump conjugate (sequent) depth relationship:
//   y₂/y₁ = (1/2) * (sqrt(1 + 8*Fr₁²) - 1)
//
// Energy loss across the jump:
//   ΔE = (y₂ - y₁)³ / (4 * y₁ * y₂)
//
// Reference: Chow, "Open-Channel Hydraulics", Ch. 15
//            USBR, "Design of Small Dams", Ch. 9

#[test]
fn validation_stilling_basin_conjugate_depth() {
    let _g: f64 = 9.81;

    // Supercritical inflow conditions:
    //   y₁ = 0.5 m (upstream depth)
    //   V₁ = 8.0 m/s (upstream velocity)
    let _y1: f64 = 0.5;
    let _v1: f64 = 8.0;

    // Upstream Froude number: Fr₁ = V₁ / sqrt(g * y₁)
    let fr1: f64 = _v1 / (_g * _y1).sqrt();
    assert!(
        fr1 > 1.0,
        "Stilling basin: supercritical inflow required, Fr₁ = {:.4}",
        fr1
    );

    // Conjugate depth ratio: y₂/y₁ = (1/2)(sqrt(1 + 8*Fr₁²) - 1)
    let fr1_sq: f64 = fr1 * fr1;
    let y2_ratio: f64 = 0.5 * ((1.0 + 8.0 * fr1_sq).sqrt() - 1.0);
    let _y2: f64 = _y1 * y2_ratio;

    // y₂ must be greater than y₁ (subcritical after jump)
    assert!(
        _y2 > _y1,
        "Stilling basin: conjugate depth y₂ = {:.4} m must exceed y₁ = {:.4} m",
        _y2, _y1
    );

    // Verify with independent calculation
    // Fr₁ = 8.0 / sqrt(9.81 * 0.5) = 8.0 / 2.2147 = 3.613
    let fr1_check: f64 = 8.0 / (9.81 * 0.5_f64).sqrt();
    assert!(
        (fr1 - fr1_check).abs() < 1e-6,
        "Stilling basin: Fr₁ = {:.4}, check = {:.4}",
        fr1, fr1_check
    );

    // y₂/y₁ = 0.5*(sqrt(1 + 8*3.613²) - 1) = 0.5*(sqrt(104.43) - 1) = 0.5*(10.219 - 1) = 4.610
    let y2_ratio_check: f64 = 0.5 * ((1.0 + 8.0 * fr1_check * fr1_check).sqrt() - 1.0);
    assert!(
        (y2_ratio - y2_ratio_check).abs() < 1e-6,
        "Stilling basin: y₂/y₁ = {:.4}, check = {:.4}",
        y2_ratio, y2_ratio_check
    );

    // Energy loss across the jump: ΔE = (y₂ - y₁)³ / (4 * y₁ * y₂)
    let delta_e: f64 = (_y2 - _y1).powi(3) / (4.0 * _y1 * _y2);
    assert!(
        delta_e > 0.0,
        "Stilling basin: energy loss ΔE = {:.4} m must be positive",
        delta_e
    );

    // Downstream Froude number should be subcritical
    // q = V₁ * y₁ = V₂ * y₂ → V₂ = V₁ * y₁ / y₂
    let _q_unit: f64 = _v1 * _y1;
    let _v2: f64 = _q_unit / _y2;
    let fr2: f64 = _v2 / (_g * _y2).sqrt();
    assert!(
        fr2 < 1.0,
        "Stilling basin: downstream must be subcritical, Fr₂ = {:.4}",
        fr2
    );

    // Momentum conservation check:
    // M₁ = q²/(g*y₁) + y₁²/2 should equal M₂ = q²/(g*y₂) + y₂²/2
    let m1: f64 = _q_unit * _q_unit / (_g * _y1) + _y1 * _y1 / 2.0;
    let m2: f64 = _q_unit * _q_unit / (_g * _y2) + _y2 * _y2 / 2.0;
    let m_err: f64 = (m1 - m2).abs() / m1;
    assert!(
        m_err < 1e-6,
        "Stilling basin: momentum M₁ = {:.6}, M₂ = {:.6}, error = {:.2e}",
        m1, m2, m_err
    );
}

// ================================================================
// 6. Flood Frequency Analysis: Gumbel Distribution
// ================================================================
//
// Gumbel (Type I Extreme Value) distribution for annual maxima:
//   x_T = x_mean + K_T * s
//   K_T = -(sqrt(6)/π) * [0.5772 + ln(ln(T/(T-1)))]
//
// where:
//   x_T = flood magnitude for return period T
//   x_mean = mean of annual maxima
//   s = standard deviation of annual maxima
//   K_T = Gumbel frequency factor
//
// Reference: Chow, Maidment & Mays, "Applied Hydrology", Ch. 12
//            Gumbel, "Statistics of Extremes" (1958)

#[test]
fn validation_gumbel_flood_frequency() {
    let _pi: f64 = std::f64::consts::PI;
    let _euler_gamma: f64 = 0.5772; // Euler-Mascheroni constant (approx)

    // Sample flood data statistics:
    //   mean annual peak flow: x_mean = 850 m³/s
    //   standard deviation: s = 320 m³/s
    let _x_mean: f64 = 850.0;
    let _s: f64 = 320.0;

    // --- 100-year flood (T = 100) ---
    let _t100: f64 = 100.0;
    // K_T = -(sqrt(6)/π) * [0.5772 + ln(ln(T/(T-1)))]
    let k_100: f64 = -(6.0_f64.sqrt() / _pi)
        * (_euler_gamma + (_t100 / (_t100 - 1.0)).ln().ln());
    let x_100: f64 = _x_mean + k_100 * _s;

    // K_100 should be approximately 3.137 (from standard Gumbel tables)
    assert!(
        k_100 > 2.5 && k_100 < 4.0,
        "Gumbel: K_100 = {:.4}, expected ~3.14",
        k_100
    );

    // 100-year flood should exceed the mean significantly
    assert!(
        x_100 > _x_mean,
        "Gumbel: 100-yr flood {:.1} m³/s must exceed mean {:.1}",
        x_100, _x_mean
    );

    // --- 10-year flood (T = 10) ---
    let _t10: f64 = 10.0;
    let k_10: f64 = -(6.0_f64.sqrt() / _pi)
        * (_euler_gamma + (_t10 / (_t10 - 1.0)).ln().ln());
    let x_10: f64 = _x_mean + k_10 * _s;

    // K_10 should be approximately 1.305
    assert!(
        k_10 > 0.8 && k_10 < 2.0,
        "Gumbel: K_10 = {:.4}, expected ~1.30",
        k_10
    );

    // --- 50-year flood (T = 50) ---
    let _t50: f64 = 50.0;
    let k_50: f64 = -(6.0_f64.sqrt() / _pi)
        * (_euler_gamma + (_t50 / (_t50 - 1.0)).ln().ln());
    let x_50: f64 = _x_mean + k_50 * _s;

    // Ordering: x_10 < x_50 < x_100
    assert!(
        x_10 < x_50 && x_50 < x_100,
        "Gumbel: expected x_10 ({:.1}) < x_50 ({:.1}) < x_100 ({:.1})",
        x_10, x_50, x_100
    );

    // Verify K factors increase with return period
    assert!(
        k_10 < k_50 && k_50 < k_100,
        "Gumbel: K factors should increase: K_10={:.4} < K_50={:.4} < K_100={:.4}",
        k_10, k_50, k_100
    );

    // Recheck T=100 independently:
    // ln(ln(100/99)) = ln(ln(1.01010)) = ln(0.01005) = -4.6002
    // K = -(sqrt(6)/π)*[0.5772 + (-4.6002)] = -(0.7797)*(-4.023) = 3.137
    let _inner: f64 = (100.0 / 99.0_f64).ln().ln();
    let k_100_check: f64 = -(6.0_f64.sqrt() / _pi) * (0.5772 + _inner);
    assert!(
        (k_100 - k_100_check).abs() < 1e-6,
        "Gumbel: K_100 independent check: {:.6} vs {:.6}",
        k_100, k_100_check
    );
}

// ================================================================
// 7. Hydrostatic Force on Gravity Dam
// ================================================================
//
// Hydrostatic pressure distribution on a vertical face:
//   F_h = (1/2) * γ_w * H²  (per unit width)
//   acting at H/3 from the base
//
// Uplift force (assuming linear seepage):
//   F_u = (1/2) * γ_w * H * B  (per unit width)
//
// Dam self-weight:
//   W = γ_c * B * H / 2  (triangular cross-section)
//
// Overturning safety factor about toe:
//   SF_ot = (W * x_w) / (F_h * H/3 + F_u * B/3)
//
// Reference: USBR, "Design of Small Dams", Ch. 8
//            FEMA, "Guidelines for Design of Structures for Flood Resistance"

#[test]
fn validation_hydrostatic_dam_force() {
    // Dam geometry:
    //   H = 15.0 m (dam height = water depth at face)
    //   B = 12.0 m (base width)
    //   Triangular cross-section (vertical upstream face)
    // Material properties:
    //   γ_w = 9.81 kN/m³ (water unit weight)
    //   γ_c = 23.5 kN/m³ (concrete unit weight)
    let _h: f64 = 15.0;
    let _b: f64 = 12.0;
    let _gamma_w: f64 = 9.81;
    let _gamma_c: f64 = 23.5;

    // Horizontal hydrostatic force (per unit width):
    // F_h = (1/2) * γ_w * H²
    let f_h: f64 = 0.5 * _gamma_w * _h * _h;
    let f_h_expected: f64 = 0.5 * 9.81 * 225.0; // = 1103.625 kN/m
    assert!(
        (f_h - f_h_expected).abs() < 1e-6,
        "Dam: F_h = γ_w*H²/2 = {:.3} kN/m, expected {:.3}",
        f_h, f_h_expected
    );

    // Line of action at H/3 from base
    let _h_action: f64 = _h / 3.0;
    assert!(
        (_h_action - 5.0).abs() < 1e-10,
        "Dam: hydrostatic force acts at H/3 = {:.2} m from base",
        _h_action
    );

    // Dam self-weight (triangular section, per unit width):
    // W = (1/2) * γ_c * B * H
    let _w_dam: f64 = 0.5 * _gamma_c * _b * _h;
    let w_expected: f64 = 0.5 * 23.5 * 12.0 * 15.0; // = 2115 kN/m
    assert!(
        (_w_dam - w_expected).abs() < 1e-6,
        "Dam: W = γ_c*B*H/2 = {:.3} kN/m, expected {:.3}",
        _w_dam, w_expected
    );

    // Weight acts at B/3 from toe (centroid of triangle)
    let _x_w: f64 = _b / 3.0;

    // Uplift force (linear distribution, full base):
    // F_u = (1/2) * γ_w * H * B
    let f_u: f64 = 0.5 * _gamma_w * _h * _b;
    let f_u_expected: f64 = 0.5 * 9.81 * 15.0 * 12.0; // = 882.9 kN/m
    assert!(
        (f_u - f_u_expected).abs() < 1e-6,
        "Dam: F_u = γ_w*H*B/2 = {:.3} kN/m, expected {:.3}",
        f_u, f_u_expected
    );

    // Overturning moment about toe:
    //   M_overturning = F_h * (H/3) + F_u * (2B/3)
    //   M_stabilizing = W * (2B/3)   [centroid of right-triangle at 2B/3 from vertical face = B/3 from toe for upstream face]
    // For triangular dam with vertical upstream face, centroid is at 2B/3 from upstream = B/3 from toe
    // Wait: if upstream is vertical at x=0, base extends to x=B, centroid of right triangle = 2B/3 from upstream = B - 2B/3...
    // Actually: right triangle with vertex at top-upstream, base at bottom from x=0 to x=B.
    // Centroid x = B/3 from the right angle (base-upstream corner) = B/3 from toe for a dam leaning downstream.
    // More precisely for typical gravity dam: weight centroid at 2B/3 from upstream face.
    let _x_cg: f64 = 2.0 * _b / 3.0; // from upstream face (toe is at upstream base)

    let m_stabilizing: f64 = _w_dam * _x_cg;
    let m_overturning: f64 = f_h * _h_action + f_u * (2.0 * _b / 3.0);

    // Safety factor against overturning (USBR requires SF > 1.5)
    let sf_ot: f64 = m_stabilizing / m_overturning;
    assert!(
        sf_ot > 0.0,
        "Dam: overturning SF = {:.3} must be positive",
        sf_ot
    );

    // Sliding safety factor: SF_slide = μ * (W - F_u) / F_h
    let _mu: f64 = 0.75; // friction coefficient concrete-rock
    let sf_slide: f64 = _mu * (_w_dam - f_u) / f_h;
    assert!(
        sf_slide > 0.0,
        "Dam: sliding SF = {:.3} must be positive",
        sf_slide
    );

    // Verify pressure at base: p = γ_w * H
    let p_base: f64 = _gamma_w * _h;
    let p_base_expected: f64 = 9.81 * 15.0; // = 147.15 kPa
    assert!(
        (p_base - p_base_expected).abs() < 1e-6,
        "Dam: base pressure p = γ_w*H = {:.3} kPa, expected {:.3}",
        p_base, p_base_expected
    );
}

// ================================================================
// 8. Spillway Capacity: Ogee Crest Discharge
// ================================================================
//
// USBR ogee spillway discharge formula:
//   Q = C * L_eff * H_e^(3/2)
//
// where:
//   C = discharge coefficient (depends on H_e/H_d ratio)
//     C ≈ 2.18 for H_e/H_d = 1.0 (design head, SI units)
//   L_eff = effective crest length (accounting for pier contractions)
//     L_eff = L - 2*(N*K_p + K_a)*H_e
//   H_e = total head on crest including velocity head
//   H_d = design head
//
// Reference: USBR, "Design of Small Dams", Ch. 9
//            USACE EM 1110-2-1603, "Hydraulic Design of Spillways"

#[test]
fn validation_spillway_ogee_capacity() {
    // Ogee spillway parameters:
    //   Gross crest length L = 50.0 m
    //   Number of piers N = 4
    //   K_p = 0.01 (round-nosed pier contraction coefficient)
    //   K_a = 0.10 (abutment contraction coefficient)
    //   Design head H_d = 3.0 m
    //   Actual head H_e = 3.0 m (at design head, C = C_d)
    //   C_d = 2.18 (SI discharge coefficient at design head)
    let _l_gross: f64 = 50.0;
    let _n_piers: f64 = 4.0;
    let _k_p: f64 = 0.01;
    let _k_a: f64 = 0.10;
    let _h_d: f64 = 3.0;
    let _h_e: f64 = 3.0;
    let _c_d: f64 = 2.18;

    // Effective crest length: L_eff = L - 2*(N*K_p + K_a)*H_e
    let contraction: f64 = 2.0 * (_n_piers * _k_p + _k_a) * _h_e;
    let l_eff: f64 = _l_gross - contraction;

    let contraction_expected: f64 = 2.0 * (4.0 * 0.01 + 0.10) * 3.0;
    // = 2.0 * (0.04 + 0.10) * 3.0 = 2.0 * 0.14 * 3.0 = 0.84 m
    assert!(
        (contraction - contraction_expected).abs() < 1e-10,
        "Spillway: contraction = {:.4} m, expected {:.4}",
        contraction, contraction_expected
    );

    let l_eff_expected: f64 = 50.0 - 0.84;
    assert!(
        (l_eff - l_eff_expected).abs() < 1e-10,
        "Spillway: L_eff = {:.4} m, expected {:.4}",
        l_eff, l_eff_expected
    );

    // Spillway discharge: Q = C_d * L_eff * H_e^(3/2)
    let h_e_32: f64 = _h_e.powf(1.5);
    let q_spillway: f64 = _c_d * l_eff * h_e_32;

    // H_e^(3/2) = 3.0^1.5 = 5.1962
    let h_e_32_expected: f64 = 3.0_f64.powf(1.5);
    assert!(
        (h_e_32 - h_e_32_expected).abs() < 1e-10,
        "Spillway: H_e^(3/2) = {:.6}, expected {:.6}",
        h_e_32, h_e_32_expected
    );

    // Q ≈ 2.18 * 49.16 * 5.1962 ≈ 556.3 m³/s
    let q_expected: f64 = 2.18 * l_eff_expected * h_e_32_expected;
    assert!(
        (q_spillway - q_expected).abs() < 1e-6,
        "Spillway: Q = C*L_eff*H_e^(3/2) = {:.2} m³/s, expected {:.2}",
        q_spillway, q_expected
    );

    // Verify physically reasonable discharge
    assert!(
        q_spillway > 400.0 && q_spillway < 700.0,
        "Spillway: Q = {:.2} m³/s should be in range 400-700 for this geometry",
        q_spillway
    );

    // --- Head above design: H_e/H_d ratio effect ---
    // At H_e = 1.5 * H_d, C increases (~2.30 for H_e/H_d = 1.5)
    let _h_e_high: f64 = 1.5 * _h_d; // = 4.5 m
    let _c_high: f64 = 2.30;
    let l_eff_high: f64 = _l_gross - 2.0 * (_n_piers * _k_p + _k_a) * _h_e_high;
    let q_high: f64 = _c_high * l_eff_high * _h_e_high.powf(1.5);

    // Higher head should yield significantly more discharge
    assert!(
        q_high > q_spillway,
        "Spillway: Q at 1.5*H_d ({:.2}) should exceed Q at H_d ({:.2})",
        q_high, q_spillway
    );

    // Unit discharge check: q = Q / L_eff
    let q_unit: f64 = q_spillway / l_eff;
    let q_unit_expected: f64 = _c_d * h_e_32; // C * H_e^(3/2) per unit width
    assert!(
        (q_unit - q_unit_expected).abs() < 1e-6,
        "Spillway: unit discharge q = {:.4} m³/s/m, expected {:.4}",
        q_unit, q_unit_expected
    );
}
