# Mesh preparation in unified PRO

The unified PRO option enables automatic adoption of loose shells and mesh-at-solve slabs as physical plates. With meshing enabled, coarse original shells can be meshed before analysis. Batch remeshing fits adjacent plates at shared nodes and can refine grids around openings. Displacements, reactions, member forces and shell stresses can change when the discretization changes. When individual cells carry different pressures, corner loads or scenario-specific load records, automatic adoption retains the source mesh and loads. Inspect the prepared mesh and rerun the analysis. The three historical withdrawals are recorded in [the withdrawal note](2026-11-unified-pro-plates-withdrawn.md).

Both build profiles read the current structural solver, validation code and results registry from the checkout.

## Unused stock in bar bending schedules

Previous schedules could understate unused material on the last stock bar of a mark. For 12 m stock and a single 5 m piece, the reported 2 m allowed for a second piece that was never cut. The corrected remainder is 7 m. Three such pieces require two stock bars and leave 9 m. Offcuts are added across marks to give the exported total. Regenerate affected schedules before using their waste quantities.

## Wind pressure at member cuts

On the unmerged integration branch, two linear loads could match a curved pressure's whole-span work moments while giving a different shear or bending moment at an interior cut. The generator accepts two loads for a curved band only when they preserve its four work moments, satisfy the half-band force check and track the pressure at the endpoints and quadrature stations of both halves. If either half misses the profile, the generator refines the whole original band. Regenerate wind loads saved by an affected integration build, then rerun the analysis. Solving the old distributed loads again retains their original pressure approximation.

## Shared edges of declared plates

A disabled-profile integration build could accept two plate meshes with different nodes along their common edge. Both profiles now reconcile and check those nodes before applying a batch. Remesh affected adjoining plates and verify connectivity before solving again.

## Positive overlaps on split members

An unmerged integration build could discard part of a distributed load when that part covered a very short interval on a child member. The split now refuses any positive overlap below the solver's existing geometric limit. An exactly empty intersection still transfers no load. Check the original load extents and redo any affected edits before analysis.

## Formulation of drawn quadrilateral shells

In the production profile, a newly drawn quadrilateral retains the flat formulation unless the user explicitly selects curved. A warped flat shell reaches the solver's normal warp check. Unified PRO retains its automatic curved-shell selection. A disabled-profile integration build could mark a drawn shell curved automatically; its saved flag does not record who selected it. Review the formulation of such shells before reanalysis.

## Saved UK concrete beam designs

With unified plates disabled, the UK beam check again inherits the neutral-axis depth limits used by the published design. Unified plates use the limits in the UK National Annex profile. This affects the limiting moment above which a beam needs compression reinforcement. Recalculate UK beam designs when moving between these builds or reopening work designed in an intermediate integration build.
