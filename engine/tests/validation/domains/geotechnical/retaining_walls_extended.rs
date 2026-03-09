/// Validation: Extended Retaining Wall Analysis Benchmarks
///
/// References:
///   - Bowles: "Foundation Analysis and Design" 5th ed. (1996)
///   - Das & Sivakugan: "Principles of Foundation Engineering" 9th ed.
///   - ACI 318-19: Building Code Requirements for Structural Concrete
///   - Terzaghi, Peck & Mesri: "Soil Mechanics in Engineering Practice" 3rd ed.
///   - NAVFAC DM-7.02: Foundations and Earth Structures
///   - Seed & Whitman (1970): Mononobe-Okabe seismic earth pressure
///   - USS Steel Sheet Piling Design Manual (1984)
///   - EN 1997-1:2004 (EC7): Geotechnical Design
///
/// Tests verify gravity wall stability, cantilever wall stem design,
/// counterfort walls, basement walls, sheet pile free earth support,
/// surcharge effects, and seismic earth pressure (Mononobe-Okabe).

use crate::common::*;
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;

// ================================================================
// 1. Gravity Wall Sliding Stability
// ================================================================
//
// A concrete gravity retaining wall resists lateral earth pressure
// through self-weight friction at the base.
//
// Factor of safety against sliding:
//   FS_sliding = mu * W / Pa
// where:
//   mu = tan(delta_b) = coefficient of friction at base
//   W  = total vertical weight of wall (concrete + soil on heel)
//   Pa = Ka * gamma * H^2 / 2 = total active earth pressure force
//   Ka = (1 - sin phi) / (1 + sin phi)
//
// Reference: Bowles (1996), Section 12.4; Das (9th ed.), Section 13.8
// For phi=30 deg, Ka=1/3. Minimum FS_sliding >= 1.5 (AASHTO/EC7).

#[test]
fn validation_ret_wall_ext_gravity_sliding_stability() {
    // --- Soil and geometry ---
    let phi: f64 = 30.0_f64.to_radians();       // soil friction angle
    let gamma_soil: f64 = 18.0;                  // kN/m^3, unit weight of backfill
    let h: f64 = 5.0;                            // m, wall height
    let gamma_c: f64 = 24.0;                     // kN/m^3, unit weight of concrete
    let b_wall: f64 = 2.0;                       // m, wall base width (gravity wall)
    let t_base: f64 = 0.6;                       // m, base slab thickness
    let mu: f64 = 0.55;                          // base friction coefficient (concrete on soil)

    // Active earth pressure coefficient (Rankine)
    let ka: f64 = (1.0 - phi.sin()) / (1.0 + phi.sin());
    let ka_expected: f64 = 1.0 / 3.0;
    assert_close(ka, ka_expected, 0.01, "Ka for phi=30 deg");

    // Total active force per unit length of wall
    let pa: f64 = 0.5 * ka * gamma_soil * h * h;
    // = 0.5 * (1/3) * 18 * 25 = 75.0 kN/m
    assert_close(pa, 75.0, 0.02, "Active force Pa");

    // Wall self-weight: simplified trapezoidal section approximated as rectangle
    // (gravity walls are typically wider at base)
    let w_concrete: f64 = gamma_c * b_wall * h;
    // = 24 * 2.0 * 5.0 = 240.0 kN/m
    assert_close(w_concrete, 240.0, 0.01, "Concrete weight");

    // Sliding factor of safety: FS = mu * W / Pa
    let fs_sliding: f64 = mu * w_concrete / pa;
    // = 0.55 * 240 / 75 = 1.76
    assert_close(fs_sliding, 1.76, 0.02, "FS sliding");

    // Verify FS > 1.5 (AASHTO minimum)
    assert!(
        fs_sliding > 1.5,
        "FS_sliding = {:.2} must exceed 1.5", fs_sliding
    );

    // Without passive resistance (conservative approach)
    // Including passive would only increase FS
    let _t_base = t_base;

    // Solver verification: model the wall stem as a cantilever beam under
    // triangular lateral earth pressure to verify base shear
    let n_elem: usize = 10;
    let e_concrete: f64 = 25_000.0;   // MPa (E for solver; E_eff = E * 1000)
    let a_wall: f64 = b_wall * 1.0;   // m^2, cross-section area (1m width)
    let iz_wall: f64 = 1.0 * b_wall.powi(3) / 12.0; // m^4, I for rectangular section

    // Triangular load from Ka*gamma*H at base to 0 at top
    // Wall is vertical cantilever: fixed at base (node 1, x=0), free at top (x=H)
    // Earth pressure is max at base, zero at top.
    let mut loads = Vec::new();
    let p_base: f64 = ka * gamma_soil * h; // pressure at base
    for i in 0..n_elem {
        let xi: f64 = i as f64 / n_elem as f64;
        let xj: f64 = (i + 1) as f64 / n_elem as f64;
        // Pressure decreases from base (x=0) to top (x=H)
        let qi: f64 = -(p_base * (1.0 - xi));  // negative = in -y direction
        let qj: f64 = -(p_base * (1.0 - xj));
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: qi,
            q_j: qj,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n_elem, h, e_concrete, a_wall, iz_wall, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Base reaction (shear) should equal Pa = 75 kN/m
    let reaction = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(reaction.ry.abs(), pa, 0.03, "Solver base shear vs Pa");
}

// ================================================================
// 2. Gravity Wall Overturning Stability
// ================================================================
//
// Factor of safety against overturning about the toe:
//   FS_OT = sum(stabilizing moments) / sum(overturning moments)
//
// Stabilizing moments: from wall self-weight and soil on heel slab.
// Overturning moment: Pa acts at H/3 from base.
//
// Reference: Das (9th ed.), Section 13.8; Bowles (1996), Section 12.5
// Minimum FS_OT >= 2.0 (AASHTO) or >= 1.5 (EC7).

#[test]
fn validation_ret_wall_ext_gravity_overturning() {
    let h: f64 = 6.0;               // m, total wall height
    let gamma_s: f64 = 18.0;        // kN/m^3, soil
    let gamma_c: f64 = 24.0;        // kN/m^3, concrete
    let phi: f64 = 30.0_f64.to_radians();
    let ka: f64 = (1.0 - phi.sin()) / (1.0 + phi.sin());

    // Wall geometry (L-shaped gravity wall)
    let b_base: f64 = 3.5;          // m, total base width
    let t_base: f64 = 0.5;          // m, base thickness
    let t_stem: f64 = 0.5;          // m, stem thickness
    let toe_len: f64 = 0.5;         // m, toe projection

    // Active force and overturning moment about toe
    let pa: f64 = 0.5 * ka * gamma_s * h * h;
    // = 0.5 * (1/3) * 18 * 36 = 108.0 kN/m
    assert_close(pa, 108.0, 0.02, "Pa for H=6m");

    let m_overturn: f64 = pa * h / 3.0;
    // = 108 * 2.0 = 216.0 kN-m/m
    assert_close(m_overturn, 216.0, 0.02, "Overturning moment");

    // Stabilizing forces and moments about toe
    // Component 1: Base slab
    let w_base: f64 = gamma_c * b_base * t_base;
    let arm_base: f64 = b_base / 2.0;
    let m_base: f64 = w_base * arm_base;

    // Component 2: Stem (above base)
    let h_stem: f64 = h - t_base;
    let w_stem: f64 = gamma_c * t_stem * h_stem;
    let arm_stem: f64 = toe_len + t_stem / 2.0;
    let m_stem: f64 = w_stem * arm_stem;

    // Component 3: Soil on heel
    let heel_len: f64 = b_base - toe_len - t_stem;
    let w_soil: f64 = gamma_s * heel_len * h_stem;
    let arm_soil: f64 = b_base - heel_len / 2.0;
    let m_soil: f64 = w_soil * arm_soil;

    let m_resist: f64 = m_base + m_stem + m_soil;

    // Factor of safety against overturning
    let fs_ot: f64 = m_resist / m_overturn;

    // Verify numerical values
    assert_close(w_base, 42.0, 0.02, "Base weight");
    assert_close(w_stem, 66.0, 0.02, "Stem weight");
    assert_close(heel_len, 2.5, 0.01, "Heel length");

    // FS should exceed 2.0 (AASHTO)
    assert!(
        fs_ot > 2.0,
        "FS_overturning = {:.2} must exceed 2.0 (AASHTO)", fs_ot
    );

    // Also verify eccentricity is within middle third
    let sum_v: f64 = w_base + w_stem + w_soil;
    let x_resultant: f64 = (m_resist - m_overturn) / sum_v;
    let e: f64 = (b_base / 2.0 - x_resultant).abs();
    assert!(
        e < b_base / 6.0,
        "Eccentricity e={:.3}m < B/6={:.3}m (middle third OK)", e, b_base / 6.0
    );
}

// ================================================================
// 3. Cantilever Wall Stem Design (ACI 318)
// ================================================================
//
// The stem of a cantilever retaining wall acts as a vertical
// cantilever beam, fixed at the base slab connection.
//
// Maximum bending moment at stem base:
//   M_base = Ka * gamma * H^3 / 6
//
// This is verified both analytically and via the 2D frame solver,
// modeling the stem as a cantilever under triangular earth pressure.
//
// Reference: ACI 318-19, Section 11.5; Das (9th ed.), Section 13.11

#[test]
fn validation_ret_wall_ext_cantilever_stem_design() {
    let phi: f64 = 30.0_f64.to_radians();
    let gamma_s: f64 = 18.0;          // kN/m^3
    let h_stem: f64 = 4.5;            // m, stem height (above base slab)
    let t_stem: f64 = 0.35;           // m, stem thickness
    let ka: f64 = (1.0 - phi.sin()) / (1.0 + phi.sin());

    // Analytical maximum moment at stem base
    // M = Ka * gamma * H^3 / 6  (from integrating triangular pressure)
    let m_base_analytical: f64 = ka * gamma_s * h_stem.powi(3) / 6.0;
    // = (1/3) * 18 * 91.125 / 6 = (1/3) * 273.375 = 91.125 kN-m/m
    // Actually: (1/3)*18*(4.5^3)/6 = (1/3)*18*91.125/6 = 6*91.125/6 = 91.125
    assert_close(m_base_analytical, 91.125, 0.02, "Analytical M_base");

    // Solver verification: cantilever under triangular load
    let n_elem: usize = 12;
    let e_concrete: f64 = 25_000.0;   // MPa
    let a_stem: f64 = t_stem * 1.0;   // m^2 per meter width
    let iz_stem: f64 = 1.0 * t_stem.powi(3) / 12.0; // m^4

    // Triangular load: Ka*gamma*H at base (x=0, fixed), 0 at top (x=H, free)
    let p_max: f64 = ka * gamma_s * h_stem;  // pressure at base
    let mut loads = Vec::new();
    for i in 0..n_elem {
        let xi: f64 = i as f64 / n_elem as f64;
        let xj: f64 = (i + 1) as f64 / n_elem as f64;
        // Pressure decreases from base to top
        let qi: f64 = -(p_max * (1.0 - xi));
        let qj: f64 = -(p_max * (1.0 - xj));
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: qi,
            q_j: qj,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n_elem, h_stem, e_concrete, a_stem, iz_stem, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Fixed-end moment from solver
    let reaction = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    // Moment at fixed end should match M_base_analytical
    assert_close(reaction.mz.abs(), m_base_analytical, 0.03, "Solver M_base vs analytical");

    // ACI 318 flexural design check (simplified)
    // Required rebar area: As = M / (0.9 * fy * jd)
    let f_yk: f64 = 420.0;            // MPa, Grade 60 rebar
    let d_eff: f64 = t_stem * 1000.0 - 50.0 - 8.0; // mm, effective depth (50mm cover + #8 bar half)
    let j: f64 = 0.9;                 // approximate lever arm ratio
    let m_u: f64 = 1.6 * m_base_analytical; // factored moment (1.6 for earth pressure)

    let as_req: f64 = m_u * 1e6 / (0.9 * f_yk * j * d_eff); // mm^2/m
    assert!(
        as_req > 500.0 && as_req < 5000.0,
        "Required reinforcement As={:.0} mm^2/m", as_req
    );

    // Minimum reinforcement check (ACI 318-19: 0.0025*b*d for walls)
    let as_min: f64 = 0.0025 * 1000.0 * d_eff;
    assert!(
        as_req > as_min,
        "As_req={:.0} > As_min={:.0} mm^2/m", as_req, as_min
    );
}

// ================================================================
// 4. Counterfort Wall: Spacing and Bending Between Counterforts
// ================================================================
//
// A counterfort retaining wall has vertical triangular ribs
// (counterforts) on the soil side, connecting the stem to the base.
// The wall panel between counterforts spans horizontally.
//
// For a horizontal strip at depth z below the top:
//   Lateral pressure: p(z) = Ka * gamma * z
//   Panel moment (fixed-fixed span s between counterforts):
//     M_span = p(z) * s^2 / 12  (at support)
//     M_mid  = p(z) * s^2 / 24  (at midspan)
//
// Reference: NAVFAC DM-7.02, Section 7.2-55; Bowles (1996), Section 12.12
//
// Solver model: horizontal beam strip (fixed-fixed) under uniform
// lateral pressure at a given depth.

#[test]
fn validation_ret_wall_ext_counterfort_wall() {
    let phi: f64 = 30.0_f64.to_radians();
    let gamma_s: f64 = 18.0;
    let ka: f64 = (1.0 - phi.sin()) / (1.0 + phi.sin());
    let h_wall: f64 = 8.0;            // m, wall height
    let s_cf: f64 = 3.0;              // m, counterfort spacing (center-to-center)
    let t_panel: f64 = 0.25;          // m, panel thickness between counterforts

    // Lateral pressure at base level (critical section)
    let z: f64 = h_wall;
    let p_z: f64 = ka * gamma_s * z;
    // = (1/3) * 18 * 8 = 48.0 kN/m^2
    assert_close(p_z, 48.0, 0.02, "Lateral pressure at base");

    // Analytical moments for fixed-fixed beam under UDL
    let m_support: f64 = p_z * s_cf * s_cf / 12.0;
    // = 48 * 9 / 12 = 36.0 kN-m/m
    assert_close(m_support, 36.0, 0.02, "Support moment (fixed-fixed)");

    let m_midspan: f64 = p_z * s_cf * s_cf / 24.0;
    // = 48 * 9 / 24 = 18.0 kN-m/m
    assert_close(m_midspan, 18.0, 0.02, "Midspan moment (fixed-fixed)");

    // Solver verification: fixed-fixed beam of span s_cf under UDL = p_z
    let n_elem: usize = 10;
    let e_concrete: f64 = 25_000.0;
    let a_panel: f64 = t_panel * 1.0;
    let iz_panel: f64 = 1.0 * t_panel.powi(3) / 12.0;

    let mut loads = Vec::new();
    for i in 0..n_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -p_z,    // uniform lateral pressure (downward in beam model)
            q_j: -p_z,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(
        n_elem, s_cf, e_concrete, a_panel, iz_panel,
        "fixed",
        Some("fixed"),
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Check fixed-end moments at both supports
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n_elem + 1).unwrap();

    // Fixed-end moment for UDL on fixed-fixed beam = qL^2/12
    assert_close(r_left.mz.abs(), m_support, 0.03, "Solver left support moment");
    assert_close(r_right.mz.abs(), m_support, 0.03, "Solver right support moment");

    // Counterfort design: each counterfort resists the earth pressure
    // over its tributary width = s_cf
    let pa_total: f64 = 0.5 * ka * gamma_s * h_wall * h_wall;
    let pa_per_cf: f64 = pa_total * s_cf;
    // = 0.5*(1/3)*18*64*3 = 576 kN per counterfort
    assert_close(pa_per_cf, 576.0, 0.02, "Force per counterfort");
}

// ================================================================
// 5. Basement Wall: Fixed-Free vs Propped at Top
// ================================================================
//
// A basement wall retains soil on one side. Two common conditions:
//
// (a) Cantilever (fixed at base, free at top): before slab is cast
//     M_max = Pa * H/3 = Ka*gamma*H^3/6  (at base)
//     delta_top = Ka*gamma*H^4 / (30*EI)
//
// (b) Propped (fixed at base, roller at top): after ground floor slab
//     The slab provides lateral support, reducing moments and deflections.
//     For triangular load on propped cantilever:
//     Reaction at prop (top): R_top = 0.4*Pa (approximate)
//     M_max occurs below the prop level.
//
// Reference: Bowles (1996), Section 12.16; BS 8102 basement waterproofing
//
// We model both cases in the solver and compare base moments.

#[test]
fn validation_ret_wall_ext_basement_wall_conditions() {
    let phi: f64 = 30.0_f64.to_radians();
    let gamma_s: f64 = 18.0;
    let ka: f64 = (1.0 - phi.sin()) / (1.0 + phi.sin());
    let h: f64 = 4.0;                  // m, basement wall height
    let t_wall: f64 = 0.30;            // m, wall thickness
    let n_elem: usize = 12;
    let e_concrete: f64 = 25_000.0;    // MPa
    let a_wall: f64 = t_wall * 1.0;
    let iz_wall: f64 = 1.0 * t_wall.powi(3) / 12.0;

    let p_max: f64 = ka * gamma_s * h;  // pressure at base

    // Build triangular load (p_max at base x=0, 0 at top x=H)
    // Fixed end (base) is at node 1 (x=0), free end (top) is at x=H
    let build_triangular_loads = || -> Vec<SolverLoad> {
        let mut loads = Vec::new();
        for i in 0..n_elem {
            let xi: f64 = i as f64 / n_elem as f64;
            let xj: f64 = (i + 1) as f64 / n_elem as f64;
            // Pressure decreases from base to top
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: -(p_max * (1.0 - xi)),
                q_j: -(p_max * (1.0 - xj)),
                a: None,
                b: None,
            }));
        }
        loads
    };

    // --- Case (a): Cantilever (fixed base, free top) ---
    let input_cantilever = make_beam(
        n_elem, h, e_concrete, a_wall, iz_wall,
        "fixed", None, build_triangular_loads(),
    );
    let res_cantilever = linear::solve_2d(&input_cantilever).unwrap();

    let r_cant = res_cantilever.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let m_cant_base: f64 = r_cant.mz.abs();

    // Analytical: M_base = Ka*gamma*H^3/6
    let m_cant_analytical: f64 = ka * gamma_s * h.powi(3) / 6.0;
    // = (1/3)*18*64/6 = 64.0 kN-m/m
    assert_close(m_cant_analytical, 64.0, 0.02, "Cantilever M_base analytical");
    assert_close(m_cant_base, m_cant_analytical, 0.03, "Cantilever solver M_base");

    // --- Case (b): Propped cantilever (fixed base, roller at top) ---
    let input_propped = make_beam(
        n_elem, h, e_concrete, a_wall, iz_wall,
        "fixed", Some("rollerX"), build_triangular_loads(),
    );
    let res_propped = linear::solve_2d(&input_propped).unwrap();

    let r_prop_base = res_propped.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let m_prop_base: f64 = r_prop_base.mz.abs();

    // The propped wall has significantly reduced base moment compared to cantilever.
    // For triangular load on propped cantilever: M_base = Pa*H/3 - R_top*H
    // where R_top ~ 0.4*Pa (from propped cantilever tables)
    // So M_propped ~ M_cantilever * (1 - 0.4*3) ... much smaller
    assert!(
        m_prop_base < m_cant_base,
        "Propped base moment {:.1} < cantilever {:.1} kN-m/m",
        m_prop_base, m_cant_base
    );

    // The propped condition should reduce base moment by roughly 60-80%
    let reduction_ratio: f64 = m_prop_base / m_cant_base;
    assert!(
        reduction_ratio < 0.5,
        "Propping reduces base moment by {:.0}%", (1.0 - reduction_ratio) * 100.0
    );

    // Check that the top prop receives a horizontal reaction
    let r_prop_top = res_propped.reactions.iter().find(|r| r.node_id == n_elem + 1).unwrap();
    assert!(
        r_prop_top.ry.abs() > 5.0,
        "Top prop reaction = {:.1} kN/m (should be significant)", r_prop_top.ry.abs()
    );
}

// ================================================================
// 6. Sheet Pile Wall: Free Earth Support Method (Anchored Wall)
// ================================================================
//
// An anchored sheet pile wall with a single row of tie-backs.
// Free earth support method (simplified):
//   1. Active pressure on the retained side (full height H+D)
//   2. Passive pressure below excavation (depth D on excavation side)
//   3. Take moments about the anchor to find required embedment D
//   4. Horizontal equilibrium gives the anchor force T
//
// For cohesionless soil:
//   Pa = 0.5 * Ka * gamma * (H+D)^2  (acting at (H+D)/3 from toe)
//   Pp = 0.5 * Kp * gamma * D^2       (acting at D/3 from toe)
//
// Reference: USS Steel Sheet Piling Design Manual (1984), Section 5
//            Das (9th ed.), Section 14.4
//
// Solver model: the sheet pile as a beam, fixed at base (approximation
// of embedment), roller at anchor level, triangular load.

#[test]
fn validation_ret_wall_ext_sheet_pile_free_earth() {
    let phi: f64 = 30.0_f64.to_radians();
    let gamma: f64 = 18.0;
    let ka: f64 = (1.0 - phi.sin()) / (1.0 + phi.sin());
    let kp: f64 = (1.0 + phi.sin()) / (1.0 - phi.sin());
    let h: f64 = 5.0;                 // m, retained height above excavation
    let d: f64 = 3.0;                 // m, embedment depth below excavation
    let h_anchor: f64 = 1.0;          // m, anchor depth below top

    // Verify Ka and Kp reciprocal relationship
    assert_close(ka * kp, 1.0, 0.01, "Ka * Kp = 1");

    // Active force on full height (H+D)
    let h_total: f64 = h + d;
    let pa: f64 = 0.5 * ka * gamma * h_total.powi(2);
    // = 0.5 * (1/3) * 18 * 64 = 192.0 kN/m
    assert_close(pa, 192.0, 0.02, "Active force Pa");

    // Passive force over embedment D
    let pp: f64 = 0.5 * kp * gamma * d.powi(2);
    // = 0.5 * 3 * 18 * 9 = 243.0 kN/m
    assert_close(pp, 243.0, 0.02, "Passive force Pp");

    // Moment about anchor point
    // Active acts at (H+D)/3 from toe
    let y_pa: f64 = h_total / 3.0;                       // from toe
    let arm_pa: f64 = (h_total - h_anchor) - y_pa;       // from anchor, sign matters
    // Passive acts at D/3 from toe
    let y_pp: f64 = d / 3.0;                              // from toe
    let arm_pp: f64 = (h_total - h_anchor) - y_pp;        // from anchor

    let m_active_about_anchor: f64 = pa * arm_pa;
    let m_passive_about_anchor: f64 = pp * arm_pp;

    // Factor of safety on embedment (moment ratio about anchor)
    let fs_embedment: f64 = m_passive_about_anchor / m_active_about_anchor;
    assert!(
        fs_embedment > 1.0,
        "Embedment FS = {:.2} > 1.0", fs_embedment
    );

    // Anchor force from horizontal equilibrium: T = Pa - Pp
    // (if Pp > Pa at this D, anchor is in tension resisting passive overshoot)
    let t_anchor: f64 = (pa - pp).abs();
    assert!(
        t_anchor > 0.0,
        "Anchor force T = {:.1} kN/m", t_anchor
    );

    // Solver verification: model the pile as a beam
    // Fixed at toe (embedment), roller at anchor level
    let l_total: f64 = h_total;
    let n_elem: usize = 16;
    let e_steel: f64 = 200_000.0;     // MPa
    let a_pile: f64 = 0.015;          // m^2 (sheet pile section per m)
    let iz_pile: f64 = 2.5e-5;        // m^4 (typical AZ26 or similar)

    // Net pressure distribution on the pile:
    // Above excavation (0 to H from top): only active, triangular
    // Below excavation (H to H+D): active minus passive (net)
    let mut loads = Vec::new();
    let elem_len: f64 = l_total / n_elem as f64;
    for i in 0..n_elem {
        let x_i: f64 = i as f64 * elem_len;   // distance from top
        let x_j: f64 = (i + 1) as f64 * elem_len;

        let p_active_i: f64 = ka * gamma * x_i;
        let p_active_j: f64 = ka * gamma * x_j;

        // Passive only below excavation level (x > H from top)
        let depth_below_exc_i: f64 = (x_i - h).max(0.0);
        let depth_below_exc_j: f64 = (x_j - h).max(0.0);
        let p_passive_i: f64 = kp * gamma * depth_below_exc_i;
        let p_passive_j: f64 = kp * gamma * depth_below_exc_j;

        let net_i: f64 = -(p_active_i - p_passive_i); // negative = toward excavation
        let net_j: f64 = -(p_active_j - p_passive_j);

        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: net_i,
            q_j: net_j,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(
        n_elem, l_total, e_steel, a_pile, iz_pile,
        "fixed", Some("rollerX"), loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // The solver should converge and produce a valid deformed shape
    let tip_disp = results.displacements.iter()
        .find(|d| d.node_id == n_elem + 1).unwrap();
    // Top deflection should be small (propped condition)
    assert!(
        tip_disp.uy.abs() < 0.1,
        "Top deflection = {:.4} m (should be restrained by anchor)", tip_disp.uy.abs()
    );
}

// ================================================================
// 7. Surcharge Loading: Additional Lateral Pressure
// ================================================================
//
// A uniform surcharge q on the backfill surface adds constant
// lateral pressure:
//   delta_sigma_h = Ka * q    (constant with depth)
//   delta_Pa      = Ka * q * H (acts at H/2, not H/3)
//   delta_M       = Ka * q * H^2 / 2 (moment at base)
//
// This rectangular pressure diagram is added to the triangular
// self-weight earth pressure diagram.
//
// Reference: Das (9th ed.), Section 13.3; Bowles (1996), Section 12.3
//
// Solver verification: compare cantilever wall deflection with and
// without surcharge, verifying superposition.

#[test]
fn validation_ret_wall_ext_surcharge_loading() {
    let phi: f64 = 30.0_f64.to_radians();
    let gamma_s: f64 = 18.0;
    let ka: f64 = (1.0 - phi.sin()) / (1.0 + phi.sin());
    let q: f64 = 15.0;                // kPa, uniform surcharge
    let h: f64 = 5.0;                 // m, wall height

    // --- Analytical surcharge effects ---
    // Additional lateral pressure (constant with depth)
    let delta_sigma: f64 = ka * q;
    // = (1/3) * 15 = 5.0 kPa
    assert_close(delta_sigma, 5.0, 0.02, "Surcharge lateral pressure");

    // Additional horizontal force
    let delta_pa: f64 = ka * q * h;
    // = (1/3) * 15 * 5 = 25.0 kN/m
    assert_close(delta_pa, 25.0, 0.02, "Surcharge force");

    // Surcharge force acts at H/2 (rectangular pressure)
    let arm_surcharge: f64 = h / 2.0;
    let delta_m: f64 = delta_pa * arm_surcharge;
    // = 25 * 2.5 = 62.5 kN-m/m
    assert_close(delta_m, 62.5, 0.02, "Surcharge moment at base");

    // Self-weight earth pressure moment at base
    let m_self: f64 = ka * gamma_s * h.powi(3) / 6.0;
    // = (1/3)*18*125/6 = 125.0 kN-m/m
    assert_close(m_self, 125.0, 0.02, "Self-weight M_base");

    // Total moment = self-weight + surcharge
    let m_total_analytical: f64 = m_self + delta_m;
    assert_close(m_total_analytical, 187.5, 0.02, "Total M_base analytical");

    // --- Solver verification: superposition ---
    let n_elem: usize = 10;
    let e_concrete: f64 = 25_000.0;
    let t_wall: f64 = 0.40;
    let a_wall: f64 = t_wall * 1.0;
    let iz_wall: f64 = 1.0 * t_wall.powi(3) / 12.0;
    let p_max_soil: f64 = ka * gamma_s * h;

    // Combined load: triangular (soil) + uniform (surcharge)
    // Base at x=0 (fixed), top at x=H (free)
    let mut loads_combined = Vec::new();
    for i in 0..n_elem {
        let xi: f64 = i as f64 / n_elem as f64;
        let xj: f64 = (i + 1) as f64 / n_elem as f64;
        // Soil: triangular from p_max_soil at base to 0 at top
        // Surcharge: constant delta_sigma over full height
        let qi: f64 = -(p_max_soil * (1.0 - xi) + delta_sigma);
        let qj: f64 = -(p_max_soil * (1.0 - xj) + delta_sigma);
        loads_combined.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: qi,
            q_j: qj,
            a: None,
            b: None,
        }));
    }

    let input_combined = make_beam(
        n_elem, h, e_concrete, a_wall, iz_wall,
        "fixed", None, loads_combined,
    );
    let res_combined = linear::solve_2d(&input_combined).unwrap();
    let r_combined = res_combined.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Solver combined moment at base should match analytical total
    assert_close(
        r_combined.mz.abs(), m_total_analytical, 0.04,
        "Solver combined M_base vs analytical"
    );

    // Also verify: soil-only case (triangular from base to top)
    let mut loads_soil_only = Vec::new();
    for i in 0..n_elem {
        let xi: f64 = i as f64 / n_elem as f64;
        let xj: f64 = (i + 1) as f64 / n_elem as f64;
        // Pressure decreases from base (x=0) to top (x=H)
        loads_soil_only.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -(p_max_soil * (1.0 - xi)),
            q_j: -(p_max_soil * (1.0 - xj)),
            a: None,
            b: None,
        }));
    }

    let input_soil = make_beam(
        n_elem, h, e_concrete, a_wall, iz_wall,
        "fixed", None, loads_soil_only,
    );
    let res_soil = linear::solve_2d(&input_soil).unwrap();
    let r_soil = res_soil.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_soil.mz.abs(), m_self, 0.04, "Solver soil-only M_base");

    // Surcharge contribution = combined - soil only (superposition)
    let m_surcharge_solver: f64 = r_combined.mz.abs() - r_soil.mz.abs();
    assert_close(m_surcharge_solver, delta_m, 0.05, "Surcharge contribution by superposition");
}

// ================================================================
// 8. Seismic Earth Pressure: Mononobe-Okabe Extension
// ================================================================
//
// The Mononobe-Okabe (M-O) method extends Coulomb theory to include
// seismic inertial forces. It is the standard for seismic earth
// pressure design.
//
// Dynamic active earth pressure coefficient:
//   K_ae = cos^2(phi - theta - alpha) /
//          [cos(theta)*cos^2(alpha)*cos(delta+alpha+theta)*
//           (1 + sqrt(sin(phi+delta)*sin(phi-theta-beta) /
//                     (cos(delta+alpha+theta)*cos(beta-alpha))))^2]
//
// where:
//   theta = atan(kh / (1 - kv))  (seismic inertia angle)
//   kh    = horizontal seismic coefficient (0.1 to 0.3 typical)
//   kv    = vertical seismic coefficient (0 to kh/2)
//   alpha = wall face angle from vertical (0 for vertical)
//   beta  = backfill slope angle (0 for level)
//   delta = wall friction angle
//
// Total dynamic active force:
//   P_ae = 0.5 * K_ae * gamma * H^2 * (1 - kv)
//
// Incremental dynamic component:
//   delta_P_ae = P_ae - Pa_static
//   Acts at approximately 0.6*H from base (Seed & Whitman, 1970)
//
// Reference: Seed & Whitman (1970); AASHTO LRFD §11.6.5;
//            EN 1998-5 (EC8-5), Section 7.3

#[test]
fn validation_ret_wall_ext_seismic_mononobe_okabe() {
    let phi: f64 = 35.0_f64.to_radians();
    let delta_w: f64 = (2.0 / 3.0 * 35.0_f64).to_radians(); // wall friction ~ 2/3*phi
    let _alpha: f64 = 0.0_f64.to_radians(); // vertical wall (used in full M-O formula)
    let beta: f64 = 0.0_f64.to_radians();   // level backfill
    let gamma: f64 = 19.0;
    let h: f64 = 6.0;

    // Seismic coefficients
    let kh: f64 = 0.15;               // horizontal PGA/g (moderate seismicity)
    let kv: f64 = 0.0;                // vertical (often neglected or kh/2)

    // Seismic inertia angle
    let theta: f64 = (kh / (1.0 - kv)).atan();

    // --- Static Rankine Ka (for comparison, vertical wall, level backfill) ---
    // Use Rankine for static case since Coulomb reduces to Rankine when delta=0
    // and the full Coulomb formula with alpha measured from vertical requires
    // a different convention. Rankine is the standard static reference.
    let ka_static: f64 = (1.0 - phi.sin()) / (1.0 + phi.sin());
    // For phi=35 deg: Ka = (1-0.5736)/(1+0.5736) = 0.2710

    // Static active force
    let pa_static: f64 = 0.5 * ka_static * gamma * h * h;

    // --- Mononobe-Okabe K_ae ---
    // For vertical wall (alpha = 90 deg in Coulomb convention, but here alpha=0
    // means vertical face inclination from horizontal; we use the standard form
    // where alpha is measured from vertical).
    //
    // Simplified M-O for vertical wall, level backfill, no wall friction:
    //   K_ae_simplified = cos^2(phi - theta) /
    //                     [cos(theta) * (1 + sqrt(sin(phi)*sin(phi-theta)))^2]
    //
    // With wall friction delta_w:
    let num_ae: f64 = (phi - theta).cos().powi(2);
    let sqrt_ae: f64 = ((phi + delta_w).sin() * (phi - theta - beta).sin()
        / ((delta_w + theta).cos() * (beta).cos())).sqrt();
    let denom_ae: f64 = theta.cos() * (delta_w + theta).cos()
        * (1.0 + sqrt_ae).powi(2);
    let k_ae: f64 = num_ae / denom_ae;

    // K_ae should be greater than static Ka (seismic increases pressure)
    assert!(
        k_ae > ka_static,
        "K_ae = {:.4} > Ka_static = {:.4}", k_ae, ka_static
    );

    // Total dynamic active force
    let p_ae: f64 = 0.5 * k_ae * gamma * h * h * (1.0 - kv);

    // P_ae should exceed static Pa
    assert!(
        p_ae > pa_static,
        "P_ae = {:.1} > Pa_static = {:.1} kN/m", p_ae, pa_static
    );

    // Dynamic increment
    let delta_pae: f64 = p_ae - pa_static;
    assert!(
        delta_pae > 0.0,
        "Dynamic increment = {:.1} kN/m (positive)", delta_pae
    );

    // Seed & Whitman (1970) simplified approximation:
    // delta_P_ae ~ 3/4 * kh * gamma * H^2
    let delta_pae_sw: f64 = 0.75 * kh * gamma * h * h;
    // Check that M-O increment is in reasonable agreement with Seed-Whitman
    let sw_ratio: f64 = delta_pae / delta_pae_sw;
    assert!(
        sw_ratio > 0.3 && sw_ratio < 3.0,
        "M-O/Seed-Whitman ratio = {:.2} (should be O(1))", sw_ratio
    );

    // Point of application of dynamic increment: 0.6*H from base (Seed & Whitman)
    let arm_dynamic: f64 = 0.6 * h;
    let arm_static: f64 = h / 3.0;

    // Total overturning moment (combined static + seismic)
    let m_total: f64 = pa_static * arm_static + delta_pae * arm_dynamic;
    let m_static_only: f64 = pa_static * arm_static;

    // Seismic amplification of overturning moment
    let seismic_amplification: f64 = m_total / m_static_only;
    assert!(
        seismic_amplification > 1.2,
        "Seismic amplification = {:.2} (>1.2 expected for kh=0.15)",
        seismic_amplification
    );

    // Verify that increasing kh increases K_ae monotonically
    let kh2: f64 = 0.25;
    let theta2: f64 = (kh2 / (1.0 - kv)).atan();
    let num_ae2: f64 = (phi - theta2).cos().powi(2);
    let sqrt_ae2: f64 = ((phi + delta_w).sin() * (phi - theta2 - beta).sin()
        / ((delta_w + theta2).cos() * (beta).cos())).sqrt();
    let denom_ae2: f64 = theta2.cos() * (delta_w + theta2).cos()
        * (1.0 + sqrt_ae2).powi(2);
    let k_ae2: f64 = num_ae2 / denom_ae2;

    assert!(
        k_ae2 > k_ae,
        "K_ae(kh=0.25)={:.4} > K_ae(kh=0.15)={:.4}", k_ae2, k_ae
    );
}
