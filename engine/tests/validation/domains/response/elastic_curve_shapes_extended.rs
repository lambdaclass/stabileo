/// Validation: Elastic Curve Shapes — Extended Tests
///
/// References:
///   - Timoshenko & Gere, "Mechanics of Materials", Ch. 9
///   - Hibbeler, "Mechanics of Materials", Ch. 12
///   - Gere & Goodno, "Mechanics of Materials", Ch. 9
///   - AISC Steel Construction Manual, Table 3-23
///
/// These tests extend the original elastic curve shape validation suite
/// with additional boundary conditions, load types, and analytical checks
/// that go beyond the basic parabolic/cubic/quartic cases.
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Cantilever with Pure End Moment: Parabolic Deflection
// ================================================================
//
// For a cantilever (fixed at x=0, free at x=L) with end moment M:
//   delta(x) = M*x^2 / (2*EI)
// The deflection is purely parabolic (no cubic or higher terms).

#[test]
fn validation_elastic_curve_ext_cantilever_end_moment_parabolic() {
    let l = 6.0;
    let n: usize = 24;
    let m_val: f64 = 50.0; // Applied moment at free end (positive = CCW)
    let e_eff = E * 1000.0;
    let ei = e_eff * IZ;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: 0.0,
        fz: 0.0,
        my: m_val,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let check_nodes = vec![
        (n / 4 + 1, l / 4.0, "quarter"),
        (n / 2 + 1, l / 2.0, "midspan"),
        (3 * n / 4 + 1, 3.0 * l / 4.0, "three-quarter"),
        (n + 1, l, "tip"),
    ];

    for (node_id, x, label) in check_nodes {
        let uy = results
            .displacements
            .iter()
            .find(|d| d.node_id == node_id)
            .unwrap()
            .uz;
        // Analytical: delta(x) = M*x^2 / (2*EI)
        // Positive M causes upward deflection (positive uy).
        let delta_exact: f64 = m_val * x * x / (2.0 * ei);
        assert_close(
            uy.abs(),
            delta_exact.abs(),
            0.03,
            &format!("Cantilever end moment shape at {}", label),
        );
    }
}

// ================================================================
// 2. SS Beam with Two Symmetric Point Loads (Four-Point Bending)
// ================================================================
//
// Simply-supported beam with two equal loads P at x=a and x=L-a.
// For x <= a:
//   delta(x) = P*a*x / (6*EI*L) * (L^2 - a^2 - x^2)
// Between loads (a <= x <= L-a) the moment is constant = P*a,
// and the deflection follows:
//   delta(x) = P*a / (6*EI*L) * (3*L*x^2 - 3*x^3 - a^2*x ... )
// Midspan:
//   delta_mid = P*a / (24*EI) * (3*L^2 - 4*a^2)

#[test]
fn validation_elastic_curve_ext_four_point_bending_midspan() {
    let l = 12.0;
    let n: usize = 24;
    let p: f64 = 20.0;
    let a_pos: f64 = l / 3.0; // loads at L/3 and 2L/3
    let e_eff = E * 1000.0;
    let ei = e_eff * IZ;

    // Nodes at L/3 and 2L/3
    let node_left = n / 3 + 1; // node at a
    let node_right = 2 * n / 3 + 1; // node at L-a
    let mid = n / 2 + 1;

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_left,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_right,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Check midspan deflection
    let uy_mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid)
        .unwrap()
        .uz;
    // Analytical midspan: delta_mid = P*a / (24*EI) * (3*L^2 - 4*a^2)
    let delta_mid_exact: f64 =
        p * a_pos / (24.0 * ei) * (3.0 * l * l - 4.0 * a_pos * a_pos);
    assert_close(
        uy_mid.abs(),
        delta_mid_exact.abs(),
        0.03,
        "Four-point bending midspan deflection",
    );

    // Check at load point (x = a): delta(a) = P*a^2*(3*L - 4*a) / (12*EI*L)
    // (from superposition of two off-center loads; simplified for symmetric case)
    let uy_load = results
        .displacements
        .iter()
        .find(|d| d.node_id == node_left)
        .unwrap()
        .uz;
    // For single load P at a on SS beam: delta(a) = P*a^2*b^2/(3*EI*L) where b = L-a
    // For two symmetric loads: delta(a) = P*a/(6*EI*L)*(L^2 - a^2 - a^2) + contribution from second load
    // Simpler: use delta_at_load = P*a*(3*L^2 - 4*a^2) / (48*EI) * 2*a/L ... let's use exact formula.
    // For x=a with load at a: Pa(L-a)/(6*L*EI) * (2*L*a - a^2 - a^2) = Pa(L-a)/(6LEI)*(2La-2a^2)
    // Actually from standard table: for load P at distance a from left on SS beam of span L:
    //   delta(x) = P*b*x/(6*L*EI)*(L^2 - b^2 - x^2) for x <= a, where b = L-a
    // At x=a: delta(a) = P*b*a/(6*L*EI)*(L^2 - b^2 - a^2)
    // With symmetry, total = delta_from_load1(a) + delta_from_load2(a)
    let b_pos: f64 = l - a_pos;
    // From load at a, evaluated at x=a:
    let d1: f64 = p * b_pos * a_pos / (6.0 * l * ei)
        * (l * l - b_pos * b_pos - a_pos * a_pos);
    // From load at L-a, evaluated at x=a (a < L-a, so x=a <= distance of load = L-a):
    // Load at distance (L-a) from left, so b2 = a. At x=a:
    let d2: f64 = p * a_pos * a_pos / (6.0 * l * ei)
        * (l * l - a_pos * a_pos - a_pos * a_pos);
    let delta_load_exact: f64 = d1 + d2;
    assert_close(
        uy_load.abs(),
        delta_load_exact.abs(),
        0.03,
        "Four-point bending deflection at load point",
    );
}

// ================================================================
// 3. Fixed-Pinned Beam UDL: Asymmetric Deflection Shape
// ================================================================
//
// A beam fixed at left and pinned (roller) at right with uniform load q.
// The reaction at the roller: R_B = 3*q*L/8
// The max deflection occurs at x = L*(1 + sqrt(33))/16 ≈ 0.4215*L
// and its magnitude is: delta_max = q*L^4 / (185*EI) (approximately)
// Exact midspan: delta(L/2) = q*L^4 * (2/384) ... let's use general formula:
//   delta(x) = q/(48*EI) * (3*L*x^3 - 2*x^4 - L^3*x) [nope—need exact]
// Exact formula for fixed-pinned with UDL:
//   delta(x) = q*x / (48*EI) * (3*L^3 - 5*L*x^2 + 2*x^3)
// Wait—this depends on which end is fixed. For fixed at x=0, pinned at x=L:
//   M(x) = R_A*x - M_A - q*x^2/2 where R_A = 5qL/8, M_A = qL^2/8
//   EI*y''= M(x) => double integrate with y(0)=0, y'(0)=0, y(L)=0
//   delta(x) = q*x^2 / (48*EI) * (3*L^2 - 5*L*x + 2*x^2)

#[test]
fn validation_elastic_curve_ext_fixed_pinned_udl_asymmetric() {
    let l = 10.0;
    let n: usize = 40;
    let q: f64 = -8.0;
    let e_eff = E * 1000.0;
    let ei = e_eff * IZ;

    let loads: Vec<SolverLoad> = (1..=n)
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
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical: delta(x) = q*x^2 / (48*EI) * (3*L^2 - 5*L*x + 2*x^2)
    // q is negative (downward), so delta is negative.
    let check_fractions = vec![
        (0.25, "x=L/4"),
        (0.5, "x=L/2"),
        (0.4215, "x≈0.4215L (near max)"),
        (0.75, "x=3L/4"),
    ];

    for (frac, label) in check_fractions {
        let x: f64 = frac * l;
        let node_id = (frac * n as f64).round() as usize + 1;
        let uy = results
            .displacements
            .iter()
            .find(|d| d.node_id == node_id)
            .unwrap()
            .uz;
        let delta_exact: f64 = q * x * x / (48.0 * ei)
            * (3.0 * l * l - 5.0 * l * x + 2.0 * x * x);
        assert_close(
            uy.abs(),
            delta_exact.abs(),
            0.05,
            &format!("Fixed-pinned UDL shape at {}", label),
        );
    }
}

// ================================================================
// 4. SS Beam with Off-Center Point Load: General Formula
// ================================================================
//
// Simply-supported beam with load P at distance a from left (b = L-a).
// For x <= a:
//   delta(x) = P*b*x / (6*L*EI) * (L^2 - b^2 - x^2)
// For x >= a:
//   delta(x) = P*a*(L-x) / (6*L*EI) * (2*L*(L-x) - a^2 - (L-x)^2)
//            = P*a*(L-x) / (6*L*EI) * (2*L^2 - 2*L*x - a^2 - L^2 + 2*L*x - x^2)
//            = P*a*(L-x) / (6*L*EI) * (L^2 - a^2 - (L-x)^2)
// This tests an asymmetric load case.

#[test]
fn validation_elastic_curve_ext_ss_off_center_point_load() {
    let l = 10.0;
    let n: usize = 20;
    let p: f64 = 25.0;
    let a_frac: f64 = 0.3; // Load at 0.3*L from left
    let a_pos: f64 = a_frac * l;
    let b_pos: f64 = l - a_pos;
    let e_eff = E * 1000.0;
    let ei = e_eff * IZ;

    let load_node = (a_frac * n as f64) as usize + 1; // node at x = a
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Check points in left segment (x <= a)
    let check_left = vec![
        (2, 0.5, "x=0.5"),
        (4, 1.5, "x=1.5"),
    ];
    for (node_id, x, label) in check_left {
        let uy = results
            .displacements
            .iter()
            .find(|d| d.node_id == node_id)
            .unwrap()
            .uz;
        // delta(x) = P*b*x / (6*L*EI) * (L^2 - b^2 - x^2)
        let delta_exact: f64 =
            p * b_pos * x / (6.0 * l * ei) * (l * l - b_pos * b_pos - x * x);
        assert_close(
            uy.abs(),
            delta_exact.abs(),
            0.05,
            &format!("SS off-center load left at {}", label),
        );
    }

    // Check points in right segment (x >= a)
    let check_right = vec![
        (n / 2 + 1, l / 2.0, "midspan"),
        (3 * n / 4 + 1, 3.0 * l / 4.0, "x=3L/4"),
    ];
    for (node_id, x, label) in check_right {
        let uy = results
            .displacements
            .iter()
            .find(|d| d.node_id == node_id)
            .unwrap()
            .uz;
        // For x >= a: delta(x) = P*a*(L-x) / (6*L*EI) * (L^2 - a^2 - (L-x)^2)
        let lmx: f64 = l - x;
        let delta_exact: f64 =
            p * a_pos * lmx / (6.0 * l * ei) * (l * l - a_pos * a_pos - lmx * lmx);
        assert_close(
            uy.abs(),
            delta_exact.abs(),
            0.05,
            &format!("SS off-center load right at {}", label),
        );
    }
}

// ================================================================
// 5. Cantilever with Triangular Load: Quintic Deflection Shape
// ================================================================
//
// Cantilever (fixed at x=0, free at x=L) with linearly varying
// load from q=0 at x=0 to q=q0 at x=L.
// The intensity at any element is q(x) = q0 * x / L.
// Analytical deflection:
//   delta(x) = q0 / (120*L*EI) * (10*L^3*x^2 - 10*L^2*x^3 + 5*L*x^4 - x^5)

#[test]
fn validation_elastic_curve_ext_cantilever_triangular_load() {
    let l = 5.0;
    let n: usize = 40;
    let q0: f64 = -12.0;
    let e_eff = E * 1000.0;
    let ei = e_eff * IZ;
    let elem_len = l / n as f64;

    // Apply linearly varying load by setting q_i and q_j per element
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            let x_i: f64 = (i - 1) as f64 * elem_len;
            let x_j: f64 = i as f64 * elem_len;
            let qi: f64 = q0 * x_i / l;
            let qj: f64 = q0 * x_j / l;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: qi,
                q_j: qj,
                a: None,
                b: None,
            })
        })
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical: delta(x) = q0/(120*L*EI) * (10*L^3*x^2 - 10*L^2*x^3 + 5*L*x^4 - x^5)
    let check_nodes = vec![
        (n / 4 + 1, l / 4.0, "quarter"),
        (n / 2 + 1, l / 2.0, "midspan"),
        (3 * n / 4 + 1, 3.0 * l / 4.0, "three-quarter"),
        (n + 1, l, "tip"),
    ];

    for (node_id, x, label) in check_nodes {
        let uy = results
            .displacements
            .iter()
            .find(|d| d.node_id == node_id)
            .unwrap()
            .uz;
        let delta_exact: f64 = q0 / (120.0 * l * ei)
            * (10.0 * l.powi(3) * x.powi(2)
                - 10.0 * l.powi(2) * x.powi(3)
                + 5.0 * l * x.powi(4)
                - x.powi(5));
        assert_close(
            uy.abs(),
            delta_exact.abs(),
            0.05,
            &format!("Cantilever triangular load shape at {}", label),
        );
    }
}

// ================================================================
// 6. SS Beam UDL: Deflection Ratio Quarter-Span to Midspan
// ================================================================
//
// For a SS beam with UDL, the ratio of deflection at quarter-span
// to midspan is a fixed constant independent of load, E, I, or L.
//   delta(L/4) / delta(L/2) = [q*(L/4)*(L^3 - 2*L*(L/4)^2 + (L/4)^3)] /
//                               [q*(L/2)*(L^3 - 2*L*(L/2)^2 + (L/2)^3)]
// Simplifying:
//   Numerator   = L/4 * (L^3 - L^3/8 + L^3/64) = L^4/4 * (1 - 1/8 + 1/64)
//               = L^4/4 * (57/64) = 57*L^4/256
//   Denominator = L/2 * (L^3 - L^3/2 + L^3/8) = L^4/2 * (5/8) = 5*L^4/16
//   Ratio = (57/256) / (5/16) = 57/(256*5/16) = 57/80 = 0.7125

#[test]
fn validation_elastic_curve_ext_ss_udl_deflection_ratio() {
    let l = 12.0;
    let n: usize = 24;
    let q: f64 = -15.0;

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    let quarter_node = n / 4 + 1;
    let mid_node = n / 2 + 1;

    let uy_quarter = results
        .displacements
        .iter()
        .find(|d| d.node_id == quarter_node)
        .unwrap()
        .uz
        .abs();
    let uy_mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap()
        .uz
        .abs();

    let ratio = uy_quarter / uy_mid;
    let expected_ratio: f64 = 57.0 / 80.0; // 0.7125

    assert_close(
        ratio,
        expected_ratio,
        0.02,
        "SS UDL deflection ratio quarter/mid",
    );
}

// ================================================================
// 7. SS Beam Triangular Load (0 to q0): Analytical Shape
// ================================================================
//
// Simply-supported beam with linearly varying load from q=0 at x=0
// to q=q0 at x=L.
// Total load = q0*L/2, R_A = q0*L/6, R_B = q0*L/3.
// Deflection formula:
//   delta(x) = q0*x / (360*L*EI) * (7*L^4 - 10*L^2*x^2 + 3*x^4)

#[test]
fn validation_elastic_curve_ext_ss_triangular_load() {
    let l = 10.0;
    let n: usize = 40;
    let q0: f64 = -10.0;
    let e_eff = E * 1000.0;
    let ei = e_eff * IZ;
    let elem_len = l / n as f64;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            let x_i: f64 = (i - 1) as f64 * elem_len;
            let x_j: f64 = i as f64 * elem_len;
            let qi: f64 = q0 * x_i / l;
            let qj: f64 = q0 * x_j / l;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: qi,
                q_j: qj,
                a: None,
                b: None,
            })
        })
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // delta(x) = q0*x / (360*L*EI) * (7*L^4 - 10*L^2*x^2 + 3*x^4)
    let check_nodes = vec![
        (n / 4 + 1, l / 4.0, "quarter-span"),
        (n / 2 + 1, l / 2.0, "midspan"),
        (3 * n / 4 + 1, 3.0 * l / 4.0, "three-quarter"),
    ];

    for (node_id, x, label) in check_nodes {
        let uy = results
            .displacements
            .iter()
            .find(|d| d.node_id == node_id)
            .unwrap()
            .uz;
        let delta_exact: f64 = q0 * x / (360.0 * l * ei)
            * (7.0 * l.powi(4) - 10.0 * l.powi(2) * x.powi(2) + 3.0 * x.powi(4));
        assert_close(
            uy.abs(),
            delta_exact.abs(),
            0.05,
            &format!("SS triangular load shape at {}", label),
        );
    }
}

// ================================================================
// 8. Continuous Two-Span Beam UDL: Opposite Curvatures
// ================================================================
//
// A continuous beam over two equal spans with uniform load has
// negative deflection (downward) in each span and a hogging region
// near the interior support. The interior support deflection is zero,
// and the maximum deflection in each span is at ≈ 0.4215*L from
// the outer support.
// For two equal spans L each, with UDL q:
//   Interior support moment: M_B = -q*L^2/8 (from three-moment equation)
//   Each span behaves like a fixed-pinned beam from the interior
//   support perspective. Midspan deflection of each span:
//   delta_mid ≈ q*L^4 / (185*EI) (propped cantilever approx)
// This test verifies:
//   (a) Interior support has near-zero deflection
//   (b) Each span has downward deflection
//   (c) Deflections are symmetric between the two spans

#[test]
fn validation_elastic_curve_ext_continuous_two_span_symmetry() {
    let span = 8.0;
    let n_per_span: usize = 16;
    let n_total = 2 * n_per_span;
    let q: f64 = -10.0;

    // Build all distributed loads
    let loads: Vec<SolverLoad> = (1..=n_total)
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

    let input = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support is at node (n_per_span + 1)
    let interior_node = n_per_span + 1;
    let uy_interior = results
        .displacements
        .iter()
        .find(|d| d.node_id == interior_node)
        .unwrap()
        .uz;
    assert!(
        uy_interior.abs() < 1e-6,
        "Interior support uy should be ~0, got {}",
        uy_interior
    );

    // Midspan of span 1: node at n_per_span/2 + 1
    let mid1 = n_per_span / 2 + 1;
    let uy_mid1 = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid1)
        .unwrap()
        .uz;
    // Midspan of span 2: node at n_per_span + n_per_span/2 + 1
    let mid2 = n_per_span + n_per_span / 2 + 1;
    let uy_mid2 = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid2)
        .unwrap()
        .uz;

    // Both midspan deflections should be downward (negative uy for downward load)
    assert!(
        uy_mid1 < -1e-8,
        "Span 1 midspan should deflect downward, got uy={}",
        uy_mid1
    );
    assert!(
        uy_mid2 < -1e-8,
        "Span 2 midspan should deflect downward, got uy={}",
        uy_mid2
    );

    // Symmetry: midspan deflections of both spans should be equal
    assert_close(
        uy_mid1.abs(),
        uy_mid2.abs(),
        0.02,
        "Two-span symmetry: midspan deflections should match",
    );

    // Additional: midspan deflection should be less than for an equivalent
    // simply-supported single span (continuity reduces deflection).
    // SS single span: delta_mid = 5*q*L^4 / (384*EI)
    let e_eff = E * 1000.0;
    let ei = e_eff * IZ;
    let delta_ss: f64 = 5.0 * q.abs() * span.powi(4) / (384.0 * ei);
    assert!(
        uy_mid1.abs() < delta_ss,
        "Continuous beam midspan deflection ({:.6e}) should be less than SS ({:.6e})",
        uy_mid1.abs(),
        delta_ss
    );
}
