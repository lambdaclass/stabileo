# Stabileo guide

**Stabileo** is a structural analysis program that runs in the browser. There is nothing to
install and no account to create: open [stabileo.com](https://stabileo.com) and start modelling.
The analysis runs on your own computer, so your models never leave it.

This guide explains what each part of the program does and, above all, **the theory behind it**.
It is meant to be read straight through, like course notes, without knowing how to program or how
GitHub works: every page ends with links to the previous and the next one.

> *[Leé esta guía en español](../es/README.md)*

## Where to start

| | Page | What you will find |
|---|---|---|
| 1 | [Getting started](01-getting-started.md) | The screen, the two modes, your first model in five minutes, saving and sharing. |
| 2 | [Basic mode in 2D](02-basic-2d.md) | Nodes, members, hinges, supports, loads, materials, sections, combinations and results in the plane. |
| 3 | [Basic mode in 3D](03-basic-3d.md) | What changes in space: six degrees of freedom, local axes, torsion, and how to go back to 2D. |
| 4 | [Advanced tools in Basic mode](04-advanced-tools.md) | Kinematic analysis, section analysis, second order, buckling, dynamics, plastic collapse, influence lines and the stiffness method step by step. |
| 5 | [PRO mode](05-pro.md) | Finite elements: slabs and walls, constraints, load generation, drawing import and the advanced analyses. |
| 6 | [Theory](06-theory.md) | Conventions, the stiffness method, the Euler-Bernoulli beam, stress theories, and plate and shell finite elements. |

If you have never used the program, start with 1. If you came to understand why a result is what
it is, 6 can be read on its own.

## The modes, in one line each

- **Basic** — frame and truss structures in 2D and 3D. It is free, it is finished, and it is the
  one used in courses. Besides solving, it **shows the working**: the degree of indeterminacy, the
  stiffness matrix step by step, the stresses in a section with the formula that applies.
- **PRO** — finite elements and complex models: slabs and walls as plates and shells,
  constraints, load generation, import from AutoCAD, Excel or IFC, and dynamic and non-linear
  analysis. It is in development, with open access for anyone who wants to try it.
- **Education** — the teacher writes an exercise inside the app and hands it out as a link; the
  student solves it without seeing the result, and the answers go back to the teacher. It is
  switched on from **Settings**.

## Further reading

- **[The blog](https://stabileo.com/en/blog)** has long pieces on specific questions, with numbers
  computed by the program and the editor embedded: for example,
  [bars or finite elements?](https://stabileo.com/en/blog/bars-or-finite-elements/) or
  [which torsion theory applies](https://stabileo.com/en/blog/torsion-bredt-saint-venant/).
- **Found a mistake in the guide or in the program?** Use the contact button in the app, or open
  an issue on [GitHub](https://github.com/lambdaclass/stabileo/issues).

---

[Next: Getting started →](01-getting-started.md)
