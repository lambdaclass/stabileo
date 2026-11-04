//! Member orientation reversal: swapping a member's node_i and node_j (with
//! its end releases and member loads mirrored along it) describes the same
//! physical member. Displacements and reactions must not change; member end
//! forces map between the ends as documented on each function.
//!
//! 2D: local x and local y both flip (in-plane moments do not), so
//! q(s) → −q(L−s), p → −p, px → −px, a → L − a, member moments unchanged,
//! thermal gradients change sign; end forces
//! (nS, nE, vS, vE, mS, mE) → (nE, nS, vE, vS, −mE, −mS).
//!
//! 3D: the member's local axes are first made explicit (reference = its
//! actual local y), so after the swap ey is kept and ex, ez flip:
//! q_x → −q_x, q_y → q_y, q_z → −q_z (each read from the other end),
//! p_z → −p_z, gradient_z → −gradient_z; end forces
//! N, Vz, Mx, Mz swap ends; Vy and My swap ends and change sign.

use super::transform::{transform_3d, Iso3};
use super::TResult;
use crate::types::*;

fn len2(s: &SolverInput, id: usize) -> f64 {
    let e = &s.elements[&id.to_string()];
    let (a, b) = (&s.nodes[&e.node_i.to_string()], &s.nodes[&e.node_j.to_string()]);
    ((b.x - a.x).powi(2) + (b.z - a.z).powi(2)).sqrt()
}

fn len3(s: &SolverInput3D, id: usize) -> f64 {
    let e = &s.elements[&id.to_string()];
    let (a, b) = (&s.nodes[&e.node_i.to_string()], &s.nodes[&e.node_j.to_string()]);
    ((b.x - a.x).powi(2) + (b.y - a.y).powi(2) + (b.z - a.z).powi(2)).sqrt()
}

pub fn reverse_2d(input: &SolverInput, flip: &dyn Fn(usize) -> bool) -> SolverInput {
    let mut p = input.clone();
    for e in p.elements.values_mut() {
        if flip(e.id) {
            std::mem::swap(&mut e.node_i, &mut e.node_j);
            std::mem::swap(&mut e.hinge_start, &mut e.hinge_end);
        }
    }
    for l in p.loads.iter_mut() {
        match l {
            SolverLoad::Distributed(d) if flip(d.element_id) => {
                let len = len2(input, d.element_id);
                let (qi, qj) = (d.q_i, d.q_j);
                d.q_i = -qj;
                d.q_j = -qi;
                let (a, b) = (d.a, d.b);
                d.a = b.map(|b| len - b).or(if a.is_some() { Some(0.0) } else { None });
                d.b = a.map(|a| len - a).or(if b.is_some() { Some(len) } else { None });
            }
            SolverLoad::PointOnElement(q) if flip(q.element_id) => {
                let len = len2(input, q.element_id);
                q.a = len - q.a;
                q.p = -q.p;
                q.px = q.px.map(|v| -v);
            }
            SolverLoad::Thermal(t) if flip(t.element_id) => t.dt_gradient = -t.dt_gradient,
            _ => {}
        }
    }
    p
}

/// Expected 2D end forces of a reversed member from the original ones.
pub fn map_forces_2d(f: &mut ElementForces) {
    let o = f.clone();
    (f.n_start, f.n_end) = (o.n_end, o.n_start);
    (f.v_start, f.v_end) = (o.v_end, o.v_start);
    (f.m_start, f.m_end) = (-o.m_end, -o.m_start);
}

pub fn reverse_3d(input: &SolverInput3D, flip: &dyn Fn(usize) -> bool) -> TResult<SolverInput3D> {
    let id = Iso3 { r: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]], t: [0.0; 3] };
    let explicit = transform_3d(input, &id)?;
    let mut p = explicit.clone();
    for e in p.elements.values_mut() {
        if flip(e.id) {
            std::mem::swap(&mut e.node_i, &mut e.node_j);
            std::mem::swap(&mut e.release_my_start, &mut e.release_my_end);
            std::mem::swap(&mut e.release_mz_start, &mut e.release_mz_end);
            std::mem::swap(&mut e.release_t_start, &mut e.release_t_end);
        }
    }
    for l in p.loads.iter_mut() {
        match l {
            SolverLoad3D::Distributed(d) if flip(d.element_id) => {
                let len = len3(&explicit, d.element_id);
                let o = d.clone();
                (d.q_yi, d.q_yj) = (o.q_yj, o.q_yi);
                (d.q_zi, d.q_zj) = (-o.q_zj, -o.q_zi);
                (d.q_xi, d.q_xj) = (-o.q_xj, -o.q_xi);
                d.a = o.b.map(|b| len - b).or(if o.a.is_some() { Some(0.0) } else { None });
                d.b = o.a.map(|a| len - a).or(if o.b.is_some() { Some(len) } else { None });
            }
            SolverLoad3D::PointOnElement(q) if flip(q.element_id) => {
                let len = len3(&explicit, q.element_id);
                q.a = len - q.a;
                q.pz = -q.pz;
            }
            SolverLoad3D::Thermal(t) if flip(t.element_id) => t.dt_gradient_z = -t.dt_gradient_z,
            _ => {}
        }
    }
    Ok(p)
}

/// Expected 3D end forces of a reversed member from the original ones.
pub fn map_forces_3d(f: &mut ElementForces3D) {
    let o = f.clone();
    (f.n_start, f.n_end) = (o.n_end, o.n_start);
    (f.vy_start, f.vy_end) = (-o.vy_end, -o.vy_start);
    (f.vz_start, f.vz_end) = (o.vz_end, o.vz_start);
    (f.mx_start, f.mx_end) = (o.mx_end, o.mx_start);
    (f.my_start, f.my_end) = (-o.my_end, -o.my_start);
    (f.mz_start, f.mz_end) = (o.mz_end, o.mz_start);
}
