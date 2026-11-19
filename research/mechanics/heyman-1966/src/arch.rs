use serde::{Deserialize, Serialize};
use std::f64::consts::FRAC_PI_2;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Weights {
    True,
    Centreline,
}

/// A circular arch of `n` voussoirs with radial joints. Angles φ run from the left springing
/// (φ = π/2 − α) to the right one; the point at angle φ and radius ρ is (−ρ cos φ, ρ sin φ).
#[derive(Debug, Clone, Copy)]
pub struct Arch {
    pub r: f64,
    pub t: f64,
    pub d: f64,
    pub gamma: f64,
    pub alpha: f64,
    pub n: usize,
    pub weights: Weights,
}

#[derive(Debug, Clone, Copy)]
pub struct Joint {
    pub phi: f64,
    pub mid: [f64; 2],
    /// Normal to the joint plane, towards increasing φ.
    pub normal: [f64; 2],
    pub outward: [f64; 2],
}

#[derive(Debug, Clone, Copy)]
pub struct Block {
    pub weight: f64,
    pub xg: f64,
}

impl Arch {
    pub fn phi(&self, j: usize) -> f64 {
        FRAC_PI_2 - self.alpha + 2.0 * self.alpha * j as f64 / self.n as f64
    }

    pub fn joint(&self, j: usize) -> Joint {
        let phi = self.phi(j);
        let (s, c) = phi.sin_cos();
        Joint { phi, mid: [-self.r * c, self.r * s], normal: [s, c], outward: [-c, s] }
    }

    pub fn blocks(&self) -> Vec<Block> {
        let (ri, re) = (self.r - self.t / 2.0, self.r + self.t / 2.0);
        (0..self.n)
            .map(|k| {
                let (a, b) = (self.phi(k), self.phi(k + 1));
                let (dphi, mid) = (b - a, (a + b) / 2.0);
                let chord = (dphi / 2.0).sin() / (dphi / 2.0);
                let (area, rho) = match self.weights {
                    Weights::True => (dphi / 2.0 * (re * re - ri * ri), 2.0 / 3.0 * (re.powi(3) - ri.powi(3)) / (re * re - ri * ri) * chord),
                    Weights::Centreline => (dphi * self.r * self.t, self.r * chord),
                };
                Block { weight: self.gamma * self.d * area, xg: -rho * mid.cos() }
            })
            .collect()
    }

    pub fn total_weight(&self) -> f64 {
        self.gamma * self.d * 2.0 * self.alpha * self.r * self.t
    }

    /// The block whose extrados contains the point above abscissa `x`, and that point.
    pub fn extrados_point(&self, x: f64) -> (usize, [f64; 2]) {
        let re = self.r + self.t / 2.0;
        let phi = (-x / re).clamp(-1.0, 1.0).acos();
        let k = (0..self.n).find(|&k| phi <= self.phi(k + 1)).unwrap_or(self.n - 1);
        (k, [x, re * phi.sin()])
    }
}
