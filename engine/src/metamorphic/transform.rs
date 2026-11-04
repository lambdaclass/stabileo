//! Rigid motions of whole models (and the maps their results must obey).
//!
//! 2D models live in the X–Z plane; [`Iso2`] is any orthogonal map of that
//! plane (rotation, or mirror when `det = −1`) plus a translation. 3D models
//! take any proper rotation [`Iso3`] plus a translation (a 3D mirror would
//! turn the right-handed member local axes left-handed, which the format
//! expresses only through the model-wide `leftHand` flag).
//!
//! What each input becomes:
//!
//! * node positions: `p' = Q·p + t`;
//! * nodal forces rotate; nodal moments rotate as axial vectors (in 2D the
//!   in-plane moment is multiplied by `det Q`);
//! * member loads, thermal loads, pressures and edge loads are given in
//!   element axes and are unchanged — except under a 2D mirror, where the
//!   member's local y flips relative to the material (local x = I→J is
//!   mirrored with the geometry), so transverse loads, member moments and
//!   thermal gradients change sign;
//! * 3D member local axes: every member's actual axes are computed with the
//!   engine's own convention (default reference, explicit reference, roll,
//!   `leftHand`) and the rotated axes are written back as an explicit
//!   reference vector, then re-derived and checked;
//! * supports: the restrained translation set is a subspace; if the rotation
//!   maps it onto coordinate axes it stays a plain support (flags permuted),
//!   a single restrained direction that does not land on an axis becomes an
//!   inclined support, anything else is [`Unrepresentable`]. Spring
//!   stiffness tensors `R·K·Rᵀ` must stay diagonal (2D `"spring"` supports
//!   carry an angle and always can). Prescribed displacements rotate;
//! * constraints: DOF sets map like restraint sets; linear MPC coefficients
//!   rotate (`c' = R·c`, exact); diaphragm planes must map onto a coordinate
//!   plane; eccentric offsets rotate;
//! * connectors: finite-length connectors act in their chord axes and are
//!   invariant when their two transverse stiffnesses agree (the format gives
//!   no local axis for them); zero-length ones act in global axes and follow
//!   the spring rule;
//! * self-weight accelerations rotate.

use super::{unrep, TResult};
use crate::element::compute_local_axes_3d;
use crate::types::*;

pub type M2 = [[f64; 2]; 2];
pub type M3 = [[f64; 3]; 3];

/// Tolerance for "this rotated axis lands on a coordinate axis".
const AXIS_TOL: f64 = 1e-10;

// ==================== small linear algebra ====================

pub fn mat3_mul(a: &M3, b: &M3) -> M3 {
    let mut c = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            c[i][j] = (0..3).map(|k| a[i][k] * b[k][j]).sum();
        }
    }
    c
}
pub fn mat3_vec(r: &M3, v: &[f64; 3]) -> [f64; 3] {
    [
        r[0][0] * v[0] + r[0][1] * v[1] + r[0][2] * v[2],
        r[1][0] * v[0] + r[1][1] * v[1] + r[1][2] * v[2],
        r[2][0] * v[0] + r[2][1] * v[1] + r[2][2] * v[2],
    ]
}
pub fn mat3_t(r: &M3) -> M3 {
    [[r[0][0], r[1][0], r[2][0]], [r[0][1], r[1][1], r[2][1]], [r[0][2], r[1][2], r[2][2]]]
}
fn mat2_vec(q: &M2, v: [f64; 2]) -> [f64; 2] {
    [q[0][0] * v[0] + q[0][1] * v[1], q[1][0] * v[0] + q[1][1] * v[1]]
}

/// R·diag(d)·Rᵀ, returned as Some(new diagonal) when it is diagonal (relative
/// to its largest entry), None otherwise.
fn rotate_diag3(r: &M3, d: [f64; 3]) -> Option<[f64; 3]> {
    let mut k = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            k[i][j] = (0..3).map(|m| r[i][m] * d[m] * r[j][m]).sum();
        }
    }
    let scale = d.iter().fold(0.0f64, |a, &b| a.max(b.abs()));
    for i in 0..3 {
        for j in 0..3 {
            if i != j && k[i][j].abs() > AXIS_TOL * scale.max(f64::MIN_POSITIVE) {
                return None;
            }
        }
    }
    // Entries that are round-off of zero are zero: a positive spring on a
    // restrained DOF frees it (dof.rs), so 1e-28 must not stand for 0.
    let snap = |v: f64| if v.abs() <= AXIS_TOL * scale { 0.0 } else { v };
    Some([snap(k[0][0]), snap(k[1][1]), snap(k[2][2])])
}
fn rotate_diag2(q: &M2, d: [f64; 2]) -> Option<[f64; 2]> {
    let k01 = q[0][0] * d[0] * q[1][0] + q[0][1] * d[1] * q[1][1];
    let scale = d[0].abs().max(d[1].abs());
    if k01.abs() > AXIS_TOL * scale.max(f64::MIN_POSITIVE) {
        return None;
    }
    let k00 = q[0][0] * d[0] * q[0][0] + q[0][1] * d[1] * q[0][1];
    let k11 = q[1][0] * d[0] * q[1][0] + q[1][1] * d[1] * q[1][1];
    let snap = |v: f64| if v.abs() <= AXIS_TOL * scale { 0.0 } else { v };
    Some([snap(k00), snap(k11)])
}

/// Image of a set of coordinate axes under R, if it is again a set of axes.
fn axis_set3(r: &M3, set: [bool; 3]) -> Option<[bool; 3]> {
    let d = set.map(|b| if b { 1.0 } else { 0.0 });
    let img = rotate_diag3(r, d)?;
    let mut out = [false; 3];
    for i in 0..3 {
        if (img[i] - 1.0).abs() < AXIS_TOL {
            out[i] = true;
        } else if img[i].abs() >= AXIS_TOL {
            return None;
        }
    }
    Some(out)
}
fn axis_set2(q: &M2, set: [bool; 2]) -> Option<[bool; 2]> {
    let d = set.map(|b| if b { 1.0 } else { 0.0 });
    let img = rotate_diag2(q, d)?;
    let mut out = [false; 2];
    for i in 0..2 {
        if (img[i] - 1.0).abs() < AXIS_TOL {
            out[i] = true;
        } else if img[i].abs() >= AXIS_TOL {
            return None;
        }
    }
    Some(out)
}

fn rel_eq(a: f64, b: f64) -> bool {
    (a - b).abs() <= 1e-12 * a.abs().max(b.abs())
}

// ==================== 2D ====================

/// Orthogonal map of the X–Z plane plus translation: `p' = Q·p + t`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Iso2 {
    pub q: M2,
    pub t: [f64; 2],
}

impl Iso2 {
    /// Rotation by `phi` (from +X towards +Z, the engine's positive sense).
    pub fn rotation(phi: f64) -> Self {
        let (s, c) = phi.sin_cos();
        Iso2 { q: [[c, -s], [s, c]], t: [0.0, 0.0] }
    }
    /// Mirror x → −x (about the Z axis).
    pub fn mirror_x() -> Self {
        Iso2 { q: [[-1.0, 0.0], [0.0, 1.0]], t: [0.0, 0.0] }
    }
    /// Mirror about the line through the origin at angle `phi` from +X.
    pub fn mirror_line(phi: f64) -> Self {
        let (s, c) = (2.0 * phi).sin_cos();
        Iso2 { q: [[c, s], [s, -c]], t: [0.0, 0.0] }
    }
    pub fn translated(mut self, tx: f64, tz: f64) -> Self {
        self.t = [tx, tz];
        self
    }
    pub fn det(&self) -> f64 {
        self.q[0][0] * self.q[1][1] - self.q[0][1] * self.q[1][0]
    }
    pub fn apply_vec(&self, v: [f64; 2]) -> [f64; 2] {
        mat2_vec(&self.q, v)
    }
    pub fn apply_point(&self, p: [f64; 2]) -> [f64; 2] {
        let v = mat2_vec(&self.q, p);
        [v[0] + self.t[0], v[1] + self.t[1]]
    }
}

/// Restraint class of a 2D support type: (restrained translation normal if
/// exactly one translation is restrained, both translations, rotation).
enum Restraint2 {
    None,
    Both { rot: bool },
    One { n: [f64; 2], rot: bool },
}

fn restraint_2d(s: &SolverSupport) -> TResult<Restraint2> {
    Ok(match s.support_type.as_str() {
        "fixed" => Restraint2::Both { rot: true },
        "pinned" => Restraint2::Both { rot: false },
        "rollerX" => Restraint2::One { n: [0.0, 1.0], rot: false },
        "rollerY" | "rollerZ" => Restraint2::One { n: [1.0, 0.0], rot: false },
        "guidedX" => Restraint2::One { n: [0.0, 1.0], rot: true },
        "guidedY" | "guidedZ" => Restraint2::One { n: [1.0, 0.0], rot: true },
        "inclinedRoller" => match s.angle {
            Some(th) => Restraint2::One { n: [th.sin(), th.cos()], rot: false },
            None => Restraint2::One { n: [0.0, 1.0], rot: false },
        },
        "spring" => Restraint2::None,
        other => return unrep(format!("support type {other:?}")),
    })
}

fn transform_support_2d(s: &SolverSupport, iso: &Iso2) -> TResult<SolverSupport> {
    let det = iso.det();
    let mut o = s.clone();
    let d = [s.dx.unwrap_or(0.0), s.dz.unwrap_or(0.0)];
    let has_d = s.dx.is_some() || s.dz.is_some();
    match restraint_2d(s)? {
        Restraint2::None | Restraint2::Both { .. } => {
            if has_d {
                let d2 = iso.apply_vec(d);
                o.dx = Some(d2[0]);
                o.dz = Some(d2[1]);
            }
        }
        Restraint2::One { n, rot } => {
            let n2 = iso.apply_vec(n);
            let inclined = s.support_type == "inclinedRoller";
            let on_z = (n2[1].abs() - 1.0).abs() < AXIS_TOL;
            let on_x = (n2[0].abs() - 1.0).abs() < AXIS_TOL;
            if inclined || !(on_x || on_z) {
                if rot {
                    return unrep("guided support whose slide direction leaves the axes");
                }
                o.support_type = "inclinedRoller".into();
                o.angle = Some(n2[0].atan2(n2[1]));
            } else {
                let same = |a: &str, b: &str| if s.support_type == a || s.support_type == b { s.support_type.clone() } else { a.to_string() };
                o.support_type = match (rot, on_z) {
                    (false, true) => "rollerX".into(),
                    (false, false) => same("rollerZ", "rollerY"),
                    (true, true) => "guidedX".into(),
                    (true, false) => same("guidedZ", "guidedY"),
                };
                o.angle = None;
            }
            if has_d {
                // Only the normal component is prescribed (the tangential one
                // sits on a free DOF and is ignored); carry exactly that.
                let dn = n[0] * d[0] + n[1] * d[1];
                o.dx = Some(dn * n2[0]);
                o.dz = Some(dn * n2[1]);
            }
        }
    }
    o.dry = s.dry.map(|v| det * v);
    let (kx, ky) = (s.kx.unwrap_or(0.0), s.ky.unwrap_or(0.0));
    if kx != 0.0 || ky != 0.0 {
        if s.support_type == "spring" {
            // K = kx·a·aᵀ + ky·b·bᵀ with a = (cos α, sin α): rotate a.
            let al = s.angle.unwrap_or(0.0);
            let a2 = iso.apply_vec([al.cos(), al.sin()]);
            o.angle = Some(a2[1].atan2(a2[0]));
        } else {
            let k2 = rotate_diag2(&iso.q, [kx, ky]).ok_or_else(|| super::Unrepresentable("anisotropic translational springs on a rigid support type".into()))?;
            o.kx = s.kx.map(|_| k2[0]).or(if k2[0] != 0.0 { Some(k2[0]) } else { None });
            o.ky = s.ky.map(|_| k2[1]).or(if k2[1] != 0.0 { Some(k2[1]) } else { None });
        }
    }
    Ok(o)
}

/// Map a 2D DOF index set (0 = ux, 1 = uz, 2 = ry).
fn map_dofs_2d(q: &M2, dofs: &[usize]) -> TResult<Vec<usize>> {
    let t = [dofs.contains(&0), dofs.contains(&1)];
    let t2 = axis_set2(q, t).ok_or_else(|| super::Unrepresentable("constraint on a single translation that leaves the axes".into()))?;
    let mut out: Vec<usize> = (0..2).filter(|&i| t2[i]).collect();
    out.extend(dofs.iter().copied().filter(|&d| d >= 2));
    out.sort_unstable();
    out.dedup();
    Ok(out)
}

fn map_releases(len: usize, released: Vec<usize>) -> Vec<bool> {
    let n = len.max(released.iter().map(|d| d + 1).max().unwrap_or(0));
    (0..n).map(|i| released.contains(&i)).collect()
}

fn transform_constraints_2d(cs: &[Constraint], iso: &Iso2) -> TResult<Vec<Constraint>> {
    let det = iso.det();
    let mut out = Vec::with_capacity(cs.len());
    for c in cs {
        out.push(match c {
            Constraint::RigidLink(rl) => {
                let mut r = rl.clone();
                if !rl.dofs.is_empty() {
                    r.dofs = map_dofs_2d(&iso.q, &rl.dofs)?;
                }
                Constraint::RigidLink(r)
            }
            Constraint::Diaphragm(d) => Constraint::Diaphragm(d.clone()),
            Constraint::EqualDOF(e) => {
                let mut r = e.clone();
                r.dofs = map_dofs_2d(&iso.q, &e.dofs)?;
                Constraint::EqualDOF(r)
            }
            Constraint::EccentricConnection(ec) => {
                let mut r = ec.clone();
                // 2D: offset_x along X, offset_y along Z (constraints.rs).
                let o2 = iso.apply_vec([ec.offset_x, ec.offset_y]);
                r.offset_x = o2[0];
                r.offset_y = o2[1];
                let rel: Vec<usize> = ec.releases.iter().enumerate().filter(|(_, &b)| b).map(|(i, _)| i).collect();
                r.releases = map_releases(ec.releases.len(), map_dofs_2d(&iso.q, &rel)?);
                Constraint::EccentricConnection(r)
            }
            Constraint::LinearMPC(m) => {
                let mut nodes: Vec<usize> = Vec::new();
                for t in &m.terms {
                    if !nodes.contains(&t.node_id) {
                        nodes.push(t.node_id);
                    }
                }
                let mut terms = Vec::new();
                for nid in nodes {
                    let mut ct = [0.0; 2];
                    let mut cr = 0.0;
                    let mut other = Vec::new();
                    for t in m.terms.iter().filter(|t| t.node_id == nid) {
                        match t.dof {
                            0 | 1 => ct[t.dof] += t.coefficient,
                            2 => cr += t.coefficient,
                            _ => other.push(t.clone()),
                        }
                    }
                    let ct2 = iso.apply_vec(ct);
                    for (k, &v) in ct2.iter().enumerate() {
                        if v != 0.0 {
                            terms.push(MPCTerm { node_id: nid, dof: k, coefficient: v });
                        }
                    }
                    if cr != 0.0 {
                        terms.push(MPCTerm { node_id: nid, dof: 2, coefficient: det * cr });
                    }
                    terms.extend(other);
                }
                Constraint::LinearMPC(LinearMPCConstraint { terms })
            }
        });
    }
    Ok(out)
}

/// Rigidly move (rotate or mirror, then translate) a 2D model.
pub fn transform_2d(input: &SolverInput, iso: &Iso2) -> TResult<SolverInput> {
    let det = iso.det();
    let mut m = input.clone();
    for n in m.nodes.values_mut() {
        let p = iso.apply_point([n.x, n.z]);
        n.x = p[0];
        n.z = p[1];
    }
    for (k, s) in input.supports.iter() {
        m.supports.insert(k.clone(), transform_support_2d(s, iso)?);
    }
    for l in m.loads.iter_mut() {
        match l {
            SolverLoad::Nodal(nl) => {
                let f = iso.apply_vec([nl.fx, nl.fz]);
                nl.fx = f[0];
                nl.fz = f[1];
                nl.my *= det;
            }
            SolverLoad::Distributed(d) => {
                d.q_i *= det;
                d.q_j *= det;
            }
            SolverLoad::PointOnElement(p) => {
                p.p *= det;
                p.my = p.my.map(|v| v * det);
            }
            SolverLoad::Thermal(t) => t.dt_gradient *= det,
            // Along node i → node j, which a mirror keeps (as `px` above).
            SolverLoad::AxialDistributed(_) => {}
        }
    }
    m.constraints = transform_constraints_2d(&input.constraints, iso)?;
    for c in m.connectors.values_mut() {
        let (ni, nj) = (&input.nodes[&c.node_i.to_string()], &input.nodes[&c.node_j.to_string()]);
        let l = ((nj.x - ni.x).powi(2) + (nj.z - ni.z).powi(2)).sqrt();
        if l <= crate::element::connector::ZERO_LENGTH {
            let k2 = rotate_diag2(&iso.q, [c.k_axial, c.k_shear]).ok_or_else(|| super::Unrepresentable("anisotropic zero-length connector (acts in global axes)".into()))?;
            c.k_axial = k2[0];
            c.k_shear = k2[1];
        }
    }
    Ok(m)
}

/// The results a correct solver must give for `transform_2d(input, iso)`,
/// computed from the results of `input`: translations and reaction forces
/// rotate, rotations and moments are multiplied by `det Q`, member forces are
/// in member axes (under a mirror V and M change sign with local y).
pub fn map_results_2d(r: &AnalysisResults, iso: &Iso2) -> AnalysisResults {
    let det = iso.det();
    let mut o = r.clone();
    for d in o.displacements.iter_mut() {
        let u = iso.apply_vec([d.ux, d.uz]);
        d.ux = u[0];
        d.uz = u[1];
        d.ry *= det;
    }
    for x in o.reactions.iter_mut() {
        let f = iso.apply_vec([x.rx, x.rz]);
        x.rx = f[0];
        x.rz = f[1];
        x.my *= det;
    }
    for e in o.element_forces.iter_mut() {
        e.v_start *= det;
        e.v_end *= det;
        e.m_start *= det;
        e.m_end *= det;
    }
    o
}

// ==================== 3D ====================

/// Proper rotation plus translation: `p' = R·p + t`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Iso3 {
    pub r: M3,
    pub t: [f64; 3],
}

impl Iso3 {
    /// R = Rz(c)·Ry(b)·Rx(a).
    pub fn from_euler(a: f64, b: f64, c: f64) -> Self {
        let (sa, ca) = a.sin_cos();
        let (sb, cb) = b.sin_cos();
        let (sc, cc) = c.sin_cos();
        let rx = [[1.0, 0.0, 0.0], [0.0, ca, -sa], [0.0, sa, ca]];
        let ry = [[cb, 0.0, sb], [0.0, 1.0, 0.0], [-sb, 0.0, cb]];
        let rz = [[cc, -sc, 0.0], [sc, cc, 0.0], [0.0, 0.0, 1.0]];
        Iso3 { r: mat3_mul(&rz, &mat3_mul(&ry, &rx)), t: [0.0; 3] }
    }
    /// Rotation by `phi` about global Z (keeps a −Z gravity direction).
    pub fn about_z(phi: f64) -> Self {
        Self::from_euler(0.0, 0.0, phi)
    }
    /// A rotation from a uniformly distributed unit quaternion.
    pub fn random(rng: &mut super::Rng) -> Self {
        let (u1, u2, u3) = (rng.f64(), rng.f64(), rng.f64());
        let tau = std::f64::consts::TAU;
        let (a, b) = ((1.0 - u1).sqrt(), u1.sqrt());
        let (w, x, y, z) = (a * (tau * u2).sin(), a * (tau * u2).cos(), b * (tau * u3).sin(), b * (tau * u3).cos());
        let r = [
            [1.0 - 2.0 * (y * y + z * z), 2.0 * (x * y - z * w), 2.0 * (x * z + y * w)],
            [2.0 * (x * y + z * w), 1.0 - 2.0 * (x * x + z * z), 2.0 * (y * z - x * w)],
            [2.0 * (x * z - y * w), 2.0 * (y * z + x * w), 1.0 - 2.0 * (x * x + y * y)],
        ];
        Iso3 { r, t: [0.0; 3] }
    }
    /// The 24 proper rotations that map coordinate axes onto coordinate axes
    /// (signed permutation matrices with det +1), index 0..24. They keep every
    /// axis-aligned feature representable.
    pub fn axis_permutation(k: usize) -> Self {
        let perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
        let mut found = Vec::with_capacity(24);
        for p in perms {
            for signs in 0..8u32 {
                let mut r = [[0.0; 3]; 3];
                for i in 0..3 {
                    r[i][p[i]] = if signs & (1 << i) != 0 { -1.0 } else { 1.0 };
                }
                let det = r[0][0] * (r[1][1] * r[2][2] - r[1][2] * r[2][1]) - r[0][1] * (r[1][0] * r[2][2] - r[1][2] * r[2][0])
                    + r[0][2] * (r[1][0] * r[2][1] - r[1][1] * r[2][0]);
                if det > 0.0 {
                    found.push(r);
                }
            }
        }
        Iso3 { r: found[k % 24], t: [0.0; 3] }
    }
    pub fn translated(mut self, t: [f64; 3]) -> Self {
        self.t = t;
        self
    }
    pub fn apply_vec(&self, v: [f64; 3]) -> [f64; 3] {
        mat3_vec(&self.r, &v)
    }
    pub fn apply_point(&self, p: [f64; 3]) -> [f64; 3] {
        let v = mat3_vec(&self.r, &p);
        [v[0] + self.t[0], v[1] + self.t[1], v[2] + self.t[2]]
    }
    /// Whether R maps every coordinate axis onto a coordinate axis.
    pub fn is_axis_permutation(&self) -> bool {
        axis_set3(&self.r, [true, false, false]).is_some() && axis_set3(&self.r, [false, true, false]).is_some()
    }
}

fn transform_support_3d(s: &SolverSupport3D, iso: &Iso3) -> TResult<SolverSupport3D> {
    let r = &iso.r;
    let mut o = s.clone();
    let tflags = [s.rx, s.ry, s.rz];
    let rflags = [s.rrx, s.rry, s.rrz];
    let d = [s.dx.unwrap_or(0.0), s.dy.unwrap_or(0.0), s.dz.unwrap_or(0.0)];
    let has_d = s.dx.is_some() || s.dy.is_some() || s.dz.is_some();
    let normal = match (s.is_inclined.unwrap_or(false), s.normal_x, s.normal_y, s.normal_z) {
        (true, Some(x), Some(y), Some(z)) if (x * x + y * y + z * z).sqrt() > 1e-12 => Some([x, y, z]),
        _ => None,
    };
    let set_d = |o: &mut SolverSupport3D, v: [f64; 3]| {
        o.dx = Some(v[0]);
        o.dy = Some(v[1]);
        o.dz = Some(v[2]);
    };
    if let Some(n) = normal {
        let n2 = iso.apply_vec(n);
        o.normal_x = Some(n2[0]);
        o.normal_y = Some(n2[1]);
        o.normal_z = Some(n2[2]);
        // The translation flags are not read for an inclined support; carry
        // their image when there is one.
        if let Some(t2) = axis_set3(r, tflags) {
            o.rx = t2[0];
            o.ry = t2[1];
            o.rz = t2[2];
        }
        if has_d {
            set_d(&mut o, iso.apply_vec(d));
        }
    } else if let Some(t2) = axis_set3(r, tflags) {
        o.rx = t2[0];
        o.ry = t2[1];
        o.rz = t2[2];
        if has_d {
            set_d(&mut o, iso.apply_vec(d));
        }
    } else if tflags.iter().filter(|&&b| b).count() == 1 {
        let i = tflags.iter().position(|&b| b).unwrap();
        let mut e = [0.0; 3];
        e[i] = 1.0;
        let n2 = iso.apply_vec(e);
        o.is_inclined = Some(true);
        o.normal_x = Some(n2[0]);
        o.normal_y = Some(n2[1]);
        o.normal_z = Some(n2[2]);
        o.rx = false;
        o.ry = false;
        o.rz = false;
        if has_d {
            let dn = d[i];
            set_d(&mut o, [dn * n2[0], dn * n2[1], dn * n2[2]]);
        }
    } else {
        return unrep("support restraining two translations, rotated off the axes");
    }
    let r2 = axis_set3(r, rflags).ok_or_else(|| super::Unrepresentable("support restraining some rotations, rotated off the axes".into()))?;
    o.rrx = r2[0];
    o.rry = r2[1];
    o.rrz = r2[2];
    if s.drx.is_some() || s.dry.is_some() || s.drz.is_some() {
        let dr = iso.apply_vec([s.drx.unwrap_or(0.0), s.dry.unwrap_or(0.0), s.drz.unwrap_or(0.0)]);
        o.drx = Some(dr[0]);
        o.dry = Some(dr[1]);
        o.drz = Some(dr[2]);
    }
    let springs = |a: Option<f64>, b: Option<f64>, c: Option<f64>, what: &str| -> TResult<[Option<f64>; 3]> {
        if a.is_none() && b.is_none() && c.is_none() {
            return Ok([None, None, None]);
        }
        let k = rotate_diag3(r, [a.unwrap_or(0.0), b.unwrap_or(0.0), c.unwrap_or(0.0)])
            .ok_or_else(|| super::Unrepresentable(format!("anisotropic {what} springs rotated off the axes")))?;
        Ok(k.map(Some))
    };
    let [kx, ky, kz] = springs(s.kx, s.ky, s.kz, "translational")?;
    let [krx, kry, krz] = springs(s.krx, s.kry, s.krz, "rotational")?;
    (o.kx, o.ky, o.kz, o.krx, o.kry, o.krz) = (kx, ky, kz, krx, kry, krz);
    Ok(o)
}

/// Map a 3D DOF index set (0..2 translations, 3..5 rotations, 6 warping).
fn map_dofs_3d(r: &M3, dofs: &[usize]) -> TResult<Vec<usize>> {
    let t = [dofs.contains(&0), dofs.contains(&1), dofs.contains(&2)];
    let w = [dofs.contains(&3), dofs.contains(&4), dofs.contains(&5)];
    let t2 = axis_set3(r, t).ok_or_else(|| super::Unrepresentable("constraint DOF set rotated off the axes".into()))?;
    let w2 = axis_set3(r, w).ok_or_else(|| super::Unrepresentable("constraint DOF set rotated off the axes".into()))?;
    let mut out: Vec<usize> = (0..3).filter(|&i| t2[i]).collect();
    out.extend((0..3).filter(|&i| w2[i]).map(|i| i + 3));
    out.extend(dofs.iter().copied().filter(|&d| d >= 6));
    out.sort_unstable();
    out.dedup();
    Ok(out)
}

fn plane_normal(plane: &str) -> [f64; 3] {
    match plane {
        "XZ" => [0.0, 1.0, 0.0],
        "YZ" => [1.0, 0.0, 0.0],
        _ => [0.0, 0.0, 1.0],
    }
}

fn transform_constraints_3d(cs: &[Constraint], iso: &Iso3) -> TResult<Vec<Constraint>> {
    let r = &iso.r;
    let mut out = Vec::with_capacity(cs.len());
    for c in cs {
        out.push(match c {
            Constraint::RigidLink(rl) => {
                let mut x = rl.clone();
                if !rl.dofs.is_empty() {
                    x.dofs = map_dofs_3d(r, &rl.dofs)?;
                }
                Constraint::RigidLink(x)
            }
            Constraint::Diaphragm(d) => {
                let n2 = iso.apply_vec(plane_normal(&d.plane));
                let plane = if (n2[2].abs() - 1.0).abs() < AXIS_TOL {
                    "XY"
                } else if (n2[1].abs() - 1.0).abs() < AXIS_TOL {
                    "XZ"
                } else if (n2[0].abs() - 1.0).abs() < AXIS_TOL {
                    "YZ"
                } else {
                    return unrep("diaphragm plane rotated off the coordinate planes");
                };
                let mut x = d.clone();
                x.plane = plane.into();
                Constraint::Diaphragm(x)
            }
            Constraint::EqualDOF(e) => {
                let mut x = e.clone();
                x.dofs = map_dofs_3d(r, &e.dofs)?;
                Constraint::EqualDOF(x)
            }
            Constraint::EccentricConnection(ec) => {
                let mut x = ec.clone();
                let o2 = iso.apply_vec([ec.offset_x, ec.offset_y, ec.offset_z]);
                (x.offset_x, x.offset_y, x.offset_z) = (o2[0], o2[1], o2[2]);
                let rel: Vec<usize> = ec.releases.iter().enumerate().filter(|(_, &b)| b).map(|(i, _)| i).collect();
                x.releases = map_releases(ec.releases.len(), map_dofs_3d(r, &rel)?);
                Constraint::EccentricConnection(x)
            }
            Constraint::LinearMPC(m) => {
                let mut nodes: Vec<usize> = Vec::new();
                for t in &m.terms {
                    if !nodes.contains(&t.node_id) {
                        nodes.push(t.node_id);
                    }
                }
                let mut terms = Vec::new();
                for nid in nodes {
                    let (mut ct, mut cr) = ([0.0; 3], [0.0; 3]);
                    let mut other = Vec::new();
                    for t in m.terms.iter().filter(|t| t.node_id == nid) {
                        match t.dof {
                            0..=2 => ct[t.dof] += t.coefficient,
                            3..=5 => cr[t.dof - 3] += t.coefficient,
                            _ => other.push(t.clone()),
                        }
                    }
                    for (base, v) in [(0, iso.apply_vec(ct)), (3, iso.apply_vec(cr))] {
                        for (k, &c) in v.iter().enumerate() {
                            if c != 0.0 {
                                terms.push(MPCTerm { node_id: nid, dof: base + k, coefficient: c });
                            }
                        }
                    }
                    terms.extend(other);
                }
                Constraint::LinearMPC(LinearMPCConstraint { terms })
            }
        });
    }
    Ok(out)
}

fn npos3(m: &SolverInput3D, id: usize) -> [f64; 3] {
    let n = &m.nodes[&id.to_string()];
    [n.x, n.y, n.z]
}

fn axes_of(m: &SolverInput3D, e: &SolverElement3D) -> ([f64; 3], [f64; 3], [f64; 3]) {
    let (a, b) = (npos3(m, e.node_i), npos3(m, e.node_j));
    compute_local_axes_3d(a[0], a[1], a[2], b[0], b[1], b[2], e.local_yx, e.local_yy, e.local_yz, e.roll_angle, m.left_hand.unwrap_or(false))
}

/// Rigidly rotate and translate a 3D model. Curved beams are expanded into
/// their frame segments first (that is the model the solvers analyse).
pub fn transform_3d(input: &SolverInput3D, iso: &Iso3) -> TResult<SolverInput3D> {
    let src = crate::solver::linear::expand_curved_beams_3d(input);
    if !src.curved_beams.is_empty() {
        return unrep("curved beam that cannot be expanded");
    }
    let mut m = src.clone();
    for n in m.nodes.values_mut() {
        let p = iso.apply_point([n.x, n.y, n.z]);
        (n.x, n.y, n.z) = (p[0], p[1], p[2]);
    }
    let left = src.left_hand.unwrap_or(false);
    for (k, e) in src.elements.iter() {
        let (ex, ey, ez) = axes_of(&src, e);
        if ![ex, ey, ez].iter().all(|v| v.iter().all(|x| x.is_finite())) {
            return unrep(format!("element {} has no defined local axes", e.id));
        }
        let ey0 = if left { [-ey[0], -ey[1], -ey[2]] } else { ey };
        let r = iso.apply_vec(ey0);
        let ne = m.elements.get_mut(k).unwrap();
        (ne.local_yx, ne.local_yy, ne.local_yz, ne.roll_angle) = (Some(r[0]), Some(r[1]), Some(r[2]), None);
    }
    // Self-check: the re-derived axes are the rotated ones.
    for (k, e) in m.elements.iter() {
        let (ex, ey, ez) = axes_of(&m, e);
        let (ox, oy, oz) = axes_of(&src, &src.elements[k]);
        for (a, b) in [(ex, ox), (ey, oy), (ez, oz)] {
            let b2 = iso.apply_vec(b);
            if (0..3).any(|i| (a[i] - b2[i]).abs() > 1e-9) {
                return unrep(format!("element {} local axes not reproducible after rotation", e.id));
            }
        }
    }
    for (k, s) in src.supports.iter() {
        m.supports.insert(k.clone(), transform_support_3d(s, iso)?);
    }
    for l in m.loads.iter_mut() {
        let rot_g = |gx: &mut f64, gy: &mut f64, gz: &mut f64| {
            let g = iso.apply_vec([*gx, *gy, *gz]);
            (*gx, *gy, *gz) = (g[0], g[1], g[2]);
        };
        match l {
            SolverLoad3D::Nodal(nl) => {
                let f = iso.apply_vec([nl.fx, nl.fy, nl.fz]);
                let mm = iso.apply_vec([nl.mx, nl.my, nl.mz]);
                (nl.fx, nl.fy, nl.fz, nl.mx, nl.my, nl.mz) = (f[0], f[1], f[2], mm[0], mm[1], mm[2]);
            }
            SolverLoad3D::QuadSelfWeight(w) | SolverLoad3D::Quad9SelfWeight(w) | SolverLoad3D::CurvedShellSelfWeight(w) => {
                rot_g(&mut w.gx, &mut w.gy, &mut w.gz)
            }
            SolverLoad3D::SolidShellSelfWeight(w) => rot_g(&mut w.gx, &mut w.gy, &mut w.gz),
            // Element-axis loads (members, plates, shells) and bimoments.
            SolverLoad3D::Distributed(_)
            | SolverLoad3D::PointOnElement(_)
            | SolverLoad3D::Thermal(_)
            | SolverLoad3D::Pressure(_)
            | SolverLoad3D::PlateThermal(_)
            | SolverLoad3D::Bimoment(_)
            | SolverLoad3D::QuadPressure(_)
            | SolverLoad3D::QuadThermal(_)
            | SolverLoad3D::QuadEdge(_)
            | SolverLoad3D::Quad9Pressure(_)
            | SolverLoad3D::Quad9Thermal(_)
            | SolverLoad3D::Quad9Edge(_)
            | SolverLoad3D::SolidShellPressure(_)
            | SolverLoad3D::CurvedShellPressure(_)
            | SolverLoad3D::CurvedShellThermal(_)
            | SolverLoad3D::CurvedShellEdge(_) => {}
        }
    }
    m.constraints = transform_constraints_3d(&src.constraints, iso)?;
    for cs in m.curved_shells.values_mut() {
        if let Some(ns) = cs.normals.as_mut() {
            for n in ns.iter_mut() {
                *n = iso.apply_vec(*n);
            }
        }
    }
    for c in m.connectors.values_mut() {
        let (a, b) = (npos3(&src, c.node_i), npos3(&src, c.node_j));
        let l = ((b[0] - a[0]).powi(2) + (b[1] - a[1]).powi(2) + (b[2] - a[2]).powi(2)).sqrt();
        if l <= crate::element::connector::ZERO_LENGTH {
            let t = rotate_diag3(&iso.r, [c.k_axial, c.k_shear, c.k_shear_z]).ok_or_else(|| super::Unrepresentable("anisotropic zero-length connector (acts in global axes)".into()))?;
            let w = rotate_diag3(&iso.r, [c.k_moment, c.k_bend_y, c.k_bend_z]).ok_or_else(|| super::Unrepresentable("anisotropic zero-length connector (acts in global axes)".into()))?;
            (c.k_axial, c.k_shear, c.k_shear_z, c.k_moment, c.k_bend_y, c.k_bend_z) = (t[0], t[1], t[2], w[0], w[1], w[2]);
        } else if !rel_eq(c.k_shear, c.k_shear_z) || !rel_eq(c.k_bend_y, c.k_bend_z) {
            // The transverse axes come from a global reference the format
            // offers no way to rotate.
            return unrep("connector with unequal transverse stiffnesses (no local axis in the format)");
        }
    }
    Ok(m)
}

/// The results a correct solver must give for `transform_3d(input, iso)`:
/// translations, rotations, reaction forces and moments rotate; member end
/// forces and shell stresses are in element axes, which rotate with the model.
pub fn map_results_3d(r: &AnalysisResults3D, iso: &Iso3) -> AnalysisResults3D {
    let mut o = r.clone();
    for d in o.displacements.iter_mut() {
        let u = iso.apply_vec([d.ux, d.uy, d.uz]);
        let w = iso.apply_vec([d.rx, d.ry, d.rz]);
        (d.ux, d.uy, d.uz, d.rx, d.ry, d.rz) = (u[0], u[1], u[2], w[0], w[1], w[2]);
    }
    for x in o.reactions.iter_mut() {
        let f = iso.apply_vec([x.fx, x.fy, x.fz]);
        let m = iso.apply_vec([x.mx, x.my, x.mz]);
        (x.fx, x.fy, x.fz, x.mx, x.my, x.mz) = (f[0], f[1], f[2], m[0], m[1], m[2]);
    }
    o
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn axis_permutations_are_24_distinct_proper_rotations() {
        let mut seen = Vec::new();
        for k in 0..24 {
            let r = Iso3::axis_permutation(k).r;
            assert!(!seen.contains(&r));
            assert!(Iso3 { r, t: [0.0; 3] }.is_axis_permutation());
            seen.push(r);
        }
    }

    #[test]
    fn axis_sets_map_only_onto_axes() {
        let r = Iso3::about_z(std::f64::consts::FRAC_PI_2).r;
        assert_eq!(axis_set3(&r, [true, false, false]), Some([false, true, false]));
        assert_eq!(axis_set3(&r, [false, false, true]), Some([false, false, true]));
        let r = Iso3::about_z(0.3).r;
        assert_eq!(axis_set3(&r, [true, false, false]), None);
        assert_eq!(axis_set3(&r, [true, true, false]), Some([true, true, false]));
    }

    #[test]
    fn mirror_and_rotation_2d_determinants() {
        assert!((Iso2::rotation(0.7).det() - 1.0).abs() < 1e-15);
        assert!((Iso2::mirror_x().det() + 1.0).abs() < 1e-15);
        assert!((Iso2::mirror_line(0.4).det() + 1.0).abs() < 1e-15);
    }
}
