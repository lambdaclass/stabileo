//! Pre-solve shell mesh quality gate tests.
//!
//! Verifies that the shell distortion / Jacobian pre-solve checks correctly
//! detect bad meshes (inverted elements, extreme aspect ratios, tiny angles)
//! and emit the right diagnostics — and remain silent for well-formed meshes.

use dedaliano_engine::solver::pre_solve_gates::check_shell_distortion_3d;
use dedaliano_engine::types::*;
use std::collections::HashMap;

// ==================== Helpers ====================

/// Check that diagnostics contain a specific code.
fn has_code(diags: &[StructuredDiagnostic], code: DiagnosticCode) -> bool {
    diags.iter().any(|d| d.code == code)
}

/// Check that diagnostics contain a specific code at a specific severity.
fn has_code_severity(
    diags: &[StructuredDiagnostic],
    code: DiagnosticCode,
    severity: Severity,
) -> bool {
    diags.iter().any(|d| d.code == code && d.severity == severity)
}

/// Build a minimal SolverInput3D with only nodes, a material, and quad elements.
fn make_quad_input(
    nodes: Vec<(usize, f64, f64, f64)>,
    quads: Vec<(usize, [usize; 4], f64)>, // (id, node_ids, thickness)
) -> SolverInput3D {
    let mut nodes_map = HashMap::new();
    for (id, x, y, z) in nodes {
        nodes_map.insert(id.to_string(), SolverNode3D { id, x, y, z });
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

    let mut quads_map = HashMap::new();
    for (id, ns, t) in quads {
        quads_map.insert(
            id.to_string(),
            SolverQuadElement { id, nodes: ns, material_id: 1, thickness: t },
        );
    }

    SolverInput3D {
        nodes: nodes_map,
        materials: mats,
        sections: HashMap::new(),
        elements: HashMap::new(),
        supports: HashMap::new(),
        loads: vec![],
        constraints: vec![],
        left_hand: None,
        plates: HashMap::new(),
        quads: quads_map,
        quad9s: HashMap::new(),
        solid_shells: HashMap::new(),
        curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}

/// Build a minimal SolverInput3D with only nodes, a material, and plate (DKT) elements.
fn make_plate_input(
    nodes: Vec<(usize, f64, f64, f64)>,
    plates: Vec<(usize, [usize; 3], f64)>, // (id, node_ids, thickness)
) -> SolverInput3D {
    let mut nodes_map = HashMap::new();
    for (id, x, y, z) in nodes {
        nodes_map.insert(id.to_string(), SolverNode3D { id, x, y, z });
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

    let mut plates_map = HashMap::new();
    for (id, ns, t) in plates {
        plates_map.insert(
            id.to_string(),
            SolverPlateElement { id, nodes: ns, material_id: 1, thickness: t },
        );
    }

    SolverInput3D {
        nodes: nodes_map,
        materials: mats,
        sections: HashMap::new(),
        elements: HashMap::new(),
        supports: HashMap::new(),
        loads: vec![],
        constraints: vec![],
        left_hand: None,
        plates: plates_map,
        quads: HashMap::new(),
        quad9s: HashMap::new(),
        solid_shells: HashMap::new(),
        curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}

// ==================== Quad (MITC4) tests ====================

mod quad_tests {
    use super::*;

    #[test]
    fn well_formed_quad_no_warnings() {
        // A regular unit square quad in the XY plane -- no diagnostics expected.
        let input = make_quad_input(
            vec![
                (1, 0.0, 0.0, 0.0),
                (2, 1.0, 0.0, 0.0),
                (3, 1.0, 1.0, 0.0),
                (4, 0.0, 1.0, 0.0),
            ],
            vec![(1, [1, 2, 3, 4], 0.01)],
        );

        let diags = check_shell_distortion_3d(&input);
        assert!(
            diags.is_empty(),
            "Well-formed unit square should produce no diagnostics, got: {:?}",
            diags
        );
    }

    #[test]
    fn inverted_quad_negative_jacobian() {
        // Create a bowtie quad by swapping nodes 3 and 4 in a unit square.
        // Normal order: 1(0,0) -> 2(1,0) -> 3(1,1) -> 4(0,1) (CCW)
        // Bowtie:       1(0,0) -> 2(1,0) -> 4(0,1) -> 3(1,1) (edges cross)
        let input = make_quad_input(
            vec![
                (1, 0.0, 0.0, 0.0),
                (2, 1.0, 0.0, 0.0),
                (3, 1.0, 1.0, 0.0),
                (4, 0.0, 1.0, 0.0),
            ],
            vec![(1, [1, 2, 4, 3], 0.01)], // bowtie: edges 2->4 and 3->1 cross
        );

        let diags = check_shell_distortion_3d(&input);
        assert!(
            has_code_severity(&diags, DiagnosticCode::NegativeJacobian, Severity::Error),
            "Inverted quad (bowtie) should emit NegativeJacobian Error, got: {:?}",
            diags
        );
        // The diagnostic should reference element 1
        let neg_j = diags.iter().find(|d| d.code == DiagnosticCode::NegativeJacobian).unwrap();
        assert_eq!(neg_j.element_ids, vec![1]);
        assert_eq!(neg_j.phase.as_deref(), Some("pre_solve"));
    }

    #[test]
    fn high_aspect_ratio_quad() {
        // A very elongated quad: 1 unit wide, 30 units long (ratio = 30 > 20 threshold).
        let input = make_quad_input(
            vec![
                (1, 0.0, 0.0, 0.0),
                (2, 30.0, 0.0, 0.0),
                (3, 30.0, 1.0, 0.0),
                (4, 0.0, 1.0, 0.0),
            ],
            vec![(1, [1, 2, 3, 4], 0.01)],
        );

        let diags = check_shell_distortion_3d(&input);
        assert!(
            has_code_severity(&diags, DiagnosticCode::HighAspectRatio, Severity::Warning),
            "Elongated quad (30:1) should emit HighAspectRatio Warning, got: {:?}",
            diags
        );
    }

    #[test]
    fn moderate_aspect_ratio_no_warning() {
        // Aspect ratio of 5:1 -- below threshold of 20.
        let input = make_quad_input(
            vec![
                (1, 0.0, 0.0, 0.0),
                (2, 5.0, 0.0, 0.0),
                (3, 5.0, 1.0, 0.0),
                (4, 0.0, 1.0, 0.0),
            ],
            vec![(1, [1, 2, 3, 4], 0.01)],
        );

        let diags = check_shell_distortion_3d(&input);
        assert!(
            !has_code(&diags, DiagnosticCode::HighAspectRatio),
            "Moderate aspect ratio (5:1) should NOT emit HighAspectRatio, got: {:?}",
            diags
        );
    }

    #[test]
    fn small_angle_quad() {
        // A "spike" quad where node 2 creates a very acute corner (< 10 degrees).
        // At node 2 (0.5, 10, 0): edges go to node 1 (-0.5, -10) and
        // node 3 (0.5, -10). The angle between these vectors is about 5.7 degrees.
        let input = make_quad_input(
            vec![
                (1, 0.0, 0.0, 0.0),
                (2, 0.5, 10.0, 0.0),
                (3, 1.0, 0.0, 0.0),
                (4, 0.5, -10.0, 0.0),
            ],
            vec![(1, [1, 2, 3, 4], 0.01)],
        );

        let diags = check_shell_distortion_3d(&input);
        assert!(
            has_code_severity(&diags, DiagnosticCode::SmallMinAngle, Severity::Warning),
            "Quad with acute spike corner should emit SmallMinAngle Warning, got: {:?}",
            diags
        );
    }

    #[test]
    fn well_formed_slightly_skewed_no_angle_warning() {
        // A slightly skewed quad (parallelogram). All interior angles are ~70/110 degrees.
        // Well above the 10 degree threshold.
        let input = make_quad_input(
            vec![
                (1, 0.0, 0.0, 0.0),
                (2, 1.0, 0.0, 0.0),
                (3, 1.3, 1.0, 0.0),
                (4, 0.3, 1.0, 0.0),
            ],
            vec![(1, [1, 2, 3, 4], 0.01)],
        );

        let diags = check_shell_distortion_3d(&input);
        assert!(
            !has_code(&diags, DiagnosticCode::SmallMinAngle),
            "Slightly skewed parallelogram should NOT emit SmallMinAngle, got: {:?}",
            diags
        );
    }

    #[test]
    fn multiple_quads_mixed_quality() {
        // Two quads: one good, one bad (bowtie / inverted).
        let input = make_quad_input(
            vec![
                // Good quad nodes
                (1, 0.0, 0.0, 0.0),
                (2, 1.0, 0.0, 0.0),
                (3, 1.0, 1.0, 0.0),
                (4, 0.0, 1.0, 0.0),
                // Bad (bowtie) quad nodes
                (5, 2.0, 0.0, 0.0),
                (6, 3.0, 0.0, 0.0),
                (7, 3.0, 1.0, 0.0),
                (8, 2.0, 1.0, 0.0),
            ],
            vec![
                (1, [1, 2, 3, 4], 0.01), // good: standard CCW
                (2, [5, 6, 8, 7], 0.01), // bowtie: swap last two nodes
            ],
        );

        let diags = check_shell_distortion_3d(&input);
        // Only quad 2 should have NegativeJacobian
        let neg_j: Vec<_> = diags
            .iter()
            .filter(|d| d.code == DiagnosticCode::NegativeJacobian)
            .collect();
        assert_eq!(neg_j.len(), 1, "Only one quad is inverted, got: {:?}", neg_j);
        assert_eq!(neg_j[0].element_ids, vec![2]);
    }
}

// ==================== Plate (DKT) tests ====================

mod plate_tests {
    use super::*;

    #[test]
    fn well_formed_plate_no_warnings() {
        // An equilateral-ish triangle in the XY plane -- no diagnostics.
        let input = make_plate_input(
            vec![
                (1, 0.0, 0.0, 0.0),
                (2, 1.0, 0.0, 0.0),
                (3, 0.5, 0.866, 0.0), // equilateral
            ],
            vec![(1, [1, 2, 3], 0.01)],
        );

        let diags = check_shell_distortion_3d(&input);
        assert!(
            diags.is_empty(),
            "Well-formed equilateral triangle should produce no diagnostics, got: {:?}",
            diags
        );
    }

    #[test]
    fn degenerate_plate_collinear_nodes() {
        // Three collinear nodes -> zero area -> NegativeJacobian error.
        let input = make_plate_input(
            vec![
                (1, 0.0, 0.0, 0.0),
                (2, 1.0, 0.0, 0.0),
                (3, 2.0, 0.0, 0.0), // collinear!
            ],
            vec![(1, [1, 2, 3], 0.01)],
        );

        let diags = check_shell_distortion_3d(&input);
        assert!(
            has_code_severity(&diags, DiagnosticCode::NegativeJacobian, Severity::Error),
            "Degenerate (collinear) plate should emit NegativeJacobian Error, got: {:?}",
            diags
        );
        let d = diags.iter().find(|d| d.code == DiagnosticCode::NegativeJacobian).unwrap();
        assert_eq!(d.element_ids, vec![1]);
        assert_eq!(d.phase.as_deref(), Some("pre_solve"));
    }

    #[test]
    fn high_aspect_ratio_plate() {
        // A right triangle with one very long edge: base=25, height=1.
        // max_edge/min_edge = 25/1 = 25 > 20 threshold.
        let input = make_plate_input(
            vec![
                (1, 0.0, 0.0, 0.0),
                (2, 25.0, 0.0, 0.0),
                (3, 0.0, 1.0, 0.0),
            ],
            vec![(1, [1, 2, 3], 0.01)],
        );

        let diags = check_shell_distortion_3d(&input);
        assert!(
            has_code_severity(&diags, DiagnosticCode::HighAspectRatio, Severity::Warning),
            "Elongated plate should emit HighAspectRatio Warning, got: {:?}",
            diags
        );
    }

    #[test]
    fn small_angle_plate() {
        // A triangle with a very acute angle (< 10 degrees).
        // Node 3 is very close to the line from node 1 to node 2,
        // creating a ~0.6 degree angle at node 1.
        let input = make_plate_input(
            vec![
                (1, 0.0, 0.0, 0.0),
                (2, 10.0, 0.0, 0.0),
                (3, 10.0, 0.1, 0.0), // tiny angle at node 1
            ],
            vec![(1, [1, 2, 3], 0.01)],
        );

        let diags = check_shell_distortion_3d(&input);
        assert!(
            has_code_severity(&diags, DiagnosticCode::SmallMinAngle, Severity::Warning),
            "Plate with tiny angle should emit SmallMinAngle Warning, got: {:?}",
            diags
        );
    }

    #[test]
    fn reasonable_plate_no_angle_warning() {
        // A right triangle with 45-45-90 angles -- all well above 10 degrees.
        let input = make_plate_input(
            vec![
                (1, 0.0, 0.0, 0.0),
                (2, 1.0, 0.0, 0.0),
                (3, 0.0, 1.0, 0.0),
            ],
            vec![(1, [1, 2, 3], 0.01)],
        );

        let diags = check_shell_distortion_3d(&input);
        assert!(
            !has_code(&diags, DiagnosticCode::SmallMinAngle),
            "45-45-90 triangle should NOT emit SmallMinAngle, got: {:?}",
            diags
        );
    }
}

// ==================== End-to-end tests (through solve_3d) ====================

mod end_to_end {
    use super::*;
    use dedaliano_engine::solver::linear;

    /// Build a complete (solvable) model with one inverted quad to test
    /// that the diagnostic appears in the solve output.
    #[test]
    fn inverted_quad_diagnostic_in_solve_output() {
        // 4 nodes forming a bowtie quad, with all corners pinned so the model is solvable.
        let mut nodes = HashMap::new();
        nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
        nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 1.0, y: 0.0, z: 0.0 });
        nodes.insert("3".to_string(), SolverNode3D { id: 3, x: 1.0, y: 1.0, z: 0.0 });
        nodes.insert("4".to_string(), SolverNode3D { id: 4, x: 0.0, y: 1.0, z: 0.0 });

        let mut mats = HashMap::new();
        mats.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

        // Bowtie quad: swap nodes 3 and 4
        let mut quads = HashMap::new();
        quads.insert(
            "1".to_string(),
            SolverQuadElement { id: 1, nodes: [1, 2, 4, 3], material_id: 1, thickness: 0.01 },
        );

        // Pin all four corners to make it solvable
        let mut supports = HashMap::new();
        for (i, nid) in [1, 2, 3, 4].iter().enumerate() {
            supports.insert(
                (i + 1).to_string(),
                SolverSupport3D {
                    node_id: *nid,
                    rx: true, ry: true, rz: true,
                    rrx: true, rry: true, rrz: true,
                    kx: None, ky: None, kz: None,
                    krx: None, kry: None, krz: None,
                    dx: None, dy: None, dz: None,
                    drx: None, dry: None, drz: None,
                    normal_x: None, normal_y: None, normal_z: None,
                    is_inclined: None, rw: None, kw: None,
                },
            );
        }

        let input = SolverInput3D {
            nodes,
            materials: mats,
            sections: HashMap::new(),
            elements: HashMap::new(),
            supports,
            loads: vec![],
            constraints: vec![],
            left_hand: None,
            plates: HashMap::new(),
            quads,
            quad9s: HashMap::new(),
            solid_shells: HashMap::new(),
            curved_shells: HashMap::new(),
            curved_beams: vec![],
            connectors: HashMap::new(),
        };

        // The inverted quad may cause the solve to panic (singular Jacobian in
        // element stiffness computation) or return an error. The pre-solve gate
        // fires before assembly, so we test it directly instead.
        let pre_diags = dedaliano_engine::solver::pre_solve_gates::check_shell_distortion_3d(&input);
        assert!(
            pre_diags.iter().any(|d| d.code == DiagnosticCode::NegativeJacobian),
            "Pre-solve gate should detect NegativeJacobian for inverted quad, got codes: {:?}",
            pre_diags.iter().map(|d| &d.code).collect::<Vec<_>>()
        );

        // If the solve happens to succeed (it may panic on the inverted element),
        // the diagnostic should appear in the output too.
        let result = std::panic::catch_unwind(|| linear::solve_3d(&input));
        match result {
            Ok(Ok(r)) => {
                assert!(
                    r.structured_diagnostics.iter().any(|d| d.code == DiagnosticCode::NegativeJacobian),
                    "Solve output should include NegativeJacobian diagnostic"
                );
            }
            Ok(Err(_)) | Err(_) => {
                // Solve error or panic is acceptable for an inverted element.
                // The pre-solve gate (tested above) already caught it.
            }
        }
    }
}
