### Fixed

#### Block Excel imports that would drop model data (2026-11-20)

Excel import now refuses ambiguous sheet names and repeated headers, invalid coordinate units, populated unsupported columns and member point-load fields, and incompatible plane load components before replacing the current model. Planar rotational springs export under `kr [kN·m/rad]`, and legacy spring workbooks remain readable (#2370, #2383).
