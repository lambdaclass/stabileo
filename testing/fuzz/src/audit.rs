//! The non-finite walker lives in the engine (`certify::finite`), where every
//! certificate entry point uses it as a guard; the harness checks the same
//! property with the same code.

pub use dedaliano_engine::certify::finite::{non_finite_paths, undocumented_non_finite};
