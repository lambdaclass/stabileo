//! Certified plastic collapse load factor for 3D frames (docs/verification/CERTIFY.md,
//! "Plastic collapse load factor, 3D").
//!
//! The solver (`solver::plastic::solve_plastic_3d`) runs an event-to-event hinge
//! analysis with the biaxial bending yield condition
//! `(My/Mp_y)² + (Mz/Mp_z)² ≤ 1` (local axes; axial force, shear and torsion
//! unlimited). This module encloses the exact collapse load factor `λ_c` of the
//! same rigid–perfectly plastic model (with associated flow) by the two plastic
//! theorems, both checked in exact rational arithmetic:
//!
//! * **Static (lower bound).** Member end forces `(F, Mᵢ)` in exact equilibrium
//!   with `λ·P` (every free nodal DOF, every release) whose section moment
//!   `C(t)` satisfies `f(t) = (C·u_y)²/(|u_y|² Mp_y²) + (C·u_z)²/(|u_z|² Mp_z²) ≤ 1`
//!   along every member. `f` is a polynomial of degree ≤ 6 in `t` with rational
//!   coefficients (the yield condition is a quadratic form, so no square roots
//!   are needed); its maximum is bounded exactly with Bernstein coefficients.
//! * **Kinematic (upper bound).** A mechanism of rigid segments compatible with
//!   the supports, whose hinges turn only about axes normal to the member (no
//!   torsional discontinuity unless released), with work `W > 0`, gives
//!   `λ_c ≤ D/W`, `D = Σ √(Mp_y² ρ_y² + Mp_z² ρ_z²)` — the support function of
//!   the same ellipse, each square root bounded *above* by a rational.
//!
//! Candidates come from an f64 limit-analysis LP with the ellipse replaced by
//! tangent cuts (an outer polygon refined at the violated sections, Kelley's
//! cutting-plane method), from the incremental solver's final state, and from
//! the LP's dual (hinge locations and rotations), turned into an exact
//! mechanism through the exact compatibility null space.

use super::exact::*;
use super::plastic_bundle::{sparse_rows, CubicF, LimitProblem, LinF, YieldComp, YieldMember, YieldPiece};
use super::plastic::{approx_mp, least_squares, lm_end, lm_pieces, push_breakpoints, simplex_min_sum, ElemLoad, Piece};
use crate::solver::plastic::{solve_plastic_3d, PlasticResult3D};
use crate::types::*;
use num_traits::{One, Signed, Zero};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Exact checks are cubic in the model size; larger models are refused.
pub const MAX_PLASTIC_ELEMENTS_3D: usize = 120;

pub type V3 = [Q; 3];

fn v0() -> V3 {
    [Q::zero(), Q::zero(), Q::zero()]
}
fn dot(a: &V3, b: &V3) -> Q {
    &a[0] * &b[0] + &a[1] * &b[1] + &a[2] * &b[2]
}
fn cross(a: &V3, b: &V3) -> V3 {
    [&a[1] * &b[2] - &a[2] * &b[1], &a[2] * &b[0] - &a[0] * &b[2], &a[0] * &b[1] - &a[1] * &b[0]]
}
fn add(a: &V3, b: &V3) -> V3 {
    [&a[0] + &b[0], &a[1] + &b[1], &a[2] + &b[2]]
}
fn sub(a: &V3, b: &V3) -> V3 {
    [&a[0] - &b[0], &a[1] - &b[1], &a[2] - &b[2]]
}
fn scale(k: &Q, a: &V3) -> V3 {
    [k * &a[0], k * &a[1], k * &a[2]]
}
fn neg(a: &V3) -> V3 {
    [-&a[0], -&a[1], -&a[2]]
}
fn vf(a: &V3) -> [f64; 3] {
    [to_f64(&a[0]), to_f64(&a[1]), to_f64(&a[2])]
}

/// Smallest-ish rational `r ≥ √x` (exact when `x` is a rational square).
pub fn sqrt_up(x: &Q) -> Q {
    if !x.is_positive() {
        return Q::zero();
    }
    if let Some(r) = sqrt_exact(x) {
        return r;
    }
    let mut f = to_f64(x).sqrt();
    loop {
        let r = q(f).unwrap_or_else(|| x.clone() + Q::one());
        if &(&r * &r) >= x {
            return r;
        }
        f = f.next_up();
    }
}

// ───────────────────────────── model ─────────────────────────────

/// Axial distributed load `q(t)` from `ta` to `tb`, linear (per unit length).
#[derive(Debug, Clone)]
pub struct AxialLoad {
    pub ta: Q,
    pub tb: Q,
    pub qi: Q,
    pub qj: Q,
}

#[derive(Debug, Clone)]
pub struct PElem3 {
    pub id: usize,
    pub ni: usize,
    pub nj: usize,
    pub d: V3,
    pub l2: Q,
    pub l: Option<Q>,
    /// Exact directions of the local y and z axes (orthogonal to `d` and to
    /// each other); unit vectors when `frame` is set.
    pub uy: V3,
    pub uz: V3,
    pub ny: Q,
    pub nz: Q,
    /// Exact unit local axes `(e_x, e_y, e_z)` when they are rational
    /// (required for member loads).
    pub frame: Option<[V3; 3]>,
    /// Releases `[end i, end j] × [torsion, y, z]` (a truss: all).
    pub rel: [[bool; 3]; 2],
    /// `[(Mp_y lo, hi), (Mp_z lo, hi)]`; `None` = no hinge can form.
    pub mp: Option<[(Q, Q); 2]>,
    /// Transverse member loads along local y and local z (2D load type, `p`
    /// along the axis), and axial loads.
    pub loads_y: Vec<ElemLoad>,
    pub loads_z: Vec<ElemLoad>,
    pub loads_x: Vec<AxialLoad>,
    /// `Lm_y(t)`, `Lm_z(t)` on common pieces.
    pub pieces_y: Vec<Piece>,
    pub pieces_z: Vec<Piece>,
}

impl PElem3 {
    fn loaded(&self) -> bool {
        !self.loads_y.is_empty() || !self.loads_z.is_empty() || !self.loads_x.is_empty()
    }

    /// Resultant `W` of the member loads (per unit load factor).
    fn resultant(&self) -> V3 {
        let Some([ex, ey, ez]) = &self.frame else { return v0() };
        let l = self.l.as_ref().expect("a rational frame has a rational length");
        let int = |loads: &[ElemLoad]| -> Q {
            let mut s = Q::zero();
            for ld in loads {
                match ld {
                    ElemLoad::Dist { ta, tb, qi: a, qj: b } => s += (a + b) / qi(2) * (tb - ta) * l,
                    ElemLoad::Point { p, .. } => s += p,
                }
            }
            s
        };
        let wx: Q = self.loads_x.iter().map(|a| (&a.qi + &a.qj) / qi(2) * (&a.tb - &a.ta) * l).sum();
        add(&add(&scale(&wx, ex), &scale(&int(&self.loads_y), ey)), &scale(&int(&self.loads_z), ez))
    }

    /// `Lm3(1)`: moment of the member loads about node j.
    fn lm1(&self) -> V3 {
        let Some([_, ey, ez]) = &self.frame else { return v0() };
        let lmy = lm_end(&self.loads_y, self.l.as_ref(), &self.l2);
        let lmz = lm_end(&self.loads_z, self.l.as_ref(), &self.l2);
        sub(&scale(&lmy, ez), &scale(&lmz, ey))
    }
}

#[derive(Debug, Clone)]
pub struct PlasticModel3 {
    pub node_ids: Vec<usize>,
    pub restrained: Vec<[bool; 6]>,
    /// Reference nodal loads `(fx, fy, fz, mx, my, mz)`, multiplied by λ.
    pub nodal: Vec<[Q; 6]>,
    pub elems: Vec<PElem3>,
}

fn mp_3d(sec: &PlasticSectionData3D, fy: f64, over: Option<[f64; 2]>) -> Result<Option<[(Q, Q); 2]>, String> {
    if let Some(o) = over {
        let a = q(o[0]).ok_or("non-finite Mp override")?;
        let b = q(o[1]).ok_or("non-finite Mp override")?;
        if !a.is_positive() || !b.is_positive() {
            return Err("Mp overrides must be positive".into());
        }
        return Ok(Some([(a.clone(), a), (b.clone(), b)]));
    }
    let fyk = q(fy).ok_or("non-finite fy")? * qi(1000);
    let fq = |x: f64| q(x).ok_or_else(|| "non-finite section dimension".to_string());
    let exact = |m: Q| -> Result<Option<(Q, Q)>, String> {
        if !m.is_positive() {
            return Err("non-positive plastic moment".into());
        }
        Ok(Some((m.clone(), m)))
    };
    // as `compute_plastic_moments_3d`
    let mpy = if let (Some(b), Some(h)) = (sec.b, sec.h) {
        exact(&fyk * fq(b)? * fq(h)? * fq(h)? / qi(4))?
    } else if sec.iy > 1e-20 {
        Some(approx_mp(&fyk, sec.iy, sec.a)?)
    } else {
        None
    };
    let mpz = if let (Some(b), Some(d)) = (sec.b, sec.d) {
        exact(&fyk * fq(d)? * fq(b)? * fq(b)? / qi(4))?
    } else if let (Some(b), Some(h)) = (sec.b, sec.h) {
        exact(&fyk * fq(h)? * fq(b)? * fq(b)? / qi(4))?
    } else if sec.iz > 1e-20 {
        Some(approx_mp(&fyk, sec.iz, sec.a)?)
    } else {
        None
    };
    Ok(match (mpy, mpz) {
        (Some(y), Some(z)) => Some([y, z]),
        _ => None,
    })
}

/// Exact local y and z directions, following `compute_local_axes_3d` branch
/// for branch (its f64 tests decide the branch).
fn exact_axes(el: &SolverElement3D, d: &V3, l2: &Q, left_hand: bool) -> Result<(V3, V3), String> {
    let df = vf(d);
    let ex = crate::element::unit_direction(df[0], df[1], df[2]);
    // The f64 direction only picks the reference axis; on overflow (huge
    // coordinates) it is 0 or NaN and could pick an axis parallel to the
    // member.
    let n2: f64 = ex.iter().map(|x| x * x).sum();
    if n2.is_nan() || n2 <= 0.5 {
        return Err(format!("element {}: direction not representable in f64", el.id));
    }
    let axis = |k: usize| {
        let mut v = v0();
        v[k] = Q::one();
        v
    };
    let mut uz = match (el.local_yx, el.local_yy, el.local_yz) {
        (Some(x), Some(y), Some(z)) if (x * x + y * y + z * z).sqrt() > 1e-10 => {
            let mag = (x * x + y * y + z * z).sqrt();
            let r = [x / mag, y / mag, z / mag];
            let c = [ex[1] * r[2] - ex[2] * r[1], ex[2] * r[0] - ex[0] * r[2], ex[0] * r[1] - ex[1] * r[0]];
            if (c[0] * c[0] + c[1] * c[1] + c[2] * c[2]).sqrt() < 1e-10 {
                cross(d, &axis(if ex[0].abs() < 0.9 { 0 } else { 1 }))
            } else {
                let rq = [q(x).ok_or("non-finite local y")?, q(y).ok_or("non-finite local y")?, q(z).ok_or("non-finite local y")?];
                cross(d, &rq)
            }
        }
        _ => {
            let up = axis(if ex[2].abs() > 0.999 { 0 } else { 2 });
            sub(&scale(l2, &up), &scale(&dot(&up, d), d))
        }
    };
    let mut uy = cross(&uz, d);
    if let Some(a) = el.roll_angle {
        let k = a / 90.0;
        if k.fract() != 0.0 {
            return Err(format!("element {}: roll angle {a}° is not a multiple of 90°", el.id));
        }
        match (k.rem_euclid(4.0)) as i64 {
            1 => (uy, uz) = (uz.clone(), neg(&uy)),
            2 => (uy, uz) = (neg(&uy), neg(&uz)),
            3 => (uy, uz) = (neg(&uz), uy.clone()),
            _ => {}
        }
    }
    if left_hand {
        uy = neg(&uy);
    }
    Ok((uy, uz))
}

/// Translate the solver input into the exact rigid-plastic model, or refuse.
pub fn build_model_3d(input: &PlasticInput3D) -> Result<PlasticModel3, String> {
    // Exact rational arithmetic: its cost grows with the bit length of the
    // data, and an input value of ±1e300 or a subnormal made it run for
    // minutes (issue #335 property tests). Models in any unit system stay far
    // inside this range; outside it the certificate is refused, not slow.
    super::finite::check_magnitudes(input, super::plastic::EXACT_MIN_ABS, super::plastic::EXACT_MAX_ABS)?;
    let s = &input.solver;
    if !s.constraints.is_empty() {
        return Err("constraints are not supported by the plastic certificate".into());
    }
    if !s.connectors.is_empty() {
        return Err("connectors are not supported by the plastic certificate".into());
    }
    if !s.plates.is_empty() || !s.quads.is_empty() || !s.quad9s.is_empty() || !s.solid_shells.is_empty() || !s.curved_shells.is_empty() {
        return Err("shell elements are not part of the plastic certificate".into());
    }
    if !s.curved_beams.is_empty() {
        return Err("curved beams are not supported by the plastic certificate".into());
    }
    if s.elements.len() > MAX_PLASTIC_ELEMENTS_3D {
        return Err(format!("more than {MAX_PLASTIC_ELEMENTS_3D} members: too large for the exact check"));
    }
    let left_hand = s.left_hand.unwrap_or(false);
    let mut node_list: Vec<&SolverNode3D> = crate::ordered::values(&s.nodes).collect();
    node_list.sort_by_key(|n| n.id);
    let idx: HashMap<usize, usize> = node_list.iter().enumerate().map(|(i, n)| (n.id, i)).collect();
    let coords: Vec<V3> = node_list
        .iter()
        .map(|n| {
            let c = |x: f64| q(x).ok_or_else(|| "non-finite node coordinate".to_string());
            Ok([c(n.x)?, c(n.y)?, c(n.z)?])
        })
        .collect::<Result<_, String>>()?;
    let nn = node_list.len();

    let mut restrained = vec![[false; 6]; nn];
    let mut sups: Vec<(&String, &SolverSupport3D)> = s.supports.iter().collect();
    sups.sort_by(|a, b| a.0.cmp(b.0));
    for (_, sup) in sups {
        let n = *idx.get(&sup.node_id).ok_or("support on unknown node")?;
        for k in [sup.kx, sup.ky, sup.kz, sup.krx, sup.kry, sup.krz, sup.kw].into_iter().flatten() {
            if k != 0.0 {
                return Err("spring supports are not part of the rigid-plastic model".into());
            }
        }
        if sup.is_inclined == Some(true) {
            return Err("inclined supports are not supported".into());
        }
        for v in [sup.dx, sup.dy, sup.dz, sup.drx, sup.dry, sup.drz].into_iter().flatten() {
            if v != 0.0 {
                return Err("prescribed support displacements are not supported".into());
            }
        }
        let r = [sup.rx, sup.ry, sup.rz, sup.rrx, sup.rry, sup.rrz];
        for k in 0..6 {
            restrained[n][k] |= r[k];
        }
    }

    let mut mp_by_sec: HashMap<usize, Option<[(Q, Q); 2]>> = HashMap::new();
    for (sid, sec) in &input.sections {
        let sec_id: usize = sid.parse().unwrap_or(0);
        let over = input.mp_overrides.as_ref().and_then(|m| m.get(sid)).copied();
        let fy = input.materials.get(&sec.material_id.to_string()).and_then(|m| m.fy).unwrap_or(250.0);
        mp_by_sec.insert(sec_id, mp_3d(sec, fy, over)?);
    }

    let mut elem_list: Vec<&SolverElement3D> = crate::ordered::values(&s.elements).collect();
    elem_list.sort_by_key(|e| e.id);
    let eidx: HashMap<usize, usize> = elem_list.iter().enumerate().map(|(i, e)| (e.id, i)).collect();
    let mut elems = Vec::with_capacity(elem_list.len());
    for el in &elem_list {
        let (rel, frame_elem) = match el.elem_type.as_str() {
            "frame" => (
                [
                    [el.release_t_start, el.release_my_start, el.release_mz_start],
                    [el.release_t_end, el.release_my_end, el.release_mz_end],
                ],
                true,
            ),
            "truss" => ([[true; 3]; 2], false),
            t => return Err(format!("element type '{t}' is not supported by the plastic certificate")),
        };
        let ni = *idx.get(&el.node_i).ok_or("element on unknown node")?;
        let nj = *idx.get(&el.node_j).ok_or("element on unknown node")?;
        let d = sub(&coords[nj], &coords[ni]);
        let l2 = dot(&d, &d);
        if l2.is_zero() {
            return Err(format!("element {} has zero length", el.id));
        }
        let (uy, uz) = exact_axes(el, &d, &l2, left_hand)?;
        let (ny, nz) = (dot(&uy, &uy), dot(&uz, &uz));
        if ny.is_zero() || nz.is_zero() {
            return Err(format!("element {}: degenerate local axes (reference axis parallel to the member)", el.id));
        }
        let l = sqrt_exact(&l2);
        let frame = match (&l, sqrt_exact(&ny), sqrt_exact(&nz)) {
            (Some(l), Some(a), Some(b)) => Some([scale(&(Q::one() / l), &d), scale(&(Q::one() / &a), &uy), scale(&(Q::one() / &b), &uz)]),
            _ => None,
        };
        let (uy, uz, ny, nz) = match &frame {
            Some([_, ey, ez]) => (ey.clone(), ez.clone(), Q::one(), Q::one()),
            None => (uy, uz, ny, nz),
        };
        elems.push(PElem3 {
            id: el.id,
            ni,
            nj,
            d,
            l2,
            l,
            uy,
            uz,
            ny,
            nz,
            frame,
            rel,
            mp: if frame_elem { mp_by_sec.get(&el.section_id).cloned().flatten() } else { None },
            loads_y: Vec::new(),
            loads_z: Vec::new(),
            loads_x: Vec::new(),
            pieces_y: Vec::new(),
            pieces_z: Vec::new(),
        });
    }

    let frac = |e: &PElem3, x: f64, what: &str| -> Result<Q, String> {
        let xq = q(x).ok_or("non-finite load position")?;
        let l = e.l.as_ref().ok_or_else(|| format!("{what} on element {} of irrational length", e.id))?;
        let t = xq / l;
        if t.is_negative() || t > Q::one() {
            return Err(format!("{what} position outside element {}", e.id));
        }
        Ok(t)
    };
    let need_frame = |e: &PElem3, what: &str| -> Result<(), String> {
        if e.frame.is_none() {
            return Err(format!(
                "{what} on element {}: its local axes are not rational (length or axis norms irrational), \
                 not representable exactly",
                e.id
            ));
        }
        Ok(())
    };
    let mut nodal = vec![std::array::from_fn::<Q, 6, _>(|_| Q::zero()); nn];
    for load in &s.loads {
        match load {
            SolverLoad3D::Nodal(nl) => {
                let n = *idx.get(&nl.node_id).ok_or("load on unknown node")?;
                if nl.bw.is_some_and(|b| b != 0.0) {
                    return Err("bimoment loads are not part of the plastic certificate".into());
                }
                for (k, v) in [nl.fx, nl.fy, nl.fz, nl.mx, nl.my, nl.mz].into_iter().enumerate() {
                    nodal[n][k] += q(v).ok_or("non-finite load")?;
                }
            }
            SolverLoad3D::Distributed(dl) => {
                let ei = *eidx.get(&dl.element_id).ok_or("load on unknown element")?;
                let fl = |x: f64| q(x).ok_or_else(|| "non-finite load".to_string());
                let (xi, xj, yi, yj, zi, zj) = (fl(dl.q_xi)?, fl(dl.q_xj)?, fl(dl.q_yi)?, fl(dl.q_yj)?, fl(dl.q_zi)?, fl(dl.q_zj)?);
                if [&xi, &xj, &yi, &yj, &zi, &zj].iter().all(|v| v.is_zero()) {
                    continue;
                }
                let e = &elems[ei];
                need_frame(e, "distributed load")?;
                if e.mp.is_none() && e.rel == [[true; 3]; 2] && !(yi.is_zero() && yj.is_zero() && zi.is_zero() && zj.is_zero()) {
                    return Err(format!("transverse load on truss element {}", e.id));
                }
                let ta = match dl.a {
                    None => Q::zero(),
                    Some(a) => frac(e, a, "partial distributed load")?,
                };
                let tb = match dl.b {
                    None => Q::one(),
                    Some(b) => frac(e, b, "partial distributed load")?,
                };
                if tb < ta {
                    return Err(format!("distributed load with b < a on element {}", e.id));
                }
                if tb == ta {
                    continue;
                }
                let e = &mut elems[ei];
                if !(yi.is_zero() && yj.is_zero()) {
                    e.loads_y.push(ElemLoad::Dist { ta: ta.clone(), tb: tb.clone(), qi: yi, qj: yj });
                }
                if !(zi.is_zero() && zj.is_zero()) {
                    e.loads_z.push(ElemLoad::Dist { ta: ta.clone(), tb: tb.clone(), qi: zi, qj: zj });
                }
                if !(xi.is_zero() && xj.is_zero()) {
                    e.loads_x.push(AxialLoad { ta, tb, qi: xi, qj: xj });
                }
            }
            SolverLoad3D::PointOnElement(pl) => {
                let ei = *eidx.get(&pl.element_id).ok_or("load on unknown element")?;
                let (py, pz) = (q(pl.py).ok_or("non-finite load")?, q(pl.pz).ok_or("non-finite load")?);
                if py.is_zero() && pz.is_zero() {
                    continue;
                }
                let e = &elems[ei];
                need_frame(e, "point load")?;
                if e.mp.is_none() && e.rel == [[true; 3]; 2] {
                    return Err(format!("transverse load on truss element {}", e.id));
                }
                let ta = frac(e, pl.a, "point load")?;
                let e = &mut elems[ei];
                for (p, list) in [(py, &mut e.loads_y), (pz, &mut e.loads_z)] {
                    if !p.is_zero() {
                        list.push(ElemLoad::Point { ta: ta.clone(), p, px: Q::zero(), my: Q::zero() });
                    }
                }
            }
            SolverLoad3D::Thermal(tl) => {
                if tl.dt_uniform != 0.0 || tl.dt_gradient_y != 0.0 || tl.dt_gradient_z != 0.0 {
                    return Err("thermal loads are not part of the plastic certificate".into());
                }
            }
            _ => return Err("shell, bimoment and other non-frame loads are not part of the plastic certificate".into()),
        }
    }
    for e in &mut elems {
        let mut bps = vec![Q::zero(), Q::one()];
        push_breakpoints(&e.loads_y, &mut bps);
        push_breakpoints(&e.loads_z, &mut bps);
        e.pieces_y = lm_pieces(&e.loads_y, e.l.as_ref(), &e.l2, &bps)?;
        e.pieces_z = lm_pieces(&e.loads_z, e.l.as_ref(), &e.l2, &bps)?;
    }
    Ok(PlasticModel3 { node_ids: node_list.iter().map(|n| n.id).collect(), restrained, nodal, elems })
}

// ───────────────────────────── exact checks ─────────────────────────────

/// Member end force `F` and moment `Mᵢ` exerted by node i on the member
/// (global axes), per member: `[Fx, Fy, Fz, Mx, My, Mz]`, at load factor `lambda`.
#[derive(Debug, Clone)]
pub struct StaticField3 {
    pub lambda: Q,
    pub elems: Vec<[Q; 6]>,
}

#[derive(Debug, Clone)]
pub struct StaticCheck3 {
    pub lambda_lower: Q,
    pub scale: Q,
}

/// Polynomial product (monomial coefficients).
fn pmul(a: &[Q], b: &[Q]) -> Vec<Q> {
    let mut c = vec![Q::zero(); a.len() + b.len() - 1];
    for (i, x) in a.iter().enumerate() {
        if x.is_zero() {
            continue;
        }
        for (j, y) in b.iter().enumerate() {
            c[i + j] += x * y;
        }
    }
    c
}

/// Bernstein coefficients of `p` on `[a, b]`.
fn to_bernstein(c: &[Q], a: &Q, b: &Q) -> Vec<Q> {
    let n = c.len() - 1;
    // Taylor shift to a: coefficients of p(a + s)
    let mut d = c.to_vec();
    for i in 0..n {
        for j in (i..n).rev() {
            let t = &d[j + 1] * a;
            d[j] += t;
        }
    }
    // scale s = h u
    let h = b - a;
    let mut hp = Q::one();
    for dj in d.iter_mut() {
        *dj *= &hp;
        hp *= &h;
    }
    // b_k = Σ_{j≤k} C(k,j)/C(n,j) d_j
    let binom = |n: usize, k: usize| -> Q {
        let mut r = Q::one();
        for i in 0..k {
            r = r * qi((n - i) as i64) / qi((i + 1) as i64);
        }
        r
    };
    (0..=n).map(|k| (0..=k).map(|j| binom(k, j) / binom(n, j) * &d[j]).sum()).collect()
}

/// Upper bound on `max p` over the interval of the Bernstein coefficients `bc`
/// (de Casteljau subdivision until the bound is within `tol` of the end values).
fn bernstein_max(bc: &[Q], tol: &Q, depth: u32) -> Q {
    let ub = bc.iter().cloned().max().unwrap();
    let ends = bc[0].clone().max(bc[bc.len() - 1].clone());
    if &ub - &ends <= *tol || depth == 0 {
        return ub;
    }
    let n = bc.len();
    let mut left = Vec::with_capacity(n);
    let mut right = vec![Q::zero(); n];
    let mut w = bc.to_vec();
    left.push(w[0].clone());
    right[n - 1] = w[n - 1].clone();
    for r in 1..n {
        for i in 0..n - r {
            w[i] = (&w[i] + &w[i + 1]) / qi(2);
        }
        left.push(w[0].clone());
        right[n - 1 - r] = w[n - 1 - r].clone();
    }
    bernstein_max(&left, tol, depth - 1).max(bernstein_max(&right, tol, depth - 1))
}

/// Section moment components `(C·u_y, C·u_z)` on piece `k` of member `e` as
/// cubic polynomials in `t`, for end values `F`, `Mᵢ` and load factor `λ`:
/// `C(t) = −Mᵢ + t (d × F) − λ Lm3(t)`, `Lm3 = Lm_y e_z − Lm_z e_y`.
fn section_polys(e: &PElem3, f: &[Q; 6], lam: &Q, k: usize) -> ([Q; 4], [Q; 4]) {
    let fv: V3 = [f[0].clone(), f[1].clone(), f[2].clone()];
    let mi: V3 = [f[3].clone(), f[4].clone(), f[5].clone()];
    let dxf = cross(&e.d, &fv);
    let (cy, cz) = (&e.pieces_y[k].c, &e.pieces_z[k].c);
    let has_loads = e.frame.is_some();
    let ly = |j: usize| if has_loads { lam * &cz[j] } else { Q::zero() };
    let lz = |j: usize| if has_loads { -(lam * &cy[j]) } else { Q::zero() };
    (
        [-dot(&mi, &e.uy) + ly(0), dot(&dxf, &e.uy) + ly(1), ly(2), ly(3)],
        [-dot(&mi, &e.uz) + lz(0), dot(&dxf, &e.uz) + lz(1), lz(2), lz(3)],
    )
}

/// Exact static-theorem check: equilibrium at every free nodal DOF and every
/// release, an exact bound `U_e ≥ max_t f_e(t)` along every member (Mp_lo),
/// and `λ_lo = s λ` with a rational `s ≤ min_e 1/√U_e`.
pub fn check_static_3d(model: &PlasticModel3, field: &StaticField3) -> Result<StaticCheck3, String> {
    if field.elems.len() != model.elems.len() {
        return Err("static field has the wrong number of members".into());
    }
    let lam = &field.lambda;
    if !lam.is_positive() {
        return Err("static field has λ ≤ 0".into());
    }
    let nn = model.node_ids.len();
    let mut sum = vec![std::array::from_fn::<Q, 6, _>(|_| Q::zero()); nn];
    let mut umax_all: Option<Q> = None;
    let tol = Q::one() / qi(1i64 << 40);
    for (e, f) in model.elems.iter().zip(&field.elems) {
        let fv: V3 = [f[0].clone(), f[1].clone(), f[2].clone()];
        let mi: V3 = [f[3].clone(), f[4].clone(), f[5].clone()];
        let fj = sub(&neg(&fv), &scale(lam, &e.resultant()));
        let mj = sub(&add(&neg(&mi), &cross(&e.d, &fv)), &scale(lam, &e.lm1()));
        for (end, m) in [(0, &mi), (1, &mj)] {
            for (k, v) in [&e.d, &e.uy, &e.uz].into_iter().enumerate() {
                if e.rel[end][k] && !dot(m, v).is_zero() {
                    return Err(format!(
                        "element {}: released {} moment at end {} is not zero",
                        e.id,
                        ["torsion", "y", "z"][k],
                        ["i", "j"][end]
                    ));
                }
            }
        }
        for k in 0..3 {
            sum[e.ni][k] += &fv[k];
            sum[e.ni][3 + k] += &mi[k];
            sum[e.nj][k] += &fj[k];
            sum[e.nj][3 + k] += &mj[k];
        }
        if let Some([(py, _), (pz, _)]) = &e.mp {
            let wy = Q::one() / (&e.ny * py * py);
            let wz = Q::one() / (&e.nz * pz * pz);
            for (k, pc) in e.pieces_y.iter().enumerate() {
                let (cy, cz) = section_polys(e, f, lam, k);
                let fy: Vec<Q> = pmul(&cy, &cy).into_iter().map(|x| x * &wy).collect();
                let fz = pmul(&cz, &cz);
                let fp: Vec<Q> = fy.iter().zip(&fz).map(|(a, b)| a + b * &wz).collect();
                let u = bernstein_max(&to_bernstein(&fp, &pc.a, &pc.b), &tol, 40);
                if umax_all.as_ref().is_none_or(|m| &u > m) {
                    umax_all = Some(u);
                }
            }
        }
    }
    for n in 0..nn {
        for k in 0..6 {
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
    let u = umax_all.filter(|u| u.is_positive()).ok_or("no bending moment anywhere: collapse factor unbounded in the bending-only model")?;
    // largest f64 s with s² U ≤ 1
    let mut sf = 1.0 / to_f64(&u).sqrt();
    if !sf.is_finite() || sf <= 0.0 {
        return Err("yield bound out of range".into());
    }
    let s = loop {
        let sq = q(sf).ok_or("yield bound out of range")?;
        if &sq * &sq * &u <= Q::one() {
            break sq;
        }
        sf = sf.next_down();
    };
    Ok(StaticCheck3 { lambda_lower: &s * lam, scale: s })
}

/// A collapse mechanism: nodal virtual displacements `(u, θ)` (6 per node) and,
/// per member, interior hinge positions `0 < t₁ < … < t_h < 1` with the rotation
/// vectors `ω₀ … ω_h` of the rigid segments between them.
#[derive(Debug, Clone)]
pub struct Mechanism3 {
    pub nodes: Vec<[Q; 6]>,
    pub elems: Vec<ElemMech3>,
}

#[derive(Debug, Clone)]
pub struct ElemMech3 {
    pub hinges: Vec<Q>,
    pub omegas: Vec<V3>,
}

#[derive(Debug, Clone)]
pub struct MechanismCheck3 {
    pub lambda_upper: Q,
    pub dissipation: Q,
    pub work: Q,
    /// (element id, position t, rotation about local y, about local z) of every
    /// dissipating hinge (f64 components, for reporting).
    pub hinges: Vec<(usize, Q, f64, f64)>,
}

/// Exact kinematic-theorem check (see the module docs); returns `λ_up = D/W`
/// with `D` bounded above.
pub fn check_mechanism_3d(model: &PlasticModel3, mech: &Mechanism3) -> Result<MechanismCheck3, String> {
    let (work, diss, hinges) = mechanism_terms(model, mech)?;
    if !work.is_positive() {
        return Err("mechanism external work is not positive".into());
    }
    Ok(MechanismCheck3 { lambda_upper: &diss / &work, dissipation: diss, work, hinges })
}

type HingeReport = (usize, Q, f64, f64);

/// Compatibility checks, external work and (upper-bounded) dissipation.
fn mechanism_terms(model: &PlasticModel3, mech: &Mechanism3) -> Result<(Q, Q, Vec<HingeReport>), String> {
    if mech.nodes.len() != model.node_ids.len() || mech.elems.len() != model.elems.len() {
        return Err("mechanism has the wrong size".into());
    }
    for (n, u) in mech.nodes.iter().enumerate() {
        for k in 0..6 {
            if model.restrained[n][k] && !u[k].is_zero() {
                return Err(format!("mechanism moves a restrained DOF at node {}", model.node_ids[n]));
            }
        }
    }
    let mut work = Q::zero();
    for (u, p) in mech.nodes.iter().zip(&model.nodal) {
        for k in 0..6 {
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
        let (ti, tj): (V3, V3) = ([ui[3].clone(), ui[4].clone(), ui[5].clone()], [uj[3].clone(), uj[4].clone(), uj[5].clone()]);
        let mut starts = Vec::with_capacity(h + 1);
        let mut p: V3 = [ui[0].clone(), ui[1].clone(), ui[2].clone()];
        for s in 0..=h {
            starts.push(p.clone());
            let dt = &ts[s + 1] - &ts[s];
            p = add(&p, &scale(&dt, &cross(&m.omegas[s], &e.d)));
        }
        if p != [uj[0].clone(), uj[1].clone(), uj[2].clone()] {
            return Err(format!("element {}: segments do not close on node j (incompatible)", e.id));
        }
        let mut rot = |rho: V3, t: Q, end: Option<usize>| -> Result<(), String> {
            let rel = end.map_or([false; 3], |k| e.rel[k]);
            let (rt, ry, rz) = (dot(&rho, &e.d), dot(&rho, &e.uy), dot(&rho, &e.uz));
            if !rt.is_zero() && !rel[0] {
                return Err(format!("element {}: torsional discontinuity at a hinge", e.id));
            }
            let ry = if rel[1] { Q::zero() } else { ry };
            let rz = if rel[2] { Q::zero() } else { rz };
            if ry.is_zero() && rz.is_zero() {
                return Ok(());
            }
            match &e.mp {
                None => Err(format!("element {}: hinge where no plastic hinge can form", e.id)),
                Some([(_, py), (_, pz)]) => {
                    let d2 = py * py * &ry * &ry / &e.ny + pz * pz * &rz * &rz / &e.nz;
                    diss += sqrt_up(&d2);
                    hinges.push((e.id, t, to_f64(&ry) / to_f64(&e.ny).sqrt(), to_f64(&rz) / to_f64(&e.nz).sqrt()));
                    Ok(())
                }
            }
        };
        rot(sub(&m.omegas[0], &ti), Q::zero(), Some(0))?;
        for s in 1..=h {
            rot(sub(&m.omegas[s], &m.omegas[s - 1]), ts[s].clone(), None)?;
        }
        rot(sub(&tj, &m.omegas[h]), Q::one(), Some(1))?;

        // work of the member loads
        if !e.loaded() {
            continue;
        }
        let [ex, ey, ez] = e.frame.as_ref().expect("loads need a rational frame");
        let l = e.l.as_ref().expect("loads need a rational length");
        let seg_of = |t: &Q| (0..=h).rfind(|&s| ts[s] <= *t).unwrap_or(0).min(h);
        let disp_at = |t: &Q| -> V3 {
            let s = seg_of(t);
            add(&starts[s], &scale(&(t - &ts[s]), &cross(&m.omegas[s], &e.d)))
        };
        let dist = |dir: &V3, ta: &Q, tb: &Q, qa: &Q, qb: &Q| -> Q {
            let mut work = Q::zero();
            let beta = (qb - qa) / (tb - ta);
            let alpha = qa - &beta * ta;
            for s in 0..=h {
                let s0 = ts[s].clone().max(ta.clone());
                let s1 = ts[s + 1].clone().min(tb.clone());
                if s1 <= s0 {
                    continue;
                }
                let bb = dot(dir, &cross(&m.omegas[s], &e.d));
                let aa = dot(dir, &starts[s]) - &bb * &ts[s];
                work += l
                    * (&alpha * &aa * (&s1 - &s0)
                        + (&alpha * &bb + &beta * &aa) * (&s1 * &s1 - &s0 * &s0) / qi(2)
                        + &beta * &bb * (&s1 * &s1 * &s1 - &s0 * &s0 * &s0) / qi(3));
            }
            work
        };
        for a in &e.loads_x {
            work += dist(ex, &a.ta, &a.tb, &a.qi, &a.qj);
        }
        for (dir, loads) in [(ey, &e.loads_y), (ez, &e.loads_z)] {
            for ld in loads {
                match ld {
                    ElemLoad::Dist { ta, tb, qi: qa, qj: qb } => work += dist(dir, ta, tb, qa, qb),
                    ElemLoad::Point { ta, p, .. } => work += p * dot(dir, &disp_at(ta)),
                }
            }
        }
    }
    Ok((work, diss, hinges))
}

// ───────────────────────────── candidates (heuristic) ─────────────────────────────

struct Equilibrium {
    xp: Vec<Q>,
    null: Vec<Vec<Q>>,
}

/// Exact particular solution and self-stress basis of `A x = λ b`,
/// `x = (F, Mᵢ)` per member.
fn equilibrium_system(model: &PlasticModel3) -> Result<Equilibrium, String> {
    let (rows, rhs) = equilibrium_rows(model);
    let r = rref_solve(&rows, Some(&rhs), 6 * model.elems.len());
    let xp = r.particular.ok_or("the loads admit no equilibrium state (the structure cannot carry them)")?;
    Ok(Equilibrium { xp, null: r.null_basis })
}

/// The equilibrium equations `A x = λ b` (dense rows of `A`, and `b`): every free
/// nodal DOF, then every release.
fn equilibrium_rows(model: &PlasticModel3) -> (Vec<Vec<Q>>, Vec<Q>) {
    let ne = model.elems.len();
    let n = 6 * ne;
    let nn = model.node_ids.len();
    let mut rows: Vec<Vec<Q>> = Vec::new();
    let mut rhs: Vec<Q> = Vec::new();
    let mut node_row = vec![[usize::MAX; 6]; nn];
    for i in 0..nn {
        for k in 0..6 {
            if !model.restrained[i][k] {
                node_row[i][k] = rows.len();
                rows.push(vec![Q::zero(); n]);
                rhs.push(model.nodal[i][k].clone());
            }
        }
    }
    // coefficient of F_c in (d × F)_m
    let dxf = |d: &V3, m: usize, c: usize| -> Q {
        let (a, b) = ((m + 1) % 3, (m + 2) % 3);
        if c == b {
            d[a].clone()
        } else if c == a {
            -d[b].clone()
        } else {
            Q::zero()
        }
    };
    for (ei, e) in model.elems.iter().enumerate() {
        let w = e.resultant();
        let lm1 = e.lm1();
        let c = 6 * ei;
        let ri = node_row[e.ni];
        let rj = node_row[e.nj];
        for k in 0..6 {
            if ri[k] != usize::MAX {
                rows[ri[k]][c + k] += Q::one();
            }
        }
        for k in 0..3 {
            if rj[k] != usize::MAX {
                rows[rj[k]][c + k] -= Q::one();
                rhs[rj[k]] += &w[k];
            }
            if rj[3 + k] != usize::MAX {
                let r = rj[3 + k];
                rows[r][c + 3 + k] -= Q::one();
                for cc in 0..3 {
                    let v = dxf(&e.d, k, cc);
                    if !v.is_zero() {
                        rows[r][c + cc] += v;
                    }
                }
                rhs[r] += &lm1[k];
            }
        }
        for (k, v) in [&e.d, &e.uy, &e.uz].into_iter().enumerate() {
            if e.rel[0][k] {
                let mut r = vec![Q::zero(); n];
                for m in 0..3 {
                    r[c + 3 + m] = v[m].clone();
                }
                rows.push(r);
                rhs.push(Q::zero());
            }
            if e.rel[1][k] {
                // v·(−Mᵢ + d × F) = λ v·Lm1 ; v·(d × F) = F·(v × d)
                let mut r = vec![Q::zero(); n];
                let vxd = cross(v, &e.d);
                for m in 0..3 {
                    r[c + 3 + m] = -v[m].clone();
                    r[c + m] = vxd[m].clone();
                }
                rows.push(r);
                rhs.push(dot(v, &lm1));
            }
        }
    }
    (rows, rhs)
}

/// The model as the generic limit-analysis problem of a certificate bundle
/// (`plastic_bundle`): the equilibrium rows over `x = (F, Mᵢ)` per member, and per
/// member with plastic moments the components `M_y = C·u_y`, `M_z = C·u_z` of the
/// section moment `C(t) = −Mᵢ + t (d × F) − λ Lm3(t)` with weights `n = |u|²`, so
/// that the yield condition reads `M_y²/(n_y Mp_y²) + M_z²/(n_z Mp_z²) ≤ 1`, on the end
/// sections `[0, 0]`, `[1, 1]` (`C = −Mᵢ`, `Mⱼ`) and on the load pieces.
pub fn limit_problem_3d(model: &PlasticModel3) -> LimitProblem {
    let (rows, rhs) = equilibrium_rows(model);
    let mut members = Vec::new();
    for (ei, e) in model.elems.iter().enumerate() {
        let Some([(ylo, yhi), (zlo, zhi)]) = &e.mp else { continue };
        let c = 6 * ei;
        let zero = || LinF::default();
        // −Mᵢ·u and F·(u × d) = (d × F)·u
        let mi = |u: &V3| -> Vec<(usize, Q)> { (0..3).map(|m| (c + 3 + m, -u[m].clone())).collect() };
        let dxf = |u: &V3| -> Vec<(usize, Q)> {
            let w = cross(u, &e.d);
            (0..3).map(|m| (c + m, w[m].clone())).collect()
        };
        let has_loads = e.frame.is_some();
        let lm1 = e.lm1();
        let point = |a: Q, fy: LinF, fz: LinF| YieldPiece {
            a: a.clone(),
            b: a,
            polys: vec![CubicF([fy, zero(), zero(), zero()]), CubicF([fz, zero(), zero(), zero()])],
        };
        let mut pieces = vec![point(Q::zero(), LinF::new(mi(&e.uy), Q::zero()), LinF::new(mi(&e.uz), Q::zero()))];
        for (py, pz) in e.pieces_y.iter().zip(&e.pieces_z) {
            // λ-coefficients: C·u_y gets +λ Lm_z, C·u_z gets −λ Lm_y (`section_polys`)
            let ly = |j: usize| if has_loads { pz.c[j].clone() } else { Q::zero() };
            let lz = |j: usize| if has_loads { -py.c[j].clone() } else { Q::zero() };
            pieces.push(YieldPiece {
                a: py.a.clone(),
                b: py.b.clone(),
                polys: vec![
                    CubicF([LinF::new(mi(&e.uy), ly(0)), LinF::new(dxf(&e.uy), ly(1)), LinF::new(vec![], ly(2)), LinF::new(vec![], ly(3))]),
                    CubicF([LinF::new(mi(&e.uz), lz(0)), LinF::new(dxf(&e.uz), lz(1)), LinF::new(vec![], lz(2)), LinF::new(vec![], lz(3))]),
                ],
            });
        }
        let mj = |u: &V3| -> LinF {
            let mut t = mi(u);
            t.extend(dxf(u));
            LinF::new(t, -dot(&lm1, u))
        };
        pieces.push(point(Q::one(), mj(&e.uy), mj(&e.uz)));
        members.push(YieldMember {
            element_id: e.id,
            comps: vec![
                YieldComp { n: e.ny.clone(), mp_lo: ylo.clone(), mp_hi: yhi.clone() },
                YieldComp { n: e.nz.clone(), mp_lo: zlo.clone(), mp_hi: zhi.clone() },
            ],
            pieces,
        });
    }
    LimitProblem { nv: 6 * model.elems.len(), rows: sparse_rows(&rows, &rhs), members }
}

/// The dissipating hinges of a mechanism, exactly: `(element id, t, [ρ·u_y/n_y,
/// ρ·u_z/n_z])` for the hinge rotation `ρ` (zeroing released components, as
/// `mechanism_terms` does), the multipliers of `(M_y, M_z)` in the virtual work.
pub fn mechanism_rotations_3d(model: &PlasticModel3, mech: &Mechanism3) -> Result<Vec<(usize, Q, [Q; 2])>, String> {
    check_mechanism_3d(model, mech)?;
    let mut out = Vec::new();
    for (e, m) in model.elems.iter().zip(&mech.elems) {
        let h = m.hinges.len();
        let ui = &mech.nodes[e.ni];
        let uj = &mech.nodes[e.nj];
        let ti: V3 = [ui[3].clone(), ui[4].clone(), ui[5].clone()];
        let tj: V3 = [uj[3].clone(), uj[4].clone(), uj[5].clone()];
        let mut push = |rho: V3, t: Q, end: Option<usize>| {
            let rel = end.map_or([false; 3], |k| e.rel[k]);
            let ry = if rel[1] { Q::zero() } else { dot(&rho, &e.uy) };
            let rz = if rel[2] { Q::zero() } else { dot(&rho, &e.uz) };
            if !(ry.is_zero() && rz.is_zero()) {
                out.push((e.id, t, [ry / &e.ny, rz / &e.nz]));
            }
        };
        push(sub(&m.omegas[0], &ti), Q::zero(), Some(0));
        for s in 1..=h {
            push(sub(&m.omegas[s], &m.omegas[s - 1]), m.hinges[s - 1].clone(), None);
        }
        push(sub(&tj, &m.omegas[h]), Q::one(), Some(1));
    }
    Ok(out)
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum Loc {
    EndI,
    EndJ,
    Interior,
}

/// f64 image of a member for the heuristics.
struct ElemF {
    d: [f64; 3],
    uy: [f64; 3],
    uz: [f64; 3],
    /// √ny Mp_y, √nz Mp_z (lo)
    sy: f64,
    sz: f64,
    /// pieces: (a, b, Lm_y coefficients, Lm_z coefficients)
    pieces: Vec<(f64, f64, [f64; 4], [f64; 4])>,
    loaded: bool,
}

fn elem_f64(e: &PElem3) -> ElemF {
    let c4 = |c: &[Q; 4]| [to_f64(&c[0]), to_f64(&c[1]), to_f64(&c[2]), to_f64(&c[3])];
    let (sy, sz) = match &e.mp {
        Some([(py, _), (pz, _)]) => (to_f64(&e.ny).sqrt() * to_f64(py), to_f64(&e.nz).sqrt() * to_f64(pz)),
        None => (f64::INFINITY, f64::INFINITY),
    };
    ElemF {
        d: vf(&e.d),
        uy: vf(&e.uy),
        uz: vf(&e.uz),
        sy,
        sz,
        pieces: e
            .pieces_y
            .iter()
            .zip(&e.pieces_z)
            .map(|(py, pz)| (to_f64(&py.a), to_f64(&py.b), c4(&py.c), c4(&pz.c)))
            .collect(),
        loaded: e.frame.is_some() && e.loaded(),
    }
}

fn polyf(c: &[f64; 4], t: f64) -> f64 {
    ((c[3] * t + c[2]) * t + c[1]) * t + c[0]
}

struct Sample {
    e: usize,
    t: Q,
    tf: f64,
    loc: Loc,
    /// Lm_y(t), Lm_z(t)
    lm: (f64, f64),
    /// tangent directions of the outer polygon at this section
    dirs: Vec<f64>,
}

fn dot3(a: &[f64; 3], b: &[f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/// Normalized section moment `(C·u_y/(√ny Mp_y), C·u_z/(√nz Mp_z))` at a
/// sample, for member values `x` (6 per member) and load factor `lam`.
fn sample_m(s: &Sample, f: &ElemF, x: &[f64], lam: f64) -> (f64, f64) {
    let c = 6 * s.e;
    let fv = [x[c], x[c + 1], x[c + 2]];
    let mi = [x[c + 3], x[c + 4], x[c + 5]];
    let d = f.d;
    let dxf = [d[1] * fv[2] - d[2] * fv[1], d[2] * fv[0] - d[0] * fv[2], d[0] * fv[1] - d[1] * fv[0]];
    let (ly, lz) = if f.loaded { (lam * s.lm.1, -lam * s.lm.0) } else { (0.0, 0.0) };
    let cy = -dot3(&mi, &f.uy) + s.tf * dot3(&dxf, &f.uy) + ly;
    let cz = -dot3(&mi, &f.uz) + s.tf * dot3(&dxf, &f.uz) + lz;
    (cy / f.sy, cz / f.sz)
}

fn lm_at(f: &ElemF, t: f64) -> (f64, f64) {
    let p = f.pieces.iter().find(|p| t >= p.0 && t <= p.1).unwrap_or(&f.pieces[f.pieces.len() - 1]);
    (polyf(&p.2, t), polyf(&p.3, t))
}

const DIRS0: usize = 8;

fn initial_samples(model: &PlasticModel3, ef: &[ElemF]) -> Vec<Sample> {
    let dirs = base_dirs();
    let mut out = Vec::new();
    for (ei, e) in model.elems.iter().enumerate() {
        if e.mp.is_none() {
            continue;
        }
        let f = &ef[ei];
        let mut ts: Vec<Q> = Vec::new();
        for pc in &e.pieces_y {
            let curved = f.loaded;
            let n = if curved { 16 } else { 1 };
            for j in 0..=n {
                ts.push(&pc.a + (&pc.b - &pc.a) * qr(j as i64, n as i64));
            }
        }
        ts.sort();
        ts.dedup();
        for t in ts {
            let loc = if t.is_zero() {
                Loc::EndI
            } else if t.is_one() {
                Loc::EndJ
            } else {
                Loc::Interior
            };
            let tf = to_f64(&t);
            out.push(Sample { e: ei, lm: lm_at(f, tf), t, tf, loc, dirs: dirs.clone() });
        }
    }
    out
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

struct LpSolution {
    lambda: f64,
    z: Vec<f64>,
    /// μ per (sample, direction), in sample order
    mu: Vec<Vec<f64>>,
}

/// max λ s.t. `cos φ m_y + sin φ m_z ≤ 1` for every sample and tangent
/// direction φ (an outer polygon of the ellipse), through its dual.
fn solve_lp(samples: &[Sample], ef: &[ElemF], eq: &EqF) -> Option<LpSolution> {
    let r = eq.null.len();
    let mut g = Vec::new();
    let mut h: Vec<Vec<f64>> = vec![Vec::new(); r];
    for s in samples {
        let f = &ef[s.e];
        // coefficient of λ (x = λ x_p + N z; the member loads scale with λ)
        let (gy, gz) = sample_m(s, f, &eq.xp, 1.0);
        let hn: Vec<(f64, f64)> = eq.null.iter().map(|nv| sample_m(s, f, nv, 0.0)).collect();
        for (c, sn) in edges(&s.dirs) {
            g.push(c * gy + sn * gz);
            for (j, hv) in hn.iter().enumerate() {
                h[j].push(c * hv.0 + sn * hv.1);
            }
        }
    }
    let k = g.len();
    if k == 0 {
        return None;
    }
    // orthonormalize the rows of h (modified Gram–Schmidt), tracking T
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
    let mut a: Vec<Vec<f64>> = Vec::with_capacity(qrows.len() + 1);
    a.push(g);
    a.extend(qrows);
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
    let mut b = vec![0.0; a.len()];
    b[0] = 1.0 / scales[0];
    let (mu, yhat) = simplex_min_sum(&a, &b)?;
    let y: Vec<f64> = yhat.iter().zip(&scales).map(|(y, s)| if *s > 0.0 { y / s } else { 0.0 }).collect();
    let mut z = vec![0.0; r];
    for (i, tv) in trows.iter().enumerate() {
        for j in 0..r {
            z[j] += tv[j] * y[i + 1];
        }
    }
    let mut it = mu.into_iter();
    let mu = samples.iter().map(|s| (0..s.dirs.len()).map(|_| it.next().unwrap_or(0.0)).collect()).collect();
    Some(LpSolution { lambda: y[0], z, mu })
}

/// Maximum of `f(t)` on `[a, b]` by golden-section search.
fn golden_max(f: impl Fn(f64) -> f64, mut a: f64, mut b: f64) -> (f64, f64) {
    let r = (5f64.sqrt() - 1.0) / 2.0;
    let mut c = b - r * (b - a);
    let mut d = a + r * (b - a);
    let (mut fc, mut fd) = (f(c), f(d));
    for _ in 0..200 {
        if b - a <= 1e-14 {
            break;
        }
        if fc >= fd {
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
    if fc >= fd { (c, fc) } else { (d, fd) }
}

/// Edges of the polygon inscribed in the unit circle with vertices at the
/// sorted angles `dirs`: `a·m ≤ 1` per edge, `a = (cos β, sin β)/cos(h)` with
/// `β` the mid-angle and `h` the half-angle of the edge.
fn edges(dirs: &[f64]) -> Vec<(f64, f64)> {
    let n = dirs.len();
    (0..n)
        .map(|k| {
            let a0 = dirs[k];
            let a1 = if k + 1 < n { dirs[k + 1] } else { dirs[0] + std::f64::consts::TAU };
            let (beta, half) = ((a0 + a1) / 2.0, (a1 - a0) / 2.0);
            let c = half.cos();
            (beta.cos() / c, beta.sin() / c)
        })
        .collect()
}

fn base_dirs() -> Vec<f64> {
    (0..DIRS0).map(|k| k as f64 * std::f64::consts::TAU / DIRS0 as f64).collect()
}

fn insert_dir(dirs: &mut Vec<f64>, phi: f64) -> bool {
    let phi = phi.rem_euclid(std::f64::consts::TAU);
    let near = dirs.iter().any(|&p| {
        let d = (p - phi).rem_euclid(std::f64::consts::TAU);
        d.min(std::f64::consts::TAU - d) < 1e-9
    });
    if near {
        return false;
    }
    let pos = dirs.partition_point(|&p| p < phi);
    dirs.insert(pos, phi);
    true
}

/// Refine the inner polygons: a vertex at the direction of the moment of
/// every sample on its polygon's boundary (the LP may then grow there), and
/// new samples at interior maxima of the yield ratio on loaded members that
/// lie outside the ellipse. Returns whether anything was added and the
/// largest ratio found.
fn refine(model: &PlasticModel3, ef: &[ElemF], x: &[f64], lam: f64, samples: &mut Vec<Sample>) -> (bool, f64) {
    let mut added = false;
    let mut worst = 0.0f64;
    let mut extra = Vec::new();
    for (ei, e) in model.elems.iter().enumerate() {
        let f = &ef[ei];
        if e.mp.is_none() || !f.loaded {
            continue;
        }
        let ratio = |t: f64| {
            let s = Sample { e: ei, t: Q::zero(), tf: t, loc: Loc::Interior, lm: lm_at(f, t), dirs: Vec::new() };
            let (my, mz) = sample_m(&s, f, x, lam);
            (my * my + mz * mz).sqrt()
        };
        for &(pa, pb, _, _) in &f.pieces {
            let n = 64;
            let ts: Vec<f64> = (0..=n).map(|i| pa + (pb - pa) * i as f64 / n as f64).collect();
            let vs: Vec<f64> = ts.iter().map(|&t| ratio(t)).collect();
            for i in 1..n {
                if vs[i] < vs[i - 1] || vs[i] < vs[i + 1] {
                    continue;
                }
                let (t, v) = golden_max(ratio, ts[i - 1], ts[i + 1]);
                worst = worst.max(v);
                if v <= 1.0 + 1e-12 || t <= pa || t >= pb {
                    continue;
                }
                if samples.iter().chain(extra.iter()).any(|s: &Sample| s.e == ei && (s.tf - t).abs() < 1e-12) {
                    continue;
                }
                let tq = q(t).unwrap_or_else(Q::zero);
                let tf = to_f64(&tq);
                extra.push(Sample { e: ei, lm: lm_at(f, tf), t: tq, tf, loc: Loc::Interior, dirs: Vec::new() });
            }
        }
    }
    for s in &mut extra {
        let (my, mz) = sample_m(s, &ef[s.e], x, lam);
        s.dirs = base_dirs();
        insert_dir(&mut s.dirs, mz.atan2(my));
        added = true;
    }
    for s in samples.iter_mut() {
        let (my, mz) = sample_m(s, &ef[s.e], x, lam);
        worst = worst.max((my * my + mz * mz).sqrt());
        let on_edge = edges(&s.dirs).iter().map(|(a, b)| a * my + b * mz).fold(f64::NEG_INFINITY, f64::max);
        if on_edge < 1.0 - 1e-9 {
            continue;
        }
        let phi = mz.atan2(my).rem_euclid(std::f64::consts::TAU);
        if insert_dir(&mut s.dirs, phi) {
            added = true;
            continue;
        }
        // at a vertex already: narrow its normal cone (the dual's hinge
        // rotation may lie anywhere in it, where the polygon underestimates
        // the dissipation) by bisecting the two edges next to it
        let n = s.dirs.len();
        let k = (0..n)
            .min_by(|&a, &b| {
                let da = (s.dirs[a] - phi).rem_euclid(std::f64::consts::TAU);
                let db = (s.dirs[b] - phi).rem_euclid(std::f64::consts::TAU);
                da.min(std::f64::consts::TAU - da).total_cmp(&db.min(std::f64::consts::TAU - db))
            })
            .unwrap();
        let v = s.dirs[k];
        let next = if k + 1 < n { s.dirs[k + 1] } else { s.dirs[0] + std::f64::consts::TAU };
        let prev = if k > 0 { s.dirs[k - 1] } else { s.dirs[n - 1] - std::f64::consts::TAU };
        for w in [(v + next) / 2.0, (v + prev) / 2.0] {
            if (w - v).abs() > 1e-7 && insert_dir(&mut s.dirs, w) {
                added = true;
            }
        }
    }
    samples.extend(extra);
    (added, worst)
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

fn to_static(x: Vec<Q>, lam: Q) -> StaticField3 {
    let elems = x.chunks(6).map(|c| std::array::from_fn(|k| c[k].clone())).collect();
    StaticField3 { lambda: lam, elems }
}

/// Static field from the incremental solver's final state (sum of all steps).
fn solver_state_field(model: &PlasticModel3, input: &PlasticInput3D, res: &PlasticResult3D) -> Option<(f64, Vec<f64>)> {
    let pos: HashMap<usize, usize> = model.elems.iter().enumerate().map(|(i, e)| (e.id, i)).collect();
    let s = &input.solver;
    let mut axes = HashMap::new();
    for el in crate::ordered::values(&s.elements) {
        let ni = crate::ordered::values(&s.nodes).find(|n| n.id == el.node_i)?;
        let nj = crate::ordered::values(&s.nodes).find(|n| n.id == el.node_j)?;
        axes.insert(
            el.id,
            crate::element::compute_local_axes_3d(
                ni.x, ni.y, ni.z, nj.x, nj.y, nj.z, el.local_yx, el.local_yy, el.local_yz, el.roll_angle,
                s.left_hand.unwrap_or(false),
            ),
        );
    }
    let mut x = vec![0.0; 6 * model.elems.len()];
    for st in &res.steps {
        for ef in &st.results.element_forces {
            let i = *pos.get(&ef.element_id)?;
            let (ex, ey, ez) = axes.get(&ef.element_id)?;
            // force by node i on the member, local: (−n, vy, vz), (mx, my, mz)
            let fl = [-ef.n_start, ef.vy_start, ef.vz_start];
            let ml = [ef.mx_start, ef.my_start, ef.mz_start];
            for k in 0..3 {
                x[6 * i + k] += fl[0] * ex[k] + fl[1] * ey[k] + fl[2] * ez[k];
                x[6 * i + 3 + k] += ml[0] * ex[k] + ml[1] * ey[k] + ml[2] * ez[k];
            }
        }
    }
    (res.collapse_factor > 0.0).then_some((res.collapse_factor, x))
}

/// Exact compatibility null space for hinges at the given locations, then the
/// best (smallest exact λ_up) of its basis vectors and of a least-squares fit
/// to the LP hinge rotations.
fn best_mechanism(
    model: &PlasticModel3,
    end_hinge: &[[bool; 2]],
    interior: &[Vec<Q>],
    target: &[(usize, Q, [f64; 2])],
) -> Option<(Mechanism3, MechanismCheck3)> {
    let nn = model.node_ids.len();
    let mut col = vec![[usize::MAX; 6]; nn];
    let mut n = 0;
    for i in 0..nn {
        for k in 0..6 {
            if !model.restrained[i][k] {
                col[i][k] = n;
                n += 1;
            }
        }
    }
    let mut ocol = Vec::with_capacity(model.elems.len());
    for h in interior {
        ocol.push(n);
        n += 3 * (h.len() + 1);
    }
    let mut rows: Vec<Vec<Q>> = Vec::new();
    for (ei, e) in model.elems.iter().enumerate() {
        let hs = &interior[ei];
        let mut ts = vec![Q::zero()];
        ts.extend(hs.iter().cloned());
        ts.push(Q::one());
        // closure: u_j − u_i − Σ Δt (ω_s × d) = 0
        for m in 0..3 {
            let mut r = vec![Q::zero(); n];
            if col[e.nj][m] != usize::MAX {
                r[col[e.nj][m]] += Q::one();
            }
            if col[e.ni][m] != usize::MAX {
                r[col[e.ni][m]] -= Q::one();
            }
            let (a, b) = ((m + 1) % 3, (m + 2) % 3);
            for s in 0..=hs.len() {
                let dt = &ts[s + 1] - &ts[s];
                // (ω × d)_m = ω_a d_b − ω_b d_a
                r[ocol[ei] + 3 * s + a] -= &dt * &e.d[b];
                r[ocol[ei] + 3 * s + b] += &dt * &e.d[a];
            }
            rows.push(r);
        }
        let allowed = |end: usize| -> [bool; 3] {
            let p = end_hinge[ei][end] && e.mp.is_some();
            [e.rel[end][0], e.rel[end][1] || p, e.rel[end][2] || p]
        };
        // end i: ρ = ω₀ − θᵢ ; end j: ρ = θⱼ − ω_h ; interior: ω_s − ω_{s−1}
        for (k, v) in [&e.d, &e.uy, &e.uz].into_iter().enumerate() {
            if !allowed(0)[k] {
                let mut r = vec![Q::zero(); n];
                for m in 0..3 {
                    r[ocol[ei] + m] += &v[m];
                    if col[e.ni][3 + m] != usize::MAX {
                        r[col[e.ni][3 + m]] -= &v[m];
                    }
                }
                rows.push(r);
            }
            if !allowed(1)[k] {
                let mut r = vec![Q::zero(); n];
                let h = hs.len();
                for m in 0..3 {
                    r[ocol[ei] + 3 * h + m] -= &v[m];
                    if col[e.nj][3 + m] != usize::MAX {
                        r[col[e.nj][3 + m]] += &v[m];
                    }
                }
                rows.push(r);
            }
        }
        for s in 1..=hs.len() {
            let mut r = vec![Q::zero(); n];
            for m in 0..3 {
                r[ocol[ei] + 3 * s + m] += &e.d[m];
                r[ocol[ei] + 3 * (s - 1) + m] -= &e.d[m];
            }
            rows.push(r);
        }
    }
    let basis = rref_solve(&rows, None, n).null_basis;
    if basis.is_empty() {
        return None;
    }
    let to_mech = |v: &[Q]| -> Mechanism3 {
        let nodes = (0..nn)
            .map(|i| std::array::from_fn(|k| if col[i][k] == usize::MAX { Q::zero() } else { v[col[i][k]].clone() }))
            .collect();
        let elems = interior
            .iter()
            .enumerate()
            .map(|(ei, hs)| ElemMech3 {
                hinges: hs.clone(),
                omegas: (0..=hs.len()).map(|s| std::array::from_fn(|m| v[ocol[ei] + 3 * s + m].clone())).collect(),
            })
            .collect();
        Mechanism3 { nodes, elems }
    };
    let mut cands: Vec<Vec<Q>> = basis.clone();
    if basis.len() > 1 && !target.is_empty() {
        let rot_at = |m: &Mechanism3, ei: usize, t: &Q| -> [f64; 2] {
            let e = &model.elems[ei];
            let em = &m.elems[ei];
            let node_rot = |n: usize| -> V3 { [m.nodes[n][3].clone(), m.nodes[n][4].clone(), m.nodes[n][5].clone()] };
            let rho = if t.is_zero() {
                Some(sub(&em.omegas[0], &node_rot(e.ni)))
            } else if t.is_one() {
                Some(sub(&node_rot(e.nj), em.omegas.last().unwrap()))
            } else {
                em.hinges.iter().position(|h| h == t).map(|s| sub(&em.omegas[s + 1], &em.omegas[s]))
            };
            match rho {
                Some(r) => [to_f64(&dot(&r, &e.uy)), to_f64(&dot(&r, &e.uz))],
                None => [0.0, 0.0],
            }
        };
        let colsf: Vec<Vec<f64>> = basis
            .iter()
            .map(|v| {
                let m = to_mech(v);
                target.iter().flat_map(|(ei, t, _)| rot_at(&m, *ei, t)).collect()
            })
            .collect();
        let tv: Vec<f64> = target.iter().flat_map(|x| x.2).collect();
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
    if let Some(v) = irls_mechanism(model, &basis, &to_mech, end_hinge, interior) {
        cands.push(v);
    }
    let mut best: Option<(Mechanism3, MechanismCheck3)> = None;
    for v in cands {
        for sign in [1, -1] {
            let vv: Vec<Q> = if sign == 1 { v.clone() } else { v.iter().map(|x| -x).collect() };
            let m = to_mech(&vv);
            if let Ok(chk) = check_mechanism_3d(model, &m) {
                if best.as_ref().is_none_or(|(_, b)| chk.lambda_upper < b.lambda_upper) {
                    best = Some((m, chk));
                }
            }
        }
    }
    best
}

/// The mechanism of least `D/W` in the span of the compatibility basis:
/// min Σ_h ‖S_h ρ_h(c)‖ subject to W(c) = 1 (a sum of norms, convex), by
/// iteratively reweighted least squares in f64. The coefficients are then
/// rounded to rationals, so the mechanism is exactly compatible.
fn irls_mechanism(
    model: &PlasticModel3,
    basis: &[Vec<Q>],
    to_mech: &dyn Fn(&[Q]) -> Mechanism3,
    end_hinge: &[[bool; 2]],
    interior: &[Vec<Q>],
) -> Option<Vec<Q>> {
    let m = basis.len();
    let mechs: Vec<Mechanism3> = basis.iter().map(|v| to_mech(v)).collect();
    let w: Vec<f64> = mechs.iter().map(|mm| mechanism_terms(model, mm).map(|t| to_f64(&t.0)).unwrap_or(0.0)).collect();
    if w.iter().all(|x| *x == 0.0) {
        return None;
    }
    // dissipation rows: per hinge, the scaled rotation components per basis vector
    let mut rows: Vec<[Vec<f64>; 2]> = Vec::new();
    for (ei, e) in model.elems.iter().enumerate() {
        let Some([(_, py), (_, pz)]) = &e.mp else { continue };
        let (sy, sz) = (to_f64(py) / to_f64(&e.ny).sqrt(), to_f64(pz) / to_f64(&e.nz).sqrt());
        let node_rot = |mm: &Mechanism3, n: usize| -> V3 { [mm.nodes[n][3].clone(), mm.nodes[n][4].clone(), mm.nodes[n][5].clone()] };
        let mut locs: Vec<(Option<usize>, usize)> = Vec::new(); // (end, segment index)
        if end_hinge[ei][0] {
            locs.push((Some(0), 0));
        }
        for s in 1..=interior[ei].len() {
            locs.push((None, s));
        }
        if end_hinge[ei][1] {
            locs.push((Some(1), 0));
        }
        for (end, s) in locs {
            let rel = end.map_or([false; 3], |k| e.rel[k]);
            let mut r = [vec![0.0; m], vec![0.0; m]];
            for (j, mm) in mechs.iter().enumerate() {
                let em = &mm.elems[ei];
                let rho = match end {
                    Some(0) => sub(&em.omegas[0], &node_rot(mm, e.ni)),
                    Some(_) => sub(&node_rot(mm, e.nj), em.omegas.last().unwrap()),
                    None => sub(&em.omegas[s], &em.omegas[s - 1]),
                };
                if !rel[1] {
                    r[0][j] = sy * to_f64(&dot(&rho, &e.uy));
                }
                if !rel[2] {
                    r[1][j] = sz * to_f64(&dot(&rho, &e.uz));
                }
            }
            rows.push(r);
        }
    }
    let solve = |h: &Vec<Vec<f64>>| -> Option<Vec<f64>> {
        // c = H⁻¹ w / (wᵀ H⁻¹ w)
        let mut a: Vec<Vec<f64>> = h.iter().zip(&w).map(|(row, wi)| row.iter().copied().chain([*wi]).collect()).collect();
        for c in 0..m {
            let p = (c..m).max_by(|&x, &y| a[x][c].abs().total_cmp(&a[y][c].abs()))?;
            a.swap(c, p);
            if a[c][c].abs() < 1e-300 {
                return None;
            }
            for i in 0..m {
                if i != c {
                    let f = a[i][c] / a[c][c];
                    if f != 0.0 {
                        for k in c..=m {
                            a[i][k] -= f * a[c][k];
                        }
                    }
                }
            }
        }
        let x: Vec<f64> = (0..m).map(|i| a[i][m] / a[i][i]).collect();
        let wx: f64 = x.iter().zip(&w).map(|(a, b)| a * b).sum();
        (wx.abs() > 0.0).then(|| x.iter().map(|v| v / wx).collect())
    };
    let norm = |r: &[Vec<f64>; 2], c: &[f64]| -> f64 {
        let a: f64 = r[0].iter().zip(c).map(|(x, y)| x * y).sum();
        let b: f64 = r[1].iter().zip(c).map(|(x, y)| x * y).sum();
        (a * a + b * b).sqrt()
    };
    // IRLS with a smoothing parameter driven down: ‖·‖ ≈ √(‖·‖² + ε²)
    let mut weights = vec![1.0; rows.len()];
    let mut best: Option<(f64, Vec<f64>)> = None;
    let mut eps_rel = 1e-2;
    for it in 0..600 {
        let mut h = vec![vec![0.0; m]; m];
        for (r, wt) in rows.iter().zip(&weights) {
            for comp in r {
                for i in 0..m {
                    if comp[i] == 0.0 {
                        continue;
                    }
                    for j in 0..m {
                        h[i][j] += wt * comp[i] * comp[j];
                    }
                }
            }
        }
        let tr: f64 = (0..m).map(|i| h[i][i]).sum::<f64>().max(1e-300);
        for (i, row) in h.iter_mut().enumerate() {
            row[i] += 1e-14 * tr / m as f64;
        }
        let Some(c) = solve(&h) else { break };
        let d: f64 = rows.iter().map(|r| norm(r, &c)).sum();
        if best.as_ref().is_none_or(|(bd, _)| d < *bd) {
            best = Some((d, c.clone()));
        }
        if it % 25 == 24 {
            eps_rel *= 0.1;
            if eps_rel < 1e-15 {
                break;
            }
        }
        let eps = eps_rel * d.max(1e-300) / rows.len().max(1) as f64;
        weights = rows.iter().map(|r| 1.0 / (norm(r, &c).powi(2) + eps * eps).sqrt()).collect();
    }
    let (_, c) = best?;
    let cmax = c.iter().fold(0.0f64, |a, x| a.max(x.abs()));
    let mut v = vec![Q::zero(); basis[0].len()];
    for (cj, bj) in c.iter().zip(basis) {
        if cj.abs() <= 1e-14 * cmax {
            continue;
        }
        let cq = q(*cj)?;
        for (vi, bi) in v.iter_mut().zip(bj) {
            if !bi.is_zero() {
                *vi += &cq * bi;
            }
        }
    }
    Some(v)
}

/// Exact candidates found for a model (exposed for tests that tamper with them).
#[derive(Debug, Clone)]
pub struct PlasticCandidates3 {
    pub static_field: Option<StaticField3>,
    pub static_check: Option<StaticCheck3>,
    pub static_reason: Option<String>,
    pub lower_source: Option<String>,
    pub mechanism: Option<Mechanism3>,
    pub mechanism_check: Option<MechanismCheck3>,
    pub mechanism_reason: Option<String>,
}

/// Find and check a static field and a mechanism for the model. `solver` (if
/// given, with its input) contributes its final state as a static candidate.
pub fn plastic_candidates_3d(
    model: &PlasticModel3,
    solver: Option<(&PlasticInput3D, &PlasticResult3D)>,
) -> Result<PlasticCandidates3, String> {
    let eq = equilibrium_system(model)?;
    let eqf = EqF { xp: eq.xp.iter().map(to_f64).collect(), null: eq.null.iter().map(|v| v.iter().map(to_f64).collect()).collect() };
    let ef: Vec<ElemF> = model.elems.iter().map(elem_f64).collect();
    let mut samples = initial_samples(model, &ef);
    let mut lp = solve_lp(&samples, &ef, &eqf).ok_or("limit-analysis LP failed (collapse factor unbounded or LP breakdown)")?;
    for _ in 0..60 {
        let x = field_f64(&eqf, lp.lambda, &lp.z);
        let (added, _) = refine(model, &ef, &x, lp.lambda, &mut samples);
        if !added {
            break;
        }
        match solve_lp(&samples, &ef, &eqf) {
            Some(s) => lp = s,
            None => break,
        }
    }

    // static candidates
    let mut best_static: Option<(StaticField3, StaticCheck3, String)> = None;
    let mut static_reason = None;
    let mut consider = |field: StaticField3, src: &str, best: &mut Option<(StaticField3, StaticCheck3, String)>| match check_static_3d(model, &field) {
        Ok(chk) => {
            if best.as_ref().is_none_or(|(_, b, _)| chk.lambda_lower > b.lambda_lower) {
                *best = Some((field, chk, src.to_string()));
            }
        }
        Err(e) => static_reason = Some(e),
    };
    if lp.lambda > 0.0 && lp.lambda.is_finite() {
        let lam = q(lp.lambda).unwrap_or_else(Q::zero);
        let z: Vec<Q> = lp.z.iter().map(|v| q(*v).unwrap_or_else(Q::zero)).collect();
        consider(to_static(exact_field(&eq, &lam, &z), lam.clone()), "limit-analysis LP", &mut best_static);
    }
    if let Some((lam_s, xs)) = solver.and_then(|(inp, r)| solver_state_field(model, inp, r)) {
        let resid: Vec<f64> = xs.iter().zip(&eqf.xp).map(|(x, p)| x - lam_s * p).collect();
        let z = least_squares(&eqf.null, &resid);
        let lam = q(lam_s).unwrap_or_else(Q::zero);
        let zq: Vec<Q> = z.iter().map(|v| q(*v).unwrap_or_else(Q::zero)).collect();
        consider(to_static(exact_field(&eq, &lam, &zq), lam), "incremental solver final state", &mut best_static);
    }

    // mechanism from the active LP constraints
    let ne = model.elems.len();
    let wsum: Vec<f64> = lp.mu.iter().map(|m| m.iter().sum()).collect();
    // every section at yield in the LP's field may hinge (the dual alone is
    // degenerate on the polygon's vertices)
    let xl = field_f64(&eqf, lp.lambda, &lp.z);
    let yielded: Vec<bool> = samples
        .iter()
        .map(|s| {
            let (my, mz) = sample_m(s, &ef[s.e], &xl, lp.lambda);
            edges(&s.dirs).iter().map(|(a, b)| a * my + b * mz).fold(f64::NEG_INFINITY, f64::max) >= 1.0 - 1e-7
        })
        .collect();
    let mumax = wsum.iter().fold(0.0f64, |a, &b| a.max(b));
    let mut best_mech: Option<(Mechanism3, MechanismCheck3)> = None;
    let keep = |cand: Option<(Mechanism3, MechanismCheck3)>, best: &mut Option<(Mechanism3, MechanismCheck3)>| {
        if let Some((m, c)) = cand {
            if best.as_ref().is_none_or(|(_, b)| c.lambda_upper < b.lambda_upper) {
                *best = Some((m, c));
            }
        }
    };
    // hinge sets: the LP's active sections, and those plus every section at
    // yield in its field
    for with_yielded in [false, true] {
        for thr in [1e-7, 1e-4, 1e-2] {
            let mut end_hinge = vec![[false; 2]; ne];
            let mut interior: Vec<Vec<Q>> = vec![Vec::new(); ne];
            let mut target: Vec<(usize, Q, [f64; 2])> = Vec::new();
            for (((s, mu), w), y) in samples.iter().zip(&lp.mu).zip(&wsum).zip(&yielded) {
                if *w <= thr * mumax && !(with_yielded && *y) {
                    continue;
                }
                match s.loc {
                    Loc::EndI => end_hinge[s.e][0] = true,
                    Loc::EndJ => end_hinge[s.e][1] = true,
                    Loc::Interior => interior[s.e].push(s.t.clone()),
                }
                // rotation conjugate to (C·u_y, C·u_z): ρ·u = n μ a/(√n Mp), a the edge normal
                let f = &ef[s.e];
                let e = &model.elems[s.e];
                let (ny, nz) = (to_f64(&e.ny), to_f64(&e.nz));
                let mut rho = [0.0; 2];
                for ((c, sn), m) in edges(&s.dirs).into_iter().zip(mu) {
                    rho[0] += m * c * ny / f.sy;
                    rho[1] += m * sn * nz / f.sz;
                }
                match target.iter_mut().find(|(e, t, _)| *e == s.e && *t == s.t) {
                    Some(x) => {
                        x.2[0] += rho[0];
                        x.2[1] += rho[1];
                    }
                    None => target.push((s.e, s.t.clone(), rho)),
                }
            }
            for h in &mut interior {
                h.sort();
                h.dedup();
            }
            let cand = best_mechanism(model, &end_hinge, &interior, &target);
            let found = cand.is_some();
            keep(cand, &mut best_mech);
            if found {
                break;
            }
        }
    }
    // polish: the hinges that turn in the best mechanism found, alone
    for _ in 0..3 {
        let Some((_, c)) = &best_mech else { break };
        let rmax = c.hinges.iter().fold(0.0f64, |a, h| a.max(h.2.abs()).max(h.3.abs()));
        let mut end_hinge = vec![[false; 2]; ne];
        let mut interior: Vec<Vec<Q>> = vec![Vec::new(); ne];
        let mut target = Vec::new();
        let pos: HashMap<usize, usize> = model.elems.iter().enumerate().map(|(i, e)| (e.id, i)).collect();
        for (id, t, ry, rz) in &c.hinges {
            if ry.abs().max(rz.abs()) <= 1e-9 * rmax {
                continue;
            }
            let ei = pos[id];
            if t.is_zero() {
                end_hinge[ei][0] = true;
            } else if t.is_one() {
                end_hinge[ei][1] = true;
            } else {
                interior[ei].push(t.clone());
            }
            let e = &model.elems[ei];
            target.push((ei, t.clone(), [ry * to_f64(&e.ny).sqrt(), rz * to_f64(&e.nz).sqrt()]));
        }
        let before = c.lambda_upper.clone();
        keep(best_mechanism(model, &end_hinge, &interior, &target), &mut best_mech);
        if best_mech.as_ref().is_some_and(|(_, c)| c.lambda_upper >= before) {
            break;
        }
    }
    // The polygon LP converges slowly where many hinges are biaxial. Give it
    // the answer the mechanism suggests: at each hinge of the best mechanism
    // a vertex where the hinge rotation is normal to the ellipse (and two
    // close neighbours, so that the vertex's normal cone is narrow), then
    // solve again. When the mechanism is the collapse mechanism, the LP can
    // reach λ_up on these vertices and the exact check proves it.
    if let Some((_, mc)) = &best_mech {
        let pos: HashMap<usize, usize> = model.elems.iter().enumerate().map(|(i, e)| (e.id, i)).collect();
        let mut changed = false;
        for (id, t, ry, rz) in &mc.hinges {
            let ei = pos[id];
            let Some([(py, _), (pz, _)]) = &model.elems[ei].mp else { continue };
            let (a, b) = (to_f64(py) * ry, to_f64(pz) * rz);
            if a == 0.0 && b == 0.0 {
                continue;
            }
            let phi = b.atan2(a);
            let Some(smp) = samples.iter_mut().find(|x| x.e == ei && &x.t == t) else { continue };
            for w in [phi, phi + std::f64::consts::PI] {
                for d in [0.0, 1e-6, -1e-6] {
                    changed |= insert_dir(&mut smp.dirs, w + d);
                }
            }
        }
        if changed {
            if let Some(mut lp2) = solve_lp(&samples, &ef, &eqf) {
                for _ in 0..10 {
                    let x = field_f64(&eqf, lp2.lambda, &lp2.z);
                    let (added, _) = refine(model, &ef, &x, lp2.lambda, &mut samples);
                    if !added {
                        break;
                    }
                    match solve_lp(&samples, &ef, &eqf) {
                        Some(s) => lp2 = s,
                        None => break,
                    }
                }
                if lp2.lambda > 0.0 && lp2.lambda.is_finite() {
                    let lam = q(lp2.lambda).unwrap_or_else(Q::zero);
                    let z: Vec<Q> = lp2.z.iter().map(|v| q(*v).unwrap_or_else(Q::zero)).collect();
                    consider(to_static(exact_field(&eq, &lam, &z), lam.clone()), "limit-analysis LP (mechanism vertices)", &mut best_static);
                }
            }
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
    Ok(PlasticCandidates3 {
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
pub struct CertifiedHinge3D {
    pub element_id: usize,
    /// Position along the member as a fraction of its length (0 = node i).
    pub position: f64,
    /// Hinge rotation about the local y and z axes.
    pub rotation_y: f64,
    pub rotation_z: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticCertificate3D {
    /// Both bounds certified.
    pub certified: bool,
    /// Certified `λ_c ≥ lambdaLower` (static theorem, exact check, rounded down).
    pub lambda_lower: Option<f64>,
    /// Certified `λ_c ≤ lambdaUpper` (kinematic theorem, exact check, rounded up).
    pub lambda_upper: Option<f64>,
    pub lower_source: Option<String>,
    /// The collapse mechanism behind the upper bound.
    pub mechanism: Vec<CertifiedHinge3D>,
    pub solver_collapse_factor: Option<f64>,
    pub solver_within_bounds: Option<bool>,
    /// Relative distance of the solver's value outside the enclosure (0 if inside).
    pub solver_deviation: Option<f64>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedPlastic3D {
    pub results: PlasticResult3D,
    pub certificate: PlasticCertificate3D,
}

impl super::finite::Guarded for PlasticCertificate3D {
    fn claims(&self) -> bool {
        self.certified || self.lambda_lower.is_some() || self.lambda_upper.is_some()
    }

    fn downgrade(&mut self, reason: String) {
        *self = refused(reason, self.solver_collapse_factor.filter(|x| x.is_finite()));
    }
}

fn refused(reason: String, solver: Option<f64>) -> PlasticCertificate3D {
    PlasticCertificate3D {
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

/// Certify the collapse load factor of a 3D plastic input (solver result
/// optional, used as an extra static candidate and compared with the bounds).
/// Withdrawn when the input, the solver result or a bound is not finite.
pub fn certify_collapse_3d(input: &PlasticInput3D, solver: Option<&PlasticResult3D>) -> PlasticCertificate3D {
    let sval = solver.map(|r| r.collapse_factor);
    if let Err(e) = super::finite::check_input(input).and_then(|()| super::finite::check_results(&solver)) {
        return refused(e, sval.filter(|x| x.is_finite()));
    }
    let mut c = collapse_3d(input, solver);
    super::finite::guard(&mut c);
    c
}

fn collapse_3d(input: &PlasticInput3D, solver: Option<&PlasticResult3D>) -> PlasticCertificate3D {
    let sval = solver.map(|r| r.collapse_factor);
    let model = match build_model_3d(input) {
        Ok(m) => m,
        Err(e) => return refused(e, sval),
    };
    let c = match plastic_candidates_3d(&model, solver.map(|r| (input, r))) {
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
    let (within, deviation) = match (lo, up, sval) {
        (Some(l), Some(u), Some(s)) => (Some(l <= s && s <= u), Some(((l - s).max(s - u).max(0.0)) / u.abs().max(f64::MIN_POSITIVE))),
        _ => (None, None),
    };
    let mechanism = c
        .mechanism_check
        .as_ref()
        .map(|m| {
            m.hinges
                .iter()
                .map(|(id, t, ry, rz)| CertifiedHinge3D { element_id: *id, position: to_f64(t), rotation_y: *ry, rotation_z: *rz })
                .collect()
        })
        .unwrap_or_default();
    PlasticCertificate3D {
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

/// Run the incremental 3D plastic solver and certify its collapse load factor.
pub fn certify_plastic_3d(input: &PlasticInput3D) -> Result<CertifiedPlastic3D, String> {
    super::finite::check_input(input)?;
    let results = solve_plastic_3d(input)?;
    super::finite::check_results(&results)?;
    let certificate = certify_collapse_3d(input, Some(&results));
    Ok(CertifiedPlastic3D { results, certificate })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bernstein_max_bounds_a_sextic() {
        // p(t) = (t(1 − t))² · 16 on [0, 1]: max 1 at t = 1/2
        let c = pmul(&[qi(0), qi(4), qi(-4)], &[qi(0), qi(4), qi(-4)]);
        let tol = qr(1, 1 << 30);
        let u = bernstein_max(&to_bernstein(&c, &qi(0), &qi(1)), &tol, 40);
        assert!(u >= qi(1) && &u - qi(1) <= qr(1, 1 << 29), "{}", to_f64(&u));
        // on a sub-interval [1/4, 1/3]: max at 1/3, p = 16·(2/9)² = 64/81
        let u = bernstein_max(&to_bernstein(&c, &qr(1, 4), &qr(1, 3)), &tol, 40);
        assert!(u >= qr(64, 81) && u - qr(64, 81) <= qr(1, 1 << 29));
    }

    #[test]
    fn sqrt_up_is_an_upper_bound() {
        for x in [qi(2), qr(1, 3), qi(16), qr(7, 1000)] {
            let r = sqrt_up(&x);
            assert!(&r * &r >= x);
            assert!((to_f64(&r) - to_f64(&x).sqrt()).abs() < 1e-15 * to_f64(&x).sqrt().max(1.0));
        }
        assert_eq!(sqrt_up(&qi(16)), qi(4));
    }
}
