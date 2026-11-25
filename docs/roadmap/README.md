# Roadmap: start here

This is the single entry point for Stabileo's plans. Read this page first; it says which document
answers which question, how current each one is, and where the work is tracked.

**The backlogs live in [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) and
[testing/ROADMAP.md](../../testing/ROADMAP.md):** testing owns Prevention, Soundness multipliers,
Trust and verification, Solver and proof depth, and CI; the product roadmap owns Release safety,
Engineering coverage, Multipliers, performance, platform, growth and housekeeping. Every item links to its GitHub issue;
the tracker is [#396](https://github.com/lambdaclass/stabileo/issues/396). What comes first right now is
the **Overall order** and **Priority now** in the Now section of PRODUCT_ROADMAP: soundness first, ranked from (a) uncontained
silent wrong results down to (g) growth and SaaS; sections 3 to 6 follow the same ranking. Each section has
measurable exit criteria, and the metrics behind them are regenerated on the
[verification dashboard](../../testing/docs/DASHBOARD.md).

## Current status (2026-11-23)

- **Release baseline: [`v0.6.4`](../releases/v0.6.4.md)** (released 2026-11-21; full release notes for [`v0.6.0`](../releases/v0.6.0.md)–[`v0.6.4`](../releases/v0.6.4.md) and history in [`CHANGELOG.md`](../../CHANGELOG.md); safety advisories through `SA-2026-107` shipped in `0.6.4`, and `SA-2026-108`–`111` published for post-`0.6.4` fixes on `main` in [`docs/advisories/README.md`](../advisories/README.md)). Where advisories affect generated area, roof, wind, snow, or seismic loads, **regenerate those loads before re-solving** — re-running stored loads alone is insufficient (see each release note's "Your results may change" checklist).
- **Soundness remains first.** Pre-solve load and plate-geometry accounting ([#2470](https://github.com/lambdaclass/stabileo/pull/2470)) and DXF/JSON/shared-deck containments ([#2494](https://github.com/lambdaclass/stabileo/pull/2494)–[#2496](https://github.com/lambdaclass/stabileo/pull/2496)) landed on `main`, alongside shared nonlinear drivers ([#2483](https://github.com/lambdaclass/stabileo/pull/2483)). [#2509](https://github.com/lambdaclass/stabileo/pull/2509) reverted [#2365](https://github.com/lambdaclass/stabileo/pull/2365) because serving production from a frozen copy of `main` froze production fixes. PRO plates ([#1928](https://github.com/lambdaclass/stabileo/pull/1928)) can re-land only after owner approval, with a real switch gating one shared code path. The **under audit** notice for generated loads and concrete design is live ([#2228](https://github.com/lambdaclass/stabileo/pull/2228)). Active open audit findings, remaining wrong-result candidates, and the six structural wrong-result elimination tracks live in [`PRODUCT_ROADMAP.md` §2](PRODUCT_ROADMAP.md#2-now-soundness-first-updated-2026-11-22).
- **Post-soundness execution waves (Waves 1–4):** once Wave 0 soundness holds, execution follows Waves 1–4 (Physical IR, Executable Design-Code IR, constrained `PreparedStatic` + adjoint/Woodbury, `verify.stabileo.com`, local ETABS/SAP2000 certified audit, `stabileo-mcp` + `pip install stabileo`, SOCP/CBFEM/CUFSM/PT studio), summarized in [`PRODUCT_ROADMAP.md` §5](PRODUCT_ROADMAP.md#5-later-and-parked) and detailed with first vertical slices in [`high_leverage_solver_and_product_plan.md`](../research/high_leverage_solver_and_product_plan.md).
- **Dashboard freshness notice:** [`testing/docs/DASHBOARD.md`](../../testing/docs/DASHBOARD.md) and [`testing/docs/MATURITY.md`](../../testing/docs/MATURITY.md) were last regenerated on **2026-10-19 (`v0.2.0`)** (regeneration PR [#1698](https://github.com/lambdaclass/stabileo/pull/1698) has not merged yet). Treat their counts and open-issue lists as historical snapshots until regenerated.

## Documents

| Document | Answers | Status | Owner |
|---|---|---|---|
| [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) | What we build and in what order; **the backlog with issue links and exit criteria** | Current (2026-11-22). Release baseline `v0.6.4`; soundness first, Waves 1–4 integrated, pre-v0.2.0 sequence archived. | Federico Carrone |
| [testing/ROADMAP.md](../../testing/ROADMAP.md) | Testing and verification backlog, solver proofs, prevention and CI feedback; follows PRODUCT_ROADMAP “Priority now” item 7 | Current (2026-11-22) | Maintainers |
| [SOLVER_ROADMAP.md](SOLVER_ROADMAP.md) | Solver mechanics, numerical methods, high-leverage solver tracks (2026-11-22) and Steps 1–23 capability reference | Current (2026-11-22); pre-v0.2.0 snapshots archived in [`SOLVER_SNAPSHOT_PRE_V0_2.md`](../archive/roadmap/SOLVER_SNAPSHOT_PRE_V0_2.md) | Diego K (last editor) |
| [../../research/DESIGN.md](../../research/DESIGN.md) | Stabileo Research: what it is, its rules, the engine-benchmarks track and the ordered paper queue (summary in PRODUCT_ROADMAP "Stabileo Research") | Current (2026-10-29) | Federico Carrone |
| [AI_ROADMAP.md](AI_ROADMAP.md) | AI capabilities, ecosystem-first MCP/Python/eval track, prerequisites and safety rules | Current (2026-11-22) | Diego K (last editor) |
| [INFRASTRUCTURE_ROADMAP.md](INFRASTRUCTURE_ROADMAP.md) | Elixir/Phoenix umbrella backend, Caddy edge, auth, storage, `verify.stabileo.com` signing, observability, and Waves 1–3 ops | Current (2026-11-22); prior Axum snapshot archived in [`INFRASTRUCTURE_AXUM_2026_10.md`](../archive/roadmap/INFRASTRUCTURE_AXUM_2026_10.md) | Diego K (last editor) |
| [../../testing/docs/DASHBOARD.md](../../testing/docs/DASHBOARD.md) | The numbers: open `safety` issues, Rust vs TypeScript share, certified share, mutation score, coverage, differential and fuzz volume, per release | Generated by `scripts/verification-metrics.py` *(stale at 2026-10-19 / v0.2.0; pending [#1698](https://github.com/lambdaclass/stabileo/pull/1698))* | CI (`verification-dashboard` workflow) |
| [../../testing/docs/MATURITY.md](../../testing/docs/MATURITY.md) | How well verified each analysis, element family and design check is (Certified > Benchmarked > Differential > Tested > Unverified), with evidence | Generated by the same script *(stale at 2026-10-19 / v0.2.0; pending [#1698](https://github.com/lambdaclass/stabileo/pull/1698))* | CI |
| [../SAFETY_ADVISORIES.md](../SAFETY_ADVISORIES.md) | What we do when a released version produced a wrong or unconservative result; advisories in [../advisories/](../advisories/) | Current | Release manager |
| [../WORKFLOW.md](../WORKFLOW.md) | How work is done: one branch + PR per workstream, review before merge, integration branch per wave, labels | Current | Maintainers |
| [../POSITIONING.md](../POSITIONING.md) | Market framing and competitive wedge | Current | Federico Carrone |

Owners marked "last editor" are taken from git history; no CODEOWNERS file assigns roadmap
documents yet (see [#355](https://github.com/lambdaclass/stabileo/issues/355)).

## Supporting material (not roadmaps)

- [../research/](../research/README.md): research notes, including
  [high_leverage_solver_and_product_plan.md](../research/high_leverage_solver_and_product_plan.md)
  (2026-11-22 reprioritized solver and product architecture plan across Waves 0–4 with first vertical slices),
  [beyond_roadmap_opportunities.md](../research/beyond_roadmap_opportunities.md) (frontier
  opportunities: GNN surrogates, digital twins, UQ) and
  [post_roadmap_software_stack.md](../research/post_roadmap_software_stack.md) (software to
  build on top of the solver; summarised in PRODUCT_ROADMAP "Post-Core Software Stack"). Both
  earlier notes moved here from `docs/roadmap/` on 2026-10-18.
- [../VERIFICATION.md](../VERIFICATION.md): how each result is verified (certificates, Lean, Kani,
  differential testing, feature matrix, worked examples).
- [../releases/v0.6.4.md](../releases/v0.6.4.md): latest release notes (`v0.2.0`–`v0.6.4` in `docs/releases/`); [../../CHANGELOG.md](../../CHANGELOG.md).
- [../MERGE_PLAN_SAFETY_WAVE.md](../MERGE_PLAN_SAFETY_WAVE.md): the record of how the October 2026
  safety wave (#275–#302) was merged; referenced by the v0.2.0 release notes.
- [../handoffs/](../handoffs/): historical working notes from the PR15–PR20 RC/steel workstreams
  (July–September 2026). Kept in place because they cross-reference each other and the code; they
  describe decisions, not current plans.

## Archived

Superseded documents and extracted pre-v0.2.0 roadmap layers are in
[../archive/](../archive/README.md), each with the reason and its replacement: the old workflow
(stacked PRs, solver off-limits), the July 2026 "current state" and PR-restructure notes, the
wave-1 agent prompts, the stub `ai_structural_engineering_roadmap.md`, the pre-v0.2.0 Dedaliano
product sequence (`PRODUCT_SEQUENCE_PRE_V0_2.md`), the pre-v0.2.0 solver snapshots
(`SOLVER_SNAPSHOT_PRE_V0_2.md`), and the October 2026 Axum infrastructure roadmap
(`INFRASTRUCTURE_AXUM_2026_10.md`).

## Rules for these documents

- Plans go in the roadmaps; history goes in the CHANGELOG and release notes.
- A new backlog item gets a GitHub issue with a `roadmap:*` label and a link from
  PRODUCT_ROADMAP; it is added to the tracker #396.
- Numbers are never typed into a roadmap by hand: they come from the dashboard script, which marks
  anything it cannot measure as "not yet measured".
- When a document stops being current, move it to `docs/archive/` with a line in its README; do
  not delete it.
