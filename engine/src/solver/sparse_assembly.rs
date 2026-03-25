/// Sparse assembly helpers for the FEA engine.
///
/// Provides a `TripletAssembly` struct for collecting COO triplets during
/// element assembly, and functions for sparse 2D assembly (both serial
/// and parallel via rayon).

use crate::types::*;
use crate::element::*;
use crate::linalg::transform_stiffness;
#[cfg(feature = "parallel")]
use crate::linalg::transform_force;
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
        let dy = node_j.z - node_i.z;
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
            if let Some(&d) = dof_num.map.get(&(nl.node_id, 1)) { f_global[d] += nl.fz; }
            if dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(nl.node_id, 2)) { f_global[d] += nl.my; }
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
        let dy = node_j.z - node_i.z;
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
                        let mz = pl.my.unwrap_or(0.0);
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
            if let Some(&d) = dof_num.map.get(&(nl.node_id, 1)) { f_global[d] += nl.fz; }
            if dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(nl.node_id, 2)) { f_global[d] += nl.my; }
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

// ─── 3D Parallel Assembly ────────────────────────────────

use super::assembly::SparseAssemblyResult3D;

#[cfg(feature = "parallel")]
use super::assembly::{InclinedTransformData, apply_inclined_transform_triplets, inclined_rotation_matrix};

#[cfg(feature = "parallel")]
const DOF_MAP_12_TO_14: [usize; 12] = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];

/// Per-element output from the parallel phase (SoA layout for fast merge).
#[cfg(feature = "parallel")]
struct ElementContribution3D {
    trip_rows: Vec<usize>,
    trip_cols: Vec<usize>,
    trip_vals: Vec<f64>,
    diag_contributions: Vec<(usize, f64)>,
    force_contributions: Vec<(usize, f64)>,
    diagnostics: Vec<AssemblyDiagnostic>,
}

/// Unified element reference for a single par_iter work pool.
#[cfg(feature = "parallel")]
enum AnyElement3D<'a> {
    Frame(&'a SolverElement3D),
    Plate(&'a SolverPlateElement),
    Quad(&'a SolverQuadElement),
    Quad9(&'a SolverQuad9Element),
    SolidShell(&'a SolverSolidShellElement),
    CurvedShell(&'a SolverCurvedShellElement),
    Connector(&'a crate::types::ConnectorElement),
}

/// Build element_id → Vec<&load> index for O(1) load dispatch.
#[cfg(feature = "parallel")]
fn build_load_index_3d<'a>(loads: &'a [SolverLoad3D]) -> std::collections::HashMap<usize, Vec<&'a SolverLoad3D>> {
    let mut index: std::collections::HashMap<usize, Vec<&SolverLoad3D>> = std::collections::HashMap::new();
    for load in loads {
        let eid = match load {
            SolverLoad3D::Nodal(_) | SolverLoad3D::Bimoment(_) => continue,
            SolverLoad3D::Distributed(dl) => dl.element_id,
            SolverLoad3D::PointOnElement(pl) => pl.element_id,
            SolverLoad3D::Thermal(tl) => tl.element_id,
            SolverLoad3D::Pressure(pl) => pl.element_id,
            SolverLoad3D::PlateThermal(tl) => tl.element_id,
            SolverLoad3D::QuadPressure(pl) => pl.element_id,
            SolverLoad3D::QuadThermal(tl) => tl.element_id,
            SolverLoad3D::QuadEdge(el) => el.element_id,
            SolverLoad3D::QuadSelfWeight(sw) => sw.element_id,
            SolverLoad3D::Quad9Pressure(pl) => pl.element_id,
            SolverLoad3D::Quad9Thermal(tl) => tl.element_id,
            SolverLoad3D::Quad9Edge(el) => el.element_id,
            SolverLoad3D::Quad9SelfWeight(sw) => sw.element_id,
            SolverLoad3D::SolidShellPressure(pl) => pl.element_id,
            SolverLoad3D::SolidShellSelfWeight(sw) => sw.element_id,
            SolverLoad3D::CurvedShellPressure(pl) => pl.element_id,
            SolverLoad3D::CurvedShellThermal(tl) => tl.element_id,
            SolverLoad3D::CurvedShellEdge(el) => el.element_id,
            SolverLoad3D::CurvedShellSelfWeight(sw) => sw.element_id,
        };
        index.entry(eid).or_default().push(load);
    }
    index
}

/// Helper: scatter lower-triangle triplets + diag from element stiffness (SoA layout).
#[cfg(feature = "parallel")]
fn scatter_triplets(
    k: &[f64], dofs: &[usize], ndof: usize, nf: usize,
    rows: &mut Vec<usize>,
    cols: &mut Vec<usize>,
    vals: &mut Vec<f64>,
    diag: &mut Vec<(usize, f64)>,
) {
    for i in 0..ndof {
        let gi = dofs[i];
        for j in 0..ndof {
            let gj = dofs[j];
            if gi >= gj {
                rows.push(gi);
                cols.push(gj);
                vals.push(k[i * ndof + j]);
            }
        }
        if gi < nf { diag.push((gi, k[i * ndof + i])); }
    }
}

/// Parallel 3D sparse assembly using rayon.
///
/// Each element computes its stiffness independently, collecting local triplets.
/// After the parallel phase, nodal loads / springs / inclined transforms /
/// diagnostics are processed sequentially.
#[cfg(feature = "parallel")]
pub fn assemble_sparse_3d_parallel(input: &SolverInput3D, dof_num: &DofNumbering, build_k_full: bool) -> SparseAssemblyResult3D {
    use rayon::prelude::*;
    use crate::element;
    use crate::element::compute_local_axes_3d;

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let left_hand = input.left_hand.unwrap_or(false);

    // Pre-build O(1) lookup maps
    let node_map: std::collections::HashMap<usize, &SolverNode3D> =
        input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();
    let sec_map: std::collections::HashMap<usize, &SolverSection3D> =
        input.sections.values().map(|s| (s.id, s)).collect();
    let load_index = build_load_index_3d(&input.loads);

    // Collect all elements into unified vec, sorted by ID for deterministic assembly.
    // HashMap iteration order is randomized in Rust; without sorting, triplet
    // accumulation order varies across runs, causing floating-point differences
    // in the CSC matrix that propagate into the Cholesky factorization.
    let mut all_elements: Vec<AnyElement3D> = Vec::new();
    for e in input.elements.values() { all_elements.push(AnyElement3D::Frame(e)); }
    for p in input.plates.values() { all_elements.push(AnyElement3D::Plate(p)); }
    for q in input.quads.values() { all_elements.push(AnyElement3D::Quad(q)); }
    for q9 in input.quad9s.values() { all_elements.push(AnyElement3D::Quad9(q9)); }
    for ss in input.solid_shells.values() { all_elements.push(AnyElement3D::SolidShell(ss)); }
    for cs in input.curved_shells.values() { all_elements.push(AnyElement3D::CurvedShell(cs)); }
    for conn in input.connectors.values() { all_elements.push(AnyElement3D::Connector(conn)); }
    all_elements.sort_by_key(|e| match e {
        AnyElement3D::Frame(f) => f.id,
        AnyElement3D::Plate(p) => p.id,
        AnyElement3D::Quad(q) => q.id,
        AnyElement3D::Quad9(q) => q.id,
        AnyElement3D::SolidShell(s) => s.id,
        AnyElement3D::CurvedShell(c) => c.id,
        AnyElement3D::Connector(c) => c.id,
    });

    // Parallel phase: compute element stiffness + scatter triplets
    let contributions: Vec<ElementContribution3D> = all_elements.par_iter().map(|any_elem| {
        let mut trip_rows = Vec::new();
        let mut trip_cols = Vec::new();
        let mut trip_vals = Vec::new();
        let mut diag = Vec::new();
        let mut forces = Vec::new();
        let mut diagnostics = Vec::new();

        match any_elem {
            AnyElement3D::Frame(elem) => {
                let node_i = node_map[&elem.node_i];
                let node_j = node_map[&elem.node_j];
                let mat = mat_map[&elem.material_id];
                let sec = sec_map[&elem.section_id];
                let dx = node_j.x - node_i.x;
                let dy = node_j.y - node_i.y;
                let dz = node_j.z - node_i.z;
                let l = (dx * dx + dy * dy + dz * dz).sqrt();
                let e = mat.e * 1000.0;
                let g = e / (2.0 * (1.0 + mat.nu));

                if elem.elem_type == "truss" || elem.elem_type == "cable" {
                    let ea_l = e * sec.a / l;
                    let dir = [dx / l, dy / l, dz / l];
                    for a in 0..2 {
                        for b in 0..2 {
                            let sign = if a == b { 1.0 } else { -1.0 };
                            let node_a = if a == 0 { elem.node_i } else { elem.node_j };
                            let node_b = if b == 0 { elem.node_i } else { elem.node_j };
                            for i in 0..3 {
                                for j in 0..3 {
                                    if let (Some(&da), Some(&db)) = (
                                        dof_num.map.get(&(node_a, i)),
                                        dof_num.map.get(&(node_b, j)),
                                    ) {
                                        if da >= db {
                                            let val = sign * ea_l * dir[i] * dir[j];
                                            trip_rows.push(da); trip_cols.push(db); trip_vals.push(val);
                                        }
                                        if da == db && da < nf { diag.push((da, sign * ea_l * dir[i] * dir[j])); }
                                    }
                                }
                            }
                        }
                    }
                    // Assemble thermal FEF for truss elements
                    if let Some(elem_loads) = load_index.get(&elem.id) {
                        for load in elem_loads {
                            if let SolverLoad3D::Thermal(tl) = load {
                                let alpha = 12e-6;
                                let fx = e * sec.a * alpha * tl.dt_uniform;
                                for k in 0..3 {
                                    if let Some(&d) = dof_num.map.get(&(elem.node_i, k)) {
                                        forces.push((d, -fx * dir[k]));
                                    }
                                    if let Some(&d) = dof_num.map.get(&(elem.node_j, k)) {
                                        forces.push((d, fx * dir[k]));
                                    }
                                }
                            }
                        }
                    }
                } else {
                    let (ex, ey, ez) = compute_local_axes_3d(
                        node_i.x, node_i.y, node_i.z, node_j.x, node_j.y, node_j.z,
                        elem.local_yx, elem.local_yy, elem.local_yz, elem.roll_angle, left_hand,
                    );
                    let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
                    let has_cw = sec.cw.map_or(false, |cw| cw > 0.0);

                    let (phi_y, phi_z) = if sec.as_y.is_some() || sec.as_z.is_some() {
                        let l2 = l * l;
                        let py = sec.as_y.map(|ay| 12.0 * e * sec.iy / (g * ay * l2)).unwrap_or(0.0);
                        let pz = sec.as_z.map(|az| 12.0 * e * sec.iz / (g * az * l2)).unwrap_or(0.0);
                        (py, pz)
                    } else {
                        (0.0, 0.0)
                    };

                    if has_cw && dof_num.dofs_per_node >= 7 {
                        let k_local = element::frame_local_stiffness_3d_warping(
                            e, sec.a, sec.iy, sec.iz, sec.j, sec.cw.unwrap(), l, g,
                            elem.hinge_start, elem.hinge_end, phi_y, phi_z,
                        );
                        let t = element::frame_transform_3d_warping(&ex, &ey, &ez);
                        let k_glob = transform_stiffness(&k_local, &t, 14);
                        let ndof = elem_dofs.len();
                        scatter_triplets(&k_glob, &elem_dofs, ndof, nf, &mut trip_rows, &mut trip_cols, &mut trip_vals, &mut diag);
                        // Warping element loads
                        if let Some(elem_loads) = load_index.get(&elem.id) {
                            for load in elem_loads {
                                match load {
                                    SolverLoad3D::Distributed(dl) => {
                                        let a = dl.a.unwrap_or(0.0);
                                        let b = dl.b.unwrap_or(l);
                                        let is_full = (a.abs() < 1e-12) && ((b - l).abs() < 1e-12);
                                        let fef12 = if is_full {
                                            element::fef_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, l)
                                        } else {
                                            element::fef_partial_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, a, b, l)
                                        };
                                        let fef14 = element::expand_fef_12_to_14(&fef12);
                                        let fef_global = transform_force(&fef14, &t, 14);
                                        for (i, &dof) in elem_dofs.iter().enumerate() { forces.push((dof, fef_global[i])); }
                                    }
                                    SolverLoad3D::PointOnElement(pl) => {
                                        let fef_y = element::fef_point_load_2d(pl.py, 0.0, 0.0, pl.a, l);
                                        let mut fef12 = [0.0; 12];
                                        fef12[1] = fef_y[1]; fef12[5] = fef_y[2];
                                        fef12[7] = fef_y[4]; fef12[11] = fef_y[5];
                                        let fef_z = element::fef_point_load_2d(pl.pz, 0.0, 0.0, pl.a, l);
                                        fef12[2] = fef_z[1]; fef12[4] = -fef_z[2];
                                        fef12[8] = fef_z[4]; fef12[10] = -fef_z[5];
                                        let fef14 = element::expand_fef_12_to_14(&fef12);
                                        let fef_global = transform_force(&fef14, &t, 14);
                                        for (i, &dof) in elem_dofs.iter().enumerate() { forces.push((dof, fef_global[i])); }
                                    }
                                    SolverLoad3D::Thermal(tl) => {
                                        let alpha = 12e-6;
                                        let hy = if sec.a > 1e-15 { (12.0 * sec.iz / sec.a).sqrt() } else { 0.1 };
                                        let hz = if sec.a > 1e-15 { (12.0 * sec.iy / sec.a).sqrt() } else { 0.1 };
                                        let fef12 = element::fef_thermal_3d(e, sec.a, sec.iy, sec.iz, l, tl.dt_uniform, tl.dt_gradient_y, tl.dt_gradient_z, alpha, hy, hz);
                                        let fef14 = element::expand_fef_12_to_14(&fef12);
                                        let fef_global = transform_force(&fef14, &t, 14);
                                        for (i, &dof) in elem_dofs.iter().enumerate() { forces.push((dof, fef_global[i])); }
                                    }
                                    _ => {}
                                }
                            }
                        }
                    } else if dof_num.dofs_per_node >= 7 {
                        let k_local = element::frame_local_stiffness_3d(
                            e, sec.a, sec.iy, sec.iz, sec.j, l, g,
                            elem.hinge_start, elem.hinge_end, phi_y, phi_z,
                        );
                        let t = element::frame_transform_3d(&ex, &ey, &ez);
                        let k_glob = transform_stiffness(&k_local, &t, 12);
                        // Map 12-DOF to 14-DOF positions
                        for i in 0..12 {
                            let gi = elem_dofs[DOF_MAP_12_TO_14[i]];
                            for j in 0..12 {
                                let gj = elem_dofs[DOF_MAP_12_TO_14[j]];
                                if gi >= gj {
                                    trip_rows.push(gi); trip_cols.push(gj); trip_vals.push(k_glob[i * 12 + j]);
                                }
                            }
                            if gi < nf { diag.push((gi, k_glob[i * 12 + i])); }
                        }
                        // Mapped element loads (12→14 DOF)
                        if let Some(elem_loads) = load_index.get(&elem.id) {
                            for load in elem_loads {
                                match load {
                                    SolverLoad3D::Distributed(dl) => {
                                        let a = dl.a.unwrap_or(0.0);
                                        let b = dl.b.unwrap_or(l);
                                        let is_full = (a.abs() < 1e-12) && ((b - l).abs() < 1e-12);
                                        let fef = if is_full {
                                            element::fef_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, l)
                                        } else {
                                            element::fef_partial_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, a, b, l)
                                        };
                                        let fef_global = transform_force(&fef, &t, 12);
                                        for i in 0..12 { forces.push((elem_dofs[DOF_MAP_12_TO_14[i]], fef_global[i])); }
                                    }
                                    SolverLoad3D::PointOnElement(pl) => {
                                        let fef_y = element::fef_point_load_2d(pl.py, 0.0, 0.0, pl.a, l);
                                        let mut fef = [0.0; 12];
                                        fef[1] = fef_y[1]; fef[5] = fef_y[2];
                                        fef[7] = fef_y[4]; fef[11] = fef_y[5];
                                        let fef_z = element::fef_point_load_2d(pl.pz, 0.0, 0.0, pl.a, l);
                                        fef[2] = fef_z[1]; fef[4] = -fef_z[2];
                                        fef[8] = fef_z[4]; fef[10] = -fef_z[5];
                                        let fef_global = transform_force(&fef, &t, 12);
                                        for i in 0..12 { forces.push((elem_dofs[DOF_MAP_12_TO_14[i]], fef_global[i])); }
                                    }
                                    SolverLoad3D::Thermal(tl) => {
                                        let alpha = 12e-6;
                                        let hy = if sec.a > 1e-15 { (12.0 * sec.iz / sec.a).sqrt() } else { 0.1 };
                                        let hz = if sec.a > 1e-15 { (12.0 * sec.iy / sec.a).sqrt() } else { 0.1 };
                                        let fef = element::fef_thermal_3d(e, sec.a, sec.iy, sec.iz, l, tl.dt_uniform, tl.dt_gradient_y, tl.dt_gradient_z, alpha, hy, hz);
                                        let fef_global = transform_force(&fef, &t, 12);
                                        for i in 0..12 { forces.push((elem_dofs[DOF_MAP_12_TO_14[i]], fef_global[i])); }
                                    }
                                    _ => {}
                                }
                            }
                        }
                    } else {
                        let k_local = element::frame_local_stiffness_3d(
                            e, sec.a, sec.iy, sec.iz, sec.j, l, g,
                            elem.hinge_start, elem.hinge_end, phi_y, phi_z,
                        );
                        let t = element::frame_transform_3d(&ex, &ey, &ez);
                        let k_glob = transform_stiffness(&k_local, &t, 12);
                        let ndof = elem_dofs.len();
                        scatter_triplets(&k_glob, &elem_dofs, ndof, nf, &mut trip_rows, &mut trip_cols, &mut trip_vals, &mut diag);
                        // Standard 12-DOF element loads
                        if let Some(elem_loads) = load_index.get(&elem.id) {
                            for load in elem_loads {
                                match load {
                                    SolverLoad3D::Distributed(dl) => {
                                        let a = dl.a.unwrap_or(0.0);
                                        let b = dl.b.unwrap_or(l);
                                        let is_full = (a.abs() < 1e-12) && ((b - l).abs() < 1e-12);
                                        let fef = if is_full {
                                            element::fef_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, l)
                                        } else {
                                            element::fef_partial_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, a, b, l)
                                        };
                                        let fef_global = transform_force(&fef, &t, 12);
                                        for (i, &dof) in elem_dofs.iter().enumerate() { forces.push((dof, fef_global[i])); }
                                    }
                                    SolverLoad3D::PointOnElement(pl) => {
                                        let fef_y = element::fef_point_load_2d(pl.py, 0.0, 0.0, pl.a, l);
                                        let mut fef = [0.0; 12];
                                        fef[1] = fef_y[1]; fef[5] = fef_y[2];
                                        fef[7] = fef_y[4]; fef[11] = fef_y[5];
                                        let fef_z = element::fef_point_load_2d(pl.pz, 0.0, 0.0, pl.a, l);
                                        fef[2] = fef_z[1]; fef[4] = -fef_z[2];
                                        fef[8] = fef_z[4]; fef[10] = -fef_z[5];
                                        let fef_global = transform_force(&fef, &t, 12);
                                        for (i, &dof) in elem_dofs.iter().enumerate() { forces.push((dof, fef_global[i])); }
                                    }
                                    SolverLoad3D::Thermal(tl) => {
                                        let alpha = 12e-6;
                                        let hy = if sec.a > 1e-15 { (12.0 * sec.iz / sec.a).sqrt() } else { 0.1 };
                                        let hz = if sec.a > 1e-15 { (12.0 * sec.iy / sec.a).sqrt() } else { 0.1 };
                                        let fef = element::fef_thermal_3d(e, sec.a, sec.iy, sec.iz, l, tl.dt_uniform, tl.dt_gradient_y, tl.dt_gradient_z, alpha, hy, hz);
                                        let fef_global = transform_force(&fef, &t, 12);
                                        for (i, &dof) in elem_dofs.iter().enumerate() { forces.push((dof, fef_global[i])); }
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }
            }

            AnyElement3D::Connector(conn) => {
                let ni = match node_map.get(&conn.node_i) { Some(n) => n, None => return ElementContribution3D { trip_rows, trip_cols, trip_vals, diag_contributions: diag, force_contributions: forces, diagnostics } };
                let nj_node = match node_map.get(&conn.node_j) { Some(n) => n, None => return ElementContribution3D { trip_rows, trip_cols, trip_vals, diag_contributions: diag, force_contributions: forces, diagnostics } };
                let dx = nj_node.x - ni.x;
                let dy = nj_node.y - ni.y;
                let dz = nj_node.z - ni.z;
                let l = (dx * dx + dy * dy + dz * dz).sqrt();
                let dir = if l > 1e-15 { [dx / l, dy / l, dz / l] } else { [1.0, 0.0, 0.0] };
                let ke = crate::element::connector::connector_stiffness_3d(
                    conn.k_axial, conn.k_shear, conn.k_shear_z,
                    conn.k_moment, conn.k_bend_y, conn.k_bend_z, dir,
                );
                let dofs = dof_num.element_dofs(conn.node_i, conn.node_j);
                let ndof = dofs.len();
                for i in 0..ndof {
                    let gi = dofs[i];
                    for j in 0..ndof {
                        let gj = dofs[j];
                        if gi >= gj { trip_rows.push(gi); trip_cols.push(gj); trip_vals.push(ke[i * 12 + j]); }
                    }
                    if gi < nf { diag.push((gi, ke[i * 12 + i])); }
                }
            }

            AnyElement3D::Plate(plate) => {
                let mat = mat_map[&plate.material_id];
                let e = mat.e * 1000.0;
                let nu = mat.nu;
                let n0 = node_map[&plate.nodes[0]];
                let n1 = node_map[&plate.nodes[1]];
                let n2 = node_map[&plate.nodes[2]];
                let coords = [[n0.x, n0.y, n0.z], [n1.x, n1.y, n1.z], [n2.x, n2.y, n2.z]];
                let k_local = element::plate_local_stiffness(&coords, e, nu, plate.thickness);
                let t_plate = element::plate_transform_3d(&coords);
                let k_glob = transform_stiffness(&k_local, &t_plate, 18);
                let plate_dofs = dof_num.plate_element_dofs(&plate.nodes);
                let ndof = plate_dofs.len();
                scatter_triplets(&k_glob, &plate_dofs, ndof, nf, &mut trip_rows, &mut trip_cols, &mut trip_vals, &mut diag);
                // Plate loads
                if let Some(elem_loads) = load_index.get(&plate.id) {
                    for load in elem_loads {
                        match load {
                            SolverLoad3D::Pressure(pl) => {
                                let f_press = element::plate_pressure_load(&coords, pl.pressure);
                                for (i, &dof) in plate_dofs.iter().enumerate() {
                                    if i < f_press.len() { forces.push((dof, f_press[i])); }
                                }
                            }
                            SolverLoad3D::PlateThermal(tl) => {
                                let alpha = tl.alpha.unwrap_or(12e-6);
                                let f_th = element::plate_thermal_load(&coords, e, nu, plate.thickness, alpha, tl.dt_uniform, tl.dt_gradient);
                                for (i, &dof) in plate_dofs.iter().enumerate() {
                                    if i < f_th.len() { forces.push((dof, f_th[i])); }
                                }
                            }
                            _ => {}
                        }
                    }
                }
                // Plate diagnostics
                let (aspect_ratio, _skew, min_angle) = element::plate_element_quality(&coords);
                if aspect_ratio > 10.0 {
                    diagnostics.push(AssemblyDiagnostic {
                        element_id: plate.id, element_type: "plate".into(), metric: "aspect_ratio".into(),
                        value: aspect_ratio, threshold: 10.0,
                        message: format!("Plate {} aspect ratio {:.1} exceeds 10", plate.id, aspect_ratio),
                    });
                }
                if min_angle < 10.0 {
                    diagnostics.push(AssemblyDiagnostic {
                        element_id: plate.id, element_type: "plate".into(), metric: "min_angle".into(),
                        value: min_angle, threshold: 10.0,
                        message: format!("Plate {} min angle {:.1}° below 10°", plate.id, min_angle),
                    });
                }
            }

            AnyElement3D::Quad(quad) => {
                let mat = mat_map[&quad.material_id];
                let e = mat.e * 1000.0;
                let nu = mat.nu;
                let n0 = node_map[&quad.nodes[0]];
                let n1 = node_map[&quad.nodes[1]];
                let n2 = node_map[&quad.nodes[2]];
                let n3 = node_map[&quad.nodes[3]];
                let coords = [[n0.x, n0.y, n0.z], [n1.x, n1.y, n1.z], [n2.x, n2.y, n2.z], [n3.x, n3.y, n3.z]];
                let k_local = element::quad::mitc4_local_stiffness(&coords, e, nu, quad.thickness);
                let t_quad = element::quad::quad_transform_3d(&coords);
                let k_glob = transform_stiffness(&k_local, &t_quad, 24);
                let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
                let ndof = quad_dofs.len();
                scatter_triplets(&k_glob, &quad_dofs, ndof, nf, &mut trip_rows, &mut trip_cols, &mut trip_vals, &mut diag);
                // Quad loads
                if let Some(elem_loads) = load_index.get(&quad.id) {
                    for load in elem_loads {
                        match load {
                            SolverLoad3D::QuadPressure(pl) => {
                                let f_press = element::quad::quad_pressure_load(&coords, pl.pressure);
                                for (i, &dof) in quad_dofs.iter().enumerate() {
                                    if i < f_press.len() { forces.push((dof, f_press[i])); }
                                }
                            }
                            SolverLoad3D::QuadThermal(tl) => {
                                let alpha = tl.alpha.unwrap_or(1.2e-5);
                                let f_th = element::quad::quad_thermal_load(&coords, e, nu, quad.thickness, alpha, tl.dt_uniform, tl.dt_gradient);
                                for (i, &dof) in quad_dofs.iter().enumerate() {
                                    if i < f_th.len() { forces.push((dof, f_th[i])); }
                                }
                            }
                            SolverLoad3D::QuadSelfWeight(sw) => {
                                let f_sw = element::quad::quad_self_weight_load(&coords, sw.density, quad.thickness, sw.gx, sw.gy, sw.gz);
                                for (i, &dof) in quad_dofs.iter().enumerate() {
                                    if i < f_sw.len() { forces.push((dof, f_sw[i])); }
                                }
                            }
                            SolverLoad3D::QuadEdge(el) => {
                                let f_edge = element::quad::quad_edge_load(&coords, el.edge, el.qn, el.qt);
                                for (i, &dof) in quad_dofs.iter().enumerate() {
                                    if i < f_edge.len() { forces.push((dof, f_edge[i])); }
                                }
                            }
                            _ => {}
                        }
                    }
                }
                // Quad diagnostics
                let qm = element::quad::quad_quality_metrics(&coords);
                let (_, _, has_neg_j) = element::quad::quad_check_jacobian(&coords);
                if has_neg_j {
                    diagnostics.push(AssemblyDiagnostic {
                        element_id: quad.id, element_type: "quad".into(), metric: "negative_jacobian".into(),
                        value: -1.0, threshold: 0.0,
                        message: format!("Quad {} has negative Jacobian determinant (inverted element)", quad.id),
                    });
                }
                if qm.aspect_ratio > 10.0 {
                    diagnostics.push(AssemblyDiagnostic {
                        element_id: quad.id, element_type: "quad".into(), metric: "aspect_ratio".into(),
                        value: qm.aspect_ratio, threshold: 10.0,
                        message: format!("Quad {} aspect ratio {:.1} exceeds 10", quad.id, qm.aspect_ratio),
                    });
                }
                if qm.warping > 0.01 && qm.warping <= 0.1 {
                    diagnostics.push(AssemblyDiagnostic {
                        element_id: quad.id, element_type: "quad".into(), metric: "warping_moderate".into(),
                        value: qm.warping, threshold: 0.01,
                        message: format!("Quad {} moderate warping {:.3} (0.01-0.1 range)", quad.id, qm.warping),
                    });
                }
                if qm.warping > 0.1 {
                    diagnostics.push(AssemblyDiagnostic {
                        element_id: quad.id, element_type: "quad".into(), metric: "warping".into(),
                        value: qm.warping, threshold: 0.1,
                        message: format!("Quad {} warping {:.3} exceeds 0.1", quad.id, qm.warping),
                    });
                }
                if qm.jacobian_ratio < 0.1 {
                    diagnostics.push(AssemblyDiagnostic {
                        element_id: quad.id, element_type: "quad".into(), metric: "jacobian_ratio".into(),
                        value: qm.jacobian_ratio, threshold: 0.1,
                        message: format!("Quad {} jacobian ratio {:.3} below 0.1", quad.id, qm.jacobian_ratio),
                    });
                }
            }

            AnyElement3D::Quad9(q9) => {
                let mat = mat_map[&q9.material_id];
                let e = mat.e * 1000.0;
                let nu = mat.nu;
                let coords = quad9_node_coords(&node_map, q9);
                let k_local = element::quad9::mitc9_local_stiffness(&coords, e, nu, q9.thickness);
                let t_q9 = element::quad9::quad9_transform_3d(&coords);
                let k_glob = transform_stiffness(&k_local, &t_q9, 54);
                let q9_dofs = dof_num.quad9_element_dofs(&q9.nodes);
                let ndof = q9_dofs.len();
                scatter_triplets(&k_glob, &q9_dofs, ndof, nf, &mut trip_rows, &mut trip_cols, &mut trip_vals, &mut diag);
                // Quad9 loads
                if let Some(elem_loads) = load_index.get(&q9.id) {
                    for load in elem_loads {
                        match load {
                            SolverLoad3D::Quad9Pressure(pl) => {
                                let f_p = element::quad9::quad9_pressure_load(&coords, pl.pressure);
                                let dofs = &q9_dofs;
                                for (i, &dof) in dofs.iter().enumerate() {
                                    if i < f_p.len() { forces.push((dof, f_p[i])); }
                                }
                            }
                            SolverLoad3D::Quad9Thermal(tl) => {
                                let alpha = tl.alpha.unwrap_or(1.2e-5);
                                let f_th = element::quad9::quad9_thermal_load(&coords, e, nu, q9.thickness, alpha, tl.dt_uniform, tl.dt_gradient);
                                for (i, &dof) in q9_dofs.iter().enumerate() {
                                    if i < f_th.len() { forces.push((dof, f_th[i])); }
                                }
                            }
                            SolverLoad3D::Quad9SelfWeight(sw) => {
                                let f_sw = element::quad9::quad9_self_weight_load(&coords, sw.density, q9.thickness, sw.gx, sw.gy, sw.gz);
                                for (i, &dof) in q9_dofs.iter().enumerate() {
                                    if i < f_sw.len() { forces.push((dof, f_sw[i])); }
                                }
                            }
                            SolverLoad3D::Quad9Edge(el) => {
                                let f_edge = element::quad9::quad9_edge_load(&coords, el.edge, el.qn, el.qt);
                                for (i, &dof) in q9_dofs.iter().enumerate() {
                                    if i < f_edge.len() { forces.push((dof, f_edge[i])); }
                                }
                            }
                            _ => {}
                        }
                    }
                }
                // Quad9 diagnostics
                let (_, _, has_neg_j) = element::quad9::quad9_check_jacobian(&coords);
                if has_neg_j {
                    diagnostics.push(AssemblyDiagnostic {
                        element_id: q9.id, element_type: "quad9".into(), metric: "negative_jacobian".into(),
                        value: -1.0, threshold: 0.0,
                        message: format!("Quad9 {} has negative Jacobian determinant (inverted element)", q9.id),
                    });
                }
            }

            AnyElement3D::SolidShell(ss) => {
                let mat = mat_map[&ss.material_id];
                let e = mat.e * 1000.0;
                let nu = mat.nu;
                let coords = solid_shell_node_coords(&node_map, ss);
                let k_elem = element::solid_shell::solid_shell_stiffness(&coords, e, nu);
                let ss_dofs = dof_num.solid_shell_element_dofs(&ss.nodes);
                let ndof = ss_dofs.len();
                scatter_triplets(&k_elem, &ss_dofs, ndof, nf, &mut trip_rows, &mut trip_cols, &mut trip_vals, &mut diag);
                // Solid-shell loads
                if let Some(elem_loads) = load_index.get(&ss.id) {
                    for load in elem_loads {
                        match load {
                            SolverLoad3D::SolidShellPressure(pl) => {
                                let f_p = element::solid_shell::solid_shell_pressure_load(&coords, pl.pressure);
                                for (i, &dof) in ss_dofs.iter().enumerate() {
                                    if i < f_p.len() { forces.push((dof, f_p[i])); }
                                }
                            }
                            SolverLoad3D::SolidShellSelfWeight(sw) => {
                                let f_sw = element::solid_shell::solid_shell_self_weight_load(&coords, sw.density, sw.gx, sw.gy, sw.gz);
                                for (i, &dof) in ss_dofs.iter().enumerate() {
                                    if i < f_sw.len() { forces.push((dof, f_sw[i])); }
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }

            AnyElement3D::CurvedShell(cs) => {
                let mat = mat_map[&cs.material_id];
                let e = mat.e * 1000.0;
                let nu = mat.nu;
                let coords = curved_shell_node_coords(&node_map, cs);
                let dirs = cs.normals.unwrap_or_else(|| element::curved_shell::compute_element_directors(&coords));
                let k_elem = element::curved_shell::curved_shell_stiffness(&coords, &dirs, e, nu, cs.thickness);
                let cs_dofs = dof_num.quad_element_dofs(&cs.nodes);
                let ndof = cs_dofs.len();
                scatter_triplets(&k_elem, &cs_dofs, ndof, nf, &mut trip_rows, &mut trip_cols, &mut trip_vals, &mut diag);
                // Curved shell loads
                if let Some(elem_loads) = load_index.get(&cs.id) {
                    for load in elem_loads {
                        match load {
                            SolverLoad3D::CurvedShellPressure(pl) => {
                                let f_p = element::curved_shell::curved_shell_pressure_load(&coords, &dirs, cs.thickness, pl.pressure);
                                for (i, &dof) in cs_dofs.iter().enumerate() {
                                    if i < f_p.len() { forces.push((dof, f_p[i])); }
                                }
                            }
                            SolverLoad3D::CurvedShellThermal(tl) => {
                                let alpha = tl.alpha.unwrap_or(1.2e-5);
                                let f_th = element::curved_shell::curved_shell_thermal_load(&coords, &dirs, e, nu, cs.thickness, alpha, tl.dt_uniform, tl.dt_gradient);
                                for (i, &dof) in cs_dofs.iter().enumerate() {
                                    if i < f_th.len() { forces.push((dof, f_th[i])); }
                                }
                            }
                            SolverLoad3D::CurvedShellSelfWeight(sw) => {
                                let f_sw = element::curved_shell::curved_shell_self_weight_load(&coords, &dirs, sw.density, cs.thickness, sw.gx, sw.gy, sw.gz);
                                for (i, &dof) in cs_dofs.iter().enumerate() {
                                    if i < f_sw.len() { forces.push((dof, f_sw[i])); }
                                }
                            }
                            SolverLoad3D::CurvedShellEdge(el) => {
                                let f_e = element::curved_shell::curved_shell_edge_load(&coords, &dirs, cs.thickness, el.edge, el.qn, el.qt);
                                for (i, &dof) in cs_dofs.iter().enumerate() {
                                    if i < f_e.len() { forces.push((dof, f_e[i])); }
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        }

        ElementContribution3D {
            trip_rows,
            trip_cols,
            trip_vals,
            diag_contributions: diag,
            force_contributions: forces,
            diagnostics,
        }
    }).collect();

    // ── Sequential merge phase ──

    let total_triplets: usize = contributions.iter().map(|c| c.trip_rows.len()).sum();
    let mut trip_rows = Vec::with_capacity(total_triplets + 256);
    let mut trip_cols = Vec::with_capacity(total_triplets + 256);
    let mut trip_vals = Vec::with_capacity(total_triplets + 256);
    let mut f_global = vec![0.0; n];
    let mut diag_vals = vec![0.0f64; nf];
    let mut max_diag = 0.0f64;
    let mut diagnostics = Vec::new();

    for contrib in &contributions {
        trip_rows.extend_from_slice(&contrib.trip_rows);
        trip_cols.extend_from_slice(&contrib.trip_cols);
        trip_vals.extend_from_slice(&contrib.trip_vals);
        for &(d, v) in &contrib.diag_contributions {
            diag_vals[d] += v;
        }
        for &(d, v) in &contrib.force_contributions {
            f_global[d] += v;
        }
        diagnostics.extend_from_slice(&contrib.diagnostics);
    }

    // Nodal loads (not element-bound, sequential)
    for load in &input.loads {
        if let SolverLoad3D::Nodal(nl) = load {
            let forces = [nl.fx, nl.fy, nl.fz, nl.mx, nl.my, nl.mz];
            for (i, &f) in forces.iter().enumerate() {
                if i < dof_num.dofs_per_node {
                    if let Some(&d) = dof_num.map.get(&(nl.node_id, i)) { f_global[d] += f; }
                }
            }
            if let Some(bw) = nl.bw {
                if bw.abs() > 1e-15 {
                    if let Some(&d) = dof_num.map.get(&(nl.node_id, 6)) { f_global[d] += bw; }
                }
            }
        }
        if let SolverLoad3D::Bimoment(bl) = load {
            if bl.bimoment.abs() > 1e-15 {
                if let Some(&d) = dof_num.map.get(&(bl.node_id, 6)) { f_global[d] += bl.bimoment; }
            }
        }
    }

    // Spring stiffness
    for sup in input.supports.values() {
        let springs = [sup.kx, sup.ky, sup.kz, sup.krx, sup.kry, sup.krz];
        for (i, ks) in springs.iter().enumerate() {
            if let Some(k) = ks {
                if *k > 0.0 && i < dof_num.dofs_per_node {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, i)) {
                        trip_rows.push(d); trip_cols.push(d); trip_vals.push(*k);
                        if d < nf { diag_vals[d] += *k; }
                    }
                }
            }
        }
        if dof_num.dofs_per_node >= 7 {
            if let Some(kw) = sup.kw {
                if kw > 0.0 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, 6)) {
                        trip_rows.push(d); trip_cols.push(d); trip_vals.push(kw);
                        if d < nf { diag_vals[d] += kw; }
                    }
                }
            }
        }
    }

    for d in &diag_vals[..nf] { max_diag = max_diag.max(d.abs()); }

    // Artificial stiffness at floating warping DOFs
    let mut artificial_dofs_3d = Vec::new();
    if dof_num.dofs_per_node >= 7 {
        let artificial_k = if max_diag > 0.0 { max_diag * 1e-10 } else { 1e-6 };
        for &node_id in &dof_num.node_order {
            if let Some(&d) = dof_num.map.get(&(node_id, 6)) {
                if d < nf && diag_vals[d].abs() < 1e-20 {
                    trip_rows.push(d); trip_cols.push(d); trip_vals.push(artificial_k);
                    artificial_dofs_3d.push(d);
                }
            }
        }
    }

    // Inclined support transforms
    let mut inclined_transforms = Vec::new();
    for sup in input.supports.values() {
        if sup.is_inclined.unwrap_or(false) {
            if let (Some(nx), Some(ny), Some(nz)) = (sup.normal_x, sup.normal_y, sup.normal_z) {
                let n_len = (nx * nx + ny * ny + nz * nz).sqrt();
                if n_len > 1e-12 {
                    let r = inclined_rotation_matrix(nx, ny, nz);
                    if let (Some(&d0), Some(&d1), Some(&d2)) = (
                        dof_num.map.get(&(sup.node_id, 0)),
                        dof_num.map.get(&(sup.node_id, 1)),
                        dof_num.map.get(&(sup.node_id, 2)),
                    ) {
                        let dofs = [d0, d1, d2];
                        apply_inclined_transform_triplets(
                            &mut trip_rows, &mut trip_cols, &mut trip_vals,
                            &mut f_global, &dofs, &r,
                        );
                        inclined_transforms.push(InclinedTransformData { node_id: sup.node_id, dofs, r });
                    }
                }
            }
        }
    }

    // Compact zeroed-out triplets
    if !inclined_transforms.is_empty() {
        let mut w = 0;
        for r in 0..trip_rows.len() {
            if trip_vals[r] != 0.0 {
                trip_rows[w] = trip_rows[r];
                trip_cols[w] = trip_cols[r];
                trip_vals[w] = trip_vals[r];
                w += 1;
            }
        }
        trip_rows.truncate(w);
        trip_cols.truncate(w);
        trip_vals.truncate(w);
    }

    // Build full-K CSC only if requested
    let k_full = if build_k_full {
        Some(CscMatrix::from_triplets(n, &trip_rows, &trip_cols, &trip_vals))
    } else {
        None
    };

    // Filter triplets for Kff (free-free block)
    let ff_cap = trip_rows.len(); // upper bound
    let mut ff_rows = Vec::with_capacity(ff_cap);
    let mut ff_cols = Vec::with_capacity(ff_cap);
    let mut ff_vals = Vec::with_capacity(ff_cap);
    for i in 0..trip_rows.len() {
        if trip_rows[i] < nf && trip_cols[i] < nf {
            ff_rows.push(trip_rows[i]); ff_cols.push(trip_cols[i]); ff_vals.push(trip_vals[i]);
        }
    }
    let mut k_ff = CscMatrix::from_triplets(nf, &ff_rows, &ff_cols, &ff_vals);
    k_ff.drop_below_threshold(1e-30);

    SparseAssemblyResult3D {
        k_ff, k_full, f: f_global, max_diag_k: max_diag,
        artificial_dofs: artificial_dofs_3d, inclined_transforms, diagnostics,
    }
}

/// Non-parallel fallback for `assemble_sparse_3d_parallel`.
#[cfg(not(feature = "parallel"))]
pub fn assemble_sparse_3d_parallel(input: &SolverInput3D, dof_num: &DofNumbering, build_k_full: bool) -> SparseAssemblyResult3D {
    super::assembly::assemble_sparse_3d(input, dof_num, build_k_full)
}

/// Coordinate helpers for the parallel path (avoid name collision with assembly.rs).
#[cfg(feature = "parallel")]
fn quad9_node_coords(node_map: &std::collections::HashMap<usize, &SolverNode3D>, q9: &SolverQuad9Element) -> [[f64; 3]; 9] {
    let mut coords = [[0.0; 3]; 9];
    for (i, &nid) in q9.nodes.iter().enumerate() {
        let n = node_map[&nid];
        coords[i] = [n.x, n.y, n.z];
    }
    coords
}

#[cfg(feature = "parallel")]
fn solid_shell_node_coords(node_map: &std::collections::HashMap<usize, &SolverNode3D>, ss: &SolverSolidShellElement) -> [[f64; 3]; 8] {
    let mut coords = [[0.0; 3]; 8];
    for (i, &nid) in ss.nodes.iter().enumerate() {
        let n = node_map[&nid];
        coords[i] = [n.x, n.y, n.z];
    }
    coords
}

#[cfg(feature = "parallel")]
fn curved_shell_node_coords(node_map: &std::collections::HashMap<usize, &SolverNode3D>, cs: &SolverCurvedShellElement) -> [[f64; 3]; 4] {
    let mut coords = [[0.0; 3]; 4];
    for (i, &nid) in cs.nodes.iter().enumerate() {
        let n = node_map[&nid];
        coords[i] = [n.x, n.y, n.z];
    }
    coords
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn make_simple_beam() -> SolverInput {
        let mut nodes = HashMap::new();
        nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
        nodes.insert("2".to_string(), SolverNode { id: 2, x: 5.0, z: 0.0 });

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
            dx: None, dz: None, dry: None,
            angle: None,
        });
        supports.insert("2".to_string(), SolverSupport {
            id: 2,
            node_id: 2,
            support_type: "pinned".to_string(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None,
            angle: None,
        });

        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: 0.0,
            fz: -10.0,
            my: 0.0,
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

    /// Build a 4×4 flat plate model (16 MITC4 quads + pressure loads) for 3D testing.
    fn make_flat_plate_3d_4x4() -> SolverInput3D {
        let lx = 10.0;
        let ly = 10.0;
        let nx = 4;
        let ny = 4;
        let t = 0.1;

        let mut nodes = HashMap::new();
        let mut grid = vec![vec![0usize; ny + 1]; nx + 1];
        let mut nid = 1;
        for i in 0..=nx {
            for j in 0..=ny {
                let x = (i as f64 / nx as f64) * lx;
                let y = (j as f64 / ny as f64) * ly;
                nodes.insert(nid.to_string(), SolverNode3D { id: nid, x, y, z: 0.0 });
                grid[i][j] = nid;
                nid += 1;
            }
        }

        let mut quads = HashMap::new();
        let mut qid = 1;
        for i in 0..nx {
            for j in 0..ny {
                quads.insert(qid.to_string(), SolverQuadElement {
                    id: qid,
                    nodes: [grid[i][j], grid[i+1][j], grid[i+1][j+1], grid[i][j+1]],
                    material_id: 1,
                    thickness: t,
                });
                qid += 1;
            }
        }

        let mut mats = HashMap::new();
        mats.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

        let mut supports = HashMap::new();
        let mut sid = 1;
        let mut boundary = Vec::new();
        for j in 0..=ny { boundary.push(grid[0][j]); boundary.push(grid[nx][j]); }
        for i in 0..=nx { boundary.push(grid[i][0]); boundary.push(grid[i][ny]); }
        boundary.sort();
        boundary.dedup();
        for &n in &boundary {
            supports.insert(sid.to_string(), SolverSupport3D {
                node_id: n, rx: false, ry: false, rz: true,
                rrx: false, rry: false, rrz: false,
                kx: None, ky: None, kz: None,
                krx: None, kry: None, krz: None,
                dx: None, dy: None, dz: None,
                drx: None, dry: None, drz: None,
                normal_x: None, normal_y: None, normal_z: None,
                is_inclined: None, rw: None, kw: None,
            });
            sid += 1;
        }
        // Pin one corner
        supports.insert(sid.to_string(), SolverSupport3D {
            node_id: grid[0][0], rx: true, ry: true, rz: true,
            rrx: false, rry: false, rrz: false,
            kx: None, ky: None, kz: None,
            krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None,
            drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None, rw: None, kw: None,
        });

        let n_quads = quads.len();
        let loads: Vec<SolverLoad3D> = (1..=n_quads).map(|eid| {
            SolverLoad3D::QuadPressure(SolverPressureLoad { element_id: eid, pressure: -1.0 })
        }).collect();

        SolverInput3D {
            nodes, materials: mats, sections: HashMap::new(),
            elements: HashMap::new(), supports, loads,
            constraints: vec![], left_hand: None,
            plates: HashMap::new(), quads, quad9s: HashMap::new(),
            solid_shells: HashMap::new(), curved_shells: HashMap::new(),
            curved_beams: vec![], connectors: HashMap::new(),
        }
    }

    #[test]
    fn test_parallel_3d_matches_serial() {
        use super::super::dof::DofNumbering;
        use super::super::assembly;

        let input = make_flat_plate_3d_4x4();
        let dof_num = DofNumbering::build_3d(&input);
        let serial = assembly::assemble_sparse_3d(&input, &dof_num, false);
        let parallel = assemble_sparse_3d_parallel(&input, &dof_num, false);

        // Compare Kff
        let dense_s = serial.k_ff.to_dense_symmetric();
        let dense_p = parallel.k_ff.to_dense_symmetric();
        assert_eq!(dense_s.len(), dense_p.len(), "Kff size mismatch: {} vs {}", dense_s.len(), dense_p.len());
        for i in 0..dense_s.len() {
            assert!(
                (dense_s[i] - dense_p[i]).abs() < 1e-8,
                "Kff mismatch at index {}: serial={} vs parallel={}",
                i, dense_s[i], dense_p[i]
            );
        }

        // Compare force vector
        assert_eq!(serial.f.len(), parallel.f.len());
        for i in 0..serial.f.len() {
            assert!(
                (serial.f[i] - parallel.f[i]).abs() < 1e-10,
                "Force mismatch at DOF {}: serial={} vs parallel={}",
                i, serial.f[i], parallel.f[i]
            );
        }

        // Compare diagnostics count and max_diag
        assert!((serial.max_diag_k - parallel.max_diag_k).abs() < 1e-8,
            "max_diag_k mismatch: {} vs {}", serial.max_diag_k, parallel.max_diag_k);
    }

    /// Mixed model: 4 frame columns + 4×4 quad slab + nodal + pressure loads.
    /// Exercises frame + quad + mixed load dispatch in parallel assembly.
    fn make_mixed_frame_slab_3d() -> SolverInput3D {
        let nx = 4;
        let ny = 4;
        let slab_z = 3.0; // slab at z=3m
        let lx = 8.0;
        let ly = 8.0;

        let mut nodes = HashMap::new();
        let mut nid = 1;

        // Base nodes for columns (z=0)
        let base_nodes = [
            (0.0, 0.0), (lx, 0.0), (lx, ly), (0.0, ly),
        ];
        let mut base_ids = Vec::new();
        for &(x, y) in &base_nodes {
            nodes.insert(nid.to_string(), SolverNode3D { id: nid, x, y, z: 0.0 });
            base_ids.push(nid);
            nid += 1;
        }

        // Slab grid nodes (z=slab_z)
        let mut grid = vec![vec![0usize; ny + 1]; nx + 1];
        for i in 0..=nx {
            for j in 0..=ny {
                let x = (i as f64 / nx as f64) * lx;
                let y = (j as f64 / ny as f64) * ly;
                nodes.insert(nid.to_string(), SolverNode3D { id: nid, x, y, z: slab_z });
                grid[i][j] = nid;
                nid += 1;
            }
        }

        // Frame columns: base to corner slab nodes
        let corner_slab_nodes = [grid[0][0], grid[nx][0], grid[nx][ny], grid[0][ny]];
        let mut elements = HashMap::new();
        let mut eid = 1;
        for (&base, &top) in base_ids.iter().zip(corner_slab_nodes.iter()) {
            elements.insert(eid.to_string(), SolverElement3D {
                id: eid,
                elem_type: "frame".to_string(),
                node_i: base, node_j: top,
                material_id: 1, section_id: 1,
                hinge_start: false, hinge_end: false,
                local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
            });
            eid += 1;
        }

        // Quad slab
        let mut quads = HashMap::new();
        let mut qid = 1;
        for i in 0..nx {
            for j in 0..ny {
                quads.insert(qid.to_string(), SolverQuadElement {
                    id: qid,
                    nodes: [grid[i][j], grid[i+1][j], grid[i+1][j+1], grid[i][j+1]],
                    material_id: 1,
                    thickness: 0.2,
                });
                qid += 1;
            }
        }

        let mut mats = HashMap::new();
        mats.insert("1".to_string(), SolverMaterial { id: 1, e: 30_000.0, nu: 0.2 }); // concrete

        let mut sections = HashMap::new();
        sections.insert("1".to_string(), SolverSection3D {
            id: 1, name: None, a: 0.09, iy: 6.75e-4, iz: 6.75e-4, j: 1.0e-3,
            cw: None, as_y: None, as_z: None,
        });

        // Fixed base supports
        let mut supports = HashMap::new();
        let mut sid = 1;
        for &base in &base_ids {
            supports.insert(sid.to_string(), SolverSupport3D {
                node_id: base, rx: true, ry: true, rz: true,
                rrx: true, rry: true, rrz: true,
                kx: None, ky: None, kz: None,
                krx: None, kry: None, krz: None,
                dx: None, dy: None, dz: None,
                drx: None, dry: None, drz: None,
                normal_x: None, normal_y: None, normal_z: None,
                is_inclined: None, rw: None, kw: None,
            });
            sid += 1;
        }

        // Loads: pressure on all slab quads + a nodal load at center
        let n_quads = quads.len();
        let mut loads: Vec<SolverLoad3D> = (1..=n_quads).map(|eid| {
            SolverLoad3D::QuadPressure(SolverPressureLoad { element_id: eid, pressure: -5.0 })
        }).collect();
        // Nodal load at slab center
        let center_node = grid[nx / 2][ny / 2];
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: center_node,
            fx: 10.0, fy: 0.0, fz: -50.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }));

        SolverInput3D {
            nodes, materials: mats, sections, elements, supports, loads,
            constraints: vec![], left_hand: None,
            plates: HashMap::new(), quads, quad9s: HashMap::new(),
            solid_shells: HashMap::new(), curved_shells: HashMap::new(),
            curved_beams: vec![], connectors: HashMap::new(),
        }
    }

    #[test]
    fn test_parallel_3d_mixed_model_matches_serial() {
        use super::super::dof::DofNumbering;
        use super::super::assembly;

        let input = make_mixed_frame_slab_3d();
        let dof_num = DofNumbering::build_3d(&input);

        let serial = assembly::assemble_sparse_3d(&input, &dof_num, false);
        let parallel = assemble_sparse_3d_parallel(&input, &dof_num, false);

        // Compare Kff
        let dense_s = serial.k_ff.to_dense_symmetric();
        let dense_p = parallel.k_ff.to_dense_symmetric();
        assert_eq!(dense_s.len(), dense_p.len(), "Kff size mismatch");
        for i in 0..dense_s.len() {
            assert!(
                (dense_s[i] - dense_p[i]).abs() < 1e-8,
                "Kff mismatch at {}: {} vs {}", i, dense_s[i], dense_p[i]
            );
        }

        // Compare force vector
        assert_eq!(serial.f.len(), parallel.f.len());
        for i in 0..serial.f.len() {
            assert!(
                (serial.f[i] - parallel.f[i]).abs() < 1e-10,
                "Force mismatch at DOF {}: {} vs {}", i, serial.f[i], parallel.f[i]
            );
        }

        assert!((serial.max_diag_k - parallel.max_diag_k).abs() < 1e-8);
    }
}
