# Current Status

This file is the short project snapshot.

This is the `canonical status snapshot` for the repo-level docs.
If an exact top-level test count or current-status sentence needs to live anywhere, it should live here first.

For the proof and detailed capability matrix, see [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md).
For sequencing, see [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md).

Read next:
- proof and evidence: [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md)
- next solver work: [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)
- product execution: [`PRODUCT_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md)

## Solver Snapshot

Latest reported status:

- `5908` passing tests, `0` failures
- explicit CI gate stages for shell benchmarks, shell acceptance models, and constraint benchmarks
- broad 2D and 3D structural analysis coverage
- nonlinear, staged, contact, SSI, fiber, imperfections, and creep/shrinkage support
- modified Newton-Raphson for corotational and fiber nonlinear solvers; useful for moderate material nonlinearity on larger systems, not a universal default — full NR remains more robust in deep plasticity and geometric-nonlinear cases
- sparse Cholesky now survives shell models (dense LU fallback eliminated, 0 perturbations across all tested sizes)
- measured sparse vs dense runtime gains: 4.5× at 700 DOFs, 22× at 2600 DOFs, 77-89× at 5700 DOFs (factorization only); 22× end-to-end at 30×30 MITC4
- sparse wins on all three shell families (MITC4, Quad9, curved) above ~500 DOFs; fill ratio grows from 2.6× to 7.0× with mesh size
- deterministic assembly and DOF numbering (sorted HashMap iterations, merged support constraints)
- parallel element assembly (rayon) wired into the 3D sparse solver path
- sparse assembly is now reused in 3D modal, buckling, harmonic, and reduction workflows, eliminating full dense `n×n` assembly there
- sparse modal 3D, sparse buckling 3D, and sparse harmonic 3D now have real sparse eigensolver paths in the common unconstrained case; modal already shows an `11.8×` measured speedup at `20×20 MITC4`, and harmonic modal response shows a `51.5×` speedup at the same shell size
- measured AMD vs RCM comparison now shows AMD winning materially on fill for larger shell meshes and should be treated as the current default ordering direction
- residual-based sparse vs dense parity testing and benchmark gate coverage
- Guyan and Craig-Bampton now reuse one factorization instead of repeating hundreds of LU decompositions, with measured reduction speedups around `44×`
- design-grade beam station extraction (`extract_beam_stations` / `extract_beam_stations_3d`) with per-combo forces, governing provenance, sign-convention metadata, and snapshot-tested JSON contract; grouped-by-member convenience layer (`extract_beam_stations_grouped` / `extract_beam_stations_grouped_3d`) with member-level governing summaries — unblocks RC design tables and BBS
- strong benchmark, acceptance-model, integration, and differential/parity coverage

At a high level, Dedaliano already has:

- 2D and 3D linear, second-order, buckling, modal, spectrum, time history, and harmonic analysis
- nonlinear frame, fiber, contact, SSI, staged, prestress, imperfections, and creep/shrinkage workflows
- triangular plates and a multi-family shell stack: MITC4, MITC9, SHB8-ANS, and curved shells
- constraint systems, reduction/substructuring, and broad postprocessing/design modules
- a browser-native product surface on top of the solver

That same solver surface can support multiple user layers:
- engineering firms
- students and professors
- design-build / temporary works workflows
- BIM / computational design users
- later, a guardrailed conceptual mode for architects

## Strongest Areas

- broad structural analysis coverage
- unusually visible benchmark and validation discipline
- strong product surface for an open solver project
- multi-family shell stack: MITC4 (ANS + EAS-7), MITC9 (9-node, ANS shear tying), SHB8-ANS solid-shell, and curved shells, benchmark-validated and acceptance-covered
- sparse-first 3D path with measured 22-89× factorization speedups over dense LU, 0 perturbations, deterministic assembly, residual-based parity gates, and parallel element assembly behind a feature flag

## Main Remaining Gaps

The biggest remaining gaps are no longer basic solver categories. They are:

- sparse eigensolver depth and scale
  runtime gains are now measured (22-89× factorization speedup, 22× end-to-end at 30×30), sparse reuse is partly done in modal/buckling/harmonic/reduction, modal and buckling 3D now have real sparse eigensolver paths in the common unconstrained case, and harmonic now has a measured `51.5×` modal-response speedup. The next bottlenecks are deeper sparse eigensolver integration in reduction workflows, buckling runtime measurement on the newer sparse path, and any remaining workflow-specific bottlenecks after the recent harmonic and reduction wins
- shell-family hardening
  MITC4, MITC9, SHB8-ANS, and curved shells are all implemented; remaining work is shell-family guidance, workflow maturity, and broader shell-adjacent behavior rather than missing core shell breadth
- product-layer shell-family defaults
  the app now needs automatic family recommendation/defaulting, explainable “why this family” messaging, and safe override behavior
- verification depth
  more invariants, property tests, fuzzing, and acceptance-model coverage
- long-tail nonlinear hardening
  hard mixed nonlinear workflows and more mature failure behavior
- product surfacing
  deterministic diagnostics and solve timings are now much more valuable in the app with the sparse path healthy
- solver-path consistency
  dense vs sparse, constrained vs unconstrained, shell-family selection, and mixed shell/frame workflows

## Canonical Snapshot Rules

- keep the canonical repo-level test count here
- keep the shortest “where the solver stands now” summary here
- let [`README.md`](/Users/unbalancedparen/projects/dedaliano/README.md) stay qualitative and short
- let [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md) carry the detailed proof and capability matrix

## Next Priorities

1. deeper sparse eigensolver integration — modal, buckling, and harmonic 3D are now partly there; reduction internals are the clearest next sparse-depth target
2. runtime measurement on the newly sparse workflows — keep buckling, harmonic, Guyan, and Craig-Bampton numbers current and use them to drive the next bottleneck fixes
3. verification hardening around the new sparse path — determinism, residual-based parity, fill-ratio gates, sparse modal/buckling/harmonic parity, sparse reduction gates, and no-overbuild expectations
4. long-tail nonlinear hardening — mixed shell/contact/nonlinear/staging edge cases
5. product surfacing — deterministic diagnostics and solve timings become much more valuable in the app now

Within `performance and scale`, the completed and remaining order is:

1. ~~eliminate dense LU fallback on representative shell models~~ — DONE (direct left-looking symbolic Cholesky, two-tier pivot perturbation)
2. ~~improve ordering and reduce fill~~ — DONE (RCM ordering, fill ratio 673× → 2.6-7.0× depending on mesh size)
3. ~~measure real full-model runtime gains~~ — DONE (22-89× factorization speedup, 22× end-to-end at 30×30 MITC4, all three shell families measured)
4. ~~cut sparse assembly overhead (`from_triplets` / duplicate compaction, `k_ff`-only assembly where possible)~~ — DONE
5. ~~extend sparse path into modal, buckling, harmonic, and reduction solvers~~ — PARTLY DONE (sparse assembly reused there; modal, buckling, and harmonic 3D now have sparse eigensolver paths in the common unconstrained case, and Guyan / Craig-Bampton reuse one factorization instead of repeated LU)
6. ~~compare AMD vs RCM and set the default ordering policy from measured fill/runtime data~~ — DONE (AMD currently wins materially on fill for larger shell meshes)
7. measure runtime on the newly sparse modal/buckling/harmonic/reduction workflows and keep those gates current
8. ~~fix the Lanczos tridiagonal eigensolver debt~~ — DONE
9. deepen sparse shift-invert / sparse eigensolver integration, especially in reduction workflows
10. iterative refinement and Krylov solvers

## Working Description

`Dedaliano is becoming one of the strongest open structural solvers, with a broader product surface than most solver-first projects.`
