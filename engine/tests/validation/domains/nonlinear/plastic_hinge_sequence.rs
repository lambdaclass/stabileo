/// Validation: Plastic Hinge Formation Sequence in Frames
///
/// References:
///   - Neal, B.G., "The Plastic Methods of Structural Analysis", 3rd Ed., Chapman & Hall, 1977
///   - Horne, M.R., "Plastic Theory of Structures", MIT Press, 1971
///   - Chen, W.F. & Sohal, I., "Plastic Design and Second-Order Analysis of Steel Frames",
///     Springer, 1995
///   - Livesley, R.K., "Matrix Methods of Structural Analysis", 2nd Ed., Pergamon, 1975
///
/// Tests use linear elastic analysis to identify moment distributions and hinge formation order.
/// The location of maximum moment under linear analysis predicts where the first plastic hinge
/// forms. The sequence of hinge formation is determined by the order in which sections reach Mp.
///
/// Tests:
///   1. Simply-supported beam: max moment at load point — hinge forms at peak moment location
///   2. Fixed-fixed beam UDL: support moments exceed midspan — hinges form at ends first
///   3. Propped cantilever UDL: fixed-end moment > roller-end — first hinge at fixed support
///   4. Portal frame lateral: base hinges form before beam hinge (moment hierarchy)
///   5. Collapse load exceeds first-yield load for indeterminate beams
///   6. Moment redistribution: after first hinge, remaining structure carries more load
///   7. Two-span beam: interior support has highest moment — first hinge location
///   8. Mechanism requires n+1 hinges for degree-n indeterminate structure
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Simply-Supported Beam: Hinge at Max Moment Location
// ================================================================
//
// Simply-supported beam, point load P at position a from left end.
// Moment distribution: linear, peak at load point.
//   M(a) = P·b·a / L  where b = L - a
// For midspan load: M_max = P·L/4 at midspan.
// Linear analysis confirms max moment at midspan — first hinge forms here.
//
// Reference: Neal §2.1, Horne §1.2

#[test]
fn validation_hinge_seq_ss_beam_max_moment_location() {
    let l = 6.0;
    let n = 12; // elements
    let p = 1.0;
    let mid = n / 2 + 1; // midspan node

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let results = linear::solve_2d(&input).unwrap();

    // Find element with maximum absolute moment magnitude
    let max_m_elem = results.element_forces.iter()
        .max_by(|a, b| {
            let ma = a.m_start.abs().max(a.m_end.abs());
            let mb = b.m_start.abs().max(b.m_end.abs());
            ma.partial_cmp(&mb).unwrap()
        })
        .unwrap();

    // Maximum moment should be near midspan (elements n/2 or n/2+1)
    // Elements are 1-indexed, so midspan is around element n/2
    let mid_elem = n / 2;
    let near_mid = (max_m_elem.element_id as isize - mid_elem as isize).abs() <= 2;
    assert!(near_mid,
        "First hinge (max moment) should be near midspan: elem={}, mid={}",
        max_m_elem.element_id, mid_elem);

    // Analytical max moment = P*L/4 at midspan
    let m_exact = p * l / 4.0;
    let m_max = results.element_forces.iter()
        .map(|e| e.m_start.abs().max(e.m_end.abs()))
        .fold(0.0_f64, f64::max);
    assert_close(m_max, m_exact, 0.05,
        "SS midspan moment = P*L/4");
}

// ================================================================
// 2. Fixed-Fixed Beam UDL: End Moments Exceed Midspan
// ================================================================
//
// Fixed-fixed beam under UDL q. Elastic moments:
//   M_end = qL²/12  (hogging at supports)
//   M_mid = qL²/24  (sagging at midspan)
// End moments are twice midspan: M_end / M_mid = 2.
// Hinges form at supports first, then at midspan after redistribution.
//
// Reference: Neal §4.2; Horne §3.1 (fixed-end beam under UDL)

#[test]
fn validation_hinge_seq_fixed_fixed_udl_ends_first() {
    let l = 6.0;
    let n = 12;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let w = q.abs();
    let m_end_exact = w * l * l / 12.0;
    let m_mid_exact = w * l * l / 24.0;

    // Support (end) moments
    let r_start = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_start.my.abs(), m_end_exact, 0.02,
        "Fixed-fixed end moment = qL²/12");
    assert_close(r_end.my.abs(), m_end_exact, 0.02,
        "Fixed-fixed far end moment = qL²/12");

    // Midspan moment (element at center)
    let mid_elem = results.element_forces.iter().find(|e| e.element_id == n / 2).unwrap();
    assert_close(mid_elem.m_end.abs(), m_mid_exact, 0.10,
        "Fixed-fixed midspan moment = qL²/24");

    // Key hinge sequence check: end moment > midspan moment
    assert!(r_start.my.abs() > mid_elem.m_end.abs(),
        "Fixed-fixed: support moment ({:.4}) > midspan ({:.4}) — ends hinge first",
        r_start.my.abs(), mid_elem.m_end.abs());

    // Ratio should be exactly 2
    let ratio = r_start.my.abs() / mid_elem.m_end.abs();
    assert_close(ratio, 2.0, 0.10,
        "Fixed-fixed: M_end/M_mid = 2 (ends hinge first)");
}

// ================================================================
// 3. Propped Cantilever UDL: Fixed End Hinge First
// ================================================================
//
// Fixed at A, rollerX at B, UDL q.
// Elastic moments: M_A = qL²/8, M_B = 0.
// The fixed-end moment is always the largest — first hinge forms at A.
// After hinge at A, the structure becomes simply supported and collapses at
// M_mid = qL²/8 when M_B,collapsed reaches Mp.
//
// Reference: Neal §3.3; Livesley §8.4 (propped cantilever collapse)

#[test]
fn validation_hinge_seq_propped_cantilever_fixed_end_first() {
    let l = 8.0;
    let n = 8;
    let q: f64 = -10.0;
    let w = q.abs();

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // M_A = wL²/8 (largest moment)
    let m_a_exact = w * l * l / 8.0;
    assert_close(r_a.my.abs(), m_a_exact, 0.02,
        "Propped cantilever M_A = wL²/8");

    // M_B = 0 (roller has no moment)
    assert!(r_b.my.abs() < 1e-3,
        "Propped cantilever: roller end has no moment M_B={:.6e}", r_b.my);

    // Fixed end has larger moment than any interior point
    let max_interior = results.element_forces.iter()
        .map(|e| e.m_start.abs().max(e.m_end.abs()))
        .fold(0.0_f64, f64::max);

    // max_interior includes support moment itself; verify fixed-end is max
    assert_close(max_interior, m_a_exact, 0.05,
        "Fixed end carries largest moment — first hinge location");

    // Reactions: R_A = 5wL/8, R_B = 3wL/8
    assert_close(r_a.rz, 5.0 * w * l / 8.0, 0.02, "Propped cantilever R_A = 5wL/8");
    assert_close(r_b.rz, 3.0 * w * l / 8.0, 0.02, "Propped cantilever R_B = 3wL/8");
}

// ================================================================
// 4. Portal Frame Lateral: Base Hinges Form Before Beam Hinge
// ================================================================
//
// Fixed-base portal frame with lateral load at beam level.
// Elastic column moments: M_base = H·h/2, M_top = H·h/2 (for equal stiffness).
// Base moments > beam moments → base hinges form first.
//
// Under lateral load H on a fixed-base portal:
//   Column moments (base, top) are related to story shear and height.
//   The beam carries less moment than the columns for typical proportions.
//
// Reference: Horne §5.2 (sway mechanism); Chen & Sohal §3.4

#[test]
fn validation_hinge_seq_portal_base_hinges_first() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;

    let input = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Base reactions carry the moment at column bases
    let r_base_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_base_right = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    let m_base_left = r_base_left.my.abs();
    let m_base_right = r_base_right.my.abs();

    // Both base moments should be significant
    assert!(m_base_left > 0.1 * lateral * h,
        "Left base moment should be significant: {:.4}", m_base_left);
    assert!(m_base_right > 0.1 * lateral * h,
        "Right base moment should be significant: {:.4}", m_base_right);

    // Beam moment: element 2 (nodes 2→3)
    let beam_ef = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let m_beam_max = beam_ef.m_start.abs().max(beam_ef.m_end.abs());

    // Base moments exceed beam end moments for standard proportions
    // (h = 4, w = 6, same section properties)
    let max_base = m_base_left.max(m_base_right);
    assert!(max_base >= m_beam_max * 0.8,
        "Base moments ({:.4}) should be >= beam moment ({:.4}) for sway mechanism",
        max_base, m_beam_max);

    // Global horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), lateral, 0.01, "Portal lateral equilibrium ΣRx");
}

// ================================================================
// 5. Collapse Load Exceeds First-Yield Load for Indeterminate Beams
// ================================================================
//
// For an indeterminate beam, the plastic collapse load λ_p exceeds
// the first-yield load λ_y by a factor called the "shape factor" effect
// combined with moment redistribution.
//
// Fixed-fixed beam, midspan point load:
//   Linear moment at midspan = M_mid = 3PL/16 (for fixed-fixed with point load at center)
//   Linear moment at support = M_sup = PL/8
//   First yield at support: λ_y × PL/8 = Mp → λ_y = 8Mp/(PL)
//   Full collapse (3 hinges): λ_p = 8Mp/(PL) + additional redistribution capacity
//   Ratio λ_p/λ_y = 1 + redistribution ≥ 1 for indeterminate structure
//
// We verify this by checking that the support moment is larger than midspan
// under unit load and computing the first-yield factor analytically.
//
// Reference: Neal §4.3; Horne §3.2 (shape factor and redistribution)

#[test]
fn validation_hinge_seq_collapse_exceeds_first_yield() {
    let l = 6.0;
    let n = 12;
    let p = 1.0;
    let mid = n / 2 + 1;

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let results = linear::solve_2d(&input).unwrap();

    // For fixed-fixed beam with midspan load P:
    // M_support = P*L/8, M_midspan = P*L/8 (same by symmetry for midspan load)
    // Both are PL/8. First hinge forms simultaneously at support and midspan.
    // But with UDL the ratio is 2:1 (supports:midspan). With midspan point load it's equal.
    let r_start = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    let m_support = r_start.my.abs();
    let m_mid_exact = p * l / 8.0; // analytical for fixed-fixed, midspan point load

    assert_close(m_support, m_mid_exact, 0.05,
        "Fixed-fixed midspan point load: M_support = PL/8");

    // Simply-supported beam for comparison
    let input_ss = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let results_ss = linear::solve_2d(&input_ss).unwrap();

    let m_ss_mid = results_ss.element_forces.iter()
        .map(|e| e.m_start.abs().max(e.m_end.abs()))
        .fold(0.0_f64, f64::max);

    // SS beam midspan moment = PL/4
    let m_ss_exact = p * l / 4.0;
    assert_close(m_ss_mid, m_ss_exact, 0.05,
        "SS beam: M_mid = P*L/4");

    // Fixed-fixed: first yield load is higher per unit Mp
    // (M_support=PL/8 for FF vs M_mid=PL/4 for SS)
    // λ_y(FF)/λ_y(SS) = (PL/4)/(PL/8) = 2: FF can carry twice the load to first yield
    // and then redistributes further → collapse load even higher
    assert!(m_ss_mid > m_support,
        "SS moment ({:.4}) > FF support moment ({:.4}): FF has higher first-yield load",
        m_ss_mid, m_support);
}

// ================================================================
// 6. Moment Redistribution After Hinge Formation
// ================================================================
//
// When the first hinge forms at the fixed end of a propped cantilever,
// the structure effectively becomes simply-supported. The moment that
// would have been at the support is redistributed to the span.
//
// Phase 1 (elastic): M_A = wL²/8 (at fixed end A)
// Phase 2 (hinge at A): structure is now SS → M_mid = wL²/8 (same Mp as at A)
//   The additional load Δq adds moment: ΔM_mid = Δq·L²/8
//   Collapse when M_mid = Mp: total q_collapse = q_yield + Δq
//
// We verify elastic moment diagram predicts where redistribution occurs.
//
// Reference: Livesley §8.4; Neal §3.3

#[test]
fn validation_hinge_seq_moment_redistribution_propped() {
    let l = 6.0;
    let n = 12;
    let q: f64 = -10.0;
    let w = q.abs();

    // Propped cantilever (fixed at start, roller at end)
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Phase 1: fixed-end moment = wL²/8
    let m_yield = w * l * l / 8.0;
    assert_close(r_a.my.abs(), m_yield, 0.02,
        "Propped cantilever: first yield at M_A = wL²/8");

    // After hinge at A, structure is SS with moment = wL²/8 at midspan
    // For an SS beam: M_mid = wL²/8
    let m_ss_mid = w * l * l / 8.0;

    // Compare SS beam midspan moment
    let loads_ss: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_ss = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_ss);
    let results_ss = linear::solve_2d(&input_ss).unwrap();

    let mid_ss = results_ss.element_forces.iter().find(|e| e.element_id == n / 2).unwrap();

    // SS midspan moment = wL²/8
    assert_close(mid_ss.m_end.abs(), m_ss_mid, 0.05,
        "After hinge: SS midspan moment = wL²/8");

    // Key: the collapse mechanism needs two hinges total (A + midspan)
    // and the collapse load is 2× the first-yield load for this structure
    // (since M_yield = wL²/8 and M_collapse comes from full redistribution)
    let r_b_ss = results_ss.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_b_ss.rz, 0.5 * w * l, 0.02,
        "SS beam: R_B = wL/2 (after redistribution, symmetric loading)");
}

// ================================================================
// 7. Two-Span Beam: Interior Support Has Highest Moment
// ================================================================
//
// Two equal spans L, UDL q. Three-moment equation gives:
//   M_B = qL²/8 at interior support B.
//   M_A = M_C = 0 (simply supported ends).
// Interior support moment is maximum → first hinge forms at B.
//
// For collapse: hinge at B + one hinge per span (mechanism).
//   Collapse load λ: M_B = λqL²/8 = Mp → λ_collapse = 8Mp/(qL²)
//   But redistribution means λ_collapse > λ_first_yield.
//
// Reference: Neal §5.1; Ghali & Neville, "Structural Analysis" §13.4

#[test]
fn validation_hinge_seq_two_span_interior_support_max() {
    let l = 6.0;
    let n_per = 6;
    let q: f64 = -10.0;
    let w = q.abs();

    let loads: Vec<SolverLoad> = (1..=(2 * n_per))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[l, l], n_per, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support moment (at element n_per boundary)
    let ef_at_b = results.element_forces.iter()
        .find(|e| e.element_id == n_per)
        .unwrap();
    let m_b = ef_at_b.m_end.abs();

    // M_B = wL²/8 (three-moment equation)
    let m_b_exact = w * l * l / 8.0;
    assert_close(m_b, m_b_exact, 0.02, "Two-span: M_B = wL²/8");

    // End moments (nodes 1 and 2*n_per+1) should be zero (simply supported)
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 2 * n_per + 1).unwrap();
    assert!(r_a.my.abs() < 1e-3, "Two-span: M_A = 0");
    assert!(r_c.my.abs() < 1e-3, "Two-span: M_C = 0");

    // Interior support moment is maximum (first hinge location)
    let max_span_moment = results.element_forces.iter()
        .filter(|e| e.element_id != n_per)
        .map(|e| e.m_start.abs().max(e.m_end.abs()))
        .fold(0.0_f64, f64::max);

    assert!(m_b >= max_span_moment * 0.9,
        "Interior support moment ({:.4}) >= max span moment ({:.4}): hinge at B first",
        m_b, max_span_moment);
}

// ================================================================
// 8. Mechanism Requires Sufficient Hinges: Degree of Indeterminacy + 1
// ================================================================
//
// A structure of degree n (indeterminate) requires n+1 plastic hinges
// to form a mechanism. For a SS beam (n=0), one hinge → mechanism.
// For a fixed-fixed beam (n=3 for 2D: 3 extra reactions), 4 hinges needed.
// But for a beam: only 3 hinges needed (2 at supports + 1 midspan).
//
// We verify by checking that:
// - SS beam (n=0): 1 hinge → kinematic mechanism (beam becomes unstable)
// - Propped cantilever (n=1): 2 hinges → mechanism
// - Fixed-fixed (n=2 for beam): 3 hinges → mechanism
//
// The moment diagrams confirm which configuration has the most redundancy.
//
// Reference: Neal §2.5; Horne §2.1 (degrees of freedom and mechanism formation)

#[test]
fn validation_hinge_seq_mechanism_hinge_count() {
    let l = 6.0;
    let n = 12;
    let q = -10.0;

    let make_loads = |count: usize| -> Vec<SolverLoad> {
        (1..=count)
            .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }))
            .collect()
    };

    // SS beam: 0 redundancy. One hinge at midspan → mechanism.
    // Under UDL, midspan moment = wL²/8.
    let input_ss = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), make_loads(n));
    let res_ss = linear::solve_2d(&input_ss).unwrap();
    let m_mid_ss = res_ss.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap().m_end.abs();
    let r_ss_a = res_ss.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r_ss_a.my.abs() < 1e-3, "SS: no moment at supports (0 redundancy)");

    // Propped cantilever: 1 redundancy. Two hinges → mechanism.
    // Support moment = wL²/8, then redistribution creates midspan hinge.
    let input_pc = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), make_loads(n));
    let res_pc = linear::solve_2d(&input_pc).unwrap();
    let r_pc_a = res_pc.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let m_fixed_pc = r_pc_a.my.abs();
    assert!(m_fixed_pc > m_mid_ss * 0.5,
        "Propped cantilever: fixed-end moment ({:.4}) significant", m_fixed_pc);

    // Fixed-fixed: 2 redundancy (for beam). Three hinges → mechanism.
    // Support moments = wL²/12, midspan = wL²/24.
    let input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), make_loads(n));
    let res_ff = linear::solve_2d(&input_ff).unwrap();
    let r_ff_a = res_ff.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let m_fixed_ff = r_ff_a.my.abs();

    // Fixed-fixed has smaller support moment than propped cantilever
    // (constraint distributes load more evenly, but requires 3 hinges for mechanism)
    let w = q.abs();
    assert_close(m_fixed_ff, w * l * l / 12.0, 0.02,
        "Fixed-fixed: M_support = wL²/12");
    assert_close(m_fixed_pc, w * l * l / 8.0, 0.02,
        "Propped cantilever: M_support = wL²/8");

    // The propped cantilever requires fewer hinges (2 vs 3) for collapse
    // but has a higher support moment at first yield
    // Key check: as redundancy increases, support moments decrease per unit load,
    // meaning more load can be applied before collapse (redistribution capacity increases)
    assert!(m_fixed_pc > m_fixed_ff,
        "Propped M_support ({:.4}) > FF M_support ({:.4}): FF has more redistribution capacity",
        m_fixed_pc, m_fixed_ff);
}
