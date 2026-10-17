//! Certified error bounds for the two transformed static systems the solver
//! factors: multi-point constraints (`u_F = C q + u_p`, reduced system
//! `Cᵀ K C q = Cᵀ(…)`) and inclined supports (DOFs rotated by `T`). See
//! "Constraints" and "Inclined supports" in `docs/verification/CERTIFY.md`.
//!
//! Constraints. With `C` the free rows / free-independent columns of the
//! solver's constraint transform (its f64 entries taken as exact), `C_R` its
//! free rows / restrained-independent columns, `u_R` the prescribed values and
//! `u_p = C_R u_R`, the solver's problem is: find `q` with
//!
//! ```text
//!   Cᵀ (f_F − K_F· [C q + u_p ; u_R]) = 0,      u_F = C q + u_p.
//! ```
//!
//! `A = Cᵀ K_FF C` is formed entrywise in interval arithmetic, its symmetric
//! part certified positive definite (`λ_min ≥ μ > 0`, Gram residual +
//! Gershgorin, `sparse.rs`), so `q*` exists, is unique and
//! `‖q* − q̃‖ ≤ ‖r‖/μ` with `r` the interval-evaluated reduced residual at the
//! candidate `q̃` (read from the independent DOFs of the returned
//! displacements). Then, rigorously,
//!
//! ```text
//!   ‖u*_F − ũ_F‖ ≤ ‖C‖₂ ‖q* − q̃‖ + ‖(C q̃ + u_p) − ũ_F‖,
//! ```
//!
//! with `‖C‖₂ ≤ √(‖C‖₁‖C‖_∞)` rounded up and the last term enclosed in
//! intervals (it covers the rounding of the solver's `C q̃ + u_p`).
//!
//! Inclined supports. The solver assembles `K`, `f` in rotated coordinates
//! (`u_rot = T u_glob`, `T` block-diagonal with the f64 3×3/2×2 `R` of each
//! inclined node) and reports `ũ_glob = fl(Tᵀ ũ_rot)`. The certified exact
//! solution in global axes is `u*_glob := Tᵀ u*_rot` (exact real product with the
//! f64 `R`). Any candidate `ũ_rot` (here `fl(T ũ_glob)` with the prescribed
//! normal values put back) is certified in the rotated system, and
//!
//! ```text
//!   ‖u*_glob − ũ_glob‖ ≤ ‖T‖₂ ‖u*_rot − ũ_rot‖ + ‖Tᵀ ũ_rot − ũ_glob‖,
//! ```
//!
//! with `‖T‖₂ ≤ max(1, maxᵦ √(‖R‖₁‖R‖_∞))` (no orthogonality assumed) and the
//! last term enclosed in intervals. That bound is over all DOFs (the rotation
//! mixes restrained and free components at an inclined node).

use super::interval::Interval;
use super::linear::Certificate;
use super::sparse::certify_lambda_min_lower;
use crate::linalg::sparse::CscMatrix;

#[inline]
fn up(x: f64) -> f64 {
    x.next_up()
}

#[inline]
fn down(x: f64) -> f64 {
    x.next_down()
}

/// The solver's full stiffness `K` (n×n, free DOFs first) in one of the forms
/// it assembles. Only rows `< nf` are ever read.
pub(crate) enum KRef<'a> {
    /// Dense row-major n×n, any symmetry.
    Dense { k: &'a [f64], n: usize },
    /// Symmetric, as lower-triangle CSCs: the free-free block from `k_ff`
    /// (nf×nf, what the solver multiplies by) and the coupling to restrained
    /// DOFs from `k_full` (n×n).
    Sparse { k_ff: &'a CscMatrix, k_full: &'a CscMatrix },
}

impl KRef<'_> {
    /// Call `g(i, j, K_ij)` for every stored nonzero with row `i < nf`.
    fn for_each_free_row(&self, nf: usize, mut g: impl FnMut(usize, usize, f64)) {
        match *self {
            KRef::Dense { k, n } => {
                for i in 0..nf {
                    for (j, &v) in k[i * n..(i + 1) * n].iter().enumerate() {
                        if v != 0.0 {
                            g(i, j, v);
                        }
                    }
                }
            }
            KRef::Sparse { k_ff, k_full } => {
                for c in 0..k_ff.n {
                    for p in k_ff.col_ptr[c]..k_ff.col_ptr[c + 1] {
                        let (r, v) = (k_ff.row_idx[p], k_ff.values[p]);
                        g(r, c, v);
                        if r != c {
                            g(c, r, v);
                        }
                    }
                }
                // Free×restrained coupling: stored (r, c) with r ≥ nf > c.
                for c in 0..nf.min(k_full.n) {
                    for p in k_full.col_ptr[c]..k_full.col_ptr[c + 1] {
                        let r = k_full.row_idx[p];
                        if r >= nf {
                            g(c, r, k_full.values[p]);
                        }
                    }
                }
            }
        }
    }
}

/// The free part of the constraint transform: `u_F = C q + C_R u_R`.
pub(crate) struct ConstraintMap {
    /// Row i (< nf) of `C`: (free-independent column, coefficient).
    pub c: Vec<Vec<(usize, f64)>>,
    /// Row i (< nf) of `C_R`: (restrained DOF index − nf, coefficient).
    pub c_r: Vec<Vec<(usize, f64)>>,
    /// Number of free-independent columns.
    pub p: usize,
    /// For each free-independent column, the free DOF that is that independent DOF.
    pub indep_dof: Vec<usize>,
}

impl ConstraintMap {
    /// Build from the solver's constraint transform (`build_constraint_transform`).
    pub fn from_transform(ct: &crate::solver::constraints::ConstraintTransform, nf: usize) -> Self {
        let mut col_map = vec![usize::MAX; ct.n_independent];
        let mut indep_dof = Vec::new();
        for (j, &d) in ct.independent_dofs.iter().enumerate() {
            if d < nf {
                col_map[j] = indep_dof.len();
                indep_dof.push(d);
            }
        }
        let mut c = vec![Vec::new(); nf];
        let mut c_r = vec![Vec::new(); nf];
        for i in 0..nf {
            for p in ct.c.row_ptr[i]..ct.c.row_ptr[i + 1] {
                let (j, v) = (ct.c.col_idx[p], ct.c.vals[p]);
                if col_map[j] != usize::MAX {
                    c[i].push((col_map[j], v));
                } else {
                    c_r[i].push((ct.independent_dofs[j] - nf, v));
                }
            }
        }
        ConstraintMap { c, c_r, p: indep_dof.len(), indep_dof }
    }

    /// Upper bound on ‖C‖₂: the smaller of √(‖C‖₁ ‖C‖_∞) and
    /// √(maxₐ Σ_b |(CᵀC)_ab|) (Gershgorin on CᵀC), both rounded up.
    fn norm2_upper(&self) -> f64 {
        let mut col = vec![0.0f64; self.p];
        let mut row_max = 0.0f64;
        // Row sums of |CᵀC| ≤ Σ_i |C_ia| Σ_b |C_ib| = Σ_i |C_ia| ‖row_i C‖₁.
        let mut gram_row = vec![0.0f64; self.p];
        for row in &self.c {
            let mut s = 0.0f64;
            for &(_, v) in row {
                s = up(s + v.abs());
            }
            for &(j, v) in row {
                col[j] = up(col[j] + v.abs());
                gram_row[j] = up(gram_row[j] + up(v.abs() * s));
            }
            row_max = row_max.max(s);
        }
        let col_max = col.into_iter().fold(0.0, f64::max);
        let gram_max = gram_row.into_iter().fold(0.0, f64::max);
        up(up(row_max * col_max).sqrt()).min(up(gram_max.sqrt()))
    }
}

/// Certify the constrained solve. `u` is the full candidate displacement in
/// the solver's coordinates (restrained entries = the solver's prescribed
/// `u_R`), `f` the full load vector. The bound is on `‖u*_F − ũ_F‖₂`.
pub(crate) fn certify_constrained_system(k: &KRef, nf: usize, f: &[f64], u: &[f64], cm: &ConstraintMap) -> Certificate {
    let n = u.len();
    if f.len() != n || cm.c.len() != nf || cm.c_r.len() != nf || nf > n {
        return Certificate::uncertified("dimension mismatch in constrained system");
    }
    if !u.iter().all(|x| x.is_finite()) || !f.iter().all(|x| x.is_finite()) {
        return Certificate::uncertified("non-finite displacement or load");
    }
    let p = cm.p;
    let q: Vec<f64> = cm.indep_dof.iter().map(|&d| u[d]).collect();

    // v = C q̃ + C_R u_R ⊇ the exact real free displacement of the candidate q̃.
    let mut v = vec![Interval::ZERO; nf];
    for i in 0..nf {
        let mut acc = Interval::ZERO;
        for &(j, c) in &cm.c[i] {
            acc = acc + Interval::point(c) * Interval::point(q[j]);
        }
        for &(r, c) in &cm.c_r[i] {
            acc = acc + Interval::point(c) * Interval::point(u[nf + r]);
        }
        v[i] = acc;
    }

    // t = f_F − K_F· [v ; u_R]; r = Cᵀ t. A = Cᵀ K_FF C on ordered slots.
    let mut t: Vec<Interval> = f[..nf].iter().map(|&x| Interval::point(x)).collect();
    let mut slots: Vec<(usize, usize, Interval)> = Vec::new();
    k.for_each_free_row(nf, |i, j, kij| {
        let kv = Interval::point(kij);
        if j < nf {
            t[i] = t[i] - kv * v[j];
            for &(a, ca) in &cm.c[i] {
                let cak = Interval::point(ca) * kv;
                for &(b, cb) in &cm.c[j] {
                    slots.push((a, b, cak * Interval::point(cb)));
                }
            }
        } else if u[j] != 0.0 {
            t[i] = t[i] - kv * Interval::point(u[j]);
        }
    });
    let mut r = vec![Interval::ZERO; p];
    for i in 0..nf {
        for &(a, ca) in &cm.c[i] {
            r[a] = r[a] + Interval::point(ca) * t[i];
        }
    }
    let mut rho2 = 0.0f64;
    for (a, ra) in r.iter().enumerate() {
        if !ra.is_finite() {
            return Certificate::uncertified(format!("non-finite reduced residual at {a}"));
        }
        let m = ra.mag();
        rho2 = up(rho2 + up(m * m));
    }
    let rho = up(rho2.sqrt());

    let (mu, bound_q) = if p == 0 {
        (0.0, 0.0)
    } else {
        let (a, vals) = symmetric_part_lower(p, slots);
        let mu = match certify_lambda_min_lower(&a, &vals) {
            Ok(mu) => mu,
            Err(reason) => return Certificate::uncertified(format!("reduced CᵀKC: {reason}")),
        };
        (mu, up(rho / mu))
    };

    // ‖C(q* − q̃)‖ ≤ ‖C‖₂ ‖q* − q̃‖; plus the enclosed ‖(C q̃ + u_p) − ũ_F‖.
    let mut d2 = 0.0f64;
    for i in 0..nf {
        let d = v[i] - Interval::point(u[i]);
        if !d.is_finite() {
            return Certificate::uncertified("non-finite expansion C q̃ + u_p");
        }
        let m = d.mag();
        d2 = up(d2 + up(m * m));
    }
    let abs_bound = up(up(cm.norm2_upper() * bound_q) + up(d2.sqrt()));
    finish(abs_bound, &u[..nf], mu, rho)
}

/// Interval enclosure of the reduced symmetric matrix `Cᵀ M C` for a
/// symmetric `M` (nf×nf, lower-triangle CSC): lower-triangle pattern with
/// midpoint values, and entry enclosures aligned with them.
pub(crate) fn reduce_symmetric_enclosed(m: &CscMatrix, cm: &ConstraintMap) -> (CscMatrix, Vec<Interval>) {
    let mut slots: Vec<(usize, usize, Interval)> = Vec::new();
    let mut add = |i: usize, j: usize, v: f64| {
        let mv = Interval::point(v);
        for &(a, ca) in &cm.c[i] {
            let cam = Interval::point(ca) * mv;
            for &(b, cb) in &cm.c[j] {
                slots.push((a, b, cam * Interval::point(cb)));
            }
        }
    };
    for c in 0..m.n {
        for p in m.col_ptr[c]..m.col_ptr[c + 1] {
            let (r, v) = (m.row_idx[p], m.values[p]);
            add(r, c, v);
            if r != c {
                add(c, r, v);
            }
        }
    }
    symmetric_part_lower(cm.p, slots)
}

/// Lower-triangle CSC of the symmetric part of the matrix whose ordered-slot
/// contributions are `slots`, with interval enclosures of its entries
/// (aligned with `values`, which are midpoints). Every diagonal is present.
fn symmetric_part_lower(p: usize, mut slots: Vec<(usize, usize, Interval)>) -> (CscMatrix, Vec<Interval>) {
    // Sum per ordered slot.
    slots.sort_unstable_by_key(|&(a, b, _)| (a, b));
    let mut merged: Vec<(usize, usize, Interval)> = Vec::with_capacity(slots.len());
    for (a, b, x) in slots {
        match merged.last_mut() {
            Some(last) if last.0 == a && last.1 == b => last.2 = last.2 + x,
            _ => merged.push((a, b, x)),
        }
    }
    // S_ab = (A_ab + A_ba)/2 on the lower triangle, keyed (col, row).
    let mut lower: Vec<(usize, usize, Interval)> = Vec::with_capacity(merged.len());
    for &(a, b, x) in &merged {
        let half = x.div_scalar(2.0);
        if a == b {
            lower.push((b, a, x));
        } else if a > b {
            lower.push((b, a, half));
        } else {
            lower.push((a, b, half));
        }
    }
    for j in 0..p {
        lower.push((j, j, Interval::ZERO)); // guarantee a diagonal slot
    }
    lower.sort_unstable_by_key(|&(c, r, _)| (c, r));
    let mut col_ptr = vec![0usize; p + 1];
    let mut row_idx = Vec::new();
    let mut vals: Vec<Interval> = Vec::new();
    let mut last_key = None;
    for (c, r, x) in lower {
        if last_key == Some((c, r)) {
            let last = vals.last_mut().expect("a previous entry");
            *last = *last + x;
            continue;
        }
        last_key = Some((c, r));
        row_idx.push(r);
        vals.push(x);
        col_ptr[c + 1] += 1;
    }
    for c in 0..p {
        col_ptr[c + 1] += col_ptr[c];
    }
    let values = vals.iter().map(|x| 0.5 * x.lo + 0.5 * x.hi).collect();
    (CscMatrix { n: p, col_ptr, row_idx, values }, vals)
}

fn finish(abs_bound: f64, u: &[f64], sigma: f64, rho: f64) -> Certificate {
    if !abs_bound.is_finite() {
        return Certificate::uncertified("non-finite bound");
    }
    let mut un2 = 0.0f64;
    for &x in u {
        un2 = down(un2 + down(x * x)).max(0.0);
    }
    let unorm = down(un2.sqrt()).max(0.0);
    let rel_bound = if abs_bound == 0.0 {
        0.0
    } else if unorm > 0.0 {
        up(abs_bound / unorm)
    } else {
        f64::INFINITY
    };
    Certificate::Certified { abs_bound, rel_bound, sigma, residual_norm: rho }
}

/// One inclined support's rotation: `u_rot[dofs] = R u_glob[dofs]`.
pub(crate) struct Rotation {
    pub dofs: Vec<usize>,
    /// Row-major `R`, `dofs.len()` square.
    pub r: Vec<f64>,
}

impl Rotation {
    fn dim(&self) -> usize {
        self.dofs.len()
    }

    /// Upper bound on ‖R‖₂ valid for any real R (no orthogonality assumed):
    /// ‖R‖₂² = λ_max(RᵀR) ≤ 1 + ‖RᵀR − I‖_F, with RᵀR − I enclosed in intervals.
    /// For a rotation with rounded entries this is 1 + O(ε).
    fn norm2_upper(&self) -> f64 {
        let m = self.dim();
        let mut e2 = 0.0f64;
        for a in 0..m {
            for b in 0..m {
                let mut g = Interval::point(if a == b { -1.0 } else { 0.0 });
                for k in 0..m {
                    g = g + Interval::point(self.r[k * m + a]) * Interval::point(self.r[k * m + b]);
                }
                if !g.is_finite() {
                    return f64::INFINITY;
                }
                let x = g.mag();
                e2 = up(e2 + up(x * x));
            }
        }
        up(up(1.0 + up(e2.sqrt())).sqrt())
    }
}

/// Candidate in rotated coordinates: `fl(T ũ_glob)`, then the solver's
/// prescribed values on restrained DOFs (`prescribed`: (DOF index, value)).
pub(crate) fn to_rotated(u_glob: &[f64], rots: &[Rotation], prescribed: &[(usize, f64)]) -> Vec<f64> {
    let mut u = u_glob.to_vec();
    for rot in rots {
        let m = rot.dim();
        for a in 0..m {
            let mut s = 0.0;
            for b in 0..m {
                s += rot.r[a * m + b] * u_glob[rot.dofs[b]];
            }
            u[rot.dofs[a]] = s;
        }
    }
    for &(d, x) in prescribed {
        u[d] = x;
    }
    u
}

/// Map a certificate on `‖u*_rot,F − ũ_rot,F‖` (restrained rotated DOFs exact)
/// to `‖u*_glob − ũ_glob‖` over all DOFs. Identity when there are no rotations.
pub(crate) fn rotate_back(cert: Certificate, rots: &[Rotation], u_rot: &[f64], u_glob: &[f64]) -> Certificate {
    if rots.is_empty() {
        return cert;
    }
    let Certificate::Certified { abs_bound, sigma, residual_norm, .. } = cert else {
        return cert;
    };
    let t_norm = rots.iter().map(Rotation::norm2_upper).fold(1.0, f64::max);
    let mut d2 = 0.0f64;
    for rot in rots {
        let m = rot.dim();
        for a in 0..m {
            // (Rᵀ ũ_rot)_a − ũ_glob_a
            let mut acc = Interval::point(-u_glob[rot.dofs[a]]);
            for b in 0..m {
                acc = acc + Interval::point(rot.r[b * m + a]) * Interval::point(u_rot[rot.dofs[b]]);
            }
            if !acc.is_finite() {
                return Certificate::uncertified("non-finite rotation back to global axes");
            }
            let x = acc.mag();
            d2 = up(d2 + up(x * x));
        }
    }
    let abs = up(up(t_norm * abs_bound) + up(d2.sqrt()));
    finish(abs, u_glob, sigma, residual_norm)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 3 free DOFs, spring chain, with DOF 2 tied to DOF 0 by u2 = 2·u0 (p = 2).
    fn chain() -> (Vec<f64>, ConstraintMap) {
        // K = [[3,-1,0],[-1,3,-1],[0,-1,2]] (n = nf = 3)
        let k = vec![3.0, -1.0, 0.0, -1.0, 3.0, -1.0, 0.0, -1.0, 2.0];
        let cm = ConstraintMap {
            c: vec![vec![(0, 1.0)], vec![(1, 1.0)], vec![(0, 2.0)]],
            c_r: vec![vec![], vec![], vec![]],
            p: 2,
            indep_dof: vec![0, 1],
        };
        (k, cm)
    }

    /// Exact solution of the reduced 2×2 system, for f = [1, 0, 1]:
    /// A = CᵀKC = [[3 + 0·… ]] computed by hand below.
    fn exact(f: [f64; 3]) -> [f64; 3] {
        // C = [[1,0],[0,1],[2,0]]; A = CᵀKC
        // K C = [[3, -1], [-1-2, 3], [4, -1]] = [[3,-1],[-3,3],[4,-1]]
        // A = Cᵀ(KC) = [[3 + 8, -1 - 2], [-3, 3]] = [[11, -3], [-3, 3]]
        // b = Cᵀ f = [f0 + 2 f2, f1]
        let b = [f[0] + 2.0 * f[2], f[1]];
        let det = 11.0 * 3.0 - 9.0;
        let q0 = (3.0 * b[0] + 3.0 * b[1]) / det;
        let q1 = (3.0 * b[0] + 11.0 * b[1]) / det;
        [q0, q1, 2.0 * q0]
    }

    #[test]
    fn constrained_bound_covers_perturbation() {
        let (k, cm) = chain();
        let f = [1.0, 0.0, 1.0];
        let us = exact(f);
        let ut = [us[0] + 1e-7, us[1] - 3e-7, us[2] + 2e-7];
        let c = certify_constrained_system(&KRef::Dense { k: &k, n: 3 }, 3, &f, &ut, &cm);
        let b = c.abs_bound().expect("certified");
        let err = (0..3).map(|i| (ut[i] - us[i]).powi(2)).sum::<f64>().sqrt();
        assert!(err <= b && b < 1e-5, "err {err:e} bound {b:e}");
    }

    #[test]
    fn constraint_violation_in_candidate_is_counted() {
        // ũ violates u2 = 2 u0 by 1e-3: the error must still be covered.
        let (k, cm) = chain();
        let f = [1.0, 0.0, 1.0];
        let us = exact(f);
        let ut = [us[0], us[1], us[2] + 1e-3];
        let b = certify_constrained_system(&KRef::Dense { k: &k, n: 3 }, 3, &f, &ut, &cm).abs_bound().unwrap();
        assert!(b >= 1e-3, "bound {b:e}");
    }

    #[test]
    fn singular_reduced_system_refused() {
        // K PD on 3 DOFs but C maps both columns onto the same direction pattern
        // with a K that vanishes on it: K = diag(0, 1, 0) with C = [[1],[0],[1]].
        let k = vec![0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0];
        let cm = ConstraintMap { c: vec![vec![(0, 1.0)], vec![], vec![(0, 1.0)]], c_r: vec![vec![]; 3], p: 1, indep_dof: vec![0] };
        let c = certify_constrained_system(&KRef::Dense { k: &k, n: 3 }, 3, &[1.0, 0.0, 0.0], &[1.0, 0.0, 1.0], &cm);
        assert!(!c.is_certified(), "{c:?}");
    }

    #[test]
    fn sparse_and_dense_agree() {
        let (k, cm) = chain();
        let csc = CscMatrix::from_dense_symmetric(&k, 3);
        let f = [1.0, 0.5, -1.0];
        let us = exact(f);
        let a = certify_constrained_system(&KRef::Dense { k: &k, n: 3 }, 3, &f, &us, &cm);
        let b = certify_constrained_system(&KRef::Sparse { k_ff: &csc, k_full: &csc }, 3, &f, &us, &cm);
        let (a, b) = (a.abs_bound().unwrap(), b.abs_bound().unwrap());
        assert!(a < 1e-14 && b < 1e-14, "{a:e} {b:e}");
    }

    #[test]
    fn c_norm_bound_dominates_spectral_norm() {
        // Diaphragm-like C: 12 slave rows u = q0 − y·q1, plus the two masters.
        let mut c = vec![vec![(0, 1.0)], vec![(1, 1.0)]];
        for k in 0..12 {
            c.push(vec![(0, 1.0), (1, -0.37 * k as f64)]);
        }
        let nf = c.len();
        let cm = ConstraintMap { c, c_r: vec![vec![]; nf], p: 2, indep_dof: vec![0, 1] };
        // ‖C‖₂² = λ_max(CᵀC) by power iteration (converges from below).
        let mut g = [[0.0f64; 2]; 2];
        for row in &cm.c {
            for &(a, x) in row {
                for &(b, y) in row {
                    g[a][b] += x * y;
                }
            }
        }
        let mut v = [1.0f64, 1.0];
        let mut lam = 0.0;
        for _ in 0..200 {
            let w = [g[0][0] * v[0] + g[0][1] * v[1], g[1][0] * v[0] + g[1][1] * v[1]];
            let nw = (w[0] * w[0] + w[1] * w[1]).sqrt();
            lam = (v[0] * w[0] + v[1] * w[1]) / (v[0] * v[0] + v[1] * v[1]);
            v = [w[0] / nw, w[1] / nw];
        }
        let b = cm.norm2_upper();
        assert!(b * b >= lam && b * b < 1.5 * lam, "bound {b} vs ‖C‖₂ = {}", lam.sqrt());
    }

    #[test]
    fn rotation_back_covers_roundoff() {
        let th = 0.7f64;
        let rot = Rotation { dofs: vec![0, 1], r: vec![-th.cos(), th.sin(), th.sin(), th.cos()] };
        assert!(rot.norm2_upper() >= 1.0 && rot.norm2_upper() < 1.0 + 1e-14, "{}", rot.norm2_upper());
        // Not orthogonal: the bound must still dominate ‖R‖₂ (= 2 for diag(2, 1)).
        let big = Rotation { dofs: vec![0, 1], r: vec![2.0, 0.0, 0.0, 1.0] };
        assert!(big.norm2_upper() >= 2.0, "{}", big.norm2_upper());
        let ug = vec![0.3, -0.2];
        let ur = to_rotated(&ug, std::slice::from_ref(&rot), &[]);
        let cert = Certificate::Certified { abs_bound: 0.0, rel_bound: 0.0, sigma: 1.0, residual_norm: 0.0 };
        let b = rotate_back(cert, std::slice::from_ref(&rot), &ur, &ug).abs_bound().unwrap();
        assert!(b < 1e-15, "{b:e}");
        // A wrong global vector is not hidden: the mismatch enters the bound.
        let cert = Certificate::Certified { abs_bound: 0.0, rel_bound: 0.0, sigma: 1.0, residual_norm: 0.0 };
        let b = rotate_back(cert, std::slice::from_ref(&rot), &ur, &[0.3, -0.1]).abs_bound().unwrap();
        assert!(b >= 0.1 * (1.0 - 1e-12), "{b:e}");
    }
}
