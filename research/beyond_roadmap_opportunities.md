# Beyond the Roadmap: Research-Backed Opportunities

Read next:
- current snapshot: [CURRENT_STATUS.md](/Users/unbalancedparen/projects/dedaliano/CURRENT_STATUS.md)
- solver priorities: [SOLVER_ROADMAP.md](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)
- product execution: [PRODUCT_ROADMAP.md](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md)
- WebGPU analysis: [webgpu_solver_renderer_analysis.md](/Users/unbalancedparen/projects/dedaliano/research/webgpu_solver_renderer_analysis.md)

This document surveys advances in structural/civil engineering research (2016-2026, emphasis on 2021-2026) and identifies opportunities beyond the current solver roadmap. Research conducted March 2026.

## What Dedaliano Already Has (Post-Roadmap)

Once the full roadmap is complete, Dedaliano will have: sparse solvers with AMD ordering, 5 shell families (DKT, MITC4, MITC9, SHB8-ANS, curved shell), corotational nonlinear, fiber beams, arc-length, modal/buckling/harmonic, Craig-Bampton/Guyan reduction, SSI, contact, WASM browser target, and ~6000 tests. That's already stronger than most open-source structural solvers on focused building/bridge analysis.

The biggest gaps are not in solver numerics — the roadmap covers that comprehensively. The 100x opportunities are in layers **on top** of the solver.

---

## Tier 1 — Transformative Additions

### 1. Automated Code Checking (Eurocode / ACI / AISC)

**Table-stakes for competing with commercial tools.** Engineers don't want forces — they want utilization ratios, DCR values, and pass/fail per member per code clause. ProtaStructure, RFEM, ETABS all do this. A 2025 paper showed multi-agent LLMs can automate code-compliant RC design with 97% accuracy. The existing [rc_design_and_bbs.md](rc_design_and_bbs.md) outlines the path. This is what converts a "solver" into a "design tool."

References:
- ProtaStructure 2025: enhanced RC design for ACI318-2019, Eurocode 8
- LLM multi-agent code-compliant design (2025): 97% accuracy, 90% time savings
- ANSYS code-checking modules for AISC/ACI/Eurocodes

### 2. GNN / Neural Operator Surrogates for 1000x Parametric Speedup

Graph neural networks treating FE meshes as graphs achieve ~1000x inference speedup over FEM (Nature Scientific Reports, 2024). Physics-Informed Geometry-Aware Neural Operators (PI-GANO, 2025) get <3% error without FEM training data. **The killer app isn't replacing FEA — it's accelerating design loops**: topology optimization, IDA, fragility curves, parametric studies. Train once on the solver's output, then explore 10,000 variants in seconds. This turns a "run one analysis" tool into a "design exploration engine."

References:
- Mesh-based GNN surrogates (Nature Scientific Reports, 2024)
- GNN for tall building optimization (2025)
- PI-GANO geometry-aware neural operator (2025)
- PINNs review for structural engineering (2025) — note: PINNs have known reliability issues for production use
- FrameRL physics-informed DRL for frame design (2024)

### 3. Performance-Based Design / FEMA P-58 Loss Estimation

FEMA P-58 (seismic loss estimation via fragility functions + EDPs) is becoming required for major projects. Integrating hazard → NLRHA → damage states → repair cost/downtime into one tool would be unique among lightweight solvers. ML-accelerated IDA (hybrid IDA-ML with SVR/LSTM surrogates) reduces full IDA from weeks to hours by needing 10-100x fewer nonlinear analyses. Cloud analysis and multi-stripe analysis are cheaper alternatives gaining traction.

References:
- FEMA P-58 factor prioritization (2025)
- FEMA P-58 portfolio resilience (2024)
- ML-accelerated IDA surrogates (2024)
- Deep learning fragility for mainshock-aftershock (2024)
- Seismic drifts via DNN circumventing IDA (2024)

### 4. Topology Optimization (SIMP + Differentiable FEA)

JAX-FEM showed differentiable FEA enables topology optimization with automatic differentiation — no manual sensitivity derivation. ML-accelerated SIMP (one-time training methods) reduces iteration counts by 10-100x. No browser-based tool offers in-browser topology optimization today.

References:
- ML-based topology optimization review (2023)
- Manufacturing constraints survey (2024)
- RL-based topology optimization (2025)
- JAX-FEM differentiable GPU-accelerated 3D FE solver

---

## Tier 2 — High Impact, Practical to Implement

### 5. BIM-IFC Integration (Import/Export)

Engineers spend hours recreating BIM models in analysis software. Automated geometry + sections + materials extraction from IFC (via IfcOpenShell or equivalent) saves hours per project. A 2025 paper demonstrated reintegrating analysis results back into IFC for code checking. This is a major adoption driver.

References:
- IFC-based framework for analysis results (2025)
- Automated structural model from architectural model (2024)
- Automatic BIM-to-FE model generation (TU Berlin, 2024)

### 6. Cross-Laminated Timber (CLT) Material Models

Mass timber is the fastest-growing structural material in commercial construction. **Most FEA tools have poor CLT support.** CLT requires orthotropic plate analysis with rolling shear in cross layers (9 elastic constants). Dedaliano already has layered shell elements — adding orthotropic laminate constitutive models would be a significant market differentiator with relatively modest solver work.

References:
- CLT panel shear behavior (2025)
- Timber-concrete composite comprehensive review (2025)

### 7. Seismic: Automated IDA + Fragility Curves

Incremental Dynamic Analysis automation (ground motion selection → scaling → batch NLRHA → fragility curve fitting) would directly serve earthquake engineers. With ML surrogates (LSTM for multi-output seismic response prediction, 2025), fragility curves can be generated with 10-100x fewer analyses. SeisGPT (2025) demonstrated physics-informed real-time seismic response prediction.

References:
- SeisGPT real-time seismic prediction (2025)
- Collapse-based seismic design (2025)
- Resilience-based design spectra (2025)

### 8. Generative Design / Optimization API

Expose parametric model definition + batch execution + constraint evaluation as an API. This enables: evolutionary optimization (NSGA-II for multi-objective), RL-based autonomous design (FrameRL, 2024: safe steel frame design in <1 second), and Grasshopper/Karamba-style parametric workflows. The FrameGym (2025) RL environment shows where this is heading.

References:
- Karamba3D parametric structural design
- FrameRL autonomous design (2024)
- FrameMARL multi-agent optimization (2025)
- FrameGym RL environments (2025)

### 9. Real-Time Analysis for Interactive Design

Sub-second feedback during geometry editing using existing Craig-Bampton/Guyan reduction. Show approximate stress/displacement fields while the user drags nodes, refine in background. Onshape Simulation demonstrates the UX. GNN surrogates (topic 2) could provide instant approximate feedback.

References:
- IAAC interactive block-based structural tool (2024)
- Onshape Simulation cloud-native FEA

---

## Tier 3 — Valuable Differentiators

### 10. Digital Twins & Structural Health Monitoring

Digital twins for structures integrate: (1) a high-fidelity FE model, (2) real-time sensor data (accelerometers, strain gauges, drone-based photogrammetry, wireless sensors), (3) Bayesian model updating to calibrate the FE model against observations. A 2025 comprehensive review identified the maturation of physics-informed digital twin frameworks that combine FEM with SSI, model order reduction, and Bayesian updating from vibration data.

Key advances:
- **Bayesian parameter estimation** using MCMC (~1000+ iterations) to update material properties, boundary conditions, and damage parameters from monitoring data.
- **Surrogate-assisted updating**: Using ML surrogates instead of full FE models in the Bayesian loop to make real-time updating feasible (FE evaluations drop from millions to hundreds).
- **Drone-based photogrammetry + wireless sensors** fused with BIM and FEM for continuous model synchronization.

A solver that natively supports model updating (parameterized models + API for sensor data ingestion + Bayesian inference) would be uniquely positioned for the infrastructure monitoring market. Framework concepts are mature; full production implementations are limited to high-value infrastructure (bridges, wind turbines, dams).

References:
- Digital twin for SHM comprehensive review (2025)
- Digital twin framework for bridge infrastructure (2025)
- Bayesian model updating with surrogates (2022)
- Digital twin SHM current status and prospects (2025)

### 11. Progressive Collapse Analysis

The GSA 2016 guidelines use the Alternate Load Path (ALP) method: notionally remove one vertical element at a time, verify the structure can bridge over the gap. Analysis methods range from linear static (with dynamic amplification factor = 2.0) to full nonlinear dynamic. Recent 2025 research integrates soil-structure interaction into progressive collapse optimization frameworks.

The analysis capabilities (nonlinear dynamic, element removal, large deformation) already largely exist in Dedaliano. The main gap is **workflow automation**: automated column/wall removal scenarios, dynamic amplification checks, and DCR calculations. A progressive collapse analysis wizard would be valuable for federal buildings (GSA mandate) and tall buildings.

References:
- GSA Progressive Collapse Guidelines (2016)
- ALP for impact-induced progressive collapse (2025)
- Progressive collapse review: past, present, future (2024)

### 12. Resilience Metrics & Recovery-Based Design

Moving beyond life-safety code compliance to quantifiable resilience:
- **Functional recovery objectives**: Time to regain building function after an event. ASCE 7-28 may formalize recovery-based criteria.
- **Four Rs**: Robustness, redundancy, resourcefulness, rapidity as quantifiable design metrics.
- **Resilience-based design spectra** (2025): Design spectra for buildings that explicitly target resilience, not just strength. Demonstrated for school buildings in Mexico City.
- **Multi-hazard resilience**: Frameworks that assess combined earthquake + wind + flood risk with unified metrics.

As codes evolve toward resilience objectives, solvers that can compute recovery time, damage states, and repair costs (linked to FEMA P-58 fragility data) will be essential. This is a differentiation opportunity.

References:
- Resilience-based design spectra (2025)
- Advancing seismic resilience (2024)
- Structural design for community resilience (ASCE)

### 13. Uncertainty Quantification

Over 20 UQ methods have been benchmarked for structural reliability:
- **FORM/SORM**: First/second-order reliability methods — mature, fast for single failure modes.
- **Subset simulation**: Efficient for rare events (probability < 10^-6).
- **Polynomial chaos expansion (PCE)**: Surrogate-based, reduces FE evaluations from millions to hundreds.
- **Stochastic collocation**: Similar to PCE, better for high-dimensional problems.
- **Monte Carlo + importance sampling**: Brute-force but reliable.

A 2025 paper introduced a stochastic simulator for seismic UQ using dimensionality reduction-based surrogate modeling, integrating both aleatory and epistemic uncertainties.

Pragmatic approach for Dedaliano: expose parameterized analysis + batch execution APIs so external UQ tools (OpenTURNS, UQLab) can drive the solver efficiently. Don't build UQ internally — let specialized tools orchestrate.

References:
- Stochastic FEM and reliability review (Emerald)
- Seismic UQ with dimensionality reduction (2025)

### 14. Advanced Material Models

Three material domains are seeing significant FEA modeling advances:

**a) Concrete Damage Plasticity (CDP)** — CDP models are now standard for 3D-printed concrete (3DPC) simulation, combined with cohesive zone models (CZM) for layer interfaces. Recent 2025 work uses composite micro-models (CDP + CZM) for cyclic loading of 3DPC walls, and XFEM with cohesive laws for fracture propagation. CDP is fully mature in Abaqus and DIANA. Essential for nonlinear RC analysis beyond plastic hinges.

**b) Fiber-Reinforced Polymers (FRP)** — Modeled as linear-elastic to rupture with Hashin failure criteria for damage initiation and bilinear softening. A 2025 parametric study of 224 FRP-reinforced beam simulations showed CFRP can increase capacity by 90%. Growing in practice for retrofit and strengthening projects.

**c) 3D-Printed Concrete** — Requires anisotropic material models (strong in print direction, weak across layers) plus interface elements between layers. An active research area as 3D-printed construction scales up.

References:
- 3D printed concrete FEA material models (2024)
- FRP beam parametric FEA (2025)

### 15. Composite & Hybrid Structures

Steel-concrete composite, timber-concrete composite (TCC), and steel-timber hybrid structures are increasingly common. FEA challenges include modeling connection behavior (shear connectors, screws), composite action, and partial interaction.

Key advances:
- **Concrete-filled steel tube (CFST) hybrid structures** (2024): FEA models validated for bending with criteria for ultimate limit state.
- **Steel-timber composite joints** (2024): 3D FE parametric analysis of beam-to-column joints with varying parameters.
- **Timber-concrete composite (TCC) review** (2025): Comprehensive coverage of FEA approaches from data-driven to parametric tools.

Supporting composite section analysis (partial composite action, slip at interface) would serve the growing hybrid construction market. Key solver need: layered/composite beam and plate elements with interface slip.

References:
- TCC comprehensive review (2025)
- CFST hybrid structures (2024)
- Steel-timber composite joints (2024)

### 16. Seismic Engineering: Expanded Detail

Beyond the IDA automation in Tier 2, several deeper seismic advances are relevant:

- **Cloud analysis**: Uses unscaled ground motion records at their natural intensity. Computationally cheaper than IDA (no scaling bias). Regression-based fragility derivation. Gaining traction as a practical alternative.
- **Multi-stripe analysis (MSA)**: Records selected at discrete hazard levels. More statistically rigorous than IDA for some applications.
- **Collapse-based seismic design** (2025): A new design method that directly targets collapse prevention as the design objective, rather than drift limits.
- **Resilience-based seismic design**: Moving beyond life-safety to functional recovery. Recovery-based design frameworks minimize post-earthquake downtime.
- **SeisGPT** (2025): A physics-informed large model for real-time seismic response prediction, potentially replacing NLRHA for preliminary design.

NLRHA/IDA is mature. ML surrogates are rapidly advancing. Resilience-based design is emerging (ASCE 7-28 may include recovery objectives).

References:
- SeisGPT real-time seismic prediction (2025)
- Collapse-based seismic design (2025)
- Performance-based retrofitting and resilience (2025)

### 17. Cloud Computing & WASM Advances

Dedaliano already targets WASM, but recent platform advances are relevant:

- **WASM64**: 64-bit address space for larger FEA models in the browser. Currently models are limited by the 4GB WASM32 address space. WASM64 removes this ceiling.
- **WASM Components** (2024): Composable, sandboxed modules with tiny binaries and fast startup. Could enable modular solver architecture (core solve, postprocess, visualization as separate components).
- **Onshape Simulation**: Cloud-native FEA in the browser with interactive, adaptive analysis — fast visual previews while refining in background. Demonstrates the market for browser-based structural analysis.
- **SimScale**: Another cloud-native FEA platform showing commercial viability.

These are infrastructure/platform opportunities, not solver algorithm changes. But they expand the ceiling of what's practical in-browser.

References:
- WebAssembly state 2024-2025
- SPARSELAB cloud FEA technology

---

## WebGPU and the Solver: A Nuanced View

See [webgpu_solver_renderer_analysis.md](webgpu_solver_renderer_analysis.md) for the full analysis.

### The core question: sparse direct vs iterative + matrix-free

The current solver is sparse direct (Cholesky + AMD). This is the **correct architecture** for structural engineering because:

- **Structural matrices are ill-conditioned.** Shells, mixed stiffnesses, thin plates — condition numbers of 10^6 to 10^12. Iterative methods struggle without excellent preconditioners.
- **Direct solvers are predictable.** No convergence issues, no parameter tuning, no mesh-dependent failure modes.
- **Problem sizes are modest.** A large building model is 50,000-500,000 DOFs. Sparse direct handles this well. This isn't CFD with 10M+ DOFs.
- **Multiple RHS are cheap.** With 50+ load combinations, you amortize factorization. Iterative methods pay full cost per RHS.
- **Every commercial structural analysis tool** (ETABS, SAP2000, RFEM, Robot, STAAD) uses sparse direct solvers. Not because they don't know about iterative methods — because direct is better for this domain.

The measured performance confirms this: 22-89× speedups came from fixing sparse Cholesky and AMD ordering, not from changing algorithm class. The 234× harmonic speedup came from modal superposition (an algorithmic shortcut), not iterative solve.

### Where GPU/iterative could help (selectively)

WebGPU is **not** the right approach for the core sparse direct solve path. But it could help in specific areas:

- **Batched element stiffness evaluation** for large uniform shell meshes — embarrassingly parallel, GPU-shaped. Only useful if profiling proves element math (not sparse data structure overhead) dominates.
- **Postprocessing kernels** — stress recovery, nodal averaging, contour field preparation. These are regular and parallelizable.
- **Visualization** — result-field rendering, deformed shapes, mode animation. Natural GPU work.
- **Topology optimization** inner loops — repeated mat-vec evaluations where you don't need a full factorization each iteration.
- **If iterative methods are ever added** (PCG/GMRES for very large models >500k DOFs) — sparse mat-vec, dot products, and vector updates are GPU-friendly. But this requires building iterative solvers on CPU first, then porting.

### What actually gives 100x

The real multipliers are **not** in changing the solver algorithm:

| Approach | Speedup | Why |
|---|---|---|
| **Application-level algorithms** | 10-1000× | Modal superposition (already 234×), Craig-Bampton, substructuring |
| **ML surrogates for design iteration** | 1000× | Train on solver output, infer for parametric studies |
| **Parallel assembly** (rayon, already exists) | 2-8× | Embarrassingly parallel element evaluation |
| **Sparse direct improvements** | 2-5× | Supernodal Cholesky, BLAS-3 dense subblocks within sparse factor |
| **Substructuring / domain decomposition** | 5-50× | Solve each floor/zone independently, couple at interfaces |

---

## Strategic Summary

The 100x improvement comes from three layers on top of the solver:

1. **ML surrogates trained on the solver** — turns single-analysis into design-exploration (1000× for parametric studies)
2. **Design automation** (code checking, IFC, optimization API) — turns a solver into a product engineers actually buy
3. **Application-level algorithmic shortcuts** (modal superposition, substructuring, reduction) — already proven at 234× for harmonic

The combination of browser-native + ML surrogates + code checking + optimization API would create something that doesn't exist: a fast, accessible, intelligent structural design tool that runs entirely in the browser with no installation, explores thousands of design variants, and outputs code-compliant utilization ratios.

WebGPU has a role for visualization, postprocessing, and possibly topology optimization inner loops — but the core solve path should remain sparse direct.

---

## Lower Priority / Out of Scope

### Wind Engineering

Computational wind engineering has advanced in CFD-FEA coupling for vortex-induced vibration (VIV) and aeroelastic analysis. The force-partitioning method (2024) decomposes aerodynamic forces into viscosity, added mass, and vorticity components for better understanding of VIV mechanics. High-fidelity VIV simulations use forced-motion methods with multiple CFD solvers.

**Why lower priority for Dedaliano:** The high-value wind engineering work requires CFD, which is a separate domain entirely. What a structural solver can provide is proper aeroelastic frequency analysis (flutter) and code-based wind load generation — the modal analysis capabilities in Dedaliano already support this. CFD-FEA coupling is out of scope.

References:
- VIV force-partitioning analysis (2024)
- Recent Developments in Wind Engineering (NCWE 2024)

### Isogeometric Analysis (IGA)

IGA uses NURBS (the same basis functions as CAD) directly as FE shape functions, eliminating mesh generation. Recent work includes trimmed-NURBS for complex cutouts (2024), hybrid IGA-FEM coupling (2025), and IGA for naturally shaped timber structures using scaled boundary methods (2024). LS-DYNA has IGA support; Abaqus supports it through user elements.

**Why lower priority for Dedaliano:** IGA shines for smooth geometries (shells, automotive). For typical building structures (frames, walls, floors), classical FE is perfectly adequate. The CAD-FEA gap is better addressed by BIM-IFC integration for building structures. No mainstream structural analysis tool uses IGA as the primary method.

References:
- IGA for timber structures (2024)
- Hybrid IGA-FEM (2025)
- Trimmed-NURBS thermal buckling (2024)

### Multi-Scale Modeling

Key advances include:
- **FFT-based homogenization for plates** (2024): Uses FFT at both scales for thin plate structures, dramatically reducing computation vs conventional FE2.
- **Direct FE2** (2023): Eliminates nested FE analyses by directly linking DOFs across scales.
- **ML-assisted multi-scale** (2025): Trains surrogate models to replace microscale RVE evaluations.

**Why lower priority for Dedaliano:** Multi-scale is essential for composite materials research but rarely needed for building/bridge analysis. CLT could benefit from layered homogenization, but simpler laminate theory suffices for practice. Production use is limited to specialized applications (composites, metamaterials).

References:
- FFT-based homogenization for thin plates (2024)
- ML-based multi-scale FE framework (2025)

### Meshfree Methods (Peridynamics, MPM)

The Adaptive Peridynamics Material Point Method (APDMPM, 2022) combines MPM for continuum regions with peridynamics for damage zones, automatically converting particles based on stress state. Enables progressive failure simulation without remeshing.

**Why lower priority for Dedaliano:** These methods solve problems (crack propagation, fragmentation, landslides, blast impact) that are outside typical structural analysis scope. Not practical for routine structural engineering. Niche applications only.

References:
- Adaptive peridynamics MPM (2022)
- Peridynamic elastic-plastic fracture (2024)

### GPU Sparse Direct Factorization

Research exists on GPU-accelerated sparse Cholesky/LDL^T/LU, but this is a poor fit because: fill-in patterns are irregular, ordering/pivoting logic is inherently serial, memory access patterns don't map to GPU architecture, and data transfer overhead erases gains at structural engineering problem sizes. Direct solvers should stay on CPU.
