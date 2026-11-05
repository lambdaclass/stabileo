//! The engine's results leave through here: a NaN or ±∞ anywhere in a result refuses the whole
//! result with a `non_finite_result` diagnostic instead of reaching the caller as a number, or as
//! the `null` serde_json would silently write for it. A field that means "unbounded" says so with
//! [`crate::check::ser_ratio`], which writes +∞ as null on purpose.

use crate::types::{DiagnosticCode, Severity, StructuredDiagnostic};
use serde::ser::{self, Serialize};
use std::fmt;

#[derive(Debug, Clone, PartialEq)]
pub struct NonFinite {
    pub path: String,
    pub value: f64,
}

impl NonFinite {
    pub fn diagnostic(&self) -> StructuredDiagnostic {
        StructuredDiagnostic::global(
            DiagnosticCode::NonFiniteResult,
            Severity::Error,
            format!("The result was withheld: it contains {} at {}", self.value, self.path),
        )
        .with_phase(self.path.clone())
    }

    /// The error text an export returns: the shape of a known-issue refusal.
    pub fn refusal(&self) -> String {
        let d = self.diagnostic();
        serde_json::json!({ "message": d.message, "structuredDiagnostics": [d] }).to_string()
    }
}

/// The first non-finite number in `value` in serialization order, with its path.
pub fn find_non_finite<T: Serialize + ?Sized>(value: &T) -> Result<Option<NonFinite>, String> {
    let mut w = Walker { path: Vec::new() };
    match value.serialize(&mut w) {
        Ok(()) => Ok(None),
        Err(Stop::NonFinite(nf)) => Ok(Some(nf)),
        Err(Stop::Custom(e)) => Err(format!("Serialize error: {e}")),
    }
}

/// `Err` with the refusal text when `value` holds a non-finite number.
pub fn require_finite<T: Serialize + ?Sized>(value: &T) -> Result<(), String> {
    match find_non_finite(value)? {
        None => Ok(()),
        Some(nf) => Err(nf.refusal()),
    }
}

pub fn to_json<T: Serialize + ?Sized>(value: &T) -> Result<String, String> {
    require_finite(value)?;
    serde_json::to_string(value).map_err(|e| format!("Serialize error: {e}"))
}

pub fn finite_scalar(value: f64, what: &str) -> Result<f64, String> {
    if value.is_finite() { Ok(value) } else { Err(NonFinite { path: what.to_string(), value }.refusal()) }
}

#[derive(Debug)]
enum Stop {
    NonFinite(NonFinite),
    Custom(String),
}

impl fmt::Display for Stop {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Stop::NonFinite(nf) => write!(f, "{} at {}", nf.value, nf.path),
            Stop::Custom(e) => f.write_str(e),
        }
    }
}

impl std::error::Error for Stop {}

impl ser::Error for Stop {
    fn custom<T: fmt::Display>(msg: T) -> Self {
        Stop::Custom(msg.to_string())
    }
}

struct Walker {
    path: Vec<String>,
}

impl Walker {
    fn here(&self) -> String {
        let mut s = String::new();
        for p in &self.path {
            if !s.is_empty() && !p.starts_with('[') {
                s.push('.');
            }
            s.push_str(p);
        }
        if s.is_empty() { "the result".into() } else { s }
    }

    fn float(&self, v: f64) -> Result<(), Stop> {
        if v.is_finite() { Ok(()) } else { Err(Stop::NonFinite(NonFinite { path: self.here(), value: v })) }
    }

    fn within<T: Serialize + ?Sized>(&mut self, segment: String, value: &T) -> Result<(), Stop> {
        self.path.push(segment);
        let r = value.serialize(&mut *self).map_err(|e| match e {
            Stop::Custom(msg) => match msg.strip_prefix(crate::check::NON_FINITE).and_then(|v| v.parse().ok()) {
                Some(value) => Stop::NonFinite(NonFinite { path: self.here(), value }),
                None => Stop::Custom(msg),
            },
            e => e,
        });
        self.path.pop();
        r
    }
}

fn key_text<T: Serialize + ?Sized>(key: &T) -> String {
    match serde_json::to_value(key) {
        Ok(serde_json::Value::String(s)) => s,
        Ok(v) => v.to_string(),
        Err(_) => "?".into(),
    }
}

struct Compound<'a> {
    w: &'a mut Walker,
    index: usize,
    key: Option<String>,
    variant: bool,
}

impl<'a> Compound<'a> {
    fn new(w: &'a mut Walker, variant: Option<&'static str>) -> Self {
        if let Some(v) = variant {
            w.path.push(v.to_string());
        }
        Compound { w, index: 0, key: None, variant: variant.is_some() }
    }

    fn element<T: Serialize + ?Sized>(&mut self, value: &T) -> Result<(), Stop> {
        let i = self.index;
        self.index += 1;
        self.w.within(format!("[{i}]"), value)
    }

    fn done(self) -> Result<(), Stop> {
        if self.variant {
            self.w.path.pop();
        }
        Ok(())
    }
}

impl ser::SerializeSeq for Compound<'_> {
    type Ok = ();
    type Error = Stop;
    fn serialize_element<T: Serialize + ?Sized>(&mut self, value: &T) -> Result<(), Stop> {
        self.element(value)
    }
    fn end(self) -> Result<(), Stop> {
        self.done()
    }
}

impl ser::SerializeTuple for Compound<'_> {
    type Ok = ();
    type Error = Stop;
    fn serialize_element<T: Serialize + ?Sized>(&mut self, value: &T) -> Result<(), Stop> {
        self.element(value)
    }
    fn end(self) -> Result<(), Stop> {
        self.done()
    }
}

impl ser::SerializeTupleStruct for Compound<'_> {
    type Ok = ();
    type Error = Stop;
    fn serialize_field<T: Serialize + ?Sized>(&mut self, value: &T) -> Result<(), Stop> {
        self.element(value)
    }
    fn end(self) -> Result<(), Stop> {
        self.done()
    }
}

impl ser::SerializeTupleVariant for Compound<'_> {
    type Ok = ();
    type Error = Stop;
    fn serialize_field<T: Serialize + ?Sized>(&mut self, value: &T) -> Result<(), Stop> {
        self.element(value)
    }
    fn end(self) -> Result<(), Stop> {
        self.done()
    }
}

impl ser::SerializeMap for Compound<'_> {
    type Ok = ();
    type Error = Stop;
    fn serialize_key<T: Serialize + ?Sized>(&mut self, key: &T) -> Result<(), Stop> {
        self.key = Some(key_text(key));
        key.serialize(&mut *self.w)
    }
    fn serialize_value<T: Serialize + ?Sized>(&mut self, value: &T) -> Result<(), Stop> {
        let k = self.key.take().unwrap_or_else(|| "?".into());
        self.w.within(k, value)
    }
    fn end(self) -> Result<(), Stop> {
        self.done()
    }
}

impl ser::SerializeStruct for Compound<'_> {
    type Ok = ();
    type Error = Stop;
    fn serialize_field<T: Serialize + ?Sized>(&mut self, key: &'static str, value: &T) -> Result<(), Stop> {
        self.w.within(key.to_string(), value)
    }
    fn end(self) -> Result<(), Stop> {
        self.done()
    }
}

impl ser::SerializeStructVariant for Compound<'_> {
    type Ok = ();
    type Error = Stop;
    fn serialize_field<T: Serialize + ?Sized>(&mut self, key: &'static str, value: &T) -> Result<(), Stop> {
        self.w.within(key.to_string(), value)
    }
    fn end(self) -> Result<(), Stop> {
        self.done()
    }
}

impl<'a> ser::Serializer for &'a mut Walker {
    type Ok = ();
    type Error = Stop;
    type SerializeSeq = Compound<'a>;
    type SerializeTuple = Compound<'a>;
    type SerializeTupleStruct = Compound<'a>;
    type SerializeTupleVariant = Compound<'a>;
    type SerializeMap = Compound<'a>;
    type SerializeStruct = Compound<'a>;
    type SerializeStructVariant = Compound<'a>;

    fn serialize_bool(self, _: bool) -> Result<(), Stop> {
        Ok(())
    }
    fn serialize_i8(self, _: i8) -> Result<(), Stop> {
        Ok(())
    }
    fn serialize_i16(self, _: i16) -> Result<(), Stop> {
        Ok(())
    }
    fn serialize_i32(self, _: i32) -> Result<(), Stop> {
        Ok(())
    }
    fn serialize_i64(self, _: i64) -> Result<(), Stop> {
        Ok(())
    }
    fn serialize_i128(self, _: i128) -> Result<(), Stop> {
        Ok(())
    }
    fn serialize_u8(self, _: u8) -> Result<(), Stop> {
        Ok(())
    }
    fn serialize_u16(self, _: u16) -> Result<(), Stop> {
        Ok(())
    }
    fn serialize_u32(self, _: u32) -> Result<(), Stop> {
        Ok(())
    }
    fn serialize_u64(self, _: u64) -> Result<(), Stop> {
        Ok(())
    }
    fn serialize_u128(self, _: u128) -> Result<(), Stop> {
        Ok(())
    }
    fn serialize_f32(self, v: f32) -> Result<(), Stop> {
        self.float(v as f64)
    }
    fn serialize_f64(self, v: f64) -> Result<(), Stop> {
        self.float(v)
    }
    fn serialize_char(self, _: char) -> Result<(), Stop> {
        Ok(())
    }
    fn serialize_str(self, _: &str) -> Result<(), Stop> {
        Ok(())
    }
    fn serialize_bytes(self, _: &[u8]) -> Result<(), Stop> {
        Ok(())
    }
    fn serialize_none(self) -> Result<(), Stop> {
        Ok(())
    }
    fn serialize_some<T: Serialize + ?Sized>(self, value: &T) -> Result<(), Stop> {
        value.serialize(self)
    }
    fn serialize_unit(self) -> Result<(), Stop> {
        Ok(())
    }
    fn serialize_unit_struct(self, _: &'static str) -> Result<(), Stop> {
        Ok(())
    }
    fn serialize_unit_variant(self, _: &'static str, _: u32, _: &'static str) -> Result<(), Stop> {
        Ok(())
    }
    fn serialize_newtype_struct<T: Serialize + ?Sized>(self, _: &'static str, value: &T) -> Result<(), Stop> {
        value.serialize(self)
    }
    fn serialize_newtype_variant<T: Serialize + ?Sized>(self, _: &'static str, _: u32, variant: &'static str, value: &T) -> Result<(), Stop> {
        self.within(variant.to_string(), value)
    }
    fn serialize_seq(self, _: Option<usize>) -> Result<Compound<'a>, Stop> {
        Ok(Compound::new(self, None))
    }
    fn serialize_tuple(self, _: usize) -> Result<Compound<'a>, Stop> {
        Ok(Compound::new(self, None))
    }
    fn serialize_tuple_struct(self, _: &'static str, _: usize) -> Result<Compound<'a>, Stop> {
        Ok(Compound::new(self, None))
    }
    fn serialize_tuple_variant(self, _: &'static str, _: u32, variant: &'static str, _: usize) -> Result<Compound<'a>, Stop> {
        Ok(Compound::new(self, Some(variant)))
    }
    fn serialize_map(self, _: Option<usize>) -> Result<Compound<'a>, Stop> {
        Ok(Compound::new(self, None))
    }
    fn serialize_struct(self, _: &'static str, _: usize) -> Result<Compound<'a>, Stop> {
        Ok(Compound::new(self, None))
    }
    fn serialize_struct_variant(self, _: &'static str, _: u32, variant: &'static str, _: usize) -> Result<Compound<'a>, Stop> {
        Ok(Compound::new(self, Some(variant)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Serialize;
    use std::collections::BTreeMap;

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Disp {
        node_id: usize,
        ux: f64,
    }

    #[derive(Serialize)]
    struct Out {
        displacements: Vec<Disp>,
        extra: Option<f64>,
        by_case: BTreeMap<String, [f64; 2]>,
        #[serde(serialize_with = "crate::check::ser_ratio")]
        unbounded: f64,
    }

    fn out() -> Out {
        Out {
            displacements: vec![Disp { node_id: 1, ux: 0.0 }, Disp { node_id: 2, ux: 1.5 }],
            extra: Some(2.0),
            by_case: BTreeMap::from([("dead".to_string(), [1.0, 2.0])]),
            unbounded: f64::INFINITY,
        }
    }

    #[test]
    fn a_finite_result_serializes_as_before() {
        let o = out();
        assert_eq!(to_json(&o).unwrap(), serde_json::to_string(&o).unwrap());
        assert!(to_json(&o).unwrap().contains("\"unbounded\":null"));
    }

    #[test]
    fn nan_in_a_nested_field_is_refused_with_its_path() {
        let mut o = out();
        o.displacements[1].ux = f64::NAN;
        let nf = find_non_finite(&o).unwrap().unwrap();
        assert_eq!(nf.path, "displacements[1].ux");
        assert!(nf.value.is_nan());
        let e = to_json(&o).unwrap_err();
        let v: serde_json::Value = serde_json::from_str(&e).unwrap();
        assert_eq!(v["structuredDiagnostics"][0]["code"], "non_finite_result");
        assert_eq!(v["structuredDiagnostics"][0]["severity"], "error");
        assert_eq!(v["structuredDiagnostics"][0]["phase"], "displacements[1].ux");
    }

    #[test]
    fn infinity_in_an_option_or_a_map_is_refused() {
        let mut o = out();
        o.extra = Some(f64::NEG_INFINITY);
        assert_eq!(find_non_finite(&o).unwrap().unwrap().path, "extra");
        let mut o = out();
        o.by_case.get_mut("dead").unwrap()[1] = f64::INFINITY;
        assert_eq!(find_non_finite(&o).unwrap().unwrap().path, "by_case.dead[1]");
    }

    #[test]
    fn ser_ratio_refuses_nan_and_negative_infinity_with_the_field_path() {
        for bad in [f64::NAN, f64::NEG_INFINITY] {
            let mut o = out();
            o.unbounded = bad;
            let nf = find_non_finite(&o).unwrap().unwrap();
            assert_eq!(nf.path, "unbounded");
            assert!(if bad.is_nan() { nf.value.is_nan() } else { nf.value == bad }, "{}", nf.value);
            let v: serde_json::Value = serde_json::from_str(&to_json(&o).unwrap_err()).unwrap();
            assert_eq!(v["structuredDiagnostics"][0]["code"], "non_finite_result");
            assert_eq!(v["structuredDiagnostics"][0]["phase"], "unbounded");
        }
    }

    #[test]
    fn a_scalar_is_refused_when_not_finite() {
        assert_eq!(finite_scalar(2.0, "M").unwrap(), 2.0);
        assert!(finite_scalar(f64::NAN, "M").unwrap_err().contains("non_finite_result"));
    }
}
