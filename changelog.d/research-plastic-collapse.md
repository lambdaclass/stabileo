### Added

#### Classic plastic collapse benchmark

One fixed-base portal at `/research/benchmarks/plastic-collapse`, using the
production 3D plastic-collapse WASM solver and Stabileo viewer, compared with beam,
sway and combined virtual-work bounds. The native test asserts every hinge event
(element, end, order, sign, |My| = Mp, λ within 1e-6), equilibrium, the corner moment
and that no other member end yields; the live WASM run is compared with the replay
event by event. The bounds are our own hand derivations (Horne as background), the
header counts the six hand-calculation checks, and the page adds hinge-event and
displacement tables, a status region and six languages. No production numerics or
tolerances changed.
