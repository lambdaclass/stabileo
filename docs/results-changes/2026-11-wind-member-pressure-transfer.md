# Wind pressure remains member loading

PR #2220 round 3 replaces endpoint force equivalence with member loading.
The unmerged parent is `a79d2b97a`. No release is asserted to contain that
branch. The existing main-source evidence for #2203–#2206 is recorded in
[the first write-up](2026-11-wind-physical-pressure-field.md).

A continuous line pressure must remain a distributed member load. Its endpoint
forces can conserve force and overturning moment while giving a different
member shear diagram, moment diagram and deflection. The signed reproducer
commit `d15e8fa37` demonstrates this with the uniform minimum on a cantilever
chimney, building net pressure, open sign and lattice tower. Tests are skipped
with the exact Vitest equivalent of `known wrong result: #2220` until enabled
with `RUN_KNOWN_WRONG=2220`. The implementation removes those skips.

The shared height field now requires partial member intervals and their two
endpoint intensities. Cases 1–4, service wind, separate minima and other
structures consume that representation through one member-load constructor.
The old endpoint integrals remain diagnostic quantities for derivations and
effective dimensions; they are never applied to a solver as the pressure load.
The legacy level-force branch has been removed from `WindAxis`; every caller
must supply the member field. A varying field is subdivided until its second and third load moments also
meet the unchanged numerical integration accuracy. Trapezoidal endpoints of
all global components survive generation, storage and application. Wind
combinations recognize member loading as well as nodal loading.

The tributary grid is constructed in coordinates inferred from physical
carriers, independent of global-axis row grouping. Collinear carriers and
rectangular grids support uneven spacings, arbitrary plan rotations and
reflections. A geometry that cannot establish that partition refuses with
`wind.pressure.carrierPartitionUnresolved`. An eccentric field that requires
distributed local torque refuses with
`wind.pressure.distributedTorqueUnsupported`, because the engine's member-load
contract currently has no distributed torque. It is never replaced by endpoint
couples. Extending that engine contract is outside this correction.

An explicit open building is checked before any net-pressure-profile override.
It requires a free-roof type and declared blockage; a missing declaration
blocks the complete wind step. A declared free roof continues through the
free-roof coefficients and its declared blockage. A profile does not replace
that procedure. Separate free-roof horizontal minima are member loads too.

For a uniform cantilever load w, independent equilibrium gives the member
shear w(H−z) and bending moment w(H−z)²/2. Integrating the curvature gives tip
deflection wH⁴/(8EI). At the parent's two endpoint forces, the base member shear
is only wH/2, despite the support reaction including the base force; the tip
deflection is wH⁴/(6EI). Tests check member ends, interior stations, torsion and
a displacement through 2D/3D linear and nonlinear WASM analyses. Exported
inputs exercise the same loads through native linear and P-delta solvers.
Zoned building and free roofs are checked against direct piecewise integrals
of their distributed loads. The eccentric case checks use independent
analytical pressure integrals and include spatial diaphragms.

The registry selects loads whose own W/Wa case and generation marker match.
Manual wind plus generated gravity is a negative control. Regenerate W and Wa,
then rerun analyses, combinations and design checks. Re-solving stored loads
alone does not correct their load representation. No new advisory is assigned
by this change; the coordinator owns advisory scope and numbering.

The native fixtures are generated from the same tested inputs and compared
with the live generator on each Vitest run after JSON serialization. To
regenerate them deliberately, run from the worktree root:

```
make shell <<'SHELL'
WIND_MEMBER_CASES="$PWD/engine/tests/integration/wind_member_2220.json" make test.web.unit FILE=src/lib/engine/loads/__tests__/wind-member-round3.test.ts
SHELL
make test.engine.targeted TEST=integration FILTER=issue_2220_generated_pressure
```

The fixture contains 52 cases, covering the seven physical structure types,
subdivision and rotated force directions. Each native input is solved in
linear and P-delta modes against the independent distributed-load integrals.
