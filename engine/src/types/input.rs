use super::numeric;
use serde::{de, Deserialize, Serialize};
use std::collections::HashMap;

// ==================== 2D Input Types ====================

pub type SolverNode = super::model_aliases::PlanarNode<f64>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverMaterial {
    #[serde(deserialize_with = "numeric::id::required")]
    pub id: usize,
    #[serde(deserialize_with = "numeric::e::required")]
    pub e: f64,  // MPa
    #[serde(deserialize_with = "numeric::nu::required")]
    pub nu: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverSection {
    pub id: usize,
    pub a: f64,  // m²
    pub iz: f64, // m⁴
    #[serde(default)]
    /// m², 2D shear area for the in-plane transverse shear (local y), paired with
    /// `iz`: φ = 12·E·Iz/(G·as_y·L²). Note the 3D `as_y` pairs with `iy` instead.
    pub as_y: Option<f64>,
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
    #[serde(default)]
    pub hinge_start: bool,
    #[serde(default)]
    pub hinge_end: bool,
}

pub type SolverSupport = super::model_aliases::PlanarSupport<f64, f64, f64, f64>;

pub type SolverNodalLoad = super::model_aliases::PlanarNodalLoad<f64, f64>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverDistributedLoad {
    #[serde(deserialize_with = "numeric::element_id::required")]
    pub element_id: usize,
    #[serde(rename = "qI")]
    #[serde(deserialize_with = "numeric::q_i::required")]
    pub q_i: f64,
    #[serde(rename = "qJ")]
    #[serde(deserialize_with = "numeric::q_j::required")]
    pub q_j: f64,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::a::optional", skip_serializing_if = "Option::is_none")]
    pub a: Option<f64>,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::b::optional", skip_serializing_if = "Option::is_none")]
    pub b: Option<f64>,
}

pub type SolverPointLoadOnElement = super::model_aliases::PlanarPointLoad<f64, f64, f64>;

/// A load along a plane member's axis, linear from `q_i` at `a` to `q_j` at `b` (kN/m,
/// positive toward J). The part of a load in global axes, or at an angle, that runs along an
/// inclined member: as equivalent loads at the end nodes the displacements come out right but
/// the member sees no span load, so N is constant, the average of its true end values. The
/// space solve carries it in `SolverDistributedLoad3D::q_xi`/`q_xj`; the plane load is its own
/// variant so the many transverse-only literals stay as they are.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverAxialDistributedLoad {
    #[serde(deserialize_with = "numeric::element_id::required")]
    pub element_id: usize,
    #[serde(rename = "qI")]
    #[serde(deserialize_with = "numeric::q_i::required")]
    pub q_i: f64,
    #[serde(rename = "qJ")]
    #[serde(deserialize_with = "numeric::q_j::required")]
    pub q_j: f64,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::a::optional", skip_serializing_if = "Option::is_none")]
    pub a: Option<f64>,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::b::optional", skip_serializing_if = "Option::is_none")]
    pub b: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverThermalLoad {
    #[serde(deserialize_with = "numeric::element_id::required")]
    pub element_id: usize,
    #[serde(deserialize_with = "numeric::dt_uniform::required")]
    pub dt_uniform: f64,
    #[serde(deserialize_with = "numeric::dt_gradient::required")]
    pub dt_gradient: f64,
    /// The member material's coefficient of thermal expansion, 1/°C. Omitted: the engine's
    /// default [`DEFAULT_FRAME_THERMAL_ALPHA`] (steel's 12·10⁻⁶), and the result says so
    /// (`known_issues::FR-4`). Concrete is about 10·10⁻⁶, aluminium 23·10⁻⁶.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[serde(deserialize_with = "numeric::alpha::optional")]
    pub alpha: Option<f64>,
    /// The section's real depth across which `dt_gradient` acts (along local y, the depth
    /// bent with `iz`). Omitted: the depth of the section's equivalent solid rectangle,
    /// √(12·Iz/A), which is exact only for a solid rectangle, and the result says so.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[serde(deserialize_with = "numeric::depth::optional")]
    pub depth: Option<f64>,
}

/// The coefficient of thermal expansion a frame or truss thermal load is solved with when it
/// states none (1/°C): steel's. Kept so that a load without `alpha` gives today's result.
pub const DEFAULT_FRAME_THERMAL_ALPHA: f64 = 12e-6;

/// The depth of a section's equivalent solid rectangle, √(12·I/A), the depth a thermal
/// gradient acts across when the load states none. 0.1 when the section has no area (as
/// before: such a member carries no stiffness to load anyway).
pub fn equivalent_rectangle_depth(a: f64, i: f64) -> f64 {
    if a > 1e-15 { (12.0 * i / a).sqrt() } else { 0.1 }
}

/// Rejects a stated α or depth no member can have: α must be finite, ≥ 0 and below 10⁻³ /°C
/// (every structural material is below 3·10⁻⁴; a larger value is a unit slip, such as 12 for
/// 12·10⁻⁶), and a depth finite and positive.
pub fn check_frame_thermal_inputs(element_id: usize, alpha: Option<f64>, depths: &[(&str, Option<f64>)]) -> Result<(), String> {
    if let Some(a) = alpha {
        if !(a.is_finite() && (0.0..1e-3).contains(&a)) {
            return Err(format!(
                "Thermal load on element {element_id}: alpha = {a} is not a coefficient of thermal expansion in 1/°C (expected 0 <= alpha < 1e-3, e.g. 1.2e-5 for steel)"
            ));
        }
    }
    for (name, d) in depths {
        if let Some(h) = d {
            if !(h.is_finite() && *h > 0.0) {
                return Err(format!("Thermal load on element {element_id}: {name} = {h} must be a positive, finite section depth"));
            }
        }
    }
    Ok(())
}

impl SolverThermalLoad {
    /// α the load is solved with: its own, else [`DEFAULT_FRAME_THERMAL_ALPHA`].
    pub fn alpha(&self) -> f64 {
        self.alpha.unwrap_or(DEFAULT_FRAME_THERMAL_ALPHA)
    }
    /// The depth the gradient acts across: the load's own, else √(12·Iz/A) of the section
    /// it is applied to.
    pub fn depth(&self, a: f64, iz: f64) -> f64 {
        self.depth.unwrap_or_else(|| equivalent_rectangle_depth(a, iz))
    }
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
    #[serde(rename = "axialDistributed")]
    AxialDistributed(SolverAxialDistributedLoad),
}

/// Optional linear-solver configuration.
///
/// Absent entirely → legacy behavior (direct solvers only, chosen by size).
/// Unknown strings are ignored with a warning diagnostic and the default applies.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverOptions {
    /// "auto" (default) | "direct" | "pcg"
    pub method: Option<String>,
    /// "ics" (shifted IC, default in auto) | "ic0" (strict) | "ssor" | "jacobi" | "mic" | "none"
    pub preconditioner: Option<String>,
    /// PCG relative residual tolerance (default 1e-8).
    pub tolerance: Option<f64>,
    /// PCG iteration cap (default max(1000, n_free / 4)).
    pub max_iterations: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    rename_all = "camelCase",
    from = "SolverInputWire2D<M, S, N, L, P>",
    bound(deserialize = "M: Deserialize<'de>, S: Deserialize<'de>, N: Deserialize<'de>, L: Deserialize<'de>, P: Deserialize<'de>")
)]
pub struct SolverInput<M = SolverMaterial, S = SolverSection, N = SolverNode, L = SolverLoad, P = SolverSupport> {
    pub nodes: HashMap<String, N>,
    pub materials: HashMap<String, M>,
    pub sections: HashMap<String, S>,
    pub elements: HashMap<String, SolverElement>,
    pub supports: HashMap<String, P>,
    pub loads: Vec<L>,
    #[serde(default)]
    pub constraints: Vec<Constraint>,
    #[serde(default)]
    pub connectors: HashMap<String, ConnectorElement>,
    #[serde(default)]
    pub solver_options: Option<SolverOptions>,
    /// Mass beyond the material densities: lumped masses at nodes and added
    /// mass along members. Used by every dynamic analysis (modal, spectral,
    /// time history, harmonic, reduction) and never as a static load.
    #[serde(default, skip_serializing_if = "MassInput::is_empty")]
    pub masses: MassInput,
}

#[derive(Deserialize)]
struct UnsupportedShells2D {
    #[serde(default, rename = "plates", deserialize_with = "empty_shell_collection_2d")]
    _plates: (),
    #[serde(default, rename = "quads", deserialize_with = "empty_shell_collection_2d")]
    _quads: (),
    #[serde(default, rename = "quad9s", deserialize_with = "empty_shell_collection_2d")]
    _quad9s: (),
    #[serde(default, rename = "curvedShells", deserialize_with = "empty_shell_collection_2d")]
    _curved_shells: (),
    #[serde(default, rename = "solidShells", deserialize_with = "empty_shell_collection_2d")]
    _solid_shells: (),
}

fn empty_shell_collection_2d<'de, D: de::Deserializer<'de>>(d: D) -> Result<(), D::Error> {
    d.deserialize_any(EmptyShellCollection2D)
}

struct EmptyShellCollection2D;

impl EmptyShellCollection2D {
    fn require_empty<E: de::Error>(empty: bool) -> Result<(), E> {
        if empty {
            Ok(())
        } else {
            Err(E::custom("Shell elements require 3D analysis"))
        }
    }
}

impl<'de> de::Visitor<'de> for EmptyShellCollection2D {
    type Value = ();

    fn expecting(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("an empty shell map or list")
    }

    fn visit_unit<E: de::Error>(self) -> Result<(), E> {
        Ok(())
    }

    fn visit_none<E: de::Error>(self) -> Result<(), E> {
        Ok(())
    }

    fn visit_map<A: de::MapAccess<'de>>(self, mut map: A) -> Result<(), A::Error> {
        Self::require_empty(map.next_key::<de::IgnoredAny>()?.is_none())
    }

    fn visit_seq<A: de::SeqAccess<'de>>(self, mut seq: A) -> Result<(), A::Error> {
        Self::require_empty(seq.next_element::<de::IgnoredAny>()?.is_none())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SolverInputWire2D<M, S, N, L, P> {
    nodes: HashMap<String, N>,
    materials: HashMap<String, M>,
    sections: HashMap<String, S>,
    elements: HashMap<String, SolverElement>,
    supports: HashMap<String, P>,
    loads: Vec<L>,
    #[serde(default)]
    constraints: Vec<Constraint>,
    #[serde(default)]
    connectors: HashMap<String, ConnectorElement>,
    #[serde(default)]
    solver_options: Option<SolverOptions>,
    #[serde(default)]
    masses: MassInput,
    #[serde(flatten)]
    _unsupported_shells: UnsupportedShells2D,
}

impl<M, S, N, L, P> From<SolverInputWire2D<M, S, N, L, P>> for SolverInput<M, S, N, L, P> {
    fn from(wire: SolverInputWire2D<M, S, N, L, P>) -> Self {
        let SolverInputWire2D {
            nodes, materials, sections, elements, supports, loads, constraints, connectors,
            solver_options, masses, _unsupported_shells: _,
        } = wire;
        Self {
            nodes, materials, sections, elements, supports, loads, constraints, connectors,
            solver_options, masses,
        }
    }
}

/// Mass beyond the material densities (2D). Units: t (= kN·s²/m) for mass,
/// t/m for mass per length, t·m² for rotary inertia.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MassInput {
    #[serde(default)]
    pub nodal: Vec<NodalMass>,
    #[serde(default)]
    pub line: Vec<LineMass>,
}

impl MassInput {
    pub fn is_empty(&self) -> bool { self.nodal.is_empty() && self.line.is_empty() }
}

/// A lumped mass at a 2D node: translational mass (t) in X and Z, and rotary
/// inertia (t·m²) about the out-of-plane axis.
///
/// `mass` applies to both translations; `massX`/`massZ` replace it in their
/// direction when given (a mass that moves with the floor horizontally but
/// not vertically, say).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodalMass {
    pub node_id: usize,
    pub mass: f64,
    pub mass_x: Option<f64>,
    pub mass_z: Option<f64>,
    #[serde(rename = "iy")]
    pub rotary_inertia: f64,
}

impl NodalMass {
    pub fn mx(&self) -> f64 { self.mass_x.unwrap_or(self.mass) }
    pub fn mz(&self) -> f64 { self.mass_z.unwrap_or(self.mass) }
}

/// Mass added along a member, t/m, distributed as the member's own mass is
/// (its consistent mass matrix, as if its density were raised by
/// `massPerLength / A`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LineMass {
    pub element_id: usize,
    pub mass_per_length: f64,
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
    /// m², shear area paired with `iy` (bending about local y, so shear along
    /// local z): φy = 12·E·Iy/(G·as_y·L²). Not the area for a force along y.
    pub as_y: Option<f64>,
    #[serde(default)]
    /// m², shear area paired with `iz` (bending about local z, shear along local y).
    pub as_z: Option<f64>,
    /// Shear-centre coordinate along local y, measured from the centroid (m).
    /// Only the geometric stiffness reads it (flexural-torsional buckling of
    /// monosymmetric and asymmetric sections, e.g. channels, tees, angles).
    /// `None` = 0 (doubly symmetric, or point-symmetric like a Z or cruciform).
    #[serde(default)]
    pub shear_center_y: Option<f64>,
    /// Shear-centre coordinate along local z, measured from the centroid (m).
    #[serde(default)]
    pub shear_center_z: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SolverElement3D {
    pub id: usize,
    #[serde(rename = "type")]
    pub elem_type: String,
    pub node_i: usize,
    pub node_j: usize,
    pub material_id: usize,
    pub section_id: usize,
    /// Release rotation about local y axis at start (Iy bending block).
    #[serde(default)]
    pub release_my_start: bool,
    /// Release rotation about local y axis at end (Iy bending block).
    #[serde(default)]
    pub release_my_end: bool,
    /// Release rotation about local z axis at start (Iz bending block).
    #[serde(default)]
    pub release_mz_start: bool,
    /// Release rotation about local z axis at end (Iz bending block).
    #[serde(default)]
    pub release_mz_end: bool,
    /// Release torsion about local x axis at start.
    #[serde(default)]
    pub release_t_start: bool,
    /// Release torsion about local x axis at end.
    #[serde(default)]
    pub release_t_end: bool,
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
    #[serde(deserialize_with = "numeric::node_id::required")]
    pub node_id: usize,
    pub rx: bool,
    pub ry: bool,
    pub rz: bool,
    pub rrx: bool,
    pub rry: bool,
    pub rrz: bool,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::kx::optional", skip_serializing_if = "Option::is_none")]
    pub kx: Option<f64>,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::ky::optional", skip_serializing_if = "Option::is_none")]
    pub ky: Option<f64>,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::kz::optional", skip_serializing_if = "Option::is_none")]
    pub kz: Option<f64>,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::krx::optional", skip_serializing_if = "Option::is_none")]
    pub krx: Option<f64>,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::kry::optional", skip_serializing_if = "Option::is_none")]
    pub kry: Option<f64>,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::krz::optional", skip_serializing_if = "Option::is_none")]
    pub krz: Option<f64>,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::dx::optional", skip_serializing_if = "Option::is_none")]
    pub dx: Option<f64>,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::dy::optional", skip_serializing_if = "Option::is_none")]
    pub dy: Option<f64>,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::dz::optional", skip_serializing_if = "Option::is_none")]
    pub dz: Option<f64>,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::drx::optional", skip_serializing_if = "Option::is_none")]
    pub drx: Option<f64>,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::dry::optional", skip_serializing_if = "Option::is_none")]
    pub dry: Option<f64>,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::drz::optional", skip_serializing_if = "Option::is_none")]
    pub drz: Option<f64>,
    #[serde(default)]
    pub rw: Option<bool>,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::kw::optional", skip_serializing_if = "Option::is_none")]
    pub kw: Option<f64>,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::normal_x::optional", skip_serializing_if = "Option::is_none")]
    pub normal_x: Option<f64>,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::normal_y::optional", skip_serializing_if = "Option::is_none")]
    pub normal_y: Option<f64>,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::normal_z::optional", skip_serializing_if = "Option::is_none")]
    pub normal_z: Option<f64>,
    #[serde(default)]
    pub is_inclined: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverNodalLoad3D {
    #[serde(deserialize_with = "numeric::node_id::required")]
    pub node_id: usize,
    #[serde(deserialize_with = "numeric::fx::required")]
    pub fx: f64,
    #[serde(deserialize_with = "numeric::fy::required")]
    pub fy: f64,
    #[serde(deserialize_with = "numeric::fz::required")]
    pub fz: f64,
    #[serde(deserialize_with = "numeric::mx::required")]
    pub mx: f64,
    #[serde(deserialize_with = "numeric::my::required")]
    pub my: f64,
    #[serde(deserialize_with = "numeric::mz::required")]
    pub mz: f64,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::bw::optional", skip_serializing_if = "Option::is_none")]
    pub bw: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverDistributedLoad3D {
    #[serde(default, rename = "qXI")]
    #[serde(deserialize_with = "numeric::q_xi::required")]
    pub q_xi: f64,
    #[serde(default, rename = "qXJ")]
    #[serde(deserialize_with = "numeric::q_xj::required")]
    pub q_xj: f64,
    #[serde(deserialize_with = "numeric::element_id::required")]
    pub element_id: usize,
    #[serde(rename = "qYI")]
    #[serde(deserialize_with = "numeric::q_yi::required")]
    pub q_yi: f64,
    #[serde(rename = "qYJ")]
    #[serde(deserialize_with = "numeric::q_yj::required")]
    pub q_yj: f64,
    #[serde(rename = "qZI")]
    #[serde(deserialize_with = "numeric::q_zi::required")]
    pub q_zi: f64,
    #[serde(rename = "qZJ")]
    #[serde(deserialize_with = "numeric::q_zj::required")]
    pub q_zj: f64,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::a::optional", skip_serializing_if = "Option::is_none")]
    pub a: Option<f64>,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::b::optional", skip_serializing_if = "Option::is_none")]
    pub b: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverPointLoad3D<L = f64, F = f64> {
    pub element_id: usize,
    pub a: L,
    pub px: F,
    pub py: F,
    pub pz: F,
}

impl<'de, L, F> Deserialize<'de> for SolverPointLoad3D<L, F>
where
    L: Deserialize<'de> + numeric::Numeric,
    F: Deserialize<'de> + numeric::Numeric + Default,
{
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(
            rename_all = "camelCase",
            bound(deserialize = "L: Deserialize<'de> + numeric::Numeric, F: Deserialize<'de> + numeric::Numeric + Default")
        )]
        struct Fields<L, F> {
            #[serde(deserialize_with = "numeric::element_id::required")]
            element_id: usize,
            #[serde(deserialize_with = "numeric::a::required")]
            a: L,
            #[serde(default, deserialize_with = "numeric::px::required")]
            px: F,
            #[serde(deserialize_with = "numeric::py::required")]
            py: F,
            #[serde(deserialize_with = "numeric::pz::required")]
            pz: F,
            #[serde(default, rename = "mx", deserialize_with = "numeric::point_moment::mx")]
            _mx: (),
            #[serde(default, rename = "my", deserialize_with = "numeric::point_moment::my")]
            _my: (),
            #[serde(default, rename = "mz", deserialize_with = "numeric::point_moment::mz")]
            _mz: (),
        }

        let Fields { element_id, a, px, py, pz, .. } = Fields::deserialize(deserializer)?;
        Ok(Self { element_id, a, px, py, pz })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverThermalLoad3D {
    #[serde(deserialize_with = "numeric::element_id::required")]
    pub element_id: usize,
    #[serde(deserialize_with = "numeric::dt_uniform::required")]
    pub dt_uniform: f64,
    /// T(−y face) − T(+y face), °C: the opposite sign of `dt_gradient_z`.
    #[serde(deserialize_with = "numeric::dt_gradient_y::required")]
    pub dt_gradient_y: f64,
    /// T(+z face) − T(−z face), °C: the opposite sign of `dt_gradient_y`.
    #[serde(deserialize_with = "numeric::dt_gradient_z::required")]
    pub dt_gradient_z: f64,
    /// The member material's coefficient of thermal expansion, 1/°C. Omitted:
    /// [`DEFAULT_FRAME_THERMAL_ALPHA`], and the result says so (`known_issues::FR-4`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[serde(deserialize_with = "numeric::alpha::optional")]
    pub alpha: Option<f64>,
    /// The section's real depth along local y, across which `dt_gradient_y` acts (bent with
    /// `iz`). Omitted: √(12·Iz/A), and the result says so.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[serde(deserialize_with = "numeric::depth_y::optional")]
    pub depth_y: Option<f64>,
    /// The section's real depth along local z, across which `dt_gradient_z` acts (bent with
    /// `iy`). Omitted: √(12·Iy/A), and the result says so.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[serde(deserialize_with = "numeric::depth_z::optional")]
    pub depth_z: Option<f64>,
}

impl SolverThermalLoad3D {
    /// α the load is solved with: its own, else [`DEFAULT_FRAME_THERMAL_ALPHA`].
    pub fn alpha(&self) -> f64 {
        self.alpha.unwrap_or(DEFAULT_FRAME_THERMAL_ALPHA)
    }
    /// The depth along local y the y gradient acts across: the load's own, else √(12·Iz/A).
    pub fn depth_y(&self, a: f64, iz: f64) -> f64 {
        self.depth_y.unwrap_or_else(|| equivalent_rectangle_depth(a, iz))
    }
    /// The depth along local z the z gradient acts across: the load's own, else √(12·Iy/A).
    pub fn depth_z(&self, a: f64, iy: f64) -> f64 {
        self.depth_z.unwrap_or_else(|| equivalent_rectangle_depth(a, iy))
    }
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
    #[serde(deserialize_with = "numeric::element_id::required")]
    pub element_id: usize,
    /// Mass density (kg/m³)
    #[serde(deserialize_with = "numeric::nonnegative_density")]
    pub density: f64,
    /// Gravity acceleration components (m/s²), global coordinates
    #[serde(default)]
    #[serde(deserialize_with = "numeric::gx::required")]
    pub gx: f64,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::gy::required")]
    pub gy: f64,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::gz::required")]
    pub gz: f64,
}

/// Edge load on a quad element.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverQuadEdgeLoad {
    #[serde(deserialize_with = "numeric::element_id::required")]
    pub element_id: usize,
    /// Edge index 0-3 (0=nodes 0→1, 1=1→2, 2=2→3, 3=3→0)
    #[serde(deserialize_with = "numeric::edge::required")]
    pub edge: usize,
    /// Normal pressure on edge (force/length), positive = outward
    #[serde(default)]
    #[serde(deserialize_with = "numeric::qn::required")]
    pub qn: f64,
    /// Tangential traction along edge (force/length)
    #[serde(default)]
    #[serde(deserialize_with = "numeric::qt::required")]
    pub qt: f64,
}

/// Concentrated bimoment load applied to a node (warping torsion).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverBimomentLoad {
    #[serde(deserialize_with = "numeric::node_id::required")]
    pub node_id: usize,
    #[serde(deserialize_with = "numeric::bimoment::required")]
    pub bimoment: f64,
}

/// Plate thermal load: uniform temperature change and/or through-thickness gradient.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverPlateThermalLoad {
    #[serde(deserialize_with = "numeric::element_id::required")]
    pub element_id: usize,
    #[serde(deserialize_with = "numeric::dt_uniform::required")]
    pub dt_uniform: f64,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::dt_gradient::required")]
    pub dt_gradient: f64,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::alpha::optional", skip_serializing_if = "Option::is_none")]
    pub alpha: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", bound(deserialize = "M: super::units::TypedWire + Deserialize<'de>, S: super::units::TypedWire + Deserialize<'de>, N: super::units::TypedWire + Deserialize<'de>, L: super::units::TypedWire + Deserialize<'de>, P: super::units::TypedWire + Deserialize<'de>, E: super::units::TypedWire + Deserialize<'de>"))]
pub struct SolverInput3D<M = SolverMaterial, S = SolverSection3D, N = SolverNode3D, L = SolverLoad3D, P = SolverSupport3D, E = SolverElement3D> {
    pub nodes: HashMap<String, N>,
    pub materials: HashMap<String, M>,
    pub sections: HashMap<String, S>,
    pub elements: HashMap<String, E>,
    pub supports: HashMap<String, P>,
    pub loads: Vec<L>,
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
    #[serde(default)]
    pub solver_options: Option<SolverOptions>,
    /// Mass beyond the material densities: lumped masses at nodes, added mass
    /// along members and over shells. Used by every dynamic analysis and never
    /// as a static load.
    #[serde(default, skip_serializing_if = "MassInput3D::is_empty")]
    pub masses: MassInput3D,
}

impl SolverInput3D {
    pub(crate) fn nodes_by_id(&self) -> HashMap<usize, &SolverNode3D> {
        crate::ordered::values(&self.nodes).map(|node| (node.id, node)).collect()
    }
}

pub(crate) fn node_positions_3d<const N: usize>(
    nodes: &HashMap<usize, &SolverNode3D>,
    ids: &[usize; N],
) -> Option<[[f64; 3]; N]> {
    let mut positions = [[0.0; 3]; N];
    for (position, id) in positions.iter_mut().zip(ids) {
        let node = nodes.get(id)?;
        *position = [node.x, node.y, node.z];
    }
    Some(positions)
}

/// Mass beyond the material densities (3D). Units: t (= kN·s²/m) for mass,
/// t/m for mass per length, t/m² for mass per area, t·m² for rotary inertia.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MassInput3D {
    #[serde(default)]
    pub nodal: Vec<NodalMass3D>,
    #[serde(default)]
    pub line: Vec<LineMass>,
    #[serde(default)]
    pub area: Vec<AreaMass>,
}

impl MassInput3D {
    pub fn is_empty(&self) -> bool { self.nodal.is_empty() && self.line.is_empty() && self.area.is_empty() }
}

/// A lumped mass at a 3D node: translational mass (t) and rotary inertia
/// (t·m²) about the global axes.
///
/// `mass` applies to all three translations; `massX`/`massY`/`massZ` replace
/// it in their direction when given (a storey mass that is horizontal only:
/// `mass` 0 with `massX` and `massY`, or `mass` with `massZ: 0`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NodalMass3D {
    pub node_id: usize,
    #[serde(default)]
    pub mass: f64,
    #[serde(default)]
    pub mass_x: Option<f64>,
    #[serde(default)]
    pub mass_y: Option<f64>,
    #[serde(default)]
    pub mass_z: Option<f64>,
    /// Rotary inertia about global X, Y, Z, t·m². A floor's mass moment of
    /// inertia about the vertical axis goes in `izz` of its master node.
    #[serde(default)]
    pub ixx: f64,
    #[serde(default)]
    pub iyy: f64,
    #[serde(default)]
    pub izz: f64,
}

impl NodalMass3D {
    pub fn translational(&self) -> [f64; 3] {
        [self.mass_x.unwrap_or(self.mass), self.mass_y.unwrap_or(self.mass), self.mass_z.unwrap_or(self.mass)]
    }
}

/// Mass added over a shell (plate, quad, quad9 or curved shell), t/m²,
/// distributed as the shell's own mass is (its consistent mass matrix, as if
/// its density were raised by `massPerArea / thickness`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AreaMass {
    pub element_id: usize,
    /// Which family the id names: "quad" (default), "plate", "quad9" or "curvedShell".
    #[serde(default = "default_area_mass_kind")]
    pub kind: String,
    pub mass_per_area: f64,
}

fn default_area_mass_kind() -> String { "quad".into() }

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
    #[serde(deserialize_with = "numeric::element_id::required")]
    pub element_id: usize,
    /// Mass density (kg/m³)
    #[serde(deserialize_with = "numeric::nonnegative_density")]
    pub density: f64,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::gx::required")]
    pub gx: f64,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::gy::required")]
    pub gy: f64,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::gz::required")]
    pub gz: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverPressureLoad {
    #[serde(deserialize_with = "numeric::element_id::required")]
    pub element_id: usize,
    #[serde(deserialize_with = "numeric::pressure::required")]
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectralModeDisp {
    pub node_id: usize,
    pub ux: f64,
    pub uz: f64,
    pub ry: f64,
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
    #[serde(deserialize_with = "crate::types::units::deserialize_input_3d")]
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
    #[serde(deserialize_with = "crate::types::units::deserialize_input_3d")]
    pub solver: SolverInput3D,
    pub densities: HashMap<String, f64>,
}

/// Cable analysis input: the model, the material densities (material id → kg/m³) that give the
/// cables their weight, and an optional pretension per cable (element id → kN, #527).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CableInput<S> {
    pub solver: S,
    #[serde(default)]
    pub densities: HashMap<String, f64>,
    #[serde(default)]
    pub pretension: HashMap<String, f64>,
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
    #[serde(deserialize_with = "numeric::fy::optional", skip_serializing_if = "Option::is_none")]
    pub fy: Option<f64>, // Yield stress (MPa)
}

/// 3D plastic (pushover) analysis input.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticInput3D {
    #[serde(deserialize_with = "crate::types::units::deserialize_input_3d")]
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
    #[serde(deserialize_with = "numeric::offset::required")]
    pub offset: f64,
    #[serde(deserialize_with = "numeric::weight::required")]
    pub weight: f64,
}

/// 3D moving loads analysis input.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MovingLoadInput3D {
    #[serde(deserialize_with = "crate::types::units::deserialize_input_3d")]
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
    #[serde(deserialize_with = "numeric::fy::required")]
    pub fy: f64,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::alpha::optional", skip_serializing_if = "Option::is_none")]
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
    #[serde(deserialize_with = "crate::types::units::deserialize_input_3d")]
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
    #[serde(deserialize_with = "numeric::ratio::required")]
    pub ratio: f64,
    /// Direction: 0=X, 1=Y, 2=Z
    #[serde(default)]
    #[serde(deserialize_with = "numeric::direction::required")]
    pub direction: usize,
    /// Gravity axis: 0=X, 1=Z (2D), 0=X, 1=Y, 2=Z (3D). Absent: the vertical axis of the
    /// model, Z (1 in 2D, 2 in 3D). It defaulted to 1 for both, which is Y in a Z-up 3D
    /// model: a default 3D definition found no gravity and added nothing (NL-9).
    #[serde(default)]
    #[serde(deserialize_with = "numeric::gravity_axis::optional", skip_serializing_if = "Option::is_none")]
    pub gravity_axis: Option<usize>,
}

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
    /// Initial displacements from previous analysis (node_id → [ux, uz, ry])
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
    #[serde(deserialize_with = "crate::types::units::deserialize_input_3d")]
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
    #[serde(deserialize_with = "numeric::element_id::required")]
    pub element_id: usize,
    #[serde(deserialize_with = "numeric::force::required")]
    pub force: f64,
    #[serde(deserialize_with = "numeric::eccentricity_i::required")]
    pub eccentricity_i: f64,
    #[serde(deserialize_with = "numeric::eccentricity_j::required")]
    pub eccentricity_j: f64,
    #[serde(default)]
    pub profile: TendonProfile,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::mu::optional", skip_serializing_if = "Option::is_none")]
    pub mu: Option<f64>,
    #[serde(default)]
    #[serde(deserialize_with = "numeric::kappa::optional", skip_serializing_if = "Option::is_none")]
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
#[serde(rename_all = "camelCase", from = "StagedInputWire2D")]
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StagedInputWire2D {
    #[serde(flatten)]
    solver: SolverInput,
    stages: Vec<ConstructionStage>,
}

impl From<StagedInputWire2D> for StagedInput {
    fn from(wire: StagedInputWire2D) -> Self {
        let SolverInput { nodes, materials, sections, elements, supports, loads, constraints, .. } = wire.solver;
        Self { nodes, materials, sections, elements, supports, loads, constraints, stages: wire.stages }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
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
    /// Model-wide left-handed member axes, as on `SolverInput3D`. Without the
    /// field serde dropped the app's `leftHand` and a left-handed model was
    /// staged with right-handed member axes.
    #[serde(default)]
    pub left_hand: Option<bool>,
    /*
     * Shells. These had no field here at all, and the caller sends them:
     * `input3DToWireObject` emits `plates` and `quads` for every 3D payload,
     * so serde — with no `deny_unknown_fields` on this struct — dropped them
     * without a word. A building staged with floor slabs and shear walls was
     * analysed as the bare frame, and nothing said so.
     *
     * Defaulted so a payload that carries no shells still deserialises, and so
     * older stored inputs keep working.
     */
    #[serde(default)]
    pub plates: HashMap<String, SolverPlateElement>,
    #[serde(default)]
    pub quads: HashMap<String, SolverQuadElement>,
    #[serde(default)]
    pub quad9s: HashMap<String, SolverQuad9Element>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
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
    /*
     * Shells enter and leave a stage the way members do, and by their OWN ids:
     * a plate and an element can carry the same number, so one combined list
     * would activate the wrong thing.
     *
     * A stage that names none adds none — the same rule `elements_added`
     * follows. A model whose slabs stand from the first stage says so by
     * listing them there, which is what the panel already does for members.
     */
    #[serde(default)]
    pub plates_added: Vec<usize>,
    #[serde(default)]
    pub plates_removed: Vec<usize>,
    #[serde(default)]
    pub quads_added: Vec<usize>,
    #[serde(default)]
    pub quads_removed: Vec<usize>,
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
    /// Diaphragm: in-plane rigid body — slaves follow the master's in-plane
    /// translations and rotation, and their own in-plane rotation equals the master's.
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
    /// DOFs to constrain on slave: 0=ux, 1=uz, 2=θ (2D); 0..5 (3D).
    ///
    /// Empty means different links in the two dimensions (docs/solver/assembly-constraints.md,
    /// AC-3): in 3D (ux, uy, uz), all translations with the slave's rotation free (a pinned
    /// arm); in 2D (ux, uz, θ), the rotation tied too (a fixed arm). List the DOFs to say which
    /// link is meant: 2D [0, 1] is the 3D default, 3D [0..6] the 2D one. The web app lists them
    /// when it sends a stored link to the 2D solver (`constraint-2d-remap.ts`).
    #[serde(default)]
    pub dofs: Vec<usize>,
}

/// Diaphragm: nodes share in-plane rigid-body motion around a master.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiaphragmConstraint {
    pub master_node: usize,
    pub slave_nodes: Vec<usize>,
    /// Plane: "XY" (default), "XZ", or "YZ".
    ///
    /// In 3D (Z up) the plane is the diaphragm's own: "XY" is a horizontal floor, rigid in X–Y
    /// and free to bend vertically. A 2D model is the X–Z plane; there only "XY" (the default)
    /// is accepted, and it means the in-plane rigid body of the model plane (u_x, u_z tied to θ;
    /// other names are refused) (docs/solver/assembly-constraints.md, AC-5). So a 3D floor diaphragm is NOT
    /// the 2D "XY" one: its trace on a plane frame is an equal u_x (an `equalDOF` on DOF 0),
    /// which is what the web app sends to the 2D solver (`constraint-2d-remap.ts`).
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
    /// For 2D: [ux, uz, ry]. For 3D: [ux, uy, uz, rx, ry, rz].
    /// Released DOFs are NOT constrained (slave is free in that DOF).
    #[serde(default)]
    pub releases: Vec<bool>,
}
