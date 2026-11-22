# High-Leverage Solver and Product Architecture Plan (2026-11-22)

Read with:
- product execution and soundness rules: [`PRODUCT_ROADMAP.md`](../roadmap/PRODUCT_ROADMAP.md)
- solver mechanics and sequence: [`SOLVER_ROADMAP.md`](../roadmap/SOLVER_ROADMAP.md)
- AI strategy and safety boundary: [`AI_ROADMAP.md`](../roadmap/AI_ROADMAP.md)
- verification and formal proofs: [`testing/ROADMAP.md`](../../testing/ROADMAP.md)
- prior landscape notes: [`beyond_roadmap_opportunities.md`](beyond_roadmap_opportunities.md), [`post_roadmap_software_stack.md`](post_roadmap_software_stack.md), [`cypecad_competitive_gap_and_parity_plan.md`](cypecad_competitive_gap_and_parity_plan.md)

## Purpose

This document synthesizes the highest-leverage **solver** and **product** opportunities grounded in Stabileo's actual codebase as of v0.6.3 (November 2026), and maps them into a **reprioritized roadmap** that obeys Stabileo's strict **Soundness First** ordering (`(a)` through `(g)` in [`PRODUCT_ROADMAP.md`](../roadmap/PRODUCT_ROADMAP.md#overall-order)).

The goal is not to add generic simulation features, but to:
1. eliminate the recurring root causes behind the October–November 2026 safety advisories ([`docs/advisories/README.md`](../advisories/README.md)) structurally rather than defect by defect,
2. turn assets already built in `engine/`, `verify/`, `testing/`, and `research/` into 10–1000× solver and UX multipliers, and
3. convert Stabileo's unique verification moat (Lean-checked certificates, differential harnesses, public advisories, browser-native Rust/WASM) into pull-based B2B distribution.

---

## Diagnosis From the Codebase

1. **The solver core is no longer the primary source of wrong results.** Most advisories from `SA-2026-064` through `SA-2026-107` came from the translation layer between physical structural objects (roofs, floor regions, beam lines, wall–slab junctions, rebar cages) and mutable FEM primitives, plus engineering logic still split across ~59k lines of TypeScript ([`TS_ENGINE_LOGIC.md`](../../testing/docs/TS_ENGINE_LOGIC.md)) and duplicated across f64 checks, interval certificates, sizing loops, and calculation reports.
2. **Existing engine assets are under-leveraged.**
   - [`load_cases.rs`](../../engine/src/solver/load_cases.rs) and [`load_session.rs`](../../engine/src/load_session.rs) bypass `PreparedStatic` factorization reuse whenever `!constraints.is_empty()`, forcing every real 3D building with rigid diaphragms or links to re-assemble and re-factorize `Cᵀ K C` once per load case.
   - [`whatif.svelte.ts`](../../web/src/lib/store/whatif.svelte.ts) restores a full snapshot and triggers a full re-solve on slider edits instead of low-rank re-analysis on the cached supernodal Cholesky factor ([`sparse_chol.rs`](../../engine/src/linalg/sparse_chol.rs)).
   - [`plastic_limit.rs`](../../engine/src/solver/plastic_limit.rs) uses a dense LP capped at 200 members (100 certified), 2D plastic collapse remains refused (`SA-2026-044`), and 3D plastic certification is bending-only, even though pure-Rust WASM-clean Clarabel conic optimization is already proven in `research/optimisation/fairclough-2026/`.
   - [`section/mod.rs`](../../engine/src/section/mod.rs) already contains a full 2D FEM cross-section mesher (`spade`) and Poisson solver for torsion, warping, and shear flow, [`collision_kernel.rs`](../../engine/src/collision_kernel.rs) already provides a 3D rebar spatial hash, [`prestress.rs`](../../engine/src/solver/prestress.rs) + [`creep_shrinkage.rs`](../../engine/src/solver/creep_shrinkage.rs) + `staged.rs` already exist as separate silos, and [`verify/Certify/`](../../verify/Certify/Main.lean) already proves certificate soundness in Lean 4.
   - [`AUDIT-2026-10.md`](../performance/AUDIT-2026-10.md) and [`lib.rs`](../../engine/src/lib.rs) show that advanced WASM paths still serialize full models to/from JSON strings across the JS↔WASM boundary and run single-threaded scalar f64 on a 12 MB unoptimized WASM binary.

---

## Reprioritized Roadmap Architecture

Soundness stays strictly first. Work is organized into **five waves** that map onto the `(a)–(g)` hierarchy of [`PRODUCT_ROADMAP.md`](../roadmap/PRODUCT_ROADMAP.md#overall-order):

### Wave 0 — Active Soundness Closure (Roadmap Classes `a`, `c`, `d`)
*No lower wave takes capacity from uncontained silent wrong results.*
- Close or contain all open November 2026 design, load, and plate-conformity findings, complete nightly triage, and fix `SA-2026-056` and MITC4/MITC9 shell formulation issues (`#798`, `#1057`).

### Wave 1 — Soundness-Compounding Architectural Foundations (Roadmap Class `b`, then `f`)
*These eliminate entire recurring bug classes while unlocking 10–1000× solver and UX speedups.*

1. **Canonical Physical Structural IR → Pure Rust Analytical Compiler** *(Class `b`)*
   - Decouple the mutable user model from the finite-element mesh.
   - **Layer 1 (Physical IR):** continuous, coordinate-invariant `BeamLine`, `Column`, `Wall`, `Slab`, `RoofPolygon`, `Opening`, `LoadSurface`, `Diaphragm`, `RebarCage`, `SupportRegion`.
   - **Layer 2 (Pure Lowering Pass in Rust):** `compile(PhysicalIR, MeshPolicy) -> AnalyticalFEM` using `spade` CDT for conforming wall–slab junctions, openings, and exact tributary/surface pressure integration.
   - **Invariant by construction:** wind, snow, seismic stories, gravity load ownership, and rebar cutoffs are computed on Layer 1 *before* meshing exists — making subdivision, remesh, rotation, and member-reversal invariance structural theorems rather than fragile heuristics. Every lowering pass enforces exact global force and moment conservation (`∫ p dA == Σ f_i`, `∫ r × p dA == Σ r_i × f_i`).
   - Enables **multi-fidelity compilation** from one model (coarse stick frame for ms-scale live editing/sizing, refined MITC4/MITC9 shell model for final check, fiber model for nonlinear pushover).

2. **Executable Design-Code IR ("Design Codes as Data")** *(Class `b`)*
   - Stop hand-maintaining every design clause four times across f64 checks, interval certificates, sizing searches, and Memoria equations.
   - Represent each clause once as a pure, unit-typed expression AST tagged with its exact clause ID (e.g., `CIRSOC 201-2025 §22.5.5.1(c)`), domain preconditions, and branch predicates.
   - Automatically derive five artifacts from the single AST:
     1. fast `f64` check,
     2. outward-rounded `Interval` certified check (zero drift with f64),
     3. `Dual<f64>` derivatives $\partial(\text{DCR})/\partial(b, h, A_s, f'_c, f_y)$ for sizing and optimization,
     4. exact step-by-step KaTeX / PDF / DOCX Memoria trace with substituted values, units, branches taken, and clause citations (**impossible for reports to disagree with the engine**),
     5. exhaustive boundary-case tests on both sides of every limit and proof obligations for Lean/Kani.

3. **Exact Piecewise-Analytical Frame Algebra (`PiecewisePoly<5>`)** *(Class `b`)*
   - Extend roadmap item 2.2 from static diagrams to combinations, exact closed-form inflection points and extrema ($V(x)=0$, $M(x)=0$), exact analytical `Cb` integration, closed-form moving-load influence envelopes, and exact rebar anchorage/curtailment intervals — permanently eliminating station-sampling blind spots (`SA-2026-051`, `093`, `102`).

4. **Constrained `PreparedStatic` + Adjoint Sensitivities + Woodbury Rank-k Re-Analysis** *(Class `f`)*
   - Close the immediate factorization-reuse gap in [`load_cases.rs`](../../engine/src/solver/load_cases.rs) and [`load_session.rs`](../../engine/src/load_session.rs) by factoring `Cᵀ K_ff C` once across all load cases, combinations, and moving-load positions.
   - Add **one-backsolve adjoint sensitivities** (`K λ = ∂g/∂u` → exact $\partial g/\partial p_e$ for every member simultaneously for drift, member forces, buckling $\lambda_{\text{cr}}$, and frequencies $\omega_i^2$).
   - Add **Sherman–Morrison–Woodbury rank-k updates** on the cached supernodal Cholesky factor `L` so local section/release/support edits ([`whatif.svelte.ts`](../../web/src/lib/store/whatif.svelte.ts)) update exact displacements in milliseconds on 50k-DOF buildings.
   - Add zero-Monte-Carlo **assumption sensitivity envelopes** (`#357`: soil stiffness, cracked $I_{\text{eff}}$, semi-rigid fixity) and 5–15-iteration whole-building convex sizing (MMA / sequential conic).

5. **Resident WASM Memory Arena + Zero-Copy GPU Buffers + Deterministic WASM `simd128`** *(Class `f`)*
   - Replace repeated full-model JSON string round-trips across JS↔WASM ([`lib.rs`](../../engine/src/lib.rs)) with a persistent WASM `ModelArena` accepting small delta mutations and exposing zero-copy `Float32Array` views directly to Three.js for deformed shapes, contours, mode animations, and 3D rebar.
   - Add deterministic `wasm32` `simd128` (`f64x2`) kernels inside [`sparse_chol.rs`](../../engine/src/linalg/sparse_chol.rs) supernode panels (fixed reduction order preserving cross-browser bitwise determinism), streaming WASM compile + determinism-gated `wasm-opt` (`#1072`), and Web Worker pools for multi-case, optimization, and background certification workloads.

6. **Load-Dependent Ritz Vectors (Wilson WYD) + Automatic Identical-Substructure Caching** *(Class `f`)*
   - Add Load-Dependent Ritz vectors alongside Lanczos ([`lanczos.rs`](../../engine/src/linalg/lanczos.rs)) to hit >99% seismic/dynamic mass participation in 5–10 vectors with built-in static missing-mass correction (10–50× faster on shell-slab buildings; prevents `SA-2026-043`/`058` truncation errors).
   - Hash repeated floors/bays/trusses and automatically condense canonical substructures once via [`reduction.rs`](../../engine/src/solver/reduction.rs) (Craig–Bampton / Guyan superelements) with exact recovery, reducing multi-story towers by 10–100× in DOF count.

---

### Wave 2 — Zero-Switching-Cost Distribution & Trust Wedges (Roadmap Multipliers)
*Once Wave 0 soundness holds and Wave 1 foundations land, ship pull-based adoption surfaces that require zero firm rip-and-replace.*

1. **Proof-Carrying Memorias & Zero-Trust Verification Portal (`verify.stabileo.com`)** *(extends `#346`, `#499`)*
   - Compile the independent bundle verifier (`certcheck`) to a minimal offline browser WASM module (<150 KB).
   - Embed a QR code + cryptographic proof bundle (and pinned snapshot hash) in every exported PDF/DOCX `Memoria de Cálculo`.
   - Any peer reviewer, municipal authority, bank, or insurer drags a report into `verify.stabileo.com` offline to verify in <1 s: (a) Lean-proved solver/plastic/combination bounds, (b) input-to-report integrity (no manual edits), (c) live check against the public safety-advisory registry, and (d) read-only interactive 3D inspection with sensitivity sliders.
   - Creates **reviewer-pull B2B distribution** and turns Stabileo's public advisory discipline into a defensible trust moat.

2. **"Drop Your ETABS / SAP2000 / STAAD / OpenSees File for a 10-Second Certified Second Opinion" (Stabileo Audit)** *(elevates `.e2k`/`.s2k`/`.std`/`.tcl` import from Phase 4 to top-of-funnel)*
   - 100% local in-browser WASM execution (NDA/client files never leave the engineer's machine).
   - Imports an existing model and runs: kinematic/mechanism audit, independent Lean-certified static/modal/buckling solve, `review_model_sanity` checks (equilibrium, mass/m², period vs empirical code formula, soft-story and torsional irregularity), and side-by-side comparison against the incumbent tool's exported reactions and drifts.
   - Converts Stabileo's differential-testing DNA into immediate billable QA usage with zero switching risk.

3. **Ecosystem-First AI & Automation: `stabileo-mcp` + `pip install stabileo` + Visual Revision Diff + `Stabileo-Bench`** *(extends `#351`, `#731`)*
   - Prioritize an open-source local/remote **MCP server** (`stabileo-mcp`) and native **PyO3 Python package** (`pip install stabileo`) backed by the Physical IR, pre-solve sanity gates, and Lean certificates — putting Stabileo inside Claude Code, Cursor, Codex, Jupyter, and firm scripts rather than competing only via an in-app chat sidebar.
   - Support `.to_stabileo_url()` / `.ded` handoff straight to the interactive 3D viewer.
   - Ship **Visual Revision Diff** (`.ded` / `.ifc` Rev A vs Rev B): 3D color-coded diff of geometry changes, demand deltas, BOM/rebar changes, and newly failing checks (usable interactively and in CI/MCP).
   - Publish **`Stabileo-Bench`**: the first open deterministic benchmark evaluating how accurately frontier LLMs model, audit, and size real structures with tool-backed FEM and certified checks.

4. **The "Inverse Design Canvas" & Live Cost / CO₂ / Constructability HUD** *(extends `#347`)*
   - Powered by Wave 1's adjoint sensitivities and Woodbury updates: click any failing limit state (drift, PMM, buckling, torsion, slab deflection) to highlight every member by exact marginal efficiency $\partial(\text{limit state})/\partial(\text{\$ or kg})$ and present 3 one-click constructable fixes (cheapest, zero-architectural-impact, or section-rhythm consolidated such as "≤ 4 beam profiles & ≤ 3 column sizes").
   - Always-visible live economics & carbon HUD (`steel t · concrete m³ · tCO₂e · unique sections`) plus instant **Live Code-Switch Diff** (toggle CIRSOC 201 ↔ ACI 318 ↔ EC2 on one model and diff steel tonnage and governing clauses).

---

### Wave 3 — High-ARPU Category-Expanding Solver & Deliverable Modules
*Each replaces a separate $5k–$15k/seat/year legacy desktop tool by combining modules already 60–80% built inside `engine/src/`.*

1. **Sparse Conic Programming (SOCP) Core: Building-Scale Certified Limit Analysis, Automated Strut-and-Tie (STM) & Slab/Masonry DLO**
   - Promote pure-Rust Clarabel (or an equivalent sparse primal-dual interior-point LP/SOCP core) into `engine/`.
   - **Certified 2D & 3D Limit Analysis with N–My–Mz–V–T interaction:** scales past 10,000 members, eliminates path/ordering/unit dependence (`SA-2026-044`, `SA-2026-014`), and produces both primal static stress fields and dual kinematic mechanisms directly checkable by [`PlasticSound.lean`](../../verify/Certify/PlasticSound.lean).
   - **Automated Strut-and-Tie Modeling (CIRSOC 201 / ACI 318 Ch. 23, EC2 §6.5):** synthesizes optimal statically admissible minimum-steel STM trusses for deep beams, pile caps, corbels, transfer girders, and wall openings with lower-bound equilibrium certificates.
   - **Discontinuity Layout Optimization (DLO):** certified upper/lower collapse bounds for irregular flat slabs with openings (yield lines) and unreinforced masonry arches/vaults (productizing `research/mechanics/heyman-1966/`).

2. **Browser-Native CBFEM (Steel Connections) & CSFM (Concrete Detail) — The IDEA StatiCa Alternative**
   - Combine `spade` 2D meshing + elastoplastic `MITC4`/`DKT` shells (5% strain limit) + unilateral bearing `contact.rs` + `constraints.rs` bolt/weld spring links + `buckling.rs` local plate stability.
   - Click any steel joint or concrete D-region in the global 3D building to extract all concurrent load combinations automatically and run full nonlinear contact/buckling joint verification in the browser.

3. **Constructability-Guaranteed 3D Rebar Routing + Direct CNC Export (BVBS & IFC4 Rebar)**
   - Upgrade [`collision_kernel.rs`](../../engine/src/collision_kernel.rs) from passive clash detection to an active 3D rebar router resolving beam–column joint congestion, hook bends, lap-splice stagger, and aggregate clearances (`CIRSOC 201 §25.2`) by construction.
   - Export **BVBS (`.abs`)** directly for automated rebar cutting/bending machines alongside IFC4 Rebar and mobile QR site inspection links.

4. **Thin-Walled Buckling (CUFSM / Direct Strength Method) + 2D Transient Thermal FE Fire Rating on `engine/src/section/`**
   - Add a ~500-line Finite Strip Method solver on [`section/mod.rs`](../../engine/src/section/mod.rs) computing signature buckling curves ($P_{crl}, P_{crd}, P_{cre}$) for cold-formed steel (AISI S100 / CIRSOC 303 DSM) in <5 ms.
   - Reuse `section/mesh.rs` + `poisson.rs` for 2D transient heat transfer under ISO 834 / EC1-1-2 fire curves coupled to temperature-degraded section capacity (R30–R120 certification in <50 ms).

5. **Unified Time-Dependent Post-Tensioned (PT) Slab & Staged Bridge Studio**
   - Unify [`prestress.rs`](../../engine/src/solver/prestress.rs), [`creep_shrinkage.rs`](../../engine/src/solver/creep_shrinkage.rs), `staged.rs` (including shoring/reshoring staging and loaded-member removal redistribution), and `MITC4` slabs with 3D tendon layout, hyperstatic/secondary moments, friction/wobble/anchorage losses, and cracked long-term deflections — challenging RAM Concept / ADAPT-Builder / Midas Civil in the browser.

6. **Certified Continuous PDE Error Bounds (Prager–Synge Equilibrated Fluxes) + Dual-Number Force-Based Nonlinearity**
   - Upgrade [`postprocess/discretization/`](../../engine/src/postprocess/discretization/mod.rs) from ZZ-SPR estimates (`certified: false`) to local vertex-patch equilibrated-flux reconstruction + Prager–Synge upper bounds (formalizable in Lean) + Dual-Weighted Residual goal-oriented refinement, certifying **both algebraic and mesh error** on slabs and shells.
   - Unify nonlinear elements around **Force-Based Gauss–Lobatto Fiber Beam-Columns** + **SO(3) Lie-group kinematics** + Rust `Dual<f64>` exact consistent tangents + **semi-smooth Newton / Augmented Lagrangian complementarity** for contact and cables (eliminating active-set chattering `#432` and enabling Newton–Kantorovich certification of nonlinear states).

---

### Wave 4 — Ecosystem Lock-In & Top-of-Funnel Growth
*Executed once Waves 0–2 make core trust and daily delivery unassailable.*

1. **Bi-Directional Parametric Script ↔ 3D Canvas & Shareable Locked Configurator Apps**
   - Every model has a readable parametric representation synced live with the 3D viewport (`@param` annotations auto-generating sliders).
   - Enables **Enterprise Typology Apps** (pipe racks, solar trackers, sheds, substations, crane runways, transmission towers — high-ACV enterprise workflow) and **Manufacturer-Embedded Certified Calculators** (steel mills, anchor/fastener, cold-formed and CLT producers publishing product selectors tied directly to the engineer's 3D model forces).

2. **Structural Intuition Lab & Seeded Professor Auto-Grader ("Duolingo/Brilliant for Structures")**
   - Productize `diagram-game`, `KinematicPanel`, `StepWizard`, and `WhatIfPanel` into a mobile-first qualitative $M/V/N$ diagram & deflected-shape sketching and mechanism-spotting daily challenge & course experience backed by the exact solver.
   - Give professors deterministic per-student seeded parameter randomization (unique spans/loads/hinge positions per student, anti-copying, automatic step-by-step partial-credit grading) to capture future structural engineers globally during university.

---

## Verification Gate For Every Addition

Nothing in Waves 1–4 bypasses Stabileo's safety rules ([`PRODUCT_ROADMAP.md`](../roadmap/PRODUCT_ROADMAP.md#1-rules), [`testing/ROADMAP.md`](../../testing/ROADMAP.md#prevention-fewer-safety-problems-2026-10-30)):
- Every new solver primitive (SOCP, CUFSM, CBFEM/CSFM, thermal fire, LDR, Prager–Synge, force-based fiber) ships labelled **experimental** until it has two independent published/solver references, convergence studies, self-checks, invariance tests (rotation, relabelling, reversal, units), and explicit refusal paths for out-of-scope inputs.
- Every performance path (`PreparedConstrainedStatic`, Woodbury updates, WASM `simd128`, Resident Arena, substructure caching) must pass **fast-path vs slow-path parity** and **cross-browser determinism** gates before becoming default.
- Every new design-code AST clause requires worked-example verification from published texts on both sides of every limit and independent engineer sign-off (`#450`).
