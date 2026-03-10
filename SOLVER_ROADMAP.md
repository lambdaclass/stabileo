# Dedaliano Solver Roadmap

## Purpose

This document is the `solver roadmap`.

Read next:
- current snapshot: [`CURRENT_STATUS.md`](/Users/unbalancedparen/projects/dedaliano/CURRENT_STATUS.md)
- current proof and capability status: [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md)
- verification method: [`VERIFICATION.md`](/Users/unbalancedparen/projects/dedaliano/VERIFICATION.md)

It is for:
- solver mechanics
- numerical robustness
- validation and benchmark sequencing
- verification strategy sequencing
- performance and scale work

It is not the product, market, or revenue roadmap.
For that, see [`PRODUCT_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md).

For current capability and validation status, see [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md).

This document should stay forward-looking.
Historical progress belongs in [`CHANGELOG.md`](/Users/unbalancedparen/projects/dedaliano/CHANGELOG.md).

## Current Frontier

The main remaining work is no longer missing basic solver categories. It is:

- shell family maturity and workflow maturity
- solver-path consistency
- diagnostics and explainability
- verification hardening
- performance and scale
- deeper reference-benchmark coverage on the newest advanced paths
- long-tail nonlinear maturity on hard real models

## What Still Separates Dedaliano From The Strongest Open Solvers

Based on the comparison against projects like OpenSees, Code_Aster, and Kratos, the remaining gaps are not “missing the basics.” They are:

1. `Shell endgame maturity`
   Strong MITC4 coverage now exists, and MITC9 has started to open a broader shell-family path. Broader curved-shell workflows, distortion robustness, MITC9 maturity, and the remaining non-planar shell formulation boundary still separate Dedaliano from the strongest mature shell stacks.

2. `Long-tail nonlinear maturity`
   More years of hardened edge cases are still needed in mixed nonlinear workflows:
   - contact + nonlinear + staging
   - shell + nonlinear interaction
   - difficult convergence cases

3. `Performance / scale maturity`
   Sparse-first 3D is now real, but the solver still needs stronger large-model runtime discipline, ordering quality, and broader sparse-path reuse.

4. `Full solver-path consistency`
   Dense vs sparse, constrained vs unconstrained, shell vs frame-shell mixed, and advanced nonlinear paths must keep converging to the same behavior.

5. `Benchmark moat expansion`
   Dedaliano is already strong here, but broader external-reference proof is also the most realistic path to becoming the best open structural solver.

This changes the strategic target:

- not `be broader than every open-source mechanics framework`
- but `be the strongest open structural solver product with the deepest visible proof of correctness`

## Ranked Priorities

If the goal is `best open structural solver`, the current priority order is:

1. `Shell endgame maturity`
   Finish the remaining shell program cleanly:
   - curved-shell validation
   - distortion robustness
   - shell workflow completeness
   - MITC9 maturity across postprocessing, mass, geometric stiffness, and validation
   - clear decision on whether MITC9 is sufficient or whether an even broader shell family is justified later

2. `Performance and scale`
   Turn sparse-first 3D and current performance infrastructure into real large-model runtime wins.

3. `Verification hardening`
   Keep building the proof moat with:
   - benchmark gates
   - acceptance models
   - invariants
   - property-based tests
   - fuzzing

4. `Long-tail nonlinear hardening`
   Harden the hardest mixed workflows:
   - contact + nonlinear + staging
   - shell + nonlinear interaction
   - difficult convergence edge cases

5. `Solver-path consistency`
   Keep dense vs sparse, constrained vs unconstrained, and mixed shell/frame workflows converging to the same behavior.

6. `Constraint-system maturity`
   Finish chained constraints, connector depth, eccentric workflow polish, and remaining parity gaps.

7. `Advanced contact maturity`
   Push harder convergence, richer contact laws, and tougher mixed contact states.

8. `Diagnostics, model health checks, and explainability`
   Make failures clearer, model issues easier to detect, and hard solves easier to understand.

9. `Reference benchmark expansion`
   Keep growing external-reference proof for contact, fiber 3D, SSI, creep/shrinkage, and broader shell workflows.

10. `Reduction, staged/PT coupling, and other second-tier depth`
    Mature the scale-oriented and long-term workflow layers after the core solver-quality gaps above are tighter.

## Current Sequence

The current near-term sequence is:

1. `Shell benchmark and acceptance gates`
   Keep shell benchmark and shell acceptance suites as explicit release gates, now covering both MITC4 and the emerging MITC9 path.

2. `Shell-driven mechanics fixes`
   Use those gates to drive targeted fixes in:
   - load vectors
   - modal/buckling consistency
   - distortion tolerance
   - mixed tri/quad and beam-shell workflows
   - stress-recovery consistency
   - MITC9 postprocessing/dynamics/stability maturity

3. `Full-model performance work`
   Use acceptance models and workflow benchmarks to drive sparse, parallel, conditioning, and memory improvements on representative models.

4. `Verification hardening`
   Expand:
   - benchmark gates
   - acceptance models
   - invariants
   - property-based tests
   - fuzzing

5. `Long-tail nonlinear hardening`
   Focus on the hardest mixed cases:
   - contact + nonlinear + staging
   - shell + nonlinear interaction
   - difficult convergence edge cases

6. `Solver-path consistency and remaining maturity work`
   Finish:
   - dense vs sparse parity hardening
   - constrained vs unconstrained parity hardening
   - remaining constraint deepening
   - advanced contact maturity
   - clearer solver-side diagnostics and output semantics

## Active Programs

### 1. Shell Maturity

Focus:
- release-gated shell benchmarks
- shell load vectors
- mixed tri/quad and beam-shell workflows
- shell modal and buckling consistency
- distortion tolerance
- shell stress recovery consistency
- MITC9 maturity and comparative validation against MITC4 boundaries

Current remaining shell backlog:
- curved-shell workflow validation (broader: folded plates, conical, hyperbolic)
- broader shell modal, buckling, and dynamic reference cases
- better shell diagnostics and output semantics in solver results
- MITC9 postprocessing, mass, geometric stiffness, and validation maturity
- MITC9-vs-MITC4 benchmark comparisons on curved/non-planar shell cases

Known formulation boundary:
- MITC4 with ANS and EAS-7 is now materially stronger and benchmark-gated
- the pinched hemisphere, Raasch hook, and twisted beam remain known curved/non-planar shell limits for the MITC4 family
- MITC9 is now the active next shell-family candidate and should be treated as `implemented and validating` until the benchmark pack is green
- the next decision is whether to:
  - stop at a well-bounded `MITC4 + MITC9` shell stack
  - or introduce an even broader shell family later

Recommended shell order:
1. broader curved-shell validation (beyond Scordelis-Lo and pinched cylinder)
2. MITC9 validation and maturity on the curved/non-planar cases MITC4 bounds out on
3. only then decide whether the remaining shell gap justifies a broader shell family beyond MITC9

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
- workflow benchmarks
- sparse and parallel wins
- conditioning diagnostics
- memory and runtime discipline on representative full models

Current status:
- sparse-first 3D assembly is live for plates, quads, and frames (models with 64+ free DOFs)
- residual-checked Cholesky fallback to dense LU catches silent ill-conditioning failures
- memory benchmarks show 11-22x reduction on representative 10×10 to 15×15 shell models
- relative pivot threshold in sparse Cholesky catches near-singular matrices earlier

Next steps:
- runtime criterion benchmarks for dense-vs-sparse 3D wall-clock comparison
- better AMD ordering (consider external crate or improved heuristic)
- parallel element loop for sparse 3D assembly (rayon behind `parallel` feature flag)
- sparse extraction for buckling/modal 3D solvers (extend sparse path beyond linear solve)

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

### Shell endgame maturity

Done means:
- curved-shell validation sets are in place and passing
- distortion and warp studies are gated and bounded
- shell workflow completeness cases are covered
- MITC9 is either benchmarked and accepted as part of the production shell stack, or its remaining gap is explicitly documented
- the `bounded MITC4/MITC9 stack vs broader shell family` decision is explicitly documented

### Performance and scale

Done means:
- sparse 3D shows repeatable runtime wins on representative full models
- ordering is no longer an obvious known bottleneck
- large-model memory/runtime baselines are tracked
- sparse-path behavior is reliable on the intended 3D workflows

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
