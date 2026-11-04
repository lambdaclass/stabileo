### Fixed
#### Tools warn when their result is outside what they check, and refuse a near-zero stiffness (2026-11-01)

Fixes from the second review of the eight Stabileo Tools (#900). Every tool now warns when the
largest displacement exceeds span/50, when the engine and the classical formula differ by more than
1%, and, for beam frequencies, when the member is stocky (L/r < 20); a bending stiffness below
1e-6 is refused, because below it the deflected shape silently dropped member loads. The influence
line snapped its section to the mesh, which fixes a shear about 200% off just past a support; the
frequency tool asks for more modes until it has three bending modes; the pilot merges
near-coincident mesh points and states its moment sign convention. The "First version · N review
rounds" note is gone from every tool; the review record stays in
`research/tools/batches/VALIDATION.json`. Re-check any influence-line shear read from a tool before
2026-11-01.
