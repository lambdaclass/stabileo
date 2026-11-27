# Mesh preparation in unified PRO

The unified PRO option enables automatic adoption of loose shells and mesh-at-solve slabs as physical plates. With meshing enabled, coarse original shells can be meshed before analysis. Batch remeshing fits adjacent plates at shared nodes and can refine grids around openings. Displacements, reactions, member forces and shell stresses can change when the discretization changes. When individual cells carry different pressures, corner loads or scenario-specific load records, automatic adoption retains the source mesh and loads. Inspect the prepared mesh and rerun the analysis. The three historical withdrawals are recorded in [the withdrawal note](2026-11-unified-pro-plates-withdrawn.md).

Both build profiles read the current structural solver, validation code and results registry from the checkout.

## Unused stock in bar bending schedules

Previous schedules could understate unused material on the last stock bar of a mark. For 12 m stock and a single 5 m piece, the reported 2 m allowed for a second piece that was never cut. The corrected remainder is 7 m. Three such pieces require two stock bars and leave 9 m. Offcuts are added across marks to give the exported total. Regenerate affected schedules before using their waste quantities.

## Wind pressure at member cuts

On the unmerged integration branch, two linear loads could match a curved pressure's whole-span work moments while giving a different shear or bending moment at an interior cut. The load generator again subdivides each interval until its linear replacement meets the local moment checks. Regenerate wind loads saved by an affected integration build, then rerun the analysis. Solving the old distributed loads again retains their original pressure approximation.

## Shared edges of declared plates

A disabled-profile integration build could accept two plate meshes with different nodes along their common edge. Both profiles now reconcile and check those nodes before applying a batch. Remesh affected adjoining plates and verify connectivity before solving again.
