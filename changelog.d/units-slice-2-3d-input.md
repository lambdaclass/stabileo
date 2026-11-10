### Changed
#### 3D analyses read their materials and sections through unit-typed records (2026-11-08)

Every 3D engine entry point except staged construction now parses E, ν, A, Iy, Iz, J, Cw, the shear areas and the shear-centre offsets into unit types, and the web app builds them with branded types, so assigning, for example, an area to a moment of inertia or a warping constant to a torsion constant no longer compiles. No result changes: the same input parses to the same bits and gives byte-identical results. Plan for the remaining slices: docs/safety/units-in-types.md.
