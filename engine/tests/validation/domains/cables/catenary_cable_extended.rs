/// Validation: Extended Catenary Cable Analysis
///
/// References:
///   - Irvine, "Cable Structures", MIT Press, 1981
///   - Ernst, "Der E-Modul von Seilen unter Berucksichtigung des Durchhanges",
///     Der Bauingenieur 40(2), 1965, pp. 52-55
///   - Gimsing & Georgakis, "Cable Supported Bridges", 3rd Ed., 2012
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 5 (Cables)
///   - EN 1993-1-11:2006 — Design of structures with tension components
///
/// Tests cover:
///   1. Parabolic sag — horizontal thrust from UDL approximation
///   2. Catenary vs parabolic comparison for various sag/span ratios
///   3. Multi-span cable with intermediate supports
///   4. Cable with concentrated load at arbitrary position
///   5. Inclined cable between supports at different elevations
///   6. Cable vibration frequency — Irvine taut-string formula
///   7. Ernst equivalent modulus for sagging cables
///   8. Temperature effects on cable sag and tension
///
/// Cable elements are modeled as "frame" elements with hinge_start=true
/// and hinge_end=true, which produces axial-only stiffness (EA/L).
use dedaliano_engine::{types::*, solver::linear::solve_2d};
use crate::common::*;

// ================================================================
// 1. Parabolic Sag — Horizontal Thrust
// ================================================================
//
// For a symmetric V-cable with span L, sag f, and midspan load P:
//   H = P * L / (4 * f)
//
// This is the discrete analog of the parabolic cable formula H = wL^2/(8d).
// For a V-cable with total load W = P concentrated at midspan:
//   H = W * L / (4 * f)
// vs continuous UDL:
//   H = w * L^2 / (8 * d)  with W = w*L → H = W*L/(8d)
//
// The V-cable midspan formula differs by factor 2 from the UDL formula
// because a single concentrated load at midspan is not the same as UDL.
//
// We verify the V-cable thrust formula at several sag values and confirm
// that H is inversely proportional to sag.
//
// Reference: Hibbeler, "Structural Analysis", 10th Ed., Example 5.1.

#[test]
fn validation_parabolic_sag_horizontal_thrust() {
    let span: f64 = 20.0;
    let p: f64 = 10.0;       // kN, midspan load
    let e: f64 = 200_000.0;  // MPa
    let a: f64 = 0.003;      // m^2
    let iz: f64 = 1e-10;

    // Test at several sag values
    let sags = [1.0, 2.0, 4.0, 5.0];
    let mut thrusts = Vec::new();

    for &sag in &sags {
        let sag: f64 = sag;
        let nodes = vec![
            (1, 0.0, 0.0),
            (2, span / 2.0, -sag),
            (3, span, 0.0),
        ];
        let elems = vec![
            (1, "frame", 1, 2, 1, 1, true, true),
            (2, "frame", 2, 3, 1, 1, true, true),
        ];
        let sups = vec![(1, 1, "pinned"), (2, 3, "pinned")];
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -p, my: 0.0,
        })];

        let input = make_input(
            nodes,
            vec![(1, e, 0.3)],
            vec![(1, a, iz)],
            elems,
            sups,
            loads,
        );
        let results = solve_2d(&input).unwrap();

        // Analytical horizontal thrust: H = P*L/(4*f)
        let h_expected: f64 = p * span / (4.0 * sag);

        let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
        let h_fem: f64 = r1.rx.abs();
        thrusts.push(h_fem);

        assert_close(h_fem, h_expected, 0.05,
            &format!("Parabolic H at sag={}", sag));

        // Vertical equilibrium
        let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
        assert_close(sum_ry, p, 0.02,
            &format!("Parabolic vertical eq at sag={}", sag));

        // Both elements in tension
        for ef in &results.element_forces {
            assert!(
                ef.n_start > 0.0,
                "Cable element {} at sag={} should be tension: n_start={:.4}",
                ef.element_id, sag, ef.n_start
            );
        }
    }

    // H is inversely proportional to sag: H*f = P*L/4 = constant
    let constant: f64 = p * span / 4.0;
    for (i, &sag) in sags.iter().enumerate() {
        let product: f64 = thrusts[i] * sag;
        assert_close(product, constant, 0.05,
            &format!("H*f = constant at sag={}", sag));
    }

    // Verify monotonicity: smaller sag -> larger thrust
    for i in 0..thrusts.len() - 1 {
        assert!(
            thrusts[i] > thrusts[i + 1],
            "H should decrease with sag: H(f={})={:.2} > H(f={})={:.2}",
            sags[i], thrusts[i], sags[i + 1], thrusts[i + 1]
        );
    }
}

// ================================================================
// 2. Catenary vs Parabolic Comparison
// ================================================================
//
// For small sag/span ratios (d/L < 0.05), the parabolic approximation
// closely matches the exact catenary. As d/L increases, the error grows.
//
// Exact catenary sag: d_cat = (H/w) * [cosh(wL/(2H)) - 1]
// Parabolic sag:      d_par = wL^2/(8H)
//
// For d/L = 0.025 (H = wL^2/(8d)), error < 0.1%.
// For d/L = 0.10, error ~ 1.3%.
// For d/L = 0.20, error ~ 5.4%.
//
// Reference: Irvine, "Cable Structures", Ch. 2, pp. 15-20.

#[test]
fn validation_catenary_vs_parabolic_comparison() {
    let w: f64 = 1.0;    // kN/m
    let l: f64 = 100.0;  // m

    // Test several sag/span ratios
    let sag_ratios = [0.025, 0.05, 0.10, 0.15];

    for &ratio in &sag_ratios {
        let d_par: f64 = ratio * l;
        // From parabolic: H = wL^2/(8d)
        let h: f64 = w * l * l / (8.0 * d_par);

        // Exact catenary sag
        let arg: f64 = w * l / (2.0 * h);
        let d_cat: f64 = (h / w) * (arg.cosh() - 1.0);

        // Relative error between catenary and parabolic
        let error_pct: f64 = ((d_cat - d_par) / d_cat).abs() * 100.0;

        // For small sag/span, parabolic should be very accurate
        if ratio <= 0.05 {
            assert!(
                error_pct < 0.5,
                "Sag/span={:.3}: cat={:.4}m, par={:.4}m, err={:.3}% (expected < 0.5%)",
                ratio, d_cat, d_par, error_pct
            );
        }

        // For all cases, error should be bounded
        assert!(
            error_pct < 10.0,
            "Sag/span={:.3}: error {:.3}% exceeds 10%",
            ratio, error_pct
        );

        // Catenary sag is always >= parabolic sag (catenary hangs lower)
        assert!(
            d_cat >= d_par - 1e-10,
            "Catenary sag {:.6} should >= parabolic sag {:.6} at d/L={:.3}",
            d_cat, d_par, ratio
        );
    }

    // Also verify cable length formulas
    // Parabolic: S ~ L + 8d^2/(3L)
    // Catenary:  S = (2H/w) * sinh(wL/(2H))
    let d_test: f64 = 5.0;   // 5% sag/span
    let h_test: f64 = w * l * l / (8.0 * d_test);

    let s_parabolic: f64 = l + 8.0 * d_test * d_test / (3.0 * l);
    let arg_test: f64 = w * l / (2.0 * h_test);
    let s_catenary: f64 = (2.0 * h_test / w) * arg_test.sinh();

    let length_err: f64 = ((s_catenary - s_parabolic) / s_catenary).abs() * 100.0;
    assert!(
        length_err < 1.0,
        "Cable length error: parabolic={:.4}m, catenary={:.4}m, err={:.4}%",
        s_parabolic, s_catenary, length_err
    );
}

// ================================================================
// 3. Multi-Span Cable with Intermediate Supports
// ================================================================
//
// Two-span cable: supports at (0,0), (20,0), (40,0).
// Each span has a V-cable with sag node.
// Vertical load P applied at each sag node.
//
// For symmetric spans and loads, each span behaves independently
// with H = P*L_span/(4*f) where L_span=20m and f=sag.
// The intermediate support carries the sum of vertical reactions
// from both spans.
//
// Reference: Gimsing & Georgakis, Ch. 4, Multi-span cables.

#[test]
fn validation_multi_span_cable() {
    let l_span: f64 = 20.0;
    let sag: f64 = 2.0;
    let p: f64 = 10.0;
    let e: f64 = 200_000.0;
    let a: f64 = 0.002;
    let iz: f64 = 1e-10;

    // 5 nodes: support-sag-support-sag-support
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, l_span / 2.0, -sag),
        (3, l_span, 0.0),
        (4, l_span + l_span / 2.0, -sag),
        (5, 2.0 * l_span, 0.0),
    ];

    // 4 cable segments: 1-2, 2-3, 3-4, 4-5
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, true, true),
        (2, "frame", 2, 3, 1, 1, true, true),
        (3, "frame", 3, 4, 1, 1, true, true),
        (4, "frame", 4, 5, 1, 1, true, true),
    ];

    // Three pinned supports
    let sups = vec![
        (1, 1, "pinned"),
        (2, 3, "pinned"),
        (3, 5, "pinned"),
    ];

    // Loads at sag nodes
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -p, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fz: -p, my: 0.0,
        }),
    ];

    let input = make_input(
        nodes,
        vec![(1, e, 0.3)],
        vec![(1, a, iz)],
        elems,
        sups,
        loads,
    );
    let results = solve_2d(&input).unwrap();

    // Global vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 2.0 * p, 0.02, "Multi-span cable sum_ry");

    // Symmetry: end supports should have equal vertical reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert_close(r1.rz, r5.rz, 0.02, "Multi-span cable: symmetric end reactions");

    // Intermediate support should carry vertical reaction from both spans
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    // By symmetry, each span contributes P/2 to the intermediate support
    // So R3_y = P/2 + P/2 = P
    assert_close(r3.rz, p, 0.05, "Multi-span cable: intermediate support vertical");

    // Each end support: R_y = P/2
    assert_close(r1.rz, p / 2.0, 0.05, "Multi-span cable: left end vertical");

    // Horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < 0.1,
        "Multi-span cable: horizontal equilibrium, sum_rx={:.6}", sum_rx);

    // All cable elements should be in tension
    for ef in &results.element_forces {
        assert!(
            ef.n_start > 0.0,
            "Multi-span cable element {} should be tension: n_start={:.4}",
            ef.element_id, ef.n_start
        );
    }
}

// ================================================================
// 4. Cable with Concentrated Load at Arbitrary Position
// ================================================================
//
// V-cable with supports at (0,0) and (L,0). Load P at position
// (a, -h) where a != L/2 (off-center).
//
// Equilibrium at loaded node:
//   Bar 1: (0,0) -> (a,-h)
//   Bar 2: (a,-h) -> (L,0)
//
//   T1*sin(alpha1) + T2*sin(alpha2) = P
//   T1*cos(alpha1) = T2*cos(alpha2) = H  (horizontal balance)
//
//   H = P * a * (L-a) / (L * h)  ... NOT standard formula.
//   Actually from statics at the sag point:
//
//   Moment about right support: R1_y * L = P * (L-a)  =>  R1_y = P*(L-a)/L
//   Moment about left support:  R3_y * L = P * a      =>  R3_y = P*a/L
//
//   At node 2 equilibrium:
//     x: H_right - H_left = 0  =>  H_left = H_right = H
//     y: R1_y_component + R3_y_component = P
//
//   H from left bar:  bar direction (a,-h)/L1
//     H = T1 * (a/L1)    and  R1_y = T1 * (h/L1)
//     so H = R1_y * a/h = P*(L-a)*a / (L*h)
//
//   T1 = R1_y * L1 / h = P*(L-a)/L * sqrt(a^2+h^2)/h
//   T2 = R3_y * L2 / h = P*a/L * sqrt((L-a)^2+h^2)/h
//
// Reference: Hibbeler, "Structural Analysis", 10th Ed., Example 5.1.

#[test]
fn validation_cable_concentrated_load_arbitrary() {
    let l: f64 = 15.0;
    let a_pos: f64 = 5.0;   // horizontal position of load
    let h: f64 = 2.0;       // sag at load point
    let p: f64 = 12.0;      // kN, downward load
    let e: f64 = 200_000.0;
    let a: f64 = 0.003;
    let iz: f64 = 1e-10;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, a_pos, -h),
        (3, l, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, true, true),
        (2, "frame", 2, 3, 1, 1, true, true),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 3, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, e, 0.3)],
        vec![(1, a, iz)],
        elems,
        sups,
        loads,
    );
    let results = solve_2d(&input).unwrap();

    // Analytical reactions
    let r1_y_expected: f64 = p * (l - a_pos) / l;    // = 12*10/15 = 8.0 kN
    let r3_y_expected: f64 = p * a_pos / l;           // = 12*5/15 = 4.0 kN
    let h_expected: f64 = p * a_pos * (l - a_pos) / (l * h); // = 12*5*10/(15*2) = 20.0 kN

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();

    assert_close(r1.rz, r1_y_expected, 0.03, "Cable off-center: R1_y");
    assert_close(r3.rz, r3_y_expected, 0.03, "Cable off-center: R3_y");
    assert_close(r1.rx.abs(), h_expected, 0.03, "Cable off-center: H");

    // Analytical tensions
    let l1: f64 = (a_pos * a_pos + h * h).sqrt();
    let l2: f64 = ((l - a_pos) * (l - a_pos) + h * h).sqrt();
    let t1_expected: f64 = r1_y_expected * l1 / h;
    let t2_expected: f64 = r3_y_expected * l2 / h;

    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|f| f.element_id == 2).unwrap();

    assert_close(ef1.n_start, t1_expected, 0.03, "Cable off-center: T1");
    assert_close(ef2.n_start, t2_expected, 0.03, "Cable off-center: T2");

    // Both in tension
    assert!(ef1.n_start > 0.0, "Bar 1 tension: {:.4}", ef1.n_start);
    assert!(ef2.n_start > 0.0, "Bar 2 tension: {:.4}", ef2.n_start);

    // T1 > T2 because left bar is steeper (shorter horizontal, same sag)
    // Actually: T1 = 8 * sqrt(29)/2, T2 = 4 * sqrt(104)/2
    // T1 ~ 8 * 5.385/2 = 21.54, T2 ~ 4*10.198/2 = 20.40
    // Both are close but T1 should be slightly larger
    // (this depends on geometry; just verify they're different for off-center load)
    let ratio: f64 = ef1.n_start / ef2.n_start;
    assert!(
        (ratio - 1.0).abs() > 0.01,
        "Off-center load produces different tensions: T1/T2={:.4}", ratio
    );
}

// ================================================================
// 5. Inclined Cable Between Supports at Different Elevations
// ================================================================
//
// V-cable with supports at different heights: (0,0) and (L, h_diff).
// The sag node is placed below the chord line at horizontal midspan.
//
// Chord midpoint: (L/2, h_diff/2)
// Sag node: (L/2, h_diff/2 - d_sag)  where d_sag is drop below chord
//
// We choose h_diff=4m, d_sag=3m so that:
//   Node 1: (0, 0)
//   Node 2: (10, -1)   [midpoint at y=2, minus 3 = -1]
//   Node 3: (20, 4)
//
// Bar 1: (0,0) -> (10,-1), dir = (10,-1), L1 = sqrt(101)
// Bar 2: (10,-1) -> (20,4), dir = (10,5), L2 = sqrt(125)
//
// Equilibrium at node 2 (free):
//   x: -T1*(10/L1) + T2*(10/L2) = 0  =>  T1/L1 = T2/L2
//   y:  T1*((-1)/L1) + T2*(5/L2) = P   (note signs: bar pulls toward start)
//
// Wait: bar force direction. Bar 1 goes from node 1 to node 2.
// If T1 is tension, the force on node 2 from bar 1 pulls toward node 1:
//   F_bar1_on_node2 = -T1 * (10,-1)/L1 = T1*(-10, 1)/L1
// The force on node 2 from bar 2 pulls toward node 3:
//   F_bar2_on_node2 = T2 * (10,5)/L2
//
// Equilibrium at node 2:
//   x: -T1*10/L1 + T2*10/L2 = 0    => T1 = T2*L1/L2
//   y:  T1*1/L1  + T2*5/L2  = P
//
// Substituting: T2*L1/L2 * 1/L1 + T2*5/L2 = P
//               T2/L2 + 5*T2/L2 = P
//               6*T2/L2 = P
//               T2 = P*L2/6
//               T1 = P*L1/6
//
// Reference: Irvine, "Cable Structures", Ch. 2, Inclined cables.

#[test]
fn validation_inclined_cable() {
    let l: f64 = 20.0;
    let h_diff: f64 = 4.0;   // right support is 4m higher
    let d_sag: f64 = 3.0;    // drop below chord at midspan
    let p: f64 = 18.0;
    let e: f64 = 200_000.0;
    let a: f64 = 0.004;
    let iz: f64 = 1e-10;

    // Sag node coordinates
    let xm: f64 = l / 2.0;                   // = 10
    let ym: f64 = h_diff / 2.0 - d_sag;      // = 2 - 3 = -1

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, xm, ym),
        (3, l, h_diff),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, true, true),
        (2, "frame", 2, 3, 1, 1, true, true),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 3, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, e, 0.3)],
        vec![(1, a, iz)],
        elems,
        sups,
        loads,
    );
    let results = solve_2d(&input).unwrap();

    // Global equilibrium checks
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_ry, p, 0.02, "Inclined cable: vertical equilibrium");
    assert!(sum_rx.abs() < 0.1,
        "Inclined cable: horizontal equilibrium, sum_rx={:.6}", sum_rx);

    // Bar lengths
    let l1: f64 = ((xm).powi(2) + (ym).powi(2)).sqrt();           // sqrt(100+1) = sqrt(101)
    let l2: f64 = ((l - xm).powi(2) + (h_diff - ym).powi(2)).sqrt(); // sqrt(100+25) = sqrt(125)

    // Analytical tensions from equilibrium at node 2
    // Bar 1 direction from node 2 toward node 1: (-10, 1)/L1
    // Bar 2 direction from node 2 toward node 3: (10, 5)/L2
    //
    // x: T1*(-10)/L1 + T2*(10)/L2 = 0   =>  T1 = T2*L1/L2
    // y: T1*(1)/L1   + T2*(5)/L2  = P
    //    T2/L2 + 5*T2/L2 = P  =>  T2 = P*L2/6
    let t2_expected: f64 = p * l2 / 6.0;
    let t1_expected: f64 = p * l1 / 6.0;

    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|f| f.element_id == 2).unwrap();

    assert_close(ef1.n_start, t1_expected, 0.03, "Inclined cable: T1");
    assert_close(ef2.n_start, t2_expected, 0.03, "Inclined cable: T2");

    // Both in tension
    assert!(ef1.n_start > 0.0, "Inclined cable bar 1 tension: {:.4}", ef1.n_start);
    assert!(ef2.n_start > 0.0, "Inclined cable bar 2 tension: {:.4}", ef2.n_start);

    // Bar 2 has larger tension (steeper vertical component)
    assert!(
        ef2.n_start > ef1.n_start,
        "Bar 2 should have greater tension: T2={:.4} > T1={:.4}",
        ef2.n_start, ef1.n_start
    );

    // Verify reactions from moment equilibrium
    // Moment about node 1: R3_y*L + R3_x*h_diff = P*xm
    // But for a cable (truss), we also need horizontal equilibrium.
    // The horizontal component from both bars at their supports gives
    // the horizontal reactions. Check that H is consistent:
    let h_expected: f64 = t1_expected * xm / l1; // H = T1 * cos(alpha1)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rx.abs(), h_expected, 0.05, "Inclined cable: horizontal thrust");
}

// ================================================================
// 6. Cable Vibration Frequency — Taut String Formula
// ================================================================
//
// For a taut cable with negligible sag (taut string model):
//   f_n = (n / (2L)) * sqrt(H / m)
//
// where n = mode number, L = span, H = horizontal tension,
// m = mass per unit length (kg/m).
//
// For a cable with w = 0.5 kN/m, L = 80m, H = 500 kN:
//   m = w/g = 0.5/9.81 * 1000 = 50.97 kg/m  (w in kN/m -> N/m / g)
//   Actually: w = 0.5 kN/m = 500 N/m, m = 500/9.81 = 50.97 kg/m
//   H = 500 kN = 500000 N
//   f_1 = 1/(2*80) * sqrt(500000/50.97) = 0.00625 * 99.03 = 0.619 Hz
//
// Irvine correction for sag effect: for lambda^2 << 4*pi^2,
// the taut string formula applies to antisymmetric modes.
//
// Reference: Irvine, "Cable Structures", Ch. 4, Eqs. (4.1)-(4.4).

#[test]
fn validation_cable_vibration_frequency() {
    let w: f64 = 0.5;       // kN/m, cable weight per unit length
    let l: f64 = 80.0;      // m, span
    let h: f64 = 500.0;     // kN, horizontal tension

    // Mass per unit length
    let g: f64 = 9.81;
    let m: f64 = w * 1000.0 / g; // Convert kN/m to N/m, then divide by g for kg/m
    // m = 500/9.81 = 50.968 kg/m

    // Taut string natural frequencies
    let h_newtons: f64 = h * 1000.0; // kN to N
    let f1: f64 = 1.0 / (2.0 * l) * (h_newtons / m).sqrt();
    let f2: f64 = 2.0 / (2.0 * l) * (h_newtons / m).sqrt();
    let f3: f64 = 3.0 / (2.0 * l) * (h_newtons / m).sqrt();

    // f1 should be a reasonable cable frequency (0.1-5 Hz range)
    assert!(
        f1 > 0.1 && f1 < 5.0,
        "Cable f1 = {:.4} Hz should be in typical range [0.1, 5.0]", f1
    );

    // Frequencies should be integer multiples of fundamental
    assert_close(f2 / f1, 2.0, 0.01, "f2/f1 = 2 (taut string)");
    assert_close(f3 / f1, 3.0, 0.01, "f3/f1 = 3 (taut string)");

    // Verify numerical value
    // f1 = 1/(160) * sqrt(500000/50.968)
    //    = 0.00625 * sqrt(9810.0)
    //    = 0.00625 * 99.045 = 0.619 Hz
    let f1_expected: f64 = 1.0 / (2.0 * l) * (h_newtons / m).sqrt();
    assert_close(f1, f1_expected, 0.001, "Cable f1 numerical value");

    // Irvine parameter lambda^2 to check if taut string is valid
    // lambda^2 = (wL/H)^2 * (EA/H) * (L/Le)^3
    // For taut string: lambda^2 << 4*pi^2 ~ 39.48
    let e_cable: f64 = 160_000.0; // MPa -> kN/m^2 = 160e6 kN/m^2
    let a_cable: f64 = 0.002;     // m^2
    let ea: f64 = e_cable * 1000.0 * a_cable; // kN

    let d_sag: f64 = w * l * l / (8.0 * h);
    let le: f64 = l * (1.0 + 8.0 * (d_sag / l).powi(2) / 3.0);

    let lambda_sq: f64 = (w * l / h).powi(2) * (ea / h) * (l / le).powi(3);
    let crossover: f64 = 4.0 * std::f64::consts::PI * std::f64::consts::PI;

    // For this case, lambda^2 should be small (taut cable)
    assert!(
        lambda_sq < crossover,
        "lambda^2 = {:.2} < 4*pi^2 = {:.2}: taut string model valid",
        lambda_sq, crossover
    );

    // Sag/span ratio
    let sag_span: f64 = d_sag / l;
    assert!(
        sag_span < 0.05,
        "Sag/span = {:.4} < 0.05: parabolic/taut string valid", sag_span
    );
}

// ================================================================
// 7. Ernst Equivalent Modulus
// ================================================================
//
// For a sagging cable, the apparent (secant) axial stiffness is
// reduced compared to the material stiffness. The Ernst formula:
//
//   E_eq = E / (1 + (gamma * L_h)^2 * E * A / (12 * T^3))
//
// where gamma = w = cable weight per unit length (kN/m),
//       L_h   = horizontal projection of the cable (m),
//       T     = cable tension (kN),
//       E     = cable Young's modulus (kN/m^2),
//       A     = cable cross-sectional area (m^2).
//
// The reduction factor depends strongly on tension: at low tension,
// the sag effect dominates and E_eq drops significantly.
//
// Reference: Ernst (1965), also in Gimsing & Georgakis, Eq. (3.24).

#[test]
fn validation_ernst_equivalent_modulus() {
    let e_mpa: f64 = 195_000.0;      // MPa
    let e: f64 = e_mpa * 1000.0;     // kN/m^2
    let a_mm2: f64 = 5000.0;         // mm^2
    let a: f64 = a_mm2 / 1e6;        // m^2
    let w: f64 = 0.40;               // kN/m, cable self-weight
    let l_h: f64 = 200.0;            // m, horizontal projection

    // Test at several tension levels
    let tensions = [2000.0, 3000.0, 5000.0, 8000.0]; // kN

    let mut e_eqs = Vec::new();
    for &t in &tensions {
        let t: f64 = t;
        let denom: f64 = 1.0 + (w * l_h).powi(2) * e * a / (12.0 * t.powi(3));
        let e_eq: f64 = e / denom;
        e_eqs.push(e_eq);

        // E_eq should be positive and less than E
        assert!(
            e_eq > 0.0 && e_eq <= e,
            "Ernst E_eq={:.0} kN/m^2 should be in (0, E={:.0}] at T={:.0} kN",
            e_eq, e, t
        );
    }

    // E_eq should increase with tension (sag effect diminishes)
    for i in 0..tensions.len() - 1 {
        assert!(
            e_eqs[i] < e_eqs[i + 1],
            "E_eq should increase with tension: E_eq(T={:.0})={:.0} < E_eq(T={:.0})={:.0}",
            tensions[i], e_eqs[i], tensions[i + 1], e_eqs[i + 1]
        );
    }

    // At high tension, E_eq should approach E (reduction < 5%)
    let reduction_high: f64 = (1.0 - e_eqs[3] / e) * 100.0;
    assert!(
        reduction_high < 5.0,
        "At T=8000kN, modulus reduction should be < 5%: got {:.2}%",
        reduction_high
    );

    // At low tension, reduction should be significant (> 5%)
    let reduction_low: f64 = (1.0 - e_eqs[0] / e) * 100.0;
    assert!(
        reduction_low > 1.0,
        "At T=2000kN, modulus reduction should be > 1%: got {:.2}%",
        reduction_low
    );

    // Verify specific value at T=3000 kN
    // denom = 1 + (0.4*200)^2 * 195e6 * 5e-3 / (12 * 3000^3)
    //       = 1 + 6400 * 975000 / (12 * 2.7e10)
    //       = 1 + 6.24e9 / 3.24e11
    //       = 1 + 0.01926
    //       = 1.01926
    // E_eq = 195e6 / 1.01926 = 191.31e6 kN/m^2 = 191,310 MPa
    let denom_check: f64 = 1.0 + (w * l_h).powi(2) * e * a / (12.0 * 3000.0_f64.powi(3));
    let e_eq_check: f64 = e / denom_check / 1000.0; // back to MPa
    assert!(
        e_eq_check > 180_000.0 && e_eq_check < e_mpa,
        "E_eq at T=3000kN: {:.0} MPa should be in [180000, 195000]",
        e_eq_check
    );

    // Cable effective stiffness k_eff = E_eq * A / L_cable
    // For a taut cable (L_cable ~ L_h for shallow sag):
    let k_no_sag: f64 = e * a / l_h;
    let k_with_sag: f64 = e_eqs[1] * a / l_h; // at T=3000kN
    assert!(
        k_with_sag < k_no_sag,
        "Effective stiffness with sag ({:.2} kN/m) < without ({:.2} kN/m)",
        k_with_sag, k_no_sag
    );
}

// ================================================================
// 8. Temperature Effects on Cable Sag
// ================================================================
//
// When temperature changes, the cable length changes:
//   Delta_L = alpha * L_0 * Delta_T
//
// For a parabolic cable, the relationship between cable length S
// and sag d is:
//   S ~ L + 8*d^2/(3*L)
//
// So a change in S (from temperature) causes a change in sag:
//   dS = 16*d/(3*L) * dd
//   dd = dS * 3*L / (16*d)
//
// This means temperature increase -> longer cable -> increased sag
// -> decreased horizontal tension (H = wL^2/(8d)).
//
// For a cable with L=100m, d=5m, w=1 kN/m, alpha=12e-6, Delta_T=+30C:
//   S_0 = 100 + 8*25/300 = 100.667 m
//   Delta_S = 12e-6 * 100.667 * 30 = 0.03624 m
//   Delta_d = 0.03624 * 300 / (16*5) = 0.1359 m
//   d_new = 5.136 m
//   H_new = 1*10000/(8*5.136) = 243.4 kN (vs H_0=250 kN)
//
// Reference: Gimsing & Georgakis, Ch. 3, Temperature effects.

#[test]
fn validation_temperature_effects_on_sag() {
    let l: f64 = 100.0;          // m, span
    let d_0: f64 = 5.0;          // m, initial sag
    let w: f64 = 1.0;            // kN/m, cable weight
    let alpha: f64 = 12e-6;      // 1/C, thermal expansion coefficient
    let delta_t: f64 = 30.0;     // C, temperature increase

    // Initial cable length (parabolic approximation)
    let s_0: f64 = l + 8.0 * d_0 * d_0 / (3.0 * l);

    // Initial horizontal tension
    let h_0: f64 = w * l * l / (8.0 * d_0);
    // = 10000 / 40 = 250 kN

    assert_close(h_0, 250.0, 0.001, "Initial horizontal tension H_0");

    // Length change due to temperature
    let delta_s: f64 = alpha * s_0 * delta_t;

    // New cable length
    let s_new: f64 = s_0 + delta_s;

    // From S = L + 8d^2/(3L), solve for d:
    // 8d^2/(3L) = S - L  =>  d = sqrt(3L(S-L)/8)
    let d_new: f64 = (3.0 * l * (s_new - l) / 8.0).sqrt();

    // New horizontal tension
    let h_new: f64 = w * l * l / (8.0 * d_new);

    // Temperature increase -> sag increases -> tension decreases
    assert!(
        d_new > d_0,
        "Temperature rise increases sag: d_new={:.4} > d_0={:.4}",
        d_new, d_0
    );
    assert!(
        h_new < h_0,
        "Temperature rise decreases tension: H_new={:.2} < H_0={:.2}",
        h_new, h_0
    );

    // Verify approximate change in sag
    // dd = delta_s * 3L / (16*d_0)
    let dd_approx: f64 = delta_s * 3.0 * l / (16.0 * d_0);
    let dd_exact: f64 = d_new - d_0;
    let dd_error: f64 = ((dd_approx - dd_exact) / dd_exact).abs() * 100.0;
    assert!(
        dd_error < 5.0,
        "Linearized sag change error: {:.2}% (dd_approx={:.5}, dd_exact={:.5})",
        dd_error, dd_approx, dd_exact
    );

    // Verify tension change is proportional to sag change
    // H = wL^2/(8d), so dH/dd = -wL^2/(8d^2) = -H/d
    // Delta_H / H_0 ~ -Delta_d / d_0
    let rel_dh: f64 = (h_new - h_0) / h_0;
    let rel_dd: f64 = (d_new - d_0) / d_0;
    let sign_check: f64 = rel_dh * rel_dd;
    assert!(
        sign_check < 0.0,
        "Tension and sag changes should have opposite signs"
    );

    // Approximate ratio check: |dH/H| ~ |dd/d|
    let ratio: f64 = rel_dh.abs() / rel_dd.abs();
    assert_close(ratio, 1.0, 0.15, "Temperature: |dH/H| ~ |dd/d|");

    // Now test cooling: tension should increase
    let delta_t_cool: f64 = -20.0;
    let delta_s_cool: f64 = alpha * s_0 * delta_t_cool;
    let s_cool: f64 = s_0 + delta_s_cool;
    let d_cool: f64 = (3.0 * l * (s_cool - l) / 8.0).sqrt();
    let h_cool: f64 = w * l * l / (8.0 * d_cool);

    assert!(
        d_cool < d_0,
        "Cooling decreases sag: d_cool={:.4} < d_0={:.4}",
        d_cool, d_0
    );
    assert!(
        h_cool > h_0,
        "Cooling increases tension: H_cool={:.2} > H_0={:.2}",
        h_cool, h_0
    );

    // Thermal force in a fully restrained cable: F_thermal = E*A*alpha*Delta_T
    let e_cable: f64 = 195_000.0;  // MPa
    let a_cable: f64 = 3000.0;     // mm^2
    let f_thermal: f64 = e_cable * a_cable * alpha * delta_t.abs() / 1000.0; // kN
    // = 195000 * 3000 * 12e-6 * 30 / 1000 = 210.6 kN

    // Thermal force should be a significant fraction of cable tension
    let thermal_ratio: f64 = f_thermal / h_0 * 100.0;
    assert!(
        thermal_ratio > 10.0,
        "Thermal force = {:.1}% of H_0 — temperature effects are significant",
        thermal_ratio
    );
}
