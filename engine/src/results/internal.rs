use serde::{Deserialize, Serialize};

/// Internal forces for an element
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementForces {
    pub element_id: usize,
    /// Axial force at start (kN) - positive = tension
    pub n_start: f64,
    /// Axial force at end (kN)
    pub n_end: f64,
    /// Shear force at start (kN)
    pub v_start: f64,
    /// Shear force at end (kN)
    pub v_end: f64,
    /// Bending moment at start (kN·m)
    pub m_start: f64,
    /// Bending moment at end (kN·m)
    pub m_end: f64,
    /// Element length (m)
    pub length: f64,
}

impl ElementForces {
    /// Get internal forces at a position along the element
    /// x: position from start (0 to length)
    /// Returns (N, V, M) at position x
    pub fn at_position(&self, x: f64) -> (f64, f64, f64) {
        let l = self.length;
        let t = x / l;

        // Linear interpolation for N (assuming no distributed axial load)
        let n = self.n_start + (self.n_end - self.n_start) * t;

        // For V and M, we need to know if there are distributed loads
        // Without that info, assume linear V and parabolic M between end values
        // This is a simplification - proper implementation needs load info

        // If no distributed load: V is constant, M is linear
        // V = V_start (constant for point loads only)
        let v = self.v_start;

        // M at position x (linear between ends for no distributed load)
        let m = self.m_start + (self.m_end - self.m_start) * t;

        (n, v, m)
    }

    /// Generate points for diagram plotting
    /// Returns Vec<(x, n, v, m)> for plotting
    pub fn diagram_points(&self, num_points: usize) -> Vec<(f64, f64, f64, f64)> {
        let mut points = Vec::with_capacity(num_points);
        for i in 0..num_points {
            let x = self.length * (i as f64) / ((num_points - 1) as f64);
            let (n, v, m) = self.at_position(x);
            points.push((x, n, v, m));
        }
        points
    }

    /// Maximum absolute moment in element
    pub fn max_moment(&self) -> f64 {
        self.m_start.abs().max(self.m_end.abs())
    }

    /// Maximum absolute shear in element
    pub fn max_shear(&self) -> f64 {
        self.v_start.abs().max(self.v_end.abs())
    }

    /// Maximum absolute axial in element
    pub fn max_axial(&self) -> f64 {
        self.n_start.abs().max(self.n_end.abs())
    }
}

/// Extended internal forces with distributed load information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementForcesDetailed {
    pub basic: ElementForces,
    /// Distributed transverse load (kN/m)
    pub q: f64,
    /// Distributed axial load (kN/m)
    pub qx: f64,
}

impl ElementForcesDetailed {
    /// Get internal forces at position x considering distributed loads
    pub fn at_position(&self, x: f64) -> (f64, f64, f64) {
        let l = self.basic.length;

        // Axial: N(x) = N_start + qx * x
        let n = self.basic.n_start + self.qx * x;

        // Shear: V(x) = V_start - q * x
        let v = self.basic.v_start - self.q * x;

        // Moment: M(x) = M_start + V_start * x - q * x² / 2
        let m = self.basic.m_start + self.basic.v_start * x - self.q * x * x / 2.0;

        (n, v, m)
    }

    /// Find position of maximum moment (where V = 0)
    pub fn max_moment_position(&self) -> Option<f64> {
        if self.q.abs() < 1e-10 {
            // No distributed load - max at ends
            return None;
        }

        // V(x) = 0 => V_start = q * x => x = V_start / q
        let x = self.basic.v_start / self.q;

        if x > 0.0 && x < self.basic.length {
            Some(x)
        } else {
            None
        }
    }

    /// Compute maximum moment (including interior point if applicable)
    pub fn compute_max_moment(&self) -> f64 {
        let mut max = self.basic.m_start.abs().max(self.basic.m_end.abs());

        if let Some(x) = self.max_moment_position() {
            let (_, _, m) = self.at_position(x);
            max = max.max(m.abs());
        }

        max
    }
}
