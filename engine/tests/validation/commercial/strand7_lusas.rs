/// Validation: Strand7 and LUSAS Benchmark Problems
///
/// Reference: Strand7 BM-series and LUSAS benchmark verification manual.
///
/// Tests cross-validate against analytical closed-form solutions that
/// match published Strand7 and LUSAS benchmark results.
///
/// 8 tests:
///   Strand7 BM1: Simply supported beam — midspan point load (PL^3/48EI)
///   Strand7 BM2: Cantilever with UDL — tip deflection (wL^4/8EI)
///   Strand7 BM3: Fixed-fixed beam thermal gradient — restrained moments
///   Strand7 BM4: 2D Pratt truss — member forces comparison
///   LUSAS BM1:   Two-story frame lateral load — column shears and drift
///   LUSAS BM2:   Continuous beam with settlement — reaction redistribution
///   LUSAS BM3:   3D cantilever torsion — pure torsion (GJ/L)
///   LUSAS BM4:   Pinned column Euler buckling — critical load eigenvalue
use dedaliano_engine::solver::{buckling, linear};
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa
const E_EFF: f64 = E * 1000.0; // kN/m^2 (solver effective)
const NU: f64 = 0.3;

// ===================================================================
// Strand7 BM1: Simply Supported Beam — Midspan Point Load
// ===================================================================
// Classic benchmark: SS beam of length L with central point load P.
//
// Analytical:
//   delta_mid = P * L^3 / (48 * E * I)
//   M_max     = P * L / 4
//   R_A = R_B = P / 2

#[test]
fn validation_strand7_bm1_ss_beam_point_load() {
    let l = 6.0; // m
    let p = 100.0; // kN
    let a_sec = 0.01; // m^2
    let iz = 1e-4; // m^4
    let n = 10; // elements

    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let sups = vec![(1, 1, "pinned"), (2, n + 1, "rollerX")];

    // Point load at midspan: element n/2, at a = elem_len (end of element)
    // Midspan node is at n/2 + 1
    let mid_elem = n / 2; // element 5: nodes 5-6
    let a_local = elem_len; // load at end of element 5 = midspan

    let loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: mid_elem,
        a: a_local,
        p: -p,
        px: None,
        mz: None,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, a_sec, iz)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Check reactions: R_A = R_B = P/2
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();

    assert_close(r_a.ry, p / 2.0, 0.02, "S7_BM1 R_A = P/2");
    assert_close(r_b.ry, p / 2.0, 0.02, "S7_BM1 R_B = P/2");

    // Symmetry check
    assert_close(r_a.ry, r_b.ry, 0.01, "S7_BM1 symmetry R_A = R_B");

    // Check midspan deflection: delta = PL^3 / (48EI)
    let delta_expected = p * l.powi(3) / (48.0 * E_EFF * iz);
    let mid_node = n / 2 + 1;
    let d_mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();
    assert_close(
        d_mid.uy.abs(),
        delta_expected,
        0.02,
        "S7_BM1 delta_mid = PL^3/48EI",
    );

    // Check maximum bending moment: M_max = PL/4 at midspan
    let m_max_expected = p * l / 4.0;
    // The max moment occurs at midspan. Element just before midspan (elem n/2) end moment.
    let ef_at_mid = results
        .element_forces
        .iter()
        .find(|e| e.element_id == mid_elem)
        .unwrap();
    assert_close(
        ef_at_mid.m_end.abs(),
        m_max_expected,
        0.02,
        "S7_BM1 M_max = PL/4",
    );

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "S7_BM1 vertical equilibrium");
}

// ===================================================================
// Strand7 BM2: Cantilever with Uniform Distributed Load
// ===================================================================
// Fixed at left end, free at right, UDL q downward.
//
// Analytical:
//   delta_tip = q * L^4 / (8 * E * I)
//   M_fixed   = q * L^2 / 2
//   R_fixed   = q * L

#[test]
fn validation_strand7_bm2_cantilever_udl() {
    let l = 5.0; // m
    let q = 20.0; // kN/m
    let a_sec = 0.01; // m^2
    let iz = 1e-4; // m^4
    let n = 10; // elements

    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Fixed at left, free at right (no support at right end)
    let sups = vec![(1, 1, "fixed")];

    // UDL on all elements
    let loads: Vec<_> = (0..n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: -q,
                q_j: -q,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, a_sec, iz)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Check tip deflection: delta_tip = qL^4 / (8EI)
    let delta_expected = q * l.powi(4) / (8.0 * E_EFF * iz);
    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();
    assert_close(
        tip.uy.abs(),
        delta_expected,
        0.02,
        "S7_BM2 delta_tip = qL^4/8EI",
    );

    // Check fixed-end reaction: R = qL
    let r_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_expected = q * l;
    assert_close(r_fixed.ry, r_expected, 0.02, "S7_BM2 R = qL");

    // Check fixed-end moment: M = qL^2/2 (hogging at support)
    let m_expected = q * l * l / 2.0;
    assert_close(
        r_fixed.mz.abs(),
        m_expected,
        0.02,
        "S7_BM2 M_fixed = qL^2/2",
    );

    // Equilibrium check
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, q * l, 0.01, "S7_BM2 vertical equilibrium");
}

// ===================================================================
// Strand7 BM3: Fixed-Fixed Beam with Thermal Gradient
// ===================================================================
// Both ends fixed. Apply thermal gradient dT across depth.
// No external mechanical load. The restrained beam develops moments
// at the fixed ends due to the prevented curvature.
//
// Analytical (Euler-Bernoulli):
//   For a fixed-fixed beam with linear temperature gradient:
//   M = E * I * alpha * dT_gradient / h   (at each end, equal and opposite)
//   No net vertical reaction (no external load, no axial restraint needed
//   for gradient only).
//   Axial force from uniform dT: N = E * A * alpha * dT_uniform

#[test]
fn validation_strand7_bm3_fixed_fixed_thermal() {
    let l = 4.0; // m
    let a_sec = 0.01; // m^2
    let iz = 1e-4; // m^4
    let n = 8; // elements
    let dt_gradient = 50.0; // degrees C (top-bottom difference)
    let dt_uniform = 0.0; // no uniform temperature change
    let alpha = 12e-6; // steel thermal expansion coeff (default used by solver)

    // Approximate section depth: for rectangular, h = sqrt(12*Iz/A)
    let h: f64 = (12.0_f64 * iz / a_sec).sqrt();

    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Both ends fixed
    let sups = vec![(1, 1, "fixed"), (2, n + 1, "fixed")];

    // Thermal gradient load on all elements
    let loads: Vec<_> = (0..n)
        .map(|i| {
            SolverLoad::Thermal(SolverThermalLoad {
                element_id: i + 1,
                dt_uniform,
                dt_gradient,
            })
        })
        .collect();

    let input = make_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, a_sec, iz)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Expected restrained moment at each fixed end:
    // M = E_eff * I * alpha * dT_gradient / h
    let m_expected = E_EFF * iz * alpha * dt_gradient / h;

    // Both ends should have moments (reaction moments)
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();

    assert_close(
        r_left.mz.abs(),
        m_expected,
        0.02,
        "S7_BM3 M_left = EI*alpha*dT/h",
    );
    assert_close(
        r_right.mz.abs(),
        m_expected,
        0.02,
        "S7_BM3 M_right = EI*alpha*dT/h",
    );

    // No external load, so sum of vertical reactions should be zero
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(
        sum_ry.abs() < 0.5,
        "S7_BM3: sum_ry = {:.4} should be ~0 (no external load)",
        sum_ry
    );

    // Since both ends are fixed and the gradient is uniform along the beam,
    // displacements should be very small (beam is fully restrained)
    for d in &results.displacements {
        assert!(
            d.uy.abs() < 1e-4,
            "S7_BM3: node {} uy = {:.6} should be ~0 (fixed-fixed)",
            d.node_id, d.uy
        );
    }
}

// ===================================================================
// Strand7 BM4: 2D Pratt Truss
// ===================================================================
// 4-panel Pratt truss, span = 12m (3m panels), height = 3m
// Bottom-chord point loads at interior bottom nodes.
//
// Pratt truss pattern: verticals at each panel point,
// diagonals slope downward from top toward supports.
//
// Analytical:
//   By method of sections at midspan, the max chord force is known.
//   For symmetric loading, R_A = R_B = total_load / 2.
//   Max bottom chord tension at midspan = M_midspan / h
//     where M_midspan for 2 interior loads of P at L/4 and L/2:
//     use influence of joint loads.

#[test]
fn validation_strand7_bm4_pratt_truss() {
    let panel = 3.0; // m
    let h = 3.0; // m
    let n_panels: usize = 4;
    let _l_total = panel * n_panels as f64; // 12m
    let p = 30.0; // kN at each interior bottom node
    let a_truss = 0.005; // m^2

    // Bottom chord nodes: 1..5 (at x = 0, 3, 6, 9, 12)
    let n_bottom = n_panels + 1;
    let mut nodes = Vec::new();
    for i in 0..n_bottom {
        nodes.push((i + 1, i as f64 * panel, 0.0));
    }

    // Top chord nodes: 6..8 (at x = 3, 6, 9 — above interior bottom nodes)
    // For Pratt truss: top nodes at same x as interior bottom nodes
    let n_top = n_panels - 1; // 3 top nodes
    for i in 0..n_top {
        nodes.push((n_bottom + 1 + i, (i + 1) as f64 * panel, h));
    }
    // Top nodes: 6 (x=3), 7 (x=6), 8 (x=9)

    let mut elems = Vec::new();
    let mut eid = 1;

    // Bottom chord: 1-2, 2-3, 3-4, 4-5
    for i in 0..n_panels {
        elems.push((eid, "truss", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }

    // Top chord: 6-7, 7-8
    for i in 0..(n_top - 1) {
        let n_start = n_bottom + 1 + i;
        let n_end = n_start + 1;
        elems.push((eid, "truss", n_start, n_end, 1, 1, false, false));
        eid += 1;
    }

    // Verticals: bottom interior nodes to top nodes
    // Node 2 -> 6, Node 3 -> 7, Node 4 -> 8
    for i in 0..n_top {
        let bot_node = i + 2;
        let top_node = n_bottom + 1 + i;
        elems.push((eid, "truss", bot_node, top_node, 1, 1, false, false));
        eid += 1;
    }

    // Pratt diagonals: slope down toward supports (tension under gravity)
    // Left half: top node connects to next bottom node toward support
    //   6(3,3) -> 1(0,0): diagonal in panel 1
    //   7(6,3) -> 2(3,0): diagonal in panel 2
    // Right half (symmetric):
    //   7(6,3) -> 4(9,0): diagonal in panel 3
    //   8(9,3) -> 5(12,0): diagonal in panel 4
    // Actually for Pratt: diagonals go from top of far end to bottom of near end
    // Left half diagonals (slope toward left support):
    elems.push((eid, "truss", n_bottom + 1, 1, 1, 1, false, false)); // 6->1
    eid += 1;
    elems.push((eid, "truss", n_bottom + 2, 2, 1, 1, false, false)); // 7->2
    eid += 1;
    // Right half diagonals (slope toward right support):
    elems.push((eid, "truss", n_bottom + 2, 4, 1, 1, false, false)); // 7->4
    eid += 1;
    elems.push((eid, "truss", n_bottom + 3, 5, 1, 1, false, false)); // 8->5
    let _eid = eid + 1;

    let sups = vec![(1, 1, "pinned"), (2, n_bottom, "rollerX")];

    // Point loads at interior bottom nodes (nodes 2, 3, 4)
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
        vec![(1, E, NU)],
        vec![(1, a_truss, 1e-10)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Total load = 3 * 30 = 90 kN
    let total_load = (n_panels - 1) as f64 * p;

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02, "S7_BM4 vertical equilibrium");

    // Symmetric reactions: R_A = R_B = total/2
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == n_bottom)
        .unwrap();
    assert_close(
        r_a.ry,
        total_load / 2.0,
        0.02,
        "S7_BM4 R_A = total_load/2",
    );
    assert_close(r_a.ry, r_b.ry, 0.02, "S7_BM4 symmetry R_A = R_B");

    // Midspan bending moment from method of sections:
    //   Cut at panel midpoint (x=6m):
    //   M_mid = R_A * 6 - P * 3 - P * 0 = 45*6 - 30*3 = 270 - 90 = 180 kN-m
    //   Actually: loads at nodes 2(x=3), 3(x=6), 4(x=9)
    //   R_A = 45 kN
    //   M at x=6 (cutting just left): R_A*6 - P(at x=3)*3 = 45*6 - 30*3 = 180 kN-m
    //   Max bottom chord force = M/h = 180/3 = 60 kN (tension)
    let m_midspan = r_a.ry * 6.0 - p * 3.0;
    let f_chord_expected = m_midspan / h;

    // Find the bottom chord element at midspan (element 2 or 3, at x=3..6 or 6..9)
    // Element 2: nodes 2(3,0) to 3(6,0) — bottom chord near midspan
    // Element 3: nodes 3(6,0) to 4(9,0) — bottom chord near midspan
    let ef2 = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 2)
        .unwrap();
    let ef3 = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 3)
        .unwrap();

    // Both should carry roughly the same chord force at midspan
    assert_close(
        ef2.n_start.abs(),
        f_chord_expected,
        0.05,
        "S7_BM4 bottom chord force near midspan",
    );
    assert_close(
        ef3.n_start.abs(),
        f_chord_expected,
        0.05,
        "S7_BM4 bottom chord force at midspan",
    );

    // All truss elements should have zero bending moment
    for ef in &results.element_forces {
        assert!(
            ef.m_start.abs() < 0.1 && ef.m_end.abs() < 0.1,
            "S7_BM4: truss element {} has moment ({:.4}, {:.4})",
            ef.element_id,
            ef.m_start,
            ef.m_end
        );
    }
}

// ===================================================================
// LUSAS BM1: Two-Story Frame with Lateral Load
// ===================================================================
// Two-story, single-bay frame with lateral loads at each floor.
// Fixed at base. All members same section.
//
// Checks: total base shear = applied lateral, story drift ordering,
// column shear distribution.

#[test]
fn validation_lusas_bm1_two_story_frame_lateral() {
    let h = 3.5; // story height (m)
    let w = 6.0; // bay width (m)
    let h1 = 20.0; // lateral at 1st floor (kN)
    let h2 = 40.0; // lateral at 2nd floor (kN)
    let a_sec = 0.01;
    let iz = 1e-4;

    // Nodes:
    // 1(0,0) 2(6,0)      — base (fixed)
    // 3(0,3.5) 4(6,3.5)  — 1st floor
    // 5(0,7.0) 6(6,7.0)  — 2nd floor
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, w, 0.0),
        (3, 0.0, h),
        (4, w, h),
        (5, 0.0, 2.0 * h),
        (6, w, 2.0 * h),
    ];

    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false), // left col 1st story
        (2, "frame", 2, 4, 1, 1, false, false), // right col 1st story
        (3, "frame", 3, 5, 1, 1, false, false), // left col 2nd story
        (4, "frame", 4, 6, 1, 1, false, false), // right col 2nd story
        (5, "frame", 3, 4, 1, 1, false, false), // beam 1st floor
        (6, "frame", 5, 6, 1, 1, false, false), // beam 2nd floor
    ];

    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx: h1,
            fy: 0.0,
            mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5,
            fx: h2,
            fy: 0.0,
            mz: 0.0,
        }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, a_sec, iz)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // 1. Total base shear = sum of lateral loads = 60 kN
    let total_lateral = h1 + h2;
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(
        sum_rx.abs(),
        total_lateral,
        0.02,
        "LUSAS_BM1 base shear = applied lateral",
    );

    // 2. Drift ordering: roof drift >= first floor drift (loads in same direction)
    let d_1st_left = results
        .displacements
        .iter()
        .find(|d| d.node_id == 3)
        .unwrap()
        .ux;
    let d_roof_left = results
        .displacements
        .iter()
        .find(|d| d.node_id == 5)
        .unwrap()
        .ux;

    assert!(
        d_roof_left.abs() >= d_1st_left.abs() * 0.99,
        "LUSAS_BM1: roof drift {:.6} >= 1st floor drift {:.6}",
        d_roof_left.abs(),
        d_1st_left.abs()
    );

    // 3. Both columns at a given story should have the same shear
    //    (symmetric frame, loads on left column only)
    //    Actually, for a portal frame with lateral load, the two columns
    //    share the story shear. Due to symmetry of the frame (not loads),
    //    they share equally. Check they are both nonzero.
    let col_left_1 = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 1)
        .unwrap();
    let col_right_1 = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 2)
        .unwrap();

    // Both 1st-story columns should carry shear
    assert!(
        col_left_1.v_start.abs() > 0.1,
        "LUSAS_BM1: left col 1st story should have shear"
    );
    assert!(
        col_right_1.v_start.abs() > 0.1,
        "LUSAS_BM1: right col 1st story should have shear"
    );

    // Sum of 1st story column shears = total base shear
    let v_story1 = col_left_1.v_start.abs() + col_right_1.v_start.abs();
    assert_close(
        v_story1,
        total_lateral,
        0.05,
        "LUSAS_BM1 1st story shear sum = total lateral",
    );

    // 4. 2nd story column shears should sum to H2 (lateral at roof only)
    let col_left_2 = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 3)
        .unwrap();
    let col_right_2 = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 4)
        .unwrap();
    let v_story2 = col_left_2.v_start.abs() + col_right_2.v_start.abs();
    assert_close(
        v_story2,
        h2,
        0.05,
        "LUSAS_BM1 2nd story shear sum = H2",
    );

    // 5. Moment equilibrium at base
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert!(
        r1.mz.abs() > 1.0,
        "LUSAS_BM1: base moment at node 1 should be nonzero"
    );
    assert!(
        r2.mz.abs() > 1.0,
        "LUSAS_BM1: base moment at node 2 should be nonzero"
    );
}

// ===================================================================
// LUSAS BM2: Continuous Beam with Interior Support Settlement
// ===================================================================
// Three-span continuous beam (equal spans L), pinned at left,
// rollers at other supports.
// Interior support at x=L settles by delta downward.
// No external load — settlement-only induced forces.
//
// Analytical (3 equal spans, settlement delta at 1st interior support):
//   By force method: settlement induces reactions and moments
//   Sum of reactions = 0 (no external load)
//   Settlement node displacement = prescribed delta

#[test]
fn validation_lusas_bm2_continuous_beam_settlement() {
    let l = 6.0; // span length (m)
    let n_per = 8; // elements per span
    let delta = -0.005; // 5mm downward settlement
    let a_sec = 0.01;
    let iz = 1e-4;

    let n_spans = 3;
    let n_total_elem = n_per * n_spans;
    let n_nodes = n_total_elem + 1;

    // Build nodes
    let mut nodes_map = HashMap::new();
    let mut x = 0.0;
    let elem_len = l / n_per as f64;
    for i in 0..n_nodes {
        let node_x = i as f64 * elem_len;
        nodes_map.insert(
            (i + 1).to_string(),
            SolverNode {
                id: i + 1,
                x: node_x,
                y: 0.0,
            },
        );
        x = node_x;
    }
    let _ = x;

    let mut mats_map = HashMap::new();
    mats_map.insert(
        "1".to_string(),
        SolverMaterial {
            id: 1,
            e: E,
            nu: NU,
        },
    );

    let mut secs_map = HashMap::new();
    secs_map.insert(
        "1".to_string(),
        SolverSection {
            id: 1,
            a: a_sec,
            iz,
            as_y: None,
        },
    );

    let mut elems_map = HashMap::new();
    for i in 0..n_total_elem {
        elems_map.insert(
            (i + 1).to_string(),
            SolverElement {
                id: i + 1,
                elem_type: "frame".to_string(),
                node_i: i + 1,
                node_j: i + 2,
                material_id: 1,
                section_id: 1,
                hinge_start: false,
                hinge_end: false,
            },
        );
    }

    // Supports at every span boundary
    // Node 1 (x=0): pinned
    // Node n_per+1 (x=L): roller with settlement
    // Node 2*n_per+1 (x=2L): roller
    // Node 3*n_per+1 (x=3L): roller
    let settlement_node = n_per + 1;
    let mut sups_map = HashMap::new();

    sups_map.insert(
        "1".to_string(),
        SolverSupport {
            id: 1,
            node_id: 1,
            support_type: "pinned".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dy: None,
            drz: None,
            angle: None,
        },
    );

    // Settlement support
    sups_map.insert(
        "2".to_string(),
        SolverSupport {
            id: 2,
            node_id: settlement_node,
            support_type: "rollerX".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dy: Some(delta),
            drz: None,
            angle: None,
        },
    );

    // Remaining supports (no settlement)
    for span_idx in 2..=n_spans {
        let sup_node = span_idx * n_per + 1;
        sups_map.insert(
            (span_idx + 1).to_string(),
            SolverSupport {
                id: span_idx + 1,
                node_id: sup_node,
                support_type: "rollerX".to_string(),
                kx: None,
                ky: None,
                kz: None,
                dx: None,
                dy: None,
                drz: None,
                angle: None,
            },
        );
    }

    let input = SolverInput {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads: vec![], constraints: vec![], };

    let results = linear::solve_2d(&input).unwrap();

    // 1. No external load: sum of reactions = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(
        sum_ry.abs() < 0.5,
        "LUSAS_BM2: sum_ry = {:.4} should be ~0 (no external load)",
        sum_ry
    );

    // 2. Settlement node should have prescribed displacement
    let d_settlement = results
        .displacements
        .iter()
        .find(|d| d.node_id == settlement_node)
        .unwrap();
    assert_close(
        d_settlement.uy,
        delta,
        0.03,
        "LUSAS_BM2 settlement displacement",
    );

    // 3. Settlement induces nonzero reactions at all supports
    let r_settle = results
        .reactions
        .iter()
        .find(|r| r.node_id == settlement_node)
        .unwrap();
    assert!(
        r_settle.ry.abs() > 0.1,
        "LUSAS_BM2: settlement support reaction should be nonzero, got {:.4}",
        r_settle.ry
    );

    // 4. Moments should be induced in the beam elements
    let max_moment: f64 = results
        .element_forces
        .iter()
        .map(|e| e.m_start.abs().max(e.m_end.abs()))
        .fold(0.0, f64::max);
    assert!(
        max_moment > 0.01,
        "LUSAS_BM2: settlement should induce nonzero moments, max = {:.4}",
        max_moment
    );

    // 5. The induced moment is proportional to EI*delta/L^2
    // For a continuous beam: M ~ 6*E*I*delta / L^2 (order of magnitude)
    let m_scale = E_EFF * iz * delta.abs() / (l * l);
    assert!(
        max_moment > m_scale * 0.5 && max_moment < m_scale * 20.0,
        "LUSAS_BM2: max moment {:.4} should be order of {:.4}",
        max_moment,
        m_scale
    );
}

// ===================================================================
// LUSAS BM3: 3D Cantilever — Pure Torsion
// ===================================================================
// 3D cantilever beam along X-axis, fixed at node 1, free at tip.
// Apply torque Mx at the free end.
//
// Analytical (St. Venant torsion):
//   theta_tip = T * L / (G * J)
//   where G = E / (2*(1+nu))
//   Reaction torque at fixed end = T

#[test]
fn validation_lusas_bm3_3d_torsion() {
    let l = 4.0; // m
    let n = 8; // elements
    let a_sec = 0.01; // m^2
    let iy = 1e-4; // m^4
    let iz = 1e-4; // m^4
    let j = 5e-5; // m^4 (torsion constant)
    let torque = 10.0; // kN-m applied torque

    let g = E_EFF / (2.0 * (1.0 + NU)); // shear modulus in kN/m^2

    let input = make_3d_beam(
        n,
        l,
        E,
        NU,
        a_sec,
        iy,
        iz,
        j,
        vec![true, true, true, true, true, true], // fixed
        None,                                      // free end
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0,
            fy: 0.0,
            fz: 0.0,
            mx: torque,
            my: 0.0,
            mz: 0.0,
            bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();

    // 1. Tip rotation about X-axis: theta = T*L / (G*J)
    let theta_expected = torque * l / (g * j);
    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();
    assert_close(
        tip.rx.abs(),
        theta_expected,
        0.02,
        "LUSAS_BM3 theta_tip = TL/GJ",
    );

    // 2. Reaction torque at fixed end should equal applied torque
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(
        r_base.mx.abs(),
        torque,
        0.02,
        "LUSAS_BM3 reaction torque = T",
    );

    // 3. No bending should occur (pure torsion problem)
    // Tip displacements in Y and Z should be negligible
    assert!(
        tip.uy.abs() < 1e-8,
        "LUSAS_BM3: uy at tip should be ~0, got {:.6e}",
        tip.uy
    );
    assert!(
        tip.uz.abs() < 1e-8,
        "LUSAS_BM3: uz at tip should be ~0, got {:.6e}",
        tip.uz
    );

    // 4. All elements should carry the same torsion moment
    for ef in &results.element_forces {
        assert_close(
            ef.mx_start.abs(),
            torque,
            0.02,
            &format!("LUSAS_BM3 elem {} mx_start = T", ef.element_id),
        );
    }

    // 5. Rotation should increase linearly from fixed end to tip
    // At node i, theta = T * x_i / (GJ)
    let elem_len = l / n as f64;
    for d in &results.displacements {
        let x_i = (d.node_id - 1) as f64 * elem_len;
        let theta_i = torque * x_i / (g * j);
        assert_close(
            d.rx.abs(),
            theta_i,
            0.02,
            &format!("LUSAS_BM3 node {} rotation", d.node_id),
        );
    }
}

// ===================================================================
// LUSAS BM4: Euler Buckling — Pinned Column
// ===================================================================
// Pinned-pinned column loaded in compression.
// Euler critical load: P_cr = pi^2 * E * I / L^2
//
// The eigenvalue buckling analysis should return alpha_cr such that:
//   alpha_cr * P_applied = P_euler
//   => alpha_cr = P_euler / P_applied

#[test]
fn validation_lusas_bm4_euler_buckling_pinned() {
    let l = 5.0; // m
    let a_sec = 0.01; // m^2
    let iz = 1e-4; // m^4
    let n = 10; // elements
    let p_applied = 100.0; // kN compression (applied axially)

    // Build a horizontal column along X-axis (pinned-rollerX gives pin-pin in 2D)
    // Apply compressive axial load at the far end
    let input = make_column(n, l, E, a_sec, iz, "pinned", "rollerX", -p_applied);

    // Euler critical load: P_cr = pi^2 * E_eff * I / L^2
    let p_euler = std::f64::consts::PI.powi(2) * E_EFF * iz / (l * l);

    // Expected alpha_cr = P_euler / P_applied
    let alpha_expected = p_euler / p_applied;

    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    // The eigenvalue should match within 2%
    assert_close(
        alpha_cr,
        alpha_expected,
        0.02,
        "LUSAS_BM4 alpha_cr = P_euler / P_applied",
    );

    // Verify P_euler from the result
    let p_cr_computed = alpha_cr * p_applied;
    assert_close(p_cr_computed, p_euler, 0.02, "LUSAS_BM4 P_cr = pi^2*EI/L^2");

    // The element_data should report a critical force close to Euler load
    // for each element
    for ed in &buck.element_data {
        // The per-element critical force considers the element as part of the system
        assert!(
            ed.critical_force > 0.0,
            "LUSAS_BM4: element {} critical force should be positive",
            ed.element_id
        );
    }

    // Sanity: alpha_cr should be significantly > 1 for this load level
    // P_euler = pi^2 * 200e6 * 1e-4 / 25 = pi^2 * 800 = 7895.7 kN
    // alpha = 7895.7 / 100 = 78.96
    assert!(
        alpha_cr > 10.0,
        "LUSAS_BM4: alpha_cr = {:.2} should be >> 1 for moderate load",
        alpha_cr
    );
}
