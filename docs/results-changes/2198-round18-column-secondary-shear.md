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
