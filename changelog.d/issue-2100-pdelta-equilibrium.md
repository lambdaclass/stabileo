### BREAKING (results)

#### Refuse P-Delta results that fail the physical equilibrium check

The native 2D and 3D solvers now return an error when the physical residual fails the requested tolerance. WASM reports the same cause when it refuses the result. This also covers the previously rejected spring-frame sweep cases and the nonconvergent #1901 replays. The recheck notice applies to models with structural stiffness or constraint features and potentially affected P-Delta history. See [the results changes](../docs/results-changes/2026-11-pdelta-equilibrium-refusal.md).
