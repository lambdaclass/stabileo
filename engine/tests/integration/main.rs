#[path = "../common/mod.rs"]
mod common;

mod cable_solver;
mod cfs_check;
mod cirsoc201_check;
mod combinations;
mod connection_check;
mod corotational_3d;
mod design_check_defaults;
mod design_check_axial;
mod design_check_evaluability;
mod design_check_limit_states;
mod design_check_quantities;
mod eccentric_connections;
mod ec2_check;
mod ec3_check;
mod foundation_check;
mod isolated_footing;
mod loads_cirsoc;
mod harmonic;
mod influence_3d;
mod load_cases;
mod multi_case_parity;
mod moving_influence_parity;
mod sparse_2d_parity;
mod masonry_check;
mod material_nonlinear_3d;
mod moving_loads_3d;
mod plastic_3d;
mod plate_improvements;
mod postprocess_scaling;
mod rc_check;
mod section;
mod serviceability;
mod staged_3d;
mod staged_analysis;
mod steel_check;
mod timber_check;
mod time_history_3d;
mod winkler;

#[path = "../benchmarks/newmark_1959.rs"]
mod newmark_1959;
#[path = "../benchmarks/plastic_collapse.rs"]
mod plastic_collapse_benchmark;
