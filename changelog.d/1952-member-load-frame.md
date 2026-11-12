### BREAKING (results)

#### Member load actions follow the final member frame (2026-11-12)

Transform fixed-end forces and moments into the final member frame before
recovering 2D/3D corotational end actions, including planar path solvers. Rotated
members under dead member loads now report the axial and transverse projections
consistent with their final orientation. See the
[results-change write-up](../docs/results-changes/2026-11-corotational-member-load-frame.md)
and existing SA-2026-061 (#1952).
