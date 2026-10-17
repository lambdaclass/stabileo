//! Tests written to kill mutants that survived cargo-mutants on the solver
//! core (scripts/mutants.sh, docs/verification/FUZZ_MUTANTS.md): each pins a
//! behaviour of DOF numbering, assembly or reactions that no other test in the
//! mutation test set checked.

use dedaliano_engine::solver::linear::solve_3d;
use dedaliano_engine::types::*;
use serde_json::json;

/// 3D cantilever with warping (cw set) under a tip torque; `root` is the root
/// support's warping fields.
fn warping_cantilever(root: serde_json::Value) -> SolverInput3D {
    let mut sup = json!({ "nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true });
    for (k, v) in root.as_object().unwrap() {
        sup[k] = v.clone();
    }
    serde_json::from_value(json!({
        "nodes": { "1": { "id": 1, "x": 0.0, "y": 0.0, "z": 0.0 }, "2": { "id": 2, "x": 3.0, "y": 0.0, "z": 0.0 } },
        "materials": { "1": { "id": 1, "e": 200000.0, "nu": 0.3 } },
        "sections": { "1": { "id": 1, "a": 0.01, "iy": 1e-4, "iz": 5e-5, "j": 1e-7, "cw": 1e-6 } },
        "elements": { "1": { "id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1 } },
        "supports": { "1": sup },
        "loads": [{ "type": "nodal", "data": { "nodeId": 2, "fx": 0.0, "fy": 0.0, "fz": 0.0, "mx": 1.0, "my": 0.0, "mz": 0.0 } }]
    }))
    .unwrap()
}

/// A warping spring (kw) on a support makes the warping DOF elastic, as kx–krz
/// do for theirs, even when the support also flags it restrained (rw): the root
/// warps, and the tip twist lies strictly between the warping-free and the
/// warping-fixed root. (Mutant: `delete match arm 6` in DofNumbering::build_3d
/// left the DOF rigidly restrained.)
#[test]
fn warping_spring_makes_the_warping_dof_elastic() {
    let twist = |root: serde_json::Value| {
        let r = solve_3d(&warping_cantilever(root)).unwrap();
        let d = |n: usize| r.displacements.iter().find(|d| d.node_id == n).unwrap().clone();
        (d(2).rx, d(1).warping.unwrap_or(0.0))
    };
    let (free, _) = twist(json!({ "rw": false }));
    let (fixed, w_fixed) = twist(json!({ "rw": true }));
    let (spring, w_spring) = twist(json!({ "rw": true, "kw": 1e-3 }));
    assert!(free > 0.0 && fixed > 0.0 && fixed < free, "free {free}, fixed {fixed}");
    assert_eq!(w_fixed, 0.0);
    assert!(w_spring.abs() > 0.0, "a warping spring must let the root warp");
    assert!(fixed < spring && spring < free, "free {free}, spring {spring}, fixed {fixed}");
}

/// One 8-node solid shell, a unit cube on four fully fixed bottom nodes,
/// pressed by 4 × 1 kN on the top: the element is assembled (the top moves
/// down, by the order of P·L/(E·A)) and the reactions balance the load.
/// (Mutant: `solid_shell_element_dofs` returning no or wrong DOFs.)
#[test]
fn solid_shell_cube_is_assembled_and_balanced() {
    let e = 1000.0; // MPa
    let mut nodes = serde_json::Map::new();
    let corners = [(0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (1.0, 1.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), (1.0, 0.0, 1.0), (1.0, 1.0, 1.0), (0.0, 1.0, 1.0)];
    for (k, (x, y, z)) in corners.iter().enumerate() {
        nodes.insert((k + 1).to_string(), json!({ "id": k + 1, "x": x, "y": y, "z": z }));
    }
    let sup = |n: usize| json!({ "nodeId": n, "rx": true, "ry": true, "rz": true, "rrx": false, "rry": false, "rrz": false });
    let load = |n: usize| json!({ "type": "nodal", "data": { "nodeId": n, "fx": 0.0, "fy": 0.0, "fz": -1.0, "mx": 0.0, "my": 0.0, "mz": 0.0 } });
    let input: SolverInput3D = serde_json::from_value(json!({
        "nodes": nodes,
        "materials": { "1": { "id": 1, "e": e, "nu": 0.0 } },
        "sections": {},
        "elements": {},
        "solidShells": { "1": { "id": 1, "nodes": [1, 2, 3, 4, 5, 6, 7, 8], "materialId": 1 } },
        "supports": { "1": sup(1), "2": sup(2), "3": sup(3), "4": sup(4) },
        "loads": [load(5), load(6), load(7), load(8)]
    }))
    .unwrap();
    let r = solve_3d(&input).unwrap();
    let ref_uz = -4.0 / (e * 1000.0); // P·L/(E·A), E in kN/m²
    for n in 5..=8 {
        let uz = r.displacements.iter().find(|d| d.node_id == n).unwrap().uz;
        assert!(uz < 0.0 && uz > 2.0 * ref_uz && uz < 0.2 * ref_uz, "node {n}: uz {uz} vs P·L/(E·A) {ref_uz}");
    }
    let fz: f64 = r.reactions.iter().map(|x| x.fz).sum();
    assert!((fz - 4.0).abs() < 1e-6, "ΣRz = {fz}, load 4");
}

/// 3D cantilever (fixed at node 1) whose tip rests on an inclined roller with
/// normal `n` in the x–z plane, 30° from z, under a vertical tip load. `extra`
/// sets more fields on the roller.
fn inclined_tip(extra: serde_json::Value, cw: Option<f64>) -> SolverInput3D {
    let (s, c) = (30f64.to_radians().sin(), 30f64.to_radians().cos());
    let mut roller = json!({
        "nodeId": 2, "rx": false, "ry": false, "rz": false, "rrx": false, "rry": false, "rrz": false,
        "isInclined": true, "normalX": s, "normalY": 0.0, "normalZ": c
    });
    for (k, v) in extra.as_object().unwrap() {
        roller[k] = v.clone();
    }
    let mut sec = json!({ "id": 1, "a": 0.01, "iy": 1e-4, "iz": 5e-5, "j": 3e-5 });
    if let Some(cw) = cw {
        sec["cw"] = json!(cw);
    }
    serde_json::from_value(json!({
        "nodes": { "1": { "id": 1, "x": 0.0, "y": 0.0, "z": 0.0 }, "2": { "id": 2, "x": 4.0, "y": 0.0, "z": 0.0 } },
        "materials": { "1": { "id": 1, "e": 200000.0, "nu": 0.3 } },
        "sections": { "1": sec },
        "elements": { "1": { "id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1 } },
        "supports": {
            "1": { "nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true, "rw": true },
            "2": roller
        },
        "loads": [{ "type": "nodal", "data": { "nodeId": 2, "fx": 0.0, "fy": 3.0, "fz": -10.0, "mx": 2.0, "my": 0.0, "mz": 0.0, "bw": 0.5 } }]
    }))
    .unwrap()
}

/// An inclined roller stops motion along its normal only: u·n = 0 at the tip,
/// the tangential motion and the rotations are free, and flagged rotations
/// (and warping) are held. (Mutants in the inclined branch of DofNumbering.)
#[test]
fn inclined_roller_restrains_the_normal_only() {
    let (s, c) = (30f64.to_radians().sin(), 30f64.to_radians().cos());
    let tip = |input: &SolverInput3D| {
        let r = solve_3d(input).unwrap();
        r.displacements.iter().find(|d| d.node_id == 2).unwrap().clone()
    };
    let d = tip(&inclined_tip(json!({}), None));
    let along_n = d.ux * s + d.uz * c;
    let tangential = -d.ux * c + d.uz * s;
    assert!(along_n.abs() <= 1e-9 * tangential.abs(), "u·n = {along_n}, tangential {tangential}");
    assert!(tangential.abs() > 1e-6 && d.uy.abs() > 1e-6, "tangential and y motion are free: {d:?}");
    assert!(d.rx.abs() > 1e-9 && d.ry.abs() > 1e-9 && d.rz.abs() > 1e-9, "rotations are free: {d:?}");
    let d = tip(&inclined_tip(json!({ "rrx": true, "rry": true, "rrz": true }), None));
    assert!(d.rx == 0.0 && d.ry == 0.0 && d.rz == 0.0, "flagged rotations are held: {d:?}");
    let w = |rw: bool| tip(&inclined_tip(json!({ "rw": rw }), Some(1e-6))).warping.unwrap_or(0.0);
    assert!(w(false).abs() > 0.0 && w(true) == 0.0, "warping follows rw: free {}, held {}", w(false), w(true));
}

/// `isInclined` without a usable normal used to solve as an ordinary support
/// with its flags; it is rejected now.
#[test]
fn inclined_support_without_normal_is_rejected() {
    for extra in [json!({ "normalX": null }), json!({ "normalX": 0.0, "normalY": 0.0, "normalZ": 0.0 })] {
        let err = solve_3d(&inclined_tip(extra, None)).unwrap_err();
        assert!(err.contains("inclined support needs a non-zero normal"), "{err}");
    }
}
