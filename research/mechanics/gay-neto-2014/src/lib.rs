#![allow(clippy::needless_range_loop)]

pub mod band;
pub mod beam;
pub mod contact;
pub mod hd;
pub mod input;
pub mod model;
pub mod rot;

pub const TUTORIAL01: &str = include_str!("../inputs/tutorial01.inp");
pub const TUTORIAL16: &str = include_str!("../inputs/tutorial16.inp");
