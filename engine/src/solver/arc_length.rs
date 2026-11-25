/// Arc-length (Riks) and displacement control solvers for tracing
/// nonlinear equilibrium paths including limit points and snap-through.
///
/// Crisfield spherical arc-length:
///   ||Δu||² + Δλ² × ||f_ref||² = Δs²
///
/// Reference: Crisfield, "Non-linear Finite Element Analysis of Solids
///            and Structures" Vol. 1, Ch. 9


use serde::{Serialize, Deserialize};
use crate::types::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly::{self, InclinedFrame, InclinedTransformData2D};
use super::corotational::{add_spring_contributions, assemble_corotational_public, assemble_corotational_triplets_2d};
use super::constraints::{FreeConstraintSystem, MasterMotion};
use super::linear::SPARSE_THRESHOLD;
use super::path_following::vec_norm;
use super::sparse_tangent::{
    cached_symbolic, tangent_free_sparse, tangent_free_sparse_triplets, SparseSymbolicCache,
};
use super::time_integration::MAX_DENSE_FALLBACK_DOFS;

/// Arc-length analysis input.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArcLengthInput {
    pub solver: SolverInput,
    /// Maximum number of arc-length steps
    #[serde(default = "default_max_steps")]
    pub max_steps: usize,
    /// Maximum N-R iterations per step
    #[serde(default = "default_max_iter")]
    pub max_iter: usize,
    /// Convergence tolerance
    #[serde(default = "default_tol")]
    pub tolerance: f64,
    /// Initial arc-length increment
    #[serde(default = "default_initial_ds")]
    pub initial_ds: f64,
    /// Minimum arc-length
    #[serde(default = "default_min_ds")]
    pub min_ds: f64,
    /// Maximum arc-length
    #[serde(default = "default_max_ds")]
    pub max_ds: f64,
    /// Target N-R iterations per step (for adaptive Δs)
    #[serde(default = "default_target_iter")]
    pub target_iter: usize,
}

fn default_max_steps() -> usize { 100 }
fn default_max_iter() -> usize { 30 }
fn default_tol() -> f64 { 1e-6 }
fn default_initial_ds() -> f64 { 0.1 }
fn default_min_ds() -> f64 { 1e-6 }
fn default_max_ds() -> f64 { 1.0 }
fn default_target_iter() -> usize { 5 }

/// Displacement control input.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplacementControlInput {
    pub solver: SolverInput,
    /// Control node ID
    pub control_node: usize,
    /// Control DOF (0=ux, 1=uy, 2=rz)
    pub control_dof: usize,
    /// Target displacement at the control DOF
    pub target_displacement: f64,
    /// Number of displacement increments
    #[serde(default = "default_n_disp_steps")]
    pub n_steps: usize,
    /// Max N-R iterations per step
    #[serde(default = "default_max_iter")]
    pub max_iter: usize,
    /// Convergence tolerance
    #[serde(default = "default_tol")]
    pub tolerance: f64,
}

fn default_n_disp_steps() -> usize { 20 }

/// Per-step snapshot on the equilibrium path.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EquilibriumStep {
    pub step: usize,
    pub load_factor: f64,
    pub control_displacement: f64,
    pub converged: bool,
    pub iterations: usize,
    /// The converged nodal displacements (Rust callers only; not serialized).
    #[serde(skip)]
    pub displacements: Vec<Displacement>,
}

/// Arc-length analysis result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArcLengthResult {
    pub results: AnalysisResults,
    pub steps: Vec<EquilibriumStep>,
    pub final_load_factor: f64,
    pub converged: bool,
    pub total_iterations: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rejected_iterations: Option<usize>,
}

/// Displacement control result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplacementControlResult {
    pub results: AnalysisResults,
    pub steps: Vec<EquilibriumStep>,
    pub final_load_factor: f64,
    pub converged: bool,
    pub total_iterations: usize,
}

mod continuation;

pub use continuation::{solve_arc_length, solve_arc_length_from, solve_displacement_control};

/// Tangent stiffness factored once, reusable for multiple right-hand sides.
/// The dense decompositions (Cholesky with LU fallback) match what the
/// previous per-RHS solve did, so one factor for two RHS gives identical
/// results to factoring twice. Above `SPARSE_THRESHOLD` independent DOFs the
/// tangent is factored with sparse Cholesky instead (symbolic phase cached
/// per solve call in `SparseSymbolicCache`).
enum FactoredTangent {
    /// Cholesky factor L (lower triangle stored in n*n array)
    Cholesky { l: Vec<f64> },
    /// LU decomposition with partial pivoting
    Lu { a: Vec<f64>, piv: Vec<usize> },
    /// Sparse Cholesky numeric factor (ns >= SPARSE_THRESHOLD)
    Sparse { num: NumericCholesky },
}

/// Factor K_T once for repeated solves over multiple right-hand sides.
///
/// `k_ff` is the dense free block; constraint reduction happens inside:
/// sparse (`reduce_matrix_sparse`) at or above `SPARSE_THRESHOLD` independent
/// DOFs, dense (`reduce_matrix`) below it, keeping the dense path
/// byte-identical to before.
fn factor_tangent(
    k_ff: &[f64],
    nf: usize,
    ns: usize,
    cs: &Option<FreeConstraintSystem>,
    cache: &mut Option<SparseSymbolicCache>,
) -> Result<FactoredTangent, String> {
    if ns >= SPARSE_THRESHOLD {
        let k_s_csc = tangent_free_sparse(k_ff, nf, cs);
        return factor_tangent_sparse(&k_s_csc, ns, cache);
    }

    let k_s = if let Some(ref cs) = cs { cs.reduce_matrix(k_ff) } else { k_ff.to_vec() };
    let mut l = k_s.clone();
    if cholesky_decompose(&mut l, ns) {
        return Ok(FactoredTangent::Cholesky { l });
    }
    factor_tangent_lu(k_s, ns)
}

/// Sparse factorization of an already constraint-reduced CSC tangent:
/// symbolic factorization is cached across iterations (the pattern is
/// constant within a solve call); if the numeric phase reports a non-SPD
/// tangent, falls back to dense LU, size-capped by `MAX_DENSE_FALLBACK_DOFS` —
/// mirrors `sparse_tangent::solve_tangent_sparse` /
/// `time_integration::factor_effective_stiffness`.
fn factor_tangent_sparse(
    k_s_csc: &CscMatrix,
    ns: usize,
    cache: &mut Option<SparseSymbolicCache>,
) -> Result<FactoredTangent, String> {
    let sym = cached_symbolic(cache, k_s_csc);
    if let Some(num) = numeric_cholesky(sym, k_s_csc) {
        return Ok(FactoredTangent::Sparse { num });
    }
    // Sparse Cholesky reports a non-SPD tangent: dense LU fallback,
    // size-capped like corotational/time_integration.
    if ns > MAX_DENSE_FALLBACK_DOFS {
        return Err(format!(
            "Tangent stiffness is not SPD (sparse Cholesky) and the dense LU fallback would need a {ns}×{ns} dense matrix ({} MB), over the {MAX_DENSE_FALLBACK_DOFS}-DOF ceiling",
            8 * ns * ns / 1_000_000
        ));
    }
    factor_tangent_lu(k_s_csc.to_dense_symmetric(), ns)
}

/// Dense LU factorization with partial pivoting — identical factorization
/// phase to `lu_solve`. Shared by the below-threshold path and the sparse
/// non-SPD fallback.
fn factor_tangent_lu(k_s: Vec<f64>, ns: usize) -> Result<FactoredTangent, String> {
    let mut a = k_s;
    let mut piv: Vec<usize> = (0..ns).collect();

    for k in 0..ns {
        let mut max_val = a[piv[k] * ns + k].abs();
        let mut max_row = k;
        for i in (k + 1)..ns {
            let val = a[piv[i] * ns + k].abs();
            if val > max_val {
                max_val = val;
                max_row = i;
            }
        }

        if max_val < 1e-14 {
            return Err("Singular tangent stiffness".to_string());
        }

        piv.swap(k, max_row);

        let pivot = a[piv[k] * ns + k];
        for i in (k + 1)..ns {
            let factor = a[piv[i] * ns + k] / pivot;
            a[piv[i] * ns + k] = factor;
            for j in (k + 1)..ns {
                let val = a[piv[k] * ns + j];
                a[piv[i] * ns + j] -= factor * val;
            }
        }
    }

    Ok(FactoredTangent::Lu { a, piv })
}

/// Solve with a pre-factored tangent. The dense substitution steps are
/// identical to `cholesky_solve` / `lu_solve`, so dense results match a
/// fresh per-RHS solve bit for bit.
fn solve_with_tangent(factored: &FactoredTangent, rhs: &[f64], nf: usize) -> Result<Vec<f64>, String> {
    match factored {
        FactoredTangent::Cholesky { l } => {
            let y = forward_solve(l, rhs, nf);
            Ok(back_solve(l, &y, nf))
        }
        FactoredTangent::Lu { a, piv } => {
            // Forward substitution (Ly = Pb)
            let mut y = vec![0.0; nf];
            for i in 0..nf {
                y[i] = rhs[piv[i]];
                for j in 0..i {
                    y[i] -= a[piv[i] * nf + j] * y[j];
                }
            }
            // Back substitution (Ux = y)
            let mut x = vec![0.0; nf];
            for i in (0..nf).rev() {
                x[i] = y[i];
                for j in (i + 1)..nf {
                    x[i] -= a[piv[i] * nf + j] * x[j];
                }
                x[i] /= a[piv[i] * nf + i];
            }
            // Same NaN/Inf guard as `lu_solve`
            if x.iter().any(|v| v.is_nan() || v.is_infinite()) {
                return Err("Singular tangent stiffness".to_string());
            }
            Ok(x)
        }
        FactoredTangent::Sparse { num } => Ok(sparse_cholesky_solve(num, rhs)),
    }
}

// Sparse symbolic factorization cache and tangent conversion helpers now
// live in `super::sparse_tangent` (shared with corotational and contact).

/// Co-rotational tangent + internal forces for one Newton iteration: dense n×n
/// tangent below `SPARSE_THRESHOLD`, lower-triangle (gi >= gj) COO triplets at
/// or above it — the sparse path never materializes the O(n²) dense tangent.
/// `f_int` is accumulated over ALL n DOFs identically in both paths.
struct TangentAssembly {
    f_int: Vec<f64>,
    /// Dense n×n tangent (dense path only; empty on the sparse path)
    k_t: Vec<f64>,
    /// Lower-triangle triplets (sparse path only)
    trip_rows: Vec<usize>,
    trip_cols: Vec<usize>,
    trip_vals: Vec<f64>,
}

/// `u_frame` and the returned tangent and `f_int` are in the inclined-roller
/// frames `its`; the elements see the displacement in global axes.
fn assemble_tangent(
    input: &SolverInput,
    dof_num: &DofNumbering,
    u_frame: &[f64],
    art: &[(usize, f64)],
    sparse: bool,
    its: &[InclinedTransformData2D],
) -> TangentAssembly {
    let n = dof_num.n_total;
    let u_global = assembly::to_global(u_frame, n, its);
    let u_full = &u_global[..];
    let mut f_int = vec![0.0; n];
    let mut k_t: Vec<f64> = Vec::new();
    let mut trip_rows: Vec<usize> = Vec::new();
    let mut trip_cols: Vec<usize> = Vec::new();
    let mut trip_vals: Vec<f64> = Vec::new();

    if sparse {
        assemble_corotational_triplets_2d(
            input, dof_num, u_full, &mut f_int,
            &mut trip_rows, &mut trip_cols, &mut trip_vals,
        );
        // Springs, connectors and artificial stiffness, shared with the
        // co-rotational solver (off-diagonal entries included).
        add_spring_contributions(input, dof_num, u_full, &mut f_int, art, &mut |gi, gj, v| {
            if gi >= gj {
                trip_rows.push(gi);
                trip_cols.push(gj);
                trip_vals.push(v);
            }
        });
    } else {
        k_t = vec![0.0; n * n];
        assemble_corotational_public(input, dof_num, u_full, &mut f_int, &mut k_t);
        add_spring_contributions(input, dof_num, u_full, &mut f_int, art, &mut |gi, gj, v| {
            k_t[gi * n + gj] += v;
        });
    }

    for it in its {
        if sparse {
            it.rotate_triplets(&mut trip_rows, &mut trip_cols, &mut trip_vals);
        } else {
            it.rotate_dense(&mut k_t, n);
        }
        it.rotate(&mut f_int);
    }

    TangentAssembly { f_int, k_t, trip_rows, trip_cols, trip_vals }
}

/// Factor the assembled tangent once for repeated solves over multiple
/// right-hand sides. Sparse path: free×free triplets -> constraint-reduced CSC
/// -> cached-symbolic sparse Cholesky. Dense path: extract the free block and
/// factor exactly as before.
fn factor_assembled(
    asm: &TangentAssembly,
    n: usize,
    nf: usize,
    ns: usize,
    cs: &Option<FreeConstraintSystem>,
    cache: &mut Option<SparseSymbolicCache>,
) -> Result<FactoredTangent, String> {
    if ns >= SPARSE_THRESHOLD {
        let k_s_csc = tangent_free_sparse_triplets(
            &asm.trip_rows, &asm.trip_cols, &asm.trip_vals, nf, cs,
        );
        return factor_tangent_sparse(&k_s_csc, ns, cache);
    }
    let free_idx: Vec<usize> = (0..nf).collect();
    let k_ff = extract_submatrix(&asm.k_t, n, &free_idx, &free_idx);
    factor_tangent(&k_ff, nf, ns, cs, cache)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn make_cantilever() -> SolverInput {
        let mut nodes = HashMap::new();
        nodes.insert("0".into(), SolverNode { id: 0, x: 0.0, z: 0.0 });
        nodes.insert("1".into(), SolverNode { id: 1, x: 5.0, z: 0.0 });

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

        let mut supports = HashMap::new();
        supports.insert("0".into(), SolverSupport {
            id: 0, node_id: 0, support_type: "fixed".into(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None, angle: None,
        });

        SolverInput {
            solver_options: None, masses: Default::default(),
            nodes, materials, sections, elements, supports,
            loads: vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 1, fx: 0.0, fz: -10.0, my: 0.0,
            })],
            constraints: vec![],
            connectors: HashMap::new(),
        }
    }

    #[test]
    fn test_displacement_control_basic() {
        let solver = make_cantilever();
        let input = DisplacementControlInput {
            solver,
            control_node: 1,
            control_dof: 1, // uy
            target_displacement: -0.01,
            n_steps: 5,
            max_iter: 30,
            tolerance: 1e-6,
        };
        let result = solve_displacement_control(&input).unwrap();
        assert!(result.converged, "Should converge");
        assert!(result.steps.len() > 0);

        // Control DOF should reach target
        let d1 = result.results.displacements.iter().find(|d| d.node_id == 1).unwrap();
        assert!(
            (d1.uz - (-0.01)).abs() < 1e-4,
            "Control DOF: got {} expected -0.01", d1.uz
        );
    }

    #[test]
    fn test_arc_length_basic() {
        let solver = make_cantilever();
        let input = ArcLengthInput {
            solver,
            max_steps: 20,
            max_iter: 30,
            tolerance: 1e-6,
            initial_ds: 0.5,
            min_ds: 1e-6,
            max_ds: 2.0,
            target_iter: 5,
        };
        let result = solve_arc_length(&input).unwrap();
        assert!(result.steps.len() > 0, "Should have at least one step");

        // For a linear cantilever, arc-length should trace the path
        // Load factor should be positive after the first step
        if let Some(last) = result.steps.last() {
            assert!(last.load_factor > 0.0, "Load factor should be positive");
        }
    }

    #[test]
    fn test_arc_length_abort_returns_last_converged_state() {
        // Force the abort path: max_iter = 1 cannot converge a genuinely
        // nonlinear large-load step, and ds halves below min_ds quickly.
        // The final results must reflect the last converged state (here:
        // no converged step -> zero displacements, zero load factor), not
        // the failed step's unconverged iterate.
        let solver = make_cantilever();
        let input = ArcLengthInput {
            solver,
            max_steps: 10,
            max_iter: 1,
            tolerance: 1e-6,
            initial_ds: 0.5,
            min_ds: 0.1,
            max_ds: 2.0,
            target_iter: 5,
        };
        let result = solve_arc_length(&input).unwrap();
        assert!(!result.converged, "Should report non-convergence");
        assert!(result.steps.is_empty(), "No step should have converged");
        assert!(
            result.final_load_factor == 0.0,
            "Load factor should be restored to 0.0, got {}",
            result.final_load_factor
        );
        for d in &result.results.displacements {
            assert!(
                d.ux.abs() < 1e-15 && d.uz.abs() < 1e-15 && d.ry.abs() < 1e-15,
                "Displacements should be the last converged (zero) state, got ux={} uz={} ry={} at node {}",
                d.ux, d.uz, d.ry, d.node_id
            );
        }
    }
}
