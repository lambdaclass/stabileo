/// Validation: Extended Cross-Section Property Effects on Structural Behavior
///
/// References:
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed.
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed.
///   - Hibbeler, "Structural Analysis", 10th Ed.
///
/// Tests verify additional cross-section property effects:
///   1. Cantilever deflection inversely proportional to Iz (analytical PL^3/3EI)
///   2. Propped cantilever reaction redistribution with varying Iz ratio between spans
///   3. Axial-only truss member: Iz has no effect on axial displacement
///   4. Fixed-fixed beam: tripling Iz reduces midspan deflection by factor 3
///   5. Two-bay portal frame: relative column/beam Iz controls drift distribution
///   6. Quadrupling area quarters axial displacement (multi-bar)
///   7. Cantilever tip rotation inversely proportional to Iz (analytical PL^2/2EI)
///   8. Symmetric frame: equal Iz yields equal column moments under symmetric load
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;

// ================================================================
// 1. Cantilever Tip Deflection Inversely Proportional to Iz
// ================================================================
//
// Fixed-free cantilever, L=5m, point load P=-20kN at tip, 4 elements.
// delta = PL^3 / (3EI). Analytical check + ratio for two Iz values.

#[test]
fn validation_cross_section_ext_cantilever_deflection_vs_iz() {
    let l = 5.0;
    let n = 4;
    let p = -20.0;
    let iz1 = 1e-4_f64;
    let iz2 = 3e-4_f64;
    let e_eff = E * 1000.0;

    let input1 = make_beam(n, l, E, A, iz1, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: p, my: 0.0,
        })]);
    let input2 = make_beam(n, l, E, A, iz2, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: p, my: 0.0,
        })]);

    let res1 = linear::solve_2d(&input1).unwrap();
    let res2 = linear::solve_2d(&input2).unwrap();

    let d1 = res1.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz;
    let d2 = res2.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz;

    // Analytical: delta = PL^3 / (3EI)
    let delta_exact1 = p * l.powi(3) / (3.0 * e_eff * iz1);
    assert_close(d1, delta_exact1, 0.02, "cantilever tip deflection Iz1 analytical");

    // Ratio: d1/d2 = Iz2/Iz1 = 3.0
    let ratio = d1 / d2;
    assert_close(ratio, 3.0, 0.02, "cantilever deflection ratio Iz2/Iz1");
}

// ================================================================
// 2. Propped Cantilever: Reaction Depends on Relative Span Stiffness
// ================================================================
//
// Fixed at left, roller at right, L=6m, UDL w=-12 kN/m, 6 elements.
// This is statically indeterminate (1 degree).
// Case A: uniform Iz=1e-4.
// Case B: right half has Iz=4e-4 (4x stiffer).
// The prop reaction should change because relative stiffness affects
// compatibility condition.

#[test]
fn validation_cross_section_ext_propped_cantilever_iz_redistribution() {
    let l = 6.0;
    let n = 6;
    let q = -12.0;
    let elem_len = l / n as f64;

    // Case A: uniform Iz
    let nodes_a: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let mats = vec![(1, E, 0.3)];
    let secs_a = vec![(1, A, 1e-4_f64)];
    let elems_a: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();
    let sups = vec![(1, 1, "fixed"), (2, n + 1, "rollerX")];
    let loads_a: Vec<SolverLoad> = (1..=n).map(|i| SolverLoad::Distributed(
        SolverDistributedLoad { element_id: i, q_i: q, q_j: q, a: None, b: None }
    )).collect();

    let input_a = make_input(nodes_a, mats.clone(), secs_a, elems_a, sups.clone(), loads_a);
    let res_a = linear::solve_2d(&input_a).unwrap();

    // Case B: right half (elements 4,5,6) has 4x Iz
    let nodes_b: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let secs_b = vec![(1, A, 1e-4_f64), (2, A, 4e-4_f64)];
    let elems_b: Vec<_> = (0..n).map(|i| {
        let sec = if i < 3 { 1 } else { 2 };
        (i + 1, "frame", i + 1, i + 2, 1, sec, false, false)
    }).collect();
    let loads_b: Vec<SolverLoad> = (1..=n).map(|i| SolverLoad::Distributed(
        SolverDistributedLoad { element_id: i, q_i: q, q_j: q, a: None, b: None }
    )).collect();

    let input_b = make_input(nodes_b, mats.clone(), secs_b, elems_b, sups.clone(), loads_b);
    let res_b = linear::solve_2d(&input_b).unwrap();

    // Roller reaction at right end should differ between cases
    let r_right_a = res_a.reactions.iter().find(|r| r.node_id == n + 1).unwrap().rz;
    let r_right_b = res_b.reactions.iter().find(|r| r.node_id == n + 1).unwrap().rz;

    let diff = (r_right_a - r_right_b).abs();
    assert!(diff > 0.1,
        "Prop reaction should change with Iz distribution: uniform={:.4}, variable={:.4}, diff={:.4}",
        r_right_a, r_right_b, diff);

    // Equilibrium must hold for both cases: sum Ry = w * L
    let total_load = q.abs() * l;
    let total_ry_a: f64 = res_a.reactions.iter().map(|r| r.rz).sum();
    let total_ry_b: f64 = res_b.reactions.iter().map(|r| r.rz).sum();
    assert_close(total_ry_a, total_load, 0.02, "equilibrium propped cantilever A");
    assert_close(total_ry_b, total_load, 0.02, "equilibrium propped cantilever B");
}

// ================================================================
// 3. Axial-Only Member: Iz Has No Effect on Axial Displacement
// ================================================================
//
// Horizontal bar, fixed left, axial load P=100kN at right tip, L=4m.
// delta_axial = PL/(EA), independent of Iz.
// Two cases with very different Iz.

#[test]
fn validation_cross_section_ext_axial_displacement_independent_of_iz() {
    let l = 4.0;
    let n = 4;
    let p = 100.0;
    let iz1 = 1e-5_f64;
    let iz2 = 1e-2_f64; // 1000x larger Iz
    let e_eff = E * 1000.0;

    let input1 = make_beam(n, l, E, A, iz1, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: p, fz: 0.0, my: 0.0,
        })]);
    let input2 = make_beam(n, l, E, A, iz2, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: p, fz: 0.0, my: 0.0,
        })]);

    let res1 = linear::solve_2d(&input1).unwrap();
    let res2 = linear::solve_2d(&input2).unwrap();

    let ux1 = res1.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;
    let ux2 = res2.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;

    // Both should match and equal analytical value
    let delta_exact = p * l / (e_eff * A);
    assert_close(ux1, delta_exact, 0.02, "axial displacement Iz=1e-5");
    assert_close(ux2, delta_exact, 0.02, "axial displacement Iz=1e-2");
    assert_close(ux1, ux2, 0.02, "axial displacement independent of Iz");
}

// ================================================================
// 4. Fixed-Fixed Beam: Tripling Iz Reduces Deflection by Factor 3
// ================================================================
//
// Fixed-fixed beam, L=8m, UDL w=-15 kN/m, 8 elements.
// delta_max = wL^4 / (384EI). Tripling Iz -> delta2/delta1 = 1/3.

#[test]
fn validation_cross_section_ext_fixed_fixed_beam_iz_scaling() {
    let l = 8.0;
    let n = 8;
    let q = -15.0;
    let iz1 = 2e-4_f64;
    let iz2 = 6e-4_f64; // 3x
    let e_eff = E * 1000.0;

    // Fixed-fixed beam with UDL
    let make_ff_beam_udl = |iz: f64| -> SolverInput {
        let elem_len = l / n as f64;
        let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
        let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();
        let sups = vec![(1, 1, "fixed"), (2, n + 1, "fixed")];
        let loads: Vec<SolverLoad> = (1..=n).map(|i| SolverLoad::Distributed(
            SolverDistributedLoad { element_id: i, q_i: q, q_j: q, a: None, b: None }
        )).collect();
        make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, iz)], elems, sups, loads)
    };

    let res1 = linear::solve_2d(&make_ff_beam_udl(iz1)).unwrap();
    let res2 = linear::solve_2d(&make_ff_beam_udl(iz2)).unwrap();

    let mid = n / 2 + 1;
    let d1 = res1.displacements.iter().find(|d| d.node_id == mid).unwrap().uz.abs();
    let d2 = res2.displacements.iter().find(|d| d.node_id == mid).unwrap().uz.abs();

    // Ratio d2/d1 = Iz1/Iz2 = 1/3
    let ratio = d2 / d1;
    assert_close(ratio, 1.0 / 3.0, 0.02, "fixed-fixed deflection ratio Iz1/Iz2");

    // Verify absolute deflection against analytical: delta_max = wL^4 / (384*EI)
    let delta_exact1 = (q.abs() * l.powi(4)) / (384.0 * e_eff * iz1);
    assert_close(d1, delta_exact1, 0.02, "fixed-fixed midspan deflection analytical");
}

// ================================================================
// 5. Two-Bay Portal Frame: Relative Column/Beam Iz Controls Drift
// ================================================================
//
// Two-bay portal frame, 3 columns + 2 beams, H=4m, W=5m per bay.
// Lateral load at top-left node. Compare:
// Case 1: All Iz equal (1e-4).
// Case 2: Beam Iz = 5e-4 (5x stiffer beams).
// Stiffer beams enforce more frame action, reduce drift.

#[test]
fn validation_cross_section_ext_two_bay_portal_drift_vs_beam_iz() {
    let h = 4.0;
    let w = 5.0;
    let lateral = 15.0;

    // Nodes: 1=BL, 2=TL, 3=TM, 4=TR, 5=BM, 6=BR
    // (bottom-left, top-left, top-middle, top-right, bottom-middle, bottom-right)
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, w, h), (4, 2.0 * w, h),
        (5, w, 0.0), (6, 2.0 * w, 0.0),
    ];
    let mats = vec![(1, E, 0.3)];

    // Case 1: all equal Iz
    let iz_equal = 1e-4_f64;
    let secs1 = vec![(1, A, iz_equal)];
    let elems1 = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // left beam
        (3, "frame", 3, 4, 1, 1, false, false), // right beam
        (4, "frame", 5, 3, 1, 1, false, false), // middle column
        (5, "frame", 6, 4, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1, "fixed"), (2, 5, "fixed"), (3, 6, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: lateral, fz: 0.0, my: 0.0,
    })];

    let input1 = make_input(nodes.clone(), mats.clone(), secs1, elems1, sups.clone(), loads.clone());
    let res1 = linear::solve_2d(&input1).unwrap();

    // Case 2: stiff beams
    let iz_beam = 5e-4_f64;
    let secs2 = vec![(1, A, iz_equal), (2, A, iz_beam)];
    let elems2 = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column sec 1
        (2, "frame", 2, 3, 1, 2, false, false), // left beam sec 2
        (3, "frame", 3, 4, 1, 2, false, false), // right beam sec 2
        (4, "frame", 5, 3, 1, 1, false, false), // middle column sec 1
        (5, "frame", 6, 4, 1, 1, false, false), // right column sec 1
    ];

    let input2 = make_input(nodes.clone(), mats.clone(), secs2, elems2, sups.clone(), loads.clone());
    let res2 = linear::solve_2d(&input2).unwrap();

    // Lateral drift at top-left should be less with stiffer beams
    let drift1 = res1.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    let drift2 = res2.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    assert!(drift2 < drift1,
        "Stiffer beams should reduce drift: equal={:.6}, stiff_beam={:.6}",
        drift1, drift2);

    // Verify lateral equilibrium in both cases
    let sum_rx1: f64 = res1.reactions.iter().map(|r| r.rx).sum();
    let sum_rx2: f64 = res2.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx1, -lateral, 0.02, "lateral equilibrium two-bay case 1");
    assert_close(sum_rx2, -lateral, 0.02, "lateral equilibrium two-bay case 2");
}

// ================================================================
// 6. Quadrupling Area Quarters Axial Displacement (Series Bars)
// ================================================================
//
// Two coaxial bars in series (total L=8m, each L=4m), fixed at left,
// axial load P=80kN at right tip.
// Case 1: both bars A=0.01.
// Case 2: both bars A=0.04 (4x).
// delta = PL/(EA). Quadrupling A -> delta2/delta1 = 0.25.

#[test]
fn validation_cross_section_ext_quadruple_area_quarters_axial() {
    let l = 8.0;
    let n = 8;
    let p = 80.0;
    let iz = 1e-4_f64;
    let a1 = 0.01_f64;
    let a2 = 0.04_f64;
    let e_eff = E * 1000.0;

    let input1 = make_beam(n, l, E, a1, iz, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: p, fz: 0.0, my: 0.0,
        })]);
    let input2 = make_beam(n, l, E, a2, iz, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: p, fz: 0.0, my: 0.0,
        })]);

    let res1 = linear::solve_2d(&input1).unwrap();
    let res2 = linear::solve_2d(&input2).unwrap();

    let ux1 = res1.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;
    let ux2 = res2.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;

    // Ratio: ux2/ux1 = A1/A2 = 0.25
    let ratio = ux2 / ux1;
    assert_close(ratio, 0.25, 0.02, "axial displacement ratio A1/A2=0.25");

    // Verify absolute values
    let delta1_exact = p * l / (e_eff * a1);
    let delta2_exact = p * l / (e_eff * a2);
    assert_close(ux1, delta1_exact, 0.02, "axial disp A=0.01 analytical");
    assert_close(ux2, delta2_exact, 0.02, "axial disp A=0.04 analytical");
}

// ================================================================
// 7. Cantilever Tip Rotation Inversely Proportional to Iz
// ================================================================
//
// Cantilever L=5m, tip load P=-20kN, 4 elements.
// theta_tip = PL^2 / (2EI). Doubling Iz halves rotation.

#[test]
fn validation_cross_section_ext_cantilever_tip_rotation_vs_iz() {
    let l = 5.0;
    let n = 4;
    let p = -20.0;
    let iz1 = 1e-4_f64;
    let iz2 = 2e-4_f64;
    let e_eff = E * 1000.0;

    let input1 = make_beam(n, l, E, A, iz1, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: p, my: 0.0,
        })]);
    let input2 = make_beam(n, l, E, A, iz2, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: p, my: 0.0,
        })]);

    let res1 = linear::solve_2d(&input1).unwrap();
    let res2 = linear::solve_2d(&input2).unwrap();

    let rz1 = res1.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ry;
    let rz2 = res2.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ry;

    // Analytical: theta = PL^2 / (2EI)
    let theta_exact1 = p * l.powi(2) / (2.0 * e_eff * iz1);
    assert_close(rz1, theta_exact1, 0.02, "cantilever tip rotation Iz1 analytical");

    // Ratio: rz1/rz2 = Iz2/Iz1 = 2.0
    let ratio = rz1 / rz2;
    assert_close(ratio, 2.0, 0.02, "cantilever rotation ratio Iz2/Iz1");
}

// ================================================================
// 8. Symmetric Frame: Equal Iz Yields Equal Column Moments
// ================================================================
//
// Symmetric portal frame, h=5m, w=8m, symmetric vertical load at
// both top nodes. With equal column Iz and equal beam Iz, the
// column base moments at left and right should be equal (by symmetry).
// Then with unequal column Iz, the moments should differ.

#[test]
fn validation_cross_section_ext_symmetric_frame_equal_iz_equal_moments() {
    let h = 5.0;
    let w = 8.0;
    let p_vert = -20.0;

    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let mats = vec![(1, E, 0.3)];

    // Case A: equal column Iz
    let iz_col = 1e-4_f64;
    let iz_beam = 2e-4_f64;
    let secs_a = vec![(1, A, iz_col), (2, A, iz_beam)];
    let elems_a = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 2, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: p_vert, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: p_vert, my: 0.0 }),
    ];

    let input_a = make_input(nodes.clone(), mats.clone(), secs_a, elems_a, sups.clone(), loads.clone());
    let res_a = linear::solve_2d(&input_a).unwrap();

    // Symmetric loading + symmetric structure -> equal base moments (absolute value)
    let mz_left_a = res_a.reactions.iter().find(|r| r.node_id == 1).unwrap().my.abs();
    let mz_right_a = res_a.reactions.iter().find(|r| r.node_id == 4).unwrap().my.abs();
    assert_close(mz_left_a, mz_right_a, 0.02, "symmetric frame equal base moments");

    // Equal vertical reactions too
    let ry_left_a = res_a.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let ry_right_a = res_a.reactions.iter().find(|r| r.node_id == 4).unwrap().rz;
    assert_close(ry_left_a, ry_right_a, 0.02, "symmetric frame equal vertical reactions");

    // Case B: unequal column Iz -> base moments should differ
    let iz_col_left = 1e-4_f64;
    let iz_col_right = 4e-4_f64; // right column 4x stiffer
    let secs_b = vec![(1, A, iz_col_left), (2, A, iz_beam), (3, A, iz_col_right)];
    let elems_b = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column sec 1
        (2, "frame", 2, 3, 1, 2, false, false), // beam sec 2
        (3, "frame", 3, 4, 1, 3, false, false), // right column sec 3
    ];

    let input_b = make_input(nodes, mats, secs_b, elems_b, sups, loads);
    let res_b = linear::solve_2d(&input_b).unwrap();

    let mz_left_b = res_b.reactions.iter().find(|r| r.node_id == 1).unwrap().my.abs();
    let mz_right_b = res_b.reactions.iter().find(|r| r.node_id == 4).unwrap().my.abs();

    // Stiffer column attracts more moment
    assert!(mz_right_b > mz_left_b,
        "Stiffer column should attract more moment: left={:.4}, right={:.4}",
        mz_left_b, mz_right_b);

    // Verify vertical equilibrium
    let total_applied = 2.0 * p_vert.abs();
    let total_ry_b: f64 = res_b.reactions.iter().map(|r| r.rz).sum();
    assert_close(total_ry_b, total_applied, 0.02, "equilibrium asymmetric frame");
}
