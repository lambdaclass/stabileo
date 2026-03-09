/// Validation: Cantilever Variations — Extended
///
/// References:
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed., Ch. 9
///   - Roark's Formulas for Stress and Strain, 9th Ed., Table 8
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed., Ch. 9
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 4, 6, 8
///
/// Tests verify element forces, reactions, rotations, and deflection profiles
/// for cantilever configurations NOT covered in the base file:
///   1. Cantilever with point load on element (mid-element): reaction verification
///   2. Cantilever with full UDL: tip rotation
///   3. Cantilever with decreasing triangular load (max at fixed, zero at tip)
///   4. Cantilever axial load only: axial displacement
///   5. Stepped cantilever (two different cross sections): tip deflection
///   6. Cantilever with combined axial and transverse loads: element forces
///   7. Cantilever with two equal and opposite tip moments (zero net rotation)
///   8. Cantilever with concentrated moment at midspan
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Cantilever with Point Load on Element: Reactions
// ================================================================
//
// Fixed cantilever of length L with transverse point load P at midspan.
// The point load is applied via PointOnElement at the midpoint of the
// middle element.
//
// Reactions at fixed end:
//   Ry = P (upward), Mz = -P * L/2 (counterclockwise)
//
// Source: Hibbeler, "Structural Analysis", 10th Ed., Ch. 4.
#[test]
fn validation_cantilever_point_on_element_reactions() {
    let l = 4.0;
    let n = 4;
    let p: f64 = -30.0; // kN downward
    let elem_len = l / n as f64;

    // Apply point load at midpoint of element 2 (= x = 1.5 m from fixed end)
    let a_local = elem_len / 2.0; // halfway along element 2
    let x_load = elem_len + a_local; // global x = 1.0 + 0.5 = 1.5 m

    let input = make_beam(
        n,
        l,
        E,
        A,
        IZ,
        "fixed",
        None,
        vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 2,
            a: a_local,
            p,
            px: None,
            mz: None,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Reaction at fixed end (node 1): Ry = -P (upward), Mz = -P * x_load (positive = CCW)
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let ry_expected = -p; // counteracts downward load
    let mz_expected = -p * x_load; // positive moment (CCW to resist CW from downward load)

    assert_close(r.ry, ry_expected, 0.01, "Fixed end Ry reaction");
    assert_close(r.mz, mz_expected, 0.01, "Fixed end Mz reaction");
}

// ================================================================
// 2. Cantilever with Full UDL: Tip Rotation
// ================================================================
//
// Fixed cantilever of length L, uniform load q over full span.
// Tip deflection: delta = qL^4 / (8EI)
// Tip rotation:   theta = qL^3 / (6EI)
//
// Source: Roark's Formulas for Stress and Strain, 9th Ed., Table 8, Case 3a.
#[test]
fn validation_cantilever_full_udl_tip_rotation() {
    let l = 5.0;
    let n = 10;
    let q = -12.0; // kN/m downward
    let e_eff = E * 1000.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();
    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();

    // delta_tip = |q| * L^4 / (8EI)
    let delta_exact = q.abs() * l.powi(4) / (8.0 * e_eff * IZ);
    assert_close(tip.uy.abs(), delta_exact, 0.02, "UDL tip deflection");

    // theta_tip = |q| * L^3 / (6EI)
    let theta_exact = q.abs() * l.powi(3) / (6.0 * e_eff * IZ);
    assert_close(tip.rz.abs(), theta_exact, 0.02, "UDL tip rotation");
}

// ================================================================
// 3. Cantilever with Decreasing Triangular Load
// ================================================================
//
// Load linearly varying from q_max at fixed end to 0 at free tip.
// Tip deflection: delta = q_max * L^4 / (30EI)
//
// Source: Roark's Formulas for Stress and Strain, 9th Ed., Table 8, Case 3d.
#[test]
fn validation_cantilever_triangular_load_decreasing() {
    let l = 6.0;
    let n = 12;
    let q_max = -10.0; // kN/m
    let e_eff = E * 1000.0;

    // Triangular load: q_max at fixed end (i=0), 0 at free tip (i=n)
    let mut loads = Vec::new();
    for i in 0..n {
        let xi = i as f64 / n as f64;
        let xj = (i + 1) as f64 / n as f64;
        let qi = q_max * (1.0 - xi);
        let qj = q_max * (1.0 - xj);
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: qi,
            q_j: qj,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();
    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();

    // delta_tip = |q_max| * L^4 / (30EI)
    let delta_exact = q_max.abs() * l.powi(4) / (30.0 * e_eff * IZ);
    assert_close(tip.uy.abs(), delta_exact, 0.05, "Decreasing triangular tip deflection");
}

// ================================================================
// 4. Cantilever Axial Load Only: Axial Displacement
// ================================================================
//
// Fixed cantilever of length L with axial (horizontal) load P at the tip.
// Axial displacement at tip: delta_x = P * L / (EA)
// No transverse displacement or rotation.
//
// Source: Gere & Goodno, "Mechanics of Materials", 9th Ed., Ch. 2.
#[test]
fn validation_cantilever_axial_load_only() {
    let l = 4.0;
    let n = 4;
    let p_axial = 50.0; // kN tension (positive x)
    let e_eff = E * 1000.0;

    let input = make_beam(
        n,
        l,
        E,
        A,
        IZ,
        "fixed",
        None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: p_axial,
            fy: 0.0,
            mz: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();
    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();

    // delta_x = P * L / (EA)
    let delta_x_exact = p_axial * l / (e_eff * A);
    assert_close(tip.ux, delta_x_exact, 0.01, "Axial tip displacement");

    // No transverse deflection or rotation
    assert_close(tip.uy, 0.0, 0.001, "No transverse displacement");
    assert_close(tip.rz, 0.0, 0.001, "No rotation");
}

// ================================================================
// 5. Stepped Cantilever: Two Different Cross Sections
// ================================================================
//
// Fixed cantilever with two segments of equal length L/2.
// First half (fixed side): section with moment of inertia I1.
// Second half (tip side): section with moment of inertia I2 = I1/2.
// Point load P at tip.
//
// Tip deflection by integration (conjugate beam / virtual work):
//   delta = P*(L/2)^3/(3*E*I2) + P*(L/2)^2*(L/2)/(2*E*I2)
//         + P*(L/2)^3/(3*E*I1) + P*(L/2)^2*(L/2)/(2*E*I1) ... (complex)
//
// Use Mohr's second theorem (moment-area):
//   Segment 1 (0 to L/2): M(x) = -P*(L-x), I = I1
//   Segment 2 (L/2 to L): M(x) = -P*(L-x), I = I2
//
// Simpler: superpose deflections of each segment.
//   theta_at_junction = P*(L/2)^2/(2*E*I1)
//   delta_at_junction = P*(L/2)^3/(3*E*I1)
//   delta_tip = delta_junction + theta_junction*(L/2) + P*(L/2)^3/(3*E*I2)
//
// Source: Timoshenko & Gere, "Mechanics of Materials", 4th Ed., §9.6.
#[test]
fn validation_cantilever_stepped_section() {
    let l = 4.0;
    let n_half = 4;
    let p = -20.0; // kN downward at tip
    let e_eff = E * 1000.0;
    let iz1 = IZ; // 1e-4 for first half
    let iz2 = IZ / 2.0; // 5e-5 for second half

    let half_l = l / 2.0;
    let elem_len = half_l / n_half as f64;
    let n_total = 2 * n_half;
    let n_nodes = n_total + 1;

    // Build nodes
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();

    // Elements: first half uses section 1, second half uses section 2
    let mut elems = Vec::new();
    for i in 0..n_half {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    for i in n_half..n_total {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 2, false, false));
    }

    let sups = vec![(1, 1, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_nodes,
        fx: 0.0,
        fy: p,
        mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, iz1), (2, A, iz2)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();
    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n_nodes)
        .unwrap();

    // Analytical: moment-area method
    // Segment 1 (x=0 to L/2): loaded as cantilever with tip load P and moment P*L/2
    //   The moment at x in segment 1: M(x) = P*(L - x)  (with P negative = downward)
    //   Slope at junction: theta_j = |P|*(L/2)^2/(2*E*I1)  [from bending of seg 1 only]
    //                               BUT segment 1 carries the FULL moment P*(L-x).
    //
    // Using virtual work / unit load method:
    //   delta_tip = integral_0^{L/2} [P*(L-x)] * [(L-x)] / (E*I1) dx
    //             + integral_{L/2}^{L} [P*(L-x)] * [(L-x)] / (E*I2) dx
    //
    //   = |P|/(E*I1) * integral_0^{L/2} (L-x)^2 dx + |P|/(E*I2) * integral_{L/2}^{L} (L-x)^2 dx
    //
    //   First integral: integral_0^{L/2} (L-x)^2 dx = [-(L-x)^3/3]_0^{L/2}
    //                 = -(L/2)^3/3 + L^3/3 = L^3/3 - L^3/24 = 7*L^3/24
    //
    //   Second integral: integral_{L/2}^{L} (L-x)^2 dx = [-(L-x)^3/3]_{L/2}^{L}
    //                  = 0 + (L/2)^3/3 = L^3/24
    //
    //   delta_tip = |P| * (7*L^3/(24*E*I1) + L^3/(24*E*I2))
    let p_abs: f64 = p.abs();
    let term1 = 7.0 * l.powi(3) / (24.0 * e_eff * iz1);
    let term2 = l.powi(3) / (24.0 * e_eff * iz2);
    let delta_exact = p_abs * (term1 + term2);

    assert_close(tip.uy.abs(), delta_exact, 0.02, "Stepped cantilever tip deflection");
}

// ================================================================
// 6. Cantilever with Combined Axial and Transverse Loads: Element Forces
// ================================================================
//
// Fixed cantilever of length L with:
//   - Transverse tip load P_y (downward)
//   - Axial tip load P_x (tension)
//
// At fixed end:
//   N_start = -P_x (compression from start perspective)
//   V_start = -P_y (shear)
//   M_start = P_y * L (moment from transverse)
//
// Source: Hibbeler, "Structural Analysis", 10th Ed., Ch. 6.
#[test]
fn validation_cantilever_combined_loads_element_forces() {
    let l = 3.0;
    let n = 1; // single element for clean force extraction
    let p_x = 40.0; // kN tension
    let p_y = -20.0; // kN downward

    let input = make_beam(
        n,
        l,
        E,
        A,
        IZ,
        "fixed",
        None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: p_x,
            fy: p_y,
            mz: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Check reactions
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.rx, -p_x, 0.01, "Horizontal reaction Rx");
    assert_close(r.ry, -p_y, 0.01, "Vertical reaction Ry");
    assert_close(r.mz, -p_y * l, 0.01, "Moment reaction Mz");

    // Check element forces for element 1
    let ef = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 1)
        .unwrap();

    // Axial: tension throughout, N_start and N_end should both be P_x magnitude
    assert_close(ef.n_start.abs(), p_x, 0.01, "Axial force at start");
    assert_close(ef.n_end.abs(), p_x, 0.01, "Axial force at end");

    // Shear: constant throughout = |P_y|
    let p_y_abs: f64 = p_y.abs();
    assert_close(ef.v_start.abs(), p_y_abs, 0.01, "Shear at start");
    assert_close(ef.v_end.abs(), p_y_abs, 0.01, "Shear at end");
}

// ================================================================
// 7. Cantilever Deflection Shape under UDL: Quarter-Point Check
// ================================================================
//
// Fixed cantilever of length L, uniform load q over full span.
// Deflection at any x from fixed end:
//   delta(x) = q*x^2*(6L^2 - 4Lx + x^2) / (24EI)
//
// Verify deflection at x = L/4, L/2, 3L/4.
//
// Source: Timoshenko & Gere, "Mechanics of Materials", 4th Ed., §9.3.
#[test]
fn validation_cantilever_udl_deflection_shape() {
    let l = 8.0;
    let n = 16;
    let q = -8.0; // kN/m downward
    let e_eff = E * 1000.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Check deflection at three interior points
    let check_points = [0.25_f64, 0.5, 0.75];
    for &frac in &check_points {
        let x = l * frac;
        let node_idx = (frac * n as f64).round() as usize + 1;

        // delta(x) = |q| * x^2 * (6L^2 - 4Lx + x^2) / (24EI)
        let delta_exact =
            q.abs() * x * x * (6.0 * l * l - 4.0 * l * x + x * x) / (24.0 * e_eff * IZ);

        let d = results
            .displacements
            .iter()
            .find(|d| d.node_id == node_idx)
            .unwrap();

        assert_close(
            d.uy.abs(),
            delta_exact,
            0.03,
            &format!("UDL deflection at x/L={:.2}", frac),
        );
    }
}

// ================================================================
// 8. Cantilever with Concentrated Moment at Midspan
// ================================================================
//
// Fixed cantilever of length L with a concentrated moment M0 applied
// at midspan (x = L/2).
//
// Tip deflection:
//   delta_tip = M0 * (L/2) * (2L - L/2) / (2EI) = M0 * L * (3L/2) / (4EI)
//             = 3*M0*L^2/(8*EI)
// (Using: delta_tip = M0*a*(2L-a)/(2EI) where a = L/2)
//
// Tip rotation:
//   theta_tip = M0*L/(EI)  for a <= x (moment applied at a, slope at x=L)
//   Actually: theta_tip = M0*a/(EI) = M0*(L/2)/(EI)
//
// Source: Roark's Formulas for Stress and Strain, 9th Ed., Table 8, Case 8.
#[test]
fn validation_cantilever_midspan_moment() {
    let l = 6.0;
    let n = 12;
    let m0 = 30.0; // kN*m applied moment at midspan
    let e_eff = E * 1000.0;
    let a = l / 2.0; // moment applied at midspan

    // Apply moment as a nodal load at midspan node
    let mid_node = n / 2 + 1;

    let input = make_beam(
        n,
        l,
        E,
        A,
        IZ,
        "fixed",
        None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node,
            fx: 0.0,
            fy: 0.0,
            mz: m0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();
    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();

    // delta_tip = M0 * a * (2L - a) / (2EI) where a = L/2
    let delta_exact = m0 * a * (2.0 * l - a) / (2.0 * e_eff * IZ);
    assert_close(
        tip.uy.abs(),
        delta_exact,
        0.02,
        "Midspan moment: tip deflection",
    );

    // theta_tip = M0 * a / (EI) where a = L/2
    let theta_exact = m0 * a / (e_eff * IZ);
    assert_close(
        tip.rz.abs(),
        theta_exact,
        0.02,
        "Midspan moment: tip rotation",
    );

    // Reaction moment at fixed end = -M0 (equilibrium)
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.mz, -m0, 0.01, "Midspan moment: fixed end reaction moment");

    // No vertical reaction (pure moment, no transverse load)
    assert_close(r.ry, 0.0, 0.001, "Midspan moment: zero vertical reaction");
}
