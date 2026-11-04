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
    /// Every `((node, local DOF), global index)` in increasing global index.
    ///
    /// `map` is a `HashMap`, whose iteration order changes with every instance (its hash
    /// keys are random). A floating-point sum taken in that order can differ in the last bit
    /// between two solves of the same model; any loop that ACCUMULATES over the DOFs must
    /// iterate this instead (tests/determinism.rs).
    pub fn entries_by_dof(&self) -> Vec<((usize, usize), usize)> {
        let mut v: Vec<((usize, usize), usize)> = self.map.iter().map(|(&k, &g)| (k, g)).collect();
        v.sort_unstable_by_key(|&((n, l), g)| (g, n, l));
        v
    }

    /// DOFs per node of a 2D model: 3 (ux, uz, θ) with frames, 2 for all-truss.
    pub fn dofs_per_node_2d(input: &SolverInput) -> usize {
        let has_frame = crate::ordered::values(&input.elements).any(|e| e.elem_type == "frame");
        if has_frame { 3 } else { 2 }
    }

    /// DOFs per node of a 3D model: 7 with warping, 6 with frames or shells,
    /// 3 (translations only) otherwise.
    pub fn dofs_per_node_3d(input: &SolverInput3D) -> usize {
        let has_frame = crate::ordered::values(&input.elements).any(|e| e.elem_type == "frame");
        let has_plate = !input.plates.is_empty() || !input.quads.is_empty() || !input.quad9s.is_empty() || !input.curved_shells.is_empty();
        let has_warping = crate::ordered::values(&input.sections).any(|s| s.cw.is_some());
        if has_warping { 7 } else if has_frame || has_plate { 6 } else { 3 }
    }

    /// Build DOF numbering for a 2D structure.
    pub fn build_2d(input: &SolverInput) -> Self {
        let dofs_per_node = Self::dofs_per_node_2d(input);

        // Sort nodes by ID for deterministic ordering
        let mut node_ids: Vec<usize> = crate::ordered::values(&input.nodes).map(|n| n.id).collect();
        node_ids.sort();

        // Supports per node. Several on one node merge by OR (any of them
        // restraining a DOF restrains it); validate_input_2d only lets plain
        // rigid restraints share a node, so the merge is unambiguous.
        let mut supports_at: HashMap<usize, Vec<&SolverSupport>> = HashMap::new();
        for s in crate::ordered::values(&input.supports) {
            supports_at.entry(s.node_id).or_default().push(s);
        }

        // Classify DOFs as free or restrained
        let mut free_dofs = Vec::new();
        let mut fixed_dofs = Vec::new();

        for &node_id in &node_ids {
            for local_dof in 0..dofs_per_node {
                let is_fixed = supports_at
                    .get(&node_id)
                    .is_some_and(|sups| sups.iter().any(|sup| is_dof_restrained_2d(sup, local_dof)));

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
        let dofs_per_node = Self::dofs_per_node_3d(input);

        let mut node_ids: Vec<usize> = crate::ordered::values(&input.nodes).map(|n| n.id).collect();
        node_ids.sort();

        // Merge supports: when multiple supports target the same node,
        // OR their constraint flags together (any support restraining a DOF
        // makes that DOF restrained). Sort supports by ID for determinism.
        let mut sorted_supports: Vec<&SolverSupport3D> = crate::ordered::values(&input.supports).collect();
        sorted_supports.sort_by_key(|s| {
            // Sort by node_id (primary), then by number of restrained DOFs ascending
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
                let is_fixed = match (support_map.get(&node_id), node_restrained.get(&node_id)) {
                    (Some(sup), Some(flags)) => inclined_restrained_3d(sup, local_dof).unwrap_or_else(|| {
                        // Springs make a DOF free (their stiffness is added to K).
                        let k = [sup.kx, sup.ky, sup.kz, sup.krx, sup.kry, sup.krz, sup.kw];
                        // local_dof < dofs_per_node ≤ 7 = flags.len() = k.len().
                        let has_spring = k[local_dof].unwrap_or(0.0) > 0.0;
                        !has_spring && flags[local_dof]
                    }),
                    _ => false,
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

pub(crate) fn is_dof_restrained_2d(sup: &SolverSupport, local_dof: usize) -> bool {
    // A "spring" support leaves every DOF free (its stiffness is added to K);
    // the rigid types restrain theirs whatever spring values they carry.
    match sup.support_type.as_str() {
        "fixed" => true,
        "pinned" => local_dof == 0 || local_dof == 1, // ux, uz fixed; ry free
        "rollerX" => local_dof == 1,  // uz fixed (free to slide in X)
        "rollerY" | "rollerZ" => local_dof == 0,  // ux fixed (free to slide in Z)
        "guidedX" => local_dof == 1 || local_dof == 2, // uz+ry fixed, ux free
        "guidedY" | "guidedZ" => local_dof == 0 || local_dof == 2, // ux+ry fixed
        "inclinedRoller" => local_dof == 1, // Constrained normal to surface
        // "spring" (every DOF free, its stiffness added to K) and "free".
        // validate_input_2d rejects any other type.
        _ => false,
    }
}

/// Restraint of `local_dof` at an inclined support (validate_input_3d rejects
/// `isInclined` without a non-zero normal; assembly rotates only those with
/// one): in the rotated frame DOF 0 is the normal (restrained), 1 and 2 are
/// tangential (free), rotations and warping follow the flags. `None` when the
/// support is not inclined.
fn inclined_restrained_3d(sup: &SolverSupport3D, local_dof: usize) -> Option<bool> {
    if !sup.is_inclined.unwrap_or(false) {
        return None;
    }
    let (Some(nx), Some(ny), Some(nz)) = (sup.normal_x, sup.normal_y, sup.normal_z) else { return None };
    if (nx * nx + ny * ny + nz * nz).sqrt() <= 1e-12 {
        return None;
    }
    Some(match local_dof {
        0 => true,
        3 => sup.rrx,
        4 => sup.rry,
        5 => sup.rrz,
        6 => sup.rw.unwrap_or(false),
        _ => false,
    })
}
