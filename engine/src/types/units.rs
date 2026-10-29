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
use serde::{Deserialize, Serialize};
use std::ops::{Add, Sub, Mul, Div, Neg};

macro_rules! quantity {
    ($name:ident, $new:ident, $get:ident) => {
        #[derive(Debug, Clone, Copy, PartialEq, PartialOrd, Serialize, Deserialize)]
        #[repr(transparent)]
        #[serde(transparent)]
        pub struct $name(f64);
        impl $name {
            #[inline] pub const fn $new(value: f64) -> Self { Self(value) }
            #[inline] pub const fn $get(self) -> f64 { self.0 }
        }
        impl Add for $name { type Output = Self; #[inline] fn add(self, rhs: Self) -> Self { Self(self.0 + rhs.0) } }
        impl Sub for $name { type Output = Self; #[inline] fn sub(self, rhs: Self) -> Self { Self(self.0 - rhs.0) } }
        impl Neg for $name { type Output = Self; #[inline] fn neg(self) -> Self { Self(-self.0) } }
        impl Mul<f64> for $name { type Output = Self; #[inline] fn mul(self, rhs: f64) -> Self { Self(self.0 * rhs) } }
        impl Mul<$name> for f64 { type Output = $name; #[inline] fn mul(self, rhs: $name) -> $name { $name(self * rhs.0) } }
        impl Div<f64> for $name { type Output = Self; #[inline] fn div(self, rhs: f64) -> Self { Self(self.0 / rhs) } }
        impl Div for $name { type Output = f64; #[inline] fn div(self, rhs: Self) -> f64 { self.0 / rhs.0 } }
    };
}
quantity!(Length, from_m, in_m);
quantity!(Area, from_m2, in_m2);
quantity!(Volume, from_m3, in_m3);
quantity!(SecondMoment, from_m4, in_m4);
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

impl ModulusMPa {
    #[inline] pub fn to_internal(self) -> Modulus { Modulus::from_kn_per_m2(self.0 * 1000.0) }
}
macro_rules! product {
    ($lhs:ident, $rhs:ident => $out:ident) => {
        impl Mul<$rhs> for $lhs { type Output = $out; #[inline] fn mul(self, rhs: $rhs) -> $out { $out(self.0 * rhs.0) } }
    };
}
macro_rules! quotient {
    ($lhs:ident, $rhs:ident => $out:ident) => {
        impl Div<$rhs> for $lhs { type Output = $out; #[inline] fn div(self, rhs: $rhs) -> $out { $out(self.0 / rhs.0) } }
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

/// Typed wire records. Values serialize as the existing bare JSON numbers.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElasticMaterial {
    pub id: usize,
    pub e: ModulusMPa,
    pub nu: Ratio,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElasticSection2D {
    pub id: usize,
    pub a: Area,
    pub iz: SecondMoment,
    #[serde(default)]
    pub as_y: Option<Area>,
}
impl ElasticSection2D {
    /// Preserve the legacy operation order, including the two successive L products.
    pub fn shear_parameter(self, e: Modulus, nu: Ratio, l: Length) -> f64 {
        self.as_y.map(|a| {
            let g = e / (2.0 * (1.0 + nu.in_ratio()));
            (12.0 * e * self.iz) / (g * a * l * l)
        }).unwrap_or(0.0)
    }
}

// Explicit compatibility boundary for the other analyses, whose public Rust DTOs
// still use f64. The 2D elastic kernels consume the typed records above.
impl From<&super::SolverMaterial> for ElasticMaterial {
    fn from(m: &super::SolverMaterial) -> Self {
        Self { id: m.id, e: ModulusMPa::from_mpa(m.e), nu: Ratio::from_ratio(m.nu) }
    }
}
impl From<&super::SolverSection> for ElasticSection2D {
    fn from(s: &super::SolverSection) -> Self {
        Self { id: s.id, a: Area::from_m2(s.a), iz: SecondMoment::from_m4(s.iz), as_y: s.as_y.map(Area::from_m2) }
    }
}
impl From<ElasticMaterial> for super::SolverMaterial {
    fn from(m: ElasticMaterial) -> Self { Self { id: m.id, e: m.e.in_mpa(), nu: m.nu.in_ratio() } }
}
impl From<super::SolverMaterial> for ElasticMaterial {
    fn from(m: super::SolverMaterial) -> Self { Self::from(&m) }
}
impl From<ElasticSection2D> for super::SolverSection {
    fn from(s: ElasticSection2D) -> Self { Self { id: s.id, a: s.a.in_m2(), iz: s.iz.in_m4(), as_y: s.as_y.map(Area::in_m2) } }
}
impl From<super::SolverSection> for ElasticSection2D {
    fn from(s: super::SolverSection) -> Self { Self::from(&s) }
}
