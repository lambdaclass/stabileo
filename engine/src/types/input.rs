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
    #[serde(default)]
    pub constraints: Vec<Constraint>,
    #[serde(default)]
    pub connectors: HashMap<String, ConnectorElement>,
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
    #[serde(rename = "plateThermal")]
    PlateThermal(SolverPlateThermalLoad),
    #[serde(rename = "bimoment")]
    Bimoment(SolverBimomentLoad),
    #[serde(rename = "quadPressure")]
    QuadPressure(SolverPressureLoad),
    #[serde(rename = "quadThermal")]
    QuadThermal(SolverPlateThermalLoad),
    #[serde(rename = "quadEdge")]
    QuadEdge(SolverQuadEdgeLoad),
    #[serde(rename = "quadSelfWeight")]
    QuadSelfWeight(SolverQuadSelfWeightLoad),
    #[serde(rename = "quad9Pressure")]
    Quad9Pressure(SolverPressureLoad),
    #[serde(rename = "quad9Thermal")]
    Quad9Thermal(SolverPlateThermalLoad),
    #[serde(rename = "quad9Edge")]
    Quad9Edge(SolverQuadEdgeLoad),
    #[serde(rename = "quad9SelfWeight")]
    Quad9SelfWeight(SolverQuadSelfWeightLoad),
    #[serde(rename = "solidShellPressure")]
    SolidShellPressure(SolverPressureLoad),
    #[serde(rename = "solidShellSelfWeight")]
    SolidShellSelfWeight(SolverSolidShellSelfWeightLoad),
    #[serde(rename = "curvedShellPressure")]
    CurvedShellPressure(SolverPressureLoad),
    #[serde(rename = "curvedShellThermal")]
    CurvedShellThermal(SolverPlateThermalLoad),
    #[serde(rename = "curvedShellEdge")]
    CurvedShellEdge(SolverQuadEdgeLoad),
    #[serde(rename = "curvedShellSelfWeight")]
    CurvedShellSelfWeight(SolverQuadSelfWeightLoad),
}

/// Body force (self-weight) load on a quad element.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverQuadSelfWeightLoad {
    pub element_id: usize,
    /// Mass density (kg/m³)
    pub density: f64,
    /// Gravity acceleration components (m/s²), global coordinates
    #[serde(default)]
    pub gx: f64,
    #[serde(default)]
    pub gy: f64,
    #[serde(default)]
    pub gz: f64,
}

/// Edge load on a quad element.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverQuadEdgeLoad {
    pub element_id: usize,
    /// Edge index 0-3 (0=nodes 0→1, 1=1→2, 2=2→3, 3=3→0)
    pub edge: usize,
    /// Normal pressure on edge (force/length), positive = outward
    #[serde(default)]
    pub qn: f64,
    /// Tangential traction along edge (force/length)
    #[serde(default)]
    pub qt: f64,
}

/// Concentrated bimoment load applied to a node (warping torsion).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverBimomentLoad {
    pub node_id: usize,
    pub bimoment: f64,
}

/// Plate thermal load: uniform temperature change and/or through-thickness gradient.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverPlateThermalLoad {
    pub element_id: usize,
    pub dt_uniform: f64,
    #[serde(default)]
    pub dt_gradient: f64,
    #[serde(default)]
    pub alpha: Option<f64>,
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
    pub constraints: Vec<Constraint>,
    #[serde(default)]
    pub left_hand: Option<bool>,
    #[serde(default)]
    pub plates: HashMap<String, SolverPlateElement>,
    #[serde(default)]
    pub quads: HashMap<String, SolverQuadElement>,
    #[serde(default)]
    pub quad9s: HashMap<String, SolverQuad9Element>,
    #[serde(default)]
    pub solid_shells: HashMap<String, SolverSolidShellElement>,
    #[serde(default)]
    pub curved_shells: HashMap<String, SolverCurvedShellElement>,
    #[serde(default)]
    pub curved_beams: Vec<CurvedBeamInput>,
    #[serde(default)]
    pub connectors: HashMap<String, ConnectorElement>,
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
pub struct SolverQuadElement {
    pub id: usize,
    pub nodes: [usize; 4],
    pub material_id: usize,
    pub thickness: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverQuad9Element {
    pub id: usize,
    pub nodes: [usize; 9],
    pub material_id: usize,
    pub thickness: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverSolidShellElement {
    pub id: usize,
    pub nodes: [usize; 8],
    pub material_id: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverCurvedShellElement {
    pub id: usize,
    pub nodes: [usize; 4],
    pub material_id: usize,
    pub thickness: f64,
    /// Optional per-node director vectors (shell normals). Auto-computed if None.
    #[serde(default)]
    pub normals: Option<[[f64; 3]; 4]>,
}

/// Self-weight load for solid-shell elements.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverSolidShellSelfWeightLoad {
    pub element_id: usize,
    /// Mass density (kg/m³)
    pub density: f64,
    #[serde(default)]
    pub gx: f64,
    #[serde(default)]
    pub gy: f64,
    #[serde(default)]
    pub gz: f64,
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

/// 3D plastic (pushover) analysis input.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticInput3D {
    pub solver: SolverInput3D,
    pub sections: HashMap<String, PlasticSectionData3D>,
    pub materials: HashMap<String, PlasticMaterialData>,
    #[serde(default)]
    pub max_hinges: Option<usize>,
    /// Override plastic moments: key is section_id, value is [Mp_y, Mp_z]
    #[serde(default)]
    pub mp_overrides: Option<HashMap<String, [f64; 2]>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticSectionData3D {
    pub a: f64,
    pub iy: f64,
    pub iz: f64,
    pub material_id: usize,
    #[serde(default)]
    pub b: Option<f64>,
    #[serde(default)]
    pub h: Option<f64>,
    /// Depth in the other direction (for Z-axis plastic modulus)
    #[serde(default)]
    pub d: Option<f64>,
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

/// 3D moving loads analysis input.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MovingLoadInput3D {
    pub solver: SolverInput3D,
    pub train: LoadTrain,
    #[serde(default)]
    pub step: Option<f64>,
    #[serde(default)]
    pub path_element_ids: Option<Vec<usize>>,
    /// Gravity direction: "z" (default, -Z) or "y" (-Y).
    #[serde(default)]
    pub gravity_direction: Option<String>,
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

// ==================== Initial Imperfections & Residual Stress ====================

/// Geometric imperfection: offset a node from its ideal position.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeImperfection {
    pub node_id: usize,
    /// Offset in X (m)
    #[serde(default)]
    pub dx: f64,
    /// Offset in Y (m)
    #[serde(default)]
    pub dy: f64,
    /// Offset in Z (m) (3D only)
    #[serde(default)]
    pub dz: f64,
}

/// Equivalent notional load from out-of-plumbness (code-based approach).
/// Converts geometric imperfection ratio to lateral loads proportional to gravity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotionalLoadDef {
    /// Imperfection ratio (e.g., 1/200 = 0.005 per AISC, 1/200 per EC3)
    pub ratio: f64,
    /// Direction: 0=X, 1=Y, 2=Z
    #[serde(default)]
    pub direction: usize,
    /// Gravity axis: 0=X, 1=Y, 2=Z (default 1=Y for vertical)
    #[serde(default = "default_gravity_axis")]
    pub gravity_axis: usize,
}

fn default_gravity_axis() -> usize { 1 }

/// Residual stress pattern for fiber sections.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ResidualStressPattern {
    /// ECCS residual stress for hot-rolled I-sections.
    /// Linear variation: +0.3fy at flange tips, -0.3fy at flange center.
    #[serde(rename = "eccs_hot_rolled")]
    EccsHotRolled {
        /// Yield stress (MPa)
        fy: f64,
        /// Fraction of fy (default 0.3)
        #[serde(default = "default_residual_fraction")]
        fraction: f64,
    },
    /// Uniform residual stress over all fibers.
    #[serde(rename = "uniform")]
    Uniform {
        /// Stress value (MPa, positive = tension)
        stress: f64,
    },
    /// Per-fiber residual stresses (indexed by fiber order in section).
    #[serde(rename = "custom")]
    Custom {
        /// Stress per fiber (MPa)
        stresses: Vec<f64>,
    },
}

fn default_residual_fraction() -> f64 { 0.3 }

/// Initial imperfection input for nonlinear analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImperfectionInput {
    /// Node position offsets
    #[serde(default)]
    pub node_imperfections: Vec<NodeImperfection>,
    /// Notional loads from out-of-plumbness
    #[serde(default)]
    pub notional_loads: Vec<NotionalLoadDef>,
    /// Residual stress patterns per section ID
    #[serde(default)]
    pub residual_stresses: HashMap<String, ResidualStressPattern>,
    /// Initial displacements from previous analysis (node_id → [ux, uy, rz])
    #[serde(default)]
    pub initial_displacements: HashMap<String, Vec<f64>>,
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

// ==================== 3D Time History ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeHistoryInput3D {
    pub solver: SolverInput3D,
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
    /// Ground acceleration time series for X direction
    #[serde(default)]
    pub ground_accel_x: Option<Vec<f64>>,
    /// Ground acceleration time series for Y direction
    #[serde(default)]
    pub ground_accel_y: Option<Vec<f64>>,
    /// Ground acceleration time series for Z direction
    #[serde(default)]
    pub ground_accel_z: Option<Vec<f64>>,
    /// Time-varying applied forces
    #[serde(default)]
    pub force_history: Option<Vec<TimeForceRecord3D>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeForceRecord3D {
    pub time: f64,
    pub loads: Vec<SolverNodalLoad3D>,
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
    #[serde(rename = "harped")]
    Harped { e_harp: f64 },
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
    #[serde(default)]
    pub constraints: Vec<Constraint>,
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
    #[serde(default)]
    pub constraints: Vec<Constraint>,
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

// ==================== Constraint Types ====================

/// Multi-point constraint definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Constraint {
    /// Rigid link: slave follows master with rigid-body kinematics.
    #[serde(rename = "rigidLink")]
    RigidLink(RigidLinkConstraint),
    /// Diaphragm: in-plane rigidity coupling translational DOFs.
    #[serde(rename = "diaphragm")]
    Diaphragm(DiaphragmConstraint),
    /// General linear MPC: Σ(coeff_i × u_i) = 0
    #[serde(rename = "linearMPC")]
    LinearMPC(LinearMPCConstraint),
    /// Equal DOF: slave DOFs equal master DOFs.
    #[serde(rename = "equalDOF")]
    EqualDOF(EqualDOFConstraint),
    /// Eccentric connection: rigid link with explicit offset and optional releases.
    #[serde(rename = "eccentricConnection")]
    EccentricConnection(EccentricConnectionConstraint),
}

/// Rigid link: slave node follows master node with rigid-body offset.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RigidLinkConstraint {
    pub master_node: usize,
    pub slave_node: usize,
    /// DOFs to constrain on slave: 0=ux,1=uy (2D); 0..5 (3D). Empty = all translational.
    #[serde(default)]
    pub dofs: Vec<usize>,
}

/// Diaphragm: nodes share in-plane rigid-body motion around a master.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiaphragmConstraint {
    pub master_node: usize,
    pub slave_nodes: Vec<usize>,
    /// Plane: "XY" (default), "XZ", or "YZ"
    #[serde(default = "default_diaphragm_plane")]
    pub plane: String,
}

fn default_diaphragm_plane() -> String { "XY".into() }

/// General linear MPC: Σ(coeff_i × u_{node_i, dof_i}) = 0
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearMPCConstraint {
    pub terms: Vec<MPCTerm>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MPCTerm {
    pub node_id: usize,
    pub dof: usize,
    pub coefficient: f64,
}

/// Equal DOF: slave DOFs = master DOFs (1:1 coupling).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EqualDOFConstraint {
    pub master_node: usize,
    pub slave_node: usize,
    pub dofs: Vec<usize>,
}

/// Connector element: spring/dashpot between two nodes.
///
/// Provides point-to-point stiffness (and damping) in specified directions.
/// Useful for bearings, isolators, soil springs, joints, etc.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorElement {
    pub id: usize,
    pub node_i: usize,
    pub node_j: usize,
    /// Axial stiffness (along connector axis)
    #[serde(default)]
    pub k_axial: f64,
    /// Shear stiffness (2D: perpendicular in-plane; 3D: local Y)
    #[serde(default)]
    pub k_shear: f64,
    /// Rotational stiffness (2D: about Z; 3D: torsional about X)
    #[serde(default)]
    pub k_moment: f64,
    /// 3D only: shear stiffness in local Z direction
    #[serde(default)]
    pub k_shear_z: f64,
    /// 3D only: bending stiffness about local Y
    #[serde(default)]
    pub k_bend_y: f64,
    /// 3D only: bending stiffness about local Z
    #[serde(default)]
    pub k_bend_z: f64,
}

/// Eccentric connection: rigid link with explicit offset vector and optional releases.
///
/// Unlike RigidLink (which computes offset from node positions), this allows specifying
/// the eccentricity explicitly. Releases allow hinges at the connection point.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EccentricConnectionConstraint {
    pub master_node: usize,
    pub slave_node: usize,
    /// Offset from master to connection point: (dx, dy) in 2D, (dx, dy, dz) in 3D.
    #[serde(default)]
    pub offset_x: f64,
    #[serde(default)]
    pub offset_y: f64,
    #[serde(default)]
    pub offset_z: f64,
    /// DOF releases at the connection (true = released/hinged).
    /// For 2D: [ux, uy, rz]. For 3D: [ux, uy, uz, rx, ry, rz].
    /// Released DOFs are NOT constrained (slave is free in that DOF).
    #[serde(default)]
    pub releases: Vec<bool>,
}
