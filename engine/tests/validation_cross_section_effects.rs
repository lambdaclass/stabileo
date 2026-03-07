/// Validation: Cross-Section Property Effects on Structural Behavior
///
/// References:
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed.
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed.
///
/// Tests verify how cross-section properties (A, Iz) affect:
///   1. Deflection inversely proportional to Iz
///   2. Reactions independent of Iz for determinate beams
///   3. Reactions dependent on Iz for indeterminate beams
///   4. Bending deflection independent of area A
///   5. Axial displacement inversely proportional to area A
///   6. EI scaling equivalence (same product = same deflection)
///   7. Portal frame moment distribution with stiff beam
///   8. Same area, different Iz efficiency comparison
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;

// ================================================================
// 1. Doubling Iz Halves Deflection
// ================================================================
//
// Simply-supported beam, L=6m, UDL w=-10 kN/m, 4 elements.
// delta proportional to 1/I, so delta2/delta1 = I1/I2 = 0.5.

#[test]
fn validation_cross_section_doubling_iz_halves_deflection() {
    let l = 6.0;
    let n = 4;
    let q = -10.0;
    let iz1 = 1e-4;
    let iz2 = 2e-4;

    let input1 = make_ss_beam_udl(n, l, E, A, iz1, q);
    let input2 = make_ss_beam_udl(n, l, E, A, iz2, q);

    let res1 = linear::solve_2d(&input1).unwrap();
    let res2 = linear::solve_2d(&input2).unwrap();

    let mid = n / 2 + 1;
    let d1 = res1.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();
    let d2 = res2.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    let ratio = d2 / d1;
    assert_close(ratio, 0.5, 0.02, "deflection ratio Iz2/Iz1");
}

// ================================================================
// 2. Iz Does Not Affect Reactions (Statically Determinate)
// ================================================================
//
// Simply-supported beam, L=6m, UDL, 4 elements.
// Reactions depend only on load and geometry, not stiffness.

#[test]
fn validation_cross_section_iz_no_effect_on_determinate_reactions() {
    let l = 6.0;
    let n = 4;
    let q = -10.0;
    let iz1 = 1e-4;
    let iz2 = 5e-4;

    let input1 = make_ss_beam_udl(n, l, E, A, iz1, q);
    let input2 = make_ss_beam_udl(n, l, E, A, iz2, q);

    let res1 = linear::solve_2d(&input1).unwrap();
    let res2 = linear::solve_2d(&input2).unwrap();

    // Sum vertical reactions
    let ry1: f64 = res1.reactions.iter().map(|r| r.ry).sum();
    let ry2: f64 = res2.reactions.iter().map(|r| r.ry).sum();

    assert_close(ry1, ry2, 0.02, "total vertical reaction Iz1 vs Iz2");

    // Check individual reactions match
    for r1 in &res1.reactions {
        let r2 = res2.reactions.iter().find(|r| r.node_id == r1.node_id).unwrap();
        assert_close(r1.ry, r2.ry, 0.02,
            &format!("reaction Ry at node {}", r1.node_id));
    }
}

// ================================================================
// 3. Iz Affects Reactions in Indeterminate Beams
// ================================================================
//
// Two-span continuous beam with UNEQUAL spans: L1=4m, L2=8m.
// Supports: pinned at x=0, rollerX at x=4, rollerX at x=12.
// With uniform Iz, the interior reaction is determined by compatibility.
// Changing relative Iz between spans alters stiffness distribution,
// which changes the interior reaction.
// Case A: both spans Iz=1e-4.
// Case B: span 1 Iz=1e-4, span 2 Iz=5e-4.

#[test]
fn validation_cross_section_iz_affects_indeterminate_reactions() {
    let q = -10.0;

    // Case A: equal stiffness in both spans (unequal lengths)
    let nodes_a = vec![(1, 0.0, 0.0), (2, 2.0, 0.0), (3, 4.0, 0.0),
                       (4, 6.0, 0.0), (5, 8.0, 0.0), (6, 10.0, 0.0), (7, 12.0, 0.0)];
    let mats = vec![(1, E, 0.3)];
    let secs_a = vec![(1, A, 1e-4_f64)]; // single section for both spans
    let elems_a = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // span 1: 0-2
        (2, "frame", 2, 3, 1, 1, false, false), // span 1: 2-4
        (3, "frame", 3, 4, 1, 1, false, false), // span 2: 4-6
        (4, "frame", 4, 5, 1, 1, false, false), // span 2: 6-8
        (5, "frame", 5, 6, 1, 1, false, false), // span 2: 8-10
        (6, "frame", 6, 7, 1, 1, false, false), // span 2: 10-12
    ];
    let sups = vec![(1, 1, "pinned"), (2, 3, "rollerX"), (3, 7, "rollerX")];
    let loads_a: Vec<SolverLoad> = (1..=6).map(|i| SolverLoad::Distributed(
        SolverDistributedLoad { element_id: i, q_i: q, q_j: q, a: None, b: None }
    )).collect();

    let input_a = make_input(nodes_a, mats.clone(), secs_a, elems_a, sups.clone(), loads_a);
    let res_a = linear::solve_2d(&input_a).unwrap();

    // Case B: span 2 has 5x the Iz (much stiffer)
    let nodes_b = vec![(1, 0.0, 0.0), (2, 2.0, 0.0), (3, 4.0, 0.0),
                       (4, 6.0, 0.0), (5, 8.0, 0.0), (6, 10.0, 0.0), (7, 12.0, 0.0)];
    let secs_b = vec![(1, A, 1e-4_f64), (2, A, 5e-4_f64)];
    let elems_b = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // span 1: sec 1
        (2, "frame", 2, 3, 1, 1, false, false), // span 1: sec 1
        (3, "frame", 3, 4, 1, 2, false, false), // span 2: sec 2
        (4, "frame", 4, 5, 1, 2, false, false), // span 2: sec 2
        (5, "frame", 5, 6, 1, 2, false, false), // span 2: sec 2
        (6, "frame", 6, 7, 1, 2, false, false), // span 2: sec 2
    ];
    let loads_b: Vec<SolverLoad> = (1..=6).map(|i| SolverLoad::Distributed(
        SolverDistributedLoad { element_id: i, q_i: q, q_j: q, a: None, b: None }
    )).collect();

    let input_b = make_input(nodes_b, mats.clone(), secs_b, elems_b, sups.clone(), loads_b);
    let res_b = linear::solve_2d(&input_b).unwrap();

    // Interior support reaction at node 3 should differ between cases
    let r_mid_a = res_a.reactions.iter().find(|r| r.node_id == 3).unwrap().ry;
    let r_mid_b = res_b.reactions.iter().find(|r| r.node_id == 3).unwrap().ry;

    let diff = (r_mid_a - r_mid_b).abs();
    assert!(diff > 0.1,
        "Interior reaction should change with Iz ratio: case_a={:.4}, case_b={:.4}, diff={:.4}",
        r_mid_a, r_mid_b, diff);

    // Total vertical reaction must equal total load in both cases (equilibrium)
    let total_load = q.abs() * 12.0; // w * L_total
    let total_ry_a: f64 = res_a.reactions.iter().map(|r| r.ry).sum();
    let total_ry_b: f64 = res_b.reactions.iter().map(|r| r.ry).sum();
    assert_close(total_ry_a, total_load, 0.02, "equilibrium case A");
    assert_close(total_ry_b, total_load, 0.02, "equilibrium case B");
}

// ================================================================
// 4. Area Only Affects Axial Stiffness, Not Bending
// ================================================================
//
// SS beam, L=6m, point load P=-10kN at midspan.
// Bending deflection delta = PL^3/(48EI), independent of A.

#[test]
fn validation_cross_section_area_no_effect_on_bending() {
    let l = 6.0;
    let n = 4;
    let iz = 1e-4;
    let a1 = 0.01;
    let a2 = 0.1; // 10x larger area

    let mid = n / 2 + 1;

    let input1 = make_beam(n, l, E, a1, iz, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -10.0, mz: 0.0,
        })]);

    let input2 = make_beam(n, l, E, a2, iz, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -10.0, mz: 0.0,
        })]);

    let res1 = linear::solve_2d(&input1).unwrap();
    let res2 = linear::solve_2d(&input2).unwrap();

    let d1 = res1.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let d2 = res2.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;

    assert_close(d1, d2, 0.02, "midspan deflection A=0.01 vs A=0.1");
}

// ================================================================
// 5. Area Affects Axial Displacement
// ================================================================
//
// Cantilever L=4m, axial load P=50kN at tip.
// delta_axial = PL/(EA). Doubling A halves displacement.

#[test]
fn validation_cross_section_area_affects_axial_displacement() {
    let l = 4.0;
    let n = 4;
    let p = 50.0;
    let iz = 1e-4;
    let a1 = 0.01;
    let a2 = 0.02;
    let e_eff = E * 1000.0;

    let input1 = make_beam(n, l, E, a1, iz, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: p, fy: 0.0, mz: 0.0,
        })]);

    let input2 = make_beam(n, l, E, a2, iz, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: p, fy: 0.0, mz: 0.0,
        })]);

    let res1 = linear::solve_2d(&input1).unwrap();
    let res2 = linear::solve_2d(&input2).unwrap();

    let ux1 = res1.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;
    let ux2 = res2.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;

    // Check ratio: ux1/ux2 = A2/A1 = 2.0
    let ratio = ux1 / ux2;
    assert_close(ratio, 2.0, 0.02, "axial displacement ratio A1/A2");

    // Verify absolute value against analytical: delta = PL/(EA)
    let delta_exact = p * l / (e_eff * a1);
    assert_close(ux1, delta_exact, 0.02, "axial displacement case 1 vs analytical");
}

// ================================================================
// 6. EI Scaling: Same Product = Same Deflection
// ================================================================
//
// SS beam L=8m, UDL w=-10kN/m.
// Case 1: E=200000, Iz=1e-4 -> EI = 20
// Case 2: E=100000, Iz=2e-4 -> EI = 20
// Same EI -> same deflection.

#[test]
fn validation_cross_section_ei_scaling_equivalence() {
    let l = 8.0;
    let n = 4;
    let q = -10.0;

    let e1 = 200_000.0;
    let iz1 = 1e-4;
    let e2 = 100_000.0;
    let iz2 = 2e-4;

    let input1 = make_ss_beam_udl(n, l, e1, A, iz1, q);
    let input2 = make_ss_beam_udl(n, l, e2, A, iz2, q);

    let res1 = linear::solve_2d(&input1).unwrap();
    let res2 = linear::solve_2d(&input2).unwrap();

    let mid = n / 2 + 1;
    let d1 = res1.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let d2 = res2.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;

    assert_close(d1, d2, 0.02, "midspan deflection same EI product");
}

// ================================================================
// 7. Portal Frame: Stiff Beam Reduces Lateral Sway
// ================================================================
//
// Portal frame h=4m, w=6m. Lateral load H=10kN at top-left.
// Case 1: Column Iz = Beam Iz = 1e-4 (equal stiffness).
// Case 2: Column Iz = 1e-4, Beam Iz = 1e-3 (stiff beam).
// A stiffer beam constrains column tops to rotate together, reducing sway.
// The frame becomes closer to fixed-fixed column behavior.

#[test]
fn validation_cross_section_portal_stiff_beam_reduces_sway() {
    let h = 4.0;
    let w = 6.0;
    let lateral_h = 10.0;
    let iz_col = 1e-4;

    // Case 1: equal stiffness (beam Iz = column Iz)
    let iz_beam_1 = 1e-4;
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let mats = vec![(1, E, 0.3)];
    let secs1 = vec![(1, A, iz_col), (2, A, iz_beam_1)];
    let elems1 = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column, sec 1
        (2, "frame", 2, 3, 1, 2, false, false), // beam, sec 2
        (3, "frame", 3, 4, 1, 1, false, false), // right column, sec 1
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: lateral_h, fy: 0.0, mz: 0.0,
    })];

    let input1 = make_input(nodes.clone(), mats.clone(), secs1, elems1, sups.clone(), loads.clone());
    let res1 = linear::solve_2d(&input1).unwrap();

    // Case 2: stiff beam (beam Iz = 10x column Iz)
    let iz_beam_2 = 1e-3;
    let secs2 = vec![(1, A, iz_col), (2, A, iz_beam_2)];
    let elems2 = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 2, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];

    let input2 = make_input(nodes, mats, secs2, elems2, sups, loads);
    let res2 = linear::solve_2d(&input2).unwrap();

    // Lateral sway at top (node 2) should be less with stiff beam
    let sway1 = res1.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    let sway2 = res2.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    assert!(sway2 < sway1,
        "Stiff beam should reduce lateral sway: equal_beam={:.6}, stiff_beam={:.6}",
        sway1, sway2);

    // With a stiffer beam, beam end moments increase (beam absorbs more moment).
    // Check beam element forces: moment at beam ends should be larger in stiff beam case.
    let beam_forces_1 = res1.element_forces.iter().find(|ef| ef.element_id == 2).unwrap();
    let beam_forces_2 = res2.element_forces.iter().find(|ef| ef.element_id == 2).unwrap();
    let beam_m_sum_1 = beam_forces_1.m_start.abs() + beam_forces_1.m_end.abs();
    let beam_m_sum_2 = beam_forces_2.m_start.abs() + beam_forces_2.m_end.abs();

    assert!(beam_m_sum_2 > beam_m_sum_1,
        "Stiff beam should carry more moment: equal_beam_m={:.4}, stiff_beam_m={:.4}",
        beam_m_sum_1, beam_m_sum_2);

    // Verify lateral equilibrium in both cases
    let sum_rx_1: f64 = res1.reactions.iter().map(|r| r.rx).sum();
    let sum_rx_2: f64 = res2.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_1, -lateral_h, 0.02, "lateral equilibrium case 1");
    assert_close(sum_rx_2, -lateral_h, 0.02, "lateral equilibrium case 2");
}

// ================================================================
// 8. Same Area, Different Iz: I-Section vs Compact Section
// ================================================================
//
// Two SS beams with A=0.01 for both.
// Iz1 = 1e-4 (compact rectangular), Iz2 = 5e-4 (I-section-like, more efficient).
// Same UDL. Deflection ratio = Iz1/Iz2 = 0.2.

#[test]
fn validation_cross_section_same_area_different_iz_efficiency() {
    let l = 6.0;
    let n = 4;
    let q = -10.0;
    let iz1 = 1e-4;
    let iz2 = 5e-4;

    let input1 = make_ss_beam_udl(n, l, E, A, iz1, q);
    let input2 = make_ss_beam_udl(n, l, E, A, iz2, q);

    let res1 = linear::solve_2d(&input1).unwrap();
    let res2 = linear::solve_2d(&input2).unwrap();

    let mid = n / 2 + 1;
    let d1 = res1.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();
    let d2 = res2.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // Higher Iz deflects less: d2/d1 = Iz1/Iz2 = 0.2
    let ratio = d2 / d1;
    assert_close(ratio, 0.2, 0.02, "deflection ratio Iz1/Iz2");

    // Verify both beams have identical reactions (determinate)
    for r1 in &res1.reactions {
        let r2 = res2.reactions.iter().find(|r| r.node_id == r1.node_id).unwrap();
        assert_close(r1.ry, r2.ry, 0.02,
            &format!("reaction Ry at node {} same A different Iz", r1.node_id));
    }
}
