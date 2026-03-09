/// Validation: Multi-Story Frame Lateral Analysis
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 7 (portal/cantilever method)
///   - ASCE 7-22 §12.8.6 (story drift)
///   - AISC 360-22 Appendix 7 (serviceability)
///   - Taranath, "Structural Analysis and Design of Tall Buildings"
///
/// Tests verify lateral analysis of multi-story frames:
///   1. Single-bay portal: base shear equilibrium
///   2. Two-story frame: story shear distribution
///   3. Two-bay portal: load sharing between bays
///   4. Story drift ratio check
///   5. Overturning moment equilibrium
///   6. Multi-story stiffness monotonicity
///   7. Soft-story detection: flexible ground floor
///   8. Symmetric frame: zero lateral drift under gravity
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Single-Bay Portal: Base Shear = Applied Load
// ================================================================

#[test]
fn validation_lateral_single_bay_base_shear() {
    let h = 4.0;
    let w = 6.0;
    let p = 30.0;

    let input = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // ΣRx = -P (base shear equals applied lateral load)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let err = (sum_rx + p).abs() / p;
    assert!(err < 0.01,
        "Base shear: ΣRx={:.4}, expected -P={:.4}", sum_rx, -p);

    // Fixed-base portal: inflection points near mid-height of columns
    // Column moments at base should be significant
    let m_bases: Vec<f64> = results.reactions.iter()
        .map(|r| r.mz.abs())
        .collect();
    for m in &m_bases {
        assert!(*m > 0.1,
            "Base moment should be non-zero: {:.4}", m);
    }
}

// ================================================================
// 2. Two-Story Frame: Story Shear
// ================================================================
//
// Two-story, single-bay frame. F₁ at level 1, F₂ at level 2.
// Story shear: V₁ = F₁ + F₂ (ground floor), V₂ = F₂ (upper floor).

#[test]
fn validation_lateral_two_story_shear() {
    let h = 3.5;
    let w = 6.0;
    let f1 = 15.0; // at level 1
    let f2 = 25.0; // at level 2

    // Nodes: 1=base-left, 2=base-right, 3=level1-left, 4=level1-right,
    //        5=level2-left, 6=level2-right
    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0),
        (3, 0.0, h), (4, w, h),
        (5, 0.0, 2.0 * h), (6, w, 2.0 * h),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false), // left col floor 1
        (2, "frame", 2, 4, 1, 1, false, false), // right col floor 1
        (3, "frame", 3, 4, 1, 1, false, false), // beam level 1
        (4, "frame", 3, 5, 1, 1, false, false), // left col floor 2
        (5, "frame", 4, 6, 1, 1, false, false), // right col floor 2
        (6, "frame", 5, 6, 1, 1, false, false), // beam level 2
    ];
    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f1, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: f2, fy: 0.0, mz: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total base shear = F₁ + F₂
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let v_total = f1 + f2;
    let err = (sum_rx + v_total).abs() / v_total;
    assert!(err < 0.01,
        "Two-story base shear: ΣRx={:.4}, expected -V_total={:.4}", sum_rx, -v_total);

    // Upper story drift should be larger than lower (softer at top for constant stiffness)
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let d5 = results.displacements.iter().find(|d| d.node_id == 5).unwrap().ux;
    assert!(d5 > d3,
        "Upper drift {:.6} should exceed lower drift {:.6}", d5, d3);
}

// ================================================================
// 3. Two-Bay Portal: Load Sharing
// ================================================================
//
// Two-bay frame under lateral load. Interior column takes double shear.

#[test]
fn validation_lateral_two_bay_sharing() {
    let h = 4.0;
    let w = 5.0;
    let p = 30.0;

    // 3 columns (nodes 1,2,3 at base; 4,5,6 at top), 2 beams
    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0), (3, 2.0 * w, 0.0),
        (4, 0.0, h), (5, w, h), (6, 2.0 * w, h),
    ];
    let elems = vec![
        (1, "frame", 1, 4, 1, 1, false, false), // col 1
        (2, "frame", 2, 5, 1, 1, false, false), // col 2
        (3, "frame", 3, 6, 1, 1, false, false), // col 3
        (4, "frame", 4, 5, 1, 1, false, false), // beam 1
        (5, "frame", 5, 6, 1, 1, false, false), // beam 2
    ];
    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed"), (3, 3, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: p, fy: 0.0, mz: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total base shear = P
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let err = (sum_rx + p).abs() / p;
    assert!(err < 0.01,
        "Two-bay base shear: ΣRx={:.4}, expected -P={:.4}", sum_rx, -p);

    // All columns resist the load; for equal stiffness, exterior columns
    // take less than interior (portal method: each bay gets P/2)
    let rx1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rx.abs();
    let rx2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap().rx.abs();
    let rx3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap().rx.abs();

    // Interior column shares load from both bays
    assert!(rx2 > rx1 * 0.8, "Interior column should take significant shear: rx2={:.4}", rx2);
    assert!((rx1 + rx2 + rx3 - p).abs() < p * 0.01,
        "Shear sum: {:.4} + {:.4} + {:.4} = {:.4}", rx1, rx2, rx3, rx1 + rx2 + rx3);
}

// ================================================================
// 4. Story Drift Ratio
// ================================================================
//
// Single-story portal: drift ratio Δ/h.
// For fixed-base portal: k = 24EI/h³ × (1/(1+6k_c/k_b))
// where k_c = I/h, k_b = I/w.

#[test]
fn validation_lateral_drift_ratio() {
    let h = 3.5;
    let w = 6.0;
    let p = 20.0;

    let input = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Get lateral drift at beam level
    // make_portal_frame: 1=(0,0), 2=(0,h) top-left, 3=(w,h) top-right, 4=(w,0)
    let d_top = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Drift ratio
    let drift_ratio = d_top.abs() / h;

    // Must be positive (frame sways in load direction)
    assert!(d_top > 0.0, "Frame should sway in load direction: ux={:.6e}", d_top);

    // Drift ratio should be reasonable (not zero, not huge)
    assert!(drift_ratio > 1e-6 && drift_ratio < 0.1,
        "Drift ratio {:.6} should be reasonable", drift_ratio);

    // Both top nodes should have same lateral displacement (rigid beam assumption approx)
    let d_top_r = results.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().ux;
    let diff = (d_top - d_top_r).abs() / d_top.abs();
    assert!(diff < 0.15,
        "Top nodes should have similar drift: left={:.6e}, right={:.6e}", d_top, d_top_r);
}

// ================================================================
// 5. Overturning Moment Equilibrium
// ================================================================
//
// Multi-story frame: overturning moment = Σ(F_i × h_i).
// Resisted by base moments + column axial forces × lever arm.

#[test]
fn validation_lateral_overturning() {
    let h = 3.5;
    let w = 8.0;
    let f1 = 10.0;
    let f2 = 20.0;
    let f3 = 30.0;

    // Three-story single-bay frame
    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0),
        (3, 0.0, h), (4, w, h),
        (5, 0.0, 2.0 * h), (6, w, 2.0 * h),
        (7, 0.0, 3.0 * h), (8, w, 3.0 * h),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 3, 5, 1, 1, false, false),
        (5, "frame", 4, 6, 1, 1, false, false),
        (6, "frame", 5, 6, 1, 1, false, false),
        (7, "frame", 5, 7, 1, 1, false, false),
        (8, "frame", 6, 8, 1, 1, false, false),
        (9, "frame", 7, 8, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f1, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: f2, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: f3, fy: 0.0, mz: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Applied overturning moment about base-left corner
    let m_applied = f1 * h + f2 * 2.0 * h + f3 * 3.0 * h;

    // Resisting: base moments + vertical reactions × lever arms
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();

    // Moment equilibrium about left base: ΣM = 0
    let residual = -m_applied + r1.mz + r2.mz + r2.ry * w;
    let err = residual.abs() / m_applied.abs();
    assert!(err < 0.01,
        "Overturning equilibrium: residual={:.4}, M_applied={:.4}", residual, m_applied);
}

// ================================================================
// 6. Multi-Story Stiffness: Taller = More Flexible
// ================================================================
//
// Compare drift of 1-story vs 2-story vs 3-story frames.
// Same load, same sections: taller frames deflect more.

#[test]
fn validation_lateral_stiffness_monotonicity() {
    let h = 3.5;
    let w = 6.0;
    let p = 20.0;

    // 1-story
    let input1 = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let r1 = linear::solve_2d(&input1).unwrap();
    let d1 = r1.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;

    // 2-story (double height, load at top)
    let input2 = make_portal_frame(2.0 * h, w, E, A, IZ, p, 0.0);
    let r2 = linear::solve_2d(&input2).unwrap();
    let d2 = r2.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;

    // 3-story (triple height, load at top)
    let input3 = make_portal_frame(3.0 * h, w, E, A, IZ, p, 0.0);
    let r3 = linear::solve_2d(&input3).unwrap();
    let d3 = r3.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;

    // Monotonically increasing drift
    assert!(d2 > d1, "2-story drift {:.6e} should exceed 1-story {:.6e}", d2, d1);
    assert!(d3 > d2, "3-story drift {:.6e} should exceed 2-story {:.6e}", d3, d2);

    // Column flexural stiffness ∝ 1/h³, so drift ratio should grow roughly as h³
    let ratio_21 = d2 / d1;
    assert!(ratio_21 > 2.0, "Drift ratio 2/1 = {:.2}, expected > 2", ratio_21);
}

// ================================================================
// 7. Soft Story: Flexible Ground Floor
// ================================================================
//
// Two-story frame where ground floor columns have smaller section.
// Ground floor drift should be disproportionately larger.

#[test]
fn validation_lateral_soft_story() {
    let h = 3.5;
    let w = 6.0;
    let p = 20.0;

    let iz_stiff = IZ;
    let iz_soft = IZ / 4.0; // Ground floor 4x more flexible

    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0),
        (3, 0.0, h), (4, w, h),
        (5, 0.0, 2.0 * h), (6, w, 2.0 * h),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 2, false, false), // soft ground cols (section 2)
        (2, "frame", 2, 4, 1, 2, false, false),
        (3, "frame", 3, 4, 1, 1, false, false), // stiff beam
        (4, "frame", 3, 5, 1, 1, false, false), // stiff upper cols
        (5, "frame", 4, 6, 1, 1, false, false),
        (6, "frame", 5, 6, 1, 1, false, false), // stiff beam
    ];
    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: p, fy: 0.0, mz: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, iz_stiff), (2, A, iz_soft)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let d_level1 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let d_level2 = results.displacements.iter().find(|d| d.node_id == 5).unwrap().ux;

    // Inter-story drifts
    let drift_ground = d_level1;
    let drift_upper = d_level2 - d_level1;

    // Ground floor drift should be larger than upper floor drift (softer columns)
    assert!(drift_ground.abs() > drift_upper.abs(),
        "Soft story: ground drift {:.6e} should be > upper drift {:.6e}",
        drift_ground, drift_upper);
}

// ================================================================
// 8. Symmetric Frame: Zero Drift Under Gravity
// ================================================================
//
// Symmetric portal frame under symmetric gravity loads.
// Should produce zero lateral displacement (no sidesway).

#[test]
fn validation_lateral_symmetric_no_sway() {
    let h = 4.0;
    let w = 6.0;
    let q = -15.0; // gravity UDL on beam

    // Portal frame with gravity load only
    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0),
        (3, 0.0, h), (4, w, h),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false), // beam
    ];
    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];

    // UDL on beam (element 3)
    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 3, q_i: q, q_j: q, a: None, b: None,
        }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // No lateral displacement at beam level
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap().ux;

    let d_max = results.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);

    // Lateral drift should be negligible compared to vertical deflection
    // Allow small numerical noise (frame asymmetry from element orientation)
    assert!(d3.abs() < d_max * 0.05 || d3.abs() < 1e-4,
        "Symmetric gravity: lateral drift at node 3 = {:.6e} should be ≈ 0 (d_max={:.6e})", d3, d_max);
    assert!(d4.abs() < d_max * 0.05 || d4.abs() < 1e-4,
        "Symmetric gravity: lateral drift at node 4 = {:.6e} should be ≈ 0 (d_max={:.6e})", d4, d_max);

    // Symmetric reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    let diff_ry = (r1.ry - r2.ry).abs() / r1.ry.abs();
    assert!(diff_ry < 0.01,
        "Symmetric reactions: Ry1={:.4}, Ry2={:.4}", r1.ry, r2.ry);
}
