# CYPECAD Gap Analysis

Read next:
- current capability snapshot: [CURRENT_STATUS.md](/Users/unbalancedparen/projects/dedaliano/CURRENT_STATUS.md)
- proof and capability matrix: [BENCHMARKS.md](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md)
- product roadmap: [PRODUCT_ROADMAP.md](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md)
- solver roadmap: [SOLVER_ROADMAP.md](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)

This note corrects a raw audit that treated many CYPECAD-like feature gaps as `missing solver work`.

That framing is too coarse.
For a realistic comparison against a mature structural product, each gap should be classified into four layers:

1. `Engine capability`
   Can the mechanics be computed today?
2. `Workflow / modeling layer`
   Can the user set it up in the way a practical product expects?
3. `Design / automation layer`
   Can the solver output be converted into code checks, schedules, or automatic engineering decisions?
4. `Outputs / reports / exports`
   Can the result be delivered in the reports, drawings, exports, and schedules users actually need?

The goal here is not to defend the current system.
It is to separate:

- what is truly missing in the mechanics
- what already exists in the engine but is not yet productized
- what is mostly reporting/export/documentation work

## Short Take

The raw audit substantially understated the current engine.

Several items described as:

- `WASM stub exists, no implementation`

are already implemented in the Rust solver and exposed through WASM.

The honest corrected conclusion is:

- some CYPECAD-like features still need real solver work
- many others already exist at the engine level and are missing mainly workflow/product/reporting layers
- a fair comparison must include exports, reports, design automation, and local-practice deliverables, not only raw mechanics

## What The Raw Audit Got Wrong

These are already implemented in the codebase and should not be described as missing solver work:

- `Winkler foundation / beam on elastic foundation`
  - [`engine/src/solver/winkler.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/winkler.rs)
  - WASM exports in [`engine/src/lib.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/lib.rs)
- `SSI beyond simple Winkler`
  - [`engine/src/solver/ssi.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/ssi.rs)
- `Cable / tension-only workflows`
  - [`engine/src/solver/cable.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/cable.rs)
  - staged cable iteration in [`engine/src/solver/staged.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/staged.rs)
- `Nonlinear material analysis`
  - [`engine/src/solver/material_nonlinear.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/material_nonlinear.rs)
  - deeper distributed-plasticity work in [`engine/src/solver/fiber_nonlinear.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/fiber_nonlinear.rs)
- `Time history`
  - [`engine/src/solver/time_integration.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/time_integration.rs)
- `Creep / shrinkage`
  - [`engine/src/solver/creep_shrinkage.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/creep_shrinkage.rs)
- `Staged construction`
  - [`engine/src/solver/staged.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/staged.rs)

Also, `prestress / post-tension` is not accurate to describe as `none of this exists`.
There is real tendon/prestress work in:

- [`engine/src/solver/prestress.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/prestress.rs)
- [`engine/src/solver/staged.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/staged.rs)

The fairer statement is:

- prestress / PT mechanics exist in partial form
- deeper slab-oriented PT workflows and product packaging remain incomplete

## Better Classification

### A. Already Present In The Engine, But Not Necessarily Productized

These should be treated as `workflow / product / reporting` gaps unless a narrower missing mechanic is identified.

| Feature Area | Engine Status | What Is More Likely Missing |
|---|---|---|
| Soil-structure interaction | Present | Better workflow packaging, broader foundation workflows, stronger reporting |
| Cable / tension-only behavior | Present | Modeling UX, examples, reporting, specialty workflow depth |
| Nonlinear material | Present | Workflow maturity, validation depth, product-facing controls |
| Time history | Present | Better setup UX, records workflow, result/report packaging |
| Creep / shrinkage | Present | Combined staged/PT workflow depth, UX, reporting |
| Staged construction | Present | Practical workflow packaging, templates, better product flow |
| Prestress / PT basics | Partial-to-present | Slab-oriented workflow, loss packaging, design/report output |

These are real capabilities already represented in the current code and docs.
The missing work is often not `invent the math`, but:

- make the workflow coherent
- expose the capability cleanly
- validate it more deeply
- turn it into deliverables users trust

### B. Partially Present, But CYPE-Like Workflow Is Still Incomplete

These are the areas where the solver may have meaningful ingredients, but not yet the full commercial-style feature.

| Feature Area | Current Reality | Main Remaining Gap |
|---|---|---|
| Mat foundations | Shells plus Winkler/SSI ingredients exist | Integrated slab-on-grade / mat-foundation workflow and product packaging |
| Flat slab analysis | Shells and columns exist | Practical slab-column workflow assumptions, modeling defaults, design/report packaging |
| Post-tensioned slabs | Prestress mechanics exist in part | Slab-specific tendon workflow, losses packaging, staged/PT product flow |
| Composite behavior | Some design-side composite checks exist | True analysis-side composite interface/slip workflow is still incomplete |

These should not be overstated as `completely missing`.
They are better described as:

- `partly there in the engine`
- `not yet coherent as a product workflow`

### C. More Plausibly Still Missing Solver / Engine Work

These are the stronger candidates for genuine engine-level gaps.

| Feature Area | Why It Still Looks Like Real Engine Work |
|---|---|
| Waffle slabs | Likely needs orthotropic/ribbed slab behavior or a dedicated equivalent modeling abstraction |
| Orthotropic slab / ribbed shell behavior | Current shell stack is broad, but not clearly framed as orthotropic ribbed slab behavior |
| Composite elements with slip/interface behavior | Requires a true analysis-side mixed-material/interface formulation, not only design checks |

These are the places where a future roadmap item may genuinely belong under solver mechanics, not only productization.

## Reports, Outputs, And Exports Matter Just As Much

A serious CYPECAD comparison cannot stop at `can the engine compute it`.

Commercial structural products also win through:

- calculation reports
- code-check reports
- schedules
- drawings
- reinforcement details
- quantity outputs
- DWG/DXF/IFC/BIM-oriented exports
- polished user-facing summaries

That means a feature can still be a meaningful gap even when the solver mechanics already exist.

Examples:

- `staged construction`
  Engine support may exist, but if users cannot produce usable staged-result summaries and reports, the feature is still incomplete as a product.

- `time history`
  Engine support may exist, but if accelerogram import, damping setup, combination/report output, and result review are weak, it still lags a mature competitor.

- `SSI / foundation workflows`
  Engine support may exist, but if foundation-oriented modeling/reporting/export workflows are weak, the product gap remains real.

So the right question is not only:

- `does the solver have the equations?`

It is also:

- `can the user model it, run it, review it, and issue deliverables from it?`

## Corrected Comparison Framework

For each CYPECAD-like feature, use this matrix:

| Feature | Engine | Workflow / Product | Design Automation | Reports / Exports | Honest Status |
|---|---|---|---|---|---|
| Soil-structure interaction | Present | Partial | Partial | Partial | Mostly product/report gap now |
| Mat foundations | Partial | Partial | Partial | Partial | Mixed engine + workflow gap |
| Waffle slabs | Weak / missing | Missing | Missing | Missing | Real engine gap plus workflow gap |
| Flat slab analysis | Partial | Partial | Partial | Partial | More workflow/product gap than raw shell absence |
| Post-tensioned slabs | Partial | Partial | Partial | Partial | Partly present, not fully packaged |
| Composite elements | Partial | Partial | Partial | Partial | Likely real engine gap for full analysis-side behavior |
| Cable / tension-only | Present | Partial | Partial | Partial | Mostly workflow/report gap now |
| Nonlinear material | Present | Partial | Partial | Partial | More maturity/product gap than existence gap |
| Time history | Present | Partial | Partial | Partial | More workflow/report gap than existence gap |
| Creep & shrinkage | Present | Partial | Partial | Partial | More coupling/workflow gap than existence gap |
| Staged construction | Present | Partial | Partial | Partial | More workflow/product gap than existence gap |

This table is intentionally approximate.
The important correction is the structure:

- stop collapsing every missing commercial workflow into `solver missing`

## What Still Needs To Be Researched More Carefully

Some items need a tighter feature definition before they can be classified confidently:

### 1. Flat Slab Analysis

This can mean very different things:

- shell FE slab analysis
- equivalent-frame method
- slab-column design workflows
- punching-driven design automation

Those are not the same gap.

### 2. Mat Foundations

This can mean:

- shell on Winkler foundation
- nonlinear SSI workflow
- bearing/contact/pile interaction
- mat-foundation design and reporting

Again, not one gap.

### 3. Post-Tensioned Slabs

This can mean:

- tendon equivalent loads
- long-term loss calculation
- staged stressing workflow
- slab design automation
- reports and tendon schedules

These must be split before they are mapped to roadmap work.

## Strategic Implication

The corrected interpretation is important for roadmap quality.

If the audit is left uncorrected, it will over-prioritize engine work that already exists and under-prioritize:

- workflow packaging
- design automation
- reports
- exports
- user-facing deliverables

The right product/engineering sequencing is usually:

1. verify whether the engine capability already exists
2. identify the missing workflow/product/report/export layers
3. add solver work only where a real engine gap remains

## Bottom Line

`The raw audit overstates missing solver work.`

`A substantial part of the CYPECAD gap is not raw mechanics absence, but workflow, design automation, reports, and exports.`

`The remaining high-confidence engine gaps are narrower: orthotropic/ribbed slab behavior, fuller composite/interface behavior, and other workflow-specific formulation depth where the current ingredients are not yet enough.`
