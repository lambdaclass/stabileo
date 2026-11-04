# Assembly, boundary conditions and constraints

This note documents how Stabileo turns element matrices into one global system, imposes supports,
inclined supports, springs, settlements and multi-point constraints, recovers reactions and
constraint forces, and adds Winkler and nonlinear soil springs. It is written for an
independent reviewer: every equation below is the one the code implements, with the file and
function to cross-check. Element matrices themselves are in [frames](frames.md),
[shells](shells.md) and [special elements](special-elements.md). Mass and geometric stiffness
are in [mass-geometric-dynamics](mass-geometric-dynamics.md).

Notation: $n$ total DOFs, $n_f$ free, $n_r = n - n_f$ restrained. Subscripts $f$, $r$ mark
the free and restrained partitions. Units: E in MPa on input, multiplied by 1000 to kN/m²
(`mat.e * 1000.0`); lengths in m; forces in kN.

Discrepancies are tagged AC-n and listed at the end.

## 1. Scope and sources

| Topic | File | Functions |
|---|---|---|
| DOF numbering | `engine/src/solver/dof.rs` | `DofNumbering::build_2d`, `build_3d`, `dofs_per_node_2d/3d`, `is_dof_restrained_2d`, `inclined_restrained_3d` |
| Dense assembly | `engine/src/solver/assembly.rs` | `assemble_stiffness_2d/3d`, `assemble_load_vector_2d`, `assemble_load_vector_3d_dense`, `assemble_element_loads_2d/3d(_warping,_mapped)`, `truss_member_load_2d/3d`, `orphan_rotation_dofs_3d`, `artificial_stiffness_entries` |
| Inclined frames | `assembly.rs` | `inclined_rotation_matrix_2d`, `inclined_rotation_matrix`, `rotate_inclined_k_2d/3d`, `rotate_inclined_f_2d/3d`, `reverse_inclined_transform(_2d)` |
| Sparse assembly | `engine/src/solver/sparse_assembly.rs` | `assemble_stiffness_sparse_2d/3d`, `apply_inclined_transform_triplets*`, `to_global`, `to_inclined_free` |
| Linear solve, supports, reactions | `engine/src/solver/linear.rs` | `prepare_static_2d_impl`, `prepare_static_3d`, `prescribed_displacements_2d/3d`, `build_reactions_2d(_inclined)`, `build_reactions_3d(_inclined)`, `validate_input_2d/3d`, `reject_ambiguous_shared_supports` |
| Constraints | `engine/src/solver/constraints.rs` | `build_constraint_transform`, `diaphragm_rows`, `equations_in_inclined_frames`, `validate_constraints`, `validate_constraint_refs`, `solve_constrained_2d(_dense/_sparse)`, `solve_constrained_3d`, `FreeConstraintSystem` |
| Winkler foundation | `engine/src/solver/winkler.rs` | `solve_winkler_2d/3d`, `add_foundation_2d/3d`, `winkler_foundation_matrix` |
| Nonlinear soil springs | `engine/src/solver/ssi.rs`, `soil_curves.rs` | `solve_ssi_2d/3d`, `spring_triplets`, `py_soft_clay`, `py_sand`, `py_stiff_clay`, `tz_curve`, `qz_curve`, `custom_curve` |

The cross-path oracle that compares all assembly paths entry by entry is described in
[ASSEMBLY.md](../verification/ASSEMBLY.md) (`engine/tests/assembly_paths.rs`).

## 2. DOFs, axes and the 2D embedding

### 2.1 DOF sets per node

| Model | DOFs per node | Order (local DOF index) | Rule (`dof.rs`) |
|---|---|---|---|
| 2D, any frame | 3 | 0 $u_X$, 1 $u_Z$, 2 $\theta$ | `dofs_per_node_2d` |
| 2D, trusses only | 2 | 0 $u_X$, 1 $u_Z$ | |
| 3D, frames, plates or shells | 6 | 0 $u_X$, 1 $u_Y$, 2 $u_Z$, 3 $\theta_X$, 4 $\theta_Y$, 5 $\theta_Z$ | `dofs_per_node_3d` |
| 3D, any section with `cw` | 7 | as above, 6 = warping rate $\theta_x'$ | |
| 3D, trusses/cables only | 3 | translations | |

Every node gets the same number of DOFs. A section with `cw` set turns on the 7th DOF for the
whole model, even on members without warping; those members are assembled with their 12×12
matrix scattered by `DOF_MAP_12_TO_14`, and warping DOFs nothing stiffens get the artificial
stiffness of §3.3.

### 2.2 Numbering

Nodes are sorted by id. For each node and each local DOF, the DOF is restrained or free
(§4.1). Free DOFs are numbered $0..n_f-1$ in node order, restrained ones $n_f..n-1$. So

$$
K=\begin{bmatrix}K_{ff}&K_{fr}\\K_{rf}&K_{rr}\end{bmatrix},\qquad
u=\begin{bmatrix}u_f\\u_r\end{bmatrix},\qquad
f=\begin{bmatrix}f_f\\f_r\end{bmatrix}.
$$

The map is a bijection independent of `HashMap` order (checked by `assembly_paths.rs`).

### 2.3 The 2D model lives in the XZ plane

ADR 0001 makes the 3D frame right-handed and Z-up with gravity $-Z$. A 2D model is the XZ plane
of that frame: node field `z` is vertical, member direction $(\cos\alpha,\sin\alpha) = (\Delta
X,\Delta Z)/L$. The 2D rotation $\theta$ is positive from $+X$ toward $+Z$ (counter-clockwise with
X right and Z up). That is a right-hand rotation about $-Y$:

$$
\theta_{2D} = -\theta_Y^{3D},\qquad M_{2D} = -M_Y^{3D}.
$$

The 2D nodal field `my` and the 2D reaction `my` follow $\theta_{2D}$. Translations and forces
map one to one ($u_X$, $u_Z$, $R_X$, $R_Z$). See [frames §2.1](frames.md#21-global-frame) and
FR-7 there.

`plane_2d_matches_3d_xz_embedding` (this note's test file) solves a portal in 2D and the same
portal in the XZ plane of a 3D model, out-of-plane DOFs restrained, and checks ux, uz equal,
$\theta_{2D} = -\theta_Y$ and $M_{2D} = -M_Y$ at the base to $10^{-9}$. `assembly_paths.rs`
checks the same embedding for K, M, $K_G$ and every load type, on random models.

The web's flat-2D-to-3D embedding (`web/src/lib/engine/solver-service.ts`, used when
`shouldEmbedFlat2DModelIn3D` holds) maps model $(x, y)\mapsto(x, 0, y)$ and negates the thermal
gradient, but passes the 2D nodal moment and the prescribed rotation through unchanged
(`buildSolverLoads3D`: `my: moment`; supports: `dry: supportDry`). By the identity above it
should pass $-M$ and $-\theta$. See AC-15.

## 3. Global assembly

### 3.1 Direct stiffness

$$
K = \sum_e L_e^{\mathsf T}\,\bigl(T_e^{\mathsf T} k_e T_e\bigr)\,L_e
\;+\;K_\text{conn}\;+\;K_\text{spr}\;+\;K_\text{art},
$$

with $L_e$ the Boolean gather by `element_dofs` / `plate_element_dofs` / `quad_element_dofs`
(node $i$ DOFs then node $j$ DOFs), $T_e$ the element rotation ([frames §2](frames.md#2-coordinate-systems-and-dofs),
[shells](shells.md)), $K_\text{conn}$ the connector elements, $K_\text{spr}$ the support springs
(§4.3) and $K_\text{art}$ the artificial stiffness (§3.3). Specific paths:

- 2D and 3D trusses/cables are assembled directly in global axes:
  $k = \frac{EA}{L}\begin{bmatrix}dd^{\mathsf T}&-dd^{\mathsf T}\\-dd^{\mathsf T}&dd^{\mathsf T}\end{bmatrix}$
  over translations only, $d$ the unit axis (`truss_global_stiffness_2d`, `scatter_truss_3d`).
- Releases (hinges) are handled at element level by static condensation inside the element
  matrix (`frame_local_stiffness_2d/3d` with hinge flags; [frames §4.4](frames.md#44-member-releases-hinges)).
  The node keeps its rotation DOF; assembly only adds the artificial stiffness when nothing else
  holds it (§3.3).
- Timoshenko shear parameter $\phi = 12EI/(G A_s L^2)$, $G = E/(2(1+\nu))$, computed identically
  for K and for the fixed-end forces (`assemble_element_loads_2d` comment).
- Curved shells are assembled without a transform (already global).
- Element order is sorted by id in 3D for determinism; 2D sums are order-independent up to
  round-off.

There are no rigid end offsets or rigid zones at assembly level: an eccentric member end is
modelled with an `eccentricConnection` constraint (§6) or a connector. The web does not expand
member offsets on the embedded flat-2D path (`solver-service.ts`, `memberRef3D`).

### 3.2 Symmetry and positive semi-definiteness

Every contribution is symmetric PSD (element energies, springs $k\ge0$, artificial $k>0$). So
a zero diagonal means a zero row and column, which is what the orphan guards test.

### 3.3 Artificial stiffness

$$
k_\text{art} = \begin{cases}10^{-10}\,\max_i |K_{ii}| & \max_i|K_{ii}|>0\\ 10^{-6} & \text{otherwise}\end{cases}
$$

($\max$ over all $n$ DOFs, restrained included, so dense and sparse paths agree:
ASSEMBLY.md finding 1). It is added on the diagonal of:

1. **2D all-hinged nodes**: a free $\theta$ at a node where the number of hinged frame ends is at
   least the number of frame ends and no support restrains the rotation (`fixed`, `guidedX`,
   `guidedY`, or `spring` with `kz > 0`).
2. **2D orphan rotations**: any free $\theta$ whose row and column are zero to
   $10^{-12}\max|K_{ii}|$ (truss-only nodes in a frame model).
3. **3D orphan rotations** (`orphan_rotation_dofs_3d`): free $\theta_X,\theta_Y,\theta_Z$ with
   $|K_{ii}|\le 10^{-12}\max|K_{ii}|$, **except** at nodes any constraint references: there the
   rotation may be tied to another DOF and the artificial spring would become a real spring to
   ground once the constraint is imposed.
4. **3D warping DOFs** with $|K_{ii}|<10^{-20}$.

Effect on results. A DOF whose row and column were zero is decoupled, so adding $k_\text{art}$
only fixes its own value: $u_i = f_i/k_\text{art}$. With $f_i=0$ that is $u_i=0$ and no other DOF
changes. A load on such a DOF would produce a huge, meaningless rotation; the 2D solve refuses
when an artificial DOF rotates more than 100 rad ("Local mechanism detected"), the 3D solve
refuses loads on orphan DOFs (`refuse_loads_on_orphan_dofs_3d`, `refuse_moments_without_rotation_3d`).

In 2D the constraint exemption of item 3 does not exist. A 2D rotation that is orphan in $K$
but tied by a constraint keeps $k_\text{art}$, which after $C^{\mathsf T}KC$ is a spring of
relative size $10^{-10}$ on the reduced system: a perturbation of order $10^{-10}$ on the
results, not a correctness issue.

Tests: `artificial_rotation_stiffness_does_not_change_translations` (two fixed–pinned
cantilevers meeting at an all-hinged node: $u = -P/(2\cdot3EI/L^3)$ to $10^{-9}$, $\theta=0$),
`moment_on_all_hinged_node_is_refused`, `assembly_paths.rs` (artificial DOF sets and
`max_diag_k` identical on every path).

### 3.4 Nonlinear paths

`artificial_stiffness_entries` returns the same $(i, k_\text{art})$ pairs for the tangent
assemblers of co-rotational, arc-length, displacement-control, material- and fiber-nonlinear
analyses, which assemble from the members alone ([nonlinear](nonlinear.md)).

## 4. Supports

### 4.1 Restraint classification

**2D** (`is_dof_restrained_2d`), by `type`:

| type | restrained | free |
|---|---|---|
| `fixed` | $u_X,u_Z,\theta$ | |
| `pinned` | $u_X,u_Z$ | $\theta$ |
| `rollerX` | $u_Z$ | $u_X,\theta$ |
| `rollerY` = `rollerZ` | $u_X$ | $u_Z,\theta$ |
| `guidedX` | $u_Z,\theta$ | $u_X$ |
| `guidedY` = `guidedZ` | $u_X,\theta$ | $u_Z$ |
| `inclinedRoller` | rotated slot 1 (normal) | slot 0 (tangent), $\theta$ |
| `spring` | none | all (stiffness added) |

**3D**: flags `rx, ry, rz, rrx, rry, rrz` (and `rw` for warping). A flagged DOF that also has
a positive spring (`kx … krz`, `kw`) is **free**: the spring wins. An inclined support
(`isInclined` with a non-zero normal) restrains rotated slot 0 (the normal), frees slots 1, 2,
and takes rotations and warping from the flags (`inclined_restrained_3d`).

Several supports on one node: plain rigid ones merge by OR; any other combination (a spring, a
settlement, an angle or an inclined direction on one of them) is refused
(`reject_ambiguous_shared_supports`).

### 4.2 Inclined supports

A support frame $R$ (rows = local axes in global components) replaces the node's translation
DOFs by $\tilde u = R\,u$. The assembled system is congruent:

$$
\tilde K_{[d],:} = R\,K_{[d],:},\;\; \tilde K_{:,[d]} = K_{:,[d]}\,R^{\mathsf T},\qquad
\tilde f_{[d]} = R\,f_{[d]},
$$

i.e. $\tilde K = G K G^{\mathsf T}$, $\tilde f = G f$ with $G = I$ except the block $R$ on the
node's translation slots $[d]$ (`rotate_inclined_k_2d/3d`, `rotate_inclined_f_2d/3d`). After the
solve, $u_{[d]} = R^{\mathsf T}\tilde u_{[d]}$ (`reverse_inclined_transform`). Since $R$ is
orthogonal this is exact.

- **2D**: $R = \begin{bmatrix}-\cos\theta&\sin\theta\\ \sin\theta&\cos\theta\end{bmatrix}$ with
  $\theta$ (radians) measured from $+Z$ toward $+X$; row 1 is the restrained normal
  $(\sin\theta,\cos\theta)$, row 0 the tangent. $\det R = -1$: it is a reflection, not a
  rotation (AC-9, harmless: only orthogonality is used, and rotated-frame quantities are never
  reported).
- **3D**: row 0 $= \hat n$; $e_3 \propto \hat n\times r$ with $r = X$ if $|n_X|<0.9$ else $Y$;
  $e_2 = e_3\times\hat n$. $\det R = +1$.
- Rotations are never rotated: rotational flags are global.
- Springs at an inclined node are assembled in **global** axes before the rotation (§4.3).
- The prescribed displacement of an inclined support is its global value projected on the
  normal: $\tilde u_n = \hat n\cdot(d_x,d_y,d_z)$ (3D), $\sin\theta\,d_x+\cos\theta\,d_z$ (2D)
  (`prescribed_displacements_2d/3d`, and the same code in `solve_constrained_2d_dense` and
  `solve_constrained_3d`). The tangential part of a prescribed translation is ignored.
- Every analysis assembles in these frames. Mass and $K_G$ are rotated and results back-rotated
  on the dynamic, buckling and reduction paths ([SOLVER_REFERENCE](../SOLVER_REFERENCE.md),
  `inclined_support_analyses.rs`).

Tests: `inclined_frames_are_orthogonal`, `inclined_support_analyses.rs` (each analysis vs the
rigidly rotated model), `inclined_reporting_gates.rs` (reactions reported in global axes on
every path), `constraints_inclined_supports.rs`.

### 4.3 Springs

- **3D**: $K_{ii} \mathrel{+}= k_i$ on the node's global DOF $i$ for each positive `kx … krz`,
  and `kw` on the warping DOF. Translational springs are global-axis springs even at an
  inclined node (the rotation of §4.2 then couples them).
- **2D** `spring` with `angle` $\beta\ne0$: $K_{[u_X,u_Z]} \mathrel{+}= R_\beta^{\mathsf
  T}\operatorname{diag}(k_x,k_y)R_\beta$, i.e.
  $k_{XX}=k_x c^2+k_y s^2$, $k_{ZZ}=k_x s^2+k_y c^2$, $k_{XZ}=(k_x-k_y)sc$, with $c=\cos\beta$,
  $s=\sin\beta$; the local $x$ spring axis is at $\beta$ from $+X$ toward $+Z$. Note this angle
  convention differs from the inclined roller's (from $+Z$ toward $+X$). `kz` is the rotational
  spring. Without an angle the springs are diagonal.
- **2D non-spring types** also add `kx`, `ky`, `kz` on the diagonal. On a free DOF (e.g.
  `rollerX` with `kx`) that is a real spring and its force is reported (§4.5). On a restrained
  DOF it only enters $K_{rr}$ (see AC-10).

### 4.4 Prescribed displacements (settlements)

$u_r$ holds the prescribed values of the restrained DOFs (rotated frames at inclined nodes).
The free equations are

$$
K_{ff}\,u_f = f_f - K_{fr}\,u_r .
$$

A prescribed value on a DOF that is not restrained (a `pinned` support with `dry`, or a 3D
flagged DOF made free by a spring) is ignored without a message (AC-10).

### 4.5 Reaction recovery

$$
R = K_{rf}\,u_f + K_{rr}\,u_r - f_r ,
$$

where $f$ is the full assembled load vector, i.e. nodal loads **plus** the equivalent nodal
loads (fixed-end forces) of member loads, so $f_r$ removes the share of member loads that the
fixed-end forces put directly on restrained DOFs, and the reaction is the force the support
exerts on the structure ($K u = f + R$). Then (`build_reactions_2d/3d`):

- restrained DOF: $R_i$ from the formula (each DOF once per node, several supports merged);
- free DOF with a spring: $R_i = -k_i u_i$;
- 2D `spring` with angle: $R = -R_\beta^{\mathsf T}\operatorname{diag}(k)R_\beta\,u$;
- inclined node (`build_reactions_2d_inclined`, `build_reactions_3d_inclined`): the restrained
  normal reaction $R_n$ is in the rotated frame, the springs act in global axes, so

$$
R_\text{global} = R^{\mathsf T}\,[R_n,0,0]^{\mathsf T} - K_\text{spr}\,u_\text{global}
\quad(\text{3D}),\qquad
R_\text{global} = R^{\mathsf T}[0,R_n]^{\mathsf T} - \operatorname{diag}(k_x,k_y)\,u
\quad(\text{2D}).
$$

  Before this change the 3D code rotated the global spring forces together with $R_n$ and the
  2D code dropped them, and the reactions did not balance the loads (AC-4, FIXED).

With constraints the same formula is used with the expanded $u_f = C_{ff}q + u_p$ (§6.4).

Global equilibrium of the reported reactions with the applied loads is checked by
`compute_equilibrium_summary_2d/3d` on every linear solve, and by
`inclined_support_with_spring_reactions_balance_2d/3d`,
`constraint_with_inclined_support_reactions_balance`, `rigid_link_3d_kinematics_hold_in_results`
and `duplicate_support_reactions.rs`.

## 5. Load assembly

All member loads are given in **member local axes**, per unit **true length**. The engine has no
global or projected member loads: the web converts global, angled and projected loads before
the call (`solver-service.ts`, `transverseSign`, "Local, global or projected" comment).

| Load | 2D | 3D | Assembly |
|---|---|---|---|
| Nodal | `fx`, `fz`, `my` (about $-Y$) on DOFs 0, 1, 2 | `fx … mz`, `bw` (bimoment) | added to $f$ at the node's global DOFs |
| Distributed | `qI`, `qJ` along local $y$ (linear, optional span $[a,b]$) | `qYI/J`, `qZI/J` local $y$, $z$; `qXI/J` axial | fixed-end forces $\to T^{\mathsf T}$fef |
| Point on member | `p` local $y$ at $a$, optional axial `px`, moment `my` | `py`, `pz` at $a$ | same |
| Thermal | `dtUniform`, `dtGradient` | `dtUniform`, `dtGradientY/Z` | fef with α = 12e-6 (AC-8) |
| Shell self-weight | — | `gx, gy, gz` per load (user-given; the web sends $-g\hat Z$) | consistent nodal loads, $T^{\mathsf T}$ |

For a frame, the equivalent nodal loads are the fixed-end forces of
[frames §6](frames.md#6-equivalent-nodal-loads) with the Timoshenko $\phi$ of the member, then
condensed for releases (`adjust_fef_for_hinges(_3d)`, [frames §6.3](frames.md#63-releases-and-loads)),
then rotated: $f_e = T^{\mathsf T}\,\text{fef}$.

For a truss/cable, transverse member loads go to the nodes by the lever rule (simply supported
reactions, statically exact; `truss_member_load_2d/3d`); the 2D point moment `my` becomes the
couple $\mp M/L$; axial loads by the lever rule; thermal $\pm EA\alpha\Delta T$ along the axis.

Inclined supports: $f$ is rotated with the same $G$ as $K$ (`rotate_inclined_f_2d/3d`) after
all loads are summed.

There is no automatic member self-weight in the engine; gravity is $-Z$ by the ADR and the web
builds it.

## 6. Multi-point constraints

### 6.1 Method: transformation (master–slave elimination)

No penalty and no Lagrange multipliers. Each constraint is a set of equations
$u_s = \sum_m a_{sm} u_m$ (one per dependent DOF $s$). Collecting them,

$$
u = C\,q,\qquad C\in\mathbb R^{n\times n_\text{ind}},
$$

with a unit row for every independent DOF and the substituted row for every dependent one
(`build_constraint_transform`, sparse dual CSR/CSC `SparseTransform`). Chains ($s$ depends on
$m$ which is itself dependent) are resolved by repeated substitution (up to 10 passes, stop when
the largest change is $<10^{-14}$); cycles are detected by DFS in `validate_constraints` and
refused ("Circular constraint chain"). Two constraints on the same dependent DOF: the last one
wins, with a `ConflictingConstraints` warning.

Restricted to the free partition, $u_f = C_{ff}\,q_f + u_p$ with the particular part
$u_p = C_{fr}u_r$ (free slaves of restrained, possibly settling, masters). Substituting in the
potential energy $\tfrac12u^{\mathsf T}Ku - u^{\mathsf T}f$ and taking stationarity in $q_f$:

$$
\boxed{\;K_\text{red}=C_{ff}^{\mathsf T}K_{ff}C_{ff},\qquad
f_\text{red}=C_{ff}^{\mathsf T}\bigl(f_f - K_{fr}u_r - K_{ff}u_p\bigr)\;}
$$

(`FreeConstraintSystem::reduce_matrix(_sparse)`, `reduce_vector`). $K_\text{red}$ is
symmetric PSD; it is positive definite when the constrained structure is stable.

### 6.2 Equations by constraint type

$r = x_s - x_m$ (slave minus master, from coordinates; `get_node_offset`). In 2D,
$r = (\Delta X, \Delta Z)$.

**Rigid link** (`rigidLink`, DOF list `dofs`; empty means $0..\min(n_\text{dpn},3)$):

$$
\text{3D:}\quad u_s = u_m + \theta_m\times r,\qquad \theta_s = \theta_m\ (\text{for listed rotation DOFs}),
$$

$$
\begin{aligned}
u_{X,s} &= u_{X,m} + \theta_{Y,m}\Delta Z - \theta_{Z,m}\Delta Y\\
u_{Y,s} &= u_{Y,m} + \theta_{Z,m}\Delta X - \theta_{X,m}\Delta Z\\
u_{Z,s} &= u_{Z,m} + \theta_{X,m}\Delta Y - \theta_{Y,m}\Delta X
\end{aligned}
$$

$$
\text{2D:}\quad u_{X,s} = u_{X,m} - \Delta Z\,\theta_m,\qquad u_{Z,s} = u_{Z,m} + \Delta X\,\theta_m,\qquad \theta_s=\theta_m\ (\text{if listed}).
$$

The 2D form is the 3D one with $\theta_Y = -\theta_{2D}$ (§2.3). In a model without rotation
DOFs (2D or 3D trusses only) the rotation terms do not exist and the link reduces to equal
translations, which assumes zero rotation of the link. Before this change the 3D
translation-only case took the 2D branch and used $u_{Z,m}$ as the rotation (AC-1, FIXED).

The empty-list default ties the rotation in 2D (it lists DOF 2) but not in 3D (AC-3, OPEN).

**Eccentric connection** (`eccentricConnection`): the rigid link with the explicit offset
$(o_x,o_y,o_z)$ in place of $r$ (2D: $(o_x,o_y)$ with $o_y$ vertical), all DOFs except those
flagged in `releases`.

**Diaphragm** (`diaphragm`, plane `XY`/`XZ`/`YZ`, any other name refused): for each slave, the
in-plane rigid-body motion about the master, including the slave's in-plane rotation
($\theta_s = \theta_m$ about the plane's normal); out-of-plane DOFs independent (`diaphragm_dofs`,
`diaphragm_lever`):

| Model, plane | Equations |
|---|---|
| 3D XY | $u_X = u_{X,m} - \Delta Y\,\theta_{Z,m}$, $u_Y = u_{Y,m} + \Delta X\,\theta_{Z,m}$ |
| 3D YZ | $u_Y = u_{Y,m} - \Delta Z\,\theta_{X,m}$, $u_Z = u_{Z,m} + \Delta Y\,\theta_{X,m}$ |
| 3D XZ | $u_X = u_{X,m} + \Delta Z\,\theta_{Y,m}$, $u_Z = u_{Z,m} - \Delta X\,\theta_{Y,m}$ |
| 2D XZ (the model plane) | $u_X = u_{X,m} - \Delta Z\,\theta_m$, $u_Z = u_{Z,m} + \Delta X\,\theta_m$ |
| 2D XY (default, legacy) | same as 2D XZ (AC-5, OPEN) |
| 2D YZ | refused: not the plane of a 2D model |

All three 3D rows are the in-plane part of $\theta\times r$; (X, Y) and (Y, Z) are cyclic pairs,
(X, Z) is not, which is why its signs differ. The engine used the XY pattern for XZ, flipping both
signs (AC-14, FIXED). The slave's in-plane rotation is tied to the master's, as SAP2000/ETABS and
OpenSees `rigidDiaphragm` do (#342; it used to be left free); a model of trusses alone, which has
no rotation DOFs, is refused. Before this change the 2D XZ case tied the slot mapping (0, 2, 4):
$u_X$ and $\theta$ equal, master DOF 4 nonexistent; 2D YZ tied $\theta$ as well (AC-2, FIXED).

**Equal DOF** (`equalDOF`): $u_{s,i} = u_{m,i}$ for each listed $i$.

**Linear MPC** (`linearMPC`): $\sum_k c_k u_k = 0$. The dependent term is the one with the
largest $|c_k|$ among terms on **free** DOFs (`mpc_dependent_term`); then
$u_\text{dep} = -\sum_{k\neq\text{dep}} (c_k/c_\text{dep})\,u_k$. Choosing a restrained DOF as
dependent would drop the equation.

### 6.3 Constraints at inclined supports and on restrained slaves

Constraint equations are written in global components but an inclined node's slots hold
$\tilde u = Ru$. `equations_in_inclined_frames` substitutes $u_k = \sum_j R_{jk}\tilde u_j$ for
master terms on inclined nodes. An equation whose slave is an inclined translation or a
restrained DOF becomes a homogeneous row $\sum_j R_{jk}\tilde u_j - \sum a\,u_m = 0$; its
dependent DOF is chosen after substituting every already-dependent DOF (preferably a free
rotated DOF of the node, else the largest free coefficient), so a support on a slave restrains
the master's motion instead of dropping the equation. The built $C$ is then checked against
every such row: $(\text{row}\cdot C)_j = 0$ for all free independent $j$ to $10^{-9}$ relative,
else the solve is refused ("cannot be enforced together with its supports").

### 6.4 Recovery and constraint forces

$q_f$ solves $K_\text{red}q_f = f_\text{red}$; $u_f = C_{ff}q_f + u_p$; $u_r$ prescribed; then
the inclined back-rotation and the reactions of §4.5. Constraint forces are the residual of the
unreduced free equations at dependent DOFs:

$$
\lambda_s = (K_{ff}u_f - f_f)_s \quad (s\ \text{dependent}),
$$

rotated to global components at inclined nodes (`forces_to_global`). They are the forces the
constraint applies to the slave DOFs; by $C_{ff}^{\mathsf T}(K_{ff}u_f-f_f)=0$ their resultant on
the masters is $-C^{\mathsf T}\lambda$. A dependent DOF is identified from the constraint
definition, not from the shape of $C$ (a one-to-one row looks like an independent one).

The relative residual reported is $\|C^{\mathsf T}r\|/\|C^{\mathsf T}f\|$ (`reduced_relative_residual`,
`constrained_residual.rs`).

### 6.5 Validity

Small-displacement kinematics: $u_s = u_m + \theta_m\times r$ is the linearisation of a rigid
rotation; it is not orthogonal for finite rotations, so co-rotational analyses with rigid links
are only as accurate as that linearisation per step ([nonlinear](nonlinear.md)).

Tests: inline in `constraints.rs` (`test_equal_dof_constraint`, `test_rigid_link_with_offset`,
`test_diaphragm_constraint`, `test_diaphragm_3d_xy_plane_couples_rz_not_uz` (in-plane only),
`test_circular_constraint_chain_returns_error`, `sparse_reduce_matches_dense_reduce`,
`equal_dof_between_free_nodes_reports_its_constraint_force`), `chained_constraints.rs`,
`constraints_inclined_supports.rs` (every constraint type at an inclined support vs a rotated or
MPC reference, in every analysis), `constrained_residual.rs`, this file's
`rigid_link_3d_kinematics_hold_in_results`, `diaphragm_xz_3d_kinematics_hold_in_results`,
`rigid_link_in_translation_only_3d_model`, `diaphragm_xz_in_2d_is_the_in_plane_rigid_body`,
`diaphragm_yz_in_2d_ties_uz_only`, `rigid_link_explicit_dofs_agree_2d_3d`,
`constraint_with_inclined_support_reactions_balance`.

## 7. Winkler foundation

### 7.1 Formulation

A Winkler bed of modulus $k_f$ (force per length per displacement) along a frame member adds
the energy $\tfrac12\int_0^L k_f\,v^2\,dx$, with $v$ interpolated by the same cubic Hermite
functions as the member:

$$
v = N_1 v_1 + N_2\theta_1 + N_3 v_2 + N_4\theta_2,\qquad
K_f = \int_0^L k_f\,N^{\mathsf T}N\,dx = \frac{k_fL}{420}
\begin{bmatrix}156&22L&54&-13L\\22L&4L^2&13L&-3L^2\\54&13L&156&-22L\\-13L&-3L^2&-22L&4L^2\end{bmatrix},
$$

the consistent ("mass-like") matrix, exact for the Hermite field (`winkler_foundation_matrix`).
It is embedded on local $(v_1,\theta_1,v_2,\theta_2)$ and rotated with the member $T$.

- 2D (`add_foundation_2d`): one bed on the local $y$ (transverse) DOFs, $\theta = +dv/dx$.
- 3D (`add_foundation_3d`): `ky` on $(v,\theta_z)$, `kz` on $(w,\theta_y)$. Because
  $\theta_y = -dw/dx$, the $z$ bed is $DK_fD$ with $D=\operatorname{diag}(1,-1,1,-1)$: the
  translation–rotation couplings change sign. The engine used $K_f$ unchanged for $z$; a cantilever
  with $I_y=I_z$ and $k_y=k_z$ deflected half as much in $z$ as in $y$ (AC-6, FIXED).
- No axial or torsional bed; truss/cable members are skipped. A released member end is not
  condensed for the foundation: the bed uses the node rotation, not the member-end rotation.

### 7.2 Solve and recovery

$K\mathrel{+}=\sum K_f$, then the linear solve of §4 with optional constraint reduction. Member
end forces are recovered with the bar alone ($K_e u - \text{fef}$, `compute_internal_forces_2d/3d`),
without $K_f u$ (AC-7, OPEN). Reactions are supports only; the foundation's share of the load is
not reported as a reaction.

The Winkler paths build $u_r$ with the plain `dx/dz/dry` mapping (no projection on an inclined
normal, unlike §4.2) and apply no particular solution $u_p$ for slaves of settling masters.
Not covered by a test here.

Tests: `winkler_3d_kz_matches_ky_by_symmetry`, `winkler_2d_rigid_beam_settlement`
($u=-P/(k_fL)$ for a rigid beam), `tests/integration/winkler.rs`,
`inclined_reporting_gates.rs::winkler_path_inclined_reactions_global`,
`constraints_inclined_supports.rs::winkler_constraints_on_inclined_supports_match_rotated_model`.

## 8. Nonlinear soil springs (SSI)

`solve_ssi_2d/3d`: nodal springs along one global axis (`direction`), stiffness
$k = k_\text{sec}(y)\,L_\text{trib}$ (p-y, t-z, custom: the curve is a force per metre of pile) or
$k = k_\text{sec}(z)$ (q-z: the tip spring is a force, $L_\text{trib}$ is not used), iterated by
the secant method (default 50 iterations, tolerance $10^{-4}$ on the relative change of $k$).
Starting value: the curve's initial stiffness ($y=0$). A spring on a node the model does not have or along a rotation is refused. Every curve is validated first and refused
(an error naming the spring) when it misses an input its reference needs or has one outside the
reference's range. Prescribed displacements are refused. Springs at inclined nodes are rotated into
the support frame as $Rk R^{\mathsf T}$ (`spring_triplets`). Reactions are not reported; per-spring
results are $p(y)\,L_\text{trib}$ (q-z: $Q(z)$).

| Curve | Code | Reference form | Deviations |
|---|---|---|---|
| Soft clay p-y | $p_u=\min(3c+\gamma'z+Jcz/D,\,9c)D$, $J\in[0.25,0.5]$ required; $y_c=2.5\varepsilon_{50}D$; $p/p_u=0,0.23,0.33,0.50,0.72,1.00$ at $y/y_c=0,0.1,0.3,1,3,8$, linear between, $p_u$ beyond | Matlock (1970) as API RP 2A §6.8.2–3 (and RP 2GEO) tabulate it, short-term static | the J term was omitted (AC-12, FIXED); the table is Matlock's cube root at its points, with a finite initial stiffness $2.3p_u/y_c$ (the cube root's is infinite and the secant iteration does not settle on it: deep nodes chase $y=0$) |
| Sand p-y | $p=A p_u\tanh\!\bigl(k z y/(A p_u)\bigr)$, $p_u=\min((C_1z+C_2D)\gamma'z,\;C_3D\gamma'z)$; static $A=\max(3-0.8z/D,0.9)$, cyclic $A=0.9$ (`loading` required); $k$ linear in API RP 2GEO Table 5 ($\varphi'=25,30,35,40^\circ\to5.4,11,22,45$ MN/m³), $\varphi$ outside 25–40° refused | API RP 2A §6.8.6–7, Reese, Cox & Koop (1974), API RP 2GEO (2011) §8.5.7 | $C_1,C_2,C_3$ were wrong (AC-11, FIXED); $A$ was 0.9 always and $k$ a step table at integer degrees (AC-12, FIXED) |
| Stiff clay p-y | without free water (`free_water: false` required; `true` refused): $p_u$ as soft clay ($J$ required), $y_{50}=2.5\varepsilon_{50}D$, $p=\tfrac12p_u(y/y_{50})^{1/4}$ up to $16y_{50}$, $p_u$ beyond, sampled at $y/y_{50}=0.001,0.003,0.01,0.03,0.1,0.3,1,3,8,16$ and linear between (at most 3.3 % below the power law from $0.001y_{50}$) | Welch & Reese (1972), Reese & Welch (1975), static | was discontinuous at $y_{50}$ and softened to $0.7p_u$, not a published curve (AC-13, FIXED); sampling as for soft clay, exact at the points; the submerged curve (Reese, Cox & Koop 1975) is not implemented |
| t-z | $t=t_u\sqrt{z/z_u}$, $t_u$ beyond, times the shaft `perimeter` (required): kN/m | simplified (API RP 2A Table 6.4.3-1 is piecewise) | units were kPa (AC-16, FIXED); the shape is a documented simplification |
| q-z | API RP 2A §6.4.3 table: $Q/Q_p=0.25,0.50,0.75,0.90,1.00$ at $z/D=0.002,0.013,0.042,0.073,0.100$, linear between (and from the origin), times the `tip_area` (required): kN | API RP 2A §6.4.3 | was $q_u\sqrt{z/(0.1D)}$ in kPa times $L_\text{trib}$ (AC-16, FIXED); compression only: bears when the node moves in the negative direction of the spring's axis, no resistance in uplift |
| Custom | piecewise linear, constant beyond the last point | — | — |

The sand coefficients are now the closed forms the API figure plots, with $\alpha=\varphi/2$,
$\beta=45^\circ+\varphi/2$, $K_0=0.4$, $K_a=\tan^2(45^\circ-\varphi/2)$:

$$
\begin{aligned}
C_1&=\frac{K_0\tan\varphi\sin\beta}{\tan(\beta-\varphi)\cos\alpha}+\frac{\tan^2\beta\tan\alpha}{\tan(\beta-\varphi)}+K_0\tan\beta\,(\tan\varphi\sin\beta-\tan\alpha),\\
C_2&=\frac{\tan\beta}{\tan(\beta-\varphi)}-K_a,\qquad
C_3=K_a(\tan^8\beta-1)+K_0\tan\varphi\tan^4\beta .
\end{aligned}
$$

At $\varphi=30^\circ$: $C_1\approx1.91$, $C_2\approx2.67$, $C_3\approx28.7$ (the old code gave
0.58, 0.33, 1.73).

Tests: `py_sand_ultimate_matches_api_coefficients`, inline `soil_curves.rs` tests,
`tests/validation/benchmarks/ssi_benchmark.rs`, `constraints_inclined_supports.rs::ssi_constraints_on_inclined_supports_match_rotated_model`.

## 9. Limits of validity

- Linear, small-displacement kinematics for supports and constraints (inclined frames are fixed
  in space; rigid-link equations are linearised).
- Artificial stiffness is safe only for DOFs with zero rows; any load on them is refused or
  flagged.
- 2D models are plane frames in XZ; everything out of plane is implicitly restrained.
- Winkler: tensionless soil, coupling between adjacent springs (Pasternak) and axial/torsional
  beds are not modelled.
- SSI: secant iteration of independent springs, no gapping or cyclic degradation; curves are
  simplified as tabulated in §8.

## 10. Verification map

| Part | Tests |
|---|---|
| DOF numbering, merging | `duplicate_support_reactions.rs`, `assembly_paths.rs` (bijection, order independence) |
| Assembly paths agree | `assembly_paths.rs` |
| 2D = 3D in XZ | `plane_2d_matches_3d_xz_embedding`, `assembly_paths.rs` (embedding), web `embed-2d-in-3d.test.ts` (no nodal moments; AC-15) |
| Artificial stiffness | `artificial_rotation_stiffness_does_not_change_translations`, `moment_on_all_hinged_node_is_refused` |
| Inclined supports | `inclined_frames_are_orthogonal`, `inclined_support_analyses.rs`, `inclined_reporting_gates.rs`, `inclined_support_with_spring_reactions_balance_2d/3d` |
| Settlements | `constrained_residual.rs` (settling supports), `constraints.rs::test_inclined_support_prescribed_displacement_matches_unconstrained` |
| Thermal α | `thermal_load_uses_fixed_alpha` |
| Constraints | see §6.5 |
| Winkler | see §7.2 |
| Soil curves | see §8 |

Gaps: no test of the Winkler path with settlements at inclined supports or settling masters of
constraints; no test of a 2D truss-only model with an offset rigid link (equal translations).

## References

- J. S. Przemieniecki, *Theory of Matrix Structural Analysis*, McGraw-Hill, 1968 (direct
  stiffness, partitioning, reactions).
- W. McGuire, R. H. Gallagher, R. D. Ziemian, *Matrix Structural Analysis*, 2nd ed., 2000
  (inclined supports, constraints, member loads).
- R. D. Cook, D. S. Malkus, M. E. Plesha, R. J. Witt, *Concepts and Applications of Finite
  Element Analysis*, 4th ed., 2002, Ch. 9 (multi-point constraints by transformation).
- K.-J. Bathe, *Finite Element Procedures*, 1996, §4.2 (constraint transformation, rigid links).
- M. Hetényi, *Beams on Elastic Foundation*, 1946 (Winkler beam).
- H. Matlock, "Correlations for design of laterally loaded piles in soft clay", OTC 1204, 1970.
- L. C. Reese, W. R. Cox, F. D. Koop, "Analysis of laterally loaded piles in sand", OTC 2080,
  1974.
- American Petroleum Institute, RP 2A-WSD, 21st ed., 2000, §6.4, §6.8 (t-z, q-z, p-y).
- L. C. Reese, W. F. Van Impe, *Single Piles and Pile Groups Under Lateral Loading*, 2001.

## Discrepancies and open questions for review

Tests are in `engine/tests/derivation_assembly_constraints.rs`.

| ID | Description | Status | Test |
|---|---|---|---|
| AC-1 | **Rigid link, eccentric connection and diaphragm in a 3D model without rotation DOFs** (trusses/cables only, 3 DOFs per node) took the 2D branch (`dofs_per_node <= 3`) and read DOF 2 ($u_Z$) as the master rotation: $u_{X,s}=u_{X,m}-\Delta Y\,u_{Z,m}$. Now the branch follows the model's dimension; with no rotation DOFs the link is equal translations. | FIXED | `rigid_link_in_translation_only_3d_model` |
| AC-2 | **2D diaphragm planes "XZ" and "YZ"** mapped to 3D slot numbers in a 3-DOF model: XZ tied $u_X$ and $\theta$ (master DOF 4 nonexistent), YZ tied $u_Z$ and $\theta$. XZ is the 2D model plane: it is now the in-plane rigid body; YZ names DOFs a 2D model does not have and is refused. Unknown plane names, which used to fall back to XY silently, are refused. | FIXED | `diaphragm_xz_in_2d_is_the_in_plane_rigid_body`, `diaphragm_yz_in_2d_is_refused` |
| AC-3 | **Default rigid-link DOFs differ between 2D and 3D.** `dofs: []` means $0..\min(n_\text{dpn},3)$: (ux, uz, θ) in 2D — rotation tied, a fixed arm — but (ux, uy, uz) in 3D — slave rotation free, a pinned arm. `types/input.rs` documents "Empty = all translational", which matches 3D. The web (`constraint-2d-remap.ts`) keeps the empty list when sending a stored 3D link to the 2D solver, so the 2D and 3D analyses of one model differ (in the test, column-top drift 2.24 mm vs 4.50 mm). Changing either default changes existing results; needs a decision. | OPEN | `rigid_link_default_dofs_agree_2d_3d` (ignored) |
| AC-4 | **Reactions at an inclined support that also has a translational spring.** K holds the spring in global axes; 3D reporting rotated the global spring forces together with the normal reaction, 2D dropped them; ΣR ≠ −ΣF (3D: ΣRx = −13.19 for Fx = 10). Now $R = R^{\mathsf T}[R_n,0,0] - K_\text{spr}u$. | FIXED | `inclined_support_with_spring_reactions_balance_3d`, `_2d` |
| AC-5 | **2D "XY" diaphragm is an in-plane rigid body; 3D "XY" is a floor.** In Z-up, an XY diaphragm is horizontal: it ties ux, uy, θz and leaves vertical bending free. In 2D the default "XY" ties (ux, uz, θ), making the floor beam rigid in the model plane. The web passes 3D floor diaphragms to the 2D solver verbatim. The consistent trace of a 3D XY diaphragm on the XZ plane is $u_{X,s}=u_{X,m}$ only. Changing the 2D default changes existing results. | OPEN | `floor_diaphragm_agrees_2d_3d` (ignored) |
| AC-6 | **Winkler `kz` used the `ky` matrix unchanged.** Bending about local y has $\theta_y=-w'$, so the bed must be $DK_fD$. With $I_y=I_z$, $k_y=k_z$ the cantilever tip deflection under the same load was 0.67 mm in y and 0.33 mm in z. | FIXED | `winkler_3d_kz_matches_ky_by_symmetry` |
| AC-7 | **Winkler member-end forces omit $K_f u$.** At a free end of a beam on a bed the reported shear is −(K_f u) (4.15 kN for a 20 kN load in the test) instead of 0. The bed is part of the member; recovery should use $(K_e+K_f)u-\text{fef}$, or report the bed reaction separately. | OPEN | `winkler_member_end_forces_include_foundation` (ignored) |
| AC-8 | **Thermal α = 12e-6 /°C** for frame and truss thermal loads whatever the material, and the gradient depth $h=\sqrt{12I/A}$. The web rescales ΔT and the gradient to the material α and the real depth before the call ([frames §7.4](frames.md#74-thermal-loads-alpha-and-depth-are-fixed-in-the-engine)); direct API users must do the same. | DOCUMENTED-CHOICE | `thermal_load_uses_fixed_alpha` |
| AC-9 | **The 2D inclined-roller matrix is a reflection** ($\det R=-1$). Only orthogonality matters for $GKG^{\mathsf T}$ and the back-rotation, and rotated-frame components are never reported, so results are unaffected. | DOCUMENTED-CHOICE | `inclined_frames_are_orthogonal` |
| AC-10 | **Settlements silently ignored, springs on restrained DOFs.** A prescribed displacement on a DOF that is not restrained is dropped without a message: 3D flag + positive spring (the spring frees the DOF), or a 2D `pinned` with `dry`. A 2D rigid type with `kx/ky/kz` on a restrained DOF adds $k$ to $K_{rr}$ only; with a settlement the reported reaction then includes $k\,d$ that is not a force of the rigid support. Proposed: refuse a settlement on a free DOF and a spring on a restrained one. | OPEN | `settlement_on_spring_dof_is_not_silently_dropped` (ignored) |
| AC-11 | **API sand $C_1, C_2, C_3$** were $\tan^2\varphi\tan\beta$, $\tan^2\varphi$, $\tan\varphi\tan^2\beta$ (0.58, 0.33, 1.73 at 30° against 1.91, 2.67, 28.7): $p_u$ 5× low near the surface, 16× deep. Now the Reese–Cox–Koop closed forms. | FIXED | `py_sand_ultimate_matches_api_coefficients` |
| AC-12 | **Other p-y deviations from the cited references.** Soft clay omitted Matlock's $J\,c\,z/D$ term (p_u 84 vs 124 kN/m in the test). Sand used $A=0.9$ (the cyclic value; the doc comment called it static) and a step table for $k$ in integer degrees. Now: J required (0.25–0.5), the API static table; sand `loading` required (static $A=\max(3-0.8z/D,0.9)$, cyclic 0.9), $k$ interpolated in API RP 2GEO Table 5, $\varphi$ outside 25–40° refused (SA-2026-017). | FIXED | `py_soft_clay_ultimate_includes_j_term`, `soil_curves_references.rs` |
| AC-13 | **"Stiff clay" p-y curve was discontinuous** at $y=y_{50}$ ($0.5p_u\to p_u$) and was not Reese's stiff-clay curve. Now Welch & Reese (1972) stiff clay without free water, continuous, $p_u$ at $16y_{50}$; with free water refused (SA-2026-017). | FIXED | `py_stiff_clay_is_continuous`, `stiff_clay_is_welch_reese_quarter_power_to_16_y50` |
| AC-14 | **3D "XZ" diaphragm had both signs flipped**: it wrote $u_X=u_{X,m}-\Delta Z\,\theta_Y$, $u_Z=u_{Z,m}+\Delta X\,\theta_Y$ instead of $+\Delta Z\,\theta_Y$, $-\Delta X\,\theta_Y$ (XZ is not a cyclic pair). A rigid rotation of the diaphragm strained the members tied to it. `certify.rs` uses XZ diaphragms on Y-up fixtures; the certificates stay consistent because they check the solve, not the kinematics. | FIXED | `diaphragm_xz_3d_kinematics_hold_in_results` |
| AC-15 | **Web flat-2D embedding does not negate rotations.** With $\theta_{2D}=-\theta_Y$ (§2.3, FR-7), mapping a 2D model into 3D must send $M_Y=-M_{2D}$ and $d_{ry}=-d_{\theta,2D}$. `solver-service.ts` `buildSolverLoads3D` sends `my: moment` and the support mapping sends `dry: supportDry` unchanged (the thermal gradient is negated, so the issue was seen for gradients only). A nodal moment or prescribed rotation on a flat model solved through the embedding acts in the opposite sense from the same model solved in 2D. The engine contract is pinned by `plane_2d_matches_3d_xz_embedding` (which sends `my = −M` to 3D); the web test `embed-2d-in-3d.test.ts` only uses zero moments. Fix belongs in the web (out of scope here). | OPEN | engine: `plane_2d_matches_3d_xz_embedding`; web: none |
| AC-16 | **t-z and q-z units.** The curves returned a stress (kPa) and SSI multiplied by the tributary length only: $t\,[\text{kPa}]\times L\,[\text{m}]$ is kN/m, not kN. Now t-z needs the shaft `perimeter` and q-z the `tip_area` (refused when missing); the q-z tip spring is a force, not multiplied by $L_\text{trib}$; q-z follows API's table (SA-2026-017). | FIXED | `single_pile_axial_capacity_matches_hand_calculation`, `tz_is_shaft_friction_times_perimeter`, `qz_follows_api_table_times_tip_area` |
