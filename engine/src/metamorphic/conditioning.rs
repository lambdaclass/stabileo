//! Comparison tolerances derived from the model's conditioning.
//!
//! Two solves of the same physical model (rotated, renumbered, rescaled)
//! differ by the round-off each carries, never by more. For a symmetric
//! positive-definite system solved by Cholesky (backward stable), the
//! computed solution satisfies `(K + δK)·ũ = f` with `|δK| ≤ c·n·ε·|K|`
//! entrywise, so ‖ũ − u‖/‖u‖ ≲ n·ε·κ where κ is the condition number of the
//! *diagonally scaled* matrix `S = D^{-1/2}·K·D^{-1/2}`, `D = diag K` — the
//! componentwise backward error of Cholesky is invariant under diagonal
//! scaling (van der Sluis), so the units of the DOFs (m vs rad) do not enter.
//! Member forces and reactions are `K·ũ` products whose error is bounded by
//! the same relative amount of the force scale (‖K·δu‖ = ‖δK·u‖ ≤ n·ε·κ‖f‖).
//!
//! The transformed model is itself only representable up to rounding: its
//! node coordinates are rounded after the rotation, which perturbs each
//! element's geometry by ε·|x|/L relative (|x| the coordinate magnitude, L
//! the element length). That enters as the factor `geom = 1 + max|x|/min L`.
//!
//! So the relative tolerance for a direct linear solve is
//! `rel = n · ε · κ · geom`, with κ estimated (Gershgorin upper bound on
//! λ_max(S), inverse iteration on the Cholesky factor for λ_min(S)). Analyses
//! with an iterative convergence criterion add a term from that criterion
//! (see the harness). When `rel` exceeds [`INCONCLUSIVE`] the comparison
//! cannot discriminate a bug from round-off and is reported, not passed.

use crate::solver::assembly::{assemble_2d, assemble_3d};
use crate::solver::constraints::{build_constraint_transform, inclined_dofs_2d, inclined_dofs_3d};
use crate::solver::dof::DofNumbering;
use crate::types::*;

/// Above this relative tolerance a metamorphic comparison is inconclusive.
pub const INCONCLUSIVE: f64 = 1e-3;

#[derive(Debug, Clone, Copy)]
pub struct Conditioning {
    /// Order of the (reduced, free) stiffness system.
    pub n: usize,
    /// Estimated condition number of the diagonally scaled stiffness.
    pub kappa: f64,
    /// Geometric rounding amplification 1 + max|x| / min element length.
    pub geom: f64,
    /// Model size (largest extent), for the family-scale floors.
    pub lchar: f64,
}

impl Conditioning {
    /// Relative tolerance of a direct linear solve: 4·(n + 24)·ε·κ·geom.
    pub fn rel(&self) -> f64 {
        4.0 * (self.n as f64 + 24.0) * f64::EPSILON * self.kappa.max(1.0) * self.geom
    }
    /// Combine the conditioning of the two models being compared.
    pub fn worst(&self, o: &Conditioning) -> Conditioning {
        Conditioning { n: self.n.max(o.n), kappa: self.kappa.max(o.kappa), geom: self.geom.max(o.geom), lchar: self.lchar.max(o.lchar) }
    }
}

/// κ(D^{-1/2} K D^{-1/2}) for a dense SPD n×n matrix (row-major).
pub fn scaled_condition(k: &[f64], n: usize) -> Result<f64, String> {
    if n == 0 {
        return Ok(1.0);
    }
    let mut d = vec![0.0; n];
    for i in 0..n {
        let kii = k[i * n + i];
        if !(kii > 0.0) || !kii.is_finite() {
            return Err(format!("non-positive diagonal at DOF {i}"));
        }
        d[i] = 1.0 / kii.sqrt();
    }
    let mut s = vec![0.0; n * n];
    let mut lmax: f64 = 0.0;
    for i in 0..n {
        let mut row = 0.0;
        for j in 0..n {
            // Symmetrize: assembled matrices carry round-off asymmetry.
            let v = 0.5 * (k[i * n + j] + k[j * n + i]) * d[i] * d[j];
            s[i * n + j] = v;
            row += v.abs();
        }
        lmax = lmax.max(row);
    }
    // Cholesky S = L Lᵀ (lower, in place).
    for j in 0..n {
        let mut sum = s[j * n + j];
        for p in 0..j {
            sum -= s[j * n + p] * s[j * n + p];
        }
        if !(sum > 0.0) {
            return Err("scaled stiffness is not positive definite".into());
        }
        let ljj = sum.sqrt();
        s[j * n + j] = ljj;
        for i in (j + 1)..n {
            let mut v = s[i * n + j];
            for p in 0..j {
                v -= s[i * n + p] * s[j * n + p];
            }
            s[i * n + j] = v / ljj;
        }
    }
    // Inverse iteration for λ_min(S): x ← S⁻¹x / ‖·‖, λ ≈ 1/‖S⁻¹x‖.
    let mut x: Vec<f64> = (0..n).map(|i| 1.0 + ((i * 7919) % 101) as f64 / 101.0).collect();
    let nrm = |v: &[f64]| v.iter().map(|a| a * a).sum::<f64>().sqrt();
    let nx = nrm(&x);
    x.iter_mut().for_each(|a| *a /= nx);
    let mut lmin = f64::INFINITY;
    for _ in 0..60 {
        // Solve L y = x, Lᵀ z = y.
        let mut y = x.clone();
        for i in 0..n {
            let mut v = y[i];
            for p in 0..i {
                v -= s[i * n + p] * y[p];
            }
            y[i] = v / s[i * n + i];
        }
        for i in (0..n).rev() {
            let mut v = y[i];
            for p in (i + 1)..n {
                v -= s[p * n + i] * y[p];
            }
            y[i] = v / s[i * n + i];
        }
        let ny = nrm(&y);
        let est = 1.0 / ny;
        let done = (lmin - est).abs() <= 1e-6 * est;
        lmin = est;
        x = y.iter().map(|a| a / ny).collect();
        if done {
            break;
        }
    }
    Ok(lmax / lmin)
}

fn free_block(k: &[f64], n_total: usize, idx: &[usize]) -> Vec<f64> {
    let m = idx.len();
    let mut o = vec![0.0; m * m];
    for (a, &i) in idx.iter().enumerate() {
        for (b, &j) in idx.iter().enumerate() {
            o[a * m + b] = k[i * n_total + j];
        }
    }
    o
}

/// Free (and, with constraints, independent) stiffness block.
fn reduced(k: &[f64], dof: &DofNumbering, ct: Option<crate::solver::constraints::ConstraintTransform>) -> (Vec<f64>, usize) {
    let n = dof.n_total;
    let nf = dof.n_free;
    match ct {
        None => {
            let idx: Vec<usize> = (0..nf).collect();
            (free_block(k, n, &idx), nf)
        }
        Some(ct) => {
            let kr = ct.c.reduce_dense(k);
            let p = ct.n_independent;
            let idx: Vec<usize> = (0..p).filter(|&j| ct.independent_dofs[j] < nf).collect();
            (free_block(&kr, p, &idx), idx.len())
        }
    }
}

fn geom_factor(points: &[[f64; 3]], chords: &[f64]) -> (f64, f64) {
    let xmax = points.iter().flat_map(|p| p.iter()).fold(0.0f64, |a, &b| a.max(b.abs()));
    let lmin = chords.iter().copied().filter(|&l| l > 0.0).fold(f64::INFINITY, f64::min);
    let mut lo = [f64::INFINITY; 3];
    let mut hi = [f64::NEG_INFINITY; 3];
    for p in points {
        for i in 0..3 {
            lo[i] = lo[i].min(p[i]);
            hi[i] = hi[i].max(p[i]);
        }
    }
    let lchar = (0..3).map(|i| hi[i] - lo[i]).filter(|x| x.is_finite()).fold(0.0f64, f64::max);
    let geom = if lmin.is_finite() { 1.0 + xmax / lmin } else { 1.0 };
    (geom, if lchar > 0.0 { lchar } else { 1.0 })
}

pub fn of_2d(input: &SolverInput) -> Result<Conditioning, String> {
    let dof = DofNumbering::build_2d(input);
    let asm = assemble_2d(input, &dof);
    let ct = if input.constraints.is_empty() {
        None
    } else {
        Some(build_constraint_transform(&input.constraints, &dof, Some(&input.nodes), None, &inclined_dofs_2d(input, &dof))?)
    };
    let (kr, n) = reduced(&asm.k, &dof, ct);
    let kappa = scaled_condition(&kr, n)?;
    let pts: Vec<[f64; 3]> = crate::ordered::values(&input.nodes).map(|p| [p.x, p.z, 0.0]).collect();
    let pos = |id: usize| input.nodes.get(&id.to_string()).map(|p| [p.x, p.z]);
    let chords: Vec<f64> = input
        .elements
        .values()
        .filter_map(|e| Some((pos(e.node_i)?, pos(e.node_j)?)))
        .map(|(a, b)| ((b[0] - a[0]).powi(2) + (b[1] - a[1]).powi(2)).sqrt())
        .collect();
    let (geom, lchar) = geom_factor(&pts, &chords);
    Ok(Conditioning { n, kappa, geom, lchar })
}

pub fn of_3d(input: &SolverInput3D) -> Result<Conditioning, String> {
    let input = &crate::solver::linear::expand_curved_beams_3d(input);
    let dof = DofNumbering::build_3d(input);
    let asm = assemble_3d(input, &dof);
    let ct = if input.constraints.is_empty() {
        None
    } else {
        Some(build_constraint_transform(&input.constraints, &dof, None, Some(&input.nodes), &inclined_dofs_3d(input, &dof))?)
    };
    let (kr, n) = reduced(&asm.k, &dof, ct);
    let kappa = scaled_condition(&kr, n)?;
    let pts: Vec<[f64; 3]> = crate::ordered::values(&input.nodes).map(|p| [p.x, p.y, p.z]).collect();
    let pos = |id: usize| input.nodes.get(&id.to_string()).map(|p| [p.x, p.y, p.z]);
    let dist = |a: [f64; 3], b: [f64; 3]| ((b[0] - a[0]).powi(2) + (b[1] - a[1]).powi(2) + (b[2] - a[2]).powi(2)).sqrt();
    let mut chords: Vec<f64> = crate::ordered::values(&input.elements).filter_map(|e| Some(dist(pos(e.node_i)?, pos(e.node_j)?))).collect();
    let mut edges = |ns: &[usize]| {
        for k in 0..ns.len() {
            if let (Some(a), Some(b)) = (pos(ns[k]), pos(ns[(k + 1) % ns.len()])) {
                chords.push(dist(a, b));
            }
        }
    };
    for p in crate::ordered::values(&input.plates) {
        edges(&p.nodes);
    }
    for p in crate::ordered::values(&input.quads) {
        edges(&p.nodes);
    }
    for p in crate::ordered::values(&input.quad9s) {
        edges(&p.nodes[..4]);
    }
    for p in crate::ordered::values(&input.curved_shells) {
        edges(&p.nodes);
    }
    for p in crate::ordered::values(&input.solid_shells) {
        edges(&p.nodes[..4]);
    }
    let (geom, lchar) = geom_factor(&pts, &chords);
    Ok(Conditioning { n, kappa, geom, lchar })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scaled_condition_of_diagonal_is_one() {
        let k = [4.0, 0.0, 0.0, 9.0];
        assert!((scaled_condition(&k, 2).unwrap() - 1.0).abs() < 1e-12);
    }

    #[test]
    fn scaled_condition_tracks_coupling() {
        // S = [[1, a], [a, 1]]: λ = 1 ± a, κ = (1 + a)/(1 − a).
        let a = 0.99;
        let k = [1.0, a, a, 1.0];
        let kappa = scaled_condition(&k, 2).unwrap();
        assert!((kappa - (1.0 + a) / (1.0 - a)).abs() < 1e-6 * kappa, "{kappa}");
    }
}
