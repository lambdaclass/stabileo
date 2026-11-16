# Wind pressure at physical carrier apexes

PR: #2220. Date: 2026-11-16. This refusal exists on the unmerged wind branch.

Splayed carriers meeting at a lower apex could refuse with missingWidth under
increasing height pressure. A force and moment preserving affine approximation
of their convex density has a negative initial ordinate. The sign check samples
the physical endpoint, whose legitimate zero width was rejected as a missing
declared width. Upper apexes under the opposite pressure gradient were affected
by the same station validation.

Physical zero-width band endpoints now have zero force density and zero couple
density through the shared station path. Pressure callbacks are not evaluated
at these zero-area stations. Interior physical stations and declared widths
retain the positive-width requirement. Shared plan geometry certifies the minimum
polar moment along each continuous band using its quadratic geometry. The field
represents unsupported eccentric transfer explicitly and omits its numerical
couple ordinates. Concentric callers integrate only the actual pressure in this
state. Every eccentric caller goes through windHeightLoads, which refuses
unsupported nonzero transfer before applying loads. Zero pressure keeps its
zero answer. Quadrature could previously miss a narrow unsupported interval and
return eccentric loads without the required refusal. Narrow-neck regressions
cover direct fields, solid signs and complete planner paths; prescribed
concentric profiles keep their force answer. The unused equivalent nodal couple
map was removed.

Quadrature, sign preservation, work
moment acceptance, subdivision depth and all tolerances remain unchanged.

Regressions include splayed carriers from height 6 to height 10, above the
pressure-height clamp, direct fields, other structures, planner and complete
load-plan entry points, and prescribed pressure profiles. Closed-form integrals
check force and moment. The same generated member loads are tested as isolated
cantilevers through linear and P-delta, 2D and 3D, WASM and native solvers.
Subdivision, rotation, reflection, both pressure signs, lower and upper apexes,
small positive endpoint widths and both sides of the declared-width threshold
are covered. These tests verify transfer, not assembled tower stiffness.

The eccentric-wind variant tests now require nonempty output and all force and
moment resultants after transformation. Collinearity-boundary tests require
exact carrier IDs, both endpoint intensities and total force. Mutating the old
tests to supply empty, partial or numerically corrupted outputs demonstrates
their former false passes and the strengthened assertions' failures.

Regenerate W/Wa and rerun analyses, combinations and design checks. Re-solving
stored loads does not regenerate them. No new advisory is assigned.
