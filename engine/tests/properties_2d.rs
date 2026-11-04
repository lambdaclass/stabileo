//! Property-based tests for the 2D linear static solver (`linear::solve_2d`).
//!
//! Random *valid* (connected, kinematically stable) plane models are generated
//! from three families:
//!   * random connected frame graphs (spanning tree + extra edges, rigid joints,
//!     one node fully fixed, optional extra fixed/pinned supports),
//!   * random multi-bay multi-storey portal frames (fixed/pinned bases, optional
//!     truss braces, optional beam-end hinges when all bases are fixed),
//!   * random jittered triangulated plane trusses (pin–pin supported),
//! loaded by random nodal loads, (partial, trapezoidal) distributed member loads
//! and concentrated member loads. Each property states a physical invariant.
//!
//! Engine conventions used here (from `solver/assembly.rs`, `solver/linear.rs`):
//!   * plane is X–Z, moments/rotations counter-clockwise positive, so the moment
//!     about the origin of a force (Fx, Fz) at (x, z) is `x·Fz − z·Fx`;
//!   * member loads act in element local axes: local x = (c, s) from node I to
//!     node J, local y = (−s, c);
//!   * member end forces: local nodal forces ON the element are
//!     `[−nStart, vStart, mStart, nEnd, −vEnd, −mEnd]` (I then J).
//!
//! Units: E in MPa (engine multiplies by 1000 → kN/m²), lengths m, forces kN.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use proptest::prelude::*;
use proptest::sample::Index;
use std::collections::{BTreeSet, HashMap};

use crate::properties_common;
use properties_common::*;

// ======================================================================
// Model generation
// ======================================================================

#[derive(Debug, Clone)]
struct Model2 {
    input: SolverInput,
    /// Nodes attached to at least one frame element (can carry nodal moments
    /// and have a physical rotation DOF).
    moment_nodes: BTreeSet<usize>,
    /// Characteristic size (m): max distance of any node from the origin, ≥ 1.
    lchar: f64,
}

#[derive(Debug, Clone, Copy)]
struct Mat {
    e: f64,
    nu: f64,
}
#[derive(Debug, Clone, Copy)]
struct Sec {
    a: f64,
    iz: f64,
}

/// Realistic materials: E from concrete (25 GPa) to steel (210 GPa).
fn mat_s() -> impl Strategy<Value = Mat> {
    (25_000.0..210_000.0f64, 0.15..0.35f64).prop_map(|(e, nu)| Mat { e, nu })
}
/// Realistic sections: A ∈ [20, 500] cm², radius of gyration 5–40 cm.
fn sec_s() -> impl Strategy<Value = Sec> {
    (2e-3..5e-2f64, 0.05..0.4f64).prop_map(|(a, r)| Sec { a, iz: a * r * r })
}

#[derive(Default)]
struct B2 {
    nodes: Vec<(f64, f64)>,
    mats: Vec<Mat>,
    secs: Vec<Sec>,
    /// (type, node_i, node_j (1-based ids), mat idx, sec idx, hinge_start, hinge_end)
    elems: Vec<(&'static str, usize, usize, usize, usize, bool, bool)>,
    sups: Vec<(usize, &'static str)>,
}

impl B2 {
    fn finish(self) -> Model2 {
        let mut nodes = HashMap::new();
        let mut lchar: f64 = 1.0;
        for (k, &(x, z)) in self.nodes.iter().enumerate() {
            nodes.insert((k + 1).to_string(), SolverNode { id: k + 1, x, z });
            lchar = lchar.max(x.hypot(z));
        }
        let mut materials = HashMap::new();
        for (k, m) in self.mats.iter().enumerate() {
            materials.insert((k + 1).to_string(), SolverMaterial { id: k + 1, e: m.e, nu: m.nu });
        }
        let mut sections = HashMap::new();
        for (k, s) in self.secs.iter().enumerate() {
            sections.insert((k + 1).to_string(), SolverSection { id: k + 1, a: s.a, iz: s.iz, as_y: None });
        }
        let mut elements = HashMap::new();
        let mut moment_nodes = BTreeSet::new();
        for (k, &(t, ni, nj, mi, si, hs, he)) in self.elems.iter().enumerate() {
            if t == "frame" {
                moment_nodes.insert(ni);
                moment_nodes.insert(nj);
            }
            elements.insert(
                (k + 1).to_string(),
                SolverElement {
                    id: k + 1,
                    elem_type: t.to_string(),
                    node_i: ni,
                    node_j: nj,
                    material_id: mi + 1,
                    section_id: si + 1,
                    hinge_start: hs,
                    hinge_end: he,
                },
            );
        }
        let mut supports = HashMap::new();
        for (k, &(nid, t)) in self.sups.iter().enumerate() {
            supports.insert(
                (k + 1).to_string(),
                SolverSupport {
                    id: k + 1,
                    node_id: nid,
                    support_type: t.to_string(),
                    kx: None,
                    ky: None,
                    kz: None,
                    dx: None,
                    dz: None,
                    dry: None,
                    angle: None,
                },
            );
        }
        Model2 {
            input: SolverInput {
                nodes,
                materials,
                sections,
                elements,
                supports,
                loads: vec![],
                constraints: vec![],
                connectors: HashMap::new(),
                solver_options: None, masses: Default::default(),
            },
            moment_nodes,
            lchar,
        }
    }
}

/// Random connected rigid-jointed frame: random points (≥ 0.75 m apart) in a
/// 20 m × 12 m box, a random spanning tree plus up to 3 extra members. Node 1 is
/// fully fixed, so the structure is stable whatever the topology (a tree of
/// rigid frame members hanging off a clamp is a statically determinate
/// cantilever system; extra members/supports only add redundancy).
fn graph_frame() -> impl Strategy<Value = Model2> {
    (2usize..=12)
        .prop_flat_map(|n| {
            (
                prop::collection::vec((0.0..20.0f64, 0.0..12.0f64), n),
                prop::collection::vec(any::<Index>(), n - 1),
                prop::collection::vec((any::<Index>(), any::<Index>()), 0..4),
                prop::collection::vec((any::<Index>(), any::<bool>()), 0..3),
                prop::collection::vec(mat_s(), 1..=2),
                prop::collection::vec(sec_s(), 1..=3),
                prop::collection::vec((any::<Index>(), any::<Index>()), n + 3),
            )
        })
        .prop_filter("nodes too close", |t| {
            min_pair_dist(&t.0.iter().map(|p| vec![p.0, p.1]).collect::<Vec<_>>()) >= 0.75
        })
        .prop_map(|(pts, parents, extras, sups, mats, secs, assign)| {
            let n = pts.len();
            let mut b = B2 { nodes: pts, ..Default::default() };
            let mut edges: BTreeSet<(usize, usize)> = BTreeSet::new();
            for k in 1..n {
                let p = parents[k - 1].index(k);
                edges.insert((p.min(k), p.max(k)));
            }
            for (i, j) in extras {
                let (i, j) = (i.index(n), j.index(n));
                if i != j {
                    edges.insert((i.min(j), i.max(j)));
                }
            }
            for (k, &(i, j)) in edges.iter().enumerate() {
                let (mi, si) = assign[k % assign.len()];
                b.elems.push(("frame", i + 1, j + 1, mi.index(mats.len()), si.index(secs.len()), false, false));
            }
            b.sups.push((1, "fixed"));
            let mut used = BTreeSet::from([0usize]);
            for (idx, fixed) in sups {
                let k = idx.index(n);
                if used.insert(k) {
                    b.sups.push((k + 1, if fixed { "fixed" } else { "pinned" }));
                }
            }
            b.mats = mats;
            b.secs = secs;
            b.finish()
        })
}

/// Multi-bay, multi-storey portal frame. Columns and beams are rigid-jointed
/// frame members; bases fixed or pinned (a rigid-jointed grid on pinned bases
/// is stable); optional truss braces; beam-end hinges only if every base is
/// fixed (then the continuous fixed-base columns alone are stable).
fn portal_frame() -> impl Strategy<Value = Model2> {
    (1usize..=3, 1usize..=3)
        .prop_flat_map(|(nb, ns)| {
            (
                prop::collection::vec(3.0..8.0f64, nb),
                prop::collection::vec(2.5..5.0f64, ns),
                prop::collection::vec(any::<bool>(), nb + 1),
                prop::collection::vec(prop::option::of(any::<bool>()), nb * ns),
                prop::collection::vec((any::<bool>(), any::<bool>()), nb * ns),
                mat_s(),
                (sec_s(), sec_s(), sec_s()),
            )
        })
        .prop_map(|(widths, heights, base_fixed, braces, hinges, mat, (sc, sb, sbr))| {
            let (nb, ns) = (widths.len(), heights.len());
            let id = |i: usize, j: usize| j * (nb + 1) + i + 1;
            let mut b = B2 { mats: vec![mat], secs: vec![sc, sb, sbr], ..Default::default() };
            let mut z = 0.0;
            for j in 0..=ns {
                if j > 0 {
                    z += heights[j - 1];
                }
                let mut x = 0.0;
                for i in 0..=nb {
                    if i > 0 {
                        x += widths[i - 1];
                    }
                    b.nodes.push((x, z));
                }
            }
            let all_fixed = base_fixed.iter().all(|&f| f);
            for j in 0..ns {
                for i in 0..=nb {
                    b.elems.push(("frame", id(i, j), id(i, j + 1), 0, 0, false, false));
                }
            }
            for j in 1..=ns {
                for i in 0..nb {
                    let (hs, he) = if all_fixed { hinges[(j - 1) * nb + i] } else { (false, false) };
                    b.elems.push(("frame", id(i, j), id(i + 1, j), 0, 1, hs, he));
                }
            }
            for j in 0..ns {
                for i in 0..nb {
                    match braces[j * nb + i] {
                        Some(true) => b.elems.push(("truss", id(i, j), id(i + 1, j + 1), 0, 2, false, false)),
                        Some(false) => b.elems.push(("truss", id(i + 1, j), id(i, j + 1), 0, 2, false, false)),
                        None => {}
                    }
                }
            }
            for (i, &f) in base_fixed.iter().enumerate() {
                b.sups.push((id(i, 0), if f { "fixed" } else { "pinned" }));
            }
            b.finish()
        })
}

/// Pratt/Howe-like plane truss with jittered nodes: bottom & top chords,
/// verticals and one diagonal per panel (each panel is triangulated, hence
/// rigid), pinned at both bottom end nodes.
fn plane_truss() -> impl Strategy<Value = Model2> {
    (2usize..=6)
        .prop_flat_map(|p| {
            (
                1.5..4.0f64,
                1.0..3.0f64,
                prop::collection::vec((-0.15..0.15f64, -0.15..0.15f64), 2 * (p + 1)),
                prop::collection::vec(any::<bool>(), p),
                mat_s(),
                sec_s(),
            )
        })
        .prop_map(|(w, h, jit, diag, mat, sec)| {
            let p = diag.len();
            let mut b = B2 { mats: vec![mat], secs: vec![sec], ..Default::default() };
            for k in 0..=p {
                b.nodes.push((k as f64 * w + jit[k].0 * w, jit[k].1 * h));
            }
            for k in 0..=p {
                let q = jit[p + 1 + k];
                b.nodes.push((k as f64 * w + q.0 * w, h + q.1 * h));
            }
            let bot = |k: usize| k + 1;
            let top = |k: usize| p + 2 + k;
            for k in 0..p {
                b.elems.push(("truss", bot(k), bot(k + 1), 0, 0, false, false));
                b.elems.push(("truss", top(k), top(k + 1), 0, 0, false, false));
                if diag[k] {
                    b.elems.push(("truss", bot(k), top(k + 1), 0, 0, false, false));
                } else {
                    b.elems.push(("truss", top(k), bot(k + 1), 0, 0, false, false));
                }
            }
            for k in 0..=p {
                b.elems.push(("truss", bot(k), top(k), 0, 0, false, false));
            }
            b.sups.push((bot(0), "pinned"));
            b.sups.push((bot(p), "pinned"));
            b.finish()
        })
}

fn model2() -> impl Strategy<Value = Model2> {
    prop_oneof![graph_frame(), portal_frame(), plane_truss()]
}

// ---------------- loads ----------------

#[derive(Debug, Clone)]
enum RawLoad2 {
    /// node, fx, fz, my
    Nodal(Index, f64, f64, f64),
    /// element, q_i, q_j, optional partial extent (fractions of L)
    Dist(Index, f64, f64, Option<(f64, f64)>),
    /// element, a/L, p (local y), px (local x), my
    Point(Index, f64, f64, f64, f64),
}

fn raw_load2() -> impl Strategy<Value = RawLoad2> {
    prop_oneof![
        3 => (any::<Index>(), -100.0..100.0f64, -100.0..100.0f64, -50.0..50.0f64)
            .prop_map(|(i, a, b, c)| RawLoad2::Nodal(i, a, b, c)),
        2 => (any::<Index>(), -30.0..30.0f64, -30.0..30.0f64, prop::option::of((0.0..1.0f64, 0.0..1.0f64)))
            .prop_map(|(i, a, b, c)| RawLoad2::Dist(i, a, b, c)),
        1 => (any::<Index>(), 0.05..0.95f64, -100.0..100.0f64, -50.0..50.0f64, -30.0..30.0f64)
            .prop_map(|(i, f, p, px, m)| RawLoad2::Point(i, f, p, px, m)),
    ]
}
fn raw_loads2() -> impl Strategy<Value = Vec<RawLoad2>> {
    prop::collection::vec(raw_load2(), 1..6)
}

#[derive(Clone, Copy, PartialEq)]
enum LoadMode {
    /// Member loads on any element (frame or truss).
    Any,
    /// Member loads on frame elements only (truss end forces do not report
    /// transverse member loads, so internal-force checks need this).
    FrameMembers,
    /// Nodal loads only.
    NodalOnly,
}

fn sorted_ids<T>(m: &HashMap<String, T>, id: impl Fn(&T) -> usize) -> Vec<usize> {
    let mut v: Vec<usize> = m.values().map(id).collect();
    v.sort();
    v
}

fn elem_len(input: &SolverInput, eid: usize) -> f64 {
    let e = &input.elements[&eid.to_string()];
    let a = &input.nodes[&e.node_i.to_string()];
    let b = &input.nodes[&e.node_j.to_string()];
    (b.x - a.x).hypot(b.z - a.z)
}

fn resolve2(m: &Model2, raws: &[RawLoad2], mode: LoadMode) -> Vec<SolverLoad> {
    let nodes = sorted_ids(&m.input.nodes, |n| n.id);
    let member_targets: Vec<usize> = {
        let mut v: Vec<usize> = m
            .input
            .elements
            .values()
            .filter(|e| mode == LoadMode::Any || e.elem_type == "frame")
            .map(|e| e.id)
            .collect();
        v.sort();
        v
    };
    let mut out = vec![];
    for r in raws {
        match *r {
            RawLoad2::Nodal(i, fx, fz, my) => {
                let nid = nodes[i.index(nodes.len())];
                let my = if m.moment_nodes.contains(&nid) { my } else { 0.0 };
                out.push(SolverLoad::Nodal(SolverNodalLoad { node_id: nid, fx, fz, my }));
            }
            _ if mode == LoadMode::NodalOnly || member_targets.is_empty() => {}
            RawLoad2::Dist(i, qi, qj, part) => {
                let eid = member_targets[i.index(member_targets.len())];
                let l = elem_len(&m.input, eid);
                let (a, b) = match part {
                    Some((u, v)) if (u - v).abs() > 0.05 => (Some(u.min(v) * l), Some(u.max(v) * l)),
                    _ => (None, None),
                };
                out.push(SolverLoad::Distributed(SolverDistributedLoad { element_id: eid, q_i: qi, q_j: qj, a, b }));
            }
            RawLoad2::Point(i, f, p, px, my) => {
                let eid = member_targets[i.index(member_targets.len())];
                let l = elem_len(&m.input, eid);
                out.push(SolverLoad::PointOnElement(SolverPointLoadOnElement {
                    element_id: eid,
                    a: f * l,
                    p,
                    px: Some(px),
                    my: Some(my),
                }));
            }
        }
    }
    out
}

fn with_loads(m: &Model2, loads: Vec<SolverLoad>) -> SolverInput {
    let mut inp = m.input.clone();
    inp.loads = loads;
    inp
}

// ======================================================================
// Result helpers
// ======================================================================

fn solve(input: &SolverInput) -> Result<AnalysisResults, TestCaseError> {
    nightly_input(input);
    linear::solve_2d(input).map_err(|e| TestCaseError::fail(format!("solve_2d failed: {e}")))
}

fn elem_geom(input: &SolverInput, e: &SolverElement) -> ((f64, f64), f64, f64, f64) {
    let a = &input.nodes[&e.node_i.to_string()];
    let b = &input.nodes[&e.node_j.to_string()];
    let l = (b.x - a.x).hypot(b.z - a.z);
    ((a.x, a.z), l, (b.x - a.x) / l, (b.z - a.z) / l)
}

/// Global resultant (Fx, Fz, M about origin) of all applied loads, plus a
/// magnitude scale for each (sum of absolute contributions).
fn applied_resultant(input: &SolverInput) -> ([f64; 3], f64, f64) {
    let mut tot = [0.0; 3];
    let mut sf = 0.0;
    let mut sm = 0.0;
    let mut push = |fx: f64, fz: f64, m: f64, x: f64, z: f64| {
        tot[0] += fx;
        tot[1] += fz;
        tot[2] += m + x * fz - z * fx;
        sf += fx.abs() + fz.abs();
        sm += m.abs() + (x * fz).abs() + (z * fx).abs();
    };
    for l in &input.loads {
        match l {
            SolverLoad::Nodal(nl) => {
                let n = &input.nodes[&nl.node_id.to_string()];
                push(nl.fx, nl.fz, nl.my, n.x, n.z);
            }
            SolverLoad::Distributed(dl) => {
                let e = &input.elements[&dl.element_id.to_string()];
                let ((xi, zi), l, c, s) = elem_geom(input, e);
                let a = dl.a.unwrap_or(0.0);
                let b = dl.b.unwrap_or(l);
                let span = b - a;
                // trapezoid = rectangle (q_i) + triangle (q_j − q_i)
                for (w, xc) in [(dl.q_i * span, a + span / 2.0), ((dl.q_j - dl.q_i) * span / 2.0, a + 2.0 * span / 3.0)] {
                    push(-s * w, c * w, 0.0, xi + c * xc, zi + s * xc);
                }
            }
            SolverLoad::PointOnElement(pl) => {
                let e = &input.elements[&pl.element_id.to_string()];
                let ((xi, zi), _l, c, s) = elem_geom(input, e);
                let px = pl.px.unwrap_or(0.0);
                push(c * px - s * pl.p, s * px + c * pl.p, pl.my.unwrap_or(0.0), xi + c * pl.a, zi + s * pl.a);
            }
            SolverLoad::AxialDistributed(al) => {
                let e = &input.elements[&al.element_id.to_string()];
                let ((xi, zi), l, c, s) = elem_geom(input, e);
                let a = al.a.unwrap_or(0.0);
                let b = al.b.unwrap_or(l);
                let span = b - a;
                for (w, xc) in [(al.q_i * span, a + span / 2.0), ((al.q_j - al.q_i) * span / 2.0, a + 2.0 * span / 3.0)] {
                    push(c * w, s * w, 0.0, xi + c * xc, zi + s * xc);
                }
            }
            SolverLoad::Thermal(_) => {}
        }
    }
    (tot, sf, sm)
}

/// Flatten results in a fixed order (original ids), optionally reading a model
/// whose ids were relabelled (`nmap`/`emap`: original id → id in `res`) and
/// rotating vector quantities by (c, s) (rotation by angle θ, CCW).
fn flat2(
    res: &AnalysisResults,
    nodes: &[usize],
    elems: &[usize],
    sup_nodes: &[usize],
    nmap: &dyn Fn(usize) -> usize,
    emap: &dyn Fn(usize) -> usize,
    (c, s): (f64, f64),
) -> Result<Flat, TestCaseError> {
    let d: HashMap<usize, &Displacement> = res.displacements.iter().map(|d| (d.node_id, d)).collect();
    let r: HashMap<usize, &Reaction> = res.reactions.iter().map(|r| (r.node_id, r)).collect();
    let ef: HashMap<usize, &ElementForces> = res.element_forces.iter().map(|f| (f.element_id, f)).collect();
    let mut out = Flat::default();
    for &n in nodes {
        let x = d.get(&nmap(n)).ok_or_else(|| TestCaseError::fail(format!("no displacement for node {n}")))?;
        out.t.push(c * x.ux - s * x.uz);
        out.t.push(s * x.ux + c * x.uz);
        out.r.push(x.ry);
    }
    for &n in sup_nodes {
        let x = r.get(&nmap(n)).ok_or_else(|| TestCaseError::fail(format!("no reaction for node {n}")))?;
        out.f.push(c * x.rx - s * x.rz);
        out.f.push(s * x.rx + c * x.rz);
        out.m.push(x.my);
    }
    for &e in elems {
        let f = ef.get(&emap(e)).ok_or_else(|| TestCaseError::fail(format!("no forces for element {e}")))?;
        out.f.extend([f.n_start, f.n_end, f.v_start, f.v_end]);
        out.m.extend([f.m_start, f.m_end]);
    }
    Ok(out)
}

struct Ids {
    nodes: Vec<usize>,
    elems: Vec<usize>,
    sups: Vec<usize>,
}
fn ids(input: &SolverInput) -> Ids {
    let mut sups: Vec<usize> = input.supports.values().map(|s| s.node_id).collect();
    sups.sort();
    Ids { nodes: sorted_ids(&input.nodes, |n| n.id), elems: sorted_ids(&input.elements, |e| e.id), sups }
}
fn flat(res: &AnalysisResults, ids: &Ids) -> Result<Flat, TestCaseError> {
    flat2(res, &ids.nodes, &ids.elems, &ids.sups, &|n| n, &|e| e, (1.0, 0.0))
}

fn check(r: Result<(), String>) -> Result<(), TestCaseError> {
    r.map_err(TestCaseError::fail)
}

/// Relative tolerance for comparisons of two independent solves (see `compare`).
const REL: f64 = 1e-6;

/// Global equilibrium: ΣR + ΣP = 0 for Fx, Fz and the moment about the origin.
fn check_equilibrium(input: &SolverInput, res: &AnalysisResults) -> Result<(), TestCaseError> {
    let (app, sf, sm) = applied_resultant(input);
    let mut rs = [0.0; 3];
    let mut rsf = 0.0;
    let mut rsm = 0.0;
    for r in &res.reactions {
        let n = &input.nodes[&r.node_id.to_string()];
        rs[0] += r.rx;
        rs[1] += r.rz;
        rs[2] += r.my + n.x * r.rz - n.z * r.rx;
        rsf += r.rx.abs() + r.rz.abs();
        rsm += r.my.abs() + (n.x * r.rz).abs() + (n.z * r.rx).abs();
    }
    // Reactions are recovered as K_rf·u − f_r; their sum balances the loads to
    // round-off in |loads| and |reactions| (the larger of the two sets the
    // magnitude of the summed terms). 1e-8 relative is still ~1e6·eps.
    let tf = 1e-8 * (sf + rsf) + 1e-12;
    let tm = 1e-8 * (sm + rsm) + 1e-12;
    prop_assert!((app[0] + rs[0]).abs() <= tf, "ΣFx: applied {} + reactions {} (tol {tf:e})", app[0], rs[0]);
    prop_assert!((app[1] + rs[1]).abs() <= tf, "ΣFz: applied {} + reactions {} (tol {tf:e})", app[1], rs[1]);
    prop_assert!((app[2] + rs[2]).abs() <= tm, "ΣM: applied {} + reactions {} (tol {tm:e})", app[2], rs[2]);
    Ok(())
}

// ======================================================================
// Model transformations
// ======================================================================

fn scale_loads(loads: &[SolverLoad], k: f64) -> Vec<SolverLoad> {
    loads
        .iter()
        .map(|l| match l {
            SolverLoad::Nodal(n) => SolverLoad::Nodal(SolverNodalLoad { fx: n.fx * k, fz: n.fz * k, my: n.my * k, ..n.clone() }),
            SolverLoad::Distributed(d) => SolverLoad::Distributed(SolverDistributedLoad { q_i: d.q_i * k, q_j: d.q_j * k, ..d.clone() }),
            SolverLoad::PointOnElement(p) => SolverLoad::PointOnElement(SolverPointLoadOnElement {
                p: p.p * k,
                px: p.px.map(|v| v * k),
                my: p.my.map(|v| v * k),
                ..p.clone()
            }),
            o => o.clone(),
        })
        .collect()
}

/// Rigidly rotate (angle θ, CCW) and translate the whole model. Nodal force
/// vectors rotate with it; nodal moments, member loads (defined in local axes)
/// and fixed/pinned supports are invariant.
fn rotate_model(input: &SolverInput, th: f64, tx: f64, tz: f64) -> SolverInput {
    let (s, c) = th.sin_cos();
    let mut out = input.clone();
    for n in out.nodes.values_mut() {
        let (x, z) = (n.x, n.z);
        n.x = c * x - s * z + tx;
        n.z = s * x + c * z + tz;
    }
    for l in out.loads.iter_mut() {
        if let SolverLoad::Nodal(n) = l {
            let (fx, fz) = (n.fx, n.fz);
            n.fx = c * fx - s * fz;
            n.fz = s * fx + c * fz;
        }
    }
    out
}

/// Free DOFs that carry a physical stiffness: (node, 0=ux | 1=uz | 2=ry).
fn free_dofs(m: &Model2) -> Vec<(usize, usize)> {
    let sup: HashMap<usize, &str> = m.input.supports.values().map(|s| (s.node_id, s.support_type.as_str())).collect();
    let mut v = vec![];
    for n in sorted_ids(&m.input.nodes, |n| n.id) {
        let st = sup.get(&n).copied();
        if st.is_none() {
            v.push((n, 0));
            v.push((n, 1));
        }
        if st != Some("fixed") && m.moment_nodes.contains(&n) {
            v.push((n, 2));
        }
    }
    v
}

fn unit_load(dof: (usize, usize)) -> SolverLoad {
    let (n, k) = dof;
    SolverLoad::Nodal(SolverNodalLoad {
        node_id: n,
        fx: if k == 0 { 1.0 } else { 0.0 },
        fz: if k == 1 { 1.0 } else { 0.0 },
        my: if k == 2 { 1.0 } else { 0.0 },
    })
}

fn dof_value(res: &AnalysisResults, dof: (usize, usize)) -> f64 {
    let d = res.displacements.iter().find(|d| d.node_id == dof.0).expect("node displacement");
    [d.ux, d.uz, d.ry][dof.1]
}

/// Local nodal end forces ON the element, [fx_i, fy_i, m_i, fx_j, fy_j, m_j].
fn local_end_forces(f: &ElementForces) -> [f64; 6] {
    [-f.n_start, f.v_start, f.m_start, f.n_end, -f.v_end, -f.m_end]
}

// ======================================================================
// Properties
// ======================================================================

proptest! {
    #![proptest_config(config(96))]

    /// (1) Global equilibrium: reactions balance all applied loads (forces and
    /// moment about the origin) for nodal, distributed and point member loads.
    #[test]
    fn prop_global_equilibrium(m in model2(), raws in raw_loads2()) {
        nightly_property(&m.input, || {
            let inp = with_loads(&m, resolve2(&m, &raws, LoadMode::Any));
            let res = solve(&inp)?;
            check_equilibrium(&inp, &res)?;
            Ok(())
        })?;
    }

    /// (2) Linearity / superposition: solve(aP1 + bP2) = a·solve(P1) + b·solve(P2)
    /// for displacements, reactions and member end forces.
    #[test]
    fn prop_superposition(m in model2(), r1 in raw_loads2(), r2 in raw_loads2(),
                          a in -3.0..3.0f64, b in -3.0..3.0f64) {
        nightly_property(&m.input, || {
            let l1 = resolve2(&m, &r1, LoadMode::Any);
            let l2 = resolve2(&m, &r2, LoadMode::Any);
            let mut l12 = scale_loads(&l1, a);
            l12.extend(scale_loads(&l2, b));
            let ids = ids(&m.input);
            let f1 = flat(&solve(&with_loads(&m, l1))?, &ids)?;
            let f2 = flat(&solve(&with_loads(&m, l2))?, &ids)?;
            let f12 = flat(&solve(&with_loads(&m, l12))?, &ids)?;
            check(compare("superposition", &f12, &Flat::lin_comb(a, &f1, b, &f2),
                          &Flat::abs_comb(a, &f1, b, &f2), m.lchar, REL))?;
            Ok(())
        })?;
    }

    /// (3) Maxwell–Betti reciprocity: δ_ij = δ_ji for any two free DOFs (mixed
    /// translation/rotation allowed); also flexibility is SPD-consistent:
    /// δ_ii > 0 and δ_ij² ≤ δ_ii·δ_jj (Cauchy–Schwarz).
    #[test]
    fn prop_maxwell_betti(m in model2(), i in any::<Index>(), j in any::<Index>()) {
        nightly_property(&m.input, || {
            let dofs = free_dofs(&m);
            prop_assume!(!dofs.is_empty());
            let (di, dj) = (dofs[i.index(dofs.len())], dofs[j.index(dofs.len())]);
            let ri = solve(&with_loads(&m, vec![unit_load(di)]))?;
            let rj = solve(&with_loads(&m, vec![unit_load(dj)]))?;
            let (dii, dji) = (dof_value(&ri, di), dof_value(&ri, dj));
            let (djj, dij) = (dof_value(&rj, dj), dof_value(&rj, di));
            prop_assert!(dii > 0.0 && djj > 0.0, "non-positive diagonal flexibility δii={dii:e} δjj={djj:e}");
            let s = (dii * djj).sqrt();
            // Flexibility entries are bounded by sqrt(δii δjj); 1e-6 of it is far
            // above solve round-off (~cond·eps relative to the same scale).
            prop_assert!((dij - dji).abs() <= 1e-6 * s, "reciprocity: δij={dij:e} δji={dji:e} scale {s:e}");
            prop_assert!(dij.abs() <= s * (1.0 + 1e-9), "Cauchy–Schwarz: |δij|={:e} > sqrt(δii δjj)={s:e}", dij.abs());
            Ok(())
        })?;
    }

    /// (4) Frame invariance: rigidly rotating (any angle) and translating the
    /// model and its nodal loads rotates displacements and reaction forces;
    /// rotations, reaction moments and member (local) end forces are unchanged.
    #[test]
    fn prop_frame_invariance(m in model2(), raws in raw_loads2(),
                             th in 0.0..std::f64::consts::TAU, tx in -50.0..50.0f64, tz in -50.0..50.0f64) {
        nightly_property(&m.input, || {
            let inp = with_loads(&m, resolve2(&m, &raws, LoadMode::Any));
            let rot = rotate_model(&inp, th, tx, tz);
            let ids = ids(&inp);
            let base = solve(&inp)?;
            let (s, c) = th.sin_cos();
            let expected = flat2(&base, &ids.nodes, &ids.elems, &ids.sups, &|n| n, &|e| e, (c, s))?;
            let got = flat(&solve(&rot)?, &ids)?;
            // Rotated coordinates differ from exact by round-off (~1e-16·|x+t|),
            // a perturbation of the problem amplified by cond(K) — still ≪ REL.
            check(compare("frame invariance", &got, &expected, &expected, m.lchar, REL))?;
            Ok(())
        })?;
    }

    /// (5) Energy: under nodal loads the external work W = fᵀu is ≥ 0 and equals
    /// Σ_e f_eᵀ u_e computed from the reported member end forces and nodal
    /// displacements in element local axes (= 2 × total strain energy).
    #[test]
    fn prop_energy(m in model2(), raws in raw_loads2()) {
        nightly_property(&m.input, || {
            let inp = with_loads(&m, resolve2(&m, &raws, LoadMode::NodalOnly));
            let res = solve(&inp)?;
            let d: HashMap<usize, &Displacement> = res.displacements.iter().map(|d| (d.node_id, d)).collect();
            let (mut w, mut wabs) = (0.0, 0.0);
            for l in &inp.loads {
                if let SolverLoad::Nodal(nl) = l {
                    let x = d[&nl.node_id];
                    for t in [nl.fx * x.ux, nl.fz * x.uz, nl.my * x.ry] { w += t; wabs += t.abs(); }
                }
            }
            let ef: HashMap<usize, &ElementForces> = res.element_forces.iter().map(|f| (f.element_id, f)).collect();
            let (mut u2, mut uabs) = (0.0, 0.0);
            for e in inp.elements.values() {
                let (_, _, c, s) = elem_geom(&inp, e);
                let (a, b) = (d[&e.node_i], d[&e.node_j]);
                let ul = [c * a.ux + s * a.uz, -s * a.ux + c * a.uz, a.ry, c * b.ux + s * b.uz, -s * b.ux + c * b.uz, b.ry];
                let f = ef[&e.id];
                let fl = if e.elem_type == "truss" { [-f.n_start, 0.0, 0.0, f.n_end, 0.0, 0.0] } else { local_end_forces(f) };
                for k in 0..6 { u2 += fl[k] * ul[k]; uabs += (fl[k] * ul[k]).abs(); }
            }
            // fᵀu = uᵀKu ≥ 0; tolerances relative to the summed term magnitudes.
            prop_assert!(w >= -1e-9 * wabs, "negative external work {w:e}");
            prop_assert!((w - u2).abs() <= 1e-6 * (wabs + uabs) + 1e-15,
                         "external work {w:e} != Σ element f·u {u2:e}");
            Ok(())
        })?;
    }

    /// (6a) Load scaling: P → kP gives u → k·u, reactions and member forces → k·(…).
    #[test]
    fn prop_load_scaling(m in model2(), raws in raw_loads2(), lk in -3.0..3.0f64) {
        nightly_property(&m.input, || {
            let k = 10f64.powf(lk);
            let loads = resolve2(&m, &raws, LoadMode::Any);
            let ids = ids(&m.input);
            let f1 = flat(&solve(&with_loads(&m, loads.clone()))?, &ids)?;
            let fk = flat(&solve(&with_loads(&m, scale_loads(&loads, k)))?, &ids)?;
            let exp = f1.scaled(k, k, k, k);
            check(compare("load scaling", &fk, &exp, &exp, m.lchar, REL))?;
            Ok(())
        })?;
    }

    /// (6b) Stiffness scaling: E → kE gives u → u/k with reactions and member
    /// forces unchanged (force distribution depends only on stiffness ratios).
    #[test]
    fn prop_modulus_scaling(m in model2(), raws in raw_loads2(), lk in -2.0..2.0f64) {
        nightly_property(&m.input, || {
            let k = 10f64.powf(lk);
            let inp = with_loads(&m, resolve2(&m, &raws, LoadMode::Any));
            let mut sc = inp.clone();
            for mat in sc.materials.values_mut() { mat.e *= k; }
            let ids = ids(&inp);
            let f1 = flat(&solve(&inp)?, &ids)?;
            let fk = flat(&solve(&sc)?, &ids)?;
            let exp = f1.scaled(1.0 / k, 1.0 / k, 1.0, 1.0);
            check(compare("E scaling", &fk, &exp, &exp, m.lchar, REL))?;
            Ok(())
        })?;
    }

    /// (6c) Geometric similitude: lengths ×s, A ×s², I ×s⁴, forces ×s²,
    /// moments ×s³, line loads ×s (constant stress) ⇒ translations ×s,
    /// rotations unchanged, forces ×s², moments ×s³.
    #[test]
    fn prop_similitude(m in model2(), raws in raw_loads2(), ls in -1.0..1.0f64) {
        nightly_property(&m.input, || {
            let s = 10f64.powf(ls);
            let inp = with_loads(&m, resolve2(&m, &raws, LoadMode::Any));
            let mut sc = inp.clone();
            for n in sc.nodes.values_mut() { n.x *= s; n.z *= s; }
            for sec in sc.sections.values_mut() { sec.a *= s * s; sec.iz *= s.powi(4); }
            for l in sc.loads.iter_mut() {
                match l {
                    SolverLoad::Nodal(n) => { n.fx *= s * s; n.fz *= s * s; n.my *= s.powi(3); }
                    SolverLoad::Distributed(d) => {
                        d.q_i *= s; d.q_j *= s;
                        d.a = d.a.map(|v| v * s); d.b = d.b.map(|v| v * s);
                    }
                    SolverLoad::PointOnElement(p) => {
                        p.a *= s; p.p *= s * s;
                        p.px = p.px.map(|v| v * s * s); p.my = p.my.map(|v| v * s.powi(3));
                    }
                    _ => {}
                }
            }
            let ids = ids(&inp);
            let f1 = flat(&solve(&inp)?, &ids)?;
            let fs = flat(&solve(&sc)?, &ids)?;
            let exp = f1.scaled(s, 1.0, s * s, s.powi(3));
            check(compare("similitude", &fs, &exp, &exp, m.lchar * s, REL))?;
            Ok(())
        })?;
    }

    /// (7) Node/element/support id relabelling (non-contiguous ids, shuffled
    /// order, reversed load list) changes nothing physical.
    #[test]
    fn prop_relabel_invariance(
        (m, np, ep, off) in model2().prop_flat_map(|m| {
            let n = m.input.nodes.len();
            let ne = m.input.elements.len();
            (Just(m), Just((0..n).collect::<Vec<_>>()).prop_shuffle(),
             Just((0..ne).collect::<Vec<_>>()).prop_shuffle(), 0usize..1000)
        }),
        raws in raw_loads2())
    {
        nightly_property(&m.input, || {
            let inp = with_loads(&m, resolve2(&m, &raws, LoadMode::Any));
            let nmap = |n: usize| np[n - 1] * 3 + 1 + off; // ids 1..=n → shuffled, gapped
            let emap = |e: usize| ep[e - 1] * 2 + 7 + off;
            let mut p = inp.clone();
            p.nodes = inp.nodes.values().map(|n| { let id = nmap(n.id); (id.to_string(), SolverNode { id, ..n.clone() }) }).collect();
            p.elements = inp.elements.values().map(|e| {
                let id = emap(e.id);
                (id.to_string(), SolverElement { id, node_i: nmap(e.node_i), node_j: nmap(e.node_j), ..e.clone() })
            }).collect();
            let ns = inp.supports.len();
            p.supports = inp.supports.values().map(|s| {
                let id = ns + 1 - s.id + 40; // reverse support id order
                (id.to_string(), SolverSupport { id, node_id: nmap(s.node_id), ..s.clone() })
            }).collect();
            p.loads = inp.loads.iter().rev().map(|l| match l {
                SolverLoad::Nodal(n) => SolverLoad::Nodal(SolverNodalLoad { node_id: nmap(n.node_id), ..n.clone() }),
                SolverLoad::Distributed(d) => SolverLoad::Distributed(SolverDistributedLoad { element_id: emap(d.element_id), ..d.clone() }),
                SolverLoad::PointOnElement(q) => SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id: emap(q.element_id), ..q.clone() }),
                o => o.clone(),
            }).collect();
            let ids = ids(&inp);
            let base = flat(&solve(&inp)?, &ids)?;
            let got = flat2(&solve(&p)?, &ids.nodes, &ids.elems, &ids.sups, &nmap, &emap, (1.0, 0.0))?;
            check(compare("relabel", &got, &base, &base, m.lchar, REL))?;
            Ok(())
        })?;
    }

    /// (8) Element orientation: reversing node_i/node_j of members (with their
    /// hinges and member loads mirrored: q(s) → −q(L−s), p → −p, px → −px,
    /// a → L−a) leaves displacements/reactions unchanged and maps end forces as
    /// (nS, nE, vS, vE, mS, mE) → (nE, nS, vE, vS, −mE, −mS)
    /// (local x and y both flip; in-plane moments do not).
    #[test]
    fn prop_element_reversal(
        (m, flip) in model2().prop_flat_map(|m| {
            let ne = m.input.elements.len();
            (Just(m), prop::collection::vec(any::<bool>(), ne))
        }),
        raws in raw_loads2())
    {
        nightly_property(&m.input, || {
            let inp = with_loads(&m, resolve2(&m, &raws, LoadMode::FrameMembers));
            let flipped = |id: usize| flip[id - 1];
            let mut p = inp.clone();
            for e in p.elements.values_mut() {
                if flipped(e.id) {
                    std::mem::swap(&mut e.node_i, &mut e.node_j);
                    std::mem::swap(&mut e.hinge_start, &mut e.hinge_end);
                }
            }
            for l in p.loads.iter_mut() {
                match l {
                    SolverLoad::Distributed(d) if flipped(d.element_id) => {
                        let len = elem_len(&inp, d.element_id);
                        let (qi, qj) = (d.q_i, d.q_j);
                        d.q_i = -qj; d.q_j = -qi;
                        if let (Some(a), Some(b)) = (d.a, d.b) { d.a = Some(len - b); d.b = Some(len - a); }
                    }
                    SolverLoad::PointOnElement(q) if flipped(q.element_id) => {
                        let len = elem_len(&inp, q.element_id);
                        q.a = len - q.a; q.p = -q.p; q.px = q.px.map(|v| -v);
                    }
                    _ => {}
                }
            }
            let ids = ids(&inp);
            let mut base = solve(&inp)?;
            for f in base.element_forces.iter_mut() {
                if flipped(f.element_id) {
                    let o = f.clone();
                    f.n_start = o.n_end; f.n_end = o.n_start;
                    f.v_start = o.v_end; f.v_end = o.v_start;
                    f.m_start = -o.m_end; f.m_end = -o.m_start;
                }
            }
            let exp = flat(&base, &ids)?;
            let got = flat(&solve(&p)?, &ids)?;
            check(compare("element reversal", &got, &exp, &exp, m.lchar, REL))?;
            Ok(())
        })?;
    }

    /// (9) Internal-force consistency:
    ///  (a) every frame member is in equilibrium under its end forces and its
    ///      member loads (ΣFx, ΣFy, ΣM about end I, local axes);
    ///  (b) every node is in equilibrium: the member end forces acting on the
    ///      node balance the applied nodal load plus the support reaction.
    #[test]
    fn prop_internal_force_consistency(m in model2(), raws in raw_loads2()) {
        nightly_property(&m.input, || {
            let inp = with_loads(&m, resolve2(&m, &raws, LoadMode::FrameMembers));
            let res = solve(&inp)?;
            let ef: HashMap<usize, &ElementForces> = res.element_forces.iter().map(|f| (f.element_id, f)).collect();
            // Member load resultants in local axes: (Wx, Wy, M about I).
            let mut wl: HashMap<usize, [f64; 3]> = HashMap::new();
            for l in &inp.loads {
                match l {
                    SolverLoad::Distributed(dl) => {
                        let len = elem_len(&inp, dl.element_id);
                        let (a, b) = (dl.a.unwrap_or(0.0), dl.b.unwrap_or(len));
                        let span = b - a;
                        let w = wl.entry(dl.element_id).or_default();
                        for (q, xc) in [(dl.q_i * span, a + span / 2.0), ((dl.q_j - dl.q_i) * span / 2.0, a + 2.0 * span / 3.0)] {
                            w[1] += q; w[2] += q * xc;
                        }
                    }
                    SolverLoad::PointOnElement(pl) => {
                        let w = wl.entry(pl.element_id).or_default();
                        w[0] += pl.px.unwrap_or(0.0); w[1] += pl.p; w[2] += pl.p * pl.a + pl.my.unwrap_or(0.0);
                    }
                    _ => {}
                }
            }
            let mut node_sum: HashMap<usize, [f64; 3]> = HashMap::new();
            let mut node_abs: HashMap<usize, f64> = HashMap::new();
            // Global force scale (largest member end force / member load), used as an
            // absolute floor so near-zero members are not compared on pure noise.
            let mut fscale: f64 = 1e-9;
            for e in inp.elements.values() {
                let f = ef[&e.id];
                let len = elem_len(&inp, e.id);
                let w = wl.get(&e.id).copied().unwrap_or_default();
                for v in local_end_forces(f).iter().map(|x| x.abs()).chain([w[0].abs(), w[1].abs(), w[2].abs() / len]) {
                    fscale = fscale.max(v);
                }
            }
            for e in inp.elements.values() {
                let (_, len, c, s) = elem_geom(&inp, e);
                let f = ef[&e.id];
                let fl = if e.elem_type == "truss" { [-f.n_start, 0.0, 0.0, f.n_end, 0.0, 0.0] } else { local_end_forces(f) };
                let w = wl.get(&e.id).copied().unwrap_or_default();
                let sc = fl.iter().fold(0.0f64, |a, b| a.max(b.abs())).max(w[0].abs()).max(w[1].abs()).max(w[2].abs() / len);
                // (a) member equilibrium; tolerance relative to the member's own force
                // scale, floored by 1e-9 of the model's largest member force.
                let t = 1e-7 * sc + 1e-9 * fscale;
                prop_assert!((fl[0] + fl[3] + w[0]).abs() <= t, "elem {} ΣFx={:e}", e.id, fl[0] + fl[3] + w[0]);
                prop_assert!((fl[1] + fl[4] + w[1]).abs() <= t, "elem {} ΣFy={:e}", e.id, fl[1] + fl[4] + w[1]);
                if e.elem_type == "frame" {
                    let mi = fl[2] + fl[5] + len * fl[4] + w[2];
                    prop_assert!(mi.abs() <= t * len, "elem {} ΣM_I={mi:e}", e.id);
                }
                // (b) accumulate forces exerted BY the nodes ON the member (global)
                for (nid, o) in [(e.node_i, 0usize), (e.node_j, 3usize)] {
                    let g = [c * fl[o] - s * fl[o + 1], s * fl[o] + c * fl[o + 1], fl[o + 2]];
                    let acc = node_sum.entry(nid).or_default();
                    for k in 0..3 { acc[k] += g[k]; }
                    *node_abs.entry(nid).or_default() += g[0].abs() + g[1].abs() + g[2].abs() / len;
                }
            }
            // Σ_members (force on member at node) = applied nodal load + reaction.
            let mut rhs: HashMap<usize, [f64; 3]> = HashMap::new();
            for l in &inp.loads {
                if let SolverLoad::Nodal(nl) = l {
                    let a = rhs.entry(nl.node_id).or_default();
                    a[0] += nl.fx; a[1] += nl.fz; a[2] += nl.my;
                }
            }
            for r in &res.reactions {
                let a = rhs.entry(r.node_id).or_default();
                a[0] += r.rx; a[1] += r.rz; a[2] += r.my;
            }
            for (nid, sum) in &node_sum {
                let r = rhs.get(nid).copied().unwrap_or_default();
                let t = 1e-7 * (node_abs[nid] + r[0].abs() + r[1].abs()) + 1e-9 * fscale;
                for k in 0..3 {
                    let tk = if k == 2 { t * m.lchar } else { t };
                    prop_assert!((sum[k] - r[k]).abs() <= tk,
                        "node {nid} comp {k}: Σ member end = {:e}, load+reaction = {:e}", sum[k], r[k]);
                }
            }
            Ok(())
        })?;
    }
}
