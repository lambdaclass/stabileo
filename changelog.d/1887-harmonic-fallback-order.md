### Fixed

#### Select harmonic fallback modes in eigenvalue order (2026-11-10)

The metamorphic dynamic accuracy harness sorts a copy of the generalized eigenvalues before inspecting the two lowest modes for single-mode fallback. Regression coverage checks every ordering of three synthetic spectra and permits single-mode fallback in the uncertain-second-anchor test, so certifying before selecting anchors now fails that test. Production analysis results are unchanged. Zero-frequency anchor coverage remains deferred to [#1889](https://github.com/lambdaclass/stabileo/issues/1889).
