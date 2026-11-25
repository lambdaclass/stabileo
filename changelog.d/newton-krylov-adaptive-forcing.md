### Changed
#### Adaptive forcing for experimental Newton-Krylov (2026-11-25)

The experimental Newton-Krylov iteration now chooses its inner linear-solve
tolerance with Eisenstat-Walker Choice 1. Early Newton steps avoid unnecessary
Krylov work, while steps near the solution retain the former `1e-3` inner tolerance
as a floor, avoiding zero or unattainable requests. Direct corrections reset the
residual history; each inexact step reads the residual only once. Exact
corrections and forced support steps remain unchanged. This affects only builds
with `experimental-nonlinear`; default builds and the web app are unchanged.
