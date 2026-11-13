### Fixed

#### Complete truss direction bounds and converged P-Delta verification

- Truss and cable member loads now carry direction-rounding uncertainty through the same bounded transform in 2D and 3D, including axial and thermal loads. Compatible loads retain their answers; released-direction residuals beyond the calculated bound remain refused (#2074).
- Released-load native/WASM verification now requires admitted P-Delta cases to converge in both runtimes. Matching non-convergence is accepted only for an explicitly pinned unresolved case (#2074).
