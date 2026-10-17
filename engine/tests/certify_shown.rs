//! Certified bounds on what the result views show beyond member end forces
//! (docs/verification/CERTIFY.md, "Diagrams, extremes, deflections and
//! reactions"): diagram values at every x, their extremes and the gaps between
//! stations, member deflection curves, reactions, and the same for load cases,
//! combinations and envelopes.
//!
//! * Reference: the double-double solution of the same assembled system
//!   (`certify_ref`) lies inside every bound, on random models. The displayed
//!   quantities are affine in the displacements, so their exact-minus-computed
//!   difference is the displayed formula evaluated on `Δu = u_ref − ũ` without
//!   loads; that is how it is computed here (the engine's own force recovery,
//!   diagram evaluator and deflection curve), free of the cancellation a direct
//!   difference would suffer.
//! * Mutation sensitivity: for each quantity, the worst displacement error
//!   direction allowed by `‖Δu‖ ≤ b` (probed through the same engine routines)
//!   reaches at least 90% of the bound somewhere, so halving any bound breaks
//!   the coverage assertions. Gaps are checked tight the same way on members
//!   whose diagram peaks midway between two stations.

mod certify_ref;
mod fuzz_models;

use std::collections::HashMap;

use certify_ref::*;
use dedaliano_engine::certify::deflection::{deflection_bounds_2d, deflection_bounds_3d};
use dedaliano_engine::certify::reactions::{reaction_bounds_2d, reaction_bounds_3d};
use dedaliano_engine::certify::solver::{shown_bounds_2d, shown_bounds_3d};
use dedaliano_engine::certify::stations::{
    diagram_gaps_2d, diagram_gaps_3d, station_bounds_2d, station_bounds_3d, StationBound2D, StationBound3D,
};
use dedaliano_engine::certify::{certify_linear_2d_full, certify_linear_3d_full, certify_results_2d, certify_results_3d, Certificate};
use dedaliano_engine::element::compute_local_axes_3d;
use dedaliano_engine::postprocess::diagrams::{compute_deformed_shape, compute_diagram_value_at, diagram_positions_2d};
use dedaliano_engine::postprocess::diagrams_3d::{diagram_positions_3d, evaluate_diagram_3d_at};
use dedaliano_engine::solver::assembly::{assemble_load_vector_2d, assemble_load_vector_3d_dense, assemble_stiffness_2d, assemble_stiffness_3d, assemble_stiffness_sparse_3d};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::linear::{
    compute_internal_forces_2d_with_loads, compute_internal_forces_3d_with_loads, expand_curved_beams_3d, solve_2d, solve_3d,
    SPARSE_THRESHOLD,
};
use dedaliano_engine::solver::sparse_assembly::{assemble_load_vector_sparse_3d, assemble_stiffness_sparse_2d};
use dedaliano_engine::types::*;
use serde_json::json;

/// Drawing scale for reading a curve's displacement back exactly (2^60).
const SCALE: f64 = 1_152_921_504_606_846_976.0;

const KINDS_2D: [&str; 3] = ["axial", "shear", "moment"];
const KINDS_3D: [&str; 6] = ["axial", "shearY", "shearZ", "torsion", "momentY", "momentZ"];

fn sb2(b: &StationBound2D, kind: &str) -> f64 {
    match kind {
        "axial" => b.axial,
        "shear" => b.shear,
        _ => b.moment,
    }
}

fn sb3(b: &StationBound3D, kind: &str) -> f64 {
    match kind {
        "axial" => b.axial,
        "shearY" => b.shear_y,
        "shearZ" => b.shear_z,
        "torsion" => b.torsion,
        "momentY" => b.moment_y,
        _ => b.moment_z,
    }
}

/// The engine's stations plus a fine grid: the bound holds at every x.
fn sample_ts(mut ts: Vec<f64>) -> Vec<f64> {
    ts.extend((0..=100).map(|i| i as f64 / 100.0));
    ts
}

/// `u_ref − ũ` over all DOFs (restrained DOFs are prescribed: 0), in double-double then rounded.
fn delta_u(r: &Reduced) -> Vec<f64> {
    let (xh, xl) = reference_solution(r);
    let mut d = vec![0.0; r.u_full.len()];
    for i in 0..r.n {
        let (s, e) = two_sum(xh[i], -r.u_full[i]);
        d[i] = s + (e + xl[i]);
    }
    d
}

fn displacement_2d(dof: &DofNumbering, u: &[f64], node: usize) -> [f64; 3] {
    let g = |l: usize| dof.map.get(&(node, l)).map(|&d| u[d]).unwrap_or(0.0);
    [g(0), g(1), g(2)]
}

fn displacement_3d(dof: &DofNumbering, u: &[f64], node: usize) -> [f64; 6] {
    let g = |l: usize| dof.map.get(&(node, l)).map(|&d| u[d]).unwrap_or(0.0);
    [g(0), g(1), g(2), g(3), g(4), g(5)]
}

/// The 2D deflection curve's displacement (minus the base) at its 21 points, as
/// `compute_deformed_shape` draws it for end displacements `u` and no loads.
fn curve_2d(input: &SolverInput, dof: &DofNumbering, u: &[f64], elem: &SolverElement, timoshenko: bool) -> Vec<[f64; 2]> {
    let ni = &input.nodes.values().find(|n| n.id == elem.node_i).unwrap();
    let nj = &input.nodes.values().find(|n| n.id == elem.node_j).unwrap();
    let mat = input.materials.values().find(|m| m.id == elem.material_id).unwrap();
    let sec = input.sections.values().find(|s| s.id == elem.section_id).unwrap();
    let l = ((nj.x - ni.x).powi(2) + (nj.z - ni.z).powi(2)).sqrt();
    let truss = elem.elem_type == "truss";
    let e = mat.e * 1000.0;
    let ei = if truss { None } else { Some(e * sec.iz) };
    let gas = if timoshenko && !truss { sec.as_y.map(|a| e / (2.0 * (1.0 + mat.nu)) * a) } else { None };
    let (a, b) = (displacement_2d(dof, u, elem.node_i), displacement_2d(dof, u, elem.node_j));
    let shape = |scale: f64| {
        compute_deformed_shape(
            ni.x, ni.z, nj.x, nj.z, a[0], a[1], a[2], b[0], b[1], b[2], scale, l,
            truss || elem.hinge_start, truss || elem.hinge_end, ei, gas, None, None, &[], &[],
        )
    };
    // The displacement drawn at each point: (shape at scale s − base) / s, with s
    // a power of two large enough that rounding against the base is negligible.
    let (base, big) = (shape(0.0), shape(SCALE));
    base.iter().zip(&big).map(|(p0, p1)| [(p1.x - p0.x) / SCALE, (p1.y - p0.y) / SCALE]).collect()
}

/// The 3D member curve (TS `memberLocalCurve`: per plane the same member as
/// `compute_deformed_shape`), as global displacements at 21 points, no loads.
fn curve_3d(input: &SolverInput3D, dof: &DofNumbering, u: &[f64], elem: &SolverElement3D, timoshenko: bool) -> Vec<[f64; 3]> {
    let node = |id: usize| input.nodes.values().find(|n| n.id == id).unwrap();
    let (ni, nj) = (node(elem.node_i), node(elem.node_j));
    let mat = input.materials.values().find(|m| m.id == elem.material_id).unwrap();
    let sec = input.sections.values().find(|s| s.id == elem.section_id).unwrap();
    let (ex, ey, ez) = compute_local_axes_3d(
        ni.x, ni.y, ni.z, nj.x, nj.y, nj.z, elem.local_yx, elem.local_yy, elem.local_yz, elem.roll_angle,
        input.left_hand.unwrap_or(false),
    );
    let l = ((nj.x - ni.x).powi(2) + (nj.y - ni.y).powi(2) + (nj.z - ni.z).powi(2)).sqrt();
    let dot = |a: [f64; 3], v: &[f64]| a[0] * v[0] + a[1] * v[1] + a[2] * v[2];
    let (di, dj) = (displacement_3d(dof, u, elem.node_i), displacement_3d(dof, u, elem.node_j));
    let truss = elem.elem_type == "truss";
    let e = mat.e * 1000.0;
    let g = e / (2.0 * (1.0 + mat.nu));
    let plane = |vi: f64, ri: f64, vj: f64, rj: f64, ei: f64, a_s: Option<f64>, hs: bool, he: bool| -> Vec<(f64, f64)> {
        let gas = if timoshenko && !truss { a_s.map(|a| g * a) } else { None };
        let shape = |scale: f64| {
            compute_deformed_shape(
                0.0, 0.0, l, 0.0, dot(ex, &di[..3]), vi, ri, dot(ex, &dj[..3]), vj, rj, scale, l,
                truss || hs, truss || he, if truss { None } else { Some(ei) }, gas, None, None, &[], &[],
            )
        };
        let (base, big) = (shape(0.0), shape(SCALE));
        base.iter().zip(&big).map(|(p0, p1)| ((p1.x - p0.x) / SCALE, (p1.y - p0.y) / SCALE)).collect()
    };
    let py = plane(
        dot(ey, &di[..3]), dot(ez, &di[3..]), dot(ey, &dj[..3]), dot(ez, &dj[3..]),
        e * sec.iz, sec.as_z, elem.release_mz_start, elem.release_mz_end,
    );
    let pz = plane(
        dot(ez, &di[..3]), -dot(ey, &di[3..]), dot(ez, &dj[..3]), -dot(ey, &dj[3..]),
        e * sec.iy, sec.as_y, elem.release_my_start, elem.release_my_end,
    );
    py.iter()
        .zip(&pz)
        .map(|(&(ua, v), &(_, w))| [0, 1, 2].map(|c| ua * ex[c] + v * ey[c] + w * ez[c]))
        .collect()
}

/// Dense full K and f of the assembly the certificate checks.
fn full_system_2d(input: &SolverInput, loads: &[SolverLoad]) -> (DofNumbering, Vec<f64>, Vec<f64>) {
    let dof = DofNumbering::build_2d(input);
    let k = if dof.n_free >= SPARSE_THRESHOLD {
        dense_from_lower(&assemble_stiffness_sparse_2d(input, &dof).k_full)
    } else {
        assemble_stiffness_2d(input, &dof).k
    };
    let f = assemble_load_vector_2d(input, loads, &dof, &[]);
    (dof, k, f)
}

fn full_system_3d(input: &SolverInput3D, loads: &[SolverLoad3D]) -> (DofNumbering, Vec<f64>, Vec<f64>) {
    let input = &expand_curved_beams_3d(input);
    let dof = DofNumbering::build_3d(input);
    if dof.n_free >= SPARSE_THRESHOLD {
        let st = assemble_stiffness_sparse_3d(input, &dof, true);
        let f = assemble_load_vector_sparse_3d(input, loads, &dof, &[]);
        (dof, dense_from_lower(st.k_full.as_ref().unwrap()), f)
    } else {
        let k = assemble_stiffness_3d(input, &dof).k;
        let f = assemble_load_vector_3d_dense(input, loads, &dof, &[]);
        (dof, k, f)
    }
}

/// Reaction at component (node, i) for full displacement `u` (hi) + `lo`, in
/// double-double: restrained → (K u − f)_d, free with spring k → −k·u_d.
fn reaction_dd(k: &[f64], f: &[f64], n: usize, nf: usize, d: usize, spring: f64, spring_type: bool, u: &[f64], lo: &[f64]) -> f64 {
    let mut acc = Acc::default();
    if spring_type || d < nf {
        let kk = if spring_type || spring > 0.0 { spring } else { 0.0 };
        acc.add_prod(-kk, u[d]);
        acc.add_prod(-kk, lo[d]);
    } else {
        acc.add(-f[d]);
        for j in 0..n {
            acc.add_prod(k[d * n + j], u[j]);
            acc.add_prod(k[d * n + j], lo[j]);
        }
    }
    acc.hi_lo().0
}

/// (u_ref hi, lo) over all DOFs.
fn reference_full(r: &Reduced) -> (Vec<f64>, Vec<f64>) {
    let (xh, xl) = reference_solution(r);
    let mut hi = r.u_full.clone();
    let mut lo = vec![0.0; hi.len()];
    hi[..r.n].copy_from_slice(&xh);
    lo[..r.n].copy_from_slice(&xl);
    (hi, lo)
}

#[derive(Default, Debug)]
struct Stats {
    checks: usize,
    worst: f64,
}

impl Stats {
    fn check(&mut self, label: &str, diff: f64, bound: f64) {
        let slack = 1e-9 * bound + 1e-300;
        assert!(diff.is_finite() && diff <= bound + slack, "{label}: |exact − computed| = {diff:e} > bound {bound:e}");
        self.checks += 1;
        if bound > 0.0 {
            self.worst = self.worst.max(diff / bound);
        }
    }
}

/// Every shown quantity of one certified 2D solve against the reference.
fn check_reference_2d(label: &str, input: &SolverInput, res: &AnalysisResults, abs_bound: f64, st: &mut Stats) {
    let shown = shown_bounds_2d(input, &input.loads, res, abs_bound);
    let r = reduced_2d(input, &input.loads, res);
    let du = delta_u(&r);
    // Diagrams: the formula on Δu without loads is the exact-minus-computed value.
    let dforces: HashMap<usize, ElementForces> =
        compute_internal_forces_2d_with_loads(input, &[], &r.dof, &du).into_iter().map(|f| (f.element_id, f)).collect();
    let sbs: HashMap<usize, &StationBound2D> = shown.station_bounds.iter().map(|b| (b.element_id, b)).collect();
    for ef in &res.element_forces {
        let (sb, dfe) = (sbs[&ef.element_id], &dforces[&ef.element_id]);
        for kind in KINDS_2D {
            for t in sample_ts(diagram_positions_2d(ef, kind)) {
                let d = compute_diagram_value_at(kind, t, dfe).abs();
                st.check(&format!("{label} elem {} {kind} t={t}", ef.element_id), d, sb2(sb, kind));
            }
        }
    }
    // Deflection curves.
    let dbs: HashMap<usize, f64> = shown.deflection_bounds.iter().map(|b| (b.element_id, b.displacement)).collect();
    for elem in input.elements.values() {
        for timo in [false, true] {
            for p in curve_2d(input, &r.dof, &du, elem, timo) {
                st.check(&format!("{label} deflection {}", elem.id), p[0].abs().max(p[1].abs()), dbs[&elem.id]);
            }
        }
    }
    // Reactions: double-double reference against the reported values.
    let (dof, k, f) = full_system_2d(input, &input.loads);
    let (uh, ul) = reference_full(&r);
    let rep: HashMap<usize, &Reaction> = res.reactions.iter().map(|x| (x.node_id, x)).collect();
    for rb in &shown.reaction_bounds {
        let sup = input.supports.values().find(|s| s.node_id == rb.node_id).unwrap();
        let springs = [sup.kx, sup.ky, sup.kz];
        let reported = rep[&rb.node_id];
        for (i, (got, bound)) in [(reported.rx, rb.rx), (reported.rz, rb.rz), (reported.my, rb.my)].into_iter().enumerate() {
            let exact = match dof.map.get(&(rb.node_id, i)) {
                Some(&d) => reaction_dd(&k, &f, dof.n_total, dof.n_free, d, springs[i].unwrap_or(0.0), sup.support_type == "spring", &uh, &ul),
                None => 0.0,
            };
            st.check(&format!("{label} reaction node {} comp {i}", rb.node_id), (exact - got).abs(), bound);
        }
    }
}

fn check_reference_3d(label: &str, input: &SolverInput3D, res: &AnalysisResults3D, abs_bound: f64, st: &mut Stats) {
    let shown = shown_bounds_3d(input, &input.loads, res, abs_bound);
    let r = reduced_3d(input, &input.loads, res);
    let du = delta_u(&r);
    let expanded = expand_curved_beams_3d(input);
    let dforces: HashMap<usize, ElementForces3D> =
        compute_internal_forces_3d_with_loads(&expanded, &[], &r.dof, &du).into_iter().map(|f| (f.element_id, f)).collect();
    let sbs: HashMap<usize, &StationBound3D> = shown.station_bounds.iter().map(|b| (b.element_id, b)).collect();
    for ef in &res.element_forces {
        let (Some(sb), Some(dfe)) = (sbs.get(&ef.element_id), dforces.get(&ef.element_id)) else { continue };
        for kind in KINDS_3D {
            for t in sample_ts(diagram_positions_3d(ef, kind)) {
                let d = evaluate_diagram_3d_at(dfe, kind, t).abs();
                st.check(&format!("{label} elem {} {kind} t={t}", ef.element_id), d, sb3(sb, kind));
            }
        }
    }
    let dbs: HashMap<usize, f64> = shown.deflection_bounds.iter().map(|b| (b.element_id, b.displacement)).collect();
    for elem in expanded.elements.values() {
        for timo in [false, true] {
            for p in curve_3d(&expanded, &r.dof, &du, elem, timo) {
                st.check(&format!("{label} deflection {}", elem.id), p.iter().fold(0.0f64, |m, x| m.max(x.abs())), dbs[&elem.id]);
            }
        }
    }
    let (dof, k, f) = full_system_3d(input, &input.loads);
    let (uh, ul) = reference_full(&r);
    let rep: HashMap<usize, &Reaction3D> = res.reactions.iter().map(|x| (x.node_id, x)).collect();
    for rb in &shown.reaction_bounds {
        let sup = expanded.supports.values().find(|s| s.node_id == rb.node_id).unwrap();
        let springs = [sup.kx, sup.ky, sup.kz, sup.krx, sup.kry, sup.krz];
        let x = rep[&rb.node_id];
        let pairs = [(x.fx, rb.fx), (x.fy, rb.fy), (x.fz, rb.fz), (x.mx, rb.mx), (x.my, rb.my), (x.mz, rb.mz)];
        for (i, (got, bound)) in pairs.into_iter().enumerate() {
            let exact = match dof.map.get(&(rb.node_id, i)) {
                Some(&d) => reaction_dd(&k, &f, dof.n_total, dof.n_free, d, springs[i].unwrap_or(0.0), false, &uh, &ul),
                None => 0.0,
            };
            st.check(&format!("{label} reaction node {} comp {i}", rb.node_id), (exact - got).abs(), bound);
        }
    }
}

// ───────────────────────────── fixtures ─────────────────────────────

/// A 2D frame exercising every diagram ingredient: partial trapezoidal loads,
/// point loads with axial components and couples, thermal loads, hinges, a
/// truss, Timoshenko members, a spring support and a roller with a spring.
fn feature_frame_2d() -> SolverInput {
    serde_json::from_value(json!({
        "nodes": {
            "1": {"id": 1, "x": 0.0, "y": 0.0}, "2": {"id": 2, "x": 0.0, "y": 4.0},
            "3": {"id": 3, "x": 6.0, "y": 4.5}, "4": {"id": 4, "x": 6.0, "y": 0.0},
            "5": {"id": 5, "x": 10.0, "y": 4.5}, "6": {"id": 6, "x": 10.0, "y": 0.0}
        },
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}, "2": {"id": 2, "e": 30000.0, "nu": 0.2}},
        "sections": {
            "1": {"id": 1, "a": 0.01, "iz": 2e-4},
            "2": {"id": 2, "a": 0.12, "iz": 1.6e-3, "asY": 0.1},
            "3": {"id": 3, "a": 0.002, "iz": 1e-6}
        },
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 2, "sectionId": 2},
            "3": {"id": 3, "type": "frame", "nodeI": 4, "nodeJ": 3, "materialId": 1, "sectionId": 1, "hingeEnd": true},
            "4": {"id": 4, "type": "frame", "nodeI": 3, "nodeJ": 5, "materialId": 2, "sectionId": 2, "hingeStart": false},
            "5": {"id": 5, "type": "frame", "nodeI": 6, "nodeJ": 5, "materialId": 1, "sectionId": 1, "hingeStart": true},
            "6": {"id": 6, "type": "truss", "nodeI": 1, "nodeJ": 3, "materialId": 1, "sectionId": 3}
        },
        "supports": {
            "1": {"id": 1, "nodeId": 1, "type": "fixed"},
            "2": {"id": 2, "nodeId": 4, "type": "pinned"},
            "3": {"id": 3, "nodeId": 6, "type": "spring", "kx": 5e4, "ky": 2e5, "kz": 1e3}
        },
        "loads": [
            {"type": "distributed", "data": {"elementId": 2, "qI": -12.0, "qJ": -4.0, "a": 1.0, "b": 4.5}},
            {"type": "distributed", "data": {"elementId": 4, "qI": -8.0, "qJ": -8.0}},
            {"type": "pointOnElement", "data": {"elementId": 2, "a": 2.3, "p": -15.0, "px": 3.0, "my": 4.0}},
            {"type": "pointOnElement", "data": {"elementId": 1, "a": 1.5, "p": 6.0}},
            {"type": "thermal", "data": {"elementId": 4, "dtUniform": 20.0, "dtGradient": 15.0}},
            {"type": "nodal", "data": {"nodeId": 5, "fx": 10.0, "fz": -5.0, "my": 2.0}}
        ]
    }))
    .unwrap()
}

/// A 3D frame with releases, Timoshenko sections, distributed (incl. axial)
/// and point loads, a truss and springs.
fn feature_frame_3d() -> SolverInput3D {
    let sup = |id: usize, fixed: bool| json!({
        "nodeId": id, "rx": true, "ry": true, "rz": true, "rrx": fixed, "rry": fixed, "rrz": fixed
    });
    serde_json::from_value(json!({
        "nodes": {
            "1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "y": 0.0, "z": 3.5},
            "3": {"id": 3, "x": 5.0, "y": 0.5, "z": 3.5}, "4": {"id": 4, "x": 5.0, "y": 0.0, "z": 0.0},
            "5": {"id": 5, "x": 5.0, "y": 4.0, "z": 3.5}, "6": {"id": 6, "x": 5.0, "y": 4.0, "z": 0.0}
        },
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {
            "1": {"id": 1, "a": 0.01, "iy": 8e-5, "iz": 3e-5, "j": 1e-6},
            "2": {"id": 2, "a": 0.02, "iy": 2e-4, "iz": 6e-5, "j": 3e-6, "asY": 0.008, "asZ": 0.012},
            "3": {"id": 3, "a": 0.002, "iy": 1e-7, "iz": 1e-7, "j": 1e-8}
        },
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 2},
            "3": {"id": 3, "type": "frame", "nodeI": 4, "nodeJ": 3, "materialId": 1, "sectionId": 1,
                  "releaseMyEnd": true, "releaseMzEnd": true},
            "4": {"id": 4, "type": "frame", "nodeI": 3, "nodeJ": 5, "materialId": 1, "sectionId": 2,
                  "releaseTStart": false, "releaseMzStart": true},
            "5": {"id": 5, "type": "frame", "nodeI": 6, "nodeJ": 5, "materialId": 1, "sectionId": 1},
            "6": {"id": 6, "type": "truss", "nodeI": 1, "nodeJ": 3, "materialId": 1, "sectionId": 3}
        },
        "supports": {
            "1": sup(1, true), "2": sup(4, true),
            "3": {"nodeId": 6, "rx": true, "ry": true, "rz": false, "rrx": false, "rry": false, "rrz": false,
                  "kz": 2e5, "krx": 1e3}
        },
        "loads": [
            {"type": "distributed", "data": {"elementId": 2, "qYI": -6.0, "qYJ": -2.0, "qZI": -10.0, "qZJ": -10.0,
                                              "qXI": 1.0, "qXJ": 3.0, "a": 0.5, "b": 4.0}},
            {"type": "distributed", "data": {"elementId": 4, "qYI": 0.0, "qYJ": 0.0, "qZI": -7.0, "qZJ": -3.0}},
            {"type": "pointOnElement", "data": {"elementId": 2, "a": 2.1, "py": 5.0, "pz": -12.0}},
            {"type": "nodal", "data": {"nodeId": 5, "fx": 4.0, "fy": -3.0, "fz": -6.0, "mx": 1.0, "my": 0.5, "mz": 0.0}}
        ]
    }))
    .unwrap()
}

/// Propped cantilever (fixed at 0, roller at L) under a uniform load: the span
/// moment peaks at x = 5L/8, midway between the stations 0.6L and 0.65L, where
/// the gap bound q·h²/8 is attained exactly.
fn propped_cantilever_2d(q: f64) -> SolverInput {
    serde_json::from_value(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0}, "2": {"id": 2, "x": 8.0, "y": 0.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}, "2": {"id": 2, "nodeId": 2, "type": "rollerX"}},
        "loads": [{"type": "distributed", "data": {"elementId": 1, "qI": q, "qJ": q}}]
    }))
    .unwrap()
}

// ───────────────────────────── reference tests ─────────────────────────────

#[test]
fn reference_inside_shown_bounds_on_random_models() {
    let mut st = Stats::default();
    let mut certified = 0;
    for seed in 0..400u64 {
        let input = fuzz_models::random_2d_model(seed);
        if let Ok(res) = solve_2d(&input) {
            if let Certificate::Certified { abs_bound, .. } = certify_results_2d(&input, &res) {
                check_reference_2d(&format!("2d seed {seed}"), &input, &res, abs_bound, &mut st);
                certified += 1;
            }
        }
        let input = fuzz_models::random_3d_model(100_000 + seed);
        if let Ok(res) = solve_3d(&input) {
            if let Certificate::Certified { abs_bound, .. } = certify_results_3d(&input, &res) {
                check_reference_3d(&format!("3d seed {seed}"), &input, &res, abs_bound, &mut st);
                certified += 1;
            }
        }
    }
    eprintln!("shown bounds vs reference: {certified} certified models, {} checks, worst ratio {:.3e}", st.checks, st.worst);
    assert!(certified > 60 && st.checks > 50_000);
}

#[test]
fn reference_inside_shown_bounds_on_feature_models() {
    let mut st = Stats::default();
    let input = feature_frame_2d();
    let full = certify_linear_2d_full(&input).unwrap();
    let b = full.certificate.abs_bound().expect("certified");
    assert_eq!(full.shown.station_bounds.len(), input.elements.len());
    assert_eq!(full.shown.deflection_bounds.len(), input.elements.len());
    assert_eq!(full.shown.reaction_bounds.len(), input.supports.len(), "{:?}", full.shown.reaction_reason);
    check_reference_2d("feature 2d", &input, &full.results, b, &mut st);

    let input = feature_frame_3d();
    let full = certify_linear_3d_full(&input).unwrap();
    let b = full.certificate.abs_bound().expect("certified");
    assert_eq!(full.shown.station_bounds.len(), input.elements.len());
    assert_eq!(full.shown.reaction_bounds.len(), input.supports.len(), "{:?}", full.shown.reaction_reason);
    check_reference_3d("feature 3d", &input, &full.results, b, &mut st);
    eprintln!("feature models: {} checks, worst ratio {:.3e}", st.checks, st.worst);
}

// ───────────────────────────── worst-case directions ─────────────────────────────

/// `L(e_j)` for every free DOF j: the forces each unit displacement produces
/// (no loads), through the solver's own force recovery.
fn probes_2d(input: &SolverInput, dof: &DofNumbering) -> Vec<HashMap<usize, ElementForces>> {
    (0..dof.n_free)
        .map(|j| {
            let mut u = vec![0.0; dof.n_total];
            u[j] = 1.0;
            compute_internal_forces_2d_with_loads(input, &[], dof, &u).into_iter().map(|f| (f.element_id, f)).collect()
        })
        .collect()
}

fn probes_3d(input: &SolverInput3D, dof: &DofNumbering) -> Vec<HashMap<usize, ElementForces3D>> {
    (0..dof.n_free)
        .map(|j| {
            let mut u = vec![0.0; dof.n_total];
            u[j] = 1.0;
            compute_internal_forces_3d_with_loads(input, &[], dof, &u).into_iter().map(|f| (f.element_id, f)).collect()
        })
        .collect()
}

fn norm(g: &[f64]) -> f64 {
    g.iter().map(|x| x * x).sum::<f64>().sqrt()
}

/// Max over probed points of (worst achievable error)/(bound), per quantity.
#[derive(Default)]
struct Worst(HashMap<String, f64>);

impl Worst {
    /// `g`: the quantity's gradient over the free DOFs; the worst `Δu` with
    /// `‖Δu‖ ≤ b` changes it by exactly `b·‖g‖`.
    fn add(&mut self, key: &str, label: &str, g: &[f64], b: f64, bound: f64) {
        let achieved = b * norm(g);
        assert!(achieved <= bound * (1.0 + 1e-9) + 1e-300, "{label}: worst case {achieved:e} exceeds bound {bound:e}");
        if bound > 0.0 {
            let w = self.0.entry(key.to_string()).or_insert(0.0);
            *w = w.max(achieved / bound);
        }
    }

    fn assert_tight(&self, keys: &[&str], min: f64) {
        for k in keys {
            let w = self.0.get(*k).copied().unwrap_or(0.0);
            assert!(w >= min, "{k}: the worst-case error only reaches {w:.3} of the bound (vacuous bound?)");
        }
    }
}

fn worst_case_2d(input: &SolverInput, w: &mut Worst) {
    let b = 1e-3;
    let dof = DofNumbering::build_2d(input);
    let probes = probes_2d(input, &dof);
    let res = solve_2d(input).unwrap();
    let sbs: HashMap<usize, StationBound2D> = station_bounds_2d(input, b).into_iter().map(|s| (s.element_id, s)).collect();
    for ef in &res.element_forces {
        for kind in KINDS_2D {
            for t in [0.0, 0.37, 1.0] {
                let g: Vec<f64> = probes.iter().map(|p| compute_diagram_value_at(kind, t, &p[&ef.element_id])).collect();
                w.add(kind, &format!("elem {} {kind} t={t}", ef.element_id), &g, b, sb2(&sbs[&ef.element_id], kind));
            }
        }
    }
    let dbs: HashMap<usize, f64> = deflection_bounds_2d(input, b).into_iter().map(|d| (d.element_id, d.displacement)).collect();
    for elem in input.elements.values() {
        for timo in [false, true] {
            let curves: Vec<Vec<[f64; 2]>> = (0..dof.n_free)
                .map(|j| {
                    let mut u = vec![0.0; dof.n_total];
                    u[j] = 1.0;
                    curve_2d(input, &dof, &u, elem, timo)
                })
                .collect();
            for k in 0..21 {
                for c in 0..2 {
                    let g: Vec<f64> = curves.iter().map(|cv| cv[k][c]).collect();
                    w.add("deflection", &format!("deflection {} pt {k}", elem.id), &g, b, dbs[&elem.id]);
                }
            }
        }
    }
    let (dofk, k, f) = full_system_2d(input, &input.loads);
    let n = dofk.n_total;
    for rb in reaction_bounds_2d(input, &input.loads, &res, b).unwrap() {
        let sup = input.supports.values().find(|s| s.node_id == rb.node_id).unwrap();
        for (i, bound) in [rb.rx, rb.rz, rb.my].into_iter().enumerate() {
            let Some(&d) = dofk.map.get(&(rb.node_id, i)) else { continue };
            let g: Vec<f64> = if sup.support_type == "spring" || d < dofk.n_free {
                (0..dofk.n_free).map(|j| if j == d { [sup.kx, sup.ky, sup.kz][i].unwrap_or(0.0) } else { 0.0 }).collect()
            } else {
                (0..dofk.n_free).map(|j| k[d * n + j]).collect()
            };
            let _ = &f;
            w.add("reaction", &format!("reaction {} {i}", rb.node_id), &g, b, bound);
        }
    }
}

fn worst_case_3d(input: &SolverInput3D, w: &mut Worst) {
    let b = 1e-3;
    let expanded = expand_curved_beams_3d(input);
    let dof = DofNumbering::build_3d(&expanded);
    let probes = probes_3d(&expanded, &dof);
    let res = solve_3d(input).unwrap();
    let sbs: HashMap<usize, StationBound3D> = station_bounds_3d(&expanded, b).into_iter().map(|s| (s.element_id, s)).collect();
    for ef in &res.element_forces {
        for kind in KINDS_3D {
            for t in [0.0, 0.37, 1.0] {
                let g: Vec<f64> = probes.iter().map(|p| evaluate_diagram_3d_at(&p[&ef.element_id], kind, t)).collect();
                w.add(kind, &format!("elem {} {kind} t={t}", ef.element_id), &g, b, sb3(&sbs[&ef.element_id], kind));
            }
        }
    }
    let dbs: HashMap<usize, f64> = deflection_bounds_3d(&expanded, b).into_iter().map(|d| (d.element_id, d.displacement)).collect();
    for elem in expanded.elements.values() {
        for timo in [false, true] {
            let curves: Vec<Vec<[f64; 3]>> = (0..dof.n_free)
                .map(|j| {
                    let mut u = vec![0.0; dof.n_total];
                    u[j] = 1.0;
                    curve_3d(&expanded, &dof, &u, elem, timo)
                })
                .collect();
            for k in 0..21 {
                for c in 0..3 {
                    let g: Vec<f64> = curves.iter().map(|cv| cv[k][c]).collect();
                    w.add("deflection", &format!("deflection {} pt {k}", elem.id), &g, b, dbs[&elem.id]);
                }
            }
        }
    }
    let (dofk, k, _) = full_system_3d(input, &input.loads);
    let n = dofk.n_total;
    for rb in reaction_bounds_3d(input, &input.loads, &res, b).unwrap() {
        let sup = expanded.supports.values().find(|s| s.node_id == rb.node_id).unwrap();
        let springs = [sup.kx, sup.ky, sup.kz, sup.krx, sup.kry, sup.krz];
        for (i, bound) in [rb.fx, rb.fy, rb.fz, rb.mx, rb.my, rb.mz].into_iter().enumerate() {
            let Some(&d) = dofk.map.get(&(rb.node_id, i)) else { continue };
            let g: Vec<f64> = if d < dofk.n_free {
                (0..dofk.n_free).map(|j| if j == d { springs[i].unwrap_or(0.0) } else { 0.0 }).collect()
            } else {
                (0..dofk.n_free).map(|j| k[d * n + j]).collect()
            };
            w.add("reaction", &format!("reaction {} {i}", rb.node_id), &g, b, bound);
        }
    }
}

#[test]
fn worst_case_error_reaches_every_bound_2d() {
    let mut w = Worst::default();
    worst_case_2d(&feature_frame_2d(), &mut w);
    for seed in 0..12u64 {
        let input = fuzz_models::random_2d_model(seed);
        if solve_2d(&input).is_ok() {
            worst_case_2d(&input, &mut w);
        }
    }
    eprintln!("2D worst-case ratios: {:?}", w.0);
    w.assert_tight(&["axial", "shear", "moment", "deflection", "reaction"], 0.9);
}

#[test]
fn worst_case_error_reaches_every_bound_3d() {
    let mut w = Worst::default();
    worst_case_3d(&feature_frame_3d(), &mut w);
    for seed in 0..8u64 {
        let input = fuzz_models::random_3d_model(100_000 + seed);
        if solve_3d(&input).is_ok() {
            worst_case_3d(&input, &mut w);
        }
    }
    eprintln!("3D worst-case ratios: {:?}", w.0);
    w.assert_tight(&KINDS_3D, 0.9);
    w.assert_tight(&["deflection", "reaction"], 0.9);
}

// ───────────────────────────── gaps between stations ─────────────────────────────

/// `(sup over a fine grid) − (max over the stations)`, and the same for the min.
fn excess(f: impl Fn(f64) -> f64, stations: &[f64]) -> (f64, f64) {
    let st_max = stations.iter().map(|&t| f(t)).fold(f64::NEG_INFINITY, f64::max);
    let st_min = stations.iter().map(|&t| f(t)).fold(f64::INFINITY, f64::min);
    let fine = (0..=20_000).map(|i| f(i as f64 / 20_000.0));
    let (mut hi, mut lo) = (f64::NEG_INFINITY, f64::INFINITY);
    for v in fine {
        hi = hi.max(v);
        lo = lo.min(v);
    }
    (hi - st_max, st_min - lo)
}

fn check_gaps_2d(res: &AnalysisResults, worst: &mut HashMap<&'static str, f64>) {
    for ef in &res.element_forces {
        let g = diagram_gaps_2d(ef);
        for (kind, gap) in [("axial", g.axial), ("shear", g.shear), ("moment", g.moment)] {
            let (up, down) = excess(|t| compute_diagram_value_at(kind, t, ef), &diagram_positions_2d(ef, kind));
            let slack = 1e-9 * (1.0 + gap);
            assert!(up <= gap + slack && down <= gap + slack, "elem {} {kind}: excess {up:e}/{down:e} > gap {gap:e}", ef.element_id);
            if gap > 0.0 {
                let w = worst.entry(kind).or_insert(0.0);
                *w = w.max(up.max(down) / gap);
            }
        }
    }
}

#[test]
fn gaps_cover_the_diagram_between_stations_2d() {
    let mut worst = HashMap::new();
    check_gaps_2d(&solve_2d(&feature_frame_2d()).unwrap(), &mut worst);
    for seed in 0..80u64 {
        if let Ok(res) = solve_2d(&fuzz_models::random_2d_model(seed)) {
            check_gaps_2d(&res, &mut worst);
        }
    }
    // Tight where the moment peaks midway between stations.
    let mut tight = HashMap::new();
    check_gaps_2d(&solve_2d(&propped_cantilever_2d(-10.0)).unwrap(), &mut tight);
    eprintln!("gap ratios: random {worst:?}, propped cantilever {tight:?}");
    assert!(tight["moment"] > 0.99, "{tight:?}");
    // A linearly varying load whose zero lies midway between stations: V peaks there.
    let mut input = propped_cantilever_2d(0.0);
    input.loads = vec![SolverLoad::Distributed(SolverDistributedLoad { element_id: 1, q_i: -5.25, q_j: 4.75, a: None, b: None })];
    let mut tight = HashMap::new();
    check_gaps_2d(&solve_2d(&input).unwrap(), &mut tight);
    assert!(tight["shear"] > 0.99, "{tight:?}");
}

#[test]
fn gaps_cover_the_diagram_between_stations_3d() {
    let check = |res: &AnalysisResults3D, worst: &mut HashMap<&'static str, f64>| {
        for ef in &res.element_forces {
            let g = diagram_gaps_3d(ef);
            let gaps = [g.axial, g.shear_y, g.shear_z, g.torsion, g.moment_y, g.moment_z];
            for (kind, gap) in KINDS_3D.into_iter().zip(gaps) {
                let (up, down) = excess(|t| evaluate_diagram_3d_at(ef, kind, t), &diagram_positions_3d(ef, kind));
                let slack = 1e-9 * (1.0 + gap);
                assert!(up <= gap + slack && down <= gap + slack, "elem {} {kind}: {up:e}/{down:e} > {gap:e}", ef.element_id);
                if gap > 0.0 {
                    let w = worst.entry(kind).or_insert(0.0);
                    *w = w.max(up.max(down) / gap);
                }
            }
        }
    };
    let mut worst = HashMap::new();
    check(&solve_3d(&feature_frame_3d()).unwrap(), &mut worst);
    for seed in 0..60u64 {
        if let Ok(res) = solve_3d(&fuzz_models::random_3d_model(100_000 + seed)) {
            check(&res, &mut worst);
        }
    }
    // A 3D propped cantilever loaded in both planes: both moments peak at 5L/8.
    let input: SolverInput3D = serde_json::from_value(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 8.0, "y": 0.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 5e-5, "j": 1e-6}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
        "supports": {
            "1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true},
            "2": {"nodeId": 2, "rx": false, "ry": true, "rz": true, "rrx": true, "rry": false, "rrz": false}
        },
        "loads": [{"type": "distributed", "data": {"elementId": 1, "qYI": -4.0, "qYJ": -4.0, "qZI": -9.0, "qZJ": -9.0}}]
    }))
    .unwrap();
    let mut tight = HashMap::new();
    check(&solve_3d(&input).unwrap(), &mut tight);
    eprintln!("3D gap ratios: random {worst:?}, propped cantilever {tight:?}");
    assert!(tight["momentY"] > 0.99 && tight["momentZ"] > 0.99, "{tight:?}");
    // Loads changing sign midway between two stations: Vy, Vz and N peak there.
    let mut input = input;
    input.loads = vec![serde_json::from_value(json!({"type": "distributed", "data": {
        "elementId": 1, "qXI": -5.25, "qXJ": 4.75, "qYI": -5.25, "qYJ": 4.75, "qZI": 5.25, "qZJ": -4.75
    }}))
    .unwrap()];
    let mut tight = HashMap::new();
    check(&solve_3d(&input).unwrap(), &mut tight);
    assert!(tight["axial"] > 0.99 && tight["shearY"] > 0.99 && tight["shearZ"] > 0.99, "{tight:?}");
}

// ───────────────────────────── combinations, envelope, honesty ─────────────────────────────

#[test]
fn combination_and_envelope_bounds_contain_the_reference() {
    use dedaliano_engine::certify::combinations::certify_multi_case_2d;
    use dedaliano_engine::solver::load_cases::{CombinationDef, LoadCase, MultiCaseInput};
    let base = feature_frame_2d();
    let mut structure = base.clone();
    structure.loads = vec![];
    let dead: Vec<SolverLoad> = base.loads.iter().step_by(2).cloned().collect();
    let live: Vec<SolverLoad> = base.loads.iter().skip(1).step_by(2).cloned().collect();
    let combos = [("ULS", 1.2, 1.6), ("UPLIFT", 0.9, -1.5)];
    let input = MultiCaseInput {
        solver: structure.clone(),
        load_cases: vec![LoadCase { name: "D".into(), loads: dead.clone() }, LoadCase { name: "L".into(), loads: live.clone() }],
        combinations: combos
            .iter()
            .map(|&(n, d, l)| CombinationDef { name: n.into(), factors: [("D".to_string(), d), ("L".to_string(), l)].into_iter().collect() })
            .collect(),
    };
    let out = certify_multi_case_2d(&input).unwrap();
    // Per case: Δu from the reference of each case's own system.
    let deltas: Vec<Vec<f64>> = out
        .results
        .case_results
        .iter()
        .zip([&dead, &live])
        .map(|(cr, loads)| delta_u(&reduced_2d(&structure, loads, &cr.results)))
        .collect();
    let dof = DofNumbering::build_2d(&structure);
    for (ci, (name, d, l)) in combos.iter().enumerate() {
        let cert = &out.combinations[ci];
        assert!(cert.certified, "{name}: {:?}", cert.reason);
        let du: Vec<f64> = deltas[0].iter().zip(&deltas[1]).map(|(a, b)| d * a + l * b).collect();
        let dforces: HashMap<usize, ElementForces> =
            compute_internal_forces_2d_with_loads(&structure, &[], &dof, &du).into_iter().map(|f| (f.element_id, f)).collect();
        let sbs: HashMap<usize, &StationBound2D> = cert.station_bounds.iter().map(|b| (b.element_id, b)).collect();
        let env: HashMap<usize, &StationBound2D> = out.envelope.station_bounds.iter().map(|b| (b.element_id, b)).collect();
        let mut st = Stats::default();
        for ef in &out.results.combination_results[ci].results.element_forces {
            let sb = sbs[&ef.element_id];
            assert!(sb.gaps.is_some(), "combination diagrams carry their gaps");
            for kind in KINDS_2D {
                assert!(sb2(env[&ef.element_id], kind) >= sb2(sb, kind), "envelope covers {name}");
                for t in sample_ts(diagram_positions_2d(ef, kind)) {
                    let diff = compute_diagram_value_at(kind, t, &dforces[&ef.element_id]).abs();
                    st.check(&format!("{name} elem {} {kind}", ef.element_id), diff, sb2(sb, kind));
                }
            }
        }
        let dbs: HashMap<usize, f64> = cert.deflection_bounds.iter().map(|b| (b.element_id, b.displacement)).collect();
        for elem in structure.elements.values() {
            for p in curve_2d(&structure, &dof, &du, elem, false) {
                st.check(&format!("{name} deflection {}", elem.id), p[0].abs().max(p[1].abs()), dbs[&elem.id]);
            }
        }
        assert_eq!(cert.reaction_bounds.len(), structure.supports.len());
        assert!(st.checks > 100);
        // The curve bound is the member factor times the combination's displacement bound.
        let want = deflection_bounds_2d(&structure, cert.disp_abs_bound.unwrap());
        assert_eq!(cert.deflection_bounds, want);
    }
    assert!(out.envelope.certified && out.envelope.station_bounds.len() == structure.elements.len());
    assert!(out.envelope.station_bounds.iter().all(|b| b.gaps.is_none()), "no gaps claimed for envelope curves");
    // The combinations' diagram bounds are much tighter than ΔM + ΔV·L from end forces.
    let c = &out.combinations[0];
    let fb: HashMap<usize, &dedaliano_engine::certify::forces::ForceBound2D> = c.force_bounds.iter().map(|b| (b.element_id, b)).collect();
    for sb in c.station_bounds.iter().filter(|s| s.moment > 0.0) {
        let lens: f64 = out.results.combination_results[0].results.element_forces.iter().find(|f| f.element_id == sb.element_id).unwrap().length;
        assert!(sb.moment <= fb[&sb.element_id].m + fb[&sb.element_id].v * lens);
    }
}

#[test]
fn uncertified_and_unsupported_models_claim_nothing() {
    // Mechanism: no certificate, no shown bounds.
    let mut input = propped_cantilever_2d(-10.0);
    input.supports.retain(|_, s| s.node_id != 1);
    input.supports.insert("9".into(), serde_json::from_value(json!({"id": 9, "nodeId": 1, "type": "rollerX"})).unwrap());
    if let Ok(full) = certify_linear_2d_full(&input) {
        assert!(!full.certificate.is_certified());
        let s = &full.shown;
        assert!(s.station_bounds.is_empty() && s.deflection_bounds.is_empty() && s.reaction_bounds.is_empty());
    }
    // Inclined roller: diagrams and curves are bounded, reactions are not (with a reason).
    let mut input = propped_cantilever_2d(-10.0);
    input.supports.retain(|_, s| s.node_id != 2);
    input.supports.insert(
        "9".into(),
        serde_json::from_value(json!({"id": 9, "nodeId": 2, "type": "inclinedRoller", "angle": 0.3})).unwrap(),
    );
    let full = certify_linear_2d_full(&input).unwrap();
    if full.certificate.is_certified() {
        assert_eq!(full.shown.station_bounds.len(), 1);
        assert!(full.shown.reaction_bounds.is_empty());
        assert!(full.shown.reaction_reason.as_deref().unwrap_or("").contains("inclined"));
    }
}
