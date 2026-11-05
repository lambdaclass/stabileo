# SA-2026-044: 2D plastic collapse factor changed with node numbering, member direction and units

| | |
|---|---|
| Severity | High |
| Status | Draft |
| Issue | [#758](https://github.com/lambdaclass/stabileo/issues/758) |
| Fix | #1447 |
| Affected versions | every release with 2D plastic collapse; not bisected |
| Re-check registry | results version entry `plastic-2d-limit-analysis-collapse-factor` |

## Affected features

- **Engine/WASM: `solve_plastic_2d`** (step-by-step plastic hinge analysis of plane frames).
- **App: 2D plastic collapse** (`plasticCollapse2D`, Basic and Pro), on models with constraints,
  springs or several members meeting at hinge locations.

## What was wrong

The collapse factor was where the event-to-event hinge history stopped. When two hinge
candidates tie, or the elastic solve of a nearly unstable step depends on pivoting, the history
takes a different path depending on node and member numbering, member direction and units, and
stops at a different factor. A factor that is too high is unconservative.

| Model (metamorphic tier) | Transform | Before | After |
|---|---|---|---|
| Offset beam with a rigid link | relabel | 46.667 / 118.46 | 46.667 |
| fuzz_rich_2d/20832 | member reversal, relabel, units | 85.73 / 127.22 / 151.38 / 128.07 | limit analysis 123.2927 for all; not confirmed, at the lower 85.73, where the history stops short |
| fuzz_rich_2d/20843 with an equalDOF tie | relabel | 80.166 / 57.30 (app: 40.93) | limit analysis 80.1244 for all; not confirmed, at the lower history factor, where the history stops short |
| fuzz_rich_2d/20772 | units | 0.729 / 3.376 | the same result under every transform checked |

## How to tell if your results are affected

You ran a 2D plastic collapse analysis. The textbook frames (fixed and propped beams, portal
frames under point loads) were already correct; models with constraints, springs, rigid links or
several near-simultaneous hinges are the ones to recheck.

## Fixed in

The collapse factor is now computed by limit analysis: the static theorem as a linear program
over the elastic load field plus the frame's self-stress fields (from unit thermal dislocations
in every member), with the moment checked at the exact cubic peaks of each load piece. It is
independent of numbering, member direction and units by construction, and checked against the
kinematic (mechanism) value in the tests. The hinge history is still shown, with a warning when
it ends away from the collapse load. A model that is a mechanism before any hinge forms is
refused. The limit analysis runs on models of up to 200 members; above that, or when it cannot
settle, the step-by-step factor is reported as not confirmed (`is_mechanism` false, with a
warning), not as the collapse factor. The limit analysis factor is the collapse factor only when
something that shares nothing with its linear program confirms it: the exact plastic certificate
brackets it, or, for models outside the certificate (constraints, inclined supports, axial span
loads, loads on members of irrational length, collapse by axial yield alone), the hinge history ends
at the same load. Otherwise it is reported as not confirmed: at the certificate's lower bound
where the certificate contradicts it or its bounds do not meet, else at the lower of the two factors. The certificate runs on
models of up to 100 members. Tests: `engine/tests/metamorphic/regressions.rs` (`issue_758_*`),
`engine/tests/certify_plastic.rs` (`issue_758_*`),
`web/src/lib/engine/__tests__/plastic-collapse-invariance-758.test.ts`.

## Workaround

Compare the factor with a hand mechanism analysis (beam, sway and combined mechanisms), or check
it with `certify_plastic_2d`, which brackets it between a lower and an upper bound.

## What to do with results you already have

Run the plastic collapse analysis again and reassess any check that used the factor.
