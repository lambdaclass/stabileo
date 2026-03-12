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
- global-sort single-pass CSC construction (`from_triplets`) instead of per-column duplicate-compaction memmoves
- `k_ff`-only sparse assembly where full reactions are not needed
- sparse assembly reuse in modal, buckling, harmonic, Guyan, and Craig-Bampton workflows
- sparse modal 3D eigensolver path in the common unconstrained case
- sparse buckling 3D eigensolver path in the common unconstrained case
- measured AMD vs RCM fill comparison on shell meshes
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
- end-to-end sparse eigensolver depth across harmonic and reduction, plus broader sparse eigensolver maturity beyond the common unconstrained modal/buckling cases

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

### P0.5: Measure Real Runtime Gains — DONE

The sparse path is healthy and measured:

4. ~~`Measure real full-model runtime and memory wins`~~ — DONE
   Factorization gains of `22-89×`, `22×` end-to-end at `30×30 MITC4`, and sparse modal `11.8×` faster at `20×20 MITC4` are now measured.

### P1: Deeper Sparse Eigensolver Integration

5. `Deepen sparse eigensolver integration`
   Sparse assembly reuse is partly done, and modal 3D plus buckling 3D already have sparse eigensolver paths in the common unconstrained case. The next step is to reduce remaining dense eigensolver internals in harmonic and reduction workflows and broaden sparse eigensolver maturity further.

6. `Fix the tridiagonal eigensolver`
   The current Lanczos tridiagonal step still falls back to dense Jacobi on the tridiagonal matrix. That is real debt and should be corrected.

7. `Sparse shift-invert eigensolver path`
   Large modal and buckling problems should not stay on a dense shift-invert bottleneck.

8. `Measure sparse runtime on the newly sparse workflows`
   Modal is now measured. Buckling, harmonic, Guyan, and Craig-Bampton should get the same measured runtime/memory treatment.

### P2: Scalable Iterative Solve Infrastructure

After deeper sparse eigensolver integration:

9. `Iterative refinement`
   Low effort, useful as a quality backstop.

10. `PCG with simple preconditioning`
   Start with:
   - `PCG`
   - diagonal / Jacobi preconditioning

11. `Preconditioner infrastructure`
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
- sparse eigensolver depth is still incomplete across harmonic and reduction workflows, and still needs broader maturity around modal/buckling edge cases

These claims are now resolved:
- ~~dense LU fallback on shell models~~ — eliminated via direct left-looking symbolic Cholesky + two-tier pivot perturbation
- ~~catastrophic fill on shell meshes~~ — fixed via RCM ordering (673× → 1.8×)
- ~~nondeterministic assembly and DOF numbering~~ — fixed via sorted iterations and merged support constraints
- ~~duplicate-compaction memmove bottleneck in sparse CSC construction~~ — fixed via global sort + single-pass `from_triplets`
- ~~unconditional `k_full` construction in workflows that only need `k_ff`~~ — fixed where sparse assembly reuse is now in place

## What Was Overstated

These points need qualification:

- `PCG is the single largest gap`
  Still not the top priority. The sparse direct path is healthy now; next focus is deeper sparse eigensolver integration, runtime measurement on the newly sparse workflows, and eigensolver cleanup.

- `All structural stiffness matrices are SPD`
  Too broad. Shell drilling DOFs require controlled perturbation. Two-tier pivot perturbation handles this.

- `Modified Newton is the top missing feature`
  High ROI, yes. But still behind sparse eigensolver depth, runtime measurement on the newly sparse workflows, and eigensolver cleanup.

## Recommended Roadmap Integration

Use this order in the solver roadmap:

1. ~~sparse shell solve viability~~ — DONE
2. ~~fill-reducing ordering quality~~ — DONE (RCM, 1.8× fill)
3. ~~measure real full-model runtime gains~~ — DONE
4. deeper sparse eigensolver integration
5. measure runtime on the newly sparse modal/buckling/harmonic/reduction workflows
6. tridiagonal eigensolver fix
7. sparse shift-invert eigensolver
8. iterative refinement
9. PCG + Jacobi
10. preconditioner stack
11. modified Newton
12. quasi-Newton variants
