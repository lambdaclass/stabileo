use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ==================== 2D Input Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverNode {
    pub id: usize,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverMaterial {
    pub id: usize,
    pub e: f64,  // MPa
    pub nu: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverSection {
    pub id: usize,
    pub a: f64,  // m²
    pub iz: f64, // m⁴
    #[serde(default)]
    pub as_y: Option<f64>,  // m², shear area for Timoshenko beam (enables shear deformation)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverElement {
    pub id: usize,
    #[serde(rename = "type")]
    pub elem_type: String, // "frame" or "truss"
    pub node_i: usize,
    pub node_j: usize,
    pub material_id: usize,
    pub section_id: usize,
    pub hinge_start: bool,
    pub hinge_end: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverSupport {
    pub id: usize,
    pub node_id: usize,
    #[serde(rename = "type")]
    pub support_type: String,
    #[serde(default)]
    pub kx: Option<f64>,
    #[serde(default)]
    pub ky: Option<f64>,
    #[serde(default)]
    pub kz: Option<f64>,
    #[serde(default)]
    pub dx: Option<f64>,
    #[serde(default)]
    pub dy: Option<f64>,
    #[serde(default)]
    pub drz: Option<f64>,
    #[serde(default)]
    pub angle: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverNodalLoad {
    pub node_id: usize,
    pub fx: f64,
    pub fy: f64,
    pub mz: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverDistributedLoad {
    pub element_id: usize,
    #[serde(rename = "qI")]
    pub q_i: f64,
    #[serde(rename = "qJ")]
    pub q_j: f64,
    #[serde(default)]
    pub a: Option<f64>,
    #[serde(default)]
    pub b: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverPointLoadOnElement {
    pub element_id: usize,
    pub a: f64,
    pub p: f64,
    #[serde(default)]
    pub px: Option<f64>,
    #[serde(default)]
    pub mz: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverThermalLoad {
    pub element_id: usize,
    pub dt_uniform: f64,
    pub dt_gradient: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum SolverLoad {
    #[serde(rename = "nodal")]
    Nodal(SolverNodalLoad),
    #[serde(rename = "distributed")]
    Distributed(SolverDistributedLoad),
    #[serde(rename = "pointOnElement")]
    PointOnElement(SolverPointLoadOnElement),
    #[serde(rename = "thermal")]
    Thermal(SolverThermalLoad),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverInput {
    pub nodes: HashMap<String, SolverNode>,
    pub materials: HashMap<String, SolverMaterial>,
    pub sections: HashMap<String, SolverSection>,
    pub elements: HashMap<String, SolverElement>,
    pub supports: HashMap<String, SolverSupport>,
    pub loads: Vec<SolverLoad>,
}

// ==================== 3D Input Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverNode3D {
    pub id: usize,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverSection3D {
    pub id: usize,
    #[serde(default)]
    pub name: Option<String>,
    pub a: f64,
    pub iy: f64,
    pub iz: f64,
    pub j: f64,
    #[serde(default)]
    pub cw: Option<f64>,
    #[serde(default)]
    pub as_y: Option<f64>,  // m², shear area for Y-bending (Timoshenko)
    #[serde(default)]
    pub as_z: Option<f64>,  // m², shear area for Z-bending (Timoshenko)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverElement3D {
    pub id: usize,
    #[serde(rename = "type")]
    pub elem_type: String,
    pub node_i: usize,
    pub node_j: usize,
    pub material_id: usize,
    pub section_id: usize,
    pub hinge_start: bool,
    pub hinge_end: bool,
    #[serde(default)]
    pub local_yx: Option<f64>,
    #[serde(default)]
    pub local_yy: Option<f64>,
    #[serde(default)]
    pub local_yz: Option<f64>,
    #[serde(default)]
    pub roll_angle: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverSupport3D {
    pub node_id: usize,
    pub rx: bool,
    pub ry: bool,
    pub rz: bool,
    pub rrx: bool,
    pub rry: bool,
    pub rrz: bool,
    #[serde(default)]
    pub kx: Option<f64>,
    #[serde(default)]
    pub ky: Option<f64>,
    #[serde(default)]
    pub kz: Option<f64>,
    #[serde(default)]
    pub krx: Option<f64>,
    #[serde(default)]
    pub kry: Option<f64>,
    #[serde(default)]
    pub krz: Option<f64>,
    #[serde(default)]
    pub dx: Option<f64>,
    #[serde(default)]
    pub dy: Option<f64>,
    #[serde(default)]
    pub dz: Option<f64>,
    #[serde(default)]
    pub drx: Option<f64>,
    #[serde(default)]
    pub dry: Option<f64>,
    #[serde(default)]
    pub drz: Option<f64>,
    #[serde(default)]
    pub rw: Option<bool>,
    #[serde(default)]
    pub kw: Option<f64>,
    #[serde(default)]
    pub normal_x: Option<f64>,
    #[serde(default)]
    pub normal_y: Option<f64>,
    #[serde(default)]
    pub normal_z: Option<f64>,
    #[serde(default)]
    pub is_inclined: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverNodalLoad3D {
    pub node_id: usize,
    pub fx: f64,
    pub fy: f64,
    pub fz: f64,
    pub mx: f64,
    pub my: f64,
    pub mz: f64,
    #[serde(default)]
    pub bw: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverDistributedLoad3D {
    pub element_id: usize,
    #[serde(rename = "qYI")]
    pub q_yi: f64,
    #[serde(rename = "qYJ")]
    pub q_yj: f64,
    #[serde(rename = "qZI")]
    pub q_zi: f64,
    #[serde(rename = "qZJ")]
    pub q_zj: f64,
    #[serde(default)]
    pub a: Option<f64>,
    #[serde(default)]
    pub b: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverPointLoad3D {
    pub element_id: usize,
    pub a: f64,
    pub py: f64,
    pub pz: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverThermalLoad3D {
    pub element_id: usize,
    pub dt_uniform: f64,
    pub dt_gradient_y: f64,
    pub dt_gradient_z: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum SolverLoad3D {
    #[serde(rename = "nodal")]
    Nodal(SolverNodalLoad3D),
    #[serde(rename = "distributed")]
    Distributed(SolverDistributedLoad3D),
    #[serde(rename = "pointOnElement")]
    PointOnElement(SolverPointLoad3D),
    #[serde(rename = "thermal")]
    Thermal(SolverThermalLoad3D),
    #[serde(rename = "pressure")]
    Pressure(SolverPressureLoad),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverInput3D {
    pub nodes: HashMap<String, SolverNode3D>,
    pub materials: HashMap<String, SolverMaterial>,
    pub sections: HashMap<String, SolverSection3D>,
    pub elements: HashMap<String, SolverElement3D>,
    pub supports: HashMap<String, SolverSupport3D>,
    pub loads: Vec<SolverLoad3D>,
    #[serde(default)]
    pub left_hand: Option<bool>,
    #[serde(default)]
    pub plates: HashMap<String, SolverPlateElement>,
    #[serde(default)]
    pub curved_beams: Vec<CurvedBeamInput>,
}

// ==================== Plate / Curved Beam Input Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverPlateElement {
    pub id: usize,
    pub nodes: [usize; 3],
    pub material_id: usize,
    pub thickness: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverPressureLoad {
    pub element_id: usize,
    pub pressure: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurvedBeamInput {
    pub node_start: usize,
    pub node_mid: usize,
    pub node_end: usize,
    pub material_id: usize,
    pub section_id: usize,
    #[serde(default = "default_num_segments")]
    pub num_segments: usize,
    #[serde(default)]
    pub hinge_start: bool,
    #[serde(default)]
    pub hinge_end: bool,
}

fn default_num_segments() -> usize { 10 }

// ==================== Advanced Analysis Input Types ====================

/// Modal analysis input: solver input + material densities.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModalInput {
    pub solver: SolverInput,
    pub densities: HashMap<String, f64>, // materialId → density (kg/m³)
}

/// Spectral analysis input (self-contained, no cross-module deps).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectralInput {
    pub solver: SolverInput,
    pub modes: Vec<SpectralModeInput>,
    pub densities: HashMap<String, f64>,
    pub spectrum: DesignSpectrum,
    pub direction: String, // "X" or "Y"
    #[serde(default)]
    pub rule: Option<String>, // "SRSS" or "CQC"
    #[serde(default)]
    pub xi: Option<f64>,
    #[serde(default)]
    pub importance_factor: Option<f64>,
    #[serde(default)]
    pub reduction_factor: Option<f64>,
    #[serde(default)]
    pub total_mass: Option<f64>,
}

/// Mode shape data passed into spectral analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectralModeInput {
    pub frequency: f64,
    pub period: f64,
    pub omega: f64,
    pub displacements: Vec<SpectralModeDisp>,
    pub participation_x: f64,
    pub participation_y: f64,
    pub effective_mass_x: f64,
    pub effective_mass_y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectralModeDisp {
    pub node_id: usize,
    pub ux: f64,
    pub uy: f64,
    pub rz: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignSpectrum {
    pub name: String,
    pub points: Vec<SpectrumPoint>,
    #[serde(default)]
    pub in_g: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectrumPoint {
    pub period: f64,
    pub sa: f64,
}

/// 3D spectral analysis input.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectralInput3D {
    pub solver: SolverInput3D,
    pub modes: Vec<SpectralModeInput3D>,
    pub densities: HashMap<String, f64>,
    pub spectrum: DesignSpectrum,
    pub direction: String, // "X", "Y", or "Z"
    #[serde(default)]
    pub rule: Option<String>,
    #[serde(default)]
    pub xi: Option<f64>,
    #[serde(default)]
    pub importance_factor: Option<f64>,
    #[serde(default)]
    pub reduction_factor: Option<f64>,
    #[serde(default)]
    pub total_mass: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectralModeInput3D {
    pub frequency: f64,
    pub period: f64,
    pub omega: f64,
    pub displacements: Vec<SpectralModeDisp3D>,
    pub participation_x: f64,
    pub participation_y: f64,
    pub participation_z: f64,
    pub effective_mass_x: f64,
    pub effective_mass_y: f64,
    pub effective_mass_z: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectralModeDisp3D {
    pub node_id: usize,
    pub ux: f64,
    pub uy: f64,
    pub uz: f64,
    pub rx: f64,
    pub ry: f64,
    pub rz: f64,
}

/// 3D modal analysis input.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModalInput3D {
    pub solver: SolverInput3D,
    pub densities: HashMap<String, f64>,
}

/// Plastic analysis input.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticInput {
    pub solver: SolverInput,
    pub sections: HashMap<String, PlasticSectionData>,
    pub materials: HashMap<String, PlasticMaterialData>,
    #[serde(default)]
    pub max_hinges: Option<usize>,
    #[serde(default)]
    pub mp_overrides: Option<HashMap<String, f64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticSectionData {
    pub a: f64,
    pub iz: f64,
    pub material_id: usize,
    #[serde(default)]
    pub b: Option<f64>,
    #[serde(default)]
    pub h: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticMaterialData {
    #[serde(default)]
    pub fy: Option<f64>, // Yield stress (MPa)
}

/// Moving loads analysis input.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MovingLoadInput {
    pub solver: SolverInput,
    pub train: LoadTrain,
    #[serde(default)]
    pub step: Option<f64>,
    #[serde(default)]
    pub path_element_ids: Option<Vec<usize>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadTrain {
    pub name: String,
    pub axles: Vec<Axle>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Axle {
    pub offset: f64,
    pub weight: f64,
}

// ==================== Nonlinear Material Analysis ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NonlinearMaterialInput {
    pub solver: SolverInput,
    pub material_models: HashMap<String, MaterialModel>,
    pub section_capacities: HashMap<String, SectionCapacity>,
    #[serde(default = "default_max_iter")]
    pub max_iter: usize,
    #[serde(default = "default_tolerance")]
    pub tolerance: f64,
    #[serde(default = "default_n_increments")]
    pub n_increments: usize,
}

fn default_max_iter() -> usize { 50 }
fn default_tolerance() -> f64 { 1e-6 }
fn default_n_increments() -> usize { 10 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialModel {
    pub model_type: String,
    pub fy: f64,
    #[serde(default)]
    pub alpha: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionCapacity {
    pub np: f64,
    pub mp: f64,
    #[serde(default)]
    pub zp: Option<f64>,
}

/// 3D nonlinear material analysis input.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NonlinearMaterialInput3D {
    pub solver: SolverInput3D,
    pub material_models: HashMap<String, MaterialModel>,
    pub section_capacities: HashMap<String, SectionCapacity3D>,
    #[serde(default = "default_max_iter")]
    pub max_iter: usize,
    #[serde(default = "default_tolerance")]
    pub tolerance: f64,
    #[serde(default = "default_n_increments")]
    pub n_increments: usize,
}

/// 3D section capacity with biaxial bending.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionCapacity3D {
    pub np: f64,
    pub mpy: f64,
    pub mpz: f64,
    #[serde(default)]
    pub mpx: Option<f64>, // Torsional plastic moment
}

// ==================== Time History Analysis ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeHistoryInput {
    pub solver: SolverInput,
    pub densities: HashMap<String, f64>,
    pub time_step: f64,
    pub n_steps: usize,
    #[serde(default = "default_method")]
    pub method: String,
    #[serde(default = "default_newmark_beta")]
    pub beta: f64,
    #[serde(default = "default_newmark_gamma")]
    pub gamma: f64,
    #[serde(default)]
    pub alpha: Option<f64>,
    #[serde(default)]
    pub damping_xi: Option<f64>,
    #[serde(default)]
    pub ground_accel: Option<Vec<f64>>,
    #[serde(default)]
    pub ground_direction: Option<String>,
    #[serde(default)]
    pub force_history: Option<Vec<TimeForceRecord>>,
}

fn default_method() -> String { "newmark".to_string() }
fn default_newmark_beta() -> f64 { 0.25 }
fn default_newmark_gamma() -> f64 { 0.5 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeForceRecord {
    pub time: f64,
    pub loads: Vec<SolverNodalLoad>,
}

// ==================== Construction Staging + Prestress ====================

use super::output::{AnalysisResults, AnalysisResults3D};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstructionStage {
    pub name: String,
    #[serde(default)]
    pub elements_added: Vec<usize>,
    #[serde(default)]
    pub elements_removed: Vec<usize>,
    #[serde(default)]
    pub load_indices: Vec<usize>,
    #[serde(default)]
    pub supports_added: Vec<usize>,
    #[serde(default)]
    pub supports_removed: Vec<usize>,
    #[serde(default)]
    pub prestress_loads: Vec<PrestressLoad>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrestressLoad {
    pub element_id: usize,
    pub force: f64,
    pub eccentricity_i: f64,
    pub eccentricity_j: f64,
    #[serde(default)]
    pub profile: TendonProfile,
    #[serde(default)]
    pub mu: Option<f64>,
    #[serde(default)]
    pub kappa: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TendonProfile {
    #[serde(rename = "straight")]
    Straight,
    #[serde(rename = "parabolic")]
    Parabolic { e_mid: f64 },
}

impl Default for TendonProfile {
    fn default() -> Self { TendonProfile::Straight }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedInput {
    pub nodes: HashMap<String, SolverNode>,
    pub materials: HashMap<String, SolverMaterial>,
    pub sections: HashMap<String, SolverSection>,
    pub elements: HashMap<String, SolverElement>,
    pub supports: HashMap<String, SolverSupport>,
    pub loads: Vec<SolverLoad>,
    pub stages: Vec<ConstructionStage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedInput3D {
    pub nodes: HashMap<String, SolverNode3D>,
    pub materials: HashMap<String, SolverMaterial>,
    pub sections: HashMap<String, SolverSection3D>,
    pub elements: HashMap<String, SolverElement3D>,
    pub supports: HashMap<String, SolverSupport3D>,
    pub loads: Vec<SolverLoad3D>,
    pub stages: Vec<ConstructionStage3D>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstructionStage3D {
    pub name: String,
    #[serde(default)]
    pub elements_added: Vec<usize>,
    #[serde(default)]
    pub elements_removed: Vec<usize>,
    #[serde(default)]
    pub load_indices: Vec<usize>,
    #[serde(default)]
    pub supports_added: Vec<usize>,
    #[serde(default)]
    pub supports_removed: Vec<usize>,
    #[serde(default)]
    pub prestress_loads: Vec<PrestressLoad>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageResult {
    pub stage_name: String,
    pub stage_index: usize,
    pub results: AnalysisResults,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedAnalysisResults {
    pub stages: Vec<StageResult>,
    pub final_results: AnalysisResults,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageResult3D {
    pub stage_name: String,
    pub stage_index: usize,
    pub results: AnalysisResults3D,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedAnalysisResults3D {
    pub stages: Vec<StageResult3D>,
    pub final_results: AnalysisResults3D,
}
