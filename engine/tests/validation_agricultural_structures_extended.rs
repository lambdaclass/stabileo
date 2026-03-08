/// Validation: Agricultural Structures — Extended Analysis
///
/// References:
///   - Midwest Plan Service (MWPS): "Structures and Environment Handbook" (2004)
///   - ASAE EP433: Loads for farm buildings
///   - ACI 313: Standard Practice for Design of Concrete Bins, Silos, and Bunkers
///   - Janssen (1895): Silo wall pressure theory
///   - NRCS Conservation Practice Standards: Waste storage (313), Feed storage
///   - Timoshenko & Gere: "Theory of Elastic Stability" (thin shells & rings)
///   - AISC Steel Construction Manual: Portal frame design
///   - Roark: "Formulas for Stress and Strain" (ring under internal pressure)
///
/// Tests verify grain bin hoop tension, barn rigid frames, greenhouse arches,
/// feed bunker retaining walls, manure lagoon liners, silo discharge funnels,
/// hay storage trusses, and equipment shed portal frames.

mod helpers;

use dedaliano_engine::{types::*, solver::linear::*};
use helpers::*;

// ================================================================
// 1. Grain Bin Wall: Hoop Tension in Cylindrical Shell Ring
// ================================================================
//
// A circular grain bin wall experiences lateral (Janssen) pressure
// from stored grain. For a thin ring of unit height under internal
// pressure p, the hoop tension is T = p * R, where R is the radius.
//
// We approximate one quadrant of the ring as a curved beam made of
// straight segments. A quarter-ring under symmetric pressure is
// modeled as a fixed-roller arch with radial pressure resolved into
// nodal loads. For a full ring under uniform internal pressure, the
// hoop force N = p * R (pure tension, no bending in a perfect ring).
//
// Analytical: T_hoop = p * R (thin-wall pressure vessel formula)
// We model a straight horizontal beam representing a 1 m tall strip
// of wall spanning between two vertical stiffeners, loaded by
// horizontal grain pressure. The axial force in the wall strip
// gives the hoop tension analogy.

#[test]
fn grain_bin_wall_hoop_tension() {
    // Grain bin parameters
    let diameter: f64 = 6.0; // m
    let r: f64 = diameter / 2.0; // 3.0 m radius
    let h_grain: f64 = 8.0; // m, grain fill height
    let gamma: f64 = 8.0; // kN/m^3, grain unit weight (corn)
    let k_ratio: f64 = 0.4; // lateral pressure ratio (Janssen k)

    // Janssen lateral pressure at depth h: p_h = gamma * k * h
    // (simplified, ignoring friction reduction for this check)
    let p_lateral: f64 = gamma * k_ratio * h_grain; // kN/m^2 = 25.6 kPa

    // Hoop tension in thin ring: T = p * R (per unit height)
    let t_hoop_exact: f64 = p_lateral * r; // kN/m = 76.8 kN/m

    // Model: a horizontal beam strip representing the bin wall between
    // two vertical stiffeners spaced at arc length ~ 2*R (diameter).
    // The strip is loaded by lateral pressure and restrained at ends.
    // For a simply-supported strip of length = pi*R (half circumference),
    // the axial force from membrane action equals the hoop tension.
    //
    // Instead, we use a simpler verification: model a horizontal tie
    // element (pin-pin) spanning the diameter, loaded at midspan by
    // the resultant of pressure on the half-ring. The resultant
    // horizontal force on a half-ring = p * D * 1m_height (projected area).
    // Each tie carries half: F_tie = p * D / 2 = p * R = T_hoop.

    // Model as a horizontal beam with a point load at midspan
    let l_span: f64 = diameter; // 6 m span (diameter)
    let n: usize = 4;
    let e_steel: f64 = 200_000.0; // MPa, steel bin wall
    let t_wall: f64 = 0.006; // m, 6 mm wall thickness
    let h_strip: f64 = 1.0; // m, unit height strip
    let a_wall: f64 = t_wall * h_strip; // cross-section area
    let iz_wall: f64 = h_strip * t_wall.powi(3) / 12.0; // moment of inertia

    // Resultant horizontal force on half-ring projected area = p * D * h_strip
    // Split equally to two horizontal ties, so each tie sees p * R
    // Apply as two equal horizontal forces pushing outward at the supports
    // of a SS beam to create pure tension.
    // Actually: model a beam with axial load by applying horizontal forces
    // at each end (tension test).

    // Model a horizontal beam under pure axial tension.
    // Pinned at node 1 (restrains X,Y), rollerX at far end (restrains Y only).
    // Horizontal force at far end must flow through beam to the pin.
    let f_hoop: f64 = t_hoop_exact; // kN

    let input = make_beam(
        n, l_span, e_steel, a_wall, iz_wall,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: f_hoop, fy: 0.0, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    // Axial force in each element should equal the hoop tension
    let ef = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef.n_start.abs(), t_hoop_exact, 0.02, "Grain bin hoop tension force");

    // Axial elongation: delta = F*L / (E*A)
    let e_eff: f64 = e_steel * 1000.0; // kN/m^2
    let delta_exact: f64 = f_hoop * l_span / (e_eff * a_wall);
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip.ux.abs(), delta_exact, 0.02, "Grain bin wall elongation");

    // Hoop stress check: sigma = T / (t * h_strip)
    let sigma_hoop: f64 = t_hoop_exact / a_wall; // kN/m^2
    let sigma_mpa: f64 = sigma_hoop / 1000.0;
    assert!(
        sigma_mpa < 250.0,
        "Hoop stress {:.1} MPa should be within steel yield (250 MPa)", sigma_mpa
    );
}

// ================================================================
// 2. Barn Rigid Frame: Fixed-Base Portal Under Wind and Gravity
// ================================================================
//
// A clear-span barn uses rigid portal frames at regular spacing.
// Frame: 12 m span, 6 m eave height, fixed bases.
// Dead + live gravity load on the beam, plus lateral wind on columns.
//
// Analytical (portal method for fixed-base frame):
//   - Under lateral load H at eave: base shear V = H/2 each column
//   - Column base moment: M_base = V * h / 2 (cantilever action with inflection at mid-height)
//   - Vertical reactions from overturning: R_v = H * h / w

#[test]
fn barn_rigid_frame_wind_and_gravity() {
    let h: f64 = 6.0; // m, eave height
    let w: f64 = 12.0; // m, clear span
    let e_steel: f64 = 200_000.0; // MPa

    // W10x33 equivalent properties (barn frame column and rafter)
    let a: f64 = 62.9e-4; // m^2
    let iz: f64 = 17100.0e-8; // m^4

    // Loads
    let f_wind: f64 = 15.0; // kN, total lateral wind at eave
    let f_gravity: f64 = -25.0; // kN per eave node, downward (DL+LL)

    let input = make_portal_frame(h, w, e_steel, a, iz, f_wind, f_gravity);
    let results = solve_2d(&input).expect("solve");

    // Check horizontal equilibrium: sum Rx + applied H = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close((sum_rx + f_wind).abs(), 0.0, 0.02, "Barn frame horizontal equilibrium");

    // Check vertical equilibrium: sum Ry + 2*gravity = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close((sum_ry + 2.0 * f_gravity).abs(), 0.0, 0.02, "Barn frame vertical equilibrium");

    // Overturning: vertical reactions should reflect moment from wind
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Net vertical uplift/compression from wind overturning
    // M_overturn = H * h; couple = delta_Ry * w
    let delta_ry: f64 = (r1.ry - r4.ry).abs();
    let m_overturn_approx: f64 = delta_ry * w / 2.0;
    let m_wind: f64 = f_wind * h;
    // Base moments absorb part of the overturning, so m_overturn_approx < m_wind
    assert!(
        m_overturn_approx < m_wind * 1.1,
        "Overturning check: couple {:.1} < wind moment {:.1}", m_overturn_approx, m_wind
    );

    // Column base moments should be non-zero (rigid frame behavior)
    assert!(r1.mz.abs() > 1.0, "Left column base moment is significant");
    assert!(r4.mz.abs() > 1.0, "Right column base moment is significant");

    // Beam element should carry significant bending
    let ef_beam = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(ef_beam.m_start.abs() > 1.0, "Rafter has significant moment at eave joint");
}

// ================================================================
// 3. Greenhouse Arch: Parabolic Arch Under Symmetric Snow Load
// ================================================================
//
// A greenhouse uses a parabolic arch frame spanning 8 m with 3 m rise.
// Under uniform vertical load (snow), a parabolic arch develops
// primarily axial thrust with minimal bending.
//
// Approximate with a 3-segment polygonal arch (pin-jointed) under
// vertical loads at the nodes. For a symmetric 3-hinge arch:
//   H = w * L^2 / (8 * f) where w = load/m, f = rise, L = span
//
// We model as a multi-segment frame arch with fixed bases.

#[test]
fn greenhouse_arch_snow_load() {
    let l_span: f64 = 8.0; // m, arch span
    let f_rise: f64 = 3.0; // m, arch rise
    let e_steel: f64 = 200_000.0; // MPa, tubular steel

    // Greenhouse arch tube: 60.3 mm OD, 3.2 mm wall
    let d_outer: f64 = 0.0603;
    let d_inner: f64 = 0.0603 - 2.0 * 0.0032;
    let a_tube: f64 = std::f64::consts::PI / 4.0 * (d_outer.powi(2) - d_inner.powi(2));
    let iz_tube: f64 = std::f64::consts::PI / 64.0 * (d_outer.powi(4) - d_inner.powi(4));

    // Snow load: 0.5 kN/m^2, spacing 3 m between arches = 1.5 kN/m horizontal projection
    let w_snow: f64 = 1.5; // kN/m on horizontal projection

    // Model as 4-segment polygonal arch
    // Parabolic profile: y = 4*f*x*(L-x)/L^2
    // Nodes at x = 0, L/4, L/2, 3L/4, L
    let n_segs: usize = 4;
    let dx: f64 = l_span / n_segs as f64; // 2.0 m horizontal spacing

    let mut nodes = Vec::new();
    for i in 0..=n_segs {
        let x: f64 = i as f64 * dx;
        let y: f64 = 4.0 * f_rise * x * (l_span - x) / (l_span * l_span);
        nodes.push((i + 1, x, y));
    }

    let mut elems = Vec::new();
    for i in 0..n_segs {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }

    let sups = vec![(1, 1, "pinned"), (2, n_segs + 1, "pinned")];

    // Apply vertical nodal loads at interior nodes (equivalent of uniform load)
    // Each interior node carries tributary length * w_snow
    let mut loads = Vec::new();
    for i in 1..n_segs {
        let f_node: f64 = -w_snow * dx; // kN, downward
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: i + 1, fx: 0.0, fy: f_node, mz: 0.0,
        }));
    }

    let input = make_input(nodes, vec![(1, e_steel, 0.3)], vec![(1, a_tube, iz_tube)], elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Total vertical load = (n_segs - 1) interior nodes * w_snow * dx
    let total_v: f64 = (n_segs as f64 - 1.0) * w_snow * dx;

    // Each support takes half the vertical load (symmetry)
    let r_v_exact: f64 = total_v / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry.abs(), r_v_exact, 0.05, "Greenhouse arch vertical reaction");

    // Horizontal thrust: H = w_total * L / (8 * f) for parabolic arch
    // with nodal loads approximation, use: H = M0 / f
    // where M0 = simply supported midspan moment for same loading
    // M0 for 3 equal point loads at L/4, L/2, 3L/4 on SS beam:
    // M0_mid = R*L/2 - P*(L/4) = (3P/2)*(L/2) - P*(L/4) = 3PL/4 - PL/4
    // Actually for 3 concentrated loads P at L/4, L/2, 3L/4:
    // R = 3P/2, M_mid = R*L/2 - P*L/4 - P*0 = 3PL/4 - PL/4 = PL/2
    // Wait: each P = w_snow * dx
    let p_node: f64 = w_snow * dx;
    // SS beam moment at midspan with loads at L/4, L/2, 3L/4:
    // R = 3P/2; M(L/2) = R*(L/2) - P*(L/4)
    let r_ss: f64 = 3.0 * p_node / 2.0;
    let m0_mid: f64 = r_ss * l_span / 2.0 - p_node * l_span / 4.0;
    let h_thrust_approx: f64 = m0_mid / f_rise;

    // Check horizontal reaction
    assert_close(r1.rx.abs(), h_thrust_approx, 0.10, "Greenhouse arch horizontal thrust");

    // Crown node displacement should be downward and small
    let crown = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert!(crown.uy < 0.0, "Crown deflects downward under snow");
    let deflection_limit: f64 = l_span / 200.0; // 40 mm serviceability
    assert!(
        crown.uy.abs() < deflection_limit,
        "Crown deflection {:.4} m < L/200 = {:.4} m", crown.uy.abs(), deflection_limit
    );
}

// ================================================================
// 4. Feed Bunker Wall: Cantilever Retaining Wall Under Silage Pressure
// ================================================================
//
// Feed bunker (trench silo) wall acts as a vertical cantilever
// retaining wall resisting horizontal silage pressure.
// Triangular pressure: p(y) = gamma_s * k * y
// where gamma_s = silage unit weight, k = lateral coefficient.
//
// Cantilever wall of height H, fixed at base, free at top:
//   Resultant P = 0.5 * gamma_s * k * H^2 (kN/m), acting at H/3 from base
//   Base moment: M = P * H/3
//   Base shear: V = P
//
// Model as vertical cantilever beam with equivalent triangular load.

#[test]
fn feed_bunker_wall_silage_pressure() {
    let h_wall: f64 = 3.0; // m, wall height
    let gamma_s: f64 = 7.0; // kN/m^3, silage unit weight
    let k_lat: f64 = 0.5; // lateral pressure coefficient

    // Peak lateral pressure at base
    let p_base: f64 = gamma_s * k_lat * h_wall; // 10.5 kN/m^2

    // Resultant force per meter of wall
    let p_resultant: f64 = 0.5 * p_base * h_wall; // 15.75 kN/m

    // Moment at base = P * H/3
    let m_base_exact: f64 = p_resultant * h_wall / 3.0; // 15.75 kN-m/m

    // Concrete wall properties (per meter width)
    let t_wall: f64 = 0.25; // m, wall thickness
    let b_strip: f64 = 1.0; // m, unit width
    let e_conc: f64 = 25_000.0; // MPa, concrete E
    let a_wall: f64 = b_strip * t_wall;
    let iz_wall: f64 = b_strip * t_wall.powi(3) / 12.0;

    // Model as vertical cantilever (along Y-axis)
    // Use make_beam along X; wall is fixed at node 1, free at end
    // Triangular load: q_i at start (base) = p_base, q_j at end (top) = 0
    // But beam is along X, so "transverse" load is in Y direction.
    // Distributed load is transverse (perpendicular to beam axis).
    // For a horizontal beam fixed at left, free at right:
    //   - Load goes from q_i = -p_base (at fixed end) to q_j = 0 (at free end)
    //   => triangular load decreasing from fixed to free

    let n: usize = 8;
    let mut loads = Vec::new();
    let elem_len: f64 = h_wall / n as f64;

    for i in 0..n {
        // Pressure varies linearly from base to top
        // At x_i from base: p = p_base * (1 - x_i/H)
        let x_i: f64 = i as f64 * elem_len;
        let x_j: f64 = (i + 1) as f64 * elem_len;
        let q_i: f64 = -p_base * (1.0 - x_i / h_wall); // negative = "downward" (transverse)
        let q_j: f64 = -p_base * (1.0 - x_j / h_wall);
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i, q_j, a: None, b: None,
        }));
    }

    let input = make_beam(n, h_wall, e_conc, a_wall, iz_wall, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Base reaction shear = total resultant force
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry.abs(), p_resultant, 0.05, "Bunker wall base shear");

    // Base moment
    assert_close(r1.mz.abs(), m_base_exact, 0.05, "Bunker wall base moment");

    // Tip deflection of cantilever under triangular load:
    // delta_tip = p_base * H^4 / (30 * E * I) for triangular load
    let e_eff: f64 = e_conc * 1000.0;
    let delta_exact: f64 = p_base * h_wall.powi(4) / (30.0 * e_eff * iz_wall);
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip.uy.abs(), delta_exact, 0.10, "Bunker wall tip deflection");
}

// ================================================================
// 5. Manure Lagoon Liner: Flexible Membrane Strip Under Hydrostatic Load
// ================================================================
//
// A geomembrane liner over a manure lagoon spans between anchor
// trenches. Model as a flexible beam (very low I) under uniform
// hydrostatic pressure from liquid manure.
//
// For a SS beam under UDL:
//   delta_max = 5*q*L^4 / (384*E*I)
//   M_max = q*L^2 / 8
//   R = q*L / 2
//
// We use a thin HDPE liner strip to verify the basic beam formulas
// apply at the structural scale.

#[test]
fn manure_lagoon_liner_hydrostatic() {
    // Lagoon parameters
    let depth: f64 = 3.0; // m, liquid depth
    let gamma_m: f64 = 10.5; // kN/m^3, manure unit weight
    let p_avg: f64 = gamma_m * depth / 2.0; // average hydrostatic pressure = 15.75 kPa

    // Liner strip spanning between support beams
    let l_span: f64 = 3.0; // m, span between supports
    let b_strip: f64 = 1.0; // m, unit width

    // HDPE liner as structural beam equivalent
    // Use a thicker concrete sub-slab to make the problem well-conditioned
    let t_slab: f64 = 0.15; // m, concrete sub-slab
    let e_conc: f64 = 25_000.0; // MPa
    let a_slab: f64 = b_strip * t_slab;
    let iz_slab: f64 = b_strip * t_slab.powi(3) / 12.0;

    // Uniform load from hydrostatic pressure
    let q: f64 = -p_avg * b_strip; // kN/m, downward

    let n: usize = 8;
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l_span, e_conc, a_slab, iz_slab, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Analytical results for SS beam under UDL
    let r_exact: f64 = q.abs() * l_span / 2.0;
    let m_max_exact: f64 = q.abs() * l_span.powi(2) / 8.0;
    let e_eff: f64 = e_conc * 1000.0;
    let delta_exact: f64 = 5.0 * q.abs() * l_span.powi(4) / (384.0 * e_eff * iz_slab);

    // Check reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry.abs(), r_exact, 0.02, "Lagoon liner support reaction");

    // Check midspan deflection
    let mid_node = n / 2 + 1;
    let mid_disp = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(mid_disp.uy.abs(), delta_exact, 0.05, "Lagoon liner midspan deflection");

    // Check midspan moment via element forces near midspan
    let mid_elem = n / 2;
    let ef_mid = results.element_forces.iter().find(|e| e.element_id == mid_elem).unwrap();
    // The moment at the end of the element closest to midspan
    assert_close(ef_mid.m_end.abs(), m_max_exact, 0.10, "Lagoon liner midspan moment");

    // Verify total reaction equals total load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum::<f64>();
    assert_close(sum_ry.abs(), q.abs() * l_span, 0.02, "Lagoon liner total vertical equilibrium");
}

// ================================================================
// 6. Silo Discharge Funnel: Inclined Hopper Wall Under Grain Pressure
// ================================================================
//
// The conical discharge hopper at the bottom of a grain silo has
// inclined walls that carry both normal pressure and friction from
// flowing grain. Model one wall panel as an inclined beam under
// distributed normal pressure.
//
// For a simply-supported inclined beam of length L_incl loaded by
// a uniform transverse load q_n:
//   R = q_n * L_incl / 2
//   M_max = q_n * L_incl^2 / 8

#[test]
fn silo_discharge_funnel_hopper() {
    // Hopper geometry
    let h_hopper: f64 = 2.5; // m, hopper vertical height
    let r_top: f64 = 3.0; // m, hopper top radius (= bin radius)
    let r_bottom: f64 = 0.3; // m, discharge opening radius
    let hopper_angle: f64 = ((r_top - r_bottom) / h_hopper).atan(); // angle from vertical

    // Inclined wall length
    let l_incl: f64 = (h_hopper.powi(2) + (r_top - r_bottom).powi(2)).sqrt();

    // Grain pressure on hopper wall (Janssen + hopper factor)
    // Normal pressure on hopper wall ~ 20 kPa (typical for corn at discharge)
    let p_normal: f64 = 20.0; // kN/m^2

    // Steel hopper plate (per 1 m circumferential strip)
    let t_plate: f64 = 0.008; // m, 8 mm plate
    let b_strip: f64 = 1.0; // m, unit circumferential width
    let e_steel: f64 = 200_000.0; // MPa
    let a_plate: f64 = b_strip * t_plate;
    let iz_plate: f64 = b_strip * t_plate.powi(3) / 12.0;

    // Transverse load on inclined beam = normal pressure * unit width
    let q_n: f64 = -p_normal * b_strip; // kN/m along inclined length

    let n: usize = 6;
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_n, q_j: q_n, a: None, b: None,
        }));
    }

    // Model as SS beam of length l_incl (straightened hopper panel)
    let input = make_beam(n, l_incl, e_steel, a_plate, iz_plate, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Analytical: R = q*L/2, M_max = q*L^2/8
    let r_exact: f64 = q_n.abs() * l_incl / 2.0;
    let m_max_exact: f64 = q_n.abs() * l_incl.powi(2) / 8.0;

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry.abs(), r_exact, 0.03, "Hopper wall support reaction");

    // Midspan moment
    let mid_elem = n / 2;
    let ef_mid = results.element_forces.iter().find(|e| e.element_id == mid_elem).unwrap();
    assert_close(ef_mid.m_end.abs(), m_max_exact, 0.10, "Hopper wall midspan moment");

    // Midspan deflection: delta = 5*q*L^4 / (384*E*I)
    let e_eff: f64 = e_steel * 1000.0;
    let delta_exact: f64 = 5.0 * q_n.abs() * l_incl.powi(4) / (384.0 * e_eff * iz_plate);
    let mid_node = n / 2 + 1;
    let mid_disp = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(mid_disp.uy.abs(), delta_exact, 0.05, "Hopper wall midspan deflection");

    // Verify hopper geometry
    let _angle_check: f64 = hopper_angle; // suppress unused
    assert_close(l_incl, (h_hopper.powi(2) + (r_top - r_bottom).powi(2)).sqrt(), 0.001, "Hopper inclined length");
}

// ================================================================
// 7. Hay Storage Truss: Howe Truss Under Roof Dead and Live Load
// ================================================================
//
// A Howe truss spans 12 m supporting a hay barn roof.
// Truss depth = 2 m, with verticals and diagonals.
// Panel layout (4 panels):
//
//   Node 3 ---- Node 5 ---- Node 7 ---- Node 9   (top chord, y=2)
//   | \          |  /        | \          |
//   |  \         | /         |  \         |
//   Node 1 --- Node 4 ---- Node 6 ---- Node 8    (bottom chord, y=0)
//   (pin)      (interior)              (roller)
//
// Simplified as a 4-panel Pratt truss with vertical loads at top chord.
// For a SS truss with total load W, each support reaction = W/2.
// Under symmetric loading, the midspan bottom chord tension T = M/(d)
// where M = simply-supported moment and d = truss depth.

#[test]
fn hay_storage_truss_howe() {
    let span: f64 = 12.0; // m
    let depth: f64 = 2.0; // m, truss depth
    let n_panels: usize = 4;
    let panel_w: f64 = span / n_panels as f64; // 3.0 m

    let e_steel: f64 = 200_000.0; // MPa
    let a_chord: f64 = 20.0e-4; // m^2, chord members
    let iz_small: f64 = 1.0e-10; // very small I for truss behavior

    // Nodes: bottom chord at y=0, top chord at y=depth
    // Bottom: 1, 2, 3, 4, 5 at x = 0, 3, 6, 9, 12
    // Top:    6, 7, 8, 9 at x = 0, 3, 6, 9  -- wait, let's be cleaner
    // Bottom chord nodes: 1..5 at x = 0, 3, 6, 9, 12
    // Top chord nodes: 6..10 at x = 0, 3, 6, 9, 12
    let mut nodes = Vec::new();
    // Bottom chord
    for i in 0..=n_panels {
        nodes.push((i + 1, i as f64 * panel_w, 0.0));
    }
    // Top chord
    for i in 0..=n_panels {
        nodes.push((i + n_panels + 2, i as f64 * panel_w, depth));
    }
    // Bottom: nodes 1-5; Top: nodes 6-10

    let mats = vec![(1, e_steel, 0.3)];
    let secs = vec![(1, a_chord, iz_small)];

    let mut elems = Vec::new();
    let mut eid: usize = 1;

    // Bottom chord: 1-2, 2-3, 3-4, 4-5
    for i in 0..n_panels {
        elems.push((eid, "frame", i + 1, i + 2, 1, 1, true, true));
        eid += 1;
    }
    // Top chord: 6-7, 7-8, 8-9, 9-10
    for i in 0..n_panels {
        let ni = i + n_panels + 2;
        let nj = ni + 1;
        elems.push((eid, "frame", ni, nj, 1, 1, true, true));
        eid += 1;
    }
    // Verticals: 1-6, 2-7, 3-8, 4-9, 5-10
    for i in 0..=n_panels {
        let n_bot = i + 1;
        let n_top = i + n_panels + 2;
        elems.push((eid, "frame", n_bot, n_top, 1, 1, true, true));
        eid += 1;
    }
    // Diagonals (Howe pattern): from bottom node to top node of next panel
    // 1-7, 2-8, 3-9, 4-10 (ascending diagonals)
    for i in 0..n_panels {
        let n_bot = i + 1;
        let n_top = i + n_panels + 3; // next top node
        elems.push((eid, "frame", n_bot, n_top, 1, 1, true, true));
        eid += 1;
    }

    // Supports: pin at node 1 (bottom left), roller at node 5 (bottom right)
    let sups = vec![(1, 1, "pinned"), (2, n_panels + 1, "rollerX")];

    // Roof loads applied at top chord interior nodes (7, 8, 9)
    // Dead + Live = 1.5 kN/m^2, tributary width 3 m between trusses
    let w_roof: f64 = 1.5 * 3.0; // 4.5 kN/m
    let p_node: f64 = -w_roof * panel_w; // kN per interior top node

    let mut loads = Vec::new();
    for i in 1..n_panels { // interior top chord nodes (7, 8, 9)
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: i + n_panels + 2, fx: 0.0, fy: p_node, mz: 0.0,
        }));
    }

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Total load
    let total_w: f64 = (n_panels as f64 - 1.0) * p_node.abs();
    let r_exact: f64 = total_w / 2.0;

    // Check reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == n_panels + 1).unwrap();
    assert_close(r1.ry.abs(), r_exact, 0.05, "Hay truss left reaction");
    assert_close(r5.ry.abs(), r_exact, 0.05, "Hay truss right reaction");

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum::<f64>();
    assert_close(sum_ry.abs(), total_w, 0.02, "Hay truss vertical equilibrium");

    // Midspan bottom chord tension: T = M_ss / depth
    // M_ss at midspan for 3 equal loads at L/4, L/2, 3L/4:
    // R = 3P/2, M(L/2) = R*L/2 - P*L/4 = 3PL/4 - PL/4 = PL/2
    let m_ss_mid: f64 = p_node.abs() * span / 2.0;
    let t_chord_expected: f64 = m_ss_mid / depth;

    // Bottom chord element at midspan (element 2 or 3)
    let ef_mid_bot = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    // In a Howe truss, bottom chord is in tension (positive N)
    assert_close(ef_mid_bot.n_start.abs(), t_chord_expected, 0.15, "Hay truss midspan chord force");
}

// ================================================================
// 8. Equipment Shed Portal Frame: Fixed-Base Frame Under Asymmetric Load
// ================================================================
//
// An open-front equipment shed uses a portal frame with one fixed
// column (back wall) and one pinned column (open front).
// Height 5 m, span 8 m.
// Gravity load from roof + lateral wind on the back wall.
//
// For a portal frame with one fixed and one pinned base under
// lateral load H at beam level:
//   - The fixed base carries more moment than the pinned base
//   - Horizontal reactions sum to H
//   - Vertical reactions provide the overturning couple

#[test]
fn equipment_shed_portal_frame() {
    let h: f64 = 5.0; // m, column height
    let w: f64 = 8.0; // m, span
    let e_steel: f64 = 200_000.0; // MPa

    // Steel sections for shed frame
    let a: f64 = 45.0e-4; // m^2 (W200x46 equivalent)
    let iz: f64 = 4500.0e-8; // m^4

    // Wind load on back wall
    let f_wind: f64 = 10.0; // kN, lateral at eave level
    // Gravity from roof dead + live load
    let f_grav: f64 = -20.0; // kN per eave node

    // Build asymmetric portal: fixed at node 1 (back), pinned at node 4 (open front)
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // back column (fixed-fixed)
        (2, "frame", 2, 3, 1, 1, false, false), // rafter
        (3, "frame", 3, 4, 1, 1, false, false), // front column (fixed-pinned)
    ];
    // Fixed at back wall, pinned at open front
    let sups = vec![(1, 1, "fixed"), (2, 4, "pinned")];

    let mut loads = Vec::new();
    // Wind at eave (node 2, back column top)
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_wind, fy: 0.0, mz: 0.0,
    }));
    // Gravity at both eave nodes
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: f_grav, mz: 0.0,
    }));
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fy: f_grav, mz: 0.0,
    }));

    let input = make_input(
        nodes,
        vec![(1, e_steel, 0.3)],
        vec![(1, a, iz)],
        elems, sups, loads,
    );
    let results = solve_2d(&input).expect("solve");

    // Horizontal equilibrium: sum Rx = -H (wind)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close((sum_rx + f_wind).abs(), 0.0, 0.02, "Shed horizontal equilibrium");

    // Vertical equilibrium: sum Ry = -2*f_grav
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_grav: f64 = 2.0 * f_grav;
    assert_close((sum_ry + total_grav).abs(), 0.0, 0.02, "Shed vertical equilibrium");

    // Fixed base (node 1) should have a moment reaction; pinned (node 4) should not
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert!(r1.mz.abs() > 5.0, "Fixed base has significant moment: {:.2} kN-m", r1.mz);
    assert_close(r4.mz, 0.0, 0.01, "Pinned base has zero moment");

    // The fixed column base carries more horizontal reaction than the pinned base
    // (stiffer column attracts more lateral force)
    assert!(
        r1.rx.abs() > r4.rx.abs(),
        "Fixed base rx={:.2} > pinned base rx={:.2} (fixed attracts more shear)",
        r1.rx.abs(), r4.rx.abs()
    );

    // Verify the rafter carries bending
    let ef_rafter = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(ef_rafter.m_start.abs() > 1.0, "Rafter has significant moment at back eave");

    // Sway at eave level should be reasonable
    let eave_disp = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let sway_limit: f64 = h / 150.0; // typical H/150 sway limit
    assert!(
        eave_disp.ux.abs() < sway_limit,
        "Eave sway {:.4} m < H/150 = {:.4} m", eave_disp.ux.abs(), sway_limit
    );
}
