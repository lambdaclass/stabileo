/// Validation: Drift and Displacement Verification
///
/// References:
///   - ASCE 7-22, Section 12.8.6 (Story Drift Determination)
///   - AISC 360, Appendix 7 (Serviceability)
///   - ICC IBC, Section 1604.3 (Deflection Limits)
///
/// Tests verify drift calculations for various structural configurations:
///   1. Cantilever column drift: δ = PH³/(3EI)
///   2. Fixed-fixed column: δ = PH³/(12EI)
///   3. Portal frame: inter-story drift
///   4. Drift proportional to load (linearity)
///   5. Multi-story relative drift (story drift)
///   6. Stiffness effect on drift (larger I → less drift)
///   7. Height effect on drift (H³ dependence)
///   8. Drift under combined axial + lateral
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Cantilever Column: δ = PH³/(3EI)
// ================================================================

#[test]
fn validation_drift_cantilever() {
    let h = 5.0;
    let n = 10;
    let p = 10.0;
    let e_eff = E * 1000.0;

    // Vertical cantilever column with lateral load at top
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    for i in 0..=n {
        nodes.push((i + 1, 0.0, i as f64 * h / n as f64));
        if i > 0 {
            elems.push((i, "frame", i, i + 1, 1, 1, false, false));
        }
    }
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: p, fy: 0.0, mz: 0.0,
    })];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems,
        vec![(1, 1, "fixed")], loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    let delta_exact = p * h * h * h / (3.0 * e_eff * IZ);
    assert_close(tip.ux, delta_exact, 0.02,
        "Cantilever drift: δ = PH³/(3EI)");
}

// ================================================================
// 2. Fixed-Fixed Column: δ = PH³/(12EI)
// ================================================================

#[test]
fn validation_drift_fixed_fixed() {
    let h = 4.0;
    let n = 8;
    let p = 10.0;
    let e_eff = E * 1000.0;

    // Column fixed at both ends with lateral load at top
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    for i in 0..=n {
        nodes.push((i + 1, 0.0, i as f64 * h / n as f64));
        if i > 0 {
            elems.push((i, "frame", i, i + 1, 1, 1, false, false));
        }
    }
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: p, fy: 0.0, mz: 0.0,
    })];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems,
        vec![(1, 1, "fixed"), (2, n + 1, "guidedX")], loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // guidedX: uy and rz fixed, ux free → effectively fixed-guided
    // δ = PH³/(12EI) for guided (no rotation at top)
    let delta_exact = p * h * h * h / (12.0 * e_eff * IZ);
    assert_close(tip.ux, delta_exact, 0.02,
        "Fixed-guided drift: δ = PH³/(12EI)");
}

// ================================================================
// 3. Portal Frame: Inter-Story Drift
// ================================================================

#[test]
fn validation_drift_portal_interstory() {
    let w = 6.0;
    let h = 4.0;
    let f = 10.0;

    let input = make_portal_frame(h, w, E, A, IZ, f, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Top displacement = inter-story drift (single story)
    let d2 = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let d3 = results.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().ux;

    // Both top nodes should have similar drift (rigid beam)
    assert_close(d2, d3, 0.15, "Portal: similar top drift");

    // Drift should be positive (in direction of load)
    assert!(d2 > 0.0, "Portal: positive drift: {:.6e}", d2);

    // Drift ratio = δ/H
    let drift_ratio = d2 / h;
    assert!(drift_ratio > 0.0, "Portal: non-zero drift ratio");
}

// ================================================================
// 4. Drift Proportional to Load (Linearity)
// ================================================================

#[test]
fn validation_drift_linearity() {
    let w = 6.0;
    let h = 4.0;

    let input1 = make_portal_frame(h, w, E, A, IZ, 5.0, 0.0);
    let d1 = linear::solve_2d(&input1).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    let input2 = make_portal_frame(h, w, E, A, IZ, 10.0, 0.0);
    let d2 = linear::solve_2d(&input2).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    let input3 = make_portal_frame(h, w, E, A, IZ, 15.0, 0.0);
    let d3 = linear::solve_2d(&input3).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // δ ∝ F → δ2/δ1 = 2, δ3/δ1 = 3
    assert_close(d2 / d1, 2.0, 0.01, "Linearity: δ(2F)/δ(F) = 2");
    assert_close(d3 / d1, 3.0, 0.01, "Linearity: δ(3F)/δ(F) = 3");
}

// ================================================================
// 5. Multi-Story Relative Drift
// ================================================================

#[test]
fn validation_drift_multi_story_relative() {
    let w = 6.0;
    let h = 3.5;
    let f = 10.0;

    // 3-story frame with uniform lateral load
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    let mut sups = Vec::new();
    let mut eid = 1;

    nodes.push((1, 0.0, 0.0));
    nodes.push((2, w, 0.0));
    sups.push((1, 1, "fixed"));
    sups.push((2, 2, "fixed"));

    for story in 1..=3_usize {
        let y = story as f64 * h;
        let left = 2 * story + 1;
        let right = 2 * story + 2;
        nodes.push((left, 0.0, y));
        nodes.push((right, w, y));
        let bl = if story == 1 { 1 } else { 2 * (story - 1) + 1 };
        let br = if story == 1 { 2 } else { 2 * (story - 1) + 2 };
        elems.push((eid, "frame", bl, left, 1, 1, false, false)); eid += 1;
        elems.push((eid, "frame", br, right, 1, 1, false, false)); eid += 1;
        elems.push((eid, "frame", left, right, 1, 1, false, false)); eid += 1;
    }

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: f, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: f, fy: 0.0, mz: 0.0 }),
    ];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Displacements increase with height
    let d_floor1 = results.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().ux;
    let d_floor2 = results.displacements.iter()
        .find(|d| d.node_id == 5).unwrap().ux;
    let d_floor3 = results.displacements.iter()
        .find(|d| d.node_id == 7).unwrap().ux;

    assert!(d_floor1 > 0.0, "Floor 1: positive drift");
    assert!(d_floor2 > d_floor1, "Floor 2 > Floor 1");
    assert!(d_floor3 > d_floor2, "Floor 3 > Floor 2");

    // Story drifts
    let story_drift_1 = d_floor1;
    let _story_drift_2 = d_floor2 - d_floor1;
    let story_drift_3 = d_floor3 - d_floor2;

    // Bottom story carries most shear → largest story drift
    assert!(story_drift_1 > story_drift_3,
        "Story 1 drift > story 3 drift: {:.6e} > {:.6e}",
        story_drift_1, story_drift_3);
}

// ================================================================
// 6. Stiffness Effect: Larger I → Less Drift
// ================================================================

#[test]
fn validation_drift_stiffness_effect() {
    let w = 6.0;
    let h = 4.0;
    let f = 10.0;

    // Standard IZ
    let input1 = make_portal_frame(h, w, E, A, IZ, f, 0.0);
    let d1 = linear::solve_2d(&input1).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // Double IZ → half drift (approximately)
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 4, 3, 1, 1, false, false),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f, fy: 0.0, mz: 0.0,
    })];
    let input2 = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, 2.0 * IZ)], elems,
        vec![(1, 1, "fixed"), (2, 4, "fixed")], loads);
    let d2 = linear::solve_2d(&input2).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // δ ∝ 1/I → d1/d2 ≈ 2
    assert_close(d1 / d2, 2.0, 0.10,
        "Stiffness: δ ∝ 1/I");
}

// ================================================================
// 7. Height Effect: H³ Dependence
// ================================================================

#[test]
fn validation_drift_height_effect() {
    let n = 10;
    let p = 10.0;

    // Cantilever columns of different heights
    let mut drifts = Vec::new();
    for h in &[3.0, 4.0, 5.0] {
        let mut nodes = Vec::new();
        let mut elems = Vec::new();
        for i in 0..=n {
            nodes.push((i + 1, 0.0, i as f64 * h / n as f64));
            if i > 0 {
                elems.push((i, "frame", i, i + 1, 1, 1, false, false));
            }
        }
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: p, fy: 0.0, mz: 0.0,
        })];
        let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems,
            vec![(1, 1, "fixed")], loads);
        let d = linear::solve_2d(&input).unwrap()
            .displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;
        drifts.push(d);
    }

    // δ ∝ H³ → d(4)/d(3) = (4/3)³, d(5)/d(3) = (5/3)³
    assert_close(drifts[1] / drifts[0], (4.0_f64 / 3.0).powi(3), 0.02,
        "Height: δ ∝ H³ (4/3)");
    assert_close(drifts[2] / drifts[0], (5.0_f64 / 3.0).powi(3), 0.02,
        "Height: δ ∝ H³ (5/3)");
}

// ================================================================
// 8. Drift Under Combined Axial + Lateral
// ================================================================

#[test]
fn validation_drift_axial_lateral() {
    let h = 4.0;
    let n = 8;
    let f_lat = 10.0;
    let f_axial = 50.0;

    // Cantilever column: lateral + axial (compression)
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    for i in 0..=n {
        nodes.push((i + 1, 0.0, i as f64 * h / n as f64));
        if i > 0 {
            elems.push((i, "frame", i, i + 1, 1, 1, false, false));
        }
    }

    // Lateral only
    let loads_lat = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: f_lat, fy: 0.0, mz: 0.0,
    })];
    let input_lat = make_input(nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), vec![(1, 1, "fixed")], loads_lat);
    let d_lat = linear::solve_2d(&input_lat).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;

    // Combined lateral + axial
    let loads_both = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: f_lat, fy: -f_axial, mz: 0.0,
    })];
    let input_both = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, vec![(1, 1, "fixed")], loads_both);
    let d_both = linear::solve_2d(&input_both).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;

    // In linear analysis (no P-delta), lateral drift should be the same
    // regardless of axial load
    assert_close(d_both, d_lat, 0.01,
        "Axial+lateral: same drift in linear analysis");
}
