# Fairclough et al. (2026): one five-node square

Research, not a design tool. Agreement with reference code is not experimental validation
or engineering certification. No production engine numerics were changed.

Paper: H. E. Fairclough, K. Bołbotowski, L. He, A. Liew and M. Gilbert,
*Topology and geometry optimization of grid-shells incorporating design-dependent
self-weight loading*, Computers & Structures 320, 107997 (2026),
[doi:10.1016/j.compstruc.2025.107997](https://doi.org/10.1016/j.compstruc.2025.107997).
Metadata checked with the catalogue's Crossref lookup.
[Accepted manuscript](https://eprints.whiterose.ac.uk/id/eprint/236639/) is CC BY 4.0.

Page: `/research/optimisation/fairclough-2026`, translated into English, Spanish and Portuguese.

## Exactly what is reproduced

Table 1, first row, **five nodes**, normalized unit weight **1.65 σ/L**.
Source: accepted manuscript printed page 28 (PDF page 29), Table 1 and Section 4.3.
The square has side L=1; four corner supports and a central downward point load F=1;
compressive strength σ=1. All ten node pairs are candidate connections. This is the
smallest published example, has a precise printed volume, and isolates conic self-weight
optimization from member addition and the outer geometry search.

The isolated Rust crate assembles the fixed-ground-structure SOCP from the paper's equations
(12)–(18), using Clarabel.rs 0.11.1 (Apache-2.0). It recovers elevations from the vertical
equilibrium dual and integrates the equal-stress curve slope. It is an independent
implementation of published mathematics: no GPL source has been copied or adapted.
`paper.yaml` records normalization, equations, solver settings and engine assumptions.

| Quantity | Value | Evidence |
|---|---:|---|
| Published normalized volume | 13.8394 | Table 1, five-node column, first row |
| Unmodified Python reference | 13.839373588474706 | `reference-results/five-node.json` |
| Rust / Clarabel | 13.83937354032954 | `results/stabileo_results.json` |
| Relative volume difference | 3.47885e-09 | `VALIDATION.json` |
| Maximum centreline coordinate difference / L | 5.39511e-08 | Same |
| Apex elevation difference / L | 1.43616e-09 | Same |
| Maximum force component difference / F | 3.62828e-06 | Same |
| Independent cone feasibility violation | 3.09264e-12 | Same |
| Production engine vertical force balance, relative | 1.37741e-11 | Same |

Four active curved members connect the centre to the corners. Layout comparisons include
all ten force triples and 33 sampled points on each active curve, not just volume.
The reference and Rust configurations can be switched in the shared Stabileo viewer in
plan or diagonal elevation. The replay contains **one converged layout**, not an invented
optimization history. Live recomputation runs this same Rust solver in a terminable worker;
Stop, Restart, reduced-motion and visibility handling use the platform's playback rules.

## Reference provenance and licensing

[Author deposit, version 1](https://doi.org/10.15131/shef.data.29046755.v1),
Figshare article 29046755; `vaultopt.py`, file 54492344, **GPL-3.0-or-later**.
SHA-256: `030f30b6ef42a1a038b42bc251be6206d9909e65d9c73008bb3b657b9a6ba98c`.
The script and its README were inspected before execution. The GPL code stays in scratch
storage outside this AGPL repository. No distribution/adaptation decision is implied.

`reference/run.py` executes the **entire unchanged script**, including its default
121-node example (the file has no main guard), and then calls its public `solveIteration`,
`getZ` and `getCentreline` functions with the five-node input. The default run is incidental;
no reproduction of its published results is claimed. MOSEK must not be installed; the
pinned CVXPY environment selects Clarabel for the SOCP. No solver function is patched.
`reference-results/MANIFEST.json` pins the deposit, source hash, environment and output hash.
Python 3.14.8, CVXPY 1.9.3, Clarabel 0.11.1; the full environment is pinned in
`reference/requirements.txt`.

Re-run in a scratch venv after reading the external source:

```sh
python3 -m venv /tmp/fairclough-reference
/tmp/fairclough-reference/bin/pip install -r reference/requirements.txt
curl -L https://ndownloader.figshare.com/files/54492344 -o /tmp/vaultopt.py
/tmp/fairclough-reference/bin/python reference/run.py /tmp/vaultopt.py
```

## Production engine and editor

`src/engine.rs` depends on the production engine as a library. Four curves become
128 straight 3D **frame** segments, with circular sections and explicit lumped nodal
self-weight, pinned corner translations, E=1000 MPa and ν=0.3. The linear static solver
returns a maximum displacement of about 1.26707e-6 m and total vertical reaction
23.8570253743 kN. This frame's discrete volume is checked to within 0.2% of the conic volume.
The editor receives the same geometry, sections and loads; material density is zero to
avoid automatic self-weight doubling the explicit loads. The project name carries the
research disclaimer. The editor solves an ordinary structural model, not the optimizer.

Bending stiffness stabilizes the segmented frame; this is **not** a compression-only
catenary solve. Straight chord lengths, averaged sections and nodal weights approximate
the continuous formulation. No buckling, stress certification, nonlinear response or
adequacy for construction follows from force balance. No artificial transverse supports
are introduced at internal curve nodes.

## Reproduction and tests

From repository root, within the pinned Nix development shell:

```sh
nix develop -c cargo test --locked --manifest-path research/optimisation/fairclough-2026/Cargo.toml
nix develop -c research/optimisation/fairclough-2026/wasm/build.sh
nix develop -c node research/optimisation/fairclough-2026/wasm/check.mjs
```

The numerical test writes fresh evidence to `target/`, checks the committed evidence and
full published result for freshness (allowing floating-point roundoff across platforms).
The SOCP matrix uses pinned `libm` 0.2.16 (MIT) for length and sine/cosine
coefficients. Host libc differences in their last bits otherwise perturb the
interior-point trajectory and amplify into frame section inertias beyond the
existing `1e-8` relative comparison. Solver and test tolerances are unchanged.
The test also writes `target/stabileo_results.json` and reports the JSON path and
values on a numerical mismatch. CI needs only the committed outputs; the external
GPL script is never needed by `cargo test`.
To intentionally refresh: set `UPDATE_FAIRCLOUGH=1`, run the test, inspect the evidence,
and rerun without that variable. `PUBLISHED_COMPARISON.json` names the exact table/page
and uses a 0.00005 rounding tolerance. Catalogue status remains `numerically-validated`,
limited to this example even though a browser solver exists.

Web tests: `web/src/components/research/fairclough2026/__tests__/model.test.ts` checks
viewer geometry, corrupt results, all translated keys, exact editor data and compressed
share round-trip. `web/e2e/research-fairclough.spec.ts` exercises the page at 360, 390,
844×390 and 810 px, live WASM, replay, viewport and editor handoff. Maintainer runs Chromium.
The CI research job runs the Rust validation; the research WASM build includes this crate.

## Not reproduced and author questions

Not reproduced: other Table 1 rows, 11×11 grid, optimized 13-node layouts, member addition,
position search, counterweights, holes, larger examples, or the full general catenary layout
formulation. This first version is not a general layout optimizer. No experimental or
stability validation is claimed. No paper figure is copied.

Questions for the authors (not sent):

- Can you confirm the canonical Table 1 input decks and solver tolerances?
- Which open-solver configuration do you recommend for reproducing the larger examples?
- What are the preferred centreline and section export conventions for independent stability analysis?
- What member-addition stopping rule should be used when extending beyond this fixed ground structure?
