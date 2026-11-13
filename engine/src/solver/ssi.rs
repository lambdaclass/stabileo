/// Soil-Structure Interaction (SSI) solver with nonlinear p-y/t-z/q-z curves.
///
/// Extends Winkler foundation analysis with iterative secant stiffness updates.
/// Springs along pile elements are updated based on displacement-dependent
/// soil reaction curves.
///
/// Iteration scheme:
/// 1. Assemble structure stiffness K
/// 2. Add secant soil spring stiffnesses along pile elements
/// 3. Solve K*u = F
/// 4. Evaluate soil curves at computed displacements
/// 5. Update secant stiffnesses
/// 6. Repeat until convergence

use serde::{Serialize, Deserialize};
use crate::types::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly::{self, InclinedFrame};
use super::linear;
use super::soil_curves::{SoilCurve, evaluate_soil_curve};
use super::constraints::{FreeConstraintSystem, MasterMotion};
use super::sparse_tangent::SparseSymbolicCache;

/// The soil springs at their current secants as stiffness triplets in the
/// frames K was assembled in (each unordered pair once). A spring acts along a
/// global axis, so at an inclined support it is R·k·Rᵀ over the support's
/// translations, coupling them, not k on the rotated slot of the same index.
fn spring_triplets<T: InclinedFrame>(
    springs: &[SoilSpring], spring_k: &[f64], dof_num: &DofNumbering, its: &[T],
) -> (Vec<usize>, Vec<usize>, Vec<f64>) {
    let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
    for (si, spring) in springs.iter().enumerate() {
        let dir = spring.direction.min(dof_num.dofs_per_node - 1);
        if let Some(&d) = dof_num.map.get(&(spring.node_id, dir)) {
            rows.push(d);
            cols.push(d);
            vals.push(spring_k[si]);
        }
    }
    for it in its {
        it.rotate_triplets(&mut rows, &mut cols, &mut vals);
    }
    (rows, cols, vals)
}

fn residual<T: InclinedFrame>(
    mut balance: super::equilibrium::Residual,
    springs: &[SoilSpring],
    dof_num: &DofNumbering,
    its: &[T],
    u_global: &[f64],
) -> Result<Vec<f64>, String> {
    let mut soil = vec![0.0; dof_num.n_total];
    for spring in springs {
        if let Some(d) = dof_num.global_dof(spring.node_id, spring.direction) {
            soil[d] += evaluate_soil_curve(&spring.curve, u_global[d])?.0 * spring.length_factor();
        }
    }
    for it in its {
        it.rotate(&mut soil);
    }
    for (i, force) in soil.into_iter().enumerate() {
        balance.subtract_force(i, force);
    }
    Ok(balance.finish().into_iter().map(|r| -r).collect())
}

fn relative_stiffness_change(old: f64, new: f64) -> f64 {
    if !old.is_finite() || !new.is_finite() {
        f64::INFINITY
    } else if old == new {
        0.0
    } else if old == 0.0 || new == 0.0 {
        f64::INFINITY
    } else {
        (new - old).abs() / old.abs().max(new.abs())
    }
}

#[cfg(test)]
fn dense_ku(k: &[f64], n: usize, u_frame: &[f64]) -> Vec<f64> {
    super::equilibrium::dense_residual(k, &vec![0.0; n], u_frame).into_iter().map(|r| -r).collect()
}

#[cfg(test)]
fn sparse_ku(k_full: &crate::linalg::sparse::CscMatrix, n: usize, u_frame: &[f64]) -> Vec<f64> {
    let mut u = u_frame.to_vec();
    u.resize(n, 0.0);
    super::equilibrium::sparse_residual(k_full, &vec![0.0; n], &u).into_iter().map(|r| -r).collect()
}

fn dense_balance(k: &[f64], n: usize, u_frame: &[f64], f: &[f64]) -> super::equilibrium::Residual {
    assert_eq!(f.len(), n);
    super::equilibrium::dense_balance(k, f, u_frame)
}

fn sparse_balance(k: &CscMatrix, n: usize, u_frame: &[f64], f: &[f64]) -> super::equilibrium::Residual {
    let mut u = u_frame.to_vec();
    u.resize(n, 0.0);
    super::equilibrium::sparse_balance(k, f, &u)
}

fn dense_free_stiffness(k: &[f64], n: usize, nf: usize) -> CscMatrix {
    let (mut col_ptr, mut row_idx, mut values) = (vec![0], Vec::new(), Vec::new());
    for j in 0..nf {
        for i in j..nf {
            let value = k[i * n + j];
            if value != 0.0 {
                row_idx.push(i);
                values.push(value);
            }
        }
        col_ptr.push(values.len());
    }
    CscMatrix { n: nf, col_ptr, row_idx, values }
}

fn secant_system(
    base: &CscMatrix,
    soil: (Vec<usize>, Vec<usize>, Vec<f64>),
    nf: usize,
    cs: Option<&FreeConstraintSystem>,
) -> CscMatrix {
    let (rows, cols, values) = soil;
    let mut sr = Vec::new();
    let mut sc = Vec::new();
    let mut sv = Vec::new();
    for ((r, c), v) in rows.into_iter().zip(cols).zip(values) {
        if r < nf && c < nf {
            sr.push(r);
            sc.push(c);
            sv.push(v);
        }
    }
    let soil = CscMatrix::from_triplets(nf, &sr, &sc, &sv);
    let soil = cs.map_or_else(|| soil.clone(), |cs| cs.reduce_matrix_sparse(&soil));
    let (mut rows, mut cols, mut values) = (Vec::new(), Vec::new(), Vec::new());
    for k in [base, &soil] {
        for j in 0..k.n {
            for p in k.col_ptr[j]..k.col_ptr[j + 1] {
                rows.push(k.row_idx[p]);
                cols.push(j);
                values.push(k.values[p]);
            }
        }
    }
    CscMatrix::from_triplets(base.n, &rows, &cols, &values)
}

enum SecantFactor {
    Dense { factor: Vec<f64>, n: usize },
    Sparse(NumericCholesky),
    Lu { matrix: Vec<f64>, n: usize },
}

impl SecantFactor {
    fn new(
        k: &CscMatrix,
        sparse: bool,
        cache: &mut Option<SparseSymbolicCache>,
        conditioning: &mut Option<StructuredDiagnostic>,
    ) -> Result<Self, String> {
        if sparse {
            let factor = numeric_cholesky(super::sparse_tangent::cached_symbolic(cache, k), k);
            if let Some(found) = crate::known_issues::sparse_factor_conditioning(k, factor.as_ref())
            {
                *conditioning = Some(found);
            }
            if let Some(factor) = factor {
                return Ok(Self::Sparse(factor));
            }
            if k.n > super::time_integration::MAX_DENSE_FALLBACK_DOFS {
                return Err(format!("SSI tangent stiffness is not SPD and exceeds the dense LU fallback ceiling ({} DOFs)", k.n));
            }
        }
        let dense = k.to_dense_symmetric();
        if !sparse {
            let mut factor = dense.clone();
            let success = cholesky_decompose(&mut factor, k.n);
            if let Some(found) = crate::known_issues::dense_factor_conditioning(
                &dense,
                k.n,
                success.then_some(factor.as_slice()),
            ) {
                *conditioning = Some(found);
            }
            if success {
                return Ok(Self::Dense { factor, n: k.n });
            }
        }
        Ok(Self::Lu {
            matrix: dense,
            n: k.n,
        })
    }

    fn solve(&self, rhs: &[f64]) -> Result<Vec<f64>, String> {
        match self {
            Self::Dense { factor, n } => {
                Ok(back_solve(factor, &forward_solve(factor, rhs, *n), *n))
            }
            Self::Sparse(factor) => Ok(sparse_cholesky_solve(factor, rhs)),
            Self::Lu { matrix, n } => lu_solve(&mut matrix.clone(), &mut rhs.to_vec(), *n)
                .ok_or_else(|| "Singular stiffness in SSI iteration".into()),
        }
    }

    fn initial_solution(&self, k: &CscMatrix, rhs: &[f64]) -> Result<Vec<f64>, String> {
        let u = self.solve(rhs)?;
        if matches!(self, Self::Lu { .. }) {
            return Ok(u);
        }
        Ok(super::equilibrium::refine(
            u,
            |rhs| self.solve(rhs).unwrap(),
            |u| match self {
                Self::Dense { .. } => super::equilibrium::dense_residual(&k.to_dense_symmetric(), rhs, u),
                _ => super::equilibrium::sparse_residual(k, rhs, u),
            },
        ))
    }
}

struct SecantState {
    k: CscMatrix,
    factor: SecantFactor,
    u: Vec<f64>,
    rounding_round: f64,
}

impl SecantState {
    fn update(
        state: &mut Option<Self>,
        k: CscMatrix,
        force: &[f64],
        sparse: bool,
        cache: &mut Option<SparseSymbolicCache>,
        conditioning: &mut Option<StructuredDiagnostic>,
    ) -> Result<(), String> {
        if state.as_ref().is_some_and(|s| {
            s.k.col_ptr == k.col_ptr
                && s.k.row_idx == k.row_idx
                && s.k
                    .values
                    .iter()
                    .map(|v| v.to_bits())
                    .eq(k.values.iter().map(|v| v.to_bits()))
        }) {
            return Ok(());
        }
        let factor = SecantFactor::new(&k, sparse, cache, conditioning)?;
        let u = factor.initial_solution(&k, force)?;
        *state = Some(Self {
            k,
            factor,
            u,
            rounding_round: 0.0,
        });
        Ok(())
    }
}

fn refine_secant<T: InclinedFrame>(
    state: &mut SecantState,
    nf: usize,
    n: usize,
    cs: Option<&FreeConstraintSystem>,
    its: &[T],
    springs: &[SoilSpring],
    dof_num: &DofNumbering,
    balance: impl Fn(&[f64]) -> super::equilibrium::Residual,
    metric: &super::convergence::EquilibriumMetric,
    force: &[f64],
    tolerance: f64,
) -> Result<(), String> {
    let is_linear = |u: &[f64]| {
        let frame = cs.map_or_else(
            || u.to_vec(),
            |cs| cs.expand_solution(u, MasterMotion::Homogeneous),
        );
        let global = assembly::to_global(&frame, n, its);
        springs.iter().all(|spring| {
            dof_num
                .global_dof(spring.node_id, spring.direction)
                .is_some_and(|d| spring.curve.is_in_initial_linear_range(global[d]))
        })
    };
    if !is_linear(&state.u) {
        return Ok(());
    }
    let physical_residual = |u: &[f64]| {
        let frame = cs.map_or_else(
            || u.to_vec(),
            |cs| cs.expand_solution(u, MasterMotion::Homogeneous),
        );
        let global = assembly::to_global(&frame, n, its);
        residual(balance(&frame), springs, dof_num, its, &global)
    };
    let accepted = |u: &[f64]| -> Result<bool, String> {
        Ok(is_linear(u)
            && metric.relative_residual(&physical_residual(u)?, force, None, cs) < tolerance)
    };
    if accepted(&state.u)? {
        return Ok(());
    }
    let (u, _) = super::equilibrium::refine_solution(
        state.u.clone(),
        |u| {
            let r = physical_residual(u)?;
            let rhs: Vec<_> = r[..nf].iter().map(|v| -v).collect();
            state
                .factor
                .solve(&cs.map_or_else(|| rhs.clone(), |cs| cs.reduce_vector(&rhs)))
        },
        |u, _| accepted(u),
    )?;
    let measure = |u: &[f64]| -> Result<f64, String> {
        if !is_linear(u) {
            return Ok(f64::INFINITY);
        }
        Ok(metric.relative_residual(&physical_residual(u)?, force, None, cs))
    };
    let diagonal = state.k.diagonal();
    let polish = |u: &[f64]| {
        let r = physical_residual(u)?;
        let rhs: Vec<_> = r[..nf].iter().map(|v| -v).collect();
        let rhs = cs.map_or_else(|| rhs.clone(), |cs| cs.reduce_vector(&rhs));
        Ok(rhs
            .iter()
            .zip(&diagonal)
            .map(|(r, d)| if *d == 0.0 { 0.0 } else { r / d })
            .collect())
    };
    let mut candidates = vec![u, state.u.clone()];
    for center in candidates.clone() {
        if accepted(&center)? {
            state.u = center;
            return Ok(());
        }
        candidates.push(super::equilibrium::round_solution(
            center,
            state.rounding_round,
            measure,
            |value| value < tolerance,
            polish,
        )?);
        if accepted(candidates.last().unwrap())? {
            state.u = candidates.pop().unwrap();
            return Ok(());
        }
    }
    for candidate in candidates {
        if measure(&candidate)? < measure(&state.u)? {
            state.u = candidate;
        }
    }
    state.rounding_round += 1.0;
    Ok(())
}

/// Soil spring attached to a node along a pile.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoilSpring {
    /// Node ID where the spring is attached
    pub node_id: usize,
    /// Direction: 0=X, 1=Z (2D) or 0=X, 1=Y, 2=Z (3D)
    pub direction: usize,
    /// Soil curve type
    pub curve: SoilCurve,
    /// Tributary length for this spring (m): the curve's reaction per metre
    /// of pile (p-y, t-z, custom) times this is the spring force. Not used by
    /// a q-z tip spring, whose curve already returns a force.
    pub tributary_length: f64,
}

impl SoilSpring {
    /// What the curve's reaction is multiplied by: the tributary length for
    /// curves per unit length of pile (p-y, t-z, custom), 1 for the q-z tip
    /// spring, whose reaction is already a force.
    pub fn length_factor(&self) -> f64 {
        if self.curve.is_point_spring() { 1.0 } else { self.tributary_length }
    }
}

/// Refuse a spring whose curve is invalid or misses a parameter its reference
/// needs, or whose tributary length is not a non-negative number.
fn validate_springs(springs: &[SoilSpring]) -> Result<(), String> {
    for (i, s) in springs.iter().enumerate() {
        s.curve.validate().map_err(|e| format!("Soil spring {i} (node {}): {e}", s.node_id))?;
        if !s.curve.is_point_spring() && !(s.tributary_length.is_finite() && s.tributary_length >= 0.0) {
            return Err(format!("Soil spring {i} (node {}): tributary length {} must be non-negative and finite", s.node_id, s.tributary_length));
        }
    }
    Ok(())
}

/// Refuse a spring on a node the model does not have, or along a direction that
/// is not a translation (2D: 0 = X, 1 = Z; 3D: 0, 1, 2): its displacement would
/// be read as zero, or a soil force put on a rotation.
fn check_spring_dofs(springs: &[SoilSpring], dof_num: &DofNumbering, n_trans: usize) -> Result<(), String> {
    for (i, s) in springs.iter().enumerate() {
        if s.direction >= n_trans {
            return Err(format!("Soil spring {i} (node {}): direction {} is not a translation (0 to {})", s.node_id, s.direction, n_trans - 1));
        }
        if !dof_num.map.contains_key(&(s.node_id, s.direction)) {
            return Err(format!("Soil spring {i}: node {} is not in the model", s.node_id));
        }
    }
    Ok(())
}

/// SSI analysis input (2D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SSIInput {
    pub solver: SolverInput,
    pub soil_springs: Vec<SoilSpring>,
    #[serde(default = "default_max_iter")]
    pub max_iter: usize,
    #[serde(default = "default_tolerance")]
    pub tolerance: f64,
}

/// SSI analysis input (3D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SSIInput3D {
    #[serde(deserialize_with = "crate::types::units::deserialize_input_3d")]
    pub solver: SolverInput3D,
    pub soil_springs: Vec<SoilSpring>,
    #[serde(default = "default_max_iter")]
    pub max_iter: usize,
    #[serde(default = "default_tolerance")]
    pub tolerance: f64,
}

fn default_max_iter() -> usize { 50 }
fn default_tolerance() -> f64 { 1e-4 }

/// SSI analysis result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SSIResult {
    pub results: AnalysisResults,
    pub iterations: usize,
    pub converged: bool,
    pub spring_results: Vec<SpringResult>,
}

/// SSI analysis result (3D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SSIResult3D {
    pub results: AnalysisResults3D,
    pub iterations: usize,
    pub converged: bool,
    pub spring_results: Vec<SpringResult>,
}

/// Per-spring result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpringResult {
    pub node_id: usize,
    pub direction: usize,
    pub displacement: f64,
    pub reaction: f64,
    pub secant_stiffness: f64,
}

/// Solve a 2D SSI problem with nonlinear soil springs.
pub fn solve_ssi_2d(input: &SSIInput) -> Result<SSIResult, String> {
    let mut r = solve_ssi_2d_inner(input)?;
    crate::known_issues::attach(&mut r.results.structured_diagnostics, crate::known_issues::for_2d(&input.solver, crate::known_issues::Analysis::Ssi));
    Ok(r)
}

fn solve_ssi_2d_inner(input: &SSIInput) -> Result<SSIResult, String> {
    super::linear::validate_input_2d(&input.solver)?;
    validate_springs(&input.soil_springs)?;
    // The secant solve does not impose prescribed displacements. Inclined
    // supports are solved in their frames (fix/inclined-supports).
    super::feature_gates::refuse_2d(&input.solver, "Soil-structure interaction analysis", &[super::feature_gates::Feature::PrescribedDisplacements])?;

    let dof_num = DofNumbering::build_2d(&input.solver);
    check_spring_dofs(&input.soil_springs, &dof_num, 2)?;
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Constraint system (built once before iteration)
    let cs = FreeConstraintSystem::build_2d(&input.solver, &dof_num)?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Dispatch dense vs sparse once per solve call (not per iteration).
    let use_sparse = ns >= linear::SPARSE_THRESHOLD;

    // Base assembly (without soil springs). Below the sparse threshold: the
    // legacy dense n×n path, unchanged. At or above it: CSC assembly (k_ff
    // for the per-iteration solves) — no dense n×n matrix is ever built.
    let dense_asm = if use_sparse {
        None
    } else {
        Some(assembly::assemble_2d(&input.solver, &dof_num))
    };
    let sparse_stiff = if use_sparse {
        Some(super::sparse_assembly::assemble_stiffness_sparse_2d(&input.solver, &dof_num))
    } else {
        None
    };
    let f_global = if let Some(ref s) = sparse_stiff {
        assembly::assemble_load_vector_2d(
            &input.solver, &input.solver.loads, &dof_num, &s.inclined_transforms_2d,
        )
    } else {
        dense_asm.as_ref().unwrap().f.clone()
    };

    // K and F are in the inclined-support frames (the same by either
    // assembler); the springs are rotated into them and the solution back.
    let its: &[assembly::InclinedTransformData2D] = if let Some(ref s) = sparse_stiff {
        &s.inclined_transforms_2d
    } else {
        &dense_asm.as_ref().unwrap().inclined_transforms_2d
    };

    let base = if let Some(ref sparse) = sparse_stiff {
        sparse.k_ff.clone()
    } else {
        dense_free_stiffness(&dense_asm.as_ref().unwrap().k, n, nf)
    };
    let base = cs.as_ref().map_or_else(|| base.clone(), |cs| cs.reduce_matrix_sparse(&base));
    let force = cs.as_ref().map_or_else(|| f_global[..nf].to_vec(), |cs| cs.reduce_vector(&f_global[..nf]));

    // Initialize secant stiffnesses (use initial tangent from curves)
    let mut spring_k: Vec<f64> = input.soil_springs.iter()
        .map(|s| {
            let (_, k0) = evaluate_soil_curve(&s.curve, 0.0)?;
            Ok(k0 * s.length_factor())
        })
        .collect::<Result<_, String>>()?;

    let mut u_full = vec![0.0; n];
    let mut u_frame = vec![0.0; nf];
    let mut converged = false;
    let mut total_iters = 0;
    let mut conditioning = None;

    let (sr, sc, sv) = spring_triplets(&input.soil_springs, &spring_k, &dof_num, its);
    let extra: Vec<_> = sr.into_iter().zip(sc).zip(sv)
        .filter_map(|((r,c),v)|(r==c).then_some((r,v))).collect();
    let metric = super::convergence::EquilibriumMetric::for_2d_with_state(
        &input.solver, &dof_num, cs.as_ref(), None, &extra,
    )?;
    // Sparse symbolic Cholesky reused across iterations (spring stiffnesses
    // change values, not the pattern; the fingerprinted cache rebuilds the
    // symbolic if an entry ever crosses exactly zero).
    let mut sparse_sym_cache: Option<SparseSymbolicCache> = None;

    let mut secant_state = None;
    for iter in 0..input.max_iter {
        total_iters = iter + 1;

        let k = secant_system(&base, spring_triplets(&input.soil_springs, &spring_k, &dof_num, its), nf, cs.as_ref());
        SecantState::update(&mut secant_state, k, &force, use_sparse, &mut sparse_sym_cache, &mut conditioning)?;
        let state = secant_state.as_mut().unwrap();
        let u_indep = state.u.clone();

        let u_f = if let Some(ref cs) = cs {
            cs.expand_solution(&u_indep, MasterMotion::Homogeneous)
        } else {
            u_indep
        };

        // In global axes from here on (soil curves, results); `u_f` stays in
        // K's frames for the constraint forces.
        u_full = assembly::to_global(&u_f, n, its);
        u_frame = u_f;

        // Update soil spring stiffnesses
        let mut max_change = 0.0_f64;

        for (si, spring) in input.soil_springs.iter().enumerate() {
            let dir = spring.direction.min(dof_num.dofs_per_node - 1);
            let disp = dof_num.map.get(&(spring.node_id, dir))
                .map(|&d| u_full[d])
                .unwrap_or(0.0);

            let (_reaction, k_secant) = evaluate_soil_curve(&spring.curve, disp)?;
            let new_k = k_secant * spring.length_factor();

            let old_k = spring_k[si];
            max_change = max_change.max(relative_stiffness_change(old_k, new_k));

            spring_k[si] = new_k;
        }

        if max_change < input.tolerance && iter > 0 {
            refine_secant(state, nf, n, cs.as_ref(), its, &input.soil_springs, &dof_num,
                |frame| if let Some(ref s) = sparse_stiff {
                    sparse_balance(&s.k_full, n, frame, &f_global)
                } else { dense_balance(&dense_asm.as_ref().unwrap().k, n, frame, &f_global) },
                &metric, &f_global, input.tolerance)?;
            u_frame = cs.as_ref().map_or_else(|| state.u.clone(), |cs|cs.expand_solution(&state.u, MasterMotion::Homogeneous));
            u_full = assembly::to_global(&u_frame, n, its);
            for (si, spring) in input.soil_springs.iter().enumerate() {
                let disp = dof_num.global_dof(spring.node_id, spring.direction).map_or(0.0, |d|u_full[d]);
                let new_k = evaluate_soil_curve(&spring.curve, disp)?.1 * spring.length_factor();
                max_change = max_change.max(relative_stiffness_change(spring_k[si], new_k));
                spring_k[si] = new_k;
            }
            let ku = if let Some(ref s) = sparse_stiff {
                sparse_balance(&s.k_full, n, &u_frame, &f_global)
            } else { dense_balance(&dense_asm.as_ref().unwrap().k, n, &u_frame, &f_global) };
            let r = residual(ku, &input.soil_springs, &dof_num, its, &u_full)?;
            if max_change < input.tolerance && metric.relative_residual(&r, &f_global, None, cs.as_ref()) < input.tolerance {
                converged = true;
                break;
            }
        }
    }

    // Build final results
    let displacements = linear::build_displacements_2d(&dof_num, &u_full);
    let element_forces = linear::compute_internal_forces_2d(&input.solver, &dof_num, &u_full);

    let spring_results: Vec<SpringResult> = input.soil_springs.iter().enumerate()
        .map(|(si, spring)| {
            let dir = spring.direction.min(dof_num.dofs_per_node - 1);
            let disp = dof_num.map.get(&(spring.node_id, dir))
                .map(|&d| u_full[d])
                .unwrap_or(0.0);
            let (reaction, _) = evaluate_soil_curve(&spring.curve, disp)?;
            Ok(SpringResult {
                node_id: spring.node_id,
                direction: spring.direction,
                displacement: disp,
                reaction: reaction * spring.length_factor(),
                secant_stiffness: spring_k[si],
            })
        })
        .collect::<Result<_, String>>()?;

    let ku = if let Some(ref s) = sparse_stiff {
        sparse_balance(&s.k_full, n, &u_frame, &f_global)
    } else {
        dense_balance(&dense_asm.as_ref().unwrap().k, n, &u_frame, &f_global)
    };
    let mut free_residual = residual(ku, &input.soil_springs, &dof_num, its, &u_full)?;
    let mut reactions_vec = free_residual.split_off(nf);
    let constraint_forces = if let Some(ref fcs) = cs {
        let raw = fcs.constraint_forces_from_residual(&free_residual);
        fcs.add_restrained_master_forces(&raw, &mut reactions_vec);
        fcs.constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };
    let mut reactions = linear::build_reactions_2d_inclined(
        &input.solver, &dof_num, &reactions_vec, &f_global[nf..], nf, &u_full, its,
    );
    reactions.sort_by_key(|r| r.node_id);

    Ok(SSIResult {
        results: AnalysisResults {
            displacements,
            reactions,
            element_forces,
            constraint_forces,
            diagnostics: vec![],
            solver_diagnostics: vec![],
            structured_diagnostics: conditioning.into_iter().collect(),
            equilibrium: None,
            result_summary: None, solver_run_meta: None,
        },
        iterations: total_iters,
        converged,
        spring_results,
    })
}

/// Solve a 3D SSI problem with nonlinear soil springs.
pub fn solve_ssi_3d(input: &SSIInput3D) -> Result<SSIResult3D, String> {
    let mut r = solve_ssi_3d_inner(input)?;
    crate::known_issues::membrane_bending_3d(&input.solver, &input.solver.loads, &r.results)?;
    crate::known_issues::attach(&mut r.results.structured_diagnostics, crate::known_issues::for_3d(&input.solver, crate::known_issues::Analysis::Ssi));
    Ok(r)
}

fn solve_ssi_3d_inner(input: &SSIInput3D) -> Result<SSIResult3D, String> {
    super::linear::validate_input_3d(&input.solver)?;
    validate_springs(&input.soil_springs)?;
    super::feature_gates::refuse_3d(&input.solver, "Soil-structure interaction analysis", &[super::feature_gates::Feature::PrescribedDisplacements])?;

    // Expand curved beams before DOF numbering and assembly.
    let expanded_solver = super::linear::expand_curved_beams_3d(&input.solver);
    let dof_num = DofNumbering::build_3d(&expanded_solver);
    check_spring_dofs(&input.soil_springs, &dof_num, 3)?;
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Constraint system (built once before iteration). Use the expanded model:
    // expansion adds new nodes/elements but preserves the original IDs that
    // constraints reference.
    let cs = FreeConstraintSystem::build_3d(&expanded_solver, &dof_num)?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Dispatch dense vs sparse once per solve call (not per iteration).
    let use_sparse = ns >= linear::SPARSE_THRESHOLD;

    // Base assembly (without soil springs). Below the sparse threshold: the
    // legacy dense n×n path, unchanged. At or above it: CSC assembly (k_ff
    // for the per-iteration solves, k_full for the reactions) — no dense n×n
    // matrix is ever built.
    let dense_asm = if use_sparse {
        None
    } else {
        Some(assembly::assemble_3d(&expanded_solver, &dof_num))
    };
    let sparse_asm = if use_sparse {
        Some(assembly::assemble_sparse_3d(&expanded_solver, &dof_num, true))
    } else {
        None
    };
    let f_global = if let Some(ref s) = sparse_asm {
        s.f.clone()
    } else {
        dense_asm.as_ref().unwrap().f.clone()
    };

    // In the inclined-support frames, as in 2D.
    let its: &[assembly::InclinedTransformData] = if let Some(ref s) = sparse_asm {
        &s.inclined_transforms
    } else {
        &dense_asm.as_ref().unwrap().inclined_transforms
    };

    let base = if let Some(ref sparse) = sparse_asm {
        sparse.k_ff.clone()
    } else {
        dense_free_stiffness(&dense_asm.as_ref().unwrap().k, n, nf)
    };
    let base = cs.as_ref().map_or_else(|| base.clone(), |cs| cs.reduce_matrix_sparse(&base));
    let force = cs.as_ref().map_or_else(|| f_global[..nf].to_vec(), |cs| cs.reduce_vector(&f_global[..nf]));

    let mut spring_k: Vec<f64> = input.soil_springs.iter()
        .map(|s| {
            let (_, k0) = evaluate_soil_curve(&s.curve, 0.0)?;
            Ok(k0 * s.length_factor())
        })
        .collect::<Result<_, String>>()?;

    let mut u_full = vec![0.0; n];
    let mut u_frame = vec![0.0; nf];
    let mut converged = false;
    let mut total_iters = 0;
    let mut conditioning = None;

    let (sr, sc, sv) = spring_triplets(&input.soil_springs, &spring_k, &dof_num, its);
    let extra: Vec<_> = sr.into_iter().zip(sc).zip(sv)
        .filter_map(|((r,c),v)|(r==c).then_some((r,v))).collect();
    let metric = super::convergence::EquilibriumMetric::for_3d_with_state(
        &expanded_solver, &dof_num, cs.as_ref(), None, &extra,
    )?;
    // Sparse symbolic Cholesky reused across iterations (spring stiffnesses
    // change values, not the pattern; the fingerprinted cache rebuilds the
    // symbolic if an entry ever crosses exactly zero).
    let mut sparse_sym_cache: Option<SparseSymbolicCache> = None;

    let mut secant_state = None;
    for iter in 0..input.max_iter {
        total_iters = iter + 1;

        let k = secant_system(&base, spring_triplets(&input.soil_springs, &spring_k, &dof_num, its), nf, cs.as_ref());
        SecantState::update(&mut secant_state, k, &force, use_sparse, &mut sparse_sym_cache, &mut conditioning)?;
        let state = secant_state.as_mut().unwrap();
        let u_indep = state.u.clone();

        let u_f = if let Some(ref cs) = cs {
            cs.expand_solution(&u_indep, MasterMotion::Homogeneous)
        } else {
            u_indep
        };

        // In global axes from here on (soil curves, results); `u_f` stays in
        // K's frames for the constraint forces.
        u_full = assembly::to_global(&u_f, n, its);
        u_frame = u_f;

        let mut max_change = 0.0_f64;

        for (si, spring) in input.soil_springs.iter().enumerate() {
            let dir = spring.direction.min(dof_num.dofs_per_node - 1);
            let disp = dof_num.map.get(&(spring.node_id, dir))
                .map(|&d| u_full[d])
                .unwrap_or(0.0);

            let (_reaction, k_secant) = evaluate_soil_curve(&spring.curve, disp)?;
            let new_k = k_secant * spring.length_factor();

            let old_k = spring_k[si];
            max_change = max_change.max(relative_stiffness_change(old_k, new_k));

            spring_k[si] = new_k;
        }

        if max_change < input.tolerance && iter > 0 {
            refine_secant(state, nf, n, cs.as_ref(), its, &input.soil_springs, &dof_num,
                |frame| if let Some(ref s) = sparse_asm {
                    sparse_balance(s.k_full.as_ref().ok_or("SSI: sparse assembly without the full stiffness").unwrap(), n, frame, &f_global)
                } else { dense_balance(&dense_asm.as_ref().unwrap().k, n, frame, &f_global) },
                &metric, &f_global, input.tolerance)?;
            u_frame = cs.as_ref().map_or_else(|| state.u.clone(), |cs|cs.expand_solution(&state.u, MasterMotion::Homogeneous));
            u_full = assembly::to_global(&u_frame, n, its);
            for (si, spring) in input.soil_springs.iter().enumerate() {
                let disp = dof_num.global_dof(spring.node_id, spring.direction).map_or(0.0, |d|u_full[d]);
                let new_k = evaluate_soil_curve(&spring.curve, disp)?.1 * spring.length_factor();
                max_change = max_change.max(relative_stiffness_change(spring_k[si], new_k));
                spring_k[si] = new_k;
            }
            let ku = if let Some(ref s) = sparse_asm {
                sparse_balance(s.k_full.as_ref().ok_or("SSI: sparse assembly without the full stiffness")?, n, &u_frame, &f_global)
            } else { dense_balance(&dense_asm.as_ref().unwrap().k, n, &u_frame, &f_global) };
            let r = residual(ku, &input.soil_springs, &dof_num, its, &u_full)?;
            if max_change < input.tolerance && metric.relative_residual(&r, &f_global, None, cs.as_ref()) < input.tolerance {
                converged = true;
                break;
            }
        }
    }

    let displacements = linear::build_displacements_3d(&dof_num, &u_full);
    let element_forces = linear::compute_internal_forces_3d(&expanded_solver, &dof_num, &u_full);

    let spring_results: Vec<SpringResult> = input.soil_springs.iter().enumerate()
        .map(|(si, spring)| {
            let dir = spring.direction.min(dof_num.dofs_per_node - 1);
            let disp = dof_num.map.get(&(spring.node_id, dir))
                .map(|&d| u_full[d])
                .unwrap_or(0.0);
            let (reaction, _) = evaluate_soil_curve(&spring.curve, disp)?;
            Ok(SpringResult {
                node_id: spring.node_id,
                direction: spring.direction,
                displacement: disp,
                reaction: reaction * spring.length_factor(),
                secant_stiffness: spring_k[si],
            })
        })
        .collect::<Result<_, String>>()?;

    let ku = if let Some(ref s) = sparse_asm {
        sparse_balance(s.k_full.as_ref().ok_or("SSI: sparse assembly without the full stiffness")?, n, &u_frame, &f_global)
    } else {
        dense_balance(&dense_asm.as_ref().unwrap().k, n, &u_frame, &f_global)
    };
    let mut free_residual = residual(ku, &input.soil_springs, &dof_num, its, &u_full)?;
    let mut reactions_vec = free_residual.split_off(nf);
    let constraint_forces = if let Some(ref fcs) = cs {
        let raw = fcs.constraint_forces_from_residual(&free_residual);
        fcs.add_restrained_master_forces(&raw, &mut reactions_vec);
        fcs.constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };
    let mut reactions = linear::build_reactions_3d_inclined(
        &expanded_solver, &dof_num, &reactions_vec, &f_global[nf..], nf, &u_full, its,
    );
    reactions.sort_by_key(|r| r.node_id);

    Ok(SSIResult3D {
        results: AnalysisResults3D {
            displacements,
            reactions,
            element_forces,
            plate_stresses: linear::compute_plate_stresses(&expanded_solver, &dof_num, &u_full, None),
            quad_stresses: linear::compute_quad_stresses(&expanded_solver, &dof_num, &u_full, None),
            quad_nodal_stresses: vec![],
            constraint_forces,
            diagnostics: vec![],
            solver_diagnostics: vec![],
            structured_diagnostics: conditioning.into_iter().collect(),
            equilibrium: None,
            timings: None,
            result_summary: None, solver_run_meta: None,
        },
        iterations: total_iters,
        converged,
        spring_results,
    })
}

#[cfg(test)]
mod convergence_tests {
    use super::relative_stiffness_change;

    #[test]
    fn zero_nonfinite_and_both_sides_of_relative_stiffness_tolerance() {
        assert_eq!(relative_stiffness_change(0.0, 0.0), 0.0);
        for scale in [1e-200, 1.0, 1e200] {
            assert_eq!(relative_stiffness_change(0.0, scale), f64::INFINITY);
            assert_eq!(relative_stiffness_change(scale, 0.0), f64::INFINITY);
            for factor in [0.5, 2.0] {
                let ratio = relative_stiffness_change(scale, scale * (1.0 - factor * 1e-6));
                assert_eq!(ratio < 1e-6, factor < 1.0);
            }
        }
        for invalid in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert_eq!(relative_stiffness_change(invalid, 1.0), f64::INFINITY);
            assert_eq!(relative_stiffness_change(1.0, invalid), f64::INFINITY);
        }
    }
}

#[cfg(test)]
mod residual_precision_regressions {
    use super::*;

    #[test]
    fn dense_and_sparse_soil_equilibrium_preserve_cancelled_terms() {
        let large = 2.0_f64.powi(54);
        for scale in [2.0_f64.powi(-64), 1.0, 2.0_f64.powi(64)] {
            let k: Vec<_> = [large, 1.0, -large, 1.0, 2.0, 0.0, -large, 0.0, large]
                .into_iter().map(|v| v * scale).collect();
            let expected = [scale, 3.0 * scale, 0.0];
            let sparse = CscMatrix::from_dense_symmetric(&k, 3);
            for ku in [dense_ku(&k, 3, &[1.0; 3]), sparse_ku(&sparse, 3, &[1.0; 3])] {
                assert_eq!(ku, expected);
            }
        }
    }
}

#[cfg(test)]
mod refinement_scope_2072 {
    use super::*;

    fn correct(curve: SoilCurve, displacement: f64, force_increment: f64) -> SecantState {
        let controls: serde_json::Value = serde_json::from_str(include_str!(
            "../../tests/metamorphic/ssi-elastic-2011-controls.json"
        ))
        .unwrap();
        let input: SSIInput = serde_json::from_value(controls[3]["input"].clone()).unwrap();
        let dofs = DofNumbering::build_2d(&input.solver);
        let (n, nf) = (dofs.n_total, dofs.n_free);
        let d = dofs.global_dof(2, 0).unwrap();
        let mut u = vec![0.0; nf];
        u[d] = displacement;
        let indices: Vec<_> = (0..nf).collect();
        let mut diagonal = vec![1.0; nf];
        diagonal[d] = evaluate_soil_curve(&curve, 0.0).unwrap().1;
        if diagonal[d] == 0.0 {
            diagonal[d] = 1.0;
        }
        let k = CscMatrix::from_triplets(nf, &indices, &indices, &diagonal);
        let factor = SecantFactor::new(&k, false, &mut None, &mut None).unwrap();
        let mut state = SecantState {
            k,
            factor,
            u,
            rounding_round: 0.0,
        };
        let mut force = vec![0.0; n];
        force[d] = evaluate_soil_curve(&curve, displacement).unwrap().0 + force_increment;
        let metric =
            super::super::convergence::EquilibriumMetric::for_2d(&input.solver, &dofs, None)
                .unwrap();
        let springs = [SoilSpring {
            node_id: 2,
            direction: 0,
            curve,
            tributary_length: 1.0,
        }];
        let zero = vec![0.0; n * n];
        refine_secant::<assembly::InclinedTransformData2D>(
            &mut state,
            nf,
            n,
            None,
            &[],
            &springs,
            &dofs,
            |frame| dense_balance(&zero, n, frame, &force),
            &metric,
            &force,
            1e-10,
        )
        .unwrap();
        state
    }

    #[test]
    fn nonlinear_states_never_enter_refinement_even_when_secant_matches_initial() {
        let curve = SoilCurve::Custom {
            points: vec![[0.0, 0.0], [1.0, 1.0], [2.0, 4.0], [4.0, 4.0]],
        };
        assert_eq!(
            evaluate_soil_curve(&curve, 0.0).unwrap().1,
            evaluate_soil_curve(&curve, 4.0).unwrap().1
        );
        for displacement in [1.0_f64.next_up(), 2.0, 4.0] {
            for sign in [-1.0, 1.0] {
                let displacement = sign * displacement;
                let state = correct(curve.clone(), displacement, sign);
                assert_eq!(state.u[0].to_bits(), displacement.to_bits());
                assert_eq!(state.rounding_round, 0.0);
            }
        }
    }

    #[test]
    fn linear_corrections_cannot_commit_a_nonlinear_soil_state() {
        for sign in [-1.0, 1.0] {
            let curve = SoilCurve::Custom {
                points: vec![[0.0, 0.0], [1.0, 1.0]],
            };
            let state = correct(curve, 0.0, sign * 2.0);
            assert!(state.u[0].abs() <= 1.0);
        }
    }

    #[test]
    fn every_soil_law_keeps_nonlinear_states_outside_refinement() {
        use super::super::soil_curves::{SandLoading, API_SOFT_CLAY_STATIC, WELCH_REESE_ABSCISSAE};
        let curves = [
            (
                SoilCurve::PySoftClay {
                    su: 20.0,
                    gamma_eff: 6.0,
                    d: 1.0,
                    depth: 3.0,
                    eps_50: 0.01,
                    j: Some(0.5),
                },
                2.5 * 0.01 * API_SOFT_CLAY_STATIC[1].0,
            ),
            (
                SoilCurve::PyStiffClay {
                    su: 100.0,
                    gamma_eff: 9.0,
                    d: 1.0,
                    depth: 3.0,
                    eps_50: 0.005,
                    j: Some(0.5),
                    free_water: Some(false),
                },
                2.5 * 0.005 * WELCH_REESE_ABSCISSAE[1],
            ),
            (
                SoilCurve::Tz {
                    t_ult: 50.0,
                    z_ult: 0.01,
                    perimeter: Some(1.0),
                },
                1e-6 * 0.01,
            ),
            (
                SoilCurve::Qz {
                    q_ult: 5000.0,
                    d: 0.6,
                    tip_area: Some(1.0),
                },
                0.002 * 0.6,
            ),
            (
                SoilCurve::Custom {
                    points: vec![[0.0, 0.0], [1.0, 1.0], [2.0, 1.5]],
                },
                1.0,
            ),
            (
                SoilCurve::Custom {
                    points: vec![[1.0, 1.0], [2.0, 1.5]],
                },
                1.0,
            ),
        ];
        for (curve, limit) in curves {
            let signs: &[f64] = if curve.is_point_spring() {
                &[-1.0]
            } else {
                &[-1.0, 1.0]
            };
            for &sign in signs {
                for disp in [0.0, limit.next_down(), limit] {
                    let original = sign * disp;
                    let inward = if curve.is_point_spring() && disp == 0.0 {
                        sign
                    } else {
                        -sign
                    };
                    let increment =
                        inward * evaluate_soil_curve(&curve, sign * limit).unwrap().0.abs() * 0.5;
                    let state = correct(curve.clone(), original, increment);
                    assert_ne!(
                        state.u[0].to_bits(),
                        original.to_bits(),
                        "linear state must still refine: {curve:?} {original}"
                    );
                }
                let original = sign * limit.next_up();
                let state = correct(curve.clone(), original, sign);
                assert_eq!(
                    state.u[0].to_bits(),
                    original.to_bits(),
                    "nonlinear state: {curve:?}"
                );
                assert_eq!(state.rounding_round, 0.0);
            }
        }
        for curve in [
            SoilCurve::PySand {
                phi: 35.0,
                gamma_eff: 10.0,
                d: 1.0,
                depth: 3.0,
                loading: Some(SandLoading::Static),
            },
            SoilCurve::PySand {
                phi: 35.0,
                gamma_eff: 10.0,
                d: 1.0,
                depth: 3.0,
                loading: Some(SandLoading::Cyclic),
            },
            SoilCurve::Qz {
                q_ult: 5000.0,
                d: 0.6,
                tip_area: Some(1.0),
            },
        ] {
            for original in [f64::from_bits(1), 1.0] {
                let state = correct(curve.clone(), original, 1.0);
                assert_eq!(state.u[0].to_bits(), original.to_bits());
                assert_eq!(state.rounding_round, 0.0);
            }
        }
    }

    #[test]
    fn linear_range_includes_its_endpoint_and_both_signs() {
        for displacement in [0.0, 1.0_f64.next_down(), 1.0] {
            for sign in [-1.0, 1.0] {
                let curve = SoilCurve::Custom {
                    points: vec![[0.0, 0.0], [1.0, 1.0]],
                };
                let state = correct(curve, sign * displacement, -sign * 0.5);
                assert_eq!(state.u[0], sign * (displacement - 0.5));
                assert_eq!(state.rounding_round, 0.0);
            }
        }
    }
}
