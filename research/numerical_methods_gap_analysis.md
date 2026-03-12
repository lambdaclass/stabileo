# Numerical Methods Gap Analysis

Read next:
- solver priorities: [SOLVER_ROADMAP.md](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)
- current status: [CURRENT_STATUS.md](/Users/unbalancedparen/projects/dedaliano/CURRENT_STATUS.md)
- proof/status: [BENCHMARKS.md](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md)

This note captures the current numerical-methods gaps that matter for large models and harder nonlinear problems.

It is intentionally narrower than a general wishlist. The point is to rank what matters next based on the current code, not on abstract FEM completeness.

## What The Code Actually Shows

The current solver already has:
- sparse-first 3D assembly (deterministic, sorted element iterations)
- direct left-looking symbolic Cholesky factorization
- RCM ordering (fill ratio 1.8× on representative shell meshes)
- two-tier pivot perturbation (drilling DOFs perturbed, true singularities rejected)
- sparse Cholesky that survives shell models without dense LU fallback
- deterministic DOF numbering (merged support constraints)
- residual-based parity testing (sparse vs dense verified via residual norm)
- benchmark gates (no-dense-fallback, fill-ratio, parity)
- line search
- adaptive stepping
- arc-length / displacement control

The current solver does **not** yet have:
- Krylov iterative linear solvers (`PCG`, `GMRES`, `MINRES`)
- preconditioner infrastructure (`Jacobi`, `IC(0)`, `SSOR`, `AMG`)
- iterative refinement
- modified Newton / initial-stiffness reuse
- quasi-Newton updates (`BFGS`, `L-BFGS`, `Broyden`, `SR1`)
- a finished tridiagonal eigensolver in the Lanczos path
- a true sparse shift-invert eigensolver path
- sparse-path reuse in modal, buckling, harmonic, and reduction solvers

## Corrected Priority Order

The raw gap list is real, but the order matters.

### P0: Sparse Shell Solve Viability — DONE

These are now complete:

1. ~~`Eliminate dense LU fallback on representative shell models`~~ — DONE
   Direct left-looking symbolic Cholesky with two-tier pivot perturbation eliminates dense LU fallback on all shell families. Wall-time share dropped from 87% to 0%.

2. ~~`Reduce fill dramatically`~~ — DONE
   RCM ordering reduced fill from 673× (naive AMD) to 1.8× on representative shell meshes.

3. ~~`Add no-fallback / fill-ratio benchmark gates`~~ — DONE
   Benchmark gates now verify: no dense fallback on representative shell models, fill ratio < 200×, sparse-vs-dense residual parity < 1e-6.

### P0.5: Measure Real Runtime Gains (current focus)

The sparse path is healthy. Now prove it matters:

4. `Measure real full-model runtime and memory wins`
   End-to-end benchmarks on representative models, not just phase-breakdown diagnostics.

### P1: Broader Sparse-Path Reuse

5. `Extend sparse path into modal, buckling, harmonic, and reduction solvers`
   These solver families currently still use dense assembly. The healthy sparse path should now be reused.

6. `Fix the tridiagonal eigensolver`
   The current Lanczos tridiagonal step still falls back to dense Jacobi on the tridiagonal matrix. That is real debt and should be corrected.

7. `Sparse shift-invert eigensolver path`
   Large modal and buckling problems should not stay on a dense shift-invert bottleneck.

### P2: Scalable Iterative Solve Infrastructure

After broader sparse-path reuse:

8. `Iterative refinement`
   Low effort, useful as a quality backstop.

9. `PCG with simple preconditioning`
   Start with:
   - `PCG`
   - diagonal / Jacobi preconditioning

10. `Preconditioner infrastructure`
    Then add:
    - `IC(0)`
    - `SSOR`
    - maybe later `AMG`

### P3: Nonlinear Solve Cost Reduction

11. `Modified Newton`
    This is the cheapest meaningful nonlinear acceleration still missing.

12. `Quasi-Newton variants`
    Later:
    - `BFGS` / `L-BFGS`
    - `Broyden` for contact / SSI style status-changing problems

## What Is Accurate In The Original Gap Analysis

These claims are substantially correct:
- no Krylov iterative linear solvers
- no preconditioner abstraction
- no iterative refinement
- no modified Newton or quasi-Newton variants
- tridiagonal eigensolver path is unfinished and falls back to dense Jacobi
- sparse shift-invert eigensolver path is still underdeveloped
- sparse path not yet reused in modal, buckling, harmonic, and reduction solvers

These claims are now resolved:
- ~~dense LU fallback on shell models~~ — eliminated via direct left-looking symbolic Cholesky + two-tier pivot perturbation
- ~~catastrophic fill on shell meshes~~ — fixed via RCM ordering (673× → 1.8×)
- ~~nondeterministic assembly and DOF numbering~~ — fixed via sorted iterations and merged support constraints

## What Was Overstated

These points need qualification:

- `PCG is the single largest gap`
  Still not the top priority. The sparse direct path is healthy now; next focus is measuring real runtime gains and broader sparse-path reuse.

- `All structural stiffness matrices are SPD`
  Too broad. Shell drilling DOFs require controlled perturbation. Two-tier pivot perturbation handles this.

- `Modified Newton is the top missing feature`
  High ROI, yes. But still behind runtime measurement, sparse-path reuse, and eigensolver cleanup.

## Recommended Roadmap Integration

Use this order in the solver roadmap:

1. ~~sparse shell solve viability~~ — DONE
2. ~~fill-reducing ordering quality~~ — DONE (RCM, 1.8× fill)
3. measure real full-model runtime gains (current focus)
4. extend sparse path into modal, buckling, harmonic, and reduction solvers
5. tridiagonal eigensolver fix
6. sparse shift-invert eigensolver
7. iterative refinement
8. PCG + Jacobi
9. preconditioner stack
10. modified Newton
11. quasi-Newton variants
