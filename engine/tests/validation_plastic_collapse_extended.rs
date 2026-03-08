/// Validation: Extended plastic collapse load factors.
///
/// Reference: Neal *Plastic Methods of Structural Analysis*;
///            Horne *Plastic Design of Portal Frames*
///
/// Rectangular section: b=0.15, h=0.3
/// Zp = bh²/4, Mp = fy * 1000 * Zp = 843.75 kN·m
mod helpers;

use dedaliano_engine::solver::plastic;
use dedaliano_engine::types::*;
use std::collections::HashMap;
use helpers::*;

const E: f64 = 200_000.0;
const FY: f64 = 250.0; // MPa

const B: f64 = 0.15;
const H: f64 = 0.3;
const A_SEC: f64 = 0.045;     // b*h
const IZ_SEC: f64 = 3.375e-4; // bh³/12
// Zp = bh²/4 = 0.15*0.09/4 = 3.375e-3 m³
// Mp = fy*1000*Zp = 250*1000*3.375e-3 = 843.75 kN·m
const MP: f64 = 843.75;

/// Build a single-element plastic beam input.
fn make_plastic_beam(
    l: f64,
    start_sup: &str,
    end_sup: Option<&str>,
    loads: Vec<SolverLoad>,
) -> PlasticInput {
    let solver = make_beam(1, l, E, A_SEC, IZ_SEC, start_sup, end_sup, loads);
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), PlasticSectionData {
        a: A_SEC, iz: IZ_SEC, material_id: 1, b: Some(B), h: Some(H),
    });
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), PlasticMaterialData { fy: Some(FY) });
    PlasticInput { solver, sections, materials, max_hinges: Some(10), mp_overrides: None }
}

/// Build a multi-element plastic beam input.
fn make_plastic_beam_multi(
    n: usize,
    l: f64,
    start_sup: &str,
    end_sup: Option<&str>,
    loads: Vec<SolverLoad>,
) -> PlasticInput {
    let solver = make_beam(n, l, E, A_SEC, IZ_SEC, start_sup, end_sup, loads);
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), PlasticSectionData {
        a: A_SEC, iz: IZ_SEC, material_id: 1, b: Some(B), h: Some(H),
    });
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), PlasticMaterialData { fy: Some(FY) });
    PlasticInput { solver, sections, materials, max_hinges: Some(10), mp_overrides: None }
}

/// Build a plastic portal frame input.
fn make_plastic_portal(
    h: f64,
    w: f64,
    lateral_load: f64,
    gravity_load: f64,
) -> PlasticInput {
    let solver = make_portal_frame(h, w, E, A_SEC, IZ_SEC, lateral_load, gravity_load);
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), PlasticSectionData {
        a: A_SEC, iz: IZ_SEC, material_id: 1, b: Some(B), h: Some(H),
    });
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), PlasticMaterialData { fy: Some(FY) });
    PlasticInput { solver, sections, materials, max_hinges: Some(10), mp_overrides: None }
}

/// Build a plastic continuous beam input.
fn make_plastic_continuous(
    spans: &[f64],
    n_per_span: usize,
    loads: Vec<SolverLoad>,
) -> PlasticInput {
    let solver = make_continuous_beam(spans, n_per_span, E, A_SEC, IZ_SEC, loads);
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), PlasticSectionData {
        a: A_SEC, iz: IZ_SEC, material_id: 1, b: Some(B), h: Some(H),
    });
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), PlasticMaterialData { fy: Some(FY) });
    PlasticInput { solver, sections, materials, max_hinges: Some(20), mp_overrides: None }
}

// ═══════════════════════════════════════════════════════════════
// 1. SS Beam, Midspan Point Load: collapse load = 4Mp/L
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_plastic_ext_ss_midspan_point() {
    // Simply supported beam with unit point load at midspan.
    // Determinate structure: single hinge forms at midspan.
    // Collapse factor lambda = 4*Mp / (P*L) = 4*843.75/6 = 562.5
    let l: f64 = 6.0;
    let input = make_plastic_beam(l, "pinned", Some("rollerX"),
        vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 1, a: l / 2.0, p: -1.0, px: None, mz: None,
        })]);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    let expected_lambda: f64 = 4.0 * MP / l;
    let rel_err: f64 = (result.collapse_factor - expected_lambda).abs() / expected_lambda;
    assert!(
        rel_err < 0.10,
        "SS midspan point: lambda={:.2}, expected={:.2}, rel_err={:.2}%",
        result.collapse_factor, expected_lambda, rel_err * 100.0
    );
    // Determinate beam: exactly 1 hinge
    assert!(
        result.hinges.len() >= 1,
        "SS midspan: should form at least 1 hinge, got {}", result.hinges.len()
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Fixed-Fixed Beam, UDL: collapse load = 16Mp/L^2
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_plastic_ext_ff_udl() {
    // Fixed-fixed beam with unit UDL.
    // Mechanism: 3 hinges (both ends + midspan).
    // Collapse factor lambda = 16*Mp / (q*L^2) = 16*843.75/36 = 375.0
    let l: f64 = 6.0;
    let n = 2; // 2 elements: midspan node enables interior hinge detection
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -1.0, q_j: -1.0, a: None, b: None,
        }));
    }
    let input = make_plastic_beam_multi(n, l, "fixed", Some("fixed"), loads);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    let expected_lambda: f64 = 16.0 * MP / (l * l);
    let rel_err: f64 = (result.collapse_factor - expected_lambda).abs() / expected_lambda;
    assert!(
        rel_err < 0.10,
        "FF UDL: lambda={:.2}, expected={:.2}, rel_err={:.2}%",
        result.collapse_factor, expected_lambda, rel_err * 100.0
    );
    // Should form hinges at supports and midspan
    assert!(
        result.hinges.len() >= 2,
        "FF UDL: expected at least 2 hinges, got {}", result.hinges.len()
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Fixed-Fixed Beam, Midspan Point Load: collapse load = 8Mp/L
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_plastic_ext_ff_midspan_point() {
    // Fixed-fixed beam with unit point load at midspan.
    // Mechanism: 3 hinges (both fixed ends + midspan).
    // Collapse factor lambda = 8*Mp / (P*L) = 8*843.75/6 = 1125.0
    let l: f64 = 6.0;
    let n = 2; // 2 elements => midspan node at node 2
    let input = make_plastic_beam_multi(n, l, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -1.0, mz: 0.0,
        })]);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    let expected_lambda: f64 = 8.0 * MP / l;
    let rel_err: f64 = (result.collapse_factor - expected_lambda).abs() / expected_lambda;
    assert!(
        rel_err < 0.10,
        "FF midspan point: lambda={:.2}, expected={:.2}, rel_err={:.2}%",
        result.collapse_factor, expected_lambda, rel_err * 100.0
    );
    // Should form hinges at both supports and at midspan
    assert!(
        result.hinges.len() >= 2,
        "FF midspan: expected at least 2 hinges, got {}", result.hinges.len()
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. Propped Cantilever, Midspan Point Load: collapse load = 6Mp/L
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_plastic_ext_propped_cantilever_midspan() {
    // Fixed end at left, roller at right, unit point load at midspan.
    // 2 hinges: one at fixed end and one at midspan.
    // Collapse factor lambda = 6*Mp / (P*L) = 6*843.75/6 = 843.75
    let l: f64 = 6.0;
    let n = 2; // midspan node at node 2
    let input = make_plastic_beam_multi(n, l, "fixed", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -1.0, mz: 0.0,
        })]);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    let expected_lambda: f64 = 6.0 * MP / l;
    let rel_err: f64 = (result.collapse_factor - expected_lambda).abs() / expected_lambda;
    assert!(
        rel_err < 0.15,
        "Propped cantilever midspan: lambda={:.2}, expected={:.2}, rel_err={:.2}%",
        result.collapse_factor, expected_lambda, rel_err * 100.0
    );
    // Propped cantilever: 1 degree indeterminate, needs 2 hinges
    assert!(
        result.hinges.len() >= 2,
        "Propped cantilever: expected at least 2 hinges, got {}", result.hinges.len()
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. Portal Frame, Lateral Load: sway collapse mechanism
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_plastic_ext_portal_lateral() {
    // Fixed-base portal frame with unit lateral load at left beam-column joint.
    // Sway mechanism: 4 hinges at column bases and beam-column joints.
    // Virtual work: H * delta * lambda = Mp * (4 * theta)
    //   where delta = h * theta
    //   lambda * h = 4 * Mp  =>  lambda = 4*Mp/h
    // lambda = 4*843.75/4 = 843.75
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let input = make_plastic_portal(h, w, 1.0, 0.0);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    let expected_lambda: f64 = 4.0 * MP / h;
    let rel_err: f64 = (result.collapse_factor - expected_lambda).abs() / expected_lambda;
    assert!(
        rel_err < 0.15,
        "Portal lateral: lambda={:.2}, expected={:.2}, rel_err={:.2}%",
        result.collapse_factor, expected_lambda, rel_err * 100.0
    );
    // Portal sway mechanism forms hinges
    assert!(
        result.hinges.len() >= 2,
        "Portal: expected at least 2 hinges, got {}", result.hinges.len()
    );
    assert!(
        result.collapse_factor > 0.0,
        "Portal: collapse factor must be positive"
    );
}

// ═══════════════════════════════════════════════════════════════
// 6. Two-Span Continuous Beam, UDL: collapse from mechanism
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_plastic_ext_two_span_udl() {
    // Two equal spans, pinned-roller-roller, unit UDL on both spans.
    // Each span acts as a propped cantilever with interior support providing moment.
    // Symmetric collapse: hinges at interior support + midspan of each span.
    // By virtual work for each span: lambda * q * L^2 / 2 = Mp * (2 + 2) theta
    //   (hogging hinge at support + sagging hinge at midspan per span)
    // For equal spans SS-continuous: lambda = 11.66*Mp/(q*L^2) approximately,
    // matching propped cantilever behavior per span.
    let l: f64 = 6.0;
    let n_per_span = 8;
    let total_elems = n_per_span * 2;
    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -1.0, q_j: -1.0, a: None, b: None,
        }));
    }
    let input = make_plastic_continuous(&[l, l], n_per_span, loads);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    // Two-span continuous with UDL: each span collapses like a propped
    // cantilever. The governing mechanism gives lambda ~ 11.66*Mp/(q*L^2).
    let expected_lambda: f64 = 11.66 * MP / (l * l);
    let rel_err: f64 = (result.collapse_factor - expected_lambda).abs() / expected_lambda;
    assert!(
        rel_err < 0.30,
        "Two-span UDL: lambda={:.2}, expected={:.2}, rel_err={:.2}%",
        result.collapse_factor, expected_lambda, rel_err * 100.0
    );
    assert!(
        result.hinges.len() >= 2,
        "Two-span: expected at least 2 hinges, got {}", result.hinges.len()
    );
}

// ═══════════════════════════════════════════════════════════════
// 7. Fixed-Fixed Beam, Third-Point Load: collapse load = 9Mp/L
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_plastic_ext_ff_third_point() {
    // Fixed-fixed beam, unit point load at L/3 from left.
    // Mechanism: 3 hinges at both supports + load point.
    // Virtual work: P * lambda * (L/3) * theta = Mp * (theta + 2*theta + theta)
    //   At load point, beam rotates theta on left segment and 2*theta on right.
    //   Hinge rotations: theta at left support, 3*theta at load point, 2*theta at right.
    //   Wait -- let's be exact.
    //   Left segment length = L/3, right = 2L/3.
    //   Deflection at load = delta, left segment angle = delta/(L/3) = 3*delta/L,
    //   right segment angle = delta/(2L/3) = 3*delta/(2L).
    //   Hinge at load point rotates by sum = 3*delta/L + 3*delta/(2L) = 9*delta/(2L).
    //   External work: P * lambda * delta.
    //   Internal work: Mp * [3*delta/L + 9*delta/(2L) + 3*delta/(2L)]
    //                = Mp * [3/L + 9/(2L) + 3/(2L)] * delta
    //                = Mp * [3/L + 12/(2L)] * delta
    //                = Mp * [3/L + 6/L] * delta
    //                = Mp * 9/L * delta
    //   So lambda = 9*Mp/L.
    let l: f64 = 6.0;
    let n = 3; // 3 elements => nodes at L/3 and 2L/3
    let input = make_plastic_beam_multi(n, l, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -1.0, mz: 0.0, // node at L/3
        })]);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    let expected_lambda: f64 = 9.0 * MP / l;
    let rel_err: f64 = (result.collapse_factor - expected_lambda).abs() / expected_lambda;
    assert!(
        rel_err < 0.10,
        "FF third-point: lambda={:.2}, expected={:.2}, rel_err={:.2}%",
        result.collapse_factor, expected_lambda, rel_err * 100.0
    );
    assert!(
        result.hinges.len() >= 2,
        "FF third-point: expected at least 2 hinges, got {}", result.hinges.len()
    );
}

// ═══════════════════════════════════════════════════════════════
// 8. Propped Cantilever, UDL: collapse load = 11.66Mp/L^2
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_plastic_ext_propped_cantilever_udl() {
    // Fixed end at left, roller at right, unit UDL.
    // 2 hinges: one at fixed end, one in span at x ≈ 0.414L from roller end.
    // Collapse factor lambda = 11.66*Mp/(q*L^2).
    // With lambda = 11.66*843.75/36 = 273.2
    // Use fine mesh (12 elements) to capture interior hinge location.
    let l: f64 = 6.0;
    let n = 12;
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -1.0, q_j: -1.0, a: None, b: None,
        }));
    }
    let input = make_plastic_beam_multi(n, l, "fixed", Some("rollerX"), loads);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    let expected_lambda: f64 = 11.66 * MP / (l * l);
    let rel_err: f64 = (result.collapse_factor - expected_lambda).abs() / expected_lambda;
    assert!(
        rel_err < 0.30,
        "Propped cantilever UDL: lambda={:.2}, expected={:.2}, rel_err={:.2}%",
        result.collapse_factor, expected_lambda, rel_err * 100.0
    );
    // Should form 2 hinges for this 1-degree indeterminate structure
    assert!(
        result.hinges.len() >= 2,
        "Propped cantilever UDL: expected at least 2 hinges, got {}", result.hinges.len()
    );
    assert!(
        result.is_mechanism,
        "Propped cantilever UDL: should reach mechanism state"
    );
}
