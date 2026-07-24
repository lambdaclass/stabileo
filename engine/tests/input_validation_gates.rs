//! Gates: every solver entry point must reject degenerate input with a clean
//! Err instead of panicking or silently computing garbage.

#[path = "common/mod.rs"]
mod common;

use common::make_3d_input;
use dedaliano_engine::solver::{harmonic, linear, modal, spectral, staged, time_integration};
use dedaliano_engine::types::*;
use std::collections::HashMap;

/// Minimal valid 2D beam: nodes 1-2, one frame element, fixed at node 1.
fn tiny_beam_2d() -> SolverInput {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: 4.0, z: 0.0 });
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });
    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "frame".to_string(), node_i: 1, node_j: 2,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });
    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });
    SolverInput {
        nodes, materials, sections, elements, supports,
        loads: vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -10.0, my: 0.0 })],
        constraints: vec![],
        connectors: HashMap::new(),
    }
}

fn densities_1() -> HashMap<String, f64> {
    HashMap::from([("1".to_string(), 7850.0)])
}

fn th_input(solver: SolverInput) -> TimeHistoryInput {
    TimeHistoryInput {
        solver,
        densities: densities_1(),
        time_step: 0.01,
        n_steps: 10,
        method: "newmark".to_string(),
        beta: 0.25,
        gamma: 0.5,
        alpha: None,
        damping_xi: Some(0.05),
        ground_accel: Some(vec![1.0; 10]),
        ground_direction: Some("x".to_string()),
        force_history: None,
    }
}

/// Assert the closure returns Err — not Ok, and above all not a panic.
fn expect_clean_err<T, F>(what: &str, f: F)
where
    F: FnOnce() -> Result<T, String> + std::panic::UnwindSafe,
{
    match std::panic::catch_unwind(f) {
        Ok(Err(_)) => {}
        Ok(Ok(_)) => panic!("{what}: expected Err, got Ok"),
        Err(p) => panic!("{what}: PANICKED instead of returning Err: {p:?}"),
    }
}

// ---------- modal ----------

#[test]
fn modal_2d_rejects_zero_length_element() {
    let mut input = tiny_beam_2d();
    input.nodes.get_mut("2").unwrap().x = 0.0; // coincides with node 1
    expect_clean_err("modal 2D zero-length", || modal::solve_modal_2d(&input, &densities_1(), 3));
}

#[test]
fn modal_2d_rejects_bad_node_ref() {
    let mut input = tiny_beam_2d();
    input.elements.get_mut("1").unwrap().node_j = 99;
    expect_clean_err("modal 2D bad node ref", || modal::solve_modal_2d(&input, &densities_1(), 3));
}

#[test]
fn modal_2d_rejects_nonpositive_e() {
    let mut input = tiny_beam_2d();
    input.materials.get_mut("1").unwrap().e = -1.0;
    expect_clean_err("modal 2D E<=0", || modal::solve_modal_2d(&input, &densities_1(), 3));
}

#[test]
fn modal_2d_rejects_all_zero_densities() {
    let input = tiny_beam_2d();
    let densities = HashMap::from([("1".to_string(), 0.0)]);
    expect_clean_err("modal 2D zero mass", || modal::solve_modal_2d(&input, &densities, 3));
}

#[test]
fn modal_3d_rejects_bad_node_ref() {
    let mut input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 4.0, 0.0, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4, 1e-4, 2e-4)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true, true, true, true, true, true])],
        vec![],
    );
    input.elements.get_mut("1").unwrap().node_j = 99;
    expect_clean_err("modal 3D bad node ref", || modal::solve_modal_3d(&input, &densities_1(), 3));
}

// ---------- spectral ----------

#[test]
fn spectral_2d_rejects_degenerate_input() {
    let mut solver = tiny_beam_2d();
    solver.nodes.get_mut("2").unwrap().x = 0.0; // zero-length element
    let input = SpectralInput {
        solver,
        modes: vec![],
        densities: densities_1(),
        spectrum: DesignSpectrum {
            name: "test".to_string(),
            points: vec![SpectrumPoint { period: 0.0, sa: 2.5 }, SpectrumPoint { period: 3.0, sa: 0.5 }],
            in_g: Some(true),
        },
        direction: "X".to_string(),
        rule: None, xi: None, importance_factor: None, reduction_factor: None, total_mass: None,
    };
    expect_clean_err("spectral 2D degenerate", || spectral::solve_spectral_2d(&input));
}

// ---------- harmonic ----------

#[test]
fn harmonic_2d_rejects_zero_length_element() {
    let mut solver = tiny_beam_2d();
    solver.nodes.get_mut("2").unwrap().x = 0.0;
    let input = harmonic::HarmonicInput {
        solver,
        densities: densities_1(),
        frequencies: vec![1.0, 2.0],
        damping_ratio: 0.05,
        response_node_id: 2,
        response_dof: "x".to_string(),
    };
    expect_clean_err("harmonic 2D zero-length", || harmonic::solve_harmonic_2d(&input));
}

#[test]
fn harmonic_2d_rejects_nonfinite_frequency() {
    let input = harmonic::HarmonicInput {
        solver: tiny_beam_2d(),
        densities: densities_1(),
        frequencies: vec![1.0, f64::NAN],
        damping_ratio: 0.05,
        response_node_id: 2,
        response_dof: "x".to_string(),
    };
    expect_clean_err("harmonic 2D NaN frequency", || harmonic::solve_harmonic_2d(&input));
}

// ---------- time history ----------

#[test]
fn time_history_2d_rejects_bad_node_ref() {
    let mut solver = tiny_beam_2d();
    solver.elements.get_mut("1").unwrap().node_j = 99;
    expect_clean_err("TH 2D bad node ref", || time_integration::solve_time_history_2d(&th_input(solver)));
}

#[test]
fn time_history_2d_rejects_nonpositive_time_step() {
    let mut input = th_input(tiny_beam_2d());
    input.time_step = 0.0;
    expect_clean_err("TH 2D dt=0", || time_integration::solve_time_history_2d(&input));
}

#[test]
fn time_history_2d_rejects_nan_force_history() {
    let mut input = th_input(tiny_beam_2d());
    input.ground_accel = None;
    input.force_history = Some(vec![TimeForceRecord {
        time: 0.0,
        loads: vec![SolverNodalLoad { node_id: 2, fx: 0.0, fz: f64::NAN, my: 0.0 }],
    }]);
    expect_clean_err("TH 2D NaN force history", || time_integration::solve_time_history_2d(&input));
}

// ---------- staged ----------

#[test]
fn staged_2d_rejects_zero_length_element() {
    let mut m = tiny_beam_2d();
    m.nodes.get_mut("2").unwrap().x = 0.0;
    let input = StagedInput {
        nodes: m.nodes, materials: m.materials, sections: m.sections,
        elements: m.elements, supports: m.supports, loads: m.loads,
        stages: vec![ConstructionStage {
            name: "s1".to_string(),
            elements_added: vec![1],
            elements_removed: vec![],
            load_indices: vec![0],
            supports_added: vec![],
            supports_removed: vec![],
            prestress_loads: vec![],
        }],
        constraints: vec![],
    };
    expect_clean_err("staged 2D zero-length", || staged::solve_staged_2d(&input));
}

// ---------- NaN/Inf rejection on the linear path (Task A3) ----------

#[test]
fn linear_2d_rejects_nan_coordinate() {
    let mut input = tiny_beam_2d();
    input.nodes.get_mut("2").unwrap().x = f64::NAN;
    expect_clean_err("linear 2D NaN coord", || linear::solve_2d(&input));
}

#[test]
fn linear_2d_rejects_nan_load() {
    let mut input = tiny_beam_2d();
    input.loads = vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: f64::NAN, my: 0.0 })];
    expect_clean_err("linear 2D NaN load", || linear::solve_2d(&input));
}

#[test]
fn linear_2d_rejects_nan_material() {
    let mut input = tiny_beam_2d();
    input.materials.get_mut("1").unwrap().e = f64::NAN; // note: `e <= 0.0` is false for NaN
    expect_clean_err("linear 2D NaN E", || linear::solve_2d(&input));
}

#[test]
fn linear_3d_rejects_nan_section() {
    let mut input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 4.0, 0.0, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4, 1e-4, 2e-4)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true, true, true, true, true, true])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: 0.0, fy: 0.0, fz: -10.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    );
    input.sections.get_mut("1").unwrap().iy = f64::INFINITY;
    expect_clean_err("linear 3D Inf Iy", || linear::solve_3d(&input));
}
