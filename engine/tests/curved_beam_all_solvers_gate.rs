//! Gate: curved beams must be expanded in EVERY 3D solver path, not just
//! `solve_3d`/`prepare_static_3d`. Each test builds the same semicircular arch
//! as one curved beam and verifies the solver produces finite, sensible results.

#[path = "common/mod.rs"]
mod common;

use common::make_3d_input;
use dedaliano_engine::solver::{contact, corotational, kinematic, linear, pdelta, ssi, time_integration, winkler};
use dedaliano_engine::types::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 1e-4;
const J: f64 = 2e-4;

fn fixed() -> Vec<bool> {
    vec![true, true, true, true, true, true]
}

/// Semicircular arch, fixed at both springing nodes, downward load at the
/// crown — modeled as ONE curved beam.
fn arch() -> SolverInput3D {
    let mut input = make_3d_input(
        vec![
            (1, 0.0, 0.0, 0.0),
            (2, 5.0, 0.0, 5.0),
            (3, 10.0, 0.0, 0.0),
        ],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![(1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1)],
        vec![(1, fixed()), (3, fixed())],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 0.0, fz: -10.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    // Replace the two straight chords with the single curved beam definition.
    input.elements.clear();
    input.curved_beams = vec![CurvedBeamInput {
        node_start: 1, node_mid: 2, node_end: 3,
        material_id: 1, section_id: 1,
        num_segments: 10, hinge_start: false, hinge_end: false,
    }];
    input
}

fn assert_arch_solved(res: &AnalysisResults3D, solver_name: &str) {
    let crown = res.displacements.iter().find(|d| d.node_id == 2)
        .unwrap_or_else(|| panic!("{solver_name}: crown displacement missing"));
    assert!(crown.uz < 0.0, "{solver_name}: crown must deflect downward, got {}", crown.uz);
    assert!(crown.uz.is_finite(), "{solver_name}: crown displacement must be finite");
}

fn assert_arch_solved_with_reactions(res: &AnalysisResults3D, solver_name: &str) {
    assert_arch_solved(res, solver_name);
    let sum_fz: f64 = res.reactions.iter().map(|r| r.fz).sum();
    assert!((sum_fz - 10.0).abs() < 1e-3, "{solver_name}: sumFz={sum_fz}");
}

#[test]
fn curved_beam_linear() {
    let res = linear::solve_3d(&arch()).expect("linear solve failed");
    assert_arch_solved_with_reactions(&res, "linear");
}

#[test]
fn curved_beam_pdelta() {
    let res = pdelta::solve_pdelta_3d(&arch(), 10, 1e-6).expect("pdelta solve failed");
    assert_arch_solved_with_reactions(&res.results, "pdelta");
}

#[test]
fn curved_beam_kinematic() {
    let res = kinematic::analyze_kinematics_3d(&arch());
    assert!(res.is_solvable, "kinematic: arch must be solvable");
}

#[test]
fn curved_beam_corotational() {
    let res = corotational::solve_corotational_3d(&arch(), 10, 1e-6, 1, false)
        .expect("corotational solve failed");
    assert_arch_solved_with_reactions(&res.results, "corotational");
}

#[test]
fn curved_beam_ssi() {
    let input = ssi::SSIInput3D {
        solver: arch(),
        soil_springs: vec![],
        max_iter: 10,
        tolerance: 1e-6,
    };
    let res = ssi::solve_ssi_3d(&input).expect("ssi solve failed");
    // SSI does not compute reactions (returns empty), so check displacements only.
    assert_arch_solved(&res.results, "ssi");
}

#[test]
fn curved_beam_winkler() {
    let input = winkler::WinklerInput3D {
        solver: arch(),
        foundation_springs: vec![],
    };
    let res = winkler::solve_winkler_3d(&input).expect("winkler solve failed");
    assert_arch_solved_with_reactions(&res, "winkler");
}

#[test]
fn curved_beam_contact() {
    let input = contact::ContactInput3D {
        solver: arch(),
        element_behaviors: HashMap::new(),
        gap_elements: vec![],
        uplift_supports: vec![],
        max_iter: Some(10),
        tolerance: Some(1e-6),
        max_flips: Some(4),
        augmented_lagrangian: Some(0.0),
        al_max_iter: Some(5),
        damping_coefficient: Some(0.0),
    };
    let res = contact::solve_contact_3d(&input).expect("contact solve failed");
    // Contact does not compute reactions (returns empty), so check displacements only.
    assert_arch_solved(&res.results, "contact");
}

#[test]
fn curved_beam_time_integration() {
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);
    let input = TimeHistoryInput3D {
        solver: arch(),
        densities,
        time_step: 0.01,
        n_steps: 2,
        method: "newmark".to_string(),
        beta: 0.25,
        gamma: 0.5,
        alpha: None,
        damping_xi: None,
        ground_accel_x: None,
        ground_accel_y: None,
        ground_accel_z: None,
        force_history: None,
    };
    let res = time_integration::solve_time_history_3d(&input)
        .expect("time integration solve failed");
    // Verify the peak state has sensible displacements
    let crown = res.peak_displacements.iter().find(|d| d.node_id == 2)
        .expect("time integration: crown displacement missing");
    assert!(crown.uz.is_finite(), "time integration: crown displacement must be finite");
}
