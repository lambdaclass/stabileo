# SA-2026-110: Web analysis could omit support springs and load cases

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-22 |
| Issue | [#2292](https://github.com/lambdaclass/stabileo/issues/2292) |
| Fix | PR [#2496](https://github.com/lambdaclass/stabileo/pull/2496), merged as `0b8719c3b` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | Remaining failures reproduced on pre-fix main at `918a76194`. Affected releases are unconfirmed |
| Re-check registry | [`solver-json-boundary`](../../web/src/lib/provenance/result-changes/solver-json-boundary.json) for planar combinations with a case named `__proto__` |

## Affected features

Web solver entry points with non-finite support stiffness, including
the synchronous cable and soil–structure interaction solvers in the
original report and planar P-Delta and planar and spatial harmonic
analysis in later probes. Web load combinations can also be affected
when they repeat a case or, in planar analysis, use a case named
`__proto__`.

## What was wrong

The synchronous cable and soil–structure interaction wrappers turned
`NaN` and either infinity into JSON `null`. The solver interpreted
an invalid optional spring stiffness as absent and returned the same
answer as a model without the spring. The original issue also reported
that summing repeated factors could drop a case with a nonzero net
factor and return a zero response without a diagnostic. PR
[#2341](https://github.com/lambdaclass/stabileo/pull/2341) addressed those
original paths. It sums repeated factors exactly before rounding and
refuses a combination whose nonzero factors cancel for every case.

On main at `918a76194`, after #2341 and before #2496, a planar P-Delta
probe returned node 2 `uz = -0.010900375568815743` without a refusal when
`kx` was `NaN`, `Infinity` or `-Infinity`. Planar and spatial
harmonic probes also returned results for those inputs. A planar
cantilever combination dropped the case named `__proto__` and returned
node 2 `uz = 0`. With an ordinary case name, the same combination
returned `uz = -0.000020833333333333346`. The exact factor sum for
that case was 1. [Results-change record](../results-changes/2026-11-solver-json-boundary.md).

## How to tell if your model is affected

Check support stiffnesses in the original inputs, including values
calculated or supplied by integrations. An omitted spring and an
invalid stiffness could produce the same result. Check for repeated
case entries in combinations and verify each intended net factor.
In planar projects, check the case names for `__proto__`, including in
saved and reopened projects.

## Fixed in

The next release after 0.6.4. PR
[#2496](https://github.com/lambdaclass/stabileo/pull/2496) validates
solver inputs before serialization or the WASM call and reports a
non-finite value with a translated diagnostic naming its field. Named
combination assembly passes each resolved factor once and preserves
cases named `__proto__`.

## Workaround

Verify that every intended spring has a finite stiffness. For
combinations, use ordinary case names and enter each case once with
its verified net factor. Check that the expected case contributions
are present in the solved combination.

## What to do with results you already have

Review the original spring inputs, load case names and combination
factors. Correct the inputs and rerun affected analyses and
combinations. Repeat dependent design checks and regenerate affected
reports.

## Credits and references

See [issue #2292](https://github.com/lambdaclass/stabileo/issues/2292)
for the original report, [issue #2297](https://github.com/lambdaclass/stabileo/issues/2297)
for the exact factor sequence, and PRs
[#2341](https://github.com/lambdaclass/stabileo/pull/2341) and
[#2496](https://github.com/lambdaclass/stabileo/pull/2496) for the
containment and regression tests.
