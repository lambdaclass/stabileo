//! Linear buckling analysis (LBA) of a model of the framework, and the modes
//! it gives as the shape of geometric imperfections (GMNIA).
//!
//! The eigenproblem is (K₀ + λ·K₁)·φ = 0 at the undeformed state: K₀ the
//! tangent there, K₁ = dK_T/dλ the tangent's rate under the reference load
//! (Brendel and Ramm's linearized prebuckling, *Comput. Struct.* 12, 1980).
//! The elements do not hand over a geometric stiffness of their own, so K₁ is
//! the central difference of the tangent along the linear solution
//! u₁ = K₀⁻¹·F, at a step that moves no node by more than 10⁻⁶ of the
//! model's size: the elements stay elastic and the difference keeps about
//! ten digits. K₁ is the initial-stress stiffness of the linear prestress
//! plus the tangent's change with the prebuckling displacements. Where those
//! are small (members in compression, frames that sway) the factors are the
//! classical LBA's; where the structure bends a lot before it buckles they
//! differ by that bending, as an LBA of the deformed shape would.
//!
//! The lowest factors come from subspace iteration on K₀⁻¹·K₁ with
//! Rayleigh–Ritz on the symmetric parts (K₀ positive definite: a structure
//! stable when unloaded). Only positive factors are buckling under the load
//! as given; a negative one is buckling under the reversed load, and is not
//! reported.

use super::linear_solver::TangentSystem;
use super::model::{DofKind, NonlinearModel};
use super::sparse::SparseMatrix;
use crate::linalg::jacobi::jacobi_eigen;

#[derive(Debug, Clone)]
pub struct BucklingOptions {
    /// Modes wanted, lowest factors first.
    pub modes: usize,
    /// Relative change of the wanted factors between iterations at which
    /// the iteration stops.
    pub tolerance: f64,
    pub max_iterations: usize,
}

impl Default for BucklingOptions {
    fn default() -> Self {
        BucklingOptions { modes: 1, tolerance: 1e-10, max_iterations: 500 }
    }
}

#[derive(Debug, Clone)]
pub struct Buckling {
    /// The multiples of the reference load at which the structure buckles,
    /// ascending. Fewer than asked for when the subspace holds no more
    /// positive ones; none when no member is in compression.
    pub factors: Vec<f64>,
    /// The modes over all DOFs (zero at restrained ones), in the same order,
    /// scaled so that their largest translation is 1 and positive: an
    /// imperfection of amplitude e₀ is e₀ times the mode.
    pub modes: Vec<Vec<f64>>,
}

/// Relative size of the step of the central difference: the largest nodal
/// translation it makes, over the model's characteristic length.
const STEP: f64 = 1e-6;

fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

/// Modified Gram–Schmidt, twice; drops vectors that vanish against the
/// others.
fn orthonormalize(v: &mut Vec<Vec<f64>>) {
    let mut out: Vec<Vec<f64>> = Vec::with_capacity(v.len());
    for mut x in v.drain(..) {
        let norm0 = dot(&x, &x).sqrt();
        for _ in 0..2 {
            for q in &out {
                let c = dot(&x, q);
                x.iter_mut().zip(q).for_each(|(xi, qi)| *xi -= c * qi);
            }
        }
        let norm = dot(&x, &x).sqrt();
        if norm > 1e-10 * norm0 && norm > 0.0 {
            x.iter_mut().for_each(|xi| *xi /= norm);
            out.push(x);
        }
    }
    *v = out;
}

/// Cholesky L of a symmetric positive definite p×p (row-major), or `None`.
fn cholesky(a: &[f64], p: usize) -> Option<Vec<f64>> {
    let mut l = vec![0.0; p * p];
    for i in 0..p {
        for j in 0..=i {
            let s = a[i * p + j] - (0..j).map(|k| l[i * p + k] * l[j * p + k]).sum::<f64>();
            if i == j {
                if s <= 0.0 {
                    return None;
                }
                l[i * p + i] = s.sqrt();
            } else {
                l[i * p + j] = s / l[j * p + j];
            }
        }
    }
    Some(l)
}

/// The linear buckling factors and modes of `model` under its reference
/// load, about its undeformed state (which must be the committed one).
/// `Err` when the unloaded structure is not stable (its stiffness is not
/// positive definite), when there is no load, or when the iteration does
/// not converge.
pub fn linear_buckling<M: NonlinearModel>(model: &mut M, opts: &BucklingOptions) -> Result<Buckling, String> {
    model.revert();
    if model.displacements().iter().any(|&u| u != 0.0) {
        return Err("linear buckling is about the undeformed state, and the committed state is displaced".into());
    }
    let n_all = model.n_dofs();
    let mut sys = TangentSystem::new(model);
    let n = sys.free.len();
    if n == 0 {
        return Err("no free DOFs".into());
    }
    let f_all = model.reference_load().to_vec();
    let f: Vec<f64> = sys.free.iter().map(|&d| f_all[d]).collect();
    if f.iter().all(|&x| x == 0.0) {
        return Err("no reference load".into());
    }

    let assemble = |model: &mut M, sys: &mut TangentSystem| -> Result<SparseMatrix, String> {
        let mut f_int = vec![0.0; n_all];
        sys.clear();
        model.assemble(&mut f_int, &mut |e, _, ke| sys.add(e, ke))?;
        if !sys.is_finite() {
            return Err("non-finite tangent".into());
        }
        Ok(sys.matrix().clone())
    };

    let k0 = assemble(model, &mut sys)?;
    let fac = sys.factor()?;
    if fac.negative_eigenvalues() != Some(0) || fac.near_singular() {
        return Err("the unloaded structure is not stable: its stiffness is not positive definite".into());
    }
    let u1 = sys.solve(&fac, &f)?;

    // K₁ = K_σ of the linear prestress: the initial-stress stiffness at the
    // basic forces of ±h·u₁, differenced (linear in the forces; the
    // central difference removes their second-order part).
    let translation = sys
        .free
        .iter()
        .zip(&u1)
        .filter(|(&d, _)| model.dof_kind(d) == DofKind::Translation)
        .fold(0.0f64, |a, (_, x)| a.max(x.abs()));
    let h = if translation > 0.0 {
        STEP * model.characteristic_length() / translation
    } else {
        STEP / u1.iter().fold(0.0f64, |a, x| a.max(x.abs()))
    };
    if !h.is_finite() || h <= 0.0 {
        return Err("the reference load does not move the structure".into());
    }
    let initial_stress = |model: &mut M, sys: &mut TangentSystem| -> Result<SparseMatrix, String> {
        sys.clear();
        model.assemble_initial_stress(&mut |e, _, ke| sys.add(e, ke))?;
        if !sys.is_finite() {
            return Err("non-finite initial-stress stiffness".into());
        }
        Ok(sys.matrix().clone())
    };
    let step = sys.scatter(&u1.iter().map(|x| x * h).collect::<Vec<_>>(), n_all);
    model.increment(&step);
    let kp = initial_stress(model, &mut sys);
    model.increment(&step.iter().map(|x| -2.0 * x).collect::<Vec<_>>());
    let km = initial_stress(model, &mut sys);
    model.revert();
    let (kp, km) = (kp?, km?);
    let mut k1 = k0.clone();
    for ((v, p), m) in k1.values.iter_mut().zip(&kp.values).zip(&km.values) {
        *v = (p - m) / (2.0 * h);
    }
    // The solves' iterative refinement reads the system's matrix: K₀ again.
    sys.set_values(&k0.values);

    // Subspace iteration on K₀⁻¹·K₁: K₁·φ = θ·K₀·φ, θ = −1/λ. The wanted
    // θ are the most negative.
    let wanted = opts.modes.max(1).min(n);
    let p = (2 * wanted).max(wanted + 8).min(n);
    let mut x: Vec<Vec<f64>> = (0..p)
        .map(|c| {
            if c == 0 {
                u1.clone()
            } else {
                (0..n).map(|i| (((i as u64 + 1) * (2_654_435_761 + 97 * c as u64)) % 1000) as f64 / 1000.0 - 0.5).collect()
            }
        })
        .collect();
    let mut previous: Option<Vec<f64>> = None;
    for _ in 0..opts.max_iterations {
        let mut y: Vec<Vec<f64>> = x.iter().map(|v| sys.solve(&fac, &k1.mat_vec(v))).collect::<Result<_, _>>()?;
        orthonormalize(&mut y);
        let q = y.len();
        if q == 0 {
            // K₁·x vanishes on the whole subspace: no member is in
            // compression, and nothing buckles under this load.
            return Ok(Buckling { factors: Vec::new(), modes: Vec::new() });
        }
        let k1y: Vec<Vec<f64>> = y.iter().map(|v| k1.mat_vec(v)).collect();
        let k0y: Vec<Vec<f64>> = y.iter().map(|v| k0.mat_vec(v)).collect();
        let (mut a1, mut a0) = (vec![0.0; q * q], vec![0.0; q * q]);
        for r in 0..q {
            for c in 0..q {
                a1[r * q + c] = 0.5 * (dot(&y[r], &k1y[c]) + dot(&y[c], &k1y[r]));
                a0[r * q + c] = 0.5 * (dot(&y[r], &k0y[c]) + dot(&y[c], &k0y[r]));
            }
        }
        let l = cholesky(&a0, q).ok_or("the projected stiffness is not positive definite")?;
        // C = L⁻¹·A₁·L⁻ᵀ, column by column.
        let solve_l = |b: &[f64]| {
            let mut z = b.to_vec();
            for i in 0..q {
                for k in 0..i {
                    z[i] -= l[i * q + k] * z[k];
                }
                z[i] /= l[i * q + i];
            }
            z
        };
        let solve_lt = |b: &[f64]| {
            let mut z = b.to_vec();
            for i in (0..q).rev() {
                for k in i + 1..q {
                    z[i] -= l[k * q + i] * z[k];
                }
                z[i] /= l[i * q + i];
            }
            z
        };
        let mut w = vec![0.0; q * q]; // L⁻¹·A₁, row-major
        for c in 0..q {
            let col: Vec<f64> = (0..q).map(|r| a1[r * q + c]).collect();
            for (r, v) in solve_l(&col).into_iter().enumerate() {
                w[r * q + c] = v;
            }
        }
        let mut cm = vec![0.0; q * q];
        for r in 0..q {
            let row: Vec<f64> = (0..q).map(|c| w[r * q + c]).collect();
            for (c, v) in solve_l(&row).into_iter().enumerate() {
                cm[r * q + c] = v;
            }
        }
        for r in 0..q {
            for c in 0..r {
                let s = 0.5 * (cm[r * q + c] + cm[c * q + r]);
                cm[r * q + c] = s;
                cm[c * q + r] = s;
            }
        }
        let eig = jacobi_eigen(&cm, q, 200);
        // Ritz vectors Y·L⁻ᵀ·z, the largest |θ| first.
        let mut ritz: Vec<(f64, Vec<f64>)> = (0..q)
            .map(|c| {
                let z: Vec<f64> = (0..q).map(|r| eig.vectors[r * q + c]).collect();
                let coef = solve_lt(&z);
                let mut v = vec![0.0; n];
                for (yr, &cr) in y.iter().zip(&coef) {
                    v.iter_mut().zip(yr).for_each(|(vi, yi)| *vi += cr * yi);
                }
                (eig.values[c], v)
            })
            .collect();
        ritz.sort_by(|a, b| b.0.abs().total_cmp(&a.0.abs()));
        let thetas: Vec<f64> = ritz.iter().filter(|(t, _)| *t < 0.0).map(|(t, _)| *t).take(wanted).collect();
        let converged = previous.as_ref().is_some_and(|prev| {
            prev.len() == thetas.len() && prev.iter().zip(&thetas).all(|(a, b)| (a - b).abs() <= opts.tolerance * b.abs())
        });
        if converged {
            let mut found: Vec<(f64, Vec<f64>)> = ritz.into_iter().filter(|(t, _)| *t < 0.0).take(wanted).collect();
            found.sort_by(|a, b| a.0.total_cmp(&b.0));
            let mut factors = Vec::new();
            let mut modes = Vec::new();
            for (theta, v) in found {
                let full = sys.scatter(&v, n_all);
                let lead = (0..n_all)
                    .filter(|&d| model.dof_kind(d) == DofKind::Translation)
                    .max_by(|&a, &b| full[a].abs().total_cmp(&full[b].abs()))
                    .filter(|&d| full[d] != 0.0)
                    .or_else(|| (0..n_all).max_by(|&a, &b| full[a].abs().total_cmp(&full[b].abs())))
                    .unwrap_or(0);
                let scale = full[lead];
                factors.push(-1.0 / theta);
                modes.push(full.iter().map(|x| x / scale).collect());
            }
            return Ok(Buckling { factors, modes });
        }
        previous = Some(thetas);
        x = ritz.into_iter().map(|(_, v)| v).collect();
    }
    Err("the buckling iteration did not converge".into())
}
