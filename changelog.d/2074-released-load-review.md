### BREAKING (results)

#### Account for oblique truss load transformations and exact nodal cancellation

Distributed transverse and point loads on 3D trusses now carry their frame, multiplication and summation uncertainty through one shared assembly path (#2074). Nodal-moment admission and assembly in both dimensions share exact per-node sums with certified conversion bounds, admitting cancelling moments while still refusing every nonzero unsupported residual. See [the results-change record](../docs/results-changes/2026-11-released-load-work.md).
