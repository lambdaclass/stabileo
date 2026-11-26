# SA-2026-125: Kinematic checks could overstate the degree of static indeterminacy

| | |
|---|---|
| Severity | Medium |
| Status | Published 2026-11-25 |
| Issue | [#1192](https://github.com/lambdaclass/stabileo/issues/1192), [#1848](https://github.com/lambdaclass/stabileo/issues/1848) |
| Fix | PR [#2579](https://github.com/lambdaclass/stabileo/pull/2579), merged as `3b5dc0ab3` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | The native count and its WASM exports date to the first numbered release, 0.2.0 (`3be722941`). The count persisted through 0.6.4 and the two examples were replayed on pre-fix main. |
| Re-check registry | [`shared-rigid-support-degree`](../../web/src/lib/provenance/result-changes/shared-rigid-support-degree.json) |

## Affected features

Native and WASM 2D and 3D kinematic reports for inputs with several
plain rigid support records restraining the same degree of freedom at
one node. The result can affect the reported classification or
diagnosis.

## What was wrong

The engine's kinematic count summed restraints across records even when
several records applied the same restraint. In #1192, a planar pinned
support with a redundant roller gave degree 0. The same model with the
pin alone gave −1. In #1848, a spatial fixed support with a redundant
single-axis roller gave degree 1. The same model with the fixed support
alone gave 0. The original reports returned these counts without warning
about the duplicates. Static displacement, reaction and member-force
calculations already used the combined restraints.

[Results-change record](../results-changes/2026-11-shared-rigid-support-degree.md).

## How to tell if your model is affected

Check for multiple rigid support records at one node that restrain a
common translation or rotation. Compare the reported degree with the
degree obtained after expressing the same restraint set in a single
record where the model format permits it.

## Fixed in

The next release after 0.6.4. PR
[#2579](https://github.com/lambdaclass/stabileo/pull/2579) makes the
native and WASM kinematic reports count each rigidly restrained degree
of freedom once per node. The rigid motion test harness uses the same
combined set before rotation.

## Workaround

Represent each node's intended rigid restraint set once, preserving every
restrained translation and rotation. Apply the same consolidation before
using the editor's separate planar degree count. Investigate supports
that also carry springs, prescribed displacements or inclined restraints
with their own definitions intact.

## What to do with results you already have

Rerun the affected kinematic checks with the fixed engine or with the
equivalent consolidated supports. Review the degree, classification and
diagnosis, and update reports and any engineering decisions that relied
on the old count.

## Credits and references

See [issue #1192](https://github.com/lambdaclass/stabileo/issues/1192),
[issue #1848](https://github.com/lambdaclass/stabileo/issues/1848),
[PR #2579](https://github.com/lambdaclass/stabileo/pull/2579) and the
[shared-support regressions](https://github.com/lambdaclass/stabileo/blob/3b5dc0ab3/engine/tests/metamorphic/support_invariance.rs).
