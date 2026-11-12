# Arc-length continuation regroups reference-load arithmetic

This retrospectively registers [PR #1885](https://github.com/lambdaclass/stabileo/pull/1885),
merged on 2026-11-10. The engine change deliberately introduced prescribed
support motion and continuation from a converged state in the 2D co-rotational
and arc-length solvers. This entry records the observed change to existing
zero-start arc-length paths. It is intended arithmetic movement, not an
established engineering regression.

The arc constraint now precomputes `psi2 = f_ref_norm * f_ref_norm` for an
ordinary reference load. Expressions formerly evaluated as
`delta_lambda * delta_lambda * f_ref_norm * f_ref_norm` instead multiply by
`psi2`. These agree algebraically but not necessarily in floating-point
arithmetic. The applied-load norm is also evaluated from the assembled applied
vector instead of `abs(lambda) * f_ref_norm`. Both operations occur in the
shared path used by `solve_arc_length` and `solve_arc_length_from`, including
the WASM wrapper. This is a 2D solver; this PR did not add a 3D arc-length path.

The audit found 2,760 changed frozen inputs across the shallow-toggle,
shallow-frame energy-reference and von Mises families. Adjacent parent
`8f4c3ee6c` / merge `f3beb0528` replay of one input per family gives:

| Frozen input suffix | Changed serialized leaves | Largest absolute movement in that sample | Converged before / after |
| --- | ---: | ---: | --- |
| 0006e86e35791232 | 532 | 4.547473508864641e-13 | true / true |
| 0015ab84c3baa36f | 3 | 3.469446951953614e-18 | true / true |
| 022317310499426d | 25 | 1.7763568394002505e-15 | true / true |

These counts and maxima come from the archived `arc-bisection.json`, comparing
all serialized fields. There are no changed nonnumeric leaves in those three
samples. The maxima mix quantities and are descriptions of exact movement,
not a new acceptance criterion. For example, the shallow-toggle final load
factor changes from 0.9560011200133861 to 0.9560011200133866. Some distances
from independent references increase: the audit retains them rather than
rounding them away. The existing benchmark assertions still pass at both audit
endpoints; their tolerances are unchanged. The historical bisection captures
retain these three actual inputs and every continuation step without rounding. The live frozen set excludes all three
cases because their missing reactions are the open #1949 wrong-result defect;
PR #1952 restores them with corrected outputs.

See the [audit](../verification/soundness-regression-audit-2026-11-11.md) and its
archived bisection evidence for the full comparison. Family sampling establishes
the causal boundary; it is not an independent proof of every one of the 2,760
trajectories. The PR documents separate research limitations, including paths
that return to a previous equilibrium near a sharp limit point. Registration
of the low-order arithmetic movement does not certify those research paths or
claim those limitations are fixed.

`arc-length-reference-norm` requires a 2D nonlinear analysis with members,
connectors or springs, which share the same arc arithmetic.
Recorded linear and 3D runs are excluded. Existing solve stamps record
`nonlinear`, without distinguishing arc-length from load control or displacement
control, so this is the narrowest honest condition in that history. Unknown
history retains the existing conservative policy. The entry declares the
serialized path, displacement, member-force and convergence outputs, not
unrelated linear, modal or design results. The new support-motion feature and
its old refusal boundary are described in the PR; this retrospective entry
specifically records the previously unregistered numerical movement. No solver
code or engineering limit is changed here, and no new advisory is added.

The three arc-length cases are explicitly excluded from both the live frozen
inputs and outputs by the issue-keyed `frozen-exclusions.json` inventory for
[#1949](https://github.com/lambdaclass/stabileo/issues/1949). Historical captures
remain evidence of the arithmetic movement and the missing support reactions;
they are not accepted reference answers. PR #1952 restores the cases with
corrected reactions. This arithmetic registration does not fix that defect.

The legacy corpus judge checks the analysis of each compared field as well as
model applicability. A conservative notice for unknown analysis history cannot
explain a change to `base`, `case` or `combo` linear results: those fields must
satisfy the entry's `when` with `analysis:linear`. The judge and snapshot gate
share this analysis-condition check. In particular, the unchanged v0.2.0 truss
linear solve remains unchanged, and a fabricated member force stays unexplained.

Before the #1949 exclusions, the live audit-only frozen outputs were regenerated
after merging main at
`581495d9c` (#1940). The historical adjacent-parent measurements above remain
archived evidence; the retained live snapshots include main's registered
[nonlinear equilibrium arithmetic](2026-11-nonlinear-equilibrium-arithmetic.md).
The #1949 disclosure remains in the audit report, outside the frozen files.
This snapshot refresh changes no engine code or comparison tolerance.
