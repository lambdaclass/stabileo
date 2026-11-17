# Screen each load case once in a combination (2026-11-17)

The single 2D and 3D web wrappers and the new 3D batch resolver each created a case-table row for every factor. The second-order screen applied the case's full aggregated weight to every row. Two factors of 0.5 for the same case therefore doubled the reported ratio even though the displacements and reactions matched a single factor of 1.0. A doubled ratio could also cross the second-order warning cutoff. The fused 3D export uses the batch resolver.

All routes now resolve one row per case and derive one signed screening weight per case. The second-order screen uses the magnitude of that signed weight and treats a negative net weight as a load reversal. Member-chord and initial-curvature screening use the signed weight. The distorted-shell weight limit uses the sum of the magnitudes of the per-case weights. Numerical superposition still processes every original factor in order, including member and shell contributions. An input case table with duplicate IDs is ambiguous and is refused.

Re-run saved combinations that contain a case more than once and review their second-order and shell diagnostics.
