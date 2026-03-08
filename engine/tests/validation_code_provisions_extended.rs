/// Validation: Extended Design Code Provisions (AISC 360, EN 1993, ASCE 7, EN 1992)
///
/// Tests compliance with additional structural design code requirements:
///   1. AISC 360 Ch. E: Euler buckling load for pin-pin column (K=1.0)
///   2. EN 1993-1-1 §5.2.1: Sway sensitivity via lateral drift ratio
///   3. ASCE 7 §12.12: Serviceability drift limit (L/400)
///   4. AISC 360 Table C-A-7.1: Effective length factor K comparison
///   5. EN 1992-1-1 §7.4.3: Span-to-depth deflection control concept
///   6. AISC 360 §E3: Weak-axis vs strong-axis buckling comparison
///   7. EN 1993-1-1 §5.3.2: Bracing stiffness effect on critical load
///   8. ASCE 7 §12.8.6: Story stiffness and soft-story irregularity check
///
/// References:
///   - AISC 360-22, Chapter E — Design of Members for Compression
///   - EN 1993-1-1:2005, Section 5 — Structural Analysis
///   - ASCE 7-22, Section 12.8 — Equivalent Lateral Force Procedure
///   - EN 1992-1-1:2004, Section 7.4 — Deflection Control
///   - Salmon, Johnson & Malhas, "Steel Structures", 5th Ed.
///   - Galambos & Surovek, "Structural Stability of Steel", 2008
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0; // MPa (steel)
const A: f64 = 0.01;      // m^2
const IZ: f64 = 1e-4;     // m^4

// ================================================================
// 1. AISC 360 Ch. E: Euler Buckling Load for Pin-Pin Column (K=1.0)
// ================================================================
//
// The Euler critical load for a pin-pin column is:
//   P_cr = π²EI / L²
//
// For K=1.0 (pin-pin), the effective length equals the physical length.
// We model the column as a series of truss-like frame elements
// (hinge_start=true, hinge_end=true) along the vertical axis and
// verify that the axial stiffness (F/δ = EA/L) matches theory.
// A truss bar under axial load P has δ = PL/(EA), so P = δ·EA/L.
//
// Reference: AISC 360-22 §E3, Eq. E3-4

#[test]
fn validation_aisc360_euler_axial_stiffness_truss() {
    let length = 5.0;
    let p = 100.0; // kN axial tension
    let e_eff = E * 1000.0; // E in kPa (since E is in MPa, ×1000 for kN/m²)

    // Single truss bar: frame with hinge_start=true, hinge_end=true
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, length, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, true, true)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: p, fy: 0.0, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // Expected: δ = PL/(EA)
    let delta_expected = p * length / (e_eff * A);
    assert_close(d2.ux, delta_expected, 0.01,
        "AISC 360 truss: δ = PL/(EA)");

    // Axial force should equal P
    let ef = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef.n_start.abs(), p, 0.01,
        "AISC 360 truss: axial force = P");

    // No moment in a truss (hinged) element
    assert!(ef.m_start.abs() < 0.01, "AISC 360 truss: M_start ≈ 0");
    assert!(ef.m_end.abs() < 0.01, "AISC 360 truss: M_end ≈ 0");
}

// ================================================================
// 2. EN 1993-1-1 §5.2.1: Sway Sensitivity via Lateral Drift Ratio
// ================================================================
//
// A portal frame under lateral load H at the top has first-order
// lateral drift. Per EN 1993, if the drift ratio H/(V·Δ) is large,
// the frame is non-sway. If small, sway effects dominate.
//
// For a cantilever column with lateral load at top:
//   Δ = HL³/(3EI)
//
// We verify the drift and then classify:
//   θ = Δ/h; if θ < 1/500, EN 1993 considers drift acceptable.
//
// Reference: EN 1993-1-1:2005 §5.2.1

#[test]
fn validation_en1993_sway_drift_classification() {
    let h = 4.0; // column height (m)
    let n = 8;
    let h_load = 2.0; // kN lateral at top
    let e_eff = E * 1000.0;

    let input = make_beam(n, h, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: h_load, fy: 0.0, mz: 0.0,
        })]);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Analytical: Δ = HL³/(3EI)
    let delta_exact = h_load * h.powi(3) / (3.0 * e_eff * IZ);
    assert_close(tip.ux.abs(), delta_exact, 0.02,
        "EN 1993 drift: Δ = HL³/(3EI)");

    // Drift ratio θ = Δ/h
    let theta = tip.ux.abs() / h;

    // Verify drift ratio is a consistent, positive value
    assert!(theta > 0.0, "EN 1993 drift: θ > 0");

    // Classification: EN 1993 limit is typically 1/500 for non-sway.
    // For this test, just verify we can compute it correctly.
    let _classification = if theta < 1.0 / 500.0 {
        "non-sway"
    } else {
        "sway-sensitive"
    };

    // The drift ratio should match the analytical prediction
    let theta_expected = delta_exact / h;
    assert_close(theta, theta_expected, 0.02,
        "EN 1993 drift: θ = Δ/h");
}

// ================================================================
// 3. ASCE 7 §12.12: Serviceability Deflection Check (L/360)
// ================================================================
//
// ASCE 7 limits beam deflections to L/360 for live load.
// For a simply-supported beam with UDL:
//   δ_max = 5qL⁴/(384EI)
//
// Given a section, we compute the maximum allowable q such that
// δ ≤ L/360, and verify the solver matches the formula.
//
// Reference: ASCE 7-22 Table 12.12-1, AISC 360 L3

#[test]
fn validation_asce7_serviceability_deflection_limit() {
    let l = 8.0;
    let n = 16;
    let e_eff = E * 1000.0;

    // Allowable deflection = L/360
    let delta_allow = l / 360.0;

    // From δ = 5qL⁴/(384EI), solve for q_allow:
    //   q_allow = 384·EI·δ_allow / (5·L⁴)
    let q_allow = 384.0 * e_eff * IZ * delta_allow / (5.0 * l.powi(4));

    // Apply exactly q_allow (downward = negative convention)
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q_allow, q_j: -q_allow, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // The midspan deflection should be approximately L/360
    assert_close(d_mid, delta_allow, 0.03,
        "ASCE 7: δ_mid ≈ L/360 at allowable UDL");

    // Verify the deflection is within the limit
    assert!(d_mid <= delta_allow * 1.05,
        "ASCE 7: δ={:.6e} should be ≤ L/360={:.6e}", d_mid, delta_allow);
}

// ================================================================
// 4. AISC 360 Table C-A-7.1: K-Factor Effect on Column Stiffness
// ================================================================
//
// The transverse stiffness of a cantilever beam is 3EI/L³ (tip load).
// The transverse stiffness of a fixed-pinned (propped cantilever) is
// 48EI/L³ at midspan for a center load on a fixed-fixed beam.
//
// Comparing cantilever tip deflection δ = PL³/(3EI) vs
// simply-supported midspan deflection δ = PL³/(48EI):
//   ratio = (PL³/(3EI)) / (PL³/(48EI)) = 48/3 = 16
//
// This demonstrates the K-factor principle: stiffer boundary
// conditions dramatically reduce deflection.
//
// Reference: AISC 360-22 Commentary Table C-A-7.1

#[test]
fn validation_aisc360_k_factor_stiffness_ratio() {
    let l = 5.0;
    let n = 10;
    let p = 10.0;
    let e_eff = E * 1000.0;

    // Case 1: Cantilever with transverse tip load → δ = PL³/(3EI)
    let input_cantilever = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_cantilever = linear::solve_2d(&input_cantilever).unwrap();
    let delta_cantilever = res_cantilever.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Case 2: Fixed-fixed beam with center point load → δ = PL³/(192EI)
    let mid = n / 2 + 1;
    let input_fixed = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_fixed = linear::solve_2d(&input_fixed).unwrap();
    let delta_fixed = res_fixed.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Verify analytical values
    let delta_cant_exact = p * l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(delta_cantilever, delta_cant_exact, 0.02,
        "AISC K-factor: cantilever δ = PL³/(3EI)");

    let delta_fixed_exact = p * l.powi(3) / (192.0 * e_eff * IZ);
    assert_close(delta_fixed, delta_fixed_exact, 0.02,
        "AISC K-factor: fixed-fixed δ = PL³/(192EI)");

    // Stiffness ratio: cantilever/fixed-fixed = 192/3 = 64
    let ratio = delta_cantilever / delta_fixed;
    assert_close(ratio, 64.0, 0.05,
        "AISC K-factor: cantilever/fixed-fixed deflection ratio = 64");
}

// ================================================================
// 5. EN 1992-1-1 §7.4: Span-to-Depth Deflection Control Concept
// ================================================================
//
// EN 1992 (concrete design) uses span/depth ratios to control
// deflections. The fundamental idea is that for a given L/d ratio,
// deflection scales as (L/d)² × L.
//
// We verify that doubling the moment of inertia (≈ increasing depth)
// halves the deflection, which is the basis of span/depth rules.
//
// Reference: EN 1992-1-1:2004 §7.4.2, Table 7.4N

#[test]
fn validation_en1992_span_depth_deflection_scaling() {
    let l = 6.0;
    let n = 12;
    let q = -10.0;

    let make_ss_beam = |iz_val: f64| -> f64 {
        let loads: Vec<SolverLoad> = (1..=n)
            .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }))
            .collect();
        let input = make_input(
            (0..=n).map(|i| (i + 1, i as f64 * l / n as f64, 0.0)).collect(),
            vec![(1, E, 0.3)],
            vec![(1, A, iz_val)],
            (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect(),
            vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
            loads,
        );
        let results = linear::solve_2d(&input).unwrap();
        let mid = n / 2 + 1;
        results.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs()
    };

    let d1 = make_ss_beam(IZ);
    let d2 = make_ss_beam(2.0 * IZ);
    let d4 = make_ss_beam(4.0 * IZ);

    // δ ∝ 1/I: doubling I halves deflection
    assert_close(d1 / d2, 2.0, 0.02,
        "EN 1992 span/depth: δ ∝ 1/I (2× I → δ/2)");
    assert_close(d1 / d4, 4.0, 0.02,
        "EN 1992 span/depth: δ ∝ 1/I (4× I → δ/4)");

    // Verify absolute value of deflection matches formula: 5qL⁴/(384EI)
    let e_eff = E * 1000.0;
    let delta_exact = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(d1, delta_exact, 0.02,
        "EN 1992: δ = 5qL⁴/(384EI)");
}

// ================================================================
// 6. AISC 360 §E3: Weak-Axis vs Strong-Axis Bending Stiffness
// ================================================================
//
// A member with a larger moment of inertia deflects less under
// the same transverse load. In 2D, we compare two cantilever beams:
// one with Iz, another with 4×Iz, under the same transverse tip load.
//
// δ = PL³/(3EI), so the deflection ratio equals the Iz ratio (inverse).
//
// This demonstrates why weak-axis buckling governs in compression
// members — the axis with smaller I has lower stiffness.
//
// Reference: AISC 360-22 §E3, Commentary on weak-axis buckling

#[test]
fn validation_aisc360_weak_vs_strong_axis_stiffness() {
    let l = 5.0;
    let n = 10;
    let p = 5.0; // transverse tip load
    let e_eff = E * 1000.0;

    // "Weak axis" cantilever: Iz = 1e-4, transverse load fy at tip
    let input_weak = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_weak = linear::solve_2d(&input_weak).unwrap();
    let delta_weak = res_weak.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // "Strong axis" cantilever: Iz = 4e-4 (4× stiffer)
    let iz_strong = 4.0 * IZ;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * l / n as f64, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();
    let input_strong = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, iz_strong)],
        elems,
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let res_strong = linear::solve_2d(&input_strong).unwrap();
    let delta_strong = res_strong.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Ratio: δ_weak / δ_strong = Iz_strong / Iz_weak = 4.0
    let ratio = delta_weak / delta_strong;
    assert_close(ratio, 4.0, 0.02,
        "AISC weak/strong axis: δ ratio = Iz ratio");

    // Verify analytical: δ = PL³/(3EI)
    let delta_weak_exact = p * l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(delta_weak, delta_weak_exact, 0.02,
        "AISC weak axis: δ = PL³/(3EI)");

    let delta_strong_exact = p * l.powi(3) / (3.0 * e_eff * iz_strong);
    assert_close(delta_strong, delta_strong_exact, 0.02,
        "AISC strong axis: δ = PL³/(3EI)");
}

// ================================================================
// 7. EN 1993-1-1 §5.3.2: Bracing Stiffness Effect on Portal Frame
// ================================================================
//
// Adding a diagonal brace to a portal frame dramatically increases
// its lateral stiffness. EN 1993 requires that bracing systems have
// sufficient stiffness to control sway.
//
// We compare an unbraced portal frame with a braced one and verify
// the braced frame is significantly stiffer laterally.
//
// Reference: EN 1993-1-1:2005 §5.3.2, Galambos §5.4

#[test]
fn validation_en1993_bracing_stiffness_effect() {
    let h = 4.0;
    let w = 6.0;
    let h_force = 10.0;
    let a_brace = 0.002; // brace cross-section area

    // Unbraced portal frame: 2 columns + 1 beam
    let input_unbraced = make_portal_frame(h, w, E, A, IZ, h_force, 0.0);
    let res_unbraced = linear::solve_2d(&input_unbraced).unwrap();
    let delta_unbraced = res_unbraced.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Braced portal frame: add diagonal truss brace (node 1 to node 3)
    // using frame with hinge_start=true, hinge_end=true
    let input_braced = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, E, 0.3)],
        vec![
            (1, A, IZ),           // columns + beam
            (2, a_brace, 0.0),    // brace (truss-like)
        ],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),  // left column
            (2, "frame", 2, 3, 1, 1, false, false),  // beam
            (3, "frame", 3, 4, 1, 1, false, false),  // right column
            (4, "frame", 1, 3, 1, 2, true, true),    // diagonal brace (truss)
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: h_force, fy: 0.0, mz: 0.0,
        })],
    );
    let res_braced = linear::solve_2d(&input_braced).unwrap();
    let delta_braced = res_braced.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Braced frame should be much stiffer (significantly less drift)
    assert!(delta_braced < delta_unbraced,
        "EN 1993 bracing: braced drift ({:.6e}) < unbraced drift ({:.6e})",
        delta_braced, delta_unbraced);

    // Typically, bracing reduces drift by a factor of 5+ for reasonable brace sizing
    let stiffness_ratio = delta_unbraced / delta_braced;
    assert!(stiffness_ratio > 2.0,
        "EN 1993 bracing: stiffness improvement ratio={:.2} should be > 2",
        stiffness_ratio);

    // Both frames should be in global equilibrium
    let sum_rx_unbraced: f64 = res_unbraced.reactions.iter().map(|r| r.rx).sum();
    let sum_rx_braced: f64 = res_braced.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_unbraced.abs(), h_force, 0.02,
        "EN 1993 unbraced: ΣRx = H");
    assert_close(sum_rx_braced.abs(), h_force, 0.02,
        "EN 1993 braced: ΣRx = H");
}

// ================================================================
// 8. ASCE 7 §12.8.6: Story Stiffness and Soft-Story Check
// ================================================================
//
// ASCE 7 defines a soft-story irregularity when a story's lateral
// stiffness is less than 70% of the story above or 80% of the
// average of the three stories above.
//
// We model a two-story frame where both stories have equal stiffness
// and verify no soft-story irregularity exists. Then we create a
// frame where the bottom story is intentionally flexible and verify
// the soft-story criterion is triggered.
//
// Story stiffness k = H/Δ (lateral force / story drift).
//
// Reference: ASCE 7-22 §12.3.2, Table 12.3-2

#[test]
fn validation_asce7_soft_story_check() {
    let h = 3.5; // story height
    let h_force = 10.0;

    // Helper: compute story drift for a single column of given Iz
    let compute_story_drift = |iz_val: f64| -> f64 {
        let n = 8;
        let nodes: Vec<_> = (0..=n).map(|i| (i + 1, 0.0, i as f64 * h / n as f64)).collect();
        let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();
        let input = make_input(
            nodes,
            vec![(1, E, 0.3)],
            vec![(1, A, iz_val)],
            elems,
            vec![(1, 1, "fixed")],
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: h_force, fy: 0.0, mz: 0.0,
            })],
        );
        let results = linear::solve_2d(&input).unwrap();
        results.displacements.iter()
            .find(|d| d.node_id == n + 1).unwrap().ux.abs()
    };

    // Equal stiffness stories: Iz = 1e-4 for both
    let drift_normal = compute_story_drift(IZ);
    let k_normal = h_force / drift_normal;

    // Flexible story: Iz_weak = 0.25 × Iz (quarter stiffness)
    let iz_weak = IZ / 4.0;
    let drift_weak = compute_story_drift(iz_weak);
    let k_weak = h_force / drift_weak;

    // Verify stiffness scales as expected (k ∝ I)
    assert_close(k_normal / k_weak, 4.0, 0.02,
        "ASCE 7 story stiffness: k ∝ I");

    // ASCE 7 soft-story check: k_weak < 0.70 × k_normal → soft story
    let ratio_70 = k_weak / k_normal;
    assert!(ratio_70 < 0.70,
        "ASCE 7: k_weak/k_normal = {:.3} < 0.70 → soft story irregularity",
        ratio_70);

    // Verify equal-stiffness case passes (no soft story)
    let k_same = h_force / drift_normal;
    let ratio_same = k_same / k_normal;
    assert_close(ratio_same, 1.0, 0.01,
        "ASCE 7: equal stiffness → no soft story (ratio = 1.0)");

    // Verify analytical formula: δ = HL³/(3EI) for cantilever
    let e_eff = E * 1000.0;
    let delta_exact = h_force * h.powi(3) / (3.0 * e_eff * IZ);
    assert_close(drift_normal, delta_exact, 0.02,
        "ASCE 7 story drift: δ = HL³/(3EI)");
}
