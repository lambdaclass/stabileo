/// Validation: Numerical Methods Used in FEM
///
/// References:
///   - Bathe, "Finite Element Procedures", Prentice Hall
///   - Hughes, "The Finite Element Method", Dover
///   - Zienkiewicz & Taylor, "The Finite Element Method", 5th Ed.
///   - Golub & Van Loan, "Matrix Computations", 4th Ed.
///   - Newmark, "A Method of Computation for Structural Dynamics", ASCE 1959
///
/// Tests verify numerical method formulas and properties without calling the solver.
/// Pure arithmetic verification of analytical expressions.

use std::f64::consts::PI;

// ================================================================
// Tolerance helper
// ================================================================

fn assert_close(got: f64, expected: f64, rel_tol: f64, label: &str) {
    let err: f64 = if expected.abs() < 1e-12 {
        got.abs()
    } else {
        (got - expected).abs() / expected.abs()
    };
    assert!(
        err < rel_tol,
        "{}: got {:.6}, expected {:.6}, rel err = {:.4}%",
        label, got, expected, err * 100.0
    );
}

// ================================================================
// 1. Gauss Quadrature Exactness (2-Point Rule Exact for Cubics)
// ================================================================
//
// 2-point Gauss-Legendre quadrature on [-1, 1]:
//   Points: ξ = ±1/√3,  Weights: w = 1.0 each
//
// This rule integrates polynomials up to degree 2n-1 = 3 exactly.
//
// Test: ∫₋₁¹ (aξ³ + bξ² + cξ + d) dξ
//   Exact = 2b/3 + 2d    (odd powers integrate to 0 by symmetry)
//
// Reference: Bathe, Ch. 5; Hughes, App. C

#[test]
fn validation_gauss_quadrature_2pt_exact_for_cubic() {
    // 2-point Gauss-Legendre points and weights
    let xi1: f64 = -1.0 / (3.0_f64).sqrt();
    let xi2: f64 = 1.0 / (3.0_f64).sqrt();
    let w1: f64 = 1.0;
    let w2: f64 = 1.0;

    // Test polynomial: f(ξ) = 2ξ³ + 3ξ² - ξ + 5
    let f = |xi: f64| -> f64 { 2.0 * xi.powi(3) + 3.0 * xi.powi(2) - xi + 5.0 };

    // Gauss quadrature result
    let integral_gauss: f64 = w1 * f(xi1) + w2 * f(xi2);

    // Exact integral: ∫₋₁¹ (2ξ³ + 3ξ² - ξ + 5) dξ = 0 + 2 + 0 + 10 = 12
    let integral_exact: f64 = 2.0 * 3.0 / 3.0 + 2.0 * 5.0;
    assert_close(integral_gauss, integral_exact, 1e-12, "2-pt Gauss exact for cubic");
    assert_close(integral_exact, 12.0, 1e-12, "Exact integral = 12");

    // Verify it's NOT exact for degree 4: f(ξ) = ξ⁴
    let g = |xi: f64| -> f64 { xi.powi(4) };
    let gauss_quartic: f64 = w1 * g(xi1) + w2 * g(xi2);
    let exact_quartic: f64 = 2.0 / 5.0; // ∫₋₁¹ ξ⁴ dξ = 2/5
    let quartic_err: f64 = (gauss_quartic - exact_quartic).abs() / exact_quartic.abs();
    assert!(quartic_err > 1e-6, "2-pt Gauss should NOT be exact for quartic");
}

// ================================================================
// 2. Condition Number of Hilbert Matrix
// ================================================================
//
// The Hilbert matrix H_{ij} = 1/(i+j-1) is notoriously ill-conditioned.
// For the 3×3 Hilbert matrix:
//   H = [[1, 1/2, 1/3], [1/2, 1/3, 1/4], [1/3, 1/4, 1/5]]
//   det(H) = 1/2160
//   cond(H) ≈ 524 (2-norm condition number)
//
// We verify the determinant and trace properties.
//
// Reference: Golub & Van Loan, Ch. 3

#[test]
fn validation_hilbert_matrix_condition() {
    // 3×3 Hilbert matrix elements
    let h11: f64 = 1.0;
    let h12: f64 = 1.0 / 2.0;
    let h13: f64 = 1.0 / 3.0;
    let h22: f64 = 1.0 / 3.0;
    let h23: f64 = 1.0 / 4.0;
    let h33: f64 = 1.0 / 5.0;

    // Determinant of 3×3 symmetric matrix (expand along first row)
    // det = h11*(h22*h33 - h23²) - h12*(h12*h33 - h23*h13) + h13*(h12*h23 - h22*h13)
    let det: f64 = h11 * (h22 * h33 - h23 * h23)
        - h12 * (h12 * h33 - h23 * h13)
        + h13 * (h12 * h23 - h22 * h13);

    // Known: det(H₃) = 1/2160
    assert_close(det, 1.0 / 2160.0, 1e-10, "Hilbert 3×3 determinant = 1/2160");

    // Trace = h11 + h22 + h33 = 1 + 1/3 + 1/5 = 23/15
    let trace: f64 = h11 + h22 + h33;
    assert_close(trace, 23.0 / 15.0, 1e-10, "Hilbert 3×3 trace");

    // Frobenius norm squared = Σ h_ij² (with double counting for off-diag)
    let frob_sq: f64 = h11 * h11 + h22 * h22 + h33 * h33
        + 2.0 * (h12 * h12 + h13 * h13 + h23 * h23);
    let expected_frob_sq: f64 = 1.0 + 1.0 / 9.0 + 1.0 / 25.0
        + 2.0 * (1.0 / 4.0 + 1.0 / 9.0 + 1.0 / 16.0);
    assert_close(frob_sq, expected_frob_sq, 1e-10, "Hilbert 3×3 Frobenius norm²");
}

// ================================================================
// 3. Cholesky Decomposition of SPD Matrix
// ================================================================
//
// For an SPD matrix A, the Cholesky decomposition gives A = L L^T
// where L is lower triangular.
//
// For 2×2:  A = [[a, b], [b, c]]
//   L₁₁ = √a, L₂₁ = b/L₁₁, L₂₂ = √(c - L₂₁²)
//
// Verify: L L^T = A
//
// Reference: Golub & Van Loan, Ch. 4

#[test]
fn validation_cholesky_decomposition_spd() {
    // SPD matrix: A = [[4, 2], [2, 5]]
    let a11: f64 = 4.0;
    let a12: f64 = 2.0;
    let a22: f64 = 5.0;

    // Cholesky: L₁₁ = √4 = 2
    let l11: f64 = a11.sqrt();
    assert_close(l11, 2.0, 1e-12, "L₁₁ = √a₁₁");

    // L₂₁ = a₁₂/L₁₁ = 2/2 = 1
    let l21: f64 = a12 / l11;
    assert_close(l21, 1.0, 1e-12, "L₂₁ = a₁₂/L₁₁");

    // L₂₂ = √(a₂₂ - L₂₁²) = √(5-1) = 2
    let l22: f64 = (a22 - l21 * l21).sqrt();
    assert_close(l22, 2.0, 1e-12, "L₂₂ = √(a₂₂ - L₂₁²)");

    // Verify L·Lᵀ = A
    let check_11: f64 = l11 * l11;
    let check_12: f64 = l11 * l21;
    let check_22: f64 = l21 * l21 + l22 * l22;
    assert_close(check_11, a11, 1e-12, "L·Lᵀ [1,1]");
    assert_close(check_12, a12, 1e-12, "L·Lᵀ [1,2]");
    assert_close(check_22, a22, 1e-12, "L·Lᵀ [2,2]");

    // Determinant via Cholesky: det(A) = (L₁₁ · L₂₂)²
    let det_a: f64 = (l11 * l22).powi(2);
    let expected_det: f64 = a11 * a22 - a12 * a12; // 20 - 4 = 16
    assert_close(det_a, expected_det, 1e-12, "det(A) via Cholesky");
    assert_close(det_a, 16.0, 1e-12, "det(A) = 16");
}

// ================================================================
// 4. Bandwidth-Dependent Solve Efficiency
// ================================================================
//
// For a banded SPD matrix of size n with half-bandwidth b,
// Cholesky factorization cost is O(n·b²) instead of O(n³).
//
// Ratio of banded/full cost = b²/n² (approximately).
//
// For a typical FEM mesh:
//   1D mesh with m elements: n = m+1, b ≈ 1 (tridiagonal for scalar)
//   2D mesh with m×m: n = (m+1)², b ≈ m+1
//
// Reference: Bathe, Ch. 8; Zienkiewicz & Taylor, Ch. 17

#[test]
fn validation_bandwidth_solve_efficiency() {
    // 1D example: 100 elements, DOFs = 101, bandwidth b = 1 (scalar problem)
    let n_1d: f64 = 101.0;
    let b_1d: f64 = 1.0;
    let cost_banded_1d: f64 = n_1d * b_1d * b_1d;
    let cost_full_1d: f64 = n_1d.powi(3) / 3.0; // Cholesky ≈ n³/3
    let ratio_1d: f64 = cost_banded_1d / cost_full_1d;
    assert!(ratio_1d < 0.001, "1D banded cost ratio should be << 1");

    // 2D example: 10×10 mesh → n = 121, b ≈ 11
    let n_2d: f64 = 121.0;
    let b_2d: f64 = 11.0;
    let cost_banded_2d: f64 = n_2d * b_2d * b_2d;
    let cost_full_2d: f64 = n_2d.powi(3) / 3.0;
    let ratio_2d: f64 = cost_banded_2d / cost_full_2d;

    // Expected: 121 * 121 / (121³/3) = 3/121 ≈ 0.0248
    let expected_ratio_2d: f64 = 3.0 * b_2d * b_2d / (n_2d * n_2d);
    assert_close(ratio_2d, expected_ratio_2d, 1e-10, "2D banded/full cost ratio");

    // For frame elements (6 DOF/node), bandwidth scales by DOF multiplier
    let dof_per_node: f64 = 6.0;
    let b_frame: f64 = b_2d * dof_per_node;
    let n_frame: f64 = n_2d * dof_per_node;
    let cost_banded_frame: f64 = n_frame * b_frame * b_frame;
    let cost_full_frame: f64 = n_frame.powi(3) / 3.0;
    let ratio_frame: f64 = cost_banded_frame / cost_full_frame;

    // Ratio is same as scalar: 3b²/n² since both scale by dof_per_node
    assert_close(ratio_frame, expected_ratio_2d, 1e-10, "Frame cost ratio = scalar ratio");
}

// ================================================================
// 5. Shape Function Partition of Unity
// ================================================================
//
// For any isoparametric element, the shape functions satisfy:
//   Σ Nᵢ(ξ,η) = 1  for all (ξ,η) in the element domain
//
// This ensures rigid body translation is represented exactly.
//
// For a 4-node quad (bilinear):
//   Nᵢ = ¼(1 + ξᵢξ)(1 + ηᵢη)
//
// Reference: Hughes, Ch. 3; Bathe, Ch. 5

#[test]
fn validation_shape_function_partition_of_unity() {
    // 4-node bilinear quad shape functions
    // Node coordinates in natural space: (-1,-1), (1,-1), (1,1), (-1,1)
    let nodes: [(f64, f64); 4] = [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)];

    let shape_fns = |xi: f64, eta: f64| -> [f64; 4] {
        let mut n = [0.0_f64; 4];
        for i in 0..4 {
            n[i] = 0.25 * (1.0 + nodes[i].0 * xi) * (1.0 + nodes[i].1 * eta);
        }
        n
    };

    // Test at several points
    let test_points: [(f64, f64); 5] = [
        (0.0, 0.0),     // center
        (0.5, 0.3),     // arbitrary interior
        (-0.7, 0.8),    // near corner
        (1.0, -1.0),    // at node 2
        (-1.0, 1.0),    // at node 4
    ];

    for &(xi, eta) in &test_points {
        let n: [f64; 4] = shape_fns(xi, eta);
        let sum: f64 = n.iter().sum();
        assert_close(sum, 1.0, 1e-14, &format!("ΣNᵢ = 1 at ({}, {})", xi, eta));
    }

    // At node 2 (ξ=1, η=-1): N₂ = 1, others = 0 (Kronecker delta property)
    let n_at_node2: [f64; 4] = shape_fns(1.0, -1.0);
    assert_close(n_at_node2[1], 1.0, 1e-14, "N₂ = 1 at node 2");
    assert_close(n_at_node2[0], 0.0, 1e-14, "N₁ = 0 at node 2");
    assert_close(n_at_node2[2], 0.0, 1e-14, "N₃ = 0 at node 2");
    assert_close(n_at_node2[3], 0.0, 1e-14, "N₄ = 0 at node 2");
}

// ================================================================
// 6. Isoparametric Mapping Jacobian
// ================================================================
//
// For a 4-node quad mapped from natural (ξ,η) to physical (x,y):
//   x = Σ Nᵢ xᵢ,  y = Σ Nᵢ yᵢ
//
// The Jacobian matrix:
//   J = [[∂x/∂ξ, ∂y/∂ξ], [∂x/∂η, ∂y/∂η]]
//
// For a rectangle [0,a] × [0,b] mapped from [-1,1]²:
//   J = [[a/2, 0], [0, b/2]],  det(J) = ab/4
//
// Reference: Bathe, Ch. 5; Hughes, Ch. 3

#[test]
fn validation_isoparametric_jacobian() {
    let a: f64 = 4.0; // physical width
    let b: f64 = 3.0; // physical height

    // Physical node coordinates for rectangle [0,a]×[0,b]
    let phys_nodes: [(f64, f64); 4] = [(0.0, 0.0), (a, 0.0), (a, b), (0.0, b)];
    let nat_nodes: [(f64, f64); 4] = [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)];

    // Jacobian at any point (constant for rectangle):
    // ∂Nᵢ/∂ξ = ξᵢ/4 * (1 + ηᵢ η),  ∂Nᵢ/∂η = ηᵢ/4 * (1 + ξᵢ ξ)
    let xi: f64 = 0.0;
    let eta: f64 = 0.0;

    let mut j11: f64 = 0.0; // ∂x/∂ξ
    let mut j12: f64 = 0.0; // ∂y/∂ξ
    let mut j21: f64 = 0.0; // ∂x/∂η
    let mut j22: f64 = 0.0; // ∂y/∂η

    for i in 0..4 {
        let dn_dxi: f64 = 0.25 * nat_nodes[i].0 * (1.0 + nat_nodes[i].1 * eta);
        let dn_deta: f64 = 0.25 * nat_nodes[i].1 * (1.0 + nat_nodes[i].0 * xi);
        j11 += dn_dxi * phys_nodes[i].0;
        j12 += dn_dxi * phys_nodes[i].1;
        j21 += dn_deta * phys_nodes[i].0;
        j22 += dn_deta * phys_nodes[i].1;
    }

    assert_close(j11, a / 2.0, 1e-12, "J₁₁ = a/2");
    assert_close(j12, 0.0, 1e-12, "J₁₂ = 0 (rectangular)");
    assert_close(j21, 0.0, 1e-12, "J₂₁ = 0 (rectangular)");
    assert_close(j22, b / 2.0, 1e-12, "J₂₂ = b/2");

    let det_j: f64 = j11 * j22 - j12 * j21;
    assert_close(det_j, a * b / 4.0, 1e-12, "det(J) = ab/4");
    assert_close(det_j, 3.0, 1e-12, "det(J) = 3.0 for 4×3 rectangle");
}

// ================================================================
// 7. Penalty Method for Constraints
// ================================================================
//
// The penalty method enforces constraints by adding a large stiffness:
//   K_mod = K + α C^T C
// where α is the penalty parameter and C u = 0 is the constraint.
//
// For a 1-DOF spring (K u = F) with constraint u = u₀:
//   (K + α) u = F + α u₀
//   u = (F + α u₀) / (K + α)
//
// As α → ∞: u → u₀  (constraint satisfied exactly)
// Finite α: error ≈ (F - K u₀) / α  (approximation)
//
// Reference: Bathe, Ch. 4; Hughes, Ch. 1

#[test]
fn validation_penalty_method_constraints() {
    let k: f64 = 100.0;      // spring stiffness
    let f_ext: f64 = 50.0;   // external force
    let u0: f64 = 0.2;       // prescribed displacement

    // Without constraint: u_free = F/K = 0.5
    let u_free: f64 = f_ext / k;
    assert_close(u_free, 0.5, 1e-12, "Free DOF u = F/K");

    // With penalty α = 1e4: u = (F + α u₀)/(K + α)
    let alpha1: f64 = 1e4;
    let u_pen1: f64 = (f_ext + alpha1 * u0) / (k + alpha1);
    let error1: f64 = (u_pen1 - u0).abs();
    assert!(error1 < 0.01, "α=1e4: error = {} < 0.01", error1);

    // With penalty α = 1e8: much better
    let alpha2: f64 = 1e8;
    let u_pen2: f64 = (f_ext + alpha2 * u0) / (k + alpha2);
    let error2: f64 = (u_pen2 - u0).abs();
    assert!(error2 < 1e-5, "α=1e8: error = {} < 1e-5", error2);

    // Error scales as 1/α
    let ratio: f64 = error1 / error2;
    // Should be ≈ α2/α1 = 10000
    assert_close(ratio, alpha2 / alpha1, 0.01, "Error ratio ≈ α₂/α₁");

    // Exact error formula: e = (F - K u₀)/(K + α) = (50 - 20)/(100 + α)
    let exact_err1: f64 = (f_ext - k * u0) / (k + alpha1);
    assert_close(u_pen1 - u0, exact_err1, 1e-10, "Exact penalty error formula");
}

// ================================================================
// 8. Newmark-Beta Unconditional Stability
// ================================================================
//
// The Newmark-beta family of time integration:
//   u_{n+1} = u_n + Δt v_n + Δt² [(½-β) a_n + β a_{n+1}]
//   v_{n+1} = v_n + Δt [(1-γ) a_n + γ a_{n+1}]
//
// Unconditional stability requires: 2β ≥ γ ≥ ½
//
// Common schemes:
//   Average acceleration: β = 1/4, γ = 1/2  (unconditionally stable, no dissipation)
//   Linear acceleration:  β = 1/6, γ = 1/2  (conditionally stable)
//   Fox-Goodwin:          β = 1/12, γ = 1/2 (conditionally stable)
//
// For the average acceleration method applied to SDOF: m a + k u = 0
//   Spectral radius ρ ≤ 1 for all Δt/T (unconditional stability).
//
// The amplification matrix eigenvalues give spectral radius.
//
// Reference: Newmark (1959); Bathe, Ch. 9; Hughes, Ch. 9

#[test]
fn validation_newmark_beta_stability() {
    // SDOF: m=1, k=ω², free vibration u(0)=1, v(0)=0
    let omega: f64 = 2.0 * PI; // ω = 2π rad/s → T = 1 s
    let t_period: f64 = 2.0 * PI / omega;
    assert_close(t_period, 1.0, 1e-12, "Period T = 1 s");

    // Average acceleration (β=1/4, γ=1/2)
    let beta: f64 = 0.25;
    let gamma: f64 = 0.5;

    // Stability criterion: 2β ≥ γ ≥ 1/2
    assert!(2.0 * beta >= gamma, "2β ≥ γ for stability");
    assert!(gamma >= 0.5, "γ ≥ 1/2 for stability");

    // Verify with Δt = T/10 (fine) and Δt = T (coarse)
    // For avg acceleration, spectral radius ρ = 1 for all Δt (energy conserving)
    for &n_steps_per_period in &[10_i32, 4, 2, 1] {
        let dt: f64 = t_period / n_steps_per_period as f64;
        let omega_dt: f64 = omega * dt;

        // Amplification matrix spectral radius for average acceleration:
        // ρ = 1.0 exactly (energy conserving)
        // The spectral radius can be computed from:
        //   A₁ = 1 - ω²Δt²/2 · 1/(1 + ω²Δt²β)  ... but for avg accel:
        //   ρ² = [(4 - Ω²)² + 4Ω²] / (4 + Ω²)²  where Ω = ωΔt
        let omega_sq: f64 = omega_dt * omega_dt;
        let numerator: f64 = (4.0 - omega_sq).powi(2) + 4.0 * omega_sq;
        let denominator: f64 = (4.0 + omega_sq).powi(2);
        let _rho_sq: f64 = numerator / denominator;

        // numerator = 16 - 8Ω² + Ω⁴ + 4Ω² = 16 - 4Ω² + Ω⁴
        // denominator = 16 + 8Ω² + Ω⁴
        // For avg acceleration these should simplify such that ρ = 1:
        // Actually: num = (4-Ω²)² + (2Ω)² = 16 - 8Ω² + Ω⁴ + 4Ω²
        //         = 16 - 4Ω² + Ω⁴
        // den = (4+Ω²)² = 16 + 8Ω² + Ω⁴
        // ρ² = (16 - 4Ω² + Ω⁴) / (16 + 8Ω² + Ω⁴)
        // This equals 1 only when -4Ω² = 8Ω², i.e., Ω=0.
        // So ρ < 1 for finite Δt (numerical damping). But for avg accel,
        // the correct formula gives ρ = 1 exactly. Let's use the correct one:
        //
        // For β=1/4, γ=1/2 (trapezoidal rule), the spectral radius is exactly 1.
        // The correct amplification matrix for m*a + k*u = 0:
        //   (m + β Δt² k) a_{n+1} = -(k u_n + k Δt v_n + k Δt²(0.5-β) a_n)
        // etc. The eigenvalues of the amplification matrix have |λ| = 1 exactly.
        //
        // A simpler verification: energy at each step.
        // E_n = ½ m v² + ½ k u² should be constant.

        // Simulate one full period and check energy conservation
        let m: f64 = 1.0;
        let k: f64 = omega * omega * m;
        let mut u: f64 = 1.0;
        let mut v: f64 = 0.0;
        let mut a: f64 = -k * u / m;
        let e0: f64 = 0.5 * m * v * v + 0.5 * k * u * u;

        let n_total: i32 = n_steps_per_period;
        for _ in 0..n_total {
            // Predict
            let u_pred: f64 = u + dt * v + dt * dt * (0.5 - beta) * a;
            let v_pred: f64 = v + dt * (1.0 - gamma) * a;
            // Solve for a_{n+1}
            let a_new: f64 = -(k * u_pred) / (m + beta * dt * dt * k);
            // Correct
            u = u_pred + beta * dt * dt * a_new;
            v = v_pred + gamma * dt * a_new;
            a = a_new;
        }

        let e_final: f64 = 0.5 * m * v * v + 0.5 * k * u * u;
        let energy_err: f64 = (e_final - e0).abs() / e0;
        assert!(
            energy_err < 1e-10,
            "Newmark avg accel energy conservation: Δt/T = 1/{}, energy err = {:.2e}",
            n_steps_per_period, energy_err
        );
    }
}
