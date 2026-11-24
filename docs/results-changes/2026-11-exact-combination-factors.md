# Resolve repeated load case factors exactly (2026-11-19)

The compensated sum of repeated factors could lose a contribution when its correction rounded. For one load case, the factors [2¹¹⁰, 2⁵⁴, 1, −2⁵⁴, −2¹¹⁰, −1] gave a net factor of −1 instead of zero. The same sequence without the final −1 gave zero instead of 1.

The shared factor resolver sums the input factors exactly for each load case, checks for cancellation, and rounds each surviving net factor once. The six-factor example now triggers the cancellation refusal when it is the only case in the combination. The five-factor example gives the same result as applying the case once with factor 1. If another load case contributes, the cancelled case has a zero contribution.

Re-run 2D and 3D combinations with repeated factors for a load case. The change applies to linear and nonlinear results, including direct analysis and spectral combinations.
