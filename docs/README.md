# Stabileo documentation · Documentación

## User guide · Guía de usuario

How to use each mode and the theory behind it, written to be read like course notes. No
programming or GitHub knowledge needed.

Cómo usar cada modo y la teoría que hay detrás, escrita para leerse como un apunte. No hace falta
saber programar ni conocer GitHub.

| | English | Español |
|---|---|---|
| **Start here** | **[Guide contents](guide/en/README.md)** | **[Índice de la guía](guide/es/README.md)** |
| 1 | [Getting started](guide/en/01-getting-started.md) | [Primeros pasos](guide/es/01-primeros-pasos.md) |
| 2 | [Basic mode in 2D](guide/en/02-basic-2d.md) | [Modo Básico en 2D](guide/es/02-basico-2d.md) |
| 3 | [Basic mode in 3D](guide/en/03-basic-3d.md) | [Modo Básico en 3D](guide/es/03-basico-3d.md) |
| 4 | [Advanced tools in Basic mode](guide/en/04-advanced-tools.md) | [Funciones avanzadas del modo Básico](guide/es/04-funciones-avanzadas.md) |
| 5 | [PRO mode](guide/en/05-pro.md) | [Modo PRO](guide/es/05-pro.md) |
| 6 | [Theory](guide/en/06-theory.md) | [Fundamentos teóricos](guide/es/06-fundamentos-teoricos.md) |

The [blog](https://stabileo.com/en/blog/) goes deeper into specific questions, with the numbers
computed by the engine and the editor embedded.

El [blog](https://stabileo.com/es/blog/) profundiza en temas puntuales, con los números calculados
por el motor y el editor embebido.

---

## Technical documentation

For contributors and for anyone who wants to look inside the engine. In English.

### Conventions and solver surface

- [SOLVER_REFERENCE.md](SOLVER_REFERENCE.md) — coordinate conventions, model objects, outputs and where the app, the engine and the AI backend meet
- [ADR 0001: Z-up coordinate system](adr/0001-z-up-coordinate-system.md)
- [engine/README.md](../engine/README.md) — the Rust engine's API and analysis types
- [AI_MODELING_WORKFLOW.md](AI_MODELING_WORKFLOW.md) — how AI build and review flows use the structured model and the solver
- [QUICKSTART.md](QUICKSTART.md) — the shortest path from an empty canvas to a solved beam, with the conventions that matter

### Verification

- [VERIFICATION.md](VERIFICATION.md) — testing philosophy, fuzzing and invariants
- [BENCHMARKS.md](BENCHMARKS.md) — validation coverage against analytical and reference solutions

### Roadmaps and project state

- [SOLVER_ROADMAP.md](roadmap/SOLVER_ROADMAP.md)
- [PRODUCT_ROADMAP.md](roadmap/PRODUCT_ROADMAP.md)
- [INFRASTRUCTURE_ROADMAP.md](roadmap/INFRASTRUCTURE_ROADMAP.md)
- [AI_ROADMAP.md](roadmap/AI_ROADMAP.md)
- [CURRENT_STATE_STABILEO.md](CURRENT_STATE_STABILEO.md)
- [CHANGELOG.md](../CHANGELOG.md)

### Research

- [research/README.md](research/README.md) — background on shell element selection, solver architecture, safety hardening and numerical methods
