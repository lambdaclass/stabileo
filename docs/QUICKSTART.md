# Quick Start

This is the shortest reliable path from empty canvas to a solved structure.

Goal:

- build a simple 2D beam
- solve it
- inspect the main result surfaces
- understand the core coordinate convention

## Before You Start

You can use:

- the live app at `https://stabileo.com`
- or a local dev build from [`README.md`](../README.md)

Important convention:

- `Z` is up
- the common 2D analysis plane is `XZ`

That convention is not cosmetic. It is part of the solver contract. See [ADR 0001](adr/0001-z-up-coordinate-system.md).

## Build and Solve a 2D Beam in 5 Steps

### 1. Create two nodes

Place two nodes along the horizontal axis:

- node 1 at `x = 0`
- node 2 at `x = 6`

In 2D, the vertical direction is still `Z`, even if the UI abstracts some of that away.

### 2. Connect them with a frame element

Create one frame element between the two nodes.

Pick:

- a steel material
- a section such as `IPE 300`

### 3. Add supports

For a standard simply-supported beam:

- node 1: pinned
- node 2: roller

### 4. Apply a load

Add a distributed load on the element, for example:

- `10 kN/m` downward

### 5. Solve and inspect results

Run the solve and inspect:

- deformed shape
- reactions
- moment diagram
- shear diagram
- axial force

The important mental model is:

`model -> solve -> inspect -> change -> solve again`

That loop is the core Stabileo workflow.

## What to Look At First

Once the beam solves:

- verify the support reactions make sense
- inspect the bending moment diagram shape
- confirm the deformed shape matches intuition

If the result looks wrong, inspect supports first. Most early mistakes come from boundary conditions, not from the solver.

## Next Steps

- [AI modeling workflow](AI_MODELING_WORKFLOW.md)
- [Solver reference](SOLVER_REFERENCE.md)
- [Verification guide](VERIFICATION.md)
- [Benchmarks](BENCHMARKS.md)
