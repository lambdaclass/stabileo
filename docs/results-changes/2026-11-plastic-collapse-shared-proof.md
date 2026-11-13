# Public 3D plastic factors share the exact proof path (2026-11-13)

Results-change entry `plastic-collapse-shared-proof`; issue #1040.

Both `solve_plastic_3d` and `certify_plastic_3d`, including their native and WASM
JSON exports, now obtain `collapseFactor` from the same rationally checked static
and kinematic bounds. The incremental algorithm is private to the crate and
contributes a history and a candidate field. It cannot publish its own factor.

The returned factor is the lower bound of a positive, finite, ordered interval.
The outward-rounded interval must have relative width at most 5e-8, checked in
rational arithmetic. This is the existing plastic metamorphic adapter's iteration
accuracy, not an increase to any tolerance. A broad certificate is insufficient
to report a collapse factor. Missing bounds, a broad interval, and inputs outside
the exact checker's scope produce errors. The public 2D APIs retain their existing
`PL-2D-INVARIANCE` refusal.

This changes availability as well as numbers. In particular, the exact checker
cannot certify every member load on an irrational local frame, roll angle,
curved beam, shell, connector, constraint, spring, or imposed support movement.
The old raw API could return an approximate history factor for some of those
inputs; the public APIs now require the same proof. The existing member-count,
storage and rational-arithmetic budgets remain unchanged. Exact checking also
costs more than the old raw incremental solve; this change adds no runtime claim
or increased budget.

Certificate bundles continue to use the private history only as an optional candidate; their exported static and mechanism proofs remain independently checked. They do not publish the incremental factor.

Incremental steps, hinges and the mechanism flag retain their historical values.
The warning explicitly distinguishes them from the certified factor.
`certificate.solverCollapseFactor`, `solverWithinBounds` and `solverDeviation`
continue to describe the incremental result, including its discrepancies on
either side of the interval.

## Reproducer and independent reference

The complete input in
[`plastic-1040-single-member.json`](../../engine/tests/fixtures/plastic-1040-single-member.json)
is #1040's November 7, seed 2026110702153 model. Its plastic dimensions are built
with the nightly adapter's formulas and its default yield stress. No member,
load, support or solver property of that saved model was removed.

On parent b6f13f250, the raw API returns 0.000015648939943807853 and reports a
mechanism. Independently generated static and mechanism candidates, supplied
without any incremental result and rechecked in rational arithmetic, enclose
the collapse factor in [0.020350445200427728, 0.02035044520059531]. The new public
factor is 0.020350445200427728. Its mirror, numbering, reversal, axis rotation,
unit changes in both directions and positive load scaling receive their own
independent rational checks in the tests. No baseline or tolerance is widened.
The parent has structured accuracy and instability warnings for this input;
an empty legacy `warnings` list does not make it a silent result.

The raw history is conservative in this case: its factor is about 1300.436 times
smaller than the certified lower bound. The previously recorded above-interval
cantilever case remains checked at exactly 100.00000000000001 versus upper bound
100.0 through `certificate.solverCollapseFactor`; public results now return
99.99999999999999. This is the already documented one-step rounding case in
[PLASTIC_3D_RAW_FACTOR.md](../verification/PLASTIC_3D_RAW_FACTOR.md), not evidence
of an additional advisory.

## Oracle distinction

Additive superposition is invalid for plastic collapse. The existing nightly
check named `superposition` dispatches `Law::Inverse` to the valid identity
lambda(k P) = lambda(P) / k, using k = 3.7. It never adds plastic collapse
factors. Its findings therefore cannot be dismissed as additive-oracle defects.
The harness and its tolerances are unchanged.

The new native tests include a valid cantilever, the retained 2D refusal, the
independent interval checks through both public 3D functions and both JSON
exports, and cases on either side of the new interval-width acceptance rule.
The WASM script replays the same exported transformed inputs and checks both
WASM functions. Run `make test.engine.plastic-1040-wasm`.

## Closed-form mechanism check in the test

The test also computes the true factor's square directly from the saved input,
without using the certificate model, LP, or incremental history. Write the
member chord as d, set v = (d_z, 0, -d_x), and set a = (d cross v)/(d dot d).
The tip's only free nodal rotation is about global Y. Unlimited torsional
resistance imposes d dot theta = 0; since d_y is nonzero, that nodal rotation
is zero in a collapse mechanism. The only free translational mechanism is v.
The member turns rigidly with rotation a, with opposite plastic rotations at
its two ends.

For unnormalised section directions u_y and u_z, and the elliptical bending
capacities M_y and M_z, virtual work gives

    lambda_c^2 = 4 [ M_y^2 (a dot u_y)^2/(u_y dot u_y)
                   + M_z^2 (a dot u_z)^2/(u_z dot u_z) ] / (F dot v)^2.

The opposite end moments on the ellipse that maximise work against a supply
the matching static field. The moment diagram between them is linear and stays
inside the convex ellipse. Unlimited axial force and the restrained Y
translation balance the remaining force components; unlimited torsion and the
restrained X/Z rotations balance the remaining couples. Thus this field and the
mechanism meet at the same factor. No interior member loads are present.

`issue_1040_exact_sway_factor_squared` implements this expression using exact
rationals converted from the input doubles. It constructs the section directions
from the chord and global up, and computes the rectangular capacities from the
saved dimensions and yield stress. The independent LP interval must enclose
that exact square, with no comparison tolerance. The computed true factor is
0.0203504452005953054221466468243911404011562880265661135944786936982473535459.

The [measured values and exact expressions](1040-plastic-collapse-values.json)
retain the rational numerator/denominator, native independent intervals,
parent/new WASM factors and the parent's structured warning phases. They also
include the exact cantilever ratio and its raw rounding excess.

## Saved nightly comment models

The values report also replays all twelve saved models from #1040's issue body
and nightly comments through the parent and corrected WASM APIs. Two 2D models
retain the existing refusal. The two 3D nodal models receive tightly certified
factors. The other eight 3D models have member loads on irrational local frames
and now receive explicit exact-representation refusals. The parent emits
structured warnings for every 3D saved model; these replays establish no new
silent engineering-scale wrong result. An independent point-load mechanism below also establishes a true factor for
one refused model. The other seven refused models have no independently computed
true factor in this change. Their absence of a new published factor is an
availability change, not an independent numerical solution of those models.

## Recovery no longer chooses coordinates from identifiers

The exact compatibility elimination previously numbered its free coordinates
from external node and member ids. The IRLS recovery then regularised and
truncated coefficients in that arbitrary basis. A renumbering of the existing
`frame3d-2` witness could leave a static lower bound near 176.4673257 but a
kinematic upper bound near 271.9607378. This interval is sound but too broad to
report a collapse factor at the required accuracy.

Recovery now derives a layout from exact relative geometry, restraints, loads,
capacities and releases. Component translations and external ids do not choose
its coordinates. Exact elimination supplies the compatibility basis in that
layout. IRLS columns and the work vector are scaled together by the physical
bending dissipation norm, and the lifted coefficients are retained without a
relative coefficient cutoff. All previously configured hinge-set searches run;
the best exactly checked mechanism is retained. No existing iteration bound,
rank tolerance, resource ceiling or numerical assertion is increased.

The new raw API's exact-model admission happens before the incremental history.
The fuzz harness applies its existing certificate budget to that API too,
retaining its original raw-solver member budget. Bundle exports use the private
history as an optional candidate and keep their independent interval proofs,
without an unnecessary second exact solve through the scalar API.

## November 13 point-load mechanism

[`plastic-1040-point-reversal.json`](../../engine/tests/fixtures/plastic-1040-point-reversal.json)
preserves the actual November 13 reduced reversal model and the nightly
adapter's plastic parameters. Its free tip translation is along global X and
its free tip rotation is about global Z. The chord has nonzero X and Z
components. Unlimited axial and torsional resistance therefore lock those
motions in a collapse mechanism; its ends are kinematically fixed.

Let L be the exact chord length, a the point-load distance, and let
N = sqrt((P_z/M_y)^2 + (P_y/M_z)^2). The three-hinge mechanism, with end hinges
and a hinge at the load, gives

    lambda_c = 2 L / [a (L - a) N].

Its matching static field has opposite limiting end/point moment vectors on
the ellipse; the linear moment segments stay inside that convex ellipse.
The test encloses both square roots with exact integer square-root arithmetic
and checks the expression with rational interval arithmetic. It also tests the
same class on a rational, fully restrained beam which receives a verified answer.

The true factor of the saved model is approximately
0.0000537911564172606376576351042832751866923616666678501255045145588497347466031534744050635350.
Both reported nightly values, 0.000053630517190 and 0.000053547353383, are below
it. Neither side of this reversal mismatch is an unconservative factor. The
new APIs refuse this irrational member-load representation explicitly; the
hand calculation is an independent oracle, not a production special case.

## Scale-independent square-root enclosure

The shared ellipse checker previously seeded a rational upper square root from
a binary64 square root and repeatedly advanced to the next float. A positive
nonsquare rational below the floating-point range could start at zero and require
an impractical number of subnormal steps; overflow fell back to x + 1, which
is far too broad. This made proof recovery depend on unit scale.

The upper square root now uses exact integer arithmetic after binary scaling,
with the existing binary64 significand precision. Perfect rational squares stay
exact. The result is an upper enclosure at every representable rational scale;
there is no float-seeded search or overflow fallback. The units reproducer checks
exact power-of-two covariance on both sides of normal, subnormal and overflow
boundaries, including exponents beyond the binary64 range, plus zero, negative
and perfect-square controls. No assertion or resource ceiling is loosened.

## Regression history and retained assertions

Historical incremental assertions still check the original history factor,
hinges and warnings, obtained from private native tests or the existing
`solverCollapseFactor` metadata. Certificate tests require the public factor to
equal the independently checked lower bound before reconstructing that history
view. They remove only the verified final certificate disclosure from that view;
the existing empty-warning, numerical and mechanism assertions remain unchanged.
Bundle diagnostics retain their raw-history meaning; the scalar API's newly
added certificate-mismatch diagnostic is checked separately.

The values report records the smallest first-night model for each relation and
the initial 88-finding and November 13 40-finding counts. The one-member nodal
mechanism supplies a minimal equivalent regression for all valid scalar laws,
and the actual November 13 point-load model supplies an additional independent
mechanism. This is targeted containment and correction, not a claim to have
independently solved every one of the nightly random models. Issue #972 concerns
nodal rotation responses across other analysis families and remains uncovered.
