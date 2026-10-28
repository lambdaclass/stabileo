//! AT2 phase-field fracture with an alternating displacement/damage solution, re-implemented
//! after Shauer (2025), doi:10.1016/j.advengsoft.2025.104013, and its MIT-licensed reference code
//! phasefield-jr-py. Research code: not part of the Stabileo solver, not for design.

pub mod examples;
pub mod fe;
pub mod mesh;
pub mod model;
pub mod replay;
pub mod solver;
