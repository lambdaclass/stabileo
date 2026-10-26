//! Input validation, fuzzing, determinism, feature matrix and differential-test regressions.
//!
//! One test binary for several test files, which stay where they were in engine/tests/:
//! every file used to be its own binary that linked the whole engine, and compiling and
//! linking 100+ of them was most of `cargo test`. Test names are `<file>::<test>`.
//! scripts/check-test-targets.py checks that each file is in exactly one binary.

#[path = "../common/mod.rs"]
mod common;
#[path = "../fuzz_models/mod.rs"]
mod fuzz_models;

#[path = "../codeaster_regressions.rs"]
mod codeaster_regressions;
#[path = "../determinism.rs"]
mod determinism;
#[path = "../differential_regressions.rs"]
mod differential_regressions;
#[path = "../entry_point_validation.rs"]
mod entry_point_validation;
#[path = "../feature_matrix.rs"]
mod feature_matrix;
#[path = "../feature_matrix_regressions.rs"]
mod feature_matrix_regressions;
#[path = "../fp_environment.rs"]
mod fp_environment;
#[path = "../fuzz_crash_free.rs"]
mod fuzz_crash_free;
#[path = "../fuzz_regressions.rs"]
mod fuzz_regressions;
#[path = "../gate_refusal_scope.rs"]
mod gate_refusal_scope;
#[path = "../hostile_sizes.rs"]
mod hostile_sizes;
#[path = "../index_exhaustive.rs"]
mod index_exhaustive;
#[path = "../input_validation_gates.rs"]
mod input_validation_gates;
#[path = "../known_issues.rs"]
mod known_issues;
#[path = "../model_sanity.rs"]
mod model_sanity;
#[path = "../nan_output_gates.rs"]
mod nan_output_gates;
#[path = "../opensees_differential_regressions.rs"]
mod opensees_differential_regressions;
#[path = "../solver_mutation_kills.rs"]
mod solver_mutation_kills;
#[path = "../sparse_ex_analysis_regressions.rs"]
mod sparse_ex_analysis_regressions;
#[path = "../unknown_enum_strings.rs"]
mod unknown_enum_strings;
#[path = "../unknown_enum_strings_postprocess.rs"]
mod unknown_enum_strings_postprocess;
