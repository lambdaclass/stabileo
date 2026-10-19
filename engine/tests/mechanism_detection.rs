//! Exact mechanism detection (engine/src/solver/mechanism.rs).
//!
//! Each mechanism the check exists for is refused by the linear solvers with
//! a message naming the nodes that move when the loads act on it (and solved
//! with a warning naming it when they do no work on it), and the same model
//! made stable is solved. Modal analysis refuses every mechanism. The kinematic conditions are checked against the assembled
//! stiffness: every free motion the check reports is a zero-energy mode of K
//! (K·v ≈ 0), on random models exercising every feature. No fixture is
//! flagged.

mod fuzz_models;

use dedaliano_engine::solver::assembly::{
    assemble_stiffness_2d, assemble_stiffness_3d, inclined_rotation_matrix, inclined_rotation_matrix_2d,
};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::solver::mechanism::{check_2d, check_3d, free_motion_vectors};
use dedaliano_engine::solver::modal::{solve_modal_2d, solve_modal_3d};
use dedaliano_engine::certify::{certify_linear_2d_full, certify_results_2d, certify_results_3d};
use std::collections::HashMap;
use dedaliano_engine::types::*;
use serde_json::{json, Value};

fn in2(v: Value) -> SolverInput {
    serde_json::from_value(v).unwrap()
}
fn in3(v: Value) -> SolverInput3D {
    serde_json::from_value(v).unwrap()
}

fn refused_2d(input: &SolverInput) -> String {
    match solve_2d(input) {
        Err(e) => e,
        Ok(_) => panic!("mechanism solved: {:?}", check_2d(input, &input.constraints)),
    }
}
fn refused_3d(input: &SolverInput3D) -> String {
    match solve_3d(input) {
        Err(e) => e,
        Ok(_) => panic!("mechanism solved: {:?}", check_3d(input, &input.constraints)),
    }
}
/// A mechanism the loads do no work on: solved with the warning naming it,
/// or — when the factorization cannot get past the free motion — refused
/// naming it. Never solved silently.
fn warned_3d(input: &SolverInput3D) -> String {
    match solve_3d(input) {
        Err(e) => {
            assert!(e.contains("Structure is a mechanism") && e.contains("could not factor"), "{e}");
            e
        }
        Ok(r) => {
            let d = r
                .structured_diagnostics
                .iter()
                .find(|d| d.code == DiagnosticCode::StiffnessNotPositiveDefinite && d.message.contains("Structure is a mechanism"))
                .unwrap_or_else(|| panic!("mechanism not flagged: {:?}", r.structured_diagnostics));
            assert!(d.message.contains("The loads do no work on it"), "{}", d.message);
            d.message.clone()
        }
    }
}
fn with_load_3d(mut input: SolverInput3D, node: usize, f: [f64; 6]) -> SolverInput3D {
    input.loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: node, fx: f[0], fy: f[1], fz: f[2], mx: f[3], my: f[4], mz: f[5], bw: None,
    })];
    input
}

fn assert_mechanism(msg: &str, nodes: &[usize], what: &str) {
    assert!(msg.contains("Structure is a mechanism"), "{msg}");
    for n in nodes {
        assert!(msg.contains(&n.to_string()), "node {n} not named: {msg}");
    }
    assert!(msg.contains(what), "expected '{what}' in: {msg}");
}

const MAT: &str = r#"{"1": {"id": 1, "e": 200000.0, "nu": 0.3}}"#;

fn mats() -> Value {
    serde_json::from_str(MAT).unwrap()
}
fn sec2() -> Value {
    json!({"1": {"id": 1, "a": 0.01, "iz": 1e-4}})
}
fn sec3() -> Value {
    json!({"1": {"id": 1, "a": 0.01, "iy": 2e-4, "iz": 1e-4, "j": 5e-5}})
}
fn frame2(id: usize, i: usize, j: usize, hs: bool, he: bool) -> Value {
    json!({"id": id, "type": "frame", "nodeI": i, "nodeJ": j, "materialId": 1, "sectionId": 1,
           "hingeStart": hs, "hingeEnd": he})
}
fn sup2(id: usize, node: usize, t: &str) -> Value {
    json!({"id": id, "nodeId": node, "type": t})
}
fn nodal2(node: usize, fx: f64, fz: f64, my: f64) -> Value {
    json!({"type": "nodal", "data": {"nodeId": node, "fx": fx, "fz": fz, "my": my}})
}
fn sup3(node: usize, f: [bool; 6]) -> Value {
    json!({"nodeId": node, "rx": f[0], "ry": f[1], "rz": f[2], "rrx": f[3], "rry": f[4], "rrz": f[5]})
}
fn nodal3(node: usize, f: [f64; 6]) -> Value {
    json!({"type": "nodal", "data": {"nodeId": node, "fx": f[0], "fy": f[1], "fz": f[2],
           "mx": f[3], "my": f[4], "mz": f[5]}})
}

// ---------------------------------------------------------------------------
// The mechanisms
// ---------------------------------------------------------------------------

/// A member hinged at the tip of a cantilever and free at its other end
/// swings about the hinge. Fixed at its far end instead, it is a propped
/// structure and solves.
#[test]
fn dangling_hinged_member_2d() {
    let model = |far: Option<&str>| {
        let mut sups = json!({"1": sup2(1, 1, "fixed")});
        if let Some(t) = far {
            sups["2"] = sup2(2, 3, t);
        }
        in2(json!({
            "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "z": 0.0},
                      "3": {"id": 3, "x": 5.0, "z": 1.0}},
            "materials": mats(), "sections": sec2(),
            "elements": {"1": frame2(1, 1, 2, false, false), "2": frame2(2, 2, 3, true, false)},
            "supports": sups, "loads": [nodal2(3, 0.0, -10.0, 0.0)]
        }))
    };
    let msg = refused_2d(&model(None));
    assert_mechanism(&msg, &[3], "node 3 can move freely");
    assert!(!msg.contains("node 1:"), "{msg}");
    solve_2d(&model(Some("rollerX"))).expect("propped member solves");
}

/// The same in 3D (the differential-testing case rich3d-184): a member
/// released about its local y at the tip of another, free at its far end.
#[test]
fn dangling_released_member_3d() {
    let model = |release: bool| {
        in3(json!({
            "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "y": 0.0, "z": 0.0},
                      "3": {"id": 3, "x": 4.0, "y": 1.0, "z": 2.0}},
            "materials": mats(), "sections": sec3(),
            "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
                         "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1,
                               "releaseMyStart": release}},
            "supports": {"1": sup3(1, [true; 6])},
            "loads": [nodal3(3, [0.0, 0.0, -10.0, 0.0, 0.0, 0.0])]
        }))
    };
    let msg = refused_3d(&model(true));
    assert_mechanism(&msg, &[3], "node 3 can move freely");
    solve_3d(&model(false)).expect("unreleased cantilever solves");
}

/// A portal whose beam is pinned to both columns, on pinned bases, sways
/// (the columns are links pinned at both ends). On fixed bases the columns
/// are cantilevers and it stands.
#[test]
fn portal_with_pinned_beam_column_joints_2d() {
    let model = |base: &str| {
        in2(json!({
            "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "z": 4.0},
                      "3": {"id": 3, "x": 6.0, "z": 4.0}, "4": {"id": 4, "x": 6.0, "z": 0.0}},
            "materials": mats(), "sections": sec2(),
            "elements": {"1": frame2(1, 1, 2, false, false), "2": frame2(2, 2, 3, true, true),
                         "3": frame2(3, 4, 3, false, false)},
            "supports": {"1": sup2(1, 1, base), "2": sup2(2, 4, base)},
            "loads": [nodal2(2, 5.0, -10.0, 0.0)]
        }))
    };
    let msg = refused_2d(&model("pinned"));
    assert_mechanism(&msg, &[2, 3], "move freely together");
    let c = check_2d(&model("pinned"), &[]);
    assert_eq!(c.free_motions, 1, "{c:?}");
    solve_2d(&model("fixed")).expect("portal on fixed bases solves");
}

/// A plate restrained out of plane along its edges with one corner pinned
/// turns freely in its own plane: a rigid-body rotation about the normal
/// through that corner. A second corner held in plane stops it.
#[test]
fn plate_free_to_turn_in_its_plane() {
    let mut nodes = serde_json::Map::new();
    let mut id = 0;
    for j in 0..3 {
        for i in 0..3 {
            id += 1;
            nodes.insert(id.to_string(), json!({"id": id, "x": i as f64, "y": j as f64, "z": 0.0}));
        }
    }
    let mut quads = serde_json::Map::new();
    let mut q = 0;
    for j in 0..2 {
        for i in 0..2 {
            q += 1;
            let n = |a: usize, b: usize| 1 + a + 3 * b;
            quads.insert(q.to_string(), json!({"id": q, "nodes": [n(i, j), n(i + 1, j), n(i + 1, j + 1), n(i, j + 1)],
                                               "materialId": 1, "thickness": 0.1}));
        }
    }
    let model = |held: bool| {
        let mut supports = serde_json::Map::new();
        for n in [1, 2, 3, 4, 6, 7, 8, 9] {
            supports.insert(n.to_string(), sup3(n, [n == 1, n == 1 || (held && n == 3), true, false, false, false]));
        }
        in3(json!({
            "nodes": nodes.clone(), "materials": mats(), "sections": {}, "elements": {},
            "supports": supports, "quads": quads.clone(),
            "loads": [nodal3(5, [0.0, 0.0, -10.0, 0.0, 0.0, 0.0])]
        }))
    };
    // loaded out of plane: the free rotation is flagged, the bending answered
    let msg = warned_3d(&model(false));
    assert_mechanism(&msg, &[1], "rigid-body motion of the part containing node 1");
    assert!(msg.contains("rotation about an axis along (0, 0, 1) through (0, 0, 0)"), "{msg}");
    // loaded in plane, off the pinned corner: no equilibrium, refused
    let msg = refused_3d(&with_load_3d(model(false), 5, [0.0, 10.0, -10.0, 0.0, 0.0, 0.0]));
    assert_mechanism(&msg, &[1], "The loads act on it");
    let r = solve_3d(&model(true)).expect("plate held in plane solves");
    assert!(!r.structured_diagnostics.iter().any(|d| d.message.contains("Structure is a mechanism")));
}

/// Four columns tied at the top by a rigid diaphragm. The slave columns
/// are pinned at the base (torsion held); the master column is fixed, so its
/// torsion holds the diaphragm's rotation — unless that torsion is released
/// at its base, and then the floor turns freely about the vertical.
#[test]
fn constrained_diaphragm_with_a_free_rotation() {
    let model = |release_torsion: bool| {
        let mut nodes = serde_json::Map::new();
        let mut elements = serde_json::Map::new();
        let mut supports = serde_json::Map::new();
        let pts = [(0.0, 0.0), (6.0, 0.0), (6.0, 4.0), (0.0, 4.0), (3.0, 2.0)];
        for (k, (x, y)) in pts.iter().enumerate() {
            let (b, t) = (k + 1, k + 11);
            nodes.insert(b.to_string(), json!({"id": b, "x": x, "y": y, "z": 0.0}));
            nodes.insert(t.to_string(), json!({"id": t, "x": x, "y": y, "z": 3.0}));
            let master = k == 4;
            elements.insert(b.to_string(), json!({"id": b, "type": "frame", "nodeI": b, "nodeJ": t,
                "materialId": 1, "sectionId": 1, "releaseTStart": master && release_torsion}));
            supports.insert(b.to_string(), sup3(b, [true, true, true, master, master, true]));
        }
        let mut m = in3(json!({
            "nodes": nodes, "materials": mats(), "sections": sec3(), "elements": elements,
            "supports": supports, "loads": [nodal3(11, [10.0, 5.0, 0.0, 0.0, 0.0, 0.0])]
        }));
        m.constraints = vec![Constraint::Diaphragm(DiaphragmConstraint {
            master_node: 15,
            slave_nodes: vec![11, 12, 13, 14],
            plane: "XY".into(),
        })];
        m
    };
    let msg = refused_3d(&model(true));
    // the floor turns about the master column; the pinned columns tilt with it
    assert_mechanism(&msg, &[11, 12, 13, 14, 15], "move freely together");
    assert!(msg.contains("node 11: ux 0.504, uy -0.755") || msg.contains("node 11: ux -0.504, uy 0.755"), "{msg}");
    solve_3d(&model(false)).expect("diaphragm held by the master column's torsion solves");
}

/// A node hung from a cantilever by a connector: with an axial spring only
/// it moves freely across the connector; with axial, shear and rotational
/// springs it is held.
#[test]
fn connector_only_connection() {
    let model = |full: bool| {
        let k = if full { 1e5 } else { 0.0 };
        in2(json!({
            "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "z": 0.0},
                      "3": {"id": 3, "x": 4.0, "z": 0.0}},
            "materials": mats(), "sections": sec2(),
            "elements": {"1": frame2(1, 1, 2, false, false)},
            "supports": {"1": sup2(1, 1, "fixed")},
            "connectors": {"1": {"id": 1, "nodeI": 2, "nodeJ": 3, "kAxial": 1e5, "kShear": k, "kMoment": k}},
            "loads": [nodal2(3, 1.0, -10.0, 0.0)]
        }))
    };
    let msg = refused_2d(&model(false));
    assert_mechanism(&msg, &[3], "node 3");
    solve_2d(&model(true)).expect("fully sprung connector solves");
}

/// A beam on two inclined rollers with the same slope slides along it. With
/// the slopes different it is still a mechanism (it turns about the point
/// where the normals meet); one pinned end holds it.
#[test]
fn inclined_rollers_with_a_free_motion_along_the_slope() {
    let model = |a1: f64, a2: Option<f64>| {
        let s2 = match a2 {
            Some(a) => json!({"id": 2, "nodeId": 2, "type": "inclinedRoller", "angle": a}),
            None => sup2(2, 2, "pinned"),
        };
        in2(json!({
            "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 5.0, "z": 0.0}},
            "materials": mats(), "sections": sec2(),
            "elements": {"1": frame2(1, 1, 2, false, false)},
            "supports": {"1": {"id": 1, "nodeId": 1, "type": "inclinedRoller", "angle": a1}, "2": s2},
            "loads": [nodal2(1, 0.0, -10.0, 0.0)]
        }))
    };
    let a = 30f64.to_radians();
    let msg = refused_2d(&model(a, Some(a)));
    assert_mechanism(&msg, &[1, 2], "translation along");
    // the restrained direction is (sin a, cos a): the free one is (cos a, −sin a)
    assert!(msg.contains("(0.866, -0.5)") || msg.contains("(-0.866, 0.5)"), "{msg}");
    let msg = refused_2d(&model(a, Some(-a)));
    assert_mechanism(&msg, &[1, 2], "rotation about the point");
    solve_2d(&model(a, None)).expect("pinned at one end solves");
}

/// 3D: a beam whose only support is an inclined one (normal (0, 1, 1)) with
/// every rotation held translates freely in the plane normal to it.
#[test]
fn inclined_support_3d_free_in_its_plane() {
    let model = |inclined: bool| {
        let mut s = sup3(1, [true; 6]);
        if inclined {
            s["isInclined"] = json!(true);
            s["normalX"] = json!(0.0);
            s["normalY"] = json!(1.0);
            s["normalZ"] = json!(1.0);
        }
        in3(json!({
            "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 4.0, "y": 0.0, "z": 0.0}},
            "materials": mats(), "sections": sec3(),
            "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
            "supports": {"1": s}, "loads": [nodal3(2, [0.0, 0.0, -10.0, 0.0, 0.0, 0.0])]
        }))
    };
    let msg = refused_3d(&model(true));
    assert_mechanism(&msg, &[1, 2], "2 independent free motions");
    solve_3d(&model(false)).expect("fixed cantilever solves");
}

/// A plane truss modelled in 3D with nothing holding it out of its plane:
/// its free nodes move normal to it. Held out of plane at every node it
/// solves.
#[test]
fn truss_nodes_free_out_of_plane() {
    let model = |held: bool| {
        let pts = [(0.0, 0.0), (4.0, 0.0), (8.0, 0.0), (2.0, 3.0), (6.0, 3.0)];
        let mut nodes = serde_json::Map::new();
        for (k, (x, z)) in pts.iter().enumerate() {
            nodes.insert((k + 1).to_string(), json!({"id": k + 1, "x": x, "y": 0.0, "z": z}));
        }
        let bars = [(1, 2), (2, 3), (1, 4), (2, 4), (2, 5), (3, 5), (4, 5)];
        let mut elements = serde_json::Map::new();
        for (k, (i, j)) in bars.iter().enumerate() {
            elements.insert((k + 1).to_string(), json!({"id": k + 1, "type": "truss", "nodeI": i, "nodeJ": j,
                                                       "materialId": 1, "sectionId": 1}));
        }
        let mut supports = serde_json::Map::new();
        supports.insert("1".into(), sup3(1, [true, true, true, false, false, false]));
        supports.insert("3".into(), sup3(3, [false, true, true, false, false, false]));
        if held {
            for n in [2, 4, 5] {
                supports.insert(n.to_string(), sup3(n, [false, true, false, false, false, false]));
            }
        }
        in3(json!({
            "nodes": nodes, "materials": mats(), "sections": sec3(), "elements": elements,
            "supports": supports, "loads": [nodal3(4, [0.0, 0.0, -10.0, 0.0, 0.0, 0.0])]
        }))
    };
    // loaded in its plane: flagged, solved
    let msg = warned_3d(&model(false));
    assert_mechanism(&msg, &[2, 4, 5], "3 independent free motions");
    // a load out of its plane: refused
    let msg = refused_3d(&with_load_3d(model(false), 4, [0.0, 0.1, -10.0, 0.0, 0.0, 0.0]));
    assert_mechanism(&msg, &[2, 4, 5], "uy 1");
    solve_3d(&with_load_3d(model(true), 4, [0.0, 0.1, -10.0, 0.0, 0.0, 0.0])).expect("truss held out of plane solves");
}

/// A joint where every member is hinged is held in translation by the
/// members and its rotation is free but harmless: the model solves. A moment
/// applied at that joint would not reach the structure: refused.
#[test]
fn all_hinged_joint_with_a_moment() {
    let model = |m: f64| {
        in2(json!({
            "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "z": 0.0},
                      "3": {"id": 3, "x": 6.0, "z": 0.0}},
            "materials": mats(), "sections": sec2(),
            "elements": {"1": frame2(1, 1, 2, false, true), "2": frame2(2, 2, 3, true, false)},
            "supports": {"1": sup2(1, 1, "fixed"), "2": sup2(2, 3, "fixed")},
            "loads": [nodal2(2, 0.0, -10.0, m)]
        }))
    };
    solve_2d(&model(0.0)).expect("hinged joint without a moment solves");
    // a small moment used to slip through (the artificial rotation stayed
    // under the 100 rad heuristic) and was lost
    let e = solve_2d(&model(1e-3)).unwrap_err();
    assert!(e.contains("Nodal moment at node 2") && e.contains("would not reach the structure"), "{e}");
}

/// 3D, about an axis that is not a global one: two inclined members meet at
/// a node, each released in bending there but not in torsion. Their torsion
/// resists moments in the plane of their axes; about the normal to that
/// plane nothing does. That free rotation moves no part of the structure, so
/// it is not a mechanism; a moment about it is refused. (The assembled K is
/// singular along it — the artificial stiffness the assembler puts on
/// rotations nothing holds is only on global axes — and the factorization
/// refuses the model: refused either way, never solved silently.)
#[test]
fn released_joint_moment_about_a_skew_axis() {
    let e = |id: usize, i: usize| {
        json!({"id": id, "type": "frame", "nodeI": i, "nodeJ": 3, "materialId": 1, "sectionId": 1,
               "releaseMyEnd": true, "releaseMzEnd": true})
    };
    let input = in3(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 4.0, "y": 0.0, "z": 0.0},
                  "3": {"id": 3, "x": 2.0, "y": 1.0, "z": 3.0}},
        "materials": mats(), "sections": sec3(),
        "elements": {"1": e(1, 1), "2": e(2, 2)},
        "supports": {"1": sup3(1, [true; 6]), "2": sup3(2, [true; 6])},
        "loads": []
    }));
    let c = check_3d(&input, &[]);
    assert!(!c.is_mechanism(), "{c:?}");
    assert_eq!(c.unheld_rotation_dims(), 1);
    let moment = |m: [f64; 3]| {
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: 0.0, fz: -10.0, mx: m[0], my: m[1], mz: m[2], bw: None,
        })]
    };
    c.refuse_unresisted_loads_3d(&moment([0.0; 3])).unwrap();
    // in the plane of the two axes (−2, −1, −3) and (2, −1, −3): torsion resists it
    c.refuse_unresisted_loads_3d(&moment([2.0, -1.0, -3.0])).unwrap();
    c.refuse_unresisted_loads_3d(&moment([0.0, 1.0, 3.0])).unwrap();
    // the normal (0, 3, −1) of that plane, alone or mixed in: nothing resists it
    let e = c.refuse_unresisted_loads_3d(&moment([0.0, 3.0, -1.0])).unwrap_err();
    assert!(e.contains("Nodal moment at node 3"), "{e}");
    assert!(c.refuse_unresisted_loads_3d(&moment([1.0, 0.0, 1.0])).is_err());
    assert!(solve_3d(&input).is_err(), "singular K solved");
}

/// A load on a node that nothing connects is refused (the node is otherwise
/// left alone: an unloaded stray node is the isolated-node gate's business).
#[test]
fn load_on_an_unconnected_node() {
    let model = |load: bool| {
        in2(json!({
            "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "z": 0.0},
                      "9": {"id": 9, "x": 9.0, "z": 9.0}},
            "materials": mats(), "sections": sec2(),
            "elements": {"1": frame2(1, 1, 2, false, false)},
            "supports": {"1": sup2(1, 1, "fixed"), "2": sup2(2, 9, "fixed")},
            "loads": [nodal2(if load { 9 } else { 2 }, 0.0, -10.0, 0.0)]
        }))
    };
    solve_2d(&model(false)).expect("unloaded stray node");
    let e = solve_2d(&model(true)).unwrap_err();
    assert!(e.contains("node 9") && e.contains("not connected"), "{e}");
}

/// A beam pinned at both ends in 3D spins about its own axis.
#[test]
fn beam_spinning_about_its_axis() {
    let model = |rrx: bool| {
        in3(json!({
            "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 6.0, "y": 0.0, "z": 0.0}},
            "materials": mats(), "sections": sec3(),
            "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
            "supports": {"1": sup3(1, [true, true, true, rrx, false, false]), "2": sup3(2, [false, true, true, false, false, false])},
            "loads": [nodal3(2, [0.0, 0.0, -10.0, 0.0, 0.0, 0.0])]
        }))
    };
    let msg = warned_3d(&model(false));
    assert_mechanism(&msg, &[1, 2], "can rotate freely about an axis along (1, 0, 0) without any node translating");
    // a torque: refused (by the load check, or by the factorization that
    // cannot get past the free spin — named either way)
    let msg = refused_3d(&with_load_3d(model(false), 2, [0.0, 0.0, -10.0, 1.0, 0.0, 0.0]));
    assert_mechanism(&msg, &[1, 2], "about an axis along (1, 0, 0)");
    solve_3d(&with_load_3d(model(true), 2, [0.0, 0.0, -10.0, 1.0, 0.0, 0.0])).expect("torsion held");
}

// ---------------------------------------------------------------------------
// The kinematic conditions against the assembled stiffness
// ---------------------------------------------------------------------------

/// ‖K·v‖∞ / (max|K| · ‖v‖∞), v in the frame K is assembled in.
fn energy_residual(k: &[f64], n: usize, mut u: Vec<f64>) -> f64 {
    let _ = &mut u;
    let kmax = k.iter().fold(0.0f64, |m, v| m.max(v.abs()));
    let umax = u.iter().fold(0.0f64, |m, v| m.max(v.abs()));
    assert!(umax > 0.0, "zero free motion");
    let mut r = 0.0f64;
    for i in 0..n {
        let s: f64 = (0..n).map(|j| k[i * n + j] * u[j]).sum();
        r = r.max(s.abs());
    }
    r / (kmax * umax)
}

fn residuals_2d(input: &SolverInput) -> Vec<f64> {
    let dn = DofNumbering::build_2d(input);
    let st = assemble_stiffness_2d(input, &dn);
    let n = dn.n_total;
    free_motion_vectors(Some(input), None, 3)
        .into_iter()
        .map(|v| {
            let mut u = vec![0.0; n];
            for (node, d, x) in v {
                if let Some(&i) = dn.map.get(&(node, d)) {
                    u[i] = x;
                }
            }
            for s in input.supports.values() {
                if let (true, Some(t)) = (s.support_type == "inclinedRoller", s.angle) {
                    let r = inclined_rotation_matrix_2d(t);
                    let (a, b) = (dn.map[&(s.node_id, 0)], dn.map[&(s.node_id, 1)]);
                    let (x, z) = (u[a], u[b]);
                    u[a] = r[0][0] * x + r[0][1] * z;
                    u[b] = r[1][0] * x + r[1][1] * z;
                }
            }
            energy_residual(&st.k, n, u)
        })
        .collect()
}

fn residuals_3d(input: &SolverInput3D) -> Vec<f64> {
    let dn = DofNumbering::build_3d(input);
    let st = assemble_stiffness_3d(input, &dn);
    let n = dn.n_total;
    free_motion_vectors(None, Some(input), 3)
        .into_iter()
        .map(|v| {
            let mut u = vec![0.0; n];
            for (node, d, x) in v {
                if let Some(&i) = dn.map.get(&(node, d)) {
                    u[i] = x;
                }
            }
            for s in input.supports.values() {
                if let (Some(true), Some(x), Some(y), Some(z)) = (s.is_inclined, s.normal_x, s.normal_y, s.normal_z) {
                    if (x * x + y * y + z * z).sqrt() <= 1e-12 {
                        continue;
                    }
                    let r = inclined_rotation_matrix(x, y, z);
                    let ix = [0, 1, 2].map(|k| dn.map[&(s.node_id, k)]);
                    let g = ix.map(|i| u[i]);
                    for a in 0..3 {
                        u[ix[a]] = (0..3).map(|b| r[a][b] * g[b]).sum();
                    }
                }
            }
            energy_residual(&st.k, n, u)
        })
        .collect()
}

/// Every free motion reported on a random model — trusses, hinges, releases
/// about any axis, springs (rotated too), connectors, inclined supports,
/// constraints, shells — has zero energy in the stiffness the solver
/// assembles (constraints are imposed on v, which K does not see; a zero-
/// energy v of the PSD K is a null vector of it). Sign conventions or axes
/// that disagreed with the elements would show here. Supports are dropped on
/// a third of the models so that every model has free motions to test.
#[test]
fn reported_free_motions_have_zero_energy() {
    let (mut tested, mut flagged) = (0, 0);
    for seed in 0..400u64 {
        let (mut m2, _) = fuzz_models::random_2d_model_rich(seed);
        if seed % 2 == 0 {
            fuzz_models::add_random_constraints_2d(&mut m2, seed);
        }
        if seed % 3 == 0 {
            m2.supports.clear();
        }
        if check_2d(&m2, &m2.constraints).is_mechanism() {
            flagged += 1;
            for r in residuals_2d(&m2) {
                assert!(r < 1e-6, "2d seed {seed}: free motion with energy (residual {r:e})");
                tested += 1;
            }
        }
        let (mut m3, _) = fuzz_models::random_3d_model_rich(seed);
        if seed % 2 == 0 {
            fuzz_models::add_random_constraints_3d(&mut m3, seed);
        }
        if seed % 3 == 0 {
            m3.supports.clear();
        }
        // Left-handed local axes: the frame element's stiffness does not
        // vanish under rigid rotations there (a separate bug), so it cannot
        // serve as the reference; warping DOFs are not modelled.
        if !m3.curved_beams.is_empty() || DofNumbering::dofs_per_node_3d(&m3) == 7 || m3.left_hand == Some(true) {
            continue;
        }
        if check_3d(&m3, &m3.constraints).is_mechanism() {
            flagged += 1;
            for r in residuals_3d(&m3) {
                assert!(r < 1e-6, "3d seed {seed}: free motion with energy (residual {r:e})");
                tested += 1;
            }
        }
    }
    assert!(tested > 200 && flagged > 100, "only {tested} motions on {flagged} models");
}


// ---------------------------------------------------------------------------
// Modal analysis on a mechanism (#338)
// ---------------------------------------------------------------------------

/// MYSTRAN differential model modal3d_lumped-744196 (#338, #340): member 8
/// (node 7 to node 9) is released about its local y at node 7 and node 9 is
/// a free tip, so the member swings on its hinge. Modal analysis returned 3
/// of the 12 modes requested, with no diagnostic, dropping the zero mode;
/// the static solve returned displacements of 1.6e10. Both now refuse,
/// naming the tip.
const MODAL3D_LUMPED_744196: &str = r#"{"nodes": {"1": {"id": 1, "x": 0.967, "y": 6.302, "z": 2.024}, "2": {"id": 2, "x": 0.967, "y": 6.302, "z": -1.077}, "3": {"id": 3, "x": 1.18, "y": 2.891, "z": 4.408}, "4": {"id": 4, "x": 7.958, "y": 7.783, "z": 3.562}, "5": {"id": 5, "x": 1.282, "y": 6.661, "z": 4.34}, "6": {"id": 6, "x": 6.215, "y": 2.373, "z": 0.032}, "7": {"id": 7, "x": 1.237, "y": 0.113, "z": 1.521}, "8": {"id": 8, "x": 4.576, "y": 5.494, "z": 4.907}, "9": {"id": 9, "x": 1.177, "y": 5.043, "z": 7.108}}, "materials": {"1": {"id": 1, "e": 30000.0, "nu": 0.28957148714599}, "2": {"id": 2, "e": 57110.617580267186, "nu": 0.20085113715377023}}, "sections": {"1": {"id": 1, "a": 0.07544237029215778, "iy": 0.0006797517270497183, "iz": 0.00033093940951539527, "j": 0.0010106911365651136}, "2": {"id": 2, "a": 0.0732789572064304, "iy": 0.000623085049988766, "iz": 0.0003213714547854747, "j": 0.0009444565047742406}, "3": {"id": 3, "a": 0.1494962479727206, "iy": 0.0058786446593315595, "iz": 0.000590040021463207, "j": 0.006468684680794767}}, "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 2, "sectionId": 1, "rollAngle": -126.86728945771999, "releaseMyEnd": true}, "2": {"id": 2, "type": "frame", "nodeI": 3, "nodeJ": 1, "materialId": 2, "sectionId": 1, "releaseMyEnd": true}, "3": {"id": 3, "type": "frame", "nodeI": 8, "nodeJ": 1, "materialId": 2, "sectionId": 2, "localYx": -0.38610421393555794, "localYy": 0.09199959207572439, "localYz": 0.8673081756085204, "releaseMyEnd": true}, "4": {"id": 4, "type": "frame", "nodeI": 5, "nodeJ": 2, "materialId": 1, "sectionId": 1, "releaseMyEnd": true}, "5": {"id": 5, "type": "frame", "nodeI": 4, "nodeJ": 3, "materialId": 1, "sectionId": 2, "releaseMyEnd": true}, "6": {"id": 6, "type": "frame", "nodeI": 6, "nodeJ": 4, "materialId": 1, "sectionId": 1, "localYx": 0.7716167404634611, "localYy": 0.27324904480734613, "localYz": -0.5291170372906462, "releaseMyEnd": true}, "7": {"id": 7, "type": "frame", "nodeI": 6, "nodeJ": 7, "materialId": 1, "sectionId": 1, "rollAngle": 8.000476439362387, "releaseMyEnd": true}, "8": {"id": 8, "type": "frame", "nodeI": 7, "nodeJ": 9, "materialId": 1, "sectionId": 2, "releaseMyStart": true}, "9": {"id": 9, "type": "frame", "nodeI": 5, "nodeJ": 3, "materialId": 1, "sectionId": 1, "releaseMyEnd": true}, "10": {"id": 10, "type": "frame", "nodeI": 7, "nodeJ": 8, "materialId": 1, "sectionId": 1, "releaseMyEnd": true}}, "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}, "2": {"nodeId": 2, "rx": false, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": false}, "3": {"nodeId": 7, "rx": false, "ry": true, "rz": true, "rrx": true, "rry": false, "rrz": false, "dy": -0.005637269981230953, "dz": 0.006427283511252756, "drx": 0.001676186104643508}}, "loads": [], "_densities": {"1": 2500.0, "2": 7850.0}}"#;

#[test]
fn modal_on_a_mechanism_is_refused() {
    let input: SolverInput3D = serde_json::from_str(MODAL3D_LUMPED_744196).unwrap();
    let dens: HashMap<String, f64> = [("1".to_string(), 2500.0), ("2".to_string(), 7850.0)].into();
    let e = solve_modal_3d(&input, &dens, 12).err().expect("modal on a mechanism refused");
    assert_mechanism(&e, &[9], "node 9");
    let mut stat = input.clone();
    stat.loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 9, fx: 1.0, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    assert_mechanism(&refused_3d(&stat), &[9], "node 9");
    // Unreleased, the tip member is a cantilever: modal returns all modes.
    let mut fixed = input.clone();
    fixed.elements.get_mut("8").unwrap().release_my_start = false;
    let r = solve_modal_3d(&fixed, &dens, 12).expect("no mechanism");
    assert_eq!(r.modes.len(), 12);
}

/// 2D: a cantilever with a member hinged at its tip, free at the far end.
#[test]
fn modal_2d_on_a_mechanism_is_refused() {
    let model = |hinge: bool| {
        in2(json!({
            "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "z": 0.0},
                      "3": {"id": 3, "x": 5.0, "z": 1.0}},
            "materials": mats(), "sections": sec2(),
            "elements": {"1": frame2(1, 1, 2, false, false), "2": frame2(2, 2, 3, hinge, false)},
            "supports": {"1": sup2(1, 1, "fixed")}, "loads": []
        }))
    };
    let dens: HashMap<String, f64> = [("1".to_string(), 7850.0)].into();
    let e = solve_modal_2d(&model(true), &dens, 4).err().expect("refused");
    assert_mechanism(&e, &[3], "node 3");
    solve_modal_2d(&model(false), &dens, 4).expect("cantilever modal");
}


// ---------------------------------------------------------------------------
// Models the assembled-level certificate certified although singular (#458,
// found by the end-to-end certificates of #403)
// ---------------------------------------------------------------------------

/// 2D: a nodal moment on a node where every member is hinged. Nothing
/// resists it; the artificial rotational spring absorbed it (rotation 21 rad,
/// under the 100 rad heuristic) and the certificate certified the
/// regularised answer. Refused; without the moment the model is fine (the
/// hinged rotation is harmless).
#[test]
fn moment_on_fully_hinged_node_2d() {
    let model = |my: f64| {
        in2(json!({
            "nodes": {"1": {"id":1,"x":0.0,"z":0.0}, "2": {"id":2,"x":1.0,"z":0.0}, "3": {"id":3,"x":2.0,"z":0.0}},
            "materials": {"1": {"id":1,"e":200000.0,"nu":0.3}},
            "sections": {"1": {"id":1,"a":1.0,"iz":1.0}},
            "elements": {"1": frame2(1, 1, 2, false, true), "2": frame2(2, 2, 3, true, false)},
            "supports": {"1": sup2(1, 1, "fixed"), "2": sup2(2, 3, "fixed")},
            "loads": [nodal2(2, 0.0, -10.0, my)]
        }))
    };
    let e = solve_2d(&model(5.0)).unwrap_err();
    assert!(e.contains("Nodal moment at node 2"), "{e}");
    assert!(certify_linear_2d_full(&model(5.0)).is_err());
    let out = certify_linear_2d_full(&model(0.0)).expect("no moment: solves");
    assert!(out.certificate.is_certified(), "{:?}", out.certificate);
}

/// 2D: a rigid link from a node where its only member is hinged. The linked
/// pair turns freely about the hinge (the truss between them does not resist
/// a rigid rotation); the all-hinged spring held it and a load on the slave
/// drove it to a meaningless value certified with a relative bound of 2e-15.
/// Refused, naming the free motion; and never certified.
#[test]
fn rigid_link_hides_a_mechanism_2d() {
    let input = in2(json!({
        "nodes": {"1": {"id":1,"x":0.0,"z":0.0}, "2": {"id":2,"x":0.0,"z":3.0}, "3": {"id":3,"x":2.0,"z":3.0}},
        "materials": {"1": {"id":1,"e":200000.0,"nu":0.3}},
        "sections": {"1": {"id":1,"a":0.01,"iz":0.0001}},
        "elements": {"1": frame2(1, 1, 2, false, true),
                     "2": {"id":2,"type":"truss","nodeI":2,"nodeJ":3,"materialId":1,"sectionId":1}},
        "supports": {"1": sup2(1, 1, "fixed")},
        "loads": [nodal2(3, 0.0, -10.0, 0.0)],
        "constraints": [{"type":"rigidLink","masterNode":2,"slaveNode":3,"dofs":[]}]
    }));
    let e = solve_2d(&input).unwrap_err();
    assert_mechanism(&e, &[2, 3], "The loads act on it");
    assert!(certify_linear_2d_full(&input).is_err());
}

/// 3D models from the differential generator (`rich3d` seeds 0 and 10 of
/// tools/differential; #403 met the same in its seeds 121 and 143):
/// a node reached by one member released about its local y has a rotation
/// about a skew axis that nothing stiffens. Singular in exact arithmetic,
/// regular after rounding (the orphan guard looks at diagonal entries only),
/// so the solve returned an arbitrary rotation there and the certificate
/// certified it. Refused, naming the node; never certified.
const RICH3D_A: &str = r#"{"nodes": {"1": {"id": 1, "x": 3.082, "y": 7.122, "z": 0.324}, "2": {"id": 2, "x": 3.887, "y": 7.346, "z": 6.639}, "3": {"id": 3, "x": 2.864, "y": 7.133, "z": 1.748}, "4": {"id": 4, "x": 3.082, "y": 7.122, "z": -3.531}, "5": {"id": 5, "x": 7.278, "y": 7.862, "z": 6.482}, "6": {"id": 6, "x": 2.481, "y": 5.839, "z": 7.191}, "7": {"id": 7, "x": 3.777, "y": 0.806, "z": 3.473}, "8": {"id": 8, "x": 7.304, "y": 7.733, "z": 3.816}, "9": {"id": 9, "x": 2.084, "y": 6.44, "z": 4.39}}, "materials": {"1": {"id": 1, "e": 14072.093047565497, "nu": 0.3180182433110826}, "2": {"id": 2, "e": 215973.49285487118, "nu": 0.27505316585472644}}, "sections": {"1": {"id": 1, "a": 0.1605350345567367, "iy": 0.006336797470545199, "iz": 0.0007278585441366807, "j": 0.002283213239785076}, "2": {"id": 2, "a": 0.07603860988491065, "iy": 0.00233752488384439, "iz": 9.931570723709512e-05, "j": 0.0003708906056856221}, "3": {"id": 3, "a": 0.12391868591493277, "iy": 0.0008932393533105078, "iz": 0.0018332295826001465, "j": 0.00230250346853879}}, "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}, "2": {"id": 2, "type": "frame", "nodeI": 3, "nodeJ": 1, "materialId": 2, "sectionId": 3}, "3": {"id": 3, "type": "frame", "nodeI": 1, "nodeJ": 6, "materialId": 2, "sectionId": 3}, "4": {"id": 4, "type": "frame", "nodeI": 4, "nodeJ": 2, "materialId": 1, "sectionId": 2, "rollAngle": -138.47409237086842, "releaseMzEnd": true}, "5": {"id": 5, "type": "frame", "nodeI": 3, "nodeJ": 7, "materialId": 1, "sectionId": 2, "releaseMzEnd": true}, "6": {"id": 6, "type": "frame", "nodeI": 4, "nodeJ": 5, "materialId": 1, "sectionId": 1, "localYx": 0.14773207357833384, "localYy": 0.8200320293980794, "localYz": 0.06839593652144793, "releaseMyEnd": true}, "7": {"id": 7, "type": "frame", "nodeI": 5, "nodeJ": 8, "materialId": 1, "sectionId": 3, "rollAngle": -46.74962147933252, "releaseMyEnd": true, "releaseMzStart": true}, "8": {"id": 8, "type": "frame", "nodeI": 9, "nodeJ": 5, "materialId": 1, "sectionId": 1, "rollAngle": 81.77588260374051, "releaseMyStart": true}, "9": {"id": 9, "type": "frame", "nodeI": 6, "nodeJ": 2, "materialId": 1, "sectionId": 1, "localYx": -0.3978769279972618, "localYy": -0.12786270409348766, "localYz": -0.877915121560745}, "10": {"id": 10, "type": "truss", "nodeI": 9, "nodeJ": 4, "materialId": 2, "sectionId": 3}}, "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}, "2": {"nodeId": 4, "rx": true, "ry": false, "rz": false, "rrx": true, "rry": true, "rrz": true, "kz": 681599.3949286303}, "3": {"nodeId": 7, "rx": true, "ry": false, "rz": true, "rrx": false, "rry": true, "rrz": true}, "4": {"nodeId": 8, "rx": true, "ry": false, "rz": true, "rrx": false, "rry": false, "rrz": true}}, "loads": [{"type": "pointOnElement", "data": {"elementId": 7, "a": 1.86523879736426, "py": 39.46833251491147, "pz": -50.31322717530351}}, {"type": "distributed", "data": {"elementId": 6, "qYI": -13.596808839018358, "qYJ": -11.076087165653888, "qZI": -2.074586934254153, "qZJ": 8.413999043531234, "a": 5.691336692499026, "b": 9.10746623087161}}]}"#;
const RICH3D_B: &str = r#"{"nodes": {"1": {"id": 1, "x": 0.261, "y": 3.86, "z": 0.119}, "2": {"id": 2, "x": 3.93, "y": 2.22, "z": 6.485}, "3": {"id": 3, "x": 3.93, "y": 2.22, "z": 8.713}, "4": {"id": 4, "x": 5.964, "y": 2.889, "z": 3.363}, "5": {"id": 5, "x": 3.93, "y": 2.22, "z": 11.977}, "6": {"id": 6, "x": 2.099, "y": 1.397, "z": 2.425}, "7": {"id": 7, "x": 3.655, "y": 6.88, "z": 1.915}}, "materials": {"1": {"id": 1, "e": 30000.0, "nu": 0.15885212657292416}, "2": {"id": 2, "e": 200000.0, "nu": 0.18899066141397097}}, "sections": {"1": {"id": 1, "a": 0.20384870174095346, "iy": 0.004223511508842876, "iz": 0.002839197641087671, "j": 0.004453517952351182}, "2": {"id": 2, "a": 0.1634829419146893, "iy": 0.004636041576975325, "iz": 0.0010699906018590956, "j": 0.0024651692103494554}, "3": {"id": 3, "a": 0.13204854669095553, "iy": 0.00363107284152827, "iz": 0.0005814830367175485, "j": 0.0013991263760903775}}, "elements": {"1": {"id": 1, "type": "frame", "nodeI": 2, "nodeJ": 1, "materialId": 1, "sectionId": 1, "rollAngle": 173.49813171239128}, "2": {"id": 2, "type": "frame", "nodeI": 3, "nodeJ": 1, "materialId": 2, "sectionId": 3, "localYx": 0.0437139001259268, "localYy": 0.7297651785534993, "localYz": -0.4659458628932409}, "3": {"id": 3, "type": "frame", "nodeI": 4, "nodeJ": 1, "materialId": 2, "sectionId": 1, "releaseMzEnd": true}, "4": {"id": 4, "type": "frame", "nodeI": 1, "nodeJ": 5, "materialId": 1, "sectionId": 2, "localYx": -0.10388814799796786, "localYy": 0.1656979346011882, "localYz": -0.218826116314232}, "5": {"id": 5, "type": "frame", "nodeI": 7, "nodeJ": 3, "materialId": 2, "sectionId": 2, "releaseMyStart": true}, "6": {"id": 6, "type": "frame", "nodeI": 4, "nodeJ": 6, "materialId": 2, "sectionId": 2}, "7": {"id": 7, "type": "truss", "nodeI": 5, "nodeJ": 7, "materialId": 1, "sectionId": 1}}, "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}, "2": {"nodeId": 6, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": false, "rrz": true}, "3": {"nodeId": 2, "rx": true, "ry": true, "rz": false, "rrx": false, "rry": false, "rrz": true}}, "loads": [{"type": "pointOnElement", "data": {"elementId": 3, "a": 3.94828204597459, "py": 22.442393477778097, "pz": 17.11202672541353}}, {"type": "distributed", "data": {"elementId": 7, "qYI": 5.137170695943517, "qYJ": 5.137170695943517, "qZI": -15.344964277042198, "qZJ": -15.344964277042198, "a": 0.5926291916969857, "b": 7.310144520392838}}]}"#;

#[test]
fn rotation_unstiffened_about_a_skew_axis() {
    for json in [RICH3D_A, RICH3D_B] {
        let input: SolverInput3D = serde_json::from_str(json).unwrap();
        let c = check_3d(&input, &input.constraints);
        assert!(c.unheld_rotation_dims() > 0, "{c:?}");
        let e = solve_3d(&input).unwrap_err();
        assert!(e.contains("Rotation not stiffened at node"), "{e}");
        assert!(c.uncertifiable().is_some());
    }
}

/// The certificate's own gate: given results for a mechanism, or for a model
/// with a skew rotation nothing stiffens, it does not certify them (whatever
/// produced them).
#[test]
fn certificate_never_certifies_a_mechanism() {
    // a beam on two rollers in 2D, loaded vertically: it slides
    let input = in2(json!({
        "nodes": {"1": {"id":1,"x":0.0,"z":0.0}, "2": {"id":2,"x":4.0,"z":0.0}},
        "materials": mats(), "sections": sec2(),
        "elements": {"1": frame2(1, 1, 2, false, false)},
        "supports": {"1": sup2(1, 1, "rollerX"), "2": sup2(2, 2, "rollerX")},
        "loads": [nodal2(2, 0.0, -10.0, 0.0)]
    }));
    let fixed = {
        let mut m = input.clone();
        m.supports.get_mut("1").unwrap().support_type = "pinned".into();
        m
    };
    let results = solve_2d(&fixed).unwrap();
    let cert = certify_results_2d(&input, &results);
    assert!(!cert.is_certified(), "{cert:?}");
    assert!(certify_results_2d(&fixed, &results).is_certified());
    let input: SolverInput3D = serde_json::from_str(RICH3D_A).unwrap();
    let results = solve_3d(&in3(json!({
        "nodes": {"1": {"id":1,"x":0.0,"y":0.0,"z":0.0}}, "materials": mats(), "sections": sec3(),
        "elements": {}, "supports": {"1": sup3(1, [true; 6])}, "loads": []
    }))).unwrap();
    assert!(!certify_results_3d(&input, &results).is_certified());
}

// ---------------------------------------------------------------------------
// Free motions against the null space of K
// ---------------------------------------------------------------------------

fn jacobi_eigenvalues(mut a: Vec<f64>, n: usize) -> Vec<f64> {
    for _ in 0..200 {
        let mut off = 0.0;
        for p in 0..n {
            for q in p + 1..n {
                off += a[p * n + q] * a[p * n + q];
            }
        }
        if off < 1e-36 {
            break;
        }
        for p in 0..n {
            for q in p + 1..n {
                let apq = a[p * n + q];
                if apq.abs() < 1e-300 {
                    continue;
                }
                let theta = (a[q * n + q] - a[p * n + p]) / (2.0 * apq);
                let t = if theta == 0.0 { 1.0 } else { theta.signum() / (theta.abs() + (theta * theta + 1.0).sqrt()) };
                let c = 1.0 / (t * t + 1.0).sqrt();
                let s = t * c;
                for k in 0..n {
                    let (x, y) = (a[k * n + p], a[k * n + q]);
                    a[k * n + p] = c * x - s * y;
                    a[k * n + q] = s * x + c * y;
                }
                for k in 0..n {
                    let (x, y) = (a[p * n + k], a[q * n + k]);
                    a[p * n + k] = c * x - s * y;
                    a[q * n + k] = s * x + c * y;
                }
            }
        }
    }
    let mut e: Vec<f64> = (0..n).map(|i| a[i * n + i]).collect();
    e.sort_by(|x, y| x.total_cmp(y));
    e
}

/// Number of zero eigenvalues of the Jacobi-scaled K_ff, when the spectrum
/// separates them clearly (below 1e-11, the next above 1e-7); None otherwise.
fn zero_modes(k: &[f64], n: usize, nf: usize) -> Option<usize> {
    if nf == 0 || nf > 160 {
        return None;
    }
    let d: Vec<f64> = (0..nf).map(|i| k[i * n + i].abs().sqrt()).collect();
    if d.iter().any(|v| *v == 0.0) {
        return None;
    }
    let mut a = vec![0.0; nf * nf];
    for i in 0..nf {
        for j in 0..nf {
            a[i * nf + j] = k[i * n + j] / (d[i] * d[j]);
        }
    }
    let e = jacobi_eigenvalues(a, nf);
    let z = e.iter().filter(|v| v.abs() < 1e-11).count();
    match e.get(z) {
        Some(next) if *next < 1e-7 => None,
        _ => Some(z),
    }
}

/// On random models (every feature but constraints, which K does not see),
/// the number of free motions the exact check finds — plus single-node
/// rotations nothing couples to off the global axes, which the solver's
/// artificial stiffness does not hold — equals the number of zero
/// eigenvalues of the assembled stiffness, whenever the spectrum separates
/// them. Both directions: no motion invented, none missed.
#[test]
fn free_motions_match_the_null_space_of_k() {
    let (mut agree, mut skipped) = (0, 0);
    for seed in 0..300u64 {
        let (mut m2, _) = fuzz_models::random_2d_model_rich(seed);
        if seed % 3 == 0 {
            m2.supports.clear();
        }
        let c = check_2d(&m2, &[]);
        let dn = DofNumbering::build_2d(&m2);
        let st = assemble_stiffness_2d(&m2, &dn);
        match zero_modes(&st.k, dn.n_total, dn.n_free) {
            Some(z) => {
                // the solver's artificial stiffness holds a rotation whose
                // diagonal is round-off, which exact arithmetic may count
                // as coupled: unheld rotations are an upper bound
                assert!(c.free_motions <= z && z <= c.free_motions + c.unheld_rotation_dims(), "2d seed {seed}: {z} zero modes, {c:?}");
                agree += 1;
            }
            None => skipped += 1,
        }
        let (mut m3, _) = fuzz_models::random_3d_model_rich(seed);
        if seed % 3 == 0 {
            m3.supports.clear();
        }
        if !m3.curved_beams.is_empty() || DofNumbering::dofs_per_node_3d(&m3) == 7 || m3.left_hand == Some(true) {
            continue;
        }
        let c = check_3d(&m3, &[]);
        let dn = DofNumbering::build_3d(&m3);
        let st = assemble_stiffness_3d(&m3, &dn);
        match zero_modes(&st.k, dn.n_total, dn.n_free) {
            Some(z) => {
                // the solver's artificial stiffness holds a rotation whose
                // diagonal is round-off, which exact arithmetic may count
                // as coupled: unheld rotations are an upper bound
                assert!(c.free_motions <= z && z <= c.free_motions + c.unheld_rotation_dims(), "3d seed {seed}: {z} zero modes, {c:?}");
                agree += 1;
            }
            None => skipped += 1,
        }
    }
    assert!(agree > 300, "only {agree} models compared ({skipped} skipped)");
}

// ---------------------------------------------------------------------------
// No false positives
// ---------------------------------------------------------------------------

/// No fixture (example models, regression inputs) is a mechanism.
#[test]
fn no_fixture_is_flagged() {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures");
    let mut checked = 0;
    for e in std::fs::read_dir(dir).unwrap() {
        let p = e.unwrap().path();
        let name = p.file_name().unwrap().to_str().unwrap().to_string();
        if !name.ends_with(".json") {
            continue;
        }
        let json = std::fs::read_to_string(&p).unwrap();
        let c = if name.contains("3d") {
            match serde_json::from_str::<SolverInput3D>(&json) {
                Ok(i) => check_3d(&i, &i.constraints),
                Err(_) => continue,
            }
        } else {
            match serde_json::from_str::<SolverInput>(&json) {
                Ok(i) => check_2d(&i, &i.constraints),
                Err(_) => continue,
            }
        };
        assert!(!c.is_mechanism(), "{name}: {}", c.message().unwrap());
        assert!(c.unchecked.is_none(), "{name}: unchecked ({:?})", c.unchecked);
        assert!(c.refuse_unheld_rotations().is_ok(), "{name}: {:?}", c.refuse_unheld_rotations());
        checked += 1;
    }
    assert!(checked > 100, "only {checked} fixtures");
}
