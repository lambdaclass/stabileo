# AI Provider Architecture

## Purpose

This note defines how Dedaliano/Stabileo should integrate AI providers such as Claude, Codex/OpenAI, Kimi, local models, and future vendors.

The main conclusion:

- the frontend should talk to an internal AI capability layer
- not directly to third-party providers in production

This keeps provider choice flexible, protects secrets, allows routing by task, and makes enterprise deployment possible later.

## Short Answer

Yes, the frontend should have a connection point for AI.

But that connection should usually be:

- `frontend -> Dedaliano AI service -> provider(s)`

not:

- `frontend -> Claude/OpenAI/Kimi directly`

Direct browser-to-provider calls are acceptable only for:

- local experiments
- developer prototypes
- very limited BYO-key workflows

They are not the right default product architecture.

## Why Direct Frontend Provider Calls Are Wrong By Default

### 1. Secrets and policy

If the browser talks directly to the provider, you immediately run into:

- API key exposure risk
- weak rate limiting
- no central audit trail
- no provider routing policy
- harder enterprise controls

### 2. Provider lock-in

If product logic is written directly against one provider SDK, the app becomes shaped by that vendor:

- prompt formats
- tool formats
- response schemas
- token accounting
- streaming behavior

That becomes expensive to undo later.

### 3. Different tasks want different models

Structural AI is not one feature. It is a family of tasks:

- explain a diagnostic
- answer a results query
- summarize a report
- suggest a section change
- review a model
- generate structural alternatives

Different tasks may want different providers for:

- quality
- latency
- cost
- determinism
- context length
- privacy

### 4. Enterprise and local deployment

Some users will eventually want:

- private deployments
- local models
- on-prem routing
- approved provider lists
- tenant-specific policies

That is much easier if the product already has an internal abstraction.

## Recommended Architecture

### Frontend

The frontend should call a stable internal interface such as:

- `POST /api/ai/explain-diagnostic`
- `POST /api/ai/query-results`
- `POST /api/ai/suggest-section`
- `POST /api/ai/review-model`
- `POST /api/ai/summarize-report`

The frontend should think in terms of `capabilities`, not vendors.

### Backend / AI Service

Dedaliano should own a provider-agnostic AI layer that:

- authenticates requests
- applies policy and rate limiting
- shapes prompts
- selects provider/model
- normalizes responses
- logs usage and errors
- stores trace/debug metadata

### Provider Adapters

Behind that service, keep vendor adapters:

- Claude adapter
- OpenAI/Codex adapter
- Kimi adapter
- local model adapter
- future provider adapters

Each adapter should translate between:

- Dedaliano capability contract
- provider-specific API format

## Capability-First Design

The internal AI API should be organized around product capabilities.

Examples:

### 1. Explain Diagnostic

Input:

- machine-readable warning code
- severity
- element/node references
- provenance
- optional code context

Output:

- plain-language explanation
- likely causes
- suggested next checks
- suggested fixes

### 2. Query Results

Input:

- normalized/query-ready result summary
- user question
- current model scope

Output:

- direct answer
- governing combination
- member/location references
- confidence / trace data

### 3. Suggest Section

Input:

- utilization summary
- available section family
- code selection
- constraints/cost hints

Output:

- candidate sections
- why they are suggested
- tradeoffs

### 4. Review Model

Input:

- structured diagnostics
- model metadata
- optional comments/review context

Output:

- prioritized review findings
- risky assumptions
- recommended review order

This is much better than building everything around:

- `call Claude`
- `call OpenAI`
- `call Kimi`

## What The Frontend Should Still Handle

The frontend should still own:

- UI surfaces
- streaming display
- retry UX
- capability selection
- conversation/session state for the user
- citations/trace display
- user-visible provider disclosure when needed

The frontend should not own:

- vendor-specific prompt logic
- secret management
- provider failover logic
- enterprise routing policy

## Recommended Rollout

### Phase 1: Minimal AI gateway

- single internal AI endpoint layer
- one or two providers behind it
- capability-based request types
- no direct provider calls from the browser by default

Ship early capabilities:

- explain diagnostic
- query results
- summarize code-check/report result

### Phase 2: Provider routing

- route by task
- fallback provider support
- structured usage logging
- quality/cost tuning per capability

### Phase 3: Tenant/provider configuration

- admin-configurable default provider
- allow-list / deny-list of models
- enterprise/private deployment options
- optional BYO-key workflows

### Phase 4: Local/private AI options

- local model adapter
- on-prem deployment path
- privacy-sensitive review workflows

## How This Connects To The Solver Roadmap

This architecture depends on solver-side work already identified elsewhere:

- machine-readable diagnostics
- provenance
- query-ready result contracts
- stable WASM/API schemas
- reproducible solver-run artifacts

Without that, AI becomes shallow UI text generation.

With that, AI becomes:

- explainable
- reviewable
- auditable
- useful in real engineering workflows

## How This Connects To The Product Roadmap

### Early product phases

Use the AI layer for:

- warning explanation
- result Q&A
- code-check explanation
- section suggestions
- workflow guidance

### Later product phases

Use the same AI layer for:

- natural language to model
- automated design iteration
- live review assistance
- platform-scale generative workflows

The key is that the architecture should be ready early, even if the harder AI features come later.

## What To Avoid

- direct frontend dependence on one provider SDK
- prompt logic scattered across UI components
- product semantics encoded in vendor-specific response shapes
- assuming one model is best for every task
- making enterprise/private deployment impossible through early shortcuts

## Recommended Decision

Dedaliano should adopt:

- `provider-agnostic AI architecture`
- `capability-based internal API`
- `frontend connected to internal AI service`
- `backend adapter layer for Claude/OpenAI/Kimi/local/future models`

That is the clean path if AI is intended to become a durable product layer rather than a demo feature.
