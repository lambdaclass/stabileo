/// Validation: Extended Approximate Structural Analysis Methods
///
/// References:
///   - Hibbeler: "Structural Analysis", 10th ed., Chs. 7, 12
///   - McCormac & Nelson: "Structural Analysis", Ch. 16
///   - Timoshenko: "Strength of Materials", Part I, beam tables
///   - AISC Steel Construction Manual, Part 3 (beam diagrams)
///   - Norris et al.: "Elementary Structural Analysis", continuous beam tables
///
/// Tests cover aspects NOT in validation_approximate_analysis.rs or
/// validation_approximate_methods.rs:
///   1. Triangular (linearly-varying) load on SS beam: max moment at L/sqrt(3)
///   2. Three-span continuous beam: moment coefficients from beam tables
///   3. Superposition of point loads on SS beam
///   4. Portal method for 2-bay frame: interior column carries double shear
///   5. Gravity load distribution in a single-bay rigid frame
///   6. Effective length factor: sway frame drift vs rigid beam approximation
///   7. Two-span beam with unequal spans: reaction at interior support
///   8. Stiffness method carry-over: ratio of far-end to near-end moment
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Triangular Load on Simply-Supported Beam
// ================================================================
//
// SS beam, L=9m, linearly-varying load: q=0 at left, q_max at right.
// Modeled as piecewise linear loads on each element.
//
// Analytical results (Timoshenko / AISC beam tables):
//   R_A = q_max * L / 6 = 12 * 9 / 6 = 18 kN
//   R_B = q_max * L / 3 = 12 * 9 / 3 = 36 kN
//   M_max = q_max * L^2 / (9*sqrt(3)) at x = L/sqrt(3) from left
//   M_max = 12 * 81 / (9 * 1.7321) = 62.354 kN-m

#[test]
fn validation_approx_triangular_load_ss_beam() {
    let l = 9.0;
    let q_max: f64 = -12.0; // downward
    let w = q_max.abs();
    let n = 18; // fine mesh for accuracy with varying load
    let elem_len = l / n as f64;

    // Linearly varying load: q(x) = q_max * x / L
    // On element i (from x_i to x_{i+1}): q_i = q_max * x_i / L, q_j = q_max * x_{i+1} / L
    let loads: Vec<SolverLoad> = (0..n)
        .map(|i| {
            let x_i = i as f64 * elem_len;
            let x_j = (i + 1) as f64 * elem_len;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: q_max * x_i / l,
                q_j: q_max * x_j / l,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();

    let analytical_ra = w * l / 6.0; // = 18.0
    let analytical_rb = w * l / 3.0; // = 36.0

    assert_close(r_a.rz, analytical_ra, 0.02, "triangular load R_A = qL/6");
    assert_close(r_b.rz, analytical_rb, 0.02, "triangular load R_B = qL/3");

    // Equilibrium: R_A + R_B = total load = q_max * L / 2 = 54
    let total_load = w * l / 2.0;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01, "triangular load equilibrium");

    // Maximum moment location: x = L / sqrt(3) ~ 5.196 m
    // With elem_len = 0.5, node at x=5.0 is node 11, x=5.5 is node 12
    // M_max = q_max * L^2 / (9 * sqrt(3))
    let sqrt3: f64 = 3.0_f64.sqrt();
    let analytical_mmax = w * l * l / (9.0 * sqrt3); // ~ 62.354

    // Find maximum moment magnitude across all element ends
    let max_moment: f64 = results
        .element_forces
        .iter()
        .flat_map(|ef| vec![ef.m_start.abs(), ef.m_end.abs()])
        .fold(0.0_f64, |a, b| a.max(b));

    assert_close(
        max_moment,
        analytical_mmax,
        0.05,
        "triangular load M_max = qL^2/(9*sqrt(3))",
    );
}

// ================================================================
// 2. Three-Span Continuous Beam: Moment Coefficients
// ================================================================
//
// Three equal spans L=6m each, UDL q=-10 kN/m throughout.
// From beam tables (Timoshenko, Ghali/Neville):
//   Interior support moments (at B and C): M = -0.1 * w * L^2 = -36.0 kN-m
//   This is exact for three equal spans with equal UDL.

#[test]
fn validation_approx_three_span_beam_moments() {
    let l = 6.0;
    let q: f64 = -10.0;
    let w = q.abs();
    let n_per_span = 6;
    let total_elements = n_per_span * 3;

    let loads: Vec<SolverLoad> = (1..=total_elements)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support B is at node (n_per_span + 1) = 7
    // Interior support C is at node (2 * n_per_span + 1) = 13
    let node_b = n_per_span + 1;
    let node_c = 2 * n_per_span + 1;

    // Moment at B from element ending at B (element n_per_span)
    let ef_at_b = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    let m_b = ef_at_b.m_end;

    // Moment at C from element ending at C (element 2*n_per_span)
    let ef_at_c = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == 2 * n_per_span)
        .unwrap();
    let m_c = ef_at_c.m_end;

    // Exact coefficient for three equal spans: M_B = M_C = wL^2/10 (magnitude)
    let analytical_m = w * l * l / 10.0; // = 36.0

    assert_close(
        m_b.abs(),
        analytical_m,
        0.05,
        "three-span M_B = wL^2/10",
    );
    assert_close(
        m_c.abs(),
        analytical_m,
        0.05,
        "three-span M_C = wL^2/10",
    );

    // By symmetry, M_B and M_C should have the same magnitude
    assert_close(
        m_b.abs(),
        m_c.abs(),
        0.01,
        "three-span symmetry: |M_B| = |M_C|",
    );

    // End support reactions: R_A = R_D = 0.4 * w * L = 24 kN
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let end_node = 3 * n_per_span + 1;
    let r_d = results
        .reactions
        .iter()
        .find(|r| r.node_id == end_node)
        .unwrap();
    let analytical_r_end = 0.4 * w * l; // = 24.0

    assert_close(r_a.rz, analytical_r_end, 0.05, "three-span R_A = 0.4wL");
    assert_close(r_d.rz, analytical_r_end, 0.05, "three-span R_D = 0.4wL");

    // Interior support reactions: R_B = R_C = 1.1 * w * L = 66 kN
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == node_b)
        .unwrap();
    let r_c = results
        .reactions
        .iter()
        .find(|r| r.node_id == node_c)
        .unwrap();
    let analytical_r_int = 1.1 * w * l; // = 66.0

    assert_close(r_b.rz, analytical_r_int, 0.05, "three-span R_B = 1.1wL");
    assert_close(r_c.rz, analytical_r_int, 0.05, "three-span R_C = 1.1wL");
}

// ================================================================
// 3. Superposition: Two Point Loads on SS Beam
// ================================================================
//
// SS beam L=12m, P1=40 kN at L/3 (node 3), P2=60 kN at 2L/3 (node 5).
// 6 elements, each 2m long.
// By superposition:
//   R_A = P1*2L/3/L + P2*L/3/L = 40*2/3 + 60*1/3 = 46.667 kN
//   R_B = P1*L/3/L + P2*2L/3/L = 40*1/3 + 60*2/3 = 53.333 kN
// Verify that FEM matches superposition of individual load cases.

#[test]
fn validation_approx_superposition_two_point_loads() {
    let l = 12.0;
    let p1: f64 = 40.0;
    let p2: f64 = 60.0;
    let n = 6;

    // Combined load case
    let loads_combined = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx: 0.0,
            fz: -p1,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5,
            fx: 0.0,
            fz: -p2,
            my: 0.0,
        }),
    ];
    let input_combined = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_combined);
    let results_combined = linear::solve_2d(&input_combined).unwrap();

    // Individual load cases
    let loads_p1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3,
        fx: 0.0,
        fz: -p1,
        my: 0.0,
    })];
    let input_p1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_p1);
    let results_p1 = linear::solve_2d(&input_p1).unwrap();

    let loads_p2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5,
        fx: 0.0,
        fz: -p2,
        my: 0.0,
    })];
    let input_p2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_p2);
    let results_p2 = linear::solve_2d(&input_p2).unwrap();

    // Analytical reactions
    let ra_analytical = p1 * 2.0 / 3.0 + p2 * 1.0 / 3.0; // 46.667
    let rb_analytical = p1 * 1.0 / 3.0 + p2 * 2.0 / 3.0; // 53.333

    let ra_combined = results_combined
        .reactions
        .iter()
        .find(|r| r.node_id == 1)
        .unwrap();
    let rb_combined = results_combined
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();

    assert_close(ra_combined.rz, ra_analytical, 0.01, "superposition R_A");
    assert_close(rb_combined.rz, rb_analytical, 0.01, "superposition R_B");

    // Verify superposition principle: combined displacements = sum of individual
    for node_id in 1..=(n + 1) {
        let d_comb = results_combined
            .displacements
            .iter()
            .find(|d| d.node_id == node_id)
            .unwrap();
        let d_p1 = results_p1
            .displacements
            .iter()
            .find(|d| d.node_id == node_id)
            .unwrap();
        let d_p2 = results_p2
            .displacements
            .iter()
            .find(|d| d.node_id == node_id)
            .unwrap();

        let superposed_uy = d_p1.uz + d_p2.uz;
        assert_close(
            d_comb.uz,
            superposed_uy,
            0.001,
            &format!("superposition uy at node {}", node_id),
        );
    }
}

// ================================================================
// 4. Portal Method for 2-Bay Frame: Interior Column Double Shear
// ================================================================
//
// Single-story, 2-bay frame. Lateral load F at roof level.
// Portal method: exterior columns carry F/4, interior column carries F/2.
// Nodes: 1(0,0), 2(6,0), 3(12,0) fixed bases.
// Nodes: 4(0,4), 5(6,4), 6(12,4) at roof.
// Lateral load F=40 kN at node 4.

#[test]
fn validation_approx_portal_method_2bay() {
    let h = 4.0;
    let bay = 6.0;
    let f_lat = 40.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, bay, 0.0),
        (3, 2.0 * bay, 0.0),
        (4, 0.0, h),
        (5, bay, h),
        (6, 2.0 * bay, h),
    ];

    let elems = vec![
        (1, "frame", 1, 4, 1, 1, false, false), // left column
        (2, "frame", 2, 5, 1, 1, false, false), // interior column
        (3, "frame", 3, 6, 1, 1, false, false), // right column
        (4, "frame", 4, 5, 1, 1, false, false), // left beam
        (5, "frame", 5, 6, 1, 1, false, false), // right beam
    ];

    let sups = vec![
        (1, 1, "fixed"),
        (2, 2, "fixed"),
        (3, 3, "fixed"),
    ];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4,
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

    // Base shears
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();

    // Total horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), f_lat, 0.01, "2-bay frame horizontal equilibrium");

    // Portal method: for a 2-bay frame with equal bays and equal column properties,
    // each bay acts as a sub-portal. The exterior columns carry half the shear
    // of the interior column.
    // V_ext = F/4 = 10 kN each, V_int = F/2 = 20 kN
    // This is approximate; for fixed bases the actual distribution differs.
    // We check the trend: interior column shear > exterior column shear.
    let v_left = r1.rx.abs();
    let v_int = r2.rx.abs();
    let v_right = r3.rx.abs();

    // Interior column should carry more shear than exterior columns
    assert!(
        v_int > v_left,
        "Portal 2-bay: interior shear ({:.2}) > left exterior ({:.2})",
        v_int,
        v_left
    );
    assert!(
        v_int > v_right,
        "Portal 2-bay: interior shear ({:.2}) > right exterior ({:.2})",
        v_int,
        v_right
    );

    // Portal method predicts interior = 2 x exterior. Due to fixed bases,
    // the actual ratio may differ, but should be in the ballpark (1.2 to 3.0).
    let ratio_int_ext = v_int / ((v_left + v_right) / 2.0);
    assert!(
        ratio_int_ext > 1.2 && ratio_int_ext < 3.0,
        "Portal 2-bay: V_int/V_ext ratio = {:.2} (expect ~2.0)",
        ratio_int_ext,
    );
}

// ================================================================
// 5. Gravity Load Distribution in Single-Bay Rigid Frame
// ================================================================
//
// Rigid frame (fixed bases) with UDL on the beam. The columns provide
// partial fixity to the beam ends, so the beam end moments lie between
// 0 (simply-supported ends) and wL^2/12 (fully fixed ends).
//
// Using moment distribution (Hardy Cross method):
//   At each beam-column joint, the unbalanced FEM is distributed
//   according to member stiffness.
//
//   Stiffness: beam = 4EI/L_beam, column = 4EI/h (both ends fixed)
//   For L_beam=8m, h=4m, same I:
//     k_beam = 4EI/8 = EI/2
//     k_col  = 4EI/4 = EI
//   DF_beam = (EI/2) / (EI/2 + EI) = 1/3
//   DF_col  = (EI) / (EI/2 + EI) = 2/3
//
//   FEM at beam ends = wL^2/12 = 15*64/12 = 80 kN-m
//   After distribution: beam end moment = FEM * (1 - DF_beam) ~ 80 * 2/3 = 53.33
//   (approximately, ignoring carry-over iterations)
//
// We build the frame with meshed beam (8 elements) and single-element columns
// to verify: beam end moment < wL^2/12, column base moment > 0.

#[test]
fn validation_approx_gravity_moment_distribution_frame() {
    let h = 4.0;
    let span = 8.0;
    let q: f64 = -15.0;
    let w = q.abs();
    let n_beam = 8; // 8 elements for the beam

    // Build frame manually with meshed beam
    let mut nodes = Vec::new();
    // Column bases: node 1 (left) and node 2 (right)
    nodes.push((1, 0.0, 0.0));
    nodes.push((2, span, 0.0));
    // Column tops / beam ends: node 3 (left top) and node 4 (right top)
    // But beam needs intermediate nodes too.
    // Left column top = node 3
    nodes.push((3, 0.0, h));
    // Beam intermediate nodes: nodes 4 through 3+n_beam
    let beam_elem_len = span / n_beam as f64;
    for i in 1..n_beam {
        nodes.push((3 + i, i as f64 * beam_elem_len, h));
    }
    // Right column top = last beam node = node 3 + n_beam
    let right_top = 3 + n_beam;
    nodes.push((right_top, span, h));
    // Right column base is node 2

    let mut elems = Vec::new();
    let mut eid = 1;
    // Left column: node 1 -> node 3
    elems.push((eid, "frame", 1, 3, 1, 1, false, false));
    eid += 1;

    // Beam elements: node 3 -> 4 -> 5 -> ... -> right_top
    for i in 0..n_beam {
        let ni = 3 + i;
        let nj = 3 + i + 1;
        elems.push((eid, "frame", ni, nj, 1, 1, false, false));
        eid += 1;
    }

    // Right column: right_top -> node 2
    elems.push((eid, "frame", right_top, 2, 1, 1, false, false));

    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];

    // UDL on beam elements only (elements 2 through n_beam+1)
    let loads: Vec<SolverLoad> = (2..=(n_beam + 1))
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let ff_end = w * span * span / 12.0; // = 80.0 (fixed-fixed end moment)

    // Column base moments should be non-zero (moment transfer from beam)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();

    assert!(
        r1.my.abs() > 1.0,
        "Left column base moment should be non-zero: {:.4}",
        r1.my,
    );
    assert!(
        r2.my.abs() > 1.0,
        "Right column base moment should be non-zero: {:.4}",
        r2.my,
    );

    // By symmetry, column base moments should be equal in magnitude
    assert_close(
        r1.my.abs(),
        r2.my.abs(),
        0.05,
        "symmetric frame: equal column base moments",
    );

    // Vertical reactions should each be wL/2 = 60 kN (symmetric gravity)
    let analytical_rv = w * span / 2.0;
    assert_close(r1.rz, analytical_rv, 0.05, "frame R_A_y = wL/2");
    assert_close(r2.rz, analytical_rv, 0.05, "frame R_B_y = wL/2");

    // Beam end moment (at left beam-column joint) from the first beam element
    let ef_beam_start = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == 2)
        .unwrap();
    let beam_end_moment = ef_beam_start.m_start.abs();

    // Beam end moment should be less than wL^2/12 (columns provide partial,
    // not full, fixity since the column bases also allow some rotation into
    // the column base moment).
    assert!(
        beam_end_moment > 0.0 && beam_end_moment < ff_end * 1.05,
        "Beam end moment ({:.2}) should be between 0 and {:.2}",
        beam_end_moment,
        ff_end,
    );

    // The beam end moment should be greater than wL^2/24 (midspan of fixed-fixed)
    // because the columns provide significant restraint
    let ff_mid = w * span * span / 24.0; // = 40.0
    assert!(
        beam_end_moment > ff_mid,
        "Beam end moment ({:.2}) > wL^2/24 ({:.2})",
        beam_end_moment,
        ff_mid,
    );
}

// ================================================================
// 6. Effective Length: Sway Frame Stiffness
// ================================================================
//
// Compare the lateral stiffness of a frame with:
//   (a) Rigid beam (simulated by very stiff beam section) - gives 24EI/h^3 total
//   (b) Normal beam - gives reduced stiffness
// The ratio tells us about the effective restraint the beam provides.
// For equal column and beam stiffness, the frame is significantly more flexible
// than the rigid-beam case.

#[test]
fn validation_approx_effective_length_sway() {
    let h = 4.0;
    let span = 6.0;
    let f_lat = 10.0;

    // Case (a): Very stiff beam (I_beam = 100 * IZ)
    let nodes_a = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, span, h),
        (4, span, 0.0),
    ];
    let elems_a = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 2, false, false), // stiff beam uses section 2
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups_a = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads_a = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: f_lat,
        fz: 0.0,
        my: 0.0,
    })];
    let input_a = make_input(
        nodes_a,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, 100.0 * IZ)],
        elems_a,
        sups_a,
        loads_a,
    );
    let results_a = linear::solve_2d(&input_a).unwrap();
    let drift_rigid = results_a
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux;

    // Case (b): Normal beam (same section as columns)
    let input_b = make_portal_frame(h, span, E, A, IZ, f_lat, 0.0);
    let results_b = linear::solve_2d(&input_b).unwrap();
    let drift_normal = results_b
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux;

    // Rigid-beam case should be stiffer (less drift)
    assert!(
        drift_rigid.abs() < drift_normal.abs(),
        "Rigid beam stiffer: {:.6e} < {:.6e}",
        drift_rigid.abs(),
        drift_normal.abs(),
    );

    // For two fixed-base columns with rigid beam:
    // K_total = 2 * 12EI/h^3 (each column contributes 12EI/h^3 in sway mode)
    let e_eff = E * 1000.0;
    let k_rigid_approx = 2.0 * 12.0 * e_eff * IZ / h.powi(3);
    let drift_rigid_approx = f_lat / k_rigid_approx;

    // FEM rigid beam case should be close to this approximation
    assert_close(
        drift_rigid.abs(),
        drift_rigid_approx,
        0.05,
        "rigid beam drift ≈ F/(24EI/h^3)",
    );

    // The flexibility ratio should be > 1 (normal beam is more flexible)
    let flexibility_ratio = drift_normal.abs() / drift_rigid.abs();
    assert!(
        flexibility_ratio > 1.2,
        "Normal beam more flexible: ratio = {:.2}",
        flexibility_ratio,
    );
}

// ================================================================
// 7. Two-Span Beam with Unequal Spans
// ================================================================
//
// Continuous beam: span 1 = 6m, span 2 = 4m, UDL q=-10 kN/m.
// By the three-moment equation:
//   M_B = -w * (L1^3 + L2^3) / (8*(L1 + L2))
//        = -10 * (216 + 64) / (8 * 10)
//        = -10 * 280 / 80 = -35.0 kN-m
// R_A from statics of span 1:
//   R_A * L1 = w*L1^2/2 + M_B
//   R_A = w*L1/2 + M_B/L1 = 30 - 35/6 = 24.167 kN

#[test]
fn validation_approx_unequal_two_span() {
    let l1 = 6.0;
    let l2 = 4.0;
    let q: f64 = -10.0;
    let w = q.abs();
    let n_per_span = 6;
    let total_elements = n_per_span * 2;

    let loads: Vec<SolverLoad> = (1..=total_elements)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_continuous_beam(&[l1, l2], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support moment
    let ef_span1_end = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    let m_b = ef_span1_end.m_end;

    let analytical_mb: f64 = w * (l1.powi(3) + l2.powi(3)) / (8.0 * (l1 + l2)); // 35.0

    assert_close(
        m_b.abs(),
        analytical_mb,
        0.05,
        "unequal spans M_B = w(L1^3+L2^3)/(8(L1+L2))",
    );

    // Reaction at support A
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    // R_A = wL1/2 - M_B/L1 (M_B is hogging, so positive R_A is reduced)
    // Actually: R_A * L1 = w*L1^2/2 - |M_B|, so R_A = w*L1/2 - |M_B|/L1
    let analytical_ra = w * l1 / 2.0 - analytical_mb / l1; // 30 - 5.833 = 24.167

    assert_close(r_a.rz, analytical_ra, 0.05, "unequal spans R_A");

    // Reaction at support C (end of span 2)
    let end_node = 2 * n_per_span + 1;
    let r_c = results
        .reactions
        .iter()
        .find(|r| r.node_id == end_node)
        .unwrap();
    // R_C = wL2/2 - |M_B|/L2 = 20 - 8.75 = 11.25
    let analytical_rc = w * l2 / 2.0 - analytical_mb / l2;

    assert_close(r_c.rz, analytical_rc, 0.05, "unequal spans R_C");

    // Interior support reaction from equilibrium: R_B = total - R_A - R_C
    let total_load = w * (l1 + l2);
    let node_b = n_per_span + 1;
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == node_b)
        .unwrap();
    let analytical_rb = total_load - analytical_ra - analytical_rc;

    assert_close(r_b.rz, analytical_rb, 0.05, "unequal spans R_B");
}

// ================================================================
// 8. Carry-Over Factor Verification
// ================================================================
//
// The carry-over factor for a prismatic beam is exactly 0.5:
//   For beam AB with A pinned and B fixed, applying moment M0 at A
//   produces a reaction moment M0/2 at the fixed end B.
//
// This follows from the beam stiffness matrix:
//   K_AA = 4EI/L, K_BA = 2EI/L  =>  carry-over = K_BA / K_AA = 0.5
//
// Model: beam pinned at near end (node 1), fixed at far end (node n+1).
// Apply moment M0 at the pinned end (rotation is free there).
// Expected results:
//   Far-end reaction moment = M0/2 = 50 kN-m
//   Carry-over factor = 0.5
//   Vertical reactions: V = 3*M0/(2*L) = 18.75 kN (from moment equilibrium)
//   Sum of vertical reactions = 0 (no transverse loads applied)
//
// Reference: Ghali/Neville, "Structural Analysis", stiffness method Ch. 5.

#[test]
fn validation_approx_carry_over_factor() {
    let l = 8.0;
    let m0 = 100.0; // Applied moment at pinned (near) end
    let n = 8;
    let elem_len = l / n as f64;

    // Build beam manually: pinned at node 1, fixed at node n+1
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1, "pinned"), (2, n + 1, "fixed")];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 1,
        fx: 0.0,
        fz: 0.0,
        my: m0,
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

    let r_near = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_far = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();

    // Far-end reaction moment magnitude = M0/2
    let far_end_moment = r_far.my.abs();
    let expected_far = m0 / 2.0; // = 50.0

    assert_close(
        far_end_moment,
        expected_far,
        0.02,
        "carry-over: far-end moment = M0/2",
    );

    // Carry-over factor = far-end moment / near-end applied moment
    let carry_over = far_end_moment / m0;
    assert_close(carry_over, 0.5, 0.02, "carry-over factor = 0.5");

    // Vertical equilibrium: sum of vertical reactions = 0 (no transverse loads)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(
        sum_ry.abs() < 1e-6,
        "carry-over: vertical equilibrium, sum Ry = {:.6e}",
        sum_ry,
    );

    // Shear = 3*M0/(2*L) from moment equilibrium about each support
    let shear_expected = 3.0 * m0 / (2.0 * l); // = 18.75
    assert_close(
        r_near.rz.abs(),
        shear_expected,
        0.02,
        "carry-over: shear = 3M0/(2L)",
    );
}
