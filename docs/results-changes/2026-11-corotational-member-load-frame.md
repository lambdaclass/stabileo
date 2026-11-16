# Member load actions follow the final member frame (2026-11-12)

PR #1952, rounds 9 and 10. Registry entry `corotational-member-load-frame`.
This extends [SA-2026-061](../advisories/SA-2026-061-path-solver-reactions.md).

Corotational recovery combined elastic end actions expressed in the final member
frame with fixed-end actions expressed in the reference frame. A dead transverse
member load consequently lacked its axial projection after chord rotation and
retained the original shear instead of its projection. Spatial fixed-end moments
also require transformation when the member frame turns.

Both dimensions transform dead mechanical fixed-end force and moment vectors
from the reference frame before combining them with elastic actions. Thermal
eigenstrain actions remain in the current member frame, including thermal
gradients and released-end condensation. The spatial transformation uses the same natural-rotation frame as the
elastic member. Planar arc-length, displacement control and native continuation
share this recovery. The solve, applied load vectors and convergence tolerances
are unchanged. End actions change; load metadata continues to describe loads in
their original reference coordinates. This does not introduce follower loading.

The native regressions compare rigid rotations of both signs, including a
one-radian rotation and zero rotation, against independent linear fixed-end
recovery transformed analytically in the test. Planar full/partial distributed,
point and axial loads and a released end are included. Spatial cases turn about
two axes with loads in both transverse planes and check forces and moments.
Public native and WASM cantilevers check their unloaded free tip, force and moment
equilibrium on the final chord and the independent global support reaction. Native
corotational and arc-length continuation exercise the same loaded-member cases.
The parent fails all four public entry points and both direct recovery tests.
Empty and zero WASM results are explicitly rejected.

The exact small-rotation native replay in `round9NativeReplay` in the existing
[advisory evidence](../advisories/replays/SA-2026-061.json) used all production
sources from origin/main `144296aadc772a13ec768a58ecb5e387aecb787e` in this
worktree. Both dimensions converge without warning or diagnostic fields and
return nonzero axial action at the unloaded free tip. The full inputs and
returned outputs are retained. This establishes silent wrong results on current
main independently of the large-rotation spatial accuracy warning. No new release
boundary is inferred from this replay.

Staged removal is a separate unresolved limitation: dropping a load-carrying
element does not redistribute its released forces. The prop-removal test now
checks the valid first-stage solution, the subsequent load increment and result
topology; it no longer endorses unchanged displacement or cumulative equilibrium
after removal. The known wrong redistribution result is tracked by [#1996](https://github.com/lambdaclass/stabileo/issues/1996) with an ignored physical-equilibrium reproducer; it is not fixed by this round. The coordinator owns the advisory decision.

Round 10 corrects a regression introduced by round 9: transforming thermal
fixed-end actions as dead loads gave uniform heating a transverse component
and rotated spatial thermal-gradient moments. Recovery now keeps reference-frame
dead loads and member-frame eigenstrain actions separate until the common final
combination. Uniform and gradient regressions in both dimensions fail on round 9
and retain main's thermal recovery behavior. They cover signed finite and tiny
rotations, zero rotation, releases in 2D and superposed mechanical loads.

Public corotational 2D/3D, planar path and native continuation solvers continue
to refuse thermal loads before assembly. This correction does not enable
nonlinear thermal analysis or change thermal assembly. Native and WASM controls
check those refusals for positive, zero and negative temperature input. Linear
thermal behavior is unchanged. The existing notice now requires member loads
as well as members and nonlinear/path context, so nodal-only models do not get
this member-load recovery notice. No new advisory applies to the branch-only
thermal regression.
