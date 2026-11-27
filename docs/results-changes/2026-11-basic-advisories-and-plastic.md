# Basic: advisories where they apply, and 2D plastic collapse released (#1551, #370, #758)

Three registered changes. The first two change which warnings a solve carries and move no number;
the results snapshots differ in their diagnostic codes only. The third releases a result that was
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
These changes affect diagnostic codes and the recorded second-order screening ratio.

## Dynamics warnings split, the rotary-inertia one on deep members only

Results-change entry `dynamics-rotary-inertia-advisory-deep-members` (#370).

`NL-DYNAMIC-GAPS` joined two known issues in one warning: a material nonlinear analysis may go on
after an unconverged increment, and beam dynamics omits the rotary inertia of bending. It was on
every material nonlinear analysis and on every modal, time-history and harmonic analysis of a
model with a frame member (or, in 3D, a curved beam).

- `NL-UNCONVERGED-INCREMENT` is the nonlinear half, on material nonlinear analyses only.
- `NL-DYNAMIC-GAPS` keeps the rotary-inertia half, on dynamic analyses only when a frame member or
  curved beam has r/L > 0.045, r being its larger radius of gyration. The Rayleigh-beam correction
  ω/ω_EB = 1/√(1 + (πr/L)²) keeps the first-mode error under 1 % below that. Members are taken as
  chains of elements through free joints that turn by less than 30°, so a curved beam's segments
  count as one member, and the warning names them.

What moves: diagnostic codes only. In the corpus, `pro-3d-portal-frame` loses one of the two
`warning:known_issue` codes of its spectral X and Y results. No number changes.

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
(6 + 4√2)Mp/(qL²) = 12.329. At every step the moment along every member stays within Mp to 1e-6;
before this, it passed Mp by 0.45 % and 0.19 % at the second and third steps of the portal and by
12.8 % at the first step of the spring support.

What moves: Basic 2D plastic collapse gives a collapse factor and hinges again where the
certificate confirms them (`solve.ok`, `collapseFactor`, `hinges`). The plastic analyses are not in
the results corpus, so no snapshot moves for this entry.

For a planar truss under nodal forces, the engine can also confirm axial collapse by joint
equilibrium. At the reported factor the exact force field must satisfy every axial capacity.
At least one member must reach its capacity with an axial force that every equilibrium field
shares. A larger load would exceed that capacity. This preserves the yielded-truss result from
#2608 without relying on the step history to certify its factor.

For an axially yielding truss, equilibrium determines the squared collapse factor exactly even when its square root is irrational. The certificate checks the returned floating-point value against the two adjacent representable numbers enclosing that root. A representable root must still match exactly.
