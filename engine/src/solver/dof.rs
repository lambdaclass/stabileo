use std::collections::HashMap;
use crate::model::{Structure, DofConstraint, ElementData};

/// DOF numbering scheme
/// Free DOFs are numbered first (0 to n_free-1)
/// Restrained DOFs are numbered after (n_free to n_total-1)
#[derive(Debug, Clone)]
pub struct DofNumbering {
    /// Maps (node_id, local_dof) -> global_dof_index
    node_dof_map: HashMap<(usize, usize), usize>,
    /// Number of free DOFs
    n_free: usize,
    /// Total number of DOFs
    n_total: usize,
    /// DOFs per node (3 for frames, 2 for trusses)
    dofs_per_node: usize,
    /// Sorted node IDs for consistent ordering
    node_order: Vec<usize>,
}

impl DofNumbering {
    pub fn new(structure: &Structure) -> Self {
        // Determine DOFs per node based on element types
        let has_frames = structure.elements.values()
            .any(|e| matches!(e, ElementData::Frame(_)));
        let dofs_per_node = if has_frames { 3 } else { 2 };

        // Sort nodes for consistent ordering
        let mut node_order: Vec<usize> = structure.nodes.keys().copied().collect();
        node_order.sort();

        let mut node_dof_map = HashMap::new();
        let mut free_dof_idx = 0;
        let mut restrained_dofs = Vec::new();

        // First pass: assign free DOFs
        for &node_id in &node_order {
            let support = structure.get_support_at_node(node_id);

            for local_dof in 0..dofs_per_node {
                let is_restrained = if let Some(sup) = support {
                    match local_dof {
                        0 => sup.ux.is_restrained(),
                        1 => sup.uy.is_restrained(),
                        2 => sup.rz.is_restrained(),
                        _ => false,
                    }
                } else {
                    false
                };

                if is_restrained {
                    restrained_dofs.push((node_id, local_dof));
                } else {
                    node_dof_map.insert((node_id, local_dof), free_dof_idx);
                    free_dof_idx += 1;
                }
            }
        }

        let n_free = free_dof_idx;

        // Second pass: assign restrained DOFs
        for (node_id, local_dof) in restrained_dofs {
            node_dof_map.insert((node_id, local_dof), free_dof_idx);
            free_dof_idx += 1;
        }

        let n_total = free_dof_idx;

        Self {
            node_dof_map,
            n_free,
            n_total,
            dofs_per_node,
            node_order,
        }
    }

    pub fn free_dofs(&self) -> usize {
        self.n_free
    }

    pub fn total_dofs(&self) -> usize {
        self.n_total
    }

    pub fn dofs_per_node(&self) -> usize {
        self.dofs_per_node
    }

    /// Get global DOF index for a node's local DOF
    pub fn global_dof(&self, node_id: usize, local_dof: usize) -> Option<usize> {
        self.node_dof_map.get(&(node_id, local_dof)).copied()
    }

    /// Get all global DOF indices for a node
    pub fn node_dofs(&self, node_id: usize) -> Vec<usize> {
        (0..self.dofs_per_node)
            .filter_map(|d| self.global_dof(node_id, d))
            .collect()
    }

    /// Get global DOF indices for an element
    pub fn element_dofs(&self, node_i: usize, node_j: usize) -> Vec<usize> {
        let mut dofs = Vec::with_capacity(self.dofs_per_node * 2);
        for d in 0..self.dofs_per_node {
            if let Some(idx) = self.global_dof(node_i, d) {
                dofs.push(idx);
            }
        }
        for d in 0..self.dofs_per_node {
            if let Some(idx) = self.global_dof(node_j, d) {
                dofs.push(idx);
            }
        }
        dofs
    }

    /// Check if a DOF is free
    pub fn is_free(&self, global_dof: usize) -> bool {
        global_dof < self.n_free
    }

    /// Get displacement value for a node's DOF from solution vector
    pub fn get_displacement(&self, u: &[f64], node_id: usize, local_dof: usize) -> f64 {
        if local_dof >= self.dofs_per_node {
            return 0.0;
        }
        self.global_dof(node_id, local_dof)
            .map(|idx| u.get(idx).copied().unwrap_or(0.0))
            .unwrap_or(0.0)
    }

    /// Get reaction value for a node's DOF from reaction vector
    pub fn get_reaction(&self, r: &[f64], node_id: usize, local_dof: usize, n_free: usize) -> f64 {
        if local_dof >= self.dofs_per_node {
            return 0.0;
        }
        self.global_dof(node_id, local_dof)
            .filter(|&idx| idx >= n_free)
            .map(|idx| r.get(idx - n_free).copied().unwrap_or(0.0))
            .unwrap_or(0.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Structure;

    #[test]
    fn test_simple_beam_dofs() {
        let mut s = Structure::new("Test");
        let n1 = s.add_node(0.0, 0.0);
        let n2 = s.add_node(6.0, 0.0);
        let mat = s.add_steel();
        let sec = s.add_section("Test", 0.01, 0.0001);
        s.add_frame(n1, n2, mat, sec);
        s.add_pinned_support(n1);
        s.add_roller_x(n2);

        let dof = DofNumbering::new(&s);

        // n1: ux=restrained, uy=restrained, rz=free
        // n2: ux=free, uy=restrained, rz=free
        // Free DOFs: n1.rz, n2.ux, n2.rz = 3
        // Restrained: n1.ux, n1.uy, n2.uy = 3
        assert_eq!(dof.free_dofs(), 3);
        assert_eq!(dof.total_dofs(), 6);
    }
}
