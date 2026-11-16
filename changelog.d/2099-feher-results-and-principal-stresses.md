### Fixed
#### Label retained Fehér results and preserve resolved principal stresses (2026-11-14)

The bent-strip research page names the computed load, distribution, mesh and far corner beside
its results. A visible notice remains while the current controls differ, including after stopping
a computation or receiving a solver error. Baseline Hungarian text now explains the open checks
without referring to hidden extended content.

The 3D Mohr tool preserves small computed principal stresses instead of replacing them with zero
when another principal stress is much larger. This changes the frontend tensor calculation;
the structural engine and research solver are unchanged.
