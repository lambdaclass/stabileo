### Fixed

#### Compare nightly truss displacements and rank-two eigenvalues

Strengthen the ignored #1969 regressions in 2D and 3D to compare nodal displacement values against equivalent nodal-load controls using the established conditioning bounds. Require exactly two positive finite eigenvalues in each #1965 modal solve and compare them within the existing spectral bounds. Active negative controls reject zero or empty displacement responses and empty, missing, extra, nonfinite or incorrect eigenvalues. Engine results and tolerances are unchanged.
