### Changed
#### Time history no longer carries the reciprocity warning (2026-11-27)

Every linear time history carried a warning that reciprocity checks had failed by up to a
factor of 33 and that the affected inputs were not isolated (#760). The failures were one
defect, the load at t = 0 dropped on a massless degree of freedom, fixed and published as
SA-2026-031. The reported cases and three new ones were replayed: no reciprocity failure in
18 nightly runs in 2D and 3D. The warning is retired; the numbers of a time history do not
change, and the nightly reciprocity check stays.
