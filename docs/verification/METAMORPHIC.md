# Metamorphic testing: physics invariants on every analysis

Roadmap item 5 of the trust and verification backlog
([PRODUCT_ROADMAP.md](../roadmap/PRODUCT_ROADMAP.md)). A metamorphic test needs
no reference solution: it solves a model, transforms the model, solves it again,
and checks that the two answers are related exactly as physics says. A rotated
building must deflect as the rotated deflection of the original; renumbering its
nodes must change nothing; the same structure in millimetres must give the same
stresses; a linear analysis must superpose. Each relation is checked on every
analysis the engine has and on the whole model corpus.

```sh
cd engine
cargo test --release --test metamorphic                       # PR tier (sampled)
cargo test --release --test metamorphic metamorphic_nightly_ -- --ignored # nightly tier (exhaustive)
METAMORPHIC_SEED=123 METAMORPHIC_ONLY="P-Delta" cargo test --release --test metamorphic metamorphic_nightly_ -- --ignored --nocapture
UPDATE_METAMORPHIC_DOC=1 cargo test --release --test metamorphic metamorphic_pr   # refresh the matrices below
```

## Pieces

* `engine/src/metamorphic/` — the reusable part, usable from any harness (fuzz
  targets, the differential tools):
  * `transform.rs` — rigid motions. 2D: any rotation in the X–Z plane or mirror,
    plus translation. 3D: any proper rotation (uniform random, or one of the 24
    axis permutations) plus translation. Everything defined against global axes
    moves with the geometry: nodal forces and moments, support restraint sets,
    spring tensors, inclined-support normals and settlements, member local-axis
    reference vectors (each member's actual axes are computed with the engine's
    convention — default reference, explicit reference, roll, `leftHand` — and
    written back rotated, then re-derived and checked), constraint DOF sets, MPC
    coefficients, diaphragm planes, eccentric offsets, zero-length connectors,
    shell normals and self-weight accelerations. A feature the input format can
    only state in global axes and that the motion does not map back onto the axes
    (a support restraining X and Y but not Z, rotated 30°) is reported as
    *unrepresentable*, never approximated. `map_results_2d/3d` give the results a
    correct solver must return.
  * `relabel.rs` — node / member / support / material / section / connector /
    shell ids replaced through a random bijection onto sparse ids, every map
    rebuilt in a new order, the load list permuted.
  * `reversal.rs` — member orientation reversal (node_i ↔ node_j with releases,
    member loads and, in 3D, explicit axes carried along) and the end-force maps.
  * `units.rs` — consistent unit scaling: lengths × λ, forces × φ, time × τ, every
    dimensioned input scaled by its dimension (E and f_y × φ/λ², I × λ⁴,
    C_w × λ⁶, springs, densities × φτ²/λ⁴, accelerations × λ/τ², …). Gravity is a
    constant inside the engine, so τ = √λ (Froude similitude).
  * `compare.rs` — results flattened into translation / rotation / force / moment /
    stress / scalar families and compared family by family (see Tolerances).
  * `conditioning.rs` — the tolerance.
* `engine/tests/metamorphic/` — the harness: `case.rs` (a model plus every
  dimensioned analysis parameter, transformed together), `ana2.rs` / `ana3.rs`
  (every analysis reduced to a response whose quantities know how they
  transform), `checks2.rs` / `checks3.rs` (the invariants), `symmetry.rs`,
  `modal_checks.rs`, `corpus.rs`, `regressions.rs` (one minimal test per bug
  found).

## Invariants

| Invariant | Relation checked |
|---|---|
| rotation | 2D: random in-plane rotation + translation. 3D: random rotation (60%) or axis permutation, + translation. Translations, rotations, reactions rotate; member end forces, shell stresses, frequencies, load factors are unchanged. Analyses with a built-in global direction (gravity of moving loads, influence lines, cables; a spectrum's axis) use rotations that keep it (about Z, axis permutations). When a general rotation turns a roller into an inclined support that an analysis refuses by name, a quarter turn is used instead. |
| mirror | 2D: reflection about a random line (about a vertical line for gravity-bound analyses). In-plane moments, rotations and member shear / moment change sign. |
| relabel | Renumbering and reordering of every entity and of the load list: identical results under the id map. |
| reversal | Half the members reversed: displacements and reactions unchanged; end forces map as in `reversal.rs`. |
| units | (λ, φ) ∈ {(10⁻³, 10³), (25, 10⁻²), (0.3048, 4.448)} with τ = √λ: every result scales by its dimension. |
| superposition | Linear analyses: R(A+B) − R(∅) = (R(A) − R(∅)) + (R(B) − R(∅)) and R(kA) − R(∅) = k·(R(A) − R(∅)) (R(∅) carries settlements). Load-factor analyses (buckling, plastic collapse): all actions × k ⇒ factor / k. |
| reciprocity | Maxwell–Betti: δ_ab·d_b under a unit force at a along d_a equals δ_ba·d_a under a unit force at b along d_b, random nodes and directions; for harmonic analysis at every frequency (real and imaginary parts), for time history at every sampled time. |
| energy | Clapeyron under random nodal forces and moments: Σ P·u = Σ_e f_e·u_e (member end forces in member axes) + Σ springs uᵀKu — the external work equals twice the strain energy recovered from the reported member forces. |
| symmetry | Symmetric models built from any model (2D: mirrored about a vertical line through its right-most node and joined there; 3D: C2 rotation about a vertical axis through a node), symmetric and antisymmetric (linear analyses) loads and settlements: the response equals its own image (or minus it), nodes and members exchanged pairwise. |
| linear agreement | Every analysis that reduces to the linear solve on the model given (dense / sparse / PCG paths, constrained, certified, one combination of two cases, one or two stages with the full structure, Winkler without foundation, contact without gaps, SSI without soil springs, creep at t₀) reproduces the linear solution. |
| modal orthogonality | Mode shapes are M-orthogonal; each mode's effective mass recomputed from the assembled M matches the reported one; Σ effective mass ≤ free mass, and = when every mode is computed. |

Every analysis is run on every model; a model an analysis refuses (by name, or
because it is a mechanism) is recorded as *refused* for that analysis, not
skipped silently. If the original model solves and its transformed copy does
not, that is a violation unless the refusal names a feature the transform
introduced (an inclined support).

## Tolerances

Not hand-tuned. Two solves of the same physical model differ by the round-off
each legitimately carries:

* Direct linear solve: `rel = 4·(n + 24)·ε·κ·geom`, where κ is the condition
  number of the Jacobi-scaled free stiffness `D^{-1/2}·K·D^{-1/2}` (constraints
  reduced first; Gershgorin bound on λ_max, inverse iteration on the Cholesky
  factor for λ_min). Cholesky is backward stable with a componentwise backward
  error invariant under diagonal scaling (van der Sluis), so units of the DOFs
  do not enter; n + 24 collects Higham's γ_{n+1} for the factorization and
  γ_{m_e} for the member-force recovery (m_e ≤ 24); the factor 4 covers the
  one-time rounding of the transformed inputs; `geom = 1 + max|x| / min L`
  bounds the relative change of member geometry from rounding rotated or
  translated coordinates. Forces carry the same relative error of the force
  scale (‖K·δu‖ = ‖δK·u‖).
* Iterative analyses add 20·τ, τ their convergence tolerance (two converged
  iterates of a contraction with ratio ≤ 0.9 are each within 10·τ of the fixed
  point): Lanczos τ = 10⁻¹⁰ (modal, buckling, spectral, harmonic), the
  nonlinear solvers' own tolerance, the plastic event resolution 10⁻⁶ / 20.
  Time histories multiply by the step count (per-step errors accumulate without
  amplification in the unconditionally stable Newmark scheme).
* Comparisons are per physical family against the family's magnitude, floored
  by the dimensional sibling through the model size and by the applied load
  (a member force that is zero in exact arithmetic is compared at the round-off
  of the loads that pass through the structure), and for quantities that can all
  vanish by their natural size (effective-mass tensors by the total mass,
  spectral displacements by the first mode's spectral displacement, moving-load
  envelopes by the axle weight).
* A comparison whose derived tolerance exceeds 10⁻³ cannot discriminate a bug
  from round-off; it is reported as *inconclusive*, never passed.

## Corpus and tiers

* Example models and fixtures (`engine/tests/fixtures`, the app's examples
  exported, the analytical fixtures, random 2D/3D models).
* The feature-matrix models (`engine/tests/metamorphic_corpus/feature_matrix`,
  written by `feature_matrix.rs::feature_models_exported`, which fails when they
  drift from the builders).
* The differential generators' models (`engine/tests/metamorphic_corpus/differential`,
  `tools/differential/export_corpus.py`: frame2d, rich3d, frame3d, building,
  modal3d, pdelta3d; the nightly job checks they are current).
* The fuzz generators (`engine/tests/fuzz_models`: `random_2d_model_rich`,
  `random_3d_model_rich`, with random constraints on every third model).
* Symmetric and antisymmetric models built from all of the above.

The PR tier (`metamorphic_pr_2d`, `metamorphic_pr_3d`, run by ci.yml's suite,
≈ 3 min) uses every example and analytical fixture, four random fixtures, one in
seven corpus models and ten fuzz models, with a fixed seed. The nightly tier
(`nightly.yml` → `metamorphic-nightly`) runs every model, 200 fuzz models and a
seed that moves daily (printed; reproduce with `METAMORPHIC_SEED`), and uploads
the per-cell report.

## Matrix (PR tier)

✓ held on every model it ran on · ✗ violated · R refused by the analysis on
every model it was given · U never representable · ~ inconclusive (tolerance
above 10⁻³) · · not applicable. The matrices are regenerated by the PR tests
and the tests fail when this file is out of date.

### 2D

<!-- BEGIN pr_2d -->
| Analysis | rotation | mirror | relabel | reversal | units | superposition | reciprocity | energy | symmetry | linear agreement | modal orthogonality |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| linear | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · |
| linear (dense reference) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| linear (sparse path) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| linear (PCG) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| constrained | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| certified linear | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| load combinations | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| staged (one stage) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| staged (loads in two stages) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | ✓ | · |
| Winkler (no foundation) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| contact (no gaps) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | ✓ | · |
| SSI (no soil springs) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | ✓ | · |
| creep & shrinkage (t = t0) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | ✓ | · |
| P-Delta | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | ✓ | · | · |
| corotational | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | ✓ | · | · |
| material nonlinear | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | ✓ | · | · |
| fiber nonlinear | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | ✓ | · | · |
| cable solver | · | ✓ | ✓ | ✓ | ✓ | · | · | · | ✓ | · | · |
| modal | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | ✓ | · | ✓ |
| certified modal | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | ✓ | · | · |
| buckling | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | ✓ | · | · |
| time history | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | · | · |
| spectral | · | ✓ | ✓ | ✓ | ✓ | · | · | · | ✓ | · | · |
| harmonic | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | · | · |
| plastic collapse | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | ✓ | · | · |
| kinematic check | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | ✓ | · | · |
| moving loads | · | ✓ | ✓ | ✓ | ✓ | · | · | · | R | · | · |
| influence line | · | ✓ | ✓ | ✓ | ✓ | · | · | · | R | · | · |
<!-- END pr_2d -->

### 3D

<!-- BEGIN pr_3d -->
| Analysis | rotation | relabel | reversal | units | superposition | reciprocity | energy | symmetry | linear agreement | modal orthogonality |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| linear | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · |
| linear (sparse path) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| linear (PCG) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| constrained | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| certified linear | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| load combinations | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| staged (one stage) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| staged (loads in two stages) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | ✓ | · |
| Winkler (no foundation) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| contact (no gaps) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | ✓ | · |
| SSI (no soil springs) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | ✓ | · |
| creep & shrinkage (t = t0) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | ✓ | · |
| P-Delta | ✓ | ✓ | ✓ | ✓ | · | · | · | ✓ | · | · |
| corotational | ✓ | ✓ | ✓ | ✓ | · | · | · | ✓ | · | · |
| material nonlinear | ✓ | ✓ | ✓ | ✓ | · | · | · | ✓ | · | · |
| fiber nonlinear | ✓ | ✓ | ✓ | ✓ | · | · | · | ✓ | · | · |
| cable solver | ✓ | ✓ | ✓ | ✓ | · | · | · | ✓ | · | · |
| modal | ✓ | ✓ | ✓ | ✓ | · | · | · | ✓ | · | ✓ |
| certified modal | ✓ | ✓ | ✓ | ✓ | · | · | · | ✓ | · | · |
| buckling | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | ✓ | · | · |
| time history | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | · | · |
| time history (ground motion) | ✓ | ✓ | ✓ | ✓ | · | · | · | ✓ | · | · |
| spectral | ✓ | ✓ | ✓ | ✓ | · | · | · | ✓ | · | · |
| harmonic | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | · | · |
| plastic collapse | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | ✓ | · | · |
| kinematic check | ✓ | ✓ | ✓ | ✓ | · | · | · | ✓ | · | · |
| moving loads | ✓ | ✓ | ✓ | ✓ | · | · | · | R | · | · |
| influence line | ✓ | ✓ | ✓ | ✓ | · | · | · | R | · | · |
<!-- END pr_3d -->

## Violations found and fixed

Each has a minimal reproduction in `engine/tests/metamorphic/regressions.rs` (or an existing engine test that now asserts the corrected behaviour).

| Found by | Bug | Effect | Fix |
|---|---|---|---|
| energy | The 2D constrained path accepted a nodal moment on a rotation nothing stiffens (every member hinged there) and returned a rotation of ~10⁵ rad held by the artificial stiffness; the plain path refused it only through a "local mechanism" size heuristic. | Silently wrong rotations. | `refuse_moments_without_rotation_2d` in the 2D load validation, on every path (as 3D already did). |
| relabel, units | `prepare_static_2d_dense_reference` (and any direct caller of the prepared path) solved a constrained model without its constraints. | A mechanism "solved" with displacements of 10⁸ m. | The prepared static solve refuses constraints in 2D and 3D. |
| rotation, mirror | Winkler and material-nonlinear analyses built their own prescribed-displacement vectors and assigned a rotated roller's global `dz` to the inclined support's normal DOF. | Wrong settlement response on inclined supports (30% off in the fixture). | Both use the linear solver's `prescribed_displacements_2d/3d`. |
| units | Influence lines kept the model's support settlements, so every ordinate carried the settlement's own effect. | Influence ordinates offset by a load-independent amount. | Settlements stripped from the influence model (2D and 3D). |
| mirror, reversal | Moving loads: on a near-horizontal deck member drawn right-to-left the axle was applied as −W·\|cos θ\| in member axes — upwards; and positions were measured from node_i whatever the direction of travel. | Moment envelope of the wrong sign on reversed members; axles at the wrong place on multi-axle trains. | Weight decomposed as −W·cos θ (transverse), −W·sin θ (axial) for any orientation; direction of travel from path connectivity (`PathSegment::reversed`, 2D and 3D). |
| rotation (quarter turn) | Kinematic analysis, assembly, sparse assembly and plastic collapse ignored the `rollerZ` / `guidedZ` aliases of `rollerY` / `guidedY` when counting restraints or rotationally restrained nodes. | Wrong degree of indeterminacy (by 1 or 2 per support); hinge logic at guided supports. | Aliases added everywhere they are matched. |
| reversal, symmetry | 2D co-rotational element: the chord rotation was the difference of two `atan2` angles; for a member along −X it jumped by 2π across the branch cut. | Non-convergence or a wrong deformed state for any member drawn right-to-left (a mirrored cantilever moved 4 m instead of 1.5 mm). | Chord rotation `atan2(d₀ × dₙ, d₀ · dₙ)`. |
| rotation (translation) | Co-rotational elements (2D and 3D) took the current chord as a difference of absolute deformed positions; x + u rounds u to ulp(x). | A building 400 m from the origin never converged (residual floor above the tolerance); survey coordinates would not. | Current chord = initial chord + relative displacement. |
| rotation, mirror, units, superposition | Plastic collapse: sections reaching M_p within the event search's own resolution (golden-section ~10⁻⁹) formed in separate events, so in a symmetric portal the second column hinge never formed. | Collapse factor 245.8 instead of 213.9 (15% unsafe) with an inadmissible moment field, flagged only by a warning. | Event tie at the search resolution (10⁻⁶, matching the position snap), 2D and 3D. |
| superposition, rotation | Plastic collapse with only thermal loads or settlements scaled them with λ, and it kept going when the loads were carried without bending (a three-hinge arch). | Collapse factors of ~10¹⁶ reported as mechanisms, no warning. | A model with no mechanical load is refused (imposed deformations alone have no collapse factor); a unit moment below 10⁻⁹ of load × size is not bending; a run that stops without a mechanism is an error, not a factor. |
| relabel, rotation, units | Spectral analysis: member forces were enveloped per mode (\|·\| of the larger end) before the modal combination, base shear was always SRSS whatever the rule, and member ids were paired with forces by HashMap iteration order. | CQC results that depended on the arbitrary basis of repeated modes (grid slab base shear 4.11 vs 4.87 under renumbering); correlated modes never cancelled. | Signed end values combined by the rule, then enveloped; base shear by the same rule; ids from the force records. |
| energy, reversal | Staged 3D recovered member forces as raw K_e·u_e: N at the start and every end value had the opposite sign to every other analysis, member loads were missing from the end forces, reactions were summed from those forces (missing loads at supports, springs, fixed-end forces), and quad stresses were never reported. | Wrong member forces and reactions in every 3D staged result. | Results by the linear recovery: `compute_internal_forces_3d_with_loads` with the cumulative loads, reactions (K·u − F)_r, plate and quad stresses. |
| linear agreement | Staged analysis (2D and 3D) re-applied the full prescribed displacements in every stage. | A settlement counted once per stage. | Only the change since the previous stage drives a stage. |
| linear agreement | Load combinations: every case's solution carries the model's settlements, and Σ f_c·R_c counted them Σ f_c times. | 1.0·A + 1.0·B gave twice the settlement; 1.2D + 1.6L, 2.8 times. | The settlement-only solution enters each combination with 1 − Σ f_c (2D and 3D, prepared and constrained paths). |
| rotation | Shell mass (MITC4, MITC9, curved shell) put the rotary inertia on global r_x, r_y whatever the shell's orientation. | A wall's frequencies differed from the same shell lying flat (0.2% on the strip, more for thick shells). | Inertia about the shell's in-plane axes, m_rot·(I − n·nᵀ) on the global rotation DOFs. |
| units | Orphan-rotation detection (dense and sparse 2D and 3D assembly) and the kinematic rank compared rotational stiffness with the largest diagonal entry, a translational stiffness of other units (plus an absolute floor in the kinematic check). | A model in millimetres with one stiff member had a real beam-end rotation locked by the artificial spring (rotation 3·10⁻⁴ → 8·10⁻⁸ rad); mechanism counts depended on the units. | Orphans judged against the largest rotational diagonal (a zero diagonal of the PSD K is a zero row); rank of the Jacobi-scaled matrix, sparse pivots against their own diagonal. |
| rotation | Modal harmonic analysis kept exactly the part of a repeated eigenvalue the eigensolver happened to return at the top of its computed set and corrected the rest statically. | The response changed with a rotation of the model. | The top cluster of the computed set goes to the static correction in full. |
| units (via the feature matrix) | The 2D assemblers put an artificial rotational spring (10⁻¹⁰ × the largest, translational, diagonal) on every all-hinged node, including nodes whose rotation a constraint ties to the structure, where it becomes a real spring. | A rigid-link mechanism was held by it; whether the model counted as a mechanism depended on the units. | Constraint-tied rotations get no artificial spring (as in 3D). |
| full-suite review | An unknown 2D support type ("pin", "roller") restrained nothing. | A misspelt support silently disappeared (three engine tests relied on it). | Unknown types are refused by name. |
| harness review | `StagedInput3D` had no `leftHand` field; the app sends it and serde dropped it. | Left-handed models staged with right-handed member axes. | Field added and passed to every stage. |

## Documented exceptions

* **SRSS with repeated frequencies.** SRSS of the modal responses depends on the
  basis chosen inside a degenerate eigenspace, so it is not invariant under
  renumbering or rotation of a model with repeated modes. This is a property of
  the rule (design codes require CQC for closely spaced modes); the harness uses
  CQC.
* **Connectors with unequal transverse stiffnesses.** The format gives
  connectors no local axis: the transverse axes follow a global reference rule,
  so a rotated anisotropic connector cannot be expressed. Reported as
  unrepresentable; isotropic and zero-length connectors are checked.
* **Analyses with a built-in global direction** (moving loads and influence
  lines load in −Z, cables hang under −Z gravity, a response spectrum acts
  along a named axis): only rotations that keep that direction apply.
* **Energy** is checked for frame/truss models; shells, connectors and warping
  report no element energy to compare with.
* **Staged analysis refuses inclined supports**, so general rotations of models
  with rollers fall back to quarter turns.
* **Moving-load envelopes are taken at member ends**: a long undivided deck
  member's span moment under an axle is not in the envelope. This is a
  discretisation property, not a metamorphic violation; deck members should be
  subdivided.

## Deterministic safety sweep (2026-10-29)

`generated::generated_fast` adds 128 seeds in each dimension (256 small models)
to the required `metamorphic` target. SplitMix64 varies span, area, bending
inertia and modulus. Each model exercises every existing analysis adapter,
plus active distributed Winkler springs and a closed contact gap. Separate
16-seed tests exercise actual taut cable elements in 2D V cables and 3D
tripods. Reversal choices now consume randomness in sorted member-ID order;
the generated sweep always reverses at least one member. The spectral
absolute-envelope and influence-coordinate reversal maps are checked too,
rather than reporting these transformations as unrepresentable.

`METAMORPHIC_SEED` defaults to 20261018. A failed generated case prints its
seed and full input JSON; with `METAMORPHIC_REPORT_DIR` it also writes those
inputs and both matrices. The generated tests fail on refused baseline solves,
lost coverage, unrepresentable comparisons or inconclusive tolerances.
Generated response validation checks absolute references for modal, certified-modal,
harmonic and influence-line adapters. Influence-line
endpoints are compared with separate nodal unit-load static solves, including
an independently nonzero ordinate. Zero-frequency harmonic real displacement
must match the static probe displacement, and its imaginary part must vanish;
legitimate zero-load responses remain valid. Modal responses require positive
mass and positive ordered frequencies. A separate direct modal solve supplies
expected entries and values, including effective-mass boundaries, for both
modal adapters; this is an adapter check, not an independent eigensolver.
These reference comparisons use relative tolerance 1e-10. Regression tests
zero those four adapters, remove modal effective-mass entries, and corrupt the
zero-frequency imaginary response.

The active-foundation fixture additionally checks axial displacements against
bar equilibrium and compatibility: its transverse bed cannot carry axial load.
The loaded cable fixtures require positive member tension and support forces
balancing the applied 100-unit load in every translational direction. Both
fixture checks reject correctly shaped zero-valued responses.

Shape and metamorphic checks alone do not establish physical correctness.
In particular, primary linear, buckling, time-history, spectral, moving-load
and plastic-collapse rows do not each have an independent absolute oracle;
a consistently zero-valued adapter can satisfy homogeneous invariants.
A matrix checkmark denotes the stated relation and coverage, not independent
validation of every response value or protection against every zero mutation.

The broad legacy corpus retains its conditioning-based tolerances and explicit
feature limitations; its passing cells are not a promise that every possible
model is supported.

### Tolerances and physical scope

The new direct-linear, staged, Winkler, harmonic and time-history checks use
2.5e-10 for a two-solve comparison. The existing four-solve superposition and
reciprocity checks multiply this by four, giving a maximum relative tolerance
of **1e-9**. Comparisons retain dimensional family norms, including a
load-scaled floor for exactly zero force components. Time history checks every
stored step in the generated sweep, including the initial state. A separate
dynamic test uses independent length, force and time factors (0.2, 3, 7), so
mass scales by F T²/L; it does not depend on Froude scaling.

Iterative comparisons retain the documented conditioning contribution plus
20 times the adapter's iteration tolerance: P-Delta and modal/spectral use
2e-9; co-rotational, material nonlinear, fiber and cable use 2e-8; active
contact uses 2e-9; plastic collapse uses 1e-6 (event resolution). These are
comparison bounds, not changes to solver convergence settings. Generated modal
orthogonality uses 1e-8 (100 eigensolver residual tolerances), including repeated
or nearly repeated eigenvalues; duplicate modes are not exempted.

3D reflection uses central inversion. Forces and translations are polar
vectors; moments and rotations are axial vectors. Local axes are rebuilt and
local end-force signs mapped accordingly. Arbitrary proper rotations are
covered separately. Gravity-bound analyses retain their existing admissible
rotations: about Z in 3D, vertical-plane reflection in 2D. A response spectrum
uses axis permutations. Active contact currently covers units, relabeling and
member reversal; its named-axis gap direction is not a general rotated normal.
The ordinary contact adapter additionally covers its no-gap linear limit.
Fiber cases exercise the elastic constitutive limit; material-nonlinear cases
check invariance and mandatory #428 containment warnings, not the physical
accuracy of the whole-member secant approximation. Staged cases cover load
application over one and two stages, not element birth/removal histories.

### Known issues and findings

**New engine findings: none established by these runs.** Open issues were
checked against the repository's GitHub issue list, not just the local registry.
The initial co-rotational finding is already tracked by
[#761](https://github.com/lambdaclass/stabileo/issues/761).

| Reproduction | Disposition |
|---|---|
| Plastic rigid-link and selected rich-fuzz cases | `#[ignore = "safety #758"]` |
| Warping cantilever modal orthogonality | `#[ignore = "safety #759"]` |
| Rich 2D seed 20843 time-history reciprocity | `#[ignore = "safety #760"]` |
| Generated co-rotational rotations/reflections and one-member reproducer | `#[ignore = "safety #761"]` |
| Rich 2D seed 20800 near-mechanism units/orientation | `#[ignore = "safety #762"]` |
| Material nonlinear, every successful transformed solve | Require `KnownIssue`, phase `NL-5`, issue value 428 |

The #761 reduction has two nodes, one fixed-end frame member, length
1.537973864398564, E=193869.99887466928, ν=0.3, A=0.01734359913961188,
Iz=0.00024294395037462315. The tip load is Fx=-0.1, Fz=-0.15, My=0.03.
In 3D add Iy=0.63 Iz, J=0.4 Iz, Fy=0.07, Mx=0.01, Mz=0.04.
With 100 iterations, tolerance 1e-10 and four increments, the unrotated
member converges. A 2D rotation of 0.7 radians or 3D Euler angles
(0.3, 0.7, 1.1) makes it fail convergence, even at the origin.
`generated::corotational_rigid_motion_reproducer` constructs this reduction.
It asserts convergence of both configurations and remains ignored by issue,
not converted to a passing assertion of incorrect behavior.

### CI and local execution

No new Cargo target or dependency is required. `make test.engine.metamorphic`
already runs this target in the required `test-engine-metamorphic` job, which
feeds `CI OK`. The existing `metamorphic-nightly` job now selects
`metamorphic_nightly_` explicitly and uses `--locked`, keeping diagnostic probes
and issue-specific ignored reproductions out of the scheduled selection.
It includes `metamorphic_nightly_generated` (4096 seeds per dimension), uploads
its reports and failed-input JSON, and inherits the existing
`verification-alert.yml` failure-to-issue workflow. The legacy full-corpus
nightly tests still run; their known safety findings are not claimed fixed.

```sh
cd engine
nix develop .. -c cargo test --locked --release --test metamorphic
nix develop .. -c cargo test --locked --release --test metamorphic metamorphic_nightly_generated -- --ignored --nocapture
nix develop .. -c cargo test --locked --release --test metamorphic safety_cases -- --ignored --nocapture
nix develop .. -c cargo test --locked --release --test metamorphic corotational_rigid_motion_reproducer -- --ignored --nocapture
```

The explicit safety reproduction commands are expected to fail while their
issues remain open. They are deliberately separate from the required run.
The targeted checks reproduced #758, #759, #760 and #762; the minimal
co-rotational check reproduced #761.

### Verification evidence

Reproducible base/head comparison and known corpus failures are recorded in
[the verification evidence](metamorphic-review-813.txt). The broad nightly
corpus is not green; generated coverage must not be presented as a passing
result for the complete nightly selection.

### Generated matrix

Snapshot: seed 20261018, 128 seeds per dimension. ✓ = pass on every exercised
case; `ignored(#761)` = the separately executable issue-linked test; · = not
applicable or outside the stated adapter scope. There were no refused,
unrepresentable or inconclusive generated comparisons. Active cable coverage
is in the separate test described above. These small-model passes do not remove
the adverse-model exclusions #758, #759, #760 and #762.

#### 2D

| Analysis | rotation | mirror | relabel | reversal | units | superposition | reciprocity | energy | symmetry | linear agreement | modal orthogonality |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| linear | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · |
| linear (dense reference) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | · |
| linear (sparse path) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | · |
| linear (PCG) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | · |
| constrained | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | · |
| certified linear | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | · |
| load combinations | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | · |
| staged (one stage) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | · |
| staged (loads in two stages) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | ✓ | · |
| Winkler (no foundation) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | · |
| contact (no gaps) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | ✓ | · |
| SSI (no soil springs) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | ✓ | · |
| creep & shrinkage (t = t0) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | ✓ | · |
| P-Delta | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | · |
| corotational | ignored(#761) | ignored(#761) | ✓ | ✓ | ✓ | · | · | · | · | · | · |
| material nonlinear | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | · |
| fiber nonlinear | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | · |
| cable solver | · | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | · |
| modal | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | ✓ |
| certified modal | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | · |
| buckling | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · |
| time history | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | · |
| spectral | · | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | · |
| harmonic | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | · |
| plastic collapse | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · |
| kinematic check | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | · |
| moving loads | · | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | · |
| influence line | · | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | · |
| Winkler (active) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | · |
| contact (active gap) | · | · | ✓ | ✓ | ✓ | · | · | · | · | · | · |

#### 3D

| Analysis | rotation | relabel | reversal | units | superposition | reciprocity | energy | symmetry | linear agreement | modal orthogonality | reflection |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| linear | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | ✓ |
| linear (sparse path) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| linear (PCG) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| constrained | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| certified linear | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| load combinations | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| staged (one stage) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| staged (loads in two stages) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | ✓ | · | ✓ |
| Winkler (no foundation) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| contact (no gaps) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | ✓ | · | ✓ |
| SSI (no soil springs) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | ✓ | · | ✓ |
| creep & shrinkage (t = t0) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | ✓ | · | ✓ |
| P-Delta | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | · | ✓ |
| corotational | ignored(#761) | ✓ | ✓ | ✓ | · | · | · | · | · | · | ✓ |
| material nonlinear | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | · | ✓ |
| fiber nonlinear | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | · | ✓ |
| cable solver | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | · | · |
| modal | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | ✓ | ✓ |
| certified modal | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | · | ✓ |
| buckling | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | ✓ |
| time history | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | · | ✓ |
| time history (ground motion) | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | · | ✓ |
| spectral | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | · | ✓ |
| harmonic | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | · | ✓ |
| plastic collapse | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | ✓ |
| kinematic check | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | · | ✓ |
| moving loads | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | · | · |
| influence line | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · | · | · |
| Winkler (active) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | · | · | ✓ |
| contact (active gap) | · | ✓ | ✓ | ✓ | · | · | · | · | · | · | · |
