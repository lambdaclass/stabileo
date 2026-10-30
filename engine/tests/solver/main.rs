//! Solver paths: assembly, sparse/PCG, constraints, inclined supports, dynamics and nonlinear findings.
//!
//! One test binary for several test files, which stay where they were in engine/tests/:
//! every file used to be its own binary that linked the whole engine, and compiling and
//! linking 100+ of them was most of `cargo test`. Test names are `<file>::<test>`.
//! scripts/check-test-targets.py checks that each file is in exactly one binary.

#[path = "../common/mod.rs"]
mod common;
#[path = "../fuzz_models/mod.rs"]
mod fuzz_models;

#[path = "../assembly_paths.rs"]
mod assembly_paths;
#[path = "../chained_constraints.rs"]
mod chained_constraints;
#[path = "../constrained_residual.rs"]
mod constrained_residual;
#[path = "../constraints_inclined_supports.rs"]
mod constraints_inclined_supports;
#[path = "../diaphragm_rotation.rs"]
mod diaphragm_rotation;
#[path = "../duplicate_support_reactions.rs"]
mod duplicate_support_reactions;
#[path = "../inclined_reporting_gates.rs"]
mod inclined_reporting_gates;
#[path = "../inclined_support_analyses.rs"]
mod inclined_support_analyses;
#[path = "../kinematics_invalid_input.rs"]
mod kinematics_invalid_input;
#[path = "../modal_constrained_participation.rs"]
mod modal_constrained_participation;
#[path = "../nonlinear_solver_findings.rs"]
mod nonlinear_solver_findings;
#[path = "../pcg_solver_tests.rs"]
mod pcg_solver_tests;
#[path = "../pdelta_model_diagnostics.rs"]
mod pdelta_model_diagnostics;
#[path = "../silent_errors_settlement_winkler_imperfections.rs"]
mod silent_errors_settlement_winkler_imperfections;
#[path = "../sparse_solver_paths.rs"]
mod sparse_solver_paths;
#[path = "../stiffness_definiteness_warning.rs"]
mod stiffness_definiteness_warning;
#[path = "../tower_fixture_test.rs"]
mod tower_fixture_test;

#[path = "../benchmarks/cqc_1981.rs"]
mod cqc_1981;
#[path = "../lee_frame.rs"]
mod lee_frame;
#[path = "../benchmarks/dadeppo_arch.rs"]
mod dadeppo_arch;
