# Accuracy of conditionally admitted static solves (2026-11-26)

The #2519 frame passed the stiffness rank check in each unit system. The
dense solve initially needed a displacement correction beyond the response
accuracy limit in one unit system. PCG could meet its residual criterion
while still requiring a correction above the same limit. Sparse direct
analysis refined its response first and reached the required accuracy.

Conditionally admitted static solves now refine their displacement
approximations against the prepared equation before the response accuracy
audit. Dense, sparse, iterative and constraint-reduced paths share the
existing compensated refinement with its existing convergence and step
limits. The stiffness rank gates, load-work checks, eventual relative
correction and recovered-force limits still apply. Recheck saved static
analyses of models with extreme stiffness contrasts and results that use
those analyses as preloads.
