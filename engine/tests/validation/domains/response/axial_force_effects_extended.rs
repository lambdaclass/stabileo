/// Validation: Extended Axial Force Effects in Frame and Truss Elements
///
/// References:
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed., Ch. 2 (composite bars)
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 3 (trusses)
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 3 (truss analysis)
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 2
///
/// Tests verify:
///   1. Stepped bar with different cross-section areas
///   2. Axial deformation inversely proportional to cross-section area
///   3. Three-member determinate truss force resolution
///   4. Parallel bars sharing axial load by stiffness ratio
///   5. Multi-segment bar with intermediate nodal loads
///   6. Symmetric Howe truss with symmetric loading
///   7. Four-bar planar truss: equilibrium and zero-force members
///   8. Axial force superposition under multiple nodal loads
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const E_EFF: f64 = E * 1000.0;

// ================================================================
// 1. Stepped Bar with Different Cross-Section Areas
// ================================================================
//
// Two segments in series along x-axis, each with different area.
// Segment 1 (node 1-2): length L1, area A1
// Segment 2 (node 2-3): length L2, area A2
// Applied force F at free end (node 3). Fixed at node 1.
//
// Total elongation: delta = F*L1/(E*A1) + F*L2/(E*A2)
// Axial force is F in both segments (same force transmitted).
//
// Reference: Gere & Goodno, "Mechanics of Materials", Example 2.2

#[test]
fn validation_stepped_bar_different_areas() {
    let l1 = 3.0;
    let l2 = 4.0;
    let a1 = 0.02; // 200 cm^2
    let a2 = 0.01; // 100 cm^2
    let f = 80.0;  // kN applied force

    // Build manually: two segments, two sections
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, l1, 0.0), (3, l1 + l2, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, a1, IZ), (2, a2, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // section 1 (A1)
            (2, "frame", 2, 3, 1, 2, false, false), // section 2 (A2)
        ],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: f, fz: 0.0, my: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Displacement at intermediate node 2: delta_1 = F*L1/(E*A1)
    let delta1_expected = f * l1 / (E_EFF * a1);
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_close(d2.ux, delta1_expected, 0.02, "stepped bar: ux at node 2 = F*L1/(EA1)");

    // Displacement at free end node 3: delta_total = F*L1/(E*A1) + F*L2/(E*A2)
    let delta_total = f * l1 / (E_EFF * a1) + f * l2 / (E_EFF * a2);
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert_close(d3.ux, delta_total, 0.02, "stepped bar: ux at node 3 = total elongation");

    // Both segments carry the same axial force F
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert_close(ef1.n_start.abs(), f, 0.02, "stepped bar: N in segment 1 = F");
    assert_close(ef2.n_start.abs(), f, 0.02, "stepped bar: N in segment 2 = F");

    // No shear or moment since load is purely axial
    assert!(ef1.v_start.abs() < 1e-4, "stepped bar seg1: V should be zero");
    assert!(ef2.v_start.abs() < 1e-4, "stepped bar seg2: V should be zero");
}

// ================================================================
// 2. Axial Deformation Inversely Proportional to Area
// ================================================================
//
// Two separate cantilever bars of same length and load but different areas.
// delta = F*L/(E*A), so delta_1/delta_2 = A2/A1.
//
// Reference: Gere & Goodno, Ch. 2.2 — axial stiffness k = EA/L

#[test]
fn validation_axial_inversely_proportional_to_area() {
    let l = 5.0;
    let f = 60.0;
    let a1 = 0.005;
    let a2 = 0.020; // 4x the area

    let input1 = make_beam(1, l, E, a1, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f, fz: 0.0, my: 0.0,
        })]);
    let input2 = make_beam(1, l, E, a2, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f, fz: 0.0, my: 0.0,
        })]);

    let res1 = linear::solve_2d(&input1).unwrap();
    let res2 = linear::solve_2d(&input2).unwrap();

    let ux1 = res1.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux2 = res2.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // ux1/ux2 should equal a2/a1 = 4.0
    let ratio: f64 = ux1 / ux2;
    assert_close(ratio, a2 / a1, 0.02, "axial deformation inversely proportional to A");

    // Also verify absolute values
    let ux1_expected = f * l / (E_EFF * a1);
    let ux2_expected = f * l / (E_EFF * a2);
    assert_close(ux1, ux1_expected, 0.02, "ux1 = F*L/(E*A1)");
    assert_close(ux2, ux2_expected, 0.02, "ux2 = F*L/(E*A2)");
}

// ================================================================
// 3. Three-Member Determinate Truss Force Resolution
// ================================================================
//
// Simple statically determinate truss:
//   Node 1 (0,0) pinned, Node 2 (4,0) rollerX, Node 3 (2,3) free.
//   Members: 1-2 (horizontal bottom chord), 1-3 (left diagonal), 2-3 (right diagonal).
//   Vertical load P at node 3.
//
// By method of joints at node 3:
//   Member 1-3: length = sqrt(4+9)=sqrt(13), cos = 2/sqrt(13), sin = 3/sqrt(13)
//   Member 2-3: length = sqrt(4+9)=sqrt(13), cos = 2/sqrt(13), sin = 3/sqrt(13)
//   (symmetric about vertical through node 3)
//
// Vertical equilibrium at node 3:
//   N_13 * sin(theta) + N_23 * sin(theta) = P
//   By symmetry N_13 = N_23 = P/(2*sin(theta))
//
// Reference: Kassimali, "Structural Analysis", Ch. 3 method of joints

#[test]
fn validation_three_member_truss_forces() {
    let p: f64 = 60.0;
    let sqrt13: f64 = 13.0_f64.sqrt();
    let sin_theta: f64 = 3.0 / sqrt13;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 2.0, 3.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, 0.0)], // Iz=0 not needed, but truss won't use it
        vec![
            (1, "truss", 1, 2, 1, 1, false, false), // bottom chord
            (2, "truss", 1, 3, 1, 1, false, false), // left diagonal
            (3, "truss", 2, 3, 1, 1, false, false), // right diagonal
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: -p, my: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium: sum Ry = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.02, "3-member truss: sum Ry = P");

    // By symmetry, each support reaction = P/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.rz, p / 2.0, 0.02, "3-member truss: Ry1 = P/2");
    assert_close(r2.rz, p / 2.0, 0.02, "3-member truss: Ry2 = P/2");

    // Diagonal members carry N = P/(2*sin(theta)) in compression
    let n_diag_expected = p / (2.0 * sin_theta);
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert_close(ef2.n_start.abs(), n_diag_expected, 0.05,
        "3-member truss: |N_left_diag| = P/(2*sin(theta))");
    assert_close(ef3.n_start.abs(), n_diag_expected, 0.05,
        "3-member truss: |N_right_diag| = P/(2*sin(theta))");

    // Symmetric diagonals should carry equal magnitude
    assert_close(ef2.n_start.abs(), ef3.n_start.abs(), 0.02,
        "3-member truss: symmetric diagonal forces");

    // Bottom chord: horizontal equilibrium at node 1 requires
    // N_12 = N_13 * cos(theta) = (P/(2*sin(theta))) * (2/sqrt(13))
    // This ensures horizontal equilibrium at the pinned support
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!(ef1.n_start.abs() > 0.1, "3-member truss: bottom chord has axial force");

    // All truss members: V and M should be zero
    for ef in &results.element_forces {
        assert!(ef.v_start.abs() < 1e-3,
            "truss elem {}: V should be zero, got {:.6}", ef.element_id, ef.v_start);
        assert!(ef.m_start.abs() < 1e-3,
            "truss elem {}: M should be zero, got {:.6}", ef.element_id, ef.m_start);
    }
}

// ================================================================
// 4. Parallel Bars Sharing Load by Stiffness Ratio
// ================================================================
//
// Two bars in parallel between the same two nodes.
// Both have same E and L but different areas A1 and A2.
// The load distributes in proportion to axial stiffness:
//   N1 = F * (A1/(A1+A2)), N2 = F * (A2/(A1+A2))
//
// Model: 3 nodes: (0,0), (L,0), (L,0.001) with the third node
// nearly coincident to node 2. We use a frame approach instead.
//
// Alternative: cantilever bar, compare axial stiffness k = EA/L.
// Two separate bars with A1 and A2 give k1 and k2.
// Deflection of combined system: delta = F/(k1+k2) = F*L/(E*(A1+A2))
//
// Reference: Przemieniecki, "Theory of Matrix Structural Analysis", Sec. 2.3

#[test]
fn validation_parallel_bars_stiffness_ratio() {
    let l = 6.0;
    let a1 = 0.005;
    let a2 = 0.015;
    let a_combined = a1 + a2; // equivalent total area
    let f = 100.0;

    // Separate bar with A1 only
    let input1 = make_beam(1, l, E, a1, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f, fz: 0.0, my: 0.0,
        })]);
    let res1 = linear::solve_2d(&input1).unwrap();
    let ux_a1 = res1.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Separate bar with A2 only
    let input2 = make_beam(1, l, E, a2, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f, fz: 0.0, my: 0.0,
        })]);
    let res2 = linear::solve_2d(&input2).unwrap();
    let ux_a2 = res2.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Separate bar with combined area A1+A2 (equivalent parallel system)
    let input_combined = make_beam(1, l, E, a_combined, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f, fz: 0.0, my: 0.0,
        })]);
    let res_combined = linear::solve_2d(&input_combined).unwrap();
    let ux_combined = res_combined.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Combined stiffness: 1/delta_combined = 1/delta_1 + 1/delta_2
    // (springs in parallel), which gives delta_combined = F*L/(E*(A1+A2))
    let delta_expected = f * l / (E_EFF * a_combined);
    assert_close(ux_combined, delta_expected, 0.02,
        "parallel bars: combined delta = F*L/(E*(A1+A2))");

    // Verify stiffness relationship: k_combined = k1 + k2
    let k1 = f / ux_a1;
    let k2 = f / ux_a2;
    let k_combined = f / ux_combined;
    assert_close(k_combined, k1 + k2, 0.02,
        "parallel bars: k_combined = k1 + k2");

    // Also verify individual bars against formula
    assert_close(ux_a1, f * l / (E_EFF * a1), 0.02, "bar A1: delta = FL/(EA1)");
    assert_close(ux_a2, f * l / (E_EFF * a2), 0.02, "bar A2: delta = FL/(EA2)");
}

// ================================================================
// 5. Multi-Segment Bar with Intermediate Nodal Loads
// ================================================================
//
// Fixed-free bar (3 equal segments) with loads applied at intermediate nodes.
// Node 1: fixed
// Node 2: Fx = P1 = 40 kN
// Node 3: Fx = P2 = 60 kN
// Node 4: free (no load)
//
// Axial force distribution (from free end toward support):
//   Segment 3 (node 3-4): N = 0 (no load beyond node 4)
//   Segment 2 (node 2-3): N = P2 = 60 (carries load from node 3)
//   Segment 1 (node 1-2): N = P1 + P2 = 100 (carries both loads)
//
// Reference: Gere & Goodno, "Mechanics of Materials", Example 2.3

#[test]
fn validation_multi_segment_intermediate_loads() {
    let seg_len = 2.0;
    let p1 = 40.0;
    let p2 = 60.0;

    let input = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, seg_len, 0.0),
            (3, 2.0 * seg_len, 0.0),
            (4, 3.0 * seg_len, 0.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: p1, fz: 0.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: p2, fz: 0.0, my: 0.0 }),
        ],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Segment 3 (node 3-4): no load beyond → N = 0
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert!(ef3.n_start.abs() < 0.5,
        "multi-seg: segment 3 should have ~zero axial, got {:.4}", ef3.n_start);

    // Segment 2 (node 2-3): carries P2 = 60
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert_close(ef2.n_start.abs(), p2, 0.05,
        "multi-seg: segment 2 carries P2");

    // Segment 1 (node 1-2): carries P1 + P2 = 100
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef1.n_start.abs(), p1 + p2, 0.05,
        "multi-seg: segment 1 carries P1+P2");

    // Reaction at fixed support = -(P1 + P2)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rx.abs(), p1 + p2, 0.02,
        "multi-seg: reaction Rx = P1+P2");

    // Total displacement at free end: sum of segment elongations
    // delta = (P1+P2)*L/(EA) + P2*L/(EA) + 0
    let delta_expected = (p1 + p2) * seg_len / (E_EFF * A)
                       + p2 * seg_len / (E_EFF * A);
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    assert_close(d4.ux, delta_expected, 0.02,
        "multi-seg: total displacement at free end");
}

// ================================================================
// 6. Symmetric Howe Truss with Symmetric Loading
// ================================================================
//
// A Howe-type truss with 4 panels and symmetric vertical load.
// Nodes form a simple triangulated structure:
//   Bottom chord: (0,0)-(3,0)-(6,0)-(9,0)-(12,0)
//   Top chord:    (3,3)-(6,3)-(9,3)
// With symmetric P at top center node (6,3).
//
// By symmetry:
//   - Reactions at supports are each P/2
//   - Axial forces in members symmetric about the center line
//
// Reference: Hibbeler, "Structural Analysis", Ch. 3 (truss symmetry)

#[test]
fn validation_symmetric_howe_truss() {
    let p = 80.0;

    let input = make_input(
        vec![
            // Bottom chord nodes
            (1, 0.0, 0.0), (2, 3.0, 0.0), (3, 6.0, 0.0), (4, 9.0, 0.0), (5, 12.0, 0.0),
            // Top chord nodes
            (6, 3.0, 3.0), (7, 6.0, 3.0), (8, 9.0, 3.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, 0.0)],
        vec![
            // Bottom chord
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 2, 3, 1, 1, false, false),
            (3, "truss", 3, 4, 1, 1, false, false),
            (4, "truss", 4, 5, 1, 1, false, false),
            // Top chord
            (5, "truss", 6, 7, 1, 1, false, false),
            (6, "truss", 7, 8, 1, 1, false, false),
            // Verticals
            (7, "truss", 2, 6, 1, 1, false, false),
            (8, "truss", 3, 7, 1, 1, false, false),
            (9, "truss", 4, 8, 1, 1, false, false),
            // Diagonals
            (10, "truss", 1, 6, 1, 1, false, false),
            (11, "truss", 6, 3, 1, 1, false, false),
            (12, "truss", 3, 8, 1, 1, false, false),
            (13, "truss", 8, 5, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 5, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 7, fx: 0.0, fz: -p, my: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Symmetric reactions: each = P/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert_close(r1.rz, p / 2.0, 0.02, "Howe truss: Ry1 = P/2");
    assert_close(r5.rz, p / 2.0, 0.02, "Howe truss: Ry5 = P/2");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.02, "Howe truss: sum Ry = P");
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < 0.5, "Howe truss: sum Rx ~= 0, got {:.4}", sum_rx);

    // Symmetry: left-right mirrored members should have same magnitude axial force
    // Bottom chord elem 1 (0-3) mirrors elem 4 (9-12)
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    assert_close(ef1.n_start.abs(), ef4.n_start.abs(), 0.02,
        "Howe truss: symmetric bottom chord forces (elem 1 vs 4)");

    // Bottom chord elem 2 mirrors elem 3
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert_close(ef2.n_start.abs(), ef3.n_start.abs(), 0.02,
        "Howe truss: symmetric bottom chord forces (elem 2 vs 3)");

    // Top chord elem 5 mirrors elem 6
    let ef5 = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();
    let ef6 = results.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    assert_close(ef5.n_start.abs(), ef6.n_start.abs(), 0.02,
        "Howe truss: symmetric top chord forces (elem 5 vs 6)");

    // All truss members should have zero shear and moment
    for ef in &results.element_forces {
        assert!(ef.v_start.abs() < 1e-3,
            "Howe truss elem {}: V should be zero", ef.element_id);
        assert!(ef.m_start.abs() < 1e-3,
            "Howe truss elem {}: M should be zero", ef.element_id);
    }
}

// ================================================================
// 7. Five-Bar Truss with Zero-Force Member
// ================================================================
//
// Truss with nodes:
//   Node 1 (0,0) pinned, Node 2 (4,0) rollerX, Node 3 (2,3) free, Node 4 (2,0) free.
//   Members: 1-4 (horizontal), 4-2 (horizontal), 1-3 (diagonal), 3-2 (diagonal), 3-4 (vertical).
//
// Load P applied vertically downward at node 3.
//
// At node 4: three members meet (1-4, 4-2, 3-4). Members 1-4 and 4-2 are
// collinear (horizontal). Since no external load acts at node 4, vertical
// equilibrium requires the vertical member 3-4 to carry only the component
// needed. But here member 3-4 is vertical and the two horizontal members
// cannot provide vertical force, so member 3-4 force = 0 at node 4.
// However, node 3 is loaded, so 3-4 does carry force from node 3's equilibrium.
//
// By symmetry about the vertical axis (node 3 is at midspan):
//   Reactions: Ry1 = Ry2 = P/2
//   Member forces: N(1-3) magnitude = N(3-2) magnitude
//
// Reference: Hibbeler, "Structural Analysis", Sec. 3.3 (zero-force members)

#[test]
fn validation_five_bar_truss_zero_force_member() {
    let p = 50.0;

    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 4.0, 0.0), (3, 2.0, 3.0), (4, 2.0, 0.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, 0.0)],
        vec![
            (1, "truss", 1, 4, 1, 1, false, false), // bottom left
            (2, "truss", 4, 2, 1, 1, false, false), // bottom right
            (3, "truss", 1, 3, 1, 1, false, false), // left diagonal
            (4, "truss", 3, 2, 1, 1, false, false), // right diagonal
            (5, "truss", 4, 3, 1, 1, false, false), // vertical
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: -p, my: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Global vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.02, "5-bar truss: sum Ry = P");

    // By symmetry: each support reaction = P/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.rz, p / 2.0, 0.05, "5-bar truss: Ry1 = P/2");
    assert_close(r2.rz, p / 2.0, 0.05, "5-bar truss: Ry2 = P/2");

    // Symmetric diagonal members carry equal magnitude
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    let ef4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    assert_close(ef3.n_start.abs(), ef4.n_start.abs(), 0.05,
        "5-bar truss: symmetric diagonal forces");

    // Symmetric bottom chord members carry equal magnitude
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert_close(ef1.n_start.abs(), ef2.n_start.abs(), 0.05,
        "5-bar truss: symmetric bottom chord forces");

    // Method of joints at node 3:
    // Diagonals: member 1-3 has length sqrt(4+9)=sqrt(13), sin=3/sqrt(13), cos=2/sqrt(13)
    // Vertical equilibrium at node 3: N_13*sin + N_32*sin + N_43 = P
    // Horizontal equilibrium at node 3: -N_13*cos + N_32*cos = 0 → N_13 = N_32 (by symmetry)
    // So: 2*N_diag*sin + N_vert = P
    let sqrt13: f64 = 13.0_f64.sqrt();
    let sin_theta: f64 = 3.0 / sqrt13;

    // Vertical member (elem 5): at node 4, only member 5 has vertical component
    // (members 1 and 2 are horizontal). No external load at node 4.
    // So the vertical member force must be zero.
    let ef5 = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();
    assert!(ef5.n_start.abs() < 0.5,
        "5-bar truss: vertical member is zero-force, got {:.4}", ef5.n_start);

    // With N_vert = 0: N_diag = P/(2*sin_theta)
    let n_diag_expected = p / (2.0 * sin_theta);
    assert_close(ef3.n_start.abs(), n_diag_expected, 0.05,
        "5-bar truss: diagonal force = P/(2*sin)");

    // All truss members: zero shear and moment
    for ef in &results.element_forces {
        assert!(ef.v_start.abs() < 1e-3,
            "5-bar truss elem {}: V={:.6} should be zero", ef.element_id, ef.v_start);
        assert!(ef.m_start.abs() < 1e-3,
            "5-bar truss elem {}: M={:.6} should be zero", ef.element_id, ef.m_start);
    }
}

// ================================================================
// 8. Axial Force Superposition Under Multiple Nodal Loads
// ================================================================
//
// Cantilever bar with two separate nodal loads at the tip.
// By superposition, the total response equals the sum of individual responses.
//
// Load case A: Fx = P1 at tip
// Load case B: Fx = P2 at tip
// Combined:    Fx = P1 + P2 at tip
//
// delta_combined = delta_A + delta_B
// N_combined = N_A + N_B
//
// Reference: Timoshenko, "Strength of Materials", Part I, Ch. 1
//            (principle of superposition for linear elastic systems)

#[test]
fn validation_axial_superposition_multiple_loads() {
    let l = 5.0;
    let n = 4;
    let p1 = 40.0;
    let p2 = 70.0;
    let tip = n + 1;

    // Load case A: P1 only
    let input_a = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip, fx: p1, fz: 0.0, my: 0.0,
        })]);
    let res_a = linear::solve_2d(&input_a).unwrap();
    let ux_a = res_a.displacements.iter().find(|d| d.node_id == tip).unwrap().ux;
    let n_a = res_a.element_forces.iter().find(|e| e.element_id == 1).unwrap().n_start;

    // Load case B: P2 only
    let input_b = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip, fx: p2, fz: 0.0, my: 0.0,
        })]);
    let res_b = linear::solve_2d(&input_b).unwrap();
    let ux_b = res_b.displacements.iter().find(|d| d.node_id == tip).unwrap().ux;
    let n_b = res_b.element_forces.iter().find(|e| e.element_id == 1).unwrap().n_start;

    // Combined: P1 + P2 at once
    let input_c = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip, fx: p1 + p2, fz: 0.0, my: 0.0,
        })]);
    let res_c = linear::solve_2d(&input_c).unwrap();
    let ux_c = res_c.displacements.iter().find(|d| d.node_id == tip).unwrap().ux;
    let n_c = res_c.element_forces.iter().find(|e| e.element_id == 1).unwrap().n_start;

    // Superposition: displacement
    assert_close(ux_c, ux_a + ux_b, 0.01,
        "superposition: ux_combined = ux_A + ux_B");

    // Superposition: axial force
    assert_close(n_c, n_a + n_b, 0.01,
        "superposition: N_combined = N_A + N_B");

    // Verify absolute values
    let ux_expected = (p1 + p2) * l / (E_EFF * A);
    assert_close(ux_c, ux_expected, 0.02,
        "superposition: ux = (P1+P2)*L/(EA)");

    // Axial force = P1 + P2 in each element
    for ef in &res_c.element_forces {
        assert_close(ef.n_start.abs(), p1 + p2, 0.02,
            &format!("superposition: |N| = P1+P2 in elem {}", ef.element_id));
    }

    // Also verify: reaction = -(P1 + P2)
    let r1 = res_c.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rx.abs(), p1 + p2, 0.02,
        "superposition: |Rx| = P1+P2");

    // Cross-check: two separate loads applied simultaneously via multiple load entries
    let input_d = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: tip, fx: p1, fz: 0.0, my: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: tip, fx: p2, fz: 0.0, my: 0.0,
            }),
        ]);
    let res_d = linear::solve_2d(&input_d).unwrap();
    let ux_d = res_d.displacements.iter().find(|d| d.node_id == tip).unwrap().ux;
    assert_close(ux_d, ux_c, 0.01,
        "superposition: two separate load entries = single combined load");
}
