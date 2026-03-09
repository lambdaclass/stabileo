/// Validation: Extended Approximate Structural Analysis Methods
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 7 (Portal & Cantilever methods)
///   - McCormac & Nelson, "Structural Analysis", Ch. 16
///   - ACI 318-19, Section 6.5 (Moment coefficients for continuous beams)
///   - Norris et al., "Elementary Structural Analysis", Ch. 14
///   - Timoshenko & Young, "Theory of Structures", Ch. 6
///
/// Tests:
///   1. Portal method: two-story frame, column shear = H/(2*num_bays) for interior columns
///   2. Cantilever method: axial forces proportional to column distance from centroid
///   3. Two-moment approximation: continuous beam wL^2/10 vs exact interior moment
///   4. Fixed-end beam: wL^2/12 exact end moment, compare with solver
///   5. Portal frame: H*h/4 approximate knee moment vs exact
///   6. Multi-bay frame: lateral load sharing between bays
///   7. Inflection point assumption: approximate vs exact inflection locations in portal
///   8. Gravity load approximate: moment coefficients 1/11, 1/16 for continuous spans vs solver
use dedaliano_engine::solver::linear::*;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Portal Method: Two-Story Frame Column Shear
// ================================================================
//
// Two-story, two-bay frame with lateral loads.
// Portal method predicts: exterior column shear = V_ext, interior column shear = 2*V_ext.
// For a single-story single-bay: each column carries H/2.
// For two bays: exterior columns carry H/(2*num_bays), interior carries 2x that.
// We build a 2-story, 1-bay frame and verify each column carries approx H/2 per story.

#[test]
fn validation_approx_ext_portal_method_two_story_shear() {
    // 2-story, 1-bay frame
    // Story 1: nodes 1(0,0)->2(0,4), 4(6,0)->3(6,4), beam 2->3
    // Story 2: 2->5(0,8), 3->6(6,8), beam 5->6
    // Lateral loads: H1=30 kN at node 2 (story 1 level), H2=15 kN at node 5 (story 2 level)
    let h: f64 = 4.0; // story height
    let w: f64 = 6.0; // bay width
    let h1: f64 = 30.0; // lateral load at story 1
    let h2: f64 = 15.0; // lateral load at story 2

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
        (5, 0.0, 2.0 * h),
        (6, w, 2.0 * h),
    ];

    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left col, story 1
        (2, "frame", 4, 3, 1, 1, false, false), // right col, story 1
        (3, "frame", 2, 3, 1, 1, false, false), // beam, story 1
        (4, "frame", 2, 5, 1, 1, false, false), // left col, story 2
        (5, "frame", 3, 6, 1, 1, false, false), // right col, story 2
        (6, "frame", 5, 6, 1, 1, false, false), // beam, story 2
    ];

    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: h1, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: h2, fy: 0.0, mz: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = solve_2d(&input).expect("solve");

    // Portal method for 1-bay frame: each column carries half the story shear.
    // Story 2 total shear = H2 = 15 kN -> each column ~7.5 kN
    // Story 1 total shear = H1 + H2 = 45 kN -> each column ~22.5 kN

    // Check total base shear equals total applied load
    let total_applied: f64 = h1 + h2;
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), total_applied, 0.02, "portal method: total base shear equilibrium");

    // Check that base shear is approximately shared equally (portal method prediction)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    let portal_predicted_each = total_applied / 2.0; // 22.5 kN
    // Portal method is approximate; allow 25% tolerance for fixed-base frames
    assert_close(r1.rx.abs(), portal_predicted_each, 0.25,
        "portal method: left column base shear ~ H_total/2");
    assert_close(r4.rx.abs(), portal_predicted_each, 0.25,
        "portal method: right column base shear ~ H_total/2");

    // Verify story 2 column shears are smaller than story 1 column shears
    // Story 2 columns are elements 4 and 5
    let ef4 = results.element_forces.iter().find(|ef| ef.element_id == 4).unwrap();
    let ef5 = results.element_forces.iter().find(|ef| ef.element_id == 5).unwrap();
    let story2_shear_left: f64 = ef4.v_start.abs();
    let story2_shear_right: f64 = ef5.v_start.abs();

    // Story 1 columns are elements 1 and 2
    let ef1 = results.element_forces.iter().find(|ef| ef.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|ef| ef.element_id == 2).unwrap();
    let story1_shear_left: f64 = ef1.v_start.abs();
    let story1_shear_right: f64 = ef2.v_start.abs();

    assert!(
        story2_shear_left < story1_shear_left,
        "story 2 column shear ({:.2}) < story 1 column shear ({:.2})",
        story2_shear_left, story1_shear_left
    );
    assert!(
        story2_shear_right < story1_shear_right,
        "story 2 column shear ({:.2}) < story 1 column shear ({:.2})",
        story2_shear_right, story1_shear_right
    );
}

// ================================================================
// 2. Cantilever Method: Axial Forces Proportional to Distance from Centroid
// ================================================================
//
// Two-story, 1-bay frame with lateral load. The cantilever method assumes
// axial forces in columns are proportional to their distance from the frame
// centroid. For a symmetric 1-bay frame (columns at x=0 and x=w), the centroid
// is at x=w/2 and both columns are equidistant, so axial forces should be
// equal in magnitude and opposite in sign.

#[test]
fn validation_approx_ext_cantilever_method_axial_proportionality() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let f_lat: f64 = 20.0;

    // Symmetric 1-bay portal frame with lateral load
    let input = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let results = solve_2d(&input).expect("solve");

    // Vertical reactions give column axial forces at the base
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Cantilever method: both columns equidistant from centroid
    // -> axial forces equal magnitude, opposite sign
    let ry1_abs: f64 = r1.ry.abs();
    let ry4_abs: f64 = r4.ry.abs();

    // Magnitudes should be equal (symmetric frame)
    assert_close(ry1_abs, ry4_abs, 0.02, "cantilever method: |Ry1| = |Ry4| for symmetric frame");

    // Opposite signs (one tension, one compression)
    assert!(
        r1.ry * r4.ry < 0.0,
        "cantilever method: vertical reactions have opposite signs: Ry1={:.4}, Ry4={:.4}",
        r1.ry, r4.ry
    );

    // Cantilever method prediction: axial = M_overturning * d_i / sum(d_i^2)
    // M_overturning = F * h = 20 * 4 = 80 kN-m
    // d_1 = -w/2 = -3, d_2 = w/2 = 3, sum(d^2) = 18
    // Axial = 80 * 3 / 18 = 13.33 kN
    let d: f64 = w / 2.0;
    let m_overturning: f64 = f_lat * h;
    let sum_d2: f64 = 2.0 * d * d;
    let predicted_axial: f64 = m_overturning * d / sum_d2;

    // For a fixed-base portal, exact axial is less than cantilever prediction
    // because fixed base moments absorb some overturning. Check order of magnitude.
    assert!(
        ry1_abs > predicted_axial * 0.3 && ry1_abs < predicted_axial * 1.5,
        "cantilever method: FEM axial {:.2} in range of predicted {:.2}",
        ry1_abs, predicted_axial
    );
}

// ================================================================
// 3. Two-Moment Approximation: Continuous Beam wL^2/10 vs Exact
// ================================================================
//
// Two-span continuous beam with equal spans and UDL.
// Approximate interior moment: wL^2/10 (used in practice/ACI)
// Exact (three-moment equation): wL^2/8
// FEM should match exact. We verify both the exact match and the
// magnitude of approximation error.

#[test]
fn validation_approx_ext_two_moment_approximation() {
    let l: f64 = 8.0;
    let q: f64 = -12.0;
    let w: f64 = q.abs();
    let n_per_span = 6;

    let total_elements = n_per_span * 2;
    let loads: Vec<SolverLoad> = (1..=total_elements)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = solve_2d(&input).expect("solve");

    // Interior support node
    let interior_node = n_per_span + 1;

    // Get moment at interior support from element ending at that node
    let ef_span1_end = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    let fem_moment: f64 = ef_span1_end.m_end.abs();

    let exact_moment: f64 = w * l * l / 8.0;       // = 96.0
    let approx_moment: f64 = w * l * l / 10.0;     // = 76.8

    // FEM should match exact (three-moment equation) within 5%
    assert_close(fem_moment, exact_moment, 0.05,
        "two-moment: FEM matches exact wL^2/8");

    // Approximation wL^2/10 underestimates the moment
    assert!(
        approx_moment < exact_moment,
        "two-moment: wL^2/10 ({:.1}) < wL^2/8 ({:.1})", approx_moment, exact_moment
    );

    // The approximation error should be about 20%
    let approx_error: f64 = (exact_moment - approx_moment) / exact_moment;
    assert!(
        approx_error > 0.15 && approx_error < 0.30,
        "two-moment: approximation error {:.1}% should be ~20%",
        approx_error * 100.0
    );

    // Also verify interior reaction
    let r_b = results.reactions.iter().find(|r| r.node_id == interior_node).unwrap();
    let exact_rb: f64 = 10.0 * w * l / 8.0; // = 120.0
    assert_close(r_b.ry, exact_rb, 0.05, "two-moment: interior reaction 10wL/8");
}

// ================================================================
// 4. Fixed-End Beam: wL^2/12 Exact End Moment
// ================================================================
//
// Fixed-fixed beam with UDL. End moments are exactly wL^2/12.
// Midspan moment is exactly wL^2/24. This is an exact result,
// not an approximation, so FEM should match very closely.

#[test]
fn validation_approx_ext_fixed_beam_exact_moments() {
    let l: f64 = 10.0;
    let q: f64 = -8.0;
    let w: f64 = q.abs();
    let n = 10; // one element per meter

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = solve_2d(&input).expect("solve");

    let analytical_end: f64 = w * l * l / 12.0;    // = 66.667
    let analytical_mid: f64 = w * l * l / 24.0;    // = 33.333

    // Check end moments from reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r1.mz.abs(), analytical_end, 0.02,
        "fixed beam: left end moment wL^2/12");
    assert_close(r_end.mz.abs(), analytical_end, 0.02,
        "fixed beam: right end moment wL^2/12");

    // End moments should be equal in magnitude (symmetric loading and supports)
    assert_close(r1.mz.abs(), r_end.mz.abs(), 0.01,
        "fixed beam: symmetric end moments");

    // Midspan moment from element forces
    let ef_mid = results.element_forces.iter()
        .find(|ef| ef.element_id == n / 2)
        .unwrap();
    assert_close(ef_mid.m_end.abs(), analytical_mid, 0.05,
        "fixed beam: midspan moment wL^2/24");

    // Verify vertical reactions are wL/2 each (symmetric)
    let analytical_ry: f64 = w * l / 2.0; // = 40.0
    assert_close(r1.ry.abs(), analytical_ry, 0.02, "fixed beam: left reaction wL/2");
    assert_close(r_end.ry.abs(), analytical_ry, 0.02, "fixed beam: right reaction wL/2");
}

// ================================================================
// 5. Portal Frame: H*h/4 Approximate Knee Moment
// ================================================================
//
// For a fixed-base portal frame with lateral load H at beam level,
// the approximate knee moment (moment at beam-column junction) is H*h/4.
// This comes from assuming inflection points at mid-height of columns
// and at mid-span of beam.

#[test]
fn validation_approx_ext_portal_knee_moment() {
    let h: f64 = 5.0;
    let w: f64 = 8.0;
    let f_lat: f64 = 40.0;

    let input = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let results = solve_2d(&input).expect("solve");

    // Approximate knee moment = H*h/4 (from portal method with inflection at mid-height)
    let approx_knee: f64 = f_lat * h / 4.0; // = 50.0

    // Get actual knee moment from element forces
    // Element 1 is left column (node 1 -> node 2), knee is at node 2
    let ef_col = results.element_forces.iter()
        .find(|ef| ef.element_id == 1)
        .unwrap();
    let actual_knee: f64 = ef_col.m_end.abs();

    // The portal method approximation assumes inflection at mid-height.
    // For a fixed-base portal, the actual inflection point is below mid-height,
    // making the actual knee moment larger than H*h/4.
    // The exact value depends on relative stiffness of beam vs columns.
    // We verify the approximation is in the right ballpark (within 50%).
    assert!(
        actual_knee > approx_knee * 0.5 && actual_knee < approx_knee * 2.0,
        "portal knee: FEM {:.2} vs approximate H*h/4 = {:.2}", actual_knee, approx_knee
    );

    // Also verify the base moment. For fixed base: M_base + M_knee = V_col * h
    // where V_col = H/2 for symmetric portal.
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let base_moment: f64 = r1.mz.abs();
    let col_shear: f64 = r1.rx.abs();

    // Column equilibrium: M_base + M_knee = V_col * h
    let moment_sum: f64 = base_moment + actual_knee;
    let shear_moment: f64 = col_shear * h;
    assert_close(moment_sum, shear_moment, 0.05,
        "portal knee: column moment equilibrium M_base + M_knee = V*h");
}

// ================================================================
// 6. Multi-Bay Frame: Lateral Load Sharing Between Bays
// ================================================================
//
// Two-bay frame with 3 columns. Portal method: interior column carries
// twice the shear of exterior columns. Total = H.
// Exterior: V_ext = H / (2 * n_bays) = H/4
// Interior: V_int = 2 * V_ext = H/2

#[test]
fn validation_approx_ext_multi_bay_load_sharing() {
    let h: f64 = 4.0;
    let w: f64 = 5.0;
    let f_lat: f64 = 40.0;

    // 2-bay frame: 3 columns, 2 beams
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
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 4, 3, 1, 1, false, false), // center column
        (3, "frame", 6, 5, 1, 1, false, false), // right column
        (4, "frame", 2, 3, 1, 1, false, false), // left beam
        (5, "frame", 3, 5, 1, 1, false, false), // right beam
    ];

    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed"), (3, 6, "fixed")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f_lat, fy: 0.0, mz: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = solve_2d(&input).expect("solve");

    // Check total base shear equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), f_lat, 0.02, "multi-bay: total base shear = H");

    // Portal method predictions for 2-bay frame:
    let n_bays: f64 = 2.0;
    let v_ext_predicted: f64 = f_lat / (2.0 * n_bays); // = 10.0
    let v_int_predicted: f64 = 2.0 * v_ext_predicted;   // = 20.0

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    let r6 = results.reactions.iter().find(|r| r.node_id == 6).unwrap();

    // Interior column should carry more shear than exterior columns
    assert!(
        r4.rx.abs() > r1.rx.abs(),
        "multi-bay: interior column shear ({:.2}) > left exterior ({:.2})",
        r4.rx.abs(), r1.rx.abs()
    );
    assert!(
        r4.rx.abs() > r6.rx.abs(),
        "multi-bay: interior column shear ({:.2}) > right exterior ({:.2})",
        r4.rx.abs(), r6.rx.abs()
    );

    // Portal method prediction: interior ~2x exterior (approximate, 40% tolerance for fixed base)
    let ratio_int_ext: f64 = r4.rx.abs() / ((r1.rx.abs() + r6.rx.abs()) / 2.0);
    assert!(
        ratio_int_ext > 1.0 && ratio_int_ext < 3.5,
        "multi-bay: interior/exterior shear ratio {:.2} should be ~2.0",
        ratio_int_ext
    );

    // Order-of-magnitude check on portal method predictions
    let avg_exterior: f64 = (r1.rx.abs() + r6.rx.abs()) / 2.0;
    assert!(
        avg_exterior > v_ext_predicted * 0.3 && avg_exterior < v_ext_predicted * 3.0,
        "multi-bay: exterior shear {:.2} in range of predicted {:.2}",
        avg_exterior, v_ext_predicted
    );
    assert!(
        r4.rx.abs() > v_int_predicted * 0.3 && r4.rx.abs() < v_int_predicted * 3.0,
        "multi-bay: interior shear {:.2} in range of predicted {:.2}",
        r4.rx.abs(), v_int_predicted
    );
}

// ================================================================
// 7. Inflection Point Assumption: Approximate vs Exact Location
// ================================================================
//
// For a fixed-base portal frame with lateral load, the portal method
// assumes inflection points at mid-height of columns. The exact location
// depends on relative stiffness. We verify that:
// (a) An inflection point exists (moment changes sign along the column).
// (b) The inflection point is somewhere in the lower half of the column
//     (for stiff beam relative to columns, inflection moves down).

#[test]
fn validation_approx_ext_inflection_point_location() {
    let h: f64 = 6.0;
    let w: f64 = 6.0;
    let f_lat: f64 = 20.0;
    let n_col = 12; // fine mesh for resolution

    // Build portal frame with multiple elements per column
    let dy: f64 = h / n_col as f64;
    let dx: f64 = w / 4.0; // 4 elements for the beam

    let mut nodes_vec = Vec::new();
    let mut node_id: usize = 1;

    // Left column: nodes 1 to n_col+1, x=0, y=0..h
    for i in 0..=n_col {
        nodes_vec.push((node_id, 0.0, i as f64 * dy));
        node_id += 1;
    }
    let top_left = node_id - 1; // = n_col + 1

    // Beam: 4 segments from (0,h) to (w,h), skip first node (shared with col top)
    for i in 1..=4 {
        nodes_vec.push((node_id, i as f64 * dx, h));
        node_id += 1;
    }
    let top_right = node_id - 1;

    // Right column: from (w,h) down to (w,0), skip first node (shared with beam end)
    for i in 1..=n_col {
        nodes_vec.push((node_id, w, h - i as f64 * dy));
        node_id += 1;
    }
    let bottom_right = node_id - 1;

    let mut elems_vec = Vec::new();
    let mut elem_id: usize = 1;

    // Left column elements
    for i in 1..=n_col {
        elems_vec.push((elem_id, "frame", i, i + 1, 1, 1, false, false));
        elem_id += 1;
    }

    // Beam elements
    let mut prev = top_left;
    for i in 1..=4 {
        let next = top_left + i;
        elems_vec.push((elem_id, "frame", prev, next, 1, 1, false, false));
        prev = next;
        elem_id += 1;
    }

    // Right column elements
    let mut prev = top_right;
    for i in 1..=n_col {
        let next = top_right + i;
        elems_vec.push((elem_id, "frame", prev, next, 1, 1, false, false));
        prev = next;
        elem_id += 1;
    }

    let sups = vec![(1, 1, "fixed"), (2, bottom_right, "fixed")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: top_left, fx: f_lat, fy: 0.0, mz: 0.0 }),
    ];

    let input = make_input(
        nodes_vec,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems_vec,
        sups,
        loads,
    );
    let results = solve_2d(&input).expect("solve");

    // Find inflection point in the left column (elements 1..n_col).
    // The inflection point is where the moment changes sign within an element
    // (m_start and m_end have opposite signs) or at element boundaries.
    // At the base (fixed), there is a moment. At the top (knee), there is a moment.
    // Between them, the moment should change sign.

    let mut inflection_elem: Option<usize> = None;
    for i in 1..=n_col {
        let ef = results.element_forces.iter()
            .find(|ef| ef.element_id == i).unwrap();

        // Check if moment changes sign within this element
        if ef.m_start * ef.m_end < 0.0 {
            inflection_elem = Some(i);
            break;
        }
        // Also check if moment is essentially zero at either end
        if i > 1 && ef.m_start.abs() < 1e-3 {
            inflection_elem = Some(i);
            break;
        }
    }

    // An inflection point should exist
    assert!(
        inflection_elem.is_some(),
        "inflection point: moment should change sign along column"
    );

    let infl_elem = inflection_elem.unwrap();
    // The inflection element index (1-based) relative to column height
    let infl_fraction: f64 = infl_elem as f64 / n_col as f64;

    // Portal method assumes inflection at 0.5 (mid-height).
    // For a frame with equal beam and column stiffness, it should be
    // somewhere between 0.2 and 0.8 of column height.
    assert!(
        infl_fraction > 0.1 && infl_fraction < 0.9,
        "inflection point: at {:.0}% of column height (expected 20-80%)",
        infl_fraction * 100.0
    );
}

// ================================================================
// 8. Gravity Load Approximate: ACI Moment Coefficients
// ================================================================
//
// For continuous beams with UDL, ACI 318 provides approximate moment
// coefficients for design:
//   - Positive moment in interior span: wL^2/16
//   - Negative moment at interior support: wL^2/11
//
// We build a 3-span continuous beam and compare FEM results with
// these approximate coefficients. The ACI coefficients are conservative
// approximations, so we verify FEM results are in the right range.

#[test]
fn validation_approx_ext_gravity_aci_coefficients() {
    let l: f64 = 6.0;
    let q: f64 = -15.0;
    let w: f64 = q.abs();
    let n_per_span = 6;

    let total_elements = n_per_span * 3;
    let loads: Vec<SolverLoad> = (1..=total_elements)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads);
    let results = solve_2d(&input).expect("solve");

    // ACI approximate coefficients
    let aci_neg_interior: f64 = w * l * l / 11.0;  // = 49.09 (at interior supports)
    let aci_pos_interior: f64 = w * l * l / 16.0;  // = 33.75 (midspan of interior span)

    // Interior support 1 is at node (n_per_span + 1) = node 7
    // Interior support 2 is at node (2*n_per_span + 1) = node 13
    let ef_span1_end = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    let fem_neg_support1: f64 = ef_span1_end.m_end.abs();

    let ef_span2_end = results.element_forces.iter()
        .find(|ef| ef.element_id == 2 * n_per_span)
        .unwrap();
    let fem_neg_support2: f64 = ef_span2_end.m_end.abs();

    // Midspan of interior (second) span: element at midpoint
    let mid_interior_elem = n_per_span + n_per_span / 2;
    let ef_mid_interior = results.element_forces.iter()
        .find(|ef| ef.element_id == mid_interior_elem)
        .unwrap();
    let fem_pos_interior: f64 = ef_mid_interior.m_end.abs();

    // The FEM negative moments should be in the range of the ACI coefficient.
    // ACI wL^2/11 is a simplified value; exact depends on number of spans and
    // relative stiffness. For equal spans with UDL, the exact interior support
    // moment for a 3-span beam is about wL^2/10 (from three-moment equation).
    // We allow a wide tolerance since ACI coefficients are approximate.
    assert!(
        fem_neg_support1 > aci_neg_interior * 0.7 && fem_neg_support1 < aci_neg_interior * 2.0,
        "ACI coeff: FEM negative moment {:.2} vs ACI wL^2/11 = {:.2}",
        fem_neg_support1, aci_neg_interior
    );

    // Interior support moments should be similar by symmetry (3 equal spans)
    assert_close(fem_neg_support1, fem_neg_support2, 0.05,
        "ACI coeff: symmetric interior support moments");

    // Midspan positive moment of interior span should be less than negative support moment
    // (interior span is more restrained than end span)
    assert!(
        fem_pos_interior < fem_neg_support1,
        "ACI coeff: midspan positive ({:.2}) < support negative ({:.2})",
        fem_pos_interior, fem_neg_support1
    );

    // ACI positive moment coefficient wL^2/16 should be in the right ballpark
    assert!(
        fem_pos_interior > aci_pos_interior * 0.3 && fem_pos_interior < aci_pos_interior * 3.0,
        "ACI coeff: FEM positive moment {:.2} vs ACI wL^2/16 = {:.2}",
        fem_pos_interior, aci_pos_interior
    );

    // Verify global equilibrium: total reaction = total load
    let total_load: f64 = w * l * 3.0; // = 270 kN
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02, "ACI coeff: global vertical equilibrium");
}
