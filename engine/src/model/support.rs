use serde::{Deserialize, Serialize};

/// Constraint type for a single DOF
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum DofConstraint {
    /// Free to move
    Free,
    /// Fully restrained
    Fixed,
    /// Spring with stiffness k
    Spring(f64),
    /// Prescribed displacement
    Prescribed(f64),
}

impl DofConstraint {
    pub fn is_free(&self) -> bool {
        matches!(self, DofConstraint::Free)
    }

    pub fn is_restrained(&self) -> bool {
        !self.is_free()
    }
}

/// Support conditions at a node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Support {
    pub id: usize,
    pub node_id: usize,
    /// Constraint in X direction
    pub ux: DofConstraint,
    /// Constraint in Y direction
    pub uy: DofConstraint,
    /// Constraint for rotation about Z
    pub rz: DofConstraint,
}

impl Support {
    pub fn new(id: usize, node_id: usize) -> Self {
        Self {
            id,
            node_id,
            ux: DofConstraint::Free,
            uy: DofConstraint::Free,
            rz: DofConstraint::Free,
        }
    }

    /// Fixed support (empotrado)
    pub fn fixed(id: usize, node_id: usize) -> Self {
        Self {
            id,
            node_id,
            ux: DofConstraint::Fixed,
            uy: DofConstraint::Fixed,
            rz: DofConstraint::Fixed,
        }
    }

    /// Pinned support (articulado)
    pub fn pinned(id: usize, node_id: usize) -> Self {
        Self {
            id,
            node_id,
            ux: DofConstraint::Fixed,
            uy: DofConstraint::Fixed,
            rz: DofConstraint::Free,
        }
    }

    /// Roller support (móvil) - free in X, fixed in Y
    pub fn roller_x(id: usize, node_id: usize) -> Self {
        Self {
            id,
            node_id,
            ux: DofConstraint::Free,
            uy: DofConstraint::Fixed,
            rz: DofConstraint::Free,
        }
    }

    /// Roller support - free in Y, fixed in X
    pub fn roller_y(id: usize, node_id: usize) -> Self {
        Self {
            id,
            node_id,
            ux: DofConstraint::Fixed,
            uy: DofConstraint::Free,
            rz: DofConstraint::Free,
        }
    }

    /// Custom support with explicit constraints
    pub fn custom(id: usize, node_id: usize, ux: DofConstraint, uy: DofConstraint, rz: DofConstraint) -> Self {
        Self { id, node_id, ux, uy, rz }
    }

    /// Get constraints as array [ux, uy, rz]
    pub fn constraints(&self) -> [DofConstraint; 3] {
        [self.ux, self.uy, self.rz]
    }

    /// Get constraints for truss (only [ux, uy])
    pub fn constraints_truss(&self) -> [DofConstraint; 2] {
        [self.ux, self.uy]
    }

    /// Check if any DOF is restrained
    pub fn has_restraint(&self) -> bool {
        self.ux.is_restrained() || self.uy.is_restrained() || self.rz.is_restrained()
    }

    /// Count number of restrained DOFs
    pub fn restrained_count(&self) -> usize {
        let mut count = 0;
        if self.ux.is_restrained() { count += 1; }
        if self.uy.is_restrained() { count += 1; }
        if self.rz.is_restrained() { count += 1; }
        count
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fixed_support() {
        let sup = Support::fixed(1, 1);
        assert_eq!(sup.restrained_count(), 3);
        assert!(sup.ux.is_restrained());
        assert!(sup.uy.is_restrained());
        assert!(sup.rz.is_restrained());
    }

    #[test]
    fn test_pinned_support() {
        let sup = Support::pinned(1, 1);
        assert_eq!(sup.restrained_count(), 2);
        assert!(sup.rz.is_free());
    }

    #[test]
    fn test_roller_support() {
        let sup = Support::roller_x(1, 1);
        assert_eq!(sup.restrained_count(), 1);
        assert!(sup.ux.is_free());
        assert!(sup.uy.is_restrained());
    }
}
