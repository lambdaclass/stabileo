# Phase-field fracture (AT2) after Shauer (2025)

N. Shauer, "Less than 500 lines self-contained Python finite element implementation of the
phase-field method for fracture mechanics", *Advances in Engineering Software* 210 (2025) 104013,
doi:[10.1016/j.advengsoft.2025.104013](https://doi.org/10.1016/j.advengsoft.2025.104013)
(metadata checked against Crossref by `research/tools/catalog.py`).

Reference code: <https://github.com/nathanshauer/phasefield-jr-py>, **MIT License**, (c) 2025
Nathan Shauer, commit `61037c6ce7833a4f92a3ec098a9d60fd477eff2b` (2025-08-25). The Rust mesh
generators and the alternating loop follow that code so results can be compared entry by entry;
the credit is repeated in `src/mesh.rs` and `src/lib.rs`.

**Research code.** Not part of the Stabileo solver and not for design. Agreement with a reference
code is not validation against experiments and not an engineering certification.

## What is established, and what is not

| Claim | Evidence |
|---|---|
| The reference code runs here and its outputs are recorded | `reference-results/` + `MANIFEST.json` (versions, commit, SHA-256) |
| The Rust implementation reproduces the reference code on its three examples | `tests/reference.rs`, 30 checks, all passing; `VALIDATION.json` |
| It reproduces the numbers **published in the paper** | **Not established.** The paper's full text was not accessible (Elsevier, no institutional access). No published number has been compared. |
| Its physics are correct beyond what the reference does | Partly: patch test, rigid modes and the 1D AT2 homogeneous solution (`tests/properties.rs`). No experimental comparison. |

## Formulation (as implemented by the reference code, read in full)

Unknowns: displacement **u** (bilinear Q4, 2 dofs per node) and damage d (Q4, 1 dof per node),
2x2 Gauss quadrature, plane stress or plane strain, small strain, quasi-static.

- Elasticity at fixed d: div( g(d) **C** : **ε**(**u**) ) = 0 with g(d) = (1 - d)^2 on the whole
  stress (no split in the elastic problem).
- Damage at fixed **u** (AT2): (Gc/l0 + 2H) d - Gc l0 Δd = 2H, written in the code with c0 = 2 as
  K = ∫ Gc l0/2 ∇N·∇N + (Gc/(2 l0) + H) N N, f = ∫ H N.
- Driving energy: H = ψ⁺ = ½ Σ_{ε_i > 0} σ_i ε_i, with ε_i the principal strains and σ_i the
  principal values of the *undamaged* stress **C**:**ε**. Because the elastic problem degrades the
  whole stress while the damage is driven only by this tensile part, the scheme is a "hybrid"
  formulation. (The reference pairs the two eigenvalue lists by index; for an isotropic **C** the
  principal directions coincide and σ_i is increasing in ε_i, and we checked on 200 000 random
  strain states that index pairing equals sorted pairing. The Rust code pairs sorted values.)
- Irreversibility: **none** in the reference. Damage is recomputed from the current ψ⁺ each
  iteration; it can decrease on unloading and is not bounded (max d = 1.0021897551918642 in example 1, 1.0096
  in example 2). The Rust code reproduces this by default and offers Miehe's history field
  H = max over converged steps of ψ⁺ as an option (`Irreversibility::History`), tested to keep
  damage under full unloading. Neither enforces 0 ≤ d ≤ 1 at nodes: on coarse meshes the
  consistent N N term can give negative nodal values. The recorded Python reference outputs
  (`reference-results/ex*_steps.csv`, verified against the manifest hashes) have minimum nodal
  damage 3.076336950017797e-08 in example 1, -0.0031224948220514573 in example 2,
  and -0.06024191772700118 in example 3. These undershoots are present in the reference
  code’s unconstrained AT2 discretization too; they are not silently clamped in the solver.
  Negative damage is outside the physical interval: evaluating (1-d)^2 at the example 3
  minimum gives about 1.124, above intact stiffness. Assembly evaluates degradation at
  quadrature points using interpolated damage, so this nodal value does not establish a
  12.4% assembled-stiffness error.
- Alternating scheme per load step: assemble elasticity with the current d and apply Dirichlet
  conditions; from the second pass on, stop when ‖K(d) u - f‖₂ < tol (absolute); otherwise solve
  for u, then for d. Dirichlet values scale linearly with a pseudo time t += dt, stopping when
  t > total time (floating-point accumulation decides the last step, as in the reference).
- Linear solves: the reference uses SciPy's sparse LU; the Rust code uses the Stabileo engine's
  supernodal sparse Cholesky (both systems are symmetric positive definite after the Dirichlet
  rows/columns are replaced by the identity), with the symbolic factorization computed once.

Units are the caller's; the examples use kN and mm (E in kN/mm², Gc in kN/mm, l0 in mm).
Dimensionless groups worth keeping in view: h/l0 (resolution of the crack band) and the AT2
critical stress σ_c = sqrt(27 E Gc / (256 l0)), which makes l0 a strength parameter.

## Examples and results

| | Example 1: bar in tension | Example 2: single-edge notched tension | Example 3: three-point bending |
|---|---|---|---|
| Geometry | 200 x 20, 100 x 10 Q4 | 1 x 1, notch to the centre, 5 600 Q4, 5 786 nodes | 8 x 2, notch 0.4, 3 000 Q4 |
| Material | E 30, ν 0.2, Gc 1.2e-4, l0 10, plane stress | E 210, ν 0.3, Gc 2.7e-3, l0 0.0075, plane strain | E 20.8, ν 0.3, Gc 5e-4, l0 0.03, plane stress |
| Loading | u_x = t · u_peak(AT2), dt 0.02, to t 1.5 | u_y top = t · 0.01, dt 0.01, to t 0.8 | u_y = -t · 0.08 on |x| ≤ 0.1, dt 0.01, to t 1.0 |
| Tolerance | 1e-6 | 1e-5 | 1e-4 |
| Reference (Python) | 74 steps, 46.6 s | 79 steps, 623 s; peak 0.72579 kN at step 56; drop at step 57 after 308 iterations | 99 steps, 304 s; peak 0.035271 kN at step 56 |
| Rust (same machine, release) | 2.4 s | 22 s | 12 s |

Agreement (from `VALIDATION.json`; full list there):

- Meshes are bit-identical (fingerprints of the node coordinates and connectivity).
- The number of staggered iterations is identical at **every** load step of all three examples
  (including the 308 iterations of the fracture step in example 2).
- Example 1: maximum damage at every step differs by 8.333559466198972e-12 relative;
  centre stress differs by 1.0792473270419046e-12 of the AT2 peak stress.
- Example 2, up to the peak: force differs by 1.5606483340127005e-12 relative and
  maximum damage by 4.198952507776388e-12 relative. Example 3's force differs by
  3.99638935610333e-11 relative up to the peak; maximum damage is not compared there.
- Nodal displacement is compared at example 1 step 50 and examples 2 and 3 step 56:
  maximum absolute differences divided by max |u| are 1.605198387714803e-10,
  8.491098239482427e-11 and 1.1185547443359639e-10, respectively (tolerance 1e-8).
- Including fracture: maximum force differences are 2.194403730101718e-7 kN (ex. 2)
  and 1.033201445777704e-6 kN (ex. 3). The comparison tolerances are 1e-5 and 1e-4 kN;
  these are not mathematical error bounds implied by the staggered residual tolerance.
  Example 2's fracture-step damage difference is 2.9327367075282496e-5; final damage
  differences are 3.085970368132962e-10 (ex. 2) and 4.112774565356858e-10 (ex. 3).
- **Crack side.** Examples 2 and 3 are symmetric about the notch plane. The crack runs along the
  element row just above (Rust) or just below (Python) it in example 2, and on the mirrored side
  in example 3; which side is chosen is decided by round-off. The tests accept the reference field
  or its mirror image, with the final damage differences reported above.
- The reference's own analytical check (example 1: centre stress vs the 1D AT2 homogeneous
  solution) holds to 7.3e-5 σ_c while max damage < 0.25.

Observations about the reference examples (not errors, but they matter when reading results):

- Example 2's sparse script refines only a 0.04 x 0.04 box around the notch tip (h = 0.00125 =
  l0/6); the crack then crosses elements 0.0253 wide, more than 3 l0, so the post-peak crack band
  is under-resolved. The dense script (`example2_dense.py`) uses a coarser box (16 x 8). Which
  mesh the paper reports is not known to us.
- The convergence test is an absolute residual norm, so its meaning depends on the units.

## How to run

```sh
# from the repository root, with the pinned toolchain
nix develop --command bash -c 'cd research/fracture/shauer-2025 && cargo test --release'
nix develop --command bash -c 'cd research/fracture/shauer-2025 && cargo run --release --bin reproduce -- ex2'
```

`reproduce` prints one JSON line per load step (pseudo time, displacement, force, iterations,
residual, damage range, elastic and fracture energy); `--fields DIR` writes nodal damage and
displacement per step; `--history` switches on the history field.

To regenerate the reference outputs: create a Python 3.12 virtual environment with
`numpy==2.1.3 scipy==1.14.1 matplotlib==3.9.2`, clone the reference at the commit above, and run
`python -I reference/run_reference.py <repo>/example2_sparse.py <out dir>`, then `reference/export.py`
and `reference/manifest.py` (their docstrings give the arguments). The wrapper only records values
the scripts compute (it replaces their VTK writer and `print`), it does not change the numerics.

## Engine reuse

The engine's sparse linear algebra is reused (`linalg::CscMatrix`, `symbolic_cholesky`,
`numeric_cholesky`, `sparse_cholesky_solve`). The engine has no 2D continuum element (its
quadrilaterals are MITC4 shells with 6 dofs per node), its Gauss rules are private to each element
and its assembly is built around structural dofs, so the Q4 kernels, quadrature and assembly here
are this crate's own (`fe.rs`, `solver.rs`).

## Limitations

- Reproduces a reference *code*, not the paper's published figures; experimental validation is
  out of scope.
- Hybrid AT2 without irreversibility by default; no bound constraints; no crack-closure contact.
  AT2 has no elastic stage: damage grows from the first load step.
- Axis-aligned structured meshes only for the examples (the kernels support general quads).
- The alternating scheme can need hundreds of iterations at unstable crack growth; it is not
  accelerated.
- Small strain, quasi-static, 2D.

## Upstream licence

Mesh generators, finite-element kernels, example setup and staggered solver are adapted from
[phasefield-jr-py](https://github.com/nathanshauer/phasefield-jr-py), © 2025 Nathan Shauer.
The complete, verbatim upstream MIT notice is in [LICENSE-phasefield-jr-py](LICENSE-phasefield-jr-py).

For mixed strain `[0.001, -0.1, 0]`, E=30 and ν=0.2 in plane stress, the reference split gives negative ψ+, but history mode starts H at zero and uses max(H, ψ+), so H cannot become negative or decrease and the damage solution is unchanged; reference mode intentionally retains the reference’s unclamped ψ+.

Browser comparison reads the committed `reference-results/ex2_damage_step{056,057,078}.csv` and `ex2_displacement_step056.csv` snapshots, allowing the native mirror case, Float32 roundoff for live fields and half a quantization bin for replay fields; no reference stress snapshot exists for example 2, so stress is checked independently from Q4 displacement gradients and interpolated damage and is excluded from the reference-agreement wording.

`wasm/build.sh` publishes JS, WASM, replay and viewer assets under immutable `research-wasm/builds/<SHA256>/` paths, retaining existing build directories locally; deployment artifacts should retain those directories for old tabs (a removed old build fails to load rather than loading a newer solver). The identity includes solver/glue/viewer bytes, research sources and committed reference data; replay headers carry it and their configuration, and Vite rejects stale build inputs before bundling the identity into the page and worker.
