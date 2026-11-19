# Scale each case once in 3D load combinations (2026-11-19)

P-Delta per combination, nonlinear solve-each and direct analysis previously multiplied a case's loads by each listed factor, then assembled the resulting loads. Rounding could erase a nonzero contribution. A 1.25 kN nodal load with factors [2⁵⁴, −1.5, −2⁵⁴] reached the solver as zero net load. Summing the factors with compensation first gives −1.5, so the load applied to the model is −1.875 kN.

The combination services now share the engine's compensated per-case factor resolution. Each case's net factor is used for its loads and imposed displacements. Named SRSS, ABS and spectral combinations use those factors when recovering their results. Combinations whose nonzero factors cancel exactly for every case still trigger a refusal.

Re-run 3D combinations that name a load case more than once and review their results.
