mod frame;
mod truss;
mod fef;
mod transform;
pub mod cable;
pub mod curved_beam;
pub mod plate;
pub mod fiber_beam;
pub mod quad;
pub mod quad9;
pub mod solid_shell;
pub mod curved_shell;
pub mod connector;

pub use frame::*;
pub use truss::*;
pub use fef::*;
pub use transform::*;
pub use cable::*;
pub use curved_beam::*;
pub use plate::*;
pub use connector::*;

/// One stress sample of a shell-type element, for discretization-error estimation
/// (`postprocess::discretization`): the plane stress at an integration point of the element's
/// own stress field, in the shell's local frame there.
#[derive(Debug, Clone, Copy)]
pub struct ShellStressSample {
    /// Natural coordinates of the point (ζ through the thickness, −1 bottom … +1 top).
    pub xi: f64,
    pub eta: f64,
    pub zeta: f64,
    /// Global position of the point.
    pub pos: [f64; 3],
    /// Rows: the in-plane axes e1, e2 and the normal e3, in global components.
    pub frame: [[f64; 3]; 3],
    /// Plane stress (σ11, σ22, σ12) in that frame.
    pub sigma: [f64; 3],
    /// Integration weight: the volume the point stands for.
    pub weight: f64,
}
