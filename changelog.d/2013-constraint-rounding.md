### Fixed

#### Constraint reduction preserves resolvable physical stiffness (#2013–#2018)

Constrained analyses compare the directional input-rounding envelope with the retained physical stiffness instead of multiplying unrelated worst-case conditioning and cancellation factors. Rotated and mirrored copies of the four-node frame/truss witness now solve through linear, load-session, staged, creep and certified paths. The refusal limit, mechanism checks and response accuracy checks are unchanged. Native and public WASM coverage includes loaded and unloaded models, planar 3D equivalents, pinned spins and P-Delta initial solves.
