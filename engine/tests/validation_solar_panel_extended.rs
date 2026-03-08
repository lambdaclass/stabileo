/// Validation: Solar Panel / Photovoltaic Mounting Structure Analysis
///
/// References:
///   - ASCE 7-22: Minimum Design Loads for Buildings and Other Structures
///   - IBC 2021 + IRC: Solar panel racking and mounting requirements
///   - UL 2703: Rack Mounting Systems for Photovoltaic Modules
///   - SolarABCs: Best Practices for PV Module Mounting and Racking
///   - API RP 2A: Foundation pile lateral capacity (p-y curves)
///   - Timoshenko & Gere: Theory of Elastic Stability
///   - Roark's Formulas for Stress and Strain, 8th ed.
///
/// Tests verify ground-mount racking, rooftop ballasted system,
/// single-axis tracker torque tube, carport canopy, wind uplift,
/// snow sliding load, panel deflection serviceability, and
/// foundation pile lateral capacity.

mod helpers;

use dedaliano_engine::{types::*, solver::linear::*};
use helpers::*;

// ================================================================
// 1. Ground-Mount Racking: Inclined Simply-Supported Purlin
// ================================================================
//
// A ground-mount solar racking system supports PV modules on purlins
// spanning between driven-pile posts. The purlin is a C-channel steel
// section inclined at a tilt angle. For structural analysis, the purlin
// is modeled as a horizontal simply-supported beam under the gravity
// component of panel weight plus snow.
//
// Panel dead load: 0.15 kN/m^2 (module + clamps)
// Snow load: 0.50 kN/m^2 (ground snow, reduced for tilt)
// Tributary width: 1.0 m (panel width)
// Span: 3.0 m (post spacing)
//
// Analytical:
//   q = (DL + SL) * trib_width * cos(tilt)  [gravity component normal to span]
//   M_max = qL^2/8 (SS beam)
//   delta_max = 5qL^4/(384EI)

#[test]
fn solar_ground_mount_racking_purlin() {
    // Purlin: C100x50x2.5 cold-formed steel
    let e_steel: f64 = 200_000.0; // MPa
    let a_purlin: f64 = 4.75e-4;  // m^2, approximate area
    let iz_purlin: f64 = 1.50e-6; // m^4, strong-axis inertia
    let l: f64 = 3.0;             // m, span between posts
    let n: usize = 8;

    // Loading (gravity component along beam local y-axis)
    let tilt_deg: f64 = 25.0;
    let tilt_rad: f64 = tilt_deg * std::f64::consts::PI / 180.0;
    let cos_tilt: f64 = tilt_rad.cos();
    let dl: f64 = 0.15;  // kN/m^2, dead load (panel + clamps)
    let sl: f64 = 0.50;  // kN/m^2, snow load
    let trib: f64 = 1.0; // m, tributary width

    // Line load on purlin (gravity projected normal to purlin axis)
    let q: f64 = -(dl + sl) * trib * cos_tilt; // kN/m, downward

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, e_steel, a_purlin, iz_purlin, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Analytical midspan moment: M = qL^2/8
    let m_exact: f64 = q.abs() * l * l / 8.0;

    // Check reaction: R = qL/2
    let r_exact: f64 = q.abs() * l / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry.abs(), r_exact, 0.03, "Ground-mount purlin reaction");

    // Check midspan deflection: delta = 5qL^4/(384EI)
    let e_eff: f64 = e_steel * 1000.0;
    let delta_exact: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * iz_purlin);
    let mid_node = n / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();
    assert_close(mid_disp.uy.abs(), delta_exact, 0.05, "Ground-mount purlin midspan deflection");

    // Verify midspan moment via element forces near midspan
    // Element at midspan: element n/2 has m_end close to M_max
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == (n / 2) as usize).unwrap();
    assert_close(ef_mid.m_end.abs(), m_exact, 0.10, "Ground-mount purlin midspan moment");
}

// ================================================================
// 2. Rooftop Ballasted System: Continuous Beam Over Ballast Blocks
// ================================================================
//
// Ballasted rooftop solar racking uses weight (concrete ballast blocks)
// to resist wind uplift without roof penetrations. The rail spans
// continuously over multiple ballast block supports.
//
// Model as 3-span continuous beam (4 supports) under uniform DL+LL.
// Analytical results for equal-span continuous beam with UDL:
//   Internal support reaction R_int = 1.1*qL (3-moment equation result)
//   End reaction R_end = 0.4*qL
//
// Rail: aluminum 6005-T5 extrusion
// Span: 1.5 m between ballast blocks

#[test]
fn solar_rooftop_ballasted_system() {
    let e_alum: f64 = 70_000.0;   // MPa, aluminum 6005-T5
    let a_rail: f64 = 3.00e-4;    // m^2, rail cross-section area
    let iz_rail: f64 = 5.00e-7;   // m^4, rail inertia
    let span: f64 = 1.5;          // m, between ballast block supports
    let n_per_span: usize = 4;

    // Loading: panel weight + ballast block tributary
    let q_panel: f64 = 0.15;     // kN/m^2, panel dead load
    let trib: f64 = 1.0;         // m, tributary width
    let q: f64 = -(q_panel * trib); // kN/m, downward

    // 3-span continuous beam
    let spans = vec![span, span, span];
    let total_elements = n_per_span * 3;

    let mut loads = Vec::new();
    for i in 0..total_elements {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&spans, n_per_span, e_alum, a_rail, iz_rail, loads);
    let results = solve_2d(&input).expect("solve");

    // Total load
    let total_length: f64 = 3.0 * span;
    let total_load: f64 = q.abs() * total_length;

    // Sum of vertical reactions equals total load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum::<f64>();
    assert_close(sum_ry.abs(), total_load, 0.02, "Ballasted system total reaction");

    // For 3-span continuous beam with equal UDL:
    // End reactions R_end = 0.4*q*L, internal reactions R_int = 1.1*q*L
    let r_end_exact: f64 = 0.4 * q.abs() * span;
    let r_int_exact: f64 = 1.1 * q.abs() * span;

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let mid_node_1 = n_per_span + 1; // first internal support
    let r_int1 = results.reactions.iter().find(|r| r.node_id == mid_node_1).unwrap();

    assert_close(r1.ry.abs(), r_end_exact, 0.05, "Ballasted end support reaction");
    assert_close(r_int1.ry.abs(), r_int_exact, 0.05, "Ballasted internal support reaction");

    // Deflection check: should be small for short span aluminum rail
    let quarter_node = n_per_span / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == quarter_node).unwrap();
    let limit: f64 = span / 180.0; // L/180 serviceability limit
    assert!(
        mid_disp.uy.abs() < limit,
        "Rail deflection {:.5} m < L/180 = {:.5} m", mid_disp.uy.abs(), limit
    );
}

// ================================================================
// 3. Single-Axis Tracker Torque Tube: Torsion-Induced Bending
// ================================================================
//
// Single-axis trackers use a central torque tube driven by a slew
// drive motor. The tube spans between bearing supports. When the
// tracker is at a tilt angle, wind and gravity produce transverse
// loads along the tube span.
//
// Model: SS beam representing the torque tube section between two
// bearing supports, loaded by panel weight distributed along the span.
// Verify bending moment and deflection.
//
// Torque tube: 3" round HSS (76.2 mm OD, 3.2 mm wall), steel
// Span: 6.0 m between bearings
// Panel line load: 0.20 kN/m (dead weight of modules on each side)

#[test]
fn solar_tracker_torque_tube() {
    let d_outer: f64 = 0.0762;    // m, 3" OD
    let d_inner: f64 = 0.0762 - 2.0 * 0.0032; // m
    let a_tube: f64 = std::f64::consts::PI / 4.0 * (d_outer.powi(2) - d_inner.powi(2));
    let iz_tube: f64 = std::f64::consts::PI / 64.0 * (d_outer.powi(4) - d_inner.powi(4));

    let e_steel: f64 = 200_000.0; // MPa
    let l: f64 = 6.0;             // m, span between bearings
    let n: usize = 12;

    // Gravity load from panels at tracking angle
    let track_angle_deg: f64 = 45.0;
    let track_rad: f64 = track_angle_deg * std::f64::consts::PI / 180.0;
    let cos_track: f64 = track_rad.cos();
    let q_panel_total: f64 = 0.20; // kN/m, total panel dead load per unit length
    let q: f64 = -(q_panel_total * cos_track); // transverse component, kN/m

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, e_steel, a_tube, iz_tube, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Analytical midspan moment: M = qL^2/8
    let m_exact: f64 = q.abs() * l * l / 8.0;

    // Reaction: R = qL/2
    let r_exact: f64 = q.abs() * l / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry.abs(), r_exact, 0.02, "Tracker tube support reaction");

    // Midspan deflection: delta = 5qL^4/(384EI)
    let e_eff: f64 = e_steel * 1000.0;
    let delta_exact: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * iz_tube);
    let mid_node = n / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();
    assert_close(mid_disp.uy.abs(), delta_exact, 0.05, "Tracker tube midspan deflection");

    // Bending stress check: sigma = M*c/I
    let c: f64 = d_outer / 2.0;
    let sigma_kpa: f64 = m_exact * c / iz_tube; // kN/m^2
    let sigma_mpa: f64 = sigma_kpa / 1000.0;
    let fy: f64 = 250.0; // MPa, ASTM A500 Gr B
    assert!(
        sigma_mpa < fy,
        "Tube bending stress {:.1} MPa < yield {:.1} MPa", sigma_mpa, fy
    );

    // Verify element forces near midspan
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == (n / 2) as usize).unwrap();
    assert_close(ef_mid.m_end.abs(), m_exact, 0.10, "Tracker tube midspan moment");
}

// ================================================================
// 4. Carport Canopy: Portal Frame Under Gravity and Wind
// ================================================================
//
// Solar carport canopy consists of portal frames (columns + beam)
// spanning a parking bay. Panels are mounted on the beam.
//
// Model as a fixed-base portal frame:
//   - Columns: W150 steel, height 3.0 m
//   - Beam: W200 steel, span 6.0 m
//   - Gravity load: panel + snow = 0.8 kN/m^2 * 3 m tributary = 2.4 kN/m
//   - Lateral wind: 5 kN at beam level
//
// Verify horizontal reactions, moment distribution, and sway.

#[test]
fn solar_carport_canopy_portal() {
    let h: f64 = 3.0;    // m, column height
    let w: f64 = 6.0;    // m, beam span
    let e_steel: f64 = 200_000.0; // MPa

    // Section: typical W-shape, same for columns and beam
    let a: f64 = 3.50e-3;   // m^2
    let iz: f64 = 2.50e-5;  // m^4

    // Loading
    let f_wind: f64 = 5.0;   // kN, lateral at beam level
    let q_gravity: f64 = 2.4; // kN/m on beam (panel + snow tributary)

    // Total gravity as equivalent point loads at beam-column joints
    let p_gravity: f64 = -(q_gravity * w / 2.0); // kN at each joint, downward

    let input = make_portal_frame(h, w, e_steel, a, iz, f_wind, p_gravity);
    let results = solve_2d(&input).expect("solve");

    // Horizontal equilibrium: sum(Rx) + F_wind = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close((sum_rx + f_wind).abs(), 0.0, 0.05, "Carport horizontal equilibrium");

    // Vertical equilibrium: sum(Ry) = total gravity
    let total_gravity: f64 = 2.0 * p_gravity.abs();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum::<f64>();
    assert_close(sum_ry.abs(), total_gravity, 0.02, "Carport vertical equilibrium");

    // Both bases are fixed, so both have moment reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert!(r1.mz.abs() > 0.0, "Left base moment is non-zero");
    assert!(r4.mz.abs() > 0.0, "Right base moment is non-zero");

    // Sway at beam level: lateral displacement at top of column
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Both top nodes should sway in the wind direction
    assert!(d2.ux > 0.0, "Left top sways in wind direction");
    assert!(d3.ux > 0.0, "Right top sways in wind direction");

    // Sway limit: H/200 for serviceability
    let sway_limit: f64 = h / 200.0;
    let max_sway: f64 = d2.ux.abs().max(d3.ux.abs());
    assert!(
        max_sway < sway_limit,
        "Sway {:.5} m < H/200 = {:.5} m", max_sway, sway_limit
    );
}

// ================================================================
// 5. Wind Uplift on Panel: Cantilevered Module Overhang
// ================================================================
//
// Wind uplift on an overhanging PV module edge creates a cantilever
// bending scenario. The module rail extends past the last support
// as a cantilever with net upward wind pressure.
//
// Model: beam with fixed support at left, free end (cantilever)
// Cantilever length: 0.6 m (module overhang beyond last clamp)
// Wind uplift: 1.5 kN/m^2 (ASCE 7 Component & Cladding, GCp=-2.0)
// Tributary width: 1.0 m
//
// Analytical:
//   M_fixed = qL^2/2 (cantilever with UDL)
//   delta_tip = qL^4/(8EI)

#[test]
fn solar_wind_uplift_cantilever() {
    let e_alum: f64 = 70_000.0;   // MPa, aluminum rail
    let a_rail: f64 = 2.50e-4;    // m^2
    let iz_rail: f64 = 3.50e-7;   // m^4
    let l: f64 = 0.6;             // m, cantilever overhang
    let n: usize = 4;

    // Wind uplift pressure
    let p_wind: f64 = 1.5;       // kN/m^2, net uplift
    let trib: f64 = 1.0;         // m, tributary width
    let q: f64 = p_wind * trib;  // kN/m, upward (positive in local y)

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    // Fixed at left (node 1), free at right (no end support)
    let input = make_beam(n, l, e_alum, a_rail, iz_rail, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Analytical: cantilever under UDL
    // Reaction: R = qL (vertical), M = qL^2/2 (moment at fixed end)
    let r_exact: f64 = q * l;
    let m_exact: f64 = q * l * l / 2.0;

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry.abs(), r_exact, 0.03, "Wind uplift cantilever reaction");
    assert_close(r1.mz.abs(), m_exact, 0.05, "Wind uplift cantilever fixed-end moment");

    // Tip deflection: delta = qL^4/(8EI)
    let e_eff: f64 = e_alum * 1000.0;
    let delta_exact: f64 = q * l.powi(4) / (8.0 * e_eff * iz_rail);
    let tip_node = n + 1;
    let tip_disp = results.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap();
    assert_close(tip_disp.uy.abs(), delta_exact, 0.05, "Wind uplift tip deflection");

    // Verify uplift direction: positive uy means upward
    assert!(tip_disp.uy > 0.0, "Tip deflects upward due to wind uplift");

    // Stress check at fixed end: sigma = M*c/I
    // For aluminum rail, approximate depth 40 mm
    let depth: f64 = 0.040;
    let c: f64 = depth / 2.0;
    let sigma_kpa: f64 = m_exact * c / iz_rail;
    let sigma_mpa: f64 = sigma_kpa / 1000.0;
    let fy_alum: f64 = 215.0; // MPa, 6005-T5
    assert!(
        sigma_mpa < fy_alum,
        "Rail stress {:.1} MPa < aluminum yield {:.1} MPa", sigma_mpa, fy_alum
    );
}

// ================================================================
// 6. Snow Sliding Load: Inclined Beam with Triangular Load
// ================================================================
//
// On tilted solar panels, snow can accumulate more at the lower edge
// due to sliding. This is modeled as a triangular (linearly varying)
// distributed load: zero at the top edge, maximum at the bottom edge.
//
// Model: SS beam with triangular load (q_i=0, q_j=q_max).
// Analytical (Roark's):
//   R_left = qL/6 (at zero-load end)
//   R_right = qL/3 (at max-load end)
//   M_max at x = L/sqrt(3) from left end = qL^2/(9*sqrt(3))
//
// Purlin span: 2.5 m
// Peak snow sliding load: 0.60 kN/m at lower edge

#[test]
fn solar_snow_sliding_triangular_load() {
    let e_steel: f64 = 200_000.0; // MPa
    let a_purlin: f64 = 4.00e-4;  // m^2
    let iz_purlin: f64 = 1.20e-6; // m^4
    let l: f64 = 2.5;             // m, purlin span
    let n: usize = 10;

    // Triangular load: zero at left (top of panel), max at right (bottom)
    let q_max: f64 = -0.60;       // kN/m, downward at right end
    let elem_len: f64 = l / n as f64;

    // Build linearly varying load on each element
    let mut loads = Vec::new();
    for i in 0..n {
        let x_start: f64 = i as f64 * elem_len;
        let x_end: f64 = (i + 1) as f64 * elem_len;
        let q_start: f64 = q_max * (x_start / l);
        let q_end: f64 = q_max * (x_end / l);
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_start, q_j: q_end, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, e_steel, a_purlin, iz_purlin, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Total load = q_max * L / 2
    let total_load: f64 = q_max.abs() * l / 2.0;

    // Reactions for triangular load on SS beam:
    //   R_left (at zero end) = q_max*L/6
    //   R_right (at max end) = q_max*L/3
    let r_left_exact: f64 = q_max.abs() * l / 6.0;
    let r_right_exact: f64 = q_max.abs() * l / 3.0;

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rn = results.reactions.iter().find(|r| r.node_id == (n + 1)).unwrap();

    assert_close(r1.ry.abs(), r_left_exact, 0.05, "Snow sliding left reaction (q=0 end)");
    assert_close(rn.ry.abs(), r_right_exact, 0.05, "Snow sliding right reaction (q=max end)");

    // Verify total vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum::<f64>();
    assert_close(sum_ry.abs(), total_load, 0.03, "Snow sliding total reaction equilibrium");

    // Maximum moment at x = L/sqrt(3) from left: M = qL^2 / (9*sqrt(3))
    let sqrt3: f64 = 3.0_f64.sqrt();
    let m_max_exact: f64 = q_max.abs() * l * l / (9.0 * sqrt3);

    // Find the element closest to x = L/sqrt(3)
    let x_mmax: f64 = l / sqrt3;
    let elem_at_mmax: usize = (x_mmax / elem_len).floor() as usize + 1;
    let ef = results.element_forces.iter()
        .find(|e| e.element_id == elem_at_mmax).unwrap();
    // The maximum moment is between m_start and m_end of this element
    let m_approx: f64 = ef.m_start.abs().max(ef.m_end.abs());
    assert_close(m_approx, m_max_exact, 0.15, "Snow sliding maximum bending moment");
}

// ================================================================
// 7. Panel Deflection Serviceability: Multi-Span Rail Check
// ================================================================
//
// PV module rails must satisfy deflection limits to prevent panel
// cracking. UL 2703 and module manufacturer specs typically require
// deflection < L/120 or L/150 under design loads.
//
// Model: 2-span continuous beam (representing rail over 3 clamp points)
// Span: 1.2 m (typical clamp spacing for 72-cell modules)
// Design load: 2.4 kN/m^2 (dead + wind + snow combined)
// Tributary width: 0.5 m (half-module width to rail)
//
// Verify deflection meets L/120 serviceability criterion.

#[test]
fn solar_panel_deflection_serviceability() {
    let e_alum: f64 = 70_000.0;   // MPa, aluminum 6061-T6
    let a_rail: f64 = 2.80e-4;    // m^2
    let iz_rail: f64 = 4.50e-7;   // m^4
    let span: f64 = 1.2;          // m, clamp spacing
    let n_per_span: usize = 6;

    // Design load combination
    let p_design: f64 = 2.4;      // kN/m^2, combined design load
    let trib: f64 = 0.5;          // m, half-module tributary width
    let q: f64 = -(p_design * trib); // kN/m, downward

    // 2-span continuous beam
    let total_elements = n_per_span * 2;
    let mut loads = Vec::new();
    for i in 0..total_elements {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let spans = vec![span, span];
    let input = make_continuous_beam(&spans, n_per_span, e_alum, a_rail, iz_rail, loads);
    let results = solve_2d(&input).expect("solve");

    // Total load
    let total_length: f64 = 2.0 * span;
    let total_load: f64 = q.abs() * total_length;

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum::<f64>();
    assert_close(sum_ry.abs(), total_load, 0.02, "Rail total reaction");

    // For 2-span continuous beam with equal UDL:
    // Internal reaction = 5qL/4, end reactions = 3qL/8
    let r_int_exact: f64 = 5.0 * q.abs() * span / 4.0;
    let r_end_exact: f64 = 3.0 * q.abs() * span / 8.0;

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let mid_node = n_per_span + 1;
    let r_int = results.reactions.iter().find(|r| r.node_id == mid_node).unwrap();

    assert_close(r1.ry.abs(), r_end_exact, 0.05, "Rail end reaction (3qL/8)");
    assert_close(r_int.ry.abs(), r_int_exact, 0.05, "Rail internal reaction (5qL/4)");

    // Find maximum deflection in first span
    let mut max_deflection: f64 = 0.0;
    for d in &results.displacements {
        let def: f64 = d.uy.abs();
        if def > max_deflection {
            max_deflection = def;
        }
    }

    // Serviceability check: L/120
    let limit: f64 = span / 120.0;
    assert!(
        max_deflection < limit,
        "Max deflection {:.5} m < L/120 = {:.5} m ({:.2} mm vs {:.2} mm limit)",
        max_deflection, limit, max_deflection * 1000.0, limit * 1000.0
    );

    // Also verify against L/150 (stricter, some manufacturers require this)
    let strict_limit: f64 = span / 150.0;
    assert!(
        max_deflection < strict_limit,
        "Max deflection {:.5} m < L/150 = {:.5} m", max_deflection, strict_limit
    );
}

// ================================================================
// 8. Foundation Pile Lateral Capacity: Cantilever Pile in Soil
// ================================================================
//
// Ground-mount solar racking is often supported on driven steel piles
// (W6x9 or similar). Lateral wind loads on the panel array are
// transmitted to the pile as a lateral force and overturning moment
// at the ground line. The embedded pile is modeled as a cantilever
// beam with an equivalent fixity depth below grade.
//
// Simplified Broms' method: effective fixity depth L_f = 1.4 * T
//   where T = (EI/n_h)^0.2, n_h = subgrade modulus constant (kN/m^3)
// Model the above-grade portion + fixity length as a cantilever
// (fixed at effective fixity point, free at top).
//
// Pile: W150x13 (A=1690 mm^2, Ix=6.83e6 mm^4)
// Above-grade height: 1.5 m
// Effective fixity depth: 1.2 m (for medium-dense sand, n_h=15000 kN/m^3)
// Applied lateral load at top: 3.0 kN (wind on tributary panel area)

#[test]
fn solar_foundation_pile_lateral() {
    let e_steel: f64 = 200_000.0;  // MPa
    let a_pile: f64 = 1.69e-3;     // m^2, W150x13
    let iz_pile: f64 = 6.83e-6;    // m^4, Ix

    // Pile geometry
    let h_above: f64 = 1.5;       // m, above grade
    // Broms effective fixity depth: L_f = 1.4 * T, T = (EI/n_h)^0.2
    let n_h: f64 = 15_000.0;      // kN/m^3, subgrade modulus for medium-dense sand
    let e_eff_pre: f64 = e_steel * 1000.0; // kN/m^2
    let t_broms: f64 = (e_eff_pre * iz_pile / n_h).powf(0.2);
    let l_fixity: f64 = 1.4 * t_broms; // effective fixity depth
    let l_total: f64 = h_above + l_fixity; // total cantilever length
    let n: usize = 8;

    // Lateral wind load at top of pile
    let p_lateral: f64 = 3.0;     // kN

    // Build cantilever: fixed at bottom (node 1), free at top
    // Pile is vertical, but we model horizontally (beam along X, load in Y)
    // Fixed at left (ground fixity point), free at right (top of pile)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: p_lateral, mz: 0.0,
    })];

    let input = make_beam(n, l_total, e_steel, a_pile, iz_pile, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Analytical cantilever: point load P at free end
    // Reaction: R = P (vertical), M = P*L (moment at fixed end)
    let r_exact: f64 = p_lateral;
    let m_exact: f64 = p_lateral * l_total;

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry.abs(), r_exact, 0.02, "Pile lateral reaction");
    assert_close(r1.mz.abs(), m_exact, 0.03, "Pile fixed-end moment");

    // Tip deflection: delta = PL^3/(3EI)
    let e_eff: f64 = e_steel * 1000.0;
    let delta_exact: f64 = p_lateral * l_total.powi(3) / (3.0 * e_eff * iz_pile);
    let tip_node = n + 1;
    let tip_disp = results.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap();
    assert_close(tip_disp.uy.abs(), delta_exact, 0.03, "Pile tip lateral deflection");

    // Moment at ground line (x = l_fixity from fixed end)
    // M(x) = P*(L - x), so at ground line: M_gl = P * h_above
    let m_ground: f64 = p_lateral * h_above;

    // Find element at ground-line position
    let elem_len: f64 = l_total / n as f64;
    let gl_elem: usize = (l_fixity / elem_len).floor() as usize + 1;
    let ef_gl = results.element_forces.iter()
        .find(|e| e.element_id == gl_elem).unwrap();
    // Moment at end of this element should be close to M_ground
    let m_gl_approx: f64 = ef_gl.m_end.abs();
    assert_close(m_gl_approx, m_ground, 0.15, "Pile moment at ground line");

    // Verify the pile can sustain the moment: sigma = M*c/I < Fy
    let depth: f64 = 0.150;       // m, W150 depth
    let c: f64 = depth / 2.0;
    let sigma_kpa: f64 = m_exact * c / iz_pile;
    let sigma_mpa: f64 = sigma_kpa / 1000.0;
    let fy: f64 = 345.0; // MPa, A992 Grade 50
    assert!(
        sigma_mpa < fy,
        "Pile bending stress {:.1} MPa < yield {:.1} MPa", sigma_mpa, fy
    );

    // Verify Broms fixity depth is in a physically reasonable range
    // For medium-dense sand with W150 pile, expect 0.5 m < L_f < 2.0 m
    assert!(
        l_fixity > 0.5 && l_fixity < 2.0,
        "Broms fixity depth {:.3} m is in expected range [0.5, 2.0]", l_fixity
    );

    // Verify the above-grade deflection is a subset of total
    // At ground line (x = l_fixity), deflection = P*l_fixity^2*(3*l_total - l_fixity)/(6EI)
    let delta_gl: f64 = p_lateral * l_fixity.powi(2) * (3.0 * l_total - l_fixity)
        / (6.0 * e_eff * iz_pile);
    assert!(
        delta_gl < delta_exact,
        "Ground-line deflection {:.5} < tip deflection {:.5}", delta_gl, delta_exact
    );
}
