### Fixed

#### Refuse invalid support values in declared workbook frames (#2364)

Malformed stiffnesses, prescribed displacements and support angles, incompatible units, and nonfinite conversions now block import. The diagnostic identifies the row and column, and the open model is preserved.
