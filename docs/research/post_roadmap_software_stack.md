# Post-Roadmap Software Stack

This note captures the best software products to build if Dedaliano executes the core solver and product roadmap well.

The key idea is:

- do not build "another generic solver"
- build software layers on top of the solver moat

## Thesis

Once the solver is trustworthy, the highest-value products are the ones that convert analysis into:

- deliverables
- reviewability
- repeatable workflows
- team adoption

The solver remains the core asset, but the company wins by building software around it.

## Best Products To Build

### 1. RC Design + Reinforcement Schedule + BBS Studio

Why it matters:

- highest direct value for everyday structural engineers
- closes the gap between analysis and issued deliverables
- strongest differentiation in LATAM and RC-heavy markets

What it includes:

- required steel from envelopes
- bar selection and detailing
- stirrups / shear design
- reinforcement schedules
- graphical BBS

### 2. Structural Report OS

Why it matters:

- firms buy trust when it turns into issued documents
- solver quality becomes commercially real only when it becomes a report

What it includes:

- calculation books
- governing-case narratives
- code-check summaries
- diagnostics and warnings with provenance
- submission-grade PDF / export packages

### 3. QA / Peer-Review Assistant

Why it matters:

- structural firms spend large amounts of time reviewing models and suspicious outputs
- solver diagnostics become much more valuable when they help a reviewer approve or reject work

What it includes:

- model quality review
- suspicious reaction and stability checks
- load-path and support sanity checks
- review comments and issue lists

### 4. Firm Workspace

Why it matters:

- firms want repeatability, standards, and team consistency
- this creates stickiness beyond one-off model solving

What it includes:

- templates
- office standards
- reusable sections/materials/load packs
- project memory
- review flows

### 5. Parametric Structural Configurator

Why it matters:

- many engineering projects start from recurring typologies
- solver power becomes more usable when repetitive geometry is generated well

What it includes:

- towers
- warehouses
- stadiums
- pipe racks
- mat foundations
- repetitive industrial frames

### 6. Interoperability Layer

Why it matters:

- switching costs are often workflow costs, not analysis costs
- better exchange expands adoption faster than niche solver depth

What it includes:

- BIM/CAD exchange
- analytical-model generation
- geometry cleanup
- downstream drawing synchronization

### 7. Cloud Solve + Comparison Platform

Why it matters:

- valuable for larger models, scenario exploration, batch work, and team comparison

What it includes:

- batch runs
- model diffs
- branch comparisons
- scenario sweeps
- shared histories

### 8. Education Product

Why it matters:

- Dedaliano already has strong educational DNA
- this is a real growth surface, not just a side mode

What it includes:

- benchmark explorer
- teaching-first solver views
- assignments / exercise workflows
- explainable numerical methods

## Recommended Build Order

1. `RC design + schedule / BBS`
2. `Structural report OS`
3. `QA / peer-review assistant`
4. `Firm workspace`
5. `Parametric configurator`
6. `Interoperability`
7. `Cloud solve + comparison`
8. `Education product`

## What The Solver Must Enable

These are not separate solver products, but they are prerequisites:

- stable API / WASM contracts
- headless / native execution for larger jobs
- reproducible solver diagnostics
- report-grade provenance
- design-grade extraction
- trustworthy runtime and deployment behavior

## What Not To Build Next

- a second solver engine
- a broad CAD clone
- a generic project-management product without engineering depth
- a full BIM-authoring competitor

## Strategic Summary

The right long-term strategy is:

- one excellent solver core
- multiple high-value vertical software layers on top of it

That is more defensible than trying to become a generic engineering mega-suite all at once.
