# Open-Source Solver Comparison

## Scope

This document compares Dedaliano with a small set of important open-source solver projects:

- `OpenSees`
- `Code_Aster`
- `Kratos`

The goal is not to rank every open-source FEA package. The goal is to understand where Dedaliano is already strong, where other open projects are deeper, and what still separates Dedaliano from the strongest open-source solver stack.

This comparison is based on:

- Dedaliano code, tests, and current docs in this repo
- official project documentation for the other projects

## Short Take

- `OpenSees` is still stronger on long-mature nonlinear structural-analysis depth.
- `Code_Aster` is still stronger as a broader structural / solid / contact FEA platform.
- `Kratos` is still stronger as a broader multiphysics / HPC framework.
- `Dedaliano` is unusually strong on focused structural breadth, browser-native product surface, and public validation / benchmark discipline.

So the current honest claim is:

`Dedaliano is becoming one of the strongest open structural solvers, but it is not yet the deepest open engineering solver overall.`

## Comparison Matrix

| Area | Dedaliano | OpenSees | Code_Aster | Kratos |
|---|---|---|---|---|
| Structural engineering focus | Strong | Strong | Medium | Medium |
| Frame / truss / beam analysis | Strong | Strong | Strong | Strong |
| Nonlinear building-frame depth | Good to Strong | Very strong | Strong | Strong |
| Shell maturity | Good, improving fast | Good | Strong | Strong |
| Contact maturity | Good, improving | Good | Strong | Strong |
| SSI / spring-family support | Good | Strong | Strong | Strong |
| Dynamics / seismic workflows | Strong | Very strong | Strong | Strong |
| Fiber / distributed plasticity | Good | Very strong | Strong | Strong |
| Broad continuum / general FEA depth | Limited | Limited to medium | Very strong | Very strong |
| Multiphysics breadth | Low | Low | Strong | Very strong |
| HPC / large-scale infrastructure | Emerging | Medium | Strong | Very strong |
| Browser-native product surface | Very strong | Weak | Weak | Weak |
| Public benchmark / validation visibility | Very strong | Medium | Medium | Medium |
| Structural engineering product workflow surface | Strong | Weak | Weak | Weak |

## Dedaliano

### Current strengths

- broad structural solver coverage in one focused engine
- modern structural features in one stack:
  - constraints
  - contact
  - SSI
  - fiber nonlinear
  - imperfections
  - creep / shrinkage
  - reduction / substructuring
  - shell workflows
- unusual public benchmark discipline
- benchmark gates, acceptance models, and property / fuzz coverage
- browser-native product surface and WASM delivery

### Current limits

- shell breadth and shell maturity still lag the strongest mature open FEA platforms
- long-tail nonlinear maturity still has less real-world history than OpenSees / Code_Aster
- HPC / large-scale infrastructure is improving, but not yet at Kratos / Code_Aster depth
- continuum / multiphysics scope is intentionally much narrower

## OpenSees

### Where it is deeper

- nonlinear structural analysis depth
- earthquake engineering workflows
- distributed plasticity and research-grade nonlinear modeling maturity
- long historical depth in difficult structural-analysis edge cases

### Where Dedaliano is stronger

- browser-native delivery
- integrated product surface
- cleaner public benchmark / acceptance-gate story
- broader general product UX potential

### Practical interpretation

OpenSees is still the harder benchmark on `nonlinear structural mechanics depth`. Dedaliano has the better chance to win on `product surface + open structural solver usability`.

## Code_Aster

### Where it is deeper

- structural + solid mechanics + contact breadth
- broad general FEA depth
- stronger continuum mechanics coverage
- large mature feature surface beyond frame-centric structural work

### Where Dedaliano is stronger

- structural engineering focus
- browser delivery
- product coherence for structural workflows
- easier positioning as an engineering product rather than a large simulation system

### Practical interpretation

Code_Aster is still stronger as a `broad open FEA platform`. Dedaliano is stronger as a `focused structural engineering solver product`.

## Kratos

### Where it is deeper

- multiphysics and framework breadth
- HPC / large-scale architecture
- broad application ecosystem
- contact / structural / continuum infrastructure in a larger research-engineering framework

### Where Dedaliano is stronger

- structural engineering focus
- product surface
- browser-native accessibility
- benchmark-story clarity for structural users

### Practical interpretation

Kratos is stronger as a `computational mechanics framework`. Dedaliano is stronger as a `focused structural engineering product stack`.

## What Still Separates Dedaliano From The Strongest Open Solvers

These are the biggest remaining gaps:

1. `Shell maturity depth`
   Especially curved-shell workflows, distortion studies, and strategic decisions around broader shell families.

2. `Long-tail nonlinear maturity`
   More years of hardened edge cases, especially in advanced contact, shell/nonlinear interaction, and difficult real models.

3. `Performance / scale`
   Sparse-first 3D work is now real, but large-model scale and solve-path maturity still need more growth.

4. `Full solver-path consistency`
   Consistent behavior across constrained/unconstrained, dense/sparse, shell/frame mixed, and advanced nonlinear paths.

5. `Broader external-reference proof`
   Dedaliano is already strong here, but this is also the most realistic place to create a lasting moat.

## What Makes Dedaliano Distinctive Right Now

The strongest unique combination is:

- open source
- browser-native
- focused on structural engineering
- broad solver surface
- unusually visible proof / validation culture

That combination is rare. Even when other open projects are deeper in particular mechanics categories, they usually do not combine those strengths in one product-oriented system.

## Strategic Conclusion

The near-term goal should not be:

`be broader than every open-source mechanics project`

The better goal is:

`be the strongest open structural solver product`

That means:

- keep deepening shells, nonlinear robustness, and scale
- keep growing the benchmark moat
- keep improving the browser/product surface

If Dedaliano keeps doing that, it can become the best open structural solver for many real structural-engineering workflows even if broader open multiphysics frameworks still exist.

## Sources

- OpenSees:
  - https://opensees.ist.berkeley.edu/OpenSees/home/about.php
  - https://opensees.ist.berkeley.edu/OpenSees/manuals/usermanual/1397.htm
- Code_Aster:
  - https://codeaster.readthedocs.io/
  - https://www-mdp.eng.cam.ac.uk/web/CD/engapps/aster_docs/UDocs-HTML/U20404a/U20404a.pdf.html
- Kratos:
  - https://kratosmultiphysics.github.io/Kratos/
  - https://github.com/KratosMultiphysics/Kratos
