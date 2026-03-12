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

        // Build support lookup: node_id → support, sorted by ID for determinism.
        // When multiple supports target the same node, the last (highest ID) wins.
        let mut sorted_supports_2d: Vec<&SolverSupport> = input.supports.values().collect();
        sorted_supports_2d.sort_by_key(|s| s.id);
        let mut support_map: HashMap<usize, &SolverSupport> = HashMap::new();
        for s in &sorted_supports_2d {
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
        let has_plate = !input.plates.is_empty() || !input.quads.is_empty() || !input.quad9s.is_empty() || !input.curved_shells.is_empty();
        let has_warping = input.sections.values().any(|s| s.cw.is_some());
        let dofs_per_node = if has_warping { 7 } else if has_frame || has_plate { 6 } else { 3 };

        let mut node_ids: Vec<usize> = input.nodes.values().map(|n| n.id).collect();
        node_ids.sort();

        // Merge supports: when multiple supports target the same node,
        // OR their constraint flags together (any support restraining a DOF
        // makes that DOF restrained). Sort supports by ID for determinism.
        let mut sorted_supports: Vec<&SolverSupport3D> = input.supports.values().collect();
        sorted_supports.sort_by_key(|s| {
            // Sort by node_id (primary), then by number of restrained DOFs descending
            // so the most-restrained support is last (wins on overwrite)
            let n_restrained = [s.rx, s.ry, s.rz, s.rrx, s.rry, s.rrz]
                .iter().filter(|&&b| b).count();
            (s.node_id, n_restrained)
        });
        let mut support_map: HashMap<usize, &SolverSupport3D> = HashMap::new();
        for s in &sorted_supports {
            support_map.insert(s.node_id, s);
        }

        // Build per-node restrained DOF set, merging all supports for the same node
        let mut node_restrained: HashMap<usize, [bool; 7]> = HashMap::new();
        for s in &sorted_supports {
            let entry = node_restrained.entry(s.node_id).or_insert([false; 7]);
            let flags = [s.rx, s.ry, s.rz, s.rrx, s.rry, s.rrz, s.rw.unwrap_or(false)];
            for i in 0..7 {
                entry[i] = entry[i] || flags[i];
            }
        }

        let mut free_dofs = Vec::new();
        let mut fixed_dofs = Vec::new();

        for &node_id in &node_ids {
            for local_dof in 0..dofs_per_node {
                let is_fixed = if let Some(sup) = support_map.get(&node_id) {
                    if sup.is_inclined.unwrap_or(false) {
                        // Inclined supports use the existing function
                        is_dof_restrained_3d(sup, local_dof)
                    } else if let Some(flags) = node_restrained.get(&node_id) {
                        // Check spring stiffness first (springs make DOF free)
                        let has_spring = match local_dof {
                            0 => sup.kx.unwrap_or(0.0) > 0.0,
                            1 => sup.ky.unwrap_or(0.0) > 0.0,
                            2 => sup.kz.unwrap_or(0.0) > 0.0,
                            3 => sup.krx.unwrap_or(0.0) > 0.0,
                            4 => sup.kry.unwrap_or(0.0) > 0.0,
                            5 => sup.krz.unwrap_or(0.0) > 0.0,
                            6 => sup.kw.unwrap_or(0.0) > 0.0,
                            _ => false,
                        };
                        if has_spring { false }
                        else if local_dof < 7 { flags[local_dof] }
                        else { false }
                    } else {
                        false
                    }
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

    /// Get DOFs for a plate element (3 nodes, 6 DOFs each = 18 DOFs).
    pub fn plate_element_dofs(&self, nodes: &[usize; 3]) -> Vec<usize> {
        let mut dofs = Vec::with_capacity(18);
        for &node_id in nodes {
            for local in 0..6 {
                if let Some(&d) = self.map.get(&(node_id, local)) {
                    dofs.push(d);
                }
            }
        }
        dofs
    }

    pub fn quad_element_dofs(&self, nodes: &[usize; 4]) -> Vec<usize> {
        let mut dofs = Vec::with_capacity(24);
        for &node_id in nodes {
            for local in 0..6 {
                if let Some(&d) = self.map.get(&(node_id, local)) {
                    dofs.push(d);
                }
            }
        }
        dofs
    }

    pub fn quad9_element_dofs(&self, nodes: &[usize; 9]) -> Vec<usize> {
        let mut dofs = Vec::with_capacity(54);
        for &node_id in nodes {
            for local in 0..6 {
                if let Some(&d) = self.map.get(&(node_id, local)) {
                    dofs.push(d);
                }
            }
        }
        dofs
    }

    pub fn solid_shell_element_dofs(&self, nodes: &[usize; 8]) -> Vec<usize> {
        let mut dofs = Vec::with_capacity(24);
        for &node_id in nodes {
            for local in 0..3 {
                if let Some(&d) = self.map.get(&(node_id, local)) {
                    dofs.push(d);
                }
            }
        }
        dofs
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
        "guidedY" => local_dof == 0 || local_dof == 2, // ux+rz fixed, uy free (sliding clamp in Y)
        "inclinedRoller" => local_dof == 1, // Constrained normal to surface
        "spring" => false,  // All spring DOFs are free (stiffness added to K)
        _ => false,
    }
}

fn is_dof_restrained_3d(sup: &SolverSupport3D, local_dof: usize) -> bool {
    // Inclined supports: in rotated frame, DOF 0 = normal direction (restrained),
    // DOFs 1,2 = tangential (free). Rotational DOFs use standard flags.
    if sup.is_inclined.unwrap_or(false) {
        if let (Some(nx), Some(ny), Some(nz)) = (sup.normal_x, sup.normal_y, sup.normal_z) {
            let n_len = (nx * nx + ny * ny + nz * nz).sqrt();
            if n_len > 1e-12 {
                return match local_dof {
                    0 => true,          // Normal direction — restrained
                    1 | 2 => false,     // Tangential — free
                    3 => sup.rrx,
                    4 => sup.rry,
                    5 => sup.rrz,
                    6 => sup.rw.unwrap_or(false),
                    _ => false,
                };
            }
        }
    }

    // Check for spring stiffness
    let has_spring = match local_dof {
        0 => sup.kx.unwrap_or(0.0) > 0.0,
        1 => sup.ky.unwrap_or(0.0) > 0.0,
        2 => sup.kz.unwrap_or(0.0) > 0.0,
        3 => sup.krx.unwrap_or(0.0) > 0.0,
        4 => sup.kry.unwrap_or(0.0) > 0.0,
        5 => sup.krz.unwrap_or(0.0) > 0.0,
        6 => sup.kw.unwrap_or(0.0) > 0.0,
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
        6 => sup.rw.unwrap_or(false),
        _ => false,
    }
}
