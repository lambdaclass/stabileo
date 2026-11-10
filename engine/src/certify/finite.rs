//! Finiteness guard shared by every certificate (issue #335).
//!
//! A certificate must never report success on a non-finite number: not in the
//! input it certifies, not in the reported results, not in its own bounds.
//! `f64::max`/`min` and comparisons silently drop NaN, so one NaN can turn
//! into an error bound of 0 (the spectral certificate did exactly that). The
//! checks here walk any `Serialize` value with a serde serializer, because
//! `serde_json` writes NaN and ±∞ as `null` and the check has to see the
//! values before they become JSON.
//!
//! The entry points use them as follows:
//! - `check_input`: a non-finite number anywhere in the input is an `Err`;
//! - `check_results`: a non-finite number in the solver's results is an `Err`
//!   (the solver should have refused; this is the backstop);
//! - `guard`: a certificate claiming success with a non-finite number outside
//!   `DOCUMENTED_INFINITE` is downgraded to uncertified.
//!
//! The fuzz harness (`engine/fuzz/src/lib.rs`) checks the same property with
//! the same walker and allowlist.

use serde::ser::{self, Serialize};
use std::fmt;

/// Fields whose documented values include +∞ (serialized as `null`):
/// - `relBound`: +∞ when ũ = 0 but the absolute bound is not 0;
/// - `omega2Upper`: +∞ when the residual is too large to bound ω² from above;
/// - `uniquenessRadius`: +∞ for a linear P-Delta model (β = 0);
/// - `bimoment` of a force bound: combinations and envelopes do not combine
///   the warping bimoment and report it unbounded (certify/combinations.rs);
/// - `b2Factor`: +∞ when the P-Delta solve fails or K + K_G is not positive
///   definite, reported with `isStable: false`.
///
/// Only +∞ is documented: a NaN is never allowed, in any field.
pub const DOCUMENTED_INFINITE: &[&str] = &["relBound", "omega2Upper", "uniquenessRadius", "bimoment", "b2Factor"];

/// Paths (`$.results.displacements[3].ux`) of every non-finite `f32`/`f64` in
/// `value`, with `NaN` or `inf` appended (`$.x=NaN`).
pub fn non_finite_paths<T: Serialize + ?Sized>(value: &T) -> Vec<String> {
    let mut a = Audit { path: vec!["$".to_string()], bad: Vec::new(), range: None };
    // Serialization errors (e.g. non-string map keys) only stop the walk.
    let _ = value.serialize(&mut a);
    a.bad.into_iter().map(|(p, x)| format!("{p}={x}")).collect()
}

/// Paths of the non-finite numbers in `value` that are not a documented +∞.
pub fn undocumented_non_finite<T: Serialize + ?Sized>(value: &T) -> Vec<String> {
    let mut a = Audit { path: vec!["$".to_string()], bad: Vec::new(), range: None };
    let _ = value.serialize(&mut a);
    a.bad
        .into_iter()
        .filter(|(p, x)| !(*x == f64::INFINITY && DOCUMENTED_INFINITE.iter().any(|f| p.ends_with(&format!(".{f}")))))
        .map(|(p, x)| format!("{p}={x}"))
        .collect()
}

/// `Err` naming the numbers of `value` that are non-finite, or non-zero with
/// a magnitude outside `[min_abs, max_abs]`. A resource cap for the exact
/// (rational) certificates, whose work grows with the bit length of the data.
pub fn check_magnitudes<T: Serialize + ?Sized>(value: &T, min_abs: f64, max_abs: f64) -> Result<(), String> {
    let mut a = Audit { path: vec!["$".to_string()], bad: Vec::new(), range: Some((min_abs, max_abs)) };
    let _ = value.serialize(&mut a);
    if a.bad.is_empty() {
        return Ok(());
    }
    let bad: Vec<String> = a.bad.into_iter().map(|(p, x)| format!("{p}={x:e}")).collect();
    let shown: Vec<&str> = bad.iter().take(3).map(String::as_str).collect();
    Err(format!(
        "number out of the range [{min_abs:e}, {max_abs:e}] the exact certificate accepts at {}",
        shown.join(", ")
    ))
}

fn describe(what: &str, bad: &[String]) -> String {
    let shown: Vec<&str> = bad.iter().take(3).map(String::as_str).collect();
    let more = if bad.len() > 3 { format!(" and {} more", bad.len() - 3) } else { String::new() };
    format!("non-finite number in the {what} at {}{more}", shown.join(", "))
}

/// `Err` if any number in the input is non-finite (no input field documents ±∞).
pub fn check_input<T: Serialize + ?Sized>(input: &T) -> Result<(), String> {
    let bad = non_finite_paths(input);
    if bad.is_empty() { Ok(()) } else { Err(describe("input", &bad)) }
}

/// `Err` if the results carry a non-finite number outside the documented +∞
/// fields.
pub fn check_results<T: Serialize + ?Sized>(results: &T) -> Result<(), String> {
    let bad = undocumented_non_finite(results);
    if bad.is_empty() { Ok(()) } else { Err(describe("results", &bad)) }
}

/// `Err` if an exported certificate (a bundle) carries a non-finite number
/// outside the documented +∞ fields.
pub fn finite_output<T: Serialize>(r: Result<T, String>) -> Result<T, String> {
    let v = r?;
    check_results(&v)?;
    Ok(v)
}

/// A certificate that can say whether it claims success and be downgraded.
pub trait Guarded: Serialize {
    /// Whether the certificate claims anything (certified, or certified in part).
    fn claims(&self) -> bool;
    /// Withdraw every claim, with the reason.
    fn downgrade(&mut self, reason: String);
}

/// Downgrade `cert` if it claims success while carrying an undocumented
/// non-finite number. Returns whether it was downgraded.
pub fn guard<C: Guarded + ?Sized>(cert: &mut C) -> bool {
    if !cert.claims() {
        return false;
    }
    let bad = undocumented_non_finite(cert);
    if bad.is_empty() {
        return false;
    }
    cert.downgrade(describe("certificate", &bad));
    true
}

/// The full guard of a certificate of given results: downgrade `cert` if the
/// input or the results it certifies carry a non-finite number, or if it
/// carries one itself (outside the documented +∞ fields).
pub fn guard_all<I, R, C>(input: &I, results: &R, cert: &mut C)
where
    I: Serialize + ?Sized,
    R: Serialize + ?Sized,
    C: Guarded + ?Sized,
{
    if !cert.claims() {
        return;
    }
    match check_input(input).and_then(|()| check_results(results)) {
        Err(e) => cert.downgrade(e),
        Ok(()) => {
            guard(cert);
        }
    }
}

/// `Guarded` for the enum certificates with `Certified { .. }` and
/// `Uncertified { reason }` variants.
macro_rules! guarded_enum {
    ($($t:ident),* $(,)?) => {$(
        impl $crate::certify::finite::Guarded for $t {
            fn claims(&self) -> bool {
                !matches!(self, $t::Uncertified { .. })
            }
            fn downgrade(&mut self, reason: String) {
                *self = $t::Uncertified { reason };
            }
        }
    )*};
}
pub(crate) use guarded_enum;

struct Audit {
    path: Vec<String>,
    bad: Vec<(String, f64)>,
    /// Also record finite non-zero numbers outside `[lo, hi]` in magnitude.
    range: Option<(f64, f64)>,
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
        let out_of_range = match self.range {
            Some((lo, hi)) => x != 0.0 && !(lo..=hi).contains(&x.abs()),
            None => false,
        };
        if !x.is_finite() || out_of_range {
            self.bad.push((self.path.concat(), x));
        }
    }
    fn nested<T: Serialize + ?Sized>(&mut self, seg: String, v: &T) -> Result<(), Error> {
        self.path.push(seg);
        let r = match v.serialize(&mut *self) {
            Err(Error(s)) => match s.strip_prefix(crate::check::NON_FINITE) {
                Some(v) => {
                    self.float(v.parse::<f64>().unwrap_or(f64::NAN));
                    Ok(())
                }
                None => Err(Error(s)),
            },
            ok => ok,
        };
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Serialize;
    use std::collections::BTreeMap;

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Sample {
        x: f64,
        list: Vec<f64>,
        pair: (f64, f64),
        by_id: BTreeMap<String, f64>,
        rel_bound: f64,
    }

    fn sample() -> Sample {
        Sample { x: 1.0, list: vec![2.0, 3.0], pair: (4.0, 5.0), by_id: BTreeMap::from([("7".to_string(), 6.0)]), rel_bound: 0.5 }
    }

    #[derive(Serialize)]
    #[serde(rename_all_fields = "camelCase")]
    enum Cert {
        Certified { abs_bound: f64, rel_bound: f64 },
        Uncertified { reason: String },
    }
    guarded_enum!(Cert);

    fn certified(abs_bound: f64, rel_bound: f64) -> Cert {
        Cert::Certified { abs_bound, rel_bound }
    }

    fn reason(c: &Cert) -> &str {
        match c {
            Cert::Uncertified { reason } => reason,
            Cert::Certified { .. } => panic!("still certified"),
        }
    }

    #[test]
    fn non_finite_paths_names_every_non_finite_number_wherever_it_is() {
        assert!(non_finite_paths(&sample()).is_empty());
        let mut s = sample();
        s.x = f64::NAN;
        s.list[1] = f64::INFINITY;
        s.pair.1 = f64::NEG_INFINITY;
        s.by_id.insert("7".to_string(), f64::NAN);
        s.rel_bound = f64::INFINITY;
        assert_eq!(
            non_finite_paths(&s),
            ["$.x=NaN", "$.list[1]=inf", "$.pair[1]=-inf", "$.byId[\"7\"]=NaN", "$.relBound=inf"]
        );
        assert_eq!(undocumented_non_finite(&s), ["$.x=NaN", "$.list[1]=inf", "$.pair[1]=-inf", "$.byId[\"7\"]=NaN"]);
    }

    #[test]
    fn only_plus_infinity_in_a_documented_field_is_allowed() {
        let mut s = sample();
        s.rel_bound = f64::INFINITY;
        assert!(undocumented_non_finite(&s).is_empty());
        s.rel_bound = f64::NEG_INFINITY;
        assert_eq!(undocumented_non_finite(&s), ["$.relBound=-inf"]);
        s.rel_bound = f64::NAN;
        assert_eq!(undocumented_non_finite(&s), ["$.relBound=NaN"]);
    }

    #[test]
    fn check_input_rejects_any_non_finite_number_and_names_it() {
        assert_eq!(check_input(&sample()), Ok(()));
        let mut s = sample();
        s.rel_bound = f64::INFINITY;
        assert_eq!(check_input(&s), Err("non-finite number in the input at $.relBound=inf".to_string()));
        assert_eq!(check_results(&s), Ok(()));
        s.list[0] = f64::NAN;
        assert_eq!(check_results(&s), Err("non-finite number in the results at $.list[0]=NaN".to_string()));
    }

    #[test]
    fn describe_shows_three_paths_and_counts_the_rest() {
        let bad: Vec<String> = (0..5).map(|i| format!("$[{i}]=NaN")).collect();
        assert_eq!(describe("input", &bad[..3]), "non-finite number in the input at $[0]=NaN, $[1]=NaN, $[2]=NaN");
        assert_eq!(describe("input", &bad[..4]), "non-finite number in the input at $[0]=NaN, $[1]=NaN, $[2]=NaN and 1 more");
        assert_eq!(describe("results", &bad), "non-finite number in the results at $[0]=NaN, $[1]=NaN, $[2]=NaN and 2 more");
    }

    #[test]
    fn guard_downgrades_a_claim_carrying_an_undocumented_non_finite_number() {
        let mut c = certified(1e-9, f64::INFINITY);
        assert!(!guard(&mut c));
        assert!(c.claims());
        let mut c = certified(f64::NAN, 0.1);
        assert!(guard(&mut c));
        assert_eq!(reason(&c), "non-finite number in the certificate at $.absBound=NaN");
        assert!(!guard(&mut c));
    }

    #[test]
    fn guard_all_withdraws_a_claim_on_non_finite_input_results_or_bounds() {
        let finite = sample();
        let mut bad = sample();
        bad.x = f64::NAN;

        let mut c = certified(1e-9, 1e-12);
        guard_all(&finite, &finite, &mut c);
        assert!(c.claims());

        let mut c = certified(1e-9, 1e-12);
        guard_all(&bad, &finite, &mut c);
        assert_eq!(reason(&c), "non-finite number in the input at $.x=NaN");

        let mut c = certified(1e-9, 1e-12);
        guard_all(&finite, &bad, &mut c);
        assert_eq!(reason(&c), "non-finite number in the results at $.x=NaN");

        let mut c = certified(f64::INFINITY, 1e-12);
        guard_all(&finite, &finite, &mut c);
        assert_eq!(reason(&c), "non-finite number in the certificate at $.absBound=inf");

        let mut c = Cert::Uncertified { reason: "singular".into() };
        guard_all(&bad, &bad, &mut c);
        assert_eq!(reason(&c), "singular");
    }

    #[test]
    fn check_magnitudes_rejects_numbers_outside_the_range_but_not_zero() {
        let mut s = sample();
        s.x = 0.0;
        s.rel_bound = 1.0;
        assert_eq!(check_magnitudes(&s, 1.0, 10.0), Ok(()));
        s.list[0] = 1e-3;
        s.pair.0 = 1e3;
        assert_eq!(
            check_magnitudes(&s, 1.0, 10.0),
            Err("number out of the range [1e0, 1e1] the exact certificate accepts at $.list[0]=1e-3, $.pair[0]=1e3".to_string())
        );
    }

    #[test]
    fn a_serialization_error_reads_as_its_message() {
        assert_eq!(<Error as ser::Error>::custom("bad key").to_string(), "bad key");
    }
}
