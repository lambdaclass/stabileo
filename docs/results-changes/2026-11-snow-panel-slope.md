# Generated snow on pitched roof panels

## Roof panels use the slope of the roof above them (2026-11-13)

#1929 (`c003f0ae7`) makes CIRSOC 104, ASCE 7-22, EN 1991-1-3 (including its UK
adapter) and TS 498 share the roof-surface slope reader. A beam-enclosed panel uses the
plan-length-weighted slope of the roof members above it. Previously CIRSOC and TS 498
read the panel as flat; ASCE used one measured slope for the whole roof; Eurocode read
the carrying member's surface slope. Flat panels stay flat, and supported explicit
slope overrides remain in effect.

Regenerate generated snow loads on affected pitched roof panels before solving again.
A solve with the old stored loads retains their old values. Changed loads can move
reactions, displacements, member forces, shell stresses, design checks and CIRSOC seismic
snow weight/classification. Hand-entered loads are not regenerated.

The [independent numerical audit](../verification/1929-snow-panel-slope-audit.md) records
shed and duo-pitch models, clause expressions, slope ranges, boundary behavior and
before/after tests. For a warm smooth 20° roof with CIRSOC pg = 1 and Ce = Ct = I = 1,
main's panel receives 1.000000 kN/m² versus the actual-slope 0.538462 kN/m². This
balanced intensity was higher. Main has no ASCE, Eurocode or TS 498 snow generator;
those comparisons concern #1929's unmerged predecessor, not a shipped main result.
Eurocode μ1 and TS 498's multiplier stay constant through the detected rafter range,
so their simple uniform-slope audit examples do not change numerically.

Balanced-load conservativeness does not establish conservativeness of structural effects
or cover drift and unbalanced cases. ASCE short-gable unbalanced snow can require more
than its generated balanced case, and Eurocode multi-span valleys require μ2; their
adapters explicitly warn that these cases are not generated. The audit gives numbers
and tests for these limitations. This change does not implement them, extend the rafter
slope limit or assign an advisory.

The saved-project notice requires generated loads and the dedicated
`generatedPitchedSnowPanels` feature: an actual saved generated S load must have a carrier
on a panel whose shared slope reader detects a roof pitch. Merely having snow cases,
a generated dead load, an unrelated pitched roof, a flat roof or members loaded by width
does not select this notice. Its tests also check that a new solve with stale generated
loads keeps the regeneration notice until the loads themselves are regenerated.
