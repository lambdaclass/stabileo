# 1. Getting started

## Opening the program

Go to [stabileo.com](https://stabileo.com) and press **Open the editor**. It works in any current
browser (Chrome, Edge, Firefox, Safari), on Windows, macOS or Linux. There is nothing to install
and nothing to sign up for.

The program downloads the analysis engine once (a program written in Rust and compiled to
WebAssembly), and from then on **it solves on your computer**: the model is not sent to any server
to be solved.

## The screen

![Basic mode in 2D: the command ribbon at the top, the drawing in the centre and the results panel on the right](img/basic-2d-moments.webp)

- **Top left**, the two modes: **Basic** and **PRO**. Next to them, the tabs: you can have
  several models open at once, and **+** opens a new one.
- **Top right**: **?** (keyboard shortcuts), the language (English, Spanish or Portuguese), the AI
  assistant, the contact button and **Settings** (the gear).
- **The command ribbon**, laid out in groups from left to right in the order a model is built:
  **View**, **Draw**, **Properties**, **Conditions**, **Analyse** and **Results**. At its far left
  is a block of four icons: **Project** (files, examples, tutorials, import and export), save, undo
  (`Ctrl/⌘ + Z`) and redo (`Ctrl/⌘ + Y`).
- **Under the ribbon**, a strip with the options of the active tool. At its right end, the state
  of the model: it tells you what is missing ("Start by creating nodes", "Connect nodes with
  members", "Add supports", "Apply loads") until it reads **Ready to solve** and, afterwards,
  **Solved**.
- **On the right**, the panel each command opens. The **Draw**, **Properties** and **Conditions**
  commands open the **Model data** panel, with one tab per kind: Nodes, Members, Supports, Loads,
  Materials and Sections. Those are the tables this guide calls the "members table", the "loads
  table" and so on.
- **At the bottom**, the status bar: cursor coordinates, zoom, model size and selection.

## Basic or PRO

| | Basic | PRO |
|---|---|---|
| **What it models** | Members (beams, columns, trusses), in 2D and 3D | Members, plus plates and shells (slabs, shear walls, walls) |
| **Theory** | Stiffness method with Euler-Bernoulli members | Finite elements: 3D members plus plate and shell elements |
| **What for** | Learning, checking by hand, solving frames and trusses | Models of real buildings and structures |
| **Shows the working** | Yes: kinematics, section, stiffness method step by step | Concentrates on the model and the results |
| **Status** | Finished | In development |

> **Important:** each mode keeps its own model. If you move from Basic to PRO, the Basic model is
> not carried over: PRO opens its own (or an empty one). When you go back to Basic, your model is
> still there; **Solve** brings the results back.

The difference between the two is not only in the interface. [Chapter 6](06-theory.md) explains
why **a member and a shell are two different models of the same piece**, and when they give
different results.

## Your first model: a simply supported beam

It is the quickest way to see the whole workflow. If you prefer an interactive guide,
**Project → Tutorials** has short walkthroughs ("First steps", "Draw a beam", "Reading the results",
and others).

1. **Nodes.** Choose **Node** (key `N`) and click two points on the grid, for instance (0, 0) and
   (6, 0). The grid helps you land on round coordinates, and the status bar shows the cursor
   coordinates. Exact coordinates can also be typed in the **Nodes** tab of the **Model data**
   panel.
2. **Member.** Choose **Member** (key `E`) and click the left node first, then the right one. Each
   new member gets a default material and section (A36 steel and an IPN 300), which you change from
   the members table.
3. **Supports.** Choose **Support** (key `S`). In the options strip pick **Pin.** and click the
   left node; then pick **Roller** and click the right one.
4. **Load.** Choose **Load** (key `L`), pick **Distributed** and leave `-10` kN/m at both ends
   (qI and qJ; that is the default). Click the member. By default the load is perpendicular to
   the member and its sense follows the order in which you drew the nodes: with the member drawn
   left to right, the negative sign points down. To avoid depending on that, choose the global
   **Z** direction.
5. **Solve.** Press **Solve**: the program solves and opens the results panel. The `Enter` key also
   solves.
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

- **Save** (`Ctrl/⌘ + S`) downloads a `.ded` file with the model. You can save only the current
  tab or the whole session (`Ctrl/⌘ + Shift + S`). The file goes to your downloads folder; some
  browsers let you choose the folder.
- **Open** (`Ctrl/⌘ + O`) loads a `.ded` (or a `.json`). After opening it, **Solve** shows the
  results.
- **Share link** builds a link that contains the whole model, compressed, and copies it to the
  clipboard so you can paste it into an email or a chat. Whoever opens it sees exactly your model.
  The model travels inside the link and is not stored on any server; for very large models the
  program warns that the link may be too long.
- **Import Excel sheet** replaces the open model with the one in the spreadsheet. **Template ↓**
  downloads the format, with an instructions sheet and one sheet per part of the model: nodes,
  members, materials, sections, supports, load cases, combinations and loads (plus plates and
  constraints, used by PRO).
- **Export**: results to Excel or CSV, a calculation report as PDF and the drawing as PNG. In 2D,
  also as DXF and SVG.

The program also **saves on its own** every 30 seconds, in the browser's storage. If you close the
tab by mistake, it offers to recover your work when you come back.

## Units

The program works in SI units: **metres, kN, kN·m and MPa**. Tables show areas in cm², moments of
inertia in cm⁴, displacements in mm and rotations in mrad.

---

[← Contents](README.md) · [Next: Basic mode in 2D →](02-basic-2d.md)
