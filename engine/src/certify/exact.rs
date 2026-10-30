//! Exact rational arithmetic helpers for certificates that are checked without
//! rounding (`certify::plastic`).
//!
//! Every finite f64 is a dyadic rational, so input data convert exactly
//! (`q`). Results go back to f64 with directed rounding (`to_f64_down`,
//! `to_f64_up`), so a reported bound is never on the wrong side of the exact
//! rational it stands for.

use num_rational::BigRational;
use num_traits::{FromPrimitive, One, Signed, ToPrimitive, Zero};

pub type Q = BigRational;

/// The exact rational value of a finite f64; `None` for NaN or ±inf.
pub fn q(x: f64) -> Option<Q> {
    if x.is_finite() {
        BigRational::from_float(x)
    } else {
        None
    }
}

/// Small integer as a rational.
pub fn qi(n: i64) -> Q {
    Q::from_i64(n).expect("every i64 is exactly representable as a rational")
}

/// Exact ratio n/d of two integers (d ≠ 0).
pub fn qr(n: i64, d: i64) -> Q {
    qi(n) / qi(d)
}

/// Exact square root when `x` is the square of a rational, else `None`.
pub fn sqrt_exact(x: &Q) -> Option<Q> {
    if x.is_negative() {
        return None;
    }
    // `x` is kept in lowest terms, so it is a rational square iff numerator and
    // denominator are both integer squares.
    let n = x.numer();
    let d = x.denom();
    let sn = n.sqrt();
    let sd = d.sqrt();
    if &(&sn * &sn) == n && &(&sd * &sd) == d {
        Some(Q::new(sn, sd))
    } else {
        None
    }
}

/// Largest f64 ≤ x (x must be within the finite f64 range).
pub fn to_f64_down(x: &Q) -> Option<f64> {
    let mut v = x.to_f64()?;
    if !v.is_finite() {
        return None;
    }
    // `to_f64` is accurate to a few ulps; step until the inequality holds.
    while q(v)? > *x {
        v = v.next_down();
    }
    while v.next_up().is_finite() && q(v.next_up())? <= *x {
        v = v.next_up();
    }
    Some(v)
}

/// Smallest f64 ≥ x.
pub fn to_f64_up(x: &Q) -> Option<f64> {
    to_f64_down(&-x).map(|v| -v)
}

/// Nearest-ish f64 (for heuristics only).
pub fn to_f64(x: &Q) -> f64 {
    x.to_f64().unwrap_or(f64::NAN)
}

pub fn qabs(x: &Q) -> Q {
    x.abs()
}

/// Result of exact Gauss–Jordan elimination of `A x = b` (A is m × n).
pub struct Rref {
    /// Particular solution (free variables set to 0); `None` if inconsistent.
    pub particular: Option<Vec<Q>>,
    /// Basis of the null space of A (one vector per free column).
    pub null_basis: Vec<Vec<Q>>,
}

/// Exact Gauss–Jordan elimination on `[A | b]` (rows of A given densely).
/// With `b = None` only the null space is computed.
pub fn rref_solve(a: &[Vec<Q>], b: Option<&[Q]>, n: usize) -> Rref {
    let m = a.len();
    let with_rhs = b.is_some();
    let b = b.unwrap_or(&[]);
    let mut rows: Vec<Vec<Q>> = a
        .iter()
        .enumerate()
        .map(|(i, r)| {
            let mut v = r.clone();
            v.resize(n, Q::zero());
            if with_rhs {
                v.push(b[i].clone());
            }
            v
        })
        .collect();
    let width = n + usize::from(with_rhs);
    let mut pivot_cols = Vec::new();
    let mut r = 0;
    for c in 0..n {
        if r >= m {
            break;
        }
        let Some(p) = (r..m).find(|&i| !rows[i][c].is_zero()) else { continue };
        rows.swap(r, p);
        let inv = rows[r][c].recip();
        for v in rows[r][c..width].iter_mut() {
            if !v.is_zero() {
                *v = &*v * &inv;
            }
        }
        let prow = rows[r].clone();
        for (i, row) in rows.iter_mut().enumerate() {
            if i == r || row[c].is_zero() {
                continue;
            }
            let f = row[c].clone();
            for k in c..width {
                if !prow[k].is_zero() {
                    row[k] = &row[k] - &f * &prow[k];
                }
            }
        }
        pivot_cols.push(c);
        r += 1;
    }
    let rank = r;
    let particular = if with_rhs {
        if rows[rank..].iter().any(|row| !row[n].is_zero()) {
            None
        } else {
            let mut x = vec![Q::zero(); n];
            for (i, &c) in pivot_cols.iter().enumerate() {
                x[c] = rows[i][n].clone();
            }
            Some(x)
        }
    } else {
        None
    };
    let is_pivot: Vec<bool> = {
        let mut v = vec![false; n];
        for &c in &pivot_cols {
            v[c] = true;
        }
        v
    };
    let mut null_basis = Vec::new();
    for f in 0..n {
        if is_pivot[f] {
            continue;
        }
        let mut v = vec![Q::zero(); n];
        v[f] = Q::one();
        for (i, &c) in pivot_cols.iter().enumerate() {
            if !rows[i][f].is_zero() {
                v[c] = -rows[i][f].clone();
            }
        }
        null_basis.push(v);
    }
    Rref { particular, null_basis }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn f64_round_trip_is_exact_and_directed() {
        for &x in &[0.1, -0.1, 1.0 / 3.0, 1e-300, 123456.789, -7.5] {
            let r = q(x).unwrap();
            assert_eq!(to_f64_down(&r), Some(x));
            assert_eq!(to_f64_up(&r), Some(x));
        }
        let third = qr(1, 3);
        let lo = to_f64_down(&third).unwrap();
        let hi = to_f64_up(&third).unwrap();
        assert!(q(lo).unwrap() < third && third < q(hi).unwrap());
        assert_eq!(lo.next_up(), hi);
        assert!(q(f64::NAN).is_none() && q(f64::INFINITY).is_none());
    }

    #[test]
    fn exact_sqrt() {
        assert_eq!(sqrt_exact(&qr(9, 4)), Some(qr(3, 2)));
        assert_eq!(sqrt_exact(&qi(25)), Some(qi(5)));
        assert!(sqrt_exact(&qi(2)).is_none());
        assert!(sqrt_exact(&qi(-4)).is_none());
        // 0.3² + 0.4² is not exactly 0.25 in binary, and not a rational square
        let l2 = q(0.3).unwrap() * q(0.3).unwrap() + q(0.4).unwrap() * q(0.4).unwrap();
        assert!(sqrt_exact(&l2).is_none());
        let l2 = qi(9) + qi(16);
        assert_eq!(sqrt_exact(&l2), Some(qi(5)));
    }

    #[test]
    fn rref_particular_and_null_space() {
        // x + y + z = 3, x − y = 0
        let a = vec![vec![qi(1), qi(1), qi(1)], vec![qi(1), qi(-1), qi(0)]];
        let b = vec![qi(3), qi(0)];
        let r = rref_solve(&a, Some(&b), 3);
        let x = r.particular.unwrap();
        for (row, bi) in a.iter().zip(&b) {
            let s: Q = row.iter().zip(&x).map(|(p, q)| p * q).sum();
            assert_eq!(&s, bi);
        }
        assert_eq!(r.null_basis.len(), 1);
        for row in &a {
            let s: Q = row.iter().zip(&r.null_basis[0]).map(|(p, q)| p * q).sum();
            assert!(s.is_zero());
        }
        // inconsistent
        let a = vec![vec![qi(1), qi(1)], vec![qi(2), qi(2)]];
        assert!(rref_solve(&a, Some(&[qi(1), qi(3)]), 2).particular.is_none());
    }
}
