### BREAKING (results)

#### Apply warp containment to all flat quad inputs

The MITC4 and MITC9 warp checks now use the same node IDs as the solver. Basic 2D and Basic 3D refuse projects with shell elements, including slabs meshed into beams. Direct 2D inputs refuse nonempty shell maps and lists. Plane models with empty legacy shell lists still solve. See [the results change](../docs/results-changes/2026-11-warped-quad-containment.md). (#2535)
