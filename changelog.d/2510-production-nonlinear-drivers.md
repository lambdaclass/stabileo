### BREAKING (results)
#### Correct production continuation and curved-frame nonlinear results (2026-11-23)

Planar arc-length analysis now follows the weighted spherical constraint and
returns the exact last accepted state when a trial fails. Planar continuation
recovers member forces from the canonical load pattern. Native co-rotational
warm starts apply the exact target loads and support positions at full load.
Spatial co-rotation refuses shear-centre offsets on curved frame sections
that require unsupported flexural-torsional coupling.
