/// Multi-point constraint (MPC) technology using the transformation method.
///
/// Supports rigid links, diaphragms, equal-DOF, and general linear MPCs.
/// The approach builds a constraint transformation matrix C such that:
///   u_full = C * u_independent
/// Then the reduced system is:
///   K_reduced = C^T * K * C
///   F_reduced = C^T * F
/// After solving for u_independent, recover u_full = C * u_independent.
///
/// Reference: Cook et al., "Concepts and Applications of Finite Element Analysis", Ch. 9

use std::collections::{HashMap, HashSet};
use serde::{Serialize, Deserialize};
use crate::types::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly;
use super::linear;

/// Result of building constraint transformation.
pub struct ConstraintTransform {
    /// Transformation matrix C: n_total × n_independent, sparse (dual CSR/CSC).
    /// C is near-identity — one unit entry per independent DOF plus a few
    /// entries per dependent DOF — so nnz is O(n_total) and the dense form
    /// would waste O(n_total × n_independent) memory.
    pub c: SparseTransform,
    /// Number of independent DOFs (after constraints applied)
    pub n_independent: usize,
    /// Total DOFs
    pub n_total: usize,
    /// Map: independent index → original global DOF index
    pub independent_dofs: Vec<usize>,
    /// Set of dependent (constrained) global DOF indices
    pub dependent_dofs: HashSet<usize>,
}

/// Sparse matrix in dual CSR + CSC form, for the constraint transform C.
///
/// Rows are physical DOFs, columns are independent DOFs. CSR answers "what
/// does this DOF depend on" (expand, reduce-vector); CSC answers "who depends
/// on this independent DOF" (particular solution, K·C products).
#[derive(Debug, Clone)]
pub struct SparseTransform {
    pub n_rows: usize,
    pub n_cols: usize,
    // CSR
    pub row_ptr: Vec<usize>,
    pub col_idx: Vec<usize>,
    pub vals: Vec<f64>,
    // CSC (transpose of the same entries)
    pub col_ptr: Vec<usize>,
    pub row_idx: Vec<usize>,
    pub csc_vals: Vec<f64>,
}

impl SparseTransform {
    /// Build from per-row (column, value) lists. Rows must be sorted by column
    /// and free of duplicate columns.
    ///
    /// That precondition is load-bearing and invisible when violated: `mul_vec`
    /// and `mul_transpose_vec` still return the right answer on an unsorted row,
    /// so a test would not notice, but `from_transform` then emits an unsorted
    /// `c_ff`, and `build_constraint_transform`'s convergence check merges
    /// `touched` against `old` assuming both are sorted — it would compute the
    /// wrong `max_change` and could stop iterating on an unconverged chain, or
    /// double-count a master given a duplicate column. Hence the debug assert.
    pub fn from_rows(n_rows: usize, n_cols: usize, rows: Vec<Vec<(usize, f64)>>) -> Self {
        assert_eq!(rows.len(), n_rows);
        debug_assert!(
            rows.iter().all(|r| r.windows(2).all(|w| w[0].0 < w[1].0)),
            "SparseTransform rows must be sorted by column and free of duplicates",
        );
        debug_assert!(
            rows.iter().flatten().all(|&(j, _)| j < n_cols),
            "SparseTransform column index out of range",
        );
        let nnz: usize = rows.iter().map(|r| r.len()).sum();
        let mut row_ptr = vec![0usize; n_rows + 1];
        let mut col_idx = Vec::with_capacity(nnz);
        let mut vals = Vec::with_capacity(nnz);
        for (i, row) in rows.iter().enumerate() {
            row_ptr[i + 1] = row_ptr[i] + row.len();
            for &(j, v) in row {
                col_idx.push(j);
                vals.push(v);
            }
        }

        // Transpose to CSC via counting sort.
        let mut col_ptr = vec![0usize; n_cols + 1];
        for &j in &col_idx {
            col_ptr[j + 1] += 1;
        }
        for j in 0..n_cols {
            col_ptr[j + 1] += col_ptr[j];
        }
        let mut row_idx = vec![0usize; nnz];
        let mut csc_vals = vec![0.0; nnz];
        {
            let mut next = col_ptr[..n_cols].to_vec();
            for i in 0..n_rows {
                for p in row_ptr[i]..row_ptr[i + 1] {
                    let j = col_idx[p];
                    row_idx[next[j]] = i;
                    csc_vals[next[j]] = vals[p];
                    next[j] += 1;
                }
            }
        }

        SparseTransform { n_rows, n_cols, row_ptr, col_idx, vals, col_ptr, row_idx, csc_vals }
    }

    /// y = C * x  (x: n_cols, y: n_rows)
    pub fn mul_vec(&self, x: &[f64]) -> Vec<f64> {
        assert_eq!(x.len(), self.n_cols);
        let mut y = vec![0.0; self.n_rows];
        self.mul_vec_into(x, &mut y);
        y
    }

    /// y += C * x
    pub fn mul_vec_into(&self, x: &[f64], y: &mut [f64]) {
        for i in 0..self.n_rows {
            let mut sum = 0.0;
            for p in self.row_ptr[i]..self.row_ptr[i + 1] {
                sum += self.vals[p] * x[self.col_idx[p]];
            }
            y[i] += sum;
        }
    }

    /// y = C^T * x  (x: n_rows, y: n_cols)
    pub fn mul_transpose_vec(&self, x: &[f64]) -> Vec<f64> {
        assert_eq!(x.len(), self.n_rows);
        let mut y = vec![0.0; self.n_cols];
        for i in 0..self.n_rows {
            let xi = x[i];
            if xi == 0.0 {
                continue;
            }
            for p in self.row_ptr[i]..self.row_ptr[i + 1] {
                y[self.col_idx[p]] += self.vals[p] * xi;
            }
        }
        y
    }

    /// Reduced matrix K_red = C^T · K · C with K dense (n_rows × n_rows,
    /// row-major). Returns dense n_cols × n_cols (row-major).
    /// Cost O(nnz(C) · n_rows) instead of the dense triple loop's O(n_rows² · n_cols).
    ///
    /// K is read in full and is NOT assumed symmetric. An earlier version read
    /// only the lower triangle and mirrored each off-diagonal contribution,
    /// which quietly narrowed the contract of the `ct_k_c` it replaced: that one
    /// summed over the whole matrix. Roughly fifteen dense callers reach here —
    /// corotational tangent stiffness, the buckling K_g, time integration, SSI,
    /// kinematics, cables — and any of them carrying round-off asymmetry, or a
    /// genuinely unsymmetric geometric term, would have had its strictly-upper
    /// half discarded and replaced by the lower mirror, with no diagnostic.
    ///
    /// Reading the full matrix costs the same: the mirrored version scanned half
    /// the rows and wrote twice per term, this scans all of them and writes once.
    pub fn reduce_dense(&self, k: &[f64]) -> Vec<f64> {
        let m = self.n_rows;
        let p = self.n_cols;
        assert_eq!(k.len(), m * m, "reduce_dense expects an n_rows × n_rows matrix");
        // K_red[j, j'] += Σ_{l,l'} C[l,j] · K[l,l'] · C[l',j']
        // Stream K row by row: for each l, distribute row l of K over the
        // (small) column sets of C's rows l and l'.
        let mut k_red = vec![0.0; p * p];
        for l in 0..m {
            for pa in self.row_ptr[l]..self.row_ptr[l + 1] {
                let (j, ca) = (self.col_idx[pa], self.vals[pa]);
                for l2 in 0..m {
                    let kv = k[l * m + l2];
                    if kv == 0.0 {
                        continue;
                    }
                    let c = ca * kv;
                    for pb in self.row_ptr[l2]..self.row_ptr[l2 + 1] {
                        let (j2, cb) = (self.col_idx[pb], self.vals[pb]);
                        k_red[j * p + j2] += c * cb;
                    }
                }
            }
        }
        k_red
    }

    /// Reduced matrix K_red = C^T · K · C with K sparse symmetric (lower-triangle
    /// CSC). Returns lower-triangle CSC of the symmetric n_cols × n_cols result.
    /// Cost O(Σ_{(l,l')∈K} deg(l)·deg(l')) — near-linear in nnz(K) for the
    /// near-identity transforms MPCs produce.
    pub fn reduce_sparse(&self, k: &crate::linalg::sparse::CscMatrix) -> crate::linalg::sparse::CscMatrix {
        // Emitted as (col, row, value) so ONE sort leaves them in CSC order and
        // the result can be built in place. The earlier version pushed into
        // three parallel vectors, copied them into this tuple form, sorted,
        // merged into three more vectors and handed those to `from_triplets`,
        // which copied once more and sorted a second time — four full copies of
        // ~9·nnz(K) triplets live at once, and a second sort of data already in
        // (col, row) order.
        let mut trip: Vec<(usize, usize, f64)> = Vec::new();
        // K stores (row >= col): entry (l, l2) with l >= l2 stands for both
        // (l, l2) and (l2, l) in the double sum over ordered index pairs.
        // Emissions land on ORDERED target slots (j, j2): slot (j,j2) and its
        // mirror (j2,j) get their own terms, so duplicates must be merged per
        // ordered slot — letting from_triplets fold upper slots into lower
        // ones would double-count.
        for l2 in 0..k.n {
            for pk in k.col_ptr[l2]..k.col_ptr[l2 + 1] {
                let l = k.row_idx[pk];
                let kv = k.values[pk];
                for pa in self.row_ptr[l]..self.row_ptr[l + 1] {
                    let (j, ca) = (self.col_idx[pa], self.vals[pa]);
                    let cak = ca * kv;
                    for pb in self.row_ptr[l2]..self.row_ptr[l2 + 1] {
                        let (j2, cb) = (self.col_idx[pb], self.vals[pb]);
                        trip.push((j2, j, cak * cb));
                    }
                }
                if l != l2 {
                    // Transposed orientation (l2, l)
                    for pa in self.row_ptr[l2]..self.row_ptr[l2 + 1] {
                        let (j, ca) = (self.col_idx[pa], self.vals[pa]);
                        let cak = ca * kv;
                        for pb in self.row_ptr[l]..self.row_ptr[l + 1] {
                            let (j2, cb) = (self.col_idx[pb], self.vals[pb]);
                            trip.push((j2, j, cak * cb));
                        }
                    }
                }
            }
        }

        // Merge equal ordered slots, keep the lower triangle (K_red is
        // symmetric, so the upper slot totals are redundant), and build the CSC
        // directly — the run is already in (col, row) order and duplicate-free.
        trip.sort_unstable_by(|a, b| (a.0, a.1).cmp(&(b.0, b.1)));
        let mut col_ptr = vec![0usize; self.n_cols + 1];
        let mut row_idx: Vec<usize> = Vec::new();
        let mut values: Vec<f64> = Vec::new();
        let mut i = 0;
        while i < trip.len() {
            let (c, r, mut v) = trip[i];
            i += 1;
            while i < trip.len() && trip[i].0 == c && trip[i].1 == r {
                v += trip[i].2;
                i += 1;
            }
            // Same drop every other sparse producer applies — `from_dense_symmetric`,
            // which the 3D path used to go through, and `assemble_stiffness_sparse_3d`,
            // whose comment explains it: near-zero entries kept as structural
            // nonzeros let Cholesky succeed on a singular matrix, and they hand AMD a
            // denser elimination graph than the model actually has, filling in more
            // than the dense path did and eroding the speedup this reduction exists
            // for. Terms that cancel exactly land here as 0.0.
            if r >= c && v.abs() > 1e-30 {
                row_idx.push(r);
                values.push(v);
                col_ptr[c + 1] += 1;
            }
        }
        for c in 0..self.n_cols {
            col_ptr[c + 1] += col_ptr[c];
        }
        crate::linalg::sparse::CscMatrix { n: self.n_cols, col_ptr, row_idx, values }
    }
}

/// Constrained analysis input (2D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstrainedInput {
    pub solver: SolverInput,
    pub constraints: Vec<Constraint>,
}

/// Constrained analysis input (3D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstrainedInput3D {
    pub solver: SolverInput3D,
    pub constraints: Vec<Constraint>,
}

/// Validate that all node IDs referenced by constraints exist in the model,
/// and that DOF indices are within the valid range for the analysis type.
/// `max_dofs_per_node`: 3 for 2D, 6 for 3D.
pub fn validate_constraint_refs(
    constraints: &[Constraint],
    node_ids: &HashSet<usize>,
    max_dofs_per_node: usize,
) -> Result<(), String> {
    for (i, constraint) in constraints.iter().enumerate() {
        match constraint {
            Constraint::RigidLink(rl) => {
                if !node_ids.contains(&rl.master_node) {
                    return Err(format!("Constraint {}: RigidLink master node {} does not exist", i, rl.master_node));
                }
                if !node_ids.contains(&rl.slave_node) {
                    return Err(format!("Constraint {}: RigidLink slave node {} does not exist", i, rl.slave_node));
                }
                for &dof in &rl.dofs {
                    if dof >= max_dofs_per_node {
                        return Err(format!(
                            "Constraint {}: RigidLink references DOF {} but max is {} (0..{})",
                            i, dof, max_dofs_per_node - 1, max_dofs_per_node - 1
                        ));
                    }
                }
            }
            Constraint::Diaphragm(dia) => {
                if !node_ids.contains(&dia.master_node) {
                    return Err(format!("Constraint {}: Diaphragm master node {} does not exist", i, dia.master_node));
                }
                for &slave in &dia.slave_nodes {
                    if !node_ids.contains(&slave) {
                        return Err(format!("Constraint {}: Diaphragm slave node {} does not exist", i, slave));
                    }
                }
            }
            Constraint::EqualDOF(eq) => {
                if !node_ids.contains(&eq.master_node) {
                    return Err(format!("Constraint {}: EqualDOF master node {} does not exist", i, eq.master_node));
                }
                if !node_ids.contains(&eq.slave_node) {
                    return Err(format!("Constraint {}: EqualDOF slave node {} does not exist", i, eq.slave_node));
                }
                for &dof in &eq.dofs {
                    if dof >= max_dofs_per_node {
                        return Err(format!(
                            "Constraint {}: EqualDOF references DOF {} but max is {} (0..{})",
                            i, dof, max_dofs_per_node - 1, max_dofs_per_node - 1
                        ));
                    }
                }
            }
            Constraint::EccentricConnection(ec) => {
                if !node_ids.contains(&ec.master_node) {
                    return Err(format!("Constraint {}: EccentricConnection master node {} does not exist", i, ec.master_node));
                }
                if !node_ids.contains(&ec.slave_node) {
                    return Err(format!("Constraint {}: EccentricConnection slave node {} does not exist", i, ec.slave_node));
                }
            }
            Constraint::LinearMPC(mpc) => {
                for term in &mpc.terms {
                    if !node_ids.contains(&term.node_id) {
                        return Err(format!("Constraint {}: LinearMPC references non-existent node {}", i, term.node_id));
                    }
                    if term.dof >= max_dofs_per_node {
                        return Err(format!(
                            "Constraint {}: LinearMPC term references DOF {} but max is {} (0..{})",
                            i, term.dof, max_dofs_per_node - 1, max_dofs_per_node - 1
                        ));
                    }
                }
            }
        }
    }
    Ok(())
}

/// Pre-solve constraint validation.
///
/// Detects conflicting, circular, or over-constrained configurations and
/// returns structured diagnostics. Called before building the transform matrix.
pub fn validate_constraints(
    constraints: &[Constraint],
    dof_num: &DofNumbering,
    nodes_2d: Option<&HashMap<String, SolverNode>>,
    nodes_3d: Option<&HashMap<String, SolverNode3D>>,
) -> Vec<StructuredDiagnostic> {
    let mut diags = Vec::new();

    // Build reverse map: global DOF → (node_id, local_dof)
    let reverse_map: HashMap<usize, (usize, usize)> = dof_num.map.iter()
        .map(|(&(node_id, local_dof), &global_dof)| (global_dof, (node_id, local_dof)))
        .collect();

    // Collect which DOFs each constraint makes dependent
    let mut dep_count: HashMap<usize, Vec<usize>> = HashMap::new(); // global_dof -> [constraint indices]
    let mut master_of: HashMap<usize, HashSet<usize>> = HashMap::new(); // dep_dof -> set of master DOFs

    for (ci, constraint) in constraints.iter().enumerate() {
        let slave_dofs = collect_dependent_dofs(constraint, dof_num, nodes_2d, nodes_3d);
        for (slave_global, master_globals) in &slave_dofs {
            dep_count.entry(*slave_global).or_default().push(ci);
            master_of.entry(*slave_global).or_default().extend(master_globals);
        }
    }

    // 1. Conflicting constraints: same DOF constrained by multiple constraints
    for (&dof, indices) in &dep_count {
        if indices.len() > 1 {
            let node_id = reverse_map.get(&dof).map(|&(n, _)| n).unwrap_or(0);
            diags.push(StructuredDiagnostic::global(
                DiagnosticCode::ConflictingConstraints,
                Severity::Warning,
                format!("DOF {} (node {}) is constrained by {} constraints — last one wins",
                    dof, node_id, indices.len()),
            ).with_dofs(vec![dof]).with_nodes(vec![node_id]).with_phase("constraints"));
        }
    }

    // 2. Circular dependencies: any cycle in the slave->master graph
    //    (A->B->...->A), found by depth-first search — not just pairwise A<->B.
    {
        fn dfs_cycles(
            node: usize,
            graph: &HashMap<usize, HashSet<usize>>,
            path: &mut Vec<usize>,
            done: &mut HashSet<usize>,
            cycles: &mut Vec<Vec<usize>>,
        ) {
            if let Some(pos) = path.iter().position(|&d| d == node) {
                cycles.push(path[pos..].to_vec());
                return;
            }
            if done.contains(&node) {
                return;
            }
            path.push(node);
            if let Some(masters) = graph.get(&node) {
                let mut ms: Vec<usize> = masters.iter().copied().collect();
                ms.sort_unstable();
                for m in ms {
                    dfs_cycles(m, graph, path, done, cycles);
                }
            }
            path.pop();
            done.insert(node);
        }

        let mut cycles: Vec<Vec<usize>> = Vec::new();
        let mut done: HashSet<usize> = HashSet::new();
        let mut starts: Vec<usize> = master_of.keys().copied().collect();
        starts.sort_unstable();
        for s in starts {
            let mut path = Vec::new();
            dfs_cycles(s, &master_of, &mut path, &mut done, &mut cycles);
        }

        // One diagnostic per unique cycle (dedup up to rotation).
        let mut seen: HashSet<Vec<usize>> = HashSet::new();
        for cycle in cycles {
            let mut norm = cycle.clone();
            let min_pos = norm.iter().enumerate()
                .min_by_key(|&(_, v)| *v)
                .map(|(i, _)| i)
                .unwrap_or(0);
            norm.rotate_left(min_pos);
            if !seen.insert(norm) {
                continue;
            }
            let node_ids: Vec<usize> = cycle.iter()
                .map(|d| reverse_map.get(d).map(|&(n, _)| n).unwrap_or(0))
                .collect();
            let dof_path = cycle.iter()
                .map(|d| d.to_string())
                .collect::<Vec<_>>()
                .join(" -> ");
            diags.push(StructuredDiagnostic::global(
                DiagnosticCode::CircularConstraint,
                Severity::Error,
                format!(
                    "Circular constraint chain: DOFs {} -> back to start (nodes {:?})",
                    dof_path, node_ids
                ),
            ).with_dofs(cycle).with_nodes(node_ids).with_phase("constraints"));
        }
    }

    // 3. Dependent DOF is also restrained by a support (over-constrained)
    let restrained: HashSet<usize> = (dof_num.n_free..dof_num.n_total).collect();
    for &dep_dof in dep_count.keys() {
        if restrained.contains(&dep_dof) {
            let node_id = reverse_map.get(&dep_dof).map(|&(n, _)| n).unwrap_or(0);
            diags.push(StructuredDiagnostic::global(
                DiagnosticCode::OverConstrainedDof,
                Severity::Warning,
                format!("DOF {} (node {}) is both constrained and restrained by a support",
                    dep_dof, node_id),
            ).with_dofs(vec![dep_dof]).with_nodes(vec![node_id]).with_phase("constraints"));
        }
    }

    diags
}

/// Collect dependent DOFs from a single constraint, returning (slave_global, [master_globals]).
fn collect_dependent_dofs(
    constraint: &Constraint,
    dof_num: &DofNumbering,
    nodes_2d: Option<&HashMap<String, SolverNode>>,
    nodes_3d: Option<&HashMap<String, SolverNode3D>>,
) -> Vec<(usize, Vec<usize>)> {
    let node_by_id_2d: Option<HashMap<usize, &SolverNode>> = nodes_2d.map(|nodes| {
        nodes.values().map(|n| (n.id, n)).collect()
    });
    let node_by_id_3d: Option<HashMap<usize, &SolverNode3D>> = nodes_3d.map(|nodes| {
        nodes.values().map(|n| (n.id, n)).collect()
    });
    let mut result = Vec::new();

    match constraint {
        Constraint::RigidLink(rl) => {
            let dofs = if rl.dofs.is_empty() {
                (0..dof_num.dofs_per_node.min(3)).collect::<Vec<_>>()
            } else {
                rl.dofs.clone()
            };
            for &dof in &dofs {
                if let Some(&slave_global) = dof_num.map.get(&(rl.slave_node, dof)) {
                    let mut masters = Vec::new();
                    if let Some(&m) = dof_num.map.get(&(rl.master_node, dof)) {
                        masters.push(m);
                    }
                    // Rotation coupling DOFs
                    if dof_num.dofs_per_node <= 3 {
                        if let Some(&rz) = dof_num.map.get(&(rl.master_node, 2)) {
                            masters.push(rz);
                        }
                    } else {
                        for rot_dof in 3..6 {
                            if let Some(&rd) = dof_num.map.get(&(rl.master_node, rot_dof)) {
                                masters.push(rd);
                            }
                        }
                    }
                    result.push((slave_global, masters));
                }
            }
        }
        Constraint::Diaphragm(dia) => {
            let is_3d = dof_num.dofs_per_node > 3;
            let (d0, d1, dr) = match dia.plane.as_str() {
                "XZ" => (0usize, 2usize, 4usize),  // ux, uz, ry
                "YZ" => (1, 2, 3),                   // uy, uz, rx
                _ if is_3d => (0, 1, 5),             // 3D XY: ux, uy, rz
                _ => (0, 1, 2),                      // 2D XY: ux, uz, ry
            };
            for &slave_id in &dia.slave_nodes {
                for &dof in &[d0, d1] {
                    if let Some(&s) = dof_num.map.get(&(slave_id, dof)) {
                        let mut masters = Vec::new();
                        if let Some(&m) = dof_num.map.get(&(dia.master_node, dof)) {
                            masters.push(m);
                        }
                        if let Some(&m) = dof_num.map.get(&(dia.master_node, dr)) {
                            masters.push(m);
                        }
                        result.push((s, masters));
                    }
                }
            }
        }
        Constraint::EqualDOF(eq) => {
            for &dof in &eq.dofs {
                if let Some(&slave_global) = dof_num.map.get(&(eq.slave_node, dof)) {
                    if let Some(&master_global) = dof_num.map.get(&(eq.master_node, dof)) {
                        result.push((slave_global, vec![master_global]));
                    }
                }
            }
        }
        Constraint::EccentricConnection(ec) => {
            let dpn = dof_num.dofs_per_node;
            let all_dofs: Vec<usize> = (0..dpn.min(if dpn <= 3 { 3 } else { 6 })).collect();
            for &dof in &all_dofs {
                if ec.releases.get(dof).copied().unwrap_or(false) { continue; }
                if let Some(&slave_global) = dof_num.map.get(&(ec.slave_node, dof)) {
                    let mut masters = vec![];
                    if let Some(&m) = dof_num.map.get(&(ec.master_node, dof)) {
                        masters.push(m);
                    }
                    if dpn > 3 {
                        for rot_dof in 3..6 {
                            if let Some(&rd) = dof_num.map.get(&(ec.master_node, rot_dof)) {
                                masters.push(rd);
                            }
                        }
                    } else if let Some(&rz) = dof_num.map.get(&(ec.master_node, 2)) {
                        masters.push(rz);
                    }
                    result.push((slave_global, masters));
                }
            }
        }
        Constraint::LinearMPC(mpc) => {
            if mpc.terms.is_empty() { return result; }
            let (dep_idx, _) = mpc.terms.iter().enumerate()
                .max_by(|(_, a), (_, b)| a.coefficient.abs().partial_cmp(&b.coefficient.abs()).unwrap())
                .unwrap();
            let dep_term = &mpc.terms[dep_idx];
            if let Some(&dep_global) = dof_num.map.get(&(dep_term.node_id, dep_term.dof)) {
                let masters: Vec<usize> = mpc.terms.iter().enumerate()
                    .filter(|(i, _)| *i != dep_idx)
                    .filter_map(|(_, t)| dof_num.map.get(&(t.node_id, t.dof)).copied())
                    .collect();
                result.push((dep_global, masters));
            }
        }
    }
    let _ = (node_by_id_2d, node_by_id_3d); // suppress unused warnings
    result
}

/// Build the constraint transformation matrix C.
///
/// C maps independent DOFs to full DOFs: u_full = C * u_indep.
/// For unconstrained DOFs: C[i, j] = 1 where j is the independent index of DOF i.
/// For constrained (dependent) DOFs: C[i, :] expresses the dependency.
pub fn build_constraint_transform(
    constraints: &[Constraint],
    dof_num: &DofNumbering,
    nodes_2d: Option<&HashMap<String, SolverNode>>,
    nodes_3d: Option<&HashMap<String, SolverNode3D>>,
) -> ConstraintTransform {
    let n = dof_num.n_total;

    // Build O(1) lookup maps: node numeric id -> &Node
    let node_by_id_2d: Option<HashMap<usize, &SolverNode>> = nodes_2d.map(|nodes| {
        nodes.values().map(|n| (n.id, n)).collect()
    });
    let node_by_id_3d: Option<HashMap<usize, &SolverNode3D>> = nodes_3d.map(|nodes| {
        nodes.values().map(|n| (n.id, n)).collect()
    });

    // Collect all dependent DOFs and their constraint equations.
    // Each equation: dependent_dof = Σ(coeff * independent_or_master_dof)
    let mut dep_equations: HashMap<usize, Vec<(usize, f64)>> = HashMap::new();

    for constraint in constraints {
        match constraint {
            Constraint::RigidLink(rl) => {
                let dofs = if rl.dofs.is_empty() {
                    // Default: all translational DOFs
                    (0..dof_num.dofs_per_node.min(3)).collect::<Vec<_>>()
                } else {
                    rl.dofs.clone()
                };

                // Get offset from master to slave
                let (dx, dy, dz) = get_node_offset(
                    rl.master_node, rl.slave_node,
                    node_by_id_2d.as_ref(), node_by_id_3d.as_ref(),
                );

                for &dof in &dofs {
                    if let Some(&slave_global) = dof_num.map.get(&(rl.slave_node, dof)) {
                        // Rigid body kinematics:
                        // 2D: u_slave_x = u_master_x - dy * θ_master
                        //     u_slave_y = u_master_y + dx * θ_master
                        // 3D: u_slave = u_master + ω_master × r
                        let mut terms = Vec::new();

                        if dof_num.dofs_per_node <= 3 {
                            // 2D rigid link
                            if let Some(&master_dof) = dof_num.map.get(&(rl.master_node, dof)) {
                                terms.push((master_dof, 1.0));
                            }
                            if dof == 0 {
                                // ux_slave = ux_master - dy * rz_master
                                if let Some(&rz) = dof_num.map.get(&(rl.master_node, 2)) {
                                    if dy.abs() > 1e-15 {
                                        terms.push((rz, -dy));
                                    }
                                }
                            } else if dof == 1 {
                                // uy_slave = uy_master + dx * rz_master
                                if let Some(&rz) = dof_num.map.get(&(rl.master_node, 2)) {
                                    if dx.abs() > 1e-15 {
                                        terms.push((rz, dx));
                                    }
                                }
                            } else if dof == 2 {
                                // rz_slave = rz_master (if rotation constrained)
                                // Already handled by first term
                            }
                        } else {
                            // 3D rigid link: u_slave = u_master + ω × r
                            if let Some(&master_dof) = dof_num.map.get(&(rl.master_node, dof)) {
                                terms.push((master_dof, 1.0));
                            }
                            match dof {
                                0 => {
                                    // ux_s = ux_m + (ω×r)_x = ux_m + θy*dz - θz*dy
                                    if let Some(&ry) = dof_num.map.get(&(rl.master_node, 4)) {
                                        if dz.abs() > 1e-15 { terms.push((ry, dz)); }
                                    }
                                    if let Some(&rz) = dof_num.map.get(&(rl.master_node, 5)) {
                                        if dy.abs() > 1e-15 { terms.push((rz, -dy)); }
                                    }
                                }
                                1 => {
                                    // uy_s = uy_m + (ω×r)_y = uy_m + θz*dx - θx*dz
                                    if let Some(&rx) = dof_num.map.get(&(rl.master_node, 3)) {
                                        if dz.abs() > 1e-15 { terms.push((rx, -dz)); }
                                    }
                                    if let Some(&rz) = dof_num.map.get(&(rl.master_node, 5)) {
                                        if dx.abs() > 1e-15 { terms.push((rz, dx)); }
                                    }
                                }
                                2 => {
                                    // uz_s = uz_m + (ω×r)_z = uz_m + θx*dy - θy*dx
                                    if let Some(&rx) = dof_num.map.get(&(rl.master_node, 3)) {
                                        if dy.abs() > 1e-15 { terms.push((rx, dy)); }
                                    }
                                    if let Some(&ry) = dof_num.map.get(&(rl.master_node, 4)) {
                                        if dx.abs() > 1e-15 { terms.push((ry, -dx)); }
                                    }
                                }
                                3 | 4 | 5 => {
                                    // Rotational DOFs: slave rotation = master rotation
                                    // Already handled by first term
                                }
                                _ => {}
                            }
                        }

                        if !terms.is_empty() {
                            dep_equations.insert(slave_global, terms);
                        }
                    }
                }
            }

            Constraint::Diaphragm(dia) => {
                // Diaphragm: in-plane rigid body motion
                // All slave nodes share master's in-plane translation + rotation
                let is_3d = dof_num.dofs_per_node > 3;
                let (d0, d1, dr) = match dia.plane.as_str() {
                    "XZ" => (0usize, 2usize, 4usize), // ux, uz, ry
                    "YZ" => (1, 2, 3),                  // uy, uz, rx
                    _ if is_3d => (0, 1, 5),            // 3D XY: ux, uy, rz
                    _ => (0, 1, 2),                      // 2D XY: ux, uz, ry
                };

                for &slave_id in &dia.slave_nodes {
                    let (dx, dy, dz) = get_node_offset(
                        dia.master_node, slave_id,
                        node_by_id_2d.as_ref(), node_by_id_3d.as_ref(),
                    );
                    // Offset in the diaphragm plane
                    let (off_0, off_1) = match dia.plane.as_str() {
                        "XZ" => (dx, dz),
                        "YZ" => (dy, dz),
                        _ => (dx, dy),
                    };

                    // u0_slave = u0_master - off_1 * θ_master
                    if let Some(&s_dof) = dof_num.map.get(&(slave_id, d0)) {
                        let mut terms = Vec::new();
                        if let Some(&m_dof) = dof_num.map.get(&(dia.master_node, d0)) {
                            terms.push((m_dof, 1.0));
                        }
                        if let Some(&m_r) = dof_num.map.get(&(dia.master_node, dr)) {
                            if off_1.abs() > 1e-15 {
                                terms.push((m_r, -off_1));
                            }
                        }
                        if !terms.is_empty() {
                            dep_equations.insert(s_dof, terms);
                        }
                    }

                    // u1_slave = u1_master + off_0 * θ_master
                    if let Some(&s_dof) = dof_num.map.get(&(slave_id, d1)) {
                        let mut terms = Vec::new();
                        if let Some(&m_dof) = dof_num.map.get(&(dia.master_node, d1)) {
                            terms.push((m_dof, 1.0));
                        }
                        if let Some(&m_r) = dof_num.map.get(&(dia.master_node, dr)) {
                            if off_0.abs() > 1e-15 {
                                terms.push((m_r, off_0));
                            }
                        }
                        if !terms.is_empty() {
                            dep_equations.insert(s_dof, terms);
                        }
                    }
                }
            }

            Constraint::EqualDOF(eq) => {
                for &dof in &eq.dofs {
                    if let Some(&slave_global) = dof_num.map.get(&(eq.slave_node, dof)) {
                        if let Some(&master_global) = dof_num.map.get(&(eq.master_node, dof)) {
                            dep_equations.insert(slave_global, vec![(master_global, 1.0)]);
                        }
                    }
                }
            }

            Constraint::EccentricConnection(ec) => {
                // Like RigidLink but with explicit offset and optional releases
                let (dx, dy, dz) = (ec.offset_x, ec.offset_y, ec.offset_z);
                let dpn = dof_num.dofs_per_node;

                let all_dofs: Vec<usize> = (0..dpn.min(if dpn <= 3 { 3 } else { 6 })).collect();
                for &dof in &all_dofs {
                    // Check if this DOF is released
                    let released = ec.releases.get(dof).copied().unwrap_or(false);
                    if released { continue; }

                    if let Some(&slave_global) = dof_num.map.get(&(ec.slave_node, dof)) {
                        let mut terms = Vec::new();

                        if dpn <= 3 {
                            // 2D eccentric connection
                            if let Some(&master_dof) = dof_num.map.get(&(ec.master_node, dof)) {
                                terms.push((master_dof, 1.0));
                            }
                            if dof == 0 {
                                if let Some(&rz) = dof_num.map.get(&(ec.master_node, 2)) {
                                    if dy.abs() > 1e-15 { terms.push((rz, -dy)); }
                                }
                            } else if dof == 1 {
                                if let Some(&rz) = dof_num.map.get(&(ec.master_node, 2)) {
                                    if dx.abs() > 1e-15 { terms.push((rz, dx)); }
                                }
                            }
                        } else {
                            // 3D eccentric connection
                            if let Some(&master_dof) = dof_num.map.get(&(ec.master_node, dof)) {
                                terms.push((master_dof, 1.0));
                            }
                            match dof {
                                0 => {
                                    // ux_s = ux_m + θy*dz - θz*dy
                                    if let Some(&ry) = dof_num.map.get(&(ec.master_node, 4)) {
                                        if dz.abs() > 1e-15 { terms.push((ry, dz)); }
                                    }
                                    if let Some(&rz) = dof_num.map.get(&(ec.master_node, 5)) {
                                        if dy.abs() > 1e-15 { terms.push((rz, -dy)); }
                                    }
                                }
                                1 => {
                                    // uy_s = uy_m + θz*dx - θx*dz
                                    if let Some(&rx) = dof_num.map.get(&(ec.master_node, 3)) {
                                        if dz.abs() > 1e-15 { terms.push((rx, -dz)); }
                                    }
                                    if let Some(&rz) = dof_num.map.get(&(ec.master_node, 5)) {
                                        if dx.abs() > 1e-15 { terms.push((rz, dx)); }
                                    }
                                }
                                2 => {
                                    // uz_s = uz_m + θx*dy - θy*dx
                                    if let Some(&rx) = dof_num.map.get(&(ec.master_node, 3)) {
                                        if dy.abs() > 1e-15 { terms.push((rx, dy)); }
                                    }
                                    if let Some(&ry) = dof_num.map.get(&(ec.master_node, 4)) {
                                        if dx.abs() > 1e-15 { terms.push((ry, -dx)); }
                                    }
                                }
                                3 | 4 | 5 => {
                                    // Rotational DOFs: slave rotation = master rotation
                                }
                                _ => {}
                            }
                        }

                        if !terms.is_empty() {
                            dep_equations.insert(slave_global, terms);
                        }
                    }
                }
            }

            Constraint::LinearMPC(mpc) => {
                // General MPC: Σ(coeff_i × u_i) = 0
                // First term with largest coefficient becomes dependent
                if mpc.terms.is_empty() { continue; }

                // Find term with largest |coefficient|
                let (dep_idx, _) = mpc.terms.iter().enumerate()
                    .max_by(|(_, a), (_, b)| a.coefficient.abs().partial_cmp(&b.coefficient.abs()).unwrap())
                    .unwrap();

                let dep_term = &mpc.terms[dep_idx];
                if let Some(&dep_global) = dof_num.map.get(&(dep_term.node_id, dep_term.dof)) {
                    let dep_coeff = dep_term.coefficient;
                    let mut terms = Vec::new();
                    for (i, term) in mpc.terms.iter().enumerate() {
                        if i == dep_idx { continue; }
                        if let Some(&global) = dof_num.map.get(&(term.node_id, term.dof)) {
                            terms.push((global, -term.coefficient / dep_coeff));
                        }
                    }
                    dep_equations.insert(dep_global, terms);
                }
            }
        }
    }

    // Build sets
    let dependent_set: HashSet<usize> = dep_equations.keys().copied().collect();
    let independent_dofs: Vec<usize> = (0..n)
        .filter(|d| !dependent_set.contains(d))
        .collect();
    let n_indep = independent_dofs.len();

    // Map from global DOF → independent index
    let mut indep_map: HashMap<usize, usize> = HashMap::new();
    for (i, &d) in independent_dofs.iter().enumerate() {
        indep_map.insert(d, i);
    }

    // Build C sparsely: one row per DOF, entries (independent_col, coeff).
    // Independent DOFs get a unit row; dependent rows are resolved by
    // multi-pass substitution over their masters' rows (same convergence
    // semantics as the previous dense build: max 10 passes, stop when the
    // largest entry change is < 1e-14).
    let mut rows: Vec<Vec<(usize, f64)>> = vec![Vec::new(); n];
    for (i, &d) in independent_dofs.iter().enumerate() {
        rows[d] = vec![(i, 1.0)];
    }

    // Scratch for sparse row combination (generation-stamped accumulator).
    let mut acc = vec![0.0f64; n_indep];
    let mut stamp = vec![0usize; n_indep];
    let mut gen = 0usize;
    let mut touched: Vec<usize> = Vec::new();

    for _pass in 0..10 {
        let mut max_change = 0.0f64;

        for (&dep_dof, terms) in &dep_equations {
            // new_row = Σ(coeff * row[master])
            gen += 1;
            touched.clear();
            for &(master_dof, coeff) in terms {
                for &(j, v) in &rows[master_dof] {
                    if stamp[j] != gen {
                        stamp[j] = gen;
                        acc[j] = 0.0;
                        touched.push(j);
                    }
                    acc[j] += coeff * v;
                }
            }
            touched.sort_unstable();

            // Compare against the current row (both sorted by column).
            let old = &rows[dep_dof];
            let mut oi = 0;
            for &j in &touched {
                let nv = acc[j];
                while oi < old.len() && old[oi].0 < j {
                    if old[oi].1.abs() > max_change { max_change = old[oi].1.abs(); }
                    oi += 1;
                }
                if oi < old.len() && old[oi].0 == j {
                    let diff = (nv - old[oi].1).abs();
                    if diff > max_change { max_change = diff; }
                    oi += 1;
                } else if nv.abs() > max_change {
                    max_change = nv.abs();
                }
            }
            while oi < old.len() {
                if old[oi].1.abs() > max_change { max_change = old[oi].1.abs(); }
                oi += 1;
            }

            // Drop columns whose terms cancelled. `touched` is stamped on FIRST
            // touch, before any value is known, so a chain like
            // `u_a = u_b + u_c` with `u_b = u_m`, `u_c = -u_m` leaves
            // `acc[j_m] == 0.0` and would otherwise store `(j_m, 0.0)` in C.
            // That fake nonzero survives into `c_ff` and then makes both
            // reductions emit a whole deg-sized block of zero products into
            // K_red for every K nonzero on this row — pattern pollution that
            // reaches AMD as extra edges. Classification is unaffected either
            // way (`unit_row_col` already filters at 1e-14).
            rows[dep_dof] = touched
                .iter()
                .filter(|&&j| acc[j] != 0.0)
                .map(|&j| (j, acc[j]))
                .collect();
        }

        if max_change < 1e-14 { break; }
    }

    ConstraintTransform {
        c: SparseTransform::from_rows(n, n_indep, rows),
        n_independent: n_indep,
        n_total: n,
        independent_dofs,
        dependent_dofs: dependent_set,
    }
}

/// Map raw (global_dof, force) pairs to ConstraintForce structs with node_id and dof name.
pub(super) fn map_dof_forces_to_constraint_forces(
    raw: &[(usize, f64)],
    dof_num: &DofNumbering,
) -> Vec<ConstraintForce> {
    // Build reverse map: global_dof → (node_id, local_dof)
    let mut reverse: HashMap<usize, (usize, usize)> = HashMap::new();
    for (&(node_id, local_dof), &global_dof) in &dof_num.map {
        reverse.insert(global_dof, (node_id, local_dof));
    }

    let dof_names_2d = ["ux", "uz", "ry"];
    let dof_names_3d = ["ux", "uy", "uz", "rx", "ry", "rz", "warping"];

    raw.iter().filter_map(|&(gdof, force)| {
        reverse.get(&gdof).map(|&(node_id, local_dof)| {
            let dof_name = if dof_num.dofs_per_node <= 3 {
                dof_names_2d.get(local_dof).unwrap_or(&"?")
            } else {
                dof_names_3d.get(local_dof).unwrap_or(&"?")
            };
            ConstraintForce {
                node_id,
                dof: dof_name.to_string(),
                force,
            }
        })
    }).collect()
}

/// Solve a 2D constrained analysis.
pub fn solve_constrained_2d(input: &ConstrainedInput) -> Result<AnalysisResults, String> {
    if input.constraints.is_empty() {
        return linear::solve_2d(&input.solver);
    }

    linear::validate_input_2d(&input.solver)?;

    // Constraint referential integrity
    let node_ids: HashSet<usize> = input.solver.nodes.values().map(|n| n.id).collect();
    validate_constraint_refs(&input.constraints, &node_ids, 3)?;

    let dof_num = DofNumbering::build_2d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let nr = n - nf;

    let asm = assembly::assemble_2d(&input.solver, &dof_num);

    // Build prescribed displacements
    let mut u_r = vec![0.0; nr];
    for sup in input.solver.supports.values() {
        if sup.support_type == "spring" { continue; }

        if sup.support_type == "inclinedRoller" {
            // Prescribed translations are given in GLOBAL coords; the
            // restrained inclined DOF (local_dof 1) is the normal direction.
            // Rotate into the inclined frame, mirroring prepare_static_2d.
            if let Some(theta) = sup.angle {
                let c = theta.cos();
                let s = theta.sin();
                let u_normal = sup.dx.unwrap_or(0.0) * s + sup.dz.unwrap_or(0.0) * c;
                if u_normal.abs() > 1e-15 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
                        if d >= nf { u_r[d - nf] = u_normal; }
                    }
                }
            } else {
                if let Some(v) = sup.dz {
                    if v.abs() > 1e-15 {
                        if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
                            if d >= nf { u_r[d - nf] = v; }
                        }
                    }
                }
            }
            if let Some(v) = sup.dry {
                if v.abs() > 1e-15 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, 2)) {
                        if d >= nf { u_r[d - nf] = v; }
                    }
                }
            }
            continue;
        }

        let prescribed: [(usize, Option<f64>); 3] = [
            (0, sup.dx), (1, sup.dz), (2, sup.dry),
        ];
        for &(local_dof, val) in &prescribed {
            if let Some(v) = val {
                if v.abs() > 1e-15 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, local_dof)) {
                        if d >= nf { u_r[d - nf] = v; }
                    }
                }
            }
        }
    }

    // Pre-solve constraint validation
    let mut constraint_diags = validate_constraints(
        &input.constraints, &dof_num,
        Some(&input.solver.nodes), None,
    );

    // Error-severity constraint diagnostics (e.g. circular chains) mean the
    // transform cannot represent the model: chained substitution leaves the
    // cycled DOFs with all-zero C rows, which silently drops their stiffness
    // AND their loads from the reduced system. That result must not be
    // presented as final.
    if let Some(d) = constraint_diags.iter().find(|d| d.severity == Severity::Error) {
        return Err(format!("Invalid constraints: {}", d.message));
    }

    // Build constraint transform on free DOFs only
    let ct = build_constraint_transform(
        &input.constraints, &dof_num,
        Some(&input.solver.nodes), None,
    );

    // Partition: free DOFs are 0..nf, restrained are nf..n
    let free_idx: Vec<usize> = (0..nf).collect();
    let rest_idx: Vec<usize> = (nf..n).collect();

    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
    let mut f_f = extract_subvec(&asm.f, &free_idx);

    // Modify for prescribed displacements
    let k_fr = extract_submatrix(&asm.k, n, &free_idx, &rest_idx);
    let k_fr_ur = mat_vec_rect(&k_fr, &u_r, nf, nr);
    for i in 0..nf {
        f_f[i] -= k_fr_ur[i];
    }

    // Extract the free part of C (rows for free DOFs only), sparse.
    let fcs = FreeConstraintSystem::from_transform(&ct, nf);
    let n_free_indep = fcs.n_free_indep;

    // Particular solution: free slaves of restrained (prescribed) masters must
    // follow them. u_f = C_ff * q + u_p with u_p = C_fr * u_r (restrained
    // independent columns of C times their prescribed values).
    let mut u_p = vec![0.0; nf];
    for (j, &d) in ct.independent_dofs.iter().enumerate() {
        if d >= nf {
            let v = u_r[d - nf];
            if v != 0.0 {
                for p in ct.c.col_ptr[j]..ct.c.col_ptr[j + 1] {
                    let i = ct.c.row_idx[p];
                    if i < nf {
                        u_p[i] += ct.c.csc_vals[p] * v;
                    }
                }
            }
        }
    }
    let has_up = u_p.iter().any(|&v| v != 0.0);
    // Kept only when has_up: K_ff*u_p, needed later to un-do the RHS
    // correction when recovering the true (non-double-counted) constraint
    // forces below.
    let mut k_ff_up_opt: Option<Vec<f64>> = None;
    if has_up {
        // RHS correction: f_f -= K_ff * u_p (the -K_fr*u_r term already exists).
        let k_ff_up = mat_vec_rect(&k_ff, &u_p, nf, nf);
        for i in 0..nf {
            f_f[i] -= k_ff_up[i];
        }
        k_ff_up_opt = Some(k_ff_up);
    }

    // K_reduced = C_ff^T * K_ff * C_ff
    // F_reduced = C_ff^T * F_f
    let k_reduced = fcs.reduce_matrix(&k_ff);
    let f_reduced = fcs.reduce_vector(&f_f);

    // Solve reduced system
    let mut used_fallback = false;
    let u_indep = {
        let mut k_work = k_reduced.clone();
        match cholesky_solve(&mut k_work, &f_reduced, n_free_indep) {
            Some(u) => u,
            None => {
                used_fallback = true;
                let mut k_work = k_reduced;
                let mut f_work = f_reduced.clone();
                lu_solve(&mut k_work, &mut f_work, n_free_indep)
                    .ok_or("Singular stiffness in constrained system")?
            }
        }
    };

    // Recover free DOF displacements: u_f = C_ff * u_indep
    let mut u_f = fcs.expand_solution(&u_indep);
    if has_up {
        for i in 0..nf {
            u_f[i] += u_p[i];
        }
    }

    // NaN/Inf guard, matching the unconstrained paths. `cholesky_solve` reports success on
    // any pivot > 1e-15 without inspecting the solved values, so a blown-up reduced system
    // can reach here as finite-looking `Some(..)`. Nothing downstream re-checks.
    super::linear::assert_finite_3d(&u_f)?;

    // Build full displacement vector
    let mut u_full = vec![0.0; n];
    for i in 0..nf { u_full[i] = u_f[i]; }
    for i in 0..nr { u_full[nf + i] = u_r[i]; }

    // Reactions
    let k_rf = extract_submatrix(&asm.k, n, &rest_idx, &free_idx);
    let k_rr = extract_submatrix(&asm.k, n, &rest_idx, &rest_idx);
    let f_r = extract_subvec(&asm.f, &rest_idx);
    let k_rf_uf = mat_vec_rect(&k_rf, &u_f, nr, nf);
    let k_rr_ur = mat_vec_rect(&k_rr, &u_r, nr, nr);
    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr {
        reactions_vec[i] = k_rf_uf[i] + k_rr_ur[i] - f_r[i];
    }

    // Compute constraint forces at dependent DOFs. Use f_f as it stood
    // *before* the K_ff*u_p correction above — that correction only exists
    // to keep the reduced (free-free) system's RHS consistent for solving
    // q; reusing the already-corrected f_f here would double-count u_p's
    // contribution and misreport the constraint force.
    let raw_forces = match &k_ff_up_opt {
        Some(k_ff_up) => {
            let mut f_f_true = f_f.clone();
            for i in 0..nf { f_f_true[i] += k_ff_up[i]; }
            fcs.compute_constraint_forces(&k_ff, &u_f, &f_f_true)
        }
        None => fcs.compute_constraint_forces(&k_ff, &u_f, &f_f),
    };
    let constraint_forces = map_dof_forces_to_constraint_forces(&raw_forces, &dof_num);

    // A constraint force carried into a RESTRAINED master is not otherwise
    // reflected anywhere: the master's own equilibrium row isn't part of the
    // reduced free-DOF system (its value is already known via u_r), so the
    // plain K_rf*u_f + K_rr*u_r - F_r reaction formula misses the force the
    // master-slave link transmits into that support. Add it back with the
    // same C^T redistribution used for the free-DOF reduction, restricted to
    // the restrained-independent columns of C — this keeps ΣReactions in
    // equilibrium with the applied load both for pure settlement (prescribed
    // u_r) and for a loaded slave tied to a fixed (u_r = 0) master.
    for &(i, g_i) in &raw_forces {
        for p in ct.c.row_ptr[i]..ct.c.row_ptr[i + 1] {
            let (j, coeff) = (ct.c.col_idx[p], ct.c.vals[p]);
            let d = ct.independent_dofs[j];
            if d >= nf {
                reactions_vec[d - nf] += coeff * g_i;
            }
        }
    }

    // Reverse inclined transforms on displacements before building results —
    // mirrors linear::solve_2d so the constrained path reports reactions and
    // displacements in the same GLOBAL axes as the equilibrium summary below
    // (reactions_vec/f_r stay in the rotated frame; only u_full is reversed).
    for it in &asm.inclined_transforms_2d {
        assembly::reverse_inclined_transform_2d(&mut u_full, &it.dofs, &it.r);
    }

    let displacements = linear::build_displacements_2d(&dof_num, &u_full);
    let mut reactions = linear::build_reactions_2d_inclined(
        &input.solver, &dof_num, &reactions_vec, &f_r, nf, &u_full, &asm.inclined_transforms_2d,
    );
    reactions.sort_by_key(|r| r.node_id);
    let mut element_forces = linear::compute_internal_forces_2d(
        &input.solver, &dof_num, &u_full,
    );
    element_forces.sort_by_key(|ef| ef.element_id);

    // Compute actual residual: ||K_ff*u_f - f_f|| / ||f_f||
    let rel_residual = {
        let mut res2 = 0.0f64;
        let mut fnorm2 = 0.0f64;
        for i in 0..nf {
            let mut ku_i = 0.0;
            for j in 0..nf {
                ku_i += k_ff[i * nf + j] * u_f[j];
            }
            let r = ku_i - f_f[i];
            res2 += r * r;
            fnorm2 += f_f[i] * f_f[i];
        }
        res2.sqrt() / fnorm2.sqrt().max(1e-30)
    };

    let equilibrium = linear::compute_equilibrium_summary_2d(&asm.f, &reactions_vec, &dof_num, rel_residual, &asm.inclined_transforms_2d);

    // Solver-path diagnostic — report the actual solver that produced the result
    let (path_code, path_sev) = if used_fallback {
        (DiagnosticCode::SparseFallbackDenseLu, Severity::Warning)
    } else {
        (DiagnosticCode::DenseLu, Severity::Info)
    };
    constraint_diags.push(StructuredDiagnostic::global(
        path_code,
        path_sev,
        format!("Constrained 2D {} ({} free DOFs, {} independent)",
            if used_fallback { "Cholesky failed, dense LU fallback" } else { "Dense" },
            nf, n_free_indep),
    ).with_phase("solve"));

    // Residual diagnostic
    constraint_diags.push(if rel_residual < 1e-6 {
        StructuredDiagnostic::global(
            DiagnosticCode::ResidualOk,
            Severity::Info,
            format!("Constrained 2D residual {:.2e}", rel_residual),
        ).with_value(rel_residual, 1e-6).with_phase("solve")
    } else {
        StructuredDiagnostic::global(
            DiagnosticCode::ResidualHigh,
            Severity::Warning,
            format!("Constrained 2D residual {:.2e} exceeds tolerance", rel_residual),
        ).with_value(rel_residual, 1e-6).with_phase("solve")
    });

    Ok(AnalysisResults {
        displacements,
        reactions,
        element_forces,
        constraint_forces,
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics: constraint_diags,
        equilibrium: Some(equilibrium),
        result_summary: None, solver_run_meta: None,
    })
}

/// Solve a 3D constrained analysis.
pub fn solve_constrained_3d(input: &ConstrainedInput3D) -> Result<AnalysisResults3D, String> {
    if input.constraints.is_empty() {
        return linear::solve_3d(&input.solver);
    }

    linear::validate_input_3d(&input.solver)?;

    // Constraint referential integrity
    let node_ids: HashSet<usize> = input.solver.nodes.values().map(|n| n.id).collect();
    validate_constraint_refs(&input.constraints, &node_ids, 6)?;

    let dof_num = DofNumbering::build_3d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let nr = n - nf;

    // Sparse assembly: k_ff (free block) + k_full (full n×n, for the
    // prescribed-DOF correction and reactions). The constrained path used to
    // assemble K densely (n×n) and reduce with a dense C (nf × n_indep) —
    // with a single rigid diaphragm that dominated both memory and time.
    let sasm = assembly::assemble_sparse_3d(&input.solver, &dof_num, true);
    // Every other precondition in this function returns Err, and it is reached
    // from the WASM dispatch — a panic here crosses the FFI boundary as an abort
    // rather than a solver message. Unreachable while the call above passes
    // `true`, which is exactly why it should not be an `expect`.
    let k_full = sasm
        .k_full
        .as_ref()
        .ok_or("internal: sparse assembly did not build the full stiffness matrix")?;
    let k_ff = &sasm.k_ff;

    // Build prescribed displacements
    let mut u_r = vec![0.0; nr];
    for sup in input.solver.supports.values() {
        // Inclined supports: prescribed translations are given in GLOBAL
        // coords; the restrained inclined DOF (local_dof 0) is the normal
        // direction in the rotated frame. Project onto the normal —
        // mirroring prepare_static_3d.
        if sup.is_inclined.unwrap_or(false) {
            if let (Some(nx), Some(ny), Some(nz)) = (sup.normal_x, sup.normal_y, sup.normal_z) {
                let n_len = (nx * nx + ny * ny + nz * nz).sqrt();
                if n_len > 1e-12 {
                    let u_normal = (nx * sup.dx.unwrap_or(0.0)
                        + ny * sup.dy.unwrap_or(0.0)
                        + nz * sup.dz.unwrap_or(0.0)) / n_len;
                    if u_normal.abs() > 1e-15 {
                        if let Some(&d) = dof_num.map.get(&(sup.node_id, 0)) {
                            if d >= nf { u_r[d - nf] = u_normal; }
                        }
                    }
                    for (i, pd) in [sup.drx, sup.dry, sup.drz].iter().enumerate() {
                        if let Some(val) = pd {
                            if val.abs() > 1e-15 {
                                if let Some(&d) = dof_num.map.get(&(sup.node_id, 3 + i)) {
                                    if d >= nf { u_r[d - nf] = *val; }
                                }
                            }
                        }
                    }
                    continue;
                }
            }
        }
        let prescribed = [sup.dx, sup.dy, sup.dz, sup.drx, sup.dry, sup.drz];
        for (i, pd) in prescribed.iter().enumerate() {
            if let Some(val) = pd {
                if val.abs() > 1e-15 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, i)) {
                        if d >= nf { u_r[d - nf] = *val; }
                    }
                }
            }
        }
    }

    // Pre-solve constraint validation
    let mut constraint_diags = validate_constraints(
        &input.constraints, &dof_num,
        None, Some(&input.solver.nodes),
    );

    // Error-severity constraint diagnostics (e.g. circular chains) mean the
    // transform cannot represent the model: chained substitution leaves the
    // cycled DOFs with all-zero C rows, which silently drops their stiffness
    // AND their loads from the reduced system. That result must not be
    // presented as final.
    if let Some(d) = constraint_diags.iter().find(|d| d.severity == Severity::Error) {
        return Err(format!("Invalid constraints: {}", d.message));
    }

    let ct = build_constraint_transform(
        &input.constraints, &dof_num,
        None, Some(&input.solver.nodes),
    );

    let mut f_f: Vec<f64> = sasm.f[..nf].to_vec();

    // Modify for prescribed displacements: f_f -= K_fr * u_r
    //
    // Guarded: `sparse_cross_block_matvec` walks every nonzero of the full n×n K,
    // and `u_r` is all zeros for every model whose supports prescribe no
    // settlement — which is nearly all of them. The `has_up` check below was
    // already doing this for the particular solution, but only after this scan
    // had run.
    let has_prescribed = u_r.iter().any(|&v| v != 0.0);
    if has_prescribed {
        let k_fr_ur = k_full.sparse_cross_block_matvec(&u_r, nf);
        for i in 0..nf {
            f_f[i] -= k_fr_ur[i];
        }
    }

    // Free part of C (rows 0..nf, free-independent columns), sparse.
    let fcs = FreeConstraintSystem::from_transform(&ct, nf);
    let n_free_indep = fcs.n_free_indep;

    // Particular solution: free slaves of restrained (prescribed) masters must
    // follow them. u_f = C_ff * q + u_p with u_p = C_fr * u_r (restrained
    // independent columns of C times their prescribed values).
    let mut u_p = vec![0.0; nf];
    for (j, &d) in ct.independent_dofs.iter().enumerate() {
        if d >= nf {
            let v = u_r[d - nf];
            if v != 0.0 {
                for p in ct.c.col_ptr[j]..ct.c.col_ptr[j + 1] {
                    let i = ct.c.row_idx[p];
                    if i < nf {
                        u_p[i] += ct.c.csc_vals[p] * v;
                    }
                }
            }
        }
    }
    let has_up = u_p.iter().any(|&v| v != 0.0);
    // Kept only when has_up: K_ff*u_p, needed later to un-do the RHS
    // correction when recovering the true (non-double-counted) constraint
    // forces below.
    let mut k_ff_up_opt: Option<Vec<f64>> = None;
    if has_up {
        // RHS correction: f_f -= K_ff * u_p (the -K_fr*u_r term already exists).
        let k_ff_up = k_ff.sym_mat_vec(&u_p);
        for i in 0..nf {
            f_f[i] -= k_ff_up[i];
        }
        k_ff_up_opt = Some(k_ff_up);
    }

    // K_reduced = C_ff^T * K_ff * C_ff, computed as a sparse triple product
    // over the triplets of K (near-linear in nnz(K) for MPC transforms).
    let k_reduced = fcs.reduce_matrix_sparse(k_ff);
    let f_reduced = fcs.reduce_vector(&f_f);

    let mut used_fallback = false;
    let u_indep = match sparse_cholesky_solve_full(&k_reduced, &f_reduced) {
        Some(u) => u,
        None => {
            used_fallback = true;
            let mut k_work = k_reduced.to_dense_symmetric();
            let mut f_work = f_reduced.clone();
            lu_solve(&mut k_work, &mut f_work, n_free_indep)
                .ok_or("Singular stiffness in 3D constrained system")?
        }
    };

    let mut u_f = fcs.expand_solution(&u_indep);
    if has_up {
        for i in 0..nf {
            u_f[i] += u_p[i];
        }
    }

    // NaN/Inf guard, matching the unconstrained paths. The sparse Cholesky
    // reports success on any pivot > 1e-15 without inspecting the solved
    // values, so a blown-up reduced system can reach here as finite-looking
    // `Some(..)`. Nothing downstream re-checks.
    super::linear::assert_finite_3d(&u_f)?;

    let mut u_full = vec![0.0; n];
    for i in 0..nf { u_full[i] = u_f[i]; }
    for i in 0..nr { u_full[nf + i] = u_r[i]; }

    // Reactions: R = K·u_full − F on the restrained rows, via the full
    // sparse K (covers both the K_rf·u_f and K_rr·u_r blocks).
    let f_r: Vec<f64> = sasm.f[nf..].to_vec();
    let ku_full = k_full.sym_mat_vec(&u_full);
    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr {
        reactions_vec[i] = ku_full[nf + i] - f_r[i];
    }

    // Compute constraint forces at dependent DOFs. Use f_f as it stood
    // *before* the K_ff*u_p correction above — that correction only exists
    // to keep the reduced (free-free) system's RHS consistent for solving
    // q; reusing the already-corrected f_f here would double-count u_p's
    // contribution and misreport the constraint force.
    let raw_forces = match &k_ff_up_opt {
        Some(k_ff_up) => {
            let mut f_f_true = f_f.clone();
            for i in 0..nf { f_f_true[i] += k_ff_up[i]; }
            fcs.compute_constraint_forces_sparse(k_ff, &u_f, &f_f_true)
        }
        None => fcs.compute_constraint_forces_sparse(k_ff, &u_f, &f_f),
    };
    let constraint_forces = map_dof_forces_to_constraint_forces(&raw_forces, &dof_num);

    // A constraint force carried into a RESTRAINED master is not otherwise
    // reflected anywhere: the master's own equilibrium row isn't part of the
    // reduced free-DOF system (its value is already known via u_r), so the
    // plain K_rf*u_f + K_rr*u_r - F_r reaction formula misses the force the
    // master-slave link transmits into that support. Add it back with the
    // same C^T redistribution used for the free-DOF reduction, restricted to
    // the restrained-independent columns of C — this keeps ΣReactions in
    // equilibrium with the applied load both for pure settlement (prescribed
    // u_r) and for a loaded slave tied to a fixed (u_r = 0) master.
    for &(i, g_i) in &raw_forces {
        for p in ct.c.row_ptr[i]..ct.c.row_ptr[i + 1] {
            let (j, coeff) = (ct.c.col_idx[p], ct.c.vals[p]);
            let d = ct.independent_dofs[j];
            if d >= nf {
                reactions_vec[d - nf] += coeff * g_i;
            }
        }
    }

    // Reverse inclined transforms on displacements before building results —
    // mirrors linear::solve_3d so the constrained path reports reactions and
    // displacements in the same GLOBAL axes as the equilibrium summary below
    // (reactions_vec/f_r stay in the rotated frame; only u_full is reversed).
    for it in &sasm.inclined_transforms {
        assembly::reverse_inclined_transform(&mut u_full, &it.dofs, &it.r);
    }

    let displacements = linear::build_displacements_3d(&dof_num, &u_full);
    let element_forces = linear::compute_internal_forces_3d(&input.solver, &dof_num, &u_full);

    // Build reactions for output
    let mut reactions = linear::build_reactions_3d_inclined(
        &input.solver, &dof_num, &reactions_vec, &f_r, nf, &u_full, &sasm.inclined_transforms,
    );
    reactions.sort_by_key(|r| r.node_id);

    // Compute actual residual: ||K_ff*u_f - f_f|| / ||f_f||
    let rel_residual = {
        let ku = k_ff.sym_mat_vec(&u_f);
        let mut res2 = 0.0f64;
        let mut fnorm2 = 0.0f64;
        for i in 0..nf {
            let r = ku[i] - f_f[i];
            res2 += r * r;
            fnorm2 += f_f[i] * f_f[i];
        }
        res2.sqrt() / fnorm2.sqrt().max(1e-30)
    };

    let equilibrium = linear::compute_equilibrium_summary_3d(&sasm.f, &reactions_vec, &dof_num, rel_residual, &sasm.inclined_transforms);

    // Solver-path diagnostic — report the actual solver that produced the result
    // One dispatch, not two: the label used to be re-derived by matching on the
    // code this `if` had just produced, with a catch-all arm that would silently
    // mislabel any path code added here later.
    let (path_code, path_sev, solver_label) = if used_fallback {
        (
            DiagnosticCode::SparseFallbackDenseLu,
            Severity::Warning,
            "Cholesky failed, dense LU fallback",
        )
    } else {
        (DiagnosticCode::SparseCholesky, Severity::Info, "Sparse Cholesky")
    };
    constraint_diags.push(StructuredDiagnostic::global(
        path_code,
        path_sev,
        format!("Constrained 3D {} ({} free DOFs, {} independent)", solver_label, nf, n_free_indep),
    ).with_phase("solve"));

    // Residual diagnostic
    constraint_diags.push(if rel_residual < 1e-6 {
        StructuredDiagnostic::global(
            DiagnosticCode::ResidualOk,
            Severity::Info,
            format!("Constrained 3D residual {:.2e}", rel_residual),
        ).with_value(rel_residual, 1e-6).with_phase("solve")
    } else {
        StructuredDiagnostic::global(
            DiagnosticCode::ResidualHigh,
            Severity::Warning,
            format!("Constrained 3D residual {:.2e} exceeds tolerance", rel_residual),
        ).with_value(rel_residual, 1e-6).with_phase("solve")
    });

    Ok(AnalysisResults3D {
        displacements,
        reactions,
        element_forces,
        // Shell stresses: recover from the constrained displacement field,
        // mirroring the unconstrained solve_3d branch. Without this, any model
        // with constraints (rigid diaphragms, eccentric connections, member/
        // shell offsets) returns no shell stresses → empty contours/tables.
        plate_stresses: linear::compute_plate_stresses(&input.solver, &dof_num, &u_full, None),
        quad_stresses: linear::compute_quad_stresses(&input.solver, &dof_num, &u_full, None),
        quad_nodal_stresses: linear::compute_quad_nodal_stresses(&input.solver, &dof_num, &u_full, None),
        constraint_forces,
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics: constraint_diags,
        equilibrium: Some(equilibrium),
        timings: None,
        result_summary: None, solver_run_meta: None,
    })
}

// ==================== Helper functions ====================

/// Get offset vector from master to slave node.
fn get_node_offset(
    master: usize,
    slave: usize,
    node_by_id_2d: Option<&HashMap<usize, &SolverNode>>,
    node_by_id_3d: Option<&HashMap<usize, &SolverNode3D>>,
) -> (f64, f64, f64) {
    if let Some(map) = node_by_id_2d {
        if let (Some(m), Some(s)) = (map.get(&master), map.get(&slave)) {
            return (s.x - m.x, s.z - m.z, 0.0);
        }
    }
    if let Some(map) = node_by_id_3d {
        if let (Some(m), Some(s)) = (map.get(&master), map.get(&slave)) {
            return (s.x - m.x, s.y - m.y, s.z - m.z);
        }
    }
    (0.0, 0.0, 0.0)
}

// ==================== Reusable Constraint System ====================

/// Pre-computed constraint system for use by any solver.
///
/// Encapsulates the C_ff matrix (free-free portion of the constraint
/// transform) so that any solver can easily reduce K, M, F and expand
/// the solution back to full DOFs.
pub struct FreeConstraintSystem {
    /// C_ff matrix: nf × n_free_indep, sparse (dual CSR/CSC)
    pub c_ff: SparseTransform,
    /// Number of free independent DOFs (reduced system size)
    pub n_free_indep: usize,
    /// Number of free DOFs (unreduced)
    pub nf: usize,
}

impl FreeConstraintSystem {
    /// Build a constraint system from constraints and DOF numbering.
    /// Returns None if there are no constraints.
    pub fn build_2d(
        constraints: &[Constraint],
        dof_num: &DofNumbering,
        nodes: &HashMap<String, SolverNode>,
    ) -> Option<Self> {
        if constraints.is_empty() { return None; }
        let nf = dof_num.n_free;
        let ct = build_constraint_transform(constraints, dof_num, Some(nodes), None);
        Some(Self::from_transform(&ct, nf))
    }

    /// Build a constraint system for 3D.
    pub fn build_3d(
        constraints: &[Constraint],
        dof_num: &DofNumbering,
        nodes: &HashMap<String, SolverNode3D>,
    ) -> Option<Self> {
        if constraints.is_empty() { return None; }
        let nf = dof_num.n_free;
        let ct = build_constraint_transform(constraints, dof_num, None, Some(nodes));
        Some(Self::from_transform(&ct, nf))
    }

    fn from_transform(ct: &ConstraintTransform, nf: usize) -> Self {
        // Keep only the free-independent columns, remapped to 0..n_free_indep.
        let mut col_map = vec![usize::MAX; ct.n_independent];
        let mut n_free_indep = 0;
        for (j_old, &d) in ct.independent_dofs.iter().enumerate() {
            if d < nf {
                col_map[j_old] = n_free_indep;
                n_free_indep += 1;
            }
        }

        // Slice rows 0..nf (free DOFs) and remap columns.
        let mut rows: Vec<Vec<(usize, f64)>> = vec![Vec::new(); nf];
        for i in 0..nf {
            for p in ct.c.row_ptr[i]..ct.c.row_ptr[i + 1] {
                let j_old = ct.c.col_idx[p];
                if col_map[j_old] != usize::MAX {
                    rows[i].push((col_map[j_old], ct.c.vals[p]));
                }
            }
        }

        FreeConstraintSystem {
            c_ff: SparseTransform::from_rows(nf, n_free_indep, rows),
            n_free_indep,
            nf,
        }
    }

    /// Reduce a dense symmetric matrix: K_reduced = C_ff^T * K_ff * C_ff
    /// (dense p×p out; the nonlinear/dynamic paths feed dense matrices).
    pub fn reduce_matrix(&self, k_ff: &[f64]) -> Vec<f64> {
        self.c_ff.reduce_dense(k_ff)
    }

    /// Reduce a sparse symmetric matrix (lower-triangle CSC):
    /// K_reduced = C_ff^T * K_ff * C_ff as lower-triangle CSC.
    pub fn reduce_matrix_sparse(&self, k_ff: &CscMatrix) -> CscMatrix {
        self.c_ff.reduce_sparse(k_ff)
    }

    /// Reduce a force vector: F_reduced = C_ff^T * F_f
    pub fn reduce_vector(&self, f_f: &[f64]) -> Vec<f64> {
        self.c_ff.mul_transpose_vec(f_f)
    }

    /// Expand solution: u_f = C_ff * u_indep
    pub fn expand_solution(&self, u_indep: &[f64]) -> Vec<f64> {
        self.c_ff.mul_vec(u_indep)
    }

    /// Map reduced-space DOF indices back to physical free DOF indices.
    ///
    /// For each column `j` of C_ff, find which physical DOF `i` has C_ff[i,j]=1
    /// (i.e., which physical DOF is the j-th independent DOF).
    pub fn map_reduced_to_physical(&self) -> Vec<usize> {
        let mut map = vec![0usize; self.n_free_indep];
        for j in 0..self.n_free_indep {
            for p in self.c_ff.col_ptr[j]..self.c_ff.col_ptr[j + 1] {
                let i = self.c_ff.row_idx[p];
                if (self.c_ff.csc_vals[p] - 1.0).abs() < 1e-14 && self.is_unit_row(i) {
                    map[j] = i;
                    break;
                }
            }
        }
        map
    }

    /// True if row i is the identity pattern: exactly one entry ≥ 1e-14 in
    /// magnitude and that entry is ≈ 1.0 (mirrors the dense checks, which
    /// treated sub-1e-14 entries as zero).
    fn unit_row_col(&self, i: usize) -> Option<usize> {
        let mut found = None;
        for p in self.c_ff.row_ptr[i]..self.c_ff.row_ptr[i + 1] {
            if self.c_ff.vals[p].abs() >= 1e-14 {
                if found.is_some() {
                    return None; // more than one significant entry
                }
                found = Some(p);
            }
        }
        let p = found?;
        if (self.c_ff.vals[p] - 1.0).abs() < 1e-14 {
            Some(self.c_ff.col_idx[p])
        } else {
            None
        }
    }

    fn is_unit_row(&self, i: usize) -> bool {
        self.unit_row_col(i).is_some()
    }

    /// Map a free DOF index to its position in the reduced (independent) space.
    /// Returns None if the DOF is dependent (constrained away).
    pub fn map_dof_to_reduced(&self, free_dof: usize) -> Option<usize> {
        if free_dof >= self.nf { return None; }
        self.unit_row_col(free_dof)
    }

    /// Compute constraint forces at dependent (constrained) DOFs.
    ///
    /// Constraint force = K_ff * u_f - F_f at dependent DOFs.
    /// These are the forces required to enforce the constraints.
    pub fn compute_constraint_forces(
        &self,
        k_ff: &[f64],
        u_f: &[f64],
        f_f: &[f64],
    ) -> Vec<(usize, f64)> {
        // Residual = K_ff * u_f - F_f
        let mut residual = vec![0.0; self.nf];
        for i in 0..self.nf {
            let mut ku = 0.0;
            for j in 0..self.nf {
                ku += k_ff[i * self.nf + j] * u_f[j];
            }
            residual[i] = ku - f_f[i];
        }
        self.collect_dependent_forces(&residual)
    }

    /// Same, with K_ff in sparse (lower-triangle CSC) form.
    pub fn compute_constraint_forces_sparse(
        &self,
        k_ff: &CscMatrix,
        u_f: &[f64],
        f_f: &[f64],
    ) -> Vec<(usize, f64)> {
        let ku = k_ff.sym_mat_vec(u_f);
        let residual: Vec<f64> = (0..self.nf).map(|i| ku[i] - f_f[i]).collect();
        self.collect_dependent_forces(&residual)
    }

    fn collect_dependent_forces(&self, residual: &[f64]) -> Vec<(usize, f64)> {
        let mut forces = Vec::new();
        for i in 0..self.nf {
            // Dependent DOFs are those not in the identity pattern of C_ff
            if self.map_dof_to_reduced(i).is_none() {
                if residual[i].abs() > 1e-15 {
                    forces.push((i, residual[i]));
                }
            }
        }
        forces
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Pins the sparse triple product: reduce_sparse must equal reduce_dense
    /// (and a naive C^T·K·C) entry by entry. Regression test for a bug where
    /// ordered (j,j') and (j',j) emissions were merged by from_triplets and
    /// double-counted the off-diagonal.
    #[test]
    fn sparse_reduce_matches_dense_reduce() {
        // C: 5 physical rows, 2 independent columns. Rows 2..4 depend on the
        // independent ones: equal-dof (single entry) and diaphragm-style
        // kinematics (two entries with an offset coefficient).
        let c = SparseTransform::from_rows(5, 2, vec![
            vec![(0usize, 1.0f64)],
            vec![(1, 1.0)],
            vec![(0, 1.0)],
            vec![(1, 1.0)],
            vec![(0, 1.0), (1, 0.5)],
        ]);

        let n = 5;
        let mut k = vec![0.0; n * n];
        for i in 0..n {
            for j in 0..n {
                k[i * n + j] = (10 * i + j + 1) as f64;
                k[j * n + i] = k[i * n + j];
            }
        }

        let dense_red = c.reduce_dense(&k);
        let sparse_red = c.reduce_sparse(&CscMatrix::from_dense_symmetric(&k, n)).to_dense_symmetric();

        // Naive reference from the row lists.
        let rows_of_c: [Vec<(usize, f64)>; 5] = [
            vec![(0, 1.0)], vec![(1, 1.0)], vec![(0, 1.0)], vec![(1, 1.0)], vec![(0, 1.0), (1, 0.5)],
        ];
        let mut naive = vec![0.0; 4];
        for (j, j2) in [(0usize, 0usize), (0, 1), (1, 0), (1, 1)] {
            let mut s = 0.0;
            for l in 0..n {
                for l2 in 0..n {
                    for &(cj, vj) in &rows_of_c[l] {
                        for &(cj2, vj2) in &rows_of_c[l2] {
                            if cj == j && cj2 == j2 {
                                s += vj * k[l * n + l2] * vj2;
                            }
                        }
                    }
                }
            }
            naive[j * 2 + j2] = s;
        }

        for i in 0..4 {
            assert!((dense_red[i] - naive[i]).abs() < 1e-9, "dense[{i}]={} naive={}", dense_red[i], naive[i]);
            assert!((sparse_red[i] - naive[i]).abs() < 1e-9, "sparse[{i}]={} naive={}", sparse_red[i], naive[i]);
        }
    }

    fn make_two_beam_model() -> SolverInput {
        // Two beams: 0--1--2, all frame elements, node 0 fixed, node 2 has load
        let mut nodes = HashMap::new();
        nodes.insert("0".into(), SolverNode { id: 0, x: 0.0, z: 0.0 });
        nodes.insert("1".into(), SolverNode { id: 1, x: 5.0, z: 0.0 });
        nodes.insert("2".into(), SolverNode { id: 2, x: 10.0, z: 0.0 });

        let mut materials = HashMap::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".into(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });

        let mut elements = HashMap::new();
        elements.insert("1".into(), SolverElement {
            id: 1, elem_type: "frame".into(),
            node_i: 0, node_j: 1, material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
        elements.insert("2".into(), SolverElement {
            id: 2, elem_type: "frame".into(),
            node_i: 1, node_j: 2, material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });

        let mut supports = HashMap::new();
        supports.insert("0".into(), SolverSupport {
            id: 0, node_id: 0, support_type: "fixed".into(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None, angle: None,
        });

        SolverInput {
            nodes, materials, sections, elements, supports,
            loads: vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2, fx: 0.0, fz: -10.0, my: 0.0,
            })],
            constraints: vec![],
            connectors: HashMap::new(),
        }
    }

    #[test]
    fn test_no_constraints_matches_linear() {
        let solver = make_two_beam_model();
        let linear_result = linear::solve_2d(&solver).unwrap();

        let input = ConstrainedInput {
            solver: solver.clone(),
            constraints: vec![],
        };
        let constrained_result = solve_constrained_2d(&input).unwrap();

        // Displacements should match
        for (a, b) in linear_result.displacements.iter().zip(&constrained_result.displacements) {
            assert!((a.ux - b.ux).abs() < 1e-10, "ux mismatch at node {}", a.node_id);
            assert!((a.uz - b.uz).abs() < 1e-10, "uz mismatch at node {}", a.node_id);
            assert!((a.ry - b.ry).abs() < 1e-10, "ry mismatch at node {}", a.node_id);
        }
    }

    #[test]
    fn test_equal_dof_constraint() {
        // Constrain node 2 uy = node 1 uy
        let solver = make_two_beam_model();
        let input = ConstrainedInput {
            solver,
            constraints: vec![Constraint::EqualDOF(EqualDOFConstraint {
                master_node: 1,
                slave_node: 2,
                dofs: vec![1], // uy only
            })],
        };
        let result = solve_constrained_2d(&input).unwrap();

        // Check that uy at node 1 = uy at node 2
        let uy1 = result.displacements.iter().find(|d| d.node_id == 1).unwrap().uz;
        let uy2 = result.displacements.iter().find(|d| d.node_id == 2).unwrap().uz;
        assert!((uy1 - uy2).abs() < 1e-10, "EqualDOF failed: uy1={} uy2={}", uy1, uy2);
    }

    #[test]
    fn test_rigid_link_equal_dof_equivalence() {
        // Rigid link with all translational DOFs should produce same constraint as EqualDOF
        // on translational DOFs (rotation offset terms vanish when rigid link couples rotations too)
        let solver = make_two_beam_model();

        // EqualDOF on uy
        let input_eq = ConstrainedInput {
            solver: solver.clone(),
            constraints: vec![Constraint::EqualDOF(EqualDOFConstraint {
                master_node: 1,
                slave_node: 2,
                dofs: vec![1],
            })],
        };
        let result_eq = solve_constrained_2d(&input_eq).unwrap();

        // The constraint should produce valid results (no NaN)
        let d2 = result_eq.displacements.iter().find(|d| d.node_id == 2).unwrap();
        assert!(d2.uz.is_finite(), "EqualDOF uz should be finite: {}", d2.uz);
    }

    #[test]
    fn test_rigid_link_with_offset() {
        // Rigid link: slave at offset from master
        // u_slave_y = u_master_y + dx * rz_master
        let solver = make_two_beam_model();
        let input = ConstrainedInput {
            solver,
            constraints: vec![Constraint::RigidLink(RigidLinkConstraint {
                master_node: 1,
                slave_node: 2,
                dofs: vec![0, 1], // ux, uy
            })],
        };
        let result = solve_constrained_2d(&input).unwrap();

        let d1 = result.displacements.iter().find(|d| d.node_id == 1).unwrap();
        let d2 = result.displacements.iter().find(|d| d.node_id == 2).unwrap();

        // dx = 5.0 (node 2 at x=10, node 1 at x=5)
        let dx = 5.0;
        let expected_uy = d1.uz + dx * d1.ry;
        assert!(
            (d2.uz - expected_uy).abs() < 1e-8,
            "RigidLink offset: uz2={} expected={} (uz1={}, ry1={}, dx={})",
            d2.uz, expected_uy, d1.uz, d1.ry, dx
        );
    }

    #[test]
    fn test_diaphragm_constraint() {
        // 4-node frame: 0 fixed, 1-2-3 at same level, diaphragm couples 2,3 to master 1
        let mut nodes = HashMap::new();
        nodes.insert("0".into(), SolverNode { id: 0, x: 0.0, z: 0.0 });
        nodes.insert("1".into(), SolverNode { id: 1, x: 0.0, z: 5.0 });
        nodes.insert("2".into(), SolverNode { id: 2, x: 5.0, z: 5.0 });
        nodes.insert("3".into(), SolverNode { id: 3, x: 5.0, z: 0.0 });

        let mut materials = HashMap::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".into(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });

        let mut elements = HashMap::new();
        elements.insert("1".into(), SolverElement {
            id: 1, elem_type: "frame".into(),
            node_i: 0, node_j: 1, material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
        elements.insert("2".into(), SolverElement {
            id: 2, elem_type: "frame".into(),
            node_i: 1, node_j: 2, material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
        elements.insert("3".into(), SolverElement {
            id: 3, elem_type: "frame".into(),
            node_i: 3, node_j: 2, material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });

        let mut supports = HashMap::new();
        supports.insert("0".into(), SolverSupport {
            id: 0, node_id: 0, support_type: "fixed".into(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None, angle: None,
        });
        supports.insert("3".into(), SolverSupport {
            id: 3, node_id: 3, support_type: "fixed".into(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None, angle: None,
        });

        let solver = SolverInput {
            nodes, materials, sections, elements, supports,
            loads: vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 1, fx: 10.0, fz: 0.0, my: 0.0,
            })],
            constraints: vec![],
            connectors: HashMap::new(),
        };

        let input = ConstrainedInput {
            solver,
            constraints: vec![Constraint::Diaphragm(DiaphragmConstraint {
                master_node: 1,
                slave_nodes: vec![2],
                plane: "XY".into(),
            })],
        };

        let result = solve_constrained_2d(&input).unwrap();

        // With diaphragm, node 2's ux should follow node 1's rigid body motion
        let d1 = result.displacements.iter().find(|d| d.node_id == 1).unwrap();
        let d2 = result.displacements.iter().find(|d| d.node_id == 2).unwrap();

        // ux_2 = ux_1 - dy * rz_1, dy = 0 (same y level)
        // uy_2 = uy_1 + dx * rz_1, dx = 5
        let dx = 5.0;
        let expected_ux = d1.ux; // dy = 0
        let expected_uy = d1.uz + dx * d1.ry;
        assert!((d2.ux - expected_ux).abs() < 1e-8,
            "Diaphragm ux: got {} expected {}", d2.ux, expected_ux);
        assert!((d2.uz - expected_uy).abs() < 1e-8,
            "Diaphragm uz: got {} expected {}", d2.uz, expected_uy);
    }

    #[test]
    fn test_circular_constraint_chain_returns_error() {
        // A -> B -> A EqualDOF cycle: the transformation method cannot
        // represent it (both DOFs become dependent with all-zero C rows,
        // silently dropping their stiffness and loads). Must be a hard
        // error, not partial results presented as final.
        let solver = make_two_beam_model();
        let input = ConstrainedInput {
            solver,
            constraints: vec![
                Constraint::EqualDOF(EqualDOFConstraint {
                    master_node: 2, slave_node: 1, dofs: vec![1],
                }),
                Constraint::EqualDOF(EqualDOFConstraint {
                    master_node: 1, slave_node: 2, dofs: vec![1],
                }),
            ],
        };
        let err = solve_constrained_2d(&input).unwrap_err();
        assert!(err.contains("Invalid constraints"),
            "expected hard error for circular constraint chain, got: {}", err);
    }

    #[test]
    fn test_diaphragm_3d_xy_plane_couples_rz_not_uz() {
        // 3D cantilever beam along X with lateral load at tip.
        // Diaphragm in XY plane at tip should couple ux, uy, rz (DOF 0,1,5),
        // NOT ux, uy, uz (DOF 0,1,2).
        //
        // If the bug is present (dr=2=uz), the slave node's in-plane displacement
        // will be coupled to the master's vertical translation instead of its
        // torsional rotation — producing wrong results.

        let mut nodes = HashMap::new();
        nodes.insert("0".into(), SolverNode3D { id: 0, x: 0.0, y: 0.0, z: 0.0 });
        nodes.insert("1".into(), SolverNode3D { id: 1, x: 5.0, y: 0.0, z: 0.0 }); // master tip
        nodes.insert("2".into(), SolverNode3D { id: 2, x: 5.0, y: 2.0, z: 0.0 }); // slave, offset in Y

        let mut materials = HashMap::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".into(), SolverSection3D {
            id: 1, name: None, a: 0.01, iy: 1e-4, iz: 1e-4, j: 2e-4,
            cw: None, as_y: None, as_z: None,
        });

        let mut elements = HashMap::new();
        elements.insert("1".into(), SolverElement3D {
            id: 1, elem_type: "frame".into(), node_i: 0, node_j: 1,
            material_id: 1, section_id: 1,
            release_my_start: false, release_my_end: false,
            release_mz_start: false, release_mz_end: false,
            release_t_start: false, release_t_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
        elements.insert("2".into(), SolverElement3D {
            id: 2, elem_type: "frame".into(), node_i: 0, node_j: 2,
            material_id: 1, section_id: 1,
            release_my_start: false, release_my_end: false,
            release_mz_start: false, release_mz_end: false,
            release_t_start: false, release_t_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });

        let mut supports = HashMap::new();
        supports.insert("0".into(), SolverSupport3D {
            node_id: 0,
            rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
            kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
            rw: None, kw: None,
        });

        let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 1, fx: 0.0, fy: 10.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 5.0, bw: None,
        })];

        let solver = SolverInput3D {
            nodes, materials, sections, elements, supports, loads,
            constraints: vec![], left_hand: None,
            plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(),
            solid_shells: HashMap::new(), curved_beams: vec![],
            curved_shells: HashMap::new(), connectors: HashMap::new(),
        };
        let input_no_dia = ConstrainedInput3D {
            solver: solver.clone(),
            constraints: vec![],
        };
        let input_with_dia = ConstrainedInput3D {
            solver,
            constraints: vec![Constraint::Diaphragm(DiaphragmConstraint {
                master_node: 1,
                slave_nodes: vec![2],
                plane: "XY".into(),
            })],
        };

        let res_free = solve_constrained_3d(&input_no_dia).unwrap();
        let res_dia = solve_constrained_3d(&input_with_dia).unwrap();

        let d1_dia = res_dia.displacements.iter().find(|d| d.node_id == 1).unwrap();
        let d2_dia = res_dia.displacements.iter().find(|d| d.node_id == 2).unwrap();
        let d2_free = res_free.displacements.iter().find(|d| d.node_id == 2).unwrap();

        // Master should have non-zero rz (torsion from mz load)
        assert!(d1_dia.rz.abs() > 1e-10,
            "Master should have non-zero rz rotation, got {}", d1_dia.rz);

        // Key check: with XY diaphragm, slave's ux should be coupled to master's rz.
        // ux_slave = ux_master - dy * rz_master (dy = 2.0)
        let dy = 2.0;
        let expected_ux = d1_dia.ux - dy * d1_dia.rz;
        assert!((d2_dia.ux - expected_ux).abs() < 1e-6,
            "3D XY diaphragm: ux_slave should follow rz coupling.\n\
             got ux_slave={:.6e}, expected={:.6e} (ux_m={:.6e}, rz_m={:.6e}, dy={})",
            d2_dia.ux, expected_ux, d1_dia.ux, d1_dia.rz, dy);

        // The diaphragm should change the slave's displacement compared to free
        assert!((d2_dia.ux - d2_free.ux).abs() > 1e-10,
            "Diaphragm should actually constrain the slave node's motion");
    }

    #[test]
    fn test_inclined_support_prescribed_displacement_matches_unconstrained() {
        // An inclinedRoller with a prescribed settlement: prescribed (dx, dz)
        // are GLOBAL and must be rotated into the inclined frame. The
        // constrained solve used to assign raw dz to the restrained (normal)
        // slot; prepare_static_2d rotates. Parity between the two paths is
        // the reference.
        let theta = std::f64::consts::FRAC_PI_4;
        let delta = 0.001;

        let mut solver = make_two_beam_model();
        // Replace the fixed support at node 0 with an inclined roller
        // carrying a prescribed global settlement, and fix node 2 instead so
        // the model stays stable.
        solver.supports.clear();
        solver.supports.insert("0".into(), SolverSupport {
            id: 0, node_id: 0, support_type: "inclinedRoller".into(),
            kx: None, ky: None, kz: None,
            dx: Some(delta), dz: Some(delta), dry: None, angle: Some(theta),
        });
        solver.supports.insert("2".into(), SolverSupport {
            id: 2, node_id: 2, support_type: "fixed".into(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None, angle: None,
        });
        solver.loads = vec![];

        // Reference: plain linear solve (rotates prescribed displacements).
        let reference = linear::solve_2d(&solver).unwrap();

        // Constrained path (dummy-but-real constraint forces the delegation).
        let input = ConstrainedInput {
            solver: solver.clone(),
            constraints: vec![Constraint::EqualDOF(EqualDOFConstraint {
                master_node: 0, slave_node: 1, dofs: vec![2],
            })],
        };
        let constrained = solve_constrained_2d(&input).unwrap();

        let d0_ref = reference.displacements.iter().find(|d| d.node_id == 0).unwrap();
        let d0_con = constrained.displacements.iter().find(|d| d.node_id == 0).unwrap();

        // The prescribed DOF is the normal-direction displacement:
        // u_normal = dx·sinθ + dz·cosθ = δ√2.
        let expected = delta * 2.0 * std::f64::consts::FRAC_1_SQRT_2;
        let u_normal_ref = d0_ref.ux * theta.sin() + d0_ref.uz * theta.cos();
        assert!((u_normal_ref - expected).abs() < 1e-12,
            "reference path: normal disp {} expected {}", u_normal_ref, expected);

        let u_normal_con = d0_con.ux * theta.sin() + d0_con.uz * theta.cos();
        assert!((u_normal_con - expected).abs() < 1e-12,
            "constrained path: normal disp {} expected {} (raw-dz bug would give {})",
            u_normal_con, expected, delta);
    }
}
