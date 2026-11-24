mod adaptive;
mod anderson;
pub(super) mod incremental;
mod line_search;
pub(super) mod path_following;

pub use super::arc_length::experimental_nonlinear_continuation::{
    solve_arc_length, solve_arc_length_from, solve_displacement_control,
};
pub use super::corotational::experimental_nonlinear_2d::{
    solve_corotational_2d_by, solve_corotational_2d_stepped,
};
pub use super::corotational::experimental_nonlinear_3d::{
    solve_corotational_3d_by, solve_corotational_3d_stepped,
};
pub use incremental::{IterationMethod, LoadStepping};

#[cfg(target_arch = "wasm32")]
mod wasm;
