# SA-2026-119: Omitted material density could give incorrect modal frequencies

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-25 |
| Issue | [#2472](https://github.com/lambdaclass/stabileo/issues/2472) |
| Fix | PR [#2540](https://github.com/lambdaclass/stabileo/pull/2540), merged as `f237e68a5` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | The web dynamic density fallback dates to `82751c430` (first numbered release 0.2.0) and is present in 0.6.4. The incorrect frequency was reproduced on pre-fix main at `828b0a2a4` |
| Re-check registry | [`invalid-dynamic-material-density`](../../web/src/lib/provenance/result-changes/invalid-dynamic-material-density.json) |

## Affected features

Web dynamics that derive structural mass from material density. The
confirmed wrong result is a planar modal frequency with a referenced
material whose density was omitted. The same density preparation
supplies mass to other affected dynamic analyses.

## What was wrong

The density table could substitute zero for an omitted material density,
removing the self-mass of the elements using that material. The
two-member cantilever replay returned a higher first frequency without
a density warning when the second member's material density was omitted.
With both densities supplied, the fixed code returns the original
complete-model result.

[Results-change record](../results-changes/2026-11-invalid-solver-numbers.md#require-material-density-for-dynamic-mass).

## How to tell if your model is affected

Check that every material used to calculate structural mass has an
explicit, verified density. Review the materials assigned to members and
shells, and the constituent materials of drawn sections. Inspect the
mass source and its structural mass before relying on modal frequencies
or any response derived from them.

## Fixed in

The next release after 0.6.4. PR
[#2540](https://github.com/lambdaclass/stabileo/pull/2540) requires
finite nonnegative density where the dynamic mass preparation consumes
it and identifies the material if this check fails.

## Workaround

Supply verified densities for the materials that contribute to mass
and check the resulting mass distribution before solving.

## What to do with results you already have

Restore the intended densities, rebuild the mass source, and rerun the
modal analysis. Repeat affected response-spectrum, harmonic and
time-history analyses, and redo dependent checks and reports.

## Credits and references

See [issue #2472](https://github.com/lambdaclass/stabileo/issues/2472),
[PR #2540](https://github.com/lambdaclass/stabileo/pull/2540) and the
[dynamic-density regressions](https://github.com/lambdaclass/stabileo/blob/f237e68a5/web/src/lib/engine/__tests__/issue-2472-null-numeric-input.test.ts).
