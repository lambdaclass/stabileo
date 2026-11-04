//! Member stiffness and equivalent nodal loads in local axes, in interval
//! arithmetic, derived from first principles (not from `crate::element`):
//!
//! * Bending: the end stiffness of a cantilever is the inverse of its
//!   flexibility, `F = [[L³/3EI + L/(G·As), L²/2EI], [L²/2EI, L/EI]]`
//!   (Timoshenko: shear adds `L/(G·As)` to the tip deflection, nothing to the
//!   section rotation); the other end follows from equilibrium,
//!   `K = [[Γ k Γᵀ, Γ k], [k Γᵀ, k]]` with `Γ = [[−1, 0], [−L, −1]]`.
//! * Axial `EA/L`, torsion `GJ/L`.
//! * Releases: static condensation of each released rotation, one at a time
//!   (`K ← K − k_r k_rᵀ / k_rr`, `f ← f − k_r f_r / k_rr`). With both
//!   rotations of a bending plane released the plane carries nothing (the
//!   bending block has rank 2 and its rotation block is invertible, so the
//!   Schur complement is 0) and its loads reach the nodes as the simply
//!   supported reactions; a torsion release at either end removes torsion.
//! * Equivalent nodal loads: the work of the member load on the exact
//!   deflected shapes of the unloaded Timoshenko member (the
//!   interdependent-interpolation functions; cubic Hermite for φ = 0), with
//!   polynomial integrals evaluated in closed form; thermal loads from
//!   `∫ Bᵀ D ε_th dx`.
//!
//! Local DOFs: 2D `[u1, v1, θ1, u2, v2, θ2]`; 3D
//! `[u1, v1, w1, θx1, θy1, θz1, u2, v2, w2, θx2, θy2, θz2]`. In the x–z plane
//! of a 3D member `θy = −dw/dx` (right-hand rule), so its bending block is the
//! x–y one with the rotations negated.

use super::ia::*;

/// Dense local matrix with structural zeros (`None`).
#[derive(Clone, Debug)]
pub struct LMat {
    pub n: usize,
    pub a: Vec<Option<I>>,
}

impl LMat {
    pub fn zeros(n: usize) -> Self {
        LMat { n, a: vec![None; n * n] }
    }
    pub fn get(&self, i: usize, j: usize) -> Option<I> {
        self.a[i * self.n + j]
    }
    pub fn set(&mut self, i: usize, j: usize, v: I) {
        self.a[i * self.n + j] = Some(v);
    }
}

/// Local load vector with structural zeros.
pub type LVec = Vec<Option<I>>;

pub fn lvec_add(f: &mut LVec, i: usize, v: I) {
    f[i] = Some(match f[i] {
        Some(x) => x + v,
        None => v,
    });
}

/// Section and material data of one bending plane.
#[derive(Clone, Copy, Debug)]
pub struct Plane {
    /// E·I
    pub ei: I,
    /// L/(G·As) (0 for Euler–Bernoulli)
    pub shear_flex: I,
    /// φ = 12·EI/(G·As·L²) = 12·EI·shear_flex/L³
    pub phi: I,
}

/// 4×4 bending stiffness over (v1, θ1, v2, θ2), θ = +dv/dx, from the
/// cantilever flexibility and equilibrium (module docs).
pub fn bending4(p: &Plane, l: I) -> Option<[[I; 4]; 4]> {
    let l2 = l.square();
    let l3 = l2 * l;
    let f11 = l3.div(c(3.0) * p.ei) + p.shear_flex;
    let f12 = l2.div(c(2.0) * p.ei);
    let f22 = l.div(p.ei);
    // det F = f11 f22 − f12² written without the cancellation:
    // (L/EI)(L³/3EI + s) − L⁴/4E²I² = L⁴/(12 E²I²) + s·L/EI.
    let det = (l2.square()).div(c(12.0) * p.ei.square()) + p.shear_flex * f22;
    let k11 = f22.div(det);
    let k12 = (-f12).div(det);
    let k22 = f11.div(det);
    let k = [[k11, k12], [k12, k22]];
    // Γ = [[−1, 0], [−L, −1]]
    // Γk = [[−k11, −k12], [−L k11 − k21, −L k12 − k22]]
    let gk = [[-k11, -k12], [-(l * k11) - k12, -(l * k12) - k22]];
    // Γ k Γᵀ: (Γk)·Γᵀ, Γᵀ = [[−1, −L], [0, −1]]
    let gkg = [
        [-gk[0][0], -(gk[0][0] * l) - gk[0][1]],
        [-gk[1][0], -(gk[1][0] * l) - gk[1][1]],
    ];
    let mut out = [[I::ZERO; 4]; 4];
    for a in 0..2 {
        for b in 0..2 {
            out[a][b] = gkg[a][b];
            out[a][b + 2] = gk[a][b];
            out[a + 2][b] = gk[b][a]; // k Γᵀ = (Γ k)ᵀ (k symmetric)
            out[a + 2][b + 2] = k[a][b];
        }
    }
    // gkg is symmetric in exact arithmetic; use one enclosure for both.
    out[1][0] = out[0][1];
    if out.iter().flatten().all(|x| x.is_finite()) {
        Some(out)
    } else {
        None
    }
}

/// Interdependent-interpolation deflection shapes N1..N4 (in ξ = x/L) and
/// section-rotation shapes ψ1..ψ4, as polynomials in ξ, for shear parameter φ:
/// with μ = 1/(1+φ),
///   N1 = μ(1 + φ − φξ − 3ξ² + 2ξ³),      ψ1 = (6μ/L)(ξ² − ξ)
///   N2 = μL((1 + φ/2)ξ − (2 + φ/2)ξ² + ξ³), ψ2 = μ(1 + φ − (4 + φ)ξ + 3ξ²)
///   N3 = μ(φξ + 3ξ² − 2ξ³),              ψ3 = (6μ/L)(ξ − ξ²)
///   N4 = μL(−(φ/2)ξ − (1 − φ/2)ξ² + ξ³),  ψ4 = μ(−(2 − φ)ξ + 3ξ²)
/// They solve the homogeneous Timoshenko equations (w cubic, γ = w' − ψ
/// constant, ψ = w' + (φL²/12)·w''') with unit end values.
pub fn iie_shapes(phi: I, l: I) -> ([Poly; 4], [Poly; 4]) {
    let mu = c(1.0).div(c(1.0) + phi);
    let half_phi = phi.div(c(2.0));
    let n1 = vec![c(1.0) + phi, -phi, c(-3.0), c(2.0)];
    let n2 = vec![I::ZERO, c(1.0) + half_phi, -(c(2.0) + half_phi), c(1.0)];
    let n3 = vec![I::ZERO, phi, c(3.0), c(-2.0)];
    let n4 = vec![I::ZERO, -half_phi, -(c(1.0) - half_phi), c(1.0)];
    let ml = mu * l;
    let six_mu_l = (c(6.0) * mu).div(l);
    let p1 = vec![I::ZERO, c(-1.0), c(1.0)];
    let p2 = vec![c(1.0) + phi, -(c(4.0) + phi), c(3.0)];
    let p3 = vec![I::ZERO, c(1.0), c(-1.0)];
    let p4 = vec![I::ZERO, -(c(2.0) - phi), c(3.0)];
    (
        [pscale(mu, &n1), pscale(ml, &n2), pscale(mu, &n3), pscale(ml, &n4)],
        [pscale(six_mu_l, &p1), pscale(mu, &p2), pscale(six_mu_l, &p3), pscale(mu, &p4)],
    )
}

/// Linear (lever-rule) shapes for the transverse direction of a member that
/// carries no moment: N = [1 − ξ, 0, ξ, 0], ψ = [−1/L, 0, 1/L, 0].
pub fn lever_shapes(l: I) -> ([Poly; 4], [Poly; 4]) {
    let inv_l = c(1.0).div(l);
    (
        [vec![c(1.0), c(-1.0)], vec![], vec![I::ZERO, c(1.0)], vec![]],
        [vec![-inv_l], vec![], vec![inv_l], vec![]],
    )
}

/// ∫_a^b q(x)·N(x/L) dx for q linear from q_a at a to q_b at b:
/// (b − a)·∫₀¹ (q_a(1 − t) + q_b t)·N(ξa + t·Δξ) dt, no division by b − a.
pub fn integrate_linear_load(n: &Poly, l: I, a: I, b: I, qa: I, qb: I) -> I {
    if n.is_empty() {
        return I::ZERO;
    }
    let xa = a.div(l);
    let dxi = (b - a).div(l);
    let shifted = compose_affine(n, xa, dxi);
    let q = vec![qa, qb - qa];
    (b - a) * pint01(&pmul(&shifted, &q))
}

/// Equivalent nodal loads `[V1, M1, V2, M2]` of a transverse distributed load
/// (linear from q_a at a to q_b at b) with deflection shapes `n`.
pub fn dist_enl(n: &[Poly; 4], l: I, a: I, b: I, qa: I, qb: I) -> [I; 4] {
    [0, 1, 2, 3].map(|k| integrate_linear_load(&n[k], l, a, b, qa, qb))
}

/// Equivalent nodal loads of a transverse point force p and a couple m
/// (θ-positive) at x = a.
pub fn point_enl(n: &[Poly; 4], psi: &[Poly; 4], l: I, a: I, p: I, m: I) -> [I; 4] {
    let xi = a.div(l);
    [0, 1, 2, 3].map(|k| {
        let mut v = I::ZERO;
        if !n[k].is_empty() && p != I::ZERO {
            v = v + p * peval(&n[k], xi);
        }
        if !psi[k].is_empty() && m != I::ZERO {
            v = v + m * peval(&psi[k], xi);
        }
        v
    })
}

/// Axial (linear-shape) loads [N1, N2] of an axial line load q_a → q_b on [a, b].
pub fn axial_dist_enl(l: I, a: I, b: I, qa: I, qb: I) -> [I; 2] {
    let n1 = vec![c(1.0), c(-1.0)];
    let n2 = vec![I::ZERO, c(1.0)];
    [integrate_linear_load(&n1, l, a, b, qa, qb), integrate_linear_load(&n2, l, a, b, qa, qb)]
}

/// Static condensation of local DOF r from `k` (and `f` when given).
/// Err when k_rr may be 0.
pub fn condense(k: &mut LMat, f: Option<&mut LVec>, r: usize) -> Result<(), String> {
    let n = k.n;
    let krr = k.get(r, r).ok_or("released DOF without stiffness")?;
    if !(krr.is_finite() && krr.lo > 0.0) {
        return Err(format!("released DOF stiffness not certainly positive: {krr:?}"));
    }
    let kr: Vec<Option<I>> = (0..n).map(|i| k.get(i, r)).collect();
    for i in 0..n {
        if i == r {
            continue;
        }
        let Some(kir) = kr[i] else { continue };
        let ratio = kir.div(krr);
        for j in 0..n {
            if j == r {
                continue;
            }
            let Some(krj) = kr[j] else { continue };
            let d = ratio * krj;
            k.a[i * n + j] = Some(match k.get(i, j) {
                Some(x) => x - d,
                None => -d,
            });
        }
    }
    if let Some(f) = f {
        if let Some(fr) = f[r] {
            for i in 0..n {
                if i == r {
                    continue;
                }
                if let Some(kir) = kr[i] {
                    let d = kir.div(krr) * fr;
                    f[i] = Some(match f[i] {
                        Some(x) => x - d,
                        None => -d,
                    });
                }
            }
        }
        f[r] = None;
    }
    for i in 0..n {
        k.a[i * n + r] = None;
        k.a[r * n + i] = None;
    }
    Ok(())
}

/// Place a 4×4 bending block on local DOFs `idx` = (v1, θ1, v2, θ2), with the
/// rotations multiplied by `s` (+1 for θ = +dv/dx, −1 for θy = −dw/dx).
pub fn place_bending(k: &mut LMat, idx: [usize; 4], b: &[[I; 4]; 4], s: f64) {
    let sg = [1.0, s, 1.0, s];
    for a in 0..4 {
        for bb in 0..4 {
            let v = b[a][bb];
            let v = if sg[a] * sg[bb] < 0.0 { -v } else { v };
            k.set(idx[a], idx[bb], v);
        }
    }
}

pub fn place_enl(f: &mut LVec, idx: [usize; 4], v: &[I; 4], s: f64) {
    let sg = [1.0, s, 1.0, s];
    for a in 0..4 {
        let x = if sg[a] < 0.0 { -v[a] } else { v[a] };
        lvec_add(f, idx[a], x);
    }
}

pub fn place_axial(k: &mut LMat, i: usize, j: usize, ea_l: I) {
    k.set(i, i, ea_l);
    k.set(j, j, ea_l);
    k.set(i, j, -ea_l);
    k.set(j, i, -ea_l);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(x: I, want: f64, rel: f64) -> bool {
        let tol = rel * want.abs().max(1.0);
        x.lo - tol <= want && want <= x.hi + tol && x.hi - x.lo <= tol
    }

    #[test]
    fn bending_matches_textbook_euler_bernoulli_and_timoshenko() {
        let (e, i, l) = (2.0e8, 3.0e-4, 4.0);
        for phi in [0.0, 0.3] {
            let ei = c(e * i);
            let l_i = c(l);
            let shear_flex = c(phi * l * l * l / (12.0 * e * i));
            let p = Plane { ei, shear_flex, phi: c(phi) };
            let b = bending4(&p, l_i).unwrap();
            let d = 1.0 + phi;
            let ei = e * i;
            let want = [
                [12.0 * ei / (l * l * l * d), 6.0 * ei / (l * l * d), -12.0 * ei / (l * l * l * d), 6.0 * ei / (l * l * d)],
                [6.0 * ei / (l * l * d), (4.0 + phi) * ei / (l * d), -6.0 * ei / (l * l * d), (2.0 - phi) * ei / (l * d)],
                [-12.0 * ei / (l * l * l * d), -6.0 * ei / (l * l * d), 12.0 * ei / (l * l * l * d), -6.0 * ei / (l * l * d)],
                [6.0 * ei / (l * l * d), (2.0 - phi) * ei / (l * d), -6.0 * ei / (l * l * d), (4.0 + phi) * ei / (l * d)],
            ];
            for a in 0..4 {
                for bb in 0..4 {
                    assert!(close(b[a][bb], want[a][bb], 1e-12), "phi {phi} ({a},{bb}): {:?} vs {}", b[a][bb], want[a][bb]);
                }
            }
        }
    }

    #[test]
    fn uniform_load_enl() {
        // q = −10 on L = 6: V = qL/2 = −30, M1 = qL²/12 = −30, M2 = +30.
        let (n, _) = iie_shapes(c(0.0), c(6.0));
        let f = dist_enl(&n, c(6.0), c(0.0), c(6.0), c(-10.0), c(-10.0));
        for (x, w) in f.iter().zip([-30.0, -30.0, -30.0, 30.0]) {
            assert!(close(*x, w, 1e-13), "{x:?} vs {w}");
        }
    }

    #[test]
    fn condensation_gives_propped_stiffness() {
        // Condensing θ1 of the EB block: k_vv = 3EI/L³.
        let p = Plane { ei: c(1.0), shear_flex: I::ZERO, phi: I::ZERO };
        let b = bending4(&p, c(2.0)).unwrap();
        let mut k = LMat::zeros(4);
        place_bending(&mut k, [0, 1, 2, 3], &b, 1.0);
        condense(&mut k, None, 1).unwrap();
        let v = k.get(0, 0).unwrap();
        assert!(close(v, 3.0 / 8.0, 1e-13), "{v:?}");
        assert!(k.get(1, 1).is_none());
    }
}
