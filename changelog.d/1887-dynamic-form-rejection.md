### Fixed

#### Reject non-finite dynamic quadratic forms in symmetry checks (2026-11-10)

The metamorphic dynamic accuracy harness rejects non-finite load-energy, translation-compliance and modal-residual quadratic forms before clamping finite negative roundoff to zero. Three NaN regressions prevent these forms from silently becoming zero comparison scales or residuals. The singular-mass harmonic regression now rebuilds the symmetry expectation from each mutated response: an allowed X perturbation passes, while a physical-scale forbidden Z perturbation fails under antisymmetric loading. Production analysis results are unchanged. Zero-frequency anchor coverage remains deferred within [#1889](https://github.com/lambdaclass/stabileo/issues/1889), whose scope already includes the static-frequency limit and focused regressions.
