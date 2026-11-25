### Added
#### Experimental finite-rotation planar beams (2026-11-25)
Total-reference Reissner beams share the truss iteration adapter, including rollback and tangent residual checks. Tests cover section energy derivatives, rigid rotations, unit-invariant arc length, circular bending and mesh convergence toward Euler buckling. The Rust-only experiment admits nodal dead loads and zero prescribed motions, with explicit strain/rotation limits; equilibrium does not certify stability. Production analyses and their guards are unchanged.
