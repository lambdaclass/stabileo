# Dedaliano Solver Roadmap

## Purpose

This document is the `solver roadmap`.

Read next:
- current snapshot: [`CURRENT_STATUS.md`](/Users/unbalancedparen/projects/dedaliano/CURRENT_STATUS.md)
- current proof and capability status: [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md)
- verification method: [`VERIFICATION.md`](/Users/unbalancedparen/projects/dedaliano/VERIFICATION.md)
- shell-family selection notes: [`research/shell_family_selection.md`](/Users/unbalancedparen/projects/dedaliano/research/shell_family_selection.md)
- competitor shell-family comparison: [`research/competitor_element_families.md`](/Users/unbalancedparen/projects/dedaliano/research/competitor_element_families.md)
- numerical-methods gap analysis: [`research/numerical_methods_gap_analysis.md`](/Users/unbalancedparen/projects/dedaliano/research/numerical_methods_gap_analysis.md)
- RC design/BBS research: [`research/rc_design_and_bbs.md`](/Users/unbalancedparen/projects/dedaliano/research/rc_design_and_bbs.md)

It is for:
- solver mechanics
- numerical robustness
- validation and benchmark sequencing
- verification strategy sequencing
- performance and scale work

It is not the product, market, or revenue roadmap.
For that, see [`PRODUCT_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md).

For current capability and validation status, see [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md).
For shell-family selection and competitor comparison research, use the research notes linked above.

This document should stay forward-looking.
Historical progress belongs in [`CHANGELOG.md`](/Users/unbalancedparen/projects/dedaliano/CHANGELOG.md).

## Current Frontier

The sparse shell solve viability blocker is resolved and runtime gains are now measured. Dense LU fallback has been eliminated on representative shell models. Sparse Cholesky delivers 22-89× factorization speedup over dense LU (22× end-to-end at 30×30 MITC4), with 0 perturbations across all tested sizes and families. Fill ratio grows from 2.6× to 7.0× with mesh size, and AMD now beats RCM on fill for larger shell meshes. Assembly and DOF numbering are deterministic. Residual-based parity testing is in place.

Measured runtime data (Criterion, factorization only):

| Family | Mesh | nf | Dense LU | Sparse Chol | Speedup |
|--------|------|----|----------|-------------|---------|
| MITC4 | 6×6 | ~210 | 1.19ms | 0.88ms | 1.4× |
| MITC4 | 10×10 | 684 | 18.8ms | 4.17ms | 4.5× |
| MITC4 | 15×15 | ~1400 | 184ms | 16.4ms | 11× |
| MITC4 | 20×20 | 2564 | 986ms | 43.8ms | 22× |
| MITC4 | 30×30 | 5644 | 12.2s | 157ms | 77× |
| Quad9 | 5×5 | ~700 | 18.9ms | 4.2ms | 4.5× |
| Quad9 | 10×10 | ~2600 | 974ms | 56ms | 17× |
| Quad9 | 15×15 | ~5700 | 12.5s | 141ms | 89× |
| Curved | 8×8 | ~450 | 5.9ms | 10.1ms | 0.58× |
| Curved | 16×16 | ~1700 | 277ms | 109ms | 2.6× |
| Curved | 24×24 | ~3600 | 3.0s | 406ms | 7.4× |

Key observations:
- sparse wins on all families above ~500 DOFs
- dense still wins at curved 8×8 (~450 DOFs) — sparse overhead dominates at small sizes
- fill ratio grows with mesh size (not constant); AMD is now the measured fill winner on larger shell meshes
- 0 perturbations everywhere — Cholesky is clean
- at 30×30 MITC4 (5644 DOFs), sparse assembly + solve takes 0.56s vs 12.3s dense — 22× end-to-end

The main remaining work is:

- deeper sparse eigensolver integration after the now-partly-done sparse reuse into modal/buckling/harmonic/reduction, with modal and buckling already on sparse eigensolver paths in the common unconstrained case
- runtime and memory measurement on the newly sparse modal/buckling/harmonic/reduction workflows
- verification hardening around the new sparse path (determinism, parity gates, fill-ratio gates)
- RC-unblocking design-grade result extraction — beam station extraction is done with sign-convention metadata, grouped-by-member convenience layer with member-level governing summaries, and optional governing entries; remaining: 3D integration test depth, design-ready metadata for cover assumptions once RC design integration begins
- long-tail nonlinear hardening (mixed nonlinear cases)
- product surfacing (deterministic diagnostics and solve timings in the app)
- shell-family workflow maturity and selection guidance
- shell-adjacent workflow breadth (layered shells, axisymmetric workflows, nonlinear shell depth)
- solver-path consistency
- deeper reference-benchmark coverage on the newest advanced paths

## What Still Separates Dedaliano From The Strongest Open Solvers

Based on the comparison against projects like OpenSees, Code_Aster, and Kratos, the remaining gaps are not “missing the basics.” They are:

1. `Performance / scale maturity`
   Sparse Cholesky runtime gains are measured: 22-89× factorization speedup, 22× end-to-end, 0 perturbations. Sparse-path reuse is now partly done across modal/buckling/harmonic/reduction, and modal plus buckling already have sparse eigensolver paths in the common unconstrained case. The next steps are runtime measurement on the newly sparse workflows, deeper sparse eigensolver integration, and eigensolver cleanup.

2. `Long-tail nonlinear maturity`
   More years of hardened edge cases are still needed in mixed nonlinear workflows:
   - contact + nonlinear + staging
   - shell + nonlinear interaction
   - difficult convergence cases

3. `Full solver-path consistency`
   Dense vs sparse, constrained vs unconstrained, shell vs frame-shell mixed, and advanced nonlinear paths must keep converging to the same behavior.

4. `Benchmark moat expansion`
   Dedaliano is already strong here, but broader external-reference proof is also the most realistic path to becoming the best open structural solver.

5. `Shell-family workflow maturity`
   `MITC4 + MITC9 + SHB8-ANS + curved shells` now form a real production shell stack. The remaining shell work is no longer basic shell breadth, but shell-family guidance, workflow hardening, and the next important shell-adjacent capabilities competitors still expose clearly.

This changes the strategic target:

- not `be broader than every open-source mechanics framework`
- but `be the strongest open structural solver product with the deepest visible proof of correctness`

## What Would Make Dedaliano 10x Better

The next big gains are no longer about collecting more categories. They are about making the solver:

- faster on large real models
- more obviously correct
- more deterministic
- harder to break on ugly mixed workflows
- easier to select and use correctly across the shell stack

In practice, that means the main multipliers are:

1. `Runtime and scale dominance`
   Sparse paths should not only work; they should decisively win on the workflows that matter.

2. `Verification moat`
   Every important solver path should be protected by reference benchmarks, acceptance models, runtime/fill gates, parity checks, and stronger invariant/property/fuzz coverage.

3. `Long-tail nonlinear robustness`
   The solver should stay reliable on shell + nonlinear, contact + staging, and difficult convergence paths.

4. `Solver-path consistency`
   Dense vs sparse, constrained vs unconstrained, and mixed shell/frame workflows should keep converging to the same behavior.

5. `Shell workflow maturity`
   The advantage is now the multi-family shell stack used correctly, not raw shell-family count.

## Ranked Priorities

If the goal is `best open structural solver`, the current priority order is:

1. `Phase A: WASM path reliability and single-solver convergence`
   This is now the highest priority ahead of further solver-method depth.
   The immediate goal is to make Rust/WASM the trustworthy main execution path in the product, fix the frontend/WASM boundary completely, and remove the need for the TypeScript solver as a runtime backup. That means:
   - prove deploy/build consistency between JS glue and `.wasm`
   - verify production is serving the expected branch and commit
   - harden main-thread solve, worker solve, and multi-case/combo solve paths
   - eliminate branch-specific or deploy-specific WASM traps
   - add enough diagnostics to localize failures at the JS/WASM boundary
   - make production failures reproducible from a captured solver-run artifact, not just screenshots
   - define explicit deletion criteria for the TypeScript solver runtime path
   - retire the JS solver only after the WASM path is stable end-to-end

2. `Runtime and scale dominance`
   Sparse shell viability, deterministic assembly, sparse modal/buckling/harmonic depth, and reduction factorization reuse are now real. The next step is to turn those improvements into a clearly dominant runtime story across the remaining measured bottlenecks.

3. `Verification moat expansion`
   The next decisive advantage is stronger proof:
   - reference benchmarks
   - acceptance models
   - runtime/fill gates
   - determinism and parity gates
   - invariant, property-based, and fuzz coverage

4. `Verification hardening around the new sparse path`
   The sparse path is now live and deterministic. Lock it in with:
   - determinism gates (sorted assembly, merged DOF numbering)
   - residual-based parity gates (sparse vs dense solutions verified via residual norm)
   - fill-ratio gates (< 200× on representative shell meshes)
   - no-dense-fallback gates on representative shell models
   - sparse modal, buckling, and harmonic parity plus no-`k_full`-overbuild expectations
   - sparse reduction gates:
     - Guyan single-factorization behavior
     - Craig-Bampton interior eigensolve success
     - reduction parity where available
   - release-mode sparse smoke tests for numerically sensitive workflows
   - `parallel`-feature smoke tests so the parallel sparse path stays aligned with serial behavior
   - doctest coverage in CI so example/documentation regressions are caught early
   - broader invariant, property-based, and fuzzing coverage around sparse/shell paths
   - signal-driven benchmark growth: add tests that improve proof, regression protection, performance confidence, or edge-case coverage

5. `Design-grade result extraction for downstream RC workflows`
   Beam station extraction is now implemented with full API safety: `extract_beam_stations` / `extract_beam_stations_3d` (flat), `extract_beam_stations_grouped` / `extract_beam_stations_grouped_3d` (grouped-by-member with member-level governing summaries). Features: configurable stations per member, per-combo forces via diagram evaluation, governing pos/neg tracking with combo provenance (Optional — no phantom infinities), combo_name propagation, sign-convention metadata embedded in output, section/material metadata, WASM-exported, snapshot-tested. Remaining work:
   - 3D integration test coverage (currently 2D-only in integration tests)
   - design-ready metadata for cover assumptions once RC design integration begins

6. `Long-tail nonlinear hardening`
   Now that the linear/shell sparse base is healthier, mixed nonlinear cases become more worth attacking:
   - contact + nonlinear + staging
   - shell + nonlinear interaction
   - difficult convergence edge cases

7. `Solver-path consistency`
   Keep dense vs sparse, constrained vs unconstrained, and mixed shell/frame workflows converging to the same behavior.

8. `Product surfacing`
   Deterministic diagnostics and solve timings are now much more valuable in the app:
   - expose pivot perturbation counts and fill ratios in the UI
   - surface solve phase breakdowns for user visibility
   - make solver-path selection and fallback behavior transparent

9. `Result trust and auditability`
   A top-tier structural solver must make results easier to trust and audit:
   - reaction equilibrium summaries
   - residual / conditioning summaries
   - governing-result provenance
   - explainable solver-path and warning outputs suitable for reports and QA

10. `Constraint-system maturity`
   Finish chained constraints, connector depth, eccentric workflow polish, and remaining parity gaps.

11. `Advanced contact maturity`
   Push harder convergence, richer contact laws, and tougher mixed contact states.

12. `Reference benchmark expansion`
    Keep growing external-reference proof for contact, fiber 3D, SSI, creep/shrinkage, and broader shell workflows.
    Prefer:
    - reference cases that close real proof gaps
    - acceptance models that protect multi-feature workflows
    - regression tests for real bugs
    - performance gates that protect runtime, fill, and no-fallback expectations
    Avoid low-signal count inflation.

13. `Shell-family workflow maturity`
    Keep the shell-family selection guidance current, maintain the frontier-gate benchmarks, and only reopen shell-family expansion if the current stack proves insufficient on practical workflows.

14. `Shell-family automatic selection policy`
    Turn shell-family guidance into explicit rules the UI and model layer can use for automatic defaults, explainable recommendations, and safe override behavior.

15. `Shell-adjacent workflow breadth competitors still expose clearly`
    Add the highest-value missing shell-related workflow classes:
    - layered / laminated shell workflows
    - axisymmetric workflows
    - deeper nonlinear / corotational shell depth

16. `Native / server execution maturity`
    If Rust is the one solver, browser WASM is not enough. Native/server execution should become first-class for heavy runs, enterprise workflows, and reproducible batch analysis.

17. `Reduction, staged/PT coupling, and other second-tier depth`
    Mature the scale-oriented and long-term workflow layers after the core solver-quality gaps above are tighter.

## Current Sequence

The current near-term sequence is:

1. `Phase A: fix the WASM/frontend connection`
   Before more solver backlog depth, make the Rust/WASM path fully reliable in production:
   - one trusted deploy path
   - one trusted WASM artifact set
   - reliable 3D solve in main thread and workers
   - reliable combinations / multi-case execution
   - diagnostics strong enough to root-cause any remaining trap instead of masking it
   - production failure capture strong enough to turn a user report into a deterministic repro
   - define and satisfy the deletion gates for the TypeScript runtime solver path
   - only then remove the TypeScript solver from runtime use

2. `Design-grade RC extraction`
   Beam station extraction, grouped-by-member convenience layer, sign-convention metadata, and governing summaries are done. Remaining:
   - 3D integration test depth
   - design-ready metadata for cover assumptions and bar schedules once RC design integration begins

3. `Result trust and product-facing diagnostics`
   Expose timings, diagnostics, fill, provenance, constraint/governing outputs, and trust signals clearly enough that users can rely on and explain the solver.

4. `Runtime and scale`
   Keep eliminating the remaining measured bottlenecks in harmonic, reduction, and sparse eigensolver/reduction internals.

5. `Verification moat`
   Keep turning major solver gains into release-gated, benchmarked, acceptance-covered proof.

6. `Long-tail nonlinear hardening`
   Focus on ugly mixed cases where mature solvers still win.

7. `Solver-path consistency`
   Keep dense vs sparse and mixed-family workflows aligned.

8. `Shell-family workflow guidance and frontier tracking`
   Keep the multi-family shell stack well-guided and benchmarked.

9. `Shell-family automatic selection policy`
   Turn guidance into real default-selection logic.

10. `Shell-adjacent workflow breadth`
   Add layered shells, axisymmetric workflows, and deeper nonlinear shell depth.

## Phases And Finish Criteria

### Phase A: WASM Path Reliability And Single-Solver Convergence

Goal:
- Rust/WASM becomes the trusted primary solver path in production
- the frontend/WASM boundary is stable enough that the TypeScript solver is no longer needed at runtime

Finish means:
- production is confirmed to serve the intended branch and commit
- JS glue and `.wasm` artifacts are always built and deployed together in the same pipeline
- representative 2D and 3D example solves succeed through the WASM path in production
- worker-based and main-thread solve paths both succeed on representative 3D models
- combinations / multi-case execution succeeds through the WASM path on representative models
- the production app no longer shows raw WASM trap messages such as `unreachable`
- production failures can be captured into a reproducible solver-run artifact with build SHA and solver-path metadata
- runtime fallback to the TypeScript solver is removed from the shipped app
- no shipped UI path imports the TypeScript runtime solver for actual solving

Concrete proof:
- one named CI/deploy check that verifies the built commit SHA is the one served by the app
- one representative 2D solve and one representative 3D solve exercised through the browser-facing WASM entry points
- one representative worker/combo solve exercised through the production code path
- one reproducible failure-capture path that records build SHA, solver path, ordering, key diagnostics, and enough input/output state to replay the issue locally
- zero known production-only WASM trap regressions open
- explicit deletion checklist for the TS solver runtime path is complete

### Phase B: Runtime And Scale Dominance

Goal:
- sparse/direct and eigensolver paths decisively win on the large-model workflows that matter

Finish means:
- buckling runtime is measured on the sparse eigensolver path
- Guyan and Craig-Bampton runtime is measured after factorization reuse
- remaining harmonic bottlenecks are measured after modal-response acceleration
- reduction internals no longer densify the important `K_ff` paths unnecessarily
- CI tracks representative runtime/fill behavior on the main sparse workflows
- workflow-level timing and memory are tracked, not only kernel-level factorization timing

Concrete proof:
- runtime tables exist for modal, buckling, harmonic, Guyan, and Craig-Bampton on representative models
- sparse path wins are recorded on the target model sizes, not just factorization microbenchmarks
- no-`k_full`-overbuild expectations are enforced where applicable
- fill-ratio, no-dense-fallback, and residual-parity gates stay green in CI
- solve-to-results timing exists for representative browser/product workflows
- representative browser memory ceilings and worker startup overhead are measured

### Phase C: Verification Moat Expansion

Goal:
- major solver paths are protected by visible, release-grade proof

Finish means:
- acceptance models cover the hardest production-style linear, shell, constrained, and mixed workflows
- sparse vs dense parity is covered on representative models
- determinism gates exist where assembly / numbering / ordering should be deterministic
- invariant, property-based, and fuzz coverage exists around the sparse/shell/contact/constraint frontier
- benchmark growth stays signal-driven instead of count-driven
- public solver/output contracts are stable enough to version and protect in CI

Concrete proof:
- explicit CI gates exist for sparse shells, sparse modal/buckling/harmonic, and reduction workflows
- representative reference models exist for contact, fiber 3D, SSI, creep/shrinkage, and shell workflows
- parity and residual thresholds are written down and enforced
- doctests and release-mode smoke tests are part of CI, not local-only habits
- contract/snapshot CI exists for public solver payloads that product code depends on

### Phase D: Design-Grade Extraction For RC Workflows

Goal:
- solver outputs are complete and stable enough for RC design, schedules, and later BBS work

Finish means:
- beam station extraction is stable in 2D and 3D through the WASM surface
- grouped-by-member convenience outputs are stable enough for product use
- governing metadata, sign conventions, and provenance are explicit and documented
- integration coverage exists for the 3D extraction path
- remaining metadata needed by RC design is explicit once cover/bar-detail assumptions begin
- result contracts are versioned or otherwise evolution-safe for downstream consumers

Concrete proof:
- contract/snapshot tests protect the serialized payload shape
- 2D and 3D integration tests exercise full solve-to-extraction paths
- governing outputs never emit phantom combos or sentinel infinities
- product code can consume station data without reconstructing solver semantics from raw arrays
- payload/schema evolution rules are documented and enforced by tests

### Phase E: Long-Tail Nonlinear Hardening And Solver-Path Consistency

Goal:
- ugly mixed workflows stop being the place where mature solvers obviously outperform Dedaliano

Finish means:
- mixed shell + nonlinear regressions exist and stay green
- contact + nonlinear + staging regressions exist and stay green
- difficult convergence cases have predictable behavior and clearer failure modes
- dense vs sparse, constrained vs unconstrained, and mixed frame/shell workflows stay aligned

Concrete proof:
- named regressions exist for the hard mixed workflows above
- parity expectations are encoded for representative dense vs sparse and constrained vs unconstrained cases
- solver-path-specific result divergences are treated as regressions, not expected quirks
- known nonlinear edge cases have acceptance coverage instead of only anecdotal reproduction

### Phase F: Result Trust, Auditability, And Model Quality Gates

Goal:
- the solver becomes easier to trust before and after a run, not only numerically stronger internally

Finish means:
- bad models are caught earlier with clear pre-solve diagnostics
- result outputs expose enough equilibrium / residual / provenance information for QA and reporting
- user-visible warnings are tied to actual solver evidence rather than generic failure text

Concrete proof:
- pre-solve checks exist for disconnected subgraphs, instability risk, poor constraints, duplicate/near-duplicate nodes, shell distortion / Jacobian risk, and suspicious local-axis setups
- result payloads expose equilibrium/residual/conditioning summaries on representative workflows
- solver-run artifacts can be attached to bug reports and reviewed by engineering without manual reconstruction

### Phase G: Shell Workflow Maturity And Breadth

Goal:
- the multi-family shell stack is not only broad, but guided, benchmarked, and hard to misuse

Finish means:
- shell-family guidance is explicit enough for automatic defaults and explainable override behavior
- frontier-gate shell benchmarks stay current across the active families
- the highest-value remaining shell-adjacent workflow gaps are closed:
  - layered / laminated shells
  - axisymmetric workflows
  - deeper nonlinear / corotational shell depth

Concrete proof:
- shell-family selection rules are written and exercised in the product/model layer
- frontier benchmarks exist for the active shell families on the workflows they are meant to cover
- layered, axisymmetric, and deeper nonlinear shell workflows each have at least one reference/acceptance case
- shell-family expansion is not reopened unless the current stack fails on practical workflows

### Phase H: Native / Server Execution Maturity

Goal:
- Rust runs as one solver across browser and native/server contexts, not just as a browser WASM artifact

Finish means:
- representative heavy workflows can run natively/server-side using the same solver codebase
- native/browser parity is checked on representative cases
- server/batch execution is reproducible enough for long analyses, reports, and enterprise workflows

Concrete proof:
- at least one named native/server execution path exists and is tested
- representative browser vs native parity cases are green
- heavy-model or long-running workflow(s) have a documented native/server execution recommendation

### Phase I: Dynamic Analysis Solvers

Goal:
- full dynamic time-history and pushover analysis capability, matching OpenSees on the common 80% of earthquake engineering work

Solver work:

**Time integration:**
- **Newmark-β method** — implicit unconditionally stable (β=1/4, γ=1/2), consistent and lumped mass matrix support
- **HHT-α method** — numerical dissipation for high-frequency noise, α ∈ [-1/3, 0]
- **Explicit dynamics** (central difference) — matrix-free element force evaluation (never assemble K), conditionally stable with critical Δt
- **Consistent mass matrix** — already have lumped; add consistent for Newmark accuracy
- **Lumped mass with rotational inertia** — rotational DOF mass terms for torsional mode accuracy
- **Nonlinear dynamics** — Newton-Raphson within each time step, material + geometric nonlinearity
- **Operator-splitting** — separate nonlinear solve from time integration for efficiency

**Damping models:**
- **Rayleigh damping** — α·M + β·K (mass + stiffness proportional)
- **Modal damping** — per-mode damping ratios applied in modal coordinates
- **Caughey damping** — generalized Rayleigh matching damping ratios at more than 2 frequencies
- **Frequency-dependent damping** — G(f) for viscoelastic components and harmonic response
- **Non-proportional damping** — complex eigenvalue analysis for structures with discrete dampers or mixed materials
- **Material-specific structural damping** — frequency-independent loss factor approach (hysteretic damping)

**Controls and output:**
- **Energy balance check** — detect numerical instability via energy drift monitoring
- **Adaptive time stepping** — reduce Δt on slow convergence, increase on fast convergence
- **Restart/checkpoint** — save and resume long dynamic analyses from intermediate state
- **Ground motion input** — acceleration time-history loading applied as base excitation
- **Response history extraction** — displacement, velocity, acceleration at selected nodes/DOFs
- **Random vibration / PSD analysis** — power spectral density input for wind/wave/traffic, response PSD and RMS extraction

**Response spectrum enhancements:**
- **CQC3** — three-component earthquake combination
- **SRSS, CQC, GMC, Gupta** methods — full set of modal combination rules
- **Missing mass correction** — static correction for high-frequency truncated modes

Finish means:
- linear Newmark-β and HHT-α pass known analytical solutions (SDOF free vibration, step load, harmonic forcing)
- nonlinear dynamic passes OpenSees-comparable benchmarks (RC column pushover, steel frame cyclic)
- energy balance stays within tolerance across all dynamic benchmarks
- adaptive stepping reduces total cost on variable-difficulty problems
- complex eigenvalue analysis with non-proportional damping matches known solutions
- PSD-driven random vibration matches Nastran/SAP2000 on standard benchmark cases

### Phase J: Nonlinear Material Models

Goal:
- realistic material behavior for concrete, steel, and general path-dependent materials, enabling practical RC and steel nonlinear analysis

Solver work:

**Computational plasticity framework:**
- **General return mapping algorithm** — yield surface, flow rule, hardening law, closest-point projection, consistent tangent operator
- **J2 (von Mises) plasticity** — general framework with isotropic/kinematic/mixed hardening
- **Isotropic hardening** — Voce, linear, power-law, tabular
- **Kinematic hardening** — Armstrong-Frederick, Chaboche multi-backstress
- **Substepping for material integration** — substep strain increment at Gauss point level when return mapping fails, rather than cutting global load step

**Material state framework:**
- material state management — commit/revert/copy for path-dependent materials
- fiber section with multiple materials — concrete core + cover + rebar in single section
- 3D fiber section — biaxial bending (ε₀, κy, κz) for fiber beam-column
- moment-curvature analysis — section-level stress-strain integration
- M-N-V interaction — full interaction surface generation from fiber section
- **User-defined material interface (UMAT-equivalent)** — callback or plugin API for custom constitutive models without modifying solver source

**Concrete models:**
- **Kent-Park / modified Kent-Park** — confined/unconfined compression with degrading stiffness
- **Mander confined concrete** — circular/rectangular confinement, strain at peak stress function of confinement ratio
- **Concrete02** — tension stiffening with linear tension softening
- **Concrete damage plasticity** (CDP) — isotropic damage + plasticity (Abaqus-equivalent formulation)
- **fib Model Code 2010** — code-compliant stress-strain curves
- **Eurocode 2 parabola-rectangle** — design stress-strain with partial safety factors
- **Smeared/rotating crack model** — fixed or rotating crack with tension cutoff and shear retention for RC shells/walls
- **Damage mechanics** (Mazars, Lemaitre) — continuum damage tracking stiffness degradation

**Steel models:**
- **Bilinear steel** — elastic-perfectly-plastic and elastic-strain-hardening
- **Menegotto-Pinto (Steel02)** — smooth hysteretic with Bauschinger effect, isotropic hardening
- **Giuffré-Menegotto-Pinto** — combined isotropic + kinematic hardening
- **Steel4** — asymmetric tension/compression, ultimate stress, fracture strain

**Geotechnical materials:**
- **Drucker-Prager plasticity** — pressure-dependent yield for soil, rock, concrete under multiaxial stress
- **Mohr-Coulomb plasticity** — the most common soil constitutive model
- **Modified Cam-Clay** — critical-state soil model for clay (settlement, embankments, excavations)

**General constitutive support:**
- **Orthotropic/anisotropic elasticity** — for timber, masonry, composites, geological materials
- hyperelastic (Neo-Hookean, Mooney-Rivlin) — rubber bearings, seismic isolators
- creep & shrinkage (ACI 209, fib MC 2010, CEB-FIP) — long-term time-dependent effects
- viscoelastic (Kelvin-Voigt, Maxwell) — viscous dampers, soil
- fatigue (Coffin-Manson, rainflow counting, Palmgren-Miner cumulative damage) — low-cycle and high-cycle fatigue assessment

Finish means:
- each uniaxial material passes cyclic stress-strain verification against published curves
- fiber sections with mixed concrete+steel reproduce known moment-curvature responses
- Mander model matches confinement-dependent peak stress and strain within 2% of analytical formulas
- hysteretic energy dissipation matches reference solutions under cyclic loading
- return mapping converges on all standard plasticity benchmarks (thick cylinder, notched bar, Cook's membrane)
- Drucker-Prager/Mohr-Coulomb reproduce bearing capacity and slope stability results within 5% of analytical solutions
- UMAT interface allows external material definition without recompiling the solver

### Phase K: Pushover Analysis

Goal:
- static pushover for seismic assessment, with capacity spectrum and performance point identification

Solver work:

**Pushover methods:**
- **Displacement-controlled pushover** — monotonic lateral load pattern with arc-length or displacement control
- **Load patterns** — inverted triangular, uniform, code-specific (EC8, ASCE 7) modal-proportional
- **Plastic hinge tracking** — monitor and record sequence of hinge formation, ductility demand per step
- **Capacity curve extraction** — base shear vs roof displacement, bilinear idealization
- **Capacity spectrum method** (ATC-40 / FEMA 440) — convert to ADRS format, find performance point
- **N2 method** (Eurocode 8) — SDOF equivalent, target displacement from elastic spectrum
- **Multi-modal pushover** (MPA) — run separate pushovers per mode, combine via SRSS

**Concentrated plasticity elements:**
- **Plastic hinge beam element** — concentrated plasticity at member ends for building-scale pushover (faster than distributed plasticity)
- **Multi-linear moment-rotation hinges** — user-defined or code-based backbone curves
- **FEMA 356/ASCE 41 hinge tables** — predefined hinge properties for concrete beams/columns, steel beams/columns, and steel braces
- **Fiber hinge** — fiber-section-based hinge with automatic backbone curve generation

Finish means:
- pushover on known benchmark frames matches published capacity curves
- performance point identification agrees with hand calculations on standard SDOF/MDOF cases
- plastic hinge sequence matches expected failure mode for standard frame configurations
- concentrated plasticity hinge matches distributed plasticity within expected accuracy for standard frames

### Phase L: Advanced Element Library

Goal:
- element families needed for specialized structural analysis beyond frames and shells — closing every element gap against Abaqus, OpenSees, and Code_Aster

Solver work:

**Advanced beam elements:**
- **Force-based beam-column element** — satisfies equilibrium exactly, converges with one element per member, gold standard for nonlinear frame analysis (what makes OpenSees dominant)
- **Timoshenko beam with warping DOF (7-DOF)** — essential for open thin-walled sections (channels, angles, Z-sections) where warping torsion dominates
- **Beam with Vlasov theory** — bimoment, warping, shear center offset for thin-walled stability analysis
- **Tapered elements** — variable cross-section beams with interpolated section properties
- **Curved beams** — in-plane and out-of-plane curved beam elements
- **Beam rigid end zones / offsets** — finite joint size modeling for correct moment diagrams near connections
- **Mixed formulation beams** (Hellinger-Reissner) — avoids shear locking in deep beams

**Shell elements for meshing freedom:**
- **Full shell triangle (MITC3/DSG3)** — membrane+bending+drilling in a single triangular element for auto-meshed geometries with holes, transitions, irregular boundaries
- **6-node triangular shell (MITC6/STRI65)** — higher-order triangle matching MITC9 quad for p-refinement
- **Axisymmetric shell of revolution element** — 1D line element generating shells of revolution (tanks, silos, pressure vessels, cooling towers) without full 3D meshing
- **Continuum shell elements (SC6R, SC8R)** — 3D connectivity with shell kinematics for composite ply stacking and shell-solid transitions
- **Thick shell formulation** — full Reissner-Mindlin for very thick shells (R/t < 5) with through-thickness shear and normal stress
- **Composite laminate failure criteria** — Tsai-Wu, Tsai-Hill, Hashin, Puck for ply-by-ply failure assessment in layered shells

**Special structural elements:**
- **Seismic isolator elements** — bilinear hysteretic, friction pendulum (velocity-dependent)
- **Viscous damper elements** — velocity-dependent force (F = C·v^α)
- **Buckling-restrained braces (BRB)** — backbone curve + hysteresis with compression overstrength
- **Panel zone elements** — beam-column joint flexibility (Krawinkler model)
- **Infill wall elements** — equivalent diagonal strut (Crisafulli model)
- **Gap/hook elements** — compression-only or tension-only springs for foundations, expansion joints, bearings
- **Cohesive zone elements** — traction-separation laws for delamination, debonding, concrete-rebar bond, fracture propagation

**Cable & tension structures:**
- **Full catenary element** — exact catenary stiffness matrix (not Ernst approximation)
- **Form-finding** — force density method, dynamic relaxation for cable/membrane structures
- **Membrane elements** — tension-only triangular membranes for fabric structures

**3D solid elements:**
- **8-node hex (C3D8)** — standard trilinear brick with B-bar or selective reduced integration
- **20-node hex (C3D20)** — serendipity quadratic brick
- **4-node tet (C3D4)** — linear tetrahedron (constant strain)
- **10-node tet (C3D10)** — quadratic tetrahedron
- **Embedded elements** — embed beam (rebar) inside solid/shell without matching meshes, essential for RC solid modeling

Finish means:
- force-based beam matches OpenSees forceBeamColumn on RC column cyclic tests within 2%
- warping beam produces correct warping stresses and bimoment on channel/Z-section benchmarks
- MITC3 triangle passes patch tests and converges on standard shell benchmarks
- isolator element reproduces published bilinear hysteresis loops within 2%
- BRB element matches published backbone curves and cyclic energy dissipation
- catenary element matches exact catenary solution for cable under self-weight
- solid elements pass patch tests and converge on known elasticity benchmarks
- cohesive zone elements reproduce mode I/II/mixed-mode delamination benchmarks
- Tsai-Wu/Hashin failure in layered shells matches published composite failure loads

### Phase M: Thermal, Fire, Fatigue & Progressive Collapse

Goal:
- temperature-dependent structural analysis, fatigue assessment, and automated member removal for robustness checks

Solver work:

**Thermal stress analysis (general):**
- **Steady-state thermal** — thermal gradients in bridge decks, solar radiation effects, seasonal temperature variations
- **Transient thermal** — time-varying temperature fields through sections
- **Coupled thermo-mechanical (sequential)** — solve thermal → apply degraded properties or thermal strains → structural solve
- **Coupled thermo-mechanical (two-way)** — structural deformation affects heat flow (for extreme deformation scenarios)

**Fire analysis:**
- **Standard fire curves** — ISO 834, ASTM E119, hydrocarbon curve as time-temperature input
- **Parametric fire curves** — Eurocode 1-1-2 compartment fire model
- **Temperature-dependent material properties** — reduced E, fy, fc per EC2/EC3/EC4 fire parts
- **Thermal analysis** — 1D lumped parameter or 2D FE heat transfer through sections

**Fatigue analysis:**
- **Rainflow cycle counting** — extract stress cycles from time-history results
- **S-N curve library** — detail categories per EC3-1-9, AISC Design Guide 27, DNV-RP-C203, IIW
- **Palmgren-Miner cumulative damage** — linear damage accumulation across cycle ranges
- **Stress-life and strain-life methods** — high-cycle (S-N) and low-cycle (ε-N / Coffin-Manson)
- **Fatigue hot-spot stress extrapolation** — surface stress extrapolation to weld toes per IIW/DNV for welded connections
- **Weld assessment support** — effective notch stress, structural stress, weld category selection

**Progressive collapse:**
- **Automatic member removal** — systematic removal of one vertical element at a time
- **Dynamic amplification** — 2.0 factor for linear static per GSA/UFC 4-023-03
- **Nonlinear static alternate path** — remove element, solve with nonlinear geometry + material
- **Catenary action** — large-displacement analysis to capture tensile membrane resistance after member loss
- **Acceptance criteria evaluation** — rotation limits, ductility demands per member per GSA guidelines

Finish means:
- material property reduction curves match EC2/EC3 tabulated values at standard temperatures
- structural response under ISO 834 matches published fire analysis benchmarks
- member removal + nonlinear re-analysis produces stable results on standard frame configurations
- dynamic amplification factor approach matches nonlinear dynamic results within expected accuracy bounds
- rainflow counting matches ASTM E1049 reference cases
- fatigue damage accumulation matches hand calculations for standard detail categories
- thermal stress from bridge deck gradients matches known analytical solutions

### Phase N: Automatic Load Generation (Solver Support)

Goal:
- solver-side infrastructure for code-based automatic load generation

Solver work:
- **Wind pressure computation** — velocity pressure profiles (Kz, qz) from terrain/exposure parameters per ASCE 7 and EC1
- **Seismic force distribution** — equivalent lateral force procedure (base shear, vertical distribution, accidental torsion) per EC8/ASCE 7/NCh 433
- **Snow load computation** — ground-to-roof conversion with drift/sliding factors per EC1-1-3/ASCE 7
- **Live load pattern generation** — automatic checkerboard and adjacent-span pattern combinations
- **Surface pressure mapping** — map computed pressures to shell/plate element face loads based on surface orientation

Finish means:
- ELF base shear and vertical distribution match hand calculations for standard building configurations
- wind pressure profiles match tabulated code values within rounding tolerance
- pattern loading generates correct unfavorable arrangements for continuous beams

### Phase O: Performance & Scale (Numerical Methods, Parallelism, GPU)

Goal:
- handle 100k+ DOF models in-browser, scale to millions of DOFs on native/server, and enable topology optimization inner loops

Solver work:

**Iterative solvers:**
- **Preconditioned CG** — Jacobi and IC(0) preconditioners for SPD systems
- **GMRES / MINRES** — for indefinite and non-symmetric systems (contact, buckling)
- **Algebraic multigrid (AMG) preconditioner** — the only preconditioner that scales to millions of DOFs for shell/solid systems; Jacobi/IC(0) are insufficient for large ill-conditioned problems
- **Hybrid direct-iterative** — direct for small/medium, iterative for large, automatic selection

**Direct solver improvements:**
- **Multi-frontal solver** — tree-level parallelism, industry standard for large sparse direct solves (like MUMPS, PaStiX)
- **Nested dissection ordering** — via METIS/SCOTCH integration, asymptotically optimal fill for 2D/3D meshes (better than AMD for large models)
- **Supernodal Cholesky** — block-column factorization for cache utilization on large models
- **Sparse mass matrix** — enable fully-sparse K⁻¹Mx eigensolver paths

**Eigensolver improvements:**
- **Block eigensolvers** — LOBPCG / block Lanczos for many-mode problems

**Large-deformation formulations:**
- **Total Lagrangian (TL) formulation** — reference undeformed configuration, needed for continuum elements under large strain (rubber, soil, hyperelastic)
- **Updated Lagrangian (UL) formulation** — reference last converged configuration, standard for metal forming, progressive collapse, very large deformations

**Parallelism and hardware:**
- **Domain decomposition (FETI, Balancing DD)** — algorithmic decomposition for multi-core and distributed scaling beyond 100k DOFs
- **WebGPU compute shaders** — parallel element stiffness evaluation, postprocessing kernels, sparse mat-vec
- **Web Workers** — parallel assembly across multiple cores (beyond current rayon)

**Solver robustness at scale:**
- **Dissipation-based stabilization** — artificial viscous damping for local instabilities (snap-through of individual elements in shell buckling, concrete cracking) with energy tracking to ensure dissipation stays small
- **Trust region methods** — alternative to line search for nonlinear convergence, more robust for sudden stiffness changes (contact, damage)
- **Predictor-corrector refinements** — secant/tangent/arc-length predictor with normal plane/cylindrical arc corrector for snap-through/snap-back tracking
- **Branch switching at bifurcation** — detect limit and bifurcation points, switch branches for post-buckling path tracing
- **Automatic increment control** — smart step size based on convergence rate, energy criterion, contact status changes (not just pass/fail)
- **Initial stress / initial strain method** — separate equilibrium iteration from expensive constitutive update

Finish means:
- PCG converges on representative shell models with IC(0) preconditioning
- AMG-preconditioned iterative solver converges on 1M DOF shell/solid models
- multi-frontal solver with nested dissection shows measurable speedup over current left-looking supernodal on large models
- hybrid solver automatically selects iterative above measured crossover point
- WebGPU element evaluation shows measurable speedup on large uniform shell meshes
- 100k DOF models solve in-browser within reasonable time (< 60s)
- TL/UL formulations pass large-strain benchmarks (rubber block, thick cylinder, metal forming)
- domain decomposition shows near-linear scaling on multi-core for models above 500k DOFs

### Phase P: Optimization Solver Support

Goal:
- solver-level infrastructure for structural optimization workflows

Solver work:
- **Sensitivity analysis** — analytical or semi-analytical design sensitivities (dK/dx, dM/dx)
- **SIMP topology optimization** — density-based with penalization, OC or MMA update
- **Adjoint method** — efficient gradient computation for many design variables
- **Eigenvalue sensitivity** — for frequency-constrained optimization
- **Stress constraints** — p-norm aggregation for global stress constraint handling

Finish means:
- analytical sensitivities match finite-difference sensitivities within 1e-4 relative error
- SIMP on MBB beam and cantilever benchmarks converges to known topologies
- frequency-constrained optimization shifts target modes as expected

### Phase Q: Reliability & Probabilistic Analysis

Goal:
- solver support for probabilistic structural assessment

Solver work:
- **Parameterized analysis** — solver accepts parameter vectors for material/geometry/load uncertainty
- **FORM/SORM** — first/second-order reliability methods via gradient-based search
- **Monte Carlo** — batch solver execution with random parameter sampling
- **Importance sampling** — variance reduction for rare failure events
- **Subset simulation** — efficient estimation of small failure probabilities
- **Batch execution API** — run N analyses with different parameter sets efficiently (reuse symbolic factorization)

Finish means:
- FORM reliability index matches analytical solution for known limit-state functions
- Monte Carlo failure probability converges to FORM result with sufficient samples
- batch execution reuses symbolic factorization across parameter variations

### Phase R: Contact, Interface & Constraint Depth

Goal:
- contact and constraint capabilities matching Abaqus and Code_Aster for practical multi-part structural models

Solver work:

**Contact enforcement:**
- **Augmented Lagrangian contact** — eliminates penetration without very high penalty stiffness
- **Mortar contact** — variationally consistent, passes patch test, accurate stress transfer across non-matching meshes
- **Friction models** — Coulomb with proper slip/stick detection, exponential (velocity-dependent), anisotropic friction
- **Self-contact** — surface contacting itself during large deformation (pipe buckling, shell folding)

**Interface elements:**
- **Cohesive zone models (CZM)** — traction-separation laws for delamination, debonding, and fracture propagation
- **Tie constraints (surface-based mesh tying)** — connect non-matching meshes without shared nodes for multi-part assemblies

**Advanced constraints:**
- **Shell-to-solid coupling** — kinematically consistent connection between shell and solid regions for mixed-dimension models
- **Beam-to-shell connection with offset** — connect beam flanges/webs to shell elements for detailed joint modeling
- **Embedded elements** — embed beams (rebar) inside solids/shells without matching meshes for RC modeling
- **Distributed coupling (RBE3-equivalent)** — distribute load to nodes weighted by area/distance, not rigid
- **Kinematic coupling with DOF selection** — rigid constraint on selected DOFs at a surface
- **General linear MPC equations** — user-defined u_i = Σ(a_j · u_j) + b for arbitrary DOF relationships
- **Periodic boundary conditions** — for RVE homogenization and structures with repeating geometry
- **Automatic symmetry/antisymmetry constraints** — automatic BCs on cut planes for 2×-8× model size reduction

Finish means:
- augmented Lagrangian contact matches Hertz contact analytical solution within 1%
- mortar contact passes patch test on non-matching meshes
- shell-to-solid coupling produces continuous displacement/stress at interface
- embedded rebar in concrete solid matches reference RC beam solutions
- periodic BCs reproduce known homogenization results for composite RVEs

### Phase S: Design-Oriented Post-Processing

Goal:
- solver-level result extraction and transformation that enables practical design workflows for RC slabs, steel connections, pressure vessels, and fatigue assessment

Solver work:

**Shell design results:**
- **Wood-Armer moments** — transform shell (Mx, My, Mxy) into design moments for orthogonal reinforcement in RC slabs
- **Nodal force summation / section cuts** — sum internal forces across arbitrary cutting planes through shell/solid models
- **Result envelopes for shells** — max/min stress/force at every node across all load combinations (beam envelopes exist; extend to shells)
- **Design-oriented result transformation** — transform to reinforcement directions, principal stress directions, or user-defined local directions
- **Influence surface generation** — influence surfaces for slabs/decks under moving loads (bridges)
- **Crack width estimation** — estimate crack widths in RC shells/slabs from reinforcement strains per EC2/ACI 318
- **Punching shear perimeter detection** — automatic column perimeter detection in flat slabs with code-check per ACI 318/EC2

**Stress processing:**
- **Stress linearization** — decompose through-thickness stress into membrane + bending + peak components per ASME VIII Div.2 / EN 13445 for pressure vessel design
- **Result smoothing / averaging control** — nodal averaging by material, by element type, by angle threshold to prevent incorrect averaging at material boundaries
- **Superconvergent patch recovery (SPR)** — Zienkiewicz-Zhu stress smoothing for improved accuracy and error estimation

**Analysis workflow support:**
- **Submodeling / global-local analysis** — run coarse global model, extract boundary displacements, drive refined local model for connections, fatigue hot spots, stress concentrations
- **Nonlinear post-buckling workflow** — imperfection seeding from linear buckling modes, arc-length tracing of post-buckling path, knockdown factor extraction
- **Construction sequence with time-dependent interaction** — creep/shrinkage/relaxation interaction between stages, tendon loss tracking, segmental bridge workflows

**Error estimation:**
- **ZZ error estimator** — Zienkiewicz-Zhu a-posteriori error for mesh adequacy guidance
- **h-refinement indicators** — element-level error indicators for adaptive mesh refinement

Finish means:
- Wood-Armer moments match hand calculations on standard slab cases
- section cut forces satisfy global equilibrium to machine precision
- stress linearization matches ASME benchmark cases
- submodel boundary displacements produce stress results within 5% of fully-refined global model
- error estimator reliably identifies under-refined regions

## Full Backlog

### Phases A–H (Core Solver Quality)

1. Measure buckling runtime on the sparse eigensolver path
2. Measure Guyan runtime after factorization reuse
3. Measure Craig-Bampton runtime after factorization reuse and interior-mode fix
4. Optimize the harmonic frequency sweep path further if modal-response still leaves big wins on the table
5. ~~Add deterministic beam station-force extraction for RC design~~ — DONE
6. ~~Add governing-combination extraction for beam design checks and schedules~~ — DONE (grouped-by-member layer with member-level governing summaries)
7. ~~Add design-grade result metadata and provenance for downstream RC workflows~~ — DONE (sign-convention metadata, combo_name propagation, Optional governing entries)
8. ~~Add regression/parity fixtures for RC-ready beam envelopes and sign conventions~~ — DONE (snapshot test, integration tests, 21 total tests)
9. Deepen sparse eigensolver integration in reduction workflows
10. Fix the Lanczos tridiagonal eigensolver properly everywhere it still falls back
11. Add broader sparse shift-invert support
12. Add runtime gates for modal, buckling, harmonic, Guyan, and Craig-Bampton
13. Add no-`k_full`-overbuild gates everywhere they apply
14. Add stronger fill-ratio and determinism gates on the sparse path
15. Expand sparse/dense residual-parity coverage on harder shell and mixed models
16. Harden mixed shell + nonlinear workflows
17. Harden contact + nonlinear + staging workflows
18. ~~Add `Modified Newton`~~ — DONE (corotational 2D/3D + fiber 2D/3D; caches Cholesky from iter 0; not a universal default, useful where factorization cost dominates and material nonlinearity is moderate; full NR remains more robust in geometric nonlinearity and deep plasticity)
19. Add iterative refinement before any remaining expensive fallback path
20. Add `PCG` with `Jacobi` preconditioning
21. Add stronger preconditioners like `IC(0)` / `SSOR` if justified by measurements
22. Implement shell-family automatic selection in the solver/model layer
23. Add layered / laminated shell workflows
24. Add axisymmetric workflows
25. Deepen nonlinear / corotational shell workflows
26. Add quasi-Newton methods such as `BFGS`, `L-BFGS`, and `Broyden`
27. Add `GMRES` / `MINRES` for indefinite systems
28. Add block eigensolvers such as `LOBPCG` / block Lanczos
29. Deepen layered/composite shell constitutive behavior
30. Add richer prestress tendon / relaxation workflows
31. Add bridge-specific staged / moving-load workflow depth
32. Add production solver-run artifact capture with build SHA, solver path, ordering, and diagnostics
33. Add deterministic repro-bundle export for production failures
34. Add versioned / contract-tested public solver payloads
35. Add workflow-level timing and browser memory baselines, not only kernel microbenchmarks
36. Add explicit TypeScript-solver deletion checklist and migration gates
37. Add native / server execution parity and batch-run coverage
38. Add pre-solve model quality gates for instability risk, duplicate nodes, bad constraints, and shell distortion risk
39. Add result audit summaries: equilibrium, residual, conditioning, and governing provenance

### Phase I (Dynamic Analysis)

40. Implement Newmark-β implicit time integration (β=1/4, γ=1/2)
41. Implement HHT-α method with numerical dissipation control
42. Implement explicit central difference method with critical Δt calculation
43. Add Rayleigh damping (α·M + β·K) to all dynamic solvers
44. Add modal damping with per-mode damping ratios
45. Implement consistent mass matrix alongside existing lumped mass
46. Add nonlinear dynamics (Newton-Raphson within time steps)
47. Add operator-splitting for efficiency in nonlinear dynamics
48. Implement energy balance monitoring for numerical stability detection
49. Add adaptive time stepping based on convergence behavior
50. Implement checkpoint/restart for long dynamic analyses
51. Add ground motion input as base excitation
52. Add response history extraction at selected nodes/DOFs

### Phase J (Nonlinear Materials)

53. Implement material state management (commit/revert/copy) framework
54. Implement Kent-Park / modified Kent-Park confined/unconfined concrete
55. Implement Mander confined concrete model
56. Implement Concrete02 with tension stiffening
57. Implement concrete damage plasticity (CDP)
58. Implement fib Model Code 2010 stress-strain curves
59. Implement Eurocode 2 parabola-rectangle design curves
60. Implement bilinear steel (elastic-perfectly-plastic, strain-hardening)
61. Implement Menegotto-Pinto (Steel02) hysteretic model
62. Implement Giuffré-Menegotto-Pinto combined hardening
63. Implement Steel4 with asymmetric behavior and fracture
64. Add fiber section with multiple materials (concrete core + cover + rebar)
65. Add 3D fiber section (biaxial bending: ε₀, κy, κz)
66. Add moment-curvature analysis from fiber section integration
67. Add M-N-V interaction surface generation

### Phase K (Pushover)

68. Implement displacement-controlled pushover with arc-length control
69. Add load patterns: inverted triangular, uniform, modal-proportional (EC8, ASCE 7)
70. Add plastic hinge tracking with ductility demand per step
71. Implement capacity curve extraction with bilinear idealization
72. Implement capacity spectrum method (ATC-40 / FEMA 440)
73. Implement N2 method (Eurocode 8)
74. Implement multi-modal pushover analysis (MPA)

### Phase L (Advanced Elements)

75. Implement seismic isolator elements (bilinear, friction pendulum)
76. Implement viscous damper elements (F = C·v^α)
77. Implement BRB elements with backbone curve and hysteresis
78. Implement panel zone elements (Krawinkler model)
79. Implement infill wall elements (equivalent diagonal strut)
80. Implement full catenary element (exact stiffness, not Ernst)
81. Add form-finding (force density, dynamic relaxation)
82. Add membrane elements for fabric structures
83. Add tapered beam elements
84. Add curved beam elements
85. Add 3D solid elements (C3D8, C3D20, C3D4, C3D10) — later priority

### Phase M (Fire & Progressive Collapse)

86. Implement standard fire curves (ISO 834, ASTM E119, hydrocarbon)
87. Implement parametric fire curves (EC1-1-2)
88. Add temperature-dependent material properties per EC2/EC3/EC4
89. Implement 1D/2D thermal analysis through sections
90. Add coupled thermo-mechanical sequential analysis
91. Implement automatic member removal for progressive collapse
92. Add dynamic amplification factor per GSA/UFC
93. Add nonlinear static alternate path analysis
94. Add catenary action (large-displacement tensile membrane)
95. Add acceptance criteria evaluation per GSA guidelines

### Phase N (Automatic Load Generation)

96. Implement wind pressure computation (ASCE 7, EC1)
97. Implement seismic ELF distribution (EC8, ASCE 7, NCh 433)
98. Implement snow load computation (EC1-1-3, ASCE 7)
99. Add live load pattern generation (checkerboard, adjacent-span)
100. Add surface pressure mapping to element face loads

### Phase O (Performance & Scale)

101. Implement PCG with Jacobi and IC(0) preconditioners
102. Implement GMRES / MINRES for indefinite systems
103. Add hybrid direct-iterative solver with automatic selection
104. Add block eigensolvers (LOBPCG / block Lanczos)
105. Implement WebGPU compute shaders for element stiffness and mat-vec
106. Add Web Workers for parallel assembly
107. Add sparse mass matrix for fully-sparse eigensolver paths
108. Implement supernodal Cholesky for cache utilization

### Phase P (Optimization)

109. Implement analytical design sensitivities (dK/dx, dM/dx)
110. Implement SIMP topology optimization with OC/MMA update
111. Add adjoint method for efficient gradient computation
112. Add eigenvalue sensitivity for frequency-constrained optimization
113. Add p-norm stress constraint aggregation

### Phase Q (Reliability & Probabilistic)

114. Add parameterized solver for material/geometry/load uncertainty
115. Implement FORM/SORM reliability methods
116. Add Monte Carlo batch solver execution
117. Add importance sampling for rare failure events
118. Implement subset simulation
119. Add batch execution API with symbolic factorization reuse

### Phase R (Contact, Interface & Constraints)

120. Implement augmented Lagrangian contact enforcement
121. Implement mortar contact for non-matching meshes
122. Add Coulomb friction with proper slip/stick detection
123. Add self-contact for large deformation (pipe buckling, shell folding)
124. Implement cohesive zone elements (traction-separation for delamination/debonding)
125. Add tie constraints for multi-part assemblies with non-matching meshes
126. Implement shell-to-solid coupling constraints
127. Add beam-to-shell connection with offset
128. Implement embedded elements (rebar in concrete solids/shells)
129. Add distributed coupling (RBE3-equivalent)
130. Add kinematic coupling with DOF selection
131. Add general linear MPC equations (u_i = Σ(a_j · u_j) + b)
132. Implement periodic boundary conditions for RVE homogenization
133. Add automatic symmetry/antisymmetry constraints on cut planes

### Phase S (Design-Oriented Post-Processing)

134. Implement Wood-Armer moments for RC slab design from shell results
135. Add nodal force summation / section cuts through shell/solid models
136. Implement shell result envelopes across load combinations
137. Add design-oriented result transformation to reinforcement/principal/user directions
138. Add influence surface generation for slabs under moving loads
139. Implement crack width estimation from shell reinforcement strains (EC2/ACI 318)
140. Add automatic punching shear perimeter detection and code-check
141. Implement stress linearization (membrane+bending+peak per ASME/EN 13445)
142. Add result smoothing/averaging control by material, type, and angle threshold
143. Implement superconvergent patch recovery (SPR / Zienkiewicz-Zhu)
144. Add submodeling / global-local analysis workflow
145. Add nonlinear post-buckling workflow (imperfection seeding, arc-length, knockdown)
146. Add construction sequence with creep/shrinkage/relaxation interaction between stages
147. Implement ZZ error estimator for mesh adequacy guidance
148. Add h-refinement indicators from element-level error estimates

### Cross-Phase Items

149. Implement general return mapping algorithm (yield surface, flow rule, hardening, consistent tangent)
150. Add Caughey damping (generalized Rayleigh for more than 2 target frequencies)
151. Add frequency-dependent and non-proportional damping with complex eigenvalue analysis
152. Add random vibration / PSD analysis (wind/wave/traffic excitation)
153. Add response spectrum CQC3, GMC, Gupta methods and missing mass correction
154. Implement force-based beam-column element (OpenSees-equivalent)
155. Add Timoshenko beam with warping DOF (7-DOF) for open thin-walled sections
156. Add full shell triangle (MITC3/DSG3 with membrane+bending+drilling)
157. Add 6-node triangular shell (MITC6/STRI65)
158. Implement composite laminate failure criteria (Tsai-Wu, Tsai-Hill, Hashin, Puck)
159. Add UMAT-equivalent user-defined material interface
160. Implement Drucker-Prager and Mohr-Coulomb plasticity for geotechnical analysis
161. Implement Modified Cam-Clay for clay soils
162. Add orthotropic/anisotropic elasticity for timber, masonry, composites
163. Implement Total Lagrangian and Updated Lagrangian large-strain formulations
164. Add multi-frontal solver with nested dissection ordering
165. Implement AMG preconditioner for million-DOF models
166. Add domain decomposition (FETI) for distributed parallelism
167. Add smeared/rotating crack and damage mechanics models (Mazars, Lemaitre)
168. Implement Gauss-point substepping for material integration robustness
169. Add dissipation-based stabilization for shell buckling and concrete cracking
170. Implement plastic hinge beam element with FEMA 356/ASCE 41 hinge tables
171. Add fatigue cycle counting (rainflow) and S-N damage accumulation
172. Add thermal stress analysis (steady-state/transient, bridge deck gradients)

## Active Programs

### 1. Shell-Family Maturity

Focus:
- release-gated shell benchmarks (`MITC4`, `MITC9`, `SHB8-ANS`, and curved-shell frontiers)
- shell load vectors
- mixed tri/quad and beam-shell workflows
- shell modal and buckling consistency
- distortion tolerance
- shell stress recovery consistency
- shell-family comparative benchmark tables and selection guidance
- shell-family automatic-selection rules for default product behavior

Current status:
- MITC4+EAS-7, MITC9, SHB8-ANS, and curved shells are all implemented, benchmarked, and part of the production shell stack
- shell-family frontier gates now exist across MITC4, MITC9, SHB8-ANS, and curved-shell benchmarks
- the shell question is no longer “do we have enough shell breadth?” but “how do we harden and guide the multi-family stack?”

Current remaining shell backlog:
- shell-family selection guidance and explicit “use / avoid” rules for MITC4, MITC9, SHB8-ANS, and curved shells
- a rule-based shell-family selector for automatic defaults and explainable recommendations
- broader curved/non-planar workflow validation with the multi-family shell stack
- broader shell modal, buckling, and dynamic reference cases across the multi-family shell stack
- better shell diagnostics and output semantics in solver results
- MITC9 corotational extension (deferred)
- layered / laminated shell workflows
- axisymmetric workflows for shells of revolution
- nonlinear / corotational shell workflow depth across the multi-family stack

Decision support:
- use [`research/shell_family_selection.md`](/Users/unbalancedparen/projects/dedaliano/research/shell_family_selection.md) for current family-choice rules and default-selection logic
- use [`research/competitor_element_families.md`](/Users/unbalancedparen/projects/dedaliano/research/competitor_element_families.md) to justify why layered shells, axisymmetric workflows, and deeper nonlinear shell depth are the highest-value shell-adjacent additions

Known formulation boundary:
- MITC4+EAS-7: efficient for flat and mildly curved shells
- MITC9: higher-order shell path with better accuracy on standard shell benchmarks at lower mesh density
- SHB8-ANS: strong solid-shell option on the curved/non-planar frontier
- curved shell: preferred family for severe shell-of-revolution and genuinely curved geometry where flat-faceted families are weakest
- shell breadth is no longer the open gap; the remaining shell work is hardening, guidance, and performance across the multi-family stack

Recommended shell order:
1. keep the shell-family selection guidance and frontier gates current
2. add the most important shell-adjacent workflow breadth competitors still expose:
   - layered / laminated shell workflows
   - axisymmetric workflows
   - nonlinear / corotational shell depth
3. turn shell-family guidance into an explicit automatic selection policy for the product layer
4. only reopen shell-family expansion if the current MITC4 / MITC9 / SHB8-ANS / curved-shell stack proves insufficient on practical workflows

Why it matters:
Shell quality is one of the clearest separators between a strong structural solver and a top-tier one.

### 2. Constraint-System Reuse and Deepening

Focus:
- consistent reuse of constrained reductions across solver families
- chained constraints
- eccentric workflow polish
- connector depth
- cross-solver parity in forces and outputs

Why it matters:
Real structural models rely heavily on diaphragms, rigid links, MPCs, and eccentric connectivity. Inconsistent constrained behavior destroys trust.

### 3. Performance and Scale

Focus:
- full-model runtime and memory benchmarks
- broader sparse-path reuse across solver families
- parallel assembly scaling on heavier element families
- conditioning diagnostics
- eigensolver debt cleanup
- CI protection for sparse/eigensolver/reduction wins
- iterative solvers (PCG, GMRES) for 100k+ DOF models (Phase O)
- WebGPU compute shaders for element evaluation (Phase O)

Current status:
- **sparse shell solve viability is done**: direct left-looking symbolic Cholesky with two-tier pivot perturbation eliminates dense LU fallback on all shell families (MITC4, MITC9, curved shell)
- **ordering policy is now measured**: early RCM work fixed catastrophic fill on representative shell meshes, and AMD is now the preferred default direction on the larger shell meshes that matter most
- **dense fallback eliminated**: wall-time share dropped from 87% to 0% on a 50×50 MITC4 plate (~15k DOFs)
- **assembly is deterministic**: all HashMap element iterations sorted by ID across dense, sparse, and parallel paths
- **DOF numbering is deterministic**: multiple supports targeting the same node merge constraint flags with OR
- **residual-based parity testing**: sparse and dense solutions both verified via ||Ku-f||/||f|| < 1e-6
- **benchmark gates in place**: no-dense-fallback gate, fill-ratio gate (< 200×), sparse-vs-dense residual parity gate
- sparse-first 3D assembly is live for plates, quads, and frames (models with 64+ free DOFs)
- parallel element assembly via rayon (`parallel` feature flag) is wired into the 3D sparse solver path
- all 8 element families parallelized through a unified `AnyElement3D` work pool
- memory benchmarks show 11-22× reduction on representative 10×10 to 15×15 shell models
- criterion benchmarks cover flat-plate (up to 50×50 = 2500 quads) and mixed frame+slab models (up to 8-storey, 8×8 slab)
- the Lanczos tridiagonal eigensolver debt is now resolved with implicit symmetric QR
- sparse assembly reuse is now in place for 3D modal, buckling, harmonic, Guyan, and Craig-Bampton workflows, eliminating dense `n×n` assembly there
- `from_triplets` / duplicate-compaction overhead is fixed, and `k_ff`-only sparse assembly exists where full reactions are not needed
- modal, buckling, and harmonic 3D now have sparse eigensolver paths in the common unconstrained case
- Guyan and Craig-Bampton reuse one factorization instead of repeating hundreds of LU decompositions
- the next scale bottlenecks are now workflow-specific:
  - buckling runtime measurement on the new sparse path
  - remaining reduction internals that still densify
  - harmonic sweep cost after the modal-response acceleration

Measured parallel assembly results (Apple Silicon, release build):

| Model | Elements | DOFs | Serial | Parallel | Speedup |
|-------|----------|------|--------|----------|---------|
| 20×20 flat plate | 400 quads | ~2.6k | 82 ms | 80 ms | 1.03× |
| 30×30 flat plate | 900 quads | ~5.8k | 411 ms | 386 ms | 1.06× |
| 50×50 flat plate | 2500 quads | ~15.6k | 2.96 s | 2.91 s | 1.02× |
| 8-storey mixed | 512 quads + 32 frames | ~3.3k | 161 ms | 157 ms | 1.03× |

MITC4 element stiffness is lightweight (~200 ops), so the parallel overhead nearly cancels the speedup. Quad9 and curved-shell elements (5-10× heavier per element) will show stronger scaling.

Updated numerical-methods order:

1. ~~sparse shell solve viability~~ — DONE
2. ~~fill-reducing ordering quality~~ — DONE (ordering quality is measured, and AMD is now the preferred default direction on larger shell meshes)
3. ~~measure real full-model runtime gains~~ — DONE
4. deepen sparse eigensolver integration in reduction workflows
5. measure buckling runtime and any remaining harmonic/reduction bottlenecks
6. sparse shift-invert eigensolver path
7. iterative refinement and Krylov solvers
8. ~~modified Newton~~ — DONE (implemented for corotational and fiber nonlinear solvers; not a universal default)
9. quasi-Newton variants
10. iterative solvers (PCG + IC(0), GMRES/MINRES) — Phase O
11. AMG preconditioner for million-DOF models — Phase O
12. multi-frontal solver + nested dissection (METIS) — Phase O
13. Total/Updated Lagrangian for continuum large-strain — Phase O
14. domain decomposition (FETI) — Phase O
15. supernodal Cholesky — Phase O
16. WebGPU compute shaders — Phase O

See [`research/numerical_methods_gap_analysis.md`](/Users/unbalancedparen/projects/dedaliano/research/numerical_methods_gap_analysis.md).

Next steps:
- measure buckling runtime on the sparse eigensolver path
- measure the remaining harmonic / Guyan / Craig-Bampton bottlenecks after the recent speedups
- push sparse deeper into reduction internals instead of converting `K_ff` back to dense where avoidable
- add CI gates for the new sparse/eigensolver/reduction guarantees
- move to iterative refinement / Krylov only after the current direct sparse path is mature enough

Why it matters:
A solver is not elite if it only works well on small clean examples.

#### CI / Gate Discipline

The newest sparse/eigensolver/reduction wins should be explicit CI gates, not only part of the full suite.

Add or keep explicit named gates for:
- sparse shell gates:
  - no dense fallback
  - fill ratio bounds
  - deterministic sparse assembly
  - sparse vs dense residual parity
- sparse modal / buckling / harmonic parity gates
- sparse reduction gates:
  - Guyan single-factorization behavior
  - Craig-Bampton interior eigensolve success
  - reduction parity where available
- release-mode sparse smoke coverage
- `parallel`-feature smoke coverage
- doctest coverage

What still needs more testing:
- buckling runtime/fill gates on the new sparse path
- harmonic/reduction workflow runtime gates after the latest optimizations
- no-`k_full`-overbuild expectations in every workflow that should build only `k_ff`
- broader mixed shell + nonlinear acceptance models
- broader contact + nonlinear + staging acceptance models
- more invariant/property/fuzz coverage around sparse eigensolver and reduction paths

### 4. Verification Hardening

Focus:
- benchmark gates
- acceptance models
- invariants
- property-based tests
- fuzzing
- differential consistency tests
- signal-driven benchmark growth only

Rule:
- do not add low-signal tests just to increase the count
- add tests that improve:
  - proof
  - regression protection
  - performance confidence
  - edge-case coverage

Why it matters:
This is how the solver becomes visibly trustworthy rather than merely feature-rich.

### 5. Observability, Reproducibility, And Auditability

Focus:
- solver-run artifacts
- build SHA and solver-path metadata
- reproducible bug capture
- equilibrium / residual / conditioning summaries
- versioned result contracts

Why it matters:
A solver becomes dramatically more valuable when failures are reproducible and results are auditable instead of opaque.

### 6. Long-Tail Nonlinear Hardening

Focus:
- mixed contact + nonlinear + staged cases
- shell/nonlinear interaction hardening
- difficult convergence edge cases
- stronger fallback and failure behavior on ill-conditioned real models

Why it matters:
This is the main remaining place where mature open solvers still have more years of hardened behavior than Dedaliano.

### 7. Native / Server Execution

Focus:
- native parity with browser WASM
- heavy-model execution outside the browser
- batch / report / enterprise execution paths

Why it matters:
If Rust is the one solver, it should not be constrained to browser-only execution for the workloads where native execution is clearly better.

### 8. Dynamic Analysis and Earthquake Engineering

Focus:
- time integration methods (Newmark-β, HHT-α, explicit central difference with matrix-free evaluation)
- damping models (Rayleigh, modal, Caughey, frequency-dependent, non-proportional with complex eigenvalues)
- nonlinear dynamics with material and geometric nonlinearity
- ground motion input and response extraction
- random vibration / PSD analysis for wind/wave/traffic
- response spectrum enhancements (CQC3, GMC, Gupta, missing mass correction)
- pushover analysis and capacity spectrum methods
- seismic isolator and damper element support

Why it matters:
Dynamic and pushover analysis is what OpenSees is famous for. This is the capability that makes Dedaliano the go-to tool for earthquake engineering.

### 9. Nonlinear Material Library and Computational Plasticity

Focus:
- general return mapping algorithm (yield surface, flow rule, hardening, consistent tangent)
- material state management framework (commit/revert/copy)
- concrete models (Kent-Park, Mander, Concrete02, CDP, smeared crack, Mazars damage)
- steel models (bilinear, Menegotto-Pinto, Giuffré, Steel4, Chaboche kinematic hardening)
- geotechnical models (Drucker-Prager, Mohr-Coulomb, Modified Cam-Clay)
- orthotropic/anisotropic elasticity for timber, masonry, composites
- fiber sections with mixed materials
- moment-curvature and interaction surface generation
- Gauss-point substepping for material integration robustness
- user-defined material interface (UMAT-equivalent)

Why it matters:
Realistic material behavior is the foundation of all nonlinear analysis. The return mapping framework makes adding new materials systematic. Without geotechnical materials, foundation and soil analysis is impossible. Without UMAT, every new material requires modifying the solver source.

### 10. Element Library Completeness

Focus:
- force-based beam-column element (OpenSees gold standard for nonlinear frames)
- Timoshenko beam with warping DOF (open thin-walled sections)
- plastic hinge beam element with FEMA 356/ASCE 41 tables
- full shell triangle (MITC3/DSG3) for meshing freedom
- 6-node triangular shell (MITC6/STRI65) for p-refinement
- axisymmetric shell of revolution element
- composite laminate failure criteria (Tsai-Wu, Hashin, Puck)
- gap/hook and cohesive zone elements
- seismic isolators, BRBs, viscous dampers, panel zones

Why it matters:
Element completeness determines what real problems the solver can handle. The force-based beam is the single most important missing element. Shell triangles are non-negotiable for practical meshing. Warping DOF is needed for every steel structure with open sections.

### 11. Contact, Constraints & Mixed-Dimension Models

Focus:
- augmented Lagrangian and mortar contact for accurate stress transfer
- friction (Coulomb slip/stick, velocity-dependent)
- shell-to-solid coupling and beam-to-shell connections
- embedded elements (rebar in concrete)
- distributed coupling (RBE3), tie constraints, general MPC equations
- periodic BCs, automatic symmetry/antisymmetry

Why it matters:
Real structural models are multi-part assemblies with mixed dimensions. Without proper coupling, users cannot model connections, composite sections, or multi-scale problems.

### 12. Design-Oriented Post-Processing

Focus:
- Wood-Armer moments for RC slab design from shell results
- section cuts and nodal force summation through shells/solids
- shell result envelopes across load combinations
- stress linearization (ASME/EN 13445 pressure vessel codes)
- crack width estimation, punching shear detection
- submodeling / global-local analysis
- result smoothing and SPR stress recovery
- error estimation and h-refinement indicators

Why it matters:
A solver that produces correct numbers but cannot transform them into design quantities is useless for practicing engineers. Wood-Armer moments alone unlock RC flat slab design from shell models.

### 13. Specialized Analysis Depth

Focus:
- thermal stress (general, not just fire) — bridge decks, solar radiation, seasonal
- fire analysis with temperature-dependent material degradation (Phase M)
- fatigue (rainflow counting, S-N curves, Palmgren-Miner, weld assessment) (Phase M)
- progressive collapse with automated member removal (Phase M)
- automatic load generation from building codes (Phase N)
- Total/Updated Lagrangian for continuum large-strain (Phase O)
- topology optimization with sensitivity analysis (Phase P)
- reliability and probabilistic assessment (Phase Q)

Why it matters:
These capabilities close the remaining gaps between Dedaliano and commercial tools like SAP2000/ETABS/RFEM, and push beyond what any open-source solver offers today.

## Exit Criteria

### Shell-family maturity

Already done:
- MITC4+EAS-7, MITC9, and SHB8-ANS are all accepted as part of the production shell stack
- curved/non-planar benchmarks written and running (twisted beam, Raasch hook, hemisphere R/t sweep) — results document the flat-faceted limit

Remaining to close:
- the shell-family selection guidance and frontier boundaries are explicitly documented
- shell-family selection policy is explicit enough for automatic defaults plus manual override
- distortion and warp studies are gated and bounded
- the highest-value shell-adjacent workflow gaps are closed:
  - layered / laminated shell workflows
  - axisymmetric workflows
  - nonlinear / corotational shell depth

### Performance and scale

Already done:
- sparse shell solve viability (dense fallback eliminated, fill ratio 1.8×)
- deterministic assembly and DOF numbering
- residual-based parity testing and benchmark gates

Remaining to close:
- sparse assembly overhead is no longer a dominant cost on medium shell models
- sparse path is extended deeper than `assemble_sparse_3d() + to_dense_symmetric()` in modal, buckling, harmonic, and reduction workflows
- large-model memory/runtime baselines are tracked in CI
- eigensolver debt is resolved

### Verification hardening

Done means:
- benchmark gates exist for the newest advanced solver families
- acceptance models cover the hardest production-style workflows
- invariants, property tests, and fuzzing exist for sparse/shell/contact/constraint paths
- benchmark discipline is part of release quality, not just local testing

### Long-tail nonlinear hardening

Done means:
- hard mixed nonlinear regressions exist and stay green
- convergence behavior is predictable on difficult reference cases
- failure modes are clearer and less solver-path-specific

### Solver-path consistency

Done means:
- dense vs sparse parity is explicitly covered on representative models
- constrained vs unconstrained parity is stable
- mixed frame/shell workflows do not diverge by solver path
- result outputs remain consistent across linear and advanced solver families

### WASM path reliability and single-solver convergence

Done means:
- deployed production builds are traceable to a specific commit and solver artifact set
- main-thread, worker, and combo/multi-case WASM paths are green on representative examples
- production failures can be replayed locally from a captured artifact
- the TypeScript runtime solver path is removed

### Result trust, auditability, and contracts

Done means:
- public solver payloads used by product code are contract-tested and evolution-safe
- representative results expose equilibrium/residual/conditioning/provenance summaries
- pre-solve model quality gates catch the most common invalid-model causes before solve

### Native / server execution

Done means:
- at least one real native/server execution path is maintained and tested
- representative browser/native parity checks are green
- heavy workflows have a documented execution recommendation and proof path

### Dynamic analysis (Phase I)

Done means:
- Newmark-β and HHT-α pass analytical SDOF/MDOF benchmarks
- nonlinear dynamic matches OpenSees reference on standard RC column/steel frame cases
- all damping models (Rayleigh, Caughey, modal, non-proportional) verified against analytical solutions
- random vibration matches commercial solver PSD output on standard cases

### Nonlinear materials (Phase J)

Done means:
- return mapping framework supports arbitrary yield surface + hardening law combinations
- each concrete/steel model passes cyclic verification against published curves
- Drucker-Prager/Mohr-Coulomb reproduce bearing capacity benchmarks within 5%
- UMAT interface works without recompiling solver source

### Pushover (Phase K)

Done means:
- capacity curves match published benchmarks on standard frames
- both distributed and concentrated plasticity produce consistent results
- FEMA 356 / ASCE 41 hinge tables produce correct acceptance criteria

### Element library (Phase L)

Done means:
- force-based beam matches OpenSees forceBeamColumn on nonlinear frame benchmarks
- warping beam produces correct bimoment on channel/Z-section cases
- MITC3 triangle passes patch tests and converges on standard shell benchmarks
- composite failure criteria match published laminate failure loads

### Contact and constraints (Phase R)

Done means:
- augmented Lagrangian contact matches Hertz analytical solution within 1%
- mortar contact passes patch test on non-matching meshes
- shell-to-solid coupling produces continuous stress at interface
- embedded rebar matches reference RC beam results

### Design post-processing (Phase S)

Done means:
- Wood-Armer moments match hand calculations on standard slab cases
- section cuts satisfy global equilibrium to machine precision
- stress linearization matches ASME benchmark cases
- submodel results within 5% of fully-refined global model

## Must-Have Vs Later

### Must-have to become the best open structural solver

**Core solver trust (Phases A–H):**
- shell endgame maturity (all families hardened, guided, and auto-selected)
- performance and scale (sparse direct dominance, measured runtime wins)
- WASM path reliability and single-solver convergence
- verification hardening (gates, acceptance models, CI)
- observability / reproducibility / auditability
- long-tail nonlinear hardening
- solver-path consistency (dense/sparse, constrained/unconstrained)
- constraint-system maturity

**Dynamic and nonlinear (Phases I–K):**
- dynamic analysis (Newmark-β, HHT-α, explicit, Rayleigh/modal/Caughey damping) — Phase I
- nonlinear material models (concrete, steel, geotechnical, return mapping framework) — Phase J
- pushover analysis (capacity spectrum, N2, MPA, plastic hinge elements) — Phase K

**Critical element gaps:**
- force-based beam-column element (what makes OpenSees dominant) — Phase L
- Timoshenko beam with warping DOF (open sections are wrong without this) — Phase L
- full shell triangle (MITC3/DSG3 — meshing freedom is non-negotiable) — Phase L
- plastic hinge beam element (makes pushover practical at building scale) — Phase K

**Critical post-processing gaps:**
- Wood-Armer moments (shell-based RC slab design is impossible without this) — Phase S
- section cuts / nodal force summation for shell/solid design — Phase S
- result envelopes for shells across load combinations — Phase S

### Important after the core claim is secure

- advanced element library (isolators, BRB, catenary, panel zones, infill walls) — Phase L
- 6-node triangular shell (MITC6) and axisymmetric shell of revolution — Phase L
- composite laminate failure criteria (Tsai-Wu, Hashin) — Phase L
- automatic load generation (wind, seismic ELF, snow, patterns) — Phase N
- iterative solvers (PCG, AMG) and multi-frontal solver for 100k+ DOFs — Phase O
- Total/Updated Lagrangian for continuum large-strain analysis — Phase O
- contact depth (augmented Lagrangian, mortar, friction, self-contact) — Phase R
- constraint depth (shell-to-solid coupling, embedded elements, tie constraints) — Phase R
- stress linearization for pressure vessel codes (ASME, EN 13445) — Phase S
- submodeling / global-local analysis — Phase S
- advanced reference benchmark expansion
- model reduction / substructuring workflow maturity
- deeper prestress / staged time-dependent coupling
- broader native/server workflow packaging

### Later specialization

- thermal stress and fire analysis — Phase M
- fatigue analysis (rainflow counting, S-N curves, weld assessment) — Phase M
- progressive collapse (GSA/UFC alternate path) — Phase M
- topology optimization and sensitivity analysis — Phase P
- reliability and probabilistic analysis (FORM/SORM, Monte Carlo) — Phase Q
- domain decomposition (FETI) for distributed parallelism — Phase O
- WebGPU compute shaders — Phase O
- 3D solid elements (C3D8, C3D20, C3D4, C3D10) — Phase L
- continuum shell elements (SC6R, SC8R) — Phase L
- geotechnical materials (Cam-Clay) — Phase J
- user-defined material interface (UMAT) — Phase J
- error estimation and adaptive h-refinement — Phase S
- cohesive zone models for delamination/fracture — Phase R
- periodic BCs for homogenization — Phase R
- membranes / cable nets / specialized tensile structures
- bridge-specific advanced workflows
- broader domain expansion

## Non-Goals Right Now

- no broad multiphysics expansion (CFD, thermal-fluid, electromagnetics)
- no isogeometric analysis (IGA shines for automotive/aerospace, not buildings)
- no meshfree methods (peridynamics, MPM — niche, out of scope for routine structural)
- no GPU sparse direct factorization (CPU sparse direct is correct for structural problem sizes)
- no solver-scope expansion driven by product/UI convenience ahead of core quality
- no feature-count work ahead of validation, robustness, and scale
- no roadmap drift into a changelog or benchmark ledger

## Related Docs

- [`README.md`](/Users/unbalancedparen/projects/dedaliano/README.md)
  repo entry point and document map
- [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md)
  capability and benchmark evidence
- [`VERIFICATION.md`](/Users/unbalancedparen/projects/dedaliano/VERIFICATION.md)
  verification philosophy and testing stack
- [`PRODUCT_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md)
  app, workflow, market, and product sequencing
