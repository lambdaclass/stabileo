### BREAKING (results)

#### Exclude staged stabilization forces and balance deformed planar members

Staged 2D and 3D reactions and constraint forces now use only physical stiffness;
constraint-only stages without physical stiffness retain the unavailable-state
warning. Planar corotational, arc-length and displacement-control member shears
use the same final chord as the end moments and reported length. Re-check saved
planar nonlinear member shears. Restore actual multistage displacement and force
controls while retaining support-history refusals. See the
[results-change write-up](../docs/results-changes/2026-11-physical-stage-and-member-equilibrium.md)
for the eight changed values in the two requested frozen arches (#1952).
