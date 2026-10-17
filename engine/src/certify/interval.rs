//! Minimal f64 interval arithmetic with outward rounding.
//!
//! Rounding model (CERTIFY.md): every f64 operation rounds to nearest, so the
//! exact real result lies within 0.5 ulp of the computed one. Each operation
//! computes its endpoints in round-to-nearest and then widens them by one ulp
//! (`next_down` on the lower endpoint, `next_up` on the upper), which encloses
//! the exact real result of the operation applied to any reals in the inputs.
//!
//! Non-finite values are never trusted: `mul`, `div`, `sqrt` return the NaN
//! interval on non-finite input (so `f64::min`/`max`, which ignore NaN, cannot
//! hide one), `add`/`sub` propagate NaN/inf naturally, and callers check
//! `is_finite` before relying on a value.

use std::ops::{Add, Mul, Neg, Sub};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Interval {
    pub lo: f64,
    pub hi: f64,
}

#[inline]
fn down(x: f64) -> f64 {
    x.next_down()
}

#[inline]
fn up(x: f64) -> f64 {
    x.next_up()
}

impl Interval {
    pub const NAN: Interval = Interval { lo: f64::NAN, hi: f64::NAN };
    pub const ZERO: Interval = Interval { lo: 0.0, hi: 0.0 };

    /// Degenerate interval for an exactly representable value.
    #[inline]
    pub fn point(x: f64) -> Self {
        Interval { lo: x, hi: x }
    }

    #[inline]
    pub fn new(lo: f64, hi: f64) -> Self {
        Interval { lo, hi }
    }

    /// Both endpoints finite and ordered.
    #[inline]
    pub fn is_finite(self) -> bool {
        self.lo.is_finite() && self.hi.is_finite() && self.lo <= self.hi
    }

    #[inline]
    pub fn contains_zero(self) -> bool {
        self.lo <= 0.0 && 0.0 <= self.hi
    }

    /// max(|lo|, |hi|): an upper bound on |x| for every x in the interval.
    #[inline]
    pub fn mag(self) -> f64 {
        self.lo.abs().max(self.hi.abs())
    }

    /// Exact real x² for every x in the interval (tighter than self*self).
    #[inline]
    pub fn square(self) -> Self {
        if !self.is_finite() {
            return Self::NAN;
        }
        let a = self.lo.abs();
        let b = self.hi.abs();
        let (mn, mx) = if a <= b { (a, b) } else { (b, a) };
        let lo = if self.contains_zero() { 0.0 } else { down(mn * mn).max(0.0) };
        Interval { lo, hi: up(mx * mx) }
    }

    /// Square root of a nonnegative interval. NaN if lo < 0 or non-finite.
    #[inline]
    pub fn sqrt(self) -> Self {
        if !self.is_finite() || self.lo < 0.0 {
            return Self::NAN;
        }
        Interval { lo: down(self.lo.sqrt()).max(0.0), hi: up(self.hi.sqrt()) }
    }

    /// Division; NaN if the denominator contains 0 or any input is non-finite.
    #[inline]
    pub fn div(self, d: Self) -> Self {
        if !self.is_finite() || !d.is_finite() || d.contains_zero() {
            return Self::NAN;
        }
        let q = [self.lo / d.lo, self.lo / d.hi, self.hi / d.lo, self.hi / d.hi];
        let mn = q[0].min(q[1]).min(q[2]).min(q[3]);
        let mx = q[0].max(q[1]).max(q[2]).max(q[3]);
        Interval { lo: down(mn), hi: up(mx) }
    }

    /// Divide by an exact positive f64 scalar (e.g. 2).
    #[inline]
    pub fn div_scalar(self, d: f64) -> Self {
        self.div(Interval::point(d))
    }
}

impl Add for Interval {
    type Output = Interval;
    #[inline]
    fn add(self, o: Interval) -> Interval {
        Interval { lo: down(self.lo + o.lo), hi: up(self.hi + o.hi) }
    }
}

impl Sub for Interval {
    type Output = Interval;
    #[inline]
    fn sub(self, o: Interval) -> Interval {
        Interval { lo: down(self.lo - o.hi), hi: up(self.hi - o.lo) }
    }
}

impl Neg for Interval {
    type Output = Interval;
    #[inline]
    fn neg(self) -> Interval {
        Interval { lo: -self.hi, hi: -self.lo }
    }
}

impl Mul for Interval {
    type Output = Interval;
    #[inline]
    fn mul(self, o: Interval) -> Interval {
        if !self.is_finite() || !o.is_finite() {
            return Interval::NAN;
        }
        let p = [self.lo * o.lo, self.lo * o.hi, self.hi * o.lo, self.hi * o.hi];
        let mn = p[0].min(p[1]).min(p[2]).min(p[3]);
        let mx = p[0].max(p[1]).max(p[2]).max(p[3]);
        Interval { lo: down(mn), hi: up(mx) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Tests below pin down each guard that mutation testing showed untested.

    #[test]
    fn sqrt_rejects_negative_and_accepts_zero() {
        assert!(!Interval::new(-1.0, 4.0).sqrt().is_finite());
        let r = Interval::new(0.0, 4.0).sqrt();
        assert!(r.is_finite() && r.lo == 0.0 && r.hi >= 2.0);
        assert!(!Interval::new(f64::NAN, 4.0).sqrt().is_finite());
        assert!(!Interval::new(1.0, f64::INFINITY).sqrt().is_finite());
    }

    #[test]
    fn div_rejects_zero_and_non_finite() {
        let one = Interval::point(1.0);
        assert!(!one.div(Interval::new(-1.0, 1.0)).is_finite());
        assert!(!one.div(Interval::new(0.0, 1.0)).is_finite());
        assert!(!Interval::new(f64::NAN, 1.0).div(Interval::point(2.0)).is_finite());
        assert!(!one.div(Interval::new(1.0, f64::NAN)).is_finite());
        assert!(one.div(Interval::point(2.0)).is_finite());
    }

    #[test]
    fn mul_rejects_any_non_finite_operand() {
        // f64::min/max ignore NaN, so without the guard a NaN operand could
        // produce a finite (wrong) interval.
        let a = Interval::new(1.0, 2.0);
        assert!(!(a * Interval::new(f64::NAN, 3.0)).is_finite());
        assert!(!(Interval::new(1.0, f64::NAN) * a).is_finite());
        assert!(!(a * Interval::new(1.0, f64::INFINITY)).is_finite());
    }

    #[test]
    fn neg_reflects_endpoints() {
        let n = -Interval::new(1.0, 3.0);
        assert_eq!((n.lo, n.hi), (-3.0, -1.0));
    }

    // Error-free transformations give the exact real result as an unevaluated
    // pair (s, e) with s + e exact. Inclusion lo ≤ s+e ≤ hi is then checked
    // without rounding: lo − s and hi − s are exact (Sterbenz / one-ulp gaps)
    // whenever lo, hi are within a few ulps of s, which the tests assert.

    fn two_sum(a: f64, b: f64) -> (f64, f64) {
        let s = a + b;
        let bb = s - a;
        let e = (a - (s - bb)) + (b - bb);
        (s, e)
    }

    fn two_prod(a: f64, b: f64) -> (f64, f64) {
        let p = a * b;
        (p, a.mul_add(b, -p))
    }

    /// lo ≤ s + e ≤ hi, with s + e an exact real. Exact for subtraction
    /// results that fit (checked via two_sum of lo − s having no error).
    fn encloses(iv: Interval, s: f64, e: f64) -> bool {
        let (dl, el) = two_sum(iv.lo, -s);
        let (dh, eh) = two_sum(iv.hi, -s);
        assert_eq!(el, 0.0, "lo - s not exact");
        assert_eq!(eh, 0.0, "hi - s not exact");
        dl <= e && e <= dh
    }

    struct Lcg(u64);
    impl Lcg {
        fn next(&mut self) -> u64 {
            self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            self.0
        }
        /// Random f64 with random sign and exponent in [emin, emax].
        fn float(&mut self, emin: i32, emax: i32) -> f64 {
            let m = 1.0 + (self.next() >> 11) as f64 / (1u64 << 53) as f64;
            let span = (emax - emin + 1) as u64;
            let e = emin + (self.next() % span) as i32;
            let s = if self.next() & 1 == 0 { 1.0 } else { -1.0 };
            s * m * 2f64.powi(e)
        }
    }

    #[test]
    fn add_sub_enclose_exact_results() {
        let mut g = Lcg(42);
        for _ in 0..20000 {
            let a = g.float(-40, 40);
            let b = g.float(-40, 40);
            let (s, e) = two_sum(a, b);
            assert!(encloses(Interval::point(a) + Interval::point(b), s, e), "{a} + {b}");
            let (s, e) = two_sum(a, -b);
            assert!(encloses(Interval::point(a) - Interval::point(b), s, e), "{a} - {b}");
        }
    }

    #[test]
    fn mul_encloses_exact_results() {
        let mut g = Lcg(7);
        for _ in 0..20000 {
            let a = g.float(-200, 200);
            let b = g.float(-200, 200);
            let (p, e) = two_prod(a, b);
            if !p.is_finite() || p.abs() < 1e-290 {
                continue;
            }
            assert!(encloses(Interval::point(a) * Interval::point(b), p, e), "{a} * {b}");
        }
    }

    // For products/quotients/roots, fma gives round(exact), and rounding is
    // monotone with round(v) = 0 only for v = 0 (no underflow in these ranges),
    // so the sign of an fma residual is the sign of the exact real residual.

    #[test]
    fn div_encloses_exact_results() {
        // exact q = a/b ∈ [lo, hi]  ⇔  (a − lo·b)·sgn b ≥ 0 and (hi·b − a)·sgn b ≥ 0
        let mut g = Lcg(11);
        for _ in 0..20000 {
            let a = g.float(-100, 100);
            let b = g.float(-100, 100);
            let iv = Interval::point(a).div(Interval::point(b));
            assert!(iv.is_finite());
            let sb = b.signum();
            assert!((-iv.lo).mul_add(b, a) * sb >= 0.0, "{a}/{b} lo");
            assert!(iv.hi.mul_add(b, -a) * sb >= 0.0, "{a}/{b} hi");
        }
    }

    #[test]
    fn sqrt_and_square_enclose() {
        let mut g = Lcg(3);
        for _ in 0..20000 {
            let x = g.float(-300, 300).abs();
            let r = Interval::point(x).sqrt();
            assert!((-r.lo).mul_add(r.lo, x) >= 0.0, "sqrt lo {x}"); // lo² ≤ x
            assert!(r.hi.mul_add(r.hi, -x) >= 0.0, "sqrt hi {x}"); // x ≤ hi²

            let y = g.float(-150, 150);
            let s = Interval::point(y).square();
            assert!(y.mul_add(y, -s.lo) >= 0.0 && (-y).mul_add(y, s.hi) >= 0.0, "square {y}");
        }
        // square of an interval straddling zero starts at 0
        let s = Interval::new(-2.0, 3.0).square();
        assert_eq!(s.lo, 0.0);
        assert!(s.hi >= 9.0);
    }

    #[test]
    fn catastrophic_cancellation() {
        // (1e16 + 1) − 1e16: round-to-nearest gives 0 for the first add, but the
        // enclosure must still contain the exact 1.
        let big = Interval::point(1e16);
        let r = (big + Interval::point(1.0)) - big;
        assert!(r.lo <= 1.0 && 1.0 <= r.hi, "{r:?}");
        // 0.1 + 0.2 − 0.3 with all three as exact f64 inputs
        let (s, e) = two_sum(0.1, 0.2);
        let iv = Interval::point(0.1) + Interval::point(0.2);
        assert!(encloses(iv, s, e));
        let r = iv - Interval::point(0.3);
        let exact = (s - 0.3) + e; // s − 0.3 exact by Sterbenz
        assert!(r.lo <= exact && exact <= r.hi);
        // Repeated cancellation stays an enclosure of 0
        let mut acc = Interval::ZERO;
        for k in 0..1000 {
            let v = Interval::point(1.0 / (k as f64 + 1.0) * 1e20);
            acc = acc + v - v;
        }
        assert!(acc.contains_zero());
    }

    #[test]
    fn tiny_and_huge_magnitudes() {
        let tiny = Interval::point(f64::from_bits(1)); // smallest subnormal
        let p = tiny * tiny; // exact result 2^-2148 underflows to 0
        assert!(p.lo < 0.0 && p.hi > 0.0, "underflow must widen: {p:?}");
        let s = tiny.square();
        assert!(s.lo == 0.0 && s.hi > 0.0);
        let q = tiny.div(Interval::point(3.0));
        assert!(q.lo <= 0.0 && q.hi > 0.0);
        // Overflow becomes non-finite and is detected
        let huge = Interval::point(f64::MAX);
        assert!(!(huge * Interval::point(2.0)).is_finite());
        assert!(!(huge + huge).is_finite());
        // NaN never hides behind min/max
        assert!(!(Interval::NAN * Interval::point(1.0)).is_finite());
        assert!(!Interval::point(1.0).div(Interval::new(-1.0, 1.0)).is_finite());
        assert!(!Interval::point(-1.0).sqrt().is_finite());
        // Inf − Inf → NaN, not finite
        let inf = Interval::point(f64::INFINITY);
        assert!(!(inf - inf).is_finite());
    }
}
