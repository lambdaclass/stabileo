# Solid-shell stress axes (#757)

Results version 5 changes SHB8-ANS-EAS centroid `sigmaXx`, `sigmaYy`, `tauXy`
and their in-plane `vonMises`. They were taken from the global XX, YY and XY
components, dropping in-plane stress carried by global Z on vertical or inclined
panels. Curved panels are affected element by element.

The reported frame is the same orthonormal frame used for the element's
in-plane error-estimation samples, evaluated at the centroid: e3 is the normalized
thickness tangent ∂x/∂ζ, e1 is ∂x/∂ξ projected perpendicular to e3 and normalized,
and e2 = e3 × e1. The full Cauchy stress tensor is projected as eᵢᵀ σ eⱼ.
The reported von Mises retains the in-plane definition
√(σ11² − σ11 σ22 + σ22² + 3 τ12²). It is a centroid membrane measure,
not an extreme-fibre bending stress or a full 3D equivalent stress.

The full global tensor used for geometric stiffness and the full 3D von Mises
at integration points are unchanged, as are stiffness, loads, displacements,
reactions, moments and other shell families. For X–Y elements whose local axes
align with global X/Y, all four reported values stay exactly identical. An
in-plane rotation of the element axes changes the component labels to local axes;
the in-plane von Mises remains invariant. This is an intentional coordinate
convention, including for skewed X–Y meshes.

The regression suite solves flat and cylindrical panels under rotated nodal loads
(90° and arbitrary rotations about X) and checks every centroid component and
von Mises. An independent vertical plate traction field has σ22 = N/A = 500
kN/m²: the old recovery reported σ22 = von Mises = 0; the corrected recovery
reports 500. Review regressions also apply traction with local e1 along global Z
(σ11 = N/A = 500 kN/m²), and rotate a membrane patch about both X and Y with
analytically prescribed (σ11, σ22, τ12) = (700, −200, 150) kN/m² and
von Mises = √737500 kN/m². The affine displacement fields use isotropic
compliance, including the Poisson thickness contraction and tensor shear strain.
The aligned X–Y regression requires bitwise equality to the old formula.

Observed centroid von Mises (kN/m²), from the regression's first element:

| Model | Before | After |
|---|---:|---:|
| Flat strip, X–Y | 28427.29517755 | 28427.29517755 |
| Same strip, rotated 90° about X | 28333.39215676 | 28427.29517750 |
| Same strip, rotated 0.731 rad about X | 28383.14529186 | 28427.29517738 |
| Cylindrical panel, original orientation | 29601.69188194 | 29603.06434563 |
| Same panel, rotated 1.123 rad about X | 29512.73927370 | 29603.06434552 |
| Vertical analytical traction patch | 0 | 500 |

Before the implementation change, four of the five original regressions failed; only the
aligned X–Y identity test passed. After the change all five passed. Rotation
comparisons allow 1e-7 of the element's stress scale, accounting for the separate
linear solves; the aligned X–Y recovery test compares floating-point bits.

With the two review regressions, all seven frame tests pass. Reverting only the
σ11 projection to global XX in an isolated copy fails exactly the two new tests;
the original five still pass. This guards the previously uncovered local e1
rotation as well as signed local shear under a compound rotation.

The saved-project notice conservatively selects models containing `plates`,
`quads`, or `solidShells`. Standalone `quad9s` and `curvedShells` collections are
not selected; those element families are numerically unaffected. The current
web results corpus has no SHB8 models (the web shell selector still lists SHB8PS
as planned); its other shell families must keep their committed snapshots.

The SH-GLOBAL-STRESS refusal that #807 proposed for #757 was removed when #807
merged this fix; the containment ledger lists #757 as corrected.
