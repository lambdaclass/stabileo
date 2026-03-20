# Open-Source vs Hosted AI Boundary

## Purpose

This note defines what AI capabilities should live in the open-source product and what should remain in the hosted/private/commercial layer.

The goal is:

- keep the open-source product genuinely useful
- keep the commercial moat in orchestration, scale, and workflow intelligence
- avoid monetizing by crippling the core engineering product

## Open-Source Layer

Open source should include:

- AI UI surfaces and capability interfaces
- prompt/result schemas
- local/basic provider adapter pattern
- simple diagnostic explanation
- simple result Q&A
- limited code-check explanation
- local model support if added
- basic BYO-key mode if community adoption benefits from it

### Why these belong in OSS

These capabilities:

- strengthen adoption
- showcase the solver/data moat
- help engineers trust the product
- improve the usability of the core engineering tool

They are product surfaces, not the core hosted moat.

## Hosted / Private / Paid Layer

Hosted/private/commercial should include:

- hosted backend routing
- premium provider integrations and tuning
- provider-selection policies
- caching, logging, tracing, and eval infrastructure
- team review assistant
- large-project context assembly
- report-generation intelligence
- automated design iteration / optimization assistant
- office-specific knowledge / templates / standards
- usage quotas, rate limits, billing, and admin controls
- enterprise security / audit / tenancy features

### Why these belong in the paid layer

These capabilities are expensive and operational:

- they need backend control
- they benefit from proprietary tuning
- they compound with team workflows
- they are easier to monetize cleanly

This is where the durable commercial moat should live.

## Architectural Principle

Even when AI features appear in the open-source product, the long-term architecture should still be:

- `frontend -> Dedaliano backend -> provider(s)`

for the hosted product.

The open-source product can still support:

- local models
- local inference
- BYO-key modes
- simple provider adapters

But the canonical product architecture should remain provider-agnostic and backend-controlled.

## Product Recommendation

### OSS should feel complete enough to matter

The open-source version should be strong enough that an engineer can:

- get diagnostics explained
- ask basic results questions
- receive limited code-check explanation
- inspect solver trust signals
- use the product seriously without feeling artificially blocked

### Paid should win on leverage, not lockout

The commercial version should win on:

- better orchestration
- deeper automation
- richer context
- collaboration
- enterprise governance
- higher limits

not by removing basic intelligence from the open-source core.

## Roadmap Interpretation

### Early roadmap steps

Open-source suitable:

- diagnostic explanation
- result queries
- limited code-check explanation
- basic section suggestion

Hosted/private suitable:

- provider routing
- logging/evals
- rate limiting
- premium model tuning

### Mid roadmap steps

Open-source suitable:

- local workflow helpers
- limited review assistant

Hosted/private suitable:

- team review assistant
- report intelligence
- office-specific knowledge

### Later roadmap steps

Mostly hosted/private:

- automated design iteration
- optimization assistant
- generative layout workflows
- large-scale AI collaboration

## Bottom Line

Open source should include the AI surfaces that make the engineering product feel modern, explainable, and genuinely useful.

Hosted/private should capture the value of:

- orchestration
- scale
- collaboration
- premium automation
- enterprise controls

That is the cleanest split for both adoption and business.
