# Gravity station jumps and member load edits

PR #2219 round 5 corrects the reviewed, unmerged branch at `4f69c59cd`.
No new advisory is assigned here. The existing SA-2026-079 and SA-2026-080
remain the coordinator's assigned gravity disclosures.

Concentrated forces and couples now share a station comparison in Rust and
TypeScript. Positions are compared in the evaluator's normalized coordinate:
a load contributes when `a / L < t`. The station exactly at the load retains
the left-hand value. Sampling retains the exact station and its immediately
adjacent representable stations, without quantizing positions or adding an
absolute dead zone. Piecewise TypeScript results use the same comparison to
select a member piece. The old endpoint selection tolerance could otherwise
select the previous piece after a torque jump.

A unit torque at `a` adds one unit immediately after `a`. Previously a station
`a + 5e-11` could retain the complete pre-jump value because the comparison
subtracted `1e-10`. The native regression checks force and couple diagrams in
2D and 3D, equality and both neighboring representable stations, both ends,
positive/negative/zero loads and different member lengths. WASM regressions
also exercise actual linear and P–Delta results and collapsed piecewise torque
results through the Rust and TypeScript evaluators.

Projected loading is normalized before a geometric edit. Each global force
or moment component receives its original member's projection factor
`sqrt(1 - ex[k]^2)` once; the edited load is stored in the global frame.
Copy and in-place edits call one carrier function for polar force vectors and
axial moment vectors. A unit projected global-Y moment on an X-aligned member
therefore remains unit magnitude after a 45-degree plan rotation. Previously
it became `sqrt(1/2)`. Tests check all components and quadratic moment profiles,
rotations, reflections, slopes, local/global controls, and per-member bending,
shear, torsion and tip deflection against an independently integrated uniform
moment cantilever, with and without subdivision in linear and P–Delta solves.

The shared subdivision routine normalizes projected loading using the original
flexible member geometry. Its store, analysis-subdivision and variable-member
callers supply that geometry before replacing the member. IDs are allocated
only as each final distributed or concentrated load is emitted; component
expansion cannot copy a previously allocated ID. Trapezoid interpolation uses
its positive span rather than a fixed cutoff, so sign-changing endpoints
remain distinct even on a short loaded stretch. Regression cases straddle the
existing `1e-9` conversion threshold and include several force components,
opposite endpoints and force-plus-moment loading. No numerical tolerance or
assertion is relaxed.

The Hungarian gravity recovery notice now includes the plan-rotation defect
in width-based seismic area (#2210), the D/L/Lr loads, and regeneration of
seismic weights before rerunning analyses, combinations and checks.

Restore affected geometric edits from original loading and reapply them;
regenerate affected area loading, then rerun analyses, combinations, diagrams
and design checks. Re-solving already damaged saved loading cannot reconstruct
its lost components.

A separate existing endpoint-snapping limitation remains in the web point-load
adapter: a concentrated couple less than `1e-6` from an end is moved to that
end. Fixing diagram station comparisons does not remove this allocation rule.
The ignored short-span adapter regression documents it. The eccentric torque
channel should not be considered complete while this remains; the handoff
recommends separating physical-region allocation (SA-079) from that channel
(SA-080). The separate native short-span issue #2222 also remains ignored.
