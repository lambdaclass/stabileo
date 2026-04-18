# AI Modeling Workflow

Stabileo already has a real `AI -> structured model -> solver -> review` seam.

The correct framing is not "AI replaces the solver."

The correct framing is:

`AI can drive the same structured model and solver surface that engineers use directly.`

## What Exists Today

The repo already contains:

- an in-product AI drawer in [`web/src/components/AiDrawer.svelte`](../web/src/components/AiDrawer.svelte)
- frontend AI client calls in [`web/src/lib/ai/client.ts`](../web/src/lib/ai/client.ts)
- backend AI routes in [`backend/src/main.rs`](../backend/src/main.rs)
- build/edit loop tests in [`web/src/lib/ai/__tests__/build-model.test.ts`](../web/src/lib/ai/__tests__/build-model.test.ts)

Current backend routes:

- `POST /api/ai/build-model`
- `POST /api/ai/review-model`
- `POST /api/ai/explain-diagnostic`
- `POST /api/ai/interpret-results`

## The Workflow

### 1. Describe

The user or agent writes a request such as:

- "portal frame, 6 m span, 4 m height, IPE 300, wind + dead load"

### 2. Generate or edit a structured model

The AI does not send free-form geometry into the solver.

It produces or modifies a structured snapshot:

- nodes
- elements
- supports
- materials
- sections
- loads

This is the important product boundary.

### 3. Validate and preview

The frontend validates the generated snapshot before it becomes the active model.

This prevents obvious failures such as:

- missing nodes
- elements referencing non-existent nodes
- supports or loads pointing to invalid IDs

### 4. Solve

Once applied, the same solver path runs that the normal app uses.

That means:

- the browser app
- the AI build/edit flow
- the review flow

all share the same analysis core.

### 5. Review and explain

After solving, AI can help with:

- model review
- explaining diagnostics
- interpreting results

But the numerical output still comes from the solver, not from the LLM.

## Local Development Boundary

The frontend AI client uses:

- `VITE_AI_BACKEND_URL`
- `VITE_AI_API_KEY`

The browser app talks to the Rust/Axum backend through those authenticated endpoints.

## Why This Matters

This is the real wedge:

- `structured model`
- `deterministic solver`
- `AI assistance on top`

That is much stronger than vague "AI for engineering" positioning.

## Next Steps

- [Quick start](QUICKSTART.md)
- [Solver reference](SOLVER_REFERENCE.md)
- [AI roadmap](roadmap/AI_ROADMAP.md)
