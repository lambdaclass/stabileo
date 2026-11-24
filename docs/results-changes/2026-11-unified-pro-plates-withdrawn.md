# Unified PRO plate results withdrawn in #2509

PR #2509 reverts the unified PRO plates integration from #2365. Its three results changes are no longer in effect. The original entries record what the integration did. Re-run affected analyses in the reverted build if their results were produced with unified PRO.

## Rectangular plate grids around openings

The [perforated plate grid change](2026-11-perforated-plate-grid.md) is withdrawn. Unified PRO's method of adding grid lines at shared nodes around openings is no longer in effect. Re-check results from affected remeshed plates.

## Coarse shells supplied with a model

The [automatic remeshing change for coarse shells](2026-11-plates-mesh-before-analysis.md) is withdrawn. The automatic pre-analysis remeshing of coarse shells supplied with a model returns to the behavior before the integration. Re-check the mesh and re-run analyses that used the withdrawn behavior.

## Conforming plate remeshing across slabs and walls

The [conforming batch remeshing change](2026-11-plates-conforming-batch-mesh.md) is withdrawn. Unified PRO's batch placement of shared edge nodes between slabs and walls is no longer in effect. Re-check mesh preparation and results that depended on that remeshing.
