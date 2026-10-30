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

/// The direct linear WASM boundary retains these types through frame assembly/recovery.
pub type ElasticInput2D = super::SolverInput<ElasticMaterial, ElasticSection2D>;

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
    /// Temporary view for validation and still-unmigrated loads/constraints. The frame
    /// stiffness/recovery path keeps its original typed properties separately.
    pub(crate) fn legacy_view(&self) -> super::SolverInput {
        super::SolverInput {
            nodes: self.nodes.clone(),
            materials: self
                .materials
                .iter()
                .map(|(k, v)| (k.clone(), (*v).into()))
                .collect(),
            sections: self
                .sections
                .iter()
                .map(|(k, v)| (k.clone(), (*v).into()))
                .collect(),
            elements: self.elements.clone(),
            supports: self.supports.clone(),
            loads: self.loads.clone(),
            constraints: self.constraints.clone(),
            connectors: self.connectors.clone(),
            solver_options: self.solver_options.clone(),
            masses: self.masses.clone(),
        }
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
    fn units_shear_keeps_operation_order() {
        for as_y in [None, Some(0.006127)] {
            let s = ElasticSection2D {
                id: 1,
                a: Area::from_m2(0.01),
                iz: SecondMoment::from_m4(0.000173),
                as_y: as_y.map(Area::from_m2),
            };
            let e = 27123456.789;
            let nu = 0.271;
            let l = 3.14159;
            let expected = as_y
                .map(|a| {
                    let g = e / (2.0 * (1.0 + nu));
                    12.0 * e * 0.000173 / (g * a * l * l)
                })
                .unwrap_or(0.0);
            assert_eq!(
                s.shear_parameter(
                    Modulus::from_kn_per_m2(e),
                    Ratio::from_ratio(nu),
                    Length::from_m(l)
                )
                .to_bits(),
                expected.to_bits()
            );
        }
    }
}
