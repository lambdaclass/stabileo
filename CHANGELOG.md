# Changelog

Read next:
- current snapshot: [`CURRENT_STATUS.md`](/Users/unbalancedparen/projects/dedaliano/CURRENT_STATUS.md)
- benchmark/proof status: [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md)

This file is the historical record.
It should capture what changed, not what should be built next.

## Unreleased

### Added

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

#### Solver quality milestone

- fixed the staged fixed-end-force accumulation bug by tracking cumulative loads across stages
- corrected four pre-existing TME validation expectations involving formulas, sign conventions, and a wrong midspan-node assumption
- added residual-checked Cholesky fallback: if ||Kff*u - f||/||f|| > 1e-6, the sparse 3D solve falls back to dense LU

### Validation

- latest reported full-suite status reached `5872` passing tests with `0` failures
