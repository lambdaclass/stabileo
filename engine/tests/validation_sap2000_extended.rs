/// Validation: SAP2000 / CSI-Style Extended Verification Problems
///
/// Reference: CSI Knowledge Base test problems, reproduced analytically.
///
/// Tests: three-span continuous beam, two-story two-bay frame, Warren truss,
///        Gerber beam (intermediate hinge), 3D L-frame with torsion,
///        3-story shear building modal, P-delta amplified portal,
///        two-span beam with settlement.
mod helpers;

use dedaliano_engine::solver::{buckling, linear, modal, pdelta};
use dedaliano_engine::types::*;
use helpers::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa
const E_EFF: f64 = E * 1000.0; // kN/m² (solver effective)
const A: f64 = 0.01; // m²
const IZ: f64 = 1e-4; // m⁴
const NU: f64 = 0.3;
const IY: f64 = 1e-4;
const J: f64 = 5e-5;

// ═══════════════════════════════════════════════════════════════
// 1. Three-Span Continuous Beam with UDL
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_ext_three_span_continuous_udl() {
    // Three equal spans L=6m each, UDL q=20 kN/m
    // By force method for 3 equal spans:
    //   R_outer = 0.4qL, R_inner = 1.1qL
    //   M at interior supports = -qL²/10 (exact for equal spans)
    let l = 6.0;
    let q = 20.0;
    let n_per = 8; // elements per span

    let n_total_elem = n_per * 3;
    let mut loads = Vec::new();
    for i in 0..n_total_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(
        &[l, l, l], n_per, E, A, IZ, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Total load = q * 3L = 360 kN
    let total_load = q * 3.0 * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.01, "SAP_EXT1 equilibrium");

    // Interior reactions ≈ 1.1qL = 132 kN
    let r_inner_expected = 1.1 * q * l;
    // Interior support nodes: end of span 1 (node n_per+1) and end of span 2 (node 2*n_per+1)
    let node_inner1 = n_per + 1;
    let node_inner2 = 2 * n_per + 1;
    let r_inner1 = results.reactions.iter().find(|r| r.node_id == node_inner1).unwrap();
    let r_inner2 = results.reactions.iter().find(|r| r.node_id == node_inner2).unwrap();
    assert_close(r_inner1.ry, r_inner_expected, 0.03, "SAP_EXT1 R_inner1 = 1.1qL");
    assert_close(r_inner2.ry, r_inner_expected, 0.03, "SAP_EXT1 R_inner2 = 1.1qL");

    // Moment at interior supports ≈ -qL²/10 = -72 kN·m
    // The maximum absolute moment near interior support should be close to qL²/10
    let m_expected = q * l * l / 10.0; // 72 kN·m

    // Check element forces near first interior support
    // Elements at support: last element of span 1 ends at interior support
    let elem_at_sup1 = n_per; // element ending at interior support 1
    let ef1 = results.element_forces.iter().find(|e| e.element_id == elem_at_sup1).unwrap();
    // m_end of this element is the moment at the interior support (hogging, so negative or positive)
    assert_close(ef1.m_end.abs(), m_expected, 0.03, "SAP_EXT1 M_interior ≈ qL²/10");

    // Symmetry: interior reactions should be equal
    assert_close(r_inner1.ry, r_inner2.ry, 0.02, "SAP_EXT1 symmetry interior reactions");
}

// ═══════════════════════════════════════════════════════════════
// 2. Two-Story Two-Bay Frame with Gravity + Lateral
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_ext_two_story_two_bay_frame() {
    // Two-story, two-bay frame
    // h=4m per story, bays: 6m each
    // Lateral loads: 30 kN at 1st floor, 60 kN at 2nd floor (inverted triangle)
    // Gravity: 50 kN at each beam-column joint
    //
    // Verify: total base shear = sum of lateral loads = 90 kN
    // Portal method: interior column carries double shear
    let h = 4.0;
    let w = 6.0;
    let h1 = 30.0; // lateral at 1st floor
    let h2 = 60.0; // lateral at 2nd floor
    let p_grav = -50.0; // gravity at joints

    // Nodes:
    // 1(0,0) 2(6,0) 3(12,0)       -- base (fixed)
    // 4(0,4) 5(6,4) 6(12,4)       -- 1st floor
    // 7(0,8) 8(6,8) 9(12,8)       -- 2nd floor
    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0), (3, 2.0 * w, 0.0),
        (4, 0.0, h), (5, w, h), (6, 2.0 * w, h),
        (7, 0.0, 2.0 * h), (8, w, 2.0 * h), (9, 2.0 * w, 2.0 * h),
    ];

    // Elements: columns 1-4, 2-5, 3-6, 4-7, 5-8, 6-9; beams 4-5, 5-6, 7-8, 8-9
    let elems = vec![
        (1, "frame", 1, 4, 1, 1, false, false),  // col left 1st
        (2, "frame", 2, 5, 1, 1, false, false),  // col mid 1st
        (3, "frame", 3, 6, 1, 1, false, false),  // col right 1st
        (4, "frame", 4, 7, 1, 1, false, false),  // col left 2nd
        (5, "frame", 5, 8, 1, 1, false, false),  // col mid 2nd
        (6, "frame", 6, 9, 1, 1, false, false),  // col right 2nd
        (7, "frame", 4, 5, 1, 1, false, false),  // beam 1st floor left
        (8, "frame", 5, 6, 1, 1, false, false),  // beam 1st floor right
        (9, "frame", 7, 8, 1, 1, false, false),  // beam 2nd floor left
        (10, "frame", 8, 9, 1, 1, false, false), // beam 2nd floor right
    ];

    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed"), (3, 3, "fixed")];

    let loads = vec![
        // Lateral loads at left column joints
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: h1, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: h2, fy: 0.0, mz: 0.0 }),
        // Gravity at all floor joints
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: p_grav, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fy: p_grav, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fy: p_grav, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 0.0, fy: p_grav, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 8, fx: 0.0, fy: p_grav, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 9, fx: 0.0, fy: p_grav, mz: 0.0 }),
    ];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Total base shear = sum of horizontal reactions = -(h1 + h2) = -90 kN
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let total_lateral = h1 + h2;
    assert_close(sum_rx.abs(), total_lateral, 0.02, "SAP_EXT2 base shear = applied lateral");

    // Total vertical reaction = total gravity = 6 * 50 = 300 kN
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_gravity = 6.0 * p_grav.abs();
    assert_close(sum_ry, total_gravity, 0.02, "SAP_EXT2 vertical equilibrium");

    // Portal method: interior column carries ~double the shear of exterior columns
    // Base shear at 1st story = h1 + h2 = 90 kN
    // For portal method: exterior col shear ≈ V/4, interior col shear ≈ V/2
    // (Each bay contributes equally, interior column shared by two bays)
    // Check: interior column (elem 2: nodes 2-5) has greater shear than exterior (elem 1: nodes 1-4)
    let col_left = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let col_mid = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let col_right = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    let v_left = col_left.v_start.abs();
    let v_mid = col_mid.v_start.abs();
    let v_right = col_right.v_start.abs();

    // Interior column should carry more shear than each exterior column
    assert!(
        v_mid > v_left && v_mid > v_right,
        "SAP_EXT2: interior col shear {:.2} should > exterior ({:.2}, {:.2})",
        v_mid, v_left, v_right
    );

    // The ratio should be roughly 2:1 (portal method), allow wide tolerance since
    // joints are rigid and beams are not infinitely stiff
    let ratio = v_mid / ((v_left + v_right) / 2.0);
    assert!(
        ratio > 1.2 && ratio < 3.0,
        "SAP_EXT2: interior/exterior shear ratio={:.2} should be ~2", ratio
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Warren Truss Bridge (6 panels)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_ext_warren_truss() {
    // 6-panel Warren truss, span = 18m (3m per panel)
    // Height h = 3m (equilateral triangles)
    // Bottom-chord point loads P = 20 kN at each interior bottom node
    //
    // Nodes: bottom chord 1-7, top chord 8-12
    // Pin at node 1, roller at node 7
    let panel = 3.0;
    let h = 3.0;
    let p = 20.0;
    let n_panels = 6;

    // A_truss for chord and diagonal members
    let a_chord = 0.005;   // 50 cm² chord
    let a_diag = 0.003;    // 30 cm² diagonal

    // Bottom chord nodes: 1..7
    let mut nodes = Vec::new();
    for i in 0..=n_panels {
        nodes.push((i + 1, i as f64 * panel, 0.0));
    }
    // Top chord nodes: 8..12 (above panels 1-5 midpoints? No, above bottom joints 2-6)
    // Actually for Warren truss, top nodes are at panel midpoints:
    // Top node k is at x = (k - 0.5) * panel, y = h
    // But simpler: top nodes above every other bottom node
    // Warren: diagonals form W pattern. Let's place top nodes at x = 1.5, 4.5, 7.5, 10.5, 13.5, 16.5
    // That's 6 top nodes for 6 panels, at panel midpoints.
    for i in 0..n_panels {
        nodes.push((n_panels + 2 + i, (i as f64 + 0.5) * panel, h));
    }
    // Top nodes: 8..13

    let mut elems = Vec::new();
    let mut eid = 1;

    // Bottom chord elements: 1-2, 2-3, ..., 6-7
    for i in 0..n_panels {
        elems.push((eid, "truss", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }

    // Top chord elements: 8-9, 9-10, ..., 12-13
    for i in 0..(n_panels - 1) {
        let n_start = n_panels + 2 + i;
        let n_end = n_start + 1;
        elems.push((eid, "truss", n_start, n_end, 1, 2, false, false));
        eid += 1;
    }

    // Diagonal elements (Warren pattern): connect bottom to top alternating
    // Left diagonal of panel i: bottom(i+1) -> top(n_panels+2+i)
    // Right diagonal of panel i: top(n_panels+2+i) -> bottom(i+2)
    for i in 0..n_panels {
        let top_node = n_panels + 2 + i;
        let bot_left = i + 1;
        let bot_right = i + 2;
        // Left diagonal (rising)
        elems.push((eid, "truss", bot_left, top_node, 1, 2, false, false));
        eid += 1;
        // Right diagonal (falling)
        elems.push((eid, "truss", top_node, bot_right, 1, 2, false, false));
        eid += 1;
    }

    let sups = vec![(1, 1, "pinned"), (2, n_panels + 1, "rollerX")];

    // Point loads at interior bottom nodes (2..6)
    let mut loads = Vec::new();
    for i in 2..=n_panels {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: i,
            fx: 0.0,
            fy: -p,
            mz: 0.0,
        }));
    }

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a_chord, 1e-10), (2, a_diag, 1e-10)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Total load = 5 * 20 = 100 kN
    let total_load = (n_panels - 1) as f64 * p;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02, "SAP_EXT3 truss equilibrium");

    // Symmetry: reactions should be equal (symmetric loading on symmetric truss)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r7 = results.reactions.iter().find(|r| r.node_id == n_panels + 1).unwrap();
    assert_close(r1.ry, r7.ry, 0.02, "SAP_EXT3 symmetric reactions");
    assert_close(r1.ry, total_load / 2.0, 0.02, "SAP_EXT3 R = P_total/2");

    // For a Warren truss, maximum diagonal force occurs near supports.
    // Method of sections at first panel:
    // V = R1 - 0 = P_total/2 = 50 kN at first panel
    // Diagonal force = V / sin(θ) where θ = atan(h / (panel/2)) for Warren
    // Actually for Warren with midpoint tops: diagonal length = sqrt(1.5² + 3²) = sqrt(11.25)
    // sin(θ) = h / sqrt((panel/2)² + h²) = 3/sqrt(2.25+9) = 3/sqrt(11.25) ≈ 0.894
    let diag_len = ((panel / 2.0).powi(2) + h.powi(2)).sqrt();
    let sin_theta = h / diag_len;

    // Max diagonal force near support ≈ V_max / sin(θ)
    let v_max = total_load / 2.0; // shear at support
    let f_diag_expected = v_max / sin_theta;

    // Find the maximum axial force among diagonal elements
    // Diagonals start from element id after chord elements
    let n_chord_elems = n_panels + (n_panels - 1); // bottom + top chord
    let max_diag_force: f64 = results.element_forces.iter()
        .filter(|e| e.element_id > n_chord_elems)
        .map(|e| e.n_start.abs().max(e.n_end.abs()))
        .fold(0.0, f64::max);

    // The maximum diagonal force should be close to V/sin(θ)
    assert_close(max_diag_force, f_diag_expected, 0.10,
        "SAP_EXT3 max diagonal force ≈ V/sin(θ)");

    // All elements should have no bending (truss elements)
    for ef in &results.element_forces {
        assert!(
            ef.m_start.abs() < 0.1 && ef.m_end.abs() < 0.1,
            "SAP_EXT3: truss element {} has moment ({:.4}, {:.4})",
            ef.element_id, ef.m_start, ef.m_end
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// 4. Beam with Intermediate Hinge (Gerber Beam)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_ext_gerber_beam_intermediate_hinge() {
    // Gerber beam: two spans, L1 = 8m, L2 = 6m
    // Internal hinge at the junction of the two spans (at x=8m)
    // UDL q=15 kN/m on span 1 only
    // Supports: pinned at x=0, roller at x=8m (junction), roller at x=14m
    //
    // With hinge at the interior support, moment must be zero there.
    // This makes span 2 a simply-supported beam with no load → zero forces in span 2
    // Span 1 behaves as simply supported with UDL: M_max = qL1²/8
    let l1 = 8.0;
    let l2 = 6.0;
    let q = 15.0;
    let n1 = 8; // elements for span 1
    let n2 = 6; // elements for span 2

    let _n_total = n1 + n2;
    let elem_len1 = l1 / n1 as f64;
    let elem_len2 = l2 / n2 as f64;

    let mut nodes_vec = Vec::new();
    // Span 1 nodes
    for i in 0..=n1 {
        nodes_vec.push((i + 1, i as f64 * elem_len1, 0.0));
    }
    // Span 2 nodes (starting after span 1 end)
    for i in 1..=n2 {
        nodes_vec.push((n1 + 1 + i, l1 + i as f64 * elem_len2, 0.0));
    }

    let mut elems_vec = Vec::new();
    // Span 1 elements
    for i in 0..n1 {
        elems_vec.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    // Last element of span 1 gets hinge_end = true, first of span 2 gets hinge_start = true
    // The hinge is at node n1+1. So element n1 (ending at n1+1) has hinge_end
    // and element n1+1 (starting at n1+1) has hinge_start.
    // Overwrite last span 1 element with hinge_end
    elems_vec.pop();
    elems_vec.push((n1, "frame", n1, n1 + 1, 1, 1, false, true));

    // Span 2 elements
    elems_vec.push((n1 + 1, "frame", n1 + 1, n1 + 2, 1, 1, true, false));
    for i in 1..n2 {
        elems_vec.push((n1 + 1 + i, "frame", n1 + 1 + i, n1 + 2 + i, 1, 1, false, false));
    }

    // Supports: pinned at node 1, roller at node n1+1 (interior), roller at last node
    let last_node = n1 + 1 + n2;
    let sups_vec = vec![
        (1, 1, "pinned"),
        (2, n1 + 1, "rollerX"),
        (3, last_node, "rollerX"),
    ];

    // UDL on span 1 only
    let mut loads = Vec::new();
    for i in 0..n1 {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_input(
        nodes_vec, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems_vec, sups_vec, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // 1. Moment at hinge should be zero
    let elem_before_hinge = results.element_forces.iter()
        .find(|e| e.element_id == n1).unwrap();
    assert!(
        elem_before_hinge.m_end.abs() < 0.5,
        "SAP_EXT4: moment at hinge should ≈ 0, got {:.4}", elem_before_hinge.m_end
    );

    let elem_after_hinge = results.element_forces.iter()
        .find(|e| e.element_id == (n1 + 1) as usize).unwrap();
    assert!(
        elem_after_hinge.m_start.abs() < 0.5,
        "SAP_EXT4: moment after hinge should ≈ 0, got {:.4}", elem_after_hinge.m_start
    );

    // 2. With hinge at interior support and load only on span 1:
    //    Span 1 acts as simply supported → R1 = R_interior_from_span1 = qL1/2
    //    Span 2 has no load and zero moment at left end → R at right end = 0
    let total_load = q * l1;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02, "SAP_EXT4 vertical equilibrium");

    // Reactions: R1 ≈ qL1/2 = 60 kN
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry, q * l1 / 2.0, 0.03, "SAP_EXT4 R1 = qL/2");

    // 3. Max midspan moment of span 1 ≈ qL1²/8 = 15*64/8 = 120 kN·m
    let m_max_expected = q * l1 * l1 / 8.0;
    let m_max_span1: f64 = results.element_forces.iter()
        .filter(|e| e.element_id <= n1)
        .map(|e| e.m_start.abs().max(e.m_end.abs()))
        .fold(0.0, f64::max);
    assert_close(m_max_span1, m_max_expected, 0.03, "SAP_EXT4 M_max = qL²/8");
}

// ═══════════════════════════════════════════════════════════════
// 5. 3D Space Frame: L-Shaped with Torsion
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_ext_3d_l_frame_torsion() {
    // L-shaped space frame in the XZ plane:
    //   Segment 1: vertical column (0,0,0) -> (0,0,4) along Z
    //   Segment 2: horizontal beam (0,0,4) -> (5,0,4) along X
    // Fixed at base (node 1). Tip load Fy = -10 kN at node 3 (out of plane).
    //
    // The out-of-plane load induces:
    //   - Bending in the beam (about local Z for beam along X)
    //   - Torsion in the column (about its local axis along Z)
    //
    // At the corner (node 2), torsional moment transfer occurs.
    // Equilibrium: base reaction Fy = applied load, base Mx (torsion about X)
    // balances the beam's bending moment.
    let h = 4.0;
    let w = 5.0;
    let fy_load = -10.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, 0.0, h),
        (3, w, 0.0, h),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1), // column along Z
        (2, "frame", 2, 3, 1, 1), // beam along X
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]), // full fix
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3,
        fx: 0.0, fy: fy_load, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // 1. Global equilibrium: reaction Fy at base = +10 kN (opposite to applied)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.fy, fy_load.abs(), 0.02, "SAP_EXT5 Fy equilibrium");

    // 2. Tip deflection should be primarily in Y direction
    let tip = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert!(tip.uy.abs() > 1e-6, "SAP_EXT5: tip should deflect in Y");
    assert!(tip.uy < 0.0, "SAP_EXT5: tip Y deflection should be negative (downward)");

    // 3. The beam applies a moment at the corner = Fy * w = 10 * 5 = 50 kN·m
    // This must be equilibrated by the column torsion + bending at the base.
    // Check moment equilibrium at base: sum of base moments about Z axis passing through node 1
    // My at base should be related to Fy * some arm, but more precisely:
    // The total base moment magnitude should be nonzero and consistent.
    let base_m_total = (r1.mx.powi(2) + r1.my.powi(2) + r1.mz.powi(2)).sqrt();
    assert!(base_m_total > 1.0, "SAP_EXT5: base should have significant moment, got {:.4}", base_m_total);

    // 4. Column element should have torsion (mx component)
    // The out-of-plane load on the beam creates torsion in the column
    let col = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!(
        col.mx_start.abs() > 0.1 || col.mx_end.abs() > 0.1,
        "SAP_EXT5: column should have torsion, mx=({:.4}, {:.4})",
        col.mx_start, col.mx_end
    );

    // 5. Biaxial bending: the beam bends about its weak axis due to Fy
    let beam = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    // Beam moment at fixed end (node 2 side) should be close to Fy * w (cantilever moment)
    // mz_start of beam should be approximately fy_load * w = -50 kN·m (depends on sign convention)
    let beam_bending = beam.mz_start.abs().max(beam.mz_end.abs());
    let m_expected = fy_load.abs() * w;
    assert_close(beam_bending, m_expected, 0.03, "SAP_EXT5 beam moment = Fy×L");
}

// ═══════════════════════════════════════════════════════════════
// 6. Modal Analysis: 3-Story Shear Building
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_ext_3story_shear_building_modal() {
    // Three equal stories, h=3.5m each, single bay w=6m
    // All columns and beams identical → shear building model
    //
    // Analytical first mode for N-story shear building:
    //   ω_n² = 2k/m × (1 - cos(nπ/(2N+1)))
    // For N=3, first mode (n=1):
    //   ω₁² = 2k/m × (1 - cos(π/7))
    //
    // We verify:
    //   - 3 modes found
    //   - Frequencies ordered: f1 < f2 < f3
    //   - f1 in a physically reasonable range
    let h = 3.5;
    let w = 6.0;
    let density = 7_850.0;

    // Use stiff beams to approximate shear building
    let iz_col = 1e-4;
    let iz_beam = 1e-2; // much stiffer

    // Nodes: 4 at base + 4 at each floor = 8 total
    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0),               // base
        (3, 0.0, h), (4, w, h),                     // 1st floor
        (5, 0.0, 2.0 * h), (6, w, 2.0 * h),       // 2nd floor
        (7, 0.0, 3.0 * h), (8, w, 3.0 * h),       // 3rd floor
    ];

    let elems = vec![
        // 1st story columns
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        // 1st floor beam
        (3, "frame", 3, 4, 1, 2, false, false),
        // 2nd story columns
        (4, "frame", 3, 5, 1, 1, false, false),
        (5, "frame", 4, 6, 1, 1, false, false),
        // 2nd floor beam
        (6, "frame", 5, 6, 1, 2, false, false),
        // 3rd story columns
        (7, "frame", 5, 7, 1, 1, false, false),
        (8, "frame", 6, 8, 1, 1, false, false),
        // 3rd floor beam
        (9, "frame", 7, 8, 1, 2, false, false),
    ];

    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];
    let loads = Vec::new();

    let input = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, A, iz_col), (2, A, iz_beam)],
        elems, sups, loads,
    );

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), density);
    densities.insert("2".to_string(), density);

    let modal_res = modal::solve_modal_2d(&input, &densities, 5).unwrap();

    // Should find at least 3 modes
    assert!(
        modal_res.modes.len() >= 3,
        "SAP_EXT6: should find >= 3 modes, got {}", modal_res.modes.len()
    );

    // Frequencies should be ordered
    let f1 = modal_res.modes[0].frequency;
    let f2 = modal_res.modes[1].frequency;
    let f3 = modal_res.modes[2].frequency;
    assert!(f1 < f2, "SAP_EXT6: f1={:.3} should < f2={:.3}", f1, f2);
    assert!(f2 < f3, "SAP_EXT6: f2={:.3} should < f3={:.3}", f2, f3);

    // For a shear building with nearly rigid beams:
    //   k_story = 2 × 12EI_col/h³ (two columns per story)
    //   m_story ≈ density × A × total_member_length_per_story
    //
    // Each story has 2 columns (h each) and 1 beam (w), total = 2h + w
    // k_story in kN/m, m_story in kg (note: E_EFF is in kN/m², so k in kN/m = 1000 N/m)
    //
    // Analytical: ω₁² = 2(k/m)(1 - cos(π/7))
    let k_story_kn = 2.0 * 12.0 * E_EFF * iz_col / h.powi(3); // kN/m
    let k_story_n = k_story_kn * 1000.0; // N/m
    let m_story = density * A * (2.0 * h + w); // kg (consistent density * cross-section * length)

    let omega1_sq_theory = 2.0 * (k_story_n / m_story) * (1.0 - (std::f64::consts::PI / 7.0).cos());
    let f1_theory = omega1_sq_theory.sqrt() / (2.0 * std::f64::consts::PI);

    // With finite beam stiffness and distributed mass (consistent, not lumped), the actual
    // frequency will differ from the ideal shear building. Allow 50% tolerance.
    assert!(
        f1 > f1_theory * 0.5 && f1 < f1_theory * 2.0,
        "SAP_EXT6: f1={:.3} Hz should be near analytical {:.3} Hz (shear building approx)",
        f1, f1_theory
    );

    // Mode frequency ratios for ideal 3-DOF shear building:
    // f2/f1 ≈ 2.8, f3/f1 ≈ 4.0 (for equal mass/stiffness)
    // With real frame, ratios differ but f2/f1 should be > 1.5
    assert!(
        f2 / f1 > 1.3,
        "SAP_EXT6: f2/f1={:.2} should > 1.3", f2 / f1
    );

    // All frequencies positive
    assert!(f1 > 0.0 && f2 > 0.0 && f3 > 0.0, "SAP_EXT6: all frequencies positive");
}

// ═══════════════════════════════════════════════════════════════
// 7. P-Delta Amplified Portal Frame
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_ext_pdelta_amplified_portal() {
    // Single-bay portal frame: gravity + lateral load
    // Compare direct P-delta analysis amplification vs AISC B2 factor.
    //
    // B2 = 1 / (1 - ΣP_story / P_e_story)
    // where P_e_story can be estimated from eigenvalue buckling: P_e = α_cr × ΣP
    // Thus B2 = 1 / (1 - 1/α_cr)
    //
    // Use moderate gravity (not close to buckling) so B2 is ~1.1-1.3
    let h = 5.0;
    let w = 6.0;
    let p_grav = 300.0; // gravity per column (moderate)
    let h_load = 30.0;  // lateral

    let input = make_portal_frame(h, w, E, A, IZ, h_load, -p_grav);

    // 1. Linear analysis
    let lin = linear::solve_2d(&input).unwrap();

    // 2. Eigenvalue buckling to get α_cr
    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    if alpha_cr <= 1.5 {
        // Too close to buckling, skip test
        return;
    }

    // B2 from eigenvalue
    let b2_eigenvalue = 1.0 / (1.0 - 1.0 / alpha_cr);

    // 3. P-delta iterative analysis
    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-6).unwrap();
    assert!(pd.converged, "SAP_EXT7: P-delta should converge");

    // 4. Compare amplification of lateral displacement at beam level
    let lin_d = lin.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    let pd_d = pd.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    if lin_d < 1e-10 {
        return;
    }

    let b2_actual = pd_d / lin_d;

    // B2 should be > 1.0 (P-delta amplifies displacement)
    assert!(
        b2_actual > 1.0,
        "SAP_EXT7: B2_actual={:.4} should > 1.0", b2_actual
    );

    // B2 from eigenvalue and from P-delta should agree within 20%
    let rel = (b2_actual - b2_eigenvalue).abs() / b2_eigenvalue;
    assert!(
        rel < 0.20,
        "SAP_EXT7: B2_actual={:.4}, B2_eigen={:.4}, α_cr={:.3}, diff={:.1}%",
        b2_actual, b2_eigenvalue, alpha_cr, rel * 100.0
    );

    // 5. Compare amplified moments at column base
    // The amplified base moment should be roughly B2 times the linear moment
    let lin_r1 = lin.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let pd_r1 = pd.results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    if lin_r1.mz.abs() > 0.1 {
        let moment_amp = pd_r1.mz.abs() / lin_r1.mz.abs();
        // Moment amplification should be in the neighborhood of B2
        assert!(
            moment_amp > 1.0 && moment_amp < b2_eigenvalue * 1.5,
            "SAP_EXT7: moment amplification={:.4}, expected near B2={:.4}",
            moment_amp, b2_eigenvalue
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// 8. Two-Span Beam with Interior Support Settlement
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_ext_beam_settlement() {
    // Two-span continuous beam, each span L=6m
    // Fixed at both ends, roller at interior support
    // Interior support settles by δ = -0.005m (5mm downward)
    //
    // For a two-span beam fixed at both ends with settlement at interior roller:
    // The settlement induces moments and reactions without external load.
    //
    // For a propped cantilever of span L with far end settlement δ:
    //   M = 3EIδ/(2L²) approximately
    // For the full two-span system, by superposition:
    //   Reaction at interior = multiple of EIδ/L³
    //
    // Key checks:
    //   - Sum of reactions = 0 (no external load)
    //   - Interior support has prescribed displacement δ
    //   - Nonzero moments induced throughout
    let l = 6.0;
    let n_per = 8;
    let delta = -0.005; // 5mm settlement (downward)

    let n_total = n_per * 2;
    let n_nodes = n_total + 1;
    let elem_len = l / n_per as f64;

    let mut nodes_map = HashMap::new();
    for i in 0..n_nodes {
        let x = if i <= n_per {
            i as f64 * elem_len
        } else {
            l + (i - n_per) as f64 * elem_len
        };
        nodes_map.insert((i + 1).to_string(), SolverNode {
            id: i + 1, x, y: 0.0,
        });
    }

    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });

    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });

    let mut elems_map = HashMap::new();
    for i in 0..n_total {
        elems_map.insert((i + 1).to_string(), SolverElement {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
    }

    let interior_node = n_per + 1;

    let mut sups_map = HashMap::new();
    // Fixed at left end
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    // Interior roller with settlement
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: interior_node, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: Some(delta), drz: None, angle: None,
    });
    // Fixed at right end
    sups_map.insert("3".to_string(), SolverSupport {
        id: 3, node_id: n_nodes, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![],
    };

    let results = linear::solve_2d(&input).unwrap();

    // 1. No external load → sum of all reactions = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(
        sum_ry.abs() < 0.5,
        "SAP_EXT8: ΣRy={:.4} should ≈ 0 (no external load)", sum_ry
    );

    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(
        sum_rx.abs() < 0.5,
        "SAP_EXT8: ΣRx={:.4} should ≈ 0", sum_rx
    );

    // 2. Interior support displacement should match prescribed settlement
    let d_int = results.displacements.iter()
        .find(|d| d.node_id == interior_node).unwrap();
    assert_close(d_int.uy, delta, 0.03, "SAP_EXT8 settlement at interior support");

    // 3. Settlement induces nonzero moments at supports
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
    assert!(r1.mz.abs() > 0.01, "SAP_EXT8: left end moment should be nonzero");
    assert!(r_end.mz.abs() > 0.01, "SAP_EXT8: right end moment should be nonzero");

    // 4. Symmetry: both spans are equal, settlement is symmetric about the midpoint
    // Left and right end reactions should be equal in magnitude
    assert_close(r1.ry.abs(), r_end.ry.abs(), 0.05, "SAP_EXT8 symmetric end reactions");
    assert_close(r1.mz.abs(), r_end.mz.abs(), 0.05, "SAP_EXT8 symmetric end moments");

    // 5. The induced moment is proportional to EIδ/L²
    // For a fixed-roller-fixed beam with interior settlement:
    // M ≈ 3EIδ/L² at the fixed ends (each span acts as propped cantilever)
    let m_theory = 3.0 * E_EFF * IZ * delta.abs() / (l * l);
    // This is approximate; the two-span system redistributes. Allow generous tolerance.
    assert!(
        r1.mz.abs() > m_theory * 0.3 && r1.mz.abs() < m_theory * 3.0,
        "SAP_EXT8: M_left={:.4} should be near {:.4} (3EIδ/L²)", r1.mz.abs(), m_theory
    );

    // 6. Interior reaction should be nonzero (settlement pushes beam up)
    let r_int = results.reactions.iter().find(|r| r.node_id == interior_node).unwrap();
    assert!(
        r_int.ry.abs() > 0.1,
        "SAP_EXT8: interior reaction should be nonzero, got {:.4}", r_int.ry
    );
}
