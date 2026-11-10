use crate::linalg::sparse::CscMatrix;
use crate::linalg::sparse_chol::{numeric_cholesky, sparse_cholesky_solve, symbolic_cholesky};
use crate::solver::dof::DofNumbering;
use crate::types::*;
use std::collections::BTreeMap;
use std::rc::Rc;

pub const LOCAL_FREE: f64 = 1e-12;
pub const DENSE_SPECTRUM: usize = 240;
pub const FULL_SPECTRUM: usize = 64;
pub const RESOLVABLE: f64 = 1e12;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum DofKind { Translation, Rotation, Warping }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DofTag { pub node: usize, pub kind: DofKind }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict { Stable, Mechanism, Singular }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reason { Resolved, FreeTranslation, SwingAtRounding, Conditioning, CoupledSoftDirection, ConstraintRounding, Indefinite, NonFinite }

#[derive(Debug, Clone)]
pub struct FreeDirection {
    pub node: usize,
    pub kind: DofKind,
    pub dofs: Vec<usize>,
    pub direction: Vec<f64>,
    pub scale: f64,
    pub coupling: Vec<(usize, f64)>,
}

#[derive(Debug, Clone)]
pub struct Stability {
    pub verdict: Verdict,
    pub reason: Reason,
    pub kappa: f64,
    pub anisotropy: f64,
    pub free: Vec<FreeDirection>,
    pub mode_nodes: Vec<usize>,
}

thread_local! {
    static ASSUMED: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

/// Runs `f` with the linear solves taking every stiffness as Stable with no free direction.
/// Only plastic 3D uses it, for its soft-spring hinge states, whose answers its own balance
/// check accepts or rejects (docs/solver/stability.md §5).
pub(crate) fn assuming_stable<T>(f: impl FnOnce() -> T) -> T {
    struct Restore(bool);
    impl Drop for Restore {
        fn drop(&mut self) { ASSUMED.with(|a| a.set(self.0)); }
    }
    let _restore = Restore(ASSUMED.with(|a| a.replace(true)));
    f()
}

pub(crate) fn assumed() -> bool { ASSUMED.with(|a| a.get()) }

impl Stability {
    pub fn is_stable(&self) -> bool { self.verdict == Verdict::Stable }

    pub fn stable() -> Self {
        Stability { verdict: Verdict::Stable, reason: Reason::Resolved, kappa: 1.0, anisotropy: 1.0, free: Vec::new(), mode_nodes: Vec::new() }
    }

    pub fn pins(&self) -> Vec<(usize, usize, f64)> {
        let mut out = Vec::new();
        for f in self.free_rotations() {
            for (a, (&i, &vi)) in f.dofs.iter().zip(&f.direction).enumerate() {
                for (&j, &vj) in f.dofs.iter().zip(&f.direction).take(a + 1) {
                    let x = f.scale * vi * vj;
                    if x != 0.0 { out.push((i.max(j), i.min(j), x)); }
                }
            }
        }
        out
    }

    pub fn pin_dense(&self, k: &mut [f64], n: usize) {
        for (i, j, x) in self.pins() {
            k[i * n + j] += x;
            if i != j { k[j * n + i] += x; }
        }
    }

    pub fn pin_sparse(&self, k: &CscMatrix) -> CscMatrix {
        let pins = self.pins();
        if pins.is_empty() { return k.clone(); }
        let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
        for j in 0..k.n {
            for p in k.col_ptr[j]..k.col_ptr[j + 1] {
                rows.push(k.row_idx[p]);
                cols.push(j);
                vals.push(k.values[p]);
            }
        }
        for (i, j, x) in pins {
            rows.push(i);
            cols.push(j);
            vals.push(x);
        }
        CscMatrix::from_triplets(k.n, &rows, &cols, &vals)
    }

    pub fn load_on_free_rotation(&self, f: &[f64]) -> Option<usize> {
        self.free_rotations().find(|d| {
            let (along, scale) = d.dofs.iter().zip(&d.direction).fold((0.0f64, 0.0f64), |(a, m), (&i, &v)| {
                let x = f.get(i).copied().unwrap_or(0.0) * v;
                (a + x, m.max(x.abs()))
            });
            !(along.abs() <= ROUNDING * d.dofs.len() as f64 * f64::EPSILON * scale)
        }).map(|d| d.node)
    }

    pub fn check_pins(&self, u: &[f64], f: &[f64], restrained: &[f64]) -> Result<(), String> {
        let at = |x: &[f64], i: usize| x.get(i).copied().unwrap_or(0.0);
        let held = self.free_rotations().find(|d| {
            let (mut force, mut size) = d.coupling.iter().fold((0.0f64, 0.0f64), |(f, m), &(i, c)| {
                let x = c * at(u, i);
                (f + x, m + x.abs())
            });
            for (&i, &v) in d.dofs.iter().zip(&d.direction) {
                let (applied, coupled) = (v * at(f, i), v * at(restrained, i));
                force += coupled - applied;
                size += coupled.abs() + applied.abs();
            }
            !(force.abs() <= ROUNDING * (d.coupling.len() + 2 * d.dofs.len()) as f64 * f64::EPSILON * size)
        });
        match held {
            Some(d) => Err(format!(
                "the structure cannot be solved reliably: a rotation at node {} is so much softer than the other rotations there that its stiffness cannot be resolved, and the loads, a prescribed displacement or the rest of the structure act on it; stiffen that rotation or release it explicitly",
                d.node
            )),
            None => Ok(()),
        }
    }

    pub fn free_rotations(&self) -> impl Iterator<Item = &FreeDirection> {
        self.free.iter().filter(|f| f.kind != DofKind::Translation)
    }

    pub fn refusal(&self) -> Option<String> {
        let nodes = if self.mode_nodes.is_empty() { String::new() } else { format!(" at nodes {:?}", self.mode_nodes) };
        match self.reason {
            Reason::Resolved => None,
            Reason::FreeTranslation => Some(format!(
                "the structure is a mechanism{nodes}: a node can move freely in a direction no member, support or spring stiffens; add supports or members, or remove releases"
            )),
            Reason::Indefinite => Some(format!(
                "the stiffness matrix is not positive semidefinite{nodes}: the structure has a direction of negative stiffness (a negative spring or a negative member property, say), so it is unstable; check the springs and member properties there"
            )),
            Reason::NonFinite => Some(
                "the stiffness matrix has an infinite or undefined entry: check member properties, spring stiffnesses and node coordinates for zero lengths, infinities or missing values".to_string()
            ),
            Reason::ConstraintRounding => Some(format!(
                "the structure is a mechanism or so close to one that its stability cannot be decided in double precision{nodes}: constraint reduction cancels stiffness contributions whose rounding is too large to resolve the remaining stiffness; reduce extreme stiffness contrasts or revise the constraints"
            )),
            Reason::SwingAtRounding => Some(format!(
                "the structure is a mechanism or so close to one that its stability cannot be decided in double precision{nodes}: a free rotation moves a constrained node by an amount at the rounding of the constraint, so whether the node can move at zero stiffness depends on rounding; add supports or members, or remove releases"
            )),
            Reason::CoupledSoftDirection => Some(format!(
                "the structure is a mechanism or so close to one that its stability cannot be decided in double precision{nodes}: a rotation or warping direction far softer than the rest of its node is coupled into the stiffness of other directions, so whether it restrains them depends on rounding; add supports or members, remove releases, or reduce extreme stiffness contrasts"
            )),
            Reason::Conditioning => Some(format!(
                "the structure is a mechanism or so close to one that its stability cannot be decided in double precision{nodes} (scaled condition number {:.1e} times node anisotropy {:.1e} exceeds {RESOLVABLE:.0e}): results would change with units, orientation or numbering; add supports or members, remove releases, or reduce extreme stiffness contrasts",
                self.kappa, self.anisotropy
            )),
        }
    }
}

pub fn tags(dof_num: &DofNumbering, two_d: bool) -> Vec<DofTag> {
    let mut out = vec![DofTag { node: 0, kind: DofKind::Translation }; dof_num.n_total];
    for ((node, local), g) in dof_num.entries_by_dof() {
        let kind = match (two_d, local) {
            (true, 0 | 1) | (false, 0..=2) => DofKind::Translation,
            (false, 6) => DofKind::Warping,
            _ => DofKind::Rotation,
        };
        out[g] = DofTag { node, kind };
    }
    out
}

fn couple_axes(out: &mut Vec<(usize, usize)>, dof: &DofNumbering, nodes: &[usize], offset: usize, axes: &[&[f64]]) {
    for &node in nodes {
        for axis in axes {
            for i in 0..axis.len() {
                for j in 0..i {
                    if axis[i] != 0.0 && axis[j] != 0.0 {
                        if let (Some(a), Some(b)) = (dof.global_dof(node, offset + i), dof.global_dof(node, offset + j)) {
                            out.push((a, b));
                        }
                    }
                }
            }
        }
    }
}

pub(crate) fn coupling_2d(input: &SolverInput, dof: &DofNumbering) -> Vec<(usize, usize)> {
    let nodes: BTreeMap<_, _> = input.nodes.values().map(|n| (n.id, n)).collect();
    let mut out = Vec::new();
    for e in input.elements.values() {
        let (a, b) = (nodes[&e.node_i], nodes[&e.node_j]);
        couple_axes(&mut out, dof, &[a.id, b.id], 0, &[&[b.x - a.x, b.z - a.z]]);
    }
    for e in input.connectors.values() {
        let (a, b) = (nodes[&e.node_i], nodes[&e.node_j]);
        let (dx, dz) = (b.x - a.x, b.z - a.z);
        if (dx * dx + dz * dz).sqrt() > crate::element::connector::ZERO_LENGTH {
            couple_axes(&mut out, dof, &[a.id, b.id], 0, &[&[dx, dz]]);
        }
    }
    for support in input.supports.values() {
        if support.support_type == "inclinedRoller" {
            let r = super::assembly::inclined_rotation_matrix_2d(support.angle.unwrap_or(0.0));
            couple_axes(&mut out, dof, &[support.node_id], 0, &[&r[0], &r[1]]);
        } else if support.support_type == "spring" {
            if let Some(angle) = support.angle.map(super::support::prepare_support_angle) {
                if angle.abs() > 1e-15 && (support.kx.unwrap_or(0.0) > 0.0 || support.ky.unwrap_or(0.0) > 0.0) {
                    couple_axes(&mut out, dof, &[support.node_id], 0, &[&[angle.cos(), angle.sin()]]);
                }
            }
        }
    }
    out.sort_unstable();
    out.dedup();
    out
}

pub(crate) fn coupling_3d(input: &SolverInput3D, dof: &DofNumbering) -> Vec<(usize, usize)> {
    let nodes: BTreeMap<_, _> = input.nodes.values().map(|n| (n.id, n)).collect();
    let mut out = Vec::new();
    for e in input.elements.values() {
        let (a, b) = (nodes[&e.node_i], nodes[&e.node_j]);
        if e.elem_type == "truss" || e.elem_type == "cable" {
            couple_axes(&mut out, dof, &[a.id, b.id], 0, &[&[b.x - a.x, b.y - a.y, b.z - a.z]]);
        } else {
            let (ex, ey, ez) = crate::element::compute_local_axes_3d(a.x, a.y, a.z, b.x, b.y, b.z, e.local_yx, e.local_yy, e.local_yz, e.roll_angle, input.left_hand.unwrap_or(false));
            for offset in [0, 3] { couple_axes(&mut out, dof, &[a.id, b.id], offset, &[&ex, &ey, &ez]); }
        }
    }
    for e in input.connectors.values() {
        let (a, b) = (nodes[&e.node_i], nodes[&e.node_j]);
        if a.x == b.x && a.y == b.y && a.z == b.z { continue; }
        let delta = [b.x - a.x, b.y - a.y, b.z - a.z];
        let length = delta.iter().map(|x| x * x).sum::<f64>().sqrt();
        if length <= crate::element::connector::ZERO_LENGTH { continue; }
        let [ex, ey, ez] = crate::element::connector::connector_axes_3d(delta.map(|x| x / length));
        for offset in [0, 3] { couple_axes(&mut out, dof, &[a.id, b.id], offset, &[&ex, &ey, &ez]); }
    }
    let mut shell = |ids: &[usize], t: Vec<f64>, n: usize| {
        let axes: Vec<Vec<f64>> = (0..3).map(|i| t[i * n..i * n + 3].to_vec()).collect();
        let membrane: Vec<f64> = (0..3).map(|i| if axes[0][i] != 0.0 || axes[1][i] != 0.0 { 1.0 } else { 0.0 }).collect();
        for offset in [0, 3] { couple_axes(&mut out, dof, ids, offset, &[&axes[0], &axes[1], &axes[2], &membrane]); }
    };
    for e in input.plates.values() {
        let coords = e.nodes.map(|id| { let p = nodes[&id]; [p.x, p.y, p.z] });
        shell(&e.nodes, crate::element::plate_transform_3d(&coords), 18);
    }
    for e in input.quads.values() {
        let coords = e.nodes.map(|id| { let p = nodes[&id]; [p.x, p.y, p.z] });
        shell(&e.nodes, crate::element::quad::quad_transform_3d(&coords), 24);
    }
    for e in input.quad9s.values() {
        let coords = e.nodes.map(|id| { let p = nodes[&id]; [p.x, p.y, p.z] });
        shell(&e.nodes, crate::element::quad9::quad9_transform_3d(&coords), 54);
    }
    for e in input.solid_shells.values() {
        couple_axes(&mut out, dof, &e.nodes, 0, &[&[1.0, 1.0, 1.0]]);
    }
    for e in input.curved_shells.values() {
        let coords = e.nodes.map(|id| { let p = nodes[&id]; [p.x, p.y, p.z] });
        let dirs = e.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&coords));
        let normal = (0..3).find(|&axis| coords.iter().all(|p| p[axis] == coords[0][axis]) && dirs.iter().all(|d| d[axis] != 0.0 && (0..3).all(|j| j == axis || d[j] == 0.0)));
        let plane: Vec<f64> = (0..3).map(|i| if normal == Some(i) { 0.0 } else { 1.0 }).collect();
        for offset in [0, 3] { couple_axes(&mut out, dof, &e.nodes, offset, &[&plane]); }
    }
    for support in input.supports.values() {
        if support.is_inclined == Some(true) {
            let r = super::assembly::inclined_rotation_matrix(support.normal_x.unwrap_or(0.0), support.normal_y.unwrap_or(0.0), support.normal_z.unwrap_or(1.0));
            couple_axes(&mut out, dof, &[support.node_id], 0, &[&r[0], &r[1], &r[2]]);
        }
    }
    out.sort_unstable();
    out.dedup();
    out
}

fn sym_eigen_small(a: &[f64], n: usize) -> (Vec<f64>, Vec<f64>) {
    let scale = a.iter().fold(0.0f64, |m, x| m.max(x.abs()));
    let scale = if scale > 0.0 && scale.is_finite() { scale } else { 1.0 };
    let mut m: Vec<f64> = a.iter().map(|x| x / scale).collect();
    let mut v = vec![0.0; n * n];
    for i in 0..n { v[i * n + i] = 1.0; }
    for _ in 0..64 {
        let off: f64 = (0..n).flat_map(|i| (0..n).filter(move |&j| j != i).map(move |j| (i, j))).map(|(i, j)| m[i * n + j] * m[i * n + j]).sum();
        let diag: f64 = (0..n).map(|i| m[i * n + i] * m[i * n + i]).sum();
        if off <= (f64::EPSILON * f64::EPSILON) * diag * 1e-4 || off == 0.0 { break; }
        for p in 0..n {
            for q in (p + 1)..n {
                let apq = m[p * n + q];
                if apq == 0.0 { continue; }
                let theta = (m[q * n + q] - m[p * n + p]) / (2.0 * apq);
                let t = theta.signum() / (theta.abs() + theta.hypot(1.0));
                let t = if theta == 0.0 { 1.0 } else { t };
                let c = 1.0 / (t * t + 1.0).sqrt();
                let s = t * c;
                for k in 0..n {
                    let (mkp, mkq) = (m[k * n + p], m[k * n + q]);
                    m[k * n + p] = c * mkp - s * mkq;
                    m[k * n + q] = s * mkp + c * mkq;
                }
                for k in 0..n {
                    let (mpk, mqk) = (m[p * n + k], m[q * n + k]);
                    m[p * n + k] = c * mpk - s * mqk;
                    m[q * n + k] = s * mpk + c * mqk;
                }
                for k in 0..n {
                    let (vkp, vkq) = (v[k * n + p], v[k * n + q]);
                    v[k * n + p] = c * vkp - s * vkq;
                    v[k * n + q] = s * vkp + c * vkq;
                }
            }
        }
    }
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|&a, &b| m[a * n + a].total_cmp(&m[b * n + b]));
    let values = order.iter().map(|&i| m[i * n + i] * scale).collect();
    let mut vectors = vec![0.0; n * n];
    for (c, &i) in order.iter().enumerate() {
        for r in 0..n { vectors[r * n + c] = v[r * n + i]; }
    }
    (values, vectors)
}

struct Column { group: usize, w: Vec<f64> }

pub fn analyze_dense(k: &[f64], n: usize, tags: &[DofTag]) -> Stability {
    analyze_dense_with_coupling(k, n, tags, &[])
}

pub(crate) fn analyze_dense_with_coupling(k: &[f64], n: usize, tags: &[DofTag], coupling: &[(usize, usize)]) -> Stability {
    analyze_dense_coupled(k, n, tags, &[], coupling)
}

pub fn analyze_dense_constrained(k: &[f64], n: usize, tags: &[DofTag], moves_translation: &[Vec<(usize, f64)>]) -> Stability {
    analyze_dense_coupled(k, n, tags, moves_translation, &conservative_coupling(tags, moves_translation))
}

fn analyze_dense_coupled(k: &[f64], n: usize, tags: &[DofTag], moves_translation: &[Vec<(usize, f64)>], coupling: &[(usize, usize)]) -> Stability {
    let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
    for j in 0..n {
        for i in j..n {
            let v = 0.5 * (k[i * n + j] + k[j * n + i]);
            if v != 0.0 {
                rows.push(i);
                cols.push(j);
                vals.push(v);
            }
        }
    }
    analyze_coupled(&CscMatrix::from_triplets(n, &rows, &cols, &vals), tags, moves_translation, coupling)
}

pub fn analyze(k: &CscMatrix, tags: &[DofTag]) -> Stability {
    analyze_with_coupling(k, tags, &[])
}

pub(crate) fn analyze_with_coupling(k: &CscMatrix, tags: &[DofTag], coupling: &[(usize, usize)]) -> Stability {
    analyze_coupled(k, tags, &[], coupling)
}

pub(crate) fn project_coupling(k: &CscMatrix, tags: &[DofTag], coupling: &[(usize, usize)], c: &crate::solver::constraints::SparseTransform, independent: &[usize]) -> Vec<(usize, usize)> {
    fn root(parent: &[usize], mut i: usize) -> usize {
        while parent[i] != i { i = parent[i]; }
        i
    }
    let mut parent: Vec<usize> = (0..k.n).collect();
    let mut join = |i: usize, j: usize| {
        if i < k.n && j < k.n && tags[i] == tags[j] {
            let (a, b) = (root(&parent, i), root(&parent, j));
            parent[a] = b;
        }
    };
    for &(i, j) in coupling { join(i, j); }
    for j in 0..k.n {
        for p in k.col_ptr[j]..k.col_ptr[j + 1] {
            if k.values[p] != 0.0 { join(k.row_idx[p], j); }
        }
    }
    let mut images = vec![std::collections::BTreeSet::new(); k.n];
    for i in 0..k.n.min(c.n_rows) {
        for p in c.row_ptr[i]..c.row_ptr[i + 1] {
            if c.vals[p] != 0.0 { images[root(&parent, i)].insert(c.col_idx[p]); }
        }
    }
    let mut out = std::collections::BTreeSet::new();
    let mut link = |a: usize, b: usize| {
        for &i in &images[a] {
            for &j in &images[b] {
                if i != j && tags[independent[i]] == tags[independent[j]] { out.insert((i.max(j), i.min(j))); }
            }
        }
    };
    for i in 0..k.n { link(i, i); }
    for j in 0..k.n {
        for p in k.col_ptr[j]..k.col_ptr[j + 1] {
            if k.values[p] != 0.0 { link(root(&parent, k.row_idx[p]), root(&parent, j)); }
        }
    }
    out.into_iter().collect()
}

fn conservative_coupling(tags: &[DofTag], moves_translation: &[Vec<(usize, f64)>]) -> Vec<(usize, usize)> {
    if moves_translation.is_empty() { return Vec::new(); }
    let mut groups: BTreeMap<(usize, DofKind), Vec<usize>> = BTreeMap::new();
    let mut out = Vec::new();
    for (i, t) in tags.iter().enumerate() {
        let group = groups.entry((t.node, t.kind)).or_default();
        for &j in group.iter() { out.push((i, j)); }
        group.push(i);
    }
    out
}

pub fn analyze_constrained(k: &CscMatrix, tags: &[DofTag], moves_translation: &[Vec<(usize, f64)>]) -> Stability {
    analyze_coupled(k, tags, moves_translation, &conservative_coupling(tags, moves_translation))
}

pub(crate) fn analyze_coupled(k: &CscMatrix, tags: &[DofTag], moves_translation: &[Vec<(usize, f64)>], coupling: &[(usize, usize)]) -> Stability {
    analyze_coupled_with_rounding(k, tags, moves_translation, coupling, None)
}

pub(crate) fn analyze_coupled_with_rounding(k: &CscMatrix, tags: &[DofTag], moves_translation: &[Vec<(usize, f64)>], coupling: &[(usize, usize)], rounding: Option<&CscMatrix>) -> Stability {
    let n = k.n;
    if k.values.iter().any(|v| !v.is_finite()) {
        return non_finite();
    }
    let mut groups: BTreeMap<(usize, DofKind), Vec<usize>> = BTreeMap::new();
    for (i, t) in tags.iter().enumerate().take(n) {
        groups.entry((t.node, t.kind)).or_default().push(i);
    }
    let groups: Vec<((usize, DofKind), Vec<usize>)> = groups.into_iter().collect();
    let mut group_of = vec![(0usize, 0usize); n];
    for (g, (_, dofs)) in groups.iter().enumerate() {
        for (l, &d) in dofs.iter().enumerate() { group_of[d] = (g, l); }
    }
    let mut blocks: Vec<Vec<f64>> = groups.iter().map(|(_, d)| vec![0.0; d.len() * d.len()]).collect();
    for j in 0..n {
        for p in k.col_ptr[j]..k.col_ptr[j + 1] {
            let i = k.row_idx[p];
            let ((gi, li), (gj, lj)) = (group_of[i], group_of[j]);
            if gi != gj { continue; }
            let b = groups[gi].1.len();
            blocks[gi][li * b + lj] = k.values[p];
            blocks[gi][lj * b + li] = k.values[p];
        }
    }
    let mut adjacency: Vec<Vec<bool>> = blocks.iter().map(|b| b.iter().map(|&x| x != 0.0).collect()).collect();
    for &(i, j) in coupling {
        if i >= n || j >= n { continue; }
        let ((gi, li), (gj, lj)) = (group_of[i], group_of[j]);
        if gi == gj {
            let b = groups[gi].1.len();
            adjacency[gi][li * b + lj] = true;
            adjacency[gi][lj * b + li] = true;
        }
    }
    let mut free = Vec::new();
    let mut own: Vec<(f64, f64, usize)> = Vec::new();
    let mut columns: Vec<Column> = Vec::new();
    let mut anisotropy = 1.0f64;
    for (g, ((node, kind), dofs)) in groups.iter().enumerate() {
        let b = dofs.len();
        let mut seen = vec![false; b];
        for start in 0..b {
            if seen[start] { continue; }
            let mut component = vec![start];
            seen[start] = true;
            let mut next = 0;
            while next < component.len() {
                let i = component[next];
                for (j, visited) in seen.iter_mut().enumerate() {
                    if !*visited && adjacency[g][i * b + j] {
                        *visited = true;
                        component.push(j);
                    }
                }
                next += 1;
            }
            let mut block = Vec::new();
            for &i in &component {
                for &j in &component { block.push(blocks[g][i * b + j]); }
            }
            let size = component.len();
            let (mu, vecs) = sym_eigen_small(&block, size);
            if mu.iter().chain(&vecs).any(|x| !x.is_finite()) { return non_finite(); }
            let top = mu.last().copied().unwrap_or(0.0);
            if mu.first().is_some_and(|&low| low < -ROUNDING * size as f64 * f64::EPSILON * top.abs()) || top < 0.0 {
                return Stability { verdict: Verdict::Singular, reason: Reason::Indefinite, kappa: f64::NAN, anisotropy, free, mode_nodes: vec![*node] };
            }
            for c in 0..size {
                let mut v = vec![0.0; b];
                for (r, &i) in component.iter().enumerate() { v[i] = vecs[r * size + c]; }
                if top <= 0.0 || mu[c] <= LOCAL_FREE * top {
                    free.push(FreeDirection { node: *node, kind: *kind, dofs: dofs.clone(), direction: v, scale: if top > 0.0 { top } else { 1.0 }, coupling: Vec::new() });
                    own.push((mu[c], top.max(0.0), size));
                } else {
                    let scale = mu[c].sqrt();
                    columns.push(Column { group: g, w: v.iter().map(|x| x / scale).collect() });
                }
            }
            if let Some(&lowest) = mu.iter().find(|&&x| x > LOCAL_FREE * top) {
                anisotropy = anisotropy.max(top / lowest);
            }
        }
    }
    let mut translation_free: Vec<usize> = free.iter().filter(|f| f.kind == DofKind::Translation).map(|f| f.node).collect();
    let (moving, undecided) = swinging(&free, moves_translation);
    translation_free.extend(moving);
    if translation_free.is_empty() && !undecided.is_empty() {
        return Stability { verdict: Verdict::Singular, reason: Reason::SwingAtRounding, kappa: f64::INFINITY, anisotropy, free, mode_nodes: undecided };
    }
    if !translation_free.is_empty() {
        let mut mode_nodes = translation_free;
        mode_nodes.sort_unstable();
        mode_nodes.dedup();
        return Stability { verdict: Verdict::Mechanism, reason: Reason::FreeTranslation, kappa: f64::INFINITY, anisotropy, free, mode_nodes };
    }
    let amplification = rounding.map(|bound| rounding_amplification(bound, &columns, &free, &own, &groups, &group_of)).unwrap_or(1.0);
    if !amplification.is_finite() || amplification > RESOLVABLE {
        return Stability { verdict: Verdict::Singular, reason: Reason::ConstraintRounding, kappa: f64::INFINITY, anisotropy, free, mode_nodes: tags.iter().map(|t| t.node).collect() };
    }
    let m = columns.len();
    if m == 0 {
        let coupled = coupled_free(k, &mut free, &own, &columns, &groups, &group_of, 1.0);
        if !coupled.is_empty() {
            return Stability { verdict: Verdict::Singular, reason: Reason::CoupledSoftDirection, kappa: f64::INFINITY, anisotropy, free, mode_nodes: coupled };
        }
        return Stability { verdict: Verdict::Stable, reason: Reason::Resolved, kappa: 1.0, anisotropy, free, mode_nodes: Vec::new() };
    }
    let s = scaled(k, &groups, &group_of, &columns);
    let (kappa, mode, indefinite) = spectrum(&s, anisotropy);
    let mode_nodes = mode.map(|x| mode_nodes(&x, &columns, &groups)).unwrap_or_default();
    if indefinite {
        return Stability { verdict: Verdict::Singular, reason: Reason::Indefinite, kappa, anisotropy, free, mode_nodes };
    }
    if rounding.is_some() && kappa * amplification > RESOLVABLE {
        return Stability { verdict: Verdict::Singular, reason: Reason::ConstraintRounding, kappa, anisotropy, free, mode_nodes };
    }
    let verdict = if kappa * anisotropy <= RESOLVABLE { Verdict::Stable } else { Verdict::Singular };
    if verdict == Verdict::Stable {
        let coupled = coupled_free(k, &mut free, &own, &columns, &groups, &group_of, kappa);
        if !coupled.is_empty() {
            return Stability { verdict: Verdict::Singular, reason: Reason::CoupledSoftDirection, kappa, anisotropy, free, mode_nodes: coupled };
        }
    }
    let reason = if verdict == Verdict::Stable { Reason::Resolved } else { Reason::Conditioning };
    Stability { verdict, reason, kappa, anisotropy, free, mode_nodes: if verdict == Verdict::Stable { Vec::new() } else { mode_nodes } }
}

pub const COUPLED: f64 = 1e-4;
const ROUNDING: f64 = 64.0;

fn non_finite() -> Stability {
    Stability { verdict: Verdict::Singular, reason: Reason::NonFinite, kappa: f64::NAN, anisotropy: f64::NAN, free: Vec::new(), mode_nodes: Vec::new() }
}

fn coupled_free(k: &CscMatrix, free: &mut [FreeDirection], own: &[(f64, f64, usize)], columns: &[Column], groups: &[((usize, DofKind), Vec<usize>)], group_of: &[(usize, usize)], kappa: f64) -> Vec<usize> {
    let dropped: Vec<usize> = (0..free.len()).filter(|&j| free[j].kind != DofKind::Translation).collect();
    let mut columns_of: Vec<Vec<usize>> = vec![Vec::new(); groups.len()];
    for (c, col) in columns.iter().enumerate() { columns_of[col.group].push(c); }
    let mut dropped_of: Vec<Vec<usize>> = vec![Vec::new(); groups.len()];
    for (r, &j) in dropped.iter().enumerate() { dropped_of[group_of[free[j].dofs[0]].0].push(r); }
    let mut refused = Vec::new();
    let mut joint = Vec::new();
    let mut coupling: Vec<BTreeMap<usize, f64>> = Vec::new();
    let mut cross: Vec<BTreeMap<usize, f64>> = Vec::new();
    for &j in &dropped {
        let f = &free[j];
        let g = group_of[f.dofs[0]].0;
        let mut u = vec![0.0; k.n];
        for (&d, &v) in f.dofs.iter().zip(&f.direction) { u[d] = v; }
        let ku = k.sym_mat_vec(&u);
        let mut magnitude = vec![0.0; k.n];
        for col in 0..k.n {
            for p in k.col_ptr[col]..k.col_ptr[col + 1] {
                let row = k.row_idx[p];
                magnitude[row] += k.values[p].abs() * u[col].abs();
                if row != col { magnitude[col] += k.values[p].abs() * u[row].abs(); }
            }
        }
        let (mut c, mut x) = (BTreeMap::new(), BTreeMap::new());
        let mut outside = Vec::new();
        for (d, &val) in ku.iter().enumerate() {
            let (h, l) = group_of[d];
            if val == 0.0 || h == g { continue; }
            if magnitude[d].is_finite() && val.abs() <= ROUNDING * f.dofs.len() as f64 * f64::EPSILON * magnitude[d] { continue; }
            outside.push((d, val));
            for &col in &columns_of[h] { *c.entry(col).or_insert(0.0) += columns[col].w[l] * val; }
            for &r in &dropped_of[h] { *x.entry(r).or_insert(0.0) += free[dropped[r]].direction[l] * val; }
        }
        let (mu, top, b) = own[j];
        if outside.is_empty() { continue; }
        let node = f.node;
        free[j].coupling = outside;
        if mu <= ROUNDING * b as f64 * f64::EPSILON * top {
            refused.push(node);
            continue;
        }
        joint.push(j);
        coupling.push(c);
        cross.push(x);
    }
    if !refused.is_empty() || joint.is_empty() {
        refused.sort_unstable();
        refused.dedup();
        return refused;
    }
    let mut nodes: Vec<usize> = joint.iter().map(|&j| free[j].node).collect();
    nodes.sort_unstable();
    nodes.dedup();
    let m = joint.len();
    if m > DENSE_SPECTRUM { return nodes; }
    let position: BTreeMap<usize, usize> = joint.iter().enumerate().map(|(p, &j)| (dropped.iter().position(|&d| d == j).unwrap(), p)).collect();
    let root: Vec<f64> = joint.iter().map(|&j| own[j].0.sqrt()).collect();
    let mut kdd = vec![0.0; m * m];
    for p in 0..m {
        kdd[p * m + p] = 1.0;
        for (&r, &val) in &cross[p] {
            match position.get(&r) {
                Some(&q) => kdd[p * m + q] = val / (root[p] * root[q]),
                None => return nodes,
            }
        }
    }
    for p in 0..m {
        for q in (p + 1)..m {
            let v = 0.5 * (kdd[p * m + q] + kdd[q * m + p]);
            kdd[p * m + q] = v;
            kdd[q * m + p] = v;
        }
    }
    let (lambda, q) = sym_eigen_small(&kdd, m);
    let mut condensed = 0.0f64;
    for (i, &l) in lambda.iter().enumerate() {
        let mut y: BTreeMap<usize, f64> = BTreeMap::new();
        for p in 0..m {
            let w = q[p * m + i] / root[p];
            for (&col, &val) in &coupling[p] { *y.entry(col).or_insert(0.0) += w * val; }
        }
        let scale = y.values().fold(0.0f64, |a, v| a.max(v.abs()));
        if scale == 0.0 { continue; }
        if l <= 0.0 { return nodes; }
        let t = y.values().map(|v| (v / scale) * (v / scale)).sum::<f64>();
        condensed += t * (scale / l.sqrt()) * (scale / l.sqrt());
    }
    if !condensed.is_finite() || condensed * kappa > COUPLED { nodes } else { Vec::new() }
}

fn swinging(free: &[FreeDirection], moves_translation: &[Vec<(usize, f64)>]) -> (Vec<usize>, Vec<usize>) {
    let (mut moving, mut undecided) = (Vec::new(), Vec::new());
    if moves_translation.is_empty() { return (moving, undecided); }
    let mut by_group: BTreeMap<(usize, DofKind), Vec<&FreeDirection>> = BTreeMap::new();
    for f in free.iter().filter(|f| f.kind != DofKind::Translation) { by_group.entry((f.node, f.kind)).or_default().push(f); }
    for ((node, _), dirs) in by_group {
        let dofs = &dirs[0].dofs;
        let arm = dofs.iter().flat_map(|&d| moves_translation[d].iter()).fold(0.0f64, |m, &(_, x)| m.max(x.abs()));
        if arm == 0.0 { continue; }
        if !arm.is_finite() {
            undecided.push(node);
            continue;
        }
        let mut rows: BTreeMap<usize, Vec<f64>> = BTreeMap::new();
        for (c, f) in dirs.iter().enumerate() {
            for (&d, &v) in f.dofs.iter().zip(&f.direction) {
                for &(r, x) in &moves_translation[d] { rows.entry(r).or_insert_with(|| vec![0.0; dirs.len()])[c] += (x / arm) * v; }
            }
        }
        let motion = top_singular((0..dirs.len()).map(|c| rows.values().map(|m| m[c]).collect()).collect());
        if motion == 0.0 { continue; }
        if motion > ROUNDING * dofs.len() as f64 * f64::EPSILON { moving.push(node) } else { undecided.push(node) }
    }
    (moving, undecided)
}

fn top_singular(columns: Vec<Vec<f64>>) -> f64 {
    let scale = columns.iter().flatten().fold(0.0f64, |m, x| m.max(x.abs()));
    if scale == 0.0 { return 0.0; }
    let n = columns.len();
    let mut gram = vec![0.0; n * n];
    for a in 0..n {
        for b in 0..n { gram[a * n + b] = columns[a].iter().zip(&columns[b]).map(|(x, y)| (x / scale) * (y / scale)).sum(); }
    }
    let (mu, _) = sym_eigen_small(&gram, n);
    mu.last().copied().unwrap_or(0.0).max(0.0).sqrt() * scale
}

fn scaled(k: &CscMatrix, groups: &[((usize, DofKind), Vec<usize>)], group_of: &[(usize, usize)], columns: &[Column]) -> CscMatrix {
    let mut by_group: Vec<Vec<usize>> = vec![Vec::new(); groups.len()];
    for (c, col) in columns.iter().enumerate() { by_group[col.group].push(c); }
    let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
    let mut place = |x: usize, y: usize, v: f64| {
        let ((gx, lx), (gy, ly)) = (group_of[x], group_of[y]);
        for &r in &by_group[gx] {
            for &c in &by_group[gy] {
                if r >= c {
                    rows.push(r);
                    cols.push(c);
                    vals.push(columns[r].w[lx] * v * columns[c].w[ly]);
                }
            }
        }
    };
    for j in 0..k.n {
        for p in k.col_ptr[j]..k.col_ptr[j + 1] {
            let i = k.row_idx[p];
            let v = k.values[p];
            place(i, j, v);
            if i != j { place(j, i, v); }
        }
    }
    CscMatrix::from_triplets(columns.len(), &rows, &cols, &vals)
}

fn norm(x: &[f64]) -> f64 { x.iter().map(|a| a * a).sum::<f64>().sqrt() }

fn dot(a: &[f64], b: &[f64]) -> f64 { a.iter().zip(b).map(|(x, y)| x * y).sum() }

fn start(m: usize, seed: u64) -> Vec<f64> {
    let mut h = seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1;
    let x: Vec<f64> = (0..m).map(|_| {
        h ^= h << 13;
        h ^= h >> 7;
        h ^= h << 17;
        (h >> 11) as f64 / (1u64 << 53) as f64 - 0.5
    }).collect();
    let nx = norm(&x);
    x.into_iter().map(|a| a / nx).collect()
}

fn lanczos_top(apply: &dyn Fn(&[f64]) -> Vec<f64>, m: usize, seed: u64) -> Option<(f64, Vec<f64>)> {
    let steps = m.min(200);
    let mut basis: Vec<Vec<f64>> = vec![start(m, seed)];
    let (mut alpha, mut beta): (Vec<f64>, Vec<f64>) = (Vec::new(), Vec::new());
    let mut previous = f64::NAN;
    loop {
        let j = basis.len() - 1;
        let mut w = apply(&basis[j]);
        alpha.push(dot(&w, &basis[j]));
        for _ in 0..2 {
            for v in &basis {
                let c = dot(&w, v);
                w.iter_mut().zip(v).for_each(|(a, b)| *a -= c * b);
            }
        }
        let b = norm(&w);
        let k = alpha.len();
        let exhausted = !b.is_finite() || b <= 1e-13 * alpha.iter().fold(0.0f64, |m, a| m.max(a.abs())) || k == steps;
        if k % 10 != 0 && !exhausted {
            beta.push(b);
            basis.push(w.into_iter().map(|a| a / b).collect());
            continue;
        }
        let shifted: Vec<f64> = std::iter::once(0.0).chain(beta.iter().copied()).collect();
        let top = crate::linalg::lanczos::tridiag_eigen(&alpha, &shifted, k)[k - 1];
        if !top.is_finite() { return None; }
        if exhausted || (top - previous).abs() <= 1e-12 * top.abs() {
            let (_, y) = crate::linalg::lanczos::tridiag_eigen_vecs(&alpha, &shifted, k);
            let mut x = vec![0.0; m];
            for (i, v) in basis.iter().enumerate() {
                let c = y[i * k + k - 1];
                x.iter_mut().zip(v).for_each(|(a, b)| *a += c * b);
            }
            return Some((top, x));
        }
        previous = top;
        beta.push(b);
        basis.push(w.into_iter().map(|a| a / b).collect());
    }
}

fn positive_definite(s: &CscMatrix, scale: f64, shift: f64) -> bool {
    let mut a = s.clone();
    for j in 0..a.n {
        for p in a.col_ptr[j]..a.col_ptr[j + 1] {
            a.values[p] *= scale;
            if a.row_idx[p] == j { a.values[p] += shift; }
        }
    }
    let sym = Rc::new(symbolic_cholesky(&a));
    numeric_cholesky(&sym, &a).is_some()
}

const CERTIFY: f64 = 1e-3;
const WIDEN: i32 = 11;

fn spectrum(s: &CscMatrix, anisotropy: f64) -> (f64, Option<Vec<f64>>, bool) {
    let m = s.n;
    if m <= FULL_SPECTRUM {
        let (mu, vecs) = sym_eigen_small(&s.to_dense_symmetric(), m);
        let x: Vec<f64> = (0..m).map(|r| vecs[r * m]).collect();
        let indefinite = -mu[0] > ROUNDING * m as f64 * f64::EPSILON * anisotropy * mu[m - 1].abs();
        if mu[0].is_nan() || mu[0] <= 0.0 { return (f64::INFINITY, Some(x), indefinite); }
        return (mu[m - 1] / mu[0], Some(x), false);
    }
    let sym = Rc::new(symbolic_cholesky(s));
    let Some(factor) = numeric_cholesky(&sym, s) else { return (f64::INFINITY, None, false) };
    let mut mode = None;
    for seed in 1..=3 {
        let Some((inverse_top, x)) = lanczos_top(&|v| sparse_cholesky_solve(&factor, v), m, seed) else { continue };
        mode = Some(x);
        let Some((lmax, _)) = lanczos_top(&|v| s.sym_mat_vec(v), m, seed) else { continue };
        if !(inverse_top.is_finite() && inverse_top > 0.0 && lmax > 0.0) { continue; }
        let lower = (0..WIDEN).map(|t| (1.0 - CERTIFY) / inverse_top / 2f64.powi(t)).find(|&l| positive_definite(s, 1.0, -l));
        let upper = (0..WIDEN).map(|t| (1.0 + CERTIFY) * lmax * 2f64.powi(t)).find(|&u| positive_definite(s, -1.0, u));
        if let (Some(lower), Some(upper)) = (lower, upper) { return (upper / lower, mode, false); }
    }
    (f64::INFINITY, mode, false)
}

fn mode_nodes(x: &[f64], columns: &[Column], groups: &[((usize, DofKind), Vec<usize>)]) -> Vec<usize> {
    let mut by_node: BTreeMap<usize, f64> = BTreeMap::new();
    for (c, col) in columns.iter().enumerate() {
        *by_node.entry(groups[col.group].0 .0).or_insert(0.0) += x[c] * x[c];
    }
    let top = by_node.values().copied().fold(0.0f64, f64::max);
    by_node.into_iter().filter(|&(_, v)| v >= 0.01 * top).map(|(n, _)| n).collect()
}

fn rounding_amplification(bound: &CscMatrix, columns: &[Column], free: &[FreeDirection], own: &[(f64, f64, usize)], groups: &[((usize, DofKind), Vec<usize>)], group_of: &[(usize, usize)]) -> f64 {
    if bound.values.iter().any(|x| !x.is_finite()) { return f64::INFINITY; }
    let mut weights: Vec<Column> = columns.iter().map(|c| Column { group: c.group, w: c.w.iter().map(|v| v.abs()).collect() }).collect();
    for (f, &(_, top, _)) in free.iter().zip(own) {
        if top == 0.0 {
            let mut u = vec![0.0; bound.n];
            for (&d, &v) in f.dofs.iter().zip(&f.direction) { u[d] = v.abs(); }
            if bound.sym_mat_vec(&u).iter().any(|&x| x != 0.0) { return f64::INFINITY; }
        } else {
            weights.push(Column { group: group_of[f.dofs[0]].0, w: f.direction.iter().map(|v| v.abs() / top.sqrt()).collect() });
        }
    }
    let projected = scaled(bound, groups, group_of, &weights);
    if projected.values.iter().any(|x| !x.is_finite()) { return f64::INFINITY; }
    projected.sym_mat_vec(&vec![1.0; weights.len()]).into_iter().fold(0.0, f64::max)
}

fn of_assembled(k: &[f64], dof: &DofNumbering, two_d: bool, fcs: Option<crate::solver::constraints::FreeConstraintSystem>, coupling: &[(usize, usize)]) -> Stability {
    let nf = dof.n_free;
    let (mut rows, mut cols, mut values) = (Vec::new(), Vec::new(), Vec::new());
    for j in 0..nf {
        for i in j..nf {
            let value = 0.5 * k[i * dof.n_total + j] + 0.5 * k[j * dof.n_total + i];
            if value != 0.0 { rows.push(i); cols.push(j); values.push(value); }
        }
    }
    let k = CscMatrix::from_triplets(nf, &rows, &cols, &values);
    match fcs {
        Some(fcs) => fcs.stability(&fcs.reduce_matrix_sparse(&k), dof, &k, coupling),
        None => analyze_with_coupling(&k, &tags(dof, two_d), coupling),
    }
}

pub fn of_2d(input: &SolverInput) -> Result<Stability, String> {
    let dof = DofNumbering::build_2d(input);
    let asm = crate::solver::assembly::without_artificial_stiffness(|| crate::solver::assembly::assemble_2d(input, &dof));
    let fcs = crate::solver::constraints::FreeConstraintSystem::build_2d(input, &dof)?;
    Ok(of_assembled(&asm.k, &dof, true, fcs, &coupling_2d(input, &dof)))
}

pub fn of_3d(input: &SolverInput3D) -> Result<Stability, String> {
    let input = &crate::solver::linear::expand_curved_beams_3d(input);
    let dof = DofNumbering::build_3d(input);
    let asm = crate::solver::assembly::without_artificial_stiffness(|| crate::solver::assembly::assemble_3d(input, &dof));
    let fcs = crate::solver::constraints::FreeConstraintSystem::build_3d(input, &dof)?;
    Ok(of_assembled(&asm.k, &dof, false, fcs, &coupling_3d(input, &dof)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "known wrong result: #1753"]
    fn issue_1753_stalled_ritz_values_do_not_underestimate_the_top_eigenvalue() {
        let m = 80;
        let seed = 15_233_338_564_176_581_173;
        let initial = start(m, seed);
        assert_eq!(initial[0], initial[1]);
        let mut diagonal: Vec<f64> = (0..m).map(|i| 1.0 + i as f64 / m as f64 / 10.0).collect();
        diagonal[0] = 2.0005;
        diagonal[1] = 2.0005;
        let mut rows: Vec<usize> = (0..m).collect();
        let mut cols = rows.clone();
        rows.push(1);
        cols.push(0);
        diagonal.push(-0.0005);
        let matrix = CscMatrix::from_triplets(m, &rows, &cols, &diagonal);
        let exact_top = 2.001;
        let calls = std::cell::Cell::new(0);
        let apply = |x: &[f64]| { calls.set(calls.get() + 1); matrix.sym_mat_vec(x) };
        let (upper, _) = lanczos_top(&apply, m, seed).expect("a finite upper bound");
        assert_eq!(calls.get(), 20, "exercise successive stalled estimates before exhaustion");
        assert!(upper >= exact_top, "stalled Ritz estimate {upper} is below the exact eigenvalue {exact_top}");
    }
}
