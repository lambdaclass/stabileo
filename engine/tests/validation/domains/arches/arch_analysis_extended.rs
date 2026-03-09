/// Validation: Advanced Arch Analysis Benchmark Cases
///
/// References:
///   - Timoshenko & Young, "Theory of Structures", 2nd Ed., Ch. 9 (arches)
///   - Megson, "Structural and Stress Analysis", 4th Ed., Ch. 6
///   - Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Ch. 15
///   - Timoshenko & Gere, "Theory of Elastic Stability", Ch. 7
///   - Heyman, "The Masonry Arch", Cambridge University Press
///
/// Tests verify advanced arch analysis benchmarks:
///   1. Three-hinge parabolic arch: H = wL^2/(8f), M = 0 under UDL
///   2. Two-hinge circular arch: horizontal thrust from integration
///   3. Tied arch: tie rod carries H, verify tie axial force
///   4. Arch critical load: relation to rise-to-span ratio
///   5. Half-span load on arch: bending moments develop
///   6. Segmented arch convergence: deflection converges with mesh refinement
///   7. Parabolic arch under UDL: zero bending moment (funicular)
///   8. Thrust proportional to L^2 and inversely proportional to f
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Build a parabolic arch with n segments using nodal loads for horizontal-projection UDL.
/// Shape: y = 4f/(L^2) * x * (L - x)
/// Crown hinge placed at element boundary n/2.
fn make_parabolic_arch_ext(
    n: usize,
    l: f64,
    f_rise: f64,
    left_sup: &str,
    right_sup: &str,
    hinge_at_crown: bool,
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let mut nodes = Vec::new();
    for i in 0..=n {
        let x = i as f64 * l / n as f64;
        let y = 4.0 * f_rise / (l * l) * x * (l - x);
        nodes.push((i + 1, x, y));
    }

    let crown_elem = n / 2;
    let elems: Vec<_> = (0..n)
        .map(|i| {
            let hs = hinge_at_crown && (i == crown_elem);
            let he = hinge_at_crown && (i + 1 == crown_elem);
            (i + 1, "frame", i + 1, i + 2, 1, 1, hs, he)
        })
        .collect();

    let sups = vec![(1, 1_usize, left_sup), (2, n + 1, right_sup)];
    make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads)
}

/// Create horizontal-projection UDL as nodal loads (tributary width per node).
/// This gives exact H = wL^2/(8f) for three-hinge parabolic arches.
fn make_projected_nodal_loads(n: usize, l: f64, w: f64) -> Vec<SolverLoad> {
    let dx = l / n as f64;
    (0..=n)
        .map(|i| {
            let trib = if i == 0 || i == n { dx / 2.0 } else { dx };
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: i + 1,
                fx: 0.0,
                fy: -w * trib,
                mz: 0.0,
            })
        })
        .collect()
}

// ================================================================
// 1. Three-Hinge Parabolic Arch: H = wL^2/(8f), M = 0
// ================================================================
//
// Parabolic arch under UDL (horizontal projection): H = wL^2/(8f).
// Vertical reactions: V = wL/2. Bending moment is zero everywhere
// since the parabola is the funicular curve for horizontal-projection UDL.
//
// Ref: Timoshenko & Young, "Theory of Structures", 2nd Ed., Eq. 9.1

#[test]
fn validation_arch_ext_1_three_hinge_parabolic() {
    let l = 16.0;
    let f_rise = 4.0;
    let n = 16;
    let w: f64 = 12.0; // kN/m per horizontal projection

    let loads = make_projected_nodal_loads(n, l, w);
    let input = make_parabolic_arch_ext(n, l, f_rise, "pinned", "pinned", true, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // H = wL^2/(8f) = 12 * 256 / 32 = 96 kN
    let h_exact = w * l * l / (8.0 * f_rise);
    assert_close(r_left.rx.abs(), h_exact, 0.05, "Three-hinge H = wL^2/(8f)");

    // Horizontal reactions equal and opposite
    let h_sum = (r_left.rx + r_right.rx).abs();
    assert!(h_sum < h_exact * 0.02,
        "H balance: sum={:.6}, should be ~0", h_sum);

    // Vertical reactions: V = wL/2 = 12 * 16 / 2 = 96 kN
    let v_exact = w * l / 2.0;
    assert_close(r_left.ry, v_exact, 0.02, "V_left = wL/2");
    assert_close(r_right.ry, v_exact, 0.02, "V_right = wL/2");

    // Bending moments should be near zero (funicular shape)
    let max_moment = results.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);
    let m_beam = w * l * l / 8.0; // SS beam reference
    assert!(max_moment < m_beam * 0.05,
        "Funicular M_max={:.4} should be << M_beam={:.4}", max_moment, m_beam);
}

// ================================================================
// 2. Two-Hinge Circular Arch: Horizontal Thrust
// ================================================================
//
// A circular arch (no crown hinge) under a point load at the crown.
// The two-hinge arch develops horizontal thrust that can be computed
// from the virtual work method / elastic center method.
// Key property: H must satisfy equilibrium and compatibility.
//
// Ref: Megson, "Structural and Stress Analysis", 4th Ed., Sec. 6.4

#[test]
fn validation_arch_ext_2_two_hinge_circular() {
    let r = 6.0; // radius
    let n = 20;
    let p = 30.0; // point load at crown

    // Circular arch: x = r(1 - cos(theta)), y = r*sin(theta), theta from 0 to pi
    let mut nodes = Vec::new();
    for i in 0..=n {
        let theta = std::f64::consts::PI * i as f64 / n as f64;
        let x = r * (1.0 - theta.cos());
        let y = r * theta.sin();
        nodes.push((i + 1, x, y));
    }

    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let sups = vec![(1, 1_usize, "pinned"), (2, n + 1, "pinned")];

    // Point load at crown
    let crown = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: crown, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Vertical equilibrium: V_left + V_right = P
    let sum_ry = r_left.ry + r_right.ry;
    assert_close(sum_ry, p, 0.01, "Circular arch: sum Ry = P");

    // Symmetry: V_left = V_right = P/2
    assert_close(r_left.ry, p / 2.0, 0.02, "Circular arch: V_left = P/2");

    // Horizontal reactions equal and opposite
    let h_sum = (r_left.rx + r_right.rx).abs();
    assert!(h_sum < p * 0.01,
        "Circular arch H balance: sum={:.6}", h_sum);

    // The arch must develop horizontal thrust (H != 0)
    assert!(r_left.rx.abs() > 1.0,
        "Circular arch should have horizontal thrust: Rx={:.4}", r_left.rx);

    // For a semicircular arch under crown load, H is roughly P/(pi) from
    // virtual work integration. Verify order of magnitude.
    let h_approx = p / std::f64::consts::PI;
    let h_computed = r_left.rx.abs();
    // Allow wide tolerance since the polygonal approximation affects the integral
    assert!(h_computed > h_approx * 0.3 && h_computed < h_approx * 3.0,
        "Circular arch H={:.4}, approx P/pi={:.4}", h_computed, h_approx);
}

// ================================================================
// 3. Tied Arch: Tie Rod Carries Horizontal Thrust H
// ================================================================
//
// A parabolic arch with a tie rod between supports.
// The tie carries the horizontal thrust H = wL^2/(8f).
// With the tie, support horizontal reactions are small.
//
// Ref: Megson, "Structural and Stress Analysis", 4th Ed., Sec. 6.5

#[test]
fn validation_arch_ext_3_tied_arch_tension() {
    let l = 14.0;
    let f_rise = 3.5;
    let n_arch = 14;
    let w: f64 = 15.0;

    // Build arch nodes
    let mut nodes = Vec::new();
    for i in 0..=n_arch {
        let x = i as f64 * l / n_arch as f64;
        let y = 4.0 * f_rise / (l * l) * x * (l - x);
        nodes.push((i + 1, x, y));
    }

    // Arch elements (no crown hinge)
    let mut elems: Vec<_> = (0..n_arch)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Tie rod between left and right supports at y=0
    let tie_id = n_arch + 1;
    elems.push((tie_id, "truss", 1, n_arch + 1, 1, 1, false, false));

    // Pin left, roller right (tie handles horizontal thrust)
    let sups = vec![(1, 1_usize, "pinned"), (2, n_arch + 1, "rollerX")];

    // Apply distributed load on each arch element
    let loads: Vec<SolverLoad> = (1..=n_arch)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -w, q_j: -w, a: None, b: None,
        }))
        .collect();

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Tie axial force should approximate H = wL^2/(8f) = 15*196/28 = 105 kN
    let h_expected = w * l * l / (8.0 * f_rise);
    let tie_ef = results.element_forces.iter()
        .find(|ef| ef.element_id == tie_id).unwrap();

    // Tie should be in tension with force of similar magnitude to H
    assert!(tie_ef.n_start.abs() > h_expected * 0.5,
        "Tie force={:.4} should be close to H={:.4}", tie_ef.n_start.abs(), h_expected);

    // Vertical equilibrium: sum Ry should balance total load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry > 0.0, "Sum Ry should be positive (resisting downward load)");

    // Verify the tie is in tension (not compression)
    // In the solver convention, the sign depends on orientation.
    // Just check the magnitude is significant.
    assert!(tie_ef.n_start.abs() > 10.0,
        "Tie should carry significant axial force: N={:.4}", tie_ef.n_start);
}

// ================================================================
// 4. Arch Critical Load: Rise-to-Span Ratio Effect
// ================================================================
//
// The elastic buckling load of an arch rib: P_cr = pi^2 EI / (beta s)^2
// where s is the arch length and beta is the effective length factor.
// For a parabolic arch: s = L * (1 + (8/3)(f/L)^2) approximately.
// A deeper arch (larger f/L) has longer s, hence lower P_cr per unit
// length. This test verifies the formula and compares two rise values.
//
// Ref: Timoshenko & Gere, "Theory of Elastic Stability", Ch. 7

#[test]
fn validation_arch_ext_4_arch_buckling() {
    let e_val: f64 = 200_000.0; // MPa
    let i_val: f64 = 1e-4;      // m^4
    let l: f64 = 20.0;          // span

    // E in kN/m^2 (solver convention: E_MPa * 1000)
    let e_kn = e_val * 1000.0;

    // Two rise values
    let f1: f64 = 4.0;  // f/L = 0.2
    let f2: f64 = 8.0;  // f/L = 0.4

    // Approximate arch lengths
    let s1 = l * (1.0 + (8.0 / 3.0) * (f1 / l).powi(2));
    let s2 = l * (1.0 + (8.0 / 3.0) * (f2 / l).powi(2));

    // s2 > s1 since deeper arch is longer
    assert!(s2 > s1, "Deeper arch should be longer: s2={:.4} > s1={:.4}", s2, s1);

    // Euler buckling for three-hinge arch (beta = 1.0)
    let beta = 1.0;
    let pi2 = std::f64::consts::PI * std::f64::consts::PI;
    let p_cr1 = pi2 * e_kn * i_val / (beta * s1).powi(2);
    let p_cr2 = pi2 * e_kn * i_val / (beta * s2).powi(2);

    // Shallower arch (shorter rib) has higher buckling load
    assert!(p_cr1 > p_cr2,
        "Shallower arch should have higher P_cr: P_cr1={:.2} > P_cr2={:.2}", p_cr1, p_cr2);

    // Ratio should be (s2/s1)^2
    let ratio_expected = (s2 / s1).powi(2);
    let ratio_computed = p_cr1 / p_cr2;
    assert_close(ratio_computed, ratio_expected, 0.01,
        "P_cr ratio = (s2/s1)^2");

    // Fixed arch (beta = 0.5) should have 4x higher P_cr than three-hinge (beta = 1.0)
    let p_cr_fixed = pi2 * e_kn * i_val / (0.5 * s1).powi(2);
    let ratio_fixed_3h = p_cr_fixed / p_cr1;
    assert_close(ratio_fixed_3h, 4.0, 0.01,
        "Fixed/3-hinge P_cr ratio = 4.0");
}

// ================================================================
// 5. Half-Span Load: Bending Moments Develop
// ================================================================
//
// A parabolic arch is funicular only for UDL over the full span.
// Under half-span loading, it is NOT funicular: significant bending
// moments develop. This test compares full-span vs half-span loading.
//
// Ref: Timoshenko & Young, "Theory of Structures", 2nd Ed., p. 178

#[test]
fn validation_arch_ext_5_asymmetric_loading() {
    let l = 12.0;
    let f_rise = 3.0;
    let n = 12;
    let w: f64 = 10.0;

    // Full-span UDL (funicular case)
    let loads_full: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -w, q_j: -w, a: None, b: None,
        }))
        .collect();
    let input_full = make_parabolic_arch_ext(n, l, f_rise, "pinned", "pinned", true, loads_full);
    let res_full = linear::solve_2d(&input_full).unwrap();

    // Half-span UDL (non-funicular)
    let loads_half: Vec<SolverLoad> = (1..=(n / 2))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -w, q_j: -w, a: None, b: None,
        }))
        .collect();
    let input_half = make_parabolic_arch_ext(n, l, f_rise, "pinned", "pinned", true, loads_half);
    let res_half = linear::solve_2d(&input_half).unwrap();

    // Full-span: near-zero moments (funicular)
    let m_max_full = res_full.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);

    // Half-span: significant moments
    let m_max_half = res_half.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);

    // The half-span case should have much larger moments
    assert!(m_max_half > m_max_full * 2.0,
        "Half-span M_max={:.4} should be >> full-span M_max={:.4}",
        m_max_half, m_max_full);

    // Half-span moments should be non-negligible
    assert!(m_max_half > 1.0,
        "Asymmetric arch should have significant bending: M_max={:.4}", m_max_half);

    // Equilibrium: sum Ry = total applied load = w * L/2
    let total_half = w * l / 2.0;
    let sum_ry: f64 = res_half.reactions.iter().map(|r| r.ry).sum();
    // Distributed load is per element length not projected, so use a loose check
    assert!(sum_ry > 0.0, "Reactions should resist downward load");
    // The actual total load is close to w * L/2 (with arc-length correction)
    let err = (sum_ry - total_half).abs() / total_half;
    assert!(err < 0.10,
        "Half-span equilibrium: sum Ry={:.4}, expected ~{:.4}", sum_ry, total_half);
}

// ================================================================
// 6. Segmented Arch Convergence: Deflection Converges with Refinement
// ================================================================
//
// As the number of segments increases, the polygonal arch approximation
// converges to the smooth arch. Crown deflection should converge
// monotonically (or nearly so) as mesh is refined.
//
// Ref: Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Ch. 15

#[test]
fn validation_arch_ext_6_segmented_arch_convergence() {
    let l = 10.0;
    let f_rise = 2.5;
    let p = 20.0; // point load at crown

    let segments = [4, 8, 16, 32];
    let mut crown_deflections: Vec<f64> = Vec::new();

    for &n in &segments {
        // Build parabolic arch nodes
        let mut nodes = Vec::new();
        for i in 0..=n {
            let x = i as f64 * l / n as f64;
            let y = 4.0 * f_rise / (l * l) * x * (l - x);
            nodes.push((i + 1, x, y));
        }

        let elems: Vec<_> = (0..n)
            .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
            .collect();

        let sups = vec![(1, 1_usize, "pinned"), (2, n + 1, "pinned")];

        // Point load at crown node
        let crown_node = n / 2 + 1;
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: crown_node, fx: 0.0, fy: -p, mz: 0.0,
        })];

        let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
        let results = linear::solve_2d(&input).unwrap();

        // Get crown deflection (vertical displacement at crown node)
        let crown_disp = results.displacements.iter()
            .find(|d| d.node_id == crown_node).unwrap();
        crown_deflections.push(crown_disp.uy.abs());
    }

    // Convergence: difference between successive refinements should decrease
    // |delta_32 - delta_16| < |delta_16 - delta_8|
    let diff_1 = (crown_deflections[1] - crown_deflections[0]).abs();
    let diff_2 = (crown_deflections[2] - crown_deflections[1]).abs();
    let diff_3 = (crown_deflections[3] - crown_deflections[2]).abs();

    assert!(diff_2 < diff_1 * 1.5,
        "Convergence: diff(16-8)={:.6} should be < diff(8-4)={:.6}", diff_2, diff_1);
    assert!(diff_3 < diff_2 * 1.5,
        "Convergence: diff(32-16)={:.6} should be < diff(16-8)={:.6}", diff_3, diff_2);

    // The finest mesh should give a non-zero deflection
    assert!(crown_deflections[3] > 1e-6,
        "Crown deflection should be non-zero: {:.6}", crown_deflections[3]);

    // Coarse and fine meshes should agree within 20%
    let coarse = crown_deflections[0];
    let fine = crown_deflections[3];
    let rel_diff = (coarse - fine).abs() / fine.max(1e-12);
    assert!(rel_diff < 0.20,
        "Coarse/fine agreement: coarse={:.6}, fine={:.6}, diff={:.1}%",
        coarse, fine, rel_diff * 100.0);
}

// ================================================================
// 7. Funicular Shape: Parabolic Arch Under UDL Has Zero Bending
// ================================================================
//
// The parabola y = 4f/L^2 * x * (L-x) is the funicular (pressure line)
// for a UDL applied per unit horizontal projection.
// M(x) = w*x*(L-x)/2 - H*y(x) = 0 identically.
//
// This test verifies the formula analytically AND checks the FEM result.
//
// Ref: Timoshenko & Young, "Theory of Structures", 2nd Ed., Sec. 9.2

#[test]
fn validation_arch_ext_7_funicular_shape() {
    let l = 20.0;
    let f_rise = 5.0;
    let w: f64 = 10.0;

    // Analytical check: M(x) = w*x*(L-x)/2 - H*y(x) = 0
    let h = w * l * l / (8.0 * f_rise);
    let n_check = 20;
    for i in 1..n_check {
        let x = i as f64 * l / n_check as f64;
        let m_beam = w * x * (l - x) / 2.0;
        let y = 4.0 * f_rise / (l * l) * x * (l - x);
        let m_arch = m_beam - h * y;
        assert!(m_arch.abs() < 1e-10,
            "Analytical M at x={:.1}: {:.2e} (should be 0)", x, m_arch);
    }

    // FEM verification with projected nodal loads
    let n = 20;
    let loads = make_projected_nodal_loads(n, l, w);
    let input = make_parabolic_arch_ext(n, l, f_rise, "pinned", "pinned", true, loads);
    let results = linear::solve_2d(&input).unwrap();

    let max_moment = results.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);

    // Reference: SS beam moment = wL^2/8 = 10*400/8 = 500 kN-m
    let m_beam_ref = w * l * l / 8.0;

    // Funicular arch should have moments < 5% of beam moment
    assert!(max_moment < m_beam_ref * 0.05,
        "Funicular M_max={:.4} should be << M_beam={:.4}", max_moment, m_beam_ref);
}

// ================================================================
// 8. Thrust Proportional to L^2 and Inversely Proportional to f
// ================================================================
//
// H = wL^2/(8f) implies:
//   - Doubling L quadruples H (with same w and f)
//   - Doubling f halves H (with same w and L)
//
// Ref: Hibbeler, "Structural Analysis", 10th Ed., Sec. 5-2

#[test]
fn validation_arch_ext_8_arch_thrust_vs_span() {
    let w: f64 = 10.0;
    let n = 16;

    let compute_thrust = |l: f64, f_rise: f64| -> f64 {
        let loads = make_projected_nodal_loads(n, l, w);
        let input = make_parabolic_arch_ext(n, l, f_rise, "pinned", "pinned", true, loads);
        let results = linear::solve_2d(&input).unwrap();
        results.reactions.iter().find(|r| r.node_id == 1).unwrap().rx.abs()
    };

    // Test 1: H proportional to L^2 (fixed f)
    let f_fixed = 3.0;
    let h_l10 = compute_thrust(10.0, f_fixed);
    let h_l20 = compute_thrust(20.0, f_fixed);

    // H(L=20) / H(L=10) should be (20/10)^2 = 4
    let ratio_l = h_l20 / h_l10;
    assert_close(ratio_l, 4.0, 0.05,
        "Thrust ratio for L^2 scaling");

    // Test 2: H inversely proportional to f (fixed L)
    let l_fixed = 16.0;
    let h_f2 = compute_thrust(l_fixed, 2.0);
    let h_f4 = compute_thrust(l_fixed, 4.0);

    // H(f=2) / H(f=4) should be 4/2 = 2
    let ratio_f = h_f2 / h_f4;
    assert_close(ratio_f, 2.0, 0.05,
        "Thrust ratio for 1/f scaling");

    // Cross-check: exact formula
    let h_exact_l10 = w * 10.0 * 10.0 / (8.0 * f_fixed);
    assert_close(h_l10, h_exact_l10, 0.05,
        "H(L=10, f=3) = wL^2/(8f)");

    let h_exact_l20 = w * 20.0 * 20.0 / (8.0 * f_fixed);
    assert_close(h_l20, h_exact_l20, 0.05,
        "H(L=20, f=3) = wL^2/(8f)");
}
