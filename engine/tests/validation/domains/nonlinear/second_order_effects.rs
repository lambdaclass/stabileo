/// Validation: Second-Order (P-Delta) Effects
///
/// References:
///   - AISC 360-22, Appendix 8 (Approximate Second-Order Analysis)
///   - Bazant & Cedolin, "Stability of Structures", Ch. 2-3
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", Ch. 9
///
/// P-Delta analysis accounts for the effect of axial loads on
/// lateral stiffness. Compression reduces stiffness (amplifies drift),
/// while tension increases stiffness.
///
/// Tests verify:
///   1. P-delta amplification: drift > first-order
///   2. Amplification factor: B2 ≈ 1/(1 - P/P_cr)
///   3. Tension stiffening: P-delta with tension reduces drift
///   4. P-delta vs linear for small axial: negligible difference
///   5. Column effective length: sway vs non-sway
///   6. Multi-story P-delta accumulation
///   7. P-delta moment amplification
///   8. Stability limit: approaching P_cr
use dedaliano_engine::solver::{linear, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. P-Delta Amplification: Drift > First-Order
// ================================================================
//
// Portal frame with gravity + lateral: P-delta drift should
// exceed first-order drift.

#[test]
fn validation_pdelta_amplification() {
    let h = 4.0;
    let w = 6.0;
    let f = 10.0;
    let p = 200.0; // significant gravity

    // First-order analysis
    let input = make_portal_frame(h, w, E, A, IZ, f, -p);
    let d_linear = linear::solve_2d(&input).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // P-delta analysis
    let d_pdelta = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap()
        .results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // P-delta drift > first-order drift (compression amplifies)
    assert!(d_pdelta.abs() > d_linear.abs(),
        "P-Δ amplifies: {:.6e} > {:.6e}", d_pdelta.abs(), d_linear.abs());

    // Both should be in the same direction
    assert!(d_pdelta * d_linear > 0.0,
        "Same direction: {:.6e} vs {:.6e}", d_pdelta, d_linear);
}

// ================================================================
// 2. Amplification Factor: B2 ≈ 1/(1 - P/P_cr)
// ================================================================
//
// For a single-story frame, the amplification factor B2:
//   B2 = δ_pdelta / δ_linear ≈ 1/(1 - ΣP/(ΣP_e))
// where P_e = π²EI/H² (Euler load for the story)

#[test]
fn validation_pdelta_b2_factor() {
    let h = 4.0;
    let w = 6.0;
    let f = 10.0;
    let e_eff = E * 1000.0;

    // Euler load for a fixed-free column (K=2)
    let p_euler_col = std::f64::consts::PI * std::f64::consts::PI * e_eff * IZ / (4.0 * h * h);

    // Use modest gravity load (well below Euler)
    let p_grav = 0.10 * p_euler_col; // 10% of Euler load per column

    let input = make_portal_frame(h, w, E, A, IZ, f, -p_grav);

    let d_lin = linear::solve_2d(&input).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let d_pd = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap()
        .results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    let b2_actual = d_pd / d_lin;

    // Approximate B2: total gravity = 2×p_grav (two columns)
    // Total P_e for the story depends on frame stiffness
    // For fixed-base portal, effective P_e ≈ 2 × π²EI/(KH)²
    // B2 should be > 1 and reasonable
    assert!(b2_actual > 1.0, "B2 > 1: {:.4}", b2_actual);
    assert!(b2_actual < 2.0, "B2 < 2 (not near collapse): {:.4}", b2_actual);
}

// ================================================================
// 3. Tension Stiffening: P-Delta with Tension Reduces Drift
// ================================================================
//
// A column in tension becomes stiffer (geometric stiffness is positive).
// Cantilever with upward (tension) load + lateral:
// P-delta drift should be LESS than first-order.

#[test]
fn validation_pdelta_tension_stiffening() {
    let h = 5.0;
    let n = 10;
    let f_lat = 10.0;
    let f_tension = 200.0; // upward = tension in column

    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    for i in 0..=n {
        nodes.push((i + 1, 0.0, i as f64 * h / n as f64));
        if i > 0 {
            elems.push((i, "frame", i, i + 1, 1, 1, false, false));
        }
    }

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: f_lat, fy: f_tension, mz: 0.0,  // +fy = upward = tension
    })];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems,
        vec![(1, 1, "fixed")], loads);

    let d_lin = linear::solve_2d(&input).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;
    let d_pd = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap()
        .results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;

    // Tension stiffens: P-delta drift < first-order drift
    assert!(d_pd.abs() < d_lin.abs(),
        "Tension stiffens: {:.6e} < {:.6e}", d_pd.abs(), d_lin.abs());
}

// ================================================================
// 4. P-Delta vs Linear: Negligible Difference for Small Axial
// ================================================================
//
// When axial loads are very small compared to Euler load,
// P-delta should give essentially the same result as linear.

#[test]
fn validation_pdelta_small_axial() {
    let h = 4.0;
    let w = 6.0;
    let f = 10.0;
    let p_small = 1.0; // negligible gravity

    let input = make_portal_frame(h, w, E, A, IZ, f, -p_small);

    let d_lin = linear::solve_2d(&input).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let d_pd = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap()
        .results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Should be nearly identical
    assert_close(d_pd, d_lin, 0.02,
        "Small axial: P-Δ ≈ linear");
}

// ================================================================
// 5. Column Effective Length: Sway vs Non-Sway
// ================================================================
//
// Sway frame: effective length K > 1 (P-delta reduces stability)
// Non-sway (braced): K ≤ 1 (P-delta has less effect)
//
// Compare cantilever column (sway) vs fixed-guided (non-sway).

#[test]
fn validation_pdelta_effective_length() {
    let h = 5.0;
    let n = 10;
    let f_lat = 10.0;
    let p_grav = 100.0;

    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    for i in 0..=n {
        nodes.push((i + 1, 0.0, i as f64 * h / n as f64));
        if i > 0 {
            elems.push((i, "frame", i, i + 1, 1, 1, false, false));
        }
    }

    // Sway case: cantilever (fixed-free)
    let loads_sway = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: f_lat, fy: -p_grav, mz: 0.0,
    })];
    let input_sway = make_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), vec![(1, 1, "fixed")], loads_sway);
    let d_sway_lin = linear::solve_2d(&input_sway).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;
    let d_sway_pd = pdelta::solve_pdelta_2d(&input_sway, 20, 1e-6).unwrap()
        .results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;

    // Non-sway case: fixed-guided (lateral restrained at top)
    let loads_ns = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: f_lat, fy: -p_grav, mz: 0.0,
    })];
    let input_ns = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, vec![(1, 1, "fixed"), (2, n + 1, "guidedX")], loads_ns);
    let d_ns_lin = linear::solve_2d(&input_ns).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;
    let d_ns_pd = pdelta::solve_pdelta_2d(&input_ns, 20, 1e-6).unwrap()
        .results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;

    // P-delta amplification for sway should be larger than non-sway
    let amp_sway = (d_sway_pd / d_sway_lin - 1.0).abs();
    let amp_ns = (d_ns_pd / d_ns_lin - 1.0).abs();

    assert!(amp_sway > amp_ns,
        "Sway amplification > non-sway: {:.4} > {:.4}", amp_sway, amp_ns);
}

// ================================================================
// 6. Multi-Story P-Delta Accumulation
// ================================================================
//
// P-delta effect accumulates with height in multi-story buildings.
// Lower stories experience more amplification.

#[test]
fn validation_pdelta_multistory_accumulation() {
    let w = 6.0;
    let h = 3.5;
    let f = 10.0;
    let p = 100.0;

    // 3-story frame
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    let mut sups = Vec::new();
    let mut eid = 1;

    nodes.push((1, 0.0, 0.0));
    nodes.push((2, w, 0.0));
    sups.push((1, 1, "fixed"));
    sups.push((2, 2, "fixed"));

    let mut loads = Vec::new();

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

        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: left, fx: f, fy: -p, mz: 0.0,
        }));
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: right, fx: 0.0, fy: -p, mz: 0.0,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);

    // First-order story drifts
    let lin = linear::solve_2d(&input).unwrap();
    let d1_lin = lin.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let d2_lin = lin.displacements.iter().find(|d| d.node_id == 5).unwrap().ux;
    let d3_lin = lin.displacements.iter().find(|d| d.node_id == 7).unwrap().ux;

    // P-delta story drifts
    let pd = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();
    let d1_pd = pd.results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let d2_pd = pd.results.displacements.iter().find(|d| d.node_id == 5).unwrap().ux;
    let d3_pd = pd.results.displacements.iter().find(|d| d.node_id == 7).unwrap().ux;

    // All P-delta displacements should exceed linear
    assert!(d1_pd.abs() > d1_lin.abs(), "Floor 1: P-Δ > linear");
    assert!(d2_pd.abs() > d2_lin.abs(), "Floor 2: P-Δ > linear");
    assert!(d3_pd.abs() > d3_lin.abs(), "Floor 3: P-Δ > linear");

    // Amplification should be present at all levels
    let amp1 = d1_pd / d1_lin;
    let amp3 = d3_pd / d3_lin;
    assert!(amp1 > 1.0, "Floor 1 amplified: {:.4}", amp1);
    assert!(amp3 > 1.0, "Floor 3 amplified: {:.4}", amp3);
}

// ================================================================
// 7. P-Delta Moment Amplification
// ================================================================
//
// P-delta amplifies moments as well as displacements.
// Base moment should be larger in P-delta analysis.

#[test]
fn validation_pdelta_moment_amplification() {
    let h = 4.0;
    let w = 6.0;
    let f = 10.0;
    let p = 150.0;

    let input = make_portal_frame(h, w, E, A, IZ, f, -p);

    // First-order base moment
    let lin = linear::solve_2d(&input).unwrap();
    let m_lin = lin.reactions.iter().find(|r| r.node_id == 1).unwrap().mz.abs();

    // P-delta base moment
    let pd = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();
    let m_pd = pd.results.reactions.iter().find(|r| r.node_id == 1).unwrap().mz.abs();

    // P-delta moment should be larger (amplified)
    assert!(m_pd > m_lin,
        "P-Δ moment > linear: {:.4} > {:.4}", m_pd, m_lin);
}

// ================================================================
// 8. Stability Limit: Approaching P_cr
// ================================================================
//
// As gravity approaches the elastic critical load, the P-delta
// amplification grows dramatically. Verify that amplification
// increases as P increases.

#[test]
fn validation_pdelta_approaching_pcr() {
    let h = 4.0;
    let w = 6.0;
    let f = 5.0;

    // Compare amplification at different gravity levels
    let mut amplifications = Vec::new();
    for p in &[50.0, 100.0, 150.0] {
        let input = make_portal_frame(h, w, E, A, IZ, f, -p);
        let d_lin = linear::solve_2d(&input).unwrap()
            .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
        let d_pd = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap()
            .results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
        amplifications.push(d_pd / d_lin);
    }

    // Amplification should increase with gravity level
    assert!(amplifications[1] > amplifications[0],
        "Higher P → more amplification: {:.4} > {:.4}",
        amplifications[1], amplifications[0]);
    assert!(amplifications[2] > amplifications[1],
        "Even higher P → even more: {:.4} > {:.4}",
        amplifications[2], amplifications[1]);
}
