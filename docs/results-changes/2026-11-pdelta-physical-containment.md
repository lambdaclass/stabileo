# Physical P-Delta containment and withheld dynamic estimates (2026-11-13)

PR #1952, review round 18.

The round-17 containment conflated two checks. The physical residual measures
whether the small-displacement P-Delta equations are satisfied after constraint
projection. The global wrench check evaluates moments on displaced geometry,
which the small-strain second-order formulation does not in general satisfy.
The latter cannot invalidate an otherwise correct small-displacement solution.
The summary also excludes separately reported constraint actions: a general
weighted MPC can have a nonzero resultant. Both-dimensional regressions close
that force balance independently using the MPC coefficients and constraint
multiplier, rather than misclassifying the support-only sum as physical failure.

Both P-Delta builders now use one containment decision. The unavailable
diagnostic constructor is private to the paired withholding helper, so other
solver modules cannot use it to retain a diagnosed quantity. A failed or non-finite
physical residual withholds every equilibrium-derived quantity: reactions,
member end forces, constraint forces, and spatial stresses. Record identities
and geometry/load descriptors remain. Withheld numerical quantities are NaN in
native results, accompanied by field-specific `result_quantity_unavailable`
diagnostics. The existing output boundary refuses these partial results before
WASM can serialize those NaNs as null. The derived result summary is cleared;
the residual and global-balance summary remains as evidence. The existing finite
certificate guard refuses these partial results. No tolerance changes.

A passing physical residual retains all quantities. A failed displaced-geometry
wrench check adds `equilibrium_violation` explaining the finite-displacement
limitation and directing finite-displacement reaction work to corotational
analysis. The summary does not claim the global wrench check passed. The
independent trapezoidal/partial-span Ritz tests retain all original numerical
checks, including support moment. Completeness still requires one record per
node, support and element; its assertions are unchanged.

Both time-history solvers use the same paired withholding/diagnostic helper to
return `peakReactions: []`. Their old elastic-only displacement-peak estimate
omitted inertia, damping and time-dependent support loads. Displacement histories
and peaks remain available. Native traced and certified wrappers and WASM solve
and certify exports receive the same behaviour. This does not implement total
dynamic reactions or a reaction envelope. Only the time-history row of
SA-2026-061 is updated.

Regressions cover both dimensions, forced dense/sparse P-Delta paths, public
constraint paths, signed and zero load controls, both sides of the unchanged
physical-residual criterion, iteration limits, Newmark/HHT, traced/certified
native wrappers and WASM exports. Each reproducer fails against the parent
implementation. No frozen numerical baseline changes. #1996 and the staged
inherited-diagnostics follow-up are outside this change.
