# Changelog

Read next:
- current snapshot: [`CURRENT_STATUS.md`](/Users/unbalancedparen/projects/dedaliano/CURRENT_STATUS.md)
- benchmark/proof status: [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md)

This file is the historical record.
It should capture what changed, not what should be built next.

## Unreleased

### Added

#### Sparse buckling eigensolver milestone

- added `lanczos_buckling_eigen_sparse` in `engine/src/linalg/lanczos.rs`
- wired `solve_buckling_3d` to use the sparse buckling eigensolver path directly in the common unconstrained case, while keeping a dense path for small models and conservative fallback behavior
- added sparse shell gate coverage for sparse buckling parity
- confirmed the sparse buckling path handles the generalized `K phi = lambda (-Kg) phi` case by factorizing `K` and applying `K^{-1}(-Kg)` as the operator

#### Sparse modal eigensolver milestone

- added sparse Lanczos operators in `engine/src/linalg/lanczos.rs`, including sparse symmetric mat-vec and sparse shift-invert helpers
- wired `solve_modal_3d` to use the sparse eigensolver path directly in the common unconstrained case, skipping dense `K_ff` reconstruction there
- added sparse shell gate coverage for:
  - sparse faster than dense at representative shell size
  - deterministic sparse assembly
  - fill-ratio regression bounds
  - sparse modal parity
- added measured modal sparse-vs-dense timing coverage, including an `11.8×` speedup at `20×20 MITC4`
- measured AMD vs RCM fill behavior and confirmed AMD wins materially on larger shell meshes

#### Sparse reuse into 3D eigen and reduction workflows

- switched `solve_modal_3d`, `solve_buckling_3d`, `solve_harmonic_3d`, `guyan_reduce_3d`, and `craig_bampton_3d` from dense `n×n` assembly to sparse assembly plus dense `K_ff` conversion
- eliminated full dense `n×n` stiffness allocation in those workflows while leaving mass matrices, geometric stiffness, and eigensolver internals unchanged
- added sparse shell gate coverage for these reuse paths (`321` tests reported green)

#### Sparse assembly bottlenecks resolved

- rewrote `from_triplets` from per-column duplicate compaction to global sort + single-pass CSC build, eliminating the memmove-heavy hotspot
- added `k_ff`-only sparse assembly where full reactions are not needed
- sparse assembly on representative shell models moved from major regression to runtime win after those fixes

#### Measured sparse vs dense runtime gains

- added dense vs sparse benchmarks for all three shell families: MITC4, Quad9, and curved shell
- measured factorization-only speedups: 4.5× at 700 DOFs, 22× at 2600 DOFs, 77-89× at 5700 DOFs
- measured end-to-end speedup: 22× at 30×30 MITC4 (sparse 0.56s vs dense 12.3s)
- 0 pivot perturbations across all tested sizes and element families
- sparse wins on all families above ~500 DOFs; dense still faster at curved 8×8 (~450 DOFs)
- fill ratio grows from 2.6× (10×10) to 7.0× (50×50) under RCM ordering — not constant as previously estimated
- extended `bench_solve_3d_shell` to 20×20 and 30×30 mesh sizes
- added `bench_solve_3d_quad9` (5×5 to 15×15), `bench_solve_3d_curved` (8×8 to 24×24), and `bench_full_solve_3d_families` criterion benchmarks
- added `sparse_vs_dense_comparison` test in `bench_phases.rs` printing formatted speedup table

#### Sparse shell solve viability and deterministic assembly

- replaced broken etree-based symbolic Cholesky with direct left-looking symbolic factorization that correctly computes fill structure
- added two-tier pivot perturbation in numeric Cholesky: hard threshold (1e-20 × max_diag) rejects true singularities, soft threshold (1e-10 × max_diag) perturbs drilling-DOF pivots with controlled regularization
- added RCM (Reverse Cuthill-McKee) ordering with George-Liu pseudo-peripheral start node; fill ratio dropped from 673× to 1.8× on representative shell meshes
- eliminated dense LU fallback on shell models: sparse Cholesky now survives MITC4, MITC9, and curved-shell plates that previously always fell back to dense LU (87% of wall time → 0%)
- made all assembly paths (dense, sparse, parallel) deterministic by sorting HashMap element iterations by ID
- fixed DOF numbering determinism: when multiple supports target the same node, constraint flags are now merged with OR instead of nondeterministic HashMap overwrite
- added residual-based parity testing for ill-conditioned shell matrices: both sparse and dense solutions verified via ||Ku-f||/||f|| < 1e-6 instead of max-displacement comparison
- added benchmark gate tests: no-dense-fallback gate, fill-ratio gate (< 200×), and sparse-vs-dense residual parity gate
- wired pivot perturbation count and max perturbation into SolveTimings and solver diagnostics
- added `PivotInfo` to `NumericCholesky` for tracking perturbation statistics

#### Parallel 3D element assembly

- added `assemble_sparse_3d_parallel()` behind `#[cfg(feature = "parallel")]` using rayon
- unified all 8 element families (frame, truss, plate, quad, quad9, solid-shell, curved-shell, connector) into a single `AnyElement3D` enum for one `par_iter()` work pool
- pre-built element-id load index reduces load dispatch from O(elem × loads) to O(elem + loads)
- serial fallback via `#[cfg(not(feature = "parallel"))]` delegates to the existing `assemble_sparse_3d()`
- wired parallel path into `solve_3d()` as the default sparse assembly call
- added parity tests: flat-plate (4×4) and mixed frame+slab (4 columns + 16 quads + nodal + pressure loads)
- added criterion benchmarks: flat-plate up to 50×50 (2500 quads, ~15k DOFs) and mixed frame+slab up to 8-storey 8×8
- measured 2-6% speedup on MITC4 flat plates (lightweight per-element cost); later profiling showed CSC construction, not element math, is the real sparse-assembly bottleneck
- made `inclined_rotation_matrix` and `apply_inclined_transform_triplets` public for reuse
- fixed pre-existing `transform_force` scope issue in the 2D parallel path

#### Curved shell family and corrected hemisphere interpretation

- integrated the curved-shell family into the solver narrative as a production shell option for genuinely curved geometry
- established that the old hemisphere extremes were partly inflated by an `E` unit issue in the benchmark setup, and corrected that interpretation across the shell benchmark story
- added curved-shell benchmark coverage showing near-reference hemisphere behavior while preserving credible flat-shell and barrel-vault performance
- clarified that the shell stack is now `MITC4 + MITC9 + SHB8-ANS + curved shell`, with the remaining work focused on family guidance, workflow hardening, and shell-adjacent breadth

#### MITC9 and SHB8-ANS shell-family expansion

- integrated the `MITC9` 9-node quadrilateral shell through the full solver stack: dense+sparse assembly, mass, geometric stiffness, buckling, stress recovery, and all shell load types
- added `MITC9` acceptance/workflow models covering cantilever shell response, mixed beam+slab building workflow, cylindrical tank wall behavior, and modal plate extraction
- integrated the `SHB8-ANS` solid-shell family as a new shell path for the curved/non-planar frontier
- added shell-family frontier gates and comparative benchmarks across `MITC4`, `MITC9`, and `SHB8-ANS`
- established explicit shell selection guidance instead of treating shell support as a single undifferentiated element family
- shifted the shell roadmap from “add more shell breadth” to “harden and guide the multi-family shell stack”

#### Sparse-first 3D assembly and solve

- completed sparse 3D assembly for plates, quads, inclined supports, and diagnostics
- wired sparse path into `solve_3d()` for models with 64+ free DOFs
- 11-22x memory reduction on shell models (10×10 to 15×15 quad meshes)
- 13 new validation tests: 8 dense-vs-sparse parity, 2 performance benchmarks, 3 drilling regression

#### Shell validation and hardening

- added `QuadSelfWeight` body force load type (density, gx, gy, gz) with consistent Gauss integration, wired into assembly
- added mesh distortion robustness study: aspect ratio, parallelogram skew, trapezoidal taper, and random perturbation sweeps against Navier analytical
- added MacNeal-Harder pinched cylinder benchmark (R=300, L=600, t=3, E=3×10⁶) at 6×6 and 8×8 meshes
- added edge load validation: normal (in-plane) and tangential (axial extension) against beam theory
- added thermal gradient convergence sweep: 4×4, 8×8, 16×16 with monotonic convergence and tightened tolerances
- added warped element accuracy study: cantilever strip at 0%, 5%, 10%, 20% warp with graceful degradation tracking

#### Shell and nonlinear 3D workflows

- verified quad shell load vectors, mass, geometric stiffness, and quality metrics
- verified mixed DKT and MITC4 assembly and beam-shell DOF interfacing
- wired plate and quad stress recovery into the major nonlinear 3D solver families
- added beam-shell mixed benchmarks, shell buckling benchmarks, shell thermal benchmarks, and shell acceptance models
- added plate geometric stiffness contribution in 3D buckling
- added assembly diagnostics for distorted/low-quality plate and quad meshes
- added full nodal stress tensor recovery for MITC4 quads

#### Constraints and connectors

- pushed constraint-system unification further across solver families
- added connector-element assembly coverage across dense and sparse 2D/3D paths
- added constraint-force output in constrained solver paths
- added eccentric-connection integration tests and new constraint benchmark coverage
- propagated constraint-force output into plastic and fiber nonlinear solver paths
- added cross-solver constraint-force parity coverage

#### Benchmark gates and test infrastructure

- added explicit gate suites for:
  - constraints
  - contact
  - shells
  - reduction
  - sparse and conditioning paths
- added explicit CI gate steps for shell benchmarks, shell acceptance models, and constraint benchmarks before the full suite
- added conditioning diagnostics
- added sparse triplet assembly infrastructure
- added parallel element assembly behind the `parallel` feature flag
- extended criterion benchmarks with larger-model assembly and dense-vs-sparse solve comparisons
- switched CI and local default full-suite execution toward `cargo nextest`, with engine-local nextest config and Linux `mold` linker support

### Changed

#### MITC4 shell element: Bathe-Dvorkin ANS shear tying

- implemented true assumed natural strain (ANS) transverse shear interpolation (Bathe & Dvorkin, 1986) in the MITC4 quad shell element
- uses covariant strain tying at 4 edge midpoints with Jacobian-correct transformation at each Gauss point, eliminating transverse shear locking on thin plates
- added EAS-4 membrane softening to the MITC4 quad shell element via static condensation
- benchmark improvements: Scordelis-Lo 6×6 ratio from 0.14 to 0.80, Navier plate from 0.08 to 0.93, cantilever pressure from 0.10 to 1.05, buckling from wide tolerance to 1.02, modal frequencies from ~6× error to 0.1% error
- tightened shell benchmark tolerances across the board to lock in the formulation quality
- added `quad_check_jacobian()` for negative/degenerate Jacobian detection
- added moderate warping diagnostics (0.01-0.1 range) in assembly
- added dedicated thin-plate locking test (a/t = 1000) to prevent regression
- expanded CI shell benchmark gate to cover plate bending, Navier convergence, Scordelis-Lo, cantilever, hemisphere, and thin-plate tests
- EAS-4 is mathematically correct and stable, but pinched hemisphere remains a known membrane-locking limit; that boundary is now documented explicitly

#### MITC4 shell element: EAS-7 upgrade and curved-shell tracking

- replaced the 4-mode membrane enhancement with EAS-7 using a generic small-matrix inverse and 7 enhanced membrane modes
- Scordelis-Lo improved further to roughly 0.84 of reference with no regressions on Navier, buckling, modal, or existing shell gates
- added new shell tracking benchmarks for Raasch hook and twisted beam as explicit non-planar / curved-shell formulation-limit indicators
- clarified that the remaining shell decision is no longer `EAS-4 vs EAS-7`; it is `bounded MITC4+EAS-7 vs broader shell family`

### Fixed

#### Deterministic DOF numbering and assembly

- fixed 3D DOF numbering: multiple supports targeting the same node now merge constraint flags with OR instead of nondeterministic HashMap overwrite
- fixed 2D DOF numbering: supports sorted by ID for deterministic overwrite order
- fixed nondeterministic assembly: all element iterations in dense, sparse, and parallel assembly paths now sorted by element ID
- fixed point-of-contraflexure inflection detection: rewrote to use nodal moment profile approach that handles inflection points on element boundaries

#### Solver quality milestone

- fixed the staged fixed-end-force accumulation bug by tracking cumulative loads across stages
- corrected four pre-existing TME validation expectations involving formulas, sign conventions, and a wrong midspan-node assumption
- added residual-checked Cholesky fallback: if ||Kff*u - f||/||f|| > 1e-6, the sparse 3D solve falls back to dense LU

### Validation

- latest reported full-suite status reached `5906` passing tests with `0` failures
