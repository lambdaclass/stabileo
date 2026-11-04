//! Certify the displacements returned by the linear static solvers.
//!
//! The certified system is the reduced free-DOF system `K_FF u_F = f_F − K_FR u_R`
//! of the dense assembly (`assemble_stiffness_{2d,3d}`, the same assembly the
//! solver's dense path factors), with `ũ_F` read back from the solver's own
//! returned displacements (no re-solve). The effective load `f_F − K_FR u_R`
//! is evaluated in interval arithmetic, so prescribed displacements add no
//! unaccounted rounding. Springs, hinges' artificial stiffness and connectors
//! are part of `K` and need nothing special.
//!
//! Constraints and inclined supports are certified in the transformed system
//! the solver factors (`constrained.rs`): the reduced `Cᵀ K C` system with the
//! bound mapped back through `‖C‖₂`, and the rotated system with the bound
//! mapped back through `‖T‖₂`. With inclined supports the bound is on the
//! global-axis error over all DOFs.
//!
//! Small models (n_free < `SPARSE_THRESHOLD`) use the dense assembly and the
//! dense interval-Cholesky certificate (`linear.rs`). Larger ones use the
//! triplet sparse assembly the solver's sparse path factors, and the Gram
//! residual + Gershgorin certificate (`sparse.rs`), which has no size cap.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::constrained::{certify_constrained_system, rotate_back, to_rotated, ConstraintMap, KRef, Rotation};
use super::finite::{self, Guarded};
use super::deflection::{deflection_bounds_2d, deflection_bounds_3d, DeflectionBound};
use super::forces::{force_bounds_2d, force_bounds_3d, shell_bounds_3d, ForceBound2D, ForceBound3D, ShellBound};
use super::reactions::{reaction_bounds_2d, reaction_bounds_3d, ReactionBound2D, ReactionBound3D};
use super::stations::{station_bounds_2d, station_bounds_3d, with_gaps_2d, with_gaps_3d, StationBound2D, StationBound3D};
use super::interval::Interval;
use super::reassembly::{end_to_end_2d, end_to_end_3d, EndToEnd};
use super::linear::{
    certify_linear_system_auto_interval_rhs, certify_sigma_auto, certify_with_certified_sigma, Certificate, MAX_CERTIFY_N,
};
use super::sparse::{certify_lambda_min_lower, certify_sparse_spd_system, certify_with_certified_mu};
use crate::linalg::sparse::CscMatrix;
use crate::solver::assembly::{
    assemble_2d, assemble_load_vector_2d, assemble_load_vector_3d_dense, assemble_sparse_3d, assemble_stiffness_2d,
    assemble_stiffness_3d, assemble_stiffness_sparse_3d, InclinedTransformData, InclinedTransformData2D,
};
use crate::solver::constraints::{build_constraint_transform, inclined_dofs_2d, inclined_dofs_3d};
use crate::solver::sparse_assembly::{assemble_load_vector_sparse_3d, assemble_stiffness_sparse_2d};
use crate::solver::dof::DofNumbering;
use crate::solver::linear::{expand_curved_beams_3d, solve_2d, solve_3d, SPARSE_THRESHOLD};
use crate::types::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedResults2D {
    pub results: AnalysisResults,
    pub certificate: Certificate,
    /// Per-member bounds on |force(u*) − force(ũ)| (empty when uncertified).
    pub force_bounds: Vec<ForceBound2D>,
    /// What the views show beyond the end forces (empty when uncertified).
    #[serde(flatten)]
    pub shown: ShownBounds<StationBound2D, ReactionBound2D>,
    /// Whether the model → K → result chain was checked by the independent
    /// re-assembly (`certify::reassembly`), and its bound.
    #[serde(default)]
    pub end_to_end: EndToEnd,
    /// "endToEnd" when `end_to_end` is certified, "assembled" when only the
    /// solve of the assembled system is, "none" otherwise.
    #[serde(default)]
    pub certificate_level: CertificateLevel,
}

/// Bounds on the quantities the result views compute after the solve
/// (`stations.rs`, `deflection.rs`, `reactions.rs`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShownBounds<S, R> {
    /// Diagram bounds valid at every x along each member, with the gaps of the
    /// computed diagrams between their stations.
    #[serde(default = "Vec::new")]
    pub station_bounds: Vec<S>,
    /// Deflection-curve bounds per member.
    #[serde(default = "Vec::new")]
    pub deflection_bounds: Vec<DeflectionBound>,
    /// Reaction bounds per supported node.
    #[serde(default = "Vec::new")]
    pub reaction_bounds: Vec<R>,
    /// Why reactions are not bounded, when they are not.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reaction_reason: Option<String>,
}

impl<S, R> Default for ShownBounds<S, R> {
    fn default() -> Self {
        ShownBounds { station_bounds: Vec::new(), deflection_bounds: Vec::new(), reaction_bounds: Vec::new(), reaction_reason: None }
    }
}

/// The shown-quantity bounds of one certified 2D solve (`loads` on `input`'s structure).
pub fn shown_bounds_2d(
    input: &SolverInput,
    loads: &[SolverLoad],
    results: &AnalysisResults,
    abs_bound: f64,
) -> ShownBounds<StationBound2D, ReactionBound2D> {
    let mut station_bounds = station_bounds_2d(input, abs_bound);
    with_gaps_2d(&mut station_bounds, &results.element_forces);
    let (reaction_bounds, reaction_reason) = match reaction_bounds_2d(input, loads, results, abs_bound) {
        Ok(r) => (r, None),
        Err(e) => (Vec::new(), Some(e)),
    };
    ShownBounds { station_bounds, deflection_bounds: deflection_bounds_2d(input, abs_bound), reaction_bounds, reaction_reason }
}

/// The shown-quantity bounds of one certified 3D solve.
pub fn shown_bounds_3d(
    input: &SolverInput3D,
    loads: &[SolverLoad3D],
    results: &AnalysisResults3D,
    abs_bound: f64,
) -> ShownBounds<StationBound3D, ReactionBound3D> {
    let expanded = expand_curved_beams_3d(input);
    let mut station_bounds = station_bounds_3d(&expanded, abs_bound);
    with_gaps_3d(&mut station_bounds, &results.element_forces);
    let (reaction_bounds, reaction_reason) = match reaction_bounds_3d(input, loads, results, abs_bound) {
        Ok(r) => (r, None),
        Err(e) => (Vec::new(), Some(e)),
    };
    ShownBounds { station_bounds, deflection_bounds: deflection_bounds_3d(&expanded, abs_bound), reaction_bounds, reaction_reason }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedResults3D {
    pub results: AnalysisResults3D,
    pub certificate: Certificate,
    /// Per-member bounds on |force(u*) − force(ũ)| (empty when uncertified).
    pub force_bounds: Vec<ForceBound3D>,
    /// Per-shell-element bounds on the reported stress resultants (empty when uncertified).
    #[serde(default)]
    pub shell_bounds: Vec<ShellBound>,
    #[serde(flatten)]
    pub shown: ShownBounds<StationBound3D, ReactionBound3D>,
    #[serde(default)]
    pub end_to_end: EndToEnd,
    #[serde(default)]
    pub certificate_level: CertificateLevel,
}

/// How much of the chain model → K → result a certified linear result covers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum CertificateLevel {
    /// Neither certificate holds.
    #[default]
    None,
    /// The displacements solve the engine's assembled K and f (CERTIFY.md).
    Assembled,
    /// Also certified against an independent re-assembly of the model.
    EndToEnd,
}

impl CertificateLevel {
    pub fn of(assembled: &Certificate, e2e: &EndToEnd) -> Self {
        if !assembled.is_certified() {
            CertificateLevel::None
        } else if e2e.is_certified() {
            CertificateLevel::EndToEnd
        } else {
            CertificateLevel::Assembled
        }
    }
}

/// Withdraw an end-to-end claim that carries a non-finite number.
fn guard_end_to_end(e2e: &mut EndToEnd) {
    if !e2e.is_certified() {
        return;
    }
    let bad = finite::undocumented_non_finite(&*e2e);
    if !bad.is_empty() {
        *e2e = EndToEnd::Uncertified { reason: format!("non-finite bound at {}", bad.join(", ")) };
    }
}

impl CertifiedResults2D {
    /// Withdraw the certificate and every bound derived from it when any of
    /// them is not finite (outside the documented +∞ fields).
    fn guard(&mut self) {
        guard_end_to_end(&mut self.end_to_end);
        if !self.certificate.is_certified() {
            return;
        }
        let bad = finite::undocumented_non_finite(&(&self.certificate, &self.force_bounds, &self.shown));
        if !bad.is_empty() {
            self.certificate.downgrade(format!("non-finite bound at {}", bad.join(", ")));
            self.force_bounds.clear();
            self.shown = ShownBounds::default();
        }
    }
}

impl CertifiedResults3D {
    /// As `CertifiedResults2D::guard`.
    fn guard(&mut self) {
        guard_end_to_end(&mut self.end_to_end);
        if !self.certificate.is_certified() {
            return;
        }
        let bad = finite::undocumented_non_finite(&(&self.certificate, &self.force_bounds, &self.shell_bounds, &self.shown));
        if !bad.is_empty() {
            self.certificate.downgrade(format!("non-finite bound at {}", bad.join(", ")));
            self.force_bounds.clear();
            self.shell_bounds.clear();
            self.shown = ShownBounds::default();
        }
    }
}

/// `certify_linear_2d` plus per-member force bounds and the bounds on what the
/// views show (diagrams, deflection curves, reactions).
pub fn certify_linear_2d_full(input: &SolverInput) -> Result<CertifiedResults2D, String> {
    let (results, certificate) = certify_linear_2d(input)?;
    let force_bounds = certificate.abs_bound().map(|b| force_bounds_2d(input, b)).unwrap_or_default();
    let shown = certificate.abs_bound().map(|b| shown_bounds_2d(input, &input.loads, &results, b)).unwrap_or_default();
    let end_to_end = end_to_end_2d(input, &input.loads, &results);
    let mut out = CertifiedResults2D { results, certificate, force_bounds, shown, end_to_end, certificate_level: CertificateLevel::None };
    out.guard();
    out.certificate_level = CertificateLevel::of(&out.certificate, &out.end_to_end);
    Ok(out)
}

/// `certify_linear_3d` plus per-member force bounds and shell resultant bounds.
pub fn certify_linear_3d_full(input: &SolverInput3D) -> Result<CertifiedResults3D, String> {
    let (results, certificate) = certify_linear_3d(input)?;
    let expanded = expand_curved_beams_3d(input);
    let (force_bounds, shell_bounds) = match certificate.abs_bound() {
        Some(b) => (force_bounds_3d(&expanded, b), shell_bounds_3d(&expanded, b)),
        None => Default::default(),
    };
    let shown = certificate.abs_bound().map(|b| shown_bounds_3d(input, &input.loads, &results, b)).unwrap_or_default();
    let end_to_end = end_to_end_3d(input, &input.loads, &results);
    let mut out = CertifiedResults3D { results, certificate, force_bounds, shell_bounds, shown, end_to_end, certificate_level: CertificateLevel::None };
    out.guard();
    out.certificate_level = CertificateLevel::of(&out.certificate, &out.end_to_end);
    Ok(out)
}

/// Solve a 2D linear static model with `solve_2d` and certify its displacements.
/// A non-finite number in the input or the results is an `Err`.
pub fn certify_linear_2d(input: &SolverInput) -> Result<(AnalysisResults, Certificate), String> {
    finite::check_input(input)?;
    let results = solve_2d(input)?;
    finite::check_results(&results)?;
    let cert = certify_results_2d(input, &results);
    Ok((results, cert))
}

/// Solve a 3D linear static model with `solve_3d` and certify its displacements.
/// A non-finite number in the input or the results is an `Err`.
pub fn certify_linear_3d(input: &SolverInput3D) -> Result<(AnalysisResults3D, Certificate), String> {
    finite::check_input(input)?;
    let results = solve_3d(input)?;
    finite::check_results(&results)?;
    let cert = certify_results_3d(input, &results);
    Ok((results, cert))
}

/// Whether the linear solver took its sparse path (and so which assembly of K
/// the certificate checks). Choosing the other one would still give a sound
/// certificate, of the other f64 assembly of the same model; see the
/// path-selection exclusions in .cargo/mutants.toml.
fn solver_used_sparse(nf: usize) -> bool {
    nf >= SPARSE_THRESHOLD
}

/// Which assembly of K and f the linear solver factored for a solve: the same
/// dispatch the certificates here follow (`solver_used_sparse`,
/// `constrained_solver_used_sparse`). The end-to-end check compares exactly
/// that assembly with its independent re-assembly.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SolverAssembly {
    /// `assemble_stiffness_{2d,3d}` and the dense load vector.
    Dense,
    /// `assemble_stiffness_sparse_{2d,3d}` and the sparse-path load vector.
    Sparse,
    /// 3D constrained solve: `assemble_sparse_3d`.
    SparseConstrained3D,
}

/// The assembly `solve_2d(input)` factored, given its results.
pub fn solver_assembly_2d(input: &SolverInput, results: &AnalysisResults) -> SolverAssembly {
    let nf = DofNumbering::build_2d(input).n_free;
    let sparse = if input.constraints.is_empty() { solver_used_sparse(nf) } else { constrained_solver_used_sparse(nf, results) };
    if sparse { SolverAssembly::Sparse } else { SolverAssembly::Dense }
}

/// The assembly `solve_3d(input)` factored.
pub fn solver_assembly_3d(input: &SolverInput3D) -> SolverAssembly {
    let expanded = expand_curved_beams_3d(input);
    if !expanded.constraints.is_empty() {
        return SolverAssembly::SparseConstrained3D;
    }
    if solver_used_sparse(DofNumbering::build_3d(&expanded).n_free) { SolverAssembly::Sparse } else { SolverAssembly::Dense }
}

/// The constrained solver's path: sparse when large enough and its sparse
/// Cholesky succeeded (reported in the results), dense otherwise. Same
/// soundness note as `solver_used_sparse`.
fn constrained_solver_used_sparse(nf: usize, results: &AnalysisResults) -> bool {
    solver_used_sparse(nf) && results.structured_diagnostics.iter().any(|d| d.code == DiagnosticCode::SparseCholesky)
}

/// Resource cap of the dense paths (O(n²) memory, O(n³) time). Not a
/// soundness condition: a certificate past it would be equally sound.
fn size_check(dof_num: &DofNumbering) -> Result<(), Certificate> {
    let nf = dof_num.n_free;
    if nf > MAX_CERTIFY_N || dof_num.n_total > 4 * MAX_CERTIFY_N {
        return Err(Certificate::uncertified(format!(
            "too large: {nf} free DOFs exceeds the dense certification cap {MAX_CERTIFY_N}"
        )));
    }
    Ok(())
}

/// Certify given results of `solve_2d(input)` (the input the results came from).
/// Models with constraints or inclined supports take the per-case general path;
/// the rest certify K once through `certify_load_cases_2d`.
/// Uncertified when the input, the results or the bound are not finite.
pub fn certify_results_2d(input: &SolverInput, results: &AnalysisResults) -> Certificate {
    if let Err(e) = finite::check_input(input).and_then(|()| finite::check_results(results)) {
        return Certificate::uncertified(e);
    }
    let mut c = if needs_general_2d(input) {
        certify_general_2d(input, results)
    } else {
        certify_load_cases_2d(input, &[(&input.loads, results)]).pop().expect("one case")
    };
    finite::guard(&mut c);
    c
}

fn needs_general_2d(input: &SolverInput) -> bool {
    !input.constraints.is_empty() || crate::ordered::values(&input.supports).any(|s| s.support_type == "inclinedRoller")
}

fn needs_general_3d(input: &SolverInput3D) -> bool {
    !input.constraints.is_empty() || crate::ordered::values(&input.supports).any(|s| s.is_inclined.unwrap_or(false))
}

/// Single case with constraints and/or inclined supports (see module docs).
fn certify_general_2d(input: &SolverInput, results: &AnalysisResults) -> Certificate {
    let dof_num = DofNumbering::build_2d(input);
    let u_glob = match gather_u_2d(&dof_num, &results.displacements) {
        Ok(u) => u,
        Err(c) => return c,
    };
    if !u_glob.iter().all(|x| x.is_finite()) {
        return Certificate::uncertified("non-finite displacement in solver output");
    }
    let nf = dof_num.n_free;
    if !input.constraints.is_empty() {
        return certify_constrained_2d(input, results, &dof_num, &u_glob);
    }
    if solver_used_sparse(nf) {
        // The solver's sparse path: certify the triplet-assembled K it factors.
        let stiff = assemble_stiffness_sparse_2d(input, &dof_num);
        let (rots, u) = match rotated_candidate_2d(input, &dof_num, &stiff.inclined_transforms_2d, &u_glob) {
            Ok(x) => x,
            Err(c) => return c,
        };
        let f = assemble_load_vector_2d(input, &input.loads, &dof_num, &stiff.inclined_transforms_2d);
        let cert = certify_reduced_sparse(&stiff.k_ff, &stiff.k_full, nf, &f, &u);
        return rotate_back(cert, &rots, &u, &u_glob);
    }
    if let Err(c) = size_check(&dof_num) {
        return c;
    }
    let stiff = assemble_stiffness_2d(input, &dof_num);
    let (rots, u) = match rotated_candidate_2d(input, &dof_num, &stiff.inclined_transforms_2d, &u_glob) {
        Ok(x) => x,
        Err(c) => return c,
    };
    let f = assemble_load_vector_2d(input, &input.loads, &dof_num, &stiff.inclined_transforms_2d);
    let cert = certify_reduced(&stiff.k, dof_num.n_total, nf, &f, &u);
    rotate_back(cert, &rots, &u, &u_glob)
}

/// The constrained 2D solve (`solve_constrained_2d`): the sparse path when the
/// results report it (nf ≥ SPARSE_THRESHOLD and sparse Cholesky succeeded),
/// otherwise the dense path.
fn certify_constrained_2d(
    input: &SolverInput,
    results: &AnalysisResults,
    dof_num: &DofNumbering,
    u_glob: &[f64],
) -> Certificate {
    let nf = dof_num.n_free;
    if nf == 0 {
        return Certificate::uncertified("constrained model without free DOFs");
    }
    let cm = match build_constraint_transform(&input.constraints, dof_num, Some(&input.nodes), None,
        &inclined_dofs_2d(input, dof_num))
    {
        Ok(ct) => ConstraintMap::from_transform(&ct, nf),
        Err(e) => return Certificate::uncertified(e),
    };
    if constrained_solver_used_sparse(nf, results) {
        let stiff = assemble_stiffness_sparse_2d(input, dof_num);
        let (rots, u) = match rotated_candidate_2d(input, dof_num, &stiff.inclined_transforms_2d, u_glob) {
            Ok(x) => x,
            Err(c) => return c,
        };
        let f = assemble_load_vector_2d(input, &input.loads, dof_num, &stiff.inclined_transforms_2d);
        let k = KRef::Sparse { k_ff: &stiff.k_ff, k_full: &stiff.k_full };
        let cert = certify_constrained_system(&k, nf, &f, &u, &cm);
        return rotate_back(cert, &rots, &u, u_glob);
    }
    if let Err(c) = size_check(dof_num) {
        return c;
    }
    let asm = assemble_2d(input, dof_num);
    let (rots, u) = match rotated_candidate_2d(input, dof_num, &asm.inclined_transforms_2d, u_glob) {
        Ok(x) => x,
        Err(c) => return c,
    };
    let k = KRef::Dense { k: &asm.k, n: dof_num.n_total };
    let cert = certify_constrained_system(&k, nf, &asm.f, &u, &cm);
    rotate_back(cert, &rots, &u, u_glob)
}

/// Rotations of the 2D inclined supports and the candidate in rotated axes,
/// with the solver's prescribed normal displacement on the restrained DOF.
fn rotated_candidate_2d(
    input: &SolverInput,
    dof_num: &DofNumbering,
    its: &[InclinedTransformData2D],
    u_glob: &[f64],
) -> Result<(Vec<Rotation>, Vec<f64>), Certificate> {
    let nf = dof_num.n_free;
    let mut rots = Vec::with_capacity(its.len());
    let mut prescribed = Vec::new();
    for it in its {
        let sups: Vec<&SolverSupport> = crate::ordered::values(&input.supports).filter(|s| s.node_id == it.node_id).collect();
        let [sup] = sups.as_slice() else {
            return Err(Certificate::uncertified(format!(
                "unsupported: several supports on inclined node {}",
                it.node_id
            )));
        };
        let Some(theta) = sup.angle else {
            return Err(Certificate::uncertified("inclined transform without an angle"));
        };
        for (a, &d) in it.dofs.iter().enumerate() {
            if d < nf {
                continue;
            }
            // Mirrors prepare_static_2d / solve_constrained_2d: only the normal
            // (local 1) gets a prescribed value.
            let v = if a == 1 {
                let (c, s) = (theta.cos(), theta.sin());
                let u_normal = sup.dx.unwrap_or(0.0) * s + sup.dz.unwrap_or(0.0) * c;
                if u_normal.abs() > 1e-15 { u_normal } else { 0.0 }
            } else {
                0.0
            };
            prescribed.push((d, v));
        }
        rots.push(Rotation {
            dofs: it.dofs.to_vec(),
            r: vec![it.r[0][0], it.r[0][1], it.r[1][0], it.r[1][1]],
        });
    }
    let u = to_rotated(u_glob, &rots, &prescribed);
    Ok((rots, u))
}

/// Certify several load cases that share `input`'s structure (its own `loads`
/// are ignored): case `i` is `cases[i].1`, claimed to solve the model with
/// loads `cases[i].0`. The stiffness is assembled and its coercivity certified
/// once; each case then costs one interval residual.
/// A case whose loads or results carry a non-finite number, or whose bound
/// is not finite, is uncertified.
pub fn certify_load_cases_2d(input: &SolverInput, cases: &[(&[SolverLoad], &AnalysisResults)]) -> Vec<Certificate> {
    if let Err(e) = finite::check_input(input) {
        return vec![Certificate::uncertified(e); cases.len()];
    }
    let bad: Vec<Option<String>> =
        cases.iter().map(|(l, r)| finite::check_input(l).and_then(|()| finite::check_results(r)).err()).collect();
    let mut out = load_cases_2d(input, cases);
    guard_cases(&mut out, bad);
    out
}

/// Downgrade the certificates of cases with non-finite data or bounds.
fn guard_cases(out: &mut [Certificate], bad: Vec<Option<String>>) {
    for (c, b) in out.iter_mut().zip(bad) {
        match b {
            Some(e) => c.downgrade(e),
            None => {
                finite::guard(c);
            }
        }
    }
}

fn load_cases_2d(input: &SolverInput, cases: &[(&[SolverLoad], &AnalysisResults)]) -> Vec<Certificate> {
    let all = |c: Certificate| vec![c; cases.len()];
    if needs_general_2d(input) {
        // Constraints / inclined supports: per case through the general path.
        return cases
            .iter()
            .map(|(loads, results)| {
                let mut case_input = input.clone();
                case_input.loads = loads.to_vec();
                certify_general_2d(&case_input, results)
            })
            .collect();
    }
    let dof_num = DofNumbering::build_2d(input);
    let prepared = if solver_used_sparse(dof_num.n_free) {
        // The solver's sparse path: certify the triplet-assembled K it factors.
        let stiff = assemble_stiffness_sparse_2d(input, &dof_num);
        if !stiff.inclined_transforms_2d.is_empty() {
            return all(Certificate::uncertified("unsupported: inclined supports"));
        }
        PreparedK::sparse(stiff.k_ff, stiff.k_full, dof_num.n_free)
    } else {
        if let Err(c) = size_check(&dof_num) {
            return all(c);
        }
        let stiff = assemble_stiffness_2d(input, &dof_num);
        if !stiff.inclined_transforms_2d.is_empty() {
            return all(Certificate::uncertified("unsupported: inclined supports"));
        }
        PreparedK::dense(stiff.k, dof_num.n_total, dof_num.n_free)
    };
    let prepared = match prepared {
        Ok(p) => p,
        Err(c) => return all(c),
    };
    cases
        .iter()
        .map(|(loads, results)| {
            let f = assemble_load_vector_2d(input, loads, &dof_num, &[]);
            match gather_u_2d(&dof_num, &results.displacements) {
                Ok(u) => prepared.certify(&f, &u),
                Err(c) => c,
            }
        })
        .collect()
}

pub(super) fn gather_u_2d(dof_num: &DofNumbering, displacements: &[Displacement]) -> Result<Vec<f64>, Certificate> {
    let disp: HashMap<usize, &Displacement> = displacements.iter().map(|d| (d.node_id, d)).collect();
    let mut u = vec![0.0; dof_num.n_total];
    for (&(node, local), &g) in &dof_num.map {
        let Some(d) = disp.get(&node) else {
            return Err(Certificate::uncertified(format!("no displacement returned for node {node}")));
        };
        u[g] = match local {
            0 => d.ux,
            1 => d.uz,
            2 => d.ry,
            _ => return Err(Certificate::uncertified(format!("unexpected 2D local DOF {local}"))),
        };
    }
    Ok(u)
}

/// Certify given results of `solve_3d(input)` (the input the results came from).
/// Uncertified when the input, the results or the bound are not finite.
pub fn certify_results_3d(input: &SolverInput3D, results: &AnalysisResults3D) -> Certificate {
    if let Err(e) = finite::check_input(input).and_then(|()| finite::check_results(results)) {
        return Certificate::uncertified(e);
    }
    let expanded = expand_curved_beams_3d(input);
    let mut c = if needs_general_3d(&expanded) {
        certify_general_3d(input, results)
    } else {
        certify_load_cases_3d(input, &[(&input.loads, results)]).pop().expect("one case")
    };
    finite::guard(&mut c);
    c
}

/// Single 3D case with constraints and/or inclined supports.
fn certify_general_3d(input: &SolverInput3D, results: &AnalysisResults3D) -> Certificate {
    let input = &expand_curved_beams_3d(input);
    let dof_num = DofNumbering::build_3d(input);
    let u_glob = match gather_u_3d(&dof_num, &results.displacements) {
        Ok(u) => u,
        Err(c) => return c,
    };
    if !u_glob.iter().all(|x| x.is_finite()) {
        return Certificate::uncertified("non-finite displacement in solver output");
    }
    let nf = dof_num.n_free;
    if !input.constraints.is_empty() {
        // solve_constrained_3d: always the sparse assembly.
        if nf == 0 {
            return Certificate::uncertified("constrained model without free DOFs");
        }
        let sasm = assemble_sparse_3d(input, &dof_num, true);
        let Some(k_full) = sasm.k_full.as_ref() else {
            return Certificate::uncertified("sparse assembly did not build the full K");
        };
        let (rots, u) = match rotated_candidate_3d(input, &dof_num, &sasm.inclined_transforms, &u_glob) {
            Ok(x) => x,
            Err(c) => return c,
        };
        let cm = match build_constraint_transform(&input.constraints, &dof_num, None, Some(&input.nodes),
            &inclined_dofs_3d(input, &dof_num))
        {
            Ok(ct) => ConstraintMap::from_transform(&ct, nf),
            Err(e) => return Certificate::uncertified(e),
        };
        let k = KRef::Sparse { k_ff: &sasm.k_ff, k_full };
        let cert = certify_constrained_system(&k, nf, &sasm.f, &u, &cm);
        return rotate_back(cert, &rots, &u, &u_glob);
    }
    if solver_used_sparse(nf) {
        // The solver's sparse path: certify the triplet-assembled K it factors.
        let stiff = assemble_stiffness_sparse_3d(input, &dof_num, true);
        let Some(k_full) = stiff.k_full.as_ref() else {
            return Certificate::uncertified("sparse assembly did not build the full K");
        };
        let (rots, u) = match rotated_candidate_3d(input, &dof_num, &stiff.inclined_transforms, &u_glob) {
            Ok(x) => x,
            Err(c) => return c,
        };
        let f = assemble_load_vector_sparse_3d(input, &input.loads, &dof_num, &stiff.inclined_transforms);
        let cert = certify_reduced_sparse(&stiff.k_ff, k_full, nf, &f, &u);
        return rotate_back(cert, &rots, &u, &u_glob);
    }
    if let Err(c) = size_check(&dof_num) {
        return c;
    }
    let stiff = assemble_stiffness_3d(input, &dof_num);
    let (rots, u) = match rotated_candidate_3d(input, &dof_num, &stiff.inclined_transforms, &u_glob) {
        Ok(x) => x,
        Err(c) => return c,
    };
    let f = assemble_load_vector_3d_dense(input, &input.loads, &dof_num, &stiff.inclined_transforms);
    let cert = certify_reduced(&stiff.k, dof_num.n_total, nf, &f, &u);
    rotate_back(cert, &rots, &u, &u_glob)
}

/// Rotations of the 3D inclined supports and the candidate in rotated axes,
/// with the solver's prescribed normal displacement on the restrained DOF.
fn rotated_candidate_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    its: &[InclinedTransformData],
    u_glob: &[f64],
) -> Result<(Vec<Rotation>, Vec<f64>), Certificate> {
    let nf = dof_num.n_free;
    let mut rots = Vec::with_capacity(its.len());
    let mut prescribed = Vec::new();
    for it in its {
        let sups: Vec<&SolverSupport3D> = crate::ordered::values(&input.supports).filter(|s| s.node_id == it.node_id).collect();
        let [sup] = sups.as_slice() else {
            return Err(Certificate::uncertified(format!(
                "unsupported: several supports on inclined node {}",
                it.node_id
            )));
        };
        let (Some(nx), Some(ny), Some(nz)) = (sup.normal_x, sup.normal_y, sup.normal_z) else {
            return Err(Certificate::uncertified("inclined transform without a normal"));
        };
        for (a, &d) in it.dofs.iter().enumerate() {
            if d < nf {
                continue;
            }
            // Mirrors prepare_static_3d / solve_constrained_3d: only the normal
            // (local 0) gets a prescribed value.
            let v = if a == 0 {
                let n_len = (nx * nx + ny * ny + nz * nz).sqrt();
                let u_normal =
                    (nx * sup.dx.unwrap_or(0.0) + ny * sup.dy.unwrap_or(0.0) + nz * sup.dz.unwrap_or(0.0)) / n_len;
                if u_normal.abs() > 1e-15 { u_normal } else { 0.0 }
            } else {
                0.0
            };
            prescribed.push((d, v));
        }
        rots.push(Rotation { dofs: it.dofs.to_vec(), r: it.r.iter().flatten().copied().collect() });
    }
    let u = to_rotated(u_glob, &rots, &prescribed);
    Ok((rots, u))
}

/// 3D version of `certify_load_cases_2d`.
pub fn certify_load_cases_3d(
    input: &SolverInput3D,
    cases: &[(&[SolverLoad3D], &AnalysisResults3D)],
) -> Vec<Certificate> {
    if let Err(e) = finite::check_input(input) {
        return vec![Certificate::uncertified(e); cases.len()];
    }
    let bad: Vec<Option<String>> =
        cases.iter().map(|(l, r)| finite::check_input(l).and_then(|()| finite::check_results(r)).err()).collect();
    let mut out = load_cases_3d(input, cases);
    guard_cases(&mut out, bad);
    out
}

fn load_cases_3d(
    input: &SolverInput3D,
    cases: &[(&[SolverLoad3D], &AnalysisResults3D)],
) -> Vec<Certificate> {
    let all = |c: Certificate| vec![c; cases.len()];
    if needs_general_3d(&expand_curved_beams_3d(input)) {
        return cases
            .iter()
            .map(|(loads, results)| {
                let mut case_input = input.clone();
                case_input.loads = loads.to_vec();
                certify_general_3d(&case_input, results)
            })
            .collect();
    }
    let input = &expand_curved_beams_3d(input);
    let dof_num = DofNumbering::build_3d(input);
    let sparse = solver_used_sparse(dof_num.n_free);
    let prepared = if sparse {
        // The solver's sparse path: certify the triplet-assembled K it factors.
        let stiff = assemble_stiffness_sparse_3d(input, &dof_num, true);
        if !stiff.inclined_transforms.is_empty() {
            return all(Certificate::uncertified("unsupported: inclined supports"));
        }
        let Some(k_full) = stiff.k_full else {
            return all(Certificate::uncertified("sparse assembly did not build the full K"));
        };
        PreparedK::sparse(stiff.k_ff, k_full, dof_num.n_free)
    } else {
        if let Err(c) = size_check(&dof_num) {
            return all(c);
        }
        let stiff = assemble_stiffness_3d(input, &dof_num);
        if !stiff.inclined_transforms.is_empty() {
            return all(Certificate::uncertified("unsupported: inclined supports"));
        }
        PreparedK::dense(stiff.k, dof_num.n_total, dof_num.n_free)
    };
    let prepared = match prepared {
        Ok(p) => p,
        Err(c) => return all(c),
    };
    cases
        .iter()
        .map(|(loads, results)| {
            let f = if sparse {
                assemble_load_vector_sparse_3d(input, loads, &dof_num, &[])
            } else {
                assemble_load_vector_3d_dense(input, loads, &dof_num, &[])
            };
            match gather_u_3d(&dof_num, &results.displacements) {
                Ok(u) => prepared.certify(&f, &u),
                Err(c) => c,
            }
        })
        .collect()
}

pub(super) fn gather_u_3d(dof_num: &DofNumbering, displacements: &[Displacement3D]) -> Result<Vec<f64>, Certificate> {
    let disp: HashMap<usize, &Displacement3D> = displacements.iter().map(|d| (d.node_id, d)).collect();
    let mut u = vec![0.0; dof_num.n_total];
    for (&(node, local), &g) in &dof_num.map {
        let Some(d) = disp.get(&node) else {
            return Err(Certificate::uncertified(format!("no displacement returned for node {node}")));
        };
        u[g] = match local {
            0 => d.ux,
            1 => d.uy,
            2 => d.uz,
            3 => d.rx,
            4 => d.ry,
            5 => d.rz,
            6 => match d.warping {
                Some(w) => w,
                None => return Err(Certificate::uncertified(format!("missing warping DOF at node {node}"))),
            },
            _ => return Err(Certificate::uncertified(format!("unexpected 3D local DOF {local}"))),
        };
    }
    Ok(u)
}

/// The reduced free-DOF system `(K_FF, enclosure of f_F − K_FR u_R, ũ_F)` of the
/// solver's sparse assembly, for given results of `solve_2d(input)`. Used for any
/// model size by certificate bundles (`certify::bundle`).
pub fn reduced_sparse_2d(
    input: &SolverInput,
    results: &AnalysisResults,
) -> Result<(CscMatrix, Vec<Interval>, Vec<f64>), Certificate> {
    if !input.constraints.is_empty() {
        return Err(Certificate::uncertified("unsupported: constraints (constrained solver path)"));
    }
    if crate::ordered::values(&input.supports).any(|s| s.support_type == "inclinedRoller") {
        return Err(Certificate::uncertified("unsupported: inclined supports"));
    }
    let dof_num = DofNumbering::build_2d(input);
    let stiff = assemble_stiffness_sparse_2d(input, &dof_num);
    if !stiff.inclined_transforms_2d.is_empty() {
        return Err(Certificate::uncertified("unsupported: inclined supports"));
    }
    let f = assemble_load_vector_2d(input, &input.loads, &dof_num, &stiff.inclined_transforms_2d);
    let u = gather_u_2d(&dof_num, &results.displacements)?;
    let (f_eff, u_f) = reduce_rhs_sparse(&stiff.k_full, dof_num.n_free, &f, &u)?;
    Ok((stiff.k_ff, f_eff, u_f))
}

/// 3D version of `reduced_sparse_2d`, for results of `solve_3d(input)`.
pub fn reduced_sparse_3d(
    input: &SolverInput3D,
    results: &AnalysisResults3D,
) -> Result<(CscMatrix, Vec<Interval>, Vec<f64>), Certificate> {
    reduced_sparse_3d_expanded(&expand_curved_beams_3d(input), results)
}

/// `reduced_sparse_3d` for an input already passed through `expand_curved_beams_3d`.
fn reduced_sparse_3d_expanded(
    input: &SolverInput3D,
    results: &AnalysisResults3D,
) -> Result<(CscMatrix, Vec<Interval>, Vec<f64>), Certificate> {
    if !input.constraints.is_empty() {
        return Err(Certificate::uncertified("unsupported: constraints (constrained solver path)"));
    }
    if crate::ordered::values(&input.supports).any(|s| s.is_inclined.unwrap_or(false)) {
        return Err(Certificate::uncertified("unsupported: inclined supports"));
    }
    let dof_num = DofNumbering::build_3d(input);
    let stiff = assemble_stiffness_sparse_3d(input, &dof_num, true);
    if !stiff.inclined_transforms.is_empty() {
        return Err(Certificate::uncertified("unsupported: inclined supports"));
    }
    let Some(k_full) = stiff.k_full.as_ref() else {
        return Err(Certificate::uncertified("sparse assembly did not build the full K"));
    };
    let f = assemble_load_vector_sparse_3d(input, &input.loads, &dof_num, &stiff.inclined_transforms);
    let u = gather_u_3d(&dof_num, &results.displacements)?;
    let (f_eff, u_f) = reduce_rhs_sparse(k_full, dof_num.n_free, &f, &u)?;
    Ok((stiff.k_ff, f_eff, u_f))
}

/// From the full sparse K (lower-triangle CSC, free DOFs first): the enclosure of
/// f_F − K_FR u_R and ũ_F.
fn reduce_rhs_sparse(
    k_full: &CscMatrix,
    nf: usize,
    f: &[f64],
    u: &[f64],
) -> Result<(Vec<Interval>, Vec<f64>), Certificate> {
    if !u.iter().all(|x| x.is_finite()) {
        return Err(Certificate::uncertified("non-finite displacement in solver output"));
    }
    Ok((sparse_rhs(k_full, nf, f, u), u[..nf].to_vec()))
}

/// Enclosure of f_F − K_FR u_R from the full sparse K (lower-triangle CSC,
/// free DOFs first): the free×restrained block is the rows i ≥ nf of the
/// columns j < nf.
fn sparse_rhs(k_full: &CscMatrix, nf: usize, f: &[f64], u: &[f64]) -> Vec<Interval> {
    let mut f_eff: Vec<Interval> = f[..nf].iter().map(|&x| Interval::point(x)).collect();
    for (j, fj) in f_eff.iter_mut().enumerate() {
        for p in k_full.col_ptr[j]..k_full.col_ptr[j + 1] {
            let i = k_full.row_idx[p];
            if i >= nf {
                *fj = sub_prod(*fj, k_full.values[p], u[i]);
            }
        }
    }
    f_eff
}

/// Reduced system from the full dense K (n×n, free DOFs first) and full u:
/// K_FF ũ_F = f_F − K_FR u_R, the right-hand side enclosed in intervals.
fn certify_reduced(k: &[f64], n: usize, nf: usize, f: &[f64], u: &[f64]) -> Certificate {
    if !u.iter().all(|x| x.is_finite()) {
        return Certificate::uncertified("non-finite displacement in solver output");
    }
    let mut k_ff = vec![0.0; nf * nf];
    for i in 0..nf {
        k_ff[i * nf..(i + 1) * nf].copy_from_slice(&k[i * n..i * n + nf]);
    }
    let f_eff = reduce_rhs_dense(k, n, nf, f, u);
    certify_linear_system_auto_interval_rhs(&k_ff, nf, &f_eff, &u[..nf])
}

/// `acc − v·x` in interval arithmetic, skipping exact zeros: an interval
/// product with a zero factor is widened outward to ±5e−324, which only
/// loosens the enclosure (that skip is why `v == 0 || x == 0` is equivalent
/// to `&&`; see .cargo/mutants.toml).
fn sub_prod(acc: Interval, v: f64, x: f64) -> Interval {
    if v == 0.0 || x == 0.0 {
        acc
    } else {
        acc - Interval::point(v) * Interval::point(x)
    }
}

/// Enclosure of f_F − K_FR u_R from the full dense K (n×n, free DOFs first).
fn reduce_rhs_dense(k: &[f64], n: usize, nf: usize, f: &[f64], u: &[f64]) -> Vec<Interval> {
    (0..nf)
        .map(|i| {
            let row = &k[i * n..(i + 1) * n];
            (nf..n).fold(Interval::point(f[i]), |acc, j| sub_prod(acc, row[j], u[j]))
        })
        .collect()
}

/// A stiffness whose coercivity has been certified once, ready to certify any
/// number of right-hand sides. Both variants hold the full K (free DOFs first)
/// so prescribed displacements can be moved to the right-hand side.
enum PreparedK {
    Dense { k: Vec<f64>, k_ff: Vec<f64>, n: usize, nf: usize, sigma: f64 },
    Sparse { k_ff: CscMatrix, k_full: CscMatrix, nf: usize, mu: f64 },
}

impl PreparedK {
    fn dense(k: Vec<f64>, n: usize, nf: usize) -> Result<Self, Certificate> {
        if k.len() != n * n || nf > n {
            return Err(Certificate::uncertified("dimension mismatch in assembled K"));
        }
        let mut k_ff = vec![0.0; nf * nf];
        for i in 0..nf {
            k_ff[i * nf..(i + 1) * nf].copy_from_slice(&k[i * n..i * n + nf]);
        }
        if !k_ff.iter().all(|x| x.is_finite()) {
            return Err(Certificate::uncertified("non-finite entry in K"));
        }
        let sigma = if nf == 0 { 0.0 } else { certify_sigma_auto(&k_ff, nf).map_err(Certificate::uncertified)? };
        Ok(PreparedK::Dense { k, k_ff, n, nf, sigma })
    }

    fn sparse(k_ff: CscMatrix, k_full: CscMatrix, nf: usize) -> Result<Self, Certificate> {
        if k_ff.n != nf {
            return Err(Certificate::uncertified("dimension mismatch in assembled K"));
        }
        if !k_ff.values.iter().all(|x| x.is_finite()) {
            return Err(Certificate::uncertified("non-finite entry in K"));
        }
        let mu = if nf == 0 {
            0.0
        } else {
            let vals: Vec<Interval> = k_ff.values.iter().map(|&x| Interval::point(x)).collect();
            certify_lambda_min_lower(&k_ff, &vals).map_err(Certificate::uncertified)?
        };
        Ok(PreparedK::Sparse { k_ff, k_full, nf, mu })
    }

    /// Certify the full displacement vector `u` (free DOFs first) against the
    /// full load vector `f`.
    fn certify(&self, f: &[f64], u: &[f64]) -> Certificate {
        if !u.iter().all(|x| x.is_finite()) {
            return Certificate::uncertified("non-finite displacement in solver output");
        }
        match self {
            PreparedK::Dense { k, k_ff, n, nf, sigma } => {
                let (n, nf) = (*n, *nf);
                if f.len() != n || u.len() != n {
                    return Certificate::uncertified("dimension mismatch in load or displacement vector");
                }
                let f_eff = reduce_rhs_dense(k, n, nf, f, u);
                certify_with_certified_sigma(k_ff, nf, &f_eff, &u[..nf], *sigma)
            }
            PreparedK::Sparse { k_ff, k_full, nf, mu } => {
                let nf = *nf;
                if f.len() < nf || u.len() < k_full.n {
                    return Certificate::uncertified("dimension mismatch in load or displacement vector");
                }
                let f_eff = sparse_rhs(k_full, nf, f, u);
                certify_with_certified_mu(k_ff, &f_eff, &u[..nf], *mu)
            }
        }
    }
}

/// Reduced system from the full sparse K (lower-triangle CSC, free DOFs first):
/// K_FF ũ_F = f_F − K_FR u_R, the right-hand side enclosed in intervals.
fn certify_reduced_sparse(k_ff: &CscMatrix, k_full: &CscMatrix, nf: usize, f: &[f64], u: &[f64]) -> Certificate {
    match reduce_rhs_sparse(k_full, nf, f, u) {
        Ok((f_eff, u_f)) => certify_sparse_spd_system(k_ff, &f_eff, &u_f),
        Err(c) => c,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// K = [[2, -1], [-1, 2]] with DOF 1 restrained: nf = 1, n = 2.
    fn k2() -> Vec<f64> {
        vec![2.0, -1.0, -1.0, 2.0]
    }

    /// Mismatched dimensions never reach the residual loops (they would read
    /// out of bounds or certify another system): PreparedK refuses them.
    /// (Mutants of these internal guards survived: no assembly produces them.)
    #[test]
    fn prepared_k_rejects_mismatched_dimensions() {
        assert!(PreparedK::dense(vec![1.0; 3], 2, 1).is_err(), "K not n×n");
        assert!(PreparedK::dense(k2(), 2, 3).is_err(), "nf > n");
        let p = PreparedK::dense(k2(), 2, 1).unwrap();
        assert!(p.certify(&[2.0, 0.0], &[1.0, 0.0]).is_certified());
        for (f, u) in [(&[2.0][..], &[1.0, 0.0][..]), (&[2.0, 0.0][..], &[1.0][..]), (&[2.0, 0.0, 0.0][..], &[1.0, 0.0, 0.0][..])] {
            assert!(!p.certify(f, u).is_certified(), "dense: f {f:?}, u {u:?}");
        }
        // Sparse: lower triangles of K_FF = [2] and of the full K.
        let k_ff = CscMatrix { n: 1, col_ptr: vec![0, 1], row_idx: vec![0], values: vec![2.0] };
        let k_full = CscMatrix { n: 2, col_ptr: vec![0, 2, 3], row_idx: vec![0, 1, 1], values: vec![2.0, -1.0, 2.0] };
        let p = PreparedK::sparse(k_ff, k_full, 1).unwrap();
        assert!(p.certify(&[2.0, 0.0], &[1.0, 0.0]).is_certified());
        for (f, u) in [(&[][..], &[1.0, 0.0][..]), (&[2.0, 0.0][..], &[1.0][..])] {
            assert!(!p.certify(f, u).is_certified(), "sparse: f {f:?}, u {u:?}");
        }
    }
}
