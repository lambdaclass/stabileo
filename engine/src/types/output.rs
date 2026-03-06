use serde::{Deserialize, Serialize};

fn is_zero(v: &f64) -> bool { *v == 0.0 }

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
    /// Thermal axial FEF at node I: E*A*alpha*dt_uniform (positive = tension)
    #[serde(default, skip_serializing_if = "is_zero")]
    pub thermal_n_fef: f64,
    /// Thermal moment FEF at node I: E*Iz*alpha*dt_gradient/h
    #[serde(default, skip_serializing_if = "is_zero")]
    pub thermal_mz_fef: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisResults {
    pub displacements: Vec<Displacement>,
    pub reactions: Vec<Reaction>,
    pub element_forces: Vec<ElementForces>,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisResults3D {
    pub displacements: Vec<Displacement3D>,
    pub reactions: Vec<Reaction3D>,
    pub element_forces: Vec<ElementForces3D>,
}
