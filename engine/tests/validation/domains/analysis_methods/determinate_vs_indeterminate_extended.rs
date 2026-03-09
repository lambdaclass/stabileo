/// Extended validation: Statically determinate vs indeterminate structures.
///
/// Additional tests beyond the base file, exploring:
///   - Moment diagrams: determinate vs indeterminate moment shapes
///   - Thermal/settlement-like stiffness sensitivity
///   - Multi-span continuous beams: interior reaction magnitudes
///   - Degree of indeterminacy counting via reaction components
///   - Betti's reciprocal theorem for indeterminate structures
///   - Symmetry exploitation in indeterminate beams
///   - Portal frame sway under lateral load (indeterminate)
///   - Fixed-fixed vs simply-supported midspan moment ratio
///
/// References: Hibbeler *Structural Analysis* 10th ed, Ghali/Neville *Structural Analysis*
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ═══════════════════════════════════════════════════════════════
// 1. SS beam midspan moment equals PL/4 (determinate, exact)
// ═══════════════════════════════════════════════════════════════

/// For a simply-supported beam with a central point load P, the
/// midspan moment is exactly PL/4 from statics. This is independent
/// of EI. The moment diagram is a triangle.
#[test]
fn validation_ext_ss_beam_midspan_moment_pl_over_4() {
    let l = 12.0;
    let p = 120.0;
    let n = 8;
    let mid_node = n / 2 + 1; // node 5

    let input = make_beam(
        n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node,
            fx: 0.0,
            fy: -p,
            mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // The element just to the left of midspan carries the maximum moment.
    // Element n/2 ends at the midspan node.
    let elem_left = results.element_forces.iter()
        .find(|ef| ef.element_id == n / 2)
        .unwrap();

    // m_end of that element is the moment at the midspan node
    let m_mid = elem_left.m_end.abs();
    let expected = p * l / 4.0;
    assert_close(m_mid, expected, 0.02, "SS midspan moment = PL/4");

    // Verify with different EI — moment must be identical
    let input2 = make_beam(
        n, l, E, A, 5.0 * IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node,
            fx: 0.0,
            fy: -p,
            mz: 0.0,
        })],
    );
    let res2 = linear::solve_2d(&input2).unwrap();
    let elem_left2 = res2.element_forces.iter()
        .find(|ef| ef.element_id == n / 2)
        .unwrap();
    let m_mid2 = elem_left2.m_end.abs();
    assert_close(m_mid2, expected, 0.02, "SS midspan moment unchanged with 5*Iz");
}

// ═══════════════════════════════════════════════════════════════
// 2. Fixed-fixed midspan moment is PL/8 (half of SS value)
// ═══════════════════════════════════════════════════════════════

/// For a fixed-fixed beam with a central point load P, the midspan
/// moment is PL/8 (compared to PL/4 for a simply-supported beam).
/// The fixed ends attract moment, reducing the midspan value by half.
#[test]
fn validation_ext_fixed_fixed_midspan_moment_pl_over_8() {
    let l = 12.0;
    let p = 120.0;
    let n = 8;
    let mid_node = n / 2 + 1;

    let input = make_beam(
        n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node,
            fx: 0.0,
            fy: -p,
            mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Midspan moment from element forces
    let elem_left = results.element_forces.iter()
        .find(|ef| ef.element_id == n / 2)
        .unwrap();
    let m_mid = elem_left.m_end.abs();

    // Expected: PL/8 for fixed-fixed with central point load
    let expected = p * l / 8.0;
    assert_close(m_mid, expected, 0.03, "FF midspan moment = PL/8");

    // Fixed-end moments: M_A = M_B = PL/8 (same magnitude)
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_a.mz.abs(), p * l / 8.0, 0.03, "FF end moment A = PL/8");
    assert_close(r_b.mz.abs(), p * l / 8.0, 0.03, "FF end moment B = PL/8");
}

// ═══════════════════════════════════════════════════════════════
// 3. Three-span continuous beam: interior reactions exceed wL
// ═══════════════════════════════════════════════════════════════

/// For a 3-span continuous beam under UDL, the interior support
/// reactions are greater than wL (the simple-beam value per span),
/// because continuity redistributes forces. For equal spans with
/// UDL, the interior reaction at the first interior support is
/// approximately 1.1*wL (from the three-moment equation).
#[test]
fn validation_ext_three_span_continuous_interior_reactions() {
    let l_span = 8.0;
    let q = 10.0;
    let n_per_span = 4;
    let n_total = 3 * n_per_span; // 12 elements

    let mut loads = Vec::new();
    for i in 0..n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(
        &[l_span, l_span, l_span],
        n_per_span,
        E, A, IZ,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let total_load = q * 3.0 * l_span;

    // Equilibrium check
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02, "3-span equilibrium");

    // Interior support nodes: node n_per_span+1 and node 2*n_per_span+1
    let interior_node_1 = n_per_span + 1;
    let interior_node_2 = 2 * n_per_span + 1;

    let r_int1 = results.reactions.iter().find(|r| r.node_id == interior_node_1).unwrap();
    let r_int2 = results.reactions.iter().find(|r| r.node_id == interior_node_2).unwrap();

    // For a symmetric 3-span beam, the two interior reactions are equal
    assert_close(r_int1.ry, r_int2.ry, 0.03, "symmetric interior reactions");

    // Interior reactions should exceed the simple-beam value wL per span
    let simple_reaction = q * l_span;
    assert!(
        r_int1.ry > simple_reaction,
        "Interior reaction ({:.2}) should exceed wL ({:.2})",
        r_int1.ry, simple_reaction
    );

    // Exterior reactions should be less than wL/2
    let r_ext_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_ext_b = results.reactions.iter()
        .find(|r| r.node_id == 3 * n_per_span + 1)
        .unwrap();
    let half_simple = q * l_span / 2.0;
    assert!(
        r_ext_a.ry < half_simple,
        "Exterior reaction ({:.2}) should be less than wL/2 ({:.2})",
        r_ext_a.ry, half_simple
    );
    assert_close(r_ext_a.ry, r_ext_b.ry, 0.03, "symmetric exterior reactions");
}

// ═══════════════════════════════════════════════════════════════
// 4. Betti reciprocal theorem: indeterminate beam
// ═══════════════════════════════════════════════════════════════

/// Betti's reciprocal theorem states that for a linear elastic
/// structure, the work done by load system 1 through displacements
/// of load system 2 equals the work done by load system 2 through
/// displacements of load system 1. We verify this for a fixed-fixed
/// beam (3-degree indeterminate).
#[test]
fn validation_ext_betti_reciprocal_theorem_indeterminate() {
    let l = 10.0;
    let n = 8;
    let p1 = 50.0;
    let p2 = 80.0;
    let node_a = 3; // x = 2.5
    let node_b = 7; // x = 7.5

    // Load case 1: P1 at node_a
    let input1 = make_beam(
        n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_a,
            fx: 0.0,
            fy: -p1,
            mz: 0.0,
        })],
    );
    let res1 = linear::solve_2d(&input1).unwrap();

    // Load case 2: P2 at node_b
    let input2 = make_beam(
        n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_b,
            fx: 0.0,
            fy: -p2,
            mz: 0.0,
        })],
    );
    let res2 = linear::solve_2d(&input2).unwrap();

    // Betti: P1 * delta_a_due_to_P2 = P2 * delta_b_due_to_P1
    // delta_a_due_to_P2 = displacement at node_a from load case 2
    // delta_b_due_to_P1 = displacement at node_b from load case 1
    let d_a_from_2 = res2.displacements.iter()
        .find(|d| d.node_id == node_a)
        .unwrap();
    let d_b_from_1 = res1.displacements.iter()
        .find(|d| d.node_id == node_b)
        .unwrap();

    let work_1_through_2 = p1 * d_a_from_2.uy.abs();
    let work_2_through_1 = p2 * d_b_from_1.uy.abs();

    assert_close(
        work_1_through_2,
        work_2_through_1,
        0.02,
        "Betti reciprocal theorem (FF beam)",
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. Symmetric indeterminate beam: symmetric loading produces
//    symmetric response
// ═══════════════════════════════════════════════════════════════

/// A fixed-fixed beam under symmetric UDL must produce symmetric
/// reactions and displacements. The vertical reactions at both ends
/// must be equal, the fixed-end moments at both ends must be equal
/// in magnitude, and the midspan displacement must be the maximum.
#[test]
fn validation_ext_symmetric_indeterminate_response() {
    let l = 10.0;
    let q = 20.0;
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

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Symmetric reactions
    assert_close(r_a.ry, r_b.ry, 0.02, "symmetric Ry");
    assert_close(r_a.ry, q * l / 2.0, 0.02, "R_A = qL/2");

    // Fixed-end moments equal in magnitude (opposite sign due to convention)
    assert_close(r_a.mz.abs(), r_b.mz.abs(), 0.02, "symmetric |Mz|");

    // Analytical: M_fixed = qL^2/12 for UDL on fixed-fixed beam
    assert_close(r_a.mz.abs(), q * l * l / 12.0, 0.03, "M_fixed = qL^2/12");

    // Symmetric displacements: uy at node i equals uy at node (n+2-i)
    for i in 1..=(n / 2) {
        let d_left = results.displacements.iter()
            .find(|d| d.node_id == i)
            .unwrap();
        let d_right = results.displacements.iter()
            .find(|d| d.node_id == n + 2 - i)
            .unwrap();
        assert_close(
            d_left.uy, d_right.uy, 0.02,
            &format!("symmetric uy nodes {} and {}", i, n + 2 - i),
        );
    }

    // Midspan displacement is the maximum
    let mid_node = n / 2 + 1;
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();
    for d in &results.displacements {
        assert!(
            d_mid.uy.abs() >= d.uy.abs() - 1e-10,
            "Midspan should have max deflection: mid={:.6}, node {}={:.6}",
            d_mid.uy.abs(), d.node_id, d.uy.abs()
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// 6. Portal frame under lateral load: indeterminate sway
// ═══════════════════════════════════════════════════════════════

/// A fixed-base portal frame under lateral load is highly
/// indeterminate (degree 3). Each column base has 3 reactions
/// (6 total) minus 3 equilibrium equations = DI 3.
/// Verify equilibrium and that both column bases share the
/// lateral load through horizontal reactions.
#[test]
fn validation_ext_portal_frame_lateral_load_sharing() {
    let h = 5.0;
    let w = 8.0;
    let f_lat = 100.0;

    let input = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Horizontal equilibrium: sum Rx = -F_lat (applied at node 2)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -f_lat, 0.02, "portal Fx equilibrium");

    // Vertical equilibrium: no vertical loads applied
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry.abs(), 0.0, 0.02, "portal Fy equilibrium (no gravity)");

    // Both bases should resist horizontal force (both have Rx != 0)
    let r_base1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_base2 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    assert!(
        r_base1.rx.abs() > 1.0,
        "Base 1 should resist lateral load: Rx={:.4}", r_base1.rx
    );
    assert!(
        r_base2.rx.abs() > 1.0,
        "Base 2 should resist lateral load: Rx={:.4}", r_base2.rx
    );

    // Both bases have nonzero moments (indeterminate)
    assert!(
        r_base1.mz.abs() > 1.0,
        "Base 1 should have moment reaction: Mz={:.4}", r_base1.mz
    );
    assert!(
        r_base2.mz.abs() > 1.0,
        "Base 2 should have moment reaction: Mz={:.4}", r_base2.mz
    );

    // Vertical reactions form a couple to resist overturning moment
    // R1_y * w + moments = F_lat * h
    // The two vertical reactions should be equal and opposite
    assert_close(
        r_base1.ry, -r_base2.ry, 0.02,
        "portal vertical couple",
    );
}

// ═══════════════════════════════════════════════════════════════
// 7. Determinate cantilever: tip deflection PL^3/(3EI)
// ═══════════════════════════════════════════════════════════════

/// A cantilever beam is determinate. Its tip deflection under
/// a point load P at the free end is PL^3/(3EI). We verify
/// the analytical formula and confirm that doubling EI halves
/// the deflection (reactions remain unchanged).
#[test]
fn validation_ext_cantilever_tip_deflection_analytical() {
    let l = 6.0;
    let p = 50.0;
    let n = 10;

    // Baseline
    let input1 = make_beam(
        n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: 0.0,
            fy: -p,
            mz: 0.0,
        })],
    );
    let res1 = linear::solve_2d(&input1).unwrap();

    let e_eff: f64 = E * 1000.0;
    let expected_defl = p * l.powi(3) / (3.0 * e_eff * IZ);

    let d_tip1 = res1.displacements.iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();
    assert_close(
        d_tip1.uy.abs(), expected_defl, 0.02,
        "cantilever tip deflection = PL^3/(3EI)",
    );

    // Double EI (double Iz)
    let input2 = make_beam(
        n, l, E, A, 2.0 * IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: 0.0,
            fy: -p,
            mz: 0.0,
        })],
    );
    let res2 = linear::solve_2d(&input2).unwrap();

    let d_tip2 = res2.displacements.iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();

    // Deflection should halve when Iz doubles (determinate: reactions unchanged)
    assert_close(
        d_tip2.uy.abs(), d_tip1.uy.abs() / 2.0, 0.02,
        "doubling Iz halves cantilever deflection",
    );

    // Reactions unchanged (determinate)
    let r1 = res1.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = res2.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry, r2.ry, 0.02, "cantilever Ry unchanged with 2*Iz");
    assert_close(r1.mz, r2.mz, 0.02, "cantilever Mz unchanged with 2*Iz");
}

// ═══════════════════════════════════════════════════════════════
// 8. Fixed-fixed UDL midspan moment vs SS: ratio is 1:2.5
// ═══════════════════════════════════════════════════════════════

/// For a UDL q on a beam of length L:
///   - Simply-supported midspan moment: M_ss = qL^2/8
///   - Fixed-fixed midspan moment:      M_ff = qL^2/24
///   - Fixed-end moment:                M_end = qL^2/12
/// The ratio M_ff/M_ss = (qL^2/24)/(qL^2/8) = 1/3.
/// This dramatic reduction in midspan moment is the primary
/// advantage of indeterminate construction.
#[test]
fn validation_ext_fixed_vs_ss_midspan_moment_ratio_udl() {
    let l = 10.0;
    let q = 15.0;
    let n = 8;

    // Simply-supported beam with UDL
    let input_ss = make_ss_beam_udl(n, l, E, A, IZ, -q);
    let res_ss = linear::solve_2d(&input_ss).unwrap();

    // Fixed-fixed beam with UDL
    let mut loads_ff = Vec::new();
    for i in 0..n {
        loads_ff.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }
    let input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_ff);
    let res_ff = linear::solve_2d(&input_ff).unwrap();

    // Midspan moment from element forces: element n/2 ends at midspan
    let ef_ss = res_ss.element_forces.iter()
        .find(|ef| ef.element_id == n / 2)
        .unwrap();
    let ef_ff = res_ff.element_forces.iter()
        .find(|ef| ef.element_id == n / 2)
        .unwrap();

    let m_mid_ss = ef_ss.m_end.abs();
    let m_mid_ff = ef_ff.m_end.abs();

    // Analytical values
    let expected_ss = q * l * l / 8.0;
    let expected_ff = q * l * l / 24.0;

    assert_close(m_mid_ss, expected_ss, 0.03, "SS midspan moment = qL^2/8");
    assert_close(m_mid_ff, expected_ff, 0.05, "FF midspan moment = qL^2/24");

    // The ratio should be approximately 1/3
    let ratio = m_mid_ff / m_mid_ss;
    assert_close(ratio, 1.0 / 3.0, 0.05, "FF/SS midspan moment ratio = 1/3");

    // The fixed-fixed beam has smaller midspan moment
    assert!(
        m_mid_ff < m_mid_ss * 0.5,
        "FF midspan moment ({:.2}) should be much less than SS ({:.2})",
        m_mid_ff, m_mid_ss
    );

    // Fixed-end moment should be qL^2/12
    let r_a = res_ff.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(
        r_a.mz.abs(), q * l * l / 12.0, 0.03,
        "FF end moment = qL^2/12",
    );
}
