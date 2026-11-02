//! 2D frame and truss elements in the (x, z) plane.
//!
//! Each node has (ux, uz, θ); θ is positive from +x toward +z. An element
//! splits into its kinematics (global displacements → the "basic"
//! deformations of a frame without rigid-body motion: elongation and the two
//! end rotations) and its basic response (basic deformations → basic forces
//! N, M₁, M₂ and their tangent). The co-rotational transformation follows
//! Crisfield, *Non-linear Finite Element Analysis of Solids and Structures*,
//! vol. 1, ch. 7.

use super::element::{Element, Kinematics};
use super::material::UniaxialMaterial;
use super::section::FiberSection2D;

/// Basic deformations v = (u_l, θ₁, θ₂) → basic forces q = (N, M₁, M₂) and
/// k_b = ∂q/∂v (row-major 3×3).
pub trait BasicResponse2D: Send {
    fn update(&mut self, v: [f64; 3]) -> Result<([f64; 3], [f64; 9]), String>;
    fn commit(&mut self);
    fn revert(&mut self);
}

/// Euler–Bernoulli, linear elastic: N = EA·u_l/L, M = (EI/L)·[4 2; 2 4]·θ.
pub struct ElasticBasic2D {
    ea: f64,
    ei: f64,
    l: f64,
}

impl ElasticBasic2D {
    pub fn new(ea: f64, ei: f64, l: f64) -> Self {
        ElasticBasic2D { ea, ei, l }
    }
}

impl BasicResponse2D for ElasticBasic2D {
    fn update(&mut self, v: [f64; 3]) -> Result<([f64; 3], [f64; 9]), String> {
        let a = self.ea / self.l;
        let b = self.ei / self.l;
        let kb = [a, 0.0, 0.0, 0.0, 4.0 * b, 2.0 * b, 0.0, 2.0 * b, 4.0 * b];
        let q = [a * v[0], 4.0 * b * v[1] + 2.0 * b * v[2], 2.0 * b * v[1] + 4.0 * b * v[2]];
        Ok((q, kb))
    }
    fn commit(&mut self) {}
    fn revert(&mut self) {}
}

/// Displacement-based beam-column with fiber sections at Gauss–Lobatto
/// points: constant axial strain ε₀ = u_l/L, linear curvature
/// κ(ξ) = [(6ξ−4)·θ₁ + (6ξ−2)·θ₂]/L. Exact for an elastic section; with
/// yielding it needs several elements along a member, as any
/// displacement-based element does.
pub struct FiberBasic2D {
    l: f64,
    points: Vec<(f64, f64)>,
    sections: Vec<FiberSection2D>,
}

/// Gauss–Lobatto points and weights on [0, 1].
pub(crate) fn lobatto(n: usize) -> Vec<(f64, f64)> {
    let raw: &[(f64, f64)] = match n {
        3 => &[(-1.0, 1.0 / 3.0), (0.0, 4.0 / 3.0), (1.0, 1.0 / 3.0)],
        4 => &[
            (-1.0, 1.0 / 6.0),
            (-0.447_213_595_499_957_9, 5.0 / 6.0),
            (0.447_213_595_499_957_9, 5.0 / 6.0),
            (1.0, 1.0 / 6.0),
        ],
        _ => &[
            (-1.0, 0.1),
            (-0.654_653_670_707_977_1, 49.0 / 90.0),
            (0.0, 32.0 / 45.0),
            (0.654_653_670_707_977_1, 49.0 / 90.0),
            (1.0, 0.1),
        ],
    };
    raw.iter().map(|&(x, w)| ((x + 1.0) / 2.0, w / 2.0)).collect()
}

impl FiberBasic2D {
    /// `n_points` Gauss–Lobatto sections (3, 4 or 5), each a copy of `section`.
    pub fn new(l: f64, section: &FiberSection2D, n_points: usize) -> Self {
        let points = lobatto(n_points);
        let sections = points.iter().map(|_| section.clone()).collect();
        FiberBasic2D { l, points, sections }
    }
}

impl BasicResponse2D for FiberBasic2D {
    fn update(&mut self, v: [f64; 3]) -> Result<([f64; 3], [f64; 9]), String> {
        let l = self.l;
        let mut q = [0.0; 3];
        let mut kb = [0.0; 9];
        for (&(xi, w), sec) in self.points.iter().zip(self.sections.iter_mut()) {
            // Section strains e = B·v, B = [[1/L, 0, 0], [0, b1, b2]].
            let b1 = (6.0 * xi - 4.0) / l;
            let b2 = (6.0 * xi - 2.0) / l;
            let eps0 = v[0] / l;
            let kappa = b1 * v[1] + b2 * v[2];
            let (s, ks) = sec.update(eps0, kappa);
            let wl = w * l;
            let bm = [[1.0 / l, 0.0, 0.0], [0.0, b1, b2]];
            for i in 0..3 {
                q[i] += wl * (bm[0][i] * s[0] + bm[1][i] * s[1]);
                for j in 0..3 {
                    // Bᵀ·k_s·B
                    let mut acc = 0.0;
                    for a in 0..2 {
                        for b in 0..2 {
                            acc += bm[a][i] * ks[2 * a + b] * bm[b][j];
                        }
                    }
                    kb[3 * i + j] += wl * acc;
                }
            }
        }
        Ok((q, kb))
    }
    fn commit(&mut self) {
        self.sections.iter_mut().for_each(FiberSection2D::commit);
    }
    fn revert(&mut self) {
        self.sections.iter_mut().for_each(FiberSection2D::revert);
    }
}

fn wrap_angle(a: f64) -> f64 {
    let two_pi = 2.0 * std::f64::consts::PI;
    let r = a - two_pi * (a / two_pi).round();
    if r <= -std::f64::consts::PI { r + two_pi } else { r }
}

/// The geometry both 2D elements share: undeformed length and direction,
/// and, for a displacement state, the current chord.
#[derive(Clone, Copy)]
struct Chord {
    l0: f64,
    c0: f64,
    s0: f64,
}

struct Current {
    ln: f64,
    /// ln − L₀, computed without the cancellation of the subtraction: with a
    /// large EA, N = EA·(ln − L₀)/L₀ would carry its rounding into every
    /// residual and floor the convergence test.
    ul: f64,
    c: f64,
    s: f64,
    /// Rigid rotation of the chord, wrapped to (−π, π].
    alpha: f64,
}

impl Chord {
    fn new(xi: [f64; 2], xj: [f64; 2]) -> Result<Self, String> {
        let (dx, dz) = (xj[0] - xi[0], xj[1] - xi[1]);
        let l0 = (dx * dx + dz * dz).sqrt();
        if !l0.is_finite() || l0 <= 0.0 {
            return Err("element of zero length".into());
        }
        Ok(Chord { l0, c0: dx / l0, s0: dz / l0 })
    }

    fn current(&self, u: &[f64], kin: Kinematics) -> Result<Current, String> {
        match kin {
            Kinematics::Linear => {
                let ul = self.c0 * (u[3] - u[0]) + self.s0 * (u[4] - u[1]);
                Ok(Current { ln: self.l0, ul, c: self.c0, s: self.s0, alpha: 0.0 })
            }
            Kinematics::Corotational => {
                let (du, dw) = (u[3] - u[0], u[4] - u[1]);
                let (dx0, dz0) = (self.l0 * self.c0, self.l0 * self.s0);
                let dx = dx0 + du;
                let dz = dz0 + dw;
                let ln = (dx * dx + dz * dz).sqrt();
                if !ln.is_finite() || ln <= 1e-12 * self.l0 {
                    return Err("element collapsed to zero length".into());
                }
                let (c, s) = (dx / ln, dz / ln);
                let alpha = (self.c0 * s - self.s0 * c).atan2(self.c0 * c + self.s0 * s);
                // ln² − L₀² = (2·dx₀ + du)·du + (2·dz₀ + dw)·dw
                let ul = ((2.0 * dx0 + du) * du + (2.0 * dz0 + dw) * dw) / (ln + self.l0);
                Ok(Current { ln, ul, c, s, alpha })
            }
        }
    }
}

/// A 2D beam-column: 6 DOFs, (ux, uz, θ) at each end.
pub struct Frame2D {
    dofs: [usize; 6],
    chord: Chord,
    kinematics: Kinematics,
    basic: Box<dyn BasicResponse2D>,
    f: Vec<f64>,
    k: Vec<f64>,
    q: [f64; 3],
}

impl Frame2D {
    /// `dofs`: the 6 global DOFs, (ux, uz, θ) of node i then node j.
    pub fn new(
        dofs: [usize; 6],
        xi: [f64; 2],
        xj: [f64; 2],
        kinematics: Kinematics,
        basic: Box<dyn BasicResponse2D>,
    ) -> Result<Self, String> {
        let mut e = Frame2D {
            dofs,
            chord: Chord::new(xi, xj)?,
            kinematics,
            basic,
            f: vec![0.0; 6],
            k: vec![0.0; 36],
            q: [0.0; 3],
        };
        e.update(&[0.0; 6])?;
        Ok(e)
    }

    pub fn undeformed_length(&self) -> f64 {
        self.chord.l0
    }

    /// The trial basic forces (N, M₁, M₂).
    pub fn basic_forces(&self) -> [f64; 3] {
        self.q
    }
}

impl Element for Frame2D {
    fn dofs(&self) -> &[usize] {
        &self.dofs
    }

    fn update(&mut self, u: &[f64]) -> Result<(), String> {
        let cur = self.chord.current(u, self.kinematics)?;
        let (c, s, ln) = (cur.c, cur.s, cur.ln);
        // r = ∂u_l/∂u, z = ∂β/∂u · ln (β the chord angle).
        let r = [-c, -s, 0.0, c, s, 0.0];
        let z = [s, -c, 0.0, -s, c, 0.0];
        let v = match self.kinematics {
            Kinematics::Linear => {
                let rot: f64 = (0..6).map(|i| z[i] * u[i]).sum::<f64>() / ln;
                [cur.ul, u[2] - rot, u[5] - rot]
            }
            Kinematics::Corotational => [
                cur.ul,
                wrap_angle(u[2] - cur.alpha),
                wrap_angle(u[5] - cur.alpha),
            ],
        };
        let (q, kb) = self.basic.update(v)?;

        // B (3×6): rows ∂v/∂u.
        let mut b = [[0.0; 6]; 3];
        for i in 0..6 {
            b[0][i] = r[i];
            b[1][i] = -z[i] / ln;
            b[2][i] = -z[i] / ln;
        }
        b[1][2] += 1.0;
        b[2][5] += 1.0;

        for i in 0..6 {
            self.f[i] = (0..3).map(|a| b[a][i] * q[a]).sum();
            for j in 0..6 {
                let mut acc = 0.0;
                for a in 0..3 {
                    for bb in 0..3 {
                        acc += b[a][i] * kb[3 * a + bb] * b[bb][j];
                    }
                }
                if self.kinematics == Kinematics::Corotational {
                    // N·∂²u_l/∂u² + (M₁+M₂)·∂²θ_l/∂u²
                    acc += q[0] * z[i] * z[j] / ln
                        + (q[1] + q[2]) * (r[i] * z[j] + z[i] * r[j]) / (ln * ln);
                }
                self.k[6 * i + j] = acc;
            }
        }
        self.q = q;
        Ok(())
    }

    fn internal_force(&self) -> &[f64] {
        &self.f
    }
    fn tangent(&self) -> &[f64] {
        &self.k
    }
    fn commit(&mut self) {
        self.basic.commit();
    }
    fn revert(&mut self) {
        self.basic.revert();
    }
}

/// A 2D truss bar: 4 DOFs, (ux, uz) at each end; N = A·σ(u_l/L).
pub struct Truss2D {
    dofs: [usize; 4],
    chord: Chord,
    kinematics: Kinematics,
    area: f64,
    material: Box<dyn UniaxialMaterial>,
    f: Vec<f64>,
    k: Vec<f64>,
    n: f64,
}

impl Truss2D {
    pub fn new(
        dofs: [usize; 4],
        xi: [f64; 2],
        xj: [f64; 2],
        kinematics: Kinematics,
        area: f64,
        material: Box<dyn UniaxialMaterial>,
    ) -> Result<Self, String> {
        let mut e = Truss2D {
            dofs,
            chord: Chord::new(xi, xj)?,
            kinematics,
            area,
            material,
            f: vec![0.0; 4],
            k: vec![0.0; 16],
            n: 0.0,
        };
        e.update(&[0.0; 4])?;
        Ok(e)
    }

    pub fn axial_force(&self) -> f64 {
        self.n
    }
}

impl Element for Truss2D {
    fn dofs(&self) -> &[usize] {
        &self.dofs
    }

    fn update(&mut self, u: &[f64]) -> Result<(), String> {
        // The chord works on 6-DOF vectors; a truss has no rotations.
        let u6 = [u[0], u[1], 0.0, u[2], u[3], 0.0];
        let cur = self.chord.current(&u6, self.kinematics)?;
        let (c, s, ln) = (cur.c, cur.s, cur.ln);
        let r = [-c, -s, c, s];
        let z = [s, -c, -s, c];
        self.material.set_trial_strain(cur.ul / self.chord.l0);
        let n = self.area * self.material.stress();
        let kb = self.area * self.material.tangent() / self.chord.l0;
        for i in 0..4 {
            self.f[i] = r[i] * n;
            for j in 0..4 {
                let mut acc = r[i] * kb * r[j];
                if self.kinematics == Kinematics::Corotational {
                    acc += n * z[i] * z[j] / ln;
                }
                self.k[4 * i + j] = acc;
            }
        }
        self.n = n;
        Ok(())
    }

    fn internal_force(&self) -> &[f64] {
        &self.f
    }
    fn tangent(&self) -> &[f64] {
        &self.k
    }
    fn commit(&mut self) {
        self.material.commit();
    }
    fn revert(&mut self) {
        self.material.revert();
    }
}
