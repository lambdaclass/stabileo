use crate::linalg::sparse::CscMatrix;
use crate::linalg::sparse_chol::{numeric_cholesky, sparse_negative_inertia, sparse_cholesky_solve, symbolic_cholesky, SymbolicCholesky};
use crate::solver::dof::DofNumbering;
use crate::types::*;
use std::collections::BTreeMap;
use std::rc::Rc;

use super::structural_kinematics::{MechanismWitness, StructuralKinematics};

pub(crate) fn has_member_releases_2d(input: &SolverInput) -> bool {
    input.elements.values().any(|e| e.hinge_start || e.hinge_end)
}

pub(crate) fn has_member_releases_3d(input: &SolverInput3D) -> bool {
    input.elements.values().any(|e| e.release_my_start || e.release_my_end || e.release_mz_start || e.release_mz_end || e.release_t_start || e.release_t_end)
}

pub const LOCAL_FREE: f64 = 1e-12;
pub const DENSE_SPECTRUM: usize = 240;
pub const FULL_SPECTRUM: usize = 64;
pub const RESOLVABLE: f64 = 1e12;
pub const MAX_ANISOTROPY: f64 = 1e8;
pub const CONDITIONAL_ACCURACY: f64 = 1e-4;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum DofKind { Translation, Rotation, Warping }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DofTag { pub node: usize, pub kind: DofKind }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict { Stable, Mechanism, Singular }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reason { Resolved, FreeTranslation, SwingAtRounding, Conditioning, CoupledSoftDirection, ConstraintRounding, OperatorRounding, AxialMechanism, FrameMechanism, Indefinite, NonFinite }

#[derive(Debug, Clone)]
pub struct FreeDirection {
    pub node: usize,
    pub kind: DofKind,
    pub moves_translation: bool,
    pub dofs: Vec<usize>,
    pub direction: Vec<f64>,
    pub direction_rounding: Vec<f64>,
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

impl FreeDirection {
    fn load_work(&self, f: &[f64], rounding: &[f64]) -> super::load_work::Work {
        let mut work = super::load_work::Work::default();
        if self.direction_rounding.len() != self.direction.len() { work.uncertainty = f64::INFINITY; return work; }
        for (j, (&i, &v)) in self.dofs.iter().zip(&self.direction).enumerate() {
            work.product(v, self.direction_rounding.get(j).copied().unwrap_or(0.0), f.get(i).copied().unwrap_or(0.0), rounding.get(i).copied().unwrap_or(0.0));
        }
        work
    }
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

    pub fn needs_accuracy_check(&self) -> bool {
        self.is_stable() && self.kappa * self.anisotropy > RESOLVABLE
    }

    pub(crate) fn conditioning_refusal(&self) -> String {
        let mut refused = self.clone();
        refused.reason = Reason::Conditioning;
        refused.refusal().unwrap()
    }

    pub fn stable() -> Self {
        Stability { verdict: Verdict::Stable, reason: Reason::Resolved, kappa: 1.0, anisotropy: 1.0, free: Vec::new(), mode_nodes: Vec::new() }
    }

    pub fn pins(&self) -> Vec<(usize, usize, f64)> {
        rotation_pins(self.free_rotations())
    }

    pub fn pin_dense(&self, k: &mut [f64], n: usize) {
        for (i, j, x) in self.pins() {
            k[i * n + j] += x;
            if i != j { k[j * n + i] += x; }
        }
    }

    pub fn pin_sparse(&self, k: &CscMatrix) -> CscMatrix {
        with_stiffness_entries(k, self.pins())
    }

    pub fn load_on_free_rotation(&self, f: &[f64]) -> Option<usize> {
        self.load_on_free_rotation_with_rounding(f, &[])
    }

    pub(crate) fn load_on_free_rotation_with_rounding(&self, f: &[f64], rounding: &[f64]) -> Option<usize> {
        self.free_rotations().find(|d| !d.load_work(f, rounding).contains_zero()).map(|d| d.node)
    }

    pub fn check_pins(&self, u: &[f64], f: &[f64], restrained: &[f64]) -> Result<(), String> {
        self.check_pins_with_rounding(u, f, restrained, &[])
    }

    pub(crate) fn check_pins_with_rounding(&self, u: &[f64], f: &[f64], restrained: &[f64], rounding: &[f64]) -> Result<(), String> {
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
            let mut uncertainty = d.load_work(f, rounding).uncertainty;
            for (j, &i) in d.dofs.iter().enumerate() {
                uncertainty = super::load_work::add_up(uncertainty, super::load_work::mul_up(d.direction_rounding.get(j).copied().unwrap_or(0.0), at(restrained, i).abs()));
            }
            let bound = super::load_work::add_up(ROUNDING * (d.coupling.len() + 2 * d.dofs.len()) as f64 * f64::EPSILON * size, uncertainty);
            !(force.is_finite() && bound.is_finite() && force.abs() <= bound)
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
        self.free.iter().filter(|f| !f.moves_translation)
    }

    pub fn mechanism_directions(&self) -> impl Iterator<Item = &FreeDirection> {
        self.free.iter().filter(|f| f.moves_translation)
    }

    pub(super) fn rank_refusal(&self) -> Option<String> {
        match self.reason {
            Reason::OperatorRounding | Reason::AxialMechanism | Reason::FrameMechanism => self.refusal(),
            Reason::ConstraintRounding => self.refusal().map(|message| {
                crate::refusal::coded(DiagnosticCode::ReducedStiffnessRank, &message)
            }),
            _ => None,
        }
    }

    pub fn refusal(&self) -> Option<String> {
        let nodes = if self.mode_nodes.is_empty() { String::new() } else { format!(" at nodes {:?}", self.mode_nodes) };
        match self.reason {
            Reason::Resolved => None,
            Reason::FreeTranslation => Some(format!(
                "the structure is a mechanism{nodes}: a node can move freely in a direction no member, support or spring stiffens; add supports or members, or remove releases"
            )),
            Reason::AxialMechanism => Some(crate::refusal::from_diagnostic(
                StructuredDiagnostic::global(
                    DiagnosticCode::ReducedStiffnessRank,
                    Severity::Error,
                    format!("the structure is a mechanism{nodes}: a translation of this joint leaves all attached trusses unstrained and satisfies the restraints"),
                ).with_nodes(self.mode_nodes.clone()),
            )),
            Reason::FrameMechanism => Some(crate::refusal::from_diagnostic(
                StructuredDiagnostic::global(
                    DiagnosticCode::ReducedStiffnessRank,
                    Severity::Error,
                    format!("the structure is a mechanism{nodes}: a frame can swing about a released end without straining its members or moving its restraints"),
                ).with_nodes(self.mode_nodes.clone()),
            )),
            Reason::Indefinite => Some(format!(
                "the stiffness matrix is not positive semidefinite{nodes}: the structure has a direction of negative stiffness (a negative spring or a negative member property, say), so it is unstable; check the springs and member properties there"
            )),
            Reason::NonFinite => Some(
                "the stiffness matrix has an infinite or undefined entry: check member properties, spring stiffnesses and node coordinates for zero lengths, infinities or missing values".to_string()
            ),
            Reason::OperatorRounding => Some(operator_rounding_refusal()),
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
                "the structure is a mechanism or so close to one that its stability cannot be decided in double precision{nodes} (scaled condition number {:.1e}, node anisotropy {:.1e}; limits {RESOLVABLE:.0e} and {MAX_ANISOTROPY:.0e}, conditional accuracy {CONDITIONAL_ACCURACY:.0e}): the matrix exceeds a conditioning limit or the recovered response fails its accuracy check; add supports or members, remove releases, or reduce extreme stiffness contrasts",
                self.kappa, self.anisotropy
            )),
        }
    }
}

fn rotation_pins<'a>(directions: impl Iterator<Item = &'a FreeDirection>) -> Vec<(usize, usize, f64)> {
    let mut pins = Vec::new();
    for direction in directions {
        for (a, (&i, &vi)) in direction.dofs.iter().zip(&direction.direction).enumerate() {
            for (&j, &vj) in direction.dofs.iter().zip(&direction.direction).take(a + 1) {
                let value = direction.scale * vi * vj;
                if value != 0.0 {
                    pins.push((i.max(j), i.min(j), value));
                }
            }
        }
    }
    pins
}

pub(super) struct ReleaseGauges(Vec<FreeDirection>);

impl ReleaseGauges {
    pub(super) fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub(super) fn check_load(&self, load: &[f64], rounding: &[f64]) -> Result<(), String> {
        if let Some(direction) = self.0.iter().find(|direction| !direction.load_work(load, rounding).contains_zero()) {
            return Err(super::linear::moment_lost_3d(direction.node, "a free rotation would carry load"));
        }
        Ok(())
    }

    pub(super) fn pin_dense(&self, k: &mut [f64], n: usize) {
        for (i, j, value) in rotation_pins(self.0.iter()) {
            k[i * n + j] += value;
            if i != j {
                k[j * n + i] += value;
            }
        }
    }

    pub(super) fn pin_sparse(&self, k: &CscMatrix) -> CscMatrix {
        with_stiffness_entries(k, rotation_pins(self.0.iter()))
    }

    pub(super) fn add_pin_magnitudes(&self, magnitude: &CscMatrix) -> CscMatrix {
        with_stiffness_entries(magnitude, rotation_pins(self.0.iter()).into_iter().map(|(i, j, value)| (i, j, value.abs())))
    }
}

fn with_stiffness_entries(k: &CscMatrix, entries: impl IntoIterator<Item = (usize, usize, f64)>) -> CscMatrix {
    let mut entries = entries.into_iter().peekable();
    if entries.peek().is_none() { return k.clone(); }
    let (mut rows, mut cols, mut values) = (Vec::new(), Vec::new(), Vec::new());
    for j in 0..k.n {
        for p in k.col_ptr[j]..k.col_ptr[j + 1] {
            rows.push(k.row_idx[p]);
            cols.push(j);
            values.push(k.values[p]);
        }
    }
    for (i, j, value) in entries {
        rows.push(i);
        cols.push(j);
        values.push(value);
    }
    CscMatrix::from_triplets(k.n, &rows, &cols, &values)
}

fn operator_rounding_refusal() -> String {
    crate::refusal::coded(
        DiagnosticCode::ReducedStiffnessRank,
        "the structure is a mechanism or so close to one that its stability cannot be decided in double precision: the reduced stiffness rank cannot be resolved at assembly precision. Check member releases, supports, springs and constraints for a mechanism.",
    )
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

#[derive(Default)]
pub(crate) struct ElasticKinematics {
    coupling: Vec<(usize, usize)>,
    structure: StructuralKinematics,
}

pub(crate) fn elastic_kinematics_2d(input: &SolverInput, dof: &DofNumbering) -> ElasticKinematics {
    ElasticKinematics { coupling: coupling_2d(input, dof), structure: StructuralKinematics::planar(input, dof) }
}

pub(crate) fn elastic_kinematics_3d(input: &SolverInput3D, dof: &DofNumbering) -> ElasticKinematics {
    ElasticKinematics { coupling: coupling_3d(input, dof), structure: StructuralKinematics::spatial(input, dof) }
}

fn coupling_2d(input: &SolverInput, dof: &DofNumbering) -> Vec<(usize, usize)> {
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

pub(super) fn sym_eigen_small(a: &[f64], n: usize) -> (Vec<f64>, Vec<f64>) {
    sym_eigen_small_impl(a, n, true)
}

enum EigenbasisMode { Omitted, Eager, Deferred }

struct JacobiRotation { p: usize, q: usize, c: f64, s: f64 }

impl JacobiRotation {
    fn apply(&self, v: &mut [f64], n: usize) {
        let Self { p, q, c, s } = *self;
        for row in v.chunks_exact_mut(n) {
            let (vkp, vkq) = (row[p], row[q]);
            row[p] = c * vkp - s * vkq;
            row[q] = s * vkp + c * vkq;
        }
    }

    fn apply_rows(&self, m: &mut [f64], n: usize) {
        let Self { p, q, c, s } = *self;
        let (before, after) = m.split_at_mut(q * n);
        let left = &mut before[p * n..(p + 1) * n];
        let right = &mut after[..n];
        for (mpk, mqk) in left.iter_mut().zip(right) {
            let (a, b) = (*mpk, *mqk);
            *mpk = c * a - s * b;
            *mqk = s * a + c * b;
        }
    }
}

struct DeferredEigenbasis { n: usize, column: usize, rotations: Vec<JacobiRotation> }

impl DeferredEigenbasis {
    fn first_mode(self) -> Vec<f64> {
        let mut v = vec![0.0; self.n * self.n];
        for i in 0..self.n { v[i * self.n + i] = 1.0; }
        for rotation in self.rotations { rotation.apply(&mut v, self.n); }
        (0..self.n).map(|r| v[r * self.n + self.column]).collect()
    }
}

struct JacobiSpectrum { values: Vec<f64>, vectors: Vec<f64>, deferred: Option<DeferredEigenbasis> }

fn sym_eigen_small_impl(a: &[f64], n: usize, vectors: bool) -> (Vec<f64>, Vec<f64>) {
    let result = jacobi_spectrum(a, n, if vectors { EigenbasisMode::Eager } else { EigenbasisMode::Omitted });
    (result.values, result.vectors)
}

fn jacobi_spectrum(a: &[f64], n: usize, mode: EigenbasisMode) -> JacobiSpectrum {
    let vectors = matches!(mode, EigenbasisMode::Eager);
    let record = matches!(mode, EigenbasisMode::Deferred);
    let mut rotations = Vec::new();
    #[cfg(test)]
    tests::EIGENVALUE_DECOMPOSITIONS.with(|count| count.set(count.get() + 1));
    let scale = a.iter().fold(0.0f64, |m, x| m.max(x.abs()));
    let scale = if scale > 0.0 && scale.is_finite() { scale } else { 1.0 };
    let mut m: Vec<f64> = a.iter().map(|x| x / scale).collect();
    let mut v = if vectors { vec![0.0; n * n] } else { Vec::new() };
    if vectors { for i in 0..n { v[i * n + i] = 1.0; } }
    for _ in 0..64 {
        let mut off = 0.0;
        for (i, row) in m.chunks_exact(n.max(1)).enumerate() {
            for (j, &x) in row.iter().enumerate() {
                if i != j { off += x * x; }
            }
        }
        let diag: f64 = m.iter().step_by(n + 1).map(|x| x * x).sum();
        if off <= (f64::EPSILON * f64::EPSILON) * diag * 1e-4 || off == 0.0 { break; }
        for p in 0..n {
            for q in (p + 1)..n {
                let apq = m[p * n + q];
                if apq == 0.0 { continue; }
                let theta = (m[q * n + q] - m[p * n + p]) / (2.0 * apq);
                let t = theta.signum() / (theta.abs() + theta.hypot(1.0));
                let t = if theta == 0.0 { 1.0 } else { t };
                if t == 0.0 { continue; }
                #[cfg(test)]
                if t == 0.0 { tests::IDENTITY_ROTATIONS.with(|count| count.set(count.get() + 1)); }
                let c = 1.0 / (t * t + 1.0).sqrt();
                let s = t * c;
                let rotation = JacobiRotation { p, q, c, s };
                rotation.apply(&mut m, n);
                rotation.apply_rows(&mut m, n);
                if vectors {
                    #[cfg(test)]
                    tests::EIGENVECTOR_ROTATIONS.with(|count| count.set(count.get() + 1));
                    JacobiRotation { p, q, c, s }.apply(&mut v, n);
                }
                if record { rotations.push(JacobiRotation { p, q, c, s }); }
            }
        }
    }
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|&a, &b| m[a * n + a].total_cmp(&m[b * n + b]));
    let values = order.iter().map(|&i| m[i * n + i] * scale).collect();
    let mut eigenvectors = Vec::new();
    if vectors {
        eigenvectors.resize(n * n, 0.0);
        for (c, &i) in order.iter().enumerate() {
            for r in 0..n { eigenvectors[r * n + c] = v[r * n + i]; }
        }
    }
    JacobiSpectrum {
        values,
        vectors: eigenvectors,
        deferred: record.then(|| DeferredEigenbasis { n, column: order.first().copied().unwrap_or(0), rotations }),
    }
}

#[derive(Default)]
pub(crate) struct ReleasedRotations {
    pub rows: Vec<Vec<(usize, f64)>>,
    nodes: std::collections::BTreeSet<usize>,
    directions: Vec<(usize, Vec<(usize, f64, f64)>)>,
}

struct ReleasedVector {
    values: Vec<f64>,
    rounding: Vec<f64>,
}

impl ReleasedVector {
    fn zero(n: usize) -> Self {Self {values:vec![0.0;n],rounding:vec![0.0;n]}}

    fn add_scaled(&mut self, other: &Self, scale: f64) {
        for i in 0..self.values.len() {
            let mut work=super::load_work::Work::default();
            work.product(self.values[i],self.rounding[i],1.0,0.0);
            work.product(other.values[i],other.rounding[i],scale,0.0);
            self.values[i]=work.value;
            self.rounding[i]=work.bound();
        }
    }

    fn normalized(self) -> Option<Self> {
        let length=self.values.iter().fold(0.0_f64,|length,x|length.hypot(*x));
        let uncertainty=self.rounding.iter().fold(0.0_f64,|length,x|length.hypot(*x));
        if !uncertainty.is_finite() || length<=uncertainty {return None;}
        let inverse=1.0/length;
        if !length.is_finite() || !inverse.is_finite() {return None;}
        let mut normalized=Self::zero(self.values.len());
        normalized.add_scaled(&self,inverse);
        Some(normalized)
    }
}

impl ReleasedRotations {
    pub(crate) fn permits(&self, node: usize, dofs: &[usize], direction: &[f64]) -> bool {
        self.nodes.contains(&node) && self.rows.iter().all(|row| {
            let (value, magnitude) = row.iter().fold((0.0f64, 0.0f64), |(sum, size), &(i, a)| {
                let product = dofs.iter().position(|&d| d == i).map_or(0.0, |j| a * direction[j]);
                (sum + product, size + product.abs())
            });
            value.is_finite() && magnitude.is_finite() && value.abs() <= ROUNDING * row.len() as f64 * f64::EPSILON * magnitude
        })
    }

    fn canonical(&self, node: usize, dofs: &[usize], v: &[f64], rank: usize, alignment: f64) -> Option<ReleasedVector> {
        let mut candidates: Vec<_>=self.directions.iter().filter(|(n,_)|*n==node).filter_map(|(_,source)| {
            let mut direction=ReleasedVector::zero(dofs.len());
            for &(d,x,error) in source {
                if let Some(i)=dofs.iter().position(|&i|i==d) {direction.values[i]=x;direction.rounding[i]=error;}
            }
            if !self.permits(node,dofs,&direction.values) {return None;}
            direction.normalized()
        }).collect();
        let mut basis:Vec<ReleasedVector>=Vec::new();
        while basis.len()<rank {
            let pivot=candidates.iter().enumerate().filter_map(|(i,source)| {
                let mut candidate=ReleasedVector {values:source.values.clone(),rounding:source.rounding.clone()};
                for _ in 0..2 {
                    for axis in &basis {
                        let projection=candidate.values.iter().zip(&axis.values).map(|(a,b)|a*b).sum::<f64>();
                        candidate.add_scaled(axis,-projection);
                    }
                }
                let length=norm(&candidate.values);
                candidate.normalized().map(|direction|(i,length,direction))
            }).max_by(|a,b|a.1.total_cmp(&b.1));
            let (i,_,direction)=pivot?;
            candidates.remove(i);
            basis.push(direction);
        }
        let mut direction=ReleasedVector::zero(dofs.len());
        for axis in &basis {
            let projection=v.iter().zip(&axis.values).map(|(a,b)|a*b).sum::<f64>();
            direction.add_scaled(axis,projection);
        }
        let direction=direction.normalized()?;
        let projection=v.iter().zip(&direction.values).map(|(a,b)|a*b).sum::<f64>();
        let residual=v.iter().zip(&direction.values).map(|(a,b)|(a-projection*b).powi(2)).sum::<f64>().sqrt();
        let magnitude=norm(v)+projection.abs();
        (residual<=alignment*magnitude && self.permits(node,dofs,&direction.values)).then_some(direction)
    }

    pub(crate) fn project(&self, c: &crate::solver::constraints::SparseTransform) -> Self {
        let rows = self.rows.iter().map(|row| {
            let mut projected = BTreeMap::new();
            for &(i, a) in row {
                for p in c.row_ptr[i]..c.row_ptr[i + 1] {
                    *projected.entry(c.col_idx[p]).or_insert(0.0) += a * c.vals[p];
                }
            }
            projected.into_iter().collect()
        }).collect();
        let unit_rows = self.directions.is_empty() || (0..c.n_rows).all(|i| {
            #[cfg(test)]
            tests::PROJECT_ROWS.with(|count| count.set(count.get() + 1));
            let span = c.row_ptr[i]..c.row_ptr[i + 1];
            span.is_empty() || (span.len() == 1 && c.vals[span.start] == 1.0)
        });
        let directions = self.directions.iter().filter(|_| unit_rows).filter_map(|(node,direction)| {
            let mut touched = std::collections::BTreeSet::new();
            for &(i, value, error) in direction {
                if i >= c.n_rows { continue; }
                let span = c.row_ptr[i]..c.row_ptr[i + 1];
                if span.is_empty() {
                    if value != 0.0 { return None; }
                } else if value != 0.0 || error != 0.0 {
                    touched.insert(c.col_idx[span.start]);
                }
            }
            let mut projected = Vec::new();
            for j in touched {
                let mut component = None;
                for p in c.col_ptr[j]..c.col_ptr[j + 1] {
                    #[cfg(test)]
                    tests::PROJECT_ROWS.with(|count| count.set(count.get() + 1));
                    let i = c.row_idx[p];
                    let (value, error) = direction.iter().find(|(d, _, _)| *d == i).map_or((0.0, 0.0), |(_, x, e)| (*x, *e));
                    match &mut component {
                        Some((previous, bound)) => {
                            if *previous != value { return None; }
                            *bound = f64::max(*bound, error);
                        }
                        None => component = Some((value, error)),
                    }
                }
                if let Some((value, error)) = component {
                    if value != 0.0 || error != 0.0 { projected.push((j, value, error)); }
                }
            }
            Some((*node, projected))
        }).collect();
        Self { rows, nodes: self.nodes.clone(), directions }
    }
}

pub(crate) fn released_rotations_3d(input: &SolverInput3D, dof: &DofNumbering) -> ReleasedRotations {
    let nodes: BTreeMap<_, _> = input.nodes.values().map(|n| (n.id, n)).collect();
    released_rotations_in_frames(input, dof, |e| {
        let (a, b) = (nodes[&e.node_i], nodes[&e.node_j]);
        let (ex, ey, ez) = crate::element::compute_local_axes_3d(a.x, a.y, a.z, b.x, b.y, b.z, e.local_yx, e.local_yy, e.local_yz, e.roll_angle, input.left_hand.unwrap_or(false));
        Some([ex, ey, ez])
    }).unwrap_or_default()
}

pub(super) fn released_rotations_in_frames(
    input: &SolverInput3D, dof: &DofNumbering, frame: impl Fn(&SolverElement3D) -> Option<[[f64; 3]; 3]>,
) -> Option<ReleasedRotations> {
    let mut axes: BTreeMap<usize, Vec<[f64; 3]>> = BTreeMap::new();
    let mut released = std::collections::BTreeSet::new();
    let mut directions = Vec::new();
    for e in crate::ordered::values(&input.elements).filter(|e| e.elem_type == "frame") {
        let [ex, ey, ez] = frame(e)?;
        let frame_rounding = super::load_work::frame_rounding(&[ex,ey,ez]);
        for (node, ry, rz, own_rt) in [(e.node_i, e.release_my_start, e.release_mz_start, e.release_t_start), (e.node_j, e.release_my_end, e.release_mz_end, e.release_t_end)] {
            let warping = input.sections.values().find(|s| s.id == e.section_id).is_some_and(|s| s.cw.is_some_and(|cw| cw > 0.0));
            let rt = own_rt || (!warping && (e.release_t_start || e.release_t_end));
            if rt || ry || rz { released.insert(node); }
            let active = axes.entry(node).or_default();
            for (j,(axis, free)) in [(ex, rt), (ey, ry), (ez, rz)].into_iter().enumerate() {
                if !free { active.push(axis); } else {
                    let direction = (0..3).filter_map(|i| dof.global_dof(node, 3 + i).filter(|&g| g < dof.n_free).map(|g| (g, axis[i], frame_rounding[j][i]))).collect();
                    directions.push((node, direction));
                }
            }
        }
    }
    for e in &input.curved_beams {
        for node in [e.node_start, e.node_mid, e.node_end] { released.remove(&node); }
    }
    for e in input.connectors.values() { released.remove(&e.node_i); released.remove(&e.node_j); }
    for ids in input.plates.values().map(|e| e.nodes.to_vec())
        .chain(input.quads.values().map(|e| e.nodes.to_vec()))
        .chain(input.quad9s.values().map(|e| e.nodes.to_vec()))
        .chain(input.curved_shells.values().map(|e| e.nodes.to_vec()))
        .chain(input.solid_shells.values().map(|e| e.nodes.to_vec())) {
        for node in ids { released.remove(&node); }
    }
    for support in input.supports.values() {
        for (i, spring) in [support.krx, support.kry, support.krz].into_iter().enumerate() {
            if spring.is_some_and(|k| k != 0.0) {
                let mut axis = [0.0; 3]; axis[i] = 1.0;
                axes.entry(support.node_id).or_default().push(axis);
            }
        }
    }
    let mut rows = Vec::new();
    for ((node, local), g) in dof.entries_by_dof().into_iter().filter(|&(_, g)| g < dof.n_free) {
        if !(3..6).contains(&local) || !released.contains(&node) { rows.push(vec![(g, 1.0)]); }
    }
    for &node in &released {
        for axis in axes.get(&node).into_iter().flatten() {
            let row = (0..3).filter_map(|i| dof.global_dof(node, 3 + i).filter(|&g| g < dof.n_free).map(|g| (g, axis[i]))).collect();
            rows.push(row);
        }
    }
    Some(ReleasedRotations { rows, nodes: released, directions })
}

struct Column { group: usize, w: Vec<f64> }

pub fn analyze_dense(k: &[f64], n: usize, tags: &[DofTag]) -> Stability {
    analyze_dense_with_coupling(k, n, tags, &[], &ReleasedRotations::default())
}

pub(crate) fn analyze_dense_with_coupling(k: &[f64], n: usize, tags: &[DofTag], coupling: &[(usize, usize)], releases: &ReleasedRotations) -> Stability {
    analyze_dense_coupled(k, n, tags, &[], coupling, releases)
}

pub fn analyze_dense_constrained(k: &[f64], n: usize, tags: &[DofTag], moves_translation: &[Vec<(usize, f64)>]) -> Stability {
    analyze_dense_coupled(k, n, tags, moves_translation, &conservative_coupling(tags, moves_translation), &ReleasedRotations::default())
}

fn analyze_dense_coupled(k: &[f64], n: usize, tags: &[DofTag], moves_translation: &[Vec<(usize, f64)>], coupling: &[(usize, usize)], releases: &ReleasedRotations) -> Stability {
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
    analyze_coupled_with_rounding(&CscMatrix::from_triplets(n, &rows, &cols, &vals), tags, moves_translation, coupling, None, releases)
}

pub fn analyze(k: &CscMatrix, tags: &[DofTag]) -> Stability {
    analyze_with_coupling(k, tags, &[], &ReleasedRotations::default())
}

pub(crate) fn analyze_with_coupling(k: &CscMatrix, tags: &[DofTag], coupling: &[(usize, usize)], releases: &ReleasedRotations) -> Stability {
    analyze_coupled_with_rounding(k, tags, &[], coupling, None, releases)
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
    analyze_coupled_with_rounding(k, tags, moves_translation, coupling, None, &ReleasedRotations::default())
}

pub(crate) fn analyze_coupled_with_rounding(k: &CscMatrix, tags: &[DofTag], moves_translation: &[Vec<(usize, f64)>], coupling: &[(usize, usize)], rounding: Option<&CscMatrix>, releases: &ReleasedRotations) -> Stability {
    analyze_with_magnitudes(k, tags, moves_translation, coupling, rounding, None, releases)
}

fn analyze_with_magnitudes(
    k: &CscMatrix, tags: &[DofTag], moves_translation: &[Vec<(usize, f64)>],
    coupling: &[(usize, usize)], rounding: Option<&CscMatrix>,
    support_magnitude: Option<&CscMatrix>, releases: &ReleasedRotations,
) -> Stability {
    let n = k.n;
    if k.values.iter().any(|v| !v.is_finite()) {
        return non_finite();
    }
    let diagonal = k.diagonal();
    let diagonal_rounding = rounding.map(CscMatrix::diagonal);
    let support_diagonal = support_magnitude.map(CscMatrix::diagonal);
    let radius = ROUNDING * f64::EPSILON;
    let uncertain = |i: usize| {
        let scale = support_diagonal.as_ref().map_or(0.0, |d| d[i]);
        tags[i].kind == DofKind::Translation && scale > 0.0 && diagonal[i].abs() <= radius * scale
    };
    for (i, &value) in diagonal.iter().enumerate() {
        let magnitude = diagonal_rounding.as_ref().map_or(value.abs(), |d| d[i]);
        if value < -ROUNDING * n as f64 * f64::EPSILON * magnitude && !uncertain(i) {
            return Stability { verdict: Verdict::Singular, reason: Reason::Indefinite, kappa: f64::NAN, anisotropy: 1.0, free: Vec::new(), mode_nodes: vec![tags[i].node] };
        }
    }
    if let Some((magnitude, support_diagonal)) = support_magnitude.zip(support_diagonal.as_ref()) {
        if let Some(index) = (0..n).find(|&i| uncertain(i)) {
            let upper: Vec<_> = diagonal.iter().zip(support_diagonal)
                .map(|(&value, &size)| super::load_work::add_up(value.max(0.0), super::load_work::mul_up(radius, size)))
                .collect();
            for j in 0..n {
                for p in k.col_ptr[j]..k.col_ptr[j + 1] {
                    let i = k.row_idx[p];
                    if i == j || (!uncertain(i) && !uncertain(j)) { continue; }
                    let span = magnitude.col_ptr[j]..magnitude.col_ptr[j + 1];
                    let size = magnitude.row_idx[span.clone()].binary_search(&i)
                        .map_or(k.values[p].abs(), |offset| magnitude.values[span.start + offset]);
                    let positive_bound = super::load_work::mul_up(upper[i].sqrt().next_up(), upper[j].sqrt().next_up());
                    let error_bound = super::load_work::mul_up(radius, size);
                    if positive_bound.is_finite() && k.values[p].abs() > super::load_work::add_up(positive_bound, error_bound) {
                        return Stability { verdict: Verdict::Singular, reason: Reason::Indefinite, kappa: f64::NAN, anisotropy: 1.0, free: Vec::new(), mode_nodes: vec![tags[j].node, tags[i].node] };
                    }
                }
            }
            return Stability { verdict: Verdict::Singular, reason: Reason::OperatorRounding, kappa: f64::INFINITY, anisotropy: 1.0, free: Vec::new(), mode_nodes: vec![tags[index].node] };
        }
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
    let mut unresolved_negative = Vec::new();
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
            let resolved_translation = |value: f64| *kind == DofKind::Translation && value > ROUNDING * size as f64 * f64::EPSILON * top;
            for c in 0..size {
                let mut v = vec![0.0; b];
                for (r, &i) in component.iter().enumerate() { v[i] = vecs[r * size + c]; }
                if (top <= 0.0 || mu[c] <= LOCAL_FREE * top) && !resolved_translation(mu[c]) {
                    let mut direction_rounding=vec![0.0;b];
                    if *kind!=DofKind::Translation {
                        let backward=ROUNDING*size as f64*f64::EPSILON*top;
                        let separation=mu.iter().filter(|&&x|x>LOCAL_FREE*top).map(|&x|x-mu[c]).fold(f64::INFINITY,f64::min)-2.0*backward;
                        let alignment=ROUNDING*b as f64*f64::EPSILON+backward/separation;
                        let rank=if top==0.0 {b} else {mu.iter().filter(|&&x|x<=LOCAL_FREE*top).count()};
                        let canonical=(separation>0.0 && alignment<1.0).then(||releases.canonical(*node,dofs,&v,rank,alignment)).flatten();
                        match canonical {
                            Some(direction)=>{v=direction.values;direction_rounding=direction.rounding;},
                            None if mu[c]<0.0 && !releases.permits(*node,dofs,&v)=>unresolved_negative.push(*node),
                            None if size>1 && releases.permits(*node,dofs,&v)=>{
                                let angular=super::load_work::add_up(super::load_work::gamma(2*b+1),backward/separation);
                                if separation>0.0 && angular<1.0 {for &i in &component {direction_rounding[i]=angular;}}
                            },
                            None=>{},
                        }
                    }
                    free.push(FreeDirection { node: *node, kind: *kind, moves_translation: *kind == DofKind::Translation, dofs: dofs.clone(), direction: v, direction_rounding, scale: if top > 0.0 { top } else { 1.0 }, coupling: Vec::new() });
                    own.push((mu[c], top.max(0.0), size));
                } else {
                    let scale = mu[c].sqrt();
                    columns.push(Column { group: g, w: v.iter().map(|x| x / scale).collect() });
                }
            }
            if let Some(&lowest) = mu.iter().find(|&&x| x > LOCAL_FREE * top || resolved_translation(x)) {
                anisotropy = anisotropy.max(top / lowest);
            }
        }
    }
    let mut translation_free: Vec<usize> = free.iter().filter(|f| f.kind == DofKind::Translation).map(|f| f.node).collect();
    let (moving, undecided) = swinging(&mut free, moves_translation);
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
    if !unresolved_negative.is_empty() {
        return Stability { verdict: Verdict::Singular, reason: Reason::Conditioning, kappa: f64::INFINITY, anisotropy, free: Vec::new(), mode_nodes: unresolved_negative };
    }
    let projected_rounding = rounding.map(|bound| ProjectedRounding::new(bound, &columns, &free, &own, &groups, &group_of));
    if projected_rounding.as_ref().is_some_and(Option::is_none) {
        return Stability { verdict: Verdict::Singular, reason: Reason::ConstraintRounding, kappa: f64::INFINITY, anisotropy, free, mode_nodes: tags.iter().map(|t| t.node).collect() };
    }
    let projected_rounding = projected_rounding.flatten();
    let amplification = projected_rounding.as_ref().map_or(1.0, |bound| bound.dropped.max(1.0));
    if amplification > RESOLVABLE {
        return Stability { verdict: Verdict::Singular, reason: Reason::ConstraintRounding, kappa: f64::INFINITY, anisotropy, free, mode_nodes: tags.iter().map(|t| t.node).collect() };
    }
    let m = columns.len();
    if m == 0 {
        let coupled = coupled_free(k, &mut free, &own, &columns, &groups, &group_of, 1.0, releases);
        if !coupled.is_empty() {
            return Stability { verdict: Verdict::Singular, reason: Reason::CoupledSoftDirection, kappa: f64::INFINITY, anisotropy, free, mode_nodes: coupled };
        }
        return Stability { verdict: Verdict::Stable, reason: Reason::Resolved, kappa: 1.0, anisotropy, free, mode_nodes: Vec::new() };
    }
    let s = scaled(k, &groups, &group_of, &columns);
    let symbolic = (m > FULL_SPECTRUM || projected_rounding.is_some()).then(|| Rc::new(symbolic_cholesky(&s)));
    if projected_rounding.as_ref().is_some_and(|bound| !bound.resolved(&s, symbolic.as_ref().unwrap())) {
        return Stability { verdict: Verdict::Singular, reason: Reason::ConstraintRounding, kappa: f64::INFINITY, anisotropy, free, mode_nodes: tags.iter().map(|t| t.node).collect() };
    }
    let verify_rank = |kappa, free| {
        let (verdict, reason) = if resolves_rank(k, support_magnitude, &s, &groups, &group_of, &columns, symbolic.as_ref()) {
            (Verdict::Stable, Reason::Resolved)
        } else {
            (Verdict::Singular, Reason::OperatorRounding)
        };
        Stability { verdict, reason, kappa, anisotropy, free, mode_nodes: Vec::new() }
    };
    if let Some(kappa) = symbolic.as_ref().filter(|_| m > FULL_SPECTRUM).and_then(|sym| fast_sparse_bound(&s, sym, anisotropy, amplification)) {
        let coupled = coupled_free(k, &mut free, &own, &columns, &groups, &group_of, kappa, releases);
        if coupled.is_empty() && free.iter().all(|direction| direction.coupling.is_empty()) {
            return verify_rank(kappa, free);
        }
    }
    let (kappa, mode, indefinite) = spectrum(&s, anisotropy, amplification, symbolic.as_ref());
    let mode_nodes = mode.map(|x| mode_nodes(&x, &columns, &groups)).unwrap_or_default();
    if indefinite {
        return Stability { verdict: Verdict::Singular, reason: Reason::Indefinite, kappa, anisotropy, free, mode_nodes };
    }
    if rounding.is_some() && kappa * amplification > RESOLVABLE {
        return Stability { verdict: Verdict::Singular, reason: Reason::ConstraintRounding, kappa, anisotropy, free, mode_nodes };
    }
    let verdict = if kappa * anisotropy <= RESOLVABLE || (kappa <= RESOLVABLE && anisotropy <= MAX_ANISOTROPY) { Verdict::Stable } else { Verdict::Singular };
    if verdict == Verdict::Stable {
        let coupled = coupled_free(k, &mut free, &own, &columns, &groups, &group_of, kappa, releases);
        if !coupled.is_empty() {
            return Stability { verdict: Verdict::Singular, reason: Reason::CoupledSoftDirection, kappa, anisotropy, free, mode_nodes: coupled };
        }
        return verify_rank(kappa, free);
    }
    Stability { verdict, reason: Reason::Conditioning, kappa, anisotropy, free, mode_nodes }
}

fn resolves_rank(
    physical: &CscMatrix, support_magnitude: Option<&CscMatrix>, scaled_operator: &CscMatrix, groups: &[((usize, DofKind), Vec<usize>)],
    group_of: &[(usize, usize)], columns: &[Column], symbolic: Option<&Rc<SymbolicCholesky>>,
) -> bool {
    let absolute;
    let magnitude = match support_magnitude {
        Some(magnitude) => magnitude,
        None => {
            absolute = absolute_stiffness(physical);
            &absolute
        }
    };
    let weights: Vec<_> = columns.iter().map(|column| Column {
        group: column.group,
        w: column.w.iter().map(|value| value.abs()).collect(),
    }).collect();
    let envelope = scaled(magnitude, groups, group_of, &weights);
    let margin = envelope.sym_mat_vec(&vec![ROUNDING * f64::EPSILON; envelope.n]);
    let mut shifted = scaled_operator.clone();
    for (j, radius) in margin.into_iter().enumerate() {
        let Some(p) = (shifted.col_ptr[j]..shifted.col_ptr[j + 1])
            .find(|&p| shifted.row_idx[p] == j) else { return false };
        shifted.values[p] -= radius;
        if !radius.is_finite() || shifted.values[p] <= 0.0 {
            return false;
        }
    }
    let owned;
    let symbolic = match symbolic {
        Some(sym) => sym,
        None => {
            owned = Rc::new(symbolic_cholesky(&shifted));
            &owned
        }
    };
    numeric_cholesky(symbolic, &shifted).is_some()
}

pub(super) fn absolute_stiffness(k: &CscMatrix) -> CscMatrix {
    let mut magnitude = k.clone();
    magnitude.values.iter_mut().for_each(|value| *value = value.abs());
    magnitude
}

fn tangent_has_resolved_rank(
    k: &CscMatrix, magnitude: &CscMatrix, accumulation_error: Option<&CscMatrix>,
) -> bool {
    if k.values.iter().chain(&magnitude.values).any(|v| !v.is_finite()) {
        return false;
    }
    let mut row_scale = vec![0.0_f64; magnitude.n];
    for j in 0..magnitude.n {
        for p in magnitude.col_ptr[j]..magnitude.col_ptr[j + 1] {
            let i = magnitude.row_idx[p];
            let value = magnitude.values[p];
            row_scale[i] = row_scale[i].max(value);
            row_scale[j] = row_scale[j].max(value);
        }
    }
    let weights: Vec<_> = row_scale.into_iter().map(|scale| {
        if scale > 0.0 { 1.0 / scale.sqrt() } else { 1.0 }
    }).collect();
    let scale = |i: usize, j: usize, value: f64| (value * weights[i]) * weights[j];

    use super::load_work::{add_up, mul_up};
    let mut margin = vec![0.0; k.n];
    for j in 0..magnitude.n {
        for p in magnitude.col_ptr[j]..magnitude.col_ptr[j + 1] {
            let i = magnitude.row_idx[p];
            let scaled = mul_up(mul_up(magnitude.values[p], weights[i]), weights[j]);
            let radius = mul_up(ROUNDING * f64::EPSILON, scaled);
            margin[i] = add_up(margin[i], radius);
            if i != j { margin[j] = add_up(margin[j], radius); }
        }
    }
    if let Some(error) = accumulation_error {
        for j in 0..error.n {
            for p in error.col_ptr[j]..error.col_ptr[j + 1] {
                let i = error.row_idx[p];
                let radius = mul_up(mul_up(error.values[p], weights[i]), weights[j]);
                margin[i] = add_up(margin[i], radius);
                if i != j { margin[j] = add_up(margin[j], radius); }
            }
        }
    }
    if margin.iter().any(|radius| !radius.is_finite()) { return false; }

    let (mut rows, mut cols, mut values) = (Vec::new(), Vec::new(), Vec::new());
    let diagonal = k.diagonal();
    for (j, &radius) in margin.iter().enumerate() {
        rows.push(j);
        cols.push(j);
        values.push(scale(j, j, diagonal[j]) - radius);
        for p in k.col_ptr[j]..k.col_ptr[j + 1] {
            let i = k.row_idx[p];
            if i != j {
                rows.push(i);
                cols.push(j);
                values.push(scale(i, j, k.values[p]));
            }
        }
    }
    let mut shifted = CscMatrix::from_triplets(k.n, &rows, &cols, &values);
    let symbolic = symbolic_cholesky(&shifted);
    let Some(lower) = sparse_negative_inertia(&symbolic, &shifted) else { return false };
    for (j, radius) in margin.into_iter().enumerate() {
        shifted.values[shifted.col_ptr[j]] = scale(j, j, diagonal[j]) + radius;
    }
    sparse_negative_inertia(&symbolic, &shifted) == Some(lower)
}

fn is_null_action(k: &CscMatrix, absolute: &CscMatrix, direction: &[f64], terms: usize) -> bool {
    let size: Vec<_> = direction.iter().map(|value| value.abs()).collect();
    k.sym_mat_vec(direction).into_iter().zip(absolute.sym_mat_vec(&size))
        .all(|(value, bound)| value.is_finite() && bound.is_finite()
            && value.abs() <= ROUNDING * terms as f64 * f64::EPSILON * bound)
}

pub const COUPLED: f64 = 1e-4;
const ROUNDING: f64 = 64.0;

fn non_finite() -> Stability {
    Stability { verdict: Verdict::Singular, reason: Reason::NonFinite, kappa: f64::NAN, anisotropy: f64::NAN, free: Vec::new(), mode_nodes: Vec::new() }
}

fn coupled_free(k: &CscMatrix, free: &mut [FreeDirection], own: &[(f64, f64, usize)], columns: &[Column], groups: &[((usize, DofKind), Vec<usize>)], group_of: &[(usize, usize)], kappa: f64, releases: &ReleasedRotations) -> Vec<usize> {
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
        let released = releases.permits(f.node, &f.dofs, &f.direction);
        let mut spectral_coupling = false;
        for (d, &val) in ku.iter().enumerate() {
            let (h, l) = group_of[d];
            if val == 0.0 || h == g { continue; }
            let rounding = magnitude[d].is_finite() && val.abs() <= ROUNDING * f.dofs.len() as f64 * f64::EPSILON * magnitude[d];
            if rounding && released { continue; }
            outside.push((d, val));
            if rounding { continue; }
            spectral_coupling = true;
            for &col in &columns_of[h] { *c.entry(col).or_insert(0.0) += columns[col].w[l] * val; }
            for &r in &dropped_of[h] { *x.entry(r).or_insert(0.0) += free[dropped[r]].direction[l] * val; }
        }
        let (mu, top, b) = own[j];
        let node = f.node;
        free[j].coupling = outside;
        if !spectral_coupling { continue; }
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

fn swinging(free: &mut [FreeDirection], moves_translation: &[Vec<(usize, f64)>]) -> (Vec<usize>, Vec<usize>) {
    let (mut moving, mut undecided) = (Vec::new(), Vec::new());
    if moves_translation.is_empty() { return (moving, undecided); }
    let mut by_group: BTreeMap<(usize, DofKind), Vec<usize>> = BTreeMap::new();
    for (i, f) in free.iter().enumerate().filter(|(_, f)| f.kind != DofKind::Translation) {
        by_group.entry((f.node, f.kind)).or_default().push(i);
    }
    for ((node, _), dirs) in by_group {
        let dofs = free[dirs[0]].dofs.clone();
        let arm = dofs.iter().flat_map(|&d| moves_translation[d].iter()).fold(0.0f64, |m, &(_, x)| m.max(x.abs()));
        if arm == 0.0 { continue; }
        if !arm.is_finite() {
            undecided.push(node);
            continue;
        }
        let mut rows: BTreeMap<usize, Vec<f64>> = BTreeMap::new();
        for (c, &i) in dirs.iter().enumerate() {
            let f = &free[i];
            for (&d, &v) in f.dofs.iter().zip(&f.direction) {
                for &(r, x) in &moves_translation[d] { rows.entry(r).or_insert_with(|| vec![0.0; dirs.len()])[c] += (x / arm) * v; }
            }
        }
        let tolerance = ROUNDING * dofs.len() as f64 * f64::EPSILON;
        let mut basis: Vec<Vec<f64>> = Vec::new();
        let mut remaining: Vec<Vec<f64>> = rows.into_values().collect();
        loop {
            for row in &mut remaining {
                for _ in 0..2 {
                    for direction in &basis {
                        let projection = dot(row, direction);
                        for (x, v) in row.iter_mut().zip(direction) { *x -= projection * v; }
                    }
                }
            }
            let Some((pivot, length)) = remaining.iter().enumerate().map(|(i, row)| (i, norm(row))).max_by(|a, b| a.1.total_cmp(&b.1)) else { break; };
            if length <= tolerance { break; }
            let row = remaining.swap_remove(pivot);
            basis.push(row.into_iter().map(|v| v / length).collect());
        }
        if basis.is_empty() {
            if remaining.iter().flatten().any(|&v| v != 0.0) { undecided.push(node); }
            continue;
        }
        moving.push(node);
        let moving_count = basis.len();
        for axis in 0..dirs.len() {
            let mut candidate = vec![0.0; dirs.len()];
            candidate[axis] = 1.0;
            for _ in 0..2 {
                for direction in &basis {
                    let projection = dot(&candidate, direction);
                    for (x, v) in candidate.iter_mut().zip(direction) { *x -= projection * v; }
                }
            }
            let length = norm(&candidate);
            if length > tolerance { basis.push(candidate.into_iter().map(|v| v / length).collect()); }
        }
        let original: Vec<_> = dirs.iter().map(|&i| free[i].clone()).collect();
        for (c, &i) in dirs.iter().enumerate() {
            let combined: Vec<_> = (0..dofs.len()).map(|r| {
                let mut work = super::load_work::Work::default();
                for (f,w) in original.iter().zip(&basis[c]) { work.product(f.direction[r],f.direction_rounding[r],*w,0.0); }
                (work.value,work.bound())
            }).collect();
            free[i].direction = combined.iter().map(|x| x.0).collect();
            free[i].direction_rounding = combined.iter().map(|x| x.1).collect();
            free[i].moves_translation = c < moving_count;
        }
    }
    (moving, undecided)
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

fn lanczos_top(apply: &dyn Fn(&[f64]) -> Vec<f64>, m: usize, seed: u64, certify: &dyn Fn(f64) -> Option<f64>) -> Option<(f64, Vec<f64>)> {
    #[cfg(test)]
    tests::LANCZOS_RUNS.with(|count| count.set(count.get() + 1));
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
            return certify(top).map(|upper| (upper, x));
        }
        previous = top;
        beta.push(b);
        basis.push(w.into_iter().map(|a| a / b).collect());
    }
}

fn positive_definite(s: &CscMatrix, sym: &Rc<SymbolicCholesky>, scale: f64, shift: f64) -> bool {
    let mut a = s.clone();
    for j in 0..a.n {
        for p in a.col_ptr[j]..a.col_ptr[j + 1] {
            a.values[p] *= scale;
            if a.row_idx[p] == j { a.values[p] += shift; }
        }
    }
    numeric_cholesky(sym, &a).is_some()
}

const CERTIFY: f64 = 1e-3;
const WIDEN: i32 = 11;

fn certified_top(s: &CscMatrix, sym: &Rc<SymbolicCholesky>, estimate: f64) -> Option<f64> {
    (0..WIDEN).map(|t| (1.0 + CERTIFY) * estimate * 2f64.powi(t))
        .find(|&upper| upper.is_finite() && upper > 0.0 && positive_definite(s, sym, -1.0, upper))
}

const FAST_WIDENINGS: [f64; 3] = [1.0, 1e2, 1e4];
const ESTIMATE_SLACK: f64 = 8.0;

fn fast_sparse_bound(s: &CscMatrix, sym: &Rc<SymbolicCholesky>, anisotropy: f64, amplification: f64) -> Option<f64> {
    let mut rows = vec![0.0; s.n];
    for j in 0..s.n {
        for p in s.col_ptr[j]..s.col_ptr[j + 1] {
            let i = s.row_idx[p];
            rows[i] += s.values[p].abs();
            if i != j { rows[j] += s.values[p].abs(); }
        }
    }
    let upper = (1.0 + CERTIFY) * rows.into_iter().fold(0.0f64, f64::max);
    if !upper.is_finite() { return None; }
    let mut below_upper = None;
    for widening in FAST_WIDENINGS {
        let lower = upper / (RESOLVABLE.sqrt() * widening);
        let kappa = upper / lower;
        let slack = if widening > 1.0 { ESTIMATE_SLACK } else { 1.0 };
        if lower <= 0.0 || !kappa.is_finite() || slack * kappa * anisotropy > RESOLVABLE || slack * kappa * amplification > RESOLVABLE {
            return None;
        }
        if !*below_upper.get_or_insert_with(|| positive_definite(s, sym, -1.0, upper)) { return None; }
        if positive_definite(s, sym, 1.0, -lower) { return Some(kappa); }
    }
    None
}

fn spectrum(s: &CscMatrix, anisotropy: f64, amplification: f64, symbolic: Option<&Rc<SymbolicCholesky>>) -> (f64, Option<Vec<f64>>, bool) {
    let m = s.n;
    if m <= FULL_SPECTRUM {
        let dense = s.to_dense_symmetric();
        let decomposition = jacobi_spectrum(&dense, m, EigenbasisMode::Deferred);
        let mu = &decomposition.values;
        let indefinite = -mu[0] > ROUNDING * m as f64 * f64::EPSILON * anisotropy * mu[m - 1].abs();
        let kappa = if mu[0].is_nan() || mu[0] <= 0.0 { f64::INFINITY } else { mu[m - 1] / mu[0] };
        if !indefinite && kappa * amplification <= RESOLVABLE
            && (kappa * anisotropy <= RESOLVABLE || (kappa <= RESOLVABLE && anisotropy <= MAX_ANISOTROPY)) {
            return (kappa, None, false);
        }
        let x = decomposition.deferred.unwrap().first_mode();
        return (kappa, Some(x), indefinite);
    }
    let sym = symbolic.cloned().unwrap_or_else(|| Rc::new(symbolic_cholesky(s)));
    let Some(factor) = numeric_cholesky(&sym, s) else { return (f64::INFINITY, None, false) };
    let mut mode = None;
    for seed in 1..=3 {
        let Some((inverse_top, x)) = lanczos_top(&|v| sparse_cholesky_solve(&factor, v), m, seed, &|top| {
            (0..WIDEN).map(|t| (1.0 - CERTIFY) / top / 2f64.powi(t))
                .find(|&lower| lower > 0.0 && positive_definite(s, &sym, 1.0, -lower)).map(|lower| 1.0 / lower)
        }) else { continue };
        mode = Some(x);
        let Some((lmax, _)) = lanczos_top(&|v| s.sym_mat_vec(v), m, seed, &|top| certified_top(s, &sym, top)) else { continue };
        if !(inverse_top.is_finite() && inverse_top > 0.0 && lmax > 0.0) { continue; }
        return (lmax * inverse_top, mode, false);
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

struct ProjectedRounding {
    retained: Vec<f64>,
    dropped: f64,
}

impl ProjectedRounding {
    fn new(bound: &CscMatrix, columns: &[Column], free: &[FreeDirection], own: &[(f64, f64, usize)], groups: &[((usize, DofKind), Vec<usize>)], group_of: &[(usize, usize)]) -> Option<Self> {
        if bound.values.iter().any(|x| !x.is_finite()) { return None; }
        let mut weights: Vec<Column> = columns.iter().map(|c| Column { group: c.group, w: c.w.iter().map(|v| v.abs()).collect() }).collect();
        for (f, &(_, top, _)) in free.iter().zip(own) {
            if top == 0.0 {
                let mut u = vec![0.0; bound.n];
                for (&d, &v) in f.dofs.iter().zip(&f.direction) { u[d] = v.abs(); }
                if bound.sym_mat_vec(&u).iter().any(|&x| x != 0.0) { return None; }
            } else {
                weights.push(Column { group: group_of[f.dofs[0]].0, w: f.direction.iter().map(|v| v.abs() / top.sqrt()).collect() });
            }
        }
        let projected = scaled(bound, groups, group_of, &weights);
        if projected.values.iter().any(|x| !x.is_finite()) { return None; }
        let mut terms = vec![0usize; weights.len()];
        for j in 0..projected.n {
            for p in projected.col_ptr[j]..projected.col_ptr[j+1] {
                let i = projected.row_idx[p];
                terms[i] += 1;
                if i != j { terms[j] += 1; }
            }
        }
        let envelope: Vec<_> = projected.sym_mat_vec(&vec![1.0; weights.len()]).into_iter().zip(terms).map(|(v, count)| v * (1.0 + ROUNDING * count as f64 * f64::EPSILON)).collect();
        if envelope.iter().any(|v| !v.is_finite()) { return None; }
        let dropped = envelope[columns.len()..].iter().copied().fold(0.0, f64::max);
        Some(Self { retained: envelope[..columns.len()].to_vec(), dropped })
    }

    fn resolved(&self, s: &CscMatrix, symbolic: &Rc<SymbolicCholesky>) -> bool {
        if self.dropped > RESOLVABLE { return false; }
        let mut shifted = s.clone();
        for j in 0..s.n {
            let Some(p) = (shifted.col_ptr[j]..shifted.col_ptr[j+1]).find(|&p| shifted.row_idx[p]==j) else { return false; };
            shifted.values[p] -= self.retained[j] / RESOLVABLE;
        }
        numeric_cholesky(symbolic, &shifted).is_some()
    }
}

pub(crate) fn analyze_excluding(
    k: &CscMatrix, tags: &[DofTag], moves: &[Vec<(usize, f64)>],
    coupling: &[(usize, usize)], rounding: Option<&CscMatrix>, releases: &ReleasedRotations,
    inactive: &[usize], support_magnitude: Option<&CscMatrix>,
) -> Stability {
    if inactive.is_empty() { return analyze_with_magnitudes(k, tags, moves, coupling, rounding, support_magnitude, releases); }
    let mut excluded = vec![false; k.n];
    for &i in inactive { excluded[i] = true; }
    let kept: Vec<_> = (0..k.n).filter(|&i| !excluded[i]).collect();
    let mut map = vec![None; k.n];
    for (j, &i) in kept.iter().enumerate() { map[i] = Some(j); }
    let rows = map.iter().map(|j| j.map_or_else(Vec::new, |j| vec![(j, 1.0)])).collect();
    let selection = super::constraints::SparseTransform::from_rows(k.n, kept.len(), rows);
    let matrix = selection.reduce_sparse(k);
    let bound = rounding.map(|r| selection.reduce_sparse(r));
    let support_magnitude = support_magnitude.map(|r| selection.reduce_sparse(r));
    let tags: Vec<_> = kept.iter().map(|&i| tags[i]).collect();
    let moves: Vec<_> = if moves.is_empty() { Vec::new() } else { kept.iter().map(|&i| moves[i].clone()).collect() };
    let coupling: Vec<_> = coupling.iter().filter_map(|&(i, j)| Some((map.get(i).copied().flatten()?, map.get(j).copied().flatten()?))).collect();
    let remap = |row: &Vec<(usize, f64)>| row.iter().filter_map(|&(i, v)| map.get(i).copied().flatten().map(|j| (j, v))).collect();
    let releases = ReleasedRotations {
        rows: releases.rows.iter().map(remap).collect(), nodes: releases.nodes.clone(),
        directions: releases.directions.iter().map(|(node,row)| (*node,row.iter().filter_map(|&(i,v,e)|map.get(i).copied().flatten().map(|j|(j,v,e))).collect())).collect(),
    };
    let mut result = analyze_with_magnitudes(&matrix, &tags, &moves, &coupling, bound.as_ref(), support_magnitude.as_ref(), &releases);
    for f in &mut result.free {
        for d in &mut f.dofs { *d = kept[*d]; }
        for (d, _) in &mut f.coupling { *d = kept[*d]; }
    }
    result
}

pub(crate) fn analyze_free_stiffness(
    k: &CscMatrix,
    dof: &DofNumbering,
    two_d: bool,
    constraints: Option<&super::constraints::FreeConstraintSystem>,
    kinematics: &ElasticKinematics,
    releases: &ReleasedRotations,
    support_magnitude: Option<&CscMatrix>,
) -> (CscMatrix, Stability) {
    analyze_free_stiffness_excluding(k, dof, two_d, constraints, kinematics, releases, &[], support_magnitude)
}

pub(crate) fn analyze_free_stiffness_excluding(
    k: &CscMatrix,
    dof: &DofNumbering,
    two_d: bool,
    constraints: Option<&super::constraints::FreeConstraintSystem>,
    kinematics: &ElasticKinematics,
    releases: &ReleasedRotations,
    inactive: &[usize],
    support_magnitude: Option<&CscMatrix>,
) -> (CscMatrix, Stability) {
    let reduced = constraints.map_or_else(|| k.clone(), |c| c.reduce_matrix_sparse(k));
    let stability = classify_free_stiffness(
        k, &reduced, dof, two_d, constraints, kinematics, releases, inactive, support_magnitude, &[],
    );
    (reduced, stability)
}

fn structural_mechanism(
    kinematics: &ElasticKinematics,
    constraints: Option<&super::constraints::FreeConstraintSystem>,
    inactive: &[usize],
    supplemental_dofs: &[bool],
) -> Option<Stability> {
    let (node, reason) = match kinematics.structure.mechanism(constraints, inactive, supplemental_dofs)? {
        MechanismWitness::AxialJoint(node) => (node, Reason::AxialMechanism),
        MechanismWitness::FrameSwing(node) => (node, Reason::FrameMechanism),
    };
    Some(Stability {
        verdict: Verdict::Mechanism, reason,
        kappa: f64::INFINITY, anisotropy: 1.0, free: Vec::new(), mode_nodes: vec![node],
    })
}

pub(super) fn classify_free_stiffness(
    physical: &CscMatrix,
    reduced: &CscMatrix,
    dof: &DofNumbering,
    two_d: bool,
    constraints: Option<&super::constraints::FreeConstraintSystem>,
    kinematics: &ElasticKinematics,
    releases: &ReleasedRotations,
    inactive: &[usize],
    support_magnitude: Option<&CscMatrix>,
    supplemental_dofs: &[bool],
) -> Stability {
    if assumed() {
        return Stability::stable();
    }
    if let Some(proof) = structural_mechanism(kinematics, constraints, inactive, supplemental_dofs) {
        return proof;
    }
    if let Some(c) = constraints {
        c.stability_excluding(reduced, dof, physical, &kinematics.coupling, releases, inactive, support_magnitude)
    } else {
        let mut free_tags = tags(dof, two_d);
        free_tags.truncate(dof.n_free);
        analyze_excluding(physical, &free_tags, &[], &kinematics.coupling, None, releases, inactive, support_magnitude)
    }
}

pub(crate) fn prepare_free_stiffness(
    k: &CscMatrix,
    dof: &DofNumbering,
    two_d: bool,
    constraints: Option<&super::constraints::FreeConstraintSystem>,
    kinematics: &ElasticKinematics,
    releases: &ReleasedRotations,
    support_magnitude: Option<&CscMatrix>,
) -> Result<(CscMatrix, Stability), String> {
    let (reduced, stability) = analyze_free_stiffness(k, dof, two_d, constraints, kinematics, releases, support_magnitude);
    if let Some(refusal) = stability.refusal() { return Err(refusal); }
    Ok((stability.pin_sparse(&reduced), stability))
}

pub(super) fn dense_free_block(k: &[f64], dof: &DofNumbering) -> CscMatrix {
    let nf = dof.n_free;
    let (mut rows, mut cols, mut values) = (Vec::new(), Vec::new(), Vec::new());
    for j in 0..nf {
        for i in j..nf {
            let value = 0.5 * k[i * dof.n_total + j] + 0.5 * k[j * dof.n_total + i];
            if value != 0.0 { rows.push(i); cols.push(j); values.push(value); }
        }
    }
    CscMatrix::from_triplets(nf, &rows, &cols, &values)
}

fn isolated_release_nodes(input: &SolverInput3D, dof: &DofNumbering, releases: &ReleasedRotations) -> std::collections::BTreeSet<usize> {
    if releases.nodes.is_empty() {
        return Default::default();
    }
    let mut ends = BTreeMap::<_, usize>::new();
    for member in input.elements.values().filter(|e| !matches!(e.elem_type.as_str(), "truss" | "cable")) {
        for node in [member.node_i, member.node_j] {
            *ends.entry(node).or_default() += 1;
        }
    }
    let rotational_springs: std::collections::BTreeSet<_> = input.supports.values()
        .filter(|support| super::support::support_dofs_3d(support)[3..6].iter()
            .any(|setting| setting.spring.is_some_and(|value| value != 0.0)))
        .map(|support| support.node_id)
        .collect();
    releases.nodes.iter().copied().filter(|node| {
        ends.get(node) == Some(&1)
            && !rotational_springs.contains(node)
            && (3..6).all(|axis| dof.global_dof(*node, axis).is_some_and(|g| g < dof.n_free))
    }).collect()
}

pub(super) struct OperatorRank<'a> {
    dof: &'a DofNumbering,
    two_d: bool,
    constraints: Option<&'a super::constraints::FreeConstraintSystem>,
    kinematics: ElasticKinematics,
    releases: ReleasedRotations,
    isolated_release_nodes: std::collections::BTreeSet<usize>,
}

impl<'a> OperatorRank<'a> {
    pub(super) fn for_2d(
        input: &SolverInput, dof: &'a DofNumbering,
        constraints: Option<&'a super::constraints::FreeConstraintSystem>,
    ) -> Self {
        Self { dof, two_d: true, constraints, kinematics: elastic_kinematics_2d(input, dof), releases: ReleasedRotations::default(), isolated_release_nodes: Default::default() }
    }

    pub(super) fn for_3d(
        input: &SolverInput3D, dof: &'a DofNumbering,
        constraints: Option<&'a super::constraints::FreeConstraintSystem>,
    ) -> Self {
        let releases = released_rotations_3d(input, dof);
        let isolated_release_nodes = isolated_release_nodes(input, dof, &releases);
        Self { dof, two_d: false, constraints, kinematics: elastic_kinematics_3d(input, dof), releases, isolated_release_nodes }
    }

    fn classify(
        &self,
        free: &CscMatrix,
        reduced: Option<&CscMatrix>,
        support_magnitude: Option<&CscMatrix>,
        supplemental_dofs: &[bool],
    ) -> Stability {
        let projected;
        let reduced = match (self.constraints, reduced) {
            (_, Some(reduced)) => reduced,
            (Some(constraints), None) => {
                projected = constraints.reduce_matrix_sparse(free);
                &projected
            }
            (None, None) => free,
        };
        classify_free_stiffness(
            free, reduced, self.dof, self.two_d, self.constraints, &self.kinematics,
            &self.releases, &[], support_magnitude, supplemental_dofs,
        )
    }

    pub(super) fn require_resolved(&self, free: &CscMatrix, reduced: Option<&CscMatrix>, support_magnitude: Option<&CscMatrix>) -> Result<(), String> {
        let result = self.classify(free, reduced, support_magnitude, &[]);
        match result.refusal() {
            Some(error) if !matches!(result.reason, Reason::OperatorRounding | Reason::AxialMechanism | Reason::FrameMechanism) => Err(crate::refusal::coded(DiagnosticCode::ReducedStiffnessRank, &error)),
            Some(error) => Err(error),
            None => Ok(()),
        }
    }

    pub(super) fn isolated_release_gauges(&self, physical: &CscMatrix) -> ReleaseGauges {
        if self.isolated_release_nodes.is_empty() {
            return ReleaseGauges(Vec::new());
        }
        let diagonal = physical.diagonal();
        let directions = self.releases.directions.iter().filter_map(|(node, axis)| {
            if !self.isolated_release_nodes.contains(node)
                || axis.iter().any(|&(_, value, error)| !value.is_finite() || !error.is_finite())
            {
                return None;
            }
            let scale = axis.iter().fold(0.0_f64, |scale, &(i, _, _)| scale.max(diagonal[i].abs()));
            let scale = if scale > 0.0 { scale } else { 1.0 };
            let dofs = axis.iter().map(|&(i, _, _)| i).collect::<Vec<_>>();
            if let Some(cs) = self.constraints {
                for &row in &dofs {
                    cs.exact_identity_column(row)?;
                }
            }
            Some(FreeDirection {
                node: *node,
                kind: DofKind::Rotation,
                moves_translation: false,
                dofs,
                direction: axis.iter().map(|&(_, value, _)| value).collect(),
                direction_rounding: axis.iter().map(|&(_, _, error)| error).collect(),
                scale,
                coupling: Vec::new(),
            })
        }).collect();
        ReleaseGauges(directions)
    }

    pub(super) fn massless_release_gauges(
        &self,
        physical: &CscMatrix,
        mass_range: &super::modal_mass::MassRange,
    ) -> ReleaseGauges {
        let ReleaseGauges(mut gauges) = self.isolated_release_gauges(physical);
        gauges.retain_mut(|direction| {
            if let Some(cs) = self.constraints {
                for dof in &mut direction.dofs {
                    let Some(index) = cs.exact_identity_column(*dof) else {
                        return false;
                    };
                    *dof = index;
                }
            }
            mass_range.coordinates_are_massless(&direction.dofs)
        });
        ReleaseGauges(gauges)
    }

    pub(super) fn check_structure(&self) -> Result<(), String> {
        if !assumed() {
            if let Some(refusal) = structural_mechanism(&self.kinematics, self.constraints, &[], &[])
                .and_then(|proof| proof.refusal())
            {
                return Err(refusal);
            }
        }
        Ok(())
    }

    pub(super) fn check_rounding(&self, free: &CscMatrix, reduced: Option<&CscMatrix>, support_magnitude: Option<&CscMatrix>) -> Result<(), String> {
        let result = self.classify(free, reduced, support_magnitude, &[]);
        result.rank_refusal().map_or(Ok(()), Err)
    }

    pub(super) fn check_free_rounding(&self, free: &CscMatrix, magnitude: Option<&CscMatrix>) -> Result<(), String> {
        let reduced = self.constraints.map(|cs| cs.reduce_matrix_sparse(free));
        self.check_rounding(free, reduced.as_ref(), magnitude)
    }

    pub(super) fn check_secant(
        &self, free: &CscMatrix, reduced: Option<&CscMatrix>, magnitude: &CscMatrix,
        soil_magnitude: &CscMatrix,
    ) -> Result<(), String> {
        let soil_dofs: Vec<_> = soil_magnitude.diagonal().iter().map(|&value| value != 0.0).collect();
        if let Some(refusal) = self.classify(free, reduced, Some(magnitude), &soil_dofs).rank_refusal() {
            return Err(refusal);
        }
        let reduced_magnitude = self.constraints.map(|cs| cs.reduce_stiffness_magnitude(magnitude));
        let physical = reduced.unwrap_or(free);
        let envelope = reduced_magnitude.as_ref().unwrap_or(magnitude);
        self.check_physical_tangent(physical, envelope, None, &self.releases)
    }

    pub(super) fn check_tangent(
        &self, free: &CscMatrix, magnitude: &CscMatrix, accumulation_error: &CscMatrix,
        active_releases: Option<&ReleasedRotations>,
    ) -> Result<(), String> {
        let reduced = self.constraints.map(|cs| cs.reduce_matrix_sparse(free));
        let reduced_magnitude = self.constraints.map(|cs| cs.reduce_stiffness_magnitude(magnitude));
        let k = reduced.as_ref().unwrap_or(free);
        let magnitude = reduced_magnitude.as_ref().unwrap_or(magnitude);
        let reduced_error = self.constraints.map(|cs| cs.reduce_stiffness_roundoff(accumulation_error));
        let error = reduced_error.as_ref().unwrap_or(accumulation_error);
        self.check_physical_tangent(k, magnitude, Some(error), active_releases.unwrap_or(&self.releases))
    }

    fn check_physical_tangent(
        &self, k: &CscMatrix, magnitude: &CscMatrix, accumulation_error: Option<&CscMatrix>,
        releases: &ReleasedRotations,
    ) -> Result<(), String> {
        if tangent_has_resolved_rank(k, magnitude, accumulation_error) { return Ok(()); }
        if k.values.iter().chain(&magnitude.values).any(|value| !value.is_finite()) {
            return Err(operator_rounding_refusal());
        }

        let kept = self.tangent_coordinates(k, magnitude, releases);
        if kept.len() < k.n
            && tangent_has_resolved_rank(
                &k.extract_principal_submatrix(&kept),
                &magnitude.extract_principal_submatrix(&kept),
                accumulation_error.map(|bound| bound.extract_principal_submatrix(&kept)).as_ref(),
            )
        {
            return Ok(());
        }
        Err(operator_rounding_refusal())
    }

    fn tangent_coordinates(
        &self, k: &CscMatrix, magnitude: &CscMatrix, releases: &ReleasedRotations,
    ) -> Vec<usize> {
        let tags = tags(self.dof, self.two_d);
        let reduced_tags = self.constraints.map(|cs| {
            cs.independent_dofs().iter().map(|&d| tags[d]).collect::<Vec<_>>()
        });
        let solve_tags = reduced_tags.as_deref().unwrap_or(&tags[..k.n]);
        let projected = self.constraints.map(|cs| releases.project(&cs.c_ff));
        let releases = projected.as_ref().unwrap_or(releases);
        let translates = |direction: &[f64]| {
            let physical = self.constraints.map(|cs| cs.c_ff.mul_vec(direction));
            physical.as_deref().unwrap_or(direction).iter().zip(&tags)
                .any(|(&component, tag)| tag.kind == DofKind::Translation && component != 0.0)
        };

        let absolute = absolute_stiffness(k);
        let ones = vec![1.0; k.n];
        let row_scale = magnitude.sym_mat_vec(&ones);
        let row_entries = absolute.sym_mat_vec(&ones);
        let mut excluded = vec![false; k.n];
        let mut direction = vec![0.0; k.n];
        let mut groups = BTreeMap::<usize, Vec<usize>>::new();
        for (d, tag) in solve_tags.iter().enumerate() {
            if tag.kind == DofKind::Translation { continue; }
            if row_scale[d] == 0.0 && row_entries[d] == 0.0 {
                direction[d] = 1.0;
                excluded[d] = !translates(&direction);
                direction[d] = 0.0;
            }
            if tag.kind == DofKind::Rotation && releases.nodes.contains(&tag.node) {
                groups.entry(tag.node).or_default().push(d);
            }
        }

        let mut pivots = BTreeMap::<usize, Vec<(usize, ReleasedVector)>>::new();
        for (node, source) in &releases.directions {
            let Some(dofs) = groups.get(node) else { continue; };
            if source.iter().any(|&(d, value, _)| value != 0.0 && !dofs.contains(&d)) {
                continue;
            }
            let mut candidate = ReleasedVector::zero(dofs.len());
            for (i, &d) in dofs.iter().enumerate() {
                if let Some(&(_, value, rounding)) = source.iter().find(|&&(slot, _, _)| slot == d) {
                    candidate.values[i] = value;
                    candidate.rounding[i] = rounding;
                }
                direction[d] = candidate.values[i];
            }
            let admissible = !translates(&direction)
                && releases.permits(*node, dofs, &candidate.values)
                && is_null_action(k, &absolute, &direction, dofs.len());
            for &d in dofs { direction[d] = 0.0; }
            if !admissible { continue; }

            let basis = pivots.entry(*node).or_default();
            for (pivot, previous) in basis.iter() {
                candidate.add_scaled(previous, -candidate.values[*pivot] / previous.values[*pivot]);
            }
            let Some((pivot, _)) = candidate.values.iter().enumerate()
                .filter(|&(i, value)| !excluded[dofs[i]] && value.abs() > candidate.rounding[i])
                .max_by(|a, b| a.1.abs().total_cmp(&b.1.abs()))
            else { continue; };
            excluded[dofs[pivot]] = true;
            basis.push((pivot, candidate));
        }
        (0..k.n).filter(|&d| !excluded[d]).collect()
    }

}

pub fn of_2d(input: &SolverInput) -> Result<Stability, String> {
    let dof = DofNumbering::build_2d(input);
    let (asm, support_magnitude) = crate::solver::assembly::without_artificial_stiffness(|| crate::solver::assembly::assemble_2d_with_magnitude(input, &dof));
    let fcs = crate::solver::constraints::FreeConstraintSystem::build_2d(input, &dof)?;
    Ok(analyze_free_stiffness(&dense_free_block(&asm.k, &dof), &dof, true, fcs.as_ref(), &elastic_kinematics_2d(input, &dof), &ReleasedRotations::default(), support_magnitude.as_ref()).1)
}

pub fn of_3d(input: &SolverInput3D) -> Result<Stability, String> {
    let input = &crate::solver::linear::expand_curved_beams_3d(input);
    let dof = DofNumbering::build_3d(input);
    let (asm, support_magnitude) = crate::solver::assembly::without_artificial_stiffness(|| crate::solver::assembly::assemble_3d_with_magnitude(input, &dof));
    let fcs = crate::solver::constraints::FreeConstraintSystem::build_3d(input, &dof)?;
    Ok(analyze_free_stiffness(&dense_free_block(&asm.k, &dof), &dof, false, fcs.as_ref(), &elastic_kinematics_3d(input, &dof), &released_rotations_3d(input, &dof), support_magnitude.as_ref()).1)
}

#[cfg(test)]
mod tests {
    thread_local! {
        pub(super) static PROJECT_ROWS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
        pub(super) static LANCZOS_RUNS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
        pub(super) static IDENTITY_ROTATIONS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
        pub(super) static EIGENVALUE_DECOMPOSITIONS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
        pub(super) static EIGENVECTOR_ROTATIONS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
    }
    use super::*;

    #[test]
    fn signed_tangent_excludes_a_verified_release_gauge_before_testing_inertia() {
        let dof = DofNumbering {
            map: [((1, 3), 0), ((1, 4), 1), ((2, 0), 2)].into(),
            n_free: 3,
            n_total: 3,
            dofs_per_node: 6,
            node_order: vec![1, 2],
        };
        for (signed, resolved) in [(-1.0, true), (1.0, true), (0.0, false)] {
            let k = CscMatrix::from_dense_symmetric_exact(&[
                1.0, -1.0, 0.0,
                -1.0, 1.0, 0.0,
                0.0, 0.0, signed,
            ], 3);
            let rank = OperatorRank {
                dof: &dof,
                two_d: false,
                constraints: None,
                kinematics: ElasticKinematics { coupling: vec![(0, 1)], ..Default::default() },
                isolated_release_nodes: Default::default(),
                releases: ReleasedRotations {
                    rows: vec![vec![(0, 1.0), (1, -1.0)], vec![(2, 1.0)]],
                    nodes: [1].into(),
                    directions: vec![(1, vec![(0, 1.0, 0.0), (1, 1.0, 0.0)])],
                },
            };
            let error = CscMatrix::from_triplets(k.n, &[], &[], &[]);
            assert!(rank.check_tangent(&k, &absolute_stiffness(&k), &error, Some(&ReleasedRotations::default())).is_err());
            assert_eq!(rank.check_tangent(&k, &absolute_stiffness(&k), &error, None).is_ok(), resolved, "{signed}");
        }
    }

    #[test]
    fn signed_tangent_rank_survives_a_small_positive_diagonal() {
        for (last, resolved) in [(1.0, true), (0.0, false)] {
            let k = CscMatrix::from_dense_symmetric_exact(&[
                1e-40, 1.0, 1.0,
                1.0, last, 0.0,
                1.0, 0.0, last,
            ], 3);
            assert_eq!(tangent_has_resolved_rank(&k, &absolute_stiffness(&k), None), resolved);
        }
    }

    #[test]
    fn sparse_release_projection_visits_only_touched_columns() {
        let n = 512;
        let c = crate::solver::constraints::SparseTransform::from_rows(n, n, (0..n).map(|i| vec![(i, 1.0)]).collect());
        for count in [0, 1, 64] {
            let directions: Vec<_> = (0..count).map(|node| (node, vec![(3*node, 0.6, f64::EPSILON), (3*node+1, 0.8, f64::EPSILON), (3*node+2, 0.0, 0.0)])).collect();
            let releases = ReleasedRotations { rows: vec![], nodes: (0..count).collect(), directions: directions.clone() };
            PROJECT_ROWS.with(|visits| visits.set(0));
            let result = releases.project(&c);
            for (actual, expected) in result.directions.iter().zip(&directions) {
                assert_eq!(actual.0, expected.0);
                assert_eq!(actual.1, expected.1[..2]);
            }
            assert_eq!(result.directions.len(), count);
            let visits = PROJECT_ROWS.with(|visits| visits.get());
            assert!(visits <= n + 3*count, "{count} sparse directions visited {visits} rows");
        }
    }

    #[test]
    fn sparse_release_projection_preserves_dense_compatibility_and_error_bounds() {
        use crate::solver::constraints::SparseTransform;
        for transform in [
            vec![vec![(0, 1.0)], vec![(1, 1.0)], vec![(2, 1.0)], vec![(3, 1.0)]],
            vec![vec![(0, 1.0)], vec![(0, 1.0)], vec![(1, 1.0)], vec![]],
            vec![vec![(0, 1.0)], vec![(1, 1.0)], vec![(2, 1.0)], vec![]],
            vec![vec![(0, 1.0)], vec![(1, 1.0)], vec![(2, 1.0)], vec![(3, 1.0_f64.next_down())]],
            vec![vec![(0, 1.0)], vec![(1, 1.0)], vec![(2, 1.0)], vec![(3, 1.0_f64.next_up())]],
            vec![vec![(0, 1.0)], vec![(1, 1.0)], vec![(2, 1.0)], vec![(2, 0.5), (3, 0.5)]],
        ] {
            let c = SparseTransform::from_rows(4, 4, transform);
            for source in [
                vec![],
                vec![(0, 1.0, f64::EPSILON)],
                vec![(0, 1.0, f64::EPSILON), (1, 1.0, 2.0*f64::EPSILON)],
                vec![(0, 1.0, f64::EPSILON), (1, 1.0_f64.next_up(), f64::EPSILON)],
                vec![(0, 0.0, f64::EPSILON)],
                vec![(3, 1.0, 0.0)],
                vec![(3, 0.0, f64::EPSILON)],
            ] {
                let dense = || {
                    let mut projected: BTreeMap<usize, (f64, f64)> = BTreeMap::new();
                    for i in 0..c.n_rows {
                        let (value, error) = source.iter().find(|(d, _, _)| *d == i).map_or((0.0, 0.0), |(_, x, e)| (*x, *e));
                        let span = c.row_ptr[i]..c.row_ptr[i + 1];
                        if span.is_empty() {
                            if value != 0.0 { return None; }
                        } else if span.len() == 1 && c.vals[span.start] == 1.0 {
                            let j = c.col_idx[span.start];
                            if let Some((previous, bound)) = projected.get_mut(&j) {
                                if *previous != value { return None; }
                                *bound = bound.max(error);
                            } else { projected.insert(j, (value, error)); }
                        } else { return None; }
                    }
                    Some(projected.into_iter().filter_map(|(j, (x, e))| (x != 0.0 || e != 0.0).then_some((j, x, e))).collect::<Vec<_>>())
                };
                let expected = dense();
                let releases = ReleasedRotations { rows: vec![vec![(0, 1.0)]], nodes: [1].into(), directions: vec![(1, source)] };
                let actual = releases.project(&c);
                assert_eq!(actual.directions.first().map(|(_, v)| v.clone()), expected);
                assert_eq!(actual.nodes, releases.nodes);
                assert_eq!(actual.rows, vec![vec![(0, 1.0)]]);
            }
        }
    }

    #[test]
    fn near_parallel_released_candidates_do_not_hide_genuine_work() {
        for error in [1.0_f64.next_down(),1.0,1.0_f64.next_up(),f64::INFINITY] {
            let candidate = ReleasedVector {values:vec![1.0,0.0],rounding:vec![0.0,error]};
            assert_eq!(candidate.normalized().is_some(),error<1.0);
        }
        let residual = ReleasedVector {values:vec![1e-13,0.0],rounding:vec![f64::EPSILON,0.0]}.normalized().unwrap();
        assert!(residual.rounding[0]>=f64::EPSILON/1e-13);
        let (ex, ey, ez) = crate::element::compute_local_axes_3d(0.0,0.0,0.0,3.0,4.0,2.0,None,None,None,None,false);
        let bounds = super::super::load_work::frame_rounding(&[ex,ey,ez]);
        for angle in [0.0, 1e-16, 1e-13, 1e-8] {
            let (_, y, z) = crate::element::compute_local_axes_3d(0.0,0.0,0.0,3.0,4.0,2.0,None,None,None,Some(angle),false);
            let other = super::super::load_work::frame_rounding(&[ex,y,z]);
            let releases = ReleasedRotations {
                rows: vec![ex.into_iter().enumerate().collect()],
                nodes: [1].into_iter().collect(),
                directions: [(ey,bounds[1]),(y,other[1]),(ez,bounds[2]),(z,other[2])].into_iter().map(|(v,e)|(1,(0..3).map(|i|(i,v[i],e[i])).collect())).collect(),
            };
            let v: Vec<_> = (0..3).map(|i|0.8*ey[i]+0.6*ez[i]).collect();
            let direction = releases.canonical(1,&[0,1,2],&v,2,ROUNDING*3.0*f64::EPSILON).unwrap_or_else(||panic!("angle {angle}"));
            for moment in [0.0,-f64::EPSILON.sqrt(),f64::EPSILON.sqrt()] {
                let mut work = super::super::load_work::Work::default();
                for i in 0..3 {work.product(direction.values[i],direction.rounding[i],ex[i]+moment*v[i],0.0);}
                assert_eq!(work.contains_zero(),moment==0.0,"{angle}/{moment}: {} +/- {}",work.value,work.bound());
            }
        }
    }

    #[test]
    fn translational_rank_requires_stiffness_above_eigenvalue_rounding() {
        for n in [2, 3] {
            let tags = vec![DofTag { node: 3, kind: DofKind::Translation }; n];
            for factor in [0.0, 0.5, 2.0] {
                let gap = factor * ROUNDING * 2.0 * f64::EPSILON * 2.0;
                let mut k = vec![0.0; n * n];
                k[0] = 1.0;
                k[1] = 1.0 - gap;
                k[n] = 1.0 - gap;
                k[n + 1] = 1.0;
                if n == 3 { k[8] = 1.0; }
                let result = analyze_dense(&k, n, &tags);
                assert_eq!(result.reason, if factor <= 0.5 { Reason::FreeTranslation } else { Reason::Conditioning }, "{n} {factor}: {result:?}");
                assert_eq!(result.mode_nodes, vec![3]);
            }
            for spring in [1e-30, 1.0, 1e20] {
                let mut k = vec![0.0; n * n];
                for i in 0..n { k[i * n + i] = spring; }
                assert!(analyze_dense(&k, n, &tags).is_stable());
            }
        }
    }

    fn negative_node_block(two_d: bool, diagonal: f64, off_diagonal: f64) -> Stability {
        let n = if two_d { 3 } else { 6 };
        let offset = if two_d { 0 } else { 3 };
        let numbering = DofNumbering {
            map: (0..n).map(|i| ((7, i), i)).collect(),
            n_free: n,
            n_total: n,
            dofs_per_node: n,
            node_order: vec![7],
        };
        let mut k = vec![0.0; n * n];
        for i in 0..n { k[i * n + i] = 1.0; }
        k[offset * n + offset] = diagonal;
        k[offset * n + offset + 1] = off_diagonal;
        k[(offset + 1) * n + offset] = off_diagonal;
        k[(offset + 1) * n + offset + 1] = -1.0;
        analyze_dense(&k, n, &tags(&numbering, two_d))
    }

    #[test]
    fn issue_1753_negative_node_diagonal_is_not_hidden_by_stiffness_contrast_2d() {
        let result = negative_node_block(true, 1e20, 1.0);
        assert_eq!(result.reason, Reason::Indefinite, "{result:?}");
        assert_eq!(result.verdict, Verdict::Singular);
        assert!(result.pins().is_empty());
    }

    #[test]
    fn issue_1753_negative_node_diagonal_is_not_hidden_by_stiffness_contrast_3d() {
        let result = negative_node_block(false, 1e20, 1.0);
        assert_eq!(result.reason, Reason::Indefinite, "{result:?}");
        assert_eq!(result.verdict, Verdict::Singular);
        assert!(result.pins().is_empty());
    }

    #[test]
    fn issue_1753_unresolved_negative_rotation_is_not_an_explicit_release() {
        let result = analyze_dense(&[1.0, 1.0 + f64::EPSILON, 1.0 + f64::EPSILON, 1.0], 2, &[DofTag { node: 7, kind: DofKind::Rotation }; 2]);
        assert_eq!(result.verdict, Verdict::Singular, "{result:?}");
        assert!(result.refusal().is_some());
        assert!(result.pins().is_empty());
    }

    fn negative_rotation_with_unrelated_release(n: usize) -> Stability {
        let mut k = vec![0.0; n * n];
        for i in 0..n { k[i * n + i] = 1.0; }
        k[1] = 1.0 + f64::EPSILON;
        k[n] = 1.0 + f64::EPSILON;
        let tags = vec![DofTag { node: 7, kind: DofKind::Rotation }; n];
        let releases = ReleasedRotations {
            rows: (1..n).map(|i| vec![(i, 1.0)]).collect(),
            nodes: [7].into_iter().collect(),
            directions: vec![(7, vec![(0, 1.0, 0.0)])],
        };
        assert!(releases.permits(7, &(0..n).collect::<Vec<_>>(), &{
            let mut axis = vec![0.0; n];
            axis[0] = 1.0;
            axis
        }));
        analyze_dense_with_coupling(&k, n, &tags, &[], &releases)
    }

    #[test]
    fn issue_1753_negative_rotation_not_spanned_by_release_2d() {
        let result = negative_rotation_with_unrelated_release(2);
        assert_eq!(result.verdict, Verdict::Singular, "{result:?}");
        assert!(result.refusal().is_some());
        assert!(result.pins().is_empty());
    }

    #[test]
    fn issue_1753_negative_rotation_not_spanned_by_release_3d() {
        let result = negative_rotation_with_unrelated_release(3);
        assert_eq!(result.verdict, Verdict::Singular, "{result:?}");
        assert!(result.refusal().is_some());
        assert!(result.pins().is_empty());
    }

    #[test]
    fn issue_1753_release_spanning_negative_mode_within_rounding_remains_permitted() {
        for n in [2, 3] {
            let mut k = vec![0.0; n * n];
            for i in 1..n { k[i * n + i] = 1.0; }
            k[1] = f64::EPSILON;
            k[n] = f64::EPSILON;
            let releases = ReleasedRotations {
                rows: (1..n).map(|i| vec![(i, 1.0)]).collect(),
                nodes: [7].into_iter().collect(),
                directions: vec![(7, vec![(0, 1.0, 0.0)])],
            };
            let tags = vec![DofTag { node: 7, kind: DofKind::Rotation }; n];
            let result = analyze_dense_with_coupling(&k, n, &tags, &[], &releases);
            assert_eq!(result.verdict, Verdict::Stable, "{n}: {result:?}");
            assert_eq!(result.free.len(), 1);
            assert_eq!(result.free[0].direction[0].abs(), 1.0);
            assert!(result.free[0].direction[1..].iter().all(|&v| v == 0.0));
        }
    }

    fn indirectly_loaded_unresolved_rotation(sparse: bool) {
        let epsilon = f64::EPSILON;
        let k = [
            1.0, 1.0, 0.5,
            1.0, 1.0 + epsilon, 0.5 + epsilon,
            0.5, 0.5 + epsilon, 1.0,
        ];
        let tags = [
            DofTag { node: 1, kind: DofKind::Rotation },
            DofTag { node: 1, kind: DofKind::Rotation },
            DofTag { node: 2, kind: DofKind::Translation },
        ];
        let matrix = CscMatrix::from_dense_symmetric(&k, 3);
        let result = if sparse { analyze(&matrix, &tags) } else { analyze_dense(&k, 3, &tags) };
        assert_eq!(result.verdict, Verdict::Stable, "{result:?}");
        assert_eq!(result.free.len(), 1);
        let load = [0.0, 0.0, 1.0];
        assert_eq!(result.load_on_free_rotation(&load), None);
        let mut pinned = if sparse { result.pin_sparse(&matrix).to_dense_symmetric() } else {
            let mut pinned = k.to_vec();
            result.pin_dense(&mut pinned, 3);
            pinned
        };
        let u = crate::linalg::cholesky::cholesky_solve(&mut pinned, &load, 3).unwrap();
        assert!(u.iter().all(|x| x.is_finite()));
        println!("sparse={sparse}: pinned response {u:?}, coupling {:?}", result.free[0].coupling);
        assert!(result.check_pins(&[0.0; 3], &[0.0; 3], &[0.0; 3]).is_ok());
        let error = result.check_pins(&u, &load, &[0.0; 3])
            .expect_err("the pin must not hide indirect loading of the unresolved rotation");
        assert!(error.contains("rotation at node 1"), "{error}");
        assert!(result.free[0].coupling.iter().any(|&(i, c)| i == 2 && c != 0.0));
    }

    #[test]
    fn issue_1931_dense_indirect_load_on_unresolved_rotation_is_refused() {
        indirectly_loaded_unresolved_rotation(false);
    }

    #[test]
    fn issue_1931_sparse_indirect_load_on_unresolved_rotation_is_refused() {
        indirectly_loaded_unresolved_rotation(true);
    }

    #[test]
    fn issue_1931_rounding_coupling_of_an_explicit_release_remains_permitted() {
        let k = [
            1.0, 1.0, 0.5,
            1.0, 1.0, 0.5 + f64::EPSILON,
            0.5, 0.5 + f64::EPSILON, 1.0,
        ];
        let tags = [
            DofTag { node: 1, kind: DofKind::Rotation },
            DofTag { node: 1, kind: DofKind::Rotation },
            DofTag { node: 2, kind: DofKind::Translation },
        ];
        let releases = ReleasedRotations {
            rows: vec![vec![(0, 1.0), (1, 1.0)], vec![(2, 1.0)]],
            nodes: [1].into_iter().collect(),
            directions: vec![(1, vec![(0, 1.0, 0.0), (1, -1.0, 0.0)])],
        };
        let result = analyze_dense_with_coupling(&k, 3, &tags, &[], &releases);
        assert_eq!(result.verdict, Verdict::Stable, "{result:?}");
        assert_eq!(result.free.len(), 1);
        assert!(releases.permits(1, &result.free[0].dofs, &result.free[0].direction));
        assert!(result.free[0].coupling.is_empty());
        let load = [0.0, 0.0, 1.0];
        let mut pinned = k.to_vec();
        result.pin_dense(&mut pinned, 3);
        let u = crate::linalg::cholesky::cholesky_solve(&mut pinned, &load, 3).unwrap();
        assert!(result.check_pins(&u, &load, &[0.0; 3]).is_ok());
    }

    #[test]
    fn issue_1753_stalled_ritz_values_do_not_underestimate_the_top_eigenvalue() {
        for m in [2, 80] {
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
            let (upper, _) = lanczos_top(&apply, m, seed, &|top| certified_top(&matrix, &Rc::new(symbolic_cholesky(&matrix)), top)).expect("a finite upper bound");
            assert_eq!(calls.get(), if m == 2 { 1 } else { 20 }, "exercise both breakdown and successive stalled estimates");
            assert!(upper >= exact_top, "stalled Ritz estimate {upper} is below the exact eigenvalue {exact_top}");
        }
    }

    #[test]
    fn issue_1753_an_exhausted_estimate_without_an_upper_certificate_is_refused() {
        let matrix = CscMatrix::from_triplets(2, &[0, 1, 1], &[0, 0, 1], &[2049.0, -2047.0, 2049.0]);
        let seed = 15_233_338_564_176_581_173;
        assert!(lanczos_top(&|x| matrix.sym_mat_vec(x), 2, seed, &|top| certified_top(&matrix, &Rc::new(symbolic_cholesky(&matrix)), top)).is_none());
    }
    #[test]
    fn issue_1958_identity_jacobi_rotations_do_no_matrix_work() {
        let tiny = f64::MIN_POSITIVE * f64::EPSILON * 16.0;
        let matrix = [1.0, tiny, 0.0, tiny, 2.0, 0.25, 0.0, 0.25, 3.0];
        for vectors in [false, true] {
            IDENTITY_ROTATIONS.with(|count| count.set(0));
            let (values, basis) = sym_eigen_small_impl(&matrix, 3, vectors);
            let radius = 0.5f64.hypot(0.25);
            for (got, exact) in values.iter().zip([1.0, 2.5 - radius, 2.5 + radius]) {
                assert!((got - exact).abs() <= ROUNDING * f64::EPSILON * exact.abs());
            }
            if vectors {
                for c in 0..3 {
                    for r in 0..3 {
                        let applied: f64 = (0..3).map(|k| matrix[r * 3 + k] * basis[k * 3 + c]).sum();
                        assert!((applied - values[c] * basis[r * 3 + c]).abs() <= ROUNDING * f64::EPSILON * values[c]);
                    }
                }
            } else {
                assert!(basis.is_empty());
            }
            assert_eq!(IDENTITY_ROTATIONS.with(|count| count.get()), 0);
        }
    }

    #[test]
    fn issue_2223_jacobi_preserves_parent_bits_for_dense_spectra() {
        fn parent(a: &[f64], n: usize, vectors: bool) -> (Vec<f64>, Vec<f64>) {
            let scale = a.iter().fold(0.0f64, |m, x| m.max(x.abs()));
            let scale = if scale > 0.0 && scale.is_finite() { scale } else { 1.0 };
            let mut m: Vec<f64> = a.iter().map(|x| x / scale).collect();
            let mut v = if vectors { vec![0.0; n * n] } else { Vec::new() };
            if vectors { for i in 0..n { v[i * n + i] = 1.0; } }
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
                        if t == 0.0 { continue; }
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
                        if vectors {
                            for k in 0..n {
                                let (vkp, vkq) = (v[k * n + p], v[k * n + q]);
                                v[k * n + p] = c * vkp - s * vkq;
                                v[k * n + q] = s * vkp + c * vkq;
                            }
                        }
                    }
                }
            }
            let mut order: Vec<usize> = (0..n).collect();
            order.sort_by(|&a, &b| m[a * n + a].total_cmp(&m[b * n + b]));
            let values = order.iter().map(|&i| m[i * n + i] * scale).collect();
            let mut eigenvectors = Vec::new();
            if vectors {
                eigenvectors.resize(n * n, 0.0);
                for (c, &i) in order.iter().enumerate() {
                    for r in 0..n { eigenvectors[r * n + c] = v[r * n + i]; }
                }
            }
            (values, eigenvectors)
        }
        for n in [1, 2, 3, 16, FULL_SPECTRUM] {
            for seed in [1u64, 31, 2223] {
                let mut state = seed;
                let mut dense = vec![0.0; n * n];
                for i in 0..n {
                    for j in 0..=i {
                        state = state.wrapping_mul(6364136223846793005).wrapping_add(1);
                        let value = ((state >> 32) as i32) as f64 / i32::MAX as f64;
                        dense[i * n + j] = value;
                        dense[j * n + i] = value;
                    }
                }
                for scale in [1e-200, 1.0, 1e200] {
                    let a: Vec<_> = dense.iter().map(|x| x * scale).collect();
                    let (expected_values, expected_vectors) = parent(&a, n, true);
                    for vectors in [false, true] {
                        let (values, basis) = sym_eigen_small_impl(&a, n, vectors);
                        assert_eq!(values.iter().map(|v| v.to_bits()).collect::<Vec<_>>(), expected_values.iter().map(|v| v.to_bits()).collect::<Vec<_>>());
                        if vectors {
                            assert_eq!(basis.iter().map(|v| v.to_bits()).collect::<Vec<_>>(), expected_vectors.iter().map(|v| v.to_bits()).collect::<Vec<_>>());
                        } else { assert!(basis.is_empty()); }
                    }
                    let result = jacobi_spectrum(&a, n, EigenbasisMode::Deferred);
                    assert_eq!(result.values.iter().map(|v| v.to_bits()).collect::<Vec<_>>(), expected_values.iter().map(|v| v.to_bits()).collect::<Vec<_>>());
                    assert_eq!(result.deferred.unwrap().first_mode().iter().map(|v| v.to_bits()).collect::<Vec<_>>(), (0..n).map(|r| expected_vectors[r * n].to_bits()).collect::<Vec<_>>());
                }
            }
        }
    }

    #[test]
    fn issue_2223_refused_spectrum_decomposes_stiffness_once() {
        for n in [3, 16, FULL_SPECTRUM] {
            for last in [-1.0, 0.0, 1.0 / (2.0 * RESOLVABLE), 2.0 / RESOLVABLE, 1.0] {
                let mut dense = vec![0.0; n * n];
                for i in 0..n { dense[i * n + i] = if i + 1 == n { last } else { 1.0 }; }
                dense[1] = 0.25;
                dense[n] = 0.25;
                let (values, vectors) = sym_eigen_small(&dense, n);
                let expected_kappa = if values[0] <= 0.0 { f64::INFINITY } else { values[n - 1] / values[0] };
                let matrix = CscMatrix::from_dense_symmetric(&dense, n);
                for (anisotropy, amplification) in [(1.0, 1.0), (RESOLVABLE, 1.0), (1.0, RESOLVABLE)] {
                    EIGENVALUE_DECOMPOSITIONS.with(|count| count.set(0));
                    let (kappa, mode, indefinite) = spectrum(&matrix, anisotropy, amplification, None);
                    assert_eq!(kappa.to_bits(), expected_kappa.to_bits());
                    let expected_indefinite = -values[0] > ROUNDING * n as f64 * f64::EPSILON * anisotropy * values[n - 1].abs();
                    assert_eq!(indefinite, expected_indefinite);
                    let accepted = !expected_indefinite && expected_kappa * amplification <= RESOLVABLE
                        && (expected_kappa * anisotropy <= RESOLVABLE || (expected_kappa <= RESOLVABLE && anisotropy <= MAX_ANISOTROPY));
                    if accepted { assert!(mode.is_none()); }
                    else { assert_eq!(mode.unwrap(), (0..n).map(|r| vectors[r * n]).collect::<Vec<_>>()); }
                    assert_eq!(EIGENVALUE_DECOMPOSITIONS.with(|count| count.get()), 1, "n={n}, last={last}, anisotropy={anisotropy}, amplification={amplification}");
                }
            }
        }
    }

    #[test]
    fn issue_1753_fast_accepted_spectrum_avoids_unused_eigenvector_rotations() {
        let matrix = CscMatrix::from_dense_symmetric(&[2.0, 1.0, 0.0, 1.0, 2.0, 1.0, 0.0, 1.0, 2.0], 3);
        let tags: Vec<_> = (0..3).map(|node| DofTag { node, kind: DofKind::Translation }).collect();
        EIGENVECTOR_ROTATIONS.with(|count| count.set(0));
        let result = analyze(&matrix, &tags);
        assert_eq!(result.verdict, Verdict::Stable);
        assert!(!result.needs_accuracy_check());
        assert_eq!(EIGENVECTOR_ROTATIONS.with(|count| count.get()), 0);
    }

    #[test]
    fn issue_1753_spectrum_values_and_refusal_modes_match_full_jacobi() {
        for dense in [
            vec![2.0, 1.0, 0.0, 1.0, 2.0, 1.0, 0.0, 1.0, 2.0],
            vec![1.0, 2.0, 0.0, 2.0, 1.0, 0.0, 0.0, 0.0, 1.0],
            vec![1.0, 1.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0],
        ] {
            for scale in [1e-200, 1.0, 1e200] {
                let dense: Vec<_> = dense.iter().map(|x| x * scale).collect();
                let (expected_values, expected_vectors) = sym_eigen_small(&dense, 3);
                let (values, vectors) = sym_eigen_small_impl(&dense, 3, false);
                assert!(vectors.is_empty());
                assert_eq!(values.iter().map(|v| v.to_bits()).collect::<Vec<_>>(), expected_values.iter().map(|v| v.to_bits()).collect::<Vec<_>>());
                for (anisotropy, amplification) in [(1.0, 1.0), (RESOLVABLE, 1.0), (1.0, RESOLVABLE)] {
                    let matrix = CscMatrix { n: 3, col_ptr: vec![0, 3, 5, 6], row_idx: vec![0, 1, 2, 1, 2, 2], values: vec![dense[0], dense[3], dense[6], dense[4], dense[7], dense[8]] };
                    let (kappa, mode, indefinite) = spectrum(&matrix, anisotropy, amplification, None);
                    let expected_kappa = if expected_values[0] <= 0.0 { f64::INFINITY } else { expected_values[2] / expected_values[0] };
                    assert_eq!(kappa.to_bits(), expected_kappa.to_bits());
                    let expected_indefinite = -expected_values[0] > ROUNDING * 3.0 * f64::EPSILON * anisotropy * expected_values[2].abs();
                    assert_eq!(indefinite, expected_indefinite);
                    let accepted = kappa * amplification <= RESOLVABLE && (kappa * anisotropy <= RESOLVABLE || (kappa <= RESOLVABLE && anisotropy <= MAX_ANISOTROPY));
                    if accepted { assert!(mode.is_none()); }
                    else { assert_eq!(mode.unwrap(), (0..3).map(|r| expected_vectors[r * 3]).collect::<Vec<_>>()); }
                }
            }
        }
    }

    #[test]
    fn issue_1753_fast_accepted_sparse_stability_avoids_lanczos() {
        let n = FULL_SPECTRUM + 17;
        for scale in [1e-100, 1.0, 1e100] {
            let mut rows = Vec::new();
            let mut cols = Vec::new();
            let mut values = Vec::new();
            for i in 0..n {
                rows.push(i);
                cols.push(i);
                values.push(2.0 * scale);
                if i > 0 {
                    rows.push(i);
                    cols.push(i - 1);
                    values.push(-scale);
                }
            }
            let matrix = CscMatrix::from_triplets(n, &rows, &cols, &values);
            let tags: Vec<_> = (0..n).map(|node| DofTag { node, kind: DofKind::Translation }).collect();
            LANCZOS_RUNS.with(|count| count.set(0));
            let result = analyze(&matrix, &tags);
            assert_eq!(result.verdict, Verdict::Stable);
            assert!(!result.needs_accuracy_check());
            let cosine = (std::f64::consts::PI / (n + 1) as f64).cos();
            let exact_kappa = (1.0 + cosine) / (1.0 - cosine);
            assert!(result.kappa >= exact_kappa);
            assert_eq!(LANCZOS_RUNS.with(|count| count.get()), 0);
            let mut equilibrated = matrix.clone();
            for value in &mut equilibrated.values { *value /= 2.0 * scale; }
            let (tight, _, indefinite) = spectrum(&equilibrated, 1.0, 1.0, None);
            assert!(!indefinite);
            assert!(tight >= exact_kappa && tight <= exact_kappa * (1.0 + 3e-3), "{tight} vs {exact_kappa}");
            assert!(result.kappa >= tight);
            assert!(LANCZOS_RUNS.with(|count| count.get()) > 0);
        }
    }

    #[test]
    fn issue_1753_full_sparse_spectrum_keeps_clustered_extremes_tight_in_any_numbering() {
        let n = DENSE_SPECTRUM + 1;
        for order in [
            (0..n).collect::<Vec<_>>(),
            (0..n).rev().collect(),
            (0..n).map(|i| (i * 37 + 11) % n).collect(),
        ] {
            let mut rows: Vec<_> = (0..n).collect();
            let mut cols = rows.clone();
            let mut values = vec![1.0; n];
            rows.push(order[0].max(order[101]));
            cols.push(order[0].min(order[101]));
            values.push(-0.5);
            let matrix = CscMatrix::from_triplets(n, &rows, &cols, &values);
            LANCZOS_RUNS.with(|count| count.set(0));
            let (kappa, _, indefinite) = spectrum(&matrix, 1.0, 1.0, None);
            assert!(!indefinite);
            assert!(kappa >= 3.0 && kappa <= 3.0 * (1.0 + 3e-3), "{kappa}");
            assert!(LANCZOS_RUNS.with(|count| count.get()) > 0);
        }
    }

    #[test]
    fn issue_1753_sparse_fast_bound_preserves_difficult_spectrum_checks() {
        let n = FULL_SPECTRUM + 17;
        for tail in [0.0, -1.0, 1.0 / RESOLVABLE, 1.0] {
            let mut diagonal = vec![1.0; n];
            diagonal[n - 1] = tail;
            let indices: Vec<_> = (0..n).collect();
            let matrix = CscMatrix::from_triplets(n, &indices, &indices, &diagonal);
            let symbolic = Rc::new(symbolic_cholesky(&matrix));
            for (anisotropy, amplification) in [(1.0, 1.0), (RESOLVABLE, 1.0), (1.0, RESOLVABLE)] {
                let fast = fast_sparse_bound(&matrix, &symbolic, anisotropy, amplification);
                assert_eq!(fast.is_some(), tail == 1.0 && anisotropy == 1.0 && amplification == 1.0);
                if let Some(kappa) = fast {
                    assert!(kappa >= 1.0);
                    assert!(kappa * anisotropy <= RESOLVABLE);
                    assert!(kappa * amplification <= RESOLVABLE);
                } else {
                    let fresh = spectrum(&matrix, anisotropy, amplification, None);
                    let reused = spectrum(&matrix, anisotropy, amplification, Some(&symbolic));
                    assert_eq!(fresh, reused);
                }
            }
        }
    }

    #[test]
    fn sparse_fast_bound_widens_to_a_bound_the_spectrum_confirms() {
        let n = FULL_SPECTRUM + 17;
        let diagonal_with = |tail: f64| {
            let mut diagonal = vec![1.0; n];
            diagonal[n / 2] = tail;
            let indices: Vec<_> = (0..n).collect();
            CscMatrix::from_triplets(n, &indices, &indices, &diagonal)
        };
        let first = RESOLVABLE.sqrt();
        for (tail, widening) in [(1e-5, 1.0), (1e-7, 1e2), (3e-8, 1e2), (1e-9, 1e4), (2e-10, 1e4)] {
            let matrix = diagonal_with(tail);
            let symbolic = Rc::new(symbolic_cholesky(&matrix));
            LANCZOS_RUNS.with(|count| count.set(0));
            let fast = fast_sparse_bound(&matrix, &symbolic, 1.0, 1.0).expect("a certified bound");
            assert_eq!(LANCZOS_RUNS.with(|count| count.get()), 0);
            let upper = 1.0 + CERTIFY;
            assert_eq!(fast, upper / (upper / (first * widening)), "tail {tail}");
            let (tight, _, indefinite) = spectrum(&matrix, 1.0, 1.0, Some(&symbolic));
            assert!(!indefinite);
            assert!(tight >= 1.0 / tail && tight <= fast, "tail {tail}: {tight} vs {fast}");
        }
        for (tail, anisotropy, amplification) in [(5e-11, 1.0, 1.0), (1e-7, 1e5, 1.0), (1e-7, 1.0, 1e5), (1e-9, 1e3, 1.0), (-1e-7, 1.0, 1.0), (0.0, 1.0, 1.0)] {
            let matrix = diagonal_with(tail);
            let symbolic = Rc::new(symbolic_cholesky(&matrix));
            assert_eq!(fast_sparse_bound(&matrix, &symbolic, anisotropy, amplification), None, "tail {tail}");
        }
        let matrix = diagonal_with(1e-7);
        let symbolic = Rc::new(symbolic_cholesky(&matrix));
        assert!(fast_sparse_bound(&matrix, &symbolic, 1.2e3, 1.2e3).is_some());
        assert_eq!(fast_sparse_bound(&matrix, &symbolic, 1.3e3, 1.0), None);
        assert_eq!(fast_sparse_bound(&matrix, &symbolic, 1.0, 1.3e3), None);
        let first_rung = diagonal_with(1e-5);
        let symbolic = Rc::new(symbolic_cholesky(&first_rung));
        assert!(fast_sparse_bound(&first_rung, &symbolic, 1e6 * 0.99, 1.0).is_some());
    }

    #[test]
    fn sparse_fast_bound_accepts_only_what_the_spectrum_accepts() {
        let mut state = 0x2545_F491_4F6C_DD1Du64;
        let mut unit = || {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            (state >> 11) as f64 / (1u64 << 53) as f64
        };
        let (mut widened, mut refused) = (0, 0);
        for n in [70, 90, 120, 160, 210, 270, 330] {
            let (mut rows, mut cols, mut values) = (Vec::new(), Vec::new(), Vec::new());
            let shift = 10f64.powf(-5.0 - 5.0 * unit());
            for i in 0..n {
                for (offset, stencil) in [(0, 6.0 + shift), (1, -4.0), (2, 1.0)] {
                    if i + offset >= n { continue; }
                    rows.push(i + offset);
                    cols.push(i);
                    values.push(stencil);
                }
            }
            let matrix = CscMatrix::from_triplets(n, &rows, &cols, &values);
            let symbolic = Rc::new(symbolic_cholesky(&matrix));
            let (tight, _, indefinite) = spectrum(&matrix, 1.0, 1.0, Some(&symbolic));
            assert!(!indefinite && tight.is_finite());
            let edge = RESOLVABLE / tight;
            let factors: Vec<f64> = [1e-6, 1e-3, 0.02, 0.1, 0.5, 0.9, 1.0, 1.1, 2.0].into_iter().chain((0..12).map(|_| 10f64.powf(-4.0 * unit()))).collect();
            for factor in factors {
                for (anisotropy, amplification) in [(edge * factor, 1.0), (1.0, edge * factor), (edge * factor, edge * factor)] {
                    if anisotropy < 1.0 || amplification < 1.0 { continue; }
                    let Some(fast) = fast_sparse_bound(&matrix, &symbolic, anisotropy, amplification) else { refused += 1; continue };
                    assert!(fast >= tight / (1.0 + 3e-3), "n {n}: {fast} vs {tight}");
                    assert!(tight * anisotropy <= RESOLVABLE && tight * amplification <= RESOLVABLE, "n {n}: {tight} at {anisotropy}, {amplification}");
                    if fast > RESOLVABLE.sqrt() * 1.5 { widened += 1; }
                }
            }
        }
        assert!(widened >= 20 && refused >= 20, "{widened} widened, {refused} refused");
    }

    #[test]
    fn issue_1753_sparse_dropped_direction_coupling_keeps_full_spectrum() {
        let n = FULL_SPECTRUM + 17;
        let mut rows: Vec<_> = (0..n).collect();
        let mut cols = rows.clone();
        let mut values = vec![1.0; n];
        values[0] = LOCAL_FREE / 2.0;
        rows.push(2);
        cols.push(0);
        values.push(LOCAL_FREE * LOCAL_FREE);
        let matrix = CscMatrix::from_triplets(n, &rows, &cols, &values);
        let tags: Vec<_> = (0..n).map(|i| DofTag {
            node: if i < 2 { 0 } else { i },
            kind: if i < 2 { DofKind::Rotation } else { DofKind::Translation },
        }).collect();
        LANCZOS_RUNS.with(|count| count.set(0));
        let result = analyze_with_coupling(&matrix, &tags, &[(0, 1)], &ReleasedRotations::default());
        assert_eq!(result.verdict, Verdict::Stable);
        assert!(result.free.iter().any(|direction| !direction.coupling.is_empty()));
        assert!(LANCZOS_RUNS.with(|count| count.get()) > 0);
    }

    #[test]
    fn staged_round5_rotation_subspace_and_rounding_boundary() {
        for angle in [0.0_f64, 0.3, 1.2] {
            let (s, c) = angle.sin_cos();
            let mut free: Vec<_> = [vec![c,s], vec![-s,c]].into_iter().map(|direction| FreeDirection {
                node: 1, kind: DofKind::Rotation, moves_translation: false,
                dofs: vec![0,1], direction, direction_rounding: vec![0.0; 2], scale: 1.0, coupling: Vec::new(),
            }).collect();
            let (moving, undecided) = swinging(&mut free, &[vec![(0,1.0)],vec![(0,2.0)]]);
            assert_eq!(moving, vec![1]);
            assert!(undecided.is_empty());
            assert_eq!(free.iter().filter(|f| f.moves_translation).count(), 1);
            let harmless = free.iter().find(|f| !f.moves_translation).unwrap();
            assert!((harmless.direction[0] + 2.0 * harmless.direction[1]).abs() <= ROUNDING * f64::EPSILON);
        }
        let tolerance = ROUNDING * 3.0 * f64::EPSILON;
        for factor in [0.0, 0.25, 2.0] {
            let alpha = factor * tolerance;
            let tags = vec![DofTag { node: 1, kind: DofKind::Rotation }; 3];
            let k = vec![1.0,0.0,0.0, 0.0,0.0,0.0, 0.0,0.0,0.0];
            let motion = vec![vec![(0,1.0)],vec![(0,alpha)],vec![(0,2.0*alpha)]];
            let result = analyze_dense_constrained(&k, 3, &tags, &motion);
            if factor == 0.0 {
                assert_eq!(result.verdict, Verdict::Stable);
                assert_eq!(result.free_rotations().count(), 2);
            } else if factor < 1.0 {
                assert_eq!(result.verdict, Verdict::Singular);
                assert_eq!(result.reason, Reason::SwingAtRounding);
            } else {
                assert_eq!(result.verdict, Verdict::Mechanism);
                assert_eq!(result.free_rotations().count(), 1);
                assert_eq!(result.mechanism_directions().count(), 1);
            }
        }
    }

    #[test]
    fn released_vector_normalization_requires_a_certified_nonzero_component() {
        let radius=0.25_f64;
        for (value,expected) in [(0.0,false),(radius.next_down(),false),(radius,false),(radius.next_up(),true),(1.0,true)] {
            let direction=ReleasedVector {values:vec![value],rounding:vec![radius]};
            assert_eq!(direction.normalized().is_some(),expected);
        }
    }

}
