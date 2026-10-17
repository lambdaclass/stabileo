//! Regressions found by differential testing against OpenSees
//! (tools/opensees/compare.py). Each case is checked against a closed-form
//! answer, which OpenSees also reproduces.

use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::types::{SolverInput, SolverInput3D};
use serde_json::json;

fn input_2d(v: serde_json::Value) -> SolverInput {
    serde_json::from_value(v).unwrap()
}

fn input_3d(v: serde_json::Value) -> SolverInput3D {
    serde_json::from_value(v).unwrap()
}

fn close(a: f64, b: f64, rel: f64) -> bool {
    (a - b).abs() <= rel * b.abs().max(1e-300)
}

/// A truss bar fixed at both ends with an axial point load px at a: the axial
/// force jumps at the load, N = +px·b/L left of it and −px·a/L right of it.
/// The 2D truss path used to report EAδ/L (= 0 here) at both ends.
#[test]
fn truss_2d_axial_point_load_end_forces() {
    let (l, a, px) = (4.0, 1.0, 12.0);
    let input = input_2d(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": l, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {"1": {"id": 1, "type": "truss", "nodeI": 1, "nodeJ": 2,
                           "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "pinned"},
                     "2": {"id": 2, "nodeId": 2, "type": "pinned"}},
        "loads": [{"type": "pointOnElement",
                   "data": {"elementId": 1, "a": a, "p": 0.0, "px": px}}]
    }));
    let res = solve_2d(&input).unwrap();
    let f = &res.element_forces[0];
    assert!(close(f.n_start, px * (l - a) / l, 1e-12), "n_start = {}", f.n_start);
    assert!(close(f.n_end, -px * a / l, 1e-12), "n_end = {}", f.n_end);
}

/// A trapezoidal load on part of a cantilever: tip rotation and deflection
/// are closed-form. The partial-load fixed-end forces were integrated with a
/// 20-panel Simpson rule (exact only to degree 3; the integrand is degree 4),
/// a ~1e-4 relative error in the consistent nodal loads.
#[test]
fn partial_trapezoid_cantilever_is_exact() {
    let (l, a, b, qa, qb) = (6.0, 1.5, 4.5, -10.0, -30.0);
    let (e, iz) = (200000.0 * 1000.0, 2e-4);
    let input = input_2d(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": l, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": iz}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2,
                           "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}},
        "loads": [{"type": "distributed",
                   "data": {"elementId": 1, "qI": qa, "qJ": qb, "a": a, "b": b}}]
    }));
    let res = solve_2d(&input).unwrap();
    let tip = res.displacements.iter().find(|d| d.node_id == 2).unwrap();
    // Unit-load method: a load q(s) ds at s gives tip w = q s²(3L − s)/(6EI)
    // and tip θ = q s²/(2EI). Integrate exactly (Gauss, degree ≤ 4 in s).
    let (mut w, mut th) = (0.0, 0.0);
    let g = (0.6f64).sqrt();
    for (t, wt) in [(-g, 5.0 / 9.0), (0.0, 8.0 / 9.0), (g, 5.0 / 9.0)] {
        let s = 0.5 * (a + b) + 0.5 * (b - a) * t;
        let q = qa + (qb - qa) * (s - a) / (b - a);
        let ds = 0.5 * (b - a) * wt;
        w += q * s * s * (3.0 * l - s) / (6.0 * e * iz) * ds;
        th += q * s * s / (2.0 * e * iz) * ds;
    }
    assert!(close(tip.uz, w, 1e-10), "uz {} vs {}", tip.uz, w);
    assert!(close(tip.ry, th, 1e-10), "ry {} vs {}", tip.ry, th);
}

/// Member loads on Timoshenko members (sections with asY / asZ) used
/// Euler-Bernoulli fixed-end forces. With shear flexibility the consistent
/// fixed-end forces depend on phi = 12EI/(G·As·L²), so every non-uniform
/// member load (point loads, trapezoidal and partial distributed loads) gave
/// wrong nodal displacements and end forces. Here: a cantilever with a point
/// load at L/4, tip deflection was 13.6 % low. OpenSees
/// (ElasticTimoshenkoBeam) matches the closed form. Fixed in element/fef.rs
/// (Timoshenko shape functions for every member load).
#[test]
fn timoshenko_2d_point_load_fixed_end_forces() {
    let (l, a, p): (f64, f64, f64) = (2.0, 0.5, -10.0);
    let (e, nu, iz, as_y) = (200000.0 * 1000.0, 0.3, 4e-4, 0.004);
    let g = e / (2.0 * (1.0 + nu));
    let input = input_2d(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": l, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": nu}},
        "sections": {"1": {"id": 1, "a": 0.02, "iz": iz, "asY": as_y}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2,
                           "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}},
        "loads": [{"type": "pointOnElement", "data": {"elementId": 1, "a": a, "p": p}}]
    }));
    let res = solve_2d(&input).unwrap();
    let tip = res.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let w = p * a.powi(3) / (3.0 * e * iz) + p * a * a * (l - a) / (2.0 * e * iz) + p * a / (g * as_y);
    let th = p * a * a / (2.0 * e * iz);
    assert!(close(tip.ry, th, 1e-10), "ry {} vs {}", tip.ry, th);
    assert!(close(tip.uz, w, 1e-10), "uz {} vs {} (EB fixed-end forces?)", tip.uz, w);
}

/// Same in 3D: a cantilever along X with asY/asZ and a point load in
/// local z at L/4 (asY is the shear area of the Iy plane, i.e. shear along
/// local z — the engine/web pairing).
#[test]
fn timoshenko_3d_point_load_fixed_end_forces() {
    let (l, a, pz): (f64, f64, f64) = (2.0, 0.5, -10.0);
    let (e, nu, iy, as_y) = (200000.0 * 1000.0, 0.3, 4e-4, 0.004);
    let g = e / (2.0 * (1.0 + nu));
    let input = input_3d(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0},
                  "2": {"id": 2, "x": l, "y": 0.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": nu}},
        "sections": {"1": {"id": 1, "a": 0.02, "iy": iy, "iz": 1e-4, "j": 2e-4,
                           "asY": as_y, "asZ": 0.01}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2,
                           "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true,
                           "rrx": true, "rry": true, "rrz": true}},
        "loads": [{"type": "pointOnElement",
                   "data": {"elementId": 1, "a": a, "py": 0.0, "pz": pz}}]
    }));
    let res = solve_3d(&input).unwrap();
    let tip = res.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let w = pz * a.powi(3) / (3.0 * e * iy) + pz * a * a * (l - a) / (2.0 * e * iy) + pz * a / (g * as_y);
    assert!(close(tip.uz, w, 1e-10), "uz {} vs {} (EB fixed-end forces?)", tip.uz, w);
}

/// A Timoshenko member with a released end carrying a point load and a
/// couple must give the same answer as the member split at the load (where
/// the load becomes nodal and no fixed-end forces are involved): this checks
/// the shear-flexible fixed-end forces through the hinge condensation, the
/// assembly and the end-force recovery, in 2D.
#[test]
fn timoshenko_2d_hinged_member_matches_split_member() {
    let (l, a, p, c, px) = (3.0, 1.1, -25.0, 9.0, 4.0);
    let sec = json!({"1": {"id": 1, "a": 0.02, "iz": 4e-4, "asY": 0.003}});
    let mat = json!({"1": {"id": 1, "e": 30000.0, "nu": 0.2}});
    let sup = json!({"1": {"id": 1, "nodeId": 1, "type": "fixed"},
                     "2": {"id": 2, "nodeId": 2, "type": "pinned"}});
    for (hs, he) in [(false, false), (false, true), (true, false)] {
        let single = solve_2d(&input_2d(json!({
            "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": l, "z": 0.0},
                      "3": {"id": 3, "x": 0.0, "z": 2.0}},
            "materials": mat, "sections": sec,
            "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1,
                               "sectionId": 1, "hingeStart": hs, "hingeEnd": he},
                         "2": {"id": 2, "type": "frame", "nodeI": 3, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
            "supports": {"1": sup["1"], "2": {"id": 2, "nodeId": 3, "type": "fixed"}},
            "loads": [{"type": "pointOnElement", "data": {"elementId": 1, "a": a, "p": p, "px": px, "my": c}}]
        })))
        .unwrap();
        let split = solve_2d(&input_2d(json!({
            "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": l, "z": 0.0},
                      "3": {"id": 3, "x": 0.0, "z": 2.0}, "4": {"id": 4, "x": a, "z": 0.0}},
            "materials": mat, "sections": sec,
            "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 4, "materialId": 1,
                               "sectionId": 1, "hingeStart": hs},
                         "3": {"id": 3, "type": "frame", "nodeI": 4, "nodeJ": 2, "materialId": 1,
                               "sectionId": 1, "hingeEnd": he},
                         "2": {"id": 2, "type": "frame", "nodeI": 3, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
            "supports": {"1": sup["1"], "2": {"id": 2, "nodeId": 3, "type": "fixed"}},
            "loads": [{"type": "nodal", "data": {"nodeId": 4, "fx": px, "fz": p, "my": c}}]
        })))
        .unwrap();
        let d1 = single.displacements.iter().find(|d| d.node_id == 2).unwrap();
        let d2 = split.displacements.iter().find(|d| d.node_id == 2).unwrap();
        for (x, y) in [(d1.ux, d2.ux), (d1.uz, d2.uz), (d1.ry, d2.ry)] {
            assert!((x - y).abs() <= 1e-9 * y.abs().max(1e-6), "hs={hs} he={he}: {x} vs {y}");
        }
        let f1 = single.element_forces.iter().find(|f| f.element_id == 1).unwrap();
        let fa = split.element_forces.iter().find(|f| f.element_id == 1).unwrap();
        let fb = split.element_forces.iter().find(|f| f.element_id == 3).unwrap();
        for (x, y) in [(f1.v_start, fa.v_start), (f1.m_start, fa.m_start), (f1.n_start, fa.n_start),
                       (f1.v_end, fb.v_end), (f1.m_end, fb.m_end), (f1.n_end, fb.n_end)] {
            assert!((x - y).abs() <= 1e-8 * y.abs().max(1.0), "hs={hs} he={he}: end force {x} vs {y}");
        }
    }
}

/// The same in 3D: both bending planes with their own shear areas, on a
/// skew member with a roll angle and a released moment, single member vs
/// split at the load.
#[test]
fn timoshenko_3d_released_member_matches_split_member() {
    let (pj, frac) = ([3.0, 1.5, 0.8], 0.35);
    let pk: Vec<f64> = pj.iter().map(|v| v * frac).collect();
    let l = (pj[0] * pj[0] + pj[1] * pj[1] + pj[2] * pj[2]).sqrt();
    let (py, pz) = (14.0, -22.0);
    let sec = json!({"1": {"id": 1, "a": 0.02, "iy": 4e-4, "iz": 1.5e-4, "j": 2e-4, "asY": 0.004, "asZ": 0.0025}});
    let mat = json!({"1": {"id": 1, "e": 30000.0, "nu": 0.2}});
    for rel in ["none", "releaseMzEnd", "releaseMyEnd", "releaseMyStart"] {
        let mut e1 = json!({"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1, "rollAngle": 25.0});
        let mut ea = json!({"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 4, "materialId": 1, "sectionId": 1, "rollAngle": 25.0});
        let mut eb = json!({"id": 3, "type": "frame", "nodeI": 4, "nodeJ": 2, "materialId": 1, "sectionId": 1, "rollAngle": 25.0});
        if rel != "none" {
            e1[rel] = json!(true);
            if rel.ends_with("Start") { ea[rel] = json!(true) } else { eb[rel] = json!(true) }
        }
        let col = json!({"id": 2, "type": "frame", "nodeI": 3, "nodeJ": 2, "materialId": 1, "sectionId": 1});
        let nodes = json!({"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0},
                           "2": {"id": 2, "x": pj[0], "y": pj[1], "z": pj[2]},
                           "3": {"id": 3, "x": pj[0], "y": pj[1], "z": pj[2] - 3.0}});
        let mut nodes_split = nodes.clone();
        nodes_split["4"] = json!({"id": 4, "x": pk[0], "y": pk[1], "z": pk[2]});
        let sups = json!({"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true},
                          "2": {"nodeId": 3, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}});
        let single = solve_3d(&input_3d(json!({
            "nodes": nodes, "materials": mat, "sections": sec,
            "elements": {"1": e1, "2": col}, "supports": sups,
            "loads": [{"type": "pointOnElement", "data": {"elementId": 1, "a": frac * l, "py": py, "pz": pz}}]
        })))
        .unwrap_or_else(|e| panic!("{rel}: {e}"));
        // Local axes of the split pieces equal the member's (same direction, same roll).
        let (_, ey, ez) = dedaliano_engine::element::compute_local_axes_3d(
            0.0, 0.0, 0.0, pj[0], pj[1], pj[2], None, None, None, Some(25.0), false,
        );
        let f: Vec<f64> = (0..3).map(|k| py * ey[k] + pz * ez[k]).collect();
        let split = solve_3d(&input_3d(json!({
            "nodes": nodes_split, "materials": mat, "sections": sec,
            "elements": {"1": ea, "3": eb, "2": col}, "supports": sups,
            "loads": [{"type": "nodal", "data": {"nodeId": 4, "fx": f[0], "fy": f[1], "fz": f[2],
                                                 "mx": 0.0, "my": 0.0, "mz": 0.0}}]
        })))
        .unwrap();
        let d1 = single.displacements.iter().find(|d| d.node_id == 2).unwrap();
        let d2 = split.displacements.iter().find(|d| d.node_id == 2).unwrap();
        for (x, y) in [(d1.ux, d2.ux), (d1.uy, d2.uy), (d1.uz, d2.uz), (d1.rx, d2.rx), (d1.ry, d2.ry), (d1.rz, d2.rz)] {
            assert!((x - y).abs() <= 1e-9 * y.abs().max(1e-6), "{rel}: {x} vs {y}");
        }
        let f1 = single.element_forces.iter().find(|f| f.element_id == 1).unwrap();
        let fa = split.element_forces.iter().find(|f| f.element_id == 1).unwrap();
        let fb = split.element_forces.iter().find(|f| f.element_id == 3).unwrap();
        for (x, y) in [(f1.vy_start, fa.vy_start), (f1.vz_start, fa.vz_start), (f1.my_start, fa.my_start),
                       (f1.mz_start, fa.mz_start), (f1.vy_end, fb.vy_end), (f1.vz_end, fb.vz_end),
                       (f1.my_end, fb.my_end), (f1.mz_end, fb.mz_end)] {
            assert!((x - y).abs() <= 1e-8 * y.abs().max(1.0), "{rel}: end force {x} vs {y}");
        }
    }
}

/// A rollerX support that also declares kx: the free ux carries the spring
/// (assembled into K), so the reported reaction must include −kx·ux or the
/// reactions stop balancing the loads. The 2D rigid-support branch dropped it.
#[test]
fn roller_with_spring_reaction_balances_load() {
    let input = input_2d(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 4.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2,
                           "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "pinned"},
                     "2": {"id": 2, "nodeId": 2, "type": "rollerX", "kx": 1000.0}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 10.0, "fz": 0.0, "my": 0.0}}]
    }));
    let res = solve_2d(&input).unwrap();
    let ux = res.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let r2 = res.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert!(close(r2.rx, -1000.0 * ux, 1e-12), "rx {} vs {}", r2.rx, -1000.0 * ux);
    let sum: f64 = res.reactions.iter().map(|r| r.rx).sum();
    assert!((sum + 10.0).abs() < 1e-9, "ΣRx = {sum}, load 10");
}
