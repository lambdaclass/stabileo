//! Conversions between the dimensionless model (L = EI = ρA = 1) and the paper's strip.
use crate::dynamics::T_OSC;
use serde::Serialize;

#[derive(Clone, Copy, Debug, Serialize)]
pub struct Strip {
    pub length: f64,
    pub thickness: f64,
    pub modulus: f64,
    pub density: f64,
}

/// The simulated strip of SM §III (p. 12): L = 108 mm, h = 0.0508 mm, E = 200 GPa, ρ = 8000.
pub const SIMULATIONS: Strip = Strip { length: 0.108, thickness: 0.0000508, modulus: 200e9, density: 8000.0 };
/// The experimental strip (p. 1, p. 7): h = 0.05 mm; ρ is not given and taken from SM §III.
pub const EXPERIMENTS: Strip = Strip { length: 0.108, thickness: 0.00005, modulus: 200e9, density: 8000.0 };

impl Strip {
    pub fn slenderness(&self) -> f64 {
        self.length / self.thickness
    }

    /// t* = L²√(ρbh/B) = (L²/h)√(12ρ/E) (Eq. S5), in s.
    pub fn time_unit(&self) -> f64 {
        self.length * self.length / self.thickness * (12.0 * self.density / self.modulus).sqrt()
    }

    /// |µ̇| per |ΔL̇| (s/m): one unit of µ̇ is a change of µ by one in T_osc·t*.
    pub fn rate_factor(&self, alpha: f64) -> f64 {
        T_OSC * self.time_unit() / (alpha * alpha * self.length)
    }

    /// The clamp's acceleration time (s) in units of T_osc.
    pub fn ramp(&self, seconds: f64) -> f64 {
        seconds / (T_OSC * self.time_unit())
    }
}
