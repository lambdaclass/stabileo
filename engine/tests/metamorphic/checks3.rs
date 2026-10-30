//! The invariants, applied to one 3D case and one analysis.

use crate::ana2::Law;
use crate::ana3::{Ana3, Motion};
use crate::case::Case3;
use crate::checks2::{guarded, hash, rel_for, settle, transformed_failure, REDUCES_TO_LINEAR};
use crate::response::{Kind, Resp};
use crate::tally::{Tally, Verdict};
use dedaliano_engine::element::compute_local_axes_3d;
use dedaliano_engine::metamorphic::compare::{compare_floored, compare_with_floor, Flat, Report};
use dedaliano_engine::metamorphic::conditioning::{self, Conditioning, INCONCLUSIVE};
use dedaliano_engine::metamorphic::relabel::Relabel;
use dedaliano_engine::metamorphic::transform::Iso3;
use dedaliano_engine::metamorphic::units::Units;
use dedaliano_engine::metamorphic::Rng;
use dedaliano_engine::types::*;

/// Whether an invariant applies to an analysis at all (cells that do not
/// show as "·" in the matrix rather than as refusals).
pub fn applicable(a: &Ana3, inv: &str) -> bool {
    match inv {
        "rotation" => !false,
        "superposition" => matches!(a.law, Law::Linear | Law::Inverse),
        "reciprocity" => a.law == Law::Linear,
        "energy" => a.law == Law::Linear && a.full_static,
        "linear agreement" => REDUCES_TO_LINEAR.contains(&a.name),
        "modal orthogonality" => a.name == "modal",
        _ => true,
    }
}

pub struct Ctx<'a> {
    pub tally: &'a Tally,
    pub rng_seed: u64,
}

pub(crate) fn run(a: &Ana3, c: &Case3) -> Result<Resp, String> {
    guarded(|| {
        let r = (a.run)(c)?;
        if crate::generated::strict() {
            crate::generated::validate_3d(a.name, &r, c)?;
        }
        Ok(r)
    })
}

fn judge(res: Result<Report, String>, rel: f64) -> Verdict {
    if rel > INCONCLUSIVE {
        return Verdict::Inconclusive(rel);
    }
    match res {
        Ok(r) => Verdict::Pass(r.worst),
        Err(e) => Verdict::Fail(e),
    }
}

fn same(a: &Ana3, tc: &Case3, expected: Result<Resp, String>, cond: &Conditioning) -> Verdict {
    let expected = match expected {
        Ok(e) => e,
        Err(e) => return Verdict::Unrepresentable(e),
    };
    let c2 = match guarded(|| conditioning::of_3d(&tc.s)) {
        Ok(c) => cond.worst(&c),
        Err(_) => *cond,
    };
    let rel = rel_for(a.name, a.iter_tol, &c2);
    match run(a, tc) {
        Ok(got) => judge(compare_with_floor(&got.flat(), &expected.flat(), c2.lchar, rel, load_floor_3d(&tc.s, c2.lchar)), rel),
        Err(e) => transformed_failure(e),
    }
}

/// Magnitude of the applied loads (force units), see `load_floor_2d`.
pub fn load_floor_3d(s: &SolverInput3D, lchar: f64) -> f64 {
    let len = |id: usize| -> f64 {
        s.elements.get(&id.to_string()).and_then(|e| {
            let (a, b) = (s.nodes.get(&e.node_i.to_string())?, s.nodes.get(&e.node_j.to_string())?);
            Some(((b.x - a.x).powi(2) + (b.y - a.y).powi(2) + (b.z - a.z).powi(2)).sqrt())
        }).unwrap_or(0.0)
    };
    s.loads.iter().map(|l| match l {
        SolverLoad3D::Nodal(n) => n.fx.abs() + n.fy.abs() + n.fz.abs() + (n.mx.abs() + n.my.abs() + n.mz.abs()) / lchar,
        SolverLoad3D::Distributed(d) => [d.q_xi, d.q_xj, d.q_yi, d.q_yj, d.q_zi, d.q_zj].iter().fold(0.0f64, |a, b| a.max(b.abs())) * len(d.element_id),
        SolverLoad3D::PointOnElement(p) => p.py.abs() + p.pz.abs(),
        SolverLoad3D::Pressure(p) | SolverLoad3D::QuadPressure(p) | SolverLoad3D::Quad9Pressure(p) | SolverLoad3D::SolidShellPressure(p) | SolverLoad3D::CurvedShellPressure(p) => p.pressure.abs() * lchar * lchar,
        _ => 0.0,
    }).sum()
}

pub fn scale_loads_3d(loads: &[SolverLoad3D], k: f64) -> Vec<SolverLoad3D> {
    let u = Units { length: 1.0, force: k, time: 1.0 };
    loads
        .iter()
        .map(|l| {
            let mut l = l.clone();
            dedaliano_engine::metamorphic::units::scale_load_3d(&mut l, &u);
            match &mut l {
                SolverLoad3D::Thermal(t) => {
                    t.dt_uniform *= k;
                    t.dt_gradient_y *= k;
                    t.dt_gradient_z *= k;
                }
                SolverLoad3D::PlateThermal(t) | SolverLoad3D::QuadThermal(t) | SolverLoad3D::Quad9Thermal(t) | SolverLoad3D::CurvedShellThermal(t) => {
                    t.dt_uniform *= k;
                    t.dt_gradient *= k;
                }
                // Self-weight: scale_load_3d scaled the density by φ; with
                // length = time = 1 that is the load factor already.
                _ => {}
            }
            l
        })
        .collect()
}

fn rotation_for(a: &Ana3, rng: &mut Rng) -> Iso3 {
    let t = [rng.range(-40.0, 40.0), rng.range(-40.0, 40.0), rng.range(-40.0, 40.0)];
    match a.motion {
        Motion::Any => {
            // Alternate general rotations with axis permutations, which keep
            // every axis-aligned feature representable.
            if rng.f64() < 0.6 {
                Iso3::random(rng).translated(t)
            } else {
                Iso3::axis_permutation(1 + rng.below(23)).translated(t)
            }
        }
        Motion::AboutZ => Iso3::about_z(rng.range(0.1, 6.2)).translated(t),
        Motion::AxisPerm => Iso3::axis_permutation(1 + rng.below(23)).translated(t),
    }
}

pub fn check_case(ctx: &Ctx, c: &Case3, anas: &[Ana3], invariants: &[&str]) {
    let cond = match guarded(|| conditioning::of_3d(&c.s)) {
        Ok(k) => k,
        Err(e) => {
            for a in anas {
                for inv in invariants.iter().filter(|i| applicable(a, i)) {
                    ctx.tally.record(a.name, inv, &c.name, Verdict::Refused(format!("no conditioning estimate: {e}")));
                }
            }
            return;
        }
    };
    for a in anas {
        let base = match run(a, c) {
            Ok(b) => b,
            Err(e) => {
                for inv in invariants.iter().filter(|i| applicable(a, i)) {
                    ctx.tally.record(a.name, inv, &c.name, if crate::generated::strict() { Verdict::Fail(format!("generated baseline refused: {e}")) } else { Verdict::Refused(e.clone()) });
                }
                continue;
            }
        };
        let mut rng = Rng::new(ctx.rng_seed ^ hash(&c.name) ^ hash(a.name) ^ 0x3d);
        for &inv in invariants {
            let v = match inv {
                "rotation" => {
                    let iso = rotation_for(a, &mut rng);
                    let first = match c.iso(&iso) {
                        Ok(tc) => same(a, &tc, base.iso3(&iso), &cond),
                        Err(e) => Verdict::Unrepresentable(e),
                    };
                    // An axis permutation (about Z for gravity-bound
                    // analyses) keeps every axis-aligned feature plain.
                    let q = match a.motion {
                        Motion::AboutZ => Iso3::about_z(std::f64::consts::FRAC_PI_2 * (1 + rng.below(3)) as f64),
                        _ => Iso3::axis_permutation(1 + rng.below(23)),
                    }
                    .translated([rng.range(-40.0, 40.0), rng.range(-40.0, 40.0), rng.range(-40.0, 40.0)]);
                    settle(first, || match c.iso(&q) {
                        Ok(tc) => same(a, &tc, base.iso3(&q), &cond),
                        Err(e) => Verdict::Unrepresentable(e),
                    })
                }
                "relabel" => {
                    let seed = rng.next_u64();
                    let rl = Relabel::random_3d(&c.s, seed);
                    same(a, &c.relabel(&rl, seed), Ok(base.relabel(&rl)), &cond)
                }
                "reversal" => {
                    let mut ids: Vec<_> = c.s.elements.values().map(|e| e.id).collect();
                    ids.sort_unstable();
                    let mut flipped: std::collections::HashSet<usize> = ids.iter().copied().filter(|_| rng.f64() < 0.5).collect();
                    if crate::generated::strict() && flipped.is_empty() { flipped.insert(ids[0]); }
                    match dedaliano_engine::metamorphic::reversal::reverse_3d(&c.s, &|id| flipped.contains(&id)) {
                        Ok(s) => same(a, &Case3 { s, ..c.clone() }, if a.name == "influence line" { base.reverse_influence(&flipped, c.path.as_ref().unwrap()[1]) } else { base.reverse(&flipped, true) }, &cond),
                        Err(e) => Verdict::Unrepresentable(e.to_string()),
                    }
                }
                "units" => {
                    let (l, f) = [(1e-3, 1e3), (25.0, 1e-2), (0.3048, 4.448)][rng.below(3)];
                    let u = Units::froude(l, f);
                    same(a, &c.units(&u), Ok(base.units(&u)), &cond)
                }
                "superposition" => superposition(a, c, &base, &cond),
                "modal orthogonality" => {
                    if a.name == "modal" {
                        guarded(|| Ok(crate::modal_checks::check_3d(&c.s, &c.dens, &cond))).unwrap_or_else(Verdict::Fail)
                    } else {
                        Verdict::NotApplicable
                    }
                }
                "linear agreement" => {
                    // Analyses that reduce to the linear solve on this model
                    // (one or several stages with the full structure, no
                    // foundation, no gaps, no soil springs, t = t0, a single
                    // combination, other solver paths) must agree with it.
                    if !REDUCES_TO_LINEAR.iter().any(|n| a.name == *n) {
                        Verdict::NotApplicable
                    } else {
                        match guarded(|| Ok(crate::response::static_3d(&dedaliano_engine::solver::linear::solve_3d(&c.s)?))) {
                            Err(e) => Verdict::Refused(format!("linear: {e}")),
                            Ok(lin) => {
                                let exp = lin.common(&base);
                                let got = base.common(&exp);
                                let rel = rel_for(a.name, a.iter_tol, &cond) * 2.0;
                                judge(compare_with_floor(&got.flat(), &exp.flat(), cond.lchar, rel, load_floor_3d(&c.s, cond.lchar)), rel)
                            }
                        }
                    }
                }
                "reciprocity" => reciprocity(a, c, &cond, &mut rng),
                "energy" => energy(a, c, &cond, &mut rng),
                _ => Verdict::NotApplicable,
            };
            ctx.tally.record(a.name, inv, &c.name, v);
        }
    }
}

fn superposition(a: &Ana3, c: &Case3, base: &Resp, cond: &Conditioning) -> Verdict {
    if a.law == Law::Inverse {
        let k = 3.7;
        let rel = rel_for(a.name, a.iter_tol, cond);
        // The whole action scales: loads and prescribed displacements.
        let mut ck = c.with_loads(scale_loads_3d(&c.s.loads, k));
        for sp in ck.s.supports.values_mut() {
            for d in [&mut sp.dx, &mut sp.dy, &mut sp.dz, &mut sp.drx, &mut sp.dry, &mut sp.drz] {
                *d = d.map(|v| v * k);
            }
        }
        return match run(a, &ck) {
            Ok(r) => {
                let mut exp = base.clone();
                for it in exp.0.iter_mut() {
                    it.v.iter_mut().for_each(|x| *x /= k);
                }
                judge(compare_with_floor(&r.flat(), &exp.flat(), cond.lchar, rel, load_floor_3d(&c.s, cond.lchar) * k), rel)
            }
            Err(e) => Verdict::Fail(format!("scaled loads failed: {e}")),
        };
    }
    if a.law != Law::Linear || c.s.loads.is_empty() {
        return Verdict::NotApplicable;
    }
    let loads = &c.s.loads;
    let (la, lb): (Vec<SolverLoad3D>, Vec<SolverLoad3D>) = if loads.len() >= 2 {
        let (x, y): (Vec<_>, Vec<_>) = loads.iter().cloned().enumerate().partition(|(k, _)| k % 2 == 0);
        (x.into_iter().map(|p| p.1).collect(), y.into_iter().map(|p| p.1).collect())
    } else {
        (loads.clone(), scale_loads_3d(loads, -0.7))
    };
    let mut ab = la.clone();
    ab.extend(lb.iter().cloned());
    let k = -2.5;
    let rel = rel_for(a.name, a.iter_tol, cond) * 4.0;
    let r = (|| -> Result<(Flat, Flat, Flat, Flat, Flat), String> {
        let ra = run(a, &c.with_loads(la.clone()))?.without_stress().flat();
        let rb = run(a, &c.with_loads(lb.clone()))?.without_stress().flat();
        let rab = run(a, &c.with_loads(ab))?.without_stress().flat();
        let rk = run(a, &c.with_loads(scale_loads_3d(&la, k)))?.without_stress().flat();
        let r0 = match run(a, &c.with_loads(vec![])) {
            Ok(r) => r.without_stress().flat(),
            Err(e) if crate::generated::strict() => return Err(format!("zero-load solve: {e}")),
            Err(_) => Flat::lin_comb(0.0, &ra, 0.0, &ra),
        };
        Ok((ra, rb, rab, rk, r0))
    })();
    let (ra, rb, rab, rk, r0) = match r {
        Ok(x) => x,
        Err(e) if crate::generated::strict() => return Verdict::Fail(format!("load subset: {e}")),
        Err(e) => return Verdict::Refused(format!("load subset: {e}")),
    };
    let da = Flat::lin_comb(1.0, &ra, -1.0, &r0);
    let db = Flat::lin_comb(1.0, &rb, -1.0, &r0);
    let exp_ab = Flat::lin_comb(1.0, &Flat::lin_comb(1.0, &da, 1.0, &db), 1.0, &r0);
    let scale = Flat::lin_comb(1.0, &Flat::abs_comb(1.0, &ra, 1.0, &rb), 2.0, &Flat::abs_comb(1.0, &r0, 0.0, &r0));
    let floor = load_floor_3d(&c.s, cond.lchar) * (1.0 + k.abs());
    if let v @ Verdict::Fail(_) = judge(compare_floored(&rab, &exp_ab, &scale, cond.lchar, rel, floor).map_err(|e| format!("R(A+B) ≠ R(A)+R(B)−R(∅): {e}")), rel) {
        return v;
    }
    let exp_k = Flat::lin_comb(k, &da, 1.0, &r0);
    let scale_k = Flat::abs_comb(k, &ra, 1.0 + k.abs(), &r0);
    judge(compare_floored(&rk, &exp_k, &scale_k, cond.lchar, rel, floor).map_err(|e| format!("R(kA) ≠ k·R(A): {e}")), rel)
}

fn free_nodes(c: &Case3) -> Vec<usize> {
    let sup: std::collections::HashSet<usize> = c.s.supports.values().map(|s| s.node_id).collect();
    let mut v: Vec<usize> = c.s.nodes.values().map(|n| n.id).filter(|id| !sup.contains(id)).collect();
    v.sort_unstable();
    v
}

fn unit_dir(rng: &mut Rng) -> [f64; 3] {
    let z = rng.range(-1.0, 1.0);
    let t = rng.range(0.0, std::f64::consts::TAU);
    let r = (1.0 - z * z).sqrt();
    [r * t.cos(), r * t.sin(), z]
}

fn reciprocity(a: &Ana3, c: &Case3, cond: &Conditioning, rng: &mut Rng) -> Verdict {
    if a.law != Law::Linear {
        return Verdict::NotApplicable;
    }
    let nodes = free_nodes(c);
    if nodes.is_empty() {
        return Verdict::NotApplicable;
    }
    let (na, nb) = (nodes[rng.below(nodes.len())], nodes[rng.below(nodes.len())]);
    let (da, db) = (unit_dir(rng), unit_dir(rng));
    let unit = |n: usize, d: [f64; 3]| vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: n, fx: d[0], fy: d[1], fz: d[2], mx: 0.0, my: 0.0, mz: 0.0, bw: None })];
    let mut ca = c.with_loads(unit(na, da));
    ca.probes = vec![nb, na];
    let mut cb = c.with_loads(unit(nb, db));
    cb.probes = vec![na, nb];
    let mut c0 = c.with_loads(vec![]);
    c0.probes = vec![nb, na];
    let (ra, rb) = match (run(a, &ca), run(a, &cb)) {
        (Ok(x), Ok(y)) => (x, y),
        (Err(e), _) | (_, Err(e)) => return Verdict::Refused(e),
    };
    let r0 = match run(a, &c0) {
        Ok(r) => Some(r),
        Err(e) if crate::generated::strict() => return Verdict::Fail(format!("zero-load solve: {e}")),
        Err(_) => None,
    };
    let base_at = |n: usize, tag: &str| r0.as_ref().and_then(|r| r.node_vec(n, tag)).unwrap_or(vec![0.0; 3]);
    let is_t = |tag: &str| tag == "u" || tag.starts_with("H_") || tag.starts_with("u_t");
    let dot = |x: &[f64], y: &[f64; 3]| x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
    let mut pairs = Vec::new();
    for it in ra.0.iter().filter(|i| i.node == Some(nb) && matches!(i.kind, Kind::V3(_)) && is_t(&i.tag)) {
        let Some(vb) = rb.node_vec(na, &it.tag) else { continue };
        let (b0, a0) = (base_at(nb, &it.tag), base_at(na, &it.tag));
        let dab = dot(&it.v, &db) - dot(&b0, &db);
        let dba = dot(&vb, &da) - dot(&a0, &da);
        pairs.push((it.tag.clone(), dab, dba));
    }
    let mut scale: f64 = 0.0;
    for r in [&ra, &rb] {
        for it in r.0.iter().filter(|i| matches!(i.kind, Kind::V3(_)) && is_t(&i.tag)) {
            scale = it.v.iter().fold(scale, |s, x| s.max(x.abs()));
        }
    }
    if pairs.is_empty() {
        return Verdict::NotApplicable;
    }
    let rel = rel_for(a.name, a.iter_tol, cond) * 4.0;
    if rel > INCONCLUSIVE {
        return Verdict::Inconclusive(rel);
    }
    let mut worst: f64 = 0.0;
    for (tag, dab, dba) in pairs {
        let tol = rel * scale + f64::MIN_POSITIVE;
        if !((dab - dba).abs() <= tol) {
            return Verdict::Fail(format!("{tag}: δ(n{nb}←n{na}) = {dab:.10e} vs δ(n{na}←n{nb}) = {dba:.10e}, |diff| {:.3e} > tol {tol:.3e}", (dab - dba).abs()));
        }
        worst = worst.max((dab - dba).abs() / tol);
    }
    Verdict::Pass(worst)
}

/// Clapeyron (see checks2::energy) for frame/truss models.
fn energy(a: &Ana3, c: &Case3, cond: &Conditioning, rng: &mut Rng) -> Verdict {
    if a.law != Law::Linear || !a.full_static {
        return Verdict::NotApplicable;
    }
    let s0 = &c.s;
    if !s0.connectors.is_empty() || !s0.plates.is_empty() || !s0.quads.is_empty() || !s0.quad9s.is_empty() || !s0.solid_shells.is_empty() || !s0.curved_shells.is_empty() {
        return Verdict::Unrepresentable("connector / shell energy is not reported".into());
    }
    if s0.sections.values().any(|x| x.cw.is_some()) {
        return Verdict::Unrepresentable("warping energy is not reported".into());
    }
    if s0.supports.values().any(|x| x.is_inclined.unwrap_or(false) && [x.kx, x.ky, x.kz].iter().any(|k| k.unwrap_or(0.0) != 0.0)) {
        return Verdict::Unrepresentable("springs on an inclined support".into());
    }
    let mut s = s0.clone();
    for sp in s.supports.values_mut() {
        (sp.dx, sp.dy, sp.dz, sp.drx, sp.dry, sp.drz) = (None, None, None, None, None, None);
    }
    let nodes = free_nodes(c);
    if nodes.is_empty() {
        return Verdict::NotApplicable;
    }
    let frames: std::collections::HashSet<usize> = s.elements.values().filter(|e| e.elem_type == "frame").flat_map(|e| [e.node_i, e.node_j]).collect();
    let l = cond.lchar;
    s.loads = nodes
        .iter()
        .map(|&n| {
            let m = if frames.contains(&n) { l } else { 0.0 };
            SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: n, fx: rng.range(-10.0, 10.0), fy: rng.range(-10.0, 10.0), fz: rng.range(-10.0, 10.0),
                mx: m * rng.range(-10.0, 10.0), my: m * rng.range(-10.0, 10.0), mz: m * rng.range(-10.0, 10.0), bw: None,
            })
        })
        .collect();
    let cc = Case3 { s: s.clone(), ..c.clone() };
    let r = match run(a, &cc) {
        Ok(r) => r,
        Err(e) => return Verdict::Refused(e),
    };
    let u = |n: usize| -> [f64; 6] {
        let t = r.node_vec(n, "u").unwrap_or(vec![0.0; 3]);
        let w = r.node_vec(n, "r").unwrap_or(vec![0.0; 3]);
        [t[0], t[1], t[2], w[0], w[1], w[2]]
    };
    let (mut w, mut wabs) = (0.0, 0.0);
    for ld in &s.loads {
        if let SolverLoad3D::Nodal(p) = ld {
            let d = u(p.node_id);
            let t = p.fx * d[0] + p.fy * d[1] + p.fz * d[2] + p.mx * d[3] + p.my * d[4] + p.mz * d[5];
            w += t;
            wabs += t.abs();
        }
    }
    let (mut e2, mut eabs) = (0.0, 0.0);
    let left = s.left_hand.unwrap_or(false);
    for el in s.elements.values() {
        let (ni, nj) = (&s.nodes[&el.node_i.to_string()], &s.nodes[&el.node_j.to_string()]);
        let (ex, ey, ez) = compute_local_axes_3d(ni.x, ni.y, ni.z, nj.x, nj.y, nj.z, el.local_yx, el.local_yy, el.local_yz, el.roll_angle, left);
        let loc = |v: [f64; 3]| [v[0] * ex[0] + v[1] * ex[1] + v[2] * ex[2], v[0] * ey[0] + v[1] * ey[1] + v[2] * ey[2], v[0] * ez[0] + v[1] * ez[1] + v[2] * ez[2]];
        let (di, dj) = (u(el.node_i), u(el.node_j));
        let (ti, ri, tj, rj) = (loc([di[0], di[1], di[2]]), loc([di[3], di[4], di[5]]), loc([dj[0], dj[1], dj[2]]), loc([dj[3], dj[4], dj[5]]));
        let get = |tag: &str| r.0.iter().find(|i| i.elem == Some(el.id) && i.tag == tag).map(|i| i.v.clone());
        let (Some(n), Some(v), Some(m)) = (get("N"), get("V"), get("M")) else { return Verdict::Refused("no member forces".into()) };
        // v = [vyS, vyE, vzS, vzE], m = [mxS, mxE, myS, myE, mzS, mzE];
        // local forces ON the element: [−nS, vyS, vzS, mxS, myS, mzS, nE, −vyE, −vzE, −mxE, −myE, −mzE].
        let f = [-n[0], v[0], v[2], m[0], m[2], m[4], n[1], -v[1], -v[3], -m[1], -m[3], -m[5]];
        let d = [ti[0], ti[1], ti[2], ri[0], ri[1], ri[2], tj[0], tj[1], tj[2], rj[0], rj[1], rj[2]];
        for k in 0..12 {
            e2 += f[k] * d[k];
            eabs += (f[k] * d[k]).abs();
        }
    }
    for sp in s.supports.values() {
        let d = u(sp.node_id);
        // Every spring counts, restraint flag or not: a positive spring frees
        // its DOF even when the flag is set (DofNumbering::build_3d), and on a
        // DOF that stays fixed d = 0 adds nothing. Skipping flagged DOFs left
        // out the energy of a spring the engine applies.
        let ks = [sp.kx, sp.ky, sp.kz, sp.krx, sp.kry, sp.krz];
        for k in 0..6 {
            let t = ks[k].unwrap_or(0.0) * d[k] * d[k];
            e2 += t;
            eabs += t.abs();
        }
    }
    let rel = rel_for(a.name, a.iter_tol, cond) * 4.0;
    if rel > INCONCLUSIVE {
        return Verdict::Inconclusive(rel);
    }
    let tol = rel * (wabs + eabs) + f64::MIN_POSITIVE;
    if (w - e2).abs() <= tol {
        Verdict::Pass((w - e2).abs() / tol)
    } else {
        Verdict::Fail(format!("ΣP·u = {w:.10e} but Σ f_e·u_e + springs = {e2:.10e}, |diff| {:.3e} > tol {tol:.3e}", (w - e2).abs()))
    }
}
