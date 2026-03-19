use crate::common::*;
use dedaliano_engine::types::*;
use dedaliano_engine::solver::linear::solve_2d;
use dedaliano_engine::postprocess::diagrams::*;
use dedaliano_engine::postprocess::combinations::*;
use dedaliano_engine::postprocess::influence::*;
use dedaliano_engine::postprocess::section_stress::*;

// ==================== Diagram Tests ====================

#[test]
fn test_ss_beam_udl_parabolic_moment() {
    // SS beam L=6m, UDL q=-10 kN/m
    // M_max = qL²/8 = 10*36/8 = 45 kN·m at midspan
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -10.0, q_j: -10.0, a: None, b: None,
        })],
    );
    let results = solve_2d(&input).unwrap();
    let ef = &results.element_forces[0];

    // Moment at midspan (t=0.5)
    let m_mid = compute_diagram_value_at("moment", 0.5, ef);
    assert!(
        (m_mid.abs() - 45.0).abs() < 1.0,
        "Midspan moment should be ~45 kN·m, got {}", m_mid
    );

    // Moment at supports should be ~0
    let m_start = compute_diagram_value_at("moment", 0.0, ef);
    let m_end = compute_diagram_value_at("moment", 1.0, ef);
    assert!(m_start.abs() < 0.5, "Moment at start should be ~0, got {}", m_start);
    assert!(m_end.abs() < 0.5, "Moment at end should be ~0, got {}", m_end);

    // Shear at supports: V = ±qL/2 = ±30
    let v_start = compute_diagram_value_at("shear", 0.0, ef);
    let v_end = compute_diagram_value_at("shear", 1.0, ef);
    assert!(
        (v_start.abs() - 30.0).abs() < 1.0,
        "Shear at start should be ~30, got {}", v_start
    );
    assert!(
        (v_end.abs() - 30.0).abs() < 1.0,
        "Shear at end should be ~30, got {}", v_end
    );
}

#[test]
fn test_cantilever_point_load_linear_moment() {
    // Cantilever L=4m, P=-50 kN at free end
    // M(0) = -P*L = 200, M(L) = 0
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -50.0, my: 0.0 })],
    );
    let results = solve_2d(&input).unwrap();
    let ef = &results.element_forces[0];

    let m_fixed = compute_diagram_value_at("moment", 0.0, ef);
    assert!(
        (m_fixed.abs() - 200.0).abs() < 2.0,
        "Moment at fixed end should be ~200, got {}", m_fixed
    );

    let m_free = compute_diagram_value_at("moment", 1.0, ef);
    assert!(
        m_free.abs() < 1.0,
        "Moment at free end should be ~0, got {}", m_free
    );
}

#[test]
fn test_diagrams_all_computed() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -10.0, q_j: -10.0, a: None, b: None,
        })],
    );
    let results = solve_2d(&input).unwrap();
    let diagrams = compute_diagrams_2d(&input, &results);

    assert_eq!(diagrams.moment.len(), 1);
    assert_eq!(diagrams.shear.len(), 1);
    assert_eq!(diagrams.axial.len(), 1);
    assert!(!diagrams.moment[0].points.is_empty());
}

// ==================== Combination Tests ====================

#[test]
fn test_combination_two_cases() {
    let input1 = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -10.0, my: 0.0 })],
    );
    let r1 = solve_2d(&input1).unwrap();

    let input2 = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -5.0, q_j: -5.0, a: None, b: None,
        })],
    );
    let r2 = solve_2d(&input2).unwrap();

    // Combine: 1.35*case0 + 1.50*case1
    let combo = CombinationInput {
        factors: vec![
            CombinationFactor { case_id: 0, factor: 1.35 },
            CombinationFactor { case_id: 1, factor: 1.50 },
        ],
        cases: vec![
            CaseEntry { case_id: 0, results: r1.clone() },
            CaseEntry { case_id: 1, results: r2.clone() },
        ],
    };

    let combined = combine_results(&combo).unwrap();

    // Check displacements are linearly combined
    let d1 = r1.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d2 = r2.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let dc = combined.displacements.iter().find(|d| d.node_id == 2).unwrap();

    let expected_uy = 1.35 * d1.uz + 1.50 * d2.uz;
    assert!(
        (dc.uz - expected_uy).abs() < 1e-6,
        "Combined uy should be {}, got {}", expected_uy, dc.uz
    );
}

#[test]
fn test_envelope_min_max() {
    let input1 = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -10.0, my: 0.0 })],
    );
    let r1 = solve_2d(&input1).unwrap();

    let input2 = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -5.0, q_j: -5.0, a: None, b: None,
        })],
    );
    let r2 = solve_2d(&input2).unwrap();

    let envelope = compute_envelope(&[r1, r2]);
    assert!(envelope.is_some(), "Envelope should be computed");
    let env = envelope.unwrap();
    assert!(!env.moment.elements.is_empty());
    assert!(!env.shear.elements.is_empty());

    // Global max should be non-zero
    assert!(env.moment.global_max > 0.0, "Moment global max should be positive");
}

// ==================== Influence Line Tests ====================

#[test]
fn test_influence_line_ss_beam_reaction() {
    // SS beam, influence line for Ry at node 1
    // Should be: peak = 1.0 at x=0, 0 at x=L
    let solver_input = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![],
    );

    let il_input = InfluenceLineInput {
        solver: solver_input,
        quantity: "Ry".to_string(),
        target_node_id: Some(1),
        target_element_id: None,
        target_position: 0.5,
        n_points_per_element: 10,
    };

    let result = compute_influence_line(&il_input).unwrap();
    assert!(!result.points.is_empty(), "Should have influence line points");

    // Find the point closest to x=0 (should have value ~1.0)
    let at_start = result.points.iter()
        .min_by(|a, b| a.x.abs().partial_cmp(&b.x.abs()).unwrap())
        .unwrap();
    assert!(
        (at_start.value - 1.0).abs() < 0.1,
        "Ry influence at x=0 should be ~1.0, got {}", at_start.value
    );

    // Find the point closest to x=L (should have value ~0)
    let at_end = result.points.iter()
        .min_by(|a, b| (a.x - 6.0).abs().partial_cmp(&(b.x - 6.0).abs()).unwrap())
        .unwrap();
    assert!(
        at_end.value.abs() < 0.1,
        "Ry influence at x=L should be ~0, got {}", at_end.value
    );
}

// ==================== Section Stress Tests ====================

#[test]
fn test_rect_pure_bending_normal_stress() {
    // Rectangular section b=0.3m, h=0.5m under pure bending M=100 kN·m
    // sigma_max = M*y_max/Iz = 100*0.25/0.003125 = 8000 kN/m² = 8.0 MPa
    let section = SectionGeometry {
        shape: "rect".to_string(),
        h: 0.5,
        b: 0.3,
        tw: None,
        tf: None,
        t: None,
        a: 0.15,       // 0.3*0.5
        iy: 0.003125,  // placeholder
        iz: 0.003125,  // 0.3*0.5^3/12
        j: None,
    };

    let ef = ElementForces {
        element_id: 1,
        n_start: 0.0,
        v_start: 0.0,
        m_start: 100.0,
        n_end: 0.0,
        v_end: 0.0,
        m_end: -100.0,
        length: 6.0,
        q_i: 0.0,
        q_j: 0.0,
        point_loads: vec![],
        distributed_loads: vec![],
        hinge_start: false,
        hinge_end: false,
    };

    let input = SectionStressInput {
        element_forces: ef,
        section,
        fy: Some(250.0),
        t: 0.0,
        y_fiber: None,
    };

    let result = compute_section_stress_2d(&input);

    // Check max normal stress
    let max_sigma = result.distribution.iter()
        .map(|p| p.sigma.abs())
        .fold(0.0_f64, f64::max);

    // 8.0 MPa
    assert!(
        (max_sigma - 8.0).abs() < 0.5,
        "Max normal stress should be ~8.0 MPa, got {}", max_sigma
    );
}

#[test]
fn test_rect_pure_shear_parabolic_tau() {
    // Rectangular section b=0.3m, h=0.5m under pure shear V=100 kN
    // tau_max at NA = 3V/(2A) = 3*100/(2*0.15) = 1000 kN/m² = 1.0 MPa
    let section = SectionGeometry {
        shape: "rect".to_string(),
        h: 0.5,
        b: 0.3,
        tw: None,
        tf: None,
        t: None,
        a: 0.15,
        iy: 0.003125,
        iz: 0.003125,
        j: None,
    };

    let ef = ElementForces {
        element_id: 1,
        n_start: 0.0,
        v_start: 100.0,
        m_start: 0.0,
        n_end: 0.0,
        v_end: -100.0,
        m_end: 0.0,
        length: 6.0,
        q_i: 0.0,
        q_j: 0.0,
        point_loads: vec![],
        distributed_loads: vec![],
        hinge_start: false,
        hinge_end: false,
    };

    let input = SectionStressInput {
        element_forces: ef,
        section,
        fy: Some(250.0),
        t: 0.0,
        y_fiber: None,
    };

    let result = compute_section_stress_2d(&input);

    // Find tau at neutral axis (y closest to 0)
    let tau_at_na = result.distribution.iter()
        .min_by(|a, b| a.y.abs().partial_cmp(&b.y.abs()).unwrap())
        .unwrap();

    assert!(
        (tau_at_na.tau.abs() - 1.0).abs() < 0.15,
        "Shear stress at NA should be ~1.0 MPa, got {}", tau_at_na.tau
    );
}

#[test]
fn test_failure_check_exists() {
    let section = SectionGeometry {
        shape: "rect".to_string(),
        h: 0.5,
        b: 0.3,
        tw: None,
        tf: None,
        t: None,
        a: 0.15,
        iy: 0.003125,
        iz: 0.003125,
        j: None,
    };

    let ef = ElementForces {
        element_id: 1,
        n_start: 0.0,
        v_start: 100.0,
        m_start: 100.0,
        n_end: 0.0,
        v_end: -100.0,
        m_end: -100.0,
        length: 6.0,
        q_i: 0.0,
        q_j: 0.0,
        point_loads: vec![],
        distributed_loads: vec![],
        hinge_start: false,
        hinge_end: false,
    };

    let input = SectionStressInput {
        element_forces: ef,
        section,
        fy: Some(250.0),
        t: 0.0,
        y_fiber: None,
    };

    let result = compute_section_stress_2d(&input);

    // Von Mises should be non-negative
    assert!(result.failure.von_mises >= 0.0, "Von Mises should be non-negative");

    // Mohr circle should have non-negative radius
    assert!(result.mohr.radius >= 0.0, "Mohr radius should be non-negative");
}
