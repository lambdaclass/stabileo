# Dedaliano Solver Roadmap

## Purpose

This document is the `solver roadmap`.

It is for:
- solver mechanics
- numerical robustness
- validation and benchmark sequencing
- verification strategy sequencing
- performance and scale work

It is not the product, market, or revenue roadmap.
For that, see [`PRODUCT_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md).

For current capability and validation status, see [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md).

## Current State

The solver is already broad and serious:

- 2D and 3D linear, second-order, buckling, modal, spectrum, time history, and harmonic analysis
- corotational, material nonlinear, fiber nonlinear, contact, SSI, staged, prestress, imperfections, and creep/shrinkage workflows
- plate and shell support including DKT/DKMT triangles and MITC4 quads
- constraints, reduction/substructuring, and broad postprocessing/design support
- explicit benchmark gates and acceptance models

The main remaining work is no longer missing basic solver categories.
It is:

- shell workflow maturity
- solver-path consistency
- diagnostics and explainability
- verification hardening
- performance and scale
- deeper reference-benchmark coverage on the newest advanced paths

Recent milestones that changed the priority order:

- shell benchmark hardening is materially complete
- shell acceptance models are in place
- diagnostics now propagate through solver result types
- constraint-force output is broadly propagated across solver families
- reference benchmark validation is materially in place for shells, contact, fiber 3D, SSI, imperfections, creep/shrinkage, reduction, and constraints

## Current Sequence

The current near-term sequence is:

1. `Shell benchmark and acceptance gates`
   Make shell benchmark and shell acceptance suites explicit release gates.

2. `Shell-driven mechanics fixes`
   Use those gates to drive targeted fixes in:
   - load vectors
   - modal/buckling consistency
   - distortion tolerance
   - mixed tri/quad and beam-shell workflows
   - stress-recovery consistency

3. `Diagnostics surfaced in the app/API`
   Solver-side diagnostics exist; the next step is making them visible and actionable in the product surface.

4. `Remaining constraint deepening`
   Finish the last workflow-completeness items such as:
   - chained constraints
   - connector depth
   - eccentric workflow polish
   - any remaining cross-solver parity gaps

5. `Reference benchmark expansion`
   Keep extending external-reference coverage for:
   - contact
   - fiber 3D
   - SSI
   - creep/shrinkage
   - broader shell workflows

6. `Full-model performance work`
   Use acceptance models and workflow benchmarks to drive sparse, parallel, conditioning, and memory improvements on representative models.

## Priority Stack

### 0-3 months

| Priority | Topic | Why now |
|---|---|---|
| 1 | Shell release gates and workflow hardening | Shell benchmark hardening is materially complete; the next step is to make those suites release-grade and use them to drive targeted shell fixes and broader workflow maturity. |
| 2 | Diagnostics surfaced in the app/API | Diagnostics now exist in solver outputs; exposing them cleanly is the fastest product-quality multiplier attached to the latest solver work. |
| 3 | Constraint-system reuse and workflow maturity | Reusable constrained reductions now exist; the next step is consistent use across solver families plus the last remaining workflow gaps. |
| 4 | Verification hardening | Expand invariants, property-based tests, fuzzing, benchmark gates, and acceptance models around the newest solver families. |
| 5 | Performance and scale engineering | Sparse assembly, conditioning diagnostics, and parallel paths now exist; the next step is full-model performance wins. |
| 6 | Advanced contact variants | Basic and advanced contact are present; the next layer is harder convergence cases, richer contact laws, and broader benchmark depth. |
| 7 | Acceptance-model expansion | The acceptance suite is now real; the next step is to grow it carefully around the hardest workflows. |
| 8 | Failure diagnostics and model health checks | Better warnings, pre-solve checks, and conditioning/reporting can make the solver feel dramatically more mature in practice. |

### 3-6 months

| Priority | Topic | Why now |
|---|---|---|
| 9 | Remaining constraint deepening | Chained constraints, connector depth, eccentric workflows, and any remaining cross-solver parity gaps should be finished once the shell-driven stabilization pass settles. |
| 10 | Reference benchmark expansion | Keep extending external-reference coverage as new solver paths and deeper shell/contact/fiber/SSI workflows land. |
| 11 | Model reduction / substructuring workflow maturity | Valuable once the core nonlinear and shell stack is hardened. |
| 12 | Deeper prestress / staged time-dependent coupling | Prestress exists; long-term staged PT workflows still need more coupling depth. |
| 13 | Specialized shell breadth | Curved shells, broader mixed interpolation, folded-plate workflows, and wider production shell coverage remain a real solver program after the current shell stabilization pass. |
| 14 | Deterministic behavior and numerical robustness policy | Convergence criteria, warnings, fallback behavior, and solver-path consistency should become standardized across the engine. |
| 15 | Result explainability and solve progress | Engineers need clearer iteration/progress visibility, active-set/yield reporting, and balance diagnostics on hard models. |
| 16 | Golden acceptance-model suite | A very small flagship set of public must-pass models should become part of the trust story. |

### 12 months+

| Priority | Topic | Why later |
|---|---|---|
| 17 | Fire / fatigue / specialized lifecycle domains | Important, but no longer core to claiming an elite mainstream structural solver. |
| 18 | Membranes / cable nets / specialized tensile structures | Valuable for long-span specialty markets rather than mainstream parity. |
| 19 | Bridge-specific advanced workflows | High-value specialization once the core solver is fully hardened. |
| 20 | Broader domain expansion | Additional specialty areas should come after the mainstream structural core is clearly dominant. |

## Four Active Programs

### 1. Shell Maturity

Focus:
- release-gated shell benchmarks
- shell load vectors
- mixed tri/quad and beam-shell workflows
- shell modal and buckling consistency
- distortion tolerance
- shell stress recovery consistency

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

### 3. Verification Hardening

Focus:
- benchmark gates
- acceptance models
- invariants
- property-based tests
- fuzzing
- differential consistency tests

Why it matters:
This is how the solver becomes visibly trustworthy rather than merely feature-rich.

### 4. Performance and Scale

Focus:
- workflow benchmarks
- sparse and parallel wins
- conditioning diagnostics
- memory and runtime discipline on representative full models

Why it matters:
A solver is not elite if it only works well on small clean examples.

## Ten Next Tasks

1. Make shell benchmark and shell acceptance suites hard CI/release gates.
2. Fix shell issues exposed by those gates.
3. Surface diagnostics cleanly in the app/API.
4. Finish remaining constraint deepening.
5. Expand external-reference validation for contact.
6. Expand external-reference validation for fiber 3D.
7. Expand external-reference validation for SSI.
8. Expand external-reference validation for creep/shrinkage.
9. Use acceptance/workflow models to drive full-model performance work.
10. Grow the acceptance and verification layers carefully.

## Related Docs

- [`README.md`](/Users/unbalancedparen/projects/dedaliano/README.md)
  repo entry point and document map
- [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md)
  capability and benchmark evidence
- [`VERIFICATION.md`](/Users/unbalancedparen/projects/dedaliano/VERIFICATION.md)
  verification philosophy and testing stack
- [`PRODUCT_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md)
  app, workflow, market, and product sequencing
