//! A 3D frame model reflected in a coordinate plane. Forces and translations reflect as vectors;
//! moments and rotations are axial, so they reflect and change sign. Each member keeps its
//! reflected local y, so its local z (x × y) is minus the reflected one, and every quantity along
//! local z changes sign.

use super::transform::axes_of;
use super::{unrep, TResult};
use crate::types::*;

fn reflect(v: [f64; 3], axis: usize) -> [f64; 3] {
    let mut v = v;
    v[axis] = -v[axis];
    v
}

fn reflect_axial(v: [f64; 3], axis: usize) -> [f64; 3] {
    let r = reflect(v, axis);
    [-r[0], -r[1], -r[2]]
}

/// `s` reflected in the plane through the origin normal to global `axis`, then moved by `t`.
pub fn mirror_3d(s: &SolverInput3D, axis: usize, t: [f64; 3]) -> TResult<SolverInput3D> {
    let src = crate::solver::linear::expand_curved_beams_3d(s);
    if !src.curved_beams.is_empty() {
        return unrep("curved beam that cannot be expanded");
    }
    if src.left_hand.unwrap_or(false) {
        return unrep("left-handed member axes");
    }
    if !(src.plates.is_empty() && src.quads.is_empty() && src.quad9s.is_empty() && src.solid_shells.is_empty() && src.curved_shells.is_empty()) {
        return unrep("shells and plates have no mirror rule yet");
    }
    if !src.connectors.is_empty() || !src.constraints.is_empty() {
        return unrep("connectors and constraints have no mirror rule yet");
    }
    let mut m = src.clone();
    for n in m.nodes.values_mut() {
        let p = reflect([n.x, n.y, n.z], axis);
        (n.x, n.y, n.z) = (p[0] + t[0], p[1] + t[1], p[2] + t[2]);
    }
    for (k, e) in &src.elements {
        let (ex, ey, ez) = axes_of(&src, e);
        if ![ex, ey, ez].iter().all(|v| v.iter().all(|x| x.is_finite())) {
            return unrep(format!("element {} has no defined local axes", e.id));
        }
        let y = reflect(ey, axis);
        let ne = m.elements.get_mut(k).unwrap();
        (ne.local_yx, ne.local_yy, ne.local_yz, ne.roll_angle) = (Some(y[0]), Some(y[1]), Some(y[2]), None);
    }
    for (k, e) in &m.elements {
        let (ex, ey, ez) = axes_of(&m, e);
        let (ox, oy, oz) = axes_of(&src, &src.elements[k]);
        let oz = reflect(oz, axis);
        for (a, b) in [(ex, reflect(ox, axis)), (ey, reflect(oy, axis)), (ez, [-oz[0], -oz[1], -oz[2]])] {
            if (0..3).any(|i| (a[i] - b[i]).abs() > 1e-9) {
                return unrep(format!("element {} local axes not reproducible after reflection", e.id));
            }
        }
    }
    for sec in m.sections.values_mut() {
        sec.shear_center_z = sec.shear_center_z.map(|z| -z);
    }
    for sup in m.supports.values_mut() {
        if sup.is_inclined.unwrap_or(false) {
            return unrep("inclined support");
        }
        if [sup.dx, sup.dy, sup.dz].iter().any(Option::is_some) {
            let d = reflect([sup.dx.unwrap_or(0.0), sup.dy.unwrap_or(0.0), sup.dz.unwrap_or(0.0)], axis);
            (sup.dx, sup.dy, sup.dz) = (sup.dx.map(|_| d[0]), sup.dy.map(|_| d[1]), sup.dz.map(|_| d[2]));
        }
        if [sup.drx, sup.dry, sup.drz].iter().any(Option::is_some) {
            let d = reflect_axial([sup.drx.unwrap_or(0.0), sup.dry.unwrap_or(0.0), sup.drz.unwrap_or(0.0)], axis);
            (sup.drx, sup.dry, sup.drz) = (sup.drx.map(|_| d[0]), sup.dry.map(|_| d[1]), sup.drz.map(|_| d[2]));
        }
    }
    for l in m.loads.iter_mut() {
        match l {
            SolverLoad3D::Nodal(n) => {
                if n.bw.is_some_and(|b| b != 0.0) {
                    return unrep("nodal bimoment");
                }
                let f = reflect([n.fx, n.fy, n.fz], axis);
                let mm = reflect_axial([n.mx, n.my, n.mz], axis);
                (n.fx, n.fy, n.fz, n.mx, n.my, n.mz) = (f[0], f[1], f[2], mm[0], mm[1], mm[2]);
            }
            SolverLoad3D::Distributed(d) => (d.q_zi, d.q_zj) = (-d.q_zi, -d.q_zj),
            SolverLoad3D::PointOnElement(p) => p.pz = -p.pz,
            SolverLoad3D::Thermal(t) => t.dt_gradient_z = -t.dt_gradient_z,
            _ => return unrep("a load with no mirror rule yet"),
        }
    }
    Ok(m)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_axial_vector_reflects_and_changes_sign() {
        assert_eq!(reflect([1.0, 2.0, 3.0], 1), [1.0, -2.0, 3.0]);
        assert_eq!(reflect_axial([1.0, 2.0, 3.0], 1), [-1.0, 2.0, -3.0]);
    }
}
