/// Validation: Shear Lag and Effective Width Concepts via Simplified FEM Models
///
/// Since shear lag is inherently a plate/shell phenomenon, these tests study the
/// concept through simplified 1D analogues:
///   - Parallel beams/frames sharing loads through connecting elements
///   - Effective section properties reflecting reduced effective width
///   - Load distribution between parallel paths
///
/// References:
///   - Salmon, Johnson & Malhas, "Steel Structures", 5th Ed., Ch. 4 (Effective width)
///   - Eurocode 3, EN 1993-1-5, Section 3.2 (Effective width of flanges)
///   - Moffatt & Dowling, "Shear Lag in Steel Box Girder Bridges", The Structural Engineer, 1975
///
/// Tests:
///   1. Effective width reduces Iz: deflection increases
///   2. Effective width does not change reactions (SS beam, statically determinate)
///   3. Parallel beams with rigid links: equal deflection at midspan
///   4. Load sharing between parallel beams via rigid link
///   5. Wide flange vs narrow flange: deflection ratio
///   6. Reduced section at midspan only: deflection increases
///   7. Concentrated vs distributed flange force (cantilever analogy)
///   8. Effective width increases with span (span scaling)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Effective Width Reduces Iz: Deflection Increases
// ================================================================
//
// Simply-supported beam L=8m, UDL w=-10 kN/m, 4 elements.
// Full section Iz = 1e-4. Reduced effective Iz = 0.8e-4 (80% effective width).
// For SS beam with UDL, delta = 5*w*L^4 / (384*EI).
// delta_reduced / delta_full = Iz_full / Iz_reduced = 1.25.

#[test]
fn validation_shear_lag_effective_width_deflection_increase() {
    let l = 8.0;
    let n = 4;
    let q = -10.0;
    let iz_full = IZ;          // 1e-4
    let iz_reduced = 0.8e-4;   // 80% effective width

    // Full section beam
    let input_full = make_ss_beam_udl(n, l, E, A, iz_full, q);
    let res_full = linear::solve_2d(&input_full).unwrap();
    let mid = n / 2 + 1; // node 3
    let delta_full = res_full.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Reduced section beam
    let input_red = make_ss_beam_udl(n, l, E, A, iz_reduced, q);
    let res_red = linear::solve_2d(&input_red).unwrap();
    let delta_red = res_red.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Ratio should be Iz_full / Iz_reduced = 1.25
    let ratio = delta_red / delta_full;
    let expected_ratio = iz_full / iz_reduced; // 1.25
    let err = (ratio - expected_ratio).abs() / expected_ratio;
    assert!(err < 0.02,
        "Deflection ratio: {:.4}, expected {:.4}, err={:.2}%",
        ratio, expected_ratio, err * 100.0);
}

// ================================================================
// 2. Effective Width Does Not Change Reactions (SS Beam)
// ================================================================
//
// SS beam is statically determinate, so reactions depend only on
// geometry and loads, not on section stiffness.

#[test]
fn validation_shear_lag_reactions_unchanged_ss() {
    let l = 8.0;
    let n = 4;
    let q = -10.0;
    let iz_full = IZ;
    let iz_reduced = 0.8e-4;

    // Full section
    let input_full = make_ss_beam_udl(n, l, E, A, iz_full, q);
    let res_full = linear::solve_2d(&input_full).unwrap();

    // Reduced section
    let input_red = make_ss_beam_udl(n, l, E, A, iz_reduced, q);
    let res_red = linear::solve_2d(&input_red).unwrap();

    // Reactions at node 1 (pinned) and node n+1 (rollerX)
    let ra_full = res_full.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let rb_full = res_full.reactions.iter().find(|r| r.node_id == n + 1).unwrap().rz;
    let ra_red = res_red.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let rb_red = res_red.reactions.iter().find(|r| r.node_id == n + 1).unwrap().rz;

    // Exact: R_A = R_B = wL/2 = 10*8/2 = 40 kN
    let expected = q.abs() * l / 2.0;

    assert_close(ra_full, expected, 0.01, "R_A full section");
    assert_close(rb_full, expected, 0.01, "R_B full section");
    assert_close(ra_red, expected, 0.01, "R_A reduced section");
    assert_close(rb_red, expected, 0.01, "R_B reduced section");

    // Direct comparison: reactions should be identical between full and reduced
    assert_close(ra_full, ra_red, 0.001, "R_A full vs reduced");
    assert_close(rb_full, rb_red, 0.001, "R_B full vs reduced");
}

// ================================================================
// 3. Parallel Beams with Rigid Links: Equal Deflection
// ================================================================
//
// Two parallel beams connected at midspan by a very stiff link.
// Beam A: nodes 1(0,0) - 2(4,0) - 3(8,0)
// Beam B: nodes 4(0,1) - 5(4,1) - 6(8,1)
// Rigid link: element connecting nodes 2 and 5 (very stiff).
// Load P=-20 kN at node 2 only.
// Both beams should deflect similarly at midspan.

#[test]
fn validation_shear_lag_parallel_beams_equal_deflection() {
    let p = -20.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 4.0, 0.0), (3, 8.0, 0.0),  // beam A
        (4, 0.0, 1.0), (5, 4.0, 1.0), (6, 8.0, 1.0),  // beam B
    ];
    let mats = vec![(1, E, 0.3)];
    // Section 1: normal beam, Section 2: very stiff link
    let secs = vec![
        (1, A, IZ),
        (2, 1.0, 0.1), // rigid link: very large A and Iz
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // beam A left
        (2, "frame", 2, 3, 1, 1, false, false), // beam A right
        (3, "frame", 4, 5, 1, 1, false, false), // beam B left
        (4, "frame", 5, 6, 1, 1, false, false), // beam B right
        (5, "frame", 2, 5, 1, 2, false, false), // rigid link at midspan
    ];
    let sups = vec![
        (1, 1, "pinned"),
        (2, 3, "rollerX"),
        (3, 4, "pinned"),
        (4, 6, "rollerX"),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fz: p, my: 0.0,
    })];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let uy2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().uz;
    let uy5 = results.displacements.iter().find(|d| d.node_id == 5).unwrap().uz;

    // With rigid link both should deflect similarly
    let diff = (uy2 - uy5).abs();
    let max_disp = uy2.abs().max(uy5.abs());
    let rel_diff = diff / max_disp;
    assert!(rel_diff < 0.10,
        "Rigid link: uy2={:.6e}, uy5={:.6e}, rel_diff={:.2}%",
        uy2, uy5, rel_diff * 100.0);
}

// ================================================================
// 4. Load Sharing Between Parallel Beams
// ================================================================
//
// Same model as test 3. Total vertical reactions at beam A supports +
// beam B supports must equal total load P. Beam B (unloaded directly)
// carries some load through the rigid link. Verify beam B reactions
// are nonzero.

#[test]
fn validation_shear_lag_load_sharing_parallel_beams() {
    let p = -20.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 4.0, 0.0), (3, 8.0, 0.0),
        (4, 0.0, 1.0), (5, 4.0, 1.0), (6, 8.0, 1.0),
    ];
    let mats = vec![(1, E, 0.3)];
    let secs = vec![
        (1, A, IZ),
        (2, 1.0, 0.1),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 4, 5, 1, 1, false, false),
        (4, "frame", 5, 6, 1, 1, false, false),
        (5, "frame", 2, 5, 1, 2, false, false),
    ];
    let sups = vec![
        (1, 1, "pinned"),
        (2, 3, "rollerX"),
        (3, 4, "pinned"),
        (4, 6, "rollerX"),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fz: p, my: 0.0,
    })];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total vertical reactions
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    let equil_err = (sum_ry - p.abs()).abs() / p.abs();
    assert!(equil_err < 0.01,
        "Total vertical reaction={:.4}, applied load={:.4}", sum_ry, p.abs());

    // Beam B reactions (nodes 4 and 6) should be nonzero
    let ry4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap().rz;
    let ry6 = results.reactions.iter().find(|r| r.node_id == 6).unwrap().rz;
    let beam_b_total = ry4 + ry6;
    assert!(beam_b_total.abs() > 0.1,
        "Beam B should carry load through rigid link: R4={:.4}, R6={:.4}, total={:.4}",
        ry4, ry6, beam_b_total);
}

// ================================================================
// 5. Wide Flange vs Narrow Flange
// ================================================================
//
// Compare SS beam with Iz=2e-4 (wide flange) vs Iz=1e-4 (narrow flange).
// Same A, same load. Wide flange deflects less.
// Deflection ratio = Iz_narrow / Iz_wide = 0.5.

#[test]
fn validation_shear_lag_wide_vs_narrow_flange() {
    let l = 8.0;
    let n = 4;
    let q = -10.0;
    let iz_wide = 2e-4;
    let iz_narrow = 1e-4;

    let input_wide = make_ss_beam_udl(n, l, E, A, iz_wide, q);
    let res_wide = linear::solve_2d(&input_wide).unwrap();
    let mid = n / 2 + 1;
    let delta_wide = res_wide.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    let input_narrow = make_ss_beam_udl(n, l, E, A, iz_narrow, q);
    let res_narrow = linear::solve_2d(&input_narrow).unwrap();
    let delta_narrow = res_narrow.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Wide flange should deflect less
    assert!(delta_wide < delta_narrow,
        "Wide flange delta={:.6e} should be < narrow delta={:.6e}",
        delta_wide, delta_narrow);

    // Ratio = delta_wide / delta_narrow = Iz_narrow / Iz_wide = 0.5
    let ratio = delta_wide / delta_narrow;
    let expected = iz_narrow / iz_wide; // 0.5
    let err = (ratio - expected).abs() / expected;
    assert!(err < 0.02,
        "Deflection ratio: {:.4}, expected {:.4}, err={:.2}%",
        ratio, expected, err * 100.0);
}

// ================================================================
// 6. Reduced Section at Midspan Only
// ================================================================
//
// Beam with 4 elements. Elements 1,4 use Iz=1e-4.
// Elements 2,3 (midspan region) use Iz=0.7e-4.
// Compare with uniform Iz=1e-4. Midspan deflection increases.

#[test]
fn validation_shear_lag_reduced_section_midspan() {
    let l = 8.0;
    let n = 4;
    let q = -10.0;
    let elem_len = l / n as f64;

    // Uniform beam (reference)
    let input_uniform = make_ss_beam_udl(n, l, E, A, IZ, q);
    let res_uniform = linear::solve_2d(&input_uniform).unwrap();
    let mid = n / 2 + 1; // node 3
    let delta_uniform = res_uniform.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Non-uniform beam: elements 2,3 have reduced Iz
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, elem_len, 0.0),
        (3, 2.0 * elem_len, 0.0),
        (4, 3.0 * elem_len, 0.0),
        (5, 4.0 * elem_len, 0.0),
    ];
    let mats = vec![(1, E, 0.3)];
    let secs = vec![
        (1, A, IZ),       // full section for elements 1, 4
        (2, A, 0.7e-4),   // reduced section for elements 2, 3
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // full section
        (2, "frame", 2, 3, 1, 2, false, false), // reduced section
        (3, "frame", 3, 4, 1, 2, false, false), // reduced section
        (4, "frame", 4, 5, 1, 1, false, false), // full section
    ];
    let sups = vec![(1, 1, "pinned"), (2, 5, "rollerX")];
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input_red = make_input(nodes, mats, secs, elems, sups, loads);
    let res_red = linear::solve_2d(&input_red).unwrap();
    let delta_red = res_red.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Reduced midspan section should give larger deflection
    assert!(delta_red > delta_uniform,
        "Reduced midspan: delta_red={:.6e} should be > delta_uniform={:.6e}",
        delta_red, delta_uniform);

    // The increase should be meaningful (at least a few percent)
    let increase = (delta_red - delta_uniform) / delta_uniform;
    assert!(increase > 0.05,
        "Deflection increase should be >5%: got {:.2}%", increase * 100.0);
}

// ================================================================
// 7. Concentrated vs Distributed Flange Force (Cantilever Analogy)
// ================================================================
//
// Cantilever L=4m, 4 elements, tip load P=-10 kN.
// Moment at root: M = P*L = 40 kN-m (independent of shear lag).
// With reduced effective Iz, deflection increases:
//   delta_full = PL^3 / (3*E*Iz_full)
//   delta_eff  = PL^3 / (3*E*Iz_eff)
//   ratio = Iz_full / Iz_eff

#[test]
fn validation_shear_lag_cantilever_tip_load() {
    let l = 4.0;
    let n = 4;
    let p = -10.0;
    let iz_full = IZ;
    let iz_eff = 0.75e-4; // 75% effective width

    // Full section cantilever
    let input_full = make_beam(n, l, E, A, iz_full, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: p, my: 0.0,
        })]);
    let res_full = linear::solve_2d(&input_full).unwrap();
    let delta_full = res_full.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uz.abs();

    // Reduced section cantilever
    let input_eff = make_beam(n, l, E, A, iz_eff, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: p, my: 0.0,
        })]);
    let res_eff = linear::solve_2d(&input_eff).unwrap();
    let delta_eff = res_eff.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uz.abs();

    // Effective section deflects more
    assert!(delta_eff > delta_full,
        "Effective section: delta_eff={:.6e} should be > delta_full={:.6e}",
        delta_eff, delta_full);

    // Ratio should match Iz_full / Iz_eff
    let ratio = delta_eff / delta_full;
    let expected = iz_full / iz_eff;
    let err = (ratio - expected).abs() / expected;
    assert!(err < 0.02,
        "Deflection ratio: {:.4}, expected {:.4} (Iz_full/Iz_eff), err={:.2}%",
        ratio, expected, err * 100.0);

    // Root moment should be P*L = 40 kN-m for both (statically determinate)
    let m_full = res_full.reactions.iter().find(|r| r.node_id == 1).unwrap().my.abs();
    let m_eff = res_eff.reactions.iter().find(|r| r.node_id == 1).unwrap().my.abs();
    let m_exact = p.abs() * l;
    assert_close(m_full, m_exact, 0.01, "Root moment full");
    assert_close(m_eff, m_exact, 0.01, "Root moment effective");
}

// ================================================================
// 8. Effective Width Increases with Span (Span Scaling)
// ================================================================
//
// Two beams at different spans: L1=4m (short), L2=12m (long).
// Both have same reduced section ratio (Iz_eff/Iz = 0.8).
// Deflection increase factor = 1/0.8 = 1.25 (same for both, since
// the ratio is independent of span in a 1D model).
// Absolute deflections scale as L^4 for UDL SS beam:
//   delta_long / delta_short = (L2/L1)^4 = (12/4)^4 = 81.

#[test]
fn validation_shear_lag_span_scaling() {
    let l_short = 4.0;
    let l_long = 12.0;
    let n = 4;
    let q = -10.0;
    let iz_full = IZ;
    let iz_eff = 0.8e-4;

    // Short span - full section
    let input_sf = make_ss_beam_udl(n, l_short, E, A, iz_full, q);
    let res_sf = linear::solve_2d(&input_sf).unwrap();
    let mid = n / 2 + 1;
    let delta_sf = res_sf.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Short span - reduced section
    let input_sr = make_ss_beam_udl(n, l_short, E, A, iz_eff, q);
    let res_sr = linear::solve_2d(&input_sr).unwrap();
    let delta_sr = res_sr.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Long span - full section
    let input_lf = make_ss_beam_udl(n, l_long, E, A, iz_full, q);
    let res_lf = linear::solve_2d(&input_lf).unwrap();
    let delta_lf = res_lf.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Long span - reduced section
    let input_lr = make_ss_beam_udl(n, l_long, E, A, iz_eff, q);
    let res_lr = linear::solve_2d(&input_lr).unwrap();
    let delta_lr = res_lr.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Both spans: deflection ratio due to reduced section = 1.25
    let ratio_short = delta_sr / delta_sf;
    let ratio_long = delta_lr / delta_lf;
    let expected_ratio = iz_full / iz_eff; // 1.25

    assert_close(ratio_short, expected_ratio, 0.02, "Short span deflection ratio");
    assert_close(ratio_long, expected_ratio, 0.02, "Long span deflection ratio");

    // Span scaling: delta_long / delta_short = (L_long / L_short)^4 = 81
    // (for same section properties; use the full section beams)
    let span_ratio = delta_lf / delta_sf;
    let expected_span_ratio = (l_long / l_short).powi(4); // 81.0
    let span_err = (span_ratio - expected_span_ratio).abs() / expected_span_ratio;
    assert!(span_err < 0.02,
        "Span scaling: delta_long/delta_short={:.2}, expected {:.1}, err={:.2}%",
        span_ratio, expected_span_ratio, span_err * 100.0);
}
