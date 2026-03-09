# Verification Strategy

## Scope

This document explains how Dedaliano should build solver trust.

It is not the benchmark ledger and it is not the product roadmap.

- Use [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md) for benchmark status and solver maturity.
- Use [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md) for solver sequencing and implementation order.
- Use [`PRODUCT_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md) for app and workflow sequencing.
- Use [`POSITIONING.md`](/Users/unbalancedparen/projects/dedaliano/POSITIONING.md) for the business meaning of solver trust.

## Goal

The goal is not to claim that the entire solver is "formally verified."

The goal is to make correctness visible and credible through a layered verification program:

- analytical validation
- published benchmarks
- cross-validation against trusted references
- regression discipline
- invariant and property-based testing
- fuzzing
- selective proof-oriented rigor on small critical kernels
- real-model acceptance testing

In practice, the strongest identity is:

`an open, browser-native structural solver with unusually deep public proof of correctness`

## Verification Layers

### 1. Unit Tests

Use unit tests for compact mathematical building blocks:

- element stiffness matrices
- fixed-end forces
- coordinate transformations
- mass matrices
- geometric stiffness terms
- damping terms
- postprocessing formulas

These tests catch sign, indexing, and formula errors early.

### 2. Analytical Validation

Use closed-form and textbook references for:

- beams
- frames
- trusses
- buckling
- modal frequencies
- thermal loads
- settlements
- Timoshenko beam behavior
- cable statics
- prestress and staged sanity checks

This is the first public proof layer for structural mechanics correctness.

### 3. Reference Benchmark Validation

Use published benchmark families and solver cross-checks such as:

- NAFEMS
- ANSYS Verification Manual
- Code_Aster
- SAP2000
- OpenSees
- Robot Structural Analysis
- STAAD.Pro

This is the strongest external trust layer and should remain the center of the public correctness story.

### 4. Differential and Consistency Testing

Use differential testing for:

- dense vs sparse assembly
- equivalent 2D vs 3D formulations
- small-load linear vs nonlinear consistency
- reduced vs unreduced systems
- locked fixture baselines

Differential testing should be about consistency in the current engine, not parity with deleted implementations.

### 5. Invariant and Property-Based Testing

Use invariant testing and property-based testing for solver rules that should hold across many models:

- equilibrium
- symmetry
- reciprocal behavior
- rigid-body mode handling
- superposition where applicable
- reaction/load balance
- constraint consistency
- reduced vs unreduced equivalence

This is one of the highest-ROI next steps once the newest solver families are in place.

### 6. Fuzzing

Use fuzzing for randomized, valid model generation to find:

- edge cases
- regression triggers
- indexing failures
- conditioning pathologies
- mixed-feature interaction failures

Best early targets:

- constraints
- contact/gap behavior
- staged construction
- mixed support conditions
- mixed beam/shell assemblies

### 7. Selective Formal Verification

Formal verification is valuable, but only selectively.

It should be applied only to small, correctness-critical kernels with stable specifications.

Good candidates:

- DOF numbering and mapping
- constraint transformation logic
- assembly invariants
- compact state-transition kernels

Bad candidates:

- full nonlinear solvers
- full shell formulations end to end
- whole staged/PT workflows
- complete contact algorithms

Those are better served by benchmarks, invariants, regressions, and real-model acceptance.

### 8. Performance and Scale Verification

Solver quality is not only correctness at small scale.

Track:

- solve time
- memory use
- iteration counts
- sparse vs dense crossover behavior
- large-model reliability

This is part of solver trust, not a separate concern.

### 9. Real-Model Acceptance Testing

Maintain a suite of representative models that look like real engineering work:

- building frames
- slab/shell systems
- staged and prestressed models
- cable and SSI cases
- nonlinear benchmark structures

These should act as release gates for major solver changes.

## Priority Order

The best ROI verification order is:

1. benchmark hardening on newest solver families
2. invariant and property-based testing
3. real-model acceptance testing
4. performance and scale regression tracking
5. selective formal verification on small kernels

This order gives more trust per unit of effort than trying to formally verify large solver components too early.

## What Verification Means Here

Verification does not mean proving every line of the solver mathematically.

It means building a correctness program strong enough that:

- errors are found early
- regressions are trapped permanently
- public benchmark evidence is deep
- engineering users can audit trust instead of taking it on faith

That is the standard Dedaliano should aim for.
