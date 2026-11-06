### Fixed
#### Fewer false wrong-result reports from the nightly verification run (2026-11-03)

The nightly metamorphic checks no longer report a wrong result when a quantity that is zero in exact arithmetic is compared against rounding noise, when a time history or modal result carries the accuracy of its eigensolve, when two modes are nearly repeated, or when a plastic analysis stops short of a mechanism and reports only a lower bound. Each tolerance scales with the model, and deliberately wrong results on the same models are still caught.
