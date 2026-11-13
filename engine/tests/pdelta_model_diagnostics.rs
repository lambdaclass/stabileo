//! P-Delta results carry the model's diagnostics from the linear pass, and
//! only those: pre-solve gates, constraints, conditioning of K. The linear
//! pass's solution diagnostics — `ResidualOk`, the factorization path — say
//! nothing about the second-order state and must not appear on it.
use crate::common;

use common::*;
use dedaliano_engine::solver::{assembly, dof::DofNumbering, geometric_stiffness, linear, pdelta};
use dedaliano_engine::types::*;

/// Diagnostics whose content is a property of one particular solve (the
/// linear K u = F solve), not of the model.
fn is_solution_specific(d: &StructuredDiagnostic) -> bool {
    matches!(
        d.code,
        DiagnosticCode::ResidualOk
            | DiagnosticCode::ResidualHigh
            | DiagnosticCode::ExcessiveDisplacement
            | DiagnosticCode::SparseCholesky
            | DiagnosticCode::DenseLu
            | DiagnosticCode::SparseFallbackDenseLu
            | DiagnosticCode::CholeskyFailedLuFallback
            | DiagnosticCode::DiagonalRegularization
            | DiagnosticCode::SparseFillRatio
            | DiagnosticCode::EquilibriumOk
            | DiagnosticCode::EquilibriumViolation
    )
}

fn dump(label: &str, diags: &[StructuredDiagnostic]) {
    println!("  {label}:");
    for d in diags {
        println!(
            "    {:?} phase={:?} value={:?} msg={:?}",
            d.code, d.phase, d.value, d.message
        );
    }
}

fn force_scales(dofs: &DofNumbering, points: &[[f64; 3]], dimensions: usize) -> Vec<f64> {
    let centroid: [f64; 3] = std::array::from_fn(|i| {
        points.iter().map(|p| p[i] / points.len() as f64).sum()
    });
    let length = points.iter().map(|p| {
        (p[0] - centroid[0]).hypot(p[1] - centroid[1]).hypot(p[2] - centroid[2])
    }).fold(0.0_f64, f64::max);
    let mut scales = vec![1.0; dofs.n_free];
    for (&(_, local), &i) in &dofs.map {
        if i < dofs.n_free && local >= dimensions {
            scales[i] = length;
        }
    }
    scales
}

fn relative_residual(
    elastic: &[f64],
    geometric: &[f64],
    f: &[f64],
    u: &[f64],
    scales: &[f64],
) -> f64 {
    let norm = |values: &[f64]| {
        values.iter().zip(scales).fold(0.0_f64, |n, (v, scale)| n.hypot(v / scale))
    };
    use num_rational::BigRational;
    use num_traits::ToPrimitive;
    let exact = |v| BigRational::from_float(v).unwrap();
    let residual: Vec<_> = (0..scales.len()).map(|i| {
        let mut action = -exact(f[i]);
        for (j, value) in u.iter().enumerate() {
            let coefficient = elastic[i*u.len()+j] + geometric[i*u.len()+j];
            action += exact(coefficient) * exact(*value);
        }
        action.to_f64().unwrap()
    }).collect();
    norm(&residual) / norm(f)
}

#[test]
fn residual_oracle_scales_moments_to_forces() {
    let elastic = [2.0, 0.0, 0.0, 8.0];
    let geometric = [0.0; 4];
    assert_eq!(relative_residual(&elastic, &geometric, &[1.0, 8.0], &[1.0; 2], &[1.0, 4.0]), 1.0 / 1.0_f64.hypot(2.0));
    assert_eq!(relative_residual(&elastic, &geometric, &[1.0, 8.0], &[0.5, 1.5], &[1.0, 4.0]), 1.0 / 1.0_f64.hypot(2.0));
}

#[test]
fn residual_oracle_preserves_small_actions_through_cancellation() {
    let large = 2.0_f64.powi(53);
    let elastic = [large, 1.0, 1.0, 0.0];
    let geometric = [-large, 0.0, 0.0, 0.0];
    assert_eq!(relative_residual(&elastic, &geometric, &[2.0, 0.0], &[1.0; 2], &[1.0]), 0.5);
}

fn assert_final_equilibrium(
    equilibrium: &EquilibriumSummary,
    linear: &[f64],
    tangent: &[f64],
    f: &[f64],
    u: &[f64],
    scales: &[f64],
) {
    let linear_at_final_state = relative_residual(linear, &vec![0.0; linear.len()], f, u, scales);
    let second_order_at_final_state = relative_residual(tangent, &vec![0.0; tangent.len()], f, u, scales);
    println!("final-state residuals: linear={linear_at_final_state:e}, second-order={second_order_at_final_state:e}, reported={:e}", equilibrium.relative_residual);
    assert!(linear_at_final_state > 1e-6);
    assert!(second_order_at_final_state.is_finite() && second_order_at_final_state <= 1e-6);
    assert_eq!(equilibrium.relative_residual, second_order_at_final_state);
    assert!(equilibrium.residual_ok && equilibrium.equilibrium_ok);
    assert!(equilibrium.max_imbalance.is_finite());
    assert_eq!(equilibrium.applied_force_sum.len(), equilibrium.reaction_force_sum.len());
    println!("final equilibrium summary: {equilibrium:?}");
    assert!(matches!(equilibrium.applied_force_sum.len(), 3 | 6));
    let translations = if equilibrium.applied_force_sum.len() == 3 { 2 } else { 3 };
    for (f, r) in equilibrium.applied_force_sum[..translations].iter().zip(&equilibrium.reaction_force_sum[..translations]) {
        assert!((f + r).abs() < 1e-6 * f.abs().max(1.0));
    }
}

#[test]
fn pdelta_2d_does_not_claim_linear_residual_ok() {
    // Slender fixed-base portal (h=4 m, w=6 m, E=200 GPa, I=1e-4 m^4) with a
    // lateral load and heavy gravity so the sway is amplified ~1.8x.
    let input = make_portal_frame(4.0, 6.0, 200_000.0, 0.01, 1e-4, 20.0, -3700.0);

    let lin = linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 50, 1e-6).unwrap();

    let lin_ux = lin.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let pd_ux = pd.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    println!(
        "2D: converged={} b2_factor={:.3} sway linear={:.5e} pdelta={:.5e} ratio={:.3}",
        pd.converged, pd.b2_factor, lin_ux, pd_ux, pd_ux / lin_ux
    );
    println!("  pdelta equilibrium is_none={}", pd.results.equilibrium.is_none());
    dump("linear structured", &lin.structured_diagnostics);
    dump("pdelta structured", &pd.results.structured_diagnostics);

    assert!(pd.converged && pd.is_stable);
    assert!(pd_ux / lin_ux > 1.5, "want a real amplification, got {}", pd_ux / lin_ux);
    let dofs = DofNumbering::build_2d(&input);
    let asm = assembly::assemble_2d(&input, &dofs);
    let mut u = vec![0.0; dofs.n_total];
    for d in &pd.results.displacements {
        for (k, v) in [d.ux, d.uz, d.ry].into_iter().enumerate() {
            if let Some(i) = dofs.global_dof(d.node_id, k) { u[i] = v; }
        }
    }
    let mut geometric = asm.k.clone();
    geometric_stiffness::add_geometric_stiffness_2d(&input, &dofs, &u, &mut geometric);
    let points: Vec<_> = input.nodes.values().map(|n| [n.x, 0.0, n.z]).collect();
    let scales = force_scales(&dofs, &points, 2);
    assert_final_equilibrium(pd.results.equilibrium.as_ref().unwrap(), &asm.k, &geometric, &asm.f, &u, &scales);

    let lin_res = lin
        .structured_diagnostics
        .iter()
        .find(|d| d.code == DiagnosticCode::ResidualOk)
        .and_then(|d| d.value);
    let pd_res = pd
        .results
        .structured_diagnostics
        .iter()
        .find(|d| d.code == DiagnosticCode::ResidualOk)
        .and_then(|d| d.value);
    println!("  linear residual={lin_res:?}  pdelta-reported residual={pd_res:?}");

    let leaked: Vec<_> = pd
        .results
        .structured_diagnostics
        .iter()
        .filter(|d| is_solution_specific(d))
        .map(|d| format!("{:?}({:?})", d.code, d.phase))
        .collect();
    assert!(
        leaked.is_empty(),
        "P-Delta result (sway x{:.2}) carries linear-solve diagnostics: {leaked:?}",
        pd_ux / lin_ux
    );
}

#[test]
fn pdelta_3d_does_not_claim_linear_residual_ok() {
    // 4 m cantilever column along Z, 4 elements, axial P ~0.44 Pcr + lateral.
    let n = 4;
    let l = 4.0;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, 0.0, 0.0, l * i as f64 / n as f64)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();
    let top = n + 1;
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: top,
        fx: 10.0,
        fy: 0.0,
        fz: -1350.0,
        mx: 0.0,
        my: 0.0,
        mz: 0.0,
        bw: None,
    })];
    let input = make_3d_input(
        nodes,
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4, 1e-4, 2e-4)],
        elems,
        vec![(1, vec![true; 6])],
        loads,
    );

    let lin = linear::solve_3d(&input).unwrap();
    let pd = pdelta::solve_pdelta_3d(&input, 50, 1e-6).unwrap();
    let lin_ux = lin.displacements.iter().find(|d| d.node_id == top).unwrap().ux;
    let pd_ux = pd.results.displacements.iter().find(|d| d.node_id == top).unwrap().ux;
    println!(
        "3D: converged={} b2_factor={:.3} sway linear={:.5e} pdelta={:.5e} ratio={:.3}",
        pd.converged, pd.b2_factor, lin_ux, pd_ux, pd_ux / lin_ux
    );
    println!("  pdelta equilibrium is_none={}", pd.results.equilibrium.is_none());
    dump("linear structured", &lin.structured_diagnostics);
    dump("pdelta structured", &pd.results.structured_diagnostics);
    println!("  pdelta legacy solver_diagnostics: {:?}", pd.results.solver_diagnostics);

    assert!(pd.converged && pd.is_stable);
    assert!(pd_ux / lin_ux > 1.5, "want a real amplification, got {}", pd_ux / lin_ux);
    let dofs = DofNumbering::build_3d(&input);
    let asm = assembly::assemble_3d(&input, &dofs);
    let mut u = vec![0.0; dofs.n_total];
    for d in &pd.results.displacements {
        for (k, v) in [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz].into_iter().enumerate() {
            if let Some(i) = dofs.global_dof(d.node_id, k) { u[i] = v; }
        }
    }
    let mut geometric = asm.k.clone();
    geometric_stiffness::add_geometric_stiffness_3d(&input, &dofs, &u, &mut geometric);
    let points: Vec<_> = input.nodes.values().map(|n| [n.x, n.y, n.z]).collect();
    let scales = force_scales(&dofs, &points, 3);
    assert_final_equilibrium(pd.results.equilibrium.as_ref().unwrap(), &asm.k, &geometric, &asm.f, &u, &scales);

    let leaked: Vec<_> = pd
        .results
        .structured_diagnostics
        .iter()
        .filter(|d| is_solution_specific(d))
        .map(|d| format!("{:?}({:?})", d.code, d.phase))
        .collect();
    assert!(
        leaked.is_empty(),
        "3D P-Delta result (sway x{:.2}) carries linear-solve diagnostics: {leaked:?}",
        pd_ux / lin_ux
    );
}
