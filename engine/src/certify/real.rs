//! A small numeric trait so design-code formulas can be written once and
//! evaluated either in plain f64 (the ordinary check) or in outward-rounded
//! interval arithmetic (the certified check). Sharing one implementation means
//! the two cannot drift.
//!
//! Conventions for formula authors:
//! * `T::exact(x)` for input data (an f64 that *is* the value).
//! * `T::lit(x)` for a decimal constant written in the code (0.877, 4.71, ...):
//!   the f64 literal is within half an ulp of the real constant, so the
//!   interval version widens it by one ulp each way.
//! * Comparisons return a three-valued `Tri`; branch with `branch`, which
//!   evaluates both arms and takes the hull when the condition is undecided.
//!   With f64 every comparison is decided and behaves like `<` / `<=` (NaN
//!   compares false, exactly like the original `if`).
//!
//! Interval transcendental functions (`powf`, `tan`) assume the platform libm
//! `pow` / `tan` are accurate to within 8 ulps (every mainstream libm is within
//! 1–2 ulps); the result is widened by that much. `sqrt` is correctly rounded by IEEE 754.

use std::ops::{Add, Mul, Neg, Sub};

use super::interval::Interval;

/// Result of a comparison that may be undecided on intervals.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tri {
    True,
    False,
    Unknown,
}

impl Tri {
    pub fn and(self, o: Tri) -> Tri {
        match (self, o) {
            (Tri::False, _) | (_, Tri::False) => Tri::False,
            (Tri::True, Tri::True) => Tri::True,
            _ => Tri::Unknown,
        }
    }

    pub fn of_bool(b: bool) -> Tri {
        if b { Tri::True } else { Tri::False }
    }
}

pub trait Real:
    Copy + Add<Output = Self> + Sub<Output = Self> + Mul<Output = Self> + Neg<Output = Self>
{
    /// Exactly the given f64 (input data).
    fn exact(x: f64) -> Self;
    /// A decimal constant from a formula; the real constant is within 0.5 ulp of `x`.
    fn lit(x: f64) -> Self;
    fn pi() -> Self;
    fn dv(self, o: Self) -> Self;
    fn sqrt(self) -> Self;
    fn sq(self) -> Self;
    fn abs(self) -> Self;
    fn min(self, o: Self) -> Self;
    /// `min`, but a NaN `self` stays NaN (f64::min would return `o`).
    fn min_keep_nan(self, o: Self) -> Self;
    fn max(self, o: Self) -> Self;
    /// `self^e` for a positive base.
    fn powf(self, e: Self) -> Self;
    /// `tan` (interval version: arguments in (−π/2, π/2) only).
    fn tan(self) -> Self;
    /// Smallest set containing both (only reached on undecided branches).
    fn hull(self, o: Self) -> Self;
    fn lt(self, o: Self) -> Tri;
    fn le(self, o: Self) -> Tri;
    /// The root of `g` on `(lo, hi)`, where the caller guarantees `g` is
    /// continuous and strictly increasing there (so the root is unique).
    /// `g64` is the same formula instantiated in f64, `g` the generic one.
    ///
    /// f64: bisection on `g64` (NaN unless `g64(lo) < 0 < g64(hi)`).
    /// Interval: the f64 root `r`, then a bracket `[r − δ, r + δ]` certified
    /// by evaluating `g` in interval arithmetic at both ends (`g < 0` at the
    /// left end and `> 0` at the right for every real parameter in the
    /// enclosures): by continuity the exact root is inside, by monotonicity
    /// it is the only one. NaN if no bracket up to `δ = 1e-3·|r|` certifies.
    fn increasing_root(g64: impl Fn(f64) -> f64, g: impl Fn(Self) -> Self, lo: f64, hi: f64) -> Self;
    /// A representative f64 (the value itself; an interval's midpoint, NaN if
    /// not finite). For reporting only — never for a decision a result rests on.
    fn mid(self) -> f64;
}

/// Bisection for an increasing `g`: NaN unless `g(lo) < 0 < g(hi)`.
pub fn bisect_increasing(g: impl Fn(f64) -> f64, lo: f64, hi: f64) -> f64 {
    let (mut lo, mut hi) = (lo, hi);
    if !(lo < hi) || !(g(lo) < 0.0) || !(g(hi) > 0.0) {
        return f64::NAN;
    }
    for _ in 0..2000 {
        let mid = 0.5 * (lo + hi);
        if mid <= lo || mid >= hi {
            break; // adjacent floats
        }
        if g(mid) < 0.0 {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    0.5 * (lo + hi)
}

/// `if c { a } else { b }`, taking the hull of both arms when `c` is undecided.
#[inline]
pub fn branch<T: Real>(c: Tri, a: impl FnOnce() -> T, b: impl FnOnce() -> T) -> T {
    match c {
        Tri::True => a(),
        Tri::False => b(),
        Tri::Unknown => a().hull(b()),
    }
}

impl Real for f64 {
    #[inline]
    fn exact(x: f64) -> Self {
        x
    }
    #[inline]
    fn lit(x: f64) -> Self {
        x
    }
    #[inline]
    fn pi() -> Self {
        std::f64::consts::PI
    }
    #[inline]
    fn dv(self, o: Self) -> Self {
        self / o
    }
    #[inline]
    fn sqrt(self) -> Self {
        f64::sqrt(self)
    }
    #[inline]
    fn sq(self) -> Self {
        self * self
    }
    #[inline]
    fn abs(self) -> Self {
        f64::abs(self)
    }
    #[inline]
    fn min(self, o: Self) -> Self {
        f64::min(self, o)
    }
    #[inline]
    fn min_keep_nan(self, o: Self) -> Self {
        if self.is_nan() { self } else { f64::min(self, o) }
    }
    #[inline]
    fn max(self, o: Self) -> Self {
        f64::max(self, o)
    }
    #[inline]
    fn powf(self, e: Self) -> Self {
        f64::powf(self, e)
    }
    #[inline]
    fn tan(self) -> Self {
        f64::tan(self)
    }
    #[inline]
    fn hull(self, _o: Self) -> Self {
        // f64 comparisons are always decided; unreachable through `branch`.
        f64::NAN
    }
    #[inline]
    fn lt(self, o: Self) -> Tri {
        Tri::of_bool(self < o)
    }
    #[inline]
    fn le(self, o: Self) -> Tri {
        Tri::of_bool(self <= o)
    }
    fn increasing_root(g64: impl Fn(f64) -> f64, _g: impl Fn(Self) -> Self, lo: f64, hi: f64) -> Self {
        bisect_increasing(g64, lo, hi)
    }
    #[inline]
    fn mid(self) -> f64 {
        self
    }
}

/// Relative widening for libm `pow` (8 ulps).
const POW_ULPS: f64 = 8.0 * f64::EPSILON;

impl Real for Interval {
    #[inline]
    fn exact(x: f64) -> Self {
        Interval::point(x)
    }
    #[inline]
    fn lit(x: f64) -> Self {
        Interval::new(x.next_down(), x.next_up())
    }
    #[inline]
    fn pi() -> Self {
        let p = std::f64::consts::PI;
        Interval::new(p.next_down(), p.next_up())
    }
    #[inline]
    fn dv(self, o: Self) -> Self {
        self.div(o)
    }
    #[inline]
    fn sqrt(self) -> Self {
        Interval::sqrt(self)
    }
    #[inline]
    fn sq(self) -> Self {
        self.square()
    }
    fn abs(self) -> Self {
        if !self.is_finite() {
            return Interval::NAN;
        }
        if self.lo >= 0.0 {
            self
        } else if self.hi <= 0.0 {
            -self
        } else {
            Interval::new(0.0, self.mag())
        }
    }
    fn min(self, o: Self) -> Self {
        if !self.is_finite() || !o.is_finite() {
            return Interval::NAN;
        }
        Interval::new(self.lo.min(o.lo), self.hi.min(o.hi))
    }
    fn min_keep_nan(self, o: Self) -> Self {
        Real::min(self, o) // already NaN-propagating
    }
    fn max(self, o: Self) -> Self {
        if !self.is_finite() || !o.is_finite() {
            return Interval::NAN;
        }
        Interval::new(self.lo.max(o.lo), self.hi.max(o.hi))
    }
    fn powf(self, e: Self) -> Self {
        // x^y is monotone in each argument for x > 0, so the extremes over the
        // box are at its corners.
        if !self.is_finite() || !e.is_finite() || !(self.lo > 0.0) {
            return Interval::NAN;
        }
        let c = [self.lo.powf(e.lo), self.lo.powf(e.hi), self.hi.powf(e.lo), self.hi.powf(e.hi)];
        if !c.iter().all(|v| v.is_finite()) {
            return Interval::NAN;
        }
        let mn = c.iter().copied().fold(f64::INFINITY, f64::min);
        let mx = c.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        // Absolute slack MIN_POSITIVE covers subnormal results.
        let lo = (mn - mn.abs() * POW_ULPS - f64::MIN_POSITIVE).next_down().max(0.0);
        let hi = (mx + mx.abs() * POW_ULPS + f64::MIN_POSITIVE).next_up();
        Interval::new(lo, hi)
    }
    fn tan(self) -> Self {
        // Increasing on (−π/2, π/2); 1.57 < π/2 keeps clear of the pole.
        if !self.is_finite() || !(self.lo > -1.57 && self.hi < 1.57) {
            return Interval::NAN;
        }
        let (a, b) = (self.lo.tan(), self.hi.tan());
        let lo = (a - a.abs() * POW_ULPS - f64::MIN_POSITIVE).next_down();
        let hi = (b + b.abs() * POW_ULPS + f64::MIN_POSITIVE).next_up();
        Interval::new(lo, hi)
    }
    fn hull(self, o: Self) -> Self {
        if !self.is_finite() || !o.is_finite() {
            return Interval::NAN;
        }
        Interval::new(self.lo.min(o.lo), self.hi.max(o.hi))
    }
    fn lt(self, o: Self) -> Tri {
        if !self.is_finite() || !o.is_finite() {
            Tri::Unknown
        } else if self.hi < o.lo {
            Tri::True
        } else if self.lo >= o.hi {
            Tri::False
        } else {
            Tri::Unknown
        }
    }
    fn le(self, o: Self) -> Tri {
        if !self.is_finite() || !o.is_finite() {
            Tri::Unknown
        } else if self.hi <= o.lo {
            Tri::True
        } else if self.lo > o.hi {
            Tri::False
        } else {
            Tri::Unknown
        }
    }
    fn increasing_root(g64: impl Fn(f64) -> f64, g: impl Fn(Self) -> Self, lo: f64, hi: f64) -> Self {
        let r = bisect_increasing(g64, lo, hi);
        if !r.is_finite() {
            return Interval::NAN;
        }
        let mut delta = (r.abs() * 4.0 * f64::EPSILON).max(f64::MIN_POSITIVE);
        while delta <= 1e-3 * r.abs().max(f64::MIN_POSITIVE) {
            let (a, b) = ((r - delta).next_down(), (r + delta).next_up());
            // Stay inside (lo, hi), where the caller guarantees monotonicity.
            if a >= lo && b <= hi {
                let (ga, gb) = (g(Interval::point(a)), g(Interval::point(b)));
                if ga.is_finite() && gb.is_finite() && ga.hi < 0.0 && gb.lo > 0.0 {
                    return Interval::new(a, b);
                }
            }
            delta *= 4.0;
        }
        Interval::NAN
    }
    fn mid(self) -> f64 {
        if self.is_finite() { 0.5 * self.lo + 0.5 * self.hi } else { f64::NAN }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn iv(lo: f64, hi: f64) -> Interval {
        Interval::new(lo, hi)
    }

    #[test]
    fn comparisons_are_three_valued() {
        assert_eq!(iv(0.0, 1.0).lt(iv(2.0, 3.0)), Tri::True);
        assert_eq!(iv(2.0, 3.0).lt(iv(0.0, 1.0)), Tri::False);
        assert_eq!(iv(0.0, 2.5).lt(iv(2.0, 3.0)), Tri::Unknown);
        assert_eq!(iv(0.0, 2.0).le(iv(2.0, 3.0)), Tri::True);
        assert_eq!(iv(0.0, 2.0).lt(iv(2.0, 3.0)), Tri::Unknown);
        assert_eq!(Interval::NAN.le(iv(0.0, 1.0)), Tri::Unknown);
        assert_eq!(1.0f64.le(1.0), Tri::True);
        assert_eq!(f64::NAN.le(1.0), Tri::False);
    }

    #[test]
    fn branch_hulls_undecided() {
        let r = branch(Tri::Unknown, || iv(1.0, 2.0), || iv(5.0, 6.0));
        assert_eq!(r, iv(1.0, 6.0));
        let r: Interval = branch(Tri::Unknown, || iv(1.0, 2.0), || Interval::NAN);
        assert!(!r.is_finite());
    }

    #[test]
    fn abs_min_max_enclose() {
        assert_eq!(iv(-3.0, 2.0).abs(), iv(0.0, 3.0));
        assert_eq!(iv(-3.0, -2.0).abs(), iv(2.0, 3.0));
        assert_eq!(iv(1.0, 4.0).min(iv(2.0, 3.0)), iv(1.0, 3.0));
        assert_eq!(iv(1.0, 4.0).max(iv(2.0, 3.0)), iv(2.0, 4.0));
        assert!(!iv(1.0, 4.0).max(Interval::NAN).is_finite());
    }

    #[test]
    fn powf_encloses_samples() {
        // 0.658^x over x ∈ [0.1, 3] (the AISC E3-2 factor), and x^y generally.
        let base = Interval::lit(0.658);
        for k in 0..200 {
            let lo = 0.01 + k as f64 * 0.015;
            let e = iv(lo, lo * 1.3);
            let r = base.powf(e);
            for j in 0..=10 {
                let x = lo + (lo * 0.3) * j as f64 / 10.0;
                let v = 0.658f64.powf(x);
                assert!(r.lo <= v && v <= r.hi, "{x}: {v} ∉ {r:?}");
            }
        }
        let r = iv(2.0, 3.0).powf(iv(-1.0, 2.0));
        assert!(r.lo <= 1.0 / 3.0 && r.hi >= 9.0);
        assert!(!iv(-1.0, 2.0).powf(iv(1.0, 1.0)).is_finite());
    }

    #[test]
    fn tan_encloses_and_refuses_near_pole() {
        for k in 1..300 {
            let t = k as f64 * 0.005;
            let r = Interval::point(t).tan();
            assert!(r.lo < t.tan() && t.tan() < r.hi);
        }
        assert!(!iv(1.0, 1.6).tan().is_finite());
    }

    #[test]
    fn lit_contains_decimal_constant() {
        // 0.1 is not representable: the exact decimal lies strictly inside.
        let t = Interval::lit(0.1);
        assert!(t.lo < 0.1 && 0.1 < t.hi);
        let p = Interval::pi();
        assert!(p.lo < std::f64::consts::PI && std::f64::consts::PI < p.hi);
    }
}
