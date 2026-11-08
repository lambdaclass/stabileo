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
//! Distributed, thermal and support inputs, 2D and 3D, are typed at the same boundaries:
//! ```
//! use dedaliano_engine::types::units::*;
//! fn right(input2: &mut ElasticInput2D, input3: &mut ElasticInput3D) {
//!     let s = input2.supports.get_mut("1").unwrap();
//!     s.kx = Some(TranslationalStiffness::from_kn_per_m(1e4));
//!     s.kz = Some(RotationalStiffness::from_kn_m_per_rad(50.0));
//!     s.dz = Some(Length::from_m(-0.01));
//!     s.dry = Some(Angle::from_rad(0.001));
//!     s.angle = Some(Angle::from_rad(0.5));
//!     if let TypedLoad::Distributed(l) = &mut input2.loads[0] {
//!         l.q_i = LineLoad::from_kn_per_m(-5.0);
//!         l.a = Some(Length::from_m(1.0));
//!     }
//!     if let TypedLoad::AxialDistributed(l) = &mut input2.loads[1] {
//!         l.q_j = LineLoad::from_kn_per_m(2.0);
//!     }
//!     if let TypedLoad::Thermal(l) = &mut input2.loads[2] {
//!         l.dt_uniform = TemperatureDifference::from_delta_c(20.0);
//!         l.dt_gradient = TemperatureDifference::from_delta_c(-5.0);
//!         l.alpha = Some(ThermalExpansion::from_per_c(1.2e-5));
//!         l.depth = Some(Length::from_m(0.4));
//!     }
//!     let s = input3.supports.get_mut("1").unwrap();
//!     s.ky = Some(TranslationalStiffness::from_kn_per_m(2e4));
//!     s.krx = Some(RotationalStiffness::from_kn_m_per_rad(10.0));
//!     s.dy = Some(Length::from_m(0.002));
//!     s.drz = Some(Angle::from_rad(-0.001));
//!     input3.elements.get_mut("1").unwrap().roll_angle = Some(AngleDeg::from_deg(90.0));
//!     if let TypedLoad3D::Distributed(l) = &mut input3.loads[0] {
//!         l.q_zj = LineLoad::from_kn_per_m(-1.5);
//!         l.b = Some(Length::from_m(2.0));
//!     }
//!     if let TypedLoad3D::Thermal(l) = &mut input3.loads[1] {
//!         l.dt_gradient_y = TemperatureDifference::from_delta_c(4.0);
//!         l.depth_z = Some(Length::from_m(0.3));
//!     }
//!     if let TypedLoad3D::QuadPressure(l) = &mut input3.loads[2] {
//!         l.pressure = AreaLoad::from_kn_per_m2(2.0);
//!     }
//!     if let TypedLoad3D::PlateThermal(l) = &mut input3.loads[3] {
//!         l.dt_gradient = TemperatureDifference::from_delta_c(5.0);
//!     }
//!     if let TypedLoad3D::QuadEdge(l) = &mut input3.loads[4] {
//!         l.qn = LineLoad::from_kn_per_m(3.0);
//!     }
//! }
//! let strain: Ratio = ThermalExpansion::from_per_c(1.2e-5) * TemperatureDifference::from_delta_c(10.0);
//! let resultant: Force = LineLoad::from_kn_per_m(2.0) * Length::from_m(3.0);
//! let line: LineLoad = AreaLoad::from_kn_per_m2(4.0) * Length::from_m(0.5);
//! let reaction: Moment = RotationalStiffness::from_kn_m_per_rad(10.0) * Angle::from_rad(0.1);
//! let warmer = TemperatureDifference::from_delta_c(5.0) + TemperatureDifference::from_delta_c(2.5);
//! assert_eq!((strain.in_ratio(), resultant.in_kn(), line.in_kn_per_m()), (1.2e-5 * 10.0, 6.0, 2.0));
//! assert_eq!((reaction.in_kn_m(), warmer.in_delta_c()), (10.0 * 0.1, 7.5));
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{Force, LineLoad};
//! let force: Force = LineLoad::from_kn_per_m(1.0);
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{AreaLoad, ElasticInput2D, TypedLoad};
//! fn wrong(input: &mut ElasticInput2D) {
//!     if let TypedLoad::Distributed(l) = &mut input.loads[0] {
//!         l.q_i = AreaLoad::from_kn_per_m2(1.0);
//!     }
//! }
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{ElasticInput3D, LineLoad, TypedLoad3D};
//! fn wrong(input: &mut ElasticInput3D) {
//!     if let TypedLoad3D::QuadPressure(l) = &mut input.loads[0] {
//!         l.pressure = LineLoad::from_kn_per_m(1.0);
//!     }
//! }
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{ElasticInput3D, Force, TypedLoad3D};
//! fn wrong(input: &mut ElasticInput3D) {
//!     if let TypedLoad3D::Distributed(l) = &mut input.loads[0] {
//!         l.q_yi = Force::from_kn(1.0);
//!     }
//! }
//! ```
//! A temperature difference has no absolute temperature to add to:
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::TemperatureDifference;
//! let ambient_c: f64 = 20.0;
//! let _ = TemperatureDifference::from_delta_c(5.0) + ambient_c;
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{ElasticInput2D, TemperatureDifference, TypedLoad};
//! fn wrong(input: &mut ElasticInput2D) {
//!     if let TypedLoad::Thermal(l) = &mut input.loads[0] {
//!         l.alpha = Some(TemperatureDifference::from_delta_c(12.0));
//!     }
//! }
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{ElasticInput3D, Length, TypedLoad3D};
//! fn wrong(input: &mut ElasticInput3D) {
//!     if let TypedLoad3D::Thermal(l) = &mut input.loads[0] {
//!         l.dt_gradient_y = Length::from_m(0.3);
//!     }
//! }
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{ElasticInput3D, TypedLoad3D};
//! fn wrong(input: &mut ElasticInput3D) {
//!     if let TypedLoad3D::PlateThermal(l) = &mut input.loads[0] {
//!         l.dt_uniform = 10.0;
//!     }
//! }
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{ElasticInput2D, LineLoad};
//! fn wrong(input: &mut ElasticInput2D) {
//!     input.supports.get_mut("1").unwrap().kz = Some(LineLoad::from_kn_per_m(1e3));
//! }
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{ElasticInput3D, TranslationalStiffness};
//! fn wrong(input: &mut ElasticInput3D) {
//!     input.supports.get_mut("1").unwrap().krx = Some(TranslationalStiffness::from_kn_per_m(1e3));
//! }
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{ElasticInput3D, RotationalStiffness};
//! fn wrong(input: &mut ElasticInput3D) {
//!     input.supports.get_mut("1").unwrap().kx = Some(RotationalStiffness::from_kn_m_per_rad(1e3));
//! }
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{ElasticInput2D, Length};
//! fn wrong(input: &mut ElasticInput2D) {
//!     input.supports.get_mut("1").unwrap().dry = Some(Length::from_m(0.01));
//! }
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{Angle, ElasticInput3D};
//! fn wrong(input: &mut ElasticInput3D) {
//!     input.supports.get_mut("1").unwrap().dz = Some(Angle::from_rad(0.01));
//! }
//! ```
//! A member's roll angle is in degrees on the wire and a support's angle in radians:
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{Angle, ElasticInput3D};
//! fn wrong(input: &mut ElasticInput3D) {
//!     input.elements.get_mut("1").unwrap().roll_angle = Some(Angle::from_rad(1.5707963267948966));
//! }
//! ```
//! ```compile_fail,E0308
//! use dedaliano_engine::types::units::{AngleDeg, ElasticInput2D};
//! fn wrong(input: &mut ElasticInput2D) {
//!     input.supports.get_mut("1").unwrap().angle = Some(AngleDeg::from_deg(30.0));
//! }
//! ```
//! A 3D model with legacy support or element records has no deserializer:
//! ```compile_fail,E0277
//! use dedaliano_engine::types::units::*;
//! use dedaliano_engine::types::{SolverInput3D, SolverSupport3D};
//! let _ = serde_json::from_str::<SolverInput3D<ElasticMaterial, ElasticSection3D, TypedNode3D, TypedLoad3D, SolverSupport3D, TypedElement3D>>("{}");
//! ```
//! ```compile_fail,E0277
//! use dedaliano_engine::types::units::*;
//! use dedaliano_engine::types::{SolverElement3D, SolverInput3D};
//! let _ = serde_json::from_str::<SolverInput3D<ElasticMaterial, ElasticSection3D, TypedNode3D, TypedLoad3D, TypedSupport3D, SolverElement3D>>("{}");
//! ```
use serde::{Deserialize, Serialize};
use std::ops::{Add, Div, Mul, Neg, Sub};

macro_rules! quantity {
    ($name:ident, $new:ident, $get:ident) => {
        #[derive(Debug, Clone, Copy, Default, PartialEq, PartialOrd, Serialize, Deserialize)]
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
quantity!(LineLoad, from_kn_per_m, in_kn_per_m);
quantity!(AreaLoad, from_kn_per_m2, in_kn_per_m2);
quantity!(TemperatureDifference, from_delta_c, in_delta_c);
quantity!(ThermalExpansion, from_per_c, in_per_c);
quantity!(RotationalStiffness, from_kn_m_per_rad, in_kn_m_per_rad);
quantity!(Angle, from_rad, in_rad);
quantity!(AngleDeg, from_deg, in_deg);

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
product!(RotationalStiffness, Angle => Moment);
product!(LineLoad, Length => Force);
product!(AreaLoad, Length => LineLoad);
product!(ThermalExpansion, TemperatureDifference => Ratio);
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

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SolverDistributedLoad {
        pub element_id: usize,
        #[serde(rename = "qI")]
        pub q_i: LineLoad,
        #[serde(rename = "qJ")]
        pub q_j: LineLoad,
        #[serde(default)]
        pub a: Option<Length>,
        #[serde(default)]
        pub b: Option<Length>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SolverAxialDistributedLoad {
        pub element_id: usize,
        #[serde(rename = "qI")]
        pub q_i: LineLoad,
        #[serde(rename = "qJ")]
        pub q_j: LineLoad,
        #[serde(default)]
        pub a: Option<Length>,
        #[serde(default)]
        pub b: Option<Length>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SolverThermalLoad {
        pub element_id: usize,
        pub dt_uniform: TemperatureDifference,
        pub dt_gradient: TemperatureDifference,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub alpha: Option<ThermalExpansion>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub depth: Option<Length>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SolverDistributedLoad3D {
        #[serde(default, rename = "qXI")]
        pub q_xi: LineLoad,
        #[serde(default, rename = "qXJ")]
        pub q_xj: LineLoad,
        pub element_id: usize,
        #[serde(rename = "qYI")]
        pub q_yi: LineLoad,
        #[serde(rename = "qYJ")]
        pub q_yj: LineLoad,
        #[serde(rename = "qZI")]
        pub q_zi: LineLoad,
        #[serde(rename = "qZJ")]
        pub q_zj: LineLoad,
        #[serde(default)]
        pub a: Option<Length>,
        #[serde(default)]
        pub b: Option<Length>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SolverThermalLoad3D {
        pub element_id: usize,
        pub dt_uniform: TemperatureDifference,
        pub dt_gradient_y: TemperatureDifference,
        pub dt_gradient_z: TemperatureDifference,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub alpha: Option<ThermalExpansion>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub depth_y: Option<Length>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub depth_z: Option<Length>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SolverPressureLoad {
        pub element_id: usize,
        pub pressure: AreaLoad,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SolverPlateThermalLoad {
        pub element_id: usize,
        pub dt_uniform: TemperatureDifference,
        #[serde(default)]
        pub dt_gradient: TemperatureDifference,
        #[serde(default)]
        pub alpha: Option<ThermalExpansion>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SolverQuadEdgeLoad {
        pub element_id: usize,
        pub edge: usize,
        #[serde(default)]
        pub qn: LineLoad,
        #[serde(default)]
        pub qt: LineLoad,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SolverSupport {
        pub id: usize,
        pub node_id: usize,
        #[serde(rename = "type")]
        pub support_type: String,
        #[serde(default)]
        pub kx: Option<TranslationalStiffness>,
        #[serde(default)]
        pub ky: Option<TranslationalStiffness>,
        #[serde(default)]
        pub kz: Option<RotationalStiffness>,
        #[serde(default)]
        pub dx: Option<Length>,
        #[serde(default, rename = "dz", alias = "dy")]
        pub dz: Option<Length>,
        #[serde(default, rename = "dry", alias = "drz")]
        pub dry: Option<Angle>,
        #[serde(default)]
        pub angle: Option<Angle>,
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
        pub kx: Option<TranslationalStiffness>,
        #[serde(default)]
        pub ky: Option<TranslationalStiffness>,
        #[serde(default)]
        pub kz: Option<TranslationalStiffness>,
        #[serde(default)]
        pub krx: Option<RotationalStiffness>,
        #[serde(default)]
        pub kry: Option<RotationalStiffness>,
        #[serde(default)]
        pub krz: Option<RotationalStiffness>,
        #[serde(default)]
        pub dx: Option<Length>,
        #[serde(default)]
        pub dy: Option<Length>,
        #[serde(default)]
        pub dz: Option<Length>,
        #[serde(default)]
        pub drx: Option<Angle>,
        #[serde(default)]
        pub dry: Option<Angle>,
        #[serde(default)]
        pub drz: Option<Angle>,
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
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    pub struct SolverElement3D {
        pub id: usize,
        #[serde(rename = "type")]
        pub elem_type: String,
        pub node_i: usize,
        pub node_j: usize,
        pub material_id: usize,
        pub section_id: usize,
        #[serde(default)]
        pub release_my_start: bool,
        #[serde(default)]
        pub release_my_end: bool,
        #[serde(default)]
        pub release_mz_start: bool,
        #[serde(default)]
        pub release_mz_end: bool,
        #[serde(default)]
        pub release_t_start: bool,
        #[serde(default)]
        pub release_t_end: bool,
        #[serde(default)]
        pub local_yx: Option<f64>,
        #[serde(default)]
        pub local_yy: Option<f64>,
        #[serde(default)]
        pub local_yz: Option<f64>,
        #[serde(default)]
        pub roll_angle: Option<AngleDeg>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct Displacement {
        pub node_id: usize,
        pub ux: Length,
        #[serde(rename = "uz", alias = "uy")]
        pub uz: Length,
        #[serde(rename = "ry", alias = "rz")]
        pub ry: Angle,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct Reaction {
        pub node_id: usize,
        pub rx: Force,
        #[serde(rename = "rz", alias = "ry")]
        pub rz: Force,
        #[serde(rename = "my", alias = "mz")]
        pub my: Moment,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct PointLoadInfo {
        pub a: Length,
        pub p: Force,
        #[serde(skip_serializing_if = "Option::is_none")]
        pub px: Option<Force>,
        #[serde(skip_serializing_if = "Option::is_none", rename = "my", alias = "mz")]
        pub my: Option<Moment>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct DistributedLoadInfo {
        #[serde(rename = "qI")]
        pub q_i: LineLoad,
        #[serde(rename = "qJ")]
        pub q_j: LineLoad,
        pub a: Length,
        pub b: Length,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct ElementForces {
        pub element_id: usize,
        pub n_start: Force,
        pub n_end: Force,
        pub v_start: Force,
        pub v_end: Force,
        pub m_start: Moment,
        pub m_end: Moment,
        pub length: Length,
        #[serde(rename = "qI")]
        pub q_i: LineLoad,
        #[serde(rename = "qJ")]
        pub q_j: LineLoad,
        pub point_loads: Vec<PointLoadInfo>,
        pub distributed_loads: Vec<DistributedLoadInfo>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub distributed_loads_x: Vec<DistributedLoadInfo>,
        #[serde(default)]
        pub hinge_start: bool,
        #[serde(default)]
        pub hinge_end: bool,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct Displacement3D {
        pub node_id: usize,
        pub ux: Length,
        pub uy: Length,
        pub uz: Length,
        pub rx: Angle,
        pub ry: Angle,
        pub rz: Angle,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub warping: Option<f64>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct Reaction3D {
        pub node_id: usize,
        pub fx: Force,
        pub fy: Force,
        pub fz: Force,
        pub mx: Moment,
        pub my: Moment,
        pub mz: Moment,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub bimoment: Option<Bimoment>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct PointLoadInfo3D {
        pub a: Length,
        pub p: Force,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct ElementForces3D {
        pub element_id: usize,
        pub length: Length,
        pub n_start: Force,
        pub n_end: Force,
        pub vy_start: Force,
        pub vy_end: Force,
        pub vz_start: Force,
        pub vz_end: Force,
        pub mx_start: Moment,
        pub mx_end: Moment,
        pub my_start: Moment,
        pub my_end: Moment,
        pub mz_start: Moment,
        pub mz_end: Moment,
        #[serde(default)]
        pub release_my_start: bool,
        #[serde(default)]
        pub release_my_end: bool,
        #[serde(default)]
        pub release_mz_start: bool,
        #[serde(default)]
        pub release_mz_end: bool,
        #[serde(default)]
        pub release_t_start: bool,
        #[serde(default)]
        pub release_t_end: bool,
        #[serde(rename = "qYI")]
        pub q_yi: LineLoad,
        #[serde(rename = "qYJ")]
        pub q_yj: LineLoad,
        pub distributed_loads_y: Vec<DistributedLoadInfo>,
        pub point_loads_y: Vec<PointLoadInfo3D>,
        #[serde(rename = "qZI")]
        pub q_zi: LineLoad,
        #[serde(rename = "qZJ")]
        pub q_zj: LineLoad,
        pub distributed_loads_z: Vec<DistributedLoadInfo>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub distributed_loads_x: Vec<DistributedLoadInfo>,
        pub point_loads_z: Vec<PointLoadInfo3D>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub bimoment_start: Option<Bimoment>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub bimoment_end: Option<Bimoment>,
    }

    /// Mirrors `SolverLoad`: same tags, same variant order.
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

    /// Mirrors `SolverLoad3D`: same tags, same variant order.
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
        Bimoment(crate::types::SolverBimomentLoad),
        #[serde(rename = "quadPressure")]
        QuadPressure(SolverPressureLoad),
        #[serde(rename = "quadThermal")]
        QuadThermal(SolverPlateThermalLoad),
        #[serde(rename = "quadEdge")]
        QuadEdge(SolverQuadEdgeLoad),
        #[serde(rename = "quadSelfWeight")]
        QuadSelfWeight(crate::types::SolverQuadSelfWeightLoad),
        #[serde(rename = "quad9Pressure")]
        Quad9Pressure(SolverPressureLoad),
        #[serde(rename = "quad9Thermal")]
        Quad9Thermal(SolverPlateThermalLoad),
        #[serde(rename = "quad9Edge")]
        Quad9Edge(SolverQuadEdgeLoad),
        #[serde(rename = "quad9SelfWeight")]
        Quad9SelfWeight(crate::types::SolverQuadSelfWeightLoad),
        #[serde(rename = "solidShellPressure")]
        SolidShellPressure(SolverPressureLoad),
        #[serde(rename = "solidShellSelfWeight")]
        SolidShellSelfWeight(crate::types::SolverSolidShellSelfWeightLoad),
        #[serde(rename = "curvedShellPressure")]
        CurvedShellPressure(SolverPressureLoad),
        #[serde(rename = "curvedShellThermal")]
        CurvedShellThermal(SolverPlateThermalLoad),
        #[serde(rename = "curvedShellEdge")]
        CurvedShellEdge(SolverQuadEdgeLoad),
        #[serde(rename = "curvedShellSelfWeight")]
        CurvedShellSelfWeight(crate::types::SolverQuadSelfWeightLoad),
    }
}
pub use wire::{
    Displacement as TypedDisplacement, Displacement3D as TypedDisplacement3D, DistributedLoadInfo as TypedDistributedLoadInfo,
    ElementForces as TypedElementForces, ElementForces3D as TypedElementForces3D, PointLoadInfo as TypedPointLoadInfo,
    PointLoadInfo3D as TypedPointLoadInfo3D, Reaction as TypedReaction, Reaction3D as TypedReaction3D,
    SolverAxialDistributedLoad as TypedAxialDistributedLoad, SolverDistributedLoad as TypedDistributedLoad,
    SolverDistributedLoad3D as TypedDistributedLoad3D, SolverElement3D as TypedElement3D, SolverLoad as TypedLoad,
    SolverLoad3D as TypedLoad3D, SolverMaterial as ElasticMaterial, SolverNodalLoad as TypedNodalLoad,
    SolverNodalLoad3D as TypedNodalLoad3D, SolverNode as TypedNode, SolverNode3D as TypedNode3D,
    SolverPlateThermalLoad as TypedPlateThermalLoad, SolverPointLoad3D as TypedPointLoad3D,
    SolverPointLoadOnElement as TypedPointLoad, SolverPressureLoad as TypedPressureLoad, SolverQuadEdgeLoad as TypedQuadEdgeLoad,
    SolverSection as ElasticSection2D, SolverSection3D as ElasticSection3D, SolverSupport as TypedSupport,
    SolverSupport3D as TypedSupport3D, SolverThermalLoad as TypedThermalLoad, SolverThermalLoad3D as TypedThermalLoad3D,
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

impl From<TypedDistributedLoad> for super::SolverDistributedLoad {
    fn from(l: TypedDistributedLoad) -> Self {
        Self {
            element_id: l.element_id,
            q_i: l.q_i.in_kn_per_m(),
            q_j: l.q_j.in_kn_per_m(),
            a: l.a.map(Length::in_m),
            b: l.b.map(Length::in_m),
        }
    }
}

impl From<TypedAxialDistributedLoad> for super::SolverAxialDistributedLoad {
    fn from(l: TypedAxialDistributedLoad) -> Self {
        Self {
            element_id: l.element_id,
            q_i: l.q_i.in_kn_per_m(),
            q_j: l.q_j.in_kn_per_m(),
            a: l.a.map(Length::in_m),
            b: l.b.map(Length::in_m),
        }
    }
}

impl From<TypedThermalLoad> for super::SolverThermalLoad {
    fn from(l: TypedThermalLoad) -> Self {
        Self {
            element_id: l.element_id,
            dt_uniform: l.dt_uniform.in_delta_c(),
            dt_gradient: l.dt_gradient.in_delta_c(),
            alpha: l.alpha.map(ThermalExpansion::in_per_c),
            depth: l.depth.map(Length::in_m),
        }
    }
}

impl From<TypedDistributedLoad3D> for super::SolverDistributedLoad3D {
    fn from(l: TypedDistributedLoad3D) -> Self {
        Self {
            q_xi: l.q_xi.in_kn_per_m(),
            q_xj: l.q_xj.in_kn_per_m(),
            element_id: l.element_id,
            q_yi: l.q_yi.in_kn_per_m(),
            q_yj: l.q_yj.in_kn_per_m(),
            q_zi: l.q_zi.in_kn_per_m(),
            q_zj: l.q_zj.in_kn_per_m(),
            a: l.a.map(Length::in_m),
            b: l.b.map(Length::in_m),
        }
    }
}

impl From<TypedThermalLoad3D> for super::SolverThermalLoad3D {
    fn from(l: TypedThermalLoad3D) -> Self {
        Self {
            element_id: l.element_id,
            dt_uniform: l.dt_uniform.in_delta_c(),
            dt_gradient_y: l.dt_gradient_y.in_delta_c(),
            dt_gradient_z: l.dt_gradient_z.in_delta_c(),
            alpha: l.alpha.map(ThermalExpansion::in_per_c),
            depth_y: l.depth_y.map(Length::in_m),
            depth_z: l.depth_z.map(Length::in_m),
        }
    }
}

impl From<TypedPressureLoad> for super::SolverPressureLoad {
    fn from(l: TypedPressureLoad) -> Self {
        Self { element_id: l.element_id, pressure: l.pressure.in_kn_per_m2() }
    }
}

impl From<TypedPlateThermalLoad> for super::SolverPlateThermalLoad {
    fn from(l: TypedPlateThermalLoad) -> Self {
        Self {
            element_id: l.element_id,
            dt_uniform: l.dt_uniform.in_delta_c(),
            dt_gradient: l.dt_gradient.in_delta_c(),
            alpha: l.alpha.map(ThermalExpansion::in_per_c),
        }
    }
}

impl From<TypedQuadEdgeLoad> for super::SolverQuadEdgeLoad {
    fn from(l: TypedQuadEdgeLoad) -> Self {
        Self { element_id: l.element_id, edge: l.edge, qn: l.qn.in_kn_per_m(), qt: l.qt.in_kn_per_m() }
    }
}

impl From<TypedSupport> for super::SolverSupport {
    fn from(s: TypedSupport) -> Self {
        Self {
            id: s.id,
            node_id: s.node_id,
            support_type: s.support_type,
            kx: s.kx.map(TranslationalStiffness::in_kn_per_m),
            ky: s.ky.map(TranslationalStiffness::in_kn_per_m),
            kz: s.kz.map(RotationalStiffness::in_kn_m_per_rad),
            dx: s.dx.map(Length::in_m),
            dz: s.dz.map(Length::in_m),
            dry: s.dry.map(Angle::in_rad),
            angle: s.angle.map(Angle::in_rad),
        }
    }
}

impl From<TypedSupport3D> for super::SolverSupport3D {
    fn from(s: TypedSupport3D) -> Self {
        Self {
            node_id: s.node_id,
            rx: s.rx,
            ry: s.ry,
            rz: s.rz,
            rrx: s.rrx,
            rry: s.rry,
            rrz: s.rrz,
            kx: s.kx.map(TranslationalStiffness::in_kn_per_m),
            ky: s.ky.map(TranslationalStiffness::in_kn_per_m),
            kz: s.kz.map(TranslationalStiffness::in_kn_per_m),
            krx: s.krx.map(RotationalStiffness::in_kn_m_per_rad),
            kry: s.kry.map(RotationalStiffness::in_kn_m_per_rad),
            krz: s.krz.map(RotationalStiffness::in_kn_m_per_rad),
            dx: s.dx.map(Length::in_m),
            dy: s.dy.map(Length::in_m),
            dz: s.dz.map(Length::in_m),
            drx: s.drx.map(Angle::in_rad),
            dry: s.dry.map(Angle::in_rad),
            drz: s.drz.map(Angle::in_rad),
            rw: s.rw,
            kw: s.kw,
            normal_x: s.normal_x,
            normal_y: s.normal_y,
            normal_z: s.normal_z,
            is_inclined: s.is_inclined,
        }
    }
}

impl From<TypedElement3D> for super::SolverElement3D {
    fn from(e: TypedElement3D) -> Self {
        Self {
            id: e.id,
            elem_type: e.elem_type,
            node_i: e.node_i,
            node_j: e.node_j,
            material_id: e.material_id,
            section_id: e.section_id,
            release_my_start: e.release_my_start,
            release_my_end: e.release_my_end,
            release_mz_start: e.release_mz_start,
            release_mz_end: e.release_mz_end,
            release_t_start: e.release_t_start,
            release_t_end: e.release_t_end,
            local_yx: e.local_yx,
            local_yy: e.local_yy,
            local_yz: e.local_yz,
            roll_angle: e.roll_angle.map(AngleDeg::in_deg),
        }
    }
}

impl From<TypedLoad> for super::SolverLoad {
    fn from(l: TypedLoad) -> Self {
        use super::SolverLoad as S;
        match l {
            TypedLoad::Nodal(v) => S::Nodal(v.into()),
            TypedLoad::Distributed(v) => S::Distributed(v.into()),
            TypedLoad::PointOnElement(v) => S::PointOnElement(v.into()),
            TypedLoad::Thermal(v) => S::Thermal(v.into()),
            TypedLoad::AxialDistributed(v) => S::AxialDistributed(v.into()),
        }
    }
}

impl From<TypedLoad3D> for super::SolverLoad3D {
    fn from(l: TypedLoad3D) -> Self {
        use super::SolverLoad3D as S;
        match l {
            TypedLoad3D::Nodal(v) => S::Nodal(v.into()),
            TypedLoad3D::Distributed(v) => S::Distributed(v.into()),
            TypedLoad3D::PointOnElement(v) => S::PointOnElement(v.into()),
            TypedLoad3D::Thermal(v) => S::Thermal(v.into()),
            TypedLoad3D::Pressure(v) => S::Pressure(v.into()),
            TypedLoad3D::PlateThermal(v) => S::PlateThermal(v.into()),
            TypedLoad3D::Bimoment(v) => S::Bimoment(v),
            TypedLoad3D::QuadPressure(v) => S::QuadPressure(v.into()),
            TypedLoad3D::QuadThermal(v) => S::QuadThermal(v.into()),
            TypedLoad3D::QuadEdge(v) => S::QuadEdge(v.into()),
            TypedLoad3D::QuadSelfWeight(v) => S::QuadSelfWeight(v),
            TypedLoad3D::Quad9Pressure(v) => S::Quad9Pressure(v.into()),
            TypedLoad3D::Quad9Thermal(v) => S::Quad9Thermal(v.into()),
            TypedLoad3D::Quad9Edge(v) => S::Quad9Edge(v.into()),
            TypedLoad3D::Quad9SelfWeight(v) => S::Quad9SelfWeight(v),
            TypedLoad3D::SolidShellPressure(v) => S::SolidShellPressure(v.into()),
            TypedLoad3D::SolidShellSelfWeight(v) => S::SolidShellSelfWeight(v),
            TypedLoad3D::CurvedShellPressure(v) => S::CurvedShellPressure(v.into()),
            TypedLoad3D::CurvedShellThermal(v) => S::CurvedShellThermal(v.into()),
            TypedLoad3D::CurvedShellEdge(v) => S::CurvedShellEdge(v.into()),
            TypedLoad3D::CurvedShellSelfWeight(v) => S::CurvedShellSelfWeight(v),
        }
    }
}

impl From<&super::Displacement> for TypedDisplacement {
    fn from(d: &super::Displacement) -> Self {
        let super::Displacement { node_id, ux, uz, ry } = *d;
        Self { node_id, ux: Length::from_m(ux), uz: Length::from_m(uz), ry: Angle::from_rad(ry) }
    }
}

impl From<&super::Reaction> for TypedReaction {
    fn from(r: &super::Reaction) -> Self {
        let super::Reaction { node_id, rx, rz, my } = *r;
        Self { node_id, rx: Force::from_kn(rx), rz: Force::from_kn(rz), my: Moment::from_kn_m(my) }
    }
}

impl From<&super::PointLoadInfo> for TypedPointLoadInfo {
    fn from(p: &super::PointLoadInfo) -> Self {
        let super::PointLoadInfo { a, p, px, my } = *p;
        Self { a: Length::from_m(a), p: Force::from_kn(p), px: px.map(Force::from_kn), my: my.map(Moment::from_kn_m) }
    }
}

impl From<&super::DistributedLoadInfo> for TypedDistributedLoadInfo {
    fn from(d: &super::DistributedLoadInfo) -> Self {
        let super::DistributedLoadInfo { q_i, q_j, a, b } = *d;
        Self { q_i: LineLoad::from_kn_per_m(q_i), q_j: LineLoad::from_kn_per_m(q_j), a: Length::from_m(a), b: Length::from_m(b) }
    }
}

fn typed_all<'a, L: 'a, T: From<&'a L>>(v: &'a [L]) -> Vec<T> {
    v.iter().map(T::from).collect()
}

impl From<&super::ElementForces> for TypedElementForces {
    fn from(f: &super::ElementForces) -> Self {
        let super::ElementForces {
            element_id,
            n_start,
            n_end,
            v_start,
            v_end,
            m_start,
            m_end,
            length,
            q_i,
            q_j,
            point_loads,
            distributed_loads,
            distributed_loads_x,
            hinge_start,
            hinge_end,
        } = f;
        Self {
            element_id: *element_id,
            n_start: Force::from_kn(*n_start),
            n_end: Force::from_kn(*n_end),
            v_start: Force::from_kn(*v_start),
            v_end: Force::from_kn(*v_end),
            m_start: Moment::from_kn_m(*m_start),
            m_end: Moment::from_kn_m(*m_end),
            length: Length::from_m(*length),
            q_i: LineLoad::from_kn_per_m(*q_i),
            q_j: LineLoad::from_kn_per_m(*q_j),
            point_loads: typed_all(point_loads),
            distributed_loads: typed_all(distributed_loads),
            distributed_loads_x: typed_all(distributed_loads_x),
            hinge_start: *hinge_start,
            hinge_end: *hinge_end,
        }
    }
}

impl From<&super::Displacement3D> for TypedDisplacement3D {
    fn from(d: &super::Displacement3D) -> Self {
        let super::Displacement3D { node_id, ux, uy, uz, rx, ry, rz, warping } = *d;
        Self {
            node_id,
            ux: Length::from_m(ux),
            uy: Length::from_m(uy),
            uz: Length::from_m(uz),
            rx: Angle::from_rad(rx),
            ry: Angle::from_rad(ry),
            rz: Angle::from_rad(rz),
            warping,
        }
    }
}

impl From<&super::Reaction3D> for TypedReaction3D {
    fn from(r: &super::Reaction3D) -> Self {
        let super::Reaction3D { node_id, fx, fy, fz, mx, my, mz, bimoment } = *r;
        Self {
            node_id,
            fx: Force::from_kn(fx),
            fy: Force::from_kn(fy),
            fz: Force::from_kn(fz),
            mx: Moment::from_kn_m(mx),
            my: Moment::from_kn_m(my),
            mz: Moment::from_kn_m(mz),
            bimoment: bimoment.map(Bimoment::from_kn_m2),
        }
    }
}

impl From<&super::PointLoadInfo3D> for TypedPointLoadInfo3D {
    fn from(p: &super::PointLoadInfo3D) -> Self {
        let super::PointLoadInfo3D { a, p } = *p;
        Self { a: Length::from_m(a), p: Force::from_kn(p) }
    }
}

impl From<&super::ElementForces3D> for TypedElementForces3D {
    fn from(f: &super::ElementForces3D) -> Self {
        let super::ElementForces3D {
            element_id,
            length,
            n_start,
            n_end,
            vy_start,
            vy_end,
            vz_start,
            vz_end,
            mx_start,
            mx_end,
            my_start,
            my_end,
            mz_start,
            mz_end,
            release_my_start,
            release_my_end,
            release_mz_start,
            release_mz_end,
            release_t_start,
            release_t_end,
            q_yi,
            q_yj,
            distributed_loads_y,
            point_loads_y,
            q_zi,
            q_zj,
            distributed_loads_z,
            distributed_loads_x,
            point_loads_z,
            bimoment_start,
            bimoment_end,
        } = f;
        Self {
            element_id: *element_id,
            length: Length::from_m(*length),
            n_start: Force::from_kn(*n_start),
            n_end: Force::from_kn(*n_end),
            vy_start: Force::from_kn(*vy_start),
            vy_end: Force::from_kn(*vy_end),
            vz_start: Force::from_kn(*vz_start),
            vz_end: Force::from_kn(*vz_end),
            mx_start: Moment::from_kn_m(*mx_start),
            mx_end: Moment::from_kn_m(*mx_end),
            my_start: Moment::from_kn_m(*my_start),
            my_end: Moment::from_kn_m(*my_end),
            mz_start: Moment::from_kn_m(*mz_start),
            mz_end: Moment::from_kn_m(*mz_end),
            release_my_start: *release_my_start,
            release_my_end: *release_my_end,
            release_mz_start: *release_mz_start,
            release_mz_end: *release_mz_end,
            release_t_start: *release_t_start,
            release_t_end: *release_t_end,
            q_yi: LineLoad::from_kn_per_m(*q_yi),
            q_yj: LineLoad::from_kn_per_m(*q_yj),
            distributed_loads_y: typed_all(distributed_loads_y),
            point_loads_y: typed_all(point_loads_y),
            q_zi: LineLoad::from_kn_per_m(*q_zi),
            q_zj: LineLoad::from_kn_per_m(*q_zj),
            distributed_loads_z: typed_all(distributed_loads_z),
            distributed_loads_x: typed_all(distributed_loads_x),
            point_loads_z: typed_all(point_loads_z),
            bimoment_start: bimoment_start.map(Bimoment::from_kn_m2),
            bimoment_end: bimoment_end.map(Bimoment::from_kn_m2),
        }
    }
}

macro_rules! serialize_as_typed {
    ($($legacy:ident => $typed:ident),* $(,)?) => {
        $(impl Serialize for super::$legacy {
            fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
                $typed::from(self).serialize(s)
            }
        })*
    };
}
serialize_as_typed!(
    Displacement => TypedDisplacement,
    Reaction => TypedReaction,
    PointLoadInfo => TypedPointLoadInfo,
    DistributedLoadInfo => TypedDistributedLoadInfo,
    ElementForces => TypedElementForces,
    Displacement3D => TypedDisplacement3D,
    Reaction3D => TypedReaction3D,
    PointLoadInfo3D => TypedPointLoadInfo3D,
    ElementForces3D => TypedElementForces3D,
);

/// What the 2D and 3D solve exports serialize. `into_typed` is the only place solver results
/// acquire units; every other serialization of a result record goes through the same typed records.
pub type TypedResults2D = super::AnalysisResults<TypedDisplacement, TypedReaction, TypedElementForces>;
pub type TypedResults3D = super::AnalysisResults3D<TypedDisplacement3D, TypedReaction3D, TypedElementForces3D>;
impl super::AnalysisResults {
    pub fn into_typed(self) -> TypedResults2D {
        let super::AnalysisResults {
            displacements,
            reactions,
            element_forces,
            constraint_forces,
            diagnostics,
            solver_diagnostics,
            structured_diagnostics,
            equilibrium,
            result_summary,
            solver_run_meta,
        } = self;
        super::AnalysisResults {
            displacements: typed_all(&displacements),
            reactions: typed_all(&reactions),
            element_forces: typed_all(&element_forces),
            constraint_forces,
            diagnostics,
            solver_diagnostics,
            structured_diagnostics,
            equilibrium,
            result_summary,
            solver_run_meta,
        }
    }
}
impl super::AnalysisResults3D {
    pub fn into_typed(self) -> TypedResults3D {
        let super::AnalysisResults3D {
            displacements,
            reactions,
            element_forces,
            plate_stresses,
            quad_stresses,
            quad_nodal_stresses,
            constraint_forces,
            diagnostics,
            solver_diagnostics,
            timings,
            structured_diagnostics,
            equilibrium,
            result_summary,
            solver_run_meta,
        } = self;
        super::AnalysisResults3D {
            displacements: typed_all(&displacements),
            reactions: typed_all(&reactions),
            element_forces: typed_all(&element_forces),
            plate_stresses,
            quad_stresses,
            quad_nodal_stresses,
            constraint_forces,
            diagnostics,
            solver_diagnostics,
            timings,
            structured_diagnostics,
            equilibrium,
            result_summary,
            solver_run_meta,
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
impl TypedWire for TypedSupport3D {}
impl TypedWire for TypedElement3D {}
impl<'de> Deserialize<'de> for super::SolverInput3D {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        ElasticInput3D::deserialize(d).map(ElasticInput3D::into_legacy)
    }
}

/// What every 3D WASM export deserializes. `into_legacy` is the only place its units are erased.
pub type ElasticInput3D = super::SolverInput3D<ElasticMaterial, ElasticSection3D, TypedNode3D, TypedLoad3D, TypedSupport3D, TypedElement3D>;
impl ElasticInput3D {
    pub fn into_legacy(self) -> super::SolverInput3D {
        super::SolverInput3D {
            nodes: self.nodes.into_iter().map(|(k, v)| (k, v.into())).collect(),
            materials: self.materials.into_iter().map(|(k, v)| (k, v.into())).collect(),
            sections: self.sections.into_iter().map(|(k, v)| (k, v.into())).collect(),
            elements: self.elements.into_iter().map(|(k, v)| (k, v.into())).collect(),
            supports: self.supports.into_iter().map(|(k, v)| (k, v.into())).collect(),
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
pub type ElasticInput2D = super::SolverInput<ElasticMaterial, ElasticSection2D, TypedNode, TypedLoad, TypedSupport>;

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
            supports: self.supports.into_iter().map(|(k, v)| (k, v.into())).collect(),
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
