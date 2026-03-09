/// Validation: Multi-Story Frame Analysis
///
/// References:
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed.
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 12 (Displacement Method)
///   - ASCE 7-22, Ch. 12 (Seismic lateral force distribution)
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 8 (Portal Method)
///
/// Tests:
///   1. Two-story single-bay: story shear = sum of lateral loads above
///   2. Three-story frame: drift increases with height, overturning moment at base
///   3. Soft story: reduced stiffness produces larger drift ratio at that level
///   4. Two-bay frame: interior columns share load from both bays
///   5. Multi-story gravity: column axial load accumulates from roof to foundation
///   6. Story drift ratio: interstory drift/height comparison between stories
///   7. Column moment: portal method column moments from lateral loads
///   8. Base shear: total horizontal reaction equals sum of applied lateral forces
use dedaliano_engine::solver::linear::*;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Two-Story Single-Bay: Lateral Load Distribution / Story Shear
// ================================================================
//
// 2-story, 1-bay frame with fixed bases.
// Lateral loads: F1=20 kN at 1st floor, F2=10 kN at roof.
// Story shear at level 1 = F1 + F2 = 30 kN.
// Story shear at level 2 = F2 = 10 kN.
// Sum of horizontal reactions at base must equal total lateral load.
//
// Nodes: 1(0,0), 2(0,h1), 3(0,h1+h2), 4(w,0), 5(w,h1), 6(w,h1+h2)
// Columns: 1->2, 4->5, 2->3, 5->6.  Beams: 2->5, 3->6.
// Fixed at 1 and 4.

#[test]
fn validation_multi_story_two_story_story_shear() {
    let h1 = 4.0; // story 1 height
    let h2 = 3.5; // story 2 height
    let w = 6.0;  // bay width
    let f1 = 20.0; // lateral at 1st floor
    let f2 = 10.0; // lateral at roof

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h1),
        (3, 0.0, h1 + h2),
        (4, w, 0.0),
        (5, w, h1),
        (6, w, h1 + h2),
    ];

    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left col story 1
        (2, "frame", 4, 5, 1, 1, false, false), // right col story 1
        (3, "frame", 2, 3, 1, 1, false, false), // left col story 2
        (4, "frame", 5, 6, 1, 1, false, false), // right col story 2
        (5, "frame", 2, 5, 1, 1, false, false), // beam floor 1
        (6, "frame", 3, 6, 1, 1, false, false), // beam roof
    ];

    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f1, fy: 0.0, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: f2, fy: 0.0, mz: 0.0,
        }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Total base shear = F1 + F2 = 30 kN
    let total_lateral = f1 + f2;
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), total_lateral, 0.02, "two-story base shear = F1+F2");

    // Story shear in story 2 columns (elems 3, 4) should sum to F2
    // Column shear is the v_start or v_end of the column element.
    let ef3 = results.element_forces.iter().find(|ef| ef.element_id == 3).unwrap();
    let ef4 = results.element_forces.iter().find(|ef| ef.element_id == 4).unwrap();
    let story2_shear = ef3.v_start.abs() + ef4.v_start.abs();
    assert_close(story2_shear, f2, 0.05, "story 2 shear = F2");

    // Story shear in story 1 columns (elems 1, 2) should sum to F1 + F2
    let ef1 = results.element_forces.iter().find(|ef| ef.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|ef| ef.element_id == 2).unwrap();
    let story1_shear = ef1.v_start.abs() + ef2.v_start.abs();
    assert_close(story1_shear, total_lateral, 0.05, "story 1 shear = F1+F2");
}

// ================================================================
// 2. Three-Story Frame: Drift Increases With Height
// ================================================================
//
// 3-story, 1-bay frame with fixed bases.
// Equal lateral loads at each floor level.
// Lateral drift at roof > 2nd floor > 1st floor.
// Overturning moment at base = sum(Fi * hi).

#[test]
fn validation_multi_story_three_story_drift_and_overturning() {
    let h = 3.5; // equal story height
    let w = 6.0;
    let f_lat = 10.0; // equal lateral load at each level

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, 0.0, 2.0 * h),
        (4, 0.0, 3.0 * h),
        (5, w, 0.0),
        (6, w, h),
        (7, w, 2.0 * h),
        (8, w, 3.0 * h),
    ];

    let elems = vec![
        // Left columns
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        // Right columns
        (4, "frame", 5, 6, 1, 1, false, false),
        (5, "frame", 6, 7, 1, 1, false, false),
        (6, "frame", 7, 8, 1, 1, false, false),
        // Beams
        (7, "frame", 2, 6, 1, 1, false, false),
        (8, "frame", 3, 7, 1, 1, false, false),
        (9, "frame", 4, 8, 1, 1, false, false),
    ];

    let sups = vec![(1, 1, "fixed"), (2, 5, "fixed")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f_lat, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f_lat, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: f_lat, fy: 0.0, mz: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Drift increases with height: ux(roof) > ux(2nd) > ux(1st)
    let ux_1st = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    let ux_2nd = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux.abs();
    let ux_roof = results.displacements.iter().find(|d| d.node_id == 4).unwrap().ux.abs();

    assert!(
        ux_roof > ux_2nd,
        "roof drift ({:.6}) should exceed 2nd floor drift ({:.6})",
        ux_roof, ux_2nd
    );
    assert!(
        ux_2nd > ux_1st,
        "2nd floor drift ({:.6}) should exceed 1st floor drift ({:.6})",
        ux_2nd, ux_1st
    );

    // Overturning moment at base = F*h + F*2h + F*3h = F*h*(1+2+3) = 6*F*h
    let overturning: f64 = f_lat * h + f_lat * 2.0 * h + f_lat * 3.0 * h;
    // Overturning is resisted by vertical reactions: M_ot = Ry_right * w - Ry_left * w
    // (taking moments about left base)
    // With just lateral loads, vertical reactions form a couple.
    let _ry_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let ry_right = results.reactions.iter().find(|r| r.node_id == 5).unwrap().ry;

    // Sum of base moments (Mz reactions) + vertical couple must equal overturning
    let mz_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap().mz;
    let mz_right = results.reactions.iter().find(|r| r.node_id == 5).unwrap().mz;
    let resisting_moment = ry_right * w + mz_left + mz_right;
    // The resisting moment should equal the overturning moment (sign-wise)
    assert_close(
        resisting_moment.abs(),
        overturning.abs(),
        0.05,
        "overturning moment balance at base",
    );

    // Base shear equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), 3.0 * f_lat, 0.02, "three-story base shear");
}

// ================================================================
// 3. Soft Story: Reduced Stiffness Produces Larger Drift Ratio
// ================================================================
//
// 2-story frame where story 1 has smaller column section (soft story).
// The interstory drift ratio at story 1 should be larger than at story 2.
// This validates the stiffness distribution effect on drift concentration.

#[test]
fn validation_multi_story_soft_story_drift_concentration() {
    let h = 3.5;
    let w = 6.0;
    let f_lat = 15.0; // lateral at roof

    // Section 1: normal columns (for story 2)
    // Section 2: weak columns (for story 1 - soft story) with IZ/4
    let iz_weak = IZ / 4.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, 0.0, 2.0 * h),
        (4, w, 0.0),
        (5, w, h),
        (6, w, 2.0 * h),
    ];

    let elems = vec![
        // Story 1 columns use section 2 (weak)
        (1, "frame", 1, 2, 1, 2, false, false),
        (2, "frame", 4, 5, 1, 2, false, false),
        // Story 2 columns use section 1 (normal)
        (3, "frame", 2, 3, 1, 1, false, false),
        (4, "frame", 5, 6, 1, 1, false, false),
        // Beams use section 1
        (5, "frame", 2, 5, 1, 1, false, false),
        (6, "frame", 3, 6, 1, 1, false, false),
    ];

    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f_lat, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: f_lat, fy: 0.0, mz: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, iz_weak)],
        elems,
        sups,
        loads,
    );
    let results = solve_2d(&input).expect("solve");

    // Interstory drift ratio = (ux_top - ux_bottom) / story_height
    let ux_base: f64 = 0.0; // fixed base
    let ux_1st = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux_2nd = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;

    let drift_ratio_1: f64 = (ux_1st - ux_base).abs() / h;
    let drift_ratio_2: f64 = (ux_2nd - ux_1st).abs() / h;

    // Soft story (story 1) should have larger drift ratio
    assert!(
        drift_ratio_1 > drift_ratio_2,
        "soft story drift ratio ({:.6e}) should exceed upper story ({:.6e})",
        drift_ratio_1, drift_ratio_2
    );

    // Soft story drift ratio should be significantly larger (at least 1.5x)
    assert!(
        drift_ratio_1 > drift_ratio_2 * 1.5,
        "soft story drift ratio ({:.6e}) should be >1.5x upper story ({:.6e})",
        drift_ratio_1, drift_ratio_2
    );
}

// ================================================================
// 4. Two-Bay Frame: Interior Columns Share Load From Both Bays
// ================================================================
//
// 1-story, 2-bay frame with equal bays. Symmetric gravity load on beam.
// Interior column (shared by both bays) should carry approximately
// twice the axial load of exterior columns due to tributary area.

#[test]
fn validation_multi_story_two_bay_interior_column_load() {
    let h = 4.0;
    let w = 6.0; // each bay width
    let q = -10.0; // distributed gravity load on beams (kN/m)

    // Nodes: 1(0,0), 2(0,h), 3(w,h), 4(w,0), 5(2w,h), 6(2w,0)
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
        (5, 2.0 * w, h),
        (6, 2.0 * w, 0.0),
    ];

    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left exterior column
        (2, "frame", 4, 3, 1, 1, false, false), // interior column
        (3, "frame", 6, 5, 1, 1, false, false), // right exterior column
        (4, "frame", 2, 3, 1, 1, false, false), // left bay beam
        (5, "frame", 3, 5, 1, 1, false, false), // right bay beam
    ];

    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed"), (3, 6, "fixed")];

    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 4, q_i: q, q_j: q, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 5, q_i: q, q_j: q, a: None, b: None,
        }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Interior column at node 4 should carry more vertical load
    let ry_ext_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let ry_interior = results.reactions.iter().find(|r| r.node_id == 4).unwrap().ry;
    let ry_ext_right = results.reactions.iter().find(|r| r.node_id == 6).unwrap().ry;

    // Interior column carries ~twice the load of exterior columns
    let avg_ext = (ry_ext_left.abs() + ry_ext_right.abs()) / 2.0;
    assert!(
        ry_interior.abs() > avg_ext * 1.5,
        "interior column reaction ({:.4}) should be > 1.5x avg exterior ({:.4})",
        ry_interior.abs(), avg_ext
    );

    // Vertical equilibrium: sum of Ry = total gravity = q * 2w
    let total_gravity: f64 = q.abs() * 2.0 * w;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_gravity, 0.02, "two-bay vertical equilibrium");
}

// ================================================================
// 5. Multi-Story Gravity: Column Axial Load Accumulates Downward
// ================================================================
//
// 3-story frame with gravity loads at each level. Column axial force
// increases from roof to foundation as it accumulates tributary loads.

#[test]
fn validation_multi_story_gravity_axial_accumulation() {
    let h = 3.5;
    let w = 6.0;
    let p = -20.0; // gravity load at each beam-column joint (kN)

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, 0.0, 2.0 * h),
        (4, 0.0, 3.0 * h),
        (5, w, 0.0),
        (6, w, h),
        (7, w, 2.0 * h),
        (8, w, 3.0 * h),
    ];

    let elems = vec![
        // Left columns (bottom to top: 1, 2, 3)
        (1, "frame", 1, 2, 1, 1, false, false), // story 1
        (2, "frame", 2, 3, 1, 1, false, false), // story 2
        (3, "frame", 3, 4, 1, 1, false, false), // story 3
        // Right columns
        (4, "frame", 5, 6, 1, 1, false, false),
        (5, "frame", 6, 7, 1, 1, false, false),
        (6, "frame", 7, 8, 1, 1, false, false),
        // Beams
        (7, "frame", 2, 6, 1, 1, false, false),
        (8, "frame", 3, 7, 1, 1, false, false),
        (9, "frame", 4, 8, 1, 1, false, false),
    ];

    let sups = vec![(1, 1, "fixed"), (2, 5, "fixed")];

    // Gravity loads at each floor level on both sides
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fy: p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 0.0, fy: p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 8, fx: 0.0, fy: p, mz: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Axial force in left columns should increase from top to bottom.
    // n_start is the axial force at the start of the element.
    // Column element 3 (story 3): carries load from roof only (1 level)
    // Column element 2 (story 2): carries load from roof + 3rd floor (2 levels)
    // Column element 1 (story 1): carries load from all 3 levels
    let n_story3 = results.element_forces.iter()
        .find(|ef| ef.element_id == 3).unwrap().n_start.abs();
    let n_story2 = results.element_forces.iter()
        .find(|ef| ef.element_id == 2).unwrap().n_start.abs();
    let n_story1 = results.element_forces.iter()
        .find(|ef| ef.element_id == 1).unwrap().n_start.abs();

    assert!(
        n_story1 > n_story2,
        "story 1 column axial ({:.4}) should exceed story 2 ({:.4})",
        n_story1, n_story2
    );
    assert!(
        n_story2 > n_story3,
        "story 2 column axial ({:.4}) should exceed story 3 ({:.4})",
        n_story2, n_story3
    );

    // Each column at the base should carry half the total gravity
    // Total gravity = 6 loads * |p| = 120 kN, each side = 60 kN
    let total_gravity: f64 = 6.0 * p.abs();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_gravity, 0.02, "gravity accumulation total Ry");
}

// ================================================================
// 6. Story Drift Ratio: Interstory Drift Comparison
// ================================================================
//
// 3-story frame with inverted triangular lateral load pattern (larger
// at top, smaller at bottom -- typical seismic distribution).
// Verify interstory drift ratios and compare between stories.
// Lower stories with higher cumulative shear have larger absolute drift
// but the drift ratio pattern depends on stiffness.

#[test]
fn validation_multi_story_drift_ratio_comparison() {
    let h = 3.5;
    let w = 6.0;
    // Inverted triangular: loads increase with height
    let f1 = 5.0;  // 1st floor
    let f2 = 10.0; // 2nd floor
    let f3 = 15.0; // roof

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, 0.0, 2.0 * h),
        (4, 0.0, 3.0 * h),
        (5, w, 0.0),
        (6, w, h),
        (7, w, 2.0 * h),
        (8, w, 3.0 * h),
    ];

    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 5, 6, 1, 1, false, false),
        (5, "frame", 6, 7, 1, 1, false, false),
        (6, "frame", 7, 8, 1, 1, false, false),
        (7, "frame", 2, 6, 1, 1, false, false),
        (8, "frame", 3, 7, 1, 1, false, false),
        (9, "frame", 4, 8, 1, 1, false, false),
    ];

    let sups = vec![(1, 1, "fixed"), (2, 5, "fixed")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f1, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f2, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: f3, fy: 0.0, mz: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Extract horizontal displacements (use left column nodes)
    let ux_0: f64 = 0.0; // base (fixed)
    let ux_1 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux_2 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let ux_3 = results.displacements.iter().find(|d| d.node_id == 4).unwrap().ux;

    // Interstory drifts
    let delta_1: f64 = (ux_1 - ux_0).abs();
    let delta_2: f64 = (ux_2 - ux_1).abs();
    let delta_3: f64 = (ux_3 - ux_2).abs();

    // Drift ratios
    let dr_1: f64 = delta_1 / h;
    let dr_2: f64 = delta_2 / h;
    let dr_3: f64 = delta_3 / h;

    // All drift ratios must be positive
    assert!(dr_1 > 0.0, "story 1 drift ratio must be positive");
    assert!(dr_2 > 0.0, "story 2 drift ratio must be positive");
    assert!(dr_3 > 0.0, "story 3 drift ratio must be positive");

    // For uniform stiffness with inverted triangular loading:
    // Story 1 has cumulative shear = f1+f2+f3 = 30, story 2 = f2+f3 = 25, story 3 = f3 = 15
    // Story 1 drift ratio should be the largest (most cumulative shear, fixed base)
    assert!(
        dr_1 > dr_3,
        "story 1 drift ratio ({:.6e}) should exceed story 3 ({:.6e})",
        dr_1, dr_3
    );

    // Total roof drift = sum of interstory drifts
    let total_roof_drift: f64 = (ux_3 - ux_0).abs();
    let sum_deltas: f64 = delta_1 + delta_2 + delta_3;
    assert_close(total_roof_drift, sum_deltas, 0.01, "roof drift = sum of interstory drifts");
}

// ================================================================
// 7. Column Moment: Portal Method Column Moments
// ================================================================
//
// 1-story, 1-bay portal frame with lateral load H at beam level.
// With fixed bases and portal method approximation:
//   Column base moments = H*h/4 (each column)
//   Column shear = H/2 (each column)
// FEM should match closely for a symmetric portal with rigid beams.
// We use a much stiffer beam to approach portal method assumptions.

#[test]
fn validation_multi_story_portal_method_column_moments() {
    let h = 4.0;
    let w = 6.0;
    let h_load = 20.0;

    // Section 1: normal columns. Section 2: very stiff beam (10x Iz)
    let iz_beam = IZ * 10.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];

    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 2, false, false), // beam (stiff)
        (3, "frame", 3, 4, 1, 1, false, false), // right column
    ];

    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: h_load, fy: 0.0, mz: 0.0,
        }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, iz_beam)],
        elems,
        sups,
        loads,
    );
    let results = solve_2d(&input).expect("solve");

    // Portal method: each column carries H/2 shear
    let expected_shear = h_load / 2.0;
    let ef1 = results.element_forces.iter().find(|ef| ef.element_id == 1).unwrap();
    let ef3 = results.element_forces.iter().find(|ef| ef.element_id == 3).unwrap();
    assert_close(ef1.v_start.abs(), expected_shear, 0.10, "left col shear ~ H/2");
    assert_close(ef3.v_start.abs(), expected_shear, 0.10, "right col shear ~ H/2");

    // For fixed-base portal with rigid beam, inflection at mid-height:
    // Base moment = (H/2) * (h/2) = H*h/4 = 20 kN-m
    let expected_base_moment = h_load * h / 4.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // With a very stiff beam, the actual base moments approach H*h/4
    // Allow 20% tolerance since beam is stiff but not infinitely rigid
    assert_close(r1.mz.abs(), expected_base_moment, 0.20, "left base moment ~ H*h/4");
    assert_close(r4.mz.abs(), expected_base_moment, 0.20, "right base moment ~ H*h/4");

    // Equilibrium check
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), h_load, 0.02, "portal method base shear equilibrium");
}

// ================================================================
// 8. Base Shear: Total Horizontal Reaction Equals Applied Lateral
// ================================================================
//
// 4-story frame with varying lateral loads at each level.
// Verify that sum of horizontal base reactions equals the sum of
// all applied lateral forces (global equilibrium).
// Also verify that vertical reactions sum to zero (no gravity loads).

#[test]
fn validation_multi_story_base_shear_equilibrium() {
    let h = 3.0;
    let w = 5.0;
    let forces = [5.0, 10.0, 15.0, 20.0]; // lateral at floors 1-4

    // 4-story, 1-bay frame
    let mut nodes = Vec::new();
    // Left column nodes: 1, 2, 3, 4, 5 (base to roof)
    for i in 0..5 {
        nodes.push((i + 1, 0.0, i as f64 * h));
    }
    // Right column nodes: 6, 7, 8, 9, 10
    for i in 0..5 {
        nodes.push((i + 6, w, i as f64 * h));
    }

    let mut elems = Vec::new();
    let mut eid = 1;
    // Left columns (4 stories)
    for i in 0..4 {
        elems.push((eid, "frame", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Right columns
    for i in 0..4 {
        elems.push((eid, "frame", i + 6, i + 7, 1, 1, false, false));
        eid += 1;
    }
    // Beams at each floor level (nodes 2-7, 3-8, 4-9, 5-10)
    for i in 0..4 {
        elems.push((eid, "frame", i + 2, i + 7, 1, 1, false, false));
        eid += 1;
    }

    let sups = vec![(1, 1, "fixed"), (2, 6, "fixed")];

    // Lateral loads at left column nodes (floors 1-4)
    let loads: Vec<SolverLoad> = forces.iter().enumerate().map(|(i, &f)| {
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: i + 2, // nodes 2, 3, 4, 5
            fx: f,
            fy: 0.0,
            mz: 0.0,
        })
    }).collect();

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Total applied lateral = 5 + 10 + 15 + 20 = 50 kN
    let total_lateral: f64 = forces.iter().sum();

    // Sum of horizontal reactions must equal total lateral
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), total_lateral, 0.02, "4-story base shear = sum of lateral forces");

    // Sum of vertical reactions should be zero (no gravity loads)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry.abs(), 0.0, 0.02, "4-story sum Ry = 0 (no gravity)");

    // Base shear is shared between two columns
    let rx_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rx;
    let rx_right = results.reactions.iter().find(|r| r.node_id == 6).unwrap().rx;
    // Both columns should resist some portion of the shear
    assert!(rx_left.abs() > 1.0, "left base rx should be significant");
    assert!(rx_right.abs() > 1.0, "right base rx should be significant");
    assert_close(
        rx_left.abs() + rx_right.abs(),
        total_lateral,
        0.02,
        "sum of base column shears = total lateral",
    );
}
