### Fixed

#### Retain matching 3D plastic LP samples when optional refinement is refused (#1957)

Use one clone/solve/commit path for both 3D plastic certificate refinement loops. A budget refusal or LP breakdown now leaves the last successfully solved samples and solution together. Regression tests cover refusal before and after a successful refinement, the adjacent admitted budget boundary, and no-op cases. The current result path does not consume the mismatched secondary-loop dual weights, so this invariant correction does not change engineering results.
