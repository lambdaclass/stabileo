use std::collections::HashMap;
use crate::types::*;

/// DOF numbering: maps (node_id, local_dof) → global equation index.
/// Free DOFs are numbered first (0..n_free-1), restrained DOFs after.
pub struct DofNumbering {
    pub map: HashMap<(usize, usize), usize>,
    pub n_free: usize,
    pub n_total: usize,
    pub dofs_per_node: usize,
    pub node_order: Vec<usize>,
}

impl DofNumbering {
    /// Build DOF numbering for a 2D structure.
    pub fn build_2d(input: &SolverInput) -> Self {
        // Determine DOFs per node: 3 for frames, 2 for all-truss
        let has_frame = input.elements.values().any(|e| e.elem_type == "frame");
        let dofs_per_node = if has_frame { 3 } else { 2 };

        // Sort nodes by ID for deterministic ordering
        let mut node_ids: Vec<usize> = input.nodes.values().map(|n| n.id).collect();
        node_ids.sort();

        // Build support lookup: node_id → support
        let mut support_map: HashMap<usize, &SolverSupport> = HashMap::new();
        for s in input.supports.values() {
            support_map.insert(s.node_id, s);
        }

        // Classify DOFs as free or restrained
        let mut free_dofs = Vec::new();
        let mut fixed_dofs = Vec::new();

        for &node_id in &node_ids {
            for local_dof in 0..dofs_per_node {
                let is_fixed = if let Some(sup) = support_map.get(&node_id) {
                    is_dof_restrained_2d(sup, local_dof)
                } else {
                    false
                };

                if is_fixed {
                    fixed_dofs.push((node_id, local_dof));
                } else {
                    free_dofs.push((node_id, local_dof));
                }
            }
        }

        let n_free = free_dofs.len();
        let n_total = free_dofs.len() + fixed_dofs.len();

        let mut map = HashMap::new();
        for (i, &(node_id, local_dof)) in free_dofs.iter().enumerate() {
            map.insert((node_id, local_dof), i);
        }
        for (i, &(node_id, local_dof)) in fixed_dofs.iter().enumerate() {
            map.insert((node_id, local_dof), n_free + i);
        }

        DofNumbering {
            map,
            n_free,
            n_total,
            dofs_per_node,
            node_order: node_ids,
        }
    }

    /// Build DOF numbering for a 3D structure.
    pub fn build_3d(input: &SolverInput3D) -> Self {
        let has_frame = input.elements.values().any(|e| e.elem_type == "frame");
        let dofs_per_node = if has_frame { 6 } else { 3 };

        let mut node_ids: Vec<usize> = input.nodes.values().map(|n| n.id).collect();
        node_ids.sort();

        let mut support_map: HashMap<usize, &SolverSupport3D> = HashMap::new();
        for s in input.supports.values() {
            support_map.insert(s.node_id, s);
        }

        let mut free_dofs = Vec::new();
        let mut fixed_dofs = Vec::new();

        for &node_id in &node_ids {
            for local_dof in 0..dofs_per_node {
                let is_fixed = if let Some(sup) = support_map.get(&node_id) {
                    is_dof_restrained_3d(sup, local_dof)
                } else {
                    false
                };

                if is_fixed {
                    fixed_dofs.push((node_id, local_dof));
                } else {
                    free_dofs.push((node_id, local_dof));
                }
            }
        }

        let n_free = free_dofs.len();
        let n_total = free_dofs.len() + fixed_dofs.len();

        let mut map = HashMap::new();
        for (i, &(node_id, local_dof)) in free_dofs.iter().enumerate() {
            map.insert((node_id, local_dof), i);
        }
        for (i, &(node_id, local_dof)) in fixed_dofs.iter().enumerate() {
            map.insert((node_id, local_dof), n_free + i);
        }

        DofNumbering {
            map,
            n_free,
            n_total,
            dofs_per_node,
            node_order: node_ids,
        }
    }

    /// Get global DOF index for (node_id, local_dof)
    pub fn global_dof(&self, node_id: usize, local_dof: usize) -> Option<usize> {
        self.map.get(&(node_id, local_dof)).copied()
    }

    /// Get all DOFs for an element (node_i, node_j)
    pub fn element_dofs(&self, node_i: usize, node_j: usize) -> Vec<usize> {
        let mut dofs = Vec::with_capacity(2 * self.dofs_per_node);
        for local in 0..self.dofs_per_node {
            if let Some(&d) = self.map.get(&(node_i, local)) {
                dofs.push(d);
            }
        }
        for local in 0..self.dofs_per_node {
            if let Some(&d) = self.map.get(&(node_j, local)) {
                dofs.push(d);
            }
        }
        dofs
    }
}

fn is_dof_restrained_2d(sup: &SolverSupport, local_dof: usize) -> bool {
    // Check if this DOF has a spring (springs are free DOFs with stiffness added)
    let has_spring = match local_dof {
        0 => sup.kx.unwrap_or(0.0) > 0.0,
        1 => sup.ky.unwrap_or(0.0) > 0.0,
        2 => sup.kz.unwrap_or(0.0) > 0.0,
        _ => false,
    };

    // Springs are NOT restrained — they're free DOFs with added stiffness
    if has_spring && sup.support_type == "spring" {
        return false;
    }

    match sup.support_type.as_str() {
        "fixed" => true,
        "pinned" => local_dof == 0 || local_dof == 1, // ux, uy fixed; rz free
        "rollerX" => local_dof == 1,  // uy fixed (free to slide in X)
        "rollerY" => local_dof == 0,  // ux fixed (free to slide in Y)
        "guidedX" => local_dof == 1 || local_dof == 2, // uy+rz fixed, ux free (sliding clamp)
        "inclinedRoller" => local_dof == 1, // Constrained normal to surface
        "spring" => false,  // All spring DOFs are free (stiffness added to K)
        _ => false,
    }
}

fn is_dof_restrained_3d(sup: &SolverSupport3D, local_dof: usize) -> bool {
    // Check for spring stiffness
    let has_spring = match local_dof {
        0 => sup.kx.unwrap_or(0.0) > 0.0,
        1 => sup.ky.unwrap_or(0.0) > 0.0,
        2 => sup.kz.unwrap_or(0.0) > 0.0,
        3 => sup.krx.unwrap_or(0.0) > 0.0,
        4 => sup.kry.unwrap_or(0.0) > 0.0,
        5 => sup.krz.unwrap_or(0.0) > 0.0,
        _ => false,
    };

    if has_spring {
        return false;
    }

    match local_dof {
        0 => sup.rx,
        1 => sup.ry,
        2 => sup.rz,
        3 => sup.rrx,
        4 => sup.rry,
        5 => sup.rrz,
        _ => false,
    }
}
