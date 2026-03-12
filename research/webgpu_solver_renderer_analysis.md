# WebGPU for Dedaliano: Solver vs Renderer

Read next:
- current snapshot: [CURRENT_STATUS.md](/Users/unbalancedparen/projects/dedaliano/CURRENT_STATUS.md)
- solver priorities: [SOLVER_ROADMAP.md](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)
- product execution: [PRODUCT_ROADMAP.md](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md)

This note analyzes where WebGPU is a good fit for Dedaliano and where it is not.

The split matters:
- `renderer` work is primarily a product and visualization problem
- `solver` work is primarily a numerical-methods and performance problem

Those are not the same ROI.

## Short Answer

- `WebGPU for rendering`: good fit, but only if the current viewport becomes a real bottleneck
- `WebGPU for solver acceleration`: possible in selective areas, but not the right first move for the current direct sparse CPU solver

Best immediate candidates:
1. renderer / visualization
2. large postprocessing kernels
3. later, iterative-solver kernels if Krylov methods are added

Poor early candidates:
1. sparse direct factorization
2. ordering / graph algorithms
3. small mixed models where GPU overhead dominates

## 1. WebGPU for the Renderer

### Why it makes sense

Rendering is naturally GPU-shaped:
- mesh drawing
- contour shading
- deformed shape visualization
- picking and highlighting
- animated modes and time-history playback
- large shell/result-field overlays

WebGPU is a good fit when the product needs:
- smoother interaction on large shell-heavy models
- more demanding stress/contour visualization
- more complex highlighting and selection
- a longer-term modern graphics pipeline than WebGL

### Where it helps most

- `Large shell meshes`
  Stress contours, deformed shapes, mode shapes, thermal fields, and shell-family comparisons.

- `Result overlays`
  Many simultaneous views:
  - undeformed + deformed
  - shell stresses
  - constraint-force overlays
  - support/diagnostic highlights

- `Interaction`
  Picking, hover, click-to-focus, diagnostic highlighting, section cuts, and result filtering.

- `Animation`
  Modal shape playback, harmonic response, time-history sequences.

### What it does not solve

- Solver runtime
- Sparse factorization
- Ordering/fill
- Nonlinear convergence

So WebGPU rendering should be treated as a visualization/product upgrade, not a solver-performance fix.

### Recommendation

Use WebGPU for rendering only if profiling shows that the current viewer is becoming the bottleneck on:
- shell-heavy models
- large result fields
- interactive contour updates
- animated responses

If the current problems are still mostly:
- onboarding
- diagnostics UX
- reports
- interoperability
- solver runtime

then renderer migration should not be the first product priority.

## 2. WebGPU for the Solver

### What does not make sense first

#### Sparse direct factorization

This is the current core solve path:
- sparse Cholesky
- symbolic structure
- ordering
- fill control

That class of work is a poor first WebGPU target because:
- sparse factorization is irregular
- fill and pivot behavior are hard to map well to browser GPU kernels
- ordering/fill logic is not GPU-friendly
- data movement and synchronization can erase gains

This is especially true while Dedaliano is still improving:
- sparse eigensolver depth
- factorization/runtime balance
- ordering policy

#### Ordering / graph algorithms

`AMD`, `RCM`, fill-reduction logic, elimination trees, and related graph operations are not good early GPU wins.

### What does make sense later

#### Iterative solver kernels

If Dedaliano adds:
- `PCG`
- `GMRES`
- `MINRES`

then WebGPU becomes much more plausible for:
- sparse mat-vec
- dot products
- vector updates
- residual evaluation

These are much more GPU-shaped than sparse direct factorization.

This means WebGPU for the solver starts making real sense only after:
- Krylov methods exist
- preconditioner strategy exists
- the CPU direct sparse path is already healthy enough to compare against

#### Batched element kernels

Large uniform shell meshes could potentially benefit from GPU execution of:
- element stiffness/load evaluation
- shell postprocessing kernels
- stress recovery / nodal accumulation

But this is only worth it after profiling proves that element math dominates.

Right now, recent profiling has shown the real performance bottlenecks shifting through:
- sparse matrix construction
- overbuilding dense/sparse forms
- factorization / ordering behavior

not raw per-element floating-point work in the common cases.

#### Large postprocessing kernels

This is the best solver-adjacent GPU target before full iterative methods:
- stress recovery
- nodal averaging
- contour field preparation
- repeated result-field transforms for visualization

These are more regular and easier to parallelize than direct sparse solves.

## Current Dedaliano-Specific Recommendation

### Good candidate now

- `Research only`
  Keep a WebGPU track alive for:
  - renderer architecture
  - result-field visualization
  - later iterative-solver kernels

- `Potential product candidate`
  WebGPU renderer, but only after profiling proves the viewport is a real bottleneck on large shell/result models.

### Maybe later

- `GPU-accelerated postprocessing`
  Especially shell stresses, contours, nodal averaging, and mode-shape visualization.

- `GPU iterative linear algebra`
  Only after Krylov methods are added and the CPU sparse baseline is already strong.

### Poor fit now

- replacing sparse Cholesky with WebGPU
- moving ordering/fill logic to GPU
- solving current scale problems by GPU rewrite instead of direct sparse-path hardening

## Priority Order

If Dedaliano wants to explore WebGPU responsibly, the order should be:

1. `profile the current renderer`
2. `use WebGPU for visualization only if it is actually a bottleneck`
3. `consider GPU postprocessing kernels`
4. `add iterative solvers and preconditioners on CPU first`
5. `only then evaluate WebGPU iterative kernels`

Not:

1. rewrite sparse direct solves for GPU
2. rewrite the whole app in Rust
3. assume GPU automatically improves structural FEM

## Conclusion

WebGPU is a strong fit for:
- rendering
- visualization
- result-field processing

WebGPU is not the best first answer for:
- sparse direct structural solves
- ordering/fill problems
- the current linear-solver bottlenecks

So the practical answer is:

- `renderer`: yes, when/if viewport scale makes it worthwhile
- `solver`: yes, selectively later, mainly if Dedaliano adds iterative methods

## Long-Term GPU Research Track

There is substantial research literature around GPU-accelerated FEM and structural solvers, but the highest-value directions are not "move the current sparse direct solver to GPU unchanged."

The most relevant long-term tracks for Dedaliano are:

### 1. GPU iterative solvers

Best-fit research direction for structural FEM on GPU:
- `CG` / `PCG`
- `GMRES`
- `MINRES`
- block Krylov variants

Why relevant:
- sparse matrix-vector products
- dot products
- vector updates
map naturally to GPU kernels.

### 2. GPU sparse linear algebra kernels

Supporting pieces for iterative methods:
- sparse mat-vec
- sparse triangular solves
- preconditioner application

These are far more realistic than GPU sparse direct factorization as an early solver-GPU target.

### 3. GPU FEM assembly

Batched element stiffness/load evaluation can make sense for:
- large uniform shell meshes
- repeated element-level postprocessing
- heavier shell families where per-element work is significant

This is plausible later, but only after profiling proves element math dominates rather than sparse data-structure overhead or factorization.

### 4. GPU eigensolvers

Mostly iterative eigensolver research:
- `Lanczos`
- `Arnoldi`
- `LOBPCG`

This becomes relevant if Dedaliano continues pushing sparse eigensolver depth.

### 5. Matrix-free FEM on GPU

A stronger long-term research direction than GPU sparse direct factorization:
- do not explicitly assemble the full global matrix
- apply the operator directly
- combine with iterative solvers / multigrid

This is the most plausible "deep GPU solver" direction if Dedaliano ever wants a major GPU solver program.

### 6. GPU direct sparse solvers

Research exists, but this is not the first practical target:
- sparse `Cholesky`
- sparse `LDL^T`
- sparse `LU`

Why lower-priority:
- fill-in
- ordering
- pivoting
- irregular memory access
make this much harder than iterative approaches.

### 7. Domain decomposition and multigrid on GPU

Important for very large FEM systems, but higher complexity than the near-term Dedaliano roadmap.

## Recommended GPU Research Order

If Dedaliano adds a long-term GPU program, the sensible order is:

1. `WebGPU renderer and result visualization`
2. `GPU postprocessing kernels`
3. `Iterative linear solver research on CPU first`
4. `GPU acceleration for iterative solver kernels`
5. `Maybe batched shell element kernels`
6. `Maybe matrix-free structural operators`
7. `Only much later, if justified: GPU sparse direct factorization`

## Practical Long-Term Conclusion

The strongest GPU research path for Dedaliano is:

- keep direct sparse solves on CPU for now
- improve the renderer and visualization pipeline on WebGPU
- explore GPU acceleration later through iterative methods and matrix-free/operator-style workflows

That is a much more realistic and higher-ROI trajectory than trying to port the current sparse direct solver architecture to GPU as-is.
