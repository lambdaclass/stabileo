# Solver Reference

This is a working reference for how to think about the solver surface. It is intentionally organized by task, not by internal file names.

## 1. Coordinate Contract

Stabileo uses a `Z-up` convention.

The practical consequences are:

- `Z` is vertical
- `XY` is the horizontal ground plane
- common flat 2D models are embedded in the `XZ` plane

Read:

- [ADR 0001: Z-up coordinate system](adr/0001-z-up-coordinate-system.md)

## 2. Core Model Objects

The structured model is built from:

- nodes
- elements
- supports
- materials
- sections
- loads

This same structure shows up across:

- the browser app
- snapshots/history
- AI build/edit flows
- solver input translation

## 3. Solver Outputs

The important result surfaces are:

- displacements
- reactions
- element forces
- solver diagnostics

Depending on mode and element family, that expands into:

- 2D diagrams
- 3D diagrams
- stresses
- deformed shape
- envelopes and combinations

### Reaction and displacement reporting contract

All solver outputs — per-node reactions, displacements, and equilibrium sums — are
reported in GLOBAL axes on the following analysis paths:
- linear
- constrained (prescribed displacements and multi-point constraints)
- cable
- corotational (geometric nonlinearity)
- reduction (Guyan and Craig-Bampton)
- material-nonlinear
- winkler (foundation models)
- staged construction (rejects inclined supports explicitly rather than mis-reporting)

For these paths, the solve itself uses the rotated support frame internally and
back-transforms before reporting. This also holds for the internal iteration of the
geometric/material nonlinear paths (corotational, material nonlinearity): per-iteration
state updates operate on the same consistently back-rotated frame, not the raw mixed-frame
solve vector.

Dynamics paths (modal, spectral, harmonic, time history) do not yet back-rotate
inclined-support DOFs — mode shapes and time-history displacements at such nodes
are reported in the rotated support frame.

Support-local reaction components are not yet exposed; if added, they will be an
additive field, not a change to the global-frame default.

## 4. Solver Method Selection (Linear Static)

Linear static solves accept an optional `solverOptions` object in the input
JSON. Omitting it preserves the legacy behavior exactly.

```json
{
  "solverOptions": {
    "method": "auto",
    "preconditioner": "ics",
    "tolerance": 1e-8,
    "maxIterations": 1000
  }
}
```

- `method`:
  - `"auto"` (default within an explicitly supplied `solverOptions` object):
    dense solve below 64 free DOFs, sparse Cholesky below 1,000 free DOFs,
    and PCG at or above 1,000 (`ITERATIVE_THRESHOLD`). Omitting the object
    entirely keeps the legacy direct path at every size.
  - `"direct"`: force the direct chain (dense → sparse Cholesky →
    regularized Cholesky → dense LU).
  - `"pcg"`: force a preconditioned conjugate gradient attempt.
- `preconditioner` (only for PCG): `"ics"` (default), `"ic0"`, `"mic"`,
  `"ssor"`, `"jacobi"`, `"none"`.
  - `"ics"` — shifted IC(0) with Ajiz-Jennings pivot restoration: degraded
    pivots are replaced by the original DOF diagonal instead of aborting, so
    the build never fails. When no pivot degrades it is bitwise identical to
    `"ic0"`.
  - `"ic0"` — strict IC(0): fails to build on patterns with non-SPD pivots
    (e.g. thin-shell MITC4 matrices).
  - `"mic"` — modified IC(0) with diagonal compensation of dropped fill;
    fails to build on the same patterns as `"ic0"`.
  Every candidate is tried in turn (shifted/strict IC or MIC → Jacobi →
  SSOR): a candidate is accepted only when PCG converges AND the true
  residual verifies, so the chain degrades on verified convergence, not just
  on construction. Explicit choices degrade with warnings; the implicit
  default runs the same chain with info-level notes.
- `tolerance`: PCG stopping tolerance on ‖r‖/‖b‖ (default `1e-8`).
- `maxIterations`: PCG iteration cap (default `max(1000, n_free / 4)`).

Note: PCG's stagnation safeguard scales with the problem size
(`max(50, 8·√n)` iterations without a 1% residual improvement) — measured
plateaus on MITC4 shells grow as ≈3.2·√n, so a fixed window aborts
legitimate slow convergence on large meshes.

Before attempting PCG, the solver checks the original, unshifted stiffness
matrix with sparse Cholesky. Residual convergence alone cannot establish
stability: a load that does not excite a mechanism can still produce a small
residual and plausible displacement. If the unshifted check fails, the solver
uses the existing direct chain, retaining its regularization diagnostics and
mechanism errors. A shifted factor does not authorize PCG on the original K.
The check and fallback factors are cached across prepared load cases.

Every PCG result is then verified against the true relative residual
(‖Ku − f‖/‖f‖ ≤ 1e-6); if no preconditioner converges, the solver reuses the
direct factors and reports the fallback.

This stability check incurs sparse factorization time and storage even when
PCG converges. The original PCG kernel benchmarks exclude that cost and do
not represent current end-to-end speedups. `timings.symbolicMs`, `numericMs`
and `nnzL` include the check, including on successful PCG solves. Automatic
selection remains opt-in pending a cheaper validated stability check and a
new end-to-end crossover measurement.

How to read the outcome:

- `solverRunMeta.solverPath`: `"dense_lu"`, `"sparse_cholesky"`,
  `"pcg_ics"`, `"pcg_ic0"`, `"pcg_mic"`, `"pcg_ssor"`, `"pcg_jacobi"`,
  `"pcg_none"`, `"pcg_fallback_sparse_cholesky"`, `"sparse_fallback_dense_lu"`,
  or `"fully_restrained"`.
- `timings.pcgIterations` / `timings.pcgFinalResidual` (3D only): present
  only when the PCG path produced the result.
- Structured diagnostics: `pcg_solve` (info) on the PCG path,
  `pcg_fallback_direct` (warning) when PCG failed and the direct chain solved
  the model. When shifted IC restores degraded pivots, an info diagnostic
  reports how many.

## 5. Diagnostics and Trust

The repo treats trust as a first-class product surface, not a hidden implementation detail.

Use these docs for that layer:

- [VERIFICATION.md](VERIFICATION.md)
- [BENCHMARKS.md](BENCHMARKS.md)
- [SOLVER_ROADMAP.md](roadmap/SOLVER_ROADMAP.md)

## 6. Engine, Web, and AI Seams

If you need implementation-level detail, start with:

- [`engine/README.md`](../engine/README.md)
- [`web/src/lib/engine/`](../web/src/lib/engine)
- [`web/src/lib/ai/client.ts`](../web/src/lib/ai/client.ts)
- [`backend/src/main.rs`](../backend/src/main.rs)

## 7. Recommended Reading Order

If you are new:

1. [Quick start](QUICKSTART.md)
2. [AI modeling workflow](AI_MODELING_WORKFLOW.md)
3. [ADR 0001](adr/0001-z-up-coordinate-system.md)
4. [Verification](VERIFICATION.md)
5. [Engine README](../engine/README.md)
