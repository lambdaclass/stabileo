# Discretization error: estimated, not certified

The certificates (`CERTIFY.md`) bound the **algebraic error**: how far the computed
displacements `ũ` are from the exact real solution `u*` of the assembled finite-element system
`K u = f`. That bound is rigorous, proved in Lean, and says nothing about the **discretization
error**: how far `u*` is from the solution of the structure the mesh stands for. A coarse shell
mesh can be certified to twelve digits and still be wrong by tens of percent.

The engine estimates the discretization error (`engine/src/postprocess/discretization/`). The
estimates are not bounds and are never presented as certified: every payload carries
`certified: false`, and the UI says "estimated … (not certified)" next to the certified algebraic
bound:

    Algebraic error: certified ≤ 3.1e-12 · discretization error: estimated ~4.2% (energy norm, not certified)

| | Algebraic error | Discretization error |
|---|---|---|
| What | `‖u* − ũ‖₂` for the assembled `K u = f` | `‖u − u*‖` against the continuum model |
| How | interval arithmetic, Gram/Gershgorin, Lean | stress recovery (ZZ/SPR), Richardson extrapolation |
| Status | certified bound | estimate: can be wrong in either direction |
| Depends on the mesh | no (it is about the mesh's system) | yes, that is the point |

## Frames: no discretization error

Frame members use the exact stiffness of the Euler–Bernoulli or Timoshenko beam (the
Timoshenko "interdependent interpolation", `element/fef.rs`) and member loads enter through exact
fixed-end forces, with diagrams integrated exactly between the ends. For linear static analysis
the nodal displacements and member forces of a frame model are therefore exact for beam theory
however few members are used, and the estimate says so (`framesExact`) instead of reporting a
number — only when that holds for every member. Exceptions, named and not estimated:

* members with warping torsion (section Cw > 0), whose warping field is a cubic Hermite
  approximation: a cantilever's tip twist changes when it is split (`warpingMembersNotEstimated`,
  listed in `inexactMembers`);
* members of variable section, which the web app solves as chains of prismatic pieces
  (`web/src/lib/engine/variable-members.ts`): the engine sees prismatic members, so the panel
  withholds the claim itself when the model has any;
* curved beams, which the engine replaces by straight segments (`curvedBeamsSegmented`);
* nonlinear analyses (P-Δ, buckling, corotational), whose geometric stiffness is approximate per
  member, so the number of members matters there;
* beams modeled on discrete springs standing for a continuous foundation.

## 1. A posteriori estimate: Zienkiewicz–Zhu with superconvergent patch recovery

`estimate_3d(input, results)` (WASM `estimate_discretization_3d`), for DKT triangles, MITC4
quads, MITC9 quads, curved shells and SHB8 solid-shells.

1. **Sampling** (`samples.rs`). Each element's own stress field is read at its integration
   points as plane stress (σ11, σ22, σ12) in the local frame there: membrane stress and
   moments become stresses at ζ = ±1/√3 through the thickness, σ(ζ) = σm − 6Mζ/t², which
   integrates the membrane-plus-bending energy exactly with two points. DKT: CST membrane plus the
   linear DKT moments; MITC4/MITC9: the Gauss values; curved shells and solid-shells: their own
   2×2×2 points. Thermal strains are subtracted as in each element's stress recovery.
2. **Recovery** (`recovery.rs`, Zienkiewicz & Zhu 1992). At every node the surrounding elements
   are grouped into patches that may share a smooth field: same family, material and thickness,
   normals within 30° (a fold, a wall–slab junction or a change of section is a real
   discontinuity and is never smoothed). Over a patch a polynomial — linear in the tangent-plane
   coordinates (quadratic for MITC9), times (1, ζ) for shells, linear in 3D for solid-shells — is
   fitted by least squares to every component of the *global* stress tensor, so elements with
   different local axes are compared in one frame. Its value at the node is the recovered
   nodal stress; σ* inside an element is the shape-function interpolation of those values.
   Patches too small for the degree fall back to a lower one, ultimately the patch average.
3. **Estimate.** Element indicator `η_e² = ∫ (σ* − σh)ᵀ C⁻¹ (σ* − σh) dV` (plane-stress
   compliance), global `η² = Σ η_e²`, relative error `η / √(‖uh‖² + η²)` with
   `‖uh‖² = ∫ σhᵀ C⁻¹ σh dV` over the same components. The element map shows
   `η_e / √((‖uh‖² + η²)/N)` in percent: uniformly spread error gives every element the global
   percentage, so an element above the threshold is where refinement pays.

**Not covered.** Transverse shear energy is not included (`transverseShearExcluded`): the
MITC/ANS shear fields are not recoverable point by point and their energy is a small part of a
thin shell's. For solid-shells only the in-plane stresses in the mid-surface frame are used (the
thickness strain and transverse shears are ANS fields). Point loads and re-entrant corners have
singular stresses: the estimate concentrates there and stays large under refinement, which is
the honest answer.

**Never 0/0 as "no error".** When the shells store no strain above round-off (less than a
strain of 10⁻¹² everywhere would), the ratio is 0/0 and no percentage is reported:
`unestimableReason` is `unloaded` (nothing loads the model) or `noStrainEnergy` (it is loaded,
but the load goes straight into the supports — one simply supported element under pressure is
the simplest case; the mesh is too coarse to say anything and the panel warns to refine it), or
`tooCoarse` when no element shares a node with another of its kind (a one-element mesh): every
recovery patch is the element itself, so the recovered field is its own and the estimate would
be ≈ 0 by construction; or `nonFinite` when the stress field holds NaN or infinity (a NaN
ratio compares false against every threshold and would read as small; flagged, no element
map). "Alone" uses the recovery's own patch definition (`recovery::patches`):
two triangles meeting at a 90° fold share a node but not a patch. When only some elements are
alone (a lone gusset, an element cut off by folds), they are listed in `isolatedElements`, have
no indicator (absent, not 0) and no colour on the map, are left out of the global figure, and
flag the result if they carry more than 0.1 % of the strain energy. The
element map is not drawn for an estimate that could not be made. In the convergence study a
governing quantity that is zero on the model as drawn is kept (zero is a value): a one-element
plate's zero moment against the refined meshes' non-zero ones is an estimated error of 100 %.

A result whose estimated relative error exceeds 5 % is flagged (`exceedsThreshold`) and the UI
shows a warning.

## 2. Convergence check: uniform refinement and Richardson extrapolation

`convergence_study_3d(input, options)` (WASM `convergence_study_3d`, run on demand).

* **Refinement** (`refine.rs`). Every shell-type element is split in four (DKT into four
  triangles; MITC4 and curved shells into four quads; MITC9 into four MITC9 on the parent's
  quadratic geometry; solid-shells into four in the plane, one element through the thickness),
  twice by default: h → h/2 → h/4. Geometry mode `smooth` (default) places a new edge node on
  a quadratic surface fitted by least squares to the nodes around the edge ends (in a frame
  normal to the edge's elements), so a coarse faceted roof converges to the curved roof; a fit
  rather than averaged nodal normals because averaged normals are biased at free edges, which
  only see one side. `faceted` keeps the model exactly as drawn. Folds, edges shared by three or
  more elements and edges carrying a frame member stay straight. Frame members along split
  edges are split at the same node (exact), with releases kept at the outer ends and member loads
  split. A new node on an exterior edge (one element on it) between supported nodes gets the
  restraints both share, and interpolated prescribed displacements: a plate simply supported on
  its edges stays supported along them, however coarse. Nodes on interior edges and element
  centres stay free: a slab meshed one element per bay on a column grid keeps its interior
  columns as points (supporting every edge between two columns would pin the whole refined
  slab), and a wall under a slab drawn as a row of supported nodes is refined as that row of
  points. The exterior-edge rule cannot tell columns on a free edge (or the end edge of a strip
  one element wide) from a coarse supported edge, so whenever it adds supports the study says
  so (caveat `supportsInferred`, count in `supportsInferred`: supports of the finest mesh at
  nodes the model as drawn does not have). Springs are not copied (caveat
  `springsNotDistributed`). Pressures,
  temperatures and self-weight go to every child, edge loads to the children on that edge, nodal
  loads stay on their node. Models with constraints, connectors or curved beams are refused.
  No p-refinement is offered (MITC4 → MITC9 would be one; not implemented).
* **Governing quantities**: the largest nodal translation; the largest principal shell moment
  and shell surface von Mises stress at element centres (DKT, MITC4, MITC9) or, for curved
  shells and solid-shells, whose centre values are mid-surface only, at their integration points
  from the through-thickness pairs; the resultant reaction of each group of
  connected supported nodes (nodal reactions along a line support depend on the mesh, their sum
  does not); the largest moment anywhere along any member, from its exact diagram (a member
  split by the refinement reads the same, so an exact beam shows no change). A last step below
  10⁻⁶ of the value counts as converged at the finest mesh, whatever the first step did
  (round-off after convergence is not an oscillation).
* **Richardson.** For q0 (model), q1, q2: observed order `p = log₂((q1 − q0)/(q2 − q1))`,
  `q∞ = q2 + (q2 − q1)/(2ᵖ − 1)`, estimated error of the model `|q0 − q∞|/|q∞|`. Status
  `oscillating` (non-monotone, no extrapolation), `notConverging` (differences growing: a
  singularity, the value depends on the mesh), `irregularOrder` (p outside [0.5, 6]; its error is
  never reported below the largest change seen), `incomplete` (missing on a refined mesh). These
  four are inconclusive: the study is flagged whatever their numbers, and the change reported is
  the largest between consecutive meshes, relative to the finest (so [1, 1.01, 0.5] reads 100 %,
  not 1 %); with a
  single refinement (size limit, 250 000 DOFs by default) the order is assumed to be 1.

## Validation

`engine/tests/discretization_error.rs`. Effectivity index θ = η / ‖u − uh‖E, with the true error
from the energy identity ‖u − uh‖²E = ‖u‖²E − ‖uh‖²E (‖uh‖²E = Σ uₑᵀKₑuₑ with each family's own
stiffness) and ‖u‖²E from the Navier series or the Richardson limit of the refinement sequence.

**Effectivity index θ = η / ‖σ − σh‖**, simply supported square plate (side 1, t = 0.01,
ν = 0.3, uniform load), true error against the exact Kirchhoff moments (Navier series) over the
same points and components:

| Element | n = 4 | n = 8 | n = 16 |
|---|---|---|---|
| MITC4 | 1.12 | 1.05 | 1.01 |
| Curved shell | 1.12 | 1.05 | 1.01 |
| DKT | 1.48 | 1.28 | 1.10 |
| MITC9 | 0.97 | 0.82 | 0.42* |
| SHB8 solid-shell | 1.34 | 1.23 | 1.12** |

\* MITC9 converges to the Reissner–Mindlin solution, whose soft simple support has a
twisting-moment boundary layer the Kirchhoff moments lack; on fine meshes the "true error" is that
model difference, which a mesh-error estimator rightly does not report.
\*\* With the locking fix of #401 (ANS + condensed EAS, which the samples read) the
solid-shell converges to Kirchhoff on this thin plate (centre deflection 0.972, 0.995, 1.000) and,
like DKT, its estimate over-states the error on the coarse meshes. Before #401 it was ≈ 18 % too
stiff under refinement (Poisson thickness locking), a model error no recovery-based estimate can
see.

Scordelis–Lo roof (curved shell, 4 × 4 refined three times, true error from the energy
identity against the Richardson limit): θ = 1.01, 0.98, 0.93, 0.87. MITC9 on the 4 × 4 mesh:
θ = 0.99. (For flat MITC4 facets on a curved roof the energy identity does not hold between
meshes — each mesh is a different polyhedron — so θ is not measured there.)

**Richardson extrapolation** from a coarse model refined three times (smooth geometry),
extrapolated from the last three meshes:

| Benchmark | Element | Coarse | Meshes | Extrapolated | Reference |
|---|---|---|---|---|---|
| Scordelis–Lo, free-edge uz | MITC4 | 4 × 4 | 0.3162, 0.3043, 0.3024, 0.3022 | 0.3022 (p = 3.3) | 0.3024 |
| | curved shell | 4 × 4 | 0.2641, 0.2899, 0.2981, 0.3005 | 0.3015 (p = 1.8) | 0.3024 |
| | MITC9 | 4 × 4 | 0.3049, 0.3022, 0.3038, 0.3055 | not converging*** | 0.3024 |
| Pinched cylinder, radial u | MITC4 | 8 × 8 | 1.376, 1.702, 1.807, 1.839 (×10⁻⁵) | 1.853e-5 (p = 1.7) | 1.8248e-5 |
| | curved shell | 8 × 8 | 1.451, 1.728, 1.813, 1.839 (×10⁻⁵) | 1.851e-5 (p = 1.7) | 1.8248e-5 |
| Hemisphere (18° hole), ux | MITC4 | 8 × 8 | 0.0929, 0.0929, 0.0932, 0.0934 | 0.0935 | 0.093 (0.0924–0.094) |
| | curved shell | 8 × 8 | 0.0902, 0.0924, 0.0930, 0.0933 | 0.0935 | 0.093 |
| Morley 30° skew plate, w_c | DKT | 4 × 4 | 1.809, 1.225, 1.074, 1.027 | 1.006 (p = 1.7) | 1 (Kirchhoff) |
| | MITC4 | 4 × 4 | 0.877, 0.841, 0.841, 0.886 | oscillating: no extrapolation | 1 |
| SS square plate, w_c | MITC4 / DKT / MITC9 | 4 × 4 | | 1.006 / 1.001 / not converging† | 1 (0.00406 qa⁴/D) |
| Clamped square plate, w_c | MITC4 / DKT / MITC9 | 4 × 4 | | 1.006 / 1.004 / 1.006 | 1 (0.00126 qa⁴/D) |

Plate values are ratios to the Kirchhoff reference; the Reissner–Mindlin elements converge to the
Mindlin solution, ≈ 0.6 % above it for t/a = 0.01. The pinched cylinder's point load is a
singularity of Reissner–Mindlin theory (the displacement under it grows logarithmically), so its
extrapolation overshoots slightly. Starting the curved benchmarks from 4 × 4 (22.5° per element)
leaves a geometry error the smooth reconstruction cannot remove (the cylinder extrapolates to
1.94e-5): the reconstruction approximates the surface from the coarse nodes, it does not know it.

\*\*\* MITC9 on Scordelis–Lo drifts up by ≈ 0.5 % per refinement from this mesh; the check says
"not converging" instead of extrapolating, which is the point of having it.
† MITC9 on the simply supported square dips and then rises (1.0037, 1.0030, 1.0045, 1.0068):
not in the asymptotic range on these meshes, so no extrapolation; the finest mesh is 1.007.

The tests assert the status of every sequence above: an extrapolation is checked only where the
sequence is `converging`, never the finest value standing in for one.


## References

* O. C. Zienkiewicz, J. Z. Zhu, "The superconvergent patch recovery and a posteriori error
  estimates", Int. J. Numer. Meth. Eng. 33 (1992) 1331–1382.
* M. Ainsworth, J. T. Oden, *A Posteriori Error Estimation in Finite Element Analysis*, Wiley
  2000.
* R. H. MacNeal, R. L. Harder, "A proposed standard set of problems to test finite element
  accuracy", Finite Elem. Anal. Des. 1 (1985) 3–20.
* L. S. D. Morley, *Skew Plates and Structures*, Pergamon 1963.
* S. Timoshenko, S. Woinowsky-Krieger, *Theory of Plates and Shells*, McGraw-Hill 1959.
