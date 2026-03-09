/// Validation: Extended Hibbeler-Style Textbook Problems
///
/// References:
///   - R.C. Hibbeler, "Structural Analysis", 10th Ed.
///   - Additional problems covering:
///     1. Triangular (linear) distributed load on SS beam
///     2. Fixed-fixed beam with UDL (reactions + deflection)
///     3. Cantilever with two point loads (superposition)
///     4. Three-span continuous beam equilibrium
///     5. SS beam with point load on element (mid-element load)
///     6. Propped cantilever with center point load
///     7. Portal frame with gravity loads (vertical equilibrium)
///     8. Cantilever with linearly varying load (triangular)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Simply-Supported Beam with Triangular Distributed Load
// ================================================================
//
// SS beam, L = 10m, triangular load: q varies from 0 at A to w_max at B.
// RA = wL/6, RB = wL/3.
// M_max at x = L/sqrt(3) from left = wL²/(9*sqrt(3)).
// delta_max = 0.01304 * w * L^4 / (EI)   [exact coeff = 0.01304]

#[test]
fn validation_hibbeler_ext_triangular_load_ss_beam() {
    let l = 10.0;
    let n = 20; // fine mesh for accuracy with varying load
    let w_max: f64 = 12.0; // kN/m at right end
    let elem_len = l / n as f64;

    // Triangular load: q(x) = w_max * x / L
    // On element i (from x_i to x_{i+1}): q_i = w_max * x_i / L, q_j = w_max * x_{i+1} / L
    let mut loads = Vec::new();
    for i in 0..n {
        let x_i = i as f64 * elem_len;
        let x_j = (i + 1) as f64 * elem_len;
        let qi = -w_max * x_i / l;
        let qj = -w_max * x_j / l;
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: qi,
            q_j: qj,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let rb = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap()
        .ry;

    // RA = wL/6 = 12*10/6 = 20
    // RB = wL/3 = 12*10/3 = 40
    assert_close(ra, w_max * l / 6.0, 0.02, "Triangular load: RA = wL/6");
    assert_close(rb, w_max * l / 3.0, 0.02, "Triangular load: RB = wL/3");

    // Total load = wL/2 = 60
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(
        sum_ry,
        w_max * l / 2.0,
        0.02,
        "Triangular load: total reaction = wL/2",
    );
}

// ================================================================
// 2. Fixed-Fixed Beam with UDL: Reactions and Deflection
// ================================================================
//
// Fixed-fixed beam, UDL w, span L.
// RA = RB = wL/2, MA = MB = wL²/12.
// delta_max at midspan = wL⁴/(384EI).

#[test]
fn validation_hibbeler_ext_fixed_fixed_udl() {
    let l = 8.0;
    let n = 10;
    let q: f64 = -15.0;
    let e_eff: f64 = E * 1000.0;
    let w: f64 = q.abs();

    let mut loads = Vec::new();
    for i in 1..=n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rb = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();

    // Each reaction = wL/2
    assert_close(ra.ry, w * l / 2.0, 0.02, "Fixed-fixed UDL: RA = wL/2");
    assert_close(rb.ry, w * l / 2.0, 0.02, "Fixed-fixed UDL: RB = wL/2");

    // End moments = wL²/12
    assert_close(
        ra.mz.abs(),
        w * l * l / 12.0,
        0.02,
        "Fixed-fixed UDL: MA = wL²/12",
    );
    assert_close(
        rb.mz.abs(),
        w * l * l / 12.0,
        0.02,
        "Fixed-fixed UDL: MB = wL²/12",
    );

    // Midspan deflection = wL⁴/(384EI)
    let delta_exact: f64 = w * l.powi(4) / (384.0 * e_eff * IZ);
    let mid = n / 2 + 1;
    let d_mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid)
        .unwrap();
    assert_close(
        d_mid.uy.abs(),
        delta_exact,
        0.03,
        "Fixed-fixed UDL: delta = wL⁴/(384EI)",
    );
}

// ================================================================
// 3. Cantilever with Two Point Loads (Superposition)
// ================================================================
//
// Cantilever L = 6m, P1 = 10 kN at x = 3m (mid), P2 = 5 kN at x = 6m (tip).
// Tip deflection by superposition:
//   delta_P1_at_tip = P1*a²*(3L-a)/(6EI) with a=3, L=6
//                   = 10*9*(18-3)/(6*EI) = 10*9*15/(6*EI) = 1350/(6*EI)
//   delta_P2_at_tip = P2*L³/(3EI) = 5*216/(3*EI) = 360/EI
// Total: (1350/6 + 360)/EI = (225 + 360)/EI = 585/EI
// Reaction at fixed end: R = P1 + P2 = 15, M = P1*3 + P2*6 = 60.

#[test]
fn validation_hibbeler_ext_cantilever_two_loads() {
    let l = 6.0;
    let n = 6; // 1m elements, load at node 4 (x=3) and node 7 (x=6)
    let p1 = 10.0;
    let p2 = 5.0;
    let e_eff: f64 = E * 1000.0;
    let a_dist: f64 = 3.0; // distance to P1

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, // x = 3m
            fx: 0.0,
            fy: -p1,
            mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, // x = 6m (tip)
            fx: 0.0,
            fy: -p2,
            mz: 0.0,
        }),
    ];

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Fixed-end reactions
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.ry, p1 + p2, 0.02, "Cantilever 2 loads: R = P1+P2 = 15");
    assert_close(
        r.mz.abs(),
        p1 * a_dist + p2 * l,
        0.02,
        "Cantilever 2 loads: M = P1*a + P2*L = 60",
    );

    // Tip deflection by superposition
    let delta_p1: f64 =
        p1 * a_dist.powi(2) * (3.0 * l - a_dist) / (6.0 * e_eff * IZ);
    let delta_p2: f64 = p2 * l.powi(3) / (3.0 * e_eff * IZ);
    let delta_total = delta_p1 + delta_p2;

    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();
    assert_close(
        tip.uy.abs(),
        delta_total,
        0.02,
        "Cantilever 2 loads: tip deflection by superposition",
    );
}

// ================================================================
// 4. Three-Span Continuous Beam: Equilibrium Check
// ================================================================
//
// Three equal spans L = 5m each, UDL w = 8 kN/m on all spans.
// Total load = 3 * w * L = 120 kN.
// By symmetry, R_A = R_D (end supports), R_B = R_C (interior).
// Sum of reactions = total load.

#[test]
fn validation_hibbeler_ext_three_span_continuous() {
    let span = 5.0;
    let n_per = 5;
    let q: f64 = -8.0;
    let w: f64 = q.abs();

    let total_elems = n_per * 3;
    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(&[span, span, span], n_per, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total reaction = total load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_load = 3.0 * w * span;
    assert_close(
        sum_ry,
        total_load,
        0.02,
        "3-span continuous: sum Ry = 3wL = 120",
    );

    // Symmetry: R_A = R_D (node 1 and node 3*n_per+1)
    let n_total_nodes = 3 * n_per + 1;
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let rd = results
        .reactions
        .iter()
        .find(|r| r.node_id == n_total_nodes)
        .unwrap()
        .ry;
    assert_close(ra, rd, 0.02, "3-span symmetric: RA = RD");

    // Symmetry: R_B = R_C (interior supports)
    let node_b = n_per + 1;
    let node_c = 2 * n_per + 1;
    let rb = results
        .reactions
        .iter()
        .find(|r| r.node_id == node_b)
        .unwrap()
        .ry;
    let rc = results
        .reactions
        .iter()
        .find(|r| r.node_id == node_c)
        .unwrap()
        .ry;
    assert_close(rb, rc, 0.02, "3-span symmetric: RB = RC");

    // For 3 equal spans with UDL:
    // By three-moment equation: RA = RD = 0.4*wL = 16, RB = RC = 1.1*wL = 44
    // Total: 2*16 + 2*44 = 120 (checks out)
    assert_close(ra, 0.4 * w * span, 0.03, "3-span: RA = 0.4wL");
    assert_close(rb, 1.1 * w * span, 0.03, "3-span: RB = 1.1wL");
}

// ================================================================
// 5. SS Beam with Point Load on Element (at midspan)
// ================================================================
//
// SS beam L = 8m, single point load P = 24 kN at midspan.
// RA = RB = P/2 = 12 kN.
// M_max at center = PL/4 = 48 kN*m.
// delta_max = PL³/(48EI).

#[test]
fn validation_hibbeler_ext_ss_midspan_point_load() {
    let l = 8.0;
    let n = 8;
    let p = 24.0;
    let e_eff: f64 = E * 1000.0;

    let mid = n / 2 + 1; // node 5 at x = 4m
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let rb = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap()
        .ry;
    assert_close(ra, p / 2.0, 0.02, "SS midspan P: RA = P/2 = 12");
    assert_close(rb, p / 2.0, 0.02, "SS midspan P: RB = P/2 = 12");

    // Midspan deflection = PL³/(48EI)
    let delta_exact: f64 = p * l.powi(3) / (48.0 * e_eff * IZ);
    let d_mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid)
        .unwrap();
    assert_close(
        d_mid.uy.abs(),
        delta_exact,
        0.02,
        "SS midspan P: delta = PL³/(48EI)",
    );

    // Moment at midspan from element ending at mid node
    let ef = results
        .element_forces
        .iter()
        .find(|e| e.element_id == n / 2)
        .unwrap();
    assert_close(
        ef.m_end.abs(),
        p * l / 4.0,
        0.02,
        "SS midspan P: M_max = PL/4 = 48",
    );
}

// ================================================================
// 6. Propped Cantilever with Center Point Load
// ================================================================
//
// Fixed at A, roller at B, span L = 10m, P at center (x = L/2).
// By force method:
//   RB = 5P/16, RA = 11P/16, MA = 3PL/16.
// delta at load point = 7PL³/(768EI).

#[test]
fn validation_hibbeler_ext_propped_cantilever_center_load() {
    let l = 10.0;
    let n = 10;
    let p = 16.0; // chose 16 for clean fractions
    let e_eff: f64 = E * 1000.0;

    let mid = n / 2 + 1; // node 6 at x = 5m
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // RA = 11P/16, RB = 5P/16
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rb = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();

    assert_close(
        ra.ry,
        11.0 * p / 16.0,
        0.02,
        "Propped cant center P: RA = 11P/16",
    );
    assert_close(
        rb.ry,
        5.0 * p / 16.0,
        0.02,
        "Propped cant center P: RB = 5P/16",
    );

    // Fixed-end moment MA = 3PL/16
    assert_close(
        ra.mz.abs(),
        3.0 * p * l / 16.0,
        0.02,
        "Propped cant center P: MA = 3PL/16",
    );

    // Deflection at load point = 7PL³/(768EI)
    let delta_exact: f64 = 7.0 * p * l.powi(3) / (768.0 * e_eff * IZ);
    let d_mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid)
        .unwrap();
    assert_close(
        d_mid.uy.abs(),
        delta_exact,
        0.03,
        "Propped cant center P: delta = 7PL³/(768EI)",
    );
}

// ================================================================
// 7. Portal Frame with Gravity Loads: Vertical Equilibrium
// ================================================================
//
// Portal frame h = 5m, w = 8m, fixed bases.
// Gravity P = 20 kN at each top node (downward).
// Vertical equilibrium: sum Ry = 2P = 40 kN.
// By symmetry: each base reaction Ry = P = 20 kN.
// No lateral load => sum Rx = 0.

#[test]
fn validation_hibbeler_ext_portal_gravity_only() {
    let h = 5.0;
    let w = 8.0;
    let p = 20.0;

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, -p);
    let results = linear::solve_2d(&input).unwrap();

    // Vertical equilibrium: sum Ry = 2P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(
        sum_ry,
        2.0 * p,
        0.02,
        "Portal gravity: sum Ry = 2P = 40 kN",
    );

    // By symmetry, each base carries P
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r1.ry, p, 0.02, "Portal gravity: R1y = P = 20");
    assert_close(r4.ry, p, 0.02, "Portal gravity: R4y = P = 20");

    // No lateral load: sum Rx = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(
        sum_rx.abs() < 0.1,
        "Portal gravity: sum Rx ~ 0, got {}",
        sum_rx
    );

    // Symmetry: equal sway (should be zero or near-zero)
    let d2 = results
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap();
    let d3 = results
        .displacements
        .iter()
        .find(|d| d.node_id == 3)
        .unwrap();
    assert!(
        d2.ux.abs() < 1e-6 && d3.ux.abs() < 1e-6,
        "Portal gravity: no lateral sway: d2.ux={:.6e}, d3.ux={:.6e}",
        d2.ux,
        d3.ux
    );
}

// ================================================================
// 8. Cantilever with Linearly Varying Load (Zero at Tip)
// ================================================================
//
// Cantilever L = 5m, fixed at left, free at right.
// Triangular load: q = w_max at fixed end (x=0), q = 0 at tip (x=L).
// Total load W = w_max * L / 2 = 10 * 5 / 2 = 25 kN.
// Reaction: R = W = 25 kN.
// Fixed-end moment: M = w_max * L² / 6 = 10 * 25 / 6 = 41.667 kN*m.
// (centroid of triangular load is at L/3 from fixed end)
// Tip deflection: delta = w_max * L⁴ / (30 * EI).

#[test]
fn validation_hibbeler_ext_cantilever_triangular_load() {
    let l = 5.0;
    let n = 10;
    let w_max: f64 = 10.0;
    let e_eff: f64 = E * 1000.0;
    let elem_len = l / n as f64;

    // Load varies linearly from w_max at x=0 to 0 at x=L
    let mut loads = Vec::new();
    for i in 0..n {
        let x_i = i as f64 * elem_len;
        let x_j = (i + 1) as f64 * elem_len;
        let qi = -w_max * (1.0 - x_i / l);
        let qj = -w_max * (1.0 - x_j / l);
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: qi,
            q_j: qj,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reaction R = wL/2 = 25 kN
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let total_load = w_max * l / 2.0;
    assert_close(
        r.ry,
        total_load,
        0.02,
        "Cantilever triangular: R = wL/2 = 25",
    );

    // Fixed-end moment M = w_max * L² / 6
    let m_exact = w_max * l * l / 6.0;
    assert_close(
        r.mz.abs(),
        m_exact,
        0.03,
        "Cantilever triangular: M = w_max*L²/6 = 41.667",
    );

    // Tip deflection = w_max * L⁴ / (30 * EI)
    let delta_exact: f64 = w_max * l.powi(4) / (30.0 * e_eff * IZ);
    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();
    assert_close(
        tip.uy.abs(),
        delta_exact,
        0.03,
        "Cantilever triangular: delta = w_max*L⁴/(30EI)",
    );
}
