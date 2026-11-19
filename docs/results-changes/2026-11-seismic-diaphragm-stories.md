# Seismic mass retains diaphragm-defined stories

PR #2316. 2026-11-18.

The seismic planner now uses the elevations of rigid diaphragm joints as
story elevations. This applies to both the master joint and each slave
joint. A floor defined by a diaphragm can therefore partition the mass on
a continuous column even when the floor has no beams or shells. Collinear
mesh joints without a story marker still leave the mass partition intact.

For a 4 m column weighing 2 kN/m, a diaphragm at 2 m gives story weights
of 2, 4 and 2 kN at 0, 2 and 4 m. The earlier branch planner dropped the
middle story and assigned 4 kN to each end. With a manual coefficient of 1,
the corrected static plan applies 3 kN to each elevated story's member
segments. Inserting more column joints between the stories preserves this
load distribution.

Regenerate E cases produced by an affected build for models with
diaphragm-defined floors, then repeat the analyses, combinations and
design checks that use those cases.
