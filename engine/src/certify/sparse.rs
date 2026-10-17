//! Certified error bound for a sparse symmetric system `K u = f`, at the cost of
//! about two sparse factorizations — no dense O(n³) interval Cholesky, no size cap.
//! See "Scalable certificate (Gram residual + Gershgorin)" in
//! `docs/verification/CERTIFY.md`; Lean: `Certify.certified_error_bound_gram`.
//!
//! `K` is the symmetric matrix whose lower triangle is stored in a `CscMatrix`
//! (as the solver's sparse path assembles it), so `S = (K + Kᵀ)/2 = K` exactly.
//!
//! 1. `L ≈ chol(P K Pᵀ − t I)` by the ordinary f64 sparse Cholesky (AMD).
//!    Nothing about `L` is trusted: `L Lᵀ ⪰ 0` for every real `L`.
//! 2. `R = P K Pᵀ − L Lᵀ` is enclosed entrywise in interval arithmetic. Its
//!    pattern lies inside the filled pattern of `L`, so this costs about one
//!    factorization.
//! 3. Gershgorin: `μ = minᵢ (lo Rᵢᵢ − Σ_{j≠i} mag Rᵢⱼ)` rounded down. Then
//!    `xᵀKx ≥ xᵀRx ≥ μ‖x‖²` for all x (P is orthogonal), so if `μ > 0` it is a
//!    certified lower bound on `λ_min(K)` and plays the role of σ.
//! 4. `r = f − K ũ` in interval arithmetic, `bound = ‖r‖₂ / μ` rounded up.
//!
//! The shift `t ≈ 0.9·λ̂` (λ̂ from inverse iteration) only decides how good μ is;
//! soundness never depends on it, on the ordering, or on how `L` was rounded.

use std::rc::Rc;

use super::interval::Interval;
use super::linear::Certificate;
use crate::linalg::sparse::CscMatrix;
use crate::linalg::sparse_chol::{numeric_cholesky, sparse_cholesky_solve, symbolic_cholesky, NumericCholesky};

#[inline]
fn up(x: f64) -> f64 {
    x.next_up()
}

#[inline]
fn down(x: f64) -> f64 {
    x.next_down()
}

/// Enclosure of the exact product `a·b` of two f64 values.
#[inline]
pub(crate) fn prod(a: f64, b: f64) -> Interval {
    let p = a * b;
    if p == 0.0 && (a == 0.0 || b == 0.0) {
        Interval::ZERO
    } else {
        Interval::new(down(p), up(p))
    }
}

/// Certify `ũ = u` for `K u = f`, `K` symmetric given by its lower triangle,
/// `f` known as an interval vector.
pub fn certify_sparse_spd_system(k: &CscMatrix, f: &[Interval], u: &[f64]) -> Certificate {
    if let Err(reason) = check_system(k, f, u) {
        return Certificate::uncertified(reason);
    }
    if k.n == 0 {
        return Certificate::Certified { abs_bound: 0.0, rel_bound: 0.0, sigma: 0.0, residual_norm: 0.0 };
    }
    let vals: Vec<Interval> = k.values.iter().map(|&x| Interval::point(x)).collect();
    match certify_lambda_min_lower(k, &vals) {
        Ok(mu) => finish(k, f, u, mu),
        Err(reason) => Certificate::uncertified(reason),
    }
}

/// Residual certificate for `K ũ = f` given μ > 0 that the caller has ALREADY
/// certified as a lower bound on λ_min(K) (e.g. by `certify_lambda_min_lower`
/// on this same `k`). Used to certify several right-hand sides against one K.
pub(crate) fn certify_with_certified_mu(k: &CscMatrix, f: &[Interval], u: &[f64], mu: f64) -> Certificate {
    if let Err(reason) = check_system(k, f, u) {
        return Certificate::uncertified(reason);
    }
    if k.n == 0 {
        return Certificate::Certified { abs_bound: 0.0, rel_bound: 0.0, sigma: 0.0, residual_norm: 0.0 };
    }
    finish(k, f, u, mu)
}

/// Dimensions agree and every entry of K, f and ũ is finite.
fn check_system(k: &CscMatrix, f: &[Interval], u: &[f64]) -> Result<(), String> {
    let n = k.n;
    if f.len() != n || u.len() != n || k.col_ptr.len() != n + 1 {
        return Err(format!("dimension mismatch: n={n}, f.len()={}, u.len()={}", f.len(), u.len()));
    }
    if !k.values.iter().all(|x| x.is_finite()) {
        return Err("non-finite entry in K".into());
    }
    if !f.iter().all(|x| x.is_finite()) {
        return Err("non-finite entry in f".into());
    }
    if !u.iter().all(|x| x.is_finite()) {
        return Err("non-finite entry in ũ".into());
    }
    Ok(())
}

/// The bound ρ/μ needs μ > 0 and finite: a negative μ would give a negative
/// "bound".
fn check_mu(mu: f64) -> Result<(), String> {
    if mu > 0.0 && mu.is_finite() {
        Ok(())
    } else {
        Err(format!("μ must be positive and finite, got {mu}"))
    }
}

/// Certified μ > 0 with λ_min(A) ≥ μ for the exact symmetric matrix `A` whose
/// lower-triangle entries are enclosed by `vals` (aligned with `a.values`).
/// `a.values` holds f64 approximations of those entries; it is only used to
/// compute the factor and never trusted. Err with a reason when no positive μ
/// could be certified.
pub fn certify_lambda_min_lower(a: &CscMatrix, vals: &[Interval]) -> Result<f64, String> {
    certify_lambda_min_lower_with_factor(a, vals).map(|(mu, _)| mu)
}

/// `certify_lambda_min_lower`, also returning the factor `L` whose Gram residual
/// certified μ (for certificate bundles, `certify::bundle`).
pub fn certify_lambda_min_lower_with_factor(
    a: &CscMatrix,
    vals: &[Interval],
) -> Result<(f64, NumericCholesky), String> {
    if vals.len() != a.values.len() || !vals.iter().all(|v| v.is_finite()) {
        return Err("non-finite or misaligned matrix enclosure".into());
    }
    let Some(diag_pos) = diagonal_positions(a) else {
        return Err("matrix has a structurally zero diagonal entry: mechanism".into());
    };
    let sym = Rc::new(symbolic_cholesky(a));
    let Some(factor) = numeric_cholesky(&sym, a) else {
        return Err(
            "matrix is not positive definite (sparse Cholesky failed): mechanism or unstable structure".into(),
        );
    };
    let lambda = estimate_lambda_min(a, &factor)?;
    let mut last = String::new();
    for frac in [0.9, 0.5, 0.1, 0.01] {
        let t = frac * lambda;
        let mut shifted = a.clone();
        for (j, &p) in diag_pos.iter().enumerate() {
            shifted.values[p] = a.values[p] - t;
            debug_assert_eq!(shifted.row_idx[p], j);
        }
        let Some(l) = numeric_cholesky(&sym, &shifted) else {
            last = format!("Cholesky of A − {t:.3e}·I failed");
            continue;
        };
        match gram_gershgorin(vals, &l)? {
            mu if mu > 0.0 => return Ok((mu, l)),
            mu => last = format!("Gershgorin bound μ = {mu:.3e} not positive at shift {t:.3e}"),
        }
    }
    Err(format!("could not certify positive definiteness (λ̂ = {lambda:.3e}): {last}"))
}

/// Position of the diagonal entry in each column, or None if one is missing.
fn diagonal_positions(k: &CscMatrix) -> Option<Vec<usize>> {
    (0..k.n)
        .map(|j| (k.col_ptr[j]..k.col_ptr[j + 1]).find(|&p| k.row_idx[p] == j))
        .collect()
}

/// Rigorous lower bound μ on λ_min(A) from any factor `L` (in the symbolic's
/// permuted ordering): Gershgorin on an interval enclosure of `P A Pᵀ − L Lᵀ`.
/// `vals` encloses A's lower-triangle entries, aligned with the values of the
/// matrix the symbolic factorization was built from.
pub fn gram_gershgorin(vals: &[Interval], l: &NumericCholesky) -> Result<f64, String> {
    let sym = &l.symbolic;
    let n = sym.n;
    let (lp, li, lv) = (&sym.l_col_ptr, &sym.l_row_idx, &l.l_values);

    // Row structure of L: for row b, the (column k, position of (b, k)) pairs.
    let mut row_ptr = vec![0usize; n + 1];
    for &r in li.iter() {
        row_ptr[r + 1] += 1;
    }
    for b in 0..n {
        row_ptr[b + 1] += row_ptr[b];
    }
    let mut next = row_ptr.clone();
    let mut row_entries = vec![(0usize, 0usize); li.len()];
    for c in 0..n {
        for p in lp[c]..lp[c + 1] {
            let r = li[p];
            row_entries[next[r]] = (c, p);
            next[r] += 1;
        }
    }

    // Column b of the lower triangle of R, accumulated in a dense workspace.
    let mut w = vec![Interval::ZERO; n];
    let mut touched = vec![false; n];
    let mut list: Vec<usize> = Vec::new();
    let mut diag_lo = vec![0.0f64; n];
    let mut off_sum = vec![0.0f64; n];
    fn touch(a: usize, touched: &mut [bool], list: &mut Vec<usize>) {
        if !touched[a] {
            touched[a] = true;
            list.push(a);
        }
    }
    for b in 0..n {
        // + (P A Pᵀ)_{ab}, a ≥ b: the symbolic's permuted lower structure.
        for p in sym.pa_col_ptr[b]..sym.pa_col_ptr[b + 1] {
            let a = sym.pa_row_idx[p];
            touch(a, &mut touched, &mut list);
            w[a] = w[a] + vals[sym.pa_src[p]];
        }
        // − Σ_c L_{ac} L_{bc} over columns c with L_{bc} ≠ 0, rows a ≥ b.
        for &(c, pb) in &row_entries[row_ptr[b]..row_ptr[b + 1]] {
            let lbc = lv[pb];
            for p in lp[c]..lp[c + 1] {
                let a = li[p];
                if a < b {
                    continue; // rows in a column need not be sorted
                }
                touch(a, &mut touched, &mut list);
                w[a] = w[a] - prod(lv[p], lbc);
            }
        }
        for &a in &list {
            let r = w[a];
            if !r.is_finite() {
                return Err(format!("non-finite Gram residual at ({a}, {b})"));
            }
            if a == b {
                diag_lo[b] = r.lo;
            } else {
                let m = r.mag();
                off_sum[a] = up(off_sum[a] + m);
                off_sum[b] = up(off_sum[b] + m);
            }
            w[a] = Interval::ZERO;
            touched[a] = false;
        }
        list.clear();
    }
    let mut mu = f64::INFINITY;
    for i in 0..n {
        mu = mu.min(down(diag_lo[i] - off_sum[i]));
    }
    Ok(mu)
}

/// Heuristic λ̂ ≈ λ_min(K) by inverse iteration on the f64 factor of K.
fn estimate_lambda_min(k: &CscMatrix, factor: &NumericCholesky) -> Result<f64, String> {
    let n = k.n;
    let mut x: Vec<f64> = (0..n).map(|i| 1.0 + ((i * 7919) % 101) as f64 / 101.0).collect();
    normalize(&mut x);
    let mut mu = 0.0;
    for _ in 0..30 {
        let y = sparse_cholesky_solve(factor, &x);
        mu = dot(&x, &y);
        x = y;
        if !normalize(&mut x) {
            return Err("inverse iteration produced a non-finite vector".into());
        }
    }
    let rq = dot(&x, &k.sym_mat_vec(&x));
    let inv = if mu > 0.0 { 1.0 / mu } else { f64::INFINITY };
    let lambda = if rq > 0.0 { rq.min(inv) } else { inv };
    if lambda > 0.0 && lambda.is_finite() {
        Ok(lambda)
    } else {
        Err(format!("λ_min estimate not positive (λ̂ = {lambda:e})"))
    }
}

/// Residual, bound and relative bound once λ_min(K) ≥ σ > 0 is certified.
pub(crate) fn finish(k: &CscMatrix, f: &[Interval], u: &[f64], sigma: f64) -> Certificate {
    if let Err(reason) = check_mu(sigma) {
        return Certificate::uncertified(reason);
    }
    let n = k.n;
    let mut r: Vec<Interval> = f.to_vec();
    for j in 0..n {
        for p in k.col_ptr[j]..k.col_ptr[j + 1] {
            let i = k.row_idx[p];
            let v = k.values[p];
            r[i] = r[i] - prod(v, u[j]);
            if i != j {
                r[j] = r[j] - prod(v, u[i]);
            }
        }
    }
    let mut rho2 = 0.0f64;
    for (i, ri) in r.iter().enumerate() {
        if !ri.is_finite() {
            return Certificate::uncertified(format!("non-finite residual at row {i}"));
        }
        let m = ri.mag();
        rho2 = up(rho2 + up(m * m));
    }
    let rho = up(rho2.sqrt());
    let abs_bound = up(rho / sigma);
    if !abs_bound.is_finite() {
        return Certificate::uncertified("non-finite residual norm or bound");
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

fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

fn normalize(x: &mut [f64]) -> bool {
    let nrm = dot(x, x).sqrt();
    if !(nrm > 0.0 && nrm.is_finite()) {
        return false;
    }
    for v in x.iter_mut() {
        *v /= nrm;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn csc_lower(dense: &[f64], n: usize) -> CscMatrix {
        let (mut r, mut c, mut v) = (vec![], vec![], vec![]);
        for j in 0..n {
            for i in j..n {
                let x = dense[i * n + j];
                if x != 0.0 || i == j {
                    r.push(i);
                    c.push(j);
                    v.push(x);
                }
            }
        }
        CscMatrix::from_triplets(n, &r, &c, &v)
    }

    fn pts(x: &[f64]) -> Vec<Interval> {
        x.iter().map(|&v| Interval::point(v)).collect()
    }

    #[test]
    fn perturbed_solution_bound_holds() {
        // K = [[4,1],[1,3]], f = [1,2] → u* = [1/11, 7/11]
        let k = csc_lower(&[4.0, 1.0, 1.0, 3.0], 2);
        let ustar = [1.0 / 11.0, 7.0 / 11.0];
        let ut = [ustar[0] + 1e-6, ustar[1] - 2e-6];
        let c = certify_sparse_spd_system(&k, &pts(&[1.0, 2.0]), &ut);
        let b = c.abs_bound().expect("certified");
        let err = ((ut[0] - ustar[0]).powi(2) + (ut[1] - ustar[1]).powi(2)).sqrt();
        assert!(err <= b && b < 1e-4, "err {err} bound {b}");
    }

    #[test]
    fn sigma_is_a_lower_bound_on_lambda_min() {
        // tridiagonal [-1, 2, -1]: λ_min = 2 − 2cos(π/(n+1))
        let n = 200;
        let mut d = vec![0.0; n * n];
        for i in 0..n {
            d[i * n + i] = 2.0;
            if i + 1 < n {
                d[i * n + i + 1] = -1.0;
                d[(i + 1) * n + i] = -1.0;
            }
        }
        let k = csc_lower(&d, n);
        let u = vec![1.0; n];
        let f = k.sym_mat_vec(&u);
        let c = certify_sparse_spd_system(&k, &pts(&f), &u);
        let Certificate::Certified { sigma, .. } = c else { panic!("{c:?}") };
        let lmin = 2.0 - 2.0 * (std::f64::consts::PI / (n as f64 + 1.0)).cos();
        assert!(sigma <= lmin && sigma > 0.5 * lmin, "σ {sigma} λ_min {lmin}");
    }

    #[test]
    fn singular_and_indefinite_rejected() {
        let k = csc_lower(&[1.0, -1.0, -1.0, 1.0], 2);
        assert!(!certify_sparse_spd_system(&k, &pts(&[0.0, 0.0]), &[0.0, 0.0]).is_certified());
        let k = csc_lower(&[1.0, 0.0, 0.0, -1.0], 2);
        assert!(!certify_sparse_spd_system(&k, &pts(&[1.0, 1.0]), &[1.0, -1.0]).is_certified());
    }

    #[test]
    fn bound_honest_with_small_sigma() {
        // K = 0.01·I (σ ≈ 0.01 < 1): bound = ρ/σ ≫ ρ. Check abs and rel bounds
        // against the exact error of a perturbed solution.
        let k = csc_lower(&[0.01, 0.0, 0.0, 0.01], 2);
        let ustar = [3.0, -4.0]; // f = K u* exactly representable
        let f = [0.03, -0.04];
        let ut = [3.0 + 1e-3, -4.0 - 2e-3];
        let c = certify_sparse_spd_system(&k, &pts(&f), &ut);
        let Certificate::Certified { abs_bound, rel_bound, .. } = c else { panic!("{c:?}") };
        let err = ((ut[0] - ustar[0]).powi(2) + (ut[1] - ustar[1]).powi(2)).sqrt();
        let unorm = (ut[0] * ut[0] + ut[1] * ut[1]).sqrt();
        assert!(err <= abs_bound && abs_bound < 10.0 * err, "err {err} bound {abs_bound}");
        assert!(err / unorm <= rel_bound && rel_bound < 10.0 * err / unorm, "rel {rel_bound}");
    }

    #[test]
    fn gershgorin_counts_off_diagonal_residuals() {
        // K = [[1, .9], [.9, 1]] (λ_min = 0.1) with the wrong factor L = I:
        // R = K − I = [[0, .9], [.9, 0]], Gershgorin gives exactly −0.9. Any
        // mishandling of the off-diagonal row sums would report ≥ 0.
        let k = csc_lower(&[1.0, 0.9, 0.9, 1.0], 2);
        let sym = Rc::new(symbolic_cholesky(&k));
        let mut lv = vec![0.0; sym.l_nnz];
        for c in 0..2 {
            for p in sym.l_col_ptr[c]..sym.l_col_ptr[c + 1] {
                if sym.l_row_idx[p] == c {
                    lv[p] = 1.0;
                }
            }
        }
        let l = NumericCholesky { symbolic: sym, l_values: lv };
        let vals: Vec<Interval> = k.values.iter().map(|&x| Interval::point(x)).collect();
        let mu = gram_gershgorin(&vals, &l).unwrap();
        assert!(mu <= -0.89 && mu >= -0.91, "μ = {mu}");
    }

    #[test]
    fn gershgorin_row_sums_reach_both_rows() {
        // Wrong factor L = I again, but with one large diagonal so only one row
        // is binding: each off-diagonal residual must enter BOTH row sums.
        for (d0, d1) in [(1.0, 6.0), (6.0, 1.0)] {
            let k = csc_lower(&[d0, 0.9, 0.9, d1], 2);
            let sym = Rc::new(symbolic_cholesky(&k));
            let mut lv = vec![0.0; sym.l_nnz];
            for c in 0..2 {
                for p in sym.l_col_ptr[c]..sym.l_col_ptr[c + 1] {
                    if sym.l_row_idx[p] == c {
                        lv[p] = 1.0;
                    }
                }
            }
            let l = NumericCholesky { symbolic: sym, l_values: lv };
            let vals: Vec<Interval> = k.values.iter().map(|&x| Interval::point(x)).collect();
            let mu = gram_gershgorin(&vals, &l).unwrap();
            // R = K − I: binding row has diagonal 0 and off-diagonal 0.9.
            assert!(mu <= -0.89 && mu >= -0.91, "diag ({d0}, {d1}): μ = {mu}");
        }
    }

    #[test]
    fn lambda_min_lower_uses_the_enclosure_not_the_approximation() {
        // The f64 approximation is positive definite, but the matrix the
        // enclosures describe is indefinite: must refuse.
        let a = csc_lower(&[2.0, 0.1, 0.1, 2.0], 2);
        let vals: Vec<Interval> = [1.0, 0.1, -1.0].iter().map(|&x| Interval::point(x)).collect();
        assert_eq!(a.values.len(), 3);
        assert!(certify_lambda_min_lower(&a, &vals).is_err());
        // Misaligned or non-finite enclosures are refused too.
        assert!(certify_lambda_min_lower(&a, &vals[..2]).is_err());
        let bad = vec![Interval::point(2.0), Interval::new(f64::NAN, 0.0), Interval::point(2.0)];
        assert!(certify_lambda_min_lower(&a, &bad).is_err());
    }

    #[test]
    fn prod_encloses_underflowing_products() {
        // 1e-200 · 1e-200 underflows to 0 in f64 but the exact product is > 0.
        let p = prod(1e-200, 1e-200);
        assert!(p.lo <= 0.0 && p.hi > 0.0, "{p:?}");
        let p = prod(-1e-200, 1e-200);
        assert!(p.lo < 0.0 && p.hi >= 0.0, "{p:?}");
        assert_eq!(prod(0.0, 5.0), Interval::ZERO);
        assert_eq!(prod(5.0, 0.0), Interval::ZERO);
        let p = prod(3.0, 7.0);
        assert!(p.lo <= 21.0 && 21.0 <= p.hi && p.hi - p.lo < 1e-13);
    }

    #[test]
    fn dimension_and_finiteness_checks() {
        let k = csc_lower(&[4.0, 1.0, 1.0, 3.0], 2);
        assert!(!certify_sparse_spd_system(&k, &pts(&[1.0]), &[0.0, 0.0]).is_certified());
        assert!(!certify_sparse_spd_system(&k, &pts(&[1.0, 2.0]), &[0.0]).is_certified());
        assert!(!certify_sparse_spd_system(&k, &pts(&[1.0, f64::NAN]), &[0.0, 0.0]).is_certified());
        assert!(!certify_sparse_spd_system(&k, &pts(&[1.0, 2.0]), &[0.0, f64::INFINITY]).is_certified());
        let mut kn = k.clone();
        kn.values[0] = f64::NAN;
        assert!(!certify_sparse_spd_system(&kn, &pts(&[1.0, 2.0]), &[0.0, 0.0]).is_certified());
    }

    #[test]
    fn gershgorin_rejects_a_wrong_factor() {
        // A factor of a *different* matrix must not certify K: L Lᵀ = 4I but K = I.
        let k = csc_lower(&[1.0, 0.0, 0.0, 1.0], 2);
        let sym = Rc::new(symbolic_cholesky(&k));
        let l = NumericCholesky { symbolic: sym.clone(), l_values: vec![2.0; sym.l_nnz] };
        let vals: Vec<Interval> = k.values.iter().map(|&x| Interval::point(x)).collect();
        let mu = gram_gershgorin(&vals, &l).unwrap();
        assert!(mu < 0.0, "μ = {mu}");
    }

    #[test]
    fn finish_rejects_nonpositive_or_infinite_mu() {
        // Every caller passes a certified μ > 0; finish() still refuses any
        // other, since ρ/μ with μ < 0 would be a negative "bound".
        let k = CscMatrix { n: 1, col_ptr: vec![0, 1], row_idx: vec![0], values: vec![2.0] };
        let f = [Interval::point(2.0)];
        assert!(finish(&k, &f, &[1.0 + 1e-9], 1.0).is_certified());
        for mu in [-1.0, 0.0, f64::INFINITY, f64::NAN] {
            assert!(!finish(&k, &f, &[1.0 + 1e-9], mu).is_certified(), "μ = {mu}");
            assert!(!certify_with_certified_mu(&k, &f, &[1.0 + 1e-9], mu).is_certified(), "μ = {mu}");
        }
    }
}
