use crate::types::*;
use std::collections::HashMap;

// ==================== 2D Plastic Types ====================

/// Plastic analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticResult {
    pub collapse_factor: f64,
    pub steps: Vec<PlasticStep>,
    pub hinges: Vec<PlasticHinge>,
    pub is_mechanism: bool,
    pub redundancy: usize,
    /// Conditions under which `collapse_factor` is not guaranteed to be the
    /// collapse load of the model (empty when it is). See `solve_plastic_2d`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticStep {
    pub load_factor: f64,
    pub hinges_formed: Vec<PlasticHinge>,
    /// Increment of the step (the unit-load solution scaled by the load-factor
    /// increment), on the members and nodes of the model as given.
    pub results: AnalysisResults,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticHinge {
    pub element_id: usize,
    /// "start" or "end": the end of the member the hinge is at, or for a hinge
    /// inside the span the nearer one (see `position`).
    pub end: String,
    pub moment: f64,
    pub load_factor: f64,
    pub step: usize,
    /// Position along the member as a fraction of its length: 0 at the start,
    /// 1 at the end, in between for a hinge formed inside the span (under a
    /// point load or at the peak of a distributed load's moment diagram).
    #[serde(default)]
    pub position: f64,
    /// Load factor at which the hinge unloaded elastically (its rotation
    /// reversed) and closed again; `None` while it stays plastic.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unloaded_at: Option<f64>,
}

// ==================== 3D Plastic Types ====================

/// 3D plastic (pushover) analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticResult3D {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub structured_diagnostics: Vec<StructuredDiagnostic>,
    pub collapse_factor: f64,
    pub steps: Vec<PlasticStep3D>,
    pub hinges: Vec<PlasticHinge3D>,
    pub is_mechanism: bool,
    pub redundancy: usize,
    /// Conditions under which `collapse_factor` is not guaranteed to be the
    /// collapse load of the model (empty when it is). See `solve_plastic_3d`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticStep3D {
    pub load_factor: f64,
    pub hinges_formed: Vec<PlasticHinge3D>,
    pub results: AnalysisResults3D,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticHinge3D {
    pub element_id: usize,
    /// "start" or "end": the end of the member the hinge is at, or for a hinge
    /// inside the span the nearer one (see `position`).
    pub end: String,
    /// Moment vector (local My, Mz) the hinge formed with; it holds it while
    /// it stays plastic.
    pub moment_y: f64,
    pub moment_z: f64,
    /// `√((My/Mp_y)² + (Mz/Mp_z)²)` at formation (1 on the yield surface).
    pub interaction_ratio: f64,
    pub load_factor: f64,
    pub step: usize,
    /// Position along the member as a fraction of its length (0 start, 1 end).
    #[serde(default)]
    pub position: f64,
    /// Load factor at which the hinge unloaded elastically and closed again.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unloaded_at: Option<f64>,
}

/// The load increment that takes a moment from `m_acc` to ±Mp along `m_unit`.
///
/// The moment reaches the plastic moment of the sign it is moving in. This used
/// to be (Mp − |m_acc|)/|m_unit|, which holds only while the moment grows in
/// magnitude: once redistribution turned a moment back toward zero, a hinge was
/// declared where |M| was a fraction of Mp — below the collapse load. The space
/// method's interaction criterion already solves this with signs.
fn increment_to_mp(mp: f64, m_acc: f64, m_unit: f64) -> f64 {
    (mp.copysign(m_unit) - m_acc) / m_unit
}

// ---------- 2D event-to-event analysis: members, pieces, hinges ----------

/// Stations sampled along a member that carries member loads, before the
/// local minima of the load increment are refined by golden-section search.
const STATIONS: usize = 48;
/// Two sections closer than this (fraction of the member length) are one.
const SNAP: f64 = 1e-6;
/// Relative load-factor resolution of an event (see the tie in the event loop).
const TIE: f64 = 1e-6;

/// A stretch `[t0, t1]` of an original member, carried by one solver element.
/// A member is split into pieces where hinges form inside its span.
struct Piece {
    key: String,
    id: usize,
    t0: f64,
    t1: f64,
}

/// An element of the model as given, tracked through its splits.
struct Member {
    id: usize,
    x0: f64,
    z0: f64,
    dx: f64,
    dz: f64,
    l: f64,
    /// Plastic moment; infinite when the member never yields in bending
    /// (truss / cable members, sections without an Mp).
    mp: f64,
    pieces: Vec<Piece>,
    /// Member loads at λ = 1 in the member's own coordinates (from the first
    /// solve, before any split).
    template: Option<ElementForces>,
    loaded: bool,
    breakpoints: Vec<f64>,
    /// Accumulated end forces (n_start, n_end, v_start, v_end, m_start, m_end).
    acc: [f64; 6],
}

/// A plastic hinge formed by the analysis (never a release of the model).
struct HingeState {
    member: usize,
    t: f64,
    /// Sign of the moment the hinge carries (±Mp).
    sign: f64,
    active: bool,
    /// Index of its record in the reported hinge list.
    record: usize,
}

/// Bending-moment diagram of a member: end forces plus member loads.
struct Diagram {
    ef: ElementForces,
    pl: Vec<PointLoadInfo>,
}

impl Diagram {
    fn at(&self, t: f64) -> f64 {
        // `compute_diagram_value_at_sorted` takes a point load in only past
        // a 1e-10 m dead band: just beyond the load it would continue the
        // slope from before it. Evaluate there at the load itself.
        let x = t * self.ef.length;
        let t = self.pl.iter().find(|p| (x - p.a).abs() <= 2e-10).map_or(t, |p| p.a / self.ef.length);
        crate::postprocess::diagrams::compute_diagram_value_at_sorted("moment", t, &self.ef, &self.pl)
    }
}

impl Member {
    fn vals(ef_first: &ElementForces, ef_last: &ElementForces) -> [f64; 6] {
        [ef_first.n_start, ef_last.n_end, ef_first.v_start, ef_last.v_end, ef_first.m_start, ef_last.m_end]
    }

    /// End forces of the whole member in a solve of the current (split) model.
    fn unit_vals(&self, by_id: &HashMap<usize, &ElementForces>) -> [f64; 6] {
        match (by_id.get(&self.pieces[0].id), by_id.get(&self.pieces[self.pieces.len() - 1].id)) {
            (Some(first), Some(last)) => Self::vals(first, last),
            _ => [0.0; 6],
        }
    }

    /// The member's forces with the given end values and its loads times `scale`.
    fn element_forces(&self, v: [f64; 6], scale: f64, input: &SolverInput) -> ElementForces {
        let first = &input.elements[&self.pieces[0].key];
        let last = &input.elements[&self.pieces[self.pieces.len() - 1].key];
        let (q_i, q_j, pls, dls) = match &self.template {
            Some(t) => (
                t.q_i * scale,
                t.q_j * scale,
                t.point_loads
                    .iter()
                    .map(|p| PointLoadInfo { a: p.a, p: p.p * scale, px: p.px.map(|x| x * scale), my: p.my.map(|x| x * scale) })
                    .collect(),
                t.distributed_loads
                    .iter()
                    .map(|d| DistributedLoadInfo { q_i: d.q_i * scale, q_j: d.q_j * scale, a: d.a, b: d.b })
                    .collect(),
            ),
            None => (0.0, 0.0, Vec::new(), Vec::new()),
        };
        ElementForces {
            element_id: self.id,
            n_start: v[0],
            n_end: v[1],
            v_start: v[2],
            v_end: v[3],
            m_start: v[4],
            m_end: v[5],
            length: self.l,
            q_i,
            q_j,
            point_loads: pls,
            distributed_loads: dls,
            distributed_loads_x: self.template.as_ref().map(|t| t.distributed_loads_x.iter()
                .map(|d| DistributedLoadInfo { q_i: d.q_i * scale, q_j: d.q_j * scale, a: d.a, b: d.b }).collect()).unwrap_or_default(),
            hinge_start: first.hinge_start,
            hinge_end: last.hinge_end,
        }
    }

    fn diagram(&self, v: [f64; 6], scale: f64, input: &SolverInput) -> Diagram {
        let ef = self.element_forces(v, scale, input);
        let pl = crate::postprocess::diagrams::sorted_point_loads(&ef);
        Diagram { ef, pl }
    }

    /// Section positions that are nodes of the current model: 0, the piece
    /// boundaries, 1.
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

    /// Whether the section at node position `t` already rotates freely.
    fn hinged(&self, input: &SolverInput, t: f64) -> bool {
        if t == 0.0 {
            return input.elements[&self.pieces[0].key].hinge_start;
        }
        let Some(i) = self.pieces.iter().position(|p| p.t1 == t) else { return false };
        input.elements[&self.pieces[i].key].hinge_end
            || self.pieces.get(i + 1).is_some_and(|p| input.elements[&p.key].hinge_start)
    }

    fn node_at(&self, input: &SolverInput, t: f64) -> Option<usize> {
        let (key, end) = self.slot(t)?;
        let e = &input.elements[key];
        Some(if end { e.node_j } else { e.node_i })
    }
}

fn set_hinge(input: &mut SolverInput, m: &Member, t: f64, on: bool) {
    if let Some((key, end)) = m.slot(t) {
        let e = input.elements.get_mut(key).unwrap();
        if end {
            e.hinge_end = on;
        } else {
            e.hinge_start = on;
        }
    }
}

fn unique_key(map_has: impl Fn(&str) -> bool, id: usize) -> String {
    let mut k = id.to_string();
    let mut n = 0;
    while map_has(&k) {
        n += 1;
        k = format!("{id}~plastic{n}");
    }
    k
}

/// Split the piece of `m` containing `t` at `t`: a new node there, the piece
/// shortened to it and a new element from it on. Member loads follow the part
/// they act on; a point load exactly at the cut becomes a nodal load.
fn split_member(input: &mut SolverInput, m: &mut Member, t: f64, next_node: &mut usize, next_elem: &mut usize) {
    let Some(idx) = m.pieces.iter().position(|p| p.t0 < t && t < p.t1) else { return };
    let (t0, t1) = (m.pieces[idx].t0, m.pieces[idx].t1);
    let old_key = m.pieces[idx].key.clone();
    let old = input.elements[&old_key].clone();
    let node_id = *next_node;
    *next_node += 1;
    let nkey = unique_key(|k| input.nodes.contains_key(k), node_id);
    input.nodes.insert(nkey, SolverNode { id: node_id, x: m.x0 + t * m.dx, z: m.z0 + t * m.dz });
    let eid = *next_elem;
    *next_elem += 1;
    let ekey = unique_key(|k| input.elements.contains_key(k), eid);
    input.elements.insert(
        ekey.clone(),
        SolverElement { id: eid, node_i: node_id, hinge_start: false, ..old.clone() },
    );
    {
        let e = input.elements.get_mut(&old_key).unwrap();
        e.node_j = node_id;
        e.hinge_end = false;
    }

    let s = (t - t0) * m.l;
    let l_old = (t1 - t0) * m.l;
    let l_new = l_old - s;
    let tol = 1e-12 * m.l;
    let (c, sn) = (m.dx / m.l, m.dz / m.l);
    let dist = |element_id: usize, q_i: f64, q_j: f64, a: f64, b: f64, len: f64| {
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id,
            q_i,
            q_j,
            a: (a > tol).then_some(a),
            b: (b < len - tol).then_some(b),
        })
    };
    let mut loads = Vec::with_capacity(input.loads.len() + 1);
    for ld in std::mem::take(&mut input.loads) {
        match ld {
            SolverLoad::Distributed(dl) if dl.element_id == old.id => {
                let a = dl.a.unwrap_or(0.0);
                let b = dl.b.unwrap_or(l_old);
                let q_at = |x: f64| if b - a > 0.0 { dl.q_i + (dl.q_j - dl.q_i) * (x - a) / (b - a) } else { dl.q_i };
                if b <= s + tol {
                    loads.push(dist(old.id, dl.q_i, dl.q_j, a, b.min(s), s));
                } else if a >= s - tol {
                    loads.push(dist(eid, dl.q_i, dl.q_j, (a - s).max(0.0), b - s, l_new));
                } else {
                    let qs = q_at(s);
                    loads.push(dist(old.id, dl.q_i, qs, a, s, s));
                    loads.push(dist(eid, qs, dl.q_j, 0.0, b - s, l_new));
                }
            }
            // An axial span load is cut at the hinge as a transverse one is.
            SolverLoad::AxialDistributed(al) if al.element_id == old.id => {
                let a = al.a.unwrap_or(0.0);
                let b = al.b.unwrap_or(l_old);
                let q_at = |x: f64| if b - a > 0.0 { al.q_i + (al.q_j - al.q_i) * (x - a) / (b - a) } else { al.q_i };
                let ax = |element_id: usize, q_i: f64, q_j: f64, a: f64, b: f64, len: f64| {
                    SolverLoad::AxialDistributed(SolverAxialDistributedLoad { element_id, q_i, q_j, a: (a > tol).then_some(a), b: (b < len - tol).then_some(b) })
                };
                if b <= s + tol {
                    loads.push(ax(old.id, al.q_i, al.q_j, a, b.min(s), s));
                } else if a >= s - tol {
                    loads.push(ax(eid, al.q_i, al.q_j, (a - s).max(0.0), b - s, l_new));
                } else {
                    let qs = q_at(s);
                    loads.push(ax(old.id, al.q_i, qs, a, s, s));
                    loads.push(ax(eid, qs, al.q_j, 0.0, b - s, l_new));
                }
            }
            SolverLoad::PointOnElement(pl) if pl.element_id == old.id => {
                if pl.a < s - tol {
                    loads.push(SolverLoad::PointOnElement(pl));
                } else if pl.a > s + tol {
                    loads.push(SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id: eid, a: pl.a - s, ..pl }));
                } else {
                    // local x = (c, s), local y = (−s, c)
                    let px = pl.px.unwrap_or(0.0);
                    loads.push(SolverLoad::Nodal(SolverNodalLoad {
                        node_id,
                        fx: px * c - pl.p * sn,
                        fz: px * sn + pl.p * c,
                        my: pl.my.unwrap_or(0.0),
                    }));
                }
            }
            SolverLoad::Thermal(tl) if tl.element_id == old.id => {
                loads.push(SolverLoad::Thermal(SolverThermalLoad { element_id: eid, ..tl.clone() }));
                loads.push(SolverLoad::Thermal(tl));
            }
            other => loads.push(other),
        }
    }
    input.loads = loads;
    m.pieces[idx].t1 = t;
    m.pieces.insert(idx + 1, Piece { key: ekey, id: eid, t0: t, t1 });
}

/// Rotation of the released ends of element `key` relative to their nodes
/// (element end rotation − node rotation), [start, end], in a solve with nodal
/// displacements `disp`. Recovered from the unreleased local stiffness: the
/// released end carries no moment.
fn released_end_rotations(input: &SolverInput, key: &str, disp: &HashMap<usize, [f64; 3]>) -> [f64; 2] {
    let el = &input.elements[key];
    if el.elem_type != "frame" || !(el.hinge_start || el.hinge_end) {
        return [0.0; 2];
    }
    let node = |id: usize| crate::ordered::values(&input.nodes).find(|n| n.id == id);
    let (Some(ni), Some(nj)) = (node(el.node_i), node(el.node_j)) else { return [0.0; 2] };
    let Some(mat) = crate::ordered::values(&input.materials).find(|m| m.id == el.material_id) else { return [0.0; 2] };
    let Some(sec) = crate::ordered::values(&input.sections).find(|s| s.id == el.section_id) else { return [0.0; 2] };
    let (dx, dz) = (nj.x - ni.x, nj.z - ni.z);
    let l = (dx * dx + dz * dz).sqrt();
    let (c, s) = (dx / l, dz / l);
    let e = mat.e * 1000.0;
    let phi = match sec.as_y {
        Some(as_y) => 12.0 * e * sec.iz / (e / (2.0 * (1.0 + mat.nu)) * as_y * l * l),
        None => 0.0,
    };
    let k = crate::element::frame_local_stiffness_2d(e, sec.a, sec.iz, l, false, false, phi);
    let d = |id: usize| disp.get(&id).copied().unwrap_or([0.0; 3]);
    let (di, dj) = (d(el.node_i), d(el.node_j));
    let u = [
        c * di[0] + s * di[1], -s * di[0] + c * di[1], di[2],
        c * dj[0] + s * dj[1], -s * dj[0] + c * dj[1], dj[2],
    ];
    // equivalent nodal loads of the member loads, fully fixed (as linear.rs)
    let mut fef = [0.0; 6];
    for ld in &input.loads {
        let f = match ld {
            SolverLoad::Distributed(dl) if dl.element_id == el.id => {
                let a = dl.a.unwrap_or(0.0);
                let b = dl.b.unwrap_or(l);
                if a.abs() < 1e-12 && (b - l).abs() < 1e-12 {
                    crate::element::fef_distributed_2d(dl.q_i, dl.q_j, l, phi)
                } else {
                    crate::element::fef_partial_distributed_2d(dl.q_i, dl.q_j, a, b, l, phi)
                }
            }
            SolverLoad::PointOnElement(pl) if pl.element_id == el.id => {
                crate::element::fef_point_load_2d(pl.p, pl.px.unwrap_or(0.0), pl.my.unwrap_or(0.0), pl.a, l, phi)
            }
            SolverLoad::Thermal(tl) if tl.element_id == el.id => {
                let h = tl.depth(sec.a, sec.iz);
                crate::element::fef_thermal_2d(e, sec.a, sec.iz, l, tl.dt_uniform, tl.dt_gradient, tl.alpha(), h)
            }
            _ => continue,
        };
        for (x, y) in fef.iter_mut().zip(f) {
            *x += y;
        }
    }
    let r = |i: usize| (0..6).map(|j| k[i * 6 + j] * u[j]).sum::<f64>() - fef[i];
    let (r2, r5) = (r(2), r(5));
    match (el.hinge_start, el.hinge_end) {
        (true, false) => [-r2 / k[2 * 6 + 2], 0.0],
        (false, true) => [0.0, -r5 / k[5 * 6 + 5]],
        _ => {
            let (a, b, cc, dd) = (k[2 * 6 + 2], k[2 * 6 + 5], k[5 * 6 + 2], k[5 * 6 + 5]);
            let det = a * dd - b * cc;
            [(-r2 * dd + b * r5) / det, (-a * r5 + cc * r2) / det]
        }
    }
}

/// Minimum of `f` on `[a, b]` by golden-section search.
fn golden_min(f: impl Fn(f64) -> f64, mut a: f64, mut b: f64) -> (f64, f64) {
    let r = (5f64.sqrt() - 1.0) / 2.0;
    let mut c = b - r * (b - a);
    let mut d = a + r * (b - a);
    let (mut fc, mut fd) = (f(c), f(d));
    for _ in 0..200 {
        if b - a <= 1e-13 {
            break;
        }
        if fc <= fd {
            b = d;
            d = c;
            fd = fc;
            c = b - r * (b - a);
            fc = f(c);
        } else {
            a = c;
            c = d;
            fc = fd;
            d = a + r * (b - a);
            fd = f(d);
        }
    }
    if fc <= fd { (c, fc) } else { (d, fd) }
}

/// Candidate hinge positions of one member for the next event: the load
/// increment that brings each section to ±Mp, at the member's nodes and at
/// the local minima inside its span (sampled, then refined). The moment
/// diagram is exact between sections; only the location of an interior
/// extremum is searched. Returns the `(t, Δλ)` candidates and the smallest
/// increment of a peak found right beside a hinge (infinite if none).
fn member_candidates(m: &Member, input: &SolverInput, acc: &Diagram, unit: &Diagram, tol_m: f64, tol_d: f64) -> (Vec<(f64, f64)>, f64) {
    let dfun = |t: f64| {
        let mu = unit.at(t);
        if mu.abs() <= tol_m {
            return f64::INFINITY;
        }
        let d = increment_to_mp(m.mp, acc.at(t), mu);
        if d.is_finite() { d } else { f64::INFINITY }
    };
    span_candidates(&m.bounds(), m.loaded, &m.breakpoints, |t| m.hinged(input, t), dfun, tol_d)
}

/// Shared by the 2D and 3D event searches. `bounds` are the member's node
/// positions (0, piece boundaries, 1); `dfun(t)` the load increment that
/// brings section `t` to yield (infinite if never); `hinged(t)` whether the
/// node at `t` already turns freely. A loaded member is also sampled at
/// `STATIONS` stations and its load breakpoints, and every interior local
/// minimum of `dfun` is refined by golden-section search.
fn span_candidates(
    bounds: &[f64],
    loaded: bool,
    breakpoints: &[f64],
    hinged: impl Fn(f64) -> bool,
    dfun: impl Fn(f64) -> f64,
    tol_d: f64,
) -> (Vec<(f64, f64)>, f64) {
    let mut out = Vec::new();
    let mut suppressed = f64::INFINITY;
    let mut ts: Vec<(f64, bool)> = bounds.iter().map(|&t| (t, true)).collect();
    if loaded {
        ts.extend((1..STATIONS).map(|i| (i as f64 / STATIONS as f64, false)));
        ts.extend(breakpoints.iter().map(|&t| (t, false)));
    }
    ts.sort_by(|a, b| a.0.total_cmp(&b.0));
    let mut pts: Vec<(f64, bool)> = Vec::with_capacity(ts.len());
    for (t, node) in ts {
        match pts.last_mut() {
            Some(last) if (t - last.0).abs() < 1e-12 => {
                if node {
                    *last = (t, true);
                }
            }
            _ => pts.push((t, node)),
        }
    }
    let vals: Vec<f64> = pts
        .iter()
        .map(|&(t, node)| if node && hinged(t) { f64::INFINITY } else { dfun(t) })
        .collect();
    for (i, &(t, node)) in pts.iter().enumerate() {
        if node && vals[i] > tol_d && vals[i].is_finite() {
            out.push((t, vals[i]));
        }
    }
    for i in 1..pts.len().saturating_sub(1) {
        if pts[i].1 || !vals[i].is_finite() || vals[i] > vals[i - 1] || vals[i] > vals[i + 1] {
            continue;
        }
        let (tg, dg) = golden_min(&dfun, pts[i - 1].0, pts[i + 1].0);
        let (tb, db) = if dg < vals[i] { (tg, dg) } else { (pts[i].0, vals[i]) };
        if db <= tol_d {
            continue;
        }
        let near = bounds.iter().copied().min_by(|a, b| (a - tb).abs().total_cmp(&(b - tb).abs())).unwrap();
        if (near - tb).abs() < SNAP {
            // the node itself is a candidate already, unless it is a hinge:
            // then the peak sits right beside a hinge that cannot move.
            if hinged(near) {
                suppressed = suppressed.min(db);
            }
            continue;
        }
        out.push((tb, db));
    }
    (out, suppressed)
}

/// Solve 2D plastic analysis (event-to-event incremental method).
///
/// Elastic–perfectly plastic members, bending-only yield `|M(x)| ≤ Mp`,
/// proportional loading λ·P. Each event finds the smallest load increment
/// that brings any section to ±Mp — at member ends and **inside spans**: the
/// moment diagram of a loaded member is exact between sections, its interior
/// extrema are located by sampling and golden-section refinement, and a hinge
/// that forms inside a span splits the member there (point loads at the cut
/// become nodal loads). Results are reported on the members of the model as
/// given; `PlasticHinge::position` says where along the member a hinge is.
///
/// Before each increment the state is made consistent: a plastic hinge whose
/// rotation would reverse is closed (elastic unloading, `unloaded_at`), and a
/// closed one that would be loaded past Mp again reopens. When the structure
/// is a mechanism, a hinge that would unload under the mechanism's motion is
/// closed and loading continues. `warnings` lists what keeps the result from
/// being the collapse load: an unresolved reversal, a hinge that would have
/// to move, the event limit, a final state that is not statically admissible.
pub fn solve_plastic_2d(input: &PlasticInput) -> Result<PlasticResult, String> {
    crate::known_issues::refuse(&crate::known_issues::for_2d(&input.solver, crate::known_issues::Analysis::Plastic))?;
    let solver_input = &input.solver;

    // Validated up front so that the `Err` from `solve_2d` inside the step
    // loop below can keep its one meaning: the structure has become a
    // mechanism. Without this, an invalid model took that same branch and was
    // reported as `isMechanism: true` with a zero collapse factor — the right
    // shape of answer for the wrong reason, and no way for the caller to tell
    // the two apart.
    super::linear::validate_input_2d(solver_input)?;
    // Imposed deformations (temperatures, settlements) do not change a
    // collapse load; with no mechanical load at all there is no collapse
    // factor, and the event loop ran λ up to ~1e16 on the imposed ones.
    let m_ref = load_moment_scale_2d(solver_input);
    if !(m_ref > 0.0) {
        return Err(NO_MECHANICAL_LOAD.into());
    }

    let max_hinges = input.max_hinges.unwrap_or(20);

    // Compute plastic moments Mp for each section
    let mut mp_map: HashMap<usize, f64> = HashMap::new();
    for (sid, sec_data) in &input.sections {
        let sec_id: usize = sid.parse().unwrap_or(0);
        if let Some(&mp) = input.mp_overrides.as_ref().and_then(|m| m.get(sid)) {
            mp_map.insert(sec_id, mp);
        } else {
            let fy = input.materials.get(&sec_data.material_id.to_string())
                .and_then(|m| m.fy)
                .unwrap_or(250.0); // Default: 250 MPa steel
            let mp = compute_plastic_moment(sec_data, fy);
            mp_map.insert(sec_id, mp);
        }
    }

    let mut current_input = solver_input.clone();
    let node_xy: HashMap<usize, (f64, f64)> = crate::ordered::values(&current_input.nodes).map(|n| (n.id, (n.x, n.z))).collect();
    let mut members: Vec<Member> = current_input
        .elements
        .iter()
        .map(|(k, e)| {
            let (xi, zi) = node_xy[&e.node_i];
            let (xj, zj) = node_xy[&e.node_j];
            let (dx, dz) = (xj - xi, zj - zi);
            let mp = if e.elem_type == "frame" { mp_map.get(&e.section_id).copied().unwrap_or(f64::INFINITY) } else { f64::INFINITY };
            Member {
                id: e.id,
                x0: xi,
                z0: zi,
                dx,
                dz,
                l: (dx * dx + dz * dz).sqrt(),
                mp,
                pieces: vec![Piece { key: k.clone(), id: e.id, t0: 0.0, t1: 1.0 }],
                template: None,
                loaded: false,
                breakpoints: Vec::new(),
                acc: [0.0; 6],
            }
        })
        .collect();
    members.sort_by_key(|m| m.id);
    let original_nodes: std::collections::HashSet<usize> = node_xy.keys().copied().collect();
    let mut next_node = node_xy.keys().max().copied().unwrap_or(0) + 1;
    let mut next_elem = members.iter().map(|m| m.id).max().unwrap_or(0) + 1;
    /*
     * Nodes whose rotation something other than the frame ends restrains. At
     * any other node, a hinge in a lone frame end is dropped as "the same
     * physical hinge" as the free node — which is only true when nothing else
     * holds that rotation. A rotational spring on any support type (the
     * assembler adds `kz` whatever the type), a constraint or a connector
     * does, and dropping the hinge there let the member carry more than Mp:
     * a beam on a rotational spring collapsed at 150 instead of 83.3.
     */
    let mut rot_restrained: std::collections::HashSet<usize> = current_input
        .supports
        .values()
        .filter(|s| matches!(s.support_type.as_str(), "fixed" | "guidedX" | "guidedY" | "guidedZ") || s.kz.unwrap_or(0.0) > 0.0)
        .map(|s| s.node_id)
        .collect();
    for c in &current_input.constraints {
        match c {
            Constraint::RigidLink(rl) => rot_restrained.extend([rl.master_node, rl.slave_node]),
            Constraint::EqualDOF(eq) => rot_restrained.extend([eq.master_node, eq.slave_node]),
            Constraint::EccentricConnection(ec) => rot_restrained.extend([ec.master_node, ec.slave_node]),
            Constraint::Diaphragm(d) => rot_restrained.extend(d.slave_nodes.iter().copied().chain([d.master_node])),
            Constraint::LinearMPC(m) => rot_restrained.extend(m.terms.iter().map(|t| t.node_id)),
        }
    }
    rot_restrained.extend(crate::ordered::values(&current_input.connectors).flat_map(|c| [c.node_i, c.node_j]));

    let mut cumulative_factor = 0.0;
    let mut all_hinges: Vec<PlasticHinge> = Vec::new();
    let mut hinges: Vec<HingeState> = Vec::new();
    let mut steps: Vec<PlasticStep> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();
    let mut reversal_unresolved = false;
    let mut suppressed = f64::INFINITY;
    let mut exhausted = true;
    // hinges formed by the latest event
    let mut last_event: Vec<usize> = Vec::new();

    for step in 0..max_hinges {
        // ---- a consistent set of active hinges, and its unit-load solution
        let mut visited: std::collections::HashSet<Vec<bool>> = std::collections::HashSet::new();
        let mut tie_closed: Vec<usize> = Vec::new();
        let results = loop {
            let fresh = visited.insert(hinges.iter().map(|h| h.active).collect());
            // A mechanism ends the analysis — unless one of its hinges would
            // unload under the mechanism's motion. The linear solve alone
            // cannot be trusted to say so: on a singular K whose load excites
            // the mode it can return a finite, enormous answer. The rank check
            // is the one the app runs before every analysis.
            if !super::kinematic::analyze_kinematics_2d(&current_input).is_solvable {
                if !fresh {
                    break None;
                }
                // Several hinges of the last event formed together: open them
                // one at a time and keep only those needed for the mechanism
                // (each opening adds at most one degree of freedom, so the
                // mechanism left is single). The others stay closed at Mp and
                // reopen below if the loading needs them.
                let open_last: Vec<usize> = last_event.iter().copied().filter(|&h| hinges[h].active).collect();
                if open_last.len() > 1 && tie_closed.is_empty() {
                    for &h in &open_last {
                        set_hinge(&mut current_input, &members[hinges[h].member], hinges[h].t, false);
                    }
                    let mut keep = open_last.len();
                    for (k, &h) in open_last.iter().enumerate() {
                        set_hinge(&mut current_input, &members[hinges[h].member], hinges[h].t, true);
                        if !super::kinematic::analyze_kinematics_2d(&current_input).is_solvable {
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
                // With hinge h closed, the unit moment at h is P·φ/θ_h(φ)
                // (φ the mechanism): the opposite sign to the moment h carries
                // means h rotates backwards in the mechanism, i.e. it unloads.
                let mut closed = false;
                for hi in (0..hinges.len()).rev() {
                    if !hinges[hi].active {
                        continue;
                    }
                    let (mi, t, sign) = (hinges[hi].member, hinges[hi].t, hinges[hi].sign);
                    set_hinge(&mut current_input, &members[mi], t, false);
                    if super::kinematic::analyze_kinematics_2d(&current_input).is_solvable {
                        if let Ok(r) = super::linear::solve_2d(&current_input) {
                            let by_id: HashMap<usize, &ElementForces> = r.element_forces.iter().map(|ef| (ef.element_id, ef)).collect();
                            let mu = members[mi].diagram(members[mi].unit_vals(&by_id), 1.0, &current_input).at(t);
                            if mu * sign < -unit_moment_scale(&r) * 1e-9 {
                                hinges[hi].active = false;
                                all_hinges[hinges[hi].record].unloaded_at = Some(cumulative_factor);
                                closed = true;
                                break;
                            }
                        }
                    }
                    set_hinge(&mut current_input, &members[mi], t, true);
                }
                if !closed {
                    // a true collapse: the tied hinges set aside turn too
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
            let r = match super::linear::solve_2d(&current_input) {
                Ok(r) => r,
                Err(_) => break None,
            };
            if !fresh {
                // cycled through the same states: no consistent choice found
                reversal_unresolved = true;
                break Some(r);
            }
            let by_id: HashMap<usize, &ElementForces> = r.element_forces.iter().map(|ef| (ef.element_id, ef)).collect();
            // active hinges whose rotation would reverse
            let disp: HashMap<usize, [f64; 3]> = r.displacements.iter().map(|d| (d.node_id, [d.ux, d.uz, d.ry])).collect();
            let mut rot_scale = r.displacements.iter().fold(0.0f64, |a, d| a.max(d.ry.abs()));
            let mut worst: Option<(usize, f64)> = None;
            for (hi, h) in hinges.iter().enumerate() {
                if !h.active {
                    continue;
                }
                let Some((key, end)) = members[h.member].slot(h.t) else { continue };
                let rot = released_end_rotations(&current_input, key, &disp)[end as usize];
                rot_scale = rot_scale.max(rot.abs());
                // plastic flow: the hinge turns with its moment. With m the
                // moment of the diagram, an element-end hinge flows when
                // m·θ ≥ 0, an element-start one when m·θ ≤ 0.
                let flow = if end { rot } else { -rot } * h.sign;
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
            // closed hinges still at Mp that would be loaded past it
            let tol_m = unit_moment_scale(&r) * 1e-9;
            let mut reopened = false;
            for hi in 0..hinges.len() {
                if hinges[hi].active {
                    continue;
                }
                let m = &members[hinges[hi].member];
                let t = hinges[hi].t;
                let m_acc = m.diagram(m.acc, cumulative_factor, &current_input).at(t);
                let mu = m.diagram(m.unit_vals(&by_id), 1.0, &current_input).at(t);
                if m_acc.abs() >= m.mp * (1.0 - 1e-9) && mu * hinges[hi].sign > tol_m {
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
                        all_hinges.push(again);
                        hinges[hi].record = all_hinges.len() - 1;
                    }
                    reopened = true;
                    break;
                }
            }
            if reopened {
                continue;
            }
            break Some(r);
        };
        let Some(results) = results else {
            exhausted = false;
            break;
        };

        let by_id: HashMap<usize, &ElementForces> = results.element_forces.iter().map(|ef| (ef.element_id, ef)).collect();
        if step == 0 {
            for m in &mut members {
                let Some(ef) = by_id.get(&m.id) else { continue };
                let t = (*ef).clone();
                m.loaded = !t.point_loads.is_empty() || !t.distributed_loads.is_empty();
                let l = m.l;
                let mut bp: Vec<f64> = t.point_loads.iter().map(|p| p.a / l).collect();
                bp.extend(t.distributed_loads.iter().flat_map(|d| [d.a / l, d.b / l]));
                bp.retain(|&x| x > 0.0 && x < 1.0);
                m.breakpoints = bp;
                m.template = Some(t);
            }
        }

        // ---- next event: smallest increment to ±Mp at any section. A unit
        // moment below 1e-9 of (load × model size) is round-off of a member
        // that carries its load axially, not bending.
        let tol_m = (unit_moment_scale(&results) * 1e-12).max(m_ref * 1e-9);
        let tol_d = 1e-10 * cumulative_factor;
        let unit_vals: Vec<[f64; 6]> = members.iter().map(|m| m.unit_vals(&by_id)).collect();
        let mut cands: Vec<(usize, f64, f64)> = Vec::new();
        for (mi, m) in members.iter().enumerate() {
            if !m.mp.is_finite() {
                continue;
            }
            let acc = m.diagram(m.acc, cumulative_factor, &current_input);
            let unit = m.diagram(unit_vals[mi], 1.0, &current_input);
            let (out, sup) = member_candidates(m, &current_input, &acc, &unit, tol_m, tol_d);
            suppressed = suppressed.min(sup);
            cands.extend(out.into_iter().map(|(t, d)| (mi, t, d)));
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
        let mut chosen: Vec<(usize, f64)> = Vec::new();
        for &(mi, t, d) in &cands {
            if d - min_delta <= tie && !chosen.iter().any(|&(mj, tj)| mj == mi && (tj - t).abs() < SNAP) {
                chosen.push((mi, t));
            }
        }
        // A node whose every frame end turns freely gains nothing from one
        // more hinge: the last one is the same physical hinge.
        let mut per_node: HashMap<usize, usize> = HashMap::new();
        chosen.retain(|&(mi, t)| {
            let m = &members[mi];
            let Some(n) = m.slot(t).and_then(|_| m.node_at(&current_input, t)) else { return true };
            if rot_restrained.contains(&n) || node_has_couple(&current_input, n) {
                return true;
            }
            let free = current_input
                .elements
                .values()
                .filter(|e| e.elem_type == "frame")
                .map(|e| usize::from(e.node_i == n && !e.hinge_start) + usize::from(e.node_j == n && !e.hinge_end))
                .sum::<usize>();
            let used = per_node.entry(n).or_insert(0);
            *used += 1;
            *used < free
        });

        cumulative_factor += min_delta;
        for (m, u) in members.iter_mut().zip(&unit_vals) {
            for k in 0..6 {
                m.acc[k] += min_delta * u[k];
            }
        }

        let step_results = merged_results(&results, &members, &unit_vals, min_delta, &original_nodes, &current_input);

        let mut step_hinges = Vec::new();
        last_event.clear();
        chosen.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.total_cmp(&b.1)));
        for (mi, t) in chosen {
            let sign = {
                let m = &members[mi];
                let s = m.diagram(m.acc, cumulative_factor, &current_input).at(t);
                if s != 0.0 { s.signum() } else { unit_vals[mi][4].signum() }
            };
            if members[mi].slot(t).is_none() {
                split_member(&mut current_input, &mut members[mi], t, &mut next_node, &mut next_elem);
            }
            set_hinge(&mut current_input, &members[mi], t, true);
            let hinge = PlasticHinge {
                element_id: members[mi].id,
                end: if t < 0.5 { "start" } else { "end" }.to_string(),
                moment: members[mi].mp,
                load_factor: cumulative_factor,
                step,
                position: t,
                unloaded_at: None,
            };
            step_hinges.push(hinge.clone());
            all_hinges.push(hinge);
            hinges.push(HingeState { member: mi, t, sign, active: true, record: all_hinges.len() - 1 });
            last_event.push(hinges.len() - 1);
        }

        steps.push(PlasticStep {
            load_factor: cumulative_factor,
            hinges_formed: step_hinges,
            results: step_results,
        });
    }

    // Check if mechanism formed
    let is_mechanism = !super::kinematic::analyze_kinematics_2d(&current_input).is_solvable
        || super::linear::solve_2d(&current_input).is_err();

    if reversal_unresolved {
        warnings.push(
            "a hinge rotation reversed and no consistent set of active hinges was found; \
             the collapse factor is not guaranteed"
                .into(),
        );
    }
    if !exhausted && !is_mechanism {
        return Err(no_bending_collapse(cumulative_factor));
    }
    if exhausted && !is_mechanism {
        warnings.push(format!(
            "stopped after {max_hinges} events without forming a mechanism: the collapse factor \
             is a lower bound (raise maxHinges)"
        ));
    }
    // Final state statically admissible: |M| ≤ Mp everywhere
    let mut worst_ratio = 0.0f64;
    for m in members.iter().filter(|m| m.mp.is_finite() && m.mp > 0.0) {
        let d = m.diagram(m.acc, cumulative_factor, &current_input);
        let mut ts: Vec<f64> = (0..=4 * STATIONS).map(|i| i as f64 / (4 * STATIONS) as f64).collect();
        ts.extend(m.breakpoints.iter().copied());
        for t in ts {
            worst_ratio = worst_ratio.max(d.at(t).abs() / m.mp);
        }
    }
    if worst_ratio > 1.0 + 1e-6 {
        warnings.push(format!(
            "the final moment field exceeds Mp by a factor {worst_ratio:.6}: \
             the collapse factor is not guaranteed"
        ));
    }

    Ok(PlasticResult {
        collapse_factor: cumulative_factor,
        steps,
        redundancy: all_hinges.len(),
        hinges: all_hinges,
        is_mechanism,
        warnings,
    })
}

/// The analysis stopped because no section can yield any more, and the
/// structure is not a mechanism: the remaining load path carries the load
/// without bending (a funicular arch, a triangulated truss). A bending-only
/// analysis has no collapse factor for that; the number it reached (or the
/// ~1e16 a round-off moment would give) is not one.
pub(crate) fn no_bending_collapse(lambda: f64) -> String {
    format!(
        "Plastic (pushover) analysis: after λ = {lambda:.6} no section reaches its plastic moment under further load \
         and the structure is not a mechanism — the loads are carried without bending (axially), so a bending-only \
         plastic analysis has no collapse factor to report. Check axial capacity and buckling instead."
    )
}

pub(crate) const NO_MECHANICAL_LOAD: &str = "Plastic (pushover) analysis needs a mechanical load to scale to collapse: \
     temperatures and support settlements alone do not change a collapse load and have no collapse factor.";

/// Σ|load| × model size: the moment scale the loads can produce.
fn load_moment_scale_2d(input: &SolverInput) -> f64 {
    let xs: Vec<(f64, f64)> = crate::ordered::values(&input.nodes).map(|n| (n.x, n.z)).collect();
    let ext = |f: fn(&(f64, f64)) -> f64| xs.iter().map(f).fold(f64::NEG_INFINITY, f64::max) - xs.iter().map(f).fold(f64::INFINITY, f64::min);
    let l = ext(|p| p.0).max(ext(|p| p.1)).max(f64::MIN_POSITIVE);
    let len = |id: usize| {
        crate::ordered::values(&input.elements).find(|e| e.id == id).and_then(|e| {
            let a = crate::ordered::values(&input.nodes).find(|n| n.id == e.node_i)?;
            let b = crate::ordered::values(&input.nodes).find(|n| n.id == e.node_j)?;
            Some(((b.x - a.x).powi(2) + (b.z - a.z).powi(2)).sqrt())
        }).unwrap_or(0.0)
    };
    let f: f64 = input.loads.iter().map(|ld| match ld {
        SolverLoad::Nodal(n) => n.fx.abs() + n.fz.abs() + n.my.abs() / l,
        SolverLoad::Distributed(d) => d.q_i.abs().max(d.q_j.abs()) * len(d.element_id),
        SolverLoad::PointOnElement(p) => p.p.abs() + p.px.unwrap_or(0.0).abs() + p.my.unwrap_or(0.0).abs() / l,
        SolverLoad::AxialDistributed(d) => d.q_i.abs().max(d.q_j.abs()) * len(d.element_id),
        SolverLoad::Thermal(_) => 0.0,
    }).sum();
    f * l
}

fn unit_moment_scale(r: &AnalysisResults) -> f64 {
    r.element_forces.iter().fold(0.0f64, |a, ef| a.max(ef.m_start.abs()).max(ef.m_end.abs()))
}

fn node_has_couple(input: &SolverInput, n: usize) -> bool {
    input.loads.iter().any(|l| matches!(l, SolverLoad::Nodal(nl) if nl.node_id == n && nl.my != 0.0))
}

/// One step's increment (unit solution × `factor`) on the model as given:
/// member forces of whole members, displacements of the original nodes.
fn merged_results(
    results: &AnalysisResults,
    members: &[Member],
    unit_vals: &[[f64; 6]],
    factor: f64,
    original_nodes: &std::collections::HashSet<usize>,
    input: &SolverInput,
) -> AnalysisResults {
    AnalysisResults {
        displacements: results
            .displacements
            .iter()
            .filter(|d| original_nodes.contains(&d.node_id))
            .map(|d| Displacement { node_id: d.node_id, ux: d.ux * factor, uz: d.uz * factor, ry: d.ry * factor })
            .collect(),
        reactions: results
            .reactions
            .iter()
            .map(|r| Reaction { node_id: r.node_id, rx: r.rx * factor, rz: r.rz * factor, my: r.my * factor })
            .collect(),
        element_forces: members
            .iter()
            .zip(unit_vals)
            .map(|(m, v)| m.element_forces(v.map(|x| x * factor), factor, input))
            .collect(),
        constraint_forces: results
            .constraint_forces
            .iter()
            .map(|cf| ConstraintForce { node_id: cf.node_id, dof: cf.dof.clone(), force: cf.force * factor })
            .collect(),
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics: vec![],
        equilibrium: None,
        result_summary: None,
        solver_run_meta: None,
    }
}

fn compute_plastic_moment(sec: &PlasticSectionData, fy: f64) -> f64 {
    // fy in MPa, dimensions in m
    // Mp = fy * Zp (kN·m)
    // For rectangular: Zp = b*h²/4
    // For generic: Zp ≈ 1.15 * Iz/(h/2) (approximate shape factor)
    if let (Some(b), Some(h)) = (sec.b, sec.h) {
        let zp = b * h * h / 4.0; // m³
        fy * 1000.0 * zp // MPa * 1000 = kN/m², * m³ = kN·m
    } else if sec.iz > 1e-20 {
        // Approximate: assume shape factor 1.15
        let h_approx = (12.0 * sec.iz / sec.a).sqrt(); // approximate height
        let s_elastic = sec.iz / (h_approx / 2.0);
        let zp = 1.15 * s_elastic;
        fy * 1000.0 * zp
    } else {
        f64::INFINITY
    }
}

// ==================== 3D Plastic (Pushover) Analysis ====================

#[path = "plastic_3d.rs"]
mod three_d;
pub use three_d::solve_plastic_3d;
