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

Release **0.6.1** shipped with SA-2026-064 through SA-2026-068. The follow-on fixes shipped
in [**0.6.2**](../releases/v0.6.2.md) on **2026-11-18**:
[#2142](https://github.com/lambdaclass/stabileo/issues/2142) in
[#2169](https://github.com/lambdaclass/stabileo/pull/2169),
[#2143](https://github.com/lambdaclass/stabileo/issues/2143) in
[#2170](https://github.com/lambdaclass/stabileo/pull/2170),
[#2096](https://github.com/lambdaclass/stabileo/issues/2096) in
[#2173](https://github.com/lambdaclass/stabileo/pull/2173),
[#2144](https://github.com/lambdaclass/stabileo/issues/2144) in
[#2175](https://github.com/lambdaclass/stabileo/pull/2175), and
[#2176](https://github.com/lambdaclass/stabileo/issues/2176) and
[#2172](https://github.com/lambdaclass/stabileo/issues/2172) in
[#2197](https://github.com/lambdaclass/stabileo/pull/2197). These cover SA-2026-069 through
SA-2026-074. Re-run affected member designs and analyses. Regenerate all affected generated
area loads, including roof and floor loads, before recalculating; stored loads alone are insufficient.

**Soundness remains first.** The [November 17–18 findings](PRODUCT_ROADMAP.md#november-1718-soundness-findings)
cover support restraints, gravity loads, combinations and concrete detailing. The
[design and load audit](PRODUCT_ROADMAP.md#design-and-load-audit-active-work-2026-11-18)
has the issue and fix map. The general **under audit** notice is on main in [#2228](https://github.com/lambdaclass/stabileo/pull/2228).

- Shipped in 0.6.2: narrow member loads and force balance in [#2223](https://github.com/lambdaclass/stabileo/pull/2223), gravity transfer, seismic
  mass and combined diagram peaks in [#2282](https://github.com/lambdaclass/stabileo/pull/2282), and ambiguous or unknown 3D supports in [#2277](https://github.com/lambdaclass/stabileo/pull/2277).
  Regenerate affected gravity and seismic loads. Confirm the intended 3D support restraints
  and rerun affected analyses, combinations and design checks.
  [SA-2026-089](../advisories/SA-2026-089-roller-z-fixed.md)
- Done on main: Heyman’s masonry arch experiment in [#2257](https://github.com/lambdaclass/stabileo/pull/2257), along with [#2272](https://github.com/lambdaclass/stabileo/pull/2272), [#2288](https://github.com/lambdaclass/stabileo/pull/2288)
  and [#2305](https://github.com/lambdaclass/stabileo/pull/2305). The [other follow-ups](PRODUCT_ROADMAP.md#other-follow-ups) include the completed
  steel Memoria item [#2303](https://github.com/lambdaclass/stabileo/issues/2303).
- Shipped in 0.6.2: the secondary stirrup leg fix [#2171](https://github.com/lambdaclass/stabileo/issues/2171). Re-run affected concrete member designs. [SA-2026-075](../advisories/SA-2026-075-cirsoc201-secondary-stirrup-legs.md)
- Wave 1 open findings: [#2202](https://github.com/lambdaclass/stabileo/issues/2202) (conservative), [#2208](https://github.com/lambdaclass/stabileo/issues/2208), [#2209](https://github.com/lambdaclass/stabileo/issues/2209), [#2212](https://github.com/lambdaclass/stabileo/issues/2212),
  [#2213](https://github.com/lambdaclass/stabileo/issues/2213), [#2214](https://github.com/lambdaclass/stabileo/issues/2214), [#2215](https://github.com/lambdaclass/stabileo/issues/2215), [#2216](https://github.com/lambdaclass/stabileo/issues/2216), [#2217](https://github.com/lambdaclass/stabileo/issues/2217), [#2218](https://github.com/lambdaclass/stabileo/issues/2218) and [#2225](https://github.com/lambdaclass/stabileo/issues/2225).
- Wave 2 open findings, in audit harm order:
  [#2238](https://github.com/lambdaclass/stabileo/issues/2238) (reversed span demands),
  [#2239](https://github.com/lambdaclass/stabileo/issues/2239) (mixed column bars),
  [#2240](https://github.com/lambdaclass/stabileo/issues/2240) (distinct concurrent EC2 states),
  [#2241](https://github.com/lambdaclass/stabileo/issues/2241) (short bottom-bar extent),
  [#2242](https://github.com/lambdaclass/stabileo/issues/2242) (rotated joint shear),
  [#2245](https://github.com/lambdaclass/stabileo/issues/2245) (weak stirrup intervals),
  [#2246](https://github.com/lambdaclass/stabileo/issues/2246) (EC2 support-region steel),
  [#2247](https://github.com/lambdaclass/stabileo/issues/2247) (curved-diagram Cb),
  [#2248](https://github.com/lambdaclass/stabileo/issues/2248) (another member's certificate) and
  [#2249](https://github.com/lambdaclass/stabileo/issues/2249) (zero-moment anchorage check). The fillet weld findings [#2243](https://github.com/lambdaclass/stabileo/issues/2243) and [#2244](https://github.com/lambdaclass/stabileo/issues/2244) are done in [#2258](https://github.com/lambdaclass/stabileo/pull/2258).
- Follow-ups: [#2224](https://github.com/lambdaclass/stabileo/issues/2224),
  [#2226](https://github.com/lambdaclass/stabileo/issues/2226) and
  [#2227](https://github.com/lambdaclass/stabileo/issues/2227).

Testing phases 1 and 2 are done in [#2165](https://github.com/lambdaclass/stabileo/pull/2165)
and [#2167](https://github.com/lambdaclass/stabileo/pull/2167); the tools, verification documents
and testing backlog now live in `testing/`. Further consolidation and generated coverage reporting
remain planned. The Hungarian integration [#2099](https://github.com/lambdaclass/stabileo/pull/2099)
is on main; expanded Research, consolidated Tools, the diagram game, accounts and advertising
measurement remain disabled by default.

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
[November 13 triage](../../testing/docs/audits/triage/2026-11-13.md)
([#2070](https://github.com/lambdaclass/stabileo/pull/2070)) established no new silent wrong results;
false refusals and harness defects remain distinct from corrected engineering results.

Done on main: [#2023](https://github.com/lambdaclass/stabileo/issues/2023) in
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
| [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) | What we build and in what order; **the backlog with issue links and exit criteria** | Current (2026-11-18). Release 0.6.2 shipped with load, diagram and support fixes. The November 17–18 soundness findings are tracked here. | Federico Carrone |
| [testing/ROADMAP.md](../../testing/ROADMAP.md) | Testing and verification backlog, solver proofs, prevention and CI feedback; follows PRODUCT_ROADMAP “Priority now” item 6 | Current | Maintainers |
| [SOLVER_ROADMAP.md](SOLVER_ROADMAP.md) | Solver mechanics, numerical methods, long-term solver sequence (Steps 1–14+) | Long-term sequence current; its "Where we are" and "Wave 1" sections predate v0.2.0 (see the note at its top) | Diego K (last editor) |
| [../../research/DESIGN.md](../../research/DESIGN.md) | Stabileo Research: what it is, its rules, the engine-benchmarks track and the ordered paper queue (summary in PRODUCT_ROADMAP "Stabileo Research") | Current (2026-10-29) | Federico Carrone |
| [AI_ROADMAP.md](AI_ROADMAP.md) | AI capabilities, their order, prerequisites and safety rules | Current as of 2026-10-07 | Diego K (last editor) |
| [INFRASTRUCTURE_ROADMAP.md](INFRASTRUCTURE_ROADMAP.md) | Backend, deployment, auth, persistence, observability | Current as of 2026-10-07 | Diego K (last editor) |
| [../../testing/docs/DASHBOARD.md](../../testing/docs/DASHBOARD.md) | The numbers: open `safety` issues, Rust vs TypeScript share, certified share, mutation score, coverage, differential and fuzz volume, per release | Generated by `scripts/verification-metrics.py` | CI (`verification-dashboard` workflow) |
| [../../testing/docs/MATURITY.md](../../testing/docs/MATURITY.md) | How well verified each analysis, element family and design check is (Certified > Benchmarked > Differential > Tested > Unverified), with evidence | Generated by the same script | CI |
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
- [../VERIFICATION.md](../VERIFICATION.md): how each result is verified (certificates, Lean, Kani,
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
