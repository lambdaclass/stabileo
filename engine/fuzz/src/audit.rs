//! A serde `Serializer` that walks any result and records the path of every
//! non-finite `f32`/`f64`. `serde_json` writes NaN and ±∞ as `null`, so the
//! check has to see the values before they become JSON.

use serde::ser::{self, Serialize};
use std::fmt;

/// Paths (`$.results.displacements[3].ux`) of the non-finite floats in `value`.
pub fn non_finite_paths<T: Serialize + ?Sized>(value: &T) -> Vec<String> {
    let mut a = Audit { path: vec!["$".to_string()], bad: Vec::new() };
    // Serialization errors (e.g. non-string map keys) only stop the walk.
    let _ = value.serialize(&mut a);
    a.bad
}

struct Audit {
    path: Vec<String>,
    bad: Vec<String>,
}

#[derive(Debug)]
pub struct Error(String);

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for Error {}

impl ser::Error for Error {
    fn custom<T: fmt::Display>(msg: T) -> Self {
        Error(msg.to_string())
    }
}

impl Audit {
    fn float(&mut self, x: f64) {
        if !x.is_finite() {
            self.bad.push(self.path.concat());
        }
    }

    fn nested<T: Serialize + ?Sized>(&mut self, seg: String, v: &T) -> Result<(), Error> {
        self.path.push(seg);
        let r = v.serialize(&mut *self);
        self.path.pop();
        r
    }
}

type R = Result<(), Error>;

impl<'a> ser::Serializer for &'a mut Audit {
    type Ok = ();
    type Error = Error;
    type SerializeSeq = Seq<'a>;
    type SerializeTuple = Seq<'a>;
    type SerializeTupleStruct = Seq<'a>;
    type SerializeTupleVariant = Seq<'a>;
    type SerializeMap = Map<'a>;
    type SerializeStruct = &'a mut Audit;
    type SerializeStructVariant = &'a mut Audit;

    fn serialize_bool(self, _: bool) -> R { Ok(()) }
    fn serialize_i8(self, _: i8) -> R { Ok(()) }
    fn serialize_i16(self, _: i16) -> R { Ok(()) }
    fn serialize_i32(self, _: i32) -> R { Ok(()) }
    fn serialize_i64(self, _: i64) -> R { Ok(()) }
    fn serialize_u8(self, _: u8) -> R { Ok(()) }
    fn serialize_u16(self, _: u16) -> R { Ok(()) }
    fn serialize_u32(self, _: u32) -> R { Ok(()) }
    fn serialize_u64(self, _: u64) -> R { Ok(()) }
    fn serialize_f32(self, v: f32) -> R {
        self.float(v as f64);
        Ok(())
    }
    fn serialize_f64(self, v: f64) -> R {
        self.float(v);
        Ok(())
    }
    fn serialize_char(self, _: char) -> R { Ok(()) }
    fn serialize_str(self, _: &str) -> R { Ok(()) }
    fn serialize_bytes(self, _: &[u8]) -> R { Ok(()) }
    fn serialize_none(self) -> R { Ok(()) }
    fn serialize_some<T: Serialize + ?Sized>(self, v: &T) -> R { v.serialize(self) }
    fn serialize_unit(self) -> R { Ok(()) }
    fn serialize_unit_struct(self, _: &'static str) -> R { Ok(()) }
    fn serialize_unit_variant(self, _: &'static str, _: u32, _: &'static str) -> R { Ok(()) }
    fn serialize_newtype_struct<T: Serialize + ?Sized>(self, _: &'static str, v: &T) -> R {
        v.serialize(self)
    }
    fn serialize_newtype_variant<T: Serialize + ?Sized>(
        self,
        _: &'static str,
        _: u32,
        variant: &'static str,
        v: &T,
    ) -> R {
        self.nested(format!(".{variant}"), v)
    }
    fn serialize_seq(self, _: Option<usize>) -> Result<Seq<'a>, Error> {
        Ok(Seq { a: self, i: 0 })
    }
    fn serialize_tuple(self, _: usize) -> Result<Seq<'a>, Error> {
        Ok(Seq { a: self, i: 0 })
    }
    fn serialize_tuple_struct(self, _: &'static str, _: usize) -> Result<Seq<'a>, Error> {
        Ok(Seq { a: self, i: 0 })
    }
    fn serialize_tuple_variant(self, _: &'static str, _: u32, _: &'static str, _: usize) -> Result<Seq<'a>, Error> {
        Ok(Seq { a: self, i: 0 })
    }
    fn serialize_map(self, _: Option<usize>) -> Result<Map<'a>, Error> {
        Ok(Map { a: self, key: String::new() })
    }
    fn serialize_struct(self, _: &'static str, _: usize) -> Result<&'a mut Audit, Error> {
        Ok(self)
    }
    fn serialize_struct_variant(
        self,
        _: &'static str,
        _: u32,
        _: &'static str,
        _: usize,
    ) -> Result<&'a mut Audit, Error> {
        Ok(self)
    }
}

pub struct Seq<'a> {
    a: &'a mut Audit,
    i: usize,
}

impl Seq<'_> {
    fn elem<T: Serialize + ?Sized>(&mut self, v: &T) -> R {
        let seg = format!("[{}]", self.i);
        self.i += 1;
        self.a.nested(seg, v)
    }
}

impl ser::SerializeSeq for Seq<'_> {
    type Ok = ();
    type Error = Error;
    fn serialize_element<T: Serialize + ?Sized>(&mut self, v: &T) -> R { self.elem(v) }
    fn end(self) -> R { Ok(()) }
}

impl ser::SerializeTuple for Seq<'_> {
    type Ok = ();
    type Error = Error;
    fn serialize_element<T: Serialize + ?Sized>(&mut self, v: &T) -> R { self.elem(v) }
    fn end(self) -> R { Ok(()) }
}

impl ser::SerializeTupleStruct for Seq<'_> {
    type Ok = ();
    type Error = Error;
    fn serialize_field<T: Serialize + ?Sized>(&mut self, v: &T) -> R { self.elem(v) }
    fn end(self) -> R { Ok(()) }
}

impl ser::SerializeTupleVariant for Seq<'_> {
    type Ok = ();
    type Error = Error;
    fn serialize_field<T: Serialize + ?Sized>(&mut self, v: &T) -> R { self.elem(v) }
    fn end(self) -> R { Ok(()) }
}

pub struct Map<'a> {
    a: &'a mut Audit,
    key: String,
}

impl ser::SerializeMap for Map<'_> {
    type Ok = ();
    type Error = Error;
    fn serialize_key<T: Serialize + ?Sized>(&mut self, k: &T) -> R {
        self.key = serde_json::to_value(k)
            .map(|v| v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string()))
            .unwrap_or_default();
        Ok(())
    }
    fn serialize_value<T: Serialize + ?Sized>(&mut self, v: &T) -> R {
        let seg = format!("[{:?}]", self.key);
        self.a.nested(seg, v)
    }
    fn end(self) -> R { Ok(()) }
}

impl ser::SerializeStruct for &mut Audit {
    type Ok = ();
    type Error = Error;
    fn serialize_field<T: Serialize + ?Sized>(&mut self, key: &'static str, v: &T) -> R {
        self.nested(format!(".{key}"), v)
    }
    fn end(self) -> R { Ok(()) }
}

impl ser::SerializeStructVariant for &mut Audit {
    type Ok = ();
    type Error = Error;
    fn serialize_field<T: Serialize + ?Sized>(&mut self, key: &'static str, v: &T) -> R {
        self.nested(format!(".{key}"), v)
    }
    fn end(self) -> R { Ok(()) }
}
