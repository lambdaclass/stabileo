# 6. Theory

This chapter explains **what the program computes and how**, with the theory each part uses. It
can be read on its own, as notes on matrix analysis and finite elements applied to the tool.

- [Units and conventions](#units-and-conventions)
- [The stiffness method](#the-stiffness-method)
- [The Euler-Bernoulli member](#the-euler-bernoulli-member)
- [From member forces to diagrams](#from-member-forces-to-diagrams)
- [Stresses in the section](#stresses-in-the-section)
- [Stability and dynamics](#stability-and-dynamics)
- [Plasticity](#plasticity)
- [Finite elements: plates and shells](#finite-elements-plates-and-shells)

---

## Units and conventions

**Units.** SI: lengths in **m**, forces in **kN**, moments in **kN·m**, elastic moduli and member
stresses in **MPa**, unit weights in **kN/m³**. For plates, stresses are reported in **kN/m²** and
moments per unit width in **kN·m/m**.

**Global axes.** **Z is vertical, pointing up**; X and Y are horizontal. Gravity acts along −Z. A
2D model lives in the **XZ** plane, so its degrees of freedom are **ux**, **uz** and the rotation
**θy**, and its member forces are **N**, **Vz** and **My**. In the plane, rotations are positive
counter-clockwise, looking at the structure with X to the right and Z up: the usual plane
convention, even though the names θy and My come from the Y axis of space.

**A member's local axes.** Local x runs from node I to node J; local z is the global vertical
projected perpendicular to the member; local y completes the triad. Vertical members use global X
as the reference. In a horizontal beam loaded by gravity, the main moment is **My**.

**Signs.** Axial force positive in tension. Moment drawn on the tension side. Reactions and
displacements in global axes.

---

## The stiffness method

All member analysis, in Basic and in PRO, uses the **stiffness method** (also called the direct
stiffness method). The idea: instead of looking for the forces, look for the **displacements of
the nodes**, because everything else follows from them directly.

The whole method rests on one equation:

```math
[K]\,\{u\} = \{F\}
```

where **[K]** is the structure's stiffness matrix, **{u}** the node displacements and **{F}** the
loads. These are the nine steps the
[step-by-step view](04-advanced-tools.md#step-by-step-the-stiffness-method) shows.

### The matrix of one member

Each member relates the forces at its ends to the displacements of its ends. For a plane frame
member, in its local axes (axial u, transverse w and rotation θ at each end, with θ positive
counter-clockwise):

```math
[k] = \begin{bmatrix}
\frac{EA}{L} & 0 & 0 & -\frac{EA}{L} & 0 & 0 \\
0 & \frac{12EI}{L^3} & \frac{6EI}{L^2} & 0 & -\frac{12EI}{L^3} & \frac{6EI}{L^2} \\
0 & \frac{6EI}{L^2} & \frac{4EI}{L} & 0 & -\frac{6EI}{L^2} & \frac{2EI}{L} \\
-\frac{EA}{L} & 0 & 0 & \frac{EA}{L} & 0 & 0 \\
0 & -\frac{12EI}{L^3} & -\frac{6EI}{L^2} & 0 & \frac{12EI}{L^3} & -\frac{6EI}{L^2} \\
0 & \frac{6EI}{L^2} & \frac{2EI}{L} & 0 & -\frac{6EI}{L^2} & \frac{4EI}{L}
\end{bmatrix}
```

Each column is the set of end forces that appears when a unit displacement is imposed on one
degree of freedom with all the others held. A truss member keeps only the axial terms (EA/L). In
3D the matrix is 12 × 12: bending in the other plane (with the other inertia) and torsion (GJ/L)
are added.

### Transformation

The matrix above is in local axes. To assemble it, it is taken to global axes with the member's
rotation matrix **[T]**:

```math
[K]_e = [T]^T\,[k]\,[T]
```

### Assembly

The structure's matrix is built by adding each member's contribution at the positions of its
degrees of freedom. Where two members share a node their stiffnesses add up: that sum is
compatibility (the node moves the same for both) and the node's equilibrium, written at once.

### The load vector

Loads on nodes go in directly. Loads **on members** (distributed, point, thermal) are replaced by
**equivalent nodal loads**: the reactions the member would have if both its ends were fixed, with
their sign reversed. For a uniform load q on a member of length L, they are q·L/2 of force and
q·L²/12 of moment at each end.

### Boundary conditions and solution

The degrees of freedom are split into **free (f)** and **restrained (r)**:

```math
\begin{bmatrix} K_{ff} & K_{fr} \\ K_{rf} & K_{rr} \end{bmatrix}
\begin{Bmatrix} u_f \\ u_r \end{Bmatrix}
=
\begin{Bmatrix} F_f \\ F_r + R \end{Bmatrix}
```

The restrained displacements $u_r$ are known: zero, or the prescribed value if there is a
settlement. The first row is solved for the free displacements:

```math
\{u_f\} = [K_{ff}]^{-1}\left(\{F_f\} - [K_{fr}]\{u_r\}\right)
```

and the second gives the **reactions**:

```math
\{R\} = [K_{rf}]\{u_f\} + [K_{rr}]\{u_r\} - \{F_r\}
```

If $[K_{ff}]$ cannot be inverted (it is singular), the structure is a **mechanism**: there is a
movement that takes no force. That is what step 3 of the
[kinematic analysis](04-advanced-tools.md#kinematic-analysis) detects.

### Member forces

With the displacements solved, each member's displacements are taken to local axes and multiplied
by its [k]. The fixed-end forces of the loads along the span are then added:

```math
\{f\} = [k]\,[T]\,\{u\}_e + \{f_{fixed}\}
```

---

## The Euler-Bernoulli member

Stabileo's members follow **Euler-Bernoulli** theory: plane sections stay plane and
**perpendicular to the axis** after deforming. That amounts to neglecting shear deformation.

**Why a straight member needs no mesh.** The Euler-Bernoulli beam equation with no load along the
span, EI·w'''' = 0, has a cubic polynomial as its solution. The matrix above is derived precisely
with cubic displacements (the Hermite functions), so it is **exact**: splitting a prismatic member
into more elements does not change the result at the nodes. With loads along the span the same
holds, as long as equivalent nodal loads are used.

**When it stops being enough.** Because it neglects shear, the Euler-Bernoulli member always comes
out **stiffer** than the real piece. In a slender beam the difference is negligible; in a deep one
it is not. For a simply supported beam under uniform load, the deflection error is about 2% at
L/h = 10, 8% at L/h = 5 and 19% at L/h = 3. That is where the piece is better modelled as a plate,
in PRO. The post [frame members or finite
elements?](https://stabileo.com/en/blog/bars-or-finite-elements/) works through it with the
numbers.

### Hinges

A hinge at the end of a member releases one degree of freedom (the rotation, for instance). The
hinged member's matrix is the one obtained by removing that degree of freedom from the rigid matrix
by **static condensation**. If **a** are the degrees of freedom that are kept and **b** the
released ones:

```math
[k^*] = [k_{aa}] - [k_{ab}]\,[k_{bb}]^{-1}\,[k_{ba}]
```

For a member with one hinged end, that turns the coefficients 12EI/L³, 6EI/L² and 4EI/L into
3EI/L³, 3EI/L² and 3EI/L. The engine uses those already-condensed coefficients directly, and
corrects the fixed-end forces with the same operation.

---

## From member forces to diagrams

The stiffness method gives the forces **at the ends** of each member. Inside the member, the
diagrams come from **equilibrium**, cutting the member at each point and integrating the loads
along the span:

```math
V(x) = V_i + \int_0^x q\,d\xi + \sum P
```

```math
M(x) = M_i - V_i\,x - \int_0^x q\,(x-\xi)\,d\xi - \sum P\,(x-a) - \sum M_0
```

$V_i$ and $M_i$ are the forces at the start of the member, q the distributed load, P the point
loads at positions a and $M_0$ the concentrated moments. The signs follow the program's internal
convention, in which dM/dx = −V; the drawn diagram follows the convention in
[units and conventions](#units-and-conventions).

That is why the moment under a uniform load comes out parabolic without subdividing the member.
The deformed shape is drawn with the Hermite functions.

---

## Stresses in the section

[Section analysis](04-advanced-tools.md#section-analysis) computes stresses with the classical
theories of strength of materials.

**Normal stress (Navier).** In 3D, with bending in both planes, the stress at a point (y, z) of the
section adds the effect of the axial force and of each moment:

```math
\sigma = \frac{N}{A} \pm \frac{M_y\,z}{I_y} \pm \frac{M_z\,y}{I_z}
```

where each term is positive on the side that moment puts in tension. The line where σ = 0 is the
**neutral axis**. If the load is eccentric, whether the resultant
falls inside or outside the **central core** decides whether the whole section works with the same
sign.

**Shear stress (Jourawski).**

```math
\tau = \frac{V\,Q}{I\,b}
```

where **Q** is the first moment of the part of the section on one side of the fibre and **b** the
width at that fibre. In thin-walled profiles the program draws the **shear flow** running along
the walls.

**Torsion.** The theory depends on the shape of the section:

| Section | Theory | Stress |
|---|---|---|
| Circular (solid or hollow) | Cauchy (exact) | τ = T·r / Iₚ |
| **Closed** thin wall | Bredt | τ = T / (2·Aₘ·t) |
| **Open** thin wall | Saint-Venant | $\tau_{\max} = T \cdot t_{\max} / J$, with J = ⅓·Σ b·t³ |
| Solid non-circular (e.g. rectangular) | Saint-Venant | J and τ from the Saint-Venant solution for that shape |

Aₘ is the area enclosed by the wall's **mid-line**. Opening a closed wall changes the torsional
stiffness by orders of magnitude. The post [Bredt or
Saint-Venant](https://stabileo.com/en/blog/torsion-bredt-saint-venant/) shows by how much.

**Stress state and failure.** From σ and τ the program builds the stress tensor, the principal
stresses and **Mohr's circle**, and evaluates three criteria, each compared with fy: **Von Mises**
($\sigma_{vm} = \sqrt{\sigma^2 + 3\tau^2}$), **Tresca** ($\tau_{\max} = \sqrt{(\sigma/2)^2 + \tau^2}$)
and **Rankine** (the largest principal stress in absolute value).

---

## Stability and dynamics

**Second order (P-Δ).** Equilibrium is written on the deformed geometry. A **geometric stiffness**
$[K_G]$, which depends on the axial forces (compression subtracts stiffness), is added to the elastic
stiffness, and the solution is iterated until the displacements converge:

```math
\left([K] + [K_G(N)]\right)\{u\} = \{F\}
```

**Linear buckling.** Look for the factor λ that makes the total stiffness singular:

```math
\left([K] + \lambda\,[K_G]\right)\{\phi\} = 0
```

The critical load is λ times the applied load, and φ is the buckled shape.

**Modal analysis.** Undamped free vibration satisfies

```math
\left([K] - \omega^2\,[M]\right)\{\phi\} = 0
```

with **[M]** the mass matrix, built from the unit weight of the materials: **consistent**
(distributed with the same shape functions as the stiffness) for members without releases and for
truss members, and **lumped** at the nodes (half the mass at each end) for members with a
release. Each ω is a
natural frequency (f = ω / 2π, T = 1/f) and each φ a mode shape. The **effective mass** of each
mode tells what fraction of the total mass it mobilises in each direction.

**Response-spectrum analysis (PRO).** Combines the peak response of each mode, read from a design
spectrum, with the CQC (complete quadratic combination) or SRSS (square root of the sum of squares)
rules.

---

## Plasticity

**Plastic collapse** is computed incrementally. The load is increased until the moment at a member
end reaches the plastic moment Mp = Zp·fy, with Zp taken as b·h²/4 from the section's width and
depth; a plastic hinge is placed there, which rotates without
taking more moment, and the modified structure keeps being loaded. The process ends when the
hinges form a **mechanism**. The accumulated load factor at that point is the **collapse factor**.

---

## Finite elements: plates and shells

A member sums up a piece on its axis: it is a **one-dimensional** model. A slab or a wall cannot be
summed up like that, because they work in two directions. PRO models them as **plates**: the
surface is divided into small elements (the **mesh**), inside each one the displacements are
approximated with simple functions, and they are assembled just like members.

The stiffness method is, at bottom, the particular case of the finite element method in which the
element is a member. The difference is that for a member the approximation is exact, and for a
plate it is not: **the result improves as the mesh is refined** and converges to the solution of
the continuous problem. That is why it pays to check that the mesh is fine enough: if the result
still changes when you refine it, the mesh was not enough.

**Bending and membrane.** A plate works in two ways: **bending** (loads perpendicular to its plane,
like a slab) and **membrane** (loads in its plane, like a wall taking wind). Stabileo's elements
combine both.

**Thin or thick plate.** There are two plate theories. **Kirchhoff**, for thin plates, neglects
shear deformation (like Euler-Bernoulli for beams). **Mindlin-Reissner** includes it, and works for
thick plates.

- **DKT** (triangles): applies the Kirchhoff assumption at discrete points of the element, so it is
  a thin plate with no shear deformation. Its membrane is a constant-strain triangle, poor at
  in-plane bending.
- **MITC4** (quadrilaterals): starts from Mindlin-Reissner, so it works for both thick and thin
  plates.

**Shear locking.** A naively formulated Mindlin quadrilateral becomes far stiffer than it should
when the plate is thin: the slab responds as if it were thicker. **MITC4** (*Mixed Interpolation of
Tensorial Components*) exists to prevent that: it interpolates the shear strains differently, so
the element does not lock. Stabileo adds enhanced strains (EAS) to the membrane, which improve its
response to in-plane bending.

**Connection with members.** Plates and members share degrees of freedom only at **common nodes**.
For a beam to work together with the slab, they must share nodes along the edge.

**Mesh quality.** Very elongated elements, very small angles or quadrilaterals whose four nodes are
not in one plane give worse results. The engine reports them after solving.

---

## Further reading

- **The blog** works through specific questions with numbers computed by the program:
  [stabileo.com/en/blog](https://stabileo.com/en/blog/).
- **The engine's verification** against analytical solutions and reference problems is in
  [BENCHMARKS.md](../../BENCHMARKS.md).

---

[← PRO mode](05-pro.md) · [Contents](README.md)
