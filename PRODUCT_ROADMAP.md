# Dedaliano Product Roadmap

## Purpose

This document is the `product roadmap`.

Read next:
- current snapshot: [`CURRENT_STATUS.md`](/Users/unbalancedparen/projects/dedaliano/CURRENT_STATUS.md)
- solver execution order: [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)
- market framing: [`POSITIONING.md`](/Users/unbalancedparen/projects/dedaliano/POSITIONING.md)
- RC design/BBS research: [`research/rc_design_and_bbs.md`](/Users/unbalancedparen/projects/dedaliano/research/rc_design_and_bbs.md)
- beyond-roadmap opportunities: [`research/beyond_roadmap_opportunities.md`](/Users/unbalancedparen/projects/dedaliano/research/beyond_roadmap_opportunities.md)
- platform adjacencies after roadmap execution: [`research/post_roadmap_software_stack.md`](/Users/unbalancedparen/projects/dedaliano/research/post_roadmap_software_stack.md)
- CYPECAD parity: [`research/cypecad_parity_roadmap.md`](/Users/unbalancedparen/projects/dedaliano/research/cypecad_parity_roadmap.md)

It is for:
- app and workflow features
- market sequencing
- product packaging
- design/reporting/interoperability layers
- collaboration and distribution priorities

It is not the solver mechanics roadmap.
For that, see [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md).

This document should stay forward-looking.
Historical progress belongs in [`CHANGELOG.md`](/Users/unbalancedparen/projects/dedaliano/CHANGELOG.md).

## Vision

Become the world's best structural engineering software — open-source, browser-based, combining the analytical power of OpenSees/Code_Aster/CalculiX with the UX of Figma. Real-time collaboration via CRDTs, AI-assisted design, and zero-install accessibility that no competitor can match.

## Product Thesis

Dedaliano should win in this order:

1. structural solver trust
2. dynamic analysis and nonlinear materials (what OpenSees is famous for)
3. code checks and design modules
4. automatic load generation (what every commercial tool has)
5. reports and documentation
6. connections and foundations
7. construction staging, fire, progressive collapse
8. seismic engineering workflow (end-to-end)
9. interoperability and BIM-connected workflows
10. optimization and AI-assisted workflows
11. real-time collaboration (CRDT-based)
12. broader material codes (timber, masonry, composite)

That matches how structural firms buy software:

`can it analyze -> can it handle real loads -> can it design -> can it produce deliverables -> can it fit our workflow -> can my team use it together`

## Competitive Moat

What we have that OpenSees/Code_Aster/CalculiX/SAP2000/ETABS will never have:

1. **Zero-install browser UX** — engineers open a URL and start working
2. **Visual model building** — competitors require scripting or clunky pre-processors
3. **Real-time feedback** — live calc, instant diagrams, interactive 3D
4. **Educational mode** — no competitor explains the math step by step
5. **Modern stack** — their codebases are Fortran/Tcl/C++ from the 90s
6. **CRDT collaboration** — Figma-style real-time multi-user editing
7. **AI-assisted design** — natural language to model, automated suggestions

## Users We Can Support

The same solver can support different user groups, but they need different product layers:

- structural and civil engineers
  full analysis, design, diagnostics, reports, and office workflows
- engineering firms
  templates, repeatable workflows, QA, reports, and interoperability
- students and professors
  onboarding, examples, benchmark explorer, and educational surfaces
- earthquake engineers
  pushover, time-history, IDA, fragility, performance-based design
- design-build / contractors / temporary works teams
  staged workflows, rapid reporting, and simple pass/fail communication
- BIM / computational design users
  interoperability, import/export, and API hooks
- researchers / verification users
  benchmark visibility, solver settings, exports, and reproducibility
- architects
  only as a later conceptual structural mode with strong guardrails, not as the default product surface

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

## Product Layers By User Need

- `Engineers and firms`
  diagnostics, code checks, RC member design and reinforcement schedules, reports, connections, foundations, templates, interoperability, and explainable element-family defaults
- `Earthquake engineers`
  pushover analysis, time-history, ground motion library, IDA, fragility curves, performance-based assessment
- `Education`
  first-solve success, examples, benchmark explorer, explanatory views
- `Design-build / temporary works`
  staged workflows, fast results communication, deliverable generation
- `BIM / computational design`
  import/export, API packaging, geometry-model exchange
- `Architects`
  later conceptual structural mode with defaults, visual feedback, and guardrails

## Post-Core Software Stack

If Dedaliano executes the core roadmap well, the next best products are not "another generic solver".
They are high-value software layers built on top of the solver moat.

Top opportunities:

1. `RC design + reinforcement schedule + BBS studio`
   analysis -> required steel -> selected bars -> schedules -> drawings

2. `Structural report OS`
   calculation books, governing-case narratives, solver diagnostics, code-check summaries, submission-grade PDFs

3. `QA / peer-review assistant`
   model-quality checks, suspicious-reaction detection, instability warnings, load-path issues, reviewer workflows

4. `Firm workspace`
   templates, office standards, reusable load packages, shared defaults, review flows, project memory

5. `Parametric structural configurator`
   high-value typology generators for towers, warehouses, pipe racks, stadiums, mat foundations, and repetitive frames

6. `Interoperability layer`
   BIM/CAD exchange, analytical-model generation, geometry cleanup, downstream drawing sync

7. `Cloud solve + comparison platform`
   batch analysis, branch comparison, model diffing, scenario sweeps, history, batch reports

8. `Education product`
   teaching-first solver experience, benchmark explorer, assignments, verification visibility, explainable methods

Recommended build order after the current core roadmap:

1. `RC design + schedule / BBS`
2. `Structural report OS`
3. `QA / peer-review assistant`
4. `Firm workspace`
5. `Parametric configurator`
6. `Interoperability + cloud comparison`

What not to build next:

- a second solver engine
- a broad CAD clone
- a generic project-management app without engineering depth
- a full BIM-authoring competitor

---

## Delivery Phases

ROI order for users:
1. stable analysis they can trust
2. design outputs they can use daily
3. reports and deliverables they can issue
4. diagnostics that reduce failure/debug time
5. workflow polish and breadth after the above are solid

### Phase 1: Solver-Led Product

Focus:
- **WASM path reliability** — single trusted solver runtime in production, fix build/deploy/runtime mismatches, converge to one solver path
- **RC beam design and reinforcement schedule** — highest-ROI deliverable: envelopes → required steel, selected bars, stirrups, schedule-ready output
- **Report and calculation-document foundations** — solver trust converts to paid usage when firms can produce deliverables
- **Onboarding and first-solve success** — fastest way to grow usage
- **Richer diagnostics UX** — grouping, filtering, provenance, click-to-focus highlighting for problematic elements
- **Constraint-force and governing-result presentation** — coherent reactions, provenance, governing outputs
- **Shell-family recommendation and automatic defaults** — recommend MITC4/MITC9/SHB8-ANS automatically, explain why, allow safe override
- **Public benchmark and acceptance-model presentation** — make the trust story legible
- **Performance feedback in the UI** — progress bars, iteration counts, slow-phase visibility

Goal:
Be the most accessible serious structural solver for everyday structural engineering.

### Phase 2: Deliverable Layer

Focus:
- **Graphical BBS drawing generation** — bending-shape drawings, dimensions, hook semantics, schedule-ready graphics
- **Multi-code design check UI** — wire all Rust postprocess modules (EC2, EC3, ACI 318, AISC 360, NDS, TMS 402, AISI S100) to unified code-selector with per-member utilization ratios
- **Connections and foundations productization** — wire existing `foundation_check.rs`, `connection_check.rs` to UI panels with auto-sizing and detail generation
- **Automatic load generation** — wind (EC1/ASCE 7), seismic ELF (EC8/ASCE 7), snow, live load patterns — auto-generate from code parameters
- **Reports and calculation packages** — PDF with LaTeX equations, project info, design checks, diagrams
- **Interoperability and import/export** — full IFC import/export, DXF 3D, lower switching friction
- **Project and template support** — reusable workflows, firm standardization

Goal:
Move from "can analyze" to "can support paid engineering work."

### Phase 3: Dynamic & Nonlinear Layer (OpenSees Killer)

Focus:
- dynamic time-history UI (Newmark-β, HHT-α, ground motion input)
- pushover analysis (capacity spectrum, N2, MPA)
- nonlinear material editors (concrete, steel, fiber sections)
- RC section builder (visual concrete shape + rebar layout)
- moment-curvature and interaction diagrams
- cyclic material testing with hysteresis visualization
- construction staging UI
- seismic workflow end-to-end (spectra, ground motion selection, IDA)

Goal:
Make Stabileo the go-to tool for earthquake engineering — in the browser, with a visual editor, replacing OpenSees for the common 80% of work.

### Phase 4: Workflow & Ecosystem Layer

Focus:
- **SAP2000/ETABS import** — .s2k file parser, STAAD.Pro .std parser, Robot exchange format
- **OpenSees import** — .tcl script parser (subset) for migration
- **Python scripting API** — Pyodide-based in-browser scripting for batch runs, parametric studies
- **REST API** — headless solver for CI integration, automated analysis
- **Education and benchmark explorer** — university course integration, homework templates, interactive benchmark viewer
- **Additional design codes** — timber (EC5/NDS, CLT, glulam), masonry (EC6/TMS 402, confined masonry), composite (EC4/AISC, metal deck, headed studs, precast)
- **Slab & floor design** — punching shear (EC2/ACI), flat slab strips, post-tensioned slab tendon layout, waffle/ribbed slabs
- **Architect-friendly conceptual mode** — early-stage structural feedback with defaults, visual feedback, and guardrails

Goal:
Fit into real firm workflows, broaden adoption, and open adjacent surfaces carefully.

### Phase 5: Platform Layer (CRDT-First Collaboration)

Focus:
- **CRDT-based real-time collaboration** — the core differentiator
  - structural model as CRDT document (Yjs or Automerge)
  - structural-aware merge semantics (node deletion cascades to elements)
  - awareness protocol (live cursors, selection highlights, who-is-editing)
  - WebRTC peer-to-peer sync (no server bottleneck)
  - WebSocket relay fallback for NAT traversal
  - offline-first editing with automatic CRDT merge on reconnect
  - per-user independent undo stack
  - branch & merge for models (like git for structures)
  - operational history and audit trail
  - user roles and permissions (viewer, editor, reviewer, approver)
  - comments & annotations pinned to nodes/elements/regions
  - visual diff between model versions
- **Project management** — version history, review workflow, project dashboard
- **Cost estimation** — material quantities → cost (steel tonnage, concrete volume, rebar weight, formwork)
- **Enterprise controls** — permissions, audit trail, administration
- **Optimization & parametric design** — size/shape/topology optimization (SIMP), parametric modeling with parameter sweeps, multi-objective Pareto, code-constrained optimization
- **AI-assisted design** — natural language to model, design suggestions based on utilization, anomaly detection, auto-load combination from code selection, intelligent section defaults
- **GNN/neural operator surrogates** — train on solver output for 1000× parametric speedup (design exploration, IDA acceleration, topology optimization)
- **PWA & offline** — installable Progressive Web App, works offline via service worker, mobile-optimized 3D viewer, offline sync via CRDTs

Goal:
Turn the solver and app into a broader structural engineering platform — the Figma of structural engineering.

### Phase 6: Specialized Analysis

Focus:
- **Progressive collapse** — GSA/UFC alternate path method, automatic member removal scenarios, dynamic amplification, catenary action
- **Fire design** — ISO 834/ASTM E119 curves, temperature-degraded material properties (EC2/EC3/EC4), thermal analysis, fire resistance rating, parametric fire curves (EC1-1-2)
- **Performance-based seismic** — IDA automation, fragility curves, FEMA P-58 loss estimation, ML-accelerated IDA surrogates, cloud analysis, multi-stripe analysis
- **Advanced elements** — full catenary (exact stiffness), form-finding (force density, dynamic relaxation), membrane elements (fabric structures), cable-net structures, tapered beams, curved beams, 3D solid elements (hex, tet)
- **Reliability & probabilistic** — Monte Carlo, FORM/SORM, subset simulation, polynomial chaos expansion
- **Digital twins & SHM** — parameterized models, sensor data ingestion API, Bayesian model updating
- **Cloud solve** — offload large models to server-side WASM/native solver for 100k+ DOF models
- **Performance at scale** — WebGPU compute shaders for assembly, sparse iterative solvers (PCG/GMRES), Web Workers for parallel assembly, IndexedDB for large models, binary format

Goal:
Cover the remaining 20% of specialized analysis that advanced users need, and scale to the largest models.

### Phase 7: Software Built On The Solver

Focus:
- `RC design + BBS studio` — the strongest adjacent product once analysis and extraction are mature
- `Structural report OS` — report-grade outputs, submission documents, and issue-ready calculation books
- `QA / peer-review assistant` — structural review workflows, suspicious-result detection, and model-quality review
- `Firm workspace` — standards, templates, reusable office defaults, collaboration, and project memory
- `Parametric configurator` — building, industrial, and foundation generators
- `Interoperability + cloud comparison` — shared workspaces, batch runs, model diffing, scenario comparisons

Goal:
Turn the solver from a great application into a software stack structural firms can live inside.

---

## Post-Core Vision: Defining The Next Era

Once the solver roadmap (Phases A–S) and the product roadmap (Phases 1–7) are complete, Stabileo is the most complete structural solver ever built — open-source or commercial. At that point the game changes from "catch up and surpass" to "define the next era." The value shifts from the solver engine to AI, collaboration, and the ecosystem built on top of it.

### Phase 8: AI-Native Structural Engineering

Focus:
- **Natural language to model** — "8-storey RC frame, seismic zone 4, soft soil" generates a complete structural model with appropriate sections, materials, loads, and code selections
- **AI design assistant** — watches you model and suggests fixes in real-time ("this column is undersized for the axial load", "you forgot accidental torsion per EC8", "this beam-column joint needs confinement")
- **Automated design iteration** — AI runs hundreds of design variants and presents Pareto-optimal designs (cost vs weight vs drift vs carbon)
- **GNN surrogates** — neural operators trained on Stabileo solver output for 1000× parametric speedup (design exploration, IDA acceleration, topology optimization inner loops)
- **LLM-powered code compliance** — "does this design satisfy EC8 for ductility class high?" answered by an AI that reads the model, checks the results, and references the specific code clauses
- **Intelligent section selection** — AI proposes optimal sections from steel catalogs or concrete dimensions based on utilization, constructability, and cost
- **Anomaly detection** — flag suspicious results, unusual force distributions, unrealistic deflections before the engineer even looks at the output

Goal:
Make structural engineering 10× faster by having AI handle the repetitive design iteration while the engineer focuses on judgment and creativity.

### Phase 9: Real-Time Collaborative Engineering (The Figma Moment)

Focus:
- **Incremental re-analysis** — when one user changes a node while another reviews results, the solver re-analyzes only the affected region, not the full model
- **Structural-aware conflict resolution** — CRDT merge semantics that understand structural dependencies (you can't delete a node someone else is loading; adding a load to a member someone else is redesigning triggers a review)
- **Live review mode** — senior engineer sees the junior's model updating in real-time with live utilization ratios, can annotate and approve in-place
- **Branching and what-if** — branch a structural model like git, explore alternatives, merge the best option back with full diff visualization
- **Multi-cursor design** — multiple engineers working on different parts of the same building simultaneously, with live awareness of who is editing what
- **Async review workflows** — leave comments pinned to elements/nodes/load cases, assign review tasks, track approval status

Goal:
Structural engineering becomes a real-time team activity instead of passing files back and forth.

### Phase 10: Generative Structural Design

Focus:
- **System generation** — "design me a 40m span roof" → AI generates 50 topologically distinct structural systems (truss, Vierendeel, space frame, arch, cable-stayed), analyzes all of them, ranks by weight/cost/constructability/carbon
- **Buildable topology optimization** — SIMP/BESO that outputs structures with real member sizes, connection feasibility, and manufacturing constraints — not academic density blobs
- **Parametric form-finding** — architect drags a shape, structure optimizes in real-time to find the most efficient form for the given constraints
- **Multi-objective Pareto exploration** — interactive Pareto front where the engineer trades off cost, weight, drift, carbon, and constructability with live model preview
- **Code-constrained generation** — AI only proposes designs that satisfy the selected building code from the start, not designs that need post-hoc checking

Goal:
Shift structural design from "engineer proposes one solution and checks it" to "AI generates the solution space and engineer selects the best option."

### Phase 11: Construction Intelligence

Focus:
- **4D BIM integration** — tie the structural model to construction schedule, simulate staged loading automatically, visualize construction sequence
- **Automated rebar detailing** — from analysis results to shop drawings with zero human intervention (bar bending schedules, placing drawings, splice locations, development lengths)
- **Formwork optimization** — minimize concrete pours, optimize table reuse, plan striking sequence based on early-age strength predictions
- **Digital twin construction loop** — sensor data from construction site → Bayesian model updating → predict next-day deflections and forces → adjust shoring/propping → close the loop daily
- **As-built model calibration** — compare surveyed geometry against design model, flag deviations, update analysis with as-built dimensions

Goal:
Bridge the gap between structural design and construction — the model doesn't stop being useful when the drawings are issued.

### Phase 12: Planetary-Scale Infrastructure

Focus:
- **Climate-resilient design** — automated scenario generation from climate models (future wind speeds, flood levels, fire risk maps), design structures that survive 2050/2080 climate
- **Embodied carbon optimization** — minimize CO₂ alongside cost and safety, material passport integration, LCA (life-cycle assessment) built into the design loop
- **Circular economy design** — design for disassembly, reuse scoring for structural members, material bank integration
- **Automated retrofit assessment** — scan existing building (LiDAR/photogrammetry → point cloud → FE model generation), assess seismic/wind vulnerability, propose and analyze retrofit options automatically
- **Portfolio risk assessment** — analyze entire building portfolios for seismic/wind/flood risk, insurance-grade loss estimation at city scale

Goal:
Make Stabileo the tool that helps humanity build climate-resilient, low-carbon, reusable infrastructure at planetary scale.

### Phase 13: Education Platform

Focus:
- **Interactive textbook mode** — students see the math happening step by step as the solver runs (stiffness assembly, equation solving, force recovery), with explanations at each stage
- **AI tutor** — explains why a structure failed and what to change, teaches structural intuition through guided examples
- **Exam/homework mode** — professor defines constraints and loading, student designs the structure, solver auto-grades against acceptance criteria
- **Benchmark explorer** — anyone can reproduce every published structural engineering benchmark interactively, compare solver results against reference solutions
- **Curriculum integration** — pre-built course modules for structural analysis, steel design, RC design, dynamics, with progressive difficulty

Goal:
Replace static textbooks with an interactive learning environment where students learn by building and breaking structures.

### Phase 14: API Economy & Platform Ecosystem

Focus:
- **Stabileo as infrastructure** — other applications call the solver via REST/WebSocket API
- **Insurance & risk** — insurance companies run seismic/wind risk on entire building portfolios through the API
- **City planning** — urban planning tools check structural feasibility of proposed developments in real-time
- **Parametric design backends** — Grasshopper, Dynamo, Blender, and computational design tools use Stabileo as the analysis engine
- **Plugin/extension marketplace** — third-party developers build specialized tools on top of Stabileo (connection design, foundation design, temporary works)
- **Reinforcement learning for design** — RL agent learns to design structures by trial and error against the solver, discovers novel structural forms
- **Foundation models for structural engineering** — pre-trained on millions of analyzed structures, enabling few-shot generalization to new building types
- **Autonomous inspection pipeline** — drone captures damage → CV detects cracks/spalling → Bayesian model updating → remaining life prediction → repair recommendation, fully automated

Goal:
Stabileo becomes the structural engineering operating system — the platform that every other structural tool is built on top of. Nobody can replicate a platform with a better Cholesky factorization.

---

## What Not To Do Early

Do not prioritize these before the core product is clearly trusted:

- generic multiphysics expansion
- CFD or thermal-fluid products
- overly broad enterprise features before single-user workflow quality is strong
- AI features that outrun solver trust
- architect-friendly conceptual mode before onboarding, diagnostics, deliverables, and interoperability are stronger
- GPU sparse direct factorization (CPU sparse direct is correct for structural problem sizes)
- isogeometric analysis (IGA shines for automotive/aerospace, not buildings)
- meshfree methods (peridynamics, MPM — niche, out of scope for routine structural)

## Related Docs

- [`README.md`](/Users/unbalancedparen/projects/dedaliano/README.md)
  repo entry point and document map
- [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)
  solver mechanics and validation sequencing
- [`POSITIONING.md`](/Users/unbalancedparen/projects/dedaliano/POSITIONING.md)
  market framing and competitive wedge
- [`research/beyond_roadmap_opportunities.md`](/Users/unbalancedparen/projects/dedaliano/research/beyond_roadmap_opportunities.md)
  GNN surrogates, digital twins, UQ, advanced research opportunities
- [`research/cypecad_parity_roadmap.md`](/Users/unbalancedparen/projects/dedaliano/research/cypecad_parity_roadmap.md)
  CYPECAD feature parity analysis and wiring plan
