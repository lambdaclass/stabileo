### Fixed
#### Preserve workbook loads and coordinate-frame declarations (#2364)

- Refuse ambiguous coordinate-frame declarations and unsupported workbook load data before applying the model.
- Keep prescribed support rotations in workbook exports, and use the workbook's declared frame for global results.
- Apply each 2D self-weight rule's signed factor, direction and member scope in direct and combination solves.
- Correct the reflected grid elevations, stiffness wizard, influence envelopes and shell point-load sketch.
