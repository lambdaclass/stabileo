/// Sparse assembly helpers for the FEA engine.
///
/// Provides a `TripletAssembly` struct for collecting COO triplets during
/// element assembly, and functions for sparse 2D assembly (both serial
/// and parallel via rayon).

use crate::types::*;
use crate::element::*;
use crate::linalg::transform_stiffness;
use crate::linalg::sparse::CscMatrix;
use super::dof::DofNumbering;
use super::assembly::assemble_element_loads_2d;

/// COO triplet accumulator for building sparse matrices.
///
/// Collects (row, col, value) entries during element assembly, then
/// converts to CSC format in one shot.
pub struct TripletAssembly {
    /// Matrix dimension (n x n).
    pub n: usize,
    /// Row indices of stored entries.
    pub rows: Vec<usize>,
    /// Column indices of stored entries.
    pub cols: Vec<usize>,
    /// Values of stored entries.
    pub vals: Vec<f64>,
}

impl TripletAssembly {
    /// Create a new triplet assembly for an n x n matrix.
    pub fn new(n: usize) -> Self {
        TripletAssembly {
            n,
            rows: Vec::new(),
            cols: Vec::new(),
            vals: Vec::new(),
        }
    }

    /// Create with pre-allocated capacity for `capacity` triplets.
    pub fn with_capacity(n: usize, capacity: usize) -> Self {
        TripletAssembly {
            n,
            rows: Vec::with_capacity(capacity),
            cols: Vec::with_capacity(capacity),
            vals: Vec::with_capacity(capacity),
        }
    }

    /// Add a single triplet (row, col, value).
    pub fn add(&mut self, row: usize, col: usize, val: f64) {
        self.rows.push(row);
        self.cols.push(col);
        self.vals.push(val);
    }

    /// Merge another TripletAssembly into this one.
    /// Both must have the same dimension n.
    pub fn merge(&mut self, other: &TripletAssembly) {
        debug_assert_eq!(self.n, other.n);
        self.rows.extend_from_slice(&other.rows);
        self.cols.extend_from_slice(&other.cols);
        self.vals.extend_from_slice(&other.vals);
    }

    /// Number of stored triplets.
    pub fn len(&self) -> usize {
        self.rows.len()
    }

    /// Whether there are no stored triplets.
    pub fn is_empty(&self) -> bool {
        self.rows.is_empty()
    }

    /// Convert to CSC matrix. Duplicate entries at the same (row, col) are summed.
    /// The CscMatrix stores only the lower triangle for symmetric matrices.
    pub fn to_csc(&self) -> CscMatrix {
        CscMatrix::from_triplets(self.n, &self.rows, &self.cols, &self.vals)
    }
}

/// Result of sparse triplet assembly: triplet accumulator + force vector.
pub struct TripletAssemblyResult {
    /// Triplet accumulator for the free-DOF stiffness block.
    pub triplets: TripletAssembly,
    /// Global force vector (length n_total).
    pub f: Vec<f64>,
    /// Maximum diagonal stiffness value.
    pub max_diag_k: f64,
    /// DOFs where artificial stiffness was added.
    pub artificial_dofs: Vec<usize>,
}

/// Assemble 2D stiffness using triplet format, mirroring `assemble_sparse_2d`
/// but returning a `TripletAssembly` instead of a finished `CscMatrix`.
///
/// This allows downstream code to add more triplets (e.g., from constraints)
/// before the final CSC conversion.
pub fn assemble_2d_sparse(input: &SolverInput, dof_num: &DofNumbering) -> TripletAssemblyResult {
    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let mut f_global = vec![0.0; n];
    let mut triplets = TripletAssembly::new(nf);
    let mut max_diag = 0.0f64;
    let mut diag_vals = vec![0.0f64; nf];

    // Pre-build O(1) lookup maps
    let node_map: std::collections::HashMap<usize, &SolverNode> =
        input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();
    let sec_map: std::collections::HashMap<usize, &SolverSection> =
        input.sections.values().map(|s| (s.id, s)).collect();

    for elem in input.elements.values() {
        let node_i = node_map[&elem.node_i];
        let node_j = node_map[&elem.node_j];
        let mat = mat_map[&elem.material_id];
        let sec = sec_map[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;
        let e = mat.e * 1000.0;

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            let k_elem = truss_global_stiffness_2d(e, sec.a, l, cos, sin);
            let truss_dofs = [
                dof_num.global_dof(elem.node_i, 0).unwrap(),
                dof_num.global_dof(elem.node_i, 1).unwrap(),
                dof_num.global_dof(elem.node_j, 0).unwrap(),
                dof_num.global_dof(elem.node_j, 1).unwrap(),
            ];
            for i in 0..4 {
                if truss_dofs[i] >= nf { continue; }
                for j in 0..4 {
                    if truss_dofs[j] >= nf { continue; }
                    let gi = truss_dofs[i];
                    let gj = truss_dofs[j];
                    if gi >= gj {
                        triplets.add(gi, gj, k_elem[i * 4 + j]);
                    }
                }
                diag_vals[truss_dofs[i]] += k_elem[i * 4 + i];
            }
        } else {
            let k_local = frame_local_stiffness_2d(e, sec.a, sec.iz, l, elem.hinge_start, elem.hinge_end, 0.0);
            let t = frame_transform_2d(cos, sin);
            let k_glob = transform_stiffness(&k_local, &t, 6);
            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            let ndof = elem_dofs.len();

            for i in 0..ndof {
                if elem_dofs[i] >= nf { continue; }
                for j in 0..ndof {
                    if elem_dofs[j] >= nf { continue; }
                    let gi = elem_dofs[i];
                    let gj = elem_dofs[j];
                    if gi >= gj {
                        triplets.add(gi, gj, k_glob[i * ndof + j]);
                    }
                }
                diag_vals[elem_dofs[i]] += k_glob[i * ndof + i];
            }

            assemble_element_loads_2d(input, elem, &k_local, &t, l, e, sec, node_i, &elem_dofs, &mut f_global);
        }
    }

    // Nodal loads
    for load in &input.loads {
        if let SolverLoad::Nodal(nl) = load {
            if let Some(&d) = dof_num.map.get(&(nl.node_id, 0)) { f_global[d] += nl.fx; }
            if let Some(&d) = dof_num.map.get(&(nl.node_id, 1)) { f_global[d] += nl.fy; }
            if dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(nl.node_id, 2)) { f_global[d] += nl.mz; }
            }
        }
    }

    // Spring stiffness
    for sup in input.supports.values() {
        if let Some(kx) = sup.kx {
            if kx > 0.0 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 0)) {
                    if d < nf { triplets.add(d, d, kx); diag_vals[d] += kx; }
                }
            }
        }
        if let Some(ky) = sup.ky {
            if ky > 0.0 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
                    if d < nf { triplets.add(d, d, ky); diag_vals[d] += ky; }
                }
            }
        }
        if let Some(kz) = sup.kz {
            if kz > 0.0 && dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 2)) {
                    if d < nf { triplets.add(d, d, kz); diag_vals[d] += kz; }
                }
            }
        }
    }

    for d in &diag_vals[..nf] { max_diag = max_diag.max(d.abs()); }

    // Artificial rotational stiffness
    let mut artificial_dofs = Vec::new();
    if dof_num.dofs_per_node >= 3 {
        let artificial_k = if max_diag > 0.0 { max_diag * 1e-10 } else { 1e-6 };
        let mut node_hinge_count: std::collections::HashMap<usize, usize> = std::collections::HashMap::new();
        let mut node_frame_count: std::collections::HashMap<usize, usize> = std::collections::HashMap::new();
        for elem in input.elements.values() {
            if elem.elem_type != "frame" { continue; }
            *node_frame_count.entry(elem.node_i).or_insert(0) += 1;
            *node_frame_count.entry(elem.node_j).or_insert(0) += 1;
            if elem.hinge_start { *node_hinge_count.entry(elem.node_i).or_insert(0) += 1; }
            if elem.hinge_end { *node_hinge_count.entry(elem.node_j).or_insert(0) += 1; }
        }
        let mut rot_restrained: std::collections::HashSet<usize> = std::collections::HashSet::new();
        for sup in input.supports.values() {
            if sup.support_type == "fixed" || sup.support_type == "guidedX" || sup.support_type == "guidedY" { rot_restrained.insert(sup.node_id); }
            if sup.support_type == "spring" && sup.kz.unwrap_or(0.0) > 0.0 { rot_restrained.insert(sup.node_id); }
        }
        for (&node_id, &hinges) in &node_hinge_count {
            let frames = *node_frame_count.get(&node_id).unwrap_or(&0);
            if hinges >= frames && frames >= 1 && !rot_restrained.contains(&node_id) {
                if let Some(&idx) = dof_num.map.get(&(node_id, 2)) {
                    if idx < nf {
                        triplets.add(idx, idx, artificial_k);
                        artificial_dofs.push(idx);
                    }
                }
            }
        }
    }

    TripletAssemblyResult {
        triplets,
        f: f_global,
        max_diag_k: max_diag,
        artificial_dofs,
    }
}

/// Element-level stiffness data produced by a single element.
#[cfg(feature = "parallel")]
struct ElementContribution {
    /// (global_row, global_col, value) triplets for lower triangle of Kff.
    triplets: Vec<(usize, usize, f64)>,
    /// Diagonal contributions for conditioning tracking.
    diag_contributions: Vec<(usize, f64)>,
    /// Force vector contributions: (global_dof, value).
    force_contributions: Vec<(usize, f64)>,
}

/// Parallel 2D assembly using rayon.
///
/// Each element computes its stiffness independently, collecting local triplets.
/// After the parallel phase, triplets are merged and nodal loads / springs /
/// artificial stiffness are added sequentially.
#[cfg(feature = "parallel")]
pub fn assemble_elements_parallel_2d(input: &SolverInput, dof_num: &DofNumbering) -> TripletAssemblyResult {
    use rayon::prelude::*;

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Pre-build O(1) lookup maps
    let node_map: std::collections::HashMap<usize, &SolverNode> =
        input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();
    let sec_map: std::collections::HashMap<usize, &SolverSection> =
        input.sections.values().map(|s| (s.id, s)).collect();

    // Collect elements into a Vec for parallel iteration
    let elements: Vec<&SolverElement> = input.elements.values().collect();

    // Parallel element loop: each element produces local contributions
    let contributions: Vec<ElementContribution> = elements.par_iter().map(|elem| {
        let node_i = node_map[&elem.node_i];
        let node_j = node_map[&elem.node_j];
        let mat = mat_map[&elem.material_id];
        let sec = sec_map[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;
        let e = mat.e * 1000.0;

        let mut local_triplets = Vec::new();
        let mut local_diag = Vec::new();
        let mut local_forces = Vec::new();

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            let k_elem = truss_global_stiffness_2d(e, sec.a, l, cos, sin);
            let truss_dofs = [
                dof_num.global_dof(elem.node_i, 0).unwrap(),
                dof_num.global_dof(elem.node_i, 1).unwrap(),
                dof_num.global_dof(elem.node_j, 0).unwrap(),
                dof_num.global_dof(elem.node_j, 1).unwrap(),
            ];
            for i in 0..4 {
                if truss_dofs[i] >= nf { continue; }
                for j in 0..4 {
                    if truss_dofs[j] >= nf { continue; }
                    let gi = truss_dofs[i];
                    let gj = truss_dofs[j];
                    if gi >= gj {
                        local_triplets.push((gi, gj, k_elem[i * 4 + j]));
                    }
                }
                local_diag.push((truss_dofs[i], k_elem[i * 4 + i]));
            }
        } else {
            let k_local = frame_local_stiffness_2d(e, sec.a, sec.iz, l, elem.hinge_start, elem.hinge_end, 0.0);
            let t = frame_transform_2d(cos, sin);
            let k_glob = transform_stiffness(&k_local, &t, 6);
            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            let ndof = elem_dofs.len();

            for i in 0..ndof {
                if elem_dofs[i] >= nf { continue; }
                for j in 0..ndof {
                    if elem_dofs[j] >= nf { continue; }
                    let gi = elem_dofs[i];
                    let gj = elem_dofs[j];
                    if gi >= gj {
                        local_triplets.push((gi, gj, k_glob[i * ndof + j]));
                    }
                }
                local_diag.push((elem_dofs[i], k_glob[i * ndof + i]));
            }

            // Compute FEF contributions for this element
            for load in &input.loads {
                match load {
                    SolverLoad::Distributed(dl) if dl.element_id == elem.id => {
                        let a = dl.a.unwrap_or(0.0);
                        let b = dl.b.unwrap_or(l);
                        let is_full = (a.abs() < 1e-12) && ((b - l).abs() < 1e-12);
                        let mut fef = if is_full {
                            fef_distributed_2d(dl.q_i, dl.q_j, l)
                        } else {
                            fef_partial_distributed_2d(dl.q_i, dl.q_j, a, b, l)
                        };
                        adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end);
                        let fef_global = transform_force(&fef, &t, 6);
                        for (i, &dof) in elem_dofs.iter().enumerate() {
                            local_forces.push((dof, fef_global[i]));
                        }
                    }
                    SolverLoad::PointOnElement(pl) if pl.element_id == elem.id => {
                        let px = pl.px.unwrap_or(0.0);
                        let mz = pl.mz.unwrap_or(0.0);
                        let mut fef = fef_point_load_2d(pl.p, px, mz, pl.a, l);
                        adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end);
                        let fef_global = transform_force(&fef, &t, 6);
                        for (i, &dof) in elem_dofs.iter().enumerate() {
                            local_forces.push((dof, fef_global[i]));
                        }
                    }
                    SolverLoad::Thermal(tl) if tl.element_id == elem.id => {
                        let alpha = 12e-6;
                        let h = if sec.a > 1e-15 { (12.0 * sec.iz / sec.a).sqrt() } else { 0.1 };
                        let mut fef = fef_thermal_2d(
                            e, sec.a, sec.iz, l,
                            tl.dt_uniform, tl.dt_gradient, alpha, h,
                        );
                        adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end);
                        let fef_global = transform_force(&fef, &t, 6);
                        for (i, &dof) in elem_dofs.iter().enumerate() {
                            local_forces.push((dof, fef_global[i]));
                        }
                    }
                    _ => {}
                }
            }
        }

        ElementContribution {
            triplets: local_triplets,
            diag_contributions: local_diag,
            force_contributions: local_forces,
        }
    }).collect();

    // Merge contributions
    let mut triplets = TripletAssembly::new(nf);
    let mut f_global = vec![0.0; n];
    let mut diag_vals = vec![0.0f64; nf];
    let mut max_diag = 0.0f64;

    for contrib in &contributions {
        for &(r, c, v) in &contrib.triplets {
            triplets.add(r, c, v);
        }
        for &(d, v) in &contrib.diag_contributions {
            diag_vals[d] += v;
        }
        for &(d, v) in &contrib.force_contributions {
            f_global[d] += v;
        }
    }

    // Nodal loads (sequential)
    for load in &input.loads {
        if let SolverLoad::Nodal(nl) = load {
            if let Some(&d) = dof_num.map.get(&(nl.node_id, 0)) { f_global[d] += nl.fx; }
            if let Some(&d) = dof_num.map.get(&(nl.node_id, 1)) { f_global[d] += nl.fy; }
            if dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(nl.node_id, 2)) { f_global[d] += nl.mz; }
            }
        }
    }

    // Spring stiffness (sequential)
    for sup in input.supports.values() {
        if let Some(kx) = sup.kx {
            if kx > 0.0 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 0)) {
                    if d < nf { triplets.add(d, d, kx); diag_vals[d] += kx; }
                }
            }
        }
        if let Some(ky) = sup.ky {
            if ky > 0.0 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
                    if d < nf { triplets.add(d, d, ky); diag_vals[d] += ky; }
                }
            }
        }
        if let Some(kz) = sup.kz {
            if kz > 0.0 && dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 2)) {
                    if d < nf { triplets.add(d, d, kz); diag_vals[d] += kz; }
                }
            }
        }
    }

    for d in &diag_vals[..nf] { max_diag = max_diag.max(d.abs()); }

    // Artificial rotational stiffness (sequential)
    let mut artificial_dofs = Vec::new();
    if dof_num.dofs_per_node >= 3 {
        let artificial_k = if max_diag > 0.0 { max_diag * 1e-10 } else { 1e-6 };
        let mut node_hinge_count: std::collections::HashMap<usize, usize> = std::collections::HashMap::new();
        let mut node_frame_count: std::collections::HashMap<usize, usize> = std::collections::HashMap::new();
        for elem in input.elements.values() {
            if elem.elem_type != "frame" { continue; }
            *node_frame_count.entry(elem.node_i).or_insert(0) += 1;
            *node_frame_count.entry(elem.node_j).or_insert(0) += 1;
            if elem.hinge_start { *node_hinge_count.entry(elem.node_i).or_insert(0) += 1; }
            if elem.hinge_end { *node_hinge_count.entry(elem.node_j).or_insert(0) += 1; }
        }
        let mut rot_restrained: std::collections::HashSet<usize> = std::collections::HashSet::new();
        for sup in input.supports.values() {
            if sup.support_type == "fixed" || sup.support_type == "guidedX" || sup.support_type == "guidedY" { rot_restrained.insert(sup.node_id); }
            if sup.support_type == "spring" && sup.kz.unwrap_or(0.0) > 0.0 { rot_restrained.insert(sup.node_id); }
        }
        for (&node_id, &hinges) in &node_hinge_count {
            let frames = *node_frame_count.get(&node_id).unwrap_or(&0);
            if hinges >= frames && frames >= 1 && !rot_restrained.contains(&node_id) {
                if let Some(&idx) = dof_num.map.get(&(node_id, 2)) {
                    if idx < nf {
                        triplets.add(idx, idx, artificial_k);
                        artificial_dofs.push(idx);
                    }
                }
            }
        }
    }

    TripletAssemblyResult {
        triplets,
        f: f_global,
        max_diag_k: max_diag,
        artificial_dofs,
    }
}

/// Non-parallel fallback for `assemble_elements_parallel_2d`.
/// Always available regardless of feature flags.
#[cfg(not(feature = "parallel"))]
pub fn assemble_elements_parallel_2d(input: &SolverInput, dof_num: &DofNumbering) -> TripletAssemblyResult {
    // Fall back to serial assembly when rayon is not available
    assemble_2d_sparse(input, dof_num)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn make_simple_beam() -> SolverInput {
        let mut nodes = HashMap::new();
        nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, y: 0.0 });
        nodes.insert("2".to_string(), SolverNode { id: 2, x: 5.0, y: 0.0 });

        let mut materials = HashMap::new();
        materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".to_string(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });

        let mut elements = HashMap::new();
        elements.insert("1".to_string(), SolverElement {
            id: 1,
            elem_type: "frame".to_string(),
            node_i: 1,
            node_j: 2,
            material_id: 1,
            section_id: 1,
            hinge_start: false,
            hinge_end: false,
        });

        let mut supports = HashMap::new();
        supports.insert("1".to_string(), SolverSupport {
            id: 1,
            node_id: 1,
            support_type: "fixed".to_string(),
            kx: None, ky: None, kz: None,
            dx: None, dy: None, drz: None,
            angle: None,
        });
        supports.insert("2".to_string(), SolverSupport {
            id: 2,
            node_id: 2,
            support_type: "pinned".to_string(),
            kx: None, ky: None, kz: None,
            dx: None, dy: None, drz: None,
            angle: None,
        });

        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: 0.0,
            fy: -10.0,
            mz: 0.0,
        })];

        SolverInput {
            nodes,
            materials,
            sections,
            elements,
            supports,
            loads,
            constraints: vec![],
            connectors: HashMap::new(),
        }
    }

    #[test]
    fn test_triplet_assembly_basic() {
        let mut ta = TripletAssembly::new(3);
        ta.add(0, 0, 10.0);
        ta.add(1, 0, 2.0);
        ta.add(1, 1, 8.0);
        ta.add(2, 2, 6.0);
        assert_eq!(ta.len(), 4);

        let csc = ta.to_csc();
        assert_eq!(csc.n, 3);
        let dense = csc.to_dense_symmetric();
        assert!((dense[0] - 10.0).abs() < 1e-14);
        assert!((dense[4] - 8.0).abs() < 1e-14);
        assert!((dense[8] - 6.0).abs() < 1e-14);
    }

    #[test]
    fn test_triplet_merge() {
        let mut ta1 = TripletAssembly::new(2);
        ta1.add(0, 0, 5.0);
        ta1.add(1, 1, 3.0);

        let mut ta2 = TripletAssembly::new(2);
        ta2.add(0, 0, 2.0);
        ta2.add(1, 0, 1.0);

        ta1.merge(&ta2);
        assert_eq!(ta1.len(), 4);

        let csc = ta1.to_csc();
        let dense = csc.to_dense_symmetric();
        // (0,0) = 5+2 = 7
        assert!((dense[0] - 7.0).abs() < 1e-14);
        // (1,1) = 3
        assert!((dense[3] - 3.0).abs() < 1e-14);
    }

    #[test]
    fn test_assemble_2d_sparse_matches_existing() {
        let input = make_simple_beam();
        let dof_num = DofNumbering::build_2d(&input);

        // Use our new sparse assembly
        let result = assemble_2d_sparse(&input, &dof_num);
        let csc = result.triplets.to_csc();

        // Use existing sparse assembly
        let existing = super::super::assembly::assemble_sparse_2d(&input, &dof_num);

        // Compare dense representations
        let dense_new = csc.to_dense_symmetric();
        let dense_existing = existing.k_ff.to_dense_symmetric();

        assert_eq!(dense_new.len(), dense_existing.len());
        for i in 0..dense_new.len() {
            assert!(
                (dense_new[i] - dense_existing[i]).abs() < 1e-10,
                "Mismatch at index {}: {} vs {}",
                i, dense_new[i], dense_existing[i]
            );
        }
    }

    #[test]
    fn test_assemble_parallel_matches_serial() {
        let input = make_simple_beam();
        let dof_num = DofNumbering::build_2d(&input);

        let serial = assemble_2d_sparse(&input, &dof_num);
        let parallel = assemble_elements_parallel_2d(&input, &dof_num);

        let csc_serial = serial.triplets.to_csc();
        let csc_parallel = parallel.triplets.to_csc();

        let dense_s = csc_serial.to_dense_symmetric();
        let dense_p = csc_parallel.to_dense_symmetric();

        assert_eq!(dense_s.len(), dense_p.len());
        for i in 0..dense_s.len() {
            assert!(
                (dense_s[i] - dense_p[i]).abs() < 1e-10,
                "Mismatch at index {}: {} vs {}",
                i, dense_s[i], dense_p[i]
            );
        }
    }
}
