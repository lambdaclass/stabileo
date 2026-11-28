# Basic: advisories where they apply, and 2D plastic collapse released (#1551, #370, #758)

The first two entries change which warnings a solve carries. The second-order screen also changes its recorded ratio. The third releases a result that was
withheld.

## 2D second-order warning bounded by the critical load factor

Results-change entry `linear-second-order-critical-factor-2d`, after `linear-second-order-warning`
(#1551).

The second-order screen of a linear solve bounds each compressed member's N/Ncr from the member: a
clamp gives K = 2, supports holding both ends give K = 1. A member neither bounds (a beam no
support holds, a column above the first storey, a truss bar that ends at free joints) made the
whole result warn `LIN-SECOND-ORDER-UNBOUNDED`, which holds the CIRSOC 301 checks, on frames
nowhere near buckling.

For planar frames the screen uses the buckling solver's complete mode search on the stiffness and
geometric stiffness of the linear solution. The reciprocal of the first positive critical factor
is the applied fraction of the global proportional buckling load. The screen compares that fraction
and the independent member ratios with the existing warning thresholds. A global warning preserves
the identifiers of members that already exceed a threshold.

A two-node truss element has no internal bending mode. In both dimensions a compressed truss bar
restrained in translation at both ends is screened against the pinned Euler load using its own
length and bending stiffness. Where the supports do not establish this local bound, the linear
result keeps the unresolved-member warning. Factored combinations propagate that warning.
A roller that restrains transverse displacement can establish the same local bound while allowing axial movement. Disconnected frames are screened individually. The finite-element eigenvalue alone can overestimate the physical critical load. For an eligible planar frame, the screen bounds chord motion with the assembled stiffness and bounds the deformation relative to the chord using each member’s bending and shear stiffness. If these bounds cannot exclude a higher warning band, the result carries the unresolved warning. A disconnected solve or combination reports a physical upper bound only when it covers every contributing component and load. A negative factor can introduce unexamined compression and withholds that bound.

## Beam dynamics and nonlinear convergence warnings

Results-change entry `dynamics-rotary-inertia-advisory-deep-members` (#370).

Omitting bending rotary inertia can overestimate frequencies. The approximate geometric screen
r/L > 0.045 identifies deep members, with r the larger radius of gyration. The Rayleigh
estimate ω/ω_EB = 1/√(1 + (πr/L)²) applies to the first mode of a uniform, simply supported
straight beam. It does not bound a structural mode or higher modes.

Modal, spectral, time-history and harmonic analyses identify deep frame members and curved
beam input indices separately, using the circular arc length for a curved member, under `NL-DYNAMIC-GAPS`. Other beam models receive
`NL-DYNAMIC-MODES` because the mode-specific error is unknown. Material nonlinear analyses
receive `NL-UNCONVERGED-INCREMENT`. On reopening an older project, a nonlinear analysis setting alone can no longer trigger this notice for a node-only model. The recheck uses saved evidence of members, shells, springs, connectors or contact, including when an older file omits its member list. Malformed authored structure still receives conservative review. Only diagnostic codes and references change.

In a 3D modal solve and its certificate, a deep arch is identified once by its curved-beam input index. A deep straight member alongside it keeps its own frame reference. The straight segments generated to assemble the arch have no separate warning. The modal frequencies and mode shapes are unchanged.

## Basic 2D plastic collapse at the certified limit-analysis factor

Results-change entry `basic-plastic-2d-certified-limit` (#758, SA-2026-044).

2D plastic collapse was refused (`PL-2D-INVARIANCE`) because its collapse factor changed with node
numbering, member direction and units, up to 4.6×. The engine's `plastic_limit_2d` now runs the
limit analysis and releases its factor only where the exact plastic certificate's rational static
and kinematic bounds, independent of the linear program, meet at it to 1e-6; `certify_plastic_2d`
is released on the same condition. Axial span loads (Basic's self-weight on columns) go to the end
nodes by their consistent shares, which bend nothing and do the same work in any mechanism of
rigid segments. Anywhere else the result stays withheld with the same message, the two-beam #1475
case and the #758 reproductions included.

The Basic panel reports that factor. Its step-by-step hinge history is a sequence of linear solves
of the structure with the hinges formed so far released, each next hinge where the smallest load
increment brings a section to Mp. Member ends and point loads are sections of their own; inside a
stretch under a span load the critical section is found from the moment function, not on a mesh.
The panel distinguishes the certified collapse factor from the end of the traced history. It marks the hinge locations as approximate when the endpoints disagree. If hinge positioning fails to converge or the factor cannot be certified, the action withholds the numerical trace.

A hinge under a distributed load moves with the peak of the moment. Once it forms, the peak moves
as the load grows, so a hinge held where it formed would leave the moment beside it above Mp. Each
increment therefore puts the hinge where the moment peaks at the increment's end: its section is
brought to Mp by the self-stress of the structure with that section rigid less the structure with
it released, which leaves the moment at every other hinge unchanged, and the increment is solved
with it released there. The section it leaves keeps the plastic rotation it took. A hinge whose
peak runs into the end of its stretch as that section reaches Mp becomes that section's hinge. The
step table, the drawing and the step trace show each hinge where it sat at the step on screen, and
the trace says when it moved.

On the Basic "Portal Frame" (H = 10 kN, q = 15 kN/m): right column head at λ = 53.788, the beam
hinge at x = 2.83 m at λ = 63.810, moving to midspan, right base at 66.450, left column head at
1925/27 = 71.296, the beam mechanism. On "Spring Support": the span hinge of the first span at
x = 1.87 m at λ = 5.427, moving to (√2 − 1)·3 m from the pin, then the section over the spring at
λc = (6 + 4√2)Mp/(qL²). The coefficient is about 11.657. Applying the example’s plastic moment and load gives a collapse factor of 12.329. At every step the moment along every member stays within Mp to 1e-6;
before this, it passed Mp by 0.45 % and 0.19 % at the second and third steps of the portal and by
12.8 % at the first step of the spring support.

Basic 2D plastic collapse releases the factor where the certificate confirms it. Hinge positions and sequence come from the incremental solver history (`solve.ok`, `collapseFactor`, `hinges`). The plastic analyses are not in
the results corpus, so no snapshot moves for this entry.

For a planar truss under nodal forces, the engine can also confirm axial collapse by joint
equilibrium. At the reported factor the exact force field must satisfy every axial capacity.
At least one member must reach its capacity with an axial force that every equilibrium field
shares. When redundant paths exist, the check searches their equilibrium null space for a capacity-feasible distribution at that load. A larger load would exceed that capacity. This preserves the yielded-truss result from
#2608 without relying on the step history to certify its factor.

For an axially yielding truss, equilibrium determines the squared collapse factor exactly even when its square root is irrational. The certificate checks the returned floating-point value against the two adjacent representable numbers enclosing that root. A representable root must still match exactly. The public solver reports the lower endpoint of the proven floating-point enclosure and its upper endpoint. If the floating proposal lies outside that enclosure, it omits the proposal’s hinge list.

For an axial distributed load the certificate now forms the two equivalent nodal forces in rational arithmetic. It subtracts the start share from the certified field and integrates the original signed intensity along the member. An explicit full-span endpoint at the solver length has the same exact unit fraction as an omitted endpoint, including on diagonals. The check includes the ends of each loaded interval, both sides of axial point forces, and any interior zero of the total distributed intensity. This can confirm bending collapse that the previous integral allowance withheld.

Partial axial loads on a diagonal with irrational length can now be included when bending governs.
The certificate bounds the normalized resultant between rational endpoints and checks each extreme
load with a common bending mechanism. The static check also bounds the axial force inside the loaded
member. A factor is released only if the existing static and kinematic acceptance checks agree.

For a truss with both translations restrained at every node, an axial span load may yield a section
before the member reaches its limit. Each restrained member can redistribute a constant axial reaction.
If the unit-load axial primitive has range ΔN, equilibrium and the two yield inequalities allow
λ ΔN ≤ 2 Np. Basic returns the smallest finite member limit supported by the exact range calculation.
The history still reports the load at the first interior yield. On the reversing axial load in
`plastic-collapse-axial-loads.test.ts`, the history reaches first yield at 15/14 and the restrained
bar reaches collapse at 2 to the precision of the input stations. The certificate returns directed
bounds on the exact factor for the binary input.

The factor and upper endpoint of a confirmed bending result come from the checked fields, rounded
outward. The numerical linear program proposes the mechanism and hinge locations. For the two
diagonal cantilevers with unit horizontal arms in `two_independent_partial_diagonals_publish_the_checked_interval`,
the released interval is [1, 1]. Previously both reported endpoints were 0.9999999999999991.
