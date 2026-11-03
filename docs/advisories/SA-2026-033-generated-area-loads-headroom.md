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

## How to tell if your results are affected

A model whose loads were generated in PRO after 2026-11-03 04:37 UTC, with a panel or a beam that
has a member less than 2.2 m above part of it (a canopy, a mezzanine edge, a sloped brace, a low
roof beam beside a higher floor), and "panels lie within the roof's structure" in the derivation.
Generate the loads again and compare.

## Fixed in

PR #1253. A panel is left out as roof structure only when roof structure lies over every probe
(straight over it, or between roof members on both sides within the panel), all of it less than
2.2 m above, a deck or beam less than 2.2 m above its center, and the loads already kept less than
2.2 m above carry all of it: loaded panels, the tributary strips of members loaded by width, and
(by panels) shells, checked top-down on a grid whose every cell must lie wholly within one of
them. Otherwise that panel keeps its whole area load as roof load, and what both carry is counted
twice. That is
not conservative for uplift, overturning or seismic weight, so the derivation counts those panels
and members and asks the engineer to check them. Truss members count as roof structure. A panel or member only partly under low
structure keeps its load, as floor load when a floor or roof stands over its center and as roof
load otherwise, and the derivation names how many of each. So a panel ends up dropped, kept as
roof load, or kept as floor load, never dropped on partial evidence. A member loaded by width beside a floor panel keeps its load. The cases above are
regression tests in `web/src/lib/engine/loads/__tests__/plan-gravity-headroom-coverage.test.ts`
(all red before the fix but the two that guard against over-correction); the shed, hall,
stadium and pipe-rack cases of `plan-gravity-low-headroom.test.ts` are unchanged.
