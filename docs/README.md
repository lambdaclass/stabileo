# Stabileo engine documentation

This repository holds the Stabileo **engine**: the structural analysis solver, in Rust, compiled to
WebAssembly for the browser. The documentation here is about the engine, in English.

The Stabileo application built on it, at [stabileo.com](https://stabileo.com), is not part of this
repository. Its user guide is still published here for now (see the end of this page).

## Using and understanding the engine

- [engine/README.md](../engine/README.md): how to depend on the engine from Rust or as WebAssembly, its API and the analysis types
- [SOLVER_REFERENCE.md](SOLVER_REFERENCE.md): the coordinate contract (Z up), model objects, outputs, solver method selection and diagnostics

## Verification

- [VERIFICATION.md](VERIFICATION.md): testing philosophy, fuzzing and invariants
- [BENCHMARKS.md](BENCHMARKS.md): validation coverage against analytical and reference solutions

## Roadmap and history

- [roadmap/SOLVER_ROADMAP.md](roadmap/SOLVER_ROADMAP.md): solver priorities
- [CHANGELOG.md](../CHANGELOG.md)

## Research

- [research/README.md](research/README.md): background on element selection, numerical methods, solver safety, GPU and formal verification

---

## Using the Stabileo application · Usar la aplicación Stabileo

How to use each mode of the application and the theory behind it, written to be read like course
notes. These pages describe the application at [stabileo.com](https://stabileo.com).

Cómo usar cada modo de la aplicación y la teoría que hay detrás, escrita para leerse como un apunte.
Describe la aplicación de [stabileo.com](https://stabileo.com).

| | English | Español |
|---|---|---|
| **Start here** | **[Guide contents](guide/en/README.md)** | **[Índice de la guía](guide/es/README.md)** |
| 1 | [Getting started](guide/en/01-getting-started.md) | [Primeros pasos](guide/es/01-primeros-pasos.md) |
| 2 | [Basic mode in 2D](guide/en/02-basic-2d.md) | [Modo Básico en 2D](guide/es/02-basico-2d.md) |
| 3 | [Basic mode in 3D](guide/en/03-basic-3d.md) | [Modo Básico en 3D](guide/es/03-basico-3d.md) |
| 4 | [Advanced tools in Basic mode](guide/en/04-advanced-tools.md) | [Funciones avanzadas del modo Básico](guide/es/04-funciones-avanzadas.md) |
| 5 | [PRO mode](guide/en/05-pro.md) | [Modo PRO](guide/es/05-pro.md) |
| 6 | [Theory](guide/en/06-theory.md) | [Fundamentos teóricos](guide/es/06-fundamentos-teoricos.md) |

Also about the application:

- [QUICKSTART.md](QUICKSTART.md): the shortest path from an empty canvas to a solved beam
- [AI_MODELING_WORKFLOW.md](AI_MODELING_WORKFLOW.md): how the application's AI build and review flows use the structured model and the solver

The [blog](https://stabileo.com/en/blog/) goes deeper into specific questions, with the numbers
computed by the engine and the editor embedded.
