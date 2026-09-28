//! Modal participation of a constrained model.
//!
//! Γ = φᵀM r / φᵀM φ. With constraints the solve space is reduced by C, and the numerator has to
//! be reduced as the force it is — Cᵀ(M·r) — not as Cᵀr times the reduced mass: Cᵀ sums the
//! ones of every tied node, so N nodes on one EqualDOF gave Γ N× and effective mass N²× too
//! large, and mass ratios far above 1.
//!
//! Each constrained model is compared with the same structure tied physically by very stiff,
//! massless truss links. They must agree on period, Γ, effective mass, cumulative mass ratio
//! and spectral displacement, and Σ effective mass can never exceed the total mass.
#[path = "common/mod.rs"]
mod common;

use common::*;
use dedaliano_engine::solver::{modal, spectral};
use dedaliano_engine::types::*;
use std::collections::HashMap;

const H: f64 = 3.0;
const L: f64 = 4.0;
const E_COL: f64 = 30_000.0;
const COL_A: f64 = 0.09;
const COL_I: f64 = 6.75e-4;
const E_LINK: f64 = 3.0e8;
const RHO: f64 = 2_446.5;

/// Relative at any magnitude: `assert_close` divides by max(|expected|, 1), which against
/// periods of 0.05 s or displacements of 1e-4 m is an absolute tolerance, not a relative one.
fn assert_rel(actual: f64, expected: f64, tol: f64, label: &str) {
    let rel = ((actual - expected) / expected).abs();
    assert!(rel < tol, "{label}: actual={actual:.6e}, expected={expected:.6e}, rel_err={:.3}%", rel * 100.0);
}

fn dens() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), RHO);
    d.insert("2".to_string(), 0.0); // links are massless
    d
}

/// Three cantilever columns (bases 1,3,5 — tops 2,4,6). `tie`: true → EqualDOF on top ux,
/// false → stiff massless trusses 2-4, 4-6.
fn three_columns_2d(constrained: bool) -> SolverInput {
    let mut elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 3, 4, 1, 1, false, false),
        (3, "frame", 5, 6, 1, 1, false, false),
    ];
    if !constrained {
        elems.push((4, "truss", 2, 4, 2, 2, false, false));
        elems.push((5, "truss", 4, 6, 2, 2, false, false));
    }
    let mut input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, H), (3, L, 0.0), (4, L, H), (5, 2.0 * L, 0.0), (6, 2.0 * L, H)],
        vec![(1, E_COL, 0.2), (2, E_LINK, 0.2)],
        vec![(1, COL_A, COL_I), (2, 1.0, 1.0)],
        elems,
        vec![(1, 1, "fixed"), (2, 3, "fixed"), (3, 5, "fixed")],
        vec![],
    );
    if constrained {
        input.constraints = vec![
            Constraint::EqualDOF(EqualDOFConstraint { master_node: 2, slave_node: 4, dofs: vec![0] }),
            Constraint::EqualDOF(EqualDOFConstraint { master_node: 2, slave_node: 6, dofs: vec![0] }),
        ];
    }
    input
}

fn sway_2d(r: &modal::ModalResult) -> &modal::ModeShape {
    r.modes.iter().max_by(|a, b| a.effective_mass_x.partial_cmp(&b.effective_mass_x).unwrap()).unwrap()
}

fn sum_meff_x_2d(r: &modal::ModalResult) -> f64 {
    r.modes.iter().map(|m| m.effective_mass_x).sum()
}

fn rsa_top_ux_2d(input: SolverInput, r: &modal::ModalResult) -> f64 {
    let modes = r.modes.iter().map(|m| SpectralModeInput {
        frequency: m.frequency, period: m.period, omega: m.omega,
        displacements: m.displacements.iter()
            .map(|d| SpectralModeDisp { node_id: d.node_id, ux: d.ux, uz: d.uz, ry: d.ry }).collect(),
        participation_x: m.participation_x, participation_y: m.participation_y,
        effective_mass_x: m.effective_mass_x, effective_mass_y: m.effective_mass_y,
    }).collect();
    let res = spectral::solve_spectral_2d(&SpectralInput {
        solver: input, modes, densities: dens(),
        spectrum: DesignSpectrum {
            name: "flat".into(),
            points: vec![SpectrumPoint { period: 0.0, sa: 1.0 }, SpectrumPoint { period: 10.0, sa: 1.0 }],
            in_g: Some(false),
        },
        direction: "X".into(), rule: Some("SRSS".into()), xi: Some(0.05),
        importance_factor: Some(1.0), reduction_factor: Some(1.0), total_mass: Some(r.total_mass),
    }).unwrap();
    res.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs()
}

#[test]
fn equal_dof_modal_matches_physical_tie_2d() {
    let rc = modal::solve_modal_2d(&three_columns_2d(true), &dens(), 7).unwrap();
    let rp = modal::solve_modal_2d(&three_columns_2d(false), &dens(), 9).unwrap();
    let (sc, sp) = (sway_2d(&rc), sway_2d(&rp));
    let uc = rsa_top_ux_2d(three_columns_2d(true), &rc);
    let up = rsa_top_ux_2d(three_columns_2d(false), &rp);

    assert_rel(sc.period, sp.period, 0.01, "sway period (sanity: same structure)");
    assert!(rc.cumulative_mass_ratio_x <= 1.0 + 1e-6, "Σ mass ratio_x = {} > 1", rc.cumulative_mass_ratio_x);
    assert!(sum_meff_x_2d(&rc) <= rc.total_mass * (1.0 + 1e-6), "Σ Meff_x exceeds total mass");
    assert_rel(sc.participation_x.abs(), sp.participation_x.abs(), 0.01, "Γx sway");
    assert_rel(sc.effective_mass_x, sp.effective_mass_x, 0.01, "Meff_x sway");
    assert_rel(rc.cumulative_mass_ratio_x, rp.cumulative_mass_ratio_x, 0.01, "cumulative mass ratio x");
    assert_rel(uc, up, 0.01, "RSA top displacement");
}

/// One-storey, four columns; top nodes 5(0,0) 6(L,0) 7(0,L) 8(L,L). `constrained`: XY
/// diaphragm with master 5 (eccentric to the others); else a stiff massless braced truss
/// square (perimeter + both diagonals) at the top.
fn one_storey_3d(constrained: bool) -> SolverInput3D {
    let mut elems = vec![
        (1, "frame", 1, 5, 1, 1), (2, "frame", 2, 6, 1, 1),
        (3, "frame", 3, 7, 1, 1), (4, "frame", 4, 8, 1, 1),
    ];
    if !constrained {
        for (i, (a, b)) in [(5, 6), (6, 8), (8, 7), (7, 5), (5, 8), (6, 7)].iter().enumerate() {
            elems.push((10 + i, "truss", *a, *b, 2, 2));
        }
    }
    let mut input = make_3d_input(
        vec![
            (1, 0.0, 0.0, 0.0), (2, L, 0.0, 0.0), (3, 0.0, L, 0.0), (4, L, L, 0.0),
            (5, 0.0, 0.0, H), (6, L, 0.0, H), (7, 0.0, L, H), (8, L, L, H),
        ],
        vec![(1, E_COL, 0.2), (2, E_LINK, 0.2)],
        vec![(1, COL_A, COL_I, COL_I, 2.0 * COL_I), (2, 1.0, 1.0, 1.0, 1.0)],
        elems,
        vec![(1, vec![true; 6]), (2, vec![true; 6]), (3, vec![true; 6]), (4, vec![true; 6])],
        vec![],
    );
    if constrained {
        input.constraints = vec![Constraint::Diaphragm(DiaphragmConstraint {
            master_node: 5, slave_nodes: vec![6, 7, 8], plane: "XY".into(),
        })];
    }
    input
}

#[test]
fn diaphragm_modal_matches_physical_tie_3d() {
    // 4 top nodes × 6 = 24 free; diaphragm removes 3 × 3 = 9 → 15.
    let rc = modal::solve_modal_3d(&one_storey_3d(true), &dens(), 15).unwrap();
    let rp = modal::solve_modal_3d(&one_storey_3d(false), &dens(), 24).unwrap();
    let pick = |r: &modal::ModalResult3D| r.modes.iter()
        .max_by(|a, b| a.effective_mass_x.partial_cmp(&b.effective_mass_x).unwrap()).unwrap().clone();
    let (sc, sp) = (pick(&rc), pick(&rp));
    let sum = |r: &modal::ModalResult3D| r.modes.iter().map(|m| m.effective_mass_x).sum::<f64>();

    assert_rel(sc.period, sp.period, 0.01, "x-sway period (sanity: same structure)");
    // With every mode of each model, the cumulative ratios are what the two structures share:
    // the x, y and torsion modes are degenerate, so single modes mix differently in the two.
    for (c, p, axis) in [
        (rc.cumulative_mass_ratio_x, rp.cumulative_mass_ratio_x, "x"),
        (rc.cumulative_mass_ratio_y, rp.cumulative_mass_ratio_y, "y"),
    ] {
        assert!(c <= 1.0 + 1e-6, "Σ mass ratio_{axis} = {c} > 1");
        assert_rel(c, p, 0.01, &format!("cumulative mass ratio {axis}"));
    }
    assert!(sum(&rc) <= rc.total_mass * (1.0 + 1e-6), "Σ Meff_x exceeds total mass");
}
