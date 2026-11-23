use serde::{de, Deserialize, Deserializer};

pub(super) struct Field<T>(Option<T>);

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

pub(super) fn required<T: PartialEq, E: de::Error>(
    canonical: Field<T>,
    legacy: Field<T>,
    field: &'static str,
    alias: &str,
) -> Result<T, E> {
    reconcile(canonical, legacy, field, alias)?.ok_or_else(|| E::missing_field(field))
}

pub(super) fn defaulted<T: PartialEq + Default, E: de::Error>(
    canonical: Field<T>,
    legacy: Field<T>,
    field: &str,
    alias: &str,
) -> Result<T, E> {
    Ok(reconcile(canonical, legacy, field, alias)?.unwrap_or_default())
}

macro_rules! aliased_input {
    (
        $(#[$record:meta])*
        pub struct $name:ident {
            $($(#[$attr:meta])* pub $field:ident: $ty:ty,)*
        }
        aliases {
            $($canonical:ident: $alias_ty:ty => $canonical_name:literal, $legacy:ident => $legacy_name:literal, $missing:ident;)*
        }
    ) => {
        #[derive(Debug, Clone, serde::Serialize)]
        $(#[$record])*
        pub struct $name {
            $($(#[$attr])* pub $field: $ty,)*
            $(#[serde(rename = $canonical_name)] pub $canonical: $alias_ty,)*
        }

        impl<'de> serde::Deserialize<'de> for $name {
            fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
                use $crate::types::model_aliases::{self, Field};

                #[derive(serde::Deserialize)]
                $(#[$record])*
                struct Wire {
                    $($(#[$attr])* $field: $ty,)*
                    $(
                        #[serde(default, rename = $canonical_name)]
                        $canonical: Field<$alias_ty>,
                        #[serde(default, rename = $legacy_name)]
                        $legacy: Field<$alias_ty>,
                    )*
                }

                let wire = Wire::deserialize(deserializer)?;
                Ok(Self {
                    $($field: wire.$field,)*
                    $($canonical: model_aliases::$missing(wire.$canonical, wire.$legacy, $canonical_name, $legacy_name)?,)*
                })
            }
        }
    };
}

macro_rules! node {
    ($length:ty) => {
        $crate::types::model_aliases::aliased_input! {
            #[serde(rename_all = "camelCase")]
            pub struct SolverNode {
                pub id: usize,
                pub x: $length,
            }
            aliases {
                z: $length => "z", y => "y", required;
            }
        }
    };
}

macro_rules! nodal_load {
    ($force:ty, $moment:ty) => {
        $crate::types::model_aliases::aliased_input! {
            #[serde(rename_all = "camelCase")]
            pub struct SolverNodalLoad {
                pub node_id: usize,
                pub fx: $force,
            }
            aliases {
                fz: $force => "fz", fy => "fy", required;
                my: $moment => "my", mz => "mz", required;
            }
        }
    };
}

macro_rules! point_load {
    ($length:ty, $force:ty, $moment:ty) => {
        $crate::types::model_aliases::aliased_input! {
            #[serde(rename_all = "camelCase")]
            pub struct SolverPointLoadOnElement {
                pub element_id: usize,
                pub a: $length,
                pub p: $force,
                #[serde(default)]
                pub px: Option<$force>,
            }
            aliases {
                my: Option<$moment> => "my", mz => "mz", defaulted;
            }
        }
    };
}

macro_rules! support {
    ($length:ty, $angle:ty, $translation_stiffness:ty, $rotation_stiffness:ty) => {
        $crate::types::model_aliases::aliased_input! {
            #[serde(rename_all = "camelCase")]
            pub struct SolverSupport {
                pub id: usize,
                pub node_id: usize,
                #[serde(rename = "type")]
                pub support_type: String,
                #[serde(default)]
                pub kx: Option<$translation_stiffness>,
                #[serde(default)]
                pub ky: Option<$translation_stiffness>,
                #[serde(default)]
                pub kz: Option<$rotation_stiffness>,
                #[serde(default)]
                pub dx: Option<$length>,
                #[serde(default)]
                pub angle: Option<$angle>,
            }
            aliases {
                dz: Option<$length> => "dz", dy => "dy", defaulted;
                dry: Option<$angle> => "dry", drz => "drz", defaulted;
            }
        }
    };
}

pub(super) use {aliased_input, nodal_load, node, point_load, support};
