### Fixed
#### Resolve independent beam directions without relaxing the stability product gate (2026-11-09)

Linear analysis measures node anisotropy within connected coupling components, including
incident transformations whose off-diagonal entries cancel during assembly. The unchanged
load-independent `κ_S A` gate restores the axis-aligned Winkler/SSI limit cases and the thin
cantilever strip's closed-form check; rotated copies must agree or refuse. Unverified,
ill-conditioned shell benchmark meshes now assert their refusal. Plastic 3D refuses soft-spring
hinge states with constraints or connectors that its force-balance check cannot verify.
[SA-2026-054](../docs/advisories/SA-2026-054-unresolved-linear-stiffness.md) warns about past
linear results returned silently beyond the matrix precision bound (PR #1753).
