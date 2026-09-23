# 4. Advanced tools in Basic mode

The **Advanced** button in the **Analyse** group opens a menu. Each entry shows one tool at a time,
and the **?** button next to it explains in two lines what it does.

![The advanced tools menu in Basic mode](img/basic-advanced-menu.webp)

One idea runs through all of these tools: **give the working, not just the number**. Which formula
was used, with what data and, where it matters, why another formula does not apply.

| Tool | 2D | 3D | Needs a solve first |
|---|:-:|:-:|:-:|
| [Kinematic analysis](#kinematic-analysis) | ✓ | — | no |
| [Free-body view](#free-body-view) | ✓ | ✓ | yes |
| [Section analysis](#section-analysis) | ✓ | ✓ | yes |
| [P-Δ (second order)](#p-δ-second-order) | ✓ | ✓ | no |
| [Pcr (Euler buckling)](#pcr-buckling) | ✓ | ✓ | no |
| [Dynamic (modal analysis)](#dynamic-modal-analysis) | ✓ | ✓ | no |
| [Plastic collapse](#plastic-collapse) | ✓ | — | no |
| [Envelope](#envelope) | ✓ | ✓ | no |
| [Moving load](#moving-load) | ✓ | — | no |
| [Influence line](#influence-line) | ✓ | — | yes |
| [Explore (what if…?)](#explore-what-if) | ✓ | ✓ | yes |
| [Step by step: the stiffness method](#step-by-step-the-stiffness-method) | ✓ | ✓ | no |

---

## Kinematic analysis

**What it answers:** whether the structure is stable and, if so, how many unknowns are left over.
It is the first step of any hand calculation, and the program shows it worked out.

![Kinematic analysis of a beam with a hidden mechanism](img/basic-kinematic.webp)

1. **Data:** nodes (n), rigid and hinged members (m), support reactions (r) and internal
   conditions (c), each with where it comes from ("node 1: roller → 1 reaction").
2. **Degree of indeterminacy**, with the formula that fits the type of structure and the numbers
   substituted:
   - frames: g = 3·m + r − 3·n − c
   - trusses: g = m + r − 2·n
   - mixed: g = 3·m_f + m_t + r − 3·n − c
3. **Check with the stiffness matrix.** The degree formula is a **necessary but not sufficient**
   condition. A structure can have g = 0 and still be a mechanism if its restraints are badly
   distributed: too many in one place, too few in another. So the program checks the rank of the
   stiffness matrix numerically and, if there is a mechanism, says **at which node and in which
   direction** it moves.
4. **Suggestions** to make it stable.

It needs no solve: it updates as you model.

> There is a blog post built on exactly this case, a beam where the formula gives zero and the
> structure moves: [what free software computes, and what it never
> explains](https://stabileo.com/en/blog/conceptual-side-advanced-tools/).

## Free-body view

**What it shows:** every member detached from its nodes, with the forces it receives at each end
(N, V, M) and the support reactions. It is the free-body diagram of the whole structure at once,
with the action-reaction pairs in view. It is how you check the equilibrium of every member and
every node.

Options: vectors on members, on nodes or both; in local or global axes; loads shown as a
resultant or in full.

## Section analysis

**What it shows:** the stress state at any section of a member. Arm it, click a member and move a
cursor along it.

![Section analysis of a tube in torsion: the theory that applies and the peak stress](img/basic-section-torsion.webp)

- **Normal stress** by Navier: σ = N/A + M·z/I (biaxial bending in 3D).
- **Shear stress** by Jourawski: τ = V·Q / (I·b), with the shear flow drawn over the section.
- **Torsion:** the program decides which theory applies from the shape of the section —solid,
  closed thin wall (Bredt) or open thin wall (Saint-Venant)— and says so. **The three theories**
  compares them, and marks the ones that do not apply with the reason.
- **Stress state, tensors and Mohr's circle**, with the principal stresses.
- **Failure criteria:** von Mises and Rankine.
- **Centroid and shear centre**, with the working.
- **Section core**, with its equations, and **eccentric load**: whether the resultant falls
  inside or outside the core.
- **Critical sections:** maximum moment, supports, load points.

It needs a section defined by its shape: an amorphous section has no geometry to compute stresses
on.

> The comparison between Bredt and the exact solution on a tube has a post of its own: [Bredt or
> Saint-Venant](https://stabileo.com/en/blog/torsion-bredt-saint-venant/).

## P-Δ (second order)

**What it computes:** the effect of the loads acting on the **deformed** structure. In a linear
analysis equilibrium is written on the initial geometry. In a second-order one, a compressed
column that sways generates an extra moment P·Δ, which increases the sway, which increases the
moment.

The program solves it by iterating until the result stops changing (up to 20 iterations). It
reports the **amplification factor B₂** —how much the effects grow compared with the linear
analysis—, the number of iterations and whether the structure is stable. A B₂ above 1.4 points to
a structure sensitive to second-order effects.

## Pcr (buckling)

**What it computes:** the elastic critical buckling load. It solves the eigenvalue problem

$$\left( [K] + \lambda\,[K_G] \right) \{\phi\} = 0$$

where [K] is the elastic stiffness and [K_G] the **geometric stiffness**, which depends on the
axial forces. Each eigenvalue **λ** is the factor by which the current loads must be multiplied for
the structure to buckle, and each eigenvector **φ** is the shape it buckles in.

It shows the first four modes, with their λ, their drawn shape and the effective length factor
(**K**) of the compressed members.

## Dynamic (modal analysis)

**What it computes:** the natural frequencies and mode shapes. It solves

$$\left( [K] - \omega^2 [M] \right) \{\phi\} = 0$$

with a **consistent mass matrix** built from the unit weight ρ of each material.

It shows the first six modes: frequency (Hz), period (s), effective mass of each mode and the
running total, with the mode shape animated. In 2D it also gives the Rayleigh damping
coefficients.

> Seismic response-spectrum analysis is not in Basic mode: it is in PRO.

## Plastic collapse

**What it computes:** the load factor that brings the structure to collapse, through the
successive formation of **plastic hinges**. Each time a section reaches its plastic moment
Mp = Zp·fy, it becomes a hinge that rotates without taking more moment, and the structure keeps
being loaded with one more hinge, until a mechanism forms.

It shows each step with its factor λ, where the hinge formed and whether a mechanism was reached.

> **Current limitation:** the plastic modulus Zp is computed as that of a rectangular section
> (b·h²/4). For I, channel or tube sections that overestimates Mp. Bear it in mind until it is
> fixed.

## Envelope

**What it shows:** for every point of every member, the maximum and minimum moment, shear and axial
force across all combinations. It is what sizing uses: no single combination governs the whole
structure.

## Moving load

**What it computes:** the effect of a load that moves, like a vehicle on a bridge. The load train
advances in 25 cm steps along the structure and the model is solved at each position. There are
predefined trains: a 100 kN point load, the HL-93 truck (35, 145 and 145 kN) and a tandem of two
110 kN axles. You can step through the positions and see the envelope.

## Influence line

**What it shows:** how a reaction or a member force changes as a **unit load** travels across the
structure. Choose the quantity —a reaction (click a node), or the moment or shear in a member
(click the member, at its midpoint)— and the program draws the line. The load can be animated
across the structure.

An influence line answers the inverse question of a force diagram: not "what moment is there at
each point for this load", but "what moment is there at this point depending on where the load
is".

## Explore (what if…?)

**What it does:** sliders to change the loads, the modulus E and the area and inertia of the
sections, with the model re-solving live. It builds intuition: what happens to the support moment
if the column is stiffer, how much the deflection changes if the inertia doubles. Closing it
restores the original values.

## Step by step: the stiffness method

**What it shows:** the full solution of the model by the stiffness method, in nine steps, with the
actual matrices and vectors of your structure.

![The first step of the stiffness method: numbering the degrees of freedom](img/basic-stiffness-steps.webp)

1. **Degree-of-freedom numbering:** free ones first, restrained ones after.
2. **Local matrices [k]** of each member (6 × 6 for 2D frames, 4 × 4 for trusses, 12 × 12 in 3D).
3. **Transformation** to global axes: [K]ₑ = [T]ᵀ [k] [T].
4. **Assembly** of the global stiffness matrix [K].
5. **Load vector {F}**, including the equivalent nodal loads of the loads on members.
6. **Boundary conditions:** the partition into free and restrained degrees of freedom, with any
   prescribed displacements.
7. **Solution** for the displacements {u}.
8. **Reactions {R}.**
9. **Internal forces:** each member's displacements taken to local axes, the resulting force, and
   the correction for the loads along the span.

The **Matrix Explorer** lets you walk through any of them entry by entry. The theory behind each
step is in [chapter 6](06-theory.md#the-stiffness-method).

---

## Limitations

- P-Δ, buckling, dynamic, plastic collapse, moving load, influence line, explore and step by step
  do not accept models with sliding joints (in 2D) or partial releases (in 3D). The program says
  so.
- Kinematic analysis, plastic collapse, moving load and influence line are available in 2D only.

---

[← Basic mode in 3D](03-basic-3d.md) · [Contents](README.md) · [Next: PRO mode →](05-pro.md)
