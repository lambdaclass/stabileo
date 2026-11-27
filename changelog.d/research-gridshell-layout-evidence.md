### Fixed
#### Five-node gridshell results verify the displayed catenaries (2026-11-27)

The research page checks each member's shape and self-weight, the free node's equilibrium and the total volume before displaying a live layout. Calling the research WASM solver without a weight restores the published example.

Research comparisons now check complete mesh and load histories, signed benchmark quantities, solver refusals and paired curve samples before reporting agreement. The cut-strip comparison includes the Figure 11(a) unloading switch. Shape-control classifies corroborated stable inverted landings as snaps. The interactive benchmarks now distinguish recorded evidence from results for the selected live inputs.
