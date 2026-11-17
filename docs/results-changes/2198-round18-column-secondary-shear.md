# Both column shear directions share column tie rules (2026-11-17)

The direct, prepared and concurrent element verifiers used the beam
transverse-distribution table for columns and walls in both directions.
The secondary call at `cirsoc201.ts` therefore refused ordinary column ties
for insufficient beam legs. The same path also lacked the ordinary column
tie-spacing limit for fixed cages. A strength pass alone could leave an
excessively spaced column cage marked acceptable.

The directional checker now requires an explicit beam or column member
classification. Both directional calls share that classification and the
same `columnShearSpacing` evaluator used by the authoritative provided-cage
verifier and candidate generation. Column bar selection precedes shear
verification so `columnTieSpacing` receives the actual selected longitudinal
bar diameter. The column detailing output reads that helper too.

## Normative decision and test contract

[CIRSOC 201-2025 Chapter 10](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-10-columnas.md#c10.6.2.1),
§10.6.2.1, requires minimum shear reinforcement where Vu > 0.5φVc.
Equality belongs to ordinary ties. §§10.7.6.5.1–10.7.6.5.2 apply the column
shear-spacing table where shear reinforcement is required. That table limits
spacing along a column and has no beam across-width leg requirement.
§10.7.6.1.2 also invokes
[§25.7.2.1](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-25-detalles-de-armado.md#c25.7.2.1)
for ordinary ties. The most restrictive applicable spacing governs.
The applicability decision uses unrounded concrete capacity and the actual
cage's engine result, including its provided Vs for the column table row.
Minimum shear steel is enforced only where required for columns; ordinary
bar-restraint ties remain mandatory.

[Chapter 9 §9.7.6.2.2](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-9-vigas.md#c9.7.6.2.2)
is the beam distribution rule. The wide low-demand beam fixture still fails
with two or four provided legs and passes with five or six. The CI expectation
of the literal Spanish sentence is stale: the check emits the structured
`codes.cirsoc201.shear.legsInsufficient` message with a nested direction label.
The assertion now checks that exact message and all its parameters.

The test's `2005` parameter selects its strength edition. Its existing legacy
beam distribution policy explicitly evaluates the 2025 table; this round
preserves that behavior and does not claim §9.7.6.2.2 is a 2005 clause.
The column-spacing evaluator does not implement 2005 column shear spacing.
These callers now retain its explicit unsupported refusal, matching the
provided-cage verifier, rather than treating the 2025 beam table as a 2005
column verdict. No unavailable 2005 provision is inferred.

The provided-cage geometry test now computes depth from the actual cage
diameter for every member and direction. It retains the exact capacity,
ratio and failure-side assertions. The Russian batch label names the
secondary direction explicitly. The obsolete column-only description of
`shearSecondary` is removed.

## Results and validation

Numerical replay models and outcomes are recorded in the companion
[JSON record](2198-round18-column-secondary-shear.json). This changes
verification statuses and selected legacy tie spacing; it does not change
the native section kernel. There is no separate native implementation of
this TypeScript applicability path. Real WASM section checks and planar and
spatial linear/P-delta solves exercise its callers with full and compact
station transfer.

The declared-gravity flagship retains the exact shared 408-member baseline:
372 verified, 23 search exhausted, 13 biaxial proposals, fingerprint
`e61212184720b0b6`. No baseline, tolerance or assertion threshold is relaxed.
The beam controls, actual-cage capacity assertions, column requirement
threshold (below/equal/above), both table rows, ordinary and required spacing
boundaries, unavailable-edition refusal and minimum-steel applicability are
covered by targeted tests. Direct, prepared, concurrent and the three solved
result wrappers are exercised.

The deferred torsion implementation, secondary-demand cutoff and cage-option
scoring are unchanged. No new safety advisory is assigned by this change.

## Isolated main-source exposure

The direct element verifier from `origin/main@44d527d64` marks the square
column with eight Ø16 bars and Ø8 ties at 0.256256 m **ok in both shear
directions and overall**, with no diagnostics. Its ordinary tie limit is
0.256 m under §25.7.2.1; the corrected verifier fails both directions and
overall. Strength values for this fixed cage are unchanged. The complete
model and numerical output are in the JSON record. This is a replay of
main's exact verifier source against branch dependencies and existing WASM,
not a complete main checkout or release test. The coordinator decides
whether existing SA-075 coverage or any further advisory is appropriate.
No advisory is created here.

## Snapshot audit of the affected design corpus cases

The [exact field and cage record](2198-column-tie-snapshot-audit.json) lists
all 112 changed fields: 16 each in `design-rc-design-qa-8`,
`design-footing-rc-footing-cad-poc`, `design-rc-design-qa-row2` and
`design-rc-design-qa-seismic`, plus 48 in `design-rc-qa-diagnostic`.
Only columns change: e1–e4 in the first four cases and e1–e12 in the
diagnostic case. The first two cases contain the same frame;
the footing checks themselves do not move. No analysis force, displacement,
combination, longitudinal capacity or authoritative provided-member verdict
moves. No fields are added or removed.

Replaying `46a866f78`'s exact `cirsoc201.ts` against branch dependencies and
WASM reproduces all five committed snapshots within the existing comparator.
Restoring `08a259aed`'s verifier alone reproduces exactly these 112 movements.
This isolates the cause to the already tested column-rule correction.
The existing snapshot tests fail on `08a259aed` before regeneration.

For the 400 mm square columns in the first two cases, the seismic case and
the diagnostic case, the old beam spacing
policy selected two-legged Ø8 ties at 0.175 m. Ordinary column ties now use
§25.7.2.1 with the selected Ø16 longitudinal bars: the maximum is
min(16 × 0.016, 48 × 0.008, 0.4) = 0.256 m. The existing spacing search selects
0.25 m. The actual unrounded concrete resistance at that spacing puts both
shear directions below the §10.6.2.1 requirement threshold. This is a changed
selected cage, with unchanged concrete capacity and shear demand, so its
shear capacity decreases and demand/capacity increases in both directions.
Every affected shear status remains `ok`.

For the 500 mm square `row2` columns, the old beam across-width rule selected
three primary legs and refused the two secondary legs. The column table
§10.7.6.5.2 has no such across-width requirement. Both directions now use two
legs, with the same 0.225 m common spacing. Primary capacity decreases and
its ratio increases; secondary capacity and ratio stay unchanged, and its
status changes from `fail` to `ok`. Overall status changes from `fail` to
`warn`: the unchanged flexure warning still governs. The corpus name does
not make a column subject to the beam table.

The `row2` spacing remains 0.225 m for a reason. The ordinary Ø20/Ø8 tie limit
is 0.32 m, but trial spacings 0.3, 0.275 and 0.25 m put the two secondary legs
below minimum shear steel. The engine then evaluates concrete resistance
under [Table 22.5.5.1](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-22-resistencia-de-las-secciones-de-los-elementos.md#c22.5.5.1)
for that actual provision. At the recorded first `1.4D` station this requires
shear reinforcement under §10.6.2.1, and §10.7.6.5.2 limits spacing to
0.2295 m. At 0.225 m the provided steel meets the minimum and the engine's
concrete capacity puts the demand below the requirement threshold. The
shared cage across all stations and both directions retains that spacing;
the audit records the trial inputs and unrounded results.

The capacity movement follows
[§22.5.1.1](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-22-resistencia-de-las-secciones-de-los-elementos.md#c22.5.1.1)
and [§22.5.8.5.3](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-22-resistencia-de-las-secciones-de-los-elementos.md#c22.5.8.5.3):
Vn = Vc + Vs and Vs depends on the provided Av/s. No material resistance,
strength factor, tolerance, demand or assertion is adjusted. These are
intended consequences of the column rules, not changes to footing design
or the native strength kernel. The existing `column-tie-shear-spacing`
registry entry covers these RC capacities, ratios and statuses without
broadening its declared quantities or applicability.

The seismic and diagnostic cases were found by running all nine cases in
the targeted design snapshot file after updating the three initially
reported failures. Their additional 64 movements have the same isolated
cause: two-legged Ø8 ordinary column ties change from 0.175 m to 0.25 m.
Every fixed-direction concrete capacity, demand and shear status is unchanged;
only shear capacities and ratios move. The exact-source parent replay
reproduces their old snapshots too. All five are registered together under
the existing column-rule entry.
