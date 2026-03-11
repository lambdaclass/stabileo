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

- shell-family workflow maturity and selection guidance
- shell-adjacent workflow breadth (layered shells, axisymmetric workflows, nonlinear shell depth)
- shell-family automatic selection policy for product defaults
- solver-path consistency
- diagnostics and explainability
- verification hardening
- performance and scale
- deeper reference-benchmark coverage on the newest advanced paths
- long-tail nonlinear maturity on hard real models

## What Still Separates Dedaliano From The Strongest Open Solvers

Based on the comparison against projects like OpenSees, Code_Aster, and Kratos, the remaining gaps are not “missing the basics.” They are:

1. `Performance / scale maturity`
   Sparse-first 3D is real, but the solver still needs stronger large-model runtime discipline, ordering quality, and broader sparse-path reuse.

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
   `MITC4 + MITC9 + SHB8-ANS` now form a real production shell stack. The remaining shell work is no longer basic shell breadth, but shell-family guidance, frontier benchmarking, workflow hardening, and the next important shell-adjacent capabilities competitors still expose clearly.

This changes the strategic target:

- not `be broader than every open-source mechanics framework`
- but `be the strongest open structural solver product with the deepest visible proof of correctness`

## Ranked Priorities

If the goal is `best open structural solver`, the current priority order is:

1. `Performance and scale`
   Turn sparse-first 3D and current performance infrastructure into real large-model runtime wins.

2. `Verification hardening`
   Keep building the proof moat with:
   - benchmark gates
   - acceptance models
   - invariants
   - property-based tests
   - fuzzing

3. `Long-tail nonlinear hardening`
   Harden the hardest mixed workflows:
   - contact + nonlinear + staging
   - shell + nonlinear interaction
   - difficult convergence edge cases

4. `Solver-path consistency`
   Keep dense vs sparse, constrained vs unconstrained, and mixed shell/frame workflows converging to the same behavior.

5. `Constraint-system maturity`
   Finish chained constraints, connector depth, eccentric workflow polish, and remaining parity gaps.

6. `Advanced contact maturity`
   Push harder convergence, richer contact laws, and tougher mixed contact states.

7. `Diagnostics, model health checks, and explainability`
   Make failures clearer, model issues easier to detect, and hard solves easier to understand.

8. `Reference benchmark expansion`
   Keep growing external-reference proof for contact, fiber 3D, SSI, creep/shrinkage, and broader shell workflows.

9. `Shell-family workflow maturity`
   Keep the shell-family selection guidance current, maintain the frontier-gate benchmarks, and only reopen shell-family expansion if the current stack proves insufficient on practical workflows.

10. `Shell-family automatic selection policy`
   Turn shell-family guidance into explicit rules the UI and model layer can use for automatic defaults, explainable recommendations, and safe override behavior.

11. `Reduction, staged/PT coupling, and other second-tier depth`
    Mature the scale-oriented and long-term workflow layers after the core solver-quality gaps above are tighter.

## Current Sequence

The current near-term sequence is:

1. `Full-model performance work`
   Use acceptance models and workflow benchmarks to drive sparse, parallel, conditioning, and memory improvements on representative models.

2. `Verification hardening`
   Expand:
   - benchmark gates
   - acceptance models
   - invariants
   - property-based tests
   - fuzzing

3. `Long-tail nonlinear hardening`
   Focus on the hardest mixed cases:
   - contact + nonlinear + staging
   - shell + nonlinear interaction
   - difficult convergence edge cases

4. `Solver-path consistency and remaining maturity work`
   Finish:
   - dense vs sparse parity hardening
   - constrained vs unconstrained parity hardening
   - remaining constraint deepening
   - advanced contact maturity
   - clearer solver-side diagnostics and output semantics

5. `Shell-family workflow guidance and frontier tracking`
   Keep the shell-family selection guidance current, maintain the frontier-gate benchmarks, and only reopen shell-family expansion if the current `MITC4 / MITC9 / SHB8-ANS` stack proves insufficient.

6. `Shell-family automatic selection policy`
   Encode shell-family selection rules based on geometry, curvature, topology, distortion, thickness regime, and analysis type so the product can pick defaults automatically and still allow manual override.

## Active Programs

### 1. Shell-Family Maturity

Focus:
- release-gated shell benchmarks (`MITC4`, `MITC9`, and `SHB8-ANS`)
- shell load vectors
- mixed tri/quad and beam-shell workflows
- shell modal and buckling consistency
- distortion tolerance
- shell stress recovery consistency
- shell-family comparative benchmark tables and selection guidance
- shell-family automatic-selection rules for default product behavior

Current status:
- MITC4+EAS-7, MITC9, and SHB8-ANS are all implemented, benchmarked, and part of the production shell stack
- shell-family frontier gates now exist across MITC4, MITC9, and SHB8-ANS
- the shell question is no longer “do we have enough shell breadth?” but “how do we harden and guide the multi-family stack?”

Current remaining shell backlog:
- shell-family selection guidance and explicit “use / avoid” rules for MITC4, MITC9, and SHB8-ANS
- a rule-based shell-family selector for automatic defaults and explainable recommendations
- broader curved/non-planar workflow validation with the multi-family shell stack
- broader shell modal, buckling, and dynamic reference cases across the multi-family shell stack
- better shell diagnostics and output semantics in solver results
- MITC9 corotational extension (deferred)
- layered / laminated shell workflows
- axisymmetric workflows for shells of revolution
- nonlinear / corotational shell workflow depth across the multi-family stack

Known formulation boundary:
- MITC4+EAS-7: efficient for flat and mildly curved shells
- MITC9: higher-order shell path with better accuracy on standard shell benchmarks at lower mesh density
- SHB8-ANS: current answer for the curved/non-planar frontier where flat-faceted shell families are weakest
- shell breadth is no longer the open gap; the remaining shell work is hardening, guidance, and performance across the multi-family stack

Recommended shell order:
1. keep the shell-family selection guidance and frontier gates current
2. add the most important shell-adjacent workflow breadth competitors still expose:
   - layered / laminated shell workflows
   - axisymmetric workflows
   - nonlinear / corotational shell depth
3. turn shell-family guidance into an explicit automatic selection policy for the product layer
4. only reopen shell-family expansion if the current MITC4 / MITC9 / SHB8-ANS stack proves insufficient on practical workflows

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
