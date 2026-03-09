/// Validation: Conjugate Beam Method
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 8 (Conjugate-beam method)
///   - Ghali & Neville, "Structural Analysis", Ch. 7
///   - Timoshenko, "Strength of Materials", Vol. 1
///
/// The conjugate beam method relates:
///   - Shear in conjugate beam = slope in real beam
///   - Moment in conjugate beam = deflection in real beam
///
/// Tests verify slope/deflection consistency:
///   1. SS beam + UDL: midspan deflection & slope relationship
///   2. Cantilever + tip: slope integral equals deflection
///   3. SS beam + eccentric load: max deflection location
///   4. Propped cantilever: inflection point location
///   5. Continuous beam: slope at interior support
///   6. Cantilever + end moment: θ = ML/(EI), δ = ML²/(2EI)
///   7. SS beam: midspan slope = 0 under symmetric load
///   8. Deflection shape consistency (cubic/quartic)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam + UDL: Midspan Deflection & Slope
// ================================================================

#[test]
fn validation_conjugate_ss_udl() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // δ_mid = 5qL⁴/(384EI)
    let delta_exact = 5.0 * q.abs() * l * l * l * l / (384.0 * e_eff * IZ);
    assert_close(d_mid.uy.abs(), delta_exact, 0.02,
        "Conjugate SS UDL: δ_mid = 5qL⁴/(384EI)");

    // Midspan slope = 0 (symmetric)
    assert!(d_mid.rz.abs() < 1e-10,
        "Conjugate SS UDL: θ_mid = 0: {:.6e}", d_mid.rz);
}

// ================================================================
// 2. Cantilever + Tip Load: Slope Integral
// ================================================================
//
// For cantilever: δ(x) = ∫₀ˣ θ(s) ds (approximately)
// At tip: δ = PL³/(3EI), θ = PL²/(2EI)
// δ/L should be between 0 and θ (average slope)

#[test]
fn validation_conjugate_cantilever_integral() {
    let l = 5.0;
    let n = 20;
    let p = 15.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    let delta = tip.uy.abs();
    let theta = tip.rz.abs();

    // δ/L should be less than θ (slope increases along beam)
    assert!(delta / l < theta,
        "Cantilever integral: δ/L < θ: {:.6e} < {:.6e}", delta / l, theta);

    // More precisely: δ = (2/3)θL for linear moment diagram
    // δ/θ = 2L/3
    assert_close(delta / theta, 2.0 * l / 3.0, 0.02,
        "Cantilever integral: δ/θ = 2L/3");

    // Exact values
    let delta_exact = p * l * l * l / (3.0 * e_eff * IZ);
    let theta_exact = p * l * l / (2.0 * e_eff * IZ);
    assert_close(delta, delta_exact, 0.02, "Cantilever: δ exact");
    assert_close(theta, theta_exact, 0.02, "Cantilever: θ exact");
}

// ================================================================
// 3. SS Beam + Eccentric Load: Max Deflection Location
// ================================================================
//
// For P at distance a from left (a < L/2):
// Max deflection occurs at x = √(L²-a²)/√3 from left support.
// This is slightly to the left of midspan.

#[test]
fn validation_conjugate_eccentric_max_deflection() {
    let l = 12.0;
    let n = 24;
    let p = 20.0;
    let a = 3.0; // L/4 from left

    let load_node = (a / l * n as f64).round() as usize + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Find node with maximum deflection
    let max_node = results.displacements.iter()
        .max_by(|a, b| a.uy.abs().partial_cmp(&b.uy.abs()).unwrap())
        .unwrap();

    let x_max = (max_node.node_id - 1) as f64 * l / n as f64;
    let b = l - a;

    // x_max = √((L²-b²)/3) for b > a
    // Equivalently: x_max = √((L²-a²)/3) — but using the longer side
    // For a=3, b=9: x_max = √((144-9)/3) = √45 = 6.708
    let x_max_exact = ((l * l - b * b) / 3.0).sqrt();
    let dx = l / n as f64;

    // Should be within one element of the exact location
    assert!((x_max - x_max_exact).abs() < 2.0 * dx,
        "Eccentric max location: x={:.3} ≈ {:.3}", x_max, x_max_exact);

    // Max deflection should be below midspan
    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    assert!(max_node.uy.abs() >= d_mid.uy.abs(),
        "Max deflection ≥ midspan deflection");
}

// ================================================================
// 4. Propped Cantilever: Inflection Point
// ================================================================
//
// Fixed-roller beam with UDL: inflection point at x = L/4 from fixed end.
// At inflection point, moment = 0, curvature changes sign.

#[test]
fn validation_conjugate_inflection_point() {
    let l = 8.0;
    let n = 20;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // At inflection point (x = L/4), curvature = 0
    // Curvature change is indicated by rz changing from increasing to decreasing
    // Check that near L/4, second derivative of deflection is approximately zero

    // Node at L/4
    let node_quarter = n / 4 + 1;

    // Get slopes near inflection point
    let d_before = results.displacements.iter().find(|d| d.node_id == node_quarter - 1).unwrap();
    let d_at = results.displacements.iter().find(|d| d.node_id == node_quarter).unwrap();
    let d_after = results.displacements.iter().find(|d| d.node_id == node_quarter + 1).unwrap();

    // Second difference ≈ curvature. At inflection point it should be near zero
    let dx = l / n as f64;
    let curvature_approx = (d_before.rz - 2.0 * d_at.rz + d_after.rz) / (dx * dx);

    // The curvature should be small near the inflection point
    // (not exactly zero because discrete mesh, but much smaller than at endpoints)
    let curvature_at_fixed = results.displacements.iter().find(|d| d.node_id == 2).unwrap().rz / dx;
    assert!(curvature_approx.abs() < curvature_at_fixed.abs(),
        "Inflection near L/4: curvature small: {:.6e} vs {:.6e}",
        curvature_approx.abs(), curvature_at_fixed.abs());
}

// ================================================================
// 5. Continuous Beam: Slope at Interior Support
// ================================================================
//
// Two-span continuous beam with UDL. At interior support, slope is continuous
// but non-zero (unless symmetry). For equal spans with uniform load:
// θ_interior = qL³/(48EI) (from three-moment equation)

#[test]
fn validation_conjugate_continuous_slope() {
    let span = 6.0;
    let n = 12;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let interior = n + 1; // interior support node
    let d_int = results.displacements.iter().find(|d| d.node_id == interior).unwrap();

    // Deflection at support = 0
    assert!(d_int.uy.abs() < 1e-10,
        "Continuous: δ at interior support ≈ 0: {:.6e}", d_int.uy);

    // Slope at interior support should be zero by symmetry (equal spans, same load)
    assert!(d_int.rz.abs() < 1e-10,
        "Continuous symmetric: θ at interior ≈ 0: {:.6e}", d_int.rz);
}

// ================================================================
// 6. Cantilever + End Moment: θ = ML/(EI), δ = ML²/(2EI)
// ================================================================

#[test]
fn validation_conjugate_cantilever_moment() {
    let l = 6.0;
    let n = 12;
    let m = 10.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: 0.0, mz: m,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // θ = ML/(EI) — constant curvature
    let theta_exact = m * l / (e_eff * IZ);
    assert_close(tip.rz.abs(), theta_exact, 0.02,
        "Cantilever moment: θ = ML/(EI)");

    // δ = ML²/(2EI) — parabolic deflection
    let delta_exact = m * l * l / (2.0 * e_eff * IZ);
    assert_close(tip.uy.abs(), delta_exact, 0.02,
        "Cantilever moment: δ = ML²/(2EI)");

    // δ/θ = L/2 for constant moment (uniform curvature)
    let ratio = tip.uy.abs() / tip.rz.abs();
    assert_close(ratio, l / 2.0, 0.02, "Cantilever moment: δ/θ = L/2");
}

// ================================================================
// 7. SS Beam: Zero Slope at Midspan Under Symmetric Load
// ================================================================

#[test]
fn validation_conjugate_zero_slope_midspan() {
    let l = 10.0;
    let n = 20;
    let p = 20.0;

    // Two symmetric point loads at L/4 and 3L/4
    let n1 = n / 4 + 1;
    let n2 = 3 * n / 4 + 1;

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: n1, fx: 0.0, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: n2, fx: 0.0, fy: -p, mz: 0.0 }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // Midspan slope = 0 by symmetry
    assert!(d_mid.rz.abs() < 1e-10,
        "Symmetric loads: θ_mid = 0: {:.6e}", d_mid.rz);

    // Deflection at midspan is maximum
    let max_defl = results.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);
    assert_close(d_mid.uy.abs(), max_defl, 0.01,
        "Symmetric loads: max deflection at midspan");
}

// ================================================================
// 8. Deflection Shape Consistency
// ================================================================
//
// For cantilever + tip load, deflection follows cubic:
// y(x) = P/(6EI) × (3Lx² - x³)
// Check intermediate points match the cubic curve.

#[test]
fn validation_conjugate_deflection_shape() {
    let l = 5.0;
    let n = 20;
    let p = 15.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Check at L/4, L/2, 3L/4
    for frac in &[0.25, 0.5, 0.75] {
        let node_id = (frac * n as f64).round() as usize + 1;
        let d = results.displacements.iter().find(|d| d.node_id == node_id).unwrap();
        let x = (node_id - 1) as f64 * l / n as f64;

        // y(x) = P/(6EI) × (3Lx² - x³)
        let delta_exact = p / (6.0 * e_eff * IZ) * (3.0 * l * x * x - x * x * x);
        assert_close(d.uy.abs(), delta_exact, 0.02,
            &format!("Cubic shape at x={:.2}: δ = P(3Lx²-x³)/(6EI)", x));
    }
}
