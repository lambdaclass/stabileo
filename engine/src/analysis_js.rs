use web_sys::js_sys::{try_iter, Array, Object, Reflect, Set, Symbol};
use serde::de::value::{MapDeserializer, SeqDeserializer};
use serde::de::{self, Deserializer, IntoDeserializer, Visitor};
use serde_wasm_bindgen::Error;
use wasm_bindgen::{JsCast, JsValue};

pub(crate) struct AnalysisJs(pub(crate) JsValue);

impl<'de> IntoDeserializer<'de, Error> for AnalysisJs {
    type Deserializer = Self;

    fn into_deserializer(self) -> Self {
        self
    }
}

impl<'de> Deserializer<'de> for AnalysisJs {
    type Error = Error;

    fn deserialize_any<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, Error> {
        if Array::is_array(&self.0) {
            self.deserialize_seq(visitor)
        } else if self.0.is_object() {
            self.deserialize_map(visitor)
        } else {
            serde_wasm_bindgen::Deserializer::from(self.0).deserialize_any(visitor)
        }
    }

    fn deserialize_map<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, Error> {
        const EXPECTED_MAP: &str = "expected a map record or an iterable of map entry pairs";
        if !self.0.is_object() {
            return Err(de::Error::custom(EXPECTED_MAP));
        }

        let Some(iter) = try_iter(&self.0)? else {
            let prototype = Reflect::get_prototype_of(&self.0)?;
            if Reflect::has(&self.0, Symbol::iterator().as_ref())?
                || (!prototype.is_null() && !Reflect::get_prototype_of(prototype.as_ref())?.is_null())
            {
                return Err(de::Error::custom(EXPECTED_MAP));
            }
            let entries = Object::entries(self.0.unchecked_ref());
            return visitor.visit_map(MapDeserializer::new(entries.iter().map(|entry| {
                let pair = entry.unchecked_into::<Array>();
                (AnalysisJs(pair.get(0)), AnalysisJs(pair.get(1)))
            })));
        };

        let seen = Set::new(&JsValue::UNDEFINED);
        let mut entries = Vec::new();
        for entry in iter {
            let entry = entry?;
            let Some(pair) = entry.dyn_ref::<Array>() else {
                return Err(de::Error::custom("expected a map entry pair"));
            };
            if pair.length() != 2 {
                return Err(de::Error::custom("expected a map entry pair with exactly two values"));
            }
            let key = pair.get(0);
            if seen.has(&key) {
                return Err(de::Error::custom("duplicate map entry key"));
            }
            seen.add(&key);
            entries.push((AnalysisJs(key), AnalysisJs(pair.get(1))));
        }
        visitor.visit_map(MapDeserializer::new(entries.into_iter()))
    }

    fn deserialize_struct<V: Visitor<'de>>(
        self, name: &'static str, _fields: &'static [&'static str], visitor: V,
    ) -> Result<V::Value, Error> {
        if !self.0.is_object() || Array::is_array(&self.0) {
            return Err(de::Error::custom(format_args!("expected named record `{name}` as a map")));
        }
        self.deserialize_map(visitor)
    }

    fn deserialize_seq<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, Error> {
        if let Some(array) = self.0.dyn_ref::<Array>() {
            SeqDeserializer::new(array.iter().map(AnalysisJs)).deserialize_seq(visitor)
        } else {
            serde_wasm_bindgen::Deserializer::from(self.0).deserialize_seq(visitor)
        }
    }

    fn deserialize_tuple<V: Visitor<'de>>(self, len: usize, visitor: V) -> Result<V::Value, Error> {
        if Array::is_array(&self.0) || !self.0.is_object() {
            return self.deserialize_seq(visitor);
        }
        let Some(iter) = try_iter(&self.0)? else {
            return self.deserialize_seq(visitor);
        };
        let items = iter.take(len.saturating_add(1)).map(|item| item.map(AnalysisJs))
            .collect::<Result<Vec<_>, _>>()?;
        SeqDeserializer::new(items.into_iter()).deserialize_seq(visitor)
    }

    fn deserialize_tuple_struct<V: Visitor<'de>>(
        self, _name: &'static str, len: usize, visitor: V,
    ) -> Result<V::Value, Error> {
        self.deserialize_tuple(len, visitor)
    }

    fn deserialize_option<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, Error> {
        if self.0.is_null() || self.0.is_undefined() {
            visitor.visit_none()
        } else {
            visitor.visit_some(self)
        }
    }

    fn deserialize_newtype_struct<V: Visitor<'de>>(self, _name: &'static str, visitor: V) -> Result<V::Value, Error> {
        visitor.visit_newtype_struct(self)
    }

    fn deserialize_enum<V: Visitor<'de>>(
        self, name: &'static str, variants: &'static [&'static str], visitor: V,
    ) -> Result<V::Value, Error> {
        serde_wasm_bindgen::Deserializer::from(self.0).deserialize_enum(name, variants, visitor)
    }

    fn deserialize_f64<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, Error> {
        serde_wasm_bindgen::Deserializer::from(self.0).deserialize_f64(visitor)
    }

    fn deserialize_f32<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, Error> {
        serde_wasm_bindgen::Deserializer::from(self.0).deserialize_f32(visitor)
    }

    serde::forward_to_deserialize_any! {
        bool i8 i16 i32 i64 i128 u8 u16 u32 u64 u128 char str string bytes byte_buf unit
        unit_struct identifier
    }

    fn deserialize_ignored_any<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, Error> {
        visitor.visit_unit()
    }
}

pub(crate) fn deserialize<T: de::DeserializeOwned>(value: JsValue) -> Result<T, Error> {
    T::deserialize(AnalysisJs(value))
}
