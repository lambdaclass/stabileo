# 2. Basic mode in 2D

Basic mode solves **frame and truss structures**: beams, frames, trusses, arches. In 2D the
structure lives in a vertical plane, the **XZ** plane: X is horizontal and Z is vertical, pointing
up. Each node has three degrees of freedom: two displacements (**ux**, **uz**) and one rotation
(**θy**).

This chapter goes through the command ribbon from left to right, which is the natural order in
which a model is built.

## View

- **Move** has two modes: *move the view* (dragging pans the drawing) or *move nodes* (dragging
  relocates a node, and the members follow it).
- **Selection** sets what a click or a drag picks up: members, nodes, supports or loads (to take
  several kinds together, tick **Select several kinds at once**). Dragging left to right takes what
  lies entirely inside the rectangle; right to left, anything it touches. There are **All**,
  **None** and **Invert** buttons, and you can select **by id**, with lists and ranges such as
  `3, 7-10`.
- **Right-clicking** a node opens a menu to edit it, add a support or a load to it, or delete it;
  on a member, to edit it, split it into equal parts or delete it. With nodes selected,
  right-clicking empty space lets you mirror them or rotate them by 90°.
- To **delete**, select and press `Delete`; `Esc` drops the active tool.
- **3D** takes the model into space. See [chapter 3](03-basic-3d.md).

## Draw

### Nodes

**Node** (key `N`) places a node with each click. If the node lands on a member, the program
splits it in two automatically; turn this off in **Settings → Auto-split members when placing nodes
on them**.

The same tool has a second mode, **Joints**, to change how members are connected at a node:

- **Hinge.** Releases the moment: the node transmits forces but no moment. Clicking a node hinges
  every member that reaches it; clicking a member splits it at that point and hinges both new
  ends.
- **Sliding X / Sliding Z.** Releases a relative displacement in one direction, in global or local
  axes. It is set by clicking a member near the end to be released.

### Members

**Member** (key `E`) joins two nodes. Before drawing, choose the type:

- **Rigid (frame):** a frame member. Carries axial force, shear and moment: beams and columns.
- **Hinged (truss):** a truss member. Axial force only.

The members table is where each member's material and section are changed, and hinges can be set
or removed there end by end (the **Hng I** and **Hng J** columns).

> **What a hinge is, internally.** The matrix of a member with a hinged end is the rigid member's
> matrix with the released degree of freedom removed by **static condensation**. See
> [chapter 6](06-theory.md#hinges).

## Properties

### Materials

Each material has a modulus of elasticity **E** (MPa), Poisson's ratio **ν**, unit weight **ρ**
(kN/m³) and yield stress **fy** (MPa). You can start from a library (steels, cold-formed,
stainless, aluminium, concretes and timbers, to several codes) or enter a custom one.

- **E** governs stiffness. In 2D it is the only thing the linear analysis needs from the material;
  in 3D **ν** is used too, because it defines the shear modulus G for torsion.
- **ρ** is used for self-weight and for mass in the dynamic analysis.
- **fy** is used to express stresses as utilisation (σ/fy) and in plastic collapse.

### Sections

Each section has an area **A**, second moments of area **Iy** and **Iz** and, in 3D, a torsion
constant **J**. There are three ways to define one:

1. **Choose Standard Profile:** rolled and cold-formed profiles (IPN, UPN, W, HEA, HEB, IPE, tubes,
   angles and so on) to several codes.
2. **Build Section:** parametric shapes, thin-walled (box, tube, I, T, U, lipped C) or solid
   (square, rectangular, circular, T, inverted L). The program computes the properties from the
   geometry.
3. **Define Amorphous Section:** only the numbers A, I and J. It is enough to solve, but not to
   analyse stresses, because the program does not know the shape.

> In 2D the member bends in the XZ plane, so the inertia that counts is the one for bending in
> that plane. If the section is rotated by an angle α, Iy·cos²α + Iz·sin²α is used.

## Conditions

### Supports

**Support** (key `S`) places a support on a node. The types in 2D:

| Type | Restrains | Reactions |
|---|---|---|
| **Fixed** | ux, uz, θy | Rx, Rz, My |
| **Pinned** (Pin.) | ux, uz | Rx, Rz |
| **Roller** | a single displacement: the vertical or the horizontal one | the reaction in that direction |
| **Spring** | nothing rigidly: adds stiffness kx, ky (vertical) and kθ | proportional to the displacement |

- A **roller** can be inclined by an angle α: the sliding plane is rotated and the reaction stays
  perpendicular to it. It can also take the direction of the member that reaches it (local axes).
- Supports can carry **prescribed displacements**: a settlement, a rotation. They are typed in the
  tool strip before clicking (or afterwards in the **Supports** tab), and the program treats them
  as a boundary condition with a non-zero value.

### Loads

**Load** (key `L`) applies loads to the **active load case**, chosen in the tool strip (D by
default). The types:

- **Point.** On a node it is a horizontal force, a vertical force or a moment **My**. With the **Z**
  direction the buttons read **Fx** and **Fz**; with **⊥** (the default) they read **Fi** and
  **Fj**. On a member it is a point load at the position you clicked and, with **⊥**, it follows the
  member's axes: **Fi** along it and **Fj** perpendicular to it.
- **Distributed.** With a value at each end (**qI**, **qJ**), so it can be uniform or trapezoidal.
  The direction can be global (**Z**) or perpendicular to the member (**⊥**, the default), with an
  extra angle α. In the perpendicular direction the sense follows the member's node order (I to
  J). A load over part of the member is defined from the loads table.
- **Thermal.** A uniform temperature change **ΔT** (lengthens or shortens the member) and a
  gradient **ΔTg** between faces (curves it). The expansion coefficient is fixed at 12·10⁻⁶ /°C.
- **Self-weight.** A checkbox in the tool strip (labelled **PP**): adds ρ·A along each member,
  downwards.

Loads on members are not "moved to the nodes" by eye: the program computes each member's
**fixed-end forces** and assembles them as equivalent nodal loads. See
[chapter 6](06-theory.md#the-load-vector).

### Load cases and combinations

The **Loads** tab of the **Model data** panel has a **Combinations** section:

- **Load cases:** dead (D), live (L), wind (W), earthquake (E), or any you define. Every load
  belongs to a case.
- **Combinations:** one factor per case. Four come by default: **1.2D + 1.6L**, **1.4D**,
  **1.2D + L + 1.6W** and **1.2D + L + E**. They can be edited, deleted or added to.

When solving, the program first solves **Simple loads** (all loads together, unfactored), then
each case and each combination, and builds the **envelope** (maxima and minima over all
combinations). Self-weight is added only to D-type cases within combinations.

Because the analysis is linear, each combination is the sum of the cases multiplied by their
factors: that is the superposition principle.

## Analyse

- **Solve** solves the model and opens the results (`Enter` also solves). Every solve includes a
  **kinematic check**: if the structure is a mechanism it says so, and if it is stable it reports
  whether it is statically determinate (equilibrium alone gives the reactions) or indeterminate (it
  has more restraints than needed), and to what degree: how many extra.
- **Advanced** opens the advanced tools. They have a chapter of their own:
  [chapter 4](04-advanced-tools.md).

## Results

The **Results** buttons become available after the first solve:

| Button | What it shows |
|---|---|
| **None** | The model only |
| **Deformed** | The deformed shape, exaggerated. It can be animated. |
| **N** | Axial force (positive = tension) |
| **Vz** | Shear force |
| **My** | Bending moment, drawn on the tension side |
| **Stress** | A colour map of the stresses in each member |

In the **Results** panel:

- **Diagram scale** enlarges or shrinks the drawing without changing the values.
- **Shown as:** diagram, member colour (axial force only: red tension, blue compression) or colour
  map.
- For **Stress**, the **measure**: utilisation σ/fy, Von Mises (σvm), normal stress σ or shear
  stress τ.
- **Change results view:** simple loads, a case, a combination or the envelope. **Compare**
  overlays a second result so you can see them together.
- The **results table**: displacements of each node (ux, uz in mm; θy in mrad), reactions (Rx, Rz,
  My) and the forces at the ends of each member.

> **How a diagram is drawn.** The program solves the node displacements and, from them, the forces
> at the ends of each member. Inside the member the diagrams come from **equilibrium**, integrating
> the loads along the span: they are not interpolated between the ends. That is why the moment
> under a distributed load comes out parabolic even when the member is not subdivided.

## Sign conventions

- **Axial force:** positive in tension.
- **Moment:** drawn on the tension side. In **Settings** you can have positive values drawn towards
  the local axes instead.
- **Reactions and displacements:** in global axes, positive in the direction of X and Z.
- **Normal stress:** σ = N/A + M·z/I, positive in tension.

---

[← Getting started](01-getting-started.md) · [Contents](README.md) · [Next: Basic mode in 3D →](03-basic-3d.md)
