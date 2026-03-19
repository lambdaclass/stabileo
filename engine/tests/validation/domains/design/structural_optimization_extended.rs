/// Validation: Structural Optimization Benchmarks (Extended)
///
/// References:
///   - Haftka & Gurdal, "Elements of Structural Optimization", 3rd Ed., Kluwer, 1992
///   - Christensen & Klarbring, "An Introduction to Structural Optimization", Springer, 2009
///   - Arora, "Introduction to Optimum Design", 4th Ed., Academic Press, 2017
///   - Michell, "The Limits of Economy of Material in Frame-structures", Phil. Mag., 1904
///   - Rozvany, "Structural Design via Optimality Criteria", Kluwer, 1989
///   - Bendsoe & Sigmund, "Topology Optimization", 2nd Ed., Springer, 2003
///
/// These tests verify analytical relationships from structural optimization theory
/// using the FEM solver. Each test models a structural configuration and verifies
/// that solver output matches closed-form optimality conditions or parametric
/// trade-off relationships derived from mechanics.
///
/// Tests:
///   1. Fully stressed design: optimal member area A_opt = F/(sigma_allow)
///   2. Minimum weight truss: 3-bar truss analytical optimum (Michell)
///   3. Sensitivity analysis: dF/dA = stress^2/(2*E) for compliance
///   4. Uniform strength beam: variable depth h(x) = h_max*sqrt(M(x)/M_max)
///   5. Section selection: discrete W-shapes meeting strength/deflection constraints
///   6. Stiffness-to-weight ratio: comparison of I-beam vs tube vs channel
///   7. Volume fraction: material utilization = sigma_actual/sigma_allow per member
///   8. Pareto front: weight vs deflection trade-off for beam depth selection
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

// ================================================================
// 1. Fully Stressed Design: Optimal Area A_opt = F / sigma_allow
// ================================================================
//
// In a fully stressed design (FSD), every member operates at its allowable
// stress. For a single axially-loaded member of length L carrying force F,
// the optimal cross-sectional area is:
//
//   A_opt = F / sigma_allow
//
// The stress in the member is then sigma = F / A_opt = sigma_allow.
// We verify this by modelling a single truss bar (pinned-pinned), applying
// an axial load F, using A_opt as the area, and confirming the axial stress
// from the solver matches sigma_allow within tolerance.
//
// Source: Haftka & Gurdal, "Elements of Structural Optimization", Ch. 1.

#[test]
fn validation_opt_ext_fully_stressed_design() {
    let l = 3.0;         // member length (m)
    let e = 200_000.0;   // E in MPa (solver multiplies by 1000 internally)
    let f_axial = 100.0; // axial force (kN)
    let sigma_allow = 250.0; // allowable stress (MPa)

    // E_EFF = E * 1000 = 200e6 kPa; F = 100 kN; sigma_allow = 250 MPa = 250e3 kPa
    let e_eff: f64 = e * 1000.0;       // kPa
    let sigma_allow_kpa: f64 = sigma_allow * 1000.0; // kPa

    // Optimal area: A_opt = F / sigma_allow (in consistent units: kN / kPa = m^2)
    let a_opt: f64 = f_axial / sigma_allow_kpa;

    // Use a small Iz to suppress bending (truss-like behavior)
    let iz = 1e-10;

    // Single bar from node 1 (0,0) to node 2 (L,0), pinned at both ends with hinges
    // Using hinges at both ends to get pure axial behavior
    let nodes = vec![(1, 0.0, 0.0), (2, l, 0.0)];
    let elems = vec![(1, "frame", 1, 2, 1, 1, true, true)];
    let sups = vec![(1, 1, "pinned"), (2, 2, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_axial, fz: 0.0, my: 0.0,
    })];

    let input = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a_opt, iz)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Axial force in the member should equal F_axial
    let ef = &results.element_forces[0];
    let n_actual = ef.n_end.abs(); // tension at end

    assert_close(n_actual, f_axial, 0.01, "FSD axial force");

    // Stress = N / A should equal sigma_allow
    let stress_actual: f64 = n_actual / a_opt;
    assert_close(stress_actual, sigma_allow_kpa, 0.01, "FSD stress = sigma_allow");

    // Axial deformation: delta = F*L / (A*E)
    let delta_exact: f64 = f_axial * l / (a_opt * e_eff);
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_close(d2.ux.abs(), delta_exact, 0.02, "FSD axial deformation");
}

// ================================================================
// 2. Minimum Weight Truss: 3-Bar Truss Analytical Optimum (Michell)
// ================================================================
//
// Classic 3-bar truss problem: A node at (L, 0) is connected to three
// supports via bars at angles 0, +45, and -45 degrees. Under a vertical
// load P, the optimal design minimises total volume V = sum(A_i * L_i).
//
// For the symmetric configuration with equal allowable stress sigma_a,
// the diagonal bars carry force P/(2*cos(45)) = P/sqrt(2) each, and the
// horizontal bar carries P*tan(45)/2 = -P/2 (compression from equilibrium).
//
// The minimum weight design sets each bar to its fully stressed area:
//   A_diag = P / (sqrt(2) * sigma_a)
//   A_horiz = P / (2 * sigma_a)     [if compression is allowed]
//
// We verify force distribution in this truss matches the analytical values.
//
// Source: Michell (1904); Haftka & Gurdal, Ch. 8, Example 8.2.

#[test]
fn validation_opt_ext_minimum_weight_3bar_truss() {
    let l = 2.0;       // horizontal distance (m)
    let e = 200_000.0;
    let p = 50.0;       // vertical load (kN, downward)
    let sigma_a: f64 = 250.0 * 1000.0; // allowable stress in kPa

    // Bar geometry:
    //   Node 1 (0, 0) — left support (pinned)
    //   Node 2 (0, L) — upper-left support (pinned)
    //   Node 3 (0, -L) — lower-left support (pinned)
    //   Node 4 (L, 0) — loaded node (free)
    //
    // Bar 1: node 1 -> node 4 (horizontal, length = L)
    // Bar 2: node 2 -> node 4 (diagonal, length = L*sqrt(2))
    // Bar 3: node 3 -> node 4 (diagonal, length = L*sqrt(2))
    let l_diag: f64 = l * (2.0_f64).sqrt();

    // Equilibrium at node 4 under vertical load -P:
    //   Horizontal: N1 + N2*cos(45) + N3*cos(45) = 0  →  N1 = -sqrt(2) * N_diag * cos(45) = -N_diag
    //   Vertical:   N2*sin(-45) + N3*sin(45) = -P  →  actually from geometry:
    //
    // Bar 2 goes from (0,L) to (L,0): direction = (L,-L)/|...| = (1,-1)/sqrt(2)
    //   so N2 contributes (N2/sqrt(2), -N2/sqrt(2))
    // Bar 3 goes from (0,-L) to (L,0): direction = (L,L)/|...| = (1,1)/sqrt(2)
    //   so N3 contributes (N3/sqrt(2), N3/sqrt(2))
    //
    // Vertical equilibrium: -N2/sqrt(2) + N3/sqrt(2) = -P  (load is downward)
    // Horizontal equilibrium: N1 + N2/sqrt(2) + N3/sqrt(2) = 0
    //
    // By symmetry of geometry and antisymmetry of vertical load:
    //   N3 = -N2 (one in tension, one in compression)... Actually let's be careful.
    //
    // With P downward at node 4:
    //   Vertical: -N2/sqrt(2) + N3/sqrt(2) = -P → N3 - N2 = -P*sqrt(2)
    //   Horizontal: N1 + (N2 + N3)/sqrt(2) = 0
    //
    // If the geometry is symmetric about the x-axis, and load is purely vertical,
    // then by symmetry: |N2| = |N3|. But signs differ:
    //   From vertical: N3 - N2 = -P*sqrt(2) and if N2 = -N3: -2*N3 = -P*sqrt(2)
    //   → N3 = P*sqrt(2)/2 = P/sqrt(2) (tension)
    //   → N2 = -P/sqrt(2) (compression)
    //   From horizontal: N1 + (N2+N3)/sqrt(2) = N1 + 0 = 0 → N1 = 0
    //
    // So the horizontal bar is zero-force! The diagonals carry P/sqrt(2) each.

    let n_diag_expected: f64 = p / (2.0_f64).sqrt();

    // Optimal areas for diagonals
    let a_diag: f64 = n_diag_expected / sigma_a;
    // Horizontal bar is zero-force member; give it a nominal area
    let a_horiz: f64 = 1e-4;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, l),
        (3, 0.0, -l),
        (4, l, 0.0),
    ];
    // All bars with hinges at both ends (truss behavior)
    let elems = vec![
        (1, "frame", 1, 4, 1, 1, true, true), // horizontal
        (2, "frame", 2, 4, 1, 2, true, true), // upper diagonal
        (3, "frame", 3, 4, 1, 2, true, true), // lower diagonal
    ];
    let sups = vec![
        (1, 1, "pinned"),
        (2, 2, "pinned"),
        (3, 3, "pinned"),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, e, 0.3)],
        vec![(1, a_horiz, 1e-10), (2, a_diag, 1e-10)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Bar 1 (horizontal) should be near zero force
    let ef1 = results.element_forces.iter().find(|ef| ef.element_id == 1).unwrap();
    let n1_actual: f64 = ef1.n_start.abs();
    assert!(
        n1_actual < 0.5,
        "3-bar truss: horizontal bar should be zero-force, got N={:.4}",
        n1_actual
    );

    // Bar 2 (upper diagonal) and Bar 3 (lower diagonal) should carry P/sqrt(2)
    let ef2 = results.element_forces.iter().find(|ef| ef.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|ef| ef.element_id == 3).unwrap();

    // One diagonal is in tension, the other in compression
    let n2_abs: f64 = ef2.n_start.abs();
    let n3_abs: f64 = ef3.n_start.abs();

    assert_close(n2_abs, n_diag_expected, 0.03, "3-bar truss diagonal 2 force");
    assert_close(n3_abs, n_diag_expected, 0.03, "3-bar truss diagonal 3 force");

    // Verify total weight: V = 2 * A_diag * L_diag (horizontal bar is zero-force, negligible)
    let v_optimal: f64 = 2.0 * a_diag * l_diag;
    // This is the Michell-type minimum volume for this topology
    // V_opt = 2 * (P/sqrt(2)) / sigma_a * L*sqrt(2) = 2PL / sigma_a
    let v_expected: f64 = 2.0 * p * l / sigma_a;
    assert_close(v_optimal, v_expected, 0.01, "3-bar truss minimum volume");
}

// ================================================================
// 3. Sensitivity Analysis: Strain Energy Density Relation
// ================================================================
//
// For a truss member under axial load, the compliance (strain energy) is:
//   C = sum_i (N_i^2 * L_i) / (2 * E * A_i)
//
// The sensitivity of compliance with respect to area A_i is:
//   dC/dA_i = -N_i^2 * L_i / (2 * E * A_i^2) = -sigma_i^2 * L_i / (2 * E)
//
// where sigma_i = N_i / A_i is the stress.
//
// We verify this by computing the compliance for a truss at two slightly
// different areas and comparing the finite difference with the analytical
// sensitivity.
//
// Source: Christensen & Klarbring, Ch. 3, Eq. 3.12; Bendsoe & Sigmund, Ch. 1.

#[test]
fn validation_opt_ext_compliance_sensitivity() {
    let l = 4.0;
    let e = 200_000.0;
    let e_eff: f64 = e * 1000.0;
    let a_base: f64 = 0.005;
    let iz = 1e-10;
    let f_axial = 80.0; // kN

    // Single axial bar: node 1 pinned, node 2 roller, axial load at node 2
    let make_bar = |a: f64| -> AnalysisResults {
        let nodes = vec![(1, 0.0, 0.0), (2, l, 0.0)];
        let elems = vec![(1, "frame", 1, 2, 1, 1, true, true)];
        let sups = vec![(1, 1, "pinned"), (2, 2, "rollerX")];
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f_axial, fz: 0.0, my: 0.0,
        })];
        let input = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads);
        linear::solve_2d(&input).unwrap()
    };

    // Compliance: C = F * delta / 2 = N^2 * L / (2 * E * A)
    let results_base = make_bar(a_base);
    let delta_base: f64 = results_base.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let c_base: f64 = f_axial * delta_base / 2.0;

    // Analytical compliance
    let c_analytical: f64 = f_axial * f_axial * l / (2.0 * e_eff * a_base);
    assert_close(c_base, c_analytical, 0.02, "Compliance C = N^2*L/(2EA)");

    // Finite difference sensitivity: perturb A slightly
    let da: f64 = a_base * 1e-4;
    let a_pert: f64 = a_base + da;
    let results_pert = make_bar(a_pert);
    let delta_pert: f64 = results_pert.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let c_pert: f64 = f_axial * delta_pert / 2.0;

    let dc_da_fd: f64 = (c_pert - c_base) / da;

    // Analytical sensitivity: dC/dA = -N^2 * L / (2 * E * A^2)
    let stress: f64 = f_axial / a_base;
    let dc_da_exact: f64 = -stress * stress * l / (2.0 * e_eff);

    // The finite difference and analytical should agree
    let rel_err: f64 = (dc_da_fd - dc_da_exact).abs() / dc_da_exact.abs();
    assert!(
        rel_err < 0.02,
        "Sensitivity dC/dA: FD={:.6e}, exact={:.6e}, rel_err={:.4}%",
        dc_da_fd, dc_da_exact, rel_err * 100.0
    );
}

// ================================================================
// 4. Uniform Strength Beam: Variable Depth h(x) = h_max * sqrt(M(x)/M_max)
// ================================================================
//
// For a cantilever beam with tip load P, the bending moment at distance x
// from the fixed end is M(x) = P*(L - x). This distribution is determined
// solely by equilibrium and is independent of the stiffness distribution
// (statically determinate structure).
//
// A "uniform strength" beam has constant maximum bending stress sigma_max
// at every cross-section. For a rectangular section of width b and depth h:
//   sigma = M / S = 6M / (b*h^2)
//
// Setting sigma = sigma_max everywhere:
//   h(x) = h_max * sqrt(M(x) / M_max)
//
// For the cantilever: M_max = P*L at the fixed end, so:
//   h(x) = h_max * sqrt((L-x)/L)
//
// We approximate this by discretising the cantilever into segments with
// stepwise varying Iz and verify that the bending stress in each segment
// is approximately constant (the hallmark of uniform strength design).
//
// Source: Rozvany, "Structural Design via Optimality Criteria", Ch. 2;
//         Arora, "Introduction to Optimum Design", 4th Ed., Ch. 7.

#[test]
fn validation_opt_ext_uniform_strength_beam() {
    let l = 6.0;
    let n = 12; // segments (finer discretization for accuracy)
    let e = 200_000.0;
    let p = 30.0;       // tip load (kN, downward)
    let b = 0.1;        // width of rectangular section (m)
    let h_max = 0.4;    // max depth at fixed end (m)

    // M_max = P*L at the fixed end
    let m_max: f64 = p * l;

    // For the uniform strength design, sigma_max = 6*M_max / (b * h_max^2)
    let sigma_max: f64 = 6.0 * m_max / (b * h_max * h_max);

    let elem_len: f64 = l / n as f64;

    // Build nodes along X axis
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();

    // For a cantilever with tip load P at node n+1:
    // M(x) = P * (L - x) for 0 <= x <= L

    // Build elements with variable sections
    let mut secs = Vec::new();
    let mut elems = Vec::new();

    for i in 0..n {
        let x_center: f64 = (i as f64 + 0.5) * elem_len;
        let m_center: f64 = p * (l - x_center);

        // Avoid zero depth at the tip: enforce minimum ratio
        let m_ratio: f64 = (m_center / m_max).max(0.04);
        let h_i: f64 = h_max * m_ratio.sqrt();
        let iz_i: f64 = b * h_i * h_i * h_i / 12.0;
        let a_i: f64 = b * h_i;

        secs.push((i + 1, a_i, iz_i));
        elems.push((i + 1, "frame", i + 1, i + 2, 1, i + 1, false, false));
    }

    // Fixed at node 1 (left end), free at tip (node n+1)
    let sups = vec![(1, 1, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(nodes, vec![(1, e, 0.3)], secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Verify that bending stress in each element is approximately constant.
    // For a statically determinate cantilever, the FEM moment at the center
    // of each element should match the analytical moment M(x) = P*(L-x),
    // and since h(x) was designed for uniform stress, sigma = M/S should
    // be constant.
    //
    // Check elements 1 through n-2 (skip the last two elements near the tip
    // where the moment approaches zero and h is clamped at minimum).
    let mut stresses = Vec::new();
    for ef in &results.element_forces {
        let i = ef.element_id;
        if i > n - 2 {
            continue; // skip tip elements where M ~ 0 and minimum h dominates
        }
        let x_center: f64 = (i as f64 - 0.5) * elem_len;
        let m_center: f64 = p * (l - x_center);
        let m_ratio: f64 = (m_center / m_max).max(0.04);
        let h_i: f64 = h_max * m_ratio.sqrt();
        let s_i: f64 = b * h_i * h_i / 6.0;

        // Use the average of absolute start/end moments from FEM
        let m_fem: f64 = (ef.m_start.abs() + ef.m_end.abs()) / 2.0;
        let sigma_i: f64 = m_fem / s_i; // kPa (since M is in kN*m and S is in m^3)
        stresses.push(sigma_i);
    }

    // All interior stresses should be close to sigma_max (in kPa)
    let sigma_max_kpa: f64 = sigma_max;
    for (idx, &s) in stresses.iter().enumerate() {
        let err: f64 = (s - sigma_max_kpa).abs() / sigma_max_kpa;
        assert!(
            err < 0.05,
            "Uniform strength elem {}: sigma={:.1} kPa, expected={:.1} kPa, err={:.1}%",
            idx + 1, s, sigma_max_kpa, err * 100.0
        );
    }

    // Also verify: the fixed-end moment should equal P*L
    let ef_first = results.element_forces.iter().find(|ef| ef.element_id == 1).unwrap();
    let m_fixed: f64 = ef_first.m_start.abs();
    assert_close(m_fixed, m_max, 0.02, "Cantilever fixed-end moment = P*L");
}

// ================================================================
// 5. Section Selection: Discrete W-Shapes Meeting Constraints
// ================================================================
//
// Practical optimization selects from a catalog of discrete sections.
// For a simply-supported beam under UDL, two constraints apply:
//
//   Strength:   M_max / S <= sigma_allow  →  S >= M_max / sigma_allow
//   Deflection: delta_max <= L/360        →  I >= 5*q*L^4 / (384*E*delta_allow)
//
// We define three W-shape sections with known (A, Iz, S) values and verify
// which one satisfies both constraints. Then we run the solver with that
// section and confirm both constraints are met.
//
// Source: Arora, "Introduction to Optimum Design", 4th Ed., Ch. 2.

#[test]
fn validation_opt_ext_section_selection() {
    let l: f64 = 10.0;
    let q: f64 = -15.0;     // kN/m (downward)
    let e = 200_000.0;
    let e_eff: f64 = e * 1000.0;
    let sigma_allow_kpa: f64 = 250.0 * 1000.0; // 250 MPa in kPa
    let delta_allow: f64 = l / 360.0;

    // Maximum moment: M_max = q*L^2/8
    let m_max: f64 = q.abs() * l * l / 8.0;

    // Required section modulus: S_req = M_max / sigma_allow
    let s_req: f64 = m_max / sigma_allow_kpa;

    // Required moment of inertia: delta = 5*q*L^4/(384*E*I) <= delta_allow
    //   I_req = 5*q*L^4 / (384*E*delta_allow)
    let i_req: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * delta_allow);

    // Three candidate sections (idealized rectangular sections for simplicity):
    //   Section A: h=0.30m, b=0.15m  →  A=0.045, Iz=3.375e-4, S=2.25e-3
    //   Section B: h=0.40m, b=0.15m  →  A=0.060, Iz=8.0e-4,   S=4.0e-3
    //   Section C: h=0.50m, b=0.15m  →  A=0.075, Iz=15.625e-4, S=6.25e-3

    let sections = vec![
        ("A", 0.30_f64, 0.15_f64),
        ("B", 0.40_f64, 0.15_f64),
        ("C", 0.50_f64, 0.15_f64),
    ];

    let mut best_idx = 0;
    let mut best_area: f64 = f64::MAX;
    let mut best_a: f64 = 0.0;
    let mut best_iz: f64 = 0.0;

    for (idx, &(name, h, b)) in sections.iter().enumerate() {
        let a_sec: f64 = b * h;
        let iz_sec: f64 = b * h * h * h / 12.0;
        let s_sec: f64 = b * h * h / 6.0;

        let strength_ok = s_sec >= s_req;
        let deflection_ok = iz_sec >= i_req;

        if strength_ok && deflection_ok && a_sec < best_area {
            best_idx = idx;
            best_area = a_sec;
            best_a = a_sec;
            best_iz = iz_sec;
        }

        // Print section info for debugging
        let _ = (name, idx);
    }

    // The lightest feasible section should be the one we picked
    // Now verify with the solver
    let n = 10;
    let input = make_beam(
        n, l, e, best_a, best_iz, "pinned", Some("rollerX"),
        (0..n).map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        })).collect(),
    );
    let results = linear::solve_2d(&input).unwrap();

    // Check midspan deflection <= delta_allow
    let mid = n / 2 + 1;
    let delta_mid: f64 = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();
    assert!(
        delta_mid <= delta_allow * 1.05, // 5% tolerance for FEM discretization
        "Section selection: midspan deflection {:.6e} exceeds L/360={:.6e}",
        delta_mid, delta_allow
    );

    // Check maximum moment <= sigma_allow * S
    let s_best: f64 = best_iz * 2.0 / sections[best_idx].1; // S = 2*I/h for rectangular
    let m_fem_max: f64 = results.element_forces.iter()
        .flat_map(|ef| vec![ef.m_start.abs(), ef.m_end.abs()])
        .fold(0.0_f64, |a, b| a.max(b));
    let stress_max: f64 = m_fem_max / s_best;

    assert!(
        stress_max <= sigma_allow_kpa * 1.02,
        "Section selection: max stress {:.1} kPa exceeds sigma_allow={:.1} kPa",
        stress_max, sigma_allow_kpa
    );

    // Verify exact midspan deflection: delta = 5*q*L^4 / (384*E*I)
    let delta_exact: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * best_iz);
    assert_close(delta_mid, delta_exact, 0.02, "Section selection midspan deflection");
}

// ================================================================
// 6. Stiffness-to-Weight Ratio: I-Beam vs Tube vs Solid Rectangle
// ================================================================
//
// For beams of equal cross-sectional area (same weight per unit length),
// the stiffness is proportional to I_z. Different section shapes distribute
// material differently:
//
//   Solid rectangle (b x h):  I = bh^3/12,  A = bh
//   I-beam (flanges tf, web tw, depth h, flange width bf):
//     I_approx = 2*bf*tf*(h/2)^2 + tw*(h-2tf)^3/12,  A = 2*bf*tf + tw*(h-2tf)
//   Hollow tube (outer D, wall t):
//     I = pi*(D^4 - (D-2t)^4)/64,  A = pi*(D^2-(D-2t)^2)/4
//
// We fix A for all three, compute I, and verify via the solver that the
// shape with highest I gives the smallest deflection under the same load.
//
// Source: Haftka & Gurdal, Ch. 1; Gere & Goodno, "Mechanics of Materials", Ch. 5.

#[test]
fn validation_opt_ext_stiffness_to_weight_ratio() {
    let l = 6.0;
    let e = 200_000.0;
    let e_eff: f64 = e * 1000.0;
    let p = 30.0;
    let n = 6;
    let mid = n / 2 + 1;

    let pi: f64 = std::f64::consts::PI;

    // Target area for all sections (same weight)
    let a_target: f64 = 0.006; // 60 cm^2

    // Section 1: Solid rectangle
    // Choose h/b = 2, so b*h = A, h = 2b → 2b^2 = A → b = sqrt(A/2)
    let b_rect: f64 = (a_target / 2.0).sqrt();
    let h_rect: f64 = 2.0 * b_rect;
    let iz_rect: f64 = b_rect * h_rect.powi(3) / 12.0;

    // Section 2: I-beam approximation
    // bf=0.12, tf=0.012, tw=0.006, h chosen to match area
    // A = 2*bf*tf + tw*(h-2*tf) = A_target
    let bf: f64 = 0.12;
    let tf: f64 = 0.012;
    let tw: f64 = 0.006;
    let a_flanges: f64 = 2.0 * bf * tf;
    let h_web: f64 = (a_target - a_flanges) / tw; // web height
    let h_ibeam: f64 = h_web + 2.0 * tf;
    let iz_ibeam: f64 = 2.0 * bf * tf * (h_ibeam / 2.0 - tf / 2.0).powi(2)
        + tw * h_web.powi(3) / 12.0;
    let a_ibeam: f64 = a_flanges + tw * h_web;

    // Section 3: Hollow circular tube
    // A = pi*(D^2 - d^2)/4 where d = D - 2t
    // Choose t/D = 0.08 (thin-walled tube)
    // A = pi*(D^2 - (D-2*0.08D)^2)/4 = pi*D^2*(1 - 0.84^2)/4
    let ratio_factor: f64 = 1.0 - 0.84_f64.powi(2);
    let d_tube: f64 = (4.0 * a_target / (pi * ratio_factor)).sqrt();
    let t_tube: f64 = 0.08 * d_tube;
    let d_inner: f64 = d_tube - 2.0 * t_tube;
    let iz_tube: f64 = pi * (d_tube.powi(4) - d_inner.powi(4)) / 64.0;
    let a_tube: f64 = pi * (d_tube * d_tube - d_inner * d_inner) / 4.0;

    // Verify all areas are approximately equal
    assert_close(a_ibeam, a_target, 0.01, "I-beam area matches target");
    assert_close(a_tube, a_target, 0.01, "Tube area matches target");

    // Compute deflections for each section
    let sections: Vec<(&str, f64, f64)> = vec![
        ("Solid rectangle", a_target, iz_rect),
        ("I-beam",          a_ibeam,  iz_ibeam),
        ("Hollow tube",     a_tube,   iz_tube),
    ];

    let mut deflections = Vec::new();
    for &(name, a, iz) in &sections {
        let input = make_beam(
            n, l, e, a, iz, "pinned", Some("rollerX"),
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid, fx: 0.0, fz: -p, my: 0.0,
            })],
        );
        let results = linear::solve_2d(&input).unwrap();
        let delta: f64 = results.displacements.iter()
            .find(|d| d.node_id == mid).unwrap().uz.abs();

        // Verify against analytical: delta = P*L^3 / (48*E*I)
        let delta_exact: f64 = p * l.powi(3) / (48.0 * e_eff * iz);
        assert_close(delta, delta_exact, 0.02, &format!("{} deflection", name));
        deflections.push((name, delta, iz));
    }

    // The section with the highest Iz should have the smallest deflection.
    // For equal area, the I-beam should be the stiffest (highest Iz) due to
    // material placed far from the neutral axis.
    let (best_name, best_delta, best_iz) = deflections.iter()
        .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap())
        .unwrap();
    let (_, _, max_iz) = deflections.iter()
        .max_by(|a, b| a.2.partial_cmp(&b.2).unwrap())
        .unwrap();

    assert_eq!(
        *best_iz, *max_iz,
        "Section with max Iz should have min deflection, best={}",
        best_name
    );

    // Verify that deflection ratios match inverse Iz ratios
    let delta_rect = deflections[0].1;
    let delta_ibeam = deflections[1].1;
    let ratio_fem: f64 = delta_rect / delta_ibeam;
    let ratio_exact: f64 = iz_ibeam / iz_rect;
    assert_close(ratio_fem, ratio_exact, 0.02, "Deflection ratio rect/I-beam = Iz_I/Iz_rect");

    // Log stiffness-to-weight ranking
    let _ = best_delta;
}

// ================================================================
// 7. Volume Fraction: Material Utilization sigma_actual/sigma_allow
// ================================================================
//
// In optimization, the utilization ratio eta_i = sigma_i / sigma_allow
// measures how efficiently each member uses its material capacity.
// eta_i = 1.0 means fully stressed (optimal), eta_i < 1.0 means
// over-designed (material wasted), and eta_i > 1.0 means overstressed.
//
// For a two-bar truss with symmetric geometry under a single vertical load,
// the utilization of each bar can be computed analytically and verified
// with the solver's axial force output.
//
// Source: Haftka & Gurdal, "Elements of Structural Optimization", Ch. 1;
//         Arora, "Introduction to Optimum Design", Ch. 2.

#[test]
fn validation_opt_ext_volume_fraction_utilization() {
    let l: f64 = 3.0;       // horizontal span (m)
    let h: f64 = 4.0;       // vertical height (m)
    let e = 200_000.0;
    let p = 60.0;       // vertical load (kN, downward)
    let sigma_allow_kpa: f64 = 250.0 * 1000.0; // 250 MPa in kPa

    // Two-bar truss (V-shape):
    //   Node 1 (0, h) — left support (pinned)
    //   Node 2 (2*l, h) — right support (pinned)
    //   Node 3 (l, 0) — loaded node (free)
    //
    // Bars: 1->3 and 2->3
    // Both bars have the same length by symmetry
    let _bar_len: f64 = (l * l + h * h).sqrt();

    // By symmetry, each bar carries half the vertical load component:
    //   V_component = P/2  →  N = (P/2) / sin(theta) where theta = atan(h/l)
    let theta: f64 = (h / l).atan();
    let n_bar: f64 = (p / 2.0) / theta.sin();

    // Design both bars for DIFFERENT utilization levels:
    //   Bar 1: fully stressed (eta = 1.0) → A1 = N / sigma_allow
    //   Bar 2: over-designed (eta = 0.6) → A2 = N / (0.6 * sigma_allow)
    let a1: f64 = n_bar / sigma_allow_kpa;
    let a2: f64 = n_bar / (0.6 * sigma_allow_kpa);

    let iz = 1e-10;

    // But both bars see the same force due to symmetry, so we use
    // identical geometry. To test different utilizations, we assign
    // different areas and verify the stress ratio matches.

    // Actually, for a symmetric truss with identical geometry and loading,
    // both bars carry the same force regardless of area (statically determinate).
    // So we use the same area for both and verify utilization = N/(A*sigma_allow).

    // Use A1 (fully stressed design):
    let nodes = vec![
        (1, 0.0, h),
        (2, 2.0 * l, h),
        (3, l, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, true, true),
        (2, "frame", 2, 3, 1, 1, true, true),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 2, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, e, 0.3)], vec![(1, a1, iz)], elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Check axial forces in both bars
    let ef1 = results.element_forces.iter().find(|ef| ef.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|ef| ef.element_id == 2).unwrap();
    let n1_actual: f64 = ef1.n_start.abs();
    let n2_actual: f64 = ef2.n_start.abs();

    // Both should carry the same force (symmetric)
    assert_close(n1_actual, n2_actual, 0.02, "Symmetric truss: equal bar forces");
    assert_close(n1_actual, n_bar, 0.03, "Bar force matches analytical N = P/(2*sin(theta))");

    // Utilization for bar with area A1 (fully stressed): eta = N/(A*sigma_allow) = 1.0
    let eta1: f64 = n1_actual / (a1 * sigma_allow_kpa);
    assert_close(eta1, 1.0, 0.03, "Fully stressed utilization eta=1.0");

    // Now verify with over-designed area A2:
    let eta2_expected: f64 = n_bar / (a2 * sigma_allow_kpa); // should be 0.6
    assert_close(eta2_expected, 0.6, 0.01, "Over-designed utilization eta=0.6");

    // Run solver with A2 to confirm same force (statically determinate)
    let nodes2 = vec![
        (1, 0.0, h),
        (2, 2.0 * l, h),
        (3, l, 0.0),
    ];
    let elems2 = vec![
        (1, "frame", 1, 3, 1, 1, true, true),
        (2, "frame", 2, 3, 1, 1, true, true),
    ];
    let sups2 = vec![(1, 1, "pinned"), (2, 2, "pinned")];
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input2 = make_input(
        nodes2, vec![(1, e, 0.3)], vec![(1, a2, iz)], elems2, sups2, loads2,
    );
    let results2 = linear::solve_2d(&input2).unwrap();
    let ef2_check = results2.element_forces.iter().find(|ef| ef.element_id == 1).unwrap();
    let n2_check: f64 = ef2_check.n_start.abs();

    // Force should be the same regardless of area (statically determinate)
    assert_close(n2_check, n_bar, 0.03, "Same force with over-designed area");

    // Actual utilization with A2:
    let eta2_actual: f64 = n2_check / (a2 * sigma_allow_kpa);
    assert_close(eta2_actual, 0.6, 0.03, "Over-designed utilization from solver");
}

// ================================================================
// 8. Pareto Front: Weight vs Deflection Trade-off for Beam Depth
// ================================================================
//
// As beam depth h increases (fixed width b), both weight and stiffness grow.
// For a rectangular section:
//   Weight (per unit length):  w = rho * b * h   →  w proportional to h
//   Deflection (SS beam, UDL): delta = 5*q*L^4 / (384*E*I)
//                             = 5*q*L^4 / (384*E*b*h^3/12)
//                             = 60*q*L^4 / (384*E*b*h^3)
//                             delta proportional to 1/h^3
//
// The Pareto front is parametric: for each h, (w(h), delta(h)) traces a curve.
// The key relationship is: delta * w^3 = constant (since delta ~ 1/h^3 and w ~ h).
//
// We verify that the solver reproduces this cubic relationship across multiple
// beam depths, confirming the Pareto trade-off.
//
// Source: Christensen & Klarbring, "An Introduction to Structural Optimization",
//         Ch. 5; Bendsoe & Sigmund, "Topology Optimization", Ch. 1.

#[test]
fn validation_opt_ext_pareto_front_weight_deflection() {
    let l: f64 = 6.0;
    let e = 200_000.0;
    let e_eff: f64 = e * 1000.0;
    let q = -10.0;        // kN/m (downward)
    let b = 0.15;         // section width (m)
    let n = 6;            // elements
    let mid = n / 2 + 1;

    // Test multiple depths
    let depths = [0.20_f64, 0.25, 0.30, 0.35, 0.40, 0.50];

    let mut results_data: Vec<(f64, f64, f64)> = Vec::new(); // (h, weight_proxy, delta)

    for &h in &depths {
        let a: f64 = b * h;
        let iz: f64 = b * h * h * h / 12.0;
        let weight_proxy: f64 = a; // proportional to weight per unit length

        let input = make_beam(
            n, l, e, a, iz, "pinned", Some("rollerX"),
            (0..n).map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })).collect(),
        );
        let results = linear::solve_2d(&input).unwrap();
        let delta: f64 = results.displacements.iter()
            .find(|d| d.node_id == mid).unwrap().uz.abs();

        // Verify against analytical formula
        let delta_exact: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * iz);
        assert_close(delta, delta_exact, 0.02, &format!("Pareto h={:.2} deflection", h));

        results_data.push((h, weight_proxy, delta));
    }

    // Verify the Pareto trade-off: delta * w^3 = constant
    // Since w = b*h and delta = K / (b*h^3) where K = 5*q*L^4*12/(384*E*b):
    //   delta * w^3 = K/(b*h^3) * (b*h)^3 = K * b^2
    // So delta * w^3 should be constant across all depths.
    let pareto_constants: Vec<f64> = results_data.iter()
        .map(|(_, w, d)| d * w.powi(3))
        .collect();

    let c_ref = pareto_constants[0];
    for (i, &c) in pareto_constants.iter().enumerate().skip(1) {
        let rel_err: f64 = (c - c_ref).abs() / c_ref;
        assert!(
            rel_err < 0.03,
            "Pareto constant: depth {:.2}m gives C={:.6e}, ref C={:.6e}, err={:.1}%",
            depths[i], c, c_ref, rel_err * 100.0
        );
    }

    // Verify monotonicity: increasing depth → decreasing deflection, increasing weight
    for i in 1..results_data.len() {
        assert!(
            results_data[i].2 < results_data[i - 1].2,
            "Pareto: deeper beam should have smaller deflection"
        );
        assert!(
            results_data[i].1 > results_data[i - 1].1,
            "Pareto: deeper beam should weigh more"
        );
    }

    // Verify the cubic deflection ratio between first and last depth:
    // delta_1 / delta_last = (h_last / h_1)^3
    let (h_first, _, d_first) = results_data[0];
    let (h_last, _, d_last) = results_data[results_data.len() - 1];
    let ratio_actual: f64 = d_first / d_last;
    let ratio_expected: f64 = (h_last / h_first).powi(3);
    assert_close(ratio_actual, ratio_expected, 0.02, "Pareto cubic depth-deflection ratio");
}
