# Dedaliano AI Roadmap

## Purpose

This is the AI roadmap: capability sequencing, safety rules, prerequisite contracts, and capability-specific scope control.

It is not:
- the solver mechanics roadmap
- the product UX roadmap
- the infrastructure/ops roadmap
- a research dump

See also:
- [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)
- [`PRODUCT_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md)
- [`INFRASTRUCTURE_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/INFRASTRUCTURE_ROADMAP.md)
- [`research/ai_provider_architecture.md`](/Users/unbalancedparen/projects/dedaliano/research/ai_provider_architecture.md)
- [`research/open_source_vs_hosted_ai_boundary.md`](/Users/unbalancedparen/projects/dedaliano/research/open_source_vs_hosted_ai_boundary.md)

## Principles

1. `Trusted solver first`
   AI rides on trusted solver outputs, diagnostics, and workflows. It does not replace them.

2. `Capabilities before cleverness`
   Build narrow useful capabilities in order, not one vague chatbot that does everything badly.

3. `Evidence before narrative`
   AI should cite diagnostics, governing cases, artifact data, or code heuristics instead of making unsupported claims.

4. `Human in the loop`
   AI may suggest, explain, summarize, and draft. It must not silently modify models or auto-approve engineering conclusions.

5. `Linear sequencing`
   The order below is deliberate. Do not jump ahead to flashy generation before the earlier capability layer is solid.

## Ordered Task Sequence

1. `review-model`
   Use `SolverRunArtifact` plus structured diagnostics to produce prioritized review findings.

2. `explain-diagnostic`
   Turn one diagnostic code plus context into plain-language explanation and fix guidance.

3. `interpret-results`
   Answer user questions over structured result summaries with governing-case references.

4. `build-model` with constrained scope
   Start with beams, portal frames, simple 3D frames, basic supports, and basic loads. Expand only after validation quality is strong.

5. `pre-solve-diagnostics`
   Use AI as a product-layer review surface over structured pre-solve gates so users catch bad models earlier.

6. `canvas-query`
   Let users ask natural-language questions over the model/results with visual highlighting and scoped answers.

7. `code-check`
   AI-driven member-level checking and explanation over CIRSOC/Eurocode/AISC workflows, grounded in solver and code-check outputs.

8. `suggest-loads`
   Suggest combinations and code-driven load cases from project/code/location context once the rule/data layer exists.

9. `section-optimizer`
   Add solver-in-the-loop iteration for lighter sections and tradeoff exploration once batch/iteration contracts are mature.

10. `generate-report`
   Generate structured engineering report drafts once report infrastructure and provenance are stable.

11. `teaching-assistant`
   Educational explanation mode tied to solver results, structural intuition, and DSM/learning surfaces.

12. `compare-models`
   Compare two solver-run artifacts with engineering commentary once replay/diff infrastructure is mature.

13. `sketch-to-model`
   Vision-to-geometry only after constrained build-model workflows are reliable and validation is strong.

14. `failure-narrative`
   Storytelling layer over diagnostics after the underlying review/explain capabilities are trustworthy.

## Capability Notes

### Review and Explain

- must stay grounded in `SolverRunArtifact`, structured diagnostics, and trusted solver outputs
- should always surface evidence, not only conclusions
- must keep affected entities and governing cases visible to the user

### Interpret and Query

- depend on query-ready result summaries and governing-case metadata
- should answer over stable member IDs and labels
- must cite whether an answer came from solver artifact data or a code heuristic

### Build Model

Start narrow and expand deliberately. Each level must work reliably before moving to the next.

| Level | Structures | Key challenges |
|-------|-----------|----------------|
| 1 | Simply supported beams, cantilevers, continuous beams | Correct node placement, support types, distributed/point loads |
| 2 | Portal frames (single bay, single story) | Column-beam connectivity, fixed/pinned bases, lateral loads |
| 3 | Multi-bay, multi-story 2D frames | Regular grid generation, floor loads, bracing |
| 4 | Trusses (Pratt, Warren, Howe) | Truss element type, pin joints, panel geometry |
| 5 | Simple 3D frames (single story, rectangular plan) | 3D node coordinates, 6-DOF elements, 3D supports |
| 6 | Multi-story 3D frames | Floor diaphragms, column stacking, slab loads |
| 7 | Mixed structures (frames + trusses, inclined members) | Element type mixing, complex connectivity |
| 8 | Structures from description + constraints ("6m span, max deflection L/300, residential") | Solver-in-the-loop: generate -> solve -> check -> iterate |

Each level needs:
- prompt templates with structural examples at that complexity
- validation rules for connectivity, support adequacy, and load completeness
- test cases with known-good reference models
- a clear refusal/fallback when the request exceeds the current level

### Build Model — Conversational Builder Architecture

The Build tab is a conversational model builder: the user describes a structure, watches it appear on canvas, and iterates through chat.

**Level 1 (current) — Full model generation:**
- User describes → AI returns full ModelSnapshot JSON → validate → import → solve
- Fast rebuild animation: nodes → elements → supports → loads (~400-600ms total)
- Current model sent as context for follow-up modifications
- Each accepted build is one undo step

**Level 2 (target) — Action-based editing:**
- Replace full-model JSON generation with constrained structured actions
- AI emits actions, not arbitrary model state:
  - `create_beam(span=6m, support_left=pinned, support_right=roller, load_udl=10kN/m)`
  - `add_column(at=3m, height=4m, base_support=fixed)`
  - `change_section(target=element_3, section=IPE300)`
  - `add_support(node=5, type=pinned)`
  - `add_udl(element=2, q=-10)`
  - `delete_member(element=4)`
- Backend validates action against schema → translates to model-store operations
- AI speaks a narrow public contract, never invents internal app APIs

Why action-based is much better:
- more reliable and predictable
- easier to validate, refuse, and debug
- easier to animate (diff is trivial — you know exactly what changed)
- easier to undo (one action = one undo step)
- less likely to hallucinate invalid model structure
- enables clarifying questions ("pinned or fixed?")
- enables selection-aware editing ("change *this* to IPE 300")

**Interaction model (target):**

1. User types request in Build tab
2. AI returns:
   - explanation of what it will do
   - structured action(s) or draft model
   - change summary: "+2 nodes, +1 element, +1 support, section changed on 3 elements"
3. Frontend shows **Apply / Retry / Cancel** (never auto-apply blindly)
4. On Apply:
   - snapshot current model for undo
   - rebuild/animate in short phases
   - auto-frame camera
   - auto-solve
   - offer "Review this model" in chat
5. Each AI message shows status badge: Draft / Applied / Rejected / Undone

**AI context grounding:**
The AI should know on every message:
- current model state (nodes, elements, materials, sections, supports, loads)
- selected entities (if any)
- active analysis mode (2D/3D)
- current spans and coordinate ranges
- existing materials/sections library
- units (always SI metric)

**Clarifying questions:**
If the request is ambiguous, AI should ask before building:
- "Do you want the column pinned or fixed at the base?"
- "Should the load apply to the full span or only the middle span?"
- "2D or 3D frame?"

**Scope refusal:**
If the prompt asks for something beyond the current level:
- refuse clearly with a message like "I can build simple 2D beams, portal frames, and basic trusses right now."
- suggest a narrower reformulation
- never attempt and produce garbage

**Solver feedback in the loop:**
After build + solve:
- if model is unstable or invalid, AI says what failed
- proposes a fix ("The structure is unstable — try adding a horizontal restraint at node 2")
- turns the builder from a generator into an assistant

**Quick-start chips:**
Show template chips above the chat input for common structures:
- Simply supported beam
- Cantilever
- Continuous beam
- Portal frame
- Basic truss

**Validation rules (both backend and frontend):**
- all nodes must have valid coordinates
- all elements must reference existing node IDs
- at least one support must exist
- materials and sections must be present and valid
- reject if node/element count exceeds Level capability
- reject malformed or oversized AI responses
- if validation fails: keep previous model, show exact error in chat, never partially import

**Internal safety guards (not user-visible):**
- max message length (2000 chars)
- max returned model size
- max conversation turns kept in prompt context
- max AI response size
- max node/element count for builder requests (500 nodes for Level 1)
- timeout guard on provider calls
- rate limiting per key/capability

**Action history (visible, not just chat):**
Show a structured log alongside chat:
- Created beam (6m, IPE 300)
- Added column at 3.0 m
- Changed section to IPE 300
- Solved — 4 nodes, 3 elements, LOW risk

This makes undo/redo understandable and the build process traceable.

**Level 2 animation policy (future):**
- diff-based animation for incremental edits
- pulse changed elements
- fade removed entities
- preserve camera position and selection intelligently

### Code Check and Suggest Loads

- depend on code/load metadata contracts and a rule-based code layer
- should not silently invent clauses, load cases, or regional defaults
- need explicit provenance for which code edition and clause set were used

### Optimizer, Reports, Compare, and Teaching

- need stronger batch/replay infrastructure than the first AI layer
- should remain downstream of trusted solver and code-check outputs
- benefit from the same artifact/replay contracts as review and query

## Solver And Data Prerequisites

AI should not move faster than these prerequisites:

1. structured diagnostics with stable codes
2. governing-case extraction and result provenance
3. query-ready result summaries
4. stable payload contracts across WASM/native
5. batch/headless execution for optimization and comparison
6. deterministic replay and build provenance

## Safety And Trust Rules

1. `Human in the loop`
   AI may suggest, explain, summarize, and draft. It must not silently modify models or auto-approve engineering conclusions.

2. `Trust labeling`
   Every AI response should be visibly marked as:
   - advisory
   - based on solver artifact
   - based on code heuristic
   - generated draft
   depending on the capability

3. `Validation boundary`
   AI-generated model data must be validated both in the backend and in the frontend before import or execution.

4. `Capability quality criteria`
   Each capability needs an explicit "good enough" bar before wider rollout.

5. `Failure-mode tracking`
   Track the main failure mode per capability:
   - review: hallucinated issue
   - explain: wrong fix advice
   - interpret: wrong governing case
   - build: invalid or unsafe geometry
   - code-check: wrong clause/pass-fail interpretation

6. `Evaluation datasets`
   Curated eval sets should exist for:
   - diagnostics explanation
   - result interpretation
   - model generation
   - review quality
   - code-check reasoning

## Research Frontier

These should be tracked, but not treated as linear roadmap promises.

### Reinforcement-learning design agents

Potential:
- policy learns to size and revise structures by repeated solver interaction

Why later:
- expensive
- data-hungry
- hard to trust without strong replayability and evaluation

### Structural foundation models

Potential:
- pretrained engineering reasoning over model + results + code + reports

Why later:
- needs very large structured data
- depends on stable contracts and product telemetry

### Autonomous inspection / digital-twin loops

Potential:
- CV damage detection
- Bayesian model updating
- remaining-life and repair recommendation

Why later:
- depends on sensor/inspection workflows beyond the core roadmap
