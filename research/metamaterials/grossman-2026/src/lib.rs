//! Linear elasticity of spring networks: lattice and disordered networks, periodic effective
//! moduli under imposed macroscopic strain (with the nonaffine relaxation solved exactly), the
//! paper's clamped-strip protocol, prestress, and the closed forms published by
//! Grossman & Boudaoud, Phys. Rev. Research 8, 013224 (2026), doi:10.1103/17sg-gzhl.
//!
//! Research code, not engineering design.

pub mod engine_model;
pub mod experiment;
pub mod lattice;
pub mod moduli;
pub mod network;
pub mod paper;
pub mod rng;
pub mod solve;
