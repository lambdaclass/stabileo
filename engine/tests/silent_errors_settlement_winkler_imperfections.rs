//! Silent errors found by the element-derivations review (docs/solver, PR #330), fixed here:
//!
//! - AC-10: a prescribed displacement on a DOF the support leaves free was dropped without a
//!   message. It is now refused, naming the support and the value.
//! - AC-7: Winkler member forces left out the bed (K_f·u). They now include it, and the bed
//!   reaction is reported with the member loads; checked against Hetényi's beam on an elastic
//!   foundation.
//! - The Winkler solves built the prescribed displacements with their own mapping, without the
//!   inclined-roller projection; they now share the linear solve's.
//! - NL-9, NL-10, NL-11: the imperfection analysis could do nothing without a word: 3D notional
//!   loads looked for gravity along Y, member loads were not counted, residual stresses and
//!   initial displacements were read and dropped.

use dedaliano_engine::solver::imperfections::{
    notional_loads_2d, notional_loads_3d, solve_with_imperfections_2d, solve_with_imperfections_3d,
};
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::solver::winkler::{solve_winkler_2d, solve_winkler_3d, WinklerInput, WinklerInput3D};
use dedaliano_engine::types::*;
use serde_json::{json, Value};

const MAT: f64 = 200_000.0; // MPa
const E: f64 = MAT * 1000.0; // kN/m²

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
fn frame2(id: usize, i: usize, j: usize) -> Value {
    json!({"id": id, "type": "frame", "nodeI": i, "nodeJ": j, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false})
}
fn frame3(id: usize, i: usize, j: usize) -> Value {
    json!({"id": id, "type": "frame", "nodeI": i, "nodeJ": j, "materialId": 1, "sectionId": 1})
}
fn sup3(node: usize, f: [bool; 6]) -> Value {
    json!({"nodeId": node, "rx": f[0], "ry": f[1], "rz": f[2], "rrx": f[3], "rry": f[4], "rrz": f[5]})
}
fn refused(r: Result<impl std::fmt::Debug, String>, needle: &str) -> String {
    match r {
        Err(e) => {
            assert!(e.contains(needle), "refusal should say '{needle}': {e}");
            e
        }
        Ok(v) => panic!("expected a refusal containing '{needle}', got a result: {v:?}"),
    }
}

// ─── AC-10: settlements are applied or refused ──────────────────────────────

/// Cantilever 1–2 along X in 2D, `sup2` at node 2.
fn cantilever_2d(sup2: Value, loads: Value) -> SolverInput {
    in2(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 4.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {"1": frame2(1, 1, 2)},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}, "2": sup2},
        "loads": loads,
    }))
}

fn cantilever_3d(sup2: Value) -> SolverInput3D {
    in3(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 4.0, "y": 0.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4, "j": 2e-4}},
        "elements": {"1": frame3(1, 1, 2)},
        "supports": {"1": sup3(1, [true; 6]), "2": sup2},
        "loads": [],
    }))
}

/// Control: a settlement on a restrained DOF is imposed (2D and 3D).
#[test]
fn settlement_on_a_restrained_dof_is_applied() {
    let r = solve_2d(&cantilever_2d(json!({"id": 2, "nodeId": 2, "type": "pinned", "dz": -0.01}), json!([]))).unwrap();
    let d = r.displacements.iter().find(|d| d.node_id == 2).unwrap();
    close("2D uz = dz", d.uz, -0.01, 1e-12);
    let mut s = sup3(2, [false, false, true, false, false, false]);
    s.as_object_mut().unwrap().insert("dz".into(), json!(-0.01));
    let r = solve_3d(&cantilever_3d(s)).unwrap();
    close("3D uz = dz", r.displacements.iter().find(|d| d.node_id == 2).unwrap().uz, -0.01, 1e-12);
}

/// AC-10: 3D flag + positive spring frees the DOF; the settlement used to vanish (the node
/// did not move). Same model as derivation_assembly_constraints.rs's ignored
/// `settlement_on_spring_dof_is_not_silently_dropped`.
#[test]
fn settlement_on_a_3d_spring_dof_is_refused() {
    let mut s = sup3(2, [false, false, true, false, false, false]);
    let o = s.as_object_mut().unwrap();
    o.insert("kz".into(), json!(1000.0));
    o.insert("dz".into(), json!(-0.01));
    let e = refused(solve_3d(&cantilever_3d(s)), "would not be applied");
    assert!(e.contains("dz") && e.contains("spring"), "{e}");
}

#[test]
fn settlement_on_an_unflagged_3d_dof_is_refused() {
    let mut s = sup3(2, [false, false, true, false, false, false]);
    s.as_object_mut().unwrap().insert("dy".into(), json!(0.005));
    refused(solve_3d(&cantilever_3d(s)), "dy = 0.005");
    // A rotation too.
    let mut s = sup3(2, [false, false, true, false, false, false]);
    s.as_object_mut().unwrap().insert("dry".into(), json!(0.001));
    refused(solve_3d(&cantilever_3d(s)), "dry");
}

/// AC-10: a 2D `pinned` leaves the rotation free; its `dry` was dropped.
#[test]
fn rotation_on_a_2d_pinned_support_is_refused() {
    let e = refused(
        solve_2d(&cantilever_2d(json!({"id": 2, "nodeId": 2, "type": "pinned", "dry": 0.002}), json!([]))),
        "would not be applied",
    );
    assert!(e.contains("Support 2") && e.contains("dry"), "{e}");
}

#[test]
fn settlement_on_a_2d_spring_support_is_refused() {
    refused(
        solve_2d(&cantilever_2d(json!({"id": 2, "nodeId": 2, "type": "spring", "ky": 1000.0, "dz": -0.01}), json!([]))),
        "spring",
    );
    // A roller along X restrains uz only: dx is dropped.
    refused(solve_2d(&cantilever_2d(json!({"id": 2, "nodeId": 2, "type": "rollerX", "dx": 0.01}), json!([]))), "dx");
}

/// A truss-only 2D model has no rotation DOF: a `dry` on its support went nowhere.
#[test]
fn rotation_in_a_truss_only_model_is_refused() {
    let input = in2(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "z": 0.0}, "3": {"id": 3, "x": 1.5, "z": 2.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {"1": {"id": 1, "type": "truss", "nodeI": 1, "nodeJ": 3, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false},
                     "2": {"id": 2, "type": "truss", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed", "dry": 0.01}, "2": {"id": 2, "nodeId": 2, "type": "pinned"}},
        "loads": [{"type": "nodal", "data": {"nodeId": 3, "fx": 0.0, "fz": -10.0, "my": 0.0}}],
    }));
    refused(solve_2d(&input), "no rotation DOFs");
}

/// An inclined roller restrains its normal only. Its settlement is the ground's movement in
/// global axes, of which the normal part acts and the rest is the roller sliding (documented,
/// not a drop). A rotation on it is free, and refused.
#[test]
fn inclined_roller_settlement_normal_applied_rotation_refused() {
    let theta: f64 = 30f64.to_radians();
    let (s, c) = (theta.sin(), theta.cos());
    let along = |dn: f64, dt: f64| json!({"id": 2, "nodeId": 2, "type": "inclinedRoller", "angle": theta,
        // normal (sin θ, cos θ), tangent (−cos θ, sin θ)
        "dx": dn * s - dt * c, "dz": dn * c + dt * s});
    let r = solve_2d(&cantilever_2d(along(-0.004, 0.003), json!([]))).unwrap();
    let d = r.displacements.iter().find(|d| d.node_id == 2).unwrap();
    close("normal displacement = normal part of the settlement", d.ux * s + d.uz * c, -0.004, 1e-9);
    refused(
        solve_2d(&cantilever_2d(json!({"id": 2, "nodeId": 2, "type": "inclinedRoller", "angle": theta, "dry": 0.001}), json!([]))),
        "leaves the rotation free",
    );
}

#[test]
fn inclined_3d_settlement_normal_applied_free_rotation_refused() {
    let inclined = |extra: &[(&str, Value)]| {
        let mut s = sup3(2, [false; 6]);
        let o = s.as_object_mut().unwrap();
        o.insert("isInclined".into(), json!(true));
        o.insert("normalX".into(), json!(0.0));
        o.insert("normalY".into(), json!(0.6));
        o.insert("normalZ".into(), json!(0.8));
        for (k, v) in extra {
            o.insert((*k).into(), v.clone());
        }
        s
    };
    let r = solve_3d(&cantilever_3d(inclined(&[("dz", json!(-0.01)), ("dx", json!(0.002))]))).unwrap();
    let d = r.displacements.iter().find(|d| d.node_id == 2).unwrap();
    close("normal displacement = n·d", 0.6 * d.uy + 0.8 * d.uz, 0.8 * -0.01, 1e-9);
    refused(solve_3d(&cantilever_3d(inclined(&[("drx", json!(0.001))]))), "rotation is not restrained");
}

/// The Winkler solves now share the linear solve's prescribed displacements: at an inclined
/// roller the settlement is projected on the normal (the plain mapping wrote dz into the
/// rotated normal slot and dropped dx). With no bed the Winkler and linear solves agree.
#[test]
fn winkler_inclined_roller_settlement_matches_linear() {
    let theta: f64 = 30f64.to_radians();
    let input = in2(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 2.0, "z": 0.0}, "3": {"id": 3, "x": 4.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {"1": frame2(1, 1, 2), "2": frame2(2, 2, 3)},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"},
                     "3": {"id": 3, "nodeId": 3, "type": "inclinedRoller", "angle": theta,
                           "dx": -0.004 * theta.sin(), "dz": -0.004 * theta.cos()}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fz": -10.0, "my": 0.0}}],
    }));
    let lin = solve_2d(&input).unwrap();
    let w: WinklerInput = serde_json::from_value(json!({"solver": input, "foundationSprings": [{"elementId": 1, "kf": 0.0}]})).unwrap();
    let wk = solve_winkler_2d(&w).unwrap();
    for id in 1..=3 {
        let (a, b) = (lin.displacements.iter().find(|d| d.node_id == id).unwrap(), wk.displacements.iter().find(|d| d.node_id == id).unwrap());
        close(&format!("ux{id}"), b.ux, a.ux, 1e-9);
        close(&format!("uz{id}"), b.uz, a.uz, 1e-9);
        close(&format!("ry{id}"), b.ry, a.ry, 1e-9);
    }
}

// ─── AC-7: Winkler member forces include the bed ────────────────────────────

const EI_I: f64 = 1e-4; // m⁴, EI = 2e4 kN·m²
const KF: f64 = 1e4; // kN/m/m

/// A long free–free beam on a Winkler bed with a central load P, n elements, along X.
/// λ = (k/4EI)^¼ ≈ 0.595 /m; the half-length (20 m) is λx ≈ 12 ≫ π, so the beam is
/// effectively infinite (Hetényi): w₀ = Pλ/2k, M₀ = P/4λ, V = ∓P/2 beside the load.
fn hetenyi_2d(n: usize, p: f64) -> (WinklerInput, usize) {
    let l = 40.0;
    let mut nodes = serde_json::Map::new();
    let mut elems = serde_json::Map::new();
    let mut springs = vec![];
    for k in 0..=n {
        nodes.insert((k + 1).to_string(), json!({"id": k + 1, "x": l * k as f64 / n as f64, "z": 0.0}));
    }
    for k in 1..=n {
        elems.insert(k.to_string(), frame2(k, k, k + 1));
        springs.push(json!({"elementId": k, "kf": KF}));
    }
    let mid = n / 2 + 1;
    let solver = json!({
        "nodes": nodes, "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": EI_I}}, "elements": elems,
        "supports": {"1": {"id": 1, "nodeId": mid, "type": "rollerZ"}},
        "loads": [{"type": "nodal", "data": {"nodeId": mid, "fx": 0.0, "fz": -p, "my": 0.0}}],
    });
    (serde_json::from_value(json!({"solver": solver, "foundationSprings": springs})).unwrap(), mid)
}

fn lambda() -> f64 {
    (KF / (4.0 * E * EI_I)).powf(0.25)
}

#[test]
fn winkler_2d_member_forces_match_hetenyi() {
    let p = 100.0;
    let (w, mid) = hetenyi_2d(160, p);
    let r = solve_winkler_2d(&w).unwrap();
    let lam = lambda();
    let ef = |id: usize| r.element_forces.iter().find(|e| e.element_id == id).unwrap();
    let (left, right) = (ef(mid - 1), ef(mid));
    let w0 = r.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;
    close("w0 = Pλ/2k", -w0, p * lam / (2.0 * KF), 2e-3);
    close("M0 left = P/4λ", left.m_end.abs(), p / (4.0 * lam), 2e-3);
    close("M0 right = P/4λ", right.m_start.abs(), p / (4.0 * lam), 2e-3);
    close("V beside the load = P/2 (left)", left.v_end.abs(), p / 2.0, 2e-3);
    close("V beside the load = P/2 (right)", right.v_start.abs(), p / 2.0, 2e-3);
    // Away from the load, by Hetényi: M(x) = P/4λ · e^{−λx}(cos λx − sin λx).
    let x: f64 = 2.0; // 8 elements of 0.25 m to the right of the load
    let m_x = p / (4.0 * lam) * (-lam * x).exp() * ((lam * x).cos() - (lam * x).sin());
    close("M(2 m)", ef(mid + 8).m_start.abs(), m_x.abs(), 5e-3);
}

/// Every interior node without a load: the shear and the moment carry on from one member to
/// the next; each member closes its own diagram with the reported bed reaction.
#[test]
fn winkler_2d_member_forces_are_continuous_and_close() {
    let p = 100.0;
    let (w, mid) = hetenyi_2d(40, p);
    let r = solve_winkler_2d(&w).unwrap();
    let ef = |id: usize| r.element_forces.iter().find(|e| e.element_id == id).unwrap();
    for k in 1..40 {
        let (a, b) = (ef(k), ef(k + 1));
        let node_load = if k + 1 == mid { -p } else { 0.0 };
        assert!((b.v_start - (a.v_end + node_load)).abs() < 1e-6 * p, "shear at node {}: {} then {}", k + 1, a.v_end, b.v_start);
        assert!((b.m_start - a.m_end).abs() < 1e-6 * p, "moment at node {}: {} then {}", k + 1, a.m_end, b.m_start);
    }
    // Free ends: no shear, no moment.
    assert!(ef(1).v_start.abs() < 1e-6 * p && ef(1).m_start.abs() < 1e-6 * p, "free end: {:?}", (ef(1).v_start, ef(1).m_start));
    assert!(ef(40).v_end.abs() < 1e-6 * p && ef(40).m_end.abs() < 1e-6 * p, "free end: {:?}", (ef(40).v_end, ef(40).m_end));
    // Each member: v_end − v_start = ∫q, with q the reported loads (here the bed reaction).
    for e in &r.element_forces {
        let total: f64 = e.distributed_loads.iter().map(|d| (d.q_i + d.q_j) / 2.0 * (d.b - d.a)).sum();
        assert!((e.v_end - e.v_start - total).abs() < 2e-4 * p, "element {}: Δv {} vs ∫q {}", e.element_id, e.v_end - e.v_start, total);
    }
    // Global: the bed carries the whole load.
    let bed: f64 = r.element_forces.iter().flat_map(|e| e.distributed_loads.iter()).map(|d| (d.q_i + d.q_j) / 2.0 * (d.b - d.a)).sum();
    close("bed reaction = P", bed, p, 1e-3);
}

/// AC-7's own case (derivation_assembly_constraints.rs, ignored there): two elements on a bed,
/// load at the middle node: the free end reports zero shear and moment.
#[test]
fn winkler_member_end_forces_include_foundation() {
    let (l, kf, p) = (4.0, 1.0e4, 20.0);
    let solver = json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": l / 2.0, "z": 0.0}, "3": {"id": 3, "x": l, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {"1": frame2(1, 1, 2), "2": frame2(2, 2, 3)},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "rollerZ"}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fz": -p, "my": 0.0}}],
    });
    let w: WinklerInput = serde_json::from_value(json!({"solver": solver,
        "foundationSprings": [{"elementId": 1, "kf": kf}, {"elementId": 2, "kf": kf}]})).unwrap();
    let r = solve_winkler_2d(&w).unwrap();
    let ef = r.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!(ef.v_start.abs() < 1e-6 * p, "free-end shear {}", ef.v_start);
    assert!(ef.m_start.abs() < 1e-6 * p * l, "free-end moment {}", ef.m_start);
}

/// The same Hetényi beam in 3D, bedded in local y (ky) and in local z (kz), loaded in each in
/// turn: the member forces match the closed form, and the free ends are free.
fn hetenyi_3d(n: usize, fy: f64, fz: f64) -> (WinklerInput3D, usize) {
    let l = 40.0;
    let mut nodes = serde_json::Map::new();
    let mut elems = serde_json::Map::new();
    let mut springs = vec![];
    for k in 0..=n {
        nodes.insert((k + 1).to_string(), json!({"id": k + 1, "x": l * k as f64 / n as f64, "y": 0.0, "z": 0.0}));
    }
    for k in 1..=n {
        elems.insert(k.to_string(), frame3(k, k, k + 1));
        springs.push(json!({"elementId": k, "ky": KF, "kz": KF}));
    }
    let mid = n / 2 + 1;
    let solver = json!({
        "nodes": nodes, "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": EI_I, "iz": EI_I, "j": 2e-4}}, "elements": elems,
        // Axial and torsion held at the loaded node; bending is carried by the bed.
        "supports": {"1": sup3(mid, [true, false, false, true, false, false])},
        "loads": [{"type": "nodal", "data": {"nodeId": mid, "fx": 0.0, "fy": fy, "fz": fz, "mx": 0.0, "my": 0.0, "mz": 0.0}}],
    });
    (serde_json::from_value(json!({"solver": solver, "foundationSprings": springs})).unwrap(), mid)
}

#[test]
fn winkler_3d_member_forces_match_hetenyi_in_y_and_z() {
    let p = 100.0;
    let lam = lambda();
    for (fy, fz) in [(-p, 0.0), (0.0, -p)] {
        let (w, mid) = hetenyi_3d(160, fy, fz);
        let r = solve_winkler_3d(&w).unwrap();
        let ef = |id: usize| r.element_forces.iter().find(|e| e.element_id == id).unwrap();
        let (left, right, first, last) = (ef(mid - 1), ef(mid), ef(1), ef(160));
        let (m_l, m_r, v_l, v_r) = if fy != 0.0 {
            (left.mz_end, right.mz_start, left.vy_end, right.vy_start)
        } else {
            (left.my_end, right.my_start, left.vz_end, right.vz_start)
        };
        let tag = if fy != 0.0 { "y" } else { "z" };
        close(&format!("{tag}: M0 left"), m_l.abs(), p / (4.0 * lam), 2e-3);
        close(&format!("{tag}: M0 right"), m_r.abs(), p / (4.0 * lam), 2e-3);
        close(&format!("{tag}: V left"), v_l.abs(), p / 2.0, 2e-3);
        close(&format!("{tag}: V right"), v_r.abs(), p / 2.0, 2e-3);
        for v in [first.vy_start, first.vz_start, first.my_start, first.mz_start, last.vy_end, last.vz_end, last.my_end, last.mz_end] {
            assert!(v.abs() < 1e-6 * p, "{tag}: free end not free: {v}");
        }
        // Continuity of the bending moment across every unloaded node.
        for k in 1..160 {
            if k + 1 == mid { continue; }
            let (a, b) = (ef(k), ef(k + 1));
            assert!((b.my_start - a.my_end).abs() < 1e-6 * p && (b.mz_start - a.mz_end).abs() < 1e-6 * p, "{tag}: moment jumps at node {}", k + 1);
            assert!((b.vy_start - a.vy_end).abs() < 1e-6 * p && (b.vz_start - a.vz_end).abs() < 1e-6 * p, "{tag}: shear jumps at node {}", k + 1);
        }
    }
}

/// A released end is not condensed for the bed (the bed would follow the node's rotation):
/// refused instead of reporting a moment at the hinge.
#[test]
fn winkler_on_a_hinged_member_is_refused() {
    let (mut w, _) = hetenyi_2d(4, 10.0);
    w.solver.elements.get_mut("1").unwrap().hinge_end = true;
    refused(solve_winkler_2d(&w), "hinged end");
    let (mut w, _) = hetenyi_3d(4, 0.0, -10.0);
    w.solver.elements.get_mut("2").unwrap().release_my_start = true;
    refused(solve_winkler_3d(&w), "releases the bending");
}

// ─── NL-9, NL-10, NL-11: imperfections apply or refuse ──────────────────────

fn column_3d(loads: Value) -> SolverInput3D {
    in3(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "y": 0.0, "z": 3.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-5, "iz": 1e-5, "j": 2e-5}},
        "elements": {"1": frame3(1, 1, 2)},
        "supports": {"1": sup3(1, [true; 6])},
        "loads": loads,
    }))
}

fn imp(v: Value) -> ImperfectionInput {
    serde_json::from_value(v).unwrap()
}

/// NL-9: the default gravity axis is Z in 3D (Z up). It was Y, so a default 3D definition
/// found no gravity and the analysis ran without notional loads.
#[test]
fn notional_loads_3d_default_gravity_is_z() {
    let input = column_3d(json!([{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fy": 0.0, "fz": -100.0, "mx": 0.0, "my": 0.0, "mz": 0.0}}]));
    let def: NotionalLoadDef = serde_json::from_str(r#"{"ratio": 0.005}"#).unwrap();
    let fx: f64 = notional_loads_3d(&input, &def).iter().map(|l| match l { SolverLoad3D::Nodal(n) => n.fx, _ => 0.0 }).sum();
    close("notional lateral load", fx, 0.5, 1e-12);
    // Through the analysis: the column sways.
    let r = solve_with_imperfections_3d(input, &imp(json!({"notionalLoads": [{"ratio": 0.005}]}))).unwrap();
    let top = r.displacements.iter().find(|d| d.node_id == 2).unwrap();
    // Cantilever tip under H = 0.5 kN: H L³ / 3EI.
    close("sway", top.ux, 0.5 * 27.0 / (3.0 * E * 1e-5), 1e-6);
}

/// NL-10: member loads carry gravity too. A beam under 10 kN/m over 6 m gets r × 60 kN.
#[test]
fn notional_loads_include_member_gravity_loads() {
    let input = in2(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 3.0}, "2": {"id": 2, "x": 6.0, "z": 3.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {"1": frame2(1, 1, 2)},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "pinned"}, "2": {"id": 2, "nodeId": 2, "type": "rollerX"}},
        "loads": [{"type": "distributed", "data": {"elementId": 1, "qI": -10.0, "qJ": -10.0}},
                  {"type": "pointOnElement", "data": {"elementId": 1, "a": 2.0, "p": -6.0}}],
    }));
    let def: NotionalLoadDef = serde_json::from_str(r#"{"ratio": 0.005}"#).unwrap();
    let fx: f64 = notional_loads_2d(&input, &def).iter().map(|l| match l { SolverLoad::Nodal(n) => n.fx, _ => 0.0 }).sum();
    close("notional load of 66 kN of gravity", fx, 0.005 * 66.0, 1e-12);
    // 3D: a member load in global −Z on a sloped member (local axes), and a point load.
    let input3 = in3(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 4.0, "y": 0.0, "z": 3.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-5, "iz": 1e-5, "j": 2e-5}},
        "elements": {"1": frame3(1, 1, 2)},
        "supports": {"1": sup3(1, [true; 6])},
        "loads": [],
    }));
    // Local axes of the member, to state a global −10 kN/m in them.
    let (ex, ey, ez) = dedaliano_engine::element::compute_local_axes_3d(0.0, 0.0, 0.0, 4.0, 0.0, 3.0, None, None, None, None, false);
    let q = |a: &[f64; 3]| -10.0 * a[2];
    let mut input3 = input3;
    input3.loads.push(SolverLoad3D::Distributed(SolverDistributedLoad3D {
        element_id: 1, q_xi: q(&ex), q_xj: q(&ex), q_yi: q(&ey), q_yj: q(&ey), q_zi: q(&ez), q_zj: q(&ez), a: None, b: None,
    }));
    let def: NotionalLoadDef = serde_json::from_str(r#"{"ratio": 0.01}"#).unwrap();
    let fx: f64 = notional_loads_3d(&input3, &def).iter().map(|l| match l { SolverLoad3D::Nodal(n) => n.fx, _ => 0.0 }).sum();
    close("3D: r × 50 kN of member gravity", fx, 0.01 * 50.0, 1e-12);
}

/// NL-11 and friends: what the linear imperfection solve does not apply is refused.
#[test]
fn unapplied_imperfections_are_refused() {
    let g = json!([{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fy": 0.0, "fz": -100.0, "mx": 0.0, "my": 0.0, "mz": 0.0}}]);
    refused(solve_with_imperfections_3d(column_3d(g.clone()), &imp(json!({"residualStresses": {"1": {"type": "uniform", "stress": -75.0}}}))), "residual stresses");
    refused(solve_with_imperfections_3d(column_3d(g.clone()), &imp(json!({"initialDisplacements": {"2": [0.01, 0.0, 0.0]}}))), "initial displacements");
    refused(solve_with_imperfections_3d(column_3d(g.clone()), &imp(json!({"nodeImperfections": [{"nodeId": 9, "dx": 0.01}]}))), "node 9");
    refused(solve_with_imperfections_3d(column_3d(g.clone()), &imp(json!({"notionalLoads": [{"ratio": 0.005, "direction": 2}]}))), "gravity axis");
    // Gravity looked for along Y in a Z-up model: nothing found, refused (it used to add nothing).
    refused(solve_with_imperfections_3d(column_3d(g.clone()), &imp(json!({"notionalLoads": [{"ratio": 0.005, "gravityAxis": 1}]}))), "no gravity load along Y");
    // 2D as well.
    let beam2 = cantilever_2d(json!({"id": 2, "nodeId": 2, "type": "free"}), json!([{"type": "nodal", "data": {"nodeId": 2, "fx": 10.0, "fz": 0.0, "my": 0.0}}]));
    refused(solve_with_imperfections_2d(beam2.clone(), &imp(json!({"notionalLoads": [{"ratio": 0.005}]}))), "no gravity load along Z");
    refused(solve_with_imperfections_2d(beam2, &imp(json!({"residualStresses": {"1": {"type": "uniform", "stress": -75.0}}}))), "residual stresses");
}

/// Node offsets are applied (in 2D, `dy` shifts z), and the result answers to the shifted model.
#[test]
fn geometric_imperfections_are_applied() {
    let input = column_3d(json!([{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fy": 0.0, "fz": -100.0, "mx": 0.0, "my": 0.0, "mz": 0.0}}]));
    let r = solve_with_imperfections_3d(input, &imp(json!({"nodeImperfections": [{"nodeId": 2, "dx": 0.015}]}))).unwrap();
    // Leaning column: the base moment is P·e (linear).
    let base = r.reactions.iter().find(|q| q.node_id == 1).unwrap();
    close("base moment = P·e", base.my.abs(), 100.0 * 0.015, 1e-6);
}

// ─── Settlement refusal and curved beams (review of #436) ───────────────────

/// A model of one curved beam only: before its expansion into frames (which several entry
/// points do after validation) it has no frame element, and the rotation of its fixed support
/// must not be taken for a truss model's missing DOF. A prescribed rotation there is applied,
/// by every 3D entry point.
fn curved_only_with_rotation(drz: f64) -> SolverInput3D {
    let mut fixed = sup3(1, [true; 6]);
    fixed.as_object_mut().unwrap().insert("drz".into(), json!(drz));
    in3(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 2.0, "y": 0.6, "z": 0.0},
                  "3": {"id": 3, "x": 4.0, "y": 0.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4, "j": 2e-4}},
        "elements": {},
        "supports": {"1": fixed, "3": sup3(3, [true, true, true, true, false, false])},
        "loads": [],
        "curvedBeams": [{"nodeStart": 1, "nodeMid": 2, "nodeEnd": 3, "materialId": 1, "sectionId": 1, "numSegments": 8}],
    }))
}

#[test]
fn curved_beam_only_model_takes_a_prescribed_rotation_in_every_entry_point() {
    let rz1 = |d: &[Displacement3D]| d.iter().find(|d| d.node_id == 1).unwrap().rz;
    let input = curved_only_with_rotation(0.002);
    let r = solve_3d(&input).expect("linear");
    close("linear: rz = drz", rz1(&r.displacements), 0.002, 1e-9);
    let w: WinklerInput3D = serde_json::from_value(json!({"solver": input.clone(), "foundationSprings": []})).unwrap();
    let r = solve_winkler_3d(&w).expect("winkler");
    close("winkler: rz = drz", rz1(&r.displacements), 0.002, 1e-9);
    // The co-rotational solve takes no prescribed displacements at all and says so; what matters
    // here is that the reason is that one, not "no rotation DOFs".
    let e = refused(dedaliano_engine::solver::corotational::solve_corotational_3d(&input, 50, 1e-8, 4, false), "prescribed support displacements");
    assert!(!e.contains("no rotation DOFs"), "{e}");
    let r = dedaliano_engine::solver::pdelta::solve_pdelta_3d(&input, 20, 1e-6).expect("pdelta");
    close("pdelta: rz = drz", rz1(&r.results.displacements), 0.002, 1e-9);
    // And a truss model still refuses it.
    let truss = in3(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 2.0, "y": 0.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": MAT, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4, "j": 2e-4}},
        "elements": {"1": {"id": 1, "type": "truss", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true, "drz": 0.002},
                     "2": sup3(2, [false, true, true, false, false, false])},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 1.0, "fy": 0.0, "fz": 0.0, "mx": 0.0, "my": 0.0, "mz": 0.0}}],
    }));
    refused(solve_3d(&truss), "no rotation DOFs");
}
