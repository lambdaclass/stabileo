# Member load actions follow the final member frame (2026-11-12)

PR #1952, round 9. Registry entry `corotational-member-load-frame`.
This extends [SA-2026-061](../advisories/SA-2026-061-path-solver-reactions.md).

Corotational recovery combined elastic end actions expressed in the final member
frame with fixed-end actions expressed in the reference frame. A dead transverse
member load consequently lacked its axial projection after chord rotation and
retained the original shear instead of its projection. Spatial fixed-end moments
also require transformation when the member frame turns.

Both dimensions now pass all fixed-end force and moment vectors through one
reference-to-final-frame transformation before combining them with elastic
actions. The spatial transformation uses the same natural-rotation frame as the
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
