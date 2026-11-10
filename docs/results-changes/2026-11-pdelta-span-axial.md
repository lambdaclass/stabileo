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
