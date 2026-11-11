### BREAKING (results)

#### Refine buckling modes before sparse selection and through constraints (#1939)

Sparse buckling now uses original-pencil factors before completeness checks and mode selection. Constrained 2D and 3D buckling retain compensated constraint-expansion work on the original matrices, and teaching/step calculations refine their dense factors too. Shell, curved-shell and connector buckling projects receive the saved-results notice. Native and WASM certification withholds deliberately perturbed results through the same containment gate as normal solves. Existing tolerances, warnings and refusal thresholds remain. PR #1939 partly addresses #818; the historical roundoff-compression benchmark remains ignored for #1756. See [the results-change evidence](../docs/results-changes/2026-11-buckling-original-pencil.md).
