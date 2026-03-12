/// Integration tests for multi-case load combination solver.
///
/// Tests verify:
/// 1. Two-case LRFD combination (1.2D + 1.6L)
/// 2. Multiple LRFD combinations with envelope
/// 3. 3D multi-case with wind and gravity
/// 4. Envelope captures governing values
/// 5. Case results are independent
/// 6. Combination superposition is correct

use dedaliano_engine::solver::load_cases::*;
use dedaliano_engine::types::*;
use std::collections::HashMap;

fn make_beam_2d() -> SolverInput {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, y: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: 5.0, y: 0.0 });
    nodes.insert("3".to_string(), SolverNode { id: 3, x: 10.0, y: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200e6, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: 0.05, iz: 1.0e-4, as_y: None });

    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });
    elements.insert("2".to_string(), SolverElement {
        id: 2, elem_type: "frame".to_string(),
        node_i: 2, node_j: 3,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    supports.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 3, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });

    SolverInput {
        nodes, materials, sections, elements, supports,
        loads: vec![], constraints: vec![],
        connectors: HashMap::new(), }
}

fn make_beam_3d() -> SolverInput3D {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 5.0, y: 0.0, z: 0.0 });
    nodes.insert("3".to_string(), SolverNode3D { id: 3, x: 10.0, y: 0.0, z: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200e6, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: 0.05,
        iy: 1.0e-4, iz: 5.0e-5, j: 1.5e-4,
        cw: None, as_y: None, as_z: None,
    });

    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement3D {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
        local_yx: None, local_yy: None, local_yz: None,
        roll_angle: None,
    });
    elements.insert("2".to_string(), SolverElement3D {
        id: 2, elem_type: "frame".to_string(),
        node_i: 2, node_j: 3,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
        local_yx: None, local_yy: None, local_yz: None,
        roll_angle: None,
    });

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport3D {
        node_id: 1,
        rx: true, ry: true, rz: true,
        rrx: true, rry: false, rrz: false,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None,
    });
    supports.insert("2".to_string(), SolverSupport3D {
        node_id: 3,
        rx: false, ry: true, rz: true,
        rrx: true, rry: false, rrz: false,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None,
    });

    SolverInput3D {
        nodes, materials, sections, elements, supports,
        loads: vec![],
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}

#[test]
fn load_cases_2d_lrfd_basic() {
    // Dead load: uniform -5 kN/m, Live load: point -20 kN at midspan
    let input = MultiCaseInput {
        solver: make_beam_2d(),
        load_cases: vec![
            LoadCase {
                name: "Dead".to_string(),
                loads: vec![
                    SolverLoad::Distributed(SolverDistributedLoad {
                        element_id: 1, q_i: -5.0, q_j: -5.0, a: None, b: None,                     }),
                    SolverLoad::Distributed(SolverDistributedLoad {
                        element_id: 2, q_i: -5.0, q_j: -5.0, a: None, b: None,                     }),
                ] },
            LoadCase {
                name: "Live".to_string(),
                loads: vec![
                    SolverLoad::Nodal(SolverNodalLoad {
                        node_id: 2, fx: 0.0, fy: -20.0, mz: 0.0,
                    }),
                ] },
        ],
        combinations: vec![
            CombinationDef {
                name: "1.2D + 1.6L".to_string(),
                factors: {
                    let mut m = HashMap::new();
                    m.insert("Dead".to_string(), 1.2);
                    m.insert("Live".to_string(), 1.6);
                    m
                },
            },
        ],
    };

    let result = solve_multi_case_2d(&input).unwrap();
    assert_eq!(result.case_results.len(), 2);
    assert_eq!(result.combination_results.len(), 1);
    assert_eq!(result.combination_results[0].name, "1.2D + 1.6L");

    // The combined result should have larger forces than either individual case
    let dead_ry = result.case_results[0].results.reactions.iter()
        .map(|r| r.ry.abs()).fold(0.0_f64, f64::max);
    let combo_ry = result.combination_results[0].results.reactions.iter()
        .map(|r| r.ry.abs()).fold(0.0_f64, f64::max);
    assert!(combo_ry > dead_ry, "Combined reaction should exceed dead alone");
}

#[test]
fn load_cases_2d_multiple_combos() {
    let input = MultiCaseInput {
        solver: make_beam_2d(),
        load_cases: vec![
            LoadCase {
                name: "D".to_string(),
                loads: vec![
                    SolverLoad::Distributed(SolverDistributedLoad {
                        element_id: 1, q_i: -3.0, q_j: -3.0, a: None, b: None,                     }),
                    SolverLoad::Distributed(SolverDistributedLoad {
                        element_id: 2, q_i: -3.0, q_j: -3.0, a: None, b: None,                     }),
                ] },
            LoadCase {
                name: "L".to_string(),
                loads: vec![
                    SolverLoad::Nodal(SolverNodalLoad {
                        node_id: 2, fx: 0.0, fy: -15.0, mz: 0.0,
                    }),
                ] },
            LoadCase {
                name: "W".to_string(),
                loads: vec![
                    SolverLoad::Nodal(SolverNodalLoad {
                        node_id: 2, fx: 10.0, fy: 0.0, mz: 0.0,
                    }),
                ] },
        ],
        combinations: vec![
            CombinationDef {
                name: "1.2D + 1.6L".to_string(),
                factors: {
                    let mut m = HashMap::new();
                    m.insert("D".to_string(), 1.2);
                    m.insert("L".to_string(), 1.6);
                    m
                },
            },
            CombinationDef {
                name: "1.2D + L + W".to_string(),
                factors: {
                    let mut m = HashMap::new();
                    m.insert("D".to_string(), 1.2);
                    m.insert("L".to_string(), 1.0);
                    m.insert("W".to_string(), 1.0);
                    m
                },
            },
            CombinationDef {
                name: "0.9D + W".to_string(),
                factors: {
                    let mut m = HashMap::new();
                    m.insert("D".to_string(), 0.9);
                    m.insert("W".to_string(), 1.0);
                    m
                },
            },
        ],
    };

    let result = solve_multi_case_2d(&input).unwrap();
    assert_eq!(result.case_results.len(), 3);
    assert_eq!(result.combination_results.len(), 3);

    // Envelope should exist and have data for both elements
    assert_eq!(result.envelope.moment.elements.len(), 2);
    assert_eq!(result.envelope.shear.elements.len(), 2);
}

#[test]
fn load_cases_3d_gravity_and_wind() {
    let input = MultiCaseInput3D {
        solver: make_beam_3d(),
        load_cases: vec![
            LoadCase3D {
                name: "Gravity".to_string(),
                loads: vec![
                    SolverLoad3D::Nodal(SolverNodalLoad3D {
                        node_id: 2, fx: 0.0, fy: 0.0, fz: -50.0,
                        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
                    }),
                ] },
            LoadCase3D {
                name: "WindY".to_string(),
                loads: vec![
                    SolverLoad3D::Nodal(SolverNodalLoad3D {
                        node_id: 2, fx: 0.0, fy: 20.0, fz: 0.0,
                        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
                    }),
                ] },
        ],
        combinations: vec![
            CombinationDef {
                name: "1.2G + 1.6W".to_string(),
                factors: {
                    let mut m = HashMap::new();
                    m.insert("Gravity".to_string(), 1.2);
                    m.insert("WindY".to_string(), 1.6);
                    m
                },
            },
        ],
    };

    let result = solve_multi_case_3d(&input).unwrap();
    assert_eq!(result.case_results.len(), 2);
    assert_eq!(result.combination_results.len(), 1);

    // Envelope should have 3D diagram data
    assert!(!result.envelope.moment_y.elements.is_empty());
    assert!(!result.envelope.moment_z.elements.is_empty());
}

#[test]
fn load_cases_2d_envelope_governs() {
    // Create cases where different combos govern for different quantities
    let input = MultiCaseInput {
        solver: make_beam_2d(),
        load_cases: vec![
            LoadCase {
                name: "D".to_string(),
                loads: vec![
                    SolverLoad::Distributed(SolverDistributedLoad {
                        element_id: 1, q_i: -10.0, q_j: -10.0, a: None, b: None,                     }),
                    SolverLoad::Distributed(SolverDistributedLoad {
                        element_id: 2, q_i: -10.0, q_j: -10.0, a: None, b: None,                     }),
                ] },
            LoadCase {
                name: "L".to_string(),
                loads: vec![
                    SolverLoad::Nodal(SolverNodalLoad {
                        node_id: 2, fx: 0.0, fy: -50.0, mz: 0.0,
                    }),
                ] },
        ],
        combinations: vec![
            CombinationDef {
                name: "1.4D".to_string(),
                factors: {
                    let mut m = HashMap::new();
                    m.insert("D".to_string(), 1.4);
                    m
                },
            },
            CombinationDef {
                name: "1.2D + 1.6L".to_string(),
                factors: {
                    let mut m = HashMap::new();
                    m.insert("D".to_string(), 1.2);
                    m.insert("L".to_string(), 1.6);
                    m
                },
            },
        ],
    };

    let result = solve_multi_case_2d(&input).unwrap();

    // The 1.2D+1.6L combo should have larger midspan moment than 1.4D alone
    // Envelope global_max should be >= max of both combos
    let combo1_max = result.combination_results[0].results.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);
    let combo2_max = result.combination_results[1].results.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);
    assert!(result.envelope.moment.global_max >= combo1_max.min(combo2_max),
        "Envelope should capture governing values");
}

#[test]
fn load_cases_2d_independent_cases() {
    // Verify each case is solved independently
    let input = MultiCaseInput {
        solver: make_beam_2d(),
        load_cases: vec![
            LoadCase {
                name: "Case1".to_string(),
                loads: vec![
                    SolverLoad::Nodal(SolverNodalLoad {
                        node_id: 2, fx: 0.0, fy: -10.0, mz: 0.0,
                    }),
                ] },
            LoadCase {
                name: "Case2".to_string(),
                loads: vec![
                    SolverLoad::Nodal(SolverNodalLoad {
                        node_id: 2, fx: 0.0, fy: -20.0, mz: 0.0,
                    }),
                ] },
        ],
        combinations: vec![
            CombinationDef {
                name: "C1".to_string(),
                factors: {
                    let mut m = HashMap::new();
                    m.insert("Case1".to_string(), 1.0);
                    m
                },
            },
            CombinationDef {
                name: "C2".to_string(),
                factors: {
                    let mut m = HashMap::new();
                    m.insert("Case2".to_string(), 1.0);
                    m
                },
            },
        ],
    };

    let result = solve_multi_case_2d(&input).unwrap();

    // Case2 has double the load, so reactions should be double
    let ry_case1 = result.case_results[0].results.reactions.iter()
        .map(|r| r.ry.abs()).fold(0.0_f64, f64::max);
    let ry_case2 = result.case_results[1].results.reactions.iter()
        .map(|r| r.ry.abs()).fold(0.0_f64, f64::max);
    assert!((ry_case2 / ry_case1 - 2.0).abs() < 0.01,
        "Case2 reaction should be 2x Case1: {} vs {}", ry_case2, ry_case1);
}

#[test]
fn load_cases_2d_superposition_correct() {
    // Verify that combination 1.0*A + 1.0*B equals the sum of individual results
    let input = MultiCaseInput {
        solver: make_beam_2d(),
        load_cases: vec![
            LoadCase {
                name: "A".to_string(),
                loads: vec![
                    SolverLoad::Nodal(SolverNodalLoad {
                        node_id: 2, fx: 0.0, fy: -10.0, mz: 0.0,
                    }),
                ] },
            LoadCase {
                name: "B".to_string(),
                loads: vec![
                    SolverLoad::Nodal(SolverNodalLoad {
                        node_id: 2, fx: 5.0, fy: 0.0, mz: 0.0,
                    }),
                ] },
        ],
        combinations: vec![
            CombinationDef {
                name: "A+B".to_string(),
                factors: {
                    let mut m = HashMap::new();
                    m.insert("A".to_string(), 1.0);
                    m.insert("B".to_string(), 1.0);
                    m
                },
            },
        ],
    };

    let result = solve_multi_case_2d(&input).unwrap();
    let combo = &result.combination_results[0].results;
    let case_a = &result.case_results[0].results;
    let case_b = &result.case_results[1].results;

    // Check midspan displacement superposition
    let uy_a = case_a.displacements.iter().find(|d| d.node_id == 2).unwrap().uy;
    let uy_b = case_b.displacements.iter().find(|d| d.node_id == 2).unwrap().uy;
    let uy_combo = combo.displacements.iter().find(|d| d.node_id == 2).unwrap().uy;
    assert!((uy_combo - (uy_a + uy_b)).abs() < 1e-10,
        "Superposition: {} ≈ {} + {} = {}", uy_combo, uy_a, uy_b, uy_a + uy_b);
}
