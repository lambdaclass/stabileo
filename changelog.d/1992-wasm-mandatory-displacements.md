### Fixed

#### Require finite mandatory displacements in truss WASM regressions (#1992)

Check every mandatory displacement field in the 2D and 3D linear, constrained, and P-Delta truss regressions. Reject null, missing, nonnumeric, and nonfinite values while retaining valid finite answers and the existing refusal checks. Engine results and accuracy limits are unchanged.
