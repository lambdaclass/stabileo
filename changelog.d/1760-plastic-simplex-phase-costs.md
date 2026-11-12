### Fixed

#### Cache fixed plastic certificate simplex costs (#1760)

Evaluate each simplex phase’s fixed column costs and entry permissions once, and track basis membership directly. Both 2D and 3D plastic certificates use this shared path. Reduced-cost arithmetic, pivot choices, reinversion cadence, certificates, refusals and resource limits are unchanged. An operation-count guard covers the exact #1760 certificate input and feasible, degenerate and infeasible LPs without depending on runner wall time.
