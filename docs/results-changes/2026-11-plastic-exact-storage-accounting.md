# Exact plastic certification budgets overlapping storage and rational growth (2026-11-10)

Results-change entry `plastic-exact-storage-accounting`; PR [#1888](https://github.com/lambdaclass/stabileo/pull/1888).

Exact plastic certification now sums overlapping equilibrium, floating and tableau
storage. Elimination includes its cloned rows, result basis, pivot row and arithmetic
scratch, and checks numerator/denominator bit growth before each operation. Oversized
requests fail with the exceeded byte or rational-bit quantity and its limit. After
elimination, the actual reduced dimension determines the additional simplex workspace.
The existing 1 GiB engine and 128 MiB fuzz storage ceilings are unchanged.

The initial pivot-cell counter no longer refuses a model. It was neither a stored
cell index nor a measured runtime limit. The 24-member grid's 912050-cell tableau
was incorrectly refused solely by that counter; both engine and fuzz now admit its
storage forecast. Admission does not promise a runtime. Its historical one-second
probe did not establish a memory or 60-second overrun, and no heavy full grid solve
was repeated for this correction.

This changes availability. No incorrect engineering number was established by these
budget findings, and this correction does not alter certificate mathematics or
numerical tolerances. The existing issue-artifact lower-bound and raw-factor assertions
remain active. Re-run a previously refused plastic certificate if its old message
named only member and halfspace counts.

The replay watchdog checks every measured call, including call zero and single-call
runs. Stdout initialization happens before measurement. A first-call-only leak
negative control, planted hang and repeated leak controls verify fail-closed detection.
Allocation traffic now counts positive realloc growth. Historical traffic measurements
remain labeled as such in [the replay evidence](../verification/plastic-lp-budget-replays.json).
See [the verification report](../verification/PLASTIC_LP_BUDGET.md).
