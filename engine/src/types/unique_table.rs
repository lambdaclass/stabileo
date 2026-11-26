use serde::de::{self, Deserializer, MapAccess, Visitor};
use serde::Deserialize;
use std::collections::{hash_map::Entry, HashMap};
use std::fmt;
use std::hash::Hash;
use std::marker::PhantomData;

struct Table<'a, K, V> {
    field: &'a str,
    entries: PhantomData<(K, V)>,
}

impl<'a, K, V> Table<'a, K, V> {
    fn new(field: &'a str) -> Self {
        Self {
            field,
            entries: PhantomData,
        }
    }
}

impl<'de, K, V> Visitor<'de> for Table<'_, K, V>
where
    K: Deserialize<'de> + Eq + Hash,
    V: Deserialize<'de>,
{
    type Value = HashMap<K, V>;

    fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "a map of {} with unique keys", self.field)
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
        let mut entries = HashMap::new();
        while let Some(key) = map.next_key()? {
            match entries.entry(key) {
                Entry::Vacant(entry) => {
                    entry.insert(map.next_value()?);
                }
                Entry::Occupied(_) => {
                    return Err(de::Error::custom(format_args!(
                        "duplicate key in field `{}`",
                        self.field
                    )));
                }
            }
        }
        Ok(entries)
    }
}

pub(super) fn is_empty<'de, A: MapAccess<'de>>(map: A, field: &str) -> Result<bool, A::Error> {
    Table::<String, de::IgnoredAny>::new(field).visit_map(map).map(|entries| entries.is_empty())
}

struct OptionalTable<V>(Table<'static, String, V>);

impl<'de, V: Deserialize<'de>> Visitor<'de> for OptionalTable<V> {
    type Value = Option<HashMap<String, V>>;

    fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.expecting(f)
    }

    fn visit_none<E: de::Error>(self) -> Result<Self::Value, E> {
        Ok(None)
    }

    fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
        Ok(None)
    }

    fn visit_some<D: Deserializer<'de>>(self, deserializer: D) -> Result<Self::Value, D::Error> {
        deserializer.deserialize_map(self.0).map(Some)
    }
}

macro_rules! tables {
    ($($name:ident => $field:literal),+ $(,)?) => {
        $(
            pub(crate) fn $name<'de, D: Deserializer<'de>, V: Deserialize<'de>>(
                deserializer: D,
            ) -> Result<HashMap<String, V>, D::Error> {
                deserializer.deserialize_map(Table::new($field))
            }
        )+
    };
}

tables! {
    nodes => "nodes",
    materials => "materials",
    sections => "sections",
    elements => "elements",
    supports => "supports",
    connectors => "connectors",
    plates => "plates",
    quads => "quads",
    quad9s => "quad9s",
    solid_shells => "solidShells",
    curved_shells => "curvedShells",
    factors => "factors",
    densities => "densities",
    pretension => "pretension",
    material_models => "materialModels",
    section_capacities => "sectionCapacities",
    residual_stresses => "residualStresses",
    initial_displacements => "initialDisplacements",
    element_behaviors => "elementBehaviors",
    creep_params => "creepParams",
    fiber_sections => "fiberSections",
    mp => "mp",
    np => "np",
}

pub(crate) fn mp_overrides<'de, D: Deserializer<'de>, V: Deserialize<'de>>(
    deserializer: D,
) -> Result<Option<HashMap<String, V>>, D::Error> {
    deserializer.deserialize_option(OptionalTable(Table::new("mpOverrides")))
}

pub(crate) fn modular_ratios<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<HashMap<usize, f64>, D::Error> {
    deserializer.deserialize_map(Table::new("modularRatios"))
}
