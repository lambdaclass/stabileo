### Changed

#### Certify well-conditioned slab stiffness without full spectral iteration (#1753)

Use conservative eigenvalue bounds verified by shifted Cholesky before computing a full sparse stability spectrum. Accept this path only within the existing product and constraint-rounding limits and with no off-node coupling of dropped rotations. Keep the full spectral and conditional-accuracy paths for all other cases, and reuse symbolic Cholesky analysis across shifted bounds. Preserve the seeded slab sweep, its assertions and its timeout.
