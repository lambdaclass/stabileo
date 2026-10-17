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
use super::forces::{force_bounds_2d, force_bounds_3d, shell_bounds_3d, ForceBound2D, ForceBound3D, ShellBound};
use super::interval::Interval;
use super::linear::{
    certify_linear_system_auto_interval_rhs, certify_sigma_auto, certify_with_certified_sigma, Certificate, MAX_CERTIFY_N,
};
use super::sparse::{certify_lambda_min_lower, certify_sparse_spd_system, certify_with_certified_mu};
use crate::linalg::sparse::CscMatrix;
use crate::solver::assembly::{
    assemble_2d, assemble_load_vector_2d, assemble_load_vector_3d_dense, assemble_sparse_3d, assemble_stiffness_2d,
    assemble_stiffness_3d, assemble_stiffness_sparse_3d, InclinedTransformData, InclinedTransformData2D,
};
use crate::solver::constraints::build_constraint_transform;
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
}

/// `certify_linear_2d` plus per-member force bounds.
pub fn certify_linear_2d_full(input: &SolverInput) -> Result<CertifiedResults2D, String> {
    let (results, certificate) = certify_linear_2d(input)?;
    let force_bounds = certificate.abs_bound().map(|b| force_bounds_2d(input, b)).unwrap_or_default();
    Ok(CertifiedResults2D { results, certificate, force_bounds })
}

/// `certify_linear_3d` plus per-member force bounds and shell resultant bounds.
pub fn certify_linear_3d_full(input: &SolverInput3D) -> Result<CertifiedResults3D, String> {
    let (results, certificate) = certify_linear_3d(input)?;
    let expanded = expand_curved_beams_3d(input);
    let (force_bounds, shell_bounds) = match certificate.abs_bound() {
        Some(b) => (force_bounds_3d(&expanded, b), shell_bounds_3d(&expanded, b)),
        None => Default::default(),
    };
    Ok(CertifiedResults3D { results, certificate, force_bounds, shell_bounds })
}

/// Solve a 2D linear static model with `solve_2d` and certify its displacements.
pub fn certify_linear_2d(input: &SolverInput) -> Result<(AnalysisResults, Certificate), String> {
    let results = solve_2d(input)?;
    let cert = certify_results_2d(input, &results);
    Ok((results, cert))
}

/// Solve a 3D linear static model with `solve_3d` and certify its displacements.
pub fn certify_linear_3d(input: &SolverInput3D) -> Result<(AnalysisResults3D, Certificate), String> {
    let results = solve_3d(input)?;
    let cert = certify_results_3d(input, &results);
    Ok((results, cert))
}

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
pub fn certify_results_2d(input: &SolverInput, results: &AnalysisResults) -> Certificate {
    if needs_general_2d(input) {
        return certify_general_2d(input, results);
    }
    certify_load_cases_2d(input, &[(&input.loads, results)]).pop().expect("one case")
}

fn needs_general_2d(input: &SolverInput) -> bool {
    !input.constraints.is_empty() || input.supports.values().any(|s| s.support_type == "inclinedRoller")
}

fn needs_general_3d(input: &SolverInput3D) -> bool {
    !input.constraints.is_empty() || input.supports.values().any(|s| s.is_inclined.unwrap_or(false))
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
    if nf >= SPARSE_THRESHOLD {
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
    let cm = ConstraintMap::from_transform(
        &build_constraint_transform(&input.constraints, dof_num, Some(&input.nodes), None),
        nf,
    );
    let sparse_path = nf >= SPARSE_THRESHOLD
        && results.structured_diagnostics.iter().any(|d| d.code == DiagnosticCode::SparseCholesky);
    if sparse_path {
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
        let sups: Vec<&SolverSupport> = input.supports.values().filter(|s| s.node_id == it.node_id).collect();
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
pub fn certify_load_cases_2d(input: &SolverInput, cases: &[(&[SolverLoad], &AnalysisResults)]) -> Vec<Certificate> {
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
    let prepared = if dof_num.n_free >= SPARSE_THRESHOLD {
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
pub fn certify_results_3d(input: &SolverInput3D, results: &AnalysisResults3D) -> Certificate {
    let expanded = expand_curved_beams_3d(input);
    if needs_general_3d(&expanded) {
        return certify_general_3d(input, results);
    }
    certify_load_cases_3d(input, &[(&input.loads, results)]).pop().expect("one case")
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
        let cm = ConstraintMap::from_transform(
            &build_constraint_transform(&input.constraints, &dof_num, None, Some(&input.nodes)),
            nf,
        );
        let k = KRef::Sparse { k_ff: &sasm.k_ff, k_full };
        let cert = certify_constrained_system(&k, nf, &sasm.f, &u, &cm);
        return rotate_back(cert, &rots, &u, &u_glob);
    }
    if nf >= SPARSE_THRESHOLD {
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
        let sups: Vec<&SolverSupport3D> = input.supports.values().filter(|s| s.node_id == it.node_id).collect();
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
    let sparse = dof_num.n_free >= SPARSE_THRESHOLD;
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
    if input.supports.values().any(|s| s.support_type == "inclinedRoller") {
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
    if input.supports.values().any(|s| s.is_inclined.unwrap_or(false)) {
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
