use crate::solver::support::{support_dofs_2d, support_dofs_3d};
use crate::types::*;
use crate::element::*;
use crate::linalg::*;
use crate::linalg::sparse::CscMatrix;
use super::dof::DofNumbering;

/// Maps 12-DOF element indices to 14-DOF positions, skipping warping DOFs 6 and 13.
pub(crate) const DOF_MAP_12_TO_14: [usize; 12] = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];

/// Assembly result: global stiffness matrix and force vector.
pub struct AssemblyResult {
    pub k: Vec<f64>,       // n_total × n_total stiffness matrix
    pub f: Vec<f64>,       // n_total force vector
    pub max_diag_k: f64,   // Maximum diagonal element (for artificial stiffness)
    pub artificial_dofs: Vec<usize>, // DOFs with artificial stiffness added
    pub inclined_transforms: Vec<InclinedTransformData>, // Data for reversing 3D inclined support rotations
    pub inclined_transforms_2d: Vec<InclinedTransformData2D>, // Data for reversing 2D inclined support rotations
    pub diagnostics: Vec<crate::types::AssemblyDiagnostic>, // Element quality warnings
}

/// The artificial stiffness the linear assembler put on DOFs nothing else
/// holds (the rotation of a node that only trusses, or only members hinged
/// there, reach), as (DOF, stiffness) pairs for the nonlinear solvers.
///
/// Their tangents are assembled from the members alone and had none: the
/// rotation of a truss-only node in a frame left the tangent singular, so
/// co-rotational, arc-length, displacement-control, material- and
/// fiber-nonlinear analyses refused a model the linear solver answers.
pub fn artificial_stiffness_entries(asm: &AssemblyResult) -> Vec<(usize, f64)> {
    let k = artificial_stiffness(asm.max_diag_k);
    asm.artificial_dofs.iter().map(|&d| (d, k)).collect()
}

thread_local! {
    static ARTIFICIAL_STIFFNESS: std::cell::Cell<bool> = const { std::cell::Cell::new(true) };
}

pub(super) fn artificial_stiffness(max_diag: f64) -> f64 {
    if !ARTIFICIAL_STIFFNESS.with(|a| a.get()) {
        return 0.0;
    }
    if max_diag > 0.0 { max_diag * 1e-10 } else { 1e-6 }
}

pub(crate) fn without_artificial_stiffness<T>(f: impl FnOnce() -> T) -> T {
    if super::stability::assumed() {
        return f();
    }
    struct Restore(bool);
    impl Drop for Restore {
        fn drop(&mut self) {
            ARTIFICIAL_STIFFNESS.with(|a| a.set(self.0));
        }
    }
    let _restore = Restore(ARTIFICIAL_STIFFNESS.with(|a| a.replace(false)));
    f()
}

/// Free rotation DOFs (θx, θy, θz) that no element, spring or connector
/// stiffens: the rotations of a node reached only by solid shells (whose
/// nodes carry translations alone), trusses, or members released there.
///
/// K is a sum of positive semi-definite contributions, so a zero diagonal
/// means a zero row and column: the DOF is decoupled from the rest of the
/// model and its stiffness does not change any other DOF's answer. Each gets
/// the same artificial stiffness the warping DOFs and the 2D orphan guard
/// get, instead of leaving K singular (a solid-shell model meshed together
/// with frames or shells was refused as "a mechanism" on every path). A load
/// on such a DOF would be lost; `validate_loads_3d` and the linear solver
/// refuse that.
///
/// Nodes a constraint references are left out: there a rotation without
/// element stiffness may be tied to another node's (an eccentric arm, an
/// EqualDOF), and once the constraint is imposed an artificial spring on it
/// would become a real spring to ground on the structure. If such a tied
/// rotation has no stiffness anywhere the model stays singular and is refused.
pub(crate) fn orphan_rotation_dofs_3d(input: &SolverInput3D, dof_num: &DofNumbering, diag: impl Fn(usize) -> f64) -> Vec<usize> {
    if dof_num.dofs_per_node < 6 {
        return Vec::new();
    }
    let tied = constraint_nodes(&input.constraints);
    orphan_rotation_dofs(dof_num, 3..6, |node| tied.contains(&node), diag)
}

pub(crate) fn constraint_nodes(constraints: &[Constraint]) -> std::collections::HashSet<usize> {
    let mut tied: std::collections::HashSet<usize> = std::collections::HashSet::new();
    for c in constraints {
        match c {
            Constraint::RigidLink(r) => { tied.insert(r.master_node); tied.insert(r.slave_node); }
            Constraint::Diaphragm(d) => { tied.insert(d.master_node); tied.extend(d.slave_nodes.iter().copied()); }
            Constraint::LinearMPC(m) => tied.extend(m.terms.iter().map(|t| t.node_id)),
            Constraint::EqualDOF(e) => { tied.insert(e.master_node); tied.insert(e.slave_node); }
            Constraint::EccentricConnection(e) => { tied.insert(e.master_node); tied.insert(e.slave_node); }
        }
    }
    tied
}

/// Free rotation DOFs whose diagonal is zero, or at round-off of the largest
/// rotational diagonal of the same node. Never measured against the model's
/// largest: a real but soft rotation in a model with a stiff part elsewhere
/// would be locked by the artificial spring.
pub(crate) fn orphan_rotation_dofs(dof_num: &DofNumbering, locals: std::ops::Range<usize>, skip: impl Fn(usize) -> bool, diag: impl Fn(usize) -> f64) -> Vec<usize> {
    let mut out = Vec::new();
    for &node_id in &dof_num.node_order {
        if skip(node_id) {
            continue;
        }
        let rots: Vec<usize> = locals.clone().filter_map(|l| dof_num.map.get(&(node_id, l)).copied()).collect();
        let scale = rots.iter().fold(0.0f64, |m, &d| m.max(diag(d).abs()));
        out.extend(rots.into_iter().filter(|&d| d < dof_num.n_free && diag(d).abs() <= 1e-12 * scale));
    }
    out
}

pub(crate) fn orphan_rotation_dofs_2d(input: &SolverInput, dof_num: &DofNumbering, diag: impl Fn(usize) -> f64) -> Vec<usize> {
    if dof_num.dofs_per_node < 3 {
        return Vec::new();
    }
    let tied = rotation_tied_nodes_2d(input);
    orphan_rotation_dofs(dof_num, 2..3, |node| tied.contains(&node), diag)
}

/// Data needed to reverse the inclined support rotation after solving (3D).
pub struct InclinedTransformData {
    pub node_id: usize,
    pub dofs: [usize; 3],        // Global DOF indices for ux, uy, uz
    pub r: [[f64; 3]; 3],        // Rotation matrix (rows = local axes)
}

/// 2D nodes whose rotation a connector stiffens: through its rotational
/// spring, or through the rigid arms of a finite-length shear spring.
pub(crate) fn connector_rotation_nodes_2d(input: &SolverInput) -> std::collections::HashSet<usize> {
    let node_xz: std::collections::HashMap<usize, (f64, f64)> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, (n.x, n.z))).collect();
    let mut out = std::collections::HashSet::new();
    for c in crate::ordered::values(&input.connectors) {
        let l = match (node_xz.get(&c.node_i), node_xz.get(&c.node_j)) {
            (Some(a), Some(b)) => ((b.0 - a.0).powi(2) + (b.1 - a.1).powi(2)).sqrt(),
            _ => 0.0,
        };
        if c.k_moment > 0.0 || (c.k_shear > 0.0 && l > crate::element::connector::ZERO_LENGTH) {
            out.extend([c.node_i, c.node_j]);
        }
    }
    out
}

/// 2D nodes whose rotation a constraint or a connector ties to other DOFs.
/// An artificial rotational spring on such a node is not inert: it becomes a
/// real spring on the structure, and a mechanism it holds solves with a
/// confident wrong answer. The 3D assembler already leaves constraint nodes
/// out (`orphan_rotation_dofs_3d`).
pub(crate) fn rotation_tied_nodes_2d(input: &SolverInput) -> std::collections::HashSet<usize> {
    let mut tied = connector_rotation_nodes_2d(input);
    tied.extend(constraint_rotation_nodes_2d(input));
    tied
}

fn constraint_rotation_nodes_2d(input: &SolverInput) -> std::collections::HashSet<usize> {
    let mut tied = std::collections::HashSet::new();
    for c in &input.constraints {
        match c {
            Constraint::RigidLink(r) => {
                tied.insert(r.master_node);
                if r.dofs.is_empty() || r.dofs.contains(&2) { tied.insert(r.slave_node); }
            }
            Constraint::Diaphragm(d) => { tied.insert(d.master_node); tied.extend(d.slave_nodes.iter().copied()); }
            Constraint::EqualDOF(e) => {
                if e.dofs.contains(&2) { tied.extend([e.master_node, e.slave_node]); }
            }
            Constraint::EccentricConnection(e) => {
                tied.insert(e.master_node);
                if !e.releases.get(2).copied().unwrap_or(false) { tied.insert(e.slave_node); }
            }
            Constraint::LinearMPC(m) => tied.extend(m.terms.iter().filter(|t| t.dof == 2).map(|t| t.node_id)),
        }
    }
    tied
}

/// Refuses a 3D model whose connectors leave a combination of node rotations
/// with no stiffness, as on two truss-only nodes joined by a finite-length
/// connector with shear springs and no rotational springs: its rigid arms hold
/// only the mean rotation across its axis, so the opposite rotations across it
/// and the common twist about it cost no energy. The rotations of the nodes
/// connectors couple, with every rotation K couples to them in turn, are
/// checked on the assembled K, so partial member releases, rotational springs and supports
/// count in each rotation DOF exactly: K is positive semi-definite, so a null
/// vector of that block is one of K. Each connected block is factored and its
/// pivots judged against `SINGULAR_PIVOT_RATIO`; a block made indefinite by a
/// negative spring, with no round-off pivot, is left to the analyses' own
/// instability refusals. Only constraints that tie a
/// rotation leave their nodes out (#1749); a rotation the orphan guard holds
/// with artificial stiffness keeps it, as the solve does.
pub(crate) fn refuse_connector_arm_mechanism_3d(input: &SolverInput3D) -> Result<(), String> {
    use std::collections::{BTreeMap, BTreeSet, HashSet};
    if input.connectors.is_empty() || DofNumbering::dofs_per_node_3d(input) < 6 {
        return Ok(());
    }
    let rotation = |d: &usize| (3..6).contains(d);
    let mut tied: HashSet<usize> = HashSet::new();
    for c in &input.constraints {
        match c {
            Constraint::RigidLink(r) => {
                tied.insert(r.master_node);
                if r.dofs.iter().any(rotation) { tied.insert(r.slave_node); }
            }
            Constraint::Diaphragm(d) => { tied.insert(d.master_node); tied.extend(d.slave_nodes.iter().copied()); }
            Constraint::LinearMPC(m) => tied.extend(m.terms.iter().filter(|t| rotation(&t.dof)).map(|t| t.node_id)),
            Constraint::EqualDOF(e) => {
                if e.dofs.iter().any(rotation) { tied.extend([e.master_node, e.slave_node]); }
            }
            Constraint::EccentricConnection(e) => {
                tied.insert(e.master_node);
                if (3..6).any(|i| !e.releases.get(i).copied().unwrap_or(false)) { tied.insert(e.slave_node); }
            }
        }
    }
    let coords: std::collections::HashMap<usize, [f64; 3]> = crate::ordered::values(&input.nodes).map(|n| (n.id, [n.x, n.y, n.z])).collect();
    let connectors = crate::element::connector::sorted_by_id(&input.connectors);
    let couples = |c: &ConnectorElement| {
        let finite = match (coords.get(&c.node_i), coords.get(&c.node_j)) {
            (Some(a), Some(b)) => ((b[0] - a[0]).powi(2) + (b[1] - a[1]).powi(2) + (b[2] - a[2]).powi(2)).sqrt() > crate::element::connector::ZERO_LENGTH,
            _ => false,
        };
        [c.k_moment, c.k_bend_y, c.k_bend_z].iter().any(|&k| k != 0.0) || (finite && (c.k_shear != 0.0 || c.k_shear_z != 0.0))
    };
    let nodes: BTreeSet<usize> = connectors
        .iter()
        .filter(|c| couples(c))
        .flat_map(|c| [c.node_i, c.node_j])
        .filter(|n| !tied.contains(n))
        .collect();
    if nodes.is_empty() {
        return Ok(());
    }
    let dof_num = DofNumbering::build_3d(input);
    let asm = assemble_stiffness_sparse_3d(input, &dof_num, false);
    let artificial: HashSet<usize> = asm.artificial_dofs.iter().copied().collect();
    let mut owner: BTreeMap<usize, usize> = BTreeMap::new();
    for (&(node, local), &d) in &dof_num.map {
        if (3..6).contains(&local) && d < dof_num.n_free && !tied.contains(&node) {
            owner.insert(d, node);
        }
    }
    let k = &asm.k_ff;
    let mut adjacent: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
    for col in 0..k.n {
        if !owner.contains_key(&col) || artificial.contains(&col) { continue; }
        for p in k.col_ptr[col]..k.col_ptr[col + 1] {
            let row = k.row_idx[p];
            if row != col && k.values[p] != 0.0 && owner.contains_key(&row) && !artificial.contains(&row) {
                adjacent.entry(row).or_default().push(col);
                adjacent.entry(col).or_default().push(row);
            }
        }
    }
    let mut seen: HashSet<usize> = HashSet::new();
    let starts: Vec<usize> = owner.iter().filter(|(_, n)| nodes.contains(n)).map(|(&d, _)| d).collect();
    for start in starts {
        if !seen.insert(start) { continue; }
        let mut group = vec![start];
        let mut next = 0;
        while next < group.len() {
            let d = group[next];
            next += 1;
            for &e in adjacent.get(&d).map(Vec::as_slice).unwrap_or(&[]) {
                if seen.insert(e) { group.push(e); }
            }
        }
        group.sort_unstable();
        let at: std::collections::HashMap<usize, usize> = group.iter().enumerate().map(|(i, &d)| (d, i)).collect();
        let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
        for &col in &group {
            for p in k.col_ptr[col]..k.col_ptr[col + 1] {
                if let Some(&r) = at.get(&k.row_idx[p]) {
                    rows.push(r);
                    cols.push(at[&col]);
                    vals.push(k.values[p]);
                }
            }
        }
        let block = CscMatrix::from_triplets(group.len(), &rows, &cols, &vals);
        let sym = std::rc::Rc::new(crate::linalg::sparse_chol::symbolic_cholesky(&block));
        let singular = match crate::linalg::sparse_chol::numeric_cholesky(&sym, &block) {
            Some(num) => super::definiteness::sparse_pivot_check(&num, &block).is_some(),
            None => crate::linalg::sparse_chol::sparse_negative_inertia(&sym, &block).is_none(),
        };
        if singular {
            let group: BTreeSet<usize> = group.iter().map(|d| owner[d]).filter(|n| nodes.contains(n)).collect();
            let ids: Vec<String> = connectors
                .iter()
                .filter(|c| couples(c) && (group.contains(&c.node_i) || group.contains(&c.node_j)))
                .map(|c| c.id.to_string())
                .collect();
            let group: Vec<String> = group.iter().map(|n| n.to_string()).collect();
            return Err(format!(
                "Connector {}: the rotations of node(s) {} that the connectors couple are left with a combination \
                 that has no stiffness, a mechanism, so those rotations are undetermined: the rigid arms of a \
                 finite-length shear spring hold only the mean rotation across the connector axis, not the opposite \
                 rotations of its ends or their common twist about the axis, and nothing else (an unreleased member \
                 end, a shell or a rotational support) holds them. Hold the rotations of one of these nodes with an \
                 unreleased member end, a shell or a rotational support, and give the connector the rotational \
                 springs (kMoment for twist, kBendY, kBendZ) the other node needs.",
                ids.join(", "),
                group.join(", "),
            ));
        }
    }
    Ok(())
}

/// Refuses a 2D model whose connectors leave a combination of node rotations
/// with no stiffness: rotations that only connectors reach (no unhinged frame
/// end, rotational support, rotational spring or constraint), coupled only
/// through the rigid arms of finite-length shear springs, as on two truss-only
/// nodes joined by a connector with shear and no `kMoment`. K is then singular
/// along a pure rotation, and the factorization returns whatever round-off
/// puts there. Only connectors stiffen these rotations, so their block of K is
/// the connectors' rotation block alone, and it is checked by pivots of its
/// LDLᵀ against `SINGULAR_PIVOT_RATIO`.
pub(crate) fn refuse_connector_arm_mechanism_2d(input: &SolverInput) -> Result<(), String> {
    use std::collections::{BTreeMap, BTreeSet};
    if input.connectors.is_empty() || DofNumbering::dofs_per_node_2d(input) < 3 {
        return Ok(());
    }
    let mut held = constraint_rotation_nodes_2d(input);
    for e in crate::ordered::values(&input.elements) {
        if e.elem_type != "frame" { continue; }
        if !e.hinge_start { held.insert(e.node_i); }
        if !e.hinge_end { held.insert(e.node_j); }
    }
    for s in crate::ordered::values(&input.supports) {
        if super::dof::is_dof_restrained_2d(s, 2) || support_dofs_2d(s)[2].spring.is_some_and(|k| k > 0.0) {
            held.insert(s.node_id);
        }
    }
    let free: BTreeSet<usize> = connector_rotation_nodes_2d(input).into_iter().filter(|n| !held.contains(n)).collect();
    if free.is_empty() {
        return Ok(());
    }
    let nodes: std::collections::HashMap<usize, &SolverNode> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mut root: BTreeMap<usize, usize> = free.iter().map(|&n| (n, n)).collect();
    fn find(root: &mut BTreeMap<usize, usize>, n: usize) -> usize {
        let p = root[&n];
        if p == n { return n; }
        let r = find(root, p);
        root.insert(n, r);
        r
    }
    let connectors = crate::element::connector::sorted_by_id(&input.connectors);
    for c in &connectors {
        if free.contains(&c.node_i) && free.contains(&c.node_j) {
            let (a, b) = (find(&mut root, c.node_i), find(&mut root, c.node_j));
            root.insert(a.max(b), a.min(b));
        }
    }
    let mut groups: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
    for &n in &free {
        let r = find(&mut root, n);
        groups.entry(r).or_default().push(n);
    }
    for members in groups.values() {
        let at: BTreeMap<usize, usize> = members.iter().enumerate().map(|(k, &n)| (n, k)).collect();
        let m = members.len();
        let mut k = vec![0.0; m * m];
        let mut ids = Vec::new();
        for c in &connectors {
            let (Some(ni), Some(nj)) = (nodes.get(&c.node_i), nodes.get(&c.node_j)) else { continue };
            let ends = [(at.get(&c.node_i).copied(), 2), (at.get(&c.node_j).copied(), 5)];
            if ends.iter().all(|e| e.0.is_none()) { continue; }
            ids.push(c.id);
            let ke = crate::element::connector::connector_element_2d(c, ni, nj);
            for &(r, kr) in &ends {
                for &(q, kq) in &ends {
                    if let (Some(r), Some(q)) = (r, q) { k[r * m + q] += ke[kr * 6 + kq]; }
                }
            }
        }
        let diag: Vec<f64> = (0..m).map(|j| k[j * m + j]).collect();
        for j in 0..m {
            let d = k[j * m + j];
            if d.abs().partial_cmp(&(super::definiteness::SINGULAR_PIVOT_RATIO * diag[j].abs())) != Some(std::cmp::Ordering::Greater) {
                let arms = connectors.iter().any(|c| {
                    ids.contains(&c.id) && c.k_moment == 0.0 && c.k_shear != 0.0
                        && matches!((nodes.get(&c.node_i), nodes.get(&c.node_j)), (Some(a), Some(b)) if (b.x - a.x).hypot(b.z - a.z) > crate::element::connector::ZERO_LENGTH)
                });
                let remedy = if arms {
                    "Hold one of the rotations with an unhinged frame end or a rotational support, give the connector kMoment, or make its nodes coincide."
                } else {
                    "Hold one of the rotations with an unhinged frame end or a rotational support."
                };
                let ids: Vec<String> = ids.iter().map(|i| i.to_string()).collect();
                let members: Vec<String> = members.iter().map(|n| n.to_string()).collect();
                return Err(format!(
                    "Connector {}: the rotations of node(s) {} are reached only by connectors (no unhinged frame end, \
                     rotational support, rotational spring or constraint holds them), and those connectors leave a \
                     combination of them with no stiffness, a mechanism, so the rotations are undetermined: a rotational \
                     spring between two such rotations, or the rigid arms of a finite-length shear spring without kMoment, \
                     turns freely. {remedy}",
                    ids.join(", "),
                    members.join(", "),
                ));
            }
            for i in (j + 1)..m {
                let l = k[i * m + j] / d;
                for q in (j + 1)..=i {
                    k[i * m + q] -= l * k[q * m + j];
                }
            }
        }
    }
    Ok(())
}

/// Data needed to reverse the 2D inclined support rotation after solving.
pub struct InclinedTransformData2D {
    pub node_id: usize,
    pub dofs: [usize; 2],        // Global DOF indices for ux, uz
    pub r: [[f64; 2]; 2],        // 2×2 rotation matrix
}

/// Build 2×2 rotation matrix for 2D inclined support at angle θ.
///
/// Convention: θ is measured from the Z axis toward the X axis.
/// The restrained (normal) direction has unit vector (sin θ, cos θ) in global (x, z).
///   At θ=0: restrained direction = (0, 1) = Z → rollerX behavior (free in X)
///   At θ=π/2: restrained direction = (1, 0) = X → rollerZ behavior (free in Z)
///
/// The rotation maps global (x, z) to local (tangent, normal):
///   local[0] = tangent (free)   = -cos(θ) * x + sin(θ) * z
///   local[1] = normal (restrained) = sin(θ) * x + cos(θ) * z
///
/// This ensures DOF local_dof=1 (uz slot, restrained for inclinedRoller) corresponds
/// to the normal direction.
///
/// R = [[-cos θ,  sin θ],
///      [ sin θ,  cos θ]]
pub fn inclined_rotation_matrix_2d(theta: f64) -> [[f64; 2]; 2] {
    let theta = super::support::prepare_support_angle(theta);
    let c = theta.cos();
    let s = theta.sin();
    [[-c, s], [s, c]]
}

/// Rotate rows/columns of K at the given translational DOFs using 2×2 R (2D inclined support).
fn rotate_inclined_k_2d(k: &mut [f64], n: usize, dofs: &[usize; 2], r: &[[f64; 2]; 2]) {
    // Rotate columns: for each row i, K[i, dofs] = K[i, dofs_orig] * R^T
    for i in 0..n {
        let mut vals = [0.0; 2];
        for a in 0..2 {
            vals[a] = k[i * n + dofs[a]];
        }
        for a in 0..2 {
            let mut sum = 0.0;
            for b in 0..2 {
                sum += vals[b] * r[a][b]; // R^T[b][a] = R[a][b]
            }
            k[i * n + dofs[a]] = sum;
        }
    }
    // Rotate rows: for each col j, K[dofs, j] = R * K[dofs_orig, j]
    for j in 0..n {
        let mut vals = [0.0; 2];
        for a in 0..2 {
            vals[a] = k[dofs[a] * n + j];
        }
        for a in 0..2 {
            let mut sum = 0.0;
            for b in 0..2 {
                sum += r[a][b] * vals[b];
            }
            k[dofs[a] * n + j] = sum;
        }
    }
}

pub(crate) fn compensated_dot<const D: usize>(a: &[f64; D], b: &[f64; D]) -> f64 {
    let mut sum = 0.0f64;
    let mut correction = 0.0;
    for (&a, &b) in a.iter().zip(b) {
        let product = a * b;
        let next = sum + product;
        correction += if sum.abs() >= product.abs() {
            (sum - next) + product
        } else {
            (product - next) + sum
        };
        correction += a.mul_add(b, -product);
        sum = next;
    }
    sum + correction
}

fn rotate_inclined_vector<const D: usize>(f: &mut [f64], dofs: &[usize; D], r: &[[f64; D]; D]) {
    rotate_inclined_vector_with_rounding(f, dofs, r, &mut None);
}

fn rotate_inclined_vector_with_rounding<const D: usize>(f: &mut [f64], dofs: &[usize; D], r: &[[f64; D]; D], rounding: &mut Option<super::load_work::AssemblyRoundoff>) {
    let values = std::array::from_fn(|i| f[dofs[i]]);
    let errors: [f64; D] = std::array::from_fn(|i| rounding.as_ref().map_or(0.0, |r| r.get(dofs[i])));
    let mut axes = [[0.0; 3]; 3];
    axes[2][2] = 1.0;
    for i in 0..D { for j in 0..D { axes[i][j] = r[i][j]; } }
    let frame_error = if rounding.is_some() { super::load_work::frame_rounding(&axes) } else { [[0.0;3];3] };
    for (i, row) in r.iter().enumerate() {
        let value = compensated_dot(row, &values);
        if let Some(rounding) = rounding.as_mut() {
            let mut work = super::load_work::Work::default();
            for j in 0..D { work.product(row[j],frame_error[i][j],values[j],errors[j]); }
            let difference = super::load_work::add_up((value-work.value).abs(),super::load_work::sum_rounding(value,-work.value));
            rounding.set(dofs[i],super::load_work::add_up(work.bound(),difference));
        }
        f[dofs[i]] = value;
    }
}

fn accumulate_load(global: &mut [f64], rounding: &mut Option<super::load_work::AssemblyRoundoff>, dof: usize, value: f64, error: f64) {
    if let Some(rounding) = rounding.as_mut() { rounding.accumulate(dof,value,error,global[dof]); }
    global[dof] += value;
}

fn accumulate_product(global: &mut [f64], rounding: &mut Option<super::load_work::AssemblyRoundoff>, dof: usize, a: f64, b: f64) {
    let value = a*b;
    accumulate_load(global,rounding,dof,value,super::load_work::product_rounding(a,b,value));
}

/// Rotate force vector at the given DOFs: F[dofs] = R * F[dofs_orig] (2D inclined support).
pub fn rotate_inclined_f_2d(f: &mut [f64], dofs: &[usize; 2], r: &[[f64; 2]; 2]) {
    rotate_inclined_vector(f, dofs, r);
}

/// Apply 2D inclined support rotation to K and F at the given translational DOFs.
///
/// `pub(crate)`: called by corotational.rs and material_nonlinear.rs, whose
/// tangent-stiffness assembly is hand-rolled per NR iteration (not routed
/// through assemble_2d), so they must apply the same rotation themselves to
/// stay consistent with the reference load vector.
pub(crate) fn apply_inclined_transform_2d(k: &mut [f64], f: &mut [f64], n: usize,
                               dofs: &[usize; 2], r: &[[f64; 2]; 2]) {
    rotate_inclined_k_2d(k, n, dofs, r);
    rotate_inclined_f_2d(f, dofs, r);
}

/// Reverse 2D inclined rotation on displacement vector: u_global = R^T * u_rotated
pub fn reverse_inclined_transform_2d(u: &mut [f64], dofs: &[usize; 2], r: &[[f64; 2]; 2]) {
    let rt = std::array::from_fn(|i| std::array::from_fn(|j| r[j][i]));
    rotate_inclined_vector(u, dofs, &rt);
}

/// Build rotation matrix that maps global to local frame where ê₁ = normal.
pub fn inclined_rotation_matrix(nx: f64, ny: f64, nz: f64) -> [[f64; 3]; 3] {
    let n_len = (nx * nx + ny * ny + nz * nz).sqrt();
    let e1 = [nx / n_len, ny / n_len, nz / n_len];
    // Choose reference vector not parallel to e1
    let ref_v = if e1[0].abs() < 0.9 { [1.0, 0.0, 0.0] } else { [0.0, 1.0, 0.0] };
    // e3 = e1 × ref, then normalize
    let mut e3 = [
        e1[1] * ref_v[2] - e1[2] * ref_v[1],
        e1[2] * ref_v[0] - e1[0] * ref_v[2],
        e1[0] * ref_v[1] - e1[1] * ref_v[0],
    ];
    let e3_len = (e3[0] * e3[0] + e3[1] * e3[1] + e3[2] * e3[2]).sqrt();
    e3[0] /= e3_len; e3[1] /= e3_len; e3[2] /= e3_len;
    // e2 = e3 × e1
    let e2 = [
        e3[1] * e1[2] - e3[2] * e1[1],
        e3[2] * e1[0] - e3[0] * e1[2],
        e3[0] * e1[1] - e3[1] * e1[0],
    ];
    [e1, e2, e3] // rows of R
}

/// Rotate rows/columns of K at the given translational DOFs using R (3D inclined support).
fn rotate_inclined_k_3d(k: &mut [f64], n: usize, dofs: &[usize; 3], r: &[[f64; 3]; 3]) {
    // Rotate columns: for each row i, K[i, dofs] = K[i, dofs_orig] * R^T
    for i in 0..n {
        let mut vals = [0.0; 3];
        for a in 0..3 {
            vals[a] = k[i * n + dofs[a]];
        }
        for a in 0..3 {
            let mut sum = 0.0;
            for b in 0..3 {
                sum += vals[b] * r[a][b]; // R^T[b][a] = R[a][b]
            }
            k[i * n + dofs[a]] = sum;
        }
    }
    // Rotate rows: for each col j, K[dofs, j] = R * K[dofs_orig, j]
    for j in 0..n {
        let mut vals = [0.0; 3];
        for a in 0..3 {
            vals[a] = k[dofs[a] * n + j];
        }
        for a in 0..3 {
            let mut sum = 0.0;
            for b in 0..3 {
                sum += r[a][b] * vals[b];
            }
            k[dofs[a] * n + j] = sum;
        }
    }
}

/// Rotate force vector at the given DOFs: F[dofs] = R * F[dofs_orig] (3D inclined support).
pub fn rotate_inclined_f_3d(f: &mut [f64], dofs: &[usize; 3], r: &[[f64; 3]; 3]) {
    rotate_inclined_vector(f, dofs, r);
}

/// Apply 3D inclined support rotation to K and F at the given translational DOFs.
///
/// `pub(crate)`: called by corotational.rs and material_nonlinear.rs 3D paths —
/// see the 2D twin's doc comment for why.
pub(crate) fn apply_inclined_transform(k: &mut [f64], f: &mut [f64], n: usize,
                            dofs: &[usize; 3], r: &[[f64; 3]; 3]) {
    rotate_inclined_k_3d(k, n, dofs, r);
    rotate_inclined_f_3d(f, dofs, r);
}

/// Reverse inclined rotation on displacement vector: u_global = R^T * u_rotated
pub fn reverse_inclined_transform(u: &mut [f64], dofs: &[usize; 3], r: &[[f64; 3]; 3]) {
    let rt = std::array::from_fn(|i| std::array::from_fn(|j| r[j][i]));
    rotate_inclined_vector(u, dofs, &rt);
}

/// Stiffness-only assembly result for 2D (K with inclined support transforms applied).
pub struct StiffnessAssembly2D {
    pub k: Vec<f64>,
    pub max_diag_k: f64,
    pub artificial_dofs: Vec<usize>,
    pub inclined_transforms_2d: Vec<InclinedTransformData2D>,
}

/// Assemble the global stiffness matrix for 2D (load-independent).
/// The force vector is assembled separately by `assemble_load_vector_2d`.
pub fn assemble_stiffness_2d(input: &SolverInput, dof_num: &DofNumbering) -> StiffnessAssembly2D {
    let properties = crate::types::units::ElasticProperties2D::from_legacy(input);
    assemble_stiffness_2d_typed(input, dof_num, &properties)
}

pub(crate) fn assemble_stiffness_2d_typed(
    input: &SolverInput, dof_num: &DofNumbering,
    properties: &crate::types::units::ElasticProperties2D,
) -> StiffnessAssembly2D {
    let n = dof_num.n_total;
    let mut k_global = vec![0.0; n * n];

    // Pre-build O(1) lookup maps
    let node_map: std::collections::HashMap<usize, &SolverNode> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_map: std::collections::HashMap<usize, &SolverSection> =
        crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();

    // Assemble element stiffness matrices
    for elem in crate::ordered::values(&input.elements) {
        let node_i = node_map[&elem.node_i];
        let node_j = node_map[&elem.node_j];
        let mat = mat_map[&elem.material_id];
        let sec = sec_map[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;
        let e = mat.e * 1000.0; // MPa → kN/m²

        let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            // Truss/Cable: assemble directly in global coordinates
            let k_elem = truss_global_stiffness_2d(e, sec.a, l, cos, sin);
            let ndof = 4; // 2 per node for truss
            let truss_dofs = [
                dof_num.global_dof(elem.node_i, 0).unwrap(),
                dof_num.global_dof(elem.node_i, 1).unwrap(),
                dof_num.global_dof(elem.node_j, 0).unwrap(),
                dof_num.global_dof(elem.node_j, 1).unwrap(),
            ];
            for i in 0..ndof {
                for j in 0..ndof {
                    k_global[truss_dofs[i] * n + truss_dofs[j]] += k_elem[i * ndof + j];
                }
            }
        } else {
            // Frame element
            let material = properties.materials[&elem.material_id];
            let section = properties.sections[&elem.section_id];
            let phi = section.shear_parameter(material.e.to_internal(), material.nu, crate::types::units::Length::from_m(l));
            let k_local = crate::element::frame_local_stiffness_2d_typed(
                material.e.to_internal(), section.a, section.iz, crate::types::units::Length::from_m(l),
                elem.hinge_start, elem.hinge_end, phi,
            );
            let t = frame_transform_2d(cos, sin);
            let k_glob = transform_stiffness(&k_local, &t, 6);

            let ndof = elem_dofs.len();
            for i in 0..ndof {
                for j in 0..ndof {
                    k_global[elem_dofs[i] * n + elem_dofs[j]] += k_glob[i * ndof + j];
                }
            }
        }
    }

    // Assemble connector elements
    if !input.connectors.is_empty() {
        crate::element::connector::assemble_connectors_2d(input, dof_num, &mut k_global, n);
    }

    // Add spring stiffness (with rotation support for springs with angle)
    for sup in crate::ordered::values(&input.supports) {
        let kx_val = support_dofs_2d(sup)[0].spring.unwrap_or(0.0);
        let ky_val = support_dofs_2d(sup)[1].spring.unwrap_or(0.0);
        let kz_val = support_dofs_2d(sup)[2].spring.unwrap_or(0.0);

        if sup.support_type == "spring" {
            if let Some(angle) = sup.angle.map(super::support::prepare_support_angle) {
                if angle.abs() > 1e-15 && (kx_val > 0.0 || ky_val > 0.0) {
                    // Rotated spring: K_global = R^T * diag(kx, ky) * R
                    let c = angle.cos();
                    let s = angle.sin();
                    let k_xx = kx_val * c * c + ky_val * s * s;
                    let k_zz = kx_val * s * s + ky_val * c * c;
                    let k_xz = (kx_val - ky_val) * s * c;

                    if let (Some(&dx), Some(&dz)) = (
                        dof_num.map.get(&(sup.node_id, 0)),
                        dof_num.map.get(&(sup.node_id, 1)),
                    ) {
                        k_global[dx * n + dx] += k_xx;
                        k_global[dz * n + dz] += k_zz;
                        k_global[dx * n + dz] += k_xz;
                        k_global[dz * n + dx] += k_xz;
                    }
                } else {
                    // No rotation or zero angle: standard diagonal assembly
                    if kx_val > 0.0 {
                        if let Some(&d) = dof_num.map.get(&(sup.node_id, 0)) {
                            k_global[d * n + d] += kx_val;
                        }
                    }
                    if ky_val > 0.0 {
                        if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
                            k_global[d * n + d] += ky_val;
                        }
                    }
                }
            } else {
                // No angle: standard diagonal assembly
                if kx_val > 0.0 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, 0)) {
                        k_global[d * n + d] += kx_val;
                    }
                }
                if ky_val > 0.0 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
                        k_global[d * n + d] += ky_val;
                    }
                }
            }
        } else {
            // Non-spring supports: standard diagonal assembly
            if kx_val > 0.0 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 0)) {
                    k_global[d * n + d] += kx_val;
                }
            }
            if ky_val > 0.0 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
                    k_global[d * n + d] += ky_val;
                }
            }
        }
        // Rotational spring stiffness (kz in 2D SolverSupport = rotational ry stiffness)
        if kz_val > 0.0 && dof_num.dofs_per_node >= 3 {
            if let Some(&d) = dof_num.map.get(&(sup.node_id, 2)) {
                k_global[d * n + d] += kz_val;
            }
        }
    }

    // Find max diagonal
    let mut max_diag = 0.0f64;
    for i in 0..n {
        max_diag = max_diag.max(k_global[i * n + i].abs());
    }

    let artificial_dofs = orphan_rotation_dofs_2d(input, dof_num, |d| k_global[d * n + d]);
    let artificial_k = artificial_stiffness(max_diag);
    for &d in &artificial_dofs {
        k_global[d * n + d] += artificial_k;
    }

    // Apply 2D inclined support transformations (stiffness only; the force
    // vector rotation happens in `assemble_load_vector_2d`)
    let mut inclined_transforms_2d = Vec::new();
    for sup in crate::ordered::values(&input.supports) {
        if sup.support_type == "inclinedRoller" {
            let theta = sup.angle.unwrap_or(0.0);
            let r = inclined_rotation_matrix_2d(theta);
            if let (Some(&d0), Some(&d1)) = (
                dof_num.map.get(&(sup.node_id, 0)),
                dof_num.map.get(&(sup.node_id, 1)),
            ) {
                let dofs = [d0, d1];
                rotate_inclined_k_2d(&mut k_global, n, &dofs, &r);
                inclined_transforms_2d.push(InclinedTransformData2D {
                    node_id: sup.node_id,
                    dofs,
                    r,
                });
            }
        }
    }

    StiffnessAssembly2D {
        k: k_global,
        max_diag_k: max_diag,
        artificial_dofs,
        inclined_transforms_2d,
    }
}

/// A member load on a 2D truss bar, at its nodes: the bar's simply-supported reactions (lever
/// rule), statically exact, since a truss carries nothing transverse. Read by
/// `assemble_load_vector_2d`, which every 2D path (dense and sparse) builds its loads with.
/// The loads on a 2D truss or cable bar into the global load vector: thermal as its
/// free-expansion end forces, member loads by the lever rule (`truss_member_load_2d`).
/// Shared by the linear assembly and staged construction, which used to drop every
/// member load on a bar.
#[allow(clippy::too_many_arguments)]
pub(crate) fn assemble_truss_loads_2d(
    loads: &[&SolverLoad], elem_id: usize, l: f64, cos: f64, sin: f64, e: f64, area: f64,
    truss_dofs: &[usize; 4], f_global: &mut [f64],
) {
    assemble_truss_loads_2d_with_rounding(loads,elem_id,l,cos,sin,e,area,truss_dofs,f_global,&mut None);
}

fn assemble_truss_loads_2d_with_rounding(
    loads: &[&SolverLoad], elem_id: usize, l: f64, cos: f64, sin: f64, e: f64, area: f64,
    truss_dofs: &[usize; 4], f_global: &mut [f64],
    rounding: &mut Option<super::load_work::AssemblyRoundoff>,
) {
    for load in loads {
        match load {
            SolverLoad::Thermal(tl) if tl.element_id == elem_id => {
                // Convention matches fef_thermal_2d: node I gets -fx, node J gets +fx (local axial).
                let alpha = tl.alpha();
                let fx = e * area * alpha * tl.dt_uniform;
                accumulate_product(f_global, rounding, truss_dofs[0], -fx, cos);
                accumulate_product(f_global, rounding, truss_dofs[1], -fx, sin);
                accumulate_product(f_global, rounding, truss_dofs[2], fx, cos);
                accumulate_product(f_global, rounding, truss_dofs[3], fx, sin);
            }
            _ => truss_member_load_2d(load, elem_id, l, cos, sin, truss_dofs, f_global, rounding),
        }
    }
}

fn truss_member_load_2d(
    load: &SolverLoad, elem_id: usize, l: f64, cos: f64, sin: f64,
    truss_dofs: &[usize; 4], f_global: &mut [f64],
    rounding: &mut Option<super::load_work::AssemblyRoundoff>,
) {
    match load {
        SolverLoad::Distributed(dl) if dl.element_id == elem_id => {
            let [[ri, _], [rj, _]] = super::member_actions::TransverseMemberActions::from_2d(load, l).0;
            // Local transverse y = (−sin, cos)
            accumulate_product(f_global, rounding, truss_dofs[0], -sin, ri);
            accumulate_product(f_global, rounding, truss_dofs[1], cos, ri);
            accumulate_product(f_global, rounding, truss_dofs[2], -sin, rj);
            accumulate_product(f_global, rounding, truss_dofs[3], cos, rj);
        }
        SolverLoad::PointOnElement(pl) if pl.element_id == elem_id => {
            let a = pl.a;
            let px = pl.px.unwrap_or(0.0);
            // Transverse: the point load by the lever rule, the moment
            // (CCW positive) as a couple ±mz/L.
            let [[ri, _], [rj, _]] = super::member_actions::TransverseMemberActions::from_2d(load, l).0;
            accumulate_product(f_global, rounding, truss_dofs[0], -sin, ri);
            accumulate_product(f_global, rounding, truss_dofs[1], cos, ri);
            accumulate_product(f_global, rounding, truss_dofs[2], -sin, rj);
            accumulate_product(f_global, rounding, truss_dofs[3], cos, rj);
            // Axial: the lever rule along the bar.
            let ni = px * (1.0 - a / l);
            let nj = px * a / l;
            accumulate_product(f_global, rounding, truss_dofs[0], cos, ni);
            accumulate_product(f_global, rounding, truss_dofs[1], sin, ni);
            accumulate_product(f_global, rounding, truss_dofs[2], cos, nj);
            accumulate_product(f_global, rounding, truss_dofs[3], sin, nj);
        }
        SolverLoad::AxialDistributed(al) if al.element_id == elem_id => {
            let [ni, nj] = crate::element::axial_distributed_fef(al.q_i, al.q_j, al.a.unwrap_or(0.0), al.b.unwrap_or(l), l);
            accumulate_product(f_global, rounding, truss_dofs[0], cos, ni);
            accumulate_product(f_global, rounding, truss_dofs[1], sin, ni);
            accumulate_product(f_global, rounding, truss_dofs[2], cos, nj);
            accumulate_product(f_global, rounding, truss_dofs[3], sin, nj);
        }
        _ => {}
    }
}

/// Assemble the global force vector for 2D for a given set of loads
/// (with inclined support rotations applied). Produces exactly the same `f`
/// as `assemble_2d` would on the same loads.
pub fn assemble_load_vector_2d(
    input: &SolverInput,
    loads: &[SolverLoad],
    dof_num: &DofNumbering,
    inclined_transforms_2d: &[InclinedTransformData2D],
) -> Vec<f64> {
    assemble_load_vector_2d_with_rounding(input,loads,dof_num,inclined_transforms_2d,false).0
}

pub(crate) fn assemble_load_vector_2d_with_rounding(
    input: &SolverInput,
    loads: &[SolverLoad],
    dof_num: &DofNumbering,
    inclined_transforms_2d: &[InclinedTransformData2D],
    track_rounding: bool,
) -> (Vec<f64>, Vec<f64>) {
    let n = dof_num.n_total;
    let mut f_global = vec![0.0; n];
    let mut rounding = track_rounding.then(|| super::load_work::AssemblyRoundoff::new(n));

    // Pre-build O(1) lookup maps
    let node_map: std::collections::HashMap<usize, &SolverNode> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_map: std::collections::HashMap<usize, &SolverSection> =
        crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();

    // Group element-bound loads by element id so each element only scans its own
    // loads instead of the full load list (O(E_loaded × L) → O(L)).
    let mut loads_by_elem: std::collections::HashMap<usize, Vec<&SolverLoad>> = std::collections::HashMap::new();
    for load in loads {
        match load {
            SolverLoad::Distributed(dl) => { loads_by_elem.entry(dl.element_id).or_default().push(load); }
            SolverLoad::PointOnElement(pl) => { loads_by_elem.entry(pl.element_id).or_default().push(load); }
            SolverLoad::Thermal(tl) => { loads_by_elem.entry(tl.element_id).or_default().push(load); }
            SolverLoad::AxialDistributed(al) => { loads_by_elem.entry(al.element_id).or_default().push(load); }
            _ => {}
        }
    }

    // Assemble element loads (FEF) — same element iteration order as assemble_stiffness_2d
    for elem in crate::ordered::values(&input.elements) {
        let elem_loads = match loads_by_elem.get(&elem.id) {
            Some(v) => v,
            None => continue,
        };

        let node_i = node_map[&elem.node_i];
        let node_j = node_map[&elem.node_j];
        let mat = mat_map[&elem.material_id];
        let sec = sec_map[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;
        let e = mat.e * 1000.0; // MPa → kN/m²

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            // Assemble thermal FEF for 2D truss elements.
            // Convention matches fef_thermal_2d: node I gets -fx, node J gets +fx (local axial).
            // Transform to global: node I gets -fx*[cos, sin], node J gets +fx*[cos, sin].
            let truss_dofs = [
                dof_num.global_dof(elem.node_i, 0).unwrap(),
                dof_num.global_dof(elem.node_i, 1).unwrap(),
                dof_num.global_dof(elem.node_j, 0).unwrap(),
                dof_num.global_dof(elem.node_j, 1).unwrap(),
            ];
            assemble_truss_loads_2d_with_rounding(elem_loads, elem.id, l, cos, sin, e, sec.a, &truss_dofs, &mut f_global, &mut rounding);
        } else {
            let t = frame_transform_2d(cos, sin);
            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            assemble_element_loads_2d_with_rounding(elem_loads, elem, &t, l, e, mat.nu, sec, &elem_dofs, &mut f_global, &mut rounding);
        }
    }

    // Assemble nodal loads
    for load in loads {
        if let SolverLoad::Nodal(nl) = load {
            if let Some(&d) = dof_num.map.get(&(nl.node_id, 0)) {
                accumulate_load(&mut f_global, &mut rounding, d, nl.fx, 0.0);
            }
            if let Some(&d) = dof_num.map.get(&(nl.node_id, 1)) {
                accumulate_load(&mut f_global, &mut rounding, d, nl.fz, 0.0);
            }
            if dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(nl.node_id, 2)) {
                    accumulate_load(&mut f_global, &mut rounding, d, nl.my, 0.0);
                }
            }
        }
    }

    // Apply 2D inclined support rotations to the force vector
    for it in inclined_transforms_2d {
        rotate_inclined_vector_with_rounding(&mut f_global, &it.dofs, &it.r, &mut rounding);
    }

    (f_global, rounding.map_or_else(Vec::new, |r| r.finish()))
}

/// Assemble global stiffness matrix and force vector for 2D.
pub fn assemble_2d(input: &SolverInput, dof_num: &DofNumbering) -> AssemblyResult {
    let stiff = assemble_stiffness_2d(input, dof_num);
    let f = assemble_load_vector_2d(input, &input.loads, dof_num, &stiff.inclined_transforms_2d);
    AssemblyResult {
        k: stiff.k,
        f,
        max_diag_k: stiff.max_diag_k,
        artificial_dofs: stiff.artificial_dofs,
        inclined_transforms: Vec::new(),
        inclined_transforms_2d: stiff.inclined_transforms_2d,
        diagnostics: Vec::new(),
    }
}

pub fn assemble_element_loads_2d(
    loads: &[&SolverLoad],
    elem: &SolverElement,
    t: &[f64],
    l: f64,
    e: f64,
    nu: f64,
    sec: &SolverSection,
    elem_dofs: &[usize],
    f_global: &mut [f64],
) {
    assemble_element_loads_2d_with_rounding(loads,elem,t,l,e,nu,sec,elem_dofs,f_global,&mut None);
}

fn assemble_element_loads_2d_with_rounding(
    loads: &[&SolverLoad],
    elem: &SolverElement,
    t: &[f64],
    l: f64,
    e: f64,
    nu: f64,
    sec: &SolverSection,
    elem_dofs: &[usize],
    f_global: &mut [f64],
    rounding: &mut Option<super::load_work::AssemblyRoundoff>,
) {
    // Timoshenko shear parameter, matching the one used for the stiffness
    // matrix in assemble_stiffness_2d. The hinge FEF condensation uses the same
    // phi; passing 0.0 here would build an inconsistent system (Timoshenko K
    // with Euler-Bernoulli FEF) whenever as_y is set and a hinge is present.
    let phi = if let Some(as_y) = sec.as_y {
        let g = e / (2.0 * (1.0 + nu));
        12.0 * e * sec.iz / (g * as_y * l * l)
    } else {
        0.0
    };

    for load in loads {
        match load {
            SolverLoad::Distributed(dl) if dl.element_id == elem.id => {
                let a = dl.a.unwrap_or(0.0);
                let b = dl.b.unwrap_or(l);
                let is_full = (a.abs() < 1e-12) && ((b - l).abs() < 1e-12);

                let mut fef = if is_full {
                    let f = fef_distributed_2d(dl.q_i, dl.q_j, l, phi);
                    f
                } else {
                    fef_partial_distributed_2d(dl.q_i, dl.q_j, a, b, l, phi)
                };

                // Adjust for hinges
                adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end, phi);

                // Transform to global and add
                accumulate_frame_load(&fef,t,6,elem_dofs,None,f_global,rounding);
            }
            SolverLoad::PointOnElement(pl) if pl.element_id == elem.id => {
                let px = pl.px.unwrap_or(0.0);
                let mz = pl.my.unwrap_or(0.0);
                let mut fef = fef_point_load_2d(pl.p, px, mz, pl.a, l, phi);

                adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end, phi);

                accumulate_frame_load(&fef,t,6,elem_dofs,None,f_global,rounding);
            }
            SolverLoad::Thermal(tl) if tl.element_id == elem.id => {
                let alpha = tl.alpha();
                let h = tl.depth(sec.a, sec.iz);
                let mut fef = fef_thermal_2d(
                    e, sec.a, sec.iz, l,
                    tl.dt_uniform, tl.dt_gradient, alpha, h,
                );

                adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end, phi);

                accumulate_frame_load(&fef,t,6,elem_dofs,None,f_global,rounding);
            }
            SolverLoad::AxialDistributed(al) if al.element_id == elem.id => {
                let fef = crate::element::fef_axial_distributed_2d(al.q_i, al.q_j, al.a.unwrap_or(0.0), al.b.unwrap_or(l), l);
                accumulate_frame_load(&fef,t,6,elem_dofs,None,f_global,rounding);
            }
            _ => {}
        }
    }
}

/// Stiffness-only assembly result for 3D (K with inclined support transforms applied).
pub struct StiffnessAssembly3D {
    pub k: Vec<f64>,
    pub max_diag_k: f64,
    pub artificial_dofs: Vec<usize>,
    pub inclined_transforms: Vec<InclinedTransformData>,
    pub diagnostics: Vec<crate::types::AssemblyDiagnostic>,
}

/// Assemble the global stiffness matrix for 3D (load-independent).
/// The force vector is assembled separately by `assemble_load_vector_3d_dense`.
pub fn assemble_stiffness_3d(input: &SolverInput3D, dof_num: &DofNumbering) -> StiffnessAssembly3D {
    let n = dof_num.n_total;
    let mut k_global = vec![0.0; n * n];
    let left_hand = input.left_hand.unwrap_or(false);

    // Pre-build O(1) lookup maps
    let node_map: std::collections::HashMap<usize, &SolverNode3D> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_map: std::collections::HashMap<usize, &SolverSection3D> =
        crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();

    // Sort elements for deterministic assembly (HashMap iteration order is randomized)
    let mut sorted_dense_elems: Vec<&SolverElement3D> = crate::ordered::values(&input.elements).collect();
    sorted_dense_elems.sort_by_key(|e| e.id);
    for elem in sorted_dense_elems {
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

        let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);

        let kinematics = MemberKinematics3D::from_elem(elem, sec);
        if kinematics == MemberKinematics3D::Axial {
            // 3D truss/cable: direct global assembly using extracted function
            let ea_l = e * sec.a / l;
            let dir = [dx / l, dy / l, dz / l];
            scatter_truss_3d(&mut k_global, n, ea_l, &dir, elem.node_i, elem.node_j, &dof_num.map);
        } else {
            // 3D frame element
            let (ex, ey, ez) = compute_local_axes_3d(
                node_i.x, node_i.y, node_i.z,
                node_j.x, node_j.y, node_j.z,
                elem.local_yx, elem.local_yy, elem.local_yz,
                elem.roll_angle,
                left_hand,
            );

            // Compute Timoshenko shear parameters for each bending plane
            let (phi_y, phi_z) = if sec.as_y.is_some() || sec.as_z.is_some() {
                let l2 = l * l;
                let py = sec.as_y.map(|ay| 12.0 * e * sec.iy / (g * ay * l2)).unwrap_or(0.0);
                let pz = sec.as_z.map(|az| 12.0 * e * sec.iz / (g * az * l2)).unwrap_or(0.0);
                (py, pz)
            } else {
                (0.0, 0.0)
            };

            if kinematics.uses_warping_formulation() && dof_num.dofs_per_node >= 7 {
                // Warping element: 14×14 stiffness
                let k_local = frame_local_stiffness_3d_warping(
                    e, sec.a, sec.iy, sec.iz, sec.j, sec.cw.unwrap(), l, g,
                    Hinge3D::from_elem(elem),
                    phi_y, phi_z,
                );
                let t = frame_transform_3d_warping(&ex, &ey, &ez);
                let k_glob = transform_stiffness(&k_local, &t, 14);

                let ndof = elem_dofs.len();
                for i in 0..ndof {
                    for j in 0..ndof {
                        k_global[elem_dofs[i] * n + elem_dofs[j]] += k_glob[i * ndof + j];
                    }
                }
            } else if dof_num.dofs_per_node >= 7 {
                // Non-warping element in a warping model: 12×12 math mapped via DOF_MAP_12_TO_14
                let k_local = frame_local_stiffness_3d(
                    e, sec.a, sec.iy, sec.iz, sec.j, l, g,
                    Hinge3D::from_elem(elem),
                    phi_y, phi_z,
                );
                let t = frame_transform_3d(&ex, &ey, &ez);
                let k_glob = transform_stiffness(&k_local, &t, 12);

                for i in 0..12 {
                    for j in 0..12 {
                        let gi = elem_dofs[DOF_MAP_12_TO_14[i]];
                        let gj = elem_dofs[DOF_MAP_12_TO_14[j]];
                        k_global[gi * n + gj] += k_glob[i * 12 + j];
                    }
                }
            } else {
                // Standard 6-DOF-per-node path
                let k_local = frame_local_stiffness_3d(
                    e, sec.a, sec.iy, sec.iz, sec.j, l, g,
                    Hinge3D::from_elem(elem),
                    phi_y, phi_z,
                );
                let t = frame_transform_3d(&ex, &ey, &ez);
                let k_glob = transform_stiffness(&k_local, &t, 12);

                let ndof = elem_dofs.len();
                for i in 0..ndof {
                    for j in 0..ndof {
                        k_global[elem_dofs[i] * n + elem_dofs[j]] += k_glob[i * ndof + j];
                    }
                }
            }
        }
    }

    // Assemble plate element stiffness matrices (sorted for determinism)
    let mut sorted_dense_plates: Vec<&SolverPlateElement> = crate::ordered::values(&input.plates).collect();
    sorted_dense_plates.sort_by_key(|p| p.id);
    for plate in sorted_dense_plates {
        let mat = mat_map[&plate.material_id];
        let e = mat.e * 1000.0; // MPa → kN/m²
        let nu = mat.nu;

        let n0 = node_map[&plate.nodes[0]];
        let n1 = node_map[&plate.nodes[1]];
        let n2 = node_map[&plate.nodes[2]];
        let coords = [
            [n0.x, n0.y, n0.z],
            [n1.x, n1.y, n1.z],
            [n2.x, n2.y, n2.z],
        ];

        let k_local = crate::element::plate_local_stiffness(&coords, e, nu, plate.thickness);
        let t_plate = crate::element::plate_transform_3d(&coords);
        let k_glob = transform_stiffness(&k_local, &t_plate, 18);

        let plate_dofs = dof_num.plate_element_dofs(&plate.nodes);
        let ndof = plate_dofs.len();
        for i in 0..ndof {
            for j in 0..ndof {
                k_global[plate_dofs[i] * n + plate_dofs[j]] += k_glob[i * ndof + j];
            }
        }
    }

    // Assemble quad (MITC4 shell) element stiffness matrices (sorted for determinism)
    let mut sorted_dense_quads: Vec<&SolverQuadElement> = crate::ordered::values(&input.quads).collect();
    sorted_dense_quads.sort_by_key(|q| q.id);
    for quad in sorted_dense_quads {
        let mat = mat_map[&quad.material_id];
        let e = mat.e * 1000.0; // MPa → kN/m²
        let nu = mat.nu;

        let n0 = node_map[&quad.nodes[0]];
        let n1 = node_map[&quad.nodes[1]];
        let n2 = node_map[&quad.nodes[2]];
        let n3 = node_map[&quad.nodes[3]];
        let coords = [
            [n0.x, n0.y, n0.z],
            [n1.x, n1.y, n1.z],
            [n2.x, n2.y, n2.z],
            [n3.x, n3.y, n3.z],
        ];

        let k_local = crate::element::quad::mitc4_local_stiffness(&coords, e, nu, quad.thickness);
        let t_quad = crate::element::quad::quad_transform_3d(&coords);
        let k_glob = transform_stiffness(&k_local, &t_quad, 24);

        let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
        let ndof = quad_dofs.len();
        for i in 0..ndof {
            for j in 0..ndof {
                k_global[quad_dofs[i] * n + quad_dofs[j]] += k_glob[i * ndof + j];
            }
        }
    }

    // Assemble quad9 (MITC9 shell) element stiffness matrices (sorted for determinism)
    let mut sorted_dense_q9s: Vec<&SolverQuad9Element> = crate::ordered::values(&input.quad9s).collect();
    sorted_dense_q9s.sort_by_key(|q| q.id);
    for quad9 in sorted_dense_q9s {
        let mat = mat_map[&quad9.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;
        let coords = quad9_coords(&node_map, quad9);
        let k_local = crate::element::quad9::mitc9_local_stiffness(&coords, e, nu, quad9.thickness);
        let t_q9 = crate::element::quad9::quad9_transform_3d(&coords);
        let k_glob = transform_stiffness(&k_local, &t_q9, 54);
        let q9_dofs = dof_num.quad9_element_dofs(&quad9.nodes);
        let ndof = q9_dofs.len();
        for i in 0..ndof {
            for j in 0..ndof {
                k_global[q9_dofs[i] * n + q9_dofs[j]] += k_glob[i * ndof + j];
            }
        }
    }

    // Assemble solid-shell element stiffness matrices (sorted for determinism)
    let mut sorted_dense_ss: Vec<&SolverSolidShellElement> = crate::ordered::values(&input.solid_shells).collect();
    sorted_dense_ss.sort_by_key(|s| s.id);
    for ss in sorted_dense_ss {
        let mat = mat_map[&ss.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;
        let coords = solid_shell_coords(&node_map, ss);
        let k_elem = crate::element::solid_shell::solid_shell_stiffness(&coords, e, nu);
        let ss_dofs = dof_num.solid_shell_element_dofs(&ss.nodes);
        let ndof = ss_dofs.len();
        for i in 0..ndof {
            for j in 0..ndof {
                k_global[ss_dofs[i] * n + ss_dofs[j]] += k_elem[i * ndof + j];
            }
        }
    }

    // Assemble curved shell element stiffness matrices (degenerated continuum, sorted for determinism)
    let mut sorted_dense_cs: Vec<&SolverCurvedShellElement> = crate::ordered::values(&input.curved_shells).collect();
    sorted_dense_cs.sort_by_key(|c| c.id);
    for cs in sorted_dense_cs {
        let mat = mat_map[&cs.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;
        let coords = curved_shell_coords(&node_map, cs);
        let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&coords));
        let k_elem = crate::element::curved_shell::curved_shell_stiffness(&coords, &dirs, e, nu, cs.thickness);
        // No transform needed — stiffness is directly in global coordinates
        let cs_dofs = dof_num.quad_element_dofs(&cs.nodes);
        let ndof = cs_dofs.len();
        for i in 0..ndof {
            for j in 0..ndof {
                k_global[cs_dofs[i] * n + cs_dofs[j]] += k_elem[i * ndof + j];
            }
        }
    }

    // Assemble 3D connector elements
    if !input.connectors.is_empty() {
        crate::element::connector::assemble_connectors_3d(input, dof_num, &mut k_global, n);
    }

    // Add 3D spring stiffness
    for sup in crate::ordered::values(&input.supports) {
        let springs = [support_dofs_3d(sup)[0].spring, support_dofs_3d(sup)[1].spring, support_dofs_3d(sup)[2].spring, support_dofs_3d(sup)[3].spring, support_dofs_3d(sup)[4].spring, support_dofs_3d(sup)[5].spring];
        for (i, ks) in springs.iter().enumerate() {
            if let Some(k) = ks {
                if *k > 0.0 && i < dof_num.dofs_per_node {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, i)) {
                        k_global[d * n + d] += k;
                    }
                }
            }
        }
        // Warping spring (DOF 6)
        if dof_num.dofs_per_node >= 7 {
            if let Some(kw) = support_dofs_3d(sup)[6].spring {
                if kw > 0.0 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, 6)) {
                        k_global[d * n + d] += kw;
                    }
                }
            }
        }
    }

    let mut max_diag = 0.0f64;
    for i in 0..n {
        max_diag = max_diag.max(k_global[i * n + i].abs());
    }

    // Add artificial stiffness at warping DOFs for nodes with no warping stiffness.
    // This prevents a singular matrix when some elements lack warping.
    let mut artificial_dofs_3d = Vec::new();
    {
        let artificial_k = artificial_stiffness(max_diag);
        for d in orphan_rotation_dofs_3d(input, dof_num, |d| k_global[d * n + d]) {
            k_global[d * n + d] += artificial_k;
            artificial_dofs_3d.push(d);
        }
    }
    if dof_num.dofs_per_node >= 7 {
        let artificial_k = artificial_stiffness(max_diag);
        for &node_id in &dof_num.node_order {
            if let Some(&d) = dof_num.map.get(&(node_id, 6)) {
                if d < dof_num.n_free && k_global[d * n + d].abs() < 1e-20 {
                    k_global[d * n + d] += artificial_k;
                    artificial_dofs_3d.push(d);
                }
            }
        }
    }

    // Apply inclined support transformations (stiffness only; the force
    // vector rotation happens in `assemble_load_vector_3d_dense`)
    let mut inclined_transforms = Vec::new();
    for sup in crate::ordered::values(&input.supports) {
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
                        rotate_inclined_k_3d(&mut k_global, n, &dofs, &r);
                        inclined_transforms.push(InclinedTransformData {
                            node_id: sup.node_id,
                            dofs,
                            r,
                        });
                    }
                }
            }
        }
    }

    // Element quality diagnostics
    let mut diagnostics = Vec::new();

    for plate in crate::ordered::values(&input.plates) {
        let n0 = node_map[&plate.nodes[0]];
        let n1 = node_map[&plate.nodes[1]];
        let n2 = node_map[&plate.nodes[2]];
        let coords = [
            [n0.x, n0.y, n0.z],
            [n1.x, n1.y, n1.z],
            [n2.x, n2.y, n2.z],
        ];
        let (aspect_ratio, _skew, min_angle) = crate::element::plate_element_quality(&coords);
        if aspect_ratio > 10.0 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: plate.id,
                element_type: "plate".into(),
                metric: "aspect_ratio".into(),
                value: aspect_ratio,
                threshold: 10.0,
                message: format!("Plate {} aspect ratio {:.1} exceeds 10", plate.id, aspect_ratio),
            });
        }
        if min_angle < 10.0 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: plate.id,
                element_type: "plate".into(),
                metric: "min_angle".into(),
                value: min_angle,
                threshold: 10.0,
                message: format!("Plate {} min angle {:.1}° below 10°", plate.id, min_angle),
            });
        }
    }

    for quad in crate::ordered::values(&input.quads) {
        let qn0 = node_map[&quad.nodes[0]];
        let qn1 = node_map[&quad.nodes[1]];
        let qn2 = node_map[&quad.nodes[2]];
        let qn3 = node_map[&quad.nodes[3]];
        let coords = [
            [qn0.x, qn0.y, qn0.z],
            [qn1.x, qn1.y, qn1.z],
            [qn2.x, qn2.y, qn2.z],
            [qn3.x, qn3.y, qn3.z],
        ];
        let qm = crate::element::quad::quad_quality_metrics(&coords);
        let (_, _, has_neg_j) = crate::element::quad::quad_check_jacobian(&coords);
        if has_neg_j {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: quad.id,
                element_type: "quad".into(),
                metric: "negative_jacobian".into(),
                value: -1.0,
                threshold: 0.0,
                message: format!("Quad {} has negative Jacobian determinant (inverted element)", quad.id),
            });
        }
        if qm.aspect_ratio > 10.0 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: quad.id,
                element_type: "quad".into(),
                metric: "aspect_ratio".into(),
                value: qm.aspect_ratio,
                threshold: 10.0,
                message: format!("Quad {} aspect ratio {:.1} exceeds 10", quad.id, qm.aspect_ratio),
            });
        }
        if qm.warping > 0.01 && qm.warping <= 0.1 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: quad.id,
                element_type: "quad".into(),
                metric: "warping_moderate".into(),
                value: qm.warping,
                threshold: 0.01,
                message: format!("Quad {} moderate warping {:.3} (0.01-0.1 range)", quad.id, qm.warping),
            });
        }
        if qm.warping > 0.1 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: quad.id,
                element_type: "quad".into(),
                metric: "warping".into(),
                value: qm.warping,
                threshold: 0.1,
                message: format!("Quad {} warping {:.3} exceeds 0.1", quad.id, qm.warping),
            });
        }
        if qm.jacobian_ratio < 0.1 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: quad.id,
                element_type: "quad".into(),
                metric: "jacobian_ratio".into(),
                value: qm.jacobian_ratio,
                threshold: 0.1,
                message: format!("Quad {} jacobian ratio {:.3} below 0.1", quad.id, qm.jacobian_ratio),
            });
        }
    }

    // Quad9 diagnostics (dense path)
    for q9 in crate::ordered::values(&input.quad9s) {
        let coords = quad9_coords(&node_map, q9);
        let (_, _, has_neg_j) = crate::element::quad9::quad9_check_jacobian(&coords);
        if has_neg_j {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: q9.id, element_type: "quad9".into(), metric: "negative_jacobian".into(),
                value: -1.0, threshold: 0.0,
                message: format!("Quad9 {} has negative Jacobian determinant (inverted element)", q9.id),
            });
        }
    }

    StiffnessAssembly3D {
        k: k_global,
        max_diag_k: max_diag,
        artificial_dofs: artificial_dofs_3d,
        inclined_transforms,
        diagnostics,
    }
}

/// A member load on a 3D truss/cable bar, at its nodes: axial distributed via
/// `axial_distributed_fef`, transverse distributed and point loads by the lever
/// rule (the bar's simply-supported reactions, statically exact — a truss
/// carries nothing transverse), thermal as a pair of axial forces. The 3D
/// analogue of `truss_member_load_2d`, shared by `assemble_frame_loads_3d` and
/// the parallel sparse load vector so the two can never drift again.
#[allow(clippy::too_many_arguments)]
pub(crate) fn truss_member_load_3d(
    load: &SolverLoad3D,
    elem: &SolverElement3D,
    node_i: &SolverNode3D,
    node_j: &SolverNode3D,
    l: f64,
    dir: &[f64; 3],
    e: f64,
    area: f64,
    left_hand: bool,
    dof_num: &DofNumbering,
    f_global: &mut [f64],
) {
    truss_member_load_3d_with_rounding(load,elem,node_i,node_j,l,dir,e,area,left_hand,dof_num,f_global,&mut None);
}

fn truss_member_load_3d_with_rounding(
    load: &SolverLoad3D,
    elem: &SolverElement3D,
    node_i: &SolverNode3D,
    node_j: &SolverNode3D,
    l: f64,
    dir: &[f64; 3],
    e: f64,
    area: f64,
    left_hand: bool,
    dof_num: &DofNumbering,
    f_global: &mut [f64],
    rounding: &mut Option<super::load_work::AssemblyRoundoff>,
) {
    match load {
        SolverLoad3D::Distributed(dl) if dl.element_id == elem.id => {
            let f = crate::element::axial_distributed_fef(dl.q_xi, dl.q_xj, dl.a.unwrap_or(0.0), dl.b.unwrap_or(l), l);
            for k in 0..3 {
                if let Some(&d) = dof_num.map.get(&(elem.node_i, k)) { accumulate_product(f_global, rounding, d, f[0], dir[k]); }
                if let Some(&d) = dof_num.map.get(&(elem.node_j, k)) { accumulate_product(f_global, rounding, d, f[1], dir[k]); }
            }
            // The transverse parts reach the nodes by the lever rule
            // (the bar's simply-supported reactions), as in 2D: a truss
            // carries nothing transverse, and they used to be dropped.
            let actions = super::member_actions::TransverseMemberActions::from_3d(load, l);
            if actions.0.iter().flatten().any(|v| *v != 0.0) {
                let (_ex, ey, ez) = compute_local_axes_3d(
                    node_i.x, node_i.y, node_i.z, node_j.x, node_j.y, node_j.z,
                    elem.local_yx, elem.local_yy, elem.local_yz, elem.roll_angle, left_hand);
                let [[ryi, rzi], [ryj, rzj]] = actions.0;
                for k in 0..3 {
                    let comp_i = ryi * ey[k] + rzi * ez[k];
                    let comp_j = ryj * ey[k] + rzj * ez[k];
                    if let Some(&d) = dof_num.map.get(&(elem.node_i, k)) { accumulate_load(f_global, rounding, d, comp_i, 0.0); }
                    if let Some(&d) = dof_num.map.get(&(elem.node_j, k)) { accumulate_load(f_global, rounding, d, comp_j, 0.0); }
                }
            }
        }
        SolverLoad3D::PointOnElement(pl) if pl.element_id == elem.id && (pl.px != 0.0 || pl.py != 0.0 || pl.pz != 0.0) => {
            // A point load on a truss reaches its nodes by the lever rule.
            let (ex, ey, ez) = compute_local_axes_3d(
                node_i.x, node_i.y, node_i.z, node_j.x, node_j.y, node_j.z,
                elem.local_yx, elem.local_yy, elem.local_yz, elem.roll_angle, left_hand);
            let f_i = 1.0 - pl.a / l;
            let f_j = pl.a / l;
            let [[ryi, rzi], [ryj, rzj]] = super::member_actions::TransverseMemberActions::from_3d(load, l).0;
            for k in 0..3 {
                let comp_i = pl.px * f_i * ex[k] + ryi * ey[k] + rzi * ez[k];
                let comp_j = pl.px * f_j * ex[k] + ryj * ey[k] + rzj * ez[k];
                if let Some(&d) = dof_num.map.get(&(elem.node_i, k)) { accumulate_load(f_global, rounding, d, comp_i, 0.0); }
                if let Some(&d) = dof_num.map.get(&(elem.node_j, k)) { accumulate_load(f_global, rounding, d, comp_j, 0.0); }
            }
        }
        SolverLoad3D::Thermal(tl) if tl.element_id == elem.id => {
            let alpha = tl.alpha();
            let fx = e * area * alpha * tl.dt_uniform;
            // Equivalent nodal loads: node I ← -fx along axis, node J ← +fx along axis
            for k in 0..3 {
                if let Some(&d) = dof_num.map.get(&(elem.node_i, k)) {
                    accumulate_product(f_global, rounding, d, -fx, dir[k]);
                }
                if let Some(&d) = dof_num.map.get(&(elem.node_j, k)) {
                    accumulate_product(f_global, rounding, d, fx, dir[k]);
                }
            }
        }
        _ => {}
    }
}

/// Frame/truss element load contributions (FEF + truss thermal) for 3D.
/// Shared by the dense and sequential-sparse load-vector builders; iterates
/// frame/truss elements sorted by ID, exactly like the fused assemblers did.
fn assemble_frame_loads_3d(
    input: &SolverInput3D,
    loads: &[SolverLoad3D],
    dof_num: &DofNumbering,
    f_global: &mut [f64],
    rounding: &mut Option<super::load_work::AssemblyRoundoff>,
) {
    // Index elements carrying element-bound loads so unloaded elements are skipped
    let mut loaded_elems: std::collections::HashSet<usize> = std::collections::HashSet::new();
    for load in loads {
        match load {
            SolverLoad3D::Distributed(dl) => { loaded_elems.insert(dl.element_id); }
            SolverLoad3D::PointOnElement(pl) => { loaded_elems.insert(pl.element_id); }
            SolverLoad3D::Thermal(tl) => { loaded_elems.insert(tl.element_id); }
            _ => {}
        }
    }
    if loaded_elems.is_empty() {
        return;
    }

    let node_map: std::collections::HashMap<usize, &SolverNode3D> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_map: std::collections::HashMap<usize, &SolverSection3D> =
        crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();
    let left_hand = input.left_hand.unwrap_or(false);

    let mut sorted_elems: Vec<&SolverElement3D> = crate::ordered::values(&input.elements).collect();
    sorted_elems.sort_by_key(|e| e.id);
    for elem in sorted_elems {
        if !loaded_elems.contains(&elem.id) { continue; }

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

        let kinematics = MemberKinematics3D::from_elem(elem, sec);
        if kinematics == MemberKinematics3D::Axial {
            let dir = [dx / l, dy / l, dz / l];
            for load in loads {
                truss_member_load_3d_with_rounding(load, elem, node_i, node_j, l, &dir, e, sec.a, left_hand, dof_num, f_global, rounding);
            }
        } else {
            let (ex, ey, ez) = compute_local_axes_3d(
                node_i.x, node_i.y, node_i.z,
                node_j.x, node_j.y, node_j.z,
                elem.local_yx, elem.local_yy, elem.local_yz,
                elem.roll_angle,
                left_hand,
            );

            // Compute Timoshenko shear parameters for each bending plane
            let (phi_y, phi_z) = if sec.as_y.is_some() || sec.as_z.is_some() {
                let l2 = l * l;
                let py = sec.as_y.map(|ay| 12.0 * e * sec.iy / (g * ay * l2)).unwrap_or(0.0);
                let pz = sec.as_z.map(|az| 12.0 * e * sec.iz / (g * az * l2)).unwrap_or(0.0);
                (py, pz)
            } else {
                (0.0, 0.0)
            };

            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);

            if kinematics.uses_warping_formulation() && dof_num.dofs_per_node >= 7 {
                let t = frame_transform_3d_warping(&ex, &ey, &ez);
                assemble_element_loads_3d_warping(loads, elem, &t, l, e, sec, &elem_dofs, f_global, rounding, phi_y, phi_z);
            } else if dof_num.dofs_per_node >= 7 {
                let t = frame_transform_3d(&ex, &ey, &ez);
                assemble_element_loads_3d_mapped(loads, elem, &t, l, e, sec, &elem_dofs, f_global, rounding, phi_y, phi_z);
            } else {
                let t = frame_transform_3d(&ex, &ey, &ez);
                assemble_element_loads_3d(loads, elem, &t, l, e, sec, &elem_dofs, f_global, rounding, phi_y, phi_z);
            }
        }
    }
}

/// Assemble the global force vector for 3D for a given set of loads, dense-path
/// flavor (with inclined support rotations applied). Produces exactly the same
/// `f` as `assemble_3d` would on the same loads.
pub fn assemble_load_vector_3d_dense(
    input: &SolverInput3D,
    loads: &[SolverLoad3D],
    dof_num: &DofNumbering,
    inclined_transforms: &[InclinedTransformData],
) -> Vec<f64> {
    assemble_load_vector_3d_with_rounding(input,loads,dof_num,inclined_transforms,false).0
}

pub(crate) fn assemble_load_vector_3d_with_rounding(
    input: &SolverInput3D,
    loads: &[SolverLoad3D],
    dof_num: &DofNumbering,
    inclined_transforms: &[InclinedTransformData],
    track_rounding: bool,
) -> (Vec<f64>, Vec<f64>) {
    let n = dof_num.n_total;
    let mut f_global = vec![0.0; n];
    let mut rounding = track_rounding.then(|| super::load_work::AssemblyRoundoff::new(n));

    // Pre-build O(1) lookup maps
    let node_map: std::collections::HashMap<usize, &SolverNode3D> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let plate_map: std::collections::HashMap<usize, &SolverPlateElement> =
        crate::ordered::values(&input.plates).map(|p| (p.id, p)).collect();
    let quad_map: std::collections::HashMap<usize, &SolverQuadElement> =
        crate::ordered::values(&input.quads).map(|q| (q.id, q)).collect();

    // Frame/truss element loads (FEF + thermal)
    assemble_frame_loads_3d(input, loads, dof_num, &mut f_global, &mut rounding);

    // Assemble 3D nodal loads
    for load in loads {
        if let SolverLoad3D::Nodal(nl) = load {
            let forces = [nl.fx, nl.fy, nl.fz, nl.mx, nl.my, nl.mz];
            for (i, &f) in forces.iter().enumerate() {
                if i < dof_num.dofs_per_node {
                    if let Some(&d) = dof_num.map.get(&(nl.node_id, i)) {
                        accumulate_load(&mut f_global, &mut rounding, d, f, 0.0);
                    }
                }
            }
            // Bimoment load (warping DOF 6)
            if let Some(bw) = nl.bw {
                if bw.abs() > 1e-15 {
                    if let Some(&d) = dof_num.map.get(&(nl.node_id, 6)) {
                        accumulate_load(&mut f_global, &mut rounding, d, bw, 0.0);
                    }
                }
            }
        }
        // Standalone bimoment load (warping DOF 6)
        if let SolverLoad3D::Bimoment(bl) = load {
            if bl.bimoment.abs() > 1e-15 {
                if let Some(&d) = dof_num.map.get(&(bl.node_id, 6)) {
                    accumulate_load(&mut f_global, &mut rounding, d, bl.bimoment, 0.0);
                }
            }
        }
        // Pressure loads on plate elements
        if let SolverLoad3D::Pressure(pl) = load {
            if let Some(&plate) = plate_map.get(&pl.element_id) {
                let n0 = node_map[&plate.nodes[0]];
                let n1 = node_map[&plate.nodes[1]];
                let n2 = node_map[&plate.nodes[2]];
                let coords = [
                    [n0.x, n0.y, n0.z],
                    [n1.x, n1.y, n1.z],
                    [n2.x, n2.y, n2.z],
                ];
                let f_press = crate::element::plate_pressure_load(&coords, pl.pressure);
                let plate_dofs = dof_num.plate_element_dofs(&plate.nodes);
                for (i, &dof) in plate_dofs.iter().enumerate() {
                    if i < f_press.len() {
                        accumulate_load(&mut f_global, &mut rounding, dof, f_press[i], 0.0);
                    }
                }
            }
        }
        // Plate thermal loads
        if let SolverLoad3D::PlateThermal(tl) = load {
            if let Some(&plate) = plate_map.get(&tl.element_id) {
                let n0 = node_map[&plate.nodes[0]];
                let n1 = node_map[&plate.nodes[1]];
                let n2 = node_map[&plate.nodes[2]];
                let coords = [
                    [n0.x, n0.y, n0.z],
                    [n1.x, n1.y, n1.z],
                    [n2.x, n2.y, n2.z],
                ];
                let mat = mat_map[&plate.material_id];
                let e = mat.e * 1000.0;
                let nu = mat.nu;
                let alpha = tl.alpha.unwrap_or(12e-6);
                let f_th = crate::element::plate_thermal_load(
                    &coords, e, nu, plate.thickness, alpha,
                    tl.dt_uniform, tl.dt_gradient,
                );
                let plate_dofs = dof_num.plate_element_dofs(&plate.nodes);
                for (i, &dof) in plate_dofs.iter().enumerate() {
                    if i < f_th.len() {
                        accumulate_load(&mut f_global, &mut rounding, dof, f_th[i], 0.0);
                    }
                }
            }
        }
        // Quad pressure loads
        if let SolverLoad3D::QuadPressure(pl) = load {
            if let Some(&quad) = quad_map.get(&pl.element_id) {
                let n0 = node_map[&quad.nodes[0]];
                let n1 = node_map[&quad.nodes[1]];
                let n2 = node_map[&quad.nodes[2]];
                let n3 = node_map[&quad.nodes[3]];
                let coords = [
                    [n0.x, n0.y, n0.z],
                    [n1.x, n1.y, n1.z],
                    [n2.x, n2.y, n2.z],
                    [n3.x, n3.y, n3.z],
                ];
                let f_press = crate::element::quad::quad_pressure_load(&coords, pl.pressure);
                let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
                for (i, &dof) in quad_dofs.iter().enumerate() {
                    if i < f_press.len() {
                        accumulate_load(&mut f_global, &mut rounding, dof, f_press[i], 0.0);
                    }
                }
            }
        }
        // Quad thermal loads
        if let SolverLoad3D::QuadThermal(tl) = load {
            if let Some(&quad) = quad_map.get(&tl.element_id) {
                let mat = mat_map[&quad.material_id];
                let e = mat.e * 1000.0;
                let nu = mat.nu;
                let alpha = tl.alpha.unwrap_or(1.2e-5);
                let n0 = node_map[&quad.nodes[0]];
                let n1 = node_map[&quad.nodes[1]];
                let n2 = node_map[&quad.nodes[2]];
                let n3 = node_map[&quad.nodes[3]];
                let coords = [
                    [n0.x, n0.y, n0.z],
                    [n1.x, n1.y, n1.z],
                    [n2.x, n2.y, n2.z],
                    [n3.x, n3.y, n3.z],
                ];
                let f_th = crate::element::quad::quad_thermal_load(
                    &coords, e, nu, quad.thickness, alpha,
                    tl.dt_uniform, tl.dt_gradient,
                );
                let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
                for (i, &dof) in quad_dofs.iter().enumerate() {
                    if i < f_th.len() {
                        accumulate_load(&mut f_global, &mut rounding, dof, f_th[i], 0.0);
                    }
                }
            }
        }
        // Quad self-weight loads
        if let SolverLoad3D::QuadSelfWeight(sw) = load {
            if let Some(&quad) = quad_map.get(&sw.element_id) {
                let n0 = node_map[&quad.nodes[0]];
                let n1 = node_map[&quad.nodes[1]];
                let n2 = node_map[&quad.nodes[2]];
                let n3 = node_map[&quad.nodes[3]];
                let coords = [
                    [n0.x, n0.y, n0.z],
                    [n1.x, n1.y, n1.z],
                    [n2.x, n2.y, n2.z],
                    [n3.x, n3.y, n3.z],
                ];
                let f_sw_local = crate::element::quad::quad_self_weight_load(
                    &coords, sw.density, quad.thickness, sw.gx, sw.gy, sw.gz,
                );
                let t_quad = crate::element::quad::quad_transform_3d(&coords);
                let f_sw = crate::linalg::transform_force(&f_sw_local, &t_quad, 24);
                let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
                for (i, &dof) in quad_dofs.iter().enumerate() {
                    if i < f_sw.len() {
                        accumulate_load(&mut f_global, &mut rounding, dof, f_sw[i], 0.0);
                    }
                }
            }
        }
        // Quad edge loads
        if let SolverLoad3D::QuadEdge(el) = load {
            if let Some(&quad) = quad_map.get(&el.element_id) {
                let n0 = node_map[&quad.nodes[0]];
                let n1 = node_map[&quad.nodes[1]];
                let n2 = node_map[&quad.nodes[2]];
                let n3 = node_map[&quad.nodes[3]];
                let coords = [
                    [n0.x, n0.y, n0.z],
                    [n1.x, n1.y, n1.z],
                    [n2.x, n2.y, n2.z],
                    [n3.x, n3.y, n3.z],
                ];
                let f_edge = crate::element::quad::quad_edge_load(&coords, el.edge, el.qn, el.qt);
                let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
                for (i, &dof) in quad_dofs.iter().enumerate() {
                    if i < f_edge.len() {
                        accumulate_load(&mut f_global, &mut rounding, dof, f_edge[i], 0.0);
                    }
                }
            }
        }
    }

    // Quad9 (MITC9) load dispatch — dense path
    let quad9_map: std::collections::HashMap<usize, &SolverQuad9Element> =
        crate::ordered::values(&input.quad9s).map(|q| (q.id, q)).collect();
    for load in loads {
        if let SolverLoad3D::Quad9Pressure(pl) = load {
            if let Some(&q9) = quad9_map.get(&pl.element_id) {
                let coords = quad9_coords(&node_map, q9);
                let f_p = crate::element::quad9::quad9_pressure_load(&coords, pl.pressure);
                let dofs = dof_num.quad9_element_dofs(&q9.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_p.len() { accumulate_load(&mut f_global, &mut rounding, dof, f_p[i], 0.0); }
                }
            }
        }
        if let SolverLoad3D::Quad9Thermal(tl) = load {
            if let Some(&q9) = quad9_map.get(&tl.element_id) {
                let mat = mat_map[&q9.material_id];
                let e = mat.e * 1000.0;
                let nu = mat.nu;
                let alpha = tl.alpha.unwrap_or(1.2e-5);
                let coords = quad9_coords(&node_map, q9);
                let f_th = crate::element::quad9::quad9_thermal_load(
                    &coords, e, nu, q9.thickness, alpha, tl.dt_uniform, tl.dt_gradient,
                );
                let dofs = dof_num.quad9_element_dofs(&q9.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_th.len() { accumulate_load(&mut f_global, &mut rounding, dof, f_th[i], 0.0); }
                }
            }
        }
        if let SolverLoad3D::Quad9SelfWeight(sw) = load {
            if let Some(&q9) = quad9_map.get(&sw.element_id) {
                let coords = quad9_coords(&node_map, q9);
                let f_sw_local = crate::element::quad9::quad9_self_weight_load(
                    &coords, sw.density, q9.thickness, sw.gx, sw.gy, sw.gz,
                );
                let t_q9 = crate::element::quad9::quad9_transform_3d(&coords);
                let f_sw = crate::linalg::transform_force(&f_sw_local, &t_q9, 54);
                let dofs = dof_num.quad9_element_dofs(&q9.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_sw.len() { accumulate_load(&mut f_global, &mut rounding, dof, f_sw[i], 0.0); }
                }
            }
        }
        if let SolverLoad3D::Quad9Edge(el) = load {
            if let Some(&q9) = quad9_map.get(&el.element_id) {
                let coords = quad9_coords(&node_map, q9);
                let f_edge = crate::element::quad9::quad9_edge_load(&coords, el.edge, el.qn, el.qt);
                let dofs = dof_num.quad9_element_dofs(&q9.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_edge.len() { accumulate_load(&mut f_global, &mut rounding, dof, f_edge[i], 0.0); }
                }
            }
        }
    }

    // Solid-shell load dispatch — dense path
    let ss_map: std::collections::HashMap<usize, &SolverSolidShellElement> =
        crate::ordered::values(&input.solid_shells).map(|s| (s.id, s)).collect();
    for load in loads {
        if let SolverLoad3D::SolidShellPressure(pl) = load {
            if let Some(&ss) = ss_map.get(&pl.element_id) {
                let coords = solid_shell_coords(&node_map, ss);
                let f_p = crate::element::solid_shell::solid_shell_pressure_load(&coords, pl.pressure);
                let dofs = dof_num.solid_shell_element_dofs(&ss.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_p.len() { accumulate_load(&mut f_global, &mut rounding, dof, f_p[i], 0.0); }
                }
            }
        }
        if let SolverLoad3D::SolidShellSelfWeight(sw) = load {
            if let Some(&ss) = ss_map.get(&sw.element_id) {
                let coords = solid_shell_coords(&node_map, ss);
                let f_sw = crate::element::solid_shell::solid_shell_self_weight_load(
                    &coords, sw.density, sw.gx, sw.gy, sw.gz,
                );
                let dofs = dof_num.solid_shell_element_dofs(&ss.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_sw.len() { accumulate_load(&mut f_global, &mut rounding, dof, f_sw[i], 0.0); }
                }
            }
        }
    }

    // Curved shell load dispatch — dense path
    let cs_map: std::collections::HashMap<usize, &SolverCurvedShellElement> =
        crate::ordered::values(&input.curved_shells).map(|s| (s.id, s)).collect();
    for load in loads {
        if let SolverLoad3D::CurvedShellPressure(pl) = load {
            if let Some(&cs) = cs_map.get(&pl.element_id) {
                let coords = curved_shell_coords(&node_map, cs);
                let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&coords));
                let f_p = crate::element::curved_shell::curved_shell_pressure_load(&coords, &dirs, cs.thickness, pl.pressure);
                let dofs = dof_num.quad_element_dofs(&cs.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_p.len() { accumulate_load(&mut f_global, &mut rounding, dof, f_p[i], 0.0); }
                }
            }
        }
        if let SolverLoad3D::CurvedShellThermal(tl) = load {
            if let Some(&cs) = cs_map.get(&tl.element_id) {
                let mat = mat_map[&cs.material_id];
                let e = mat.e * 1000.0;
                let nu = mat.nu;
                let alpha = tl.alpha.unwrap_or(1.2e-5);
                let coords = curved_shell_coords(&node_map, cs);
                let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&coords));
                let f_th = crate::element::curved_shell::curved_shell_thermal_load(
                    &coords, &dirs, e, nu, cs.thickness, alpha, tl.dt_uniform, tl.dt_gradient,
                );
                let dofs = dof_num.quad_element_dofs(&cs.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_th.len() { accumulate_load(&mut f_global, &mut rounding, dof, f_th[i], 0.0); }
                }
            }
        }
        if let SolverLoad3D::CurvedShellSelfWeight(sw) = load {
            if let Some(&cs) = cs_map.get(&sw.element_id) {
                let coords = curved_shell_coords(&node_map, cs);
                let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&coords));
                let f_sw = crate::element::curved_shell::curved_shell_self_weight_load(
                    &coords, &dirs, sw.density, cs.thickness, sw.gx, sw.gy, sw.gz,
                );
                let dofs = dof_num.quad_element_dofs(&cs.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_sw.len() { accumulate_load(&mut f_global, &mut rounding, dof, f_sw[i], 0.0); }
                }
            }
        }
        if let SolverLoad3D::CurvedShellEdge(el) = load {
            if let Some(&cs) = cs_map.get(&el.element_id) {
                let coords = curved_shell_coords(&node_map, cs);
                let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&coords));
                let f_e = crate::element::curved_shell::curved_shell_edge_load(
                    &coords, &dirs, cs.thickness, el.edge, el.qn, el.qt,
                );
                let dofs = dof_num.quad_element_dofs(&cs.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_e.len() { accumulate_load(&mut f_global, &mut rounding, dof, f_e[i], 0.0); }
                }
            }
        }
    }

    // Apply inclined support rotations to the force vector
    for it in inclined_transforms {
        rotate_inclined_vector_with_rounding(&mut f_global, &it.dofs, &it.r, &mut rounding);
    }

    (f_global, rounding.map_or_else(Vec::new, |r| r.finish()))
}

/// Assemble global stiffness matrix and force vector for 3D.
pub fn assemble_3d(input: &SolverInput3D, dof_num: &DofNumbering) -> AssemblyResult {
    let stiff = assemble_stiffness_3d(input, dof_num);
    let f = assemble_load_vector_3d_dense(input, &input.loads, dof_num, &stiff.inclined_transforms);
    AssemblyResult {
        k: stiff.k,
        f,
        max_diag_k: stiff.max_diag_k,
        artificial_dofs: stiff.artificial_dofs,
        inclined_transforms: stiff.inclined_transforms,
        inclined_transforms_2d: Vec::new(),
        diagnostics: stiff.diagnostics,
    }
}



fn accumulate_frame_load(local: &[f64], t: &[f64], n: usize, dofs: &[usize], mapping: Option<&[usize;12]>, global: &mut [f64], rounding: &mut Option<super::load_work::AssemblyRoundoff>) {
    let force = transform_force(local,t,n);
    let axes = if n == 6 { [[t[0],t[1],0.0],[t[n],t[n+1],0.0],[0.0,0.0,1.0]] } else { [[t[0],t[1],t[2]],[t[n],t[n+1],t[n+2]],[t[2*n],t[2*n+1],t[2*n+2]]] };
    let frame_rounding = if rounding.is_none() {[[0.0;3];3]} else {super::load_work::frame_rounding(&axes)};
    for (i, &value) in force.iter().enumerate() {
        let dof = dofs[mapping.map_or(i, |map| map[i])];
        if let Some(rounding) = rounding.as_mut() {
            let mut sum = 0.0;
            let mut error = 0.0;
            for j in 0..n {
                let product = t[j*n+i] * local[j];
                error = super::load_work::add_up(error,super::load_work::product_rounding(t[j*n+i],local[j],product));
                error = super::load_work::add_up(error,super::load_work::sum_rounding(sum,product));
                sum += product;
            }
            let start = if n == 14 && i >= 7 {7} else if n == 12 && i >= 6 {6} else {0};
            let component = i - start;
            if n == 6 {
                if i%3 < 2 { for j in 0..2 { error = super::load_work::add_up(error,super::load_work::mul_up(frame_rounding[j][i%3],local[i/3*3+j].abs())); } }
            } else if component < 6 {
                let offset = start + if component < 3 {0} else {3};
                for j in 0..3 {
                    error = super::load_work::add_up(error,super::load_work::mul_up(frame_rounding[j][component%3],local[offset+j].abs()));
                }
            }
            rounding.accumulate(dof,value,error,global[dof]);
        }
        global[dof] += value;
    }
}

fn assemble_element_loads_3d(
    loads: &[SolverLoad3D],
    elem: &SolverElement3D,
    t: &[f64],
    l: f64,
    e: f64,
    sec: &SolverSection3D,
    elem_dofs: &[usize],
    f_global: &mut [f64],
    rounding: &mut Option<super::load_work::AssemblyRoundoff>,
    phi_y: f64,
    phi_z: f64,
) {
    for load in loads {
        match load {
            SolverLoad3D::Distributed(dl) if dl.element_id == elem.id => {
                let a = dl.a.unwrap_or(0.0);
                let b = dl.b.unwrap_or(l);
                let is_full = (a.abs() < 1e-12) && ((b - l).abs() < 1e-12);

                let mut fef = if is_full {
                    fef_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, l, phi_y, phi_z)
                } else {
                    fef_partial_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, a, b, l, phi_y, phi_z)
                };
                let axial = crate::element::axial_distributed_fef(dl.q_xi, dl.q_xj, dl.a.unwrap_or(0.0), dl.b.unwrap_or(l), l);
                fef[0] = axial[0];
                fef[6] = axial[1];
                adjust_fef_for_hinges_3d(&mut fef, l, Hinge3D::from_elem(elem), phi_y, phi_z);
                accumulate_frame_load(&fef, t, 12, elem_dofs, None, f_global, rounding);
            }
            SolverLoad3D::PointOnElement(pl) if pl.element_id == elem.id => {
                let mut fef = fef_point_load_with_axial_3d(pl.px, pl.py, pl.pz, pl.a, l, phi_y, phi_z);

                adjust_fef_for_hinges_3d(&mut fef, l, Hinge3D::from_elem(elem), phi_y, phi_z);
                accumulate_frame_load(&fef, t, 12, elem_dofs, None, f_global, rounding);
            }
            SolverLoad3D::Thermal(tl) if tl.element_id == elem.id => {
                let alpha = tl.alpha();
                let hy = tl.depth_y(sec.a, sec.iz);
                let hz = tl.depth_z(sec.a, sec.iy);
                let mut fef = fef_thermal_3d(
                    e, sec.a, sec.iy, sec.iz, l,
                    tl.dt_uniform, tl.dt_gradient_y, tl.dt_gradient_z,
                    alpha, hy, hz,
                );
                adjust_fef_for_hinges_3d(&mut fef, l, Hinge3D::from_elem(elem), phi_y, phi_z);
                accumulate_frame_load(&fef, t, 12, elem_dofs, None, f_global, rounding);
            }
            _ => {}
        }
    }
}

/// Assemble 3D element loads for warping elements (14-DOF transform).
fn assemble_element_loads_3d_warping(
    loads: &[SolverLoad3D],
    elem: &SolverElement3D,
    t14: &[f64],
    l: f64,
    e: f64,
    sec: &SolverSection3D,
    elem_dofs: &[usize],
    f_global: &mut [f64],
    rounding: &mut Option<super::load_work::AssemblyRoundoff>,
    phi_y: f64,
    phi_z: f64,
) {
    for load in loads {
        match load {
            SolverLoad3D::Distributed(dl) if dl.element_id == elem.id => {
                let a = dl.a.unwrap_or(0.0);
                let b = dl.b.unwrap_or(l);
                let is_full = (a.abs() < 1e-12) && ((b - l).abs() < 1e-12);

                let mut fef12 = if is_full {
                    fef_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, l, phi_y, phi_z)
                } else {
                    fef_partial_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, a, b, l, phi_y, phi_z)
                };
                let axial = crate::element::axial_distributed_fef(dl.q_xi, dl.q_xj, dl.a.unwrap_or(0.0), dl.b.unwrap_or(l), l);
                fef12[0] = axial[0];
                fef12[6] = axial[1];
                adjust_fef_for_hinges_3d(&mut fef12, l, Hinge3D::from_elem(elem), phi_y, phi_z);
                let fef14 = expand_fef_12_to_14(&fef12);
                accumulate_frame_load(&fef14, t14, 14, elem_dofs, None, f_global, rounding);
            }
            SolverLoad3D::PointOnElement(pl) if pl.element_id == elem.id => {
                let mut fef12 = fef_point_load_with_axial_3d(pl.px, pl.py, pl.pz, pl.a, l, phi_y, phi_z);
                adjust_fef_for_hinges_3d(&mut fef12, l, Hinge3D::from_elem(elem), phi_y, phi_z);
                let fef14 = expand_fef_12_to_14(&fef12);
                accumulate_frame_load(&fef14, t14, 14, elem_dofs, None, f_global, rounding);
            }
            SolverLoad3D::Thermal(tl) if tl.element_id == elem.id => {
                let alpha = tl.alpha();
                let hy = tl.depth_y(sec.a, sec.iz);
                let hz = tl.depth_z(sec.a, sec.iy);
                let mut fef12 = fef_thermal_3d(
                    e, sec.a, sec.iy, sec.iz, l,
                    tl.dt_uniform, tl.dt_gradient_y, tl.dt_gradient_z,
                    alpha, hy, hz,
                );
                adjust_fef_for_hinges_3d(&mut fef12, l, Hinge3D::from_elem(elem), phi_y, phi_z);
                let fef14 = expand_fef_12_to_14(&fef12);
                accumulate_frame_load(&fef14, t14, 14, elem_dofs, None, f_global, rounding);
            }
            _ => {}
        }
    }
}

/// Assemble 3D element loads for non-warping elements in a warping model (12-DOF mapped to 14).
fn assemble_element_loads_3d_mapped(
    loads: &[SolverLoad3D],
    elem: &SolverElement3D,
    t12: &[f64],
    l: f64,
    e: f64,
    sec: &SolverSection3D,
    elem_dofs: &[usize],
    f_global: &mut [f64],
    rounding: &mut Option<super::load_work::AssemblyRoundoff>,
    phi_y: f64,
    phi_z: f64,
) {
    for load in loads {
        match load {
            SolverLoad3D::Distributed(dl) if dl.element_id == elem.id => {
                let a = dl.a.unwrap_or(0.0);
                let b = dl.b.unwrap_or(l);
                let is_full = (a.abs() < 1e-12) && ((b - l).abs() < 1e-12);

                let mut fef = if is_full {
                    fef_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, l, phi_y, phi_z)
                } else {
                    fef_partial_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, a, b, l, phi_y, phi_z)
                };
                let axial = crate::element::axial_distributed_fef(dl.q_xi, dl.q_xj, dl.a.unwrap_or(0.0), dl.b.unwrap_or(l), l);
                fef[0] = axial[0];
                fef[6] = axial[1];
                adjust_fef_for_hinges_3d(&mut fef, l, Hinge3D::from_elem(elem), phi_y, phi_z);
                accumulate_frame_load(&fef, t12, 12, elem_dofs, Some(&DOF_MAP_12_TO_14), f_global, rounding);
            }
            SolverLoad3D::PointOnElement(pl) if pl.element_id == elem.id => {
                let mut fef = fef_point_load_with_axial_3d(pl.px, pl.py, pl.pz, pl.a, l, phi_y, phi_z);
                adjust_fef_for_hinges_3d(&mut fef, l, Hinge3D::from_elem(elem), phi_y, phi_z);
                accumulate_frame_load(&fef, t12, 12, elem_dofs, Some(&DOF_MAP_12_TO_14), f_global, rounding);
            }
            SolverLoad3D::Thermal(tl) if tl.element_id == elem.id => {
                let alpha = tl.alpha();
                let hy = tl.depth_y(sec.a, sec.iz);
                let hz = tl.depth_z(sec.a, sec.iy);
                let mut fef = fef_thermal_3d(
                    e, sec.a, sec.iy, sec.iz, l,
                    tl.dt_uniform, tl.dt_gradient_y, tl.dt_gradient_z,
                    alpha, hy, hz,
                );
                adjust_fef_for_hinges_3d(&mut fef, l, Hinge3D::from_elem(elem), phi_y, phi_z);
                accumulate_frame_load(&fef, t12, 12, elem_dofs, Some(&DOF_MAP_12_TO_14), f_global, rounding);
            }
            _ => {}
        }
    }
}

/// Sparse assembly result: CSC lower-triangle Kff + dense force vector.
pub struct SparseAssemblyResult {
    pub k_ff: CscMatrix,
    /// Full n×n K (all DOFs), only when requested — for reactions and
    /// prescribed-DOF corrections without a dense assembly.
    pub k_full: Option<CscMatrix>,
    pub f: Vec<f64>,       // n_total force vector (same as dense)
    pub max_diag_k: f64,
    pub artificial_dofs: Vec<usize>,
    /// Inclined-roller rotations applied to K and f (see `assemble_stiffness_2d`).
    pub inclined_transforms_2d: Vec<InclinedTransformData2D>,
}

/// Sparse 3D assembly result with full-K for reactions and inclined support data.
pub struct SparseAssemblyResult3D {
    pub k_ff: CscMatrix,
    pub k_full: Option<CscMatrix>,
    pub f: Vec<f64>,
    pub max_diag_k: f64,
    pub artificial_dofs: Vec<usize>,
    pub inclined_transforms: Vec<InclinedTransformData>,
    pub diagnostics: Vec<crate::types::AssemblyDiagnostic>,
}

/// Assemble sparse Kff for 2D. Returns CSC lower-triangle of the free-DOF block.
pub fn assemble_sparse_2d(input: &SolverInput, dof_num: &DofNumbering) -> SparseAssemblyResult {
    assemble_sparse_2d_ex(input, dof_num, false)
}

/// Sparse 2D assembly with optional full-K (all DOFs) alongside the free block.
///
/// The stiffness is `sparse_assembly::assemble_stiffness_sparse_2d` (the
/// linear static path, entry for entry the dense `assemble_stiffness_2d`:
/// rotated spring blocks, springs on restrained DOFs in K_rr, the orphan
/// rotation guard and inclined-roller rotations) and the force vector
/// `assemble_load_vector_2d`. A hand-copied assembler used to live here and
/// had drifted from both. K, f and the returned K_ff are in the inclined
/// frames listed in `inclined_transforms_2d`; callers rotate displacements
/// back with `reverse_inclined_transform_2d`.
pub fn assemble_sparse_2d_ex(input: &SolverInput, dof_num: &DofNumbering, build_k_full: bool) -> SparseAssemblyResult {
    let stiff = super::sparse_assembly::assemble_stiffness_sparse_2d(input, dof_num);
    let f = assemble_load_vector_2d(input, &input.loads, dof_num, &stiff.inclined_transforms_2d);
    SparseAssemblyResult {
        k_ff: stiff.k_ff,
        k_full: if build_k_full { Some(stiff.k_full) } else { None },
        f,
        max_diag_k: stiff.max_diag_k,
        artificial_dofs: stiff.artificial_dofs,
        inclined_transforms_2d: stiff.inclined_transforms_2d,
    }
}

/// Apply inclined support rotation to COO triplets and force vector.
/// Equivalent to the dense `apply_inclined_transform` but operates on triplet arrays.
pub fn apply_inclined_transform_triplets(
    trip_rows: &mut Vec<usize>, trip_cols: &mut Vec<usize>, trip_vals: &mut Vec<f64>,
    f_global: &mut [f64], dofs: &[usize; 3], r: &[[f64; 3]; 3],
) {
    apply_inclined_transform_triplets_k(trip_rows, trip_cols, trip_vals, dofs, r);
    rotate_inclined_f_triplets(f_global, dofs, r);
}

/// Rotate force vector at inclined-support DOFs: F'[dofs[a]] = sum_b R[a][b] * F[dofs[b]].
pub fn rotate_inclined_f_triplets(f_global: &mut [f64], dofs: &[usize; 3], r: &[[f64; 3]; 3]) {
    rotate_inclined_vector(f_global, dofs, r);
}

/// One inclined-support rotation, plane (`InclinedTransformData2D`) or
/// spatial (`InclinedTransformData`). The stiffness assemblers rotate K into
/// these frames; every analysis that builds a matrix or vector beside K (mass,
/// geometric stiffness, influence vectors, load histories) rotates it the same
/// way, and rotates its results back, through this trait.
pub(crate) trait InclinedFrame {
    /// `v[dofs] = R·v[dofs]`: global axes to the support frame.
    fn rotate(&self, v: &mut [f64]);
    /// `v[dofs] = Rᵀ·v[dofs]`: support frame to global axes.
    fn reverse(&self, v: &mut [f64]);
    /// `R·K·Rᵀ` on the support DOFs of a symmetric matrix given as triplets.
    fn rotate_triplets(&self, rows: &mut Vec<usize>, cols: &mut Vec<usize>, vals: &mut Vec<f64>);
    /// `R·K·Rᵀ` on the support DOFs of a dense row-major n×n matrix.
    fn rotate_dense(&self, k: &mut [f64], n: usize);
}

impl InclinedFrame for InclinedTransformData2D {
    fn rotate(&self, v: &mut [f64]) { rotate_inclined_f_2d(v, &self.dofs, &self.r) }
    fn reverse(&self, v: &mut [f64]) { reverse_inclined_transform_2d(v, &self.dofs, &self.r) }
    fn rotate_triplets(&self, rows: &mut Vec<usize>, cols: &mut Vec<usize>, vals: &mut Vec<f64>) {
        apply_inclined_transform_triplets_2d(rows, cols, vals, &self.dofs, &self.r)
    }
    fn rotate_dense(&self, k: &mut [f64], n: usize) { rotate_inclined_k_2d(k, n, &self.dofs, &self.r) }
}

impl InclinedFrame for InclinedTransformData {
    fn rotate(&self, v: &mut [f64]) { rotate_inclined_f_3d(v, &self.dofs, &self.r) }
    fn reverse(&self, v: &mut [f64]) { reverse_inclined_transform(v, &self.dofs, &self.r) }
    fn rotate_triplets(&self, rows: &mut Vec<usize>, cols: &mut Vec<usize>, vals: &mut Vec<f64>) {
        apply_inclined_transform_triplets_k(rows, cols, vals, &self.dofs, &self.r)
    }
    fn rotate_dense(&self, k: &mut [f64], n: usize) { rotate_inclined_k_3d(k, n, &self.dofs, &self.r) }
}

/// Rotate a symmetric matrix given as triplets over all DOFs (each unordered
/// pair once, either triangle) into the inclined-support frames, then keep
/// only the free×free block. This is what the sparse stiffness assemblers do
/// to K, for the matrices built beside it (mass, geometric stiffness): the
/// rotated free block needs the restrained normal DOF's row, so the rotation
/// has to happen before the free filter.
pub(crate) fn rotate_inclined_free_block<T: InclinedFrame>(
    trip_rows: &mut Vec<usize>, trip_cols: &mut Vec<usize>, trip_vals: &mut Vec<f64>,
    its: &[T], nf: usize,
) {
    for it in its {
        it.rotate_triplets(trip_rows, trip_cols, trip_vals);
    }
    let mut w = 0;
    for r in 0..trip_rows.len() {
        if trip_rows[r] < nf && trip_cols[r] < nf && trip_vals[r] != 0.0 {
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

/// Rotate a dense all-DOF n×n matrix (a dense mass) into the inclined-support
/// frames, as the dense stiffness assemblers do to K. Extract the free block
/// afterwards.
pub(crate) fn rotate_inclined_dense<T: InclinedFrame>(m: &mut [f64], n: usize, its: &[T]) {
    for it in its {
        it.rotate_dense(m, n);
    }
}

/// A global-axes vector over all DOFs (an influence vector, a force record)
/// to the free DOFs of the inclined-support frames: rotated, then cut to `nf`
/// (at a support only the tangential components are free).
pub(crate) fn to_inclined_free<T: InclinedFrame>(mut v: Vec<f64>, its: &[T], nf: usize) -> Vec<f64> {
    for it in its {
        it.rotate(&mut v);
    }
    v.truncate(nf);
    v
}

pub(crate) fn inclined_residual<T: InclinedFrame>(
    external: &[f64],
    internal: &[f64],
    its: &[T],
) -> Vec<f64> {
    let mut external = external.to_vec();
    let mut internal = internal.to_vec();
    for it in its {
        it.rotate(&mut external);
        it.rotate(&mut internal);
    }
    external.iter().zip(internal).map(|(a, b)| a - b).collect()
}

/// A free-DOF vector in the inclined-support frames (a mode shape, a state)
/// to an all-DOF vector in global axes: restrained DOFs zero, supports
/// rotated back.
pub(crate) fn to_global<T: InclinedFrame>(v_free: &[f64], n: usize, its: &[T]) -> Vec<f64> {
    let mut g = vec![0.0; n];
    g[..v_free.len()].copy_from_slice(v_free);
    for it in its {
        it.reverse(&mut g);
    }
    g
}

/// K-only 2D inclined support rotation on stiffness triplets (zeros originals,
/// re-adds rotated entries), mirroring `apply_inclined_transform_triplets_k`.
pub(crate) fn apply_inclined_transform_triplets_2d(
    trip_rows: &mut Vec<usize>, trip_cols: &mut Vec<usize>, trip_vals: &mut Vec<f64>,
    dofs: &[usize; 2], r: &[[f64; 2]; 2],
) {
    let dof_local: std::collections::HashMap<usize, usize> =
        dofs.iter().enumerate().map(|(i, &d)| (d, i)).collect();

    // Collect entries touching inclined DOFs, zero originals.
    // The dof-block is stored full (both triangles) so the rotated
    // R * block * R^T is exact; each unordered pair is pushed once.
    let mut block = [[0.0; 2]; 2];
    let mut cross_row: std::collections::HashMap<usize, [f64; 2]> = Default::default();
    let mut cross_col: std::collections::HashMap<usize, [f64; 2]> = Default::default();

    for idx in 0..trip_rows.len() {
        let ri = trip_rows[idx];
        let ci = trip_cols[idx];
        let v = trip_vals[idx];
        let r_loc = dof_local.get(&ri).copied();
        let c_loc = dof_local.get(&ci).copied();
        match (r_loc, c_loc) {
            (Some(a), Some(b)) => {
                block[a][b] += v;
                if a != b { block[b][a] += v; }
                trip_vals[idx] = 0.0;
            }
            (Some(a), None)    => { cross_col.entry(ci).or_insert([0.0; 2])[a] += v; trip_vals[idx] = 0.0; }
            (None, Some(b))    => { cross_row.entry(ri).or_insert([0.0; 2])[b] += v; trip_vals[idx] = 0.0; }
            (None, None)       => {}
        }
    }

    // Rotated block: R * block * R^T (push each unordered pair once)
    for a in 0..2 {
        for b in 0..=a {
            let mut s = 0.0;
            for c in 0..2 { for d in 0..2 { s += r[a][c] * block[c][d] * r[b][d]; } }
            if s.abs() > 1e-30 {
                trip_rows.push(dofs[a]); trip_cols.push(dofs[b]); trip_vals.push(s);
            }
        }
    }
    // Cross-row: K'[i, dofs[a]] = sum_b K[i, dofs[b]] * R[a][b]
    for (&i, v2) in crate::ordered::entries(&cross_row) {
        for a in 0..2 {
            let s: f64 = (0..2).map(|b| v2[b] * r[a][b]).sum();
            if s.abs() > 1e-30 {
                trip_rows.push(i); trip_cols.push(dofs[a]); trip_vals.push(s);
            }
        }
    }
    // Cross-col: K'[dofs[a], j] = sum_b R[a][b] * K[dofs[b], j]
    for (&j, v2) in crate::ordered::entries(&cross_col) {
        for a in 0..2 {
            let s: f64 = (0..2).map(|b| r[a][b] * v2[b]).sum();
            if s.abs() > 1e-30 {
                trip_rows.push(dofs[a]); trip_cols.push(j); trip_vals.push(s);
            }
        }
    }
}

/// K-only inclined support rotation on stiffness triplets (zeros originals, re-adds rotated entries).
pub(crate) fn apply_inclined_transform_triplets_k(
    trip_rows: &mut Vec<usize>, trip_cols: &mut Vec<usize>, trip_vals: &mut Vec<f64>,
    dofs: &[usize; 3], r: &[[f64; 3]; 3],
) {
    let dof_local: std::collections::HashMap<usize, usize> =
        dofs.iter().enumerate().map(|(i, &d)| (d, i)).collect();

    // Collect entries touching inclined DOFs, zero originals.
    // The dof-block is stored full (both triangles) so the rotated
    // R * block * R^T is exact; each unordered pair is pushed once.
    let mut block = [[0.0; 3]; 3];
    let mut cross_row: std::collections::HashMap<usize, [f64; 3]> = Default::default();
    let mut cross_col: std::collections::HashMap<usize, [f64; 3]> = Default::default();

    for idx in 0..trip_rows.len() {
        let ri = trip_rows[idx];
        let ci = trip_cols[idx];
        let v = trip_vals[idx];
        let r_loc = dof_local.get(&ri).copied();
        let c_loc = dof_local.get(&ci).copied();
        match (r_loc, c_loc) {
            (Some(a), Some(b)) => {
                block[a][b] += v;
                if a != b { block[b][a] += v; }
                trip_vals[idx] = 0.0;
            }
            (Some(a), None)    => { cross_col.entry(ci).or_insert([0.0; 3])[a] += v; trip_vals[idx] = 0.0; }
            (None, Some(b))    => { cross_row.entry(ri).or_insert([0.0; 3])[b] += v; trip_vals[idx] = 0.0; }
            (None, None)       => {}
        }
    }

    // Rotated block: R * block * R^T (push each unordered pair once)
    for a in 0..3 {
        for b in 0..=a {
            let mut s = 0.0;
            for c in 0..3 { for d in 0..3 { s += r[a][c] * block[c][d] * r[b][d]; } }
            if s.abs() > 1e-30 {
                trip_rows.push(dofs[a]); trip_cols.push(dofs[b]); trip_vals.push(s);
            }
        }
    }
    // Cross-row: K'[i, dofs[a]] = sum_b K[i, dofs[b]] * R[a][b]
    for (&i, v3) in crate::ordered::entries(&cross_row) {
        for a in 0..3 {
            let s: f64 = (0..3).map(|b| v3[b] * r[a][b]).sum();
            if s.abs() > 1e-30 {
                trip_rows.push(i); trip_cols.push(dofs[a]); trip_vals.push(s);
            }
        }
    }
    // Cross-col: K'[dofs[a], j] = sum_b R[a][b] * K[dofs[b], j]
    for (&j, v3) in crate::ordered::entries(&cross_col) {
        for a in 0..3 {
            let s: f64 = (0..3).map(|b| r[a][b] * v3[b]).sum();
            if s.abs() > 1e-30 {
                trip_rows.push(dofs[a]); trip_cols.push(j); trip_vals.push(s);
            }
        }
    }
}

/// Stiffness-only sparse 3D assembly result (triplet transforms applied, CSC built).
pub struct StiffnessSparseAssembly3D {
    pub k_ff: CscMatrix,
    pub k_full: Option<CscMatrix>,
    pub max_diag_k: f64,
    pub artificial_dofs: Vec<usize>,
    pub inclined_transforms: Vec<InclinedTransformData>,
    pub diagnostics: Vec<crate::types::AssemblyDiagnostic>,
}

/// Assemble sparse K for 3D (load-independent). Returns CSC of Kff (always) and
/// full K (if `build_k_full` is true). The force vector is assembled separately
/// by `assemble_load_vector_3d_sparse`.
pub fn assemble_stiffness_sparse_3d(input: &SolverInput3D, dof_num: &DofNumbering, build_k_full: bool) -> StiffnessSparseAssembly3D {
    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let left_hand = input.left_hand.unwrap_or(false);

    let mut trip_rows = Vec::new();
    let mut trip_cols = Vec::new();
    let mut trip_vals = Vec::new();
    let mut max_diag = 0.0f64;
    // Diagonal over ALL DOFs, as the dense assembler takes its maximum: the
    // artificial warping stiffness and `max_diag_k` must not depend on the path.
    let mut diag_vals = vec![0.0f64; n];

    // Pre-build O(1) lookup maps
    let node_map: std::collections::HashMap<usize, &SolverNode3D> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_map: std::collections::HashMap<usize, &SolverSection3D> =
        crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();

    // Helper: scatter element stiffness into triplets (full K, lower triangle)
    macro_rules! scatter {
        ($k_glob:expr, $dofs:expr, $ndof:expr) => {
            for i in 0..$ndof {
                let gi = $dofs[i];
                for j in 0..$ndof {
                    let gj = $dofs[j];
                    if gi >= gj {
                        trip_rows.push(gi); trip_cols.push(gj); trip_vals.push($k_glob[i * $ndof + j]);
                    }
                }
                diag_vals[gi] += $k_glob[i * $ndof + i];
            }
        };
    }

    // Frame and truss elements (sorted by ID for deterministic assembly)
    let mut sorted_elems: Vec<&SolverElement3D> = crate::ordered::values(&input.elements).collect();
    sorted_elems.sort_by_key(|e| e.id);
    for elem in sorted_elems {
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

        let kinematics = MemberKinematics3D::from_elem(elem, sec);
        if kinematics == MemberKinematics3D::Axial {
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
                                if da == db { diag_vals[da] += sign * ea_l * dir[i] * dir[j]; }
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

            let (phi_y, phi_z) = if sec.as_y.is_some() || sec.as_z.is_some() {
                let l2 = l * l;
                let py = sec.as_y.map(|ay| 12.0 * e * sec.iy / (g * ay * l2)).unwrap_or(0.0);
                let pz = sec.as_z.map(|az| 12.0 * e * sec.iz / (g * az * l2)).unwrap_or(0.0);
                (py, pz)
            } else {
                (0.0, 0.0)
            };

            if kinematics.uses_warping_formulation() && dof_num.dofs_per_node >= 7 {
                let k_local = frame_local_stiffness_3d_warping(
                    e, sec.a, sec.iy, sec.iz, sec.j, sec.cw.unwrap(), l, g,
                    Hinge3D::from_elem(elem),
                    phi_y, phi_z,
                );
                let t = frame_transform_3d_warping(&ex, &ey, &ez);
                let k_glob = transform_stiffness(&k_local, &t, 14);
                let ndof = elem_dofs.len();
                scatter!(k_glob, elem_dofs, ndof);
            } else if dof_num.dofs_per_node >= 7 {
                let k_local = frame_local_stiffness_3d(e, sec.a, sec.iy, sec.iz, sec.j, l, g,
                    Hinge3D::from_elem(elem),
                    phi_y, phi_z);
                let t = frame_transform_3d(&ex, &ey, &ez);
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
                    diag_vals[gi] += k_glob[i * 12 + i];
                }
            } else {
                let k_local = frame_local_stiffness_3d(e, sec.a, sec.iy, sec.iz, sec.j, l, g,
                    Hinge3D::from_elem(elem),
                    phi_y, phi_z);
                let t = frame_transform_3d(&ex, &ey, &ez);
                let k_glob = transform_stiffness(&k_local, &t, 12);
                let ndof = elem_dofs.len();
                scatter!(k_glob, elem_dofs, ndof);
            }
        }
    }

    // Connector elements (in id order, for deterministic assembly)
    for (gi, gj, v) in crate::element::connector::connector_entries_3d(input, dof_num) {
        if gi >= gj {
            trip_rows.push(gi); trip_cols.push(gj); trip_vals.push(v);
        }
        // Diagonal over all DOFs (see `diag_vals`).
        if gi == gj { diag_vals[gi] += v; }
    }

    // Plate elements (DKT+CST, 18 DOFs per element, sorted for determinism)
    let mut sorted_plates: Vec<&SolverPlateElement> = crate::ordered::values(&input.plates).collect();
    sorted_plates.sort_by_key(|p| p.id);
    for plate in sorted_plates {
        let mat = mat_map[&plate.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;
        let n0 = node_map[&plate.nodes[0]];
        let n1 = node_map[&plate.nodes[1]];
        let n2 = node_map[&plate.nodes[2]];
        let coords = [[n0.x, n0.y, n0.z], [n1.x, n1.y, n1.z], [n2.x, n2.y, n2.z]];
        let k_local = crate::element::plate_local_stiffness(&coords, e, nu, plate.thickness);
        let t_plate = crate::element::plate_transform_3d(&coords);
        let k_glob = transform_stiffness(&k_local, &t_plate, 18);
        let plate_dofs = dof_num.plate_element_dofs(&plate.nodes);
        let ndof = plate_dofs.len();
        scatter!(k_glob, plate_dofs, ndof);
    }

    // Quad elements (MITC4 shell, 24 DOFs per element, sorted for determinism)
    let mut sorted_quads: Vec<&SolverQuadElement> = crate::ordered::values(&input.quads).collect();
    sorted_quads.sort_by_key(|q| q.id);
    for quad in sorted_quads {
        let mat = mat_map[&quad.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;
        let n0 = node_map[&quad.nodes[0]];
        let n1 = node_map[&quad.nodes[1]];
        let n2 = node_map[&quad.nodes[2]];
        let n3 = node_map[&quad.nodes[3]];
        let coords = [[n0.x, n0.y, n0.z], [n1.x, n1.y, n1.z], [n2.x, n2.y, n2.z], [n3.x, n3.y, n3.z]];
        let k_local = crate::element::quad::mitc4_local_stiffness(&coords, e, nu, quad.thickness);
        let t_quad = crate::element::quad::quad_transform_3d(&coords);
        let k_glob = transform_stiffness(&k_local, &t_quad, 24);
        let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
        let ndof = quad_dofs.len();
        scatter!(k_glob, quad_dofs, ndof);
    }

    // Quad9 elements (MITC9 shell, 54 DOFs per element, sorted for determinism)
    let mut sorted_q9s: Vec<&SolverQuad9Element> = crate::ordered::values(&input.quad9s).collect();
    sorted_q9s.sort_by_key(|q| q.id);
    for q9 in sorted_q9s {
        let mat = mat_map[&q9.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;
        let coords = quad9_coords(&node_map, q9);
        let k_local = crate::element::quad9::mitc9_local_stiffness(&coords, e, nu, q9.thickness);
        let t_q9 = crate::element::quad9::quad9_transform_3d(&coords);
        let k_glob = transform_stiffness(&k_local, &t_q9, 54);
        let q9_dofs = dof_num.quad9_element_dofs(&q9.nodes);
        let ndof = q9_dofs.len();
        scatter!(k_glob, q9_dofs, ndof);
    }

    // Solid-shell elements (8 nodes × 3 DOFs = 24 DOFs per element, sorted for determinism)
    let mut sorted_ss: Vec<&SolverSolidShellElement> = crate::ordered::values(&input.solid_shells).collect();
    sorted_ss.sort_by_key(|s| s.id);
    for ss in sorted_ss {
        let mat = mat_map[&ss.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;
        let coords = solid_shell_coords(&node_map, ss);
        let k_elem = crate::element::solid_shell::solid_shell_stiffness(&coords, e, nu);
        let ss_dofs = dof_num.solid_shell_element_dofs(&ss.nodes);
        let ndof = ss_dofs.len();
        scatter!(k_elem, ss_dofs, ndof);
    }

    // Curved shell elements (degenerated continuum, 4 nodes × 6 DOFs = 24 DOFs, sorted for determinism)
    let mut sorted_cs: Vec<&SolverCurvedShellElement> = crate::ordered::values(&input.curved_shells).collect();
    sorted_cs.sort_by_key(|c| c.id);
    for cs in sorted_cs {
        let mat = mat_map[&cs.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;
        let coords = curved_shell_coords(&node_map, cs);
        let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&coords));
        let k_elem = crate::element::curved_shell::curved_shell_stiffness(&coords, &dirs, e, nu, cs.thickness);
        let cs_dofs = dof_num.quad_element_dofs(&cs.nodes);
        let ndof = cs_dofs.len();
        scatter!(k_elem, cs_dofs, ndof);
    }

    // Spring stiffness
    for sup in crate::ordered::values(&input.supports) {
        let springs = [support_dofs_3d(sup)[0].spring, support_dofs_3d(sup)[1].spring, support_dofs_3d(sup)[2].spring, support_dofs_3d(sup)[3].spring, support_dofs_3d(sup)[4].spring, support_dofs_3d(sup)[5].spring];
        for (i, ks) in springs.iter().enumerate() {
            if let Some(k) = ks {
                if *k > 0.0 && i < dof_num.dofs_per_node {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, i)) {
                        trip_rows.push(d); trip_cols.push(d); trip_vals.push(*k);
                        diag_vals[d] += *k;
                    }
                }
            }
        }
        if dof_num.dofs_per_node >= 7 {
            if let Some(kw) = support_dofs_3d(sup)[6].spring {
                if kw > 0.0 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, 6)) {
                        trip_rows.push(d); trip_cols.push(d); trip_vals.push(kw);
                        diag_vals[d] += kw;
                    }
                }
            }
        }
    }

    for d in &diag_vals { max_diag = max_diag.max(d.abs()); }

    // Artificial stiffness at floating warping DOFs
    let mut artificial_dofs_3d = Vec::new();
    {
        let artificial_k = artificial_stiffness(max_diag);
        for d in orphan_rotation_dofs_3d(input, dof_num, |d| diag_vals[d]) {
            trip_rows.push(d); trip_cols.push(d); trip_vals.push(artificial_k);
            artificial_dofs_3d.push(d);
        }
    }
    if dof_num.dofs_per_node >= 7 {
        let artificial_k = artificial_stiffness(max_diag);
        for &node_id in &dof_num.node_order {
            if let Some(&d) = dof_num.map.get(&(node_id, 6)) {
                if d < nf && diag_vals[d].abs() < 1e-20 {
                    trip_rows.push(d); trip_cols.push(d); trip_vals.push(artificial_k);
                    artificial_dofs_3d.push(d);
                }
            }
        }
    }

    // Inclined support transforms (applied to triplets before CSC conversion;
    // the force vector rotation happens in `assemble_load_vector_3d_sparse`)
    let mut inclined_transforms = Vec::new();
    for sup in crate::ordered::values(&input.supports) {
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
                        apply_inclined_transform_triplets_k(
                            &mut trip_rows, &mut trip_cols, &mut trip_vals,
                            &dofs, &r,
                        );
                        inclined_transforms.push(InclinedTransformData { node_id: sup.node_id, dofs, r });
                    }
                }
            }
        }
    }

    // Compact zeroed-out triplets left by inclined support transforms
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

    // Element quality diagnostics
    let mut diagnostics = Vec::new();
    for plate in crate::ordered::values(&input.plates) {
        let n0 = node_map[&plate.nodes[0]];
        let n1 = node_map[&plate.nodes[1]];
        let n2 = node_map[&plate.nodes[2]];
        let coords = [[n0.x, n0.y, n0.z], [n1.x, n1.y, n1.z], [n2.x, n2.y, n2.z]];
        let (aspect_ratio, _skew, min_angle) = crate::element::plate_element_quality(&coords);
        if aspect_ratio > 10.0 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: plate.id, element_type: "plate".into(), metric: "aspect_ratio".into(),
                value: aspect_ratio, threshold: 10.0,
                message: format!("Plate {} aspect ratio {:.1} exceeds 10", plate.id, aspect_ratio),
            });
        }
        if min_angle < 10.0 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: plate.id, element_type: "plate".into(), metric: "min_angle".into(),
                value: min_angle, threshold: 10.0,
                message: format!("Plate {} min angle {:.1}° below 10°", plate.id, min_angle),
            });
        }
    }
    for quad in crate::ordered::values(&input.quads) {
        let qn0 = node_map[&quad.nodes[0]];
        let qn1 = node_map[&quad.nodes[1]];
        let qn2 = node_map[&quad.nodes[2]];
        let qn3 = node_map[&quad.nodes[3]];
        let coords = [[qn0.x, qn0.y, qn0.z], [qn1.x, qn1.y, qn1.z], [qn2.x, qn2.y, qn2.z], [qn3.x, qn3.y, qn3.z]];
        let qm = crate::element::quad::quad_quality_metrics(&coords);
        let (_, _, has_neg_j) = crate::element::quad::quad_check_jacobian(&coords);
        if has_neg_j {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: quad.id, element_type: "quad".into(), metric: "negative_jacobian".into(),
                value: -1.0, threshold: 0.0,
                message: format!("Quad {} has negative Jacobian determinant (inverted element)", quad.id),
            });
        }
        if qm.aspect_ratio > 10.0 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: quad.id, element_type: "quad".into(), metric: "aspect_ratio".into(),
                value: qm.aspect_ratio, threshold: 10.0,
                message: format!("Quad {} aspect ratio {:.1} exceeds 10", quad.id, qm.aspect_ratio),
            });
        }
        if qm.warping > 0.01 && qm.warping <= 0.1 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: quad.id, element_type: "quad".into(), metric: "warping_moderate".into(),
                value: qm.warping, threshold: 0.01,
                message: format!("Quad {} moderate warping {:.3} (0.01-0.1 range)", quad.id, qm.warping),
            });
        }
        if qm.warping > 0.1 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: quad.id, element_type: "quad".into(), metric: "warping".into(),
                value: qm.warping, threshold: 0.1,
                message: format!("Quad {} warping {:.3} exceeds 0.1", quad.id, qm.warping),
            });
        }
        if qm.jacobian_ratio < 0.1 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: quad.id, element_type: "quad".into(), metric: "jacobian_ratio".into(),
                value: qm.jacobian_ratio, threshold: 0.1,
                message: format!("Quad {} jacobian ratio {:.3} below 0.1", quad.id, qm.jacobian_ratio),
            });
        }
    }

    // Quad9 diagnostics (sparse path)
    for q9 in crate::ordered::values(&input.quad9s) {
        let coords = quad9_coords(&node_map, q9);
        let (_, _, has_neg_j) = crate::element::quad9::quad9_check_jacobian(&coords);
        if has_neg_j {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: q9.id, element_type: "quad9".into(), metric: "negative_jacobian".into(),
                value: -1.0, threshold: 0.0,
                message: format!("Quad9 {} has negative Jacobian determinant (inverted element)", q9.id),
            });
        }
    }

    // Build full-K CSC only if requested (linear solve needs it for reactions)
    let k_full = if build_k_full {
        Some(CscMatrix::from_triplets(n, &trip_rows, &trip_cols, &trip_vals))
    } else {
        None
    };

    // Filter triplets for Kff (free-free block)
    let mut ff_rows = Vec::new();
    let mut ff_cols = Vec::new();
    let mut ff_vals = Vec::new();
    for i in 0..trip_rows.len() {
        if trip_rows[i] < nf && trip_cols[i] < nf {
            ff_rows.push(trip_rows[i]); ff_cols.push(trip_cols[i]); ff_vals.push(trip_vals[i]);
        }
    }
    let mut k_ff = CscMatrix::from_triplets(nf, &ff_rows, &ff_cols, &ff_vals);
    // Drop tiny entries to match from_dense_symmetric behavior — prevents
    // spurious near-zero entries from making Cholesky succeed on singular matrices.
    k_ff.drop_below_threshold(1e-30);

    StiffnessSparseAssembly3D {
        k_ff, k_full, max_diag_k: max_diag,
        artificial_dofs: artificial_dofs_3d, inclined_transforms, diagnostics,
    }
}

/// Assemble the global force vector for 3D for a given set of loads,
/// sequential-sparse flavor (with inclined support rotations applied).
/// Produces exactly the same `f` as `assemble_sparse_3d` would on the same loads.
pub fn assemble_load_vector_3d_sparse(
    input: &SolverInput3D,
    loads: &[SolverLoad3D],
    dof_num: &DofNumbering,
    inclined_transforms: &[InclinedTransformData],
) -> Vec<f64> {
    assemble_load_vector_3d_dense(input, loads, dof_num, inclined_transforms)
}

/// Assemble sparse K and force vector for 3D. Returns CSC of Kff (always) and
/// full K (if `build_k_full` is true).
/// Collects all triplets for the full n×n K, then filters for Kff at the end.
pub fn assemble_sparse_3d(input: &SolverInput3D, dof_num: &DofNumbering, build_k_full: bool) -> SparseAssemblyResult3D {
    let stiff = assemble_stiffness_sparse_3d(input, dof_num, build_k_full);
    let f = assemble_load_vector_3d_sparse(input, &input.loads, dof_num, &stiff.inclined_transforms);
    SparseAssemblyResult3D {
        k_ff: stiff.k_ff,
        k_full: stiff.k_full,
        f,
        max_diag_k: stiff.max_diag_k,
        artificial_dofs: stiff.artificial_dofs,
        inclined_transforms: stiff.inclined_transforms,
        diagnostics: stiff.diagnostics,
    }
}

/// Helper to extract quad node coordinates.
fn quad_coords(node_map: &std::collections::HashMap<usize, &SolverNode3D>, quad: &SolverQuadElement) -> [[f64; 3]; 4] {
    let n0 = node_map[&quad.nodes[0]];
    let n1 = node_map[&quad.nodes[1]];
    let n2 = node_map[&quad.nodes[2]];
    let n3 = node_map[&quad.nodes[3]];
    [[n0.x, n0.y, n0.z], [n1.x, n1.y, n1.z], [n2.x, n2.y, n2.z], [n3.x, n3.y, n3.z]]
}

/// Helper to extract quad9 node coordinates.
fn quad9_coords(node_map: &std::collections::HashMap<usize, &SolverNode3D>, q9: &SolverQuad9Element) -> [[f64; 3]; 9] {
    let mut coords = [[0.0; 3]; 9];
    for (i, &nid) in q9.nodes.iter().enumerate() {
        let n = node_map[&nid];
        coords[i] = [n.x, n.y, n.z];
    }
    coords
}

/// Helper to extract solid-shell node coordinates.
fn solid_shell_coords(node_map: &std::collections::HashMap<usize, &SolverNode3D>, ss: &SolverSolidShellElement) -> [[f64; 3]; 8] {
    let mut coords = [[0.0; 3]; 8];
    for (i, &nid) in ss.nodes.iter().enumerate() {
        let n = node_map[&nid];
        coords[i] = [n.x, n.y, n.z];
    }
    coords
}

fn curved_shell_coords(node_map: &std::collections::HashMap<usize, &SolverNode3D>, cs: &SolverCurvedShellElement) -> [[f64; 3]; 4] {
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

    /// Cantilever with a Timoshenko (as_y) section: phi ≈ 0.156, large enough
    /// that an Euler-Bernoulli K is visibly different.
    fn make_timoshenko_cantilever() -> SolverInput {
        let mut nodes = HashMap::new();
        nodes.insert("1".into(), SolverNode { id: 1, x: 0.0, z: 0.0 });
        nodes.insert("2".into(), SolverNode { id: 2, x: 2.0, z: 0.0 });

        let mut materials = HashMap::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".into(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: Some(0.005) });

        let mut elements = HashMap::new();
        elements.insert("1".into(), SolverElement {
            id: 1, elem_type: "frame".into(),
            node_i: 1, node_j: 2, material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });

        let mut supports = HashMap::new();
        supports.insert("1".into(), SolverSupport {
            id: 1, node_id: 1, support_type: "fixed".into(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None, angle: None,
        });

        SolverInput {
            nodes, materials, sections, elements, supports,
            loads: vec![], constraints: vec![], connectors: HashMap::new(),
            solver_options: None, masses: Default::default(),
        }
    }

    /// The legacy triplet sparse 2D assembler (used by 2D buckling) must
    /// produce the same K_ff as the dense assembler for Timoshenko sections.
    /// It used to hardcode phi = 0, pairing Euler-Bernoulli stiffness with
    /// Timoshenko fixed-end forces.
    #[test]
    fn legacy_sparse_2d_matches_dense_with_timoshenko_section() {
        let input = make_timoshenko_cantilever();
        let dof_num = DofNumbering::build_2d(&input);
        let n = dof_num.n_total;
        let nf = dof_num.n_free;

        let dense = assemble_stiffness_2d(&input, &dof_num);
        let sparse = assemble_sparse_2d(&input, &dof_num);
        let k_sparse = sparse.k_ff.to_dense_symmetric();

        // Shear-deformation-sensitive entry: the bending diagonal at the tip.
        // phi ≈ 0.156 shifts this term by ~13% vs Euler-Bernoulli.
        let k_tip_bend_dense = dense.k[1 * n + 1];
        let k_tip_bend_sparse = k_sparse[1 * nf + 1];
        let scale = k_tip_bend_dense.abs();
        assert!(
            (k_tip_bend_sparse - k_tip_bend_dense).abs() <= 1e-9 * scale,
            "K_ff mismatch (Timoshenko): sparse {} vs dense {}",
            k_tip_bend_sparse, k_tip_bend_dense
        );

        for i in 0..nf {
            for j in 0..nf {
                let kd = dense.k[i * n + j];
                let ks = k_sparse[i * nf + j];
                assert!(
                    (ks - kd).abs() <= 1e-9 * scale.max(1.0),
                    "K_ff[{i}][{j}] mismatch: sparse {ks} vs dense {kd}"
                );
            }
        }
    }
}

/// The support springs of a 2D model as global stiffness entries `(i, j, k)`
/// over all DOFs — exactly what `assemble_2d` adds to K: `kx`/`ky` rotated by
/// the support's `angle` on a `"spring"` support (Kxx = kx·c² + ky·s²,
/// Kxz = (kx − ky)·s·c), axis-aligned otherwise, and the rotational `kz` on any
/// support type.
///
/// The nonlinear solvers build their own tangents, and each carried a copy of
/// the spring loop that had drifted from this one: the angle was dropped
/// (corotational, material- and fiber-nonlinear, arc length), and a
/// rotational spring on a pinned support was dropped wherever the copy
/// skipped non-`"spring"` supports. One definition keeps them with the linear
/// solver.
pub fn support_spring_entries_2d(input: &SolverInput, dof_num: &DofNumbering) -> Vec<(usize, usize, f64)> {
    let mut out = Vec::new();
    let mut sups: Vec<&SolverSupport> = crate::ordered::values(&input.supports).collect();
    sups.sort_by_key(|s| s.id);
    for sup in sups {
        let kx = support_dofs_2d(sup)[0].spring.unwrap_or(0.0);
        let ky = support_dofs_2d(sup)[1].spring.unwrap_or(0.0);
        let kz = support_dofs_2d(sup)[2].spring.unwrap_or(0.0);
        let dx = dof_num.map.get(&(sup.node_id, 0)).copied();
        let dz = dof_num.map.get(&(sup.node_id, 1)).copied();
        let angle = sup.angle.map(super::support::prepare_support_angle).filter(|a| sup.support_type == "spring" && a.abs() > 1e-15 && (kx > 0.0 || ky > 0.0));
        match (angle, dx, dz) {
            (Some(angle), Some(dx), Some(dz)) => {
                let (s, c) = angle.sin_cos();
                let k_xz = (kx - ky) * s * c;
                out.push((dx, dx, kx * c * c + ky * s * s));
                out.push((dz, dz, kx * s * s + ky * c * c));
                out.push((dx, dz, k_xz));
                out.push((dz, dx, k_xz));
            }
            (Some(_), _, _) => {}
            (None, _, _) => {
                if kx > 0.0 {
                    if let Some(d) = dx { out.push((d, d, kx)); }
                }
                if ky > 0.0 {
                    if let Some(d) = dz { out.push((d, d, ky)); }
                }
            }
        }
        if kz > 0.0 && dof_num.dofs_per_node >= 3 {
            if let Some(&d) = dof_num.map.get(&(sup.node_id, 2)) {
                out.push((d, d, kz));
            }
        }
    }
    out
}

/// The support springs of a 3D model as diagonal stiffness entries `(i, i, k)`
/// over all DOFs — what `assemble_3d` adds: `kx..krz` on their DOFs and `kw`
/// on the warping DOF. For the nonlinear solvers that build their own
/// tangents (see `support_spring_entries_2d`).
pub fn support_spring_entries_3d(input: &SolverInput3D, dof_num: &DofNumbering) -> Vec<(usize, usize, f64)> {
    let mut out = Vec::new();
    let mut sups: Vec<&SolverSupport3D> = crate::ordered::values(&input.supports).collect();
    sups.sort_by_key(|s| s.node_id);
    for sup in sups {
        let ks = support_dofs_3d(sup).map(|d| d.spring);
        for (local, k) in ks.into_iter().enumerate() {
            let k = k.unwrap_or(0.0);
            if k > 0.0 && local < dof_num.dofs_per_node {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, local)) {
                    out.push((d, d, k));
                }
            }
        }
    }
    out
}
