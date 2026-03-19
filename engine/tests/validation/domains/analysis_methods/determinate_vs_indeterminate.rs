/// Validation: Statically determinate vs indeterminate structures.
///
/// Tests highlight the fundamental behavioral differences:
///   - Determinate: reactions from statics alone, independent of EI
///   - Indeterminate: reactions depend on relative stiffness, extra restraints reduce deflection
///   - Superposition valid for both (linear elastic)
///
/// References: Hibbeler *Structural Analysis*, Ghali/Neville *Structural Analysis*
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ═══════════════════════════════════════════════════════════════
// 1. SS beam reactions independent of EI
// ═══════════════════════════════════════════════════════════════

/// A simply-supported beam is statically determinate. Its reactions
/// can be found from equilibrium alone, so changing E or Iz must
/// not affect the reaction forces.
#[test]
fn validation_ss_beam_reactions_independent_of_ei() {
    let l = 10.0;
    let p = 100.0;
    let n = 8;

    // Load at midspan
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];

    // Baseline: E=200_000, Iz=1e-4
    let input1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads.clone());
    let res1 = linear::solve_2d(&input1).unwrap();

    // Double E
    let input2 = make_beam(n, l, 2.0 * E, A, IZ, "pinned", Some("rollerX"), loads.clone());
    let res2 = linear::solve_2d(&input2).unwrap();

    // Triple Iz
    let input3 = make_beam(n, l, E, A, 3.0 * IZ, "pinned", Some("rollerX"), loads.clone());
    let res3 = linear::solve_2d(&input3).unwrap();

    // All three should have identical reactions
    let r1_a = res1.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r1_b = res1.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    let r2_a = res2.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2_b = res2.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    let r3_a = res3.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3_b = res3.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Expected from statics: R_A = R_B = P/2 = 50
    assert_close(r1_a.rz, p / 2.0, 0.02, "SS base R_A");
    assert_close(r1_b.rz, p / 2.0, 0.02, "SS base R_B");

    assert_close(r2_a.rz, r1_a.rz, 0.02, "SS 2E R_A unchanged");
    assert_close(r2_b.rz, r1_b.rz, 0.02, "SS 2E R_B unchanged");

    assert_close(r3_a.rz, r1_a.rz, 0.02, "SS 3Iz R_A unchanged");
    assert_close(r3_b.rz, r1_b.rz, 0.02, "SS 3Iz R_B unchanged");
}

// ═══════════════════════════════════════════════════════════════
// 2. Fixed-fixed reactions depend on EI ratio
// ═══════════════════════════════════════════════════════════════

/// A fixed-fixed beam is 3-degree indeterminate. When the section
/// properties change along the beam, the distribution of reactions
/// changes because compatibility must be satisfied.
#[test]
fn validation_fixed_fixed_reactions_depend_on_ei() {
    // Fixed-fixed beam L=10, asymmetric point load at L/4
    // Use 8 elements total. Load at node 3 (x=2.5).
    let l = 10.0;
    let p = 80.0;
    let n = 8;

    // Uniform section: all elements use section 1
    let load_node = 3; // x = 2.5

    let input_uniform = make_beam(
        n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        })],
    );
    let res_uniform = linear::solve_2d(&input_uniform).unwrap();

    // Now build a beam where elements 1-4 have Iz doubled (section 2).
    // This changes the relative stiffness distribution.
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * l / n as f64, 0.0)).collect();
    let mut elems = Vec::new();
    for i in 0..n {
        let sec_id = if i < n / 2 { 2 } else { 1 };
        elems.push((i + 1, "frame", i + 1, i + 2, 1, sec_id, false, false));
    }
    let sups = vec![(1, 1, "fixed"), (2, n + 1, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];
    let input_varied = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, 2.0 * IZ)],
        elems,
        sups,
        loads,
    );
    let res_varied = linear::solve_2d(&input_varied).unwrap();

    // Both must satisfy equilibrium
    let sum_ry_uniform: f64 = res_uniform.reactions.iter().map(|r| r.rz).sum();
    let sum_ry_varied: f64 = res_varied.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry_uniform, p, 0.02, "FF uniform equilibrium");
    assert_close(sum_ry_varied, p, 0.02, "FF varied equilibrium");

    // But the individual reactions must differ (indeterminate)
    let r_a_uniform = res_uniform.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_a_varied = res_varied.reactions.iter().find(|r| r.node_id == 1).unwrap();

    let ry_diff = (r_a_uniform.rz - r_a_varied.rz).abs();
    assert!(
        ry_diff > 0.5,
        "FF reactions should change with EI: uniform R_A={:.3}, varied R_A={:.3}, diff={:.3}",
        r_a_uniform.rz, r_a_varied.rz, ry_diff
    );

    let mz_diff = (r_a_uniform.my - r_a_varied.my).abs();
    assert!(
        mz_diff > 0.5,
        "FF moment reactions should change with EI: uniform M_A={:.3}, varied M_A={:.3}, diff={:.3}",
        r_a_uniform.my, r_a_varied.my, mz_diff
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Cantilever reactions from statics
// ═══════════════════════════════════════════════════════════════

/// A cantilever beam is statically determinate. For a tip load P
/// at distance L from the fixed end: R = P (vertical), M = P*L
/// (fixed-end moment). These come directly from equilibrium.
#[test]
fn validation_cantilever_reactions_from_statics() {
    let l = 8.0;
    let p = 75.0;
    let n = 8;

    let input = make_beam(
        n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Vertical reaction = P (exact from equilibrium)
    assert_close(r1.rz, p, 0.02, "cantilever Ry = P");

    // Fixed-end moment = P*L (exact from moment equilibrium about fixed end)
    // Sign: downward load at tip causes negative moment at fixed end in convention,
    // so the reaction moment is positive (counterclockwise to resist).
    let e_eff = E * 1000.0;
    let _ = e_eff; // E_EFF not needed for this purely static check
    assert_close(r1.my.abs(), p * l, 0.02, "cantilever M_fixed = P*L");

    // Horizontal reaction should be zero (no horizontal loads)
    assert_close(r1.rx.abs(), 0.0, 0.02, "cantilever Rx = 0");
}

// ═══════════════════════════════════════════════════════════════
// 4. Propped cantilever: 3 reactions, 1 degree indeterminate
// ═══════════════════════════════════════════════════════════════

/// A propped cantilever (fixed + roller) has 4 reaction components
/// (Rx, Ry, Mz at fixed end + Ry at roller) but only 3 equilibrium
/// equations in 2D. It is 1-degree indeterminate. For a UDL q:
///   R_roller = 3qL/8 (not wL/2 as for a simply-supported beam).
#[test]
fn validation_propped_cantilever_1_degree_indeterminate() {
    let l = 10.0;
    let q = 12.0;
    let n = 8;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_roller = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let r_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Analytical: R_roller = 3qL/8
    let expected_r_roller = 3.0 * q * l / 8.0;
    assert_close(r_roller.rz, expected_r_roller, 0.02, "propped R_roller = 3qL/8");

    // This is NOT wL/2 (the SS beam value) -- verify the difference
    let ss_reaction = q * l / 2.0;
    let diff = (r_roller.rz - ss_reaction).abs();
    assert!(
        diff > 1.0,
        "Propped cantilever roller reaction ({:.2}) should differ from SS ({:.2})",
        r_roller.rz, ss_reaction
    );

    // Fixed-end reaction: R_fixed = qL - 3qL/8 = 5qL/8
    let expected_r_fixed = 5.0 * q * l / 8.0;
    assert_close(r_fixed.rz, expected_r_fixed, 0.02, "propped R_fixed = 5qL/8");

    // Fixed-end moment: M_fixed = qL^2/8
    assert_close(r_fixed.my.abs(), q * l * l / 8.0, 0.02, "propped M_fixed = qL^2/8");

    // Equilibrium check
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * l, 0.02, "propped equilibrium");
}

// ═══════════════════════════════════════════════════════════════
// 5. Determinate beam: reactions unaffected by stiffness change
// ═══════════════════════════════════════════════════════════════

/// For a simply-supported beam with UDL, the reactions are always
/// wL/2 regardless of the beam stiffness. We verify this by solving
/// two beams with very different E values and comparing reactions.
#[test]
fn validation_determinate_reactions_unaffected_by_stiffness() {
    let l = 10.0;
    let q = 15.0;
    let n = 8;

    // Beam 1: E = 200,000 (steel-like)
    let input1 = make_ss_beam_udl(n, l, E, A, IZ, -q);
    let res1 = linear::solve_2d(&input1).unwrap();

    // Beam 2: E = 30,000 (concrete-like, ~7x less stiff)
    let input2 = make_ss_beam_udl(n, l, 30_000.0, A, IZ, -q);
    let res2 = linear::solve_2d(&input2).unwrap();

    let r1_a = res1.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r1_b = res1.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let r2_a = res2.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2_b = res2.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    let expected = q * l / 2.0;

    // Both beams: R = qL/2
    assert_close(r1_a.rz, expected, 0.02, "stiff beam R_A = qL/2");
    assert_close(r1_b.rz, expected, 0.02, "stiff beam R_B = qL/2");
    assert_close(r2_a.rz, expected, 0.02, "flexible beam R_A = qL/2");
    assert_close(r2_b.rz, expected, 0.02, "flexible beam R_B = qL/2");

    // Reactions are identical between the two beams
    assert_close(r1_a.rz, r2_a.rz, 0.02, "R_A same for both stiffnesses");
    assert_close(r1_b.rz, r2_b.rz, 0.02, "R_B same for both stiffnesses");

    // Deflections, however, should differ (flexible beam deflects more)
    let d1_mid = res1.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
    let d2_mid = res2.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
    assert!(
        d2_mid.uz.abs() > d1_mid.uz.abs() * 2.0,
        "Flexible beam should deflect much more: stiff={:.6}, flexible={:.6}",
        d1_mid.uz.abs(), d2_mid.uz.abs()
    );
}

// ═══════════════════════════════════════════════════════════════
// 6. Indeterminate beam: deflection reduced by extra support
// ═══════════════════════════════════════════════════════════════

/// Adding an interior support makes a structure indeterminate and
/// greatly reduces deflection. Compare a SS beam of L=12 with a
/// 2-span continuous beam (6+6) under the same UDL.
#[test]
fn validation_indeterminate_deflection_reduced_by_extra_support() {
    let q = 10.0;
    let n_per_span = 4;

    // Single span SS beam, L=12
    let l_single = 12.0;
    let n_single = 8;
    let input_single = make_ss_beam_udl(n_single, l_single, E, A, IZ, -q);
    let res_single = linear::solve_2d(&input_single).unwrap();

    // 2-span continuous beam, each span L=6 (total L=12)
    let l_span = 6.0;
    let n_cont = 2 * n_per_span;
    let mut loads_cont = Vec::new();
    for i in 0..n_cont {
        loads_cont.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }
    let input_cont = make_continuous_beam(&[l_span, l_span], n_per_span, E, A, IZ, loads_cont);
    let res_cont = linear::solve_2d(&input_cont).unwrap();

    // Find max deflection in the single-span beam
    let max_defl_single = res_single.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0_f64, f64::max);

    // Find max deflection in the continuous beam
    let max_defl_cont = res_cont.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0_f64, f64::max);

    // The continuous beam should have much smaller max deflection.
    // Analytically, SS L=12: delta_max = 5qL^4/(384EI) with L=12
    // Continuous 2-span L=6: delta_max = qL^4/(185EI) approx, with L=6
    // Ratio: (5*12^4/384) / (6^4/185) ~= (5*20736/384) / (1296/185) ~= 270 / 7 ~= 38x
    // The continuous beam deflects dramatically less.
    assert!(
        max_defl_cont < max_defl_single * 0.2,
        "Continuous beam max deflection ({:.6}) should be much less than single span ({:.6})",
        max_defl_cont, max_defl_single
    );

    // Both should satisfy equilibrium
    let sum_ry_single: f64 = res_single.reactions.iter().map(|r| r.rz).sum();
    let sum_ry_cont: f64 = res_cont.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry_single, q * l_single, 0.02, "single span equilibrium");
    assert_close(sum_ry_cont, q * 2.0 * l_span, 0.02, "continuous beam equilibrium");
}

// ═══════════════════════════════════════════════════════════════
// 7. Degree of indeterminacy: fixed-fixed has 3 extra restraints
// ═══════════════════════════════════════════════════════════════

/// A fixed-fixed beam has 6 reaction components (Rx, Ry, Mz at
/// each end) minus 3 equilibrium equations = 3 degrees of static
/// indeterminacy. We verify that all 6 reaction components are
/// nonzero when an asymmetric load is applied.
#[test]
fn validation_fixed_fixed_degree_of_indeterminacy() {
    let l = 10.0;
    let p = 60.0;
    let n = 8;

    // Asymmetric load at L/4 (node 3, x=2.5) to ensure all reactions are nonzero
    let input = make_beam(
        n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // All 6 reaction components should be nonzero (well, Rx could be zero
    // for a vertical-only load on a horizontal beam, but Ry and Mz at both ends
    // must be nonzero for asymmetric loading).
    assert!(
        r_a.rz.abs() > 1.0,
        "R_A vertical should be nonzero: {:.4}", r_a.rz
    );
    assert!(
        r_b.rz.abs() > 1.0,
        "R_B vertical should be nonzero: {:.4}", r_b.rz
    );
    assert!(
        r_a.my.abs() > 1.0,
        "M_A should be nonzero: {:.4}", r_a.my
    );
    assert!(
        r_b.my.abs() > 1.0,
        "M_B should be nonzero: {:.4}", r_b.my
    );

    // Total reaction count: 2 supports x 3 DOFs each = 6 reaction components
    // For a 2D beam, 3 equilibrium equations, so DI = 6 - 3 = 3.
    // Verify equilibrium is still satisfied despite the extra restraints.
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.02, "FF equilibrium Ry");

    // Moment equilibrium about node 1: sum(Ry*x) + sum(Mz) = P*x_load
    // R_B * L + M_A + M_B = P * (2.5)
    let x_load = 2.5;
    let moment_sum = r_b.rz * l + r_a.my + r_b.my;
    assert_close(moment_sum, p * x_load, 0.05, "FF moment equilibrium");

    // For a determinate structure (SS beam), M_A and M_B would be zero.
    // Verify they are significantly nonzero here.
    let sum_end_moments = r_a.my.abs() + r_b.my.abs();
    assert!(
        sum_end_moments > 10.0,
        "End moments should be significant for indeterminate beam: {:.4}", sum_end_moments
    );
}

// ═══════════════════════════════════════════════════════════════
// 8. Superposition valid for both determinate and indeterminate
// ═══════════════════════════════════════════════════════════════

/// The principle of superposition holds for all linear elastic
/// structures, whether determinate or indeterminate. We verify:
///   result(P1) + result(P2) = result(P1 + P2)
/// for both a simply-supported (determinate) and fixed-fixed
/// (indeterminate) beam.
#[test]
fn validation_superposition_determinate_and_indeterminate() {
    let l = 10.0;
    let n = 8;
    let p1 = 40.0;
    let p2 = 70.0;
    let node_a = 3; // x = 2.5 (load point 1)
    let node_b = 7; // x = 7.5 (load point 2)

    for (label, start_sup, end_sup) in [
        ("SS (determinate)", "pinned", "rollerX"),
        ("FF (indeterminate)", "fixed", "fixed"),
    ] {
        // Load case 1: P1 at node_a
        let input1 = make_beam(
            n, l, E, A, IZ, start_sup, Some(end_sup),
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: node_a,
                fx: 0.0,
                fz: -p1,
                my: 0.0,
            })],
        );
        let res1 = linear::solve_2d(&input1).unwrap();

        // Load case 2: P2 at node_b
        let input2 = make_beam(
            n, l, E, A, IZ, start_sup, Some(end_sup),
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: node_b,
                fx: 0.0,
                fz: -p2,
                my: 0.0,
            })],
        );
        let res2 = linear::solve_2d(&input2).unwrap();

        // Combined: P1 at node_a + P2 at node_b
        let input_combined = make_beam(
            n, l, E, A, IZ, start_sup, Some(end_sup),
            vec![
                SolverLoad::Nodal(SolverNodalLoad {
                    node_id: node_a,
                    fx: 0.0,
                    fz: -p1,
                    my: 0.0,
                }),
                SolverLoad::Nodal(SolverNodalLoad {
                    node_id: node_b,
                    fx: 0.0,
                    fz: -p2,
                    my: 0.0,
                }),
            ],
        );
        let res_combined = linear::solve_2d(&input_combined).unwrap();

        // Check superposition of displacements at every node
        for node_id in 1..=(n + 1) {
            let d1 = res1.displacements.iter().find(|d| d.node_id == node_id).unwrap();
            let d2 = res2.displacements.iter().find(|d| d.node_id == node_id).unwrap();
            let dc = res_combined.displacements.iter().find(|d| d.node_id == node_id).unwrap();

            let sum_uy = d1.uz + d2.uz;
            let sum_rz = d1.ry + d2.ry;

            assert_close(
                dc.uz, sum_uy, 0.02,
                &format!("{} superposition uy node {}", label, node_id),
            );
            assert_close(
                dc.ry, sum_rz, 0.02,
                &format!("{} superposition rz node {}", label, node_id),
            );
        }

        // Check superposition of reactions
        for rc in &res_combined.reactions {
            let r1 = res1.reactions.iter().find(|r| r.node_id == rc.node_id).unwrap();
            let r2 = res2.reactions.iter().find(|r| r.node_id == rc.node_id).unwrap();

            assert_close(
                rc.rz, r1.rz + r2.rz, 0.02,
                &format!("{} superposition Ry node {}", label, rc.node_id),
            );
            assert_close(
                rc.my, r1.my + r2.my, 0.02,
                &format!("{} superposition Mz node {}", label, rc.node_id),
            );
        }

        // Check superposition of element forces
        for efc in &res_combined.element_forces {
            let ef1 = res1.element_forces.iter().find(|ef| ef.element_id == efc.element_id).unwrap();
            let ef2 = res2.element_forces.iter().find(|ef| ef.element_id == efc.element_id).unwrap();

            assert_close(
                efc.v_start, ef1.v_start + ef2.v_start, 0.02,
                &format!("{} superposition V_start elem {}", label, efc.element_id),
            );
            assert_close(
                efc.m_start, ef1.m_start + ef2.m_start, 0.02,
                &format!("{} superposition M_start elem {}", label, efc.element_id),
            );
            assert_close(
                efc.m_end, ef1.m_end + ef2.m_end, 0.02,
                &format!("{} superposition M_end elem {}", label, efc.element_id),
            );
        }
    }
}
