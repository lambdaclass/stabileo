//! Tests written to kill mutants that survived cargo-mutants on the solver
//! core (scripts/mutants.sh, docs/verification/FUZZ_MUTANTS.md): each pins a
//! behaviour of DOF numbering, assembly or reactions that no other test in the
//! mutation test set checked.

use dedaliano_engine::solver::assembly::{
    assemble_load_vector_3d_dense, assemble_load_vector_3d_sparse, assemble_sparse_2d_ex,
    assemble_stiffness_2d, assemble_stiffness_3d, assemble_stiffness_sparse_3d,
    support_spring_entries_2d, support_spring_entries_3d,
};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
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

#[test]
fn warping_spring_makes_the_warping_dof_elastic() {
    let twist = |root: serde_json::Value| {
        let r = solve_3d(&warping_cantilever(root)).unwrap();
        let d = |n: usize| {
            r.displacements
                .iter()
                .find(|d| d.node_id == n)
                .unwrap()
                .clone()
        };
        (d(2).rx, d(1).warping.unwrap_or(0.0))
    };
    let (free, _) = twist(json!({ "rw": false }));
    let (fixed, w_fixed) = twist(json!({ "rw": true }));
    let conflict = solve_3d(&warping_cantilever(json!({ "rw": true, "kw": 1e-3 }))).unwrap_err();
    let refusal: serde_json::Value = serde_json::from_str(&conflict).unwrap();
    assert_eq!(refusal["structuredDiagnostics"][0]["code"], "conflicting_support_spring");
    let (spring, w_spring) = twist(json!({ "rw": false, "kw": 1e-3 }));
    assert!(
        free > 0.0 && fixed > 0.0 && fixed < free,
        "free {free}, fixed {fixed}"
    );
    assert_eq!(w_fixed, 0.0);
    assert!(
        w_spring.abs() > 0.0,
        "a warping spring must let the root warp"
    );
    assert!(
        fixed < spring && spring < free,
        "free {free}, spring {spring}, fixed {fixed}"
    );
}

/// One 8-node solid shell, a unit cube on four fully fixed bottom nodes,
/// pressed by 4 × 1 kN on the top: the element is assembled (the top moves
/// down, by the order of P·L/(E·A)) and the reactions balance the load.
/// (Mutant: `solid_shell_element_dofs` returning no or wrong DOFs.)
#[test]
fn solid_shell_cube_is_assembled_and_balanced() {
    let e = 1000.0; // MPa
    let mut nodes = serde_json::Map::new();
    let corners = [
        (0.0, 0.0, 0.0),
        (1.0, 0.0, 0.0),
        (1.0, 1.0, 0.0),
        (0.0, 1.0, 0.0),
        (0.0, 0.0, 1.0),
        (1.0, 0.0, 1.0),
        (1.0, 1.0, 1.0),
        (0.0, 1.0, 1.0),
    ];
    for (k, (x, y, z)) in corners.iter().enumerate() {
        nodes.insert(
            (k + 1).to_string(),
            json!({ "id": k + 1, "x": x, "y": y, "z": z }),
        );
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
        assert!(
            uz < 0.0 && uz > 2.0 * ref_uz && uz < 0.2 * ref_uz,
            "node {n}: uz {uz} vs P·L/(E·A) {ref_uz}"
        );
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
        r.displacements
            .iter()
            .find(|d| d.node_id == 2)
            .unwrap()
            .clone()
    };
    let d = tip(&inclined_tip(json!({}), None));
    let along_n = d.ux * s + d.uz * c;
    let tangential = -d.ux * c + d.uz * s;
    assert!(
        along_n.abs() <= 1e-9 * tangential.abs(),
        "u·n = {along_n}, tangential {tangential}"
    );
    assert!(
        tangential.abs() > 1e-6 && d.uy.abs() > 1e-6,
        "tangential and y motion are free: {d:?}"
    );
    assert!(
        d.rx.abs() > 1e-9 && d.ry.abs() > 1e-9 && d.rz.abs() > 1e-9,
        "rotations are free: {d:?}"
    );
    let d = tip(&inclined_tip(
        json!({ "rrx": true, "rry": true, "rrz": true }),
        None,
    ));
    assert!(
        d.rx == 0.0 && d.ry == 0.0 && d.rz == 0.0,
        "flagged rotations are held: {d:?}"
    );
    let w = |rw: bool| {
        tip(&inclined_tip(json!({ "rw": rw }), Some(1e-6)))
            .warping
            .unwrap_or(0.0)
    };
    assert!(
        w(false).abs() > 0.0 && w(true) == 0.0,
        "warping follows rw: free {}, held {}",
        w(false),
        w(true)
    );
}

/// `isInclined` without a usable normal used to solve as an ordinary support
/// with its flags; it is rejected now.
#[test]
fn inclined_support_without_normal_is_rejected() {
    for extra in [
        json!({ "normalX": null }),
        json!({ "normalX": 0.0, "normalY": 0.0, "normalZ": 0.0 }),
    ] {
        let err = solve_3d(&inclined_tip(extra, None)).unwrap_err();
        assert!(
            err.contains("inclined support needs a non-zero normal"),
            "{err}"
        );
    }
}

/// An unknown 2D support type used to restrain nothing, silently.
#[test]
fn unknown_2d_support_type_is_rejected() {
    let input: SolverInput = serde_json::from_value(json!({
        "nodes": { "1": { "id": 1, "x": 0.0, "z": 0.0 }, "2": { "id": 2, "x": 3.0, "z": 0.0 } },
        "materials": { "1": { "id": 1, "e": 200000.0, "nu": 0.3 } },
        "sections": { "1": { "id": 1, "a": 0.01, "iz": 1e-4 } },
        "elements": { "1": { "id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1 } },
        "supports": { "1": { "id": 1, "nodeId": 1, "type": "fixed" }, "2": { "id": 2, "nodeId": 2, "type": "roller" } },
        "loads": [{ "type": "nodal", "data": { "nodeId": 2, "fx": 1.0, "fz": -1.0, "my": 0.0 } }]
    }))
    .unwrap();
    let err = dedaliano_engine::solver::linear::solve_2d(&input).unwrap_err();
    assert!(err.contains("unknown type 'roller'"), "{err}");
}

/// The cable solvers skipped input validation entirely; an unknown support
/// type (or a non-finite value) reached them unchecked.
#[test]
fn cable_solver_validates_its_input() {
    let input: SolverInput = serde_json::from_value(json!({
        "nodes": { "1": { "id": 1, "x": 0.0, "z": 0.0 }, "2": { "id": 2, "x": 3.0, "z": 0.0 } },
        "materials": { "1": { "id": 1, "e": 200000.0, "nu": 0.3 } },
        "sections": { "1": { "id": 1, "a": 0.01, "iz": 1e-4 } },
        "elements": { "1": { "id": 1, "type": "cable", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1 } },
        "supports": { "1": { "id": 1, "nodeId": 1, "type": "pinned" }, "2": { "id": 2, "nodeId": 2, "type": "pin" } },
        "loads": [{ "type": "nodal", "data": { "nodeId": 2, "fx": 1.0, "fz": -1.0, "my": 0.0 } }]
    }))
    .unwrap();
    let err =
        dedaliano_engine::solver::cable::solve_cable_2d(&input, &Default::default(), 20, 1e-8)
            .unwrap_err();
    assert!(err.contains("unknown type 'pin'"), "{err}");
}

/// A 2D spring support with a rotated axis (angle) and a rotational spring:
/// its reaction is −K_θ·u with K_θ = Rᵀ diag(kx, ky) R, plus −kz·ry, and the
/// structure is in force and moment equilibrium. (Mutants of the rotated
/// spring reaction in build_reactions_2d survived: no test used `angle`.)
#[test]
fn rotated_spring_reaction_2d() {
    let (kx, ky, kz, angle) = (2000.0, 500.0, 300.0, 0.4f64);
    let input: SolverInput = serde_json::from_value(json!({
        "nodes": { "1": { "id": 1, "x": 0.0, "z": 0.0 }, "2": { "id": 2, "x": 4.0, "z": 1.0 } },
        "materials": { "1": { "id": 1, "e": 200000.0, "nu": 0.3 } },
        "sections": { "1": { "id": 1, "a": 0.01, "iz": 1e-4 } },
        "elements": { "1": { "id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1 } },
        "supports": {
            "1": { "id": 1, "nodeId": 1, "type": "pinned" },
            "2": { "id": 2, "nodeId": 2, "type": "spring", "kx": kx, "ky": ky, "kz": kz, "angle": angle }
        },
        "loads": [{ "type": "nodal", "data": { "nodeId": 2, "fx": 7.0, "fz": -11.0, "my": 3.0 } }]
    }))
    .unwrap();
    let r = dedaliano_engine::solver::linear::solve_2d(&input).unwrap();
    let d = r.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let (s, c) = (angle.sin(), angle.cos());
    let (kxx, kzz, kxz) = (
        kx * c * c + ky * s * s,
        kx * s * s + ky * c * c,
        (kx - ky) * s * c,
    );
    let r2 = r.reactions.iter().find(|x| x.node_id == 2).unwrap();
    let r1 = r.reactions.iter().find(|x| x.node_id == 1).unwrap();
    let tol = |x: f64| 1e-9 * (1.0 + x.abs());
    assert!(
        (r2.rx + kxx * d.ux + kxz * d.uz).abs() < tol(r2.rx),
        "rx {r2:?}"
    );
    assert!(
        (r2.rz + kxz * d.ux + kzz * d.uz).abs() < tol(r2.rz),
        "rz {r2:?}"
    );
    assert!(
        (r2.my + kz * d.ry).abs() < tol(r2.my) && r2.my != 0.0,
        "my {r2:?}"
    );
    // ΣF = 0 and ΣM about node 1 = 0 (moments about y; z up: M = z·Fx − x·Fz).
    assert!(
        (r1.rx + r2.rx + 7.0).abs() < 1e-8 && (r1.rz + r2.rz - 11.0).abs() < 1e-8,
        "ΣF: {r1:?} {r2:?}"
    );
    let m = r1.my + r2.my + 3.0 + (1.0 * (r2.rx + 7.0) - 4.0 * (r2.rz - 11.0));
    let m_alt = r1.my + r2.my + 3.0 - (1.0 * (r2.rx + 7.0) - 4.0 * (r2.rz - 11.0));
    assert!(
        m.abs() < 1e-7 || m_alt.abs() < 1e-7,
        "ΣM = {m} (or {m_alt} with the other sign convention)"
    );
}

fn input_2d(
    nodes: serde_json::Value,
    supports: serde_json::Value,
    loads: serde_json::Value,
) -> SolverInput {
    serde_json::from_value(json!({
        "nodes": nodes,
        "materials": { "1": { "id": 1, "e": 200000.0, "nu": 0.3 } },
        "sections": { "1": { "id": 1, "a": 0.01, "iz": 0.0002 } },
        "elements": { "1": { "id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1 } },
        "supports": supports,
        "loads": loads
    }))
    .unwrap()
}

fn input_3d(
    nodes: serde_json::Value,
    sections: serde_json::Value,
    elements: serde_json::Value,
    supports: serde_json::Value,
    loads: serde_json::Value,
) -> SolverInput3D {
    serde_json::from_value(json!({
        "nodes": nodes,
        "materials": { "1": { "id": 1, "e": 200000.0, "nu": 0.3 } },
        "sections": sections,
        "elements": elements,
        "supports": supports,
        "loads": loads
    }))
    .unwrap()
}

fn assert_values_close(actual: &[f64], expected: &[f64]) {
    assert_eq!(actual.len(), expected.len());
    let scale = expected.iter().fold(1.0f64, |m, v| m.max(v.abs()));
    for (i, (&a, &e)) in actual.iter().zip(expected).enumerate() {
        assert!(
            (a - e).abs() <= 1e-11 * scale,
            "entry {i}: {a:e} != {e:e}, scale {scale:e}"
        );
    }
}

#[test]
fn support_spring_entries_match_closed_form_stiffness() {
    let nodes = (1..=7)
        .map(|id| {
            (
                id.to_string(),
                json!({ "id": id, "x": id as f64, "z": 0.0 }),
            )
        })
        .collect::<serde_json::Map<_, _>>();
    let supports = json!({
        "1": { "id": 1, "nodeId": 1, "type": "spring", "kx": 4.0, "ky": 9.0, "kz": 16.0, "angle": 0.3 },
        "2": { "id": 2, "nodeId": 2, "type": "pinned", "kx": 3.0, "ky": 5.0, "kz": 7.0, "angle": 0.8 },
        "3": { "id": 3, "nodeId": 3, "type": "spring", "kx": 0.0, "ky": 0.0, "kz": 0.0, "angle": 0.4 },
        "4": { "id": 4, "nodeId": 4, "type": "spring", "kx": 0.0, "ky": 11.0, "angle": 0.2 },
        "5": { "id": 5, "nodeId": 5, "type": "spring", "kx": 13.0, "ky": 0.0 },
        "6": { "id": 6, "nodeId": 6, "type": "spring", "kx": -2.0, "ky": -3.0, "kz": -4.0 },
        "7": { "id": 7, "nodeId": 7, "type": "spring", "kx": 2.0, "ky": 3.0, "angle": 0.0 }
    });
    let input = input_2d(serde_json::Value::Object(nodes), supports, json!([]));
    let dn = DofNumbering::build_2d(&input);
    let d = |node, local| dn.map[&(node, local)];
    let (s, c) = 0.3f64.sin_cos();
    let (s0, c0) = 0.2f64.sin_cos();
    let expected = vec![
        (d(1, 0), d(1, 0), 4.0 * c * c + 9.0 * s * s),
        (d(1, 1), d(1, 1), 4.0 * s * s + 9.0 * c * c),
        (d(1, 0), d(1, 1), (4.0 - 9.0) * s * c),
        (d(1, 1), d(1, 0), (4.0 - 9.0) * s * c),
        (d(1, 2), d(1, 2), 16.0),
        (d(2, 0), d(2, 0), 3.0),
        (d(2, 1), d(2, 1), 5.0),
        (d(2, 2), d(2, 2), 7.0),
        (d(4, 0), d(4, 0), 11.0 * s0 * s0),
        (d(4, 1), d(4, 1), 11.0 * c0 * c0),
        (d(4, 0), d(4, 1), -11.0 * s0 * c0),
        (d(4, 1), d(4, 0), -11.0 * s0 * c0),
        (d(5, 0), d(5, 0), 13.0),
        (d(7, 0), d(7, 0), 2.0),
        (d(7, 1), d(7, 1), 3.0),
    ];
    assert_eq!(support_spring_entries_2d(&input, &dn), expected);

    let mut truss = input.clone();
    truss.elements.get_mut("1").unwrap().elem_type = "truss".into();
    let truss_dn = DofNumbering::build_2d(&truss);
    assert_eq!(truss_dn.dofs_per_node, 2);
    let td = |node, local| truss_dn.map[&(node, local)];
    let truss_expected = vec![
        (td(1, 0), td(1, 0), 4.0 * c * c + 9.0 * s * s),
        (td(1, 1), td(1, 1), 4.0 * s * s + 9.0 * c * c),
        (td(1, 0), td(1, 1), (4.0 - 9.0) * s * c),
        (td(1, 1), td(1, 0), (4.0 - 9.0) * s * c),
        (td(2, 0), td(2, 0), 3.0),
        (td(2, 1), td(2, 1), 5.0),
        (td(4, 0), td(4, 0), 11.0 * s0 * s0),
        (td(4, 1), td(4, 1), 11.0 * c0 * c0),
        (td(4, 0), td(4, 1), -11.0 * s0 * c0),
        (td(4, 1), td(4, 0), -11.0 * s0 * c0),
        (td(5, 0), td(5, 0), 13.0),
        (td(7, 0), td(7, 0), 2.0),
        (td(7, 1), td(7, 1), 3.0),
    ];
    assert_eq!(support_spring_entries_2d(&truss, &truss_dn), truss_expected);
}

#[test]
fn support_spring_entries_3d_cover_every_dof() {
    let input = input_3d(
        json!({ "1": { "id": 1, "x": 0.0, "y": 0.0, "z": 0.0 } }),
        json!({ "1": { "id": 1, "a": 0.01, "iy": 0.0001, "iz": 0.0002, "j": 0.0003, "cw": 0.000001 } }),
        json!({}),
        json!({ "1": { "nodeId": 1, "rx": false, "ry": false, "rz": false, "rrx": false, "rry": false, "rrz": false,
            "kx": 2.0, "ky": 3.0, "kz": 5.0, "krx": 7.0, "kry": 11.0, "krz": 13.0, "kw": 17.0 } }),
        json!([]),
    );
    let dn = DofNumbering::build_3d(&input);
    let expected = (0..7)
        .map(|local| {
            (
                dn.map[&(1, local)],
                dn.map[&(1, local)],
                [2.0, 3.0, 5.0, 7.0, 11.0, 13.0, 17.0][local],
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(support_spring_entries_3d(&input, &dn), expected);
}

fn partial_hermite(q: f64, a: f64, b: f64, l: f64) -> [f64; 4] {
    let mut out = [0.0; 4];
    let g = 0.6f64.sqrt();
    for (t, w) in [(-g, 5.0 / 9.0), (0.0, 8.0 / 9.0), (g, 5.0 / 9.0)] {
        let x = (a + b) / 2.0 + t * (b - a) / 2.0;
        let n = [
            1.0 - 3.0 * x * x / (l * l) + 2.0 * x.powi(3) / l.powi(3),
            x - 2.0 * x * x / l + x.powi(3) / (l * l),
            3.0 * x * x / (l * l) - 2.0 * x.powi(3) / l.powi(3),
            -x * x / l + x.powi(3) / (l * l),
        ];
        for k in 0..4 {
            out[k] += q * n[k] * w * (b - a) / 2.0;
        }
    }
    out
}

fn expected_member_loads(scale: f64) -> [f64; 12] {
    let l = 4.0;
    let (qx, qy, qz) = (2.0 * scale, -3.0 * scale, 5.0 * scale);
    let mut f = [0.0; 12];
    f[0] = qx * l / 2.0;
    f[6] = qx * l / 2.0;
    f[1] = qy * l / 2.0;
    f[7] = qy * l / 2.0;
    f[5] = qy * l * l / 12.0;
    f[11] = -qy * l * l / 12.0;
    f[2] = qz * l / 2.0;
    f[8] = qz * l / 2.0;
    f[4] = -qz * l * l / 12.0;
    f[10] = qz * l * l / 12.0;

    let py = partial_hermite(-3.0 * scale * 0.25, 0.0, 3.0, l);
    let pz = partial_hermite(5.0 * scale * 0.25, 0.0, 3.0, l);
    f[1] += py[0];
    f[5] += py[1];
    f[7] += py[2];
    f[11] += py[3];
    f[2] += pz[0];
    f[4] -= pz[1];
    f[8] += pz[2];
    f[10] -= pz[3];

    let (a, b) = (1.0, 3.0);
    let shapes = [
        b * b * (3.0 * a + b) / l.powi(3),
        a * b * b / (l * l),
        a * a * (a + 3.0 * b) / l.powi(3),
        -a * a * b / (l * l),
    ];
    let (p_y, p_z) = (-8.0 * scale, 12.0 * scale);
    f[1] += p_y * shapes[0];
    f[5] += p_y * shapes[1];
    f[7] += p_y * shapes[2];
    f[11] += p_y * shapes[3];
    f[2] += p_z * shapes[0];
    f[4] -= p_z * shapes[1];
    f[8] += p_z * shapes[2];
    f[10] -= p_z * shapes[3];

    let e = 200_000_000.0;
    let alpha = 2e-6;
    let fx = e * 0.01 * alpha * 7.0 * scale;
    let mz = e * 0.0002 * alpha * 3.0 * scale / 0.4;
    let my = e * 0.0001 * alpha * (-2.0) * scale / 0.5;
    f[0] -= fx;
    f[6] += fx;
    f[4] -= my;
    f[10] += my;
    f[5] -= mz;
    f[11] += mz;
    f
}

fn member_loads(element_id: usize, scale: f64) -> Vec<SolverLoad3D> {
    vec![
        SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id,
            q_xi: 2.0 * scale,
            q_xj: 2.0 * scale,
            q_yi: -3.0 * scale,
            q_yj: -3.0 * scale,
            q_zi: 5.0 * scale,
            q_zj: 5.0 * scale,
            a: None,
            b: None,
        }),
        SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id,
            q_xi: 0.0,
            q_xj: 0.0,
            q_yi: -3.0 * scale * 0.25,
            q_yj: -3.0 * scale * 0.25,
            q_zi: 5.0 * scale * 0.25,
            q_zj: 5.0 * scale * 0.25,
            a: Some(0.0),
            b: Some(3.0),
        }),
        SolverLoad3D::PointOnElement(SolverPointLoad3D {
            element_id,
            a: 1.0,
            py: -8.0 * scale,
            pz: 12.0 * scale,
        }),
        SolverLoad3D::Thermal(SolverThermalLoad3D {
            element_id,
            dt_uniform: 7.0 * scale,
            dt_gradient_y: 3.0 * scale,
            dt_gradient_z: -2.0 * scale,
            alpha: Some(2e-6),
            depth_y: Some(0.4),
            depth_z: Some(0.5),
        }),
    ]
}

fn frame_load_model(warping: bool) -> SolverInput3D {
    let section =
        |id, cw| json!({ "id": id, "a": 0.01, "iy": 0.0001, "iz": 0.0002, "j": 0.0003, "cw": cw });
    let mut input = input_3d(
        json!({
            "1": { "id": 1, "x": 0.0, "y": 0.0, "z": 0.0 },
            "2": { "id": 2, "x": 4.0, "y": 0.0, "z": 0.0 },
            "3": { "id": 3, "x": 8.0, "y": 0.0, "z": 0.0 }
        }),
        json!({ "1": section(1, if warping { json!(0.000001) } else { json!(null) }), "2": section(2, json!(null)) }),
        json!({
            "1": { "id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1 },
            "2": { "id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 2 }
        }),
        json!({
            "1": { "nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true },
            "2": { "nodeId": 3, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true }
        }),
        json!([]),
    );
    input.loads = member_loads(1, 1.0)
        .into_iter()
        .chain(member_loads(2, -0.5))
        .collect();
    if warping {
        input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2,
            fx: 0.0,
            fy: 0.0,
            fz: 0.0,
            mx: 0.0,
            my: 0.0,
            mz: 0.0,
            bw: Some(0.25),
        }));
        input.loads.push(SolverLoad3D::Bimoment(SolverBimomentLoad {
            node_id: 2,
            bimoment: -0.75,
        }));
    }
    input
}

#[test]
fn frame_member_loads_match_hand_integrated_fixed_end_forces() {
    for warping in [false, true] {
        let input = frame_load_model(warping);
        let dn = DofNumbering::build_3d(&input);
        let stiff = assemble_stiffness_3d(&input, &dn);
        let dense =
            assemble_load_vector_3d_dense(&input, &input.loads, &dn, &stiff.inclined_transforms);
        let sparse =
            assemble_load_vector_3d_sparse(&input, &input.loads, &dn, &stiff.inclined_transforms);
        let mut expected = vec![0.0; dn.n_total];
        let e1 = expected_member_loads(1.0);
        let e2 = expected_member_loads(-0.5);
        for local in 0..6 {
            expected[dn.map[&(1, local)]] = e1[local];
            expected[dn.map[&(2, local)]] = e1[6 + local] + e2[local];
            expected[dn.map[&(3, local)]] = e2[6 + local];
        }
        if warping {
            expected[dn.map[&(2, 6)]] = -0.5;
        }
        assert_values_close(&dense, &expected);
        assert_values_close(&sparse, &expected);
        assert_eq!(dn.dofs_per_node, if warping { 7 } else { 6 });
    }
    let input = frame_load_model(true);
    let dn = DofNumbering::build_3d(&input);
    let nodal = || {
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2,
            fx: 0.0,
            fy: 0.0,
            fz: 0.0,
            mx: 0.0,
            my: 0.0,
            mz: 0.0,
            bw: Some(2e-15),
        })
    };
    let bimoment = || {
        SolverLoad3D::Bimoment(SolverBimomentLoad {
            node_id: 2,
            bimoment: -2e-15,
        })
    };
    for (load, value) in [(nodal(), 2e-15), (bimoment(), -2e-15)] {
        let loads = vec![load];
        let dense = assemble_load_vector_3d_dense(&input, &loads, &dn, &[]);
        let sparse = assemble_load_vector_3d_sparse(&input, &loads, &dn, &[]);
        let mut expected = vec![0.0; dn.n_total];
        expected[dn.map[&(2, 6)]] = value;
        for (actual, label) in [(dense, "dense"), (sparse, "sparse")] {
            for (i, (&a, &e)) in actual.iter().zip(&expected).enumerate() {
                assert!((a - e).abs() <= 1e-16, "{label} entry {i}: {a:e} != {e:e}");
            }
        }
    }
    let loads = vec![nodal(), bimoment()];
    let dense = assemble_load_vector_3d_dense(&input, &loads, &dn, &[]);
    let sparse = assemble_load_vector_3d_sparse(&input, &loads, &dn, &[]);
    assert_eq!(dense, vec![0.0; dn.n_total]);
    assert_eq!(sparse, dense);
}

fn shell_input() -> SolverInput3D {
    let mut input = input_3d(json!({}), json!({}), json!({}), json!({}), json!([]));
    let points = [
        (1, [0.0, 0.0, 0.0]),
        (2, [2.0, 0.0, 0.0]),
        (3, [0.0, 1.0, 0.0]),
        (11, [4.0, 0.0, 0.0]),
        (12, [6.0, 0.0, 0.0]),
        (13, [6.0, 2.0, 0.0]),
        (14, [4.0, 2.0, 0.0]),
        (21, [0.0, 8.0, 0.0]),
        (22, [2.0, 8.0, 0.0]),
        (23, [2.0, 10.0, 0.0]),
        (24, [0.0, 10.0, 0.0]),
        (25, [1.0, 8.0, 0.0]),
        (26, [2.0, 9.0, 0.0]),
        (27, [1.0, 10.0, 0.0]),
        (28, [0.0, 9.0, 0.0]),
        (29, [1.0, 9.0, 0.0]),
        (41, [0.0, 4.0, 0.0]),
        (42, [1.0, 4.0, 0.0]),
        (43, [1.0, 5.0, 0.0]),
        (44, [0.0, 5.0, 0.0]),
        (45, [0.0, 4.0, 1.0]),
        (46, [1.0, 4.0, 1.0]),
        (47, [1.0, 5.0, 1.0]),
        (48, [0.0, 5.0, 1.0]),
        (61, [4.0, 4.0, 0.0]),
        (62, [6.0, 4.0, 0.0]),
        (63, [6.0, 6.0, 0.0]),
        (64, [4.0, 6.0, 0.0]),
    ];
    for (id, [x, y, z]) in points {
        input
            .nodes
            .insert(id.to_string(), SolverNode3D { id, x, y, z });
    }
    input.plates.insert(
        "1".into(),
        SolverPlateElement {
            id: 1,
            nodes: [1, 2, 3],
            material_id: 1,
            thickness: 0.1,
        },
    );
    input.quads.insert(
        "2".into(),
        SolverQuadElement {
            id: 2,
            nodes: [11, 12, 13, 14],
            material_id: 1,
            thickness: 0.1,
        },
    );
    input.quad9s.insert(
        "3".into(),
        SolverQuad9Element {
            id: 3,
            nodes: [21, 22, 23, 24, 25, 26, 27, 28, 29],
            material_id: 1,
            thickness: 0.1,
        },
    );
    input.solid_shells.insert(
        "4".into(),
        SolverSolidShellElement {
            id: 4,
            nodes: [41, 42, 43, 44, 45, 46, 47, 48],
            material_id: 1,
        },
    );
    input.curved_shells.insert(
        "5".into(),
        SolverCurvedShellElement {
            id: 5,
            nodes: [61, 62, 63, 64],
            material_id: 1,
            thickness: 0.1,
            normals: Some([[0.0, 0.0, 1.0]; 4]),
        },
    );
    input
}

fn shell_loads() -> Vec<SolverLoad3D> {
    vec![
        SolverLoad3D::Pressure(SolverPressureLoad {
            element_id: 1,
            pressure: 2.0,
        }),
        SolverLoad3D::PlateThermal(SolverPlateThermalLoad {
            element_id: 1,
            dt_uniform: 3.0,
            dt_gradient: 0.2,
            alpha: Some(2e-6),
        }),
        SolverLoad3D::QuadPressure(SolverPressureLoad {
            element_id: 2,
            pressure: -1.0,
        }),
        SolverLoad3D::QuadThermal(SolverPlateThermalLoad {
            element_id: 2,
            dt_uniform: 4.0,
            dt_gradient: -0.3,
            alpha: Some(3e-6),
        }),
        SolverLoad3D::QuadSelfWeight(SolverQuadSelfWeightLoad {
            element_id: 2,
            density: 2400.0,
            gx: 0.2,
            gy: -0.4,
            gz: -9.81,
        }),
        SolverLoad3D::QuadEdge(SolverQuadEdgeLoad {
            element_id: 2,
            edge: 1,
            qn: 0.7,
            qt: -0.2,
        }),
        SolverLoad3D::Quad9Pressure(SolverPressureLoad {
            element_id: 3,
            pressure: 3.0,
        }),
        SolverLoad3D::Quad9Thermal(SolverPlateThermalLoad {
            element_id: 3,
            dt_uniform: -2.0,
            dt_gradient: 0.4,
            alpha: Some(4e-6),
        }),
        SolverLoad3D::Quad9SelfWeight(SolverQuadSelfWeightLoad {
            element_id: 3,
            density: 2500.0,
            gx: -0.1,
            gy: 0.3,
            gz: -9.81,
        }),
        SolverLoad3D::Quad9Edge(SolverQuadEdgeLoad {
            element_id: 3,
            edge: 2,
            qn: -0.5,
            qt: 0.6,
        }),
        SolverLoad3D::SolidShellPressure(SolverPressureLoad {
            element_id: 4,
            pressure: 2.0,
        }),
        SolverLoad3D::SolidShellSelfWeight(SolverSolidShellSelfWeightLoad {
            element_id: 4,
            density: 2000.0,
            gx: 0.5,
            gy: 0.1,
            gz: -9.81,
        }),
        SolverLoad3D::CurvedShellPressure(SolverPressureLoad {
            element_id: 5,
            pressure: -2.0,
        }),
        SolverLoad3D::CurvedShellThermal(SolverPlateThermalLoad {
            element_id: 5,
            dt_uniform: 5.0,
            dt_gradient: -0.7,
            alpha: Some(5e-6),
        }),
        SolverLoad3D::CurvedShellSelfWeight(SolverQuadSelfWeightLoad {
            element_id: 5,
            density: 1800.0,
            gx: -0.2,
            gy: 0.4,
            gz: -9.81,
        }),
        SolverLoad3D::CurvedShellEdge(SolverQuadEdgeLoad {
            element_id: 5,
            edge: 3,
            qn: 0.8,
            qt: 0.9,
        }),
    ]
}

#[test]
fn shell_load_vectors_match_across_paths_and_pressure_resultants() {
    let input = shell_input();
    let dn = DofNumbering::build_3d(&input);
    let loads = shell_loads();
    let dense = assemble_load_vector_3d_dense(&input, &loads, &dn, &[]);
    let sparse = assemble_load_vector_3d_sparse(&input, &loads, &dn, &[]);
    assert_values_close(&dense, &sparse);
    for (load, nodes, resultant) in [
        (&loads[0], vec![1, 2, 3], 2.0),
        (&loads[2], vec![11, 12, 13, 14], -4.0),
        (&loads[6], (21..=29).collect(), 12.0),
        (&loads[10], (41..=48).collect(), -2.0),
        (&loads[12], vec![61, 62, 63, 64], -8.0),
    ] {
        for assemble in [
            assemble_load_vector_3d_dense
                as fn(&SolverInput3D, &[SolverLoad3D], &DofNumbering, &[_]) -> Vec<f64>,
            assemble_load_vector_3d_sparse,
        ] {
            let f = assemble(&input, std::slice::from_ref(load), &dn, &[]);
            let got: f64 = nodes.iter().map(|&node| f[dn.map[&(node, 2)]]).sum();
            assert!(
                (got - resultant).abs() < 1e-10,
                "pressure resultant {got} != {resultant}"
            );
        }
    }
}

fn inclined_2d(angle: Option<f64>, dx: f64, dz: f64) -> SolverInput {
    input_2d(
        json!({ "1": { "id": 1, "x": 0.0, "z": 0.0 }, "2": { "id": 2, "x": 4.0, "z": 0.0 } }),
        json!({
            "1": { "id": 1, "nodeId": 1, "type": "fixed" },
            "2": { "id": 2, "nodeId": 2, "type": "inclinedRoller", "angle": angle, "dx": dx, "dz": dz }
        }),
        json!([{ "type": "nodal", "data": { "nodeId": 2, "fx": 2.0, "fz": -3.0, "my": 0.0 } }]),
    )
}

fn inclined_3d(normal: [f64; 3], prescribed: [f64; 3]) -> SolverInput3D {
    input_3d(
        json!({ "1": { "id": 1, "x": 0.0, "y": 0.0, "z": 0.0 }, "2": { "id": 2, "x": 4.0, "y": 0.0, "z": 0.0 } }),
        json!({ "1": { "id": 1, "a": 0.01, "iy": 0.0001, "iz": 0.0002, "j": 0.0003 } }),
        json!({ "1": { "id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1 } }),
        json!({
            "1": { "nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true },
            "2": { "nodeId": 2, "rx": false, "ry": false, "rz": false, "rrx": true, "rry": true, "rrz": true,
                "isInclined": true, "normalX": normal[0], "normalY": normal[1], "normalZ": normal[2],
                "dx": prescribed[0], "dy": prescribed[1], "dz": prescribed[2],
                "drx": 0.001, "dry": -0.002, "drz": 0.003 }
        }),
        json!([{ "type": "nodal", "data": { "nodeId": 2, "fx": 2.0, "fy": -3.0, "fz": 4.0, "mx": 0.0, "my": 0.0, "mz": 0.0 } }]),
    )
}

#[test]
fn prescribed_support_motion_is_projected_and_reported_exactly() {
    let mut fixed = inclined_2d(None, 0.0, 0.0);
    fixed.supports.get_mut("1").unwrap().support_type = "fixed".into();
    fixed.supports.get_mut("2").unwrap().support_type = "fixed".into();
    fixed.supports.get_mut("2").unwrap().angle = None;
    fixed.supports.get_mut("1").unwrap().dx = Some(0.001);
    fixed.supports.get_mut("1").unwrap().dz = Some(-0.002);
    fixed.supports.get_mut("1").unwrap().dry = Some(0.003);
    fixed.supports.get_mut("2").unwrap().dx = Some(-0.004);
    fixed.supports.get_mut("2").unwrap().dz = Some(0.005);
    fixed.supports.get_mut("2").unwrap().dry = Some(-0.006);
    let r = solve_2d(&fixed).unwrap();
    for (node, expected) in [(1, [0.001, -0.002, 0.003]), (2, [-0.004, 0.005, -0.006])] {
        let d = r.displacements.iter().find(|d| d.node_id == node).unwrap();
        assert_values_close(&[d.ux, d.uz, d.ry], &expected);
    }

    let plain = inclined_2d(None, 0.0, 0.007);
    let d = solve_2d(&plain)
        .unwrap()
        .displacements
        .into_iter()
        .find(|d| d.node_id == 2)
        .unwrap();
    assert!((d.uz - 0.007).abs() < 1e-12, "{} != 0.007", d.uz);

    let theta = 0.3;
    let inclined = inclined_2d(Some(theta), 0.004, -0.007);
    let d = solve_2d(&inclined)
        .unwrap()
        .displacements
        .into_iter()
        .find(|d| d.node_id == 2)
        .unwrap();
    let normal = d.ux * theta.sin() + d.uz * theta.cos();
    let expected = 0.004 * theta.sin() - 0.007 * theta.cos();
    assert!((normal - expected).abs() < 1e-12, "{normal} != {expected}");

    let normal = [0.3, 0.4, 0.866];
    let prescribed = [0.002, -0.003, 0.004];
    let r = solve_3d(&inclined_3d(normal, prescribed)).unwrap();
    let d = r.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let len = normal.iter().map(|v| v * v).sum::<f64>().sqrt();
    let expected = (0..3).map(|i| normal[i] * prescribed[i]).sum::<f64>() / len;
    let got = d.ux * normal[0] + d.uy * normal[1] + d.uz * normal[2];
    assert!(
        (got / len - expected).abs() < 1e-12,
        "{} != {expected}",
        got / len
    );
    assert_values_close(&[d.rx, d.ry, d.rz], &[0.001, -0.002, 0.003]);

    let mut fixed = inclined_3d(normal, [0.0; 3]);
    for (_, support) in fixed.supports.iter_mut() {
        support.is_inclined = None;
        support.normal_x = None;
        support.normal_y = None;
        support.normal_z = None;
        support.rx = true;
        support.ry = true;
        support.rz = true;
        support.rrx = true;
        support.rry = true;
        support.rrz = true;
    }
    fixed.supports.get_mut("2").unwrap().dx = Some(-0.002);
    fixed.supports.get_mut("2").unwrap().dy = Some(0.004);
    fixed.supports.get_mut("2").unwrap().dz = Some(-0.006);
    let r = solve_3d(&fixed).unwrap();
    let d = r.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_values_close(
        &[d.ux, d.uy, d.uz, d.rx, d.ry, d.rz],
        &[-0.002, 0.004, -0.006, 0.001, -0.002, 0.003],
    );
}

#[test]
fn inclined_sparse_stiffness_matches_dense_rotation_identity() {
    let input = inclined_2d(Some(0.3), 0.0, 0.0);
    let dn = DofNumbering::build_2d(&input);
    let dense = assemble_stiffness_2d(&input, &dn);
    let sparse = assemble_sparse_2d_ex(&input, &dn, true);
    let got = sparse.k_full.unwrap().to_dense_symmetric();
    assert_values_close(&got, &dense.k);

    let input = inclined_3d([0.3, 0.4, 0.866], [0.0; 3]);
    let dn = DofNumbering::build_3d(&input);
    let dense = assemble_stiffness_3d(&input, &dn);
    let sparse = assemble_stiffness_sparse_3d(&input, &dn, true);
    let got = sparse.k_full.unwrap().to_dense_symmetric();
    assert_values_close(&got, &dense.k);
}
