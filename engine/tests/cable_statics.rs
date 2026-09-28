//! Cables against statics.
//!
//! Every structure here is statically determinate in its cables, so their tensions follow from
//! equilibrium alone, whatever modulus the sag gives them. What a cable solver must do is carry
//! that modulus through: the displacements it solved, the tension it reports, the member force and
//! the reactions all come from one stiffness. Until 13/18 the tension was EA·strain on
//! displacements solved with Ernst's E_eq·A, and the reactions used the full E: 2 % off on a steel
//! tripod, and a slack cable kept its stiffness in the reactions.

mod common;

use common::make_input;
use dedaliano_engine::solver::cable;
use dedaliano_engine::types::*;
use std::collections::HashMap;

const RHO: f64 = 7850.0;

fn steel() -> HashMap<String, f64> {
    HashMap::from([("1".to_string(), RHO)])
}

/// Second-order geometry: the tension comes from the strain of the deformed chord, the stiffness
/// and the statics from the undeformed one. They differ by the chord's rotation squared over its
/// strain, about 1e-4 in these models; a soft enough cable makes it percent.
const GEOMETRY: f64 = 5e-4;

#[test]
fn a_heavy_v_cable_carries_the_statics_tension() {
    // Span 20 m, 10 m down to the load point, 100 kN: H = P·L/(4·f) = 50 kN.
    let (span, f, p, a) = (20.0, 10.0, 100.0, 0.002);
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, span / 2.0, -f), (3, span, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, a, 1e-6)],
        vec![(1, "cable", 1, 2, 1, 1, false, false), (2, "cable", 2, 3, 1, 1, false, false)],
        vec![(1, 1, "fixed"), (2, 3, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -p, my: 0.0 })],
    );
    let r = cable::solve_cable_2d(&input, &steel(), 100, 1e-10).unwrap();
    assert!(r.converged);
    let h = p * span / (4.0 * f);
    let t = (h * h + (p / 2.0).powi(2)).sqrt();
    for c in &r.cable_forces {
        // 10 m across per side at 71 kN: (w·l)²·EA/(12·T³) ≈ 0.23, so E_eq is 0.82 E, and a
        // tension taken with the full E would be 22 % high.
        let x = (a * RHO / 1000.0 * 9.80665 * 10.0f64).powi(2) * 200e6 * a / (12.0 * c.tension.powi(3));
        assert!(x > 0.2, "the sag must matter: {x}");
        assert!((c.ernst_modulus - 200e6 / (1.0 + x)).abs() < 1e-6 * 200e6, "E_eq {} kN/m²", c.ernst_modulus);
        assert!((c.tension - t).abs() < GEOMETRY * t, "cable {}: T = {}, statics {t}", c.element_id, c.tension);
    }
    for ef in &r.results.element_forces {
        let c = r.cable_forces.iter().find(|c| c.element_id == ef.element_id).unwrap();
        assert_eq!(ef.n_start, c.tension);
    }
    // The supports take the load and the thrust.
    let r1 = r.results.reactions.iter().find(|x| x.node_id == 1).unwrap();
    let r3 = r.results.reactions.iter().find(|x| x.node_id == 3).unwrap();
    assert!((r1.rz + r3.rz - p).abs() < 1e-9 * p, "vertical {} + {}", r1.rz, r3.rz);
    assert!((r1.rx.abs() - h).abs() < GEOMETRY * h && (r1.rx + r3.rx).abs() < 1e-9 * h, "thrust {} and {}", r1.rx, r3.rx);
}

fn pin(node_id: usize) -> SolverSupport3D {
    SolverSupport3D {
        node_id, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
    }
}

/// Three cables from supports 6 m around and 8 m above a node loaded with 120 kN: 50 kN each.
/// With `tie_down`, a fourth cable from the node to the ground, which the load would compress.
fn tripod(tie_down: bool) -> SolverInput3D {
    let mut nodes = HashMap::new();
    for k in 0..3 {
        let a = 2.0 * std::f64::consts::PI * k as f64 / 3.0;
        nodes.insert((k + 1).to_string(), SolverNode3D { id: k + 1, x: 6.0 * a.cos(), y: 6.0 * a.sin(), z: 10.0 });
    }
    nodes.insert("4".into(), SolverNode3D { id: 4, x: 0.0, y: 0.0, z: 2.0 });
    nodes.insert("5".into(), SolverNode3D { id: 5, x: 0.0, y: 0.0, z: 0.0 });
    let cable = |id: usize, node_i: usize, node_j: usize| SolverElement3D {
        id, elem_type: "cable".into(), node_i, node_j, material_id: 1, section_id: 1,
        release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
        release_t_start: false, release_t_end: false,
        local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
    };
    let mut elements = HashMap::new();
    for k in 1..=3 { elements.insert(k.to_string(), cable(k, k, 4)); }
    if tie_down { elements.insert("4".into(), cable(4, 5, 4)); }
    let supports = [1, 2, 3, 5].into_iter().map(|n| (n.to_string(), pin(n))).collect();
    SolverInput3D {
        nodes,
        materials: HashMap::from([("1".into(), SolverMaterial { id: 1, e: 160_000.0, nu: 0.3 })]),
        sections: HashMap::from([("1".into(), SolverSection3D { id: 1, name: None, a: 1e-3, iy: 1e-10, iz: 1e-10, j: 1e-10, cw: None, as_y: None, as_z: None })]),
        elements, supports,
        loads: vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 4, fx: 0.0, fy: 0.0, fz: -120.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(), curved_beams: vec![], connectors: HashMap::new(),
    }
}

#[test]
fn a_tripod_hangs_at_the_statics_tension_with_its_sag() {
    let r = cable::solve_cable_3d(&tripod(false), &steel(), 100, 1e-10).unwrap();
    assert!(r.converged);
    let w = RHO / 1000.0 * 1e-3 * 9.80665;
    for c in &r.cable_forces {
        assert!((c.tension - 50.0).abs() < GEOMETRY * 50.0, "cable {}: T = {}", c.element_id, c.tension);
        assert!((c.horizontal_thrust - 30.0).abs() < GEOMETRY * 30.0);
        assert!((c.sag - w * 36.0 / (8.0 * c.horizontal_thrust)).abs() < 1e-12);
        // Its own weight softens it: E_eq below E, in the units of E.
        assert!(c.ernst_modulus < 160e6 && c.ernst_modulus > 140e6, "E_eq {} kN/m²", c.ernst_modulus);
    }
    for s in r.results.reactions.iter().filter(|s| s.node_id <= 3) {
        // Each support pulls along its cable with the cable's tension.
        let t = (s.fx * s.fx + s.fy * s.fy + s.fz * s.fz).sqrt();
        assert!((t - 50.0).abs() < GEOMETRY * 50.0, "support {}: {t}", s.node_id);
    }
}

#[test]
fn a_cable_the_load_would_compress_goes_slack_everywhere() {
    let r = cable::solve_cable_3d(&tripod(true), &steel(), 100, 1e-10).unwrap();
    assert!(r.converged);
    let tie = r.cable_forces.iter().find(|c| c.element_id == 4).unwrap();
    assert_eq!(tie.tension, 0.0);
    assert_eq!(tie.ernst_modulus, 0.0);
    let ef = r.results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    assert_eq!((ef.n_start, ef.n_end), (0.0, 0.0));
    // The ground support takes nothing, and the three above take it all.
    let ground = r.results.reactions.iter().find(|s| s.node_id == 5).unwrap();
    assert!(ground.fx.abs() + ground.fy.abs() + ground.fz.abs() < 1e-9, "{ground:?}");
    for c in r.cable_forces.iter().filter(|c| c.element_id != 4) {
        assert!((c.tension - 50.0).abs() < GEOMETRY * 50.0, "cable {}: T = {}", c.element_id, c.tension);
    }
}
