//! Certified plastic collapse load factor for 2D frames (docs/verification/CERTIFY.md,
//! "Plastic collapse load factor").
//!
//! The solver (`solver::plastic::solve_plastic_2d`) runs an event-to-event
//! incremental hinge analysis with bending-only yield `|M| ≤ Mp`. This module
//! encloses the exact collapse load factor `λ_c` of the same rigid–perfectly
//! plastic model with the two plastic theorems, both *checked in exact rational
//! arithmetic*:
//!
//! * **Static (lower bound).** A field of member end forces in equilibrium with
//!   `λ·P` (every free nodal DOF, every moment release) whose bending moment
//!   satisfies `|M(x)| ≤ Mp` everywhere along every member ⇒ `λ_c ≥ λ`.
//! * **Kinematic (upper bound).** A mechanism of rigid segments joined by hinges
//!   that is compatible with the supports, with external work `W > 0`, gives
//!   `λ_c ≤ D / W`, `D = Σ Mp·|θ|`.
//!
//! How the candidates are found does not matter for soundness: the checker
//! (`check_static`, `check_mechanism`) recomputes every equation from the input
//! data. The candidates come from an f64 linear program (the classical limit
//! analysis LP on sampled sections, with cutting-plane refinement) and from the
//! incremental solver's final state; equilibrium of the candidate is then
//! restored *exactly* by writing it as `λ x_p + N z` with the particular solution
//! `x_p` and self-stress basis `N` of the equilibrium equations computed by exact
//! Gauss–Jordan elimination.

use super::exact::*;
use super::plastic_bundle::{sparse_rows, CubicF, LimitProblem, LinF, YieldComp, YieldMember, YieldPiece};
use crate::solver::plastic::{solve_plastic_2d, PlasticResult};
use crate::types::*;
use num_traits::{One, Signed, Zero};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Exact checks are cubic in the model size; larger models are refused.
pub const MAX_PLASTIC_ELEMENTS: usize = 200;

// ───────────────────────────── model ─────────────────────────────

/// A member load, positions as fractions `t ∈ [0, 1]` of the member (exact).
#[derive(Debug, Clone)]
pub enum ElemLoad {
    /// Transverse load per unit length, linear from `qi` at `ta` to `qj` at `tb`
    /// (positive along the local y axis `(−dz, dx)/L`).
    Dist { ta: Q, tb: Q, qi: Q, qj: Q },
    /// Transverse force `p` (local y), axial force `px` (local x), couple `my`
    /// (counter-clockwise) at `ta`.
    Point { ta: Q, p: Q, px: Q, my: Q },
}

/// `Lm(t)` (moment of the member loads on `[0, t]` about the section `t`, per
/// unit load factor) on `[a, b]` is `c0 + c1 t + c2 t² + c3 t³`.
#[derive(Debug, Clone)]
pub struct Piece {
    pub a: Q,
    pub b: Q,
    pub c: [Q; 4],
}

#[derive(Debug, Clone)]
pub struct PElem {
    pub id: usize,
    pub ni: usize,
    pub nj: usize,
    pub dx: Q,
    pub dz: Q,
    pub l2: Q,
    /// Exact length when it is rational (required for point / partial loads).
    pub l: Option<Q>,
    pub rel_i: bool,
    pub rel_j: bool,
    /// Enclosure `[lo, hi]` of the exact plastic moment; `None` = no hinge can
    /// form (the solver gives such members `Mp = ∞`).
    pub mp: Option<(Q, Q)>,
    pub loads: Vec<ElemLoad>,
    pub pieces: Vec<Piece>,
}

#[derive(Debug, Clone)]
pub struct PlasticModel {
    pub node_ids: Vec<usize>,
    pub restrained: Vec<[bool; 3]>,
    /// Reference nodal loads (fx, fz, my), multiplied by λ.
    pub nodal: Vec<[Q; 3]>,
    pub elems: Vec<PElem>,
}

fn perp_dot(e: &PElem, v: (&Q, &Q)) -> Q {
    // (−dz, dx) · v
    -(&e.dz * v.0) + &e.dx * v.1
}

fn cross(e: &PElem, fx: &Q, fz: &Q) -> Q {
    // d × F = dx·Fz − dz·Fx
    &e.dx * fz - &e.dz * fx
}

fn mp_interval(sec: &PlasticSectionData, fy: f64, over: Option<f64>) -> Result<Option<(Q, Q)>, String> {
    if let Some(v) = over {
        let m = q(v).ok_or("non-finite Mp override")?;
        if !m.is_positive() {
            return Err("Mp override must be positive".into());
        }
        return Ok(Some((m.clone(), m)));
    }
    let fyk = q(fy).ok_or("non-finite fy")? * qi(1000);
    if let (Some(b), Some(h)) = (sec.b, sec.h) {
        let (b, h) = (q(b).ok_or("non-finite b")?, q(h).ok_or("non-finite h")?);
        let m = fyk * &b * &h * &h / qi(4);
        if !m.is_positive() {
            return Err("non-positive plastic moment".into());
        }
        Ok(Some((m.clone(), m)))
    } else if sec.iz > 1e-20 {
        Ok(Some(approx_mp(&fyk, sec.iz, sec.a)?))
    } else {
        Ok(None)
    }
}

/// Enclosure of the solvers' approximate plastic moment `fyk · 1.15 · I/(h/2)`
/// with `h = √(12 I / A)` (the root bracketed by adjacent f64 values).
pub(super) fn approx_mp(fyk: &Q, i: f64, a: f64) -> Result<(Q, Q), String> {
    let iz = q(i).ok_or("non-finite I")?;
    let a = q(a).ok_or("non-finite A")?;
    if !a.is_positive() {
        return Err("non-positive section area".into());
    }
    let x = qi(12) * &iz / &a;
    let r = to_f64(&x).sqrt();
    if !r.is_finite() || r <= 0.0 {
        return Err("section height out of range".into());
    }
    let (mut lo, mut hi) = (r, r);
    while q(lo).ok_or("range")?.pow(2) > x {
        lo = lo.next_down();
    }
    while q(hi).ok_or("range")?.pow(2) < x {
        hi = hi.next_up();
    }
    if lo <= 0.0 {
        return Err("section height out of range".into());
    }
    let k = fyk * qr(23, 20) * qi(2) * iz;
    Ok((&k / q(hi).unwrap(), &k / q(lo).unwrap()))
}

/// Restrained DOFs of a support, as the 2D DOF numbering defines them.
fn support_restrains(t: &str) -> Result<[bool; 3], String> {
    Ok(match t {
        "fixed" => [true, true, true],
        "pinned" => [true, true, false],
        "rollerX" => [false, true, false],
        "rollerY" | "rollerZ" => [true, false, false],
        "guidedX" => [false, true, true],
        "guidedY" | "guidedZ" => [true, false, true],
        "spring" => return Err("spring supports are not part of the rigid-plastic model".into()),
        "inclinedRoller" => return Err("inclined supports are not supported".into()),
        _ => [false, false, false],
    })
}

fn build_pieces(e: &PElem) -> Result<Vec<Piece>, String> {
    let mut bps: Vec<Q> = vec![Q::zero(), Q::one()];
    push_breakpoints(&e.loads, &mut bps);
    lm_pieces(&e.loads, e.l.as_ref(), &e.l2, &bps)
}

pub(super) fn push_breakpoints(loads: &[ElemLoad], bps: &mut Vec<Q>) {
    for ld in loads {
        match ld {
            ElemLoad::Dist { ta, tb, .. } => {
                bps.push(ta.clone());
                bps.push(tb.clone());
            }
            ElemLoad::Point { ta, .. } => bps.push(ta.clone()),
        }
    }
    bps.sort();
    bps.dedup();
}

/// `Lm(t)` of transverse member loads (one bending plane) on the pieces
/// between consecutive breakpoints `bps` (sorted, from 0 to 1, including
/// every load position). `l` is the member length (needed for point loads),
/// `l2` its square.
pub(super) fn lm_pieces(loads: &[ElemLoad], l: Option<&Q>, l2: &Q, bps: &[Q]) -> Result<Vec<Piece>, String> {
    let mut pieces = Vec::new();
    for w in bps.windows(2) {
        let (a, b) = (&w[0], &w[1]);
        let mut c = [Q::zero(), Q::zero(), Q::zero(), Q::zero()];
        for ld in loads {
            match ld {
                ElemLoad::Point { ta, p, my, .. } => {
                    if ta <= a {
                        let l = l.ok_or("point load needs a rational member length")?;
                        let pl = p * l;
                        c[0] += ta * &pl + my;
                        c[1] -= pl;
                    }
                }
                ElemLoad::Dist { ta, tb, qi: q_i, qj } => {
                    let beta = (qj - q_i) / (tb - ta);
                    let alpha = q_i - &beta * ta;
                    if tb <= a {
                        let s0 = (q_i + qj) / qi(2) * (tb - ta);
                        let s1 = &alpha * (tb * tb - ta * ta) / qi(2)
                            + &beta * (tb * tb * tb - ta * ta * ta) / qi(3);
                        c[0] += l2 * s1;
                        c[1] -= l2 * s0;
                    } else if ta <= a && b <= tb {
                        let ta2 = ta * ta;
                        let ta3 = &ta2 * ta;
                        c[0] += l2 * (-(&alpha * &ta2) / qi(2) - &beta * &ta3 / qi(3));
                        c[1] += l2 * (&alpha * ta + &beta * &ta2 / qi(2));
                        c[2] += l2 * (-&alpha / qi(2));
                        c[3] += l2 * (-&beta / qi(6));
                    }
                }
            }
        }
        pieces.push(Piece { a: a.clone(), b: b.clone(), c });
    }
    Ok(pieces)
}

/// Magnitude range of the input numbers the exact certificates accept
/// (zero is always accepted).
pub const EXACT_MIN_ABS: f64 = 1e-30;
pub const EXACT_MAX_ABS: f64 = 1e30;

/// Translate the solver input into the exact rigid-plastic model, or refuse.
pub fn build_model(input: &PlasticInput) -> Result<PlasticModel, String> {
    // Exact rational arithmetic: its cost grows with the bit length of the
    // data, and an input value of ±1e300 or a subnormal made it run for
    // minutes (issue #335 property tests). Models in any unit system stay far
    // inside this range; outside it the certificate is refused, not slow.
    super::finite::check_magnitudes(input, EXACT_MIN_ABS, EXACT_MAX_ABS)?;
    let s = &input.solver;
    if !s.constraints.is_empty() {
        return Err("constraints are not supported by the plastic certificate".into());
    }
    if !s.connectors.is_empty() {
        return Err("connectors are not supported by the plastic certificate".into());
    }
    if s.elements.len() > MAX_PLASTIC_ELEMENTS {
        return Err(format!("more than {MAX_PLASTIC_ELEMENTS} members: too large for the exact check"));
    }
    let mut node_list: Vec<&SolverNode> = crate::ordered::values(&s.nodes).collect();
    node_list.sort_by_key(|n| n.id);
    let idx: HashMap<usize, usize> = node_list.iter().enumerate().map(|(i, n)| (n.id, i)).collect();
    let coords: Vec<(Q, Q)> = node_list
        .iter()
        .map(|n| Ok((q(n.x).ok_or("non-finite node coordinate")?, q(n.z).ok_or("non-finite node coordinate")?)))
        .collect::<Result<_, String>>()?;
    let nn = node_list.len();

    let mut restrained = vec![[false; 3]; nn];
    let mut sups: Vec<&SolverSupport> = crate::ordered::values(&s.supports).collect();
    sups.sort_by_key(|x| x.id);
    for sup in sups {
        let n = *idx.get(&sup.node_id).ok_or("support on unknown node")?;
        let r = support_restrains(&sup.support_type)?;
        if sup.angle.is_some_and(|a| a != 0.0) {
            return Err("inclined supports are not supported".into());
        }
        for v in [sup.dx, sup.dz, sup.dry].into_iter().flatten() {
            if v != 0.0 {
                return Err("prescribed support displacements are not supported".into());
            }
        }
        for k in 0..3 {
            restrained[n][k] |= r[k];
        }
    }

    let mut nodal = vec![[Q::zero(), Q::zero(), Q::zero()]; nn];
    let mut mp_by_sec: HashMap<usize, Option<(Q, Q)>> = HashMap::new();
    for (sid, sec) in &input.sections {
        let sec_id: usize = sid.parse().unwrap_or(0);
        let over = input.mp_overrides.as_ref().and_then(|m| m.get(sid)).copied();
        let fy = input.materials.get(&sec.material_id.to_string()).and_then(|m| m.fy).unwrap_or(250.0);
        mp_by_sec.insert(sec_id, mp_interval(sec, fy, over)?);
    }

    let mut elem_list: Vec<&SolverElement> = crate::ordered::values(&s.elements).collect();
    elem_list.sort_by_key(|e| e.id);
    let eidx: HashMap<usize, usize> = elem_list.iter().enumerate().map(|(i, e)| (e.id, i)).collect();
    let mut elems = Vec::with_capacity(elem_list.len());
    for el in &elem_list {
        let (rel_i, rel_j) = match el.elem_type.as_str() {
            "frame" => (el.hinge_start, el.hinge_end),
            "truss" => (true, true),
            t => return Err(format!("element type '{t}' is not supported by the plastic certificate")),
        };
        let ni = *idx.get(&el.node_i).ok_or("element on unknown node")?;
        let nj = *idx.get(&el.node_j).ok_or("element on unknown node")?;
        let dx = &coords[nj].0 - &coords[ni].0;
        let dz = &coords[nj].1 - &coords[ni].1;
        let l2 = &dx * &dx + &dz * &dz;
        if l2.is_zero() {
            return Err(format!("element {} has zero length", el.id));
        }
        let l = sqrt_exact(&l2);
        elems.push(PElem {
            id: el.id,
            ni,
            nj,
            dx,
            dz,
            l2,
            l,
            rel_i,
            rel_j,
            mp: mp_by_sec.get(&el.section_id).cloned().flatten(),
            loads: Vec::new(),
            pieces: Vec::new(),
        });
    }

    let frac = |e: &PElem, x: f64, what: &str| -> Result<Q, String> {
        let xq = q(x).ok_or("non-finite load position")?;
        if xq.is_zero() {
            return Ok(Q::zero());
        }
        let l = e.l.as_ref().ok_or_else(|| {
            format!("{what} on element {} of irrational length (√{}): not representable exactly", e.id, to_f64(&e.l2))
        })?;
        let t = xq / l;
        if t.is_negative() || t > Q::one() {
            return Err(format!("{what} position outside element {}", e.id));
        }
        Ok(t)
    };

    for load in &s.loads {
        match load {
            SolverLoad::Nodal(nl) => {
                let n = *idx.get(&nl.node_id).ok_or("load on unknown node")?;
                nodal[n][0] += q(nl.fx).ok_or("non-finite load")?;
                nodal[n][1] += q(nl.fz).ok_or("non-finite load")?;
                nodal[n][2] += q(nl.my).ok_or("non-finite load")?;
            }
            SolverLoad::Distributed(dl) => {
                let ei = *eidx.get(&dl.element_id).ok_or("load on unknown element")?;
                let e = &elems[ei];
                let ta = frac(e, dl.a.unwrap_or(0.0), "partial distributed load")?;
                let tb = match dl.b {
                    None => Q::one(),
                    Some(b) => frac(e, b, "partial distributed load")?,
                };
                let (qa, qb) = (q(dl.q_i).ok_or("non-finite load")?, q(dl.q_j).ok_or("non-finite load")?);
                if tb < ta {
                    return Err(format!("distributed load with b < a on element {}", e.id));
                }
                if tb == ta || (qa.is_zero() && qb.is_zero()) {
                    continue;
                }
                elems[ei].loads.push(ElemLoad::Dist { ta, tb, qi: qa, qj: qb });
            }
            SolverLoad::PointOnElement(pl) => {
                let ei = *eidx.get(&pl.element_id).ok_or("load on unknown element")?;
                let (p, px, my) = (
                    q(pl.p).ok_or("non-finite load")?,
                    q(pl.px.unwrap_or(0.0)).ok_or("non-finite load")?,
                    q(pl.my.unwrap_or(0.0)).ok_or("non-finite load")?,
                );
                if p.is_zero() && px.is_zero() && my.is_zero() {
                    continue;
                }
                let e = &elems[ei];
                if e.l.is_none() {
                    return Err(format!(
                        "point load on element {} of irrational length: not representable exactly",
                        e.id
                    ));
                }
                let ta = frac(e, pl.a, "point load")?;
                elems[ei].loads.push(ElemLoad::Point { ta, p, px, my });
            }
            SolverLoad::AxialDistributed(al) => {
                if al.q_i != 0.0 || al.q_j != 0.0 {
                    return Err("axial span loads are not part of the plastic certificate".into());
                }
            }
            SolverLoad::Thermal(tl) => {
                if tl.dt_uniform != 0.0 || tl.dt_gradient != 0.0 {
                    return Err("thermal loads are not part of the plastic certificate".into());
                }
            }
        }
    }
    for e in &mut elems {
        e.pieces = build_pieces(e)?;
    }
    Ok(PlasticModel { node_ids: node_list.iter().map(|n| n.id).collect(), restrained, nodal, elems })
}

// ───────────────────────────── exact checks ─────────────────────────────

/// Member end forces exerted *by the nodes on the member* at end i, global
/// axes: `(Fx, Fz, Mi)` per member, for load factor `lambda`.
#[derive(Debug, Clone)]
pub struct StaticField {
    pub lambda: Q,
    pub elems: Vec<[Q; 3]>,
}

/// Resultant of the member loads (per unit load factor), global axes.
fn elem_resultant(e: &PElem) -> (Q, Q) {
    let (mut wx, mut wz) = (Q::zero(), Q::zero());
    for ld in &e.loads {
        match ld {
            ElemLoad::Dist { ta, tb, qi: a, qj: b } => {
                let s0 = (a + b) / qi(2) * (tb - ta);
                wx -= &s0 * &e.dz;
                wz += &s0 * &e.dx;
            }
            ElemLoad::Point { p, px, .. } => {
                let l = e.l.as_ref().expect("checked when building the model");
                wx += (-(p * &e.dz) + px * &e.dx) / l;
                wz += (p * &e.dx + px * &e.dz) / l;
            }
        }
    }
    (wx, wz)
}

/// `Lm(1)` including loads at `t = 1`, recomputed directly from the loads.
fn elem_end_moment_load(e: &PElem) -> Q {
    lm_end(&e.loads, e.l.as_ref(), &e.l2)
}

/// `Lm(1)` of transverse member loads, recomputed directly from the loads.
pub(super) fn lm_end(loads: &[ElemLoad], l: Option<&Q>, l2: &Q) -> Q {
    let mut s = Q::zero();
    for ld in loads {
        match ld {
            ElemLoad::Dist { ta, tb, qi: a, qj: b } => {
                // L² ∫ (s − 1) q(s) ds over [ta, tb]
                let beta = (b - a) / (tb - ta);
                let alpha = a - &beta * ta;
                let s0 = (a + b) / qi(2) * (tb - ta);
                let s1 = &alpha * (tb * tb - ta * ta) / qi(2) + &beta * (tb * tb * tb - ta * ta * ta) / qi(3);
                s += l2 * (s1 - s0);
            }
            ElemLoad::Point { ta, p, my, .. } => {
                let l = l.expect("checked when building the model");
                s += (ta - Q::one()) * p * l + my;
            }
        }
    }
    s
}

fn eval_poly(c: &[Q; 4], t: &Q) -> Q {
    ((&c[3] * t + &c[2]) * t + &c[1]) * t + &c[0]
}

/// Upper bound on `max |p(t)|` over `[a, b]` (degree ≤ 3) from Bernstein
/// coefficients with adaptive subdivision. Exact rational arithmetic.
fn bernstein_abs_bound(c: &[Q; 4], a: &Q, b: &Q, tol: &Q, depth: u32) -> Q {
    let h = b - a;
    // Taylor shift: p(a + h u) = Σ d_j u^j
    let p0 = eval_poly(c, a);
    let d1 = (&c[1] + qi(2) * &c[2] * a + qi(3) * &c[3] * a * a) * &h;
    let d2 = (&c[2] + qi(3) * &c[3] * a) * &h * &h;
    let d3 = &c[3] * &h * &h * &h;
    let b0 = p0.clone();
    let b1 = &p0 + &d1 / qi(3);
    let b2 = &p0 + qi(2) * &d1 / qi(3) + &d2 / qi(3);
    let b3 = &p0 + &d1 + &d2 + &d3;
    let ends = b0.abs().max(b3.abs());
    let ub = ends.clone().max(b1.abs()).max(b2.abs());
    if &ub - &ends <= *tol || depth == 0 {
        return ub;
    }
    let mid = (a + b) / qi(2);
    let l = bernstein_abs_bound(c, a, &mid, tol, depth - 1);
    let r = bernstein_abs_bound(c, &mid, b, tol, depth - 1);
    l.max(r)
}

/// Result of a successful static check.
#[derive(Debug, Clone)]
pub struct StaticCheck {
    /// Certified `λ_c ≥ lambda_lower` (exact rational).
    pub lambda_lower: Q,
    /// Scale applied to the field so that it is plastically admissible.
    pub scale: Q,
}

/// Exact static-theorem check. Verifies equilibrium of `field` exactly (every
/// free nodal DOF, every moment release), bounds `max |M(x)|` along every member
/// exactly, and returns `λ_lo = s·λ` with `s = min_e Mp_lo,e / max|M_e|`: the
/// field scaled by `s` is in equilibrium with `s·λ·P` and plastically admissible.
pub fn check_static(model: &PlasticModel, field: &StaticField) -> Result<StaticCheck, String> {
    if field.elems.len() != model.elems.len() {
        return Err("static field has the wrong number of members".into());
    }
    let lam = &field.lambda;
    if !lam.is_positive() {
        return Err("static field has λ ≤ 0".into());
    }
    let nn = model.node_ids.len();
    let mut sum = vec![[Q::zero(), Q::zero(), Q::zero()]; nn];
    let mut scale: Option<Q> = None;
    for (e, f) in model.elems.iter().zip(&field.elems) {
        let [fx, fz, mi] = f;
        let (wx, wz) = elem_resultant(e);
        let fjx = -fx - lam * &wx;
        let fjz = -fz - lam * &wz;
        let mj = -mi + cross(e, fx, fz) - lam * elem_end_moment_load(e);
        if e.rel_i && !mi.is_zero() {
            return Err(format!("element {}: moment at released end i is not zero", e.id));
        }
        if e.rel_j && !mj.is_zero() {
            return Err(format!("element {}: moment at released end j is not zero", e.id));
        }
        sum[e.ni][0] += fx;
        sum[e.ni][1] += fz;
        sum[e.ni][2] += mi;
        sum[e.nj][0] += fjx;
        sum[e.nj][1] += fjz;
        sum[e.nj][2] += &mj;

        if let Some((lo, _)) = &e.mp {
            let cr = cross(e, fx, fz);
            let tol = lo / Q::from_integer(num_bigint::BigInt::one() << 40usize);
            let mut umax = mi.abs().max(mj.abs());
            for pc in &e.pieces {
                let c = [
                    -mi - lam * &pc.c[0],
                    &cr - lam * &pc.c[1],
                    -(lam * &pc.c[2]),
                    -(lam * &pc.c[3]),
                ];
                let u = bernstein_abs_bound(&c, &pc.a, &pc.b, &tol, 40);
                if u > umax {
                    umax = u;
                }
            }
            if umax.is_positive() {
                let s = lo / &umax;
                scale = Some(match scale {
                    Some(x) if x <= s => x,
                    _ => s,
                });
            }
        }
    }
    for n in 0..nn {
        for k in 0..3 {
            if model.restrained[n][k] {
                continue;
            }
            if sum[n][k] != lam * &model.nodal[n][k] {
                return Err(format!(
                    "equilibrium fails at node {} dof {k}: residual {:e}",
                    model.node_ids[n],
                    to_f64(&(&sum[n][k] - lam * &model.nodal[n][k]))
                ));
            }
        }
    }
    let scale = scale.ok_or("no bending moment anywhere: collapse factor unbounded in the bending-only model")?;
    Ok(StaticCheck { lambda_lower: &scale * lam, scale })
}

/// A collapse mechanism: nodal virtual displacements `(ux, uz, θ)` and, per
/// member, interior hinge positions `0 < t₁ < … < t_h < 1` with the rotations
/// `ω₀ … ω_h` of the rigid segments between them.
#[derive(Debug, Clone)]
pub struct Mechanism {
    pub nodes: Vec<[Q; 3]>,
    pub elems: Vec<ElemMech>,
}

#[derive(Debug, Clone)]
pub struct ElemMech {
    pub hinges: Vec<Q>,
    pub omegas: Vec<Q>,
}

#[derive(Debug, Clone)]
pub struct MechanismCheck {
    /// Certified `λ_c ≤ lambda_upper = dissipation / work`.
    pub lambda_upper: Q,
    pub dissipation: Q,
    pub work: Q,
    /// (element id, position t, hinge rotation) of every rotating plastic hinge.
    pub hinges: Vec<(usize, Q, Q)>,
}

/// Exact kinematic-theorem check: compatibility (supports, rigid segments that
/// close on both end nodes, rigid joints where no hinge is allowed), external
/// work `W > 0`, dissipation `D = Σ Mp_hi·|θ|`; returns `λ_up = D / W`.
pub fn check_mechanism(model: &PlasticModel, mech: &Mechanism) -> Result<MechanismCheck, String> {
    if mech.nodes.len() != model.node_ids.len() || mech.elems.len() != model.elems.len() {
        return Err("mechanism has the wrong size".into());
    }
    for (n, u) in mech.nodes.iter().enumerate() {
        for k in 0..3 {
            if model.restrained[n][k] && !u[k].is_zero() {
                return Err(format!("mechanism moves a restrained DOF at node {}", model.node_ids[n]));
            }
        }
    }
    let mut work = Q::zero();
    for (u, p) in mech.nodes.iter().zip(&model.nodal) {
        for k in 0..3 {
            work += &u[k] * &p[k];
        }
    }
    let mut diss = Q::zero();
    let mut hinges = Vec::new();
    for (e, m) in model.elems.iter().zip(&mech.elems) {
        let h = m.hinges.len();
        if m.omegas.len() != h + 1 {
            return Err(format!("element {}: wrong number of segment rotations", e.id));
        }
        let mut ts = Vec::with_capacity(h + 2);
        ts.push(Q::zero());
        ts.extend(m.hinges.iter().cloned());
        ts.push(Q::one());
        if ts.windows(2).any(|w| w[0] >= w[1]) {
            return Err(format!("element {}: hinge positions must increase strictly inside (0, 1)", e.id));
        }
        let ui = &mech.nodes[e.ni];
        let uj = &mech.nodes[e.nj];
        // Displacement at the start of each segment.
        let mut starts = Vec::with_capacity(h + 1);
        let (mut px, mut pz) = (ui[0].clone(), ui[1].clone());
        for s in 0..=h {
            starts.push((px.clone(), pz.clone()));
            let dt = &ts[s + 1] - &ts[s];
            // ω × (dt·d) = ω·dt·(−dz, dx)
            px -= &m.omegas[s] * &dt * &e.dz;
            pz += &m.omegas[s] * &dt * &e.dx;
        }
        if px != uj[0] || pz != uj[1] {
            return Err(format!("element {}: segments do not close on node j (incompatible)", e.id));
        }
        let mut rot = |theta: Q, t: Q, allowed: bool| -> Result<(), String> {
            if theta.is_zero() || !allowed {
                return Ok(());
            }
            match &e.mp {
                None => Err(format!("element {}: hinge where no plastic hinge can form", e.id)),
                Some((_, hi)) => {
                    diss += hi * theta.abs();
                    hinges.push((e.id, t, theta));
                    Ok(())
                }
            }
        };
        rot(&m.omegas[0] - &ui[2], Q::zero(), !e.rel_i)?;
        for s in 1..=h {
            rot(&m.omegas[s] - &m.omegas[s - 1], ts[s].clone(), true)?;
        }
        rot(&uj[2] - &m.omegas[h], Q::one(), !e.rel_j)?;

        // Work of the member loads on the segment displacements.
        let disp_at = |t: &Q| -> (usize, Q, Q) {
            let s = (0..=h).rfind(|&s| ts[s] <= *t).unwrap_or(0).min(h);
            let dt = t - &ts[s];
            let (x0, z0) = &starts[s];
            (s, x0 - &m.omegas[s] * &dt * &e.dz, z0 + &m.omegas[s] * &dt * &e.dx)
        };
        for ld in &e.loads {
            match ld {
                ElemLoad::Point { ta, p, px, my } => {
                    let (s, ux, uz) = disp_at(ta);
                    let l = e.l.as_ref().expect("checked when building the model");
                    work += (p * perp_dot(e, (&ux, &uz)) + px * (&e.dx * &ux + &e.dz * &uz)) / l;
                    if !my.is_zero() {
                        if s >= 1 && ts[s] == *ta && m.omegas[s] != m.omegas[s - 1] {
                            return Err(format!("element {}: concentrated moment at a rotating hinge", e.id));
                        }
                        work += my * &m.omegas[s];
                    }
                }
                ElemLoad::Dist { ta, tb, qi: qa, qj: qb } => {
                    let beta = (qb - qa) / (tb - ta);
                    let alpha = qa - &beta * ta;
                    for s in 0..=h {
                        let s0 = ts[s].clone().max(ta.clone());
                        let s1 = ts[s + 1].clone().min(tb.clone());
                        if s1 <= s0 {
                            continue;
                        }
                        // perp(d)·δ(t) = A + B t on this segment
                        let (x0, z0) = &starts[s];
                        let bb = &m.omegas[s] * &e.l2;
                        let aa = perp_dot(e, (x0, z0)) - &bb * &ts[s];
                        work += &alpha * &aa * (&s1 - &s0)
                            + (&alpha * &bb + &beta * &aa) * (&s1 * &s1 - &s0 * &s0) / qi(2)
                            + &beta * &bb * (&s1 * &s1 * &s1 - &s0 * &s0 * &s0) / qi(3);
                    }
                }
            }
        }
    }
    if !work.is_positive() {
        return Err("mechanism external work is not positive".into());
    }
    Ok(MechanismCheck { lambda_upper: &diss / &work, dissipation: diss, work, hinges })
}

// ───────────────────────────── candidates (heuristic) ─────────────────────────────

struct Equilibrium {
    xp: Vec<Q>,
    null: Vec<Vec<Q>>,
}

/// Exact particular solution and self-stress basis of the equilibrium equations
/// `A x = λ b` (x = (Fx, Fz, Mi) per member).
fn equilibrium_system(model: &PlasticModel) -> Result<Equilibrium, String> {
    let (rows, rhs) = equilibrium_rows(model);
    let r = rref_solve(&rows, Some(&rhs), 3 * model.elems.len());
    let xp = r.particular.ok_or("the loads admit no equilibrium state (the structure cannot carry them)")?;
    Ok(Equilibrium { xp, null: r.null_basis })
}

/// The equilibrium equations `A x = λ b` (dense rows of `A`, and `b`): every free
/// nodal DOF, then every moment release.
fn equilibrium_rows(model: &PlasticModel) -> (Vec<Vec<Q>>, Vec<Q>) {
    let ne = model.elems.len();
    let n = 3 * ne;
    let nn = model.node_ids.len();
    let mut rows: Vec<Vec<Q>> = Vec::new();
    let mut rhs: Vec<Q> = Vec::new();
    let mut node_row = vec![[usize::MAX; 3]; nn];
    for i in 0..nn {
        for k in 0..3 {
            if !model.restrained[i][k] {
                node_row[i][k] = rows.len();
                rows.push(vec![Q::zero(); n]);
                rhs.push(model.nodal[i][k].clone());
            }
        }
    }
    for (ei, e) in model.elems.iter().enumerate() {
        let (wx, wz) = elem_resultant(e);
        let lm1 = elem_end_moment_load(e);
        let c = 3 * ei;
        let ri = node_row[e.ni];
        let rj = node_row[e.nj];
        if ri[0] != usize::MAX {
            rows[ri[0]][c] += Q::one();
        }
        if ri[1] != usize::MAX {
            rows[ri[1]][c + 1] += Q::one();
        }
        if ri[2] != usize::MAX {
            rows[ri[2]][c + 2] += Q::one();
        }
        if rj[0] != usize::MAX {
            rows[rj[0]][c] -= Q::one();
            rhs[rj[0]] += &wx;
        }
        if rj[1] != usize::MAX {
            rows[rj[1]][c + 1] -= Q::one();
            rhs[rj[1]] += &wz;
        }
        if rj[2] != usize::MAX {
            rows[rj[2]][c + 2] -= Q::one();
            rows[rj[2]][c] -= &e.dz;
            rows[rj[2]][c + 1] += &e.dx;
            rhs[rj[2]] += &lm1;
        }
        if e.rel_i {
            let mut r = vec![Q::zero(); n];
            r[c + 2] = Q::one();
            rows.push(r);
            rhs.push(Q::zero());
        }
        if e.rel_j {
            let mut r = vec![Q::zero(); n];
            r[c + 2] = -Q::one();
            r[c] = -e.dz.clone();
            r[c + 1] = e.dx.clone();
            rows.push(r);
            rhs.push(lm1);
        }
    }
    (rows, rhs)
}

/// The model as the generic limit-analysis problem of a certificate bundle
/// (`plastic_bundle`): the equilibrium rows over `x = (Fx, Fz, Mi)` per member, and per
/// member with a plastic moment its section moment `M(t)` (`|M| ≤ Mp`) on the end
/// sections `[0, 0]`, `[1, 1]` (the end moments `−Mᵢ`, `Mⱼ`, as `check_static` bounds
/// them) and on the load pieces, `M(t) = −Mᵢ + t (d × F) − λ Lm(t)`.
pub fn limit_problem_2d(model: &PlasticModel) -> LimitProblem {
    let (rows, rhs) = equilibrium_rows(model);
    let mut members = Vec::new();
    for (ei, e) in model.elems.iter().enumerate() {
        let Some((lo, hi)) = &e.mp else { continue };
        let c = 3 * ei;
        let zero = || LinF::default();
        let mi = || vec![(c + 2, -Q::one())];
        let cr = || vec![(c, -e.dz.clone()), (c + 1, e.dx.clone())];
        let point = |a: Q, f: LinF| YieldPiece { a: a.clone(), b: a, polys: vec![CubicF([f, zero(), zero(), zero()])] };
        let mut pieces = vec![point(Q::zero(), LinF::new(mi(), Q::zero()))];
        for pc in &e.pieces {
            pieces.push(YieldPiece {
                a: pc.a.clone(),
                b: pc.b.clone(),
                polys: vec![CubicF([
                    LinF::new(mi(), -pc.c[0].clone()),
                    LinF::new(cr(), -pc.c[1].clone()),
                    LinF::new(vec![], -pc.c[2].clone()),
                    LinF::new(vec![], -pc.c[3].clone()),
                ])],
            });
        }
        let mj: Vec<(usize, Q)> = mi().into_iter().chain(cr()).collect();
        pieces.push(point(Q::one(), LinF::new(mj, -elem_end_moment_load(e))));
        members.push(YieldMember {
            element_id: e.id,
            comps: vec![YieldComp { n: Q::one(), mp_lo: lo.clone(), mp_hi: hi.clone() }],
            pieces,
        });
    }
    LimitProblem { nv: 3 * model.elems.len(), rows: sparse_rows(&rows, &rhs), members }
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum Loc {
    EndI,
    EndJ,
    Interior,
    /// Interior point carrying a concentrated moment: no hinge placed there.
    NoHinge,
}

struct Sample {
    e: usize,
    t: Q,
    tf: f64,
    loc: Loc,
    /// Lm(t) coefficients (f64) of the piece used (None = end i, Lm = 0;
    /// `lm_end` for end j).
    lm: f64,
}

struct ElemF {
    dx: f64,
    dz: f64,
    pieces: Vec<(f64, f64, [f64; 4])>,
    lm_end: f64,
    mp: f64,
}

fn elem_f64(e: &PElem) -> ElemF {
    ElemF {
        dx: to_f64(&e.dx),
        dz: to_f64(&e.dz),
        pieces: e
            .pieces
            .iter()
            .map(|p| (to_f64(&p.a), to_f64(&p.b), [to_f64(&p.c[0]), to_f64(&p.c[1]), to_f64(&p.c[2]), to_f64(&p.c[3])]))
            .collect(),
        lm_end: to_f64(&elem_end_moment_load(e)),
        mp: e.mp.as_ref().map(|(lo, _)| to_f64(lo)).unwrap_or(f64::INFINITY),
    }
}

fn polyf(c: &[f64; 4], t: f64) -> f64 {
    ((c[3] * t + c[2]) * t + c[1]) * t + c[0]
}

fn has_moment_at(e: &PElem, t: &Q) -> bool {
    e.loads.iter().any(|l| matches!(l, ElemLoad::Point { ta, my, .. } if ta == t && !my.is_zero()))
}

fn initial_samples(model: &PlasticModel, ef: &[ElemF], per_piece: usize) -> Vec<Sample> {
    let mut out = Vec::new();
    for (ei, e) in model.elems.iter().enumerate() {
        if e.mp.is_none() {
            continue;
        }
        let f = &ef[ei];
        out.push(Sample { e: ei, t: Q::zero(), tf: 0.0, loc: Loc::EndI, lm: 0.0 });
        out.push(Sample { e: ei, t: Q::one(), tf: 1.0, loc: Loc::EndJ, lm: f.lm_end });
        for (pk, pc) in e.pieces.iter().enumerate() {
            let c = &f.pieces[pk].2;
            let curved = c[2] != 0.0 || c[3] != 0.0;
            let n = if curved { per_piece } else { 1 };
            for j in 0..=n {
                let t = &pc.a + (&pc.b - &pc.a) * qr(j as i64, n as i64);
                let loc = if t.is_zero() {
                    Loc::EndI
                } else if t.is_one() {
                    Loc::EndJ
                } else if has_moment_at(e, &t) {
                    Loc::NoHinge
                } else {
                    Loc::Interior
                };
                let tf = to_f64(&t);
                out.push(Sample { e: ei, lm: polyf(c, tf), t, tf, loc });
            }
        }
    }
    out
}

/// `m = −Mi + t (dx Fz − dz Fx) − λ Lm` for member values (fx, fz, mi).
fn sample_moment(s: &Sample, f: &ElemF, x: &[f64], lam: f64) -> f64 {
    let c = 3 * s.e;
    -x[c + 2] + s.tf * (f.dx * x[c + 1] - f.dz * x[c]) - lam * s.lm
}

/// Solve `B X = R` (B p×p dense, R p×w) by Gaussian elimination with partial
/// pivoting; `None` if B is numerically singular.
fn dense_solve(mut bm: Vec<Vec<f64>>, mut r: Vec<Vec<f64>>) -> Option<Vec<Vec<f64>>> {
    let p = bm.len();
    for c in 0..p {
        let piv = (c..p).max_by(|&x, &y| bm[x][c].abs().total_cmp(&bm[y][c].abs()))?;
        if bm[piv][c].abs() < 1e-300 {
            return None;
        }
        bm.swap(c, piv);
        r.swap(c, piv);
        for i in c + 1..p {
            let f = bm[i][c] / bm[c][c];
            if f != 0.0 {
                let (top, bot) = bm.split_at_mut(i);
                for (v, pv) in bot[0][c..].iter_mut().zip(&top[c][c..]) {
                    *v -= f * pv;
                }
                let (rt, rb) = r.split_at_mut(i);
                for (v, pv) in rb[0].iter_mut().zip(&rt[c]) {
                    *v -= f * pv;
                }
            }
        }
    }
    for c in (0..p).rev() {
        let d = bm[c][c];
        for v in r[c].iter_mut() {
            *v /= d;
        }
        for i in 0..c {
            let f = bm[i][c];
            if f != 0.0 {
                let (top, bot) = r.split_at_mut(c);
                for (v, pv) in top[i].iter_mut().zip(&bot[0]) {
                    *v -= f * pv;
                }
            }
        }
    }
    Some(r)
}

/// Dense tableau simplex: min Σ μ s.t. A μ = b (b ≥ 0), μ ≥ 0. Returns the
/// basic solution μ and the dual y (Aᵀ y ≤ 1, maximizing bᵀ y). Heuristic
/// (f64): the tableau is rebuilt from the original data every few pivots and
/// the ratio test is Harris's two-pass test, which keeps it well-behaved on the
/// highly degenerate limit-analysis LPs.
pub(super) fn simplex_min_sum(a: &[Vec<f64>], b: &[f64]) -> Option<(Vec<f64>, Vec<f64>)> {
    let p = a.len();
    let n = a[0].len();
    let w = n + p + 1;
    // original [A | I | b]
    let orig: Vec<Vec<f64>> = (0..p)
        .map(|i| {
            let mut r = a[i].clone();
            r.extend((0..p).map(|j| if i == j { 1.0 } else { 0.0 }));
            r.push(b[i]);
            r
        })
        .collect();
    let mut tab = orig.clone();
    let mut basis: Vec<usize> = (n..n + p).collect();
    let reinvert = |basis: &[usize]| -> Option<Vec<Vec<f64>>> {
        let bm: Vec<Vec<f64>> = (0..p).map(|i| basis.iter().map(|&j| orig[i][j]).collect()).collect();
        let mut t = dense_solve(bm, orig.clone())?;
        // clamp tiny negative basic values from round-off
        for row in t.iter_mut() {
            if row[w - 1] < 0.0 && row[w - 1] > -1e-12 {
                row[w - 1] = 0.0;
            }
        }
        Some(t)
    };
    let pivot = |tab: &mut Vec<Vec<f64>>, ir: usize, jc: usize| {
        let piv = tab[ir][jc];
        for v in tab[ir].iter_mut() {
            *v /= piv;
        }
        let (top, rest) = tab.split_at_mut(ir);
        let (prow, bot) = rest.split_first_mut().unwrap();
        for r in top.iter_mut().chain(bot.iter_mut()) {
            let f = r[jc];
            if f != 0.0 {
                for (v, pv) in r.iter_mut().zip(prow.iter()) {
                    *v -= f * pv;
                }
            }
        }
    };
    let run = |tab: &mut Vec<Vec<f64>>, basis: &mut Vec<usize>, cost: &dyn Fn(usize) -> f64, allow: &dyn Fn(usize) -> bool| -> bool {
        let max_iter = 50 * (n + p);
        let mut degenerate = 0;
        let mut since = 0;
        for _ in 0..max_iter {
            if since >= 25 {
                match reinvert(basis) {
                    Some(t) => *tab = t,
                    None => return false,
                }
                since = 0;
            }
            let mut best: Option<(usize, f64)> = None;
            for j in 0..n + p {
                if !allow(j) || basis.contains(&j) {
                    continue;
                }
                let rc = cost(j) - basis.iter().zip(tab.iter()).map(|(&bi, row)| cost(bi) * row[j]).sum::<f64>();
                if rc < -1e-10 {
                    let better = match best {
                        None => true,
                        Some((_, v)) => degenerate <= 50 && rc < v,
                    };
                    if better {
                        best = Some((j, rc));
                    }
                }
            }
            let Some((jc, _)) = best else {
                if since == 0 {
                    return true;
                }
                // confirm optimality on a freshly rebuilt tableau
                match reinvert(basis) {
                    Some(t) => *tab = t,
                    None => return false,
                }
                since = 0;
                continue;
            };
            let cmax = tab.iter().fold(0.0f64, |m, r| m.max(r[jc].abs()));
            let ptol = 1e-9 * cmax.max(1e-300);
            // Harris pass 1: largest step with a small feasibility tolerance
            let delta = 1e-11;
            let mut theta = f64::INFINITY;
            for r in tab.iter() {
                if r[jc] > ptol {
                    theta = theta.min((r[w - 1].max(0.0) + delta) / r[jc]);
                }
            }
            if !theta.is_finite() {
                return false; // unbounded
            }
            // pass 2: among rows within that step, the largest pivot
            let mut row: Option<usize> = None;
            for (i, r) in tab.iter().enumerate() {
                if r[jc] > ptol && r[w - 1].max(0.0) / r[jc] <= theta && row.is_none_or(|k| r[jc] > tab[k][jc]) {
                    row = Some(i);
                }
            }
            let Some(ir) = row else { return false };
            degenerate = if tab[ir][w - 1].abs() < 1e-14 { degenerate + 1 } else { 0 };
            pivot(tab, ir, jc);
            basis[ir] = jc;
            since += 1;
        }
        false
    };
    // Phase 1
    if !run(&mut tab, &mut basis, &|j| if j >= n { 1.0 } else { 0.0 }, &|_| true) {
        return None;
    }
    let infeas: f64 = (0..p).filter(|&i| basis[i] >= n).map(|i| tab[i][w - 1]).sum();
    if infeas > 1e-9 {
        return None;
    }
    // Drive artificial variables (at zero level) out of the basis: left there,
    // a phase-2 pivot could make them positive, i.e. violate A μ = b. A row with
    // no usable real column is redundant and keeps its artificial at zero.
    for i in 0..p {
        if basis[i] < n {
            continue;
        }
        let Some(jc) = (0..n)
            .filter(|j| !basis.contains(j))
            .max_by(|&x, &y| tab[i][x].abs().total_cmp(&tab[i][y].abs()))
            .filter(|&j| tab[i][j].abs() > 1e-9)
        else {
            continue;
        };
        pivot(&mut tab, i, jc);
        basis[i] = jc;
    }
    tab = reinvert(&basis)?;
    // Phase 2 (artificial columns kept to read B⁻¹, never re-enter)
    if !run(&mut tab, &mut basis, &|j| if j >= n { 0.0 } else { 1.0 }, &|j| j < n) {
        return None;
    }
    let mut mu = vec![0.0; n];
    for i in 0..p {
        if basis[i] < n {
            mu[basis[i]] = tab[i][w - 1].max(0.0);
        }
    }
    // y_k = c_Bᵀ B⁻¹ e_k, B⁻¹ = artificial columns of the tableau.
    let y: Vec<f64> = (0..p)
        .map(|k| (0..p).map(|i| if basis[i] < n { tab[i][n + k] } else { 0.0 }).sum())
        .collect();
    Some((mu, y))
}

struct LpSolution {
    lambda: f64,
    z: Vec<f64>,
    /// signed μ per sample
    mu: Vec<f64>,
}

/// Solve max λ s.t. |m_k(λ, z)| ≤ Mp_k at the samples (through its dual).
fn solve_lp(samples: &[Sample], ef: &[ElemF], eq: &EqF) -> Option<LpSolution> {
    let r = eq.null.len();
    let k = samples.len();
    if k == 0 {
        return None;
    }
    // g_k, h_jk
    let g: Vec<f64> = samples.iter().map(|s| sample_moment(s, &ef[s.e], &eq.xp, 1.0)).collect();
    let h: Vec<Vec<f64>> = eq.null.iter().map(|nv| samples.iter().map(|s| sample_moment(s, &ef[s.e], nv, 0.0)).collect()).collect();
    // Orthonormalize the rows of h (modified Gram–Schmidt), tracking q = T h.
    let mut qrows: Vec<Vec<f64>> = Vec::new();
    let mut trows: Vec<Vec<f64>> = Vec::new();
    let hmax = h.iter().map(|v| v.iter().map(|x| x * x).sum::<f64>().sqrt()).fold(0.0, f64::max);
    for j in 0..r {
        let mut v = h[j].clone();
        let mut t = vec![0.0; r];
        t[j] = 1.0;
        for _ in 0..2 {
            for (qv, tv) in qrows.iter().zip(&trows) {
                let d: f64 = qv.iter().zip(&v).map(|(a, b)| a * b).sum();
                for (vi, qi) in v.iter_mut().zip(qv) {
                    *vi -= d * qi;
                }
                for (ti, tvi) in t.iter_mut().zip(tv) {
                    *ti -= d * tvi;
                }
            }
        }
        let nrm = v.iter().map(|x| x * x).sum::<f64>().sqrt();
        if nrm > 1e-10 * hmax.max(1e-300) {
            qrows.push(v.iter().map(|x| x / nrm).collect());
            trows.push(t.iter().map(|x| x / nrm).collect());
        }
    }
    let p = qrows.len() + 1;
    let mut a: Vec<Vec<f64>> = vec![Vec::with_capacity(2 * k); p];
    for (si, s) in samples.iter().enumerate() {
        let mp = ef[s.e].mp;
        for sign in [1.0, -1.0] {
            a[0].push(sign * g[si] / mp);
            for (i, qv) in qrows.iter().enumerate() {
                a[i + 1].push(sign * qv[si] / mp);
            }
        }
    }
    let scales: Vec<f64> = a.iter().map(|row| row.iter().fold(0.0f64, |m, x| m.max(x.abs()))).collect();
    if scales[0] == 0.0 {
        return None;
    }
    for (row, s) in a.iter_mut().zip(&scales) {
        if *s > 0.0 {
            for v in row.iter_mut() {
                *v /= s;
            }
        }
    }
    let mut b = vec![0.0; p];
    b[0] = 1.0 / scales[0];
    let (mu2, yhat) = simplex_min_sum(&a, &b)?;
    let y: Vec<f64> = yhat.iter().zip(&scales).map(|(y, s)| if *s > 0.0 { y / s } else { 0.0 }).collect();
    let lambda = y[0];
    let mut z = vec![0.0; r];
    for (i, tv) in trows.iter().enumerate() {
        for j in 0..r {
            z[j] += tv[j] * y[i + 1];
        }
    }
    let mu = (0..k).map(|s| mu2[2 * s] - mu2[2 * s + 1]).collect();
    Some(LpSolution { lambda, z, mu })
}

struct EqF {
    xp: Vec<f64>,
    null: Vec<Vec<f64>>,
}

fn field_f64(eq: &EqF, lam: f64, z: &[f64]) -> Vec<f64> {
    let mut x: Vec<f64> = eq.xp.iter().map(|v| v * lam).collect();
    for (nv, zj) in eq.null.iter().zip(z) {
        for (xi, ni) in x.iter_mut().zip(nv) {
            *xi += zj * ni;
        }
    }
    x
}

/// Interior critical points of |m| on each curved piece where it is near Mp.
fn cutting_samples(model: &PlasticModel, ef: &[ElemF], x: &[f64], lam: f64, existing: &[Sample]) -> Vec<Sample> {
    let mut out = Vec::new();
    for (ei, e) in model.elems.iter().enumerate() {
        let f = &ef[ei];
        if e.mp.is_none() {
            continue;
        }
        let c3 = 3 * ei;
        let cr = f.dx * x[c3 + 1] - f.dz * x[c3];
        for (pa, pb, c) in &f.pieces {
            if c[2] == 0.0 && c[3] == 0.0 {
                continue;
            }
            // m(t) = (−Mi − λc0) + (cr − λc1) t − λc2 t² − λc3 t³ ; m'(t) = 0
            let (b1, b2, b3) = (cr - lam * c[1], -lam * c[2], -lam * c[3]);
            let mut roots = Vec::new();
            if b3.abs() > 1e-300 {
                let (qa, qb, qc) = (3.0 * b3, 2.0 * b2, b1);
                let disc = qb * qb - 4.0 * qa * qc;
                if disc >= 0.0 {
                    let sd = disc.sqrt();
                    roots.push((-qb + sd) / (2.0 * qa));
                    roots.push((-qb - sd) / (2.0 * qa));
                }
            } else if b2.abs() > 1e-300 {
                roots.push(-b1 / (2.0 * b2));
            }
            for t in roots {
                if !(t > *pa && t < *pb) {
                    continue;
                }
                let m = -x[c3 + 2] - lam * c[0] + b1 * t + b2 * t * t + b3 * t * t * t;
                if m.abs() < 0.5 * f.mp {
                    continue;
                }
                if existing.iter().chain(out.iter()).any(|s: &Sample| s.e == ei && (s.tf - t).abs() < 1e-12) {
                    continue;
                }
                let tq = q(t).unwrap_or_else(Q::zero);
                let loc = if has_moment_at(e, &tq) { Loc::NoHinge } else { Loc::Interior };
                out.push(Sample { e: ei, t: tq, tf: t, loc, lm: polyf(c, t) });
            }
        }
    }
    out
}

fn exact_field(eq: &Equilibrium, lam: &Q, z: &[Q]) -> Vec<Q> {
    let mut x: Vec<Q> = eq.xp.iter().map(|v| v * lam).collect();
    for (nv, zj) in eq.null.iter().zip(z) {
        if zj.is_zero() {
            continue;
        }
        for (xi, ni) in x.iter_mut().zip(nv) {
            if !ni.is_zero() {
                *xi += zj * ni;
            }
        }
    }
    x
}

fn to_static(x: Vec<Q>, lam: Q) -> StaticField {
    let elems = x.chunks(3).map(|c| [c[0].clone(), c[1].clone(), c[2].clone()]).collect();
    StaticField { lambda: lam, elems }
}

/// Least-squares coefficients `z` with `N z ≈ target` (normal equations, f64).
pub(super) fn least_squares(cols: &[Vec<f64>], target: &[f64]) -> Vec<f64> {
    let r = cols.len();
    let mut a = vec![vec![0.0; r + 1]; r];
    for i in 0..r {
        for j in 0..r {
            a[i][j] = cols[i].iter().zip(&cols[j]).map(|(x, y)| x * y).sum();
        }
        a[i][i] += 1e-14 * a[i][i].abs().max(1e-300);
        a[i][r] = cols[i].iter().zip(target).map(|(x, y)| x * y).sum();
    }
    // Gaussian elimination with partial pivoting
    for c in 0..r {
        let p = (c..r).max_by(|&x, &y| a[x][c].abs().total_cmp(&a[y][c].abs())).unwrap();
        a.swap(c, p);
        if a[c][c].abs() < 1e-300 {
            continue;
        }
        for i in 0..r {
            if i != c {
                let f = a[i][c] / a[c][c];
                if f != 0.0 {
                    for k in c..=r {
                        a[i][k] -= f * a[c][k];
                    }
                }
            }
        }
    }
    (0..r).map(|i| if a[i][i].abs() > 1e-300 { a[i][r] / a[i][i] } else { 0.0 }).collect()
}

/// Static field from the incremental solver's final state (sum of all steps).
fn solver_state_field(model: &PlasticModel, res: &PlasticResult) -> Option<(f64, Vec<f64>)> {
    let pos: HashMap<usize, usize> = model.elems.iter().enumerate().map(|(i, e)| (e.id, i)).collect();
    let mut x = vec![0.0; 3 * model.elems.len()];
    for st in &res.steps {
        for ef in &st.results.element_forces {
            let i = *pos.get(&ef.element_id)?;
            let e = &model.elems[i];
            let (dx, dz) = (to_f64(&e.dx), to_f64(&e.dz));
            let l = (dx * dx + dz * dz).sqrt();
            let (c, s) = (dx / l, dz / l);
            // f_local = (−n_start, v_start, m_start); global = f0 (c, s) + f1 (−s, c)
            x[3 * i] += -ef.n_start * c - ef.v_start * s;
            x[3 * i + 1] += -ef.n_start * s + ef.v_start * c;
            x[3 * i + 2] += ef.m_start;
        }
    }
    (res.collapse_factor > 0.0).then_some((res.collapse_factor, x))
}

/// Exact compatibility null space for hinges at the given locations, then the
/// best (smallest exact λ_up) of its basis vectors and of a least-squares fit
/// to the LP hinge rotations.
fn best_mechanism(
    model: &PlasticModel,
    end_i: &[bool],
    end_j: &[bool],
    interior: &[Vec<Q>],
    target: &[(usize, Q, f64)],
) -> Option<(Mechanism, MechanismCheck)> {
    let nn = model.node_ids.len();
    let mut col = vec![[usize::MAX; 3]; nn];
    let mut n = 0;
    for i in 0..nn {
        for k in 0..3 {
            if !model.restrained[i][k] {
                col[i][k] = n;
                n += 1;
            }
        }
    }
    let mut ocol = Vec::with_capacity(model.elems.len());
    for h in interior {
        ocol.push(n);
        n += h.len() + 1;
    }
    let mut rows: Vec<Vec<Q>> = Vec::new();
    for (ei, e) in model.elems.iter().enumerate() {
        let hs = &interior[ei];
        let mut ts = vec![Q::zero()];
        ts.extend(hs.iter().cloned());
        ts.push(Q::one());
        let mut rx = vec![Q::zero(); n];
        let mut rz = vec![Q::zero(); n];
        if col[e.nj][0] != usize::MAX {
            rx[col[e.nj][0]] += Q::one();
        }
        if col[e.ni][0] != usize::MAX {
            rx[col[e.ni][0]] -= Q::one();
        }
        if col[e.nj][1] != usize::MAX {
            rz[col[e.nj][1]] += Q::one();
        }
        if col[e.ni][1] != usize::MAX {
            rz[col[e.ni][1]] -= Q::one();
        }
        for s in 0..=hs.len() {
            let dt = &ts[s + 1] - &ts[s];
            rx[ocol[ei] + s] += &dt * &e.dz;
            rz[ocol[ei] + s] -= &dt * &e.dx;
        }
        rows.push(rx);
        rows.push(rz);
        let rigid_i = !e.rel_i && !(end_i[ei] && e.mp.is_some());
        let rigid_j = !e.rel_j && !(end_j[ei] && e.mp.is_some());
        if rigid_i {
            let mut r = vec![Q::zero(); n];
            r[ocol[ei]] = Q::one();
            if col[e.ni][2] != usize::MAX {
                r[col[e.ni][2]] = -Q::one();
            }
            rows.push(r);
        }
        if rigid_j {
            let mut r = vec![Q::zero(); n];
            r[ocol[ei] + hs.len()] = Q::one();
            if col[e.nj][2] != usize::MAX {
                r[col[e.nj][2]] = -Q::one();
            }
            rows.push(r);
        }
    }
    let basis = rref_solve(&rows, None, n).null_basis;
    if basis.is_empty() {
        return None;
    }
    let to_mech = |v: &[Q]| -> Mechanism {
        let nodes = (0..nn)
            .map(|i| {
                let g = |k: usize| if col[i][k] == usize::MAX { Q::zero() } else { v[col[i][k]].clone() };
                [g(0), g(1), g(2)]
            })
            .collect();
        let elems = interior
            .iter()
            .enumerate()
            .map(|(ei, hs)| ElemMech { hinges: hs.clone(), omegas: v[ocol[ei]..ocol[ei] + hs.len() + 1].to_vec() })
            .collect();
        Mechanism { nodes, elems }
    };
    let mut cands: Vec<Vec<Q>> = basis.clone();
    if basis.len() > 1 && !target.is_empty() {
        // hinge rotations of each basis vector at the target locations
        let rot_at = |m: &Mechanism, ei: usize, t: &Q| -> f64 {
            let e = &model.elems[ei];
            let em = &m.elems[ei];
            if t.is_zero() {
                to_f64(&(&em.omegas[0] - &m.nodes[e.ni][2]))
            } else if t.is_one() {
                to_f64(&(&m.nodes[e.nj][2] - em.omegas.last().unwrap()))
            } else {
                match em.hinges.iter().position(|h| h == t) {
                    Some(s) => to_f64(&(&em.omegas[s + 1] - &em.omegas[s])),
                    None => 0.0,
                }
            }
        };
        let colsf: Vec<Vec<f64>> = basis
            .iter()
            .map(|v| {
                let m = to_mech(v);
                target.iter().map(|(ei, t, _)| rot_at(&m, *ei, t)).collect()
            })
            .collect();
        let tv: Vec<f64> = target.iter().map(|x| x.2).collect();
        let c = least_squares(&colsf, &tv);
        let mut v = vec![Q::zero(); n];
        for (cj, bj) in c.iter().zip(&basis) {
            let cq = q(*cj).unwrap_or_else(Q::zero);
            if cq.is_zero() {
                continue;
            }
            for (vi, bi) in v.iter_mut().zip(bj) {
                if !bi.is_zero() {
                    *vi += &cq * bi;
                }
            }
        }
        cands.push(v);
    }
    let mut best: Option<(Mechanism, MechanismCheck)> = None;
    for v in cands {
        for sign in [1, -1] {
            let vv: Vec<Q> = if sign == 1 { v.clone() } else { v.iter().map(|x| -x).collect() };
            let m = to_mech(&vv);
            if let Ok(chk) = check_mechanism(model, &m) {
                if best.as_ref().is_none_or(|(_, b)| chk.lambda_upper < b.lambda_upper) {
                    best = Some((m, chk));
                }
            }
        }
    }
    best
}

/// Exact candidates found for a model (exposed for tests that tamper with them).
#[derive(Debug, Clone)]
pub struct PlasticCandidates {
    pub static_field: Option<StaticField>,
    pub static_check: Option<StaticCheck>,
    pub static_reason: Option<String>,
    pub lower_source: Option<String>,
    pub mechanism: Option<Mechanism>,
    pub mechanism_check: Option<MechanismCheck>,
    pub mechanism_reason: Option<String>,
}

/// Find and check a static field and a mechanism for the model. `solver` (if
/// given) contributes its final state as a second static candidate.
pub fn plastic_candidates(model: &PlasticModel, solver: Option<&PlasticResult>) -> Result<PlasticCandidates, String> {
    let eq = equilibrium_system(model)?;
    let eqf = EqF {
        xp: eq.xp.iter().map(to_f64).collect(),
        null: eq.null.iter().map(|v| v.iter().map(to_f64).collect()).collect(),
    };
    let ef: Vec<ElemF> = model.elems.iter().map(elem_f64).collect();
    let mut samples = initial_samples(model, &ef, 16);
    let mut lp = solve_lp(&samples, &ef, &eqf).ok_or("limit-analysis LP failed (collapse factor unbounded or LP breakdown)")?;
    for _ in 0..6 {
        let x = field_f64(&eqf, lp.lambda, &lp.z);
        let extra = cutting_samples(model, &ef, &x, lp.lambda, &samples);
        if extra.is_empty() {
            break;
        }
        samples.extend(extra);
        match solve_lp(&samples, &ef, &eqf) {
            Some(s) => lp = s,
            None => break,
        }
    }

    // Static candidates
    let mut best_static: Option<(StaticField, StaticCheck, String)> = None;
    let mut static_reason = None;
    let mut consider = |field: StaticField, src: &str, best: &mut Option<(StaticField, StaticCheck, String)>| {
        match check_static(model, &field) {
            Ok(chk) => {
                if best.as_ref().is_none_or(|(_, b, _)| chk.lambda_lower > b.lambda_lower) {
                    *best = Some((field, chk, src.to_string()));
                }
            }
            Err(e) => static_reason = Some(e),
        }
    };
    if lp.lambda > 0.0 && lp.lambda.is_finite() {
        let lam = q(lp.lambda).unwrap_or_else(Q::zero);
        let z: Vec<Q> = lp.z.iter().map(|v| q(*v).unwrap_or_else(Q::zero)).collect();
        consider(to_static(exact_field(&eq, &lam, &z), lam.clone()), "limit-analysis LP", &mut best_static);
    }
    if let Some((lam_s, xs)) = solver.and_then(|r| solver_state_field(model, r)) {
        // project onto the exact equilibrium manifold: x = λ x_p + N z
        let resid: Vec<f64> = xs.iter().zip(&eqf.xp).map(|(x, p)| x - lam_s * p).collect();
        let z = least_squares(&eqf.null, &resid);
        let lam = q(lam_s).unwrap_or_else(Q::zero);
        let zq: Vec<Q> = z.iter().map(|v| q(*v).unwrap_or_else(Q::zero)).collect();
        consider(to_static(exact_field(&eq, &lam, &zq), lam), "incremental solver final state", &mut best_static);
    }

    // Mechanism from the active LP constraints
    let ne = model.elems.len();
    let mumax = lp.mu.iter().fold(0.0f64, |m, v| m.max(v.abs()));
    let mut best_mech: Option<(Mechanism, MechanismCheck)> = None;
    for thr in [1e-7, 1e-4, 1e-2] {
        let mut end_i = vec![false; ne];
        let mut end_j = vec![false; ne];
        let mut interior: Vec<Vec<Q>> = vec![Vec::new(); ne];
        let mut target: Vec<(usize, Q, f64)> = Vec::new();
        for (s, mu) in samples.iter().zip(&lp.mu) {
            if mu.abs() <= thr * mumax {
                continue;
            }
            match s.loc {
                Loc::EndI => end_i[s.e] = true,
                Loc::EndJ => end_j[s.e] = true,
                Loc::Interior => interior[s.e].push(s.t.clone()),
                Loc::NoHinge => continue,
            }
            match target.iter_mut().find(|(e, t, _)| *e == s.e && *t == s.t) {
                Some(x) => x.2 += mu,
                None => target.push((s.e, s.t.clone(), *mu)),
            }
        }
        for h in &mut interior {
            h.sort();
            h.dedup();
        }
        if let Some((m, c)) = best_mechanism(model, &end_i, &end_j, &interior, &target) {
            if best_mech.as_ref().is_none_or(|(_, b)| c.lambda_upper < b.lambda_upper) {
                best_mech = Some((m, c));
            }
            break;
        }
    }
    let (static_field, static_check, lower_source) = match best_static {
        Some((f, c, s)) => (Some(f), Some(c), Some(s)),
        None => (None, None, None),
    };
    let mechanism_reason = best_mech.is_none().then(|| "no compatible mechanism with positive work found".to_string());
    let (mechanism, mechanism_check) = match best_mech {
        Some((m, c)) => (Some(m), Some(c)),
        None => (None, None),
    };
    Ok(PlasticCandidates {
        static_field,
        static_check,
        static_reason: if lower_source.is_some() { None } else { static_reason },
        lower_source,
        mechanism,
        mechanism_check,
        mechanism_reason,
    })
}

// ───────────────────────────── public result ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedHinge {
    pub element_id: usize,
    /// Position along the member as a fraction of its length (0 = node i).
    pub position: f64,
    pub rotation: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticCertificate {
    /// Both bounds certified.
    pub certified: bool,
    /// Certified `λ_c ≥ lambdaLower` (static theorem, exact check, rounded down).
    pub lambda_lower: Option<f64>,
    /// Certified `λ_c ≤ lambdaUpper` (kinematic theorem, exact check, rounded up).
    pub lambda_upper: Option<f64>,
    pub lower_source: Option<String>,
    /// The collapse mechanism behind the upper bound.
    pub mechanism: Vec<CertifiedHinge>,
    /// The incremental solver's collapse factor and whether it lies in the
    /// certified enclosure (`None` if a bound is missing).
    pub solver_collapse_factor: Option<f64>,
    pub solver_within_bounds: Option<bool>,
    /// Relative distance of the solver's value outside the enclosure (0 if
    /// inside), e.g. ~1e-14 for f64 round-off in the incremental solver.
    pub solver_deviation: Option<f64>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedPlastic2D {
    pub results: PlasticResult,
    pub certificate: PlasticCertificate,
}

impl super::finite::Guarded for PlasticCertificate {
    fn claims(&self) -> bool {
        self.certified || self.lambda_lower.is_some() || self.lambda_upper.is_some()
    }

    fn downgrade(&mut self, reason: String) {
        *self = refused(reason, self.solver_collapse_factor.filter(|x| x.is_finite()));
    }
}

fn refused(reason: String, solver: Option<f64>) -> PlasticCertificate {
    PlasticCertificate {
        certified: false,
        lambda_lower: None,
        lambda_upper: None,
        lower_source: None,
        mechanism: Vec::new(),
        solver_collapse_factor: solver,
        solver_within_bounds: None,
        solver_deviation: None,
        reason: Some(reason),
    }
}

/// Certify the collapse load factor of a 2D plastic input (solver result
/// optional, used as an extra static candidate and compared with the bounds).
/// Withdrawn when the input, the solver result or a bound is not finite.
pub fn certify_collapse_2d(input: &PlasticInput, solver: Option<&PlasticResult>) -> PlasticCertificate {
    let sval = solver.map(|r| r.collapse_factor);
    if let Err(e) = super::finite::check_input(input).and_then(|()| super::finite::check_results(&solver)) {
        return refused(e, sval.filter(|x| x.is_finite()));
    }
    let mut c = collapse_2d(input, solver);
    super::finite::guard(&mut c);
    c
}

fn collapse_2d(input: &PlasticInput, solver: Option<&PlasticResult>) -> PlasticCertificate {
    let sval = solver.map(|r| r.collapse_factor);
    let model = match build_model(input) {
        Ok(m) => m,
        Err(e) => return refused(e, sval),
    };
    let c = match plastic_candidates(&model, solver) {
        Ok(c) => c,
        Err(e) => return refused(e, sval),
    };
    let lo = c.static_check.as_ref().and_then(|s| to_f64_down(&s.lambda_lower));
    let up = c.mechanism_check.as_ref().and_then(|m| to_f64_up(&m.lambda_upper));
    let mut reasons = Vec::new();
    if lo.is_none() {
        reasons.push(format!("lower bound: {}", c.static_reason.clone().unwrap_or_else(|| "no admissible field".into())));
    }
    if up.is_none() {
        reasons.push(format!("upper bound: {}", c.mechanism_reason.clone().unwrap_or_else(|| "no mechanism".into())));
    }
    let within = match (lo, up, sval) {
        (Some(l), Some(u), Some(s)) => Some(l <= s && s <= u),
        _ => None,
    };
    let deviation = match (lo, up, sval) {
        (Some(l), Some(u), Some(s)) => Some(((l - s).max(s - u).max(0.0)) / u.abs().max(f64::MIN_POSITIVE)),
        _ => None,
    };
    let mechanism = c
        .mechanism_check
        .as_ref()
        .map(|m| {
            m.hinges
                .iter()
                .map(|(id, t, th)| CertifiedHinge { element_id: *id, position: to_f64(t), rotation: to_f64(th) })
                .collect()
        })
        .unwrap_or_default();
    PlasticCertificate {
        certified: lo.is_some() && up.is_some(),
        lambda_lower: lo,
        lambda_upper: up,
        lower_source: c.lower_source,
        mechanism,
        solver_collapse_factor: sval,
        solver_within_bounds: within,
        solver_deviation: deviation,
        reason: (!reasons.is_empty()).then(|| reasons.join("; ")),
    }
}

/// Run the incremental plastic solver and certify its collapse load factor.
pub fn certify_plastic_2d(input: &PlasticInput) -> Result<CertifiedPlastic2D, String> {
    super::finite::check_input(input)?;
    let results = solve_plastic_2d(input)?;
    super::finite::check_results(&results)?;
    let certificate = certify_collapse_2d(input, Some(&results));
    Ok(CertifiedPlastic2D { results, certificate })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bernstein_bound_is_an_upper_bound_and_tight() {
        // p(t) = t(1 − t) on [0, 1]: max 1/4 at t = 1/2
        let c = [qi(0), qi(1), qi(-1), qi(0)];
        let tol = qr(1, 1 << 30);
        let u = bernstein_abs_bound(&c, &qi(0), &qi(1), &tol, 40);
        assert!(u >= qr(1, 4));
        assert!(u - qr(1, 4) <= qr(1, 1 << 29));
        // cubic with interior extremum: p = t³ − t on [0, 1], min −2/(3√3) ≈ −0.3849
        let c = [qi(0), qi(-1), qi(0), qi(1)];
        let u = bernstein_abs_bound(&c, &qi(0), &qi(1), &tol, 40);
        let exact = 2.0 / (3.0 * 3f64.sqrt());
        assert!(to_f64(&u) >= exact - 1e-15 && to_f64(&u) <= exact + 1e-8);
    }

    #[test]
    fn simplex_small_lp() {
        // min μ1 + μ2 + μ3 s.t. μ1 + 2 μ2 + 3 μ3 = 6 ⇒ μ3 = 2, objective 2; dual y = 1/3
        let a = vec![vec![1.0, 2.0, 3.0]];
        let (mu, y) = simplex_min_sum(&a, &[6.0]).unwrap();
        assert!((mu[2] - 2.0).abs() < 1e-12 && mu[0] == 0.0 && mu[1] == 0.0);
        assert!((y[0] - 1.0 / 3.0).abs() < 1e-12);
    }
}
