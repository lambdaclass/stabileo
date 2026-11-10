# SA-2026-055: P-Delta understated amplification when compression grew along a frame member under axial span loads

| | |
|---|---|
| Severity | High |
| Status | Draft 2026-11-10; fix prepared locally, not released |
| Issue | [#1329](https://github.com/lambdaclass/stabileo/issues/1329) |
| Fix | Local fix; no PR or published release yet |
| Affected versions | Confirmed on main `8f4c3ee6c`; release boundaries not bisected |
| Re-check registry | results-change entry `pdelta-span-axial` |

## Affected features

- **App: 2D and 3D P-Delta analysis** when a frame member carries a distributed
  load or point load with a component along its axis, and checks derived from
  that analysis.
- **Engine/WASM:** `solve_pdelta_2d`, `solve_pdelta_3d`, and their certified
  wrappers.

The effect depends on the axial force distribution and the deformed shape.
Compression growing toward the end that rotates most can produce unconservative
amplification. Purely nodal axial loads on a member with constant axial force are
outside this defect. Linear analysis and the already corrected linear buckling
solvers are outside this advisory.

## What was wrong

P-Delta built each frame element's geometric stiffness from its mean axial force.
Span loads make the axial force vary along the element. The missing term was
∫(N(x) − N̄)φ′ᵢφ′ⱼ dx. Refining the mesh reduced the error but did not make the
one-element result correct. Main carried a `PD-SPAN-AXIAL` warning for distributed
axial loads and 2D axial point loads, but still returned the numbers. Its 3D
warning did not cover axial point loads.

Measured on main `8f4c3ee6c`: a 4 m cantilever with EI = 20,000 kN·m², tip
thrust 3,000 kN, opposing axial span load +750 kN/m, and transverse tip force
1 kN. Compression rises from zero at its base to 3,000 kN at the tip. Both
2D and either 3D bending plane give the following:

| Quantity | Main, 1 element | Fixed, 1 element | Independent continuum reference |
|---|---:|---:|---:|
| Tip sway (mm) | 2.056224900 | 3.246977547 | 3.335195644 |
| Base moment (kN·m) | 7.084337349 | 10.165803109 | 10.396127264 |
| Displacement amplification B₂ | 1.927710843 | 3.044041451 | 3.126745917 |

Main's one-element sway was 38.35% low and its moment 31.86% low against the
continuum. At eight elements, sway was 3.307631802 mm on main and is
3.335175352 mm after the fix. The fixed one-element result agrees with an
independently integrated cubic Ritz model; its remaining error against the
continuum is interpolation error. Mesh convergence remains necessary.

The independent shooting solution of EI θ″ + (Px/L)θ = −F gives the critical
tip thrust Pcr = 4,345.773759991 kN. At 1.02 Pcr, main returned a stable
one-element result; the fix returns unstable. Full fixture parameters, equations,
mesh measurements and reference convergence are in
[the results-change write-up](../results-changes/2026-11-pdelta-span-axial.md).

## How to tell if your results are affected

Check whether a P-Delta result includes frame members with distributed or point
loads along their axes. Include gravity components on inclined members when
those components are passed as axial span loads. The model can be affected even
if a different member governs a design check.

The registry flags projects with frame members, member loads and P-Delta analysis.
That is broader than this defect: transverse-only member loads do not trigger
the missing axial-force term.

## Fixed in

Fix prepared locally on 2026-11-10; no published release is claimed. The fix
uses the existing buckling span integration on the P-Delta dense and sparse
paths, geometric end-force recovery, and certified residual model. It removes
`PD-SPAN-AXIAL` after correcting that formulation. Regressions are in
`engine/tests/pdelta_span_axial.rs`.

## Workaround

On affected builds, subdivide members carrying axial span loads and refine until
the displacement, moments and stability result converge. A fixed number of
subdivisions is not an accuracy guarantee, especially near critical load.

## What to do with results you already have

Re-run affected P-Delta analyses on a corrected build and reassess checks based
on their displacements, forces, amplification or stability. Compare refined
meshes where the result is sensitive to amplification. Previously reported
stable results can become unstable.
