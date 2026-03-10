# Dedaliano Product Roadmap

## Purpose

This document is the `product roadmap`.

It is for:
- app and workflow features
- market sequencing
- product packaging
- design/reporting/interoperability layers
- collaboration and distribution priorities

It is not the solver mechanics roadmap.
For that, see [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md).

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

## Current Product Surface

Already present:

- browser-native 2D/3D modeling and visualization
- Rust solver in the main app flow through WASM
- broad results, postprocessing, and design-check coverage
- benchmark and validation story strong enough to support a product-quality narrative

Still productizing:

- diagnostics surfaced cleanly in the app/API
- report and deliverable workflows
- broader workflow packaging around the full solver surface
- deeper collaboration and firm-facing features
- smoother interoperability and downstream integrations

## Near-Term Product Priorities

### 0-3 months

| Priority | Topic | Why now |
|---|---|---|
| 1 | Surface solver diagnostics in the app/API | The solver already produces diagnostics; showing them clearly gives immediate user value and makes the newest solver work visible. |
| 2 | Results UX for diagnostics and constraint forces | Add a diagnostics tab, warnings panel, and clean result presentation before richer canvas integrations. |
| 3 | Shell/contact/constrained workflow usability | Turn the newest solver capabilities into practical workflows that feel coherent in the app. |
| 4 | Report and calculation-document foundations | Solver trust converts into revenue more easily when firms can produce deliverables. |
| 5 | Public benchmark and acceptance-model presentation | Make the trust story legible to users, customers, and evaluators. |
| 6 | Performance feedback in the UI | Progress, iteration counts, and slow-phase visibility make large-model solves feel much more mature. |

### 3-6 months

| Priority | Topic | Why now |
|---|---|---|
| 7 | Code-check packaging and workflow polish | The solver already supports a broad design-check layer; the next step is turning it into a cleaner end-user workflow. |
| 8 | Connections and foundations productization | These are natural downstream layers on top of solver outputs. |
| 9 | Interoperability and import/export improvements | Lower switching friction and fit existing office workflows. |
| 10 | Project, template, and repeatable workflow support | Help firms standardize how they use the solver. |
| 11 | Education and benchmark-explorer product surface | A strong distribution and trust channel with minimal solver rework. |
| 12 | API packaging | The engine is reusable; packaging it cleanly opens additional product and enterprise paths. |

### 12 months+

| Priority | Topic | Why later |
|---|---|---|
| 13 | Collaboration and server-backed project workflows | High value, but should build on a stable single-user core. |
| 14 | Enterprise permissions, audit, and administration | Useful once adoption grows inside firms. |
| 15 | Optimization and AI-assisted workflow layer | Best added after solver trust and core workflow maturity are strong. |
| 16 | Broader structural platform expansion | Additional downstream tools should follow a strong core product, not lead it. |

## Delivery Phases

### Phase 1: Solver-Led Product

Focus:
- trustworthy browser-native analysis
- visible diagnostics
- clean results surface
- benchmark-backed trust story

Goal:
Be the most accessible serious structural solver for everyday structural engineering.

### Phase 2: Deliverable Layer

Focus:
- code checks
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

Goal:
Fit into real firm workflows and broaden adoption.

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

## Related Docs

- [`README.md`](/Users/unbalancedparen/projects/dedaliano/README.md)
  repo entry point and document map
- [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)
  solver mechanics and validation sequencing
- [`POSITIONING.md`](/Users/unbalancedparen/projects/dedaliano/POSITIONING.md)
  market framing and competitive wedge
