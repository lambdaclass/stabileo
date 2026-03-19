/// Validation: Industrial Structures — Extended Analysis
///
/// References:
///   - AISC Design Guide 7: Industrial Buildings (2nd ed., 2004)
///   - PIP STC01015: Structural Design Criteria for Pipe Racks
///   - EN 1993-6: Strength and Stability of Shell Structures
///   - OSHA 1910.23: Ladders, Platforms, Stairways
///   - CEMA: Belt Conveyors for Bulk Materials (7th ed.)
///   - CMAA 74: Specifications for Top Running & Under Running Single Girder EOT Cranes
///   - ASCE 7-22: Minimum Design Loads and Associated Criteria
///   - Blodgett: "Design of Welded Structures" (1966)
///
/// Tests verify pipe rack beams, equipment platforms, stair/access platforms,
/// conveyor support structures, monorail beams, handrail posts, grating panels,
/// and equipment skid foundations.

use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

// ================================================================
// 1. Pipe Rack Beam: Simply-Supported Beam Under Multiple Pipe Loads
// ================================================================
//
// A pipe rack transverse beam carries gravity loads from multiple pipes.
// Per PIP STC01015, pipe loads are modeled as point loads at pipe
// support locations. The beam spans between two columns.
//
// Model: SS beam of length L = 8 m (W310x52 steel section),
// with three pipe loads (P1=15 kN, P2=25 kN, P3=10 kN) at
// positions a1=2m, a2=4m, a3=6m from left support.
//
// Reactions by superposition:
//   R_B = sum(Pi * ai / L), R_A = sum(Pi) - R_B
// Max moment at critical point (under P2 at midspan):
//   M = R_A * a2 - P1 * (a2 - a1)

#[test]
fn industrial_pipe_rack_beam() {
    let l: f64 = 8.0;       // m, span
    let e_steel: f64 = 200_000.0; // MPa
    // W310x52 approximate properties
    let a_sect: f64 = 6.65e-3;   // m^2
    let iz_sect: f64 = 1.19e-4;  // m^4

    let p1: f64 = -15.0;  // kN, pipe 1 (downward)
    let p2: f64 = -25.0;  // kN, pipe 2
    let p3: f64 = -10.0;  // kN, pipe 3
    let a1: f64 = 2.0;    // m, position of pipe 1
    let a2: f64 = 4.0;    // m, position of pipe 2
    let a3: f64 = 6.0;    // m, position of pipe 3

    let n: usize = 8;

    // With 8 elements over 8 m, each element = 1 m.
    // Nodes: 1(x=0), 2(x=1), 3(x=2), 4(x=3), 5(x=4), 6(x=5), 7(x=6), 8(x=7), 9(x=8)
    // Place pipe loads as nodal loads at the correct node positions.
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: p1, my: 0.0, // x=2m
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5, fx: 0.0, fz: p2, my: 0.0, // x=4m
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 7, fx: 0.0, fz: p3, my: 0.0, // x=6m
        }),
    ];

    let input = make_beam(n, l, e_steel, a_sect, iz_sect, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Analytical reactions (taking moments about A):
    // R_B = (P1*a1 + P2*a2 + P3*a3) / L  (signs: loads are negative, so magnitudes)
    let total_load: f64 = (p1 + p2 + p3).abs();
    let r_b_exact: f64 = (p1.abs() * a1 + p2.abs() * a2 + p3.abs() * a3) / l;
    let r_a_exact: f64 = total_load - r_b_exact;

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r_a.rz.abs(), r_a_exact, 0.03, "Pipe rack beam reaction A");
    assert_close(r_b.rz.abs(), r_b_exact, 0.03, "Pipe rack beam reaction B");

    // Moment at midspan (under P2): M = R_A*a2 - P1*(a2 - a1)
    let m_mid_exact: f64 = r_a_exact * a2 - p1.abs() * (a2 - a1);

    // Check via element forces near midspan (element 5, end = node 5+1=6 at x=5.0)
    // Node 5 is at x=4.0 (midspan), so element 5 starts at node 5 (x=4.0)
    // The moment at node 5 (x=4.0): M(4) = R_A*4 - P1*2 = m_mid_exact
    let ef_5 = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();
    let m_at_4: f64 = ef_5.m_start.abs();

    assert_close(m_at_4, m_mid_exact, 0.05, "Pipe rack moment at midspan x=4m");

    // Verify total vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum::<f64>();
    assert_close(sum_ry.abs(), total_load, 0.02, "Pipe rack vertical equilibrium");
}

// ================================================================
// 2. Equipment Platform: Portal Frame Under Equipment Dead Load
// ================================================================
//
// An elevated equipment platform frame supporting a vessel or pump.
// Modeled as a portal frame: two columns (H=4m) + one beam (W=6m),
// with equipment dead load applied as a point load at beam midspan.
//
// For fixed-base portal frame with central point load P on beam:
//   Beam midspan moment ≈ PL/8 (fixed-end moments redistribute)
//   Column base moments arise from frame action.
//   Vertical reactions: R_A = R_B = P/2 (symmetric)

#[test]
fn industrial_equipment_platform() {
    let h: f64 = 4.0;   // m, column height
    let w: f64 = 6.0;   // m, beam span
    let e_steel: f64 = 200_000.0;

    // HEB 200 approximate properties
    let a_sect: f64 = 7.81e-3;   // m^2
    let iz_sect: f64 = 5.70e-5;  // m^4

    // Equipment dead load at beam midspan
    let p_equip: f64 = -80.0; // kN, downward

    // Build the portal frame manually: 4 nodes, 3 elements
    // Node 1: (0,0) fixed
    // Node 2: (0,h) joint
    // Node 3: (w,h) joint
    // Node 4: (w,0) fixed
    // Beam midspan point load: applied on element 2 (beam) at midpoint
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];
    let mats = vec![(1, e_steel, 0.3)];
    let secs = vec![(1, a_sect, iz_sect)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];

    let loads = vec![
        SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 2,
            a: w / 2.0, // midspan of beam
            p: p_equip,
            px: None,
            my: None,
        }),
    ];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Symmetric loading => equal vertical reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    let r_vert_expected: f64 = p_equip.abs() / 2.0; // = 40 kN each

    assert_close(r1.rz.abs(), r_vert_expected, 0.05, "Equipment platform left reaction");
    assert_close(r4.rz.abs(), r_vert_expected, 0.05, "Equipment platform right reaction");

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum::<f64>();
    assert_close(sum_ry.abs(), p_equip.abs(), 0.02, "Equipment platform vertical equilibrium");

    // Symmetric => horizontal reactions should be equal and opposite (sway)
    // Due to symmetry, rx should be very small (ideally zero)
    let rx_sum: f64 = (r1.rx + r4.rx).abs();
    assert!(rx_sum < 0.5, "Horizontal equilibrium: sum_rx = {:.4} ≈ 0", rx_sum);

    // Base moments should be equal by symmetry
    let m1: f64 = r1.my.abs();
    let m4: f64 = r4.my.abs();
    let moment_diff: f64 = (m1 - m4).abs() / m1.max(1.0);
    assert!(moment_diff < 0.05, "Base moments symmetric: M1={:.2}, M4={:.2}", m1, m4);
}

// ================================================================
// 3. Stair/Access Platform: Inclined Stringer Under Uniform Load
// ================================================================
//
// Stairway stringer modeled as an inclined simply-supported beam.
// Rise = 3 m, run = 4 m, so length L = 5 m (3-4-5 triangle).
// Uniform gravity load (self-weight + live load) applied vertically.
//
// For an inclined SS beam under vertical UDL q:
//   The vertical reaction at each end: R = q * L_horizontal / 2
//   (gravity load acts over the horizontal projection)
// Midspan moment: M = q * L_h^2 / 8, where L_h = horizontal run.

#[test]
fn industrial_stair_access_platform() {
    let rise: f64 = 3.0;   // m
    let run: f64 = 4.0;    // m
    let l_inclined: f64 = (rise * rise + run * run).sqrt(); // = 5.0 m

    let e_steel: f64 = 200_000.0;
    // C250x30 channel stringer approximate properties
    let a_sect: f64 = 3.79e-3;
    let iz_sect: f64 = 2.13e-5;

    // Live load: 5 kN/m^2 * 1.0 m trib width = 5 kN/m along stringer
    // Dead load: 1.5 kN/m (self-weight of stringer + treads)
    let q_total: f64 = -(5.0 + 1.5); // kN/m along horizontal projection, downward

    let n: usize = 8;
    let elem_len: f64 = l_inclined / n as f64;

    // Nodes along the inclined stringer
    let cos_a: f64 = run / l_inclined;
    let sin_a: f64 = rise / l_inclined;
    let nodes: Vec<_> = (0..=n)
        .map(|i| {
            let s: f64 = i as f64 * elem_len;
            (i + 1, s * cos_a, s * sin_a)
        })
        .collect();

    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let sups = vec![(1, 1, "pinned"), (2, n + 1, "rollerX")];

    // Distributed load applied transverse to the inclined beam.
    // The solver treats distributed loads as perpendicular to the element axis.
    // To simulate gravity (vertical) load on an inclined beam, we apply
    // the full gravity UDL as the transverse component.
    // For an inclined beam, gravity q_vert decomposes into:
    //   q_transverse = q_vert * cos(alpha)  (perpendicular to beam)
    //   q_axial = q_vert * sin(alpha)       (along beam, neglected for bending)
    // We apply q_transverse as the distributed load.
    let q_transverse: f64 = q_total * cos_a; // transverse component of gravity load

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_transverse, q_j: q_transverse, a: None, b: None,
        }));
    }

    let input = make_input(nodes, vec![(1, e_steel, 0.3)], vec![(1, a_sect, iz_sect)], elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Total transverse force = q_transverse * L_inclined
    // Vertical component of the total transverse force:
    //   F_y = q_transverse * L_inclined * cos(alpha) = q_total * cos^2(alpha) * L_inclined
    let total_transverse: f64 = q_transverse.abs() * l_inclined;
    let total_vert_load: f64 = total_transverse * cos_a;

    // Vertical reactions sum
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum::<f64>();
    assert_close(sum_ry.abs(), total_vert_load, 0.05, "Stair stringer vertical equilibrium");

    // Bending moment at midspan for SS beam under uniform transverse load:
    // M_mid = q_transverse * L_inclined^2 / 8
    let m_mid_expected: f64 = q_transverse.abs() * l_inclined * l_inclined / 8.0;

    // Check midspan element forces
    let mid_elem = n / 2; // element near midspan
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == mid_elem).unwrap();
    let m_mid_num: f64 = ef_mid.m_end.abs();

    assert_close(m_mid_num, m_mid_expected, 0.15, "Stair stringer midspan moment");
}

// ================================================================
// 4. Conveyor Support: Two-Span Continuous Beam Under Belt Tension
// ================================================================
//
// Conveyor stringer beam spans across intermediate supports (bents).
// Modeled as a two-span continuous beam under uniform dead + live load.
//
// For a two-span continuous beam with equal spans L under UDL q:
//   Internal support reaction: R_mid = 5qL/4
//   End reactions: R_end = 3qL/8
//   Max negative moment (at internal support): M = -qL^2/8
//   Max positive moment (in span): M = 9qL^2/128

#[test]
fn industrial_conveyor_support() {
    let span: f64 = 6.0;   // m, each span
    let e_steel: f64 = 200_000.0;

    // W200x36 stringer approximate properties
    let a_sect: f64 = 4.57e-3;
    let iz_sect: f64 = 3.44e-5;

    // Dead load of conveyor + belt + material: 3.0 kN/m
    // Live load (maintenance, dynamic): 1.5 kN/m
    let q: f64 = -(3.0 + 1.5); // kN/m, downward

    let n_per_span: usize = 4;

    let mut loads = Vec::new();
    let total_elements = n_per_span * 2;
    for i in 0..total_elements {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[span, span], n_per_span, e_steel, a_sect, iz_sect, loads);
    let results = solve_2d(&input).expect("solve");

    // Total load = q * 2L
    let total_load: f64 = q.abs() * 2.0 * span;

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum::<f64>();
    assert_close(sum_ry.abs(), total_load, 0.02, "Conveyor support vertical equilibrium");

    // Internal support reaction: R_mid = 5qL/4
    let r_mid_exact: f64 = 5.0 * q.abs() * span / 4.0;
    let mid_node = n_per_span + 1;
    let r_mid = results.reactions.iter().find(|r| r.node_id == mid_node).unwrap();
    assert_close(r_mid.rz.abs(), r_mid_exact, 0.05, "Conveyor internal support reaction");

    // End reactions: R_end = 3qL/8
    let r_end_exact: f64 = 3.0 * q.abs() * span / 8.0;
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.rz.abs(), r_end_exact, 0.05, "Conveyor end support reaction");

    // Negative moment at internal support: M = qL^2/8
    let m_neg_exact: f64 = q.abs() * span * span / 8.0;

    // Element forces at internal support (end of element n_per_span)
    let ef_at_mid = results.element_forces.iter()
        .find(|e| e.element_id == n_per_span).unwrap();
    let m_neg_num: f64 = ef_at_mid.m_end.abs();

    assert_close(m_neg_num, m_neg_exact, 0.05, "Conveyor negative moment at internal support");
}

// ================================================================
// 5. Monorail Beam: Simply-Supported Beam Under Moving Point Load
// ================================================================
//
// Underhung monorail beam for material handling (CMAA 74).
// Modeled as SS beam with point load at midspan (worst case).
//
// Midspan moment: M = PL/4
// Midspan deflection: delta = PL^3/(48EI)
// Reactions: R_A = R_B = P/2

#[test]
fn industrial_monorail_beam() {
    let l: f64 = 6.0;       // m, span
    let e_steel: f64 = 200_000.0;

    // S310x52 (American Standard beam) approximate properties
    let a_sect: f64 = 6.65e-3;
    let iz_sect: f64 = 9.52e-5;

    // Hoist capacity: 20 kN (2 tonne)
    // Trolley weight: 3 kN
    // Impact factor (CMAA): 1.25
    let p_hoist: f64 = 20.0;
    let p_trolley: f64 = 3.0;
    let impact: f64 = 1.25;
    let p_total: f64 = -(p_hoist + p_trolley) * impact; // = -28.75 kN, downward

    let n: usize = 8;

    // Point load at midspan (element n/2, at position 0 within element = start of mid element)
    let loads = vec![
        SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: n / 2,
            a: l / n as f64, // at end of element = midspan of beam
            p: p_total,
            px: None,
            my: None,
        }),
    ];

    let input = make_beam(n, l, e_steel, a_sect, iz_sect, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Reactions: R = P/2
    let r_expected: f64 = p_total.abs() / 2.0;
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r_a.rz.abs(), r_expected, 0.03, "Monorail reaction A");
    assert_close(r_b.rz.abs(), r_expected, 0.03, "Monorail reaction B");

    // Midspan moment: M = PL/4
    let m_expected: f64 = p_total.abs() * l / 4.0;

    // Check element forces around midspan
    let mid_elem_id = n / 2;
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == mid_elem_id).unwrap();
    // The moment at the end of this element (midspan) should approximate PL/4
    let m_numerical: f64 = ef_mid.m_end.abs();
    assert_close(m_numerical, m_expected, 0.10, "Monorail midspan moment");

    // Midspan deflection: delta = PL^3/(48EI)
    let e_eff: f64 = e_steel * 1000.0;
    let delta_expected: f64 = p_total.abs() * l.powi(3) / (48.0 * e_eff * iz_sect);

    let mid_node = n / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();

    assert_close(mid_disp.uz.abs(), delta_expected, 0.10, "Monorail midspan deflection");

    // Deflection limit check: L/450 for monorail (CMAA)
    let delta_limit: f64 = l / 450.0;
    assert!(
        mid_disp.uz.abs() < delta_limit,
        "Monorail deflection {:.4} m < L/450 = {:.4} m",
        mid_disp.uz.abs(), delta_limit
    );
}

// ================================================================
// 6. Handrail Post: Cantilever Under Lateral Load
// ================================================================
//
// Handrail post modeled as a vertical cantilever fixed at base.
// Per OSHA 1910.23: 890 N (0.89 kN) concentrated at top of post.
// Post height = 1.07 m (42 inches per OSHA).
//
// Cantilever: delta = PL^3/(3EI), M_base = P*L
// Use a 40x40x3 mm steel square tube post.

#[test]
fn industrial_handrail_post() {
    let h: f64 = 1.07;     // m, post height (42 inches OSHA)
    let e_steel: f64 = 200_000.0;

    // 40x40x3 mm square tube
    let b_tube: f64 = 0.040;
    let t_tube: f64 = 0.003;
    let b_inner: f64 = b_tube - 2.0 * t_tube;
    let a_post: f64 = b_tube * b_tube - b_inner * b_inner;
    let iz_post: f64 = (b_tube.powi(4) - b_inner.powi(4)) / 12.0;

    // OSHA load: 0.89 kN at top, applied horizontally
    let p_lateral: f64 = 0.89; // kN

    let n: usize = 4;

    // Model as beam along X (horizontal), fixed at start, free at end
    // Lateral load (fy) at tip
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: p_lateral, my: 0.0,
        }),
    ];

    let input = make_beam(n, h, e_steel, a_post, iz_post, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Base moment: M = P * L
    let m_base_expected: f64 = p_lateral * h;
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    assert_close(r_base.my.abs(), m_base_expected, 0.03, "Handrail post base moment");

    // Base shear: V = P
    assert_close(r_base.rz.abs(), p_lateral, 0.03, "Handrail post base shear");

    // Tip deflection: delta = PL^3/(3EI)
    let e_eff: f64 = e_steel * 1000.0;
    let delta_expected: f64 = p_lateral * h.powi(3) / (3.0 * e_eff * iz_post);

    let tip_disp = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    assert_close(tip_disp.uz.abs(), delta_expected, 0.03, "Handrail post tip deflection");

    // Tip rotation: theta = PL^2/(2EI)
    let theta_expected: f64 = p_lateral * h.powi(2) / (2.0 * e_eff * iz_post);
    assert_close(tip_disp.ry.abs(), theta_expected, 0.05, "Handrail post tip rotation");

    // Verify element axial force is negligible (no axial load)
    let ef = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!(ef.n_start.abs() < 0.01, "No axial force in handrail post");
}

// ================================================================
// 7. Grating Panel: SS Beam Under Uniform Area Load
// ================================================================
//
// Steel grating panel for walkway, modeled as a one-way SS beam.
// Per ASCE 7: 5.0 kN/m^2 live load for industrial platforms.
// Panel span = 1.2 m between support beams, width = 1.0 m strip.
//
// Equivalent UDL q = area_load * width.
// Midspan deflection: delta = 5qL^4/(384EI)
// Midspan moment: M = qL^2/8

#[test]
fn industrial_grating_panel() {
    let l: f64 = 1.2;         // m, grating span
    let e_steel: f64 = 200_000.0;

    // Grating bar: 32x3 mm flat bars at 30 mm spacing
    // For 1 m width strip: ~33 bars
    // I per bar = b*h^3/12 = 0.003*0.032^3/12
    // Total I = 33 * I_bar
    let n_bars: f64 = 33.0;
    let b_bar: f64 = 0.003;
    let h_bar: f64 = 0.032;
    let a_per_bar: f64 = b_bar * h_bar;
    let iz_per_bar: f64 = b_bar * h_bar.powi(3) / 12.0;
    let a_total: f64 = n_bars * a_per_bar;
    let iz_total: f64 = n_bars * iz_per_bar;

    // Load: 5 kN/m^2 live + 0.5 kN/m^2 dead (grating self-weight)
    let q_area: f64 = 5.0 + 0.5; // kN/m^2
    let strip_width: f64 = 1.0; // m
    let q: f64 = -q_area * strip_width; // kN/m, downward

    let n: usize = 4;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, e_steel, a_total, iz_total, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    let e_eff: f64 = e_steel * 1000.0;

    // Midspan deflection: delta = 5qL^4/(384EI)
    let delta_expected: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * iz_total);

    let mid_node = n / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();

    assert_close(mid_disp.uz.abs(), delta_expected, 0.05, "Grating midspan deflection");

    // Reactions: R = qL/2
    let r_expected: f64 = q.abs() * l / 2.0;
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.rz.abs(), r_expected, 0.02, "Grating support reaction");

    // Midspan moment: M = qL^2/8
    let m_expected: f64 = q.abs() * l * l / 8.0;

    // Check via element forces at midspan element
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    let m_mid_num: f64 = ef_mid.m_end.abs();

    assert_close(m_mid_num, m_expected, 0.05, "Grating midspan moment");

    // Deflection serviceability: L/250 for floor grating
    let delta_limit: f64 = l / 250.0;
    assert!(
        mid_disp.uz.abs() < delta_limit,
        "Grating deflection {:.5} m < L/250 = {:.5} m",
        mid_disp.uz.abs(), delta_limit
    );
}

// ================================================================
// 8. Equipment Skid Foundation: Continuous Beam on Multiple Supports
// ================================================================
//
// Equipment skid (e.g., pump or compressor package) modeled as a
// continuous beam on three equally-spaced supports with concentrated
// equipment loads at 1/3 and 2/3 points.
//
// Three-span continuous beam (3 supports): pin-roller-roller.
// Point loads at L/3 and 2L/3 from left end.
// Verify reactions and global equilibrium.

#[test]
fn industrial_equipment_skid_foundation() {
    let total_length: f64 = 6.0; // m, total skid length
    let span: f64 = 3.0;         // m, each span (2 spans, 3 supports)
    let e_steel: f64 = 200_000.0;

    // W200x46 skid beam approximate properties
    let a_sect: f64 = 5.89e-3;
    let iz_sect: f64 = 4.54e-5;

    // Equipment loads: motor at L/3, pump at 2L/3
    let p_motor: f64 = -30.0;   // kN, downward
    let p_pump: f64 = -50.0;    // kN, downward

    let n_per_span: usize = 6;
    let total_elements = n_per_span * 2;
    let elem_len: f64 = total_length / total_elements as f64;

    // Point loads at L/3=2.0m and 2L/3=4.0m
    // L/3 = 2.0 m => element index (0-based) = 2.0 / elem_len = 4, at start
    // 2L/3 = 4.0 m => element index = 4.0 / elem_len = 8, at start
    let elem_for_motor: usize = (2.0 / elem_len).round() as usize;
    let elem_for_pump: usize = (4.0 / elem_len).round() as usize;

    let loads = vec![
        SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: elem_for_motor,
            a: 0.0,
            p: p_motor,
            px: None,
            my: None,
        }),
        SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: elem_for_pump,
            a: 0.0,
            p: p_pump,
            px: None,
            my: None,
        }),
    ];

    let input = make_continuous_beam(&[span, span], n_per_span, e_steel, a_sect, iz_sect, loads);
    let results = solve_2d(&input).expect("solve");

    // Total applied load
    let total_load: f64 = (p_motor + p_pump).abs();

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum::<f64>();
    assert_close(sum_ry.abs(), total_load, 0.03, "Skid vertical equilibrium");

    // All reactions should be upward (positive ry) for downward loads
    for rxn in &results.reactions {
        assert!(
            rxn.rz > -0.1,
            "Support {} reaction should be upward, got ry = {:.3}",
            rxn.node_id, rxn.rz
        );
    }

    // Internal support (mid-support) should carry the largest reaction
    // because loads are near the center of the two-span beam
    let mid_node = n_per_span + 1;
    let r_mid = results.reactions.iter().find(|r| r.node_id == mid_node).unwrap();
    let r_end_1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end_2 = results.reactions.iter()
        .find(|r| r.node_id == total_elements + 1).unwrap();

    assert!(
        r_mid.rz > r_end_1.rz && r_mid.rz > r_end_2.rz,
        "Internal support carries most load: R_mid={:.2} > R_1={:.2}, R_n={:.2}",
        r_mid.rz, r_end_1.rz, r_end_2.rz
    );

    // Check that beam deflects downward at load points
    let motor_node = elem_for_motor + 1;
    let pump_node = elem_for_pump + 1;

    let disp_motor = results.displacements.iter()
        .find(|d| d.node_id == motor_node).unwrap();
    let disp_pump = results.displacements.iter()
        .find(|d| d.node_id == pump_node).unwrap();

    assert!(disp_motor.uz < 0.0, "Motor location deflects downward");
    assert!(disp_pump.uz < 0.0, "Pump location deflects downward");

    // Deflection should be small for a stiff skid beam
    let delta_limit: f64 = span / 360.0; // typical serviceability limit
    assert!(
        disp_motor.uz.abs() < delta_limit,
        "Motor deflection {:.5} m < L/360 = {:.5} m",
        disp_motor.uz.abs(), delta_limit
    );
}
