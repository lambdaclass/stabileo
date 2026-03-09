/// Validation: Scaffolding & Falsework Design
///
/// References:
///   - BS 5975:2019: Code of practice for temporary works
///   - EN 12811-1: Temporary works equipment -- Scaffolds
///   - EN 12812: Falsework -- Performance requirements
///   - OSHA 29 CFR 1926 Subpart L: Scaffolds
///   - AISC Design Guide 24: Hollow Structural Section Connections
///   - AS 4576: Guidelines for Scaffolding Safety
///
/// Tests verify scaffold leg capacity, platform loading,
/// falsework prop design, bracing, and stability checks.

// ================================================================
// 1. Scaffold Standard (Leg) -- Axial Capacity
// ================================================================
//
// Scaffold tubes: typically 48.3mm OD × 3.2mm wall (EN standard).
// Axial capacity governed by buckling with effective length.
// P_cr = π²EI / Le² (Euler buckling)

#[test]
fn scaffold_leg_capacity() {
    let od: f64 = 48.3;         // mm, outer diameter
    let t: f64 = 3.2;           // mm, wall thickness
    let e: f64 = 210_000.0;     // MPa
    let fy: f64 = 235.0;        // MPa, S235 steel

    // Section properties
    let id: f64 = od - 2.0 * t;
    let area: f64 = std::f64::consts::PI / 4.0 * (od * od - id * id);
    let i: f64 = std::f64::consts::PI / 64.0 * (od.powi(4) - id.powi(4));
    let r: f64 = (i / area).sqrt(); // radius of gyration

    assert!(
        r > 14.0 && r < 20.0,
        "Radius of gyration: {:.1} mm", r
    );

    // Effective length (lift height between ledgers)
    let le: f64 = 2000.0;       // mm, typical lift height

    // Slenderness ratio
    let lambda: f64 = le / r;

    assert!(
        lambda > 50.0 && lambda < 200.0,
        "Slenderness: {:.1}", lambda
    );

    // Euler buckling load
    let pcr: f64 = std::f64::consts::PI.powi(2) * e * i / (le * le);
    // in N

    // Squash load
    let py: f64 = fy * area; // N

    // Perry-Robertson (simplified): use minimum of buckling & squash
    let phi_pr: f64 = 0.5 * (1.0 + 0.003 * lambda + lambda * lambda * fy / (std::f64::consts::PI.powi(2) * e));
    let _chi: f64 = 1.0 / (phi_pr + (phi_pr * phi_pr - lambda * lambda * fy / (std::f64::consts::PI.powi(2) * e)).sqrt());

    // Simply: capacity with safety factor
    let capacity: f64 = pcr.min(py) / 1000.0; // kN

    assert!(
        capacity > 10.0,
        "Leg capacity: {:.1} kN", capacity
    );
}

// ================================================================
// 2. Scaffold Platform Loading
// ================================================================
//
// EN 12811-1 load classes:
// Class 2: 1.5 kN/m² (inspection/light duty)
// Class 3: 2.0 kN/m² (general construction)
// Class 4: 3.0 kN/m² (masonry/heavy duty)
// Class 5: 4.5 kN/m² (special heavy duty)
// Class 6: 6.0 kN/m² (heavy storage)

#[test]
fn scaffold_platform_loading() {
    // Platform dimensions
    let width: f64 = 0.6;       // m (single board width)
    let span: f64 = 2.0;        // m (bay length)

    // Load class 3 (typical construction)
    let q_class3: f64 = 2.0;    // kN/m²
    let q_sw: f64 = 0.3;        // kN/m², self-weight of boards

    let q_total: f64 = q_class3 + q_sw;

    // Load per unit length on board
    let w: f64 = q_total * width; // kN/m

    // Bending moment (simply supported)
    let m: f64 = w * span * span / 8.0;

    assert!(
        m > 0.0 && m < 2.0,
        "Board moment: {:.3} kN·m", m
    );

    // Concentrated load check (EN 12811-1: 1.5 kN over 500×500mm)
    let p_conc: f64 = 1.5;      // kN
    let m_conc: f64 = p_conc * span / 4.0; // midspan moment

    // Governing load case
    let m_govern: f64 = m.max(m_conc);

    assert!(
        m_govern > 0.5,
        "Governing moment: {:.3} kN·m", m_govern
    );

    // Deflection check: L/100 for scaffold boards
    let deflection_limit: f64 = span * 1000.0 / 100.0; // mm
    assert!(
        deflection_limit > 15.0,
        "Deflection limit: {:.0} mm (L/100)", deflection_limit
    );
}

// ================================================================
// 3. Falsework Prop -- Adjustable Steel Prop
// ================================================================
//
// Adjustable steel props: capacity depends on extended length.
// EN 1065: Adjustable telescopic steel props.
// Capacity decreases with extension (increased effective length).

#[test]
fn falsework_prop_capacity() {
    let prop_inner_d: f64 = 60.3;  // mm, inner tube OD
    let prop_outer_d: f64 = 76.1;  // mm, outer tube OD
    let t: f64 = 3.2;              // mm, wall thickness
    let e: f64 = 210_000.0;        // MPa

    // Moment of inertia (governs at weakest section = inner tube)
    let id_inner: f64 = prop_inner_d - 2.0 * t;
    let i_inner: f64 = std::f64::consts::PI / 64.0 * (prop_inner_d.powi(4) - id_inner.powi(4));

    // Prop lengths: minimum to maximum extension
    let l_min: f64 = 1800.0;    // mm
    let l_max: f64 = 3200.0;    // mm

    // Euler buckling at min extension
    let pcr_min: f64 = std::f64::consts::PI.powi(2) * e * i_inner / (l_min * l_min) / 1000.0; // kN

    // Euler buckling at max extension
    let pcr_max: f64 = std::f64::consts::PI.powi(2) * e * i_inner / (l_max * l_max) / 1000.0; // kN

    // Capacity decreases with length (L² in denominator)
    assert!(
        pcr_max < pcr_min,
        "P_cr(max ext) {:.1} < P_cr(min ext) {:.1} kN", pcr_max, pcr_min
    );

    // Ratio of capacities = (L_min/L_max)²
    let length_sq_ratio: f64 = (l_min / l_max).powi(2);
    let capacity_ratio: f64 = pcr_max / pcr_min;

    assert!(
        (capacity_ratio - length_sq_ratio).abs() < 0.01,
        "Capacity ratio {:.3} = length² ratio {:.3}", capacity_ratio, length_sq_ratio
    );

    let _prop_outer_d = prop_outer_d;
}

// ================================================================
// 4. Scaffold Bracing -- Lateral Stability
// ================================================================
//
// Bracing prevents sway failure of scaffold.
// Bracing force: F_brace = α * Σ(vertical loads in braced bay)
// α = 2.5% (notional horizontal load, EN 12811-1)

#[test]
fn scaffold_bracing() {
    let n_lifts: f64 = 5.0;     // number of lifts
    let n_bays: f64 = 10.0;     // number of bays
    let p_per_std: f64 = 15.0;  // kN, load per standard (leg)

    // Total vertical load on braced section
    let total_vertical: f64 = n_bays * 2.0 * p_per_std; // 2 standards per bay face

    // Notional horizontal load (2.5% of vertical)
    let alpha: f64 = 0.025;
    let h_notional: f64 = alpha * total_vertical;

    assert!(
        h_notional > 5.0,
        "Notional horizontal: {:.1} kN", h_notional
    );

    // Wind load on scaffold (EN 12811-1)
    let q_wind: f64 = 0.6;      // kN/m² (working wind)
    let h_scaffold: f64 = n_lifts * 2.0; // m, scaffold height
    let bay_length: f64 = 2.5;  // m

    // Wind load on one face
    let solidity: f64 = 0.3;    // ratio (netting/sheeting)
    let f_wind: f64 = q_wind * h_scaffold * bay_length * n_bays * solidity;

    // Governing horizontal load
    let f_horizontal: f64 = h_notional.max(f_wind);

    assert!(
        f_horizontal > 0.0,
        "Governing horizontal: {:.1} kN", f_horizontal
    );

    // Brace force (diagonal brace at angle θ)
    let theta: f64 = 45.0_f64.to_radians();
    let f_brace: f64 = f_horizontal / theta.cos();

    assert!(
        f_brace > f_horizontal,
        "Brace force {:.1} > horizontal {:.1} kN (angle effect)",
        f_brace, f_horizontal
    );
}

// ================================================================
// 5. Falsework -- Slab Formwork Loading
// ================================================================
//
// BS 5975 / EN 12812: loads on formwork for concrete slabs.
// Dead: concrete self-weight + formwork weight
// Live: construction load (personnel + equipment)
// Minimum imposed: 1.5 kN/m² (EN 12812)

#[test]
fn falsework_slab_formwork() {
    let slab_thickness: f64 = 250.0; // mm
    let gamma_conc: f64 = 25.0;     // kN/m³ (wet concrete, slightly heavier)

    // Concrete dead load
    let q_concrete: f64 = gamma_conc * slab_thickness / 1000.0; // kN/m²
    // = 6.25 kN/m²

    // Formwork self-weight
    let q_formwork: f64 = 0.5;  // kN/m² (typical timber formwork)

    // Construction live load
    let q_live: f64 = 1.5;      // kN/m² minimum (EN 12812)

    // Total design load (unfactored)
    let q_total: f64 = q_concrete + q_formwork + q_live;

    assert!(
        q_total > 7.0,
        "Total formwork load: {:.2} kN/m²", q_total
    );

    // Factored load (ULS)
    let q_uls: f64 = 1.35 * (q_concrete + q_formwork) + 1.50 * q_live;

    assert!(
        q_uls > q_total,
        "ULS load {:.2} > SLS load {:.2} kN/m²", q_uls, q_total
    );

    // Prop spacing for given prop capacity
    let prop_capacity: f64 = 20.0; // kN
    let spacing: f64 = (prop_capacity / q_uls).sqrt(); // m (square grid)

    assert!(
        spacing > 0.5 && spacing < 3.0,
        "Prop spacing: {:.2} m", spacing
    );
}

// ================================================================
// 6. Scaffold Tie Forces -- Facade Restraint
// ================================================================
//
// Scaffolds must be tied to building facade.
// EN 12811-1: tie capacity ≥ max(wind force on tie area, notional load)
// Typical: ties at every other lift, every other bay.

#[test]
fn scaffold_tie_forces() {
    // Tie pattern: every other standard, every other lift
    let tie_h_spacing: f64 = 4.0; // m (every 2 lifts × 2.0m)
    let tie_v_spacing: f64 = 5.0; // m (every 2 bays × 2.5m)

    // Tributary area per tie
    let a_trib: f64 = tie_h_spacing * tie_v_spacing;
    // = 20.0 m²

    // Wind pressure (design wind for in-service scaffold)
    let q_wind: f64 = 0.8;      // kN/m²
    let cf: f64 = 1.3;          // force coefficient (with netting)

    // Wind force per tie
    let f_wind: f64 = q_wind * cf * a_trib;
    // = 0.8 * 1.3 * 20 = 20.8 kN

    assert!(
        f_wind > 10.0,
        "Wind force per tie: {:.1} kN", f_wind
    );

    // Minimum tie capacity (BS 5975: 6.0 kN for standard scaffold)
    let min_tie: f64 = 6.0;     // kN

    let tie_design: f64 = f_wind.max(min_tie);

    assert!(
        tie_design >= min_tie,
        "Design tie force: {:.1} kN", tie_design
    );

    // Tie anchor capacity in masonry
    // Typical resin anchor M12: 10-15 kN in masonry
    let anchor_capacity: f64 = 12.0; // kN

    // Number of anchors per tie point
    let n_anchors: f64 = (tie_design / anchor_capacity).ceil();

    assert!(
        n_anchors >= 1.0,
        "Anchors per tie: {:.0}", n_anchors
    );
}

// ================================================================
// 7. Falsework -- Progressive Collapse Prevention
// ================================================================
//
// BS 5975: falsework must be designed against progressive collapse.
// Loss of a single prop → redistribution check.
// Robustness: remaining structure must support loads with reduced safety factor.

#[test]
fn falsework_progressive_collapse() {
    let n_props: f64 = 16.0;    // props in a 4×4 grid
    let total_load: f64 = 200.0; // kN, total slab load on grid
    let prop_capacity: f64 = 20.0; // kN per prop

    // Normal utilization
    let load_per_prop: f64 = total_load / n_props;
    let utilization: f64 = load_per_prop / prop_capacity;

    assert!(
        utilization < 1.0,
        "Normal utilization: {:.2}", utilization
    );

    // Loss of one interior prop: load redistributes to 8 neighbors (approximately)
    let n_remaining: f64 = n_props - 1.0;
    let load_per_remaining: f64 = total_load / n_remaining;

    // Accidental load factor (reduced γ = 1.05 per BS 5975)
    let gamma_acc: f64 = 1.05;
    let util_accident: f64 = gamma_acc * load_per_remaining / prop_capacity;

    assert!(
        util_accident < 1.0,
        "Accidental utilization: {:.2} < 1.0", util_accident
    );

    // Redundancy ratio
    let redundancy: f64 = n_props * prop_capacity / total_load;
    assert!(
        redundancy > 1.2,
        "Redundancy ratio: {:.2}", redundancy
    );
}

// ================================================================
// 8. Shore Tower -- Multi-Tier Falsework
// ================================================================
//
// Multi-tier shoring for high formwork (bridges, high-rise).
// Frame capacity: governed by frame buckling mode.
// Effective length depends on bracing and frame continuity.

#[test]
fn falsework_shore_tower() {
    let n_tiers: f64 = 4.0;     // number of frame tiers
    let tier_height: f64 = 1.5; // m
    let total_height: f64 = n_tiers * tier_height; // 6.0 m

    // Frame leg: 48.3 × 3.2mm tube (same as scaffold)
    let e: f64 = 210_000.0;     // MPa
    let i: f64 = 115_000.0;     // mm⁴ (approximate for 48.3 × 3.2)

    // Effective length for braced frame
    let k: f64 = 1.0;           // fully braced
    let le: f64 = k * tier_height * 1000.0; // mm, per tier

    // Euler capacity per leg (per tier)
    let pcr: f64 = std::f64::consts::PI.powi(2) * e * i / (le * le) / 1000.0;

    assert!(
        pcr > 50.0,
        "Euler capacity per tier: {:.0} kN", pcr
    );

    // Unbraced mode: entire tower buckles as unit
    let le_unbraced: f64 = total_height * 1000.0; // mm
    let pcr_unbraced: f64 = std::f64::consts::PI.powi(2) * e * i / (le_unbraced * le_unbraced) / 1000.0;

    // Bracing dramatically increases capacity
    let ratio: f64 = pcr / pcr_unbraced;
    let expected_ratio: f64 = (total_height / tier_height).powi(2);

    assert!(
        (ratio - expected_ratio).abs() / expected_ratio < 0.01,
        "Bracing improvement: {:.0}× (= n_tiers²)", ratio
    );

    // Design capacity with safety factor
    let gamma: f64 = 1.50;
    let design_capacity: f64 = pcr / gamma;

    assert!(
        design_capacity > 30.0,
        "Design capacity: {:.0} kN per leg", design_capacity
    );
}
