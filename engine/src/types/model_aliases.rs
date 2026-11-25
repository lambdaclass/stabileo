use std::marker::PhantomData;

use serde::{de, Deserialize, Deserializer, Serialize};

use super::input::{NodalMass, SpectralModeDisp};
use super::units::{Force, Moment};

struct Field<T>(Option<T>);

impl<T> Default for Field<T> {
    fn default() -> Self {
        Self(None)
    }
}

impl<'de, T: Deserialize<'de>> Deserialize<'de> for Field<T> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        T::deserialize(deserializer).map(|value| Self(Some(value)))
    }
}

fn reconcile<T: PartialEq, E: de::Error>(
    canonical: Field<T>,
    legacy: Field<T>,
    field: &str,
    alias: &str,
) -> Result<Option<T>, E> {
    if let (Some(value), Some(other)) = (&canonical.0, &legacy.0) {
        if value != other {
            return Err(E::custom(format_args!(
                "conflicting model fields `{field}` and `{alias}`"
            )));
        }
    }
    Ok(canonical.0.or(legacy.0))
}

fn required<T, E: de::Error>(value: Option<T>, field: &'static str) -> Result<T, E> {
    value.ok_or_else(|| E::missing_field(field))
}

fn defaulted<T: Default, E: de::Error>(value: Option<T>, _: &str) -> Result<T, E> {
    Ok(value.unwrap_or_default())
}

struct RecordVisitor<T>(PhantomData<T>);

macro_rules! named_value {
    ($wire:ident, $field:ident) => {
        $wire.$field.0
    };
    ($wire:ident, $field:ident, $name:literal, $legacy:ident, $alias:literal) => {
        reconcile($wire.$field, $wire.$legacy, $name, $alias)?
    };
}

macro_rules! deserialize_aliased_input {
    (
        $name:ident $(<$($param:ident $(: $bound:path)?),+>)? as $record_name:literal,
        $(#[$record:meta])*
        $($field:ident: $ty:ty => $wire_name:literal, $missing:ident $(, $legacy:ident => $legacy_name:literal)?;)+
        $(@map $named:ident { $($extra:ident: $extra_ty:ty => $extra_name:literal;)+ } $normalize:block)?
    ) => {
        impl<'de $(, $($param: Deserialize<'de> + PartialEq $(+ $bound)?),+)?> Deserialize<'de>
            for $name $(<$($param),+>)?
        {
            fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
                deserialize_aliased_input!(
                    @read deserializer, $record_name, &[$($wire_name, $($legacy_name,)?)+],
                    RecordVisitor::<Self>(PhantomData) $(, $named)?
                )
            }
        }

        impl<'de $(, $($param: Deserialize<'de> + PartialEq $(+ $bound)?),+)?> de::Visitor<'de>
            for RecordVisitor<$name $(<$($param),+>)?>
        {
            type Value = $name $(<$($param),+>)?;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str(concat!("struct ", $record_name))
            }

            fn visit_map<Map: de::MapAccess<'de>>(self, map: Map) -> Result<Self::Value, Map::Error> {
                #[derive(Deserialize)]
                $(#[$record])*
                struct Wire $(<$($param),+>)? {
                    $(
                        #[serde(default = "Field::default", rename = $wire_name)]
                        $field: Field<$ty>,
                        $(
                            #[serde(default = "Field::default", rename = $legacy_name)]
                            $legacy: Field<$ty>,
                        )?
                    )+
                    $($(
                        #[serde(default = "Field::default", rename = $extra_name)]
                        $extra: Field<$extra_ty>,
                    )+)?
                }

                let wire: Wire $(<$($param),+>)? =
                    Wire::deserialize(de::value::MapAccessDeserializer::new(map))?;
                $(
                    let mut $named = wire;
                    $normalize
                    let wire = $named;
                )?
                Ok($name {
                    $($field: $missing(named_value!(wire, $field $(, $wire_name, $legacy, $legacy_name)?), $wire_name)?,)+
                })
            }

            fn visit_seq<Seq: de::SeqAccess<'de>>(self, mut seq: Seq) -> Result<Self::Value, Seq::Error> {
                let record = $name {
                    $($field: $missing(seq.next_element()?, $wire_name)?,)+
                };
                if seq.next_element::<de::IgnoredAny>()?.is_some() {
                    return Err(de::Error::custom(concat!("too many fields for ", $record_name)));
                }
                Ok(record)
            }
        }
    };
    (@read $d:ident, $name:literal, $fields:expr, $visitor:expr) => {
        $d.deserialize_struct($name, $fields, $visitor)
    };
    (@read $d:ident, $name:literal, $fields:expr, $visitor:expr, $named:ident) => {
        $d.deserialize_any($visitor)
    };
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename = "SolverNode", rename_all = "camelCase")]
pub struct PlanarNode<L> {
    pub id: usize,
    pub x: L,
    #[serde(alias = "y")]
    pub z: L,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename = "SolverNodalLoad", rename_all = "camelCase")]
pub struct PlanarNodalLoad<F, M> {
    pub node_id: usize,
    pub fx: F,
    pub fz: F,
    pub my: M,
}

trait NodalComponent {
    fn is_zero(&self) -> bool;
}

impl NodalComponent for f64 {
    fn is_zero(&self) -> bool {
        *self == 0.0
    }
}

impl NodalComponent for Force {
    fn is_zero(&self) -> bool {
        self.in_kn().is_zero()
    }
}

impl NodalComponent for Moment {
    fn is_zero(&self) -> bool {
        self.in_kn_m().is_zero()
    }
}

fn refuse_out_of_plane<E: de::Error>(field: &str) -> E {
    E::custom(format_args!("out-of-plane nodal component `{field}`"))
}

deserialize_aliased_input! {
    PlanarNodalLoad<F: NodalComponent, M: NodalComponent> as "SolverNodalLoad",
    #[serde(deny_unknown_fields)]
    node_id: usize => "nodeId", required;
    fx: F => "fx", required;
    fz: F => "fz", required, fy => "fy";
    my: M => "my", required, mz => "mz";
    @map wire { mx: f64 => "mx"; } {
        if let Some(mx) = wire.mx.0 {
            if !mx.is_zero() {
                return Err(refuse_out_of_plane("mx"));
            }
            let complete = wire.fx.0.is_some() && wire.fz.0.is_some() && wire.my.0.is_some();
            if let (true, Some(fy), Some(mz)) = (complete, &wire.fy.0, &wire.mz.0) {
                if !fy.is_zero() {
                    return Err(refuse_out_of_plane("fy"));
                }
                if !mz.is_zero() {
                    return Err(refuse_out_of_plane("mz"));
                }
                wire.fy = Field::default();
                wire.mz = Field::default();
            }
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename = "SolverPointLoadOnElement", rename_all = "camelCase")]
pub struct PlanarPointLoad<L, F, M> {
    pub element_id: usize,
    pub a: L,
    pub p: F,
    pub px: Option<F>,
    pub my: Option<M>,
}

deserialize_aliased_input! {
    PlanarPointLoad<L, F, M> as "SolverPointLoadOnElement",
    element_id: usize => "elementId", required;
    a: L => "a", required;
    p: F => "p", required;
    px: Option<F> => "px", defaulted;
    my: Option<M> => "my", defaulted, mz => "mz";
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename = "SolverSupport", rename_all = "camelCase")]
pub struct PlanarSupport<L, A, K, R> {
    pub id: usize,
    pub node_id: usize,
    #[serde(rename = "type")]
    pub support_type: String,
    pub kx: Option<K>,
    pub ky: Option<K>,
    pub kz: Option<R>,
    pub dx: Option<L>,
    pub dz: Option<L>,
    pub dry: Option<A>,
    pub angle: Option<A>,
}

deserialize_aliased_input! {
    PlanarSupport<L, A, K, R> as "SolverSupport",
    id: usize => "id", required;
    node_id: usize => "nodeId", required;
    support_type: String => "type", required;
    kx: Option<K> => "kx", defaulted;
    ky: Option<K> => "ky", defaulted;
    kz: Option<R> => "kz", defaulted;
    dx: Option<L> => "dx", defaulted;
    dz: Option<L> => "dz", defaulted, dy => "dy";
    dry: Option<A> => "dry", defaulted, drz => "drz";
    angle: Option<A> => "angle", defaulted;
}

deserialize_aliased_input! {
    NodalMass as "NodalMass",
    #[serde(deny_unknown_fields)]
    node_id: usize => "nodeId", required;
    mass: f64 => "mass", defaulted;
    mass_x: Option<f64> => "massX", defaulted;
    mass_z: Option<f64> => "massZ", defaulted, mass_y => "massY";
    rotary_inertia: f64 => "iy", defaulted, iz => "iz";
}

deserialize_aliased_input! {
    SpectralModeDisp as "SpectralModeDisp",
    node_id: usize => "nodeId", required;
    ux: f64 => "ux", required;
    uz: f64 => "uz", required, uy => "uy";
    ry: f64 => "ry", required, rz => "rz";
}
