### Fixed

#### Keep non-finite harmonic comparison bounds inconclusive (2026-11-10)

The metamorphic harness returns positive infinity for every non-finite harmonic error bound, including an infinite resonant gain multiplied by zero perturbation and overflow during final floor scaling. Both forward and inverse certificates reject negative or non-finite Rayleigh coefficients and invalid assembly-error inputs. Regression coverage requires NaN-producing resonant bounds to yield an inconclusive verdict for matching and differing responses. Production analysis results are unchanged. The deferred zero-frequency anchor and single-mode cutoff reviews are tracked in [#1889](https://github.com/lambdaclass/stabileo/issues/1889).
