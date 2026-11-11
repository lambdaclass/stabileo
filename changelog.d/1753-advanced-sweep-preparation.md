### Changed

#### Avoid repeated preparation and unused stability eigenvectors in 2D sweeps (#1753)

Compute full stability eigenvalues without accumulating eigenvectors for accepted matrices, retaining the same eigenvalue operations, conditioning limits, constraint-rounding checks and refusal modes. Reuse a load session across JavaScript influence force sweeps, including truss ordinates and section jumps, and free it on success or refusal. Keep displacement influence models on their existing split-model solve path. No timeout, tolerance or assertion is relaxed.
