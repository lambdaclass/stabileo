# Dedaliano Product Roadmap

## Purpose

This document is the `product roadmap`.

Read next:
- current snapshot: [`CURRENT_STATUS.md`](/Users/unbalancedparen/projects/dedaliano/CURRENT_STATUS.md)
- solver execution order: [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)
- market framing: [`POSITIONING.md`](/Users/unbalancedparen/projects/dedaliano/POSITIONING.md)
- RC design/BBS research: [`research/rc_design_and_bbs.md`](/Users/unbalancedparen/projects/dedaliano/research/rc_design_and_bbs.md)
- beyond-roadmap opportunities: [`research/beyond_roadmap_opportunities.md`](/Users/unbalancedparen/projects/dedaliano/research/beyond_roadmap_opportunities.md)
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
