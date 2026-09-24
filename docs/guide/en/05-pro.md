# 5. PRO mode

PRO is the mode for **finite elements and complex models**. Besides members in space, it models
**plates and shells** (slabs, walls, rafts), constraints between nodes, loads generated to code,
and it runs dynamic and non-linear analyses.

> PRO is **in development**, with open access for anyone who wants to try it. What is described
> here already works; the limitations worth knowing are listed at the end of the chapter.

This chapter covers modelling and analysis: the **Model** and **Analyse** tabs, importing models, the report and the AI assistant.

![A model in PRO: a concrete frame with a slab and a wall modelled as plates](img/pro-model.webp)

## Getting in and starting a model

Enter with the **PRO** button in the header. PRO keeps **its own model**, separate from Basic's:
when you switch modes each one keeps its own, but they are not carried across.

To start:

- **An empty model:** the **+** on the tabs.
- **An example:** **Project → New model → Examples**. There are sixteen, grouped into buildings,
  industrial, energy and offshore, foundations, long-span structures, and large showcase models.
- **Import** (see [below](#importing-models)): an Excel spreadsheet, an AutoCAD drawing (DXF) or a
  BIM model (IFC).

As in Basic, **Project** also has **Save**, **Open**, **Share link** and **Export** (results to
Excel or CSV, and the drawing to DXF). See [chapter 1](01-getting-started.md#saving-opening-and-sharing).

## The Model tab

In PRO each ribbon button opens a **panel with a table**. To draw in the viewer, each panel has
its own **Draw** button (node, member, plate…); pressing it again goes back to selecting. The
**selection** tool is in the top bar, next to undo and redo.

### Draw

**Nodes.** An editable table of X, Y, Z coordinates in metres. You can **paste from Excel**
(X, Y and optionally Z columns).

**Members.** A table with start and end node, material, section and the hinge at each end
(**Pin/Fix**). That column releases only the **Mz** moment; to release any other degree of freedom,
edit the member (see below). Also:

- **Curved:** an arc through three nodes, built as a chain of straight members. The panel reports
  the chord error.
- **Member offset (eccentricity):** shifts the member's axis away from its nodes, for instance so a
  beam hangs below the slab.
- Right-clicking a member: **edit** it (material, section and per-degree-of-freedom releases at
  each end) or **subdivide** it into N parts (2 to 20). With nodes selected, right-clicking empty
  space mirrors them in X or Y or rotates them by 90°.

**Plates.** A plate is defined by its nodes: **three nodes make a triangle and four a
quadrilateral**. It is given a material and a thickness.

- **Mesh generator:** from four corners (counter-clockwise), it generates a mesh of quadrilaterals
  by target size or by number of divisions. It can split the boundary beams so they share the edge
  nodes.
- **Curved shell:** for quadrilaterals whose four nodes do not lie in one plane. The panel measures
  how far the fourth node is out of plane and suggests when to use it.
- **Stair:** an inclined slab with the steps applied as load.
- **Shell offset:** shifts the plate's mid-plane, for instance to line up the top face of the slab
  with the floor level.

> **How plates connect to members:** only through **shared nodes**. A beam running under a slab
> without sharing nodes with it is not connected. The panel warns when a plate has a loose corner.

**Repeat selection.** Copies the selected nodes and members N times with a given offset. It can
join the copies with members (the columns between floors, for instance) and copy the supports too.
It does not copy plates or loads, and it **does not merge nodes**: a copy landing on an existing node
leaves two in the same place.

### Properties

**Materials** and **Sections** work as in Basic: a library (steels, concretes, timbers, aluminium;
rolled and cold-formed profiles) or custom definitions. For sections, **Build section** makes
parametric shapes, and catalogue profiles can be rotated and combined into built-up sections.

### Conditions

**Supports.** Fixed, pinned, rollers in each plane (**Roller XZ**, **XY** and **YZ**), spring (with
a stiffness for each degree of freedom) and **custom**, where you tick one by one which
displacements and rotations are restrained.

**Constraints.** Relations between nodes:

- **Rigid link:** a slave node follows a master node as if they were joined by an infinitely
  rigid member.
- **Diaphragm:** the nodes of a plane move together in that plane. It is the usual assumption of
  a slab that is rigid in its own plane. **Auto-detect diaphragms** groups the nodes by level
  (within 5 cm) and takes the node nearest the centre as the master.
- **Equal DOF:** two nodes share one or more degrees of freedom.
- **Eccentric connection**, **linear MPC** (general linear constraints) and **connectors** with
  their own stiffness between two nodes.

**Loads.** The panel has three parts:

- **Load cases:** each case with its type (D, L, Lr, W, E, S) and a button to show or hide it in
  the viewer. **Self-weight** is **on by default** in PRO and is computed for members and plates.
- **Combinations:** manual, or generated automatically (strength and service combinations).
- **Add load:** nodal (in global axes), distributed and point loads on members (in the member's
  local axes), and **surface** loads on quadrilateral plates (in kN/m²).

**Auto-generate from code.** Builds the building's load plan from Argentine codes:

- **Dead loads** from the layers of the construction (CIRSOC 101, Table 3.1).
- **Live loads** from the occupancy of each space, with the reduction for tributary area.
- **Wind** to CIRSOC 102.
- **Earthquake** to INPRES-CIRSOC 103 (static method), which needs a seismic regulation assigned to
  the project.

It can also be opened case by case, with the **§** button of each load case. It first shows the
load plan for review, and then applies it. Area loads become line loads on the
beams according to their tributary width; wind is applied as forces per level.

### Generators

**Metallic structures** generates the **geometry** of typical steel structures:

- **Truss:** trapezoidal, parallel-chord, Pratt, arched, or a rolled portal, with several web
  patterns, half trusses and subdivided diagonals.
- **Lattice column.**
- **Shed:** span, frame spacing, number of frames, lattice or solid-web columns, purlins, and roof,
  truss and wall bracing.

Besides the geometry, it assigns a profile to each kind of member and a steel grade. The generator
**replaces the current model** (a single undo brings it back).

## Importing models

From **Project**:

- **Excel spreadsheet.** The same format as in Basic, with extra sheets for triangular plates,
  quadrilateral plates and constraints. It is the most convenient way to load a large model prepared in another tool.
- **DXF plan (AutoCAD).** A four-step wizard:
  1. the file and its units;
  2. what each drawing layer represents: grid, columns, beams, walls, slabs, openings, text;
  3. the assumptions: number of floors and storey heights, column, beam, slab and wall sizes,
     base support type, loads and slab meshing;
  4. a preview before applying.

  The result is a **draft** of the structure, flagged as unreviewed, with the list of assumptions
  that were used. Slabs and walls are generated as plates.
- **IFC (BIM).** Imports the model's beams, columns and members with their geometry. It replaces
  the current model.

## Before solving: diagnostics

PRO checks the model as you build it. When there are problems a warning appears that opens the
**Diagnostics** panel, and the panel opens on its own if you press **Solve** with errors. It
separates:

- **Errors**, which prevent solving: fewer than two nodes, no members and no plates, no supports,
  members without a section or material, sections with zero area or inertia, loads pointing to
  elements that do not exist.
- **Warnings:** coincident or loose nodes, very short or duplicate members, members hinged at both
  ends, transverse loads on truss members.
- **Information:** empty load cases, a model without loads.

After solving, the engine also reports the **mesh quality** of the plates (aspect ratio, warping,
very small angles).

## The Analyse tab

![Results in PRO: von Mises stresses in the slab and the wall](img/pro-results-shells.webp)

### Solve

**Solve** solves the model with the 3D engine. If there are combinations, it solves every case and
combination and builds the envelope. For large models it uses a sparse solver (Cholesky
factorisation with reordering), which is what makes thousands of degrees of freedom solvable in
the browser.

### Results

The diagrams are the same as in Basic 3D: **Deformed**, **N**, **My**, **Vz**, **Mz**, **Vy**,
**T** and **Stress**, which in PRO colours both members and plates.

In the **Results** panel:

- **Shown as:** diagram, member colour or colour map. For **Stress**, **Show on** members, plates
  or both.
- **Colour map** of moment, shear, axial force, **Strength (σ/fy)**, von Mises, or **slab and wall
  contours**.
- For plates, the component to show: von Mises, principal stresses σ1 and σ2, σxx, σyy, τxy
  (kN/m²) and moments per unit width mx, my, mxy (kN·m/m).
- View by **case**, **combination** or **envelope**, and checkboxes to show loads, reactions and
  constraint forces.
- The **outputs** as tables: reactions, internal forces, displacements, shell stresses (per
  element and per node), constraint forces and diagnostics.
- **Result query:** finds the governing value of a force over the whole model, the selection or a
  list of elements, with filters, and exports it to CSV.
- **Raw forces report:** reactions, displacements and forces per member and per station, as Excel,
  PDF or HTML.

### Advanced

PRO's advanced analyses:

- **P-Delta**, **modal**, **spectral** (with a simplified INPRES-CIRSOC 103 spectrum by seismic zone
  and soil type, and CQC or SRSS combination) and **buckling**.
- **Time history** (Newmark or HHT-α, with your own accelerogram) and **harmonic response**.
- **Non-linear:** pushover, corotational (large displacements) and fibre.
- **Geometric imperfections**, **foundation on Winkler springs**, **soil-structure interaction**
  with p-y curves, and **contact or gap**.
- **Staged construction** and **creep and shrinkage**.
- **3D influence lines**, **multi-case solver**, **section analyser** and **constrained analysis**.
- The **rigid diaphragm** option for the whole model.

The panel carries an "In development" banner: these are analyses the engine solves that are still
being brought into the interface.

### Report

**Report** builds a printable **calculation report**: model data, load details, results, the
advanced analyses you ran, material quantities and diagnostics, with an optional letterhead (logo,
company, engineer, revision). It also exports to Excel.

## The theory behind it

- **Members:** the same 3D Euler-Bernoulli members as Basic mode, with six degrees of freedom per
  node.
- **Quadrilateral plates:** the **MITC4** element, with its shear strains interpolated so that the
  element does not "lock" when the plate is thin (*shear locking*), and an enhanced membrane (EAS)
  that improves in-plane bending.
- **Triangular plates:** the **DKT** element for bending (a thin Kirchhoff plate, with no shear
  deformation), combined with a constant-strain triangle for the membrane. That membrane is poor at
  in-plane bending: for walls, quadrilaterals are the better choice.
- **Curved shells:** a four-node element that represents curvature, for non-planar quadrilaterals.

Why a slab needs a mesh and a beam does not, what shear locking is, and when a member model stops
being enough: [chapter 6](06-theory.md#finite-elements-plates-and-shells) and the post [bars or
finite elements?](https://stabileo.com/en/blog/bars-or-finite-elements/).

## Stabileo AI

The **AI** button in the header opens the assistant, with four modes: build, review, explain and
query a model. It works on the same model and the same engine: the AI proposes the change and the
engine computes. **It is in development** and does not yet answer or change the model.

## Current limitations

- **Modal and spectral analysis** take only the members into account: they do not yet include
  plates or constraints. Advanced analyses in general need at least one member in the model,
  ignore member and plate offsets, and do not accept models with partial releases or sliding
  joints.
- **Surface loads** apply only to quadrilateral plates, always vertical (global −Z), split equally
  among the four nodes.
- **Thermal loads on slabs** appear among the options but are not yet applied in the analysis.
- **Automatic load generation** does not load plates.
- In PRO new members are always frame members. Truss members come from the generators, from IFC or
  from Excel, which is also the way to roll a member's local axes.
- **IFC** import brings in beams, columns and members, with a single material and a single section
  for all of them; it does not bring supports, loads, slabs or walls. Also, the import currently
  leaves the app in the Basic 3D view instead of PRO: it is a known bug.
- Switching between Basic and PRO **does not carry the model across**.

---

[← Advanced tools](04-advanced-tools.md) · [Contents](README.md) · [Next: Theory →](06-theory.md)
