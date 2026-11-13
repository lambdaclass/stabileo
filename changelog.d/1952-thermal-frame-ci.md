### Fixed

#### Thermal actions stay in the current member frame

- Keep thermal fixed-end actions in the current member frame during 2D/3D
  corotational recovery, including gradients and released ends. This corrects
  the round-9 branch regression without enabling nonlinear thermal analysis;
  main's thermal answers and public refusals are retained. Restrict the
  member-load frame recheck notice to projects with member loads (#1952).
  See the [results-change write-up](../docs/results-changes/2026-11-corotational-member-load-frame.md).
