//! Reference-formula self-checks.
//!
//! These tests verify textbook/design-code formulas recomputed inline in the
//! test body. They do NOT exercise the dedaliano engine and are intentionally
//! kept out of the `validation` target so engine-verification counts stay
//! honest. See docs/BENCHMARKS.md "Test taxonomy".

#[path = "../common/mod.rs"]
mod common;

mod domains;

mod c08_reference;
