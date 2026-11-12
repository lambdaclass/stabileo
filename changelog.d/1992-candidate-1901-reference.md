### Fixed

#### Verify the #1901 replay after truss member-load balance (#1992)

Replace the stale conditioning-refusal expectation with an independent high-precision linear displacement regression in 2D and all three 3D embeddings. Retain explicit rejection of the unconverged 2D P-Delta iterate and verify converged P-Delta displacements in a rigidly rotated 2D control and all 3D embeddings against the independent reference. Cover native and public WASM calls. Engine results and accuracy limits are unchanged by this regression correction. See [the verification note](../docs/verification/candidate-1901-after-truss-balance.md).
