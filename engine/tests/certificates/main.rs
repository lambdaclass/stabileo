//! Result certificates (docs/verification/CERTIFY.md) and the certificate property tests.
//!
//! One test binary for several test files, which stay where they were in engine/tests/:
//! every file used to be its own binary that linked the whole engine, and compiling and
//! linking 100+ of them was most of `cargo test`. Test names are `<file>::<test>`.
//! scripts/check-test-targets.py checks that each file is in exactly one binary.

#[path = "../common/mod.rs"]
mod common;
#[path = "../fuzz_models/mod.rs"]
mod fuzz_models;
#[path = "../certify_ref/mod.rs"]
mod certify_ref;
#[path = "../e2e_models/mod.rs"]
mod e2e_models;
#[path = "../properties_common/mod.rs"]
mod properties_common;

#[path = "../certify.rs"]
mod certify;
#[path = "../certify_bundle.rs"]
mod certify_bundle;
#[path = "../certify_design.rs"]
mod certify_design;
#[path = "../certify_dynamics.rs"]
mod certify_dynamics;
#[path = "../certify_end_to_end.rs"]
mod certify_end_to_end;
#[path = "../certify_end_to_end_findings.rs"]
mod certify_end_to_end_findings;
#[path = "../certify_end_to_end_inputs.rs"]
mod certify_end_to_end_inputs;
#[path = "../certify_end_to_end_mutations.rs"]
mod certify_end_to_end_mutations;
#[path = "../certify_nonfinite.rs"]
mod certify_nonfinite;
#[path = "../certify_nonlinear.rs"]
mod certify_nonlinear;
#[path = "../certify_plastic.rs"]
mod certify_plastic;
#[path = "../certify_plastic_3d.rs"]
mod certify_plastic_3d;
#[path = "../certify_shown.rs"]
mod certify_shown;
#[path = "../properties_2d.rs"]
mod properties_2d;
#[path = "../properties_3d.rs"]
mod properties_3d;
