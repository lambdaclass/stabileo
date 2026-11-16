# Selected snow carriers retain force and plan moments

PR #2197 round six fixes a selection error in the physical-strip approximation
introduced on this unmerged branch. A canonical strip includes layout pieces
on the complete physical carrier run. Adjacent source endpoints cancel in the
coverage event count. When only one part of that run was selected, fitting the
complete strip and then clipping its affine approximation at the selected
endpoint destroyed the cancellation that preserves force and first moment.
Matching complete-run resultants did not establish selected-member correctness.

The shared strip integrator now records both total source coverage changes and
active source coverage changes before fitting. A boundary remains whenever
either count changes. Mesh endpoints within an unchanged active region still
cancel, preserving invariance under subdivision. The integrator fits only
active intervals; it does not extrapolate a selected run's pressure field into
unselected layout pieces. Selection and roof classification use `onSnowRoof`
for emission, resolution checks and integration. Member loads retain their
actual positions, endpoints and projected representation. No endpoint nodal
force substitutes for these loads.

The minimal regression uses synthetic pressure 1-x/16 and tributary depth x,
so q(x)=-x+x²/16 on [0,8]. On the selected [0,3] portion, the hand integral is
-63/16=-3.9375. The parent emitted -3.9375025626306948. Its first moment is
also wrong; rotation makes both plan moment errors nonzero. The same polynomial
is integrated independently for force, both plan moments, cantilever shear and
moment at stations, and tip deflection for unit EI. Member response checks use
the existing pointwise intensity bound integrated over the appropriate influence
function; force and both plan moments retain the existing tight comparisons.
No tolerance or baseline is relaxed.

Regressions cover either side of the selection boundary, all and no carriers,
affine correct-input controls, rotation, reflection, reversed member direction,
and subdivision of each physical selected region. Public snow generation and
`planSnow` are compared through their actual member-load output. Explicit roof
selection uses the synthetic pressure at the profile-provider boundary, avoiding
a false assumption that selecting roof members leaves dome pressure geometry
unchanged. A separate detected-roof dome fixture uses the real pressure provider
and independent polynomial response integrals. The shared generation code runs
before solver or analysis selection; this change adds no native/WASM or
linear/nonlinear solver implementation. It does not claim new backend solve or
general torsion validation.

The hole control now passes a rafter across a connected footprint's opening
through ownership, classification and floor load generation, including rotated,
mirrored and subdivided rafters. Panel discovery is controlled to leave the
opening empty rather than inventing a deck there. Coverage and load allocation
remain real. A mutation that ignores hole containment must fail this control.

The canonical-strip clipping defect is branch-only. A separate replay of
`origin/main` at `d0f23b375` with this synthetic strip confirms its older
endpoint-only interpolation also returns an incorrect load without refusal:
force -3.65625 and first moment -7.3125, versus the hand integrals -3.9375 and
-7.734375. This is a replay of the strip constructor, not a release binary or
an end-to-end solve. Main has no canonical-strip fitting or selection event
path; its underlying approximation error differs from this round’s clipping
defect. This evidence is recorded for the coordinator alongside the existing
SA-073/074 work. No new advisory is added and their scope is unchanged. The result-change registry
requires regeneration of affected stored snow loads before analyses,
combinations and design checks are repeated. Re-solving stored loads alone does
not regenerate them. An exact polynomial solver-load schema and the broader
distributed-torque refactor remain outside this focused correction; the existing
bounded affine contract and its intensity bound are retained.
