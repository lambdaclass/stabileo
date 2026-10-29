//! 3D event-to-event plastic hinge analysis (`solve_plastic_3d`).
//!
//! Same algorithm as the 2D solver in `plastic.rs` (whose search, splitting
//! and hinge bookkeeping it shares), with the biaxial yield condition
//! `(My/Mp_y)² + (Mz/Mp_z)² ≤ 1` (local axes) at every section.

use super::{golden_min, span_candidates, unique_key, Piece, PlasticHinge3D, PlasticResult3D, PlasticStep3D, SNAP, STATIONS, TIE};
use crate::element;
use crate::types::*;
use std::collections::{HashMap, HashSet};

/// An element of the model as given, tracked through its splits.
struct Member3 {
    id: usize,
    p0: [f64; 3],
    d: [f64; 3],
    l: f64,
    /// `(Mp_y, Mp_z)`; the member yields only when both are finite.
    mp: (f64, f64),
    pieces: Vec<Piece>,
    /// Member loads at λ = 1 in local coordinates (first solve, unsplit).
    template: Option<ElementForces3D>,
    loaded: bool,
    breakpoints: Vec<f64>,
    /// Accumulated end forces, `End3::vals` order.
    acc: [f64; 12],
    /// Bending releases of the model at [start, end] × (my, mz).
    orig_rel: [[bool; 2]; 2],
}

/// Span sections closer than this (fraction of the member length) to a hinge
/// of the member are that hinge (see the event search).
const HINGE_GAP: f64 = 1e-3;

/// A plastic hinge formed by the analysis (never a release of the model).
struct Hinge3 {
    member: usize,
    t: f64,
    active: bool,
    record: usize,
}

/// End values `(n, vy, vz, mx, my, mz)` × (start, end) of a member assembled
/// from its first and last piece.
fn vals(first: &ElementForces3D, last: &ElementForces3D) -> [f64; 12] {
    [
        first.n_start, last.n_end, first.vy_start, last.vy_end, first.vz_start, last.vz_end,
        first.mx_start, last.mx_end, first.my_start, last.my_end, first.mz_start, last.mz_end,
    ]
}

/// Moment diagrams `(My(t), Mz(t))` of a member: end forces plus member loads.
struct Diagram3 {
    ef: ElementForces3D,
}

impl Diagram3 {
    fn at(&self, t: f64) -> (f64, f64) {
        // As in 2D: `evaluate_diagram_3d_at` takes a point load in only past a
        // 1e-10 m dead band; evaluate at the load itself when that close.
        let x = t * self.ef.length;
        let t = self
            .ef
            .point_loads_y
            .iter()
            .chain(&self.ef.point_loads_z)
            .find(|p| (x - p.a).abs() <= 2e-10)
            .map_or(t, |p| p.a / self.ef.length);
        (
            crate::postprocess::diagrams_3d::evaluate_diagram_3d_at(&self.ef, "momentY", t),
            crate::postprocess::diagrams_3d::evaluate_diagram_3d_at(&self.ef, "momentZ", t),
        )
    }
}

impl Member3 {
    fn yields(&self) -> bool {
        self.mp.0.is_finite() && self.mp.1.is_finite()
    }

    /// Yield function `(My/Mp_y)² + (Mz/Mp_z)²`.
    fn ratio(&self, m: (f64, f64)) -> f64 {
        (m.0 / self.mp.0).powi(2) + (m.1 / self.mp.1).powi(2)
    }

    /// Outward normal of the yield surface at `m` (gradient of `ratio` / 2).
    fn normal(&self, m: (f64, f64)) -> (f64, f64) {
        (m.0 / (self.mp.0 * self.mp.0), m.1 / (self.mp.1 * self.mp.1))
    }

    fn unit_vals(&self, by_id: &HashMap<usize, &ElementForces3D>) -> [f64; 12] {
        match (by_id.get(&self.pieces[0].id), by_id.get(&self.pieces[self.pieces.len() - 1].id)) {
            (Some(f), Some(l)) => vals(f, l),
            _ => [0.0; 12],
        }
    }

    fn element_forces(&self, v: [f64; 12], scale: f64, input: &SolverInput3D) -> ElementForces3D {
        let first = &input.elements[&self.pieces[0].key];
        let last = &input.elements[&self.pieces[self.pieces.len() - 1].key];
        let dl = |v: &Vec<DistributedLoadInfo>| -> Vec<DistributedLoadInfo> {
            v.iter().map(|d| DistributedLoadInfo { q_i: d.q_i * scale, q_j: d.q_j * scale, a: d.a, b: d.b }).collect()
        };
        let pl = |v: &Vec<PointLoadInfo3D>| -> Vec<PointLoadInfo3D> { v.iter().map(|p| PointLoadInfo3D { a: p.a, p: p.p * scale }).collect() };
        let t = self.template.as_ref();
        ElementForces3D {
            element_id: self.id,
            length: self.l,
            n_start: v[0],
            n_end: v[1],
            vy_start: v[2],
            vy_end: v[3],
            vz_start: v[4],
            vz_end: v[5],
            mx_start: v[6],
            mx_end: v[7],
            my_start: v[8],
            my_end: v[9],
            mz_start: v[10],
            mz_end: v[11],
            release_my_start: first.release_my_start,
            release_my_end: last.release_my_end,
            release_mz_start: first.release_mz_start,
            release_mz_end: last.release_mz_end,
            release_t_start: first.release_t_start,
            release_t_end: last.release_t_end,
            q_yi: t.map_or(0.0, |t| t.q_yi * scale),
            q_yj: t.map_or(0.0, |t| t.q_yj * scale),
            distributed_loads_y: t.map(|t| dl(&t.distributed_loads_y)).unwrap_or_default(),
            point_loads_y: t.map(|t| pl(&t.point_loads_y)).unwrap_or_default(),
            q_zi: t.map_or(0.0, |t| t.q_zi * scale),
            q_zj: t.map_or(0.0, |t| t.q_zj * scale),
            distributed_loads_z: t.map(|t| dl(&t.distributed_loads_z)).unwrap_or_default(),
            distributed_loads_x: t.map(|t| dl(&t.distributed_loads_x)).unwrap_or_default(),
            point_loads_z: t.map(|t| pl(&t.point_loads_z)).unwrap_or_default(),
            bimoment_start: None,
            bimoment_end: None,
        }
    }

    fn diagram(&self, v: [f64; 12], scale: f64, input: &SolverInput3D) -> Diagram3 {
        Diagram3 { ef: self.element_forces(v, scale, input) }
    }

    fn bounds(&self) -> Vec<f64> {
        std::iter::once(0.0).chain(self.pieces.iter().map(|p| p.t1)).collect()
    }

    /// The element end at node position `t` that carries a hinge formed there.
    fn slot(&self, t: f64) -> Option<(&str, bool)> {
        if t == 0.0 {
            return Some((&self.pieces[0].key, false));
        }
        self.pieces.iter().find(|p| p.t1 == t).map(|p| (p.key.as_str(), true))
    }

    /// Whether the section at node position `t` already turns freely in both
    /// bending directions.
    fn hinged(&self, input: &SolverInput3D, t: f64) -> bool {
        let both_start = |k: &str| {
            let e = &input.elements[k];
            e.release_my_start && e.release_mz_start
        };
        let both_end = |k: &str| {
            let e = &input.elements[k];
            e.release_my_end && e.release_mz_end
        };
        if t == 0.0 {
            return both_start(&self.pieces[0].key);
        }
        let Some(i) = self.pieces.iter().position(|p| p.t1 == t) else { return false };
        both_end(&self.pieces[i].key) || self.pieces.get(i + 1).is_some_and(|p| both_start(&p.key))
    }
}

fn set_hinge(input: &mut SolverInput3D, m: &Member3, t: f64, on: bool) {
    let Some((key, end)) = m.slot(t) else { return };
    let orig = if t == 0.0 {
        m.orig_rel[0]
    } else if t == 1.0 {
        m.orig_rel[1]
    } else {
        [false, false]
    };
    let rel = if on { [true, true] } else { orig };
    let e = input.elements.get_mut(key).unwrap();
    if end {
        e.release_my_end = rel[0];
        e.release_mz_end = rel[1];
    } else {
        e.release_my_start = rel[0];
        e.release_mz_start = rel[1];
    }
}

fn local_axes(input: &SolverInput3D, el: &SolverElement3D) -> Option<([f64; 3], [f64; 3], [f64; 3])> {
    let ni = crate::ordered::values(&input.nodes).find(|n| n.id == el.node_i)?;
    let nj = crate::ordered::values(&input.nodes).find(|n| n.id == el.node_j)?;
    Some(element::compute_local_axes_3d(
        ni.x, ni.y, ni.z, nj.x, nj.y, nj.z,
        el.local_yx, el.local_yy, el.local_yz, el.roll_angle,
        input.left_hand.unwrap_or(false),
    ))
}

/// Split the piece of `m` containing `t` at `t` (see the 2D `split_member`).
fn split_member(input: &mut SolverInput3D, m: &mut Member3, t: f64, next_node: &mut usize, next_elem: &mut usize) {
    let Some(idx) = m.pieces.iter().position(|p| p.t0 < t && t < p.t1) else { return };
    let (t0, t1) = (m.pieces[idx].t0, m.pieces[idx].t1);
    let old_key = m.pieces[idx].key.clone();
    let old = input.elements[&old_key].clone();
    let axes = local_axes(input, &old);
    let node_id = *next_node;
    *next_node += 1;
    let nkey = unique_key(|k| input.nodes.contains_key(k), node_id);
    input.nodes.insert(
        nkey,
        SolverNode3D { id: node_id, x: m.p0[0] + t * m.d[0], y: m.p0[1] + t * m.d[1], z: m.p0[2] + t * m.d[2] },
    );
    let eid = *next_elem;
    *next_elem += 1;
    let ekey = unique_key(|k| input.elements.contains_key(k), eid);
    input.elements.insert(
        ekey.clone(),
        SolverElement3D {
            id: eid,
            node_i: node_id,
            release_my_start: false,
            release_mz_start: false,
            release_t_start: false,
            ..old.clone()
        },
    );
    {
        let e = input.elements.get_mut(&old_key).unwrap();
        e.node_j = node_id;
        e.release_my_end = false;
        e.release_mz_end = false;
        e.release_t_end = false;
    }

    let s = (t - t0) * m.l;
    let l_old = (t1 - t0) * m.l;
    let l_new = l_old - s;
    let tol = 1e-12 * m.l;
    let opt = |a: f64, b: f64, len: f64| ((a > tol).then_some(a), (b < len - tol).then_some(b));
    let mut loads = Vec::with_capacity(input.loads.len() + 1);
    for ld in std::mem::take(&mut input.loads) {
        match ld {
            SolverLoad3D::Distributed(dl) if dl.element_id == old.id => {
                let a = dl.a.unwrap_or(0.0);
                let b = dl.b.unwrap_or(l_old);
                let at = |qi: f64, qj: f64, x: f64| if b - a > 0.0 { qi + (qj - qi) * (x - a) / (b - a) } else { qi };
                if b <= s + tol {
                    let (oa, ob) = opt(a, b.min(s), s);
                    loads.push(SolverLoad3D::Distributed(SolverDistributedLoad3D { a: oa, b: ob, ..dl }));
                } else if a >= s - tol {
                    let (oa, ob) = opt((a - s).max(0.0), b - s, l_new);
                    loads.push(SolverLoad3D::Distributed(SolverDistributedLoad3D { element_id: eid, a: oa, b: ob, ..dl }));
                } else {
                    let (xs, ys, zs) = (at(dl.q_xi, dl.q_xj, s), at(dl.q_yi, dl.q_yj, s), at(dl.q_zi, dl.q_zj, s));
                    let (oa, ob) = opt(a, s, s);
                    loads.push(SolverLoad3D::Distributed(SolverDistributedLoad3D {
                        q_xj: xs,
                        q_yj: ys,
                        q_zj: zs,
                        a: oa,
                        b: ob,
                        ..dl.clone()
                    }));
                    let (oa, ob) = opt(0.0, b - s, l_new);
                    loads.push(SolverLoad3D::Distributed(SolverDistributedLoad3D {
                        element_id: eid,
                        q_xi: xs,
                        q_yi: ys,
                        q_zi: zs,
                        a: oa,
                        b: ob,
                        ..dl
                    }));
                }
            }
            SolverLoad3D::PointOnElement(pl) if pl.element_id == old.id => {
                if pl.a < s - tol {
                    loads.push(SolverLoad3D::PointOnElement(pl));
                } else if pl.a > s + tol {
                    loads.push(SolverLoad3D::PointOnElement(SolverPointLoad3D { element_id: eid, a: pl.a - s, ..pl }));
                } else if let Some((_, ey, ez)) = axes {
                    let f: Vec<f64> = (0..3).map(|k| pl.py * ey[k] + pl.pz * ez[k]).collect();
                    loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                        node_id,
                        fx: f[0],
                        fy: f[1],
                        fz: f[2],
                        mx: 0.0,
                        my: 0.0,
                        mz: 0.0,
                        bw: None,
                    }));
                }
            }
            SolverLoad3D::Thermal(tl) if tl.element_id == old.id => {
                loads.push(SolverLoad3D::Thermal(SolverThermalLoad3D { element_id: eid, ..tl.clone() }));
                loads.push(SolverLoad3D::Thermal(tl));
            }
            other => loads.push(other),
        }
    }
    input.loads = loads;
    m.pieces[idx].t1 = t;
    m.pieces.insert(idx + 1, Piece { key: ekey, id: eid, t0: t, t1 });
}

/// Local rotations of the released bending ends of element `key` relative to
/// their nodes, `[[θy, θz] start, [θy, θz] end]`, recovered from the
/// unreleased local stiffness (a released end carries no moment). Warping is
/// ignored (12-DOF element).
fn released_end_rotations(input: &SolverInput3D, key: &str, disp: &HashMap<usize, [f64; 6]>) -> [[f64; 2]; 2] {
    let el = &input.elements[key];
    let rel = [
        (3, el.release_t_start),
        (4, el.release_my_start),
        (5, el.release_mz_start),
        (9, el.release_t_end),
        (10, el.release_my_end),
        (11, el.release_mz_end),
    ];
    if el.elem_type != "frame" || !rel.iter().any(|r| r.1) {
        return [[0.0; 2]; 2];
    }
    let node = |id: usize| crate::ordered::values(&input.nodes).find(|n| n.id == id);
    let (Some(ni), Some(nj)) = (node(el.node_i), node(el.node_j)) else { return [[0.0; 2]; 2] };
    let Some(mat) = crate::ordered::values(&input.materials).find(|m| m.id == el.material_id) else { return [[0.0; 2]; 2] };
    let Some(sec) = crate::ordered::values(&input.sections).find(|s| s.id == el.section_id) else { return [[0.0; 2]; 2] };
    let Some((ex, ey, ez)) = local_axes(input, el) else { return [[0.0; 2]; 2] };
    let l = ((nj.x - ni.x).powi(2) + (nj.y - ni.y).powi(2) + (nj.z - ni.z).powi(2)).sqrt();
    let e = mat.e * 1000.0;
    let g = e / (2.0 * (1.0 + mat.nu));
    let py = sec.as_y.map(|ay| 12.0 * e * sec.iy / (g * ay * l * l)).unwrap_or(0.0);
    let pz = sec.as_z.map(|az| 12.0 * e * sec.iz / (g * az * l * l)).unwrap_or(0.0);
    let k = element::frame_local_stiffness_3d(e, sec.a, sec.iy, sec.iz, sec.j, l, g, element::Hinge3D::default(), py, pz);
    let d = |id: usize| disp.get(&id).copied().unwrap_or([0.0; 6]);
    let (di, dj) = (d(el.node_i), d(el.node_j));
    let mut u = [0.0; 12];
    for (blk, v) in [&di[0..3], &di[3..6], &dj[0..3], &dj[3..6]].iter().enumerate() {
        for (r, ax) in [ex, ey, ez].iter().enumerate() {
            u[3 * blk + r] = ax[0] * v[0] + ax[1] * v[1] + ax[2] * v[2];
        }
    }
    let fef = local_fef(input, el, l, e, sec, py, pz);
    let r = |i: usize| (0..12).map(|j| k[i * 12 + j] * u[j]).sum::<f64>() - fef[i];
    let idx: Vec<usize> = rel.iter().filter(|r| r.1).map(|r| r.0).collect();
    let n = idx.len();
    // K_RR Δ = −r_R (Gaussian elimination, n ≤ 6)
    let mut a: Vec<Vec<f64>> = idx.iter().map(|&i| idx.iter().map(|&j| k[i * 12 + j]).chain([-r(i)]).collect()).collect();
    for c in 0..n {
        let p = (c..n).max_by(|&x, &y| a[x][c].abs().total_cmp(&a[y][c].abs())).unwrap();
        a.swap(c, p);
        if a[c][c].abs() < 1e-300 {
            return [[0.0; 2]; 2];
        }
        for i in 0..n {
            if i != c {
                let f = a[i][c] / a[c][c];
                for j in c..=n {
                    a[i][j] -= f * a[c][j];
                }
            }
        }
    }
    let delta = |dof: usize| idx.iter().position(|&i| i == dof).map_or(0.0, |p| a[p][n] / a[p][p]);
    [[delta(4), delta(5)], [delta(10), delta(11)]]
}

/// Fixed-end forces of the element's member loads, unreleased (as linear.rs).
/// `phi_y`, `phi_z`: the member's shear parameters, as in its stiffness.
fn local_fef(
    input: &SolverInput3D,
    el: &SolverElement3D,
    l: f64,
    e: f64,
    sec: &SolverSection3D,
    phi_y: f64,
    phi_z: f64,
) -> [f64; 12] {
    let mut fef = [0.0; 12];
    for ld in &input.loads {
        let f: [f64; 12] = match ld {
            SolverLoad3D::Distributed(dl) if dl.element_id == el.id => {
                let a = dl.a.unwrap_or(0.0);
                let b = dl.b.unwrap_or(l);
                let mut f = if a.abs() < 1e-12 && (b - l).abs() < 1e-12 {
                    element::fef_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, l, phi_y, phi_z)
                } else {
                    element::fef_partial_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, a, b, l, phi_y, phi_z)
                };
                let ax = element::axial_distributed_fef(dl.q_xi, dl.q_xj, a, b, l);
                f[0] = ax[0];
                f[6] = ax[1];
                f
            }
            SolverLoad3D::PointOnElement(pl) if pl.element_id == el.id => {
                element::fef_point_load_3d(pl.py, pl.pz, pl.a, l, phi_y, phi_z)
            }
            SolverLoad3D::Thermal(tl) if tl.element_id == el.id => {
                let (hy, hz) = (tl.depth_y(sec.a, sec.iz), tl.depth_z(sec.a, sec.iy));
                element::fef_thermal_3d(e, sec.a, sec.iy, sec.iz, l, tl.dt_uniform, tl.dt_gradient_y, tl.dt_gradient_z, tl.alpha(), hy, hz)
            }
            _ => continue,
        };
        for (x, y) in fef.iter_mut().zip(f) {
            *x += y;
        }
    }
    fef
}

/// The load increment that takes the section moment from `acc` along `unit`
/// to the yield surface `(My/Mp_y)² + (Mz/Mp_z)² = 1`: the larger root of
/// the quadratic (inside the surface it is the exit point), infinite if the
/// path never reaches the surface ahead.
fn increment_to_yield(acc: (f64, f64), unit: (f64, f64), mp: (f64, f64)) -> f64 {
    let (ay, az) = (acc.0 / mp.0, acc.1 / mp.1);
    let (uy, uz) = (unit.0 / mp.0, unit.1 / mp.1);
    let a = uy * uy + uz * uz;
    let b = 2.0 * (ay * uy + az * uz);
    let c = ay * ay + az * az - 1.0;
    if a <= 0.0 {
        return f64::INFINITY;
    }
    let disc = b * b - 4.0 * a * c;
    if disc < 0.0 {
        return f64::INFINITY;
    }
    // larger root, computed without cancellation
    let sq = disc.sqrt();
    let r = if b <= 0.0 { (-b + sq) / (2.0 * a) } else { -2.0 * c / (b + sq) };
    if r > 0.0 && r.is_finite() { r } else { f64::INFINITY }
}

fn node_pos(input: &SolverInput3D, id: usize) -> [f64; 3] {
    crate::ordered::values(&input.nodes).find(|n| n.id == id).map_or([0.0; 3], |n| [n.x, n.y, n.z])
}

/// Whether the directions span all of space (Gram determinant of the unit
/// vectors bounded away from zero).
fn spans_space(axes: &[[f64; 3]]) -> bool {
    let mut g = [[0.0; 3]; 3];
    for a in axes {
        let n = (a[0] * a[0] + a[1] * a[1] + a[2] * a[2]).sqrt();
        if n == 0.0 {
            continue;
        }
        for i in 0..3 {
            for j in 0..3 {
                g[i][j] += a[i] * a[j] / (n * n);
            }
        }
    }
    let det = g[0][0] * (g[1][1] * g[2][2] - g[1][2] * g[2][1]) - g[0][1] * (g[1][0] * g[2][2] - g[1][2] * g[2][0])
        + g[0][2] * (g[1][0] * g[2][1] - g[1][1] * g[2][0]);
    det > 1e-6
}

fn unit_moment_scale(r: &AnalysisResults3D) -> f64 {
    r.element_forces
        .iter()
        .fold(0.0f64, |a, ef| a.max(ef.my_start.abs()).max(ef.my_end.abs()).max(ef.mz_start.abs()).max(ef.mz_end.abs()))
}

/// The unit-load solution of the current state, or `None` when it is a
/// collapse mechanism. A 3D hinge frees both bending rotations, which can
/// leave mechanisms the loads do no work on (a planar frame loaded in its
/// plane, hinged at the column bases, may turn freely about the base line):
/// those are not collapse. When the rank check finds a mechanism, the state
/// is solved with soft springs (10⁻¹⁰ of the softest member's bending
/// stiffness) at every
/// free DOF, which the linear solver needs on such a singular K (it reports
/// some of them as singular, and regularizes others with artificial
/// rotational springs that "carry" load — a cantilever hinged at its base
/// holds its tip load through one). The member forces of that solve must
/// then balance the applied loads at every free DOF and close along every
/// member: they do iff the loads do no work on the free modes (the member
/// forces are then the unique ones, the free modes being strain-free, and
/// the springs carry nothing); otherwise the state is a collapse mechanism.
fn carry(input: &SolverInput3D) -> Result<Option<AnalysisResults3D>, String> {
    if super::super::kinematic::analyze_kinematics_3d(input).is_solvable {
        return crate::known_issues::optional_solve(super::super::linear::solve_3d(input));
    }
    let soft = with_soft_springs(input);
    let Some(mut r) = crate::known_issues::optional_solve(super::super::linear::solve_3d(&soft))? else { return Ok(None); };
    if !balanced(input, &r) {
        return Ok(None);
    }
    let supported: HashSet<usize> = crate::ordered::values(&input.supports).map(|s| s.node_id).collect();
    r.reactions.retain(|x| supported.contains(&x.node_id));
    Ok(Some(r))
}

fn with_soft_springs(input: &SolverInput3D) -> SolverInput3D {
    let mut out = input.clone();
    // relative to the softest bending stiffness, so that the springs take a
    // negligible share of the ordinary (elastic) displacements
    let (mut kt, mut kr) = (f64::INFINITY, f64::INFINITY);
    for el in crate::ordered::values(&input.elements) {
        let (Some(mat), Some(sec)) = (
            crate::ordered::values(&input.materials).find(|m| m.id == el.material_id),
            crate::ordered::values(&input.sections).find(|x| x.id == el.section_id),
        ) else {
            continue;
        };
        let (pi, pj) = (node_pos(input, el.node_i), node_pos(input, el.node_j));
        let l = ((pj[0] - pi[0]).powi(2) + (pj[1] - pi[1]).powi(2) + (pj[2] - pi[2]).powi(2)).sqrt();
        let ei = mat.e * 1000.0 * if el.elem_type == "frame" { sec.iy.min(sec.iz) } else { sec.a * l * l / 12.0 };
        if l > 0.0 && ei > 0.0 {
            kt = kt.min(12.0 * ei / (l * l * l));
            kr = kr.min(ei / l);
        }
    }
    if !kt.is_finite() {
        (kt, kr) = (1.0, 1.0);
    }
    let (kt, kr) = (1e-10 * kt, 1e-10 * kr);
    let has: HashSet<usize> = crate::ordered::values(&input.supports).map(|s| s.node_id).collect();
    for sup in out.supports.values_mut() {
        if sup.is_inclined == Some(true) {
            continue;
        }
        let fl = [sup.rx, sup.ry, sup.rz, sup.rrx, sup.rry, sup.rrz];
        let ks = [&mut sup.kx, &mut sup.ky, &mut sup.kz, &mut sup.krx, &mut sup.kry, &mut sup.krz];
        for (k, (slot, fixed)) in ks.into_iter().zip(fl).enumerate() {
            if !fixed {
                *slot = Some(slot.unwrap_or(0.0) + if k < 3 { kt } else { kr });
            }
        }
    }
    let mut ids: Vec<usize> = crate::ordered::values(&input.nodes).map(|n| n.id).filter(|id| !has.contains(id)).collect();
    ids.sort();
    for id in ids {
        out.supports.insert(
            unique_key(|k| out.supports.contains_key(k), id),
            SolverSupport3D {
                node_id: id,
                rx: false,
                ry: false,
                rz: false,
                rrx: false,
                rry: false,
                rrz: false,
                kx: Some(kt),
                ky: Some(kt),
                kz: Some(kt),
                krx: Some(kr),
                kry: Some(kr),
                krz: Some(kr),
                dx: None,
                dy: None,
                dz: None,
                drx: None,
                dry: None,
                drz: None,
                rw: None,
                kw: None,
                normal_x: None,
                normal_y: None,
                normal_z: None,
                is_inclined: None,
            },
        );
    }
    out
}

/// Whether the member end forces of `r` balance the applied nodal loads at
/// every free DOF of the frame nodes (nodes on shells or springs are not
/// checked, nor are models with constraints or connectors).
fn balanced(input: &SolverInput3D, r: &AnalysisResults3D) -> bool {
    let mut skip: HashSet<usize> = HashSet::new();
    for p in crate::ordered::values(&input.plates) {
        skip.extend(p.nodes);
    }
    for p in crate::ordered::values(&input.quads) {
        skip.extend(p.nodes);
    }
    for p in crate::ordered::values(&input.quad9s) {
        skip.extend(p.nodes);
    }
    for p in crate::ordered::values(&input.solid_shells) {
        skip.extend(p.nodes);
    }
    for p in crate::ordered::values(&input.curved_shells) {
        skip.extend(p.nodes);
    }
    if !input.constraints.is_empty() || !input.connectors.is_empty() {
        return true;
    }
    let mut sum: HashMap<usize, [f64; 6]> = HashMap::new();
    let mut scale = 0.0f64;
    for l in &input.loads {
        if let SolverLoad3D::Nodal(nl) = l {
            let v = sum.entry(nl.node_id).or_insert([0.0; 6]);
            for (k, x) in [nl.fx, nl.fy, nl.fz, nl.mx, nl.my, nl.mz].into_iter().enumerate() {
                v[k] -= x;
                scale = scale.max(x.abs());
            }
        }
    }
    let by_id: HashMap<usize, &ElementForces3D> = r.element_forces.iter().map(|ef| (ef.element_id, ef)).collect();
    for el in crate::ordered::values(&input.elements) {
        let Some(ef) = by_id.get(&el.id) else { continue };
        let Some((ex, ey, ez)) = local_axes(input, el) else { return false };
        // forces exerted by the nodes on the member, local axes
        let ends = [
            (el.node_i, [-ef.n_start, ef.vy_start, ef.vz_start], [ef.mx_start, ef.my_start, ef.mz_start]),
            (el.node_j, [ef.n_end, -ef.vy_end, -ef.vz_end], [-ef.mx_end, -ef.my_end, -ef.mz_end]),
        ];
        // and each member is in equilibrium: its moment diagrams close on
        // its end moments (a near-singular solve can return end forces that
        // balance the nodes but not the member)
        if el.elem_type == "frame" {
            let my1 = crate::postprocess::diagrams_3d::evaluate_diagram_3d_at(ef, "momentY", 1.0);
            let mz1 = crate::postprocess::diagrams_3d::evaluate_diagram_3d_at(ef, "momentZ", 1.0);
            let sc = [ef.my_start, ef.my_end, ef.mz_start, ef.mz_end, ef.vy_start * ef.length, ef.vz_start * ef.length]
                .iter()
                .fold(scale, |a, x| a.max(x.abs()));
            if (my1 - ef.my_end).abs() > 1e-8 * sc || (mz1 - ef.mz_end).abs() > 1e-8 * sc {
                return false;
            }
        }
        for (n, f, m) in ends {
            let v = sum.entry(n).or_insert([0.0; 6]);
            for k in 0..3 {
                v[k] += f[0] * ex[k] + f[1] * ey[k] + f[2] * ez[k];
                v[3 + k] += m[0] * ex[k] + m[1] * ey[k] + m[2] * ez[k];
            }
            for x in f.iter().chain(&m) {
                scale = scale.max(x.abs());
            }
        }
    }
    let restrained: HashMap<usize, [bool; 6]> = input
        .supports
        .values()
        .map(|s| {
            let inclined = s.is_inclined == Some(true);
            (s.node_id, [s.rx || inclined, s.ry || inclined, s.rz || inclined, s.rrx, s.rry, s.rrz])
        })
        .collect();
    let springs: HashSet<usize> = input
        .supports
        .values()
        .filter(|s| [s.kx, s.ky, s.kz, s.krx, s.kry, s.krz].iter().any(|k| k.is_some_and(|k| k != 0.0)))
        .map(|s| s.node_id)
        .collect();
    let tol = 1e-8 * scale.max(f64::MIN_POSITIVE);
    sum.iter().all(|(n, v)| {
        if skip.contains(n) || springs.contains(n) {
            return true;
        }
        let rs = restrained.get(n).copied().unwrap_or([false; 6]);
        (0..6).all(|k| rs[k] || v[k].abs() <= tol)
    })
}

/// Nodes whose rotation a shell element can hold.
fn rotation_coupled_nodes(input: &SolverInput3D) -> HashSet<usize> {
    let mut out: HashSet<usize> = HashSet::new();
    for p in crate::ordered::values(&input.plates) {
        out.extend(p.nodes);
    }
    for p in crate::ordered::values(&input.quads) {
        out.extend(p.nodes);
    }
    for p in crate::ordered::values(&input.quad9s) {
        out.extend(p.nodes);
    }
    for p in crate::ordered::values(&input.curved_shells) {
        out.extend(p.nodes);
    }
    out
}

fn mechanism(input: &SolverInput3D) -> Result<bool, String> {
    Ok(carry(input)?.is_none())
}

/// Solve 3D plastic analysis (event-to-event incremental method).
///
/// Elastic–perfectly plastic frame members with the biaxial bending yield
/// condition `(My/Mp_y)² + (Mz/Mp_z)² ≤ 1` (local axes; axial force, shear
/// and torsion unlimited) at every section, proportional loading λ·P. Each
/// event finds the smallest load increment that brings any section to the
/// yield surface — at member ends and **inside spans** (the moment diagrams of
/// a loaded member are exact between sections; interior extrema of the
/// increment are located by sampling and golden-section refinement, and a
/// hinge inside a span splits the member there). A hinge releases both
/// bending rotations (`release_my`, `release_mz`; torsion stays continuous)
/// and holds the moment vector it formed with. Results are reported on the
/// members of the model as given; `PlasticHinge3D::position` says where along
/// the member a hinge is.
///
/// Before each increment the state is made consistent: a hinge whose plastic
/// rotation would do negative work against its moment (`M·θ < 0`) closes
/// (`unloaded_at`), and a closed one still on the yield surface that would be
/// loaded outward reopens. When the structure is a mechanism, a hinge that
/// would unload under the mechanism's motion closes and loading continues.
/// Every choice among hinges goes by rate (the one reaching the yield surface
/// first, turning backwards or loaded outward the most), never by element
/// number, so the result does not depend on the numbering (#511). When no
/// consistent set of active hinges exists (a biaxial hinge holds the moment
/// vector it formed with, so closing one hinge can drive another out of the
/// yield surface and back), the analysis stops at the last consistent state:
/// `is_mechanism` is false and the factor is a lower bound.
/// `warnings` lists what keeps the result from being the collapse load.
pub fn solve_plastic_3d(input: &PlasticInput3D) -> Result<PlasticResult3D, String> {
    let mut r = solve_plastic_3d_contained(input)?;
    crate::known_issues::attach(&mut r.structured_diagnostics, crate::known_issues::for_3d(&input.solver, crate::known_issues::Analysis::Plastic));
    for step in &r.steps { crate::known_issues::attach(&mut r.structured_diagnostics, step.results.structured_diagnostics.clone()); }
    for step in &mut r.steps { crate::known_issues::attach(&mut step.results.structured_diagnostics, r.structured_diagnostics.clone()); }
    Ok(r)
}

fn solve_plastic_3d_contained(input: &PlasticInput3D) -> Result<PlasticResult3D, String> {
    // Same reason as the 2D entry: keep `Err` from the inner solve meaning
    // "mechanism", and nothing else.
    super::super::linear::validate_input_3d(&input.solver)?;
    // Invalid shell geometry is a model error, not a mechanism formed by
    // plastic hinges. Refuse it before the loop interprets a failed solve.
    super::super::pre_solve_gates::refuse_broken_elements(&super::super::pre_solve_gates::check_shell_distortion_3d(
        &input.solver,
    ))?;
    // The mechanism test (`carry`/`balanced`) cannot tell a collapse from a
    // free mode when constraints or connectors tie the nodes (it accepted
    // every state, and a beam on a rigid link "collapsed" at 12 times its
    // load), and with support springs it stopped at the first hinge (a
    // propped beam at 40% of its collapse load).
    super::super::feature_gates::refuse_3d(&input.solver, "Plastic (pushover) analysis", &[
        super::super::feature_gates::Feature::Constraints, super::super::feature_gates::Feature::Connectors, super::super::feature_gates::Feature::SupportSprings,
    ])?;
    // Imposed deformations alone: see the 2D solver.
    let m_ref = load_moment_scale_3d(&input.solver);
    if !(m_ref > 0.0) {
        return Err(super::NO_MECHANICAL_LOAD.into());
    }
    let max_hinges = input.max_hinges.unwrap_or(30);

    let mut mp_map: HashMap<usize, (f64, f64)> = HashMap::new();
    for (sid, sec_data) in &input.sections {
        let sec_id: usize = sid.parse().unwrap_or(0);
        if let Some(o) = input.mp_overrides.as_ref().and_then(|m| m.get(sid)) {
            mp_map.insert(sec_id, (o[0], o[1]));
        } else {
            let fy = input.materials.get(&sec_data.material_id.to_string()).and_then(|m| m.fy).unwrap_or(250.0);
            mp_map.insert(sec_id, compute_plastic_moments_3d(sec_data, fy));
        }
    }

    // Curved beams become ordinary frame members first, so that hinges can
    // form on them like on any other member.
    let mut current_input = super::super::linear::expand_curved_beams_3d(&input.solver);
    let node_xyz: HashMap<usize, [f64; 3]> = crate::ordered::values(&current_input.nodes).map(|n| (n.id, [n.x, n.y, n.z])).collect();
    let mut members: Vec<Member3> = current_input
        .elements
        .iter()
        .map(|(k, e)| {
            let pi = node_xyz[&e.node_i];
            let pj = node_xyz[&e.node_j];
            let d = [pj[0] - pi[0], pj[1] - pi[1], pj[2] - pi[2]];
            let mp = if e.elem_type == "frame" {
                mp_map.get(&e.section_id).copied().unwrap_or((f64::INFINITY, f64::INFINITY))
            } else {
                (f64::INFINITY, f64::INFINITY)
            };
            Member3 {
                id: e.id,
                p0: pi,
                d,
                l: (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt(),
                mp,
                pieces: vec![Piece { key: k.clone(), id: e.id, t0: 0.0, t1: 1.0 }],
                template: None,
                loaded: false,
                breakpoints: Vec::new(),
                acc: [0.0; 12],
                orig_rel: [[e.release_my_start, e.release_mz_start], [e.release_my_end, e.release_mz_end]],
            }
        })
        .collect();
    members.sort_by_key(|m| m.id);
    let original_nodes: HashSet<usize> = crate::ordered::values(&input.solver.nodes).map(|n| n.id).collect();
    let mut next_node = node_xyz.keys().max().copied().unwrap_or(0) + 1;
    let mut next_elem = current_input
        .elements
        .values()
        .map(|e| e.id)
        .chain(crate::ordered::values(&current_input.plates).map(|p| p.id))
        .chain(crate::ordered::values(&current_input.quads).map(|p| p.id))
        .chain(crate::ordered::values(&current_input.quad9s).map(|p| p.id))
        .chain(crate::ordered::values(&current_input.solid_shells).map(|p| p.id))
        .chain(crate::ordered::values(&current_input.curved_shells).map(|p| p.id))
        .max()
        .unwrap_or(0)
        + 1;

    let mut cumulative_factor = 0.0;
    let mut all_hinges: Vec<PlasticHinge3D> = Vec::new();
    let mut hinges: Vec<Hinge3> = Vec::new();
    let mut steps: Vec<PlasticStep3D> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();
    // No consistent set of active hinges exists at the current load factor
    // (see the reversal loop below): the analysis stops there.
    let mut stalled = false;
    let mut suppressed = f64::INFINITY;
    let mut exhausted = true;
    let mut last_event: Vec<usize> = Vec::new();
    // sections whose hinge would only duplicate one already formed at the
    // same node (see the spin rule below): they count as hinged
    let mut merged: HashSet<(usize, u64)> = HashSet::new();

    for step in 0..max_hinges {
        // ---- a consistent set of active hinges, and its unit-load solution
        let mut visited: HashSet<Vec<bool>> = HashSet::new();
        let mut tie_closed: Vec<usize> = Vec::new();
        // the state the last event left, restored if no consistent one exists
        let entry: Vec<(bool, usize)> = hinges.iter().map(|h| (h.active, h.record)).collect();
        let entry_records = all_hinges.clone();
        let results = loop {
            let fresh = visited.insert(hinges.iter().map(|h| h.active).collect());
            let state = carry(&current_input)?;
            if state.is_none() {
                if !fresh {
                    break None;
                }
                // Hinges of the last event formed together: open them one at
                // a time and keep only those the mechanism needs (see 2D).
                let open_last: Vec<usize> = last_event.iter().copied().filter(|&h| hinges[h].active).collect();
                if open_last.len() > 1 && tie_closed.is_empty() {
                    for &h in &open_last {
                        set_hinge(&mut current_input, &members[hinges[h].member], hinges[h].t, false);
                    }
                    let mut keep = open_last.len();
                    for (k, &h) in open_last.iter().enumerate() {
                        set_hinge(&mut current_input, &members[hinges[h].member], hinges[h].t, true);
                        if mechanism(&current_input)? {
                            keep = k + 1;
                            break;
                        }
                    }
                    for &h in &open_last[keep..] {
                        hinges[h].active = false;
                        all_hinges[hinges[h].record].unloaded_at = Some(cumulative_factor);
                        tie_closed.push(h);
                    }
                    if keep < open_last.len() {
                        continue;
                    }
                }
                // With hinge h closed, its unit moment increment pointing into
                // the yield surface means h turns backwards in the mechanism.
                // Of those, the one turning backwards the fastest (by rate, not
                // by the order the hinges formed in) closes.
                let mut backwards: Option<(usize, f64)> = None;
                for hi in 0..hinges.len() {
                    if !hinges[hi].active {
                        continue;
                    }
                    let (mi, t) = (hinges[hi].member, hinges[hi].t);
                    set_hinge(&mut current_input, &members[mi], t, false);
                    if let Some(r) = carry(&current_input)? {
                        let by_id: HashMap<usize, &ElementForces3D> = r.element_forces.iter().map(|ef| (ef.element_id, ef)).collect();
                        let m = &members[mi];
                        let mu = m.diagram(m.unit_vals(&by_id), 1.0, &current_input).at(t);
                        let n = m.normal(m.diagram(m.acc, cumulative_factor, &current_input).at(t));
                        let nn = (n.0 * n.0 + n.1 * n.1).sqrt();
                        let scale = unit_moment_scale(&r);
                        let rate = (n.0 * mu.0 + n.1 * mu.1) / (nn * scale).max(f64::MIN_POSITIVE);
                        if rate < -1e-9 && backwards.is_none_or(|(_, x)| rate < x) {
                            backwards = Some((hi, rate));
                        }
                    }
                    set_hinge(&mut current_input, &members[mi], t, true);
                }
                let closed = backwards.is_some();
                if let Some((hi, _)) = backwards {
                    set_hinge(&mut current_input, &members[hinges[hi].member], hinges[hi].t, false);
                    hinges[hi].active = false;
                    all_hinges[hinges[hi].record].unloaded_at = Some(cumulative_factor);
                }
                if !closed {
                    for &h in &tie_closed {
                        if !hinges[h].active {
                            hinges[h].active = true;
                            set_hinge(&mut current_input, &members[hinges[h].member], hinges[h].t, true);
                            all_hinges[hinges[h].record].unloaded_at = None;
                        }
                    }
                    break None;
                }
                continue;
            }
            let Some(r) = state else { break None };
            if !fresh {
                // The reversal checks cycle: closing a hinge that turns
                // backwards drives another closed one out of the yield
                // surface, and reopening it turns the first backwards again.
                // A biaxial hinge here holds the moment vector it formed with,
                // so no choice of active hinges is consistent. Going on from
                // any state of the cycle took a closed section through the
                // yield surface (the event search sees no yield ahead of a
                // section already on it and moving out), and which state the
                // cycle was left in depended on the order the hinges were
                // visited: the collapse factor came out anywhere from 0.4 to
                // 2.4 times the certified one depending on the element
                // numbering (#511). Stop at the last consistent state: its
                // moment field is in equilibrium with λ·P and on or inside the
                // yield surface everywhere, so λ is a lower bound (static
                // theorem).
                for (h, &(active, record)) in hinges.iter_mut().zip(&entry) {
                    if h.active != active {
                        set_hinge(&mut current_input, &members[h.member], h.t, active);
                    }
                    h.active = active;
                    h.record = record;
                }
                all_hinges = entry_records;
                stalled = true;
                break None;
            }
            let by_id: HashMap<usize, &ElementForces3D> = r.element_forces.iter().map(|ef| (ef.element_id, ef)).collect();
            // active hinges whose plastic rotation would work against their moment
            let disp: HashMap<usize, [f64; 6]> = r.displacements.iter().map(|d| (d.node_id, [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz])).collect();
            let mut rot_scale = r.displacements.iter().fold(0.0f64, |a, d| a.max(d.rx.abs()).max(d.ry.abs()).max(d.rz.abs()));
            let mut worst: Option<(usize, f64)> = None;
            for (hi, h) in hinges.iter().enumerate() {
                if !h.active {
                    continue;
                }
                let m = &members[h.member];
                let Some((key, end)) = m.slot(h.t) else { continue };
                let rot = released_end_rotations(&current_input, key, &disp)[end as usize];
                rot_scale = rot_scale.max(rot[0].abs()).max(rot[1].abs());
                // dissipation rate M·θ (diagram moments): positive at an
                // element end, negative at an element start when it flows.
                let mm = m.diagram(m.acc, cumulative_factor, &current_input).at(h.t);
                let w = (mm.0 * rot[0] + mm.1 * rot[1]) / (mm.0 * mm.0 + mm.1 * mm.1).sqrt().max(1e-300);
                let flow = if end { w } else { -w };
                if worst.is_none_or(|(_, f)| flow < f) {
                    worst = Some((hi, flow));
                }
            }
            if let Some((hi, flow)) = worst {
                if flow < -1e-9 * rot_scale {
                    hinges[hi].active = false;
                    set_hinge(&mut current_input, &members[hinges[hi].member], hinges[hi].t, false);
                    all_hinges[hinges[hi].record].unloaded_at = Some(cumulative_factor);
                    continue;
                }
            }
            // closed hinges still on the yield surface that would be loaded
            // outward: the one loaded outward the most reopens (by rate, not
            // by the order the hinges formed in)
            let tol_m = unit_moment_scale(&r) * 1e-9;
            let mut outward: Option<(usize, f64)> = None;
            for hi in 0..hinges.len() {
                if hinges[hi].active {
                    continue;
                }
                let m = &members[hinges[hi].member];
                let t = hinges[hi].t;
                let ma = m.diagram(m.acc, cumulative_factor, &current_input).at(t);
                let mu = m.diagram(m.unit_vals(&by_id), 1.0, &current_input).at(t);
                let n = m.normal(ma);
                let nn = (n.0 * n.0 + n.1 * n.1).sqrt();
                let rate = (n.0 * mu.0 + n.1 * mu.1) / nn.max(f64::MIN_POSITIVE);
                if m.ratio(ma) >= 1.0 - 1e-9 && rate > tol_m && outward.is_none_or(|(_, x)| rate > x) {
                    outward = Some((hi, rate));
                }
            }
            if let Some((hi, _)) = outward {
                let m = &members[hinges[hi].member];
                let t = hinges[hi].t;
                let ma = m.diagram(m.acc, cumulative_factor, &current_input).at(t);
                hinges[hi].active = true;
                set_hinge(&mut current_input, m, t, true);
                let rec = &mut all_hinges[hinges[hi].record];
                if rec.unloaded_at == Some(cumulative_factor) {
                    rec.unloaded_at = None;
                } else {
                    let mut again = rec.clone();
                    again.unloaded_at = None;
                    again.load_factor = cumulative_factor;
                    again.step = step;
                    again.moment_y = ma.0;
                    again.moment_z = ma.1;
                    again.interaction_ratio = m.ratio(ma).sqrt();
                    all_hinges.push(again);
                    hinges[hi].record = all_hinges.len() - 1;
                }
                continue;
            }
            break Some(r);
        };
        let Some(results) = results else {
            exhausted = false;
            break;
        };

        let by_id: HashMap<usize, &ElementForces3D> = results.element_forces.iter().map(|ef| (ef.element_id, ef)).collect();
        if step == 0 {
            for m in &mut members {
                let Some(ef) = by_id.get(&m.id) else { continue };
                let t = (*ef).clone();
                m.loaded = !t.point_loads_y.is_empty() || !t.distributed_loads_y.is_empty() || !t.distributed_loads_z.is_empty();
                let l = m.l;
                let mut bp: Vec<f64> = t.point_loads_y.iter().map(|p| p.a / l).collect();
                bp.extend(t.distributed_loads_y.iter().flat_map(|d| [d.a / l, d.b / l]));
                bp.retain(|&x| x > 0.0 && x < 1.0);
                m.breakpoints = bp;
                m.template = Some(t);
            }
        }

        // ---- next event: smallest increment to the yield surface anywhere
        let tol_m = (unit_moment_scale(&results) * 1e-12).max(m_ref * 1e-9);
        let tol_d = 1e-10 * cumulative_factor;
        let unit_vals: Vec<[f64; 12]> = members.iter().map(|m| m.unit_vals(&by_id)).collect();
        let mut cands: Vec<(usize, f64, f64)> = Vec::new();
        for (mi, m) in members.iter().enumerate() {
            if !m.yields() {
                continue;
            }
            let acc = m.diagram(m.acc, cumulative_factor, &current_input);
            let unit = m.diagram(unit_vals[mi], 1.0, &current_input);
            let dfun = |t: f64| {
                let mu = unit.at(t);
                if mu.0.abs().max(mu.1.abs()) <= tol_m {
                    return f64::INFINITY;
                }
                increment_to_yield(acc.at(t), mu, m.mp)
            };
            let hinged = |t: f64| m.hinged(&current_input, t) || merged.contains(&(mi, t.to_bits()));
            let bounds = m.bounds();
            let (out, sup) = span_candidates(&bounds, m.loaded, &m.breakpoints, hinged, dfun, tol_d);
            suppressed = suppressed.min(sup);
            for (t, d) in out {
                // A span peak this close to a hinge of the member (one formed
                // in the span, open or closed, or a hinged end) is that
                // hinge's peak, moved: a hinge there would cut a sliver of the
                // member whose stiffness swamps the solve in round-off, and
                // the order of the elements then decided the next events
                // (#511). It is reported as a peak moving past the hinge, so
                // the result says it is approximate. An unhinged member end
                // keeps its own peaks, and so does a load breakpoint (a point
                // load or the edge of a partial load): that peak is where the
                // load is, not a drift.
                let at_load = m.breakpoints.iter().any(|&x| (x - t).abs() < SNAP);
                let near = bounds.iter().any(|&b| b != t && (b - t).abs() < HINGE_GAP && ((b > 0.0 && b < 1.0) || hinged(b)));
                if near && !at_load {
                    suppressed = suppressed.min(d);
                    continue;
                }
                cands.push((mi, t, d));
            }
        }
        let min_delta = cands.iter().fold(f64::INFINITY, |a, c| a.min(c.2));
        if !min_delta.is_finite() || min_delta <= 0.0 {
            exhausted = false;
            break;
        }
        if suppressed <= min_delta * (1.0 + 1e-9) {
            warnings.push(format!(
                "at λ = {:.6}: the moment peak moves along a member past a hinge already formed there; \
                 hinges are fixed in place, so the collapse factor is approximate",
                cumulative_factor + suppressed
            ));
        }
        suppressed = f64::INFINITY;
        // Sections reaching Mp within the event search's own resolution form
        // together. Interior peaks are located by golden-section search to
        // ~1e-9 in position (and snapped at SNAP = 1e-6), so a symmetric
        // structure's twin sections differ by that much after the first
        // interior hinge; a 1e-10 tie split them into two events, the second
        // twin never formed, and a symmetric portal "collapsed" 15% above its
        // mechanism load with an inadmissible moment field (found by the
        // metamorphic rotation check: the rotated portal gave the right
        // answer). The tie matches SNAP; the factor moves by at most that.
        let tie = TIE * (cumulative_factor + min_delta);
        let mut chosen: Vec<(usize, f64, f64)> = Vec::new();
        for &(mi, t, d) in &cands {
            if d - min_delta <= tie && !chosen.iter().any(|&(mj, tj, _)| mj == mi && (tj - t).abs() < SNAP) {
                chosen.push((mi, t, d));
            }
        }
        // In the order they reach the yield surface, not in element-id order:
        // the spin rule below and the tie resolution of the next step keep
        // the first ones. Only increments equal to the last bit fall back to
        // the member order (twin sections of a symmetric structure, where
        // either choice gives the same factor).
        chosen.sort_by(|a, b| a.2.total_cmp(&b.2).then(a.0.cmp(&b.0)).then(a.1.total_cmp(&b.1)));
        // A node whose every frame end turns freely in bending, and whose
        // rotation neither the members' torsion nor a support restrains,
        // spins freely: the last hinge there adds nothing but that spin (the
        // corner of a planar frame needs one hinge, not two).
        let mut pending: HashMap<usize, usize> = HashMap::new();
        let coupled = rotation_coupled_nodes(&current_input);
        chosen.retain(|&(mi, t, _)| {
            let m = &members[mi];
            let Some(n) = m.slot(t).map(|(key, end)| {
                let e = &current_input.elements[key];
                if end { e.node_j } else { e.node_i }
            }) else {
                return true;
            };
            let couple = current_input.loads.iter().any(|l| {
                matches!(l, SolverLoad3D::Nodal(nl) if nl.node_id == n && (nl.mx != 0.0 || nl.my != 0.0 || nl.mz != 0.0))
            });
            // A slab or wall can hold the node's rotation too; dropping the
            // hinge there would let the member carry more than its plastic
            // moment.
            if coupled.contains(&n) {
                return true;
            }
            if couple {
                return true;
            }
            let mut free = 0;
            let mut axes: Vec<[f64; 3]> = Vec::new();
            for e in crate::ordered::values(&current_input.elements).filter(|e| e.elem_type == "frame") {
                for (at, rel_b, rel_t, other) in [
                    (e.node_i, e.release_my_start && e.release_mz_start, e.release_t_start, e.node_j),
                    (e.node_j, e.release_my_end && e.release_mz_end, e.release_t_end, e.node_i),
                ] {
                    if at != n {
                        continue;
                    }
                    if !rel_b {
                        free += 1;
                    }
                    if !rel_t {
                        let (p, q) = (node_pos(&current_input, at), node_pos(&current_input, other));
                        axes.push([q[0] - p[0], q[1] - p[1], q[2] - p[2]]);
                    }
                }
            }
            let used = pending.entry(n).or_insert(0);
            if *used + 1 < free {
                *used += 1;
                return true;
            }
            for sup in crate::ordered::values(&current_input.supports).filter(|s| s.node_id == n) {
                let k = |v: Option<f64>| v.unwrap_or(0.0) > 0.0;
                if sup.rrx || k(sup.krx) {
                    axes.push([1.0, 0.0, 0.0]);
                }
                if sup.rry || k(sup.kry) {
                    axes.push([0.0, 1.0, 0.0]);
                }
                if sup.rrz || k(sup.krz) {
                    axes.push([0.0, 0.0, 1.0]);
                }
            }
            if spans_space(&axes) {
                *used += 1;
                true
            } else {
                merged.insert((mi, t.to_bits()));
                false
            }
        });

        cumulative_factor += min_delta;
        for (m, u) in members.iter_mut().zip(&unit_vals) {
            for k in 0..12 {
                m.acc[k] += min_delta * u[k];
            }
        }

        let step_results = merged_results(&results, &members, &unit_vals, min_delta, &original_nodes, &current_input);

        let mut step_hinges = Vec::new();
        last_event.clear();
        for (mi, t, _) in chosen {
            let mm = {
                let m = &members[mi];
                m.diagram(m.acc, cumulative_factor, &current_input).at(t)
            };
            if members[mi].slot(t).is_none() {
                split_member(&mut current_input, &mut members[mi], t, &mut next_node, &mut next_elem);
            }
            set_hinge(&mut current_input, &members[mi], t, true);
            let hinge = PlasticHinge3D {
                element_id: members[mi].id,
                end: if t < 0.5 { "start" } else { "end" }.to_string(),
                moment_y: mm.0,
                moment_z: mm.1,
                interaction_ratio: members[mi].ratio(mm).sqrt(),
                load_factor: cumulative_factor,
                step,
                position: t,
                unloaded_at: None,
            };
            step_hinges.push(hinge.clone());
            all_hinges.push(hinge);
            hinges.push(Hinge3 { member: mi, t, active: true, record: all_hinges.len() - 1 });
            last_event.push(hinges.len() - 1);
        }

        steps.push(PlasticStep3D { load_factor: cumulative_factor, hinges_formed: step_hinges, results: step_results });
    }

    // A stalled analysis stops short of a mechanism.
    let is_mechanism = !stalled && mechanism(&current_input)?;

    if !exhausted && !is_mechanism && !stalled {
        return Err(super::no_bending_collapse(cumulative_factor));
    }
    if exhausted && !is_mechanism {
        warnings.push(format!(
            "stopped after {max_hinges} events without forming a mechanism: the collapse factor \
             is a lower bound (raise maxHinges)"
        ));
    }
    // A hinge holds the moment vector it formed with and turns freely about
    // both bending axes: the flow at a biaxial hinge need not be normal to
    // the yield surface, so the mechanism may collapse early.
    let biaxial = hinges.iter().filter(|h| h.active).any(|h| {
        let m = &members[h.member];
        let mm = m.diagram(m.acc, cumulative_factor, &current_input).at(h.t);
        (mm.0 / m.mp.0).abs().min((mm.1 / m.mp.1).abs()) > 1e-6
    });
    if biaxial && is_mechanism {
        warnings.push(
            "hinges under biaxial bending hold the moment vector they formed with (no flow along the \
             yield surface): the collapse factor is a lower bound for the biaxial yield condition and \
             may be conservative"
                .into(),
        );
    }
    // Final state statically admissible: on or inside the yield surface everywhere
    let mut worst = 0.0f64;
    for m in members.iter().filter(|m| m.yields()) {
        let d = m.diagram(m.acc, cumulative_factor, &current_input);
        let mut ts: Vec<f64> = (0..=4 * STATIONS).map(|i| i as f64 / (4 * STATIONS) as f64).collect();
        ts.extend(m.breakpoints.iter().copied());
        for t in ts {
            worst = worst.max(m.ratio(d.at(t)).sqrt());
        }
        // refine the interior maxima of loaded members
        if m.loaded {
            let n = 4 * STATIONS;
            for i in 1..n {
                let (a, b) = ((i - 1) as f64 / n as f64, (i + 1) as f64 / n as f64);
                let (_, v) = golden_min(|t| -m.ratio(d.at(t)), a, b);
                worst = worst.max((-v).max(0.0).sqrt());
            }
        }
    }
    if stalled {
        // a lower bound only when the field it stopped with is admissible
        warnings.push(if worst > 1.0 + 1e-6 {
            format!(
                "at λ = {cumulative_factor:.6} a hinge rotation reverses and no consistent set of active hinges \
                 exists (biaxial hinges hold the moment vector they formed with): the analysis stops there, \
                 before a mechanism forms"
            )
        } else {
            format!(
                "at λ = {cumulative_factor:.6} a hinge rotation reverses and no consistent set of active hinges \
                 exists (biaxial hinges hold the moment vector they formed with): the analysis stops there, \
                 before a mechanism forms. The collapse factor is a lower bound (the moment field is in \
                 equilibrium and within the yield surface); the collapse load may be higher"
            )
        });
    }
    if worst > 1.0 + 1e-6 {
        warnings.push(format!(
            "the final moment field exceeds the yield surface by a factor {worst:.6}: \
             the collapse factor is not guaranteed"
        ));
    }

    Ok(PlasticResult3D {
        structured_diagnostics: vec![],
        collapse_factor: cumulative_factor,
        steps,
        redundancy: all_hinges.len(),
        hinges: all_hinges,
        is_mechanism,
        warnings,
    })
}

/// One step's increment on the model as given (see the 2D `merged_results`).
fn merged_results(
    results: &AnalysisResults3D,
    members: &[Member3],
    unit_vals: &[[f64; 12]],
    factor: f64,
    original_nodes: &HashSet<usize>,
    input: &SolverInput3D,
) -> AnalysisResults3D {
    AnalysisResults3D {
        displacements: results
            .displacements
            .iter()
            .filter(|d| original_nodes.contains(&d.node_id))
            .map(|d| Displacement3D {
                node_id: d.node_id,
                ux: d.ux * factor,
                uy: d.uy * factor,
                uz: d.uz * factor,
                rx: d.rx * factor,
                ry: d.ry * factor,
                rz: d.rz * factor,
                warping: d.warping.map(|w| w * factor),
            })
            .collect(),
        reactions: results
            .reactions
            .iter()
            .map(|r| Reaction3D {
                node_id: r.node_id,
                fx: r.fx * factor,
                fy: r.fy * factor,
                fz: r.fz * factor,
                mx: r.mx * factor,
                my: r.my * factor,
                mz: r.mz * factor,
                bimoment: r.bimoment.map(|b| b * factor),
            })
            .collect(),
        element_forces: members
            .iter()
            .zip(unit_vals)
            .map(|(m, v)| m.element_forces(v.map(|x| x * factor), factor, input))
            .collect(),
        plate_stresses: vec![],
        quad_stresses: vec![],
        quad_nodal_stresses: vec![],
        constraint_forces: results
            .constraint_forces
            .iter()
            .map(|cf| ConstraintForce { node_id: cf.node_id, dof: cf.dof.clone(), force: cf.force * factor })
            .collect(),
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics: results.structured_diagnostics.clone(),
        equilibrium: None,
        timings: None,
        result_summary: None,
        solver_run_meta: None,
    }
}

/// Plastic moments `(Mp_y, Mp_z)` about the local axes (the certificate,
/// `certify::plastic_3d`, encloses the same formulas exactly).
fn compute_plastic_moments_3d(sec: &PlasticSectionData3D, fy: f64) -> (f64, f64) {
    let fy_kn = fy * 1000.0; // MPa → kN/m²

    let mp_y = if let (Some(b), Some(h)) = (sec.b, sec.h) {
        // Rectangular: Zp_y = b*h²/4
        fy_kn * b * h * h / 4.0
    } else if sec.iy > 1e-20 {
        let h_approx = (12.0 * sec.iy / sec.a).sqrt();
        let s_el = sec.iy / (h_approx / 2.0);
        fy_kn * 1.15 * s_el
    } else {
        f64::INFINITY
    };

    let mp_z = if let (Some(b), Some(d)) = (sec.b, sec.d) {
        // Rectangular: Zp_z = d*b²/4
        fy_kn * d * b * b / 4.0
    } else if let (Some(b), Some(h)) = (sec.b, sec.h) {
        // Assume d = b for square-ish sections
        fy_kn * h * b * b / 4.0
    } else if sec.iz > 1e-20 {
        let b_approx = (12.0 * sec.iz / sec.a).sqrt();
        let s_el = sec.iz / (b_approx / 2.0);
        fy_kn * 1.15 * s_el
    } else {
        f64::INFINITY
    };

    (mp_y, mp_z)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merged_increment_keeps_solver_diagnostics() {
        let input: PlasticInput3D = serde_json::from_str(include_str!("../../../verify/samples/plastic-3d-portal.input.json")).unwrap();
        let mut results = crate::solver::linear::solve_3d(&input.solver).unwrap();
        results.structured_diagnostics.push(crate::known_issues::diagnostic("NUM-INVARIANCE"));
        let merged = merged_results(&results, &[], &[], 1.0, &HashSet::new(), &input.solver);
        assert!(merged.structured_diagnostics.iter().any(|d| d.phase.as_deref() == Some("NUM-INVARIANCE")));
    }

    #[test]
    fn increment_to_yield_matches_uniaxial_and_circle() {
        // uniaxial: from 30 toward +, Mp = 100 → 70 / 2
        assert!((increment_to_yield((30.0, 0.0), (2.0, 0.0), (100.0, 50.0)) - 35.0).abs() < 1e-12);
        // moving back toward −Mp: (−100 − 30)/(−2) = 65
        assert!((increment_to_yield((30.0, 0.0), (-2.0, 0.0), (100.0, 50.0)) - 65.0).abs() < 1e-12);
        // circle radius 1 from the origin along (3, 4): 1/5
        assert!((increment_to_yield((0.0, 0.0), (3.0, 4.0), (1.0, 1.0)) - 0.2).abs() < 1e-15);
        // outside and moving out: never
        assert!(increment_to_yield((2.0, 0.0), (1.0, 0.0), (1.0, 1.0)).is_infinite());
    }
}

/// Σ|load| × model size (see the 2D `load_moment_scale_2d`).
fn load_moment_scale_3d(input: &SolverInput3D) -> f64 {
    let mut lo = [f64::INFINITY; 3];
    let mut hi = [f64::NEG_INFINITY; 3];
    for n in crate::ordered::values(&input.nodes) {
        for (k, v) in [n.x, n.y, n.z].into_iter().enumerate() {
            lo[k] = lo[k].min(v);
            hi[k] = hi[k].max(v);
        }
    }
    let l = (0..3).map(|k| hi[k] - lo[k]).fold(f64::MIN_POSITIVE, f64::max);
    let len = |id: usize| {
        crate::ordered::values(&input.elements).find(|e| e.id == id).and_then(|e| {
            let a = crate::ordered::values(&input.nodes).find(|n| n.id == e.node_i)?;
            let b = crate::ordered::values(&input.nodes).find(|n| n.id == e.node_j)?;
            Some(((b.x - a.x).powi(2) + (b.y - a.y).powi(2) + (b.z - a.z).powi(2)).sqrt())
        }).unwrap_or(0.0)
    };
    let f: f64 = input.loads.iter().map(|ld| match ld {
        SolverLoad3D::Nodal(n) => n.fx.abs() + n.fy.abs() + n.fz.abs() + (n.mx.abs() + n.my.abs() + n.mz.abs()) / l,
        SolverLoad3D::Distributed(d) => [d.q_xi, d.q_xj, d.q_yi, d.q_yj, d.q_zi, d.q_zj].iter().fold(0.0f64, |a, b| a.max(b.abs())) * len(d.element_id),
        SolverLoad3D::PointOnElement(p) => p.py.abs() + p.pz.abs(),
        _ => 0.0,
    }).sum();
    f * l
}
