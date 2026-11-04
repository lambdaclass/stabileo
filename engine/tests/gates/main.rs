//! Named CI gates (ci.yml `test` job): each module is its own gate step, filtered by module path.
//!
//! One test binary for several test files, which stay where they were in engine/tests/:
//! every file used to be its own binary that linked the whole engine, and compiling and
//! linking 100+ of them was most of `cargo test`. Test names are `<file>::<test>`.
//! scripts/check-test-targets.py checks that each file is in exactly one binary.

#[path = "../common/mod.rs"]
mod common;

#[path = "../acceptance.rs"]
mod acceptance;
#[path = "../bench_phases.rs"]
mod bench_phases;
#[path = "../conditioning_adversarial.rs"]
mod conditioning_adversarial;
#[path = "../kfull_overbuild_gates.rs"]
mod kfull_overbuild_gates;
#[path = "../perf_regression_advanced.rs"]
mod perf_regression_advanced;
#[path = "../perf_regression_gates.rs"]
mod perf_regression_gates;
#[path = "../solver_ci_coverage.rs"]
mod solver_ci_coverage;
#[path = "../solver_invariants.rs"]
mod solver_invariants;
#[path = "../sparse_shell_gates.rs"]
mod sparse_shell_gates;
