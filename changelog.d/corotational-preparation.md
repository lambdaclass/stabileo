### Changed
#### Reuse experimental 3D corotational preparation (2026-11-26)

Prepare invariant member data once per analysis and reuse tangent assembly
buffers. Preserve contribution order, deformation-dependent checks and independent
force recovery. Bound the additional reference storage at 8 MiB, falling back
to the original assembly above that budget.
