# SA-2026-113: Native supplied-result certification could certify an impossible equilibrium

| | |
|---|---|
| Severity | Medium |
| Status | Published 2026-11-24 |
| Issue | [#458](https://github.com/lambdaclass/stabileo/issues/458) |
| Fix | PR [#2533](https://github.com/lambdaclass/stabileo/pull/2533), merged as `828b0a2a4` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | Main from `029699ff0` (2026-10-17) up to the fix, including tagged releases 0.2.0 through 0.6.4. Reproduced at `b37840cb7` |
| Re-check registry | [`supplied-linear-certificates`](../../web/src/lib/provenance/result-changes/supplied-linear-certificates.json), native supplied-certificate context only |

## Affected features

Native Rust API callers who supply their own linear analysis results
for certification. The affected path covers the 2D and 3D
`certify_results_*`, `certify_load_cases_*` and
`certify_multi_case_results_*` entry points. The web app and WASM
exports solve the model before certifying its results.

## What was wrong

The certificate could bound the error against an assembled matrix
without checking whether the load case had a physically admissible
equilibrium. A numerical spring at a released rotation could carry a
moment that the model itself could not support.

In the 2D regression from #458, the linear solver refused a nodal moment
at a fully hinged joint. Supplying the regularized displacement to the
native API still produced a `Certified` status and a relative bound of
`9.868649107779185e-16` for that case, without a warning. The supplied
combination API returned the same bound for its input case. The
correct outcome is to withhold the certificate and its bounds.

[Results-change record](../results-changes/2026-11-supplied-linear-certificates.md).

## How to tell if your model is affected

Review certificates issued for caller-supplied linear results. Replay
each contributing load case through the fixed linear solver and check
for a stability or load refusal. Check in particular for moments
applied about released rotations with no resisting stiffness.

## Fixed in

The next release after 0.6.4. PR
[#2533](https://github.com/lambdaclass/stabileo/pull/2533) checks each
supplied load case with the ordinary linear solver before certification.
A refused case has no certified bound, and dependent combinations and
envelopes lose their certified status.

## Workaround

Use the native solve-and-certify APIs, which require a successful current
linear solve before issuing bounds.

## What to do with results you already have

Rerun affected linear load cases and their certification in the fixed
version. Withdraw prior certificates for refused cases and any dependent
combinations and envelopes. Correct the model or loads before recomputing
those cases, and repeat dependent checks and regenerate reports that
relied on the bounds.

## Credits and references

See [issue #458](https://github.com/lambdaclass/stabileo/issues/458) for
the original report and [PR #2533](https://github.com/lambdaclass/stabileo/pull/2533)
for the replay, containment and
[native 2D regressions](https://github.com/lambdaclass/stabileo/blob/828b0a2a4a26c136f0e913017020fb76d0c195d1/engine/tests/certify_end_to_end_findings.rs).
