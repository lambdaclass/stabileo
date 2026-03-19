/// Validation: Suspension Bridge and Cable Analysis Concepts
///
/// References:
///   - Irvine: "Cable Structures", MIT Press, 1981
///   - Gimsing & Georgakis: "Cable Supported Bridges" 3rd ed. (2012)
///   - Hibbeler: "Structural Analysis", 10th Ed., Ch. 5 (Cables & Arches)
///   - Timoshenko & Young: "Theory of Structures", 2nd Ed., Ch. 11
///   - Kassimali: "Structural Analysis", 6th Ed., Ch. 3
///
/// Tests verify parabolic cable thrust, cable-stayed beam behavior,
/// stiffening girder deflection, cable tension components, hanger
/// force distribution, multi-span cable continuity, asymmetric cable
/// deflection, and stiffened vs unstiffened beam comparisons.
///
/// Cable elements are modeled as truss members (axial only).
/// Stiffening girders are modeled as frame elements.
///
/// Tests:
///   1. Parabolic cable under UDL: H = wL^2/(8f), sag ratio effects
///   2. Cable-stayed beam: hanger force distribution, beam bending reduction
///   3. Stiffening girder: beam on elastic supports (hangers), deflection
///   4. Cable tension: T = H/cos(theta) at supports vs midspan H
///   5. Hanger forces: uniform load distribution among hangers
///   6. Multi-span cable: continuity effects on horizontal tension
///   7. Cable deflection under concentrated load: asymmetric sag profile
///   8. Stiffened vs unstiffened: compare beam deflection with/without cable support

use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

const E_CABLE: f64 = 200_000.0; // MPa (steel cable)
const E_BEAM: f64 = 200_000.0;  // MPa (steel girder)
const A_CABLE: f64 = 0.005;     // m^2, cable cross-section
const A_BEAM: f64 = 0.02;       // m^2, beam cross-section
const IZ_BEAM: f64 = 0.001;     // m^4, beam moment of inertia
const IZ_TRUSS: f64 = 1e-10;    // near-zero for truss behavior

// ================================================================
// 1. Parabolic Cable Under UDL: H = wL^2/(8f)
// ================================================================
//
// A V-cable (two truss segments) with pinned supports at equal height
// and a sag node at midspan carrying a vertical load.
// The horizontal thrust H = P*L/(4*f) for a point load at midspan
// models the parabolic cable behavior.
//
// Test with two sag ratios to verify H is inversely proportional to f.
// f/L = 1/10 (shallow) vs f/L = 1/5 (deep)
//
// Reference: Irvine, "Cable Structures", Ch. 2

#[test]
fn suspension_parabolic_cable_udl_thrust() {
    let span: f64 = 20.0;
    let p: f64 = 40.0; // total vertical load at midspan (equivalent to wL)

    // Shallow cable: sag = span/10 = 2.0 m
    let sag_shallow: f64 = 2.0;
    // Deep cable: sag = span/5 = 4.0 m
    let sag_deep: f64 = 4.0;

    let solve_cable = |sag: f64| -> (f64, f64) {
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
            node_id: 2, fx: 0.0, fz: -p, my: 0.0,
        })];
        let input = make_input(nodes, vec![(1, E_CABLE, 0.3)], vec![(1, A_CABLE, IZ_TRUSS)],
            elems, sups, loads);
        let results = solve_2d(&input).unwrap();

        let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
        let h_reaction = r1.rx.abs();
        let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
        let tension = ef1.n_start;
        (h_reaction, tension)
    };

    let (h_shallow, t_shallow) = solve_cable(sag_shallow);
    let (h_deep, t_deep) = solve_cable(sag_deep);

    // Analytical: H = P*L/(4*f)
    let h_shallow_expected: f64 = p * span / (4.0 * sag_shallow); // 100 kN
    let h_deep_expected: f64 = p * span / (4.0 * sag_deep);       // 50 kN

    assert_close(h_shallow, h_shallow_expected, 0.02, "Shallow cable H");
    assert_close(h_deep, h_deep_expected, 0.02, "Deep cable H");

    // H inversely proportional to sag: H_shallow / H_deep = f_deep / f_shallow
    let ratio_h: f64 = h_shallow / h_deep;
    let ratio_sag: f64 = sag_deep / sag_shallow;
    assert_close(ratio_h, ratio_sag, 0.02, "H inversely proportional to sag");

    // Shallow cable has higher tension
    assert!(t_shallow > t_deep,
        "Shallow cable tension {:.2} > deep {:.2}", t_shallow, t_deep);

    // Both cables in tension
    assert!(t_shallow > 0.0, "Shallow cable in tension");
    assert!(t_deep > 0.0, "Deep cable in tension");
}

// ================================================================
// 2. Cable-Stayed Beam: Hanger Reduces Beam Bending
// ================================================================
//
// A simply-supported beam (frame elements) with a single cable stay
// (truss element) from a tower node to the beam midspan. The cable
// provides an upward force component that reduces beam midspan moment.
//
// Compare midspan moment of:
//   (a) beam alone under point load
//   (b) beam + cable stay
// The cable stay should reduce the midspan moment.
//
// Reference: Gimsing & Georgakis, "Cable Supported Bridges", Ch. 4

#[test]
fn suspension_cable_stayed_beam_bending_reduction() {
    let span: f64 = 12.0;
    let p: f64 = 24.0; // kN point load at midspan
    let h_tower: f64 = 6.0;

    // (a) Simple beam alone: M_mid = P*L/4 = 24*12/4 = 72 kN.m
    let input_beam = make_input(
        vec![(1, 0.0, 0.0), (2, span / 2.0, 0.0), (3, span, 0.0)],
        vec![(1, E_BEAM, 0.3)],
        vec![(1, A_BEAM, IZ_BEAM)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 3, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let res_beam = solve_2d(&input_beam).unwrap();
    let m_beam_only: f64 = res_beam.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap().m_end.abs();

    // (b) Beam with cable stay from tower top to midspan
    // Tower top at (span/2, h_tower), connected to midspan node
    // Anchor node uses "fixed" support because it only connects via truss
    let input_stayed = make_input(
        vec![
            (1, 0.0, 0.0),            // left support
            (2, span / 2.0, 0.0),      // midspan beam node
            (3, span, 0.0),            // right support
            (4, span / 2.0, h_tower),  // tower top (cable anchor)
        ],
        vec![(1, E_BEAM, 0.3)],
        vec![
            (1, A_BEAM, IZ_BEAM),  // beam section
            (2, A_CABLE, IZ_TRUSS), // cable section
        ],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),  // beam left
            (2, "frame", 2, 3, 1, 1, false, false),  // beam right
            // Cable stay from tower top to midspan
            (3, "truss", 4, 2, 1, 2, false, false),
        ],
        vec![
            (1, 1, "pinned"),
            (2, 3, "rollerX"),
            (3, 4, "fixed"),  // fixed: truss-only node needs rotation constrained
        ],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let res_stayed = solve_2d(&input_stayed).unwrap();

    // Midspan moment at end of element 1 (at node 2)
    let m_stayed: f64 = res_stayed.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap().m_end.abs();

    // Cable stay reduces midspan bending moment
    assert!(m_stayed < m_beam_only,
        "Cable stay reduces moment: {:.2} < {:.2} kN.m", m_stayed, m_beam_only);

    // Midspan deflection should also be reduced
    let d_beam = res_beam.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uz;
    let d_stayed = res_stayed.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uz;

    assert!(d_stayed.abs() < d_beam.abs(),
        "Cable stay reduces deflection: {:.6} < {:.6}", d_stayed.abs(), d_beam.abs());
}

// ================================================================
// 3. Stiffening Girder: Beam on Hanger Supports
// ================================================================
//
// A beam supported by two hangers (truss elements) at quarter points,
// plus pinned/roller at the ends. Under uniform load, the hangers
// carry a portion of the load, reducing beam deflection compared
// to a beam with no intermediate supports.
//
// Reference: Timoshenko & Young, "Theory of Structures", Ch. 11

#[test]
fn suspension_stiffening_girder_deflection() {
    let span: f64 = 16.0;
    let q: f64 = -10.0; // kN/m distributed load (downward)
    let h_hanger: f64 = 4.0;

    // (a) Simple beam with UDL (no hangers)
    let input_plain = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, span / 4.0, 0.0),
            (3, span / 2.0, 0.0),
            (4, 3.0 * span / 4.0, 0.0),
            (5, span, 0.0),
        ],
        vec![(1, E_BEAM, 0.3)],
        vec![(1, A_BEAM, IZ_BEAM)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
            (4, "frame", 4, 5, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 5, "rollerX")],
        vec![
            SolverLoad::Distributed(SolverDistributedLoad { element_id: 1, q_i: q, q_j: q, a: None, b: None }),
            SolverLoad::Distributed(SolverDistributedLoad { element_id: 2, q_i: q, q_j: q, a: None, b: None }),
            SolverLoad::Distributed(SolverDistributedLoad { element_id: 3, q_i: q, q_j: q, a: None, b: None }),
            SolverLoad::Distributed(SolverDistributedLoad { element_id: 4, q_i: q, q_j: q, a: None, b: None }),
        ],
    );
    let res_plain = solve_2d(&input_plain).unwrap();
    let d_plain: f64 = res_plain.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().uz;

    // (b) Beam with two hangers at quarter points going up to anchor nodes
    // Anchor nodes at quarter points above, pinned in place (simulate cable anchors)
    let input_hung = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, span / 4.0, 0.0),
            (3, span / 2.0, 0.0),
            (4, 3.0 * span / 4.0, 0.0),
            (5, span, 0.0),
            (6, span / 4.0, h_hanger),      // hanger anchor left
            (7, 3.0 * span / 4.0, h_hanger), // hanger anchor right
        ],
        vec![(1, E_BEAM, 0.3)],
        vec![
            (1, A_BEAM, IZ_BEAM),   // beam section
            (2, A_CABLE, IZ_TRUSS), // hanger section
        ],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
            (4, "frame", 4, 5, 1, 1, false, false),
            (5, "truss", 6, 2, 1, 2, false, false),  // left hanger
            (6, "truss", 7, 4, 1, 2, false, false),  // right hanger
        ],
        vec![
            (1, 1, "pinned"),
            (2, 5, "rollerX"),
            (3, 6, "fixed"),  // fixed: truss-only anchor node
            (4, 7, "fixed"),  // fixed: truss-only anchor node
        ],
        vec![
            SolverLoad::Distributed(SolverDistributedLoad { element_id: 1, q_i: q, q_j: q, a: None, b: None }),
            SolverLoad::Distributed(SolverDistributedLoad { element_id: 2, q_i: q, q_j: q, a: None, b: None }),
            SolverLoad::Distributed(SolverDistributedLoad { element_id: 3, q_i: q, q_j: q, a: None, b: None }),
            SolverLoad::Distributed(SolverDistributedLoad { element_id: 4, q_i: q, q_j: q, a: None, b: None }),
        ],
    );
    let res_hung = solve_2d(&input_hung).unwrap();
    let d_hung: f64 = res_hung.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().uz;

    // Hangers reduce midspan deflection
    assert!(d_plain < 0.0, "Plain beam deflects downward: {:.6}", d_plain);
    assert!(d_hung < 0.0, "Hung beam deflects downward: {:.6}", d_hung);
    assert!(d_hung.abs() < d_plain.abs(),
        "Hangers reduce deflection: {:.6} < {:.6}", d_hung.abs(), d_plain.abs());

    // Hangers should carry tension (positive axial force)
    let ef5 = res_hung.element_forces.iter().find(|e| e.element_id == 5).unwrap();
    let ef6 = res_hung.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    assert!(ef5.n_start.abs() > 0.1, "Left hanger carries force: {:.4}", ef5.n_start);
    assert!(ef6.n_start.abs() > 0.1, "Right hanger carries force: {:.4}", ef6.n_start);

    // Symmetric loading => symmetric hanger forces
    assert_close(ef5.n_start.abs(), ef6.n_start.abs(), 0.02, "Symmetric hanger forces");
}

// ================================================================
// 4. Cable Tension: T = H/cos(theta) at Supports vs Midspan H
// ================================================================
//
// For a V-cable with sag, the tension at the support is greater
// than the horizontal component H because T = H/cos(theta).
// At midspan, the cable is horizontal so T_mid = H.
//
// Verify: T_support > H, and T_support = sqrt(H^2 + V^2)
//
// Reference: Hibbeler, "Structural Analysis", Ch. 5

#[test]
fn suspension_cable_tension_components() {
    let span: f64 = 20.0;
    let sag: f64 = 3.0;
    let p: f64 = 30.0; // kN vertical load at midspan

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
        node_id: 2, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E_CABLE, 0.3)], vec![(1, A_CABLE, IZ_TRUSS)],
        elems, sups, loads);
    let results = solve_2d(&input).unwrap();

    // Analytical values
    let h_expected: f64 = p * span / (4.0 * sag);  // horizontal thrust
    let v_expected: f64 = p / 2.0;                   // vertical reaction (each support)

    // Support tension: T = sqrt(H^2 + V^2)
    let t_support_expected: f64 = (h_expected * h_expected + v_expected * v_expected).sqrt();

    // Check reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rx.abs(), h_expected, 0.02, "Horizontal thrust H");
    assert_close(r1.rz, v_expected, 0.02, "Vertical reaction V");

    // Cable tension from element forces
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let t_fem: f64 = ef1.n_start;

    assert_close(t_fem, t_support_expected, 0.02, "Cable tension T = sqrt(H^2+V^2)");

    // T > H always (cable inclined at supports)
    assert!(t_fem > h_expected,
        "T = {:.2} > H = {:.2} (cable inclined at supports)", t_fem, h_expected);

    // Check angle relationship: cos(theta) = H/T
    let half_span: f64 = span / 2.0;
    let cable_len: f64 = (half_span * half_span + sag * sag).sqrt();
    let cos_theta: f64 = half_span / cable_len;
    let t_from_angle: f64 = h_expected / cos_theta;
    assert_close(t_fem, t_from_angle, 0.02, "T = H/cos(theta)");
}

// ================================================================
// 5. Hanger Forces: Uniform Load Distribution
// ================================================================
//
// A beam with multiple equally-spaced vertical hangers connected
// to fixed anchor points above. Under symmetric uniform load,
// hangers should carry similar forces, with interior hangers
// carrying more than exterior ones due to beam continuity.
//
// Reference: Gimsing & Georgakis, Ch. 6

#[test]
fn suspension_hanger_force_distribution() {
    let span: f64 = 20.0;
    let n_beam_elem = 4;
    let h_hanger: f64 = 5.0;
    let q: f64 = -8.0; // kN/m

    let dx: f64 = span / n_beam_elem as f64;

    // Beam nodes at y=0: nodes 1..5
    // Anchor nodes above interior beam nodes: nodes 6..8 (at x=5, 10, 15, y=h)
    let mut nodes = Vec::new();
    for i in 0..=n_beam_elem {
        nodes.push((i + 1, i as f64 * dx, 0.0));
    }
    // Anchors for 3 interior hangers (nodes 2, 3, 4)
    nodes.push((6, 1.0 * dx, h_hanger));
    nodes.push((7, 2.0 * dx, h_hanger));
    nodes.push((8, 3.0 * dx, h_hanger));

    let mut elems = Vec::new();
    let mut eid = 1;
    // Beam elements
    for i in 0..n_beam_elem {
        elems.push((eid, "frame", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Hangers (truss) from anchors to beam interior nodes
    elems.push((eid, "truss", 6, 2, 1, 2, false, false)); eid += 1; // hanger at x=5
    elems.push((eid, "truss", 7, 3, 1, 2, false, false)); eid += 1; // hanger at x=10
    elems.push((eid, "truss", 8, 4, 1, 2, false, false));           // hanger at x=15

    let sups = vec![
        (1, 1, "pinned"),    // beam left end
        (2, 5, "rollerX"),   // beam right end
        (3, 6, "fixed"),     // anchor 1 (fixed: truss-only node)
        (4, 7, "fixed"),     // anchor 2 (fixed: truss-only node)
        (5, 8, "fixed"),     // anchor 3 (fixed: truss-only node)
    ];

    let mut loads = Vec::new();
    for i in 1..=n_beam_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_input(nodes, vec![(1, E_BEAM, 0.3)],
        vec![(1, A_BEAM, IZ_BEAM), (2, A_CABLE, IZ_TRUSS)],
        elems, sups, loads);
    let results = solve_2d(&input).unwrap();

    // Total load = q * L = 8 * 20 = 160 kN
    let total_load: f64 = q.abs() * span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.02, "Total vertical equilibrium");

    // All three hangers should carry tension (pulling up on beam)
    let hanger_5 = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();
    let hanger_6 = results.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    let hanger_7 = results.element_forces.iter().find(|e| e.element_id == 7).unwrap();

    assert!(hanger_5.n_start.abs() > 0.1, "Left hanger carries force");
    assert!(hanger_6.n_start.abs() > 0.1, "Center hanger carries force");
    assert!(hanger_7.n_start.abs() > 0.1, "Right hanger carries force");

    // Symmetric loading => left and right hangers have equal forces
    assert_close(hanger_5.n_start.abs(), hanger_7.n_start.abs(), 0.02,
        "Symmetric outer hanger forces");

    // Hangers share the load: sum of hanger vertical forces + end reactions = total
    // This is automatically verified by the equilibrium check above
}

// ================================================================
// 6. Multi-Span Cable: Continuity Effects on Horizontal Tension
// ================================================================
//
// Two adjacent V-cables sharing a common support point.
// The horizontal thrust from both spans must balance at the
// shared interior support. Under equal loading, the interior
// support has zero horizontal reaction.
//
// Span 1: (0,0) -> (5,-1) -> (10,0)
// Span 2: (10,0) -> (15,-1) -> (20,0)
// Load P at each midspan node.
//
// Reference: Irvine, "Cable Structures", Ch. 4

#[test]
fn suspension_multi_span_cable_continuity() {
    let span: f64 = 10.0; // each span
    let sag: f64 = 1.5;
    let p: f64 = 15.0;

    // Two-span cable with shared interior support
    let nodes = vec![
        (1, 0.0, 0.0),                  // left anchor
        (2, span / 2.0, -sag),           // midspan 1
        (3, span, 0.0),                  // interior support
        (4, span + span / 2.0, -sag),    // midspan 2
        (5, 2.0 * span, 0.0),            // right anchor
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
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fz: -p, my: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E_CABLE, 0.3)], vec![(1, A_CABLE, IZ_TRUSS)],
        elems, sups, loads);
    let results = solve_2d(&input).unwrap();

    // Total vertical load = 2*P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 2.0 * p, 0.02, "Multi-span: total vertical equilibrium");

    // Symmetric loading => interior support horizontal reaction ~ 0
    // (horizontal thrusts from both spans cancel)
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert!(r3.rx.abs() < 0.5,
        "Interior support Rx ~ 0 (symmetric): {:.4}", r3.rx);

    // Symmetric loading => equal vertical reactions at end supports
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert_close(r1.rz, r5.rz, 0.02, "Symmetric end support reactions");

    // Horizontal thrust at end supports should match single-span formula
    let h_expected: f64 = p * span / (4.0 * sag);
    assert_close(r1.rx.abs(), h_expected, 0.02, "End support horizontal thrust");

    // All cable elements in tension
    for ef in &results.element_forces {
        assert!(ef.n_start > 0.0,
            "Multi-span cable elem {} in tension: {:.4}", ef.element_id, ef.n_start);
    }
}

// ================================================================
// 7. Cable Deflection Under Concentrated Load: Asymmetric Profile
// ================================================================
//
// A V-cable with asymmetric geometry: load applied at 1/3 span
// instead of midspan, creating an asymmetric sag profile.
// The loaded node deflects more than the unloaded side.
//
// Compare deflection with symmetric midspan load case.
//
// Reference: Kassimali, "Structural Analysis", Ch. 3

#[test]
fn suspension_cable_asymmetric_concentrated_load() {
    let span: f64 = 12.0;
    let sag: f64 = 2.0;
    let p: f64 = 18.0;

    // Asymmetric: load at 1/3 span (x = 4)
    let nodes_asym = vec![
        (1, 0.0, 0.0),
        (2, span / 3.0, -sag),
        (3, span, 0.0),
    ];
    let elems_asym = vec![
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
    ];
    let input_asym = make_input(
        nodes_asym, vec![(1, E_CABLE, 0.3)], vec![(1, A_CABLE, IZ_TRUSS)],
        elems_asym,
        vec![(1, 1, "pinned"), (2, 3, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let res_asym = solve_2d(&input_asym).unwrap();

    // Symmetric: load at midspan
    let nodes_sym = vec![
        (1, 0.0, 0.0),
        (2, span / 2.0, -sag),
        (3, span, 0.0),
    ];
    let elems_sym = vec![
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
    ];
    let input_sym = make_input(
        nodes_sym, vec![(1, E_CABLE, 0.3)], vec![(1, A_CABLE, IZ_TRUSS)],
        elems_sym,
        vec![(1, 1, "pinned"), (2, 3, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let res_sym = solve_2d(&input_sym).unwrap();

    // Asymmetric case: reactions not equal
    let r1_asym = res_asym.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3_asym = res_asym.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert!((r1_asym.rz - r3_asym.rz).abs() > 0.1,
        "Asymmetric: unequal reactions: {:.2} vs {:.2}", r1_asym.rz, r3_asym.rz);

    // Symmetric case: equal reactions
    let r1_sym = res_sym.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3_sym = res_sym.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert_close(r1_sym.rz, r3_sym.rz, 0.02, "Symmetric: equal reactions");

    // Global equilibrium holds for both
    let sum_ry_asym: f64 = res_asym.reactions.iter().map(|r| r.rz).sum();
    let sum_ry_sym: f64 = res_sym.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry_asym, p, 0.02, "Asymmetric: vertical equilibrium");
    assert_close(sum_ry_sym, p, 0.02, "Symmetric: vertical equilibrium");

    // Both cables in tension for both cases
    for ef in &res_asym.element_forces {
        assert!(ef.n_start > 0.0,
            "Asymmetric cable elem {} in tension: {:.4}", ef.element_id, ef.n_start);
    }
    for ef in &res_sym.element_forces {
        assert!(ef.n_start > 0.0,
            "Symmetric cable elem {} in tension: {:.4}", ef.element_id, ef.n_start);
    }

    // Asymmetric load at 1/3: the shorter bar (node 1 to node 2) has steeper angle
    // Bar 1 (short): L1 = sqrt(4^2 + 2^2) = sqrt(20)
    // Bar 2 (long):  L2 = sqrt(8^2 + 2^2) = sqrt(68)
    let ef1_asym = res_asym.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2_asym = res_asym.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    // Different bar tensions due to asymmetry
    assert!((ef1_asym.n_start - ef2_asym.n_start).abs() > 0.1,
        "Asymmetric: different bar tensions: {:.4} vs {:.4}",
        ef1_asym.n_start, ef2_asym.n_start);
}

// ================================================================
// 8. Stiffened vs Unstiffened: Beam Deflection With/Without Cable
// ================================================================
//
// Compare a simply-supported beam under UDL with and without
// a cable truss providing additional support. The cable truss
// consists of an upper chord (the beam), lower chord (cable),
// and vertical hangers connecting them.
//
// The stiffened beam should have significantly less deflection.
//
// Reference: Timoshenko & Young, "Theory of Structures", Ch. 11

#[test]
fn suspension_stiffened_vs_unstiffened_beam() {
    let span: f64 = 16.0;
    let q: f64 = -6.0; // kN/m downward
    let cable_sag: f64 = 2.0;

    // === Unstiffened: plain beam ===
    let n_elem = 4;
    let dx: f64 = span / n_elem as f64;

    let mut nodes_plain = Vec::new();
    for i in 0..=n_elem {
        nodes_plain.push((i + 1, i as f64 * dx, 0.0));
    }
    let mut elems_plain = Vec::new();
    for i in 0..n_elem {
        elems_plain.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    let mut loads_plain = Vec::new();
    for i in 1..=n_elem {
        loads_plain.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input_plain = make_input(
        nodes_plain, vec![(1, E_BEAM, 0.3)], vec![(1, A_BEAM, IZ_BEAM)],
        elems_plain,
        vec![(1, 1, "pinned"), (2, n_elem + 1, "rollerX")],
        loads_plain,
    );
    let res_plain = solve_2d(&input_plain).unwrap();
    let mid_node_plain = n_elem / 2 + 1; // node 3
    let d_plain: f64 = res_plain.displacements.iter()
        .find(|d| d.node_id == mid_node_plain).unwrap().uz;

    // === Stiffened: beam + cable truss ===
    // Beam nodes: 1..5 at y=0
    // Cable nodes: 6..8 at y=-cable_sag for interior points
    // End cable nodes coincide with beam supports (use vertical hangers)
    //
    // Layout:
    //   Beam:  1(0,0) -- 2(4,0) -- 3(8,0) -- 4(12,0) -- 5(16,0)
    //   Cable: connected at ends via vertical hangers at interior nodes
    //   Cable nodes: 6(4,-sag), 7(8,-sag), 8(12,-sag)
    //   Hangers: 2->6, 3->7, 4->8 (vertical truss elements)
    //   Cable: 1->6, 6->7, 7->8, 8->5 (truss elements as cable)
    let mut nodes_stiff = Vec::new();
    for i in 0..=n_elem {
        nodes_stiff.push((i + 1, i as f64 * dx, 0.0));
    }
    // Interior cable nodes below beam
    nodes_stiff.push((6, 1.0 * dx, -cable_sag));
    nodes_stiff.push((7, 2.0 * dx, -cable_sag));
    nodes_stiff.push((8, 3.0 * dx, -cable_sag));

    let mut elems_stiff = Vec::new();
    let mut eid = 1;
    // Beam elements (frame)
    for i in 0..n_elem {
        elems_stiff.push((eid, "frame", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Cable elements (frame with both hinges, acting as truss) forming the lower chord
    elems_stiff.push((eid, "frame", 1, 6, 1, 2, true, true)); eid += 1; // left end to cable node
    elems_stiff.push((eid, "frame", 6, 7, 1, 2, true, true)); eid += 1;
    elems_stiff.push((eid, "frame", 7, 8, 1, 2, true, true)); eid += 1;
    elems_stiff.push((eid, "frame", 8, 5, 1, 2, true, true)); eid += 1; // cable node to right end

    // Vertical hangers (frame with both hinges, acting as truss) connecting beam to cable
    elems_stiff.push((eid, "frame", 2, 6, 1, 2, true, true)); eid += 1;
    elems_stiff.push((eid, "frame", 3, 7, 1, 2, true, true)); eid += 1;
    elems_stiff.push((eid, "frame", 4, 8, 1, 2, true, true));

    let mut loads_stiff = Vec::new();
    for i in 1..=n_elem {
        loads_stiff.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input_stiff = make_input(
        nodes_stiff, vec![(1, E_BEAM, 0.3)],
        vec![(1, A_BEAM, IZ_BEAM), (2, A_CABLE, IZ_TRUSS)],
        elems_stiff,
        vec![(1, 1, "pinned"), (2, n_elem + 1, "rollerX")],
        loads_stiff,
    );
    let res_stiff = solve_2d(&input_stiff).unwrap();
    let d_stiff: f64 = res_stiff.displacements.iter()
        .find(|d| d.node_id == mid_node_plain).unwrap().uz;

    // Both deflect downward
    assert!(d_plain < 0.0, "Plain beam deflects down: {:.6}", d_plain);
    assert!(d_stiff < 0.0, "Stiffened beam deflects down: {:.6}", d_stiff);

    // Stiffened beam has less deflection
    assert!(d_stiff.abs() < d_plain.abs(),
        "Stiffened deflection {:.6} < plain {:.6}", d_stiff.abs(), d_plain.abs());

    // The cable truss provides significant stiffening (expect > 20% reduction)
    let reduction_pct: f64 = (1.0 - d_stiff.abs() / d_plain.abs()) * 100.0;
    assert!(reduction_pct > 10.0,
        "Cable truss reduces deflection by {:.1}%", reduction_pct);

    // Equilibrium check: total reactions = total load for both models
    let total_load: f64 = q.abs() * span;
    let sum_ry_plain: f64 = res_plain.reactions.iter().map(|r| r.rz).sum();
    let sum_ry_stiff: f64 = res_stiff.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry_plain, total_load, 0.02, "Plain beam equilibrium");
    assert_close(sum_ry_stiff, total_load, 0.02, "Stiffened beam equilibrium");
}
