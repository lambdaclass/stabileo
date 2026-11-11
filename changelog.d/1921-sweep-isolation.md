### Fixed

#### Restore interrupted what-if sweeps and bound each generated test (2026-11-11)

Restore the model in `finally` and clean up after each advanced sweep what-if
session, including injected mid-session failures (#1921). Run the same 350
2D models in fourteen tests of 25 models, retaining every check, sampled run,
known-defect expectation and aggregate finding. Report timings for those chunks
and the existing 3D family hooks. No engine results change.
