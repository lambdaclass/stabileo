# Dedaliano AI Roadmap

## Purpose

This is the AI roadmap: capability sequencing, safety rules, prerequisite contracts, and capability-specific scope control.

It is not:
- the solver mechanics roadmap
- the product UX roadmap
- the infrastructure/ops roadmap
- a research dump

See also:
- [`SOLVER_ROADMAP.md`](SOLVER_ROADMAP.md)
- [`PRODUCT_ROADMAP.md`](PRODUCT_ROADMAP.md)
- [`INFRASTRUCTURE_ROADMAP.md`](INFRASTRUCTURE_ROADMAP.md)
- [`research/ai_provider_architecture.md`](../research/ai_provider_architecture.md)
- [`research/open_source_vs_hosted_ai_boundary.md`](../research/open_source_vs_hosted_ai_boundary.md)

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

Current maturity:

| Level | Status | Structures | Key challenges |
|-------|--------|-----------|----------------|
| 1 | Done | Simply supported beams, cantilevers, continuous beams, portal frames, basic trusses, simple 3D frames | Correct node placement, support types, 2D/3D loads, and correct section/material defaults |
| 2 | Done | Multi-bay, multi-story 2D frames | Regular grid generation, floor loads, bracing |
| 3 | Done | Trusses (Pratt, Warren, Howe) with complex geometry | Truss element type, pin joints, panel geometry |
| 4 | Done | Multi-story 3D frames | Floor diaphragms, column stacking, slab loads |
| 5 | In progress | Mixed structures (frames + trusses, inclined members) | Element type mixing, complex connectivity, edit-action composition over existing models |
| 6 | Not started | Structures from description + constraints ("6m span, max deflection L/300, residential") | Solver-in-the-loop: generate -> solve -> check -> iterate |

Each level needs:
- prompt templates with structural examples at that complexity
- validation rules for connectivity, support adequacy, and load completeness
- test cases with known-good reference models
- a clear refusal/fallback when the request exceeds the current level

Current implemented generator scope:
- `create_beam`
- `create_cantilever`
- `create_continuous_beam`
- `create_portal_frame`
- `create_truss`
- `create_multi_story_frame`
- `create_portal_frame_3d`
- `create_multi_story_frame_3d`

Current implemented edit-action scope:
- add one bay/story at the structural-system level
- change sections
- change support strategy
- add/remove loads
- delete members and constrained structural edits through validated edit actions

#### Self-describing capability model

The builder should move away from hardcoded action lists embedded directly in prompts.

Target rule:
- the system should be self-describing
- the AI should read a machine-readable capability manifest
- the backend should remain the source of truth

This should be layered explicitly:

1. `solver capabilities`
   - what the engine can analyze at a low level
   - element types, supports, loads, constraints, analysis modes, and other primitives

2. `generator/build capabilities`
   - what the AI is allowed to build at a high level
   - examples: `create_beam`, `create_truss`, `create_multi_story_frame`, `create_multi_story_frame_3d`

3. `AI capability prompt contract`
   - the curated manifest that the AI consumes when choosing actions
   - generated from backend-owned capability metadata, not handwritten prompt drift

Important boundary:
- the solver should not directly expose its raw internal surface to the AI as the prompt contract
- the AI should see curated build actions, not every low-level FEM primitive

Reason:
- the solver answers `what can be analyzed`
- the generators answer `what can be reliably built from user intent`

Those are related, but not the same contract.

#### Why generators still matter

Even if the solver becomes more self-describing, deterministic generators are still required.

The solver knows primitives such as:
- frame elements
- truss elements
- supports
- nodal loads
- distributed loads
- 2D/3D analysis modes

The user asks for composed structures such as:
- a 3-bay 2-story frame
- a Pratt truss
- a portal frame with lateral load

The generator layer is what deterministically expands:
- typology
- dimensions
- support strategy
- default sections/materials
- connectivity
- loads

into a valid `ModelSnapshot`.

Without generators, the AI would have to compose raw solver primitives directly, which is:
- less deterministic
- harder to validate
- harder to test
- harder to keep within honest scope boundaries

#### Capability registry

The backend should own a machine-readable capability registry for AI-safe build actions.

That registry should describe, per action:
- action name
- description
- analysis-mode support
- required parameters
- optional parameters
- parameter types
- parameter bounds
- defaults
- enums/options
- examples
- limitations/scope notes

The same registry should drive:
- prompt construction
- backend validation
- capability discovery endpoint(s)
- frontend builder hints/examples
- tests that ensure every declared action has a real executor

This keeps the system aligned and avoids prompt drift.

The desired flow is:

`solver primitives -> curated generator/action registry -> AI prompt contract -> deterministic executor`

Not:

`raw solver surface -> AI improvisation`

#### Source-of-truth rule

The capability registry should live in the backend AI/build layer, not only in the frontend builder and not directly inside the solver.

The builder UI should consume it.
The prompt builder should consume it.
The validator should consume it.

But the backend should own it because:
- it knows what executors actually exist
- it can keep prompt and validation in sync
- it can expose the same contract to UI and tests

The solver may contribute low-level metadata, but the solver should not be the owner of the AI-facing action contract.

#### Recommended implementation path

1. add a backend-owned capability registry for build actions
2. expose it as a machine-readable endpoint
3. generate the build-model prompt from that registry instead of a hardcoded action list
4. use the same registry to strengthen parameter validation
5. let the frontend builder consume the registry for examples, hints, and capability-aware UX
6. add tests that fail if a registered action has no executor or if prompt-visible actions diverge from executable actions

This should become the long-term contract for the conversational builder.

#### Conversational builder architecture

The builder is now moving from a pure generator into a conversational structural editor built around this loop:

1. user intent
2. AI planning step
3. deterministic backend build/edit
4. validation and optional solve/review
5. AI refinement step
6. user approval, clarification, or further change

This is the target architecture:

`user -> AI -> builder -> validator/solver -> AI -> user`

The key rule is:
- AI should own intent, clarification, explanation, and constrained editing
- the backend should own geometry generation, IDs, connectivity, normalization, schema correctness, and deterministic expansion into the real model

This should move the builder away from freeform `text -> full model JSON` and toward constrained structural editing.

Current status:
- native provider tool/function calling is implemented behind the provider abstraction
- the AI no longer has to guess between `JSON` and plain text responses
- the backend exposes tool definitions from the action/edit registry
- the frontend sends current model context plus current snapshot when a model already exists on canvas
- the same conversational surface can now build from scratch or edit the existing model

Current response handling order:
1. native tool call
2. JSON fallback
3. plain-text conversational fallback

This is the correct direction and should remain the baseline for future builder work.

#### Planning and editing roles

The builder should evolve toward two internal AI roles:
- `planner`
  - understands user intent
  - selects typology
  - asks clarifying questions
  - makes assumptions explicit
- `editor`
  - emits constrained actions or structured draft changes

This separation makes building-scale interactions much cleaner than one monolithic prompt.

Current practical split:
- `generator actions` are the fast path for common typologies
- `edit actions` are the composition path for modifying an existing model

This is what unlocks Level 5. Mixed structures should mostly come from composition over edit actions, not from an endless list of bespoke whole-structure generators.

#### Building abstractions

To work well for buildings, the builder must operate on structural systems, not only individual FEM entities.

Prefer building-level concepts such as:
- stories
- bays
- grids
- frame lines
- roof systems
- bracing bays
- diaphragms
- section families
- support strategies
- load assumptions

For buildings, the AI should describe:
- typology
- key dimensions
- framing strategy
- lateral system
- material system
- family-level section choices

The backend should then expand that into nodes, members, supports, loads, combinations, and IDs deterministically.

#### Assumptions and clarification

The conversational builder should not pretend ambiguity does not exist.

It should:
- ask clarifying questions when key structural intent is missing
- make defaults explicit
- record what the user specified, what the AI assumed, and what the backend defaulted

Examples of clarifications:
- steel or concrete?
- 2D or 3D?
- fixed or pinned bases?
- full-span or partial-span loading?
- what lateral system should be used?

The resulting assumptions ledger should stay visible to the user.

Current policy:
- if the requested structure fits a supported build/edit action with safe defaults, the builder may proceed directly and make defaults explicit
- if key structural intent is still missing, the builder should ask clarifying questions instead of inventing unsupported topology

#### Hierarchical editing

Building-scale editing should happen at meaningful levels:
- add one story
- add one bay
- brace the end bays
- change all beams on level 2
- make column bases pinned
- change the beam family to IPE 300

This is much more useful than forcing every change to be expressed member by member.

#### Family-based assignment

The builder should support family-level assignment early for building workflows:
- beam family
- column family
- brace family
- roof/truss family

This is essential if the builder is going to move beyond toy examples.

#### Validation and solver feedback loop

The builder should improve itself through validation and solver feedback.

After the backend builds or edits a model:
- run validation
- optionally solve or run lightweight review checks
- return compact trusted feedback to the AI

Then the AI can:
- explain assumptions
- identify what failed
- propose a constrained corrective action
- ask for permission to apply the fix

This is especially important for building workflows where missing lateral systems, poor support assumptions, or disconnected framing are common.

Current status:
- validation exists for generated/edited snapshots and action parameters
- solver-in-the-loop iteration does not exist yet
- Level 6 remains blocked on batch iteration, constraint evaluation, and optimization loops

#### Geometry, setup, and loads are distinct steps

The builder should eventually treat these as separate layers:
1. geometry/framing
2. supports/materials/sections
3. loads/combinations
4. solve/review/fix

That keeps the system much more robust than trying to invent a complete building in one opaque generation step.

#### Maturity ladder by typology

The builder should track maturity by structural typology, not only by one generic "build-model" label.

Example maturity ladder:
- beams: stable
- portal frames: stable
- trusses (Pratt/Warren/Howe): stable
- 2D frame buildings: stable
- simple 3D frame buildings: stable
- mixed frame + truss systems: in progress
- industrial sheds/warehouses: later
- constraint-driven design generation: later

This makes scope boundaries honest and visible.

#### Drafts, preview, and acceptance

The builder should behave like a drafting assistant, not an auto-apply agent.

The desired interaction is:
- AI proposes a draft change
- user sees a summary of what will change
- user can `Apply`, `Retry`, or `Cancel`
- applied changes become one undo step

Over time this should evolve toward ghost-preview or draft-overlay behavior on the canvas before apply.

#### Action contract direction

The AI should speak a narrow builder-facing contract, not the product's private internal API.

Prefer action-style outputs such as:
- `create_beam`
- `create_continuous_beam`
- `create_portal_frame`
- `create_basic_truss`
- `create_simple_3d_frame`
- `add_column`
- `add_support`
- `add_udl`
- `add_point_load`
- `change_section`
- `change_material`
- `delete_member`
- `solve_model`
- `review_model`

The backend remains the source of truth:
- validates fields and scope
- rejects unsupported or ambiguous actions when needed
- translates valid actions into normalized model snapshots or product operations

Current implementation direction:
- tool/function calling is preferred over prompt-only JSON extraction
- provider-specific tool use stays behind the provider adapters
- the internal action/edit contract stays provider-agnostic
- generator actions remain the preferred deterministic path
- direct freeform snapshot generation should only ever be a guarded fallback, not the default execution path

#### Deterministic builder tests

Each supported prompt family should eventually have deterministic tests covering:
- prompt
- parsed intent
- built typology
- validation outcome
- expected solve/review sanity

This is one of the highest-leverage ways to keep the builder trustworthy as scope expands.

#### Interaction model

The Build tab should behave like a constrained structural editor, not a generic chatbot.

Expected interaction:
- user sends a build/change request
- AI returns an explanation plus a structured draft change
- frontend validates the returned payload
- user can `Apply`, `Retry`, or `Cancel`
- on apply:
  - snapshot current model for undo
  - apply the validated change
  - animate the rebuild
  - auto-frame the camera
  - auto-solve
  - optionally offer `Review this model`

Chat state rules:
- chat persists across drawer tab switches
- chat does not clear when switching model tabs
- each applied AI change is one undo step
- AI-generated model changes should show visible state such as `Draft`, `Applied`, `Rejected`, or `Undone`

Current status:
- the builder now operates as a build-or-edit surface depending on whether a model already exists
- frontend request shaping includes:
  - `analysisMode` always
  - compact `modelContext` when a model exists
  - full `currentSnapshot` when edit tools may be needed
- empty-state examples and input copy should adapt between build and edit modes

#### Level 1-4 implementation policy

Implemented today:
- beams
- cantilevers
- continuous beams
- single-bay and multi-bay 2D portal/frame buildings
- trusses with Pratt, Warren, and Howe patterns
- simple and multi-story 3D frames

Still explicitly excluded from the current builder contract:
- arbitrary mixed-structure composition without edit actions
- solver-in-the-loop design iteration
- voice input
- sketch/image input
- constraint-driven optimization/generation

Animation policy:

Do not start with diff-based animation.

For Level 1, every accepted AI change should use a fast rebuild:
1. validate returned model or action result
2. push one undo snapshot
3. clear canvas
4. animate rebuild in short phases:
   - nodes
   - elements
   - supports
   - loads
5. auto-solve
6. render results

Target total visual time after AI response:
- roughly `400-600 ms`

Why this is the right first version:
- simpler
- deterministic
- easier to validate
- avoids brittle diff logic early

Diff-based incremental animation can come later once the builder itself is reliable.

Trust and validation:

Builder output must be treated as untrusted input.

Validation should happen in both backend and frontend.

Minimum validation:
- all nodes have required coordinates
- all elements reference existing node IDs
- at least one support exists
- materials and sections are present
- model fits the currently supported builder scope
- payload size stays within configured limits
- unsupported schema versions are rejected once versioning is in place

Failure behavior:
- keep the previous model unchanged
- show a precise validation error in chat
- never partially import a broken model

High-value quality additions:

The builder becomes much better when these are added early:
- `Preview before apply`
- `Change summary`
  - example: `+2 nodes`, `+1 element`, `+1 support`, `section changed on 3 members`
- `Scope refusal`
  - clearly refuse requests beyond current capability level and suggest a narrower prompt
- `Clarifying questions`
  - ask when support type, load extent, or framing intent is ambiguous
- `Selection-aware editing`
  - use the currently selected entities as context for changes
- `One-click review after build`
- `Camera reframing after apply`

Safety limits:

Even if the product UX does not expose obvious user-facing limits, the implementation still needs hard guards:
- max message length
- max prompt/context length
- max conversation turns included in provider context
- max returned model size
- max nodes/elements/loads per builder request
- provider timeout
- rate limiting
- request IDs and safe structured logging

These are infrastructure requirements, not optional polish.

Frontend interaction requirements:
1. frontend shows **Apply / Retry / Cancel** (never auto-apply blindly)
2. on Apply:
   - snapshot current model for undo
   - apply validated draft
   - auto-frame camera
   - auto-solve
   - offer "Review this model" in chat
3. each AI message should show visible state such as `Draft`, `Applied`, `Rejected`, or `Undone`

AI context grounding:
The AI should know on every message:
- compact current model state summary
- full current snapshot when edit actions may mutate the existing model
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
- refuse clearly with a message like "I can build beams, portal frames, basic trusses, and simple 3D frames right now."
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
