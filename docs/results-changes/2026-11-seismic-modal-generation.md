# Modal seismic load generation is unavailable

PR #2316. Issue #2319. 2026-11-19.

Earlier versions generated seismic cases by reducing the response-spectrum analysis to story forces and redistributing those forces over each story. This can change the signed inertia loading along a carrier and therefore its station forces and deflections even when the base shear agrees. The automatic generator now refuses modal requests before it creates any cases, loads or combinations. Use the static equivalent-force method where its applicability checks allow it. [Modal force distribution redesign](https://github.com/lambdaclass/stabileo/issues/2319)

On opening a project, the results notice flags saved generated seismic loads whose generation method was modal or cannot be established. Review or replace those loads before repeating analyses and design checks. Previously saved generated static loads may also be flagged when their provenance predates per-load method recording. Newly generated loads record their static origin individually, so appending a plan cannot certify earlier loads.

The modal analysis still reports modes, periods and mass participation. The static generator applies the equivalent forces as member and shell loads on the physical carriers.
