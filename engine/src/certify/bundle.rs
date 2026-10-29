//! Certificate bundles: everything a third party needs to re-check the sparse
//! linear-static certificate (Gram residual + Gershgorin, `sparse.rs`) without
//! trusting this crate's interval arithmetic or its rounding model. See
//! "Independent checking: certificate bundles" in `docs/verification/CERTIFY.md`.
//!
//! The bundle holds `K` (lower-triangle CSC), the enclosure `[fLo, fHi]` of the
//! right-hand side, `ũ`, the factor `L` that certified μ (in the permuted ordering)
//! and its permutation, μ and the bound `b`. Every f64 is written exactly as a pair
//! of integers `[m, e]` meaning `m · 2^e`. The Lean checker `lake exe certcheck`
//! (`verify/CertCheck.lean`) recomputes `R = K − L' L'ᵀ`, the Gershgorin row test,
//! `f − K ũ` and `ρ² ≤ (b μ)²` in exact rational arithmetic; its soundness is the
//! Lean theorem `Certify.Bundle.check_sound`.
//!
//! Format history: `v1` had no provenance; `v2` adds `provenance` (hash of the
//! canonical solver input, engine version and commit, certificate kinds; see
//! `provenance.rs`). The checker reads both.

use serde::{Deserialize, Serialize};

use super::interval::Interval;
use super::linear::Certificate;
use super::provenance::Provenance;
use super::solver::{reduced_sparse_2d, reduced_sparse_3d};
use super::sparse::{certify_lambda_min_lower_with_factor, finish};
use crate::linalg::sparse::CscMatrix;
use crate::solver::linear::{solve_2d, solve_3d};
use crate::types::{SolverInput, SolverInput3D};

pub const BUNDLE_FORMAT: &str = "stabileo.linear-certificate.v2";

/// The certificate kind of a linear-static bundle (`provenance.kinds`).
pub const KIND_LINEAR: &str = "linear-static";

/// An f64 as `[m, e]` with value exactly `m · 2^e` (`m` odd, or `[0, 0]`).
pub type Dyadic = [i64; 2];

/// Exact dyadic encoding of a finite f64.
pub fn to_dyadic(x: f64) -> Result<Dyadic, String> {
    if !x.is_finite() {
        return Err(format!("non-finite value {x}"));
    }
    if x == 0.0 {
        return Ok([0, 0]);
    }
    let bits = x.to_bits();
    let exp = ((bits >> 52) & 0x7ff) as i64;
    let frac = (bits & ((1u64 << 52) - 1)) as i64;
    let (mut m, mut e) = if exp == 0 { (frac, -1074) } else { (frac | (1i64 << 52), exp - 1075) };
    let tz = m.trailing_zeros() as i64;
    m >>= tz;
    e += tz;
    Ok([if bits >> 63 == 1 { -m } else { m }, e])
}

/// Inverse of `to_dyadic`; `None` if `m · 2^e` is not exactly an f64.
pub fn from_dyadic([m, e]: Dyadic) -> Option<f64> {
    if m == 0 {
        return Some(0.0);
    }
    if m.unsigned_abs() >= 1u64 << 53 {
        return None;
    }
    // `m` is exact in f64; scaling in chunks of one sign is exact whenever the
    // result is representable, which the final comparison checks.
    let mut x = m as f64;
    let mut r = e;
    while r != 0 {
        let s = r.clamp(-1000, 1000);
        x *= 2f64.powi(s as i32);
        r -= s;
    }
    let tz = i64::from(m.trailing_zeros());
    (to_dyadic(x).ok()? == [m >> tz, e + tz]).then_some(x)
}

/// Sparse matrix in CSC form with exact values.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CscJson {
    pub col_ptr: Vec<usize>,
    pub row_idx: Vec<usize>,
    pub values: Vec<Dyadic>,
}

/// Human-readable copies of the certified quantities (ignored by the checker).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleInfo {
    pub mu: f64,
    pub bound: f64,
    pub residual_norm: f64,
    pub rel_bound: f64,
    pub note: String,
}

/// A linear-static certificate bundle (JSON format `stabileo.linear-certificate.v2`).
///
/// Meaning: `K` is the symmetric matrix with `K[a][b] = K[b][a] = v` for each stored
/// `(a, b, v)` of `k` (lower triangle); `L'[perm[a]][c] = v` for each stored
/// `(a, c, v)` of `l`. Claim: for every `f` with `fLo ≤ f ≤ fHi`, `K` is invertible
/// and `‖K⁻¹ f − ũ‖₂ ≤ bound`, certified by `μ > 0` with
/// `μ ≤ Rᵢᵢ − Σ_{j≠i} |Rᵢⱼ|`, `R = K − L' L'ᵀ`, and `‖r‖ ≤ bound · μ`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearBundle {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub structured_diagnostics: Vec<crate::types::StructuredDiagnostic>,
    pub format: String,
    pub n: usize,
    pub k: CscJson,
    pub f_lo: Vec<Dyadic>,
    pub f_hi: Vec<Dyadic>,
    pub u: Vec<Dyadic>,
    /// `perm[new] = old`: row `a` of `l` is row `perm[a]` of `L'`.
    pub perm: Vec<usize>,
    pub l: CscJson,
    pub mu: Dyadic,
    pub bound: Dyadic,
    /// What was solved (absent for a bundle exported from a bare matrix).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance: Option<Provenance>,
    pub info: BundleInfo,
}

impl LinearBundle {
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).expect("bundle serializes")
    }

    pub fn from_json(s: &str) -> Result<Self, String> {
        serde_json::from_str(s).map_err(|e| format!("bundle parse error: {e}"))
    }
}

fn dyadics(xs: impl IntoIterator<Item = f64>) -> Result<Vec<Dyadic>, String> {
    xs.into_iter().map(to_dyadic).collect()
}

/// Certify `K ũ = f` (`K` symmetric, lower triangle; `f` enclosed by intervals) with
/// the Gram residual + Gershgorin certificate and export the bundle. Err if the
/// certificate cannot be established.
pub fn export_linear_bundle(k: &CscMatrix, f: &[Interval], u: &[f64]) -> Result<LinearBundle, String> {
    let n = k.n;
    if f.len() != n || u.len() != n || k.col_ptr.len() != n + 1 {
        return Err(format!("dimension mismatch: n={n}, f.len()={}, u.len()={}", f.len(), u.len()));
    }
    if n == 0 {
        return Err("empty system".into());
    }
    let vals: Vec<Interval> = k.values.iter().map(|&x| Interval::point(x)).collect();
    let (mu, l) = certify_lambda_min_lower_with_factor(k, &vals)?;
    let cert = finish(k, f, u, mu);
    let Certificate::Certified { abs_bound, rel_bound, sigma, residual_norm } = cert else {
        return Err(format!("not certified: {cert:?}"));
    };
    let sym = &l.symbolic;
    Ok(LinearBundle {
        structured_diagnostics: crate::known_issues::sparse_conditioning(k).into_iter().collect(),
        format: BUNDLE_FORMAT.into(),
        n,
        k: CscJson {
            col_ptr: k.col_ptr.clone(),
            row_idx: k.row_idx.clone(),
            values: dyadics(k.values.iter().copied())?,
        },
        f_lo: dyadics(f.iter().map(|x| x.lo))?,
        f_hi: dyadics(f.iter().map(|x| x.hi))?,
        u: dyadics(u.iter().copied())?,
        perm: sym.perm.clone(),
        l: CscJson {
            col_ptr: sym.l_col_ptr.clone(),
            row_idx: sym.l_row_idx.clone(),
            values: dyadics(l.l_values.iter().copied())?,
        },
        mu: to_dyadic(sigma)?,
        bound: to_dyadic(abs_bound)?,
        provenance: None,
        info: BundleInfo {
            mu: sigma,
            bound: abs_bound,
            residual_norm,
            rel_bound,
            note: "values are [m, e] = m·2^e exactly; check with `lake exe certcheck`".into(),
        },
    })
}

/// Solve a 2D linear static model and export the certificate bundle of its reduced
/// free-DOF system (the sparse assembly, at any model size).
pub fn export_linear_bundle_2d(input: &SolverInput) -> Result<LinearBundle, String> {
    super::finite::check_input(input)?;
    let results = solve_2d(input)?;
    super::finite::check_results(&results)?;
    let (k, f, u) = reduced_sparse_2d(input, &results).map_err(reason)?;
    let mut b = export_linear_bundle(&k, &f, &u)?;
    crate::known_issues::attach(&mut b.structured_diagnostics, results.structured_diagnostics);
    b.provenance = Some(Provenance::new(input, "SolverInput", &[KIND_LINEAR])?);
    super::finite::finite_output(Ok(b))
}

/// Solve a 3D linear static model and export the certificate bundle of its reduced
/// free-DOF system (the sparse assembly, at any model size).
pub fn export_linear_bundle_3d(input: &SolverInput3D) -> Result<LinearBundle, String> {
    super::finite::check_input(input)?;
    let results = solve_3d(input)?;
    super::finite::check_results(&results)?;
    let (k, f, u) = reduced_sparse_3d(input, &results).map_err(reason)?;
    let mut b = export_linear_bundle(&k, &f, &u)?;
    crate::known_issues::attach(&mut b.structured_diagnostics, results.structured_diagnostics);
    b.provenance = Some(Provenance::new(input, "SolverInput3D", &[KIND_LINEAR])?);
    super::finite::finite_output(Ok(b))
}

pub(super) fn reason(c: Certificate) -> String {
    match c {
        Certificate::Uncertified { reason } => reason,
        c => format!("{c:?}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dyadic_round_trips_exactly() {
        let xs = [
            0.0,
            -0.0,
            1.0,
            -1.5,
            0.1,
            1e300,
            -1e-300,
            f64::MIN_POSITIVE,
            f64::MIN_POSITIVE / 3.0, // subnormal
            5e-324,
            f64::MAX,
            -f64::MAX,
            std::f64::consts::PI,
        ];
        for x in xs {
            let d = to_dyadic(x).unwrap();
            assert!(d[0] == 0 || d[0] % 2 != 0, "{x}: {d:?} not canonical");
            let y = from_dyadic(d).unwrap();
            assert!(y == x && (x != 0.0 || d == [0, 0]), "{x} -> {d:?} -> {y}");
        }
        assert_eq!(to_dyadic(1.0).unwrap(), [1, 0]);
        assert_eq!(to_dyadic(-0.75).unwrap(), [-3, -2]);
        assert_eq!(to_dyadic(5e-324).unwrap(), [1, -1074]);
        assert!(to_dyadic(f64::NAN).is_err() && to_dyadic(f64::INFINITY).is_err());
        assert_eq!(from_dyadic([1, 1024]), None);
        assert_eq!(from_dyadic([1, -1075]), None);
    }

    #[test]
    fn bundle_round_trips() {
        // tridiagonal [-1, 2.1, -1] with awkward values, f with a non-point enclosure
        let n = 50;
        let (mut r, mut c, mut v) = (vec![], vec![], vec![]);
        for j in 0..n {
            r.push(j);
            c.push(j);
            v.push(2.1 + 1e-3 * j as f64);
            if j + 1 < n {
                r.push(j + 1);
                c.push(j);
                v.push(-1.0 / 3.0);
            }
        }
        let k = CscMatrix::from_triplets(n, &r, &c, &v);
        let ustar: Vec<f64> = (0..n).map(|i| (i as f64 * 0.37).sin()).collect();
        let fm = k.sym_mat_vec(&ustar);
        let f: Vec<Interval> = fm.iter().map(|&x| Interval::new(x.next_down(), x.next_up())).collect();
        let b = export_linear_bundle(&k, &f, &ustar).expect("certified");
        let json = b.to_json();
        let mut back = LinearBundle::from_json(&json).unwrap();
        back.info = b.info.clone(); // display-only f64 text need not round-trip
        assert_eq!(back, b);
        assert_eq!(back.format, BUNDLE_FORMAT);
        assert_eq!(back.k.col_ptr, k.col_ptr);
        assert_eq!(back.k.row_idx, k.row_idx);
        for (d, x) in back.k.values.iter().zip(&k.values) {
            assert_eq!(from_dyadic(*d).unwrap().to_bits(), x.to_bits());
        }
        for (d, x) in back.f_lo.iter().zip(&f) {
            assert_eq!(from_dyadic(*d).unwrap(), x.lo);
        }
        for (d, x) in back.u.iter().zip(&ustar) {
            assert_eq!(from_dyadic(*d).unwrap().to_bits(), x.to_bits());
        }
        let mu = from_dyadic(back.mu).unwrap();
        let bound = from_dyadic(back.bound).unwrap();
        assert!(mu > 0.0 && mu.to_bits() == b.info.mu.to_bits() && bound.to_bits() == b.info.bound.to_bits());
        let mut p = back.perm.clone();
        p.sort();
        assert_eq!(p, (0..n).collect::<Vec<_>>());
        assert_eq!(back.l.col_ptr.len(), n + 1);
        assert_eq!(back.l.values.len(), back.l.row_idx.len());
    }

    #[test]
    fn export_refuses_indefinite() {
        let k = CscMatrix::from_triplets(2, &[0, 1], &[0, 1], &[1.0, -1.0]);
        let f = [Interval::point(1.0), Interval::point(1.0)];
        assert!(export_linear_bundle(&k, &f, &[1.0, -1.0]).is_err());
    }
}
