// Member loads on truss bars reach their nodes by the lever rule.
//
// A truss carries nothing transverse, and until now distributed and point
// loads on one were dropped silently. The simply-supported reactions of the
// bar are statically exact, so a truss under a member load must answer what
// the same bar answers as a frame with both ends hinged — the pinned-pinned
// beam's textbook reactions.
use crate::common::*;
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;

const E: f64 = 200000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

fn bar(elem_type: &str, hinges: (bool, bool), loads: Vec<SolverLoad>) -> SolverInput {
    make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, elem_type, 1, 2, 1, 1, hinges.0, hinges.1)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        loads,
    )
}

fn verticals(r: &dedaliano_engine::types::AnalysisResults) -> (f64, f64) {
    let ri = r.reactions.iter().find(|x| x.node_id == 1).unwrap().rz;
    let rj = r.reactions.iter().find(|x| x.node_id == 2).unwrap().rz;
    (ri, rj)
}

#[test]
fn uniform_distributed_on_a_truss_matches_the_hinged_beam() {
    let q = -10.0;
    let load = SolverLoad::Distributed(SolverDistributedLoad { element_id: 1, q_i: q, q_j: q, a: None, b: None });
    let (ti, tj) = verticals(&linear::solve_2d(&bar("truss", (false, false), vec![load.clone()])).unwrap());
    let (fi, fj) = verticals(&linear::solve_2d(&bar("frame", (true, true), vec![load])).unwrap());
    assert!((ti - fi).abs() < 1e-9 && (tj - fj).abs() < 1e-9,
        "truss ({ti},{tj}) vs hinged frame ({fi},{fj})");
    assert!((ti - 20.0).abs() < 1e-9 && (tj - 20.0).abs() < 1e-9, "qL/2 each: {ti}, {tj}");
}

#[test]
fn trapezoid_on_a_truss_follows_the_lever_rule() {
    // q from 0 at I to −12 at J over the full bar: W = 24 at x̄ = 8/3 from I.
    let load = SolverLoad::Distributed(SolverDistributedLoad { element_id: 1, q_i: 0.0, q_j: -12.0, a: None, b: None });
    let (ti, tj) = verticals(&linear::solve_2d(&bar("truss", (false, false), vec![load.clone()])).unwrap());
    let (fi, fj) = verticals(&linear::solve_2d(&bar("frame", (true, true), vec![load])).unwrap());
    assert!((ti - fi).abs() < 1e-9 && (tj - fj).abs() < 1e-9);
    assert!((ti - 8.0).abs() < 1e-9 && (tj - 16.0).abs() < 1e-9, "W(L−x̄)/L, W·x̄/L: {ti}, {tj}");
}

#[test]
fn an_antisymmetric_load_is_a_pure_couple_on_a_truss() {
    // q = −10 at I growing to +10 at J: W = 0, and the transfer must not divide by it.
    let load = SolverLoad::Distributed(SolverDistributedLoad { element_id: 1, q_i: -10.0, q_j: 10.0, a: None, b: None });
    let r = linear::solve_2d(&bar("truss", (false, false), vec![load.clone()])).unwrap();
    let (fi, fj) = verticals(&linear::solve_2d(&bar("frame", (true, true), vec![load])).unwrap());
    let (ti, tj) = verticals(&r);
    assert!((ti - fi).abs() < 1e-9 && (tj - fj).abs() < 1e-9);
    assert!((ti + tj).abs() < 1e-9, "no net force from an antisymmetric load");
}

#[test]
fn a_point_load_and_a_moment_on_a_truss_reach_the_nodes() {
    let loads = vec![
        SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id: 1, p: -10.0, a: 1.0, px: None, my: None }),
        SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id: 1, p: 0.0, a: 2.0, px: Some(6.0), my: Some(4.0) }),
    ];
    let r = linear::solve_2d(&bar("truss", (false, false), loads.clone())).unwrap();
    let rf = linear::solve_2d(&bar("frame", (true, true), loads)).unwrap();
    let (ti, tj) = verticals(&r);
    let (fi, fj) = verticals(&rf);
    assert!((ti - fi).abs() < 1e-9 && (tj - fj).abs() < 1e-9);
    // Transverse: −10 at a=1 → −7.5 / −2.5; the 4 kN·m couple adds ∓1: −8.5 and −1.5.
    assert!((ti - 8.5).abs() < 1e-9 && (tj - 1.5).abs() < 1e-9, "{ti}, {tj}");
    // Axial: the roller restrains no x, so the whole 6 kN balances at the pin —
    // and it is exactly what the hinged frame reports.
    let rxi = r.reactions.iter().find(|x| x.node_id == 1).unwrap().rx;
    let rxf = rf.reactions.iter().find(|x| x.node_id == 1).unwrap().rx;
    assert!((rxi - rxf).abs() < 1e-9 && (rxi + 6.0).abs() < 1e-9, "axial lever: {rxi} vs frame {rxf}");
}

// ─── 3D ─────────────────────────────────────────────────────────────

fn bar_3d(loads: Vec<SolverLoad3D>) -> SolverInput3D {
    use std::collections::HashMap;
    let nodes = HashMap::from([
        ("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 }),
        ("2".to_string(), SolverNode3D { id: 2, x: 0.0, y: 0.0, z: 4.0 }),
    ]);
    let materials = HashMap::from([("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 })]);
    let sections = HashMap::from([("1".to_string(), SolverSection3D { id: 1, name: None, a: A, iy: IZ, iz: IZ, j: 1e-5, cw: None, as_y: None, as_z: None })]);
    let elements = HashMap::from([("1".to_string(), SolverElement3D {
        id: 1, elem_type: "truss".to_string(), node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        release_t_start: false, release_t_end: false,
        release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
    })]);
    let fixed = SolverSupport3D {
        node_id: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        rw: None, kw: None, normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
    };
    let roller = SolverSupport3D {
        node_id: 2, rx: true, ry: true, rz: false, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        rw: None, kw: None, normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
    };
    let supports = HashMap::from([("1".to_string(), fixed), ("2".to_string(), roller)]);
    SolverInput3D {
        nodes, materials, sections, elements, supports, loads,
        plates: HashMap::new(), quads: HashMap::new(), constraints: vec![], connectors: HashMap::new(),
        curved_shells: HashMap::new(), left_hand: None,
        quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_beams: vec![], solver_options: None,
    }
}

#[test]
fn a_transverse_distributed_load_on_a_3d_truss_reaches_the_nodes() {
    // Bar along global z; qYI = −12 uniform: local y is what the frame computes,
    // the reactions split qL/2 each in that direction and nowhere else.
    let load = SolverLoad3D::Distributed(SolverDistributedLoad3D {
        element_id: 1, q_xi: 0.0, q_xj: 0.0, q_yi: -12.0, q_yj: -12.0, q_zi: 0.0, q_zj: 0.0, a: None, b: None,
    });
    let r = linear::solve_3d(&bar_3d(vec![load])).unwrap();
    let ri = r.reactions.iter().find(|x| x.node_id == 1).unwrap();
    let rj = r.reactions.iter().find(|x| x.node_id == 2).unwrap();
    let mag_i = (ri.fx * ri.fx + ri.fy * ri.fy + ri.fz * ri.fz).sqrt();
    let mag_j = (rj.fx * rj.fx + rj.fy * rj.fy + rj.fz * rj.fz).sqrt();
    assert!((mag_i - 24.0).abs() < 1e-9, "|R_I| = qL/2 = 24: {mag_i} ({ri:?})");
    assert!((mag_j - 24.0).abs() < 1e-9, "|R_J| = qL/2 = 24: {mag_j}");
    // Both reactions point the same way, opposite the load, along one transverse axis.
    assert!((ri.fx * rj.fx + ri.fy * rj.fy + ri.fz * rj.fz) > 0.0);
}

#[test]
fn a_point_load_on_a_3d_truss_reaches_the_nodes() {
    let load = SolverLoad3D::PointOnElement(SolverPointLoad3D { element_id: 1, a: 1.0, py: -8.0, pz: 0.0 });
    let r = linear::solve_3d(&bar_3d(vec![load])).unwrap();
    let ri = r.reactions.iter().find(|x| x.node_id == 1).unwrap();
    let rj = r.reactions.iter().find(|x| x.node_id == 2).unwrap();
    let mag_i = (ri.fx * ri.fx + ri.fy * ri.fy + ri.fz * ri.fz).sqrt();
    let mag_j = (rj.fx * rj.fx + rj.fy * rj.fy + rj.fz * rj.fz).sqrt();
    assert!((mag_i - 6.0).abs() < 1e-9, "P(1−a/L) = 6: {mag_i}");
    assert!((mag_j - 2.0).abs() < 1e-9, "P·a/L = 2: {mag_j}");
}
