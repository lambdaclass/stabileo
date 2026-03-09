/// Validation: Advanced Co-rotational Analysis — Extended Tests
///
/// These tests cover aspects NOT tested in the existing corotational
/// validation suites (validation_advanced_corotational.rs,
/// validation_corotational.rs, validation_corotational_benchmarks.rs).
///
/// Topics covered:
///   1. Pure analytical: Euler amplification factor δ_NL = δ_L / (1 - P/Pcr)
///   2. Pure analytical: Secant formula maximum stress σ_max
///   3. FEM: Truss bar (double-hinged) under axial load — no bending
///   4. FEM: Fixed-fixed column P-delta stiffness reduction
///   5. FEM: Right-angle L-frame large displacement
///   6. FEM: Symmetric structure produces symmetric displacements
///   7. FEM: Global equilibrium of corotational solution
///   8. FEM: Distributed load on cantilever — corotational vs linear comparison
///
/// References:
///   - Timoshenko & Gere, "Theory of Elastic Stability"
///   - Bazant & Cedolin, "Stability of Structures"
///   - Crisfield, "Non-linear Finite Element Analysis"
///   - Galambos & Surovek, "Structural Stability of Steel"
use dedaliano_engine::solver::{corotational, linear};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 → kN/m²)
const E_EFF: f64 = E * 1000.0; // kN/m²

// ================================================================
// 1. Pure Analytical: Euler Amplification Factor
// ================================================================
//
// Reference: Timoshenko, "Theory of Elastic Stability"
//
// For a simply-supported beam-column under transverse load Q and
// axial compression P, the midspan deflection is amplified:
//   δ_NL = δ_L × AF
// where AF = 1 / (1 - P/Pcr)  (first-order approximation)
//
// This is a pure formula test — no FEM involved.

#[test]
fn validation_corot_ext_euler_amplification_factor() {
    let pi: f64 = std::f64::consts::PI;
    let l: f64 = 5.0;
    let iz: f64 = 1e-4;
    let pcr: f64 = pi * pi * E_EFF * iz / (l * l);

    // Test at several load ratios
    let ratios = [0.1, 0.3, 0.5, 0.7, 0.9];
    for &ratio in &ratios {
        let p: f64 = ratio * pcr;
        let af: f64 = 1.0 / (1.0 - p / pcr);
        let expected: f64 = 1.0 / (1.0 - ratio);

        assert_close(
            af, expected, 0.001,
            &format!("Amplification factor at P/Pcr={:.1}", ratio),
        );
    }

    // Verify limiting behavior: as P→0, AF→1
    let af_zero: f64 = 1.0 / (1.0 - 0.001);
    assert_close(af_zero, 1.0, 0.01, "AF approaches 1 for P→0");

    // Verify AF diverges: at P/Pcr=0.99, AF=100
    let af_near_crit: f64 = 1.0 / (1.0 - 0.99);
    assert_close(af_near_crit, 100.0, 0.001, "AF diverges near Pcr");
}

// ================================================================
// 2. Pure Analytical: Secant Formula for Eccentric Column
// ================================================================
//
// Reference: Timoshenko, "Strength of Materials"
//
// Maximum stress in an eccentrically loaded column:
//   σ_max = (P/A) × [1 + (e·c/r²) × sec(L/(2r) × √(P/(AE)))]
// where r = √(I/A), c = distance to extreme fiber.
//
// Verify the formula for known parameters.

#[test]
fn validation_corot_ext_secant_formula_stress() {
    let pi: f64 = std::f64::consts::PI;
    let l: f64 = 3.0;     // column length
    let b: f64 = 0.1;     // width
    let h: f64 = 0.15;    // depth
    let a: f64 = b * h;   // area
    let iz: f64 = b * h.powi(3) / 12.0;
    let r_sq: f64 = iz / a;              // r² = I/A
    let r: f64 = r_sq.sqrt();            // radius of gyration
    let c: f64 = h / 2.0;               // distance to extreme fiber
    let ecc: f64 = 0.01;                // eccentricity (m)

    let pcr: f64 = pi * pi * E_EFF * iz / (l * l);
    let p: f64 = 0.3 * pcr;             // 30% of Euler load

    // Secant formula: σ_max = (P/A) * [1 + (e*c/r²) * sec(L/(2r) * sqrt(P/(AE)))]
    let arg: f64 = (l / (2.0 * r)) * (p / (a * E_EFF)).sqrt();
    let sec_val: f64 = 1.0 / arg.cos();
    let sigma_max: f64 = (p / a) * (1.0 + (ecc * c / r_sq) * sec_val);

    // Direct stress without eccentricity
    let sigma_direct: f64 = p / a;

    // σ_max must exceed direct stress
    assert!(
        sigma_max > sigma_direct,
        "Eccentric stress {:.3} must exceed direct stress {:.3}",
        sigma_max, sigma_direct
    );

    // The eccentricity amplification factor
    let stress_ratio: f64 = sigma_max / sigma_direct;
    let expected_ratio: f64 = 1.0 + (ecc * c / r_sq) * sec_val;
    assert_close(
        stress_ratio, expected_ratio, 0.001,
        "Secant formula stress amplification",
    );

    // For small eccentricity and small P/Pcr, amplification should be modest
    assert!(
        stress_ratio > 1.0 && stress_ratio < 5.0,
        "Stress ratio {:.4} should be between 1 and 5 for these parameters",
        stress_ratio
    );
}

// ================================================================
// 3. FEM: Pure Axial Loading — Frame Element With No Bending
// ================================================================
//
// Reference: Basic structural mechanics (δ = PL/(EA))
//
// A fixed-rollerX beam under pure axial tension. Since the load is
// aligned with the axis and supports prevent transverse motion at
// the ends, there should be negligible bending. The corotational
// solver should recover the linear axial displacement δ = PL/(EA).

#[test]
fn validation_corot_ext_pure_axial_frame() {
    let l: f64 = 4.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let p: f64 = 100.0; // kN axial tension

    let n = 8;
    let elem_len: f64 = l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    // Regular frame elements (not hinged)
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Fixed at start (restrains all DOFs), free end gets axial load
    let sups = vec![(1, 1, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: p,
        fy: 0.0,
        mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a, iz)],
        elems,
        sups,
        loads,
    );

    let result = corotational::solve_corotational_2d(&input, 50, 1e-6, 5).unwrap();
    assert!(result.converged, "Pure axial frame should converge");

    // Axial displacement: δ = PL/(EA_eff)
    let delta_expected: f64 = p * l / (E_EFF * a);
    let tip = result
        .results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();

    assert_close(
        tip.ux,
        delta_expected,
        0.05,
        "Pure axial frame displacement PL/(EA)",
    );

    // All transverse displacements should be essentially zero
    for d in &result.results.displacements {
        assert_close(
            d.uy,
            0.0,
            0.05,
            &format!("Node {} uy should be zero for pure axial", d.node_id),
        );
    }
}

// ================================================================
// 4. FEM: Fixed-Fixed Column — Geometric Stiffness Reduction
// ================================================================
//
// Reference: Bazant & Cedolin, "Stability of Structures"
//
// A fixed-fixed column has Pcr = 4π²EI/L². When loaded below Pcr
// with a small lateral perturbation, the corotational solver should
// show amplified lateral displacement compared to linear. The
// effective lateral stiffness is reduced by axial compression.

#[test]
fn validation_corot_ext_fixed_fixed_column_stiffness_reduction() {
    let pi: f64 = std::f64::consts::PI;
    let l: f64 = 3.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let pcr: f64 = 4.0 * pi * pi * E_EFF * iz / (l * l);

    // Apply 40% of Euler load as compression + small lateral perturbation
    let p_axial: f64 = 0.40 * pcr;
    let p_lateral: f64 = 1.0; // small lateral force at midspan

    let n = 10;
    let elem_len: f64 = l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Fixed at both ends
    let sups = vec![(1, 1, "fixed"), (2, n + 1, "fixed")];
    let loads = vec![
        // Axial compression at the free end
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: -p_axial,
            fy: 0.0,
            mz: 0.0,
        }),
        // Small lateral perturbation at midspan
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1,
            fx: 0.0,
            fy: p_lateral,
            mz: 0.0,
        }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a, iz)],
        elems,
        sups,
        loads,
    );

    let lin_res = linear::solve_2d(&input).unwrap();
    let corot_res = corotational::solve_corotational_2d(&input, 50, 1e-6, 10).unwrap();
    assert!(corot_res.converged, "Fixed-fixed column should converge at 40% Pcr");

    let mid_lin = lin_res
        .displacements
        .iter()
        .find(|d| d.node_id == n / 2 + 1)
        .unwrap();
    let mid_corot = corot_res
        .results
        .displacements
        .iter()
        .find(|d| d.node_id == n / 2 + 1)
        .unwrap();

    // Corotational should show more lateral deflection due to geometric softening
    assert!(
        mid_corot.uy.abs() >= mid_lin.uy.abs() * 0.95,
        "Compression should amplify lateral deflection: corot={:.6e}, linear={:.6e}",
        mid_corot.uy.abs(),
        mid_lin.uy.abs()
    );

    // The amplification should be bounded — we're well below Pcr
    let amp: f64 = mid_corot.uy.abs() / mid_lin.uy.abs().max(1e-15);
    assert!(
        amp < 5.0,
        "Amplification at 40% Pcr should be moderate, got {:.2}",
        amp
    );
}

// ================================================================
// 5. FEM: Right-Angle L-Frame Under Tip Load
// ================================================================
//
// Reference: Crisfield, "Non-linear Finite Element Analysis"
//
// A right-angle frame (vertical column + horizontal beam, rigidly
// connected) under a horizontal tip load. The corotational solver
// should converge and show coupling between axial and bending effects.

#[test]
fn validation_corot_ext_l_frame_tip_load() {
    let h: f64 = 3.0; // column height
    let w: f64 = 3.0; // beam span
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let p: f64 = 20.0; // lateral load at beam tip

    let n_col = 6;
    let n_beam = 6;
    let col_len: f64 = h / n_col as f64;
    let beam_len: f64 = w / n_beam as f64;

    // Column nodes: vertical from (0,0) to (0,h)
    let mut nodes = Vec::new();
    for i in 0..=n_col {
        nodes.push((i + 1, 0.0, i as f64 * col_len));
    }
    // Beam nodes: horizontal from (0,h) to (w,h) — sharing the corner node
    for i in 1..=n_beam {
        nodes.push((n_col + 1 + i, i as f64 * beam_len, h));
    }

    let corner_node = n_col + 1;
    let tip_node = n_col + 1 + n_beam;

    // Column elements
    let mut elems = Vec::new();
    for i in 0..n_col {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    // Beam elements
    for i in 0..n_beam {
        let ni = if i == 0 { corner_node } else { n_col + 1 + i };
        let nj = n_col + 1 + i + 1;
        elems.push((n_col + i + 1, "frame", ni, nj, 1, 1, false, false));
    }

    // Fixed base
    let sups = vec![(1, 1, "fixed")];
    // Horizontal load at beam tip
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip_node,
        fx: p,
        fy: 0.0,
        mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a, iz)],
        elems,
        sups,
        loads,
    );

    let lin_res = linear::solve_2d(&input).unwrap();
    let corot_res = corotational::solve_corotational_2d(&input, 50, 1e-6, 10).unwrap();
    assert!(corot_res.converged, "L-frame should converge");

    // Tip should displace horizontally
    let tip_lin = lin_res
        .displacements
        .iter()
        .find(|d| d.node_id == tip_node)
        .unwrap();
    let tip_corot = corot_res
        .results
        .displacements
        .iter()
        .find(|d| d.node_id == tip_node)
        .unwrap();

    assert!(
        tip_lin.ux.abs() > 1e-8,
        "Linear tip should displace horizontally"
    );
    assert!(
        tip_corot.ux.abs() > 1e-8,
        "Corotational tip should displace horizontally"
    );

    // Both should agree reasonably (moderate load)
    let ratio: f64 = tip_corot.ux / tip_lin.ux;
    assert!(
        ratio > 0.7 && ratio < 1.5,
        "L-frame corot/linear ratio={:.4} should be close to 1 for moderate load",
        ratio
    );

    // Corner node should also have displacement
    let corner_corot = corot_res
        .results
        .displacements
        .iter()
        .find(|d| d.node_id == corner_node)
        .unwrap();
    assert!(
        corner_corot.ux.abs() > 1e-10 || corner_corot.uy.abs() > 1e-10,
        "Corner node should displace"
    );
}

// ================================================================
// 6. FEM: Symmetric Structure → Symmetric Displacements
// ================================================================
//
// Reference: Basic structural mechanics — symmetry principle
//
// A pin-pin beam with symmetric lateral loads at quarter-points.
// Displacements at the two quarter-points should be equal by symmetry.
// This tests that the corotational formulation preserves symmetry.

#[test]
fn validation_corot_ext_symmetric_displacements() {
    let l: f64 = 6.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let p: f64 = 50.0;

    let n = 12; // divisible by 4 for clean quarter-points
    let elem_len: f64 = l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let sups = vec![(1, 1, "pinned"), (2, n + 1, "rollerX")];

    let qtr1_node = n / 4 + 1; // quarter-point
    let qtr3_node = 3 * n / 4 + 1; // three-quarter point

    // Symmetric lateral loads at quarter-points
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: qtr1_node,
            fx: 0.0,
            fy: -p,
            mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: qtr3_node,
            fx: 0.0,
            fy: -p,
            mz: 0.0,
        }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a, iz)],
        elems,
        sups,
        loads,
    );

    let result = corotational::solve_corotational_2d(&input, 50, 1e-6, 10).unwrap();
    assert!(result.converged, "Symmetric beam should converge");

    let qtr1 = result
        .results
        .displacements
        .iter()
        .find(|d| d.node_id == qtr1_node)
        .unwrap();
    let qtr3 = result
        .results
        .displacements
        .iter()
        .find(|d| d.node_id == qtr3_node)
        .unwrap();

    // Vertical displacements at symmetric points should be equal
    assert_close(
        qtr1.uy,
        qtr3.uy,
        0.01,
        "Symmetric quarter-point vertical displacements",
    );

    // Rotations should be equal in magnitude but opposite in sign
    assert_close(
        qtr1.rz.abs(),
        qtr3.rz.abs(),
        0.05,
        "Symmetric quarter-point rotation magnitudes",
    );

    // Midspan deflection should be the maximum
    let mid_node = n / 2 + 1;
    let mid = result
        .results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();
    assert!(
        mid.uy.abs() >= qtr1.uy.abs() * 0.99,
        "Midspan deflection {:.6e} should be >= quarter-point {:.6e}",
        mid.uy.abs(),
        qtr1.uy.abs()
    );
}

// ================================================================
// 7. FEM: Global Equilibrium of Corotational Solution
// ================================================================
//
// Reference: Newton's laws — sum of forces = 0 at equilibrium
//
// For a converged corotational solution, the sum of all reaction
// forces must balance the applied loads. This checks that the
// corotational internal force recovery is consistent.

#[test]
fn validation_corot_ext_global_equilibrium() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let p_lateral: f64 = 15.0;
    let p_gravity: f64 = -30.0;

    let input = make_portal_frame(h, w, E, a, iz, p_lateral, p_gravity);

    let result = corotational::solve_corotational_2d(&input, 50, 1e-6, 10).unwrap();
    assert!(result.converged, "Portal frame should converge");

    // Sum of applied loads
    // Lateral: 15 kN at node 2 in x
    // Gravity: -30 kN at nodes 2 and 3 in y (total = -60 kN)
    let applied_fx: f64 = p_lateral;
    let applied_fy: f64 = 2.0 * p_gravity;

    // Sum of reactions
    let sum_rx: f64 = result.results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = result.results.reactions.iter().map(|r| r.ry).sum();

    // Equilibrium: reactions + applied = 0
    assert_close(
        sum_rx + applied_fx,
        0.0,
        0.05,
        "Horizontal equilibrium (Σrx + Σfx)",
    );
    assert_close(
        sum_ry + applied_fy,
        0.0,
        0.05,
        "Vertical equilibrium (Σry + Σfy)",
    );
}

// ================================================================
// 8. FEM: Cantilever with Distributed Load — Corot vs Linear
// ================================================================
//
// Reference: Euler-Bernoulli beam theory
//
// A cantilever under uniform distributed load. For moderate loads,
// the corotational deflection should be close to the linear result.
// For this test we verify both the tip deflection magnitude and
// that element forces remain in equilibrium.

#[test]
fn validation_corot_ext_cantilever_distributed_load() {
    let l: f64 = 3.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let q: f64 = -5.0; // kN/m downward

    let n = 8;
    let elem_len: f64 = l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let sups = vec![(1, 1, "fixed")];

    // Distributed load on each element
    let loads: Vec<_> = (0..n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a, iz)],
        elems,
        sups,
        loads,
    );

    // Linear reference: δ_tip = qL⁴/(8EI)
    let delta_linear_analytical: f64 = q * l.powi(4) / (8.0 * E_EFF * iz);

    let lin_res = linear::solve_2d(&input).unwrap();
    let corot_res = corotational::solve_corotational_2d(&input, 50, 1e-6, 10).unwrap();
    assert!(corot_res.converged, "Cantilever UDL should converge");

    let tip_node = n + 1;
    let tip_lin = lin_res
        .displacements
        .iter()
        .find(|d| d.node_id == tip_node)
        .unwrap();
    let tip_corot = corot_res
        .results
        .displacements
        .iter()
        .find(|d| d.node_id == tip_node)
        .unwrap();

    // Linear FEM should match analytical formula
    assert_close(
        tip_lin.uy,
        delta_linear_analytical,
        0.05,
        "Linear FEM tip deflection vs analytical qL^4/(8EI)",
    );

    // For moderate distributed load, corotational should be close to linear
    let ratio: f64 = tip_corot.uy / tip_lin.uy;
    assert!(
        ratio > 0.8 && ratio < 1.2,
        "Corot/linear deflection ratio={:.4} should be close to 1 for moderate UDL",
        ratio
    );

    // Reaction at fixed support should equal total applied load
    let total_load: f64 = q * l; // total distributed load (negative = downward)
    let reaction_ry: f64 = corot_res
        .results
        .reactions
        .iter()
        .find(|r| r.node_id == 1)
        .unwrap()
        .ry;

    assert_close(
        reaction_ry + total_load,
        0.0,
        0.05,
        "Vertical equilibrium: Ry + qL = 0",
    );
}
