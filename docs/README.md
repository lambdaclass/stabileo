# Stabileo Docs

Start here:

- [Quick start](QUICKSTART.md)
- [AI modeling workflow](AI_MODELING_WORKFLOW.md)
- [Solver reference](SOLVER_REFERENCE.md)

Stabileo's docs are organized around the same idea that makes the product legible:

- `learn the workflow`
- `understand the conventions`
- `inspect the solver surface`

The point is not just "there is a solver." The point is that the solver, the browser app, and the AI workflows all share one structured model surface.

## Read First

### 1. Quick start

Use [QUICKSTART.md](QUICKSTART.md) if you want the shortest path from empty canvas to a solved structure.

### 2. AI modeling workflow

Use [AI_MODELING_WORKFLOW.md](AI_MODELING_WORKFLOW.md) if you want to understand how natural-language build/edit/review flows connect to the actual solver.

### 3. Solver reference

Use [SOLVER_REFERENCE.md](SOLVER_REFERENCE.md) for the conventions that matter:

- coordinate system and axis contract
- model objects
- loads, supports, and result fields
- where the browser app, Rust engine, and AI backend meet

## Core Concepts

- [ADR 0001: Z-up coordinate system](adr/0001-z-up-coordinate-system.md)
- [VERIFICATION.md](VERIFICATION.md)
- [BENCHMARKS.md](BENCHMARKS.md)
- [POSITIONING.md](POSITIONING.md)

## Engine and Product Surfaces

- [engine/README.md](../engine/README.md)
- [CURRENT_STATE_STABILEO.md](CURRENT_STATE_STABILEO.md)
- [CHANGELOG.md](../CHANGELOG.md)

## Roadmaps

- [SOLVER_ROADMAP.md](roadmap/SOLVER_ROADMAP.md)
- [PRODUCT_ROADMAP.md](roadmap/PRODUCT_ROADMAP.md)
- [INFRASTRUCTURE_ROADMAP.md](roadmap/INFRASTRUCTURE_ROADMAP.md)
- [AI_ROADMAP.md](roadmap/AI_ROADMAP.md)

## Research

Use [research/README.md](research/README.md) when you want deeper background on shell selection, solver architecture, safety hardening, competitor gaps, and AI/provider boundaries.
