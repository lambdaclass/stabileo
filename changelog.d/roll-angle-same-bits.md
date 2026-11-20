### Fixed
#### Rolled 3D members get the same local axes natively and in WASM (2026-11-20)

The cosine and sine of a member's roll angle came from each target's own math library: Apple
libm on macOS, glibc on Linux and Rust's bundled libm in WASM. They round some angles differently,
so the native CLI and the browser solved the same model with axes that differed in the last bit,
and displacements and forces then differed by up to 8e-11 of their largest value on the random 3D
models of `engine/tests/determinism.rs`. Both now come from the `libm` crate, the same code the
WASM build already ran: browser results are unchanged, and the rolled axes have the same bits on
every target.
