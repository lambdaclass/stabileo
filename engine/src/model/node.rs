use serde::{Deserialize, Serialize};

/// A node in 2D space with coordinates
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub id: usize,
    pub x: f64,
    pub y: f64,
}

impl Node {
    pub fn new(id: usize, x: f64, y: f64) -> Self {
        Self { id, x, y }
    }

    /// Calculate distance to another node
    pub fn distance_to(&self, other: &Node) -> f64 {
        let dx = other.x - self.x;
        let dy = other.y - self.y;
        (dx * dx + dy * dy).sqrt()
    }

    /// Calculate angle to another node (radians, from positive x-axis)
    pub fn angle_to(&self, other: &Node) -> f64 {
        let dx = other.x - self.x;
        let dy = other.y - self.y;
        dy.atan2(dx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_distance() {
        let n1 = Node::new(1, 0.0, 0.0);
        let n2 = Node::new(2, 3.0, 4.0);
        assert!((n1.distance_to(&n2) - 5.0).abs() < 1e-10);
    }

    #[test]
    fn test_angle() {
        let n1 = Node::new(1, 0.0, 0.0);
        let n2 = Node::new(2, 1.0, 1.0);
        let angle = n1.angle_to(&n2);
        assert!((angle - std::f64::consts::FRAC_PI_4).abs() < 1e-10);
    }
}
