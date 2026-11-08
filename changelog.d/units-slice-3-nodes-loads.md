### Changed
#### Node coordinates and nodal and point loads go through unit-typed records (2026-11-08)

The 2D linear solve and every 3D engine entry point except staged construction now parse node coordinates, nodal forces and moments, the warping bimoment and point-on-member loads into unit types, and the web app builds them with branded types, so assigning a moment to a force or a force to a coordinate no longer compiles. Every parse of a 3D model now goes through the typed records, including one whose type is only inferred. No result changes: the same input parses to the same bits, gives byte-identical results and the same error text, and the web app sends byte-identical JSON. Plan for the remaining slices: docs/safety/units-in-types.md.
