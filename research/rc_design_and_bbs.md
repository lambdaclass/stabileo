# RC Design, Reinforcement Schedules, and BBS

Read next:
- product priorities: [PRODUCT_ROADMAP.md](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md)
- solver priorities: [SOLVER_ROADMAP.md](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)
- current capability snapshot: [CURRENT_STATUS.md](/Users/unbalancedparen/projects/dedaliano/CURRENT_STATUS.md)

This note captures why `reinforced-concrete member design`, `reinforcement schedules`, and later `bar bending schedule (BBS)` generation are important enough to be explicit priorities.

It is not a code-design manual and it is not the canonical roadmap.
Its purpose is to define:

- why this matters strategically
- what the solver must provide
- what the product/design layer must provide
- what should ship first

## Why This Matters

For many structural engineers, analysis alone is not the finished workflow.
The daily workflow is closer to:

1. analyze the structure
2. identify governing forces and combinations
3. design reinforced-concrete members
4. select bars and stirrups
5. produce a schedule and, eventually, BBS-style deliverables

That means RC design is one of the clearest paths from:

- `strong solver`
to
- `useful engineering product`

This is especially important because a large share of practical building work is not blocked by missing exotic solver categories.
It is blocked by the gap between:

- analysis results
and
- design/deliverable outputs

## What Already Exists

The current codebase already has a meaningful part of the input chain:

- internal forces and envelopes
- load combinations and postprocessing
- section/material inputs
- existing design-check module patterns
- browser-native product surfaces for tables, diagnostics, and reports

In other words:

`the analysis side is strong enough that RC design is now worth productizing`

## What Does Not Exist Yet

The missing chain is not one thing.
It is at least five distinct layers:

1. `Design-grade result extraction`
   The solver/postprocess layer must expose stable, deterministic beam design inputs.

2. `RC member design logic`
   Required flexural steel, shear steel, detailing checks, minimum/maximum steel, and related design rules.

3. `Bar selection and arrangement`
   Turn required steel areas into chosen bar sets, stirrups, layers, spacing, and placement assumptions.

4. `Schedule data model`
   A structured output format for quantities, bar marks, lengths, hooks, bend shapes, and member references.

5. `Graphical BBS output`
   Drawings, dimensions, hooks, shape codes, and print/report output.

## Important Separation: Solver vs Product

This should be treated as both a solver priority and a product priority, but not for the same reasons.

### Solver Responsibility

The solver side should provide the inputs that unblock the rest of the chain:

- deterministic station-force extraction along members
- governing-combination selection
- stable sign conventions
- result provenance and traceability
- consistent geometry/material metadata for design workflows
- regression coverage for design-ready outputs

This is the minimum solver contract that lets a separate design/product team work in parallel without reverse-engineering raw solver outputs.

### Product / Design Responsibility

The design/product side should own:

- RC code-check logic and configuration
- bar selection UX and defaults
- schedule presentation
- report output
- graphical BBS generation
- user-facing edit/override flows

This separation matters because:

- the solver should not become a PDF/drawing engine
- the product layer should not need to reconstruct core engineering results from raw response arrays

## Recommended Delivery Order

The right order is not:

1. draw BBS
2. figure out engineering semantics later

The right order is:

1. `Design-grade solver outputs`
   Beam stations, envelopes, governing combinations, metadata, and deterministic conventions.

2. `RC beam design table`
   Required flexural steel, shear steel, selected bars, stirrups, and design assumptions in tabular form.

3. `Reinforcement schedule`
   Member-by-member output that can already support engineering documentation and quantity workflows.

4. `Graphical BBS`
   Add bar marks, bend shapes, hooks, dimensions, and printable schedule graphics once the data model is stable.

This order is faster, lower-risk, and much easier to validate.

## Why Tabular Output Should Come Before BBS Graphics

The hard part is not only the formulas.
The hard part is turning engineering intent into a stable representation.

If the project skips straight to graphics, it risks hard-coding the wrong assumptions about:

- bar marks
- grouping rules
- member segmentation
- hooks and anchorage semantics
- lap splice semantics
- location naming
- schedule identity and revision behavior

Tabular output should come first because it forces clarity on:

- what one designed item is
- what fields define it
- how it traces back to analysis and design assumptions
- how users edit or override it

After that, BBS graphics become much easier and much less brittle.

## Highest-Value First Scope

The first version should stay narrow:

- RC beams first
- flexure and shear first
- tabular reinforcement schedule first
- deterministic extraction from analysis envelopes first

Avoid starting with:

- every RC member type at once
- slabs, walls, columns, footings, and beams simultaneously
- full graphic BBS as the first deliverable
- detail-heavy drafting conventions before the schedule data model is stable

## Suggested First Solver Contract

To unblock the product/design team quickly, the solver-side contract should include:

- beam result stations along each member
- `N`, `V`, `M`, and torsion where available at those stations
- governing combination IDs for each design effect
- deterministic local-axis/sign convention metadata
- section dimensions and material references
- result provenance so schedules can explain where required steel came from

This should be exposed in a way that is:

- deterministic
- regression-tested
- serializable
- easy for the UI/report layer to consume

## Suggested First Product Contract

The product/design layer should then turn that contract into:

- beam design rows
- selected longitudinal bars
- selected stirrups
- spacing/cover assumptions
- warnings for infeasible or non-default layouts
- schedule output ready for reports/export

Only after this is stable should the project add:

- BBS graphics
- shape-code mapping
- dimensioned bend forms
- print-optimized schedule sheets

## Priority Recommendation

This should be treated as:

- a `near-term solver priority` for the extraction/provenance layer
- a `near-term product priority` for RC beam design and reinforcement schedules
- a `second-phase product priority` for graphical BBS generation

In practical terms:

- `RC-ready solver outputs` should happen as soon as possible to unblock parallel work
- `RC design tables and schedules` should come before many second-tier solver wishlist items
- `graphical BBS` should follow the table/schedule layer, not precede it

## Non-Goals For The First Wave

The first wave should not try to solve:

- every national detailing standard
- every member type
- every drafting convention
- full CAD-grade reinforcement detailing
- fabrication/export integrations before the schedule model is stable

## Bottom Line

`RC design + reinforcement schedules are one of the highest-value ways to convert solver strength into daily engineering usefulness.`

`Graphical BBS is important, but it should come after design-grade extraction and tabular schedule outputs are stable.`
