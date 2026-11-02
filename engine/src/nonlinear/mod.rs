//! A general nonlinear framework: large displacements and nonlinear materials
//! through one solution driver, in 2D and 3D.
//!
//! DRAFT. Nothing in the app or in the existing solvers calls this module; the
//! solvers under `solver/` (P-Delta, co-rotational, arc-length, fiber, …) are
//! untouched and serve as oracles for it (tests/nonlinear_framework*.rs).
//! Design, policy and plans: docs/solver/nonlinear-framework.md.
//!
//! | Layer | Trait | What it answers |
//! |---|---|---|
//! | Material | [`UniaxialMaterial`], [`PlaneStressMaterial`] | stress and consistent tangent at one point, from a trial strain and the last committed state |
//! | Section | [`FiberSection2D`], [`FiberSection3D`] | resultants and their tangent, integrating materials over a cross-section |
//! | Element | [`Element`], [`Element3D`] | internal force and tangent; the kinematics ([`Kinematics`]) is the element's choice, not the material's |
//! | Model | [`NonlinearModel`] | assembly, and moving the trial configuration (multiplicative rotations in 3D) |
//! | Linear solver | (`linear_solver`, [`sparse`]) | sparse LDLᵀ with inertia, LU fallback, the bordered system |
//! | Driver | [`solve`] | `R(u, λ) = λ·F − f_int(u) = 0` by Newton under load, displacement or arc-length control, with the escalation ladder of the robust default |
//!
//! State follows one rule everywhere: `update` computes a *trial* state from
//! the last *committed* one; the driver calls `commit` on a converged step and
//! `revert` on a failed one. Nothing path-dependent is ever written by an
//! iteration that does not converge.
//!
//! The driver's contract on failure: [`Outcome`] always carries the last
//! converged state (`u`, `lambda`, reactions), never an unconverged iterate,
//! and says why it stopped ([`Termination`]).

pub mod check;
mod driver;
mod element;
mod frame2d;
mod frame3d;
mod linear_solver;
mod material;
mod model;
mod model3d;
mod plane_stress;
pub mod rotation;
mod section;
pub mod sparse;

pub use driver::{solve, CriticalKind, CriticalPoint, Iteration, NewtonOptions, Outcome, Phase, StepRecord, StopReason, Strategy, Termination};
pub use element::{Element, Kinematics};
pub use frame2d::{BasicResponse2D, ElasticBasic2D, FiberBasic2D, Frame2D, Truss2D};
pub use frame3d::{BasicResponse3D, ElasticBasic3D, FiberBasic3D, Frame3D, Truss3D};
pub use linear_solver::FactorMethod;
pub use material::{Elastic1D, FiberLaw1D, UniaxialMaterial};
pub use model::{DofKind, Model2D, NonlinearModel, TangentSink};
pub use model3d::{Element3D, Model3D, NodeState3D};
pub use plane_stress::{Hardening, PlaneStressElastic, PlaneStressJ2, PlaneStressMaterial};
pub use section::{Fiber2D, Fiber3D, FiberSection2D, FiberSection3D};
