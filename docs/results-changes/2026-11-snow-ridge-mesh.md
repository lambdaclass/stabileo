# Snow ridges and slopes follow physical roof geometry

Issue #2144 corrects silent mesh dependence in generated snow loads. Regenerate
snow loads for affected saved projects, then rerun analyses, combinations and
design checks. Re-solving the stored generated loads alone does not correct them.
The saved-project registry applies this notice to generated snow loads in 2D,
3D and Pro, independently of the analysis used for the saved results.

On origin/main at 8e5c026b7, a flat 16 by 4 m perimeter with a gable slope
entered as 20 degrees assigns the ridge to an average of member endpoints.
Subdividing only the first long edge into eight members moves that average.
The opposite short edge then receives 0.8076923076923077 instead of
0.40384615384615385 in the first unbalanced case, without a refusal. The
expected pressure is independently calculated in the test from the physical
width, the entered slope and the CIRSOC 104-2005 expressions already documented
in the rule module: balanced pressure 0.7 times (70 - 20) / (70 - 5), leeward
pressure 1.5 times balanced pressure, and the ridge-crossing edge's mean of
windward and leeward pressures. These are the same physical roof and loading.
The error is position dependent and is not assumed conservative.

The shared roof-surface module now owns the inferred geometry. It merges
connected collinear members into complete physical runs using the existing
geometric matching checks. The primary plane is selected by alignment with
the complete physical frame, so a tied plane-inference order cannot reverse
it. Run endpoints supply the profile; the ridge is the midpoint of the highest profile's projected extent, rather than an endpoint
average. Plane slopes and complete run lengths determine the representative
slope. Widths continue to use the planes and projected physical extent.

Geometry and pressure classification use distinct physical information. The
ridge follows complete runs; each member segment uses its own midpoint relative
to that stable ridge for side classification. Splitting at the ridge restores
the separate windward and leeward pressures. Likewise,
shaped-roof loads use the physical profile and interpolate the complete run's
endpoint intensities to each member. Panel and nodal tributaries evaluate that
same run field at their stations instead of averaging the ends of a mesh member.
Inserted nodes cannot change the crown, profile knots or load interpolation. The existing bounded coordinate
normalization also resolves roundoff at coincident rotated profile knots. No
engineering inequality, geometric matching limit or test tolerance changes.

The reusable `assertSnowRemeshInvariant` helper inserts nodes on selected edges
and compares physical distributed-load fields and nodal force/moment resultants,
as well as ridge, width, slope and load-case identity. It supplies the implicit
member length when evaluating a full-member trapezoidal load. Coverage includes
every edge separately, uniform and unequal subdivision with ridge crossings
resolved before comparing gable pressure fields, geometric and entered
slopes, mono-pitch, duo-pitch, curved, multiple-ridge and dome configurations,
plan rotations, width-limit boundaries and an ordinary uniform-mesh control.
Direct generation, the snow planner and complete load planning are exercised
for the flat override witness. The separate explicit-panel faceted-dome
roof-classification defect is tracked as #2172 and is outside this correction.
Its reproducer remains skipped with reason `known wrong result: #2172`; enable
it with `RUN_KNOWN_WRONG=2172`. This correction does not claim end-to-end
invariance for that configuration.
Snow generation is shared TypeScript upstream of the native/WASM and
linear/nonlinear solver choices; no solver implementation changes.

The original reproducer commit enables its skipped TypeScript regressions with
`RUN_KNOWN_WRONG=2144`. They use the exact reason `known wrong result: #2144` in
the test names, as Vitest has no Rust ignore attribute. All #2144 class tests are
active. The new `snow-subdivided-override` snapshot captures the corrected witness;
existing snow snapshots retain their baselines. The coordinator assigned
[SA-2026-072](../advisories/SA-2026-072-snow-ridge-subdivision.md) for the silent
#2144 main-source exposure. The fix is pending merge and release; historical
release binaries were not replayed.

PR #2175 round 3 also corrects exact-elevation equality introduced by the physical
profile refactor. Highest profile points now share the existing inclusive
1e-8 m elevation matching tolerance used for connected collinear geometry.
The comparison is against the global maximum, so successive nearby elevations
cannot chain a lower point into the highest group. The projected extent of
that group supplies the ridge through the single shared geometry path.
On the unmerged parent f21261c30, raising one corner of the same flat witness
by 1e-12 m moves the ridge to that corner and changes its short-edge unbalanced
pressure from 0.40384615384615385 to 0.8076923076923077 without refusal.
The final tiny-perturbation regressions pass against origin/main 8e5c026b7;
this exact-equality defect was introduced on the unmerged branch. It does not
establish an additional released exposure or advisory.

Regression coverage includes every corner, positive and negative 1e-12 m
perturbations, plan rotation, projected/width/panel allocation, selected and
detected roofs, direct geometry and snow generation, snow and complete load
planning, and nodal tributaries. Tests check zero perturbation and elevations
1e-12 m below and above the existing tolerance, as well as a nominal 1e-8 m
perturbation. A point just above the tolerance must move the ridge and receive
the genuinely higher-point pressure. Boundary tests also retain the small
axial projection forces arising from actual member inclination.

PR #2175 round 4 corrects the unmerged branch's use of a complete run's midpoint
for every member segment's side pressure. On the flat 16 by 4 m witness with
an entered 20 degree slope, splitting both short edges at the stable ridge must
assign the windward half zero pressure and the leeward half
1.5 × 0.7 × (70 - 20) / (70 - 5) = 0.8076923076923077 kPa. Each half has length
2 m and unit tributary width: its downward force is respectively zero or
1.6153846153846154 kN, and its moment about the ridge has magnitude respectively
zero or 1.6153846153846154 kNm. The branch instead assigned both halves
0.40384615384615385 kPa. The equal total force concealed the incorrect moment.
Both wind directions are checked independently, including rotated roofs,
selected roofs, projected loads, width allocation, explicit panel pieces,
nodal tributaries, the snow planner and the complete load planner. Panel-plan
force and moment expectations account for the actual triangular tributary width.
Width-limit tests straddle the existing 6 m boundary; midpoint tests straddle
the existing 0.01 m side band without changing either limit.

The shared member-side map now reads each segment's endpoints directly. The
run map remains responsible for physical geometry and shaped-roof interpolation.
Existing remeshing tests compare gable pressure fields starting from a roof
already split at the ridge, keeping their strict invariance assertions without
requiring an incorrect pressure field to survive a subdivision.

A member that itself crosses the ridge still receives a uniform pressure chosen
by its midpoint, matching origin/main. This remaining limitation is tracked in
#2176 and is deliberately outside this correction. Splitting such a member at
the ridge can therefore change its physical load field and moment; complete
pressure-field invariance across that change is not claimed. Main already
classifies ridge-split halves correctly, so the round 4 regression provides no
additional released exposure or advisory.
