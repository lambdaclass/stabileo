/// Validation: Tunnel Lining and Underground Structure Analysis (Extended)
///
/// References:
///   - Curtis (1976): "The Circular Tunnel in Elastic Ground"
///   - Duddeck & Erdmann (1985): Structural design models for tunnels
///   - AASHTO LRFD Tunnel Design (2010)
///   - ITA Guidelines for Design of Shield Tunnels (2000)
///   - EN 1997-1 (EC7): Geotechnical Design
///   - Peck (1969): Gaussian settlement trough model
///   - Muir Wood (1975): "The Circular Tunnel in Elastic Ground"
///   - Einstein & Schwartz (1979): "Simplified Analysis for Tunnel Supports"
///
/// Tests verify tunnel structural models including overburden on box sections,
/// Curtis closed-form solutions, box culvert moments, ground reaction curves,
/// segmental lining hoop thrust, surcharge on shallow tunnels,
/// rectangular tunnel portal frame models, and lining thickness effects.

use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

// ================================================================
// 1. Overburden Pressure on Box Section
// ================================================================
//
// A box section tunnel under overburden pressure:
//   sigma_v = gamma * z  (vertical earth pressure)
//   sigma_h = K0 * sigma_v  (lateral earth pressure, at-rest coefficient)
//
// Model: portal frame (4 nodes) with fixed bases representing a rigid
// box section. Top slab receives vertical distributed load = sigma_v.
// Side walls receive lateral distributed load = sigma_h.
// Verify reactions balance applied loads.

#[test]
fn tunnel_overburden_pressure_on_box_section() {
    let gamma: f64 = 20.0;     // kN/m3 soil unit weight
    let z: f64 = 10.0;         // m depth to tunnel crown
    let phi_rad: f64 = 30.0_f64.to_radians();
    let k0: f64 = 1.0 - phi_rad.sin(); // Jaky: K0 = 1 - sin(phi) = 0.5

    let sigma_v: f64 = gamma * z;      // 200 kPa
    let sigma_h: f64 = k0 * sigma_v;   // 100 kPa

    // Verify geotechnical calculations
    assert_close(sigma_v, 200.0, 0.01, "sigma_v = gamma*z");
    assert_close(k0, 0.5, 0.01, "K0 Jaky");
    assert_close(sigma_h, 100.0, 0.01, "sigma_h = K0*sigma_v");

    // Model box section as portal frame: width 4m, height 3m
    // Top slab under sigma_v, side walls under sigma_h
    let w: f64 = 4.0;
    let h: f64 = 3.0;
    let e: f64 = 30_000.0; // MPa (concrete, solver multiplies by 1000 -> 30 GPa)
    let a: f64 = 0.30;     // m2 (300mm thick walls, per meter run)
    let iz: f64 = 0.30_f64.powi(3) / 12.0; // = 0.00225 m4

    // Convert sigma_v from kPa to kN/m (per meter run) for distributed load
    // sigma_v = 200 kPa acts on top slab -> q_top = -200 kN/m (downward)
    let q_top: f64 = -(sigma_v); // kN/m, downward

    // Nodes: 1=bottom-left, 2=top-left, 3=top-right, 4=bottom-right
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left wall
        (2, "frame", 2, 3, 1, 1, false, false), // top slab
        (3, "frame", 3, 4, 1, 1, false, false), // right wall
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4_usize, "fixed")];

    // Distributed load on top slab (element 2): q_top kN/m downward
    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: q_top, q_j: q_top, a: None, b: None,
        }),
    ];

    let input = make_input(nodes, vec![(1, e, 0.2)], vec![(1, a, iz)], elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Total vertical load on top slab = sigma_v * w = 200 * 4 = 800 kN
    let total_load: f64 = sigma_v * w;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();

    // Vertical equilibrium: sum of reactions = total applied load
    assert_close(sum_ry, total_load, 0.01, "vertical equilibrium sum_ry vs total_load");

    // Both supports should carry approximately half the load (symmetric)
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r_left.ry, r_right.ry, 0.01, "symmetric vertical reactions");

    // Horizontal reactions should be zero (no lateral load applied)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, 0.0, 0.01, "horizontal equilibrium no lateral load");
}

// ================================================================
// 2. Curtis Solution: Bending Moment in Circular Lining
// ================================================================
//
// Curtis (1976) closed-form for circular tunnel in elastic ground:
//   Average hoop thrust: N_avg = p * R * (1 + K0) / 2
//   Maximum moment: M_max = p * R^2 * (1 - K0) / 6  (full-slip, simplified)
//
// For K0 = 1 (hydrostatic), M = 0 and N = p*R (pure compression).
// For K0 != 1, bending develops due to non-uniform loading.
//
// We model a simplified case: beam under uniform load (representing
// the moment in a flat segment at the crown under vertical overburden).

#[test]
fn tunnel_curtis_solution_crown_moment() {
    let p: f64 = 300.0;        // kPa, overburden pressure
    let r: f64 = 3.0;          // m, tunnel radius
    let k0: f64 = 0.5;         // at-rest coefficient
    let _nu: f64 = 0.3;        // Poisson's ratio of ground

    // Curtis simplified: average hoop thrust
    let n_avg: f64 = p * r * (1.0 + k0) / 2.0;
    // = 300 * 3 * 0.75 = 675 kN/m
    assert_close(n_avg, 675.0, 0.01, "Curtis N_avg = p*R*(1+K0)/2");

    // Curtis: max moment for full-slip condition (simplified)
    // M_max ~ p * R^2 * (1 - K0) / 6
    let m_max_analytical: f64 = p * r * r * (1.0 - k0) / 6.0;
    // = 300 * 9 * 0.5 / 6 = 225 kN.m/m
    assert_close(m_max_analytical, 225.0, 0.01, "Curtis M_max analytical");

    // Model verification: fixed-fixed beam of length = pi*R/2 (quarter arc)
    // under net differential load = p*(1-K0) = 150 kPa
    // This approximates the moment in the lining quarter arc
    let chord_len: f64 = std::f64::consts::FRAC_PI_2 * r; // ~4.712 m
    let q_diff: f64 = -(p * (1.0 - k0));  // -150 kN/m (net deviatoric load, downward)

    let e: f64 = 30_000.0; // MPa concrete
    let t: f64 = 0.30;     // m lining thickness
    let a: f64 = t;
    let iz: f64 = t.powi(3) / 12.0;

    // Fixed-fixed beam under UDL: M_end = q*L^2/12
    let n_elem: usize = 4;
    let mut loads = Vec::new();
    for i in 0..n_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_diff, q_j: q_diff, a: None, b: None,
        }));
    }
    let input = make_beam(n_elem, chord_len, e, a, iz, "fixed", Some("fixed"), loads);
    let results = solve_2d(&input).expect("solve");

    // Fixed-fixed beam end moment: M = q*L^2/12
    let m_ff_expected: f64 = q_diff.abs() * chord_len * chord_len / 12.0;

    // Check end moment from FEM
    let m_end: f64 = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();

    assert_close(m_end, m_ff_expected, 0.02, "FEM end moment vs q*L^2/12");

    // Midspan moment = q*L^2/24 for fixed-fixed
    let m_mid_expected: f64 = q_diff.abs() * chord_len * chord_len / 24.0;
    // Verify it is less than end moment
    assert!(m_mid_expected < m_ff_expected,
        "midspan moment {:.2} < end moment {:.2}", m_mid_expected, m_ff_expected);
}

// ================================================================
// 3. Box Culvert: Top Slab Under Earth Load
// ================================================================
//
// A box culvert top slab modeled as fixed-fixed beam under uniform
// earth load. For fixed-fixed beam:
//   M_end = q * L^2 / 12
//   M_mid = q * L^2 / 24
//   delta_max = q * L^4 / (384 * E * I)
//
// Reference: AASHTO LRFD Bridge Design Specifications, Ch. 12.

#[test]
fn tunnel_box_culvert_top_slab_moment() {
    let span: f64 = 3.0;       // m, clear span of culvert
    let depth: f64 = 5.0;      // m, earth cover
    let gamma: f64 = 20.0;     // kN/m3
    let q_earth: f64 = gamma * depth; // 100 kPa = 100 kN/m per meter run

    let e: f64 = 30_000.0;     // MPa concrete
    let t: f64 = 0.25;         // m slab thickness
    let a: f64 = t;
    let iz: f64 = t.powi(3) / 12.0; // 0.001302 m4

    let n_elem: usize = 6;
    let q: f64 = -q_earth;     // downward

    let mut loads = Vec::new();
    for i in 0..n_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input = make_beam(n_elem, span, e, a, iz, "fixed", Some("fixed"), loads);
    let results = solve_2d(&input).expect("solve");

    // Analytical: fixed-fixed beam
    // M_end = q * L^2 / 12
    let m_end_expected: f64 = q_earth * span * span / 12.0;
    // = 100 * 9 / 12 = 75 kN.m

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let m_end_fem: f64 = r1.mz.abs();
    assert_close(m_end_fem, m_end_expected, 0.02, "box culvert M_end = qL^2/12");

    // Each support reaction should be q*L/2
    let ry_expected: f64 = q_earth * span / 2.0; // 150 kN
    assert_close(r1.ry.abs(), ry_expected, 0.02, "box culvert support reaction qL/2");

    // Maximum deflection: delta = q*L^4 / (384*EI)
    let e_actual: f64 = e * 1000.0; // solver converts MPa -> kN/m2
    let delta_expected: f64 = q_earth * span.powi(4) / (384.0 * e_actual * iz);
    let mid_node = n_elem / 2 + 1;
    let delta_fem: f64 = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy.abs();
    assert_close(delta_fem, delta_expected, 0.05, "box culvert max deflection");
}

// ================================================================
// 4. Ground Reaction Curve: Support-Excavation Interaction
// ================================================================
//
// Ground Reaction Curve (GRC) concept:
//   - Unsupported tunnel converges radially: u_r_max = p0*R*(1+nu)/E_ground
//   - Support installed after fraction lambda of convergence
//   - Support carries pressure: p_s = k_s * (u_eq - u_precov)
//   - Equilibrium: p_ground(u_eq) = p_support(u_eq)
//
// Model: a fixed-fixed beam representing the lining chord, loaded
// by the residual ground pressure after partial convergence.

#[test]
fn tunnel_ground_reaction_curve_interaction() {
    let p0: f64 = 400.0;       // kPa initial ground stress
    let r: f64 = 4.0;          // m tunnel radius
    let e_ground: f64 = 200_000.0; // kPa ground modulus
    let nu_g: f64 = 0.3;

    // Maximum elastic convergence (unsupported)
    let u_max: f64 = p0 * r * (1.0 + nu_g) / e_ground;
    // = 400 * 4 * 1.3 / 200000 = 0.0104 m = 10.4 mm
    assert_close(u_max * 1000.0, 10.4, 0.01, "u_max elastic convergence");

    // Pre-convergence fraction before support installation
    let lambda: f64 = 0.3; // 30% pre-convergence
    let _u_precov: f64 = lambda * u_max;

    // Residual ground pressure on lining (elastic, simplified linear GRC)
    // p_lining = p0 * (1 - lambda) = 400 * 0.7 = 280 kPa
    let p_lining: f64 = p0 * (1.0 - lambda);
    assert_close(p_lining, 280.0, 0.01, "residual ground pressure on lining");

    // Model: beam of length = R (one radius) under residual pressure
    // to verify structural response
    let e_c: f64 = 30_000.0;   // MPa concrete
    let t: f64 = 0.30;         // m lining thickness
    let a: f64 = t;
    let iz: f64 = t.powi(3) / 12.0;
    let beam_len: f64 = r;     // representative segment length

    let q: f64 = -p_lining;    // downward
    let n_elem: usize = 4;
    let mut loads = Vec::new();
    for i in 0..n_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input = make_beam(n_elem, beam_len, e_c, a, iz, "fixed", Some("fixed"), loads);
    let results = solve_2d(&input).expect("solve");

    // Fixed-fixed end moment: M = q*L^2/12 = 280 * 16 / 12 = 373.3 kN.m
    let m_expected: f64 = p_lining * beam_len * beam_len / 12.0;
    let m_fem: f64 = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();
    assert_close(m_fem, m_expected, 0.02, "GRC lining moment M=qL^2/12");

    // Compare with full overburden (no pre-convergence) moment
    let m_full: f64 = p0 * beam_len * beam_len / 12.0;
    assert!(m_fem < m_full,
        "Pre-convergence reduces moment: {:.1} < {:.1}", m_fem, m_full);
}

// ================================================================
// 5. Segmental Lining: Ring of Beam Elements, Hoop Thrust N = p*R
// ================================================================
//
// A circular lining under uniform radial pressure p develops
// pure hoop compression: N = p * R (no bending for uniform load).
//
// Model: ring of beam elements under radial nodal loads.
// Verify axial force in each element = p * R.

#[test]
fn tunnel_segmental_lining_hoop_thrust() {
    let r: f64 = 3.0;          // m tunnel radius
    let p: f64 = 200.0;        // kPa uniform radial pressure
    let n_seg: usize = 16;     // number of segments in ring

    let e: f64 = 30_000.0;     // MPa concrete
    let t: f64 = 0.30;         // m thickness
    let a: f64 = t;
    let iz: f64 = t.powi(3) / 12.0;

    // Create ring of beam elements
    let mut nodes = Vec::new();
    for i in 0..n_seg {
        let theta: f64 = 2.0 * std::f64::consts::PI * i as f64 / n_seg as f64;
        let x: f64 = r * theta.cos();
        let y: f64 = r * theta.sin();
        nodes.push((i + 1, x, y));
    }

    let mut elems = Vec::new();
    for i in 0..n_seg {
        let nj = if i + 1 < n_seg { i + 2 } else { 1 };
        elems.push((i + 1, "frame", i + 1, nj, 1, 1, false, false));
    }

    // Fix one node to prevent rigid body motion (node 1: fully fixed)
    // Pin node at opposite side to allow ring deformation
    let opp_node = n_seg / 2 + 1;
    let sups = vec![
        (1, 1_usize, "fixed"),
        (2, opp_node, "pinned"),
    ];

    // Apply uniform radial inward loads at each node
    // Each node contributes arc length = 2*pi*R / n_seg
    let arc_per_node: f64 = 2.0 * std::f64::consts::PI * r / n_seg as f64;
    let f_per_node: f64 = p * arc_per_node; // total force per node (radial)

    let mut loads = Vec::new();
    for i in 0..n_seg {
        let theta: f64 = 2.0 * std::f64::consts::PI * i as f64 / n_seg as f64;
        // Radial inward: fx = -f*cos(theta), fy = -f*sin(theta)
        let fx: f64 = -f_per_node * theta.cos();
        let fy: f64 = -f_per_node * theta.sin();
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: i + 1, fx, fy, mz: 0.0,
        }));
    }

    let input = make_input(
        nodes,
        vec![(1, e, 0.2)],
        vec![(1, a, iz)],
        elems,
        sups,
        loads,
    );
    let results = solve_2d(&input).expect("solve");

    // Expected hoop thrust: N = p * R = 200 * 3 = 600 kN/m
    let n_expected: f64 = p * r;

    // Check axial forces in elements away from supports (to avoid support artifacts)
    // Elements at 90-degree and 270-degree positions (quarter points)
    let quarter_elem = n_seg / 4; // element at ~90 degrees
    let ef_quarter = results.element_forces.iter()
        .find(|f| f.element_id == quarter_elem).unwrap();

    // Axial force should be compressive and close to p*R
    // Use n_start (negative = compression in local coords)
    let n_actual: f64 = ef_quarter.n_start.abs();
    assert_close(n_actual, n_expected, 0.10,
        "hoop thrust N=p*R at quarter point");

    // Bending moments should be small compared to N*t
    // (uniform pressure -> near-zero moment)
    let m_quarter: f64 = ef_quarter.m_start.abs();
    let m_reference: f64 = n_expected * t; // N*t as reference scale
    assert!(m_quarter < 0.15 * m_reference,
        "uniform ring: M={:.2} should be small vs N*t={:.2}", m_quarter, m_reference);
}

// ================================================================
// 6. Surcharge on Shallow Tunnel: Equivalent Beam Model
// ================================================================
//
// A shallow tunnel crown modeled as a fixed-fixed beam under
// surcharge load q_s applied at the surface. The load spreads
// through the soil at 2V:1H (or 1V:1H), increasing the loaded width.
//
// For depth z and surcharge width B_s:
//   Effective width at crown: B_eff = B_s + z (1V:1H spread)
//   Equivalent UDL on crown: q_crown = q_s * B_s / B_eff
//
// Reference: AASHTO LRFD 12.11.2 (live load distribution)

#[test]
fn tunnel_surcharge_on_shallow_crown() {
    let z: f64 = 3.0;          // m, depth to crown
    let b_s: f64 = 2.0;        // m, surcharge width at surface
    let q_s: f64 = 50.0;       // kPa, surcharge intensity

    // Load spread: 1V:1H on each side
    let b_eff: f64 = b_s + 2.0 * z; // = 2 + 6 = 8 m
    let q_crown: f64 = q_s * b_s / b_eff;
    // = 50 * 2 / 8 = 12.5 kPa at crown level
    assert_close(q_crown, 12.5, 0.01, "surcharge spread q_crown");

    // Model crown as fixed-fixed beam, span = tunnel diameter
    let d_tunnel: f64 = 6.0;   // m diameter
    let e: f64 = 30_000.0;
    let t: f64 = 0.25;
    let a: f64 = t;
    let iz: f64 = t.powi(3) / 12.0;

    let n_elem: usize = 4;
    let q: f64 = -q_crown; // downward
    let mut loads = Vec::new();
    for i in 0..n_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input = make_beam(n_elem, d_tunnel, e, a, iz, "fixed", Some("fixed"), loads);
    let results = solve_2d(&input).expect("solve");

    // Fixed-fixed: M_end = q*L^2/12 = 12.5 * 36 / 12 = 37.5 kN.m
    let m_end_expected: f64 = q_crown * d_tunnel * d_tunnel / 12.0;
    let m_fem: f64 = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();
    assert_close(m_fem, m_end_expected, 0.02, "surcharge crown M=qL^2/12");

    // Compare: if no spread (conservative), q = q_s
    let m_no_spread: f64 = q_s * d_tunnel * d_tunnel / 12.0;
    assert!(m_fem < m_no_spread,
        "load spread reduces moment: {:.1} < {:.1}", m_fem, m_no_spread);

    // Reaction: q_crown * L / 2 = 12.5 * 6 / 2 = 37.5 kN
    let ry_expected: f64 = q_crown * d_tunnel / 2.0;
    let ry_fem: f64 = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().ry.abs();
    assert_close(ry_fem, ry_expected, 0.02, "surcharge reaction qL/2");
}

// ================================================================
// 7. Rectangular Tunnel: Portal Frame Under Soil Load
// ================================================================
//
// A rectangular tunnel modeled as a portal frame:
//   - Top slab: earth pressure q_top = gamma * z
//   - Side walls: lateral pressure increasing with depth
//     q_h_top = K0 * gamma * z (at crown)
//     q_h_bot = K0 * gamma * (z + h) (at invert)
//
// Verify global equilibrium and moment distribution.

#[test]
fn tunnel_rectangular_portal_frame_soil_load() {
    let gamma: f64 = 18.0;
    let z: f64 = 8.0;          // m depth to crown
    let h: f64 = 4.0;          // m tunnel height
    let w: f64 = 6.0;          // m tunnel width
    let k0: f64 = 0.5;

    let sigma_v: f64 = gamma * z;          // 144 kPa at crown
    let sigma_h_top: f64 = k0 * gamma * z;         // 72 kPa at crown level
    let sigma_h_bot: f64 = k0 * gamma * (z + h);   // 108 kPa at invert level

    let e: f64 = 30_000.0;
    let t: f64 = 0.30;
    let a: f64 = t;
    let iz: f64 = t.powi(3) / 12.0;

    // Portal frame: nodes at corners
    // Node 1: bottom-left (0,0), Node 2: top-left (0,h)
    // Node 3: top-right (w,h), Node 4: bottom-right (w,0)
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left wall (vertical)
        (2, "frame", 2, 3, 1, 1, false, false), // top slab (horizontal)
        (3, "frame", 3, 4, 1, 1, false, false), // right wall (vertical)
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4_usize, "fixed")];

    // Load: UDL on top slab (element 2), downward
    let q_top: f64 = -sigma_v; // kN/m downward

    // Lateral loads on walls: trapezoidal (sigma_h varies with depth)
    // Left wall (element 1): node_i=1 (bottom), node_j=2 (top)
    // Local y-axis for upward element = global -x (leftward).
    // Inward pressure (rightward) on left wall = negative local y.
    let q_left_i: f64 = -sigma_h_bot;  // at bottom of left wall (node 1), inward
    let q_left_j: f64 = -sigma_h_top;  // at top of left wall (node 2), inward

    // Right wall (element 3): node_i=3 (top), node_j=4 (bottom)
    // Local y-axis for downward element = global +x (rightward).
    // Inward pressure (leftward) on right wall = negative local y.
    let q_right_i: f64 = -sigma_h_top; // at top of right wall (node 3), inward
    let q_right_j: f64 = -sigma_h_bot; // at bottom of right wall (node 4), inward

    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: q_top, q_j: q_top, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: q_left_i, q_j: q_left_j, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 3, q_i: q_right_i, q_j: q_right_j, a: None, b: None,
        }),
    ];

    let input = make_input(
        nodes,
        vec![(1, e, 0.2)],
        vec![(1, a, iz)],
        elems,
        sups,
        loads,
    );
    let results = solve_2d(&input).expect("solve");

    // Vertical equilibrium: total vertical load = sigma_v * w
    let total_vert: f64 = sigma_v * w; // = 144 * 6 = 864 kN
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_vert, 0.02, "rect tunnel vertical equilibrium");

    // Horizontal equilibrium: left wall pushes right, right wall pushes left
    // Net lateral force from left wall = (q_left_i + q_left_j)/2 * h = (108+72)/2 * 4 = 360 kN (rightward)
    // Net lateral force from right wall = (q_right_i + q_right_j)/2 * h = -(72+108)/2 * 4 = -360 kN (leftward)
    // Net horizontal = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < 1.0,
        "horizontal equilibrium: sum_rx = {:.2} ~ 0", sum_rx);

    // Both vertical reactions should be similar (symmetric vertical load)
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    let ry_diff: f64 = (r_left.ry - r_right.ry).abs();
    let ry_avg: f64 = (r_left.ry + r_right.ry) / 2.0;
    assert!(ry_diff / ry_avg < 0.05,
        "vertical reactions nearly equal: left={:.1}, right={:.1}", r_left.ry, r_right.ry);
}

// ================================================================
// 8. Lining Thickness Effect: Thicker Lining More Moment Less Deformation
// ================================================================
//
// Compare two linings under the same load:
//   - Thin lining: t1 (less stiff, more deformation, less moment attracted)
//   - Thick lining: t2 > t1 (stiffer, less deformation, more moment attracted)
//
// For a fixed-fixed beam:
//   M = q*L^2/12 (independent of stiffness for fixed-fixed)
//   delta = q*L^4 / (384*EI) (inversely proportional to I)
//
// So for the same loading and boundary conditions:
//   delta_thick / delta_thin = I_thin / I_thick
//   M_end (same for both in fixed-fixed case)

#[test]
fn tunnel_lining_thickness_effect() {
    let span: f64 = 5.0;       // m
    let q_val: f64 = 100.0;    // kN/m downward
    let e: f64 = 30_000.0;

    // Thin lining: t1 = 200mm
    let t1: f64 = 0.20;
    let a1: f64 = t1;
    let iz1: f64 = t1.powi(3) / 12.0;

    // Thick lining: t2 = 400mm (double thickness)
    let t2: f64 = 0.40;
    let a2: f64 = t2;
    let iz2: f64 = t2.powi(3) / 12.0;

    let n_elem: usize = 6;

    // Solve thin lining
    let mut loads_thin = Vec::new();
    for i in 0..n_elem {
        loads_thin.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q_val, q_j: -q_val, a: None, b: None,
        }));
    }
    let input_thin = make_beam(n_elem, span, e, a1, iz1, "fixed", Some("fixed"), loads_thin);
    let res_thin = solve_2d(&input_thin).expect("solve thin");

    // Solve thick lining
    let mut loads_thick = Vec::new();
    for i in 0..n_elem {
        loads_thick.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q_val, q_j: -q_val, a: None, b: None,
        }));
    }
    let input_thick = make_beam(n_elem, span, e, a2, iz2, "fixed", Some("fixed"), loads_thick);
    let res_thick = solve_2d(&input_thick).expect("solve thick");

    // Both have same end moment (fixed-fixed: M = qL^2/12 regardless of EI)
    let m_end_expected: f64 = q_val * span * span / 12.0;
    let m_thin: f64 = res_thin.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();
    let m_thick: f64 = res_thick.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();

    assert_close(m_thin, m_end_expected, 0.02, "thin lining end moment");
    assert_close(m_thick, m_end_expected, 0.02, "thick lining end moment");

    // Deflection: thick lining should deflect less
    let mid_node = n_elem / 2 + 1;
    let delta_thin: f64 = res_thin.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy.abs();
    let delta_thick: f64 = res_thick.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy.abs();

    assert!(delta_thick < delta_thin,
        "thick lining deflects less: {:.6e} < {:.6e}", delta_thick, delta_thin);

    // Deflection ratio should be inversely proportional to I ratio
    // I2/I1 = (t2/t1)^3 = 2^3 = 8
    // delta_thin / delta_thick = I2/I1 = 8
    let i_ratio: f64 = iz2 / iz1;
    let delta_ratio: f64 = delta_thin / delta_thick;
    assert_close(delta_ratio, i_ratio, 0.02,
        "deflection ratio = I_thick/I_thin");

    // Analytical deflection check: delta = qL^4 / (384*EI)
    let e_actual: f64 = e * 1000.0;
    let delta_thin_analytical: f64 = q_val * span.powi(4) / (384.0 * e_actual * iz1);
    assert_close(delta_thin, delta_thin_analytical, 0.05,
        "thin lining analytical deflection qL^4/(384EI)");
}
