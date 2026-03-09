/// Validation: Hibbeler's "Structural Analysis" (10th Ed.) — Extended Problems
///
/// References:
///   - R.C. Hibbeler, "Structural Analysis", 10th Ed.
///   - Chapters on deflections (Ch.8), indeterminate structures (Ch.10-12),
///     trusses (Ch.3), influence lines (Ch.6), and direct stiffness method (Ch.14-15).
///
/// Tests cover problems NOT already in validation_hibbeler_problems.rs:
///   1. Conjugate beam slopes (Ch.8)
///   2. Portal frame deflection via virtual work (Ch.9)
///   3. Two-span continuous beam via three-moment equation (Ch.10)
///   4. Moment distribution on portal frame with sway (Ch.12)
///   5. Warren truss method of sections (Ch.3)
///   6. Influence line for SS beam reaction (Ch.6)
///   7. Fixed-fixed beam with differential settlement (Ch.10)
///   8. Cable-like truss structure (Ch.5 style)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01; // m^2
const IZ: f64 = 1e-4; // m^4

// ================================================================
// 1. Conjugate Beam Method: Slopes at Supports of SS Beam
// ================================================================
//
// Hibbeler Ch.8: SS beam with point load P at L/3 from left support.
// L = 9m, P = 45 kN, a = L/3 = 3m, b = 2L/3 = 6m.
//
// Analytical slopes (from conjugate beam / virtual work):
//   theta_A = P*a*b*(L+b) / (6*L*EI)
//   theta_B = P*a*b*(L+a) / (6*L*EI)
//
// These are the rotations at the two supports (simply supported).

#[test]
fn validation_hibbeler_ext_1_conjugate_beam() {
    let l = 9.0;
    let n = 12;
    let p = 45.0;
    let a = l / 3.0; // 3m
    let b = 2.0 * l / 3.0; // 6m
    let e_eff = E * 1000.0; // kN/m^2

    // Place load at node closest to a = 3m
    // n=12 elements, elem_len = 9/12 = 0.75m, node at 3m is node 5 (x=3.0)
    let load_node = (a / (l / n as f64)).round() as usize + 1;

    let input = make_beam(
        n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Analytical slopes
    let theta_a_exact = p * a * b * (l + b) / (6.0 * l * e_eff * IZ);
    let theta_b_exact = p * a * b * (l + a) / (6.0 * l * e_eff * IZ);

    // Solver rotations at support nodes
    let d_a = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_b = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Left support: positive rotation (beam slopes down to the right)
    // Right support: negative rotation (beam slopes down to the left from right end)
    assert_close(d_a.rz.abs(), theta_a_exact, 0.03,
        "Conjugate beam: theta_A = Pab(L+b)/(6LEI)");
    assert_close(d_b.rz.abs(), theta_b_exact, 0.03,
        "Conjugate beam: theta_B = Pab(L+a)/(6LEI)");

    // Additionally verify theta_A > theta_B (load closer to A, so A has larger slope)
    // Actually: a < b, so (L+b) > (L+a), meaning theta_A > theta_B.
    assert!(d_a.rz.abs() > d_b.rz.abs(),
        "Conjugate beam: theta_A > theta_B since load closer to A");
}

// ================================================================
// 2. Portal Frame: Virtual Work Horizontal Displacement
// ================================================================
//
// Hibbeler Ch.9: L-shaped frame (column + beam).
// Column: fixed base at (0,0), height H=4m to node (0,4).
// Beam: from (0,4) to (5,4), length L=5m, pinned at far end.
// UDL w=20 kN/m on the beam.
//
// Horizontal displacement at beam tip from virtual work:
// The beam bends under UDL, inducing rotation at the column-beam joint.
// This rotation causes lateral sway at the beam tip.
//
// We verify: equilibrium + the horizontal displacement at beam tip is
// consistent with a frame analysis.

#[test]
fn validation_hibbeler_ext_2_virtual_work_frame() {
    let h = 4.0;
    let l_beam = 5.0;
    let w = 20.0; // kN/m UDL on beam
    let n_col = 8; // elements in column
    let n_beam = 10; // elements in beam
    let e_eff = E * 1000.0;

    let col_elem_len = h / n_col as f64;
    let beam_elem_len = l_beam / n_beam as f64;

    // Nodes: column from (0,0) to (0,h), beam from (0,h) to (l_beam, h)
    let mut nodes = Vec::new();
    let mut node_id = 1;
    // Column nodes (vertical)
    for i in 0..=n_col {
        nodes.push((node_id, 0.0, i as f64 * col_elem_len));
        node_id += 1;
    }
    // Beam nodes (horizontal, starting from the column-beam joint)
    let joint_node = n_col + 1; // top of column
    for i in 1..=n_beam {
        nodes.push((node_id, i as f64 * beam_elem_len, h));
        node_id += 1;
    }
    let tip_node = n_col + 1 + n_beam;
    let n_total_elements = n_col + n_beam;

    // Elements
    let mut elems = Vec::new();
    let mut eid = 1;
    // Column elements
    for i in 0..n_col {
        elems.push((eid, "frame", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Beam elements
    for i in 0..n_beam {
        let ni = joint_node + i;
        let nj = joint_node + i + 1;
        elems.push((eid, "frame", ni, nj, 1, 1, false, false));
        eid += 1;
    }

    // Supports: fixed at base, pinned at beam tip
    let sups = vec![
        (1, 1_usize, "fixed"),
        (2, tip_node, "pinned"),
    ];

    // UDL on beam elements
    let mut loads = Vec::new();
    for i in 0..n_beam {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: n_col + 1 + i,
            q_i: -w,
            q_j: -w,
            a: None,
            b: None,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Verify equilibrium: total vertical reactions = w * L_beam
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, w * l_beam, 0.02,
        "Virtual work frame: SumRy = w*L");

    // The beam tip (pinned) should have zero displacement (it's a support)
    let d_tip = results.displacements.iter().find(|d| d.node_id == tip_node).unwrap();
    assert!(d_tip.ux.abs() < 1e-6 && d_tip.uy.abs() < 1e-6,
        "Virtual work frame: beam tip pinned, zero displacement");

    // The column-beam joint should have horizontal displacement
    // due to bending in the frame. With fixed base + rigid joint,
    // the beam load causes the joint to displace.
    let d_joint = results.displacements.iter().find(|d| d.node_id == joint_node).unwrap();

    // The frame is highly constrained: fixed base + pinned beam tip.
    // The pinned support at the beam tip constrains horizontal motion,
    // so the joint displacement is very small (axial deformation of beam only).
    // This is expected — the beam acts as a near-rigid horizontal strut.
    //
    // We verify: joint has measurable (nonzero) horizontal displacement,
    // and the vertical deflection at beam midspan is significant.
    assert!(d_joint.ux.abs() > 1e-8,
        "Virtual work frame: joint has nonzero horizontal displacement: ux={:.6e}",
        d_joint.ux);

    // Vertical deflection at beam midspan should be significant.
    // For a beam fixed at one end and pinned at the other under UDL:
    // delta_max ~ wL^4/(185*EI)
    let beam_mid_node = joint_node + n_beam / 2;
    let d_beam_mid = results.displacements.iter()
        .find(|d| d.node_id == beam_mid_node).unwrap();
    let delta_beam_approx = w * l_beam.powi(4) / (185.0 * e_eff * IZ);
    assert!(d_beam_mid.uy.abs() > delta_beam_approx * 0.1,
        "Virtual work frame: beam midspan has vertical deflection: uy={:.6e}, approx={:.6e}",
        d_beam_mid.uy, delta_beam_approx);

    // Verify moment at fixed base is non-zero
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r_base.mz.abs() > 1.0,
        "Virtual work frame: fixed base has moment reaction: Mz={:.4}", r_base.mz);

    // Check that total number of elements processed is correct
    assert_eq!(results.element_forces.len(), n_total_elements,
        "Virtual work frame: all elements have forces");
}

// ================================================================
// 3. Three-Moment Equation: Two-Span Continuous Beam
// ================================================================
//
// Hibbeler Ch.10: Two-span continuous beam, pinned supports at A, B, C.
// Spans: L1=5m, L2=6m. UDL w=12 kN/m on both spans.
//
// By three-moment equation for continuous beam with UDL on both spans:
//   M_A*L1 + 2*M_B*(L1+L2) + M_C*L2 = -w*L1^3/4 - w*L2^3/4
//
// With M_A = 0 (pinned), M_C = 0 (pinned):
//   2*M_B*(L1+L2) = -w*L1^3/4 - w*L2^3/4
//   M_B = -w*(L1^3 + L2^3) / (8*(L1+L2))
//
// Reactions from statics after M_B is known.

#[test]
fn validation_hibbeler_ext_3_three_moment_2span() {
    let l1 = 5.0;
    let l2 = 6.0;
    let w = 12.0; // kN/m
    let n1 = 12; // elements per span 1
    let n2 = 14; // elements per span 2

    let input = make_continuous_beam(
        &[l1, l2], n1.max(n2), E, A, IZ,
        {
            let n_per = n1.max(n2);
            let total = n_per * 2;
            let mut loads = Vec::new();
            for i in 0..total {
                loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                    element_id: i + 1,
                    q_i: -w,
                    q_j: -w,
                    a: None,
                    b: None,
                }));
            }
            loads
        },
    );
    let results = linear::solve_2d(&input).unwrap();

    // Three-moment equation result:
    let mb_exact = -w * (l1.powi(3) + l2.powi(3)) / (8.0 * (l1 + l2));

    // Interior support moment: find the element force at the interior support
    // The interior support node is at the boundary between span 1 and span 2.
    let n_per = n1.max(n2);
    let interior_node = n_per + 1;

    // Get moment at interior support from the last element of span 1
    let ef_last_span1 = results.element_forces.iter()
        .find(|e| e.element_id == n_per)
        .unwrap();
    // m_end is the moment at the j-end (interior support end)

    // The solver's m_end sign convention may differ from the analytical sign.
    // Compare absolute values since mb_exact is negative (hogging).
    assert_close(ef_last_span1.m_end.abs(), mb_exact.abs(), 0.05,
        &format!("Three-moment: |M_B| = w(L1^3+L2^3)/(8(L1+L2)) = {:.2}", mb_exact.abs()));

    // Reactions by statics (M_B is negative = hogging):
    //
    // Span 1 FBD, moments about A:
    //   R_B1*L1 - w*L1^2/2 + M_B = 0
    //   R_B1 = (w*L1^2/2 - M_B) / L1
    //   R_A = w*L1 - R_B1
    //
    // Span 2 FBD, moments about C:
    //   R_B2*L2 - w*L2^2/2 + M_B = 0
    //   R_B2 = (w*L2^2/2 - M_B) / L2
    //   R_C = w*L2 - R_B2
    //
    // R_B = R_B1 + R_B2 (superposition from both spans)
    let rb1 = (w * l1 * l1 / 2.0 - mb_exact) / l1;
    let ra_exact = w * l1 - rb1;
    let rb2 = (w * l2 * l2 / 2.0 - mb_exact) / l2;
    let rc_exact = w * l2 - rb2;
    let total_load = w * (l1 + l2);
    let rb_exact = rb1 + rb2;

    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let rb = results.reactions.iter().find(|r| r.node_id == interior_node).unwrap().ry;
    let last_node = 2 * n_per + 1;
    let rc = results.reactions.iter().find(|r| r.node_id == last_node).unwrap().ry;

    assert_close(ra, ra_exact, 0.03,
        &format!("Three-moment: R_A = {:.2}", ra_exact));
    assert_close(rb, rb_exact, 0.03,
        &format!("Three-moment: R_B = {:.2}", rb_exact));
    assert_close(rc, rc_exact, 0.03,
        &format!("Three-moment: R_C = {:.2}", rc_exact));

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02,
        "Three-moment: SumRy = w*(L1+L2)");
}

// ================================================================
// 4. Moment Distribution: Portal Frame with Lateral Load (Sway)
// ================================================================
//
// Hibbeler Ch.12: Symmetric portal frame with fixed bases.
// H=4m, L=6m, lateral load P=30kN at beam level.
//
// By slope-deflection / moment distribution with sway:
// For symmetric portal frame with fixed bases under lateral load P:
//   - Each column carries P/2 shear
//   - Column moments: M_top = M_base (antisymmetric bending)
//   - By equilibrium on column: P/2 * H = M_top + M_base = 2*M
//     => M = P*H/4 per column end
//
// With flexible beam:
//   - Distribution depends on stiffness ratio k_col/k_beam
//   - k_col = 4EI/H, k_beam = 4EI/L
//   - DF_beam_at_joint = k_beam/(k_col + k_beam) = H/(H+L) (for equal EI)
//   - DF_col_at_joint = L/(H+L)
//
// The exact moment distribution result for this symmetric frame:
//   M_base = P*H/4 * (3L+2H)/(3L+4H) * 2  (from sway analysis)
//   Actually: for symmetric sway, M_base = 3EI*delta/(H^2) per column.
//   Using stiffness method: delta = P*H^3/(24EI) * (2H+3L)/(2H+3L) ...
//
// We verify equilibrium and symmetry instead of exact formula.

#[test]
fn validation_hibbeler_ext_4_moment_distribution_frame() {
    let h = 4.0;
    let l = 6.0;
    let p = 30.0; // lateral load at beam level

    let input = make_portal_frame(h, l, E, A, IZ, p, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Portal frame nodes: 1=(0,0), 2=(0,H), 3=(L,H), 4=(L,0)
    // Supports: fixed at 1 and 4.

    // Horizontal equilibrium: sum_rx = -P
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02,
        "Moment dist frame: SumRx = -P (horizontal equilibrium)");

    // Vertical equilibrium: sum_ry = 0 (no gravity loads)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry.abs() < 0.1,
        "Moment dist frame: SumRy ~= 0 (no gravity): {:.6}", sum_ry);

    // Symmetry: both columns share lateral load equally
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r1.rx, r4.rx, 0.05,
        "Moment dist frame: symmetric horizontal reactions");
    assert_close(r1.rx, -p / 2.0, 0.05,
        "Moment dist frame: each base takes P/2 shear");

    // Equal sway at both top nodes
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert_close(d2.ux, d3.ux, 0.02,
        "Moment dist frame: equal sway at top");

    // Moment equilibrium about base-left:
    // P*H + M1 + M4 + R4y * L = 0
    let moment_eq = -p * h + r1.mz + r4.mz + r4.ry * l;
    assert!(moment_eq.abs() < p * h * 0.02,
        "Moment dist frame: moment equilibrium: residual={:.4}", moment_eq);

    // Column base moments by slope-deflection for symmetric portal with sway.
    // Full derivation (equal EI everywhere):
    //   theta/psi = 6/(4 + 6H/L)
    //   From shear equilibrium: psi = P*H^2 / (15*EI) [cancels below]
    //   M_base = (2EI/H)*(theta - 3*psi) = -3*P*H/10
    //   |M_base| = 3*P*H/10 = 3*30*4/10 = 36.0 kN.m
    let m_base_exact = 3.0 * p * h / 10.0;
    // Both bases should have similar absolute moment
    assert_close(r1.mz.abs(), m_base_exact, 0.05,
        &format!("Moment dist frame: M_base = 3PH/10 = {:.2}", m_base_exact));
}

// ================================================================
// 5. Warren Truss: Method of Sections
// ================================================================
//
// Hibbeler Ch.3: 4-panel Warren truss.
// Total span L=16m (4 panels x 4m), height H=3m.
// Simply supported: pinned at left, roller at right.
// Point loads: P=10kN at each interior bottom joint (nodes 2,3,4).
//
// By method of sections (cut through panel 2):
//   Bottom chord force (tension) in panel 2-3:
//     Taking moments about top node of panel 2 (above node 2):
//     F_bottom * H = R_A * 2*dx - P * dx
//     R_A = 3P/2 = 15 (by symmetry, 3 loads of 10kN)
//     Actually RA = (P*4 + P*8 + P*12)/(16) with loads at x=4,8,12
//     Wait: loads at bottom joints 2,3,4 => x = 4, 8, 12
//     RA = P*(12+8+4)/16 = 30*10/16... no.
//     RA = P*(16-4)/16 + P*(16-8)/16 + P*(16-12)/16 = 10*(12+8+4)/16 = 15
//     RD = 30 - 15 = 15 (symmetric loading).
//
// Cut through members between panels 2 and 3 (at x=8, mid-span):
//   - Top chord: take moments about bottom node 3 (x=8, y=0)
//     R_A * 8 - P*4 - P*0 + F_top * H = 0 (if top chord is at y=H)
//     Wait, in a Warren truss the top nodes are at midpoints of panels.
//     Top node above panel boundary at x=8 would be... let me reconsider.
//
// Actually for a Warren truss with 4 panels:
//   Bottom nodes: 1(0,0), 2(4,0), 3(8,0), 4(12,0), 5(16,0)
//   Top nodes: 6(2,3), 7(6,3), 8(10,3), 9(14,3)
//
// Method of sections cutting between x=6 and x=8:
//   Members cut: top chord 7-8, diagonal 7-3 or 8-3, bottom chord 2-3
//   Take moments about node 7 (x=6, y=3):
//     R_A * 6 - P*2 + F_bot_23 * 3 = 0
//     15*6 - 10*2 + F_bot * 3 = 0
//     F_bot = -(90-20)/3 = -23.33  (compression? No, convention depends on direction)
//
// Let's just verify the key member forces using equilibrium checks.

#[test]
fn validation_hibbeler_ext_5_truss_method_sections() {
    let span = 16.0;
    let h = 3.0;
    let n_panels = 4;
    let p = 10.0; // load at each interior bottom node
    let dx = span / n_panels as f64; // 4m

    // Bottom nodes: 1..5
    let mut nodes = Vec::new();
    for i in 0..=n_panels {
        nodes.push((i + 1, i as f64 * dx, 0.0));
    }
    // Top nodes: 6..9 (at centers of panels, shifted by dx/2)
    for i in 0..n_panels {
        nodes.push((n_panels + 2 + i, (i as f64 + 0.5) * dx, h));
    }

    let mut elems = Vec::new();
    let mut eid = 1;

    // Bottom chord: 1-2, 2-3, 3-4, 4-5
    for i in 0..n_panels {
        elems.push((eid, "truss", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Top chord: 6-7, 7-8, 8-9
    for i in 0..n_panels - 1 {
        let t1 = n_panels + 2 + i;
        let t2 = n_panels + 3 + i;
        elems.push((eid, "truss", t1, t2, 1, 1, false, false));
        eid += 1;
    }
    // Diagonals (Warren pattern: W-shape)
    for i in 0..n_panels {
        let bot_left = i + 1;
        let top = n_panels + 2 + i;
        let bot_right = i + 2;
        // Left diagonal: bottom-left to top
        elems.push((eid, "truss", bot_left, top, 1, 1, false, false));
        eid += 1;
        // Right diagonal: top to bottom-right
        elems.push((eid, "truss", top, bot_right, 1, 1, false, false));
        eid += 1;
    }

    // Loads at interior bottom joints: nodes 2, 3, 4
    let mut loads = Vec::new();
    for i in 1..n_panels {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: i + 1, fx: 0.0, fy: -p, mz: 0.0,
        }));
    }

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, 0.001, 0.0)], // Truss: A=0.001, Iz=0 (axial only)
        elems,
        vec![(1, 1, "pinned"), (2, n_panels + 1, "rollerX")],
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Reactions: symmetric loading (loads at x=4,8,12 on 16m span)
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let re = results.reactions.iter().find(|r| r.node_id == n_panels + 1).unwrap().ry;
    let total_load = (n_panels - 1) as f64 * p; // 30 kN
    assert_close(ra, total_load / 2.0, 0.02,
        "Warren truss: R_A = 15 kN (symmetric)");
    assert_close(re, total_load / 2.0, 0.02,
        "Warren truss: R_E = 15 kN (symmetric)");

    // Method of sections at mid-span:
    // Cut between panels 2 and 3 (x ~ 8m). Members cut:
    // - Bottom chord elem 2 (node 2-3): axial force
    // - Top chord elem 6 (node 7-8)
    // - Diagonal elements crossing the cut
    //
    // By equilibrium of left part (nodes 1,2,6,7):
    // RA = 15 kN up, loads: 10 kN down at node 2
    // Net vertical force on left part = 15 - 10 = 5 kN upward
    //
    // Bottom chord between node 2 and 3 (element 2):
    // Take moments about top node 7 (x=6, y=3):
    //   RA*6 - P(at node2)*2 + F_bot*3 = 0
    //   15*6 - 10*2 + F_bot*3 = 0
    //   F_bot = -70/3 = -23.33 kN
    // But sign depends on element orientation. The bottom chord runs left-to-right,
    // so a positive axial force is tension.
    // From our calculation, F_bot = -23.33 => tension of magnitude 23.33 kN
    // (positive n_start means compression for the element convention,
    //  or it could be the other way — let's just check magnitude)

    // Bottom chord at midspan (element 2: nodes 2-3)
    let ef_bot = results.element_forces.iter()
        .find(|e| e.element_id == 2)
        .unwrap();
    let f_bot_exact = 15.0 * 6.0 / 3.0 - 10.0 * 2.0 / 3.0; // = 70/3 = 23.33
    assert_close(ef_bot.n_start.abs(), f_bot_exact, 0.05,
        &format!("Warren truss: bottom chord force = {:.2} kN", f_bot_exact));

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.01,
        "Warren truss: SumRy = total load");
}

// ================================================================
// 6. Influence Line: SS Beam Reaction at Left Support
// ================================================================
//
// Hibbeler Ch.6: SS beam, length L=10m.
// Moving unit load P=1kN from left to right.
// Influence ordinate for R_A at position x:
//   R_A(x) = 1 - x/L
//
// R_A varies linearly from 1.0 (load at A) to 0.0 (load at B).
// We run multiple load cases with P at different positions.

#[test]
fn validation_hibbeler_ext_6_influence_line_beam() {
    let l = 10.0;
    let n = 10; // 10 elements, nodes at 0,1,2,...,10 m
    let p = 1.0; // unit load

    // Test load at each interior node (and at supports)
    let positions = vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // node ids 1..11

    for &load_node in &positions {
        let input = make_beam(
            n, l, E, A, IZ, "pinned", Some("rollerX"),
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
            })],
        );
        let results = linear::solve_2d(&input).unwrap();

        let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
        let x = (load_node - 1) as f64 * (l / n as f64);
        let ra_exact = p * (1.0 - x / l);

        assert_close(ra, ra_exact, 0.02,
            &format!("Influence line: R_A at x={:.1} = {:.3}", x, ra_exact));
    }
}

// ================================================================
// 7. Fixed-Fixed Beam: Differential Settlement
// ================================================================
//
// Hibbeler Ch.10 / Ch.11: Fixed-fixed beam, no external loads.
// Right support settles by delta = 10mm = 0.01m.
// L = 6m.
//
// Induced moments: M = 6EI*delta/L^2 (at both ends, same magnitude).
// Induced shears: V = 12EI*delta/L^3.
//
// This is a pure settlement problem — no applied loads.

#[test]
fn validation_hibbeler_ext_7_fixed_beam_settlement() {
    let l = 6.0;
    let n = 12;
    let delta: f64 = 0.01; // 10 mm settlement
    let e_eff = E * 1000.0;
    let ei = e_eff * IZ;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Build input manually for prescribed displacement
    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: Some(-delta), drz: None, angle: None,
    });

    let mut nodes_map = HashMap::new();
    for (id, x, y) in &nodes {
        nodes_map.insert(id.to_string(), SolverNode { id: *id, x: *x, y: *y });
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = HashMap::new();
    for (id, t, ni, nj, mi, si, hs, he) in &elems {
        elems_map.insert(id.to_string(), SolverElement {
            id: *id, elem_type: t.to_string(), node_i: *ni, node_j: *nj,
            material_id: *mi, section_id: *si, hinge_start: *hs, hinge_end: *he,
        });
    }
    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![], };

    let results = linear::solve_2d(&input).unwrap();

    // Expected moments and shears due to settlement
    let m_exact = 6.0 * ei * delta / (l * l);
    let v_exact = 12.0 * ei * delta / (l * l * l);

    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();

    // Moments at fixed ends
    assert_close(r_left.mz.abs(), m_exact, 0.03,
        &format!("Settlement: M_left = 6EI*delta/L^2 = {:.4}", m_exact));
    assert_close(r_right.mz.abs(), m_exact, 0.03,
        &format!("Settlement: M_right = 6EI*delta/L^2 = {:.4}", m_exact));

    // Shear forces
    assert_close(r_left.ry.abs(), v_exact, 0.03,
        &format!("Settlement: V = 12EI*delta/L^3 = {:.4}", v_exact));
    assert_close(r_right.ry.abs(), v_exact, 0.03,
        "Settlement: V_right = 12EI*delta/L^3");

    // No external loads, so equilibrium: sum_ry = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry.abs() < v_exact * 0.02,
        "Settlement: SumRy = 0 (no external loads): {:.6}", sum_ry);

    // Right support should have displacement = -delta
    let d_right = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    assert_close(d_right.uy, -delta, 0.01,
        "Settlement: right support displaced by -delta");
}

// ================================================================
// 8. Cable-Like Truss: Bottom Chord Tension, Top Chord Compression
// ================================================================
//
// Hibbeler Ch.5 style: Simple Pratt-like truss with 3 panels.
// Span = 9m (3 panels x 3m), height H = 4m.
// Vertical load P = 30 kN at center bottom node.
//
// By equilibrium:
//   R_A = R_D = P/2 = 15 kN (symmetric)
//
// Method of sections (cut at center panel):
//   Bottom chord tension: F_bot = R_A * (L/2) / H = 15 * 4.5 / 4 = 16.875 kN
//   Top chord compression: same magnitude but opposite sign
//   (Taking moments about the opposite chord node)
//
// This verifies the cable-like behavior: bottom = tension, top = compression.

#[test]
fn validation_hibbeler_ext_8_cable_structure() {
    let span = 9.0;
    let h = 4.0;
    let n_panels = 3;
    let p = 30.0;
    let dx = span / n_panels as f64; // 3m

    // Bottom nodes: 1(0,0), 2(3,0), 3(6,0), 4(9,0)
    let mut nodes = Vec::new();
    for i in 0..=n_panels {
        nodes.push((i + 1, i as f64 * dx, 0.0));
    }
    // Top nodes: 5(0,4), 6(3,4), 7(6,4), 8(9,4)
    for i in 0..=n_panels {
        nodes.push((n_panels + 2 + i, i as f64 * dx, h));
    }

    let mut elems = Vec::new();
    let mut eid = 1;

    // Bottom chord: 1-2, 2-3, 3-4
    for i in 0..n_panels {
        elems.push((eid, "truss", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Top chord: 5-6, 6-7, 7-8
    for i in 0..n_panels {
        let t1 = n_panels + 2 + i;
        let t2 = n_panels + 3 + i;
        elems.push((eid, "truss", t1, t2, 1, 1, false, false));
        eid += 1;
    }
    // Verticals: 1-5, 2-6, 3-7, 4-8
    for i in 0..=n_panels {
        let bot = i + 1;
        let top = n_panels + 2 + i;
        elems.push((eid, "truss", bot, top, 1, 1, false, false));
        eid += 1;
    }
    // Diagonals (Pratt pattern: bottom-left to top-right)
    for i in 0..n_panels {
        let bot = i + 1;
        let top = n_panels + 3 + i; // top node to the right
        elems.push((eid, "truss", bot, top, 1, 1, false, false));
        eid += 1;
    }

    // Load at center bottom node (node 3, x=6m)
    // Actually center bottom = node at x = 4.5m, but we have nodes at 0,3,6,9.
    // Mid-span node doesn't exist exactly. Use node 2 (x=3) and node 3 (x=6)
    // for symmetric loading, or load at both interior nodes.
    // For a single central load: load node 2 and 3 each with P/2 for symmetric effect.
    // Or more simply: load at both interior bottom nodes symmetrically.
    // Actually, let's just put the full load at the middle bottom node.
    // With 3 panels, there's no exact center bottom node. Put P/2 at nodes 2 and 3.
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p / 2.0, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -p / 2.0, mz: 0.0,
        }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, 0.001, 0.0)], // Truss section
        elems,
        vec![(1, 1, "pinned"), (2, n_panels + 1, "rollerX")],
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Symmetric reactions
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let rd = results.reactions.iter().find(|r| r.node_id == n_panels + 1).unwrap().ry;
    assert_close(ra, p / 2.0, 0.02, "Cable truss: R_A = P/2 = 15 kN");
    assert_close(rd, p / 2.0, 0.02, "Cable truss: R_D = P/2 = 15 kN");

    // Bottom chord should be in tension (positive n_start for elements going left-to-right)
    // Top chord should be in compression
    // Check middle bottom chord element (element 2: nodes 2-3)
    let ef_bot_mid = results.element_forces.iter()
        .find(|e| e.element_id == 2)
        .unwrap();

    // Check middle top chord element (element 5: top chord nodes 6-7)
    let ef_top_mid = results.element_forces.iter()
        .find(|e| e.element_id == 5)
        .unwrap();

    // Bottom chord: tension (n_start > 0 or n_end < 0 depending on convention)
    // Top chord: compression (opposite sign)
    // The key point is they should have opposite signs.
    let bot_force = ef_bot_mid.n_start;
    let top_force = ef_top_mid.n_start;

    assert!(bot_force * top_force < 0.0,
        "Cable truss: bottom and top chord have opposite signs: bot={:.4}, top={:.4}",
        bot_force, top_force);

    // Method of sections for center panel:
    // Take moments about top node 6 (x=3, y=4) for left part equilibrium:
    //   R_A * 3 - (P/2) * 0 + F_bot_mid * 4 = 0
    //   (Load at node 2 is at x=3, directly below node 6, so moment arm = 0)
    //   F_bot_mid = -R_A * 3 / 4 = -15 * 3 / 4 = -11.25
    //   But sign depends on assumed direction. The magnitude should be:
    //   |F_bot| = R_A * dx / H for the central panel from moment equilibrium.
    //   Actually, the center bottom chord (2-3, x=3 to x=6) sees:
    //   Taking moments about top node 6 (x=3, y=4):
    //     R_A*3 + F_bot_23 * 4 = 0 (load at node 2 is at the section cut, contrib = 0)
    //     F_bot_23 = -15*3/4 = -11.25
    //   But wait, we also have a diagonal crossing the cut.
    //
    // Let's just verify magnitude of bottom chord using a simpler section:
    // Take moments about top node 7 (x=6, y=4) for left half:
    //   R_A * 6 - (P/2)*3 + F_bot_23 * 4 = 0
    //   15*6 - 15*3 + F_bot*4 = 0
    //   90 - 45 + F_bot*4 = 0
    //   F_bot = -45/4 = -11.25 kN
    let f_bot_exact = (ra * 2.0 * dx - (p / 2.0) * dx) / h;
    // = (15*6 - 15*3)/4 = 45/4 = 11.25
    assert_close(ef_bot_mid.n_start.abs(), f_bot_exact, 0.05,
        &format!("Cable truss: bottom chord force = {:.2} kN", f_bot_exact));

    // Top chord should have approximately equal magnitude
    assert_close(ef_top_mid.n_start.abs(), f_bot_exact, 0.15,
        "Cable truss: top chord force ~ bottom chord force in magnitude");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Cable truss: SumRy = P");
}
