### Fixed

#### Keep nonlinear SSI soil on its original solve path

Restrict elastic SSI refinement to absent soil or springs verified from their constitutive state to remain in the initial linear range. Settled nonlinear secants preserve main’s results bit for bit in 2D and 3D, including native and WASM calls. Correction candidates cannot leave the linear range. No equilibrium tolerance or iteration limit changes (#2072).
