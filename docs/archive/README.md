# Archive

Documents kept for history. They are **not current**: do not follow them. Each entry says why it
was archived and what replaces it. Nothing here was deleted; `git log --follow` shows each file's
history.

| File | Archived | Why | Current replacement |
|---|---|---|---|
| [CODEX_WORKFLOW_STABILEO.md](CODEX_WORKFLOW_STABILEO.md) | 2026-10-18 | Described a stacked-PR process and declared solver code off-limits; current practice is one branch + PR per workstream, solver work in scope with verification, review before merge, an integration branch per wave | [../WORKFLOW.md](../WORKFLOW.md) |
| [CURRENT_STATE_STABILEO.md](CURRENT_STATE_STABILEO.md) | 2026-10-18 | Snapshot of a July 2026 working branch (`pr/2-pro-governing-pipeline`) | [../roadmap/README.md](../roadmap/README.md), [../../testing/docs/DASHBOARD.md](../../testing/docs/DASHBOARD.md), [CHANGELOG](../../CHANGELOG.md) |
| [PR_RESTRUCTURE_PLAN.md](PR_RESTRUCTURE_PLAN.md) | 2026-10-18 | Plan for a two-PR stack that has merged | [../WORKFLOW.md](../WORKFLOW.md) |
| [wave1-trust-hardening.md](wave1-trust-hardening.md) | 2026-10-18 | Agent prompts for the first trust-hardening wave (was `docs/agents/`); the work landed | Trust and verification backlog in [../roadmap/PRODUCT_ROADMAP.md](../roadmap/PRODUCT_ROADMAP.md) |
| [roadmap/ai_structural_engineering_roadmap.md](roadmap/ai_structural_engineering_roadmap.md) | 2026-10-18 | A seven-line pointer to `AI_ROADMAP.md` | [../roadmap/AI_ROADMAP.md](../roadmap/AI_ROADMAP.md) |
| [roadmap/INFRASTRUCTURE_AXUM_2026_10.md](roadmap/INFRASTRUCTURE_AXUM_2026_10.md) | 2026-11-22 | Described the legacy Rust/Axum `ai-backend/` and `nginx.conf` stack prior to the Elixir/Phoenix umbrella (`backend/`), Caddy edge, and Waves 1–3 | [../roadmap/INFRASTRUCTURE_ROADMAP.md](../roadmap/INFRASTRUCTURE_ROADMAP.md) |
| [roadmap/PRODUCT_SEQUENCE_PRE_V0_2.md](roadmap/PRODUCT_SEQUENCE_PRE_V0_2.md) | 2026-11-22 | Pre-v0.2.0 "Dedaliano" 12-step sequence, Z-up migration decision, and daily/weekly/monthly mapping extracted from `PRODUCT_ROADMAP.md` Section 7 | [../roadmap/PRODUCT_ROADMAP.md](../roadmap/PRODUCT_ROADMAP.md), [../research/high_leverage_solver_and_product_plan.md](../research/high_leverage_solver_and_product_plan.md) |
| [roadmap/SOLVER_SNAPSHOT_PRE_V0_2.md](roadmap/SOLVER_SNAPSHOT_PRE_V0_2.md) | 2026-11-22 | Pre-v0.2.0 April–July 2026 solver status, ASAP hardening, and Wave 1 trust-hardening baseline snapshots extracted from `SOLVER_ROADMAP.md` | [../roadmap/SOLVER_ROADMAP.md](../roadmap/SOLVER_ROADMAP.md), [../../testing/docs/DASHBOARD.md](../../testing/docs/DASHBOARD.md), [../../testing/docs/MATURITY.md](../../testing/docs/MATURITY.md) |

Moved, not archived: `docs/roadmap/beyond_roadmap_opportunities.md` and
`docs/roadmap/post_roadmap_software_stack.md` are research notes and now live in
[`docs/research/`](../research/README.md), where its README already listed them.
