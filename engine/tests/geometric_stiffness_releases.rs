//! The geometric stiffness of a member with released ends.
//!
//! A cantilever column braces a leaning column: pinned at both ends by member releases, its
//! rotations held by supports that restrain only rotation, so nothing but the member's own Kg
//! acts on them. A leaning column adds no stiffness and takes away its string stiffness P/h:
//!   B2 = 1 / (1 − P/(k·h)) and P_cr = k·h, with k = 3EI/h³ the cantilever's sway stiffness.
//! Kg used to be the fixed-fixed one whatever the releases: 1.2·P/h in sway, and −4·P·h/30 on each
//! released rotation, which on a building with pinned braces made K + Kg indefinite at a tenth of
//! its load.

use dedaliano_engine::solver::{buckling, pdelta};
use dedaliano_engine::types::*;
use std::collections::HashMap;

const H: f64 = 4.0;
const E: f64 = 200_000.0; // MPa
const I: f64 = 1e-4;

fn k_sway() -> f64 { 3.0 * E * 1000.0 * I / H.powi(3) }

fn support(node_id: usize, translations: bool, uy: bool) -> SolverSupport3D {
    SolverSupport3D {
        node_id, rx: translations, ry: translations || uy, rz: translations, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
    }
}

fn frame(id: usize, node_i: usize, node_j: usize, section_id: usize, pin_i: bool, pin_j: bool) -> SolverElement3D {
    SolverElement3D {
        id, elem_type: "frame".into(), node_i, node_j, material_id: 1, section_id,
        release_my_start: pin_i, release_mz_start: pin_i, release_my_end: pin_j, release_mz_end: pin_j,
        release_t_start: false, release_t_end: false,
        local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
    }
}

fn frame_with_leaning_column(p: f64, lateral: f64) -> SolverInput3D {
    let nodes = [(1, 0.0, 0.0), (2, 0.0, H), (3, 6.0, 0.0), (4, 6.0, H)]
        .into_iter().map(|(id, x, z)| (id.to_string(), SolverNode3D { id, x, y: 0.0, z })).collect();
    let sections = HashMap::from([
        ("1".into(), SolverSection3D { id: 1, name: None, a: 0.01, iy: I, iz: I, j: 2.0 * I, cw: None, as_y: None, as_z: None }),
        ("2".into(), SolverSection3D { id: 2, name: None, a: 1.0, iy: I, iz: I, j: 2.0 * I, cw: None, as_y: None, as_z: None }),
    ]);
    let elements = HashMap::from([
        ("1".into(), frame(1, 1, 2, 1, false, false)), // the cantilever
        ("2".into(), frame(2, 3, 4, 1, true, true)),   // the leaning column
        ("3".into(), frame(3, 2, 4, 2, true, true)),   // the link, pinned at both ends: the cantilever head turns freely
    ]);
    let supports = HashMap::from([
        ("1".into(), support(1, true, false)),
        ("3".into(), support(3, true, false)),
        // Rotation only, and out of the plane: the leaning column's head moves in x and z.
        ("4".into(), support(4, false, true)),
    ]);
    let mut loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 4, fx: 0.0, fy: 0.0, fz: -p, mx: 0.0, my: 0.0, mz: 0.0, bw: None })];
    if lateral != 0.0 {
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: lateral, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None }));
    }
    SolverInput3D {
        solver_options: None,
        nodes, materials: HashMap::from([("1".into(), SolverMaterial { id: 1, e: E, nu: 0.3 })]), sections, elements,
        supports, loads, constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(), curved_beams: vec![], connectors: HashMap::new(),
    }
}

#[test]
fn a_leaning_column_amplifies_the_sway_by_its_string_stiffness() {
    let p = 0.4 * k_sway() * H;
    let r = pdelta::solve_pdelta_3d(&frame_with_leaning_column(p, 10.0), 50, 1e-10).unwrap();
    assert!(r.converged && r.is_stable);
    let ux = |res: &AnalysisResults3D| res.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let b2 = ux(&r.results) / ux(&r.linear_results);
    let expected = 1.0 / (1.0 - 0.4);
    assert!((b2 - expected).abs() < 1e-3 * expected, "B2 {b2}, expected {expected} (fixed-fixed Kg: {})", 1.0 / (1.0 - 0.48));
}

#[test]
fn a_leaning_column_buckles_the_frame_at_k_times_h() {
    let p = 1000.0;
    let r = buckling::solve_buckling_3d(&frame_with_leaning_column(p, 0.0), 1).unwrap();
    let lambda = r.modes[0].load_factor;
    let expected = k_sway() * H / p;
    assert!((lambda - expected).abs() < 1e-3 * expected, "λ {lambda}, expected {expected} (fixed-fixed Kg: {})", expected / 1.2);
}

/// A column fixed at its foot and pinned at its head by the release of its top element, in four
/// elements, the head's rotation held by a support that restrains rotation only. Euler's
/// fixed-pinned load is 20.19·EI/L²; the one-end condensation has to reach it as the node-pinned
/// column does.
fn fixed_pinned_column(released: bool) -> SolverInput3D {
    let n_el = 4;
    let l = 6.0;
    let nodes = (0..=n_el).map(|k| ((k + 1).to_string(), SolverNode3D { id: k + 1, x: 0.0, y: 0.0, z: l * k as f64 / n_el as f64 })).collect();
    let elements = (1..=n_el).map(|k| (k.to_string(), frame(k, k, k + 1, 1, false, released && k == n_el))).collect();
    let top = n_el + 1;
    let head = SolverSupport3D { rrx: released, rry: released, rrz: released, rz: false, ..support(top, true, true) };
    // Torsion needs a hold somewhere when the head is free to turn.
    let head = if released { head } else { SolverSupport3D { rrz: true, ..head } };
    SolverInput3D {
        solver_options: None,
        nodes, materials: HashMap::from([("1".into(), SolverMaterial { id: 1, e: E, nu: 0.3 })]),
        sections: HashMap::from([("1".into(), SolverSection3D { id: 1, name: None, a: 0.01, iy: I, iz: I, j: 2.0 * I, cw: None, as_y: None, as_z: None })]),
        elements,
        supports: HashMap::from([("1".into(), support(1, true, false)), ("2".into(), head)]),
        loads: vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: top, fx: 0.0, fy: 0.0, fz: -1000.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(), curved_beams: vec![], connectors: HashMap::new(),
    }
}

#[test]
fn a_member_released_at_one_end_buckles_as_the_pinned_column() {
    let euler = 20.19 * E * 1000.0 * I / 36.0 / 1000.0;
    let by_release = buckling::solve_buckling_3d(&fixed_pinned_column(true), 1).unwrap().modes[0].load_factor;
    let by_node = buckling::solve_buckling_3d(&fixed_pinned_column(false), 1).unwrap().modes[0].load_factor;
    assert!((by_node - euler).abs() < 5e-3 * euler, "node-pinned λ {by_node}, Euler {euler}");
    assert!((by_release - euler).abs() < 5e-3 * euler, "release-pinned λ {by_release}, Euler {euler}, node-pinned {by_node}");
}
