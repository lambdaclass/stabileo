//! Quantities in the engine's m–kN–s system. MPa is a separate wire unit.
//! No implicit conversions, Deref, or mixed-dimension addition are provided.
//!
//! ```compile_fail
//! use dedaliano_engine::types::units::{Length, Force};
//! let length: Length = Force::from_kn(1.0);
//! ```
//! ```compile_fail
//! use dedaliano_engine::types::units::{Modulus, ModulusMPa};
//! let e: Modulus = ModulusMPa::from_mpa(200_000.0);
//! ```
//! ```compile_fail
//! use dedaliano_engine::types::units::{Area, SecondMoment};
//! let area = Area::from_m2(0.01);
//! let invalid = area + SecondMoment::from_m4(0.0001);
//! ```
//! The actual direct-WASM input also rejects the wrong units:
//! ```compile_fail
//! use dedaliano_engine::types::units::{ElasticInput2D, Modulus};
//! fn wrong(input: &mut ElasticInput2D) {
//!     input.materials.get_mut("1").unwrap().e = Modulus::from_kn_per_m2(200e6);
//! }
//! ```
//! ```compile_fail
//! use dedaliano_engine::types::units::{ElasticInput2D, Length};
//! fn wrong(input: &mut ElasticInput2D) {
//!     input.sections.get_mut("1").unwrap().a = Length::from_m(0.01);
//! }
//! ```
//! The 3D WASM boundary records accept each quantity in its own unit:
//! ```
//! use dedaliano_engine::types::units::*;
//! fn right(input: &mut ElasticInput3D) {
//!     let s = input.sections.get_mut("1").unwrap();
//!     s.iy = SecondMoment::from_m4(1e-4);
//!     s.j = SecondMoment::from_m4(1e-5);
//!     s.cw = Some(WarpingConstant::from_m6(1e-9));
//!     s.as_z = Some(Area::from_m2(0.004));
//!     s.shear_center_y = Some(Length::from_m(-0.02));
//!     input.materials.get_mut("1").unwrap().e = ModulusMPa::from_mpa(200_000.0);
//! }
//! ```
//! and reject the wrong ones:
//! ```compile_fail
//! use dedaliano_engine::types::units::{ElasticInput3D, Area};
//! fn wrong(input: &mut ElasticInput3D) {
//!     input.sections.get_mut("1").unwrap().iy = Area::from_m2(0.01);
//! }
//! ```
//! ```compile_fail
//! use dedaliano_engine::types::units::{ElasticInput3D, SecondMoment};
//! fn wrong(input: &mut ElasticInput3D) {
//!     input.sections.get_mut("1").unwrap().cw = Some(SecondMoment::from_m4(1e-6));
//! }
//! ```
//! ```compile_fail
//! use dedaliano_engine::types::units::{ElasticInput3D, Area};
//! fn wrong(input: &mut ElasticInput3D) {
//!     input.sections.get_mut("1").unwrap().shear_center_y = Some(Area::from_m2(0.01));
//! }
//! ```
//! ```compile_fail
//! use dedaliano_engine::types::units::{ElasticInput3D, Modulus};
//! fn wrong(input: &mut ElasticInput3D) {
//!     input.materials.get_mut("1").unwrap().e = Modulus::from_kn_per_m2(200e6);
//! }
//! ```
//! ```compile_fail
//! use dedaliano_engine::types::units::ElasticInput3D;
//! fn wrong(input: &mut ElasticInput3D) {
//!     input.sections.get_mut("1").unwrap().j = 1e-5;
//! }
//! ```
//! Node coordinates and nodal/point loads, 2D and 3D, are typed at the same boundaries:
//! ```
//! use dedaliano_engine::types::units::*;
//! fn right(input2: &mut ElasticInput2D, input3: &mut ElasticInput3D) {
//!     input2.nodes.get_mut("1").unwrap().z = Length::from_m(3.0);
//!     if let TypedLoad::Nodal(l) = &mut input2.loads[0] {
//!         l.fx = Force::from_kn(10.0);
//!         l.my = Moment::from_kn_m(2.0);
//!     }
//!     if let TypedLoad::PointOnElement(l) = &mut input2.loads[1] {
//!         l.a = Length::from_m(1.5);
//!         l.p = Force::from_kn(-4.0);
//!         l.px = Some(Force::from_kn(1.0));
//!         l.my = Some(Moment::from_kn_m(0.5));
//!     }
//!     input3.nodes.get_mut("1").unwrap().y = Length::from_m(-2.0);
//!     if let TypedLoad3D::Nodal(l) = &mut input3.loads[0] {
//!         l.fy = Force::from_kn(1.0);
//!         l.mz = Moment::from_kn_m(1.0);
//!         l.bw = Some(Bimoment::from_kn_m2(0.1));
//!     }
//!     if let TypedLoad3D::PointOnElement(l) = &mut input3.loads[1] {
//!         l.a = Length::from_m(0.5);
//!         l.pz = Force::from_kn(2.0);
//!     }
//! }
//! let legacy: dedaliano_engine::types::SolverInput3D = serde_json::from_value(serde_json::json!({
//!     "nodes": {"1": {"id": 1, "x": 0, "y": 0, "z": 0}}, "materials": {}, "sections": {},
//!     "elements": {}, "supports": {}, "loads": []
//! })).unwrap();
//! assert_eq!(legacy.nodes["1"].x, 0.0);
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{Force, Moment};
//! let moment: Moment = Force::from_kn(1.0);
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{Force, Moment};
//! let force: Force = Moment::from_kn_m(1.0);
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{ElasticInput2D, Moment, TypedLoad};
//! fn wrong(input: &mut ElasticInput2D) {
//!     if let TypedLoad::Nodal(l) = &mut input.loads[0] {
//!         l.fx = Moment::from_kn_m(1.0);
//!     }
//! }
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{ElasticInput3D, Moment, TypedLoad3D};
//! fn wrong(input: &mut ElasticInput3D) {
//!     if let TypedLoad3D::Nodal(l) = &mut input.loads[0] {
//!         l.fz = Moment::from_kn_m(1.0);
//!     }
//! }
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{ElasticInput3D, Force, TypedLoad3D};
//! fn wrong(input: &mut ElasticInput3D) {
//!     if let TypedLoad3D::Nodal(l) = &mut input.loads[0] {
//!         l.mx = Force::from_kn(1.0);
//!     }
//! }
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{ElasticInput2D, Length, TypedLoad};
//! fn wrong(input: &mut ElasticInput2D) {
//!     if let TypedLoad::PointOnElement(l) = &mut input.loads[0] {
//!         l.p = Length::from_m(1.0);
//!     }
//! }
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{ElasticInput3D, Force, TypedLoad3D};
//! fn wrong(input: &mut ElasticInput3D) {
//!     if let TypedLoad3D::PointOnElement(l) = &mut input.loads[0] {
//!         l.a = Force::from_kn(1.0);
//!     }
//! }
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{ElasticInput2D, Force};
//! fn wrong(input: &mut ElasticInput2D) {
//!     input.nodes.get_mut("1").unwrap().x = Force::from_kn(1.0);
//! }
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::ElasticInput3D;
//! fn wrong(input: &mut ElasticInput3D) {
//!     input.nodes.get_mut("1").unwrap().z = 3.0;
//! }
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{ElasticInput3D, Moment, TypedLoad3D};
//! fn wrong(input: &mut ElasticInput3D) {
//!     if let TypedLoad3D::Nodal(l) = &mut input.loads[0] {
//!         l.bw = Some(Moment::from_kn_m(1.0));
//!     }
//! }
//! ```
//! A 3D model with legacy records in place of the typed ones has no deserializer:
//! ```compile_fail,E0277
//! use dedaliano_engine::types::units::{ElasticMaterial, ElasticSection3D, TypedLoad3D};
//! use dedaliano_engine::types::{SolverInput3D, SolverNode3D};
//! let _ = serde_json::from_str::<SolverInput3D<ElasticMaterial, ElasticSection3D, SolverNode3D, TypedLoad3D>>("{}");
//! ```
use serde::{Deserialize, Serialize};
use std::ops::{Add, Div, Mul, Neg, Sub};

macro_rules! quantity {
    ($name:ident, $new:ident, $get:ident) => {
        #[derive(Debug, Clone, Copy, PartialEq, PartialOrd, Serialize, Deserialize)]
        #[repr(transparent)]
        #[serde(transparent)]
        pub struct $name(f64);
        impl $name {
            #[inline]
            pub const fn $new(value: f64) -> Self {
                Self(value)
            }
            #[inline]
            pub const fn $get(self) -> f64 {
                self.0
            }
        }
        impl Add for $name {
            type Output = Self;
            #[inline]
            fn add(self, rhs: Self) -> Self {
                Self(self.0 + rhs.0)
            }
        }
        impl Sub for $name {
            type Output = Self;
            #[inline]
            fn sub(self, rhs: Self) -> Self {
                Self(self.0 - rhs.0)
            }
        }
        impl Neg for $name {
            type Output = Self;
            #[inline]
            fn neg(self) -> Self {
                Self(-self.0)
            }
        }
        impl Mul<f64> for $name {
            type Output = Self;
            #[inline]
            fn mul(self, rhs: f64) -> Self {
                Self(self.0 * rhs)
            }
        }
        impl Mul<$name> for f64 {
            type Output = $name;
            #[inline]
            fn mul(self, rhs: $name) -> $name {
                $name(self * rhs.0)
            }
        }
        impl Div<f64> for $name {
            type Output = Self;
            #[inline]
            fn div(self, rhs: f64) -> Self {
                Self(self.0 / rhs)
            }
        }
        impl Div for $name {
            type Output = f64;
            #[inline]
            fn div(self, rhs: Self) -> f64 {
                self.0 / rhs.0
            }
        }
    };
}
quantity!(Length, from_m, in_m);
quantity!(Area, from_m2, in_m2);
quantity!(Volume, from_m3, in_m3);
quantity!(SecondMoment, from_m4, in_m4);
quantity!(WarpingConstant, from_m6, in_m6);
quantity!(Force, from_kn, in_kn);
quantity!(Moment, from_kn_m, in_kn_m);
quantity!(Modulus, from_kn_per_m2, in_kn_per_m2);
quantity!(ModulusMPa, from_mpa, in_mpa);
quantity!(Ratio, from_ratio, in_ratio);
quantity!(TranslationalStiffness, from_kn_per_m, in_kn_per_m);
quantity!(FlexuralRigidity, from_kn_m2, in_kn_m2);
quantity!(MassDensity, from_kg_per_m3, in_kg_per_m3);
quantity!(WeightDensity, from_kn_per_m3, in_kn_per_m3);
quantity!(Time, from_s, in_s);
quantity!(Bimoment, from_kn_m2, in_kn_m2);

impl ModulusMPa {
    #[inline]
    pub fn to_internal(self) -> Modulus {
        Modulus::from_kn_per_m2(self.0 * 1000.0)
    }
}
macro_rules! product {
    ($lhs:ident, $rhs:ident => $out:ident) => {
        impl Mul<$rhs> for $lhs {
            type Output = $out;
            #[inline]
            fn mul(self, rhs: $rhs) -> $out {
                $out(self.0 * rhs.0)
            }
        }
    };
}
macro_rules! quotient {
    ($lhs:ident, $rhs:ident => $out:ident) => {
        impl Div<$rhs> for $lhs {
            type Output = $out;
            #[inline]
            fn div(self, rhs: $rhs) -> $out {
                $out(self.0 / rhs.0)
            }
        }
    };
}
product!(Length, Length => Area);
product!(Area, Length => Volume);
product!(Modulus, Area => Force);
product!(Modulus, SecondMoment => FlexuralRigidity);
product!(Force, Length => Moment);
product!(Moment, Length => FlexuralRigidity);
product!(TranslationalStiffness, Length => Force);
quotient!(Force, Length => TranslationalStiffness);
quotient!(FlexuralRigidity, Volume => TranslationalStiffness);
quotient!(FlexuralRigidity, Area => Force);
quotient!(FlexuralRigidity, Length => Moment);

/// Typed wire records. Values serialize as the existing bare JSON numbers. They carry the legacy
/// records' names, so serde reports malformed input with the same text; renaming one changes it.
mod wire {
    use super::*;
    #[derive(Debug, Clone, Copy, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SolverMaterial {
        pub id: usize,
        pub e: ModulusMPa,
        pub nu: Ratio,
    }

    #[derive(Debug, Clone, Copy, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SolverSection {
        pub id: usize,
        pub a: Area,
        pub iz: SecondMoment,
        #[serde(default)]
        pub as_y: Option<Area>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SolverSection3D {
        pub id: usize,
        #[serde(default)]
        pub name: Option<String>,
        pub a: Area,
        pub iy: SecondMoment,
        pub iz: SecondMoment,
        pub j: SecondMoment,
        #[serde(default)]
        pub cw: Option<WarpingConstant>,
        #[serde(default)]
        pub as_y: Option<Area>,
        #[serde(default)]
        pub as_z: Option<Area>,
        #[serde(default)]
        pub shear_center_y: Option<Length>,
        #[serde(default)]
        pub shear_center_z: Option<Length>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SolverNode {
        pub id: usize,
        pub x: Length,
        #[serde(rename = "z", alias = "y")]
        pub z: Length,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SolverNode3D {
        pub id: usize,
        pub x: Length,
        pub y: Length,
        pub z: Length,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SolverNodalLoad {
        pub node_id: usize,
        pub fx: Force,
        #[serde(rename = "fz", alias = "fy")]
        pub fz: Force,
        #[serde(rename = "my", alias = "mz")]
        pub my: Moment,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SolverPointLoadOnElement {
        pub element_id: usize,
        pub a: Length,
        pub p: Force,
        #[serde(default)]
        pub px: Option<Force>,
        #[serde(default, rename = "my", alias = "mz")]
        pub my: Option<Moment>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SolverNodalLoad3D {
        pub node_id: usize,
        pub fx: Force,
        pub fy: Force,
        pub fz: Force,
        pub mx: Moment,
        pub my: Moment,
        pub mz: Moment,
        #[serde(default)]
        pub bw: Option<Bimoment>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SolverPointLoad3D {
        pub element_id: usize,
        pub a: Length,
        pub py: Force,
        pub pz: Force,
    }

    /// Mirrors `SolverLoad`: same tags, same variant order.
    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(tag = "type", content = "data")]
    pub enum SolverLoad {
        #[serde(rename = "nodal")]
        Nodal(SolverNodalLoad),
        #[serde(rename = "distributed")]
        Distributed(crate::types::SolverDistributedLoad),
        #[serde(rename = "pointOnElement")]
        PointOnElement(SolverPointLoadOnElement),
        #[serde(rename = "thermal")]
        Thermal(crate::types::SolverThermalLoad),
        #[serde(rename = "axialDistributed")]
        AxialDistributed(crate::types::SolverAxialDistributedLoad),
    }

    /// Mirrors `SolverLoad3D`: same tags, same variant order.
    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(tag = "type", content = "data")]
    pub enum SolverLoad3D {
        #[serde(rename = "nodal")]
        Nodal(SolverNodalLoad3D),
        #[serde(rename = "distributed")]
        Distributed(crate::types::SolverDistributedLoad3D),
        #[serde(rename = "pointOnElement")]
        PointOnElement(SolverPointLoad3D),
        #[serde(rename = "thermal")]
        Thermal(crate::types::SolverThermalLoad3D),
        #[serde(rename = "pressure")]
        Pressure(crate::types::SolverPressureLoad),
        #[serde(rename = "plateThermal")]
        PlateThermal(crate::types::SolverPlateThermalLoad),
        #[serde(rename = "bimoment")]
        Bimoment(crate::types::SolverBimomentLoad),
        #[serde(rename = "quadPressure")]
        QuadPressure(crate::types::SolverPressureLoad),
        #[serde(rename = "quadThermal")]
        QuadThermal(crate::types::SolverPlateThermalLoad),
        #[serde(rename = "quadEdge")]
        QuadEdge(crate::types::SolverQuadEdgeLoad),
        #[serde(rename = "quadSelfWeight")]
        QuadSelfWeight(crate::types::SolverQuadSelfWeightLoad),
        #[serde(rename = "quad9Pressure")]
        Quad9Pressure(crate::types::SolverPressureLoad),
        #[serde(rename = "quad9Thermal")]
        Quad9Thermal(crate::types::SolverPlateThermalLoad),
        #[serde(rename = "quad9Edge")]
        Quad9Edge(crate::types::SolverQuadEdgeLoad),
        #[serde(rename = "quad9SelfWeight")]
        Quad9SelfWeight(crate::types::SolverQuadSelfWeightLoad),
        #[serde(rename = "solidShellPressure")]
        SolidShellPressure(crate::types::SolverPressureLoad),
        #[serde(rename = "solidShellSelfWeight")]
        SolidShellSelfWeight(crate::types::SolverSolidShellSelfWeightLoad),
        #[serde(rename = "curvedShellPressure")]
        CurvedShellPressure(crate::types::SolverPressureLoad),
        #[serde(rename = "curvedShellThermal")]
        CurvedShellThermal(crate::types::SolverPlateThermalLoad),
        #[serde(rename = "curvedShellEdge")]
        CurvedShellEdge(crate::types::SolverQuadEdgeLoad),
        #[serde(rename = "curvedShellSelfWeight")]
        CurvedShellSelfWeight(crate::types::SolverQuadSelfWeightLoad),
    }
}
pub use wire::{
    SolverLoad as TypedLoad, SolverLoad3D as TypedLoad3D, SolverMaterial as ElasticMaterial, SolverNodalLoad as TypedNodalLoad,
    SolverNodalLoad3D as TypedNodalLoad3D, SolverNode as TypedNode, SolverNode3D as TypedNode3D,
    SolverPointLoad3D as TypedPointLoad3D, SolverPointLoadOnElement as TypedPointLoad, SolverSection as ElasticSection2D,
    SolverSection3D as ElasticSection3D,
};
impl ElasticSection2D {
    /// Preserve the legacy operation order, including the two successive L products.
    pub fn shear_parameter(self, e: Modulus, nu: Ratio, l: Length) -> f64 {
        self.as_y
            .map(|a| {
                let g = e / (2.0 * (1.0 + nu.in_ratio()));
                (12.0 * e * self.iz) / (g * a * l * l)
            })
            .unwrap_or(0.0)
    }
}

// Explicit compatibility boundary for the other analyses, whose public Rust DTOs
// still use f64. The 2D elastic kernels consume the typed records above.
impl From<&super::SolverMaterial> for ElasticMaterial {
    fn from(m: &super::SolverMaterial) -> Self {
        Self {
            id: m.id,
            e: ModulusMPa::from_mpa(m.e),
            nu: Ratio::from_ratio(m.nu),
        }
    }
}
impl From<&super::SolverSection> for ElasticSection2D {
    fn from(s: &super::SolverSection) -> Self {
        Self {
            id: s.id,
            a: Area::from_m2(s.a),
            iz: SecondMoment::from_m4(s.iz),
            as_y: s.as_y.map(Area::from_m2),
        }
    }
}
impl From<ElasticMaterial> for super::SolverMaterial {
    fn from(m: ElasticMaterial) -> Self {
        Self {
            id: m.id,
            e: m.e.in_mpa(),
            nu: m.nu.in_ratio(),
        }
    }
}
impl From<super::SolverMaterial> for ElasticMaterial {
    fn from(m: super::SolverMaterial) -> Self {
        Self::from(&m)
    }
}
impl From<ElasticSection2D> for super::SolverSection {
    fn from(s: ElasticSection2D) -> Self {
        Self {
            id: s.id,
            a: s.a.in_m2(),
            iz: s.iz.in_m4(),
            as_y: s.as_y.map(Area::in_m2),
        }
    }
}
impl From<super::SolverSection> for ElasticSection2D {
    fn from(s: super::SolverSection) -> Self {
        Self::from(&s)
    }
}

impl From<ElasticSection3D> for super::SolverSection3D {
    fn from(s: ElasticSection3D) -> Self {
        Self {
            id: s.id,
            name: s.name,
            a: s.a.in_m2(),
            iy: s.iy.in_m4(),
            iz: s.iz.in_m4(),
            j: s.j.in_m4(),
            cw: s.cw.map(WarpingConstant::in_m6),
            as_y: s.as_y.map(Area::in_m2),
            as_z: s.as_z.map(Area::in_m2),
            shear_center_y: s.shear_center_y.map(Length::in_m),
            shear_center_z: s.shear_center_z.map(Length::in_m),
        }
    }
}

impl From<TypedNode> for super::SolverNode {
    fn from(n: TypedNode) -> Self {
        Self { id: n.id, x: n.x.in_m(), z: n.z.in_m() }
    }
}

impl From<TypedNode3D> for super::SolverNode3D {
    fn from(n: TypedNode3D) -> Self {
        Self { id: n.id, x: n.x.in_m(), y: n.y.in_m(), z: n.z.in_m() }
    }
}

impl From<TypedNodalLoad> for super::SolverNodalLoad {
    fn from(l: TypedNodalLoad) -> Self {
        Self { node_id: l.node_id, fx: l.fx.in_kn(), fz: l.fz.in_kn(), my: l.my.in_kn_m() }
    }
}

impl From<TypedPointLoad> for super::SolverPointLoadOnElement {
    fn from(l: TypedPointLoad) -> Self {
        Self {
            element_id: l.element_id,
            a: l.a.in_m(),
            p: l.p.in_kn(),
            px: l.px.map(Force::in_kn),
            my: l.my.map(Moment::in_kn_m),
        }
    }
}

impl From<TypedNodalLoad3D> for super::SolverNodalLoad3D {
    fn from(l: TypedNodalLoad3D) -> Self {
        Self {
            node_id: l.node_id,
            fx: l.fx.in_kn(),
            fy: l.fy.in_kn(),
            fz: l.fz.in_kn(),
            mx: l.mx.in_kn_m(),
            my: l.my.in_kn_m(),
            mz: l.mz.in_kn_m(),
            bw: l.bw.map(Bimoment::in_kn_m2),
        }
    }
}

impl From<TypedPointLoad3D> for super::SolverPointLoad3D {
    fn from(l: TypedPointLoad3D) -> Self {
        Self { element_id: l.element_id, a: l.a.in_m(), py: l.py.in_kn(), pz: l.pz.in_kn() }
    }
}

impl From<TypedLoad> for super::SolverLoad {
    fn from(l: TypedLoad) -> Self {
        use super::SolverLoad as S;
        match l {
            TypedLoad::Nodal(v) => S::Nodal(v.into()),
            TypedLoad::Distributed(v) => S::Distributed(v),
            TypedLoad::PointOnElement(v) => S::PointOnElement(v.into()),
            TypedLoad::Thermal(v) => S::Thermal(v),
            TypedLoad::AxialDistributed(v) => S::AxialDistributed(v),
        }
    }
}

impl From<TypedLoad3D> for super::SolverLoad3D {
    fn from(l: TypedLoad3D) -> Self {
        use super::SolverLoad3D as S;
        match l {
            TypedLoad3D::Nodal(v) => S::Nodal(v.into()),
            TypedLoad3D::Distributed(v) => S::Distributed(v),
            TypedLoad3D::PointOnElement(v) => S::PointOnElement(v.into()),
            TypedLoad3D::Thermal(v) => S::Thermal(v),
            TypedLoad3D::Pressure(v) => S::Pressure(v),
            TypedLoad3D::PlateThermal(v) => S::PlateThermal(v),
            TypedLoad3D::Bimoment(v) => S::Bimoment(v),
            TypedLoad3D::QuadPressure(v) => S::QuadPressure(v),
            TypedLoad3D::QuadThermal(v) => S::QuadThermal(v),
            TypedLoad3D::QuadEdge(v) => S::QuadEdge(v),
            TypedLoad3D::QuadSelfWeight(v) => S::QuadSelfWeight(v),
            TypedLoad3D::Quad9Pressure(v) => S::Quad9Pressure(v),
            TypedLoad3D::Quad9Thermal(v) => S::Quad9Thermal(v),
            TypedLoad3D::Quad9Edge(v) => S::Quad9Edge(v),
            TypedLoad3D::Quad9SelfWeight(v) => S::Quad9SelfWeight(v),
            TypedLoad3D::SolidShellPressure(v) => S::SolidShellPressure(v),
            TypedLoad3D::SolidShellSelfWeight(v) => S::SolidShellSelfWeight(v),
            TypedLoad3D::CurvedShellPressure(v) => S::CurvedShellPressure(v),
            TypedLoad3D::CurvedShellThermal(v) => S::CurvedShellThermal(v),
            TypedLoad3D::CurvedShellEdge(v) => S::CurvedShellEdge(v),
            TypedLoad3D::CurvedShellSelfWeight(v) => S::CurvedShellSelfWeight(v),
        }
    }
}

/// The records `SolverInput3D` deserializes directly. The legacy `SolverInput3D` parses as
/// `ElasticInput3D` and erases with `into_legacy`, so no parse of a 3D model skips the typed records.
pub trait TypedWire {}
impl TypedWire for ElasticMaterial {}
impl TypedWire for ElasticSection3D {}
impl TypedWire for TypedNode3D {}
impl TypedWire for TypedLoad3D {}
impl<'de> Deserialize<'de> for super::SolverInput3D {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        ElasticInput3D::deserialize(d).map(ElasticInput3D::into_legacy)
    }
}

/// What every 3D WASM export deserializes. `into_legacy` is the only place its units are erased.
pub type ElasticInput3D = super::SolverInput3D<ElasticMaterial, ElasticSection3D, TypedNode3D, TypedLoad3D>;
impl ElasticInput3D {
    pub fn into_legacy(self) -> super::SolverInput3D {
        super::SolverInput3D {
            nodes: self.nodes.into_iter().map(|(k, v)| (k, v.into())).collect(),
            materials: self.materials.into_iter().map(|(k, v)| (k, v.into())).collect(),
            sections: self.sections.into_iter().map(|(k, v)| (k, v.into())).collect(),
            elements: self.elements,
            supports: self.supports,
            loads: self.loads.into_iter().map(Into::into).collect(),
            constraints: self.constraints,
            left_hand: self.left_hand,
            plates: self.plates,
            quads: self.quads,
            quad9s: self.quad9s,
            solid_shells: self.solid_shells,
            curved_shells: self.curved_shells,
            curved_beams: self.curved_beams,
            connectors: self.connectors,
            solver_options: self.solver_options,
            masses: self.masses,
        }
    }
}
pub fn deserialize_input_3d<'de, D: serde::Deserializer<'de>>(d: D) -> Result<super::SolverInput3D, D::Error> {
    ElasticInput3D::deserialize(d).map(ElasticInput3D::into_legacy)
}

/// The direct linear WASM boundary retains these types through frame assembly/recovery.
pub type ElasticInput2D = super::SolverInput<ElasticMaterial, ElasticSection2D, TypedNode, TypedLoad>;

#[derive(Clone)]
pub(crate) struct ElasticProperties2D {
    pub materials: std::collections::HashMap<usize, ElasticMaterial>,
    pub sections: std::collections::HashMap<usize, ElasticSection2D>,
}
impl ElasticProperties2D {
    pub fn from_legacy(input: &super::SolverInput) -> Self {
        Self {
            materials: crate::ordered::values(&input.materials)
                .map(|m| (m.id, m.into()))
                .collect(),
            sections: crate::ordered::values(&input.sections)
                .map(|s| (s.id, s.into()))
                .collect(),
        }
    }
    pub fn from_typed(input: &ElasticInput2D) -> Self {
        Self {
            materials: crate::ordered::values(&input.materials)
                .map(|m| (m.id, *m))
                .collect(),
            sections: crate::ordered::values(&input.sections)
                .map(|s| (s.id, *s))
                .collect(),
        }
    }
}
impl ElasticInput2D {
    /// The only place the 2D direct input's units are erased.
    pub fn into_legacy(self) -> super::SolverInput {
        super::SolverInput {
            nodes: self.nodes.into_iter().map(|(k, v)| (k, v.into())).collect(),
            materials: self.materials.into_iter().map(|(k, v)| (k, v.into())).collect(),
            sections: self.sections.into_iter().map(|(k, v)| (k, v.into())).collect(),
            elements: self.elements,
            supports: self.supports,
            loads: self.loads.into_iter().map(Into::into).collect(),
            constraints: self.constraints,
            connectors: self.connectors,
            solver_options: self.solver_options,
            masses: self.masses,
        }
    }
    /// Temporary view for validation and still-unmigrated loads/constraints. The frame
    /// stiffness/recovery path keeps its original typed properties separately.
    pub(crate) fn legacy_view(&self) -> super::SolverInput {
        self.clone().into_legacy()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn units_typed_input_reaches_linear_solver_without_number_changes() {
        let json = include_str!("../../tests/fixtures/ex-multi-section-frame-input.json");
        let typed: ElasticInput2D = serde_json::from_str(json).unwrap();
        let legacy: crate::types::SolverInput = serde_json::from_str(json).unwrap();
        // Includes every input property/default, so the typed boundary cannot drop a field.
        assert_eq!(
            serde_json::to_value(&typed).unwrap(),
            serde_json::to_value(&legacy).unwrap()
        );
        let actual = crate::solver::linear::solve_2d_typed(&typed).unwrap();
        let expected = crate::solver::linear::solve_2d(&legacy).unwrap();
        assert_eq!(
            serde_json::to_value(&actual.displacements).unwrap(),
            serde_json::to_value(&expected.displacements).unwrap()
        );
        assert_eq!(
            serde_json::to_value(&actual.reactions).unwrap(),
            serde_json::to_value(&expected.reactions).unwrap()
        );
        assert_eq!(
            serde_json::to_value(&actual.element_forces).unwrap(),
            serde_json::to_value(&expected.element_forces).unwrap()
        );
    }

    #[test]
    fn units_typed_dense_and_sparse_shear_frames_match_legacy() {
        for n in [2, 30] {
            let mut nodes = serde_json::Map::new();
            let mut elements = serde_json::Map::new();
            for i in 1..=n {
                nodes.insert(i.to_string(), serde_json::json!({"id":i,"x":i-1,"z":0}));
                if i > 1 {
                    elements.insert((i-1).to_string(), serde_json::json!({"id":i-1,"type":"frame","nodeI":i-1,"nodeJ":i,"materialId":1,"sectionId":1}));
                }
            }
            let json = serde_json::json!({
                "nodes":nodes, "elements":elements,
                "materials":{"1":{"id":1,"e":27123.456789,"nu":0.271}},
                "sections":{"1":{"id":1,"a":0.0137,"iz":0.000173,"asY":0.006127}},
                "supports":{"1":{"id":1,"nodeId":1,"type":"fixed"}},
                "loads":[{"type":"nodal","data":{"nodeId":n,"fx":0,"fz":-10,"my":0}}]
            });
            let typed: ElasticInput2D = serde_json::from_value(json.clone()).unwrap();
            let legacy: crate::types::SolverInput = serde_json::from_value(json).unwrap();
            let actual = crate::solver::linear::solve_2d_typed(&typed).unwrap();
            let expected = crate::solver::linear::solve_2d(&legacy).unwrap();
            assert_eq!(
                serde_json::to_value(actual.displacements).unwrap(),
                serde_json::to_value(expected.displacements).unwrap()
            );
            assert_eq!(
                serde_json::to_value(actual.reactions).unwrap(),
                serde_json::to_value(expected.reactions).unwrap()
            );
            assert_eq!(
                serde_json::to_value(actual.element_forces).unwrap(),
                serde_json::to_value(expected.element_forces).unwrap()
            );
        }
    }

    #[test]
    fn units_wire_roundtrip_and_layout() {
        assert_eq!(
            std::mem::size_of::<ModulusMPa>(),
            std::mem::size_of::<f64>()
        );
        assert_eq!(std::mem::size_of::<Area>(), std::mem::size_of::<f64>());
        let material = serde_json::json!({"id": 1, "e": 200000.0, "nu": 0.3});
        let typed: ElasticMaterial = serde_json::from_value(material.clone()).unwrap();
        assert_eq!(typed.e.to_internal().in_kn_per_m2(), 200000000.0);
        assert_eq!(serde_json::to_value(typed).unwrap(), material);
        let legacy: crate::types::SolverMaterial =
            serde_json::from_value(material.clone()).unwrap();
        assert_eq!(serde_json::to_value(legacy).unwrap(), material);
        for shear in [None, Some(0.006)] {
            let value = serde_json::json!({"id": 2, "a": 0.01, "iz": 0.0001, "asY": shear});
            let typed: ElasticSection2D = serde_json::from_value(value.clone()).unwrap();
            assert_eq!(serde_json::to_value(typed).unwrap(), value);
            let legacy: crate::types::SolverSection =
                serde_json::from_value(value.clone()).unwrap();
            assert_eq!(serde_json::to_value(legacy).unwrap(), value);
        }
        let omitted: ElasticSection2D =
            serde_json::from_str(r#"{"id":2,"a":0.01,"iz":0.0001}"#).unwrap();
        assert_eq!(omitted.as_y, None);
    }

    #[test]
    fn units_frame_golden_is_bit_identical() {
        // Captured from the pre-migration kernel at HEAD; never regenerated by this test.
        // Two property sets × all four releases; the second exercises shear and rounding.
        let golden: Vec<Vec<f64>> = serde_json::from_str(include_str!(
            "../../tests/fixtures/units-frame-stiffness.json"
        ))
        .unwrap();
        let mut case = 0;
        for (e, a, iz, l, phi) in [
            (200e6, 0.01, 1e-4, 3.0, 0.0),
            (27123456.789, 0.0137, 0.0001234567, 3.14159, 0.47231),
        ] {
            for hs in [false, true] {
                for he in [false, true] {
                    let got = crate::element::frame_local_stiffness_2d_typed(
                        Modulus::from_kn_per_m2(e),
                        Area::from_m2(a),
                        SecondMoment::from_m4(iz),
                        Length::from_m(l),
                        hs,
                        he,
                        phi,
                    );
                    for (index, (got, expected)) in got.iter().zip(&golden[case]).enumerate() {
                        assert_eq!(
                            got.to_bits(),
                            expected.to_bits(),
                            "case {case}, matrix entry {index}"
                        );
                    }
                    assert_eq!(got.len(), golden[case].len());
                    case += 1;
                }
            }
        }
        assert_eq!(case, golden.len());
    }

    #[test]
    fn units_shear_matches_the_fixed_end_force_phi() {
        for as_y in [None, Some(0.006127), Some(1e-9), Some(3.7)] {
            for (e, nu, l) in [(27123456.789, 0.271, 3.14159), (2.1e8, 0.3, 0.05), (1.0e4, 0.499, 47.3)] {
                let legacy = crate::types::SolverSection { id: 1, a: 0.01, iz: 0.000173, as_y };
                let typed = ElasticSection2D::from(&legacy);
                assert_eq!(
                    typed.shear_parameter(Modulus::from_kn_per_m2(e), Ratio::from_ratio(nu), Length::from_m(l)).to_bits(),
                    crate::element::timoshenko_phi_2d(&legacy, e, nu, l).to_bits(),
                    "as_y {as_y:?}, e {e}, nu {nu}, l {l}"
                );
            }
        }
    }
}
