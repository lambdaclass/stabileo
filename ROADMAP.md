# Dedaliano Roadmap

## Mission

Own the structural engineering software market vertically — from load determination to calculation report — by building a browser-native platform that is 5-10x cheaper than incumbents, AI-native from day one, and validated against every published benchmark in the industry.

---

## Status overview

### What exists today (~25% of Phase 1)

The foundation is built: a working analysis engine, polished UI, and solid infrastructure. But 100% of the revenue-generating code (design checks, connections, load generation, reports) has not been started.

| Done | Not started |
|---|---|
| 2D solver — all 8 analysis types, 1,050+ tests | Steel design code checks (AISC 360 / Eurocode 3) |
| 3D solver — linear static, load combinations | Concrete design code checks (ACI 318 / Eurocode 2) |
| 100+ steel section catalog | Code-based load determination (wind, seismic, snow) |
| Cross-section stress (Navier, Jourawski, torsion) | Calculation reports (LaTeX/PDF) |
| Import/export (JSON, DXF, IFC, Excel, PNG, URL) | Quantity takeoff and cost estimation |
| 3D rendering (Three.js) | Offline PWA (Service Worker, IndexedDB) |
| Unit conversion utilities | AI assistant (LLM integration) |
| Undo/redo, autosave, kinematic analysis | 3D advanced analysis (P-Delta, modal, buckling, etc.) |
| DSM wizard (9-step educational tool) | Connection design, foundation design |
| Rust solver (experimental, not connected) | Collaboration, enterprise, API |

### Gap analysis by phase

| Phase | Completion | Dev-months | With 3 devs | With 5 devs | Full AI gen (dev-months) |
|---|---|---|---|---|---|
| **Phase 1**: one-code design tool + plates/shells | ~25% | 9-13 | 3-5 months | 2-3 months | 5-7 |
| **Phase 2**: connections + server + enterprise | ~5% | 12-18 | 4-6 months | 3-4 months | 6-9 |
| **Phase 3**: second code + timber + prestressed | 0% | 8-11 | 3-4 months | 2-3 months | 4-6 |
| **Phase 4**: full platform | 0% | 23-33 | 8-11 months | 5-7 months | 13-19 |
| **Phase 5**: global codes + CBFEM | 0% | 12-20 | 4-7 months | 3-4 months | 7-11 |

### Cumulative timeline

**Baseline — AI-assisted development (developers write code with AI assistance):**

| Milestone | 3 devs | 5 devs | 10 devs |
|---|---|---|---|
| Phase 1 ships (first revenue) | Month 5 | Month 3 | Month 2 |
| Phase 2 ships | Month 11 | Month 7 | Month 4 |
| Phase 3 ships | Month 15 | Month 10 | Month 6 |
| Phase 4 ships | Month 24 | Month 16 | Month 10 |
| Phase 5 ships (full platform, ~90% coverage) | Month 30 | Month 20 | Month 13 |

**Accelerated — full AI generation (AI writes all code, engineers review every commit):**

| Milestone | 3 devs | 5 devs | 10 devs |
|---|---|---|---|
| Phase 1 ships (first revenue) | Month 3 | Month 2 | Month 1 |
| Phase 2 ships | Month 5 | Month 3 | Month 2 |
| Phase 3 ships | Month 7 | Month 5 | Month 3 |
| Phase 4 ships | Month 13 | Month 9 | Month 5 |
| Phase 5 ships (full platform, ~90% coverage) | Month 17 | Month 12 | Month 7 |

The foundation (solver, rendering, import/export) is the hardest part to get right and it's done. What remains is mostly formula translation (design codes), SaaS infrastructure (collaboration, enterprise), and AI integration — exactly what AI-assisted development is best at.

---

## Current state

Dedaliano is a browser-native 2D + 3D structural analysis application implementing the Direct Stiffness Method from scratch. The solver is written in pure TypeScript with no external linear algebra dependencies. Over 1,050 tests across 31 suites validate the engine against analytical solutions.

### Implemented

- **2D solver** (3 DOF/node): linear static, P-Delta, buckling, modal, plastic, spectral, moving loads, influence lines
- **3D solver** (6 DOF/node): linear static, load combinations, envelopes
- **Load combinations**: LRFD factors, per-case and per-combination results, envelopes
- **Cross-section stress**: Navier, Jourawski, Bredt/Saint-Venant torsion, Mohr's circle, Von Mises/Tresca failure criteria
- **Section catalog**: 100+ European steel profiles (IPE, HEB, HEA, IPN, UPN, L, RHS, CHS), concrete sections, custom parametric builder
- **DSM wizard**: 9-step interactive walkthrough of the Direct Stiffness Method with KaTeX-rendered matrices
- **Kinematic analysis**: mechanism detection, rank check, diagnostic reports
- **Import/export**: JSON, DXF (R12), IFC (via web-ifc WASM), Excel, PNG, URL sharing (LZ-compressed)
- **3D rendering**: Three.js with Line2 screen-space elements, extruded section profiles, deformed shape visualization, stress utilization color maps
- **Undo/redo**, **autosave** (localStorage), **feedback system** (GitHub issues)
- **Rust solver**: experimental implementation in `engine/`, not yet connected via WASM

---

## Market strategy

### The opportunity

Structural engineering software is a $7-12B global market. Incumbents charge $2,000-15,000+/yr per seat:

| Software | Pricing | Owner |
|---|---|---|
| ETABS | $5,000-15,600 perpetual + $875-2,730/yr maintenance | CSI (Computers & Structures) |
| SAP2000 | $4,000-9,000 perpetual + maintenance | CSI |
| RFEM 6 | EUR 4,750 base + EUR 1,150-2,950 per add-on | Dlubal |
| STAAD.Pro | $3,210-4,411/yr | Bentley Systems |
| Robot Structural Analysis | $3,060/yr (bundled with AEC Collection) | Autodesk |
| IDEA StatiCa | $1,990-5,250/yr | IDEA StatiCa (Hilti) |
| ADAPT | $5,000+/yr | Trimble |
| RISA | $2,000-6,000/yr | RISA Technologies |

Browser-based competitors are small and growing: SkyCiv ($69-179/month, ~$1.7M ARR), ClearCalcs ($79-149/month, ~$793K ARR). Neither covers the full pipeline.

**83-94% of structural engineering firms have fewer than 20 employees.** These firms cannot afford $50,000-150,000/year in software licenses. A 10-person firm switching from incumbents to Dedaliano Pro ($50/month = $600/year per seat) saves $44,000-144,000/year.

### Vertical ownership thesis

A structural engineer's workflow has 12 phases. No single tool covers them all today — engineers use 3-5 different programs per project. Each handoff loses data, wastes time, and introduces errors.

| Phase | What happens | Status | Incumbent |
|---|---|---|---|
| 1. Conceptual design | Select structural system, preliminary sizing | Not covered | Rules of thumb, spreadsheets |
| 2. Load determination | Dead, live, wind, snow, seismic per code | Partial | Spreadsheets, ASCE 7 Hazard Tool |
| 3. Modeling | Nodes, elements, supports, materials, loads | **Done** | ETABS, SAP2000, RFEM, Robot |
| 4. Analysis | Linear, P-Delta, buckling, modal, spectral | **Done (2D)**, 3D partial | ETABS, SAP2000, RFEM, STAAD |
| 5. Member design | Code-check every member per design code | Not covered | ETABS, RFEM, RISA, spreadsheets |
| 6. Connection design | Beam-column, brace, splice, base plate | Not covered | IDEA StatiCa, SteelSmart |
| 7. Foundation design | Footings, piles, retaining walls | Not covered | Spreadsheets, specialized tools |
| 8. Detailing | Rebar schedules, connection detail sheets | Not covered | Revit, Tekla |
| 9. Construction drawings | Plans, sections, schedules | Out of scope | Revit, Tekla (BIM/CAD) |
| 10. Calculation report | Permit-ready documentation | Not covered | Word, Mathcad, Tedds |
| 11. Quantity takeoff | Tons of steel, m3 of concrete, cost | Not covered | Spreadsheets |
| 12. Construction support | RFIs, change orders, field verification | Not covered | Manual process |

**Target: phases 2 through 8 + 10 + 11.** Phase 9 (construction drawings) requires a CAD engine — that's Revit/Tekla territory. We integrate with them via IFC round-trip and live link plugins rather than replacing them.

```
Loads → Model → Analysis → Code checks → Connections → Foundations → Report + Quantities
```

Owning this pipeline means the engineer never leaves Dedaliano except for construction drawings. Every phase generates revenue. Every phase increases switching costs.

### Competitive moat: AI-native architecture

Desktop incumbents (ETABS, SAP2000, RFEM, STAAD) are built on C/C++/Fortran codebases from the 1990s-2000s. They cannot easily add AI features. This is the structural advantage:

**AI features that incumbents cannot match:**

1. **Auto-sizing optimizer**: describe constraints ("steel moment frame, 4 stories, 30ft bays, AISC 360") and AI proposes initial member sizes, iterates analysis + code checks until all pass with minimal weight. Traditional approach: engineer guesses sizes, runs analysis, adjusts manually over hours
2. **Natural language model editing**: "add a 20kN point load at midspan of beam B3" or "change all W14 columns to W16" — parsed into model mutations. No menu navigation
3. **Intelligent load generation**: input building geometry and location, AI determines all applicable load cases (wind, seismic, snow, rain), applies them correctly per code, generates all required combinations. Currently takes engineers hours of manual work per project
4. **AI design review**: after analysis completes, AI reviews results and flags concerns ("column C7 has 0.98 utilization ratio under seismic, consider upsizing", "drift at story 4 exceeds H/400 limit", "foundation reactions exceed typical bearing capacity for assumed soil")
5. **Report narration**: AI writes the engineering narrative sections of the calculation report — describing the structural system, justifying design decisions, explaining why certain load combinations govern. Engineers currently spend 25-35% of time on documentation
6. **Code provision lookup**: engineer asks "what's the minimum reinforcement ratio for this beam per ACI 318-19?" and gets the exact clause, formula, and computed value in context

These features are trivial to add in a browser-based, AI-native architecture. They are nearly impossible to retrofit into a 30-year-old desktop C++ application.

### Pricing

| Tier | Price | Includes |
|---|---|---|
| **Free** | $0 | Full analysis (browser-only, small models), section properties, load calculator, DSM wizard |
| **Pro** | $50/month | Everything: all design modules (steel, concrete, timber, connections), server compute, reports, AI assistant, unit toggle, API access, education features |

Two tiers. No add-ons, no per-module pricing, no enterprise negotiation. Every Pro user gets the full platform. This eliminates purchase friction ("which modules do I need?") and simplifies the sales conversation to one question: free or $50/month.

**Revenue model**: free tier drives adoption and SEO traffic; $50/month Pro is the single conversion target. At $600/year vs $5,000-15,000/year for incumbents, the price objection disappears. A 10-person firm switching from ETABS to Dedaliano saves $44,000-144,000/year. Revenue scales with users, not with per-seat licenses.

**Freemium conversion mechanics:**
- Free tier: up to 50 elements, 3 load cases, 1 load combination, no code checks, no reports, no server compute. Enough to evaluate the tool and teach students, not enough to run a real project
- Pro paywall triggers: model exceeds 50 elements, user requests code checks, user generates a report, user needs server compute. These are natural boundaries — the engineer hits them when they need Dedaliano for real work
- No time limits or trial periods. The free tier is permanent. This removes the "I'll try it later" objection and keeps the tool installed/bookmarked

**Churn prevention:**
- Firm-specific report templates: once a firm configures their header, logo, disclaimer text, and preferred detail level, they won't recreate this elsewhere
- Saved calculation library: every project's models, results, and reports are stored and searchable. Years of project history becomes a switching cost
- Team knowledge: standard connection details, preferred sections, office design standards embedded in the tool
- The more a firm invests in Dedaliano-specific workflows, the harder it is to leave. This is the same lock-in strategy that keeps firms on ETABS for decades — but earned through value, not licensing

### Trust and credibility strategy

Engineers are conservative. They will not switch from SAP2000/ETABS unless they trust the results. Trust is earned, not claimed.

**Published verification documents:**
- For every design code module, publish a verification document comparing Dedaliano's results against hand calculations and incumbent software (SAP2000, ETABS, RFEM) for the same problems
- Format: problem description, hand calculation, Dedaliano result, SAP2000/ETABS result, percent difference
- Make these freely downloadable — they serve as both quality proof and marketing content

**Benchmark suite:**
- Run every CSI verification problem (SAP2000/ETABS publish hundreds of verification examples with expected answers)
- Run every AISC design example from the Steel Construction Manual companion
- Run every ACI 318 worked example from PCA and other publishers
- Run NAFEMS standard benchmark problems for FEA validation
- Publish results publicly with pass/fail status and numerical comparison

**Third-party validation:**
- Submit the software for review by independent structural engineering professors
- Seek listing in building department approved software lists where applicable
- Present benchmark results at industry conferences (NASCC, ACI Convention, SEAOC)

**Marquee clients:**
- Partner with 5-10 well-known structural engineering firms for beta testing
- Their public endorsement ("we verified Dedaliano against our SAP2000 models and results match within 0.1%") is worth more than any marketing campaign
- Offer free Pro for 1 year in exchange for a published case study

**Open source advantage:**
- The solver code is AGPL-3.0 and publicly readable. Any engineer can inspect the stiffness matrix assembly, the eigenvalue solver, the design code check formulas
- This transparency is impossible for closed-source incumbents. "Don't trust us — read the code" is a powerful message to a skeptical profession

### Distribution and go-to-market

**SEO landing pages (primary acquisition channel):**

Every calculation type in the app becomes a public landing page with a live calculator that works without signup. The engineer googles a specific problem, runs the check, sees the result match their hand calculation, and hits the paywall when they need the full report or want to save the project. This is the top-of-funnel.

| App feature | Target search queries | Landing page format | Phase |
|---|---|---|---|
| Cross-section properties | "W12x26 section properties", "moment of inertia calculator", "steel section database" | Live section picker with computed A, I, S, Z, r. Free, no signup. | Already built |
| DSM educational wizard | "direct stiffness method tutorial", "stiffness matrix example", "structural analysis step by step" | Interactive 9-step walkthrough with KaTeX matrices. Free. | Already built |
| 2D/3D analysis | "beam analysis online", "continuous beam calculator", "portal frame analysis free", "truss calculator" | Pre-loaded example models. Run analysis, see results. Signup to save. | Already built |
| Steel member design | "AISC 360 beam design example", "steel column design calculator", "W shape selection tool", "compact section check" | One page per check type (flexure, shear, compression, combined). Input section + loads, get utilization ratio + governing clause. | Phase 1 |
| Concrete member design | "ACI 318 beam design", "concrete column interaction diagram online", "crack width calculation Eurocode 2" | One page per check. Show reinforcement layout and P-M diagram. | Phase 1 |
| Load determination | "ASCE 7 wind load calculator", "seismic base shear calculator", "snow load by zip code", "IBC load combinations" | Enter location + building geometry, get all applicable loads and combinations. | Phase 1 |
| Calculation reports | "structural calculation report template", "engineering calculation sheet" | Sample report PDF for a common problem. Full reports require Pro. | Phase 1 |
| Connection design | "steel moment connection design", "shear tab design AISC", "base plate design calculator" | One page per connection type. Input forces + geometry, get pass/fail + bolt/weld sizes. | Phase 2 |
| Unit conversion | "kip to kN", "psi to MPa", "structural unit converter" | Converter widget. Light page, high volume, low intent — links to deeper tools. | Phase 1 |
| Quantity takeoff | "steel tonnage calculator", "concrete quantity estimate" | Enter model summary, get material quantities and cost estimate. | Phase 1 |
| Timber design | "NDS timber beam design", "wood column design calculator", "adjustment factors NDS" | Same pattern as steel: one page per check type. | Phase 3 |
| Eurocode design checks | "Eurocode 3 beam design online", "Eurocode 2 column design", "EN 1993 section classification" | Mirrors AISC/ACI pages for European market. | Phase 3 |
| Bridge design | "AASHTO LRFD girder design", "bridge load rating calculator" | Specialized pages for distribution factors, rating factors. | Phase 4 |
| Foundation design | "spread footing design calculator", "bearing capacity calculator" | Input soil + loads, get footing size and reinforcement. | Phase 2 |

**SEO implementation principles:**
- Every page has a canonical URL: `dedaliano.com/tools/{category}/{specific-check}` (e.g., `/tools/steel/aisc-360-flexure`)
- Every page includes the exact code clause referenced, the formula used, and intermediate calculation values — this is what engineers search for and what builds trust
- Every page runs the real calculation engine, not a simplified version. Results must match the full app exactly
- Pages interlink: a beam design page links to the load determination page, which links to the analysis page. The engineer naturally moves deeper into the tool
- Verification documents (benchmark results) are published as companion pages — engineers searching for "AISC design example 1" find both the worked example and the live calculator

**Content marketing:**
- Technical blog posts solving real structural engineering problems end-to-end (modeling → analysis → design → report) with Dedaliano
- Video tutorials comparing Dedaliano workflow vs ETABS/SAP2000 for the same problem — emphasize speed and price
- Every benchmark verification document doubles as long-form content that ranks for the specific problem it solves
- Engineers spend 25-35% of time on documentation — content showing how Dedaliano automates report generation resonates immediately

**University partnerships:**
- Target structural analysis and steel/concrete design courses
- Professors get free accounts. Students learn on Dedaliano. After graduation, they bring it to their firms
- The DSM wizard already exists and is ideal for teaching — expand to design code teaching modules
- Long-term flywheel: every graduating class creates new potential customers

**Industry conferences:**
- Present at NASCC (steel), ACI Convention (concrete), SEAOC (seismic), ASCE Structures Congress
- Live demos comparing speed and accuracy against incumbent software
- Distribute benchmark verification documents
- Sponsor student competitions and capstone projects

**Revit/Tekla live link plugins:**
- Most firms use Revit or Tekla for BIM/drawings. They need analysis software that talks to their BIM tool
- Build bidirectional sync plugins: send model from Revit → Dedaliano for analysis → send results back to Revit with design data
- Not just IFC export — a live link that keeps the analytical model and BIM model synchronized
- This is how ETABS and Robot win deals: they integrate with Revit. We must match this

**Benchmark publications:**
- Publish benchmark comparison papers in ASCE Journal of Structural Engineering, Engineering Structures, etc.
- Academic credibility translates directly to practitioner trust
- "Peer-reviewed verification" is the gold standard in engineering

### Growth projections

| Timeframe | Users | MRR | Primary driver |
|---|---|---|---|
| Month 6-12 | 50-200 | $2.5-10K | Early adopters, freelancers, students via free tier and SEO landing pages |
| Month 12-24 | 200-1,000 | $10-50K | Word of mouth, education partnerships, first firm-wide adoptions |
| Month 24-36 | 1,000-3,000 | $50-150K | Second code (Eurocode) opens Europe, enterprise features land mid-size firms |
| Month 36-48 | 3,000-10,000 | $150-500K | Global codes open India, LATAM, East Asia, API integrations with BIM tools |

**Benchmarks from the space:**
- SkyCiv: ~$1.7M ARR after ~8-10 years. No AI, no PLG, incomplete pipeline coverage.
- ClearCalcs: ~$793K ARR. Better UX than incumbents but still limited scope.

Dedaliano's structural advantages: 10-30x cheaper than incumbents, AI-native architecture, full vertical pipeline coverage from loads to reports. Realistic targets: **$1M ARR (~1,700 paying users) in 18-24 months**, **$5M ARR (~8,300 paying users) in 36-48 months**. The constraint is not demand — it is trust. Every benchmark must pass before engineers will stamp calculations from the software.

### Professional liability and disclaimers

Engineers are personally liable for their designs. Their professional liability (E&O) insurance covers the tools they use — but only if they can demonstrate due diligence. This is a real sales blocker.

**Disclaimer framework:**
- Clear terms of service: "Dedaliano is a tool. The engineer of record is responsible for verifying all results. The software does not replace professional engineering judgment"
- This is identical to what ETABS, SAP2000, and every other structural tool states — but it must be explicit and prominent

**Supporting engineer confidence:**
- Every design check displays the code clause, formula, and intermediate values used. The engineer can verify any result by hand
- Verification documents (see Trust section above) demonstrate that the software produces correct results for known problems
- Open source code means any engineer or firm can audit the implementation

**Insurance compatibility:**
- Engage with major E&O insurance providers (Victor, Beazley, Hiscox) to get Dedaliano listed as acceptable analysis software
- Publish a "Software Verification Statement" that firms can attach to their insurance applications — a formal document listing all benchmark tests passed, the verification methodology, and the review process
- This is not a technical problem — it's a business development problem that must be solved before large firms will adopt

---

## Development methodology

Most code is generated by AI. Every pull request and every commit is reviewed by humans — expert software engineers for architecture, performance, and correctness, and expert structural engineers for every design code formula, coefficient, table lookup, and edge case.

AI handles what it does well: translating well-documented specifications (AISC 360 clauses, ACI 318 provisions, Eurocode formulas) into code, generating UI and rendering boilerplate, implementing textbook algorithms (DSM, eigenvalue solvers, sparse matrix operations), and producing test cases from published examples. LLMs already know these standards and can generate correct implementations for the vast majority of cases.

Humans handle what AI cannot guarantee: verifying that the generated code matches the intent of the design standard in every edge case, reviewing architectural decisions, catching subtle interactions between code provisions that AI might miss, and making final judgment calls on engineering correctness.

Additionally, every feature is validated against published benchmarks — CSI verification manuals, AISC design examples, Eurocode worked examples, NAFEMS benchmark problems. If the code passes hundreds of benchmark tests from authoritative sources, that is objective evidence of correctness that complements human review. The combination of AI generation, human review on every PR, and extensive benchmark validation is both faster and more rigorous than traditional development where a single engineer writes and self-reviews code.

Every feature ships with comprehensive automated tests validated against published benchmarks:

- **CSI verification manuals**: hundreds of worked examples from SAP2000/ETABS documentation, covering frame analysis, P-Delta, buckling, modal, spectral, and design code checks
- **AISC design examples**: the Steel Construction Manual companion examples for every chapter (tension, compression, flexure, shear, combined forces, connections)
- **ACI 318 worked examples**: published design examples for beams, columns, slabs, footings, shear walls
- **Eurocode worked examples**: official and third-party guides with full numerical solutions
- **NAFEMS benchmarks**: standard FEA validation problems for plates, shells, and nonlinear analysis
- **Textbook solutions**: analytical solutions for known problems (cantilever δ = PL³/3EI, simply supported beams, continuous beams, trusses)
- **Equilibrium checks**: every test case verifies ΣF = 0 and ΣM = 0 automatically

The existing solver already passes 1,050+ tests. Every new module (member design, connections, loads, concrete, timber) adds hundreds more. If the software passes every published benchmark for a given design code, that is objective evidence of correctness — stronger than any individual reading the code, because it tests outputs against known right answers.

This approach reduces development timelines by roughly 3x compared to traditional engineering software development. The bottleneck shifts from writing code to human review — which is where it should be for software where a wrong coefficient can affect structural safety.

---

## Execution phases

The technical roadmap is ordered by business impact, not by technical difficulty. Each phase is designed to generate revenue or remove a critical adoption barrier. No phase exists for purely technical reasons — every item earns its place by serving a business need.

**Ordering principles:**
1. **Revenue first**: Phase 1 ships a sellable product. Everything before revenue is minimized
2. **Adoption barriers second**: Phase 2 removes the biggest objections (no connections, no collaboration, can't import my ETABS model, no enterprise features)
3. **Market expansion third**: Phases 3-5 double and redouble the addressable market
4. **Strategically important tech is pulled forward**: AI features ship in Phase 1 (not Phase 4) because they are the competitive moat. Offline PWA ships in Phase 1 because "what if I lose internet" kills browser adoption. Incumbent importers ship in Phase 2 because switching cost is the #1 sales objection
5. **Hard-but-not-urgent tech is pushed back**: solid elements, nonlinear analysis, and CBFEM are technically important but only matter after the core platform is generating revenue and funding the team. Exception: plates/shells are pulled into Phase 1 because slab and wall analysis is essential for a complete design tool

---

## Phase 1 — Complete design tool for one market (months 1-5, 2-3 devs)

**Business goal:** ship a sellable product. Pick US (AISC 360 + ACI 318) or EU (Eurocode 2 + 3). Build the full pipeline for steel and concrete buildings in that code system. This is the minimum product that replaces incumbent software for the most common use cases.

**Total: 9-13 dev-months.**

### 1.1 3D solver parity

The 3D solver currently handles linear static analysis only. Every advanced analysis type is restricted to 2D. This is the most critical gap. The 2D implementations are complete and well-structured. The 3D versions follow the same algorithms with 12x12 element matrices (6 DOF per node) instead of 6x6.

| Analysis | 2D status | 3D work |
|---|---|---|
| P-Delta | Complete. Iterative (K + K_G)U = F, tolerance 1e-4. | Assemble 12x12 geometric stiffness K_G from 3D axial forces. Same iteration loop. |
| Buckling | Complete. Generalized eigenvalue via Cholesky + Jacobi. | 3D K_G in the eigenvalue problem. Same solver. |
| Modal | Complete. Consistent mass matrix, participation factors, effective mass. | 3D consistent mass matrix (12x12 element M). Participation factors in X, Y, Z. |
| Plastic | Complete. Event-to-event hinge formation. | Biaxial moment interaction surface (M_y, M_z) instead of uniaxial M_p check. |
| Spectral | Complete. SRSS/CQC, CIRSOC 103 spectra. | 3D modal superposition. Combine responses in three directions. |
| Influence lines | Complete. Unit load on 2D element chain. | 3D load paths. |
| Moving loads | Complete. Train of loads, envelope. | Same as influence lines: 3D paths. |
| DXF import/export | Complete. R12 format. | Handle 3D entity types (3DFACE, 3DPOLYLINE). |

Estimated effort: 1-1.5 dev-months.

### 1.2 Steel member design — code checking

Check every steel member against the design code. This is what turns Dedaliano from an analysis tool into a design tool. Without it, the engineer runs analysis here and opens another program to check members. **This is the single most important feature for revenue.**

**AISC 360 scope:**
- Tension members: yielding on gross section, rupture on net section (Chapter D)
- Compression members: flexural buckling, torsional buckling, flexural-torsional buckling. Column curves with effective length KL (Chapter E)
- Flexure: lateral-torsional buckling (LTB), flange local buckling (FLB), web local buckling (WLB). Compact, noncompact, slender classification (Chapter F)
- Shear: web shear with and without tension field action (Chapter G)
- Combined forces: H1-1a and H1-1b interaction equations (Chapter H)
- Serviceability: deflection limits L/360 (live), L/240 (total) (Chapter L)
- Slenderness limits: L/r recommendations

**Eurocode 3 scope:**
- Cross-section classification (Class 1-4)
- Tension, compression (buckling curves a, b, c, d), bending, shear, combined
- Lateral-torsional buckling (general method and simplified)
- Serviceability deflection limits

Output per member: utilization ratio (demand/capacity), governing limit state, governing load combination, pass/fail. Color-coded visualization on the model: green (<0.7), yellow (0.7-0.9), red (>0.9), failed (>1.0).

Estimated effort: 1.5-2 dev-months per code.

### 1.3 Concrete member design — code checking

**ACI 318 scope:**
- Beam flexure: required As from moment envelope using rectangular stress block (Whitney), minimum and maximum reinforcement ratios, bar selection and spacing
- Beam shear: required Av/s, stirrup spacing, Vs + Vc checks
- Beam deflection: immediate (Ie effective moment of inertia) and long-term (lambda multiplier for creep)
- Beam crack width: Gergely-Lutz or direct tension stress check
- Column design: P-M interaction diagram (uniaxial), P-Mx-My contour (biaxial), slenderness effects (moment magnification δns, δs)
- One-way slab design: strip method, minimum thickness tables
- Two-way slab design: direct design method, equivalent frame method, punching shear (Vc at critical perimeter d/2 from column)

**Eurocode 2 scope:**
- Same categories, different formulas: parabolic-rectangular stress block, variable strut inclination for shear (θ method), crack width per EN 1992-1-1 §7.3, effective creep for long-term deflection

Output: required reinforcement schedule per member (As_top, As_bot at each section, stirrup spacing), interaction diagrams for columns, summary table with governing sections.

Estimated effort: 1.5-2 dev-months per code.

### 1.4 Load determination

Full code-based load generation for building structures.

**Wind loads (ASCE 7 Ch. 26-31 or Eurocode 1-4):**
- Input: building geometry, location (zip code or coordinates), exposure category, terrain, topography, risk category, enclosure classification
- Output: design wind speed, velocity pressure at each height (Kz profile), external pressure coefficients (Cp) for windward, leeward, side walls, roof zones, internal pressure (GCpi), wind pressures on each surface
- Automatically creates load cases for each wind direction

**Seismic loads (ASCE 7 Ch. 11-23 or Eurocode 8):**
- Input: location, site class, risk category, structural system (R, Cd, Ω0)
- Output: Ss, S1 from USGS API (or national maps), SDS, SD1, seismic design category, base shear (ELF), story forces Fx, accidental torsion
- Optionally: modal response spectrum analysis (already implemented for CIRSOC 103, adapt for ASCE 7/Eurocode 8 spectra)

**Other loads:**
- Snow loads (ASCE 7 Ch. 7 or Eurocode 1-3): ground snow load pg, flat roof snow pf, drift loads, sliding loads
- Rain loads (ASCE 7 Ch. 8): ponding on flat roofs
- Live loads: lookup tables by occupancy (ASCE 7 Table 4.3-1 or Eurocode 1-1 Table 6.2)
- Dead load takedown: self-weight from model + superimposed dead (user input per floor)

**Load combinations:**
- Generate all combinations per ASCE 7 §2.3 (LRFD) or Eurocode 0 (limit states)
- Include companion factors, notional loads, orthogonal seismic effects

Estimated effort: 1-1.5 dev-months per code.

### 1.5 Calculation reports

Auto-generate permit-ready calculation packages from analysis and design results.

Contents:
- Model description: geometry (node coordinates, element connectivity), materials (E, ν, fy), sections (A, I, J with profile designation), supports
- Loading: load cases with all applied loads, combination table with LRFD factors
- Analysis summary: solver method, convergence, key assumptions
- Results per combination: displacement tables, reaction tables, internal force diagrams (M, V, N, T), envelope curves
- Member design checks: utilization ratios at critical sections, governing limit state, governing combination per element
- Stress checks: Von Mises/Tresca verification where applicable
- Stability checks: buckling load factors, effective lengths, slenderness ratios

Output formats:
- **LaTeX source**: paste into Overleaf or compile locally
- **PDF**: one-click export for submission or review
- Copy any individual matrix (K, F, U, element k, transformation T) from the DSM wizard as LaTeX source

Template system for different firms, jurisdictions, and detail levels (summary vs full).

Estimated effort: 0.5-1 dev-months.

### 1.6 Quantity takeoff and cost estimation

The model already contains member lengths, section properties, and materials. Compute:
- Tons of structural steel (by section type and grade)
- Volume of concrete (m3 by element type)
- Weight of reinforcement (kg, from member design output)
- Number of bolts, length of welds (from connection design, Phase 2)
- Bill of materials table
- Cost estimate from user-defined unit costs

Estimated effort: 0.5 dev-months.

### 1.7 Unit system toggle

All internal calculations remain in SI (m, kN, kN·m, MPa). Display layer converts to imperial (ft, kip, kip·ft, ksi) when the user selects imperial. Conversion factors at the UI boundary only. Persisted in localStorage. Essential for US market adoption.

Estimated effort: 0.5 dev-months.

### 1.8 Offline mode (PWA)

Structural engineers work on construction sites, in remote locations, and in countries with unreliable internet. "What if I lose internet?" is a common objection to browser-based tools.

The solver already runs entirely client-side — no server needed for analysis. Adding a Service Worker and PWA manifest makes Dedaliano installable and fully functional offline:
- Cache all application assets (HTML, JS, CSS, WASM) for offline use
- Models saved to IndexedDB (upgrade from localStorage for larger storage)
- Sync to server when connectivity returns (integrates with CRDT collaboration in Phase 2)
- "Install" button adds Dedaliano to home screen / desktop like a native app

This removes the single biggest objection to browser-based tools. Engineers can run full analysis offline on a laptop at a construction site.

Estimated effort: 0.5 dev-months.

### 1.9 AI assistant (Phase 1 features)

Ship the first AI-native features alongside Phase 1 to differentiate from day one:

- **Intelligent load generation**: user inputs building geometry and location, AI determines all applicable load cases and combinations per code. Saves hours of manual work per project
- **AI design review**: after analysis + code checks, AI scans results and flags concerns (high utilization, drift limits, bearing capacity issues). First-pass review before human engineer reviews
- **Report narration**: AI writes the engineering narrative sections of the calculation report — structural system description, design assumptions, governing conditions

These are high-impact, low-risk AI applications. The AI suggests; the engineer reviews and approves. No autonomous decisions on structural safety.

Estimated effort: 1 dev-month.

### 1.10 Plates and shells

Triangular and quadrilateral plate/shell elements for floor slabs, walls, tanks, and shell structures. The Discrete Kirchhoff Triangle (DKT) for bending combined with the Constant Strain Triangle (CST) for membrane action.

Without plate elements, engineers cannot model concrete slabs, shear walls, or steel deck — these are present in virtually every building project. A "complete design tool" that only handles frame elements forces the engineer back to another program for anything involving a slab or wall. Pulling plates/shells into Phase 1 eliminates this gap.

**Scope:**
- DKT+CST triangular elements (bending + membrane)
- Quadrilateral elements via compatible subdivision
- 2D mesh generator (Delaunay triangulation or advancing front)
- Concrete slab design, steel deck design, shear wall analysis, foundation mat analysis
- Post-processing: stress contours, displacement fields, result extraction along section cuts

Estimated effort: 2-3 dev-months. New element formulations and mesh generation are the hardest items in Phase 1.

---

## Phase 2 — Connections, server, performance (months 5-11, 3-4 devs)

**Business goal:** close the design loop with connections. Enable server-side computation and collaboration. Open the API and education markets.

**Total: 12-18 dev-months.**

### 2.1 Steel connection design

Design the 20 most common steel connections. For each: select bolt pattern, weld sizes, stiffener plates. Check all failure modes per AISC 360/Eurocode 3.

**Connection types (initial 10, then expand to 20):**
1. Shear tab (fin plate / single plate)
2. Double angle shear connection
3. Unstiffened seated connection
4. Extended end-plate moment connection (4-bolt and 8-bolt)
5. Flush end-plate moment connection
6. Column base plate (pinned and moment)
7. Bracing gusset plate (Whitmore section, block shear)
8. Column splice (bolted flange plate)
9. Beam splice (bolted web and flange)
10. Beam-to-beam connection (coped beam, simple framing)

**Failure modes checked per connection:**
- Bolt shear, bolt bearing, bolt tension, bolt slip (for slip-critical)
- Plate bending (yield line), plate shear yielding, plate shear rupture
- Weld throat stress (fillet and CJP)
- Block shear (Ubs factor)
- Column web panel zone shear
- Prying action (for T-stub moment connections)

**What Dedaliano already provides:**
- Section catalog for beam/column selection
- Internal forces (M, V, N) at each joint from the solver
- 3D rendering for connection visualization with bolts, plates, welds
- KaTeX for displaying code check equations

New code: ~15,000-25,000 LOC. Estimated effort: 1.5-2 dev-months for initial 10 types.

### 2.2 Rust/WASM solver

The TypeScript solver handles ~500 free DOFs in real time. Beyond that, the O(n³) dense linear system solver and O(n⁴) Jacobi eigenvalue solver become bottlenecks. For a 200-element 3D frame (~1,200 DOFs), modal analysis takes seconds, not milliseconds.

Integration path:
1. Compile the Rust solver in `engine/` to WASM via wasm-pack
2. Expose `solve(json) -> json` callable from TypeScript
3. Fall back to TypeScript solver if WASM unavailable
4. Same Rust binary compiles as native executable for server-side computation

Additionally: sparse matrix storage (CSR/CSC) and iterative solvers (conjugate gradient for SPD systems, implicitly restarted Lanczos for eigenvalue problems). Sparse solvers scale O(nnz) per iteration instead of O(n³), making 5,000+ DOF models feasible.

Estimated effort: 1.5-2 dev-months.

### 2.3 Real-time collaboration

Multiple engineers on the same model simultaneously. This does not exist in any commercial structural analysis tool (SAP2000, ETABS, Robot, RSTAB, RFEM are all single-user desktop).

**Architecture: CRDTs over WebSocket.**

CRDTs (Conflict-free Replicated Data Types) guarantee convergence by construction, regardless of message ordering, with no transformation functions. Dedaliano's model is a set of Maps (`Map<id, Node>`, `Map<id, Element>`, etc.) which maps directly to CRDT Map types.

| Store data | CRDT type | Conflict policy |
|---|---|---|
| Nodes | LWW-Map (Last Writer Wins per key) | Two users edit same node: last write wins |
| Elements | LWW-Map | Same element edited: last write wins |
| Materials, sections | LWW-Map | Rarely contested |
| Loads | Add-Wins Set | Both users add loads: both kept |
| ID generation | Client-ID + Lamport clock | No conflicts by design |

**Library: Yjs.** Most mature CRDT library. Native Y.Map, Y.Array, Y.Text types. Awareness protocol for cursor/presence sharing. UndoManager for per-user undo stacks.

**Networking: WebSocket primary, WebRTC optional.** y-websocket for relay through server. y-webrtc for optional lower-latency P2P cursor sync. Both providers on the same Y.Doc — Yjs deduplicates.

```
Client A <--WebSocket--> Server <--WebSocket--> Client B
   |                                               |
   +-------------WebRTC (optional)------------------+
```

**Server: Go.** Accept WebSocket connections, relay Yjs deltas, persist documents to database, check auth tokens. A few hundred lines. Goroutines handle thousands of concurrent connections.

**CRDTs are valuable even with a server** because they enable local-first editing: every edit applies instantly to the local replica (0ms latency), delta sent in background. Also provides offline editing for free.

**What changes in Dedaliano:**
1. ID generation: replace auto-increment counters with UUIDs or Yjs client-ID + Lamport clock
2. Model store CRDT bridge: replace `$state` Maps in `model.svelte.ts` with wrappers over Yjs Y.Maps. Mutations go through Yjs. Observe callbacks propagate into Svelte reactivity. Incremental: one entity type at a time
3. Undo/redo: replace snapshot-based history with Yjs UndoManager (per-user stacks)
4. Referential integrity: validation pass after every remote sync (detect elements pointing to deleted nodes)
5. Awareness and presence: colored cursors, user list, "user X is editing element Y" in 2D and 3D viewports
6. Server: y-websocket relay (~30 LOC), persistence (~50 LOC), JWT auth (~50 LOC)

**Solver in multiplayer:** each client runs the solver locally on its own CRDT replica. Results are not synced — they are ephemeral, derived from the model.

Estimated effort: 1.5-2 dev-months.

### 2.4 REST API

Expose the solver as an HTTP endpoint. Input: JSON model definition. Output: JSON results (displacements, reactions, internal forces, stress checks). The Go server hosts the API. The Rust solver (native binary) handles computation.

Use cases:
- Parametric studies: Python script varies parameters, calls API for each case, plots results in Jupyter
- Automated verification: CI pipeline checks that a model still passes after a design change
- Auto-grading: professor's script compares student submissions against reference solutions
- Integration: BIM software, optimization scripts, custom dashboards

Estimated effort: 0.5-1 dev-months.

### 2.5 Foundation design

Analyze and design shallow foundations from column reactions.

**Scope:**
- Isolated footings: sizing for bearing pressure, one-way and two-way shear, flexure, reinforcement
- Combined footings: two columns on one footing, trapezoidal pressure distribution
- Strap footings: two footings connected by a strap beam
- Mat foundations: Winkler springs (already in solver as spring supports), plate on elastic foundation

**Soil parameters:** bearing capacity, modulus of subgrade reaction, friction angle, cohesion as additional material properties.

Code checks per ACI 318 or Eurocode 2 (footing design) + geotechnical bearing capacity (Terzaghi/Meyerhof or Eurocode 7).

Estimated effort: 0.5-1 dev-months.

### 2.6 Education platform

Interactive problem sets with auto-grading for university courses.

**Features:**
- Professor defines a structure and reference solution
- Student solves by hand, enters values (reactions, displacements, internal forces)
- Tool compares each value against solver's solution: correct/incorrect with expected value and error
- Quiz mode: hide selected results, student computes them
- Real-time visualization: change a load and see the moment diagram update
- LMS integration: Moodle, Canvas, Google Classroom via LTI protocol
- Embed mode: iframe-friendly `?embed=true` URL parameter, hides toolbar/tabs/panels, shows only viewport with pre-loaded model

**Revenue model:** $50-100/student/year. A 200-student course = $10,000-20,000/year from one department.

Estimated effort: 1-1.5 dev-months.

### 2.7 AI assistant (Phase 2 features)

- **Natural language model editing**: "add a 20kN point load at midspan of beam B3", "change all W14 columns to W16" — parsed into model mutations. No menu navigation
- **Auto-sizing optimizer**: describe constraints and let AI iterate analysis + code checks to find optimal member sizes
- **Code provision lookup**: ask "what's the minimum reinforcement ratio for this beam per ACI 318-19?" and get the exact clause, formula, and computed value

Estimated effort: 1 dev-month.

### 2.8 Project management and version control

Engineers manage dozens of active projects. Currently Dedaliano has single-model autosave to localStorage. This must become a real project management layer.

**Project dashboard:**
- Project list with search, status (active, archived, submitted), owner, last modified
- Folder/tag organization
- Per-project settings (design code, unit system, report template)

**Model version control and audit trail:**
- Every save creates a versioned snapshot with timestamp and author
- Named versions: "submitted for permit", "revision 2 per plan check comments", "final for construction"
- Diff view between versions: highlight changed nodes, elements, loads, sections
- Full history: who changed what, when, and why
- This is a regulatory requirement — when a building department asks "show me the calculation submitted on March 15," the engineer must produce that exact version
- Server-side storage (integrates with Go server from 2.3) with client-side cache for offline access

**Audit trail for professional liability:**
- Immutable log of all design decisions: who approved which design check, when loads were finalized, when the report was generated
- Exportable as PDF for insurance and legal records
- This protects the engineer — and makes firms more comfortable adopting new software

Estimated effort: 1-1.5 dev-months.

### 2.9 Enterprise features

Large firms (AECOM, WSP, Thornton Tomasetti, 500+ engineers) buy through procurement departments. They have requirements that individual engineers don't:

- **SSO/SAML**: integrate with firm's identity provider (Azure AD, Okta, Google Workspace). No separate passwords
- **Admin dashboard**: firm administrator manages users, assigns licenses, monitors usage
- **Usage reporting**: how many analyses run, by whom, compute hours consumed. Required for cost allocation
- **Role-based access**: project lead can edit, junior engineer can view/run analysis, reviewer can comment. Matches firm hierarchy
- **Data residency**: option to host project data in specific regions (EU firms may require EU data storage for GDPR)
- **Priority support and SLA**: guaranteed response times, dedicated support contact

Enterprise deals are high-value: a 200-person firm at $50/month/seat = $120,000/year. Worth the investment.

Estimated effort: 1.5-2 dev-months.

### 2.10 Incumbent model importers

Engineers have hundreds of existing models in incumbent formats. If they can't bring their existing work to Dedaliano, the switching cost is too high. Import converters remove this barrier.

**Priority formats:**
- **ETABS (.e2k text format)**: most common high-rise analysis tool. .e2k is a text-based format that is well-documented and parseable. Import geometry, sections, materials, loads, load combinations
- **SAP2000 (.$2k text format)**: same company as ETABS, similar text format. Covers general structures
- **STAAD.Pro (.std text format)**: dominant in India and parts of Asia. Text-based input file
- **RFEM (XML-based)**: Dlubal exports to XML. Increasingly popular in Europe

These are read-only importers — we don't need to write back to incumbent formats. The goal is one-click migration: open your ETABS model in Dedaliano, verify results match, and never go back.

**Migration verification workflow:** after import, run analysis in both tools and compare results automatically. Generate a comparison report showing that Dedaliano matches the incumbent within acceptable tolerance. This is also a powerful sales tool — "your existing model gives the same results in Dedaliano."

Estimated effort: 0.5-1 dev-months per format (text-based formats are straightforward to parse).

### 2.11 Revit/Tekla live link plugin

Bidirectional sync between Dedaliano and BIM tools:
- Import analytical model from Revit/Tekla into Dedaliano
- Run analysis and design in Dedaliano
- Push results (utilization ratios, reactions, member sizes, reinforcement) back to the BIM model
- Keep models synchronized as either side changes

Not just IFC export — a live link that reflects changes in real time. This is how ETABS and Robot win deals in firms that use Revit. We must match this integration to compete for those firms.

Estimated effort: 1-1.5 dev-months.

---

## Phase 3 — Second market, more materials (months 11-15, 4-5 devs)

**Business goal:** double the addressable market with the second code system. Expand to timber and prestressed concrete — underserved niches with high willingness to pay.

**Total: 8-11 dev-months.**

### 3.1 Second design code

Add Eurocode 2+3 if Phase 1 chose AISC/ACI, or AISC 360 + ACI 318 if Phase 1 chose Eurocode. This doubles the addressable market from ~25-30% to ~50-60% of global structural engineering.

Scope: steel member design, concrete member design, load determination, connection design — all re-implemented for the second code. The solver and UI are shared; only the code check functions differ.

Estimated effort: 3-4 dev-months. Second code is always faster — patterns from the first implementation are reused.

### 3.2 Timber design

NDS (US) or Eurocode 5 (EU). Residential construction in US/Canada/Scandinavia is almost entirely wood. Mass timber (CLT buildings up to 18 stories) is creating new demand. ClearCalcs' most popular calculators are timber.

**Unique concerns:**
- Moisture-adjusted strength: duration of load factors (CD), wet service factors (CM), temperature factors (Ct), size factors
- Notch effects: reduced shear capacity at notched ends
- Connection capacity: Johansen yield model (European Yield Model) — bolt, nail, screw, dowel connections
- Lateral-torsional buckling: different slenderness formulas and beam stability factors than steel
- Section catalog: standard lumber sizes (2x4 through 2x12, 4x4 through 12x12), glulam layups, CLT panel properties, LVL/PSL/LSL engineered wood

**Design checks:** flexure (Fb'), compression (Fc'), tension (Ft'), shear (Fv'), bearing (Fc⊥'), combined bending and axial, deflection limits.

Estimated effort: 1-1.5 dev-months per code.

### 3.3 Prestressed and post-tensioned concrete

ADAPT (Trimble) charges $5,000+/yr. Every mid-rise and high-rise concrete building uses post-tensioning. Very specialized, very expensive incumbents, very underserved.

**Scope:**
- Tendon profile geometry: parabolic, harped, straight. Layout in plan and elevation
- Prestress losses: elastic shortening, friction (wobble + curvature), anchorage set, creep, shrinkage, relaxation
- Staged analysis: transfer (initial prestress), service (long-term losses), ultimate
- Hyperstatic (secondary) effects from tendon profile
- Design checks: stress limits at transfer and service (ACI 318 §24.5 or Eurocode 2 §5.10), ultimate flexural capacity with bonded/unbonded tendons, shear with prestress contribution

Estimated effort: 1.5-2 dev-months per code.

### 3.4 Additional connection types

Expand from 10 to 20 steel connection types. Add:
- Stiffened seated connection
- Single-plate (extended shear tab)
- Hanger connection
- Moment frame panel zone doubler plate design
- Hollow section connections (HSS-to-HSS)
- Truss gusset plate (multi-member)

Plus concrete connections (corbels, brackets, anchor bolt groups per ACI 318 Appendix D / Eurocode 2 anchorage) and timber connections (bolted, nailed, screwed per NDS Chapter 12 or Eurocode 5 Chapter 8).

Estimated effort: 1-1.5 dev-months.

---

## Phase 4 — Full platform (months 15-24, 5-8 devs)

**Business goal:** cover every common structural material and analysis type. Revenue from Phases 1-3 funds the team. After this phase, Dedaliano handles ~80-85% of everything a structural engineer does (the remaining ~15-20% is construction drawings — Revit/Tekla territory).

**Total: 23-33 dev-months.**

### 4.1 Cold-formed steel

AISI S100 (US), Eurocode 3 Part 1-3 (EU). Light-gauge steel framing for residential and low-rise commercial. Fast-growing market. Almost no independent browser-based options.

Unique analysis: effective width method, distortional buckling (Direct Strength Method — DSM), local buckling interaction. Thinner sections mean more complex stability behavior than hot-rolled steel. Section catalog: C-studs, tracks, Z-purlins, hat channels, custom cold-formed shapes.

Estimated effort: 1-1.5 dev-months per code.

### 4.2 Composite steel-concrete

AISC 360 Chapter I (US), Eurocode 4 (EU). Composite beams (steel beam + concrete slab acting together), composite slabs with metal decking. Used in virtually every multi-story steel building.

Scope: shear stud calculation (Qn), effective slab width, plastic moment capacity of composite section, partial composite interaction, construction stage (unshored beam carrying wet concrete), deflection with partial interaction, vibration check.

Estimated effort: 0.5-1 dev-months per code.

### 4.3 Masonry design

TMS 402 (US), Eurocode 6 (EU). Bearing walls, shear walls, lintels, arches. Common in low-rise construction in Latin America, Europe, Middle East.

Scope: flexural capacity of grouted/ungrouted walls, shear capacity (in-plane and out-of-plane), axial-flexural interaction, slenderness effects, reinforcement requirements, bond beam design.

Estimated effort: 0.5-1 dev-months per code.

### 4.4 Solid (3D continuum) finite elements

Tetrahedral and hexahedral elements for volumetric stress analysis. Extends the plate/shell capability (Phase 1, section 1.10) into the third dimension.

**Use cases:**
- Thick concrete structures: transfer beams, pile caps, deep beams where beam theory breaks down
- Anchorage zones in post-tensioned concrete: local stress concentrations around tendon anchors
- Steel casting nodes: complex 3D joints in architecturally exposed steel structures
- Dam sections, machine foundations, nuclear containment walls
- Any situation where the structure is too thick or too complex for plate/shell idealization

**Implementation:**
- 10-node quadratic tetrahedral elements (robust, meshes any geometry)
- 20-node hexahedral elements (more accurate for regular geometries)
- 3D mesh generator: integrate TetGen (open source, Delaunay-based) or implement advancing front. Automatic meshing from boundary surfaces
- Post-processing: 3D stress contours (Von Mises, principal stresses), isosurfaces, section cuts through solid regions
- Mixed models: frame elements + shell elements + solid elements in the same model (transition elements at interfaces)

Shares mesh generation infrastructure with plates/shells (1.10). The element stiffness formulations are well-documented in every FEA textbook (Hughes, Bathe, Zienkiewicz).

Estimated effort: 3-4 dev-months. Hard — 3D meshing and mixed-dimensional coupling are complex.

### 4.6 Advanced analysis types

Features that advanced users and seismic engineers expect:

**Nonlinear time history analysis:** direct integration of equations of motion (Newmark-beta, HHT-alpha) with applied ground motion records. Required for performance-based seismic design of tall buildings and critical facilities. Input: acceleration time history (from PEER NGA database). Output: response history, peak inter-story drifts, peak floor accelerations, residual drifts.

**Staged/phased construction analysis:** model construction sequence — pour floor 1, shore, pour floor 2, remove shores, apply finishes. Each stage has different geometry and loads. Critical for post-tensioned concrete, tall buildings, and bridges. Tracks cumulative creep, shrinkage, and relaxation across stages.

**Nonlinear material models:**
- Fiber analysis for concrete columns: divide cross-section into fibers, each with its own stress-strain curve. Captures concrete cracking, steel yielding, confined vs unconfined concrete behavior. Required for accurate P-M interaction and ductility assessment
- Concrete cracking and tension stiffening models
- Steel hardening models (kinematic, isotropic) for cyclic analysis

**Cable and tension structures:** cable elements with large-displacement geometric nonlinearity. Form-finding algorithms (force density method, dynamic relaxation). Applications: suspension bridges, cable-stayed structures, tensile membrane roofs, guy wires.

Estimated effort: 3-4 dev-months total.

### 4.7 Bridge design

AASHTO LRFD (US), Eurocode 1-2 (EU). Bridge load rating for existing bridges, permit load analysis. Government infrastructure market with reliable budgets.

Scope: HL-93 live load model (lane + truck/tandem), distribution factors, fatigue limit state, load rating factors (RF), prestressed girder design, bridge deck design.

Estimated effort: 1.5-2 dev-months.

### 4.8 Fire design

Structural fire engineering. Temperature-dependent material properties, fire resistance verification per ISO 834 fire curves. Eurocode fire parts (EN 1992-1-2 for concrete, EN 1993-1-2 for steel, EN 1995-1-2 for timber).

Growing regulatory requirement. Critical for timber/mass timber buildings where fire is often the governing design case. Very few tools exist at any price.

Estimated effort: 1-1.5 dev-months.

### 4.9 Seismic retrofit and rehabilitation

Existing building assessment and retrofit design. Huge market — millions of buildings worldwide need seismic upgrades.

**Scope:**
- Assessment per ASCE 41 (US) or Eurocode 8-3 (EU): nonlinear static (pushover) analysis for performance evaluation
- FRP wrapping: flexural and shear strengthening of concrete members with fiber-reinforced polymers
- Steel jacketing: concrete column strengthening with steel plates
- Base isolation: isolation bearings (lead-rubber, friction pendulum) — modify support conditions, nonlinear analysis of isolated structure
- Supplemental damping: viscous dampers, buckling-restrained braces as retrofit elements

Estimated effort: 1.5-2 dev-months.

### 4.10 Geotechnical analysis

Slope stability (method of slices: Bishop, Janbu, Spencer) and retaining wall design (gravity walls, cantilever walls, sheet pile walls). 2D problems that fit Dedaliano's existing 2D viewport.

Slope stability requires a soil profile (layers with different properties) and a search algorithm for the critical slip surface (circular or non-circular). Output: factor of safety and geometry of critical failure surface.

Deep foundations: single piles (axial capacity from SPT/CPT), pile groups (group efficiency, settlement), laterally loaded piles (p-y curves).

Estimated effort: 1-1.5 dev-months for slope stability, 1-1.5 for deep foundations.

### 4.11 Progressive collapse analysis

Required by GSA (US General Services Administration) for federal buildings and DoD (UFC 4-023-03) for military facilities. Increasingly required by local jurisdictions for important buildings.

**Methodology:**
- Alternate path method: remove one column (or wall segment) at a time, check if the remaining structure can redistribute loads without collapse
- Nonlinear dynamic analysis of the sudden column removal scenario (requires nonlinear time history from 4.5)
- Tie force method: verify that structural connections can develop catenary action
- Enhanced local resistance: verify that key elements can resist abnormal loads

Relatively simple to implement once the nonlinear solver exists — the main work is the automated column removal loop and the acceptance criteria checks per GSA/DoD guidelines.

Estimated effort: 0.5-1 dev-months.

### 4.12 Soil-structure interaction

Beyond simple Winkler springs at the base. For seismic design of important structures, the foundation flexibility affects the entire building's response.

**Scope:**
- Impedance functions: frequency-dependent stiffness and damping for surface and embedded foundations (Gazetas formulas)
- Foundation springs: translational and rotational springs at each support computed from soil properties and footing geometry
- P-y springs for laterally loaded piles: nonlinear springs that capture soil resistance as a function of lateral displacement. Different curves for sand (Reese), clay (Matlock), and layered soils
- Kinematic interaction: how the foundation filters ground motion before it reaches the superstructure
- ASCE 7 Chapter 19 / Eurocode 8 provisions for SSI effects

This bridges the structural and geotechnical modules (4.9) — the pile design from geotechnical analysis feeds directly into the foundation springs for the structural model.

Estimated effort: 1-1.5 dev-months.

### 4.13 Thermal loads

Temperature effects on long buildings, bridges, parking garages, and industrial structures. Missing from the load determination section but required for many structure types.

**Scope:**
- Uniform temperature change (ΔT): expansion/contraction of all members. Convert to equivalent nodal forces via thermal strain ε = αΔT
- Temperature gradient: different temperature on top and bottom of a member (e.g., bridge deck heated by sun on top, shaded below). Creates bending
- Temperature load cases per ASCE 7 or Eurocode 1-5 (thermal actions)
- Expansion joint spacing recommendations based on building length and climate

Technically straightforward — thermal loads produce equivalent forces that feed into the existing solver. The work is in the UI (temperature input per member/group) and the code-based temperature ranges.

Estimated effort: 0.5 dev-months.

### 4.14 Performance-based seismic design

FEMA P-58 / ASCE 41 performance-based engineering. This is where the industry is heading — especially for tall buildings in high-seismic regions (Los Angeles, San Francisco, Seattle, Tokyo, Istanbul).

**Scope:**
- Performance objectives: Immediate Occupancy (IO), Life Safety (LS), Collapse Prevention (CP) at different hazard levels
- Demand parameters from nonlinear time history analysis (4.5): peak inter-story drifts, peak floor accelerations, residual drifts, peak beam/column rotations
- Fragility functions: probability of damage to structural and nonstructural components as a function of demand parameters
- Loss estimation: expected repair cost, downtime, and casualties for a given earthquake scenario. Output: "this building has a 10% probability of $2M in earthquake damage over 50 years"
- Acceptance criteria per ASCE 41: component-level checks (plastic hinge rotations vs acceptance limits for IO/LS/CP)

This is the most advanced analysis capability in the roadmap. It requires nonlinear time history analysis, fiber analysis for columns, and a library of fragility curves. But it's also the highest-value capability — performance-based design projects for tall buildings command premium fees.

Estimated effort: 1.5-2 dev-months (builds on 4.5 nonlinear analysis).

### 4.15 Fatigue analysis

For bridges, crane girders, offshore structures, wind turbine towers. S-N curves, Miner's rule cumulative damage, stress range counting (rainflow method). AISC 360 Appendix 3, Eurocode 3-1-9.

Estimated effort: 0.5-1 dev-months.

### 4.16 Floor vibration and serviceability

Footfall analysis, vibration from equipment or pedestrian traffic. Required for hospitals, labs, offices with sensitive equipment. SCI P354 (UK), AISC Design Guide 11 (US).

Natural frequency calculation (already in modal analysis), damping estimation, response factor computation, acceleration limits.

Estimated effort: 0.5 dev-months.

### 4.17 Scaffolding and temporary works

Formwork, shoring, scaffolding design. Required on every construction site. Usually done poorly or with rules of thumb. High liability. No good browser tool.

Covers: falsework design for concrete pours, scaffold load capacity, bracing requirements, foundation checks for temporary supports.

Estimated effort: 0.5-1 dev-months.

### 4.18 Detailing (partial)

Full construction drawings are out of scope (CAD engine). Two feasible slices:

**Rebar schedules and bar bending shapes:** take concrete design output (required As at each section) and generate bar marks, cut lengths, bending shapes per standard shapes (ACI Detailing Manual or Eurocode 2 standard bends). Standalone product in some markets.

**Connection detail sheets:** take connection design output and generate plan/elevation drawing with bolt pattern, weld symbols, plate dimensions. Not a full shop drawing but enough for the calculation report and for the fabricator to start from.

Estimated effort: 1.5-2 dev-months.

---

## Phase 5 — Global code expansion (months 22-30)

**Business goal:** expand from 50-60% to 80-90% of the global structural engineering market by adding the most important regional design codes.

Four code families (AISC/ACI + Eurocode) cover the US, EU, and most countries that adopt either system. But several large markets have their own codes:

| Region | Code | Market size | Priority |
|---|---|---|---|
| India | IS 456 (concrete), IS 800 (steel) | ~200,000 structural engineers, fast-growing construction market | High |
| China | GB 50010 (concrete), GB 50017 (steel) | Largest construction market by volume | High |
| Japan | AIJ (Architectural Institute of Japan) standards | High seismicity, sophisticated engineering market | Medium |
| Brazil | NBR 6118 (concrete), NBR 8800 (steel) | Largest Latin American market | Medium |
| Australia/NZ | AS 3600 (concrete), AS 4100 (steel) | Wealthy market, underserved by incumbents | Medium |
| Canada | CSA A23.3 (concrete), CSA S16 (steel) | Close to US codes but distinct | Medium |
| South Korea | KBC (Korean Building Code) | Advanced construction market | Lower |

**Strategy:** each code implementation reuses the same architecture — shared solver, shared UI, only code check functions differ. After the first two code families, adding a new code is primarily a formula translation exercise.

**Indian codes (IS 456 + IS 800):** India has ~200,000 structural engineers and a construction boom. IS codes are based on older British standards but diverging. Most Indian engineers currently use STAAD.Pro or pirated copies of ETABS. Browser-based tool at $49-99/month is transformative for this market.

**Chinese codes (GB 50010 + GB 50017):** China builds more structures annually than any other country. Chinese design codes have unique provisions (seismic intensity vs PGA, different concrete grades, different partial safety factors). Major opportunity but requires Mandarin localization.

**Other codes:** prioritize based on market size, willingness to pay, and similarity to existing implementations. Japanese AIJ codes are the most different from Western codes. Canadian CSA codes are closest to AISC/ACI.

Estimated effort: 1-2 dev-months per code pair (steel + concrete). Faster with each additional code as the pattern is established.

**Total: 8-14 dev-months for code families.**

### 5.2 CBFEM for arbitrary connections

Component-Based Finite Element Method — the approach IDEA StatiCa uses. Instead of predefined connection types (Phase 2's 20 types), CBFEM meshes every plate, bolt, and weld in a connection with shell/solid finite elements and solves for stresses directly. This handles ANY connection geometry, no matter how unusual.

**Why this kills IDEA StatiCa ($1,990-5,250/yr):**
- IDEA StatiCa's entire business is CBFEM connections. If Dedaliano includes this at $50/month Pro, there is no reason to buy IDEA StatiCa separately
- "Any connection, any geometry" is a strong marketing message — engineers hit the limits of predefined connection types regularly

**Implementation:**
- Connection geometry modeler: 3D UI for placing plates (stiffeners, end plates, gussets), bolt patterns, and weld paths on steel sections. Users define arbitrary geometries, not just the 20 predefined types
- Auto-meshing: generate shell element mesh for each plate component, contact elements between plates and bolts, weld elements along weld paths
- Solver: reuses the plate/shell solver (4.4) and solid elements (4.5) — the connection model is a small FEA problem (typically 500-5,000 DOFs)
- Post-processing: stress contours on each plate, bolt force distribution, weld utilization along length, plastic strain for ductility assessment
- Code checks: equivalent stress check per AISC 360 / Eurocode 3 at every point in the connection, not just at predefined failure modes

**Prerequisites:** plates/shells (1.10) and solid elements (4.4) must be working first. The connection geometry modeler (3D plate/bolt/weld placement UI) is the hardest part — this is where IDEA StatiCa invested years of development.

Estimated effort: 4-6 dev-months. Very Hard — the geometry modeler and auto-meshing are the challenging parts, not the FEA solver.

**Total Phase 5: 12-20 dev-months.**

---

## Additional features

### Conceptual / preliminary design

Span tables and rules of thumb for initial member sizing. Structural system selection guide (moment frames vs braced frames vs shear walls based on height, span, seismicity). Quick cost comparison between steel and concrete framing.

### Nonlinear pushover analysis

Incremental static analysis with monotonically increasing lateral loads. Capacity curve (base shear vs roof displacement) for performance-based seismic design. Extends the existing 2D plastic analysis with a load control algorithm (force-controlled or displacement-controlled arc-length method).

### Import/export improvements

**DXF layer mapping wizard:** when importing DXF, show a dialog listing all layers and let the user map each to a structural role ("these lines are elements", "these points are supports"). Currently all lines are imported as elements with default properties.

**IFC round-trip:** currently import-only via web-ifc WASM. Adding export enables round-trip BIM interoperability: import from Revit/Tekla, analyze in Dedaliano, export back with results as IFC property sets.

### UX and accessibility

- Responsive/mobile: pinch-to-zoom, swipe to pan, long-press for context menu, collapsible panels on small screens
- Light mode and high contrast theme alongside current dark theme
- Keyboard accessibility for all toolbar actions
- Localization: English, Spanish, Portuguese, Mandarin, Hindi (matching global code expansion markets)

### Visualization improvements

- Load case comparison split view: two panels showing the same structure with different load cases, synchronized zoom/pan
- Animated influence lines: unit load moves along the structure, deformed shape and influence line update in real time
- SVG export: resolution-independent viewport export for technical reports and papers
- 3D overlay comparison (superimposing results from different cases, not yet implemented for 3D)

---

## Research-driven features

### Topology optimization

Ground structure optimization: start with a dense mesh of candidate bars, remove bars carrying negligible force. Returns the lightest truss satisfying stress and displacement constraints. Useful for long-span roofs, transfer structures, bridge preliminary design.

### Physics-Informed Neural Networks (PINNs) as surrogate models

Train a small neural network to approximate the solver for a parametric structure family. Drag a slider to change span from 6m to 12m and see the moment diagram update at 60fps. Training data from Dedaliano's own solver. Inference in browser via ONNX Runtime WASM or TensorFlow.js.

### Digital twin integration

Connect a Dedaliano model to real-time sensor data (strain gauges, accelerometers, displacement transducers). Live stress and displacement overlays. Use cases: structural health monitoring, proof load testing, construction monitoring. Depends on REST API and Rust/WASM solver.

### Optimization as a service

User defines design variables (section sizes, member topology, support locations), constraints (stress limits, displacement limits, code checks), and an objective (minimize weight, cost, or deflection). Optimizer (genetic algorithm, gradient-based, or hybrid) calls solver repeatedly. Natural use case for server-side computation paid tier.

---

## Defending against incumbent response

When Dedaliano gains traction, incumbents will respond. Anticipate and prepare:

**CSI (ETABS/SAP2000) moving to cloud:** CSI has been slowly building web interfaces. Their advantage is 30 years of verified analysis and design. Their disadvantage is a monolithic C/C++ codebase that is extremely difficult to port to the browser. Our response: move faster. By the time they ship a browser version, we should have feature parity on the design code coverage they offer.

**Dlubal (RFEM) price drops:** Dlubal already has aggressive pricing in some markets. They may match our $50/month. Our response: the free tier. If they match our price, we still have a free tier they can't match without destroying their business model. Also: our AI features create value they cannot replicate without rewriting their software.

**Autodesk bundling:** Autodesk may bundle Robot Structural Analysis more aggressively with their AEC Collection. Our response: Robot is widely considered the weakest analysis tool. Bundling a weak product doesn't make it stronger. Focus on being the best tool, not the bundled tool.

**SkyCiv/ClearCalcs competing:** Other browser-based tools are closest competitors. Our response: cover more of the pipeline (they don't do connections, foundations, or advanced analysis), be open source (they're closed), and push AI features they haven't built.

**Key insight:** incumbents cannot easily add AI-native features to 30-year-old desktop C++ codebases. They cannot easily add real-time collaboration. They cannot easily match browser-native deployment (zero install, works on any device). Our structural advantages compound over time.

---

## Total effort

All estimates assume AI-generated code with human review on every PR and commit (see Development methodology above).

| Category | Dev-months |
|---|---|
| Phase 1: one-code design tool + AI assistant + offline + plates/shells | 9-13 |
| Phase 2: connections + server + collaboration + enterprise + migration | 12-18 |
| Phase 3: second code + timber + prestressed | 8-11 |
| Phase 4: full platform (all materials + advanced analysis + solid elements) | 23-33 |
| Phase 5: global codes + CBFEM connections | 12-20 |
| **Total** | **60-95** |

| Team size | Time to Phase 4 complete | Time to Phase 5 complete |
|---|---|---|
| 3 developers + reviewers | 17-25 months | 21-32 months |
| 5 developers + reviewers | 10-15 months | 12-19 months |
| 10 developers + reviewers | 5-8 months | 7-10 months |

Phase 1 alone (sellable product) with 3 developers: **3-5 months**.

### Accelerated estimates (full AI generation)

The baseline estimates assume developers write code with AI assistance (~3x productivity gain). An alternative model: AI generates all implementation code, with engineers reviewing every commit for correctness, standards compliance, and architectural integrity. Under this model, code generation ceases to be the bottleneck — review throughput is.

**Effort by phase:**

| Phase | Baseline (dev-months) | Full AI gen (dev-months) |
|---|---|---|
| Phase 1: one-code design tool + plates/shells | 9-13 | 5-7 |
| Phase 2: connections + server + enterprise | 12-18 | 6-9 |
| Phase 3: second code + timber + prestressed | 8-11 | 4-6 |
| Phase 4: full platform | 23-33 | 13-19 |
| Phase 5: global codes + CBFEM | 12-20 | 7-11 |
| **Total** | **64-95** | **35-52** |

Phases 2-3 see the largest reduction (~50%) because the work is predominantly formula translation from published standards — well-specified inputs, deterministic outputs, testable against published worked examples (AISC design examples, Eurocode worked examples). Phase 1 compresses slightly less (~45%) because it now includes plates/shells (DKT+CST element formulations, mesh generation), which requires iterative numerical validation. Phases 4-5 compress least (~40-45%) because they include nonlinear solvers, novel element formulations, and CBFEM connection modeling which is R&D-intensive with limited prior art.

**Calendar milestones (cumulative, full AI generation):**

| Team size | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|---|---|---|---|---|---|
| 3 developers + reviewers | Month 3 | Month 5 | Month 7 | Month 13 | Month 17 |
| 5 developers + reviewers | Month 2 | Month 3 | Month 5 | Month 9 | Month 12 |
| 10 developers + reviewers | Month 1 | Month 2 | Month 3 | Month 5 | Month 7 |

**Rate-limiting factors.** Four constraints prevent acceleration beyond ~50%, regardless of AI capability:

1. **Review throughput.** Every design code formula, coefficient table, and failure-mode check must be verified by a structural engineer against the governing standard. A reviewer can process a finite number of PRs per day — generating code faster does not increase this rate.
2. **Benchmark validation.** Generated code must be tested against published benchmarks (AISC design examples, Eurocode worked examples, NAFEMS verification tests). Setting up test cases, comparing numerical results, and investigating discrepancies is wall-clock work that cannot be parallelized away.
3. **Integration testing.** When the solver, design checks, report engine, and UI interact across 50+ modules, integration defects emerge that require understanding the full system. This debugging is inherently sequential.
4. **UX iteration.** Structural engineers have specific workflow expectations. Interface design requires build-test-revise cycles with real users; AI can generate UI code instantly but cannot compress the feedback loop.

Under this model, the binding constraint is the number of qualified reviewers (structural engineers and senior software engineers), not the number of developers. Beyond 5-10 developers, adding headcount yields diminishing returns — review capacity determines throughput.

### Revenue milestones

| Milestone | When | Revenue potential |
|---|---|---|
| Phase 1 ships | Month 5 | First paying customers. $50/month Pro. Target: 50-100 users = $2,500-5,000/month |
| Phase 2 ships | Month 9 | Connection design adds upsell. Education platform. API. Target: 200-500 users = $10,000-25,000/month |
| Phase 3 ships | Month 15 | Second code doubles TAM. Timber captures residential market. Target: 500-1,000 users = $25,000-50,000/month |
| Phase 4 ships | Month 22 | Full platform. Competes with ETABS/SAP2000 head-on. Target: 1,000-5,000 users |
| Phase 5 ships | Month 30 | Global coverage. India and China markets open. Target: 5,000-20,000 users |

### The bottleneck: human review

AI generates code fast. The bottleneck is the human review process — expert structural engineers verifying every design code formula, coefficient, and edge case, and expert software engineers reviewing architecture and correctness. This is the right bottleneck. For engineering software, the review is where the value is.

Design codes update every 3-6 years (ACI 318: 2019, AISC 360: 2022, Eurocode: rewriting 2025-2028). This is permanent maintenance — but AI makes updating faster too, since it can diff old and new code provisions and generate the changes for human review.

### Difficulty map

Every feature rated by implementation difficulty. Easy = well-defined formulas or standard SaaS work. Medium = substantial but straightforward engineering. Hard = novel algorithms, numerical stability concerns, or distributed systems complexity. Very Hard = long-term business challenges that compound over time.

| Feature | Phase | Dev-months | Difficulty | Why |
|---|---|---|---|---|
| Unit system toggle | 1 | 0.5 | Easy | UI conversion layer, no algorithm work |
| Offline PWA | 1 | 0.5 | Easy | Service Worker + IndexedDB, solver already client-side |
| Quantity takeoff | 1 | 0.5 | Easy | Arithmetic on data already in the model |
| Thermal loads | 4 | 0.5 | Easy | Equivalent forces from αΔT, feeds existing solver |
| Floor vibration | 4 | 0.5 | Easy | Modal analysis exists, add damping + acceptance criteria |
| Calculation reports | 1 | 0.5-1 | Easy | Template engine + LaTeX/PDF generation |
| Fatigue analysis | 4 | 0.5-1 | Easy | S-N lookup + Miner's rule, well-defined algorithm |
| Scaffolding / temp works | 4 | 0.5-1 | Easy | Simple member checks with standard load tables |
| REST API | 2 | 0.5-1 | Easy | HTTP wrapper around existing solver |
| Progressive collapse | 4 | 0.5-1 | Easy | Automated column removal + reanalysis (needs nonlinear solver) |
| AI assistant (Phase 1) | 1 | 1 | Easy | LLM API calls for load gen, result review, report narration |
| AI assistant (Phase 2) | 2 | 1 | Medium | NLP → model mutations requires parsing; auto-sizing is iterative |
| 3D solver parity | 1 | 1-1.5 | Medium | 2D algorithms exist, extend to 12x12 matrices |
| Load determination (per code) | 1 | 1-1.5 | Medium | Many tables/coefficients but straightforward formulas |
| Education platform | 2 | 1-1.5 | Medium | Auto-grading logic, LMS integration (LTI protocol) |
| Timber design (per code) | 3 | 1-1.5 | Medium | Adjustment factors are tedious but well-documented |
| Cold-formed steel (per code) | 4 | 1-1.5 | Medium | Effective width + DSM more complex than hot-rolled |
| Fire design | 4 | 1-1.5 | Medium | Temperature-dependent properties, ISO 834 curves |
| Additional connections (10→20) | 3 | 1-1.5 | Medium | Pattern established from first 10, incremental |
| Project mgmt + version control | 2 | 1-1.5 | Medium | CRUD + diffing + storage, no algorithms |
| Soil-structure interaction | 4 | 1-1.5 | Medium | Impedance functions are formulas; p-y curves well-published |
| Revit/Tekla live link | 2 | 1-1.5 | Medium | Revit API well-documented but plugin dev has friction |
| Foundation design | 2 | 0.5-1 | Medium | Bearing capacity + footing design, standard formulas |
| Masonry (per code) | 4 | 0.5-1 | Medium | Limited scope, well-defined checks |
| Composite steel-concrete (per code) | 4 | 0.5-1 | Medium | Composite section properties + shear stud calc |
| Steel member design (per code) | 1 | 1.5-2 | Medium | Many chapters, each is formula + table lookup |
| Concrete member design (per code) | 1 | 1.5-2 | Medium | Reinforcement layout, crack width, P-M diagrams |
| Steel connections (first 10) | 2 | 1.5-2 | Medium | Each type is self-contained, many failure modes |
| Rust/WASM solver | 2 | 1.5-2 | Medium | Rust solver exists, needs WASM compilation + sparse solvers |
| Enterprise features | 2 | 1.5-2 | Medium | SSO/SAML, admin UI — standard SaaS infrastructure |
| Bridge design | 4 | 1.5-2 | Medium | AASHTO well-documented, distribution factors are formulaic |
| Seismic retrofit | 4 | 1.5-2 | Medium | FRP/jacketing formula-based; base isolation needs nonlinear solver |
| Detailing (partial) | 4 | 1.5-2 | Medium | Rebar schedules are data transform; connection sheets need 2D drawing |
| Incumbent importers (per format) | 2 | 0.5-1 | Medium | Text parsing, must handle every edge case in the format |
| Second design code | 3 | 3-4 | Medium | Pattern exists from first code, still substantial formula work |
| Geotechnical (slope + deep fdn) | 4 | 2-3 | Medium | Method of slices is iterative; pile design has many soil models |
| Global code expansion (per pair) | 5 | 1-2 | Medium | Formula translation, each code has unique provisions |
| Real-time collaboration (CRDTs) | 2 | 1.5-2 | Hard | CRDT + Svelte reactivity integration, referential integrity, presence |
| Prestressed concrete (per code) | 3 | 1.5-2 | Hard | Staged analysis, loss calculations, hyperstatic effects |
| Nonlinear time history | 4 | 1.5-2 | Hard | Direct integration, numerical stability, ground motion selection |
| Nonlinear materials (fiber) | 4 | 1-1.5 | Hard | Fiber discretization, constitutive models, Newton-Raphson convergence |
| Cable/tension structures | 4 | 1 | Hard | Large-displacement geometric nonlinearity, form-finding |
| Staged construction | 4 | 1-1.5 | Hard | Creep/shrinkage/relaxation across stages, changing geometry |
| Performance-based design | 4 | 1.5-2 | Hard | Fragility functions, loss estimation, requires nonlinear TH |
| Plates and shells | 1 | 2-3 | Hard | New element formulations (DKT+CST), mesh generation |
| Solid (3D continuum) elements | 4 | 3-4 | Hard | 3D meshing, mixed-dimensional coupling, volumetric stress |
| CBFEM arbitrary connections | 5 | 4-6 | Very Hard | Connection geometry modeler, auto-meshing, contact mechanics |

**Summary:**

| Difficulty | Features | Dev-months | Notes |
|---|---|---|---|
| Easy | 11 | ~7-10 | Formula translation, standard web engineering, LLM wrappers |
| Medium | 24 | ~30-45 | Bulk of the roadmap — substantial but predictable work |
| Hard | 9 | ~15-21 | Numerical methods, distributed systems, convergence, 3D meshing |
| Very Hard | 1 | ~4-6 | CBFEM geometry modeler — the core IP that kills IDEA StatiCa |

All Easy and Medium items are in Phases 1-3 (the first sellable product through second market). Most Hard items cluster in Phase 4 — by then, revenue funds the team and the hardest problems can be tackled with experienced hires. The exception is plates/shells, which is Hard but pulled into Phase 1 because slab and wall analysis is essential for a complete design tool.

**The hardest things are not technical — they are business:**

| Challenge | Difficulty | Why |
|---|---|---|
| Getting engineers to trust new software | Very Hard | Engineers are personally liable. Takes years of published benchmarks, marquee clients, and conference presence |
| Maintaining 8+ design codes long-term | Very Hard | Codes update every 3-6 years. Each update requires re-implementation and re-validation. Permanent cost |
| Enterprise sales cycles | Hard | Large firms take 6-12 months to evaluate. Need revenue before they commit |
| Competing on trust with 30-year incumbents | Hard | CSI/Dlubal have decades of verification history. We start from zero |
| Design code edge cases (last 10%) | Hard | Each code chapter has dozens of sub-cases. The last 10% takes as long as the first 90% |

### What we don't build

**Construction drawings (Revit/Tekla territory):** generating plans, sections, and shop drawings requires a full CAD/BIM engine with drafting tools, dimensioning, annotation, sheet management, and print layout. This is a separate product category worth billions of dollars and decades of development. We integrate with these tools via IFC round-trip and live link plugins — we do not replace them. The boundary is clear: Dedaliano does engineering calculations, Revit/Tekla does construction documents.

With solid elements and CBFEM connections, Dedaliano covers ~90% of what a structural engineer does. The remaining ~10% is BIM modeling and drafting, which we connect to rather than replace. No single tool covers 100% — but owning the engineering calculation pipeline from loads to report is where the intellectual value and the revenue are.
