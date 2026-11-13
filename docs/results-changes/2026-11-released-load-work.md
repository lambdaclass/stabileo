# Released-rotation virtual work across frames and units (2026-11-13)

Issue #2023 and duplicate witnesses #2035, #2036, #2039, #2058, #2064,
#2066 and #2067. Registry entry `released-load-work`.

The load-compatibility check projected an assembled global load onto a
numerically identified released direction, then estimated error only from
those projection terms. A small projection could result from uncertainty in
the direction or the assembled vector even when physical virtual work was
exactly zero. In the filed model, condensation sets the released local-z end
moment to zero; the retained local-y moment does no work on that spin.
Rotated and unit-scaled copies were nevertheless refused as loaded rotations.
This is a false refusal reproducible on origin/main, rather than evidence of
a silent wrong result in the filed witnesses.

Physical member-release directions now retain their componentwise frame
uncertainty. A bounded representation of the physical released subspace is
closed under every linear combination used to select and normalize a gauge.
Normalization requires a certified nonzero component. This includes several
released rotations at one node. The shared work calculation includes direction
uncertainty, transformation and assembly roundoff, and product and summation
roundoff. Constraint reductions propagate the assembly bound. Staged checks
retain their cumulative load history and propagate bounds through the same
reduced work check. The post-solve artificial-pin check uses the same input
uncertainty.

For a computed frame T, multiplication residuals, error-free summation
residuals and upward-rounded operations give a nonnegative componentwise
matrix A bounding |T T-transpose - I|. If its maximum row sum is below one,
the inverse-square-root series for the orthogonal polar factor Q gives
|Q - T| <= sum over k >= 1 of A^k |T|: the absolute binomial coefficients
are at most one. Set W = A |T|. For row i, its connected component C in A,
row sum r_i, and maximum component row sum delta_C, the implementation bounds
the series by W_ij + r_i max(k in C) W_kj / (1 - delta_C), rounding outward.
Disconnected components stay exactly zero; a large independent torsional
load cannot inflate uncertainty on a released bending axis.

Any retained local load amplitudes, including the computed fixed-end forces,
remain compatible in that orthogonal frame; their values need not be exact
to establish zero work on a condensed release. Explicit transform and
assembly residuals account for additional error in the stored global vector.
Nonfinite work or bounds refuse. Accumulation also carries an order-independent
gamma bound on the sum of absolute contributions, covering different assembly
groupings. No existing conditioning limit or response comparison tolerance
is increased.

A no-foundation Winkler analysis previously followed a separate direct solve.
Its unsupported-moment control returned a warned NUM-INVARIANCE response on
origin/main. Both dimensions now delegate that empty-foundation case to the
ordinary solver, so they share admission, constraints, recovery and diagnostics.
Contact analyses without contact features likewise use the ordinary solver
when their iteration budget is positive; zero-budget outcomes retain their
unconverged status. The foundation-bearing and contact-state algorithms are
unchanged.

Corotational and material-nonlinear 3D entries, and 3D SSI without soil
springs, check initial external nodal moments on explicitly released axes
through the same bounded-work calculation. This gate assembles the physical
sparse stiffness and identifies released directions, without imposing the
ordinary solver's unrelated global stability verdict or factoring a solve.
It prevents a small incompatible moment from being hidden by an iterative
residual measured against larger retained loads.
The material solver also uses a private load-admission certificate from this
check to replace its componentwise artificial-orphan refusal at certified
nodes, and only for the three moment components. Translational forces and
warping loads always pass through the shared orphan-load backstop. The
component type distinguishes forces, moments and warping before consulting
the certificate. That certificate exists only after bounded work passes and every free
rotation at the node is a physical release in a stable initial system.
Warping and uncertified orphan checks remain strict. Dynamic callers retain
their existing orphan checks because their inertia and force histories need
a separate admissibility argument.

The metamorphic conditioning estimate also includes the harmless gauge pins
used by the actual 3D solve. Conditioning the unpinned null direction made the
filed successful comparisons inconclusive. Their existing nonempty-pass
assertions and comparison limits are unchanged.

Re-run previously refused models with member-end releases and no-foundation
Winkler models. Newly admitted responses can still carry conditioning or
large-displacement warnings; acceptance does not establish a design
certificate. The registry selects models with members, shells, connectors, springs or constraints
because no-foundation Winkler delegation can also change recovery fields and
diagnostics in otherwise unreleased models. Numerical collections and solve
outcomes are declared explicitly through the analysis wildcard and solve.ok.

Targeted tests cover the eight exact seeded witnesses, both release ends and
bending/torsional axes, coordinate and oblique members, rotations, unit
scalings, native and public WASM static entry points, genuine unsupported
moments including rounding-scale loads, and exact boundary controls in both
dimensions. Fiber nonlinear retains its existing explicit refusal of member
releases. P-Delta tests distinguish successful initial load admission from
its unchanged convergence criterion; some class models remain explicitly
unconverged. Some public WASM corotational, material and SSI copies retain
explicit singular-tangent or unconverged outcomes from their existing
nonlinear solve paths. These are withheld responses, recorded separately
from both completed controls and unsupported-moment refusals. This change
does not redesign those tangents. No advisory is assigned here.

Round-two review (#2074) also strengthens public WASM verification. Each
completed displacement, reaction and member-end force response is compared
with a native reference for that entry point, including the exact filed
witnesses. Comparisons retain the existing strict metamorphic relative limit
and physical-family scales. Rotations are compared after projecting out the
same native physical released-spin basis on both sides, since those free
gauge values are not unique. Retained rotations, translations, reactions and
member forces are compared without increasing a tolerance. Doubled and
sign-reversed responses must fail.
The backstop tests inject translational orphan sets at a certified node;
current production assembly only creates rotational and warping artificial
DOFs, so those tests establish a defensive invariant rather than a newly
observed silent result on main. Detached-translation models exercise the
public nonlinear callers in both dimensions and remain refused.
