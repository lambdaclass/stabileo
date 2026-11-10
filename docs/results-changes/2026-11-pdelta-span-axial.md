# P-Delta integrates the axial force distribution under span loads

Issue [#1329](https://github.com/lambdaclass/stabileo/issues/1329). Draft advisory
[SA-2026-055](../advisories/SA-2026-055-pdelta-span-axial.md); fix not yet merged or deployed.

## P-Delta integrates the axial force distribution under span loads

2D and 3D P-Delta built frame geometric stiffness from the mean axial force
EA(δ/L − αΔT). Under axial span loads that force varies along the element. Where
compression grows toward the end that rotates most, replacing N(x) by its mean
understates destabilising work and second-order amplification. The existing
`PD-SPAN-AXIAL` warning identified distributed axial loads (and 2D axial point
loads), but did not correct the numbers. The 3D warning did not cover axial point
loads.

P-Delta now adds the existing buckling correction ∫(N(x) − N̄)φ′ᵢφ′ⱼ dx to the
mean-force matrix, on both dense and sparse paths, using the same plane helper
in 2D and both 3D bending planes. Integration splits at point-load and partial-load
boundaries; four-point Gauss is exact for the polynomial integrands from uniform
or linearly varying axial distributed loads and axial point loads. The 3D
warping, Wagner, shear-centre coupling and release condensation follow the existing
buckling implementation. Trusses and cables retain their mean-force stiffness:
their constant transverse slope sees only the mean.

The same correction enters geometric end-force recovery, reactions, and the
constant part of the P-Delta certificate's residual and Jacobian. The certificate
therefore bounds the corrected discrete model. `PD-SPAN-AXIAL` is removed. Buckling
continues to add its own correction once; linear analysis is unchanged.

## Independent reference and measured changes

Measurements use unchanged main `8f4c3ee6c` and the fix in this worktree. The
reproducers were committed first, ignored as `known wrong result: #1329`, and all
four failed when explicitly enabled on main.

The fixture is a 4 m cantilever along X, E = 200,000 MPa, A = 0.01 m²,
I = 10⁻⁴ m⁴ (both bending planes in 3D), EI = 20,000 kN·m², a 3,000 kN tip
thrust, an opposing uniform axial load +750 kN/m, and a transverse tip force
F = 1 kN. Thus compression C(x) = 3,000x/4 kN, from zero at the base to the
full thrust at the tip. The first-order sway is 1.066666667 mm and base moment
is 4 kN·m.

The independent continuum reference integrates

    EI θ″ + C(x) θ = −F, θ(0) = 0, θ′(L) = 0, v′ = θ.

`pdelta_span_axial.rs` shoots with two RK4 initial-value solutions and combines
them to satisfy the free-end condition. Doubling 1,024 to 2,048 steps agrees to
1e-10 relative for sway, base moment and the critical load. The homogeneous
problem, bisected on θ′(L) = 0, gives Pcr L²/EI = 3.476619007993 and
Pcr = 4,345.773759991 kN. Base moment is EI θ′(0).

A separate Simpson integration over the cubic Hermite functions gives the
one-element Ritz solution, without calling engine stiffness or quadrature
helpers. For this linear C(x), its free geometric block on (v_tip, θ_tip) is
−P diag(3/(5L), L/10), and its elastic block is
EI [[12/L³, −6/L²], [−6/L², 4/L]]. It gives 3.246977547 mm sway and
10.165803109 kN·m base moment. The continuum gives 3.335195644 mm and
10.396127264 kN·m. The remaining one-element error after the fix is ordinary
cubic interpolation error; no one-element result is claimed to be exact for
the continuum.

| Elements | Main sway (mm) | Fixed sway (mm) | Main base moment (kN·m) | Fixed base moment (kN·m) | Main B₂ | Fixed B₂ |
|---|---:|---:|---:|---:|---:|---:|
| 1, 2D and either 3D plane | 2.056224900 | 3.246977547 | 7.084337349 | 10.165803109 | 1.927710843 | 3.044041451 |
| 8, 2D and either 3D plane | 3.307631802 | 3.335175352 | 10.321504356 | 10.396074252 | 3.100904814 | 3.126726893 |
| 16, either 3D plane | 3.328271093 | 3.335194376 | 10.377370921 | 10.396123952 | 3.120254150 | 3.126744727 |
| 32, 2D | 3.333462393 | 3.335195565 | 10.391431846 | 10.396127057 | 3.125120993 | 3.126745842 |
| Continuum reference | — | 3.335195644 | — | 10.396127264 | — | 3.126745917 |

Main understates one-element sway by 38.35% and moment by 31.86% against the
continuum. Against the same one-element interpolation with the correct geometric
work, the errors are 36.67% and 30.31%. At eight elements, main's sway is still
0.826% low; at 32, 0.052% low. Fixed eight-element sway is 0.000609% low.

At P/Pcr = 0.690326, the single-mode B₂-style estimate 1/(1 − P/Pcr) is
3.229200843, compared with continuum displacement amplification 3.126745917.
Moment amplification M/(FL) is 2.599031816, compared with main's one-element
1.771084337 and fixed 2.541450777. These displacement and moment ratios are
different response measures; the single-mode estimate is not the exact forced
solution. Main also reports the one-element fixture stable at 1.02 Pcr; the fix
reports it unstable, consistent with the independent one-element critical load
3.542486889354 EI/L², below 1.02 Pcr.

## Scope and verification

Re-run P-Delta results and checks derived from them when frame members carry
axial distributed or axial point loads. The sign of the change depends on the
force distribution; it is not always an increase. Models with no axial span
loads retain their geometric stiffness. This change does not establish accuracy
of other nonlinear formulations or remove the need for mesh convergence.

Regression coverage includes the independent references, one-element and refined
meshes across the dense/sparse transition, 2D rotation, both 3D bending planes,
axial point loads, near-critical stability, free-end moment equilibrium,
certification of the corrected model, and reversal/load-splitting invariance.

## PR #1895: snapshot audit and consistent teaching solver

The snapshot audit compares `origin/main` (`cfd541d17`) and the PR engine using
identical app inputs and the existing results capture. All non-P-Delta captured
values are byte-identical between those engines, including the linear base,
cases, combinations and envelopes, buckling, modal and spectral results. The
portal's tiny modal/spectral differences against the older committed snapshot
also occur on current main; the existing snapshot merge preserves those baseline
bytes. No tolerance or assertion changed.

Only `pro-3d-portal-frame` (144 leaves) and `pro-3d-tower` (246 leaves) change under
the snapshot comparison rule. Every changed path starts with `pdelta.`:

- `pdelta.b2`;
- `pdelta.results.displacements`: ux, uy, uz, rx, ry, rz;
- `pdelta.results.elementForces`: nStart/nEnd, vyStart/vyEnd, vzStart/vzEnd,
  mxStart/mxEnd, myStart/myEnd, mzStart/mzEnd;
- `pdelta.results.reactions`: fx, fy, fz, mx, my, mz;
- `pdelta.results.diagnosticCodes`: the obsolete span-load warning disappears.

There are no added or removed leaves, stability or convergence changes in these
examples. Both PRO examples include generated gravity self-weight as member span
loads (`selfWeightSolverLoads`), with an axial component on their vertical frame
columns: portal members 1–4 and tower members 1–8. Redistributed end forces can
also change in other members. The tower's inclined braces are trusses and retain
their mean-force matrix. The largest relative numeric change is 0.0857031% in
portal torsional end moments and 0.497939% in tower transverse end shears, measured
as |new − old| / |old| over changed nonzero leaves.

The registry lists the affected displacement, force and reaction fields,
amplification, diagnostics and possible stability/refusal outcomes explicitly,
without a wildcard. Its condition includes frame P-Delta projects even without
saved member loads: generated self-weight is not necessarily stored there. In
particular, requiring `memberLoads` suppressed the notice for `3d-tower`.
The registry's `examples` scope is deliberately not used: it means only example
inputs changed and excludes saved models, whereas this is an engine correction.
The two affected example ids and quantity families are stated in all six registry
explanations.

### Independent check of the teaching cantilever

The existing teaching fixture has L = 5 m, E = 200,000 MPa, I = 10⁻⁴ m⁴,
EI = 20,000 kN·m², tip compression P = 100 kN, lateral tip force H = 2 kN,
and axial distributed load −6 kN/m. Its compression is
C(x) = P + W(1 − x/L), W = 30 kN. These parameters are read from the fixture,
not inferred from either solver's answer.

Independently integrate the cubic trial field
v(t) = (3t² − 2t³)v_tip + L(t³ − t²)θ_tip, t = x/L, with its base fixed.
Stationarity of

    Π = ½∫ EI(v″)² dx − ½∫ C(x)(v′)² dx − H v_tip

gives a free stiffness [[a,b],[b,c]], where

    a = 12EI/L³ − (6P + 3W)/(5L)
    b = −6EI/L² + (P + W)/10
    c = 4EI/L − (2P/15 + W/30)L
    v_tip = Hc/(ac − b²), θ_tip = −Hb/(ac − b²).

Including the base-rotation trial function before setting its DOF to zero gives

    M_base = −[(−6EI/L² + P/10)v_tip
               + (2EI/L + (P/30 + W/60)L)θ_tip].

This independent polynomial integration gives v_tip = 0.004407757561066027 m,
θ_tip = 0.0013246794252269375 and M_base = 10.490333626707253 kN·m.
The engine gives M_base = 10.490333626707246 kN·m. The previous teaching result,
10.508408979997858 kN·m, used the mean-force matrix and is wrong for the same
one-element cubic model. These are discrete values, not an exact continuum
solution. The reference test computes the formula directly, without calling
production stiffness, span integration or quadrature helpers. The governing
virtual-work basis is described in the University of Alberta's
[Principle of Virtual Work](https://engcourses-uofa.ca/books/introduction-to-solid-mechanics/variational-principles/the-principle-of-virtual-work/the-principle-of-virtual-work/);
the polynomial integrals and fixture-specific expressions above are derived here.

The consistent teaching method now adds ∫(N(x) − N̄)φ′ᵢφ′ⱼ dx before its existing
elastic release condensation, in assembly, geometric end forces and reactions.
Four-point Gauss integration splits at point and partial-load boundaries.
The chord and constant-force stability-function methods keep their existing
formulations. Tests cover the independent uniform-load calculation, trapezoidal
and partial axial loads at one and four subdivisions, and direct point loads plus point loads split into
nodes by the existing refinement path. The pre-existing force comparison retains
its 5e-7 absolute tolerance.


## PR #1895: force-based geometric-stiffness assembly

The public Rust helpers `build_kg_from_forces_2d` and
`build_kg_from_forces_3d` still omitted the axial span correction after the
P-Delta displacement builders were corrected. Their matrices disagreed with the
span-integrated matrices, including after constraint reduction. Both helpers now
use `span_axial_geometric_stiffness_2d` or
`span_axial_geometric_stiffness_3d`, the same integration used by dense and sparse
P-Delta assembly, geometric end-force recovery, buckling and the P-Delta
certificate. The 2D inclined-support rotation and the 3D retained-DOF path receive
the correction before rotation or reduction. A force list selecting only some
members receives span contributions only for those members.

The affine decomposition is

    Kg(u) = Σ N̄_e(u) G_e + G_span.

`geometric_stiffness_terms_2d` and `geometric_stiffness_terms_3d` describe the
first sum. The span contribution is constant with respect to displacement and
must be included separately. The certificate already adds it to the constant
stiffness before constructing its residual and Jacobian. Buckling adds it once
to its geometric matrix and retains it separately for geometric-work
uncertainty. Treating the first sum as the complete matrix drops span work;
adding `G_span` to the complete displacement-based matrix counts it twice.

The added `force_kg_2d_integrates_span_loads_like_displacement_assembly` and
`force_kg_3d_integrates_span_loads_in_both_bending_planes` regressions use the
existing one-element cantilever fixture. An independent Simpson integration of
−∫ C(x) φ′ᵢφ′ⱼ dx supplies the reference for uniform axial distributed loads and
an axial point load, in 2D and both 3D planes. Both tests were committed first as
`known wrong result: #1329` and failed when explicitly enabled. They pass with
the shared correction, as do the existing span-load displacement, reaction,
end-force, stability and certificate regressions.

The repository's application solvers do not call either force-based builder;
they use the displacement emitters that were already corrected in this PR.
Consequently this follow-up does not require additional application snapshot
changes or extend the affected saved-model conditions. Downstream Rust callers
of the force-based builders do receive changed matrices under axial span loads.
Their scope is included in SA-2026-055 and the existing `pdelta-span-axial`
registry explanation; no additional release boundary is claimed.


## PR #1895 review round 2: use one axial-force centre

Adding the span correction to the force builders was insufficient for an
asymmetric axial load. Their constant part still used the end average
(N_start + N_end)/2, while the correction subtracted the length mean N̄.
The omitted term was (N̄ − (N_start + N_end)/2) G. Both force builders now
obtain that shift from the same span integration and use the length mean
for their constant part. The complete frame matrix is exactly
∫N(x)φ′ᵢφ′ⱼ dx for the cubic trial functions, with the existing release
condensation. Trusses and cables use the corrected mean with their constant
transverse slopes. The input axial span loads supply the force variation;
callers must supply the actual member end forces, not synthetic equal end
values representing its length mean.

Four additional regressions were committed first with
`#[ignore = "known wrong result: #1329"]`. They independently integrate
geometric work by Simpson's rule and compare both force-based and
displacement-based assembly in 2D and both 3D bending planes. They use the
existing cantilever parameters above and these asymmetric loads:

- An opposing axial point load +P at L/4 with tip thrust P gives compression
  zero below L/4 and P above it. Mean compression is 3P/4, whereas the end
  average is P/2.
- An opposing axial trapezoid from P/(2L) to 3P/(2L), again with tip thrust P,
  gives C(t) = P(t + t²)/2, t = x/L. Mean compression is 5P/12, whereas the
  end average is P/2.

The first free bending entry, on tip translation, changes as follows in both
dimensions (kN/m):

| Load | Before round 2 | Corrected and independent integral |
|---|---:|---:|
| Point at L/4 | −581.8359375 | −806.8359375 |
| Axial trapezoid | −428.571428571429 | −353.571428571429 |

All four tests failed on the force-builder assertion before the fix; their
displacement-assembly checks already passed. All pass after the fix. The
assembly-path oracle now constructs actual end forces from its prescribed
mean and independently integrated equivalent end loads. Its zero-mean
reference therefore continues to isolate G_span. Signed base-moment checks
also retain the 2D/3D conventions instead of accepting either sign.

The displacement emitters retain their numerical integration. No application
solver calls the public force builders, so this centering repair changes the
Rust matrix API without an additional application result change. The bundled
crane baseline audit below covers a previously unrecorded application change
from the original P-Delta span correction.


### Crane-hangar workbook baseline

The gallery baseline test also covers `pro-crane-hangar`, outside the earlier
results-snapshot corpus comparison. The example requests P-Delta per combination
and generates member axial span loads through gravity self-weight. With the
corrected engine its maximum reaction Fx, at node 33 in combination 4
(`1,2 D + 1,6 Grúa 2 + 0,5 S`), is 23.03318028125302 kN; the committed
baseline contained 23.033548451025997 kN. An independently built current-main
engine (`f032e42fa`) gives 23.033548451026192 kN, agreeing with the old baseline
within its unchanged tolerance. This is a second-order reaction change caused
by the original span correction, not by the round-2 force-builder repair.

Using identical gallery inputs and the same application combination path, a
side-by-side capture of current main and the corrected engine finds every raw
linear case (7), linear combination (11), and linear envelope byte-identical.
The linear cases returned alongside P-Delta combinations are also byte-identical.
Only the P-Delta combination outputs, their derived envelopes and workbook
maxima differ. All stored linear-case statics rows remain byte-identical. The
66 changed statics rows belong to P-Delta combinations, including reaction and
residual values. Across the maxima table, 36 numeric values change; the table's
source, entity, sign, station and governing combination remain unchanged.
The changed quantity families are second-order displacements, member forces,
reactions, amplification and the removed span-load diagnostic, already within
the registry's explicit scope. The existing `make test.web.unit` target, filtered
to the crane example with `STABILEO_UPDATE_BASELINES=1`, regenerates its baseline.
No tolerance or assertion is relaxed.


### Validation-04 workbook baseline and linear-drift attribution

The validation-04 model explicitly sets `analysis.perCombination` to `pdelta`;
its individual cases remain linear. The original span correction also changes
this model's second-order workbook results. With independently built WASM from
`origin/main` (`87e1c9a1b`), maximum reaction Fx is 514.3256888047104 kN,
agreeing with the stored 514.3256888047089 kN within the unchanged baseline
tolerance. The corrected engine gives 514.3288411696504 kN, at node 6007 in
combination 319. The force-builder centering follow-up adds no application
result change.

A cell-by-cell comparison of the stored and regenerated validation-04 baseline
finds exactly 72 changes. Every changed cell has `source = combination` and
belongs to P-Delta combination 319, 321 or 322:

| Workbook table | Changed column | Changed cells | Quantities |
|---|---|---:|---|
| Maxima | value | 30 | Reaction Fx/Fy/Fz; displacement ux/uy/uz and rotations θx/θy/θz; member N/Vy/Vz/T/My/Mz, each maximum and minimum |
| Statics | reactions | 18 | Summed fx/fy/fz/mx/my/mz for each of the three combinations |
| Statics | residual | 18 | Derived force and moment equilibrium residuals for those combinations |
| Statics | worstRelative | 6 | The derived equilibrium summary repeated on the six component rows of combination 321 |

All maxima entities, stations, source identities and governing combinations
remain unchanged. Applied loads and every cell in the 132 statics rows from
22 linear cases are byte-identical to the stored baseline. The registry already
lists these displacement, member-force and reaction quantities explicitly;
its explanations now include validation-04 and the derived statics summaries.
The statics moments are measured in the undeformed geometry and need not close
for second-order results.

For attribution of last-bit drift against other stored baselines, the same seven
baseline tests were regenerated with `STABILEO_UPDATE_BASELINES=1` on a clean
`origin/main` worktree and this branch, each using its own WASM build and the same
inputs. All 2,268 cells in the 252 linear-case statics rows are bit-identical
between main and this branch, with numeric cells compared by their IEEE-754
binary representation. The older stored baselines differ from both engines in
36 linear-case cells for `pro-concrete-wall-storehouse`, 24 for `validation-02`,
36 for `validation-05` and 4 for `validation-06`. That drift therefore predates
this PR; its originating commit was not bisected. The other three audited models
are `pro-plane-frame-seismic`, `pro-rc-frame-area-loads` and `validation-04`.
Only validation-04's baseline is updated here. The other six retain their exact
stored bytes and pass their existing comparisons. No tolerance, assertion or
other baseline is changed.

## PR #1895: endpoint axial point loads in force-based geometric stiffness

Review of `aca7eb07a` found that its solver change and endpoint expectations
were wrong. It treated recovered end forces as interior limits and replaced
the previous correct centring. Endpoint point loads have zero varying-span
contribution, but they still enter the equivalent nodal axial forces. They
therefore change the conversion from recovered end average to length mean.

Let F_i and F_j sum the equivalent nodal axial forces of every span and
point load, including points at a = 0 and a = L. The solver recovers

    n_start = N_delta + F_i
    n_end = N_delta - F_j
    N_delta = (n_start + n_end)/2 - (F_i - F_j)/2.

For a point force +P at a, F_i = P(1 - a/L) and F_j = Pa/L. The integrated
offset is n_of(x) = -sum of point forces strictly before x minus integrated
span loads. Its length mean is -F_i, so the original shift
`mean(n_of) + total_applied_force/2` equals -(F_i - F_j)/2. The fix restores
that expression, including every endpoint load. Subtracting the offset's
interior endpoint average instead loses the endpoint contributions in the
recovered forces. The varying-span matrix retains its existing length-mean
subtraction and quadrature.

The existing cantilever has L = 4 m, P = 3,000 kN, and tip thrust -P. With
+P applied at the base the interior force is constant N = -P. With +P at the
tip it cancels the tip thrust and N = 0. Both cases recover approximately
n_start = 0 and n_end = -P; their end average -P/2 is not the interior force.

Eight corrected closed-form regressions in `engine/tests/pdelta_span_axial.rs`
cover both endpoints, frames and trusses, in 2D and 3D. Each uses the linear
solver's recovered forces and axial displacement, checks both assemblies
against the closed form, and compares the complete free matrix from force
assembly with the independent displacement-based assembly. For a frame the
free bending block is N [[6/(5L), -1/10], [-1/10, 2L/15]]; for a truss its
transverse entry is N/L. Both 3D bending planes and their rotation signs are
checked. The axial-only frame solution also supplies the truss assembly's
elongation; both use the same EA/L axial law.

| Endpoint | Frame entry at aca7eb07a (kN/m) | Restored and closed form (kN/m) | Truss entry at aca7eb07a (kN/m) | Restored and closed form (kN/m) |
|---|---:|---:|---:|---:|
| a = 0, 2D and both 3D planes | -450 | -900 | -375 | -750 |
| a = L, 2D and both 3D planes | -450 | 0 | -375 | 0 |

Commit A records the corrected tests ignored as `known wrong result: #1329`.
Explicitly running them on the unchanged `aca7eb07a` solver gives eight
failures at the force-matrix closed-form assertions; the displacement assembly
passes the same closed-form checks. Commit B restores the previous solver
centring and removes the ignores. The advisory-table additions and six status
dates from `aca7eb07a` are retained.

The endpoint-centring regression in `aca7eb07a` existed only on this unmerged
PR branch, never on main or in a release, so it requires no separate advisory.
The application uses displacement-based assembly, so this endpoint restoration
adds no application result change beyond draft SA-2026-055. The existing `pdelta-span-axial` registry
entry has corrected endpoint explanations in all six languages. No baseline,
tolerance or assertion is loosened.

Verification after restoring the solver: 27 span-axial tests (including all eight
endpoint regressions), 29 core P-Delta tests, five solver P-Delta diagnostic
tests, 90 validation P-Delta tests and eight P-Delta library tests pass.
Assembly paths pass 20 with three existing ignores. `make wasm` succeeds;
all 152 template tests and 123 results tests pass, with one existing results
skip. All 112 provenance unit tests pass. No result snapshot or baseline was
updated in this round.
