### Added
#### One stability verdict that does not depend on units, orientation or numbering (2026-11-08)

`solver::stability` decides whether a free stiffness matrix is stable, a mechanism, or too close to singular to tell, from the spectrum of the matrix scaled node block by node block. That spectrum is the same under a change of units, a rigid rotation or mirror and a relabelling, so all transformed copies of a model get the same verdict. No solver calls it yet and no result changes; the following slices make every solver entry refuse what it refuses (docs/solver/stability.md).
