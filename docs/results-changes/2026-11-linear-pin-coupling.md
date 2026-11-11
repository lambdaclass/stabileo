# Linear pin checks retain small couplings (2026-11-11)

Issue #1931, following PR #1753. Registry entry: `linear-pin-coupling`.

## Defect and reproducer

The soft-direction coupling filter in `engine/src/solver/stability.rs` removed
couplings within its projection-rounding bound before storing
`FreeDirection.coupling`. The same list serves the post-solve `check_pins` check,
so a filtered coupling could load a pinned rotation without being checked.

The exact issue matrix, with `e = f64::EPSILON`, is:

```text
K = [[1, 1,     0.5],
     [1, 1 + e, 0.5 + e],
     [0.5, 0.5 + e, 1]]
f = [0, 0, 1]
```

The first two DOFs are rotations at node 1; the last is a translation at node 2.
Before the fix, dense and sparse analysis both report `Stable`, identify one
unresolved rotation, and retain an empty coupling list. The direct-load check
passes. Both pinned solves return
`[-0.3333333333333334, -0.3333333333333335, 1.3333333333333335]`, and `check_pins`
incorrectly accepts the response. These values are captured in
`.issue1931-reproducer-before.log` in the implementation worktree.

Subtracting the first equation from the second gives `u1 = -u2`; the first then
gives `u0 = u2/2`. Thus the exact original-system response is
`[2/(3 - 4e), -4/(3 - 4e), 4/(3 - 4e)]`. The pinned response has a wrong first
rotation sign and materially wrong rotations. A small residual in the stiff
equations does not establish accurate soft rotations.

## Correction and scope

Couplings within projection rounding remain available to `check_pins` while
remaining excluded from the spectral coupling test. A nonzero indirectly applied
load on this unresolved direction now triggers the existing refusal naming node
1. The load-independent verdict stays `Stable`; the solve withholds the response.
The zero-load check still passes.

Complete removal of these small couplings requires the existing
`ReleasedRotations::permits` check: explicit release information must span the
soft direction. A separate rank-deficient rotational-block regression supplies
that release information and requires the indirectly loaded translation to
continue passing the pin check. Larger couplings retain the spectral check even
for explicit releases. The existing bounded substitution of an explicit release
direction, formerly used only for negative rounded eigenvalues, also applies to
nonnegative unresolved eigenvalues. It still requires a unique soft mode,
separation from other eigenvalues, the existing eigenvector-rounding bound, and
explicit release permission. This preserves the valid #1193 unit-converted
release without broadening its release span or a tolerance. No tolerance,
numerical baseline or existing numerical assertion is loosened.

This corrects a defect in the unmerged #1753 stability gate. Issue #1931 explicitly
identifies it as a branch defect. At the inspected `origin/main` (`cb671ed31`),
`linear.rs` does not call the prototype stability module, and that module has no
`check_pins` or stored coupling list. No new advisory is added. The exact matrix
is an internal solver regression, not a demonstrated silently wrong public model
on main or a release. The registry requests re-checking linear results from earlier
revisions of #1753 and declares solve outcomes and diagnostics only.

## Validation

Commit A adds two ignored failing tests with `known wrong result: #1931`, one for
each dense/sparse analysis and pinning path. Running them explicitly before the
fix gives two failures at the expected refusal assertion. Commit B removes the
ignores and both pass. The explicit-release control passes before and after.

Targeted validation: stability units pass 15 tests before (two new tests ignored)
and 17 after (no ignores); release-profile metamorphic `stability::` passes 39
before and after (one unchanged ignore); `conditioning_adversarial` passes 21
before and after. The loaded C08 corpus retains all 400 solved copies, zero
splits, identical per-issue outcome counts and the same worst reference
comparison. No existing expected verdict or issue classification changes.
Existing ignored tests outside #1931 remain unchanged. The registry's exact legacy notice lists
include this new entry and continue to check main-first ordering; arbitrary
numerical displacement changes remain unexplained by this solve-outcome notice.
