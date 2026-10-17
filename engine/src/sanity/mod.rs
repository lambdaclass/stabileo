//! Model sanity review: the modelling errors a solver cannot see.
//!
//! The solver computes the exact answer to the model it is given. When the model is wrong — E
//! typed in GPa where MPa was meant, geometry drawn in millimetres, a dead load pointing up,
//! self-weight left out, supports that only just hold the structure — the answer is exact and
//! useless. Nothing in the solve can tell: the equations balance, the residual is round-off.
//!
//! This module looks at the model and its results from the outside, the way a checking engineer
//! does, and reports what does not look like a building:
//!
//! 1. **Equilibrium per case**, component by component: Σ reactions against an applied side the
//!    caller summed independently from the model (the app's statics check), so a load the solve
//!    lost or a reaction it did not report shows up.
//! 2. **Gravity weight per floor area** against a plausible band (4–18 kN/m² by default).
//! 3. **Fundamental period** against the code's empirical Ta = Cr·H^x (CIRSOC 103 Tabla 6.2,
//!    the same coefficients as ASCE 7 Table 12.8-2).
//! 4. **Tributary-area column loads** against the FE axial forces, on regular frames only.
//! 5. **Input plausibility**: E, density and fy against known materials (unit mix-ups); section
//!    properties near zero or huge relative to the model; parts with no path to a support;
//!    nodes lying on a member's span without being connected to it; supports that all sit on
//!    one point or one line; springs absurdly soft or stiff relative to what they hold;
//!    displacements absurd for the span.
//!
//! Every finding carries a severity, what was found with its numbers, why it matters, how to fix
//! it and the ids it is about. Every check also reports whether it ran: a check that could not
//! run on a model says so and why, so a short list of findings is never mistaken for a clean
//! bill of health.
//!
//! Units are the app's: kN, m, MPa (E, fy), kN/m³ (density). Pure: no solve happens here.

mod inputs;
mod results;
pub mod geometry;

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub use crate::types::Severity;

// ==================== Input ====================

/// The vertical axis. 3D models in the app are Z-up; plane models are drawn in X-Y with Y up.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum UpAxis {
    Y,
    #[default]
    Z,
}

impl UpAxis {
    pub fn index(self) -> usize {
        match self {
            UpAxis::Y => 1,
            UpAxis::Z => 2,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SanityNode {
    pub id: usize,
    pub x: f64,
    pub y: f64,
    #[serde(default)]
    pub z: f64,
}

impl SanityNode {
    pub fn p(&self) -> [f64; 3] {
        [self.x, self.y, self.z]
    }
}

/// A material family, when the caller knows it (a catalogued grade).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MaterialFamily {
    Steel,
    Concrete,
    Timber,
    Masonry,
    Aluminium,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SanityMaterial {
    pub id: usize,
    #[serde(default)]
    pub name: String,
    /// Young's modulus, MPa.
    pub e: f64,
    /// Unit weight, kN/m³.
    #[serde(default)]
    pub rho: Option<f64>,
    /// Yield strength (steel) or f'c (concrete), MPa.
    #[serde(default)]
    pub fy: Option<f64>,
    /// The family, only when it is stated (a catalogued grade), never guessed by the caller.
    #[serde(default)]
    pub family: Option<MaterialFamily>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SanitySection {
    pub id: usize,
    #[serde(default)]
    pub name: String,
    /// m²
    pub a: f64,
    /// m⁴
    #[serde(default)]
    pub iz: f64,
    /// m⁴
    #[serde(default)]
    pub iy: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SanityMember {
    pub id: usize,
    pub node_i: usize,
    pub node_j: usize,
    pub material_id: usize,
    pub section_id: usize,
    /// Axial only (truss, cable, one-way member).
    #[serde(default)]
    pub truss: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SanityShell {
    pub id: usize,
    /// "plate" (triangle) or "quad".
    #[serde(default)]
    pub kind: String,
    pub nodes: Vec<usize>,
    pub material_id: usize,
    /// m
    pub thickness: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SanitySupport {
    pub node_id: usize,
    /// Rigid restraints: ux, uy, uz, rx, ry, rz (global).
    #[serde(default)]
    pub restraint: [bool; 6],
    /// Spring stiffnesses, kN/m and kN·m/rad, per the same six components.
    #[serde(default)]
    pub spring: [Option<f64>; 6],
}

impl SanitySupport {
    /// Held in component `k`, rigidly or by a spring with positive stiffness.
    pub fn holds(&self, k: usize) -> bool {
        self.restraint[k] || self.spring[k].map_or(false, |s| s > 0.0)
    }
}

/// What a load case is, as the project typed it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum CaseKind {
    Dead,
    Live,
    RoofLive,
    Snow,
    Wind,
    Seismic,
    Temperature,
    #[default]
    Other,
}

impl CaseKind {
    /// Gravity loads a building carries in service: what weight per floor area and tributary
    /// areas are read from.
    pub fn is_gravity(self) -> bool {
        matches!(self, CaseKind::Dead | CaseKind::Live | CaseKind::RoofLive)
    }
}

/// A six-component vector at a node: forces (kN) then moments (kN·m), or translations (m) then
/// rotations (rad).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeVector {
    pub node_id: usize,
    pub v: [f64; 6],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberAxial {
    pub id: usize,
    /// Axial force at each end, kN, tension positive.
    pub n_start: f64,
    pub n_end: f64,
}

/// A force with its point of application, kN at m.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadPoint {
    pub p: [f64; 3],
    pub f: [f64; 3],
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SanityCase {
    pub id: usize,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub kind: CaseKind,
    /// Σ applied loads (fx, fy, fz, mx, my, mz about the global origin), self-weight included
    /// when the case carries it, summed by the caller from the model, NOT read back from the
    /// solver's load vector. Absent: the equilibrium check cannot run for this case.
    #[serde(default)]
    pub applied: Option<[f64; 6]>,
    /// Load kinds present in the case that `applied` does not account for. Any: the applied
    /// side is not used, and the checks that read it say so.
    #[serde(default)]
    pub uncovered: Vec<String>,
    /// The moment components of `applied` and the reactions are expected to close (a linear
    /// solve without shells: the shells' drilling stabilisation grounds a share of the moment).
    #[serde(default)]
    pub moments_close: bool,
    /// Why this case's equilibrium cannot be checked at all (a spectral case, a magnitude).
    #[serde(default)]
    pub not_checkable: Option<String>,
    /// The case carries the structure's self-weight.
    #[serde(default)]
    pub self_weight: bool,
    #[serde(default)]
    pub reactions: Vec<NodeVector>,
    #[serde(default)]
    pub displacements: Vec<NodeVector>,
    #[serde(default)]
    pub member_axial: Vec<MemberAxial>,
    /// The case's loads as forces at points (self-weight included), for the tributary check.
    #[serde(default)]
    pub load_points: Vec<LoadPoint>,
    /// The case was solved (it has results).
    #[serde(default)]
    pub solved: bool,
}

impl SanityCase {
    /// The applied side, when it accounts for every load in the case: a sum missing some loads
    /// would accuse the model of what the sum left out.
    pub fn summed(&self) -> Option<[f64; 6]> {
        if self.uncovered.is_empty() {
            self.applied
        } else {
            None
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SanityMode {
    /// s
    pub period: f64,
    /// Effective mass ratios in the two plan directions (0..1).
    #[serde(default)]
    pub mass_x: f64,
    #[serde(default)]
    pub mass_y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SanityModal {
    pub modes: Vec<SanityMode>,
}

/// CIRSOC 103 Tabla 6.2 / ASCE 7 Table 12.8-2 structural types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PeriodSystem {
    SteelMomentFrame,
    ConcreteMomentFrame,
    SteelEccentricOrBrb,
    Other,
}

impl PeriodSystem {
    /// (Cr, x) for Ta = Cr·H^x, H in metres.
    pub fn coefficients(self) -> (f64, f64) {
        match self {
            PeriodSystem::SteelMomentFrame => (0.0724, 0.80),
            PeriodSystem::ConcreteMomentFrame => (0.0466, 0.90),
            PeriodSystem::SteelEccentricOrBrb => (0.0731, 0.75),
            PeriodSystem::Other => (0.0488, 0.75),
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            PeriodSystem::SteelMomentFrame => "steel moment frame",
            PeriodSystem::ConcreteMomentFrame => "concrete moment frame",
            PeriodSystem::SteelEccentricOrBrb => "steel EBF/BRB frame",
            PeriodSystem::Other => "other system",
        }
    }

    pub fn key(self) -> &'static str {
        match self {
            PeriodSystem::SteelMomentFrame => "steelMomentFrame",
            PeriodSystem::ConcreteMomentFrame => "concreteMomentFrame",
            PeriodSystem::SteelEccentricOrBrb => "steelEccentricOrBrb",
            PeriodSystem::Other => "other",
        }
    }
}

/// The review's thresholds. Every one has a default; the caller may tighten or widen them.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SanityOptions {
    /// Plausible service gravity weight (dead + live) per floor area of a building, kN/m²: a
    /// light steel frame weighs about 5, a reinforced-concrete one 10–14, a heavy one with
    /// masonry partitions up to about 17.
    pub weight_band: [f64; 2],
    /// Plausible ratio of the computed fundamental period to the code's Ta.
    pub period_band: [f64; 2],
    /// Structural type for Ta; inferred from the model when absent.
    pub period_system: Option<PeriodSystem>,
    /// A displacement larger than span / this under a load case is absurd.
    pub deflection_ratio: f64,
    /// Relative tolerance on Σ applied + Σ reactions, per component.
    pub equilibrium_tol: f64,
    /// Plausible ratio of FE column axial force to its tributary-area estimate.
    pub tributary_band: [f64; 2],
}

impl Default for SanityOptions {
    fn default() -> Self {
        SanityOptions {
            weight_band: [4.0, 18.0],
            period_band: [0.5, 2.5],
            period_system: None,
            deflection_ratio: 10.0,
            equilibrium_tol: 1e-4,
            tributary_band: [0.5, 2.0],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SanityInput {
    #[serde(default)]
    pub up: UpAxis,
    /// A plane model (2D workspace): floor areas do not exist, rotations out of the plane do not
    /// matter.
    #[serde(default)]
    pub planar: bool,
    pub nodes: Vec<SanityNode>,
    #[serde(default)]
    pub materials: Vec<SanityMaterial>,
    #[serde(default)]
    pub sections: Vec<SanitySection>,
    #[serde(default)]
    pub members: Vec<SanityMember>,
    #[serde(default)]
    pub shells: Vec<SanityShell>,
    /// Groups of nodes tied together by something other than a member or shell (connectors,
    /// rigid links, diaphragms, equal-DOF constraints): they share a load path.
    #[serde(default)]
    pub links: Vec<Vec<usize>>,
    #[serde(default)]
    pub supports: Vec<SanitySupport>,
    #[serde(default)]
    pub cases: Vec<SanityCase>,
    #[serde(default)]
    pub modal: Option<SanityModal>,
    /// Results exist (the model was solved). Result checks say so when it was not.
    #[serde(default)]
    pub solved: bool,
    #[serde(default)]
    pub options: SanityOptions,
}

// ==================== Output ====================

/// The checks, each reported as run, partly run or skipped.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckId {
    Equilibrium,
    GravityDirection,
    SelfWeight,
    GravityWeight,
    Period,
    Tributary,
    Materials,
    Sections,
    Geometry,
    LoadPath,
    Supports,
    Springs,
    Deflection,
    Connectivity,
}

/// Stable finding codes. May be added, never renamed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SanityCode {
    EquilibriumViolation,
    EquilibriumUncovered,
    GravityUpward,
    GravityCaseHorizontal,
    SelfWeightMissing,
    WeightPerAreaLow,
    WeightPerAreaHigh,
    PeriodOutOfRange,
    TributaryMismatch,
    StoreyLoadMismatch,
    ModulusImplausible,
    ModulusFamilyMismatch,
    DensityImplausible,
    DensityZero,
    StrengthImplausible,
    SectionImplausible,
    SectionOutlier,
    GeometryScale,
    UnsupportedPart,
    SupportsSinglePoint,
    SupportsColinear,
    SpringSoft,
    SpringStiff,
    DeflectionLarge,
    DisplacementAbsurd,
    NodeOnSpan,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckStatusKind {
    Ran,
    Partial,
    Skipped,
}

/// Why a check did not run, or ran on part of the model.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SkipReason {
    NotSolved,
    NoCases,
    NoAppliedSide,
    SomeCasesUnchecked,
    NoGravityCase,
    PlaneModel,
    NotABuilding,
    NoModal,
    DiagonalMembers,
    Walls,
    IrregularGrid,
    NoLoadPoints,
    NoMembers,
    NoMaterials,
    NoSupports,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum Param {
    Num(f64),
    Text(String),
}

impl From<f64> for Param {
    fn from(v: f64) -> Self {
        Param::Num(v)
    }
}
impl From<usize> for Param {
    fn from(v: usize) -> Self {
        Param::Num(v as f64)
    }
}
impl From<&str> for Param {
    fn from(v: &str) -> Self {
        Param::Text(v.to_string())
    }
}
impl From<String> for Param {
    fn from(v: String) -> Self {
        Param::Text(v)
    }
}

pub type Params = BTreeMap<String, Param>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SanityFinding {
    pub code: SanityCode,
    pub check: CheckId,
    pub severity: Severity,
    /// What was found, with its numbers (English; the app builds its own text from `params`).
    pub message: String,
    /// Why it matters.
    pub why: String,
    /// How to fix it.
    pub fix: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub element_ids: Vec<usize>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub node_ids: Vec<usize>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub shell_ids: Vec<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub case_id: Option<usize>,
    /// The numbers and names in `message`, for a translated text.
    pub params: Params,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckStatus {
    pub check: CheckId,
    pub status: CheckStatusKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<SkipReason>,
    /// The reason in English, with its numbers.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub detail: String,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub params: Params,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SanityReport {
    pub findings: Vec<SanityFinding>,
    pub checks: Vec<CheckStatus>,
}

impl SanityReport {
    pub fn has(&self, code: SanityCode) -> bool {
        self.findings.iter().any(|f| f.code == code)
    }

    pub fn errors(&self) -> impl Iterator<Item = &SanityFinding> {
        self.findings.iter().filter(|f| f.severity == Severity::Error)
    }

    pub fn status(&self, check: CheckId) -> Option<&CheckStatus> {
        self.checks.iter().find(|c| c.check == check)
    }
}

/// Collects findings and statuses.
pub(crate) struct Report {
    pub out: SanityReport,
}

impl Report {
    fn new() -> Self {
        Report { out: SanityReport::default() }
    }

    pub fn ran(&mut self, check: CheckId) {
        self.out.checks.push(CheckStatus { check, status: CheckStatusKind::Ran, reason: None, detail: String::new(), params: Params::new() });
    }

    pub fn skipped(&mut self, check: CheckId, reason: SkipReason, detail: impl Into<String>, params: Params) {
        self.out.checks.push(CheckStatus { check, status: CheckStatusKind::Skipped, reason: Some(reason), detail: detail.into(), params });
    }

    pub fn partial(&mut self, check: CheckId, reason: SkipReason, detail: impl Into<String>, params: Params) {
        self.out.checks.push(CheckStatus { check, status: CheckStatusKind::Partial, reason: Some(reason), detail: detail.into(), params });
    }

    pub fn push(&mut self, f: SanityFinding) {
        self.out.findings.push(f);
    }
}

/// A finding under construction.
pub(crate) fn finding(code: SanityCode, check: CheckId, severity: Severity, message: String) -> SanityFinding {
    let (why, fix) = explain(code);
    SanityFinding {
        code,
        check,
        severity,
        message,
        why: why.to_string(),
        fix: fix.to_string(),
        element_ids: vec![],
        node_ids: vec![],
        shell_ids: vec![],
        case_id: None,
        params: Params::new(),
    }
}

impl SanityFinding {
    pub(crate) fn with(mut self, k: &str, v: impl Into<Param>) -> Self {
        self.params.insert(k.to_string(), v.into());
        self
    }
    pub(crate) fn elements(mut self, ids: Vec<usize>) -> Self {
        self.element_ids = ids;
        self
    }
    pub(crate) fn nodes(mut self, ids: Vec<usize>) -> Self {
        self.node_ids = ids;
        self
    }
    pub(crate) fn shells(mut self, ids: Vec<usize>) -> Self {
        self.shell_ids = ids;
        self
    }
    pub(crate) fn case(mut self, id: usize) -> Self {
        self.case_id = Some(id);
        self
    }
}

/// Why each finding matters and how to fix it.
pub fn explain(code: SanityCode) -> (&'static str, &'static str) {
    use SanityCode::*;
    match code {
        EquilibriumViolation => (
            "The reactions do not add up to the loads, so some load never reached the solve or some reaction was not reported: forces and design read from this case describe a different structure.",
            "Look for loads on removed or inactive members, loads outside the members they name, or supports whose reactions are not reported (springs, constraints); then solve again.",
        ),
        EquilibriumUncovered => (
            "Some loads in this case are of a kind the independent sum cannot total, so the balance is checked without them.",
            "Check those loads by hand, or express them as nodal, member or surface loads.",
        ),
        GravityUpward => (
            "A gravity case whose loads push the structure up has its sign or direction reversed: every force and reaction in it has the wrong sign, and combinations add it where they should subtract.",
            "Check the load direction (global axis and sign) of the loads in this case; gravity acts downward.",
        ),
        GravityCaseHorizontal => (
            "Gravity loads act downward. A dead or live case with a large horizontal resultant usually has member loads in a local axis that is horizontal for some members, or lateral loads filed in the wrong case: those members are loaded sideways and the vertical load they should carry is missing.",
            "Check the axis (local or global) and direction of the member loads in this case, and that wind or seismic loads are in their own cases.",
        ),
        SelfWeightMissing => (
            "The structure's own weight is a large share of the permanent load. Left out, every gravity result and every design is unconservative.",
            "Turn on self-weight for the dead-load case (Analysis settings), or include it explicitly as a dead load.",
        ),
        WeightPerAreaLow => (
            "Buildings weigh between about 4 and 18 kN/m² of floor in service (dead plus live). Far less usually means missing floor loads, missing self-weight or geometry in the wrong units.",
            "Check that every floor carries its dead and live loads, that self-weight is on, and that coordinates are in metres.",
        ),
        WeightPerAreaHigh => (
            "Far more than about 18 kN/m² of floor usually means loads applied twice, a density or load in the wrong units, or area loads applied to members and slabs both.",
            "Check densities (kN/m³), area loads (kN/m²) and line loads (kN/m) for unit mix-ups and loads counted twice.",
        ),
        PeriodOutOfRange => (
            "The empirical period formula is what real buildings of this height measure. A computed period far from it usually means stiffness or mass in the wrong units, missing mass, or a structure much more flexible than intended.",
            "Check E and section units, the mass source (self-weight and loads converted to mass), and that floors are connected to the lateral system.",
        ),
        TributaryMismatch => (
            "On a regular frame, column loads from tributary areas are within a factor of about two of the FE forces. A larger gap usually means loads on the wrong members, releases that stop load reaching a column, or a column that is not connected.",
            "Check the loads around the columns named, the end releases of the beams that frame into them, and their connectivity.",
        ),
        StoreyLoadMismatch => (
            "With no braces or walls, all gravity load above a storey goes down through its columns. A different total means load is taking another path (or none).",
            "Check for members or supports that carry load past the columns, and for loads that never reach a column.",
        ),
        ModulusImplausible => (
            "No structural material has this modulus: it is almost certainly in the wrong units, and every displacement, period and indeterminate force scales with it.",
            "Enter E in MPa (steel 200 000, concrete 25 000–35 000, timber 8 000–14 000).",
        ),
        ModulusFamilyMismatch => (
            "The modulus does not match the material's grade, so stiffness — and every force in an indeterminate structure — is off.",
            "Use the grade's modulus, or pick the grade the modulus belongs to.",
        ),
        DensityImplausible => (
            "The unit weight is outside what this material weighs, which scales self-weight and seismic mass by the same factor.",
            "Enter unit weight in kN/m³ (steel 78.5, concrete 24–25, timber 4–8).",
        ),
        DensityZero => (
            "Self-weight is on, but this material weighs nothing, so its members add no self-weight and no mass.",
            "Give the material its unit weight in kN/m³, or leave it at zero only if the weight is applied as loads.",
        ),
        StrengthImplausible => (
            "No structural material has this strength: design checks read it directly and will be wrong by the same factor.",
            "Enter fy (steel) or f'c (concrete) in MPa (steel 235–460, concrete 20–50).",
        ),
        SectionImplausible => (
            "A section property this far outside real sections is almost always a unit mix-up (cm² or cm⁴ entered as m² or m⁴), which makes the member wrongly stiff or wrongly flexible.",
            "Enter A in m² and I in m⁴ (an IPE 300 has A = 0.00538 m², Iz = 8.36e-5 m⁴).",
        ),
        SectionOutlier => (
            "A member whose section is thousands of times larger or smaller than the rest of the model attracts or sheds load out of all proportion, and is often a typo.",
            "Check the section of the members named; if it is a deliberate rigid link, model it as a constraint instead.",
        ),
        GeometryScale => (
            "Members or storeys this long are not plausible in metres: geometry imported or typed in millimetres makes every member a thousand times longer and the structure a billion times more flexible.",
            "Scale the geometry to metres (×0.001 from mm, ×0.01 from cm).",
        ),
        UnsupportedPart => (
            "These members and nodes have no path to any support: under load they are a mechanism, and the solver either refuses the model or invents restraint for them.",
            "Connect the part to the structure (share nodes, not just positions) or support it.",
        ),
        SupportsSinglePoint => (
            "All supports are at one point and do not hold rotation there, so the structure can rotate about it as a rigid body.",
            "Add supports elsewhere or restrain rotation at the support.",
        ),
        SupportsColinear => (
            "All supports lie on one line and none holds rotation about it, so the structure can tip about that line: it is a mechanism, or held only by round-off.",
            "Add a support off the line, or restrain rotation about the line.",
        ),
        SpringSoft => (
            "A spring this soft compared with the members it holds acts as if the support were not there: the structure is held by almost nothing in that direction.",
            "Check the spring's units (kN/m, kN·m/rad) and value, or remove it if the direction should be free.",
        ),
        SpringStiff => (
            "A spring this stiff compared with the members it holds is a rigid restraint in disguise, and its size alone degrades the conditioning of the solve.",
            "Use a rigid restraint in that direction instead, or check the spring's units.",
        ),
        DeflectionLarge => (
            "A member whose ends move apart sideways by more than a tenth of its length under a service load case is far outside elastic behaviour: the model is near a mechanism, or stiffness or loads are in the wrong units.",
            "Check releases and supports near the members named, and the units of E, sections and loads.",
        ),
        DisplacementAbsurd => (
            "A displacement of more than a tenth of the whole structure's size cannot be a small-displacement result: the model is near a mechanism, or stiffness or loads are in the wrong units.",
            "Check supports (are they all on one line?), releases and units; then solve again.",
        ),
        NodeOnSpan => (
            "A node that lies on a member's span without being one of its ends is not connected to it: the member passes through as if the node were not there, so whatever frames into that node (a beam, a brace, a load) never reaches the member, and the member spans further than drawn.",
            "Split the member at the node (so the node becomes an end of both halves), or move the node off the member if they really are not connected.",
        ),
    }
}

/// Three significant figures, for messages.
pub(crate) fn fmt(v: f64) -> String {
    if v == 0.0 || !v.is_finite() {
        return format!("{}", v);
    }
    let a = v.abs();
    if a >= 1e6 || a < 1e-3 {
        return format!("{:.2e}", v);
    }
    let digits = (2 - a.log10().floor() as i32).max(0) as usize;
    let s = format!("{:.*}", digits, v);
    if s.contains('.') {
        s.trim_end_matches('0').trim_end_matches('.').to_string()
    } else {
        s
    }
}

/// Run every check.
pub fn review(input: &SanityInput) -> SanityReport {
    let mut r = Report::new();
    let model = geometry::ModelGeometry::new(input);
    inputs::run(input, &model, &mut r);
    results::run(input, &model, &mut r);
    r.out
}

/// JSON in → JSON out, for the WASM boundary.
pub fn review_json(json: &str) -> Result<String, String> {
    let input: SanityInput = serde_json::from_str(json).map_err(|e| format!("Parse error: {}", e))?;
    let report = review(&input);
    serde_json::to_string(&report).map_err(|e| format!("Serialize error: {}", e))
}
