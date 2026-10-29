# Stabileo Product Roadmap

## Purpose

This is the product roadmap: app features, market sequencing, design/reporting layers, and distribution strategy. It is not the solver mechanics roadmap — for that, see `SOLVER_ROADMAP.md`. Historical progress belongs in `CHANGELOG.md`. This document should stay forward-looking.

For the expanding AI track, see [`AI_ROADMAP.md`](AI_ROADMAP.md).

## Vision

Become the world's best structural engineering software — open-source, browser-based, zero-install. First: match the analytical power of OpenSees/Code_Aster/CalculiX with an accessible visual UX. Then: add design deliverables, diagnostics, and AI-assisted guidance. Later: real-time CRDT collaboration (the Figma moment) and full AI-native design.

Strategic positioning:
- not `broader than every open-source mechanics framework`
- but `the strongest open structural solver product with the clearest visible proof of correctness, the best workflow automation, and the best browser-native UX`

## Competitive Moat

What we have that OpenSees/Code_Aster/CalculiX/SAP2000/ETABS will never have:

1. **Zero-install browser UX** — engineers open a URL and start working
2. **Visual model building** — competitors require scripting or clunky pre-processors
3. **Real-time feedback** — live calc, instant diagrams, interactive 3D
4. **Educational mode** — no competitor explains the math step by step
5. **Modern stack** — their codebases are Fortran/Tcl/C++ from the 90s
6. **Explainable diagnostics and review workflows** — warnings, provenance, result trust, comments, and guided fixes as first-class product surfaces
7. **AI-assisted engineering UX** — guided modeling, result queries, and code/design suggestions built on structured solver outputs
8. **CRDT collaboration** — later Figma-style real-time multi-user editing on top of a trusted structural core
9. **Verification as a product surface** — public benchmarks, acceptance models, reproducible runs, and trust signals visible to users rather than hidden in backend engineering
10. **Certified results** — linear, modal, buckling, P-Delta, spectral, harmonic, time-history and plastic results and the AISC/EC3/EC2 checks carry machine-checkable error bounds (`docs/verification/CERTIFY.md`), re-checkable in Lean; no commercial package proves its answers

## Product Thesis

Dedaliano should win in this order:

1. structural solver trust
2. code checks, steel/RC design workflows, and first automation surfaces
3. automatic load generation and code-driven combinations
4. reports and documentation
5. diagnostics, review workflows, and AI-assisted guidance
6. lightweight collaboration and shareable review flows
7. dynamic analysis and nonlinear materials (what OpenSees is famous for)
8. foundations and deeper connection/detail workflows
9. construction staging, fire, progressive collapse
10. seismic engineering workflow (end-to-end)
11. interoperability and BIM-connected workflows
12. broader material codes (timber, masonry, composite)
13. desktop, API, and firm workflow packaging
14. optimization, full collaboration, and broader AI workflows

That matches how structural firms buy software:

`can it analyze -> can it handle real loads -> can it design -> can it produce deliverables -> can it fit our workflow -> can my team use it together`

ROI order for users:
1. stable analysis they can trust
2. automation that removes repetitive hand-work immediately
3. steel/RC design outputs they can use daily
4. reports and deliverables they can issue
5. diagnostics, review, and guidance that reduce failure/debug time
6. lightweight collaboration that makes review and sharing easier
7. workflow polish and breadth after the above are solid

## Overall order (2026-10-29)

1. **Safety first.** Close the ways a wrong result can reach users: containment of every open
   wrong-result issue (#447), the fixes in "Priority now" below, the metamorphic invariance suite,
   independent engineer sign-off. Growth multiplies whatever is there, including wrong results; one
   public mistake costs more than any number of good pages earn. Security belongs here too: backend
   security tests and a tested backup restore (#721), staging before production (#724), the policy for
   outside contributions (#726), supply-chain pinning, and isolation of anything that runs untrusted or
   old code (research snapshots on their own origin, #777).
2. **Speed and the first run.** Public pages and the app load fast (Lighthouse performance ≥ 90 on
   public pages; the app today scores 25, #734) and a new visitor builds and solves a first model in
   under a minute with a guided start. Cheap, and it multiplies every growth channel below.
3. **A Python package and API** (`pip install stabileo`, notebook-friendly, the same engine as the app,
   built on the versioned engine interface #731): models built and solved from scripts and notebooks,
   results as arrays, the same refusals and known-issue warnings as the app. Researchers, automation and
   parametric design build on Stabileo; every benchmark, paper and tool becomes scriptable.
4. **A public verification manual,** generated from the engine benchmarks, the metamorphic suite and the
   certificates: every case runnable in the browser, failures shown honestly, always current. A trust
   asset no commercial PDF manual matches, and it ranks for "verification" searches.
5. **Import from the programs engineers already use** (SAP2000 `.s2k`, ETABS `.e2k`, IFC, DXF) and
   export reports they can hand in: removes the biggest switching cost.
6. **Latin American codes:** NBR (Brazil), NSR-10 (Colombia), NTE E.030/E.060 (Peru), NCh (Chile) next to
   CIRSOC, each with independent sign-off (#450): the obvious choice in a region served poorly and
   expensively.

7. **The AI assistant stage,** after safety, speed and the growth and SEO work above, so it lands on
   trustworthy results and an audience that's already there (capabilities, order and safety rules in
   [AI_ROADMAP.md](AI_ROADMAP.md)): describe a structure or upload a sketch, plan or PDF and get a model;
   explain results and warnings; check a model for common mistakes; drive Stabileo through the Python
   API. Every AI suggestion is a model or a change the user sees and the engine solves and verifies;
   the AI is never the authority on a result, and it shows the same known-issue warnings and refusals.
   This is when "AI" moves from "coming" to the centre of the positioning.

**Growth channels, alongside:** Stabileo Research, Stabileo Tools and shared models (section "Growth"
below), with search work, previews, phone and tablet quality and frozen citable versions as multipliers.
**Supporting:** universities when there's capacity (free classroom accounts, assignments as forkable models, textbook problems as examples); a community (forum or Discord, model of the week, short walkthrough videos, university
webinars), institutions (professional councils, INTI/CIRSOC, Ergodic Group's network),
privacy-respecting analytics to see which tools, papers and shares turn into engineers who return, and
and outreach to engineers and paper authors.

## Priority now: catch wrong results before they ship (2026-10-28)

Before new features, close the ways a wrong result can still reach users unnoticed. Each gap below
was exposed in the week of 2026-10-21: a steel verdict change merged with no changelog or re-check
entry (#461), the nightly verification failing four days with nobody told, a raw i18n key shown as
a project name. These items come first in every section below; work on new features goes after
them.

| Order | Item | Issue | Section |
|---|---|---|---|
| 1 | **Results snapshot gate:** a reference corpus solved on every PR; any changed number, verdict or refusal fails CI unless the PR registers the result change | [#716](https://github.com/lambdaclass/stabileo/issues/716) | Release safety |
| 2 | **Nightly verification that is green and alerts:** fix the runs failing since 2026-10-24; every scheduled failure opens an issue | [#717](https://github.com/lambdaclass/stabileo/issues/717), [#354](https://github.com/lambdaclass/stabileo/issues/354) | Trust and verification |
| 3 | **Old project files:** a corpus saved by every release and file format; each opens, migrates and gives the same results | [#718](https://github.com/lambdaclass/stabileo/issues/718) | Release safety |
| 4 | **Design checks against published worked examples,** chosen and signed off by an independent structural engineer (code manuals, INTI/CIRSOC example books, textbooks) | [#450](https://github.com/lambdaclass/stabileo/issues/450), [#360](https://github.com/lambdaclass/stabileo/issues/360) | Trust and verification |
| 5 | **No raw i18n key visible,** web and desktop, every language | [#719](https://github.com/lambdaclass/stabileo/issues/719) | Release safety |
| 6 | **Production health check** after every deploy and hourly (stabileo.com and staging) | [#720](https://github.com/lambdaclass/stabileo/issues/720) | Release safety |
| 7 | **Backend security tests and a tested backup restore** | [#721](https://github.com/lambdaclass/stabileo/issues/721) | Release safety |
| 8 | **Exported documents:** visual regression for PDF reports, DXF drawings and exports | [#722](https://github.com/lambdaclass/stabileo/issues/722) | Trust and verification |
| 9 | **Desktop app:** install scripts, update from one version to the next, launch on each OS (macOS by hand: no WebDriver for its webview) | PR [#663](https://github.com/lambdaclass/stabileo/pull/663) | Release safety |
| 10 | **Staging before production:** each main commit deploys to staging, passes the health check, then the same build is promoted | [#724](https://github.com/lambdaclass/stabileo/issues/724) | Release safety |
| 11 | **Review before merge, enforced:** CODEOWNERS, a second reviewer for result and verdict changes, and a check that every required check still exists | [#725](https://github.com/lambdaclass/stabileo/issues/725), [#470](https://github.com/lambdaclass/stabileo/issues/470), [#355](https://github.com/lambdaclass/stabileo/issues/355) | Release safety |
| 12 | **Policy for outside contributions:** bounty-style and AI-generated PRs, duplicates, credit, re-implementing low-trust fixes | [#726](https://github.com/lambdaclass/stabileo/issues/726) | Release safety |
| 13 | **Safety advisories emailed** to affected users once accounts exist | [#727](https://github.com/lambdaclass/stabileo/issues/727) | Release safety |
| 14 | **MITC4 shells under in-plane bending on distorted meshes** are about 10× too stiff (MacNeal–Harder: −92% trapezoidal, −90% parallelogram; regular meshes within 2%). First register it and warn users when such elements are distorted, then fix the membrane (enhanced/incompatible modes or a drilling membrane) with result-change registration. Found by the research benchmark page (#797) | [#798](https://github.com/lambdaclass/stabileo/issues/798) | Trust and verification |

**Status of the safety work (2026-10-29):**

| Item | Issue / PR | State |
|---|---|---|
| Contain every open wrong-result issue (warn or refuse; no number changes) | #447 / PR #807 | eight review rounds; each found a further bypass path, now closed |
| Metamorphic invariance suite (units, renumbering, member direction, rigid motion, reciprocity) | PR #813 | in review; the generators don't yet rediscover #758–#762 on their own |
| Solid-shell stresses in global axes (a vertical plate read 0) | #757 / PR #814 | fixed, registered; one browser test on the result-change notice to finish |
| Buckling factor outside its certified bounds still certified | #741 / PR #817 | fixed (bounds proven sound by exact arithmetic; certification refused); follow-up #818 |
| Modal analysis skipped repeated modes of symmetric structures | #759 / PR #827 | real solver bug (a 837 Hz mode missing); fix by a Sturm-sequence count, no model-size limit |
| 2D plastic collapse factor not invariant (up to 4.6×) | #758 | two approaches failed; needs a redesign of mechanism detection; refused until then |
| MITC4 in-plane bending on distorted meshes (−92%) | #798 | found by the MacNeal–Harder page; contained by refusal |
| MITC4 Scordelis–Lo roof plateau (−15%), pinched cylinder diverging | #810 | found by the shell obstacle course; under triage |
| Already fixed on main, closed with evidence | #442, #443, #444, #445 | closed |

Reviews: Codex plus Kimi; while Kimi is out of quota, Grok (then an adversarial Codex review) is the
second reviewer.

Needs people, not only code: item 4's engineer sign-off; real users' project files for item 3's
corpus; production access for item 7's restore test; testers on real Linux GPUs for the desktop's
3D viewer.

## Multipliers

> **Backlog conventions.** The five backlog sections below (Multipliers, Trust and verification, Engineering coverage, Solver and proof depth, Release safety) are the single backlog. Every item links to its GitHub issue; the tracker is [#396](https://github.com/lambdaclass/stabileo/issues/396). Each section ends with **exit criteria** (when the section is done) and the **metrics** that track them. The metrics are computed by `scripts/verification-metrics.py` and published on the verification [dashboard](../verification/DASHBOARD.md) (current values and per-release history); a metric that cannot be measured yet says "not yet measured" there, never an estimate. Per-item verification levels are in [MATURITY.md](../verification/MATURITY.md). Entry point for all roadmap documents: [README.md](README.md).

The Product Thesis orders what to build for firms to buy. This section ranks what would make the product an order of magnitude more useful, not incrementally better. Engineers spend most of their time modelling, iterating and documenting, not waiting for a solver, so the multipliers are workflow, not numerics. Each builds on verification: none is worth shipping on results that can be silently wrong.

1. **Drawings / BIM → analytical model.** [#344](https://github.com/lambdaclass/stabileo/issues/344) Import IFC (then Revit via IFC, DWG, PDF plans) and propose the analytical model: structural vs architectural elements, centrelines and surfaces snapped to grids, sections, supports, and loads from room uses (CIRSOC 101). Every inference is listed as an assumption the engineer accepts or fixes, never applied silently; the model sanity review then checks it. Modelling goes from days to minutes; the engineer judges assumptions instead of drafting lines.
   *Exists:* `web/src/lib/ifc/` (IFC parse and mapping), `web/src/lib/cad/` (DXF plan wizard, opt-in inferences recorded as assumptions), `web/src/lib/ai/` (`build-model`). *Missing:* one guided import → assumptions → sanity review → analyse flow, real-world idealisation (offsets, members that don't meet, walls with openings), loads from room uses, PDF/vision, and a measured corpus of architect files vs engineer-built models. Related: Interoperability in Phase 2, `sketch-to-model` in the AI roadmap.

2. **AI senior-engineer reviewer.** [#345](https://github.com/lambdaclass/stabileo/issues/345) Most real failures are conceptual (load path, ignored stiff elements, drift near the limit, a poor structural system), not arithmetic. A reviewer that reads model and results like a senior engineer scales that judgment to every project. Built on the model sanity review (reactions vs loads, weight per m², period vs code formula, tributary cross-checks, unit and plausibility checks). Related: `review-model`, `pre-solve-diagnostics` in the AI roadmap.

3. **Certified results as the product.** [#346](https://github.com/lambdaclass/stabileo/issues/346) A report where every number comes with an auditable bound lets building authorities and independent checkers review faster and lowers liability. Extend certificates to CIRSOC 201, ACI RC, timber, CFS and the nonlinear solvers; show a verification status on every result and check using the levels of [MATURITY.md](../verification/MATURITY.md) (Certified > Benchmarked > Differential > Tested > Unverified; [#440](https://github.com/lambdaclass/stabileo/issues/440)); put provenance in reports.

4. **Real-time design iteration and optimisation.** [#347](https://github.com/lambdaclass/stabileo/issues/347) Instant re-analysis plus automatic search over sections and structural systems, minimising cost, steel, concrete or embodied carbon, every candidate passing certified checks; the engineer picks from a Pareto front. Embodied-carbon reporting from the bill of materials comes with it (increasingly mandatory). Related: Automated design iteration in Phase 4, `section-optimizer`.

5. **Existing-building assessment and retrofit.** [#348](https://github.com/lambdaclass/stabileo/issues/348) Latin America has millions of seismically vulnerable buildings, mostly RC frames to old codes. Model from survey, check against the original and current codes, propose retrofits (jacketing, bracing, walls), prioritise portfolios for cities, insurers and banks. Large and underserved.

6. **Latin American codes done properly** [#349](https://github.com/lambdaclass/stabileo/issues/349) — CIRSOC, NSR-10, NTC, NCh, NBR with clause-level traceability; the large vendors treat them as an afterthought.

7. **Model → permit pipeline** [#350](https://github.com/lambdaclass/stabileo/issues/350) — analysis, design, detailing, drawings, bill of materials and an authority-ready calculation report from one model, without re-entry between tools.

8. **Stabileo as an engine for agents** [#351](https://github.com/lambdaclass/stabileo/issues/351) — model building, analysis, checks and certificates exposed as an API / MCP server, so other tools and AI agents can call certified structural analysis.

9. **Collaboration** [#352](https://github.com/lambdaclass/stabileo/issues/352) — versioned, branchable models, comments on members, engineer/checker approvals (see CRDT collaboration).

10. **Digital twin** [#353](https://github.com/lambdaclass/stabileo/issues/353) — sensor data and model updating after construction or an earthquake (see [`../research/beyond_roadmap_opportunities.md`](../research/beyond_roadmap_opportunities.md) §10).

Order of work: 1–3 first (they remove the largest time sink, catch the errors tests cannot, and are unique), then 4–5.

**Exit criteria (Multipliers).** A multiplier is done when it ships in a tagged release and meets its measurable target:

| # | Exit criterion |
|---|---|
| 1 | On a corpus of at least 20 real architect files (IFC/DWG) with engineer-built reference models, the import matches at least 90 % of structural members and supports, every inference appears as an assumption the engineer accepted or fixed (0 applied silently), and the model sanity review passes on the accepted model. Modelling time per project is measured against the manual baseline. |
| 2 | On a corpus of seeded-error models (load path, ignored stiff elements, drift, unit mix-ups, period vs code formula), the reviewer flags at least 90 % of seeded errors with at most one false alarm per clean model; every finding cites the check that produced it. |
| 3 | Every number in the PRO calculation report carries its verification level and provenance; all analyses and design checks used by the report are **Certified** in MATURITY.md, or the report says which are not. |
| 4 | Every candidate on the Pareto front passes certified checks; the optimiser reports cost, steel/concrete quantity and embodied carbon from the bill of materials. |
| 5 | Assessment of an existing RC frame against the original and the current code, with at least one retrofit option, reproduces a published assessment case within its stated tolerance. |
| 6 | Each supported Latin American code has a clause → implementation → test → published-example map enforced in CI (see Trust item 7) with no clause without a test. |
| 7 | One model produces analysis, design, detailing, drawings, bill of materials and an authority-ready report with no re-entry, demonstrated on the acceptance-suite buildings. |
| 8 | The API / MCP server exposes model building, analysis, checks and certificates with the same verification levels as the app, and an agent can reproduce an acceptance-suite case end to end. |
| 9 | Versioned, branchable models with engineer/checker approval recorded in the report. |
| 10 | Model updating from sensor data reproduces a published identification benchmark (e.g. the ASCE SHM benchmark in the acceptance suite) within its tolerance. |

**Metrics.** Backlog issues closed per section (`roadmap:multiplier` count on the [dashboard](../verification/DASHBOARD.md)); per multiplier, the corpus measure in its row above, added to the dashboard when its corpus exists ("not yet measured" until then).

### Trust and verification backlog

What remains after the October 2026 safety wave (certified solver, differential testing against seven solvers, fuzzing and mutation testing, feature matrix, certified design checks, model sanity review). Each item closes a way results can still be silently wrong or a way verification can silently stop working.

1. **Verification jobs that actually run.** [#354](https://github.com/lambdaclass/stabileo/issues/354) (PR [#326](https://github.com/lambdaclass/stabileo/pull/326)) Nightly fuzzing, mutation testing and the Code_Aster / OpenSees / Frame3DD / PyNite / Mystran / Kratos / CalculiX differential jobs run on schedule, and a failure alerts someone (issue or notification). A job that never runs protects nothing.
2. **Protected main.** [#355](https://github.com/lambdaclass/stabileo/issues/355) Required checks (engine, web, e2e, Kani, Lean, symbolic) before merge; CODEOWNERS so solver, certificate and design-check changes need a second reviewer.
3. **Discretization error.** [#356](https://github.com/lambdaclass/stabileo/issues/356) (PR [#327](https://github.com/lambdaclass/stabileo/pull/327)) Certificates bound the algebraic error of the discretized model, not the mesh error. A posteriori estimators (e.g. Zienkiewicz–Zhu) for shells, plates and solids, automatic convergence checks, and a discretization-error estimate shown next to every certified result.
4. **Sensitivity to assumptions.** [#357](https://github.com/lambdaclass/stabileo/issues/357) How much governing results move when uncertain assumptions change (support fixity, cracked-section stiffness modifiers, spring values, connection rigidity), so engineers see which assumptions matter.
5. **Physics invariants on every model (metamorphic testing).** [#358](https://github.com/lambdaclass/stabileo/issues/358) (PR [#332](https://github.com/lambdaclass/stabileo/pull/332)) Rigid rotation, mirroring, node renumbering and unit scaling leave physical results unchanged; superposition and Maxwell–Betti reciprocity hold for linear analyses; external work equals strain energy. Run across all analyses and the whole example corpus; no reference solution needed.
6. **Units in the type system.** [#359](https://github.com/lambdaclass/stabileo/issues/359) Dimensioned quantities in Rust and TypeScript, so kN/N and m/mm mix-ups fail to compile instead of producing wrong numbers.
7. **Clause traceability enforced in CI, and independent implementations.** [#360](https://github.com/lambdaclass/stabileo/issues/360) A machine-readable map clause → implementation → tests → published example; CI fails when a clause has no test. The most-used checks (CIRSOC 201, CIRSOC 301) get a second implementation written from the clause text alone, compared on random inputs.
8. **Re-check prompt for old projects.** [#361](https://github.com/lambdaclass/stabileo/issues/361) (PR [#328](https://github.com/lambdaclass/stabileo/pull/328)) When a saved project opens in a version whose results changed for its features, say what changed and offer to re-run. *In progress (#328): registry of result changes, solve stamps, blocking notice, stale marking — `docs/verification/PROVENANCE.md`.*
9. **Reproducibility and provenance.** [#362](https://github.com/lambdaclass/stabileo/issues/362) (PR [#328](https://github.com/lambdaclass/stabileo/pull/328)) Every report records the version, commit and certificate hashes, so anyone can reproduce it bit for bit. *In progress (#328): provenance block in every report, reproduce dialog and CLI, determinism fixes and test — `docs/verification/PROVENANCE.md`.*
10. **Opt-in field telemetry.** [#363](https://github.com/lambdaclass/stabileo/issues/363) Solver refusals, diagnostics and crashes from real use (opt-in, no model content without consent), to learn how real models fail.
11. **More formal proofs.** [#364](https://github.com/lambdaclass/stabileo/issues/364) More kernels proved in Lean, and machine-checked correspondence between the Rust implementation and the proved algorithm for the critical kernels.
12. **Performance and scale regression tracking.** [#365](https://github.com/lambdaclass/stabileo/issues/365) Solve time, memory, iteration counts and sparse/dense crossover tracked per release on the benchmark and acceptance models (docs/VERIFICATION.md layer 8), with a failing gate on large regressions.
13. **Result badges use the verification maturity levels.** [#440](https://github.com/lambdaclass/stabileo/issues/440) Every result and design-check row shows its level from [MATURITY.md](../verification/MATURITY.md) (Certified > Benchmarked > Differential > Tested > Unverified), read from `docs/verification/dashboard.json` at build time so the badge cannot drift from the matrix; an open `safety` issue affecting the item is shown with it.
14. **Variant analysis after every bug.** [#448](https://github.com/lambdaclass/stabileo/issues/448) After each confirmed bug, search the codebase for the same bug class and add a check that catches the class, not only the instance. Classes seen so far: frame / rotation / sign conventions (#435, #418, #419), unit conversions (#423), double counting, NaN or degenerate input accepted (#335, Lb = 0, zero capacity passing), silent drops (constraints on supported nodes, member couples #343, features an analysis ignored). Each fix records the class, the search, other instances found and the class-level check added (lint, property test, metamorphic invariant, feature-matrix cell, fuzz property).
15. **Textbook example library.** [#450](https://github.com/lambdaclass/stabileo/issues/450) Hundreds of solved problems from standard texts (Hibbeler, Kassimali, McCormac, Gere and similar) as automated engine tests: printed inputs, printed answers as references at the printed precision, a citation per case. Small and many, unlike the building-scale acceptance suite (Coverage item 7); unlike `engine/tests/reference/`, they call the engine.
16. **Every new check ships with a negative case.** [#451](https://github.com/lambdaclass/stabileo/issues/451) Every new design check, test, certificate check, CI gate or alert comes with an input or mutation that must make it fail, run in CI; the existing gates are audited once for the same.

Beyond software: an independent licensed structural engineer reviews worked examples, clause readings and sample reports; real anonymised projects from engineering firms (with their SAP2000/ETABS/RFEM models and results, and the architect's IFC/DWG where available) join the acceptance suite and the BIM-import corpus; the design-code manuals with worked examples (AISC Design Examples, INTI/CIRSOC example books, AWC NDS, TMS 402, AISI Cold-Formed Steel Design Manual) are obtained so checks are tested against published numbers rather than hand-worked ones.

**Exit criteria (Trust and verification).**
- Every verification job (nightly fuzzing per target, Rust mutation testing, the seven differential harnesses, Lean, Kani, symbolic) runs on `main` at least weekly, publishes its numbers as a CI artifact read by the [dashboard](../verification/DASHBOARD.md), and a failure opens an issue; no Trust metric reads "not yet measured".
- 0 untriaged differential mismatches: every mismatch in the latest run per harness is a fixed bug, a known open issue, or a documented modelling difference.
- `main` is protected with the required checks and CODEOWNERS (item 2).
- Every certified shell, plate and solid result shows a discretization-error estimate (item 3).
- Physics invariants (item 5) run on 100 % of the example and acceptance corpus with 0 violations.
- The result badges (item 13) show the MATURITY.md level on 100 % of result views and design-check rows.
- Variant analysis (item 14): 100 % of bugs closed after it lands have a variant-analysis note; every bug class listed has at least one class-level automated check in CI.
- Textbook library (item 15): at least 300 solved problems, at least 20 per analysis family that textbooks cover, each citing its source, 0 failing.
- Negative cases (item 16): 100 % of checks, tests and gates added after it lands have a negative case, and every existing gate has one after the audit.

**Metrics** (all on the [dashboard](../verification/DASHBOARD.md)): differential models compared, agreeing and mismatching per harness; fuzz executions per night; share of analyses and of design checks that are Certified (MATURITY.md); open `safety` issues; `roadmap:verification` issues closed; textbook problems in the library and bug classes with a class-level check ("not yet measured" until items 14–15 land).

### Engineering coverage backlog

Places where Stabileo still computes something unverified, refuses something engineers need, or has two implementations of the same rule.

1. **One proven implementation: TypeScript calls the engine.** [#390](https://github.com/lambdaclass/stabileo/issues/390)–[#395](https://github.com/lambdaclass/stabileo/issues/395) (PR [#321](https://github.com/lambdaclass/stabileo/pull/321), PR [#402](https://github.com/lambdaclass/stabileo/pull/402)) Every engineering result comes from the Rust engine (certified where possible); TypeScript only formats, searches and draws, and keeps its old duplicates only as test oracles (`docs/verification/TS_ENGINE_LOGIC.md`). Remaining areas:
   - concrete: every CIRSOC 201 section shape (flanged, circular, capacity, interaction diagrams, `cirsoc-flex`), slabs (`losas.ts`), bar layouts and the legacy designer, which should size against the engine ([#390](https://github.com/lambdaclass/stabileo/issues/390));
   - steel inputs still computed in TypeScript and fed to the Rust checker: Cb (`moment-gradient.ts`), J/Cw/Z (`section-constants.ts`), unbraced lengths, torsional and flange buckling, material family, the effective net area from end connections ([#391](https://github.com/lambdaclass/stabileo/issues/391));
   - analysis duplicates: diagrams, station forces and design forces, combinations, spectral combination, moving loads, plastic collapse, direct analysis, prestress, rigid diaphragms, kinematic checks, shell load integration and stresses, torsion flow, warping, mass sources ([#392](https://github.com/lambdaclass/stabileo/issues/392));
   - footings (eccentricity, service vs factored loads, flexure) and load generation (wind, snow, seismic, combinations) in Rust ([#393](https://github.com/lambdaclass/stabileo/issues/393));
   - no silent fallbacks: when the engine is unavailable the app says so instead of computing in TypeScript ([#394](https://github.com/lambdaclass/stabileo/issues/394));
   - the teaching solvers (`steps/*`, `solver-detailed*`) are checked against the engine on every model they support ([#395](https://github.com/lambdaclass/stabileo/issues/395)).
2. **Missing design checks:** [#366](https://github.com/lambdaclass/stabileo/issues/366) RC biaxial bending, torsion and slenderness magnification (today not re-checked, and each result says so); CIRSOC 301 F.7–F.11 (boxes, tubes, tees, angles in flexure — refused today); angles in flexure; EC3 Class 1/2 plastic interaction (6.2.9.1); cantilever load-height Cb; beam flexure with axial force; the legacy CIRSOC 201 column verdict computed as compression when the member is in tension; CIRSOC 301 angle arrangements other than back to back (star, starred, single angles in other configurations).
3. **Certificates still missing:** [#367](https://github.com/lambdaclass/stabileo/issues/367) large-displacement (co-rotational) and material-nonlinear results; masonry, connections, foundations and serviceability checks.
4. **Published worked examples** [#368](https://github.com/lambdaclass/stabileo/issues/368) (PR [#333](https://github.com/lambdaclass/stabileo/pull/333)) for masonry, foundations, serviceability, timber and cold-formed steel, and published (not only hand-worked) examples for CIRSOC 301, AISC E7 and EC3 Class 4.
5. **Mechanism detection everywhere:** [#369](https://github.com/lambdaclass/stabileo/issues/369) (PR [#331](https://github.com/lambdaclass/stabileo/pull/331)) the exact free-motion check in 2D and with constraints, connectors and inclined supports, and for local mechanisms, with zero false positives on the model corpus.
6. **Known solver gaps:** [#370](https://github.com/lambdaclass/stabileo/issues/370) material-nonlinear continues after an unconverged increment instead of returning the last converged state; co-rotational refuses prescribed displacements and thermal loads; 3D truss-only nodes inside frames are refused; harmonic refuses a response point on a constrained DOF; spectral analysis reports no shell stresses; beam lumped/consistent mass has no rotary inertia (an option for it, as Kratos and other codes include, matters for modal results of deep members; nodal masses and rotary inertia [#341](https://github.com/lambdaclass/stabileo/issues/341), PR [#399](https://github.com/lambdaclass/stabileo/pull/399)); the rigid diaphragm leaves each node's in-plane rotation free [#342](https://github.com/lambdaclass/stabileo/issues/342) (PR [#397](https://github.com/lambdaclass/stabileo/pull/397)). Open `safety` defects found by the verification work and being fixed now: inclined-member loads and member couples [#343](https://github.com/lambdaclass/stabileo/issues/343) (PR [#274](https://github.com/lambdaclass/stabileo/pull/274)), mirrored moments when a 2D model is solved in 3D [#435](https://github.com/lambdaclass/stabileo/issues/435) (PR [#436](https://github.com/lambdaclass/stabileo/pull/436)), SHB8 thickness locking [#400](https://github.com/lambdaclass/stabileo/issues/400) (PR [#401](https://github.com/lambdaclass/stabileo/pull/401)), missing torsional and flexural-torsional buckling [#404](https://github.com/lambdaclass/stabileo/issues/404) and spectral SRSS/CQC and participation [#405](https://github.com/lambdaclass/stabileo/issues/405) (PR [#434](https://github.com/lambdaclass/stabileo/pull/434)), modes dropped on a mechanism [#338](https://github.com/lambdaclass/stabileo/issues/338), the spectral certificate passing on non-finite results [#335](https://github.com/lambdaclass/stabileo/issues/335) (PR [#398](https://github.com/lambdaclass/stabileo/pull/398)). Each has a draft advisory in [`docs/advisories/`](../advisories/).
7. **A public-benchmark acceptance suite** [#371](https://github.com/lambdaclass/stabileo/issues/371) (PR [#337](https://github.com/lambdaclass/stabileo/pull/337)) (CSI and Dlubal verification examples using their independent references, the SAC buildings, FEMA P-695 archetypes) as a release gate.
8. **Example models that are still not realistic:** [#372](https://github.com/lambdaclass/stabileo/issues/372) the token live load in `la-bombonera`, cable-stayed bridge stays without pretension (large dead-load deflection), the offshore deck sag under the flare. Examples teach users; each should model what it claims to.
9. **Reports built from the design results:** [#373](https://github.com/lambdaclass/stabileo/issues/373) the PRO report's slab-steel section was removed because it invented its load, span and f'c; rebuild it from the slab design's own results.
10. **Hardening what stays in TypeScript** [#374](https://github.com/lambdaclass/stabileo/issues/374) (search, detailing, drawing): property tests for detailing invariants (As provided ≥ As required, spacing and cover, no bar collisions, development lengths) and nightly Stryker mutation testing with surviving mutants triaged.
11. ~~**Nodal masses:** lumped masses at nodes (per direction, rotary inertia) and added line/area mass in the engine input, used by every dynamic analysis; the web's mass source sends them instead of copying materials.~~ Done (#341).
12. ~~**Rigid diaphragm rotates as one body:** each slave node's in-plane rotation equals the master's, as SAP2000/ETABS and OpenSees `rigidDiaphragm` (it was left free).~~ Done (#342).

**Exit criteria (Engineering coverage).**
- No engineering result is computed only in TypeScript: 0 TypeScript modules of class (b) or (c) rated high safety in [TS_ENGINE_LOGIC.md](../verification/TS_ENGINE_LOGIC.md), except the teaching solvers and test oracles, and 0 modules left unclassified.
- Feature matrix: 0 cells E / IGN / BAD / K (holds today and must keep holding), and every `~` cell (no independent reference) replaced by ✓ or R.
- Every implemented design check is **Benchmarked** or **Certified** in MATURITY.md, and the CIRSOC 201 and CIRSOC 301 checks have no "uncovered" clause in [DESIGN_EXAMPLES.md](../verification/DESIGN_EXAMPLES.md).
- The public-benchmark acceptance suite is a release gate and covers every analysis that is Certified or Benchmarked, with at least one real building per analysis family.
- TypeScript mutation score (Stryker, critical set) at least 90 %, with every survivor triaged.
- 0 open `safety` issues labelled `roadmap:coverage` or in item 6.

**Metrics** (on the [dashboard](../verification/DASHBOARD.md)): engineering logic in Rust (share of lines, from TS_ENGINE_LOGIC.md classes); TypeScript (b)+(c) modules rated high safety; feature-matrix cells by status; acceptance-suite cases and reference values; TypeScript mutation score; worked-example clause rows by status; `roadmap:coverage` issues closed.

### Solver and proof depth

Closing the gap between "proven" and "right".

1. **End-to-end certificates.** [#375](https://github.com/lambdaclass/stabileo/issues/375) (PR [#403](https://github.com/lambdaclass/stabileo/pull/403)) Today a certificate proves the solution of the f64 `K` and `f` as assembled, not that they represent the model. An independent checker re-assembles `K` and `f` from the model JSON in interval arithmetic from closed-form element formulas (frames first, then shells), so a certificate covers model → K → result. *Frames and trusses (2D and 3D) done: `endToEnd` on the linear certificate, [CERTIFY.md](../verification/CERTIFY.md#end-to-end-certificates); shells, connectors, curved beams and warping next.*
2. **Trusted computing base, audited and enforced.** [#376](https://github.com/lambdaclass/stabileo/issues/376) (PR [#334](https://github.com/lambdaclass/stabileo/pull/334)) No `sorry` and no extra axioms in Lean (`#print axioms` in CI), pinned Lean/mathlib; a document listing everything a certificate assumes; the IEEE rounding the proofs model checked where the code runs (no fast-math or unexpected FMA, identical WASM results across Chrome, Firefox and Safari).
3. **A second, independent certificate checker** [#377](https://github.com/lambdaclass/stabileo/issues/377) (e.g. MPFR or exact rationals) beside the Lean one; agreement of two independently written checkers.
4. **Properties of the design checks,** [#378](https://github.com/lambdaclass/stabileo/issues/378) proved or exhaustively tested: more reinforcement or a larger section never lowers capacity, a larger load never lowers the utilization ratio, φ within its code limits.
5. **Validation against physical experiments,** [#379](https://github.com/lambdaclass/stabileo/issues/379) not only verification: published laboratory tests (RC beams and columns, shake-table frames, Vecchio–Collins panels, connection tests) for the nonlinear material models (concrete, fiber sections, plastic hinges, contact), following ASME V&V 10 / NAFEMS practice.
6. **Convergence-order tests (method of manufactured solutions)** [#380](https://github.com/lambdaclass/stabileo/issues/380) for every shell, plate and solid element: the observed rate matches the theory.
7. **Nonlinear and dynamic robustness:** [#381](https://github.com/lambdaclass/stabileo/issues/381) convergence criteria audited (force, displacement, energy norms), load-step and time-step sensitivity tests, energy-drift monitoring in time history, path following past limit points.
8. **Numerical stress tests:** [#382](https://github.com/lambdaclass/stabileo/issues/382) extreme stiffness ratios, ~10⁶-DOF models, near-singular and unit-extreme models; measure where accuracy degrades and refuse beyond it.
9. **Engine code hygiene:** [#383](https://github.com/lambdaclass/stabileo/issues/383) line and branch coverage per module (llvm-cov), Miri for any `unsafe`, strict clippy, overflow checks on index arithmetic, `cargo audit` in CI.
10. **Documented, peer-reviewed element derivations** [#384](https://github.com/lambdaclass/stabileo/issues/384) (PR [#330](https://github.com/lambdaclass/stabileo/pull/330)) in `docs/SOLVER_REFERENCE.md`: each formulation's derivation and assumptions, reviewable by an independent engineer. The review's findings are issues [#406](https://github.com/lambdaclass/stabileo/issues/406)–[#433](https://github.com/lambdaclass/stabileo/issues/433) (label `derivations`); several are `safety`.

**Exit criteria (Solver and proof depth).**
- Every Certified analysis is certified end to end for frames (model → K, f → result), then for shells (item 1); the trusted computing base is a reviewed document enforced in CI, with 0 `sorry` and no extra axioms in Lean (item 2).
- Every element family in MATURITY.md is Certified (symbolic derivation) or Benchmarked, and every shell, plate and solid passes a convergence-order test (item 6); 0 open `derivations` issues labelled `safety`.
- Rust mutation testing covers all shards at least every 16 days with 0 missed mutants outside the documented equivalents (`.cargo/mutants.toml`).
- Engine coverage (llvm-cov) measured on every release; targets: line coverage at least 85 % and branch coverage at least 75 % in `engine/src/{solver,element,certify}`, with every uncovered region in `certify/` justified.
- Numerical stress tests define the accuracy limits, and the engine refuses models beyond them (item 8).

**Metrics** (on the [dashboard](../verification/DASHBOARD.md)): Rust mutation score (cargo-mutants) and the share of mutants tested; engine line and branch coverage; Lean theorems, Kani harnesses and engine tests; element families by maturity level; `roadmap:solver-proofs` issues closed.

### Soundness multipliers

The step changes in what a result can be trusted for, beyond more tests of the same kind. Each
builds on what exists: metamorphic testing on the corpus (Trust item 5), discretization estimates
(Trust item 3), independent clause implementations (Trust item 7), Rust–Lean correspondence in
general terms (Trust item 11), end-to-end certificates and a second checker (Solver and proof
depth items 1 and 3), design-check properties (item 4) and validation against experiments (item 5).

1. **Check the user's own model on every solve.** [#498](https://github.com/lambdaclass/stabileo/issues/498) Verification runs on our corpus; the bugs that hurt live in users' models. After each solve, in the background: global equilibrium recomputed from the model's loads, not from `K`; a rotated and renumbered twin of the model, solved and compared (the check that found [#488](https://github.com/lambdaclass/stabileo/issues/488) and the batch-3 interactions); an independent re-assembly of `K` and `f` ([#403](https://github.com/lambdaclass/stabileo/pull/403)) compared entry by entry. On any disagreement the result is not shown as verified, and the reason is. "We tested similar models" becomes "this model was cross-checked".
2. **Proof-carrying results.** [#499](https://github.com/lambdaclass/stabileo/issues/499) Every certified result and report carries a certificate bundle, and the Lean checker (`certcheck`) runs in the browser as WASM: a reviewer or an authority presses "verify this report" and checks it offline, without trusting the solver. The trusted base shrinks to the checker and the bundle parser.
3. **The Rust kernels proved against the Lean algorithm.** [#500](https://github.com/lambdaclass/stabileo/issues/500) The main unproved link in [TRUSTED_BASE.md](../verification/TRUSTED_BASE.md): translate the critical kernels (element matrices, transformations, fixed-end forces, certificate checks) to Lean with Aeneas/Charon and prove them, starting with the frame element and the linear certificate.
4. **Guaranteed bounds on discretization error.** [#501](https://github.com/lambdaclass/stabileo/issues/501) For shells, plates and solids the mesh error dominates and only estimates exist. Equilibrated-residual estimators give guaranteed upper bounds on the energy-norm error in linear elasticity: "the true solution is within ±x", not only "the discrete solve is accurate".
5. **Certificates for nonlinear analyses.** [#502](https://github.com/lambdaclass/stabileo/issues/502) Co-rotational, material-nonlinear and fiber analyses are Benchmarked only; certify the converged equilibrium state (residual inclusion with an interval tangent, Newton–Kantorovich as for P-Delta).
6. **The remaining certificate kinds formalized in Lean.** [#503](https://github.com/lambdaclass/stabileo/issues/503) P-Delta, response-spectrum propagation, harmonic, time history, the constraint mapping and the modal positivity hypothesis, all certified today but not formalized.
7. **Contradictory input refused, never resolved silently.** [#504](https://github.com/lambdaclass/stabileo/issues/504) A rigid restraint and a spring on the same DOF made the engine pick the spring ([#488](https://github.com/lambdaclass/stabileo/issues/488)); every such pair of fields in the input is refused by name.
8. **A public bug bounty for wrong results.** [#505](https://github.com/lambdaclass/stabileo/issues/505) Paid, reproducible wrong or unconservative results, by the severity scale of [SAFETY_ADVISORIES.md](../SAFETY_ADVISORIES.md); each accepted report gets a regression test, a postmortem and, where it applies, an advisory. Alongside the independent licensed engineer's review of defined workflows (findings published) and the corpus of real anonymised projects (Trust backlog, "Beyond software").

**Exit criteria (Soundness multipliers).**
- Every linear static and modal solve in the app runs the per-model cross-checks (item 1); disagreements are 0 on the example and acceptance corpus, and each one seen in the field is a triaged issue.
- Every certified result can be exported as a bundle and verified in the browser by the Lean checker (item 2).
- The frame element and the linear certificate are proved in Lean through Aeneas (item 3); every certificate kind in TRUSTED_BASE.md is formalized or listed with the step that is not (item 6).
- Guaranteed discretization bounds are shown for linear MITC4/MITC9 plates and shells (item 4).
- Co-rotational analysis is Certified in MATURITY.md (item 5).
- The engine refuses every contradictory field pair found by the input audit (item 7); the bug bounty is published with its scope and rules (item 8).

**Metrics** (on the [dashboard](../verification/DASHBOARD.md)): share of solves with per-model cross-checks and their disagreements; certified results exportable as bundles; kernels proved through Aeneas; certificate kinds formalized; bug-bounty reports received, accepted and fixed.

### Solver performance and capability

Speed for the workflows engineers repeat, and results that come with a guaranteed accuracy. This section starts after the open unconservative `safety` issues are closed: a faster solver that is still wrong in places is the wrong order.

1. **Profile before optimizing.** A benchmark harness over the acceptance suite, the large examples and synthetic 10⁵–10⁶-DOF frame, shell and building models: time per phase (assembly, ordering, factorization, solve, post-processing, certificates), memory, and iteration counts, tracked per release on the verification dashboard. Every item below is chosen and measured against it.
2. **Re-analysis instead of re-solving.** Keep factorizations across edits; low-rank (Sherman–Morrison–Woodbury) updates when a section, support or load changes; all load cases and combinations solved as one multi-right-hand-side solve. Target: an edit-and-solve cycle on a large model 100–1000× faster than a full re-solve, so design iteration is interactive. Certificates must still cover the updated result.
3. **A stronger sparse direct solver.** Supernodal or multifrontal Cholesky with nested-dissection / METIS-quality ordering; multithreading in the browser (WASM threads with SharedArrayBuffer and cross-origin isolation) and natively; an algebraic multigrid preconditioner for very large shell models; no silent fallback to dense LU on thin-shell meshes (#454). Target: 10–50× on large models.
4. **GPU (WebGPU) for iterative and many-solve workloads:** preconditioned iterative solves, design-search batches, time-history and parameter sweeps, with CPU fallback and results checked against the CPU path to round-off.
5. **Differentiable solver (adjoint sensitivities).** One adjoint solve gives the derivative of a response (drift, a member force, a utilization ratio, a frequency) with respect to every design variable: section properties, member sizes, support stiffness, material values. Turns optimization, sensitivity to assumptions and "which members govern" from thousands of solves into a handful; the foundation for the optimization and AI-reviewer multipliers. Gradients verified against finite differences in CI.
6. **Adaptive refinement to a target accuracy.** The discretization-error estimator drives h-refinement (and p where available) until the estimated error in the governing quantities is below a user target, so "solve to 1 %" replaces "hope the mesh is fine". Estimates stay labelled as estimates, never certified.
7. **End-to-end certificates for every element family:** after frames and trusses (#403), shells, plates and solids, so every displayed number is checked against the model itself, not only against the assembled matrices.
8. **Substructuring and model reduction for buildings:** floors and repeated parts as superelements (static condensation, Craig–Bampton for dynamics) with exact recovery of the internal results, for large building models and for re-analysis of local changes.
9. **One engine, every size:** the same Rust engine running in the browser, natively on the desktop and on a server for very large models, with identical results across all three (the determinism checks extend to native and server builds).

### Release safety

Pushes to main deploy straight to users (GitHub Pages), so a merge is a release.

1. **Staging before production:** [#385](https://github.com/lambdaclass/stabileo/issues/385) deploy main to a staging URL first; promote to production on a tagged release after the full suite, the acceptance suite and a smoke check pass.
2. **Versioned releases with notes:** [#386](https://github.com/lambdaclass/stabileo/issues/386) every release has a version, release notes in English and Spanish, and a prominent "results may change" section listing result-affecting changes and who is affected.
3. **Users of saved projects are told what changed for their model** [#387](https://github.com/lambdaclass/stabileo/issues/387) (see the re-check prompt above), and stale results are marked until re-run.
4. **Dependency upgrades** [#388](https://github.com/lambdaclass/stabileo/issues/388) go through the same gates; major upgrades of numerics-related crates (e.g. exact arithmetic) must leave results bit-identical.
5. **Steel results stay labelled experimental** [#389](https://github.com/lambdaclass/stabileo/issues/389) ("Proven bound", no pass styling) until an independent engineer has reviewed the CIRSOC 301 checks.
6. **Safety advisories.** [#441](https://github.com/lambdaclass/stabileo/issues/441) When a released version produced a wrong or unconservative result, users are told through an advisory with the affected versions and features, how to tell if a model is affected, the fixed version and a workaround: [SAFETY_ADVISORIES.md](../SAFETY_ADVISORIES.md), drafts in [`docs/advisories/`](../advisories/), scoped in-app notices through the re-check registry (PR [#328](https://github.com/lambdaclass/stabileo/pull/328)).
7. **Contain first, fix second.** [#447](https://github.com/lambdaclass/stabileo/issues/447) Per-feature runtime switches (warn or refuse) that the app, the engine API and the MCP server check at solve and check time, so a known dangerous result is contained within hours of confirmation, before the fix is written or released. Every `safety` issue gets a containment step (switch set, or a recorded reason none is needed) before its fix; a switch can only make results more cautious than the bundled default.
8. **Postmortem per safety bug.** [#449](https://github.com/lambdaclass/stabileo/issues/449) Every `safety` defect that reached `main` gets a blameless postmortem in `docs/postmortems/`: timeline, root cause, why the tests, certificates, differential runs and reviews missed it, the new kind of test or check that now catches it, the variant analysis (Trust item 14), and its advisory, which is written from it.

**Exit criteria (Release safety).**
- Every release is tagged, has release notes in English, Spanish and Portuguese with a "results may change" section, and records a row on the [dashboard](../verification/DASHBOARD.md).
- 100 % of `safety` issues fixed in a release have a published advisory (or a recorded reason none is needed) within the timelines of SAFETY_ADVISORIES.md, and the in-app notice reaches the projects that use the affected feature.
- Releases are promoted from staging only after the full suite, the acceptance suite and a smoke check pass (item 1).
- No open `safety` defect older than 30 days without a fix PR or an in-app warning on the affected results.
- Containment (item 7): every `safety` defect has a containment state within 24 hours of confirmation; an e2e test flips a switch and checks that only the affected results are warned or refused.
- Postmortems (item 8): 100 % of `safety` defects fixed after it lands have a postmortem within 10 working days of the fix, each naming a new or extended automated check.

**Metrics** (on the [dashboard](../verification/DASHBOARD.md)): open `safety` issues (the label covers both defects and safety-relevant backlog items); safety advisories published (label `safety-advisory`); `roadmap:release-safety` issues closed; releases recorded in the dashboard history; time from confirmation to containment and postmortems written ("not yet measured" until items 7–8 land).

### Platform and architecture backlog (2026-10-28)

From the desktop-app plan and its reviews (Codex, Kimi): how Stabileo runs on more than the browser
without a second implementation of anything that computes a result.

1. **Desktop app** (Windows, macOS, Linux) with Tauri and the web's WASM engine; phases and install
   in [docs/desktop/README.md](../desktop/README.md). [#728](https://github.com/lambdaclass/stabileo/issues/728), PR [#663](https://github.com/lambdaclass/stabileo/pull/663)
2. **Accounts:** sign in once, never blocking a calculation; PRO entitlement verified offline; AI
   enforced per account; projects stay local; privacy policy (Ley 25.326, GDPR). [#729](https://github.com/lambdaclass/stabileo/issues/729)
3. **`.ded` as a long-term format:** schema, golden files per version, atomic saves with backup,
   crash recovery, newer files refused clearly by older versions. [#730](https://github.com/lambdaclass/stabileo/issues/730)
4. **Versioned engine interface and a CLI:** whole operations (solve and finish, design over
   demands) with job ids, progress, cancellation, structured refusals and provenance, the same for
   WASM, native or server. [#731](https://github.com/lambdaclass/stabileo/issues/731)
5. **Ownership map, then consolidation:** which implementation owns each code check and limit
   state; numerical rules move to Rust where they exist only in TypeScript or disagree. [#732](https://github.com/lambdaclass/stabileo/issues/732)

**Exit criteria.** The desktop app ships signed on three OSes with auto-update and results
identical to the web on the snapshot corpus (#716); every code check and limit state has one
authoritative implementation in the ownership map; `.ded` files from every release open (#718).

### Stabileo Research (2026-10-29)

Published computational-mechanics papers turned into experiments anyone can run, change and check,
at stabileo.com/research, always in Stabileo's own viewer. Plan, rules and the ordered paper queue:
[research/DESIGN.md](../../research/DESIGN.md) and [research/CLAUDE.md](../../research/CLAUDE.md).

1. **Live first:** phase-field fracture (Shauer 2025) and the gallery, PR
   [#769](https://github.com/lambdaclass/stabileo/pull/769); spring networks (Grossman & Boudaoud
   2026), PR [#776](https://github.com/lambdaclass/stabileo/pull/776); 19 more catalogued papers,
   PR [#788](https://github.com/lambdaclass/stabileo/pull/788).
2. **Engine benchmarks track:** classics run by the *production* engine in the browser, with one
   case file shared by the page and the engine's CI tests, and honest pass/fail. MacNeal–Harder
   (PR [#797](https://github.com/lambdaclass/stabileo/pull/797), which found #798), then Riks /
   Crisfield snap-through, the shell obstacle course (Scordelis–Lo, pinched cylinder, hemisphere),
   the Mattiasson elastica, then plastic collapse, Newmark, Navier plate and NAFEMS. These pages
   are public proof the engine is right, and a regression turns them red.
3. **Next papers** (easy, striking, on the engine where possible): topology optimisation
   (Andreassen et al. 2011, then Ferrari & Sigmund 2020 in 3D), Koiter post-buckling of frames
   (Ferrari & Sigmund 2025), snapping arches (Zmyślony, Khan & Biggins 2026) with the cut strip
   (Fehér 2026), form-finding (Pastrana et al. 2026), then layout optimisation (Michell /
   Gilbert & Tyas, with Fairclough et al. 2026) once a conic optimiser is added.
4. **Platform:** frozen, citable versions under `/@<commit>/`, made only for research releases and
   stored once per file and served from their own origin, `snapshots.stabileo.com`, which needs DNS
   records before it can go live (PR [#777](https://github.com/lambdaclass/stabileo/pull/777)); a run-time
   line and preview images/videos; Research as its own page (no editor loaded); embeds; reproducing
   preprints as well as published versions where they differ (the phase-field page reproduces the SSRN
   preprint's iteration counts exactly with the author's code of that date); the
   paper's own figures overlaid on live runs; parameter sweeps in the browser.
5. **Gallery organisation** (as the catalogue grows past 40 papers): **Run it** first — only runnable
   experiments, big cards with a looping preview video, in a hand-set showcase order (newest and most
   impressive first); then **New research** (2020–2026, newest first) and **Classics** (oldest first, as
   a timeline of computational mechanics, where the engine-benchmark pages belong); topic chips and a
   status filter instead of more sections; every card keeps its evidence badge, so importance is never
   confused with verification.
6. **Paper priority** (each checked for implementability first: citation, code/data and licence,
   published numbers, engine gaps, browser feasibility). To show off: topology optimisation (88 lines),
   Riks/Crisfield snap-through, snapping arches (Zmyślony, Khan & Biggins 2026), the Mattiasson
   elastica. To reach current researchers: snapping arches, Ferrari & Sigmund 2025 (after topology
   optimisation, same group), Pastrana et al. 2026 form-finding, then Fairclough et al. 2026 once a conic
   optimiser is added. Live: phase-field fracture (Shauer 2025) and spring networks (Grossman &
   Boudaoud 2026).
7. **Ship first, review after** (research papers only; engine and safety changes keep two reviews
   before main): a paper's first version goes to production on a minimal floor (CI green, research
   isolation, full web unit suite, labelled "first version", claims only what its tests check, no
   overflow on phones); Codex plus Kimi or Grok then review it and findings land as follow-up PRs. Each
   page, its catalogue entry and its changelog fragment state the stage and how many reviews it has had.

   | Paper | Kind | Implemented | Stage | Reviews | Status |
   |---|---|---:|---|---:|---|
   | Shauer 2025, phase-field fracture | new research | ~85% | improved | 8 review rounds before merge (Codex, Kimi on most) | live |
   | Grossman & Boudaoud 2026, spring networks | new research | ~70% | improved | 6 review rounds before merge (Codex, Kimi on most) | live |
   | Andreassen et al. 2011, topology optimisation (88 lines) | classic | ~50% | first version | 0 | shipping |
   | Mattiasson 1981, elastica | classic, engine benchmark | ~40% | first version | 0 | verifying |
   | Riks 1979 / Crisfield 1981, arc length (#803) | classic, engine benchmark | ~40% | first version | 1 (Codex) | fixing |
   | MacNeal & Harder 1985 (#797) | classic, engine benchmark | ~30% | first version | 1 (Codex) | fixing |
   | Belytschko et al. 1985, shell obstacle course (#809) | classic, engine benchmark | ~80% set up, 1 of 3 passing | first version | 1 (Codex) | fixing |
   | Zmyślony, Khan & Biggins 2026, snapping arches | new research | ~20% | first version | 0 | verifying |
   | Ferrari & Sigmund 2025, Koiter post-buckling | new research | ~5% | first version | 0 | building |
   | Pastrana et al. 2026, form-finding | new research | ~15% | first version | 0 | building |
   | Fairclough et al. 2026, gridshell layout | new research | ~5% | first version | 0 | building |

   "Implemented" estimates how much of the paper's examples and results are reproduced (a judgement,
   updated each round). The review counts are maintained in `research/papers.yaml` (`reviews:`), which
   the gallery shows.
8. **Merge bar for research PRs:** no Codex/Kimi blockers, every claim on the page true, the
   product unaffected (isolation check, editor data safe, app tests pass), CI green; other review
   findings become issues fixed in small follow-ups.

**Exit criteria.** Each experiment's page claims only what its committed validation checks; the
engine-benchmark pages run in required CI and match the native tests; at least one paper's authors
have reviewed their page.

### SEO and positioning (2026-10-29)

**Pricing principle (decided 2026-10-29):** the software is free for everyone, design modules
included; only Stabileo AI and heavy cloud compute may be paid, priced to cover what they cost. Copy
never promises more (no "free in every case" for AI or compute).

**Position:** *Stabileo — free, open-source structural analysis and design in your browser, with
machine-checked results; AI assistant coming.* Claims stay true: the AI assistant is "in development"
until it ships, so pages say "coming" and AI content covers what exists (verifiable AI-assisted
modelling plans, research on AI checks). AI becomes central in the messaging only when it works.

1. **Core searches with real pages** in English, Spanish and Portuguese (then de/fr/tr): "free
   structural analysis software", "open source structural analysis", "online structural analysis",
   "structural engineering software free", "FEA in the browser" ("software de cálculo estructural
   gratis", "análisis estructural online", "cálculo estrutural gratuito"): the landing page with one
   clear positioning sentence; one page per capability (analyses, design codes, reports, desktop) with a
   demo and its verification evidence; honest "free alternative to SAP2000 / ETABS / RFEM / Robot"
   pages that say what Stabileo does and does not do yet.
2. **Long tail** from Tools, worked problems, research papers and the public verification manual, all
   cross-linked to the core pages.
3. **Authority:** GitHub (stars, README), awesome-lists, the launches, links from universities and
   research groups (paper outreach) and professional councils; encyclopedia mentions only after
   independent coverage, never self-promotional editing.
4. **Technical:** prerendered pages with real content; structured data (`SoftwareApplication` with price
   0 and the licence, `ScholarlyArticle` / `citation_*` on research); hreflang in six languages;
   sitemaps; canonical links; Open Graph previews; speed (the app's Lighthouse 25 also costs rankings;
   see "Speed and the first run"); Google Search Console to measure.
5. **One name:** finish the Dedaliano → Stabileo rename (#735), user-visible text first.

First PR (branch `seo/positioning`, in progress): landing titles and descriptions per language, the
positioning sentence, `SoftwareApplication` and `Organization` structured data, a sitemap with hreflang
for every prerendered page, Open Graph cards, honest SAP2000 and ETABS alternative pages, and tests for
all of it.

### Growth: shared models, tools and research (2026-10-29)

Several tracks exist to grow Stabileo faster, and they share infrastructure: **Stabileo Research**
(papers you can run), **Stabileo Tools** (free calculators that rank in search) and **shared models**
below. All three are "a public page in Stabileo's viewer with a path into the editor"; build them on
the same snapshot, viewer and prerendering pieces (#777 frozen versions, the research shell, the tools
page). Measure them together: visitors, editor opens, forks, sign-ups, retention.

#### Shared models: GitHub + Figma for structural engineering

Every model can have a URL (`stabileo.com/m/<id>`) where anyone, **without an account**, can inspect
the structure, explore loads, deformations and diagrams, and **fork** an independent copy. This turns
Stabileo from a tool used alone into a place where engineering work is shared.

1. **Already half there:** share links encode the whole model (tested by `share-link-fidelity`), the
   research pages do "view, then Open in Stabileo", and #777 builds immutable snapshots on a separate
   origin. Release 1 is mostly a short URL, storage and a public viewer page.
2. **Modes:** public, unlisted (anyone with the link: warn that it is effectively public), private
   (authorised users). **Private by default;** publishing is an explicit action; author and project
   metadata stripped unless the author chooses otherwise; revoking deletes the stored copy.
3. **Immutable revisions,** not live projects: `projects`, `model_revisions` (parent, model hash,
   engine version), `shares` (access policy, fork allowed, revoked), `forks` (source revision →
   destination project). PostgreSQL for metadata and permissions, object storage for models and result
   fields. Links can follow the latest revision or pin one; research and report links pin.
4. **Safety (not optional):** a snapshot records the engine version it was solved with; the viewer shows
   that version's known issues and refusals; when a later fix changes the result, the page says so with
   the new value and the advisory (the result-change registry and safety advisories, applied to shared
   models). Shared results are never presented as an approval of a real design.
5. **Releases:** (1) share — snapshot, public read-only route, viewer, permissions; (2) fork — independent
   project with source attribution, anonymous local experimentation, save after sign-in (registration
   only after the visitor has experienced value); (3) discovery — public gallery, examples, Open Graph
   previews, embeddable viewer. No Git-style merging; compare revisions instead.
6. **Later: public engineering challenges** (e.g. minimum-mass truss under stress and deflection
   constraints), clearly educational or research benchmarks, with submissions re-run by the server; needs
   sandboxed server-side compute.
7. **Prerequisites:** a long-term versioned `.ded` format (#730) and old files always opening (#718);
   moderation, abuse and rate limits, takedowns, storage costs, and model text treated as untrusted
   (XSS).

**Metrics:** shares per active engineer; unique visitors per shared model; viewer → fork rate; fork →
successful solve; new creators who share again; 4-week retention of fork-acquired users; and
reproducibility (opened snapshots whose recomputed results match the stored ones).

**Sequence:** after the Tools pilot and #777 land (they provide the snapshot and public-page pieces);
share and fork first, with the safety pieces from day one; discovery next; challenges once server
compute exists.

#### Worked-problems library (under Education)

Students search by problem type ("moment distribution example", "overhanging beam with point load"),
every semester. A library of **original** worked problems, each solved step by step by the hand method a
professor expects and then by Stabileo's engine, the two agreeing, with **Open in Stabileo** to change it.
Built on the Tools page (a tool with a fixed worked example), so it is one system with two entry points.

- **Where:** under the existing **Education** navbar item (no new item: the navbar is full), at
  `/<lang>/problems/<slug>/` (Spanish `problemas`), prerendered with structured data, in the sitemap.
  Tools link to related problems ("see it solved by moment distribution") and problems to their tool
  ("try your own numbers").
- **What:** about 40–60 problem types: determinate beams, trusses (joints, sections, zero-force
  members), frames and three-hinged arches, deflections (double integration, moment-area, conjugate
  beam, virtual work), indeterminate structures (force method, slope-deflection, moment distribution /
  Cross, stiffness method), influence lines and moving loads, Euler buckling and P-Δ, section
  properties.
- **First 10, Spanish and English:** moment distribution, slope-deflection, influence lines, virtual work
  deflections, method of sections; then measure and expand.
- **Sources:** our own problems; problems from openly licensed textbooks only where the licence allows
  (attribution, non-commercial and no-derivatives terms checked per book); the research classics.
  **Never** solutions to numbered problems from copyrighted textbooks (publishers own them, and it helps
  students cheat, which works against professors).

#### Video and GIF export, and short videos

- **Export video / GIF in the viewer** (app, research and tools): mode and buckling shapes, deformed
  shape under load, time history and moving loads, research replays. MP4 (WebCodecs), WebM
  (MediaRecorder), GIF; vertical, square and landscape presets; length, speed, caption; a small "Made
  with Stabileo" mark with a link, on by default (removable in PRO); an honesty overlay with the analysis
  type, engine version and any known-issue warning. All in the browser, frame-exact, no upload. Every
  exported video is a way in; with shared models it links to the model itself.
- **Short videos from recipes** (reusing the preview pipeline): a recipe says which page, which
  parameter changes and camera moves, and the captions; Playwright drives the real page and ffmpeg
  composes vertical and square videos with title and end cards. Always a real run on the live engine,
  silent with captions (no unlicensed music), linking to the page. One a week for LinkedIn and Shorts:
  first the beam turning into a truss, the crack through the plate, "check a beam in 20 seconds".

#### Fast-growth backlog (ranked)

1. **Launches:** Show HN / Product Hunt / LinkedIn when Research has 4–5 live papers and the Tools pilot is
   up, then one per new capability (Tools, sharing, the Python package).
2. **Weekly short videos** (above).
3. **Embeds wherever engineers ask questions:** a one-line live model for Eng-Tips, Engineering Stack
   Exchange, Reddit, blogs and course pages (comes with shared models).
4. **Plugins where engineers already work:** an Excel add-in first (on the Python package and API), then
   Grasshopper/Rhino.
5. **AI: sketch, plan or PDF → model:** the viral demo, only after the safety work (a confidently wrong
   model spreads as fast).
6. Cheaper multipliers: student competitions (steel bridge, concrete canoe), free "Stabileo basics"
   certificates with a LinkedIn badge, team invites and referrals ("ask a colleague to review this
   model"), Latin American engineering communities in Spanish and Portuguese.

### Stabileo Tools: free engineering calculators (2026-10-29)

Engineers search for a calculation ("beam deflection calculator"), not for a platform. Each tool is a
real calculation on the production engine with a path into the full editor; the first version is being
built now (branch `tools/pilot`), shipped first and reviewed after, like research papers.

1. **One shared tool page,** `/tools/<slug>`, not 100 one-offs. Each has:
   - a real calculation on the production engine (WASM); where a textbook formula exists, the engine
     result and the closed-form value side by side, which doubles as verification;
   - the diagrams in Stabileo's viewer (deformed shape, moment, shear);
   - explicit assumptions, units and references (Timoshenko, Roark, code clauses) and a worked example
     with exact numbers that CI checks, so the page can never drift from the engine;
   - **Open in Stabileo:** the same model in the full editor, the conversion path;
   - code-dependent tools name the standard and edition (CIRSOC 201-2005, ACI 318-19, ...) and refuse
     what's out of scope; known-issue warnings and refusals show exactly as in the app.
2. **Built for search:** prerendered static HTML with real content; structured data (schema.org),
   canonical links, hreflang and a sitemap; six languages (en, es, pt, de, fr, tr) — Spanish and
   Portuguese are an opening (few good CIRSOC or NBR calculators exist); fast: a tool loads only what
   it needs, never the whole editor (the same "own page" architecture as Research); phone and tablet
   checks.
3. **The first 20,** where the engine is strongest (verified or certified): beams (simply supported,
   cantilever, fixed-fixed, propped, continuous 2–4 spans, overhang: deflection, moment, shear,
   reactions); section properties (I, rectangular, circular, hollow, built-up); column buckling (Euler
   with effective lengths, P-Δ amplification); 2D truss and portal frame; natural frequency of beams and
   frames; influence lines and moving loads; concrete beam (CIRSOC 201 / ACI 318) and steel member check
   (AISC / CIRSOC 301) with their scope stated, steel kept "experimental" until independent review
   (#389). Later, by demand: plates, slabs, foundations, then other fields (piping, electrical, pressure
   vessels, fire protection). Not for now: connections and bearing capacity (the engine doesn't do them;
   a weak tool hurts trust).
4. **Research gets the same treatment:** Google Scholar `citation_*` tags, DOI and author markup, preview
   images and video on every paper page; the classic benchmark pages (MacNeal–Harder, Scordelis–Lo) are
   what engineers search for.
5. **Sequence:** pilot of 3 (simply supported beam, cantilever, Euler column) proving the shared page,
   prerendering, speed budget, checked worked examples and Open in Stabileo; then the first 20; then
   measure in Google Search Console (impressions, clicks, editor opens per tool) before growing toward
   100.

**Safety:** these pages will be used for real decisions: every tool states its assumptions, runs only
analyses we've verified, shows the same known-issue warnings as the app, and labels a simplified check
as such, never as a full code check.

**Exit criteria.** 20 tools live in six languages, each with a CI-checked worked example and engine vs
formula agreement; Lighthouse performance ≥ 90 on tool pages; Search Console impressions and editor
opens measured per tool.

### Growth and housekeeping (2026-10-28)

1. **Real users and independent validation:** a beta-tester program, the outreach to engineers and
   professors, and an independent structural engineer signing off worked examples. [#733](https://github.com/lambdaclass/stabileo/issues/733)
2. **Website and app speed:** Lighthouse 52 (landing), 35 (blog), 25 (app) on 2026-10-23; start
   with loading only the active language (about −2 MB). [#734](https://github.com/lambdaclass/stabileo/issues/734)
3. **Rename Dedaliano to Stabileo everywhere, in phases, tests first** [#735](https://github.com/lambdaclass/stabileo/issues/735).
   About 2,700 references in 926 files on 2026-10-29: mostly mechanical (771 engine test files import
   the crate as `dedaliano_engine`), but some carry users' data (autosave and settings keys in browser
   storage, the `.ded` project format, share links), where a careless rename loses saved projects.
   - **Phase 0, tests before anything is renamed:**
     - an inventory test that lists every remaining `dedaliano` (case-insensitive), with an allowlist
       that may only shrink;
     - compatibility tests: `.ded` files from every release open and give the same results (#718),
       old browser-storage keys and IndexedDB data migrate, old share links still open, old desktop
       sessions restore;
     - the results snapshot corpus, determinism and the full test suites as the "nothing changed" guard.
   - **Phase 1, everything users see:** UI text, site, docs, emails, release notes, package
     descriptions.
   - **Phase 2, code identifiers:** the Rust crate (`dedaliano-engine` → `stabileo-engine`, every
     `use`), the WASM glue (`dedaliano_engine.js` / `_bg.wasm`), npm and research crates, fuzz targets and
     benches, CI paths. Results must stay bit-identical.
   - **Phase 3, stored names:** new storage keys and database names with migrations; the readers for the
     old names stay forever, and `.ded` keeps opening (the extension may remain as the project format).
   - **Phase 4, keep it done:** a CI check forbids new `dedaliano` outside the compatibility allowlist.
   Each phase is its own PR, reviewed twice, merged only when the guard tests from phase 0 are green.

## Daily, Weekly, Monthly Priority Lens

This is the clearest way to prioritize the product roadmap:

### Daily work

What engineers do on almost every project and should come first:

- trustworthy solve and visible verification
- model quality gates before solve
- code-driven load combinations and the first narrow code-load generation slice
- steel member design and first steel connection workflows
- RC beam/column design, reinforcement schedules, and BBS foundations
- basic reports and governing-case summaries (unblocked now — analysis-only calc books are billable)
- full design reports with utilization ratios and reinforcement schedules (after solver Phases 5-6)
- diagnostics, review cues, and AI explanation of what is wrong and what to fix

Roadmap home:

Immediate product/platform alignment item:
- fix the current 3D coordinate-system mismatch first
- make `Z-up` the explicit product/runtime convention so the app aligns with structural-software expectations
- migrate frontend/runtime pieces in an intentional sequence: viewport/grid/support visuals, generators/examples, and AI context extraction
- keep backend/solver contracts aligned while the frontend migration lands; do not allow any new `Y-up` assumptions back into 3D flows
- do not allow more 3D UX/generator work to silently deepen a mixed-convention state
- Product Step 1 (basic reports, diagnostics, section capacity, design checks)
- Product Step 2 (full design reports, BBS, connections)

### Weekly work

What engineers do regularly, but not on every single model every day:

- automatic code load generation
- IFC/import-export and office-template workflows
- reviewer flows, comments, diffs, and lightweight collaboration
- desktop/offline workflows
- natural-language result queries and stronger AI review assistance
- first dynamic interpretation surfaces and broader workflow packaging

Roadmap home:
- Product Step 2
- Product Step 3
- Product Step 4

### Monthly / specialist work

What matters a lot for advanced firms and specialists, but should not outrank daily delivery work:

- time-history and advanced earthquake workflows
- pushover, IDA, fragility, and performance-based seismic workflows
- progressive collapse, fire, and probabilistic workflows
- global optimization, generative layout, and CRDT real-time collaboration
- cloud platform, ecosystem APIs, and broader software layers built on the solver

Roadmap home:
- Product Step 3 and beyond

## What The Product Depends On From The Solver

The product roadmap only works if the solver exposes the right contracts and trust signals. The app should treat these as product dependencies, not backend details.

1. `Benchmark and verification moat`
   Public acceptance models, parity checks, and reproducible proof should be part of the user-facing trust story.

2. `Structured diagnostics and provenance`
   Machine-readable warning codes, severity, element references, and governing-case provenance are the substrate for AI review, QA, reports, and comments.

3. `Solver-run artifact contract`
   Bug-report export/import, reproducible support cases, and reviewer replay flows depend on a stable solver-run artifact the product can capture and attach, not only internal engine metadata.

4. `Query-ready result contracts`
   Natural-language result queries, reviewer tools, and report generation need indexed maxima/minima/governing-case summaries rather than UI-side table scraping.

5. `Model quality gates`
   Pre-solve checks for mechanisms, bad constraints, disconnected subgraphs, shell pathologies, and suspicious axes/supports are one of the highest-ROI product features.

6. `Headless and native execution parity`
   Desktop, API, cloud comparison, and firm workflows depend on browser/native parity and repeatable headless execution, not only a good in-browser demo.

## Open-Source vs Hosted Boundary

The roadmap describes the full product direction, but not every capability should live at the same distribution layer.

### Open-source should include

- the core browser product
- solver-driven diagnostics, verification, and review surfaces
- AI UI surfaces and capability interfaces
- prompt/result schemas
- local/basic provider adapter patterns where appropriate
- basic AI assistance such as diagnostic explanation, result queries, and limited code-check explanation
- local model support if it is added
- basic BYO-key mode if it materially helps community adoption
- report/design workflow foundations that make the product genuinely useful on its own

### Hosted / private / commercial should include

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
- cloud comparison, batch execution, and hosted platform services

### Guiding principle

The open-source version should be strong enough to be real software engineers can trust and use.

The hosted/private layer should monetize:

- orchestration
- scale
- collaboration
- premium automation
- enterprise controls

not artificial crippling of the core engineering product.

## The Automation Gap

> Full analysis: [automation_gaps.md](../research/automation_gaps.md)

The biggest remaining product gap is not "more analysis categories." It is automating the work engineers still do manually after the solver has already produced correct forces.

Today the solver can compute forces, reactions, modes, and envelopes well enough to be impressive. What still blocks daily project delivery is the manual layer on top:

1. defining code load combinations and factors
2. computing wind / seismic / snow loads from code inputs
3. checking whether members pass code
4. sizing sections by trial and error
5. turning RC demand into bars, schedules, and drawings
6. generating calculation reports and governing-case narratives
7. interpreting mode shapes, irregularities, and design drivers

Closing this gap is the difference between:

- `impressive analysis tool`
- `software an engineer can actually deliver a project with`

Competitors like SAP2000, ETABS, and RFEM automate parts of this already. Dedaliano should not only catch up there; it should also automate things competitors still do not do well or at all.

Commercially, the most important catch-up gap is also the clearest wedge in Latin America:
- `RC design + reinforcement schedules + BBS`
- this is the specific area where CYPECAD still has strong practical advantage
- closing it matters not just technically, but commercially, because it moves Dedaliano from analysis software into project-delivery software for RC-heavy markets

## What Engineers Still Do Manually

### High-impact automation to ship early

1. `Load combinations and factors`
   What it should become: auto-generate combinations from selected code families (EC0, ASCE 7, CIRSOC, etc.)
   Roadmap home: solver load-combination infrastructure + Product Steps 1-2

2. `Wind / seismic / snow loads`
   What it should become: enter building/site/code parameters and auto-generate pressures, forces, accidental torsion, and pattern loads
   Roadmap home: Product Step 2

3. `Code pass/fail checking`
   What it should become: automatic utilization ratios, governing checks, and pass/fail per member and per code
   Roadmap home: Product Step 2

4. `Section selection`
   What it should become: suggest viable and optimal sections given forces, code, cost, and constructability
   Roadmap home: Product Step 2

5. `Steel member and connection design`
   What it should become: automatic steel member checks, connection demand extraction, first connection sizing/check workflows, and report-ready design outputs
   Roadmap home: Product Steps 1-2

6. `RC reinforcement design`
   What it should become: required steel -> selected bars -> curtailment -> cutting lists -> BBS
   Roadmap home: Product Steps 1-2

7. `Report generation`
   What it should become: one-click PDF with diagrams, checks, diagnostics, governing cases, and assumptions
   Roadmap home: Product Step 2

8. `Interpretation of dynamic results`
   What it should become: automatic flags for soft story, torsional irregularity, mass participation, dominant modes, and suspicious response patterns
   Roadmap home: Product Step 3

### Medium-impact automation to ship later

1. `Shell family choice`
   What it should become: auto-select MITC4 vs MITC9 vs curved shell vs SHB8-ANS based on geometry and workflow
   Roadmap home: Solver Step 7 + Product Step 1

2. `Analysis type choice`
   What it should become: suggest nonlinear, P-Delta, modal, pushover, or time-history based on the model and requested checks
   Roadmap home: Product Steps 1 and 3

3. `Pre-solve stability assessment`
   What it should become: detect mechanisms, disconnected nodes, bad constraints, poor shell geometry, and suspicious modeling before solve
   Roadmap home: Solver Step 3

4. `Pushover workflow`
   What it should become: one-click capacity spectrum, performance point, and plastic hinge sequence
   Roadmap home: Product Step 3 + Solver Step 10

5. `IDA workflow`
   What it should become: automatic record selection, scaling, batch NLRHA, and fragility curves
   Roadmap home: Product Step 3 + Solver dynamic/nonlinear depth

6. `BIM round-trip`
   What it should become: IFC round-trip with analysis/design results embedded or linked
   Roadmap home: Product Step 4

## What Competitors Still Do Not Automate Well

These are not just "catch-up" items. They are chances to define the category.

1. `AI-assisted model review`
   Example: "beam 7 has no lateral restraint", "this shell is inverted", "this diaphragm constraint likely over-stiffens the floor"

2. `Natural language result queries`
   Example: "what is the max moment in the roof beams?" with governing combination and location

3. `Global section optimization`
   Not just per-member sizing, but whole-structure optimization including fabrication rhythm, procurement, and connection economy

4. `Live code comparison`
   Side-by-side EC2 vs ACI vs CIRSOC design interpretation for the same member or structure

5. `Generative structural layout`
   Given architectural constraints, produce and rank structural systems instead of only checking one user-authored scheme

These should appear in the product sequence on purpose:
- `AI-assisted model review` and `natural-language result queries` early
- `global section optimization` in the platform layer once batch/headless execution is solid
- `live code comparison` in the platform layer once multi-code checks are mature
- `generative structural layout` only after optimization and trusted automation infrastructure exist

## Users We Can Support

The same solver can support different user groups, but they need different product layers:

- **Structural and civil engineers** — full analysis, design, diagnostics, reports, and office workflows
- **Engineering firms** — templates, repeatable workflows, QA, reports, and interoperability
- **Students and professors** — onboarding, examples, benchmark explorer, and educational surfaces
- **Earthquake engineers** — pushover, time-history, IDA, fragility, performance-based design
- **Design-build / contractors / temporary works teams** — staged workflows, rapid reporting, and simple pass/fail communication
- **BIM / computational design users** — interoperability, import/export, and API hooks
- **Researchers / verification users** — benchmark visibility, solver settings, exports, and reproducibility
- **Architects** — only as a later conceptual structural mode with strong guardrails, not as the default product surface

## Product Layers By User Need

- `Engineers and firms` — diagnostics, code checks, RC member design and reinforcement schedules, reports, connections, foundations, templates, interoperability, and explainable element-family defaults
- `Earthquake engineers` — pushover analysis, time-history, ground motion library, IDA, fragility curves, performance-based assessment
- `Education` — first-solve success, examples, benchmark explorer, explanatory views
- `Design-build / temporary works` — staged workflows, fast results communication, deliverable generation
- `BIM / computational design` — import/export, API packaging, geometry-model exchange
- `Architects` — later conceptual structural mode with defaults, visual feedback, and guardrails

## Current Product Surface

Already present:

- browser-native 2D/3D modeling and visualization
- Rust solver in the main app flow through WASM
- broad results, postprocessing, and design-check coverage
- benchmark and validation story strong enough to support a product-quality narrative
- diagnostics and solver warnings surfaced in the results flow
- results-store support for constraint forces, assembly diagnostics, and solver diagnostics
- results-table diagnostics sub-tab and solve-time warning toasts for important issues such as negative Jacobians
- WASD/Arrow/QE keyboard camera navigation with Shift speed boost
- frame vs truss color differentiation across 2D and 3D viewports
- showcase PRO examples (suspension bridge, geodesic dome, diagrid tower, stadium, cable-stayed bridge)

Known example issues:

- **Suspension bridge example needs nonlinear solver**: The linear solver overestimates deflections because it lacks geometric stiffness from cable pretension. Suspension bridges are inherently nonlinear — cable stiffness depends on tension state. Once the corotational/nonlinear 3D solver supports cable pretension, revisit the suspension bridge example with realistic cable areas (A≈0.020 m²) instead of the current oversized A=0.060 m² workaround. Consider adding a catenary element (form-finding) for proper cable analysis.

3D coordinate-system decision:

- Dedaliano is moving to `Z-up` as the canonical 3D product/runtime convention: `x = horizontal`, `y = plan depth`, `z = elevation`.
- The frontend/runtime migration is the near-term work item because the viewport, support visuals, generators, examples, and AI context packaging must all agree on the same interpretation.
- Backend generators/importers and any solver-facing contracts must remain aligned with that `Z-up` convention as the migration completes.
- Important rule: do not mix conventions across backend generators, frontend templates, viewport logic, loads, and result rendering.
- A repo-wide `Z-up` migration must be treated as a planned platform refactor with compatibility review, not as an incidental bug fix.
- This should be treated as a near-term platform decision, not a low-priority cleanup item.

Still productizing:

- richer diagnostics UX in the app/API
- constraint-force presentation in the results experience
- click-to-focus and visual highlighting for problematic elements
- shell-family recommendation and automatic default selection in modeling workflows
- stronger onboarding and first-solve success
- report and deliverable workflows
- broader workflow packaging around the full solver surface
- deeper collaboration and firm-facing features
- smoother interoperability and downstream integrations
- explicit coordinate-system ADR for 3D workflows (`Z-up` canonical, no mixed conventions)

## Post-Core Software Stack

If Dedaliano executes the core roadmap well, the next best products are not "another generic solver." They are high-value software layers built on top of the solver moat.

Top opportunities:

1. `RC design + reinforcement schedule + BBS studio` — analysis → required steel → selected bars → schedules → drawings
2. `Structural report OS` — calculation books, governing-case narratives, solver diagnostics, code-check summaries, submission-grade PDFs
3. `QA / peer-review assistant` — model-quality checks, suspicious-reaction detection, instability warnings, load-path issues, reviewer workflows
4. `Firm workspace` — templates, office standards, reusable load packages, shared defaults, review flows, project memory
5. `Parametric structural configurator` — high-value typology generators for towers, warehouses, pipe racks, stadiums, mat foundations, and repetitive frames
6. `Interoperability layer` — BIM/CAD exchange, analytical-model generation, geometry cleanup, downstream drawing sync
7. `Cloud solve + comparison platform` — batch analysis, branch comparison, model diffing, scenario sweeps, history, batch reports
8. `Education product` — teaching-first solver experience, benchmark explorer, assignments, verification visibility, explainable methods
9. `Desktop distribution via Tauri` — native shell around the same web app for offline use, local files, native integration, and heavier local workflows

Recommended build order:

1. RC design + schedule / BBS
2. Structural report OS
3. QA / peer-review assistant
4. Firm workspace
5. Parametric configurator
6. Interoperability + cloud comparison
7. Desktop distribution via Tauri

What not to build next:

- a second solver engine
- a broad CAD clone
- a generic project-management app without engineering depth
- a full BIM-authoring competitor

---

## The Sequence

### 1. Solver-Led Product

Build trust through a reliable, accessible structural solver with strong diagnostics, section capacity tools, and the first high-ROI design automation surfaces.

**What:**

Solver trust and diagnostics:
- WASM path reliability — single trusted solver runtime in production
- Public verification surface — benchmark explorer, acceptance models, reference cases, and visible trust signals in the app
- Model quality gates before solve — mechanisms, disconnected nodes, bad constraints, shell pathologies, suspicious local axes/support conditions
- Richer diagnostics UX — grouping, filtering, machine-readable codes, provenance, click-to-focus highlighting
- Structured-code review consumer — reviewer surfaces, comments, and AI explanation should match on diagnostic codes/severity/references instead of parsing warning strings
- Constraint-force and governing-result presentation
- Shell-family recommendation and automatic defaults (MITC4/MITC9/SHB8-ANS)
- Public benchmark and acceptance-model presentation
- Performance feedback in the UI — progress bars, iteration counts, slow-phase visibility
- Solver-run artifact capture — export/import a reproducible run package for bug reports, support, and peer review replay
- Onboarding and first-solve success

Section capacity and materials (early design-oriented subset of solver material/section capability):
- Design-oriented material and section surfaces — Mander confined concrete, Menegotto-Pinto steel, EC2 parabola-rectangle, bilinear steel, and the section-level capacity outputs needed for daily design workflows
- RC section builder — visual concrete shape + rebar layout → auto-generate fibers
- P-M and P-M-M interaction diagram viewer for column design
- Moment-curvature curve visualization and section-level pushover
- Cracked section iteration workflow — solve → check cracking → reduce EI → re-solve
- Material stress-strain curve editor and preview
- Cyclic material testing with hysteresis visualization

Design code computations (solver Phase 6 — what engineers bill for):
- Steel member design — section classification, LTB, compression curves, combined interaction, per-member utilization ratios with pass/fail
- First steel connection workflow — connection-demand extraction, first connection library, sizing/check flow, and report-ready outputs for the most common daily steel cases
- RC beam design — required As, stirrup spacing, crack width, deflection check
- RC column design — interaction diagrams, slenderness, moment magnification
- Effective buckling length display per column (extracted from global eigenvectors)
- Multi-code selector — EC2/EC3, ACI 318/AISC 360, EHE-08/EAE
- Detailing rules output — min/max reinforcement, cover, anchorage lengths
- Automatic member utilization ratios and pass/fail summaries
- Automatic code-driven load combinations and factors
- Narrow first code-load generation slice — simple seismic ELF, gravity-pattern rules, and the first code-driven wind/snow patterns that unlock daily design workflows without trying to solve the entire load-generation scope at once

First automation and AI surfaces:
- AI-assisted section suggestion from utilization, code, and basic economy signals
- AI-assisted modeling and review — explain warnings, suggest missing supports/loads, flag suspicious patterns, guide first-fix actions
- AI explanation of model quality gates — tell the user not only that the model is invalid, but why it matters and what the most likely fix is
- AI setup guidance — suggest shell family, analysis path, and first checks based on the current model and workflow
- Natural-language result navigation and explanation powered by query-ready solver summaries
- Lightweight collaboration — comments, pinned annotations, shared links, model/version diff, reviewer read-only flows

Report and calculation documents (unblocked now — does not need design codes):
- Basic PDF report v1 — model summary, loads, combinations, force diagrams, reactions, governing cases, deformed shapes
- Customizable templates — firm logo, project info, engineer stamp
- LaTeX/KaTeX rendering — equations in the report (leverage existing DSM wizard)
- Diagram exports — M/V/N diagrams, deformed shapes, mode shapes as vector graphics
- Multi-language reports — English, Spanish (leverage i18n system)
- Enriched with design checks, utilization ratios, and reinforcement schedules once solver Phases 5-6 land

**Goal:** Be the most accessible serious structural solver for everyday structural engineering, with real section capacity tools, code-compliant design output, and report-ready deliverables that engineers can use on daily projects.

**Done when:** An engineer can model a structure in the browser, pass pre-solve quality gates, get trustworthy results with visible verification, generate a basic calculation report, view P-M interaction diagrams and moment-curvature curves, run steel and RC design checks with utilization ratios against their national code, produce a first RC beam schedule, and share a read-only link with a reviewer.

### 2. Deliverable Layer

Turn analysis into paid engineering work with reports, BBS, connections, and interoperability.

**What:**
- RC reinforcement schedule and BBS — required steel → selected bars → curtailment → cutting lists → bar bending schedule
- Graphical BBS drawing generation — bending-shape drawings, dimensions, hook semantics
- Steel connection workflow expansion — broaden beyond the first daily-use connection set with more connection families, stronger detailing, and richer report outputs
- Full design reports — enrich Step 1 basic reports with design checks, utilization summaries, reinforcement schedules, and appendix-level per-element calculations
- Broader automatic code load generation — extend the first narrow Step 1 slice into fuller wind, snow, seismic ELF, pattern loading, and accidental torsion coverage from code/site inputs
- Multi-code design check breadth — EC2, EC3, ACI 318, AISC 360, NDS, TMS 402, AISI S100 wired to unified code-selector
- Connections and foundations productization — auto-sizing and detail generation
- Interoperability — full IFC import/export, DXF 3D
- Project and template support — reusable workflows, firm standardization
- AI-powered section suggestion — deepen from local member sizing into stronger whole-frame recommendations
- AI-powered load combination from code selection — broaden and harden code coverage including accidental torsion, pattern loading, combination factors
- Natural language result queries — "what's the max moment in beam 7?", "which column has the highest utilization?"
- AI-powered code-check explanation — explain why a member fails and what parameter drives the failure
- AI-generated governing-case/report summaries — explain which combinations control and why, ready for report output and reviewer consumption
- AI reinforcement/design adjustment suggestions — explain likely bar/section changes that would clear a failing check
- Explicit steel design wedge for daily building/industrial workflows — member checks first, then connection design and report outputs
- Explicit RC/BBS wedge for LATAM delivery workflows — schedules, drawings, and report outputs that directly close the CYPECAD-style project-delivery gap

**Goal:** Move from "can analyze and design" to "can produce deliverables for paid engineering work." Automation handles the repetitive reporting and detailing layer so engineers spend more time on judgment.

**Done when:** An engineer can generate a BBS from RC design results, complete a first steel connection design workflow, generate a submission-grade PDF report, import/export IFC, and ask the app questions about results in plain language.

### 3. Dynamic and Nonlinear Layer

Make the browser the go-to tool for earthquake engineering, replacing OpenSees for the common 80% of work.

**What:**
- Dynamic time-history UI (Newmark-beta, HHT-alpha, ground motion input)
- Pushover analysis (capacity spectrum, N2, MPA)
- Construction staging UI
- P-Delta with a configurable number of iterations in PRO, to reproduce models from programs that stop after a fixed count: converged remains the default, the fixed count is chosen on purpose and saved with the model, and a result that did not converge says so wherever it is shown
- Seismic workflow end-to-end (spectra, ground motion selection, IDA)
- AI-powered nonlinear/dynamic result interpretation — explain convergence, flag unusual hysteresis, detect soft-story mechanisms, suggest damping parameters
- AI ground motion selection — suggest appropriate records from site parameters and target spectrum

**Note:** RC section builder, moment-curvature, interaction diagrams, and the first design-oriented subset of material/section capability have moved to Step 1 because they are daily design needs, not earthquake-specialist features. This does not mean the full nonlinear-material roadmap lands early. The broader solver-side nonlinear material program still belongs later; Step 1 only depends on the subset needed for daily RC/steel design workflows.

**Goal:** Make Stabileo the go-to tool for earthquake engineering — in the browser, with a visual editor, replacing OpenSees for the common 80% of work. AI makes nonlinear results accessible to engineers who aren't nonlinear specialists.

**Done when:** An earthquake engineer can run a pushover analysis, select ground motions, perform IDA, and get AI-explained results — all in the browser without writing a single line of Tcl.

### 4. Workflow Fit Layer

Fit into real firm workflows before expanding into a broader platform.

**What:**
- SAP2000/ETABS import (.s2k), STAAD.Pro import (.std), Robot exchange format
- OpenSees import (.tcl parser subset) for migration
- Tauri desktop packaging — same web app as a local desktop app for offline use, local files, native integration
- Project and template workflows — reusable firm standards, named defaults, standard report packages
- Education and benchmark explorer — university course integration, homework templates, interactive benchmark viewer
- Stronger review flows — comments, pinned annotations, reviewer states, project/version diff
- Bug-report and support replay flow — attach/export solver-run artifacts from the app so support and reviewers can reproduce issues deterministically
- First broader workflow packaging around firms and education, not yet full platformization
- AI workflow assistant — help users import models, choose templates, prepare reviews, and interpret diffs without adding full platform complexity

Desktop principles:
- Web remains the primary product surface
- Desktop is a shared shell, not a forked product
- Local file access, offline use, and native integration are the main value
- Auto-update from signed GitHub releases or equivalent signed update feed

**Done when:** A firm can import an existing model, standardize it to office templates, review it collaboratively, work offline on desktop when needed, and keep using the same product surface.

### 5. Platform Layer

Turn the app into a structural engineering platform with APIs, automation loops, and real-time collaboration.

**What:**
- Python scripting API (Pyodide in-browser) for batch runs and parametric studies
- REST API — headless solver for CI integration and automated analysis
- Cloud solve + comparison platform — batch analysis, branch comparison, model diffing, scenario sweeps, history, batch reports
- CRDT-based real-time collaboration — structural model as CRDT document (Yjs or Automerge), structural-aware merge semantics (you can't delete a node someone else is loading; adding a load to a member someone else is redesigning triggers a review), awareness protocol (live cursors, selection highlights), WebRTC peer-to-peer sync with WebSocket relay fallback, offline-first editing with automatic merge, per-user undo, branch and merge for models, operational history and audit trail
- User roles and permissions (viewer, editor, reviewer, approver)
- Comments and annotations pinned to nodes/elements/regions
- Visual diff between model versions
- Project management — version history, review workflow, project dashboard
- Cost estimation — material quantities to cost (steel tonnage, concrete volume, rebar weight, formwork)
- Enterprise controls — permissions, audit trail, administration
- Optimization and parametric design — size/shape/topology optimization (SIMP), parameter sweeps, multi-objective Pareto, code-constrained optimization
- Global section optimization — optimize the structure as a system, not only member-by-member, including fabrication rhythm and procurement economy
- Natural language to model — "8-storey RC frame, seismic zone 4, soft soil" generates a complete structural model
- Automated design iteration — AI runs hundreds of variants, presents Pareto-optimal designs (cost vs weight vs drift vs carbon)
- GNN/neural operator surrogates — train on solver output for 1000x parametric speedup
- Real-time code comparison — compare EC2 / ACI / CIRSOC interpretation on the same structure or member
- Generative structural layout — produce and rank structural systems from architectural constraints once optimization and automation are trusted
- PWA and offline — installable Progressive Web App, mobile-optimized 3D viewer, offline sync via CRDTs

**Done when:** A team of engineers can work on the same model simultaneously with live cursors, branch/merge design alternatives, and an AI can generate and rank hundreds of structural variants automatically.

### 6. Domain Breadth Layer

Broaden the usable design domain once the core workflow and platform surfaces are in place.

**What:**
- Slab and floor design — punching shear (EC2/ACI), flat slab strips, post-tensioned tendon layout, waffle/ribbed slabs
- Additional design codes — timber (EC5/NDS, CLT, glulam), masonry (EC6/TMS 402, confined masonry), composite (EC4/AISC, metal deck, headed studs, precast)
- Architect-friendly conceptual structural mode with strong guardrails

**Done when:** The same product can serve common RC, steel, timber, masonry, slab, and conceptual structural workflows without forcing firms into separate tools for each domain.

### 7. Specialized Analysis

Cover the remaining 20% of specialized analysis that advanced users need.

**What:**
- Progressive collapse — GSA/UFC alternate path method, automatic member removal, dynamic amplification, catenary action
- Fire design — ISO 834/ASTM E119 curves, temperature-degraded material properties (EC2/EC3/EC4), thermal analysis, fire resistance rating, parametric fire curves (EC1-1-2)
- Performance-based seismic — IDA automation, fragility curves, FEMA P-58 loss estimation, ML-accelerated IDA surrogates, cloud analysis, multi-stripe analysis
- Advanced elements — full catenary, form-finding (force density, dynamic relaxation), membrane/fabric/cable-net, tapered beams, curved beams, 3D solid elements (hex, tet)
- Reliability and probabilistic — Monte Carlo, FORM/SORM, subset simulation, polynomial chaos expansion
- Digital twins and SHM — sensor data ingestion API, Bayesian model updating
- Cloud solve — server-side WASM/native solver for 100k+ DOF models
- Performance at scale — WebGPU compute shaders, sparse iterative solvers (PCG/GMRES), Web Workers, IndexedDB, binary format

**Done when:** An engineer can run a progressive collapse check, a fire resistance analysis, and a probabilistic seismic risk assessment on a 100k+ DOF model — all within the same app.

### 8. First-Party Software Built On The Solver

Turn the solver from an application into a first-party software stack structural firms can live inside.

**What:**
- RC design + BBS studio — analysis to required steel to selected bars to schedules to drawings
- Structural report OS — report-grade outputs, submission documents, issue-ready calculation books
- QA / peer-review assistant — structural review workflows, suspicious-result detection, model-quality review
- Firm workspace — standards, templates, reusable office defaults, collaboration, project memory
- Parametric configurator — building, industrial, and foundation generators
- Interoperability + cloud comparison — shared workspaces, batch runs, model diffing, scenario comparisons

**Done when:** A firm can run their entire structural workflow inside the app — from parametric generation through analysis, design, QA review, and submission-grade deliverables — without switching tools.

---

**Post-Core Vision:** Once the solver roadmap and product roadmap through Step 8 are complete, the game shifts from "catch up and surpass" to "define the next era." The value moves beyond the solver engine into AI, collaboration, automation, and the software ecosystem built on top of trusted analysis.

### 9. Construction Intelligence

Bridge the gap between structural design and construction.

**What:**
- 4D BIM integration — structural model tied to construction schedule, staged loading simulation, construction sequence visualization
- Automated rebar detailing — analysis results to shop drawings with zero human intervention (schedules, placing drawings, splice locations, development lengths)
- Formwork optimization — minimize pours, optimize table reuse, plan striking sequence from early-age strength predictions
- Digital twin construction loop — site sensor data, Bayesian model updating, next-day deflection predictions, shoring adjustments
- As-built model calibration — compare surveyed geometry against design, flag deviations, update analysis with as-built dimensions

**Done when:** A contractor can feed site sensor data into the model, get daily deflection predictions, and receive automatically generated rebar shop drawings that account for as-built conditions.

### 10. Planetary-Scale Infrastructure

Help humanity build climate-resilient, low-carbon, reusable infrastructure.

**What:**
- Climate-resilient design — automated scenario generation from climate models (future wind speeds, flood levels, fire risk), structures that survive 2050/2080 climate
- Embodied carbon optimization — minimize CO2 alongside cost and safety, material passport integration, LCA built into the design loop
- Circular economy design — design for disassembly, reuse scoring for members, material bank integration
- Automated retrofit assessment — LiDAR/photogrammetry to FE model, seismic/wind vulnerability assessment, automated retrofit proposals
- Portfolio risk assessment — entire building portfolios for seismic/wind/flood risk, insurance-grade loss estimation at city scale

**Done when:** A city can upload its building portfolio, get a seismic/climate risk assessment, and receive prioritized retrofit recommendations with embodied carbon tradeoffs.

### 11. Education Platform

Replace static textbooks with interactive learning.

**What:**
- Interactive textbook mode — students see stiffness assembly, equation solving, force recovery step by step with explanations
- AI tutor — explains why a structure failed and what to change, teaches structural intuition
- Exam/homework mode — professor defines constraints, student designs, solver auto-grades
- Benchmark explorer — reproduce every published structural benchmark interactively
- Curriculum integration — pre-built course modules for structural analysis, steel design, RC design, dynamics

**Done when:** A professor can assign a structural design homework, students solve it interactively in the browser, and the app auto-grades while explaining the structural behavior step by step.

### 12. Third-Party Ecosystem and API Economy

Turn the platform into external infrastructure that other software and institutions build on top of.

**What:**
- Stabileo as infrastructure — other applications call the solver via REST/WebSocket API
- Insurance and risk — seismic/wind risk on entire building portfolios through the API
- City planning — urban planning tools check structural feasibility in real-time
- Parametric design backends — Grasshopper, Dynamo, Blender use Stabileo as the analysis engine
- Plugin/extension marketplace — third-party developers build specialized tools on top
- Foundation-model and RL research outputs productized through the platform once the solver/data stack is mature
- Autonomous inspection pipeline — drone damage capture, CV crack detection, Bayesian model updating, remaining life prediction

**Goal:** Stabileo becomes the structural engineering operating system — the platform that every other structural tool is built on top of. Nobody can replicate a platform with a better Cholesky factorization.

**Done when:** Third-party developers can build and sell specialized structural tools on a Stabileo marketplace, and insurance companies can run portfolio-scale risk assessments through the API.

## Non-Goals

Do not prioritize these before the core product is clearly trusted:

- Generic multiphysics expansion
- CFD or thermal-fluid products
- Overly broad enterprise features before single-user workflow quality is strong
- AI features that outrun solver trust
- Architect-friendly conceptual mode before onboarding, diagnostics, deliverables, and interoperability are stronger
- GPU sparse direct factorization (CPU sparse direct is correct for structural problem sizes)
- Isogeometric analysis (IGA shines for automotive/aerospace, not buildings)
- Meshfree methods (peridynamics, MPM — niche, out of scope for routine structural)
- A second solver engine
- A broad CAD clone
- A generic project-management app without engineering depth
- A full BIM-authoring competitor

## Related Docs

- [`README.md`](README.md) — entry point for every roadmap document: purpose, status, owner
- [`../verification/DASHBOARD.md`](../verification/DASHBOARD.md) — the metrics behind the exit criteria, per release
- [`../verification/MATURITY.md`](../verification/MATURITY.md) — verification level of every analysis, element family and design check
- [`../SAFETY_ADVISORIES.md`](../SAFETY_ADVISORIES.md) — the safety advisory process
- `SOLVER_ROADMAP.md` — solver mechanics and validation sequencing
- `POSITIONING.md` — market framing and competitive wedge
- `../research/rc_design_and_bbs.md` — RC design and BBS research
- `../research/beyond_roadmap_opportunities.md` — GNN surrogates, digital twins, UQ, advanced research opportunities
- `../research/cypecad_competitive_gap_and_parity_plan.md` — unified CYPECAD competitive gap analysis and parity plan
- `../research/post_roadmap_software_stack.md` — platform adjacencies after roadmap execution
