<p align="center">
  <img src="Logo.png" alt="Dedaliano" width="180" />
</p>

<h1 align="center">Dedaliano</h1>

<p align="center">
  <strong>Open-source structural analysis for the browser.</strong><br>
  Model, solve, and visualize frame structures in 2D and 3D. No installation required.
</p>

<p align="center">
  <a href="https://dedaliano.com">Try it now</a> ·
  <a href="#what-is-structural-analysis">What is this</a> ·
  <a href="#why-dedaliano">Why it exists</a> ·
  <a href="#features">Features</a> ·
  <a href="#documentation-map">Docs</a> ·
  <a href="#getting-started">Getting started</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="License"></a>
</p>

<p align="center">
  <img src="screenshots/3d-deformed.jpg" alt="3D industrial warehouse showing deformed shape under load" width="100%" />
</p>
<p align="center"><sub>3D model of an industrial warehouse with Pratt roof trusses and a crane bridge. The orange overlay shows the deformed shape under applied loads, exaggerated for visibility. 216 nodes, 538 elements, 30 supports.</sub></p>

<p align="center">
  <img src="screenshots/3d-colormap.jpg" alt="Same structure with stress utilization color map" width="100%" />
</p>
<p align="center"><sub>Same structure with a stress utilization color map (sigma/fy). Blue elements are lightly loaded. Green and yellow elements are at moderate utilization. Red elements are approaching their yield strength.</sub></p>

---

## Documentation map

Use the docs by question:

- [`DOCS.md`](/Users/unbalancedparen/projects/dedaliano/DOCS.md)
  document index and suggested reading order
- [`CURRENT_STATUS.md`](/Users/unbalancedparen/projects/dedaliano/CURRENT_STATUS.md)
  current solver snapshot, biggest strengths, biggest remaining gaps, and next priorities
- [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md)
  source of truth for solver capability, validation coverage, benchmark status, and remaining solver gaps
- [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)
  solver roadmap: mechanics, validation, diagnostics, and performance sequencing
- [`PRODUCT_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md)
  product roadmap: app, workflow, delivery, and market sequencing
- [`POSITIONING.md`](/Users/unbalancedparen/projects/dedaliano/POSITIONING.md)
  product/business framing, adjacent markets, and platform direction
- [`CHANGELOG.md`](/Users/unbalancedparen/projects/dedaliano/CHANGELOG.md)
  milestone-oriented project updates and solver progress highlights
- [`engine/README.md`](/Users/unbalancedparen/projects/dedaliano/engine/README.md)
  Rust solver engine surface, analysis types, and engine-focused validation summary
- [`VERIFICATION.md`](/Users/unbalancedparen/projects/dedaliano/VERIFICATION.md)
  verification philosophy, testing layers, fuzzing, invariants, and proof-oriented rigor

This README is intentionally the short repo-level entry point.
It should explain what Dedaliano is and where to read next, not duplicate the benchmark ledger, roadmap tables, or market strategy in full.

## Current state

Dedaliano is an `open-source structural solver` with a growing structural engineering platform around it.

Latest reported milestone:

- broad 2D and 3D structural analysis coverage, including staged, contact, SSI, fiber nonlinear, imperfections, and creep/shrinkage workflows
- shell maturity now includes MITC4 ANS plus EAS-7, explicit shell CI gates, curved/distorted workflow studies, self-weight, edge loads, thermal convergence coverage, and broader shell benchmark tracking
- sparse-first 3D assembly and solve path is live, with dense-vs-sparse parity coverage and large memory wins on shell models
- benchmark gates, acceptance models, integration tests, property/differential fuzz coverage, and a large public benchmark program back the solver-quality story

For the concise current snapshot and canonical test-count status, see [`CURRENT_STATUS.md`](/Users/unbalancedparen/projects/dedaliano/CURRENT_STATUS.md).

A reasonable description today is:

`Dedaliano is becoming one of the strongest open structural solvers, with a broader product surface than most solver-first projects.`

What is distinctive is not any one verification technique by itself. The stronger identity is:

`an open, browser-native structural solver with unusually deep public proof of correctness`

For the full verification strategy, see [`VERIFICATION.md`](/Users/unbalancedparen/projects/dedaliano/VERIFICATION.md).

## Supported capabilities

At a high level, the current solver supports:

- 2D and 3D linear static analysis
- 2D and 3D second-order analysis, buckling, modal analysis, response spectrum, time history, harmonic response, and moving loads
- 2D and 3D corotational and material nonlinear analysis
- plastic analysis, staged construction, prestress / post-tension workflows, cable analysis, contact / gap behavior, and nonlinear SSI
- initial imperfections / residual stress modeling and time-dependent creep / shrinkage workflows
- frame, truss, cable, plate, and shell formulations, including Timoshenko beams, warping torsion, triangular plates, and MITC4 quadrilateral shells with Bathe-Dvorkin ANS shear tying and EAS-7 membrane enhancement
- constraints including rigid links, diaphragms, equal-DOF constraints, general linear MPCs, and reusable constrained-solver reduction/expansion paths
- 2D and 3D fiber beam-column nonlinear solvers
- model reduction and substructuring workflows including Guyan and Craig-Bampton reduction
- section analysis, stress recovery, load combinations, envelopes, and kinematic diagnostics
- design-check and postprocess modules for steel, concrete, timber, masonry, cold-formed steel, serviceability, connections, and foundations

For the detailed engine surface and current maturity by category, see [`engine/README.md`](/Users/unbalancedparen/projects/dedaliano/engine/README.md) and [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md).

## Supported codes and validation references

Current design-check and workflow coverage includes:

- `AISC 360`
- `ACI 318`
- `EN 1992-1-1 (EC2)`
- `EN 1993-1-1 (EC3)`
- `CIRSOC 201`
- `AISI S100`
- `NDS`
- `TMS 402`
- `ASCE 7`, `EN 1990`, and related load-combination / serviceability workflows where applicable

The solver and postprocess stack are validated against analytical solutions and benchmark families including:

- `NAFEMS`
- `ANSYS Verification Manual`
- `Code_Aster`
- `SAP2000`
- `OpenSees`
- `Robot Structural Analysis`
- `STAAD.Pro`
- textbook and closed-form structural mechanics references

For exact benchmark families, validation files, and current status, see [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md).

## What is structural analysis

Structural analysis computes how a structure deforms and what internal forces it develops under load.

In practice that means:

- modeling geometry, supports, materials, and loads
- solving for displacements and reactions
- recovering axial forces, shears, moments, stresses, modes, and related response quantities

For simple members this can be done by hand. For real frames, trusses, plates, staged systems, and dynamic problems, the structure is solved numerically, typically with the **[Direct Stiffness Method](https://en.wikipedia.org/wiki/Direct_stiffness_method)** and related finite-element formulations.

---

## Why Dedaliano

The dominant structural analysis tools today are commercial desktop applications: [SAP2000](https://www.csiamerica.com/products/sap2000) and [ETABS](https://www.csiamerica.com/products/etabs) from CSI, [Robot Structural Analysis](https://www.autodesk.com/products/robot-structural-analysis) from Autodesk, [RSTAB](https://www.dlubal.com/en/products/rstab-beam-structures/what-is-rstab) and [RFEM](https://www.dlubal.com/en/products/rfem-fea-software/what-is-rfem) from Dlubal. A professional license costs thousands of dollars per year. They run on Windows. They require installation, license servers, and IT support. Their source code is closed.

For students, this creates a gap. You learn the theory in class (equilibrium, compatibility, constitutive relations, the stiffness method), but you never see the inside of the machine. The commercial tools are black boxes: you input a model, press solve, and get results. You cannot inspect the stiffness matrix, see how it was assembled, verify a single entry, or understand why a particular element is failing. If the results look wrong, you have no way to trace the computation.

Dedaliano is an attempt to provide an alternative.

- **Browser-native.** Open [dedaliano.com](https://dedaliano.com) and start. No download, no license key, no account. Works offline after the first load.
- **Open source.** The entire codebase is here. Read the solver, trace the math, submit improvements.
- **Transparent computation.** A 9-step interactive wizard shows every intermediate result of the Direct Stiffness Method: the local stiffness matrix of each element, the coordinate transformation, the assembled global matrix, the partitioning, the solution, the back-substitution for reactions and internal forces. Every matrix is rendered with [KaTeX](https://katex.org).
- **Solver-first.** The project is organized around a real structural solver and a large public benchmark program, not only a modeling UI.
- **Real-time.** The solver runs on every edit. Move a node, change a load, resize a section, and the results update.

Originally built for structural engineering courses at [FIUBA](http://www.fi.uba.ar/) (University of Buenos Aires, School of Engineering).

Named after [Daedalus](https://en.wikipedia.org/wiki/Daedalus) (Daidalos), the architect of the labyrinth, who built wings to escape Crete.

---

## Features

Dedaliano combines a browser-native structural app with a broad Rust solver and a large public validation program.

At the repo level, the most important feature groups are:

- interactive 2D and 3D modeling, visualization, and direct-stiffness educational tooling
- broad solver coverage across linear, second-order, buckling, dynamic, staged, contact, SSI, nonlinear, shell, fiber, and time-dependent workflows
- section analysis, stress recovery, load combinations, envelopes, and design-check modules
- import/export and model-sharing workflows

For the detailed engine surface, use [`engine/README.md`](/Users/unbalancedparen/projects/dedaliano/engine/README.md).  
For exact solver maturity and benchmark coverage, use [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md).

---
## Getting started

**Use it now.** Open [dedaliano.com](https://dedaliano.com). Nothing to install. Works on any modern browser.

**Run locally.**

```bash
git clone https://github.com/lambdaclass/dedaliano.git
cd dedaliano/web
npm install
npm run dev       # http://localhost:4000
```

```bash
npm test          # run the web test suite
npm run build     # production build -> web/dist/
```

Requires Node.js >= 18.

---

## Contributing

Pull requests are welcome. For major changes, open an issue first to discuss the approach.

## Security

To report a vulnerability, email security@lambdaclass.com.

## License

[AGPL-3.0](LICENSE)

---

<p align="center">
  <em>In honor of Daedalus, who built the labyrinth and dared to fly.</em>
</p>
