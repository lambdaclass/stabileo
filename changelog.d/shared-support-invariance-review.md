### Fixed
#### Check acceptance and refusal in shared-support invariance tests (2026-11-25)

The spatial restraint plane test requires valid kinematic reports in both
frames before comparing their degrees of static indeterminacy. The 2D and 3D
tests also verify that solvers and frame transforms refuse shared nodes with
rotational springs or inclined restraints.
