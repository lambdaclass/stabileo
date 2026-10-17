//! Regressions found by differential testing against OpenSees
//! (tools/opensees/compare.py). Each case is checked against a closed-form
//! answer, which OpenSees also reproduces.

use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::solver::{
    solve_buckling_2d, solve_buckling_3d, solve_modal_2d, solve_pdelta_2d, solve_pdelta_3d, solve_time_history_2d,
};
use dedaliano_engine::types::{SolverInput, SolverInput3D, TimeHistoryInput};
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

/// The geometric stiffness of a bar is (1/L)·∫N dx times the string matrix:
/// its mean axial force, which is EA·δ/L. Buckling took (N_start + N_end)/2,
/// which is the mean only while N is linear along the member, so an axial
/// point load (or a partial / trapezoidal axial load) on a member gave the
/// wrong load factor. Here a vertical truss, pinned at the top, held
/// laterally by a spring k at the bottom node (which also carries a vertical
/// spring kv), with an axial load px at L/4: the bar compresses by
/// w = f_I/(kv + EA/L), f_I = px(1 − a/L), and λ = k·L/|EA·w/L|. The old
/// load factor was 3× too high (the end average is −12.5 kN here, the mean
/// −37.5 kN).
#[test]
fn buckling_uses_mean_axial_force_of_truss_with_axial_point_load() {
    let (l, a, px, k, kv) = (4.0, 1.0, 100.0, 1000.0, 5e5);
    let ea = 200000.0 * 1000.0 * 0.01;
    let input = input_2d(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "z": l}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {"1": {"id": 1, "type": "truss", "nodeI": 1, "nodeJ": 2,
                           "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "spring", "kx": k, "ky": kv},
                     "2": {"id": 2, "nodeId": 2, "type": "pinned"}},
        "loads": [{"type": "pointOnElement",
                   "data": {"elementId": 1, "a": a, "p": 0.0, "px": px}}]
    }));
    let w = px * (1.0 - a / l) / (kv + ea / l);
    let lambda = k * l / (ea * w / l);
    let res = solve_buckling_2d(&input, 1).unwrap();
    let got = res.modes[0].load_factor;
    assert!(close(got, lambda, 1e-9), "λ {got} vs {lambda}");
}

/// The same on a 3D frame member: a cantilever column (one element, so the
/// consistent Kg is the whole discretisation) with a tip load P and a uniform
/// axial load w on its lowest s metres. The discrete eigenproblem
/// det(K − μ·G) = 0 in the tip's (v, θ) gives μ = λ·|N̄| in closed form, with
/// N̄ = −(P + w·s²/(2L)) the mean axial force; the end average −(P + w·s/2)
/// was used before.
#[test]
fn buckling_3d_uses_mean_axial_force_of_frame_with_partial_axial_load() {
    let (l, s, p, w): (f64, f64, f64, f64) = (3.0, 1.2, 200.0, 300.0);
    let (e, iz) = (200000.0 * 1000.0, 8e-5);
    let input = input_3d(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0},
                  "2": {"id": 2, "x": 0.0, "y": 0.0, "z": l}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 2.0 * iz, "iz": iz, "j": 1e-4}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2,
                           "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true,
                           "rrx": true, "rry": true, "rrz": true}},
        "loads": [
            {"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fy": 0.0, "fz": -p,
                                       "mx": 0.0, "my": 0.0, "mz": 0.0}},
            {"type": "distributed", "data": {"elementId": 1, "qXI": -w, "qXJ": -w, "a": 0.0, "b": s,
                                             "qYI": 0.0, "qYJ": 0.0, "qZI": 0.0, "qZJ": 0.0}}
        ]
    }));
    // det([12c − 36d, −6Lc + 3Ld], [−6Lc + 3Ld, 4L²c − 4L²d]) = 0, c = EI/L³,
    // d = μ/(30L), with I the weaker one: a quadratic in d, smallest root.
    let c = e * iz / l.powi(3);
    let (qa, qb, qc) = (144.0 * l * l - 9.0 * l * l, -(192.0 * l * l * c) + 36.0 * l * l * c, 48.0 * l * l * c * c - 36.0 * l * l * c * c);
    let d = (-qb - (qb * qb - 4.0 * qa * qc).sqrt()) / (2.0 * qa);
    let mu = d * 30.0 * l;
    let lambda = mu / (p + w * s * s / (2.0 * l));
    let res = solve_buckling_3d(&input, 1).unwrap();
    let got = res.modes[0].load_factor;
    assert!(close(got, lambda, 1e-9), "λ {got} vs {lambda}");
}

/// A mass matrix with a massless DOF (the rotations of lumped-mass members —
/// the engine lumps every hinged member — or of a node with trusses only)
/// is only semi-definite. The dense eigensolver used for small models
/// Cholesky-factored M and gave up ("Eigenvalue decomposition failed") on
/// any such model. Here a cantilever column with its top end hinged: the
/// lumped top mass ρAL/2 on a lateral stiffness 3EI/L³.
#[test]
fn modal_with_massless_rotation_small_model() {
    let (l, a, iz, rho) = (3.0, 0.01, 1e-4, 7850.0);
    let e = 200000.0 * 1000.0;
    let input = input_2d(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "z": l}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": a, "iz": iz}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2,
                           "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": true}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}},
        "loads": []
    }));
    let densities = [("1".to_string(), rho)].into_iter().collect();
    let res = solve_modal_2d(&input, &densities, 2).unwrap();
    let m = rho * a * l / 2.0 / 1000.0;
    let omega = (3.0 * e * iz / l.powi(3) / m).sqrt();
    assert!(close(res.modes[0].omega, omega, 1e-9), "ω {} vs {omega}", res.modes[0].omega);
    let omega_axial = (e * a / l / m).sqrt();
    assert!(close(res.modes[1].omega, omega_axial, 1e-9), "ω2 {} vs {omega_axial}", res.modes[1].omega);
}

/// P-Delta member end forces are those of the member that was solved,
/// (K_e + Kg_e(N))·u_e − FEF: the reactions already came from K + Kg, but the
/// end forces were recovered with the elastic K_e alone, so they balanced
/// neither the joints nor the reactions — a free cantilever tip reported a
/// moment (0.64 kN·m here) and the base moment was not the base reaction
/// H·L + P·Δ. OpenSees (ElasticTimoshenkoBeam -geomNonlinear) agrees with
/// the corrected forces to round-off.
#[test]
fn pdelta_2d_end_forces_balance_joints_and_reactions() {
    let (l, h, p) = (4.0, 10.0, 500.0);
    let input = input_2d(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "z": l}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2,
                           "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": h, "fz": -p, "my": 0.0}}]
    }));
    let res = solve_pdelta_2d(&input, 100, 1e-12).unwrap();
    assert!(res.converged);
    let r = &res.results;
    let ux = r.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let my = r.reactions[0].my;
    assert!(close(my.abs(), h * l + p * ux, 1e-9), "base reaction {my} vs HL + PΔ {}", h * l + p * ux);
    let f = &r.element_forces[0];
    assert!(f.m_end.abs() < 1e-9 * my.abs(), "free tip moment {}", f.m_end);
    assert!(close(f.m_start.abs(), my.abs(), 1e-9), "base end moment {} vs reaction {my}", f.m_start);
    assert!(close(f.v_start.abs(), h, 1e-9) && close(f.v_end.abs(), h, 1e-9), "shear {} {}", f.v_start, f.v_end);
}

/// The same in 3D, both bending planes: a column with a tip load in x, y, z.
#[test]
fn pdelta_3d_end_forces_balance_joints_and_reactions() {
    let (l, hx, hy, p) = (3.5, 8.0, -5.0, 400.0);
    let zero = json!(0.0);
    let input = input_3d(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0},
                  "2": {"id": 2, "x": 0.0, "y": 0.0, "z": l}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1.5e-4, "iz": 1e-4, "j": 2e-4}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2,
                           "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true,
                           "rrx": true, "rry": true, "rrz": true}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": hx, "fy": hy, "fz": -p,
                                             "mx": zero, "my": zero, "mz": zero}}]
    }));
    let res = solve_pdelta_3d(&input, 100, 1e-12).unwrap();
    assert!(res.converged);
    let r = &res.results;
    let d = r.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let re = &r.reactions[0];
    // Base moments of the deformed column: about y from Hx and P·ux, about x from Hy and P·uy.
    assert!(close(re.my.abs(), (hx * l + p * d.ux).abs(), 1e-9), "My {} vs {}", re.my, hx * l + p * d.ux);
    assert!(close(re.mx.abs(), (hy * l + p * d.uy).abs(), 1e-9), "Mx {} vs {}", re.mx, hy * l + p * d.uy);
    let f = &r.element_forces[0];
    let base = re.mx.hypot(re.my);
    assert!(f.my_end.abs() < 1e-9 * base && f.mz_end.abs() < 1e-9 * base, "tip moments {} {}", f.my_end, f.mz_end);
    assert!(close(f.my_start.hypot(f.mz_start), base, 1e-9), "base end moment vs reaction");
}

/// Ground motion loads the free DOFs with −(M·r)_f·a_g, r the rigid-body
/// translation of every DOF, the supports' included: with a consistent mass a
/// free DOF is coupled to the supports' translations, and that coupling
/// M_fr·r_r is part of the inertia of the rigid-body motion. The engine took
/// M_ff·r_f only, so a frame on consistent mass felt too little of the
/// earthquake (up to ~50 % on OpenSees' random frames). Here a truss bar
/// along the motion, pinned at one end and on a roller at the other: one free
/// DOF with mass 2m and coupling m to the support (m = ρAL/6), so
/// 2m·ü + k·u = −3m·a_g, integrated here with the same Newmark recurrence.
#[test]
fn ground_motion_includes_mass_coupled_to_supports() {
    let (l, a, rho, dt, n) = (2.0, 0.01, 7850.0, 0.002, 100usize);
    let k = 200000.0 * 1000.0 * a / l;
    let m = rho * a / 1000.0 * l / 6.0;
    let ag: Vec<f64> = (0..=n).map(|i| (2.0 * std::f64::consts::PI * 5.0 * i as f64 * dt).sin()).collect();
    let solver = json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": l, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": a, "iz": 1e-4}},
        "elements": {"1": {"id": 1, "type": "truss", "nodeI": 1, "nodeJ": 2,
                           "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "pinned"},
                     "2": {"id": 2, "nodeId": 2, "type": "rollerX"}},
        "loads": []
    });
    let input: TimeHistoryInput = serde_json::from_value(json!({
        "solver": solver, "densities": {"1": rho}, "timeStep": dt, "nSteps": n,
        "groundAccel": ag, "groundDirection": "X"
    })).unwrap();
    let res = solve_time_history_2d(&input).unwrap();
    let ux = &res.node_histories.iter().find(|h| h.node_id == 2).unwrap().ux;
    // Newmark average acceleration on 2m·ü + k·u = f, f = −3m·a_g.
    let (mass, f) = (2.0 * m, |i: usize| -3.0 * m * ag[i]);
    let (mut u, mut v, mut acc) = (0.0, 0.0, f(0) / mass);
    let keff = k + 4.0 * mass / (dt * dt);
    let mut worst = 0.0f64;
    for i in 1..=n {
        let un = (f(i) + mass * (4.0 * u / (dt * dt) + 4.0 * v / dt + acc)) / keff;
        let an = 4.0 * (un - u) / (dt * dt) - 4.0 * v / dt - acc;
        v += dt / 2.0 * (acc + an);
        u = un;
        acc = an;
        worst = worst.max((ux[i] - u).abs());
    }
    let peak = ux.iter().fold(0.0f64, |p, x| p.max(x.abs()));
    assert!(worst <= 1e-9 * peak, "max |u − u_ref| = {worst:.3e}, peak {peak:.3e}");
}

/// A plane frame with hinges must buckle and sway like the same frame built in
/// 3D (in the x–z plane, out-of-plane DOFs held): the 3D Kg condenses a
/// released end rotation with the elastic map, the 2D Kg used the node's
/// rotation as the member's, a different member — 2.5 % on the load factor
/// of this portal (beam hinged at one end) and 0.5–0.9 % on its P-Delta sway.
#[test]
fn hinged_plane_frame_kg_matches_its_3d_model() {
    for (hs, he) in [(true, false), (false, true), (true, true)] {
        let m2 = input_2d(json!({
            "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "z": 4.0},
                      "3": {"id": 3, "x": 5.0, "z": 4.0}, "4": {"id": 4, "x": 5.0, "z": 0.0}},
            "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
            "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
            "elements": {
                "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
                "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1,
                      "hingeStart": hs, "hingeEnd": he},
                "3": {"id": 3, "type": "frame", "nodeI": 4, "nodeJ": 3, "materialId": 1, "sectionId": 1}},
            "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}, "2": {"id": 2, "nodeId": 4, "type": "pinned"}},
            "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 300.0, "fz": -500.0, "my": 0.0}},
                      {"type": "nodal", "data": {"nodeId": 3, "fx": 0.0, "fz": -500.0, "my": 0.0}}]
        }));
        let held = |id: usize, ux: bool, uz: bool, ry: bool| json!({"nodeId": id, "rx": ux, "ry": true, "rz": uz,
                                                                     "rrx": true, "rry": ry, "rrz": true});
        let m3 = input_3d(json!({
            "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "y": 0.0, "z": 4.0},
                      "3": {"id": 3, "x": 5.0, "y": 0.0, "z": 4.0}, "4": {"id": 4, "x": 5.0, "y": 0.0, "z": 0.0}},
            "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
            "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4, "j": 1e-4}},
            "elements": {
                "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
                "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1,
                      "releaseMyStart": hs, "releaseMyEnd": he},
                "3": {"id": 3, "type": "frame", "nodeI": 4, "nodeJ": 3, "materialId": 1, "sectionId": 1}},
            "supports": {"1": held(1, true, true, true), "2": held(2, false, false, false),
                         "3": held(3, false, false, false), "4": held(4, true, true, false)},
            "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 300.0, "fy": 0.0, "fz": -500.0, "mx": 0.0, "my": 0.0, "mz": 0.0}},
                      {"type": "nodal", "data": {"nodeId": 3, "fx": 0.0, "fy": 0.0, "fz": -500.0, "mx": 0.0, "my": 0.0, "mz": 0.0}}]
        }));
        let (b2, b3) = (solve_buckling_2d(&m2, 2).unwrap(), solve_buckling_3d(&m3, 2).unwrap());
        for k in 0..2 {
            let (l2, l3) = (b2.modes[k].load_factor, b3.modes[k].load_factor);
            assert!(close(l2, l3, 1e-9), "hinges {hs}/{he}: λ{k} 2D {l2} vs 3D {l3}");
        }
        let (p2, p3) = (solve_pdelta_2d(&m2, 100, 1e-12).unwrap(), solve_pdelta_3d(&m3, 100, 1e-12).unwrap());
        let ux2 = p2.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
        let ux3 = p3.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
        assert!(close(ux2, ux3, 1e-9), "hinges {hs}/{he}: P-Delta sway 2D {ux2} vs 3D {ux3}");
    }
}
