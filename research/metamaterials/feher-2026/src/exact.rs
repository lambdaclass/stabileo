//! The inextensible elastica of Section 2.1 solved by shooting, independently of the engine:
//! clamps at ±π/2, variable bending stiffness and weight, a midspan point load, symmetric shape.
use crate::{Strip, LENGTH, THICKNESS, WEIGHT_DENSITY, YOUNG};
use std::f64::consts::FRAC_PI_2;

const STEPS: usize = 4000;

struct Problem<'a> {
    strip: &'a Strip,
    span: f64,
    load: f64,
    weight: f64,
}

impl Problem<'_> {
    fn stiffness(&self, s: f64) -> f64 {
        YOUNG * self.strip.effective_width(s) * THICKNESS.powi(3) / 12.0
    }

    fn line_weight(&self, s: f64) -> f64 {
        self.weight * WEIGHT_DENSITY * THICKNESS * self.strip.material_width(s)
    }

    fn half_weight(&self) -> f64 {
        let h = LENGTH / 2.0 / STEPS as f64;
        (0..STEPS).map(|i| self.line_weight((i as f64 + 0.5) * h)).sum::<f64>() * h
    }

    /// Integrates from the left clamp to midspan; returns (x, z, θ) there.
    fn shoot(&self, nx: f64, m0: f64) -> [f64; 3] {
        let nz0 = -self.half_weight() - self.load / 2.0;
        let f = |s: f64, y: [f64; 5]| {
            let nz = nz0 + y[4];
            [y[2].cos(), y[2].sin(), y[3] / self.stiffness(s), -(y[2].cos() * nz - y[2].sin() * nx), self.line_weight(s)]
        };
        let h = LENGTH / 2.0 / STEPS as f64;
        let mut y = [0.0, 0.0, FRAC_PI_2, m0, 0.0];
        let add = |y: [f64; 5], k: [f64; 5], c: f64| std::array::from_fn::<f64, 5, _>(|j| y[j] + c * k[j]);
        for i in 0..STEPS {
            let s = i as f64 * h;
            let k1 = f(s, y);
            let k2 = f(s + h / 2.0, add(y, k1, h / 2.0));
            let k3 = f(s + h / 2.0, add(y, k2, h / 2.0));
            let k4 = f(s + h, add(y, k3, h));
            y = std::array::from_fn(|j| y[j] + h / 6.0 * (k1[j] + 2.0 * k2[j] + 2.0 * k3[j] + k4[j]));
        }
        [y[0], y[1], y[2]]
    }

    fn residual(&self, p: [f64; 2]) -> [f64; 2] {
        let y = self.shoot(p[0], p[1]);
        [y[2], (y[0] - self.span / 2.0) / LENGTH]
    }

    fn newton(&self, mut p: [f64; 2]) -> Option<[f64; 2]> {
        let norm = |r: [f64; 2]| r[0].hypot(r[1]);
        let mut r = self.residual(p);
        for _ in 0..50 {
            if norm(r) < 1e-12 {
                return Some(p);
            }
            let d = [1e-7 * p[0].abs().max(1e-3), 1e-7 * p[1].abs().max(1e-3)];
            let ra = self.residual([p[0] + d[0], p[1]]);
            let rb = self.residual([p[0], p[1] + d[1]]);
            let j = [[(ra[0] - r[0]) / d[0], (rb[0] - r[0]) / d[1]], [(ra[1] - r[1]) / d[0], (rb[1] - r[1]) / d[1]]];
            let det = j[0][0] * j[1][1] - j[0][1] * j[1][0];
            if !det.is_finite() || det == 0.0 {
                return None;
            }
            let step = [-(j[1][1] * r[0] - j[0][1] * r[1]) / det, -(-j[1][0] * r[0] + j[0][0] * r[1]) / det];
            let mut t = 1.0;
            loop {
                let q = [p[0] + t * step[0], p[1] + t * step[1]];
                let rq = self.residual(q);
                if rq.iter().all(|v| v.is_finite()) && norm(rq) < norm(r) {
                    p = q;
                    r = rq;
                    break;
                }
                t /= 2.0;
                if t < 1e-6 {
                    return None;
                }
            }
        }
        (norm(r) < 1e-10).then_some(p)
    }
}

/// Midpoint height of the unloaded (or point-loaded) symmetric equilibrium on the upper branch,
/// reached by continuation from the uncut, weightless strip in cut depth and weight.
pub fn height(strip: &Strip, span: f64, load: f64) -> Result<f64, String> {
    let bare = Strip { a: strip.a, b: 0.0 };
    let start = Problem { strip: &bare, span, load: 0.0, weight: 0.0 };
    let stiffness = YOUNG * crate::WIDTH * THICKNESS.powi(3) / 12.0;
    let mut best: Option<([f64; 2], f64)> = None;
    for i in 0..=24 {
        for k in 0..=20 {
            let p = [stiffness * (-60.0 + 5.0 * i as f64) / LENGTH.powi(2), stiffness * (-10.0 + k as f64) / LENGTH];
            let r = start.residual(p);
            let n = r[0].hypot(r[1]);
            if n.is_finite() && best.is_none_or(|b| n < b.1) {
                best = Some((p, n));
            }
        }
    }
    let mut p = start.newton(best.ok_or("no starting point")?.0).ok_or("the bare strip did not converge")?;
    let mut last = Problem { strip: &bare, span, load: 0.0, weight: 0.0 };
    let steps = 8;
    let cut: Vec<Strip> = (1..=steps).map(|k| Strip { a: strip.a, b: strip.b * k as f64 / steps as f64 }).collect();
    for (k, c) in cut.iter().enumerate() {
        let t = (k + 1) as f64 / steps as f64;
        last = Problem { strip: c, span, load: load * t, weight: t };
        p = last.newton(p).ok_or_else(|| format!("continuation stopped at {t}"))?;
    }
    Ok(last.shoot(p[0], p[1])[1])
}
