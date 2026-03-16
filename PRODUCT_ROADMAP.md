# Dedaliano Product Roadmap

## Purpose

This is the product roadmap: app features, market sequencing, design/reporting layers, and distribution strategy. It is not the solver mechanics roadmap — for that, see `SOLVER_ROADMAP.md`. Historical progress belongs in `CHANGELOG.md`. This document should stay forward-looking.

For the expanding AI track, see `research/ai_structural_engineering_roadmap.md`.

## Vision

Become the world's best structural engineering software — open-source, browser-based, zero-install. First: match the analytical power of OpenSees/Code_Aster/CalculiX with an accessible visual UX. Then: add design deliverables, diagnostics, and AI-assisted guidance. Later: real-time CRDT collaboration (the Figma moment) and full AI-native design.

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

## Product Thesis

Dedaliano should win in this order:

1. structural solver trust
2. code checks, design modules, and first automation surfaces
3. automatic load generation and code-driven combinations
4. reports and documentation
5. diagnostics, review workflows, and AI-assisted guidance
6. lightweight collaboration and shareable review flows
7. dynamic analysis and nonlinear materials (what OpenSees is famous for)
8. connections and foundations
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
3. design outputs they can use daily
4. reports and deliverables they can issue
5. diagnostics, review, and guidance that reduce failure/debug time
6. lightweight collaboration that makes review and sharing easier
7. workflow polish and breadth after the above are solid

## The Automation Gap

> Full analysis: [research/automation_gaps.md](research/automation_gaps.md)

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

5. `RC reinforcement design`
   What it should become: required steel -> selected bars -> curtailment -> cutting lists -> BBS
   Roadmap home: Product Steps 1-2

6. `Report generation`
   What it should become: one-click PDF with diagrams, checks, diagnostics, governing cases, and assumptions
   Roadmap home: Product Step 2

7. `Interpretation of dynamic results`
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

Build trust through a reliable, accessible structural solver with strong diagnostics and the first high-ROI automation surfaces.

**What:**
- WASM path reliability — single trusted solver runtime in production
- Automatic code-driven load combinations and factors
- Automatic load generation for the first high-value codes and workflows
- RC beam design and reinforcement schedule (envelopes, required steel, selected bars, stirrups, schedule-ready output)
- Automatic member utilization ratios and pass/fail summaries
- AI-assisted section suggestion from utilization, code, and basic economy signals
- Automatic load-combination generation from selected codes
- Report and calculation-document foundations
- Onboarding and first-solve success
- Richer diagnostics UX — grouping, filtering, provenance, click-to-focus highlighting
- AI-assisted modeling and review — explain warnings, suggest missing supports/loads, flag suspicious patterns, guide first-fix actions
- Natural-language result navigation and explanation
- Lightweight collaboration — comments, pinned annotations, shared links, model/version diff, reviewer read-only flows
- Constraint-force and governing-result presentation
- Shell-family recommendation and automatic defaults (MITC4/MITC9/SHB8-ANS)
- Public benchmark and acceptance-model presentation
- Performance feedback in the UI — progress bars, iteration counts, slow-phase visibility

**Goal:** Be the most accessible serious structural solver for everyday structural engineering, while already automating the first repetitive design tasks engineers do after analysis.

**Done when:** An engineer can model a structure in the browser, get trustworthy results with clear diagnostics, auto-generate the first code combinations and design checks, produce an RC beam schedule, and share a read-only link with a reviewer.

### 2. Deliverable Layer

Turn analysis into paid engineering work with design checks, reports, and interoperability.

**What:**
- Graphical BBS drawing generation — bending-shape drawings, dimensions, hook semantics
- Multi-code design check UI — EC2, EC3, ACI 318, AISC 360, NDS, TMS 402, AISI S100 wired to unified code-selector with per-member utilization ratios
- Automatic code load generation — wind, snow, seismic ELF, pattern loading, accidental torsion from code/site inputs
- Connections and foundations productization — auto-sizing and detail generation
- Reports and calculation packages — PDF with LaTeX equations, project info, design checks, diagrams
- Interoperability — full IFC import/export, DXF 3D
- Project and template support — reusable workflows, firm standardization
- AI-powered section suggestion — deepen from local member sizing into stronger whole-frame recommendations
- AI-powered load combination from code selection — broaden and harden code coverage including accidental torsion, pattern loading, combination factors
- Natural language result queries — "what's the max moment in beam 7?", "which column has the highest utilization?"
- AI-powered code-check explanation — explain why a member fails and what parameter drives the failure

**Goal:** Move from "can analyze" to "can support paid engineering work." Automation handles more of the repetitive design and reporting layer so engineers spend more time on judgment.

**Done when:** An engineer can run a design check against their national code, generate a submission-grade PDF report, import/export IFC, and ask the app questions about results in plain language.

### 3. Dynamic and Nonlinear Layer

Make the browser the go-to tool for earthquake engineering, replacing OpenSees for the common 80% of work.

**What:**
- Dynamic time-history UI (Newmark-beta, HHT-alpha, ground motion input)
- Pushover analysis (capacity spectrum, N2, MPA)
- Nonlinear material editors (concrete, steel, fiber sections)
- RC section builder (visual concrete shape + rebar layout)
- Moment-curvature and interaction diagrams
- Cyclic material testing with hysteresis visualization
- Construction staging UI
- Seismic workflow end-to-end (spectra, ground motion selection, IDA)
- AI-powered nonlinear/dynamic result interpretation — explain convergence, flag unusual hysteresis, detect soft-story mechanisms, suggest damping parameters
- AI ground motion selection — suggest appropriate records from site parameters and target spectrum

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
- Slab and floor design — punching shear (EC2/ACI), flat slab strips, post-tensioned tendon layout, waffle/ribbed slabs
- Additional design codes — timber (EC5/NDS, CLT, glulam), masonry (EC6/TMS 402, confined masonry), composite (EC4/AISC, metal deck, headed studs, precast)

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
- Natural language to model — "8-storey RC frame, seismic zone 4, soft soil" generates a complete structural model
- Automated design iteration — AI runs hundreds of variants, presents Pareto-optimal designs (cost vs weight vs drift vs carbon)
- GNN/neural operator surrogates — train on solver output for 1000x parametric speedup
- Real-time code comparison — compare EC2 / ACI / CIRSOC interpretation on the same structure or member
- PWA and offline — installable Progressive Web App, mobile-optimized 3D viewer, offline sync via CRDTs

**Done when:** A team of engineers can work on the same model simultaneously with live cursors, branch/merge design alternatives, and an AI can generate and rank hundreds of structural variants automatically.

### 6. Specialized Analysis

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

### 7. Software Built On The Solver

Turn the solver from an application into a software stack structural firms can live inside.

**What:**
- RC design + BBS studio — analysis to required steel to selected bars to schedules to drawings
- Structural report OS — report-grade outputs, submission documents, issue-ready calculation books
- QA / peer-review assistant — structural review workflows, suspicious-result detection, model-quality review
- Firm workspace — standards, templates, reusable office defaults, collaboration, project memory
- Parametric configurator — building, industrial, and foundation generators
- Interoperability + cloud comparison — shared workspaces, batch runs, model diffing, scenario comparisons

**Done when:** A firm can run their entire structural workflow inside the app — from parametric generation through analysis, design, QA review, and submission-grade deliverables — without switching tools.

---

**Post-Core Vision:** Once the solver roadmap and product roadmap through Step 7 are complete, the game shifts from "catch up and surpass" to "define the next era." The value moves beyond the solver engine into AI, collaboration, automation, and the software ecosystem built on top of trusted analysis.

### 8. Construction Intelligence

Bridge the gap between structural design and construction.

**What:**
- 4D BIM integration — structural model tied to construction schedule, staged loading simulation, construction sequence visualization
- Automated rebar detailing — analysis results to shop drawings with zero human intervention (schedules, placing drawings, splice locations, development lengths)
- Formwork optimization — minimize pours, optimize table reuse, plan striking sequence from early-age strength predictions
- Digital twin construction loop — site sensor data, Bayesian model updating, next-day deflection predictions, shoring adjustments
- As-built model calibration — compare surveyed geometry against design, flag deviations, update analysis with as-built dimensions

**Done when:** A contractor can feed site sensor data into the model, get daily deflection predictions, and receive automatically generated rebar shop drawings that account for as-built conditions.

### 9. Planetary-Scale Infrastructure

Help humanity build climate-resilient, low-carbon, reusable infrastructure.

**What:**
- Climate-resilient design — automated scenario generation from climate models (future wind speeds, flood levels, fire risk), structures that survive 2050/2080 climate
- Embodied carbon optimization — minimize CO2 alongside cost and safety, material passport integration, LCA built into the design loop
- Circular economy design — design for disassembly, reuse scoring for members, material bank integration
- Automated retrofit assessment — LiDAR/photogrammetry to FE model, seismic/wind vulnerability assessment, automated retrofit proposals
- Portfolio risk assessment — entire building portfolios for seismic/wind/flood risk, insurance-grade loss estimation at city scale

**Done when:** A city can upload its building portfolio, get a seismic/climate risk assessment, and receive prioritized retrofit recommendations with embodied carbon tradeoffs.

### 10. Education Platform

Replace static textbooks with interactive learning.

**What:**
- Interactive textbook mode — students see stiffness assembly, equation solving, force recovery step by step with explanations
- AI tutor — explains why a structure failed and what to change, teaches structural intuition
- Exam/homework mode — professor defines constraints, student designs, solver auto-grades
- Benchmark explorer — reproduce every published structural benchmark interactively
- Curriculum integration — pre-built course modules for structural analysis, steel design, RC design, dynamics

**Done when:** A professor can assign a structural design homework, students solve it interactively in the browser, and the app auto-grades while explaining the structural behavior step by step.

### 11. API Economy and Platform Ecosystem

Become the structural engineering operating system.

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

- `README.md` — repo entry point and document map
- `CURRENT_STATUS.md` — current snapshot
- `SOLVER_ROADMAP.md` — solver mechanics and validation sequencing
- `POSITIONING.md` — market framing and competitive wedge
- `research/rc_design_and_bbs.md` — RC design and BBS research
- `research/beyond_roadmap_opportunities.md` — GNN surrogates, digital twins, UQ, advanced research opportunities
- `research/cypecad_parity_roadmap.md` — CYPECAD feature parity analysis and wiring plan
- `research/post_roadmap_software_stack.md` — platform adjacencies after roadmap execution
