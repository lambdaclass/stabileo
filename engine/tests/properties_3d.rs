//! Property-based tests for the 3D linear static solver (`linear::solve_3d`),
//! frame/truss members only.
//!
//! Random *valid* space models come from two families:
//!   * random connected rigid-jointed space frames (spanning tree + extra
//!     members, node 1 fully fixed, optional extra fixed/pinned supports),
//!   * random multi-bay multi-storey 3D buildings (fixed/pinned bases, optional
//!     truss braces, optional beam-end moment releases when all bases fixed),
//! with member local axes either defaulted or given by an explicit local-y
//! reference vector, loaded by random nodal forces/moments, (partial,
//! trapezoidal) distributed member loads in local x/y/z and concentrated member
//! loads.
//!
//! Engine conventions used here (from `element/transform.rs`, `solver/*.rs`):
//!   * local x = I→J; with an explicit reference r: ez = unit(ex × r),
//!     ey = ez × ex; default r: ez = global Z projected ⊥ ex (global X if the
//!     member is within 0.999 of vertical), ey = ez × ex; roll angle φ (deg)
//!     maps (ey, ez) → (c·ey + s·ez, −s·ey + c·ez);
//!   * member loads (q_x, q_y, q_z, p_y, p_z) act along local axes;
//!   * local end forces ON the element are
//!     [−nS, vyS, vzS, mxS, myS, mzS, nE, −vyE, −vzE, −mxE, −myE, −mzE].
//!
//! Frame invariance uses fully general random 3D rotations: every member's
//! local axes are first made explicit (reference vector = the engine-default
//! local y, whose equivalence to the default is itself checked by
//! `prop_explicit_default_axes_equivalent`), then the reference vectors are
//! rotated with the geometry.

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
struct Model3 {
    input: SolverInput3D,
    /// Characteristic size (m): max node distance from the origin, ≥ 1.
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
    iy: f64,
    iz: f64,
    j: f64,
}

fn mat_s() -> impl Strategy<Value = Mat> {
    (25_000.0..210_000.0f64, 0.15..0.35f64).prop_map(|(e, nu)| Mat { e, nu })
}
/// A ∈ [20, 500] cm², independent radii of gyration about y and z, and a
/// torsion constant between 2% and 100% of the polar moment.
fn sec_s() -> impl Strategy<Value = Sec> {
    (2e-3..5e-2f64, 0.05..0.4f64, 0.05..0.4f64, 0.02..1.0f64).prop_map(|(a, ry, rz, f)| {
        let (iy, iz) = (a * ry * ry, a * rz * rz);
        Sec { a, iy, iz, j: f * (iy + iz) }
    })
}

#[derive(Clone, Copy, Default)]
struct Rel {
    my_s: bool,
    my_e: bool,
    mz_s: bool,
    mz_e: bool,
}

struct E3 {
    t: &'static str,
    ni: usize,
    nj: usize,
    mat: usize,
    sec: usize,
    ref_y: Option<V3>,
    rel: Rel,
}

#[derive(Default)]
struct B3 {
    nodes: Vec<V3>,
    mats: Vec<Mat>,
    secs: Vec<Sec>,
    elems: Vec<E3>,
    sups: Vec<(usize, bool)>, // (node id, fixed? else pinned)
}

fn support3(node_id: usize, fixed: bool) -> SolverSupport3D {
    SolverSupport3D {
        node_id,
        rx: true,
        ry: true,
        rz: true,
        rrx: fixed,
        rry: fixed,
        rrz: fixed,
        kx: None,
        ky: None,
        kz: None,
        krx: None,
        kry: None,
        krz: None,
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
    }
}

impl B3 {
    fn finish(self) -> Model3 {
        let mut nodes = HashMap::new();
        let mut lchar: f64 = 1.0;
        for (k, p) in self.nodes.iter().enumerate() {
            nodes.insert((k + 1).to_string(), SolverNode3D { id: k + 1, x: p[0], y: p[1], z: p[2] });
            lchar = lchar.max(norm(p));
        }
        let materials = self
            .mats
            .iter()
            .enumerate()
            .map(|(k, m)| ((k + 1).to_string(), SolverMaterial { id: k + 1, e: m.e, nu: m.nu }))
            .collect();
        let sections = self
            .secs
            .iter()
            .enumerate()
            .map(|(k, s)| {
                (
                    (k + 1).to_string(),
                    SolverSection3D { id: k + 1, name: None, a: s.a, iy: s.iy, iz: s.iz, j: s.j, cw: None, as_y: None, as_z: None, shear_center_y: None, shear_center_z: None },
                )
            })
            .collect();
        let elements = self
            .elems
            .iter()
            .enumerate()
            .map(|(k, e)| {
                (
                    (k + 1).to_string(),
                    SolverElement3D {
                        id: k + 1,
                        elem_type: e.t.to_string(),
                        node_i: e.ni,
                        node_j: e.nj,
                        material_id: e.mat + 1,
                        section_id: e.sec + 1,
                        release_my_start: e.rel.my_s,
                        release_my_end: e.rel.my_e,
                        release_mz_start: e.rel.mz_s,
                        release_mz_end: e.rel.mz_e,
                        release_t_start: false,
                        release_t_end: false,
                        local_yx: e.ref_y.map(|v| v[0]),
                        local_yy: e.ref_y.map(|v| v[1]),
                        local_yz: e.ref_y.map(|v| v[2]),
                        roll_angle: None,
                    },
                )
            })
            .collect();
        let supports = self.sups.iter().enumerate().map(|(k, &(n, f))| ((k + 1).to_string(), support3(n, f))).collect();
        Model3 {
            input: SolverInput3D {
                nodes,
                materials,
                sections,
                elements,
                supports,
                loads: vec![],
                constraints: vec![],
                left_hand: None,
                plates: HashMap::new(),
                quads: HashMap::new(),
                quad9s: HashMap::new(),
                solid_shells: HashMap::new(),
                curved_shells: HashMap::new(),
                curved_beams: vec![],
                connectors: HashMap::new(),
                solver_options: None, masses: Default::default(),
            },
            lchar,
        }
    }
}

/// Turn a raw random vector into a valid local-y reference for axis `ex`
/// (well away from parallel); `None` keeps the engine-default axes.
fn make_ref(raw: Option<V3>, ex: &V3) -> Option<V3> {
    let v = raw?;
    if norm(&v) > 0.3 && dot(&unit(&v), ex).abs() < 0.95 {
        return Some(v);
    }
    // fall back to the global axis least aligned with ex, made ⊥ ex
    let k = (0..3).min_by(|&a, &b| ex[a].abs().partial_cmp(&ex[b].abs()).unwrap()).unwrap();
    let mut e = [0.0; 3];
    e[k] = 1.0;
    Some(unit(&sub(&e, &scale(ex, dot(&e, ex)))))
}

fn raw_ref() -> impl Strategy<Value = Option<V3>> {
    prop::option::of((-1.0..1.0f64, -1.0..1.0f64, -1.0..1.0f64).prop_map(|(a, b, c)| [a, b, c]))
}

/// Random connected rigid-jointed space frame; node 1 fully fixed ⇒ stable.
fn graph_frame3() -> impl Strategy<Value = Model3> {
    (2usize..=8)
        .prop_flat_map(|n| {
            (
                prop::collection::vec((0.0..10.0f64, 0.0..10.0f64, 0.0..10.0f64).prop_map(|(a, b, c)| [a, b, c]), n),
                prop::collection::vec(any::<Index>(), n - 1),
                prop::collection::vec((any::<Index>(), any::<Index>()), 0..4),
                prop::collection::vec((any::<Index>(), any::<bool>()), 0..3),
                prop::collection::vec(mat_s(), 1..=2),
                prop::collection::vec(sec_s(), 1..=3),
                prop::collection::vec((any::<Index>(), any::<Index>(), raw_ref()), n + 3),
            )
        })
        .prop_filter("nodes too close", |t| min_pair_dist(&t.0.iter().map(|p| p.to_vec()).collect::<Vec<_>>()) >= 0.75)
        .prop_map(|(pts, parents, extras, sups, mats, secs, assign)| {
            let n = pts.len();
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
            let mut b = B3 { ..Default::default() };
            for (k, &(i, j)) in edges.iter().enumerate() {
                let (mi, si, r) = assign[k % assign.len()];
                let ex = unit(&sub(&pts[j], &pts[i]));
                b.elems.push(E3 {
                    t: "frame",
                    ni: i + 1,
                    nj: j + 1,
                    mat: mi.index(mats.len()),
                    sec: si.index(secs.len()),
                    ref_y: make_ref(r, &ex),
                    rel: Rel::default(),
                });
            }
            b.sups.push((1, true));
            let mut used = BTreeSet::from([0usize]);
            for (idx, fixed) in sups {
                let k = idx.index(n);
                if used.insert(k) {
                    b.sups.push((k + 1, fixed));
                }
            }
            b.nodes = pts;
            b.mats = mats;
            b.secs = secs;
            b.finish()
        })
}

/// nx × ny bays, ns storeys (Z up). Rigid beam–column joints; bases fixed or
/// pinned; optional X-direction truss braces; beam-end bending releases (one
/// end per beam, torsion kept) only if all bases are fixed.
fn building3() -> impl Strategy<Value = Model3> {
    (1usize..=2, 1usize..=2, 1usize..=2)
        .prop_flat_map(|(nx, ny, ns)| {
            let nbeams = ns * (nx * (ny + 1) + ny * (nx + 1));
            (
                prop::collection::vec(3.0..7.0f64, nx),
                prop::collection::vec(3.0..7.0f64, ny),
                prop::collection::vec(2.5..4.5f64, ns),
                prop::collection::vec(any::<bool>(), (nx + 1) * (ny + 1)),
                prop::collection::vec(prop::option::of(any::<bool>()), nx * (ny + 1) * ns),
                prop::collection::vec(prop::option::of(any::<bool>()), nbeams),
                prop::collection::vec(raw_ref(), nbeams + (nx + 1) * (ny + 1) * ns),
                mat_s(),
                (sec_s(), sec_s(), sec_s()),
            )
        })
        .prop_map(|(wx, wy, hs, base_fixed, braces, rels, refs, mat, (sc, sb, sbr))| {
            let (nx, ny, ns) = (wx.len(), wy.len(), hs.len());
            let id = |i: usize, j: usize, k: usize| k * (nx + 1) * (ny + 1) + j * (nx + 1) + i + 1;
            let mut b = B3 { mats: vec![mat], secs: vec![sc, sb, sbr], ..Default::default() };
            let cum = |v: &[f64], i: usize| v[..i].iter().sum::<f64>();
            for k in 0..=ns {
                for j in 0..=ny {
                    for i in 0..=nx {
                        b.nodes.push([cum(&wx, i), cum(&wy, j), cum(&hs, k)]);
                    }
                }
            }
            let all_fixed = base_fixed.iter().all(|&f| f);
            let pos = |n: usize| b.nodes[n - 1];
            let mut refs = refs.into_iter();
            let mut rels = rels.into_iter();
            let mut elems = vec![];
            let mut push = |t, ni: usize, nj: usize, sec, rel: Option<bool>, refs: &mut dyn Iterator<Item = Option<V3>>| {
                let ex = unit(&sub(&pos(nj), &pos(ni)));
                let rel = match rel {
                    Some(true) if all_fixed => Rel { my_s: true, mz_s: true, ..Rel::default() },
                    Some(false) if all_fixed => Rel { my_e: true, mz_e: true, ..Rel::default() },
                    _ => Rel::default(),
                };
                let ref_y = if t == "frame" { make_ref(refs.next().flatten(), &ex) } else { None };
                elems.push(E3 { t, ni, nj, mat: 0, sec, ref_y, rel });
            };
            for k in 0..ns {
                for j in 0..=ny {
                    for i in 0..=nx {
                        push("frame", id(i, j, k), id(i, j, k + 1), 0, None, &mut refs);
                    }
                }
            }
            for k in 1..=ns {
                for j in 0..=ny {
                    for i in 0..nx {
                        let r = rels.next().unwrap();
                        push("frame", id(i, j, k), id(i + 1, j, k), 1, r, &mut refs);
                    }
                }
                for j in 0..ny {
                    for i in 0..=nx {
                        let r = rels.next().unwrap();
                        push("frame", id(i, j, k), id(i, j + 1, k), 1, r, &mut refs);
                    }
                }
            }
            let mut br = braces.into_iter();
            for k in 0..ns {
                for j in 0..=ny {
                    for i in 0..nx {
                        match br.next().unwrap() {
                            Some(true) => push("truss", id(i, j, k), id(i + 1, j, k + 1), 2, None, &mut refs),
                            Some(false) => push("truss", id(i + 1, j, k), id(i, j, k + 1), 2, None, &mut refs),
                            None => {}
                        }
                    }
                }
            }
            b.elems = elems;
            for j in 0..=ny {
                for i in 0..=nx {
                    b.sups.push((id(i, j, 0), base_fixed[j * (nx + 1) + i]));
                }
            }
            b.finish()
        })
}

fn model3() -> impl Strategy<Value = Model3> {
    prop_oneof![graph_frame3(), building3()]
}

// ---------------- loads ----------------

#[derive(Debug, Clone)]
enum RawLoad3 {
    Nodal(Index, V3, V3),
    /// element, (qyi, qyj), (qzi, qzj), (qxi, qxj), partial extent fractions
    Dist(Index, (f64, f64), (f64, f64), (f64, f64), Option<(f64, f64)>),
    /// element, a/L, py, pz
    Point(Index, f64, f64, f64),
}

fn v3(r: f64) -> impl Strategy<Value = V3> {
    (-r..r, -r..r, -r..r).prop_map(|(a, b, c)| [a, b, c])
}
fn raw_load3() -> impl Strategy<Value = RawLoad3> {
    let q = || (-30.0..30.0f64, -30.0..30.0f64);
    prop_oneof![
        3 => (any::<Index>(), v3(100.0), v3(50.0)).prop_map(|(i, f, m)| RawLoad3::Nodal(i, f, m)),
        2 => (any::<Index>(), q(), q(), q(), prop::option::of((0.0..1.0f64, 0.0..1.0f64)))
            .prop_map(|(i, a, b, c, d)| RawLoad3::Dist(i, a, b, c, d)),
        1 => (any::<Index>(), 0.05..0.95f64, -100.0..100.0f64, -100.0..100.0f64)
            .prop_map(|(i, f, py, pz)| RawLoad3::Point(i, f, py, pz)),
    ]
}
fn raw_loads3() -> impl Strategy<Value = Vec<RawLoad3>> {
    prop::collection::vec(raw_load3(), 1..6)
}

fn sorted_ids<T>(m: &HashMap<String, T>, id: impl Fn(&T) -> usize) -> Vec<usize> {
    let mut v: Vec<usize> = m.values().map(id).collect();
    v.sort();
    v
}

fn npos(input: &SolverInput3D, id: usize) -> V3 {
    let n = &input.nodes[&id.to_string()];
    [n.x, n.y, n.z]
}
fn elem_len(input: &SolverInput3D, eid: usize) -> f64 {
    let e = &input.elements[&eid.to_string()];
    norm(&sub(&npos(input, e.node_j), &npos(input, e.node_i)))
}

/// Member loads go on frame members only (truss output carries no member
/// transverse loads); `nodal_only` drops member loads.
fn resolve3(m: &Model3, raws: &[RawLoad3], nodal_only: bool) -> Vec<SolverLoad3D> {
    let nodes = sorted_ids(&m.input.nodes, |n| n.id);
    let frames: Vec<usize> = {
        let mut v: Vec<usize> = m.input.elements.values().filter(|e| e.elem_type == "frame").map(|e| e.id).collect();
        v.sort();
        v
    };
    let mut out = vec![];
    for r in raws {
        match *r {
            RawLoad3::Nodal(i, f, mo) => out.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: nodes[i.index(nodes.len())],
                fx: f[0],
                fy: f[1],
                fz: f[2],
                mx: mo[0],
                my: mo[1],
                mz: mo[2],
                bw: None,
            })),
            _ if nodal_only || frames.is_empty() => {}
            RawLoad3::Dist(i, qy, qz, qx, part) => {
                let eid = frames[i.index(frames.len())];
                let l = elem_len(&m.input, eid);
                let (a, b) = match part {
                    Some((u, v)) if (u - v).abs() > 0.05 => (Some(u.min(v) * l), Some(u.max(v) * l)),
                    _ => (None, None),
                };
                out.push(SolverLoad3D::Distributed(SolverDistributedLoad3D {
                    q_xi: qx.0,
                    q_xj: qx.1,
                    element_id: eid,
                    q_yi: qy.0,
                    q_yj: qy.1,
                    q_zi: qz.0,
                    q_zj: qz.1,
                    a,
                    b,
                }));
            }
            RawLoad3::Point(i, f, py, pz) => {
                let eid = frames[i.index(frames.len())];
                let l = elem_len(&m.input, eid);
                out.push(SolverLoad3D::PointOnElement(SolverPointLoad3D { element_id: eid, a: f * l, py, pz }));
            }
        }
    }
    out
}

fn with_loads(m: &Model3, loads: Vec<SolverLoad3D>) -> SolverInput3D {
    let mut i = m.input.clone();
    i.loads = loads;
    i
}

// ======================================================================
// Local axes (independent re-implementation of the documented convention)
// ======================================================================

fn default_ref(ex: &V3) -> V3 {
    let up = if ex[2].abs() > 0.999 { [1.0, 0.0, 0.0] } else { [0.0, 0.0, 1.0] };
    let ez = unit(&sub(&up, &scale(ex, dot(&up, ex))));
    cross(&ez, ex)
}

fn local_axes(input: &SolverInput3D, e: &SolverElement3D) -> (f64, [V3; 3]) {
    let d = sub(&npos(input, e.node_j), &npos(input, e.node_i));
    let l = norm(&d);
    let ex = scale(&d, 1.0 / l);
    let r = match (e.local_yx, e.local_yy, e.local_yz) {
        (Some(a), Some(b), Some(c)) => [a, b, c],
        _ => default_ref(&ex),
    };
    let ez = unit(&cross(&ex, &r));
    let ey = cross(&ez, &ex);
    let (ey, ez) = match e.roll_angle {
        Some(deg) => {
            let (s, c) = deg.to_radians().sin_cos();
            (add(&scale(&ey, c), &scale(&ez, s)), add(&scale(&ey, -s), &scale(&ez, c)))
        }
        None => (ey, ez),
    };
    (l, [ex, ey, ez])
}

/// Make every member's local axes explicit (reference = current local y).
fn explicit_axes(input: &SolverInput3D) -> SolverInput3D {
    let mut out = input.clone();
    for e in out.elements.values_mut() {
        if e.elem_type != "frame" {
            continue;
        }
        let (_, [_, ey, _]) = local_axes(input, e);
        e.local_yx = Some(ey[0]);
        e.local_yy = Some(ey[1]);
        e.local_yz = Some(ey[2]);
        e.roll_angle = None;
    }
    out
}

// ======================================================================
// Result helpers
// ======================================================================

fn solve(input: &SolverInput3D) -> Result<AnalysisResults3D, TestCaseError> {
    nightly_input(input);
    linear::solve_3d(input).map_err(|e| TestCaseError::fail(format!("solve_3d failed: {e}")))
}

/// Linear-load parts (resultant, centroid) of a trapezoid q_i→q_j on [a, b].
fn trap(qi: f64, qj: f64, a: f64, b: f64) -> [(f64, f64); 2] {
    let span = b - a;
    [(qi * span, a + span / 2.0), ((qj - qi) * span / 2.0, a + 2.0 * span / 3.0)]
}

/// Global (force, moment-about-origin) resultants of all loads + magnitude scales.
fn applied_resultant(input: &SolverInput3D) -> (V3, V3, f64, f64) {
    let (mut f, mut mo, mut sf, mut sm) = ([0.0; 3], [0.0; 3], 0.0, 0.0);
    let mut push = |force: V3, moment: V3, at: V3| {
        let rm = cross(&at, &force);
        f = add(&f, &force);
        mo = add(&mo, &add(&rm, &moment));
        sf += norm(&force);
        sm += norm(&moment) + norm(&at) * norm(&force);
    };
    for l in &input.loads {
        match l {
            SolverLoad3D::Nodal(n) => push([n.fx, n.fy, n.fz], [n.mx, n.my, n.mz], npos(input, n.node_id)),
            SolverLoad3D::Distributed(d) => {
                let e = &input.elements[&d.element_id.to_string()];
                let (l, [ex, ey, ez]) = local_axes(input, e);
                let pi = npos(input, e.node_i);
                let (a, b) = (d.a.unwrap_or(0.0), d.b.unwrap_or(l));
                for (dir, qi, qj) in [(ex, d.q_xi, d.q_xj), (ey, d.q_yi, d.q_yj), (ez, d.q_zi, d.q_zj)] {
                    for (w, xc) in trap(qi, qj, a, b) {
                        push(scale(&dir, w), [0.0; 3], add(&pi, &scale(&ex, xc)));
                    }
                }
            }
            SolverLoad3D::PointOnElement(p) => {
                let e = &input.elements[&p.element_id.to_string()];
                let (_, [ex, ey, ez]) = local_axes(input, e);
                let at = add(&npos(input, e.node_i), &scale(&ex, p.a));
                push(add(&scale(&ey, p.py), &scale(&ez, p.pz)), [0.0; 3], at);
            }
            _ => {}
        }
    }
    (f, mo, sf, sm)
}

fn check_equilibrium(input: &SolverInput3D, res: &AnalysisResults3D) -> Result<(), TestCaseError> {
    let (af, am, sf, sm) = applied_resultant(input);
    let (mut rf, mut rm, mut rsf, mut rsm) = ([0.0; 3], [0.0; 3], 0.0, 0.0);
    for r in &res.reactions {
        let p = npos(input, r.node_id);
        let f = [r.fx, r.fy, r.fz];
        let m = [r.mx, r.my, r.mz];
        rf = add(&rf, &f);
        rm = add(&rm, &add(&m, &cross(&p, &f)));
        rsf += norm(&f);
        rsm += norm(&m) + norm(&p) * norm(&f);
    }
    // Round-off relative to the summed load/reaction magnitudes (see 2D suite).
    let tf = 1e-8 * (sf + rsf) + 1e-12;
    let tm = 1e-8 * (sm + rsm) + 1e-12;
    for k in 0..3 {
        prop_assert!((af[k] + rf[k]).abs() <= tf, "ΣF[{k}]: applied {} + reactions {} (tol {tf:e})", af[k], rf[k]);
        prop_assert!((am[k] + rm[k]).abs() <= tm, "ΣM[{k}]: applied {} + reactions {} (tol {tm:e})", am[k], rm[k]);
    }
    Ok(())
}

struct Ids {
    nodes: Vec<usize>,
    elems: Vec<usize>,
    sups: Vec<usize>,
}
fn ids(input: &SolverInput3D) -> Ids {
    let mut sups: Vec<usize> = input.supports.values().map(|s| s.node_id).collect();
    sups.sort();
    Ids { nodes: sorted_ids(&input.nodes, |n| n.id), elems: sorted_ids(&input.elements, |e| e.id), sups }
}

/// Flatten results (original id order), rotating vector quantities by `r`.
fn flat3(res: &AnalysisResults3D, ids: &Ids, nmap: &dyn Fn(usize) -> usize, emap: &dyn Fn(usize) -> usize, r: &M3) -> Result<Flat, TestCaseError> {
    let d: HashMap<usize, &Displacement3D> = res.displacements.iter().map(|d| (d.node_id, d)).collect();
    let rc: HashMap<usize, &Reaction3D> = res.reactions.iter().map(|r| (r.node_id, r)).collect();
    let ef: HashMap<usize, &ElementForces3D> = res.element_forces.iter().map(|f| (f.element_id, f)).collect();
    let mut out = Flat::default();
    for &n in &ids.nodes {
        let x = d.get(&nmap(n)).ok_or_else(|| TestCaseError::fail(format!("no displacement for node {n}")))?;
        out.t.extend(matvec(r, &[x.ux, x.uy, x.uz]));
        out.r.extend(matvec(r, &[x.rx, x.ry, x.rz]));
    }
    for &n in &ids.sups {
        let x = rc.get(&nmap(n)).ok_or_else(|| TestCaseError::fail(format!("no reaction for node {n}")))?;
        out.f.extend(matvec(r, &[x.fx, x.fy, x.fz]));
        out.m.extend(matvec(r, &[x.mx, x.my, x.mz]));
    }
    for &e in &ids.elems {
        let f = ef.get(&emap(e)).ok_or_else(|| TestCaseError::fail(format!("no forces for element {e}")))?;
        out.f.extend([f.n_start, f.n_end, f.vy_start, f.vy_end, f.vz_start, f.vz_end]);
        out.m.extend([f.mx_start, f.mx_end, f.my_start, f.my_end, f.mz_start, f.mz_end]);
    }
    Ok(out)
}
const I3: M3 = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];
fn flat(res: &AnalysisResults3D, ids: &Ids) -> Result<Flat, TestCaseError> {
    flat3(res, ids, &|n| n, &|e| e, &I3)
}

fn check(r: Result<(), String>) -> Result<(), TestCaseError> {
    r.map_err(TestCaseError::fail)
}

/// Relative tolerance for comparing two independent solves (see `compare`).
const REL: f64 = 1e-6;

fn scale_loads(loads: &[SolverLoad3D], k: f64) -> Vec<SolverLoad3D> {
    loads
        .iter()
        .map(|l| match l {
            SolverLoad3D::Nodal(n) => SolverLoad3D::Nodal(SolverNodalLoad3D {
                fx: n.fx * k,
                fy: n.fy * k,
                fz: n.fz * k,
                mx: n.mx * k,
                my: n.my * k,
                mz: n.mz * k,
                ..n.clone()
            }),
            SolverLoad3D::Distributed(d) => SolverLoad3D::Distributed(SolverDistributedLoad3D {
                q_xi: d.q_xi * k,
                q_xj: d.q_xj * k,
                q_yi: d.q_yi * k,
                q_yj: d.q_yj * k,
                q_zi: d.q_zi * k,
                q_zj: d.q_zj * k,
                ..d.clone()
            }),
            SolverLoad3D::PointOnElement(p) => SolverLoad3D::PointOnElement(SolverPointLoad3D { py: p.py * k, pz: p.pz * k, ..p.clone() }),
            o => o.clone(),
        })
        .collect()
}

fn free_dofs(m: &Model3) -> Vec<(usize, usize)> {
    let sup: HashMap<usize, bool> = m.input.supports.values().map(|s| (s.node_id, s.rrx)).collect();
    let mut v = vec![];
    for n in sorted_ids(&m.input.nodes, |n| n.id) {
        match sup.get(&n) {
            None => v.extend((0..6).map(|k| (n, k))),
            Some(false) => v.extend((3..6).map(|k| (n, k))),
            Some(true) => {}
        }
    }
    v
}
fn unit_load(dof: (usize, usize)) -> SolverLoad3D {
    let c = |k: usize| if dof.1 == k { 1.0 } else { 0.0 };
    SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: dof.0, fx: c(0), fy: c(1), fz: c(2), mx: c(3), my: c(4), mz: c(5), bw: None })
}
fn dof_value(res: &AnalysisResults3D, dof: (usize, usize)) -> f64 {
    let d = res.displacements.iter().find(|d| d.node_id == dof.0).expect("node displacement");
    [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz][dof.1]
}

/// Local nodal end forces ON the element (I: 0..6, J: 6..12).
fn local_end_forces(f: &ElementForces3D) -> [f64; 12] {
    [
        -f.n_start, f.vy_start, f.vz_start, f.mx_start, f.my_start, f.mz_start,
        f.n_end, -f.vy_end, -f.vz_end, -f.mx_end, -f.my_end, -f.mz_end,
    ]
}

fn to_local(ax: &[V3; 3], v: &V3) -> V3 {
    [dot(&ax[0], v), dot(&ax[1], v), dot(&ax[2], v)]
}
fn to_global(ax: &[V3; 3], v: &[f64]) -> V3 {
    add(&add(&scale(&ax[0], v[0]), &scale(&ax[1], v[1])), &scale(&ax[2], v[2]))
}

// ======================================================================
// Properties
// ======================================================================

proptest! {
    #![proptest_config(config(64))]

    /// (1) Global equilibrium of forces and moments about the origin.
    #[test]
    fn prop_global_equilibrium(m in model3(), raws in raw_loads3()) {
        nightly_property(&m.input, || {
            let inp = with_loads(&m, resolve3(&m, &raws, false));
            let res = solve(&inp)?;
            check_equilibrium(&inp, &res)?;
            Ok(())
        })?;
    }

    /// (2) Superposition: solve(aP1 + bP2) = a·solve(P1) + b·solve(P2).
    #[test]
    fn prop_superposition(m in model3(), r1 in raw_loads3(), r2 in raw_loads3(),
                          a in -3.0..3.0f64, b in -3.0..3.0f64) {
        nightly_property(&m.input, || {
            let l1 = resolve3(&m, &r1, false);
            let l2 = resolve3(&m, &r2, false);
            let mut l12 = scale_loads(&l1, a);
            l12.extend(scale_loads(&l2, b));
            let ids = ids(&m.input);
            let f1 = flat(&solve(&with_loads(&m, l1))?, &ids)?;
            let f2 = flat(&solve(&with_loads(&m, l2))?, &ids)?;
            let f12 = flat(&solve(&with_loads(&m, l12))?, &ids)?;
            check(compare("superposition", &f12, &Flat::lin_comb(a, &f1, b, &f2), &Flat::abs_comb(a, &f1, b, &f2), m.lchar, REL))?;
            Ok(())
        })?;
    }

    /// (3) Maxwell–Betti reciprocity + flexibility SPD consistency.
    #[test]
    fn prop_maxwell_betti(m in model3(), i in any::<Index>(), j in any::<Index>()) {
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
            prop_assert!((dij - dji).abs() <= 1e-6 * s, "reciprocity: δij={dij:e} δji={dji:e} scale {s:e}");
            prop_assert!(dij.abs() <= s * (1.0 + 1e-9), "Cauchy–Schwarz violated: |δij|={:e} sqrt(δiiδjj)={s:e}", dij.abs());
            Ok(())
        })?;
    }

    /// (4) Frame invariance under a general random 3D rotation + translation:
    /// geometry, member local-y references and nodal force/moment vectors are
    /// rotated; nodal displacements, rotations and reactions must rotate
    /// accordingly, member (local) end forces must be unchanged.
    #[test]
    fn prop_frame_invariance(m in model3(), raws in raw_loads3(),
                             ang in (0.0..std::f64::consts::TAU, 0.0..std::f64::consts::TAU, 0.0..std::f64::consts::TAU),
                             tr in v3(50.0)) {
        nightly_property(&m.input, || {
            let inp = explicit_axes(&with_loads(&m, resolve3(&m, &raws, false)));
            let r = rot_xyz(ang.0, ang.1, ang.2);
            let mut rot = inp.clone();
            for n in rot.nodes.values_mut() {
                let p = add(&matvec(&r, &[n.x, n.y, n.z]), &tr);
                n.x = p[0]; n.y = p[1]; n.z = p[2];
            }
            for e in rot.elements.values_mut() {
                if let (Some(a), Some(b), Some(c)) = (e.local_yx, e.local_yy, e.local_yz) {
                    let v = matvec(&r, &[a, b, c]);
                    e.local_yx = Some(v[0]); e.local_yy = Some(v[1]); e.local_yz = Some(v[2]);
                }
            }
            for l in rot.loads.iter_mut() {
                if let SolverLoad3D::Nodal(n) = l {
                    let f = matvec(&r, &[n.fx, n.fy, n.fz]);
                    let mo = matvec(&r, &[n.mx, n.my, n.mz]);
                    n.fx = f[0]; n.fy = f[1]; n.fz = f[2];
                    n.mx = mo[0]; n.my = mo[1]; n.mz = mo[2];
                }
            }
            let ids = ids(&inp);
            let exp = flat3(&solve(&inp)?, &ids, &|n| n, &|e| e, &r)?;
            let got = flat(&solve(&rot)?, &ids)?;
            check(compare("frame invariance", &got, &exp, &exp, m.lchar, REL))?;
            Ok(())
        })?;
    }

    /// (4b) Giving each member an explicit local-y reference equal to its
    /// engine-default local y must not change anything.
    #[test]
    fn prop_explicit_default_axes_equivalent(m in model3(), raws in raw_loads3()) {
        nightly_property(&m.input, || {
            let inp = with_loads(&m, resolve3(&m, &raws, false));
            let ex = explicit_axes(&inp);
            let ids = ids(&inp);
            let a = flat(&solve(&inp)?, &ids)?;
            let b = flat(&solve(&ex)?, &ids)?;
            check(compare("explicit default axes", &b, &a, &a, m.lchar, REL))?;
            Ok(())
        })?;
    }

    /// (5) Energy: under nodal loads fᵀu ≥ 0 and equals Σ_e f_eᵀ(T_e u_e) from
    /// the reported member end forces (= 2 × strain energy).
    #[test]
    fn prop_energy(m in model3(), raws in raw_loads3()) {
        nightly_property(&m.input, || {
            let inp = with_loads(&m, resolve3(&m, &raws, true));
            let res = solve(&inp)?;
            let d: HashMap<usize, &Displacement3D> = res.displacements.iter().map(|d| (d.node_id, d)).collect();
            let (mut w, mut wabs) = (0.0, 0.0);
            for l in &inp.loads {
                if let SolverLoad3D::Nodal(n) = l {
                    let x = d[&n.node_id];
                    for t in [n.fx * x.ux, n.fy * x.uy, n.fz * x.uz, n.mx * x.rx, n.my * x.ry, n.mz * x.rz] { w += t; wabs += t.abs(); }
                }
            }
            let ef: HashMap<usize, &ElementForces3D> = res.element_forces.iter().map(|f| (f.element_id, f)).collect();
            let (mut u2, mut uabs) = (0.0, 0.0);
            for e in inp.elements.values() {
                let f = ef[&e.id];
                let fl = local_end_forces(f);
                let (_, ax) = local_axes(&inp, e);
                let (a, b) = (d[&e.node_i], d[&e.node_j]);
                let mut ul = vec![];
                for x in [a, b] {
                    ul.extend(to_local(&ax, &[x.ux, x.uy, x.uz]));
                    ul.extend(to_local(&ax, &[x.rx, x.ry, x.rz]));
                }
                let fl: Vec<f64> = if e.elem_type == "truss" {
                    let mut v = vec![0.0; 12]; v[0] = fl[0]; v[6] = fl[6]; v
                } else { fl.to_vec() };
                for k in 0..12 { u2 += fl[k] * ul[k]; uabs += (fl[k] * ul[k]).abs(); }
            }
            prop_assert!(w >= -1e-9 * wabs, "negative external work {w:e}");
            prop_assert!((w - u2).abs() <= 1e-6 * (wabs + uabs) + 1e-15, "external work {w:e} != Σ element f·u {u2:e}");
            Ok(())
        })?;
    }

    /// (6a) Load scaling: P → kP ⇒ every response × k.
    #[test]
    fn prop_load_scaling(m in model3(), raws in raw_loads3(), lk in -3.0..3.0f64) {
        nightly_property(&m.input, || {
            let k = 10f64.powf(lk);
            let loads = resolve3(&m, &raws, false);
            let ids = ids(&m.input);
            let f1 = flat(&solve(&with_loads(&m, loads.clone()))?, &ids)?;
            let fk = flat(&solve(&with_loads(&m, scale_loads(&loads, k)))?, &ids)?;
            let exp = f1.scaled(k, k, k, k);
            check(compare("load scaling", &fk, &exp, &exp, m.lchar, REL))?;
            Ok(())
        })?;
    }

    /// (6b) E → kE (ν fixed, so G → kG) ⇒ displacements/rotations ÷ k, forces unchanged.
    #[test]
    fn prop_modulus_scaling(m in model3(), raws in raw_loads3(), lk in -2.0..2.0f64) {
        nightly_property(&m.input, || {
            let k = 10f64.powf(lk);
            let inp = with_loads(&m, resolve3(&m, &raws, false));
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

    /// (7) Node/element/support id relabelling and load-order reversal change nothing.
    #[test]
    fn prop_relabel_invariance(
        (m, np, ep, off) in model3().prop_flat_map(|m| {
            let n = m.input.nodes.len();
            let ne = m.input.elements.len();
            (Just(m), Just((0..n).collect::<Vec<_>>()).prop_shuffle(),
             Just((0..ne).collect::<Vec<_>>()).prop_shuffle(), 0usize..1000)
        }),
        raws in raw_loads3())
    {
        nightly_property(&m.input, || {
            let inp = with_loads(&m, resolve3(&m, &raws, false));
            let nmap = |n: usize| np[n - 1] * 3 + 1 + off;
            let emap = |e: usize| ep[e - 1] * 2 + 7 + off;
            let mut p = inp.clone();
            p.nodes = inp.nodes.values().map(|n| { let id = nmap(n.id); (id.to_string(), SolverNode3D { id, ..n.clone() }) }).collect();
            p.elements = inp.elements.values().map(|e| {
                let id = emap(e.id);
                (id.to_string(), SolverElement3D { id, node_i: nmap(e.node_i), node_j: nmap(e.node_j), ..e.clone() })
            }).collect();
            p.supports = inp.supports.iter().map(|(k, s)| (format!("s{k}"), SolverSupport3D { node_id: nmap(s.node_id), ..s.clone() })).collect();
            p.loads = inp.loads.iter().rev().map(|l| match l {
                SolverLoad3D::Nodal(n) => SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: nmap(n.node_id), ..n.clone() }),
                SolverLoad3D::Distributed(d) => SolverLoad3D::Distributed(SolverDistributedLoad3D { element_id: emap(d.element_id), ..d.clone() }),
                SolverLoad3D::PointOnElement(q) => SolverLoad3D::PointOnElement(SolverPointLoad3D { element_id: emap(q.element_id), ..q.clone() }),
                o => o.clone(),
            }).collect();
            let ids = ids(&inp);
            let base = flat(&solve(&inp)?, &ids)?;
            let got = flat3(&solve(&p)?, &ids, &nmap, &emap, &I3)?;
            check(compare("relabel", &got, &base, &base, m.lchar, REL))?;
            Ok(())
        })?;
    }

    /// (8) Member reversal (explicit local-y kept): local x and z flip, y stays.
    /// Member loads are mirrored (q_y(s) → q_y(L−s), q_z, q_x → −(…)(L−s),
    /// a → L−a, p_z → −p_z), releases swap ends; displacements/reactions are
    /// unchanged and end forces map as
    /// N: (S,E)→(E,S); Vy: (S,E)→(−E,−S); Vz: →(E,S); Mx: →(E,S); My: →(−E,−S); Mz: →(E,S).
    #[test]
    fn prop_member_reversal(
        (m, flip) in model3().prop_flat_map(|m| {
            let ne = m.input.elements.len();
            (Just(m), prop::collection::vec(any::<bool>(), ne))
        }),
        raws in raw_loads3())
    {
        nightly_property(&m.input, || {
            let inp = explicit_axes(&with_loads(&m, resolve3(&m, &raws, false)));
            let flipped = |id: usize| flip[id - 1];
            let mut p = inp.clone();
            for e in p.elements.values_mut() {
                if flipped(e.id) {
                    std::mem::swap(&mut e.node_i, &mut e.node_j);
                    std::mem::swap(&mut e.release_my_start, &mut e.release_my_end);
                    std::mem::swap(&mut e.release_mz_start, &mut e.release_mz_end);
                    std::mem::swap(&mut e.release_t_start, &mut e.release_t_end);
                }
            }
            for l in p.loads.iter_mut() {
                match l {
                    SolverLoad3D::Distributed(d) if flipped(d.element_id) => {
                        let len = elem_len(&inp, d.element_id);
                        let o = d.clone();
                        d.q_yi = o.q_yj; d.q_yj = o.q_yi;
                        d.q_zi = -o.q_zj; d.q_zj = -o.q_zi;
                        d.q_xi = -o.q_xj; d.q_xj = -o.q_xi;
                        if let (Some(a), Some(b)) = (o.a, o.b) { d.a = Some(len - b); d.b = Some(len - a); }
                    }
                    SolverLoad3D::PointOnElement(q) if flipped(q.element_id) => {
                        let len = elem_len(&inp, q.element_id);
                        q.a = len - q.a; q.pz = -q.pz;
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
                    f.vy_start = -o.vy_end; f.vy_end = -o.vy_start;
                    f.vz_start = o.vz_end; f.vz_end = o.vz_start;
                    f.mx_start = o.mx_end; f.mx_end = o.mx_start;
                    f.my_start = -o.my_end; f.my_end = -o.my_start;
                    f.mz_start = o.mz_end; f.mz_end = o.mz_start;
                }
            }
            let exp = flat(&base, &ids)?;
            let got = flat(&solve(&p)?, &ids)?;
            check(compare("member reversal", &got, &exp, &exp, m.lchar, REL))?;
            Ok(())
        })?;
    }

    /// (9) Section roll by +90° with Iy↔Iz (and releases, member loads)
    /// swapped describes the same physical member: displacements/reactions
    /// unchanged; end forces map as (Vy, Vz) → (Vz, −Vy), (My, Mz) → (Mz, −My).
    #[test]
    fn prop_roll_90_invariance(m in model3(), raws in raw_loads3()) {
        nightly_property(&m.input, || {
            let inp = with_loads(&m, resolve3(&m, &raws, false));
            let mut p = inp.clone();
            // one section per member so that swapping Iy/Iz is per member
            p.sections.clear();
            for e in p.elements.values_mut() {
                let s = &inp.sections[&e.section_id.to_string()];
                let id = 1000 + e.id;
                let (iy, iz) = if e.elem_type == "frame" { (s.iz, s.iy) } else { (s.iy, s.iz) };
                p.sections.insert(id.to_string(), SolverSection3D { id, iy, iz, ..s.clone() });
                e.section_id = id;
                if e.elem_type == "frame" {
                    e.roll_angle = Some(90.0);
                    // new y = old z, new z = −old y: releases about y and z swap
                    std::mem::swap(&mut e.release_my_start, &mut e.release_mz_start);
                    std::mem::swap(&mut e.release_my_end, &mut e.release_mz_end);
                }
            }
            for l in p.loads.iter_mut() {
                match l {
                    SolverLoad3D::Distributed(d) => {
                        let o = d.clone();
                        d.q_yi = o.q_zi; d.q_yj = o.q_zj;
                        d.q_zi = -o.q_yi; d.q_zj = -o.q_yj;
                    }
                    SolverLoad3D::PointOnElement(q) => { let (py, pz) = (q.py, q.pz); q.py = pz; q.pz = -py; }
                    _ => {}
                }
            }
            let ids = ids(&inp);
            let mut base = solve(&inp)?;
            let frames: BTreeSet<usize> = inp.elements.values().filter(|e| e.elem_type == "frame").map(|e| e.id).collect();
            for f in base.element_forces.iter_mut() {
                if frames.contains(&f.element_id) {
                    let o = f.clone();
                    f.vy_start = o.vz_start; f.vy_end = o.vz_end; f.vz_start = -o.vy_start; f.vz_end = -o.vy_end;
                    f.my_start = o.mz_start; f.my_end = o.mz_end; f.mz_start = -o.my_start; f.mz_end = -o.my_end;
                }
            }
            let exp = flat(&base, &ids)?;
            let got = flat(&solve(&p)?, &ids)?;
            check(compare("roll 90", &got, &exp, &exp, m.lchar, REL))?;
            Ok(())
        })?;
    }

    /// (10) Internal-force consistency: each member is in equilibrium under its
    /// end forces and member loads (local axes), and each node is in
    /// equilibrium (Σ member end forces = nodal load + reaction).
    #[test]
    fn prop_internal_force_consistency(m in model3(), raws in raw_loads3()) {
        nightly_property(&m.input, || {
            let inp = with_loads(&m, resolve3(&m, &raws, false));
            let res = solve(&inp)?;
            let ef: HashMap<usize, &ElementForces3D> = res.element_forces.iter().map(|f| (f.element_id, f)).collect();
            // member-load resultants, local: [Wx, Wy, Wz, My_I, Mz_I]
            let mut wl: HashMap<usize, [f64; 5]> = HashMap::new();
            for l in &inp.loads {
                match l {
                    SolverLoad3D::Distributed(d) => {
                        let len = elem_len(&inp, d.element_id);
                        let (a, b) = (d.a.unwrap_or(0.0), d.b.unwrap_or(len));
                        let w = wl.entry(d.element_id).or_default();
                        for (q, _) in trap(d.q_xi, d.q_xj, a, b) { w[0] += q; }
                        for (q, xc) in trap(d.q_yi, d.q_yj, a, b) { w[1] += q; w[4] += xc * q; }
                        for (q, xc) in trap(d.q_zi, d.q_zj, a, b) { w[2] += q; w[3] -= xc * q; }
                    }
                    SolverLoad3D::PointOnElement(p) => {
                        let w = wl.entry(p.element_id).or_default();
                        w[1] += p.py; w[4] += p.a * p.py;
                        w[2] += p.pz; w[3] -= p.a * p.pz;
                    }
                    _ => {}
                }
            }
            let mut fscale: f64 = 1e-9;
            for e in inp.elements.values() {
                let len = elem_len(&inp, e.id);
                let w = wl.get(&e.id).copied().unwrap_or_default();
                for v in local_end_forces(ef[&e.id]).iter().map(|x| x.abs()).chain(w[..3].iter().map(|x| x.abs())).chain(w[3..].iter().map(|x| x.abs() / len)) {
                    fscale = fscale.max(v);
                }
            }
            let mut node_sum: HashMap<usize, [f64; 6]> = HashMap::new();
            let mut node_abs: HashMap<usize, f64> = HashMap::new();
            for e in inp.elements.values() {
                let (len, ax) = local_axes(&inp, e);
                let f = local_end_forces(ef[&e.id]);
                let w = wl.get(&e.id).copied().unwrap_or_default();
                // member force scale: end forces, end moments / L, member loads
                let sc = f.iter().enumerate()
                    .fold(0.0f64, |a, (k, v)| a.max(if k % 6 >= 3 { v.abs() / len } else { v.abs() }))
                    .max(w[0].abs()).max(w[1].abs()).max(w[2].abs())
                    .max(w[3].abs() / len).max(w[4].abs() / len);
                let t = 1e-7 * sc + 1e-9 * fscale;
                let checks = [
                    ("ΣFx", f[0] + f[6] + w[0], t),
                    ("ΣFy", f[1] + f[7] + w[1], t),
                    ("ΣFz", f[2] + f[8] + w[2], t),
                    ("ΣMx", f[3] + f[9], t * len),
                    ("ΣMy_I", f[4] + f[10] - len * f[8] + w[3], t * len),
                    ("ΣMz_I", f[5] + f[11] + len * f[7] + w[4], t * len),
                ];
                if e.elem_type == "frame" {
                    for (name, v, tol) in checks {
                        prop_assert!(v.abs() <= tol, "elem {} {name} = {v:e} (tol {tol:e})", e.id);
                    }
                } else {
                    prop_assert!(checks[0].1.abs() <= t, "truss {} ΣFx = {:e}", e.id, checks[0].1);
                }
                for (nid, o) in [(e.node_i, 0usize), (e.node_j, 6usize)] {
                    let gf = to_global(&ax, &f[o..o + 3]);
                    let gm = to_global(&ax, &f[o + 3..o + 6]);
                    let acc = node_sum.entry(nid).or_default();
                    for k in 0..3 { acc[k] += gf[k]; acc[k + 3] += gm[k]; }
                    *node_abs.entry(nid).or_default() += norm(&gf) + norm(&gm) / len;
                }
            }
            let mut rhs: HashMap<usize, [f64; 6]> = HashMap::new();
            for l in &inp.loads {
                if let SolverLoad3D::Nodal(n) = l {
                    let a = rhs.entry(n.node_id).or_default();
                    for (k, v) in [n.fx, n.fy, n.fz, n.mx, n.my, n.mz].into_iter().enumerate() { a[k] += v; }
                }
            }
            for r in &res.reactions {
                let a = rhs.entry(r.node_id).or_default();
                for (k, v) in [r.fx, r.fy, r.fz, r.mx, r.my, r.mz].into_iter().enumerate() { a[k] += v; }
            }
            for (nid, sum) in &node_sum {
                let r = rhs.get(nid).copied().unwrap_or_default();
                let t = 1e-7 * (node_abs[nid] + r[0].abs() + r[1].abs() + r[2].abs()) + 1e-9 * fscale;
                for k in 0..6 {
                    let tk = if k >= 3 { t * m.lchar } else { t };
                    prop_assert!((sum[k] - r[k]).abs() <= tk,
                        "node {nid} comp {k}: Σ member end = {:e}, load+reaction = {:e}", sum[k], r[k]);
                }
            }
            Ok(())
        })?;
    }
}
