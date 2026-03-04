use serde::{Deserialize, Serialize};

/// Support reaction results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reaction {
    pub node_id: usize,
    /// Reaction force in X direction (kN)
    pub rx: f64,
    /// Reaction force in Y direction (kN)
    pub ry: f64,
    /// Reaction moment about Z axis (kN·m)
    pub mz: f64,
}

impl Reaction {
    pub fn new(node_id: usize, rx: f64, ry: f64, mz: f64) -> Self {
        Self { node_id, rx, ry, mz }
    }

    /// Magnitude of reaction force
    pub fn force_magnitude(&self) -> f64 {
        (self.rx * self.rx + self.ry * self.ry).sqrt()
    }

    /// Angle of reaction force (radians from positive X)
    pub fn force_angle(&self) -> f64 {
        self.ry.atan2(self.rx)
    }
}
