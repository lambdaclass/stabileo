# Roadmap: start here

This is the single entry point for Stabileo's plans. Read this page first; it says which document
answers which question, how current each one is, and where the work is tracked.

**The backlog lives in one place:** the backlog sections of
[PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) (Multipliers, Trust and verification, Engineering
coverage, Solver and proof depth, Release safety, Platform and architecture, Growth and
housekeeping). Every item there links to its GitHub issue;
the tracker is [#396](https://github.com/lambdaclass/stabileo/issues/396). What comes first right now is
the **Overall order** and **Priority now** in the Now section of PRODUCT_ROADMAP: soundness first (wrong-result bugs, the tests
that catch them, the verification safety net and release safety), then other bugs, then features. Each section has
measurable exit criteria, and the metrics behind them are regenerated on the
[verification dashboard](../verification/DASHBOARD.md).

As of **2026-11-13 evening**, [#1846](https://github.com/lambdaclass/stabileo/issues/1846)
and [#1085](https://github.com/lambdaclass/stabileo/issues/1085) are done in
[#1943](https://github.com/lambdaclass/stabileo/pull/1943): staged analysis shares linear
free-rotation handling. Re-run affected staged analyses and derived checks; see
[SA-2026-060](../advisories/SA-2026-060-staged-orphan-rotations.md). The same PR propagates
initial elastic refusals in 3D plastic analysis
([SA-2026-062](../advisories/SA-2026-062-plastic-conditioning-zero-collapse.md)).
Nonlinear convergence #761, #1100 and #971 is fixed in
[#1940](https://github.com/lambdaclass/stabileo/pull/1940); original-pencil buckling recovery
has merged in [#1939](https://github.com/lambdaclass/stabileo/pull/1939). The original #818
unresolved-compression witness still refuses; its loaded follow-up certifies.
Plastic #1953/#1954 and crash duplicates #1962–#1964 are done in
[#1957](https://github.com/lambdaclass/stabileo/pull/1957), #1760 is done in
[#2003](https://github.com/lambdaclass/stabileo/pull/2003), and outrigger sweep #1958 is done in
[#1960](https://github.com/lambdaclass/stabileo/pull/1960). Merged work is on main, not a new release.

Also done on main: final-state reactions and member forces
[#1949](https://github.com/lambdaclass/stabileo/issues/1949) in
[#1952](https://github.com/lambdaclass/stabileo/pull/1952)
([SA-2026-061](../advisories/SA-2026-061-path-solver-reactions.md)); prescribed constraint-master
motion [#2008](https://github.com/lambdaclass/stabileo/issues/2008) in
[#2009](https://github.com/lambdaclass/stabileo/pull/2009)
([SA-2026-063](../advisories/SA-2026-063-prescribed-master-motion.md), documented by #2069);
truss member-load balance [#1969](https://github.com/lambdaclass/stabileo/issues/1969) in
[#1992](https://github.com/lambdaclass/stabileo/pull/1992); modal mass rank
[#1965](https://github.com/lambdaclass/stabileo/issues/1965) in
[#2007](https://github.com/lambdaclass/stabileo/pull/2007); and elastic SSI refinement
[#2011](https://github.com/lambdaclass/stabileo/issues/2011) in
[#2072](https://github.com/lambdaclass/stabileo/pull/2072). Constrained rounding refusals
[#2013](https://github.com/lambdaclass/stabileo/issues/2013),
[#2014](https://github.com/lambdaclass/stabileo/issues/2014),
[#2015](https://github.com/lambdaclass/stabileo/issues/2015),
[#2016](https://github.com/lambdaclass/stabileo/issues/2016),
[#2017](https://github.com/lambdaclass/stabileo/issues/2017) and
[#2018](https://github.com/lambdaclass/stabileo/issues/2018) are done in
[#2075](https://github.com/lambdaclass/stabileo/pull/2075). Re-run affected analyses and derived
checks. Unsupported dynamic forces and staged histories remain explicitly unavailable or refused;
loaded-member removal now refuses instead of returning an unredistributed answer.

Harness reflections [#1991](https://github.com/lambdaclass/stabileo/pull/1991) and the regression
audit [#1946](https://github.com/lambdaclass/stabileo/pull/1946) have merged. The
[November 13 triage](../verification/triage/2026-11-13.md)
([#2070](https://github.com/lambdaclass/stabileo/pull/2070)) established no new silent wrong results;
false refusals and harness defects remain distinct from corrected engineering results.

In flight: [#2023](https://github.com/lambdaclass/stabileo/issues/2023) in
[#2074](https://github.com/lambdaclass/stabileo/pull/2074), preserving zero-work released loads
across rotations and unit changes. Follow-ups:
[#2073](https://github.com/lambdaclass/stabileo/issues/2073) for test-strength and deferred review
items from #1952; [#2077](https://github.com/lambdaclass/stabileo/issues/2077) for P-Delta
physical-residual failure keeping displacements and clearing result summaries; and
[#2078](https://github.com/lambdaclass/stabileo/issues/2078) for a consistent treatment of
undetermined released-rotation gauge values in nonlinear solvers.

Decided: [#1996](https://github.com/lambdaclass/stabileo/issues/1996) keeps refusing staged removal of a loaded member; redistribution is a future feature.
Loaded-member removal now refuses in both dimensions. Review follow-ups
[#1997](https://github.com/lambdaclass/stabileo/issues/1997),
[#1998](https://github.com/lambdaclass/stabileo/issues/1998),
[#1999](https://github.com/lambdaclass/stabileo/issues/1999),
[#2000](https://github.com/lambdaclass/stabileo/issues/2000),
[#2001](https://github.com/lambdaclass/stabileo/issues/2001) and
[#2002](https://github.com/lambdaclass/stabileo/issues/2002) remain tracked, along with conservative
false-refusal follow-ups #1951 and #1956. The product roadmap keeps the subsequent investigation
order and dates its historical cause-count snapshot separately; the dashboard has its own generation date.

## Documents

| Document | Answers | Status | Owner |
|---|---|---|---|
| [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) | What we build and in what order; **the backlog with issue links and exit criteria** | Current (2026-11-13 evening): merged reaction, prescribed-motion, truss, modal, SSI and rounding fixes; priorities reordered by expected harm (#1316, #1040/#972, #1318, shell warnings into design, #759); #2023 in flight; #1996 decided (keep refusing) | Federico Carrone |
| [SOLVER_ROADMAP.md](SOLVER_ROADMAP.md) | Solver mechanics, numerical methods, long-term solver sequence (Steps 1–14+) | Long-term sequence current; its "Where we are" and "Wave 1" sections predate v0.2.0 (see the note at its top) | Diego K (last editor) |
| [../../research/DESIGN.md](../../research/DESIGN.md) | Stabileo Research: what it is, its rules, the engine-benchmarks track and the ordered paper queue (summary in PRODUCT_ROADMAP "Stabileo Research") | Current (2026-10-29) | Federico Carrone |
| [AI_ROADMAP.md](AI_ROADMAP.md) | AI capabilities, their order, prerequisites and safety rules | Current as of 2026-10-07 | Diego K (last editor) |
| [INFRASTRUCTURE_ROADMAP.md](INFRASTRUCTURE_ROADMAP.md) | Backend, deployment, auth, persistence, observability | Current as of 2026-10-07 | Diego K (last editor) |
| [../verification/DASHBOARD.md](../verification/DASHBOARD.md) | The numbers: open `safety` issues, Rust vs TypeScript share, certified share, mutation score, coverage, differential and fuzz volume, per release | Generated by `scripts/verification-metrics.py` | CI (`verification-dashboard` workflow) |
| [../verification/MATURITY.md](../verification/MATURITY.md) | How well verified each analysis, element family and design check is (Certified > Benchmarked > Differential > Tested > Unverified), with evidence | Generated by the same script | CI |
| [../SAFETY_ADVISORIES.md](../SAFETY_ADVISORIES.md) | What we do when a released version produced a wrong or unconservative result; advisories in [../advisories/](../advisories/) | Current | Release manager |
| [../WORKFLOW.md](../WORKFLOW.md) | How work is done: one branch + PR per workstream, review before merge, integration branch per wave, labels | Current | Maintainers |
| [../POSITIONING.md](../POSITIONING.md) | Market framing and competitive wedge | Current | Federico Carrone |

Owners marked "last editor" are taken from git history; no CODEOWNERS file assigns roadmap
documents yet (see [#355](https://github.com/lambdaclass/stabileo/issues/355)).

## Supporting material (not roadmaps)

- [../research/](../research/README.md): research notes, including
  [beyond_roadmap_opportunities.md](../research/beyond_roadmap_opportunities.md) (frontier
  opportunities: GNN surrogates, digital twins, UQ) and
  [post_roadmap_software_stack.md](../research/post_roadmap_software_stack.md) (software to
  build on top of the solver; summarised in PRODUCT_ROADMAP "Post-Core Software Stack"). Both
  moved here from `docs/roadmap/` on 2026-10-18.
- [../verification/](../VERIFICATION.md): how each result is verified (certificates, Lean, Kani,
  differential testing, feature matrix, worked examples).
- [../releases/](../releases/v0.2.0.md): release notes; [../../CHANGELOG.md](../../CHANGELOG.md).
- [../MERGE_PLAN_SAFETY_WAVE.md](../MERGE_PLAN_SAFETY_WAVE.md): the record of how the October 2026
  safety wave (#275–#302) was merged; referenced by the v0.2.0 release notes.
- [../handoffs/](../handoffs/): historical working notes from the PR15–PR20 RC/steel workstreams
  (July–September 2026). Kept in place because they cross-reference each other and the code; they
  describe decisions, not current plans.

## Archived

Superseded documents are in [../archive/](../archive/README.md), each with the reason and its
replacement: the old workflow (stacked PRs, solver off-limits), the July 2026 "current
state" and PR-restructure notes, the wave-1 agent prompts, and the stub
`ai_structural_engineering_roadmap.md`.

## Rules for these documents

- Plans go in the roadmaps; history goes in the CHANGELOG and release notes.
- A new backlog item gets a GitHub issue with a `roadmap:*` label and a link from
  PRODUCT_ROADMAP; it is added to the tracker #396.
- Numbers are never typed into a roadmap by hand: they come from the dashboard script, which marks
  anything it cannot measure as "not yet measured".
- When a document stops being current, move it to `docs/archive/` with a line in its README; do
  not delete it.
