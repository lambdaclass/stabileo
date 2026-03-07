/// Validation: Advanced Earth Retaining Structures
///
/// References:
///   - Terzaghi, Peck & Mesri: "Soil Mechanics in Engineering Practice" (1996)
///   - Clayton et al: "Earth Pressure and Earth-Retaining Structures" (2014)
///   - EN 1997-1 (EC7): Geotechnical Design
///   - BS 8002: Code of Practice for Earth Retaining Structures
///   - NAVFAC DM-7.02: Foundations and Earth Structures
///   - FHWA-NHI-07-071: Earth Retaining Structures
///
/// Tests verify anchored walls, soil nail walls, secant pile walls,
/// diaphragm walls, sheet piles, and multi-propped excavations.

mod helpers;

// ================================================================
// 1. Anchored Sheet Pile Wall
// ================================================================
//
// Cantilever sheet pile with single row of tie-back anchors.
// Free-earth support method for initial design.
// Check: embedment, tie force, moment.

#[test]
fn retaining_anchored_sheet_pile() {
    let h: f64 = 6.0;               // m, retained height
    let d: f64 = 2.0;               // m, embedment depth
    let gamma: f64 = 18.0;          // kN/m³
    let ka: f64 = 0.33;             // active pressure coefficient
    let kp: f64 = 3.0;              // passive pressure coefficient
    let h_anchor: f64 = 1.5;        // m, anchor depth below top

    // Active pressure at base of wall
    let pa_base: f64 = gamma * (h + d) * ka;

    // Passive pressure at base (in front of wall)
    let pp_base: f64 = gamma * d * kp;

    assert!(
        pp_base > pa_base * 0.3,
        "Passive at base: {:.0} kPa", pp_base
    );

    // Active force (triangle)
    let fa: f64 = 0.5 * gamma * (h + d).powi(2) * ka;

    // Passive force (triangle, in front)
    let fp: f64 = 0.5 * gamma * d * d * kp;

    // Take moments about anchor point for embedment check
    let arm_active: f64 = (h + d) / 3.0 - h_anchor; // from anchor
    let arm_passive: f64 = h - h_anchor + d / 3.0;   // from anchor

    let m_active: f64 = fa * arm_active;
    let m_passive: f64 = fp * arm_passive;

    // Factor of safety on passive
    let fs_passive: f64 = m_passive / m_active.abs();

    assert!(
        fs_passive > 0.5,
        "Passive moment ratio: {:.2}", fs_passive
    );

    // Tie force (horizontal equilibrium)
    let t_anchor: f64 = fa - fp;

    assert!(
        t_anchor > 0.0,
        "Anchor force: {:.0} kN/m", t_anchor
    );

    // Anchor design (ground anchor)
    let anchor_spacing: f64 = 3.0;  // m
    let t_per_anchor: f64 = t_anchor * anchor_spacing;
    let anchor_capacity: f64 = 300.0; // kN (design capacity)

    assert!(
        anchor_capacity > t_per_anchor,
        "Anchor {:.0} > demand {:.0} kN", anchor_capacity, t_per_anchor
    );
}

// ================================================================
// 2. Multi-Propped Excavation
// ================================================================
//
// Deep excavation with multiple levels of props/struts.
// Apparent earth pressure diagrams (Terzaghi & Peck).
// Trapezoidal for sand, rectangular for soft clay.

#[test]
fn retaining_multi_propped() {
    let h: f64 = 12.0;              // m, excavation depth
    let gamma: f64 = 18.0;          // kN/m³
    let phi: f64 = 30.0_f64.to_radians();
    let ka: f64 = (45.0_f64.to_radians() - phi / 2.0).tan().powi(2);

    // Terzaghi & Peck apparent pressure for sand
    let p_a: f64 = 0.65 * gamma * h * ka;

    assert!(
        p_a > 30.0,
        "Apparent pressure: {:.0} kPa", p_a
    );

    // Prop levels
    let n_props: usize = 3;
    let prop_levels: [f64; 3] = [2.0, 5.5, 9.0]; // m below top

    // Tributary height per prop (simplified)
    let trib_1: f64 = (prop_levels[0] + prop_levels[1]) / 2.0;
    let trib_2: f64 = (prop_levels[1] - prop_levels[0]) / 2.0
        + (prop_levels[2] - prop_levels[1]) / 2.0;
    let trib_3: f64 = h - (prop_levels[1] + prop_levels[2]) / 2.0;

    // Prop forces (per m run)
    let f1: f64 = p_a * trib_1;
    let f2: f64 = p_a * trib_2;
    let f3: f64 = p_a * trib_3;

    assert!(
        f1 > 50.0 && f2 > 50.0 && f3 > 50.0,
        "Prop forces: {:.0}, {:.0}, {:.0} kN/m", f1, f2, f3
    );

    // Total horizontal force check
    let f_total: f64 = f1 + f2 + f3;
    let f_theoretical: f64 = p_a * h;

    assert!(
        (f_total - f_theoretical).abs() / f_theoretical < 0.15,
        "Total {:.0} ≈ theoretical {:.0} kN/m", f_total, f_theoretical
    );

    let _n_props = n_props;
}

// ================================================================
// 3. Secant Pile Wall
// ================================================================
//
// Overlapping bored piles forming continuous wall.
// Primary (soft) piles installed first; secondary (hard) piles
// cut into primaries for water-tightness.

#[test]
fn retaining_secant_pile() {
    let d: f64 = 0.60;              // m, pile diameter
    let spacing: f64 = 0.50;        // m, center-to-center
    let overlap: f64 = d - spacing;

    assert!(
        overlap > 0.05,
        "Overlap: {:.2} m (watertight)", overlap
    );

    // Wall stiffness (per meter run)
    let i_pile: f64 = std::f64::consts::PI * (d * 1000.0).powi(4) / 64.0; // mm⁴
    let e_concrete: f64 = 30_000.0; // MPa (secondary piles)
    let ei_per_pile: f64 = e_concrete * i_pile / 1e9; // kN·m²

    // Piles per meter
    let piles_per_m: f64 = 1.0 / spacing; // secondary piles per meter
    let ei_per_m: f64 = ei_per_pile * piles_per_m;

    assert!(
        ei_per_m > 50_000.0,
        "Wall EI: {:.0} kN·m²/m", ei_per_m
    );

    // Retained height
    let h: f64 = 8.0;               // m
    let gamma: f64 = 19.0;          // kN/m³
    let ka: f64 = 0.33;

    // Maximum bending moment (propped at top, fixed at base)
    let p_max: f64 = gamma * h * ka;
    let m_max: f64 = p_max * h * h / 12.0; // approximate for propped wall

    assert!(
        m_max > 100.0,
        "Max moment: {:.0} kN·m/m", m_max
    );

    // Pile capacity check (reinforced secondary piles)
    let as_pile: f64 = 6.0 * 804.0; // mm², 6H32 per pile
    let f_yk: f64 = 500.0;
    let f_ck: f64 = 30.0;

    // Approximate moment capacity of pile
    let d_eff: f64 = d * 1000.0 - 80.0; // mm
    let m_pile: f64 = 0.87 * f_yk * as_pile * 0.8 * d_eff / 1e6; // kN·m (simplified)
    let m_per_m: f64 = m_pile * piles_per_m;

    assert!(
        m_per_m > m_max,
        "Pile capacity {:.0} > demand {:.0} kN·m/m", m_per_m, m_max
    );

    let _f_ck = f_ck;
}

// ================================================================
// 4. Diaphragm Wall -- Slurry Trench
// ================================================================
//
// Reinforced concrete wall cast in-situ in bentonite-stabilized trench.
// Typical: 0.6-1.5m thick, 2.8-6.0m panel lengths.
// Used for deep excavations and basements.

#[test]
fn retaining_diaphragm_wall() {
    let t_wall: f64 = 0.80;         // m, wall thickness
    let h: f64 = 15.0;              // m, wall depth
    let panel_length: f64 = 5.0;    // m

    // Stiffness
    let e: f64 = 30_000.0;          // MPa
    let i_per_m: f64 = 1000.0 * (t_wall * 1000.0).powi(3) / 12.0; // mm⁴/m
    let ei: f64 = e * i_per_m / 1e9; // kN·m²/m

    assert!(
        ei > 1_000_000.0,
        "Wall EI: {:.0} kN·m²/m", ei
    );

    // Earth pressure
    let gamma: f64 = 19.0;          // kN/m³
    let ka: f64 = 0.33;
    let k0: f64 = 0.50;             // at-rest coefficient

    // Design for at-rest pressure (basement wall, no yielding)
    let p_base: f64 = gamma * h * k0;

    assert!(
        p_base > 100.0,
        "Pressure at base: {:.0} kPa", p_base
    );

    // Wall reinforcement (tension face)
    let cover: f64 = 75.0;          // mm (in-situ wall, large cover)
    let d_eff: f64 = t_wall * 1000.0 - cover - 16.0; // mm
    let f_ck: f64 = 35.0;           // MPa
    let f_yk: f64 = 500.0;

    // Maximum moment (propped cantilever: M ≈ p*h²/12 for triangular)
    let m_max: f64 = 0.5 * gamma * h * h * k0 * h / 12.0; // approximate

    // Required reinforcement
    let k: f64 = m_max * 1e6 / (1000.0 * d_eff * d_eff * f_ck);
    let _z: f64 = d_eff * (0.5 + (0.25 - k / 1.134).max(0.0).sqrt());

    // Simplified: As = M/(0.87*fyk*0.9d)
    let as_req: f64 = m_max * 1e6 / (0.87 * f_yk * 0.9 * d_eff); // mm²/m

    assert!(
        as_req > 500.0,
        "Required reinforcement: {:.0} mm²/m", as_req
    );

    let _panel_length = panel_length;
    let _ka = ka;
}

// ================================================================
// 5. Soil Nail Wall
// ================================================================
//
// Passive reinforcement installed in existing soil.
// Nails grouted in drilled holes at 1-2m spacing.
// Shotcrete facing for surface stability.

#[test]
fn retaining_soil_nail() {
    let h: f64 = 8.0;               // m, wall height
    let gamma: f64 = 18.0;          // kN/m³
    let phi: f64 = 32.0_f64.to_radians();
    let c: f64 = 5.0;               // kPa, soil cohesion

    // Nail parameters
    let d_nail: f64 = 0.025;        // m, nail bar diameter (25mm)
    let d_hole: f64 = 0.100;        // m, drill hole diameter
    let l_nail: f64 = 0.7 * h;      // m, nail length (typically 0.6-0.8H)
    let s_h: f64 = 1.5;             // m, horizontal spacing
    let s_v: f64 = 1.5;             // m, vertical spacing
    let inclination: f64 = 15.0_f64.to_radians(); // below horizontal

    // Grout-ground bond (pullout resistance)
    let q_s: f64 = 100.0;           // kPa, bond stress (medium dense sand)
    let t_pullout: f64 = std::f64::consts::PI * d_hole * l_nail * q_s; // kN per nail

    assert!(
        t_pullout > 100.0,
        "Nail pullout: {:.0} kN", t_pullout
    );

    // Nail tensile capacity
    let f_yk: f64 = 500.0;          // MPa
    let a_nail: f64 = std::f64::consts::PI * (d_nail * 1000.0).powi(2) / 4.0; // mm²
    let t_nail: f64 = f_yk * a_nail / 1000.0 / 1.15; // kN (with γs)

    assert!(
        t_nail > 100.0,
        "Nail tensile capacity: {:.0} kN", t_nail
    );

    // Design capacity (minimum of pullout and tensile)
    let t_design: f64 = t_pullout.min(t_nail);

    // Required resistance per unit area
    let ka: f64 = (45.0_f64.to_radians() - phi / 2.0).tan().powi(2);
    let p_active: f64 = 0.5 * gamma * h * h * ka;
    let _a_trib: f64 = s_h * s_v;
    let n_nails: f64 = (h / s_v).ceil();
    let t_total: f64 = n_nails * t_design;
    let fs: f64 = t_total / p_active;

    assert!(
        fs > 1.5,
        "Global FoS: {:.1}", fs
    );

    let _c = c;
    let _inclination = inclination;
}

// ================================================================
// 6. Cantilever Sheet Pile -- Granular Soil
// ================================================================
//
// Cantilevered sheet pile in sand.
// Depth of embedment by moment equilibrium about toe.
// Simplified method with safety factor on passive.

#[test]
fn retaining_cantilever_sheet_pile() {
    let h: f64 = 3.0;               // m, retained height
    let gamma: f64 = 18.0;          // kN/m³
    let phi: f64 = 30.0_f64.to_radians();
    let ka: f64 = (45.0_f64.to_radians() - phi / 2.0).tan().powi(2);
    let kp: f64 = (45.0_f64.to_radians() + phi / 2.0).tan().powi(2);

    // Active force
    let d: f64 = 3.0;               // m, trial embedment depth

    let fa: f64 = 0.5 * gamma * (h + d).powi(2) * ka; // active on retained side
    let fp: f64 = 0.5 * gamma * d * d * kp;            // passive on excavation side

    // Moment about toe
    let m_active: f64 = fa * (h + d) / 3.0;
    let m_passive: f64 = fp * d / 3.0;

    let fs: f64 = m_passive / m_active;

    assert!(
        fs > 0.5,
        "FoS on moments: {:.2}", fs
    );

    // Net pressure approach: required D for FoS = 1.5 on Kp
    let _kp_red: f64 = kp / 1.5;    // reduced passive
    // Simplified: D/H ratio
    let d_h_ratio: f64 = d / h;

    assert!(
        d_h_ratio >= 0.8,
        "D/H ratio: {:.2} (typically 0.8-1.2 for sand)", d_h_ratio
    );

    // Section modulus requirement
    let m_max: f64 = m_active * 0.8; // approximate max moment in pile
    let fy: f64 = 270.0;            // MPa, sheet pile steel (S270GP)
    let w_req: f64 = m_max * 1e6 / fy; // mm³/m

    assert!(
        w_req > 50_000.0,
        "Required section modulus: {:.0} mm³/m", w_req
    );
}

// ================================================================
// 7. Ground Anchor Design
// ================================================================
//
// Pre-stressed ground anchor for retaining walls.
// Fixed length (bonded) in stable ground behind failure plane.
// Free length through active zone.

#[test]
fn retaining_ground_anchor() {
    let p_design: f64 = 400.0;      // kN, design anchor force
    let fs: f64 = 1.5;              // factor of safety on pullout

    // Strand tendon
    let n_strands: usize = 4;
    let a_strand: f64 = 140.0;      // mm², 15.7mm strand
    let f_pk: f64 = 1860.0;         // MPa
    let a_total: f64 = (n_strands as f64) * a_strand;

    // Tendon capacity (at 60% of characteristic, for working load)
    let t_tendon: f64 = 0.60 * f_pk * a_total / 1000.0; // kN

    assert!(
        t_tendon > p_design,
        "Tendon capacity: {:.0} > {:.0} kN", t_tendon, p_design
    );

    // Fixed length (bonded zone)
    let d_grout: f64 = 0.150;       // m, grout body diameter
    let tau_bond: f64 = 200.0;      // kPa, grout-ground bond (dense sand/gravel)
    let l_fixed: f64 = p_design * fs / (std::f64::consts::PI * d_grout * tau_bond);

    assert!(
        l_fixed > 3.0 && l_fixed < 12.0,
        "Fixed length: {:.1} m", l_fixed
    );

    // Free length (must extend beyond failure plane)
    let h_wall: f64 = 10.0;         // m
    let angle_anchor: f64 = 20.0_f64.to_radians(); // below horizontal
    let phi: f64 = 30.0_f64.to_radians();

    // Failure plane at (45 + φ/2) from horizontal
    let failure_angle: f64 = 45.0_f64.to_radians() + phi / 2.0;
    let l_free_min: f64 = h_wall / failure_angle.tan() / angle_anchor.cos();

    assert!(
        l_free_min > 3.0,
        "Min free length: {:.1} m", l_free_min
    );

    // Total anchor length
    let l_total: f64 = l_free_min + l_fixed;

    assert!(
        l_total > 10.0 && l_total < 25.0,
        "Total anchor length: {:.1} m", l_total
    );

    // Lock-off load (typically 110% of design)
    let p_lockoff: f64 = 1.10 * p_design;
    let p_proof: f64 = 1.50 * p_design; // proof test load

    assert!(
        p_proof < t_tendon,
        "Proof load {:.0} < tendon capacity {:.0} kN", p_proof, t_tendon
    );

    let _p_lockoff = p_lockoff;
}

// ================================================================
// 8. Gabion Wall Stability
// ================================================================
//
// Gravity retaining wall using wire mesh baskets filled with stone.
// Check: overturning, sliding, bearing, internal stability.

#[test]
fn retaining_gabion_wall() {
    let h: f64 = 4.0;               // m, wall height
    let b: f64 = 2.5;               // m, base width (stepped)
    let gamma_gabion: f64 = 16.0;   // kN/m³ (stone-filled baskets)
    let gamma_soil: f64 = 18.0;     // kN/m³, retained soil
    let phi_soil: f64 = 30.0_f64.to_radians();
    let ka: f64 = (45.0_f64.to_radians() - phi_soil / 2.0).tan().powi(2);

    // Wall self-weight (trapezoidal cross-section, simplified as rectangular)
    let w_wall: f64 = gamma_gabion * b * h; // kN/m

    assert!(
        w_wall > 100.0,
        "Wall weight: {:.0} kN/m", w_wall
    );

    // Active earth pressure
    let pa: f64 = 0.5 * gamma_soil * h * h * ka;

    // Overturning about toe
    let m_overturn: f64 = pa * h / 3.0;
    let m_resist: f64 = w_wall * b / 2.0;
    let fs_overturn: f64 = m_resist / m_overturn;

    assert!(
        fs_overturn > 2.0,
        "Overturning FoS: {:.1} (>2.0)", fs_overturn
    );

    // Sliding
    let mu: f64 = phi_soil.tan(); // friction at base
    let fs_sliding: f64 = mu * w_wall / pa;

    assert!(
        fs_sliding > 1.5,
        "Sliding FoS: {:.1} (>1.5)", fs_sliding
    );

    // Bearing pressure
    // Eccentricity of resultant
    let e: f64 = b / 2.0 - (m_resist - m_overturn) / w_wall;

    // Must be within middle third (e < B/6)
    assert!(
        e < b / 6.0,
        "Eccentricity {:.2} < B/6 = {:.2} m (middle third)", e, b / 6.0
    );

    // Maximum bearing pressure
    let q_max: f64 = w_wall / b * (1.0 + 6.0 * e / b);

    assert!(
        q_max < 150.0,
        "Max bearing: {:.0} kPa", q_max
    );
}
