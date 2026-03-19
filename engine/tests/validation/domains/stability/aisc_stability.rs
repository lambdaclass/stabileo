/// Validation: AISC 360-22 Chapter C Stability Benchmarks
///
/// Reference: AISC 360-22 Commentary Cases 1 & 2; Zubydan (2010) benchmark frames.
///
/// Tests: B1 (braced) and B2 (sway) amplification factors, convergence, equilibrium.
use dedaliano_engine::solver::{linear, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;

// W14x48 section properties (SI units)
const W14_A: f64 = 0.00912; // m²
const W14_IZ: f64 = 2.0126e-4; // m⁴
const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 → kN/m²)
const E_EFF: f64 = E * 1000.0; // effective E in kN/m² for hand calculations
const L: f64 = 3.658; // m (12 ft)

// ═══════════════════════════════════════════════════════════════
// 1. Case 1: Braced Column — P-delta (no sway), B1 amplification
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_aisc_case1_b1_amplification() {
    // W14x48 column, pinned-pinned, P=2224 kN axial, w=14.59 kN/m lateral UDL
    // Pe1 = π²EI/L² = π²*200000*2.0126e-4 / 3.658² = 29,627 kN
    // Cm = 1.0 (uniform load)
    // B1 = Cm/(1 - P/Pe1) = 1.0/(1 - 2224/29627) = 1.081
    // Midspan moment (first-order): M_nt = wL²/8 = 14.59*3.658²/8 = 24.40 kN·m
    // Amplified: B1*M_nt = 1.081*24.40 = 26.38 kN·m
    let p_axial = 2224.0; // kN
    let w = 14.59; // kN/m
    let n = 8;
    let pe1 = std::f64::consts::PI.powi(2) * E_EFF * W14_IZ / (L * L);
    let cm = 1.0;
    let b1_expected = cm / (1.0 - p_axial / pe1);
    let m_nt = w * L * L / 8.0;

    let elem_len = L / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

    let mut loads = Vec::new();
    // Axial compression at tip
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: -p_axial, fz: 0.0, my: 0.0,
    }));
    // UDL on all elements
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: w, q_j: w, a: None, b: None,
        }));
    }

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, W14_A, W14_IZ)], elems,
        vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
        loads.clone(),
    );

    let linear_res = linear::solve_2d(&input).unwrap();
    let pdelta_res = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();
    assert!(pdelta_res.converged, "Case 1 should converge");
    assert!(pdelta_res.is_stable, "Case 1 should be stable");

    // Find midspan node
    let mid_node = n / 2 + 1;
    let lin_uy = linear_res.displacements.iter().find(|d| d.node_id == mid_node).unwrap().uz;
    let pd_uy = pdelta_res.results.displacements.iter().find(|d| d.node_id == mid_node).unwrap().uz;

    // Displacement amplification should approximate B1
    let actual_af = pd_uy.abs() / lin_uy.abs();
    assert!(
        (actual_af - b1_expected).abs() / b1_expected < 0.05,
        "B1 amplification: actual={:.4}, expected={:.4}, M_nt={:.2}",
        actual_af, b1_expected, m_nt
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Case 2: Unbraced Cantilever — P-Delta (sway), B2 amplification
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_aisc_case2_b2_sway_amplification() {
    // W14x48 cantilever, P=890 kN, H=22.24 kN (lateral at tip)
    // First-order drift Δ_1st = H*L³/(3EI)
    // B2 = 1/(1 - ΣP*Δ/(ΣH*L))
    let p_axial = 890.0;
    let h_load = 22.24;
    let n = 8;

    let elem_len = L / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, W14_A, W14_IZ)],
        elems, vec![(1, 1, "fixed")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: -p_axial, fz: h_load, my: 0.0,
            }),
        ],
    );

    let linear_res = linear::solve_2d(&input).unwrap();
    let pdelta_res = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();
    assert!(pdelta_res.converged, "Case 2 should converge");
    assert!(pdelta_res.is_stable, "Case 2 should be stable");

    let lin_uy = linear_res.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz;
    let pd_uy = pdelta_res.results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz;

    // B2 estimate from first-order drift
    let delta_1 = lin_uy.abs();
    let b2_approx = 1.0 / (1.0 - p_axial * delta_1 / (h_load * L));

    let actual_af = pd_uy.abs() / lin_uy.abs();
    assert!(
        (actual_af - b2_approx).abs() / b2_approx < 0.05,
        "B2 sway: actual_af={:.4}, B2_approx={:.4}", actual_af, b2_approx
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. B1 grows as P→Pe1
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_aisc_b1_vs_p_pe_ratio() {
    // Verify B1 grows as P/Pe1 increases (3 load levels)
    let w = 14.59;
    let n = 8;
    let pe1 = std::f64::consts::PI.powi(2) * E_EFF * W14_IZ / (L * L);

    let mut prev_af = 1.0;
    for &p_ratio in &[0.05, 0.30, 0.60] {
        let p = p_ratio * pe1;

        let elem_len = L / n as f64;
        let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
        let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

        let mut loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: -p, fz: 0.0, my: 0.0,
        })];
        for i in 0..n {
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1, q_i: w, q_j: w, a: None, b: None,
            }));
        }

        let input = make_input(
            nodes, vec![(1, E, 0.3)], vec![(1, W14_A, W14_IZ)], elems,
            vec![(1, 1, "pinned"), (2, n + 1, "rollerX")], loads.clone(),
        );

        let lin = linear::solve_2d(&input).unwrap();
        let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();

        if pd.converged && pd.is_stable {
            let mid = n / 2 + 1;
            let lin_uy = lin.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;
            let pd_uy = pd.results.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;
            let af = pd_uy.abs() / lin_uy.abs();

            assert!(
                af >= prev_af - 0.01,
                "B1 should grow: P/Pe={:.2}, af={:.4}, prev={:.4}", p_ratio, af, prev_af
            );
            prev_af = af;
        }
    }
    assert!(prev_af > 1.1, "B1 should have grown above 1.1, got {:.4}", prev_af);
}

// ═══════════════════════════════════════════════════════════════
// 4. Zero lateral load: P-delta = linear
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_aisc_pdelta_equals_linear_no_lateral() {
    // With only axial load and no lateral, P-delta should give same results as linear
    // (no initial displacement to amplify)
    let p_axial = 1000.0;
    let n = 8;

    let elem_len = L / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, W14_A, W14_IZ)], elems,
        vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: -p_axial, fz: 0.0, my: 0.0,
        })],
    );

    let lin = linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 20, 1e-5).unwrap();
    assert!(pd.converged);

    // All lateral displacements should be essentially zero (or match linear)
    for ld in &lin.displacements {
        let pd_d = pd.results.displacements.iter().find(|d| d.node_id == ld.node_id).unwrap();
        let diff = (pd_d.uz - ld.uz).abs();
        assert!(
            diff < 1e-6,
            "No lateral: node {} Δuy={:.2e}", ld.node_id, diff
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// 5. Equilibrium after P-delta (Case 1)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_aisc_pdelta_equilibrium() {
    let p_axial = 2224.0;
    let w = 14.59;
    let n = 8;

    let elem_len = L / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

    let mut loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: -p_axial, fz: 0.0, my: 0.0,
    })];
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: w, q_j: w, a: None, b: None,
        }));
    }

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, W14_A, W14_IZ)], elems,
        vec![(1, 1, "pinned"), (2, n + 1, "rollerX")], loads,
    );

    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();
    assert!(pd.converged);

    // ΣRx should balance applied axial (applied is -p_axial, so reactions = +p_axial)
    let sum_rx: f64 = pd.results.reactions.iter().map(|r| r.rx).sum();
    assert!(
        (sum_rx - p_axial).abs() < 5.0,
        "Equilibrium ΣRx={:.2}, expected={:.2}", sum_rx, p_axial
    );

    // ΣRy should approximately balance UDL total (P-delta shifts forces slightly)
    let total_fz = w * L; // ~53.37 kN
    let sum_ry: f64 = pd.results.reactions.iter().map(|r| r.rz).sum();
    // In P-delta, geometry effects create additional shear, so allow ~10% tolerance
    assert!(
        (sum_ry.abs() - total_fz).abs() < total_fz * 0.10,
        "Equilibrium |ΣRy|={:.2}, total_fz={:.2}", sum_ry.abs(), total_fz
    );
}

// ═══════════════════════════════════════════════════════════════
// 6. Convergence: < 10 iterations for Cases 1 and 2
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_aisc_convergence_within_10_iterations() {
    let n = 8;

    // Case 1: Braced column
    {
        let elem_len = L / n as f64;
        let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
        let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();
        let mut loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: -2224.0, fz: 0.0, my: 0.0,
        })];
        for i in 0..n {
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1, q_i: 14.59, q_j: 14.59, a: None, b: None,
            }));
        }
        let input = make_input(
            nodes, vec![(1, E, 0.3)], vec![(1, W14_A, W14_IZ)], elems,
            vec![(1, 1, "pinned"), (2, n + 1, "rollerX")], loads,
        );
        let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();
        assert!(pd.converged);
        assert!(
            pd.iterations <= 10,
            "Case 1: converged in {} iterations (expected ≤ 10)", pd.iterations
        );
    }

    // Case 2: Cantilever
    {
        let elem_len = L / n as f64;
        let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
        let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();
        let input = make_input(
            nodes, vec![(1, E, 0.3)], vec![(1, W14_A, W14_IZ)], elems,
            vec![(1, 1, "fixed")],
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: -890.0, fz: 22.24, my: 0.0,
            })],
        );
        let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();
        assert!(pd.converged);
        assert!(
            pd.iterations <= 10,
            "Case 2: converged in {} iterations (expected ≤ 10)", pd.iterations
        );
    }
}
