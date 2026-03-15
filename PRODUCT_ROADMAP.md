# Dedaliano Product Roadmap

## Purpose

This document is the `product roadmap`.

Read next:
- current snapshot: [`CURRENT_STATUS.md`](/Users/unbalancedparen/projects/dedaliano/CURRENT_STATUS.md)
- solver execution order: [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)
- market framing: [`POSITIONING.md`](/Users/unbalancedparen/projects/dedaliano/POSITIONING.md)
- RC design/BBS research: [`research/rc_design_and_bbs.md`](/Users/unbalancedparen/projects/dedaliano/research/rc_design_and_bbs.md)

It is for:
- app and workflow features
- market sequencing
- product packaging
- design/reporting/interoperability layers
- collaboration and distribution priorities

It is not the solver mechanics roadmap.
For that, see [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md).

This document should stay forward-looking.
Historical progress belongs in [`CHANGELOG.md`](/Users/unbalancedparen/projects/dedaliano/CHANGELOG.md).

## Product Thesis

Dedaliano should win in this order:

1. structural solver trust
2. code checks and design modules
3. reports and documentation
4. connections
5. foundations
6. interoperability and BIM-connected workflows
7. optimization and AI-assisted workflows
8. collaboration and firm workflow tooling

That matches how structural firms buy software:

`can it analyze -> can it design -> can it produce deliverables -> can it fit our workflow`

## Users We Can Support

The same solver can support different user groups, but they need different product layers:

- structural and civil engineers
  full analysis, design, diagnostics, reports, and office workflows
- engineering firms
  templates, repeatable workflows, QA, reports, and interoperability
- students and professors
  onboarding, examples, benchmark explorer, and educational surfaces
- design-build / contractors / temporary works teams
  staged workflows, rapid reporting, and simple pass/fail communication
- BIM / computational design users
  interoperability, import/export, and API hooks
- researchers / verification users
  benchmark visibility, solver settings, exports, and reproducibility
- architects
  only as a later conceptual structural mode with strong guardrails, not as the default product surface

## Current Product Surface

Already present:

- browser-native 2D/3D modeling and visualization
- Rust solver in the main app flow through WASM
- broad results, postprocessing, and design-check coverage
- benchmark and validation story strong enough to support a product-quality narrative
- diagnostics and solver warnings surfaced in the results flow
- results-store support for constraint forces, assembly diagnostics, and solver diagnostics
- results-table diagnostics sub-tab and solve-time warning toasts for important issues such as negative Jacobians

Still productizing:

- richer diagnostics UX in the app/API
- constraint-force presentation in the results experience
- click-to-focus and visual highlighting for problematic elements
- shell-family recommendation and automatic default selection in modeling workflows
- stronger onboarding and first-solve success
- report and deliverable workflows
- broader workflow packaging around the full solver surface
- deeper collaboration and firm-facing features
- smoother interoperability and downstream integrations

## Product Layers By User Need

- `Engineers and firms`
  diagnostics, code checks, RC member design and reinforcement schedules, reports, connections, foundations, templates, interoperability, and explainable element-family defaults
- `Education`
  first-solve success, examples, benchmark explorer, explanatory views
- `Design-build / temporary works`
  staged workflows, fast results communication, deliverable generation
- `BIM / computational design`
  import/export, API packaging, geometry-model exchange
- `Architects`
  later conceptual structural mode with defaults, visual feedback, and guardrails

## Near-Term Product Priorities

### Phase A: Trusted WASM Runtime

Before pushing more product breadth, the browser app needs one trusted solver runtime:

- make Rust/WASM the reliable primary execution path in production
- verify the deployed branch/build/artifacts match what the team thinks is live
- harden 3D solve, worker solve, and combinations/multi-case execution in the shipped app
- fix frontend/WASM boundary issues before removing the TypeScript solver runtime backup
- once stable, converge to a single production solver path instead of maintaining JS/WASM ambiguity

ROI order for users:
1. stable analysis they can trust
2. design outputs they can use daily
3. reports and deliverables they can issue
4. diagnostics that reduce failure/debug time
5. workflow polish and breadth after the above are solid

### 0-3 months

| Priority | Topic | Why now |
|---|---|---|
| 1 | WASM path reliability in production | The app needs a single trusted solver path before more breadth work. Fix build/deploy/runtime mismatches, worker issues, and 3D solve traps so the shipped product is stable. |
| 2 | RC beam design and reinforcement schedule | This is the highest-ROI analysis-to-deliverable loop for everyday structural work: turn envelopes into required steel, selected bars, stirrups, and schedule-ready output. |
| 3 | Report and calculation-document foundations | Solver trust turns into paid usage only when firms can produce deliverables. |
| 4 | Onboarding and first-solve success | The fastest way to grow usage is to make the first successful solve easy, obvious, and low-friction. |
| 5 | Richer diagnostics UX | Better grouping, filtering, provenance, and visibility reduce support burden and user confusion. |
| 6 | Constraint-force and governing-result presentation | Users need coherent reactions, constraint forces, provenance, and governing outputs they can explain and trust. |
| 7 | Click-to-focus and visual highlighting | Linking diagnostics and warnings to the affected elements shortens debug loops. |
| 8 | Shell-family recommendation and automatic defaults | The solver now has multiple shell families; the product should recommend `MITC4`, `MITC9`, `SHB8-ANS`, or triangular shells automatically, explain why, and allow safe override. |
| 9 | Public benchmark and acceptance-model presentation | Make the trust story legible to users, customers, and evaluators. |
| 10 | Shell/contact/constrained workflow usability | Turn the newest solver capabilities into practical workflows that feel coherent in the app. |
| 11 | Performance feedback in the UI | Progress, iteration counts, and slow-phase visibility make large-model solves feel much more mature. |

### 3-6 months

| Priority | Topic | Why now |
|---|---|---|
| 12 | Graphical BBS drawing generation | After the tabular reinforcement schedule works, add bending-shape drawings, dimensions, hook semantics, and schedule-ready graphics. |
| 13 | Code-check packaging and workflow polish | The solver already supports a broad design-check layer; the next step is turning it into a cleaner end-user workflow. |
| 14 | Connections and foundations productization | These are natural downstream layers on top of solver outputs. |
| 15 | Interoperability and import/export improvements | Lower switching friction and fit existing office workflows. |
| 16 | Project, template, and repeatable workflow support | Help firms standardize how they use the solver. |
| 17 | Education and benchmark-explorer product surface | A strong distribution and trust channel with minimal solver rework. |
| 18 | API packaging | The engine is reusable; packaging it cleanly opens additional product and enterprise paths. |
| 19 | Conceptual structural mode for architects | Valuable as a later product layer for early-stage structural feedback, but only after the core engineering workflow is stronger. |

### 12 months+

| Priority | Topic | Why later |
|---|---|---|
| 16 | Collaboration and server-backed project workflows | High value, but should build on a stable single-user core. |
| 17 | Enterprise permissions, audit, and administration | Useful once adoption grows inside firms. |
| 18 | Optimization and AI-assisted workflow layer | Best added after solver trust and core workflow maturity are strong. |
| 19 | Broader structural platform expansion | Additional downstream tools should follow a strong core product, not lead it. |

## Delivery Phases

### Phase 1: Solver-Led Product

Focus:
- trustworthy browser-native analysis
- easy first successful solve
- visible diagnostics and warnings
- clean results and constraint-force surface
- RC beam design and reinforcement schedule output from analysis envelopes
- report and calculation-document foundations
- actionable diagnostics tied back to the model
- shell-family recommendations with explainable defaults and safe override
- benchmark-backed trust story

Goal:
Be the most accessible serious structural solver for everyday structural engineering.

### Phase 2: Deliverable Layer

Focus:
- code checks
- graphical BBS and schedule/document outputs
- reports
- calculation packages
- connections and foundations packaging

Goal:
Move from “can analyze” to “can support paid engineering work.”

### Phase 3: Workflow Layer

Focus:
- interoperability
- reusable project templates
- education and benchmark explorer
- API packaging
- architect-friendly conceptual structural mode

Goal:
Fit into real firm workflows, broaden adoption, and open adjacent non-engineer surfaces carefully.

### Phase 4: Platform Layer

Focus:
- collaboration
- enterprise controls
- optimization/AI workflows
- broader structural engineering stack

Goal:
Turn the solver and app into a broader structural engineering platform.

## What Not To Do Early

Do not prioritize these before the core product is clearly trusted:

- generic multiphysics expansion
- CFD or thermal-fluid products
- overly broad enterprise features before single-user workflow quality is strong
- AI features that outrun solver trust
- architect-friendly conceptual mode before onboarding, diagnostics, deliverables, and interoperability are stronger

## Related Docs

- [`README.md`](/Users/unbalancedparen/projects/dedaliano/README.md)
  repo entry point and document map
- [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)
  solver mechanics and validation sequencing
- [`POSITIONING.md`](/Users/unbalancedparen/projects/dedaliano/POSITIONING.md)
  market framing and competitive wedge
