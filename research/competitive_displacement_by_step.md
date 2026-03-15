# Competitive Displacement by Roadmap Step

## Purpose

This document maps each solver roadmap step to the commercial and open-source tools it displaces, the license cost savings for engineering firms, and what specifically enables the switch. The goal is to help users understand when Stabileo becomes a viable replacement for their current toolchain.

Pricing is based on publicly available information as of early 2025. Actual costs vary by region, reseller, edition, and negotiation.

## Competitor Pricing Reference

| Software | Vendor | Annual cost per seat | Notes |
|----------|--------|---------------------|-------|
| Karamba3D Pro | Karamba3D | ~$1,200 | Grasshopper/Rhino plugin for parametric structural |
| CalculiX | Open source | Free | GPL, no commercial support |
| OpenSees | UC Berkeley | Free | BSD license, research-focused |
| RFEM 6 | Dlubal | ~$3,000 | Base subscription; add-on modules extra |
| SCIA Engineer | Nemetschek | ~$3,000-$5,000 | Popular in Europe, BIM integration |
| SAP2000 | CSI | ~$5,000-$15,600 initial + $350-$2,730/yr maintenance | Standard to Ultimate editions |
| ETABS | CSI | ~$5,000-$15,600 initial + $875-$2,730/yr maintenance | Standard to Ultimate editions |
| SAFE | CSI | ~$3,000-$5,000 initial + maintenance | Slab and foundation design |
| Robot Structural Analysis | Autodesk | ~$3,675 | Only available inside AEC Collection |
| Tekla Structural Designer | Trimble | ~$3,000-$5,000 | BIM-integrated structural analysis |
| STAAD.Pro | Bentley | ~$3,200-$4,400 | Virtuosity subscription |
| RISA-3D / RISAFloor | RISA Tech | ~$2,000-$4,000 | Popular in the US for steel/wood/concrete |
| midas Gen | MIDAS IT | ~$5,000-$10,000 | #2 commercial structural tool globally, strong in Asia |
| midas Civil | MIDAS IT | ~$8,000-$15,000 | Bridge-focused, staged construction, creep/shrinkage |
| CYPECAD | CYPE | ~$1,500-$3,000 | Dominant in Spain, Portugal, Latin America for RC |
| Sofistik | Sofistik AG | ~$5,000-$10,000 | German, bridges and precast concrete |
| LUSAS | LUSAS Ltd | ~$5,000-$10,000 | UK-based, bridges/nuclear/marine |
| Strand7 | Strand7 | ~$3,000-$5,000 | Australian general structural FEA |
| Prokon | Prokon Software | ~$2,000-$4,000 | Popular in South Africa, Australia |
| DIANA FEA | DIANA FEA BV | ~$10,000-$15,000 | Specialized in concrete nonlinear, geotech, masonry |
| IDEA StatiCa | IDEA StatiCa | ~$2,000-$3,000 | Steel and concrete connection design |
| StructurePoint (spColumn/spBeam/spSlab) | StructurePoint | ~$1,000-$2,000 each | Section and member design tools |
| Abaqus | Dassault Systemes | ~$18,000-$19,000/yr lease | Perpetual ~$31,000-$37,000 + ~$8,500/yr maintenance |
| OptiStruct / Tosca | Altair / Dassault | ~$15,000-$30,000+/yr (est.) | Enterprise pricing, not public |

Sources: CSI reseller sites, Dlubal webshop, Autodesk AEC Collection pricing, Bentley Virtuosity, Fidelis FEA cost guides, Altair units documentation, MIDAS reseller pricing, CYPE webshop, Trimble/Tekla pricing pages, RISA pricing pages, forum reports.

## Displacement Timeline

### Step 3 — Structured Diagnostics

**Displaces:** Karamba3D

**Why:** Karamba3D has no solver diagnostics, no reproducibility, and no structured warnings. Stabileo becomes the only browser-native structural tool with real solver trust signals, design code checks, and a validated multi-family shell stack. Students and parametric designers who outgrow Karamba's simplified analysis have a direct upgrade path.

**Savings per seat:** ~$1,200/yr
**5-seat firm:** ~$6,000/yr

---

### Steps 4-5 — Runtime Dominance + Verification Moat

**Displaces:** CalculiX (for structural work), Strand7

**Why:** CalculiX has no browser path, no design codes, a weaker shell stack, and no verification transparency. Stabileo is faster on structural-size models with better shells and visible proof of correctness. Engineers who use CalculiX because "it's free and it works" get a better free option. Strand7 is a solid general structural FEA tool but has no browser path, limited shell families, and costs $3,000-$5,000/yr — Stabileo now matches its structural capabilities with better shells and zero cost.

**Savings per seat:** $0 (CalculiX) / ~$3,000-$5,000 (Strand7)
**5-seat firm:** ~$15,000-$25,000/yr (Strand7)

---

### Steps 6-7 — Nonlinear Hardening + Shell Maturity

**Displaces:** RFEM / Dlubal (basic workflows), SCIA Engineer (basic workflows), RISA-3D (basic workflows), Prokon (basic workflows), CYPECAD (partial), StructurePoint (partial)

**Why:** For firms doing linear and second-order steel/concrete frames with shell floors, Stabileo now covers the common 80% of daily work: better shells, design codes (AISC, ACI, EC2, EC3, CIRSOC), structured diagnostics, zero cost, browser access. RFEM and SCIA retain advantages on reports, auto load generation, and Wood-Armer moments — but those are addressed in later steps. RISA-3D and Prokon users doing standard steel/concrete/wood frames have a complete free alternative. CYPECAD users doing basic RC frame design can switch for the analysis portion — CYPECAD retains detailing and local code depth. StructurePoint's spColumn/spBeam/spSlab users get equivalent section and member design through Stabileo's built-in design code checks.

**Savings per seat:** ~$2,000-$5,000/yr (varies by tool)
**5-seat firm switching from RFEM:** ~$15,000/yr
**5-seat firm switching from SCIA:** ~$15,000-$25,000/yr
**5-seat firm switching from RISA:** ~$10,000-$20,000/yr
**5-seat firm switching from Prokon:** ~$10,000-$20,000/yr

---

### Step 8 — Dynamic Analysis

**Displaces:** OpenSees (education and common linear/mildly-nonlinear time-history), midas Gen (partial)

**Why:** For the common 60% of earthquake engineering education and practice (linear and mildly-nonlinear time-history on frame structures), Stabileo now works — with a visual interface, in a browser. University courses switch. New earthquake engineers learn Stabileo first. OpenSees retains deep nonlinear, force-based beams, and 30 years of material models. midas Gen users doing basic dynamic analysis on building frames have a free alternative — midas retains bridge workflows, staged construction depth, and Asian code support.

**Savings per seat:** $0 (OpenSees) / ~$5,000-$10,000 (midas Gen)
**5-seat firm switching from midas Gen:** ~$25,000-$50,000/yr
**Value vs OpenSees:** visual interface, zero-install, real-time feedback — replaces weeks of Tcl/Python scripting setup

---

### Step 9 — Nonlinear Materials

**Displaces:** OpenSees (80% of seismic practice), DIANA FEA (partial — concrete nonlinear), CYPECAD (RC design workflows)

**Why:** RC columns with confined concrete (Mander), steel frames with Bauschinger effect (Menegotto-Pinto), fiber sections with biaxial bending. The common earthquake engineering workflows now run in-browser with visual feedback. OpenSees retains researchers doing exotic materials and massive parametric studies. DIANA FEA's core strength is concrete nonlinear analysis (CDP, smeared crack, Mander) — Stabileo now covers the common concrete material models at zero cost. DIANA retains geotechnical specialization (Cam-Clay, interface elements) and its deep masonry constitutive library. CYPECAD users in Latin America and Southern Europe doing RC frame design with nonlinear checks can now get analysis + materials + design codes in one free browser tool.

**Savings per seat:** $0 (OpenSees) / ~$10,000-$15,000 (DIANA) / ~$1,500-$3,000 (CYPECAD)
**5-seat firm switching from DIANA:** ~$50,000-$75,000/yr
**5-seat firm switching from CYPECAD:** ~$7,500-$15,000/yr
**Value vs OpenSees:** eliminates the scripting expertise barrier that limits OpenSees adoption

---

### Step 10 — Pushover Analysis

**Displaces:** SAP2000 / ETABS (seismic assessment), midas Gen (seismic assessment)

**Why:** Pushover (capacity spectrum, N2, MPA) is the bread-and-butter of seismic evaluation firms. SAP2000/ETABS do it, but cost $5,000-$15,000/yr per seat and run on Windows. midas Gen does it at $5,000-$10,000/yr. Stabileo does it free, in-browser, with transparent solver math. Seismic assessment firms — especially in Latin America, Southeast Asia, and Southern Europe where license costs are a significant burden — can switch.

**Savings per seat:** ~$5,000-$15,000/yr (CSI) / ~$5,000-$10,000/yr (midas)
**5-seat firm switching from ETABS:** ~$25,000-$75,000/yr
**5-seat firm switching from midas Gen:** ~$25,000-$50,000/yr

---

### Step 11 — Advanced Element Library

**Displaces:** OpenSees (completely for structural engineering), Robot (partial), IDEA StatiCa (partial — connection behavior), Tekla Structural Designer (partial)

**Why:** The force-based beam-column element was OpenSees' last unique advantage for nonlinear frame analysis. With seismic isolators, BRBs, panel zones, and shell triangles (MITC3), performance-based design is fully covered. OpenSees survives only as a research scripting platform. Robot's advantage was Autodesk integration and meshing flexibility — the meshing gap (quad-only) is now closed with triangles. Panel zone elements and connection behavior modeling partially overlap with IDEA StatiCa's connection design — IDEA retains its specialized CBFEM approach and code-check workflow, but Stabileo now covers the structural analysis side of connection behavior. Tekla Structural Designer users doing standard frame analysis with BIM export can consider switching — Tekla retains its Tekla Structures integration advantage.

**Savings per seat:** ~$3,675/yr (Robot) / ~$2,000-$3,000/yr (IDEA StatiCa) / ~$3,000-$5,000/yr (Tekla SD)
**5-seat firm switching from Robot:** ~$18,375/yr
**5-seat firm switching from Tekla SD:** ~$15,000-$25,000/yr

---

### Step 12 — Native / Server Execution

**Displaces:** Robot Structural Analysis (completely), Tekla Structural Designer (completely)

**Why:** Engineering firms need batch processing and local execution for large projects. With native desktop (Tauri) + browser + identical solver, Stabileo replaces Robot's and Tekla SD's desktop workflows while keeping the browser advantage. The native path also enables firm-scale batch runs that browser-only tools can't handle.

**Savings per seat:** ~$3,675/yr (Robot) / ~$3,000-$5,000/yr (Tekla SD)
**5-seat firm:** ~$18,375/yr (Robot) / ~$15,000-$25,000/yr (Tekla SD)

---

### Steps 13-14 — Thermal/Fire/Fatigue + Auto Load Generation

**Displaces:** RFEM / Dlubal (completely), SCIA Engineer (completely), STAAD.Pro, Sofistik (partial), midas Civil (partial), LUSAS (partial)

**Why:** The last RFEM and SCIA advantages were auto load generation and specialized analysis (fire, fatigue). With automatic wind/seismic/snow load generation and fire/fatigue analysis, the full RFEM and SCIA workflow is covered. STAAD.Pro's remaining value was code-based load generation and broad code support — now matched. Sofistik users doing standard bridge thermal and staged analysis have an alternative — Sofistik retains its deep precast and parametric bridge workflow. midas Civil users doing basic bridge thermal analysis can consider switching — midas retains its bridge-specific staged construction depth and Asian code libraries. LUSAS users on standard bridge and nuclear thermal work have an alternative — LUSAS retains marine/offshore specialization.

**Savings per seat:** ~$3,000-$10,000/yr (varies by tool)
**5-seat firm switching from RFEM:** ~$15,000/yr
**5-seat firm switching from SCIA:** ~$15,000-$25,000/yr
**5-seat firm switching from STAAD.Pro:** ~$16,000-$22,000/yr
**5-seat firm switching from Sofistik:** ~$25,000-$50,000/yr (partial)

---

### Step 15 — Performance at Scale

**Displaces:** Abaqus (structural problems)

**Why:** Large shell/solid structural models (bridges, dams, offshore structures) that previously required Abaqus for scale now run in Stabileo with iterative solvers (AMG), multi-frontal solver, and WebGPU acceleration. Abaqus retains contact-heavy manufacturing workflows and multiphysics. Pure structural firms using Abaqus because "nothing else scales" can switch.

**Savings per seat:** ~$18,000-$19,000/yr
**5-seat firm:** ~$90,000-$95,000/yr

---

### Steps 18-19 — Contact Depth + Design Post-Processing

**Displaces:** Abaqus (structural contact), SAFE (slab design), RFEM (slab design), DIANA FEA (completely), IDEA StatiCa (more overlap)

**Why:** Mortar contact + shell-to-solid coupling + embedded rebar covers structural contact use cases (connections, composite sections, RC detailing). Wood-Armer moments + punching shear + crack width estimation completes RC slab design from shell models — this is exactly what SAFE does, at $3,000-$5,000/yr per seat. Stress linearization per ASME/EN 13445 opens pressure vessel assessment. DIANA FEA is now fully displaced: Stabileo has concrete nonlinear materials (Step 9), contact (Step 18), and design post-processing (Step 19) — the three pillars of DIANA's market. DIANA retains only niche masonry and deep geotechnical specialization.

**Savings per seat:** ~$3,000-$5,000/yr (SAFE) / ~$10,000-$15,000/yr (DIANA)
**5-seat firm switching from SAFE:** ~$15,000-$25,000/yr
**5-seat firm switching from DIANA:** ~$50,000-$75,000/yr
**New markets opened:** pressure vessel assessment, RC slab design from shell analysis

---

## Cumulative Savings (5-seat firm using multiple tools)

The table below shows a firm that happens to use several of these tools. Most firms use 2-4 tools, not all of them.

| After step | Tools replaced | Cumulative savings/yr |
|------------|---------------|----------------------|
| 3 | Karamba3D | ~$6,000 |
| 5 | + Strand7 | ~$21,000-$31,000 |
| 7 | + RFEM or SCIA + RISA + Prokon + CYPECAD (partial) + StructurePoint | ~$51,000-$96,000 |
| 8 | + midas Gen (partial) | ~$76,000-$146,000 |
| 10 | + SAP2000 or ETABS + midas Gen (complete) | ~$101,000-$221,000 |
| 11 | + Robot + Tekla SD (partial) + IDEA StatiCa (partial) | ~$134,000-$290,000 |
| 12 | + Robot (complete) + Tekla SD (complete) | ~$152,000-$315,000 |
| 14 | + STAAD.Pro + Sofistik (partial) + SCIA (complete) | ~$193,000-$387,000 |
| 15 | + Abaqus | ~$283,000-$482,000 |
| 19 | + SAFE + DIANA + IDEA StatiCa (complete) | ~$358,000-$597,000 |

Note: these are theoretical maximums — a firm replacing every tool in every row. A typical firm might save $25,000-$100,000/yr by replacing 2-3 paid tools.

## Regional Impact

The license cost burden varies dramatically by region:

| Region | Typical tools | Cost pressure | Displacement timing |
|--------|---------------|---------------|-------------------|
| **Latin America** | CYPECAD, SAP2000, ETABS | Very high — licenses are priced in USD, salaries in local currency | Steps 7, 10 |
| **Southeast Asia** | ETABS, midas Gen, STAAD.Pro | Very high — same USD pricing problem | Steps 8, 10 |
| **Southern Europe** | RFEM, SCIA, CYPECAD, SAP2000 | High — Eurocode tools are expensive relative to firm sizes | Steps 7, 10 |
| **South Africa / Oceania** | Prokon, Strand7, SAP2000 | High — limited local alternatives | Steps 5, 7, 10 |
| **US / Northern Europe** | SAP2000, ETABS, RISA, Robot, Abaqus | Moderate — firms can afford licenses but unlimited seats still matters | Steps 10, 12, 15 |
| **Asia (Korea, Japan, China)** | midas Gen, midas Civil, ETABS | Moderate to high — midas is entrenched but expensive | Steps 8, 10, 14 |

## Additional Value Beyond License Savings

License cost is only part of the equation:

- **No IT overhead** — no license servers, no Windows-only machines, no annual renewal negotiations, no vendor lock-in
- **Instant onboarding** — new engineers open a browser tab instead of waiting for IT to provision a license
- **Unlimited seats** — open source means the 6th engineer doesn't cost another $5,000-$19,000
- **Transparent solver** — engineers can trace every computation, which matters for peer review and regulatory approval
- **Educational value** — the step-by-step DSM wizard has no equivalent in any tool at any price

## Full Competitor Displacement Map

| Competitor | First threatened | Fully displaced | Key step | What they retain longest |
|------------|-----------------|-----------------|----------|------------------------|
| Karamba3D | Step 3 | Step 3 | Diagnostics | Nothing — Stabileo is strictly better |
| CalculiX | Step 4 | Step 5 | Verification | Nothing for structural — retains thermal/multiphysics |
| Strand7 | Step 4 | Step 5 | Runtime + shells | Nothing for structural |
| RISA-3D | Step 6 | Step 7 | Nonlinear + shells | US market inertia, wood design depth |
| Prokon | Step 6 | Step 7 | Nonlinear + shells | Regional inertia (South Africa, Australia) |
| StructurePoint | Step 6 | Step 7 | Design codes | Nothing — section design is covered |
| CYPECAD | Step 6 | Step 9 | Materials + RC | Deep local code detailing (Spanish/Portuguese RC practice) |
| RFEM / Dlubal | Step 6 | Step 14 | Auto loads | Reports (until product roadmap catches up) |
| SCIA Engineer | Step 6 | Step 14 | Auto loads | BIM integration (Nemetschek ecosystem) |
| OpenSees | Step 8 | Step 11 | Force-based beam | Research scripting platform for exotic formulations |
| midas Gen | Step 8 | Step 10 | Pushover | Asian code libraries, entrenched market position |
| DIANA FEA | Step 9 | Step 19 | Contact + post-proc | Deep geotechnical (Cam-Clay), masonry constitutive |
| SAP2000 / ETABS | Step 10 | Step 10 | Pushover | Enterprise support contracts, regulatory inertia |
| midas Civil | Step 13 | Step 14 | Staged + loads | Bridge-specific workflows, Asian bridge codes |
| Robot | Step 11 | Step 12 | Native execution | Autodesk BIM ecosystem lock-in |
| Tekla SD | Step 11 | Step 12 | Native execution | Tekla Structures integration |
| IDEA StatiCa | Step 11 | Step 19 | Post-processing | CBFEM connection design method |
| STAAD.Pro | Step 13 | Step 14 | Auto loads | Bentley ecosystem (OpenRoads, etc.) |
| Sofistik | Step 13 | Step 14 | Auto loads + staged | Deep precast, parametric bridge |
| LUSAS | Step 13 | Step 15 | Scale | Marine/offshore specialization |
| Abaqus | Step 15 | Step 19 | Contact + scale | Manufacturing, multiphysics, non-structural |
| OptiStruct / Tosca | Step 16 | Step 16 | Optimization | Automotive/aerospace optimization workflows |

## Related Docs

- `SOLVER_ROADMAP.md` — solver step definitions and done criteria
- `PRODUCT_ROADMAP.md` — product sequencing
- `research/open_source_solver_comparison.md` — detailed comparison with OpenSees, Code_Aster, Kratos
- `research/cypecad_gap_analysis.md` — CYPECAD-specific gap analysis
- `POSITIONING.md` — market framing and competitive strategy
