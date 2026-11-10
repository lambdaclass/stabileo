# Harmonic direct refinement refuses unconverged responses (2026-11-10)

PR #1922. Results-change entry `harmonic-omitted-modes`, shared with the other
harmonic corrections in this unmerged PR.

The earlier direct implementation checked only finiteness after two compensated
residual refinement steps. A singular inconsistent system could leave a roundoff
pivot above the unchanged cutoff and return a huge finite response.

The review supplied this exact synthetic regression: N = 1024,
t = 1 - 383/2^26, M = I, omega = 1,
K = [[2I, -t 1], [-t 1^T, 1 + N t^2]], and a unit load on the last DOF.
The dynamic matrix has null vector [t 1; 1], whose dot product with the load is
one, so no solution exists. All coefficients needed for this identity are exactly
representable in the regression. Before this correction both dense and sparse
paths returned last-DOF real response -104093369406.45923 with zero imaginary
response. Both refusal assertions failed. These are synthetic numerical data,
not recommended engineering inputs.

Both paths retain two refinement steps, then recompute the compensated residual
against the original unscaled dynamic matrix. They now require its Euclidean norm,
divided by the load norm, to meet the existing harmonic MODAL_RESIDUAL_TOL = 1e-2.
The norm calculation scales by the largest load component before accumulation to
avoid squaring tiny or huge loads. Zero load requires exactly zero residual.
Non-finite residuals or loads refuse. The response magnitude is not part of the
normalization: a huge response cannot hide an inconsistent load. An unconverged
solve returns an error, without returning the modal approximation.

The exact-singular dense and sparse tests now require refusal. Existing coupled
closed-form accuracy, damped near-resonance, and harmonic differential assertions
keep their tolerances. Pivot cutoff, scaling, damping, truncation selection, storage
budget, and modal residual acceptance are unchanged. This adds a refusal condition
to branch direct solves; it does not certify forward accuracy for every
ill-conditioned system.

The SA-2026-058 sweep regressions now require the entire requested frequency list,
point count, and empty all-direct warnings before comparing values and peaks.
A negative regression rejects empty, missing-point and reordered direct responses.
Uncorrected-warning cleanup runs before the all-direct/mixed split. The all-direct
return already cleared warnings before this round; the new assertions verify it.
The retained main replay now keeps its printed values and fails the independent
reference assertions on both dimensional paths, instead of reporting a print-only
probe as a passing accuracy test.

**What to re-check:** direct harmonic responses calculated with earlier versions
of PR #1922, including finite responses near singularity. The residual defect was
reproduced on the unmerged branch; no separate public-main silence claim or new
advisory is assigned. The existing main omitted-mode evidence and SA-2026-058
remain separate. The shared registry notice includes this added refusal in all six
locales without adding another notice for the same PR.
