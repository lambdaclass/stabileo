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
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverDiagnostic {
    pub category: String,   // "solver_path", "conditioning", "fallback"
    pub message: String,
    pub severity: String,   // "info", "warning", "error"
}

// ==================== Solve Timings ====================

/// Per-phase wall-clock timings from solve_3d (microseconds).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolveTimings {
    pub assembly_us: u64,
    pub conditioning_us: u64,
    pub symbolic_us: u64,
    pub numeric_us: u64,
    pub solve_us: u64,
    pub residual_us: u64,
    pub dense_fallback_us: u64,
    pub reactions_us: u64,
    pub stress_recovery_us: u64,
    pub total_us: u64,
    pub n_free: usize,
    pub nnz_kff: usize,
    pub nnz_l: usize,
    pub pivot_perturbations: usize,
    pub max_perturbation: f64,
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
