//! P-Delta results carry the model's diagnostics from the linear pass, and
//! only those: pre-solve gates, constraints, conditioning of K. The linear
//! pass's solution diagnostics — `ResidualOk`, the factorization path — say
//! nothing about the second-order state and must not appear on it.
#[path = "common/mod.rs"]
mod common;

use common::*;
use dedaliano_engine::solver::{linear, pdelta};
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
    assert!(pd.results.equilibrium.is_none());

    // The copied ResidualOk carries the *linear* residual, bit-for-bit.
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
        "P-Delta result (equilibrium=None, sway x{:.2}) carries linear-solve diagnostics: {leaked:?}",
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
    assert!(pd.results.equilibrium.is_none());

    let leaked: Vec<_> = pd
        .results
        .structured_diagnostics
        .iter()
        .filter(|d| is_solution_specific(d))
        .map(|d| format!("{:?}({:?})", d.code, d.phase))
        .collect();
    assert!(
        leaked.is_empty(),
        "3D P-Delta result (equilibrium=None, sway x{:.2}) carries linear-solve diagnostics: {leaked:?}",
        pd_ux / lin_ux
    );
}
