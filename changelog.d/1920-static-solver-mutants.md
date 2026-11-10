### Added

#### Static solver closed-form mutation regressions

Static solver tests now check prescribed support movements, member loads, nodal displacements, end forces and reactions against closed forms in 2D and 3D. Fixed-end cases cover warping members and ordinary members in a warping model. The solver mutation scope includes these tests (#1920, first slice of #1378). Engine results are unchanged. See `docs/verification/STATIC_SOLVER_MUTANTS.md` for the selected historical survivors and replay evidence.
