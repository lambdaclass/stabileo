//! Checks behind docs/solver/assembly-constraints.md (assembly, supports,
//! constraints, Winkler foundation, soil curves).
//!
//! Each test names the section or discrepancy ID (AC-n) of the document it
//! backs. Tests marked `#[ignore = "open question AC-n: ..."]` assert the
//! behaviour the document argues is correct and fail on the current engine;
//! they are left for review.

use dedaliano_engine::solver::assembly::{inclined_rotation_matrix, inclined_rotation_matrix_2d};
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::solver::soil_curves;
use dedaliano_engine::solver::winkler::{solve_winkler_2d, solve_winkler_3d, WinklerInput, WinklerInput3D};
use dedaliano_engine::types::*;
use serde_json::{json, Value};

fn in2(v: Value) -> SolverInput {
    serde_json::from_value(v).unwrap()
}
fn in3(v: Value) -> SolverInput3D {
    serde_json::from_value(v).unwrap()
}

fn close(what: &str, a: f64, b: f64, rel: f64) {
    let scale = a.abs().max(b.abs()).max(1e-30);
    assert!((a - b).abs() <= rel * scale, "{what}: {a} vs {b}");
}

fn d2(r: &AnalysisResults, id: usize) -> &Displacement {
    r.displacements.iter().find(|d| d.node_id == id).unwrap()
}
fn d3(r: &AnalysisResults3D, id: usize) -> &Displacement3D {
    r.displacements.iter().find(|d| d.node_id == id).unwrap()
}

const MAT: f64 = 200_000.0; // MPa
const E: f64 = MAT * 1000.0; // kN/m2

fn sup3(node: usize, f: [bool; 6]) -> Value {
    json!({"nodeId": node, "rx": f[0], "ry": f[1], "rz": f[2], "rrx": f[3], "rry": f[4], "rrz": f[5]})
}

fn frame2(id: usize, i: usize, j: usize) -> Value {
    json!({"id": id, "type": "frame", "nodeI": i, "nodeJ": j, "materialId": 1, "sectionId": 1,
           "hingeStart": false, "hingeEnd": false})
}
fn frame3(id: usize, i: usize, j: usize) -> Value {
    json!({"id": id, "type": "frame", "nodeI": i, "nodeJ": j, "materialId": 1, "sectionId": 1})
}

fn map_of(items: Vec<(usize, Value)>) -> serde_json::Map<String, Value> {
    items.into_iter().map(|(k, v)| (k.to_string(), v)).collect()
}

// ─── Inclined-support frames (section 4) ────────────────────────────────────

/// The 2D inclined-roller matrix is orthogonal with det = −1 (a reflection,
/// not a rotation: AC-9, DOCUMENTED-CHOICE); row 1 is the restrained normal
/// (sin θ, cos θ). The 3D one is a proper rotation with row 0 = n̂.
#[test]
fn inclined_frames_are_orthogonal() {
    let th = 0.7_f64;
    let r = inclined_rotation_matrix_2d(th);
    let det = r[0][0] * r[1][1] - r[0][1] * r[1][0];
    close("det R2", det, -1.0, 1e-14);
    close("R2 normal x", r[1][0], th.sin(), 1e-14);
    close("R2 normal z", r[1][1], th.cos(), 1e-14);
    for a in 0..2 {
        for b in 0..2 {
            let dot: f64 = (0..2).map(|k| r[a][k] * r[b][k]).sum();
            assert!((dot - if a == b { 1.0 } else { 0.0 }).abs() < 1e-14);
        }
    }
    let n = [0.48, 0.36, 0.8];
    let r3 = inclined_rotation_matrix(n[0], n[1], n[2]);
    for k in 0..3 {
        close("R3 row0 = n", r3[0][k], n[k], 1e-14);
    }
    let det3 = r3[0][0] * (r3[1][1] * r3[2][2] - r3[1][2] * r3[2][1])
        - r3[0][1] * (r3[1][0] * r3[2][2] - r3[1][2] * r3[2][0])
        + r3[0][2] * (r3[1][0] * r3[2][1] - r3[1][1] * r3[2][0]);
    close("det R3", det3, 1.0, 1e-14);
}

/// AC-4 (FIXED): an inclined support that also carries a translational spring.
/// K holds the spring in global axes (added before the rotation), so the
/// reaction must be Rᵀ[R_n,0,0] − k·u in global axes. It used to rotate the
/// global spring forces together with the normal reaction (3D) or drop them
/// (2D), and the reported reactions did not balance the loads.
#[test]
fn inclined_support_with_spring_reactions_balance_3d() {
    let n = [0.0, 0.6, 0.8];
    let mut s2 = sup3(2, [false; 6]);
    let o = s2.as_object_mut().unwrap();
    o.insert("isInclined".into(), json!(true));
    o.insert("normalX".into(), json!(n[0]));
    o.insert("normalY".into(), json!(n[1]));
    o.insert("normalZ".into(), json!(n[2]));
    o.insert("kx".into(), json!(500.0));
    o.insert("ky".into(), json!(300.0));
    o.insert("kz".into(), json!(200.0));
    let input = in3(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 4.0, "y": 0.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4, "j": 2e-4}},
        "elements": {"1": frame3(1, 1, 2)},
        "supports": {"1": sup3(1, [true; 6]), "2": s2},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 10.0, "fy": 5.0, "fz": -20.0, "mx": 0.0, "my": 0.0, "mz": 0.0}}],
    }));
    let r = solve_3d(&input).unwrap();
    let (mut fx, mut fy, mut fz) = (0.0, 0.0, 0.0);
    for re in &r.reactions {
        fx += re.fx;
        fy += re.fy;
        fz += re.fz;
    }
    assert!((fx + 10.0).abs() < 1e-8, "ΣRx = {fx}");
    assert!((fy + 5.0).abs() < 1e-8, "ΣRy = {fy}");
    assert!((fz - 20.0).abs() < 1e-8, "ΣRz = {fz}");
    // The normal component of the node's motion is zero.
    let u = d3(&r, 2);
    assert!((n[0] * u.ux + n[1] * u.uy + n[2] * u.uz).abs() < 1e-12);
}

#[test]
fn inclined_support_with_spring_reactions_balance_2d() {
    let input = in2(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 4.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {"1": frame2(1, 1, 2)},
        "supports": {
            "1": {"id": 1, "nodeId": 1, "type": "fixed"},
            "2": {"id": 2, "nodeId": 2, "type": "inclinedRoller", "angle": 0.4, "kx": 500.0, "ky": 300.0},
        },
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 10.0, "fz": -20.0, "my": 0.0}}],
    }));
    let r = solve_2d(&input).unwrap();
    let fx: f64 = r.reactions.iter().map(|x| x.rx).sum();
    let fz: f64 = r.reactions.iter().map(|x| x.rz).sum();
    assert!((fx + 10.0).abs() < 1e-8, "ΣRx = {fx}");
    assert!((fz - 20.0).abs() < 1e-8, "ΣRz = {fz}");
}

/// AC-10 (OPEN): a prescribed displacement on a DOF that a spring makes free
/// (3D: flag + stiffness) is dropped without a message. The support says
/// "uz = −0.01" and the node does not move.
#[test]
#[ignore = "open question AC-10: settlement on a spring DOF is silently ignored"]
fn settlement_on_spring_dof_is_not_silently_dropped() {
    let mut s2 = sup3(2, [false, false, true, false, false, false]);
    let o = s2.as_object_mut().unwrap();
    o.insert("kz".into(), json!(1000.0));
    o.insert("dz".into(), json!(-0.01));
    let input = in3(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 4.0, "y": 0.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4, "j": 2e-4}},
        "elements": {"1": frame3(1, 1, 2)},
        "supports": {"1": sup3(1, [true; 6]), "2": s2},
        "loads": [],
    }));
    match solve_3d(&input) {
        Err(_) => {}
        Ok(r) => close("uz2 = settlement", d3(&r, 2).uz, -0.01, 1e-9),
    }
}

// ─── 2D in the XZ plane vs 3D (section 2) ──────────────────────────────────

/// A 2D portal and the same portal in the XZ plane of a 3D model (out-of-plane
/// DOFs restrained) agree: ux, uz equal, the 2D rotation is −θy, the 2D
/// reaction moment is −My.
#[test]
fn plane_2d_matches_3d_xz_embedding() {
    let pts = [(1, 0.0, 0.0), (2, 0.0, 4.0), (3, 6.0, 5.0), (4, 6.0, 0.0)];
    let loads2 = json!([
        {"type": "nodal", "data": {"nodeId": 2, "fx": 12.0, "fz": -30.0, "my": 4.0}},
        {"type": "nodal", "data": {"nodeId": 3, "fx": -3.0, "fz": -18.0, "my": -2.0}}]);
    let n2: Vec<(usize, Value)> = pts.iter().map(|&(id, x, z)| (id, json!({"id": id, "x": x, "z": z}))).collect();
    let input2 = in2(json!({
        "nodes": map_of(n2),
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 2e-4}},
        "elements": {"1": frame2(1, 1, 2), "2": frame2(2, 2, 3), "3": frame2(3, 3, 4)},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}, "4": {"id": 4, "nodeId": 4, "type": "pinned"}},
        "loads": loads2,
    }));
    let n3: Vec<(usize, Value)> = pts.iter().map(|&(id, x, z)| (id, json!({"id": id, "x": x, "y": 0.0, "z": z}))).collect();
    // 3D: in-plane bending about global y uses Iy of a member whose local z
    // is ±global y; give Iy = Iz so the local-axis choice does not matter.
    let input3 = in3(json!({
        "nodes": map_of(n3),
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 2e-4, "iz": 2e-4, "j": 1e-4}},
        "elements": {"1": frame3(1, 1, 2), "2": frame3(2, 2, 3), "3": frame3(3, 3, 4)},
        "supports": {
            "1": sup3(1, [true; 6]),
            "2": sup3(2, [false, true, false, true, false, true]),
            "3": sup3(3, [false, true, false, true, false, true]),
            "4": sup3(4, [true, true, true, true, false, true]),
        },
        "loads": [
            {"type": "nodal", "data": {"nodeId": 2, "fx": 12.0, "fy": 0.0, "fz": -30.0, "mx": 0.0, "my": -4.0, "mz": 0.0}},
            {"type": "nodal", "data": {"nodeId": 3, "fx": -3.0, "fy": 0.0, "fz": -18.0, "mx": 0.0, "my": 2.0, "mz": 0.0}}],
    }));
    let r2 = solve_2d(&input2).unwrap();
    let r3 = solve_3d(&input3).unwrap();
    for id in [2, 3, 4] {
        let (a, b) = (d2(&r2, id), d3(&r3, id));
        close(&format!("ux{id}"), a.ux, b.ux, 1e-9);
        close(&format!("uz{id}"), a.uz, b.uz, 1e-9);
        close(&format!("ry{id}"), a.ry, -b.ry, 1e-9);
    }
    let (a, b) = (
        r2.reactions.iter().find(|x| x.node_id == 1).unwrap(),
        r3.reactions.iter().find(|x| x.node_id == 1).unwrap(),
    );
    close("Rx1", a.rx, b.fx, 1e-9);
    close("Rz1", a.rz, b.fz, 1e-9);
    close("M1", a.my, -b.my, 1e-9);
}

// ─── Artificial rotational stiffness (section 3.3) ─────────────────────────

/// A node where every member is hinged gets k_art = 1e-10·max diag K. It
/// carries no moment, so translations equal the hand result exactly: two
/// fixed–pinned cantilevers meeting at the hinge, u = −P/(2·3EI/L³).
#[test]
fn artificial_rotation_stiffness_does_not_change_translations() {
    let (l, iz, p): (f64, f64, f64) = (3.0, 1e-4, 10.0);
    let input = in2(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": l, "z": 0.0}, "3": {"id": 3, "x": 2.0 * l, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": iz}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": true},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1, "hingeStart": true, "hingeEnd": false}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}, "3": {"id": 3, "nodeId": 3, "type": "fixed"}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fz": -p, "my": 0.0}}],
    }));
    let r = solve_2d(&input).unwrap();
    let expect = -p / (2.0 * 3.0 * E * iz / l.powi(3));
    close("uz at hinge", d2(&r, 2).uz, expect, 1e-9);
    assert!(d2(&r, 2).ry.abs() < 1e-12, "artificial DOF rotation {}", d2(&r, 2).ry);
}

/// A moment applied to that artificial DOF is refused, not answered with a
/// rotation of M/k_art.
#[test]
fn moment_on_all_hinged_node_is_refused() {
    let input = in2(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "z": 0.0}, "3": {"id": 3, "x": 6.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": true},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1, "hingeStart": true, "hingeEnd": false}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}, "3": {"id": 3, "nodeId": 3, "type": "fixed"}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fz": 0.0, "my": 5.0}}],
    }));
    assert!(solve_2d(&input).is_err());
}

// ─── Load assembly (section 5) ─────────────────────────────────────────────

/// AC-8 / FR-4 (FIXED, #407): a frame or truss thermal load takes its
/// material's α (`alpha`); without one it keeps α = 12e-6 /°C and says so
/// (`ThermalDefaultAssumed`). A fixed–fixed member under ΔT carries N = −E·A·α·ΔT.
#[test]
fn thermal_load_uses_fixed_alpha() {
    let input = in2(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 5.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {"1": frame2(1, 1, 2)},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}, "2": {"id": 2, "nodeId": 2, "type": "fixed"}},
        "loads": [{"type": "thermal", "data": {"elementId": 1, "dtUniform": 20.0, "dtGradient": 0.0}}],
    }));
    let r = solve_2d(&input).unwrap();
    let rx2 = r.reactions.iter().find(|x| x.node_id == 2).unwrap().rx;
    close("end reaction", rx2.abs(), E * 0.01 * 12e-6 * 20.0, 1e-9);
    assert!(r.structured_diagnostics.iter().any(|d| d.code == DiagnosticCode::ThermalDefaultAssumed));
    let mut stated = input.clone();
    if let SolverLoad::Thermal(t) = &mut stated.loads[0] {
        t.alpha = Some(23e-6);
    }
    let r = solve_2d(&stated).unwrap();
    let rx2 = r.reactions.iter().find(|x| x.node_id == 2).unwrap().rx;
    close("end reaction, aluminium", rx2.abs(), E * 0.01 * 23e-6 * 20.0, 1e-9);
}

// ─── Constraints (section 6) ───────────────────────────────────────────────

/// AC-1 (FIXED): in a 3D model with translations only (3 DOFs per node: truss
/// or cable members alone) the rigid-link, diaphragm and eccentric-connection
/// transforms took the 2D branch (`dofs_per_node <= 3`), read DOF 2 (uz) as
/// the master rotation and wrote u_x,slave = u_x,master − Δy·u_z,master.
#[test]
fn rigid_link_in_translation_only_3d_model() {
    let mut s1 = sup3(1, [false; 6]);
    let o = s1.as_object_mut().unwrap();
    o.insert("kx".into(), json!(1000.0));
    o.insert("ky".into(), json!(1000.0));
    o.insert("kz".into(), json!(1000.0));
    let input = in3(json!({
        "nodes": {
            "1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0},
            "2": {"id": 2, "x": 0.0, "y": 1.0, "z": 0.0},
            "3": {"id": 3, "x": 0.0, "y": 1.0, "z": -1.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4, "j": 2e-4}},
        "elements": {"1": {"id": 1, "type": "truss", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1}},
        "supports": {"1": s1, "3": sup3(3, [true, true, true, false, false, false])},
        "loads": [{"type": "nodal", "data": {"nodeId": 1, "fx": 0.0, "fy": 0.0, "fz": -10.0, "mx": 0.0, "my": 0.0, "mz": 0.0}}],
        "constraints": [{"type": "rigidLink", "masterNode": 1, "slaveNode": 2}],
    }));
    let r = solve_3d(&input).unwrap();
    let (u1, u2) = (d3(&r, 1), d3(&r, 2));
    assert!(u1.uz < -1e-7, "the load moves the master");
    assert!(u2.ux.abs() < 1e-15, "slave ux picked up the master uz: {}", u2.ux);
    close("uz slave = uz master", u2.uz, u1.uz, 1e-12);
}

fn portal_2d(constraints: Value) -> SolverInput {
    in2(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "z": 4.0},
                  "3": {"id": 3, "x": 6.0, "z": 4.0}, "4": {"id": 4, "x": 6.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {"1": frame2(1, 1, 2), "2": frame2(2, 2, 3), "3": frame2(3, 3, 4)},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}, "4": {"id": 4, "nodeId": 4, "type": "fixed"}},
        "loads": [
            {"type": "nodal", "data": {"nodeId": 2, "fx": 10.0, "fz": 0.0, "my": 0.0}},
            {"type": "distributed", "data": {"elementId": 2, "qI": -12.0, "qJ": -12.0}}],
        "constraints": constraints,
    }))
}

fn same_disp_2d(what: &str, a: &AnalysisResults, b: &AnalysisResults) {
    for id in 1..=4 {
        let (x, y) = (d2(a, id), d2(b, id));
        for (c, p, q) in [("ux", x.ux, y.ux), ("uz", x.uz, y.uz), ("ry", x.ry, y.ry)] {
            assert!((p - q).abs() <= 1e-9 * (p.abs().max(q.abs()) + 1e-9), "{what}: node {id} {c}: {p} vs {q}");
        }
    }
}

/// AC-2 (FIXED): a 2D model lives in the XZ plane. A 3D "XZ" diaphragm is the
/// in-plane rigid body (ux, uz, θ); in 2D it used to map to DOFs (0, 2, 4):
/// ux and the rotation slot tied, the master "rotation" DOF 4 nonexistent.
/// It now equals the 2D in-plane diaphragm, which since #397 moves the slave
/// as a rigid body including its rotation (constraints::diaphragm_dofs).
#[test]
fn diaphragm_xz_in_2d_is_the_in_plane_rigid_body() {
    let xz = solve_2d(&portal_2d(json!([{"type": "diaphragm", "masterNode": 2, "slaveNodes": [3], "plane": "XZ"}]))).unwrap();
    // Reference: the in-plane rigid body written out as a rigid link with the
    // rotation tied. (Rigid top on two fixed columns: the sway is
    // F·h³/(24·EI) = 10·4³/(24·2e4) ≈ 1.333e-3, plus the columns' axial
    // shortening.)
    let rl = solve_2d(&portal_2d(json!([{"type": "rigidLink", "masterNode": 2, "slaveNode": 3, "dofs": [0, 1, 2]}]))).unwrap();
    same_disp_2d("XZ diaphragm vs rigid link (ux, uz, θ)", &xz, &rl);
    let ux = d2(&xz, 2).ux;
    assert!((ux - 10.0 * 64.0 / (24.0 * 2e4)).abs() < 0.01 * ux, "sway {ux}");
}

/// AC-2 (FIXED): "YZ" names DOFs a 2D model does not have. It used to tie the
/// 2D rotation; it is now refused by name rather than reinterpreted.
#[test]
fn diaphragm_yz_in_2d_is_refused() {
    let err = solve_2d(&portal_2d(json!([{"type": "diaphragm", "masterNode": 2, "slaveNodes": [3], "plane": "YZ"}]))).unwrap_err();
    assert!(err.contains("YZ") && err.contains("not the plane of a 2D model"), "{err}");
}

/// Column 1–2 fixed at 1, rigid arm 2→3, beam 3–4 on a roller at 4, UDL on
/// the beam. `constraint` links 2 (master) to 3 (slave).
fn arm_2d(constraint: Value) -> SolverInput {
    in2(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "z": 3.0},
                  "3": {"id": 3, "x": 1.0, "z": 3.0}, "4": {"id": 4, "x": 5.0, "z": 3.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {"1": frame2(1, 1, 2), "2": frame2(2, 3, 4)},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}, "4": {"id": 4, "nodeId": 4, "type": "rollerX"}},
        "loads": [{"type": "distributed", "data": {"elementId": 2, "qI": -10.0, "qJ": -10.0}}],
        "constraints": [constraint],
    }))
}

fn arm_3d(constraint: Value) -> SolverInput3D {
    in3(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "y": 0.0, "z": 3.0},
                  "3": {"id": 3, "x": 1.0, "y": 0.0, "z": 3.0}, "4": {"id": 4, "x": 5.0, "y": 0.0, "z": 3.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4, "j": 1e-4}},
        "elements": {"1": frame3(1, 1, 2), "2": frame3(2, 3, 4)},
        "supports": {
            "1": sup3(1, [true; 6]),
            "2": sup3(2, [false, true, false, true, false, true]),
            "3": sup3(3, [false, false, false, true, false, true]),
            "4": sup3(4, [false, true, true, true, false, true]),
        },
        // Local z of a member along +x is +z here (default axes), so the
        // 2D transverse load −10 (local y of the 2D bar = +z) is q_z = −10.
        "loads": [{"type": "distributed", "data": {"elementId": 2, "qYI": 0.0, "qYJ": 0.0, "qZI": -10.0, "qZJ": -10.0}}],
        "constraints": [constraint],
    }))
}

/// Sanity for the AC-3 comparison: with every in-plane DOF listed explicitly,
/// the 2D and 3D rigid links agree.
#[test]
fn rigid_link_explicit_dofs_agree_2d_3d() {
    let r2 = solve_2d(&arm_2d(json!({"type": "rigidLink", "masterNode": 2, "slaveNode": 3, "dofs": [0, 1, 2]}))).unwrap();
    let r3 = solve_3d(&arm_3d(json!({"type": "rigidLink", "masterNode": 2, "slaveNode": 3, "dofs": [0, 1, 2, 3, 4, 5]}))).unwrap();
    for id in [2, 3, 4] {
        close(&format!("ux{id}"), d2(&r2, id).ux, d3(&r3, id).ux, 1e-8);
        close(&format!("uz{id}"), d2(&r2, id).uz, d3(&r3, id).uz, 1e-8);
        close(&format!("ry{id}"), d2(&r2, id).ry, -d3(&r3, id).ry, 1e-8);
    }
}

/// AC-3 (OPEN): an empty `dofs` list on a rigid link means "all translational"
/// (types/input.rs). In 3D that is (ux, uy, uz): the slave rotation stays free
/// (a pinned rigid arm). In 2D the default is 0..3 = (ux, uz, θ): the rotation
/// is tied (a fixed arm). The web passes the same stored link to both, so a
/// 2D and a 3D analysis of the same model disagree.
#[test]
#[ignore = "open question AC-3: default rigid-link DOFs tie the rotation in 2D but not in 3D"]
fn rigid_link_default_dofs_agree_2d_3d() {
    let r2 = solve_2d(&arm_2d(json!({"type": "rigidLink", "masterNode": 2, "slaveNode": 3}))).unwrap();
    let r3 = solve_3d(&arm_3d(json!({"type": "rigidLink", "masterNode": 2, "slaveNode": 3}))).unwrap();
    for id in [2, 3, 4] {
        close(&format!("ux{id}"), d2(&r2, id).ux, d3(&r3, id).ux, 1e-8);
        close(&format!("ry{id}"), d2(&r2, id).ry, -d3(&r3, id).ry, 1e-8);
    }
}

/// AC-5 (OPEN): the default diaphragm plane "XY" is a horizontal floor in the
/// Z-up model (ADR 0001): in 3D it ties ux, uy and θz and leaves the beam free
/// to bend vertically. In 2D the same "XY" ties (ux, uz, θ) — the in-plane
/// rigid body of the XZ model plane — which makes the floor beam rigid. The
/// web passes 3D floor diaphragms to the 2D solver verbatim.
#[test]
#[ignore = "open question AC-5: 2D \"XY\" diaphragm is an in-plane rigid body, 3D \"XY\" is a floor"]
fn floor_diaphragm_agrees_2d_3d() {
    let r2 = solve_2d(&portal_2d(json!([{"type": "diaphragm", "masterNode": 2, "slaveNodes": [3], "plane": "XY"}]))).unwrap();
    let input3 = in3(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "y": 0.0, "z": 4.0},
                  "3": {"id": 3, "x": 6.0, "y": 0.0, "z": 4.0}, "4": {"id": 4, "x": 6.0, "y": 0.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4, "j": 1e-4}},
        "elements": {"1": frame3(1, 1, 2), "2": frame3(2, 2, 3), "3": frame3(3, 3, 4)},
        "supports": {"1": sup3(1, [true; 6]), "4": sup3(4, [true; 6]),
                     "2": sup3(2, [false, true, false, true, false, true]),
                     "3": sup3(3, [false, false, false, true, false, false])},
        "loads": [
            {"type": "nodal", "data": {"nodeId": 2, "fx": 10.0, "fy": 0.0, "fz": 0.0, "mx": 0.0, "my": 0.0, "mz": 0.0}},
            {"type": "distributed", "data": {"elementId": 2, "qYI": 0.0, "qYJ": 0.0, "qZI": -12.0, "qZJ": -12.0}}],
        "constraints": [{"type": "diaphragm", "masterNode": 2, "slaveNodes": [3], "plane": "XY"}],
    }));
    let r3 = solve_3d(&input3).unwrap();
    close("uz3", d2(&r2, 3).uz, d3(&r3, 3).uz, 1e-6);
    close("ry3", d2(&r2, 3).ry, -d3(&r3, 3).ry, 1e-6);
}

/// Rigid-link kinematics u_s = u_m + θ_m × r in 3D, checked on the results
/// of a model whose master turns about all three axes.
#[test]
fn rigid_link_3d_kinematics_hold_in_results() {
    let r_off = [1.5, -0.8, 2.0];
    let input = in3(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "y": 0.0, "z": 3.0},
                  "3": {"id": 3, "x": r_off[0], "y": r_off[1], "z": 3.0 + r_off[2]},
                  "4": {"id": 4, "x": r_off[0] + 3.0, "y": r_off[1], "z": 3.0 + r_off[2]}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 2e-4, "j": 1e-4}},
        "elements": {"1": frame3(1, 1, 2), "2": frame3(2, 3, 4)},
        "supports": {"1": sup3(1, [true; 6])},
        "loads": [{"type": "nodal", "data": {"nodeId": 4, "fx": 3.0, "fy": -4.0, "fz": -7.0, "mx": 1.0, "my": 0.5, "mz": -2.0}}],
        "constraints": [{"type": "rigidLink", "masterNode": 2, "slaveNode": 3, "dofs": [0, 1, 2, 3, 4, 5]}],
    }));
    let r = solve_3d(&input).unwrap();
    let (m, s) = (d3(&r, 2), d3(&r, 3));
    let th = [m.rx, m.ry, m.rz];
    let cross = [
        th[1] * r_off[2] - th[2] * r_off[1],
        th[2] * r_off[0] - th[0] * r_off[2],
        th[0] * r_off[1] - th[1] * r_off[0],
    ];
    let scale = s.ux.abs().max(s.uy.abs()).max(s.uz.abs());
    assert!(scale > 1e-6);
    assert!((s.ux - (m.ux + cross[0])).abs() < 1e-10 * scale);
    assert!((s.uy - (m.uy + cross[1])).abs() < 1e-10 * scale);
    assert!((s.uz - (m.uz + cross[2])).abs() < 1e-10 * scale);
    for (a, b) in [(s.rx, m.rx), (s.ry, m.ry), (s.rz, m.rz)] {
        assert!((a - b).abs() < 1e-12 * scale.max(1.0));
    }
    // Global equilibrium of the reactions with the load.
    let re = &r.reactions[0];
    assert!((re.fx + 3.0).abs() < 1e-8 && (re.fy - 4.0).abs() < 1e-8 && (re.fz - 7.0).abs() < 1e-8);
}

/// A constraint at an inclined support: the reactions, reported in global
/// axes, balance the loads (2D portal, rigid link from the inclined node).
#[test]
fn constraint_with_inclined_support_reactions_balance() {
    let input = in2(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "z": 4.0},
                  "3": {"id": 3, "x": 5.0, "z": 4.0}, "4": {"id": 4, "x": 5.0, "z": 0.0},
                  "7": {"id": 7, "x": 6.5, "z": 1.0}, "8": {"id": 8, "x": 9.0, "z": 1.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {"1": frame2(1, 1, 2), "2": frame2(2, 2, 3), "3": frame2(3, 3, 4), "4": frame2(4, 7, 8)},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}, "8": {"id": 8, "nodeId": 8, "type": "fixed"},
                     "4": {"id": 4, "nodeId": 4, "type": "inclinedRoller", "angle": 0.5}},
        "loads": [{"type": "nodal", "data": {"nodeId": 3, "fx": 10.0, "fz": -20.0, "my": 0.0}},
                  {"type": "nodal", "data": {"nodeId": 7, "fx": 5.0, "fz": -30.0, "my": 2.0}}],
        "constraints": [{"type": "rigidLink", "masterNode": 4, "slaveNode": 7, "dofs": [0, 1, 2]}],
    }));
    let r = solve_2d(&input).unwrap();
    let fx: f64 = r.reactions.iter().map(|x| x.rx).sum();
    let fz: f64 = r.reactions.iter().map(|x| x.rz).sum();
    assert!((fx + 15.0).abs() < 1e-7, "ΣRx = {fx}");
    assert!((fz - 50.0).abs() < 1e-7, "ΣRz = {fz}");
}

// ─── Winkler foundation (section 7) ────────────────────────────────────────

fn winkler_cantilever_3d(ky: f64, kz: f64, fy: f64, fz: f64) -> WinklerInput3D {
    let solver = in3(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "y": 0.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4, "j": 2e-4}},
        "elements": {"1": frame3(1, 1, 2)},
        "supports": {"1": sup3(1, [true; 6])},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fy": fy, "fz": fz, "mx": 0.0, "my": 0.0, "mz": 0.0}}],
    }));
    serde_json::from_value(json!({"solver": solver, "foundationSprings": [{"elementId": 1, "ky": ky, "kz": kz}]})).unwrap()
}

/// AC-6 (FIXED): the consistent Winkler matrix kf·L/420·[156, 22L, 54, −13L; …]
/// assumes θ = +dv/dx (bending about local z). Bending about local y has
/// θy = −dw/dx (frame.rs: sign −1 block), so the translation–rotation
/// couplings change sign. The kz part reused the ky matrix unchanged. A beam
/// with Iy = Iz and ky = kz must respond identically in y and z.
#[test]
fn winkler_3d_kz_matches_ky_by_symmetry() {
    let k = 2.0e4;
    let ry = solve_winkler_3d(&winkler_cantilever_3d(k, 0.0, 10.0, 0.0)).unwrap();
    let rz = solve_winkler_3d(&winkler_cantilever_3d(0.0, k, 0.0, 10.0)).unwrap();
    let (a, b) = (d3(&ry, 2), d3(&rz, 2));
    close("uy (ky) vs uz (kz)", a.uy, b.uz, 1e-10);
    close("θz (ky) vs −θy (kz)", a.rz, -b.ry, 1e-10);
}

/// The consistent foundation matrix reproduces the exact foundation work for a
/// rigid translation: a beam on springs only (no supports transverse) under a
/// central load settles by P/(kf·L) when EI is huge.
#[test]
fn winkler_2d_rigid_beam_settlement() {
    let (l, kf, p) = (4.0, 1.0e4, 20.0);
    let solver = in2(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": l / 2.0, "z": 0.0}, "3": {"id": 3, "x": l, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 1.0, "iz": 1.0e3}},
        "elements": {"1": frame2(1, 1, 2), "2": frame2(2, 2, 3)},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "rollerZ"}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fz": -p, "my": 0.0}}],
    }));
    let w: WinklerInput = serde_json::from_value(json!({"solver": solver,
        "foundationSprings": [{"elementId": 1, "kf": kf}, {"elementId": 2, "kf": kf}]})).unwrap();
    let r = solve_winkler_2d(&w).unwrap();
    for id in 1..=3 {
        close("uniform settlement", d2(&r, id).uz, -p / (kf * l), 1e-6);
    }
}

/// AC-7 (OPEN): Winkler member-end forces are K_e·u − FEF of the bar alone;
/// the foundation stiffness K_f·u of the same member is left out, so at a free
/// end (zero shear and moment) the reported end forces equal −K_f·u.
#[test]
#[ignore = "open question AC-7: Winkler member-end forces omit the foundation term K_f u"]
fn winkler_member_end_forces_include_foundation() {
    let (l, kf, p) = (4.0, 1.0e4, 20.0);
    let solver = in2(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": l / 2.0, "z": 0.0}, "3": {"id": 3, "x": l, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {"1": frame2(1, 1, 2), "2": frame2(2, 2, 3)},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "rollerZ"}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fz": -p, "my": 0.0}}],
    }));
    let w: WinklerInput = serde_json::from_value(json!({"solver": solver,
        "foundationSprings": [{"elementId": 1, "kf": kf}, {"elementId": 2, "kf": kf}]})).unwrap();
    let r = solve_winkler_2d(&w).unwrap();
    let ef = r.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!(ef.v_start.abs() < 1e-6 * p, "free-end shear {}", ef.v_start);
    assert!(ef.m_start.abs() < 1e-6 * p * l, "free-end moment {}", ef.m_start);
}

// ─── Soil curves (section 8) ───────────────────────────────────────────────

/// AC-11 (FIXED): API RP 2A sand p_u uses C1, C2, C3 of Reese, Cox & Koop
/// (1974), with α = φ/2, β = 45° + φ/2, K0 = 0.4, Ka = tan²(45° − φ/2). At
/// φ = 30° they are ≈ 1.9, 2.7, 28.7 (API RP 2A Fig. 6.8.6-1). The engine used
/// tan²φ·tan β, tan²φ, tan φ·tan²β (0.58, 0.33, 1.73): p_u deep 16× low.
#[test]
fn py_sand_ultimate_matches_api_coefficients() {
    let phi_deg: f64 = 30.0;
    let (gamma, d) = (10.0, 1.0);
    let phi = phi_deg.to_radians();
    let alpha = phi / 2.0;
    let beta = std::f64::consts::FRAC_PI_4 + phi / 2.0;
    let k0 = 0.4;
    let ka = (std::f64::consts::FRAC_PI_4 - phi / 2.0).tan().powi(2);
    let c1 = k0 * phi.tan() * beta.sin() / ((beta - phi).tan() * alpha.cos())
        + beta.tan().powi(2) * alpha.tan() / (beta - phi).tan()
        + k0 * beta.tan() * (phi.tan() * beta.sin() - alpha.tan());
    let c2 = beta.tan() / (beta - phi).tan() - ka;
    let c3 = ka * (beta.tan().powi(8) - 1.0) + k0 * phi.tan() * beta.tan().powi(4);
    assert!((c1 - 1.9).abs() < 0.1 && (c2 - 2.67).abs() < 0.05 && (c3 - 28.7).abs() < 0.5, "{c1} {c2} {c3}");
    for depth in [1.0, 5.0, 10.0, 40.0] {
        let pus = (c1 * depth + c2 * d) * gamma * depth;
        let pud = c3 * d * gamma * depth;
        let pu = pus.min(pud);
        // y large: tanh → 1, p → A·p_u; cyclic A = 0.9, static A = max(3 − 0.8 z/D, 0.9).
        let (p, _) = soil_curves::py_sand(phi_deg, gamma, d, depth, soil_curves::SandLoading::Cyclic, 5.0).unwrap();
        close(&format!("cyclic A·p_u at z = {depth}"), p, 0.9 * pu, 1e-9);
        let a_static = (3.0 - 0.8 * depth / d).max(0.9);
        let (p, _) = soil_curves::py_sand(phi_deg, gamma, d, depth, soil_curves::SandLoading::Static, 50.0).unwrap();
        close(&format!("static A·p_u at z = {depth}"), p, a_static * pu, 1e-9);
    }
}

/// AC-12 (FIXED): Matlock (1970) soft clay p_u = min(3 + γ'z/c + J z/D, 9)·c·D
/// with J = 0.25–0.5 (now a required input); the engine omitted the J·z/D
/// term (J = 0), so p_u was low (84 vs 124 kN/m here) between the surface and
/// the depth where it reaches 9cD.
#[test]
fn py_soft_clay_ultimate_includes_j_term() {
    let (su, gamma, d, z, eps50): (f64, f64, f64, f64, f64) = (20.0, 6.0, 1.0, 4.0, 0.01);
    let j = 0.5;
    let pu = ((3.0 * su + gamma * z + j * su * z / d).min(9.0 * su)) * d;
    let (p, _) = soil_curves::py_soft_clay(su, gamma, d, z, eps50, j, 1.0);
    close("p_u", p, pu, 1e-9);
}

/// AC-13 (FIXED): the "stiff clay" curve jumped from 0.5·p_u to p_u at y = y50
/// (the two branches did not meet), and it was not Reese's stiff-clay curve.
/// Now Welch & Reese (1972) stiff clay without free water:
/// p = 0.5 p_u (y/y50)^(1/4) up to 16 y50, p_u beyond (sampled at y/y50 = 0.1,
/// 0.3, 1, 3, 8, 16, linear between) — continuous at both.
#[test]
fn py_stiff_clay_is_continuous() {
    let (su, gamma, d, z, eps50, j) = (100.0, 9.0, 1.0, 3.0, 0.005, 0.5);
    let y50 = 2.5 * eps50 * d;
    for y in [y50, 16.0 * y50] {
        let (pa, _) = soil_curves::py_stiff_clay(su, gamma, d, z, eps50, j, y * (1.0 - 1e-9));
        let (pb, _) = soil_curves::py_stiff_clay(su, gamma, d, z, eps50, j, y * (1.0 + 1e-9));
        close(&format!("p at {}·y50", y / y50), pa, pb, 1e-6);
    }
}

/// AC-14 (FIXED): a 3D "XZ" diaphragm writes u_s = u_m + θy·ŷ × r in the XZ
/// plane: u_x,s = u_x,m + θy·Δz, u_z,s = u_z,m − θy·Δx. The engine used the
/// XY pattern with (Δx, Δz) in place of (Δx, Δy), which flips both signs
/// (XY and YZ are cyclic, XZ is not): a rigid rotation of the floor strained
/// the members tied to it.
#[test]
fn diaphragm_xz_3d_kinematics_hold_in_results() {
    let (dx, dz) = (2.0, 1.0);
    let input = in3(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "y": 0.0, "z": 3.0},
                  "3": {"id": 3, "x": dx, "y": 0.0, "z": 3.0 + dz}, "4": {"id": 4, "x": dx, "y": 0.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4, "j": 1e-4}},
        "elements": {"1": frame3(1, 1, 2), "2": frame3(2, 3, 4)},
        "supports": {"1": sup3(1, [true; 6]), "4": sup3(4, [true; 6]),
                     "2": sup3(2, [false, true, false, true, false, true])},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 10.0, "fy": 0.0, "fz": -5.0, "mx": 0.0, "my": 3.0, "mz": 0.0}}],
        "constraints": [{"type": "diaphragm", "masterNode": 2, "slaveNodes": [3], "plane": "XZ"}],
    }));
    let r = solve_3d(&input).unwrap();
    let (m, s) = (d3(&r, 2), d3(&r, 3));
    assert!(m.ry.abs() > 1e-6, "master must rotate");
    let scale = s.ux.abs().max(s.uz.abs());
    assert!((s.ux - (m.ux + m.ry * dz)).abs() < 1e-10 * scale, "ux: {} vs {}", s.ux, m.ux + m.ry * dz);
    assert!((s.uz - (m.uz - m.ry * dx)).abs() < 1e-10 * scale, "uz: {} vs {}", s.uz, m.uz - m.ry * dx);
}

