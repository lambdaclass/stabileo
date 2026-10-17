//! Certified bounds on the member deflection curves the deformed-shape views
//! draw and the hover reads. See "Diagrams, extremes, deflections and
//! reactions" in `docs/verification/CERTIFY.md`.
//!
//! The curve of one member (`postprocess::diagrams::compute_deformed_shape`;
//! TypeScript `computeDisplacementAt` and `memberLocalCurve`, which implement
//! the same Euler–Bernoulli / Timoshenko member) is, in local axes,
//!
//!   u(x) = (1 − t)·u_i + t·u_j,     v(x) = Σ_k p_k(x)·q_k + (load terms),
//!
//! with `q = (v_i, θ_i, v_j, θ_j)` the transverse end values of that bending
//! plane and `p_k` cubics that depend on the member only
//! (`deflection_shape_cubics`, probed from the solver's own `MemberDeflection`).
//! The load terms do not depend on the displacements. The axial and the two
//! transverse parts use disjoint end components, so for the local end-value
//! error `Δq_e = T·Δu_e`
//!
//!   ‖Δd(x)‖₂² ≤ ((1−t)² + t²)·‖Δ(u_i, u_j)‖² + Σ_planes ‖p(x)‖²·‖Δq_plane‖²
//!            ≤ max(1, S_y, S_z) · ‖Δq_e‖²,      S = sup_{x∈[0,L]} ‖p(x)‖₂²,
//!
//! and the displayed (global) displacement is a rotation of `d`. So every
//! displayed translation component — and the length of the displacement — of
//! the curve at every x is within `√max(1, S)·‖T‖²·‖u* − ũ‖₂` of its exact value.
//! `S` is enclosed by evaluating the cubics in interval arithmetic on 64
//! subintervals of [0, L]. Both the Euler–Bernoulli curve and, when the section
//! has a shear area, the Timoshenko one are covered (the max is taken). Member
//! rotations along the curve are not bounded (the views do not show them, the
//! 2D hover interpolates the end rotations, each bounded by `‖u* − ũ‖₂`).

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::forces::{up, T_NORM};
use super::interval::Interval;
use crate::postprocess::diagrams::deflection_shape_cubics;
use crate::types::*;

/// Bound on |exact − computed| of every displayed translation of one member's
/// deflection curve, at every point along it (m).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeflectionBound {
    pub element_id: usize,
    pub displacement: f64,
}

const SUBINTERVALS: usize = 64;

/// `sup_{x∈[0,L]} Σ_k p_k(x)²` for the four cubics, rounded up.
fn cubic_sup_sq(c: &[[f64; 4]; 4], l: f64) -> f64 {
    let mut worst = 0.0f64;
    for s in 0..SUBINTERVALS {
        let x0 = l * s as f64 / SUBINTERVALS as f64;
        let x1 = l * (s + 1) as f64 / SUBINTERVALS as f64;
        let x = Interval::new(x0.next_down().max(0.0), x1.next_up());
        let mut sum = 0.0f64;
        for p in c {
            let v = ((Interval::point(p[3]) * x + Interval::point(p[2])) * x + Interval::point(p[1])) * x
                + Interval::point(p[0]);
            let m = v.mag();
            sum = up(sum + up(m * m));
        }
        worst = worst.max(sum);
    }
    if worst.is_finite() { worst } else { f64::INFINITY }
}

/// `sup ‖p(x)‖²` of one bending plane, over the curves the views may draw:
/// Euler–Bernoulli, and Timoshenko when `gas` (G·As) is known.
fn plane_sup(l: f64, ei: f64, gas: Option<f64>, hinge_start: bool, hinge_end: bool) -> f64 {
    let ei = if ei > 1e-6 && ei.is_finite() { ei } else { 1.0 };
    let mut s = cubic_sup_sq(&deflection_shape_cubics(l, ei, 0.0, hinge_start, hinge_end), l);
    if let Some(k) = gas.filter(|k| *k > 0.0 && k.is_finite()) {
        s = s.max(cubic_sup_sq(&deflection_shape_cubics(l, ei, 1.0 / k, hinge_start, hinge_end), l));
    }
    s
}

/// `√max(1, S)·‖T‖²`: multiply by `‖u* − ũ‖₂` for the deflection bound.
fn factor(s: f64) -> f64 {
    up(up(up(s.max(1.0).sqrt()) * T_NORM) * T_NORM)
}

/// Per-member deflection factors of a 2D model (element id → factor).
pub(crate) fn deflection_factors_2d(input: &SolverInput) -> Vec<(usize, f64)> {
    let nodes: HashMap<usize, &SolverNode> = input.nodes.values().map(|n| (n.id, n)).collect();
    let mats: HashMap<usize, &SolverMaterial> = input.materials.values().map(|m| (m.id, m)).collect();
    let secs: HashMap<usize, &SolverSection> = input.sections.values().map(|s| (s.id, s)).collect();
    let mut out: Vec<(usize, f64)> = input
        .elements
        .values()
        .map(|elem| {
            let (ni, nj) = (nodes[&elem.node_i], nodes[&elem.node_j]);
            let (mat, sec) = (mats[&elem.material_id], secs[&elem.section_id]);
            let l = ((nj.x - ni.x).powi(2) + (nj.z - ni.z).powi(2)).sqrt();
            let e = mat.e * 1000.0;
            let s = if elem.elem_type == "truss" || elem.elem_type == "cable" {
                // Drawn straight between its nodes (both ends released).
                plane_sup(l, 1.0, None, true, true)
            } else {
                let gas = sec.as_y.map(|a| e / (2.0 * (1.0 + mat.nu)) * a);
                plane_sup(l, e * sec.iz, gas, elem.hinge_start, elem.hinge_end)
            };
            (elem.id, factor(s))
        })
        .collect();
    out.sort_by_key(|f| f.0);
    out
}

/// Per-member deflection factors of a 3D model (frames and trusses).
pub(crate) fn deflection_factors_3d(input: &SolverInput3D) -> Vec<(usize, f64)> {
    let nodes: HashMap<usize, &SolverNode3D> = input.nodes.values().map(|n| (n.id, n)).collect();
    let mats: HashMap<usize, &SolverMaterial> = input.materials.values().map(|m| (m.id, m)).collect();
    let secs: HashMap<usize, &SolverSection3D> = input.sections.values().map(|s| (s.id, s)).collect();
    let mut out: Vec<(usize, f64)> = input
        .elements
        .values()
        .map(|elem| {
            let (ni, nj) = (nodes[&elem.node_i], nodes[&elem.node_j]);
            let (mat, sec) = (mats[&elem.material_id], secs[&elem.section_id]);
            let l = ((nj.x - ni.x).powi(2) + (nj.y - ni.y).powi(2) + (nj.z - ni.z).powi(2)).sqrt();
            let e = mat.e * 1000.0;
            let g = e / (2.0 * (1.0 + mat.nu));
            let s = if elem.elem_type == "truss" || elem.elem_type == "cable" {
                plane_sup(l, 1.0, None, true, true)
            } else {
                // Local-y plane (v, θz): E·Iz, G·As,z, Mz releases; local-z plane (w, θy): E·Iy, G·As,y.
                let sy = plane_sup(l, e * sec.iz, sec.as_z.map(|a| g * a), elem.release_mz_start, elem.release_mz_end);
                let sz = plane_sup(l, e * sec.iy, sec.as_y.map(|a| g * a), elem.release_my_start, elem.release_my_end);
                sy.max(sz)
            };
            (elem.id, factor(s))
        })
        .collect();
    out.sort_by_key(|f| f.0);
    out
}

pub(crate) fn deflection_bounds(factors: &[(usize, f64)], abs_bound: f64) -> Vec<DeflectionBound> {
    factors
        .iter()
        .map(|&(element_id, f)| DeflectionBound { element_id, displacement: up(f * abs_bound) })
        .collect()
}

/// Per-member deflection-curve bounds of a 2D model, given `‖u* − ũ‖₂ ≤ abs_bound`.
pub fn deflection_bounds_2d(input: &SolverInput, abs_bound: f64) -> Vec<DeflectionBound> {
    deflection_bounds(&deflection_factors_2d(input), abs_bound)
}

/// Per-member deflection-curve bounds of a 3D model, given `‖u* − ũ‖₂ ≤ abs_bound`.
pub fn deflection_bounds_3d(input: &SolverInput3D, abs_bound: f64) -> Vec<DeflectionBound> {
    deflection_bounds(&deflection_factors_3d(input), abs_bound)
}
