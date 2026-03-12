# Dedaliano Performance Program Notes

This file is a working note for performance work.

It is not the canonical roadmap.
For the official ordering, see:
- [SOLVER_ROADMAP.md](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)
- [research/numerical_methods_gap_analysis.md](/Users/unbalancedparen/projects/dedaliano/research/numerical_methods_gap_analysis.md)

## What Is Already Done

The original sparse-shell viability program is complete:

- sparse shell solves no longer fall back to dense LU on representative shell models
- deterministic assembly and deterministic DOF numbering are in place
- direct left-looking symbolic Cholesky replaced the broken etree-based structure
- two-tier pivot perturbation handles drilling DOFs without breaking representative shell solves
- `from_triplets` was rewritten from per-column duplicate compaction to global sort + single-pass CSC build
- `k_ff`-only sparse assembly is in place where full reactions are not needed
- sparse runtime gains are measured:
  - `22-89×` factorization speedup over dense LU
  - `22×` end-to-end at `30×30 MITC4`
  - `11.8×` sparse-modal speedup at `20×20 MITC4`
- sparse assembly is reused in:
  - modal
  - buckling
  - harmonic
  - Guyan
  - Craig-Bampton
- modal 3D and buckling 3D now have sparse eigensolver paths in the common unconstrained case
- AMD vs RCM has been measured, and AMD is currently the better fill choice on larger shell meshes

## What The Current Performance Frontier Is

The next performance work is no longer about making sparse shell solves possible.

It is now about:

1. `Deeper sparse eigensolver integration`
   The assembly side is healthier. The next gap is inside eigensolver/reduction internals, especially where workflows still densify `K_ff`.

2. `Runtime measurement on newly sparse workflows`
   Modal is already measured. The next workflows to measure are:
   - buckling
   - harmonic
   - Guyan
   - Craig-Bampton

3. `Tridiagonal eigensolver debt`
   The Lanczos tridiagonal stage still needs cleanup.

4. `Sparse shift-invert depth`
   Large modal and buckling problems still need a stronger sparse eigen pipeline.

5. `Iterative refinement / Krylov later`
   These are still important, but they are not the immediate next step anymore.

## What Not To Optimize Next

These are not the top performance priorities now:

- re-optimizing sparse shell viability
- more blind assembly parallelism work without new profiling evidence
- treating `PCG` as the first next performance step

Those were more relevant before:
- sparse shell fallback was fixed
- CSC construction was fixed
- `k_full` overbuild was reduced
- modal and buckling sparse eigensolver steps landed

## Current Hypotheses To Test

### 1. Harmonic 3D

Likely bottleneck:
- repeated dense complex solves across the frequency sweep

Question:
- how much does sparse assembly help compared with the cost of the dense frequency-sweep solve path?

### 2. Guyan and Craig-Bampton

Likely bottlenecks:
- dense partitioning and dense eigensolver work after sparse assembly

Question:
- where does time go between:
  - sparse assembly
  - dense conversion
  - partitioning
  - interior eigensolve

### 3. Buckling and modal at larger shell sizes

Question:
- are the next wins more about eigensolver internals than about assembly/factorization now?

## Immediate Next Measurements

The next useful benchmark work is:

1. `buckling sparse vs dense runtime`
2. `harmonic sparse vs dense runtime`
3. `Guyan sparse vs dense runtime`
4. `Craig-Bampton sparse vs dense runtime`
5. `phase breakdowns` for those workflows:
   - sparse assembly
   - dense conversion
   - eigensolve
   - sweep / repeated solves
   - reduction partitioning

## Practical Next Implementation Targets

If the measurements confirm the current expectation, the next implementation targets should be:

1. `deepen sparse eigensolver integration`
2. `fix the tridiagonal eigensolver`
3. `push sparse shift-invert further`
4. `only then add iterative refinement / Krylov methods`

## Rule For Using This File

If this note starts sounding like the roadmap again:
- move the final conclusions into [SOLVER_ROADMAP.md](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)
- keep this file as a short working research note only
