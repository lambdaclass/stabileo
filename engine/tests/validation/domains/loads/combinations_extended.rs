/// Validation: Extended Load Combinations and Envelope Analysis
///
/// References:
///   - Superposition principle for linear elastic systems
///   - EN 1990 §6.4.3.2 — ULS/SLS load combination methodology
///   - Envelope analysis: pointwise max/min across load cases
///
/// Tests:
///   1. Zero factor: factor=0 produces zero results
///   2. Distributive property: a*(LC1 + LC2) = a*LC1 + a*LC2
///   3. Two-span continuous beam envelope: asymmetric pattern loading
///   4. Portal frame multi-case combination vs direct solve
///   5. Additive decomposition: (a+b)*LC = a*LC + b*LC
///   6. Envelope max_abs_results tracks governing case correctly
///   7. 3D combination with distributed loads vs direct solve
///   8. SLS quasi-permanent combo: 1.0*DL + 0.3*LL + 0.0*Wind
use dedaliano_engine::postprocess::combinations::*;
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Zero Factor: factor=0.0 Produces Zero Results
// ================================================================
//
// Combining a single load case with factor 0.0 should produce
// zero displacements, reactions, and element forces everywhere.

#[test]
fn validation_comb_ext_zero_factor() {
    let n = 6;
    let l = 4.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -15.0, q_j: -15.0, a: None, b: None,
        }))
        .collect();

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let res = linear::solve_2d(&input).unwrap();

    // Verify original has non-trivial results
    let mid_orig = res.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
    assert!(mid_orig.uz.abs() > 1e-10, "Original should have non-zero deflection");

    // Combine with factor = 0.0
    let combo = CombinationInput {
        factors: vec![CombinationFactor { case_id: 1, factor: 0.0 }],
        cases: vec![CaseEntry { case_id: 1, results: res }],
    };
    let combined = combine_results(&combo).unwrap();

    // All displacements must be zero
    for d in &combined.displacements {
        assert_close(d.ux, 0.0, 1e-12, &format!("zero factor ux node {}", d.node_id));
        assert_close(d.uz, 0.0, 1e-12, &format!("zero factor uy node {}", d.node_id));
        assert_close(d.ry, 0.0, 1e-12, &format!("zero factor rz node {}", d.node_id));
    }

    // All reactions must be zero
    for r in &combined.reactions {
        assert_close(r.rx, 0.0, 1e-12, &format!("zero factor rx node {}", r.node_id));
        assert_close(r.rz, 0.0, 1e-12, &format!("zero factor ry node {}", r.node_id));
        assert_close(r.my, 0.0, 1e-12, &format!("zero factor mz node {}", r.node_id));
    }

    // All element forces must be zero
    for ef in &combined.element_forces {
        assert_close(ef.n_start, 0.0, 1e-12, &format!("zero factor n_start elem {}", ef.element_id));
        assert_close(ef.v_start, 0.0, 1e-12, &format!("zero factor v_start elem {}", ef.element_id));
        assert_close(ef.m_start, 0.0, 1e-12, &format!("zero factor m_start elem {}", ef.element_id));
        assert_close(ef.m_end, 0.0, 1e-12, &format!("zero factor m_end elem {}", ef.element_id));
    }
}

// ================================================================
// 2. Distributive Property: a*(LC1 + LC2) = a*LC1 + a*LC2
// ================================================================
//
// For a linear system, factoring a sum of load cases should give
// the same result as summing individually factored cases.
// LHS: solve (LC1+LC2) together, then scale by a
// RHS: solve LC1 and LC2 separately, combine with factor a each

#[test]
fn validation_comb_ext_distributive_property() {
    let n = 8;
    let l = 6.0;
    let a_factor = 1.75;

    // LC1: UDL -8 kN/m
    let lc1_loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -8.0, q_j: -8.0, a: None, b: None,
        }))
        .collect();

    // LC2: Point load -25 kN at midspan
    let lc2_loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1, fx: 0.0, fz: -25.0, my: 0.0,
    })];

    // RHS: solve each separately, combine with factor a
    let res_lc1 = linear::solve_2d(
        &make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), lc1_loads.clone()),
    ).unwrap();
    let res_lc2 = linear::solve_2d(
        &make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), lc2_loads.clone()),
    ).unwrap();

    let rhs_combo = CombinationInput {
        factors: vec![
            CombinationFactor { case_id: 1, factor: a_factor },
            CombinationFactor { case_id: 2, factor: a_factor },
        ],
        cases: vec![
            CaseEntry { case_id: 1, results: res_lc1 },
            CaseEntry { case_id: 2, results: res_lc2 },
        ],
    };
    let rhs = combine_results(&rhs_combo).unwrap();

    // LHS: solve combined loads directly, then scale by a
    let mut combined_loads = Vec::new();
    for i in 1..=n {
        combined_loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -8.0, q_j: -8.0, a: None, b: None,
        }));
    }
    combined_loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1, fx: 0.0, fz: -25.0, my: 0.0,
    }));
    let res_combined = linear::solve_2d(
        &make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), combined_loads),
    ).unwrap();

    let lhs_combo = CombinationInput {
        factors: vec![CombinationFactor { case_id: 1, factor: a_factor }],
        cases: vec![CaseEntry { case_id: 1, results: res_combined }],
    };
    let lhs = combine_results(&lhs_combo).unwrap();

    // Compare all displacements
    for (l_d, r_d) in lhs.displacements.iter().zip(rhs.displacements.iter()) {
        assert_close(l_d.ux, r_d.ux, 1e-6, &format!("distributive ux node {}", l_d.node_id));
        assert_close(l_d.uz, r_d.uz, 1e-6, &format!("distributive uy node {}", l_d.node_id));
        assert_close(l_d.ry, r_d.ry, 1e-6, &format!("distributive rz node {}", l_d.node_id));
    }

    // Compare all reactions
    for (l_r, r_r) in lhs.reactions.iter().zip(rhs.reactions.iter()) {
        assert_close(l_r.rx, r_r.rx, 1e-6, &format!("distributive rx node {}", l_r.node_id));
        assert_close(l_r.rz, r_r.rz, 1e-6, &format!("distributive ry node {}", l_r.node_id));
        assert_close(l_r.my, r_r.my, 1e-6, &format!("distributive mz node {}", l_r.node_id));
    }

    // Compare element forces
    for (l_ef, r_ef) in lhs.element_forces.iter().zip(rhs.element_forces.iter()) {
        assert_close(l_ef.v_start, r_ef.v_start, 1e-5,
            &format!("distributive v_start elem {}", l_ef.element_id));
        assert_close(l_ef.m_start, r_ef.m_start, 1e-5,
            &format!("distributive m_start elem {}", l_ef.element_id));
        assert_close(l_ef.m_end, r_ef.m_end, 1e-5,
            &format!("distributive m_end elem {}", l_ef.element_id));
    }
}

// ================================================================
// 3. Two-Span Continuous Beam Envelope: Asymmetric Pattern Loading
// ================================================================
//
// A two-equal-span continuous beam (pinned-roller-roller) with two
// load cases: load on span 1 only, load on span 2 only.
// The envelope should capture the governing moments from each pattern.

#[test]
fn validation_comb_ext_continuous_beam_envelope() {
    let n_per_span = 4;
    let span_len = 5.0;

    // LC1: UDL on span 1 only (elements 1..n_per_span)
    let mut lc1_loads = Vec::new();
    for i in 1..=n_per_span {
        lc1_loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -12.0, q_j: -12.0, a: None, b: None,
        }));
    }

    // LC2: UDL on span 2 only (elements n_per_span+1..2*n_per_span)
    let mut lc2_loads = Vec::new();
    for i in (n_per_span + 1)..=(2 * n_per_span) {
        lc2_loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -12.0, q_j: -12.0, a: None, b: None,
        }));
    }

    let input1 = make_continuous_beam(
        &[span_len, span_len], n_per_span, E, A, IZ, lc1_loads,
    );
    let input2 = make_continuous_beam(
        &[span_len, span_len], n_per_span, E, A, IZ, lc2_loads,
    );

    let res1 = linear::solve_2d(&input1).unwrap();
    let res2 = linear::solve_2d(&input2).unwrap();

    let envelope = compute_envelope(&[res1.clone(), res2.clone()]).unwrap();

    // Envelope should have elements for both spans
    assert_eq!(
        envelope.moment.elements.len(), 2 * n_per_span,
        "Envelope should cover all elements"
    );

    // The global max moment should be positive (sagging in loaded span)
    assert!(envelope.moment.global_max > 0.0, "Global max moment should be positive");

    // By symmetry of the two pattern-loading cases, the envelope
    // moment global_max should be the same whether we loaded span 1 or span 2.
    // The max sagging moment in span 1 under LC1 should equal
    // max sagging moment in span 2 under LC2.
    // We verify this via the envelope pos_values: the peak in the first-span
    // elements should equal the peak in the second-span elements.
    let span1_max: f64 = envelope.moment.elements[..n_per_span].iter()
        .flat_map(|e| e.pos_values.iter())
        .cloned()
        .fold(0.0f64, |a, b| a.max(b));
    let span2_max: f64 = envelope.moment.elements[n_per_span..].iter()
        .flat_map(|e| e.pos_values.iter())
        .cloned()
        .fold(0.0f64, |a, b| a.max(b));
    assert_close(span1_max, span2_max, 1e-4, "symmetric spans envelope peak moment");

    // The hogging moment at the interior support should appear in neg_values
    // for elements near the middle support (element n_per_span or n_per_span+1).
    let hogging_neg: f64 = envelope.moment.elements.iter()
        .flat_map(|e| e.neg_values.iter())
        .cloned()
        .fold(0.0f64, |a, b| a.min(b));
    assert!(hogging_neg < 0.0, "There should be hogging (negative) moment at interior support");
}

// ================================================================
// 4. Portal Frame Multi-Case Combination vs Direct Solve
// ================================================================
//
// Portal frame with separate gravity and lateral load cases.
// Combination: 1.35*gravity + 1.50*lateral should match a single
// direct solve with factored loads.

#[test]
fn validation_comb_ext_portal_frame_combo() {
    let h = 4.0;
    let w = 6.0;

    // Case 1: gravity only (-20 kN at each top node)
    let input_grav = make_portal_frame(h, w, E, A, IZ, 0.0, -20.0);
    let res_grav = linear::solve_2d(&input_grav).unwrap();

    // Case 2: lateral only (10 kN at node 2)
    let input_lat = make_portal_frame(h, w, E, A, IZ, 10.0, 0.0);
    let res_lat = linear::solve_2d(&input_lat).unwrap();

    // Combine: 1.35*gravity + 1.50*lateral
    let combo = CombinationInput {
        factors: vec![
            CombinationFactor { case_id: 1, factor: 1.35 },
            CombinationFactor { case_id: 2, factor: 1.50 },
        ],
        cases: vec![
            CaseEntry { case_id: 1, results: res_grav },
            CaseEntry { case_id: 2, results: res_lat },
        ],
    };
    let combined = combine_results(&combo).unwrap();

    // Direct solve with factored loads
    // gravity: 1.35 * (-20) = -27 at nodes 2,3; lateral: 1.50 * 10 = 15 at node 2
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1usize, 2usize, 1usize, 1usize, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1usize, "fixed"), (2, 4, "fixed")];
    let direct_loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 15.0, fz: -27.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -27.0, my: 0.0 }),
    ];
    let input_direct = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        direct_loads,
    );
    let res_direct = linear::solve_2d(&input_direct).unwrap();

    // Compare displacements at all nodes
    for d_comb in &combined.displacements {
        let d_dir = res_direct.displacements.iter()
            .find(|d| d.node_id == d_comb.node_id).unwrap();
        assert_close(d_comb.ux, d_dir.ux, 1e-6,
            &format!("portal combo ux node {}", d_comb.node_id));
        assert_close(d_comb.uz, d_dir.uz, 1e-6,
            &format!("portal combo uy node {}", d_comb.node_id));
        assert_close(d_comb.ry, d_dir.ry, 1e-6,
            &format!("portal combo rz node {}", d_comb.node_id));
    }

    // Compare reactions at base nodes
    for r_comb in &combined.reactions {
        let r_dir = res_direct.reactions.iter()
            .find(|r| r.node_id == r_comb.node_id).unwrap();
        assert_close(r_comb.rx, r_dir.rx, 1e-5,
            &format!("portal combo rx node {}", r_comb.node_id));
        assert_close(r_comb.rz, r_dir.rz, 1e-5,
            &format!("portal combo ry node {}", r_comb.node_id));
        assert_close(r_comb.my, r_dir.my, 1e-5,
            &format!("portal combo mz node {}", r_comb.node_id));
    }
}

// ================================================================
// 5. Additive Decomposition: (a+b)*LC = a*LC + b*LC
// ================================================================
//
// Splitting a single factor into two parts and combining should
// yield the same result as applying the total factor at once.

#[test]
fn validation_comb_ext_additive_decomposition() {
    let n = 6;
    let l = 5.0;
    let total_factor = 2.4;
    let factor_a = 1.5;
    let factor_b = total_factor - factor_a; // 0.9

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1, fx: 0.0, fz: -30.0, my: 0.0,
    })];

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let res = linear::solve_2d(&input).unwrap();

    // LHS: single combination with total factor
    let lhs_combo = CombinationInput {
        factors: vec![CombinationFactor { case_id: 1, factor: total_factor }],
        cases: vec![CaseEntry { case_id: 1, results: res.clone() }],
    };
    let lhs = combine_results(&lhs_combo).unwrap();

    // RHS: same load case appearing twice with split factors
    // We use two different case_ids pointing to the same results
    let rhs_combo = CombinationInput {
        factors: vec![
            CombinationFactor { case_id: 1, factor: factor_a },
            CombinationFactor { case_id: 2, factor: factor_b },
        ],
        cases: vec![
            CaseEntry { case_id: 1, results: res.clone() },
            CaseEntry { case_id: 2, results: res },
        ],
    };
    let rhs = combine_results(&rhs_combo).unwrap();

    // All displacements should match
    for (l_d, r_d) in lhs.displacements.iter().zip(rhs.displacements.iter()) {
        assert_close(l_d.ux, r_d.ux, 1e-10, &format!("additive ux node {}", l_d.node_id));
        assert_close(l_d.uz, r_d.uz, 1e-10, &format!("additive uy node {}", l_d.node_id));
        assert_close(l_d.ry, r_d.ry, 1e-10, &format!("additive rz node {}", l_d.node_id));
    }

    // All reactions should match
    for (l_r, r_r) in lhs.reactions.iter().zip(rhs.reactions.iter()) {
        assert_close(l_r.rx, r_r.rx, 1e-10, &format!("additive rx node {}", l_r.node_id));
        assert_close(l_r.rz, r_r.rz, 1e-10, &format!("additive ry node {}", l_r.node_id));
        assert_close(l_r.my, r_r.my, 1e-10, &format!("additive mz node {}", l_r.node_id));
    }

    // All element forces should match
    for (l_ef, r_ef) in lhs.element_forces.iter().zip(rhs.element_forces.iter()) {
        assert_close(l_ef.n_start, r_ef.n_start, 1e-10,
            &format!("additive n_start elem {}", l_ef.element_id));
        assert_close(l_ef.v_start, r_ef.v_start, 1e-10,
            &format!("additive v_start elem {}", l_ef.element_id));
        assert_close(l_ef.m_start, r_ef.m_start, 1e-10,
            &format!("additive m_start elem {}", l_ef.element_id));
        assert_close(l_ef.m_end, r_ef.m_end, 1e-10,
            &format!("additive m_end elem {}", l_ef.element_id));
    }
}

// ================================================================
// 6. Envelope max_abs_results Tracks Governing Case Correctly
// ================================================================
//
// Three load cases with very different magnitudes. The envelope's
// max_abs_results should pick the displacement from the case
// with the largest absolute value at each DOF.

#[test]
fn validation_comb_ext_envelope_max_abs_governing() {
    let n = 6;
    let l = 4.0;

    // Case 1: small UDL -2 kN/m
    let lc1_loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -2.0, q_j: -2.0, a: None, b: None,
        }))
        .collect();

    // Case 2: large UDL -20 kN/m (governing downward)
    let lc2_loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -20.0, q_j: -20.0, a: None, b: None,
        }))
        .collect();

    // Case 3: moderate uplift +10 kN/m
    let lc3_loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: 10.0, q_j: 10.0, a: None, b: None,
        }))
        .collect();

    let res1 = linear::solve_2d(&make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), lc1_loads)).unwrap();
    let res2 = linear::solve_2d(&make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), lc2_loads)).unwrap();
    let res3 = linear::solve_2d(&make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), lc3_loads)).unwrap();

    let envelope = compute_envelope(&[res1.clone(), res2.clone(), res3.clone()]).unwrap();

    // At midspan, case 2 has the largest |uy| (downward) since it has 10x the load of case 1
    let mid_id = n / 2 + 1;
    let env_mid = envelope.max_abs_results.displacements.iter()
        .find(|d| d.node_id == mid_id).unwrap();
    let res2_mid = res2.displacements.iter()
        .find(|d| d.node_id == mid_id).unwrap();
    let res3_mid = res3.displacements.iter()
        .find(|d| d.node_id == mid_id).unwrap();

    // The envelope should pick whichever has larger |uy|
    let governing_uy = if res2_mid.uz.abs() >= res3_mid.uz.abs() {
        res2_mid.uz
    } else {
        res3_mid.uz
    };
    assert_close(env_mid.uz, governing_uy, 1e-10,
        "envelope max_abs should pick governing uy");

    // Verify envelope reactions at node 1: case 2 should govern
    let env_r1 = envelope.max_abs_results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap();
    let res2_r1 = res2.reactions.iter()
        .find(|r| r.node_id == 1).unwrap();
    assert_close(env_r1.rz, res2_r1.rz, 1e-10,
        "envelope max_abs should pick governing ry at support 1");
}

// ================================================================
// 7. 3D Combination with Distributed Loads vs Direct Solve
// ================================================================
//
// 3D cantilever with two load cases containing distributed loads.
// The combination 2.0*LC1 + 0.5*LC2 should match the direct solve
// with equivalent factored distributed loads.

#[test]
fn validation_comb_ext_3d_distributed_combo() {
    let n = 4;
    let l = 3.0;
    let nu = 0.3;
    let a = 0.01;
    let iy = 1e-4;
    let iz = 2e-4;
    let j = 1e-4;
    let fixed_dofs = vec![true, true, true, true, true, true];

    // LC1: distributed load -6 kN/m in Y on all elements
    let lc1_loads: Vec<SolverLoad3D> = (1..=n)
        .map(|i| SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: i,
            q_yi: -6.0, q_yj: -6.0,
            q_zi: 0.0, q_zj: 0.0,
            a: None, b: None,
        }))
        .collect();

    // LC2: distributed load -4 kN/m in Z on all elements
    let lc2_loads: Vec<SolverLoad3D> = (1..=n)
        .map(|i| SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: i,
            q_yi: 0.0, q_yj: 0.0,
            q_zi: -4.0, q_zj: -4.0,
            a: None, b: None,
        }))
        .collect();

    let res1 = linear::solve_3d(
        &make_3d_beam(n, l, E, nu, a, iy, iz, j, fixed_dofs.clone(), None, lc1_loads),
    ).unwrap();
    let res2 = linear::solve_3d(
        &make_3d_beam(n, l, E, nu, a, iy, iz, j, fixed_dofs.clone(), None, lc2_loads),
    ).unwrap();

    // Combine: 2.0*LC1 + 0.5*LC2
    let combo = CombinationInput3D {
        factors: vec![
            CombinationFactor { case_id: 1, factor: 2.0 },
            CombinationFactor { case_id: 2, factor: 0.5 },
        ],
        cases: vec![
            CaseEntry3D { case_id: 1, results: res1 },
            CaseEntry3D { case_id: 2, results: res2 },
        ],
    };
    let combined = combine_results_3d(&combo).unwrap();

    // Direct solve: qY = 2.0*(-6) = -12, qZ = 0.5*(-4) = -2
    let direct_loads: Vec<SolverLoad3D> = (1..=n)
        .map(|i| SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: i,
            q_yi: -12.0, q_yj: -12.0,
            q_zi: -2.0, q_zj: -2.0,
            a: None, b: None,
        }))
        .collect();
    let res_direct = linear::solve_3d(
        &make_3d_beam(n, l, E, nu, a, iy, iz, j, fixed_dofs, None, direct_loads),
    ).unwrap();

    // Compare tip displacements (node n+1)
    let tip_id = n + 1;
    let tip_comb = combined.displacements.iter().find(|d| d.node_id == tip_id).unwrap();
    let tip_dir = res_direct.displacements.iter().find(|d| d.node_id == tip_id).unwrap();

    assert_close(tip_comb.uy, tip_dir.uy, 1e-6, "3D dist combo tip uy");
    assert_close(tip_comb.uz, tip_dir.uz, 1e-6, "3D dist combo tip uz");
    assert_close(tip_comb.rz, tip_dir.rz, 1e-6, "3D dist combo tip rz");
    assert_close(tip_comb.ry, tip_dir.ry, 1e-6, "3D dist combo tip ry");

    // Compare reactions at fixed support (node 1)
    let r1_comb = combined.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r1_dir = res_direct.reactions.iter().find(|r| r.node_id == 1).unwrap();

    assert_close(r1_comb.fy, r1_dir.fy, 1e-5, "3D dist combo Fy reaction");
    assert_close(r1_comb.fz, r1_dir.fz, 1e-5, "3D dist combo Fz reaction");
    assert_close(r1_comb.my, r1_dir.my, 1e-5, "3D dist combo My reaction");
    assert_close(r1_comb.mz, r1_dir.mz, 1e-5, "3D dist combo Mz reaction");

    // Compare element forces on the first element
    let ef1_comb = combined.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef1_dir = res_direct.element_forces.iter().find(|e| e.element_id == 1).unwrap();

    assert_close(ef1_comb.vy_start, ef1_dir.vy_start, 1e-5, "3D dist combo vy_start");
    assert_close(ef1_comb.vz_start, ef1_dir.vz_start, 1e-5, "3D dist combo vz_start");
    assert_close(ef1_comb.mz_start, ef1_dir.mz_start, 1e-5, "3D dist combo mz_start");
    assert_close(ef1_comb.my_start, ef1_dir.my_start, 1e-5, "3D dist combo my_start");
}

// ================================================================
// 8. SLS Quasi-Permanent Combo: 1.0*DL + 0.3*LL + 0.0*Wind
// ================================================================
//
// Serviceability limit state combination with a zero-factor case.
// Verifies that the wind case with factor 0.0 contributes nothing,
// and the result matches 1.0*DL + 0.3*LL directly.

#[test]
fn validation_comb_ext_sls_quasi_permanent() {
    let n = 8;
    let l = 6.0;

    // DL: UDL -8 kN/m
    let dl_loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -8.0, q_j: -8.0, a: None, b: None,
        }))
        .collect();

    // LL: point load -15 kN at midspan
    let ll_loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1, fx: 0.0, fz: -15.0, my: 0.0,
    })];

    // Wind: UDL +6 kN/m (uplift)
    let wind_loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: 6.0, q_j: 6.0, a: None, b: None,
        }))
        .collect();

    let res_dl = linear::solve_2d(
        &make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), dl_loads),
    ).unwrap();
    let res_ll = linear::solve_2d(
        &make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), ll_loads),
    ).unwrap();
    let res_wind = linear::solve_2d(
        &make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), wind_loads),
    ).unwrap();

    // SLS quasi-permanent: 1.0*DL + 0.3*LL + 0.0*Wind
    let combo_with_wind = CombinationInput {
        factors: vec![
            CombinationFactor { case_id: 1, factor: 1.0 },
            CombinationFactor { case_id: 2, factor: 0.3 },
            CombinationFactor { case_id: 3, factor: 0.0 },
        ],
        cases: vec![
            CaseEntry { case_id: 1, results: res_dl.clone() },
            CaseEntry { case_id: 2, results: res_ll.clone() },
            CaseEntry { case_id: 3, results: res_wind },
        ],
    };
    let combined_with_wind = combine_results(&combo_with_wind).unwrap();

    // Same combo but without wind case at all
    let combo_no_wind = CombinationInput {
        factors: vec![
            CombinationFactor { case_id: 1, factor: 1.0 },
            CombinationFactor { case_id: 2, factor: 0.3 },
        ],
        cases: vec![
            CaseEntry { case_id: 1, results: res_dl.clone() },
            CaseEntry { case_id: 2, results: res_ll.clone() },
        ],
    };
    let combined_no_wind = combine_results(&combo_no_wind).unwrap();

    // Including wind with factor 0.0 should give identical results
    // to omitting it entirely
    for (d_w, d_nw) in combined_with_wind.displacements.iter()
        .zip(combined_no_wind.displacements.iter())
    {
        assert_close(d_w.ux, d_nw.ux, 1e-12,
            &format!("SLS ux node {}", d_w.node_id));
        assert_close(d_w.uz, d_nw.uz, 1e-12,
            &format!("SLS uy node {}", d_w.node_id));
        assert_close(d_w.ry, d_nw.ry, 1e-12,
            &format!("SLS rz node {}", d_w.node_id));
    }

    for (r_w, r_nw) in combined_with_wind.reactions.iter()
        .zip(combined_no_wind.reactions.iter())
    {
        assert_close(r_w.rx, r_nw.rx, 1e-12,
            &format!("SLS rx node {}", r_w.node_id));
        assert_close(r_w.rz, r_nw.rz, 1e-12,
            &format!("SLS ry node {}", r_w.node_id));
        assert_close(r_w.my, r_nw.my, 1e-12,
            &format!("SLS mz node {}", r_w.node_id));
    }

    // Also verify against direct solve: 1.0*(-8) + 0.3*0 = -8 UDL, 0.3*(-15) = -4.5 point
    let mut direct_loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -8.0, q_j: -8.0, a: None, b: None,
        }))
        .collect();
    direct_loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1, fx: 0.0, fz: 0.3 * (-15.0), my: 0.0,
    }));
    let res_direct = linear::solve_2d(
        &make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), direct_loads),
    ).unwrap();

    let mid_comb = combined_with_wind.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap();
    let mid_direct = res_direct.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap();
    assert_close(mid_comb.uz, mid_direct.uz, 1e-6, "SLS midspan uy vs direct");

    // Compare reactions
    let r1_comb = combined_with_wind.reactions.iter()
        .find(|r| r.node_id == 1).unwrap();
    let r1_direct = res_direct.reactions.iter()
        .find(|r| r.node_id == 1).unwrap();
    assert_close(r1_comb.rz, r1_direct.rz, 1e-6, "SLS R1_y vs direct");
}
