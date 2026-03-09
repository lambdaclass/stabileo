/// Validation: Joint Equilibrium Checks
///
/// These tests verify that global equilibrium conditions hold at the structure
/// level: the sum of all reactions must balance the sum of all applied loads
/// in every degree of freedom (Fx, Fy, Mz).
///
/// References:
///   - Timoshenko & Young, "Engineering Mechanics: Statics"
///   - Ghali & Neville, "Structural Analysis", 7th Ed.
///   - Hibbeler, "Structural Analysis", 10th Ed.
///
/// Tests:
///   1. SS beam with midspan point load — vertical and horizontal equilibrium
///   2. Cantilever with tip load and tip moment — force and moment equilibrium
///   3. Portal frame vertical equilibrium under gravity
///   4. Portal frame horizontal equilibrium under lateral load
///   5. Portal frame moment equilibrium about base
///   6. Multi-element SS beam with UDL — global vertical equilibrium
///   7. L-frame with combined loading — full Fx, Fy, Mz equilibrium
///   8. Continuous 3-span beam with UDL — vertical and moment equilibrium
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam Global Equilibrium — Midspan Point Load
// ================================================================
//
// Simply-supported beam, L=10, P=100 at midspan.
// Sum Ry = P, Sum Rx = 0.

#[test]
fn validation_ss_beam_global_equilibrium() {
    let l = 10.0;
    let n = 8;
    let p = 100.0;

    let input = make_beam(
        n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Sum of vertical reactions = applied downward load P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 1e-4, "SS beam: sum Ry = P");

    // Sum of horizontal reactions = 0 (no horizontal load)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(
        sum_rx.abs() < 1e-6,
        "SS beam: sum Rx should be zero, got {:.8}",
        sum_rx
    );

    // Individual reactions: R_A = R_B = P/2 by symmetry
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rb = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(ra.ry, p / 2.0, 1e-4, "SS beam: R_A = P/2");
    assert_close(rb.ry, p / 2.0, 1e-4, "SS beam: R_B = P/2");
}

// ================================================================
// 2. Cantilever Global Equilibrium — Tip Load + Tip Moment
// ================================================================
//
// Fixed-free cantilever, L=6, tip load P=50 (downward), tip moment M=30.
// R_y = P = 50 (upward), R_x = 0, M_fixed = P*L - M = 50*6 - 30 = 270.
// Sign convention: the fixed support moment resists the applied loading.

#[test]
fn validation_cantilever_global_equilibrium() {
    let l = 6.0;
    let n = 6;
    let p = 50.0;
    let m_tip = 30.0;

    let input = make_beam(
        n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: m_tip,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Vertical equilibrium: R_y = P
    let r = &results.reactions[0];
    assert_close(r.ry, p, 1e-4, "Cantilever: R_y = P");

    // Horizontal equilibrium: R_x = 0
    assert!(
        r.rx.abs() < 1e-6,
        "Cantilever: R_x should be zero, got {:.8}",
        r.rx
    );

    // Moment equilibrium about the fixed support:
    // The applied load P at distance L creates clockwise moment P*L.
    // The applied tip moment m_tip acts counterclockwise.
    // The fixed support moment must balance: |M_fixed| = P*L - m_tip = 270.
    // Global moment equilibrium: sum of reaction moments + sum of applied moments = 0.
    // Applied moments about origin: -P * L + m_tip (load P at x=L acts downward = negative moment contribution)
    // Reaction moments: R_y * 0 + M_fixed (both at x=0)
    // So M_fixed = P*L - m_tip = 270
    let m_expected = p * l - m_tip;
    assert_close(r.mz.abs(), m_expected, 0.01, "Cantilever: M_fixed = P*L - M_tip");
}

// ================================================================
// 3. Portal Frame Vertical Equilibrium — Gravity Loads
// ================================================================
//
// Portal frame: nodes 1(0,0), 2(0,h), 3(w,h), 4(w,0).
// Gravity loads G at nodes 2 and 3 (downward).
// Sum of Ry at bases = 2*G.

#[test]
fn validation_portal_vertical_equilibrium() {
    let h = 5.0;
    let w = 8.0;
    let g = 60.0; // gravity load per node (downward)

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, -g);
    let results = linear::solve_2d(&input).unwrap();

    // Total vertical reaction = total gravity = 2*G
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_gravity = 2.0 * g;
    assert_close(sum_ry, total_gravity, 1e-4, "Portal vertical: sum Ry = 2G");

    // Horizontal reactions should be zero (no lateral load)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(
        sum_rx.abs() < 1e-6,
        "Portal vertical: sum Rx should be zero, got {:.8}",
        sum_rx
    );

    // By symmetry, each base carries half
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r1.ry, g, 0.01, "Portal vertical: R1_y = G (symmetry)");
    assert_close(r4.ry, g, 0.01, "Portal vertical: R4_y = G (symmetry)");
}

// ================================================================
// 4. Portal Frame Horizontal Equilibrium — Lateral Load
// ================================================================
//
// Portal frame with lateral load H=40 at node 2.
// Sum of Rx at both bases = -H (reactions oppose applied load).

#[test]
fn validation_portal_horizontal_equilibrium() {
    let h = 4.0;
    let w = 6.0;
    let h_load = 40.0;

    let input = make_portal_frame(h, w, E, A, IZ, h_load, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Horizontal equilibrium: sum Rx + H = 0 => sum Rx = -H
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -h_load, 1e-4, "Portal horizontal: sum Rx = -H");

    // Vertical equilibrium: no gravity => sum Ry = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(
        sum_ry.abs() < 0.01,
        "Portal horizontal: sum Ry should be ~0, got {:.6}",
        sum_ry
    );

    // Both bases share the horizontal reaction (both fixed)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert!(
        r1.rx.abs() > 1.0 && r4.rx.abs() > 1.0,
        "Both bases should carry horizontal reaction: R1_x={:.4}, R4_x={:.4}",
        r1.rx, r4.rx
    );
}

// ================================================================
// 5. Portal Frame Moment Equilibrium About Base
// ================================================================
//
// Portal frame: H=30 lateral at node 2, fixed bases at nodes 1 and 4.
// Nodes: 1(0,0), 2(0,h), 3(w,h), 4(w,0).
//
// Global moment equilibrium about origin (0,0):
//   Moment convention: M = x*Fy - y*Fx (2D cross product r x F).
//
//   Applied: H at node 2 (0,h): M = 0*0 - h*H = -h*H
//   Reaction at node 1 (0,0): M = R1_mz (position at origin, so force lever arms vanish)
//   Reaction at node 4 (w,0): M = w*R4_ry - 0*R4_rx + R4_mz = w*R4_ry + R4_mz
//   Equilibrium: -h*H + R1_mz + w*R4_ry + R4_mz = 0

#[test]
fn validation_portal_moment_equilibrium_about_base() {
    let h = 4.0;
    let w = 6.0;
    let h_load = 30.0;

    let input = make_portal_frame(h, w, E, A, IZ, h_load, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Moment about origin: M = x*Fy - y*Fx for each force.
    // Applied: H at node 2 (0, h): 0*0 - h*H = -h*H
    let applied_moment = 0.0 * 0.0 - h * h_load;

    // Reactions: node 1 at (0,0), node 4 at (w,0)
    let m_r1 = 0.0 * r1.ry - 0.0 * r1.rx + r1.mz;
    let m_r4 = w * r4.ry - 0.0 * r4.rx + r4.mz;
    let reaction_moment = m_r1 + m_r4;

    let residual = applied_moment + reaction_moment;

    assert!(
        residual.abs() < 0.1,
        "Portal moment equilibrium about origin: residual={:.6} (applied={:.4}, reaction={:.4})",
        residual, applied_moment, reaction_moment
    );
}

// ================================================================
// 6. Multi-Element SS Beam with UDL — Global Equilibrium
// ================================================================
//
// 8-element simply-supported beam with UDL q=-15 kN/m, L=12.
// Total load = q*L = 15*12 = 180 kN. Sum Ry = 180.

#[test]
fn validation_multi_element_beam_udl_equilibrium() {
    let l = 12.0;
    let n = 8;
    let q = -15.0; // downward

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    let total_load = q.abs() * l; // 180 kN

    // Vertical equilibrium: sum Ry = total load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 1e-4, "Multi-elem UDL: sum Ry = qL");

    // Horizontal equilibrium: sum Rx = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(
        sum_rx.abs() < 1e-6,
        "Multi-elem UDL: sum Rx should be zero, got {:.8}",
        sum_rx
    );

    // By symmetry, each support carries half
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rb = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(ra.ry, total_load / 2.0, 1e-4, "Multi-elem UDL: R_A = qL/2");
    assert_close(rb.ry, total_load / 2.0, 1e-4, "Multi-elem UDL: R_B = qL/2");

    // Moment equilibrium about left support:
    // Applied load resultant = q*L at L/2. Moment = q*L*(L/2) = 180*6 = 1080.
    // R_B * L = q*L*L/2 => R_B = qL/2 (consistent with above)
    // Check: R_B * L - qL*L/2 = 0
    let moment_residual = rb.ry * l - total_load * l / 2.0;
    assert!(
        moment_residual.abs() < 0.1,
        "Multi-elem UDL: moment equilibrium residual = {:.6}",
        moment_residual
    );
}

// ================================================================
// 7. L-Frame with Combined Loading
// ================================================================
//
// Two-member L-frame: vertical column (node 1 at (0,0) to node 2 at (0,4))
// and horizontal beam (node 2 at (0,4) to node 3 at (6,4)).
// Fixed support at node 1, free at node 3.
// Applied loads: lateral Fx=25 at node 3, vertical Fy=-40 at node 3, Mz=15 at node 2.
//
// Global equilibrium:
//   sum Rx + 25 = 0 => sum Rx = -25
//   sum Ry - 40 = 0 => sum Ry = 40
//   Moment about origin (M = x*Fy - y*Fx):
//     6*(-40) - 4*25 + 15 + R1_mz = 0
//     => R1_mz = 240 + 100 - 15 = 325

#[test]
fn validation_l_frame_combined_loading_equilibrium() {
    let h = 4.0;
    let w = 6.0;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // vertical column
            (2, "frame", 2, 3, 1, 1, false, false), // horizontal beam
        ],
        vec![(1, 1, "fixed")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 3, fx: 25.0, fy: -40.0, mz: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2, fx: 0.0, fy: 0.0, mz: 15.0,
            }),
        ],
    );
    let results = linear::solve_2d(&input).unwrap();

    let r1 = &results.reactions[0]; // fixed support at node 1

    // Horizontal equilibrium: R_x + 25 = 0
    assert_close(r1.rx, -25.0, 1e-4, "L-frame: R_x = -25");

    // Vertical equilibrium: R_y - 40 = 0
    assert_close(r1.ry, 40.0, 1e-4, "L-frame: R_y = 40");

    // Moment equilibrium about origin (node 1 at (0,0)):
    // Convention: moment from force F at (x,y) = x*Fy - y*Fx (2D cross product).
    //
    // Applied loads:
    //   Fx=25, Fy=-40 at node 3 (6,4): M = 6*(-40) - 4*25 = -240 - 100 = -340
    //   Mz=15 at node 2: M = 15 directly
    //   Total applied = -340 + 15 = -325
    //
    // Reaction at node 1 (0,0): M = 0*Ry - 0*Rx + Mz = Mz
    // Equilibrium: applied + reaction = 0 => Mz = 325
    let applied_moment_about_origin =
        w * (-40.0) - h * 25.0  // x*Fy - y*Fx for load at node 3 (6,4)
        + 15.0;                 // Direct moment at node 2

    let reaction_moment_about_origin = r1.mz; // R1 at origin, so only direct moment
    let residual = applied_moment_about_origin + reaction_moment_about_origin;

    assert!(
        residual.abs() < 0.1,
        "L-frame moment equilibrium: residual={:.6}, applied={:.4}, reaction_mz={:.4}",
        residual, applied_moment_about_origin, r1.mz
    );
}

// ================================================================
// 8. Continuous Beam 3-Span Equilibrium
// ================================================================
//
// 3-span continuous beam with UDL q=-12 kN/m.
// Spans: L1=5, L2=6, L3=5, total length = 16.
// 4 elements per span = 12 elements total.
// Supports: pinned at first node, rollerX at each span boundary.
// Total load = q * L_total = 12 * 16 = 192.
// Sum of all Ry = 192.
// Moment about first support = 0 (check that sum of Ry*x_support - q*L*L/2 = 0).

#[test]
fn validation_continuous_beam_3span_equilibrium() {
    let spans = [5.0, 6.0, 5.0];
    let l_total: f64 = spans.iter().sum();
    let n_per = 4;
    let n_total_elements = n_per * spans.len();
    let q = -12.0; // downward

    let mut loads = Vec::new();
    for i in 0..n_total_elements {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(&spans, n_per, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let total_load = q.abs() * l_total; // 192

    // Vertical equilibrium: sum Ry = total load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.01, "3-span continuous: sum Ry = qL_total");

    // Horizontal equilibrium: sum Rx = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(
        sum_rx.abs() < 1e-6,
        "3-span continuous: sum Rx should be zero, got {:.8}",
        sum_rx
    );

    // Moment equilibrium about first support (node 1 at x=0):
    // Each support at x_i with reaction R_i contributes R_i * x_i.
    // The UDL resultant acts at L_total/2 with magnitude q*L_total (downward).
    // So: sum(R_i * x_i) = q * L_total * L_total / 2
    //
    // Support positions: node 1 at x=0, node (n_per+1) at x=5,
    //   node (2*n_per+1) at x=11, node (3*n_per+1) at x=16.
    let support_nodes: Vec<usize> = vec![1, n_per + 1, 2 * n_per + 1, 3 * n_per + 1];
    let mut x_positions = Vec::new();
    let mut cumulative_x = 0.0;
    x_positions.push(0.0);
    for &span in &spans {
        cumulative_x += span;
        x_positions.push(cumulative_x);
    }

    let mut moment_sum = 0.0;
    for (i, &node_id) in support_nodes.iter().enumerate() {
        let r = results.reactions.iter().find(|r| r.node_id == node_id).unwrap();
        moment_sum += r.ry * x_positions[i];
    }

    // The distributed load resultant moment about x=0:
    // Integral of q*x dx from 0 to L = q*L^2/2 = 12*256/2 = 1536
    let load_moment = q.abs() * l_total * l_total / 2.0;
    let moment_residual = moment_sum - load_moment;

    assert!(
        moment_residual.abs() < 1.0,
        "3-span continuous: moment equilibrium residual={:.4} (reactions={:.4}, load={:.4})",
        moment_residual, moment_sum, load_moment
    );

    // Verify all reactions are positive (upward) for uniform downward load
    for &node_id in &support_nodes {
        let r = results.reactions.iter().find(|r| r.node_id == node_id).unwrap();
        assert!(
            r.ry > 0.0,
            "3-span continuous: reaction at node {} should be upward, got Ry={:.4}",
            node_id, r.ry
        );
    }
}
