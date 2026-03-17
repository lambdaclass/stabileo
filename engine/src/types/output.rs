use serde::{Deserialize, Serialize};

// ==================== 2D Output Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Displacement {
    pub node_id: usize,
    pub ux: f64,
    pub uy: f64,
    pub rz: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reaction {
    pub node_id: usize,
    pub rx: f64,
    pub ry: f64,
    pub mz: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PointLoadInfo {
    pub a: f64,
    pub p: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub px: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mz: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DistributedLoadInfo {
    #[serde(rename = "qI")]
    pub q_i: f64,
    #[serde(rename = "qJ")]
    pub q_j: f64,
    pub a: f64,
    pub b: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementForces {
    pub element_id: usize,
    pub n_start: f64,
    pub n_end: f64,
    pub v_start: f64,
    pub v_end: f64,
    pub m_start: f64,
    pub m_end: f64,
    pub length: f64,
    #[serde(rename = "qI")]
    pub q_i: f64,
    #[serde(rename = "qJ")]
    pub q_j: f64,
    pub point_loads: Vec<PointLoadInfo>,
    pub distributed_loads: Vec<DistributedLoadInfo>,
    pub hinge_start: bool,
    pub hinge_end: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisResults {
    pub displacements: Vec<Displacement>,
    pub reactions: Vec<Reaction>,
    pub element_forces: Vec<ElementForces>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub constraint_forces: Vec<ConstraintForce>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub diagnostics: Vec<AssemblyDiagnostic>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub solver_diagnostics: Vec<SolverDiagnostic>,
    /// Structured diagnostics with enum codes (new — preferred over solver_diagnostics).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub structured_diagnostics: Vec<StructuredDiagnostic>,
    /// Post-solve equilibrium/residual summary.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub equilibrium: Option<EquilibriumSummary>,
    /// Query-ready summary of result extremes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result_summary: Option<ResultSummary>,
    /// Deterministic solver-run metadata for reproducibility.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub solver_run_meta: Option<SolverRunMeta>,
}

/// Forces at constrained DOFs due to constraint enforcement.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstraintForce {
    pub node_id: usize,
    pub dof: String,
    pub force: f64,
}

// ==================== Assembly Diagnostics ====================

/// Warning emitted when an element exceeds quality thresholds during assembly.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssemblyDiagnostic {
    pub element_id: usize,
    pub element_type: String,
    pub metric: String,
    pub value: f64,
    pub threshold: f64,
    pub message: String,
}

// ==================== Solver Diagnostics ====================

/// Diagnostic emitted by the solver (path choice, conditioning, fallbacks).
///
/// This is the legacy string-based format. New code should prefer
/// `StructuredDiagnostic` which carries enum codes for machine matching.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverDiagnostic {
    pub category: String,   // "solver_path", "conditioning", "fallback"
    pub message: String,
    pub severity: String,   // "info", "warning", "error"
}

// ==================== Structured Diagnostics ====================

/// Machine-readable severity levels for diagnostics.
/// AI and review UIs can match on these without string parsing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    /// Informational: solver path chosen, timing info, etc.
    Info,
    /// Warning: potential issue that may affect accuracy.
    Warning,
    /// Error: solve failed or results are unreliable.
    Error,
}

/// Stable enum-based diagnostic codes.
///
/// Each variant is a distinct, matchable diagnostic. Product code and AI
/// consumers can switch on these codes instead of parsing message strings.
/// **Stability rule**: codes may be added but never removed or renamed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiagnosticCode {
    // ---- Solver path ----
    /// Sparse Cholesky was used.
    SparseCholesky,
    /// Dense LU was used (small model or fallback).
    DenseLu,
    /// Sparse Cholesky failed, fell back to dense LU.
    SparseFallbackDenseLu,
    /// Diagonal shift applied to stabilize factorization.
    DiagonalRegularization,
    /// Sparse fill ratio (nnz(L) / nnz(K_ff)).
    SparseFillRatio,

    // ---- Conditioning ----
    /// Diagonal ratio > 1e8 (moderate conditioning concern).
    HighDiagonalRatio,
    /// Diagonal ratio > 1e12 (severe conditioning concern).
    ExtremelyHighDiagonalRatio,
    /// Near-zero diagonal detected (singular or near-singular DOF).
    NearZeroDiagonal,

    // ---- Residual / equilibrium ----
    /// Post-solve residual within tolerance.
    ResidualOk,
    /// Post-solve residual exceeds tolerance.
    ResidualHigh,
    /// Global equilibrium check passed.
    EquilibriumOk,
    /// Global equilibrium check failed.
    EquilibriumViolation,

    // ---- Element quality ----
    /// Element aspect ratio exceeds threshold.
    HighAspectRatio,
    /// Element has negative Jacobian (inverted).
    NegativeJacobian,
    /// Element warping exceeds threshold.
    HighWarping,
    /// Element Jacobian ratio is poor.
    PoorJacobianRatio,
    /// Element minimum angle below threshold.
    SmallMinAngle,

    // ---- Pre-solve model quality ----
    /// No free DOFs — fully restrained.
    NoFreeDofs,
    /// Local mechanism detected (hinged node).
    LocalMechanism,
    /// Singular stiffness matrix.
    SingularMatrix,
    /// Disconnected node — not connected to any element.
    DisconnectedNode,
    /// Near-duplicate nodes — two nodes at nearly the same position.
    NearDuplicateNodes,
    /// Instability risk — node has too few restraints for the element types it connects to.
    InstabilityRisk,
    /// Shell element has poor pre-solve geometry (high aspect ratio, negative Jacobian, etc.).
    ShellDistortion,
    /// Frame element has suspicious local-axis definition.
    SuspiciousLocalAxis,

    // ---- Constraint quality ----
    /// Same DOF is constrained by multiple constraints.
    ConflictingConstraints,
    /// Circular dependency in constraint chain (A→B→A).
    CircularConstraint,
    /// DOF is both constrained and restrained by a support.
    OverConstrainedDof,
}

/// A structured diagnostic with enum code, severity, optional element/node
/// references, and provenance metadata.
///
/// Designed for machine consumption: AI review, automated guidance, structured
/// logging, and query-based result inspection.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredDiagnostic {
    /// Stable enum code — switch on this, not the message.
    pub code: DiagnosticCode,
    /// Severity level.
    pub severity: Severity,
    /// Human-readable message (for display, not matching).
    pub message: String,
    /// Element IDs this diagnostic applies to (empty = global).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub element_ids: Vec<usize>,
    /// Node IDs this diagnostic applies to (empty = global).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub node_ids: Vec<usize>,
    /// DOF indices this diagnostic applies to (empty = global).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub dof_indices: Vec<usize>,
    /// Solver phase that produced this diagnostic.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
    /// Numeric value associated with this diagnostic (e.g. residual, ratio).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
    /// Threshold that was exceeded (if applicable).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub threshold: Option<f64>,
}

impl StructuredDiagnostic {
    /// Create a global (no element/node references) diagnostic.
    pub fn global(code: DiagnosticCode, severity: Severity, message: impl Into<String>) -> Self {
        Self {
            code,
            severity,
            message: message.into(),
            element_ids: vec![],
            node_ids: vec![],
            dof_indices: vec![],
            phase: None,
            value: None,
            threshold: None,
        }
    }

    /// Attach a numeric value and threshold.
    pub fn with_value(mut self, value: f64, threshold: f64) -> Self {
        self.value = Some(value);
        self.threshold = Some(threshold);
        self
    }

    /// Attach a solver phase.
    pub fn with_phase(mut self, phase: impl Into<String>) -> Self {
        self.phase = Some(phase.into());
        self
    }

    /// Attach DOF indices.
    pub fn with_dofs(mut self, dofs: Vec<usize>) -> Self {
        self.dof_indices = dofs;
        self
    }

    /// Attach element IDs.
    pub fn with_elements(mut self, ids: Vec<usize>) -> Self {
        self.element_ids = ids;
        self
    }

    /// Attach node IDs.
    pub fn with_nodes(mut self, ids: Vec<usize>) -> Self {
        self.node_ids = ids;
        self
    }
}

/// Convert a StructuredDiagnostic to the legacy SolverDiagnostic format.
impl From<&StructuredDiagnostic> for SolverDiagnostic {
    fn from(sd: &StructuredDiagnostic) -> Self {
        let category = match sd.code {
            DiagnosticCode::SparseCholesky | DiagnosticCode::DenseLu => "solver_path",
            DiagnosticCode::SparseFallbackDenseLu | DiagnosticCode::DiagonalRegularization => "fallback",
            DiagnosticCode::SparseFillRatio => "performance",
            DiagnosticCode::HighDiagonalRatio | DiagnosticCode::ExtremelyHighDiagonalRatio | DiagnosticCode::NearZeroDiagonal => "conditioning",
            DiagnosticCode::ResidualOk | DiagnosticCode::ResidualHigh | DiagnosticCode::EquilibriumOk | DiagnosticCode::EquilibriumViolation => "residual",
            DiagnosticCode::HighAspectRatio | DiagnosticCode::NegativeJacobian | DiagnosticCode::HighWarping | DiagnosticCode::PoorJacobianRatio | DiagnosticCode::SmallMinAngle => "element_quality",
            DiagnosticCode::NoFreeDofs | DiagnosticCode::LocalMechanism | DiagnosticCode::SingularMatrix | DiagnosticCode::DisconnectedNode | DiagnosticCode::NearDuplicateNodes | DiagnosticCode::InstabilityRisk | DiagnosticCode::ShellDistortion | DiagnosticCode::SuspiciousLocalAxis => "model_quality",
            DiagnosticCode::ConflictingConstraints | DiagnosticCode::CircularConstraint | DiagnosticCode::OverConstrainedDof => "constraints",
        };
        let severity = match sd.severity {
            Severity::Info => "info",
            Severity::Warning => "warning",
            Severity::Error => "error",
        };
        SolverDiagnostic {
            category: category.to_string(),
            message: sd.message.clone(),
            severity: severity.to_string(),
        }
    }
}

// ==================== Equilibrium Summary ====================

/// Post-solve equilibrium and residual summary.
/// Included in result payloads so consumers can assess trust without
/// recomputing from raw arrays.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EquilibriumSummary {
    /// Relative residual: ||K*u - f|| / ||f||  (0 = perfect).
    pub relative_residual: f64,
    /// Whether the residual is within the solver's tolerance.
    pub residual_ok: bool,
    /// Sum of applied forces (global X, Y, Z or X, Y for 2D).
    pub applied_force_sum: Vec<f64>,
    /// Sum of reaction forces (global X, Y, Z or X, Y for 2D).
    pub reaction_force_sum: Vec<f64>,
    /// Max absolute equilibrium imbalance across directions.
    pub max_imbalance: f64,
    /// Whether global equilibrium is satisfied (imbalance < tolerance).
    pub equilibrium_ok: bool,
}

// ==================== Query-Ready Result Summary ====================

/// Pre-computed extremes for a single result quantity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultExtreme {
    pub max_value: f64,
    pub max_id: usize,
    pub min_value: f64,
    pub min_id: usize,
}

/// Query-ready summary of key result quantities.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultSummary {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub displacement_x: Option<ResultExtreme>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub displacement_y: Option<ResultExtreme>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub displacement_z: Option<ResultExtreme>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation: Option<ResultExtreme>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub displacement_resultant: Option<ResultExtreme>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reaction_resultant: Option<ResultExtreme>,
}

// ==================== Solver Run Metadata ====================

/// Deterministic solver-run metadata for reproducibility and bug-report attachment.
/// Captures the engine version, build provenance, solver path actually used,
/// and model dimensions so that every result payload is self-describing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverRunMeta {
    /// Crate version from Cargo.toml (e.g. "0.1.0").
    pub engine_version: String,
    /// Build timestamp (set via DEDALIANO_BUILD_TS env var; "unknown" if unset).
    pub build_timestamp: String,
    /// Git SHA of the build (set via DEDALIANO_BUILD_SHA env var; "dev" if unset).
    pub build_sha: String,
    /// Which solver path actually executed: "sparse_cholesky", "dense_lu",
    /// or "sparse_fallback_dense_lu".
    pub solver_path: String,
    /// Number of free (unconstrained) DOFs solved for.
    pub n_free_dofs: usize,
    /// Number of elements in the model.
    pub n_elements: usize,
    /// Number of nodes in the model.
    pub n_nodes: usize,
}

impl SolverRunMeta {
    /// Build metadata with compile-time version/provenance constants.
    pub fn new(solver_path: &str, n_free_dofs: usize, n_elements: usize, n_nodes: usize) -> Self {
        Self {
            engine_version: env!("CARGO_PKG_VERSION").to_string(),
            build_timestamp: option_env!("DEDALIANO_BUILD_TS")
                .unwrap_or("unknown")
                .to_string(),
            build_sha: option_env!("DEDALIANO_BUILD_SHA")
                .unwrap_or("dev")
                .to_string(),
            solver_path: solver_path.to_string(),
            n_free_dofs,
            n_elements,
            n_nodes,
        }
    }
}

// ==================== Solve Timings ====================

/// Per-phase wall-clock timings from solve_3d (milliseconds).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolveTimings {
    #[serde(alias = "assemblyUs", alias = "assembly_us")]
    pub assembly_ms: f64,
    #[serde(alias = "conditioningUs", alias = "conditioning_us")]
    pub conditioning_ms: f64,
    #[serde(alias = "symbolicUs", alias = "symbolic_us")]
    pub symbolic_ms: f64,
    #[serde(alias = "numericUs", alias = "numeric_us")]
    pub numeric_ms: f64,
    #[serde(alias = "solveUs", alias = "solve_us")]
    pub solve_ms: f64,
    #[serde(alias = "residualUs", alias = "residual_us")]
    pub residual_ms: f64,
    #[serde(alias = "denseFallbackUs", alias = "dense_fallback_us")]
    pub dense_fallback_ms: f64,
    #[serde(alias = "reactionsUs", alias = "reactions_us")]
    pub reactions_ms: f64,
    #[serde(alias = "stressRecoveryUs", alias = "stress_recovery_us")]
    pub stress_recovery_ms: f64,
    #[serde(alias = "totalUs", alias = "total_us")]
    pub total_ms: f64,
    pub n_free: usize,
    pub nnz_kff: usize,
    pub nnz_l: usize,
    pub pivot_perturbations: usize,
    pub max_perturbation: f64,
}

// ==================== Solver Run Artifact ====================

/// A self-contained, serializable snapshot of a solver run — enough to
/// reproduce the result and attach to a bug report.
///
/// Contains the full input, key output metadata (diagnostics, equilibrium,
/// timings, result summary), and a lightweight output fingerprint so you can
/// verify replay without storing the entire displacement/force arrays.
///
/// The full result arrays (displacements, reactions, element_forces) are
/// intentionally excluded to keep the artifact compact. They can be
/// regenerated by replaying the input through the solver.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverRunArtifact {
    /// Solver-run metadata (version, SHA, solver path, model size).
    pub meta: SolverRunMeta,
    /// Structured diagnostics from the run.
    pub diagnostics: Vec<StructuredDiagnostic>,
    /// Equilibrium summary (if available).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub equilibrium: Option<EquilibriumSummary>,
    /// Solve timings (if available — 3D only today).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timings: Option<SolveTimings>,
    /// Query-ready result extremes (if available).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result_summary: Option<ResultSummary>,
    /// Lightweight output fingerprint for replay verification.
    pub fingerprint: OutputFingerprint,
}

/// Lightweight fingerprint of solver output — enough to verify that a replay
/// produced the same result without storing full arrays.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputFingerprint {
    /// Number of displacement results.
    pub n_displacements: usize,
    /// Number of reaction results.
    pub n_reactions: usize,
    /// Number of element force results.
    pub n_element_forces: usize,
    /// Max absolute displacement component (any direction).
    pub max_abs_displacement: f64,
    /// Max absolute reaction component (any direction).
    pub max_abs_reaction: f64,
}

impl SolverRunArtifact {
    /// Build a 2D artifact from solver results.
    pub fn from_2d(results: &AnalysisResults) -> Option<Self> {
        let meta = results.solver_run_meta.clone()?;

        let max_disp = results.displacements.iter()
            .flat_map(|d| [d.ux.abs(), d.uy.abs(), d.rz.abs()])
            .fold(0.0f64, f64::max);
        let max_rxn = results.reactions.iter()
            .flat_map(|r| [r.rx.abs(), r.ry.abs(), r.mz.abs()])
            .fold(0.0f64, f64::max);

        Some(Self {
            meta,
            diagnostics: results.structured_diagnostics.clone(),
            equilibrium: results.equilibrium.clone(),
            timings: None,
            result_summary: results.result_summary.clone(),
            fingerprint: OutputFingerprint {
                n_displacements: results.displacements.len(),
                n_reactions: results.reactions.len(),
                n_element_forces: results.element_forces.len(),
                max_abs_displacement: max_disp,
                max_abs_reaction: max_rxn,
            },
        })
    }

    /// Build a 3D artifact from solver results.
    pub fn from_3d(results: &AnalysisResults3D) -> Option<Self> {
        let meta = results.solver_run_meta.clone()?;

        let max_disp = results.displacements.iter()
            .flat_map(|d| [d.ux.abs(), d.uy.abs(), d.uz.abs(), d.rx.abs(), d.ry.abs(), d.rz.abs()])
            .fold(0.0f64, f64::max);
        let max_rxn = results.reactions.iter()
            .flat_map(|r| [r.fx.abs(), r.fy.abs(), r.fz.abs(), r.mx.abs(), r.my.abs(), r.mz.abs()])
            .fold(0.0f64, f64::max);

        Some(Self {
            meta,
            diagnostics: results.structured_diagnostics.clone(),
            equilibrium: results.equilibrium.clone(),
            timings: results.timings.clone(),
            result_summary: results.result_summary.clone(),
            fingerprint: OutputFingerprint {
                n_displacements: results.displacements.len(),
                n_reactions: results.reactions.len(),
                n_element_forces: results.element_forces.len(),
                max_abs_displacement: max_disp,
                max_abs_reaction: max_rxn,
            },
        })
    }
}

// ==================== 3D Output Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Displacement3D {
    pub node_id: usize,
    pub ux: f64,
    pub uy: f64,
    pub uz: f64,
    pub rx: f64,
    pub ry: f64,
    pub rz: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub warping: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reaction3D {
    pub node_id: usize,
    pub fx: f64,
    pub fy: f64,
    pub fz: f64,
    pub mx: f64,
    pub my: f64,
    pub mz: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bimoment: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PointLoadInfo3D {
    pub a: f64,
    pub p: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementForces3D {
    pub element_id: usize,
    pub length: f64,
    pub n_start: f64,
    pub n_end: f64,
    pub vy_start: f64,
    pub vy_end: f64,
    pub vz_start: f64,
    pub vz_end: f64,
    pub mx_start: f64,
    pub mx_end: f64,
    pub my_start: f64,
    pub my_end: f64,
    pub mz_start: f64,
    pub mz_end: f64,
    pub hinge_start: bool,
    pub hinge_end: bool,
    #[serde(rename = "qYI")]
    pub q_yi: f64,
    #[serde(rename = "qYJ")]
    pub q_yj: f64,
    pub distributed_loads_y: Vec<DistributedLoadInfo>,
    pub point_loads_y: Vec<PointLoadInfo3D>,
    #[serde(rename = "qZI")]
    pub q_zi: f64,
    #[serde(rename = "qZJ")]
    pub q_zj: f64,
    pub distributed_loads_z: Vec<DistributedLoadInfo>,
    pub point_loads_z: Vec<PointLoadInfo3D>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bimoment_start: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bimoment_end: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisResults3D {
    pub displacements: Vec<Displacement3D>,
    pub reactions: Vec<Reaction3D>,
    pub element_forces: Vec<ElementForces3D>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub plate_stresses: Vec<PlateStress>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub quad_stresses: Vec<QuadStress>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub quad_nodal_stresses: Vec<QuadNodalStress>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub constraint_forces: Vec<ConstraintForce>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub diagnostics: Vec<AssemblyDiagnostic>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub solver_diagnostics: Vec<SolverDiagnostic>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timings: Option<SolveTimings>,
    /// Structured diagnostics with enum codes (new — preferred over solver_diagnostics).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub structured_diagnostics: Vec<StructuredDiagnostic>,
    /// Post-solve equilibrium/residual summary.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub equilibrium: Option<EquilibriumSummary>,
    /// Query-ready summary of result extremes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result_summary: Option<ResultSummary>,
    /// Deterministic solver-run metadata for reproducibility.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub solver_run_meta: Option<SolverRunMeta>,
}

// ==================== Quad Stress Output ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuadStress {
    pub element_id: usize,
    pub sigma_xx: f64,
    pub sigma_yy: f64,
    pub tau_xy: f64,
    pub mx: f64,
    pub my: f64,
    pub mxy: f64,
    pub von_mises: f64,
    /// Nodal von Mises stresses (4 values, one per node).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub nodal_von_mises: Vec<f64>,
}

/// Full stress tensor at a quad element node (extrapolated from Gauss points).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuadNodalStress {
    pub node_index: usize,
    pub sigma_xx: f64,
    pub sigma_yy: f64,
    pub tau_xy: f64,
    pub mx: f64,
    pub my: f64,
    pub mxy: f64,
    pub von_mises: f64,
}

// ==================== Plate Stress Output ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlateStress {
    pub element_id: usize,
    pub sigma_xx: f64,
    pub sigma_yy: f64,
    pub tau_xy: f64,
    pub mx: f64,
    pub my: f64,
    pub mxy: f64,
    pub sigma_1: f64,
    pub sigma_2: f64,
    pub von_mises: f64,
    /// Nodal von Mises stresses (3 values, one per node).
    /// Computed from DKT B-matrix evaluated at element vertices.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub nodal_von_mises: Vec<f64>,
}

// ==================== Co-rotational Output ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorotationalResult {
    pub results: AnalysisResults,
    pub iterations: usize,
    pub converged: bool,
    pub load_increments: usize,
    pub max_displacement: f64,
}

/// 3D co-rotational large displacement analysis result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorotationalResult3D {
    pub results: AnalysisResults3D,
    pub iterations: usize,
    pub converged: bool,
    pub load_increments: usize,
    pub max_displacement: f64,
}

// ==================== Nonlinear Material Output ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NonlinearMaterialResult {
    pub results: AnalysisResults,
    pub converged: bool,
    pub iterations: usize,
    pub load_factor: f64,
    pub element_status: Vec<ElementPlasticStatus>,
    pub load_displacement: Vec<[f64; 2]>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementPlasticStatus {
    pub element_id: usize,
    pub state: String,
    pub utilization: f64,
    pub plastic_rotation_start: f64,
    pub plastic_rotation_end: f64,
}

/// 3D nonlinear material analysis result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NonlinearMaterialResult3D {
    pub results: AnalysisResults3D,
    pub converged: bool,
    pub iterations: usize,
    pub load_factor: f64,
    pub element_status: Vec<ElementPlasticStatus3D>,
    pub load_displacement: Vec<[f64; 2]>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementPlasticStatus3D {
    pub element_id: usize,
    pub state: String,
    pub utilization: f64,
    pub plastic_rotation_start_y: f64,
    pub plastic_rotation_start_z: f64,
    pub plastic_rotation_end_y: f64,
    pub plastic_rotation_end_z: f64,
}

// ==================== Time History Output ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeHistoryResult {
    pub time_steps: Vec<f64>,
    pub node_histories: Vec<NodeTimeHistory>,
    pub peak_displacements: Vec<Displacement>,
    pub peak_reactions: Vec<Reaction>,
    pub n_steps: usize,
    pub method: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeTimeHistory {
    pub node_id: usize,
    pub ux: Vec<f64>,
    pub uy: Vec<f64>,
    pub rz: Vec<f64>,
    pub vx: Vec<f64>,
    pub vy: Vec<f64>,
    pub ax: Vec<f64>,
    pub ay: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeHistoryResult3D {
    pub time_steps: Vec<f64>,
    pub node_histories: Vec<NodeTimeHistory3D>,
    pub peak_displacements: Vec<Displacement3D>,
    pub peak_reactions: Vec<Reaction3D>,
    pub n_steps: usize,
    pub method: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeTimeHistory3D {
    pub node_id: usize,
    pub ux: Vec<f64>,
    pub uy: Vec<f64>,
    pub uz: Vec<f64>,
    pub rx: Vec<f64>,
    pub ry: Vec<f64>,
    pub rz: Vec<f64>,
    pub vx: Vec<f64>,
    pub vy: Vec<f64>,
    pub vz: Vec<f64>,
    pub ax: Vec<f64>,
    pub ay: Vec<f64>,
    pub az: Vec<f64>,
}
