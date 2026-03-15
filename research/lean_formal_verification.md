# Lean Formal Verification Research

## Purpose

This document defines what a Lean-based formal verification program would mean for Dedaliano, which solver areas are the best fit, and where the proof ROI is highest.

It is not a claim that the whole solver should be proved end to end.
It is a research plan for where Lean makes technical sense and how to sequence that work without confusing mathematical assurance with benchmark validation.

Read with:

- [`VERIFICATION.md`](/Users/unbalancedparen/projects/dedaliano/VERIFICATION.md)
- [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)
- [`engine/src/solver/dof.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/dof.rs)
- [`engine/src/solver/constraints.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/constraints.rs)
- [`engine/src/solver/assembly.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/assembly.rs)
- [`engine/src/solver/linear.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/linear.rs)

## Short Answer

Lean is a good fit for Dedaliano if the target is:

- high-assurance proofs for the linear algebraic core
- explicit solver invariants that survive implementation changes
- a proof-backed reference model for property testing and solver design

Lean is a bad fit if the target is:

- proving the entire current Rust solver implementation line by line
- replacing benchmark validation with theorem proving
- trying to prove all nonlinear, contact, shell, and floating-point behavior at once

The most sensible verified subset is:

1. DOF numbering and partitioning
2. element-to-global assembly invariants
3. constraint transformation correctness
4. reduced linear equilibrium and reaction recovery

That subset is small enough to finish, broad enough to matter, and central enough that many later solver features depend on it.

## What Formal Verification Would Mean Here

For this repository, formal verification should be understood in layers.

### Layer 1: Mathematical Model Verification

Define an abstract FEM core in Lean:

- nodes
- local DOFs
- global DOFs
- element connectivity
- element stiffness contributions
- support and prescribed-displacement partitions
- linear constraints
- reduced equilibrium systems

At this layer, the statements are about exact mathematics, not Rust and not floating-point arithmetic.

### Layer 2: Algorithm Verification

Prove that small algorithms implement the model correctly:

- DOF numbering produces a total disjoint partition
- assembly inserts each local contribution into the right global slots
- constraint elimination via a transformation matrix preserves the constrained solution space
- block partitioning and reaction recovery match the original equilibrium system

### Layer 3: Reference-Kernel Verification

Build a small executable reference kernel from the verified model:

- exact or rational linear algebra for toy problems
- a small finite-dimensional matrix backend
- reference assembly and reduction routines

This kernel is not meant to replace the Rust engine.
It is meant to provide a mechanically checked specification and a source of truth for high-value tests.

### Layer 4: Refinement Toward Production

This is where the work becomes expensive.

Options:

- prove that a narrow Rust kernel matches the Lean model
- generate small verified kernels from Lean and cross-check them against Rust
- use Lean proofs to drive property tests instead of proving the production implementation directly

For Dedaliano, this layer should start only after the mathematical core is complete.

### Layer 5: Verified Numerics

This would add floating-point error bounds, tolerances, and convergence assumptions.
It is possible, but it is a much larger research program than the first three layers.

## ROI Ranking

### A+: Best Near-Term ROI

#### 1. DOF Numbering And Partitioning

Primary file:

- [`engine/src/solver/dof.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/dof.rs)

Why this is strong:

- discrete and easy to specify
- reused by every solver path
- mistakes here poison all downstream results
- detached from floating-point complexity

Theorems to prove:

- every active `(node_id, local_dof)` receives exactly one global index
- free and restrained DOFs form a disjoint partition
- the numbering is total over all active DOFs
- the free block is numbered before the restrained block
- element DOF extraction preserves node and local ordering

Proof effort: low

Value: very high

#### 2. Constraint Transformation Correctness

Primary file:

- [`engine/src/solver/constraints.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/constraints.rs)

Why this is strong:

- the implementation already uses a clean textbook transformation method
- constraints are correctness-critical and easy to get subtly wrong
- the mathematical statement is crisp: `u_full = C u_indep`

Theorems to prove:

- any displacement recovered by `C` satisfies the declared constraints
- transformed stiffness `C^T K C` represents equilibrium restricted to the constrained subspace
- solving the reduced system and mapping back gives a valid full-space constrained solution
- equal-DOF and simple rigid-link constraints satisfy the intended equations

Proof effort: moderate

Value: extremely high

#### 3. Linear Block Solve Correctness

Primary file:

- [`engine/src/solver/linear.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/linear.rs)

Why this is strong:

- this is the cleanest solver core in the repo
- many later workflows build on the same partitioning logic
- the proof target is algebraic, not numerical-heuristic

Theorems to prove:

- the `ff/fr/rf/rr` partition is a correct block decomposition
- if `K_ff` is invertible, the recovered free displacement solves reduced equilibrium
- reconstructed full displacement satisfies the original partitioned equations
- reaction recovery matches the restrained-equation residual

Proof effort: moderate

Value: very high

### A: Strong ROI

#### 4. Assembly Invariants

Primary file:

- [`engine/src/solver/assembly.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/assembly.rs)

Why this is strong:

- assembly is central and reused everywhere
- the right proof target is invariant-level, not every implementation branch

Theorems to prove:

- global assembly is the sum of element contributions inserted at the mapped DOFs
- if all local stiffness matrices are symmetric, the assembled global matrix is symmetric
- support-spring contributions only modify the intended diagonal terms
- assembly is permutation-invariant up to deterministic index ordering

Proof effort: moderate

Value: high

#### 5. Element Transformation Properties

Primary targets:

- [`engine/src/element/frame.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/element/frame.rs)
- [`engine/src/element/transform.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/element/transform.rs)

Theorems to prove:

- transformed stiffness preserves symmetry
- coordinate transforms preserve quadratic energy forms
- rigid-body modes remain zero-energy modes where expected

Proof effort: moderate to high

Value: high, but proof count scales with element-family breadth

### B: Useful But Secondary

#### 6. Sparse vs Dense Equivalence

Primary targets:

- [`engine/src/solver/sparse_assembly.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/sparse_assembly.rs)
- [`engine/src/solver/linear.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/linear.rs)

Theorems to prove:

- sparse assembly denotes the same bilinear form as dense assembly
- sparse and dense linear solve paths are equivalent in exact arithmetic

Proof effort: moderate to high

Value: medium

This matters more once the linear core is already verified.

#### 7. Input Well-Formedness And Output Shape Invariants

Primary targets:

- [`engine/src/types/input.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/types/input.rs)
- [`engine/src/types/output.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/types/output.rs)

Theorems to prove:

- well-formed models induce valid active DOF sets
- result vectors can be reconstructed into node/element outputs without index ambiguity

Proof effort: low to moderate

Value: medium

### C Or Worse: Poor Near-Term ROI

#### 8. Modal And Buckling Proofs

Possible, but not first.

Why lower ROI:

- generalized eigenproblems are still mathematically clean
- but they add more infrastructure before the linear static core is fully pinned down

Best delayed until the block linear core is finished.

#### 9. Nonlinear, Contact, Fiber, Arc-Length, Staged Construction

Primary targets:

- [`engine/src/solver/pdelta.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/pdelta.rs)
- [`engine/src/solver/corotational.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/corotational.rs)
- [`engine/src/solver/material_nonlinear.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/material_nonlinear.rs)
- [`engine/src/solver/fiber_nonlinear.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/fiber_nonlinear.rs)
- [`engine/src/solver/contact.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/contact.rs)
- [`engine/src/solver/arc_length.rs`](/Users/unbalancedparen/projects/dedaliano/engine/src/solver/arc_length.rs)

Possible: yes

Near-term ROI: poor

Reason:

- specifications become assumption-heavy
- theorems become local and conditional
- implementation details depend on tolerances, heuristics, and convergence control

#### 10. Full Production Rust + Floating-Point End-To-End Proof

Possible in principle.
Not the right first research program.

## Recommended Verified Core

The best Lean-worthy subset for Dedaliano is:

1. finite index sets for nodes and DOFs
2. DOF partitioning into free and restrained sets
3. abstract element assembly into a global stiffness matrix
4. linear MPC transformation matrices
5. partitioned linear equilibrium
6. reaction recovery

This subset maps directly onto the current codebase and covers the highest-leverage correctness surface.

## Proposed Lean Architecture

### Module 1: `Fem.Indexing`

Core objects:

- node identifiers
- local DOF identifiers
- global DOF identifiers
- active DOF predicates
- free and restrained partitions

Main goal:

- prove partition, uniqueness, and lookup theorems

### Module 2: `Fem.Assembly`

Core objects:

- element connectivity
- local stiffness matrices
- global scatter/insertion operator

Main goal:

- define assembly as a finite sum over element contributions
- prove symmetry and support-update invariants

### Module 3: `Fem.Constraints`

Core objects:

- dependent and independent DOFs
- linear constraint equations
- transformation matrix `C`

Main goal:

- prove that `range(C)` is the constrained displacement space
- prove `C^T K C` is the correct reduced operator

### Module 4: `Fem.LinearStatic`

Core objects:

- partitioned load and displacement vectors
- block matrices
- reduced equilibrium
- reaction reconstruction

Main goal:

- prove equivalence between full equilibrium and the reduced system under the partition assumptions

### Module 5: `Fem.ReferenceKernel`

Core objects:

- executable small-matrix routines
- toy-model solve path

Main goal:

- produce trusted reference behavior for small examples and property tests

## What To Keep Abstract

Keep these abstract in the first proof program:

- actual floating-point arithmetic
- sparse matrix storage details
- all element formulas except the minimum needed for examples
- performance concerns
- shell-specific and nonlinear constitutive details

Abstract first, then refine later.
Trying to prove the exact current Rust representations too early will slow the research badly.

## What To Encode Exactly

Encode these exactly from the current solver architecture:

- free-vs-restrained partition semantics
- ordering convention of free DOFs before restrained DOFs
- transformation-method constraints
- block solve/reaction formulas
- the meaning of assembly as element scatter-add into global coordinates

These are stable enough to justify exact statements.

## Concrete Theorem Ladder

Suggested proof order:

1. `dof_partition_total`
   Every active DOF is either free or restrained.
2. `dof_partition_disjoint`
   No active DOF is both free and restrained.
3. `dof_numbering_unique`
   The numbering map is injective on active DOFs.
4. `element_dof_lookup_correct`
   Extracted element DOF lists correspond to the numbering map in node/local order.
5. `assembled_entry_is_sum_of_contributions`
   Each global matrix entry equals the sum of all contributing local entries.
6. `assembly_preserves_symmetry`
   Symmetric local matrices assemble to a symmetric global matrix.
7. `constraint_transform_satisfies_equations`
   Any `u = C q` satisfies the declared linear constraints.
8. `reduced_equilibrium_equivalent`
   Reduced equilibrium on `q` is equivalent to full constrained equilibrium on `u`.
9. `partitioned_linear_solve_correct`
   If `K_ff` is invertible, the recovered free displacement solves the free block.
10. `reaction_recovery_correct`
    Reconstructed reactions satisfy the restrained block equation.

This is enough for a real first research milestone.

## Research Phases

### Phase 0: Foundation

Goal:

- create a standalone Lean workspace for the FEM core
- decide whether to depend directly on `mathlib` matrix APIs or wrap them in a narrower interface

Deliverables:

- repo structure
- theorem naming conventions
- a compact set of finite-index utilities

### Phase 1: Verified Indexing And Partitioning

Goal:

- finish the DOF model and partition proofs

Success criteria:

- all `A+` indexing theorems above are proved

### Phase 2: Verified Constraints

Goal:

- finish the transformation-method proof story for equal-DOF and simple rigid-link style constraints

Success criteria:

- prove `u = C q`
- prove reduced-equilibrium equivalence

### Phase 3: Verified Linear Static Core

Goal:

- prove the partitioned linear solve and reaction reconstruction

Success criteria:

- small end-to-end theorem from assembled model to recovered reactions

### Phase 4: Rust Cross-Checking

Goal:

- connect Lean proofs back to the production solver via property tests and reference-model comparisons

Success criteria:

- generated or hand-written small-model fixtures checked against the Rust engine
- proof-derived invariants used in Rust property tests

### Phase 5: Optional Extensions

Possible next steps:

- sparse/dense equivalence
- modal generalized eigenproblems
- selected element-family energy invariants

## Recommended Repository Shape

The cleanest setup is a separate top-level Lean workspace, for example:

```text
lean/
  lakefile.lean
  Dedaliano/
    Fem/Indexing.lean
    Fem/Assembly.lean
    Fem/Constraints.lean
    Fem/LinearStatic.lean
    Fem/ReferenceKernel.lean
```

Reasons:

- keeps Lean dependencies isolated from the Rust build
- makes the proof program legible as a first-class subsystem
- avoids pretending the production engine is already verified

## How Lean Should Interact With The Rust Solver

The preferred relationship is:

1. Lean proves the abstract linear core.
2. Lean definitions drive theorem-backed invariants.
3. Rust property tests and differential tests are expanded from those invariants.
4. Small Rust examples are cross-checked against the Lean reference model.

This is a better research strategy than trying to prove the current Rust implementation directly on day one.

## What Success Would Look Like

A successful first Lean research milestone would let Dedaliano say:

- the linear algebraic core has a mechanically checked specification
- DOF partitioning, constraint reduction, assembly invariants, and reaction recovery are proved at the model level
- the production solver is still validated by benchmarks and tests, but now anchored to a stronger formal core

That is already a meaningful and differentiated assurance story.

## Recommendation

If Dedaliano starts a Lean verification program, it should begin with:

1. DOF partitioning
2. transformation-method constraints
3. partitioned linear equilibrium
4. reaction recovery
5. assembly symmetry and scatter-add correctness

Do not start with shells, nonlinear workflows, or floating-point proofs.

Those are later research topics.
The linear core is where the proof ROI is best and where the result is most likely to finish.
