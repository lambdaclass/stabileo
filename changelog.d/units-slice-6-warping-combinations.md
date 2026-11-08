### Changed
#### The warping displacement and combined results go through unit-typed records (2026-11-08)

The 3D warping displacement is now typed as a rate of twist (rad/m), distinct from a rotation, in the engine and in the web app, and the 2D and 3D load-combination exports serialize their results through the typed result records and reach the web app with branded types, as the solve results do since slice 5. No result changes: the serialized results are byte-identical. Plan for the remaining slices: docs/safety/units-in-types.md.
