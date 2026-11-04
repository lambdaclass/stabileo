//! Derivations, symbolic element checks, sections and worked design examples.
//!
//! One test binary for several test files, which stay where they were in engine/tests/:
//! every file used to be its own binary that linked the whole engine, and compiling and
//! linking 100+ of them was most of `cargo test`. Test names are `<file>::<test>`.
//! scripts/check-test-targets.py checks that each file is in exactly one binary.

#[path = "../common/mod.rs"]
mod common;

#[path = "../cirsoc301_check.rs"]
mod cirsoc301_check;
#[path = "../derivation_assembly_constraints.rs"]
mod derivation_assembly_constraints;
#[path = "../derivation_frames.rs"]
mod derivation_frames;
#[path = "../derivation_mass_geometric_dynamics.rs"]
mod derivation_mass_geometric_dynamics;
#[path = "../derivation_nonlinear.rs"]
mod derivation_nonlinear;
#[path = "../derivation_shells.rs"]
mod derivation_shells;
#[path = "../derivation_special_elements.rs"]
mod derivation_special_elements;
#[path = "../design_worked_examples.rs"]
mod design_worked_examples;
#[path = "../design_worked_examples_2.rs"]
mod design_worked_examples_2;
#[path = "../paper_examples.rs"]
mod paper_examples;
#[path = "../section_exact.rs"]
mod section_exact;
#[path = "../section_fe_reference.rs"]
mod section_fe_reference;
#[path = "../soil_curves_references.rs"]
mod soil_curves_references;
#[path = "../symbolic_elements.rs"]
mod symbolic_elements;
