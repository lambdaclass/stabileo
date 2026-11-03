### Fixed

#### Excel and IFC imports put a rectangle's in-depth inertia where every solve reads it (2026-11-03)

A section given to the Excel importer by `b` and `h`, and a rectangular or tube profile in an IFC file (drawn, or named like `500x200` or `200x100x5`), came in with b·h³/12 in `Iz` and h·b³/12 in `Iy`. The app's sections, solves and checks read `Iy` for bending in the depth, so such members bent about their width: a 20 × 40 cantilever deflected four times too much (#532, SA-2026-039). Both importers now follow the app's convention. Models imported before keep their values; check their rectangular sections.
