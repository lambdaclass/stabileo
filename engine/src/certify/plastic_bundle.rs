//! Plastic-collapse certificate bundles: the discretized limit-analysis problem of a
//! 2D or 3D plastic model and both plastic-theorem certificates, in exact rationals,
//! re-checked by the verified Lean checker `lake exe certcheck`
//! (`verify/Certify/PlasticCheck.lean`, soundness `Certify.Plastic.check_sound`). See
//! "Independent checking: certificate bundles" in `docs/verification/CERTIFY.md`.
//!
//! The problem (`LimitProblem`) is generic: unknown member end forces `x`, load factor
//! `λ`, equilibrium rows `Σ aᵢxᵢ = λp`, and per yield member pieces `[a, b]` on which
//! each bending component `M_c(t)` is a cubic whose coefficients are affine in
//! `(x, λ)`; yield `Σ_c M_c(t)²/(n_c Mp_c²) ≤ 1` (2D: one component, `n = 1`; 3D: the
//! biaxial ellipse, `n_c = |u_c|²` for the exact non-unit local axes). `plastic.rs` and
//! `plastic_3d.rs` build it from their models (`limit_problem_2d`, `limit_problem_3d`).
//!
//! * Static certificate: the engine's admissible field, scaled by `s` so that on every
//!   segment of an adaptive subdivision `Σ_c B_c²/(n_c mpLo_c²) ≤ 1`, `B_c` the largest
//!   absolute Bernstein coefficient of `M_c` (a bound per component; for the biaxial
//!   condition this is slightly more conservative than the engine's degree-6 Bernstein
//!   bound, so the bundle's `λ_lo` can be a little below the in-app value).
//! * Kinematic certificate: the engine's mechanism as hinge rotations, and the
//!   multipliers `u` solving `Aᵀu = Σ_h θ_h ∂M(t_h)/∂x` exactly (the virtual-work
//!   identity); `W = uᵀp + Σ θ_h ∂M(t_h)/∂λ`, `D_h ≥ √(Σ_c θ_c² n_c mpHi_c²)` rational,
//!   `λ_up = Σ D_h / W`.

use num_traits::{One, Signed, Zero};
use serde::{Deserialize, Serialize};

use super::exact::*;
use super::plastic::{build_model, check_mechanism, limit_problem_2d, plastic_candidates};
use super::plastic_3d::{build_model_3d, limit_problem_3d, mechanism_rotations_3d, plastic_candidates_3d, sqrt_up};
use super::provenance::Provenance;
use crate::solver::plastic::{solve_plastic_2d, solve_plastic_3d};
use crate::types::{PlasticInput, PlasticInput3D};

pub const PLASTIC_BUNDLE_FORMAT: &str = "stabileo.plastic-certificate.v1";
pub const KIND_PLASTIC_STATIC: &str = "plastic-collapse-static";
pub const KIND_PLASTIC_KINEMATIC: &str = "plastic-collapse-kinematic";

// ───────────────────────────── the generic problem ─────────────────────────────

/// `Σ c · xᵢ + lam · λ`.
#[derive(Debug, Clone, Default)]
pub struct LinF {
    pub terms: Vec<(usize, Q)>,
    pub lam: Q,
}

impl LinF {
    pub fn new(terms: Vec<(usize, Q)>, lam: Q) -> Self {
        LinF { terms: terms.into_iter().filter(|(_, c)| !c.is_zero()).collect(), lam }
    }

    fn eval(&self, x: &[Q], lam: &Q) -> Q {
        self.terms.iter().map(|(i, c)| c * &x[*i]).sum::<Q>() + &self.lam * lam
    }
}

/// `c[0] + c[1] t + c[2] t² + c[3] t³`.
#[derive(Debug, Clone, Default)]
pub struct CubicF(pub [LinF; 4]);

#[derive(Debug, Clone)]
pub struct YieldComp {
    pub n: Q,
    pub mp_lo: Q,
    pub mp_hi: Q,
}

#[derive(Debug, Clone)]
pub struct YieldPiece {
    pub a: Q,
    pub b: Q,
    /// One cubic per component.
    pub polys: Vec<CubicF>,
}

#[derive(Debug, Clone)]
pub struct YieldMember {
    pub element_id: usize,
    pub comps: Vec<YieldComp>,
    pub pieces: Vec<YieldPiece>,
}

#[derive(Debug, Clone)]
pub struct LimitProblem {
    pub nv: usize,
    /// `(Σ aᵢ xᵢ, p)`: the row reads `Σ aᵢ xᵢ = λ p`.
    pub rows: Vec<(Vec<(usize, Q)>, Q)>,
    pub members: Vec<YieldMember>,
}

/// A hinge of a mechanism: member index (into `LimitProblem::members`), position and
/// rotation per component (the multiplier of `M_c(t)` in the virtual work).
#[derive(Debug, Clone)]
pub struct HingeRot {
    pub member: usize,
    pub t: Q,
    pub theta: Vec<Q>,
}

/// Sparse rows from dense equilibrium rows.
pub(super) fn sparse_rows(rows: &[Vec<Q>], rhs: &[Q]) -> Vec<(Vec<(usize, Q)>, Q)> {
    rows.iter()
        .zip(rhs)
        .map(|(r, p)| (r.iter().enumerate().filter(|(_, c)| !c.is_zero()).map(|(i, c)| (i, c.clone())).collect(), p.clone()))
        .collect()
}

// ───────────────────────────── static certificate ─────────────────────────────

/// Largest absolute Bernstein coefficient of `q0 + q1 t + q2 t² + q3 t³` on `[s, s1]`
/// (the formula of `bern` in `verify/Certify/PlasticCheck.lean`).
fn bern(q: &[Q; 4], s: &Q, s1: &Q) -> Q {
    let h = s1 - s;
    let p0 = &q[0] + &q[1] * s + &q[2] * s * s + &q[3] * s * s * s;
    let d1 = (&q[1] + qi(2) * &q[2] * s + qi(3) * &q[3] * s * s) * &h;
    let d2 = (&q[2] + qi(3) * &q[3] * s) * &h * &h;
    let d3 = &q[3] * &h * &h * &h;
    let b1 = &p0 + &d1 / qi(3);
    let b2 = &p0 + qi(2) * &d1 / qi(3) + &d2 / qi(3);
    let b3 = &p0 + &d1 + &d2 + &d3;
    p0.abs().max(b1.abs()).max(b2.abs()).max(b3.abs())
}

fn poly_at(q: &[Q; 4], t: &Q) -> Q {
    ((&q[3] * t + &q[2]) * t + &q[1]) * t + &q[0]
}

/// `Σ_c B_c² / (n_c mpLo_c²)` on `[s, s1]`.
fn seg_value(qs: &[([Q; 4], Q)], s: &Q, s1: &Q) -> Q {
    qs.iter().map(|(q, w)| {
        let b = bern(q, s, s1);
        &b * &b * w
    }).sum()
}

/// `Σ_c M_c(t)² / (n_c mpLo_c²)`.
fn point_value(qs: &[([Q; 4], Q)], t: &Q) -> Q {
    qs.iter().map(|(q, w)| {
        let m = poly_at(q, t);
        &m * &m * w
    }).sum()
}

/// Best-first bisection over all pieces (`qs[p]` the components of piece `p` on
/// `[a_p, b_p]`): split the segment with the largest bound until it is within a factor
/// `1 + 2⁻³⁰` of the largest value seen at a point (a lower bound on the true maximum),
/// or `max_depth` / the split budget runs out. Returns the interior cut points per piece
/// (increasing) and `U`, the largest segment bound (an upper bound on the maximum).
fn branch_and_bound(qs: &[Vec<([Q; 4], Q)>], ends: &[(Q, Q)], max_depth: u32) -> (Vec<Vec<Q>>, Q) {
    let rel = Q::one() + Q::new(1.into(), num_bigint::BigInt::one() << 30usize);
    // (piece, s, s1, bound, depth)
    let mut open: Vec<(usize, Q, Q, Q, u32)> = Vec::new();
    let mut lower = Q::zero();
    for (p, (a, b)) in ends.iter().enumerate() {
        lower = lower.max(point_value(&qs[p], a)).max(point_value(&qs[p], b));
        open.push((p, a.clone(), b.clone(), seg_value(&qs[p], a, b), 0));
    }
    let mut cuts: Vec<Vec<Q>> = vec![Vec::new(); qs.len()];
    let mut budget = 200_000usize;
    loop {
        let Some(k) = (0..open.len()).max_by(|&i, &j| open[i].3.cmp(&open[j].3)) else { break };
        let (p, s, s1, v, depth) = open[k].clone();
        if v <= &lower * &rel || depth >= max_depth || s >= s1 || budget == 0 {
            break; // every open segment is accepted
        }
        budget -= 1;
        open.swap_remove(k);
        let mid = (&s + &s1) / qi(2);
        lower = lower.max(point_value(&qs[p], &mid));
        cuts[p].push(mid.clone());
        let (vl, vr) = (seg_value(&qs[p], &s, &mid), seg_value(&qs[p], &mid, &s1));
        open.push((p, s, mid.clone(), vl, depth + 1));
        open.push((p, mid, s1, vr, depth + 1));
    }
    let u = open.iter().map(|o| o.3.clone()).max().unwrap_or_else(Q::zero);
    for c in &mut cuts {
        c.sort();
    }
    (cuts, u)
}

/// Static certificate from an exactly equilibrated field `(λ, x)`: cut points per
/// piece and the scale `s` (largest f64 with `s² U ≤ 1`, exact when `U` is a rational
/// square); returns `(s λ, s x, cuts)`.
#[allow(clippy::type_complexity)]
pub fn static_certificate(lp: &LimitProblem, lam: &Q, x: &[Q]) -> Result<(Q, Vec<Q>, Vec<Vec<Vec<Q>>>), String> {
    if x.len() != lp.nv {
        return Err("static field has the wrong size".into());
    }
    for (terms, p) in &lp.rows {
        let s: Q = terms.iter().map(|(i, c)| c * &x[*i]).sum();
        if s != lam * p {
            return Err("static field is not in exact equilibrium".into());
        }
    }
    let piece_qs = |m: &YieldMember, pc: &YieldPiece| -> Vec<([Q; 4], Q)> {
        m.comps
            .iter()
            .zip(&pc.polys)
            .map(|(k, c)| {
                let q: [Q; 4] = std::array::from_fn(|j| c.0[j].eval(x, lam));
                (q, Q::one() / (&k.n * &k.mp_lo * &k.mp_lo))
            })
            .collect()
    };
    let mut all_qs = Vec::new();
    let mut ends = Vec::new();
    let mut index = Vec::new(); // (member, piece) per flattened piece
    for (mi, m) in lp.members.iter().enumerate() {
        for (pi, pc) in m.pieces.iter().enumerate() {
            all_qs.push(piece_qs(m, pc));
            ends.push((pc.a.clone(), pc.b.clone()));
            index.push((mi, pi));
        }
    }
    let (flat_cuts, u) = branch_and_bound(&all_qs, &ends, 60);
    let mut cuts: Vec<Vec<Vec<Q>>> = lp.members.iter().map(|m| vec![Vec::new(); m.pieces.len()]).collect();
    for ((mi, pi), c) in index.into_iter().zip(flat_cuts) {
        cuts[mi][pi] = c;
    }
    if !u.is_positive() {
        return Err("no bending moment anywhere: collapse factor unbounded in the bending-only model".into());
    }
    let s = match sqrt_exact(&u) {
        Some(r) => Q::one() / r,
        None => {
            let mut sf = 1.0 / to_f64(&u).sqrt();
            if !sf.is_finite() || sf <= 0.0 {
                return Err("yield bound out of range".into());
            }
            loop {
                let sq = q(sf).ok_or("yield bound out of range")?;
                if &sq * &sq * &u <= Q::one() {
                    break sq;
                }
                sf = sf.next_down();
            }
        }
    };
    Ok((&s * lam, x.iter().map(|v| &s * v).collect(), cuts))
}

// ───────────────────────────── kinematic certificate ─────────────────────────────

/// A hinge of the kinematic certificate as the bundle states it.
#[derive(Debug, Clone)]
pub struct HingeCert {
    pub member: usize,
    pub piece: usize,
    pub t: Q,
    pub theta: Vec<Q>,
    pub diss: Q,
}

/// The piece of member `m` the hinge at `t` reads its moment from: the end pieces
/// `[0, 0]` / `[1, 1]` at the member ends, else the first piece containing `t`
/// (pieces meet only where the moment is continuous for a valid mechanism).
fn hinge_piece(m: &YieldMember, t: &Q) -> Option<usize> {
    if let Some(k) = m.pieces.iter().position(|p| p.a == p.b && p.a == *t) {
        return Some(k);
    }
    m.pieces.iter().position(|p| p.a < p.b && p.a <= *t && *t <= p.b)
}

/// Kinematic certificate: multipliers, hinges (with pieces and dissipation bounds)
/// and `λ_up` with `Σ D_h = λ_up W`.
pub fn kinematic_certificate(lp: &LimitProblem, hinges: &[HingeRot]) -> Result<(Vec<Q>, Vec<HingeCert>, Q), String> {
    let mut g = vec![Q::zero(); lp.nv];
    let mut hlam = Q::zero();
    let mut certs = Vec::new();
    for h in hinges {
        let m = lp.members.get(h.member).ok_or("hinge on an unknown member")?;
        let k = hinge_piece(m, &h.t).ok_or("hinge outside its member")?;
        let pc = &m.pieces[k];
        let w = [Q::one(), h.t.clone(), &h.t * &h.t, &h.t * &h.t * &h.t];
        for (c, th) in h.theta.iter().enumerate() {
            if th.is_zero() {
                continue;
            }
            for (j, lf) in pc.polys[c].0.iter().enumerate() {
                for (i, a) in &lf.terms {
                    g[*i] += th * &w[j] * a;
                }
                hlam += th * &w[j] * &lf.lam;
            }
        }
        certs.push(HingeCert { member: h.member, piece: k, t: h.t.clone(), theta: h.theta.clone(), diss: Q::zero() });
    }
    // Aᵀ u = g
    let nr = lp.rows.len();
    let mut at = vec![vec![Q::zero(); nr]; lp.nv];
    for (r, (terms, _)) in lp.rows.iter().enumerate() {
        for (i, a) in terms {
            at[*i][r] += a;
        }
    }
    let mut u = rref_solve(&at, Some(&g), nr)
        .particular
        .ok_or("the mechanism's virtual-work identity has no multipliers (incompatible mechanism)")?;
    let mut work: Q = lp.rows.iter().zip(&u).map(|((_, p), ur)| p * ur).sum::<Q>() + hlam;
    if work.is_zero() {
        return Err("mechanism external work is zero".into());
    }
    if work.is_negative() {
        work = -work;
        for v in &mut u {
            *v = -v.clone();
        }
        for h in &mut certs {
            for th in &mut h.theta {
                *th = -th.clone();
            }
        }
    }
    let mut diss = Q::zero();
    for h in &mut certs {
        let m = &lp.members[h.member];
        let d2: Q = m.comps.iter().zip(&h.theta).map(|(k, th)| th * th * &k.n * &k.mp_hi * &k.mp_hi).sum();
        h.diss = sqrt_up(&d2);
        diss += &h.diss;
    }
    Ok((u, certs, &diss / &work))
}

// ───────────────────────────── JSON ─────────────────────────────

/// A rational as decimal text `"n"` or `"n/d"` (exact).
pub fn qs(x: &Q) -> String {
    x.to_string()
}

/// Inverse of `qs`.
pub fn parse_q(s: &str) -> Result<Q, String> {
    s.parse::<Q>().map_err(|e| format!("bad rational {s:?}: {e}"))
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinJson {
    pub terms: Vec<(usize, String)>,
    pub lam: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowJson {
    pub terms: Vec<(usize, String)>,
    pub p: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompJson {
    pub n: String,
    pub mp_lo: String,
    pub mp_hi: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PieceJson {
    pub a: String,
    pub b: String,
    /// Per component, the four coefficient functionals of `M_c(t)`.
    pub polys: Vec<[LinJson; 4]>,
    /// Static certificate: interior cut points of `[a, b]`, increasing.
    pub cuts: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberJson {
    pub element_id: usize,
    pub comps: Vec<CompJson>,
    pub pieces: Vec<PieceJson>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaticJson {
    pub lambda: String,
    pub x: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HingeJson {
    pub member: usize,
    pub element_id: usize,
    pub piece: usize,
    pub t: String,
    pub theta: Vec<String>,
    pub diss: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KinematicJson {
    pub multipliers: Vec<String>,
    pub hinges: Vec<HingeJson>,
    pub lambda: String,
}

/// Human-readable copies (ignored by the checker).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticInfo {
    pub lambda_lower: f64,
    pub lambda_upper: f64,
    pub note: String,
}

/// A plastic-collapse certificate bundle (JSON format `stabileo.plastic-certificate.v1`).
///
/// Claim (Lean `Certify.Plastic.check_sound`): for every choice of plastic moments
/// `Mp_c ∈ [mpLo_c, mpHi_c]`, the collapse load factor `λ_c` of the problem
/// (`rows`, `members`) satisfies `static.lambda ≤ λ_c ≤ kinematic.lambda`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticBundle {
    pub format: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub structured_diagnostics: Vec<serde_json::Value>,
    pub provenance: Provenance,
    pub dim: u8,
    pub nv: usize,
    pub rows: Vec<RowJson>,
    pub members: Vec<MemberJson>,
    #[serde(rename = "static")]
    pub static_cert: StaticJson,
    pub kinematic: KinematicJson,
    pub info: PlasticInfo,
}

impl PlasticBundle {
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).expect("bundle serializes")
    }

    pub fn from_json(s: &str) -> Result<Self, String> {
        serde_json::from_str(s).map_err(|e| format!("bundle parse error: {e}"))
    }
}

fn terms_json(t: &[(usize, Q)]) -> Vec<(usize, String)> {
    t.iter().map(|(i, c)| (*i, qs(c))).collect()
}

fn lin_json(l: &LinF) -> LinJson {
    LinJson { terms: terms_json(&l.terms), lam: qs(&l.lam) }
}

/// Assemble the bundle from the problem and the two candidates.
pub fn plastic_bundle(
    lp: &LimitProblem,
    dim: u8,
    provenance: Provenance,
    field: (&Q, &[Q]),
    hinges: &[HingeRot],
) -> Result<PlasticBundle, String> {
    let (lam_lo, x, cuts) = static_certificate(lp, field.0, field.1)?;
    let (mult, hcerts, lam_up) = kinematic_certificate(lp, hinges)?;
    let members = lp
        .members
        .iter()
        .zip(&cuts)
        .map(|(m, mc)| MemberJson {
            element_id: m.element_id,
            comps: m.comps.iter().map(|k| CompJson { n: qs(&k.n), mp_lo: qs(&k.mp_lo), mp_hi: qs(&k.mp_hi) }).collect(),
            pieces: m
                .pieces
                .iter()
                .zip(mc)
                .map(|(p, c)| PieceJson {
                    a: qs(&p.a),
                    b: qs(&p.b),
                    polys: p.polys.iter().map(|cf| std::array::from_fn(|j| lin_json(&cf.0[j]))).collect(),
                    cuts: c.iter().map(qs).collect(),
                })
                .collect(),
        })
        .collect();
    Ok(PlasticBundle {
        format: PLASTIC_BUNDLE_FORMAT.into(),
        structured_diagnostics: vec![],
        provenance,
        dim,
        nv: lp.nv,
        rows: lp.rows.iter().map(|(t, p)| RowJson { terms: terms_json(t), p: qs(p) }).collect(),
        members,
        static_cert: StaticJson { lambda: qs(&lam_lo), x: x.iter().map(qs).collect() },
        kinematic: KinematicJson {
            multipliers: mult.iter().map(qs).collect(),
            hinges: hcerts
                .iter()
                .map(|h| HingeJson {
                    member: h.member,
                    element_id: lp.members[h.member].element_id,
                    piece: h.piece,
                    t: qs(&h.t),
                    theta: h.theta.iter().map(qs).collect(),
                    diss: qs(&h.diss),
                })
                .collect(),
            lambda: qs(&lam_up),
        },
        info: PlasticInfo {
            lambda_lower: to_f64_down(&lam_lo).unwrap_or(f64::NAN),
            lambda_upper: to_f64_up(&lam_up).unwrap_or(f64::NAN),
            note: "rationals are exact \"n/d\" text; check with `lake exe certcheck`".into(),
        },
    })
}

fn kinds() -> [&'static str; 2] {
    [KIND_PLASTIC_STATIC, KIND_PLASTIC_KINEMATIC]
}

/// Run the 2D plastic solver, certify the collapse factor and export the bundle.
pub fn export_plastic_bundle_2d(input: &PlasticInput) -> Result<PlasticBundle, String> {
    super::finite::check_input(input)?;
    // A non-finite solver result is not even used as a candidate.
    let solver = crate::known_issues::optional_solve(solve_plastic_2d(input))?.filter(|r| super::finite::check_results(r).is_ok());
    let model = build_model(input)?;
    let c = plastic_candidates(&model, solver.as_ref())?;
    let field = c.static_field.ok_or_else(|| format!("lower bound: {}", c.static_reason.unwrap_or_default()))?;
    let mech = c.mechanism.ok_or_else(|| format!("upper bound: {}", c.mechanism_reason.unwrap_or_default()))?;
    let lp = limit_problem_2d(&model);
    let chk = check_mechanism(&model, &mech)?;
    let hinges = chk
        .hinges
        .iter()
        .map(|(id, t, th)| {
            let member = lp.members.iter().position(|m| m.element_id == *id).ok_or("hinge on a member without Mp")?;
            Ok(HingeRot { member, t: t.clone(), theta: vec![th.clone()] })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let x: Vec<Q> = field.elems.iter().flat_map(|e| e.iter().cloned()).collect();
    let prov = Provenance::new(input, "PlasticInput", &kinds())?;
    let mut bundle = plastic_bundle(&lp, 2, prov, (&field.lambda, &x), &hinges)?;
    if let Some(results) = solver {
        bundle.structured_diagnostics = results.steps.iter().flat_map(|step| &step.results.structured_diagnostics)
            .map(|d| serde_json::to_value(d).expect("diagnostic serializes")).collect();
    }
    super::finite::finite_output(Ok(bundle))
}

/// Run the 3D plastic solver, certify the collapse factor and export the bundle.
pub fn export_plastic_bundle_3d(input: &PlasticInput3D) -> Result<PlasticBundle, String> {
    super::finite::check_input(input)?;
    let solver = crate::known_issues::optional_solve(solve_plastic_3d(input))?.filter(|r| super::finite::check_results(r).is_ok());
    let model = build_model_3d(input)?;
    let c = plastic_candidates_3d(&model, solver.as_ref().map(|r| (input, r)))?;
    let field = c.static_field.ok_or_else(|| format!("lower bound: {}", c.static_reason.unwrap_or_default()))?;
    let mech = c.mechanism.ok_or_else(|| format!("upper bound: {}", c.mechanism_reason.unwrap_or_default()))?;
    let lp = limit_problem_3d(&model);
    let hinges = mechanism_rotations_3d(&model, &mech)?
        .into_iter()
        .map(|(id, t, th)| {
            let member = lp.members.iter().position(|m| m.element_id == id).ok_or("hinge on a member without Mp")?;
            Ok(HingeRot { member, t, theta: th.to_vec() })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let x: Vec<Q> = field.elems.iter().flat_map(|e| e.iter().cloned()).collect();
    let prov = Provenance::new(input, "PlasticInput3D", &kinds())?;
    let mut bundle = plastic_bundle(&lp, 3, prov, (&field.lambda, &x), &hinges)?;
    if let Some(results) = solver {
        bundle.structured_diagnostics = results.structured_diagnostics.iter()
            .map(|d| serde_json::to_value(d).expect("diagnostic serializes")).collect();
    }
    super::finite::finite_output(Ok(bundle))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bern_bounds_a_cubic() {
        // p(t) = t − t³ on [0, 1]: max 2/(3√3) ≈ 0.3849
        let q = [qi(0), qi(1), qi(0), qi(-1)];
        let b = bern(&q, &qi(0), &qi(1));
        assert!(to_f64(&b) >= 2.0 / (3.0 * 3f64.sqrt()));
        let qs = vec![vec![(q.clone(), qi(1))]];
        let (cuts, u) = branch_and_bound(&qs, &[(qi(0), qi(1))], 60);
        let exact = 4.0 / 27.0; // max p² = (2/(3√3))²
        assert!(to_f64(&u) >= exact && to_f64(&u) <= exact * (1.0 + 1e-8), "{}", to_f64(&u));
        assert!(cuts[0].windows(2).all(|w| w[0] < w[1]));
    }

    #[test]
    fn rationals_round_trip() {
        for x in [qr(-3, 4), qi(7), qr(1, 3), Q::zero()] {
            assert_eq!(parse_q(&qs(&x)).unwrap(), x);
        }
    }
}
