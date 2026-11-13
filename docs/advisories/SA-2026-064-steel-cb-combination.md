# SA-2026-064: Steel interaction checks used Cb from another combination

| | |
|---|---|
| Severity | High |
| Status | Draft 2026-11-13; fixed in PR #2080, pending release |
| Issue | [#1316](https://github.com/lambdaclass/stabileo/issues/1316) |
| Fix | PR [#2080](https://github.com/lambdaclass/stabileo/pull/2080); pending release |
| Affected versions | Source-confirmed in 0.2.0–0.5.0 and desktop-v0.1.0-alpha.1–alpha.3; subsequent main builds before the fix |
| Re-check registry | [`steel-cb-combination`](../../web/src/lib/provenance/result-changes/steel-cb-combination.json) |

## Affected features

Steel members in CIRSOC 301 combined axial and bending checks, where the
moment-gradient factor Cb comes from an envelope containing a different load
combination's moment diagram. The defect is in the application's design
orchestration over the WASM capacity checker. It also affects calls to that
shared verification service; a direct native capacity check with correctly
supplied inputs is not this defect.

An unbraced member or chain can have different moment shapes in different
combinations. A combination with compression and nearly uniform bending could
receive capacity credit from another combination's steeper moment gradient.
The resulting interaction utilization could be understated without a diagnostic.
Planar and spatial member models, and linear and nonlinear analysis results,
reach this same design path when their combination diagrams are supplied.

## What was wrong

The application retained concurrent axial force and moments for the interaction,
but computed Cb once from the strong-axis moment envelope. It reused that factor
for every combination, including the engine recheck. Concurrency of the forces
alone therefore did not make the capacity valid for the checked combination.
A certified recheck could agree with the understated result because it received
the same incorrect capacity input.

The retained IPE 300 witness has a uniform-moment combination with compression,
and a second combination with a larger end moment and no compression. Loads are
derived from the section's own capacities for the uniform combination:
`N/Pc = 0.4` and `M/Mc = 0.5`. CIRSOC 301 H.1 requires
`0.4 + (8/9) × 0.5 = 0.8444444444444444`.

Exact main source `b6f13f2500d700adecc48a974d7298f527e3388b` instead returns
`0.6864197530864198`, status `ok`, `engineRecheck.certified = true` and
`engineRecheck.certifiedOk = true`, with no diagnostic. After the fix the
interaction utilization is `0.8444444444444444`. This is the silent,
unconservative witness, even though both utilizations are below the acceptance
limit. A passing status does not make an understated utilization correct.

| IPE 300 uniform combination | Main reported utilization / status | Correct H.1 utilization / fixed status | Main diagnostic |
|---|---|---|---|
| N/Pc = 0.4, M/Mc = 0.5 | 0.6864197530864198 / ok | 0.8444444444444444 / ok | None |
| N/Pc = 0.4, M/Mc = 0.7 | 0.812 / ok | 1.0222222222222221 / fail | VERIF_STEEL_FAIL_INTERACTION |

The `M/Mc = 0.7` variant requires
`0.4 + (8/9) × 0.7 = 1.0222222222222221`. Main also emits the error diagnostic
`VERIF_STEEL_FAIL_INTERACTION` from its preliminary envelope check. That variant
is **not silent**: its `ok` status conflicts with an existing error signal.
The fix reports a consistent failure for the governing uniform combination.

The [generated replay](replays/SA-2026-064.json) retains the exact inputs,
complete before/after verification outputs, certificates, diagnostics and
single-combination controls. Both combinations checked separately retain their
correct interaction answers before and after the fix. The error arises when
their diagrams are combined. These are synthetic witnesses, not bounds on the
error in other structures. The replay was generated with
`make replay.advisory.steel-cb` through the project's targeted test runner and
WASM checker.

### Release boundary

Commit [`bb15c29416539c95c05ec1f478993eff577e2dc1`](https://github.com/lambdaclass/stabileo/commit/bb15c29416539c95c05ec1f478993eff577e2dc1)
(2026-08-23, “feat(steel): compute Cb from the moment diagram, per F.1.1”)
introduced the lookup by envelope in `verification-service.ts`: it merged the
combination diagrams by station before calling `momentGradient` and passed the
result as Cb. Before that change this path did not compute Cb from the envelope.

Each available release tag contains that introduction commit and retains the
affected source path: `steelDemandOf` uses `stationMomentEnvelope`, and
`checkSteelMember` computes Cb from that envelope or the enveloped segment,
then reuses it for combination checks. The replay records the matching source
lines and commit identities for every tag.

| Release tag | Tag commit | Contains introduction and affected envelope lookup |
|---|---|---|
| v0.2.0 | `5b1482c78c0c462f72cf2ea99fc7e7d2e80e9e35` | Yes |
| v0.3.0 | `cc1c88dc62db44c6cf223500d5b014f99159c8bc` | Yes |
| v0.4.0 | `9aad844d596f318f574bf59909e1f4cadaab34b2` | Yes |
| v0.5.0 | `5b940bef711b3e701ae3bf35b015affc69dd082c` | Yes |
| desktop-v0.1.0-alpha.1 | `6e6655ba6431f1c39637536f4a797030771f5eb6` | Yes |
| desktop-v0.1.0-alpha.2 | `2002004557fc129b8a128701b2685056270341d9` | Yes |
| desktop-v0.1.0-alpha.3 | `7182159a9689851678ba8319fc6d116764b88ea3` | Yes |

This is source/tag evidence, not a replay of historical release binaries or a
claim that this exact witness ran without other warnings in every release.
The numerical silent result above was replayed on the identified main source.
The fix is in PR #2080, implementation commit
`8a28989f34e11bc7fe7118471e4027d51a50bfeb`; no fixed release is claimed.

## How to tell if your results are affected

Review steel combined axial and bending checks that used multiple combination
diagrams. Compare the diagram used for Cb with the combination named by each
interaction check, over the same complete unbraced segment. A combination label,
`ok` status or successful engine recheck does not establish that the factor came
from that combination. A single-combination diagram is a control for this
cross-combination defect.

## Fixed in

PR #2080 retains moment diagrams separately by combination, including complete
unbraced chains. The shared steel check obtains both its forces and its Cb
capacity input using the concurrent demand's combination identity. The engine
recheck receives those same combination-specific inputs. Missing or incomplete
combination diagrams do not borrow an envelope's gradient credit. Numerical
tolerances and acceptance limits are unchanged.

## Workaround

Until using a build containing PR #2080, verify affected steel interactions
independently with the forces and moment diagram from the same combination.
Do not accept an old interaction solely because its status or certificate says
it passes.

## What to do with results you already have

After upgrading to a build containing the fix, **re-run steel design checks**
for affected saved projects and review interaction utilization, governing
combinations and statuses. Revisit calculations and deliverables that used the
old steel interaction results. The `steel-cb-combination` saved-project notice
selects CIRSOC 301 steel models conservatively; it cannot prove which historical
combination supplied Cb. Its absence does not establish that a past API call was
unaffected.

## References

PR [#2080](https://github.com/lambdaclass/stabileo/pull/2080) fixes the defect
found while addressing [#1316](https://github.com/lambdaclass/stabileo/issues/1316).
The [results-change write-up](../results-changes/2026-11-concurrent-design-demands.md)
describes the combination and station correction. Retained regressions are in
`web/src/lib/engine/__tests__/concurrent-steel-boundaries.test.ts`.
