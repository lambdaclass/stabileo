//! Exact detection of mechanisms, before assembly.
//!
//! A mechanism is a motion of the model that no element, spring, support or
//! constraint resists: its stiffness is exactly zero, so the stiffness matrix
//! is singular and any displacement along it is as good as any other. The
//! factorization does not reliably show it — rounding leaves a mechanism's
//! Cholesky pivot anywhere from 1e-16 to 1e-8 of its diagonal, while regular
//! models with stiff springs reach 1e-8 too (`definiteness.rs`) — so this
//! check does not look at the stiffness values at all. It works on the
//! kinematics: every element contributes the linear conditions its strain
//! energy vanishes under (a truss: no elongation; an unreleased frame or a
//! shell: the motion of its nodes is rigid; a frame with releases: rigid
//! except about the released axes; a connector spring: its compatibility
//! row), every support and spring restrains its components, every constraint
//! adds its equation. The model is a mechanism exactly when those conditions
//! leave a non-zero nodal motion free.
//!
//! The conditions are built from the model's own numbers — every finite f64
//! is a dyadic rational, and differences of coordinates are taken exactly —
//! and their rank is computed modulo a 61-bit prime, which is exact rational
//! arithmetic seen through a ring homomorphism: a rank found full modulo `p`
//! is full over the rationals (a non-zero minor mod p is non-zero), so a model
//! passes with certainty. A rank deficiency modulo `p` could, in principle,
//! be a minor divisible by `p`; it is re-checked modulo a second prime and
//! reported only if both agree (and with it the free motion, computed in
//! floating point alongside for the description only).
//!
//! What is not a mechanism here: the rotation of a single node that nothing
//! couples to (a node reached only by trusses, or by members all released
//! there). The solver holds those with artificial stiffness and they move no
//! other part of the model; they matter only if a moment is applied there,
//! which `refuse_unresisted_loads_*` refuses. Nodes referenced by nothing at
//! all are left to the isolated-node gate, and a load on one is refused.
//!
//! Kernels the elements themselves may have beyond these conditions (shell
//! drilling, warping) are not modelled; assuming the elements are stiffer
//! than they are can only miss a mechanism, never invent one, and the
//! factorization checks still apply.

use std::collections::{HashMap, HashSet};

use super::dof::DofNumbering;
use crate::types::*;

/// Moduli of the exact rank computation: the Mersenne prime 2^61 − 1 and the
/// largest prime below 2^62. A deficiency must show modulo both.
const PRIMES: [u64; 2] = [(1u64 << 61) - 1, (1u64 << 62) - 57];

/// Work limit of the elimination (multiply-adds). Above it the model is left
/// unchecked rather than slowing every solve down.
const WORK_BUDGET: u64 = 40_000_000;

/// Largest number of free motions whose exact basis is kept for the check of
/// the loads' work; with more, any load refuses the model.
const BASIS_CAP: usize = 256;

// ---------------------------------------------------------------------------
// Arithmetic modulo p
// ---------------------------------------------------------------------------

#[derive(Clone, Copy)]
struct Field {
    p: u64,
    inv2: u64,
}

impl Field {
    fn new(p: u64) -> Self {
        Field { p, inv2: (p + 1) / 2 }
    }
    #[inline]
    fn add(self, a: u64, b: u64) -> u64 {
        let s = a + b;
        if s >= self.p { s - self.p } else { s }
    }
    #[inline]
    fn sub(self, a: u64, b: u64) -> u64 {
        if a >= b { a - b } else { a + self.p - b }
    }
    #[inline]
    fn neg(self, a: u64) -> u64 {
        if a == 0 { 0 } else { self.p - a }
    }
    #[inline]
    fn mul(self, a: u64, b: u64) -> u64 {
        ((a as u128 * b as u128) % self.p as u128) as u64
    }
    fn pow(self, mut b: u64, mut e: u64) -> u64 {
        let mut r = 1;
        while e > 0 {
            if e & 1 == 1 {
                r = self.mul(r, b);
            }
            b = self.mul(b, b);
            e >>= 1;
        }
        r
    }
    fn inv(self, a: u64) -> u64 {
        self.pow(a, self.p - 2)
    }
    /// The image of the exact rational value of a finite f64.
    fn of(self, x: f64) -> u64 {
        if x == 0.0 || !x.is_finite() {
            return 0;
        }
        let bits = x.to_bits();
        let negative = bits >> 63 == 1;
        let e = ((bits >> 52) & 0x7ff) as i64;
        let frac = bits & ((1u64 << 52) - 1);
        let (m, k) = if e == 0 { (frac, -1074) } else { (frac | (1u64 << 52), e - 1075) };
        let scale = if k >= 0 { self.pow(2, k as u64) } else { self.pow(self.inv2, (-k) as u64) };
        let v = self.mul(m % self.p, scale);
        if negative { self.neg(v) } else { v }
    }
}

/// A coefficient: its exact image modulo p, and its floating-point value
/// (used only to describe a free motion).
#[derive(Clone, Copy, Debug)]
struct C {
    m: u64,
    r: f64,
}

// ---------------------------------------------------------------------------
// The model's kinematic conditions
// ---------------------------------------------------------------------------

/// A nodal DOF: 2D 0 = ux, 1 = uz, 2 = θ; 3D 0..3 translations, 3..6 rotations.
#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Debug)]
struct Sym {
    node: u32,
    dof: u8,
}

/// How a local y axis is obtained exactly from the chord d: as `r × d` for a
/// reference r (the default axes: r = global up, or X for near-vertical
/// members; a connector's frame), or as the component of r normal to d (a
/// user's local-y vector; with a roll angle, the element's computed y).
#[derive(Clone, Copy)]
enum YRef {
    Cross([f64; 3]),
    Project([f64; 3]),
    /// A base axis (`Cross`/`Project`) turned about the chord by a whole
    /// number of quarter turns (a roll angle of 90°, 180°, …), exactly.
    Turned(&'static str, [f64; 3], u8),
}

/// A 3D frame with at least one released end axis.
struct Released3D {
    i: u32,
    j: u32,
    /// The element's local y axis as it computes it; the conditions use the
    /// exact component of it normal to the chord, and the exact cross product
    /// for z, so the three axes are exactly orthogonal (the f64 ones are not,
    /// and that noise could hide a mechanism from an exact rank).
    ey: YRef,
    /// Per end (i, j): whether the rotation about each local axis is coupled.
    coupled: [[bool; 3]; 2],
}

struct Model {
    three_d: bool,
    has_rot: bool,
    ids: Vec<usize>,
    pos: Vec<[f64; 3]>,
    referenced: Vec<bool>,
    /// Node sets that move together rigidly, rotations included (unreleased
    /// frames, shells).
    full_links: Vec<Vec<u32>>,
    /// Node sets whose translations move rigidly (solid shells: translation
    /// DOFs only).
    trans_links: Vec<Vec<u32>>,
    trusses: Vec<(u32, u32)>,
    /// 2D frames with a hinge: (i, j, hinge at i, hinge at j).
    frames_2d: Vec<(u32, u32, bool, bool)>,
    frames_3d: Vec<Released3D>,
    /// Conditions with coefficients taken as given (supports, springs,
    /// constraints).
    rows: Vec<Vec<(Sym, f64)>>,
    connectors: Vec<Conn>,
    /// Node pairs connected by anything, for naming the part that moves.
    links: Vec<(u32, u32)>,
    unchecked: Option<String>,
}

impl Model {
    fn new(three_d: bool, has_rot: bool, mut nodes: Vec<(usize, [f64; 3])>) -> Self {
        nodes.sort_by_key(|n| n.0);
        let unchecked = nodes
            .iter()
            .any(|n| n.1.iter().any(|v| !v.is_finite()))
            .then(|| "non-finite node coordinates".to_string());
        Model {
            three_d,
            has_rot,
            ids: nodes.iter().map(|n| n.0).collect(),
            pos: nodes.iter().map(|n| n.1).collect(),
            referenced: vec![false; nodes.len()],
            full_links: Vec::new(),
            trans_links: Vec::new(),
            trusses: Vec::new(),
            frames_2d: Vec::new(),
            frames_3d: Vec::new(),
            rows: Vec::new(),
            connectors: Vec::new(),
            links: Vec::new(),
            unchecked,
        }
    }
    fn nt(&self) -> usize {
        if self.three_d { 3 } else { 2 }
    }
    fn nr(&self) -> usize {
        match (self.has_rot, self.three_d) {
            (false, _) => 0,
            (true, true) => 3,
            (true, false) => 1,
        }
    }
    fn index(&self, id: usize) -> Option<u32> {
        self.ids.binary_search(&id).ok().map(|i| i as u32)
    }
    fn touch(&mut self, nodes: &[u32]) {
        for &n in nodes {
            self.referenced[n as usize] = true;
        }
        for w in nodes.windows(2) {
            self.links.push((w[0], w[1]));
        }
    }
    fn fail(&mut self, why: String) {
        if self.unchecked.is_none() {
            self.unchecked = Some(why);
        }
    }
    fn add_row(&mut self, row: Vec<(Sym, f64)>) {
        if row.iter().any(|t| !t.1.is_finite()) {
            self.fail("non-finite support, spring, connector or constraint data".into());
            return;
        }
        let row: Vec<(Sym, f64)> = row.into_iter().filter(|t| t.1 != 0.0).collect();
        if !row.is_empty() {
            self.rows.push(row);
        }
    }
    fn node_ids(&self, nodes: &[usize]) -> Option<Vec<u32>> {
        nodes.iter().map(|&n| self.index(n)).collect()
    }
}

/// The constraint equations as rows over nodal DOFs (global components), the
/// same equations the constrained solver imposes.
fn add_constraint_rows(m: &mut Model, eqs: Vec<(usize, Vec<(usize, f64)>)>, dof_num: &DofNumbering) {
    let mut back: HashMap<usize, (usize, usize)> = HashMap::new();
    for (&(node, local), &idx) in &dof_num.map {
        back.insert(idx, (node, local));
    }
    let max_local = m.nt() + m.nr();
    for (dep, terms) in eqs {
        let mut row: Vec<(Sym, f64)> = Vec::new();
        let mut warping = 0;
        let all = std::iter::once((dep, 1.0)).chain(terms.into_iter().map(|(d, a)| (d, -a)));
        let mut count = 0;
        for (d, a) in all {
            count += 1;
            let Some(&(node, local)) = back.get(&d) else { continue };
            if local >= max_local {
                warping += 1;
                continue;
            }
            let Some(n) = m.index(node) else { continue };
            row.push((Sym { node: n, dof: local as u8 }, a));
        }
        if warping > 0 {
            if warping < count {
                m.fail("a constraint couples warping with other DOFs".into());
            }
            continue;
        }
        let nodes: Vec<u32> = row.iter().map(|t| t.0.node).collect();
        m.touch(&nodes);
        m.add_row(row);
    }
}

/// A connector: its springs (stiffness, row over [node i DOFs, node j DOFs],
/// 3 or 6 per node) as the element builds them, used as given for a
/// zero-length one (global axes, exact); with length, the rows are rebuilt
/// from the chord exactly (`connector_rows`).
struct Conn {
    i: u32,
    j: u32,
    springs: Vec<(f64, Vec<f64>)>,
    zero_length: bool,
}

fn add_connector(m: &mut Model, i: u32, j: u32, springs: Vec<(f64, Vec<f64>)>, l: f64) {
    m.touch(&[i, j]);
    if springs.iter().any(|(k, b)| !k.is_finite() || b.iter().any(|v| !v.is_finite())) {
        m.fail("non-finite connector data".into());
        return;
    }
    let zero_length = !(l > crate::element::connector::ZERO_LENGTH);
    m.connectors.push(Conn { i, j, springs, zero_length });
}

fn model_2d(input: &SolverInput, constraints: &[Constraint]) -> Model {
    let dof_num = DofNumbering::build_2d(input);
    let has_rot = dof_num.dofs_per_node >= 3;
    let mut m = Model::new(false, has_rot, input.nodes.values().map(|n| (n.id, [n.x, n.z, 0.0])).collect());
    let mut elems: Vec<&SolverElement> = input.elements.values().collect();
    elems.sort_by_key(|e| e.id);
    for e in elems {
        let (Some(i), Some(j)) = (m.index(e.node_i), m.index(e.node_j)) else {
            m.fail(format!("element {} references a missing node", e.id));
            continue;
        };
        m.touch(&[i, j]);
        if e.elem_type == "truss" || e.elem_type == "cable" {
            m.trusses.push((i, j));
        } else if !e.hinge_start && !e.hinge_end {
            m.full_links.push(vec![i, j]);
        } else {
            m.frames_2d.push((i, j, e.hinge_start, e.hinge_end));
        }
    }
    let node_by_id: HashMap<usize, &SolverNode> = input.nodes.values().map(|n| (n.id, n)).collect();
    for c in crate::element::connector::sorted_by_id(&input.connectors) {
        let (Some(i), Some(j), Some(ni), Some(nj)) =
            (m.index(c.node_i), m.index(c.node_j), node_by_id.get(&c.node_i), node_by_id.get(&c.node_j))
        else {
            m.fail(format!("connector {} references a missing node", c.id));
            continue;
        };
        let springs = crate::element::connector::connector_element_springs_2d(c, ni, nj);
        let l = ((nj.x - ni.x).powi(2) + (nj.z - ni.z).powi(2)).sqrt();
        add_connector(&mut m, i, j, springs.iter().map(|(k, b)| (*k, b.to_vec())).collect(), l);
    }
    let mut sups: Vec<&SolverSupport> = input.supports.values().collect();
    sups.sort_by_key(|s| s.id);
    for s in sups {
        let Some(n) = m.index(s.node_id) else { continue };
        let u = |d: u8| Sym { node: n, dof: d };
        let restrained: &[u8] = match s.support_type.as_str() {
            "fixed" => &[0, 1, 2],
            "pinned" => &[0, 1],
            "rollerX" => &[1],
            "rollerY" | "rollerZ" => &[0],
            "guidedX" => &[1, 2],
            "guidedY" | "guidedZ" => &[0, 2],
            _ => &[],
        };
        for &d in restrained {
            if d < 2 || has_rot {
                m.add_row(vec![(u(d), 1.0)]);
            }
        }
        if s.support_type == "inclinedRoller" {
            if let Some(theta) = s.angle {
                // the restrained (normal) direction is row 1 of the frame
                let r = super::assembly::inclined_rotation_matrix_2d(theta);
                m.add_row(vec![(u(0), r[1][0]), (u(1), r[1][1])]);
            } else {
                m.add_row(vec![(u(1), 1.0)]);
            }
        }
        let kx = s.kx.unwrap_or(0.0);
        let ky = s.ky.unwrap_or(0.0);
        let rotated = s.support_type == "spring"
            && s.angle.is_some_and(|a| a.abs() > 1e-15)
            && (kx > 0.0 || ky > 0.0);
        if rotated {
            let a = s.angle.unwrap_or(0.0);
            let (c, sn) = (a.cos(), a.sin());
            if kx > 0.0 {
                m.add_row(vec![(u(0), c), (u(1), sn)]);
            }
            if ky > 0.0 {
                m.add_row(vec![(u(0), -sn), (u(1), c)]);
            }
        } else {
            if kx > 0.0 {
                m.add_row(vec![(u(0), 1.0)]);
            }
            if ky > 0.0 {
                m.add_row(vec![(u(1), 1.0)]);
            }
        }
        if s.kz.unwrap_or(0.0) > 0.0 && has_rot {
            m.add_row(vec![(u(2), 1.0)]);
        }
    }
    if !constraints.is_empty() {
        let eqs = super::constraints::constraint_equations(constraints, &dof_num, Some(&input.nodes), None);
        add_constraint_rows(&mut m, eqs, &dof_num);
    }
    m
}

/// The exact counterpart of `compute_local_axes_3d`'s y axis (see `YRef`):
/// without a roll angle the element's y is the normalized r × d (default
/// axes) or the component of the user's vector normal to d, whatever the
/// handedness (which only flips its sign).
fn frame_y_ref(e: &SolverElement3D, ex: [f64; 3], ey: [f64; 3]) -> YRef {
    let base = match (e.local_yx, e.local_yy, e.local_yz) {
        (Some(x), Some(y), Some(z)) if (x * x + y * y + z * z).sqrt() > 1e-10 => ("project", [x, y, z]),
        _ => ("cross", if ex[2].abs() > 0.999 { [1.0, 0.0, 0.0] } else { [0.0, 0.0, 1.0] }),
    };
    match e.roll_angle {
        Some(a) if a != 0.0 => {
            let q = (a / 90.0).round();
            if q * 90.0 == a {
                YRef::Turned(base.0, base.1, (q.rem_euclid(4.0)) as u8)
            } else {
                // a general roll: the element's own (rounded) y axis
                YRef::Project(ey)
            }
        }
        _ if base.0 == "project" => YRef::Project(base.1),
        _ => YRef::Cross(base.1),
    }
}

fn model_3d(input: &SolverInput3D, constraints: &[Constraint]) -> Model {
    let dof_num = DofNumbering::build_3d(input);
    let has_rot = dof_num.dofs_per_node >= 6;
    let mut m = Model::new(true, has_rot, input.nodes.values().map(|n| (n.id, [n.x, n.y, n.z])).collect());
    // With `leftHand` the frame elements transform rotations like
    // translations (det R = −1), so their kernels are the mirrored rigid
    // motions u_j = u_i − θ × d. On frames, trusses and supports alone that is
    // the same check with every rotation negated; mixed with constraints,
    // connectors or shells (which use +θ × r) the engine's kinematics are not
    // the model's, and the model is left unchecked (#403 findings).
    let shells = !(input.plates.is_empty() && input.quads.is_empty() && input.quad9s.is_empty() && input.curved_shells.is_empty());
    if input.left_hand == Some(true) && (!constraints.is_empty() || !input.connectors.is_empty() || shells) {
        m.fail("left-handed member axes with constraints, connectors or shells".into());
    }
    let left_hand = input.left_hand.unwrap_or(false);
    let mut elems: Vec<&SolverElement3D> = input.elements.values().collect();
    elems.sort_by_key(|e| e.id);
    for e in elems {
        let (Some(i), Some(j)) = (m.index(e.node_i), m.index(e.node_j)) else {
            m.fail(format!("element {} references a missing node", e.id));
            continue;
        };
        m.touch(&[i, j]);
        if e.elem_type == "truss" || e.elem_type == "cable" {
            m.trusses.push((i, j));
            continue;
        }
        let released = [
            [e.release_t_start, e.release_my_start, e.release_mz_start],
            [e.release_t_end, e.release_my_end, e.release_mz_end],
        ];
        if !released.iter().flatten().any(|&r| r) {
            m.full_links.push(vec![i, j]);
            continue;
        }
        let (pi, pj) = (m.pos[i as usize], m.pos[j as usize]);
        let (ex, ey, ez) = crate::element::compute_local_axes_3d(
            pi[0], pi[1], pi[2], pj[0], pj[1], pj[2], e.local_yx, e.local_yy, e.local_yz, e.roll_angle, left_hand,
        );
        if [ex, ey, ez].iter().flatten().any(|v| !v.is_finite()) {
            m.fail(format!("element {} has undefined local axes", e.id));
            continue;
        }
        m.frames_3d.push(Released3D {
            i,
            j,
            ey: frame_y_ref(e, ex, ey),
            coupled: [released[0].map(|r| !r), released[1].map(|r| !r)],
        });
    }
    let mut shells: Vec<(Vec<usize>, bool)> = Vec::new();
    let mut ids: Vec<(usize, Vec<usize>)> = input.plates.values().map(|x| (x.id, x.nodes.to_vec())).collect();
    ids.sort_by_key(|x| x.0);
    shells.extend(ids.into_iter().map(|x| (x.1, true)));
    let mut ids: Vec<(usize, Vec<usize>)> = input.quads.values().map(|x| (x.id, x.nodes.to_vec())).collect();
    ids.sort_by_key(|x| x.0);
    shells.extend(ids.into_iter().map(|x| (x.1, true)));
    let mut ids: Vec<(usize, Vec<usize>)> = input.quad9s.values().map(|x| (x.id, x.nodes.to_vec())).collect();
    ids.sort_by_key(|x| x.0);
    shells.extend(ids.into_iter().map(|x| (x.1, true)));
    let mut ids: Vec<(usize, Vec<usize>)> = input.curved_shells.values().map(|x| (x.id, x.nodes.to_vec())).collect();
    ids.sort_by_key(|x| x.0);
    shells.extend(ids.into_iter().map(|x| (x.1, true)));
    let mut ids: Vec<(usize, Vec<usize>)> = input.solid_shells.values().map(|x| (x.id, x.nodes.to_vec())).collect();
    ids.sort_by_key(|x| x.0);
    shells.extend(ids.into_iter().map(|x| (x.1, false)));
    for (nodes, rotations) in shells {
        let Some(ix) = m.node_ids(&nodes) else {
            m.fail("a shell references a missing node".into());
            continue;
        };
        m.touch(&ix);
        if rotations {
            m.full_links.push(ix);
        } else {
            m.trans_links.push(ix);
        }
    }
    let node_by_id: HashMap<usize, &SolverNode3D> = input.nodes.values().map(|n| (n.id, n)).collect();
    for c in crate::element::connector::sorted_by_id(&input.connectors) {
        let (Some(i), Some(j), Some(ni), Some(nj)) =
            (m.index(c.node_i), m.index(c.node_j), node_by_id.get(&c.node_i), node_by_id.get(&c.node_j))
        else {
            m.fail(format!("connector {} references a missing node", c.id));
            continue;
        };
        let springs = crate::element::connector::connector_element_springs_3d(c, ni, nj);
        let l = ((nj.x - ni.x).powi(2) + (nj.y - ni.y).powi(2) + (nj.z - ni.z).powi(2)).sqrt();
        add_connector(&mut m, i, j, springs.iter().map(|(k, b)| (*k, b.to_vec())).collect(), l);
    }
    let mut sups: Vec<&SolverSupport3D> = input.supports.values().collect();
    sups.sort_by_key(|s| s.node_id);
    for s in sups {
        let Some(n) = m.index(s.node_id) else { continue };
        let u = |d: u8| Sym { node: n, dof: d };
        let normal = match (s.is_inclined, s.normal_x, s.normal_y, s.normal_z) {
            (Some(true), Some(x), Some(y), Some(z)) if (x * x + y * y + z * z).sqrt() > 1e-12 => Some((x, y, z)),
            _ => None,
        };
        let springs = [s.kx, s.ky, s.kz, s.krx, s.kry, s.krz].map(|k| k.unwrap_or(0.0) > 0.0);
        let flags = [s.rx, s.ry, s.rz, s.rrx, s.rry, s.rrz];
        if let Some((x, y, z)) = normal {
            // only the normal (row 0 of the support frame) is restrained
            let r = super::assembly::inclined_rotation_matrix(x, y, z);
            m.add_row((0..3).map(|k| (u(k as u8), r[0][k])).collect());
        }
        for k in 0..6 {
            if k >= 3 && !has_rot {
                break;
            }
            let flag = flags[k] && (k >= 3 || normal.is_none());
            if flag || springs[k] {
                m.add_row(vec![(u(k as u8), 1.0)]);
            }
        }
    }
    if !constraints.is_empty() {
        let eqs = super::constraints::constraint_equations(constraints, &dof_num, None, Some(&input.nodes));
        add_constraint_rows(&mut m, eqs, &dof_num);
    }
    m
}

// ---------------------------------------------------------------------------
// Unknowns: rigid bodies and single nodes
// ---------------------------------------------------------------------------

struct Uf(Vec<u32>);

impl Uf {
    fn new(n: usize) -> Self {
        Uf((0..n as u32).collect())
    }
    fn find(&mut self, mut i: u32) -> u32 {
        while self.0[i as usize] != i {
            let p = self.0[self.0[i as usize] as usize];
            self.0[i as usize] = p;
            i = p;
        }
        i
    }
    fn union_all(&mut self, nodes: &[u32]) {
        if let Some((&a, rest)) = nodes.split_first() {
            let ra = self.find(a);
            for &b in rest {
                let rb = self.find(b);
                if rb != ra {
                    self.0[rb as usize] = ra;
                }
            }
        }
    }
}

/// An unknown block: a rigid body (translation `t` at a reference node, and
/// rotation), or a single node's own translations/rotations.
#[derive(Clone, Copy, Default)]
struct Block {
    t: Option<u8>,
    r: Option<u8>,
    size: u8,
}

/// How a node's DOFs are expressed: translation through `(block, reference
/// node)` (u = t + θ × (x − x_ref)), rotation through a block's `r`.
#[derive(Clone, Copy)]
struct NodeMap {
    trans: (u32, u32),
    rot: Option<u32>,
    /// rotation block shared with no other node
    own_rot: bool,
}

struct Layout {
    blocks: Vec<Block>,
    nodes: Vec<Option<NodeMap>>,
    /// rows coupling a node's translation as seen from two bodies
    coupling: Vec<(u32, (u32, u32), (u32, u32))>,
}

fn layout(m: &Model) -> Layout {
    let n = m.ids.len();
    let mut fu = Uf::new(n);
    for l in &m.full_links {
        fu.union_all(l);
    }
    let mut su = Uf::new(n);
    for l in &m.trans_links {
        su.union_all(l);
    }
    let mut fsize = vec![0u32; n];
    let mut ssize = vec![0u32; n];
    for i in 0..n as u32 {
        if m.referenced[i as usize] {
            let f = fu.find(i);
            fsize[f as usize] += 1;
            let s = su.find(i);
            ssize[s as usize] += 1;
        }
    }
    let mut blocks: Vec<Block> = Vec::new();
    let mut fblock: HashMap<u32, u32> = HashMap::new();
    let mut sblock: HashMap<u32, u32> = HashMap::new();
    let (nt, nr) = (m.nt() as u8, m.nr() as u8);
    let mut nodes: Vec<Option<NodeMap>> = vec![None; n];
    let mut coupling = Vec::new();
    for i in 0..n as u32 {
        if !m.referenced[i as usize] {
            continue;
        }
        let f = fu.find(i);
        let s = su.find(i);
        let fb = *fblock.entry(f).or_insert_with(|| {
            blocks.push(Block::default());
            blocks.len() as u32 - 1
        });
        let big_f = fsize[f as usize] > 1;
        let big_s = ssize[s as usize] > 1;
        let sb = if big_s {
            Some(*sblock.entry(s).or_insert_with(|| {
                blocks.push(Block { t: Some(0), r: Some(3), size: 6 });
                blocks.len() as u32 - 1
            }))
        } else {
            None
        };
        let trans = if big_f || sb.is_none() {
            let b = &mut blocks[fb as usize];
            b.t = Some(0);
            (fb, if big_f { f } else { i })
        } else {
            (sb.unwrap(), s)
        };
        if big_f {
            if let Some(sb) = sb {
                coupling.push((i, (fb, f), (sb, s)));
            }
        }
        if nr > 0 {
            blocks[fb as usize].r = Some(0);
        }
        nodes[i as usize] = Some(NodeMap { trans, rot: (nr > 0).then_some(fb), own_rot: !big_f });
    }
    for b in &mut blocks {
        if b.size == 0 {
            // a rigid body or a node block: [t (if used), r (if any)]
            let t = b.t.map_or(0, |_| nt);
            if b.t.is_some() {
                b.t = Some(0);
            }
            if b.r.is_some() {
                b.r = Some(t);
            }
            b.size = t + if b.r.is_some() { nr } else { 0 };
        }
    }
    Layout { blocks, nodes, coupling }
}

/// A linear combination over unknowns: key = block << 3 | local.
type Combo = Vec<(u64, C)>;

struct Builder<'a> {
    m: &'a Model,
    f: Field,
    lay: &'a Layout,
    posf: Vec<[u64; 3]>,
}

impl Builder<'_> {
    fn key(b: u32, local: u8) -> u64 {
        ((b as u64) << 3) | local as u64
    }
    /// Translation component k of node n as seen from body (block b, reference node r).
    fn trans_via(&self, out: &mut Combo, (b, r): (u32, u32), n: u32, k: usize, c: C) {
        let f = self.f;
        let blk = self.lay.blocks[b as usize];
        let Some(t) = blk.t else { return };
        out.push((Self::key(b, t + k as u8), c));
        if n == r {
            return;
        }
        let Some(ro) = blk.r else { return };
        let (pn, pr) = (self.m.pos[n as usize], self.m.pos[r as usize]);
        let d = |a: usize| C {
            m: f.sub(self.posf[n as usize][a], self.posf[r as usize][a]),
            r: pn[a] - pr[a],
        };
        let mut term = |rot: u8, dd: C, sign: f64| {
            let v = C {
                m: if sign > 0.0 { f.mul(c.m, dd.m) } else { f.neg(f.mul(c.m, dd.m)) },
                r: sign * c.r * dd.r,
            };
            if v.m != 0 {
                out.push((Self::key(b, ro + rot), v));
            }
        };
        if self.m.three_d {
            // (θ × Δ)_k
            match k {
                0 => { term(1, d(2), 1.0); term(2, d(1), -1.0); }
                1 => { term(2, d(0), 1.0); term(0, d(2), -1.0); }
                _ => { term(0, d(1), 1.0); term(1, d(0), -1.0); }
            }
        } else {
            // ux = tx − θ Δz, uz = tz + θ Δx
            if k == 0 { term(0, d(1), -1.0) } else { term(0, d(0), 1.0) }
        }
    }
    fn sym(&self, out: &mut Combo, s: Sym, c: C) {
        let Some(nm) = self.lay.nodes[s.node as usize] else { return };
        let nt = self.m.nt();
        if (s.dof as usize) < nt {
            self.trans_via(out, nm.trans, s.node, s.dof as usize, c);
        } else if let Some(b) = nm.rot {
            if let Some(r) = self.lay.blocks[b as usize].r {
                out.push((Self::key(b, r + s.dof - nt as u8), c));
            }
        }
    }
    fn c(&self, v: f64) -> C {
        C { m: self.f.of(v), r: v }
    }
    fn c3(&self, v: [f64; 3]) -> [C; 3] {
        v.map(|x| self.c(x))
    }
}

fn cmul(f: Field, a: C, b: C) -> C {
    C { m: f.mul(a.m, b.m), r: a.r * b.r }
}
fn cadd(f: Field, a: C, b: C) -> C {
    C { m: f.add(a.m, b.m), r: a.r + b.r }
}
fn csub(f: Field, a: C, b: C) -> C {
    C { m: f.sub(a.m, b.m), r: a.r - b.r }
}
fn dot3(f: Field, a: &[C], b: &[C]) -> C {
    cadd(f, cadd(f, cmul(f, a[0], b[0]), cmul(f, a[1], b[1])), cmul(f, a[2], b[2]))
}
fn cross3(f: Field, a: &[C], b: &[C]) -> [C; 3] {
    [
        csub(f, cmul(f, a[1], b[2]), cmul(f, a[2], b[1])),
        csub(f, cmul(f, a[2], b[0]), cmul(f, a[0], b[2])),
        csub(f, cmul(f, a[0], b[1]), cmul(f, a[1], b[0])),
    ]
}

/// Exactly orthogonal (unnormalized) local axes from the exact chord `d`:
/// x = d, y from `yref`, z = d × y.
fn exact_axes(f: Field, d: &[C], yref: YRef, b: &Builder) -> [[C; 3]; 3] {
    let neg = |v: [C; 3]| v.map(|c| C { m: f.neg(c.m), r: -c.r });
    let y = match yref {
        YRef::Cross(r) => cross3(f, &b.c3(r), d),
        YRef::Project(r) => {
            let ey = b.c3(r);
            let dd = dot3(f, d, d);
            let ed = dot3(f, &ey, d);
            [0, 1, 2].map(|k| csub(f, cmul(f, dd, ey[k]), cmul(f, ed, d[k])))
        }
        YRef::Turned(kind, r, q) => {
            let base = if kind == "project" { YRef::Project(r) } else { YRef::Cross(r) };
            let [_, y0, z0] = exact_axes(f, d, base, b);
            // y = cos·y0 + sin·z0 up to scale, for a quarter-turn angle
            match q {
                0 => y0,
                1 => z0,
                2 => neg(y0),
                _ => neg(z0),
            }
        }
    };
    let z = cross3(f, d, &y);
    [[d[0], d[1], d[2]], y, z]
}

/// The springs of a connector as conditions over nodal DOFs.
fn connector_rows(b: &Builder, c: &Conn) -> Vec<Vec<(Sym, C)>> {
    let f = b.f;
    let m = b.m;
    let per = if m.three_d { 6 } else { 3 };
    let nt = m.nt();
    let keep = |local: usize| local < nt || m.has_rot;
    let mut out = Vec::new();
    if c.zero_length {
        for (k, row) in &c.springs {
            if *k == 0.0 {
                continue;
            }
            let mut t = Vec::new();
            for (a, &v) in row.iter().enumerate() {
                let (node, local) = if a < per { (c.i, a) } else { (c.j, a - per) };
                if v != 0.0 && keep(local) {
                    t.push((Sym { node, dof: local as u8 }, b.c(v)));
                }
            }
            out.push(t);
        }
        return out;
    }
    let d: Vec<C> = (0..nt)
        .map(|k| C {
            m: f.sub(b.posf[c.j as usize][k], b.posf[c.i as usize][k]),
            r: m.pos[c.j as usize][k] - m.pos[c.i as usize][k],
        })
        .collect();
    let half = C { m: f.of(crate::element::connector::CONNECTOR_SHEAR_POSITION), r: crate::element::connector::CONNECTOR_SHEAR_POSITION };
    let other = C {
        m: f.of(1.0 - crate::element::connector::CONNECTOR_SHEAR_POSITION),
        r: 1.0 - crate::element::connector::CONNECTOR_SHEAR_POSITION,
    };
    let neg = |x: C| C { m: f.neg(x.m), r: -x.r };
    let u = |node: u32, k: usize| Sym { node, dof: k as u8 };
    // e·(u_j − u_i) + arm·(a θ_i + (1 − a) θ_j) (arm empty for no rotation term)
    let trans = |e: &[C], arm: Option<&[C]>| {
        let mut t = Vec::new();
        for k in 0..nt {
            t.push((u(c.j, k), e[k]));
            t.push((u(c.i, k), neg(e[k])));
        }
        if let (Some(arm), true) = (arm, m.has_rot) {
            for (k, &w) in arm.iter().enumerate() {
                t.push((u(c.i, nt + k), cmul(f, half, w)));
                t.push((u(c.j, nt + k), cmul(f, other, w)));
            }
        }
        t
    };
    let rot = |e: &[C]| {
        let mut t = Vec::new();
        if m.has_rot {
            for (k, &w) in e.iter().enumerate() {
                t.push((u(c.j, nt + k), w));
                t.push((u(c.i, nt + k), neg(w)));
            }
        }
        t
    };
    let ks: Vec<f64> = c.springs.iter().map(|s| s.0).collect();
    if m.three_d {
        // the element's y axis: its shear-y row is −e_y on node i
        // the element's frame: y = normalized (X or Y) × chord
        let dir = c.springs[0].1[6..9].to_vec();
        let r = if dir[0].abs() < 0.9 { [1.0, 0.0, 0.0] } else { [0.0, 1.0, 0.0] };
        let [x, y, z] = exact_axes(f, &d, YRef::Cross(r), b);
        let rows = [
            trans(&x, None),
            trans(&y, Some(&cross3(f, &y, &d))),
            trans(&z, Some(&cross3(f, &z, &d))),
            rot(&x),
            rot(&y),
            rot(&z),
        ];
        for (k, r) in ks.iter().zip(rows) {
            if *k != 0.0 {
                out.push(r);
            }
        }
    } else {
        // 2D: shear row scaled by L: (−dz, dx) on Δu, −L² on (a θ_i + (1 − a) θ_j)
        let l2 = cadd(f, cmul(f, d[0], d[0]), cmul(f, d[1], d[1]));
        let rows = [
            trans(&d, None),
            trans(&[neg(d[1]), d[0]], Some(&[neg(l2)])),
            rot(&[C { m: 1, r: 1.0 }]),
        ];
        for (k, r) in ks.iter().zip(rows) {
            if *k != 0.0 {
                out.push(r);
            }
        }
    }
    out.retain(|r| !r.is_empty());
    out
}

/// Sort a combination by key and merge duplicates, dropping exact zeros.
fn merge(f: Field, mut v: Combo) -> Combo {
    v.sort_unstable_by_key(|e| e.0);
    let mut out: Combo = Vec::with_capacity(v.len());
    for (k, c) in v {
        match out.last_mut() {
            Some(last) if last.0 == k => {
                last.1.m = f.add(last.1.m, c.m);
                last.1.r += c.r;
            }
            _ => out.push((k, c)),
        }
    }
    out.retain(|e| e.1.m != 0);
    out
}

/// The nodal conditions of a 3D frame with releases: the conditions of its
/// rigid motion (u_j − u_i = ω × d; a·(θ − ω) = 0 for each coupled end axis
/// a), with ω eliminated.
fn released_frame_rows(b: &Builder, e: &Released3D) -> Vec<Vec<(Sym, C)>> {
    let f = b.f;
    let (i, j) = (e.i, e.j);
    let d: Vec<C> = (0..3)
        .map(|k| C {
            m: f.sub(b.posf[j as usize][k], b.posf[i as usize][k]),
            r: b.m.pos[j as usize][k] - b.m.pos[i as usize][k],
        })
        .collect();
    let zero = C { m: 0, r: 0.0 };
    let one = C { m: 1, r: 1.0 };
    let negc = |c: C| C { m: f.neg(c.m), r: -c.r };
    // columns: ω0..2, u_i 3..6, θ_i 6..9, u_j 9..12, θ_j 12..15
    let mut rows: Vec<[C; 15]> = Vec::new();
    for k in 0..3 {
        let mut r = [zero; 15];
        r[9 + k] = one;
        r[3 + k] = negc(one);
        // − (ω × d)_k
        match k {
            0 => { r[1] = negc(d[2]); r[2] = d[1]; }
            1 => { r[2] = negc(d[0]); r[0] = d[2]; }
            _ => { r[0] = negc(d[1]); r[1] = d[0]; }
        }
        rows.push(r);
    }
    let axes = exact_axes(f, &d, e.ey, b);
    for (end, base) in [(0usize, 6usize), (1, 12)] {
        for a in 0..3 {
            if !e.coupled[end][a] {
                continue;
            }
            let mut r = [zero; 15];
            for k in 0..3 {
                let c = axes[a][k];
                r[base + k] = c;
                r[k] = negc(c);
            }
            rows.push(r);
        }
    }
    // eliminate ω
    for col in 0..3 {
        let Some(p) = (0..rows.len())
            .filter(|&q| rows[q][col].m != 0)
            .max_by(|&x, &y| rows[x][col].r.abs().total_cmp(&rows[y][col].r.abs()))
        else {
            continue;
        };
        let piv = rows.swap_remove(p);
        let inv = f.inv(piv[col].m);
        for r in rows.iter_mut() {
            if r[col].m == 0 {
                continue;
            }
            let fm = f.mul(r[col].m, inv);
            let fr = if piv[col].r != 0.0 { r[col].r / piv[col].r } else { 0.0 };
            for q in 0..15 {
                r[q].m = f.sub(r[q].m, f.mul(fm, piv[q].m));
                r[q].r -= fr * piv[q].r;
            }
        }
    }
    rows.into_iter()
        .map(|r| {
            (3..15)
                .filter(|&q| r[q].m != 0)
                .map(|q| {
                    let (node, dof) = match q {
                        3..=5 => (i, q - 3),
                        6..=8 => (i, q - 3),
                        9..=11 => (j, q - 9),
                        _ => (j, q - 9),
                    };
                    (Sym { node, dof: dof as u8 }, r[q])
                })
                .collect::<Vec<_>>()
        })
        .filter(|r| !r.is_empty())
        .collect()
}

// ---------------------------------------------------------------------------
// Rank and kernel
// ---------------------------------------------------------------------------

type Row = Vec<(u32, C)>;

/// A single node's rotations that nothing couples to.
#[derive(Clone, Debug)]
struct FreeRotation {
    node: usize,
    /// Echelon basis (mod PRIMES[0]) of what does couple to that node's
    /// rotation components; a moment outside its span is unresisted.
    basis: Vec<Vec<u64>>,
    nr: usize,
}

struct Outcome {
    kernel: usize,
    /// up to a few kernel vectors, as nodal motions: per node [t (3), r (3)]
    motions: Vec<Vec<(u32, [C; 6])>>,
    free_rotations: Vec<FreeRotation>,
    /// An exact basis of the free motions (nodal, mod p), when small enough.
    basis: Option<Vec<BasisVector>>,
}

/// A free motion: per node, its exact slots modulo p and floating-point
/// values; `refined` when the values are the free motion itself (the only
/// one with its support), accurate enough to judge round-off.
#[derive(Clone, Debug)]
struct BasisVector {
    nodal: Vec<(u32, [u64; 6], [f64; 6])>,
    refined: bool,
}

/// Reduce `v` (dense, length k) against an echelon basis; true if it is
/// independent (then it is added, normalized).
fn add_to_basis(f: Field, basis: &mut Vec<(usize, Vec<u64>)>, mut v: Vec<u64>) -> bool {
    for (lead, b) in basis.iter() {
        if v[*lead] != 0 {
            let c = v[*lead];
            for q in 0..v.len() {
                v[q] = f.sub(v[q], f.mul(c, b[q]));
            }
        }
    }
    let Some(lead) = v.iter().position(|&x| x != 0) else { return false };
    let inv = f.inv(v[lead]);
    for x in v.iter_mut() {
        *x = f.mul(*x, inv);
    }
    // keep the basis reduced
    for (_, b) in basis.iter_mut() {
        if b[lead] != 0 {
            let c = b[lead];
            for q in 0..b.len() {
                b[q] = f.sub(b[q], f.mul(c, v[q]));
            }
        }
    }
    basis.push((lead, v));
    true
}

fn analyze(m: &Model, f: Field, describe: usize, basis_cap: usize) -> Option<Outcome> {
    let lay = layout(m);
    let b = Builder { m, f, lay: &lay, posf: m.pos.iter().map(|p| p.map(|v| f.of(v))).collect() };
    let one = C { m: 1, r: 1.0 };
    let neg_one = C { m: f.neg(1), r: -1.0 };
    let mut combos: Vec<Combo> = Vec::new();
    let push = |combos: &mut Vec<Combo>, terms: &[(Sym, C)]| {
        let mut v: Combo = Vec::new();
        for &(s, c) in terms {
            if !m.referenced[s.node as usize] {
                return; // a support on a node nothing else references
            }
            b.sym(&mut v, s, c);
        }
        let v = merge(f, v);
        if !v.is_empty() {
            combos.push(v);
        }
    };
    for &(n, fb, sb) in &lay.coupling {
        for k in 0..3 {
            let mut v: Combo = Vec::new();
            b.trans_via(&mut v, fb, n, k, one);
            b.trans_via(&mut v, sb, n, k, neg_one);
            let v = merge(f, v);
            if !v.is_empty() {
                combos.push(v);
            }
        }
    }
    let nt = m.nt();
    let diff = |i: u32, j: u32, k: usize| C {
        m: f.sub(b.posf[j as usize][k], b.posf[i as usize][k]),
        r: m.pos[j as usize][k] - m.pos[i as usize][k],
    };
    let negc = |c: C| C { m: f.neg(c.m), r: -c.r };
    for &(i, j) in &m.trusses {
        let mut t = Vec::new();
        for k in 0..nt {
            let d = diff(i, j, k);
            t.push((Sym { node: j, dof: k as u8 }, d));
            t.push((Sym { node: i, dof: k as u8 }, negc(d)));
        }
        push(&mut combos, &t);
    }
    for &(i, j, hi, hj) in &m.frames_2d {
        let (dx, dz) = (diff(i, j, 0), diff(i, j, 1));
        let axial = vec![
            (Sym { node: j, dof: 0 }, dx),
            (Sym { node: i, dof: 0 }, negc(dx)),
            (Sym { node: j, dof: 1 }, dz),
            (Sym { node: i, dof: 1 }, negc(dz)),
        ];
        push(&mut combos, &axial);
        // L²·θ_end − (dx·Δuz − dz·Δux) = 0 at each end that is not hinged
        let l2 = C { m: f.add(f.mul(dx.m, dx.m), f.mul(dz.m, dz.m)), r: dx.r * dx.r + dz.r * dz.r };
        let chord = vec![
            (Sym { node: j, dof: 1 }, negc(dx)),
            (Sym { node: i, dof: 1 }, dx),
            (Sym { node: j, dof: 0 }, dz),
            (Sym { node: i, dof: 0 }, negc(dz)),
        ];
        for (end, hinged) in [(i, hi), (j, hj)] {
            if !hinged {
                let mut t = chord.clone();
                t.push((Sym { node: end, dof: 2 }, l2));
                push(&mut combos, &t);
            }
        }
    }
    for e in &m.frames_3d {
        for r in released_frame_rows(&b, e) {
            push(&mut combos, &r);
        }
    }
    for c in &m.connectors {
        for r in connector_rows(&b, c) {
            push(&mut combos, &r);
        }
    }
    for r in &m.rows {
        let t: Vec<(Sym, C)> = r.iter().map(|&(s, v)| (s, b.c(v))).collect();
        push(&mut combos, &t);
    }

    // Column order: blocks in breadth-first order over the rows that couple
    // them (bandwidth, hence fill, stays small).
    let nb = lay.blocks.len();
    let mut adj: Vec<Vec<u32>> = vec![Vec::new(); nb];
    for c in &combos {
        let mut prev: Option<u32> = None;
        for &(k, _) in c {
            let blk = (k >> 3) as u32;
            if let Some(p) = prev {
                if p != blk {
                    adj[p as usize].push(blk);
                    adj[blk as usize].push(p);
                }
            }
            prev = Some(blk);
        }
    }
    for a in adj.iter_mut() {
        a.sort_unstable();
        a.dedup();
    }
    let mut order: Vec<u32> = Vec::with_capacity(nb);
    let mut seen = vec![false; nb];
    let mut starts: Vec<u32> = (0..nb as u32).collect();
    starts.sort_by_key(|&x| adj[x as usize].len());
    for s in starts {
        if seen[s as usize] {
            continue;
        }
        seen[s as usize] = true;
        let mut q = std::collections::VecDeque::from([s]);
        while let Some(x) = q.pop_front() {
            order.push(x);
            let mut nbrs: Vec<u32> = adj[x as usize].iter().copied().filter(|&y| !seen[y as usize]).collect();
            nbrs.sort_by_key(|&y| adj[y as usize].len());
            for y in nbrs {
                seen[y as usize] = true;
                q.push_back(y);
            }
        }
    }
    let mut base = vec![0u32; nb];
    let mut ncols = 0u32;
    for &blk in &order {
        base[blk as usize] = ncols;
        ncols += lay.blocks[blk as usize].size as u32;
    }
    let col = |k: u64| base[(k >> 3) as usize] + (k & 7) as u32;
    let mut rows: Vec<Row> = combos
        .into_iter()
        .map(|c| {
            let mut r: Row = c.into_iter().map(|(k, v)| (col(k), v)).collect();
            r.sort_unstable_by_key(|e| e.0);
            r
        })
        .collect();

    // Rotations of a single node that nothing couples to: held (as the
    // solver holds them), recorded for the load check.
    let nr = m.nr();
    let mut free_rotations = Vec::new();
    if nr > 0 {
        let mut own: HashMap<u32, u32> = HashMap::new(); // first rotation column → node
        for (n, nm) in lay.nodes.iter().enumerate() {
            if let Some(nm) = nm {
                if nm.own_rot {
                    let blk = nm.rot.unwrap();
                    let r0 = base[blk as usize] + lay.blocks[blk as usize].r.unwrap() as u32;
                    own.insert(r0, n as u32);
                }
            }
        }
        let mut col_owner: HashMap<u32, (u32, u32)> = HashMap::new();
        for (&r0, &n) in &own {
            for k in 0..nr as u32 {
                col_owner.insert(r0 + k, (r0, n));
            }
        }
        let mut blocks_rows: HashMap<u32, Vec<Vec<u64>>> = HashMap::new();
        for r in &rows {
            let mut parts: HashMap<u32, Vec<u64>> = HashMap::new();
            for &(c, v) in r {
                if let Some(&(r0, _)) = col_owner.get(&c) {
                    parts.entry(r0).or_insert_with(|| vec![0; nr])[(c - r0) as usize] = v.m;
                }
            }
            for (r0, v) in parts {
                blocks_rows.entry(r0).or_default().push(v);
            }
        }
        let mut owned: Vec<(&u32, &u32)> = own.iter().collect();
        owned.sort();
        for (&r0, &n) in owned {
            let mut basis: Vec<(usize, Vec<u64>)> = Vec::new();
            for v in blocks_rows.remove(&r0).unwrap_or_default() {
                if basis.len() == nr {
                    break;
                }
                add_to_basis(f, &mut basis, v);
            }
            if basis.len() == nr {
                continue;
            }
            let coupled: Vec<Vec<u64>> = basis.iter().map(|b| b.1.clone()).collect();
            for k in 0..nr {
                let mut e = vec![0; nr];
                e[k] = 1;
                if add_to_basis(f, &mut basis, e) {
                    rows.push(vec![(r0 + k as u32, one)]);
                }
                if basis.len() == nr {
                    break;
                }
            }
            free_rotations.push(FreeRotation { node: m.ids[n as usize], basis: coupled, nr });
        }
    }

    // Incremental sparse elimination: each row is reduced by the pivots of
    // its leading columns until it is zero or leads a new pivot.
    rows.sort_by_key(|r| r.first().map_or(u32::MAX, |e| e.0));
    let original: Vec<Row> = if describe > 0 { rows.clone() } else { Vec::new() };
    const NONE: u32 = u32::MAX;
    let mut piv: Vec<u32> = vec![NONE; ncols as usize];
    let mut prows: Vec<Row> = Vec::new();
    let mut work: u64 = 0;
    for mut r in rows {
        loop {
            let Some(&(c, lead)) = r.first() else { break };
            let pi = piv[c as usize];
            if pi == NONE {
                let inv = f.inv(lead.m);
                let s = lead.r;
                for e in r.iter_mut() {
                    e.1.m = f.mul(e.1.m, inv);
                    e.1.r = if s != 0.0 { e.1.r / s } else { 0.0 };
                }
                piv[c as usize] = prows.len() as u32;
                prows.push(r);
                break;
            }
            let p = &prows[pi as usize];
            work += p.len() as u64 + r.len() as u64;
            if work > WORK_BUDGET {
                return None;
            }
            let mut out: Row = Vec::with_capacity(r.len() + p.len());
            let (mut a, mut q) = (1, 1);
            while a < r.len() || q < p.len() {
                let ca = r.get(a).map_or(u32::MAX, |e| e.0);
                let cq = p.get(q).map_or(u32::MAX, |e| e.0);
                if ca < cq {
                    out.push(r[a]);
                    a += 1;
                } else if cq < ca {
                    let v = C { m: f.neg(f.mul(lead.m, p[q].1.m)), r: -lead.r * p[q].1.r };
                    out.push((cq, v));
                    q += 1;
                } else {
                    let v = C {
                        m: f.sub(r[a].1.m, f.mul(lead.m, p[q].1.m)),
                        r: r[a].1.r - lead.r * p[q].1.r,
                    };
                    if v.m != 0 {
                        out.push((ca, v));
                    }
                    a += 1;
                    q += 1;
                }
            }
            r = out;
        }
    }
    let kernel = ncols as usize - prows.len();

    // A few kernel vectors for the description (values refined in floating
    // point), and an exact basis of the free motions, for the check of the
    // loads' work (`MechanismCheck::loads_do_work`).
    let mut motions = Vec::new();
    let nnz: usize = prows.iter().map(|r| r.len()).sum();
    let want_basis = basis_cap > 0
        && kernel <= basis_cap
        && (kernel as u64) * (nnz as u64 + 6 * lay.nodes.len() as u64) <= WORK_BUDGET;
    let mut basis: Option<Vec<BasisVector>> = want_basis.then(Vec::new);
    let count = if want_basis { kernel } else { describe.min(kernel) };
    if kernel > 0 && count > 0 {
        let mut pivot_cols: Vec<u32> = (0..ncols).filter(|&c| piv[c as usize] != NONE).collect();
        pivot_cols.reverse();
        let free: Vec<u32> = (0..ncols).filter(|&c| piv[c as usize] == NONE).collect();
        for (idx, &fc) in free.iter().take(count).enumerate() {
            let mut x = vec![C { m: 0, r: 0.0 }; ncols as usize];
            x[fc as usize] = one;
            for &pc in &pivot_cols {
                let row = &prows[piv[pc as usize] as usize];
                let (mut sm, mut sr) = (0u64, 0.0f64);
                for &(c, v) in &row[1..] {
                    let xc = x[c as usize];
                    if xc.m != 0 {
                        sm = f.add(sm, f.mul(v.m, xc.m));
                    }
                    sr += v.r * xc.r;
                }
                x[pc as usize] = C { m: f.neg(sm), r: -sr };
            }
            let described = idx < describe;
            // values in floating point, for the description and for judging
            // a load's work that is exactly non-zero by round-off alone
            let refined = (described || kernel <= 32) && refine_values(f, &original, &mut x);
            // nodal motions
            let mut nodal = Vec::new();
            for (n, nm) in lay.nodes.iter().enumerate() {
                let Some(_) = nm else { continue };
                let mut vals = [C { m: 0, r: 0.0 }; 6];
                for d in 0..(nt + nr) {
                    let mut v: Combo = Vec::new();
                    b.sym(&mut v, Sym { node: n as u32, dof: d as u8 }, one);
                    let (mut sm, mut sr) = (0u64, 0.0);
                    for (k, c) in v {
                        let xc = x[col(k) as usize];
                        sm = f.add(sm, f.mul(c.m, xc.m));
                        sr += c.r * xc.r;
                    }
                    let slot = if d < nt { d } else { 3 + d - nt };
                    vals[slot] = C { m: sm, r: sr };
                }
                if vals.iter().any(|v| v.m != 0) {
                    nodal.push((n as u32, vals));
                }
            }
            if let Some(bs) = basis.as_mut() {
                bs.push(BasisVector {
                    nodal: nodal.iter().map(|(n, v)| (*n, v.map(|c| c.m), v.map(|c| c.r))).collect(),
                    refined,
                });
            }
            if described {
                motions.push(nodal);
            }
        }
    }
    Some(Outcome { kernel, motions, free_rotations, basis })
}

/// Replace the floating-point values of an exact free motion `x` by a null
/// vector of the conditions restricted to its support, computed with
/// complete pivoting (the values carried through the exact elimination can
/// lose all accuracy on pivots that are exactly non-zero but tiny). For the
/// description only; the support and the verdict stay exact.
fn refine_values(f: Field, rows: &[Row], x: &mut [C]) -> bool {
    const MAX_SUPPORT: usize = 240;
    let support: Vec<u32> = (0..x.len() as u32).filter(|&c| x[c as usize].m != 0).collect();
    let s = support.len();
    if s == 0 || s > MAX_SUPPORT {
        return false;
    }
    let at: HashMap<u32, usize> = support.iter().enumerate().map(|(i, &c)| (c, i)).collect();
    let mut a: Vec<Vec<C>> = Vec::new();
    for r in rows {
        if r.iter().any(|e| at.contains_key(&e.0)) {
            let mut v = vec![C { m: 0, r: 0.0 }; s];
            for &(c, val) in r {
                if let Some(&i) = at.get(&c) {
                    v[i] = val;
                }
            }
            a.push(v);
        }
        if a.len() > 20 * MAX_SUPPORT {
            return false;
        }
    }
    // exact rank of the restricted conditions
    let mut basis: Vec<(usize, Vec<u64>)> = Vec::new();
    for v in &a {
        if basis.len() == s {
            break;
        }
        add_to_basis(f, &mut basis, v.iter().map(|c| c.m).collect());
    }
    let rank = basis.len();
    if rank >= s {
        return false;
    }
    // that many pivots in floating point, complete pivoting
    let mut m: Vec<Vec<f64>> = a.iter().map(|v| v.iter().map(|c| c.r).collect()).collect();
    let mut col_of: Vec<usize> = Vec::new();
    let mut free: Vec<bool> = vec![true; s];
    for k in 0..rank {
        let mut best = (0usize, 0usize, 0.0f64);
        for (i, row) in m.iter().enumerate().skip(k) {
            for (j, &v) in row.iter().enumerate() {
                if free[j] && v.abs() > best.2 {
                    best = (i, j, v.abs());
                }
            }
        }
        if best.2 == 0.0 {
            return false;
        }
        m.swap(k, best.0);
        let j = best.1;
        free[j] = false;
        col_of.push(j);
        let piv = m[k].clone();
        for (i, row) in m.iter_mut().enumerate() {
            if i != k && row[j] != 0.0 {
                let fct = row[j] / piv[j];
                for q in 0..s {
                    row[q] -= fct * piv[q];
                }
            }
        }
    }
    let Some(first_free) = free.iter().position(|&b| b) else { return false };
    let mut y = vec![0.0; s];
    y[first_free] = 1.0;
    for (k, &j) in col_of.iter().enumerate() {
        y[j] = -m[k][first_free] / m[k][j];
    }
    let scale = y.iter().fold(0.0f64, |acc, v| acc.max(v.abs()));
    if !(scale > 0.0 && scale.is_finite()) {
        return false;
    }
    for c in x.iter_mut() {
        c.r = 0.0;
    }
    for (i, &c) in support.iter().enumerate() {
        x[c as usize].r = y[i] / scale;
    }
    rank + 1 == s
}

// ---------------------------------------------------------------------------
// Public result
// ---------------------------------------------------------------------------

/// The outcome of the exact mechanism check.
#[derive(Clone, Debug, Default)]
pub struct MechanismCheck {
    /// Independent free motions (0: none; the model is not a mechanism).
    pub free_motions: usize,
    /// Nodes that move in the motions described.
    pub nodes: Vec<usize>,
    /// One sentence per described free motion.
    pub descriptions: Vec<String>,
    /// Why the model was not checked (too large, unsupported data), if so.
    pub unchecked: Option<String>,
    two_d: bool,
    free_rotations: Vec<FreeRotation>,
    isolated: HashSet<usize>,
    /// An exact basis of the free motions modulo PRIMES[0] (node id, slots
    /// [u (3), θ (3)], with floating-point values), when small enough.
    basis: Vec<BasisVectorIds>,
    basis_complete: bool,
}

#[derive(Clone, Debug)]
struct BasisVectorIds {
    nodal: Vec<(usize, [u64; 6], [f64; 6])>,
    refined: bool,
}

impl MechanismCheck {
    /// True when the model was checked and found to be a mechanism.
    pub fn is_mechanism(&self) -> bool {
        self.free_motions > 0
    }

    /// The refusal message, naming the free motions.
    pub fn message(&self) -> Option<String> {
        if !self.is_mechanism() {
            return None;
        }
        let k = self.free_motions;
        let mut s = format!(
            "Structure is a mechanism: the supports, members and connections leave {k} independent \
             free motion{} with no stiffness against {}, so the stiffness matrix is singular. ",
            if k == 1 { "" } else { "s" },
            if k == 1 { "it" } else { "them" },
        );
        for (i, d) in self.descriptions.iter().enumerate() {
            if self.descriptions.len() > 1 {
                s.push_str(&format!("Free motion {}: ", i + 1));
            }
            s.push_str(d);
            s.push_str(". ");
        }
        if k > self.descriptions.len() {
            s.push_str(&format!("({} more not described.) ", k - self.descriptions.len()));
        }
        s.push_str("Restrain it with supports, members or unreleased connections.");
        Some(s)
    }

    /// Whether a load does work on some free motion: `load(node, slot)` is
    /// the load on a node in global components, slots [Fx, Fy, Fz, Mx, My,
    /// Mz] (2D: [Fx, Fz, —, My, —, —]). Exact: the load is orthogonal to
    /// every free motion (its virtual work vanishes modulo a 61-bit prime), or it does work. A load that
    /// does no work on any free motion leaves the internal forces determined
    /// (only the displacement along the free motions is arbitrary); one that
    /// does has no equilibrium. Without a kept basis, any load counts. The
    /// exact test is relaxed to round-off (relative 1e-9) only against a
    /// free motion whose floating-point values are known accurately.
    pub fn loads_do_work(&self, load: impl Fn(usize, usize) -> f64) -> bool {
        self.loads_do_work_scaled(load, 0.0)
    }

    /// As [`Self::loads_do_work`], round-off judged against `load_scale`
    /// (the largest load component in the model) as well as the loads on the
    /// moving nodes: element loads summed in another order leave a node
    /// with a round-off residue that is not a load.
    fn loads_do_work_scaled(&self, load: impl Fn(usize, usize) -> f64, load_scale: f64) -> bool {
        if !self.is_mechanism() {
            return false;
        }
        if !self.basis_complete {
            return true;
        }
        let f = Field::new(PRIMES[0]);
        for v in &self.basis {
            let (mut acc, mut dot, mut scale) = (0u64, 0.0f64, 0.0f64);
            for (node, x, r) in &v.nodal {
                for slot in 0..6 {
                    let l = load(*node, slot);
                    if l == 0.0 {
                        continue;
                    }
                    if !l.is_finite() {
                        return true;
                    }
                    if x[slot] != 0 {
                        acc = f.add(acc, f.mul(f.of(l), x[slot]));
                    }
                    dot += l * r[slot];
                    scale += (l * r[slot]).abs();
                }
            }
            // Exactly orthogonal, or — when the load comes out of rounded
            // arithmetic (element loads, coordinates) — orthogonal to the
            // free motion's accurate values up to round-off.
            let vnorm: f64 = v.nodal.iter().flat_map(|(_, _, r)| r.iter()).map(|x| x.abs()).sum();
            let no_work = acc == 0 || (v.refined && dot.abs() <= 1e-9 * scale.max(load_scale * vnorm));
            if !no_work {
                return true;
            }
        }
        false
    }

    /// Static solve of a mechanism: refused when the loads (or prescribed
    /// displacements) act on a free motion; otherwise allowed, the model
    /// carrying the `diagnostic` warning. 2D, from the assembled loads.
    pub fn refuse_if_loaded_2d(&self, input: &SolverInput, loads: &[SolverLoad], prescribed: bool) -> Result<(), String> {
        if !self.is_mechanism() {
            return Ok(());
        }
        let dof_num = DofNumbering::build_2d(input);
        let f = super::assembly::assemble_load_vector_2d(input, loads, &dof_num, &[]);
        let slot_local = [Some(0usize), Some(1), None, Some(2), None, None];
        let scale = f.iter().fold(0.0f64, |a, v| a.max(v.abs()));
        self.refuse_if_work(prescribed, scale, |node, slot| {
            slot_local[slot].and_then(|l| dof_num.map.get(&(node, l))).map_or(0.0, |&i| f[i])
        })
    }

    /// 3D twin of [`Self::refuse_if_loaded_2d`].
    pub fn refuse_if_loaded_3d(&self, input: &SolverInput3D, loads: &[SolverLoad3D], prescribed: bool) -> Result<(), String> {
        if !self.is_mechanism() {
            return Ok(());
        }
        let dof_num = DofNumbering::build_3d(input);
        let f = super::assembly::assemble_load_vector_3d_dense(input, loads, &dof_num, &[]);
        let scale = f.iter().fold(0.0f64, |a, v| a.max(v.abs()));
        self.refuse_if_work(prescribed, scale, |node, slot| dof_num.map.get(&(node, slot)).map_or(0.0, |&i| f[i]))
    }

    fn refuse_if_work(&self, prescribed: bool, scale: f64, load: impl Fn(usize, usize) -> f64) -> Result<(), String> {
        let why = if prescribed {
            "Prescribed support displacements are applied to it, which this model cannot equilibrate."
        } else if self.loads_do_work_scaled(load, scale) {
            "The loads act on it, so there is no equilibrium."
        } else {
            return Ok(());
        };
        Err(format!("{} {why}", self.message().unwrap_or_default()))
    }

    /// A solver failure on a mechanism (a factorization that broke down on
    /// it, a blown-up solution) reported as the mechanism, by its free
    /// motions; any other error unchanged.
    pub fn explain_failure(&self, e: String) -> String {
        let own = ["Structure is a mechanism", "Rotation not stiffened", "Nodal moment", "Load at node"];
        let singular = (e.contains("Singular") || e.contains("singular") || e.contains("mechanism"))
            && !own.iter().any(|p| e.starts_with(p));
        match self.message() {
            Some(m) if singular && !e.starts_with("Structure is a mechanism") => {
                format!("{m} The solver could not factor its stiffness ({e}).")
            }
            _ => e,
        }
    }

    /// `Err` with the message when the model is a mechanism (analyses that
    /// cannot answer for one at all: constrained solves, modal analysis,
    /// whose zero-frequency modes the eigensolver does not return).
    pub fn refusal(&self) -> Result<(), String> {
        match self.message() {
            Some(m) => Err(format!("{m} No result is returned for a mechanism.")),
            None => Ok(()),
        }
    }

    /// As a pre-solve diagnostic (for analyses that report rather than refuse).
    pub fn diagnostic(&self) -> Option<StructuredDiagnostic> {
        let msg = format!(
            "{} The loads do no work on it: internal forces and reactions are determined, \
             displacements along it are not",
            self.message()?
        );
        Some(
            crate::solver::definiteness::not_positive_definite(&msg)
                .with_phase("pre_solve")
                .with_nodes(self.nodes.clone()),
        )
    }

    /// Refuse a node rotation that nothing stiffens about an axis that is not
    /// a global one (a member released about one bending axis, alone at a
    /// node): the stiffness matrix is singular in exact arithmetic but
    /// regular after rounding, and the assembler's artificial stiffness holds
    /// only global axes, so the solve would return an arbitrary rotation
    /// there and a certificate would certify it (#458).
    pub fn refuse_unheld_rotations(&self) -> Result<(), String> {
        let nodes: Vec<usize> = self
            .free_rotations
            .iter()
            .filter(|r| {
                let zero_cols = (0..r.nr).filter(|&k| r.basis.iter().all(|b| b[k] == 0)).count();
                r.nr > r.basis.len() + zero_cols
            })
            .map(|r| r.node)
            .collect();
        if nodes.is_empty() {
            return Ok(());
        }
        let also = self.message().map(|m| format!(" {m}")).unwrap_or_default();
        Err(format!(
            "Rotation not stiffened at node{} {}: nothing in the model resists the rotation of {} about an \
             axis that is not a global one (a member released about one bending axis, and nothing else \
             at the node), so the stiffness matrix is singular. Release the member about both bending \
             axes there, or connect or restrain the node's rotation.{also}",
            if nodes.len() == 1 { "" } else { "s" },
            list_nodes(&nodes),
            if nodes.len() == 1 { "that node" } else { "those nodes" },
        ))
    }

    /// Why a linear certificate must not certify this model: a mechanism (its
    /// regularized answer is not the model's), or a rotation nothing
    /// stiffens off the global axes. `None` when certifiable.
    pub fn uncertifiable(&self) -> Option<String> {
        self.message().or_else(|| self.refuse_unheld_rotations().err())
    }

    /// Rotation directions of single nodes that nothing couples to and that
    /// are not along a global axis (the solver's artificial stiffness holds
    /// only global-axis ones, so these leave the assembled K singular even
    /// though no part of the structure moves). For tests comparing with the
    /// null space of K.
    #[doc(hidden)]
    pub fn unheld_rotation_dims(&self) -> usize {
        self.free_rotations
            .iter()
            .map(|r| {
                let zero_cols = (0..r.nr).filter(|&k| r.basis.iter().all(|b| b[k] == 0)).count();
                r.nr - r.basis.len() - zero_cols
            })
            .sum()
    }

    fn unresisted_moment(&self, node: usize, m: &[f64]) -> bool {
        if m.iter().all(|v| *v == 0.0) {
            return false;
        }
        let Some(fr) = self.free_rotations.iter().find(|r| r.node == node) else { return false };
        let f = Field::new(PRIMES[0]);
        let mut basis: Vec<(usize, Vec<u64>)> = Vec::new();
        for b in &fr.basis {
            add_to_basis(f, &mut basis, b.clone());
        }
        let v: Vec<u64> = m.iter().take(fr.nr).map(|&x| f.of(x)).collect();
        add_to_basis(f, &mut basis, v)
    }

    /// Refuse a nodal moment on a rotation nothing resists (a node every
    /// member releases, or only trusses reach), or a load on a node that is
    /// connected to nothing: it would not reach the structure.
    pub fn refuse_unresisted_loads_2d(&self, loads: &[SolverLoad]) -> Result<(), String> {
        for l in loads {
            if let SolverLoad::Nodal(n) = l {
                if self.isolated.contains(&n.node_id) && (n.fx != 0.0 || n.fz != 0.0 || n.my != 0.0) {
                    return Err(isolated_load(n.node_id));
                }
                if self.unresisted_moment(n.node_id, &[n.my]) {
                    return Err(unresisted_moment(n.node_id, self.two_d));
                }
            }
        }
        Ok(())
    }

    /// 3D twin of [`Self::refuse_unresisted_loads_2d`]: a moment component
    /// about an axis no element couples at that node is refused, whether or
    /// not the axis is a global one.
    pub fn refuse_unresisted_loads_3d(&self, loads: &[SolverLoad3D]) -> Result<(), String> {
        for l in loads {
            if let SolverLoad3D::Nodal(n) = l {
                let any = [n.fx, n.fy, n.fz, n.mx, n.my, n.mz].iter().any(|v| *v != 0.0);
                if self.isolated.contains(&n.node_id) && any {
                    return Err(isolated_load(n.node_id));
                }
                if self.unresisted_moment(n.node_id, &[n.mx, n.my, n.mz]) {
                    return Err(unresisted_moment(n.node_id, self.two_d));
                }
            }
        }
        Ok(())
    }
}

fn isolated_load(node: usize) -> String {
    format!(
        "Load at node {node} is not supported: the node is not connected to any element, connector \
         or constraint, so the load would not reach the structure"
    )
}

fn unresisted_moment(node: usize, two_d: bool) -> String {
    format!(
        "Nodal moment at node {node} is not supported: nothing in the model resists that rotation of \
         the node ({}), so the moment would not reach the structure. Apply it as a force couple, or \
         connect the node with an unreleased member",
        if two_d {
            "every member is hinged there, or only trusses reach it"
        } else {
            "every member releases it there, or only trusses and solid shells reach it"
        }
    )
}

fn fmt_num(v: f64) -> String {
    let s = format!("{:.3}", v);
    let s = s.trim_end_matches('0').trim_end_matches('.').to_string();
    if s == "-0" { "0".into() } else { s }
}

fn fmt_vec(v: &[f64]) -> String {
    format!("({})", v.iter().map(|x| fmt_num(*x)).collect::<Vec<_>>().join(", "))
}

fn list_nodes(ids: &[usize]) -> String {
    const MAX: usize = 12;
    let mut s = ids.iter().take(MAX).map(|i| i.to_string()).collect::<Vec<_>>().join(", ");
    if ids.len() > MAX {
        s.push_str(&format!(" and {} more", ids.len() - MAX));
    }
    s
}

/// Solve a small dense symmetric system (Gaussian elimination, partial pivoting).
fn solve_small(mut a: Vec<Vec<f64>>, mut b: Vec<f64>) -> Vec<f64> {
    let n = b.len();
    for c in 0..n {
        let p = (c..n).max_by(|&x, &y| a[x][c].abs().total_cmp(&a[y][c].abs())).unwrap();
        a.swap(c, p);
        b.swap(c, p);
        if a[c][c].abs() < 1e-300 {
            continue;
        }
        for r in 0..n {
            if r != c {
                let fct = a[r][c] / a[c][c];
                for q in c..n {
                    a[r][q] -= fct * a[c][q];
                }
                b[r] -= fct * b[c];
            }
        }
    }
    (0..n).map(|i| if a[i][i].abs() < 1e-300 { 0.0 } else { b[i] / a[i][i] }).collect()
}

fn describe_motion(m: &Model, motion: &[(u32, [C; 6])], parts: &mut Uf, part_size: &HashMap<u32, usize>) -> String {
    let nt = m.nt();
    let nr = m.nr();
    let three = m.three_d;
    let ids: Vec<usize> = motion.iter().map(|(n, _)| m.ids[*n as usize]).collect();
    // extent of the moving nodes, to compare rotations with translations
    let mut c = [0.0; 3];
    for (n, _) in motion {
        for k in 0..3 {
            c[k] += m.pos[*n as usize][k] / motion.len() as f64;
        }
    }
    let ext = motion
        .iter()
        .map(|(n, _)| (0..3).map(|k| (m.pos[*n as usize][k] - c[k]).powi(2)).sum::<f64>().sqrt())
        .fold(0.0f64, f64::max)
        .max(1e-9);
    let mut scale = 0.0f64;
    for (_, v) in motion {
        for k in 0..nt {
            scale = scale.max(v[k].r.abs());
        }
        for k in 0..nr {
            scale = scale.max(v[3 + k].r.abs() * ext);
        }
    }
    if !(scale > 0.0 && scale.is_finite()) {
        let names = if three { ["ux", "uy", "uz", "rx", "ry", "rz"] } else { ["ux", "uz", "", "ry", "", ""] };
        let mut parts_s = Vec::new();
        for (n, v) in motion.iter().take(8) {
            let dofs: Vec<&str> = (0..6).filter(|&k| v[k].m != 0).map(|k| names[k]).collect();
            parts_s.push(format!("node {} ({})", m.ids[*n as usize], dofs.join(", ")));
        }
        return format!("nodes {} move: {}", list_nodes(&ids), parts_s.join(", "));
    }
    let tr = |v: &[C; 6]| -> [f64; 3] { [v[0].r / scale, v[1].r / scale, if three { v[2].r / scale } else { 0.0 }] };
    let ro = |v: &[C; 6]| -> [f64; 3] { [v[3].r * ext / scale, v[4].r * ext / scale, v[5].r * ext / scale] };
    let translates = motion.iter().any(|(_, v)| (0..nt).any(|k| v[k].m != 0));

    // the moving nodes form whole connected parts?
    let mut roots: HashMap<u32, usize> = HashMap::new();
    for (n, _) in motion {
        *roots.entry(parts.find(*n)).or_default() += 1;
    }
    let whole = roots.iter().all(|(r, cnt)| part_size.get(r) == Some(cnt));
    let who = if whole && roots.len() == 1 {
        format!("the part containing node {} ({} node{})", ids[0], ids.len(), if ids.len() == 1 { "" } else { "s" })
    } else {
        format!("node{} {}", if ids.len() == 1 { "" } else { "s" }, list_nodes(&ids))
    };

    if !translates {
        // rotations only: about a common axis?
        let axis = motion.iter().map(|(_, v)| ro(v)).max_by(|a, b| {
            a.iter().map(|x| x * x).sum::<f64>().total_cmp(&b.iter().map(|x| x * x).sum::<f64>())
        });
        let a = axis.unwrap_or([0.0; 3]);
        let na = a.iter().map(|x| x * x).sum::<f64>().sqrt().max(1e-300);
        let a = if three { a.map(|x| x / na) } else { [0.0, 1.0, 0.0] };
        return format!(
            "{who} can rotate freely{} without any node translating",
            if three { format!(" about an axis along {}", fmt_vec(&a)) } else { String::new() }
        );
    }

    // rigid fit of the translations: u = t + θ × (x − c)
    let nunk = if three { 6 } else { 3 };
    let mut ata = vec![vec![0.0; nunk]; nunk];
    let mut atb = vec![0.0; nunk];
    let mut total = 0.0;
    for (n, v) in motion {
        let p = m.pos[*n as usize];
        let d = [(p[0] - c[0]) / ext, (p[1] - c[1]) / ext, (p[2] - c[2]) / ext];
        let u = tr(v);
        let rows: Vec<(Vec<f64>, f64)> = if three {
            vec![
                (vec![1.0, 0.0, 0.0, 0.0, d[2], -d[1]], u[0]),
                (vec![0.0, 1.0, 0.0, -d[2], 0.0, d[0]], u[1]),
                (vec![0.0, 0.0, 1.0, d[1], -d[0], 0.0], u[2]),
            ]
        } else {
            vec![(vec![1.0, 0.0, -d[1]], u[0]), (vec![0.0, 1.0, d[0]], u[1])]
        };
        for (a, rhs) in rows {
            total += rhs * rhs;
            for i in 0..nunk {
                atb[i] += a[i] * rhs;
                for j in 0..nunk {
                    ata[i][j] += a[i] * a[j];
                }
            }
        }
    }
    for (i, row) in ata.iter_mut().enumerate() {
        row[i] += 1e-12;
    }
    let sol = solve_small(ata, atb);
    let mut resid = 0.0;
    for (n, v) in motion {
        let p = m.pos[*n as usize];
        let d = [(p[0] - c[0]) / ext, (p[1] - c[1]) / ext, (p[2] - c[2]) / ext];
        let u = tr(v);
        let fit: Vec<f64> = if three {
            vec![
                sol[0] + sol[4] * d[2] - sol[5] * d[1],
                sol[1] + sol[5] * d[0] - sol[3] * d[2],
                sol[2] + sol[3] * d[1] - sol[4] * d[0],
            ]
        } else {
            vec![sol[0] - sol[2] * d[1], sol[1] + sol[2] * d[0]]
        };
        for k in 0..fit.len() {
            resid += (u[k] - fit[k]).powi(2);
        }
    }
    let rigid = motion.len() > 1 && resid <= 1e-12 * total.max(1e-300);
    if motion.len() == 1 || !rigid {
        let names = if three { ["ux", "uy", "uz", "rx", "ry", "rz"] } else { ["ux", "uz", "", "ry", "", ""] };
        let mut parts_s = Vec::new();
        for (n, v) in motion.iter().take(6) {
            let (t, r) = (tr(v), ro(v));
            let mut comps = Vec::new();
            for k in 0..nt {
                if v[k].m != 0 {
                    comps.push(format!("{} {}", names[k], fmt_num(t[k])));
                }
            }
            for k in 0..nr {
                if v[3 + k].m != 0 {
                    comps.push(format!("{} {}", names[3 + k], fmt_num(r[k] / ext)));
                }
            }
            parts_s.push(format!("node {}: {}", m.ids[*n as usize], comps.join(", ")));
        }
        let more = if motion.len() > 6 { format!(" (and {} more nodes)", motion.len() - 6) } else { String::new() };
        let lead = if motion.len() == 1 { format!("{who} can move freely") } else { format!("{who} move freely together") };
        return format!("{lead} (relative motion: {}{more})", parts_s.join("; "));
    }
    let kind = if whole { "rigid-body motion of" } else { "rigid motion of" };
    if three {
        let t = [sol[0], sol[1], sol[2]];
        let th = [sol[3], sol[4], sol[5]];
        let nth = th.iter().map(|x| x * x).sum::<f64>().sqrt();
        let nt_ = t.iter().map(|x| x * x).sum::<f64>().sqrt();
        if nth <= 1e-9 * nt_.max(1e-300) {
            return format!("{kind} {who}: translation along {}", fmt_vec(&t.map(|x| x / nt_)));
        }
        let ax = th.map(|x| x / nth);
        // axis point: c + ext · (θ × t)/|θ|²
        let cr = [th[1] * t[2] - th[2] * t[1], th[2] * t[0] - th[0] * t[2], th[0] * t[1] - th[1] * t[0]];
        let p = [c[0] + ext * cr[0] / (nth * nth), c[1] + ext * cr[1] / (nth * nth), c[2] + ext * cr[2] / (nth * nth)];
        let pitch = (t[0] * ax[0] + t[1] * ax[1] + t[2] * ax[2]) / nth;
        let screw = if pitch.abs() > 1e-6 { " (with translation along it)" } else { "" };
        format!("{kind} {who}: rotation about an axis along {} through {}{screw}", fmt_vec(&ax), fmt_vec(&p))
    } else {
        let (tx, tz, th) = (sol[0], sol[1], sol[2]);
        let ntr = (tx * tx + tz * tz).sqrt();
        if th.abs() <= 1e-9 * ntr.max(1e-300) {
            return format!("{kind} {who}: translation along {}", fmt_vec(&[tx / ntr, tz / ntr]));
        }
        let p = [c[0] - ext * tz / th, c[1] + ext * tx / th];
        format!("{kind} {who}: rotation about the point {}", fmt_vec(&p))
    }
}

fn run(m: Model) -> MechanismCheck {
    let mut out = MechanismCheck { two_d: !m.three_d, ..Default::default() };
    out.isolated = (0..m.ids.len()).filter(|&i| !m.referenced[i]).map(|i| m.ids[i]).collect();
    if let Some(why) = &m.unchecked {
        out.unchecked = Some(why.clone());
        return out;
    }
    const DESCRIBE: usize = 3;
    let Some(first) = analyze(&m, Field::new(PRIMES[0]), DESCRIBE, BASIS_CAP) else {
        out.unchecked = Some("model too large for the exact mechanism check".into());
        return out;
    };
    out.free_rotations = first.free_rotations.clone();
    if first.kernel == 0 {
        return out;
    }
    // Confirm with the second prime (a deficiency modulo one prime only is
    // a minor divisible by it, not a mechanism).
    let Some(second) = analyze(&m, Field::new(PRIMES[1]), 0, BASIS_CAP) else {
        out.unchecked = Some("model too large for the exact mechanism check".into());
        return out;
    };
    if second.kernel == 0 {
        return out;
    }
    out.free_motions = first.kernel.min(second.kernel);
    if let (Some(b1), Some(_)) = (&first.basis, &second.basis) {
        out.basis = b1
            .iter()
            .map(|v| BasisVectorIds {
                nodal: v.nodal.iter().map(|(n, x, r)| (m.ids[*n as usize], *x, *r)).collect(),
                refined: v.refined,
            })
            .collect();
        out.basis_complete = true;
    }
    let mut parts = Uf::new(m.ids.len());
    for &(a, b) in &m.links {
        parts.union_all(&[a, b]);
    }
    let mut part_size: HashMap<u32, usize> = HashMap::new();
    for i in 0..m.ids.len() as u32 {
        if m.referenced[i as usize] {
            *part_size.entry(parts.find(i)).or_default() += 1;
        }
    }
    let mut nodes: HashSet<usize> = HashSet::new();
    for mo in &first.motions {
        nodes.extend(mo.iter().map(|(n, _)| m.ids[*n as usize]));
        out.descriptions.push(describe_motion(&m, mo, &mut parts, &part_size));
    }
    let mut nodes: Vec<usize> = nodes.into_iter().collect();
    nodes.sort_unstable();
    out.nodes = nodes;
    out
}

/// Exact mechanism check of a 2D model. `constraints` are the ones the solve
/// imposes (the constrained solver's list; empty for the plain path).
pub fn check_2d(input: &SolverInput, constraints: &[Constraint]) -> MechanismCheck {
    run(model_2d(input, constraints))
}

/// Exact mechanism check of a 3D model (curved beams are expanded first, as
/// the solvers do).
pub fn check_3d(input: &SolverInput3D, constraints: &[Constraint]) -> MechanismCheck {
    if input.curved_beams.is_empty() {
        run(model_3d(input, constraints))
    } else {
        let expanded = super::linear::expand_curved_beams_3d(input);
        run(model_3d(&expanded, constraints))
    }
}

/// Free motions as nodal DOF vectors (node id, solver-local DOF, value), from
/// the floating-point shadow of the exact computation: for testing that the
/// conditions match the assembled stiffness (`K·v ≈ 0`).
#[doc(hidden)]
pub fn free_motion_vectors(input2: Option<&SolverInput>, input3: Option<&SolverInput3D>, max: usize) -> Vec<Vec<(usize, usize, f64)>> {
    let m = match (input2, input3) {
        (Some(i), _) => model_2d(i, &i.constraints),
        (_, Some(i)) => model_3d(i, &i.constraints),
        _ => return Vec::new(),
    };
    let Some(o) = analyze(&m, Field::new(PRIMES[0]), max, 0) else { return Vec::new() };
    let nt = m.nt();
    o.motions
        .iter()
        .map(|mo| {
            let mut v = Vec::new();
            for (n, vals) in mo {
                for d in 0..(nt + m.nr()) {
                    let slot = if d < nt { d } else { 3 + d - nt };
                    v.push((m.ids[*n as usize], d, vals[slot].r));
                }
            }
            v
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn is_prime(n: u64) -> bool {
        // deterministic Miller–Rabin for 64-bit integers
        if n < 2 {
            return false;
        }
        for p in [2u64, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37] {
            if n % p == 0 {
                return n == p;
            }
        }
        let f = Field { p: n, inv2: 0 };
        let mut d = n - 1;
        let mut s = 0;
        while d % 2 == 0 {
            d /= 2;
            s += 1;
        }
        'outer: for a in [2u64, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37] {
            let mut x = f.pow(a, d);
            if x == 1 || x == n - 1 {
                continue;
            }
            for _ in 0..s - 1 {
                x = f.mul(x, x);
                if x == n - 1 {
                    continue 'outer;
                }
            }
            return false;
        }
        true
    }

    #[test]
    fn moduli_are_prime() {
        for p in PRIMES {
            assert!(is_prime(p), "{p}");
        }
    }

    #[test]
    fn f64_images_are_exact() {
        let f = Field::new(PRIMES[0]);
        // 0.1 + 0.2 ≠ 0.3 in f64, and the images say so; 0.5 + 0.25 = 0.75 exactly.
        assert_ne!(f.add(f.of(0.1), f.of(0.2)), f.of(0.3));
        assert_eq!(f.add(f.of(0.5), f.of(0.25)), f.of(0.75));
        assert_eq!(f.mul(f.of(3.0), f.of(1.0 / 4.0)), f.of(0.75));
        assert_eq!(f.add(f.of(-2.5), f.of(2.5)), 0);
        assert_eq!(f.of(1e-310 * 4.0), f.mul(f.of(1e-310), f.of(4.0)));
    }
}
