# SA-2026-066: CIRSOC 201 gave end-moment Cm credit to members with transverse load

| | |
|---|---|
| Severity | High |
| Status | Draft 2026-11-14; fixed in PR #2080, pending merge and release |
| Issue | [#2089](https://github.com/lambdaclass/stabileo/issues/2089) |
| Fix | PR [#2080](https://github.com/lambdaclass/stabileo/pull/2080), commit `823da327c`; no fixed release yet |
| Affected versions | Confirmed on main `2e8a4f65f743b23949b995e9ddc9727ad008e225`; the affected sources are unchanged in 0.6.0 main `08fa96822`. Earlier introduction not yet bisected. |
| Re-check registry | [`concurrent-depth-and-load-context`](../../web/src/lib/provenance/result-changes/concurrent-depth-and-load-context.json) |

## Affected features

CIRSOC 201 concrete slenderness and moment magnification for columns and walls
with transverse loads between supports. Planar and spatial models, linear and
nonlinear results, endpoint demands and combination station demands reach the
same design check. Both supported CIRSOC editions now use the conservative
loading rule. The defect concerns design moment magnification; it does not
change the solved elastic forces.

## What was wrong

The check used the ratio of end moments to reduce Cm even when transverse loads
acted between supports. End moments alone do not describe the internal moment
maximum in that case. The lower Cm could reduce the magnified design moment
without a warning identifying the incorrect reduction.

[CIRSOC 201-2025 §6.6.4.5.3(b)](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-6-analisis-estructural.md#c6.6.4.5.3),
printed page 140, requires Cm = 1.0 for columns with transverse loads between
supports. Its commentary says to use the maximum internal moment when that
maximum occurs away from an end. The end-moment reduction is reserved for
members without transverse loads between supports.

The [retained main witness](../results-changes/fixtures/2080-round8-main-witness.json)
contains the model, loads, solved forces and before/control checks. An 8 m
column with a 0.4 m × 0.4 m section, 300 kN compression and 0.1 kN/m transverse
load gives the following results with the same section and restraint:

| Quantity | Main design check | Correct, Cm = 1 control |
|---|---|---|
| Cm | 0.6 | 1 |
| Magnified design moment Mc (kN·m) | 8.1 | 9.140106167179084 |
| Overall status | ok | ok |

The design check has no diagnostic identifying the wrong Cm. Its engine recheck
lists slenderness as not rechecked, so that recheck does not validate the
magnification. The solved linear model also carries a general second-order
analysis warning; that warning does not identify or correct the wrong Cm in
the subsequent design check. These distinctions are retained in the fixture.

A separate direct control in the same fixture, with opposite end moments and no evidence of an unloaded span,
returns Cm = 0.4 and Mc = 60 kN·m on main, versus Mc = 67.13427483312995 kN·m
with unity. These synthetic witnesses show an understated design moment;
they do not bound the error or establish a status change for other structures.
The fixture's recorded hashes of the affected sources match main `08fa96822`.

## How to tell if your model is affected

Review slender concrete columns and walls carrying distributed or interior
point loads transverse to their axes. Check each bending axis and combination.
A Cm below unity is unsupported by the end-moment ratio when there is load
between supports. Missing historical load information also cannot justify
that credit. Loads applied only at an endpoint are outside this between-supports
condition; an axis known to be unloaded retains its valid end-moment reduction.

## Fixed in

PR #2080, commit `823da327c`, carries the loading condition separately for each
axis and combination into the common concrete verification boundary. Only an
axis known to have no transverse load between supports receives end-gradient
credit. Transverse or unknown loading uses Cm = 1 and the conservative
slenderness limit. There is no fixed release yet. Numerical tolerances and
acceptance limits are unchanged.

## Workaround

Until using a build containing the fix, independently check slenderness and
moment magnification with Cm = 1 for axes carrying transverse loads between
supports. Use the internal maximum moment required by the cited clause rather
than relying only on end moments or an old passing status.

## What to do with results you already have

**Re-check slender columns and walls with load between supports.** After
upgrading, re-run the saved design checks and review magnified moments,
reinforcement, utilization, governing combinations and statuses. Revisit
calculations and deliverables that relied on the previous magnification.
The saved-project notice selects concrete models conservatively; it cannot
reconstruct every historical loading condition.

## Credits and references

The defect was reproduced while checking the design path in PR
[#2080](https://github.com/lambdaclass/stabileo/pull/2080) and is tracked as
[#2089](https://github.com/lambdaclass/stabileo/issues/2089). The
[results-change write-up](../results-changes/2026-11-concurrent-depth-and-load-context.md)
and [main witness](../results-changes/fixtures/2080-round8-main-witness.json)
retain the evidence. Regressions are in
`web/src/lib/engine/__tests__/issue-2089-loading.test.ts`,
`web/src/lib/engine/__tests__/review-r8-rc.test.ts` and
`web/src/lib/engine/__tests__/review-r8-witness.test.ts`.
