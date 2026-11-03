# SA-2026-033: The load generator dropped a floor's area loads when one low member stood over part of it

| | |
|---|---|
| Severity | High |
| Status | Draft |
| Issue | — (post-merge review of [#1076](https://github.com/lambdaclass/stabileo/pull/1076)) |
| Fix | PR [#1253](https://github.com/lambdaclass/stabileo/pull/1253) |
| Affected versions | main from 2026-11-03 04:37 UTC (merge fc9421f25) until the fix; no release |
| Re-check registry | entry `generated-area-loads-headroom` (models whose loads came from the generator) |

## Affected features

PRO, "Generate loads from the code" (`engine/loads/plan-gravity.ts`), by panels and by width: the
dead, live and roof live area loads it puts on beams, and the seismic weight built from them.

## What was wrong

#1076 taught the generator not to load the panel closed by a trussed shed's bottom chords and eave
beams as a floor. It probed the panel at its center and along its sides, kept only the probes
with a roof member straight over them, and left the whole panel out when those were all less than
2.2 m above it. Probes with nothing over them were dropped, not counted against the verdict.

A 6 × 6 m floor at +3 m with one beam at +4 m over its front edge and open sky over the rest lost
its whole panel: 36 m² of dead, live and roof live area load, with only "1 panel lies within the
roof's structure" in the derivation. By width, the beam under the low one lost its load too.

Two more gaps came with it: truss members were not counted as roof structure, so the probes under
a trussed roof with no purlin over them were dropped the same way; and a ring under a truss deeper
than 2.2 m was loaded as a storey with nothing said.

The same commit sized a panel by its bounding box in the plan's X and Y (#1311): a panel was
taken as too wide for a slab when both sides of that box passed 12 m. A 3 × 20 m deck turned 45°
in plan has a box of about 16 × 16 m, so it lost all 60 m² of its floor load, and the derivation
said, wrongly, that no slab spans it; turned 0° or 90° it was loaded. By width, a floor beam
under low eaves was dropped by its own segment's headroom (#1312): under a gable roof with 2 m at
the eaves and 4 m at the ridge, the two eave-side floor beams of a 6 × 6 m floor got no floor load.

## How to tell if your results are affected

A model whose loads were generated in PRO after 2026-11-03 04:37 UTC, with a panel or a beam that
has a member less than 2.2 m above part of it (a canopy, a mezzanine edge, a sloped brace, a low
roof beam beside a higher floor), and "panels lie within the roof's structure" in the derivation;
or one with a panel not square to the plan's axes and "wider than 12 m" in the derivation.
Generate the loads again and compare.

## Fixed in

PR #1253. A panel is left out as roof structure only when roof structure lies over every probe
(straight over it, or between roof members on both sides within the panel), all of it less than
2.2 m above, a deck or beam less than 2.2 m above its center, and the loads already kept less than
2.2 m above carry all of it: loaded panels, the tributary strips of members loaded by width, and
(by panels) shells, and the parts a panel or member within the roof's structure kept for itself,
checked top-down. Otherwise the part of its area they do not carry stays on the panel as roof
load, found exactly as the panel's plan less theirs (polygon difference; geometry that cannot be
resolved keeps the whole panel), so a 0.05 m gap between two strips keeps 0.05 m of width and no
more. A member loaded by width keeps the part of its tributary strip they do not carry, each of
200 stretches of the member taking the part of it that lies beside that stretch, centred on where
that part lies; a panel carries what it keeps, cut on a 20 × 20 grid, as a one-way slab, from the
nearest of its beams across to the beam opposite (in a notch of a concave panel, between the
beams met either way along a line through the piece), split by the lever rule, so its beams'
loads keep the resultant and both its moments in plan. The derivation counts those panels and members and asks the engineer to check
them. A panel is too wide for a slab only when its narrowest width, across any direction (its convex
hull's, by the normals of its sides), passes 12 m, so a deck takes the same load at any angle in
plan. Truss members count as roof structure. A panel or member only partly under low
structure keeps its load, as floor load when a floor or roof stands over its center and otherwise
as roof load, less what the low structure over it already carries (found as above), and the derivation names how many of each. So a panel ends up dropped, kept as
roof load, or kept as floor load, never dropped on partial evidence. A member loaded by width beside a floor panel keeps its load. The cases above are
regression tests in `web/src/lib/engine/loads/__tests__/plan-gravity-headroom-coverage.test.ts`
(all red before the fix but the two that guard against over-correction); the shed, hall,
stadium and pipe-rack cases of `plan-gravity-low-headroom.test.ts` are unchanged.
