# Span lateral-reader acceptance audit (#2198, round 23)

The 40×40 column span fixture's historical 10/14 acceptance expectation predates
[mandatory stirrup closure](2026-11-directional-stirrup-legs.md#stirrup-closure-is-a-beam-layout-constraint-2198).
This round changes test expectations and adds evidence; production code and
engineering results do not change. The existing `directional-stirrup-legs`
registry event already records the closure correction. No new registry event,
results version or advisory is assigned for this test audit.

The [exact record](2198-round23-span-lateral-audit.json) contains all 14 span
outcomes before and after closure eligibility, every formerly accepted cage,
its current joint recheck, each retained proposal's non-passing check rows,
unresolved anchorage values and exact exhaustion record. The before run changes
only `joint-threading.ts` to its version immediately before `40dc804e0`, with
the current solver and all other production files unchanged. It restores the
historical 10 verified / 2 anchorage / 2 torsion population exactly. Returning
the current domain produces 3 verified and 11 exhausted spans.

## Seven additional refusals

All seven former cages use six Ø10 slots against eight column bars. Mandatory
closed-stirrup geometry under CIRSOC 201-2025 §25.7.1.2 leaves no eligible
layout passing both column joints under the existing clearance checks.
Their former cages fail congestion at both ends. The search's retained failing
alternatives must not be confused with those formerly accepted cages:

| Span representative | Current outcome and limits | Retained proposal evidence | Former cage's overlap at each joint, m |
| --- | --- | --- | --- |
| 37 | SEARCH_EXHAUSTED anchorage | Bottom start: 0.2542426406871193 m available, 0.29445564691477727 m required by ℓdh under §9.7.3.8.2. | -0.008592724864350702 |
| 43 | SEARCH_EXHAUSTED anchorage | Same bottom-start ℓdh values as 37. | -0.008592724864350702 |
| 54 | SEARCH_EXHAUSTED torsion | Support upper-face longitudinal steel: 4.37 cm² required, 3.92 cm² provided; ratio 1.112. §9.5.4.3 adds torsion steel; Al,min §9.6.4.3 governs. | -0.008592724864350702 |
| 60 | SEARCH_EXHAUSTED torsion | Same support longitudinal torsion values as 54. | -0.008592724864350702 |
| 70 | SEARCH_EXHAUSTED minSteel,torsion | Span bottom longitudinal torsion: 3.61 cm² required, 3.14 cm² provided; ratio 1.148. Minimum flexural steel is a warning, 3.08/3.14 cm², ratio 0.981. | -0.007535533905932774 |
| 87 | SEARCH_EXHAUSTED flexure,minSteel | §9.5.1.1 span flexure: 55.17 kN·m demand, 55.08 kN·m capacity; ratio 1.002. Minimum steel is the same passing warning as 70. | -0.008350084177231393 |
| 104 | SEARCH_EXHAUSTED minSteel,torsion | Same span torsion and minimum-steel values as 70. | -0.007535533905932774 |

`minSteel` in these limit lists includes a warning; it is not a failed minimum
steel check. Torsion or flexure actually fails. All seven outcomes have no
accepted cage or certificate and declare `implementedAlternatives` exhaustion,
not demonstrated section inadequacy. Their unimplemented alternatives remain
explicit in the record. These design-search refusals occur before document
generation; round 21's incomplete-cage hold did not cause the seven losses.

## Lateral behavior remains tested

The exact 40×40 model and all 14 identities remain checked. Its three accepted
spans still develop fy at every bottom end in a column. The design/detailing
anchorage comparison is exact, with 32 compared ends and no mismatch. Its
memoria census is pinned to the actual independent torsion and minimum-steel
readings, without an anchorage failure. Existing analysis and generation holds
remain visible rather than being mistaken for a change to the lateral rule.

A separate 50×50 column control designs all 14 spans under the same undeclared
lateral assumption. It preserves the original `compared > 50` anchorage
coherence assertion, every reader's fy statement, and locally correct answers.
The section change belongs only to this additional control; it does not replace
or alter the reported 40×40 fixture. Both use the same bottom-end and reader
assertion helpers. The unchanged declared-gravity 40×40 control still designs
all 14 spans with the §9.7.3.8.2 150 mm rule. No missing crosstie is supplied or
assumed by this round.

The per-span audit is the one source for both identity expectations and
aggregate status counts, preventing independent count literals from drifting.
Every former cage is reverified rather than accepted from a recorded label.
The reproducer commit conditionally skips the stale expectations with
`known wrong result: #2198`; enabling it on parent production fails four tests,
including the added per-span inventory reproducer. The final commit removes
all skips. Targeted real-WASM reader, anchorage, lateral-role and closure tests,
plus `make typecheck.web`, validate the correction. No acceptance threshold,
engineering tolerance or baseline is relaxed.

This is not a new numerical safety fix, so it adds no claim of a new native,
planar/spatial or linear/nonlinear calculation matrix. The underlying closure
fix and its entry-point coverage remain documented in its existing result
record. No new silent wrong main/release result is established by this audit.
