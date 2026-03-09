/// Extended Validation: Internal Moment Releases (Hinges)
///
/// References:
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 5 (Gerber beams, multi-hinge systems)
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 5, 9 (moment distribution with hinges)
///   - Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Ch. 4 (releases in frames)
///
/// These 8 tests extend the base internal_releases suite with:
///   1. Propped cantilever with UDL and midspan hinge
///   2. Two-span beam with hinge: antisymmetric loading
///   3. Hinge at quarter span of fixed-fixed beam under point load
///   4. Portal frame with single column-top hinge (asymmetric)
///   5. Three-hinged triangular frame with vertical load
///   6. Propped cantilever with hinge at 3L/4
///   7. Fixed-fixed beam with symmetric hinges under symmetric UDL
///   8. Hinge combined with point load on element
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Propped Cantilever with UDL and Midspan Hinge
// ================================================================
//
// Fixed left, roller right, hinge at midspan, uniform load q on full span.
// The hinge at midspan makes M = 0 there. Left half is a propped cantilever
// loaded with UDL, right half is simply supported loaded with UDL.
// Global equilibrium: sum Ry = q * L.

#[test]
fn validation_hinge_propped_cantilever_udl() {
    let l = 10.0;
    let n = 10;
    let q: f64 = -8.0;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();

    let mid_elem = n / 2;
    let elems: Vec<_> = (0..n)
        .map(|i| {
            let he = i + 1 == mid_elem;
            let hs = i + 1 == mid_elem + 1;
            (i + 1, "frame", i + 1, i + 2, 1, 1, hs, he)
        })
        .collect();

    let sups = vec![(1, 1_usize, "fixed"), (2, n_nodes, "rollerX")];

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Moment at hinge must be zero
    let ef_before = results.element_forces.iter().find(|e| e.element_id == mid_elem).unwrap();
    assert!(ef_before.m_end.abs() < 0.5,
        "Hinge moment should be ~0: M_end={:.6}", ef_before.m_end);

    let ef_after = results.element_forces.iter()
        .find(|e| e.element_id == mid_elem + 1).unwrap();
    assert!(ef_after.m_start.abs() < 0.5,
        "Hinge moment should be ~0: M_start={:.6}", ef_after.m_start);

    // Global equilibrium
    let total_load = q.abs() * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02, "Propped+hinge UDL: sum Ry = qL");

    // Fixed support should carry a moment (not zero)
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r_left.mz.abs() > 1.0,
        "Fixed support should have moment: Mz={:.6}", r_left.mz);
}

// ================================================================
// 2. Two-Span Beam with Hinge: Antisymmetric Loading
// ================================================================
//
// Two equal spans, pinned-roller-roller, hinge at midspan of span 2.
// Span 1 loaded with downward UDL, span 2 loaded with upward UDL.
// Hinge ensures M = 0 at that location.

#[test]
fn validation_hinge_two_span_antisymmetric() {
    let l = 6.0;
    let n_per = 6;
    let q: f64 = -10.0;

    let total_n = n_per * 2;
    let n_nodes = total_n + 1;
    let elem_len = l / n_per as f64;

    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();

    // Hinge at midspan of second span
    let hinge_elem = n_per + n_per / 2;
    let elems: Vec<_> = (0..total_n)
        .map(|i| {
            let he = i + 1 == hinge_elem;
            let hs = i + 1 == hinge_elem + 1;
            (i + 1, "frame", i + 1, i + 2, 1, 1, hs, he)
        })
        .collect();

    let mid_support = n_per + 1;
    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, mid_support, "rollerX"),
        (3, n_nodes, "rollerX"),
    ];

    // Span 1: downward UDL, Span 2: upward UDL (antisymmetric)
    let mut loads = Vec::new();
    for i in 0..n_per {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }
    for i in n_per..total_n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Moment at hinge must be zero
    let ef_before = results.element_forces.iter().find(|e| e.element_id == hinge_elem).unwrap();
    assert!(ef_before.m_end.abs() < 0.5,
        "Hinge moment: M_end={:.6}", ef_before.m_end);

    // Net applied load is zero (equal and opposite UDLs), so sum Ry should be ~0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry.abs() < 1.0,
        "Antisymmetric load: sum Ry should be ~0, got {:.6}", sum_ry);
}

// ================================================================
// 3. Hinge at Quarter Span of Fixed-Fixed Beam Under Point Load
// ================================================================
//
// Fixed-fixed beam, hinge at L/4. Point load P at midspan.
// The hinge ensures M = 0 at L/4. The structure is still stable
// (6 restraint DOFs - 3 equilibrium - 1 hinge = 2 redundant, but stable).

#[test]
fn validation_hinge_quarter_span_fixed_fixed() {
    let l = 8.0;
    let n = 8;
    let p = 20.0;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();

    // Hinge at L/4 (between elements 2 and 3 for n=8)
    let hinge_elem = n / 4;
    let elems: Vec<_> = (0..n)
        .map(|i| {
            let he = i + 1 == hinge_elem;
            let hs = i + 1 == hinge_elem + 1;
            (i + 1, "frame", i + 1, i + 2, 1, 1, hs, he)
        })
        .collect();

    let sups = vec![(1, 1_usize, "fixed"), (2, n_nodes, "fixed")];

    // Point load at midspan
    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Moment at hinge must be zero
    let ef_before = results.element_forces.iter().find(|e| e.element_id == hinge_elem).unwrap();
    assert!(ef_before.m_end.abs() < 0.5,
        "Hinge at L/4: M_end should be ~0: {:.6}", ef_before.m_end);

    let ef_after = results.element_forces.iter()
        .find(|e| e.element_id == hinge_elem + 1).unwrap();
    assert!(ef_after.m_start.abs() < 0.5,
        "Hinge at L/4: M_start should be ~0: {:.6}", ef_after.m_start);

    // Global equilibrium: sum Ry = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.02, "Hinge quarter span: sum Ry = P");

    // Both fixed supports should have moment reactions
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
    assert!(r_right.mz.abs() > 0.1,
        "Right fixed support should have moment: Mz={:.6}", r_right.mz);

    // Free body of left segment (fixed end to hinge at L/4):
    // M_hinge = 0. The magnitudes of Mz_reaction and Ry_left * (L/4) must match.
    assert_close(r_left.mz.abs(), (r_left.ry * (l / 4.0)).abs(), 0.05,
        "Left moment magnitude from free body: |M_left| = |Ry_left * L/4|");
}

// ================================================================
// 4. Portal Frame with Single Column-Top Hinge (Asymmetric)
// ================================================================
//
// Portal frame, fixed bases. Only left column-beam connection is hinged.
// Lateral load at top. This creates an asymmetric response.

#[test]
fn validation_hinge_portal_single_side() {
    let h = 5.0;
    let w = 8.0;
    let p = 12.0;

    // Nodes: 1=(0,0), 2=(0,h), 3=(w,h), 4=(w,0)
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];

    // Hinge only at left column top (between column and beam)
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, true),  // left col, hinge at top
        (2, "frame", 2, 3, 1, 1, true, false),   // beam, hinge at left end only
        (3, "frame", 3, 4, 1, 1, false, false),  // right col, no hinges
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: p,
        fy: 0.0,
        mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Left column top moment should be ~0 (hinge releases it)
    let ef_col_left = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!(ef_col_left.m_end.abs() < 0.1,
        "Left column top hinge: M_end={:.6}", ef_col_left.m_end);

    // Beam start moment should also be ~0
    let ef_beam = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(ef_beam.m_start.abs() < 0.1,
        "Beam start hinge: M_start={:.6}", ef_beam.m_start);

    // Right column-beam connection should NOT be zero (no hinge there)
    // The beam end and right column start should carry moment
    assert!(ef_beam.m_end.abs() > 0.1,
        "Beam end (rigid connection) should carry moment: {:.6}", ef_beam.m_end);

    // Global horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02, "Portal single hinge: sum Rx = -P");
}

// ================================================================
// 5. Three-Hinged Triangular Frame
// ================================================================
//
// Triangular frame (A-frame) with pinned bases and a hinge at the apex.
// This is the classic three-hinged arch problem.
// Pinned at A=(0,0), B=(L,0), hinge at C=(L/2, H).
// Vertical load at C.

#[test]
fn validation_three_hinged_triangular_frame() {
    let l = 10.0;
    let h = 6.0;
    let p = 15.0;

    // Nodes: 1=left base, 2=apex, 3=right base
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, l / 2.0, h),
        (3, l, 0.0),
    ];

    // Two inclined members, both with hinges at the apex (node 2)
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, true),  // left leg, hinge at apex
        (2, "frame", 2, 3, 1, 1, true, false),   // right leg, hinge at apex
    ];

    // Pinned supports at both bases
    let sups = vec![(1, 1_usize, "pinned"), (2, 3, "pinned")];

    // Vertical load at apex
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Moment at hinge (apex) should be zero on both sides
    let ef_left = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!(ef_left.m_end.abs() < 0.1,
        "Three-hinge apex: left leg M_end={:.6}", ef_left.m_end);

    let ef_right = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(ef_right.m_start.abs() < 0.1,
        "Three-hinge apex: right leg M_start={:.6}", ef_right.m_start);

    // By symmetry (symmetric geometry + symmetric vertical load):
    // Each support carries P/2 vertically
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert_close(r_left.ry, p / 2.0, 0.02, "Three-hinge: Ry_left = P/2");
    assert_close(r_right.ry, p / 2.0, 0.02, "Three-hinge: Ry_right = P/2");

    // Horizontal thrust: The magnitude is PL/(4H).
    // The sign depends on solver convention; verify magnitude.
    let expected_thrust: f64 = p * l / (4.0 * h);
    assert_close(r_left.rx.abs(), expected_thrust, 0.02,
        "Three-hinge: |horizontal thrust| = PL/(4H)");

    // The horizontal reactions should be equal and opposite (global equilibrium)
    assert_close(r_left.rx + r_right.rx, 0.0, 0.02,
        "Three-hinge: Rx_left + Rx_right = 0");
}

// ================================================================
// 6. Propped Cantilever with Hinge at 3L/4
// ================================================================
//
// Fixed at left, roller at right. Hinge placed at 3L/4.
// Midspan point load P. The hinge ensures M = 0 at 3L/4.
// The structure is stable: 4 restraint DOFs - 3 equilibrium = 1 redundant,
// minus 1 hinge condition = statically determinate.

#[test]
fn validation_hinge_propped_at_three_quarter() {
    let l = 8.0;
    let n = 8;
    let p = 10.0;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();

    // Hinge at 3L/4 (between elements 6 and 7 for n=8)
    let hinge_elem = 3 * n / 4;
    let elems: Vec<_> = (0..n)
        .map(|i| {
            let he = i + 1 == hinge_elem;
            let hs = i + 1 == hinge_elem + 1;
            (i + 1, "frame", i + 1, i + 2, 1, 1, hs, he)
        })
        .collect();

    // Propped cantilever: fixed at left, roller at right
    let sups = vec![(1, 1_usize, "fixed"), (2, n_nodes, "rollerX")];

    // Midspan point load (downward)
    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Moment at hinge must be zero
    let ef_before = results.element_forces.iter().find(|e| e.element_id == hinge_elem).unwrap();
    assert!(ef_before.m_end.abs() < 0.5,
        "Propped hinge 3L/4: M_end={:.6}", ef_before.m_end);

    let ef_after = results.element_forces.iter()
        .find(|e| e.element_id == hinge_elem + 1).unwrap();
    assert!(ef_after.m_start.abs() < 0.5,
        "Propped hinge 3L/4: M_start={:.6}", ef_after.m_start);

    // Global equilibrium: sum Ry = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.02, "Propped hinge 3L/4: sum Ry = P");

    // The fixed support should have a moment reaction
    let r_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r_fixed.mz.abs() > 0.1,
        "Fixed support should have moment: Mz={:.6}", r_fixed.mz);

    // Compare with no-hinge propped cantilever: hinge should increase midspan deflection
    let elems_no_hinge: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let nodes2: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let sups2 = vec![(1, 1_usize, "fixed"), (2, n_nodes, "rollerX")];
    let input_no_hinge = make_input(nodes2, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems_no_hinge, sups2, loads2);
    let results_no_hinge = linear::solve_2d(&input_no_hinge).unwrap();

    let d_hinge = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();
    let d_no_hinge = results_no_hinge.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();
    assert!(d_hinge > d_no_hinge,
        "Hinge should increase deflection: {:.6e} > {:.6e}", d_hinge, d_no_hinge);
}

// ================================================================
// 7. Fixed-Fixed Beam with Symmetric Hinges Under Symmetric UDL
// ================================================================
//
// Fixed-fixed beam with hinges at L/3 and 2L/3. Uniform distributed load.
// With fixed-fixed supports (6 restraint DOFs) and 2 hinge conditions:
// 6 - 3 (equilibrium) - 2 (hinges) = 1 redundant → still stable.
// Symmetry ensures equal reactions at both ends and zero moments at both hinges.

#[test]
fn validation_hinge_fixed_fixed_symmetric_udl() {
    let l = 12.0;
    let n = 12;
    let q: f64 = -10.0;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();

    // Hinges at L/3 (elem 4) and 2L/3 (elem 8) for n=12
    let hinge_elem_left = n / 3;       // element 4
    let hinge_elem_right = 2 * n / 3;  // element 8
    let elems: Vec<_> = (0..n)
        .map(|i| {
            let he = i + 1 == hinge_elem_left || i + 1 == hinge_elem_right;
            let hs = i + 1 == hinge_elem_left + 1 || i + 1 == hinge_elem_right + 1;
            (i + 1, "frame", i + 1, i + 2, 1, 1, hs, he)
        })
        .collect();

    // Fixed-fixed supports
    let sups = vec![(1, 1_usize, "fixed"), (2, n_nodes, "fixed")];

    // Uniform distributed load on all elements
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Both reactions should be qL/2 by symmetry
    let total_load = q.abs() * l;
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
    assert_close(r_left.ry, total_load / 2.0, 0.02,
        "Symmetric hinge fixed beam: Ry_left = qL/2");
    assert_close(r_right.ry, total_load / 2.0, 0.02,
        "Symmetric hinge fixed beam: Ry_right = qL/2");

    // Moments at both hinges should be zero
    let ef_h1 = results.element_forces.iter().find(|e| e.element_id == hinge_elem_left).unwrap();
    assert!(ef_h1.m_end.abs() < 0.5,
        "Left hinge moment: M_end={:.6}", ef_h1.m_end);

    let ef_h2 = results.element_forces.iter().find(|e| e.element_id == hinge_elem_right).unwrap();
    assert!(ef_h2.m_end.abs() < 0.5,
        "Right hinge moment: M_end={:.6}", ef_h2.m_end);

    // By symmetry, the reaction moments at both ends should be equal in magnitude
    assert_close(r_left.mz.abs(), r_right.mz.abs(), 0.03,
        "Symmetric moments at fixed ends");

    // Deflections should be symmetric about midspan
    let mid = n / 2 + 1;
    let d_left_third = results.displacements.iter()
        .find(|d| d.node_id == n / 3 + 1).unwrap().uy;
    let d_right_third = results.displacements.iter()
        .find(|d| d.node_id == 2 * n / 3 + 1).unwrap().uy;
    assert_close(d_left_third, d_right_third, 0.02,
        "Symmetric deflections at L/3 and 2L/3");

    // Midspan deflection should be the largest (most negative)
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy;
    assert!(d_mid < d_left_third,
        "Midspan deflection should be larger: {:.6e} < {:.6e}", d_mid, d_left_third);
}

// ================================================================
// 8. Hinge Combined with Point Load on Element
// ================================================================
//
// Fixed-roller beam with a hinge at midspan and a point load applied
// directly on an element (not at a node). Verify the hinge condition
// and global equilibrium still hold with element-level loading.

#[test]
fn validation_hinge_with_element_point_load() {
    let l = 10.0;
    let n = 10;
    let p = 16.0;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();

    // Hinge at midspan
    let mid_elem = n / 2;
    let elems: Vec<_> = (0..n)
        .map(|i| {
            let he = i + 1 == mid_elem;
            let hs = i + 1 == mid_elem + 1;
            (i + 1, "frame", i + 1, i + 2, 1, 1, hs, he)
        })
        .collect();

    let sups = vec![(1, 1_usize, "fixed"), (2, n_nodes, "rollerX")];

    // Point load on element 3 (in the left half), at midpoint of that element
    let loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: 3,
        a: elem_len / 2.0,
        p: -p,
        px: None,
        mz: None,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Moment at hinge must be zero
    let ef_before = results.element_forces.iter().find(|e| e.element_id == mid_elem).unwrap();
    assert!(ef_before.m_end.abs() < 0.5,
        "Hinge with element load: M_end={:.6}", ef_before.m_end);

    let ef_after = results.element_forces.iter()
        .find(|e| e.element_id == mid_elem + 1).unwrap();
    assert!(ef_after.m_start.abs() < 0.5,
        "Hinge with element load: M_start={:.6}", ef_after.m_start);

    // Global vertical equilibrium: sum Ry = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.02, "Hinge + element load: sum Ry = P");

    // The fixed support should have a nonzero moment (load is on left half)
    let r_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r_fixed.mz.abs() > 1.0,
        "Fixed support moment should be significant: Mz={:.6}", r_fixed.mz);

    // Compare with no-hinge version: hinge should increase deflection
    let elems_no_hinge: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let nodes2: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let loads2 = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: 3,
        a: elem_len / 2.0,
        p: -p,
        px: None,
        mz: None,
    })];
    let sups2 = vec![(1, 1_usize, "fixed"), (2, n_nodes, "rollerX")];
    let input_no_hinge = make_input(nodes2, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems_no_hinge, sups2, loads2);
    let results_no_hinge = linear::solve_2d(&input_no_hinge).unwrap();

    let mid_node = n / 2 + 1;
    let d_hinge = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy.abs();
    let d_no_hinge = results_no_hinge.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy.abs();
    assert!(d_hinge > d_no_hinge,
        "Hinge should increase deflection: {:.6e} > {:.6e}", d_hinge, d_no_hinge);
}
