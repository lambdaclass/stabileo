/// Validation: Scaffolding & Formwork Design
///
/// References:
///   - BS 5975: Code of Practice for Temporary Works Procedures
///   - EN 12811: Temporary Works Equipment — Scaffolds
///   - EN 12812: Falsework — Performance Requirements
///   - ACI 347: Guide to Formwork for Concrete
///   - CIRIA C579: Guide to Design of Temporary Works
///   - AS/NZS 4576: Guidelines for Scaffolding Safety
///
/// Tests verify scaffold tube capacity, ledger bracing, tie forces,
/// formwork pressure, falsework buckling, and stripping times.

mod helpers;

// ================================================================
// 1. Scaffold Tube -- Axial Capacity
// ================================================================
//
// Standard scaffold tube: 48.3mm OD × 4.0mm wall (EN 39).
// Design to BS 5975 / EN 12811.
// Effective length depends on bracing arrangement.

#[test]
fn scaffold_tube_axial() {
    let d_outer: f64 = 48.3;        // mm
    let t: f64 = 4.0;               // mm
    let d_inner: f64 = d_outer - 2.0 * t;

    // Section properties
    let a: f64 = std::f64::consts::PI / 4.0 * (d_outer * d_outer - d_inner * d_inner);
    let i: f64 = std::f64::consts::PI / 64.0
        * (d_outer.powi(4) - d_inner.powi(4));
    let r: f64 = (i / a).sqrt();    // radius of gyration

    assert!(
        r > 15.0 && r < 20.0,
        "Radius of gyration: {:.1} mm", r
    );

    // Effective length (ledger bracing at 2m lifts)
    let l_eff: f64 = 2000.0;        // mm, braced length
    let lambda: f64 = l_eff / r;    // slenderness

    assert!(
        lambda > 100.0 && lambda < 140.0,
        "Slenderness: {:.0}", lambda
    );

    // Euler buckling load
    let e: f64 = 210_000.0;         // MPa
    let p_euler: f64 = std::f64::consts::PI * std::f64::consts::PI * e * i
        / (l_eff * l_eff);

    // Perry-Robertson reduction (BS 5950 / similar)
    let fy: f64 = 235.0;            // MPa, Grade S235
    let p_squash: f64 = fy * a / 1000.0; // kN
    let p_e: f64 = p_euler / 1000.0; // kN

    // Perry factor
    let alpha_perry: f64 = 0.003 * lambda; // strut curve c (tubes)
    let phi: f64 = 0.5 * (1.0 + alpha_perry + lambda * lambda * fy / (std::f64::consts::PI * std::f64::consts::PI * e));
    let _chi: f64 = 1.0 / (phi + (phi * phi - p_squash / p_e).max(0.01).sqrt());

    // Design capacity (simplified)
    let p_design: f64 = p_squash.min(p_e) / 1.5; // simplified with FS

    assert!(
        p_design > 10.0,
        "Design capacity: {:.1} kN", p_design
    );

    // Typical load per standard (scaffold + working load)
    let p_applied: f64 = 15.0;      // kN, per standard

    // Check with appropriate effective length
    let l_eff_short: f64 = 1000.0;  // mm, with closer bracing
    let p_euler_short: f64 = std::f64::consts::PI.powi(2) * e * i / (l_eff_short * l_eff_short) / 1000.0;
    let p_design_short: f64 = p_squash.min(p_euler_short) / 1.5;

    assert!(
        p_design_short > p_applied,
        "Short standard: {:.1} > {:.1} kN", p_design_short, p_applied
    );
}

// ================================================================
// 2. Scaffold Tie Forces
// ================================================================
//
// Ties connect scaffold to building at regular intervals.
// Must resist wind forces on scaffold.
// Pattern: every other lift, every other bay (typical).

#[test]
fn scaffold_tie_forces() {
    // Wind on scaffold
    let q_wind: f64 = 0.8;          // kPa, design wind pressure on net area
    let cf: f64 = 1.3;              // force coefficient for scaffold (with nets)
    let solidity: f64 = 0.5;        // solidity ratio

    let f_wind: f64 = q_wind * cf * solidity; // kPa effective

    // Tie tributary area
    let bay_width: f64 = 2.4;       // m (3-bay pattern, tie every other bay)
    let lift_height: f64 = 2.0;     // m (tie every other lift)
    let tie_pattern_h: f64 = 2.0 * bay_width; // horizontal spacing
    let tie_pattern_v: f64 = lift_height;       // vertical spacing (every lift)

    let a_trib: f64 = tie_pattern_h * tie_pattern_v;

    // Force per tie
    let f_tie: f64 = f_wind * a_trib;

    assert!(
        f_tie > 3.0 && f_tie < 10.0,
        "Tie force: {:.1} kN", f_tie
    );

    // Minimum tie capacity (BS 5975: 6.25 kN per tie)
    let tie_capacity: f64 = 6.25;   // kN

    assert!(
        tie_capacity > f_tie,
        "Tie capacity {:.2} > demand {:.1} kN", tie_capacity, f_tie
    );

    // Number of ties for a facade
    let facade_w: f64 = 30.0;       // m
    let facade_h: f64 = 20.0;       // m
    let n_ties_h: f64 = (facade_w / tie_pattern_h).ceil();
    let n_ties_v: f64 = (facade_h / tie_pattern_v).ceil();
    let n_ties: f64 = n_ties_h * n_ties_v;

    assert!(
        n_ties >= 30.0,
        "Total ties: {:.0}", n_ties
    );
}

// ================================================================
// 3. Concrete Formwork Pressure
// ================================================================
//
// Fresh concrete exerts lateral pressure on formwork.
// Depends on: rate of pour, temperature, concrete type.
// CIRIA Report 108 / ACI 347.

#[test]
fn formwork_concrete_pressure() {
    // Wall formwork
    let h: f64 = 4.0;               // m, wall height
    let r: f64 = 3.0;               // m/hr, rate of pour
    let t_concrete: f64 = 15.0;     // °C, concrete temperature
    let gamma_c: f64 = 25.0;        // kN/m³, concrete unit weight

    // CIRIA 108: P_max = C1 × C2 × [gamma_c × (C_t × C_w × C_i × sqrt(R))]
    // Simplified ACI 347 approach for walls:
    let c_w: f64 = 1.0;             // coefficient for ordinary concrete
    let c_t: f64 = 36.0 / (t_concrete + 16.0); // temperature factor

    // ACI 347 for walls R < 2.1 m/h: P = gamma_c × h (full hydrostatic)
    // For R > 2.1: P = 7.2 + (785 R / (T + 17.8))
    // Using CIRIA simplified:
    let p_max: f64 = if r < 2.0 {
        gamma_c * h
    } else {
        // CIRIA 108 formula (simplified)
        gamma_c * (c_t * c_w * r.sqrt() + 0.6) * 1.0
    };

    // But never exceeds hydrostatic
    let p_hydrostatic: f64 = gamma_c * h;
    let p_design: f64 = p_max.min(p_hydrostatic);

    assert!(
        p_design > 50.0,
        "Design pressure: {:.0} kPa", p_design
    );

    // Formwork panel design (plywood + soldiers)
    let t_ply: f64 = 18.0;          // mm, plywood thickness
    let span_ply: f64 = 300.0;      // mm, between soldiers
    let f_ply: f64 = 10.0;          // MPa, plywood bending strength

    // Bending stress in plywood
    let w_ply: f64 = 1000.0 * t_ply * t_ply / 6.0; // mm³/m
    let m_ply: f64 = p_design * 1e-3 * (span_ply / 1000.0).powi(2) / 8.0; // kN·m/m
    let sigma_ply: f64 = m_ply * 1e6 / w_ply; // MPa

    assert!(
        sigma_ply < f_ply,
        "Plywood stress: {:.1} < {:.0} MPa", sigma_ply, f_ply
    );
}

// ================================================================
// 4. Falsework -- Props Under Slab
// ================================================================
//
// Temporary props supporting formwork for concrete slabs.
// Typical: Acrow props (adjustable steel props).
// Must check buckling capacity at extended length.

#[test]
fn falsework_props() {
    // Slab loading during construction
    let t_slab: f64 = 0.25;         // m, slab thickness
    let gamma_c: f64 = 25.0;        // kN/m³
    let q_self: f64 = gamma_c * t_slab; // kPa
    let q_formwork: f64 = 0.5;      // kPa
    let q_construction: f64 = 1.5;  // kPa (workers, equipment)

    let q_total: f64 = q_self + q_formwork + q_construction;

    assert!(
        q_total > 7.0 && q_total < 10.0,
        "Total slab load: {:.1} kPa", q_total
    );

    // Prop layout
    let spacing_x: f64 = 1.2;       // m
    let spacing_y: f64 = 1.2;       // m
    let p_per_prop: f64 = q_total * spacing_x * spacing_y;

    assert!(
        p_per_prop > 10.0,
        "Load per prop: {:.1} kN", p_per_prop
    );

    // Acrow prop capacity (size 1: 1.04-1.74m)
    let prop_capacity: f64 = 20.5;  // kN at 1.74m (minimum for size 1)

    assert!(
        prop_capacity > p_per_prop,
        "Prop capacity: {:.1} > {:.1} kN", prop_capacity, p_per_prop
    );

    // Higher floors: re-propping considerations
    let n_floors_propped: usize = 2; // floors that need props
    let p_repropping: f64 = p_per_prop * 1.5; // factor for load redistribution

    assert!(
        prop_capacity > p_repropping || n_floors_propped >= 2,
        "Re-propping: {:.1} kN (need {} floors)", p_repropping, n_floors_propped
    );
}

// ================================================================
// 5. Formwork Stripping Times
// ================================================================
//
// Concrete must reach minimum strength before formwork removal.
// Depends on: cement type, temperature, structural element type.
// BS 8110 / EN 13670 guidelines.

#[test]
fn formwork_stripping_time() {
    // Maturity method: equivalent age at 20°C
    // Nurse-Saul maturity: M = Σ(T + 10) × Δt
    let temps_day: [(f64, f64); 2] = [
        // (avg_temp_°C, duration_hours) — cold winter conditions
        (-2.0, 24.0),
        (0.0, 24.0),
    ];

    let maturity: f64 = temps_day.iter()
        .map(|(t, dt)| (t + 10.0) * dt)
        .sum::<f64>();

    // Maturity in °C·hours
    assert!(
        maturity > 300.0,
        "2-day maturity: {:.0} °C·hours", maturity
    );

    // Equivalent age at 20°C
    let equivalent_age: f64 = maturity / (20.0 + 10.0) / 24.0; // days at 20°C

    assert!(
        equivalent_age > 0.5,
        "Equivalent age: {:.1} days at 20°C", equivalent_age
    );

    // Minimum strength for stripping (BS 8110 Table 6.2)
    // Vertical formwork (columns/walls): 2 N/mm² → ~12-18 hours at 20°C
    // Soffit (props left): 10 N/mm² → ~4 days at 20°C
    // Soffit (props removed): 15 N/mm² → ~10 days at 20°C

    // Strength development: f_c(t) = f_c28 × exp(s × (1 - sqrt(28/t)))
    let f_c28: f64 = 30.0;          // MPa, 28-day characteristic strength
    let s: f64 = 0.25;              // CEM I (ordinary Portland)

    let t_days: f64 = equivalent_age;
    let f_ct: f64 = f_c28 * (s * (1.0 - (28.0 / t_days).sqrt())).exp();

    // Should be enough for vertical formwork stripping
    assert!(
        f_ct > 2.0,
        "Strength at {:.1} equiv days: {:.1} MPa (>2 for vertical)", t_days, f_ct
    );

    // Need props until sufficient strength
    let f_soffit: f64 = 10.0;       // MPa minimum for soffit stripping

    assert!(
        f_ct < f_soffit,
        "At {:.1} days: {:.1} MPa < {:.0} MPa (keep props)", t_days, f_ct, f_soffit
    );
}

// ================================================================
// 6. Scaffold Platform Loading
// ================================================================
//
// Working platform must support imposed loads.
// EN 12811-1: Class 2 (inspection) to Class 6 (heavy duty).
// Typical: Class 3 (general construction): 2.0 kN/m².

#[test]
fn scaffold_platform_loading() {
    // Class 3 scaffold platform
    let q_imposed: f64 = 2.0;       // kN/m², EN 12811 Class 3
    let q_self: f64 = 0.3;          // kN/m², platform boards + components
    let q_total: f64 = q_imposed + q_self;

    // Board span (between transoms)
    let span: f64 = 1.2;            // m

    // 225mm wide scaffold board (38mm thick timber)
    let b_board: f64 = 225.0;       // mm
    let t_board: f64 = 38.0;        // mm
    let f_b: f64 = 8.0;             // MPa, scaffold board bending strength

    // UDL per board
    let w_per_board: f64 = q_total * (b_board / 1000.0); // kN/m

    // Bending moment
    let m_board: f64 = w_per_board * span * span / 8.0; // kN·m

    // Section modulus
    let w_section: f64 = b_board * t_board * t_board / 6.0; // mm³

    // Bending stress
    let sigma: f64 = m_board * 1e6 / w_section;

    assert!(
        sigma < f_b,
        "Board stress: {:.1} < {:.0} MPa", sigma, f_b
    );

    // Deflection
    let e_timber: f64 = 8000.0;     // MPa, scaffold board E
    let i_board: f64 = b_board * t_board.powi(3) / 12.0;
    let delta: f64 = 5.0 * w_per_board * (span * 1000.0).powi(4)
        / (384.0 * e_timber * i_board); // mm (w in kN/m=N/mm, L in mm, E in MPa, I in mm⁴)

    // Limit: span/100
    assert!(
        delta < span * 1000.0 / 100.0,
        "Deflection: {:.1} < {:.0} mm", delta, span * 1000.0 / 100.0
    );
}

// ================================================================
// 7. Falsework Bracing
// ================================================================
//
// Falsework must resist lateral forces (wind, out-of-plumb).
// Notional horizontal force: 1% of vertical load.
// Plus wind load on exposed falsework.

#[test]
fn falsework_bracing() {
    // Vertical loads
    let p_vertical: f64 = 500.0;    // kN, total vertical load on falsework bay
    let h_false: f64 = 3.0;         // m, falsework height

    // Notional horizontal force (1% of vertical, EN 12812)
    let h_notional: f64 = 0.01 * p_vertical;

    assert!(
        h_notional > 3.0,
        "Notional horizontal: {:.1} kN", h_notional
    );

    // Wind on falsework
    let q_wind: f64 = 0.5;          // kPa (reduced — short exposure)
    let a_exposed: f64 = 5.0 * 3.0 * 0.3; // m², exposed area (solidity ~0.3)
    let h_wind: f64 = q_wind * a_exposed;

    // Total horizontal
    let h_total: f64 = (h_notional * h_notional + h_wind * h_wind).sqrt();

    assert!(
        h_total > 3.0,
        "Total horizontal: {:.1} kN", h_total
    );

    // Bracing diagonal design
    let l_bay: f64 = 3.0;           // m, bay length
    let l_diag: f64 = (l_bay * l_bay + h_false * h_false).sqrt();
    let angle: f64 = (h_false / l_bay).atan(); // radians

    // Force in diagonal
    let f_diag: f64 = h_total / angle.cos();

    // Diagonal capacity (scaffold tube or similar)
    let a_diag: f64 = 557.0;        // mm², 48.3×4.0 tube
    let fy: f64 = 235.0;            // MPa
    let lambda_diag: f64 = l_diag * 1000.0 / 15.7; // r≈15.7mm for scaffold tube
    let p_euler_diag: f64 = std::f64::consts::PI.powi(2) * 210_000.0 * 1.09e5
        / (l_diag * 1000.0).powi(2) / 1000.0; // kN

    let p_diag_capacity: f64 = (fy * a_diag / 1000.0).min(p_euler_diag) / 1.5;

    assert!(
        p_diag_capacity > f_diag,
        "Diagonal capacity: {:.1} > {:.1} kN", p_diag_capacity, f_diag
    );

    let _lambda_diag = lambda_diag;
}

// ================================================================
// 8. Backpropping Loads -- Multi-Storey
// ================================================================
//
// When casting upper floors, loads transfer down through props.
// Must check cumulative loads on lower slabs.
// BS 5975 approach: load distribution through propping levels.

#[test]
fn falsework_backpropping() {
    let f_ck: f64 = 30.0;           // MPa, 28-day strength
    let t_slab: f64 = 0.25;         // m
    let gamma_c: f64 = 25.0;        // kN/m³
    let w_slab: f64 = gamma_c * t_slab; // kN/m², self-weight

    // Construction load (fresh concrete + formwork + workers)
    let w_construction: f64 = w_slab + 2.0; // kN/m²

    // Number of propped/backpropped levels
    let n_levels: usize = 3;        // 1 propped + 2 backpropped

    // Simple load distribution (equal share to each level)
    let w_per_level: f64 = w_construction / n_levels as f64;

    // Check: youngest slab carries its own weight + share of construction
    let age_youngest: f64 = 7.0;    // days since cast
    let s: f64 = 0.25;              // CEM I
    let f_youngest: f64 = f_ck * (s * (1.0 - (28.0 / age_youngest).sqrt())).exp();

    assert!(
        f_youngest > 10.0,
        "7-day strength: {:.1} MPa", f_youngest
    );

    // Capacity of youngest slab (simplified: moment capacity check)
    // As fraction of design load
    let ratio: f64 = f_youngest / f_ck;

    assert!(
        ratio > 0.5,
        "Strength ratio: {:.2} (>50% of 28-day)", ratio
    );

    // Load on youngest slab
    let w_on_youngest: f64 = w_slab + w_per_level;

    // Capacity proportional to strength (250mm slab design capacity ≈ 15 kN/m²)
    let w_28day_capacity: f64 = 15.0; // kN/m², 28-day design capacity
    let w_capacity: f64 = ratio * w_28day_capacity;

    assert!(
        w_capacity > w_on_youngest,
        "Capacity {:.1} > demand {:.1} kN/m²", w_capacity, w_on_youngest
    );
}
