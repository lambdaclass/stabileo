# SA-2026-095: Signed or scoped 2D self-weight rules could give wrong reactions

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-20 |
| Issue | [#2390](https://github.com/lambdaclass/stabileo/issues/2390) |
| Fix | PR [#2364](https://github.com/lambdaclass/stabileo/pull/2364), merged as `9452c5b74` |
| Fixed release | Pending release |
| Affected versions | 0.2.0 through 0.6.2, desktop 0.1.0 alpha.1 through alpha.3, and main deployments with per-case 2D self-weight before #2364. The 2D combination path reduced a case's self-weight rules to a toggle starting in `c5bd17726` (2026-10-06) |
| Re-check registry | [`exact-plane-self-weight`](../../web/src/lib/provenance/result-changes/exact-plane-self-weight.json) |

## Affected features

Standalone and load-combination analyses of 2D models when the solve
uses saved self-weight rules with a custom sign, factor, direction or
member scope. [Issue #2390](https://github.com/lambdaclass/stabileo/issues/2390).

## What was wrong

The standalone 2D solve used the self-weight toggle and could omit an explicit
weight rule. The combination path reduced a load case's rules to an on/off
setting and could substitute ordinary downward weight over the whole
model. A successful solve could therefore balance a different load from
the one specified, with no refusal or warning about the substitution.

In the replay, a horizontal cantilever has one dead-load case and no
external loads. Its only member has a scoped self-weight rule along
`+Z` with factor `+2`. The specified upward load requires a downward
support reaction. Both the case and the combination containing that case
at factor 1 give the same reaction in each build.
[WASM replay](replays/SA-2026-095.json).

| Vertical support reaction `Rz` | Before #2364 (kN) | With #2364 (kN) |
|---|---:|---:|
| Standalone | 0 | −2 |
| Dead-load case | +1 | −2 |
| Combination | +1 | −2 |

## How to tell if your model is affected

Review saved 2D projects carrying explicit self-weight rules. Look for
a nonstandard signed factor or direction, a scope limited to a list or
group of members, or multiple rules. The Basic static editor builds its
own rule from the self-weight toggle for that workflow.

## Fixed in

PR [#2364](https://github.com/lambdaclass/stabileo/pull/2364), merged as
`9452c5b74`, passes the signed factor, direction and scope to the shared
2D load builder for standalone and combination solves. It adds a re-check
notice on opening affected projects with earlier results.
[Results-change record](../results-changes/2026-11-plane-self-weight-and-workbook-rotations.md#planar-self-weight-rules).

## Workaround

Re-run in a build containing #2364. Until that build is available, verify
the magnitude, direction and scope of the intended self-weight and check
the governing reactions independently.

## What to do with results you already have

Re-run the affected 2D analyses and combinations. Check the reactions
against the intended self-weight, and review any dependent member forces
and design checks. Regenerate and review the affected reports.

## Credits and references

See [issue #2390](https://github.com/lambdaclass/stabileo/issues/2390),
[PR #2364](https://github.com/lambdaclass/stabileo/pull/2364) and the
[replay procedure](replays/SA-2026-094-095.md).
