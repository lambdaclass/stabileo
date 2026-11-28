### Fixed

#### Preserve ungraded material properties and report thermal assumptions

Profile assignment now preserves materials from older projects whose origin is unknown. Editing only the thermal coefficient retains separate mechanical strengths. Recalculated temperature loads report the assumed coefficient when the material family is unknown. Second-order solves retain thermal assumption diagnostics. Workbook and generator imports preserve the authored material properties. What if shows same-section spatial moment and shear resultants and keeps applied loads consistent with pending diagrams. (#2491)
