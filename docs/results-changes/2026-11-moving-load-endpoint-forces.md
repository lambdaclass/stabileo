# Moving-load envelopes use interior force limits at member ends (2026-11-09)

Results-change entry `moving-load-endpoint-forces`; review follow-up for
[#1782](https://github.com/lambdaclass/stabileo/issues/1782) / PR
[#1783](https://github.com/lambdaclass/stabileo/pull/1783).

The moving-load range used raw recovered end forces and, in 3D, both sides of every
point-load jump. For a point load exactly at a member end, one side is outside the
member. It must be treated as a nodal load when determining that member's interior
force envelope. The old result could include force carried entirely by a support.

The envelope now includes the right limit at x = 0 and the left limit at x = L for
axial force and both transverse shears. Coincident endpoint forces are summed.
When an endpoint jump is nonzero, a private copy of the force diagram shifts the
end forces to their interior limits and removes endpoint point loads for that
force component. This avoids retaining exterior forces at near-end stations on
short members through the existing point-load comparison tolerance; that tolerance
is unchanged. The
3D interior jump search still includes both limits. The 2D path changes only when
an endpoint force produces a nonzero jump; all other station evaluation, axial
patch/root searches, moments, train positions and static recovery are unchanged.
The independent feature-matrix reference and prepared/full-solve parity reference
apply the same endpoint rule without calling the production range helper.

## Equilibrium evidence

Commit A, `a8de5c44c`, adds 13 regressions with
`#[ignore = "known wrong result: #1782"]`. Explicit ignored runs fail all 13:
11 integration checks and two independent-reference checks. Commit B removes the
ignores with the fix. Ten integration tests independently cover both ends, both
force signs, 2D axial/shear and 3D axial/shear-Y/shear-Z. At a loaded fixed end,
the support carries the whole point force and every member interior cut has zero
force. At a loaded free end, force equilibrium requires the applied force to pass
through the member. The 3D fixture removes plane-embedding restraints from the
free node so both transverse directions exercise a true cantilever.

The additional integration test puts axles only at the two fixed ends of a member:
its axial, shear and moment envelopes must all be zero, including all three 3D
coordinate-plane embeddings and member lengths of 8 and 1e-6 in model units.
The short-member variant also failed an endpoint-only boundary correction before
the final private-diagram normalization; its expected zero force is unchanged. Two feature-matrix tests check the independent
position-by-position references on endpoint-only loading. Existing off-grid
interior jump, coincident-load, reversal and unit-scaling checks remain enabled
with their original assertions and tolerances.

## Main exposure and re-check scope

At `origin/main` (`4f9b69cad`), 2D uses raw ends plus diagram stations and 3D uses
raw ends directly. Thus endpoint contamination already exists for 2D axial/shear
and both 3D shears. Main does not yet support the branch's 3D axial point-load
component. Source inspection and the main moving-load implementation transplanted
into this worktree reproduce the endpoint failures. The transplantation adds only
`px: 0.0` to the generated 3D axle initializer for compatibility with this branch's
new input field; it is not a full checkout/build of main or evidence of main's
unsupported 3D axial point-load behavior.

Re-run moving-load envelopes with endpoint point loads and review designs or sizing
based on their force extrema. The registry requires `members` and `movingLoads`:
axles need not exist as saved point loads. Transient sweeps have no saved marker.
See [SA-2026-053](../advisories/SA-2026-053-moving-load-endpoint-forces.md).

Endpoint recognition allows only a floating-point rounding bound of eight machine
epsilons times the member length. This keeps the rule invariant under unit scaling
when the stored point coordinate and recovered geometric length round differently.
Existing diagram comparison tolerances and all test tolerances remain unchanged.
The release metamorphic 2D unit checks exposed this distinction during verification;
no assertion or baseline was relaxed.
