# Metamorphic coverage and next slices

Workstream 2, stacked on #813 (`safety/metamorphic-invariance`). Audit of
`engine/tests/metamorphic/{main,generated,active,safety_cases,checks2,checks3,
ana2,ana3,modal_checks,symmetry,corpus,regressions,response}.rs` and
[the existing suite documentation](../verification/METAMORPHIC.md).
This is a coverage inventory, not a claim that every supported input is correct.
No solver behavior, acceptance rules or numerical tolerances change in this slice.

## Matrix

C = covered by an executable relation; M = missing; N = not applicable to that
response law. Cells are **2D / 3D** (a single value means both). C† includes an
ignored, correct-expectation reproducer: it is coverage of a known failure,
**not passing protection**. C* is limited to the configuration described below.
Rotation and translation are exercised together by the rigid-motion transforms;
independent large-coordinate translations remain a separate planned slice.
“Mirror” means covariance under reflection, including pseudo-vector signs;
self-symmetry of assembled symmetric/antisymmetric structures is additionally
covered by the legacy corpus harness (3D uses a proper C2 rotation).

| Analysis type | Node IDs | Member reversal | Units | Rotation | Translation | Mirror | E → u/E | Superposition | Maxwell–Betti | Linear load scale |
|---|---|---|---|---|---|---|---|---|---|---|
| Linear | C | C | C† | C† | C | C | C | C | C | C |
| Dense reference | C / N | C / N | C / N | C / N | C / N | C / N | M / N | C / N | C / N | C / N |
| Sparse linear | C | C | C | C | C | C | M | C | C | C |
| PCG linear | C | C | C | C | C | C | M | C | C | C |
| Constrained | C | C | C | C | C | C | M | C | C | C |
| Certified linear | C | C | C | C | C | C | M | C | C | C |
| Load combinations | C | C | C | C | C | C | M | C | C | C |
| Staged, one stage | C* | C* | C* | C* | C* | C* | M | C* | C* | C* |
| Staged, loads in two stages | C* | C* | C* | C* | C* | C* | M | C* | C* | C* |
| Winkler, no foundation | C* | C* | C* | C* | C* | C* | M | C* | C* | C* |
| Winkler, active foundation | C* | C* | C* | C* | C* | C* | N | C* | C* | C* |
| Contact, no gaps | C* | C* | C* | C* | C* | C* | M | C* | C* | C* |
| Contact, active gap | C* | C* | C* | M | M | M | N | N | N | N |
| SSI, no soil springs | C* | C* | C* | C* | C* | C* | M | C* | C* | C* |
| Creep/shrinkage at t₀ | C* | C* | C* | C* | C* | C* | M | C* | C* | C* |
| P-Delta | C | C | C | C | C | C | N | N | N | N |
| Corotational | C | C | C | C† | C† | C† / C | N | N | N | N |
| Material nonlinear | C* | C* | C* | C* | C* | C* | N | N | N | N |
| Fiber nonlinear | C* | C* | C* | C* | C* | C* | N | N | N | N |
| Taut cable | C* | C* | C* | M / C* | M / C* | C* / M | N | N | N | N |
| Modal | C | C | C | C | C | C | N | N | N | N |
| Certified modal | C | C | C | C | C | C | N | N | N | N |
| Buckling | C | C | C | C | C | C | N | N | N | N |
| Time history, applied force | C | C | C | C | C | C | N | C | C† / C | C |
| Time history, ground motion | N / C | N / C | N / C | N / C | N / C | N / C | N | N / M | N / N | N / M |
| Response spectrum | C | C | C | M / C* | M / C* | C | N | N | N | M |
| Harmonic | C | C | C | C | C | C | N | C | C | C |
| Plastic collapse | C† / C | C† / C | C† / C | C† / C | C† / C | C† / C | N | N | N | N |
| Kinematic check | C | C | C | C | C | C | N | N | N | N |
| Moving loads | C | C | C | M / C* | M / C* | C / M | M | N | N | M |
| Influence line | C | C | C | M / C* | M / C* | C / M | M | N | N | N |

Applicability and limits:

- Static `u/E` requires homogeneous prescribed displacements, mechanical loads,
  fixed Poisson ratio, and no unscaled independent springs. Thermal strains,
  settlements and fixed external springs require a different relation. The new
  coverage is for plain frames; other linear paths remain M.
- Modal frequencies scale as √E, elastic buckling factors as E, and ideal plastic
  collapse factors are independent of E at fixed yield strengths. These are now
  checked in both dimensions. They do **not** obey displacement `1/E`.
- Buckling and plastic load factors scale inversely with applied mechanical load;
  the existing `superposition` check exercises that law. Neither has linear
  response superposition. Spectrum combination and moving-load envelopes are
  also not additive. Positive amplitude scaling is a separate missing check.
- Dynamic reciprocity is the equal-time impulse/identical load-history relation
  for a symmetric linear system, not static flexibility at a single time.
  Changing E at fixed excitation frequency/time does not produce `u/E`.
- Gravity-bound analyses only rotate within the representable, gravity-preserving
  subgroup. General rotations with consistently transformed gravity remain M.
- Active Winkler/contact and taut cable models exist, but general SSI, creep at
  t > t₀, changing staged topology, yielded material/fiber states, shells, warping,
  and independent spring/connector tensors need explicit non-vacuity guarantees.
  A pass on a no-foundation/no-gap adapter is not active-feature coverage.
- #758: constrained plastic collapse; #760: time-history reciprocity; #762:
  near-mechanism units/orientation in the linear solver. Existing ignored
  reproducers retain their correct expectations and now use the explicit
  `known wrong result: #NNN` reason. #759 (modal warping orthogonality) and #761
  (corotational rigid motion) also remain open coverage limitations. The old
  corpus ✓ tables predate these adverse-case exclusions; see the later generated
  matrix in the linked document rather than interpreting those ✓ as universal.
- Mechanism classification across **both accepted and refused** baselines is
  still missing: the legacy harness needs a conditioning estimate and can report
  a baseline refusal without testing transformed classifications. The new fast
  checks require actual passes, but exercise stable generated frames.

## Slice 1: strict priority checks and stiffness laws

`engine/tests/metamorphic/stiffness.rs` reuses #813's deterministic random model
builder, case adapters, dimensional responses, comparison tolerances and strict
response-shape validator. Eight seeds in each dimension exercise linear,
plastic collapse, time history, kinematics, modal and buckling analyses. Every
requested cell must have exactly one pass and zero refusals, unrepresentable,
inconclusive, ignored or failed outcomes. Missing cells cannot pass silently.

The new stiffness relation solves E×1, E×¼ and E×4. It checks full static
translations/rotations and unchanged reactions/member forces, all three reported
buckling factors, all six modal frequencies and returned cumulative effective
mass tensors, and plastic collapse factors. Fixed density, loads and yield
strength isolate E. The existing symmetric CIRSOC portal fixture adds redundant
load paths, distributed loading and simultaneous plastic hinges to the generated
cantilevers. This is bounded property testing; the generator randomizes dimensions
and material/section values but does not randomly explore every topology or shrink
failures. Case names include the seed for reproduction.

## Two tiers and reproduction

From the repository root, with a dedicated target directory and two build jobs:

```sh
export CARGO_BUILD_JOBS=2
export CARGO_TARGET_DIR=/private/tmp/claude-501/codex-ws2-target
# Fast priority subset: fixed eight seeds; unaffected by METAMORPHIC_CASES.
cargo test -p dedaliano-engine --locked --release --test metamorphic metamorphic_fast_ -- --nocapture --test-threads 1
# Exhaustive tier for this slice: default 512 seeds per dimension, configurable.
METAMORPHIC_CASES=512 METAMORPHIC_SEED=20261018 cargo test -p dedaliano-engine --locked --release --test metamorphic metamorphic_nightly_priority -- --ignored --nocapture --test-threads 1
# Existing full nightly corpus/generator job, not a laptop verification command:
METAMORPHIC_CASES=4096 cargo test -p dedaliano-engine --locked --release --test metamorphic metamorphic_nightly_ -- --ignored --nocapture --test-threads 2
# Known failures are opt-in, separate from the passing nightly tier:
cargo test -p dedaliano-engine --locked --release --test metamorphic safety_cases:: -- --ignored --nocapture --test-threads 1
```

The new nightly test is automatically selected by the existing nightly workflow's
`metamorphic_nightly_` filter; ordinary metamorphic CI includes the fast test.
The case-count variable controls this slice's nightly sweep. The existing broader
nightly generator and corpus retain their original case counts. Invalid/zero
counts fail rather than silently running no properties. Compilation time is
separate from the fast tier's <3 minute runtime budget.

Validation results are recorded below after targeted runs. The complete engine,
web and broad corpus suites are deliberately outside this slice's local test run.

## Remaining reviewable slices, in priority order

1. **Adverse plastic models (#758).** Split the existing five-case reproducer by
   case/relation, preserve the expected collapse factor under ID, member, units,
   reflection and motion transforms, then add E/yield/load-scale cross-checks.
   Reuse the rigid-link corpus and constrained rich generator. Keep each observed
   failure explicitly ignored with #758; count passes separately from exclusions.
2. **Dynamic reciprocity (#760).** Extend the failing rich seed into deterministic
   force/observation-node pairs and directions, compare every stored time step
   and the zero-load response, cover rotations and 3D. Separate applied-force
   and ground-acceleration amplitude scaling. Avoid assuming static E scaling.
3. **Mechanism classification (#762).** Add a classification oracle independent of
   conditioning preflight: stable, exact mechanism and near-mechanism families,
   matching refusal categories across units, rotations and translations. Include
   supported positive controls so rejecting every model cannot satisfy a test.
4. **Modal/buckling breadth (#759).** Extend stiffness laws to the rich corpus,
   shells, constrained/warping models and repeated eigenvalues. Compare invariant
   subspaces/projectors and cumulative mass at cluster boundaries, not individual
   eigenvector signs/order. Verify buckling reference-load scaling independently.
5. **Other static/dynamic paths.** Carry `u/E` through dense/sparse/PCG, constrained,
   certified, combination and stage adapters; use response increments for imposed
   strains. Add positive scaling for spectrum and moving-load envelopes and
   consistent stiffness scaling of all spring/connector tensors.
6. **Active nonlinear and coordinate breadth.** Require yielded sections, open/closed
   gaps, active SSI, nonzero creep age and changed topology. Add standalone
   translations (including survey coordinates), full 3D reflections and
   gravity-consistent rotations; retain #761 until fixed with unchanged tolerance.
7. **WASM/web boundary.** Replay selected fixtures through WASM serialization and
   web unit/axis adapters, checking displayed displacements, forces and factors.
   Use targeted Vitest files and the same engine fixture seeds. This first slice
   verifies native engine end to end, not the browser integration.

Each slice should retain a fixed fast seed set, make nightly counts explicit,
assert the expected number of non-vacuous comparisons, and report known failures
separately. No tolerance increases, test deletions or broader input refusals are
part of this plan.
