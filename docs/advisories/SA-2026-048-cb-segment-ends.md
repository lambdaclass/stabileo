# SA-2026-048: CIRSOC 301 Cb missed a sign change at the ends of a declared unbraced segment shorter than the member, and overstated lateral-torsional capacity

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-08 (fixed after 0.5.0; live on stabileo.com since 2026-11-08) |
| Issue | — (found in review of PR #1718) |
| Fix | PR [#1718](https://github.com/lambdaclass/stabileo/pull/1718) (merged 2026-11-08) |
| Affected versions | 0.2.0, 0.3.0, 0.4.0 and 0.5.0, and desktop-v0.1.0-alpha.1 to alpha.3. stabileo.com and builds of `main` from #214 (merged 2026-09-28 19:52 UTC, commit da5bcf309) until #1718 (merged 2026-11-08 08:00 UTC) |
| Re-check registry | results-change entry `cb-segment-ends` |

## Affected features

- **App: the CIRSOC 301 steel check and the steel optimiser**, for a member drawn as a chain
  of elements (it continues through nodes where nothing else arrives) on which one element
  declares an unbraced length shorter than the chain. Cb (§F.1(3), Ec. F.1-1) was then read over
  a window of that length, centred on the declaring element, whose ends generally fall between
  stations.
- Mostly singly symmetric sections (channels and tees) whose moment changes sign near a window
  end: they could get a computed Cb above 1 where the app takes Cb = 1.
- A member whose unbraced segment is the whole member or the whole chain, and a window whose ends
  land on stations, are not affected: they give bit-identical numbers before and after the fix.

## What was wrong

Cb is evaluated over the unbraced segment. #214 made the TypeScript `steelSegmentDiagram` stitch
the chain's moment diagrams and bound the read to a window of the declared length when that
length is shorter than the chain. The TypeScript `momentGradient` then read the curvature and
Mmáx from the stations inside the window only. It interpolated the quarter points, but never the
moment at the window's two ends.

**Missed double curvature (unconservative).** For a singly symmetric section in double curvature,
§F.1(4) requires lateral-torsional buckling to be checked for both flanges. The app computes one
Mn, so it takes the conservative Cb = 1 there. A sign change between a window end and the first
station inside the window was not seen. In the case found in review of #1718, a channel with
stations (t, M) = (0, −100), (0.25, 100), (0.5, 0), (0.75, 0), (1, 0) kN·m read over
[0.1, 0.9] starts at −20 kN·m and reaches +100 kN·m: double curvature. The old read saw single
curvature and computed Cb = 2.55 (12.5 · 100 / (2.5 · 100 + 3 · 80), with MB = MC = 0); the fixed
read gives Cb = 1, out of scope of Ec. F.1-1. Cb multiplies the lateral-torsional buckling
strength, which Mp still bounds, so that member's lateral-torsional capacity was overstated.

**Missed maximum (conservative).** A larger moment at a window end was left out of Mmáx, which
understated Cb.

## How to tell if your results are affected

Your results are affected if all of these hold:

- they were checked with a version in the range above;
- steel members were checked or sized to CIRSOC 301;
- a member is drawn as two or more elements in a row and one of them declares an unbraced length
  shorter than the whole chain;
- the section is singly symmetric (a channel or a tee) and the moment changes sign between a
  window end and the first station inside it.

The re-check registry entry `cb-segment-ends` flags saved projects that have CIRSOC 301 steel
members and a declared unbraced length or flange bracing. That is wider than the cases above:
most flagged projects give the same numbers.

## Fixed in

After 0.5.0; live on stabileo.com since 2026-11-08.

[#1718](https://github.com/lambdaclass/stabileo/pull/1718) moved Cb into the engine
(`engine/src/postprocess/cirsoc301_inputs.rs`), which reads the curvature and Mmáx over the
stations inside the segment and the diagram interpolated at both of its ends. The app asks the
engine for Cb and never computes it itself. Regression tests:
`a_sign_change_at_an_interpolated_segment_end_is_double_curvature` and
`the_maximum_includes_an_interpolated_segment_end` in `engine/tests/cirsoc301_inputs.rs`, and the
parity sweep `web/src/lib/engine/__tests__/differential/moment-gradient-parity.test.ts`: 37 029 of
38 760 inputs are bit-identical with the old code, the 379 where an end changed the read agree to
1e-12 with the old code run on the stations plus the two interpolated ends, and the other 1 352
have fewer than three stations in the window and give Cb = 1 on both sides.

## Workaround

None needed on stabileo.com. On an affected version, take Cb = 1 by hand for a channel or tee
with a declared unbraced length shorter than its chain of elements.

## What to do with results you already have

Re-run the CIRSOC 301 steel check, and the steel optimiser's proposals, of every model with a
channel or tee member that declares an unbraced length shorter than its chain of elements, and
compare the flexural utilisation. Doubly symmetric sections are affected only conservatively.
