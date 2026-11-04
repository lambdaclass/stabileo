# Frame and truss elements

This file covers the straight two-node line elements: the truss (bar), the 2D frame, the 3D frame
and the 3D frame with restrained warping. It also covers their transformations, member releases,
equivalent nodal loads and how internal forces are recovered from them. Geometric stiffness and
mass for these elements are in [mass-geometric-dynamics.md](mass-geometric-dynamics.md). Cables,
curved beams, connectors and fiber beams are in [special-elements.md](special-elements.md).

Every matrix here is also derived independently from shape functions in SymPy and compared to the
Rust kernels at random points with a tolerance of 1e-13 (`tools/symbolic/derive.py`,
`engine/tests/symbolic_elements.rs`, [SYMBOLIC.md](../verification/SYMBOLIC.md)). So for this
family a reviewer is checking that the *formulation* is the right one. The algebra from the
formulation to the code is already checked mechanically.

| Kernel | Source |
|---|---|
| Truss stiffness | `engine/src/element/truss.rs`: `truss_local_stiffness_2d/3d`, `truss_global_stiffness_2d/3d`, `scatter_truss_3d` |
| Frame stiffness | `engine/src/element/frame.rs`: `frame_local_stiffness_2d`, `frame_local_stiffness_3d`, `add_bending_block`, `torsion_warping_block`, `frame_local_stiffness_3d_warping` |
| Transformations, local axes | `engine/src/element/transform.rs`: `frame_transform_2d`, `truss_transform_2d`, `compute_local_axes_3d`, `default_ey_ref`, `orthonormal_frame`, `frame_transform_3d(_warping)` |
| Equivalent nodal loads | `engine/src/element/fef.rs`: `timoshenko_deflection_shapes`, `timoshenko_rotation_shapes`, `fef_*`, `adjust_fef_for_hinges(_3d)`, `axial_distributed_fef`, `fef_distributed_torsion_warping` |
| Assembly of K and f | `engine/src/solver/assembly.rs`: `assemble_stiffness_2d/3d`, `assemble_element_loads_2d/3d(_warping/_mapped)`, `truss_member_load_2d/3d` |
| Internal forces | `engine/src/solver/linear.rs`: `compute_internal_forces_2d_with_loads`, `compute_internal_forces_3d_with_loads` |
| Diagrams, deflected shape | `engine/src/postprocess/diagrams.rs` (`compute_diagram_value_at_sorted`, `MemberDeflection`), `diagrams_3d.rs` (`evaluate_diagram_3d_at`) |

## 1. Units and inputs

- Lengths are in m and forces in kN. The material modulus `E` is given in **MPa** and multiplied
  by 1000 in assembly, so the kernels receive kN/m².
- $G = E/(2(1+\nu))$ is always derived from `nu`. There is no independent shear-modulus input.
- Section inputs:
  - 2D: `a`, `iz`, optional `as_y`.
  - 3D: `a`, `iy`, `iz`, `j`, optional `cw`, `as_y`, `as_z`.
- When a shear area is given, the member becomes a Timoshenko member in that plane. With no
  shear area the member is Euler–Bernoulli.
- Shear-area naming differs between 2D and 3D. This is a hazard for anyone writing JSON by hand
  (see [FR-3](#discrepancies-and-open-questions-for-review)).
  - **3D**, $\phi_y = 12EI_y/(G\,A_{s,y}L^2)$ and $\phi_z = 12EI_z/(G\,A_{s,z}L^2)$. `as_y` is the
    area that goes with **`iy`**, so it resists shear along local **z** (the depth of a section in
    its default orientation). The web passes `asY` as the web area $h\,t_w$ of an I-section, for
    example (`web/src/lib/section/shear-areas.ts`).
  - **2D**, $\phi = 12EI_z/(G\,A_{s,y}L^2)$. `as_y` is the area that goes with `iz`, so it resists
    shear along the in-plane transverse local y.

## 2. Coordinate systems and DOFs

### 2.1 Global frame

The global frame is right-handed and Z-up, with gravity along $-Z$
([ADR 0001](../adr/0001-z-up-coordinate-system.md)).

A **2D model lives in the global XZ plane**. A 2D node's `z` field is the vertical coordinate,
and assembly uses $\Delta y_{2D} = z_j - z_i$. The 2D DOFs per node are $(u_X, u_Z, \theta)$.
θ is positive counter-clockwise when the X axis points right and the Z axis points up. That is a
right-hand rotation about $-Y$, so $\theta_{2D} = -\theta_Y^{3D}$. The 2D nodal moment field `my`
loads this θ directly (`assemble_load_vector_2d`), so it is a moment about $-Y$ despite its name.
[assembly-constraints.md](assembly-constraints.md) covers how the 2D and 3D paths are kept
consistent.

3D DOFs per node are $(u_X,u_Y,u_Z,\theta_X,\theta_Y,\theta_Z)$. When any section has `cw > 0`, a
seventh DOF, the warping rate $\theta_x'$, is added to every node (`DofNumbering`, see
[assembly-constraints.md](assembly-constraints.md)).

### 2.2 Local axes of a 2D member

$e_x = (\cos\alpha, \sin\alpha)$ with $\cos\alpha = \Delta X/L$ and $\sin\alpha = \Delta Z/L$, and
$e_y = (-\sin\alpha,\cos\alpha)$, which is $e_x$ rotated +90° in the XZ plane. The rotation DOF
needs no transformation:

$$
T_{2D} = \operatorname{diag}(R, 1, R, 1),\qquad R=\begin{bmatrix}\cos\alpha&\sin\alpha\\-\sin\alpha&\cos\alpha\end{bmatrix},\qquad u_\text{local}=T\,u_\text{global}.
$$

### 2.3 Local axes of a 3D member (`compute_local_axes_3d`)

$e_x = (x_j - x_i)/L$. The reference vector for local y is chosen as follows:

1. **Default** (`default_ey_ref`). Let $\hat u = Z$, or $\hat u = X$ when $|e_x\cdot Z| > 0.999$
   (vertical or near-vertical members). Then local z is the part of $\hat u$ perpendicular to the
   axis, $e_z \propto \hat u - (\hat u\cdot e_x)e_x$, and $e_y = e_z \times e_x$. So for any member
   whose axis is not vertical, local z is "up" and gravity bends it about local y: $M_y$ is the
   main gravity moment and $I_y$ the strong-axis inertia of a section in its default
   orientation. Some special cases:
   - A member along +X has $e_y = +Y$ and $e_z = +Z$.
   - A vertical member (along +Z) has $e_z = +X$ and $e_y = X\times Z = -Y$.
2. **Explicit local-y vector** $r$ (`local_yx/yy/yz`). Then $e_z \propto e_x\times r$ and
   $e_y = e_z\times e_x$. If $r \parallel e_x$, X is used instead, or Y when $|e_{x,X}|\ge 0.9$
   (`orthonormal_frame`).
3. **Roll angle** β, in degrees: $e_y \leftarrow \cos\beta\,e_y + \sin\beta\,e_z$ and
   $e_z \leftarrow -\sin\beta\,e_y + \cos\beta\,e_z$, a right-hand rotation about $e_x$.
4. **`left_hand = true`** would set $e_y \leftarrow -e_y$, which makes the local triad
   left-handed. Solves now refuse it, because it changed the stiffness
   ([FR-1](#discrepancies-and-open-questions-for-review)).

The transformation is $T = \operatorname{diag}(\Lambda,\Lambda,\Lambda,\Lambda)$, where the rows
of $\Lambda$ are $e_x, e_y, e_z$ expressed in global coordinates. The warping element inserts a 1
on the diagonal at each warping DOF (positions 6 and 13), because $\theta_x'$ is a scalar along
the member axis. The global stiffness is $K_e = T^{\mathsf T} k\,T$, and a local load vector maps
to global as $f_e = T^{\mathsf T} f_\text{local}$ (`transform_stiffness`, `transform_force`).

### 2.4 Local DOF ordering and rotation conventions

| Element | Local DOF vector |
|---|---|
| 2D truss | $(u_1, v_1, u_2, v_2)$ |
| 3D truss | $(u_1,v_1,w_1,u_2,v_2,w_2)$ |
| 2D frame | $(u_1, v_1, \theta_1, u_2, v_2, \theta_2)$ |
| 3D frame | $(u_1,v_1,w_1,\theta_{x1},\theta_{y1},\theta_{z1},\ u_2,\dots,\theta_{z2})$ |
| 3D warping | $(u_1,v_1,w_1,\theta_{x1},\theta_{y1},\theta_{z1},\theta'_{x1},\ u_2,\dots,\theta'_{x2})$ |

The rotations are right-hand rotation-vector components about the local axes. For a member with
small rotations, the Euler–Bernoulli kinematics are:

$$
\theta_z = \frac{dv}{dx},\qquad \theta_y = -\frac{dw}{dx},
$$

and the axial strain of a fibre at $(y,z)$ is

$$
\varepsilon = u' - y\,v'' - z\,w'' = u' - y\,\theta_z' + z\,\theta_y'.
$$

The minus sign in $\theta_y=-w'$ is why the off-diagonal coupling terms of the xz-plane bending
block have the opposite sign from the xy-plane block: `add_bending_block(…, s = −1)`. For a
Timoshenko member, $\theta$ is the rotation of the cross-section $\psi$, not the slope of the
centroidal axis.

## 3. Truss (bar)

Assumptions: linear elastic, small displacement, constant $EA$, linear axial displacement, no
transverse or rotational stiffness.

$$
U = \tfrac12\int_0^L EA\,u'^2\,dx,\quad u = (1-\xi)u_1 + \xi u_2,\ \xi=x/L
\ \Rightarrow\ k = \frac{EA}{L}\begin{bmatrix}1&-1\\-1&1\end{bmatrix}.
$$

The global form is assembled directly as $K_e = \dfrac{EA}{L}\begin{bmatrix}dd^{\mathsf T}&-dd^{\mathsf T}\\-dd^{\mathsf T}&dd^{\mathsf T}\end{bmatrix}$,
with $d = (x_j-x_i)/L$ the direction cosines (`truss_global_stiffness_2d/3d`). In 2D and 3D the
truss and `cable` element types use the same linear kernel in a linear solve. Cable behaviour,
tension-only and sag, is described in [special-elements.md](special-elements.md).

**Member loads on a truss.** A truss carries nothing transversely, so a load along the member
goes to its nodes as the simply-supported reactions of the bar (the lever rule).
`truss_member_load_2d` and `truss_member_load_3d` handle distributed loads, transverse and axial
point loads, and couples ($\pm M/L$). This is statically exact for the nodes, but the member's
own bending is ignored. The axial force recovered for a truss jumps at an axial point load:
$N(0) = EA\delta/L + F_i$ and $N(L) = EA\delta/L - F_j$.

**Thermal on a truss.** The equivalent load is $f = EA\alpha\Delta T\,[-1, +1]$ along $e_x$, and
the recovered force is $N = EA\delta/L - EA\alpha\Delta T$. The value of $\alpha$ is fixed in the
engine: see §7.4.

## 4. Bending: Euler–Bernoulli and Timoshenko

### 4.1 Assumptions

- The member is straight and prismatic, with constant $E$, $G$, $A$, $I$ and $A_s$ along its
  length.
- Material is linear elastic, and displacements and rotations are small.
- Plane sections remain plane. For Euler–Bernoulli they also stay normal to the axis. Timoshenko
  allows a uniform shear strain $\gamma = v' - \psi$, with shear stiffness $GA_s$.
- The shear centre coincides with the centroid. There is no coupling between bending and torsion
  and no product of inertia: $(y,z)$ must be principal axes, and the user aligns them with the
  roll angle or the local-y vector.
- The axial force does not couple with the bending planes. Axial–bending interaction, P-δ, is
  only in $K_g$ and the nonlinear solvers.

### 4.2 Shape functions

For one bending plane, with DOFs $(v_1,\theta_1,v_2,\theta_2)$, $\xi = x/L$ and
$\mu = 1/(1+\phi)$, the element uses the **interdependent interpolation** of Reddy (1997) and
Friedman & Kosmatka (1993). It is the exact homogeneous solution of the Timoshenko equations
$(GA_s\gamma)' = 0$ and $EI\psi'' + GA_s\gamma = 0$:

$$
\begin{aligned}
N_1 &= \mu\,(1-3\xi^2+2\xi^3+\phi(1-\xi)), &\Psi_1 &= \mu\,6(\xi^2-\xi)/L,\\
N_2 &= \mu L\,(\xi-2\xi^2+\xi^3+\tfrac{\phi}{2}(\xi-\xi^2)), &\Psi_2 &= \mu\,(1-4\xi+3\xi^2+\phi(1-\xi)),\\
N_3 &= \mu\,(3\xi^2-2\xi^3+\phi\xi), &\Psi_3 &= \mu\,6(\xi-\xi^2)/L,\\
N_4 &= \mu L\,(-\xi^2+\xi^3-\tfrac{\phi}{2}(\xi-\xi^2)), &\Psi_4 &= \mu\,(-2\xi+3\xi^2+\phi\xi),
\end{aligned}
$$

with $v = \sum N_k d_k$ and $\psi = \sum \Psi_k d_k$ (`timoshenko_deflection_shapes`,
`timoshenko_rotation_shapes`). For $\phi=0$ these are the cubic Hermite functions with
$\Psi = N'$, and the element is the classical Euler–Bernoulli beam. Because the shapes are exact
solutions, the element stiffness is exact for any $L$ and $\phi$: one element per member
reproduces the exact end-force/end-displacement relation of a prismatic member.

### 4.3 Stiffness

$$
U = \tfrac12\int_0^L \left(EI\,\psi'^2 + GA_s\,(v'-\psi)^2\right)dx
$$

With the shapes above, the bending block in the xy plane, DOFs $(v_1,\theta_{z1},v_2,\theta_{z2})$,
is (Przemieniecki 1968, §5.6; McGuire, Gallagher & Ziemian 2000, §4.4):

$$
k_b = \frac{EI}{(1+\phi)L^3}\begin{bmatrix}
12 & 6L & -12 & 6L\\
6L & (4+\phi)L^2 & -6L & (2-\phi)L^2\\
-12 & -6L & 12 & -6L\\
6L & (2-\phi)L^2 & -6L & (4+\phi)L^2
\end{bmatrix},\qquad \phi = \frac{12EI}{GA_sL^2}.
$$

The 3D element contains:

- the axial bar $EA/L$ on $(u_1,u_2)$;
- St-Venant torsion $GJ/L$ on $(\theta_{x1},\theta_{x2})$;
- $k_b(EI_z,\phi_z)$ on $(v_1,\theta_{z1},v_2,\theta_{z2})$;
- $k_b(EI_y,\phi_y)$ on $(w_1,\theta_{y1},w_2,\theta_{y2})$, with every $v$–$\theta$ coupling term
  negated because $\theta_y=-w'$.

These blocks do not couple. The 2D element is the axial bar plus $k_b(EI_z,\phi)$.

### 4.4 Member releases (hinges)

A release sets a member-end moment to zero. It is applied **inside the element** by static
condensation of the released rotation, so the node keeps its own rotation DOF.

For the bending block, take $k = \begin{bmatrix}k_{rr}&k_{rc}\\k_{cr}&k_{cc}\end{bmatrix}$ with
$c$ the released rotation. The condensed matrix is
$k^\* = k_{rr} - k_{rc}k_{cc}^{-1}k_{cr}$, which is placed back with a zero row and column at $c$.
In closed form:

- **One end released** (start or end):

  $$
  k^\*_b = \frac{3EI}{L^3}\,\frac{4}{4+\phi}\begin{bmatrix}1 & -1 & \pm L\\ -1 & 1 & \mp L \\ \pm L & \mp L & L^2\end{bmatrix}
  $$

  over $(v_1,v_2,\theta_\text{other})$, with $12/(4+\phi)$ in the code
  (`frame_local_stiffness_2d`, `add_bending_block`). For $\phi=0$ this is the propped-cantilever
  stiffness $3EI/L^3$.
- **Both ends released**: the bending block is zero.
- **Torsion released at either end**: the whole $GJ$ block is zero. Condensing one DOF of a
  two-DOF spring leaves nothing.
- The 3D releases are independent per axis: `release_my_*`, `release_mz_*`, `release_t_*`.
- The axial DOF is never released.

The same condensation is applied to the equivalent nodal loads (§6.3) and to $K_g$ (see
[mass-geometric-dynamics.md](mass-geometric-dynamics.md)). After a release, the node's rotation
may be held by no element at all: a node reached only by trusses, or only by members released
there. Assembly then adds an **artificial rotational stiffness** of $10^{-10}\max_i K_{ii}$. This
changes no other DOF, because that row and column are otherwise zero. The details are in
[assembly-constraints.md](assembly-constraints.md).

There are **no rigid end offsets** (rigid zones) and no member eccentricities in the frame
element. A reviewer looking for "offset" handling will not find it. Eccentric connections are
modelled with rigid-link constraints or connectors
([assembly-constraints.md](assembly-constraints.md), [special-elements.md](special-elements.md)).

## 5. Torsion with restrained warping (Vlasov)

Members whose section has `cw > 0` in a model with warping DOFs use the 14-DOF element.

- **Assumptions:**
  - Vlasov thin-walled theory with the shear centre at the centroid.
  - Warping displacement proportional to the rate of twist $\theta_x'$.
  - No coupling between warping and bending. The shear centre is not offset, and there is no
    Wagner term in $K$.
- **Interpolation:** the twist $\theta_x$ is the cubic Hermite interpolant of
  $(\theta_{x1},\theta'_{x1},\theta_{x2},\theta'_{x2})$.
- **Energy:**
  $$
  U = \tfrac12\int_0^L\left(GJ\,\theta_x'^2 + EC_w\,\theta_x''^2\right)dx
  $$
  $$
  k_{\omega} = \frac{GJ}{30L}\begin{bmatrix}36&3L&-36&3L\\3L&4L^2&-3L&-L^2\\-36&-3L&36&-3L\\3L&-L^2&-3L&4L^2\end{bmatrix}
  + \frac{EC_w}{L^3}\begin{bmatrix}12&6L&-12&6L\\6L&4L^2&-6L&2L^2\\-12&-6L&12&-6L\\6L&2L^2&-6L&4L^2\end{bmatrix}
  $$
  (Barsoum & Gallagher 1970; McGuire, Gallagher & Ziemian 2000, §8.4; `torsion_warping_block`).
  The cubic interpolation is not the exact solution, which is hyperbolic in $kx$ with
  $k=\sqrt{GJ/EC_w}$. So this element converges with mesh refinement (as $h^4$ in tip twist)
  rather than being exact per member. Use several elements per member when $kL \gtrsim 1$.
- **Releases:** a torsion release at either end zeroes the whole 4×4 block, warping included.
  There is no "warping release" flag. Warping restraint at a node is a support condition (`rw`,
  or a spring `kw`).
- **Warping DOF continuity:** $\theta_x'$ is shared between members meeting at a node. This is
  right for collinear members of the same section. At a joint between non-collinear members or
  different sections, real warping transmission depends on the joint detail. Sharing the DOF
  assumes full continuity: see [FR-5](#discrepancies-and-open-questions-for-review).
- **Mixed models:** a member with no `cw` in a 7-DOF model uses the 12×12 kernel scattered
  through `DOF_MAP_12_TO_14`. Its warping DOFs get no stiffness from that member.

## 6. Equivalent nodal loads

### 6.1 Principle

Member loads are converted to **consistent equivalent nodal loads**
$f_e = \int_0^L N^{\mathsf T}q\,dx + \sum N^{\mathsf T}(a)P + \sum \Psi^{\mathsf T}(a)M$ using the
element's own shapes: interdependent Timoshenko shapes, or Hermite when $\phi=0$. The functions
in `fef.rs` are called "fixed-end forces", but they **return the equivalent nodal loads**, which
are the negatives of the fixed-end reactions. They are added to the global load vector:
$F \mathrel{+}= T^{\mathsf T}f_e$.

The interdependent shapes are exact homogeneous solutions, so by reciprocity
$f_e$ equals minus the exact fixed-end reactions of the loaded Timoshenko member. The symbolic
generator verifies this case by case against a piecewise exact solution of the loaded member
([SYMBOLIC.md](../verification/SYMBOLIC.md), "Equivalent loads checked against an independent
solution").

### 6.2 Closed forms (one plane, local transverse load $q$ along $+y$)

- **Full-length trapezoid** $q_i \to q_j$ (`fef_distributed_2d`), split into a uniform part
  $q_i$ and a triangle $\Delta q = q_j-q_i$:
  - uniform: $V_i=V_j=qL/2$, $M_i=-M_j=qL^2/12$;
  - triangle: $V_i = 3\Delta qL/20$, $M_i = \Delta qL^2/30$, $V_j = 7\Delta qL/20$,
    $M_j = -\Delta qL^2/20$.

  The shear correction (`shear_correct`) is exact for transverse forces:

  $$
  V' = \frac{V+\phi R}{1+\phi},\quad M_i' = \frac{M_i + \frac{\phi}{2}(M_i-M_j)}{1+\phi},\quad M_j' = \frac{M_j - \frac{\phi}{2}(M_i-M_j)}{1+\phi},
  $$

  with $R$ the simply supported reactions. A uniform load is unchanged by $\phi$.
- **Partial trapezoid** on $[a,b]$ (`fef_partial_distributed_2d`): $\int_a^b q\,N\,dx$ by
  3-point Gauss–Legendre. The integrand has degree 4, so this is exact.
- **Point force** $P$ at $a$ (`fef_point_load_2d`): $P\,N(a)$. For $\phi=0$ this is
  $\left[\frac{Pb^2(3a+b)}{L^3},\ \frac{Pab^2}{L^2},\ \frac{Pa^2(a+3b)}{L^3},\ -\frac{Pa^2b}{L^2}\right]$.
- **Concentrated couple** $M$ at $a$, counter-clockwise positive: $M\,\Psi(a)$.
- **Axial point force** $P_x$ at $a$: $P_x[b/L,\ a/L]$. **Axial distributed load** on $[a,b]$
  (`axial_distributed_fef`): $\int q\,N_\text{lin}\,dx$.
- **Thermal** (`fef_thermal_2d/3d`): $f = EA\alpha\Delta T[-1,+1]$ axially, and
  $f = EI\kappa_0[0,-1,0,+1]$ for the bending DOFs with $\kappa_0 = \alpha\Delta T_g/h$. This is
  $\int \Psi'^{\mathsf T}EI\kappa_0\,dx = EI\kappa_0(\Psi(L)-\Psi(0))$, independent of $\phi$.
  Gradient sign conventions:
  - 2D $\Delta T_g = T(-y) - T(+y)$;
  - 3D $\Delta T_{gy} = T(-y)-T(+y)$, which acts on $\theta_z$;
  - 3D $\Delta T_{gz} = T(+z)-T(-z)$, which acts on $\theta_y$.

  The two 3D gradients take **opposite faces as positive**. This is long-standing, and the web
  maps to it (`web/src/lib/engine/solver-service.ts`).
- **Distributed torque on the warping element** (`fef_distributed_torsion_warping`):
  $\int t\,N_\text{Hermite}$, giving
  $M_{x,i} = L(7t_i+3t_j)/20$, $B_i = L^2(3t_i+2t_j)/60$, $M_{x,j} = L(3t_i+7t_j)/20$ and
  $B_j = -L^2(2t_i+3t_j)/60$. The function currently has no callers: no load type reaches it.

**3D.** Each plane is the 2D result with its own $\phi$: a local-y load uses $\phi_z$ and a
local-z load uses $\phi_y$. The moments of the local-z plane are negated when placed on
$\theta_y$ (`place_bending_planes_3d`) because $\theta_y=-w'$. The 3D thermal gradient about y
does **not** flip, because its definition already takes $+z$ as the hot face. The 3D point load
has only transverse components: there is no axial point force or couple on a 3D member.

### 6.3 Releases and loads

A released end has a zero end moment, so the equivalent loads are condensed with the same
operator as the stiffness: $f^\* = f_r - k_{rc}k_{cc}^{-1}f_c$ (`adjust_fef_for_hinges(_3d)`).

- One end released, using the Timoshenko ratios $k_{v\theta}/k_{\theta\theta} = 6/(L(4+\phi))$
  and $k_{\theta_j\theta_i}/k_{\theta_i\theta_i} = (2-\phi)/(4+\phi)$:

  $$
  V_i^\* = V_i - \tfrac{6}{L(4+\phi)}M_i,\quad V_j^\* = V_j + \tfrac{6}{L(4+\phi)}M_i,\quad M_j^\* = M_j - \tfrac{2-\phi}{4+\phi}M_i,\quad M_i^\*=0.
  $$

- Both ends released: $V_i^\* = V_i - (M_i+M_j)/L$, $V_j^\* = V_j + (M_i+M_j)/L$, and both
  moments are zero.

In the xz plane the shear redistribution signs flip, again because $\theta_y=-w'$.

## 7. Internal force recovery

### 7.1 End forces

For each member, the solver computes

$$
f_\text{local} = k\,T\,u_e - f_e^\*,
$$

the forces the nodes exert on the member, including the member loads
(`compute_internal_forces_2d/3d_with_loads`). It reports them with these signs:

| Quantity | Start (node I) | End (node J) |
|---|---|---|
| $N$ (tension +) | $-f_{u_1}$ | $+f_{u_2}$ |
| $V_y$ | $+f_{v_1}$ | $-f_{v_2}$ |
| $V_z$ (3D) | $+f_{w_1}$ | $-f_{w_2}$ |
| $M_x$ (3D) | $+f_{\theta_{x1}}$ | $-f_{\theta_{x2}}$ |
| $M_y$ (3D) | $+f_{\theta_{y1}}$ | $-f_{\theta_{y2}}$ |
| $M_z$ / 2D $M$ | $+f_{\theta_{z1}}$ | $-f_{\theta_{z2}}$ |
| Bimoment $B$ (warping) | $-f_{\theta'_{x1}}$ | $+f_{\theta'_{x2}}$ |

The diagrams between the ends follow from statics of the free body $[0,x]$
(`compute_diagram_value_at_sorted`, `evaluate_diagram_3d_at`):

$$
\text{2D: } M(x) = M_s - V_s\,x - \textstyle\int_0^x q(t)(x-t)\,dt - \sum_{a<x}P(x-a) + \sum_{a<x}M_a,\qquad V(x) = V_s + \int_0^x q + \sum_{a<x}P,
$$

$$
\text{3D: } M_z(x) = M_{z,s} - V_{y,s}x - \dots,\qquad M_y(x) = M_{y,s} + V_{z,s}x + \dots
$$

**One rule covers all of them.** Apart from $N$, which is positive in tension, every reported
component is the component along the local axes of the resultant acting on the **negative
($-x$) face** of a cut. On the start side that is exactly the end force the node exerts on the
member: $V_{y,s} = f_{v_1}$, $M_{z,s} = f_{\theta_{z1}}$, and so on.

This is *minus* the positive-face (outward-normal) vector convention used by many textbooks.
Some consequences, pinned by `engine/tests/derivation_frames.rs`:

| Case | Reported value |
|---|---|
| Simply supported span along $+X$, gravity, 2D | $M(L/2) = -qL^2/8$ (positive $M$ = hogging, tension on local $+y$) |
| Same span in 3D, default axes, load along local $-z$ | $M_y(L/2) = +qL^2/8$ (tension on local $-z$, i.e. sagging) |
| Same span in 3D, load along local $-y$ | $M_z(L/2) = -qL^2/8$ (tension on local $-y$, the 2D sign) |
| Shear at node I of that span (all planes) | $+$ the support reaction |
| Cantilever along $+X$ with tip torque $+T$ about $x$ | $M_x = -T$ along the whole member |

### 7.2 Deflected shape

`MemberDeflection` (diagrams.rs) does not interpolate the nodal values with the shape functions.
It integrates the loaded member exactly: $m = EI\psi'$, $s = m'$, $s' = q$ and
$v' = \psi - s/(GA_s)$, with the three integration constants chosen to satisfy the end
conditions (rotation or hinge, and end displacement). So the drawn deflection includes the
member loads and the shear flexibility, and is exact for a prismatic member.

### 7.3 2D versus 3D moment sign

The 2D $M$ is the $\theta_z$ component. So for a horizontal beam it has the sign of the 3D $M_z$,
not of the 3D $M_y$. A horizontal gravity-loaded beam reports a negative midspan moment in 2D and
a positive $M_y$ in 3D. Each mode is self-consistent, but anyone comparing 2D and 3D output must
flip one of them. The downstream design checks use $|M|$ (`rc_check.rs`,
`cirsoc201_check.rs`, `masonry_check.rs`), so this sign does not reach a capacity check. The
declared sign convention of the beam-station output did not match the values (FR-2, fixed).

### 7.4 Thermal loads: $\alpha$ and depth are fixed in the engine

The frame and truss thermal paths take $\alpha = 12\times10^{-6}$/°C and the depth
$h = \sqrt{12I/A}$ (the depth of the rectangle with the same $I/A$) as constants. Neither is an
input. The web layer compensates for both: it scales `dtUniform` by $\alpha_\text{mat}/\alpha_\text{eng}$
and `dtGradient` by the ratio of the true depth to $\sqrt{12I/A}$ (`web/src/lib/engine/thermal-alpha.ts`,
`thermalDepthScale`). So the engine's thermal input is an *equivalent* temperature, not the
physical one. Shell thermal loads, by contrast, take an optional `alpha`. See
[FR-4](#discrepancies-and-open-questions-for-review).

## 8. Limits of validity

- Small displacements and small strains. Large rotations need the co-rotational solver
  ([nonlinear.md](nonlinear.md)).
- Prismatic members only. A tapered member must be split into several prismatic elements.
- Principal axes only, with the shear centre at the centroid. An asymmetric section (angle,
  channel, Z) loaded off its shear centre twists in reality, but this element does not couple
  bending with torsion. The section properties must be principal ($I_{yz}=0$ in the local axes).
- The Euler–Bernoulli option is exact only for slender members. For deep members ($L/h \lesssim 5$)
  give shear areas.
- The warping element uses a cubic twist, so it needs mesh refinement when $kL$ is large (§5).
  Warping continuity at joints is full by assumption.
- Element loads are always consistent loads in the member's local axes. Any projection of global
  loads (gravity on an inclined member, projected versus true length) is done before the engine
  is called ([assembly-constraints.md](assembly-constraints.md)).

## 9. Verification map

| What | Where |
|---|---|
| Every frame/truss stiffness entry, all 4 (2D) and 64 (3D) release combinations, EB and Timoshenko, warping | `engine/tests/symbolic_elements.rs` (generated by `tools/symbolic/gen.py`, derivations in `tools/symbolic/derive.py`: `k_eb`, `k_timoshenko`, `k_warping`, `condense`, `frame_2d/3d`, `frame_3d_warping`) |
| Equivalent nodal loads, all types, with releases, against an independent exact solution of the loaded member | `symbolic_elements.rs`: `fef_*` cases; `derive.consistent_load_transverse`, `derive.exact_fixed_end` |
| Local axes from their geometric definition (default, explicit vector, roll, left-hand, vertical) | `symbolic_elements.rs` (`compute_local_axes_3d`), `engine/tests/local_axis_convention.rs`, `engine/tests/local_axis_adversarial.rs`, `transform.rs` unit tests |
| Rigid-body modes of frame elements | `engine/tests/element_rigid_body_modes.rs` |
| Statically determinate structures exactly (end forces, reactions) | `engine/tests/determinate_exact.rs` |
| Warping cantilever against Vlasov's closed form; release kills twist transmission | `engine/tests/validation/domains/response/warping_torsion.rs` (`validation_warping_cantilever_end_torque_matches_vlasov`, `validation_warping_torsion_release_kills_twist_transmission`) |
| Differential comparison with OpenSees (frames, Timoshenko, releases, loads) | `engine/tests/opensees_differential_regressions.rs`, `tools/opensees/` |
| Result certificates (solution of the assembled system) | [CERTIFY.md](../verification/CERTIFY.md) |
| Moment/shear sign, bimoment recovery, left-handed axes (this document) | `engine/tests/derivation_frames.rs` |

## References

- J. S. Przemieniecki, *Theory of Matrix Structural Analysis*, McGraw-Hill, 1968, ch. 4–5.
- W. McGuire, R. H. Gallagher, R. D. Ziemian, *Matrix Structural Analysis*, 2nd ed., Wiley, 2000,
  ch. 4, 8.
- R. S. Barsoum, R. H. Gallagher, "Finite element analysis of torsional and torsional–flexural
  stability problems", *IJNME* 2 (1970) 335–352.
- J. N. Reddy, "On locking-free shear deformable beam finite elements", *CMAME* 149 (1997)
  113–132.
- Z. Friedman, J. B. Kosmatka, "An improved two-node Timoshenko beam finite element", *Computers
  & Structures* 47 (1993) 473–481.
- V. Z. Vlasov, *Thin-Walled Elastic Beams*, 2nd ed., Israel Program for Scientific
  Translations, 1961.
- N. S. Trahair, *Flexural–Torsional Buckling of Structures*, E & FN Spon, 1993.

## Discrepancies and open questions for review

| ID | Finding | Status | Test |
|---|---|---|---|
| FR-1 | **`leftHand: true` changed the stiffness.** `compute_local_axes_3d` reverses $e_y$, so the member triad becomes improper. The kernels assume the right-hand kinematics $\theta_z=v'$, $\theta_y=-w'$, so in $T^{\mathsf T}kT$ the $v$–$\theta_z$ and $w$–$\theta_y$ coupling terms change sign. The result depended on how an axis was labelled: on a skew two-member cantilever the tip twist changed sign and the deflection moved 2%. No product path sends `leftHand: true` (the web applies a user's left-handed convention to load entry only and sends `false`). The engine now refuses it in `validate_input_3d`. A correct left-handed mode would keep a right-handed triad for $k$ and flip only the signs of local-y input and output. | FIXED (refused) | `derivation_frames.rs::left_handed_axes_are_refused` |
| FR-2 | **Declared sign convention contradicted the values.** The beam-station output (`postprocess/beam_stations.rs`, consumed by reports and AI) declared 2D "moment positive = sagging" and 3D "moment_z positive = sagging in x-y plane". The values are hogging-positive in 2D and tension-on-$+y$ in 3D (§7.1). The torsion string ("right-hand rule about local x") did not say which face. The strings now state the actual convention. Values are unchanged. | FIXED (metadata) | `derivation_frames.rs::beam_station_sign_convention_matches_values`, `moment_and_shear_signs_2d_and_3d`, `torsion_sign_is_negative_face_resultant` |
| FR-3 | **Shear-area naming differs between 2D and 3D.** The 3D `as_y` goes with `iy` (shear along local z), but the 2D `as_y` goes with `iz` (shear along local y). The pairing is consistent between stiffness, loads and recovery, and the web follows it. But the old field comment ("shear area for Y-bending") invited the common reading "area for a force along y", which would swap the shear areas of an I-section, a ~2× error in shear flexibility. The field docs in `types/input.rs` now spell out the pairing. Should the JSON names change (e.g. `asForIy`)? | OPEN (naming; docs fixed) | n/a (convention; covered by `symbolic_elements.rs` φ pairing) |
| FR-4 | **Thermal $\alpha$ and depth are constants in the engine.** Frames and trusses use $\alpha = 12\times10^{-6}$ and $h=\sqrt{12I/A}$. The web rescales the temperatures to compensate (§7.4), but a direct JSON/API user loading a concrete ($\alpha\approx10^{-5}$) or aluminium ($2.3\times10^{-5}$) member, or an I-section gradient, gets wrong thermal forces without any warning. Shells accept an optional `alpha`. Should frames take `alpha` and `depthY/Z` the same way? | OPEN | n/a (behaviour documented, §7.4) |
| FR-5 | **Warping DOF continuity at joints.** $\theta_x'$ is one nodal DOF shared by every warping member at a node, which assumes full warping transmission. That is correct for collinear continuous members. At a column–beam joint or a change of section, the real transmission depends on the detail (stiffeners, end plates). There is no per-member warping release. | OPEN (modelling assumption) | n/a |
| FR-6 | **The bimoment recovery was never checked.** Before this work no test compared the recovered element bimoment with a closed form. It now converges to Vlasov's $(T/k)\tanh kL$ (4 elements: 1e-3; 16 elements: 1e-5), and the support reaction balances it. | VERIFIED (gap closed) | `derivation_frames.rs::warping_bimoment_matches_vlasov` |
| FR-7 | **2D rotation is about $-Y$.** The 2D θ and the 2D nodal `my` are right-hand about $-Y$ in the global XZ embedding, while the 3D $\theta_Y$/`my` are about $+Y$. This is consistent inside 2D, and the engine's 2D and 3D paths agree when the mapping negates it (`derivation_assembly_constraints.rs::plane_2d_matches_3d_xz_embedding`). But the web's flat-2D-to-3D embedding passes nodal moments and prescribed rotations through **without** negating them ([AC-15](assembly-constraints.md)), so from the code, a flat model solved through the 3D path responds to a nodal moment in the opposite sense. | DOCUMENTED-CHOICE (engine); web: OPEN, AC-15 | `plane_2d_matches_3d_xz_embedding` |
| FR-8 | **Documented formulation choices** (from [SYMBOLIC.md](../verification/SYMBOLIC.md)): $K_g$ ignores shear flexibility and the torsional $P\,I_p/A$ term; released rotations in $K_g$ follow the Euler–Bernoulli map; consistent mass has no rotary inertia. Their quantitative impact is in [mass-geometric-dynamics.md](mass-geometric-dynamics.md). | DOCUMENTED-CHOICE | `symbolic_elements.rs` |
