//! Every input field the end-to-end re-assembly reads is either modelled or
//! refused: a field it would ignore (a moment on a model without rotations, a
//! load on a missing node or member, a support value its type does not use, a
//! constraint DOF the model does not have) gives `failed` (nothing resists the
//! load) or `outOfScope`, never a certificate of a different model.

use dedaliano_engine::certify::reassembly::{end_to_end_2d, end_to_end_3d, EndToEnd};
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::types::*;

/// Horizontal two-bar truss: pinned at node 1, rollerX at node 3, node 2 in
/// the middle braced by a third bar to node 4 (pinned).
fn truss_2d() -> SolverInput {
    serde_json::from_str(
        r#"{
      "nodes": {"1": {"id":1,"x":0,"z":0}, "2": {"id":2,"x":3,"z":0}, "3": {"id":3,"x":6,"z":0}, "4": {"id":4,"x":3,"z":-3}},
      "materials": {"1": {"id":1,"e":200000,"nu":0.3}},
      "sections": {"1": {"id":1,"a":0.01,"iz":0.0001}},
      "elements": {
        "1": {"id":1,"type":"truss","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1},
        "2": {"id":2,"type":"truss","nodeI":2,"nodeJ":3,"materialId":1,"sectionId":1},
        "3": {"id":3,"type":"truss","nodeI":2,"nodeJ":4,"materialId":1,"sectionId":1}
      },
      "supports": {"1": {"id":1,"nodeId":1,"type":"pinned"}, "2": {"id":2,"nodeId":3,"type":"rollerX"},
                   "3": {"id":3,"nodeId":4,"type":"pinned"}},
      "loads": [{"type":"nodal","data":{"nodeId":2,"fx":10,"fz":-5,"my":0}}]
    }"#,
    )
    .unwrap()
}

/// Portal frame: fixed bases, a beam, loads on the beam.
fn frame_2d() -> SolverInput {
    serde_json::from_str(
        r#"{
      "nodes": {"1": {"id":1,"x":0,"z":0}, "2": {"id":2,"x":0,"z":3}, "3": {"id":3,"x":4,"z":3}, "4": {"id":4,"x":4,"z":0}},
      "materials": {"1": {"id":1,"e":200000,"nu":0.3}},
      "sections": {"1": {"id":1,"a":0.01,"iz":0.0001}},
      "elements": {
        "1": {"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1},
        "2": {"id":2,"type":"frame","nodeI":2,"nodeJ":3,"materialId":1,"sectionId":1},
        "3": {"id":3,"type":"frame","nodeI":3,"nodeJ":4,"materialId":1,"sectionId":1}
      },
      "supports": {"1": {"id":1,"nodeId":1,"type":"fixed"}, "2": {"id":2,"nodeId":4,"type":"fixed"}},
      "loads": [{"type":"nodal","data":{"nodeId":2,"fx":10,"fz":0,"my":0}},
                {"type":"distributed","data":{"elementId":2,"qI":-5,"qJ":-5}}]
    }"#,
    )
    .unwrap()
}

/// The end-to-end status of `edit(base)`. Model-building refusals do not
/// depend on the displacements, so the base model's solve stands in when the
/// engine refuses the edited model.
fn e2e_2d(base: SolverInput, edit: impl FnOnce(&mut SolverInput)) -> EndToEnd {
    let fallback = solve_2d(&base).unwrap();
    let mut input = base;
    edit(&mut input);
    let r = solve_2d(&input).unwrap_or(fallback);
    end_to_end_2d(&input, &input.loads, &r)
}

fn assert_failed(e: EndToEnd, what: &str) {
    match e {
        EndToEnd::Failed { reason } => assert!(reason.contains("nothing resists") || reason.contains("nothing stiffens"), "{what}: {reason}"),
        other => panic!("{what}: expected failed, got {other:?}"),
    }
}

fn assert_out_of_scope(e: EndToEnd, what: &str) {
    assert!(matches!(e, EndToEnd::OutOfScope { .. }), "{what}: expected outOfScope, got {e:?}");
}

fn nodal(node_id: usize, fx: f64, fz: f64, my: f64) -> SolverLoad {
    SolverLoad::Nodal(SolverNodalLoad { node_id, fx, fz, my })
}

#[test]
fn bases_are_certified() {
    for (name, input) in [("truss", truss_2d()), ("frame", frame_2d())] {
        let r = solve_2d(&input).unwrap();
        let e = end_to_end_2d(&input, &input.loads, &r);
        assert!(e.is_certified(), "{name}: {e:?}");
    }
    let input = truss_3d();
    let r = solve_3d(&input).unwrap();
    assert!(end_to_end_3d(&input, &input.loads, &r).is_certified());
    let input = frame_3d();
    let r = solve_3d(&input).unwrap();
    assert!(end_to_end_3d(&input, &input.loads, &r).is_certified());
}

#[test]
fn loads_2d_nothing_resists() {
    // The Codex example: a horizontal truss, pinned + rollerX, fx = 10, my = 5.
    assert_failed(e2e_2d(truss_2d(), |i| i.loads = vec![nodal(2, 10.0, 0.0, 5.0)]), "moment on an all-truss model");
    assert_failed(e2e_2d(frame_2d(), |i| i.loads.push(nodal(99, 1.0, 0.0, 0.0))), "nodal load on a missing node");
    assert_failed(
        e2e_2d(frame_2d(), |i| i.loads.push(SolverLoad::Distributed(SolverDistributedLoad { element_id: 99, q_i: -1.0, q_j: -1.0, a: None, b: None }))),
        "distributed load on a missing element",
    );
    assert_failed(
        e2e_2d(frame_2d(), |i| i.loads.push(SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id: 99, a: 1.0, p: -1.0, px: None, my: None }))),
        "point load on a missing element",
    );
    assert_failed(
        e2e_2d(frame_2d(), |i| i.loads.push(SolverLoad::Thermal(SolverThermalLoad { element_id: 99, dt_uniform: 10.0, dt_gradient: 0.0, alpha: None, depth: None }))),
        "thermal load on a missing element",
    );
}

#[test]
fn support_fields_2d_never_dropped() {
    let set = |node: usize, f: fn(&mut SolverSupport)| {
        move |i: &mut SolverInput| {
            let s = i.supports.values_mut().find(|s| s.node_id == node).unwrap();
            f(s)
        }
    };
    assert_out_of_scope(e2e_2d(truss_2d(), set(1, |s| s.kz = Some(100.0))), "rotational spring, all-truss model");
    assert_out_of_scope(e2e_2d(truss_2d(), set(1, |s| s.dry = Some(0.01))), "prescribed rotation, all-truss model");
    assert_out_of_scope(e2e_2d(frame_2d(), set(1, |s| s.angle = Some(0.3))), "angle on a fixed support");
    assert_out_of_scope(e2e_2d(truss_2d(), set(3, |s| s.dx = Some(0.01))), "dx on a rollerX (x free)");
    assert_out_of_scope(e2e_2d(frame_2d(), set(4, |s| { s.support_type = "pinned".into(); s.dry = Some(0.01) })), "dry on a pinned support");
    assert_out_of_scope(e2e_2d(frame_2d(), set(4, |s| { s.support_type = "spring".into(); s.kx = Some(1e5); s.ky = Some(1e5); s.kz = Some(1e5); s.dz = Some(0.01) })), "dz on a spring support");
    assert_out_of_scope(e2e_2d(frame_2d(), set(4, |s| { s.support_type = "inclinedRoller".into(); s.angle = Some(0.4); s.dry = Some(0.01) })), "dry on an inclined roller");
    assert_out_of_scope(e2e_2d(frame_2d(), set(4, |s| { s.support_type = "inclinedRoller".into(); s.dx = Some(0.01) })), "dx on an inclined roller without angle (rollerX)");
}

#[test]
fn constraint_fields_2d_never_dropped() {
    let add = |c: Constraint| move |i: &mut SolverInput| i.constraints.push(c);
    assert_out_of_scope(e2e_2d(truss_2d(), add(Constraint::RigidLink(RigidLinkConstraint { master_node: 2, slave_node: 4, dofs: vec![] }))), "rigid link with an offset, model without rotations");
    assert_out_of_scope(e2e_2d(truss_2d(), add(Constraint::RigidLink(RigidLinkConstraint { master_node: 2, slave_node: 4, dofs: vec![2] }))), "rigid link on a rotation the model lacks");
    assert_out_of_scope(e2e_2d(truss_2d(), add(Constraint::EqualDOF(EqualDOFConstraint { master_node: 2, slave_node: 4, dofs: vec![2] }))), "equal-DOF on a rotation the model lacks");
    assert_out_of_scope(
        e2e_2d(truss_2d(), add(Constraint::LinearMPC(LinearMPCConstraint { terms: vec![
            MPCTerm { node_id: 2, dof: 0, coefficient: 1.0 },
            MPCTerm { node_id: 2, dof: 2, coefficient: -1.0 },
        ] }))),
        "linear MPC on a rotation the model lacks",
    );
    assert_out_of_scope(
        e2e_2d(truss_2d(), add(Constraint::EccentricConnection(EccentricConnectionConstraint {
            master_node: 2, slave_node: 4, offset_x: 0.5, offset_y: 0.0, offset_z: 0.0, releases: vec![],
        }))),
        "eccentric connection, model without rotations",
    );
    assert_out_of_scope(
        e2e_2d(frame_2d(), add(Constraint::EqualDOF(EqualDOFConstraint { master_node: 2, slave_node: 3, dofs: vec![5] }))),
        "equal-DOF on a DOF index no node has",
    );
}

// ---------------- 3D ----------------

fn truss_3d() -> SolverInput3D {
    serde_json::from_str(
        r#"{
      "nodes": {"1": {"id":1,"x":0,"y":0,"z":0}, "2": {"id":2,"x":3,"y":0,"z":0}, "3": {"id":3,"x":0,"y":3,"z":0},
                "4": {"id":4,"x":1,"y":1,"z":3}},
      "materials": {"1": {"id":1,"e":200000,"nu":0.3}},
      "sections": {"1": {"id":1,"a":0.01,"iy":0.0001,"iz":0.0001,"j":0.00005}},
      "elements": {
        "1": {"id":1,"type":"truss","nodeI":1,"nodeJ":4,"materialId":1,"sectionId":1},
        "2": {"id":2,"type":"truss","nodeI":2,"nodeJ":4,"materialId":1,"sectionId":1},
        "3": {"id":3,"type":"truss","nodeI":3,"nodeJ":4,"materialId":1,"sectionId":1}
      },
      "supports": {
        "1": {"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":false,"rry":false,"rrz":false},
        "2": {"nodeId":2,"rx":true,"ry":true,"rz":true,"rrx":false,"rry":false,"rrz":false},
        "3": {"nodeId":3,"rx":true,"ry":true,"rz":true,"rrx":false,"rry":false,"rrz":false}
      },
      "loads": [{"type":"nodal","data":{"nodeId":4,"fx":5,"fy":3,"fz":-10,"mx":0,"my":0,"mz":0}}]
    }"#,
    )
    .unwrap()
}

fn frame_3d() -> SolverInput3D {
    serde_json::from_str(
        r#"{
      "nodes": {"1": {"id":1,"x":0,"y":0,"z":0}, "2": {"id":2,"x":0,"y":0,"z":3}, "3": {"id":3,"x":4,"y":0,"z":3},
                "4": {"id":4,"x":4,"y":0,"z":0}, "5": {"id":5,"x":4,"y":3,"z":3}, "6": {"id":6,"x":4,"y":3,"z":0}},
      "materials": {"1": {"id":1,"e":200000,"nu":0.3}},
      "sections": {"1": {"id":1,"a":0.01,"iy":0.0001,"iz":0.0001,"j":0.00005}},
      "elements": {
        "1": {"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1},
        "2": {"id":2,"type":"frame","nodeI":2,"nodeJ":3,"materialId":1,"sectionId":1},
        "3": {"id":3,"type":"frame","nodeI":4,"nodeJ":3,"materialId":1,"sectionId":1},
        "4": {"id":4,"type":"frame","nodeI":3,"nodeJ":5,"materialId":1,"sectionId":1},
        "5": {"id":5,"type":"frame","nodeI":6,"nodeJ":5,"materialId":1,"sectionId":1}
      },
      "supports": {
        "1": {"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true},
        "2": {"nodeId":4,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true},
        "3": {"nodeId":6,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}
      },
      "loads": [{"type":"nodal","data":{"nodeId":2,"fx":5,"fy":2,"fz":-10,"mx":0,"my":0,"mz":0}}]
    }"#,
    )
    .unwrap()
}

fn e2e_3d(base: SolverInput3D, edit: impl FnOnce(&mut SolverInput3D)) -> EndToEnd {
    let fallback = solve_3d(&base).unwrap();
    let mut input = base;
    edit(&mut input);
    let r = solve_3d(&input).unwrap_or(fallback);
    end_to_end_3d(&input, &input.loads, &r)
}

fn nodal3(node_id: usize, f: [f64; 6]) -> SolverLoad3D {
    SolverLoad3D::Nodal(SolverNodalLoad3D { node_id, fx: f[0], fy: f[1], fz: f[2], mx: f[3], my: f[4], mz: f[5], bw: None })
}

#[test]
fn loads_3d_nothing_resists() {
    for k in 3..6 {
        let mut f = [0.0; 6];
        f[k] = 5.0;
        assert_failed(e2e_3d(truss_3d(), |i| i.loads.push(nodal3(4, f))), "moment on an all-truss 3D model");
    }
    assert_failed(e2e_3d(frame_3d(), |i| i.loads.push(nodal3(99, [1.0, 0.0, 0.0, 0.0, 0.0, 0.0]))), "load on a missing node");
    assert_failed(
        e2e_3d(frame_3d(), |i| i.loads.push(SolverLoad3D::PointOnElement(SolverPointLoad3D { element_id: 99, a: 1.0, py: 0.0, pz: -1.0 }))),
        "point load on a missing element",
    );
    assert_failed(
        e2e_3d(frame_3d(), |i| i.loads.push(SolverLoad3D::Thermal(SolverThermalLoad3D { element_id: 99, dt_uniform: 5.0, dt_gradient_y: 0.0, dt_gradient_z: 0.0, alpha: None, depth_y: None, depth_z: None }))),
        "thermal load on a missing element",
    );
    assert_failed(
        e2e_3d(frame_3d(), |i| i.loads.push(SolverLoad3D::Distributed(SolverDistributedLoad3D {
            q_xi: 0.0, q_xj: 0.0, element_id: 99, q_yi: 0.0, q_yj: 0.0, q_zi: -1.0, q_zj: -1.0, a: None, b: None,
        }))),
        "distributed load on a missing element",
    );
}

#[test]
fn support_fields_3d_never_dropped() {
    let set = |base: SolverInput3D, node: usize, f: fn(&mut SolverSupport3D)| {
        e2e_3d(base, move |i| f(i.supports.values_mut().find(|s| s.node_id == node).unwrap()))
    };
    assert_out_of_scope(set(frame_3d(), 1, |s| s.rw = Some(true)), "warping restraint");
    assert_out_of_scope(set(frame_3d(), 1, |s| s.kw = Some(10.0)), "warping spring");
    assert_out_of_scope(set(frame_3d(), 1, |s| s.normal_z = Some(1.0)), "normal on a support that is not inclined");
    assert_out_of_scope(set(truss_3d(), 1, |s| s.krx = Some(100.0)), "rotational spring, all-truss model");
    assert_out_of_scope(set(truss_3d(), 1, |s| s.drz = Some(0.01)), "prescribed rotation, all-truss model");
    assert_out_of_scope(set(frame_3d(), 1, |s| { s.rx = false; s.dx = Some(0.01) }), "dx on a free DOF");
    assert_out_of_scope(set(frame_3d(), 1, |s| { s.kz = Some(1e5); s.dz = Some(0.01) }), "dz on a DOF a spring frees");
    assert_out_of_scope(
        set(frame_3d(), 1, |s| {
            s.is_inclined = Some(true);
            s.normal_z = Some(1.0);
            s.rrx = false;
            s.drx = Some(0.01);
        }),
        "prescribed rotation on an inclined support's free rotation",
    );
}

#[test]
fn constraint_fields_3d_never_dropped() {
    let add = |c: Constraint| move |i: &mut SolverInput3D| i.constraints.push(c);
    assert_out_of_scope(
        e2e_3d(truss_3d(), add(Constraint::Diaphragm(DiaphragmConstraint { master_node: 2, slave_nodes: vec![3], plane: "XY".into() }))),
        "diaphragm, model without rotations",
    );
    assert_out_of_scope(
        e2e_3d(truss_3d(), add(Constraint::RigidLink(RigidLinkConstraint { master_node: 2, slave_node: 3, dofs: vec![] }))),
        "rigid link with an offset, model without rotations",
    );
    assert_out_of_scope(
        e2e_3d(truss_3d(), add(Constraint::EqualDOF(EqualDOFConstraint { master_node: 4, slave_node: 1, dofs: vec![3] }))),
        "equal-DOF on a rotation the model lacks",
    );
    assert_out_of_scope(
        e2e_3d(frame_3d(), add(Constraint::EqualDOF(EqualDOFConstraint { master_node: 2, slave_node: 5, dofs: vec![6] }))),
        "equal-DOF on a DOF index no node has",
    );
    assert_out_of_scope(
        e2e_3d(truss_3d(), add(Constraint::LinearMPC(LinearMPCConstraint { terms: vec![
            MPCTerm { node_id: 4, dof: 0, coefficient: 1.0 },
            MPCTerm { node_id: 4, dof: 4, coefficient: -1.0 },
        ] }))),
        "linear MPC on a rotation the model lacks",
    );
}
