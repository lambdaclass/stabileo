### Changed
#### Typed elastic frame properties (#359)

The direct 2D linear WASM path now retains typed material and section properties through
frame stiffness assembly and force recovery. Rust distinguishes MPa from kN/m² and area
from second moment; TypeScript brands the matching wire fields and display conversions.
Wire numbers, existing validation and numerical tolerances are unchanged. The migration
survey, conversion audit and remaining slices are in `docs/safety/units-in-types.md`.
