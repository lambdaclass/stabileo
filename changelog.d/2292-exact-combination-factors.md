### BREAKING (results)
#### Resolve repeated load case factors exactly (2026-11-19)

2D and 3D combination analysis sum each case's repeated factors exactly before rounding the net factor. A nonzero residual is retained, and combinations whose nonzero factors cancel for every case are refused. Re-run affected combinations (#2292).
