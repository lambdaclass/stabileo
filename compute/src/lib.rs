#![forbid(unsafe_code)]

pub use dedaliano_engine::linalg::backend::{
    validate_batch, validate_matrix, ComputeError, CpuBackend, CpuOperator, Precision,
    PreparedOperator, SparseBackend,
};

#[cfg(all(feature = "webgpu", target_arch = "wasm32"))]
mod browser;
#[cfg(any(feature = "webgpu", feature = "metal"))]
pub mod gpu;
#[cfg(any(feature = "webgpu", feature = "metal", test))]
mod packing;
