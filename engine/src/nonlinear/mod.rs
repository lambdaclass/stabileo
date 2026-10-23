//! A general nonlinear framework: large displacements and nonlinear materials
//! through one solution driver.
//!
//! DRAFT. Nothing in the app or in the existing solvers calls this module; the
//! solvers under `solver/` (P-Delta, co-rotational, arc-length, fiber, …) are
//! untouched and serve as oracles for it (tests/nonlinear_framework.rs).
//! Design notes: docs/solver/nonlinear-framework.md.
//!
//! Four layers, each replaceable without touching the others:
//!
//! | Layer | Trait | What it answers |
//! |---|---|---|
//! | Material | [`UniaxialMaterial`], [`PlaneStressMaterial`] | stress and tangent at one point, from a trial strain and the last committed state |
//! | Section | [`FiberSection2D`] | resultants and their tangent, integrating materials over a cross-section |
//! | Element | [`Element`] | internal force and tangent from nodal displacements; the kinematics ([`Kinematics`]) is a choice of the element, not of the material |
//! | Driver | [`solve`] | `R(u, λ) = λ·F − f_int(u) = 0` by Newton–Raphson under load or displacement control, with step cutting |
//!
//! State follows one rule everywhere: `update` computes a *trial* state from
//! the last *committed* one; the driver calls `commit` on a converged step and
//! `revert` on a failed one. Nothing path-dependent is ever written by an
//! iteration that does not converge.
//!
//! The driver's contract on failure: [`Outcome`] always carries the last
//! converged state (`u`, `lambda`, reactions), never an unconverged iterate,
//! and says why it stopped ([`Termination`]).

mod driver;
mod element;
mod frame2d;
mod material;
mod model;
mod plane_stress;
mod section;

pub use driver::{solve, NewtonOptions, Outcome, StepRecord, StopReason, Strategy, Termination};
pub use element::{Element, Kinematics};
pub use frame2d::{BasicResponse2D, ElasticBasic2D, FiberBasic2D, Frame2D, Truss2D};
pub use material::{Elastic1D, FiberLaw1D, UniaxialMaterial};
pub use model::Model2D;
pub use plane_stress::{PlaneStressElastic, PlaneStressJ2, PlaneStressMaterial};
pub use section::{Fiber2D, FiberSection2D};
