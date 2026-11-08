# SA-2026-050: inclined 3D supports mixed local restraints and global springs in the kinematic degree

| | |
|---|---|
| Severity | Medium |
| Status | Draft 2026-11-08; branch correction prepared locally, not released or deployed |
| Issue | Review finding on PR #1780; no separate issue |
| Fix | PR [#1780](https://github.com/lambdaclass/stabileo/pull/1780) |
| Affected versions | Support-rule branch builds from `01d8ed3da` until this correction. The exact normal-Z/global-X case is counted correctly by the counter inspected in tags v0.2.0, v0.3.0, v0.4.0 and v0.5.0. Other legacy combinations have not been exhaustively audited. |
| Re-check registry | `inclined-3d-restraint-directions` |

## Affected features

The engine/WASM 3D kinematic pre-check for a model with an inclined support and a positive
translational spring at that support. The affected outputs are the static degree of
indeterminacy, its classification and diagnosis. No change to stiffness assembly or the
numerical static solution is made by this correction.

## What was wrong

Inclined support translation slot zero represents the rigid normal restraint in the
support frame. Spring slot zero is the global-X spring. The branch combined them with OR
as if they represented the same direction. It could undercount independent directions or
count a coincident normal and spring twice.

The regression fixture has a single frame element, two nodes, and a base fixed in six
directions. At the other node, the normal is `(0, 0, 1)` and `kx` is positive. The normal
and spring direction `(1, 0, 0)` have zero dot product and are independent. The expected
degree, derived in the test, is `6 * 1 + 6 + 2 - 6 * 2 = 2`; the branch returned 1.
For a global-Z spring at the same normal, only one direction is independent, while the
branch counted two. The error can also change the classification on other models.
The direction of the error is therefore model-dependent.

## How to tell if your results are affected

Check whether results came from the branch build above and an inclined 3D support also
has positive `kx`, `ky` or `kz`. Review the reported kinematic degree against the independent
global directions of the normal and springs. The registry flags inclined supports and
springs broadly, including models with no changed count.

## Fixed in

Prepared locally for PR #1780 on 2026-11-08; not yet released or deployed.

The counter now computes the translational rank in global coordinates. Each positive
spring contributes its axis; the normal adds a direction when it lies outside their span.
The exact review reproducer and a 48-case sweep use geometric oracles. Both regression
tests fail on reproducer commit `977684c86` and pass after the fix. All existing core
kinematic tests and the support-rule tests are retained with their assertions unchanged.

## Workaround

Count the independent normal and global spring directions in a common frame before using
the kinematic degree. Do not use the reported degree alone as proof of stability.

## What to do with results you already have

Re-run the kinematic check for affected branch models and review any deliverables that
used its degree, classification or diagnosis. A static numerical result does not change
solely because of this counter correction.

## Credits and references

Found in review of PR #1780. See [the results-change write-up](../results-changes/2026-11-inclined-3d-restraint-directions.md)
and the tests in `engine/tests/core/kinematic.rs`.
