# SA-2026-130: Planar elastic analysis could return results for a mechanism

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-26 |
| Issue | [#2266](https://github.com/lambdaclass/stabileo/issues/2266), [#2380](https://github.com/lambdaclass/stabileo/issues/2380) |
| Fix | PR [#2609](https://github.com/lambdaclass/stabileo/pull/2609), merged as `6d299345e` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | From 0.6.0, which shipped the conditional elastic solve path (`4399b2971`), through 0.6.4. The silent failures were reproduced in both releases. |
| Re-check registry | [`released-tip-mechanisms`](../../web/src/lib/provenance/result-changes/released-tip-mechanisms.json) |

## Affected features

Planar linear elastic analysis, including the constrained entry point,
for models with a frame member whose free tip can swing about a bending
release at the attached end. The silent responses were reproduced in
the native and WASM solvers.

## What was wrong

The tip could translate and rotate as a rigid body about the released
end without straining the member. Rounding in the assembled stiffness
could make the solver treat that motion as having positive stiffness.
In the #2266 and #2380 regressions, the applied loads act at the
restrained joint. Both models returned all-zero displacements with
informational diagnostics only. A zero residual in those cases was
compatible with infinitely many displacements because nothing restrained
the swing.

[Results-change record](../results-changes/2026-11-released-tip-mechanisms.md).

## How to tell if your model is affected

Inspect planar frame members with a bending release at their attached
end and a free tip. Check whether the tip can swing without resistance
from a support, another member, a spring or a constraint. Review
apparently zero displacements even when the solve reported successful
equilibrium.

## Fixed in

The next release after 0.6.4. PR
[#2609](https://github.com/lambdaclass/stabileo/pull/2609) checks the
member releases, attachments and active restraints for the free motion
before accepting the stiffness rank. Analysis refuses a proven mechanism
and identifies the affected node.

## Workaround

Check the releases, connectivity and restraints against the intended
load path. Correct the model where the free motion is unintended and
verify the resulting stability independently.

## What to do with results you already have

Rerun affected planar linear and constrained analyses, including those
used by combinations or as elastic preloads. If the solver identifies
a mechanism, resolve its cause and rerun before using the results.
Rebuild affected envelopes, repeat dependent design checks and update
reports.

## Credits and references

See [issue #2266](https://github.com/lambdaclass/stabileo/issues/2266),
[issue #2380](https://github.com/lambdaclass/stabileo/issues/2380),
[PR #2609](https://github.com/lambdaclass/stabileo/pull/2609), the
[native mechanism regressions](https://github.com/lambdaclass/stabileo/blob/6d299345e/engine/tests/metamorphic/released_tip_mechanisms.rs)
and the [WASM replays](https://github.com/lambdaclass/stabileo/blob/6d299345e/scripts/tests/released-tip-mechanisms-wasm.mjs).
