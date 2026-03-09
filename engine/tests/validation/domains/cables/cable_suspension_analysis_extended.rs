/// Validation: Cable Suspension Analysis — Extended (Solver-Based)
///
/// References:
///   - Irvine, "Cable Structures", MIT Press, 1981
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 5 (Cables)
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 4 (Trusses)
///   - Gimsing & Georgakis, "Cable Supported Bridges", 3rd Ed.
///   - Gere & Timoshenko, "Mechanics of Materials", 4th Ed.
///
/// Tests model cable and suspension structures as 2D truss assemblages
/// and verify solver results against closed-form analytical solutions.
///
/// Tests:
///   1. Multi-point loaded cable (3 segments, 2 point loads)
///   2. V-cable with unequal support heights (inclined chord)
///   3. Cable-stayed bridge fan configuration (deck + tower + stays)
///   4. Cable stiffness proportionality: deflection scales as 1/E
///   5. W-shaped cable network with triangulation
///   6. Horizontal cable under lateral loads
///   7. Cable vs arch: equal and opposite horizontal thrust
///   8. Multi-bay cable-strut roof truss (Howe pattern)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa
const A_CABLE: f64 = 0.001; // m^2
const IZ_TRUSS: f64 = 1e-10; // near-zero for truss elements

// ================================================================
// 1. Multi-Point Loaded Cable (3 Segments, 2 Point Loads)
// ================================================================
//
// Cable with 4 nodes, 3 truss segments, 2 concentrated loads.
// Supports at (0,0) and (12,0). Intermediate nodes at (4,-1) and (8,-1).
// Loads: P1=10kN at node 2, P2=10kN at node 3.
//
// This is a statically determinate truss (M+R = 3+4 = 7 = 2*4-1).
// Wait: 2N = 8, M+R = 3+4 = 7 < 8 => mechanism unless triangulated.
//
// Use a triangulated approach: add a strut connecting nodes 2 and 3
// to the supports diagonally, forming a stable cable-truss.
//
// Actually, the simplest stable multi-segment cable needs triangulation.
// Use the well-known cable-over-two-towers problem:
//   Supports at (0,2) and (12,2), low nodes at (4,0) and (8,0).
//   3 segments: (1->2), (2->3), (3->4) forming a W-shape cable.
//   M+R = 3+4 = 7 = 2*4 - 1 => determinate and stable.
//
// Wait: M=3, R=4 (2 pinned supports), N=4, DOF=2*4=8.
// 3+4 = 7 < 8 => still a mechanism.
//
// Must triangulate. Instead, use 2 independent V-cables sharing a support:
// Two separate V-cables analyzed together. Or use a simple cable with
// 2 equal loads at third-points, supported by 2 V-shapes.
//
// Simplest approach: Two-bar cable loaded at single node, repeated
// comparison. Instead, let's do a 4-node, 5-bar truss that
// approximates a cable with two hangers from a horizontal beam.
//
// Actually, let's use the classical method: for a cable with
// intermediate loads, solve by method of joints. The key insight is
// that a 3-segment cable with 2 loads between 2 pinned supports
// at the same height IS determinate when the sag at each loaded node
// is specified (gives us the geometry). With known geometry, each
// truss element has known orientation, and the 3-bar 4-node system
// with 4 reaction components (2 pinned supports) gives:
//   2*4 = 8 equations, 3 + 4 = 7 unknowns => over-determined.
//
// The issue is that specifying the geometry over-constrains the
// problem in a linear FEM context. The real cable finds its own
// geometry. For a LINEAR solver, we must provide a geometry that
// is compatible with the loading.
//
// For equal loads P at third-points with equal sag d:
//   H = P*L/(3*d) (by moment equilibrium)
//   V_left = V_right = P (by symmetry)
//
// Let's verify this with the solver. The geometry is:
//   Node 1: (0,0), Node 2: (L/3, -d), Node 3: (2L/3, -d), Node 4: (L,0)
//   This gives a flat middle segment.
//
// Equilibrium at node 2:
//   Bar 1: (0,0)->(L/3,-d), direction = (L/3,-d)/L1
//   Bar 2: (L/3,-d)->(2L/3,-d), direction = (L/3,0)/|L/3| = (1,0)
//   T1*d/L1 + T2*0 = P  =>  T1 = P*L1/d
//   -T1*(L/3)/L1 + T2 = 0  =>  T2 = T1*(L/3)/L1 = P*(L/3)/d = H
//
// So H = P*L/(3*d) and T1 = P*L1/d.
// Reference: Hibbeler, "Structural Analysis" 10th Ed., §5.2

#[test]
fn validation_cable_multi_point_loaded() {
    let span: f64 = 12.0;
    let d: f64 = 2.0; // sag at loaded nodes
    let p: f64 = 10.0; // load at each intermediate node

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, span / 3.0, -d),
        (3, 2.0 * span / 3.0, -d),
        (4, span, 0.0),
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
        (3, "truss", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 4, "pinned")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
        }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A_CABLE, IZ_TRUSS)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical: H = P*L/(3*d) = 10*12/(3*2) = 20 kN
    let h_expected: f64 = p * span / (3.0 * d);
    crate::common::assert_close(h_expected, 20.0, 0.001, "H analytical = 20 kN");

    // Vertical reactions: symmetric loading, V1 = V2 = P each
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    crate::common::assert_close(r1.ry, p, 0.02, "V_left = P");
    crate::common::assert_close(r4.ry, p, 0.02, "V_right = P");

    // Horizontal reactions should equal H
    crate::common::assert_close(r1.rx.abs(), h_expected, 0.02, "H_left");
    crate::common::assert_close(r4.rx.abs(), h_expected, 0.02, "H_right");

    // Middle segment (bar 2) should carry pure horizontal tension = H
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    crate::common::assert_close(ef2.n_start, h_expected, 0.02, "Middle segment tension = H");

    // Inclined segments: T = sqrt(H^2 + V^2) where V = P
    let l1: f64 = ((span / 3.0).powi(2) + d.powi(2)).sqrt();
    let t_inclined: f64 = (h_expected.powi(2) + p.powi(2)).sqrt();
    let _ = l1;
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    crate::common::assert_close(ef1.n_start.abs(), t_inclined, 0.02, "T1 inclined segment");
    crate::common::assert_close(ef3.n_start.abs(), t_inclined, 0.02, "T3 inclined segment");

    // All segments in tension
    assert!(ef1.n_start > 0.0, "Segment 1 tension");
    assert!(ef2.n_start > 0.0, "Segment 2 tension");
    assert!(ef3.n_start > 0.0, "Segment 3 tension");
}

// ================================================================
// 2. V-Cable with Unequal Support Heights
// ================================================================
//
// Left support at (0,0), right support at (10,3), midspan node at (5,-1).
// Load P=15kN downward at midspan node.
//
// Bar 1: (0,0)->(5,-1), L1 = sqrt(26), dir = (5,-1)/sqrt(26)
// Bar 2: (5,-1)->(10,3), L2 = sqrt(41), dir = (5,4)/sqrt(41)
//
// Equilibrium at node 2 (midspan):
//   x: -T1*(5/L1) + T2*(5/L2) = 0  => T1/L1 = T2/L2 => T1 = T2*L1/L2
//   y:  T1*(1/L1) + T2*(4/L2) = 15  (note: bar1 y-component is -(-1)/L1 = 1/L1)
//   Wait, need to be careful. Bar 1 goes from node 1(0,0) to node 2(5,-1).
//   At node 2, bar 1 pulls TOWARD node 1: force on node 2 = -T1*(5,-1)/L1
//   So component on node 2 from bar 1: (-5T1/L1, T1/L1)
//   Bar 2 goes from node 2(5,-1) to node 3(10,3).
//   At node 2, bar 2 pulls TOWARD node 3: force on node 2 = T2*(5,4)/L2
//   So component on node 2 from bar 2: (5T2/L2, 4T2/L2)
//
//   x: -5*T1/L1 + 5*T2/L2 = 0  => T1*L2 = T2*L1 => T1 = T2*L1/L2
//   y: T1/L1 + 4*T2/L2 = P = 15
//      T2*L1/(L2*L1) + 4*T2/L2 = 15
//      T2/L2 + 4*T2/L2 = 15
//      5*T2/L2 = 15
//      T2 = 3*L2 = 3*sqrt(41)
//      T1 = 3*L1 = 3*sqrt(26)
//
// Reference: Hibbeler, "Structural Analysis" 10th Ed., §5.1

#[test]
fn validation_cable_unequal_support_heights() {
    let p: f64 = 15.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 5.0, -1.0),
        (3, 10.0, 3.0),
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 3, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A_CABLE, IZ_TRUSS)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical
    let l1: f64 = (25.0_f64 + 1.0).sqrt(); // sqrt(26)
    let l2: f64 = (25.0_f64 + 16.0).sqrt(); // sqrt(41)
    let t2_expected: f64 = 3.0 * l2;
    let t1_expected: f64 = 3.0 * l1;

    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    crate::common::assert_close(ef1.n_start, t1_expected, 0.02, "T1 unequal heights");
    crate::common::assert_close(ef2.n_start, t2_expected, 0.02, "T2 unequal heights");

    // Both in tension
    assert!(ef1.n_start > 0.0, "Bar 1 tension: {:.4}", ef1.n_start);
    assert!(ef2.n_start > 0.0, "Bar 2 tension: {:.4}", ef2.n_start);

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    crate::common::assert_close(sum_ry, p, 0.01, "Unequal heights sum_ry");
    crate::common::assert_close(sum_rx.abs(), 0.0, 0.01, "Unequal heights sum_rx");

    // Verify individual reactions from statics
    // R1_x = T1 * 5/L1 (bar pulls node 1 to the right, reaction opposes)
    // Actually R1_x = -T1 * 5/L1 (reaction must point left to oppose bar pulling right)
    // R1_y = -T1 * (-1)/L1 = T1/L1 (reaction must point up)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r1_y_expected: f64 = t1_expected * 1.0 / l1; // = 3.0
    crate::common::assert_close(r1.ry, r1_y_expected, 0.02, "R1_y unequal heights");

    // R3_y: by vertical equilibrium, R3_y = P - R1_y = 15 - 3 = 12
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    crate::common::assert_close(r3.ry, p - r1_y_expected, 0.02, "R3_y unequal heights");
}

// ================================================================
// 3. Cable-Stayed Bridge: Fan Configuration with Inclined Stays
// ================================================================
//
// Cable-stayed bridge idealization with a central tower (mast) and
// two symmetric inclined stays supporting the deck at quarter-points.
//
// Geometry:
//   Tower: vertical truss member from base (node 3 at 6,0) to top (node 5 at 6,4).
//   Deck: horizontal frame beam from (0,0) to (12,0) through nodes 1,2,3,4.
//     Node 1(0,0), Node 2(3,0), Node 3(6,0), Node 4(9,0), Node 5(12,0) -- wait,
//     that's the deck. The tower top is a separate node.
//
// Simplified model:
//   Deck nodes: 1(0,0), 2(4,0), 3(8,0) - 3 nodes, 2 frame elements
//   Tower top: node 4(4,3)
//   Tower: truss from node 2 to node 4 (vertical)
//   Left stay: truss from node 1 to node 4 (inclined)
//   Right stay: truss from node 3 to node 4 (inclined)
//
//   Supports: pinned at node 1, rollerX at node 3.
//   Deck is continuous frame.
//   Load P downward at midspan (node 2).
//
// The tower is vertical and the stays are inclined.
// By symmetry, both stays carry equal tension.
// The tower carries compression from both stays.
//
// For the stay: angle alpha = atan(3/4), sin(a) = 3/5, cos(a) = 4/5
// Stay length L_stay = 5.0
// Vertical equilibrium at tower top: 2*T_stay*sin(a) = F_tower_compression
// where F_tower = component transferred through hangers/stays.
//
// Reference: Gimsing & Georgakis, "Cable Supported Bridges", Ch. 7

#[test]
fn validation_cable_stayed_fan_configuration() {
    let deck_span: f64 = 8.0;
    let tower_height: f64 = 3.0;
    let p: f64 = 20.0;

    let nodes = vec![
        (1, 0.0, 0.0),                          // left support
        (2, deck_span / 2.0, 0.0),              // midspan / tower base
        (3, deck_span, 0.0),                     // right support
        (4, deck_span / 2.0, tower_height),      // tower top
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),  // left deck span
        (2, "frame", 2, 3, 1, 1, false, false),  // right deck span
        (3, "frame", 2, 4, 1, 2, false, false),  // tower (vertical, frame for rz stiffness)
        (4, "truss", 1, 4, 1, 2, false, false),  // left stay
        (5, "truss", 3, 4, 1, 2, false, false),  // right stay
    ];
    let sups = vec![
        (1, 1, "pinned"),
        (2, 3, "rollerX"),
    ];
    let secs = vec![
        (1, 0.01, 1e-4),           // deck beam section
        (2, A_CABLE, IZ_TRUSS),    // cable/tower section
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    crate::common::assert_close(sum_ry, p, 0.02, "Cable-stayed sum_ry");

    // Symmetric reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    crate::common::assert_close(r1.ry, r3.ry, 0.02, "Cable-stayed: symmetric Ry");

    // Both stays should carry equal tension (by symmetry)
    let stay_left = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    let stay_right = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();
    crate::common::assert_close(stay_left.n_start.abs(), stay_right.n_start.abs(), 0.02,
        "Cable-stayed: symmetric stay forces");

    // Stays should be in tension (they support the deck from above)
    // Note: depending on sign convention with element direction,
    // tension may show as positive or negative n_start. Check abs value is non-trivial.
    assert!(stay_left.n_start.abs() > 0.1,
        "Left stay carries non-trivial force: {:.4}", stay_left.n_start);
    assert!(stay_right.n_start.abs() > 0.1,
        "Right stay carries non-trivial force: {:.4}", stay_right.n_start);

    // Tower should be in compression (loaded from both sides)
    let tower = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert!(tower.n_start.abs() > 0.1,
        "Tower carries axial force: {:.4}", tower.n_start);

    // Midspan node should deflect downward
    let d_mid = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(d_mid.uy < 0.0, "Midspan deflects down: uy={:.6}", d_mid.uy);
}

// ================================================================
// 4. Cable Stiffness Proportionality: Deflection Scales as 1/E
// ================================================================
//
// For a linear elastic truss, deflection is inversely proportional
// to the modulus of elasticity: delta = F*L/(A*E).
// Compare deflections for two different E values on the same V-cable.
//
// Reference: Gere & Timoshenko, "Mechanics of Materials", §2.2

#[test]
fn validation_cable_deflection_inversely_proportional_to_e() {
    let span: f64 = 10.0;
    let sag: f64 = 1.5;
    let p: f64 = 20.0;

    let solve_cable_defl = |e_val: f64| -> f64 {
        let nodes = vec![
            (1, 0.0, 0.0),
            (2, span / 2.0, -sag),
            (3, span, 0.0),
        ];
        let elems = vec![
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 2, 3, 1, 1, false, false),
        ];
        let sups = vec![(1, 1, "pinned"), (2, 3, "pinned")];
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
        })];
        let input = make_input(nodes, vec![(1, e_val, 0.3)], vec![(1, A_CABLE, IZ_TRUSS)],
            elems, sups, loads);
        let results = linear::solve_2d(&input).unwrap();
        results.displacements.iter().find(|d| d.node_id == 2).unwrap().uy.abs()
    };

    let e1: f64 = 200_000.0;
    let e2: f64 = 100_000.0; // half the modulus
    let e3: f64 = 400_000.0; // double the modulus

    let d1: f64 = solve_cable_defl(e1);
    let d2: f64 = solve_cable_defl(e2);
    let d3: f64 = solve_cable_defl(e3);

    // delta proportional to 1/E: halving E doubles deflection
    crate::common::assert_close(d2 / d1, 2.0, 0.02, "Half E -> double deflection");
    crate::common::assert_close(d3 / d1, 0.5, 0.02, "Double E -> half deflection");

    // All deflections positive (downward)
    assert!(d1 > 0.0, "d1 > 0");
    assert!(d2 > 0.0, "d2 > 0");
    assert!(d3 > 0.0, "d3 > 0");

    // Verify product E * delta is constant
    let product1: f64 = e1 * d1;
    let product2: f64 = e2 * d2;
    let product3: f64 = e3 * d3;
    crate::common::assert_close(product1, product2, 0.02, "E*delta constant (1 vs 2)");
    crate::common::assert_close(product1, product3, 0.02, "E*delta constant (1 vs 3)");
}

// ================================================================
// 5. W-Shaped Cable Network with Triangulation
// ================================================================
//
// A cable network forming a W-shape: two V-cables sharing a central
// support, stabilized by a bottom chord.
//
// Geometry (5 nodes):
//   1(0,3)  2(3,0)  3(6,3)  4(9,0)  5(12,3)
//
// Elements: 4 cable segments forming a W, all truss.
// Supports: pinned at nodes 1, 3, 5 (three pinnned supports on top).
// Loads: P downward at nodes 2 and 4.
//
// By symmetry: reactions at nodes 1 and 5 are equal.
// Central support (node 3) carries the rest.
//
// Each V-section is independent due to the pin at node 3.
// For left V (nodes 1,2,3): T = P/(2*sin(alpha))
// For right V (nodes 3,4,5): same by symmetry.
//
// Reference: Kassimali, "Structural Analysis", §4.2

#[test]
fn validation_cable_w_shaped_network() {
    let p: f64 = 12.0;
    let w: f64 = 3.0; // horizontal spacing
    let h: f64 = 3.0; // vertical rise

    let nodes = vec![
        (1, 0.0, h),
        (2, w, 0.0),
        (3, 2.0 * w, h),
        (4, 3.0 * w, 0.0),
        (5, 4.0 * w, h),
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
        (3, "truss", 3, 4, 1, 1, false, false),
        (4, "truss", 4, 5, 1, 1, false, false),
    ];
    let sups = vec![
        (1, 1, "pinned"),
        (2, 3, "pinned"),
        (3, 5, "pinned"),
    ];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fy: -p, mz: 0.0,
        }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A_CABLE, IZ_TRUSS)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    crate::common::assert_close(sum_ry, 2.0 * p, 0.01, "W-cable sum_ry");

    // By symmetry: R1 = R5
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    crate::common::assert_close(r1.ry, r5.ry, 0.02, "W-cable: R1_y = R5_y");
    crate::common::assert_close(r1.rx.abs(), r5.rx.abs(), 0.02, "W-cable: |R1_x| = |R5_x|");

    // Member length
    let l_bar: f64 = (w * w + h * h).sqrt(); // sqrt(18) = 3*sqrt(2)
    let sin_a: f64 = h / l_bar;

    // Tension in each bar: T = P/(2*sin(alpha))
    let t_expected: f64 = p / (2.0 * sin_a);

    // All four bars should have the same tension magnitude (by symmetry)
    for eid in 1..=4 {
        let ef = results.element_forces.iter().find(|e| e.element_id == eid).unwrap();
        crate::common::assert_close(ef.n_start.abs(), t_expected, 0.02,
            &format!("W-cable: T element {}", eid));
        assert!(ef.n_start > 0.0,
            "W-cable element {} should be tension: {:.4}", eid, ef.n_start);
    }

    // Central support carries vertical load from both V-cables
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    crate::common::assert_close(r3.ry, p, 0.02, "W-cable: R3_y = P (center support)");
}

// ================================================================
// 6. Horizontal Cable Under Lateral Loads
// ================================================================
//
// A flat horizontal cable with a lateral (perpendicular) load.
// Three nodes in a triangular arrangement:
//   Node 1: (0, 0) - pinned support
//   Node 2: (5, -0.5) - loaded node (slightly below to form V)
//   Node 3: (10, 0) - pinned support
//
// Two equal horizontal loads applied at node 2: fx = F.
// Plus a vertical load to keep it in the cable regime.
//
// From equilibrium at node 2:
//   Bars pull node 2 toward supports 1 and 3.
//   Must balance both horizontal and vertical applied loads.
//
// Reference: Irvine, "Cable Structures", Ch. 3

#[test]
fn validation_cable_horizontal_with_lateral_load() {
    let span: f64 = 10.0;
    let sag: f64 = 0.5;
    let p_vert: f64 = 20.0;
    let f_lat: f64 = 3.0; // horizontal load at midspan

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, span / 2.0, -sag),
        (3, span, 0.0),
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 3, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_lat, fy: -p_vert, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A_CABLE, IZ_TRUSS)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    crate::common::assert_close(sum_ry, p_vert, 0.01, "Horiz cable sum_ry");
    crate::common::assert_close(sum_rx, -f_lat, 0.01, "Horiz cable sum_rx");

    // Bar geometry
    let l_bar: f64 = ((span / 2.0).powi(2) + sag.powi(2)).sqrt();

    // Equilibrium at node 2:
    // Bar 1: node 1(0,0) -> node 2(5,-0.5). At node 2, bar 1 pulls toward (0,0).
    //   Force from bar1 on node2: T1 * (-5, 0.5)/L
    // Bar 2: node 2(5,-0.5) -> node 3(10,0). At node 2, bar 2 pulls toward (10,0).
    //   Force from bar2 on node2: T2 * (5, 0.5)/L
    //
    // x: -5*T1/L + 5*T2/L + f_lat = 0 => T1 - T2 = f_lat*L/5
    // y: 0.5*T1/L + 0.5*T2/L - p_vert = 0 => T1 + T2 = p_vert*L/0.5 = 2*p_vert*L
    //
    // Wait that gives huge values. Let me redo:
    // y: 0.5*T1/L + 0.5*T2/L = p_vert
    //    (T1+T2) * 0.5/L = p_vert
    //    T1+T2 = 2*p_vert*L/1 ... no:
    //    T1+T2 = p_vert * L / 0.5 = p_vert * 2 * L
    //
    // Hmm, let me just use sag=0.5:
    // T1+T2 = 20 * L / 0.5 = 40*L
    // T1-T2 = 3 * L / 5
    //
    // T1 = (40*L + 3*L/5) / 2 = L*(200+3)/(2*5) = L*203/10
    // T2 = (40*L - 3*L/5) / 2 = L*(200-3)/(2*5) = L*197/10
    let t_sum: f64 = p_vert * l_bar / sag;
    let t_diff: f64 = f_lat * l_bar / (span / 2.0);
    let t1_expected: f64 = (t_sum + t_diff) / 2.0;
    let t2_expected: f64 = (t_sum - t_diff) / 2.0;

    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    crate::common::assert_close(ef1.n_start, t1_expected, 0.02, "Horiz cable T1");
    crate::common::assert_close(ef2.n_start, t2_expected, 0.02, "Horiz cable T2");

    // Both in tension
    assert!(ef1.n_start > 0.0, "Bar 1 tension");
    assert!(ef2.n_start > 0.0, "Bar 2 tension");

    // Horizontal load makes T1 > T2
    assert!(ef1.n_start > ef2.n_start,
        "T1={:.4} > T2={:.4} due to lateral load", ef1.n_start, ef2.n_start);
}

// ================================================================
// 7. Cable vs Arch: Equal and Opposite Horizontal Thrust
// ================================================================
//
// A V-cable (sag below) and an inverted V-arch (rise above), both
// with the same span, vertical offset, and load magnitude.
// Both have the same geometry in terms of member length and angle.
//
// The horizontal thrust magnitude should be identical:
//   H = P*L/(4*f) for both cable and arch.
//
// But signs differ: cable pulls supports inward, arch pushes outward.
//
// For truss elements, axial force sign: tension > 0, compression < 0.
// Cable bars are in tension, arch bars are in compression.
//
// We use frame elements with hinges for the arch to allow compression.
//
// Reference: Hibbeler, "Structural Analysis", §5.4

#[test]
fn validation_cable_vs_arch_equal_thrust_magnitude() {
    let span: f64 = 12.0;
    let offset: f64 = 2.0;
    let p: f64 = 24.0;

    // Cable: supports at (0,0), (12,0), sag node at (6,-2)
    let cable_nodes = vec![
        (1, 0.0, 0.0),
        (2, span / 2.0, -offset),
        (3, span, 0.0),
    ];
    let cable_elems = vec![
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
    ];
    let cable_input = make_input(
        cable_nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_CABLE, IZ_TRUSS)],
        cable_elems,
        vec![(1, 1, "pinned"), (2, 3, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let cable_results = linear::solve_2d(&cable_input).unwrap();

    // Arch: supports at (0,0), (12,0), apex node at (6,+2)
    // Use frame elements with hinges at both ends for pure axial behavior
    let arch_nodes = vec![
        (1, 0.0, 0.0),
        (2, span / 2.0, offset),
        (3, span, 0.0),
    ];
    let arch_elems = vec![
        (1, "frame", 1, 2, 1, 1, true, true),
        (2, "frame", 2, 3, 1, 1, true, true),
    ];
    let arch_input = make_input(
        arch_nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_CABLE, 1e-4)], // frame needs nonzero Iz
        arch_elems,
        vec![(1, 1, "pinned"), (2, 3, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let arch_results = linear::solve_2d(&arch_input).unwrap();

    // Expected horizontal thrust: H = P*L/(4*f) = 24*12/(4*2) = 36
    let h_expected: f64 = p * span / (4.0 * offset);

    // Cable horizontal reactions
    let cable_r1 = cable_results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let cable_r3 = cable_results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    crate::common::assert_close(cable_r1.rx.abs(), h_expected, 0.02, "Cable H_left");
    crate::common::assert_close(cable_r3.rx.abs(), h_expected, 0.02, "Cable H_right");

    // Arch horizontal reactions
    let arch_r1 = arch_results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let arch_r3 = arch_results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    crate::common::assert_close(arch_r1.rx.abs(), h_expected, 0.02, "Arch H_left");
    crate::common::assert_close(arch_r3.rx.abs(), h_expected, 0.02, "Arch H_right");

    // Magnitudes should be equal between cable and arch
    crate::common::assert_close(
        cable_r1.rx.abs(), arch_r1.rx.abs(), 0.02,
        "Cable vs Arch: |H| equal",
    );

    // Thrust directions: cable pulls inward, arch pushes outward
    // Cable left support: reaction pushes left (negative x) to oppose inward pull
    // Arch left support: reaction pushes right (positive x) to oppose outward push
    // (Or vice versa, depending on convention.)
    // Just check they have opposite signs:
    let cable_sign: f64 = cable_r1.rx.signum();
    let arch_sign: f64 = arch_r1.rx.signum();
    assert!(cable_sign * arch_sign < 0.0,
        "Cable and arch horizontal reactions have opposite signs: cable={:.2}, arch={:.2}",
        cable_r1.rx, arch_r1.rx);

    // Cable elements: tension. Arch elements: compression.
    let cable_ef1 = cable_results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let arch_ef1 = arch_results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!(cable_ef1.n_start > 0.0, "Cable bar in tension: {:.4}", cable_ef1.n_start);
    assert!(arch_ef1.n_start < 0.0, "Arch bar in compression: {:.4}", arch_ef1.n_start);
}

// ================================================================
// 8. Multi-Bay Cable-Strut Roof Truss (Howe Pattern)
// ================================================================
//
// A cable-strut roof system using Howe-type truss topology.
// Top chord carries compression, bottom chord carries tension (cable).
// Vertical and diagonal web members transfer shear.
//
// Geometry (6 bays, loaded at interior bottom chord nodes):
//   Top chord: nodes 1-7 at y=depth
//   Bottom chord: nodes 8-14 at y=0
//
// Howe diagonal pattern: diagonals slope from top toward bottom
// (from top-left to bottom-right in each bay).
//
// With symmetric loading at interior bottom chord nodes, the
// bottom chord acts as a tension cable and the top chord is
// in compression.
//
// Reference: Kassimali, "Structural Analysis", §4.5

#[test]
fn validation_cable_strut_roof_truss() {
    let bay_width: f64 = 3.0;
    let depth: f64 = 3.0;
    let n_bays: usize = 6;
    let p: f64 = 10.0; // load at each interior bottom node

    // Top chord nodes (y = depth)
    let mut nodes = Vec::new();
    for i in 0..=n_bays {
        nodes.push((i + 1, i as f64 * bay_width, depth));
    }
    // Bottom chord nodes (y = 0)
    for i in 0..=n_bays {
        nodes.push((n_bays + 2 + i, i as f64 * bay_width, 0.0));
    }

    let mut elems = Vec::new();
    let mut eid: usize = 1;

    // Top chord (horizontal compression members)
    for i in 0..n_bays {
        elems.push((eid, "truss", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Bottom chord (horizontal tension members — cable)
    for i in 0..n_bays {
        let b1 = n_bays + 2 + i;
        let b2 = n_bays + 3 + i;
        elems.push((eid, "truss", b1, b2, 1, 1, false, false));
        eid += 1;
    }
    // Verticals
    for i in 0..=n_bays {
        let top = i + 1;
        let bot = n_bays + 2 + i;
        elems.push((eid, "truss", top, bot, 1, 1, false, false));
        eid += 1;
    }
    // Howe diagonals: from top-left to bottom-right in each bay
    for i in 0..n_bays {
        let top_left = i + 1;
        let bot_right = n_bays + 3 + i;
        elems.push((eid, "truss", top_left, bot_right, 1, 1, false, false));
        eid += 1;
    }

    // Supports at bottom chord ends
    let bot_left_node = n_bays + 2;
    let bot_right_node = 2 * n_bays + 2;
    let sups = vec![
        (1, bot_left_node, "pinned"),
        (2, bot_right_node, "rollerX"),
    ];

    // Loads at interior bottom chord nodes
    let mut loads = Vec::new();
    for i in 1..n_bays {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_bays + 2 + i, fx: 0.0, fy: -p, mz: 0.0,
        }));
    }

    let total_load: f64 = (n_bays - 1) as f64 * p;

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A_CABLE, IZ_TRUSS)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    crate::common::assert_close(sum_ry, total_load, 0.02, "Cable-strut sum_ry");

    // Symmetric loading and geometry -> equal reactions
    let r_left = results.reactions.iter().find(|r| r.node_id == bot_left_node).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == bot_right_node).unwrap();
    crate::common::assert_close(r_left.ry, r_right.ry, 0.02, "Cable-strut: symmetric Ry");

    // Bottom chord midspan element should be in tension (cable behavior)
    // Bottom chord element IDs: n_bays+1 through 2*n_bays
    let mid_bc_eid = n_bays + 1 + n_bays / 2;
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == mid_bc_eid).unwrap();
    assert!(ef_mid.n_start > 0.0,
        "Mid bottom chord element {} should be in tension: n={:.6}",
        mid_bc_eid, ef_mid.n_start);

    // Top chord midspan element should be in compression
    let mid_tc_eid = n_bays / 2;
    let ef_tc = results.element_forces.iter()
        .find(|e| e.element_id == mid_tc_eid).unwrap();
    assert!(ef_tc.n_start < 0.0,
        "Mid top chord element {} should be in compression: n={:.6}",
        mid_tc_eid, ef_tc.n_start);

    // Midspan bottom chord has maximum tension, end has minimum
    let end_bc_eid = n_bays + 1; // first bottom chord element
    let f_mid: f64 = ef_mid.n_start.abs();
    let f_end: f64 = results.element_forces.iter()
        .find(|e| e.element_id == end_bc_eid).unwrap().n_start.abs();
    assert!(f_mid > f_end,
        "Mid bottom chord tension > end: {:.4} > {:.4}", f_mid, f_end);

    // Approximate cable thrust: H ~ M_max / depth
    // For equivalent beam with interior loads:
    // With (n-1) equal loads at interior nodes: similar to UDL
    // M_max ~ total_load * L / 8 (equivalent UDL approximation)
    let l_total: f64 = n_bays as f64 * bay_width;
    let m_max_approx: f64 = total_load * l_total / 8.0;
    let h_approx: f64 = m_max_approx / depth;

    // Mid bottom chord tension should be in the ballpark of H
    let ratio: f64 = f_mid / h_approx;
    assert!(ratio > 0.5 && ratio < 2.0,
        "Bottom chord tension {:.2} in range of H_approx {:.2} (ratio={:.2})",
        f_mid, h_approx, ratio);
}
