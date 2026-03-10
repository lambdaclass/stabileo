# Dedaliano Positioning

## What Dedaliano Is

Dedaliano is an `open-source structural solver` and an emerging `structural engineering platform`.

Today the strongest identity is:

- browser-native structural modeling and analysis
- open-source solver development
- broad structural mechanics coverage
- unusually deep benchmark and validation culture

The cleanest short description is:

`Dedaliano is an open-source structural analysis and structural mechanics platform for structural engineering.`

The stronger current claim is:

`Dedaliano is becoming one of the strongest open structural solvers, with a broader product surface than most solver-first projects.`

That claim is now supported by more than raw category count:

- latest reported full-suite status of `6371` passing tests and `0` failures
- explicit benchmark-gate suites for constraints, contact, shells, reduction, sparse / conditioning paths, and sparse 3D parity
- solver-core work that now includes constraints, shells, contact, SSI, fiber nonlinear analysis, imperfections, creep / shrinkage, and reduction

## What It Is Not

Dedaliano is not:

- a general-purpose multiphysics platform like Abaqus, ANSYS, or Code_Aster at large
- a generic CAD/BIM replacement
- a full construction-documentation system
- a general CFD, thermal-fluid, or manufacturing simulation stack

The scope should stay structural first.

## Current Product Surface

The current product surface is already broad enough to support a real company narrative:

- browser-native structural modeling and visualization
- a substantial Rust structural solver
- meaningful structural design-check and postprocess modules
- a large public benchmark and validation program

The detailed source of truth for what exists is:

- [`engine/README.md`](/Users/unbalancedparen/projects/dedaliano/engine/README.md) for engine surface
- [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md) for capability, validation, and remaining gaps

## Strategic Advantage

The strongest current differentiators are:

- `Open source`
  The solver and validation story are inspectable and auditable.
- `Browser-native delivery`
  No desktop installation, licensing friction, or heavyweight deployment model.
- `Validation moat`
  The repo already has an unusually large public benchmark surface for this class of product.
- `Platform leverage`
  The same solver can support the web app, APIs, future plugins, single-purpose tools, and design workflows.

The next differentiators are less about adding whole new solver categories and more about:

- robustness on difficult real models
- performance at scale
- benchmark credibility on the newest solver families
- shell and nonlinear workflow maturity
- consistent solver-path behavior across constrained and unconstrained workflows
- benchmark-gated release discipline on the newest solver families
- scale-oriented workflow maturity such as reduction/substructuring and large-model solve discipline
- productizing the full solver surface cleanly across app, API, and downstream tools

That credibility should be built visibly. The strongest long-term trust program is not one technique in isolation, but a stack:

- public benchmark and cross-validation coverage
- invariant and property-based testing
- fuzzing for edge cases and regression discovery
- selective proof-oriented rigor on small critical kernels

This document is about market framing, not the full solver inventory.

## Best Competitive Wedge

Trying to be “the best solver overall” across all simulation categories is too broad.

The strongest winnable positions are:

- best open-source structural solver
- best browser-native structural solver
- best validated structural solver for everyday structural engineering
- best structural solver for building-frame and common office workflows

Near term, the most credible path is:

`elite structural solver first, broader structural platform second`

Those are credible paths. “Best solver in all engineering physics” is not the right target.

## Product Categories Around the Solver

The solver can support several product layers:

- structural analysis application
- structural analysis API
- code-check and design modules
- connection and foundation tools
- report and calculation automation
- BIM / CAD integrations
- optimization and AI-assisted engineering tools
- education and benchmark-explorer products

The right expansion path is:

`best structural solver -> best structural engineering platform`

not:

`best structural solver -> generic simulation company`

## Business Expansion Order

The best expansion order from the current base is:

1. structural solver trust and solver-quality leadership
2. code checks / design modules
3. reports and documentation
4. connections
5. foundations
6. interoperability and BIM-connected workflows
7. optimization / AI-assisted workflows
8. collaboration / firm workflow tooling

This order follows how structural firms buy software:

`can it analyze -> can it design -> can it produce deliverables -> can it fit our workflow`

## Adjacent Markets That Fit

Good adjacent markets:

- building structural engineering
- bridge and staged-construction workflows
- prestress / PT workflows
- foundation and SSI-related workflows
- structural education
- engineering automation and report generation
- structural optimization and design review

Bad adjacent markets for now:

- CFD
- broad thermal-fluid simulation
- manufacturing solids
- electromagnetics
- general multiphysics expansion

## The Role of the Solver

The solver is the core asset.

Business-wise, that means:

- every new structural product can reuse the same mechanics core
- benchmark credibility transfers across products
- design, reporting, and workflow products become higher-margin layers on top of solver trust

This is why solver quality should stay the center of the company narrative.

## Related Docs

- [`README.md`](/Users/unbalancedparen/projects/dedaliano/README.md)
  repo identity and documentation map
- [`engine/README.md`](/Users/unbalancedparen/projects/dedaliano/engine/README.md)
  engine-facing overview and analysis surface
- [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md)
  validation status, solver capability matrix, and benchmark ledger
- [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)
  solver mechanics, validation sequencing, and technical priorities
- [`PRODUCT_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md)
  app, workflow, and market sequencing
