# Merge plan: the safety wave (#275–#302)

Branch `integration/safety-wave` (draft PR "Integration: safety wave (do not merge — merge plan
check)") merges every PR of the wave on top of `main` (988b3735) in the order below, one merge
commit per PR, plus small fix commits where two PRs were each right alone and wrong together.
Every conflict resolution is in the merge commit message; this document collects them so each
PR author can apply the same resolution when rebasing. rerere was on, so `git rerere` in a clone
that fetched this branch replays most of them.

Rule used everywhere: never drop a safety fix; where two branches fixed the same thing
differently, keep the stricter (refuse-when-unsure) behaviour and keep both branches' tests.

## 1. Recommended merge order

| # | PR | Branch | Base | Conflicts when merged in this order |
|---|----|--------|------|------|
| 1 | #275 | verify/certified-solver | main | none |
| 2 | #278 | fix/connectors | #275 | none |
| 3 | #279 | fix/sparse2d | #275 | assembly.rs (with #278), CHANGELOG |
| 4 | #287 | fix/inclined-supports | #279 | CHANGELOG |
| 5 | #280 | verify/ui-bounds | #275 | none |
| 6 | #281 | verify/symbolic | #275 | CHANGELOG |
| 7 | #282 | verify/lean-bundle | #275 | certify/mod.rs, solver-worker.ts |
| 8 | #283 | verify/opensees-ext | #275 | buckling.rs, geometric_stiffness.rs, mass_matrix.rs, time_integration.rs, CHANGELOG |
| 9 | #284 | verify/xpath | #275 | buckling.rs, certify/buckling.rs, geometric_stiffness.rs, assembly.rs, sparse_assembly.rs, CHANGELOG (+ fix commit) |
| 10 | #285 | verify/security-audit | #275 | none |
| 11 | #286 | verify/design-examples | #275 | CHANGELOG, docs/README |
| 12 | #293 | fix/design-unsafe | #286 | CHANGELOG |
| 13 | #295 | fix/design-unsafe-2 | #293 | CHANGELOG |
| 14 | #289 | fix/solidshell | #275 | CHANGELOG |
| 15 | #290 | verify/feature-matrix | #275 | buckling.rs, geometric_stiffness.rs, CHANGELOG, docs/README (+ 3 fix commits) |
| 16 | #297 | fix/nonlinear-solvers | #290 | connector.rs, arc_length.rs, assembly.rs, sparse_assembly.rs, contact.rs, fiber_nonlinear.rs, geometric_stiffness.rs, FEATURE_MATRIX.md, CHANGELOG (+ test fix) |
| 17 | #291 | verify/sections-connections | #275 | connection-design.ts, CHANGELOG, docs/README |
| 18 | #292 | verify/loads-cirsoc | #275 | 4 example baselines, CHANGELOG, docs/README |
| 19 | #294 | verify/diff-frames | #275 | linalg/jacobi.rs, linalg/lanczos.rs |
| 20 | #296 | verify/diff-codeaster | #275 | solver/definiteness.rs |
| 21 | #302 | fix/constraints-inclined-all | #296 | certify/buckling.rs, contact.rs, harmonic.rs, modal.rs, CHANGELOG (+ ignore removal) |
| 22 | #300 | verify/model-sanity | #275 | none |
| 23 | #299 | docs/roadmap-multipliers | main | none |
| 24 | #298 | verify/ts-engine-logic | main | .gitignore, cirsoc201_check.rs, tests/integration/cirsoc201_check.rs, web/package-lock.json |
| 25 | #301 | verify/certify-rc-design | #275 | certify/design.rs, cirsoc201_check.rs, rc_check.rs (+ test adaptations) |
| 26 | #288 | verify/fuzz-mutants (head 45a1a53b; still in progress) | #275 | .github/workflows/verify.yml, CHANGELOG |

Notes on the order:
- #279 → #287 and #286 → #293 → #295 and #290 → #297 and #296 → #302 are stacks: keep them in order.
- #283 and #284 should follow #287: both touch the buckling/mass/time-integration code that #287
  rotates into inclined-support frames, and both (plus #281/#290) re-implement the 2D Kg hinge
  condensation. Landing #287 first means #283/#284/#290 each drop their copy and keep the shared
  `condense_kg_plane`.
- #297 should follow #278 (both fix connector DOF scatter; #297 must be rebuilt on #278's element).
- #302 must follow #287 so its 14 ignored tests can be enabled in the same PR.
- #298 and #301 both rewrite `cirsoc201_check.rs`: land #298 first, then rebase #301 on the
  reconciled file (section 2.12).
- The singular-pivot threshold 1e-10 is identical in #294 and #296; it lands once, with #294.

## 2. Conflicts and how they were resolved

CHANGELOG.md (about 15 PRs) and docs/README.md (verification index, about 7 PRs): every
entry kept, ours first, then theirs.

### 2.1 #279 fix/sparse2d × #278 fix/connectors: `solver/assembly.rs`
#279 replaced the body of `assemble_sparse_2d_ex` with `sparse_assembly::assemble_stiffness_sparse_2d`
+ `assemble_load_vector_2d`; #278 had edited the connector loop of the old body. Take #279's body:
the delegated builder already scatters connectors with #278's `connector_scatter_2d`.

### 2.2 #282 verify/lean-bundle: `certify/mod.rs`, `web/src/lib/engine/solver-worker.ts`
Module list: keep both sides' modules (`reactions`, `deflection` from #280; `combination_bundle`,
`plastic_bundle`, `provenance` from #282). Worker header comment: keep both edits.

### 2.3 #283 verify/opensees-ext × #279/#287
- `geometric_stiffness.rs`: #287 and #283 both added the same 2D Kg hinge condensation
  (identical math). Keep #287's `condense_kg_plane` and `pub fn frame_kg_local_2d(p, l, hinge_start,
  hinge_end)` (used by tests/symbolic_elements.rs), drop #283's `condense_released_rotations`, keep
  #283's `frame_geometric_end_forces_2d/3d`.
- `buckling.rs`: Kg comes from #283's elongation-based N (`emit_geometric_stiffness_*d` at the
  global-axes linear displacements) AND is put in #287's inclined frames: collect over all DOFs
  when there are inclined supports, then `KgTriplets::rotate_inclined(its, nf)`.
- `mass_matrix.rs`: a single `_impl(input, dof_num, densities, inclined, nf)` serves #287's
  `*_sparse_inclined` and #283's `*_sparse_block`.
- `time_integration.rs`: the ground influence keeps #283's M_fr·r_r coupling and #287's frames:
  (T·M·Tᵀ)(T·r) = T·(M·r). The full product is taken in global axes and then rotated. The M_ff
  shortcut is used only when the rotated r has no restrained component.
  `sparse_ex_analysis_regressions::time_history_2d_ground_accel_inclined_roller...` covers it.

### 2.4 #284 verify/xpath × #283/#287 (+ fix commit c9f02e61)
#284 fixed three things the stack also fixed:
- A third copy of the 2D Kg hinge condensation: drop it (keep `condense_kg_plane`).
- 3D buckling Kg rotation at inclined supports: #284 rotated the assembled −Kg again after #287's
  `rotate_inclined`. The textual auto-merge rotated twice (index panic in `buckling_system_3d`)
  and also rotated the 3D mode back twice. Remove #284's rotation block and its extra
  `reverse_inclined_transform` of the mode.
- Keep #284's `pub #[doc(hidden)]` buckling systems, the max diagonal over all DOFs (connector
  diagonals included, `scatter_triplets` without `nf`), curved beams in 3D modal/buckling/harmonic,
  and the parallel self-weight fix.
- tests/assembly_paths.rs: `build_kg_from_forces_2d` gained #287's `inclined` argument (pass `&[]`).
  Fix commit: the oracle's buckling-Kg reference is now `add_geometric_stiffness_*d` at the linear
  displacements, because after #283 buckling no longer uses the end-average element forces
  (4.6 % off on a member with an axial point load). Ten KNOWN/reported repros fixed by
  #278/#279/#287 are un-ignored. `reported_legacy_triplet_assemblers` (benches only) stays ignored.

### 2.5 #290 verify/feature-matrix × #283/#287/#284 (+ fix commits eaa5d210, 5f43cd21, d46c0f7d)
- `geometric_stiffness.rs`: a fourth copy of the hinge condensation; keep the shared one.
- `buckling.rs`: keep `pub #[doc(hidden)]` and add #290's `ShellThermalNonQuad` refusal; expand
  curved beams only when present.
- **Semantic conflict, fixed in eaa5d210:** #290 made `emit_geometric_stiffness_3d` include every
  shell family's Kg (for P-Delta). #283 builds buckling's member Kg with that function, while
  `buckling_system_3d` still added the shell Kg itself, so shell Kg was counted twice and every
  shell buckling factor came out at half its value (feature matrix: 3D buckling × plate/MITC4/
  MITC9/curved shell/edge load off by 0.50). The explicit surface adders are removed.
- **5f43cd21:** #290 refused inclined supports in arc length, fiber 2D/3D, SSI 2D/3D and 3D
  contact. #287 makes those solvers work in the inclined frames, and its rotated-model tests failed
  on the refusal. The refusal is lifted for those analyses only, and the feature matrix checks the
  cells against its own reference (all ✓). Displacement control keeps refusing inclined supports
  (#287 notes it controls the tangential DOF there). The feature matrix's KNOWN entries for #279
  and #287 drop out. Solid shell stays KNOWN but is marked open: it is still singular on the sparse
  path and BAD in spectral with #289 merged.
- **d46c0f7d:** the oracle compares member-only Kg builders against the model with its shells
  removed. The 3D buckling Kg reference includes shells, so the doubled shell Kg would have been
  caught.

### 2.6 #297 fix/nonlinear-solvers × #278/#287/#284 (+ test fix 75e6928d)
- `element/connector.rs`: both fixed connector DOF scatter. Keep #278's element (shear springs
  with V·L arms, `connector_stiffness_*d(…, l)`, `connector_scatter_*`, `validate_connectors`).
  Implement #297's API on top of it: `connector_entries_2d/3d` and `one_connector_entries_3d` emit
  the entries of `connector_scatter_*`, so the nonlinear tangents use the same element as linear.
  `assemble_connectors_*` take #297's input-based signature. #297's large-displacement section is
  kept: zero-length connectors use `l = 0`, and shear on a finite-length connector is still refused
  in co-rotational (stricter).
- `assembly.rs`, `sparse_assembly.rs`: connector loops via `connector_entries_*`. The diagonal is
  taken over ALL DOFs (#284), so drop #297's `gi < nf`.
- `contact.rs`: take #297's rewrite (converged state, gaps from closure, Coulomb, damping,
  inclined supports, settlements) over #287's `contact_corrections_3d`. #287's contact 2D/3D
  rotated-model tests pass on it.
- `fiber_nonlinear.rs`: refuse prescribed displacements only. Connectors are supported (#297),
  inclined supports work in their frames (#287); keep #297's artificial stiffness and #287's
  rotation.
- `arc_length.rs`: `assemble_tangent(input, dof_num, u_frame, art, sparse, its)`. Arc length
  refuses prescribed displacements and thermal loads; displacement control additionally refuses
  inclined supports.
- FEATURE_MATRIX.md regenerated (`UPDATE_FEATURE_MATRIX=1`).
- 75e6928d: #287's co-rotational inclined-roller test used tol 1e-10. On the subdivided model
  the increment norm stalls on roundoff just above that, and since #297 an unconverged solve
  reports the last converged increment (zero) instead of the abandoned iterate. Use 1e-8 and
  assert convergence.

### 2.7 #291 × #295: `web/src/lib/engine/connection-design.ts`
Both replaced β = 0.6 beyond 300w with Le = 180w and capped β ≤ 1 (same math). Keep #295's form,
which applies it to end-loaded welds (the default; `endLoaded: false` opts out, as in the engine).

### 2.8 #292: example baselines
Four recorded baselines (`pro-concrete-wall-storehouse`, `pro-plane-frame-seismic`,
`pro-rc-frame-area-loads`, `pro-simple-shed`) changed on both sides. They are re-recorded on the
whole stack with `STABILEO_UPDATE_BASELINES=1` (31a34f44).

### 2.9 #294: `linalg/jacobi.rs`, `linalg/lanczos.rs`
#294's `solve_generalized_eigen_mass` and the stack's inverse fallback in `solve_generalized_eigen`
/ `dense_generalized_eigen_semidefinite` solve the same problem (semidefinite lumped mass: factor
K, λ = 1/μ). Keep the existing implementation in the Lanczos paths, and keep
`solve_generalized_eigen_mass` as a public wrapper that returns finite pairs only. #294's unit test
asserted that `solve_generalized_eigen` returns None for a singular M; it now falls back, so the
test checks the Cholesky-only path.

### 2.10 #296: `solver/definiteness.rs`
Singular-pivot threshold 1e-10 (identical in #294 and #296): it lands once. Both module notes are
kept.

### 2.11 #302 × #287/#297 (+ e149301b)
- modal.rs, harmonic.rs: #287's bodies with #302's `FreeConstraintSystem::build_2d(input, dof_num)?`.
- certify/buckling.rs: union of imports.
- contact.rs (#297's rewrite): new `build_2d/3d` signature, and constraint forces through
  `cs.constraint_forces(..)` so that they are global components at inclined nodes (#302 made the
  raw mapper private).
- tests/assembly_paths.rs: new signature (a model whose constraints are refused is skipped).
- e149301b: the 14 `#[ignore = "needs #287"]` markers are removed; 32/32 pass. The co-rotational
  2D case gets the same 1e-8 tolerance treatment as in 2.6.

### 2.12 #298 × #301: CIRSOC 201
Prepared on a side branch (`integration/cirsoc201`: 76c8aa9a, 4a6729db) and applied as merge
commits 4f5ba0f1 (#298) and 28de3a9b (#301). Several edits are in files that did not conflict
(tests, the web oracle, worked examples), so **rerere alone does not reproduce this**: the authors
of #298/#301 should take the files from 28de3a9b.

#298 merge: `cirsoc201_check.rs` conflicted with #286. Take #298's rewrite, which already has every
#286 CIRSOC 201 fix (2005 Vc = (1/6)√f'c·bw·d, the Vs cap, φ from fy/Es, doubly reinforced by strain
compatibility). #286's INTI worked examples get the new fields, pinned to the 2005 edition they
follow (the default edition is now 2025). `.gitignore`: both sides. `package-lock.json`: regenerated.

#301 merge: **one implementation, generic over Real**, so the f64 checker and the certified interval
check run the same formulas. Where the branches differed, the stricter rule was kept:

| Topic | #298 | #301 | Kept |
|---|---|---|---|
| Compression-controlled strain εty | fy/Es | 0.002 for fy ≤ 420 MPa | fy/Es for every grade and edition (φ 0.7707 vs 0.775 at εt = 0.0035). Tension-controlled: 0.005 (2005), εty + 0.003 (2025) |
| √f'c cap | 8.3 MPa in every shear term | 25/3 MPa in Vc only | 8.3 MPa everywhere |
| 2005 Vc | (1/6)√f'c with axial factor | 0.17 (predates #286) | #298 |
| Stirrup yield in Vs | fyt ≤ 420 MPa | uncapped | ≤ 420 MPa |
| No flexural capacity and no moment | passes | unevaluated, pass = false | unevaluated |
| Compression-side bar while c < d' | not credited | credited as tension | not credited (115.1 vs 120.5 kN·m) |
| Displaced concrete 0.85 f'c at a compression bar | only if the bar is inside the stress block | never | whenever c > d': the force balance is monotone, so the neutral axis is unique (the certificate needs this), and Mn can only go down. #298's 5000-section web oracle and its equilibrium helper use the same rule |
| Certified checks | – | flexure, shear | flexure, ductility (9.3.3.1; undecided applicability includes 0), shear, minimum shear (refused if possibly required and missing); certified demands carry the axial force; Vc and the Av,min threshold clamped ≥ 0 against interval rounding |

`rc_check.rs`: #301's ACI flexure by strain compatibility (`rc_flexure`) replaces #286's
`doubly_reinforced_equilibrium` (no callers left); #286's ACI worked examples pass.
`certify/design.rs`: imports from both, CIRSOC 201 section rewritten for the four checks and both
editions. #301's regressions are pinned to 2005 with the stricter values;
`tests/certify_design.rs` compares against max(flexure, ductility, shear).
#293 × #298 `statusFromRatio` (web cirsoc301.ts): #293's `ratio <= 1 ? 'ok' : 'fail'` came through
without a conflict. #292 × #298 locales: no conflict in this order. `SpreadFootingData.rho_w`:
literals compile (`rho_w: None` where needed). `pdelta-forces.ts` (removed by #283) is not
reintroduced.

**One judgment call for the CIRSOC 201 owners to confirm:** the displaced-concrete rule (last-but-one
row). It is the conservative choice, and it is required for a unique certified root.

### 2.13 #288 fuzz-mutants
#288 is still in progress; its head at the time (45a1a53b) was merged last. `verify.yml`: keep
#296's `codeaster-diff` job and #288's `fuzz` and `mutants` jobs. Re-merge its final head the same
way. Full engine tests pass with it.

## 3. Behaviour changes users will see (release notes)

Collected from the PR descriptions and adjusted for the integration: some refusals are lifted, the
CIRSOC 201 choices are listed below, and 3D co-rotational now converges. "BREAKING (results)" means
the same model gives different numbers.

### Defaults and inputs users will notice
- **Default dead-load build-up: 2.32 → 2.52 kN/m².** The partition allowance is now the CIRSOC 101-2025
  §4.3.2 minimum, 0.75 kN/m² of floor (#292). Partition allowances below 0.75 kN/m² are rejected.
- **EC3 LTB / Mcr: top-flange load by default.** Without the section depth it is refused (#295).
  CIRSOC 301 LTB also defaults to top-flange loading (`loadPosition`, #293). AISC LTB with
  top-flange load uses Cb/1.4 by default (#295).
- **CIRSOC 301 tension is NOT EVALUATED without connection data** (Ae = An·U from `tensionConnection`).
  App tension members show as unevaluated until it is given (#295).
- **Weld groups default to end-loaded** (β = 1.2 − 0.002 l/w, 180w beyond 300w), in the engine (#293)
  and the web (#295/#291). `endLoaded: false` opts out.
- Sections are treated as welded unless picked from a rolled catalogue family (#293/#295).
- **Constraints on supported slave nodes are now enforced.** The support used to win and the equation
  was dropped, with only an `OverConstrainedDof` warning (#302, #296). Constraints at inclined-support
  nodes are correct in every analysis (#302). Contradictory constraint sets, such as two rigid links on
  one slave, are refused.
- **Several supports on one node:** plain restraints merge (OR). Springs, settlements or inclined data
  on a shared node are refused (#288). They used to double-count or silently pick one.
- **ACI 318: new axial check `axialRatio`.** An axially overloaded column used to pass. Flexure is
  flagged when Pu is off the diagram; a T-beam with axial force is flagged incomplete (#301).
- **A ratio above 1.0 now fails** instead of "warn" (CIRSOC 301 up to 1.05, WASM normaliser up to 1.1)
  (#298).
- **Zero or non-finite capacity is "unevaluated" and fails** (CIRSOC 201, AISI) instead of passing
  (#301).
- Material presets: IRAM F-24/26/36 E = 200 000 / G = 77 200 MPa; RC unit weight 25 kN/m³; NBR concrete
  secant modulus; aluminium 5052-H32 / 6063-T6 from EN 1999 (#291).
- Feedback form: captcha required. Share links, Excel imports and AI requests have size and rate
  limits. Loaded detailing stamps count as stale until re-solved (#285).

### Analysis results (BREAKING)
- **Connectors** (#278): finite-length shear springs carry V·L, and connectors are assembled on the
  model's DOFs (all-truss, warping). Missing nodes, non-finite stiffness and finite shear springs
  without rotation DOFs are refused. **Connectors are now supported in co-rotational, arc length,
  displacement control, material- and fiber-nonlinear** (#297, with #278's element); shear on a
  finite-length connector is refused there.
- **Inclined supports in every analysis** (#287, #279): modal, harmonic, spectral, Craig–Bampton,
  buckling, time history, SSI, fiber, arc length and contact rotate M, Kg, loads and results with K.
  Peak spring reactions at inclined supports are no longer reported as 0. **In this integration, arc
  length, fiber 2D/3D, SSI 2D/3D and 3D contact accept inclined supports** (#290 had refused them);
  the feature matrix verifies each cell. Displacement control still refuses them.
- **2D buckling / time history** use the linear path's stiffness: angled springs, inclined rollers,
  springs on restrained DOFs, truss-only nodes (#279).
- **Buckling** takes N from the elongation (EA·δ/L), not the end average: λ changes with axial point
  or partial loads, 3× in one case (#283). 2D Kg is condensed at hinges: a pin-ended frame used to give
  λ ≈ 5e-6 (#281/#283/#284/#290). 3D buckling Kg is rotated at inclined supports (#284/#287).
  Curved-shell buckling was 200× too high (#290). **Shell buckling factors are correct on the merged
  stack** (an interaction of #283 and #290 had halved them; fixed in eaa5d210).
- **P-Delta**: member end forces include Kg·u (#283); 3D includes shell Kg (#290); hinges condensed.
- **Ground motion** includes M_fr·r_r: up to ~50 % of the load was dropped (#283).
- **Modal**: models with massless DOFs (hinged members, truss-only nodes) solve instead of failing
  (#283/#287/#294). Warping DOF mass consistent (#281).
- **Singular-pivot threshold 64ε → 1e-10** (#294/#296). Mechanisms that used to solve silently are
  flagged, such as a dangling hinged member. New 3D warning `stiffness_not_positive_definite` from a
  rigid-body restraint gate.
- **Linear MPC on a restrained DOF is enforced** (#296).
- **Plastic**: 2D overestimated collapse (unsafe) and ignored unloading hinges; 3D formed hinges only
  at member ends (2.3× unsafe) (#275). 2D plastic forms hinges at nodes with rotational springs,
  constraints or connectors (150 → 83.3) (#290). 3D plastic refuses constraints, connectors and
  springs (#290).
- **Co-rotational 3D** (#297): exact rigid rotation, frame carried by the end rotations, member forces
  include FEF (they were qL²/12 short). It now converges on frames where it did not. An unconverged
  solve returns the last converged increment and `loadFactor`; the Pro panel shows how much load
  reached equilibrium.
- **Contact** (#297): reports the converged contact state (2D used to report the linear solution);
  gaps act from closure; Coulomb sliding; damping is no longer a spring to ground; settlements.
- Solid shell frame-invariant, Scordelis-Lo 0.39 → 0.95; warped MITC4 corrected (#289).
- Sparse 3D `max_diag_k` over all DOFs (artificial warping stiffness, regularisation) (#284). Curved
  beams are included in modal/buckling/harmonic/reductions (#284/#290). Parallel load vector
  self-weight in global axes (#284).
- Spectral leak of FEF, partial-load integration, 2D truss axial point loads, roller spring reactions,
  HHT-α, Timoshenko FEF, harmonic truncation (#275).
- Many silently-wrong feature × analysis cells are now fixed or refused by name (#290; see
  docs/verification/FEATURE_MATRIX.md).
- Section properties: Iyz in the shear solve (L100x10 Cw was 24× too large), thin-wall J +18–24 %;
  bolt bearing uses s − dh (#291).

### Loads and combinations (CIRSOC, all on the unsafe side before) (#292)
- Combinations without the absent companion loads are generated (pro-simple-shed column axial
  44 → 62 kN). Seismic combination f2 = 0.70 S on roofs that keep snow; f1 on L; the larger factor of
  the two codes is used. Seismic weight includes f2·S. Wind roof Cp interpolates h/L. Live-load
  reduction uses each member's own tributary area. One-way slabs are not reduced unless the load is
  heavy. Snow table additions.

### Design checks
- **CIRSOC 201** (#298 + #301, reconciled): strain compatibility for tension and compression steel
  (up to 18 % too much φMn before); φ: compression-controlled at εty = fy/Es for every grade, tension-controlled at 0.005 (2005) or εty + 0.003 (2025);
  √f'c ≤ 8.3 MPa in shear; stirrup fyt ≤ 420 MPa; ductility check 9.3.3.1; zero capacity
  unevaluated; compression bars not credited while c < d'; displaced concrete deducted whenever a bar
  is in compression. **The default edition is 2025.** Every CIRSOC 201 result is re-checked by the
  engine; a pass the engine does not confirm is a failure, and a column without a loaded kernel shows
  "not verified" (#298). Crack width was 6.9× too wide (#298). Certified interval enclosures for
  flexure, ductility, shear and minimum shear (#301).
- **ACI 318** (#301): strain compatibility (Mn was 14.5 % high), √f'c ≤ 8.3 MPa without Av,min.
- **AISI S100** (#301): F2.1 √(1+X) fix; G2.1 shear (yield branch up to 51 % high); linear interaction;
  zero capacity unevaluated.
- **CIRSOC 301** (#286/#293/#295): web shear §G.2.1 (one example was 60 % unconservative); §E.7 slender
  Q; §F.3–F.6; LTB in the code's form; §E.4 torsional buckling refused without J/Cw; NOT EVALUATED for
  shapes and cases the classification cannot describe.
- **EC3** (#286/#293/#295): χLT = 1 for Lb = 0 (was NaN); 6.3.3 interaction with Annex B; Cm outside
  [0.4, 1] refused; Class 4 effective properties (refused without them).
- **AISC** (#286/#295): F3/F6.2 flange local buckling; E7 slender elements refused without
  `compressionElements`.
- Footing shear: λs added, row (a) not used without stirrups (#298).

### New features (UI)
- Result certificates: rigorous error bounds on solver output, Lean-checked bundles, ± bounds on
  diagrams, extremes, deflections and reactions (#275, #280, #282).
- Model sanity review in the PRO Diagnostics panel (#300).
- Deflection plot includes Timoshenko shear deflection (#275).
- Removed: the web P-Delta member-force workaround (`pdelta-forces.ts`), now in the engine (#283).


## 4. Test results on the integrated branch

Run on the integrated branch, macOS, release profile:

| Suite | Result |
|---|---|
| engine `cargo test --release` (all targets) | **7895 passed, 0 failed, 22 ignored** |
| engine, intermediate checkpoints | after #284: 7682/0; after #297: 7752/0; after #300: 7833/0 |
| `make wasm` (nix develop) | OK |
| web `npm ci` + `npm run test:unit` | **13739 passed, 0 failed, 12 skipped** (943 files) |
| web `npm run typecheck` | 448 errors = baseline, no new errors |
| e2e `npm run test:e2e:smoke` | **754 passed, 1 flaky (passed on retry: basic-demos "drawing a beam"), 4 skipped** |
| e2e sweep, truss / three-hinge-arch / gen-irregular-truss (main's red shard) | pass with the Viewport fix |

CI on the draft PR (#304) runs the full matrix, including the @slow e2e shards.

### main's red CI (e2e shard 1)
Two real failures, both fixed. The fixes are on this branch and as a separate draft PR to main (#305):
- `basic-advanced-sweep`, despiece/plastic then "← Back" on truss models: the 2D canvas carried
  `textBaseline` from frame to frame (`middle` before the press, `alphabetic` after it), so the axis
  letters and the displacement labels moved about 4 px. Every frame of `draw()` now starts from the
  canvas defaults (21428c51).
- `ded-roundtrip`: the project file deliberately writes `selfWeightCaseId` since 7f7ea2bc; the test's
  key list was out of date (47c660db).

## 5. Remaining failures and open items

- Ignored engine tests (22): long or nightly sweeps, debugging aids, and
  `reported_legacy_triplet_assemblers` (benches-only assemblers drop truss and thermal loads; not
  fixed by any PR).
- Solid shell × linear/P-Delta (sparse path, singular) and spectral (BAD) stay KNOWN in the feature
  matrix: **not fixed by #289**, now marked "open".
- Feature matrix (#302 note): no row yet for "constraint on an inclined-support node"; it is covered by
  `tests/constraints_inclined_supports.rs` (32 tests).
- **3D co-rotational (#287/#302 note): fixed by #297.** On the frame #287/#302 could not test, it now
  converges, with the inclined support matching the rotated model to 1e-6 (new test
  `corotational_3d_inclined_support_matches_rotated_model`).
- Co-rotational convergence floor: on subdivided (sparse) models the increment norm stalls just above
  1e-10. Since #297, an unconverged solve returns the last converged increment, which may be none.
  Two tests moved to 1e-8 and now assert convergence. Worth a look by the #297 owner: the
  convergence test could be made scale-aware.
- Displacement control still refuses inclined supports (it would control the tangential DOF at an
  inclined node).
- The assembly oracle skips a random model whose constraints #302 refuses (so it no longer sees those).
- #298 open items (CIRSOC 301 migration, footings, `loads/*` coefficients, engine gate for
  biaxial/torsion/slenderness), #292 (free-roof open-building minimum §2.1.5, ice and extraordinary
  combinations), #297 (truss-only nodes in 3D mixed models, material-nonlinear state after an
  unconverged increment), #289 (no EAS, MITC9 warping), #285 (audit items 26–34): unchanged, see
  each PR.
- #288 is still in progress: re-merge its final head.
- One web flaky test on a loaded machine: `scale-budget.test.ts` (timing) on the CIRSOC branch run; it
  passed in the final run.
