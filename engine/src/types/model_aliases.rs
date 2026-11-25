use std::marker::PhantomData;

use serde::{de, Deserialize, Deserializer, Serialize};

use super::input::{NodalMass, SpectralModeDisp};
use super::numeric;
use super::units::{Force, Moment};

fn present<'de, D: Deserializer<'de>, T: Deserialize<'de>>(deserializer: D) -> Result<Option<T>, D::Error> {
    T::deserialize(deserializer).map(Some)
}

fn reconcile<T: PartialEq, E: de::Error>(
    canonical: Option<T>,
    legacy: Option<T>,
    field: &str,
    alias: &str,
) -> Result<Option<T>, E> {
    if let (Some(value), Some(other)) = (&canonical, &legacy) {
        if value != other {
            return Err(E::custom(format_args!(
                "conflicting model fields `{field}` and `{alias}`"
            )));
        }
    }
    Ok(canonical.or(legacy))
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
        $wire.$field
    };
    ($wire:ident, $field:ident, $name:literal, $legacy:ident, $alias:literal) => {
        reconcile($wire.$field, $wire.$legacy, $name, $alias)?
    };
}

macro_rules! positional_value {
    ($seq:ident, $field:literal) => {
        $seq.next_element()?
    };
    ($seq:ident, $field:literal, strict) => {
        $seq.next_element()?.map(|value| numeric::finite(value, $field)).transpose()?
    };
}

macro_rules! deserialize_aliased_input {
    (
        $name:ident $(<$($param:ident $(: $bound:path)?),+>)? as $record_name:literal,
        $(#[$record:meta])*
        $($field:ident: $ty:ty => $wire_name:literal, $missing:ident $(, $strict:ident)?,
            $decode:literal $(, $legacy:ident => $legacy_name:literal)?;)+
        $(@map $mode:ident $named:ident $($mutable:ident)? {
            $($extra:ident: $extra_ty:ty => $extra_name:literal, $extra_decode:literal;)+
        } $normalize:block)?
    ) => {
        impl<'de $(, $($param: Deserialize<'de> + PartialEq $(+ $bound)?),+)?> Deserialize<'de>
            for $name $(<$($param),+>)?
        {
            fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
                deserialize_aliased_input!(
                    @read deserializer, $record_name, &[$($wire_name, $($legacy_name,)?)+ $($($extra_name,)+)?],
                    RecordVisitor::<Self>(PhantomData) $(, $mode)?
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
                        #[serde(default = "Option::default", rename = $wire_name, deserialize_with = $decode)]
                        $field: Option<$ty>,
                        $(
                            #[serde(default = "Option::default", rename = $legacy_name, deserialize_with = $decode)]
                            $legacy: Option<$ty>,
                        )?
                    )+
                    $($(
                        #[serde(default = "Option::default", rename = $extra_name, deserialize_with = $extra_decode)]
                        $extra: Option<$extra_ty>,
                    )+)?
                }

                let wire: Wire $(<$($param),+>)? =
                    Wire::deserialize(de::value::MapAccessDeserializer::new(map))?;
                $(
                    let $($mutable)? $named = wire;
                    $normalize
                    let wire = $named;
                )?
                Ok($name {
                    $($field: $missing(named_value!(wire, $field $(, $wire_name, $legacy, $legacy_name)?), $wire_name)?,)+
                })
            }

            fn visit_seq<Seq: de::SeqAccess<'de>>(self, mut seq: Seq) -> Result<Self::Value, Seq::Error> {
                let record = $name {
                    $($field: $missing(positional_value!(seq, $wire_name $(, $strict)?), $wire_name)?,)+
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
    (@read $d:ident, $name:literal, $fields:expr, $visitor:expr, struct) => {
        $d.deserialize_struct($name, $fields, $visitor)
    };
    (@read $d:ident, $name:literal, $fields:expr, $visitor:expr, any) => {
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

trait NodalComponent: numeric::Numeric {
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
    #[serde(deny_unknown_fields, bound(deserialize = "F: Deserialize<'de> + NodalComponent, M: Deserialize<'de> + NodalComponent"))]
    node_id: usize => "nodeId", required, strict, "numeric::node_id::optional";
    fx: F => "fx", required, strict, "numeric::fx::optional";
    fz: F => "fz", required, strict, "numeric::fz_or_fy::optional", fy => "fy";
    my: M => "my", required, strict, "numeric::my_or_mz::optional", mz => "mz";
    @map any wire mut {
        mx: f64 => "mx", "numeric::mx::optional";
        _id: Option<u64> => "id", "present";
        _case_id: Option<u64> => "caseId", "present";
    } {
        if let Some(mx) = wire.mx {
            if !mx.is_zero() {
                return Err(refuse_out_of_plane("mx"));
            }
            let complete = wire.fx.is_some() && wire.fz.is_some() && wire.my.is_some();
            if let (true, Some(fy), Some(mz)) = (complete, &wire.fy, &wire.mz) {
                if !fy.is_zero() {
                    return Err(refuse_out_of_plane("fy"));
                }
                if !mz.is_zero() {
                    return Err(refuse_out_of_plane("mz"));
                }
                wire.fy = None;
                wire.mz = None;
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub px: Option<F>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub my: Option<M>,
}

deserialize_aliased_input! {
    PlanarPointLoad<L: numeric::Numeric, F: numeric::Numeric, M: numeric::Numeric> as "SolverPointLoadOnElement",
    #[serde(bound(deserialize = "L: Deserialize<'de> + numeric::Numeric, F: Deserialize<'de> + numeric::Numeric, M: Deserialize<'de> + numeric::Numeric"))]
    element_id: usize => "elementId", required, strict, "numeric::element_id::optional";
    a: L => "a", required, strict, "numeric::a::optional";
    p: F => "p", required, strict, "numeric::p::optional";
    px: Option<F> => "px", defaulted, strict, "numeric::px::present_optional";
    my: Option<M> => "my", defaulted, strict, "numeric::my_or_mz::present_optional", mz => "mz";
    @map struct wire {
        mx: f64 => "mx", "numeric::mx::optional";
    } {
        if let Some(mx) = wire.mx {
            numeric::point_moment::require_zero(mx, "mx")?;
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename = "SolverSupport", rename_all = "camelCase")]
pub struct PlanarSupport<L, A, K, R> {
    pub id: usize,
    pub node_id: usize,
    #[serde(rename = "type")]
    pub support_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kx: Option<K>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ky: Option<K>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kz: Option<R>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dx: Option<L>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dz: Option<L>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dry: Option<A>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub angle: Option<A>,
}

deserialize_aliased_input! {
    PlanarSupport<L: numeric::Numeric, A: numeric::Numeric, K: numeric::Numeric, R: numeric::Numeric> as "SolverSupport",
    #[serde(bound(deserialize = "L: Deserialize<'de> + numeric::Numeric, A: Deserialize<'de> + numeric::Numeric, K: Deserialize<'de> + numeric::Numeric, R: Deserialize<'de> + numeric::Numeric"))]
    id: usize => "id", required, strict, "numeric::id::optional";
    node_id: usize => "nodeId", required, strict, "numeric::node_id::optional";
    support_type: String => "type", required, "present";
    kx: Option<K> => "kx", defaulted, strict, "numeric::kx::present_optional";
    ky: Option<K> => "ky", defaulted, strict, "numeric::ky::present_optional";
    kz: Option<R> => "kz", defaulted, strict, "numeric::kz::present_optional";
    dx: Option<L> => "dx", defaulted, strict, "numeric::dx::present_optional";
    dz: Option<L> => "dz", defaulted, strict, "numeric::dz_or_dy::present_optional", dy => "dy";
    dry: Option<A> => "dry", defaulted, strict, "numeric::dry_or_drz::present_optional", drz => "drz";
    angle: Option<A> => "angle", defaulted, strict, "numeric::angle::present_optional";
}

deserialize_aliased_input! {
    NodalMass as "NodalMass",
    #[serde(deny_unknown_fields)]
    node_id: usize => "nodeId", required, "present";
    mass: f64 => "mass", defaulted, "present";
    mass_x: Option<f64> => "massX", defaulted, "present";
    mass_z: Option<f64> => "massZ", defaulted, "present", mass_y => "massY";
    rotary_inertia: f64 => "iy", defaulted, "present", iz => "iz";
}

deserialize_aliased_input! {
    SpectralModeDisp as "SpectralModeDisp",
    node_id: usize => "nodeId", required, "present";
    ux: f64 => "ux", required, "present";
    uz: f64 => "uz", required, "present", uy => "uy";
    ry: f64 => "ry", required, "present", rz => "rz";
}
