# Gravity main merge: member envelopes and CI coverage (#2219)

## Member envelope stations

The 3D envelope builder sampled only the fixed grid even though individual
member diagrams and governing readers now retain load boundaries, point-load
sides and interior stationary points. A moment-density profile wholly between
grid points could disappear from the envelope. This affected native and WASM
combination envelopes for linear and nonlinear results.

The builder now takes the exact union of the shared native member-diagram
stations from every combination for all six components. It retains every
previous grid station. Exact deduplication preserves distinct adjacent stations;
no tolerance, refusal boundary or baseline assertion is loosened. The existing
2D envelope path remains a positive control. Loads remain member loads at their
physical positions; no load is moved to nodes or end couples.

The snapshot capture also records the 3D station coordinates. The governing
consistency test reads force values explicitly so geometry coordinates cannot
be mistaken for force magnitudes. Its existing equality tolerance and negative
underestimate assertion remain unchanged.

## Snapshot audit

Independent integration of the raw combination member profiles checked 156134
envelope values, including positive and negative branches of all six components.
For axial and torsional fields without load profiles, the declared linear
end-force interpolation was checked. All 140616 former grid values remain
unchanged within their existing recorded precision across 17 cases. Every
changed non-snow record is under `envelope`; raw solved forces, displacements,
reactions and design results outside that namespace are unchanged.

The design steel tower's four governing moments repeat the same independent
hand integration already recorded for its PRO counterpart in
[round 11](2026-11-gravity-round11.md). The mat foundation also records member
50's stationary moment maximum, 16.898717162338194, previously retained as
16.89869628 by snapshot merging because their difference was within the capture
tolerance. Updating that value satisfies the unchanged, stricter governing versus
envelope assertion. These values come from integration of the captured member
profiles, not a tolerance change.

The snow hip snapshot changes only `snowDerivation[1].params.absolute`, from
6.926244879e-17 to 2.077331362e-16. This is the recorded approximation error bound
of the existing bounded snow profile, exposed by the branch's physical geometry
arithmetic; no snow load value moves in that snapshot. It is covered by the
existing gravity result-change scope and this explicit explanation.

The following table counts serialized snapshot records, including per-member
array records; an array record contains multiple station values.

| Snapshot | Changed records | Added records |
| --- | ---: | ---: |
| 3d-building | 630 | 0 |
| 3d-portal-frame | 48 | 0 |
| 3d-tower | 144 | 0 |
| design-footing-rc-footing-cad-poc | 48 | 0 |
| design-rc-beam-flexure | 12 | 0 |
| design-rc-design-qa-8 | 48 | 0 |
| design-rc-design-qa-row2 | 48 | 0 |
| design-rc-design-qa-seismic | 48 | 0 |
| design-rc-qa-diagnostic | 156 | 0 |
| design-steel-3d-portal-frame | 48 | 0 |
| design-steel-3d-tower | 148 | 0 |
| design-steel-pipe-rack | 828 | 0 |
| pro-3d-portal-frame | 48 | 0 |
| pro-3d-tower | 144 | 0 |
| pro-mat-foundation | 764 | 0 |
| pro-rc-qa-diagnostic-shells | 192 | 0 |
| snow-hip-facets | 1 | 0 |

## Validation and coverage

The reproducer commit adds an ignored native test marked
`known wrong result: #2219` and opt-in WASM tests. On the merge parent, the native
spatial test and all twelve spatial WASM profiles fail; both plane WASM controls
and the native plane control pass. The fix removes those skips. Positive and
negative moment densities, constant and quadratic profiles, all three moment
axes, off-grid boundaries and stationary points are checked against the retained
hand solutions through linear and P–Delta results. Existing gravity tests retain
per-carrier shear, bending, torsion and displacement comparisons across rotations,
mirrors and subdivisions.

The results helper moved outside the runner's collected directory. The harness
keeps an exact inventory of all gravity test files. Wind and gravity recheck
expectations include both sets of applicable corrections after the main merge.

This completes the branch's registered `gravity-governing-moment-extrema`
correction. Its seven locale explanations now cover combination envelopes too.
No new advisory is created or numbered here; main exposure evidence and gate
limitations are recorded separately for the coordinator in the handoff.
