# Pure axial motion retains zero chord rotation (2026-11-11)

PR #1940, issue #761, final review correction. The unmerged implementation used
an FMA for only the first product in the 2D chord cross product. For represented
initial chord components `1 + 2^-27` and equal displacement increments
`1 - 2^-27`, the product remainder survived in one term only. The numerator was
`-2^-54` although the vectors were exactly collinear. Assembly and member-force
recovery could therefore introduce bending under pure axial extension or
contraction.

The shared chord-rotation calculation now uses the existing compensated dot
product for both the cross-product numerator and the dot-product denominator.
Both products carry their remainders, so equal products cancel exactly. Dense
and triplet assembly and force recovery use this calculation; corotational,
arc-length and displacement-control callers use those shared paths. No
convergence tolerance, refusal limit or assertion is relaxed. The separate 3D
rotation-delta formulation is unchanged.

Native tests cover the exact represented example, reflected chord directions,
axial contraction, zero motion, extension and transverse perturbations of both
signs. Dense and triplet internal forces and recovered shear and moments must
retain exact zero bending for the axial states. The public corotational solver
and its actual WASM export receive the same prescribed axial models. Existing
small-rotation tests remain in force.

The settlement regression's transverse load acts on a restrained tip direction.
Its independent signed response is therefore the change in tip reaction,
opposite to that applied load, rather than a change in tip displacement.
Loaded-minus-settlement-only reactions are checked after 2D and spatial
rotations, across linear, P-Delta, corotational and material paths. The
arc-length API returns no reactions, so the original restrained-tip case now
checks the signed prescribed response at the final load factor. An additional
free-tip arc-length case makes the transverse load observable in the tip
response. Its load-induced deflection is checked against the independent
cantilever reference `F L^3 / (3 E I)`, with the same `1e-10` component bound,
at the small continuation step. The unloaded baseline is the exact rigid
translation and rotation imposed at the base, evaluated at the returned load
factor. Negative controls keep the settlement movement while dropping the
applied load and must fail the same native and WASM assertion. Spatial
prescribed-motion corotational cases retain the API's explicit refusal;
spatial linear controls still return their signed prescribed displacements.

The registry notice requires a 2D frame model and nonlinear analysis history.
It excludes connector-only models and purely linear or spatial recorded
analyses. This is an engine entry with `when`, not an examples-scoped entry;
no bundled example input or snapshot is changed. The CI notice-order check now
covers both distinct versions and entries sharing one merge version, retaining
an exact list and the version/date/id ordering.

This round corrects an unmerged-branch FMA regression. It establishes no new
silently wrong result on main or a release. The previous projection evidence
and its coordinator advisory decision remain separate. Nonlinear support
forcing for an axially free end under transverse settlement is outside this
round and remains deferred to the coordinator.
