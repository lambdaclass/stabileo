/// Validation: Internal Moment Releases (Hinges)
///
/// References:
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 5 (Beams with internal hinges)
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 5 (internal loadings)
///   - Leet, Uang & Gilbert, "Fundamentals of Structural Analysis", 5th Ed., Ch. 3
///
/// Tests verify moment release (hinge) behavior at element ends:
///   1. Midspan hinge on SS beam: beam splits into two simply-supported halves
///   2. Hinge at fixed end: reduces to pinned support
///   3. Gerber beam: internal hinge makes continuous beam determinate
///   4. Hinge in portal frame: changes moment distribution
///   5. Both ends hinged: truss-like behavior (axial only)
///   6. Hinge at propped end: reduces to cantilever
///   7. Three-span with hinges: Gerber system
///   8. Fixed-fixed with hinge: becomes propped cantilever
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Midspan Hinge on Fixed-Roller Beam (Propped Cantilever)
// ================================================================
//
// Fixed at left, roller at right, hinge at midspan.
// 4 restraints, 3 equilibrium + 1 hinge condition → determinate.
// Hinge means M = 0 at midspan. Load on left half.

#[test]
fn validation_hinge_midspan_propped() {
    let l = 8.0;
    let n = 8;
    let p = 10.0;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();

    // Hinge at midspan: end of element n/2 and start of element n/2+1
    let mid_elem = n / 2;
    let elems: Vec<_> = (0..n)
        .map(|i| {
            let he = i + 1 == mid_elem;
            let hs = i + 1 == mid_elem + 1;
            (i + 1, "frame", i + 1, i + 2, 1, 1, hs, he)
        })
        .collect();

    let sups = vec![(1, 1_usize, "fixed"), (2, n_nodes, "rollerX")];

    // Point load at quarter span (on left half)
    let quarter = n / 4 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: quarter, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Moment at hinge should be zero
    let ef_before = results.element_forces.iter().find(|e| e.element_id == mid_elem).unwrap();
    assert!(ef_before.m_end.abs() < 0.5,
        "Hinge moment should be ~0: M_end={:.6}", ef_before.m_end);

    let ef_after = results.element_forces.iter()
        .find(|e| e.element_id == mid_elem + 1).unwrap();
    assert!(ef_after.m_start.abs() < 0.5,
        "Hinge moment should be ~0: M_start={:.6}", ef_after.m_start);

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Hinge propped beam: ΣRy = P");
}

// ================================================================
// 2. Hinge at Fixed End: Reduces to Pinned
// ================================================================
//
// Cantilever with hinge at the fixed end → pinned support.
// With a tip load, this becomes a mechanism (unstable).
// Instead: fixed-pinned beam with hinge at fixed end → SS beam.

#[test]
fn validation_hinge_at_fixed_end() {
    let l = 6.0;
    let n = 8;
    let p = 10.0;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();

    // Hinge at start of element 1 (at the fixed support end)
    let elems: Vec<_> = (0..n)
        .map(|i| {
            let hs = i == 0; // hinge at start of first element
            (i + 1, "frame", i + 1, i + 2, 1, 1, hs, false)
        })
        .collect();

    // Fixed left, roller right
    let sups = vec![(1, 1_usize, "fixed"), (2, n_nodes, "rollerX")];

    // Midspan point load
    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads.clone());
    let results_hinge = linear::solve_2d(&input).unwrap();

    // The hinge at the fixed end means moment = 0 there → effectively pinned-roller = SS beam
    let r_left = results_hinge.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r_left.mz.abs() < 0.1,
        "Hinge at fixed end: moment should be ~0: Mz={:.6}", r_left.mz);

    // Reactions should be like SS beam: R_left = P/2, R_right = P/2
    assert_close(r_left.ry, p / 2.0, 0.02,
        "Hinge at fixed = SS beam: R_left = P/2");
}

// ================================================================
// 3. Gerber Beam: Internal Hinge Makes Determinate
// ================================================================
//
// Two-span continuous beam with hinge at midspan of second span.
// This makes the beam statically determinate.

#[test]
fn validation_gerber_beam() {
    let l1 = 6.0;
    let l2 = 6.0;
    let n_per = 6;
    let q: f64 = -10.0;

    let total_n = n_per * 2;
    let n_nodes = total_n + 1;

    let mut nodes = Vec::new();
    let mut x = 0.0;
    for i in 0..=n_per {
        nodes.push((i + 1, x, 0.0));
        if i < n_per { x += l1 / n_per as f64; }
    }
    for i in 1..=n_per {
        x += l2 / n_per as f64;
        nodes.push((n_per + 1 + i, x, 0.0));
    }

    // Hinge at midspan of second span (between elements n_per + n_per/2 and n_per + n_per/2 + 1)
    let hinge_elem = n_per + n_per / 2;
    let elems: Vec<_> = (0..total_n)
        .map(|i| {
            let he = i + 1 == hinge_elem;
            let hs = i + 1 == hinge_elem + 1;
            (i + 1, "frame", i + 1, i + 2, 1, 1, hs, he)
        })
        .collect();

    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, n_per + 1, "rollerX"),
        (3, n_nodes, "rollerX"),
    ];

    // UDL on both spans
    let mut loads = Vec::new();
    for i in 0..total_n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Moment at hinge should be zero
    let ef_before = results.element_forces.iter().find(|e| e.element_id == hinge_elem).unwrap();
    assert!(ef_before.m_end.abs() < 0.5,
        "Gerber hinge moment: M_end={:.6}", ef_before.m_end);

    // Equilibrium
    let total_load = q.abs() * (l1 + l2);
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02, "Gerber beam: ΣRy = total load");
}

// ================================================================
// 4. Hinged Portal Frame: Changed Moment Distribution
// ================================================================
//
// Portal frame with hinges at column tops (beam-column connections).
// This makes the beam act as simply supported between column tops.

#[test]
fn validation_hinge_portal_frame() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0; // lateral load at top-left

    // Nodes: 1=(0,0), 2=(0,h), 3=(w,h), 4=(w,0)
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];

    // Hinges at beam-column connections:
    // Elem 1 (col left): hinge at end (node 2)
    // Elem 2 (beam): hinge at start (node 2) and end (node 3)
    // Elem 3 (col right): hinge at start (node 3)
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, true),   // col left, hinge at top
        (2, "frame", 2, 3, 1, 1, true, true),     // beam, hinged both ends
        (3, "frame", 3, 4, 1, 1, true, false),    // col right, hinge at top
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: p, fy: 0.0, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Beam moments should be zero at both ends (hinged connections)
    let ef_beam = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(ef_beam.m_start.abs() < 0.1,
        "Hinged beam: M_start should be ~0: {:.6}", ef_beam.m_start);
    assert!(ef_beam.m_end.abs() < 0.1,
        "Hinged beam: M_end should be ~0: {:.6}", ef_beam.m_end);

    // All moment is at column bases
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    // Equilibrium: ΣRx + P = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02, "Hinged portal: ΣRx = -P");

    // With hinges at beam level, columns act as independent cantilevers
    // Each column base moment ≈ R_x × h
    assert!(r1.mz.abs() > 0.1, "Column base should have moment");
}

// ================================================================
// 5. Both Ends Hinged: Truss-Like Behavior
// ================================================================
//
// Frame element with hinges at both ends acts like a truss element
// (carries only axial force, no bending).

#[test]
fn validation_hinge_both_ends_truss_like() {
    let l = 5.0;
    let p = 20.0;

    // Simple beam with both ends hinged element under axial load
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, l, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, true, true), // hinges at both ends
    ];
    let sups = vec![(1, 1_usize, "pinned"), (2, 2, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: p, fy: 0.0, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let ef = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();

    // Axial force should equal applied load
    assert_close(ef.n_start.abs(), p, 0.01,
        "Double hinge: axial force = P");

    // No bending moments (both ends hinged)
    assert!(ef.m_start.abs() < 0.01,
        "Double hinge: M_start should be 0: {:.6}", ef.m_start);
    assert!(ef.m_end.abs() < 0.01,
        "Double hinge: M_end should be 0: {:.6}", ef.m_end);
}

// ================================================================
// 6. Hinge at Propped End: Reduces to Cantilever
// ================================================================
//
// Fixed-roller beam with hinge at roller end.
// The hinge releases moment at the roller (already zero for a roller).
// Actually, let's do: fixed-fixed beam with hinge at right end → propped cantilever.

#[test]
fn validation_hinge_fixed_to_propped() {
    let l = 6.0;
    let n = 8;
    let p = 15.0;
    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();

    // Hinge at end of last element (at the right fixed support)
    let elems: Vec<_> = (0..n)
        .map(|i| {
            let he = i == n - 1; // hinge at end of last element
            (i + 1, "frame", i + 1, i + 2, 1, 1, false, he)
        })
        .collect();

    // Both ends fixed, but hinge releases moment at right → effectively propped cantilever
    let sups = vec![(1, 1_usize, "fixed"), (2, n_nodes, "fixed")];

    // Midspan point load
    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Right support moment should be ~0 (hinge releases it)
    let r_right = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
    assert!(r_right.mz.abs() < 0.5,
        "Hinge at right: moment ~0: Mz={:.6}", r_right.mz);

    // This is now a propped cantilever with midspan load.
    // R_prop = 5P/16, R_fixed = 11P/16 (for center load on propped cantilever)
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_left.ry, 11.0 * p / 16.0, 0.03,
        "Propped cantilever: R_fixed = 11P/16");
    assert_close(r_right.ry, 5.0 * p / 16.0, 0.03,
        "Propped cantilever: R_prop = 5P/16");
}

// ================================================================
// 7. Hinge vs No Hinge: Increased Deflection
// ================================================================
//
// Adding a hinge reduces stiffness → increases deflection.

#[test]
fn validation_hinge_increases_deflection() {
    let l = 6.0;
    let n = 8;
    let p = 10.0;

    // Build two beams: one without hinge, one with hinge at midspan
    let build = |with_hinge: bool| -> f64 {
        let n_nodes = n + 1;
        let elem_len = l / n as f64;
        let nodes: Vec<_> = (0..n_nodes)
            .map(|i| (i + 1, i as f64 * elem_len, 0.0))
            .collect();

        let mid_elem = n / 2;
        let elems: Vec<_> = (0..n)
            .map(|i| {
                let he = with_hinge && i + 1 == mid_elem;
                let hs = with_hinge && i + 1 == mid_elem + 1;
                (i + 1, "frame", i + 1, i + 2, 1, 1, hs, he)
            })
            .collect();

        let sups = vec![(1, 1_usize, "fixed"), (2, n_nodes, "fixed")];
        let mid = n / 2 + 1;
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })];

        let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
        let results = linear::solve_2d(&input).unwrap();
        let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
        d_mid.uy.abs()
    };

    let defl_no_hinge = build(false);
    let defl_with_hinge = build(true);

    assert!(defl_with_hinge > defl_no_hinge,
        "Hinge should increase deflection: {:.6e} > {:.6e}",
        defl_with_hinge, defl_no_hinge);

    // The ratio should be significant (hinge roughly doubles deflection for center load on fixed-fixed)
    let ratio = defl_with_hinge / defl_no_hinge;
    assert!(ratio > 1.5,
        "Hinge deflection ratio: {:.3} should be > 1.5", ratio);
}

// ================================================================
// 8. Hinge Equilibrium Check
// ================================================================
//
// Verify that hinges don't break global equilibrium.
// Three-span beam with hinges at the two interior supports.

#[test]
fn validation_hinge_equilibrium() {
    let l = 4.0;
    let n_per = 4;
    let q: f64 = -12.0;

    let total_n = n_per * 3;
    let n_nodes = total_n + 1;
    let elem_len = l / n_per as f64;

    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();

    // Hinges at interior support nodes
    let sup2_node = n_per + 1;       // node at first interior support
    let sup3_node = 2 * n_per + 1;   // node at second interior support
    let hinge_elem1 = n_per;         // last element of first span
    let hinge_elem2 = 2 * n_per;     // last element of second span

    let elems: Vec<_> = (0..total_n)
        .map(|i| {
            let he = i + 1 == hinge_elem1 || i + 1 == hinge_elem2;
            let hs = i + 1 == hinge_elem1 + 1 || i + 1 == hinge_elem2 + 1;
            (i + 1, "frame", i + 1, i + 2, 1, 1, hs, he)
        })
        .collect();

    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, sup2_node, "rollerX"),
        (3, sup3_node, "rollerX"),
        (4, n_nodes, "rollerX"),
    ];

    let mut loads = Vec::new();
    for i in 0..total_n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium: ΣRy = total load
    let total_load = q.abs() * 3.0 * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02,
        "Hinge equilibrium: ΣRy = total load");

    // Moments at hinges should be zero
    let ef1 = results.element_forces.iter().find(|e| e.element_id == hinge_elem1).unwrap();
    assert!(ef1.m_end.abs() < 0.5,
        "Hinge 1 moment: M_end={:.6}", ef1.m_end);
    let ef2 = results.element_forces.iter().find(|e| e.element_id == hinge_elem2).unwrap();
    assert!(ef2.m_end.abs() < 0.5,
        "Hinge 2 moment: M_end={:.6}", ef2.m_end);
}
