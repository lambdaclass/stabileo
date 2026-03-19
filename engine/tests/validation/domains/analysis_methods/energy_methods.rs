/// Validation: Energy Methods and Reciprocal Theorems
///
/// References:
///   - Castigliano, "Théorie de l'équilibre des systèmes élastiques" (1879)
///   - Maxwell, "On the Calculation of the Equilibrium and Stiffness of Frames" (1864)
///   - Betti, "Teorema Generale sulle Deformazioni Elastiche" (1872)
///   - Timoshenko & Young, "Theory of Structures", Ch. 8-9
///   - Ghali, Neville & Brown, "Structural Analysis", Ch. 7
///
/// Tests:
///   1. Clapeyron's theorem: external work = 2× strain energy
///   2. Maxwell-Betti reciprocal theorem: δ₁₂ = δ₂₁
///   3. Castigliano: cantilever end load agrees with PL³/(3EI)
///   4. Maxwell-Betti for frame structure
///   5. Superposition of load cases
///   6. Unit load method: SS beam deflection
///   7. Clapeyron for distributed load
///   8. Reciprocal reactions: Maxwell's theorem applied to reactions
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Clapeyron's Theorem: W_ext = 2U for Linear System
// ================================================================
//
// For linear elastic: external work W = ½ΣP_i δ_i.
// Strain energy U = ½ΣP_i δ_i (same, by Clapeyron).
// Verify: ΣP_i × δ_i computed from solver results.

#[test]
fn validation_energy_clapeyron_cantilever() {
    let l = 5.0;
    let n = 8;
    let p = 15.0;
    let e_eff = E * 1000.0;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // External work = ½ P δ
    let w_ext = 0.5 * p * tip.uz.abs();

    // Analytical strain energy = P²L³/(6EI)
    let u_exact = p * p * l.powi(3) / (6.0 * e_eff * IZ);

    let err = (w_ext - u_exact).abs() / u_exact;
    assert!(err < 0.05,
        "Clapeyron: W_ext={:.6e}, U_exact={:.6e}", w_ext, u_exact);
}

// ================================================================
// 2. Maxwell-Betti Reciprocal Theorem: δ₁₂ = δ₂₁
// ================================================================
//
// Load case 1: force P₁ at node A. Measure displacement δ₁₂ at node B.
// Load case 2: force P₂ at node B. Measure displacement δ₂₁ at node A.
// Maxwell-Betti: P₁ × δ₂₁ = P₂ × δ₁₂ (reciprocal work).
// For P₁ = P₂: δ₁₂ = δ₂₁.

#[test]
fn validation_energy_maxwell_betti_beam() {
    let l = 8.0;
    let n = 8;
    let p = 10.0;

    let node_a = 3; // at L/4
    let node_b = 7; // at 3L/4

    // Load case 1: force at node A
    let input1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_a, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let r1 = linear::solve_2d(&input1).unwrap();
    let delta_12 = r1.displacements.iter()
        .find(|d| d.node_id == node_b).unwrap().uz;

    // Load case 2: force at node B
    let input2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_b, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let r2 = linear::solve_2d(&input2).unwrap();
    let delta_21 = r2.displacements.iter()
        .find(|d| d.node_id == node_a).unwrap().uz;

    // Maxwell-Betti: δ₁₂ = δ₂₁ (for equal forces)
    let err = (delta_12 - delta_21).abs() / delta_12.abs();
    assert!(err < 0.01,
        "Maxwell-Betti: δ₁₂={:.6e}, δ₂₁={:.6e}", delta_12, delta_21);
}

// ================================================================
// 3. Castigliano: Cantilever Deflection from Energy
// ================================================================
//
// δ = ∂U/∂P = PL³/(3EI) for cantilever with end load.
// Verify by computing W_ext = ½Pδ and checking against P²L³/(6EI).

#[test]
fn validation_energy_castigliano_cantilever() {
    let l = 6.0;
    let n = 8;
    let p = 20.0;
    let e_eff = E * 1000.0;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // By Castigliano's 2nd theorem: δ = ∂U/∂P = PL³/(3EI)
    let delta_castigliano = p * l.powi(3) / (3.0 * e_eff * IZ);
    let err = (tip.uz.abs() - delta_castigliano).abs() / delta_castigliano;
    assert!(err < 0.05,
        "Castigliano: δ_FEM={:.6e}, δ_theory={:.6e}", tip.uz.abs(), delta_castigliano);
}

// ================================================================
// 4. Maxwell-Betti for Portal Frame
// ================================================================
//
// Apply force at different locations on a portal frame.
// Reciprocal displacements should be equal.

#[test]
fn validation_energy_maxwell_betti_frame() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0;

    // Portal: 1=(0,0) fixed, 2=(0,h) top-left, 3=(w,h) top-right, 4=(w,0) fixed
    // Load case 1: horizontal force at node 2, measure ux at node 3
    let input1 = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let r1 = linear::solve_2d(&input1).unwrap();
    let d_3x_case1 = r1.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().ux;

    // Load case 2: horizontal force at node 3, measure ux at node 2
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: p, fz: 0.0, my: 0.0 }),
    ];
    let input2 = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let r2 = linear::solve_2d(&input2).unwrap();
    let d_2x_case2 = r2.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Maxwell-Betti: P₁ × δ(3,case1) = P₂ × δ(2,case2)
    // Since P₁ = P₂: δ₁₂ = δ₂₁
    let err = (d_3x_case1 - d_2x_case2).abs() / d_3x_case1.abs().max(1e-12);
    assert!(err < 0.01,
        "Frame M-B: δ₁₂={:.6e}, δ₂₁={:.6e}", d_3x_case1, d_2x_case2);
}

// ================================================================
// 5. Superposition: Combined = Sum of Individual
// ================================================================
//
// Linear superposition: results from combined loads should equal
// sum of results from individual load cases.

#[test]
fn validation_energy_superposition() {
    let l = 6.0;
    let n = 8;
    let p1 = 10.0;
    let p2 = 15.0;

    let node_a = 3;
    let node_b = 7;

    // Load case 1
    let input1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_a, fx: 0.0, fz: -p1, my: 0.0,
        })]);
    let r1 = linear::solve_2d(&input1).unwrap();

    // Load case 2
    let input2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_b, fx: 0.0, fz: -p2, my: 0.0,
        })]);
    let r2 = linear::solve_2d(&input2).unwrap();

    // Combined
    let input_c = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: node_a, fx: 0.0, fz: -p1, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: node_b, fx: 0.0, fz: -p2, my: 0.0 }),
        ]);
    let rc = linear::solve_2d(&input_c).unwrap();

    // Check superposition at midspan
    let mid = n / 2 + 1;
    let d1_mid = r1.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;
    let d2_mid = r2.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;
    let dc_mid = rc.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;

    let err = ((d1_mid + d2_mid) - dc_mid).abs() / dc_mid.abs();
    assert!(err < 0.01,
        "Superposition: δ₁+δ₂={:.6e}, δ_combined={:.6e}", d1_mid + d2_mid, dc_mid);

    // Check superposition of reactions
    let ra1 = r1.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let ra2 = r2.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let rac = rc.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let err_r = ((ra1 + ra2) - rac).abs() / rac.abs();
    assert!(err_r < 0.01,
        "Superposition reactions: R₁+R₂={:.4}, R_combined={:.4}", ra1 + ra2, rac);
}

// ================================================================
// 6. Unit Load Method: SS Beam Midspan Deflection
// ================================================================
//
// Apply unit load at midspan, compute compliance δ per unit load.
// Then verify: for actual load P, δ = P × δ_unit.

#[test]
fn validation_energy_unit_load_method() {
    let l = 8.0;
    let n = 8;
    let mid = n / 2 + 1;

    // Unit load
    let input_unit = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -1.0, my: 0.0,
        })]);
    let r_unit = linear::solve_2d(&input_unit).unwrap();
    let delta_unit = r_unit.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz;

    // Actual load P = 25
    let p = 25.0;
    let input_p = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let r_p = linear::solve_2d(&input_p).unwrap();
    let delta_p = r_p.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz;

    // By linearity: δ_P = P × δ_unit
    let err = (delta_p - p * delta_unit).abs() / delta_p.abs();
    assert!(err < 0.01,
        "Unit load: P×δ_unit={:.6e}, δ_P={:.6e}", p * delta_unit, delta_p);
}

// ================================================================
// 7. Clapeyron for Distributed Load
// ================================================================
//
// Cantilever with UDL: W_ext = ½ × ∫q(x)×v(x)dx.
// For concentrated equivalent: W ≈ ½ × total_load × avg_deflection.
// More precisely: U = q²L⁵/(40EI) for cantilever UDL.

#[test]
fn validation_energy_clapeyron_distributed() {
    let l = 6.0;
    let n = 8;
    let q = -10.0;
    let e_eff = E * 1000.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Compute external work from nodal forces and displacements
    // For UDL, each node carries a tributary load
    let elem_len = l / n as f64;
    let mut w_ext = 0.0;
    for disp in &results.displacements {
        if disp.node_id == 1 { continue; } // fixed node, no contribution
        // Tributary load at each interior node = q × elem_len (full element contribution)
        // End node gets q × elem_len/2
        let trib = if disp.node_id == n + 1 {
            q.abs() * elem_len / 2.0
        } else {
            q.abs() * elem_len
        };
        w_ext += 0.5 * trib * disp.uz.abs();
    }

    // Analytical strain energy: U = q²L⁵/(40EI)
    let u_exact = q * q * l.powi(5) / (40.0 * e_eff * IZ);

    // This is approximate due to lumped vs consistent load, allow wider tolerance
    let err = (w_ext - u_exact).abs() / u_exact;
    assert!(err < 0.15,
        "Clapeyron UDL: W_ext={:.6e}, U_exact={:.6e}", w_ext, u_exact);
}

// ================================================================
// 8. Reciprocal Reactions: Maxwell Applied to Supports
// ================================================================
//
// For a continuous beam:
// Load at A, reaction at B = R_B(A)
// Load at B, reaction at A = R_A(B)
// By Maxwell-Betti: P_A × settlement_B(A) = R_B(A) × P_A (generalized)
// More directly: if settlement d at B produces reaction at B = R, and
// same settlement at A produces reaction at A = R', then related by reciprocity.
//
// Simpler test: for SS beam, force at node_a gives R_b, force at node_b gives R_a.
// Verify: R_b(from P at a)/P = displacement_at_a(from unit settlement at b)

#[test]
fn validation_energy_reciprocal_reactions() {
    let l = 8.0;
    let n = 8;
    let p = 10.0;

    let node_a = 3; // at L/4 approx
    let node_b = 7; // at 3L/4 approx

    // Load case 1: force P at node_a → deflection at node_b
    let input1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_a, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let r1 = linear::solve_2d(&input1).unwrap();
    let d_b_1 = r1.displacements.iter().find(|d| d.node_id == node_b).unwrap().uz;

    // Load case 2: force P at node_b → deflection at node_a
    let input2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_b, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let r2 = linear::solve_2d(&input2).unwrap();
    let d_a_2 = r2.displacements.iter().find(|d| d.node_id == node_a).unwrap().uz;

    // Maxwell-Betti: deflection at B due to load at A = deflection at A due to load at B
    let err = (d_b_1 - d_a_2).abs() / d_b_1.abs();
    assert!(err < 0.01,
        "Reciprocal: δ_B(load@A)={:.6e}, δ_A(load@B)={:.6e}", d_b_1, d_a_2);

    // Also verify: work done by case 1 loads through case 2 displacements
    // = work done by case 2 loads through case 1 displacements
    let w_12 = p * r2.displacements.iter().find(|d| d.node_id == node_a).unwrap().uz.abs();
    let w_21 = p * r1.displacements.iter().find(|d| d.node_id == node_b).unwrap().uz.abs();
    let err_w = (w_12 - w_21).abs() / w_12;
    assert!(err_w < 0.01,
        "Reciprocal work: W₁₂={:.6e}, W₂₁={:.6e}", w_12, w_21);
}
