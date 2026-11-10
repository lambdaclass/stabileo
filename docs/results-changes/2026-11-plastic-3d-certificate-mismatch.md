# Checked 3D plastic analysis refuses a factor outside its certificate (2026-11-10)

Results-change entry `plastic-3d-certificate-mismatch-refused`.

`certify_plastic_3d` returned an `Ok` containing a certified collapse interval and an
incremental `collapseFactor` outside that interval. `solverWithinBounds` was false;
the incremental result also warned that biaxial hinges hold the moment vector at
formation and can produce a conservative lower bound. The certificate's
`certified` field describes its exact bounds, not the incremental factor.

The combined checked entry point now returns the structured safety refusal
`PL-3D-CERTIFICATE-MISMATCH` whenever `solverWithinBounds` is false. No comparison
slack is added. A factor outside by round-off alone is also refused; the original
cantilever control differs from its enclosure by one rounding step and exercises
that strict behavior. The loaded fixed-beam control lies inside its enclosure
and still succeeds. The raw incremental solver retains its lower-bound warnings, and
`certify_collapse_3d` still supplies the independent exact bounds. No numerical
algorithm, bound, tolerance, or baseline changes.

The unchanged issue #1760 artifact previously returned incremental factor
9.345131066713956 with certified interval
[11.574222305948126, 11.57476297081718]. The combined entry point now refuses it.
All thirteen 3D artifacts in the plastic LP budget cluster had the same mismatch
contract, with different factors; the 2D artifact #1261 already returns
`PL-2D-INVARIANCE`. See the measured table and reproducer commands in
[the replay report](../verification/PLASTIC_LP_BUDGET.md).

Existing certificate regressions continue to check exactly the same enclosures,
using the raw incremental result and the independent certificate function. The
new combined-entry regression checks the refusal. Projects with 3D frame members
after a plastic analysis receive a re-check notice; that condition is broader
than the cases that actually change. Independently verify any incremental factor
reported as conservative or outside its certificate before treating it as the
collapse load.

This local fix is not released or deployed. The incremental biaxial hinge
approximation itself is not corrected here. See
[SA-2026-057](../advisories/SA-2026-057-plastic-3d-checked-factor.md).
