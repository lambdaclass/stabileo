macro_rules! producer_row {
    (material $($record:tt)*) => {
        producer_row!(@row "SolverMaterial", [name, fc, fy, fu, rho], $($record)*);
    };
    (section_2d $($record:tt)*) => {
        producer_row!(@row "SolverSection", [name, iy, j, b, h, rotation], $($record)*);
    };
    (section_3d $($record:tt)*) => {
        producer_row!(@row "SolverSection3D", [b, h, rotation], $($record)*);
    };
    (support_3d $($record:tt)*) => {
        producer_row!(@row "SolverSupport3D", [id, r#type, stabilised, stabilised_axes], $($record)*);
    };
    (
        @row $label:literal, [$($metadata:ident),+],
        $(#[$derive:meta])*
        pub struct $name:ident {
            $($(#[$attr:meta])* pub $field:ident: $type:ty,)+
        }
    ) => {
        $(#[$derive])*
        pub struct $name {
            $($(#[$attr])* pub $field: $type,)+
        }

        impl<'de> serde::Deserialize<'de> for $name {
            fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
                use serde::de::{self, value};

                struct Row;

                impl<'de> de::Visitor<'de> for Row {
                    type Value = $name;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        formatter.write_str(concat!("struct ", $label))
                    }

                    fn visit_map<A: de::MapAccess<'de>>(self, map: A) -> Result<Self::Value, A::Error> {
                        #[derive(serde::Deserialize)]
                        #[serde(rename = $label, rename_all = "camelCase", deny_unknown_fields)]
                        struct Named {
                            $($(#[$attr])* $field: $type,)+
                            $(
                                #[allow(dead_code)]
                                #[serde(default)]
                                $metadata: Option<de::IgnoredAny>,
                            )+
                        }

                        let row = Named::deserialize(value::MapAccessDeserializer::new(map))?;
                        Ok($name { $($field: row.$field,)+ })
                    }

                    fn visit_seq<A: de::SeqAccess<'de>>(self, seq: A) -> Result<Self::Value, A::Error> {
                        #[derive(serde::Deserialize)]
                        #[serde(rename = $label, rename_all = "camelCase", deny_unknown_fields)]
                        struct Positional {
                            $($(#[$attr])* $field: $type,)+
                        }

                        let row = Positional::deserialize(value::SeqAccessDeserializer::new(seq))?;
                        Ok($name { $($field: row.$field,)+ })
                    }
                }

                deserializer.deserialize_struct($label, &[$(stringify!($field)),+], Row)
            }
        }
    };
}

pub(super) use producer_row;
