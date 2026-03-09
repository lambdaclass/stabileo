/// Validation: Extended Fixed-End Forces (FEF) for Beam Elements
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Table 4.3
///   - Ghali & Neville, "Structural Analysis", 5th Ed., Appendix D
///   - Kassimali, "Structural Analysis", 6th Ed., §15.2
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed., Ch. 9-10
///   - Timoshenko & Gere, "Theory of Elastic Stability", Ch. 1
///
/// These tests extend the base FEF validation suite by covering:
///   1. PointOnElement load at midspan of fixed-fixed beam
///   2. Concentrated moment applied via PointOnElement on fixed-fixed beam
///   3. Two equal symmetric point loads on fixed-fixed beam
///   4. Inverse triangular load (max at left, zero at right)
///   5. Trapezoidal distributed load on fixed-fixed beam
///   6. Internal element forces (shear/moment) for UDL fixed-fixed beam
///   7. Cantilever beam with UDL — tip deflection and fixed-end reactions
///   8. Thermal gradient load on fixed-fixed beam (restrained bending)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01;      // m²
const IZ: f64 = 1e-4;     // m⁴

// ================================================================
// 1. PointOnElement at Midspan: M = PL/8, R = P/2
// ================================================================
/// Analytical reference: AISC Table 3-23 Case 4.
/// A single concentrated load P applied at midspan of a fixed-fixed beam
/// using the PointOnElement load type (applied directly to an element).
/// Fixed-end moments = PL/8 at each end; vertical reactions = P/2.
#[test]
fn validation_fef_ext_point_on_element_midspan() {
    let l = 10.0;
    let n = 10; // 10 elements, each 1.0 m long
    let p = 40.0; // kN downward

    // Apply point load at midspan of element 5 (at x = 4.5 m from left, which is 0.5 m into element 5)
    // Element 5 spans nodes 5 to 6, i.e., from x=4.0 to x=5.0.
    // Midspan of beam is x = 5.0 = node 6, so use element 5, a = 1.0 (end of element)
    // Better: use element 5 at a = 0.5 for x = 4.5, or just apply at node for symmetry.
    // For a clean midspan test: element 5 goes from 4.0 to 5.0, element 6 from 5.0 to 6.0.
    // Place the load at a = 1.0 on element 5 (node 6 = midspan x=5.0).
    // Actually, let's use a 2-element beam so element 1 goes from 0 to 5 and element 2 from 5 to 10.
    // Apply PointOnElement at element 1 with a = 5.0 (= at the end / midspan of beam).
    // Simpler: use the 10-element mesh and apply load at midspan of beam using PointOnElement
    // on element 5, with a = elem_len (end of element 5 = node 6 = x=5.0)
    let elem_len = l / n as f64; // 1.0 m
    let loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: 5,
        a: elem_len, // at the end of element 5 = node 6 = midspan
        p: -p,
        px: None,
        mz: None,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Reactions = P/2 each (symmetric)
    assert_close(r1.ry, p / 2.0, 0.02, "PointOnElement midspan: R_left = P/2");
    assert_close(r_end.ry, p / 2.0, 0.02, "PointOnElement midspan: R_right = P/2");

    // Fixed-end moments = PL/8 each
    let fem = p * l / 8.0;
    assert_close(r1.mz.abs(), fem, 0.02, "PointOnElement midspan: M_left = PL/8");
    assert_close(r_end.mz.abs(), fem, 0.02, "PointOnElement midspan: M_right = PL/8");

    // Equilibrium: sum of vertical reactions = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "PointOnElement midspan: ΣRy = P");
}

// ================================================================
// 2. Concentrated Moment on Element at Midspan
// ================================================================
/// Analytical reference: Przemieniecki Table 4.3; Ghali & Neville App. D.
/// A concentrated moment M₀ applied at the midspan of a fixed-fixed beam.
/// At midspan (a = L/2): M_A = M₀ × b(2a-b)/L² = M₀ × (L/2)(2×L/2 - L/2)/L² = M₀/4
/// But more carefully: a = L/2, b = L/2:
///   M_A = M₀ × b(2a - b)/L² = M₀ × (L/2)(L - L/2)/L² = M₀ × (L/2)(L/2)/L² = M₀/4
///   M_B = M₀ × a(2b - a)/L² = M₀/4
/// Both reactions: R_A = -6M₀ab/L³, R_B = 6M₀ab/L³
///   at a=b=L/2: R_A = -6M₀(L/2)(L/2)/L³ = -3M₀/(2L), R_B = +3M₀/(2L)
#[test]
fn validation_fef_ext_concentrated_moment_midspan() {
    let l = 8.0;
    let n = 8; // elem length = 1.0 m
    let m0 = 60.0; // kN·m applied moment

    let elem_len = l / n as f64;
    // Apply concentrated moment at midspan: element 4, a = elem_len (end of element 4 = node 5 = x=4.0 = L/2)
    let loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: 4,
        a: elem_len,
        p: 0.0,
        px: None,
        mz: Some(m0),
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Reaction moments: M_A = M₀/4, M_B = M₀/4
    let m_end_exact = m0 / 4.0; // 15 kN·m
    assert_close(r1.mz.abs(), m_end_exact, 0.05, "Conc moment: M_A = M₀/4");
    assert_close(r_end.mz.abs(), m_end_exact, 0.05, "Conc moment: M_B = M₀/4");

    // Vertical reactions: R = ±3M₀/(2L) (couple, no net vertical force)
    let r_exact = 3.0 * m0 / (2.0 * l); // = 11.25 kN
    assert_close(r1.ry.abs(), r_exact, 0.05, "Conc moment: |R_A| = 3M₀/(2L)");
    assert_close(r_end.ry.abs(), r_exact, 0.05, "Conc moment: |R_B| = 3M₀/(2L)");

    // Net vertical reaction should be zero (moment only, no external force)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry.abs(), 0.0, 0.01, "Conc moment: ΣRy ≈ 0");
}

// ================================================================
// 3. Two Symmetric Point Loads: P at L/3 and 2L/3
// ================================================================
/// Analytical reference: Superposition of AISC Table 3-23 Case 5.
/// Two equal loads P at a = L/3 and a = 2L/3 on fixed-fixed beam.
/// By symmetry: R_A = R_B = P, M_A = M_B.
/// From superposition: M_A = P(L/3)(2L/3)²/L² + P(2L/3)(L/3)²/L²
///   = P/L² [L/3 × 4L²/9 + 2L/3 × L²/9] = P/L² × [4L³/27 + 2L³/27] = 2PL/9
/// So M_A = M_B = 2PL/9.
#[test]
fn validation_fef_ext_two_symmetric_point_loads() {
    let l = 9.0;
    let n = 9; // elem length = 1.0 m
    let p = 18.0; // kN each

    // Load at L/3 (node 4) and 2L/3 (node 7)
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fy: -p, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 7, fx: 0.0, fy: -p, mz: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // By symmetry: R_A = R_B = P
    assert_close(r1.ry, p, 0.02, "Sym 2P: R_A = P");
    assert_close(r_end.ry, p, 0.02, "Sym 2P: R_B = P");

    // M_A = M_B = 2PL/9
    let fem = 2.0 * p * l / 9.0;
    assert_close(r1.mz.abs(), fem, 0.02, "Sym 2P: M_A = 2PL/9");
    assert_close(r_end.mz.abs(), fem, 0.02, "Sym 2P: M_B = 2PL/9");

    // Symmetry: moments equal in magnitude
    let diff: f64 = (r1.mz.abs() - r_end.mz.abs()).abs();
    assert!(diff < 0.1, "Sym 2P: |M_A| ≈ |M_B|, diff = {:.4}", diff);

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 2.0 * p, 0.01, "Sym 2P: ΣRy = 2P");
}

// ================================================================
// 4. Inverse Triangular Load (max at left, zero at right)
// ================================================================
/// Analytical reference: Przemieniecki Table 4.3 (mirror of standard triangular).
/// Load varies linearly from q at left to 0 at right.
/// This is the mirror of the standard case: M_left = qL²/20, M_right = qL²/30.
/// Total load = qL/2. Left reaction > right reaction.
/// R_A = 7qL/20, R_B = 3qL/20 (mirror of standard triangular FEF).
#[test]
fn validation_fef_ext_inverse_triangular_load() {
    let l = 6.0;
    let n = 12;
    let q: f64 = -15.0; // kN/m max at left

    // Linear from q at node 1 to 0 at node n+1
    let loads: Vec<SolverLoad> = (0..n)
        .map(|i| {
            let t_i = 1.0 - i as f64 / n as f64;
            let t_j = 1.0 - (i + 1) as f64 / n as f64;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: q * t_i,
                q_j: q * t_j,
                a: None, b: None,
            })
        })
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Mirror of standard: M_left = qL²/20, M_right = qL²/30
    let m_left = q.abs() * l * l / 20.0;
    let m_right = q.abs() * l * l / 30.0;

    assert_close(r1.mz.abs(), m_left, 0.10, "Inv tri: M_left ≈ qL²/20");
    assert_close(r_end.mz.abs(), m_right, 0.10, "Inv tri: M_right ≈ qL²/30");

    // Left moment should exceed right moment (load heavier on left)
    assert!(
        r1.mz.abs() > r_end.mz.abs(),
        "Inv tri: M_left > M_right: {:.4} > {:.4}",
        r1.mz.abs(), r_end.mz.abs()
    );

    // Reactions from mirrored triangular FEF
    let r_a_exact = 7.0 * q.abs() * l / 20.0;
    let r_b_exact = 3.0 * q.abs() * l / 20.0;
    assert_close(r1.ry, r_a_exact, 0.10, "Inv tri: R_A ≈ 7qL/20");
    assert_close(r_end.ry, r_b_exact, 0.10, "Inv tri: R_B ≈ 3qL/20");

    // Total vertical reaction = qL/2
    let total = q.abs() * l / 2.0;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total, 0.02, "Inv tri: ΣRy = qL/2");
}

// ================================================================
// 5. Trapezoidal Distributed Load on Fixed-Fixed Beam
// ================================================================
/// Analytical reference: Superposition of uniform + triangular (Przemieniecki Table 4.3).
/// Trapezoidal load: q1 at left, q2 at right (q2 > q1).
/// Decompose: uniform part = q1, triangular part = (q2 - q1).
/// Uniform: M_A_u = q1 L²/12, M_B_u = q1 L²/12
/// Triangular (0→Δq): M_A_t = Δq L²/30, M_B_t = Δq L²/20
/// Combined: M_A = q1 L²/12 + Δq L²/30, M_B = q1 L²/12 + Δq L²/20
#[test]
fn validation_fef_ext_trapezoidal_load() {
    let l = 6.0;
    let n = 12;
    let q1: f64 = -6.0;   // kN/m at left
    let q2: f64 = -18.0;  // kN/m at right

    let loads: Vec<SolverLoad> = (0..n)
        .map(|i| {
            let t_i = i as f64 / n as f64;
            let t_j = (i + 1) as f64 / n as f64;
            let qi = q1 + (q2 - q1) * t_i;
            let qj = q1 + (q2 - q1) * t_j;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: qi,
                q_j: qj,
                a: None, b: None,
            })
        })
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    let dq: f64 = (q2 - q1).abs(); // = 12 kN/m (triangular increment)
    let q1a: f64 = q1.abs();        // = 6 kN/m (uniform part)

    // M_A = q1*L²/12 + Δq*L²/30
    let m_a_exact = q1a * l * l / 12.0 + dq * l * l / 30.0;
    // M_B = q1*L²/12 + Δq*L²/20
    let m_b_exact = q1a * l * l / 12.0 + dq * l * l / 20.0;

    assert_close(r1.mz.abs(), m_a_exact, 0.10, "Trapez: M_A = q1L²/12 + ΔqL²/30");
    assert_close(r_end.mz.abs(), m_b_exact, 0.10, "Trapez: M_B = q1L²/12 + ΔqL²/20");

    // Right moment > left moment (heavier load on right)
    assert!(
        r_end.mz.abs() > r1.mz.abs(),
        "Trapez: M_B > M_A: {:.4} > {:.4}",
        r_end.mz.abs(), r1.mz.abs()
    );

    // Total load = (q1 + q2)/2 * L = average intensity × length
    let total = (q1a + dq + q1a) / 2.0 * l; // = (q1 + q2)/2 * L
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total, 0.02, "Trapez: ΣRy = (q1+q2)L/2");
}

// ================================================================
// 6. Internal Element Forces for UDL Fixed-Fixed Beam
// ================================================================
/// Analytical reference: Gere & Goodno, Mechanics of Materials, Ch. 10.
/// For a fixed-fixed beam with UDL q, the internal forces at x from left are:
///   V(x) = qL/2 - qx  (shear)
///   M(x) = -qL²/12 + qLx/2 - qx²/2  (moment)
/// At midspan (x = L/2):
///   V(L/2) = 0
///   M(L/2) = -qL²/12 + qL²/4 - qL²/8 = qL²/24  (sagging)
/// The midspan moment magnitude should be qL²/24.
/// Verify element forces at the midspan element boundaries.
#[test]
fn validation_fef_ext_internal_forces_udl() {
    let l = 8.0;
    let n = 8;
    let q: f64 = -12.0; // kN/m downward

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Element 1 starts at node 1 (x=0)
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    // At x=0: V = qL/2 (upward reaction), M = -qL²/12 (hogging at support)
    let v_start = q.abs() * l / 2.0;  // shear at left support
    let m_start = q.abs() * l * l / 12.0; // magnitude of hogging moment at support

    assert_close(ef1.v_start.abs(), v_start, 0.02, "UDL int: V(0) = qL/2");
    assert_close(ef1.m_start.abs(), m_start, 0.02, "UDL int: M(0) = qL²/12");

    // Element at midspan: element 4 ends at node 5 (x = 4.0 = L/2),
    // element 5 starts at node 5
    let ef4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    let ef5 = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();

    // Shear at midspan should be approximately zero
    assert_close(ef4.v_end.abs(), 0.0, 0.05, "UDL int: V(L/2) ≈ 0");
    assert_close(ef5.v_start.abs(), 0.0, 0.05, "UDL int: V(L/2) ≈ 0 (elem 5)");

    // Midspan moment = qL²/24 (sagging, positive)
    let m_mid = q.abs() * l * l / 24.0;
    assert_close(ef4.m_end.abs(), m_mid, 0.05, "UDL int: M(L/2) = qL²/24");
}

// ================================================================
// 7. Cantilever with UDL: Tip Deflection and Fixed-End Forces
// ================================================================
/// Analytical reference: Gere & Goodno Ch. 9; Timoshenko & Gere Ch. 1.
/// Cantilever (fixed at left, free at right) with UDL q:
///   R_A = qL (vertical reaction at fixed end)
///   M_A = qL²/2 (fixed-end moment)
///   δ_tip = qL⁴/(8EI) (tip deflection, downward)
/// This tests that the solver correctly handles cantilever conditions.
#[test]
fn validation_fef_ext_cantilever_udl() {
    let l = 4.0;
    let n = 8;
    let q: f64 = -10.0; // kN/m downward

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    // Fixed at left only, no support at right (cantilever)
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // R_A = |q|L = 10 × 4 = 40 kN (upward)
    let r_exact = q.abs() * l;
    assert_close(r1.ry, r_exact, 0.02, "Cantilever UDL: R_A = qL");

    // M_A = |q|L²/2 = 10 × 16 / 2 = 80 kN·m
    let m_exact = q.abs() * l * l / 2.0;
    assert_close(r1.mz.abs(), m_exact, 0.02, "Cantilever UDL: M_A = qL²/2");

    // Tip deflection: δ = qL⁴ / (8EI)
    // E in solver is multiplied by 1000: E_actual = 200_000 × 1000 = 2e8 kN/m²
    let e_actual = E * 1000.0; // kN/m²
    let delta_exact = q.abs() * l.powi(4) / (8.0 * e_actual * IZ);

    let tip_node = n + 1;
    let disp_tip = results.displacements.iter().find(|d| d.node_id == tip_node).unwrap();
    // Displacement is downward (negative uy)
    assert_close(disp_tip.uy.abs(), delta_exact, 0.02, "Cantilever UDL: δ_tip = qL⁴/(8EI)");

    // No horizontal reaction for purely vertical load
    assert_close(r1.rx.abs(), 0.0, 0.01, "Cantilever UDL: Rx ≈ 0");
}

// ================================================================
// 8. Thermal Gradient on Fixed-Fixed Beam (Restrained Bending)
// ================================================================
/// Analytical reference: Ghali & Neville, "Structural Analysis", Ch. 5.
/// A fixed-fixed beam subjected to a thermal gradient ΔT across its depth h
/// develops fixed-end moments M = E I α ΔT / h at each end.
/// No vertical reactions are produced (no transverse load).
/// The beam remains straight (zero deflection) due to full restraint.
/// alpha_steel = 12e-6 /°C (default in solver).
#[test]
fn validation_fef_ext_thermal_gradient() {
    let l = 6.0;
    let n = 6;
    let dt_gradient = 50.0; // °C temperature difference across depth
    let alpha = 12e-6;      // coefficient of thermal expansion for steel
    let _h = 0.3;           // section depth (m), needed for gradient calculation
    // For the solver, thermal loads use element_id
    // The solver's default alpha = 12e-6, default h derived from section properties
    // h = sqrt(12 * Iz / A) for a rectangular section
    // With A = 0.01, Iz = 1e-4: h = sqrt(12 * 1e-4 / 0.01) = sqrt(0.12) ≈ 0.3464

    // The solver computes h = sqrt(12 * Iz / A)
    let h_solver: f64 = (12.0 * IZ / A).sqrt();

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: 0.0,
            dt_gradient,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Expected fixed-end moment: M = E_actual * Iz * alpha * ΔT / h
    let e_actual = E * 1000.0; // kN/m²
    let m_exact = e_actual * IZ * alpha * dt_gradient / h_solver;

    assert_close(r1.mz.abs(), m_exact, 0.05, "Thermal: M_A = EIαΔT/h");
    assert_close(r_end.mz.abs(), m_exact, 0.05, "Thermal: M_B = EIαΔT/h");

    // No net vertical load → vertical reactions ≈ 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry.abs(), 0.0, 0.01, "Thermal: ΣRy ≈ 0");

    // No transverse deflection at midspan (fully restrained beam)
    let mid_node = n / 2 + 1;
    let disp_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(disp_mid.uy.abs(), 0.0, 0.01, "Thermal: midspan deflection ≈ 0");
}
