//! Adversarial tests for the pre-solve local-axis degeneracy gate.
//!
//! Exercises `check_suspicious_local_axes_3d` against:
//!   - vertical elements with default orientation (near switching threshold)
//!   - custom orientation vectors parallel to the element axis
//!   - zero-length elements
//!   - normal (non-degenerate) elements
//!   - elements at various angles near the degenerate direction

#[path = "common/mod.rs"]
mod common;

use std::collections::HashMap;
use common::make_3d_input;
use dedaliano_engine::solver::pre_solve_gates::check_suspicious_local_axes_3d;
use dedaliano_engine::types::*;

// ==================== Helpers ====================

fn has_diagnostic(diags: &[StructuredDiagnostic], code: DiagnosticCode) -> bool {
    diags.iter().any(|d| d.code == code)
}

fn count_diagnostic(diags: &[StructuredDiagnostic], code: DiagnosticCode) -> usize {
    diags.iter().filter(|d| d.code == code).count()
}

fn has_diagnostic_for_element(
    diags: &[StructuredDiagnostic],
    code: DiagnosticCode,
    elem_id: usize,
) -> bool {
    diags.iter().any(|d| d.code == code && d.element_ids.contains(&elem_id))
}

fn severity_for_element(
    diags: &[StructuredDiagnostic],
    code: DiagnosticCode,
    elem_id: usize,
) -> Option<Severity> {
    diags.iter()
        .find(|d| d.code == code && d.element_ids.contains(&elem_id))
        .map(|d| d.severity.clone())
}

/// Build a single-element 3D input with explicit orientation vector.
fn single_element_with_orientation(
    ni: (usize, f64, f64, f64),
    nj: (usize, f64, f64, f64),
    local_yx: Option<f64>,
    local_yy: Option<f64>,
    local_yz: Option<f64>,
) -> SolverInput3D {
    let mut nodes_map = HashMap::new();
    nodes_map.insert(ni.0.to_string(), SolverNode3D { id: ni.0, x: ni.1, y: ni.2, z: ni.3 });
    nodes_map.insert(nj.0.to_string(), SolverNode3D { id: nj.0, x: nj.1, y: nj.2, z: nj.3 });

    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: 0.01, iy: 1e-4, iz: 1e-4, j: 5e-5,
        cw: None, as_y: None, as_z: None,
    });

    let mut elems_map = HashMap::new();
    elems_map.insert("1".to_string(), SolverElement3D {
        id: 1, elem_type: "frame".to_string(),
        node_i: ni.0, node_j: nj.0,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
        local_yx, local_yy, local_yz, roll_angle: None,
    });

    let sups_map = HashMap::new();

    SolverInput3D {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![],
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![], connectors: HashMap::new(),
    }
}

// ==================== Normal elements — no warnings ====================

#[test]
fn horizontal_x_default_no_warning() {
    // Horizontal element along X with default orientation — no issue.
    let input = single_element_with_orientation(
        (1, 0.0, 0.0, 0.0),
        (2, 5.0, 0.0, 0.0),
        None, None, None,
    );
    let diags = check_suspicious_local_axes_3d(&input);
    assert!(
        !has_diagnostic(&diags, DiagnosticCode::SuspiciousLocalAxis),
        "Horizontal +X element should not trigger SuspiciousLocalAxis"
    );
}

#[test]
fn horizontal_z_default_no_warning() {
    // Horizontal element along Z with default orientation — no issue.
    let input = single_element_with_orientation(
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, 0.0, 5.0),
        None, None, None,
    );
    let diags = check_suspicious_local_axes_3d(&input);
    assert!(
        !has_diagnostic(&diags, DiagnosticCode::SuspiciousLocalAxis),
        "Horizontal +Z element should not trigger SuspiciousLocalAxis"
    );
}

#[test]
fn diagonal_xz_default_no_warning() {
    // Diagonal element in XZ plane — well away from vertical.
    let input = single_element_with_orientation(
        (1, 0.0, 0.0, 0.0),
        (2, 3.0, 0.0, 4.0),
        None, None, None,
    );
    let diags = check_suspicious_local_axes_3d(&input);
    assert!(
        !has_diagnostic(&diags, DiagnosticCode::SuspiciousLocalAxis),
        "Diagonal XZ element should not trigger SuspiciousLocalAxis"
    );
}

#[test]
fn diagonal_xyz_default_no_warning() {
    // Diagonal with moderate Y component — not close to vertical.
    let input = single_element_with_orientation(
        (1, 0.0, 0.0, 0.0),
        (2, 3.0, 2.0, 4.0),
        None, None, None,
    );
    let diags = check_suspicious_local_axes_3d(&input);
    assert!(
        !has_diagnostic(&diags, DiagnosticCode::SuspiciousLocalAxis),
        "Moderate-Y diagonal should not trigger SuspiciousLocalAxis"
    );
}

#[test]
fn custom_orientation_perpendicular_no_warning() {
    // Custom orientation perpendicular to element axis — no issue.
    let input = single_element_with_orientation(
        (1, 0.0, 0.0, 0.0),
        (2, 5.0, 0.0, 0.0),
        Some(0.0), Some(1.0), Some(0.0),
    );
    let diags = check_suspicious_local_axes_3d(&input);
    assert!(
        !has_diagnostic(&diags, DiagnosticCode::SuspiciousLocalAxis),
        "Perpendicular custom orientation should not trigger SuspiciousLocalAxis"
    );
}

// ==================== Near-vertical default → warning ====================

#[test]
fn vertical_y_default_warning() {
    // Purely vertical element along +Y with default orientation.
    // The default rule switches reference to Z, but the element is in the danger zone.
    let input = single_element_with_orientation(
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, 5.0, 0.0),
        None, None, None,
    );
    let diags = check_suspicious_local_axes_3d(&input);
    assert!(
        has_diagnostic(&diags, DiagnosticCode::SuspiciousLocalAxis),
        "Purely vertical +Y element with default orientation should trigger warning"
    );
    assert_eq!(
        severity_for_element(&diags, DiagnosticCode::SuspiciousLocalAxis, 1),
        Some(Severity::Warning),
        "Vertical default should be Warning, not Error"
    );
}

#[test]
fn vertical_neg_y_default_warning() {
    // Purely vertical element along -Y with default orientation.
    let input = single_element_with_orientation(
        (1, 0.0, 5.0, 0.0),
        (2, 0.0, 0.0, 0.0),
        None, None, None,
    );
    let diags = check_suspicious_local_axes_3d(&input);
    assert!(
        has_diagnostic(&diags, DiagnosticCode::SuspiciousLocalAxis),
        "Purely vertical -Y element with default orientation should trigger warning"
    );
}

#[test]
fn near_vertical_default_warning() {
    // Nearly vertical element: tiny X offset, dominant Y.
    // ex ≈ [0.01, 0.99995, 0] → |ex·Y| ≈ 0.99995 > 0.995
    let input = single_element_with_orientation(
        (1, 0.0, 0.0, 0.0),
        (2, 0.05, 5.0, 0.0),
        None, None, None,
    );
    let diags = check_suspicious_local_axes_3d(&input);
    assert!(
        has_diagnostic(&diags, DiagnosticCode::SuspiciousLocalAxis),
        "Near-vertical element (tiny X offset) with default orientation should trigger warning"
    );
}

#[test]
fn slightly_off_vertical_no_warning() {
    // Element tilted enough that |ex·Y| < 0.995 — safe.
    // (1, 10, 0) → |ex·Y| = 10/sqrt(101) ≈ 0.995 — just at threshold.
    // Use (2, 10, 0) → |ex·Y| = 10/sqrt(104) ≈ 0.981 — safe margin.
    let input = single_element_with_orientation(
        (1, 0.0, 0.0, 0.0),
        (2, 2.0, 10.0, 0.0),
        None, None, None,
    );
    let diags = check_suspicious_local_axes_3d(&input);
    assert!(
        !has_diagnostic(&diags, DiagnosticCode::SuspiciousLocalAxis),
        "Slightly-off-vertical element (|ex·Y|≈0.98) should not trigger warning"
    );
}

// ==================== Custom orientation parallel → error ====================

#[test]
fn custom_orientation_parallel_to_axis_error() {
    // Custom orientation vector along +X, element along +X → nearly parallel.
    let input = single_element_with_orientation(
        (1, 0.0, 0.0, 0.0),
        (2, 5.0, 0.0, 0.0),
        Some(1.0), Some(0.0), Some(0.0),
    );
    let diags = check_suspicious_local_axes_3d(&input);
    assert!(
        has_diagnostic(&diags, DiagnosticCode::SuspiciousLocalAxis),
        "Custom orientation parallel to element axis should trigger SuspiciousLocalAxis"
    );
    assert_eq!(
        severity_for_element(&diags, DiagnosticCode::SuspiciousLocalAxis, 1),
        Some(Severity::Error),
        "Custom parallel orientation should be Error severity"
    );
}

#[test]
fn custom_orientation_antiparallel_to_axis_error() {
    // Custom orientation vector along -X, element along +X → antiparallel (dot ≈ -1.0).
    let input = single_element_with_orientation(
        (1, 0.0, 0.0, 0.0),
        (2, 5.0, 0.0, 0.0),
        Some(-1.0), Some(0.0), Some(0.0),
    );
    let diags = check_suspicious_local_axes_3d(&input);
    assert!(
        has_diagnostic(&diags, DiagnosticCode::SuspiciousLocalAxis),
        "Custom antiparallel orientation should trigger SuspiciousLocalAxis"
    );
    assert_eq!(
        severity_for_element(&diags, DiagnosticCode::SuspiciousLocalAxis, 1),
        Some(Severity::Error),
        "Custom antiparallel orientation should be Error severity"
    );
}

#[test]
fn custom_orientation_nearly_parallel_error() {
    // Custom orientation slightly off — but within the 0.999 threshold.
    // Element along +X [1,0,0], orientation [1.0, 0.01, 0.0] → dot ≈ 0.99995
    let input = single_element_with_orientation(
        (1, 0.0, 0.0, 0.0),
        (2, 5.0, 0.0, 0.0),
        Some(1.0), Some(0.01), Some(0.0),
    );
    let diags = check_suspicious_local_axes_3d(&input);
    assert!(
        has_diagnostic(&diags, DiagnosticCode::SuspiciousLocalAxis),
        "Nearly-parallel custom orientation (|cos|>0.999) should trigger error"
    );
}

#[test]
fn custom_orientation_moderately_off_no_warning() {
    // Custom orientation with noticeable angle to axis — safe.
    // Element along +X, orientation [1.0, 0.1, 0.0] → dot ≈ 0.995 — below 0.999.
    let input = single_element_with_orientation(
        (1, 0.0, 0.0, 0.0),
        (2, 5.0, 0.0, 0.0),
        Some(1.0), Some(0.1), Some(0.0),
    );
    let diags = check_suspicious_local_axes_3d(&input);
    assert!(
        !has_diagnostic(&diags, DiagnosticCode::SuspiciousLocalAxis),
        "Custom orientation with moderate angle (|cos|≈0.995) should not trigger"
    );
}

// ==================== Zero-length element → error ====================

#[test]
fn zero_length_element_error() {
    // Both nodes at the same position.
    let input = single_element_with_orientation(
        (1, 3.0, 4.0, 5.0),
        (2, 3.0, 4.0, 5.0),
        None, None, None,
    );
    let diags = check_suspicious_local_axes_3d(&input);
    assert!(
        has_diagnostic(&diags, DiagnosticCode::SuspiciousLocalAxis),
        "Zero-length element should trigger SuspiciousLocalAxis"
    );
    assert_eq!(
        severity_for_element(&diags, DiagnosticCode::SuspiciousLocalAxis, 1),
        Some(Severity::Error),
        "Zero-length element should be Error severity"
    );
}

#[test]
fn zero_length_custom_orientation_error() {
    // Zero-length element with custom orientation — still error (length takes precedence).
    let input = single_element_with_orientation(
        (1, 1.0, 2.0, 3.0),
        (2, 1.0, 2.0, 3.0),
        Some(0.0), Some(1.0), Some(0.0),
    );
    let diags = check_suspicious_local_axes_3d(&input);
    assert!(
        has_diagnostic(&diags, DiagnosticCode::SuspiciousLocalAxis),
        "Zero-length element (even with custom orient) should trigger error"
    );
}

// ==================== Zero-length orientation vector → error ====================

#[test]
fn zero_orientation_vector_error() {
    // Custom orientation vector [0,0,0] — degenerate.
    let input = single_element_with_orientation(
        (1, 0.0, 0.0, 0.0),
        (2, 5.0, 0.0, 0.0),
        Some(0.0), Some(0.0), Some(0.0),
    );
    let diags = check_suspicious_local_axes_3d(&input);
    assert!(
        has_diagnostic(&diags, DiagnosticCode::SuspiciousLocalAxis),
        "Zero orientation vector should trigger SuspiciousLocalAxis"
    );
    assert_eq!(
        severity_for_element(&diags, DiagnosticCode::SuspiciousLocalAxis, 1),
        Some(Severity::Error),
        "Zero orientation vector should be Error severity"
    );
}

// ==================== Diagonal elements near the degenerate direction ====================

#[test]
fn diagonal_mostly_y_default_warning() {
    // Element mostly along Y with tiny Z component → |ex·Y| > 0.995 → warning.
    // (0,0,0) → (0, 10, 0.1): ex ≈ [0, 0.99999, 0.01], |ex·Y| ≈ 0.99999
    let input = single_element_with_orientation(
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, 10.0, 0.1),
        None, None, None,
    );
    let diags = check_suspicious_local_axes_3d(&input);
    assert!(
        has_diagnostic(&diags, DiagnosticCode::SuspiciousLocalAxis),
        "Mostly-Y diagonal with default orientation should trigger warning"
    );
}

#[test]
fn custom_orientation_diagonal_element_parallel() {
    // Diagonal element (3,4,0), custom orientation also (3,4,0) → parallel → error.
    let input = single_element_with_orientation(
        (1, 0.0, 0.0, 0.0),
        (2, 3.0, 4.0, 0.0),
        Some(3.0), Some(4.0), Some(0.0),
    );
    let diags = check_suspicious_local_axes_3d(&input);
    assert!(
        has_diagnostic(&diags, DiagnosticCode::SuspiciousLocalAxis),
        "Custom orientation parallel to diagonal element should trigger error"
    );
    assert_eq!(
        severity_for_element(&diags, DiagnosticCode::SuspiciousLocalAxis, 1),
        Some(Severity::Error),
    );
}

// ==================== Multiple elements — mixed ====================

#[test]
fn mixed_elements_only_degenerate_flagged() {
    // Two elements: one horizontal (clean), one vertical (warning).
    let input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 5.0, 0.0, 0.0), (3, 0.0, 5.0, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4, 1e-4, 5e-5)],
        vec![
            (1, "frame", 1, 2, 1, 1), // horizontal — fine
            (2, "frame", 1, 3, 1, 1), // vertical — warning
        ],
        vec![],
        vec![],
    );
    let diags = check_suspicious_local_axes_3d(&input);
    assert!(
        !has_diagnostic_for_element(&diags, DiagnosticCode::SuspiciousLocalAxis, 1),
        "Horizontal element should not be flagged"
    );
    assert!(
        has_diagnostic_for_element(&diags, DiagnosticCode::SuspiciousLocalAxis, 2),
        "Vertical element should be flagged"
    );
}

#[test]
fn diagnostic_includes_value_and_threshold() {
    // Verify the diagnostic carries numeric metadata for downstream consumption.
    let input = single_element_with_orientation(
        (1, 0.0, 0.0, 0.0),
        (2, 5.0, 0.0, 0.0),
        Some(1.0), Some(0.0), Some(0.0),
    );
    let diags = check_suspicious_local_axes_3d(&input);
    let d = diags.iter()
        .find(|d| d.code == DiagnosticCode::SuspiciousLocalAxis)
        .expect("Expected SuspiciousLocalAxis diagnostic");

    assert!(d.value.is_some(), "Diagnostic should carry a value");
    assert!(d.threshold.is_some(), "Diagnostic should carry a threshold");
    assert_eq!(d.phase.as_deref(), Some("pre_solve"), "Phase should be pre_solve");
    assert!(d.value.unwrap() > 0.999, "Value should be > 0.999 for parallel case");
    assert!((d.threshold.unwrap() - 0.999).abs() < 1e-10, "Threshold should be 0.999");
}

// ==================== Integration: full solve still works ====================

#[test]
fn vertical_element_solves_without_nan() {
    // A vertical column with default orientation should solve (the transform
    // code has a fallback), and the gate should emit a warning but NOT block.
    use dedaliano_engine::solver::linear;

    let input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 0.0, 5.0, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4, 1e-4, 5e-5)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![
            (1, vec![true, true, true, true, true, true]),
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 10.0, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let result = linear::solve_3d(&input);
    match result {
        Ok(r) => {
            // Should have the warning in structured diagnostics.
            let has_warning = r.structured_diagnostics.iter().any(|d| {
                d.code == DiagnosticCode::SuspiciousLocalAxis
                    && d.severity == Severity::Warning
            });
            assert!(has_warning, "Vertical element should emit SuspiciousLocalAxis warning");

            // Results should not contain NaN.
            let has_nan = r.displacements.iter().any(|d| {
                d.ux.is_nan() || d.uy.is_nan() || d.uz.is_nan()
                    || d.rx.is_nan() || d.ry.is_nan() || d.rz.is_nan()
            });
            assert!(!has_nan, "Vertical element should solve without NaN");
        }
        Err(e) => {
            // Acceptable if solver refuses for other reasons (e.g., insufficient supports),
            // but the error should NOT be about local axes since it's just a warning.
            assert!(
                !e.to_lowercase().contains("local axis"),
                "Solver should not refuse due to local axis warning: {e}"
            );
        }
    }
}
