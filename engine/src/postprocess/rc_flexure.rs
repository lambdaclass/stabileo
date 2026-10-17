//! Flexural strength of a reinforced concrete section by strain compatibility
//! (ACI 318 / CIRSOC 201 rectangular stress block), shared by `rc_check` and
//! `cirsoc201_check`.
//!
//! The neutral axis depth `c` is the root of the force residual
//!
//! ```text
//! R(c) = Cc(c) + As'·fs'(c) − As·fs(c),
//! Cc(c) = 0.85·f'c·(bw·a + (bf − bw)·min(a, hf)),    a = β1·c,
//! fs'(c) = clamp(Es·εcu·(1 − d'/c), −fy, fy),         fs(c) = clamp(Es·εcu·(d/c − 1), −fy, fy),
//! ```
//!
//! with `εcu = 0.003`. Both steels take the stress their strain gives: the
//! previous closed forms assumed the tension steel yields (overstating Mn by
//! ~6% for an over-reinforced beam whose εt < εy) and, in CIRSOC 201, took the
//! compression-steel strain from the singly reinforced `c` (overstating Mn by
//! up to ~5%). The displaced concrete at the compression bars is not deducted
//! (as before).
//!
//! `R` is continuous and strictly increasing in `c > 0` whenever f'c, β1, bw > 0,
//! bf ≥ bw, hf ≥ 0, As, As', Es ≥ 0, d, d' ≥ 0 and fy ≥ 0 (`Cc` strictly
//! increasing, `fs'` non-decreasing, `fs` non-increasing), so the root is unique
//! and `Real::increasing_root` finds it (f64) or encloses it (interval). The
//! moment is taken about the tension steel; `R(c) = 0` makes it the couple.
//!
//! Generic over `Real` so the certified check (`certify::design`) evaluates the
//! same formulas in interval arithmetic.

use crate::certify::real::Real;

/// Section data for the flexural strength (SI: Pa, m, m²). For a rectangular
/// section `bf = bw` and `hf = 0`.
#[derive(Debug, Clone, Copy)]
pub(crate) struct RcFlexureSection {
    pub fc: f64,
    pub fy: f64,
    pub es: f64,
    pub bw: f64,
    pub bf: f64,
    pub hf: f64,
    pub d: f64,
    pub as_t: f64,
    pub as_c: f64,
    pub d_prime: f64,
}

/// Strain-compatibility flexural strength.
#[derive(Debug, Clone, Copy)]
pub(crate) struct RcFlexure<T> {
    /// Nominal moment Mn (N·m).
    pub mn: T,
    /// Stress block depth a = β1·c (m).
    pub a: T,
    /// Neutral axis depth c (m).
    pub c: T,
    /// Net tensile strain in the extreme tension steel.
    pub epsilon_t: T,
}

impl RcFlexureSection {
    /// The data conditions under which `R` is strictly increasing (module doc).
    pub fn monotone(&self) -> bool {
        let fin = [self.fc, self.fy, self.es, self.bw, self.bf, self.hf, self.d, self.as_t, self.as_c, self.d_prime]
            .iter()
            .all(|x| x.is_finite());
        fin && self.fc > 0.0
            && self.bw > 0.0
            && self.bf >= self.bw
            && self.hf >= 0.0
            && self.as_t >= 0.0
            && self.as_c >= 0.0
            && self.es >= 0.0
            && self.d >= 0.0
            && self.d_prime >= 0.0
            && self.fy >= 0.0
    }

    fn strain_c<T: Real>(&self, c: T, depth: T) -> (T, T) {
        // (compression-steel stress, tension-steel stress) at neutral axis c.
        let ecu_es = T::lit(0.003) * T::exact(self.es);
        let fy = T::exact(self.fy);
        let one = T::exact(1.0);
        let fsc = (ecu_es * (one - T::exact(self.d_prime).dv(c))).max(-fy).min(fy);
        let fst = (ecu_es * (depth.dv(c) - one)).max(-fy).min(fy);
        (fsc, fst)
    }

    fn concrete<T: Real>(&self, a: T) -> (T, T) {
        // (block in the web, flange overhang depth min(a, hf))
        let m = a.min(T::exact(self.hf));
        (a, m)
    }

    /// Force residual R(c) (N).
    pub fn residual<T: Real>(&self, beta1: T, c: T) -> T {
        let k = T::lit(0.85) * T::exact(self.fc);
        let (a, m) = self.concrete(beta1 * c);
        let cc = k * (T::exact(self.bw) * a + (T::exact(self.bf) - T::exact(self.bw)) * m);
        let (fsc, fst) = self.strain_c(c, T::exact(self.d));
        cc + T::exact(self.as_c) * fsc - T::exact(self.as_t) * fst
    }

    /// Strength at a given neutral axis depth.
    pub fn at<T: Real>(&self, beta1: T, c: T) -> RcFlexure<T> {
        let k = T::lit(0.85) * T::exact(self.fc);
        let two = T::exact(2.0);
        let d = T::exact(self.d);
        let (a, m) = self.concrete(beta1 * c);
        let (fsc, _) = self.strain_c(c, d);
        let mn = k
            * (T::exact(self.bw) * a * (d - a.dv(two))
                + (T::exact(self.bf) - T::exact(self.bw)) * m * (d - m.dv(two)))
            + T::exact(self.as_c) * fsc * (d - T::exact(self.d_prime));
        let epsilon_t = T::lit(0.003) * (d.dv(c) - T::exact(1.0));
        RcFlexure { mn, a, c, epsilon_t }
    }

    /// Strength at the equilibrium neutral axis. `beta1_f` is the f64 value
    /// of `beta1` (used only to place the search bracket). With no steel
    /// (`(As + As')·fy ≤ 0`) there is no root: Mn = 0, a = c = 0, εt = ∞.
    pub fn strength<T: Real>(&self, beta1: T, beta1_f: f64) -> RcFlexure<T> {
        let s = (self.as_t + self.as_c) * self.fy / (0.85 * self.fc * beta1_f * self.bw);
        if !(s > 0.0) || !s.is_finite() {
            let z = T::exact(0.0);
            return RcFlexure { mn: z, a: z, c: z, epsilon_t: T::exact(f64::INFINITY) };
        }
        // R(c) ≥ 0.85·f'c·β1·bw·c − (As + As')·fy, so the root is below s; at
        // c → 0+ the residual tends to −(As·fy + As'·fy·[d' > 0]) < 0.
        let beta1_64 = beta1_f;
        let c = T::increasing_root(
            |c| self.residual::<f64>(beta1_64, c),
            |c| self.residual::<T>(beta1, c),
            s * 1e-12,
            2.0 * s,
        );
        self.at(beta1, c)
    }
}
