use std::borrow::Cow;

use crate::types::{Displacement, SolverInput};

use super::corotational::CorotationalStart2D;

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

pub(super) struct PlaneInputs<'a> {
    pub target: Cow<'a, SolverInput>,
    base: Option<(Cow<'a, SolverInput>, &'a [Displacement])>,
}

impl<'a> PlaneInputs<'a> {
    pub fn new(target: &'a SolverInput, start: Option<&CorotationalStart2D<'a>>) -> Self {
        Self {
            target: super::member_loads::plane_input(target),
            base: start.map(|start| {
                (
                    super::member_loads::plane_input(start.input),
                    start.displacements,
                )
            }),
        }
    }

    pub fn start(&self) -> Option<CorotationalStart2D<'_>> {
        self.base
            .as_ref()
            .map(|(input, displacements)| CorotationalStart2D {
                input,
                displacements,
            })
    }
}
