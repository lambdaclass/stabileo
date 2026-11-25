### Changed
#### Adaptive forcing for experimental Newton-Krylov (2026-11-25)

The experimental Newton-Krylov iteration now chooses its inner linear-solve
tolerance with Eisenstat-Walker Choice 1. Early Newton steps avoid unnecessary
Krylov work, while steps near the solution retain a tight tolerance. Exact
corrections and forced support steps remain unchanged. This affects only builds
with `experimental-nonlinear`; default builds and the web app are unchanged.
