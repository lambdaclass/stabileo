# Member moment density certification refused

PR #2219 round 17 contains unsupported certification of the branch's new
member moment densities. It does not extend polynomial gap certification.

For a unit member with torque density ordinates [1, -0.5, 1], the integrated
profile relative to its starting torque is t - 3t² + 2t³. Both endpoint increments
are zero, while the interior stationary points (3 ± √3)/6 have increments
±√3/18. The old 3D station-gap routine returned zero for torsion even on a
station set consisting only of the endpoints. Single-case and multi-case
certification could retain that unsupported claim.

A shared scope check rejects every nonzero member moment density, on every
axis, using both the load data and the recovered profiles. Single-case
certification now uses the same checked load-case path as multi-case
certification, including constrained and inclined-support paths. Unsupported
cases are excluded before their load assembly is certified. The independent
reassembly and linear bundle export use the same scope check. Direct gap
queries return unbounded gaps for these profiles, preventing a downstream
finite-bound guard from retaining them. Certificate responses explain that
member moment densities have no certified diagram gap bounds, carry no derived
bounds, and retain the solver's analysis result for inspection.

Zero and absent densities keep the existing certification and numerical answer.
Native regressions include the exact quadratic witness, all axes, constant,
linear and quadratic densities, positive and negative tiny nonzero densities,
prepared and nonlinear result readback, load cases, combinations and bundle
exports. WASM regressions cover the public linear, multi-case and bundle
certificate exports, including subnormal nonzero densities and zero controls.
Plane input already refuses member moments during deserialization; its existing
native and WASM refusal and force-only controls remain enabled.

The width-mode mass witness also exists on origin/main: two parallel horizontal
10 m members at y=0 and y=3, with tributary width 3 m, apply area loads over
60 m² but main accounts for only the 30 m² node extent in the level mass. This
round leaves width-mode accounting unchanged as requested; the branch currently
reports zero for that level because no closed panel exists. The handoff records
both values and the separate y=6 control for the coordinator's issue decision.

CI's physical-region example test exceeded its existing timeout while checking
all four transformations of the diagrid tower in one test. Each transformation
now has its own test. Every region, control and invariant comparison remains;
no tolerance, assertion or timeout changes.

Rerun certification of affected spatial analyses and combinations. These new
moment-density inputs exist only on the unmerged branch. No advisory is added
or numbered. The axial ULP-span work and SRSS combined peaks (#2252) are deferred.
