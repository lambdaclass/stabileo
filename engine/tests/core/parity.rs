/// Parity tests — verify Rust produces same results as TS for identical inputs.
/// These mirror the TS test cases in load-cases.test.ts and diagrams.test.ts.

use crate::common::*;
use dedaliano_engine::types::*;
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::postprocess::combinations::*;
use dedaliano_engine::postprocess::diagrams::compute_diagram_value_at;
use std::collections::HashMap;

// ==================== JSON Serialization ====================

#[test]
fn test_envelope_3d_json_field_name() {
    // Verify that FullEnvelope3D serializes max_abs_results_3d as "maxAbsResults3D" (uppercase D)
    let empty_env_data = EnvelopeDiagramData {
        kind: "test".to_string(),
        elements: vec![],
        global_max: 0.0,
    };
    let env = FullEnvelope3D {
        moment_y: empty_env_data.clone(),
        moment_z: empty_env_data.clone(),
        shear_y: empty_env_data.clone(),
        shear_z: empty_env_data.clone(),
        axial: empty_env_data.clone(),
        torsion: empty_env_data,
        max_abs_results_3d: AnalysisResults3D {
            displacements: vec![],
            reactions: vec![],
            element_forces: vec![], plate_stresses: vec![], quad_stresses: vec![], quad_nodal_stresses: vec![], constraint_forces: vec![], diagnostics: vec![], solver_diagnostics: vec![], timings: None, structured_diagnostics: vec![], equilibrium: None, result_summary: None },
    };

    let json = serde_json::to_string(&env).unwrap();
    assert!(
        json.contains("\"maxAbsResults3D\""),
        "Should serialize as maxAbsResults3D (uppercase D), got: {}",
        &json[..200.min(json.len())]
    );
    assert!(
        !json.contains("\"maxAbsResults3d\""),
        "Should NOT serialize as maxAbsResults3d (lowercase d)"
    );

    // Verify round-trip
    let parsed: FullEnvelope3D = serde_json::from_str(&json).unwrap();
    assert!(parsed.max_abs_results_3d.displacements.is_empty());
}

#[test]
fn test_envelope_2d_json_field_names() {
    let empty_env_data = EnvelopeDiagramData {
        kind: "test".to_string(),
        elements: vec![],
        global_max: 1.0,
    };
    let env = FullEnvelope {
        moment: EnvelopeDiagramData { kind: "moment".to_string(), elements: vec![], global_max: 1.0 },
        shear: EnvelopeDiagramData { kind: "shear".to_string(), elements: vec![], global_max: 2.0 },
        axial: empty_env_data,
        max_abs_results: AnalysisResults {
            displacements: vec![],
            reactions: vec![],
            element_forces: vec![],
            constraint_forces: vec![],
            diagnostics: vec![],
            solver_diagnostics: vec![],
            structured_diagnostics: vec![],
            equilibrium: None,
            result_summary: None,
        },
    };

    let json = serde_json::to_string(&env).unwrap();
    assert!(json.contains("\"maxAbsResults\""), "Should have maxAbsResults field");
    assert!(json.contains("\"globalMax\""), "Should have globalMax field");

    // Verify round-trip
    let parsed: FullEnvelope = serde_json::from_str(&json).unwrap();
    assert!((parsed.moment.global_max - 1.0).abs() < 1e-10);
}

// ==================== Combination Parity (mirrors load-cases.test.ts) ====================

/// SS beam 6m, D: q=-10 kN/m, L: q=-5 kN/m
/// Mirrors "Load case combination: simple beam D + L" in load-cases.test.ts
#[test]
fn test_parity_ss_beam_combination_d_plus_l() {
    let base_nodes = vec![(1, 0.0, 0.0), (2, 6.0, 0.0)];
    let mats = vec![(1, 200e3, 0.3)];
    let secs = vec![(1, 0.01, 0.0001)];
    let elems = vec![(1, "frame", 1, 2, 1, 1, false, false)];
    let sups = vec![(1, 1, "pinned"), (2, 2, "rollerX")];

    // D case: q = -10 kN/m → Ry each = 30 kN
    let result_d = solve_2d(&make_input(
        base_nodes.clone(), mats.clone(), secs.clone(), elems.clone(), sups.clone(),
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -10.0, q_j: -10.0, a: None, b: None,
        })],
    )).unwrap();

    // L case: q = -5 kN/m → Ry each = 15 kN
    let result_l = solve_2d(&make_input(
        base_nodes, mats, secs, elems, sups,
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -5.0, q_j: -5.0, a: None, b: None,
        })],
    )).unwrap();

    // Verify individual case results (same as TS)
    let ry1_d = result_d.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let ry1_l = result_l.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    assert!((ry1_d - 30.0).abs() < 0.01, "Ry1(D) should be 30, got {}", ry1_d);
    assert!((ry1_l - 15.0).abs() < 0.01, "Ry1(L) should be 15, got {}", ry1_l);

    // Combine: 1.2D + 1.6L → expected Ry1 = 1.2*30 + 1.6*15 = 60
    let combined = combine_results(&CombinationInput {
        factors: vec![
            CombinationFactor { case_id: 1, factor: 1.2 },
            CombinationFactor { case_id: 2, factor: 1.6 },
        ],
        cases: vec![
            CaseEntry { case_id: 1, results: result_d.clone() },
            CaseEntry { case_id: 2, results: result_l.clone() },
        ],
    }).unwrap();

    let ry1_combined = combined.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let ry2_combined = combined.reactions.iter().find(|r| r.node_id == 2).unwrap().ry;
    assert!((ry1_combined - 60.0).abs() < 0.01, "Combined Ry1 should be 60, got {}", ry1_combined);
    assert!((ry2_combined - 60.0).abs() < 0.01, "Combined Ry2 should be 60, got {}", ry2_combined);

    // Check displacement superposition
    let uy2_d = result_d.displacements.iter().find(|d| d.node_id == 2).unwrap().uy;
    let uy2_l = result_l.displacements.iter().find(|d| d.node_id == 2).unwrap().uy;
    let uy2_combined = combined.displacements.iter().find(|d| d.node_id == 2).unwrap().uy;
    let expected_uy2 = 1.2 * uy2_d + 1.6 * uy2_l;
    assert!(
        (uy2_combined - expected_uy2).abs() < 1e-10,
        "Combined uy2: expected {}, got {}", expected_uy2, uy2_combined
    );

    // 1.4D combination → Ry1 = 1.4*30 = 42
    let combined_14d = combine_results(&CombinationInput {
        factors: vec![CombinationFactor { case_id: 1, factor: 1.4 }],
        cases: vec![CaseEntry { case_id: 1, results: result_d }],
    }).unwrap();
    let ry1_14d = combined_14d.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    assert!((ry1_14d - 42.0).abs() < 0.01, "1.4D Ry1 should be 42, got {}", ry1_14d);
}

/// Portal frame D + L + W — mirrors load-cases.test.ts
#[test]
fn test_parity_portal_frame_combination() {
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, 4.0), (3, 6.0, 4.0), (4, 6.0, 0.0)];
    let mats = vec![(1, 200e3, 0.3)];
    let secs = vec![(1, 0.01, 0.0001)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];

    let result_d = solve_2d(&make_input(
        nodes.clone(), mats.clone(), secs.clone(), elems.clone(), sups.clone(),
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: -10.0, q_j: -10.0, a: None, b: None,
        })],
    )).unwrap();

    let result_l = solve_2d(&make_input(
        nodes.clone(), mats.clone(), secs.clone(), elems.clone(), sups.clone(),
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: -5.0, q_j: -5.0, a: None, b: None,
        })],
    )).unwrap();

    let result_w = solve_2d(&make_input(
        nodes, mats, secs, elems, sups,
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 10.0, fy: 0.0, mz: 0.0 })],
    )).unwrap();

    // Verify totals match TS expectations
    let total_ry_d: f64 = result_d.reactions.iter().map(|r| r.ry).sum();
    let total_ry_l: f64 = result_l.reactions.iter().map(|r| r.ry).sum();
    let total_rx_w: f64 = result_w.reactions.iter().map(|r| r.rx).sum();
    assert!((total_ry_d - 60.0).abs() < 1.0);
    assert!((total_ry_l - 30.0).abs() < 1.0);
    assert!((total_rx_w + 10.0).abs() < 0.5);

    // 1.2D + L + 1.6W → total Ry=102, total Rx=-16
    let combined = combine_results(&CombinationInput {
        factors: vec![
            CombinationFactor { case_id: 1, factor: 1.2 },
            CombinationFactor { case_id: 2, factor: 1.0 },
            CombinationFactor { case_id: 3, factor: 1.6 },
        ],
        cases: vec![
            CaseEntry { case_id: 1, results: result_d.clone() },
            CaseEntry { case_id: 2, results: result_l },
            CaseEntry { case_id: 3, results: result_w.clone() },
        ],
    }).unwrap();

    let total_ry: f64 = combined.reactions.iter().map(|r| r.ry).sum();
    let total_rx: f64 = combined.reactions.iter().map(|r| r.rx).sum();
    assert!((total_ry - 102.0).abs() < 1.0, "1.2D+L+1.6W total Ry should be 102, got {}", total_ry);
    assert!((total_rx + 16.0).abs() < 1.0, "1.2D+L+1.6W total Rx should be -16, got {}", total_rx);

    // 0.9D + 1.6W → total Ry=54
    let combined_09d = combine_results(&CombinationInput {
        factors: vec![
            CombinationFactor { case_id: 1, factor: 0.9 },
            CombinationFactor { case_id: 3, factor: 1.6 },
        ],
        cases: vec![
            CaseEntry { case_id: 1, results: result_d },
            CaseEntry { case_id: 3, results: result_w },
        ],
    }).unwrap();
    let total_ry_09d: f64 = combined_09d.reactions.iter().map(|r| r.ry).sum();
    assert!((total_ry_09d - 54.0).abs() < 1.0, "0.9D+1.6W total Ry should be 54, got {}", total_ry_09d);
}

// ==================== Envelope Parity ====================

#[test]
fn test_parity_envelope_extremes() {
    let base_nodes = vec![(1, 0.0, 0.0), (2, 6.0, 0.0)];
    let mats = vec![(1, 200e3, 0.3)];
    let secs = vec![(1, 0.01, 0.0001)];
    let elems = vec![(1, "frame", 1, 2, 1, 1, false, false)];
    let sups = vec![(1, 1, "pinned"), (2, 2, "rollerX")];

    let result_d = solve_2d(&make_input(
        base_nodes.clone(), mats.clone(), secs.clone(), elems.clone(), sups.clone(),
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -10.0, q_j: -10.0, a: None, b: None,
        })],
    )).unwrap();

    let result_l = solve_2d(&make_input(
        base_nodes, mats, secs, elems, sups,
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -5.0, q_j: -5.0, a: None, b: None,
        })],
    )).unwrap();

    // 3 combinations: 1.4D, 1.2D+1.6L, 0.9D
    let combo1 = combine_results(&CombinationInput {
        factors: vec![CombinationFactor { case_id: 1, factor: 1.4 }],
        cases: vec![CaseEntry { case_id: 1, results: result_d.clone() }],
    }).unwrap();
    let combo2 = combine_results(&CombinationInput {
        factors: vec![
            CombinationFactor { case_id: 1, factor: 1.2 },
            CombinationFactor { case_id: 2, factor: 1.6 },
        ],
        cases: vec![
            CaseEntry { case_id: 1, results: result_d.clone() },
            CaseEntry { case_id: 2, results: result_l.clone() },
        ],
    }).unwrap();
    let combo3 = combine_results(&CombinationInput {
        factors: vec![CombinationFactor { case_id: 1, factor: 0.9 }],
        cases: vec![CaseEntry { case_id: 1, results: result_d }],
    }).unwrap();

    // Verify reactions match TS expectations
    let ry1_c1 = combo1.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let ry1_c2 = combo2.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let ry1_c3 = combo3.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    assert!((ry1_c1 - 42.0).abs() < 0.1, "Combo1 Ry1=42, got {}", ry1_c1);
    assert!((ry1_c2 - 60.0).abs() < 0.1, "Combo2 Ry1=60, got {}", ry1_c2);
    assert!((ry1_c3 - 27.0).abs() < 0.1, "Combo3 Ry1=27, got {}", ry1_c3);

    // Compute envelope
    let envelope = compute_envelope(&[combo1, combo2, combo3]).unwrap();

    // Envelope moment: max should be ≥80 (1.2D+1.6L midspan M = 20*36/8 = 90)
    assert!(
        envelope.moment.global_max > 80.0,
        "Envelope moment max should be ≥80, got {}", envelope.moment.global_max
    );

    // maxAbsResults should have max absolute Ry1 = 60
    let max_ry1 = envelope.max_abs_results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().ry;
    assert!((max_ry1 - 60.0).abs() < 0.1, "Envelope maxAbs Ry1 should be 60, got {}", max_ry1);
}

// ==================== Superposition Principle ====================

/// Direct solve of combined load = superposition of individual solves
#[test]
fn test_parity_superposition_principle() {
    let base_nodes = vec![(1, 0.0, 0.0), (2, 6.0, 0.0)];
    let mats = vec![(1, 200e3, 0.3)];
    let secs = vec![(1, 0.01, 0.0001)];
    let elems = vec![(1, "frame", 1, 2, 1, 1, false, false)];
    let sups = vec![(1, 1, "pinned"), (2, 2, "rollerX")];

    let result_d = solve_2d(&make_input(
        base_nodes.clone(), mats.clone(), secs.clone(), elems.clone(), sups.clone(),
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -10.0, q_j: -10.0, a: None, b: None,
        })],
    )).unwrap();

    let result_l = solve_2d(&make_input(
        base_nodes.clone(), mats.clone(), secs.clone(), elems.clone(), sups.clone(),
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -5.0, q_j: -5.0, a: None, b: None,
        })],
    )).unwrap();

    // Direct solve: q = 1.2*(-10) + 1.6*(-5) = -20 kN/m
    let result_direct = solve_2d(&make_input(
        base_nodes, mats, secs, elems, sups,
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -20.0, q_j: -20.0, a: None, b: None,
        })],
    )).unwrap();

    // Combine via Rust combiner
    let combined = combine_results(&CombinationInput {
        factors: vec![
            CombinationFactor { case_id: 1, factor: 1.2 },
            CombinationFactor { case_id: 2, factor: 1.6 },
        ],
        cases: vec![
            CaseEntry { case_id: 1, results: result_d },
            CaseEntry { case_id: 2, results: result_l },
        ],
    }).unwrap();

    // Compare combined vs direct — should match within floating point
    for i in 0..combined.displacements.len() {
        let c = &combined.displacements[i];
        let d = &result_direct.displacements[i];
        assert!(
            (c.ux - d.ux).abs() < 1e-8 && (c.uy - d.uy).abs() < 1e-8 && (c.rz - d.rz).abs() < 1e-8,
            "Displacement mismatch at node {}", c.node_id
        );
    }
    for i in 0..combined.reactions.len() {
        let c = &combined.reactions[i];
        let d = &result_direct.reactions[i];
        assert!(
            (c.rx - d.rx).abs() < 1e-6 && (c.ry - d.ry).abs() < 1e-6 && (c.mz - d.mz).abs() < 1e-6,
            "Reaction mismatch at node {}", c.node_id
        );
    }
    for i in 0..combined.element_forces.len() {
        let c = &combined.element_forces[i];
        let d = &result_direct.element_forces[i];
        assert!(
            (c.m_start - d.m_start).abs() < 1e-6
            && (c.m_end - d.m_end).abs() < 1e-6
            && (c.v_start - d.v_start).abs() < 1e-6
            && (c.n_start - d.n_start).abs() < 1e-6,
            "Element forces mismatch at elem {}", c.element_id
        );
    }
}

// ==================== Diagram Value Parity ====================

#[test]
fn test_parity_diagram_values_ss_beam_udl() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0)],
        vec![(1, 200e3, 0.3)],
        vec![(1, 0.01, 0.0001)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -10.0, q_j: -10.0, a: None, b: None,
        })],
    );
    let results = solve_2d(&input).unwrap();
    let ef = &results.element_forces[0];

    // M(0.5) = qL²/8 = 10*36/8 = 45
    let m_mid = compute_diagram_value_at("moment", 0.5, ef);
    assert!((m_mid.abs() - 45.0).abs() < 0.5, "M(0.5) should be ~45, got {}", m_mid);

    // M at supports = 0
    assert!(compute_diagram_value_at("moment", 0.0, ef).abs() < 0.5);
    assert!(compute_diagram_value_at("moment", 1.0, ef).abs() < 0.5);

    // V(0) = qL/2 = 30
    let v_start = compute_diagram_value_at("shear", 0.0, ef);
    assert!((v_start.abs() - 30.0).abs() < 0.5, "V(0) should be ~30, got {}", v_start);

    // V(0.5) = 0
    assert!(compute_diagram_value_at("shear", 0.5, ef).abs() < 0.5);

    // N = 0 everywhere
    assert!(compute_diagram_value_at("axial", 0.0, ef).abs() < 0.01);
    assert!(compute_diagram_value_at("axial", 0.5, ef).abs() < 0.01);
}

#[test]
fn test_parity_diagram_values_cantilever() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
        vec![(1, 200e3, 0.3)],
        vec![(1, 0.01, 0.0001)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: -50.0, mz: 0.0 })],
    );
    let results = solve_2d(&input).unwrap();
    let ef = &results.element_forces[0];

    // M(0) = PL = 50*4 = 200
    let m_fixed = compute_diagram_value_at("moment", 0.0, ef);
    assert!((m_fixed.abs() - 200.0).abs() < 1.0, "M(0) should be ~200, got {}", m_fixed);

    // M(1) = 0
    assert!(compute_diagram_value_at("moment", 1.0, ef).abs() < 1.0);

    // V constant = 50
    let v = compute_diagram_value_at("shear", 0.5, ef);
    assert!((v.abs() - 50.0).abs() < 0.5, "V should be ~50, got {}", v);
}

// ==================== Solver Precision ====================

#[test]
fn test_parity_solver_ss_beam_point_load_deflection() {
    // SS beam L=10m, P=-100kN at midspan → delta = PL³/(48EI)
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 5.0, 0.0), (3, 10.0, 0.0)],
        vec![(1, 200e3, 0.3)],
        vec![(1, 0.01, 0.0001)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 3, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: -100.0, mz: 0.0 })],
    );
    let results = solve_2d(&input).unwrap();

    // Reactions: each 50 kN
    let ry1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let ry3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap().ry;
    assert!((ry1 - 50.0).abs() < 0.01);
    assert!((ry3 - 50.0).abs() < 0.01);

    // Deflection: PL³/(48EI) with E in kN/m² (200e3 MPa = 200e6 kN/m²)
    let uy2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().uy;
    let expected = -100.0 * 10.0_f64.powi(3) / (48.0 * 200e6 * 0.0001);
    assert!(
        (uy2 - expected).abs() / expected.abs() < 0.01,
        "Midspan uy should be {:.4}, got {:.4}", expected, uy2
    );
}

// ==================== 3D JSON Roundtrip ====================

#[test]
fn test_parity_3d_envelope_json_roundtrip() {
    // Build a simple 3D cantilever, solve, compute envelope, verify JSON field names
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 6.0, y: 0.0, z: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200e3, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: 0.01, iy: 0.0001, iz: 0.0001, j: 0.0002, cw: None,
        as_y: None, as_z: None,
    });

    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement3D {
        id: 1,
        elem_type: "frame".to_string(),
        node_i: 1, node_j: 2,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
        local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
    });

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport3D {
        node_id: 1,
        rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
            });

    let input = SolverInput3D {
        nodes, materials, sections, elements, supports,
        loads: vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: -10.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
        constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_beams: vec![],
            curved_shells: HashMap::new(),
        connectors: HashMap::new(),    };

    let results = solve_3d(&input).unwrap();

    // Compute 3D envelope from single result
    let envelope = compute_envelope_3d(&[results]).unwrap();

    // Serialize and verify field names
    let json = serde_json::to_string(&envelope).unwrap();
    assert!(json.contains("\"maxAbsResults3D\""), "Should contain maxAbsResults3D");
    assert!(json.contains("\"momentY\""));
    assert!(json.contains("\"momentZ\""));
    assert!(json.contains("\"shearY\""));
    assert!(json.contains("\"shearZ\""));

    // Deserialize and verify round-trip
    let parsed: FullEnvelope3D = serde_json::from_str(&json).unwrap();
    assert!(!parsed.max_abs_results_3d.element_forces.is_empty());
    assert!(!parsed.max_abs_results_3d.displacements.is_empty());
}

// ==================== 3D Combination ====================

#[test]
fn test_parity_3d_combination_superposition() {
    // 3D cantilever: combine two load cases and verify superposition
    let make_3d_cantilever = |loads: Vec<SolverLoad3D>| -> SolverInput3D {
        let mut nodes = HashMap::new();
        nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
        nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 6.0, y: 0.0, z: 0.0 });

        let mut materials = HashMap::new();
        materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200e3, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".to_string(), SolverSection3D {
            id: 1, name: None, a: 0.01, iy: 0.0001, iz: 0.0001, j: 0.0002, cw: None,
        as_y: None, as_z: None,
    });

        let mut elements = HashMap::new();
        elements.insert("1".to_string(), SolverElement3D {
            id: 1, elem_type: "frame".to_string(),
            node_i: 1, node_j: 2, material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });

        let mut supports = HashMap::new();
        supports.insert("1".to_string(), SolverSupport3D {
            node_id: 1,
            rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
            kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
            });

        SolverInput3D { nodes, materials, sections, elements, supports, loads, constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(), curved_beams: vec![] , connectors: HashMap::new() }
    };

    // Case 1: Fy = -10 kN at tip
    let r1 = solve_3d(&make_3d_cantilever(vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: -10.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None }),
    ])).unwrap();

    // Case 2: Fz = -5 kN at tip
    let r2 = solve_3d(&make_3d_cantilever(vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 0.0, fz: -5.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None }),
    ])).unwrap();

    // Direct solve: Fy=-20, Fz=-8 (1.2*(-10) + 1.6*0 = -12 Fy? no: let's use 2.0*case1 + 1.0*case2)
    let r_direct = solve_3d(&make_3d_cantilever(vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: -20.0, fz: -5.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None }),
    ])).unwrap();

    // Combine: 2.0*case1 + 1.0*case2
    let combined = combine_results_3d(&CombinationInput3D {
        factors: vec![
            CombinationFactor { case_id: 1, factor: 2.0 },
            CombinationFactor { case_id: 2, factor: 1.0 },
        ],
        cases: vec![
            CaseEntry3D { case_id: 1, results: r1 },
            CaseEntry3D { case_id: 2, results: r2 },
        ],
    }).unwrap();

    // Compare displacements
    for i in 0..combined.displacements.len() {
        let c = &combined.displacements[i];
        let d = &r_direct.displacements[i];
        assert!(
            (c.uy - d.uy).abs() < 1e-8 && (c.uz - d.uz).abs() < 1e-8,
            "3D displacement mismatch at node {}: combined uy={:.6} uz={:.6}, direct uy={:.6} uz={:.6}",
            c.node_id, c.uy, c.uz, d.uy, d.uz
        );
    }

    // Compare reactions
    for i in 0..combined.reactions.len() {
        let c = &combined.reactions[i];
        let d = &r_direct.reactions[i];
        assert!(
            (c.fy - d.fy).abs() < 1e-4 && (c.fz - d.fz).abs() < 1e-4,
            "3D reaction mismatch at node {}", c.node_id
        );
    }
}
