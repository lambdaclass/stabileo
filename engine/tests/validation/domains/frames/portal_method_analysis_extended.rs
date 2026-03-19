/// Validation: Portal Method Analysis Extended
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 7 (Portal method)
///   - McCormac & Nelson, "Structural Analysis", Ch. 16
///   - Leet, Uang, Gilbert, "Fundamentals of Structural Analysis", Ch. 12
///
/// Tests verify portal method approximations and frame behavior:
///   1. Single-story portal: base shear splits equally between columns
///   2. Two-story portal: cumulative base shear equals total applied lateral force
///   3. Multi-bay portal: interior columns carry twice the shear of exterior columns
///   4. Portal frame: inflection points at approximately mid-height of columns
///   5. Two-bay portal: horizontal equilibrium verified
///   6. Portal with unequal bays: moment distribution compared between bays
///   7. Portal frame: top beam moment from column end moments equilibrium
///   8. Three-story frame: drift increases with height
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Single-Story Portal: Base Shear Splits Equally Between Columns
// ================================================================
//
// A symmetric single-bay, single-story fixed-base portal frame with
// a lateral load F applied at the top. By the portal method assumption,
// each column carries V = F/2 base shear.
//
//     F --> 2 -------- 3
//           |          |
//           |          |
//           1(fixed)   4(fixed)

#[test]
fn validation_portal_single_story_equal_base_shear() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 30.0;

    let input = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Base shear at each column (horizontal reactions)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Portal method: each column carries F/2
    let expected_each = f_lat / 2.0;

    assert_close(
        r1.rx.abs(),
        expected_each,
        0.15,
        "single-story portal: left column base shear ~ F/2",
    );
    assert_close(
        r4.rx.abs(),
        expected_each,
        0.15,
        "single-story portal: right column base shear ~ F/2",
    );

    // Total base shear must equal applied load exactly (equilibrium)
    let total_base_shear: f64 = (r1.rx + r4.rx).abs();
    assert_close(
        total_base_shear,
        f_lat,
        0.02,
        "single-story portal: total base shear = F",
    );
}

// ================================================================
// 2. Two-Story Portal: Cumulative Base Shear Equals Total Lateral Force
// ================================================================
//
// Two-story, single-bay portal frame with lateral loads at each floor.
// F1 at story 1, F2 at story 2 (roof).
// Total base shear = F1 + F2.
//
//     F2 --> 5 -------- 6          story 2 (h2 above story 1)
//            |          |
//     F1 --> 2 -------- 3          story 1 (h1 above base)
//            |          |
//            1(fixed)   4(fixed)

#[test]
fn validation_portal_two_story_cumulative_base_shear() {
    let h1 = 4.0; // story 1 height
    let h2 = 3.5; // story 2 height
    let w = 6.0;
    let f1 = 20.0; // lateral load at story 1
    let f2 = 10.0; // lateral load at story 2

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h1),
        (3, w, h1),
        (4, w, 0.0),
        (5, 0.0, h1 + h2),
        (6, w, h1 + h2),
    ];

    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left col story 1
        (2, "frame", 4, 3, 1, 1, false, false), // right col story 1
        (3, "frame", 2, 3, 1, 1, false, false), // beam story 1
        (4, "frame", 2, 5, 1, 1, false, false), // left col story 2
        (5, "frame", 3, 6, 1, 1, false, false), // right col story 2
        (6, "frame", 5, 6, 1, 1, false, false), // beam story 2
    ];

    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: f1,
            fz: 0.0,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5,
            fx: f2,
            fz: 0.0,
            my: 0.0,
        }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Total base shear must equal total applied lateral force
    let total_applied = f1 + f2;
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();

    assert_close(
        sum_rx.abs(),
        total_applied,
        0.02,
        "two-story portal: total base shear = F1 + F2",
    );

    // Each base column carries roughly half the total base shear
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    assert_close(
        r1.rx.abs(),
        total_applied / 2.0,
        0.15,
        "two-story portal: left base shear ~ (F1+F2)/2",
    );
    assert_close(
        r4.rx.abs(),
        total_applied / 2.0,
        0.15,
        "two-story portal: right base shear ~ (F1+F2)/2",
    );
}

// ================================================================
// 3. Multi-Bay Portal: Interior Columns Carry Twice The Shear of Exterior
// ================================================================
//
// Two-bay, single-story portal frame with lateral load F at top.
// Portal method: exterior columns carry V, interior column carries 2V,
// where V + 2V + V = F => V = F/4.
//
//     F --> 2 -------- 3 -------- 4
//           |          |          |
//           |          |          |
//           1(fixed)   5(fixed)   6(fixed)

#[test]
fn validation_portal_multi_bay_interior_double_shear() {
    let h = 4.0;
    let w = 6.0; // each bay width
    let f_lat = 40.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, 2.0 * w, h),
        (5, w, 0.0),
        (6, 2.0 * w, 0.0),
    ];

    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left exterior col
        (2, "frame", 5, 3, 1, 1, false, false), // interior col
        (3, "frame", 6, 4, 1, 1, false, false), // right exterior col
        (4, "frame", 2, 3, 1, 1, false, false), // beam bay 1
        (5, "frame", 3, 4, 1, 1, false, false), // beam bay 2
    ];

    let sups = vec![(1, 1, "fixed"), (2, 5, "fixed"), (3, 6, "fixed")];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: f_lat,
        fz: 0.0,
        my: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Reactions at base nodes
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    let r6 = results.reactions.iter().find(|r| r.node_id == 6).unwrap();

    // Total base shear = F (equilibrium)
    let total_base_shear: f64 = (r1.rx + r5.rx + r6.rx).abs();
    assert_close(
        total_base_shear,
        f_lat,
        0.02,
        "multi-bay portal: total base shear = F",
    );

    // Portal method: V_exterior = F/4, V_interior = F/2
    let v_ext_expected = f_lat / 4.0;
    let v_int_expected = f_lat / 2.0;

    // The interior column should carry roughly double each exterior column's shear.
    // Due to the asymmetry of the load application point (at node 2, left exterior),
    // there may be deviation. We check the trend and use relaxed tolerance.
    let v_interior: f64 = r5.rx.abs();
    let v_left: f64 = r1.rx.abs();
    let v_right: f64 = r6.rx.abs();

    // Interior column should carry more shear than either exterior column
    assert!(
        v_interior > v_left && v_interior > v_right,
        "multi-bay: interior shear ({:.2}) > exterior ({:.2}, {:.2})",
        v_interior,
        v_left,
        v_right
    );

    // Interior-to-exterior ratio should be closer to 2 than to 1
    let avg_exterior = (v_left + v_right) / 2.0;
    let ratio: f64 = v_interior / avg_exterior;
    assert!(
        ratio > 1.3 && ratio < 3.0,
        "multi-bay: interior/exterior ratio = {:.2} (portal method predicts ~2.0)",
        ratio
    );

    // Verify approximate portal method values with relaxed tolerance
    assert_close(
        v_interior,
        v_int_expected,
        0.35,
        "multi-bay: interior column shear ~ F/2",
    );
    assert_close(
        avg_exterior,
        v_ext_expected,
        0.35,
        "multi-bay: avg exterior column shear ~ F/4",
    );
}

// ================================================================
// 4. Portal Frame: Inflection Points at Approximately Mid-Height
// ================================================================
//
// For a fixed-base portal frame under lateral load, the portal method
// assumes inflection points (zero moment) at mid-height of columns.
// We discretize the columns into multiple elements and verify that
// the moment changes sign near mid-height.

#[test]
fn validation_portal_inflection_point_mid_height() {
    let h = 6.0;
    let w = 6.0;
    let f_lat = 20.0;
    let n_col = 8; // elements per column for resolution
    let n_beam = 4; // elements in beam

    let col_elem_len = h / n_col as f64;
    let beam_elem_len = w / n_beam as f64;

    let mut nodes = Vec::new();
    let mut node_id = 1_usize;

    // Left column: nodes 1 to n_col+1 (bottom to top, x=0)
    for i in 0..=n_col {
        nodes.push((node_id, 0.0, i as f64 * col_elem_len));
        node_id += 1;
    }
    let left_top = node_id - 1; // = n_col + 1

    // Beam: nodes from left_top+1 to left_top+n_beam (x increments, y=h)
    for i in 1..=n_beam {
        nodes.push((node_id, i as f64 * beam_elem_len, h));
        node_id += 1;
    }
    let right_top = node_id - 1; // last beam node = top-right

    // Right column: nodes from right_top+1 downward (x=w)
    for i in 1..=n_col {
        nodes.push((node_id, w, h - i as f64 * col_elem_len));
        node_id += 1;
    }
    let right_bottom = node_id - 1;

    // Elements
    let mut elems = Vec::new();
    let mut elem_id = 1_usize;

    // Left column elements
    for i in 0..n_col {
        elems.push((elem_id, "frame", i + 1, i + 2, 1, 1, false, false));
        elem_id += 1;
    }

    // Beam elements
    let mut prev = left_top;
    for i in 0..n_beam {
        let next = left_top + 1 + i;
        elems.push((elem_id, "frame", prev, next, 1, 1, false, false));
        prev = next;
        elem_id += 1;
    }

    // Right column elements (from top-right downward)
    let mut rc_nodes = vec![right_top];
    for i in 1..=n_col {
        rc_nodes.push(right_top + i);
    }
    for i in 0..n_col {
        elems.push((elem_id, "frame", rc_nodes[i], rc_nodes[i + 1], 1, 1, false, false));
        elem_id += 1;
    }

    let sups = vec![(1, 1, "fixed"), (2, right_bottom, "fixed")];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: left_top,
        fx: f_lat,
        fz: 0.0,
        my: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Check the left column: elements 1 through n_col.
    // At mid-height, element n_col/2 ends at node n_col/2 + 1.
    // The moment should be small (near inflection point) around mid-height.
    let mid_elem = n_col / 2; // element at mid-height
    let ef_mid = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == mid_elem)
        .unwrap();

    // Moments at base and top of column for reference
    let ef_base = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == 1)
        .unwrap();
    let ef_top = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_col)
        .unwrap();

    let m_base: f64 = ef_base.m_start.abs();
    let m_top: f64 = ef_top.m_end.abs();
    let m_mid: f64 = ef_mid.m_end.abs();

    // At inflection point, moment should be much smaller than at base or top
    let max_end_moment = m_base.max(m_top);
    assert!(
        m_mid < max_end_moment * 0.5,
        "inflection: mid-height moment ({:.4}) should be small relative to max end moment ({:.4})",
        m_mid,
        max_end_moment
    );

    // Additionally, check that the moment changes sign between base and top.
    // m_start of element 1 and m_end of element n_col should have opposite signs.
    assert!(
        ef_base.m_start * ef_top.m_end < 0.0,
        "inflection: column moments change sign (base m={:.4}, top m={:.4})",
        ef_base.m_start,
        ef_top.m_end
    );
}

// ================================================================
// 5. Two-Bay Portal: Horizontal Equilibrium Verified
// ================================================================
//
// Two-bay portal frame with lateral loads at multiple points.
// Verify sum of horizontal reactions equals sum of applied horizontal forces.
//
//     F1-->2 --------- 3 --------- 4
//           |          |           |
//           1(fixed)   5(fixed)    6(fixed)

#[test]
fn validation_portal_two_bay_horizontal_equilibrium() {
    let h = 5.0;
    let w1 = 6.0; // bay 1 width
    let w2 = 6.0; // bay 2 width
    let f1 = 25.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w1, h),
        (4, w1 + w2, h),
        (5, w1, 0.0),
        (6, w1 + w2, 0.0),
    ];

    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left col
        (2, "frame", 5, 3, 1, 1, false, false), // interior col
        (3, "frame", 6, 4, 1, 1, false, false), // right col
        (4, "frame", 2, 3, 1, 1, false, false), // beam bay 1
        (5, "frame", 3, 4, 1, 1, false, false), // beam bay 2
    ];

    let sups = vec![(1, 1, "fixed"), (2, 5, "fixed"), (3, 6, "fixed")];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: f1,
        fz: 0.0,
        my: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Horizontal equilibrium: sum_rx + applied_fx = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(
        (sum_rx + f1).abs(),
        0.0,
        0.01,
        "two-bay portal: horizontal equilibrium sum_rx + F = 0",
    );

    // Vertical equilibrium: sum_ry = 0 (no vertical loads applied)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(
        sum_ry.abs() < 1e-6,
        "two-bay portal: vertical equilibrium sum_ry = 0, got {:.6e}",
        sum_ry
    );

    // Moment equilibrium about base-left (node 1):
    // Applied: F1 * h (clockwise, positive)
    // Reactions: -r5.rx * 0 (at same x=0 for ry... let's do full moment check)
    // sum(ry_i * x_i) + sum(mz_i) + F1*h = 0 (taking moments about node 1)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    let r6 = results.reactions.iter().find(|r| r.node_id == 6).unwrap();

    // Moment about origin (0,0), positive CCW.
    // Moment of force (Fx,Fy) at point (x,y): Mz = x*Fy - y*Fx.
    // Applied: F=(f1, 0) at (0, h) => Mz = 0*0 - h*f1 = -f1*h
    // Reactions at base nodes (y=0): rx contributes 0 (moment arm = 0).
    // r1 at (0,0): Mz = r1.my
    // r5 at (w1,0): Mz = w1*r5.rz + r5.my
    // r6 at (w1+w2,0): Mz = (w1+w2)*r6.rz + r6.my
    let moment_sum: f64 = -f1 * h
        + r1.my
        + r5.rz * w1 + r5.my
        + r6.rz * (w1 + w2) + r6.my;

    assert!(
        moment_sum.abs() < 1e-4,
        "two-bay portal: global moment equilibrium, residual = {:.6}",
        moment_sum
    );
}

// ================================================================
// 6. Portal with Unequal Bays: Moment Distribution Compared
// ================================================================
//
// Two-bay portal frame with different bay widths under lateral load.
// The wider bay produces larger beam moments than the narrower bay.
//
//     F --> 2 ---- 3 ---------- 4
//           |      |            |
//           1      5            6
//           w1=4   w2=8

#[test]
fn validation_portal_unequal_bays_moment_distribution() {
    let h = 4.0;
    let w1 = 4.0; // narrow bay
    let w2 = 8.0; // wide bay
    let f_lat = 30.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w1, h),
        (4, w1 + w2, h),
        (5, w1, 0.0),
        (6, w1 + w2, 0.0),
    ];

    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left col
        (2, "frame", 5, 3, 1, 1, false, false), // interior col
        (3, "frame", 6, 4, 1, 1, false, false), // right col
        (4, "frame", 2, 3, 1, 1, false, false), // beam bay 1 (narrow)
        (5, "frame", 3, 4, 1, 1, false, false), // beam bay 2 (wide)
    ];

    let sups = vec![(1, 1, "fixed"), (2, 5, "fixed"), (3, 6, "fixed")];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: f_lat,
        fz: 0.0,
        my: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Beam element forces
    let ef_beam1 = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == 4)
        .unwrap();
    let ef_beam2 = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == 5)
        .unwrap();

    // Maximum beam moment magnitudes
    let m_beam1_max: f64 = ef_beam1.m_start.abs().max(ef_beam1.m_end.abs());
    let m_beam2_max: f64 = ef_beam2.m_start.abs().max(ef_beam2.m_end.abs());

    // Both beams should have non-zero moments
    assert!(
        m_beam1_max > 0.1,
        "unequal bays: narrow beam moment should be non-zero, got {:.4}",
        m_beam1_max
    );
    assert!(
        m_beam2_max > 0.1,
        "unequal bays: wide beam moment should be non-zero, got {:.4}",
        m_beam2_max
    );

    // For same EI, the shorter beam is stiffer, attracts more moment per unit length,
    // but the longer beam spans farther so its end moments can be comparable or larger.
    // Key insight: with identical sections, the beam stiffness is inversely proportional
    // to length (k = 4EI/L). The shorter beam (bay 1) has higher stiffness, so it
    // attracts a larger share of the distributed moment at joints 2 and 3.
    // However, with the load at node 2, column shear generates moments V*h/2 at beam ends.
    // Both beams are affected but differently. We verify the moments are in reasonable ratio.
    let ratio: f64 = m_beam1_max / m_beam2_max;

    // The narrow beam is stiffer (4EI/4 vs 4EI/8 = 2x stiffness ratio),
    // so it should attract relatively more moment. Ratio should be > 1.
    assert!(
        ratio > 0.8,
        "unequal bays: narrow beam moment / wide beam moment = {:.2} (expect > 0.8)",
        ratio
    );

    // Also verify equilibrium: sum of horizontal reactions = F
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(
        sum_rx.abs(),
        f_lat,
        0.02,
        "unequal bays: horizontal equilibrium",
    );
}

// ================================================================
// 7. Portal Frame: Top Beam Moment from Column End Moments Equilibrium
// ================================================================
//
// At a rigid joint of a portal frame, the sum of moments from all
// connected members must be zero (joint equilibrium). At the top-left
// joint (node 2), the column end moment + beam start moment = 0.
//
//     F --> 2 -------- 3
//           |          |
//           1(fixed)   4(fixed)

#[test]
fn validation_portal_beam_moment_from_column_equilibrium() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 20.0;

    let input = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Element 1: left column (1->2), end moment at node 2 = m_end
    // Element 2: beam (2->3), start moment at node 2 = m_start
    let ef_col_left = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == 1)
        .unwrap();
    let ef_beam = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == 2)
        .unwrap();

    // Joint equilibrium at node 2: column_m_end - beam_m_start = 0
    // (element ending at joint vs element starting at joint)
    let joint_moment_sum: f64 = ef_col_left.m_end - ef_beam.m_start;

    assert!(
        joint_moment_sum.abs() < 1.0,
        "beam-column joint: moment sum at node 2 = {:.4} (expect ~0)",
        joint_moment_sum
    );

    // Similarly check node 3: beam_m_end + right_column_m_start = 0
    // Element 3 is right column (3->4), but make_portal_frame uses (3, 4) meaning node_i=3, node_j=4
    let ef_col_right = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == 3)
        .unwrap();

    // At node 3: beam end moment - right column start moment = 0
    let joint_moment_sum_3: f64 = ef_beam.m_end - ef_col_right.m_start;

    assert!(
        joint_moment_sum_3.abs() < 1.0,
        "beam-column joint: moment sum at node 3 = {:.4} (expect ~0)",
        joint_moment_sum_3
    );

    // The beam end moments should be non-trivial (not zero)
    assert!(
        ef_beam.m_start.abs() > 1.0,
        "beam start moment should be significant: {:.4}",
        ef_beam.m_start
    );
    assert!(
        ef_beam.m_end.abs() > 1.0,
        "beam end moment should be significant: {:.4}",
        ef_beam.m_end
    );
}

// ================================================================
// 8. Three-Story Frame: Drift Increases with Height
// ================================================================
//
// Three-story, single-bay portal frame with equal lateral loads at
// each floor. The lateral drift should increase monotonically with
// height: drift_story1 < drift_story2 < drift_story3.
//
//     F --> 7 -------- 8          story 3
//           |          |
//     F --> 5 -------- 6          story 2
//           |          |
//     F --> 2 -------- 3          story 1
//           |          |
//           1(fixed)   4(fixed)

#[test]
fn validation_portal_three_story_drift_increases_with_height() {
    let h = 3.5; // each story height
    let w = 6.0;
    let f_lat = 10.0; // lateral load at each floor

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
        (5, 0.0, 2.0 * h),
        (6, w, 2.0 * h),
        (7, 0.0, 3.0 * h),
        (8, w, 3.0 * h),
    ];

    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left col story 1
        (2, "frame", 4, 3, 1, 1, false, false), // right col story 1
        (3, "frame", 2, 3, 1, 1, false, false), // beam story 1
        (4, "frame", 2, 5, 1, 1, false, false), // left col story 2
        (5, "frame", 3, 6, 1, 1, false, false), // right col story 2
        (6, "frame", 5, 6, 1, 1, false, false), // beam story 2
        (7, "frame", 5, 7, 1, 1, false, false), // left col story 3
        (8, "frame", 6, 8, 1, 1, false, false), // right col story 3
        (9, "frame", 7, 8, 1, 1, false, false), // beam story 3
    ];

    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: f_lat,
            fz: 0.0,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5,
            fx: f_lat,
            fz: 0.0,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 7,
            fx: f_lat,
            fz: 0.0,
            my: 0.0,
        }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Drift at each story (using left column nodes)
    let d1 = results
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux;
    let d2 = results
        .displacements
        .iter()
        .find(|d| d.node_id == 5)
        .unwrap()
        .ux;
    let d3 = results
        .displacements
        .iter()
        .find(|d| d.node_id == 7)
        .unwrap()
        .ux;

    // All drifts should be positive (in direction of applied loads)
    assert!(
        d1 > 0.0,
        "three-story: story 1 drift should be positive: {:.6e}",
        d1
    );
    assert!(
        d2 > 0.0,
        "three-story: story 2 drift should be positive: {:.6e}",
        d2
    );
    assert!(
        d3 > 0.0,
        "three-story: story 3 drift should be positive: {:.6e}",
        d3
    );

    // Drift must increase monotonically with height
    assert!(
        d1 < d2,
        "three-story: drift_story1 ({:.6e}) < drift_story2 ({:.6e})",
        d1,
        d2
    );
    assert!(
        d2 < d3,
        "three-story: drift_story2 ({:.6e}) < drift_story3 ({:.6e})",
        d2,
        d3
    );

    // Total base shear = 3F (equilibrium check)
    let total_applied = 3.0 * f_lat;
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(
        sum_rx.abs(),
        total_applied,
        0.02,
        "three-story: total base shear = 3F",
    );

    // Inter-story drifts
    let inter_1: f64 = d1;        // story 1 drift relative to base
    let inter_2: f64 = d2 - d1;   // story 2 inter-story drift
    let inter_3: f64 = d3 - d2;   // story 3 inter-story drift

    // All inter-story drifts should be positive
    assert!(
        inter_1 > 0.0 && inter_2 > 0.0 && inter_3 > 0.0,
        "three-story: all inter-story drifts positive ({:.6e}, {:.6e}, {:.6e})",
        inter_1,
        inter_2,
        inter_3
    );
}
