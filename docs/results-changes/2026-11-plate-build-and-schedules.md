# Mesh preparation in unified PRO

The unified PRO option enables automatic adoption of loose shells and mesh-at-solve slabs as physical plates. With meshing enabled, coarse original shells can be meshed before analysis. Batch remeshing fits adjacent plates at shared nodes and can refine grids around openings. Displacements, reactions, member forces and shell stresses can change when the discretization changes. When individual cells carry different pressures, corner loads or scenario-specific load records, automatic adoption retains the source mesh and loads. Inspect the prepared mesh and rerun the analysis. The three historical withdrawals are recorded in [the withdrawal note](2026-11-unified-pro-plates-withdrawn.md).

Both build profiles read the current structural solver, validation code and results registry from the checkout.

## Unused stock in bar bending schedules

Previous schedules could understate unused material on the last stock bar of a mark. For 12 m stock and a single 5 m piece, the reported 2 m allowed for a second piece that was never cut. The corrected remainder is 7 m. Three such pieces require two stock bars and leave 9 m. Offcuts are added across marks to give the exported total. Regenerate affected schedules before using their waste quantities.
