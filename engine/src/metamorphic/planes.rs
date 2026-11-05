//! A plane frame placed in a coordinate plane of a 3D model, every out-of-plane
//! DOF restrained, and the 3D results read back in the frame's own axes.
//!
//! The frame's (x, z) map to the plane's (e1, e2); a 2D rotation or moment is the
//! component along n = e1 × e2. Iy = Iz and J = Iz, so the in-plane stiffness does
//! not depend on which local axis the plane's transverse direction became.

use super::{unrep, TResult};
use crate::element::compute_local_axes_3d;
use crate::types::*;
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Plane {
    XZ,
    XY,
    YZ,
}

impl Plane {
    pub const ALL: [Plane; 3] = [Plane::XZ, Plane::XY, Plane::YZ];

    /// The global axes (0 = X, 1 = Y, 2 = Z) the frame's x and z lie along.
    fn axes(self) -> (usize, usize) {
        match self {
            Plane::XZ => (0, 2),
            Plane::XY => (0, 1),
            Plane::YZ => (1, 2),
        }
    }

    pub fn e1(self) -> [f64; 3] {
        unit(self.axes().0)
    }

    pub fn e2(self) -> [f64; 3] {
        unit(self.axes().1)
    }

    pub fn normal(self) -> [f64; 3] {
        cross(self.e1(), self.e2())
    }

    pub fn point(self, x: f64, z: f64) -> [f64; 3] {
        add(scale(self.e1(), x), scale(self.e2(), z))
    }
}

fn unit(axis: usize) -> [f64; 3] {
    let mut v = [0.0; 3];
    v[axis] = 1.0;
    v
}

fn cross(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn add(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

fn scale(a: [f64; 3], k: f64) -> [f64; 3] {
    [a[0] * k, a[1] * k, a[2] * k]
}

/// The frame's transverse direction (−sin, cos) on the member's 3D local y and z.
struct Member {
    cy: f64,
    cz: f64,
}

fn member(s: &SolverInput, plane: Plane, eid: usize) -> TResult<Member> {
    let Some(e) = s.elements.values().find(|e| e.id == eid) else { return unrep(format!("load on missing element {eid}")) };
    let (Some(a), Some(b)) = (s.nodes.values().find(|n| n.id == e.node_i), s.nodes.values().find(|n| n.id == e.node_j)) else {
        return unrep(format!("element {eid} has a missing node"));
    };
    let l = (b.x - a.x).hypot(b.z - a.z);
    if !(l > 0.0) {
        return unrep(format!("element {eid} has zero length"));
    }
    let (pa, pb) = (plane.point(a.x, a.z), plane.point(b.x, b.z));
    let (_, ey, ez) = compute_local_axes_3d(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2], None, None, None, None, false);
    let t = add(scale(plane.e1(), -(b.z - a.z) / l), scale(plane.e2(), (b.x - a.x) / l));
    Ok(Member { cy: dot(ey, t), cz: dot(ez, t) })
}

fn restraint(plane: Plane, support: Option<&SolverSupport>) -> TResult<[bool; 6]> {
    let (x, z, r) = match support.map(|s| s.support_type.as_str()) {
        None | Some("spring") | Some("free") => (false, false, false),
        Some("fixed") => (true, true, true),
        Some("pinned") => (true, true, false),
        Some("rollerX") => (false, true, false),
        Some("rollerY") | Some("rollerZ") => (true, false, false),
        Some("guidedX") => (false, true, true),
        Some("guidedY") | Some("guidedZ") => (true, false, true),
        Some(t) => return unrep(format!("support type {t} has no plane-frame embedding")),
    };
    let (a1, a2) = plane.axes();
    let normal = 3 - a1 - a2;
    let mut out = [false; 6];
    out[a1] = x;
    out[a2] = z;
    out[normal] = true;
    out[3 + a1] = true;
    out[3 + a2] = true;
    out[3 + normal] = r;
    Ok(out)
}

pub fn embed_2d(s: &SolverInput, plane: Plane) -> TResult<SolverInput3D> {
    if !s.constraints.is_empty() {
        return unrep("constraints have no plane-frame embedding");
    }
    if !s.connectors.is_empty() {
        return unrep("connectors have no plane-frame embedding");
    }
    let (a1, a2) = plane.axes();
    let normal = 3 - a1 - a2;
    let n_sign = plane.normal()[normal];
    let nodes = s
        .nodes
        .iter()
        .map(|(k, n)| {
            let p = plane.point(n.x, n.z);
            (k.clone(), SolverNode3D { id: n.id, x: p[0], y: p[1], z: p[2] })
        })
        .collect();
    let sections = s
        .sections
        .iter()
        .map(|(k, c)| {
            (k.clone(), SolverSection3D {
                id: c.id, name: None, a: c.a, iy: c.iz, iz: c.iz, j: c.iz, cw: None, as_y: c.as_y, as_z: c.as_y,
                shear_center_y: None, shear_center_z: None,
            })
        })
        .collect();
    let elements = s
        .elements
        .iter()
        .map(|(k, e)| {
            (k.clone(), SolverElement3D {
                id: e.id, elem_type: e.elem_type.clone(), node_i: e.node_i, node_j: e.node_j,
                material_id: e.material_id, section_id: e.section_id,
                release_my_start: e.hinge_start, release_my_end: e.hinge_end,
                release_mz_start: e.hinge_start, release_mz_end: e.hinge_end,
                release_t_start: false, release_t_end: false,
                local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
            })
        })
        .collect();
    let mut by_node: HashMap<usize, &SolverSupport> = HashMap::new();
    for sup in crate::ordered::values(&s.supports) {
        if by_node.insert(sup.node_id, sup).is_some() {
            return unrep(format!("node {} has two supports", sup.node_id));
        }
        if sup.angle.is_some_and(|a| a != 0.0) {
            return unrep("a rotated support has no plane-frame embedding");
        }
    }
    let mut supports = HashMap::new();
    for n in s.nodes.values() {
        let sup = by_node.get(&n.id).copied();
        let r = restraint(plane, sup)?;
        let mut k = [None; 6];
        let mut d = [None; 6];
        if let Some(sup) = sup {
            k[a1] = sup.kx;
            k[a2] = sup.ky;
            k[3 + normal] = sup.kz;
            d[a1] = sup.dx;
            d[a2] = sup.dz;
            d[3 + normal] = sup.dry.map(|v| n_sign * v);
        }
        supports.insert(n.id.to_string(), SolverSupport3D {
            node_id: n.id, rx: r[0], ry: r[1], rz: r[2], rrx: r[3], rry: r[4], rrz: r[5],
            kx: k[0], ky: k[1], kz: k[2], krx: k[3], kry: k[4], krz: k[5],
            dx: d[0], dy: d[1], dz: d[2], drx: d[3], dry: d[4], drz: d[5],
            normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
        });
    }
    let mut loads = Vec::with_capacity(s.loads.len());
    for l in &s.loads {
        loads.push(match l {
            SolverLoad::Nodal(p) => {
                let f = add(scale(plane.e1(), p.fx), scale(plane.e2(), p.fz));
                let m = scale(plane.normal(), p.my);
                SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: p.node_id, fx: f[0], fy: f[1], fz: f[2], mx: m[0], my: m[1], mz: m[2], bw: None })
            }
            SolverLoad::Distributed(q) => {
                let m = member(s, plane, q.element_id)?;
                SolverLoad3D::Distributed(SolverDistributedLoad3D {
                    element_id: q.element_id, q_xi: 0.0, q_xj: 0.0,
                    q_yi: m.cy * q.q_i, q_yj: m.cy * q.q_j, q_zi: m.cz * q.q_i, q_zj: m.cz * q.q_j, a: q.a, b: q.b,
                })
            }
            SolverLoad::PointOnElement(p) => {
                if p.px.is_some_and(|v| v != 0.0) || p.my.is_some_and(|v| v != 0.0) {
                    return unrep("a point load with an axial part or a moment has no 3D equivalent");
                }
                let m = member(s, plane, p.element_id)?;
                SolverLoad3D::PointOnElement(SolverPointLoad3D { element_id: p.element_id, a: p.a, py: m.cy * p.p, pz: m.cz * p.p })
            }
            SolverLoad::AxialDistributed(q) => SolverLoad3D::Distributed(SolverDistributedLoad3D {
                element_id: q.element_id, q_xi: q.q_i, q_xj: q.q_j, q_yi: 0.0, q_yj: 0.0, q_zi: 0.0, q_zj: 0.0, a: q.a, b: q.b,
            }),
            SolverLoad::Thermal(t) => {
                let m = member(s, plane, t.element_id)?;
                SolverLoad3D::Thermal(SolverThermalLoad3D {
                    element_id: t.element_id, dt_uniform: t.dt_uniform,
                    // The 3D y gradient is the −y face minus the +y face, the z one the +z face minus the −z face.
                    dt_gradient_y: m.cy * t.dt_gradient, dt_gradient_z: -m.cz * t.dt_gradient,
                    alpha: t.alpha,
                    depth_y: t.depth.filter(|_| m.cy != 0.0),
                    depth_z: t.depth.filter(|_| m.cz != 0.0),
                })
            }
        });
    }
    Ok(SolverInput3D {
        solver_options: s.solver_options.clone(), masses: Default::default(), nodes, materials: s.materials.clone(), sections, elements, supports, loads,
        constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(), curved_beams: vec![], connectors: HashMap::new(),
    })
}

/// 3D static results read in the plane frame's axes, plus what the 2D model cannot have:
/// the largest force and moment out of the plane, or at a node the 2D model leaves unsupported.
#[derive(Debug, Clone, Default)]
pub struct PlanarStatic {
    /// (node, ux, uz, θ)
    pub displacements: Vec<(usize, f64, f64, f64)>,
    /// (node, Rx, Rz, M), summed per node.
    pub reactions: Vec<(usize, f64, f64, f64)>,
    /// (element, [N, V, M] at start, [N, V, M] at end)
    pub element_forces: Vec<(usize, [f64; 3], [f64; 3])>,
    pub stray_force: f64,
    pub stray_moment: f64,
    pub stray_translation: f64,
    pub stray_rotation: f64,
}

pub fn pull_static(s: &SolverInput, plane: Plane, r: &AnalysisResults3D) -> TResult<PlanarStatic> {
    let (e1, e2, n) = (plane.e1(), plane.e2(), plane.normal());
    let finite = r.displacements.iter().all(|d| [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz].iter().all(|v| v.is_finite()))
        && r.reactions.iter().all(|x| [x.fx, x.fy, x.fz, x.mx, x.my, x.mz].iter().all(|v| v.is_finite()))
        && r.element_forces.iter().all(|f| {
            [f.n_start, f.vy_start, f.vz_start, f.mx_start, f.my_start, f.mz_start, f.n_end, f.vy_end, f.vz_end, f.mx_end, f.my_end, f.mz_end].iter().all(|v| v.is_finite())
        });
    if !finite {
        return unrep("the 3D results are not finite");
    }
    let mut out = PlanarStatic::default();
    for d in &r.displacements {
        let (u, th) = ([d.ux, d.uy, d.uz], [d.rx, d.ry, d.rz]);
        out.stray_translation = out.stray_translation.max(dot(u, n).abs());
        out.stray_rotation = out.stray_rotation.max(dot(th, e1).abs()).max(dot(th, e2).abs());
        out.displacements.push((d.node_id, dot(u, e1), dot(u, e2), dot(th, n)));
    }
    let mut sums: std::collections::BTreeMap<usize, ([f64; 3], [f64; 3])> = Default::default();
    for x in &r.reactions {
        let e = sums.entry(x.node_id).or_default();
        e.0 = add(e.0, [x.fx, x.fy, x.fz]);
        e.1 = add(e.1, [x.mx, x.my, x.mz]);
    }
    let supported: std::collections::HashSet<usize> = s.supports.values().map(|x| x.node_id).collect();
    for (node, (f, m)) in sums {
        out.stray_force = out.stray_force.max(dot(f, n).abs());
        out.stray_moment = out.stray_moment.max(dot(m, e1).abs()).max(dot(m, e2).abs());
        let (rx, rz, rm) = (dot(f, e1), dot(f, e2), dot(m, n));
        if supported.contains(&node) {
            out.reactions.push((node, rx, rz, rm));
        } else {
            out.stray_force = out.stray_force.max(rx.hypot(rz));
            out.stray_moment = out.stray_moment.max(rm.abs());
        }
    }
    for f in &r.element_forces {
        let m = member(s, plane, f.element_id)?;
        let at = |nn: f64, vy: f64, vz: f64, mx: f64, my: f64, mz: f64, out: &mut PlanarStatic| {
            let v_off = -m.cz * vy + m.cy * vz;
            let m_off = (m.cy * my + m.cz * mz).abs().max(mx.abs());
            out.stray_force = out.stray_force.max(v_off.abs());
            out.stray_moment = out.stray_moment.max(m_off);
            [nn, m.cy * vy + m.cz * vz, m.cy * mz - m.cz * my]
        };
        let start = at(f.n_start, f.vy_start, f.vz_start, f.mx_start, f.my_start, f.mz_start, &mut out);
        let end = at(f.n_end, f.vy_end, f.vz_end, f.mx_end, f.my_end, f.mz_end, &mut out);
        out.element_forces.push((f.element_id, start, end));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_plane_is_right_handed_with_the_frame_rotation_along_its_normal() {
        assert_eq!(Plane::XZ.normal(), [0.0, -1.0, 0.0]);
        assert_eq!(Plane::XY.normal(), [0.0, 0.0, 1.0]);
        assert_eq!(Plane::YZ.normal(), [1.0, 0.0, 0.0]);
        for p in Plane::ALL {
            assert_eq!(dot(p.e1(), p.e2()), 0.0);
            assert_eq!(p.point(2.0, 3.0), add(scale(p.e1(), 2.0), scale(p.e2(), 3.0)));
        }
    }

    #[test]
    fn every_out_of_plane_dof_is_restrained_and_the_in_plane_ones_follow_the_support() {
        let pinned = SolverSupport { id: 1, node_id: 1, support_type: "pinned".into(), kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None };
        assert_eq!(restraint(Plane::XZ, Some(&pinned)).unwrap(), [true, true, true, true, false, true]);
        assert_eq!(restraint(Plane::XY, Some(&pinned)).unwrap(), [true, true, true, true, true, false]);
        assert_eq!(restraint(Plane::YZ, Some(&pinned)).unwrap(), [true, true, true, false, true, true]);
        assert_eq!(restraint(Plane::YZ, None).unwrap(), [true, false, false, false, true, true]);
        let inclined = SolverSupport { support_type: "inclinedRoller".into(), ..pinned };
        assert!(restraint(Plane::XZ, Some(&inclined)).is_err());
    }

    #[test]
    fn a_spring_value_on_a_rigid_support_type_carries_into_3d() {
        let sup = SolverSupport { id: 1, node_id: 1, support_type: "rollerX".into(), kx: Some(7.0), ky: Some(5.0), kz: Some(3.0), dx: None, dz: None, dry: None, angle: None };
        let s = SolverInput {
            nodes: HashMap::from([("1".into(), SolverNode { id: 1, x: 0.0, z: 0.0 })]),
            materials: HashMap::new(),
            sections: HashMap::new(),
            elements: HashMap::new(),
            supports: HashMap::from([("1".into(), sup)]),
            loads: Vec::new(),
            constraints: Vec::new(),
            connectors: HashMap::new(),
            solver_options: None,
            masses: Default::default(),
        };
        let t = embed_2d(&s, Plane::YZ).unwrap();
        let k = &t.supports["1"];
        assert_eq!([k.kx, k.ky, k.kz, k.krx, k.kry, k.krz], [None, Some(7.0), Some(5.0), Some(3.0), None, None]);
    }
}
