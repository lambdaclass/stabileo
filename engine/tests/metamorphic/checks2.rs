//! The invariants, applied to one 2D case and one analysis.

use crate::ana2::{Ana2, Law};
use crate::case::Case2;
use crate::response::{Kind, Resp};
use crate::tally::{Tally, Verdict};
use dedaliano_engine::metamorphic::compare::{compare_floored, compare_with_floor, Flat};
use dedaliano_engine::metamorphic::conditioning::{self, Conditioning, INCONCLUSIVE};
use dedaliano_engine::metamorphic::relabel::Relabel;
use dedaliano_engine::metamorphic::transform::Iso2;
use dedaliano_engine::metamorphic::units::Units;
use dedaliano_engine::metamorphic::Rng;
use dedaliano_engine::types::*;
use std::panic::{catch_unwind, AssertUnwindSafe};

pub fn guarded<T>(f: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    match catch_unwind(AssertUnwindSafe(f)) {
        Ok(r) => r,
        Err(p) => Err(format!("PANIC: {}", p.downcast_ref::<String>().cloned().or_else(|| p.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_default())),
    }
}

/// Relative tolerance for comparing two runs of `ana` on models with the
/// given conditioning (see conditioning.rs): n·ε·κ·geom, plus 20× the
/// iteration tolerance (two converged iterates of a contraction with ratio
/// ≤ 0.9 are each within 10·τ of the fixed point), times the step count for
/// a time-stepping analysis (per-step errors accumulate without
/// amplification in an unconditionally stable scheme).
pub fn rel_for(ana_name: &str, iter_tol: f64, c: &Conditioning) -> f64 {
    if crate::generated::strict() && (ana_name.starts_with("linear") || REDUCES_TO_LINEAR.contains(&ana_name) || ana_name.contains("time history") || ana_name == "harmonic" || ana_name == "Winkler (active)") {
        return 2.5e-10;
    }
    let steps = if ana_name.contains("time history") { 60.0 } else { 1.0 };
    (c.rel() * steps + 20.0 * iter_tol).max(64.0 * f64::EPSILON)
}

fn run(a: &Ana2, c: &Case2) -> Result<Resp, String> {
    guarded(|| {
        let r = (a.run)(c)?;
        if crate::generated::strict() {
            crate::generated::validate_2d(a.name, &r, c)?;
        }
        Ok(r)
    })
}

fn judge(res: Result<dedaliano_engine::metamorphic::compare::Report, String>, rel: f64) -> Verdict {
    if rel > INCONCLUSIVE {
        return Verdict::Inconclusive(rel);
    }
    match res {
        Ok(r) => Verdict::Pass(r.worst),
        Err(e) => Verdict::Fail(e),
    }
}

/// Run `a` on the transformed case and compare with `expected`.
fn same(a: &Ana2, tc: &Case2, expected: Result<Resp, String>, cond: &Conditioning) -> Verdict {
    let expected = match expected {
        Ok(e) => e,
        Err(e) => return Verdict::Unrepresentable(e),
    };
    let c2 = match guarded(|| conditioning::of_2d(&tc.s)) {
        Ok(c) => cond.worst(&c),
        Err(_) => *cond,
    };
    let rel = rel_for(a.name, a.iter_tol, &c2);
    match run(a, tc) {
        Ok(got) => judge(compare_with_floor(&got.flat(), &expected.flat(), c2.lchar, rel, load_floor_2d(&tc.s, c2.lchar)), rel),
        Err(e) => transformed_failure(e),
    }
}

/// The original solved and its transformed copy did not. A refusal that
/// names a feature the transform introduced (a rotated roller becomes an
/// inclined support, which some analyses refuse by name) is a documented
/// limitation; anything else is a violation.
pub fn transformed_failure(e: String) -> Verdict {
    let l = e.to_lowercase();
    if !crate::generated::strict() && l.contains("inclined support") && ["not supported", "not yet supported", "unsupported", "does not support"].iter().any(|k| l.contains(k)) {
        Verdict::Refused(format!("transformed model: {e}"))
    } else {
        Verdict::Fail(format!("original solved but transformed model failed: {e}"))
    }
}

pub fn settle(first: Verdict, retry: impl FnOnce() -> Verdict) -> Verdict {
    match first {
        Verdict::Refused(_) | Verdict::Unrepresentable(_) => match retry() {
            v @ (Verdict::Pass(_) | Verdict::Fail(_) | Verdict::Inconclusive(_)) => v,
            _ => first,
        },
        v => v,
    }
}

/// Analyses that must reproduce the linear static solution on any model they
/// accept (see the "linear agreement" invariant).
pub const REDUCES_TO_LINEAR: &[&str] = &[
    "linear (dense reference)", "linear (sparse path)", "linear (PCG)", "constrained", "certified linear", "load combinations",
    "staged (one stage)", "staged (loads in two stages)", "Winkler (no foundation)", "contact (no gaps)", "SSI (no soil springs)",
    "creep & shrinkage (t = t0)",
];

/// Whether an invariant applies to an analysis at all (cells that do not
/// show as "·" in the matrix rather than as refusals).
pub fn applicable(a: &Ana2, inv: &str) -> bool {
    match inv {
        "rotation" => !a.axis_bound,
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

fn scale_loads_2d(loads: &[SolverLoad], k: f64) -> Vec<SolverLoad> {
    let u = Units { length: 1.0, force: k, time: 1.0 };
    loads
        .iter()
        .map(|l| {
            let mut l = l.clone();
            dedaliano_engine::metamorphic::units::scale_load_2d(&mut l, &u);
            if let SolverLoad::Thermal(t) = &mut l {
                t.dt_uniform *= k;
                t.dt_gradient *= k;
            }
            l
        })
        .collect()
}

pub fn check_case(ctx: &Ctx, c: &Case2, anas: &[Ana2], invariants: &[&str]) {
    let cond = match guarded(|| conditioning::of_2d(&c.s)) {
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
        let mut rng = Rng::new(ctx.rng_seed ^ hash(&c.name) ^ hash(a.name));
        for &inv in invariants {
            let v = match inv {
                "rotation" => {
                    if a.axis_bound {
                        Verdict::NotApplicable
                    } else {
                        let iso = Iso2::rotation(rng.range(0.1, 6.2)).translated(rng.range(-50.0, 50.0), rng.range(-50.0, 50.0));
                        let first = match c.iso(&iso) {
                            Ok(tc) => same(a, &tc, base.iso2(&iso), &cond),
                            Err(e) => Verdict::Unrepresentable(e),
                        };
                        // A quarter turn keeps rollers rollers.
                        let q = Iso2::rotation(std::f64::consts::FRAC_PI_2 * (1 + rng.below(3)) as f64).translated(rng.range(-50.0, 50.0), rng.range(-50.0, 50.0));
                        settle(first, || match c.iso(&q) {
                            Ok(tc) => same(a, &tc, base.iso2(&q), &cond),
                            Err(e) => Verdict::Unrepresentable(e),
                        })
                    }
                }
                "mirror" => {
                    let iso = if a.axis_bound {
                        let mut m = Iso2::mirror_x();
                        m.t = [rng.range(-50.0, 50.0), rng.range(-5.0, 5.0)];
                        m
                    } else {
                        Iso2::mirror_line(rng.range(0.0, 3.1)).translated(rng.range(-50.0, 50.0), rng.range(-50.0, 50.0))
                    };
                    let first = match c.iso(&iso) {
                        Ok(tc) => same(a, &tc, base.iso2(&iso), &cond),
                        Err(e) => Verdict::Unrepresentable(e),
                    };
                    let mut q = Iso2::mirror_x();
                    q.t = [rng.range(-50.0, 50.0), rng.range(-5.0, 5.0)];
                    settle(first, || match c.iso(&q) {
                        Ok(tc) => same(a, &tc, base.iso2(&q), &cond),
                        Err(e) => Verdict::Unrepresentable(e),
                    })
                }
                "relabel" => {
                    let seed = rng.next_u64();
                    let rl = Relabel::random_2d(&c.s, seed);
                    same(a, &c.relabel(&rl, seed), Ok(base.relabel(&rl)), &cond)
                }
                "reversal" => {
                    let mut ids: Vec<_> = c.s.elements.values().map(|e| e.id).collect();
                    ids.sort_unstable();
                    let mut flipped: std::collections::HashSet<usize> = ids.iter().copied().filter(|_| rng.f64() < 0.5).collect();
                    if crate::generated::strict() && flipped.is_empty() { flipped.insert(ids[0]); }
                    let tc = Case2 { s: dedaliano_engine::metamorphic::reversal::reverse_2d(&c.s, &|id| flipped.contains(&id)), ..c.clone() };
                    same(a, &tc, if a.name == "influence line" { base.reverse_influence(&flipped, c.path.as_ref().unwrap()[1]) } else { base.reverse(&flipped, false) }, &cond)
                }
                "units" => {
                    let (l, f) = [(1e-3, 1e3), (25.0, 1e-2), (0.3048, 4.448)][rng.below(3)];
                    let u = Units::froude(l, f);
                    same(a, &c.units(&u), Ok(base.units(&u)), &cond)
                }
                "superposition" => superposition(a, c, &base, &cond),
                "modal orthogonality" => {
                    if a.name == "modal" {
                        guarded(|| Ok(crate::modal_checks::check_2d(&c.s, &c.dens, &cond))).unwrap_or_else(Verdict::Fail)
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
                        match guarded(|| Ok(crate::response::static_2d(&dedaliano_engine::solver::linear::solve_2d(&c.s)?))) {
                            Err(e) => Verdict::Refused(format!("linear: {e}")),
                            Ok(lin) => {
                                let exp = lin.common(&base);
                                let got = base.common(&exp);
                                let rel = rel_for(a.name, a.iter_tol, &cond) * 2.0;
                                judge(compare_with_floor(&got.flat(), &exp.flat(), cond.lchar, rel, crate::checks2::load_floor_2d(&c.s, cond.lchar)), rel)
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

/// Magnitude of the applied loads (force units): Σ|F| + Σ|M|/L + Σ|q|·L_e.
pub fn load_floor_2d(s: &SolverInput, lchar: f64) -> f64 {
    let len = |id: usize| -> f64 {
        s.elements.get(&id.to_string()).and_then(|e| {
            let (a, b) = (s.nodes.get(&e.node_i.to_string())?, s.nodes.get(&e.node_j.to_string())?);
            Some(((b.x - a.x).powi(2) + (b.z - a.z).powi(2)).sqrt())
        }).unwrap_or(0.0)
    };
    s.loads.iter().map(|l| match l {
        SolverLoad::Nodal(n) => n.fx.abs() + n.fz.abs() + n.my.abs() / lchar,
        SolverLoad::Distributed(d) => d.q_i.abs().max(d.q_j.abs()) * len(d.element_id),
        SolverLoad::PointOnElement(p) => p.p.abs() + p.px.unwrap_or(0.0).abs() + p.my.unwrap_or(0.0).abs() / lchar,
        SolverLoad::AxialDistributed(d) => d.q_i.abs().max(d.q_j.abs()) * len(d.element_id),
        SolverLoad::Thermal(_) => 0.0,
    }).sum()
}

pub fn hash(s: &str) -> u64 {
    s.bytes().fold(0xcbf2_9ce4_8422_2325u64, |h, b| (h ^ b as u64).wrapping_mul(0x100_0000_01b3))
}

/// Linear analyses: R(A+B) − R(∅) = (R(A) − R(∅)) + (R(B) − R(∅)) and
/// R(k·A) − R(∅) = k·(R(A) − R(∅)). R(∅) carries settlements and other
/// load-independent actions.
fn superposition(a: &Ana2, c: &Case2, base: &Resp, cond: &Conditioning) -> Verdict {
    match a.law {
        Law::Linear => {}
        Law::Inverse => return inverse_law(a, c, base, cond),
        _ => return Verdict::NotApplicable,
    }
    let loads = &c.s.loads;
    if loads.is_empty() {
        return Verdict::NotApplicable;
    }
    let (la, lb): (Vec<SolverLoad>, Vec<SolverLoad>) = if loads.len() >= 2 {
        let (x, y): (Vec<_>, Vec<_>) = loads.iter().cloned().enumerate().partition(|(k, _)| k % 2 == 0);
        (x.into_iter().map(|p| p.1).collect(), y.into_iter().map(|p| p.1).collect())
    } else {
        (loads.clone(), scale_loads_2d(loads, -0.7))
    };
    let mut ab = la.clone();
    ab.extend(lb.iter().cloned());
    let k = -2.5;
    let rel = rel_for(a.name, a.iter_tol, cond) * 4.0;
    let r = (|| -> Result<(Flat, Flat, Flat, Flat, Flat), String> {
        let ra = run(a, &c.with_loads(la.clone()))?.without_stress().flat();
        let rb = run(a, &c.with_loads(lb.clone()))?.without_stress().flat();
        let rab = run(a, &c.with_loads(ab))?.without_stress().flat();
        let rk = run(a, &c.with_loads(scale_loads_2d(&la, k)))?.without_stress().flat();
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
    let sum = Flat::lin_comb(1.0, &da, 1.0, &db);
    let exp_ab = Flat::lin_comb(1.0, &sum, 1.0, &r0);
    let scale = Flat::lin_comb(1.0, &Flat::abs_comb(1.0, &ra, 1.0, &rb), 2.0, &Flat::abs_comb(1.0, &r0, 0.0, &r0));
    let floor = load_floor_2d(&c.s, cond.lchar) * (1.0 + k.abs());
    if let v @ Verdict::Fail(_) = judge(compare_floored(&rab, &exp_ab, &scale, cond.lchar, rel, floor).map_err(|e| format!("R(A+B) ≠ R(A)+R(B)−R(∅): {e}")), rel) {
        return v;
    }
    let exp_k = Flat::lin_comb(k, &da, 1.0, &r0);
    let scale_k = Flat::abs_comb(k, &ra, 1.0 + k.abs(), &r0);
    judge(compare_floored(&rk, &exp_k, &scale_k, cond.lchar, rel, floor).map_err(|e| format!("R(kA) ≠ k·R(A): {e}")), rel)
}

/// Load factors: loads × k ⇒ factor / k (k > 0).
fn inverse_law(a: &Ana2, c: &Case2, base: &Resp, cond: &Conditioning) -> Verdict {
    let k = 3.7;
    let rel = rel_for(a.name, a.iter_tol, cond);
    // The whole action scales: loads and prescribed displacements.
    let mut ck = c.with_loads(scale_loads_2d(&c.s.loads, k));
    for sp in ck.s.supports.values_mut() {
        (sp.dx, sp.dz, sp.dry) = (sp.dx.map(|v| v * k), sp.dz.map(|v| v * k), sp.dry.map(|v| v * k));
    }
    match run(a, &ck) {
        Ok(r) => {
            let mut exp = base.clone();
            for it in exp.0.iter_mut() {
                it.v.iter_mut().for_each(|x| *x /= k);
            }
            judge(compare_with_floor(&r.flat(), &exp.flat(), cond.lchar, rel, load_floor_2d(&c.s, cond.lchar) * k), rel)
        }
        Err(e) => Verdict::Fail(format!("scaled loads failed: {e}")),
    }
}

fn free_nodes(c: &Case2) -> Vec<usize> {
    let sup: std::collections::HashSet<usize> = c.s.supports.values().filter(|s| s.support_type != "spring").map(|s| s.node_id).collect();
    let mut v: Vec<usize> = c.s.nodes.values().map(|n| n.id).filter(|id| !sup.contains(id)).collect();
    v.sort_unstable();
    v
}

/// Maxwell–Betti: the translation at b along d_b under a unit force at a
/// along d_a equals the translation at a along d_a under a unit force at b
/// along d_b. Responses minus R(∅).
fn reciprocity(a: &Ana2, c: &Case2, cond: &Conditioning, rng: &mut Rng) -> Verdict {
    if a.law != Law::Linear {
        return Verdict::NotApplicable;
    }
    let nodes = free_nodes(c);
    if nodes.is_empty() {
        return Verdict::NotApplicable;
    }
    let (na, nb) = (nodes[rng.below(nodes.len())], nodes[rng.below(nodes.len())]);
    let (ta, tb) = (rng.range(0.0, 6.28), rng.range(0.0, 6.28));
    let (da, db) = ([ta.cos(), ta.sin()], [tb.cos(), tb.sin()]);
    let unit = |n: usize, d: [f64; 2]| vec![SolverLoad::Nodal(SolverNodalLoad { node_id: n, fx: d[0], fz: d[1], my: 0.0 })];
    let mut ca = c.with_loads(unit(na, da));
    ca.probes = vec![nb, na];
    let mut cb = c.with_loads(unit(nb, db));
    cb.probes = vec![na, nb];
    let mut c0 = c.with_loads(vec![]);
    let r = (|| -> Result<(Resp, Resp, Option<Resp>), String> {
        let ra = run(a, &ca)?;
        let rb = run(a, &cb)?;
        c0.probes = vec![nb, na];
        let r0a = match run(a, &c0) {
            Ok(r) => Some(r),
            Err(e) if crate::generated::strict() => return Err(format!("zero-load solve: {e}")),
            Err(_) => None,
        };
        Ok((ra, rb, r0a))
    })();
    let (ra, rb, r0) = match r {
        Ok(x) => x,
        Err(e) if crate::generated::strict() => return Verdict::Fail(e),
        Err(e) => return Verdict::Refused(e),
    };
    // Settlement baseline: only matters for static analyses; dynamic ones
    // here have none (zero loads give zero response).
    let base_at = |n: usize, tag: &str| r0.as_ref().and_then(|r| r.node_vec(n, tag)).unwrap_or(vec![0.0, 0.0]);
    let mut worst: f64 = 0.0;
    let mut scale: f64 = 0.0;
    let mut pairs = Vec::new();
    for it in ra.0.iter().filter(|i| i.node == Some(nb) && matches!(i.kind, Kind::V2(_)) && (i.tag == "u" || i.tag.starts_with("H_") || i.tag.starts_with("u_t"))) {
        let Some(vb) = rb.node_vec(na, &it.tag) else { continue };
        let b0 = base_at(nb, &it.tag);
        let a0 = base_at(na, &it.tag);
        let dab = (it.v[0] - b0[0]) * db[0] + (it.v[1] - b0[1]) * db[1];
        let dba = (vb[0] - a0[0]) * da[0] + (vb[1] - a0[1]) * da[1];
        pairs.push((it.tag.clone(), dab, dba));
    }
    for r in [&ra, &rb] {
        for it in r.0.iter().filter(|i| matches!(i.kind, Kind::V2(_)) && (i.tag == "u" || i.tag.starts_with("H_") || i.tag.starts_with("u_t"))) {
            scale = scale.max(it.v[0].abs()).max(it.v[1].abs());
        }
    }
    if pairs.is_empty() {
        return Verdict::NotApplicable;
    }
    let rel = rel_for(a.name, a.iter_tol, cond) * 4.0;
    if rel > INCONCLUSIVE {
        return Verdict::Inconclusive(rel);
    }
    for (tag, dab, dba) in pairs {
        let tol = rel * scale + f64::MIN_POSITIVE;
        if !((dab - dba).abs() <= tol) {
            return Verdict::Fail(format!("{tag}: δ(n{nb}←n{na}) = {dab:.10e} vs δ(n{na}←n{nb}) = {dba:.10e}, |diff| {:.3e} > tol {tol:.3e}", (dab - dba).abs()));
        }
        worst = worst.max((dab - dba).abs() / tol);
    }
    Verdict::Pass(worst)
}

/// Clapeyron: under nodal loads only, Σ P·u = Σ_e f_e·u_e (member end forces
/// in member axes) + Σ springs uᵀ·K·u — the work of the loads equals twice
/// the strain energy recovered from the reported member forces.
fn energy(a: &Ana2, c: &Case2, cond: &Conditioning, rng: &mut Rng) -> Verdict {
    if a.law != Law::Linear || !a.full_static {
        return Verdict::NotApplicable;
    }
    if !c.s.connectors.is_empty() {
        return Verdict::Unrepresentable("connector energy is not reported".into());
    }
    let mut s = c.s.clone();
    for sp in s.supports.values_mut() {
        (sp.dx, sp.dz, sp.dry) = (None, None, None);
    }
    let nodes = free_nodes(c);
    if nodes.is_empty() {
        return Verdict::NotApplicable;
    }
    let lscale = cond.lchar;
    // Moments only where an unhinged frame end gives the rotation stiffness.
    let rot: std::collections::HashSet<usize> = s
        .elements
        .values()
        .filter(|e| e.elem_type == "frame")
        .flat_map(|e| [(!e.hinge_start).then_some(e.node_i), (!e.hinge_end).then_some(e.node_j)])
        .flatten()
        .collect();
    s.loads = nodes
        .iter()
        .map(|&n| {
            let m = if rot.contains(&n) { lscale } else { 0.0 };
            SolverLoad::Nodal(SolverNodalLoad { node_id: n, fx: rng.range(-10.0, 10.0), fz: rng.range(-10.0, 10.0), my: rng.range(-10.0, 10.0) * m })
        })
        .collect();
    let cc = Case2 { s: s.clone(), ..c.clone() };
    let r = match run(a, &cc) {
        Ok(r) => r,
        Err(e) => return Verdict::Refused(e),
    };
    let u = |n: usize| -> [f64; 3] {
        let t = r.node_vec(n, "u").unwrap_or(vec![0.0, 0.0]);
        let ry = r.node_vec(n, "ry").map_or(0.0, |v| v[0]);
        [t[0], t[1], ry]
    };
    let (mut w, mut wabs) = (0.0, 0.0);
    for l in &s.loads {
        if let SolverLoad::Nodal(p) = l {
            let d = u(p.node_id);
            let t = p.fx * d[0] + p.fz * d[1] + p.my * d[2];
            w += t;
            wabs += t.abs();
        }
    }
    let (mut e2, mut eabs) = (0.0, 0.0);
    for el in s.elements.values() {
        let (ni, nj) = (&s.nodes[&el.node_i.to_string()], &s.nodes[&el.node_j.to_string()]);
        let l = ((nj.x - ni.x).powi(2) + (nj.z - ni.z).powi(2)).sqrt();
        let (cs, sn) = ((nj.x - ni.x) / l, (nj.z - ni.z) / l);
        let loc = |d: [f64; 3]| [cs * d[0] + sn * d[1], -sn * d[0] + cs * d[1], d[2]];
        let (ui, uj) = (loc(u(el.node_i)), loc(u(el.node_j)));
        let get = |tag: &str| r.0.iter().find(|i| i.elem == Some(el.id) && i.tag == tag).map(|i| i.v.clone());
        let (Some(n), Some(v), Some(m)) = (get("N"), get("V"), get("M")) else { return Verdict::Refused("no member forces".into()) };
        // Local nodal forces ON the element: [−nS, vS, mS, nE, −vE, −mE].
        let f = [-n[0], v[0], m[0], n[1], -v[1], -m[1]];
        let d = [ui[0], ui[1], ui[2], uj[0], uj[1], uj[2]];
        for k in 0..6 {
            e2 += f[k] * d[k];
            eabs += (f[k] * d[k]).abs();
        }
    }
    for sp in s.supports.values() {
        let d = u(sp.node_id);
        let (kx, ky, kz) = (sp.kx.unwrap_or(0.0), sp.ky.unwrap_or(0.0), sp.kz.unwrap_or(0.0));
        let restrained = |k: usize| match sp.support_type.as_str() {
            "fixed" => true,
            "pinned" => k < 2,
            "rollerX" | "inclinedRoller" => k == 1,
            "rollerY" | "rollerZ" => k == 0,
            "guidedX" => k >= 1,
            "guidedY" | "guidedZ" => k != 1,
            _ => false,
        };
        let t = if sp.support_type == "spring" {
            let al = sp.angle.unwrap_or(0.0);
            let (ca, sa) = (al.cos(), al.sin());
            let pa = ca * d[0] + sa * d[1];
            let pb = -sa * d[0] + ca * d[1];
            kx * pa * pa + ky * pb * pb + kz * d[2] * d[2]
        } else {
            (if restrained(0) { 0.0 } else { kx * d[0] * d[0] }) + (if restrained(1) { 0.0 } else { ky * d[1] * d[1] }) + (if restrained(2) { 0.0 } else { kz * d[2] * d[2] })
        };
        e2 += t;
        eabs += t.abs();
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
