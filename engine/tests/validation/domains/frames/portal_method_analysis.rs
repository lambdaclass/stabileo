/// Validation: Portal Method of Approximate Analysis for Lateral Loads on Frames
///
/// The portal method is an approximate technique for analyzing building frames
/// under lateral loads. Key assumptions for fixed-base frames:
///   - Inflection points occur at mid-height of columns and midspan of beams
///   - Interior columns carry twice the shear of exterior columns
///   - Column shear = story shear / (sum of column factors)
///
/// These tests compare FEM results against portal method predictions. The portal
/// method is inherently approximate, so tolerances are relaxed accordingly.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Helper: find element forces by element_id
fn ef_by_id(results: &AnalysisResults, id: usize) -> &ElementForces {
    results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == id)
        .unwrap_or_else(|| panic!("Element {} not found in results", id))
}

/// Helper: find reaction by node_id
fn rxn_by_node(results: &AnalysisResults, node_id: usize) -> &Reaction {
    results
        .reactions
        .iter()
        .find(|r| r.node_id == node_id)
        .unwrap_or_else(|| panic!("Reaction at node {} not found", node_id))
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Single bay, single story — column shear distribution
// ─────────────────────────────────────────────────────────────────────────────
//
// Portal frame: h=4, w=6, H=20kN at node 2 (left top).
// Portal method: each column carries V = H/2 = 10kN.
// For a symmetric single-bay portal under a single lateral load at beam level,
// each column carries exactly H/2 by symmetry of stiffness.
#[test]
fn portal_single_bay_column_shear_distribution() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 20.0;

    let input = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Element 1: left column (node 1 at bottom -> node 2 at top)
    // Element 3: right column (node 3 at top -> node 4 at bottom)
    // For element 1 (going up), v_start is the horizontal shear at the base.
    // For element 3 (going down from 3 to 4), the sign convention differs.
    let ef1 = ef_by_id(&results, 1); // left column
    let ef3 = ef_by_id(&results, 3); // right column

    let v_left = ef1.v_start.abs();
    let v_right = ef3.v_start.abs();

    // Each column should carry exactly H/2 = 10 kN
    assert_close(v_left, 10.0, 0.05, "Left column shear");
    assert_close(v_right, 10.0, 0.05, "Right column shear");

    // Sum of column shears should equal total lateral load
    assert_close(v_left + v_right, lateral, 0.05, "Sum of column shears");
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Two-bay, single story — interior column carries 2x exterior
// ─────────────────────────────────────────────────────────────────────────────
//
// Nodes: 1(0,0), 2(0,4), 3(5,4), 4(5,0), 5(10,4), 6(10,0)
// Columns: elem1=1->2, elem2=4->3, elem3=6->5
// Beams: elem4=2->3, elem5=3->5
// Fixed at 1, 4, 6. Lateral H=30kN at node 2.
//
// Portal method: column factors = 1 (ext) + 2 (int) + 1 (ext) = 4
//   V_exterior = 30/4 = 7.5 kN, V_interior = 30/2 = 15 kN
#[test]
fn portal_two_bay_interior_column_double_shear() {
    let input = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, 0.0, 4.0),
            (3, 5.0, 4.0),
            (4, 5.0, 0.0),
            (5, 10.0, 4.0),
            (6, 10.0, 0.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // left column (ext)
            (2, "frame", 4, 3, 1, 1, false, false), // interior column
            (3, "frame", 6, 5, 1, 1, false, false), // right column (ext)
            (4, "frame", 2, 3, 1, 1, false, false), // left beam
            (5, "frame", 3, 5, 1, 1, false, false), // right beam
        ],
        vec![
            (1, 1, "fixed"),
            (2, 4, "fixed"),
            (3, 6, "fixed"),
        ],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: 30.0,
            fy: 0.0,
            mz: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    let v_left = ef_by_id(&results, 1).v_start.abs();     // exterior
    let v_interior = ef_by_id(&results, 2).v_start.abs();  // interior
    let v_right = ef_by_id(&results, 3).v_start.abs();     // exterior

    // Portal method: V_ext = 7.5, V_int = 15.0
    // The ratio interior/exterior should be approximately 2
    let ratio = v_interior / ((v_left + v_right) / 2.0);
    assert!(
        ratio > 1.3 && ratio < 3.0,
        "Interior/exterior shear ratio should be approximately 2, got {:.3}",
        ratio
    );

    // Total shear should equal applied load
    assert_close(
        v_left + v_interior + v_right,
        30.0,
        0.05,
        "Sum of column shears = total lateral load",
    );

    // Portal method absolute values (approximate)
    assert_close(v_interior, 15.0, 0.30, "Interior column shear (portal approx)");
    assert_close(
        (v_left + v_right) / 2.0,
        7.5,
        0.30,
        "Avg exterior column shear (portal approx)",
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Two-story, single bay — story shear accumulation
// ─────────────────────────────────────────────────────────────────────────────
//
// Nodes: 1(0,0), 2(0,3.5), 3(6,3.5), 4(6,0), 5(0,7), 6(6,7)
// Story 1 columns: elem1=1->2, elem2=4->3 (height 3.5)
// Story 2 columns: elem3=2->5, elem4=3->6 (height 3.5)
// Beams: elem5=2->3 (1st floor), elem6=5->6 (2nd floor / roof)
// Fixed at 1, 4.
// Lateral: H1=20kN at node 2 (1st floor), H2=10kN at node 5 (2nd floor).
//
// Story 2 shear = H2 = 10 kN
// Story 1 shear = H1 + H2 = 30 kN
#[test]
fn portal_two_story_story_shear_accumulation() {
    let input = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, 0.0, 3.5),
            (3, 6.0, 3.5),
            (4, 6.0, 0.0),
            (5, 0.0, 7.0),
            (6, 6.0, 7.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // left col, story 1
            (2, "frame", 4, 3, 1, 1, false, false), // right col, story 1
            (3, "frame", 2, 5, 1, 1, false, false), // left col, story 2
            (4, "frame", 3, 6, 1, 1, false, false), // right col, story 2
            (5, "frame", 2, 3, 1, 1, false, false), // beam, 1st floor
            (6, "frame", 5, 6, 1, 1, false, false), // beam, 2nd floor
        ],
        vec![
            (1, 1, "fixed"),
            (2, 4, "fixed"),
        ],
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2,
                fx: 20.0,
                fy: 0.0,
                mz: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 5,
                fx: 10.0,
                fy: 0.0,
                mz: 0.0,
            }),
        ],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Story 2 columns: elements 3 and 4
    let v_story2_left = ef_by_id(&results, 3).v_start.abs();
    let v_story2_right = ef_by_id(&results, 4).v_start.abs();
    let story2_total = v_story2_left + v_story2_right;

    // Story 1 columns: elements 1 and 2
    let v_story1_left = ef_by_id(&results, 1).v_start.abs();
    let v_story1_right = ef_by_id(&results, 2).v_start.abs();
    let story1_total = v_story1_left + v_story1_right;

    // Story 2 total shear should equal H2 = 10 kN
    assert_close(story2_total, 10.0, 0.05, "Story 2 column shear sum");

    // Story 1 total shear should equal H1 + H2 = 30 kN
    assert_close(story1_total, 30.0, 0.05, "Story 1 column shear sum");
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Portal method inflection point check
// ─────────────────────────────────────────────────────────────────────────────
//
// Fixed-base portal: inflection point at mid-height of columns.
// We split each column into 2 elements to capture the mid-height node.
//
// Nodes: 1(0,0), 2(0,2), 3(0,4), 4(6,4), 5(6,2), 6(6,0)
// Left column: elem1=1->2, elem2=2->3
// Right column: elem3=6->5, elem4=5->4
// Beam: elem5=3->4
// Fixed at 1, 6. Lateral H=20kN at node 3.
//
// Portal method predicts moment = 0 at mid-height of columns (nodes 2, 5).
// FEM will show a small moment relative to the base moment, verifying the
// inflection point is near mid-height.
#[test]
fn portal_inflection_point_at_mid_height() {
    let input = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, 0.0, 2.0),
            (3, 0.0, 4.0),
            (4, 6.0, 4.0),
            (5, 6.0, 2.0),
            (6, 6.0, 0.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // left col bottom half
            (2, "frame", 2, 3, 1, 1, false, false), // left col top half
            (3, "frame", 6, 5, 1, 1, false, false), // right col bottom half
            (4, "frame", 5, 4, 1, 1, false, false), // right col top half
            (5, "frame", 3, 4, 1, 1, false, false), // beam
        ],
        vec![
            (1, 1, "fixed"),
            (2, 6, "fixed"),
        ],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx: 20.0,
            fy: 0.0,
            mz: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // At mid-height nodes (2 and 5), the moment should be small relative to base.
    // The moment at mid-height is m_end of the bottom half element (= m_start of top half).
    let m_mid_left = ef_by_id(&results, 1).m_end.abs();   // end of bottom-half left
    let m_mid_right = ef_by_id(&results, 3).m_end.abs();  // end of bottom-half right

    // Base moment for reference
    let m_base_left = ef_by_id(&results, 1).m_start.abs();
    let m_base_right = ef_by_id(&results, 3).m_start.abs();

    // Mid-height moment should be much smaller than base moment.
    // Portal method says it should be zero. FEM will show it is small.
    let ratio_left = m_mid_left / m_base_left.max(1e-10);
    let ratio_right = m_mid_right / m_base_right.max(1e-10);

    assert!(
        ratio_left < 0.30,
        "Left column mid-height moment should be small relative to base: \
         m_mid={:.4}, m_base={:.4}, ratio={:.4}",
        m_mid_left, m_base_left, ratio_left
    );
    assert!(
        ratio_right < 0.30,
        "Right column mid-height moment should be small relative to base: \
         m_mid={:.4}, m_base={:.4}, ratio={:.4}",
        m_mid_right, m_base_right, ratio_right
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Beam moment from portal method
// ─────────────────────────────────────────────────────────────────────────────
//
// Single bay portal: h=4, w=6, H=20kN.
// Portal method:
//   Column shear V = H/2 = 10 kN.
//   Inflection point at mid-height -> column top moment = V * (h/2) = 10 * 2 = 20 kN.m
//   Joint equilibrium at beam-column joint: beam end moment = column top moment = 20 kN.m
//
// FEM: extract beam end moment and compare. The portal method is approximate
// for beam moments because the actual inflection point depends on stiffness ratios.
#[test]
fn portal_beam_moment_from_joint_equilibrium() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 20.0;

    let input = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Element 2 is the beam (node 2 -> node 3)
    let ef_beam = ef_by_id(&results, 2);

    // Portal method predicts beam end moment = V * (h/2) = 10 * 2 = 20 kN.m
    let portal_beam_moment = 20.0;

    // FEM beam moments at each end
    let m_beam_start = ef_beam.m_start.abs();
    let m_beam_end = ef_beam.m_end.abs();

    // Both ends should be in the ballpark of the portal method prediction.
    // Portal method is approximate, so use relaxed tolerance.
    assert_close(
        m_beam_start,
        portal_beam_moment,
        0.30,
        "Beam start moment vs portal method",
    );
    assert_close(
        m_beam_end,
        portal_beam_moment,
        0.30,
        "Beam end moment vs portal method",
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Three-bay frame — exterior vs interior column shear distribution
// ─────────────────────────────────────────────────────────────────────────────
//
// The portal method predicts that interior columns carry more shear than
// exterior columns. For a 3-bay fixed-base frame under lateral load:
//   Portal method: column factors = 1+2+2+1 = 6
//   V_exterior = H/6, V_interior = H/3
//
// In practice, the FEM distribution depends on relative beam/column stiffness
// and load distribution. With very stiff beams (rigid diaphragm), all columns
// carry equal shear (1:1). With very flexible beams, the load mainly goes
// through the column closest to the load point.
//
// The portal method is most accurate when beam and column stiffnesses are
// comparable. Here we verify:
// (a) Total column shear = applied lateral load (exact, by equilibrium)
// (b) Interior columns carry more shear than exterior columns (qualitative)
// (c) The portal method values are within a factor of 2 of FEM (order-of-magnitude)
#[test]
fn portal_three_bay_exterior_vs_interior_shear_ratio() {
    let input = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, 0.0, 4.0),
            (3, 5.0, 4.0),
            (4, 5.0, 0.0),
            (5, 10.0, 4.0),
            (6, 10.0, 0.0),
            (7, 15.0, 4.0),
            (8, 15.0, 0.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // col 1 (ext left)
            (2, "frame", 4, 3, 1, 1, false, false), // col 2 (int)
            (3, "frame", 6, 5, 1, 1, false, false), // col 3 (int)
            (4, "frame", 8, 7, 1, 1, false, false), // col 4 (ext right)
            (5, "frame", 2, 3, 1, 1, false, false), // beam 1
            (6, "frame", 3, 5, 1, 1, false, false), // beam 2
            (7, "frame", 5, 7, 1, 1, false, false), // beam 3
        ],
        vec![
            (1, 1, "fixed"),
            (2, 4, "fixed"),
            (3, 6, "fixed"),
            (4, 8, "fixed"),
        ],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: 60.0,
            fy: 0.0,
            mz: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    let v_ext_left = ef_by_id(&results, 1).v_start.abs();
    let v_int_left = ef_by_id(&results, 2).v_start.abs();
    let v_int_right = ef_by_id(&results, 3).v_start.abs();
    let v_ext_right = ef_by_id(&results, 4).v_start.abs();

    let total_shear = v_ext_left + v_int_left + v_int_right + v_ext_right;

    // (a) Total shear must equal applied load (exact by equilibrium)
    assert_close(total_shear, 60.0, 0.05, "Total column shear = lateral load");

    // (b) Interior columns carry more shear than exterior columns
    // (qualitative portal method prediction)
    let avg_exterior = (v_ext_left + v_ext_right) / 2.0;
    let avg_interior = (v_int_left + v_int_right) / 2.0;
    let ratio = avg_interior / avg_exterior;

    assert!(
        ratio > 1.0,
        "Interior columns should carry more shear than exterior, ratio={:.3}",
        ratio
    );

    // (c) Portal method approximation: V_ext ~ 10, V_int ~ 20.
    // FEM values will differ because the portal method is approximate,
    // but they should be within the same order of magnitude.
    // Portal method: ext=10, int=20. FEM: ext~13, int~17 (typical).
    assert!(
        avg_exterior > 5.0 && avg_exterior < 25.0,
        "Exterior column shear should be order-of-magnitude ~10, got {:.2}",
        avg_exterior
    );
    assert!(
        avg_interior > 10.0 && avg_interior < 35.0,
        "Interior column shear should be order-of-magnitude ~20, got {:.2}",
        avg_interior
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Portal method accuracy — single bay (exact by symmetry)
// ─────────────────────────────────────────────────────────────────────────────
//
// For a single-bay, single-story frame with equal columns and a single
// lateral load, each column carries exactly H/2 by symmetry. The portal
// method prediction is exact in this case.
//
// Compare: single-bay (w=6) vs two-bay (w=3+3, same total width).
// Single bay: V = H/2 = 10 kN exactly.
// Two bay: portal method gives V_ext=5, V_int=10, but FEM will differ.
#[test]
fn portal_accuracy_single_bay_exact_vs_two_bay_approx() {
    let h = 4.0;
    let lateral = 20.0;

    // Single bay: w=6
    let input_single = make_portal_frame(h, 6.0, E, A, IZ, lateral, 0.0);
    let results_single = linear::solve_2d(&input_single).unwrap();

    let v_left_single = ef_by_id(&results_single, 1).v_start.abs();
    let v_right_single = ef_by_id(&results_single, 3).v_start.abs();

    // Single bay: by symmetry, each column carries exactly H/2
    assert_close(v_left_single, 10.0, 0.05, "Single bay: left column = H/2");
    assert_close(v_right_single, 10.0, 0.05, "Single bay: right column = H/2");

    // Two bay: w=3+3 (same total width 6)
    let input_two_bay = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, 0.0, h),
            (3, 3.0, h),
            (4, 3.0, 0.0),
            (5, 6.0, h),
            (6, 6.0, 0.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // left col (ext)
            (2, "frame", 4, 3, 1, 1, false, false), // interior col
            (3, "frame", 6, 5, 1, 1, false, false), // right col (ext)
            (4, "frame", 2, 3, 1, 1, false, false), // left beam
            (5, "frame", 3, 5, 1, 1, false, false), // right beam
        ],
        vec![
            (1, 1, "fixed"),
            (2, 4, "fixed"),
            (3, 6, "fixed"),
        ],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: lateral,
            fy: 0.0,
            mz: 0.0,
        })],
    );

    let results_two_bay = linear::solve_2d(&input_two_bay).unwrap();

    let v_left_two = ef_by_id(&results_two_bay, 1).v_start.abs();
    let v_int_two = ef_by_id(&results_two_bay, 2).v_start.abs();
    let v_right_two = ef_by_id(&results_two_bay, 3).v_start.abs();

    // Total shear must still equal the applied load
    assert_close(
        v_left_two + v_int_two + v_right_two,
        lateral,
        0.05,
        "Two bay: total shear = H",
    );

    // Portal method: V_ext = 20/4 = 5, V_int = 20/2 = 10
    // These are approximate predictions for the two-bay case.
    assert_close(v_int_two, 10.0, 0.30, "Two bay: interior col shear (portal approx)");
    assert_close(
        (v_left_two + v_right_two) / 2.0,
        5.0,
        0.30,
        "Two bay: avg exterior col shear (portal approx)",
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: Global equilibrium under portal method frame
// ─────────────────────────────────────────────────────────────────────────────
//
// Three-bay frame (same geometry as test 6) with H=60kN at node 2.
// Verify:
//   (a) Sum of all base horizontal reactions = -H (equilibrium)
//   (b) Sum of all base vertical reactions = 0 (no gravity loads)
//   (c) Global moment equilibrium about the origin
#[test]
fn portal_global_equilibrium_three_bay() {
    let h = 4.0;
    let lateral = 60.0;

    let input = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, 0.0, h),
            (3, 5.0, h),
            (4, 5.0, 0.0),
            (5, 10.0, h),
            (6, 10.0, 0.0),
            (7, 15.0, h),
            (8, 15.0, 0.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 4, 3, 1, 1, false, false),
            (3, "frame", 6, 5, 1, 1, false, false),
            (4, "frame", 8, 7, 1, 1, false, false),
            (5, "frame", 2, 3, 1, 1, false, false),
            (6, "frame", 3, 5, 1, 1, false, false),
            (7, "frame", 5, 7, 1, 1, false, false),
        ],
        vec![
            (1, 1, "fixed"),
            (2, 4, "fixed"),
            (3, 6, "fixed"),
            (4, 8, "fixed"),
        ],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: lateral,
            fy: 0.0,
            mz: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Base nodes: 1, 4, 6, 8
    let r1 = rxn_by_node(&results, 1);
    let r4 = rxn_by_node(&results, 4);
    let r6 = rxn_by_node(&results, 6);
    let r8 = rxn_by_node(&results, 8);

    // (a) Sum of horizontal reactions = -H (reactions oppose the applied load)
    let sum_rx = r1.rx + r4.rx + r6.rx + r8.rx;
    assert_close(
        sum_rx,
        -lateral,
        0.05,
        "Sum of horizontal reactions = -H",
    );

    // (b) Sum of vertical reactions = 0 (no gravity)
    let sum_ry = r1.ry + r4.ry + r6.ry + r8.ry;
    assert!(
        sum_ry.abs() < 1e-6,
        "Sum of vertical reactions should be zero, got {:.8}",
        sum_ry
    );

    // (c) Global moment equilibrium about origin (0,0):
    //   Using M = x*Fy - y*Fx convention:
    //   Applied load: fx=60 at node 2 (0, h) -> M_applied = 0*0 - h*lateral = -h*lateral
    //   Reactions at base (y=0): rx terms have zero y-arm.
    //     M_reactions = sum(x_i * ry_i - 0 * rx_i) + sum(mz_i) = sum(x_i * ry_i) + sum(mz_i)
    //   Equilibrium: M_applied + M_reactions = 0
    let m_applied = -(h * lateral); // -4 * 60 = -240 kN.m
    let m_reactions = r1.ry * 0.0 + r4.ry * 5.0 + r6.ry * 10.0 + r8.ry * 15.0
        + r1.mz + r4.mz + r6.mz + r8.mz;

    let residual = m_applied + m_reactions;
    assert!(
        residual.abs() < 1.0,
        "Global moment equilibrium: applied={:.4}, reactions={:.4}, residual={:.6}",
        m_applied,
        m_reactions,
        residual
    );
}
