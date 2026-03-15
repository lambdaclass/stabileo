# AI Structural Engineering Roadmap

## Purpose

This note separates `AI-assisted engineering`, `platform-scale AI`, and `research frontier AI` so the main product and solver roadmaps stay linear.

The key rule is:

- early AI should ride on today's trusted solver outputs
- later AI should wait for stronger solver depth, batch infrastructure, and data contracts

AI is not the moat by itself. The moat is:

1. trusted solver
2. trusted outputs and diagnostics
3. trusted workflows and deliverables
4. then AI on top of that

## Near-Term AI

These can ship on top of the current solver direction, provided the diagnostics and result contracts are structured enough.

### 1. AI-assisted warning explanation

Examples:

- "this shell has a negative Jacobian because nodes 3 and 4 are swapped"
- "this diaphragm constraint likely over-stiffens the floor"
- "this member is unstable because both ends are effectively released"

Needs:

- stable diagnostic codes
- severity levels
- element/member/node references
- reproducible solver-run artifacts

### 2. Natural-language result queries

Examples:

- "what is the max moment in beam 7?"
- "which column has the highest utilization?"
- "what load combination governs the roof drift?"

Needs:

- query-ready result summaries
- governing-case metadata
- stable member IDs and labels
- result indexing that the UI does not recompute ad hoc

### 3. AI-assisted section suggestion

Examples:

- suggest a lighter steel section
- identify members that are over-conservative
- suggest RC member changes from utilization and bar congestion

Needs:

- utilization inputs
- section/material libraries
- code-check outputs
- simple economy heuristics

### 4. AI-assisted load and code guidance

Examples:

- suggest required load combinations from the selected code
- flag missing accidental torsion or pattern loading
- explain why a member fails under one code but passes under another

Needs:

- code/load metadata contracts
- rule-based code layer
- load provenance

### 5. AI-assisted review workflows

Examples:

- reviewer summary of the top suspicious model issues
- explanation of soft-story and torsional irregularity flags
- suggested next checks after a nonlinear or dynamic run

Needs:

- structured diagnostics
- comments/annotation-ready references
- report-grade provenance

## Mid-Term AI

These are product features, but they need a more mature solver/product stack than the near-term AI surfaces.

### 1. Design iteration assistant

Examples:

- compare multiple section-sizing variants
- propose drift vs weight tradeoffs
- recommend retrofit moves for a failing scheme

Needs:

- stable code-check workflows
- stronger batch execution
- project-level comparison surfaces

### 2. Nonlinear and dynamic result interpretation

Examples:

- explain unusual hysteresis
- detect likely soft-story mechanisms
- summarize modal participation and response anomalies

Needs:

- stronger dynamic/nonlinear product flows
- result provenance and structured summaries
- stable benchmarked nonlinear depth

### 3. AI-assisted review and collaboration

Examples:

- reviewer asks questions over a shared model
- AI summarizes what changed between two versions
- AI produces a design-review checklist from the current model

Needs:

- lightweight collaboration
- model/version diff
- comments and review state

## Late AI / Platform AI

These should not be pulled early. They depend on solver depth, batch infrastructure, and a larger product surface.

### 1. Automated design iteration with Pareto fronts

Examples:

- cost vs drift vs embodied carbon
- steel tonnage vs fabrication simplicity
- RC quantity vs utilization margin

Needs:

- repeatable batch runner
- deterministic multi-run outputs
- optimization infrastructure

### 2. Generative structural layout

Examples:

- given architectural constraints, generate viable structural systems
- rank frame, core, diagrid, and long-span options

Needs:

- stronger configurators
- optimization/batch execution
- richer structural typology priors

### 3. GNN / surrogate workflows

Examples:

- fast parametric approximations
- screening before full solve
- repeated design-space exploration

Needs:

- large clean training sets
- batch infrastructure
- parity and trust checks against the real solver

### 4. Natural language to model

Examples:

- "8-storey RC frame, seismic zone 4, soft soil"
- "20 m pipe rack with crane load and wind combinations"

Needs:

- strong typology/configurator layer
- trusted code/load defaults
- geometry and workflow guardrails

## Research Frontier

These should be tracked, but not treated as near-term roadmap promises.

### 1. Reinforcement-learning design agents

Potential:

- policy learns to size and revise structures by repeated solver interaction

Why later:

- expensive
- data-hungry
- hard to trust without strong replayability and evaluation

### 2. Structural foundation models

Potential:

- pretrained engineering reasoning over model + results + code + reports

Why later:

- needs very large structured data
- depends on stable contracts and product telemetry

### 3. Autonomous inspection / digital-twin loops

Potential:

- CV damage detection
- Bayesian model updating
- remaining-life and repair recommendation

Why later:

- depends on sensor/inspection workflows beyond the core roadmap

## Solver And Data Prerequisites

AI should not move faster than these prerequisites:

1. structured diagnostics with stable codes
2. governing-case extraction and result provenance
3. query-ready result summaries
4. stable payload contracts across WASM/native
5. batch/headless execution for optimization and comparison
6. deterministic replay and build provenance

## What Competitors Automate Vs What They Do Not

### Mostly catch-up automation

- code load generation
- code combinations
- utilization ratios
- report generation
- partial section suggestions

### Places Dedaliano can lead

1. AI-assisted model review on structured diagnostics
2. natural-language result queries over governing data
3. global section optimization across the whole structure
4. live multi-code comparison for the same structure
5. generative structural layout on top of a trusted browser-native solver

## Recommended AI Order

1. warning explanation
2. result queries
3. code/load guidance
4. section suggestion
5. review assistant
6. nonlinear/dynamic interpretation
7. design iteration assistant
8. generative / optimization AI
9. surrogates
10. frontier research bets
