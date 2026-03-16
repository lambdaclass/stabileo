# CYPECAD Competitive Gap And Parity Plan

## Purpose

This note replaces the older split between:

- `cypecad_gap_analysis.md`
- `cypecad_parity_roadmap.md`

The goal is to keep one clear document that answers both:

1. what the real CYPECAD gap is
2. what the phased parity plan should be

## Short Take

The main correction is:

- a large part of the CYPECAD gap is **not** missing solver mechanics
- much of it is still in:
  - workflow/productization
  - design automation
  - reports, drawings, and exports
  - local-practice RC deliverables

At the same time, there are still some narrower genuine engine/formulation gaps.

So the right competitive framing is:

- verify what already exists in the engine
- close the workflow/automation/reporting gap first
- only add solver work where a real formulation gap remains

## Corrected Comparison Framework

Every CYPECAD-like feature should be classified across four layers:

1. `Engine capability`
   Can the mechanics be computed today?

2. `Workflow / modeling layer`
   Can users set it up the way practical building software expects?

3. `Design / automation layer`
   Can solver output be converted into code checks, schedules, and automatic engineering decisions?

4. `Outputs / reports / exports`
   Can users produce drawings, schedules, reports, and BIM-facing outputs?

This is the right frame because CYPECAD wins through more than analysis:

- RC detailing
- local code workflows
- drawings
- BBS
- memoria de calculo
- quantity outputs

## What The Raw “Missing Solver Work” Audit Got Wrong

These areas are already materially implemented in the engine and should not be described as missing solver work:

- Winkler / beam on elastic foundation
- SSI beyond simple Winkler
- Cable / tension-only analysis
- Nonlinear material analysis
- Time history
- Creep / shrinkage
- Staged construction
- Prestress / PT basics in partial form

So the fairer statement is:

- some CYPECAD-like workflows still need real solver work
- many others are now mostly product/design/report/export gaps

## Honest Status By Feature Class

### Already present in the engine, but not fully productized

- soil-structure interaction
- cable / tension-only
- nonlinear material
- time history
- staged construction
- creep / shrinkage
- prestress / PT basics

These mostly need:

- workflow packaging
- UX
- validation depth
- report/output surfaces

### Partially present, but commercial workflow still incomplete

- mat foundations
- flat slab analysis workflows
- post-tensioned slab workflows
- composite analysis-side behavior

These are mixed:

- some engine ingredients exist
- but the practical product workflow is incomplete

### More plausibly genuine remaining engine gaps

- waffle / ribbed slab behavior
- orthotropic slab / ribbed shell behavior
- fuller composite/interface-slip behavior

These are the narrower places where solver work still looks real and justified.

## Why CYPECAD Still Matters Commercially

The biggest CYPECAD-specific competitive wedge is:

- `RC reinforcement automation + BBS + local-practice deliverables`

That matters especially in:

- Spain
- Portugal
- Latin America

CYPECAD remains commercially strong there not because its analysis engine is uniquely deep, but because it converts RC design into:

- bars
- schedules
- plans
- reports
- contractor-ready output

This is the most important gap to close if Dedaliano/Stabileo wants to compete for daily project delivery in RC-heavy markets.

## Recommended Parity Sequence

### Phase 1 — RC Detailing And Construction Deliverables

Highest-value parity target.

Build:

- advanced beam reinforcement editor
- column reinforcement editor
- slab reinforcement editor
- BBS export
- reinforcement detail plans
- memoria de calculo
- bill of quantities

Why first:

- this is where CYPECAD still has a practical moat
- it converts solver strength into project delivery

### Phase 2 — Foundation Design Workflows

Build:

- pad footing design
- combined / strap footing workflows
- mat foundations
- pile caps
- foundation beams

Most of the mechanics already exist in the engine. The work is mainly productization and output.

### Phase 3 — Seismic Design Completeness

Build:

- beam-column joint verification
- capacity design
- rigid diaphragm UX
- accidental torsion workflows

### Phase 4 — Multi-Code Design Checks

Wire the existing Rust postprocess modules into the UI and reporting layers:

- EC2
- EC3
- ACI
- AISC
- NDS
- TMS
- AISI
- LATAM code adaptations

### Phase 5 — Advanced Analysis UI

Expose engine capabilities already present but not yet coherently productized:

- SSI
- nonlinear material
- time history
- staged construction
- corotational / large displacement
- fiber nonlinear
- creep / shrinkage
- prestress
- cable / catenary
- harmonic
- contact
- arc-length

### Phase 6 — Advanced Elements And BIM

Productize:

- advanced shell elements
- connector elements
- curved beam meshing
- IFC export
- DXF 3D import/export

### Phase 7 — Steel Connections And Fire

Build:

- steel connection design UI
- baseplate design
- fire resistance workflow

## What This Means For Roadmap Quality

The correct sequence is usually:

1. verify whether the engine capability already exists
2. identify the missing workflow/product/automation/report/export layers
3. add solver work only where a real engine gap remains

That prevents wasting roadmap energy on reinventing mechanics that are already present while the real competitive gap remains unclosed.

## Bottom Line

- the old split between “gap analysis” and “parity roadmap” created duplication
- the corrected truth is that much of the CYPECAD gap is workflow/automation/output, not raw engine absence
- the highest-value competitive move is RC design + reinforcement schedules + BBS + report/drawing output
- only a narrower subset of features still clearly belongs in solver mechanics
