### Fixed

#### Refuse workbooks that would lose loads or prescribed rotations (#2364)

Workbook import preserves the current model if a declared planar nodal load has a nonzero out-of-plane component or a prescribed support rotation has an invalid value or incompatible unit.
