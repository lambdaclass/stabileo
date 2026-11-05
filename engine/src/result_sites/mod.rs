mod keys;

pub use keys::{DIAGNOSTIC_KEYS, MAP_KEYS, OPAQUE_KEYS, RECORD_KEYS};

use serde::ser::{self, Serialize};
use serde_json::{json, Value};

use crate::types::StructuredDiagnostic;

const RECORD: u8 = 1;
const MAP: u8 = 2;
const COLLECT: u8 = 4;
const SCAN: u8 = 8;

#[derive(Debug, Default)]
pub struct Found {
    pub all: Vec<Value>,
    pub root: Vec<Value>,
}

impl Found {
    pub fn refused(&self) -> bool {
        self.all.iter().any(|d| d["severity"] == "error")
    }
}

pub fn diagnostics_of(values: &[Value]) -> Vec<StructuredDiagnostic> {
    values.iter().filter_map(|v| serde_json::from_value(v.clone()).ok()).collect()
}

pub fn known_issues<T: Serialize + ?Sized>(value: &T) -> Vec<StructuredDiagnostic> {
    diagnostics_of(&walk(value).all)
}

fn is_known_issue(v: &Value) -> bool {
    v.get("code").and_then(Value::as_str) == Some("known_issue") && v.get("message").is_some_and(Value::is_string)
}

fn collect(v: &Value, root: bool, found: &mut Found) {
    match v {
        Value::Array(items) => items.iter().for_each(|i| collect(i, root, found)),
        Value::Object(_) if is_known_issue(v) => {
            found.all.push(v.clone());
            if root {
                found.root.push(v.clone());
            }
        }
        _ => {}
    }
}

fn scan(v: &Value, found: &mut Found) {
    match v {
        Value::Array(items) => items.iter().for_each(|i| scan(i, found)),
        Value::Object(o) => {
            if is_known_issue(v) {
                found.all.push(v.clone());
            }
            o.values().for_each(|i| scan(i, found));
        }
        _ => {}
    }
}

fn key_mode(key: &str) -> u8 {
    let mut mode = 0;
    if RECORD_KEYS.contains(&key) { mode |= RECORD }
    if MAP_KEYS.contains(&key) { mode |= MAP }
    if DIAGNOSTIC_KEYS.contains(&key) { mode |= COLLECT }
    if OPAQUE_KEYS.contains(&key) { mode |= SCAN }
    mode
}

/// Walk `value` as the web walker walks its JSON: from the root record, through the generated keys.
pub fn walk<T: Serialize + ?Sized>(value: &T) -> Found {
    let mut found = Found::default();
    let _ = value.serialize(Walk { found: &mut found, mode: RECORD, root: true });
    found
}

pub enum Outgoing {
    Unchanged,
    /// The value, with every refusal found below its root also listed in its own
    /// `structuredDiagnostics`, so a caller that reads only the root still sees it.
    Lifted(Value),
    /// A refusal found in a value with no root record to list it in.
    Refused(String),
}

fn same_issue(a: &Value, b: &Value) -> bool {
    a["severity"] == b["severity"] && a["phase"] == b["phase"] && a["message"] == b["message"]
}

pub fn contain<T: Serialize + ?Sized>(value: &T) -> Outgoing {
    let found = walk(value);
    let mut missing: Vec<Value> = vec![];
    for d in found.all.iter().filter(|d| d["severity"] == "error") {
        if !found.root.iter().chain(missing.iter()).any(|r| same_issue(r, d)) {
            missing.push(d.clone());
        }
    }
    if missing.is_empty() {
        return Outgoing::Unchanged;
    }
    let refusal = |missing: Vec<Value>| Outgoing::Refused(json!({ "message": missing[0]["message"], "structuredDiagnostics": missing }).to_string());
    let Ok(mut lifted) = serde_json::to_value(value) else { return refusal(missing) };
    let Some(root) = lifted.as_object_mut() else { return refusal(missing) };
    match root.entry("structuredDiagnostics").or_insert_with(|| json!([])).as_array_mut() {
        Some(list) => list.extend(missing),
        None => return refusal(missing),
    }
    Outgoing::Lifted(lifted)
}

#[derive(Debug)]
pub struct Stop;

impl std::fmt::Display for Stop {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("result walk")
    }
}

impl std::error::Error for Stop {}

impl ser::Error for Stop {
    fn custom<M: std::fmt::Display>(_: M) -> Self {
        Stop
    }
}

type R = Result<(), Stop>;

struct Walk<'a> {
    found: &'a mut Found,
    mode: u8,
    root: bool,
}

impl<'a> Walk<'a> {
    fn child(&mut self, mode: u8) -> Walk<'_> {
        Walk { found: self.found, mode, root: false }
    }

    fn field<T: Serialize + ?Sized>(&mut self, key: &str, v: &T) -> R {
        let mode = key_mode(key);
        if mode & (COLLECT | SCAN) != 0 {
            let value = serde_json::to_value(v).map_err(|_| Stop)?;
            if mode & COLLECT != 0 {
                collect(&value, self.root, self.found);
            }
            if mode & SCAN != 0 {
                scan(&value, self.found);
            }
        }
        if mode & (RECORD | MAP) != 0 {
            v.serialize(self.child(mode & (RECORD | MAP)))?;
        }
        Ok(())
    }

    fn variant<T: Serialize + ?Sized>(&mut self, variant: &str, v: &T) -> R {
        if self.mode & RECORD != 0 {
            self.field(variant, v)?;
        }
        if self.mode & MAP != 0 {
            v.serialize(self.child(RECORD))?;
        }
        Ok(())
    }

    fn variant_mode(&self, variant: &str) -> u8 {
        let mut mode = 0;
        if self.mode & RECORD != 0 {
            mode |= key_mode(variant);
        }
        if self.mode & MAP != 0 {
            mode |= RECORD;
        }
        mode
    }
}

impl<'a> ser::Serializer for Walk<'a> {
    type Ok = ();
    type Error = Stop;
    type SerializeSeq = Elements<'a>;
    type SerializeTuple = Elements<'a>;
    type SerializeTupleStruct = Elements<'a>;
    type SerializeTupleVariant = Elements<'a>;
    type SerializeMap = Entries<'a>;
    type SerializeStruct = Entries<'a>;
    type SerializeStructVariant = Entries<'a>;

    fn serialize_bool(self, _: bool) -> R { Ok(()) }
    fn serialize_i8(self, _: i8) -> R { Ok(()) }
    fn serialize_i16(self, _: i16) -> R { Ok(()) }
    fn serialize_i32(self, _: i32) -> R { Ok(()) }
    fn serialize_i64(self, _: i64) -> R { Ok(()) }
    fn serialize_u8(self, _: u8) -> R { Ok(()) }
    fn serialize_u16(self, _: u16) -> R { Ok(()) }
    fn serialize_u32(self, _: u32) -> R { Ok(()) }
    fn serialize_u64(self, _: u64) -> R { Ok(()) }
    fn serialize_f32(self, _: f32) -> R { Ok(()) }
    fn serialize_f64(self, _: f64) -> R { Ok(()) }
    fn serialize_char(self, _: char) -> R { Ok(()) }
    fn serialize_str(self, _: &str) -> R { Ok(()) }
    fn serialize_bytes(self, _: &[u8]) -> R { Ok(()) }
    fn serialize_none(self) -> R { Ok(()) }
    fn serialize_some<T: Serialize + ?Sized>(self, v: &T) -> R { v.serialize(self) }
    fn serialize_unit(self) -> R { Ok(()) }
    fn serialize_unit_struct(self, _: &'static str) -> R { Ok(()) }
    fn serialize_unit_variant(self, _: &'static str, _: u32, _: &'static str) -> R { Ok(()) }
    fn serialize_newtype_struct<T: Serialize + ?Sized>(self, _: &'static str, v: &T) -> R { v.serialize(self) }
    fn serialize_newtype_variant<T: Serialize + ?Sized>(mut self, _: &'static str, _: u32, variant: &'static str, v: &T) -> R {
        self.variant(variant, v)
    }
    fn serialize_seq(self, _: Option<usize>) -> Result<Elements<'a>, Stop> {
        Ok(Elements { found: self.found, mode: self.mode, scan: None })
    }
    fn serialize_tuple(self, len: usize) -> Result<Elements<'a>, Stop> {
        self.serialize_seq(Some(len))
    }
    fn serialize_tuple_struct(self, _: &'static str, len: usize) -> Result<Elements<'a>, Stop> {
        self.serialize_seq(Some(len))
    }
    fn serialize_tuple_variant(self, _: &'static str, _: u32, variant: &'static str, _: usize) -> Result<Elements<'a>, Stop> {
        let mode = self.variant_mode(variant);
        Ok(Elements { found: self.found, mode: mode & (RECORD | MAP), scan: (mode & (COLLECT | SCAN) != 0).then_some(mode) })
    }
    fn serialize_map(self, _: Option<usize>) -> Result<Entries<'a>, Stop> {
        Ok(Entries { found: self.found, mode: self.mode, root: self.root, key: String::new(), scan: None })
    }
    fn serialize_struct(self, _: &'static str, len: usize) -> Result<Entries<'a>, Stop> {
        self.serialize_map(Some(len))
    }
    fn serialize_struct_variant(self, _: &'static str, _: u32, variant: &'static str, _: usize) -> Result<Entries<'a>, Stop> {
        let mode = self.variant_mode(variant);
        let walk = if mode & (RECORD | MAP) != 0 { RECORD } else { 0 };
        Ok(Entries { found: self.found, mode: walk, root: false, key: String::new(), scan: (mode & (COLLECT | SCAN) != 0).then_some(mode) })
    }
}

pub struct Elements<'a> {
    found: &'a mut Found,
    mode: u8,
    scan: Option<u8>,
}

impl Elements<'_> {
    fn element<T: Serialize + ?Sized>(&mut self, v: &T) -> R {
        if let Some(mode) = self.scan {
            let value = serde_json::to_value(v).map_err(|_| Stop)?;
            if mode & COLLECT != 0 {
                collect(&value, false, self.found);
            }
            if mode & SCAN != 0 {
                scan(&value, self.found);
            }
        }
        if self.mode != 0 {
            v.serialize(Walk { found: self.found, mode: self.mode, root: false })?;
        }
        Ok(())
    }
}

impl ser::SerializeSeq for Elements<'_> {
    type Ok = ();
    type Error = Stop;
    fn serialize_element<T: Serialize + ?Sized>(&mut self, v: &T) -> R { self.element(v) }
    fn end(self) -> R { Ok(()) }
}

impl ser::SerializeTuple for Elements<'_> {
    type Ok = ();
    type Error = Stop;
    fn serialize_element<T: Serialize + ?Sized>(&mut self, v: &T) -> R { self.element(v) }
    fn end(self) -> R { Ok(()) }
}

impl ser::SerializeTupleStruct for Elements<'_> {
    type Ok = ();
    type Error = Stop;
    fn serialize_field<T: Serialize + ?Sized>(&mut self, v: &T) -> R { self.element(v) }
    fn end(self) -> R { Ok(()) }
}

impl ser::SerializeTupleVariant for Elements<'_> {
    type Ok = ();
    type Error = Stop;
    fn serialize_field<T: Serialize + ?Sized>(&mut self, v: &T) -> R { self.element(v) }
    fn end(self) -> R { Ok(()) }
}

pub struct Entries<'a> {
    found: &'a mut Found,
    mode: u8,
    root: bool,
    key: String,
    scan: Option<u8>,
}

impl Entries<'_> {
    fn entry<T: Serialize + ?Sized>(&mut self, key: &str, v: &T) -> R {
        if let Some(mode) = self.scan {
            let value = serde_json::to_value(v).map_err(|_| Stop)?;
            if mode & COLLECT != 0 {
                collect(&value, false, self.found);
            }
            if mode & SCAN != 0 {
                scan(&value, self.found);
            }
        }
        let mut walk = Walk { found: self.found, mode: self.mode, root: self.root };
        if self.mode & MAP != 0 {
            v.serialize(walk.child(RECORD))?;
        }
        if self.mode & RECORD != 0 {
            walk.field(key, v)?;
        }
        Ok(())
    }
}

impl ser::SerializeMap for Entries<'_> {
    type Ok = ();
    type Error = Stop;
    fn serialize_key<T: Serialize + ?Sized>(&mut self, k: &T) -> R {
        self.key = match serde_json::to_value(k).map_err(|_| Stop)? {
            Value::String(s) => s,
            other => other.to_string(),
        };
        Ok(())
    }
    fn serialize_value<T: Serialize + ?Sized>(&mut self, v: &T) -> R {
        let key = std::mem::take(&mut self.key);
        self.entry(&key, v)
    }
    fn end(self) -> R { Ok(()) }
}

impl ser::SerializeStruct for Entries<'_> {
    type Ok = ();
    type Error = Stop;
    fn serialize_field<T: Serialize + ?Sized>(&mut self, key: &'static str, v: &T) -> R { self.entry(key, v) }
    fn end(self) -> R { Ok(()) }
}

impl ser::SerializeStructVariant for Entries<'_> {
    type Ok = ();
    type Error = Stop;
    fn serialize_field<T: Serialize + ?Sized>(&mut self, key: &'static str, v: &T) -> R { self.entry(key, v) }
    fn end(self) -> R { Ok(()) }
}
