# SA-2026-117: Invalid shell density could reverse or omit self-weight

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-25 |
| Issue | [#2472](https://github.com/lambdaclass/stabileo/issues/2472) |
| Fix | PR [#2540](https://github.com/lambdaclass/stabileo/pull/2540), merged as `f237e68a5` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | Web plate and quad self-weight date to `275587934` and `e800d458e` (first numbered release 0.2.0). The raw quad, nine-node quad, curved-shell and solid-shell body loads date to `a38be261c`, `0f135f200`, `d507104a0` and `68676120a` (also 0.2.0). The affected assembly paths are present in 0.6.4 and the silent failures were reproduced on pre-fix main |
| Re-check registry | [`negative-static-shell-density`](../../web/src/lib/provenance/result-changes/negative-static-shell-density.json), [`invalid-static-shell-density`](../../web/src/lib/provenance/result-changes/invalid-static-shell-density.json) |

## Affected features

PRO 3D static analyses with self-weight enabled for a triangular plate or
quadrilateral shell whose material has negative or explicitly null density
(`rho`). This includes standalone and combination results, including
P-Delta. The negative-density case also affects explicit shell body loads in
the native and raw WASM solver APIs.

## What was wrong

The static load assembly multiplied shell volume by the supplied density.
A negative density reversed the applied self-weight, and an explicit null
in a restored project was treated as zero in the weight calculation.
Stable plate and quad models returned results without a diagnostic about
the reversed or absent load. In the fixed-edge plate and quad regressions,
negative density reversed the sign of the vertical support reaction sum
compared with the positive-density controls. The restored null-density
fixtures returned zero vertical reaction under self-weight.

[Results-change record](../results-changes/2026-11-invalid-solver-numbers.md#refuse-negative-density-in-shell-self-weight)
and [saved-project record](../results-changes/2026-11-invalid-solver-numbers.md#flag-invalid-density-in-static-shell-self-weight).

## How to tell if your model is affected

Check the densities of the materials assigned to plates and shells covered
by each self-weight rule, including the standalone self-weight setting.
If you supplied shell body loads through the native or raw WASM API, check
the density on the load itself. Verify the direction and total of the
applied self-weight against the intended model.

## Fixed in

The next release after 0.6.4. PR
[#2540](https://github.com/lambdaclass/stabileo/pull/2540) refuses invalid
material densities before assembling static shell self-weight and rejects
negative density on direct shell body loads. The saved-project re-check
identifies invalid density on shells covered by an applicable weight rule.

## Workaround

Restore the verified density for each affected shell or explicit body load
before solving. Check the applied loads and their resultant.

## What to do with results you already have

Restore the intended densities. Rerun affected static and P-Delta load
cases and combinations, rebuild their envelopes, repeat dependent design
checks, and regenerate affected reports.

## Credits and references

See [issue #2472](https://github.com/lambdaclass/stabileo/issues/2472),
[PR #2540](https://github.com/lambdaclass/stabileo/pull/2540), the
[saved-project shell regressions](https://github.com/lambdaclass/stabileo/blob/f237e68a5/web/src/lib/provenance/__tests__/static-shell-material-density.test.ts)
and the [raw WASM density regression](https://github.com/lambdaclass/stabileo/blob/f237e68a5/web/src/lib/engine/__tests__/issue-2472-null-numeric-input.test.ts).
