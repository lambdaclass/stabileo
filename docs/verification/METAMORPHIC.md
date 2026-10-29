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
cargo test --release --test metamorphic -- --ignored          # nightly tier (exhaustive)
METAMORPHIC_SEED=123 METAMORPHIC_ONLY="P-Delta" cargo test --release --test metamorphic -- --ignored --nocapture
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
(`verify.yml` → `metamorphic-nightly`) runs every model, 200 fuzz models and a
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
| plastic collapse | R | R | R | R | R | R | · | · | R | · | · |
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
