//! Multi-point constraints on nodes with inclined supports, in every analysis.
//!
//! Assembly rotates an inclined-support node's translations into the
//! support's frame; constraint equations are written in global components.
//! The constraint transform used to be built in global components over those
//! rotated DOFs, so the solve enforced the wrong equations and returned
//! results that violated the constraint with no warning (found by
//! tools/differential/codeaster, aster3d-16). The transform is now built in
//! the support frames.
//!
//! Each case is checked against a reference that has no inclined frame:
//! - `Ref::Mpc`: the inclined support replaced by the linear MPC `n·u = 0` on
//!   the node's global translations;
//! - `Ref::Rotated`: the whole structure turned rigidly so that the support is
//!   a plain restraint (for constraints that turn with it).
//!
//! and directly: the constraint equations and the support condition hold in
//! the results.

use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::types::*;
use serde_json::{json, Value};

const THETA: f64 = 0.5;
/// Unit normal of the 3D inclined support (largest component on z).
const N3: [f64; 3] = [0.48, 0.36, 0.8];

#[derive(Clone, Copy, PartialEq, Debug)]
enum Sup {
    /// The model as given: an inclined support at node 4.
    Inclined,
    /// Turned rigidly so that node 4's support is a plain restraint.
    Rotated,
    /// Node 4 unsupported, with the linear MPC n·u4 = 0.
    Mpc,
}

fn assert_close(what: &str, a: f64, b: f64, scale: f64, rel: f64) {
    assert!((a - b).abs() <= rel * scale.max(1e-300), "{what}: {a} vs {b} (scale {scale})");
}

// ─── 2D ────────────────────────────────────────────────────────────────────

/// Rotation by +theta in the x–z plane (turns the support normal
/// (sin θ, cos θ) onto z).
fn rot2(theta: f64, v: [f64; 2]) -> [f64; 2] {
    let (s, c) = theta.sin_cos();
    [c * v[0] - s * v[1], s * v[0] + c * v[1]]
}

fn n2() -> [f64; 2] {
    [THETA.sin(), THETA.cos()]
}

/// Portal 1-2-3-4 (fixed at 1, inclined roller at 4) and a frame 7-8 fixed at
/// 8 beside it; frames split into `sub` elements (sparse path past 64 free
/// DOFs). `constraints` gets the vector map of the variant (identity, or the
/// rigid turn) for offsets and MPC coefficient vectors.
fn model_2d(sup: Sup, sub: usize, constraints: &dyn Fn(&dyn Fn([f64; 2]) -> [f64; 2]) -> Vec<Value>) -> SolverInput {
    model_2d_at(THETA, sup, sub, constraints)
}

fn model_2d_at(theta: f64, sup: Sup, sub: usize, constraints: &dyn Fn(&dyn Fn([f64; 2]) -> [f64; 2]) -> Vec<Value>) -> SolverInput {
    let rotated = sup == Sup::Rotated;
    let r = move |v: [f64; 2]| if rotated { rot2(theta, v) } else { v };
    let pts = [(1, 0.0, 0.0), (2, 0.0, 4.0), (3, 5.0, 4.0), (4, 5.0, 0.0), (7, 6.5, 1.0), (8, 9.0, 1.0)];
    let mut nodes = serde_json::Map::new();
    let mut xy = std::collections::HashMap::new();
    for (id, x, z) in pts {
        xy.insert(id, [x, z]);
        let p = r([x, z]);
        nodes.insert(id.to_string(), json!({"id": id, "x": p[0], "z": p[1]}));
    }
    let mut elements = serde_json::Map::new();
    let mut next_node = 100;
    let mut next_elem = 1;
    for (a, b) in [(1, 2), (2, 3), (3, 4), (7, 8)] {
        let (pa, pb) = (xy[&a], xy[&b]);
        let mut prev = a;
        for k in 1..=sub {
            let id = if k == sub { b } else {
                let t = k as f64 / sub as f64;
                let p = r([pa[0] + t * (pb[0] - pa[0]), pa[1] + t * (pb[1] - pa[1])]);
                next_node += 1;
                nodes.insert(next_node.to_string(), json!({"id": next_node, "x": p[0], "z": p[1]}));
                next_node
            };
            elements.insert(next_elem.to_string(), json!({"id": next_elem, "type": "frame",
                "nodeI": prev, "nodeJ": id, "materialId": 1, "sectionId": 1,
                "hingeStart": false, "hingeEnd": false}));
            next_elem += 1;
            prev = id;
        }
    }
    let mut supports = serde_json::Map::new();
    supports.insert("1".into(), json!({"id": 1, "nodeId": 1, "type": "fixed"}));
    supports.insert("8".into(), json!({"id": 8, "nodeId": 8, "type": "fixed"}));
    match sup {
        Sup::Inclined => {
            supports.insert("4".into(), json!({"id": 4, "nodeId": 4, "type": "inclinedRoller", "angle": theta}));
        }
        Sup::Rotated => {
            supports.insert("4".into(), json!({"id": 4, "nodeId": 4, "type": "rollerX"}));
        }
        Sup::Mpc => {}
    }
    let mut cs = constraints(&r);
    if sup == Sup::Mpc {
        let n = [theta.sin(), theta.cos()];
        cs.push(json!({"type": "linearMPC", "terms": [
            {"nodeId": 4, "dof": 0, "coefficient": n[0]},
            {"nodeId": 4, "dof": 1, "coefficient": n[1]}]}));
    }
    let loads: Vec<Value> = [(3, [10.0, -20.0], 0.0), (7, [5.0, -30.0], 2.0), (2, [4.0, 0.0], -1.0)]
        .iter()
        .map(|&(node, f, m)| {
            let f = r(f);
            json!({"type": "nodal", "data": {"nodeId": node, "fx": f[0], "fz": f[1], "my": m}})
        })
        .collect();
    serde_json::from_value(json!({
        "nodes": nodes,
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": elements,
        "supports": supports,
        "loads": loads,
        "constraints": cs,
    }))
    .unwrap()
}

type Constraints2D = fn(&dyn Fn([f64; 2]) -> [f64; 2]) -> Vec<Value>;

/// (name, constraints, reference). Node 4 is on the inclined roller; 7 is
/// beside it.
fn cases_2d() -> Vec<(&'static str, Constraints2D, Sup)> {
    vec![
        ("rigid link, master on the inclined node", |_| vec![
            json!({"type": "rigidLink", "masterNode": 4, "slaveNode": 7, "dofs": [0, 1, 2]})], Sup::Mpc),
        ("rigid link, master on the inclined node (rotated)", |_| vec![
            json!({"type": "rigidLink", "masterNode": 4, "slaveNode": 7, "dofs": [0, 1, 2]})], Sup::Rotated),
        ("rigid link, slave on the inclined node", |_| vec![
            json!({"type": "rigidLink", "masterNode": 7, "slaveNode": 4, "dofs": [0, 1, 2]})], Sup::Rotated),
        ("rigid link translations only, slave on the inclined node", |_| vec![
            json!({"type": "rigidLink", "masterNode": 7, "slaveNode": 4, "dofs": [0, 1]})], Sup::Rotated),
        ("equal DOF, master on the inclined node", |_| vec![
            json!({"type": "equalDOF", "masterNode": 4, "slaveNode": 7, "dofs": [0, 1]})], Sup::Mpc),
        ("equal DOF, slave on the inclined node", |_| vec![
            json!({"type": "equalDOF", "masterNode": 7, "slaveNode": 4, "dofs": [0, 1, 2]})], Sup::Rotated),
        // u4x = u7x either way round; the reference states it with 4 as master.
        ("equal DOF on ux only, slave on the inclined node", |_| vec![
            json!({"type": "equalDOF", "masterNode": 7, "slaveNode": 4, "dofs": [0]})], Sup::Mpc),
        ("equal DOF on uz only, master on the inclined node", |_| vec![
            json!({"type": "equalDOF", "masterNode": 4, "slaveNode": 7, "dofs": [1]})], Sup::Mpc),
        ("eccentric connection, master on the inclined node", |r| {
            let o = r([1.5, 1.0]);
            vec![json!({"type": "eccentricConnection", "masterNode": 4, "slaveNode": 7,
                        "offsetX": o[0], "offsetY": o[1], "offsetZ": 0.0})]
        }, Sup::Rotated),
        ("eccentric connection, slave on the inclined node", |r| {
            let o = r([-1.5, -1.0]);
            vec![json!({"type": "eccentricConnection", "masterNode": 7, "slaveNode": 4,
                        "offsetX": o[0], "offsetY": o[1], "offsetZ": 0.0})]
        }, Sup::Rotated),
        ("diaphragm, master on the inclined node", |_| vec![
            json!({"type": "diaphragm", "masterNode": 4, "slaveNodes": [7], "plane": "XY"})], Sup::Mpc),
        ("diaphragm, slave on the inclined node", |_| vec![
            json!({"type": "diaphragm", "masterNode": 7, "slaveNodes": [4], "plane": "XY"})], Sup::Rotated),
        ("linear MPC on the inclined node's translations", |r| {
            let (a, b) = (r([0.3, 1.0]), r([1.0, -0.4]));
            vec![json!({"type": "linearMPC", "terms": [
                {"nodeId": 4, "dof": 0, "coefficient": a[0]}, {"nodeId": 4, "dof": 1, "coefficient": a[1]},
                {"nodeId": 7, "dof": 0, "coefficient": -b[0]}, {"nodeId": 7, "dof": 1, "coefficient": -b[1]},
                {"nodeId": 7, "dof": 2, "coefficient": -0.7}]})]
        }, Sup::Rotated),
    ]
}

/// The MPC reference states a one-component equal DOF with node 4 as master
/// (the same equation): its slave cannot also carry the support MPC.
fn mpc_reference_2d(name: &str, c: Constraints2D, sub: usize) -> SolverInput {
    if name.starts_with("equal DOF on ux only, slave") {
        return model_2d(Sup::Mpc, sub, &|_| vec![
            json!({"type": "equalDOF", "masterNode": 4, "slaveNode": 7, "dofs": [0]})]);
    }
    model_2d(Sup::Mpc, sub, &c)
}

fn disp_2d(res: &AnalysisResults, node: usize) -> [f64; 3] {
    let d = res.displacements.iter().find(|d| d.node_id == node).unwrap();
    [d.ux, d.uz, d.ry]
}

/// Every node of `a` (the inclined model) against `b` (the reference), with
/// `b` turned back to the original axes when it is the rotated model.
fn compare_2d(what: &str, a: &[Displacement], b: &[Displacement], rotated: bool) {
    let scale = a.iter().fold(0.0f64, |m, d| m.max(d.ux.abs()).max(d.uz.abs()).max(d.ry.abs()));
    assert!(scale > 1e-9, "{what}: no response");
    for db in b {
        let da = a.iter().find(|d| d.node_id == db.node_id).unwrap();
        let t = if rotated { rot2(-THETA, [db.ux, db.uz]) } else { [db.ux, db.uz] };
        assert_close(&format!("{what} node {} ux", db.node_id), da.ux, t[0], scale, 1e-8);
        assert_close(&format!("{what} node {} uz", db.node_id), da.uz, t[1], scale, 1e-8);
        assert_close(&format!("{what} node {} ry", db.node_id), da.ry, db.ry, scale, 1e-8);
    }
}

/// The support condition and the rigid-link equations at node 4 / 7.
fn check_support_2d(what: &str, res: &AnalysisResults) {
    let u4 = disp_2d(res, 4);
    let n = n2();
    let scale = res.displacements.iter().fold(0.0f64, |m, d| m.max(d.ux.abs()).max(d.uz.abs()));
    assert_close(&format!("{what}: support n·u4"), n[0] * u4[0] + n[1] * u4[1], 0.0, scale, 1e-9);
}

#[test]
fn linear_static_2d_constraints_on_inclined_roller_match_references() {
    for sub in [1, 12] {
        for (name, c, reference) in cases_2d() {
            let what = format!("sub {sub}, {name}");
            let a = solve_2d(&model_2d(Sup::Inclined, sub, &c)).unwrap_or_else(|e| panic!("{what}: {e}"));
            check_support_2d(&what, &a);
            let b_input = if reference == Sup::Mpc { mpc_reference_2d(name, c, sub) } else { model_2d(reference, sub, &c) };
            let b = solve_2d(&b_input).unwrap_or_else(|e| panic!("{what} reference: {e}"));
            compare_2d(&what, &a.displacements, &b.displacements, reference == Sup::Rotated);
        }
    }
}

/// u7 = u4 + θ4 × r for a rigid link 4 → 7, read straight off the results.
#[test]
fn linear_static_2d_rigid_link_holds_at_inclined_roller() {
    for (master, slave) in [(4, 7), (7, 4)] {
        let input = model_2d(Sup::Inclined, 1, &|_| vec![
            json!({"type": "rigidLink", "masterNode": master, "slaveNode": slave, "dofs": [0, 1, 2]})]);
        let res = solve_2d(&input).unwrap();
        let (m, s) = (disp_2d(&res, master), disp_2d(&res, slave));
        let (pm, ps) = (&input.nodes[&master.to_string()], &input.nodes[&slave.to_string()]);
        let (dx, dz) = (ps.x - pm.x, ps.z - pm.z);
        let scale = m.iter().chain(&s).fold(0.0f64, |a, v| a.max(v.abs()));
        assert_close("ux", s[0], m[0] - dz * m[2], scale, 1e-10);
        assert_close("uz", s[1], m[1] + dx * m[2], scale, 1e-10);
        assert_close("ry", s[2], m[2], scale, 1e-10);
        check_support_2d("rigid link", &res);
        // Global equilibrium: reactions balance the loads.
        let (fx, fz) = input.loads.iter().fold((0.0, 0.0), |(x, z), l| match l {
            SolverLoad::Nodal(n) => (x + n.fx, z + n.fz),
            _ => (x, z),
        });
        let (rx, rz) = res.reactions.iter().fold((0.0, 0.0), |(x, z), r| (x + r.rx, z + r.rz));
        assert_close("ΣFx", rx + fx, 0.0, fx.abs() + fz.abs(), 1e-9);
        assert_close("ΣFz", rz + fz, 0.0, fx.abs() + fz.abs(), 1e-9);
        // The roller's reaction is along its normal.
        let r4 = res.reactions.iter().find(|r| r.node_id == 4).unwrap();
        let n = n2();
        assert_close("roller reaction ⟂ normal", r4.rx * n[1] - r4.rz * n[0], 0.0, r4.rx.abs() + r4.rz.abs(), 1e-9);
    }
}

/// Constraint forces are reported in global components: a rigid link 4 → 7
/// carries the same force at its slave 7 as in the turned model, turned back.
/// At a slave on the inclined node itself the raw forces sit on the rotated
/// DOFs and are turned back to global components too.
#[test]
fn linear_static_2d_constraint_forces_are_global() {
    let cf = |res: &AnalysisResults, node: usize| {
        let mut f = [0.0; 3];
        for c in res.constraint_forces.iter().filter(|c| c.node_id == node) {
            f[match c.dof.as_str() { "ux" => 0, "uz" => 1, _ => 2 }] += c.force;
        }
        f
    };
    let link: Constraints2D = |_| vec![json!({"type": "rigidLink", "masterNode": 4, "slaveNode": 7, "dofs": [0, 1, 2]})];
    let a = solve_2d(&model_2d(Sup::Inclined, 1, &link)).unwrap();
    let b = solve_2d(&model_2d(Sup::Rotated, 1, &link)).unwrap();
    let (fa, fb) = (cf(&a, 7), cf(&b, 7));
    let t = rot2(-THETA, [fb[0], fb[1]]);
    let scale = fb.iter().fold(0.0f64, |m, v| m.max(v.abs()));
    assert!(scale > 1e-6, "no constraint force at the slave");
    assert_close("Fx", fa[0], t[0], scale, 1e-8);
    assert_close("Fz", fa[1], t[1], scale, 1e-8);
    assert_close("M", fa[2], fb[2], scale, 1e-8);
    // Slave on the roller, tied in both translations to node 7: the tangential
    // constraint force at node 4 is along the roller (the normal share is the
    // support's reaction).
    let eq: Constraints2D = |_| vec![json!({"type": "equalDOF", "masterNode": 7, "slaveNode": 4, "dofs": [0, 1]})];
    let a = solve_2d(&model_2d(Sup::Inclined, 1, &eq)).unwrap();
    let f4 = cf(&a, 4);
    let n = n2();
    assert!(f4[0].abs() + f4[1].abs() > 1e-6, "no constraint force at the slave");
    assert_close("constraint force along the roller", n[0] * f4[0] + n[1] * f4[1], 0.0, f4[0].abs() + f4[1].abs(), 1e-9);
}

/// Two rigid links tie node 7 to nodes 4 (on the roller) and 2. Without an
/// inclined support the second silently replaces the first ("last one wins",
/// a ConflictingConstraints warning); with the equations checked against the
/// built transform at the inclined node, the model is refused.
#[test]
fn conflicting_constraints_at_inclined_node_are_refused() {
    let c: Constraints2D = |_| vec![
        json!({"type": "rigidLink", "masterNode": 4, "slaveNode": 7, "dofs": [0, 1, 2]}),
        json!({"type": "rigidLink", "masterNode": 2, "slaveNode": 7, "dofs": [0, 1, 2]})];
    let err = solve_2d(&model_2d(Sup::Inclined, 1, &c)).expect_err("conflicting constraints solved");
    assert!(err.contains("cannot be enforced"), "{err}");
}

/// A rigid link whose slave sits on a plain support (a roller): the support
/// restrains the master's motion through the link. Eliminating the
/// restrained slave instead dropped the link's equations — the support won
/// and the results broke the link, with only an OverConstrainedDof warning.
#[test]
fn rigid_link_slave_on_plain_support_restrains_the_master() {
    let c: Constraints2D = |_| vec![json!({"type": "rigidLink", "masterNode": 7, "slaveNode": 4, "dofs": [0, 1, 2]})];
    let input = model_2d(Sup::Rotated, 1, &c);
    let res = solve_2d(&input).unwrap();
    let (m, s) = (disp_2d(&res, 7), disp_2d(&res, 4));
    let (pm, ps) = (&input.nodes["7"], &input.nodes["4"]);
    let (dx, dz) = (ps.x - pm.x, ps.z - pm.z);
    let scale = m.iter().chain(&s).fold(0.0f64, |a, v| a.max(v.abs()));
    assert!(scale > 1e-9);
    assert_close("ux", s[0], m[0] - dz * m[2], scale, 1e-10);
    assert_close("uz", s[1], m[1] + dx * m[2], scale, 1e-10);
    assert_close("ry", s[2], m[2], scale, 1e-10);
    assert_close("roller uz", s[1], 0.0, scale, 1e-12);
    assert!(res.structured_diagnostics.iter().any(|d| d.code == DiagnosticCode::OverConstrainedDof));
}

/// A settlement of the inclined roller along its normal, with the constraint
/// on the roller's node: the prescribed normal displacement reaches the
/// constrained DOFs through the transform's restrained columns.
#[test]
fn linear_static_2d_settlement_at_inclined_roller_with_constraints() {
    let u_n = -0.004;
    for (name, c) in [("master", (|_| vec![json!({"type": "rigidLink", "masterNode": 4, "slaveNode": 7, "dofs": [0, 1, 2]})]) as Constraints2D),
                      ("slave", |_| vec![json!({"type": "rigidLink", "masterNode": 7, "slaveNode": 4, "dofs": [0, 1, 2]})])] {
        let mut a_in = model_2d(Sup::Inclined, 1, &c);
        // dz alone: u_n = dx sin θ + dz cos θ.
        a_in.supports.get_mut("4").unwrap().dz = Some(u_n / THETA.cos());
        let mut b_in = model_2d(Sup::Rotated, 1, &c);
        b_in.supports.get_mut("4").unwrap().dz = Some(u_n);
        let (a, b) = (solve_2d(&a_in).expect(name), solve_2d(&b_in).expect(name));
        let u4 = disp_2d(&a, 4);
        let n = n2();
        assert_close(&format!("{name}: n·u4"), n[0] * u4[0] + n[1] * u4[1], u_n, u_n.abs(), 1e-9);
        compare_2d(name, &a.displacements, &b.displacements, true);
    }
}

// ─── 3D ────────────────────────────────────────────────────────────────────

/// Rotation turning N3 onto +z (Rodrigues about N3 × z).
fn q3() -> [[f64; 3]; 3] {
    let n = N3;
    let (ax, ay) = (n[1], -n[0]); // n × z = (ny, -nx, 0)
    let s = (ax * ax + ay * ay).sqrt();
    let c = n[2];
    let (kx, ky) = (ax / s, ay / s);
    // R = I + sinφ K + (1 − cosφ) K², K = [k]× with k = (kx, ky, 0)
    let k = [[0.0, 0.0, ky], [0.0, 0.0, -kx], [-ky, kx, 0.0]];
    let mut r = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            let k2: f64 = (0..3).map(|l| k[i][l] * k[l][j]).sum();
            r[i][j] = if i == j { 1.0 } else { 0.0 } + s * k[i][j] + (1.0 - c) * k2;
        }
    }
    r
}

fn mul3(r: &[[f64; 3]; 3], v: [f64; 3]) -> [f64; 3] {
    [0, 1, 2].map(|i| r[i][0] * v[0] + r[i][1] * v[1] + r[i][2] * v[2])
}

fn tr3(r: &[[f64; 3]; 3]) -> [[f64; 3]; 3] {
    [0, 1, 2].map(|i| [0, 1, 2].map(|j| r[j][i]))
}

/// Space frame: portal 1-2-3-4 (fixed at 1, inclined support with normal N3
/// at 4), frame 7-8 fixed at 8. Sections are axisymmetric (iy = iz) so that
/// the rigid turn of the reference does not depend on member local axes.
fn model_3d(sup: Sup, sub: usize, constraints: &dyn Fn(&dyn Fn([f64; 3]) -> [f64; 3]) -> Vec<Value>) -> SolverInput3D {
    model_3d_cfg(N3, q3(), 2, sup, sub, constraints)
}

/// `normal`: the inclined support's normal; `q`: the rigid turn of the
/// reference, taking `normal` onto the global axis `axis` (0, 1, 2), which
/// the reference restrains plainly.
fn model_3d_cfg(
    normal: [f64; 3],
    q: [[f64; 3]; 3],
    axis: usize,
    sup: Sup,
    sub: usize,
    constraints: &dyn Fn(&dyn Fn([f64; 3]) -> [f64; 3]) -> Vec<Value>,
) -> SolverInput3D {
    let rotated = sup == Sup::Rotated;
    let r = move |v: [f64; 3]| if rotated { mul3(&q, v) } else { v };
    let pts = [(1, [0.0, 0.0, 0.0]), (2, [0.0, 0.0, 4.0]), (3, [5.0, 0.0, 4.0]), (4, [5.0, 0.0, 0.0]),
               (7, [6.5, 0.8, 1.0]), (8, [9.0, 0.8, 1.0])];
    let mut nodes = serde_json::Map::new();
    let mut xyz = std::collections::HashMap::new();
    for (id, p) in pts {
        xyz.insert(id, p);
        let p = r(p);
        nodes.insert(id.to_string(), json!({"id": id, "x": p[0], "y": p[1], "z": p[2]}));
    }
    let mut elements = serde_json::Map::new();
    let mut next_node = 100;
    let mut next_elem = 1;
    for (a, b) in [(1, 2), (2, 3), (3, 4), (7, 8)] {
        let (pa, pb) = (xyz[&a], xyz[&b]);
        let mut prev = a;
        for k in 1..=sub {
            let id = if k == sub { b } else {
                let t = k as f64 / sub as f64;
                let p = r([0, 1, 2].map(|i| pa[i] + t * (pb[i] - pa[i])));
                next_node += 1;
                nodes.insert(next_node.to_string(), json!({"id": next_node, "x": p[0], "y": p[1], "z": p[2]}));
                next_node
            };
            elements.insert(next_elem.to_string(), json!({"id": next_elem, "type": "frame",
                "nodeI": prev, "nodeJ": id, "materialId": 1, "sectionId": 1}));
            next_elem += 1;
            prev = id;
        }
    }
    let fixed = |id: usize| json!({"nodeId": id, "rx": true, "ry": true, "rz": true,
                                   "rrx": true, "rry": true, "rrz": true});
    let mut supports = serde_json::Map::new();
    supports.insert("1".into(), fixed(1));
    supports.insert("8".into(), fixed(8));
    match sup {
        Sup::Inclined => {
            supports.insert("4".into(), json!({"nodeId": 4, "rx": false, "ry": false, "rz": true,
                "rrx": false, "rry": false, "rrz": false, "isInclined": true,
                "normalX": normal[0], "normalY": normal[1], "normalZ": normal[2]}));
        }
        Sup::Rotated => {
            supports.insert("4".into(), json!({"nodeId": 4, "rx": axis == 0, "ry": axis == 1, "rz": axis == 2,
                "rrx": false, "rry": false, "rrz": false}));
        }
        Sup::Mpc => {}
    }
    let mut cs = constraints(&r);
    if sup == Sup::Mpc {
        cs.push(json!({"type": "linearMPC", "terms": [
            {"nodeId": 4, "dof": 0, "coefficient": normal[0]},
            {"nodeId": 4, "dof": 1, "coefficient": normal[1]},
            {"nodeId": 4, "dof": 2, "coefficient": normal[2]}]}));
    }
    let loads: Vec<Value> = [(3, [10.0, 6.0, -20.0], [0.0, 1.0, 0.0]), (7, [5.0, -4.0, -30.0], [2.0, 0.0, -1.0]),
                             (2, [4.0, 3.0, 0.0], [0.0, 0.0, 1.5])]
        .iter()
        .map(|&(node, f, m)| {
            let (f, m) = (r(f), r(m));
            json!({"type": "nodal", "data": {"nodeId": node, "fx": f[0], "fy": f[1], "fz": f[2],
                                              "mx": m[0], "my": m[1], "mz": m[2]}})
        })
        .collect();
    serde_json::from_value(json!({
        "nodes": nodes,
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4, "j": 2e-4}},
        "elements": elements,
        "supports": supports,
        "loads": loads,
        "constraints": cs,
    }))
    .unwrap()
}

type Constraints3D = fn(&dyn Fn([f64; 3]) -> [f64; 3]) -> Vec<Value>;

fn cases_3d() -> Vec<(&'static str, Constraints3D, Sup)> {
    vec![
        ("rigid link, master on the inclined node", |_| vec![
            json!({"type": "rigidLink", "masterNode": 4, "slaveNode": 7, "dofs": [0, 1, 2, 3, 4, 5]})], Sup::Mpc),
        ("rigid link, master on the inclined node (rotated)", |_| vec![
            json!({"type": "rigidLink", "masterNode": 4, "slaveNode": 7, "dofs": [0, 1, 2, 3, 4, 5]})], Sup::Rotated),
        ("rigid link, slave on the inclined node", |_| vec![
            json!({"type": "rigidLink", "masterNode": 7, "slaveNode": 4, "dofs": [0, 1, 2, 3, 4, 5]})], Sup::Rotated),
        ("rigid link translations only, slave on the inclined node", |_| vec![
            json!({"type": "rigidLink", "masterNode": 7, "slaveNode": 4, "dofs": [0, 1, 2]})], Sup::Rotated),
        ("equal DOF, master on the inclined node", |_| vec![
            json!({"type": "equalDOF", "masterNode": 4, "slaveNode": 7, "dofs": [0, 1, 2]})], Sup::Mpc),
        ("equal DOF, slave on the inclined node", |_| vec![
            json!({"type": "equalDOF", "masterNode": 7, "slaveNode": 4, "dofs": [0, 1, 2, 3, 4, 5]})], Sup::Rotated),
        ("equal DOF on ux only, slave on the inclined node", |_| vec![
            json!({"type": "equalDOF", "masterNode": 7, "slaveNode": 4, "dofs": [0]})], Sup::Mpc),
        ("equal DOF on uz only, master on the inclined node", |_| vec![
            json!({"type": "equalDOF", "masterNode": 4, "slaveNode": 7, "dofs": [2]})], Sup::Mpc),
        ("eccentric connection, master on the inclined node", |r| {
            let o = r([1.5, 0.8, 1.0]);
            vec![json!({"type": "eccentricConnection", "masterNode": 4, "slaveNode": 7,
                        "offsetX": o[0], "offsetY": o[1], "offsetZ": o[2]})]
        }, Sup::Rotated),
        ("eccentric connection, slave on the inclined node", |r| {
            let o = r([-1.5, -0.8, -1.0]);
            vec![json!({"type": "eccentricConnection", "masterNode": 7, "slaveNode": 4,
                        "offsetX": o[0], "offsetY": o[1], "offsetZ": o[2]})]
        }, Sup::Rotated),
        ("diaphragm, master on the inclined node", |_| vec![
            json!({"type": "diaphragm", "masterNode": 4, "slaveNodes": [7], "plane": "XY"})], Sup::Mpc),
        // n·u4 = 0 eliminates uz4 (largest coefficient), not a diaphragm slave.
        ("diaphragm, slave on the inclined node", |_| vec![
            json!({"type": "diaphragm", "masterNode": 7, "slaveNodes": [4], "plane": "XY"})], Sup::Mpc),
        ("linear MPC on the inclined node's translations", |r| {
            let (a, b, t) = (r([0.3, -0.5, 1.0]), r([1.0, 0.2, -0.4]), r([0.0, 0.7, 0.3]));
            vec![json!({"type": "linearMPC", "terms": [
                {"nodeId": 4, "dof": 0, "coefficient": a[0]}, {"nodeId": 4, "dof": 1, "coefficient": a[1]},
                {"nodeId": 4, "dof": 2, "coefficient": a[2]},
                {"nodeId": 7, "dof": 0, "coefficient": -b[0]}, {"nodeId": 7, "dof": 1, "coefficient": -b[1]},
                {"nodeId": 7, "dof": 2, "coefficient": -b[2]},
                {"nodeId": 7, "dof": 3, "coefficient": t[0]}, {"nodeId": 7, "dof": 4, "coefficient": t[1]},
                {"nodeId": 7, "dof": 5, "coefficient": t[2]}]})]
        }, Sup::Rotated),
    ]
}

fn mpc_reference_3d(name: &str, c: Constraints3D, sub: usize) -> SolverInput3D {
    if name.starts_with("equal DOF on ux only, slave") {
        return model_3d(Sup::Mpc, sub, &|_| vec![
            json!({"type": "equalDOF", "masterNode": 4, "slaveNode": 7, "dofs": [0]})]);
    }
    model_3d(Sup::Mpc, sub, &c)
}

fn disp_3d(res: &AnalysisResults3D, node: usize) -> [f64; 6] {
    let d = res.displacements.iter().find(|d| d.node_id == node).unwrap();
    [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz]
}

fn compare_3d(what: &str, a: &[Displacement3D], b: &[Displacement3D], rotated: bool) {
    let qt = tr3(&q3());
    let scale = a.iter().fold(0.0f64, |m, d| [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz].iter().fold(m, |m, v| m.max(v.abs())));
    assert!(scale > 1e-9, "{what}: no response");
    for db in b {
        let da = a.iter().find(|d| d.node_id == db.node_id).unwrap();
        let (u, t) = ([db.ux, db.uy, db.uz], [db.rx, db.ry, db.rz]);
        let (u, t) = if rotated { (mul3(&qt, u), mul3(&qt, t)) } else { (u, t) };
        let got = [da.ux, da.uy, da.uz, da.rx, da.ry, da.rz];
        let want = [u[0], u[1], u[2], t[0], t[1], t[2]];
        for k in 0..6 {
            assert_close(&format!("{what} node {} dof {k}", db.node_id), got[k], want[k], scale, 1e-8);
        }
    }
}

fn check_support_3d(what: &str, res: &AnalysisResults3D) {
    let u4 = disp_3d(res, 4);
    let scale = res.displacements.iter().fold(0.0f64, |m, d| m.max(d.ux.abs()).max(d.uy.abs()).max(d.uz.abs()));
    assert_close(&format!("{what}: support n·u4"), N3[0] * u4[0] + N3[1] * u4[1] + N3[2] * u4[2], 0.0, scale, 1e-9);
}

#[test]
fn linear_static_3d_constraints_on_inclined_support_match_references() {
    for sub in [1, 6] {
        for (name, c, reference) in cases_3d() {
            let what = format!("sub {sub}, {name}");
            let a = solve_3d(&model_3d(Sup::Inclined, sub, &c)).unwrap_or_else(|e| panic!("{what}: {e}"));
            check_support_3d(&what, &a);
            let b_input = if reference == Sup::Mpc { mpc_reference_3d(name, c, sub) } else { model_3d(reference, sub, &c) };
            let b = solve_3d(&b_input).unwrap_or_else(|e| panic!("{what} reference: {e}"));
            compare_3d(&what, &a.displacements, &b.displacements, reference == Sup::Rotated);
        }
    }
}

#[test]
fn linear_static_3d_rigid_link_holds_at_inclined_support() {
    for (master, slave) in [(4, 7), (7, 4)] {
        let input = model_3d(Sup::Inclined, 1, &|_| vec![
            json!({"type": "rigidLink", "masterNode": master, "slaveNode": slave, "dofs": [0, 1, 2, 3, 4, 5]})]);
        let res = solve_3d(&input).unwrap();
        let (m, s) = (disp_3d(&res, master), disp_3d(&res, slave));
        let (pm, ps) = (&input.nodes[&master.to_string()], &input.nodes[&slave.to_string()]);
        let d = [ps.x - pm.x, ps.y - pm.y, ps.z - pm.z];
        let w = [m[3], m[4], m[5]];
        let wxr = [w[1] * d[2] - w[2] * d[1], w[2] * d[0] - w[0] * d[2], w[0] * d[1] - w[1] * d[0]];
        let scale = m.iter().chain(&s).fold(0.0f64, |a, v| a.max(v.abs()));
        for k in 0..3 {
            assert_close(&format!("{master}->{slave} u{k}"), s[k], m[k] + wxr[k], scale, 1e-10);
            assert_close(&format!("{master}->{slave} r{k}"), s[3 + k], m[3 + k], scale, 1e-10);
        }
        check_support_3d("rigid link", &res);
        let (mut f, mut r) = ([0.0; 3], [0.0; 3]);
        for l in &input.loads {
            if let SolverLoad3D::Nodal(n) = l {
                f[0] += n.fx; f[1] += n.fy; f[2] += n.fz;
            }
        }
        for x in &res.reactions {
            r[0] += x.fx; r[1] += x.fy; r[2] += x.fz;
        }
        for k in 0..3 {
            assert_close(&format!("ΣF{k}"), r[k] + f[k], 0.0, 50.0, 1e-9);
        }
        let r4 = res.reactions.iter().find(|x| x.node_id == 4).unwrap();
        let along = r4.fx * N3[0] + r4.fy * N3[1] + r4.fz * N3[2];
        let mag = (r4.fx * r4.fx + r4.fy * r4.fy + r4.fz * r4.fz).sqrt();
        assert_close("support reaction along the normal", along.abs(), mag, mag, 1e-9);
    }
}

// ─── Every other analysis ──────────────────────────────────────────────────
//
// Each against the rigidly turned model (`Sup::Rotated`), for a rigid link
// with its master on the inclined node (master terms substituted), one with
// its slave there (the support then restrains a master DOF), and a linear MPC.
//
// The ignored ones fail on this branch for a reason that is not the
// constraints: the analysis keeps the mass, geometric stiffness, influence
// vectors or nonlinear tangent in global axes while K is in the support
// frames, so it is wrong for any inclined support (#287, which fixes them;
// 2D buckling and time history come from #279 under it). With #287 merged
// every test here passes. Not here: the 3D co-rotational solver does not
// converge on this frame even with a plain support and no constraint (it
// reports `converged: false`), and staged construction refuses inclined
// supports (tested below).

use dedaliano_engine::certify::buckling::{certify_buckling_2d, certify_buckling_3d, BucklingCertificate};
use dedaliano_engine::certify::modal::{certify_modal_2d, certify_modal_3d};
use dedaliano_engine::certify::solver::{certify_linear_2d, certify_linear_3d};
use dedaliano_engine::solver::harmonic::{solve_harmonic_2d, solve_harmonic_3d, HarmonicInput, HarmonicInput3D};
use dedaliano_engine::solver::reduction::{
    craig_bampton_2d, craig_bampton_3d, guyan_reduce_2d, guyan_reduce_3d, CraigBamptonInput,
    CraigBamptonInput3D, CraigBamptonResult, GuyanInput, GuyanInput3D,
};
use dedaliano_engine::solver::{buckling, kinematic, modal, pdelta, spectral, time_integration};
use std::collections::HashMap;

fn analysis_cases_2d() -> Vec<(&'static str, Constraints2D)> {
    cases_2d().into_iter()
        .filter(|(n, _, r)| *r == Sup::Rotated && (n.starts_with("rigid link, ") || n.starts_with("linear MPC")))
        .map(|(n, c, _)| (n, c))
        .collect()
}

fn analysis_cases_3d() -> Vec<(&'static str, Constraints3D)> {
    cases_3d().into_iter()
        .filter(|(n, _, r)| *r == Sup::Rotated && (n.starts_with("rigid link, ") || n.starts_with("linear MPC")))
        .map(|(n, c, _)| (n, c))
        .collect()
}

fn densities() -> HashMap<String, f64> {
    HashMap::from([("1".to_string(), 7850.0)])
}

/// `va` equals `vb` up to one scale factor and sign (mode normalization).
fn assert_same_shape(what: &str, va: &[f64], vb: &[f64], rel: f64) {
    let s = va.iter().zip(vb).map(|(p, q)| p * q).sum::<f64>() / va.iter().map(|p| p * p).sum::<f64>();
    let scale = vb.iter().fold(0.0f64, |m, v| m.max(v.abs()));
    for (i, (p, q)) in va.iter().zip(vb).enumerate() {
        assert_close(&format!("{what} component {i}"), s * p, *q, scale, rel);
    }
}

/// The inclined model's shape turned into the reference axes, and the
/// reference shape, as flat vectors.
fn shape_pair_2d(a: &[Displacement], b: &[Displacement]) -> (Vec<f64>, Vec<f64>) {
    let (mut va, mut vb) = (Vec::new(), Vec::new());
    for db in b {
        let da = a.iter().find(|d| d.node_id == db.node_id).unwrap();
        let u = rot2(THETA, [da.ux, da.uz]);
        va.extend_from_slice(&[u[0], u[1], da.ry]);
        vb.extend_from_slice(&[db.ux, db.uz, db.ry]);
    }
    (va, vb)
}

fn shape_pair_3d(a: &[Displacement3D], b: &[Displacement3D]) -> (Vec<f64>, Vec<f64>) {
    let q = q3();
    let (mut va, mut vb) = (Vec::new(), Vec::new());
    for db in b {
        let da = a.iter().find(|d| d.node_id == db.node_id).unwrap();
        va.extend_from_slice(&mul3(&q, [da.ux, da.uy, da.uz]));
        va.extend_from_slice(&mul3(&q, [da.rx, da.ry, da.rz]));
        vb.extend_from_slice(&[db.ux, db.uy, db.uz, db.rx, db.ry, db.rz]);
    }
    (va, vb)
}

fn assert_static_2d(what: &str, a: &AnalysisResults, b: &AnalysisResults, rel: f64) {
    check_support_2d(what, a);
    let (va, vb) = shape_pair_2d(&a.displacements, &b.displacements);
    let scale = vb.iter().fold(0.0f64, |m, v| m.max(v.abs()));
    assert!(scale > 1e-9, "{what}: no response");
    for (i, (x, y)) in va.iter().zip(&vb).enumerate() {
        assert_close(&format!("{what} component {i}"), *x, *y, scale, rel);
    }
}

fn assert_static_3d(what: &str, a: &AnalysisResults3D, b: &AnalysisResults3D, rel: f64) {
    check_support_3d(what, a);
    let (va, vb) = shape_pair_3d(&a.displacements, &b.displacements);
    let scale = vb.iter().fold(0.0f64, |m, v| m.max(v.abs()));
    assert!(scale > 1e-9, "{what}: no response");
    for (i, (x, y)) in va.iter().zip(&vb).enumerate() {
        assert_close(&format!("{what} component {i}"), *x, *y, scale, rel);
    }
}

fn json_input<T: serde::de::DeserializeOwned, S: serde::Serialize>(solver: S, extra: Value) -> T {
    let mut v = extra;
    v["solver"] = serde_json::to_value(solver).unwrap();
    serde_json::from_value(v).unwrap()
}

#[test]
fn certificates_linear_static_constraints_on_inclined_supports() {
    for sub in [1, 12] {
        for (name, c) in analysis_cases_2d() {
            let (_, cert) = certify_linear_2d(&model_2d(Sup::Inclined, sub, &c)).expect(name);
            assert!(cert.is_certified(), "2D sub {sub} {name}: {cert:?}");
        }
    }
    for sub in [1, 6] {
        for (name, c) in analysis_cases_3d() {
            let (_, cert) = certify_linear_3d(&model_3d(Sup::Inclined, sub, &c)).expect(name);
            assert!(cert.is_certified(), "3D sub {sub} {name}: {cert:?}");
        }
    }
}

#[test]
fn modal_2d_constraints_on_inclined_roller_match_rotated_model() {
    for sub in [1, 12] {
        for (name, c) in analysis_cases_2d() {
            let a = modal::solve_modal_2d(&model_2d(Sup::Inclined, sub, &c), &densities(), 4).expect(name);
            let b = modal::solve_modal_2d(&model_2d(Sup::Rotated, sub, &c), &densities(), 4).expect(name);
            assert_eq!(a.modes.len(), b.modes.len());
            for (k, (ma, mb)) in a.modes.iter().zip(&b.modes).enumerate() {
                let what = format!("sub {sub} {name} mode {k}");
                assert_close(&format!("{what} frequency"), ma.frequency, mb.frequency, mb.frequency, 1e-8);
                let (va, vb) = shape_pair_2d(&ma.displacements, &mb.displacements);
                assert_same_shape(&what, &va, &vb, 1e-6);
            }
            let cert = certify_modal_2d(&model_2d(Sup::Inclined, sub, &c), &densities(), 3).expect(name);
            assert!(cert.certificate.is_certified(), "sub {sub} {name}: {:?}", cert.certificate);
        }
    }
}

#[test]
fn modal_3d_constraints_on_inclined_support_match_rotated_model() {
    for sub in [1, 6] {
        for (name, c) in analysis_cases_3d() {
            let a = modal::solve_modal_3d(&model_3d(Sup::Inclined, sub, &c), &densities(), 4).expect(name);
            let b = modal::solve_modal_3d(&model_3d(Sup::Rotated, sub, &c), &densities(), 4).expect(name);
            assert_eq!(a.modes.len(), b.modes.len());
            for (k, (ma, mb)) in a.modes.iter().zip(&b.modes).enumerate() {
                let what = format!("sub {sub} {name} mode {k}");
                assert_close(&format!("{what} frequency"), ma.frequency, mb.frequency, mb.frequency, 1e-8);
                let (va, vb) = shape_pair_3d(&ma.displacements, &mb.displacements);
                assert_same_shape(&what, &va, &vb, 1e-6);
            }
            let cert = certify_modal_3d(&model_3d(Sup::Inclined, sub, &c), &densities(), 3).expect(name);
            assert!(cert.certificate.is_certified(), "sub {sub} {name}: {:?}", cert.certificate);
        }
    }
}

fn assert_buckling_certified(what: &str, c: &BucklingCertificate) {
    match c {
        BucklingCertificate::Certified { lambda_lower, lambda_computed, .. } => {
            assert!(*lambda_lower >= 0.999 * lambda_computed, "{what}: {lambda_lower} vs {lambda_computed}");
        }
        other => panic!("{what}: buckling certificate not certified: {other:?}"),
    }
}

#[test]
fn buckling_2d_constraints_on_inclined_roller_match_rotated_model() {
    for sub in [1, 12] {
        for (name, c) in analysis_cases_2d() {
            let a = buckling::solve_buckling_2d(&model_2d(Sup::Inclined, sub, &c), 3).expect(name);
            let b = buckling::solve_buckling_2d(&model_2d(Sup::Rotated, sub, &c), 3).expect(name);
            assert!(!a.modes.is_empty());
            for (k, (ma, mb)) in a.modes.iter().zip(&b.modes).enumerate() {
                let what = format!("sub {sub} {name} mode {k}");
                assert_close(&format!("{what} load factor"), ma.load_factor, mb.load_factor, mb.load_factor, 1e-7);
                let (va, vb) = shape_pair_2d(&ma.displacements, &mb.displacements);
                assert_same_shape(&what, &va, &vb, 1e-5);
            }
            let cert = certify_buckling_2d(&model_2d(Sup::Inclined, sub, &c), 1).expect(name);
            assert_buckling_certified(&format!("sub {sub} {name}"), &cert.certificate);
        }
    }
}

#[test]
fn buckling_3d_constraints_on_inclined_support_match_rotated_model() {
    for sub in [1, 6] {
        for (name, c) in analysis_cases_3d() {
            let a = buckling::solve_buckling_3d(&model_3d(Sup::Inclined, sub, &c), 3).expect(name);
            let b = buckling::solve_buckling_3d(&model_3d(Sup::Rotated, sub, &c), 3).expect(name);
            assert!(!a.modes.is_empty());
            for (k, (ma, mb)) in a.modes.iter().zip(&b.modes).enumerate() {
                let what = format!("sub {sub} {name} mode {k}");
                assert_close(&format!("{what} load factor"), ma.load_factor, mb.load_factor, mb.load_factor, 1e-7);
                let (va, vb) = shape_pair_3d(&ma.displacements, &mb.displacements);
                assert_same_shape(&what, &va, &vb, 1e-5);
            }
            let cert = certify_buckling_3d(&model_3d(Sup::Inclined, sub, &c), 1).expect(name);
            assert_buckling_certified(&format!("sub {sub} {name}"), &cert.certificate);
        }
    }
}

#[test]
fn pdelta_constraints_on_inclined_supports_match_rotated_model() {
    for sub in [1, 12] {
        for (name, c) in analysis_cases_2d() {
            let a = pdelta::solve_pdelta_2d(&model_2d(Sup::Inclined, sub, &c), 30, 1e-10).expect(name);
            let b = pdelta::solve_pdelta_2d(&model_2d(Sup::Rotated, sub, &c), 30, 1e-10).expect(name);
            assert_static_2d(&format!("2D sub {sub} {name}"), &a.results, &b.results, 1e-7);
        }
    }
    for sub in [1, 6] {
        for (name, c) in analysis_cases_3d() {
            let a = pdelta::solve_pdelta_3d(&model_3d(Sup::Inclined, sub, &c), 30, 1e-10).expect(name);
            let b = pdelta::solve_pdelta_3d(&model_3d(Sup::Rotated, sub, &c), 30, 1e-10).expect(name);
            assert_static_3d(&format!("3D sub {sub} {name}"), &a.results, &b.results, 1e-7);
        }
    }
}

#[test]
fn corotational_2d_constraints_on_inclined_roller_match_rotated_model() {
    use dedaliano_engine::solver::corotational::solve_corotational_2d;
    for sub in [1, 12] {
        for (name, c) in analysis_cases_2d() {
            // 1e-8: the subdivided model's increment norm stalls on roundoff just
            // above 1e-10, and since #297 an unconverged co-rotational solve
            // reports the last converged increment, not the abandoned iterate.
            let a = solve_corotational_2d(&model_2d(Sup::Inclined, sub, &c), 50, 1e-8, 4, false).expect(name);
            let b = solve_corotational_2d(&model_2d(Sup::Rotated, sub, &c), 50, 1e-8, 4, false).expect(name);
            assert!(a.converged && b.converged, "sub {sub} {name}: converged {} {}", a.converged, b.converged);
            assert_static_2d(&format!("sub {sub} {name}"), &a.results, &b.results, 1e-6);
        }
    }
}

#[test]
fn material_nonlinear_constraints_on_inclined_supports_match_rotated_model() {
    use dedaliano_engine::solver::material_nonlinear::{solve_nonlinear_material_2d, solve_nonlinear_material_3d};
    let extra = json!({"materialModels": {}, "sectionCapacities": {}, "maxIter": 50, "tolerance": 1e-10, "nIncrements": 3});
    for (name, c) in analysis_cases_2d() {
        let run = |s: Sup| solve_nonlinear_material_2d(&json_input::<NonlinearMaterialInput, _>(model_2d(s, 1, &c), extra.clone())).expect(name);
        assert_static_2d(&format!("2D {name}"), &run(Sup::Inclined).results, &run(Sup::Rotated).results, 1e-6);
    }
    for (name, c) in analysis_cases_3d() {
        let run = |s: Sup| solve_nonlinear_material_3d(&json_input::<NonlinearMaterialInput3D, _>(model_3d(s, 1, &c), extra.clone())).expect(name);
        assert_static_3d(&format!("3D {name}"), &run(Sup::Inclined).results, &run(Sup::Rotated).results, 1e-6);
    }
}

#[test]
fn winkler_constraints_on_inclined_supports_match_rotated_model() {
    use dedaliano_engine::solver::winkler::{solve_winkler_2d, solve_winkler_3d, WinklerInput, WinklerInput3D};
    for (name, c) in analysis_cases_2d() {
        let run = |s: Sup| solve_winkler_2d(&WinklerInput { solver: model_2d(s, 1, &c), foundation_springs: vec![] }).expect(name);
        assert_static_2d(&format!("2D {name}"), &run(Sup::Inclined), &run(Sup::Rotated), 1e-8);
    }
    for (name, c) in analysis_cases_3d() {
        let run = |s: Sup| solve_winkler_3d(&WinklerInput3D { solver: model_3d(s, 1, &c), foundation_springs: vec![] }).expect(name);
        assert_static_3d(&format!("3D {name}"), &run(Sup::Inclined), &run(Sup::Rotated), 1e-8);
    }
}

#[test]
fn cable_constraints_on_inclined_supports_match_rotated_model() {
    use dedaliano_engine::solver::cable::{solve_cable_2d, solve_cable_3d};
    for (name, c) in analysis_cases_2d() {
        let run = |s: Sup| solve_cable_2d(&model_2d(s, 1, &c), &densities(), 30, 1e-10).expect(name);
        assert_static_2d(&format!("2D {name}"), &run(Sup::Inclined).results, &run(Sup::Rotated).results, 1e-7);
    }
    for (name, c) in analysis_cases_3d() {
        let run = |s: Sup| solve_cable_3d(&model_3d(s, 1, &c), &densities(), 30, 1e-10).expect(name);
        assert_static_3d(&format!("3D {name}"), &run(Sup::Inclined).results, &run(Sup::Rotated).results, 1e-7);
    }
}

#[test]
fn time_history_2d_constraints_on_inclined_roller_match_rotated_model() {
    for sub in [1, 12] {
        for (name, c) in analysis_cases_2d() {
            let run = |s: Sup| {
                let solver = model_2d(s, sub, &c);
                let loads = solver.loads.iter().map(|l| match l {
                    SolverLoad::Nodal(n) => n.clone(),
                    _ => unreachable!(),
                }).collect();
                time_integration::solve_time_history_2d(&TimeHistoryInput {
                    solver, densities: densities(), time_step: 0.002, n_steps: 80,
                    method: "newmark".into(), beta: 0.25, gamma: 0.5, alpha: None, damping_xi: Some(0.05),
                    ground_accel: None, ground_direction: None,
                    force_history: Some(vec![TimeForceRecord { time: 0.0, loads: vec![] }, TimeForceRecord { time: 0.04, loads }]),
                }).expect(name)
            };
            let (a, b) = (run(Sup::Inclined), run(Sup::Rotated));
            let scale = b.node_histories.iter().flat_map(|h| h.ux.iter().chain(&h.uz)).fold(0.0f64, |m, v| m.max(v.abs()));
            assert!(scale > 0.0);
            for hb in &b.node_histories {
                let ha = a.node_histories.iter().find(|h| h.node_id == hb.node_id).unwrap();
                for t in 0..hb.ux.len() {
                    let u = rot2(THETA, [ha.ux[t], ha.uz[t]]);
                    let what = format!("sub {sub} {name} node {} step {t}", hb.node_id);
                    assert_close(&format!("{what} ux"), u[0], hb.ux[t], scale, 1e-6);
                    assert_close(&format!("{what} uz"), u[1], hb.uz[t], scale, 1e-6);
                }
            }
        }
    }
}

#[test]
fn time_history_3d_constraints_on_inclined_support_match_rotated_model() {
    let q = q3();
    for sub in [1, 6] {
        for (name, c) in analysis_cases_3d() {
            let run = |s: Sup| {
                let solver = model_3d(s, sub, &c);
                let loads = solver.loads.iter().map(|l| match l {
                    SolverLoad3D::Nodal(n) => n.clone(),
                    _ => unreachable!(),
                }).collect();
                time_integration::solve_time_history_3d(&TimeHistoryInput3D {
                    solver, densities: densities(), time_step: 0.002, n_steps: 80,
                    method: "newmark".into(), beta: 0.25, gamma: 0.5, alpha: None, damping_xi: Some(0.05),
                    ground_accel_x: None, ground_accel_y: None, ground_accel_z: None,
                    force_history: Some(vec![TimeForceRecord3D { time: 0.0, loads: vec![] }, TimeForceRecord3D { time: 0.04, loads }]),
                }).expect(name)
            };
            let (a, b) = (run(Sup::Inclined), run(Sup::Rotated));
            let scale = b.node_histories.iter().flat_map(|h| h.ux.iter().chain(&h.uy).chain(&h.uz)).fold(0.0f64, |m, v| m.max(v.abs()));
            assert!(scale > 0.0);
            for hb in &b.node_histories {
                let ha = a.node_histories.iter().find(|h| h.node_id == hb.node_id).unwrap();
                for t in 0..hb.ux.len() {
                    let u = mul3(&q, [ha.ux[t], ha.uy[t], ha.uz[t]]);
                    for (i, v) in [hb.ux[t], hb.uy[t], hb.uz[t]].into_iter().enumerate() {
                        assert_close(&format!("sub {sub} {name} node {} step {t} u{i}", hb.node_id), u[i], v, scale, 1e-6);
                    }
                }
            }
        }
    }
}

const FREQS: [f64; 4] = [0.5, 2.0, 4.0, 9.0];
// Response nodes 2 and 3: harmonic analysis refuses a response DOF that a
// constraint makes dependent ("Target DOF is dependent"), as node 7's are.

#[test]
fn harmonic_2d_constraints_on_inclined_roller_match_rotated_model() {
    let (s, c) = THETA.sin_cos();
    for sub in [1, 12] {
        for (name, cs) in analysis_cases_2d() {
            for (node, dof) in [(3usize, "x"), (3, "y"), (2, "x"), (2, "y")] {
                let run = |sup: Sup, dof: &str| solve_harmonic_2d(&HarmonicInput {
                    solver: model_2d(sup, sub, &cs), densities: densities(), frequencies: FREQS.to_vec(),
                    damping_ratio: 0.05, response_node_id: node, response_dof: dof.to_string(),
                }).expect(name);
                let a = run(Sup::Inclined, dof);
                let (bx, by) = (run(Sup::Rotated, "x"), run(Sup::Rotated, "y"));
                let (wx, wy) = if dof == "x" { (c, s) } else { (-s, c) };
                let scale = bx.response_points.iter().chain(&by.response_points).fold(0.0f64, |m, p| m.max(p.amplitude));
                assert!(scale > 0.0);
                for (k, p) in a.response_points.iter().enumerate() {
                    let what = format!("sub {sub} {name} node {node} {dof} f {}", p.frequency);
                    let (qx, qy) = (&bx.response_points[k], &by.response_points[k]);
                    assert_close(&format!("{what} re"), p.real, wx * qx.real + wy * qy.real, scale, 1e-6);
                    assert_close(&format!("{what} im"), p.imag, wx * qx.imag + wy * qy.imag, scale, 1e-6);
                }
            }
        }
    }
}

#[test]
fn harmonic_3d_constraints_on_inclined_support_match_rotated_model() {
    let q = q3();
    let axes = ["x", "y", "z"];
    for sub in [1, 6] {
        for (name, cs) in analysis_cases_3d() {
            for node in [3usize, 2] {
                let run = |sup: Sup, dof: &str| solve_harmonic_3d(&HarmonicInput3D {
                    solver: model_3d(sup, sub, &cs), densities: densities(), frequencies: FREQS.to_vec(),
                    damping_ratio: 0.05, response_node_id: node, response_dof: dof.to_string(),
                }).expect(name);
                let refs: Vec<_> = axes.iter().map(|d| run(Sup::Rotated, d)).collect();
                let scale = refs.iter().flat_map(|r| &r.response_points).fold(0.0f64, |m, p| m.max(p.amplitude));
                for (i, dof) in axes.iter().enumerate() {
                    let a = run(Sup::Inclined, dof);
                    let w = [q[0][i], q[1][i], q[2][i]];
                    for (k, p) in a.response_points.iter().enumerate() {
                        let re: f64 = (0..3).map(|j| w[j] * refs[j].response_points[k].real).sum();
                        let im: f64 = (0..3).map(|j| w[j] * refs[j].response_points[k].imag).sum();
                        let what = format!("sub {sub} {name} node {node} {dof} f {}", p.frequency);
                        assert_close(&format!("{what} re"), p.real, re, scale, 1e-6);
                        assert_close(&format!("{what} im"), p.imag, im, scale, 1e-6);
                    }
                }
            }
        }
    }
}

fn spectrum() -> DesignSpectrum {
    DesignSpectrum {
        name: "test".into(),
        points: vec![SpectrumPoint { period: 0.0, sa: 0.4 }, SpectrumPoint { period: 0.5, sa: 1.0 }, SpectrumPoint { period: 3.0, sa: 0.2 }],
        in_g: Some(true),
    }
}

#[test]
fn spectral_2d_constraints_on_inclined_roller_match_rotated_model() {
    // A quarter turn maps the original's X excitation onto the rotated
    // model's Y (spectral analysis excites one global axis at a time).
    let theta = std::f64::consts::FRAC_PI_2;
    for sub in [1, 12] {
        for (name, c) in analysis_cases_2d() {
            let run = |sup: Sup, direction: &str| {
                let solver = model_2d_at(theta, sup, sub, &c);
                let m = modal::solve_modal_2d(&solver, &densities(), 4).expect(name);
                let modes = m.modes.iter().map(|m| SpectralModeInput {
                    frequency: m.frequency, period: m.period, omega: m.omega,
                    displacements: m.displacements.iter().map(|d| SpectralModeDisp { node_id: d.node_id, ux: d.ux, uz: d.uz, ry: d.ry }).collect(),
                    participation_x: m.participation_x, participation_y: m.participation_y,
                    effective_mass_x: m.effective_mass_x, effective_mass_y: m.effective_mass_y,
                }).collect();
                spectral::solve_spectral_2d(&SpectralInput {
                    solver, modes, densities: densities(), spectrum: spectrum(),
                    direction: direction.into(), rule: Some("CQC".into()), xi: Some(0.05),
                    importance_factor: None, reduction_factor: None, total_mass: None,
                }).expect(name)
            };
            let (a, b) = (run(Sup::Inclined, "X"), run(Sup::Rotated, "Y"));
            assert_close(&format!("sub {sub} {name} base shear"), a.base_shear, b.base_shear, b.base_shear, 1e-7);
            let scale = b.element_forces.iter().fold(0.0f64, |m, f| m.max(f.n_max).max(f.v_max).max(f.m_max));
            for fa in &a.element_forces {
                let fb = b.element_forces.iter().find(|f| f.element_id == fa.element_id).unwrap();
                let what = format!("sub {sub} {name} element {}", fa.element_id);
                assert_close(&format!("{what} N"), fa.n_max, fb.n_max, scale, 1e-6);
                assert_close(&format!("{what} V"), fa.v_max, fb.v_max, scale, 1e-6);
                assert_close(&format!("{what} M"), fa.m_max, fb.m_max, scale, 1e-6);
            }
        }
    }
}

fn assert_cb_same(what: &str, a: &CraigBamptonResult, b: &CraigBamptonResult) {
    assert_eq!(a.interior_frequencies.len(), b.interior_frequencies.len(), "{what}");
    for (k, (fa, fb)) in a.interior_frequencies.iter().zip(&b.interior_frequencies).enumerate() {
        assert_close(&format!("{what} interior frequency {k}"), *fa, *fb, *fb, 1e-8);
    }
    let trace = |m: &[f64], n: usize, nb: usize| (0..nb).map(|i| m[i * n + i]).sum::<f64>();
    let (n, nb) = (a.n_reduced, a.n_boundary);
    assert_eq!((n, nb), (b.n_reduced, b.n_boundary), "{what}");
    assert_close(&format!("{what} trace K_bb"), trace(&a.k_reduced, n, nb), trace(&b.k_reduced, n, nb), trace(&b.k_reduced, n, nb), 1e-8);
    assert_close(&format!("{what} trace M_bb"), trace(&a.m_reduced, n, nb), trace(&b.m_reduced, n, nb), trace(&b.m_reduced, n, nb), 1e-8);
}

#[test]
fn craig_bampton_constraints_on_inclined_supports_match_rotated_model() {
    for sub in [1, 12] {
        for (name, c) in analysis_cases_2d() {
            let cb = |s: Sup| craig_bampton_2d(&CraigBamptonInput {
                solver: model_2d(s, sub, &c), boundary_nodes: vec![2], n_modes: 3, densities: densities(),
            }).expect(name);
            assert_cb_same(&format!("2D sub {sub} {name}"), &cb(Sup::Inclined), &cb(Sup::Rotated));
        }
    }
    for sub in [1, 6] {
        for (name, c) in analysis_cases_3d() {
            let cb = |s: Sup| craig_bampton_3d(&CraigBamptonInput3D {
                solver: model_3d(s, sub, &c), boundary_nodes: vec![2], n_modes: 3, densities: densities(),
            }).expect(name);
            assert_cb_same(&format!("3D sub {sub} {name}"), &cb(Sup::Inclined), &cb(Sup::Rotated));
        }
    }
}

#[test]
fn guyan_constraints_on_inclined_supports_match_rotated_model() {
    for sub in [1, 12] {
        for (name, c) in analysis_cases_2d() {
            let g = |s: Sup| guyan_reduce_2d(&GuyanInput { solver: model_2d(s, sub, &c), boundary_nodes: vec![2, 3] }).expect(name);
            let (a, b) = (g(Sup::Inclined), g(Sup::Rotated));
            let (va, vb) = shape_pair_2d(&a.displacements, &b.displacements);
            let scale = vb.iter().fold(0.0f64, |m, v| m.max(v.abs()));
            assert!(scale > 1e-9);
            for (i, (x, y)) in va.iter().zip(&vb).enumerate() {
                assert_close(&format!("2D sub {sub} {name} component {i}"), *x, *y, scale, 1e-8);
            }
        }
    }
    for sub in [1, 6] {
        for (name, c) in analysis_cases_3d() {
            let g = |s: Sup| guyan_reduce_3d(&GuyanInput3D { solver: model_3d(s, sub, &c), boundary_nodes: vec![2, 3] }).expect(name);
            let (a, b) = (g(Sup::Inclined), g(Sup::Rotated));
            let (va, vb) = shape_pair_3d(&a.displacements, &b.displacements);
            let scale = vb.iter().fold(0.0f64, |m, v| m.max(v.abs()));
            assert!(scale > 1e-9);
            for (i, (x, y)) in va.iter().zip(&vb).enumerate() {
                assert_close(&format!("3D sub {sub} {name} component {i}"), *x, *y, scale, 1e-8);
            }
        }
    }
}

#[test]
fn kinematic_constraints_on_inclined_supports_match_rotated_model() {
    for (name, c) in analysis_cases_2d() {
        let (a, b) = (kinematic::analyze_kinematics_2d(&model_2d(Sup::Inclined, 1, &c)),
                      kinematic::analyze_kinematics_2d(&model_2d(Sup::Rotated, 1, &c)));
        assert!(a.is_solvable && b.is_solvable, "2D {name}: {a:?} / {b:?}");
        assert_eq!(a.mechanism_modes, b.mechanism_modes, "2D {name}");
    }
    for (name, c) in analysis_cases_3d() {
        let (a, b) = (kinematic::analyze_kinematics_3d(&model_3d(Sup::Inclined, 1, &c)),
                      kinematic::analyze_kinematics_3d(&model_3d(Sup::Rotated, 1, &c)));
        assert!(a.is_solvable && b.is_solvable, "3D {name}: {a:?} / {b:?}");
        assert_eq!(a.mechanism_modes, b.mechanism_modes, "3D {name}");
    }
}

const FIBER: &str = r#"{"fiberSections": {}, "nIntegrationPoints": 3, "maxIter": 50, "tolerance": 1e-10, "nIncrements": 3, "modifiedNr": false}"#;
const SSI: &str = r#"{"soilSprings": [], "maxIter": 30, "tolerance": 1e-10}"#;
const ARC: &str = r#"{"maxSteps": 1, "maxIter": 30, "initialDs": 0.5, "maxDs": 2.0, "minDs": 1e-6, "targetIter": 5, "tolerance": 1e-7}"#;

fn extra(s: &str) -> Value {
    serde_json::from_str(s).unwrap()
}

#[test]
fn contact_constraints_on_inclined_supports_match_rotated_model() {
    use dedaliano_engine::solver::contact::{solve_contact_2d, solve_contact_3d, ContactInput, ContactInput3D};
    for (name, c) in analysis_cases_2d() {
        let run = |s: Sup| solve_contact_2d(&json_input::<ContactInput, _>(model_2d(s, 1, &c), json!({}))).expect(name).results;
        assert_static_2d(&format!("2D {name}"), &run(Sup::Inclined), &run(Sup::Rotated), 1e-6);
    }
    for (name, c) in analysis_cases_3d() {
        let run = |s: Sup| solve_contact_3d(&json_input::<ContactInput3D, _>(model_3d(s, 1, &c), json!({}))).expect(name).results;
        assert_static_3d(&format!("3D {name}"), &run(Sup::Inclined), &run(Sup::Rotated), 1e-6);
    }
}

#[test]
fn fiber_constraints_on_inclined_supports_match_rotated_model() {
    use dedaliano_engine::solver::fiber_nonlinear::{solve_fiber_nonlinear_2d, solve_fiber_nonlinear_3d, FiberNonlinearInput, FiberNonlinearInput3D};
    for (name, c) in analysis_cases_2d() {
        let run = |s: Sup| solve_fiber_nonlinear_2d(&json_input::<FiberNonlinearInput, _>(model_2d(s, 1, &c), extra(FIBER))).expect(name).results;
        assert_static_2d(&format!("2D {name}"), &run(Sup::Inclined), &run(Sup::Rotated), 1e-6);
    }
    for (name, c) in analysis_cases_3d() {
        let run = |s: Sup| solve_fiber_nonlinear_3d(&json_input::<FiberNonlinearInput3D, _>(model_3d(s, 1, &c), extra(FIBER))).expect(name).results;
        assert_static_3d(&format!("3D {name}"), &run(Sup::Inclined), &run(Sup::Rotated), 1e-6);
    }
}

#[test]
fn ssi_constraints_on_inclined_supports_match_rotated_model() {
    use dedaliano_engine::solver::ssi::{solve_ssi_2d, solve_ssi_3d, SSIInput, SSIInput3D};
    for (name, c) in analysis_cases_2d() {
        let run = |s: Sup| solve_ssi_2d(&json_input::<SSIInput, _>(model_2d(s, 1, &c), extra(SSI))).expect(name).results;
        assert_static_2d(&format!("2D {name}"), &run(Sup::Inclined), &run(Sup::Rotated), 1e-6);
    }
    for (name, c) in analysis_cases_3d() {
        let run = |s: Sup| solve_ssi_3d(&json_input::<SSIInput3D, _>(model_3d(s, 1, &c), extra(SSI))).expect(name).results;
        assert_static_3d(&format!("3D {name}"), &run(Sup::Inclined), &run(Sup::Rotated), 1e-6);
    }
}

#[test]
fn arc_length_2d_constraints_on_inclined_roller_match_rotated_model() {
    use dedaliano_engine::solver::arc_length::{solve_arc_length, ArcLengthInput};
    for (name, c) in analysis_cases_2d() {
        let run = |s: Sup| solve_arc_length(&json_input::<ArcLengthInput, _>(model_2d(s, 1, &c), extra(ARC))).expect(name).results;
        assert_static_2d(&format!("{name}"), &run(Sup::Inclined), &run(Sup::Rotated), 1e-6);
    }
}

#[test]
fn spectral_3d_constraints_on_inclined_support_match_rotated_model() {
    // A quarter turn about Z maps X onto Y: the inclined support's normal is
    // X in the original, a plain Y restraint in the reference.
    let q = [[0.0, -1.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, 1.0]];
    for sub in [1, 6] {
        for (name, c) in analysis_cases_3d() {
            let run = |sup: Sup, direction: &str| {
                let solver = model_3d_cfg([1.0, 0.0, 0.0], q, 1, sup, sub, &c);
                let m = modal::solve_modal_3d(&solver, &densities(), 4).expect(name);
                let modes = m.modes.iter().map(|m| SpectralModeInput3D {
                    frequency: m.frequency, period: m.period, omega: m.omega,
                    displacements: m.displacements.iter().map(|d| SpectralModeDisp3D {
                        node_id: d.node_id, ux: d.ux, uy: d.uy, uz: d.uz, rx: d.rx, ry: d.ry, rz: d.rz,
                    }).collect(),
                    participation_x: m.participation_x, participation_y: m.participation_y, participation_z: m.participation_z,
                    effective_mass_x: m.effective_mass_x, effective_mass_y: m.effective_mass_y, effective_mass_z: m.effective_mass_z,
                }).collect();
                spectral::solve_spectral_3d(&SpectralInput3D {
                    solver, modes, densities: densities(), spectrum: spectrum(), direction: direction.into(),
                    rule: Some("CQC".into()), xi: Some(0.05), importance_factor: None, reduction_factor: None, total_mass: None,
                }).expect(name)
            };
            let (a, b) = (run(Sup::Inclined, "X"), run(Sup::Rotated, "Y"));
            assert_close(&format!("sub {sub} {name} base shear"), a.base_shear, b.base_shear, b.base_shear, 1e-7);
            let scale = b.element_forces.iter().fold(0.0f64, |m, f| m.max(f.n_max).max(f.mx_max));
            for fa in &a.element_forces {
                let fb = b.element_forces.iter().find(|f| f.element_id == fa.element_id).unwrap();
                // Axial force and torsion do not depend on the member's local
                // y/z axes (the sections are axisymmetric, the axes are not).
                let what = format!("sub {sub} {name} element {}", fa.element_id);
                assert_close(&format!("{what} N"), fa.n_max, fb.n_max, scale, 1e-6);
                assert_close(&format!("{what} T"), fa.mx_max, fb.mx_max, scale, 1e-6);
            }
        }
    }
}

/// Staged construction refuses inclined supports outright (its assembly
/// does not rotate K), constraints or not.
#[test]
fn staged_refuses_inclined_supports_with_constraints() {
    use dedaliano_engine::solver::staged::{solve_staged_2d, solve_staged_3d};
    let stage = |n: usize| json!([{"name": "all", "elementsAdded": (1..=n).collect::<Vec<_>>(),
        "elementsRemoved": [], "loadIndices": [0], "supportsAdded": [], "supportsRemoved": [], "prestressLoads": []}]);
    let (name, c) = analysis_cases_2d()[2];
    let m = model_2d(Sup::Inclined, 1, &c);
    let mut v = serde_json::to_value(&m).unwrap();
    v["stages"] = stage(m.elements.len());
    let staged: StagedInput = serde_json::from_value(v).unwrap();
    let err = solve_staged_2d(&staged).expect_err(name);
    assert!(err.contains("nclined"), "{err}");
    let (name, c) = analysis_cases_3d()[2];
    let m = model_3d(Sup::Inclined, 1, &c);
    let mut v = serde_json::to_value(&m).unwrap();
    v["stages"] = stage(m.elements.len());
    let staged: StagedInput3D = serde_json::from_value(v).unwrap();
    let err = solve_staged_3d(&staged).expect_err(name);
    assert!(err.contains("nclined"), "{err}");
}

