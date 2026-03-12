# Dedaliano Solver Roadmap

## Purpose

This document is the `solver roadmap`.

Read next:
- current snapshot: [`CURRENT_STATUS.md`](/Users/unbalancedparen/projects/dedaliano/CURRENT_STATUS.md)
- current proof and capability status: [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md)
- verification method: [`VERIFICATION.md`](/Users/unbalancedparen/projects/dedaliano/VERIFICATION.md)
- shell-family selection notes: [`research/shell_family_selection.md`](/Users/unbalancedparen/projects/dedaliano/research/shell_family_selection.md)
- competitor shell-family comparison: [`research/competitor_element_families.md`](/Users/unbalancedparen/projects/dedaliano/research/competitor_element_families.md)
- numerical-methods gap analysis: [`research/numerical_methods_gap_analysis.md`](/Users/unbalancedparen/projects/dedaliano/research/numerical_methods_gap_analysis.md)

It is for:
- solver mechanics
- numerical robustness
- validation and benchmark sequencing
- verification strategy sequencing
- performance and scale work

It is not the product, market, or revenue roadmap.
For that, see [`PRODUCT_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md).

For current capability and validation status, see [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md).
For shell-family selection and competitor comparison research, use the research notes linked above.

This document should stay forward-looking.
Historical progress belongs in [`CHANGELOG.md`](/Users/unbalancedparen/projects/dedaliano/CHANGELOG.md).

## Current Frontier

The sparse shell solve viability blocker is resolved and runtime gains are now measured. Dense LU fallback has been eliminated on representative shell models. Sparse Cholesky delivers 22-89× factorization speedup over dense LU (22× end-to-end at 30×30 MITC4), with 0 perturbations across all tested sizes and families. Fill ratio grows from 2.6× to 7.0× with mesh size, and AMD now beats RCM on fill for larger shell meshes. Assembly and DOF numbering are deterministic. Residual-based parity testing is in place.

Measured runtime data (Criterion, factorization only):

| Family | Mesh | nf | Dense LU | Sparse Chol | Speedup |
|--------|------|----|----------|-------------|---------|
| MITC4 | 6×6 | ~210 | 1.19ms | 0.88ms | 1.4× |
| MITC4 | 10×10 | 684 | 18.8ms | 4.17ms | 4.5× |
| MITC4 | 15×15 | ~1400 | 184ms | 16.4ms | 11× |
| MITC4 | 20×20 | 2564 | 986ms | 43.8ms | 22× |
| MITC4 | 30×30 | 5644 | 12.2s | 157ms | 77× |
| Quad9 | 5×5 | ~700 | 18.9ms | 4.2ms | 4.5× |
| Quad9 | 10×10 | ~2600 | 974ms | 56ms | 17× |
| Quad9 | 15×15 | ~5700 | 12.5s | 141ms | 89× |
| Curved | 8×8 | ~450 | 5.9ms | 10.1ms | 0.58× |
| Curved | 16×16 | ~1700 | 277ms | 109ms | 2.6× |
| Curved | 24×24 | ~3600 | 3.0s | 406ms | 7.4× |

Key observations:
- sparse wins on all families above ~500 DOFs
- dense still wins at curved 8×8 (~450 DOFs) — sparse overhead dominates at small sizes
- fill ratio grows with mesh size (not constant); AMD is now the measured fill winner on larger shell meshes
- 0 perturbations everywhere — Cholesky is clean
- at 30×30 MITC4 (5644 DOFs), sparse assembly + solve takes 0.56s vs 12.3s dense — 22× end-to-end

The main remaining work is:

- deeper sparse eigensolver integration after the now-partly-done sparse reuse into modal/buckling/harmonic/reduction, with modal and buckling already on sparse eigensolver paths in the common unconstrained case
- runtime and memory measurement on the newly sparse modal/buckling/harmonic/reduction workflows
- fill-ratio and ordering investigation (AMD vs RCM and beyond)
- verification hardening around the new sparse path (determinism, parity gates, fill-ratio gates)
- long-tail nonlinear hardening (mixed nonlinear cases)
- product surfacing (deterministic diagnostics and solve timings in the app)
- shell-family workflow maturity and selection guidance
- shell-adjacent workflow breadth (layered shells, axisymmetric workflows, nonlinear shell depth)
- solver-path consistency
- deeper reference-benchmark coverage on the newest advanced paths

## What Still Separates Dedaliano From The Strongest Open Solvers

Based on the comparison against projects like OpenSees, Code_Aster, and Kratos, the remaining gaps are not “missing the basics.” They are:

1. `Performance / scale maturity`
   Sparse Cholesky runtime gains are measured: 22-89× factorization speedup, 22× end-to-end, 0 perturbations. Sparse-path reuse is now partly done across modal/buckling/harmonic/reduction, and modal plus buckling already have sparse eigensolver paths in the common unconstrained case. The next steps are runtime measurement on the newly sparse workflows, deeper sparse eigensolver integration, and eigensolver cleanup.

2. `Long-tail nonlinear maturity`
   More years of hardened edge cases are still needed in mixed nonlinear workflows:
   - contact + nonlinear + staging
   - shell + nonlinear interaction
   - difficult convergence cases

3. `Full solver-path consistency`
   Dense vs sparse, constrained vs unconstrained, shell vs frame-shell mixed, and advanced nonlinear paths must keep converging to the same behavior.

4. `Benchmark moat expansion`
   Dedaliano is already strong here, but broader external-reference proof is also the most realistic path to becoming the best open structural solver.

5. `Shell-family workflow maturity`
   `MITC4 + MITC9 + SHB8-ANS + curved shells` now form a real production shell stack. The remaining shell work is no longer basic shell breadth, but shell-family guidance, workflow hardening, and the next important shell-adjacent capabilities competitors still expose clearly.

This changes the strategic target:

- not `be broader than every open-source mechanics framework`
- but `be the strongest open structural solver product with the deepest visible proof of correctness`

## Ranked Priorities

If the goal is `best open structural solver`, the current priority order is:

1. ~~`Measure real runtime gains`~~ — DONE
   Measured across MITC4, Quad9, and curved shell families: 22-89× factorization speedup over dense LU, 22× end-to-end at 30×30 MITC4, 0 perturbations. Sparse wins above ~500 DOFs on all families. Fill ratio grows 2.6-7.0× with mesh size.

2. `Deeper sparse eigensolver integration`
   Sparse assembly/runtime bottlenecks from duplicate compaction and unconditional `k_full` builds are fixed. Modal 3D and buckling 3D now have sparse eigensolver paths in the common unconstrained case, so this program is partly done. The next step is to push sparse deeper into harmonic and reduction internals and reduce remaining dense eigensolver dependencies.

3. `Runtime measurement on newly sparse workflows`
   Modal is now measured, and buckling has the sparse eigensolver path but still needs the same runtime/memory treatment. The next concrete measurement step is harmonic, Guyan, and Craig-Bampton, so the next scale work stays data-driven.

4. `Verification hardening around the new sparse path`
   The sparse path is now live and deterministic. Lock it in with:
   - determinism gates (sorted assembly, merged DOF numbering)
   - residual-based parity gates (sparse vs dense solutions verified via residual norm)
   - fill-ratio gates (< 200× on representative shell meshes)
   - no-dense-fallback gates on representative shell models
   - sparse modal parity and no-`k_full`-overbuild expectations
   - broader invariant, property-based, and fuzzing coverage around sparse/shell paths
   - signal-driven benchmark growth: add tests that improve proof, regression protection, performance confidence, or edge-case coverage

5. `Broader sparse-path reuse`
   Sparse reuse is now partly done in 3D modal, buckling, harmonic, Guyan, and Craig-Bampton flows. The next step is to extend sparse reuse where still missing and push sparse deeper than `assemble_sparse_3d() + to_dense_symmetric()`.

6. `Long-tail nonlinear hardening`
   Now that the linear/shell sparse base is healthier, mixed nonlinear cases become more worth attacking:
   - contact + nonlinear + staging
   - shell + nonlinear interaction
   - difficult convergence edge cases

7. `Product surfacing`
   Deterministic diagnostics and solve timings are now much more valuable in the app:
   - expose pivot perturbation counts and fill ratios in the UI
   - surface solve phase breakdowns for user visibility
   - make solver-path selection and fallback behavior transparent

8. `Solver-path consistency`
   Keep dense vs sparse, constrained vs unconstrained, and mixed shell/frame workflows converging to the same behavior.

9. `Constraint-system maturity`
   Finish chained constraints, connector depth, eccentric workflow polish, and remaining parity gaps.

10. `Advanced contact maturity`
   Push harder convergence, richer contact laws, and tougher mixed contact states.

11. `Reference benchmark expansion`
    Keep growing external-reference proof for contact, fiber 3D, SSI, creep/shrinkage, and broader shell workflows.
    Prefer:
    - reference cases that close real proof gaps
    - acceptance models that protect multi-feature workflows
    - regression tests for real bugs
    - performance gates that protect runtime, fill, and no-fallback expectations
    Avoid low-signal count inflation.

12. `Shell-family workflow maturity`
    Keep the shell-family selection guidance current, maintain the frontier-gate benchmarks, and only reopen shell-family expansion if the current stack proves insufficient on practical workflows.

13. `Shell-family automatic selection policy`
    Turn shell-family guidance into explicit rules the UI and model layer can use for automatic defaults, explainable recommendations, and safe override behavior.

14. `Shell-adjacent workflow breadth competitors still expose clearly`
    Add the highest-value missing shell-related workflow classes:
    - layered / laminated shell workflows
    - axisymmetric workflows
    - deeper nonlinear / corotational shell depth

15. `Reduction, staged/PT coupling, and other second-tier depth`
    Mature the scale-oriented and long-term workflow layers after the core solver-quality gaps above are tighter.

## Current Sequence

The current near-term sequence is:

1. ~~`Measure real runtime gains`~~ — DONE
   Measured: 22-89× factorization speedup, 22× end-to-end at 30×30 MITC4, 0 perturbations across all families/sizes. Sparse wins above ~500 DOFs. Dense still wins at curved 8×8 (~450 DOFs).

2. `Deeper sparse eigensolver integration`
   Modal 3D and buckling 3D now have sparse eigensolver paths for the common unconstrained case. This is partly done; the next step is to extend that depth into harmonic and reduction workflows and reduce remaining dense eigensolver dependencies.

3. `Runtime measurement on the newly sparse workflows`
   Modal is now measured. Buckling should be measured next to match its new sparse path, followed by harmonic, Guyan, and Craig-Bampton.

4. `Verification hardening around the new sparse path`
   Lock in the sparse path with:
   - determinism gates (sorted assembly and merged DOF numbering are in place; add broader coverage)
   - residual-based parity gates (sparse vs dense verified via residual norm < 1e-6)
   - fill-ratio and no-dense-fallback benchmark gates
   - sparse modal parity and no-`k_full`-overbuild expectations
   - invariant, property-based, and fuzzing coverage around sparse/shell paths

5. `Broader sparse-path reuse`
   Modal, buckling, harmonic, Guyan, and Craig-Bampton 3D now sparse-assemble and then convert `K_ff` back to dense, with modal and buckling already taking a sparse eigensolver step further. The next step is to push sparse deeper into harmonic and reduction internals.

6. `Long-tail nonlinear hardening`
   Focus on the hardest mixed cases:
   - contact + nonlinear + staging
   - shell + nonlinear interaction
   - difficult convergence edge cases

7. `Product surfacing`
   Make the now-healthy sparse path visible in the app:
   - expose solve timings, pivot perturbation stats, and fill ratios
   - surface solver-path selection and fallback behavior
   - deterministic diagnostics for user trust

8. `Solver-path consistency and remaining maturity work`
   Finish:
   - constrained vs unconstrained parity hardening
   - remaining constraint deepening
   - advanced contact maturity
   - clearer solver-side diagnostics and output semantics

9. `Shell-family workflow guidance and frontier tracking`
   Keep the shell-family selection guidance current, maintain the frontier-gate benchmarks, and only reopen shell-family expansion if the current `MITC4 / MITC9 / SHB8-ANS / curved-shell` stack proves insufficient.

10. `Shell-adjacent workflow breadth`
   Add the highest-value shell-related workflow classes competitors still expose clearly:
   - layered / laminated shell workflows
   - axisymmetric workflows
   - deeper nonlinear / corotational shell depth

## Active Programs

### 1. Shell-Family Maturity

Focus:
- release-gated shell benchmarks (`MITC4`, `MITC9`, `SHB8-ANS`, and curved-shell frontiers)
- shell load vectors
- mixed tri/quad and beam-shell workflows
- shell modal and buckling consistency
- distortion tolerance
- shell stress recovery consistency
- shell-family comparative benchmark tables and selection guidance
- shell-family automatic-selection rules for default product behavior

Current status:
- MITC4+EAS-7, MITC9, SHB8-ANS, and curved shells are all implemented, benchmarked, and part of the production shell stack
- shell-family frontier gates now exist across MITC4, MITC9, SHB8-ANS, and curved-shell benchmarks
- the shell question is no longer “do we have enough shell breadth?” but “how do we harden and guide the multi-family stack?”

Current remaining shell backlog:
- shell-family selection guidance and explicit “use / avoid” rules for MITC4, MITC9, SHB8-ANS, and curved shells
- a rule-based shell-family selector for automatic defaults and explainable recommendations
- broader curved/non-planar workflow validation with the multi-family shell stack
- broader shell modal, buckling, and dynamic reference cases across the multi-family shell stack
- better shell diagnostics and output semantics in solver results
- MITC9 corotational extension (deferred)
- layered / laminated shell workflows
- axisymmetric workflows for shells of revolution
- nonlinear / corotational shell workflow depth across the multi-family stack

Decision support:
- use [`research/shell_family_selection.md`](/Users/unbalancedparen/projects/dedaliano/research/shell_family_selection.md) for current family-choice rules and default-selection logic
- use [`research/competitor_element_families.md`](/Users/unbalancedparen/projects/dedaliano/research/competitor_element_families.md) to justify why layered shells, axisymmetric workflows, and deeper nonlinear shell depth are the highest-value shell-adjacent additions

Known formulation boundary:
- MITC4+EAS-7: efficient for flat and mildly curved shells
- MITC9: higher-order shell path with better accuracy on standard shell benchmarks at lower mesh density
- SHB8-ANS: strong solid-shell option on the curved/non-planar frontier
- curved shell: preferred family for severe shell-of-revolution and genuinely curved geometry where flat-faceted families are weakest
- shell breadth is no longer the open gap; the remaining shell work is hardening, guidance, and performance across the multi-family stack

Recommended shell order:
1. keep the shell-family selection guidance and frontier gates current
2. add the most important shell-adjacent workflow breadth competitors still expose:
   - layered / laminated shell workflows
   - axisymmetric workflows
   - nonlinear / corotational shell depth
3. turn shell-family guidance into an explicit automatic selection policy for the product layer
4. only reopen shell-family expansion if the current MITC4 / MITC9 / SHB8-ANS / curved-shell stack proves insufficient on practical workflows

Why it matters:
Shell quality is one of the clearest separators between a strong structural solver and a top-tier one.

### 2. Constraint-System Reuse and Deepening

Focus:
- consistent reuse of constrained reductions across solver families
- chained constraints
- eccentric workflow polish
- connector depth
- cross-solver parity in forces and outputs

Why it matters:
Real structural models rely heavily on diaphragms, rigid links, MPCs, and eccentric connectivity. Inconsistent constrained behavior destroys trust.

### 3. Performance and Scale

Focus:
- full-model runtime and memory benchmarks
- broader sparse-path reuse across solver families
- parallel assembly scaling on heavier element families
- conditioning diagnostics
- eigensolver debt cleanup

Current status:
- **sparse shell solve viability is done**: direct left-looking symbolic Cholesky with two-tier pivot perturbation eliminates dense LU fallback on all shell families (MITC4, MITC9, curved shell)
- **fill ratio fixed**: RCM ordering reduced fill from 673× (naive AMD) to 1.8× on representative shell meshes
- **dense fallback eliminated**: wall-time share dropped from 87% to 0% on a 50×50 MITC4 plate (~15k DOFs)
- **assembly is deterministic**: all HashMap element iterations sorted by ID across dense, sparse, and parallel paths
- **DOF numbering is deterministic**: multiple supports targeting the same node merge constraint flags with OR
- **residual-based parity testing**: sparse and dense solutions both verified via ||Ku-f||/||f|| < 1e-6
- **benchmark gates in place**: no-dense-fallback gate, fill-ratio gate (< 200×), sparse-vs-dense residual parity gate
- sparse-first 3D assembly is live for plates, quads, and frames (models with 64+ free DOFs)
- parallel element assembly via rayon (`parallel` feature flag) is wired into the 3D sparse solver path
- all 8 element families parallelized through a unified `AnyElement3D` work pool
- memory benchmarks show 11-22× reduction on representative 10×10 to 15×15 shell models
- criterion benchmarks cover flat-plate (up to 50×50 = 2500 quads) and mixed frame+slab models (up to 8-storey, 8×8 slab)
- the Lanczos tridiagonal eigensolver still falls back to dense Jacobi on the tridiagonal matrix; this is real eigensolver debt
- sparse assembly reuse is now in place for 3D modal, buckling, harmonic, Guyan, and Craig-Bampton workflows, eliminating dense `n×n` assembly there
- assembly/extraction measurements show a new bottleneck: on MITC4 plate meshes, sparse assembly/extraction can still be 5-25× slower than dense assembly/extraction even though it wins decisively on memory and large-scale solvability
- profiling shows the hot spot is `CscMatrix::from_triplets` / duplicate compaction, not element stiffness computation
- some 3D workflows still overbuild `k_full` even when they only need `k_ff`

Measured parallel assembly results (Apple Silicon, release build):

| Model | Elements | DOFs | Serial | Parallel | Speedup |
|-------|----------|------|--------|----------|---------|
| 20×20 flat plate | 400 quads | ~2.6k | 82 ms | 80 ms | 1.03× |
| 30×30 flat plate | 900 quads | ~5.8k | 411 ms | 386 ms | 1.06× |
| 50×50 flat plate | 2500 quads | ~15.6k | 2.96 s | 2.91 s | 1.02× |
| 8-storey mixed | 512 quads + 32 frames | ~3.3k | 161 ms | 157 ms | 1.03× |

MITC4 element stiffness is lightweight (~200 ops), so the parallel overhead nearly cancels the speedup. Quad9 and curved-shell elements (5-10× heavier per element) will show stronger scaling.

Updated numerical-methods order:

1. ~~sparse shell solve viability~~ — DONE
2. ~~fill-reducing ordering quality~~ — DONE (RCM, 1.8× fill on representative shell meshes)
3. ~~measure real full-model runtime gains~~ — DONE
4. reduce sparse assembly overhead
5. add `k_ff`-only sparse assembly where full reactions are not needed
6. extend sparse path deeper into modal, buckling, harmonic, and reduction internals
7. tridiagonal eigensolver fix
8. sparse shift-invert eigensolver path
9. iterative refinement and Krylov solvers
10. modified Newton
11. quasi-Newton variants

See [`research/numerical_methods_gap_analysis.md`](/Users/unbalancedparen/projects/dedaliano/research/numerical_methods_gap_analysis.md).

Next steps:
- profile and reduce `assemble_sparse_3d` overhead
- compare RCM vs AMD on representative shell and mixed models
- measure the now-sparse modal/buckling/harmonic/reduction workflows
- push sparse deeper into eigensolver internals instead of converting `K_ff` back to dense
- fix the Lanczos tridiagonal eigensolver debt

Why it matters:
A solver is not elite if it only works well on small clean examples.

### 4. Verification Hardening

Focus:
- benchmark gates
- acceptance models
- invariants
- property-based tests
- fuzzing
- differential consistency tests
- signal-driven benchmark growth only

Rule:
- do not add low-signal tests just to increase the count
- add tests that improve:
  - proof
  - regression protection
  - performance confidence
  - edge-case coverage

Why it matters:
This is how the solver becomes visibly trustworthy rather than merely feature-rich.

### 5. Long-Tail Nonlinear Hardening

Focus:
- mixed contact + nonlinear + staged cases
- shell/nonlinear interaction hardening
- difficult convergence edge cases
- stronger fallback and failure behavior on ill-conditioned real models

Why it matters:
This is the main remaining place where mature open solvers still have more years of hardened behavior than Dedaliano.

## Exit Criteria

### Shell-family maturity

Already done:
- MITC4+EAS-7, MITC9, and SHB8-ANS are all accepted as part of the production shell stack
- curved/non-planar benchmarks written and running (twisted beam, Raasch hook, hemisphere R/t sweep) — results document the flat-faceted limit

Remaining to close:
- the shell-family selection guidance and frontier boundaries are explicitly documented
- shell-family selection policy is explicit enough for automatic defaults plus manual override
- distortion and warp studies are gated and bounded
- the highest-value shell-adjacent workflow gaps are closed:
  - layered / laminated shell workflows
  - axisymmetric workflows
  - nonlinear / corotational shell depth

### Performance and scale

Already done:
- sparse shell solve viability (dense fallback eliminated, fill ratio 1.8×)
- deterministic assembly and DOF numbering
- residual-based parity testing and benchmark gates

Remaining to close:
- sparse assembly overhead is no longer a dominant cost on medium shell models
- sparse path is extended deeper than `assemble_sparse_3d() + to_dense_symmetric()` in modal, buckling, harmonic, and reduction workflows
- large-model memory/runtime baselines are tracked in CI
- eigensolver debt is resolved

### Verification hardening

Done means:
- benchmark gates exist for the newest advanced solver families
- acceptance models cover the hardest production-style workflows
- invariants, property tests, and fuzzing exist for sparse/shell/contact/constraint paths
- benchmark discipline is part of release quality, not just local testing

### Long-tail nonlinear hardening

Done means:
- hard mixed nonlinear regressions exist and stay green
- convergence behavior is predictable on difficult reference cases
- failure modes are clearer and less solver-path-specific

### Solver-path consistency

Done means:
- dense vs sparse parity is explicitly covered on representative models
- constrained vs unconstrained parity is stable
- mixed frame/shell workflows do not diverge by solver path
- result outputs remain consistent across linear and advanced solver families

## Must-Have Vs Later

### Must-have to become the best open structural solver

- shell endgame maturity
- performance and scale
- verification hardening
- long-tail nonlinear hardening
- solver-path consistency
- constraint-system maturity

### Important after the core claim is secure

- advanced contact maturity
- broader reference benchmark expansion
- model reduction / substructuring workflow maturity
- deeper prestress / staged time-dependent coupling
- specialized shell breadth
- deterministic-behavior and explainability refinement

### Later specialization

- fire / fatigue / specialized lifecycle domains
- membranes / cable nets / specialized tensile structures
- bridge-specific advanced workflows
- broader domain expansion

## Non-Goals Right Now

- no broad multiphysics expansion
- no new specialty domains before shell, scale, verification, and nonlinear hardening are tighter
- no solver-scope expansion driven by product/UI convenience
- no feature-count work ahead of validation, robustness, and scale
- no roadmap drift into a changelog or benchmark ledger

## Related Docs

- [`README.md`](/Users/unbalancedparen/projects/dedaliano/README.md)
  repo entry point and document map
- [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md)
  capability and benchmark evidence
- [`VERIFICATION.md`](/Users/unbalancedparen/projects/dedaliano/VERIFICATION.md)
  verification philosophy and testing stack
- [`PRODUCT_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md)
  app, workflow, market, and product sequencing
