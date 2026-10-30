//! Shell and solid-shell elements: patch tests, conventions, locking, mesh quality, convergence.
//!
//! One test binary for several test files, which stay where they were in engine/tests/:
//! every file used to be its own binary that linked the whole engine, and compiling and
//! linking 100+ of them was most of `cargo test`. Test names are `<file>::<test>`.
//! scripts/check-test-targets.py checks that each file is in exactly one binary.

#[path = "../common/mod.rs"]
mod common;

#[path = "../constrained_shell_stress.rs"]
mod constrained_shell_stress;
#[path = "../discretization_error.rs"]
mod discretization_error;
#[path = "../shell_degeneracy_validation.rs"]
mod shell_degeneracy_validation;
#[path = "../shell_mesh_quality_gates.rs"]
mod shell_mesh_quality_gates;
#[path = "../shell_model_equilibrium.rs"]
mod shell_model_equilibrium;
#[path = "../shell_nonlinear_regressions.rs"]
mod shell_nonlinear_regressions;
#[path = "../shell_patch_tests.rs"]
mod shell_patch_tests;
#[path = "../shell_rigid_body_modes.rs"]
mod shell_rigid_body_modes;
#[path = "../shell_stress_conventions.rs"]
mod shell_stress_conventions;
#[path = "../shell_transverse_shear.rs"]
mod shell_transverse_shear;
#[path = "../solid_shell_analyses.rs"]
mod solid_shell_analyses;
#[path = "../solid_shell_locking.rs"]
mod solid_shell_locking;

#[path = "../macneal_harder.rs"]
mod macneal_harder;
