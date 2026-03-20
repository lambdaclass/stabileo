# CHOLMOD + NVIDIA GPU Research

Read next:
- [SOLVER_ROADMAP.md](/Users/unbalancedparen/projects/dedaliano/docs/roadmap/SOLVER_ROADMAP.md)
- [numerical_methods_gap_analysis.md](numerical_methods_gap_analysis.md)
- [webgpu_solver_renderer_analysis.md](webgpu_solver_renderer_analysis.md)

This note evaluates whether Dedaliano should use `CHOLMOD` with NVIDIA GPU acceleration, and if so, in what architecture.

It is not a generic GPU pitch.
The question is narrower:

- what `CHOLMOD` actually provides
- what NVIDIA has publicly claimed about its GPU path
- whether that fits Dedaliano's current solver and product surface
- how much speedup is realistic relative to the current codebase

## Short Answer

- `Yes`, Dedaliano could use `CHOLMOD` in a native backend.
- `No`, it does not fit the current browser/WASM solver path directly.
- `Yes`, a remote server architecture could expose it to the web app.
- `Maybe`, it improves large sparse direct solves materially.
- `No`, it is unlikely to be the next biggest end-to-end speed win relative to the current sparse CPU path.

The strongest immediate case is:

- keep the current WASM/local solver for small and interactive work
- add an optional remote native solve tier for large shell-heavy or batch workloads
- evaluate `CHOLMOD` CPU first
- evaluate `CHOLMOD` GPU second

## What The Sources Actually Say

### NVIDIA's public CHOLMOD page

NVIDIA's `CHOLMOD` page states:

- `CHOLMOD` has supported GPU acceleration since `2012`
- the GPU path keeps the same interface
- enabling it can be as simple as setting an environment variable
- the published benchmark on that page reported up to `3.5x` factorization speedup and `2.4x` average speedup on selected large SPD matrices

Important qualification:

- this is historical NVIDIA material based on older hardware and an older `SuiteSparse` release
- it is evidence that the approach is real, not evidence that Dedaliano would see the same speedup today

Source:
- NVIDIA Developer, `CHOLMOD`: https://developer.nvidia.com/cholmod

### Current SuiteSparse state

The official `SuiteSparse` repository still documents CUDA support for `CHOLMOD`.
The repo readme and release notes show:

- `SUITESPARSE_USE_CUDA` exists
- `CHOLMOD_USE_CUDA` exists
- both must be enabled for CUDA-backed `CHOLMOD`
- newer releases still mention `CHOLMOD` CUDA-related work

This matters because it means the GPU path is not just a dead historical branch on an NVIDIA marketing page.

Sources:
- SuiteSparse GitHub repository: https://github.com/DrTimothyAldenDavis/SuiteSparse
- SuiteSparse releases: https://github.com/DrTimothyAldenDavis/SuiteSparse/releases

## What Dedaliano Already Has

The current codebase already has a strong sparse CPU path:

- pure-Rust CSC matrix storage
- custom sparse Cholesky
- ordering
- sparse-first 3D assembly
- residual checks
- dense fallback discipline
- measured sparse-vs-dense wins already recorded in repo docs

Relevant local evidence:

- [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/docs/BENCHMARKS.md)
  current measured sparse wins:
  - `4.5x` at ~700 DOFs
  - `22x` at ~2600 DOFs
  - `77-89x` factorization-only at ~5700 DOFs
  - `22x` end-to-end at `30x30 MITC4`
- [`engine/src/linalg/sparse.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/linalg/sparse.rs)
  custom CSC storage
- [`engine/src/linalg/sparse_chol.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/linalg/sparse_chol.rs)
  current sparse Cholesky implementation
- [`engine/src/solver/linear.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/linear.rs)
  current sparse 3D solve path, regularization, residual verification, and fallback behavior
- [`engine/src/lib.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/lib.rs)
  WASM-exported solver API

This changes the research conclusion:

- GPU `CHOLMOD` is not competing with a weak baseline
- it is competing with a solver that is already sparse-first and already much faster than the old dense path

## Architectural Fit

### 1. Direct replacement in the browser

This is not a fit.

Reasons:

- Dedaliano exposes the solver through `wasm-bindgen`
- the web app loads and runs the solver as WASM
- native `SuiteSparse` plus CUDA does not map to that browser execution model

So `CHOLMOD` is not a direct replacement for the current shipped web solver.

### 2. Native local build

This is a fit.

Dedaliano could add:

- a native-only Cargo feature such as `cholmod-native`
- FFI bindings or a small C wrapper
- a backend abstraction around sparse factorization

This would preserve the current WASM path while enabling native benchmarking.

### 3. Remote solve service

This is the strongest fit if the goal is web access to CUDA.

Shape:

- browser sends model JSON to a backend
- backend runs native Rust
- backend uses the current engine data model
- factorization backend is switched between:
  - current Rust sparse Cholesky
  - `CHOLMOD` CPU
  - `CHOLMOD` GPU
- backend returns the same result schema the web app already expects

This avoids rewriting the frontend around a different solver contract.

## Likely Performance Impact

### What is measured already

Repo-local measured gains are already large on the sparse CPU path:

- sparse over dense is already `22x` end-to-end on one representative shell benchmark
- modal, harmonic, and reduction workflows already have large measured wins from sparse reuse

That means the remaining upside from `CHOLMOD` GPU should be estimated against the current sparse CPU path, not against dense LU and not against an old JavaScript solver.

### Realistic expectations

The safest estimate is:

- `small models`: slower overall on a remote GPU service
- `medium models`: often similar, or only modestly faster
- `large factorization-heavy SPD models`: possibly meaningfully faster
- `full workflow end-to-end`: less improvement than raw factorization speedup

Dedaliano-specific inference:

- `1.2x-2x` end-to-end is plausible on medium-to-large cases if factorization dominates
- `2x-4x` on the factorization-heavy portion is plausible on favorable large models
- `10x+` end-to-end over the current sparse CPU path should not be the planning assumption

This is an inference from:

- NVIDIA's historical `2.4x` average / `3.5x` max factorization claims
- the fact that Dedaliano already removed the far larger dense-vs-sparse gap
- the fact that end-to-end workflows include assembly, postprocess, data transfer, queueing, and non-factorization work

## Where It Helps Most

- very large SPD linear solves
- shell-heavy static solves where factorization dominates wall time
- repeated solves on a native server where the matrix is too large for comfortable browser execution
- premium/batch workloads where queueing and remote execution are acceptable

## Where It Helps Less

- tiny and interactive models
- latency-sensitive edit/solve/edit loops
- workflows bottlenecked by eigensolvers, reduction internals, or postprocessing rather than the main linear solve
- anything running purely in-browser

## Product Tradeoffs

Moving to a remote CUDA path changes the product:

- local/offline execution becomes optional instead of universal
- privacy and data residency become product concerns
- auth, rate limiting, job isolation, and queue management become mandatory
- solver versioning becomes a backend release problem
- cloud cost becomes part of every large-model solve

This is not just a linear algebra choice.
It is a platform choice.

## Best Integration Shape

The best practical sequence is:

1. `Add a factorization backend abstraction`
   Keep solver inputs/outputs stable.

2. `Benchmark native Rust sparse vs CHOLMOD CPU`
   This is the cleanest first comparison.

3. `Benchmark CHOLMOD CPU vs CHOLMOD GPU`
   Only on representative Dedaliano models:
   - MITC4
   - MITC9
   - curved shell
   - mixed frame+shell
   - modal/buckling/harmonic cases where relevant

4. `Ship remote solve only if benchmarks justify it`
   Remote infrastructure should not be built from optimism alone.

5. `Keep hybrid routing`
   - browser/local for fast interactive work
   - remote/native for large or premium workloads

## Recommendation

Recommended conclusion:

- `Research-worthy`: yes
- `Immediate default backend replacement`: no
- `Native benchmark project`: yes
- `Remote premium solve tier`: yes, if benchmarked wins justify the systems complexity

If Dedaliano wants the highest-ROI next step, it should not start by replacing the current Rust sparse path.
It should start by building a backend abstraction and collecting hard numbers on real repository benchmark models.

## Suggested Benchmark Matrix

Compare these backends:

1. `Current Rust sparse CPU`
2. `CHOLMOD CPU`
3. `CHOLMOD GPU`

Measure:

- symbolic factorization time
- numeric factorization time
- solve time
- full workflow time
- memory footprint
- residual quality
- crossover size where remote execution becomes worthwhile

Use these workload families:

- linear static shells
- mixed shell + frame
- modal
- buckling
- harmonic
- reduction workflows

## Bottom Line

`CHOLMOD` plus NVIDIA GPU acceleration is a credible native-server research direction for Dedaliano.

It is not a clean replacement for the current browser solver.
It is not obviously the next biggest speed lever relative to the current sparse CPU path.
It is most defensible as:

- an optional native backend
- benchmarked first on real Dedaliano workloads
- exposed later through a remote solve tier if the measured gains justify the product and infrastructure cost

## Sources

- NVIDIA Developer, `CHOLMOD`
  https://developer.nvidia.com/cholmod
- SuiteSparse official repository
  https://github.com/DrTimothyAldenDavis/SuiteSparse
- SuiteSparse releases
  https://github.com/DrTimothyAldenDavis/SuiteSparse/releases
