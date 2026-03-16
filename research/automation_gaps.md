# Automation Gap Analysis — From Analysis Tool to Design Platform

Read next:
- product roadmap: [PRODUCT_ROADMAP.md](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md)
- solver roadmap: [SOLVER_ROADMAP.md](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)
- competitor context: [research/competitive_displacement_by_step.md](/Users/unbalancedparen/projects/dedaliano/research/competitive_displacement_by_step.md)
- post-roadmap stack: [research/post_roadmap_software_stack.md](/Users/unbalancedparen/projects/dedaliano/research/post_roadmap_software_stack.md)

This document maps the full automation landscape for Stabileo/Dedaliano: what is already automated, what engineers still do by hand, where competitors sit, and which gaps have the highest ROI to close first.

The frame is deliberately product-level, not solver-level. The solver is strong. The question is how much of the work that follows a successful solve is still handed back to the engineer.

---

## What Is Already Automated

The following happen without any manual intervention once a model is built:

- **Live solve on edit** — change a node position, member property, load, or support and results update instantly in the browser
- **Diagram generation** — M/V/N internal force diagrams are recomputed after every solve for all elements
- **Deformed shape** — Hermite cubic interpolation at 21 points per element for smooth deformed shape rendering
- **Load combinations and envelopes** — all combinations solved automatically after a single model solve; envelope results (max/min per diagram point) computed across all combos
- **Stress heatmaps** — von Mises, bending, shear, and shell stress ratios displayed as continuous field maps
- **Modal analysis** — one-click full eigensolver pipeline; natural frequencies, mode shapes, mass participation computed automatically
- **Buckling analysis** — one-click geometric stiffness assembly and eigensolver for critical load factors
- **Harmonic response** — one-click modal superposition sweep across frequency range
- **Sparse eigensolver selection** — automatic path selection between sparse and dense eigensolver based on model size and constraint topology
- **Element family defaults** — automatic MITC4/MITC9/curved-shell path based on registered element type

This is a strong foundation. Most commercial structural tools in 2010 could not do real-time re-analysis in a browser; Stabileo does it today.

---

## What Engineers Still Do Manually

### High Impact — Automate Soon

These items directly block project delivery. They represent 60-70% of engineer time on a typical building project after analysis is complete.

| Manual step | What it should become | Roadmap home |
|---|---|---|
| Define load combinations and factors | Auto-generate from selected code family (EC0, ASCE 7, CIRSOC, NTC 2018) with correct combination factors and partial safety factors | Solver Step 14 + Product Step 2 |
| Compute wind / seismic / snow loads | Enter building and site parameters → auto-generate pressures, forces, accidental torsion, and pattern loading per code | Solver Step 14 + Product Step 2 |
| Check if members pass code | Auto utilization ratios, governing check, and pass/fail per member per selected code | Product Step 2 |
| Select section sizes | Auto-suggest viable and optimal sections given demand, code, cost, and constructability signals | Product Step 2 |
| Design RC reinforcement | Required steel → selected bars → curtailment → stirrups → cutting lists → BBS output | Product Steps 1–2 |
| Generate calculation reports | One-click PDF with diagrams, checks, governing combinations, and code-check summaries | Product Step 2 |
| Interpret mode shapes | Auto-flag soft story, torsional irregularity, mass participation sufficiency, and dominant mode drivers | Product Step 3 |

### Medium Impact — Automate Later

These items reduce friction but do not block the core project delivery workflow.

| Manual step | What it should become | Roadmap home |
|---|---|---|
| Choose shell element family | Auto-select MITC4 vs MITC9 vs curved shell vs SHB8-ANS based on geometry curvature, aspect ratio, and workflow | Solver Step 7 + Product Step 1 |
| Choose analysis type | Auto-suggest nonlinear, P-Delta, modal, pushover, or time-history based on model geometry and requested checks | Product Steps 1 and 3 |
| Assess pre-solve stability | Detect mechanisms, disconnected nodes, bad constraints, poor shell geometry, and suspicious modeling before solve | Solver Step 3 |
| Run pushover analysis | One-click capacity spectrum, performance point, and plastic hinge sequence with visual output | Solver Step 10 + Product Step 3 |
| Run IDA | Auto record selection and scaling, batch NLRHA, fragility curves, and performance-based assessment | Solver Step 17 + Product Step 3 |
| Export to BIM | IFC round-trip with analysis and design results embedded or linked | Product Step 4 |

---

## What Is Not Automated Anywhere — First-Mover Opportunities

The following do not exist as standard features in any current commercial structural tool. Shipping them would be category-defining rather than catch-up work.

1. **AI-assisted model review** — structured diagnostic codes and natural language explanations: "beam 7 has no lateral restraint and will buckle under the specified load case," "this diaphragm constraint likely over-stiffens the floor," "shell 14 has a near-degenerate Jacobian." The solver already emits structured diagnostics; the missing layer is a review surface that surfaces them as actionable guidance.

2. **Natural language result queries** — "what is the maximum moment in the roof beams?" returns the governing combination, element ID, and location along the member. "Which column has the highest utilization?" returns a ranked list. The solver output is already structured enough to support this; it needs an LLM interface layer and a typed query API.

3. **Global section optimization** — not per-member sizing but whole-structure optimization that respects fabrication rhythm, procurement economy (minimize distinct section sizes), and connection feasibility. No commercial tool does this at the structure level rather than member-by-member.

4. **Real-time design code comparison** — show EC2 vs ACI 318 vs CIRSOC 201 interpretation side-by-side for the same member or structure. Useful in international practice and academic settings. No competitor exposes this.

5. **Generative structural layout** — given architectural geometry and loading constraints, generate and rank structural systems (moment frame, braced frame, shear wall, combined) before the engineer commits to a topology. This shifts structural engineering from checking to selecting.

---

## The Gap That Matters Most

The most important single gap is **turning solver output into code-compliant design decisions automatically** — what the product roadmap calls the "automation gap."

Today Stabileo computes forces, reactions, modes, and envelopes correctly and quickly. The engineer still has to:

1. manually assemble load combinations from scratch
2. extract demand from diagrams
3. check each member against a code by hand or spreadsheet
4. iterate section sizes by trial and error
5. design reinforcement layout manually
6. write a report by hand

That is 60–70% of project time. It happens after the solver has already done the physics correctly. SAP2000, ETABS, and RFEM partially automate this already. Stabileo does not yet.

Closing this gap is the difference between "impressive analysis tool" and "software an engineer can deliver a project with."

Product Steps 1–2 target this directly. The sequencing in `PRODUCT_ROADMAP.md` reflects this: code checks and RC design come before dynamic analysis, BIM, and collaboration because they unlock daily project delivery.

---

## Automation Maturity Ladder

| Level | Label | What it includes | Current status |
|---|---|---|---|
| 1 | Automated analysis | Live solve, diagrams, combinations, heatmaps, modal/buckling/harmonic | Done |
| 2 | Automated pre-processing | Model validation, smart defaults, auto meshing, pre-solve stability checks, shell family selection | Partial (diagnostics present; meshing and element defaults in progress) |
| 3 | Automated design | Code load generation, member code checks, section optimization, RC reinforcement | Not yet — highest priority gap |
| 4 | Automated interpretation | Seismic classification, performance assessment, irregularity detection, modal result explanation | Not yet — Product Step 3 |
| 5 | Automated workflow | Report generation, BIM integration, IFC round-trip, calculation document output | Not yet — Product Steps 2 and 4 |
| 6 | AI-augmented engineering | Model review, natural language queries, global optimization, generative design | Not yet — frontier, Product Steps 2–5 and 8 |

The current product is solidly at Level 1 and partly into Level 2. The jump from Level 2 to Level 3 is the commercial unlock.

---

## Implementation Priority Matrix

Scored 1–5 on each axis; total drives rank.

| Automation item | Engineer time saved | Implementation complexity | Competitive differentiation | Revenue potential | Priority score |
|---|---|---|---|---|---|
| Code load combination generation | 5 | 3 | 3 | 5 | 16 |
| Member code checks (utilization ratios) | 5 | 3 | 3 | 5 | 16 |
| RC reinforcement design | 5 | 4 | 4 | 5 | 18 |
| Report generation | 4 | 3 | 3 | 5 | 15 |
| Automatic wind/seismic/snow loads | 4 | 4 | 3 | 4 | 15 |
| Section optimization | 3 | 4 | 4 | 4 | 15 |
| AI model review | 3 | 5 | 5 | 4 | 17 |
| Natural language result queries | 2 | 4 | 5 | 4 | 15 |
| Pre-solve stability assessment | 3 | 2 | 4 | 3 | 12 |
| Shell family auto-selection | 2 | 2 | 4 | 2 | 10 |
| Pushover workflow | 3 | 3 | 3 | 3 | 12 |
| Dynamic result interpretation | 3 | 3 | 4 | 3 | 13 |
| IDA workflow | 2 | 5 | 4 | 3 | 14 |
| BIM round-trip | 2 | 5 | 3 | 4 | 14 |
| Global section optimization | 3 | 5 | 5 | 4 | 17 |
| Generative structural layout | 2 | 5 | 5 | 4 | 16 |

Top-ranked items by total: RC reinforcement design (18), AI model review (17), global section optimization (17), code load combinations (16), member code checks (16), generative layout (16). The first three should be the primary product investments after the solver foundation is stable.

---

## Competitors' Automation Coverage

### What Each Competitor Automates

| Competitor | Load combinations | Wind/seismic/snow loads | Code checks | Section optimization | RC reinforcement | Report generation | Seismic interpretation | BIM / IFC |
|---|---|---|---|---|---|---|---|---|
| SAP2000 / ETABS | Yes (manual combos + auto EC/ASCE) | Partial (ASCE 7 ELF, EC8 spectrum) | Yes (AISC, ACI, EC2, EC3 — partial) | Basic (AISC only) | No | Yes (limited) | No | Partial |
| RFEM / RSTAB | Yes (strong EC0 + DIN) | Yes (EC1 wind/snow) | Yes (EC2, EC3, EC5 — strong) | Basic | Partial (EC2 member only) | Yes (good) | No | Yes |
| STAAD.Pro | Yes | Yes (ASCE 7, IS 875) | Yes (AISC, ACI, IS codes) | Basic | No | Partial | No | Partial |
| Robot (Autodesk) | Yes | Partial | Yes (EC2, EC3, ACI) | Basic | Basic | Yes (via reports) | No | Yes (Revit) |
| CYPECAD | Yes | Yes (CTE, NCSE — Spain/LatAm) | Yes (EC2, EHE, ACI) | No | Yes — strong (bar selection, BBS) | Yes | No | Partial |
| Tekla Structural Designer | Yes | Yes (EC1, ASCE 7) | Yes (EC2/3, AISC — steel focus) | Yes (steel — good) | Partial | Yes (good) | No | Yes (Tekla) |
| SAFE | Yes | No (slab-only tool) | Yes (ACI, EC2 slab) | No | Yes (punching, slab strips) | Yes | No | Partial |
| midas Gen | Yes | Yes (KBC, EC8, ASCE 7) | Yes (AISC, EC3, KBC) | No | No | Yes | Partial (Korean seismic) | Partial |
| **Stabileo (today)** | Partial (manual + envelope) | No | No | No | No | No | No | No |

### Where Stabileo Can Leapfrog

Most competitors automate code checks and reports reasonably well. What they do poorly:

1. **Global section optimization** — all competitors size members individually; none optimize the whole structure considering fabrication and procurement economy.
2. **AI model review with structured diagnostics** — none expose structured diagnostic codes with actionable guidance; they either surface nothing or surface raw warnings without context.
3. **Natural language result queries** — none support conversational result exploration. Engineers still read tables and diagrams.
4. **Real-time code comparison** — no competitor shows EC2 vs ACI side-by-side on the same structure. Useful in international practice.
5. **Generative layout** — no competitor generates structural systems from architectural constraints; they all check one user-authored scheme.
6. **Transparent solver** — no competitor exposes enough of the solver internals for engineers to trace a result from input to output. Stabileo can build a verification story no commercial tool can match.

The CYPECAD angle is worth noting separately: CYPECAD has strong RC reinforcement automation (bar selection, BBS, local code depth for Spain, Portugal, and Latin America) that no other competitor has matched for those markets. See `research/cypecad_competitive_gap_and_parity_plan.md` for the full audit. Stabileo can close this gap at the engine level because the beam station extraction for RC design is already implemented — the missing pieces are the bar selection logic, schedule formatting, and local code databases, not solver mechanics.

---

## Recommended Action Order

Derived from the priority matrix and the product roadmap sequence:

1. **RC reinforcement design** — highest combined score; engine already has beam station extraction; missing only bar selection, stirrup design, and schedule output. Closes the CYPECAD Latin America gap.
2. **Member code checks** — utilization ratios and pass/fail summaries for EC3/AISC (steel) and EC2/ACI (RC). Unlocks daily project delivery for the majority of structural engineers.
3. **Code load combination generation** — auto-generate from EC0, ASCE 7, CIRSOC. Removes the most common manual setup step before any analysis can be trusted for design.
4. **Report generation** — once checks and combinations are automated, reports become straightforward to generate. Unlocks submission-grade deliverables.
5. **AI model review** — builds on existing structured diagnostics; high differentiation; can ship incrementally starting with explanation surfaces on existing warnings.
6. **Wind/seismic/snow auto-generation** — completes the "zero-manual setup" promise for load definition; needed for Steps 14 in the solver roadmap.
7. **Natural language result queries** — requires the code check layer to be mature so queries can reference utilization, governing cases, and design parameters, not only raw forces.
8. **Global section optimization** — genuinely hard; save for after code checks and section suggestion are solid; extremely high differentiation when it lands.

---

## Related Documents

- `PRODUCT_ROADMAP.md` — product sequencing and step definitions
- `SOLVER_ROADMAP.md` — solver mechanics roadmap, Steps 1–23
- `research/rc_design_and_bbs.md` — RC design and BBS research
- `research/cypecad_competitive_gap_and_parity_plan.md` — unified CYPECAD competitive gap analysis and phased parity plan
- `research/competitive_displacement_by_step.md` — which competitors each step displaces and estimated savings
- `research/post_roadmap_software_stack.md` — software products to build on top of the solver moat
- `research/ai_structural_engineering_roadmap.md` — AI feature roadmap and what needs deep solver depth vs what can ship early
- `research/beyond_roadmap_opportunities.md` — frontier opportunities beyond the core roadmap
