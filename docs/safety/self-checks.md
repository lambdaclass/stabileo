# Runtime self-checks

Scope: linear static and modal, 2D and 3D. Checks report through the existing
`StructuredDiagnostic` severity contract and `known_issues::attach`; hard failures
use the solver's existing `Result::Err` refusal path. A failed certificate is not
the same as a failed solve: certificates are separate, often background jobs with
size/coverage limits. They do not replace unconditional inexpensive checks.

## Inventory

Paths below are relative to `engine/src`. “Existing” describes main before this
slice; a convergence test inside a solver is not an independent post-solve check.

| Analysis | Existing runtime checks / containment | Missing inexpensive independent check / follow-up |
|---|---|---|
| Linear static 2D/3D | `solver/linear.rs`: free-equation relative residual, non-finite displacements, conditioning warnings, fallback residual verification, translational equilibrium summary. `solver/constraints.rs`: reduced residual including settlement correction. `certify/linear.rs`, `solver.rs`, `sparse.rs`, `reassembly/`: optional interval solution/reaction/force certificates. | This slice: check returned displacements against retained unshifted matrices; contain residual and actual returned reaction balance. Full moment balance about a common origin remains a separate slice. |
| P-delta 2D/3D | `solver/pdelta.rs`: iteration/convergence gates; `certify/pdelta.rs`: nonlinear enclosure and stability checks. | Recompute equilibrium at the returned displacement and actual reported load factor, independent of the last iteration's convergence flag. |
| Linear buckling 2D/3D | `solver/buckling.rs`: eigenvalue filtering; `certify/buckling.rs`: enclosed factors and constrained map checks. | Returned-mode Rayleigh quotient `-(phi^T K phi)/(phi^T Kg phi)` versus reported factor, plus eigen-residual; define denominator handling near zero geometric energy. |
| Modal 2D/3D | `solver/modal.rs`: mass validation, finite positive eigenvalue filtering; Lanczos convergence. `certify/modal.rs`: interval eigenvalue enclosures, Gram residual, completeness cutoff. | This slice: per-mode eigen-residual and mass Gram matrix check on normalized copies. |
| Spectral 2D/3D | `solver/spectral.rs`: spectrum/mode validation and combination rules; `certify/spectral.rs`: finite interval response propagation. | Independently recombine a selected response and verify modal participation/normalization at the consumer boundary. |
| Time history 2D/3D | Time-history solvers validate integration inputs; `certify/dynamics.rs` checks scheme stability, per-step residual, interval energy/work balance and time-error estimate on recorded traces. | Cheap running energy/work/damping ledger on every solve, plus a deterministic Maxwell–Betti reciprocity spot check of the linear operator. Account explicitly for HHT algorithmic dissipation. |
| Harmonic | `solver/harmonic.rs`: modal truncation/static correction; `certify/harmonic.rs`: complex dynamic-system enclosure, resonance refusals. | Complex residual of returned response at each frequency; reciprocal transfer-function spot check. |
| Corotational / arc length 2D/3D | `solver/corotational.rs`, `arc_length.rs`: reduced force convergence, adaptive steps, accepted-state rollback. | Reassemble internal force at every published accepted state and its reported lambda; compare with that solve's tolerance, never a stale trial state. |
| Material / fiber nonlinear | `solver/material_nonlinear.rs`, `fiber_nonlinear.rs`: constitutive iteration and reduced equilibrium tests. `known_issues.rs`: NL-5 warning for whole-member secant approximation. | Independent final equilibrium and constitutive work consistency; retained-state verification must not advance constitutive history. |
| Plastic collapse 2D/3D | `certify/plastic.rs`, `plastic_3d.rs`: exact rational static/kinematic bounds on supported models; optional exported proof bundles. | Always-on mechanism equilibrium / external versus internal virtual work, capacity admissibility and reported collapse-factor consistency, with span hinges and constrained DOFs. |
| Cable 2D/3D | `solver/cable.rs`: nonlinear convergence; structured self-weight tension assumption warning, known-issue attachment. | Recompute end-force equilibrium, tension-only admissibility and load-factor residual from the final cable geometry. |
| Contact 2D/3D | `solver/contact.rs`: active-set iterations and force recovery; final residual used for reactions. | Final complementarity (gap, normal force and their product) plus reduced global residual, independent of the active-set stop condition. |
| Shells / solids | Linear solver checks apply to assembled shell/solid DOFs; `pre_solve_gates.rs` checks broken/distorted elements; `certify/reassembly/model3d.rs` has explicit coverage limits; discretization recovery/studies are separate. | Element patch equilibrium and recovered-stress consistency; shell drilling/artificial DOFs need explicit accounting, not relaxed global tolerances. |
| Design checks | `postprocess/check_ledger.rs`: applicability/unevaluated checks; `certify/design.rs`: interval capacity enclosures and non-finite refusal; code-specific checks in `postprocess/`. | Independent demand/capacity and verdict recomputation from the displayed governing combination, including units and governing-location provenance. |
| Moving loads / combinations / staged / SSI / Winkler | Reuse static paths; `certify/combinations.rs`, combination bundles, soil/input gates and solver-specific convergence. | Propagate worst constituent self-check status through envelopes; verify interpolation, stage activation and soil-force balance independently. |

`known_issues.rs` currently contains the material secant warning and thermal
assumption diagnostics; its empty analysis entries are not proof that a result
passed a numerical check. Structured warnings already enter model findings and
the diagnostics table. The new banner also displays modal diagnostics, which
previously had no structured-diagnostics field.

## First-slice contract and thresholds

No displacement, reaction, force, eigenvalue, displayed shape or participation
factor is corrected by these checks. Only diagnostics or refusal can change.
The phases are `self_check:static_residual`, `self_check:static_balance`,
`self_check:modal_residual:N` and `self_check:modal_orthogonality:N` (one-based).
PASS is Info; WARN is Warning and remains visible with a banner; REFUSE returns
an error before publication. Non-finite metrics always refuse.

* Static: `||Kff uf - (ff - Kfr ur)||2 / ||ff - Kfr ur||2`, using the original
  retained matrix, not a factor or regularized matrix. Inclined global outputs
  are rotated back before checking. Constraint solvers already evaluate
  `||C^T(Ku-f)|| / ||C^T f||`, accounting for the affine settlement transform.
  Warning at `1e-6`, exactly the existing static acceptance tolerance; hard
  refusal at `1e-3` (one part per thousand unbalanced force). Conditioning does
  not justify loosening this backward-equilibrium requirement: large forward
  displacement error is separately addressed by conditioning and certificates.
* Static balance uses assembled applied translational force sums and **returned
  support reactions**, including springs, plus the net MPC reaction. For each dependent force `g`,
  that resultant is `g` at the dependent DOF minus its `C^T g` transfer at
  independent DOFs, rotated to global axes. This includes an MPC that acts as
  a ground support without double-counting forces transferred to a fixed
  master. Its denominator is the sum of absolute
  individual applied nodal force components (before resultant cancellation) and
  individual reaction components, floored at
  1 in engine force units. Components are scaled before summing absolute values
  to avoid overflow; inclined components are first rotated to global axes.
  Thresholds remain `1e-6` / `1e-3`. This avoids treating a
  spring reaction omitted by the old summary as a failed solve. It is a force
  check, not yet a moment check or a separate load-assembly implementation.
* Modal residual: `||K phi - lambda M phi||2 / (||K phi||2 + |lambda| ||M phi||2)`.
  This scale-invariant backward residual does not divide by a potentially tiny
  eigenvalue alone. Both matrices are in the same independent constrained
  coordinates. Warning at `1e-6`, hard refusal at `1e-3`. Lanczos uses `1e-10`
  in the shift-invert problem; these are physical-problem acceptance limits,
  not replacements for that convergence tolerance. The four-order margin
  accommodates inverse transformation and cancellation in conditioned systems;
  forward eigenvalue accuracy still requires the existing certificate.
* Mass orthogonality: normalize copies by `sqrt(phi^T M phi)` because published
  modes have maximum component 1, then check each entry of `Phi^T M Phi - I`.
  Warning `1e-6`, refusal `1e-3`; zero/non-finite modal mass refuses. No
  orthogonalization or modification of the solver's modes takes place.

The static check uses matrix-vector products and load/reaction traversal, with
no factorization. Sparse modal work is `O(m nnz + m^2 n)` and storage `O(m n)` for
m returned modes: linear in matrix size for fixed m, **not** O(nnz) independent
of the number of modes. Small dense systems scan their stored `n^2` entries.

## Remaining reviewable slices

1. Extend static balance to moments about a translated origin and an absolute
   nodal-load scale; extend the constraint force audit to moments and include shell/solid patch
   tests. Check recovery and coordinate conversion at the serialized boundary.
2. Buckling residual/Rayleigh check, including repeated factors and constraints;
   corruption tests must perturb the reported factor and mode independently.
3. Nonlinear accepted-state audit for P-delta, corotational, arc length and
   material/fiber models. Reuse constitutive snapshots without committing a new
   material state. Add limit-point and unload/reload regressions.
4. Plastic mechanism equilibrium/virtual work and contact complementarity;
   include span hinges, cable slackening and soil spring balance.
5. Time-history energy ledger and reciprocity, harmonic complex residual,
   spectral recombination and inherited modal status. Distinguish numerical
   damping from unexplained energy loss.
6. Design and envelope propagation: all governing constituents, no status lost
   when summing cases or selecting an extreme; verdict consistency with the
   displayed quantities. Every slice registers changed verdicts/refusals and
   uses targeted corpus tests, never automatically rewrites numerical baselines.

## Result registration and validation

The new diagnostics/refusal policy is registered at results version 5 in
`web/src/lib/provenance/result-changes.json` with a BREAKING (results) fragment.
Passing Info diagnostics are excluded from the snapshot gate's warning/error
codes. Numeric snapshots must remain unchanged. Test commands and measured
results are recorded here after validation; unrun checks are not passes.

The stable-norm independent residual takes precedence over the legacy summary
when both exist: the legacy sum-of-squares can overflow for finite extreme
loads. Its numeric summary is preserved for snapshot compatibility; overflow of
that old calculation alone is not a reason to refuse an otherwise balanced
finite solution.

### Focused verification (2026-10-29)

* Native: six self-check tests, including 17 fixture models each solved statically
  and modally (34 solves), a 72-free-DOF sparse 2D modal solve, perturbed returned
  displacements, corrupted/duplicated modes, corrupted reactions, non-finite
  values and extreme finite scales. Normal fixture solves have zero self-check
  warnings or refusals.
* Native regression: 41 tests from the solver binary, limited to constrained
  residuals, static inclined-support constraints, modal inclined supports,
  modal constrained participation and sparse static solver paths, including a
  settlement-only dense fallback that scales the residual by the effective
  prescribed-displacement right-hand side. The deliberately
  indefinite shifted-stiffness fixture correctly emits a balance warning
  (~`3.225e-6`); the test asserts it rather than weakening the `1e-6` threshold.
* Web: 62 focused banner, registry/version and fixture-provenance tests passed;
  the static/modal-only snapshot test runs 30 Basic/PRO corpus cases, excluding
  design, P-delta, spectral and buckling work. The pre-existing mechanism case
  retains its refusal. No committed numeric snapshot is rewritten.
* Snapshot registration gate against `main`, changelog validation, test inventory
  and `git diff --check` pass.

Reproduce inside the development shell, using a temporary build directory:

```sh
make shell
export CARGO_BUILD_JOBS=2
export CARGO_TARGET_DIR="$(mktemp -d)"
cargo test -p dedaliano-engine --lib --test solver --no-default-features --offline -- \
  --test-threads=2 self_checks constrained_residual sparse_solver_paths \
  constraints_inclined_supports::linear_static inclined_support_analyses::modal \
  modal_constrained_participation
cd web
npx vitest run --project unit --maxWorkers 1 \
  src/lib/engine/__tests__/self-checks.test.ts \
  src/lib/provenance/__tests__/registry.test.ts \
  src/lib/provenance/__tests__/results-version.test.ts \
  src/lib/export/__tests__/rc-cad-handoff-golden.test.ts \
  src/lib/export/__tests__/rc-cad-handoff-manifest.test.ts
npx vitest run --project results --maxWorkers 1 \
  src/lib/results-snapshot/__tests__/snapshot-self-checks.test.ts
```

Commands run inside Nix with the pinned Rust 1.99.1 and Node 22 toolchains.
The full dev shell's nixpkgs fetch stalled, so validation used the same installed
Nix toolchain store paths through `nix shell`; WASM was built with `make wasm`
and that `NIX_RUN` override. Cargo used two build jobs and the isolated target
above; no full engine or web suite was run.
