//! Frame, cable and connector elements: loads, local axes, releases, rigid-body modes, masses.
//!
//! One test binary for several test files, which stay where they were in engine/tests/:
//! every file used to be its own binary that linked the whole engine, and compiling and
//! linking 100+ of them was most of `cargo test`. Test names are `<file>::<test>`.
//! scripts/check-test-targets.py checks that each file is in exactly one binary.

#[path = "../common/mod.rs"]
mod common;

#[path = "../axial_distributed_2d.rs"]
mod axial_distributed_2d;
#[path = "../axial_distributed_3d.rs"]
mod axial_distributed_3d;
#[path = "../axial_span_paths.rs"]
mod axial_span_paths;
#[path = "../axial_span_rebase.rs"]
mod axial_span_rebase;
#[path = "../cable_statics.rs"]
mod cable_statics;
#[path = "../connector_k_findings.rs"]
mod connector_k_findings;
#[path = "../curved_beam_all_solvers_gate.rs"]
mod curved_beam_all_solvers_gate;
#[path = "../curved_beam_constrained_gate.rs"]
mod curved_beam_constrained_gate;
#[path = "../determinate_exact.rs"]
mod determinate_exact;
#[path = "../element_rigid_body_modes.rs"]
mod element_rigid_body_modes;
#[path = "../frame_thermal_inputs.rs"]
mod frame_thermal_inputs;
#[path = "../geometric_stiffness_releases.rs"]
mod geometric_stiffness_releases;
#[path = "../local_axis_adversarial.rs"]
mod local_axis_adversarial;
#[path = "../local_axis_convention.rs"]
mod local_axis_convention;
#[path = "../nodal_masses.rs"]
mod nodal_masses;
#[path = "../torsional_buckling_and_spectral.rs"]
mod torsional_buckling_and_spectral;
