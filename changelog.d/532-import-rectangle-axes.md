### Fixed

#### Excel and IFC imports no longer swap Iy and Iz of rectangles and tubes (2026-11-03)

A section given to the Excel importer by `b` and `h`, and a rectangular or tube profile in an IFC file (drawn, or named like `500x200` or `200x100x5`), came in with b·h³/12 in `Iz` and h·b³/12 in `Iy`. The app's sections, solves and checks read `Iy` for bending in the depth, so such members bent about the wrong axis: a 20 × 40 cantilever deflected four times too much and a 40 × 20 one four times too little (#532, SA-2026-039). Affected since each path landed and in every release up to 0.4.0: Excel sections given by `b` and `h` (since 2026-09-09), IFC sections named `HxB`/`HxBxT` and the no-profile fallback (since 2026-03-04), and IFC rectangles drawn in the file (since 2026-10-18); catalogue profiles and explicit `Iy`/`Iz` were not affected. Both importers now follow the app's convention. Models imported before keep their values; check their rectangular and tube sections.
