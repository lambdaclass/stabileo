//! A layered flat shell: plane-stress materials integrated through the
//! thickness, on a four-node quadrilateral with MITC4 transverse shear, under
//! small-displacement or co-rotational kinematics.
//!
//! **Section** ([`LayeredSection`]): layers at heights z from the mid-surface,
//! each with its own [`PlaneStressMaterial`] and history. A layer's strain is
//! ε + z·κ; the resultants N = Σ σ·t_k and M = Σ σ·z·t_k, with the 6×6
//! tangent [Σ C·t, Σ C·z·t; Σ C·z·t, Σ C·z²·t]. Unsymmetric layups (rebar
//! layers, a cracked slab) couple membrane and bending. Transverse shear is
//! elastic, κ·G·t: the layers' plasticity does not reach it.
//!
//! **Local element**: on the initial geometry projected onto its mean plane,
//! 2×2 Gauss points each with its own section; bilinear membrane and
//! curvatures; transverse shear by Bathe and Dvorkin's tying (the covariant
//! shear strains sampled at the edge midpoints), which keeps thin plates
//! from locking; and the Hughes–Brezzi drilling penalty, γ·(θ_z − ω)², with
//! γ = 10⁻³ of the section's initial in-plane shear stiffness. Local DOFs per
//! node: (u, v, w, θx, θy, θz); u(z) = z·θy, v(z) = −z·θx, so
//! κ = (∂θy/∂x, −∂θx/∂y, ∂θy/∂y − ∂θx/∂x) and γ = (∂w/∂x + θy, ∂w/∂y − θx).
//!
//! **Kinematics**:
//! - `Linear`: the local DOFs are the nodal displacements and rotation vectors
//!   (log R) in the element's initial axes.
//! - `Corotational`: the element-independent co-rotational formulation
//!   (Rankin and Nour-Omid, *Comput. Struct.* 30, 1988; Felippa and Haugen,
//!   *CMAME* 194, 2005). A frame from the current nodes (normal along the
//!   diagonals' cross product, x along edge 1–2 projected, origin at the
//!   centroid) removes the rigid motion: the local translations are the
//!   current positions in it minus the initial ones, the local rotations
//!   log(Rᵀ·R_i·R₀). The local element sees small deformations whatever the
//!   rotations. Its derivative B = ∂d_l/∂d (spatial rotation increments) is
//!   taken by central differences, and the geometric part of the tangent,
//!   ∂(Bᵀ·f_l)/∂d at frozen f_l, by differences of B, as the 3D frame does.
//!   Exact to the differences' accuracy (about 10⁻⁷ of the geometric part),
//!   and the cost of a first version: an analytic projector would be faster.

use super::element::Kinematics;
use super::model3d::{Element3D, NodeState3D};
use super::plane_stress::PlaneStressMaterial;
use super::rotation::{cross, dot3, exp, log, mat_mul, mat_t_vec, norm3, transpose, Mat3, IDENTITY};

// ==================== Section ====================

/// A layered shell section. Cloned for each Gauss point: each has its own
/// layers' histories.
#[derive(Clone)]
pub struct LayeredSection {
    /// (z, thickness, material).
    layers: Vec<(f64, f64, Box<dyn PlaneStressMaterial>)>,
    /// κ·G·t, elastic.
    shear: f64,
}

impl LayeredSection {
    /// Layers at heights `z` from the mid-surface (along the shell's normal),
    /// each with its thickness and material; `transverse_shear` is the
    /// elastic κ·G·t.
    pub fn new(layers: Vec<(f64, f64, Box<dyn PlaneStressMaterial>)>, transverse_shear: f64) -> Result<Self, String> {
        if layers.is_empty() {
            return Err("a section needs at least one layer".into());
        }
        if layers.iter().any(|(z, t, _)| !z.is_finite() || !t.is_finite() || *t <= 0.0) {
            return Err("layer heights must be finite and thicknesses positive".into());
        }
        if !transverse_shear.is_finite() || transverse_shear <= 0.0 {
            return Err("the transverse shear stiffness must be positive".into());
        }
        Ok(LayeredSection { layers, shear: transverse_shear })
    }

    /// One material through `thickness`, at `n` ≥ 3 Gauss–Lobatto points
    /// (each a layer whose thickness is its weight): elastic bending exact,
    /// and the surfaces, where a plate yields first, sampled. Transverse
    /// shear κ·G·t, κ = 5/6, G the material's elastic shear modulus `g`.
    pub fn uniform(thickness: f64, n: usize, material: &dyn PlaneStressMaterial, g: f64) -> Result<Self, String> {
        if n < 3 {
            return Err("a section through the thickness needs at least 3 points".into());
        }
        let layers = lobatto(n).into_iter().map(|(x, w)| (0.5 * thickness * x, 0.5 * thickness * w, material.boxed_clone())).collect();
        LayeredSection::new(layers, 5.0 / 6.0 * g * thickness)
    }

    pub fn thickness(&self) -> f64 {
        self.layers.iter().map(|(_, t, _)| t).sum()
    }

    /// Resultants (N_xx, N_yy, N_xy, M_xx, M_yy, M_xy) and their 6×6 tangent
    /// (row-major) at generalized strains (ε_xx, ε_yy, γ_xy, κ_xx, κ_yy,
    /// κ_xy), from the committed state.
    pub fn update(&mut self, e: [f64; 6]) -> Result<([f64; 6], [f64; 36]), String> {
        let mut s = [0.0; 6];
        let mut d = [0.0; 36];
        for (z, t, m) in &mut self.layers {
            let strain = [e[0] + *z * e[3], e[1] + *z * e[4], e[2] + *z * e[5]];
            m.set_trial_strain(strain)?;
            let (sig, c) = (m.stress(), m.tangent());
            for a in 0..3 {
                s[a] += sig[a] * *t;
                s[3 + a] += sig[a] * *z * *t;
                for b in 0..3 {
                    let cab = c[3 * a + b] * *t;
                    d[6 * a + b] += cab;
                    d[6 * a + 3 + b] += cab * *z;
                    d[6 * (3 + a) + b] += cab * *z;
                    d[6 * (3 + a) + 3 + b] += cab * *z * *z;
                }
            }
        }
        Ok((s, d))
    }

    pub fn commit(&mut self) {
        self.layers.iter_mut().for_each(|(_, _, m)| m.commit());
    }

    pub fn revert(&mut self) {
        self.layers.iter_mut().for_each(|(_, _, m)| m.revert());
    }
}

/// Gauss–Lobatto points and weights on [−1, 1]: the ends and the roots of
/// P'ₙ₋₁, by Newton from the Chebyshev–Lobatto points; exact for
/// polynomials of degree 2n − 3.
fn lobatto(n: usize) -> Vec<(f64, f64)> {
    let m = n - 1;
    // P_m and P_m' at x, by the recurrence.
    let legendre = |x: f64| {
        let (mut p0, mut p1) = (1.0, x);
        for k in 2..=m {
            let p2 = ((2 * k - 1) as f64 * x * p1 - (k - 1) as f64 * p0) / k as f64;
            p0 = p1;
            p1 = p2;
        }
        let dp = m as f64 * (x * p1 - p0) / (x * x - 1.0);
        (p1, dp)
    };
    (0..n)
        .map(|i| {
            let mut x = -(std::f64::consts::PI * i as f64 / m as f64).cos();
            if i > 0 && i < m {
                for _ in 0..100 {
                    // Newton on P_m' = 0: P_m'' from the Legendre equation.
                    let (p, dp) = legendre(x);
                    let ddp = (2.0 * x * dp - (m * (m + 1)) as f64 * p) / (1.0 - x * x);
                    let dx = dp / ddp;
                    x -= dx;
                    if dx.abs() < 1e-16 {
                        break;
                    }
                }
            }
            let (p, _) = if i == 0 || i == m { ((if i == 0 && m % 2 == 1 { -1.0 } else { 1.0 }), 0.0) } else { legendre(x) };
            (x, 2.0 / ((m * (m + 1)) as f64 * p * p))
        })
        .collect()
}

// ==================== Geometry ====================

fn sub(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn unit(v: [f64; 3]) -> Result<[f64; 3], String> {
    let n = norm3(v);
    if !n.is_finite() || n <= 0.0 {
        return Err("degenerate shell element".into());
    }
    Ok([v[0] / n, v[1] / n, v[2] / n])
}

/// The element frame of four points: columns (e1, e2, e3) of the returned
/// matrix, and the centroid.
fn frame(x: &[[f64; 3]; 4]) -> Result<(Mat3, [f64; 3]), String> {
    let e3 = unit(cross(sub(x[2], x[0]), sub(x[3], x[1])))?;
    let a = sub(x[1], x[0]);
    let a3 = dot3(a, e3);
    let e1 = unit([a[0] - a3 * e3[0], a[1] - a3 * e3[1], a[2] - a3 * e3[2]])?;
    let e2 = cross(e3, e1);
    let c = std::array::from_fn(|k| 0.25 * (x[0][k] + x[1][k] + x[2][k] + x[3][k]));
    Ok(([[e1[0], e2[0], e3[0]], [e1[1], e2[1], e3[1]], [e1[2], e2[2], e3[2]]], c))
}

const G: f64 = 0.577_350_269_189_625_8; // 1/√3
const GAUSS: [(f64, f64); 4] = [(-G, -G), (G, -G), (G, G), (-G, G)];

fn shape(xi: f64, eta: f64) -> [f64; 4] {
    [0.25 * (1.0 - xi) * (1.0 - eta), 0.25 * (1.0 + xi) * (1.0 - eta), 0.25 * (1.0 + xi) * (1.0 + eta), 0.25 * (1.0 - xi) * (1.0 + eta)]
}

fn shape_d(xi: f64, eta: f64) -> ([f64; 4], [f64; 4]) {
    (
        [-0.25 * (1.0 - eta), 0.25 * (1.0 - eta), 0.25 * (1.0 + eta), -0.25 * (1.0 + eta)],
        [-0.25 * (1.0 - xi), -0.25 * (1.0 + xi), 0.25 * (1.0 + xi), 0.25 * (1.0 - xi)],
    )
}

type Mat2 = [[f64; 2]; 2];

/// J = [[∂x/∂ξ, ∂y/∂ξ], [∂x/∂η, ∂y/∂η]], its inverse and determinant.
fn jacobian(p: &[[f64; 2]; 4], xi: f64, eta: f64) -> Result<(Mat2, Mat2, f64), String> {
    let (dxi, deta) = shape_d(xi, eta);
    let mut j = [[0.0; 2]; 2];
    for i in 0..4 {
        j[0][0] += dxi[i] * p[i][0];
        j[0][1] += dxi[i] * p[i][1];
        j[1][0] += deta[i] * p[i][0];
        j[1][1] += deta[i] * p[i][1];
    }
    let det = j[0][0] * j[1][1] - j[0][1] * j[1][0];
    if !det.is_finite() || det <= 0.0 {
        return Err("shell element with a non-positive Jacobian (nodes not counter-clockwise about its normal, or distorted)".into());
    }
    Ok((j, [[j[1][1] / det, -j[0][1] / det], [-j[1][0] / det, j[0][0] / det]], det))
}

/// The covariant transverse shear strains (e_ξz, e_ηz) at (ξ, η) as rows
/// over the 24 local DOFs.
fn shear_nat(p: &[[f64; 2]; 4], xi: f64, eta: f64) -> Result<[[f64; 24]; 2], String> {
    let (j, _, _) = jacobian(p, xi, eta)?;
    let (dxi, deta) = shape_d(xi, eta);
    let n = shape(xi, eta);
    let mut b = [[0.0; 24]; 2];
    for i in 0..4 {
        let d = 6 * i;
        b[0][d + 2] = dxi[i];
        b[0][d + 3] = -j[0][1] * n[i];
        b[0][d + 4] = j[0][0] * n[i];
        b[1][d + 2] = deta[i];
        b[1][d + 3] = -j[1][1] * n[i];
        b[1][d + 4] = j[1][0] * n[i];
    }
    Ok(b)
}

/// What the local element needs at one Gauss point: the generalized-strain
/// rows (6×24), the transverse shear rows (2×24), the drilling row, and
/// the area weight.
struct Point {
    b: [[f64; 24]; 6],
    s: [[f64; 24]; 2],
    drill: [f64; 24],
    w: f64,
}

fn points(p: &[[f64; 2]; 4]) -> Result<Vec<Point>, String> {
    let (ta, tb, tc, td) = (shear_nat(p, 0.0, -1.0)?, shear_nat(p, 0.0, 1.0)?, shear_nat(p, -1.0, 0.0)?, shear_nat(p, 1.0, 0.0)?);
    GAUSS
        .iter()
        .map(|&(xi, eta)| {
            let (_, inv, det) = jacobian(p, xi, eta)?;
            let (dxi, deta) = shape_d(xi, eta);
            let n = shape(xi, eta);
            let mut b = [[0.0; 24]; 6];
            let mut drill = [0.0; 24];
            for i in 0..4 {
                let dx = inv[0][0] * dxi[i] + inv[0][1] * deta[i];
                let dy = inv[1][0] * dxi[i] + inv[1][1] * deta[i];
                let d = 6 * i;
                b[0][d] = dx;
                b[1][d + 1] = dy;
                b[2][d] = dy;
                b[2][d + 1] = dx;
                b[3][d + 4] = dx;
                b[4][d + 3] = -dy;
                b[5][d + 4] = dy;
                b[5][d + 3] = -dx;
                drill[d] = 0.5 * dy;
                drill[d + 1] = -0.5 * dx;
                drill[d + 5] = n[i];
            }
            let mut s = [[0.0; 24]; 2];
            for c in 0..24 {
                let e_xi = 0.5 * (1.0 - eta) * ta[0][c] + 0.5 * (1.0 + eta) * tb[0][c];
                let e_eta = 0.5 * (1.0 - xi) * tc[1][c] + 0.5 * (1.0 + xi) * td[1][c];
                s[0][c] = inv[0][0] * e_xi + inv[0][1] * e_eta;
                s[1][c] = inv[1][0] * e_xi + inv[1][1] * e_eta;
            }
            Ok(Point { b, s, drill, w: det })
        })
        .collect()
}

// ==================== Element ====================

/// A four-node layered shell; nodes counter-clockwise about its normal.
pub struct Shell4 {
    nodes: [usize; 4],
    kinematics: Kinematics,
    x0: [[f64; 3]; 4],
    /// The initial frame (columns e1, e2, e3) and the nodes in it.
    r0: Mat3,
    p0: [[f64; 3]; 4],
    points: Vec<Point>,
    sections: Vec<LayeredSection>,
    drill: f64,
    shear: f64,
    f: Vec<f64>,
    k: Vec<f64>,
    /// The local forces of the trial state, for the initial-stress stiffness.
    f_local: [f64; 24],
    resultants: [[f64; 6]; 4],
}

impl Shell4 {
    pub fn new(nodes: [usize; 4], x: [[f64; 3]; 4], kinematics: Kinematics, section: &LayeredSection) -> Result<Self, String> {
        let (r0, c0) = frame(&x)?;
        let p0: [[f64; 3]; 4] = std::array::from_fn(|i| mat_t_vec(&r0, sub(x[i], c0)));
        let flat: [[f64; 2]; 4] = std::array::from_fn(|i| [p0[i][0], p0[i][1]]);
        let points = points(&flat)?;
        let mut probe = section.clone();
        let (_, d) = probe.update([0.0; 6])?;
        probe.revert();
        let mut e = Shell4 {
            nodes,
            kinematics,
            x0: x,
            r0,
            p0,
            points,
            sections: vec![section.clone(); 4],
            drill: 1e-3 * d[6 * 2 + 2],
            shear: section.shear,
            f: vec![0.0; 24],
            k: vec![0.0; 576],
            f_local: [0.0; 24],
            resultants: [[0.0; 6]; 4],
        };
        let s0 = |x| NodeState3D { x0: x, u: [0.0; 3], r: IDENTITY };
        e.update(&[s0(x[0]), s0(x[1]), s0(x[2]), s0(x[3])])?;
        Ok(e)
    }

    /// The trial resultants at each Gauss point, in the element's local
    /// axes: (N_xx, N_yy, N_xy, M_xx, M_yy, M_xy).
    pub fn resultants(&self) -> [[f64; 6]; 4] {
        self.resultants
    }

    /// The local response: forces and tangent of the local DOFs.
    fn local(&mut self, d: &[f64; 24]) -> Result<([f64; 24], Vec<f64>), String> {
        let mut f = [0.0; 24];
        let mut k = vec![0.0; 576];
        for (g, pt) in self.points.iter().enumerate() {
            let e: [f64; 6] = std::array::from_fn(|a| pt.b[a].iter().zip(d).map(|(x, y)| x * y).sum());
            let (s, dm) = self.sections[g].update(e)?;
            self.resultants[g] = s;
            let mut db = [[0.0; 24]; 6];
            for (a, row) in db.iter_mut().enumerate() {
                for (c, v) in row.iter_mut().enumerate() {
                    *v = (0..6).map(|b| dm[6 * a + b] * pt.b[b][c]).sum();
                }
            }
            let gam: [f64; 2] = std::array::from_fn(|a| pt.s[a].iter().zip(d).map(|(x, y)| x * y).sum());
            let om: f64 = pt.drill.iter().zip(d).map(|(x, y)| x * y).sum();
            for r in 0..24 {
                f[r] += pt.w * ((0..6).map(|a| pt.b[a][r] * s[a]).sum::<f64>() + self.shear * (pt.s[0][r] * gam[0] + pt.s[1][r] * gam[1]) + self.drill * pt.drill[r] * om);
                for c in 0..24 {
                    k[24 * r + c] += pt.w
                        * ((0..6).map(|a| pt.b[a][r] * db[a][c]).sum::<f64>()
                            + self.shear * (pt.s[0][r] * pt.s[0][c] + pt.s[1][r] * pt.s[1][c])
                            + self.drill * pt.drill[r] * pt.drill[c]);
                }
            }
        }
        Ok((f, k))
    }

    /// The local DOFs of a state: deformational under co-rotational
    /// kinematics, the displacements in the initial axes otherwise.
    fn local_dofs(&self, s: &[NodeState3D]) -> Result<[f64; 24], String> {
        let mut d = [0.0; 24];
        match self.kinematics {
            Kinematics::Linear => {
                for i in 0..4 {
                    d[6 * i..6 * i + 3].copy_from_slice(&mat_t_vec(&self.r0, s[i].u));
                    d[6 * i + 3..6 * i + 6].copy_from_slice(&mat_t_vec(&self.r0, log(&s[i].r)));
                }
            }
            Kinematics::Corotational => {
                let x: [[f64; 3]; 4] = std::array::from_fn(|i| s[i].position());
                let (r, c) = frame(&x)?;
                let rt = transpose(&r);
                for i in 0..4 {
                    let p = mat_t_vec(&r, sub(x[i], c));
                    for k in 0..3 {
                        d[6 * i + k] = p[k] - self.p0[i][k];
                    }
                    d[6 * i + 3..6 * i + 6].copy_from_slice(&log(&mat_mul(&mat_mul(&rt, &s[i].r), &self.r0)));
                }
            }
        }
        Ok(d)
    }

    /// B = ∂d_l/∂d (24×24, row-major) at the states `s`, by central
    /// differences; rotations perturbed by spatial increments.
    fn b_matrix(&self, s: &[NodeState3D]) -> Result<Vec<f64>, String> {
        let mut b = vec![0.0; 576];
        if self.kinematics == Kinematics::Linear {
            for i in 0..4 {
                for blk in 0..2 {
                    for a in 0..3 {
                        for c in 0..3 {
                            b[24 * (6 * i + 3 * blk + a) + 6 * i + 3 * blk + c] = self.r0[c][a];
                        }
                    }
                }
            }
            return Ok(b);
        }
        let l = self.size();
        for j in 0..24 {
            let (node, local) = (j / 6, j % 6);
            let h = if local < 3 { 1e-6 * l } else { 1e-6 };
            let mut col = [[0.0; 24]; 2];
            for (c, sign) in [(0, 1.0), (1, -1.0)] {
                let mut st = [s[0], s[1], s[2], s[3]];
                if local < 3 {
                    st[node].u[local] += sign * h;
                } else {
                    let mut dth = [0.0; 3];
                    dth[local - 3] = sign * h;
                    st[node].r = mat_mul(&exp(dth), &st[node].r);
                }
                col[c] = self.local_dofs(&st)?;
            }
            for i in 0..24 {
                b[24 * i + j] = (col[0][i] - col[1][i]) / (2.0 * h);
            }
        }
        Ok(b)
    }

    /// ∂(Bᵀ·f_l)/∂d at the states `s` with f_l frozen, by central
    /// differences of B.
    fn geometric(&self, s: &[NodeState3D], f_l: &[f64; 24]) -> Result<Vec<f64>, String> {
        let mut k = vec![0.0; 576];
        let l = self.size();
        for j in 0..24 {
            let (node, local) = (j / 6, j % 6);
            let h = if local < 3 { 1e-4 * l } else { 1e-4 };
            let mut col = [[0.0; 24]; 2];
            for (c, sign) in [(0, 1.0), (1, -1.0)] {
                let mut st = [s[0], s[1], s[2], s[3]];
                if local < 3 {
                    st[node].u[local] += sign * h;
                } else {
                    let mut dth = [0.0; 3];
                    dth[local - 3] = sign * h;
                    st[node].r = mat_mul(&exp(dth), &st[node].r);
                }
                let b = self.b_matrix(&st)?;
                for i in 0..24 {
                    col[c][i] = (0..24).map(|a| b[24 * a + i] * f_l[a]).sum();
                }
            }
            for i in 0..24 {
                k[24 * i + j] = (col[0][i] - col[1][i]) / (2.0 * h);
            }
        }
        Ok(k)
    }

    fn size(&self) -> f64 {
        norm3(sub(self.x0[2], self.x0[0])).max(norm3(sub(self.x0[3], self.x0[1])))
    }
}

impl Element3D for Shell4 {
    fn nodes(&self) -> &[usize] {
        &self.nodes
    }

    fn update(&mut self, s: &[NodeState3D]) -> Result<(), String> {
        let d = self.local_dofs(s)?;
        let (fl, kl) = self.local(&d)?;
        let b = self.b_matrix(s)?;
        // f = Bᵀ·f_l, K = Bᵀ·K_l·B (+ the geometric part).
        let mut kb = vec![0.0; 576];
        for a in 0..24 {
            for j in 0..24 {
                kb[24 * a + j] = (0..24).map(|c| kl[24 * a + c] * b[24 * c + j]).sum();
            }
        }
        for i in 0..24 {
            self.f[i] = (0..24).map(|a| b[24 * a + i] * fl[a]).sum();
            for j in 0..24 {
                self.k[24 * i + j] = (0..24).map(|a| b[24 * a + i] * kb[24 * a + j]).sum();
            }
        }
        if self.kinematics == Kinematics::Corotational {
            let g = self.geometric(s, &fl)?;
            for (k, g) in self.k.iter_mut().zip(g) {
                *k += g;
            }
        }
        self.f_local = fl;
        Ok(())
    }

    fn internal_force(&self) -> &[f64] {
        &self.f
    }

    fn tangent(&self) -> &[f64] {
        &self.k
    }

    fn initial_stress(&self) -> Result<Vec<f64>, String> {
        if self.kinematics == Kinematics::Linear {
            return Ok(vec![0.0; 576]);
        }
        let s0 = |x| NodeState3D { x0: x, u: [0.0; 3], r: IDENTITY };
        self.geometric(&[s0(self.x0[0]), s0(self.x0[1]), s0(self.x0[2]), s0(self.x0[3])], &self.f_local)
    }

    fn commit(&mut self) {
        self.sections.iter_mut().for_each(|s| s.commit());
    }

    fn revert(&mut self) {
        self.sections.iter_mut().for_each(|s| s.revert());
    }
}
