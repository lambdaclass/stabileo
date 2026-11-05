//! Cross-method tests: two independent solution paths on the same model must agree.
//! `make test.engine.differential.quick` runs the fast pairs on every engine PR;
//! `make test.engine.differential.full` adds the parametrised families (nightly).

#[path = "../common/mod.rs"]
#[allow(dead_code)]
mod common;

mod models;
mod support;

mod modal_vs_direct;
mod nonlinear_limit;
mod planar;
mod substructures;
mod plastic_bounds;
