# Automatic loads and concrete design are under audit

Under audit: an internal review found errors in automatic load generation and concrete design, and fixes are still in progress. Check these results independently before using them in a design.

This covers generated wind, snow, gravity and floor-region loads, live loads and seismic loads, and reinforced-concrete design verdicts, detailing, reinforcement cages, seismic member checks and reinforcement sheets. A successful calculation or a passing verdict does not replace independent checking.

The design dispatch, steel and detailing audits have not yet started. Absence of this notice on another feature does not mean that feature has completed an audit.

## Open findings

Checked against the GitHub `wrong-result` label on 2026-11-16. These are the open findings in the scope of this notice; other findings with that label may concern other features. The issue pages carry the current status. Fixes landing on other branches do not change the status of the version you are using.

- [#2096](https://github.com/lambdaclass/stabileo/issues/2096): Foreign-code design dispatcher passes a demand subset when concurrent tuples are missing
- [#2171](https://github.com/lambdaclass/stabileo/issues/2171): CIRSOC 201 secondary shear credits the primary-direction stirrup leg count
- [#2172](https://github.com/lambdaclass/stabileo/issues/2172): Snow: refining a sloped rafter changes a dome panel's roof classification and drops its eave snow to zero (explicit panels)
- [#2176](https://github.com/lambdaclass/stabileo/issues/2176): Snow: members crossing the ridge get one uniform pressure, losing the load moment about the ridge
- [#2199](https://github.com/lambdaclass/stabileo/issues/2199): Partial shell coverage silently loses gravity force
- [#2200](https://github.com/lambdaclass/stabileo/issues/2200): Partial shell coverage moves the remaining gravity load to the wrong location
- [#2201](https://github.com/lambdaclass/stabileo/issues/2201): A floor-load zone loses the moment of its eccentric vertical load
- [#2202](https://github.com/lambdaclass/stabileo/issues/2202): Flat-topped multiple ridges bypass the valley height cap
- [#2203](https://github.com/lambdaclass/stabileo/issues/2203): A single open wall classifies an otherwise closed building as open
- [#2204](https://github.com/lambdaclass/stabileo/issues/2204): Building wall wind omits foundation force and depends on column mesh
- [#2205](https://github.com/lambdaclass/stabileo/issues/2205): Flat-roof wind midpoint sampling loses force and moment
- [#2206](https://github.com/lambdaclass/stabileo/issues/2206): Other-structure wind applies a whole height band at one node and doubles the overturning moment
- [#2207](https://github.com/lambdaclass/stabileo/issues/2207): Office concentrated live load is silently omitted
- [#2208](https://github.com/lambdaclass/stabileo/issues/2208): Seismic force location follows the node centroid, not physical mass
- [#2209](https://github.com/lambdaclass/stabileo/issues/2209): Modal story forces depend on how the same mode is sampled by nodes
- [#2210](https://github.com/lambdaclass/stabileo/issues/2210): Width-mode seismic mass uses the global bounding box
- [#2211](https://github.com/lambdaclass/stabileo/issues/2211): Snow companion combinations say “flat roof” but use slope-reduced snow
- [#2212](https://github.com/lambdaclass/stabileo/issues/2212): Column fit checks array neighbours instead of physical neighbours
- [#2213](https://github.com/lambdaclass/stabileo/issues/2213): A different axial combination waives the failing ductility check
- [#2214](https://github.com/lambdaclass/stabileo/issues/2214): Stirrup spacing row ignores concurrent axial tension
- [#2215](https://github.com/lambdaclass/stabileo/issues/2215): Shaped columns use more steel than the user supplied
- [#2216](https://github.com/lambdaclass/stabileo/issues/2216): Missing primary reinforcement is reported as a successful seismic member check
- [#2217](https://github.com/lambdaclass/stabileo/issues/2217): A layered end-bar input is omitted from the seismic hoop limit
- [#2218](https://github.com/lambdaclass/stabileo/issues/2218): Step-drift transfer loses force and moment and changes with subdivision
- [#2222](https://github.com/lambdaclass/stabileo/issues/2222): Engine drops partial distributed loads on spans shorter than 1e-12, and the self-check passes
