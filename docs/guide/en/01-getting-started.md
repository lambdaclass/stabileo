# 1. Getting started

## Opening the program

Go to [stabileo.com](https://stabileo.com) and press **Open the editor**. It works in any current
browser (Chrome, Edge, Firefox, Safari), on Windows, macOS or Linux. There is nothing to install
and nothing to sign up for.

The program downloads the analysis engine once —a program written in Rust and compiled to
WebAssembly— and from then on **it solves on your computer**. Nothing you model is sent to a
server.

## The screen

![Basic mode in 2D: the command ribbon at the top, the drawing in the centre and the results panel on the right](img/basic-2d-moments.webp)

- **Top left**, the two modes: **Basic** and **PRO**. Next to them, the tabs: you can have
  several models open at once, and **+** opens a new one.
- **Top right**: **?** (keyboard shortcuts), the language (English, Spanish or Portuguese), the AI
  assistant, the contact button and **Settings** (the gear).
- **The command ribbon**, laid out in groups from left to right in the order a model is built:
  **View**, **Draw**, **Properties**, **Conditions**, **Analyse** and **Results**.
- **Under the ribbon**, a strip with the options of the active tool. At its right end, the state
  of the model: it tells you what is missing ("create nodes → connect members → add supports →
  add loads") until it is **ready to solve**.
- **On the right**, the panel each command opens.
- **At the bottom**, the status bar: cursor coordinates, zoom, model size and selection.

## Basic or PRO

| | Basic | PRO |
|---|---|---|
| **What it models** | Members (beams, columns, trusses), in 2D and 3D | Members, plus plates and shells (slabs, walls) |
| **Theory** | Stiffness method with Euler-Bernoulli members | Finite elements: 3D members plus plate and shell elements |
| **What for** | Learning, checking by hand, solving frames and trusses | Models of real buildings and structures |
| **Shows the working** | Yes: kinematics, section, stiffness method step by step | Concentrates on the model and the results |
| **Status** | Finished | In development, open access |

> **Important:** each mode keeps its own model. If you move from Basic to PRO, the Basic model is
> not carried over: PRO opens its own (or an empty one). When you go back to Basic, your model is
> still there.

The difference between the two is not only in the interface. [Chapter 6](06-theory.md) explains
why **a member and a shell are two different models of the same piece**, and when they give
different results.

## Your first model: a simply supported beam

It is the quickest way to see the whole workflow. If you prefer an interactive guide,
**Project → Tutorials** has short walkthroughs ("First steps", "Draw a beam", "Reading the results",
and others).

1. **Nodes.** Choose **Node** (key `N`) and click two points on the grid, for instance (0, 0) and
   (6, 0). The grid helps you land on round coordinates.
2. **Member.** Choose **Member** (key `E`) and click one node, then the other.
3. **Supports.** Choose **Support** (key `S`). In the options strip pick **Pin.** and click the
   left node; then pick **Roller** and click the right one.
4. **Load.** Choose **Load** (key `L`), pick **Distributed** and leave `-10` kN/m at both ends
   (qI and qJ; that is the default). Click the member. The negative sign points downwards.
5. **Solve.** Press **Solve** (or `Enter`). The program solves and opens the results panel.
6. **Read.** Use the **Results** buttons to choose what to see: **N** (axial force), **Vz**
   (shear), **My** (bending moment), **Deformed** or **Stress**. Hover over the member to read the
   value at each point.

You should see a maximum moment of 45 kN·m at midspan (q·L²/8 = 10 · 6² / 8) and reactions of
30 kN at each support.

> **Live calculation.** In **Settings** you can have the program re-solve on every change: move a
> node or change a load and the diagrams update on their own.

## Examples

**Project** has two menus of examples ready to open and explore:

- **2D Examples:** beams (simply supported, cantilever, Gerber, continuous), elastic support,
  support settlement, thermal load, Pratt, Warren and Howe trusses, a three-hinged arch, one- and
  two-storey frames, a bridge with a moving load, and frames with dead, live, wind and seismic
  load combinations.
- **3D Examples:** a cantilever in biaxial bending, a beam in torsion, an arch, space frames, a
  grillage, a space truss, towers and an industrial building.

## Saving, opening and sharing

Everything is under **Project**:

- **Save** (`Ctrl/⌘ + S`) downloads a `.ded` file with the model and its results. You can save
  only the current tab or the whole session.
- **Open** loads a `.ded` (or a `.json`).
- **Share link** builds a link that contains the whole model, compressed. Whoever opens it sees
  exactly your model. The model travels inside the link and is not stored on any server.
- **Import Excel sheet** loads a model from a spreadsheet. **Template ↓** downloads the format with
  its sheets: nodes, members, materials, sections, supports, load cases and combinations.
- **Export**: results to Excel or CSV, a calculation report as PDF and, in 2D, the drawing as
  DXF, SVG or PNG.

The program also **saves on its own** every 30 seconds and after each solve, in the browser's
storage. If you close the tab by mistake, it offers to recover your work when you come back.

## Units

The program works in SI units: **metres, kN, kN·m and MPa**. Tables show areas in cm², moments of
inertia in cm⁴, displacements in mm and rotations in mrad.

---

[← Contents](README.md) · [Next: Basic mode in 2D →](02-basic-2d.md)
