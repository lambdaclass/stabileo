# Special line elements: cables, curved beams, connectors, fiber beam-columns

This file covers the line elements that are not the straight elastic frame or truss:

- **cables** (Ernst equivalent-modulus bars, tension-only iteration) and the catenary helpers;
- **curved beams** (a circular arc through three nodes, expanded into straight frame members);
- **connectors** (two-node spring elements, zero-length or with length);
- **fiber beam-columns** (distributed-plasticity frame members with fiber sections).

Conventions (global Z-up frame, local axes, DOF order, rotation signs, sign of reported forces)
are those of [frames.md](frames.md) §2 and §7 and are not repeated. Supports, support springs and
the way element matrices are scattered are in [assembly-constraints.md](assembly-constraints.md)
(§3, §4.3). The global Newton loops of the fiber solver are in [nonlinear.md](nonlinear.md); only
what the element needs is described here.

None of these elements has a symbolic (SymPy) derivation. The checks are the tests listed in §6
and in the open-questions table.

| Topic | Source |
|---|---|
| Cable formulas | `engine/src/element/cable.rs`: `catenary_ordinate`, `parabolic_ordinate`, `cable_sag`, `cable_thrust`, `cable_length_parabolic`, `cable_length_catenary`, `ernst_equivalent_modulus`, `ernst_tangent_modulus`, `cable_global_stiffness_2d/3d`, `cable_self_weight`, `cable_end_tensions`, `cable_natural_frequency`, `irvine_parameter` |
| Cable solver | `engine/src/solver/cable.rs`: `solve_cable_2d`, `solve_cable_3d`, `ernst_factor`, `ernst_diff(_2d/_3d)`, `horizontal_projection_2d/3d` |
| Curved beam | `engine/src/element/curved_beam.rs`: `expand_curved_beam`, `check_curved_beam_sizes`, `fix_arc_direction`, `intersect_lines`; `engine/src/solver/linear.rs`: `expand_curved_beams_3d` |
| Connector | `engine/src/element/connector.rs`: `connector_stiffness_2d/3d`, `connector_element_2d/3d`, `restrict`, `validate_connectors`, `corotational_connectors_2d/3d`, `refuse_for_corotational_2d/3d` |
| Fiber element | `engine/src/element/fiber_beam.rs`: `material_response`, `steel_bilinear_response`, `concrete_hognestad_response`, `section_response_2d/3d`, `gauss_lobatto_points`, `b_matrix_2d/3d`, `fiber_element_response_2d/3d`, `rectangular_fiber_section`, `wide_flange_fiber_section` |
| Fiber solver (element side) | `engine/src/solver/fiber_nonlinear.rs`: `assemble_fiber_elements(_3d)`, `assemble_elastic_elements(_3d)`, `fiber_member_forces_2d/3d` |

---

## 1. Cables

### 1.1 What a "cable" is in each solver

A member with `elem_type = "cable"` uses the node, material and section data of a truss.

| Path | Behaviour |
|---|---|
| Linear, modal, P-Δ, … (`assembly.rs`, `sparse_assembly.rs`, `mass_matrix.rs`) | A plain truss bar, $k = EA/L$. Compression is carried and **not reported** ([SP-14](#discrepancies-and-open-questions-for-review)). |
| Fiber solver (`assemble_elastic_elements(_3d)`) | Truss bar, linear. |
| Cable solver (`solve_cable_2d/3d`) | Truss bar following the elastic-catenary chord law, Newton iteration with Ernst's modulus as the tangent (§1.3). |

There is no geometric (string) stiffness, no large-displacement equilibrium and no prestress or
unstressed-length input. The **unstressed length is the chord length between the nodes as
modelled**: $L_0 = \lVert x_j - x_i\rVert$ (`CableGeom.l0`, reported as
`unstretched_length`). A weightless cable modelled straight is therefore stress-free in that
geometry. A cable with weight cannot be: a cable exactly as long as its chord must stretch to sag,
so with no load it hangs at the tension $T_0$ with $T_0^3 = EA\,(w l_h)^2/24$ (§1.3), and the
supports take $T_0$ as a pull along the chord. A straight cable loaded transversally has no
transverse stiffness: the solve reports a mechanism.
Cable nets must be modelled in (approximately) their loaded shape and triangulated.

### 1.2 Element stiffness

$$
k = \frac{E_\text{eq}A}{L_0}\begin{bmatrix} d d^{\mathsf T} & -d d^{\mathsf T}\\ -d d^{\mathsf T} & d d^{\mathsf T}\end{bmatrix},\qquad d = \frac{x_j-x_i}{L_0},
$$

(`cable_global_stiffness_2d/3d`; rank 1, kernel of dimension 3 in 2D and 5 in 3D, checked in
`element_rigid_body_modes.rs::truss_2d/3d_rigid_modes_and_kernel`). The solver itself does not
call these functions: it assembles the full-$E$ truss and adds the correction
$(E_\text{eq}/E - 1)\,EA/L_0$ on the same $dd^{\mathsf T}$ pattern (`ernst_diff`), in the
dense and sparse paths alike.

**Ernst's modulus** (`ernst_equivalent_modulus`, `ernst_factor`):

$$
\frac{E_\text{eq}}{E} = \frac{1}{1+\alpha},\qquad \alpha = \frac{(w\,l_h)^2\,EA}{12\,T^3},
$$

with $w = \rho A g$ the weight per unit **cable** length (`cable_self_weight`,
$\rho$ in t/m³ from the `densities` map in kg/m³, $g = 9.80665$), $l_h$ the horizontal
projection of the chord ($|\Delta X|$ in 2D, $\sqrt{\Delta X^2+\Delta Y^2}$ in 3D, floored at
1e-10) and $T$ the current tension. This is Gimsing's inclined-cable form
$E/(1+(\gamma l_h)^2E/(12\sigma^3))$ with $\gamma = w/A$.

Derivation, and what it means. For a shallow cable of unstressed length $S_0$, the chord length
is $l_c = S_0(1+T/EA) - \dfrac{(w l_h)^2 l}{24\,T^2}$ (elastic stretch minus the length taken
up by the sag). Hence the **tangent** chord compliance is

$$
\frac{d l_c}{dT} = \frac{l}{EA} + \frac{(w l_h)^2 l}{12\,T^3}
\quad\Longrightarrow\quad \frac{dT}{d\varepsilon_c} = \frac{EA}{1+\alpha}.
$$

So Ernst's $E_\text{eq}$ is the tangent modulus of the chord at tension $T$; it is the right
stiffness for increments about a known tensioned state.

### 1.3 Cable solver iteration

The cable's force law is the elastic-catenary **chord law** with the unstressed length equal to
the modelled chord (§1.1, §1.2):

$$
\varepsilon = \frac{T}{EA} - \frac{(w l_h)^2}{24\,T^2},
\qquad \varepsilon = \frac{\lVert x_j + u_j - x_i - u_i\rVert - L_0}{L_0},
$$

solved for $T$ by `element::cable_chord_tension` (the cubic $T^3 - EA\varepsilon T^2 - EA(wl_h)^2/24
= 0$ has exactly one positive root for every $\varepsilon$; safeguarded Newton). Without weight it
is $T = \max(EA\varepsilon, 0)$; with weight $T>0$ always (a shortened chord sags, it does not go
slack). Its derivative $dT/d\varepsilon = EA/(1+\alpha(T)) = E_\text{eq}A$ is Ernst's modulus.

`solve_cable_2d/3d` run Newton on it (counter $k = 0,1,\dots$), from the undeformed chord
($u=0$, $\varepsilon=0$, $T^{(0)} = T(0)$):

1. Assemble $K^{(k)} = K_\text{base} + \sum_c (\phi_c^{(k)} - 1)\,\dfrac{EA}{L_0} \begin{bmatrix} dd^{\mathsf T} & -dd^{\mathsf T}\\ -dd^{\mathsf T} & dd^{\mathsf T}\end{bmatrix}$
   with the tangent factor $\phi_c^{(k)}$ = `ernst_factor`$(w,l_h,EA,T_c^{(k)},k)$:
   - $\phi = 1/(1+\alpha(T))$ if $T > 0$ and $w>0$;
   - $\phi = 0$ (slack: stiffness removed) if $T \le 0$ and $k>0$;
   - $\phi = 1$ otherwise (first pass, or no weight).
2. Solve the **linear** system $K^{(k)}u = f + \sum_c \big[c\,(T_c^{(k)} - EA\,\varepsilon^{(k)}_{c,\text{lin}})\big]_\text{rot} + \sum_c (\phi_c-1)\tfrac{EA}{L_0}\,c\,(c\cdot u^{(k)})$,
   with $c = (d, -d)$ on the cable's DOFs and $\varepsilon_\text{lin} = d\cdot(u_j-u_i)/L_0$. The
   two terms are the offset of the linearisation $T \approx T^{(k)} + \phi EA(\varepsilon - \varepsilon^{(k)})$
   written against what the matrix actually produces (the base truss and the correction block,
   both with $c$ rotated at inclined supports the way the assembly rotates K and f), so at the
   fixed point every cable pulls on its nodes with $T(\varepsilon)$ exactly, whatever the
   tangent. (The correction block used to be added unrotated at inclined supports.)
3. New tension from the deformed chord, large-displacement length but small-displacement
   equilibrium: $T^{(k+1)} = $ `cable_chord_tension`$(\varepsilon)$.
4. Stop when $k>0$, no slack cable took tension again this pass, and for every cable both
   $|T^{(k+1)}-T^{(k)}|$ and the chord-law residual $|T^{(k+1)} - T_\text{sys}|$ (with
   $T_\text{sys} = T^{(k)} + \phi EA(\varepsilon_\text{lin}^{(k+1)} - \varepsilon_\text{lin}^{(k)})$, the
   force the solved system gave the cable) are at most `tolerance` times the largest cable tension.

Reported results: displacements from the last solve, the member axial force and `tension` = $T$,
reactions from $K_\text{base}$ with each cable's force replaced by its tension
($-c\,(T - EA\varepsilon_\text{lin})$ at the restrained DOFs, rotated like the loads), so they
balance the reported tensions (`cable_statics.rs`); constraint forces use the same correction. `horizontal_thrust` $= T\,l_h/L_0$, `sag` $=
w l_h^2/(8H)$ (parabolic, informative only: the chord geometry is not changed), `ernst_modulus` $=
\phi E$, the tangent of the last solve.

Two properties a reviewer should know:

- **The cable's weight is not a load** (SP-13, pinned). Density only enters the chord law. The
  user must apply the self-weight (or its nodal resultant) as a load.
- **Tension follows the chord law** (SP-12, fixed). The solver used to recover the tension as
  $T = \phi(T)EA\varepsilon$, i.e. $T(1+\alpha(T)) = EA\varepsilon$ or
  $\varepsilon = T/EA + (wl_h)^2/(12T^2)$: Ernst's tangent used as a secant from a stress-free
  chord. Sag takes up chord length, so a given chord strain needs *more* tension than
  $EA\varepsilon$, not less; in statically indeterminate systems the cable got too little tension
  (9.39 kN instead of 9.59 kN in `cable_tension_follows_the_elastic_catenary_chord_law`). In
  statically determinate systems equilibrium fixes $T$ and only the displacements change. There
  is still no unstressed-length or pretension input: the chord as modelled is the unstressed
  length.

### 1.4 Closed-form helpers (not used by the solvers)

| Function | Formula | Status |
|---|---|---|
| `catenary_ordinate(H,w,L,h,x)` | $y = a\cosh\frac{x-x_0}{a} - a\cosh\frac{x_0}{a}$, $a = H/w$, $x_0$ from $y(L)=h$ by Newton | correct; $y<0$ below the chord (sag down) |
| `parabolic_ordinate` | $y = hx/L + 4fx(L-x)/L^2$, $f = wL^2/(8H)$ | sag drawn **above** the chord: mirror of the catenary (SP-10) |
| `cable_length_catenary` | $S = a[\sinh\frac{L-x_0}{a} + \sinh\frac{x_0}{a}]$ | correct ($S^2 = h^2 + (2a\sinh\frac{L}{2a})^2$) |
| `cable_length_parabolic` | $S \approx L(1+\frac83 r^2 - \frac{32}{5}r^4)$, $r = f/L$ | standard series |
| `cable_end_tensions` | $T = H\sqrt{1+y'^2}$ | correct |
| `cable_natural_frequency` | $f_n = \frac{n}{2L}\sqrt{T/(\rho A)}$ (taut string) | correct for a taut string, ignores sag |
| `irvine_parameter` | $\lambda^2 = (wL/H)^2\,L/(HL_e/EA)$, $L_e = L(1+8(f/L)^2)$ | had an extra factor $L$ (SP-9, fixed) |
| `ernst_tangent_modulus` | $E/(1+\alpha)$ = `ernst_equivalent_modulus` | the derivative of the chord law; it returned $E(1+\alpha(1-\frac{3\alpha}{1+\alpha}))/(1+\alpha)^2$ (SP-11, fixed) |

---

## 2. Curved beams

### 2.1 Formulation: polygonal expansion

There is **no curved-beam element**. A `CurvedBeamInput` (start, mid, end node; material;
section; `num_segments` $N$, default 10, at most 1000 per beam and 200 000 per model; end hinges)
is replaced by $N$ straight 3D frame members before any static, nonlinear or dynamic solve
(`expand_curved_beams_3d`, called by the linear, P-Δ, corotational, SSI, Winkler, contact,
time-integration and fiber paths: `curved_beam_all_solvers_gate.rs`). The members are ordinary
Euler–Bernoulli/Timoshenko frames ([frames.md](frames.md) §4), so the curved beam inherits their
stiffness, mass, geometric stiffness, rigid-body modes and force recovery. 2D models have no
curved beams.

Geometry (`expand_curved_beam`):

1. $n = (p_m - p_s)\times(p_e-p_s)$; if $\lVert n\rVert < 10^{-14}$ the points are collinear and
   the beam is split into $N$ equal straight segments.
2. The centre $c$ is the intersection of the in-plane perpendicular bisectors of $p_sp_m$ and
   $p_sp_e$ (2×2 solve on the best-conditioned pair of rows), $R = \lVert p_s - c\rVert$.
3. In-plane basis $u = (p_s-c)/R$, $v = \hat n\times u$; end and mid angles by `atan2`.
   Because $\hat n$ is built from the triangle $(p_s,p_m,p_e)$, the traversal start → mid → end
   is counter-clockwise about $\hat n$, so $0<\theta_m<\theta_e\le 2\pi$; `fix_arc_direction`
   handles the remaining wrap-around.
4. Nodes $x_i = c + R(\cos\theta_i\,u + \sin\theta_i\,v)$, $\theta_i = i\,\theta_e/N$,
   $i = 1..N-1$: equal angles, all on the circle (`curved_beam_nodes_on_circle_through_mid_point`).
5. The generated node closest to $p_m$ is **renamed** to the mid node's id, so loads and supports
   on the mid node act on the chain. The mid node keeps its own coordinates, so when $p_m$ is not
   at a subdivision angle, that vertex moves along the arc to $p_m$ (still on the circle,
   unequal segments). With $N = 1$ there is no intermediate node and the mid node is not
   connected.

Members: `elem_type = "frame"`, `hinge_start` releases **both** bending rotations ($M_y$ and
$M_z$, not torsion) at the first segment's start, `hinge_end` at the last segment's end. No
local-axis input is passed (`local_y*`, `roll_angle` = None): every segment uses the default
axes of [frames.md](frames.md) §2.3. Member loads cannot target a curved beam (it has no element
id before expansion); only nodal loads and self-weight style loads on the generated members.

### 2.2 Accuracy and limits

- **Convergence.** The inscribed polygon has chord error $R(1-\cos\frac{\theta_e}{2N}) =
  O(R\theta_e^2/N^2)$, and the displacement error of a bending-dominated arc decreases as
  $1/N^2$. Quarter-circle cantilever, tip load $P$ (Castigliano, bending only):
  $\delta_z = \pi PR^3/(4EI)$, $\delta_x = PR^3/(2EI)$; the computed error ratio per doubling of
  $N$ is ≈ 4 (`curved_beam_quarter_circle_converges_to_castigliano`).
- **Curvature → 0** reproduces the straight frame exactly (collinear fallback,
  `curved_beam_collinear_falls_back_to_straight`). For a nearly straight arc the centre is far
  away and its round-off is $\sim R\epsilon$, harmless.
- **No curvature coupling inside a segment.** Curved-beam effects (axial–bending coupling through
  $1/R$, the Winkler–Bach stress distribution of thick curved bars with $h/R$ not small) are
  represented only through the polygon. For $h/R \gtrsim 0.1$ the straight-member section
  stresses are not the curved-bar stresses.
- **Local axes along the arc** (SP-15, fixed in #418). The default rule switches reference for a
  segment within 2.56° of vertical ($|e_x\cdot Z|>0.999$). For an arch in the X–Z plane both
  references keep local $z$ in the arch plane; for an arch in any other vertical plane the
  near-vertical segments got local $z$ normal to the plane, so $I_y$ and $I_z$ swapped on them (a
  semicircle with $N = 40$ in the Y–Z plane gave a crown deflection 15 % lower than the same arch
  in the X–Z plane). Every segment now takes $\hat y = a\,\hat n + b\,(\hat n\times e_x)$, with
  $\hat n$ the arc's plane normal and $(a, b)$ those of the default rule on the arc's tangent at
  the middle of its sweep (`ArcSectionFrame`): the section does not roll along the arc, a plan
  curve keeps local $z$ vertical as before, and an arch keeps local $y = \hat n$ on every segment.
  Results are invariant under rotating the model about the vertical
  (`curved_beam_arch_results_are_invariant_under_rotation_about_vertical`).

---

## 3. Connectors

### 3.1 Formulation

A connector is a set of independent linear springs between two nodes. Each spring is a
compatibility row $b$ (its deformation as a linear function of the 2×3 or 2×6 end DOFs) and
contributes $k\,b\,b^{\mathsf T}$:

$$
K = \sum_s k_s\, b_s b_s^{\mathsf T},
$$

so $K$ is symmetric and positive semi-definite by construction (`add_spring`). Stiffness only:
no mass, no damping (despite the "dashpot" in the doc comment), no gap, hook or nonlinearity.

**2D**, $[u_{x}, u_{z}, \theta]$ per node, chord direction $(c,s)$, length $L$, shear point at
$a = $ `CONNECTOR_SHEAR_POSITION` $=1/2$:

$$
b_\text{axial} = [-c,-s,0,\;c,s,0],\quad
b_\text{shear} = [s,-c,-aL,\;-s,c,-(1-a)L],\quad
b_\text{moment} = [0,0,-1,\;0,0,1].
$$

**3D**, local triad $(e_x,e_y,e_z)$, $\bar\theta = a\theta_i + (1-a)\theta_j$:

$$
\delta_\text{ax} = e_x\cdot(u_j-u_i),\quad
\delta_{y} = e_y\cdot(u_j-u_i) - L\,e_z\cdot\bar\theta,\quad
\delta_{z} = e_z\cdot(u_j-u_i) + L\,e_y\cdot\bar\theta,\quad
\phi_e = e\cdot(\theta_j-\theta_i)\ (e = e_x,e_y,e_z).
$$

The shear springs act at the midpoint, reached from each node by a **rigid arm** along the axis.
So a rigid rotation (node $j$ moving by $\theta\times L e_x$ and both ends turning by $\theta$)
produces no shear deformation, and a shear force $V$ carries its moment $V L$ to the end nodes,
split equally. All six rigid-body modes are in the kernel and the rank equals the number of
positive springs (3 in 2D, 6 in 3D). At $L = 0$ the arms vanish and
$K = [K_{ii}, -K_{ii}; -K_{ii}, K_{ii}]$. The element does not depend on which node is $i$
(midpoint shear position).

These are the rigid-offset (eccentricity) transformations $T^{\mathsf T}K_\text{spring}T$ with
$T$ the rigid-arm matrix; there are no other offsets or rigid links in the connector itself
(rigid links and eccentric connections are constraints: [assembly-constraints.md](assembly-constraints.md) §6).

### 3.2 Local axes

- Chord $L > 10^{-15}$: $e_x$ along the chord. Otherwise (zero length) $e_x = X$ in 3D and
  $(c,s) = (1,0)$ in 2D.
- 3D transverse axes come from the connector's **own** rule, not the frame rule: reference
  $r = X$ if $|e_{x,X}| < 0.9$, else $r = Y$; $e_y = r\times e_x/\lVert\cdot\rVert$,
  $e_z = e_x\times e_y$. There is no `local_y` or roll input.
  - Zero-length connector: $e_y = -Z$, $e_z = +Y$. So `k_shear` (documented as "local Y") acts
    along global **Z**, `k_shear_z` along global Y, `k_bend_y` about Z, `k_bend_z` about Y
    (SP-16, pinned by `connector_zero_length_3d_axis_mapping`). In 2D the shear spring of a
    zero-length connector is along global Z, consistent with the 3D `k_shear`.
  - The triad jumps where the reference switches ($|e_{x,X}| = 0.9$) for directions with a Z
    component (SP-17, open): with $k_\text{shear}\ne k_{\text{shear},z}$ or
    $k_{\text{bend},y}\ne k_{\text{bend},z}$ two nearly parallel connectors get very different
    stiffness. Isotropic transverse springs are unaffected.

### 3.3 Assembly, validation, nonlinear use

- The matrix is built for 3 (2D) / 6 (3D) DOFs per node and restricted to the DOFs the model
  numbers (`restrict`): rotations are dropped in an all-truss model, warping DOFs receive nothing.
- `validate_connectors` refuses missing nodes, non-finite stiffness, and a finite-length
  connector with shear springs in a model with no rotation DOFs (its $VL$ moment would be lost).
- Large displacements (`corotational_connectors_2d/3d`): zero-length connectors stay linear in
  global axes; a finite connector's axial spring follows the chord,
  $N = k(L-L_0)$, with tangent $k\,rr^{\mathsf T} + \frac{N}{L}(I-rr^{\mathsf T})$; the 2D
  rotational spring acts on the relative rotation. Shear springs with length (2D and 3D) and
  rotational springs with length (3D) are refused by name.
- Fiber and material-nonlinear solvers add the linear connector matrix ($f = Ku$).

Prior findings, fixed before this document (`connector_k_findings.rs`): the finite-length
connector had no shear–moment coupling and violated moment equilibrium (FINDING 1); connectors
were scattered with a hard-coded 3/6-DOF layout and landed on the wrong DOFs in all-truss and
warping models (FINDING 2).

---

## 4. Fiber beam-column element

### 4.1 Assumptions

- **Displacement-based** element (not the force-based element of Spacone, Filippou & Taucer,
  although the header cites them): linear axial and cubic Hermite transverse interpolation, the
  same shape functions as the elastic frame ([frames.md](frames.md) §4.2).
- Euler–Bernoulli: plane sections normal to the axis, no shear deformation (models with
  `as_y/as_z` are refused), no warping (refused in 3D), no moment releases (refused).
- Small displacements and strains: no geometric stiffness, no P-Δ in the element.
- Uniaxial fiber stress only; shear and torsion do not interact with the fibers. Torsion is
  elastic, $GJ/L$ with $G = E/(2(1+\nu))$ from the **SolverMaterial** and $J$ from the
  SolverSection.
- Material units MPa, converted to kN/m² by a hard-coded factor 1000 (`section_response_*`).

### 4.2 Kinematics and section response

Section deformations at station $x$ ($\xi = x/L$), with the local DOFs of
[frames.md](frames.md) §2.4:

$$
\varepsilon_0 = u' = \frac{u_2-u_1}{L},\qquad
\kappa^{2D} = -v'',\quad \kappa_z^{\text{code}} = +v'',\qquad \kappa_y = \theta_y' = -w'',
$$

$$
v'' = \frac{12\xi-6}{L^2}v_1 + \frac{6\xi-4}{L}\theta_{z1} + \frac{6-12\xi}{L^2}v_2 + \frac{6\xi-2}{L}\theta_{z2},
\qquad w'' \text{ the same with } \theta \to -\theta_y .
$$

Fiber strain, with $(y,z)$ the fiber coordinates along local $y$ and $z$ from the reference axis
(the member axis between the nodes; it need not be the centroid):

$$
\text{2D: } \varepsilon = \varepsilon_0 + \kappa\,y = u' - y\,v'',\qquad
\text{3D: } \varepsilon = \varepsilon_0 + \kappa_y z - \kappa_z^{\text{code}} y = u' - y\,v'' - z\,w'' ,
$$

where in 3D the code's third deformation is $\kappa_z^{\text{code}} = +v''$ (the 2D $\kappa$ and
the 3D $\kappa_y$ carry the minus sign inside the deformation instead). This is the frame
kinematics of [frames.md](frames.md) §2.4. Before SP-1/SP-2 the 2D bending row and the 3D
$\kappa_y$ row had the opposite sign, which mirrored the strain field (§7).

Section resultants and tangent (midpoint rule over the fibers, $E_t$ the fiber tangent):

$$
\text{2D: } \begin{bmatrix}N\\M\end{bmatrix} = \sum_i \sigma_i A_i\begin{bmatrix}1\\y_i\end{bmatrix},\quad
D = \sum_i E_{t,i}A_i\begin{bmatrix}1 & y_i\\ y_i & y_i^2\end{bmatrix};
$$

$$
\text{3D: } [N, M_y, M_z] = \sum_i\sigma_iA_i[1, z_i, -y_i],\quad
D = \sum_i E_{t,i}A_i\begin{bmatrix}1 & z_i & -y_i\\ z_i & z_i^2 & -y_iz_i\\ -y_i & -y_iz_i & y_i^2\end{bmatrix}.
$$

$D$ is the exact derivative of the resultants with respect to $(\varepsilon_0,\kappa_y,\kappa_z^{\text{code}})$,
so $D$ is symmetric and consistent with the resultants.

### 4.3 Element state determination

$$
q = \sum_{p=1}^{n} w_p\,B(x_p)^{\mathsf T}s(x_p),\qquad
k_t = \sum_{p=1}^{n} w_p\,B(x_p)^{\mathsf T}D(x_p)\,B(x_p)\ \ (+\ GJ/L \text{ on } \theta_x \text{ in 3D}),
$$

with Gauss–Lobatto points on $[0,L]$ (end sections included), $n = 3\ldots7$
(`gauss_lobatto_points`; an $n$-point rule is exact to degree $2n-3$). Globally
$K = T^{\mathsf T}k_tT$, $f_\text{int} = T^{\mathsf T}q$ ([frames.md](frames.md) §2.2–2.3).

- **Linear range.** For an elastic section $B^{\mathsf T}DB$ is quadratic in $x$ (B linear),
  so $n\ge3$ integrates it exactly and the element equals the frame stiffness with
  $EA = \sum EA_i$, $EI = \sum EA_iy_i^2$ (`fiber_2d/3d_elastic_matches_frame_stiffness`).
  $n = 2$ (trapezoidal) does not, which is why it is refused (SP-5). The fiber discretization
  error itself is that of the midpoint rule: $\sum A_iy_i^2 = bh^3/12\,(1 - 1/n_\text{layers}^2)$
  for a rectangle in equal layers.
- **Displacement-based limits.** $\varepsilon_0$ is constant and $\kappa$ linear per element.
  When the section's neutral axis moves (yielding, cracking, eccentric sections) the element
  enforces axial equilibrium only weakly and is too stiff; distributed plasticity needs several
  elements per member in a yielding region. The answer is exact only for constant
  curvature with constant axial force.
- **History.** Each iteration evaluates the fibers from the state at the start of the load
  increment; the state of the converged iterate is kept (SP-6). Before, the history was updated
  in place at every trial iterate.

### 4.4 Material laws (`material_response`)

**Bilinear steel, kinematic hardening** ($E$, $f_y$, $\alpha$ = post-yield slope / $E$):
plastic modulus $H = \alpha E/(1-\alpha)$; trial $\xi = E(\varepsilon-\varepsilon_p) - q$
($q$ the back stress); if $|\xi|>f_y$: $\Delta\varepsilon_p = (|\xi|-f_y)/(E+H)$,
$\varepsilon_p \mathrel{+}= \operatorname{sgn}\xi\,\Delta\varepsilon_p$,
$q \mathrel{+}= \operatorname{sgn}\xi\,H\Delta\varepsilon_p$; $\sigma = E(\varepsilon-\varepsilon_p)$,
$E_t = EH/(E+H) = \alpha E$. Exact return mapping for linear hardening; monotonic loading follows
$\sigma = f_y + \alpha E(\varepsilon-\varepsilon_y)$. $\alpha\ge1$ is treated as elastic. Before
SP-3, $H = \alpha E$ gave a post-yield slope $\alpha E/(1+\alpha)$.

**Hognestad concrete** (compression negative; $f_c$, $\varepsilon_{c0}$, $\varepsilon_{cu}$, $f_t$):

$$
\sigma = \begin{cases}
-f_c\,[2r - r^2],\ r = |\varepsilon|/\varepsilon_{c0} & -\varepsilon_{c0}\le\varepsilon\le0\\
-f_c\,[1 - (|\varepsilon|-\varepsilon_{c0})/(\varepsilon_{cu}-\varepsilon_{c0})] & -\varepsilon_{cu}<\varepsilon<-\varepsilon_{c0}\\
0 \ (E_t = 10^{-6}) & \varepsilon\le-\varepsilon_{cu}\ (\text{crushed})\\
E_c\varepsilon,\ E_c = 2f_c/\varepsilon_{c0} & 0<\varepsilon\le f_t/E_c,\ \text{never cracked}\\
0 \ (E_t = 10^{-6}) & \text{otherwise (cracked, permanent)}
\end{cases}
$$

The descending branch keeps the reported tangent negative (so $k_t$ can be indefinite). In
compression the law is **nonlinear elastic**: no unloading branch and crushing is not
remembered; only cracking is (SP-8, pinned). No tension stiffening, no confinement model.

**Elastic**: $\sigma = E\varepsilon$.

### 4.5 Force recovery and what the solver reports

`fiber_member_forces_2d/3d` replace the elastic $K u$ part of the linear recovery with the element
resisting forces $q$ at the converged state, keeping the fixed-end forces of member loads and the
sign mapping of [frames.md](frames.md) §7.1 ($N_s = -q_{u_1}$, $V_s = q_{v_1}$, $M_s = q_{\theta_1}$, …).
Before SP-7 the reported member forces were $K_\text{elastic}u$ with the SolverSection's $A$, $I$,
so a yielded member reported forces that violated statics by orders of magnitude. The fiber solver
still returns no reactions (SP-18) and `fiber_status` (max |strain|, max |stress|, a yielded/cracked
flag per element). Section stresses are not reported per fiber.

### 4.6 Members without a fiber section

Frames without a fiber section in a fiber analysis are linear elastic frames, trusses and cables
are linear bars (`assemble_elastic_elements(_3d)`), connectors and support springs are linear
(`add_springs(_3d)`).

---

## 5. Nodal springs

Nodal springs and elastic supports are support data, not elements: `support_spring_entries_2d/3d`
in `assembly.rs`, documented in [assembly-constraints.md](assembly-constraints.md) §4.3. A spring
between two nodes is a zero-length connector (§3).

---

## 6. Verification map

| Claim | Test |
|---|---|
| Cable stiffness rank and rigid modes | `element_rigid_body_modes.rs::truss_2d_rigid_modes_and_kernel`, `truss_3d_rigid_modes_and_kernel` |
| Cable solver: statics tension, Ernst modulus carried to reactions, slackness and re-activation | `cable_statics.rs` (4 tests) |
| Cable weight not a load | `derivation_special_elements.rs::cable_density_is_not_a_load` |
| Catenary ordinate and length | `catenary_ordinate_and_length`; validation `cable_analysis_advanced_extended.rs` |
| Irvine λ² dimensionless | `irvine_parameter_is_dimensionless` |
| Curved beam: geometry on the circle, collinear fallback, 1/N² convergence | `curved_beam_nodes_on_circle_through_mid_point`, `curved_beam_collinear_falls_back_to_straight`, `curved_beam_quarter_circle_converges_to_castigliano` |
| Curved beam expanded in every solver and with constraints | `curved_beam_all_solvers_gate.rs` (8), `curved_beam_constrained_gate.rs` |
| Connector symmetry, rigid modes and rank (zero and finite length), node-order independence | `element_rigid_body_modes.rs::connector_zero_length_rigid_modes_and_kernel`, `connector_finite_length_rigid_modes_and_kernel`; inline tests in `connector.rs` |
| Connector equilibrium, analytic cantilevers 2D/3D, rotation invariance, DOF layouts | `connector_k_findings.rs` (11) |
| Connector 3D axis mapping | `connector_zero_length_3d_axis_mapping` |
| Fiber: elastic section = frame stiffness (2D, 3D) | `fiber_2d_elastic_matches_frame_stiffness`, `fiber_3d_elastic_matches_frame_stiffness`; validation `fiber_nonlinear.rs::fiber_elastic_section_matches_linear_solver`, `fiber_benchmark.rs::benchmark_fiber_3d_elastic_w_section` |
| Fiber kinematics signs (eccentric sections, hogging) | `fiber_2d/3d_eccentric_*`, `fiber_2d_hogging_puts_top_fibre_in_tension` |
| Lobatto rules exact to degree 2n−3; n outside 3..7 refused | `gauss_lobatto_rules_up_to_seven_points`, `two_point_lobatto_is_refused` |
| Steel law slope, unloading, path independence | `steel_bilinear_post_yield_slope_is_alpha_e`; inline `fiber_beam.rs` tests |
| Committed history, member forces from fibers | `fiber_state_is_committed_only_at_convergence`, `fiber_solver_element_forces_satisfy_statics_after_yield`, `fiber_solver_3d_element_forces_satisfy_statics_after_yield`; `derivation_nonlinear.rs::nl_fiber_*` |
| Yield moment, plastic moment, cracking, convergence, sparse/dense parity | validation `domains/solver/fiber_nonlinear.rs`, `benchmarks/fiber_benchmark.rs` |

Gaps: no test checks the fiber tangent against a finite difference of $q$ for an inelastic
state; no test for concrete under cyclic strain beyond SP-8; no test of the cable solver on an
inclined support (a known residual gap noted in `cable.rs`: the Ernst correction is added
unrotated at inclined-support DOFs); no test of curved beams with $N=1$ or with the mid node off
a subdivision angle; no mass or modal test specific to curved beams beyond the frame tests.

## References

- H. M. Irvine, *Cable Structures*, MIT Press, 1981 (elastic catenary, λ²).
- H. J. Ernst, "Der E-Modul von Seilen unter Berücksichtigung des Durchhanges", *Der Bauingenieur*
  40(2), 1965.
- N. J. Gimsing, C. T. Georgakis, *Cable Supported Bridges*, 3rd ed., Wiley, 2012, ch. 3.
- W. McGuire, R. H. Gallagher, R. D. Ziemian, *Matrix Structural Analysis*, 2nd ed., 2000
  (rigid offsets, frame elements).
- J. S. Przemieniecki, *Theory of Matrix Structural Analysis*, 1968.
- E. Spacone, F. C. Filippou, F. F. Taucer, "Fibre beam–column model for non-linear analysis of
  R/C frames", *Earthquake Eng. Struct. Dyn.* 25, 1996 (the force-based element this one is
  *not*; useful for the displacement-based limits).
- A. Neuenhofer, F. C. Filippou, "Evaluation of nonlinear frame finite-element models",
  *J. Struct. Eng.* 123(7), 1997 (displacement- vs force-based accuracy).
- J. C. Simo, T. J. R. Hughes, *Computational Inelasticity*, Springer, 1998 (return mapping,
  kinematic hardening).
- E. Hognestad, *A Study of Combined Bending and Axial Load in RC Members*, Univ. Illinois Bull.
  399, 1951.
- M. Abramowitz, I. Stegun, *Handbook of Mathematical Functions*, §25.4.32 (Lobatto quadrature).

## Discrepancies and open questions for review

All tests are in `engine/tests/derivation_special_elements.rs` unless stated.

| ID | Description | Status | Test |
|---|---|---|---|
| SP-1 | 3D fiber element: the $\kappa_y$ row of $B$ was $+w''$ (with $\theta_y=-w'$), so the fiber strain was $\varepsilon_0 + z w''$ instead of $\varepsilon_0 - z w''$. The strain field was mirrored in $z$: no effect on z-symmetric sections, wrong axial–bending coupling for any z-eccentric section (T-beams, asymmetric reinforcement, concrete under N+M). An eccentric two-fiber cantilever under tension bent away from its stiff side. Row negated. | FIXED | `fiber_3d_eccentric_z_section_end_moments`, `fiber_3d_eccentric_tension_cantilever_bends_toward_stiff_side` |
| SP-2 | 2D fiber element: same mirror in $y$ ($\kappa = +v''$ with $\varepsilon = \varepsilon_0+\kappa y$), inconsistent with the 3D element's $y$ and with [frames.md](frames.md) §2.4. A cantilever under a downward tip load had its top fibre in compression at the support. Row negated. Result-changing for any y-asymmetric 2D fiber section. | FIXED | `fiber_2d_eccentric_section_end_moment`, `fiber_2d_eccentric_tension_cantilever_bends_toward_stiff_side`, `fiber_2d_hogging_puts_top_fibre_in_tension` |
| SP-3 | Bilinear steel used plastic modulus $H=\alpha E$ although `hardening_ratio` is documented as $E_h/E$: post-yield slope $\alpha E/(1+\alpha)$ (1 % soft at α = 0.01, 9 % at 0.1). Now $H=\alpha E/(1-\alpha)$; α ≥ 1 is elastic. | FIXED | `steel_bilinear_post_yield_slope_is_alpha_e` |
| SP-4 | `gauss_lobatto_points` had rules for 2–5 points and silently returned 3 points for 6 and 7, which the solvers accept. 6- and 7-point rules added. | FIXED | `gauss_lobatto_rules_up_to_seven_points` |
| SP-5 | The solvers clamped `n_integration_points` into [2, 7]; 2 points integrate $B^{\mathsf T}DB$ (quadratic) with the trapezoidal rule, so even an elastic member had the wrong stiffness ($k_{\theta\theta}$ off by > 10 %). Values outside 3..7 are now refused by name. | FIXED | `two_point_lobatto_is_refused` |
| SP-6 | Fiber history (plastic strain, back stress, cracking) was updated in place at every Newton iterate, so an overshooting iterate left spurious plastic strain: a yielding cantilever gave 0.2 % different tip deflection with 1 and 50 increments. Each iteration now starts from the increment's committed state. | FIXED | `fiber_state_is_committed_only_at_convergence`; also `derivation_nonlinear.rs::nl_fiber_one_increment_matches_many` |
| SP-7 | Fiber solvers reported member forces as $K_\text{elastic}u$ with the SolverSection's $A,I$, not the fiber resultants: support moment 145 361 kN·m reported for a statical 5 400 kN·m (2D), −176 for 1 800 (3D). Now from the element resisting forces. The elastic $K u$ removed is the one the linear recovery added, with the same Timoshenko $\phi$ (shared `timoshenko_phi_2d/3d`). It was the Euler–Bernoulli $K$, which left $(K_T-K_{EB})u$ in the result for a section with shear areas (review of #330). The fiber solvers refuse shear areas today, so this is checked on the helper directly. | FIXED | `fiber_solver_element_forces_satisfy_statics_after_yield`, `fiber_solver_3d_element_forces_satisfy_statics_after_yield`; `derivation_nonlinear.rs::nl_fiber_member_forces_are_section_resultants`; `fiber_nonlinear.rs::fiber_member_forces_with_shear_areas_are_resultants_minus_fef_2d/3d`; `fiber_solvers_refuse_shear_areas` |
| SP-8 | Hognestad concrete is nonlinear-elastic in compression (no unloading, crushing not remembered), cracking permanent; no tension stiffening. Inadequate for cyclic analysis. | DOCUMENTED-CHOICE | `concrete_hognestad_is_history_free_in_compression` |
| SP-9 | `irvine_parameter` had an extra factor $L$ (dimension of length; value changed with units by 1000× from m to mm). Not used by any solver. | FIXED | `irvine_parameter_is_dimensionless` |
| SP-10 | `parabolic_ordinate` puts the sag above the chord ($y(L/2)=h/2+f$), `catenary_ordinate` below it; they should be the approximate and exact forms of one curve. Pinned by the validation test `cable_advanced_ext_parabolic_ordinate`, so the convention needs a decision. Not used by any solver. | OPEN | `parabolic_and_catenary_ordinates_agree_for_shallow_cable` |
| SP-11 | `ernst_tangent_modulus` returns $E(1+\alpha(1-\frac{3\alpha}{1+\alpha}))/(1+\alpha)^2$, which is not the derivative of the chord–tension law (that derivative is `ernst_equivalent_modulus`); negative for moderate α. Now returns that derivative (#415). Not used by any solver. | FIXED | `ernst_tangent_modulus_is_the_chord_law_derivative` |
| SP-12 | Cable solver recovers tension as $T = E_\text{eq}(T)A\varepsilon$, using Ernst's tangent as a secant from a straight, stress-free chord: $\varepsilon = T/EA + (wl_h)^2/(12T^2)$ instead of the elastic-catenary $T/EA - (wl_h)^2/(24T^2)$. Indeterminate cable systems got too little cable tension when sag matters (example: 9.39 kN where the chord law gives 9.59 kN). The solver now runs Newton on the chord law with the unstressed length equal to the modelled chord, Ernst's modulus as the tangent (§1.3; #416, advisory SA-2026-015). An unstressed-length or pretension input is still to add. | FIXED | `cable_tension_follows_the_elastic_catenary_chord_law` |
| SP-13 | The cable solver does not apply the cable's self-weight as a load; density only reduces the modulus. | DOCUMENTED-CHOICE | `cable_density_is_not_a_load` |
| SP-14 | Outside the cable solver a cable is a truss bar: the linear solver lets it carry compression (−25.5 kN in the example) with no diagnostic. | OPEN | `linear_solver_does_not_report_cable_compression_silently` |
| SP-15 | Curved-beam segments take default local axes; near-vertical segments switch reference, so outside the X–Z plane $I_y$/$I_z$ swap on them (semicircle, N = 40: 15 % crown-deflection difference between the X–Z and Y–Z planes). Fixed (#418): every segment takes its axes from the arc's plane, the same relative to the curve. | FIXED | `curved_beam_arch_is_invariant_under_plan_rotation`, `curved_beam_arch_matches_explicit_members_with_plane_normal_axes` |
| SP-16 | Zero-length 3D connector axes are $e_x=X$, $e_y=-Z$, $e_z=Y$ (its own reference rule), so `k_shear` acts along global Z and `k_shear_z` along Y; the "local Y" in the type doc is not the frame's local y. | DOCUMENTED-CHOICE | `connector_zero_length_3d_axis_mapping` |
| SP-17 | 3D connector triad is discontinuous where its reference switches ($|e_{x,X}|=0.9$) for directions with a Z component, and has no user orientation input: anisotropic transverse springs change by O(k) between nearly parallel connectors. | OPEN | `connector_3d_axes_are_continuous_in_direction` |
| SP-18 | Fiber solvers return an empty `reactions` list. | OPEN | `fiber_solver_reports_reactions` |
