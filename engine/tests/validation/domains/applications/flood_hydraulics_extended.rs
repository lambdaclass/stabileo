/// Validation: Flood Hydraulics and Hydraulic Structure Analysis (Extended)
///
/// References:
///   - USACE EM 1110-2-2502: Retaining and Flood Walls
///   - AASHTO LRFD Bridge Design Specifications (scour, debris)
///   - FEMA P-259: Engineering Principles and Practices for Retrofitting Flood-Prone Structures
///   - FEMA P-55: Coastal Construction Manual
///   - USACE EM 1110-2-1913: Design and Construction of Levees
///   - FHWA HDS-5: Hydraulic Design of Highway Culverts
///   - EurOtop Manual: Wave Overtopping of Sea Defences (2018)
///   - Chow, V.T., "Open-Channel Hydraulics" (1959)
///
/// Tests verify structural analysis of flood-related structures:
///   1. Flood wall under hydrostatic pressure (cantilever)
///   2. Debris impact force on bridge piers
///   3. Scour effects on bridge pile effective length
///   4. Levee slope stability (embankment cross-section)
///   5. Culvert headwall under earth and water pressure
///   6. Floodgate beam under hydrostatic loading
///   7. Wave overtopping loads on levee crown wall
///   8. Flood barrier under combined hydrostatic + hydrodynamic loading

use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

// ================================================================
// 1. Flood Wall: Cantilever Wall Under Hydrostatic Pressure
// ================================================================
//
// A reinforced concrete flood wall acts as a vertical cantilever
// fixed at the base, subjected to triangular hydrostatic pressure.
//
// Water depth H = 3.0 m, gamma_w = 9.81 kN/m^3.
// Triangular load: q = 0 at top, q = gamma_w * H at base.
// Per unit width (1 m strip):
//   Total force F = gamma_w * H^2 / 2
//   Acting at H/3 from the base.
//   Base moment M = F * H/3 = gamma_w * H^3 / 6
//
// Model as a cantilever beam (fixed at base, free at top) with
// linearly varying distributed load (triangular).
//
// Reference: USACE EM 1110-2-2502, Ch. 3

#[test]
fn flood_wall_hydrostatic_pressure() {
    let h: f64 = 3.0;           // m, water depth / wall height
    let gamma_w: f64 = 9.81;    // kN/m^3, water unit weight
    let n: usize = 6;

    // Concrete wall section (per meter width)
    let t_wall: f64 = 0.30;     // m, wall thickness
    let b_strip: f64 = 1.0;     // m, unit width
    let e_conc: f64 = 30_000.0; // MPa, concrete E
    let a_wall: f64 = b_strip * t_wall;
    let iz_wall: f64 = b_strip * t_wall.powi(3) / 12.0;

    // Triangular hydrostatic load: 0 at top (free end), gamma_w*H at base (fixed end)
    // The wall is modeled along X with fixed at node 1 (base, x=0) and free at tip (x=H).
    // Hydrostatic pressure on the wall varies linearly:
    //   At base (x=0): q = gamma_w * H (maximum)
    //   At top  (x=H): q = 0
    // In the solver, distributed load q_i and q_j are transverse (perpendicular).
    // For each element from x_i to x_j, the load is:
    //   q_i = -gamma_w * (H - x_i)   (negative for downward/lateral)
    //   q_j = -gamma_w * (H - x_j)
    let elem_len: f64 = h / n as f64;
    let mut loads = Vec::new();
    for i in 0..n {
        let x_i: f64 = i as f64 * elem_len;
        let x_j: f64 = (i + 1) as f64 * elem_len;
        let qi: f64 = -gamma_w * (h - x_i); // pressure at start of element
        let qj: f64 = -gamma_w * (h - x_j); // pressure at end of element
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: qi,
            q_j: qj,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, h, e_conc, a_wall, iz_wall, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Analytical results:
    // Total hydrostatic force: F = gamma_w * H^2 / 2
    let f_total: f64 = gamma_w * h * h / 2.0;

    // Base moment: M = gamma_w * H^3 / 6
    let m_base_exact: f64 = gamma_w * h.powi(3) / 6.0;

    // Check base reaction (vertical shear at fixed support)
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.rz.abs(), f_total, 0.03, "Flood wall base shear reaction");
    assert_close(r_base.my.abs(), m_base_exact, 0.05, "Flood wall base moment");

    // Tip deflection of cantilever under triangular load:
    // delta = gamma_w * H^4 / (30 * E * I)
    let e_eff: f64 = e_conc * 1000.0;
    let delta_exact: f64 = gamma_w * h.powi(4) / (30.0 * e_eff * iz_wall);
    let tip_node = n + 1;
    let tip_disp = results.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap();
    assert_close(tip_disp.uz.abs(), delta_exact, 0.10, "Flood wall tip deflection");

    // Verify hydrostatic pressure values
    assert_close(f_total, 0.5 * 9.81 * 9.0, 0.001, "Hydrostatic force value");
    assert_close(m_base_exact, 9.81 * 27.0 / 6.0, 0.001, "Base moment value");
}

// ================================================================
// 2. Debris Impact Force on Bridge Piers
// ================================================================
//
// AASHTO LRFD specifies debris impact on bridge piers using an
// equivalent static force. A common approach:
//   F_impact = m * v / dt  (impulse-momentum)
// where m = debris mass, v = flow velocity, dt = impact duration.
//
// Model the pier as a fixed-fixed column subjected to a lateral
// point load at mid-height representing the debris impact.
//
// For a fixed-fixed beam with central point load P:
//   M_fixed_end = P*L/8
//   delta_mid = P*L^3 / (192*E*I)
//
// Reference: AASHTO LRFD Bridge Design Specifications, Section 3.7.3

#[test]
fn flood_debris_impact_on_pier() {
    // Debris parameters
    let m_debris: f64 = 5000.0;  // kg, floating debris (log/container)
    let v_flow: f64 = 3.0;       // m/s, flood velocity
    let dt_impact: f64 = 1.0;    // s, impact duration (conservative)

    // Impact force: F = m * v / dt (converted to kN)
    let f_impact: f64 = m_debris * v_flow / (dt_impact * 1000.0); // kN
    // = 5000 * 3.0 / (1.0 * 1000) = 15.0 kN

    assert_close(f_impact, 15.0, 0.001, "Debris impact force");

    // Pier properties
    let h_pier: f64 = 8.0;       // m, pier height
    let d_pier: f64 = 1.2;       // m, circular pier diameter
    let e_conc: f64 = 30_000.0;  // MPa
    let a_pier: f64 = std::f64::consts::PI * d_pier.powi(2) / 4.0;
    let iz_pier: f64 = std::f64::consts::PI * d_pier.powi(4) / 64.0;
    let n: usize = 8;

    // Model pier as fixed-fixed beam along X with lateral point load at midspan
    let mid_node = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fz: f_impact,
        my: 0.0,
    })];

    let input = make_beam(n, h_pier, e_conc, a_pier, iz_pier, "fixed", Some("fixed"), loads);
    let results = solve_2d(&input).expect("solve");

    // For fixed-fixed beam with central point load P:
    // End moment: M = P*L/8
    let m_end_exact: f64 = f_impact * h_pier / 8.0;

    // Midspan deflection: delta = P*L^3 / (192*E*I)
    let e_eff: f64 = e_conc * 1000.0;
    let delta_exact: f64 = f_impact * h_pier.powi(3) / (192.0 * e_eff * iz_pier);

    // Check reactions (each end takes half the lateral load)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let sum_ry: f64 = (r1.rz + r_end.rz).abs();
    assert_close(sum_ry, f_impact, 0.02, "Pier lateral equilibrium");

    // Check end moment
    assert_close(r1.my.abs(), m_end_exact, 0.05, "Pier fixed-end moment");

    // Check midspan deflection
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();
    assert_close(mid_disp.uz.abs(), delta_exact, 0.05, "Pier midspan deflection under debris impact");

    // Verify the pier can resist the impact (stress check)
    let sigma_bending: f64 = m_end_exact * (d_pier / 2.0) / iz_pier; // kN/m^2
    let sigma_mpa: f64 = sigma_bending / 1000.0;
    assert!(
        sigma_mpa < 30.0,
        "Bending stress {:.1} MPa < concrete capacity", sigma_mpa
    );
}

// ================================================================
// 3. Scour Effects on Bridge Piles: Increased Effective Length
// ================================================================
//
// Scour around bridge piles removes soil support, increasing the
// effective unsupported length and reducing lateral stiffness.
//
// Compare a pile with original embedment vs scoured condition:
//   - Original: L_eff = L_above (above ground)
//   - Scoured:  L_eff = L_above + S (scour depth S)
//
// Model as cantilever with tip load. Deflection scales as L^3.
//   delta = P * L^3 / (3*E*I)
//
// Reference: AASHTO LRFD Bridge Design, Section 10.7
//            HEC-18: Evaluating Scour at Bridges

#[test]
fn flood_scour_effect_on_bridge_pile() {
    let l_above: f64 = 6.0;      // m, pile length above ground
    let s_scour: f64 = 3.0;      // m, local scour depth
    let l_scoured: f64 = l_above + s_scour; // m, effective length after scour

    let e_steel: f64 = 200_000.0; // MPa
    let _d_pile: f64 = 0.60;      // m, steel H-pile equivalent diameter
    let a_pile: f64 = 0.015;      // m^2, pile cross-section area
    let iz_pile: f64 = 5.0e-4;    // m^4, pile moment of inertia
    let n: usize = 6;

    let p_lateral: f64 = 20.0;    // kN, lateral flood force on pile

    // Case 1: Original (no scour) - cantilever of length L_above
    let loads_orig = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: 0.0,
        fz: p_lateral,
        my: 0.0,
    })];
    let input_orig = make_beam(n, l_above, e_steel, a_pile, iz_pile, "fixed", None, loads_orig);
    let results_orig = solve_2d(&input_orig).expect("solve original");

    // Case 2: Scoured - cantilever of length L_above + S_scour
    let loads_scour = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: 0.0,
        fz: p_lateral,
        my: 0.0,
    })];
    let input_scour = make_beam(n, l_scoured, e_steel, a_pile, iz_pile, "fixed", None, loads_scour);
    let results_scour = solve_2d(&input_scour).expect("solve scoured");

    // Analytical: delta = P * L^3 / (3*E*I)
    let e_eff: f64 = e_steel * 1000.0;
    let delta_orig_exact: f64 = p_lateral * l_above.powi(3) / (3.0 * e_eff * iz_pile);
    let delta_scour_exact: f64 = p_lateral * l_scoured.powi(3) / (3.0 * e_eff * iz_pile);

    let tip_orig = results_orig.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    let tip_scour = results_scour.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    assert_close(tip_orig.uz.abs(), delta_orig_exact, 0.05, "Pile tip deflection (no scour)");
    assert_close(tip_scour.uz.abs(), delta_scour_exact, 0.05, "Pile tip deflection (scoured)");

    // Scour amplification factor: (L_scoured / L_above)^3
    let amplification_exact: f64 = (l_scoured / l_above).powi(3);
    let amplification_fem: f64 = tip_scour.uz.abs() / tip_orig.uz.abs();
    assert_close(amplification_fem, amplification_exact, 0.05, "Scour deflection amplification");

    // Base moment comparison: M = P * L
    let m_orig_exact: f64 = p_lateral * l_above;
    let m_scour_exact: f64 = p_lateral * l_scoured;
    let r_orig = results_orig.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_scour = results_scour.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_orig.my.abs(), m_orig_exact, 0.03, "Base moment (no scour)");
    assert_close(r_scour.my.abs(), m_scour_exact, 0.03, "Base moment (scoured)");

    // Moment increase ratio
    let moment_ratio: f64 = r_scour.my.abs() / r_orig.my.abs();
    let moment_ratio_exact: f64 = l_scoured / l_above;
    assert_close(moment_ratio, moment_ratio_exact, 0.03, "Scour moment amplification");
}

// ================================================================
// 4. Levee Slope Stability: Embankment Cross-Section Analysis
// ================================================================
//
// A levee cross-section can be idealized as a portal frame to
// check the structural response of a sheet pile or concrete
// core wall within the levee under differential water pressure.
//
// Model: portal frame representing the levee core wall with
// lateral hydrostatic pressure on the waterside and soil
// pressure on the landside. The net lateral load causes
// bending in the frame.
//
// Net lateral pressure: (gamma_w * H_water) - (gamma_s * H_soil * Ka)
// where Ka = Rankine active earth pressure coefficient.
//
// Reference: USACE EM 1110-2-1913, Ch. 6

#[test]
fn flood_levee_slope_stability_frame() {
    let h_wall: f64 = 5.0;       // m, core wall height
    let w_base: f64 = 3.0;       // m, base width between wall supports
    let gamma_w: f64 = 9.81;     // kN/m^3, water
    let h_water: f64 = 4.0;      // m, water level on flood side

    // Soil properties (landside backfill)
    let gamma_s: f64 = 18.0;     // kN/m^3, soil unit weight
    let phi: f64 = 30.0_f64;     // degrees, friction angle
    let phi_rad: f64 = phi * std::f64::consts::PI / 180.0;
    let ka: f64 = (1.0 - phi_rad.sin()) / (1.0 + phi_rad.sin()); // Rankine Ka

    assert_close(ka, 0.333, 0.01, "Rankine Ka for phi=30");

    // Soil pressure at base of landside: q_soil = gamma_s * h * Ka
    // Water pressure at base of waterside: q_water = gamma_w * h_water
    // Net effect modeled as lateral load on the frame

    // Net lateral force per unit width at base level:
    let q_water_base: f64 = gamma_w * h_water; // kN/m at water depth
    let q_soil_base: f64 = gamma_s * h_wall * ka; // kN/m at soil depth

    // Net hydrostatic force: F_net = 0.5 * q_water * h_water - 0.5 * q_soil * h_wall
    let f_water: f64 = 0.5 * q_water_base * h_water;
    let f_soil: f64 = 0.5 * q_soil_base * h_wall;
    let f_net: f64 = f_water - f_soil;

    assert!(
        f_net > 0.0,
        "Net flood force {:.1} kN/m must be positive (water dominates)", f_net
    );

    // Model as portal frame: water-side column receives net lateral load
    let e_conc: f64 = 30_000.0;   // MPa
    let a_wall: f64 = 0.30 * 1.0; // m^2, 300 mm wall per meter width
    let iz_wall: f64 = 1.0 * 0.30_f64.powi(3) / 12.0; // m^4

    let input = make_portal_frame(h_wall, w_base, e_conc, a_wall, iz_wall, f_net, 0.0);
    let results = solve_2d(&input).expect("solve");

    // Horizontal equilibrium: sum of base reactions = applied lateral load
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum::<f64>();
    assert_close(sum_rx.abs(), f_net, 0.03, "Levee wall horizontal equilibrium");

    // For a portal frame with fixed bases and lateral load at top:
    // Each base takes approximately half the lateral load as shear
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    let total_rx: f64 = (r1.rx + r4.rx).abs();
    assert_close(total_rx, f_net, 0.03, "Levee wall total horizontal reaction");

    // Verify overturning resistance
    let m_overturning: f64 = f_net * h_wall;
    let sum_base_my: f64 = r1.my.abs() + r4.my.abs();
    let r_vert_diff: f64 = (r1.rz - r4.rz).abs();
    let m_couple: f64 = r_vert_diff * w_base / 2.0;
    let m_total_resist: f64 = sum_base_my + m_couple;
    assert_close(m_total_resist, m_overturning, 0.10, "Levee wall moment equilibrium");
}

// ================================================================
// 5. Culvert Headwall: Retaining Wall Under Earth + Water Pressure
// ================================================================
//
// A culvert headwall/wingwall is a cantilever retaining wall that
// resists earth pressure plus hydrostatic pressure from floodwater.
//
// Active earth pressure: q_soil = Ka * gamma_s * h (triangular)
// Hydrostatic pressure: q_water = gamma_w * h (triangular)
// Combined: q_total = (Ka * gamma_s + gamma_w) * h at base
//
// Cantilever moment at base: M = q_total_base * H^2 / 6
// (for triangular loading: M = F * H/3 = (qH/2) * H/3 = qH^2/6)
//
// Reference: FHWA HDS-5; AASHTO LRFD Section 11

#[test]
fn flood_culvert_headwall() {
    let h_wall: f64 = 3.5;        // m, headwall height
    let gamma_w: f64 = 9.81;      // kN/m^3
    let gamma_s: f64 = 18.0;      // kN/m^3, backfill soil
    let phi: f64 = 30.0_f64;
    let phi_rad: f64 = phi * std::f64::consts::PI / 180.0;
    let ka: f64 = (1.0 - phi_rad.sin()) / (1.0 + phi_rad.sin());

    // Concrete wall properties (per meter width)
    let t_wall: f64 = 0.35;       // m, wall thickness
    let e_conc: f64 = 28_000.0;   // MPa
    let a_wall: f64 = 1.0 * t_wall;
    let iz_wall: f64 = 1.0 * t_wall.powi(3) / 12.0;
    let n: usize = 6;

    // Combined triangular pressure at depth h:
    //   q(h) = (Ka * gamma_s + gamma_w) * h
    // At base: q_base = (Ka * gamma_s + gamma_w) * H
    let q_coeff: f64 = ka * gamma_s + gamma_w;  // combined pressure coefficient

    // Build triangular load: max at base (node 1), zero at top (node n+1)
    let elem_len: f64 = h_wall / n as f64;
    let mut loads = Vec::new();
    for i in 0..n {
        let x_i: f64 = i as f64 * elem_len;
        let x_j: f64 = (i + 1) as f64 * elem_len;
        // Pressure decreases from base to top:
        // At distance x from base, depth from top = H - x
        let qi: f64 = -q_coeff * (h_wall - x_i);
        let qj: f64 = -q_coeff * (h_wall - x_j);
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: qi,
            q_j: qj,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, h_wall, e_conc, a_wall, iz_wall, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Total lateral force: F = 0.5 * q_base * H = 0.5 * q_coeff * H^2
    let q_base: f64 = q_coeff * h_wall;
    let f_total: f64 = 0.5 * q_base * h_wall;

    // Base moment: M = q_coeff * H^3 / 6
    let m_base_exact: f64 = q_coeff * h_wall.powi(3) / 6.0;

    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.rz.abs(), f_total, 0.05, "Culvert headwall base shear");
    assert_close(r_base.my.abs(), m_base_exact, 0.05, "Culvert headwall base moment");

    // Tip deflection: delta = q_coeff * H^4 / (30 * E * I) [triangular load cantilever]
    let e_eff: f64 = e_conc * 1000.0;
    let delta_exact: f64 = q_coeff * h_wall.powi(4) / (30.0 * e_eff * iz_wall);
    let tip_disp = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip_disp.uz.abs(), delta_exact, 0.10, "Culvert headwall tip deflection");

    // Verify combined pressure exceeds either component alone
    let f_water_only: f64 = 0.5 * gamma_w * h_wall * h_wall;
    let f_soil_only: f64 = 0.5 * ka * gamma_s * h_wall * h_wall;
    assert_close(f_total, f_water_only + f_soil_only, 0.001, "Combined force = water + soil");
}

// ================================================================
// 6. Floodgate Beam: Simply-Supported Under Hydrostatic Load
// ================================================================
//
// A horizontal floodgate beam (stoplogs or sluice gate beam)
// spans between vertical guides and is loaded by hydrostatic
// pressure from the retained water.
//
// For a gate at depth d below the water surface, the pressure
// on the beam = gamma_w * d (approximately uniform over beam height).
// Treating the beam as a SS beam with UDL:
//   q = gamma_w * d * beam_height (line load)
//   M_max = q * L^2 / 8
//   delta_max = 5 * q * L^4 / (384 * E * I)
//
// Reference: USACE EM 1110-2-2702, Design of Spillway Tainter Gates

#[test]
fn flood_floodgate_beam() {
    let d_water: f64 = 5.0;       // m, depth of beam center below water surface
    let gamma_w: f64 = 9.81;      // kN/m^3
    let l_span: f64 = 4.0;        // m, gate span (between guides)
    let h_beam: f64 = 0.50;       // m, beam height (tributary width of gate plate)

    // Pressure at beam depth: p = gamma_w * d
    let p_beam: f64 = gamma_w * d_water; // kPa

    // Line load on beam: q = p * h_beam
    let q_load: f64 = -p_beam * h_beam; // kN/m, negative = transverse

    // Steel beam properties (W-shape)
    let e_steel: f64 = 200_000.0;  // MPa
    let a_beam: f64 = 6.0e-3;      // m^2
    let iz_beam: f64 = 8.0e-5;     // m^4
    let n: usize = 8;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q_load,
            q_j: q_load,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l_span, e_steel, a_beam, iz_beam, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    let e_eff: f64 = e_steel * 1000.0;
    let q_abs: f64 = q_load.abs();

    // Midspan moment: M = q * L^2 / 8
    let m_mid_exact: f64 = q_abs * l_span.powi(2) / 8.0;

    // Reactions: R = q * L / 2
    let r_exact: f64 = q_abs * l_span / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rz.abs(), r_exact, 0.03, "Floodgate beam support reaction");

    // Midspan deflection: delta = 5*q*L^4 / (384*E*I)
    let delta_exact: f64 = 5.0 * q_abs * l_span.powi(4) / (384.0 * e_eff * iz_beam);
    let mid_node = n / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();
    assert_close(mid_disp.uz.abs(), delta_exact, 0.05, "Floodgate beam midspan deflection");

    // Check midspan moment via element forces (element at midspan)
    let mid_elem = n / 2;
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == mid_elem).unwrap();
    // The moment at the end of the mid-element approximates the midspan moment
    assert_close(ef_mid.m_end.abs(), m_mid_exact, 0.10, "Floodgate beam midspan moment");

    // Serviceability check: deflection < L/360
    let deflection_limit: f64 = l_span / 360.0;
    assert!(
        mid_disp.uz.abs() < deflection_limit,
        "Gate beam deflection {:.4} m < L/360 = {:.4} m", mid_disp.uz.abs(), deflection_limit
    );
}

// ================================================================
// 7. Wave Overtopping Loads on Levee Crown Wall
// ================================================================
//
// A crown wall on top of a levee resists wave overtopping forces.
// EurOtop Manual provides guidance on impulsive wave loads on
// crown walls.
//
// Model as a short cantilever wall fixed at the levee crest,
// with a horizontal point force from wave impact at 2/3 height
// and a uniform wave runup pressure over the wall height.
//
// Cantilever with point load P at distance a from base:
//   M_base = P * a
//   delta_tip = P*a^2*(3L - a) / (6*E*I)
//
// Reference: EurOtop Manual (2018), Section 5.5

#[test]
fn flood_wave_overtopping_levee_crown_wall() {
    let h_wall: f64 = 1.5;        // m, crown wall height
    let gamma_w: f64 = 9.81;      // kN/m^3

    // Wave overtopping load (simplified from EurOtop):
    // Impulsive pressure: p_max = 10 * gamma_w * Hs (for severe conditions)
    let h_s: f64 = 1.5;           // m, significant wave height at toe
    let p_max: f64 = 10.0 * gamma_w * h_s; // kPa, peak impulsive pressure

    // Resultant force on wall (per meter width):
    // Assume triangular pressure distribution over wall height
    let f_wave: f64 = 0.5 * p_max * h_wall; // kN/m

    assert!(
        f_wave > 50.0,
        "Wave overtopping force: {:.1} kN/m", f_wave
    );

    // Additionally, uniform hydrostatic component from runup depth
    let d_runup: f64 = 0.3;       // m, runup water depth at wall
    let q_runup: f64 = gamma_w * d_runup; // kN/m^2 uniform over wall height
    let f_runup: f64 = q_runup * h_wall;  // kN/m

    // Total equivalent force (applied as a combination)
    // Apply the dominant wave impact as point load at 2/3 height + UDL for runup
    let n: usize = 6;
    let e_conc: f64 = 30_000.0;
    let t_wall: f64 = 0.25;
    let a_wall: f64 = 1.0 * t_wall;
    let iz_wall: f64 = 1.0 * t_wall.powi(3) / 12.0;

    // Point load from wave impact at 2/3 of wall height from base
    let load_node: usize = (n as f64 * 2.0 / 3.0).round() as usize + 1;
    let mut loads = Vec::new();
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node,
        fx: 0.0,
        fz: -f_wave,
        my: 0.0,
    }));

    // Add uniform runup pressure as distributed load on all elements
    let q_dist: f64 = -q_runup; // transverse direction
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q_dist,
            q_j: q_dist,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, h_wall, e_conc, a_wall, iz_wall, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Base shear must balance total applied force
    let f_total_applied: f64 = f_wave + f_runup;
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.rz.abs(), f_total_applied, 0.05, "Crown wall base shear");

    // Base moment: from point load + UDL
    // Point load contribution: M_point = F_wave * a (where a = load_node position)
    let a_load: f64 = (load_node - 1) as f64 * (h_wall / n as f64);
    let m_point: f64 = f_wave * a_load;
    // UDL contribution: M_udl = q_runup * H^2 / 2
    let m_udl: f64 = q_runup * h_wall.powi(2) / 2.0;
    let m_base_exact: f64 = m_point + m_udl;

    assert_close(r_base.my.abs(), m_base_exact, 0.05, "Crown wall base moment");

    // Verify impulsive pressure is significantly larger than hydrostatic
    let p_hydrostatic: f64 = gamma_w * h_wall;
    let pressure_ratio: f64 = p_max / p_hydrostatic;
    assert!(
        pressure_ratio >= 9.0,
        "Impulsive/hydrostatic ratio {:.1} should be large (wave impact dominates)",
        pressure_ratio
    );
}

// ================================================================
// 8. Flood Barrier: Combined Hydrostatic + Hydrodynamic Loading
// ================================================================
//
// A temporary flood barrier (e.g., demountable barrier) resists
// both static water pressure and hydrodynamic drag from flowing water.
//
// Hydrostatic: triangular, F_s = gamma_w * H^2 / 2
// Hydrodynamic: Cd-based drag, F_d = 0.5 * rho * Cd * V^2 * A_proj
//
// Model the barrier as a continuous two-span beam over three
// supports (base anchorage points), loaded by hydrostatic UDL
// (approximated as uniform at average pressure).
//
// For 2-span continuous beam with UDL:
//   R_internal = 5*q*L/4, R_end = 3*q*L/8
//
// Reference: FEMA P-259; BS EN 1991-1-6 Annex A

#[test]
fn flood_barrier_combined_loading() {
    let h_barrier: f64 = 1.2;     // m, barrier height
    let gamma_w: f64 = 9.81;      // kN/m^3
    let rho_w: f64 = 1000.0;      // kg/m^3
    let v_flow: f64 = 2.0;        // m/s, flood flow velocity
    let cd: f64 = 1.5;            // drag coefficient for flat barrier

    // Hydrostatic force per unit width: F_s = gamma_w * H^2 / 2
    let f_hydrostatic: f64 = gamma_w * h_barrier.powi(2) / 2.0;

    // Hydrodynamic drag per unit width: F_d = 0.5 * rho * Cd * V^2 * H / 1000
    let f_hydrodynamic: f64 = 0.5 * rho_w * cd * v_flow.powi(2) * h_barrier / 1000.0;

    // Total lateral force per meter width
    let f_total: f64 = f_hydrostatic + f_hydrodynamic;

    assert!(
        f_total > 5.0,
        "Total flood force: {:.1} kN/m", f_total
    );

    // Convert to equivalent UDL over barrier span height
    // For structural model: barrier spans horizontally between posts
    let l_span: f64 = 3.0;        // m, span between support posts
    let n_per_span: usize = 4;

    // Equivalent UDL on horizontal beam = total force per unit width * barrier height / span
    // Actually, the barrier beam carries the total lateral load as a beam spanning horizontally.
    // The line load on the beam = total pressure resultant per unit height, distributed along span.
    // Average hydrostatic pressure = gamma_w * H / 2
    // Plus hydrodynamic: 0.5 * rho * Cd * V^2 / 1000
    let p_avg_hydrostatic: f64 = gamma_w * h_barrier / 2.0;
    let p_hydrodynamic: f64 = 0.5 * rho_w * cd * v_flow.powi(2) / 1000.0;
    let q_total: f64 = -(p_avg_hydrostatic + p_hydrodynamic) * h_barrier; // kN/m along beam

    // Steel barrier beam properties
    let e_steel: f64 = 200_000.0;  // MPa
    let a_beam: f64 = 4.0e-3;      // m^2
    let iz_beam: f64 = 3.0e-5;     // m^4

    // Two-span continuous beam
    let total_elements = n_per_span * 2;
    let total_length: f64 = 2.0 * l_span;
    let elem_len: f64 = total_length / total_elements as f64;
    let n_nodes = total_elements + 1;

    let mut loads = Vec::new();
    for i in 0..total_elements {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q_total,
            q_j: q_total,
            a: None,
            b: None,
        }));
    }

    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..total_elements)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let mid_node = n_per_span + 1;
    let sups = vec![
        (1, 1, "pinned"),
        (2, mid_node, "rollerX"),
        (3, n_nodes, "rollerX"),
    ];

    let input = make_input(
        nodes,
        vec![(1, e_steel, 0.3)],
        vec![(1, a_beam, iz_beam)],
        elems,
        sups,
        loads,
    );
    let results = solve_2d(&input).expect("solve");

    let q_abs: f64 = q_total.abs();

    // Total load on beam = q * total_length
    let total_load: f64 = q_abs * total_length;

    // Sum of vertical reactions should equal total load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum::<f64>();
    assert_close(sum_ry.abs(), total_load, 0.03, "Flood barrier total reaction");

    // For 2-span continuous beam with equal UDL:
    // Internal reaction R_mid = 5*q*L/4
    // End reactions R_end = 3*q*L/8
    let r_mid_exact: f64 = 5.0 * q_abs * l_span / 4.0;
    let r_end_exact: f64 = 3.0 * q_abs * l_span / 8.0;

    let r_mid = results.reactions.iter().find(|r| r.node_id == mid_node).unwrap();
    let r_end1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    assert_close(r_mid.rz.abs(), r_mid_exact, 0.05, "Barrier internal support reaction (5qL/4)");
    assert_close(r_end1.rz.abs(), r_end_exact, 0.05, "Barrier end support reaction (3qL/8)");

    // Serviceability: deflection < L/250
    let quarter_node = n_per_span / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == quarter_node).unwrap();
    let defl_limit: f64 = l_span / 250.0;
    assert!(
        mid_disp.uz.abs() < defl_limit,
        "Barrier deflection {:.5} m < L/250 = {:.4} m",
        mid_disp.uz.abs(), defl_limit
    );

    // Verify hydrodynamic adds meaningful contribution
    let hydro_fraction: f64 = f_hydrodynamic / f_total;
    assert!(
        hydro_fraction > 0.05,
        "Hydrodynamic contribution: {:.1}% of total", hydro_fraction * 100.0
    );
}
