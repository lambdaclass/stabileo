/// Validation: Extended Stiffness Ratio Effects on Structural Behavior
///
/// References:
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", Ch. 6
///   - Kassimali, "Structural Analysis", Ch. 16 (Moment Distribution)
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 11-12
///   - Ghali, Neville & Brown, "Structural Analysis", Ch. 5
///
/// These tests validate that relative stiffness ratios between connected
/// members correctly govern the distribution of forces, moments, and
/// displacements in indeterminate structures.
///
/// Tests verify:
///   1. Stiffer column attracts more moment in a portal frame
///   2. Stiffer beam reduces column sway (approaches fixed-fixed columns)
///   3. Stiffer span in continuous beam redistributes support moment
///   4. Shorter column in frame with unequal heights attracts more shear
///   5. Deflection inversely proportional to I (double I halves deflection)
///   6. Two-bay frame: interior column with 2x stiffness attracts more shear
///   7. Very stiff beam makes portal columns behave as fixed-fixed
///   8. Beam-to-column stiffness ratio effect on moment distribution at joint
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Stiffer Column Attracts More Moment
// ================================================================
//
// Portal frame with lateral load. Left column has I, right column has 2I.
// The stiffer (right) column should attract a larger base moment because
// stiffness = 4EI/L means the right column has 2x the stiffness.

#[test]
fn validation_stiffness_ratio_stiffer_column_attracts_more_moment() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 10.0;

    // Case 1: both columns with I_col = IZ
    let nodes1 = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems1 = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left col  sec 1 (IZ)
        (2, "frame", 2, 3, 1, 2, false, false), // beam      sec 2
        (3, "frame", 3, 4, 1, 1, false, false), // right col sec 1 (IZ)
    ];
    let sups1 = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_lat, fz: 0.0, my: 0.0,
    })];
    let input1 = make_input(
        nodes1, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, IZ)],
        elems1, sups1, loads1,
    );
    let res1 = linear::solve_2d(&input1).unwrap();

    // Case 2: left column IZ, right column 2*IZ
    let iz_stiff = IZ * 2.0;
    let nodes2 = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems2 = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left col  sec 1 (IZ)
        (2, "frame", 2, 3, 1, 2, false, false), // beam      sec 2
        (3, "frame", 3, 4, 1, 3, false, false), // right col sec 3 (2*IZ)
    ];
    let sups2 = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_lat, fz: 0.0, my: 0.0,
    })];
    let input2 = make_input(
        nodes2, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, IZ), (3, A, iz_stiff)],
        elems2, sups2, loads2,
    );
    let res2 = linear::solve_2d(&input2).unwrap();

    // In symmetric case (res1), base moments at nodes 1 and 4 should be equal
    let m_base1_sym: f64 = res1.reactions.iter().find(|r| r.node_id == 1).unwrap().my.abs();
    let m_base4_sym: f64 = res1.reactions.iter().find(|r| r.node_id == 4).unwrap().my.abs();
    let ratio_sym = m_base1_sym / m_base4_sym;
    assert_close(ratio_sym, 1.0, 0.05, "Symmetric columns: equal base moments");

    // In asymmetric case (res2), the stiffer right column should attract more moment
    let m_base1_asym: f64 = res2.reactions.iter().find(|r| r.node_id == 1).unwrap().my.abs();
    let m_base4_asym: f64 = res2.reactions.iter().find(|r| r.node_id == 4).unwrap().my.abs();
    assert!(
        m_base4_asym > m_base1_asym,
        "Stiffer column should attract more moment: M_stiff={:.4} > M_flex={:.4}",
        m_base4_asym, m_base1_asym
    );
}

// ================================================================
// 2. Stiffer Beam Reduces Column Sway
// ================================================================
//
// A portal frame with lateral load. As beam stiffness increases,
// the frame approaches fixed-fixed column behavior, reducing sway.
// With an infinitely stiff beam, each column acts as a fixed-fixed
// column with lateral stiffness 12EI/L^3.

#[test]
fn validation_stiffness_ratio_stiffer_beam_reduces_sway() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 10.0;

    let solve_sway = |iz_beam: f64| -> f64 {
        let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
        let elems = vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 2, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ];
        let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f_lat, fz: 0.0, my: 0.0,
        })];
        let input = make_input(
            nodes, vec![(1, E, 0.3)],
            vec![(1, A, IZ), (2, A, iz_beam)],
            elems, sups, loads,
        );
        let results = linear::solve_2d(&input).unwrap();
        results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs()
    };

    let sway_weak = solve_sway(IZ * 0.01);   // very flexible beam
    let sway_med = solve_sway(IZ);            // equal stiffness
    let sway_stiff = solve_sway(IZ * 1000.0); // very stiff beam

    // Stiffer beam should progressively reduce sway
    assert!(
        sway_stiff < sway_med,
        "Stiff beam < medium beam sway: {:.6} < {:.6}", sway_stiff, sway_med
    );
    assert!(
        sway_med < sway_weak,
        "Medium beam < weak beam sway: {:.6} < {:.6}", sway_med, sway_weak
    );

    // Very stiff beam should approach fixed-fixed sway: delta = F*h^3 / (2 * 12EI)
    let e_eff = E * 1000.0;
    let delta_fixed_fixed = f_lat * h.powi(3) / (2.0 * 12.0 * e_eff * IZ);
    let ratio: f64 = sway_stiff / delta_fixed_fixed;
    assert_close(ratio, 1.0, 0.10,
        "Very stiff beam approaches fixed-fixed sway");
}

// ================================================================
// 3. Continuous Beam: Stiffer Span Redistributes Moment
// ================================================================
//
// Two-span continuous beam loaded on span 1 only. When span 1 has
// higher I, it becomes stiffer and attracts more moment to the
// interior support. With load only on one span, changing I in that
// span changes the moment distribution (unlike equal UDL on both
// spans which gives identical reactions regardless of I by symmetry).

#[test]
fn validation_stiffness_ratio_continuous_beam_redistribution() {
    let l = 6.0;
    let n_per_span = 8;
    let q = -10.0;

    // Case 1: both spans same I, load on span 1 only
    let mut loads1 = Vec::new();
    for i in 0..n_per_span {
        loads1.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input1 = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads1);
    let res1 = linear::solve_2d(&input1).unwrap();

    // Case 2: span 1 has 3*IZ, span 2 has IZ, load on span 1 only
    // Must build manually since make_continuous_beam uses single section
    let total_n = 2 * n_per_span;
    let dx = l / n_per_span as f64;

    let mut nodes = Vec::new();
    for i in 0..=total_n {
        nodes.push((i + 1, i as f64 * dx, 0.0));
    }

    let mut elems = Vec::new();
    // Span 1 elements: use section 2 (stiffer)
    for i in 0..n_per_span {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 2, false, false));
    }
    // Span 2 elements: use section 1 (normal)
    for i in n_per_span..total_n {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }

    let sups = vec![
        (1, 1, "pinned"),
        (2, n_per_span + 1, "rollerX"),
        (3, total_n + 1, "rollerX"),
    ];

    // Load only on span 1
    let mut loads2 = Vec::new();
    for i in 0..n_per_span {
        loads2.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input2 = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, IZ * 3.0)],
        elems, sups, loads2,
    );
    let res2 = linear::solve_2d(&input2).unwrap();

    // Get interior support reactions
    let ry_mid1: f64 = res1.reactions.iter()
        .find(|r| r.node_id == n_per_span + 1).unwrap().rz;
    let ry_mid2: f64 = res2.reactions.iter()
        .find(|r| r.node_id == n_per_span + 1).unwrap().rz;

    // The support reaction should differ between the two cases because
    // a stiffer span 1 changes the compatibility at the interior support
    let diff: f64 = (ry_mid1 - ry_mid2).abs();
    assert!(
        diff > 0.1,
        "Stiffness redistribution changes support reaction: R_sym={:.4}, R_asym={:.4}",
        ry_mid1, ry_mid2
    );

    // The stiffer span should cause more moment to be attracted to the interior support
    // Check element forces near the interior support
    let ef_span1_end = res2.element_forces.iter()
        .find(|e| e.element_id == n_per_span).unwrap();
    let ef_span2_start = res2.element_forces.iter()
        .find(|e| e.element_id == n_per_span + 1).unwrap();

    // Moment should be non-zero at the interior support (indeterminate effect)
    let m_span1_end: f64 = ef_span1_end.m_end.abs();
    let m_span2_start: f64 = ef_span2_start.m_start.abs();
    assert!(
        m_span1_end > 1.0 || m_span2_start > 1.0,
        "Interior support has moment redistribution: M1_end={:.4}, M2_start={:.4}",
        m_span1_end, m_span2_start
    );
}

// ================================================================
// 4. Unequal Column Heights: Shorter Column Attracts More Shear
// ================================================================
//
// Frame with two columns of different heights but same cross-section.
// A rigid beam connects them at the top. Under lateral load, the
// shorter column has higher stiffness (k = 12EI/L^3) and thus
// attracts more shear force.

#[test]
fn validation_stiffness_ratio_unequal_heights_shear_attraction() {
    let h_short = 3.0;
    let h_tall = 6.0;
    let w = 8.0;
    let f_lat = 20.0;
    let iz_beam = IZ * 10000.0; // very stiff beam (rigid floor)

    // Node layout:
    // 1 (0,0) -- 2 (0,h_short) -- 3 (w,h_short) -- 4 (w,0)
    // Node 4 is at y=0, but the right column goes from (w,0) to (w,h_tall)
    // We need the beam at height h_short, so right column from (w,0) to (w,h_short)
    // won't work for unequal heights.
    //
    // Instead: left column h_short, right column h_tall.
    // Place beam at top connecting them.
    // Nodes: 1(0,0), 2(0,h_short), 3(w,h_short), then 4(w,0) but right column
    // is from (w, h_short - h_tall) to (w, h_short). Since h_tall > h_short,
    // the right column base is below ground.
    //
    // Simpler approach: both columns start at y=0, beam connects their tops.
    // Left col: node 1(0,0) to node 2(0,h_short)
    // Right col: node 4(w,0) to node 3(w,h_tall)
    // Beam: node 2(0,h_short) to node 3(w,h_tall)
    // But beam is then inclined. We want a horizontal beam.
    //
    // Better: use a frame where the ground level differs.
    // Left col: 1(0,0) -> 2(0,h_short)
    // Right col: 3(w,0) -> 4(w,h_tall)
    // Beam at some shared level won't work neatly.
    //
    // Simplest correct approach: both columns same height but different
    // actual stiffness due to different lengths. Place left base higher.
    // Left col: 1(0, h_tall - h_short) -> 2(0, h_tall)  length = h_short
    // Right col: 3(w, 0) -> 4(w, h_tall)                 length = h_tall
    // Beam: 2(0, h_tall) -> 4(w, h_tall)

    let nodes = vec![
        (1, 0.0, h_tall - h_short), // left base (elevated)
        (2, 0.0, h_tall),           // left top
        (3, w, h_tall),             // right top
        (4, w, 0.0),               // right base
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left col  (short, h=3)
        (2, "frame", 2, 3, 1, 2, false, false), // beam      (stiff)
        (3, "frame", 4, 3, 1, 1, false, false), // right col (tall, h=6)
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_lat, fz: 0.0, my: 0.0,
    })];
    let input = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, iz_beam)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Shear in columns: shorter column should have more shear
    // Column shear = base horizontal reaction
    let rx_short: f64 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rx.abs();
    let rx_tall: f64 = results.reactions.iter().find(|r| r.node_id == 4).unwrap().rx.abs();

    assert!(
        rx_short > rx_tall,
        "Shorter column attracts more shear: V_short={:.4} > V_tall={:.4}",
        rx_short, rx_tall
    );

    // Stiffness ratio: k_short/k_tall = (h_tall/h_short)^3 = (6/3)^3 = 8
    // So shear ratio should approach 8 with rigid beam
    let shear_ratio = rx_short / rx_tall;
    assert!(
        shear_ratio > 3.0,
        "Shear ratio should reflect stiffness difference: ratio={:.2}",
        shear_ratio
    );
}

// ================================================================
// 5. Deflection Inversely Proportional to I
// ================================================================
//
// Simply-supported beam with point load at midspan.
// delta = PL^3 / (48EI), so doubling I halves the deflection.

#[test]
fn validation_stiffness_ratio_deflection_inversely_proportional_to_i() {
    let l = 8.0;
    let n = 16;
    let p = -20.0;
    let mid = n / 2 + 1;

    let solve_deflection = |iz: f64| -> f64 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: p, my: 0.0,
        })];
        let input = make_beam(n, l, E, A, iz, "pinned", Some("rollerX"), loads);
        let results = linear::solve_2d(&input).unwrap();
        results.displacements.iter().find(|d| d.node_id == mid).unwrap().uz.abs()
    };

    let d1 = solve_deflection(IZ);
    let d2 = solve_deflection(IZ * 2.0);
    let d4 = solve_deflection(IZ * 4.0);

    // d2/d1 should be approximately 0.5
    let ratio_2: f64 = d2 / d1;
    assert_close(ratio_2, 0.5, 0.02, "Double I halves deflection");

    // d4/d1 should be approximately 0.25
    let ratio_4: f64 = d4 / d1;
    assert_close(ratio_4, 0.25, 0.02, "Quadruple I quarters deflection");

    // Check absolute value against analytical: delta = PL^3/(48EI)
    let e_eff = E * 1000.0;
    let delta_analytical = p.abs() * l.powi(3) / (48.0 * e_eff * IZ);
    assert_close(d1, delta_analytical, 0.02,
        "Deflection matches PL^3/(48EI)");
}

// ================================================================
// 6. Two-Bay Frame: Interior Column with 2x Stiffness
// ================================================================
//
// Two-bay portal frame under lateral load. The interior column has
// twice the stiffness (2*IZ) compared to exterior columns (IZ).
// With a rigid beam, shear distributes by stiffness: the interior
// column should attract twice the shear of each exterior column.

#[test]
fn validation_stiffness_ratio_two_bay_interior_column_shear() {
    let h = 4.0;
    let w = 5.0;
    let f_lat = 30.0;
    let iz_beam = IZ * 10000.0;
    let iz_int = IZ * 2.0; // interior column 2x stiffness

    // Nodes:
    // 1(0,0), 2(0,h), 3(w,h), 4(w,0), 5(2w,h), 6(2w,0)
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, w, h), (4, w, 0.0),
        (5, 2.0 * w, h), (6, 2.0 * w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left col   (IZ)
        (2, "frame", 2, 3, 1, 3, false, false), // beam 1     (stiff)
        (3, "frame", 4, 3, 1, 2, false, false), // interior col (2*IZ)
        (4, "frame", 3, 5, 1, 3, false, false), // beam 2     (stiff)
        (5, "frame", 6, 5, 1, 1, false, false), // right col  (IZ)
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed"), (3, 6, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_lat, fz: 0.0, my: 0.0,
    })];
    let input = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, iz_int), (3, A, iz_beam)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Interior column should attract more horizontal reaction
    let rx_left: f64 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rx.abs();
    let rx_int: f64 = results.reactions.iter().find(|r| r.node_id == 4).unwrap().rx.abs();
    let rx_right: f64 = results.reactions.iter().find(|r| r.node_id == 6).unwrap().rx.abs();

    assert!(
        rx_int > rx_left,
        "Interior col (2I) attracts more shear than left exterior: {:.4} > {:.4}",
        rx_int, rx_left
    );
    assert!(
        rx_int > rx_right,
        "Interior col (2I) attracts more shear than right exterior: {:.4} > {:.4}",
        rx_int, rx_right
    );

    // With rigid beam and same height, shear distributes by stiffness:
    // k_ext : k_int : k_ext = 1 : 2 : 1, total = 4
    // Interior should carry about 50% of total shear
    let total_rx = rx_left + rx_int + rx_right;
    let int_fraction = rx_int / total_rx;
    assert_close(int_fraction, 0.5, 0.10,
        "Interior column carries ~50% of total shear");

    // Exterior columns should carry roughly equal shear
    let ext_ratio: f64 = rx_left / rx_right;
    assert_close(ext_ratio, 1.0, 0.15,
        "Exterior columns share shear roughly equally");
}

// ================================================================
// 7. Very Stiff Beam Makes Columns Behave as Fixed-Fixed
// ================================================================
//
// With I_beam >> I_col, the beam acts as a rigid link, enforcing
// zero rotation at column tops. Each column then behaves as a
// fixed-fixed column under lateral load. The column base moment
// for a fixed-fixed column is M_base = F*h/2 (per column when
// load is shared equally).

#[test]
fn validation_stiffness_ratio_very_stiff_beam_fixed_fixed_columns() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 10.0;
    let iz_beam = IZ * 100_000.0; // extremely stiff beam

    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 2, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_lat, fz: 0.0, my: 0.0,
    })];
    let input = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, iz_beam)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // With rigid beam, both columns share load equally.
    // Each column carries F/2 shear. For fixed-fixed:
    //   M_base = M_top = V*h/2 = (F/2)*h/2 = F*h/4
    let m_expected = f_lat * h / 4.0;

    let m_base1: f64 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().my.abs();
    let m_base4: f64 = results.reactions.iter().find(|r| r.node_id == 4).unwrap().my.abs();

    assert_close(m_base1, m_expected, 0.05,
        "Left column base moment ~ F*h/4");
    assert_close(m_base4, m_expected, 0.05,
        "Right column base moment ~ F*h/4");

    // Column top rotations should be near zero (rigid beam enforces compatibility)
    let rz2: f64 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ry.abs();
    let rz3: f64 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ry.abs();
    assert!(
        rz2 < 1e-4,
        "Column top rotation near zero (rigid beam): rz2={:.6}", rz2
    );
    assert!(
        rz3 < 1e-4,
        "Column top rotation near zero (rigid beam): rz3={:.6}", rz3
    );

    // Sway should match fixed-fixed formula: delta = F*h^3 / (2*12EI)
    let e_eff = E * 1000.0;
    let delta_ff = f_lat * h.powi(3) / (2.0 * 12.0 * e_eff * IZ);
    let sway: f64 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    assert_close(sway, delta_ff, 0.05,
        "Sway matches fixed-fixed column formula");
}

// ================================================================
// 8. Beam-to-Column Stiffness Ratio: Moment Distribution at Joint
// ================================================================
//
// At a beam-column joint with applied moment, the moment distributes
// to connected members in proportion to their stiffness (EI/L).
// With two members (beam and column) meeting at a joint, the
// distribution factors are:
//   DF_beam = k_beam / (k_beam + k_col)
//   DF_col  = k_col  / (k_beam + k_col)
// where k = 4EI/L for a far-end fixed member.

#[test]
fn validation_stiffness_ratio_moment_distribution_at_joint() {
    let h = 4.0;
    let l_beam = 6.0;
    let m_applied = 100.0;
    let n_col = 8;
    let n_beam = 12;

    let iz_beam = IZ * 3.0;
    let e_eff = E * 1000.0;

    // k_col = 4*E_eff*IZ / h, k_beam = 4*E_eff*iz_beam / l_beam
    let k_col = 4.0 * e_eff * IZ / h;
    let k_beam = 4.0 * e_eff * iz_beam / l_beam;
    let df_col = k_col / (k_col + k_beam);
    let df_beam = k_beam / (k_col + k_beam);

    // Build an L-shaped structure: column (vertical) + beam (horizontal)
    // Node 1 at base (fixed), Node 2 at joint, Node 3 at beam far end (fixed)
    // Column: 1 -> 2 (vertical), Beam: 2 -> 3 (horizontal)
    let dy_col = h / n_col as f64;
    let dx_beam = l_beam / n_beam as f64;

    let mut nodes = Vec::new();
    // Column nodes (vertical, along y)
    for i in 0..=n_col {
        nodes.push((i + 1, 0.0, i as f64 * dy_col));
    }
    // Beam nodes (horizontal, along x) - starts from joint node
    for i in 1..=n_beam {
        nodes.push((n_col + 1 + i, i as f64 * dx_beam, h));
    }
    let joint_node = n_col + 1;
    let beam_end_node = n_col + 1 + n_beam;

    let mut elems = Vec::new();
    // Column elements
    for i in 0..n_col {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    // Beam elements
    for i in 0..n_beam {
        elems.push((n_col + 1 + i, "frame", n_col + 1 + i, n_col + 2 + i, 1, 2, false, false));
    }

    let sups = vec![
        (1, 1, "fixed"),
        (2, beam_end_node, "fixed"),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: joint_node, fx: 0.0, fz: 0.0, my: m_applied,
    })];
    let input = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, iz_beam)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Get moments at the joint from each member
    // Column top element (last column element, near joint)
    let ef_col_top = results.element_forces.iter()
        .find(|e| e.element_id == n_col).unwrap();
    // Beam start element (first beam element, near joint)
    let ef_beam_start = results.element_forces.iter()
        .find(|e| e.element_id == n_col + 1).unwrap();

    let m_col_joint: f64 = ef_col_top.m_end.abs();
    let m_beam_joint: f64 = ef_beam_start.m_start.abs();
    let total_m = m_col_joint + m_beam_joint;

    // Distribution factors from solver
    let computed_df_col = m_col_joint / total_m;
    let computed_df_beam = m_beam_joint / total_m;

    assert_close(computed_df_col, df_col, 0.10,
        &format!("Column distribution factor: computed={:.4}, expected={:.4}",
            computed_df_col, df_col));
    assert_close(computed_df_beam, df_beam, 0.10,
        &format!("Beam distribution factor: computed={:.4}, expected={:.4}",
            computed_df_beam, df_beam));

    // Sum of moments at joint should equal applied moment (equilibrium)
    assert_close(total_m, m_applied, 0.05,
        "Joint equilibrium: sum of member moments = applied moment");
}
