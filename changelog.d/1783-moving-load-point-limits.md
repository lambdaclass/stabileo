### Fixed
#### Correct point-load sampling before release

3D moving-load envelopes use recovered member-end forces and evaluate both shear and axial limits at each point load's actual coordinate (#1782, PR #1783). This corrects a regression introduced on this branch before release; no released results were affected.
