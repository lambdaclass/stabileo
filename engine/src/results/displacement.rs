use serde::{Deserialize, Serialize};

/// Nodal displacement results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Displacement {
    pub node_id: usize,
    /// Displacement in X direction (m)
    pub ux: f64,
    /// Displacement in Y direction (m)
    pub uy: f64,
    /// Rotation about Z axis (rad)
    pub rz: f64,
}

impl Displacement {
    pub fn new(node_id: usize, ux: f64, uy: f64, rz: f64) -> Self {
        Self { node_id, ux, uy, rz }
    }

    /// Magnitude of translational displacement
    pub fn magnitude(&self) -> f64 {
        (self.ux * self.ux + self.uy * self.uy).sqrt()
    }

    /// Convert displacement to mm for display
    pub fn ux_mm(&self) -> f64 {
        self.ux * 1000.0
    }

    pub fn uy_mm(&self) -> f64 {
        self.uy * 1000.0
    }

    /// Convert rotation to degrees for display
    pub fn rz_deg(&self) -> f64 {
        self.rz.to_degrees()
    }
}
