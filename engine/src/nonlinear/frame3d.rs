//! 3D frame and truss elements.
//!
//! A frame's basic deformations, with rigid-body motion removed, are seven:
//! v = (ū, θ̄₁, θ̄₂), the elongation and the two end rotation vectors in the
//! element frame (x along the element; θ̄ₓ twist, θ̄_y and θ̄_z bending).
//! Basic forces q = (N, m̄₁, m̄₂) are their work conjugates.
//!
//! The co-rotational kinematics is Battini & Pacoste's (*Co-rotational beam
//! elements with warping effects in instability problems*, CMAME 191, 2002;
//! Battini's thesis, KTH 2002): the element frame R_r takes e₁ along the
//! chord and e₂, e₃ from the mean of the nodes' rotated local y axes; the
//! local rotations are R̄ᵢ = R_rᵀ·Rᵢ·R₀, θ̄ᵢ = log R̄ᵢ. The deformation
//! matrix B = ∂v/∂d (d: translations and spatial rotation increments) is
//! analytic, so the internal force Bᵀ·q is exact. The tangent is
//! Bᵀ·k_b·B plus the derivative of Bᵀ·q at frozen q; that geometric part
//! is taken by central differences of B alone (no material is evaluated),
//! which is cheap and accurate to about 1e-10 relative.

use super::element::Kinematics;
use super::frame2d::lobatto;
use super::material::UniaxialMaterial;
use super::model3d::{Element3D, NodeState3D};
use super::rotation::{cross, dot3, exp, log, mat_mul, mat_t_vec, mat_vec, norm3, transpose, ts_inv, Mat3, IDENTITY};
use super::section::FiberSection3D;

/// Basic deformations v (7) → basic forces q (7) and k_b = ∂q/∂v (7×7, row-major).
pub trait BasicResponse3D: Send {
    fn update(&mut self, v: [f64; 7]) -> Result<([f64; 7], [f64; 49]), String>;
    fn commit(&mut self);
    fn revert(&mut self);
}

/// Euler–Bernoulli, linear elastic, uncoupled: N = EA·ū/L, T = GJ·(θ̄₂ₓ − θ̄₁ₓ)/L,
/// and (EI/L)·[4 2; 2 4] about each bending axis.
pub struct ElasticBasic3D {
    ea: f64,
    gj: f64,
    eiy: f64,
    eiz: f64,
    l: f64,
}

impl ElasticBasic3D {
    pub fn new(ea: f64, gj: f64, eiy: f64, eiz: f64, l: f64) -> Self {
        ElasticBasic3D { ea, gj, eiy, eiz, l }
    }
}

/// Torsion terms of k_b and q: T acts as −T on θ̄₁ₓ and +T on θ̄₂ₓ.
fn add_torsion(gj_l: f64, v: &[f64; 7], q: &mut [f64; 7], kb: &mut [f64; 49]) {
    let t = gj_l * (v[4] - v[1]);
    q[1] -= t;
    q[4] += t;
    kb[7 + 1] += gj_l;
    kb[7 + 4] -= gj_l;
    kb[4 * 7 + 1] -= gj_l;
    kb[4 * 7 + 4] += gj_l;
}

impl BasicResponse3D for ElasticBasic3D {
    fn update(&mut self, v: [f64; 7]) -> Result<([f64; 7], [f64; 49]), String> {
        let l = self.l;
        let mut q = [0.0; 7];
        let mut kb = [0.0; 49];
        q[0] = self.ea / l * v[0];
        kb[0] = self.ea / l;
        add_torsion(self.gj / l, &v, &mut q, &mut kb);
        // Bending: (θ̄₁y, θ̄₂y) at (2, 5) with EI_y, (θ̄₁z, θ̄₂z) at (3, 6) with EI_z.
        for (ei, i, j) in [(self.eiy, 2, 5), (self.eiz, 3, 6)] {
            let b = ei / l;
            q[i] = 4.0 * b * v[i] + 2.0 * b * v[j];
            q[j] = 2.0 * b * v[i] + 4.0 * b * v[j];
            kb[7 * i + i] = 4.0 * b;
            kb[7 * i + j] = 2.0 * b;
            kb[7 * j + i] = 2.0 * b;
            kb[7 * j + j] = 4.0 * b;
        }
        Ok((q, kb))
    }
    fn commit(&mut self) {}
    fn revert(&mut self) {}
}

/// Displacement-based beam-column with 3D fiber sections at Gauss–Lobatto
/// points (axial force and biaxial bending; torsion elastic, GJ):
/// ε₀ = ū/L, κ(ξ) = [(6ξ−4)·θ̄₁ + (6ξ−2)·θ̄₂]/L about each bending axis.
pub struct FiberBasic3D {
    l: f64,
    gj: f64,
    points: Vec<(f64, f64)>,
    sections: Vec<FiberSection3D>,
}

impl FiberBasic3D {
    pub fn new(l: f64, gj: f64, section: &FiberSection3D, n_points: usize) -> Self {
        let points = lobatto(n_points);
        let sections = points.iter().map(|_| section.clone()).collect();
        FiberBasic3D { l, gj, points, sections }
    }
}

impl BasicResponse3D for FiberBasic3D {
    fn update(&mut self, v: [f64; 7]) -> Result<([f64; 7], [f64; 49]), String> {
        let l = self.l;
        let mut q = [0.0; 7];
        let mut kb = [0.0; 49];
        for (&(xi, w), sec) in self.points.iter().zip(self.sections.iter_mut()) {
            let (b1, b2) = ((6.0 * xi - 4.0) / l, (6.0 * xi - 2.0) / l);
            // Section strains (ε₀, κ_y, κ_z) = B_s·v.
            let mut bs = [[0.0; 7]; 3];
            bs[0][0] = 1.0 / l;
            bs[1][2] = b1;
            bs[1][5] = b2;
            bs[2][3] = b1;
            bs[2][6] = b2;
            let e: Vec<f64> = (0..3).map(|a| (0..7).map(|i| bs[a][i] * v[i]).sum()).collect();
            let (s, ks) = sec.update(e[0], e[1], e[2]);
            let wl = w * l;
            for i in 0..7 {
                q[i] += wl * (0..3).map(|a| bs[a][i] * s[a]).sum::<f64>();
                for j in 0..7 {
                    let mut acc = 0.0;
                    for a in 0..3 {
                        for b in 0..3 {
                            acc += bs[a][i] * ks[3 * a + b] * bs[b][j];
                        }
                    }
                    kb[7 * i + j] += wl * acc;
                }
            }
        }
        add_torsion(self.gj / l, &v, &mut q, &mut kb);
        Ok((q, kb))
    }
    fn commit(&mut self) {
        self.sections.iter_mut().for_each(FiberSection3D::commit);
    }
    fn revert(&mut self) {
        self.sections.iter_mut().for_each(FiberSection3D::revert);
    }
}

fn column(m: &Mat3, j: usize) -> [f64; 3] {
    [m[0][j], m[1][j], m[2][j]]
}

/// Undeformed frame: length, and R₀ = [e₁ e₂ e₃] with e₂ the part of the
/// reference vector normal to the element.
fn initial_frame(xi: [f64; 3], xj: [f64; 3], reference: [f64; 3]) -> Result<(f64, Mat3), String> {
    let d = [xj[0] - xi[0], xj[1] - xi[1], xj[2] - xi[2]];
    let l0 = norm3(d);
    if !l0.is_finite() || l0 <= 0.0 {
        return Err("element of zero length".into());
    }
    let e1 = [d[0] / l0, d[1] / l0, d[2] / l0];
    let e3 = cross(e1, reference);
    let n3 = norm3(e3);
    if n3 < 1e-9 * norm3(reference).max(1e-300) {
        return Err("the reference vector is parallel to the element".into());
    }
    let e3 = [e3[0] / n3, e3[1] / n3, e3[2] / n3];
    let e2 = cross(e3, e1);
    Ok((l0, [[e1[0], e2[0], e3[0]], [e1[1], e2[1], e3[1]], [e1[2], e2[2], e3[2]]]))
}

/// Basic deformations and B (7×12, rows v, columns (δu₁, δw₁, δu₂, δw₂))
/// of a co-rotational frame at the given node states.
fn corotational(si: &NodeState3D, sj: &NodeState3D, l0: f64, r0: &Mat3) -> Result<([f64; 7], [[f64; 12]; 7]), String> {
    let (xi, xj) = (si.position(), sj.position());
    let d = [xj[0] - xi[0], xj[1] - xi[1], xj[2] - xi[2]];
    let ln = norm3(d);
    if !ln.is_finite() || ln <= 1e-12 * l0 {
        return Err("element collapsed to zero length".into());
    }
    let e1 = [d[0] / ln, d[1] / ln, d[2] / ln];
    // ū = ln − L₀ without cancellation: ln² − L₀² = (2·d₀ + Δ)·Δ.
    let d0 = [sj.x0[0] - si.x0[0], sj.x0[1] - si.x0[1], sj.x0[2] - si.x0[2]];
    let du = [sj.u[0] - si.u[0], sj.u[1] - si.u[1], sj.u[2] - si.u[2]];
    let ubar = dot3([2.0 * d0[0] + du[0], 2.0 * d0[1] + du[1], 2.0 * d0[2] + du[2]], du) / (ln + l0);

    let y0 = column(r0, 1);
    let q1 = mat_vec(&si.r, y0);
    let q2 = mat_vec(&sj.r, y0);
    let q = [(q1[0] + q2[0]) / 2.0, (q1[1] + q2[1]) / 2.0, (q1[2] + q2[2]) / 2.0];
    let e3 = cross(e1, q);
    let n3 = norm3(e3);
    if n3 < 1e-12 {
        return Err("the element frame is undefined: the nodes' local y axes turned onto the element".into());
    }
    let e3 = [e3[0] / n3, e3[1] / n3, e3[2] / n3];
    let e2 = cross(e3, e1);
    let rr: Mat3 = [[e1[0], e2[0], e3[0]], [e1[1], e2[1], e3[1]], [e1[2], e2[2], e3[2]]];
    let rrt = transpose(&rr);

    let th1 = log(&mat_mul(&rrt, &mat_mul(&si.r, r0)));
    let th2 = log(&mat_mul(&rrt, &mat_mul(&sj.r, r0)));
    let v = [ubar, th1[0], th1[1], th1[2], th2[0], th2[1], th2[2]];

    // The element frame's spin, local components: ω = W·d.
    let (qb, qb1, qb2) = (mat_t_vec(&rr, q), mat_t_vec(&rr, q1), mat_t_vec(&rr, q2));
    let eta = qb[0] / qb[1];
    let (eta11, eta12) = (qb1[0] / qb[1], qb1[1] / qb[1]);
    let (eta21, eta22) = (qb2[0] / qb[1], qb2[1] / qb[1]);
    // W in local components of each block (rows ω₁, ω₂, ω₃).
    let wa1 = [[0.0, 0.0, eta / ln], [0.0, 0.0, 1.0 / ln], [0.0, -1.0 / ln, 0.0]];
    let wb1 = [[eta12 / 2.0, -eta11 / 2.0, 0.0], [0.0; 3], [0.0; 3]];
    let wa2 = [[0.0, 0.0, -eta / ln], [0.0, 0.0, -1.0 / ln], [0.0, 1.0 / ln, 0.0]];
    let wb2 = [[eta22 / 2.0, -eta21 / 2.0, 0.0], [0.0; 3], [0.0; 3]];
    // Global columns: a block acting on local components acts on global ones through R_rᵀ.
    let mut w = [[0.0; 12]; 3];
    for (blk, m) in [wa1, wb1, wa2, wb2].iter().enumerate() {
        let g = mat_mul(m, &rrt);
        for i in 0..3 {
            for j in 0..3 {
                w[i][3 * blk + j] = g[i][j];
            }
        }
    }

    let mut b = [[0.0; 12]; 7];
    for k in 0..3 {
        b[0][k] = -e1[k];
        b[0][6 + k] = e1[k];
    }
    // δθ̄ᵢ = T_s⁻¹(θ̄ᵢ)·(R_rᵀ·δwᵢ − ω)
    for (row, th, wcol) in [(1usize, th1, 3usize), (4, th2, 9)] {
        let ti = ts_inv(th);
        let mut s = [[0.0; 12]; 3];
        for i in 0..3 {
            for j in 0..12 {
                s[i][j] = -w[i][j];
            }
            for j in 0..3 {
                s[i][wcol + j] += rrt[i][j];
            }
        }
        for i in 0..3 {
            for j in 0..12 {
                b[row + i][j] = (0..3).map(|k| ti[i][k] * s[k][j]).sum();
            }
        }
    }
    Ok((v, b))
}

/// A 3D beam-column between two nodes: 12 DOFs.
pub struct Frame3D {
    nodes: [usize; 2],
    l0: f64,
    r0: Mat3,
    kinematics: Kinematics,
    basic: Box<dyn BasicResponse3D>,
    /// B at the undeformed configuration (linear kinematics).
    b0: [[f64; 12]; 7],
    f: Vec<f64>,
    k: Vec<f64>,
    q: [f64; 7],
}

impl Frame3D {
    /// `reference`: a vector not along the element; the local y axis is its
    /// part normal to the element, z = x × y.
    pub fn new(
        nodes: [usize; 2],
        xi: [f64; 3],
        xj: [f64; 3],
        reference: [f64; 3],
        kinematics: Kinematics,
        basic: Box<dyn BasicResponse3D>,
    ) -> Result<Self, String> {
        let (l0, r0) = initial_frame(xi, xj, reference)?;
        let s0 = |x| NodeState3D { x0: x, u: [0.0; 3], r: IDENTITY };
        let (_, b0) = corotational(&s0(xi), &s0(xj), l0, &r0)?;
        let mut e = Frame3D { nodes, l0, r0, kinematics, basic, b0, f: vec![0.0; 12], k: vec![0.0; 144], q: [0.0; 7] };
        e.update(&[s0(xi), s0(xj)])?;
        Ok(e)
    }

    pub fn basic_forces(&self) -> [f64; 7] {
        self.q
    }
}

fn btq(b: &[[f64; 12]; 7], q: &[f64; 7]) -> [f64; 12] {
    let mut f = [0.0; 12];
    for (row, &qa) in b.iter().zip(q) {
        for j in 0..12 {
            f[j] += row[j] * qa;
        }
    }
    f
}

impl Element3D for Frame3D {
    fn nodes(&self) -> &[usize] {
        &self.nodes
    }

    // Matrix products over fixed small dimensions read clearest indexed.
    #[allow(clippy::needless_range_loop)]
    fn update(&mut self, s: &[NodeState3D]) -> Result<(), String> {
        let (v, b) = match self.kinematics {
            Kinematics::Linear => {
                let mut d = [0.0; 12];
                for (n, st) in s.iter().enumerate() {
                    d[6 * n..6 * n + 3].copy_from_slice(&st.u);
                    d[6 * n + 3..6 * n + 6].copy_from_slice(&log(&st.r));
                }
                let mut v = [0.0; 7];
                for (a, row) in self.b0.iter().enumerate() {
                    v[a] = row.iter().zip(&d).map(|(x, y)| x * y).sum();
                }
                (v, self.b0)
            }
            Kinematics::Corotational => corotational(&s[0], &s[1], self.l0, &self.r0)?,
        };
        let (q, kb) = self.basic.update(v)?;
        let f = btq(&b, &q);

        // Bᵀ·k_b·B
        let mut kbb = [[0.0; 12]; 7];
        for a in 0..7 {
            for j in 0..12 {
                kbb[a][j] = (0..7).map(|c| kb[7 * a + c] * b[c][j]).sum();
            }
        }
        for i in 0..12 {
            for j in 0..12 {
                self.k[12 * i + j] = (0..7).map(|a| b[a][i] * kbb[a][j]).sum();
            }
        }
        if self.kinematics == Kinematics::Corotational {
            // ∂(Bᵀ·q)/∂d at frozen q, by central differences of B.
            let ht = 1e-5 * self.l0;
            let hr = 1e-5;
            for j in 0..12 {
                let node = j / 6;
                let local = j % 6;
                let h = if local < 3 { ht } else { hr };
                let mut cols = [[0.0; 12]; 2];
                for (c, sign) in [(0, 1.0), (1, -1.0)] {
                    let mut st = [s[0], s[1]];
                    if local < 3 {
                        st[node].u[local] += sign * h;
                    } else {
                        let mut dth = [0.0; 3];
                        dth[local - 3] = sign * h;
                        st[node].r = mat_mul(&exp(dth), &st[node].r);
                    }
                    let (_, bp) = corotational(&st[0], &st[1], self.l0, &self.r0)?;
                    cols[c] = btq(&bp, &q);
                }
                for i in 0..12 {
                    self.k[12 * i + j] += (cols[0][i] - cols[1][i]) / (2.0 * h);
                }
            }
        }
        self.f.copy_from_slice(&f);
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

/// A 3D truss bar: N = A·σ(ū/L₀). Its 12 DOFs include the nodes' rotations,
/// which it does not stiffen: restrain them where no frame does.
pub struct Truss3D {
    nodes: [usize; 2],
    l0: f64,
    e10: [f64; 3],
    kinematics: Kinematics,
    area: f64,
    material: Box<dyn UniaxialMaterial>,
    f: Vec<f64>,
    k: Vec<f64>,
    n: f64,
}

impl Truss3D {
    pub fn new(
        nodes: [usize; 2],
        xi: [f64; 3],
        xj: [f64; 3],
        kinematics: Kinematics,
        area: f64,
        material: Box<dyn UniaxialMaterial>,
    ) -> Result<Self, String> {
        let d = [xj[0] - xi[0], xj[1] - xi[1], xj[2] - xi[2]];
        let l0 = norm3(d);
        if !l0.is_finite() || l0 <= 0.0 {
            return Err("element of zero length".into());
        }
        let e10 = [d[0] / l0, d[1] / l0, d[2] / l0];
        let mut e = Truss3D { nodes, l0, e10, kinematics, area, material, f: vec![0.0; 12], k: vec![0.0; 144], n: 0.0 };
        let s0 = |x| NodeState3D { x0: x, u: [0.0; 3], r: IDENTITY };
        e.update(&[s0(xi), s0(xj)])?;
        Ok(e)
    }

    pub fn axial_force(&self) -> f64 {
        self.n
    }
}

impl Element3D for Truss3D {
    fn nodes(&self) -> &[usize] {
        &self.nodes
    }

    fn update(&mut self, s: &[NodeState3D]) -> Result<(), String> {
        let du = [s[1].u[0] - s[0].u[0], s[1].u[1] - s[0].u[1], s[1].u[2] - s[0].u[2]];
        let (e1, ln, ubar) = match self.kinematics {
            Kinematics::Linear => (self.e10, self.l0, dot3(self.e10, du)),
            Kinematics::Corotational => {
                let d0 = [self.e10[0] * self.l0, self.e10[1] * self.l0, self.e10[2] * self.l0];
                let d = [d0[0] + du[0], d0[1] + du[1], d0[2] + du[2]];
                let ln = norm3(d);
                if !ln.is_finite() || ln <= 1e-12 * self.l0 {
                    return Err("element collapsed to zero length".into());
                }
                let ubar = dot3([2.0 * d0[0] + du[0], 2.0 * d0[1] + du[1], 2.0 * d0[2] + du[2]], du) / (ln + self.l0);
                ([d[0] / ln, d[1] / ln, d[2] / ln], ln, ubar)
            }
        };
        self.material.set_trial_strain(ubar / self.l0);
        let n = self.area * self.material.stress();
        let ka = self.area * self.material.tangent() / self.l0;
        self.f.iter_mut().for_each(|x| *x = 0.0);
        self.k.iter_mut().for_each(|x| *x = 0.0);
        for a in 0..3 {
            self.f[a] = -n * e1[a];
            self.f[6 + a] = n * e1[a];
            for c in 0..3 {
                let mut kk = ka * e1[a] * e1[c];
                if self.kinematics == Kinematics::Corotational {
                    kk += n / ln * ((a == c) as u8 as f64 - e1[a] * e1[c]);
                }
                self.k[12 * a + c] = kk;
                self.k[12 * (6 + a) + 6 + c] = kk;
                self.k[12 * a + 6 + c] = -kk;
                self.k[12 * (6 + a) + c] = -kk;
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
