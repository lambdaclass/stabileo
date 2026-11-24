use serde::{de, Deserialize, Deserializer, Serialize};

use super::input::{NodalMass, SpectralModeDisp};

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

fn required<T: PartialEq, E: de::Error>(
    canonical: Field<T>,
    legacy: Field<T>,
    field: &'static str,
    alias: &str,
) -> Result<T, E> {
    reconcile(canonical, legacy, field, alias)?.ok_or_else(|| E::missing_field(field))
}

fn defaulted<T: PartialEq + Default, E: de::Error>(
    canonical: Field<T>,
    legacy: Field<T>,
    field: &str,
    alias: &str,
) -> Result<T, E> {
    Ok(reconcile(canonical, legacy, field, alias)?.unwrap_or_default())
}

macro_rules! deserialize_aliased_input {
    (
        $name:ident $(<$($param:ident),+>)?,
        $(#[$record:meta])*
        { $($(#[$attr:meta])* $field:ident: $ty:ty,)* }
        aliases {
            $($canonical:ident: $alias_ty:ty => $canonical_name:literal, $legacy:ident => $legacy_name:literal, $missing:ident;)+
        }
    ) => {
        impl<'de $(, $($param: Deserialize<'de> + PartialEq),+)?> Deserialize<'de>
            for $name $(<$($param),+>)?
        {
            fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
                #[derive(Deserialize)]
                #[serde(rename_all = "camelCase")]
                $(#[$record])*
                struct Wire $(<$($param),+>)? {
                    $($(#[$attr])* $field: $ty,)*
                    $(
                        #[serde(default = "Field::default", rename = $canonical_name)]
                        $canonical: Field<$alias_ty>,
                        #[serde(default = "Field::default", rename = $legacy_name)]
                        $legacy: Field<$alias_ty>,
                    )+
                }

                let wire = Wire::deserialize(deserializer)?;
                Ok(Self {
                    $($field: wire.$field,)*
                    $($canonical: $missing(wire.$canonical, wire.$legacy, $canonical_name, $legacy_name)?,)+
                })
            }
        }
    };
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename = "SolverNode", rename_all = "camelCase")]
pub struct PlanarNode<L> {
    pub id: usize,
    pub x: L,
    pub z: L,
}

deserialize_aliased_input! {
    PlanarNode<L>,
    {
        id: usize,
        x: L,
    }
    aliases {
        z: L => "z", y => "y", required;
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename = "SolverNodalLoad", rename_all = "camelCase")]
pub struct PlanarNodalLoad<F, M> {
    pub node_id: usize,
    pub fx: F,
    pub fz: F,
    pub my: M,
}

deserialize_aliased_input! {
    PlanarNodalLoad<F, M>,
    {
        node_id: usize,
        fx: F,
    }
    aliases {
        fz: F => "fz", fy => "fy", required;
        my: M => "my", mz => "mz", required;
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
    PlanarPointLoad<L, F, M>,
    {
        element_id: usize,
        a: L,
        p: F,
        #[serde(default = "Option::default")]
        px: Option<F>,
    }
    aliases {
        my: Option<M> => "my", mz => "mz", defaulted;
    }
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
    pub angle: Option<A>,
    pub dz: Option<L>,
    pub dry: Option<A>,
}

deserialize_aliased_input! {
    PlanarSupport<L, A, K, R>,
    {
        id: usize,
        node_id: usize,
        #[serde(rename = "type")]
        support_type: String,
        #[serde(default = "Option::default")]
        kx: Option<K>,
        #[serde(default = "Option::default")]
        ky: Option<K>,
        #[serde(default = "Option::default")]
        kz: Option<R>,
        #[serde(default = "Option::default")]
        dx: Option<L>,
        #[serde(default = "Option::default")]
        angle: Option<A>,
    }
    aliases {
        dz: Option<L> => "dz", dy => "dy", defaulted;
        dry: Option<A> => "dry", drz => "drz", defaulted;
    }
}

deserialize_aliased_input! {
    NodalMass,
    #[serde(deny_unknown_fields)]
    {
        node_id: usize,
        #[serde(default)]
        mass: f64,
        #[serde(default = "Option::default")]
        mass_x: Option<f64>,
    }
    aliases {
        mass_z: Option<f64> => "massZ", mass_y => "massY", defaulted;
        rotary_inertia: f64 => "iy", iz => "iz", defaulted;
    }
}

deserialize_aliased_input! {
    SpectralModeDisp,
    {
        node_id: usize,
        ux: f64,
    }
    aliases {
        uz: f64 => "uz", uy => "uy", required;
        ry: f64 => "ry", rz => "rz", required;
    }
}
