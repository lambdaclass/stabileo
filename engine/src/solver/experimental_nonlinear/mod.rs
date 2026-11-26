mod adaptive;
mod anderson;
mod broyden;
pub(super) mod incremental;
mod line_search;
mod newton_krylov;
mod pseudo_transient;
mod trust_region;

pub use super::arc_length::{
    solve_arc_length, solve_arc_length_from, solve_displacement_control,
};
pub use super::corotational::experimental_nonlinear_2d::{
    solve_corotational_2d_by, solve_corotational_2d_stepped,
};
pub use super::corotational::experimental_nonlinear_3d::{
    solve_corotational_3d_by, solve_corotational_3d_stepped,
};
pub use incremental::{Direction, IterationMethod, LoadStepping};

#[cfg(target_arch = "wasm32")]
mod wasm;
