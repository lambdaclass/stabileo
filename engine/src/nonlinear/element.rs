//! The element interface the driver assembles.

/// How an element relates nodal displacements to its own deformations.
///
/// The material and section do not know which one is in use: the same fiber
/// section gives a small-displacement inelastic analysis under `Linear` and a
/// large-displacement one under `Corotational`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kinematics {
    /// Deformations are linear in the displacements, on the undeformed geometry.
    Linear,
    /// Rigid-body motion removed exactly (co-rotational frame); deformations
    /// stay small in the element's rotated frame, displacements and
    /// rotations do not.
    Corotational,
}

/// An element as the driver sees it.
///
/// `update` evaluates the element at the trial displacements of its DOFs
/// (`dofs()` order, global axes) from its last committed state;
/// `internal_force` and `tangent` then describe that trial state. `commit`
/// accepts it, `revert` discards it. `tangent` is row-major, n×n with
/// n = `dofs().len()`, and must be the derivative of `internal_force`.
pub trait Element: Send {
    fn dofs(&self) -> &[usize];
    fn update(&mut self, u: &[f64]) -> Result<(), String>;
    fn internal_force(&self) -> &[f64];
    fn tangent(&self) -> &[f64];
    fn commit(&mut self);
    fn revert(&mut self);
}
