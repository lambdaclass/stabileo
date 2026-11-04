# Nonlinear formulations

This file covers the nonlinear solution procedures of the engine. They are second-order elastic
(P-Delta), large-displacement co-rotational frames in 2D and 3D, path following (arc-length,
displacement control), lumped plasticity (the "material nonlinear" solver and the event-to-event
plastic-hinge solvers), the global loop of the fiber solver, contact and gap elements, and the
imperfection helpers. It also covers the convergence criteria each one uses. The element
kernels they call are documented elsewhere: frame stiffness and releases in
[frames.md](frames.md), the geometric stiffness $K_G$ in
[mass-geometric-dynamics.md](mass-geometric-dynamics.md#1-geometric-stiffness-of-frames-and-trusses),
the fiber element and its material laws in
[special-elements.md](special-elements.md#4-fiber-beam-column-element), constraints and inclined
supports in [assembly-constraints.md](assembly-constraints.md).

| Procedure | Source (engine/src/solver/) | Entry points |
|---|---|---|
| P-Delta | `pdelta.rs` | `solve_pdelta_2d`, `solve_pdelta_3d`, `b2_factor`, `second_order_forces_2d/3d` |
| Co-rotational 2D | `corotational.rs` | `solve_corotational_2d`, `assemble_frame_corotational`, `assemble_truss_corotational`, `compute_corotational_forces`, `wrap_angle` |
| Co-rotational 3D | `corotational.rs` | `solve_corotational_3d`, `assemble_frame_corotational_3d`, `assemble_truss_corotational_3d`, `corotated_axes_3d`, `rotation_vector`, `current_length_shears`, `elastic_corotational_forces_3d` |
| Arc-length, displacement control | `arc_length.rs` | `solve_arc_length`, `solve_displacement_control` |
| Lumped plasticity (secant) | `material_nonlinear.rs` | `solve_nonlinear_material_2d/3d`, `yield_utilization(_3d)` |
| Plastic hinges, event-to-event | `plastic.rs`, `plastic_3d.rs` | `solve_plastic_2d`, `solve_plastic_3d`, `increment_to_mp`, `increment_to_yield` |
| Fiber global loop | `fiber_nonlinear.rs` | `solve_fiber_nonlinear_2d/3d`, `fiber_member_forces_2d/3d` |
| Contact, gaps, uplift | `contact.rs` | `solve_contact_2d/3d`, `contact_corrections_2d`, `next_slip`, `solve_uplift_2d` |
| Line search, step control | `line_search.rs`, `adaptive_stepping.rs` | `armijo_backtrack`, `AdaptiveStepper` (no solver calls either) |
| Imperfections | `imperfections.rs`, `lib.rs` | `apply_geometric_imperfections_2d/3d`, `notional_loads_2d/3d`, `apply_*_residual_stress`, `solve_with_imperfections_2d/3d` |

Units are kN, m and rad throughout. $E$ is given in MPa and multiplied by 1000. In 2D the plane is
$(x, z)$, with $z$ up ([ADR 0001](../adr/0001-z-up-coordinate-system.md)). The co-rotational 2D
element measures angles counter-clockwise from $+x$ toward $+z$, the same sense as the frame's
internal rotation DOF ([frames.md](frames.md#24-local-dof-ordering-and-rotation-conventions)).

---

## 1. Common structure

### 1.1 Incremental-iterative loop

Every solver except P-Delta, contact and the plastic solvers applies proportional loading
$\lambda\,F$, $\lambda_k = k/n_\text{inc}$, and runs Newton–Raphson at each increment:

$$
R(u) = \lambda_k F - f_\text{int}(u),\qquad K_T(u)\,\Delta u = R(u),\qquad u \leftarrow u + \Delta u .
$$

Only the free DOFs are solved. When constraints are present, everything goes through the reduced
system $C^{\mathsf T}K_TC$, $C^{\mathsf T}R$ ([assembly-constraints.md](assembly-constraints.md)).
Inclined supports work in their rotated frames: $f_\text{int}$ and $K_T$ are formed in global axes
from global displacements, then rotated, and the iterate is rotated back before the elements see it.

The linear solve tries dense Cholesky first and falls back to LU. Above `SPARSE_THRESHOLD` (64
independent DOFs) it uses sparse Cholesky with a cached symbolic factorization. The
co-rotational and fiber solvers have an optional *modified* Newton mode, which keeps the first
tangent factor of each increment. If the Cholesky of that tangent fails, they fall back to full
Newton for that increment.

### 1.2 Convergence criteria

| Solver | Criterion | Default tol | On failure |
|---|---|---|---|
| P-Delta | $\lVert u_{k+1}-u_k\rVert_2 / \lVert u_{k+1}\rVert_2 < \text{tol}$ (displacement, free DOFs) | caller | returns last iterate, `converged=false` |
| Co-rotational 2D/3D | $\lVert C^{\mathsf T}R\rVert_2 / \lVert C^{\mathsf T}\lambda F\rVert_2 < \text{tol}$ (force) | caller | reports **last converged increment**, its load factor and loads |
| Material nonlinear 2D/3D | $\lVert C^{\mathsf T}R\rVert_2 < \text{tol}\cdot\lVert \lambda F_f\rVert_2$ | $10^{-6}$ | marks `converged=false` and **continues** with the next increment (NL-17) |
| Fiber 2D/3D | as co-rotational | $10^{-6}$ | stops, reports the **unconverged iterate** (NL-17) |
| Arc-length | $\lVert C^{\mathsf T}R\rVert_2 / (\lvert\lambda\rvert\lVert F\rVert_2) < \text{tol}$ | $10^{-6}$ | halves $\Delta s$, restores the last converged state |
| Displacement control | force test as arc-length, with $\lVert\lambda F\rVert$ floored at 1, **and** $\lvert u_c - u_c^\ast\rvert \le \text{tol}\cdot\lvert\Delta d\rvert$ | $10^{-6}$ | stops |
| Contact | no status change in one full pass (after the first) | — | `converged=false` after `max_iter` |

If $\lVert F\rVert = 0$, the co-rotational 2D and fiber solvers test $\lVert R\rVert$ in absolute
terms, and the 3D co-rotational solver divides by 1. Every force norm is an unweighted $\ell_2$
norm over translations *and* rotations, so kN and kN·m are mixed. No solver uses an energy norm.

---

## 2. P-Delta (`pdelta.rs`)

### 2.1 Formulation

P-Delta solves the second-order elastic equilibrium

$$
\bigl(K + K_G(N(u))\bigr)\,u = F
$$

by **successive substitution (Picard)**, not Newton. It starts from the linear solution $u_0$,
then repeats: assemble $K_G$ from the axial forces of the current $u_k$ and solve for $u_{k+1}$.
$K_G$ is the consistent cubic-Hermite matrix (Przemieniecki), condensed for releases. It is
derived in [mass-geometric-dynamics.md §1](mass-geometric-dynamics.md#1-geometric-stiffness-of-frames-and-trusses).
Its transverse terms $36/30$, $3L/30$ and $4L^2/30$ contain both the chord rotation (P-Δ) and the
member curvature (P-δ), so "P-Delta" here means **P-Δ + P-δ at the level of one cubic per member**.
Truss members get the string matrix $(N/L)(I - e e^{\mathsf T})$.

The axial force of each member is read back from the displacements:

$$
N = EA\left(\frac{(u_j-u_i)\cdot e}{L} - \alpha\,\Delta T_\text{uniform}\right).
$$

$EA\,\Delta/L$ is the **length average** of $N(x)$ when axial member loads are present. That is
the right value for a constant-$N$ $K_G$.

Prescribed displacements enter through $F_f - K_{fr}u_r$ with the *current* $K+K_G$
(`rhs_with_prescribed`). The reactions are the restrained rows of $(K+K_G)u - F$. The member end
forces are $(K_e + K_{G,e})u_e - \text{FEF}$ (`second_order_forces_2d/3d`).

### 2.2 Stability flags

`indefinite` is set when Cholesky fails and LU is needed, meaning $K+K_G$ is not positive definite.
$B_2$ (`b2_factor`) is the largest ratio $\lvert u_{P\Delta}/u_\text{lin}\rvert$ over the free
translations that pass two filters: their increment $u_{P\Delta}-u_\text{lin}$ is at least 5% of
the largest increment, and their linear value is at least 5% of the largest such value. $B_2 = \infty$
when indefinite. `is_stable = converged && B2 < 100`.

### 2.3 Consistency with linear buckling

Linear buckling uses the same $K_G$ kernel, with $N$ from the linear solution
([mass-geometric-dynamics.md §3](mass-geometric-dynamics.md#3-linear-buckling)). Picard on
$(K+K_G)u=F$ converges only when the spectral radius of $(K+K_G)^{-1}\partial K_G/\partial\lambda$
stays below 1. That condition holds when $P < P_\text{cr}$ and the axial forces barely depend on
$u$. Past $P_\text{cr}$ the LU solve converges to the reversed-sway equilibrium, and the indefinite
flag reports it.

Check (`nl_pdelta_matches_beam_column_and_buckling`): a cantilever column at $P = 0.6P_\text{cr}$
with tip shear $H$, in 8 members. The P-Delta tip deflection matches the beam-column closed form
$\delta = H(\tan\mu L - \mu L)/(P\mu)$, $\mu^2 = P/EI$, to $2\times10^{-3}$. The buckling factor
of the same model matches $\pi^2EI/(4L^2P)$ to $10^{-3}$.

---

## 3. Co-rotational frame, 2D

### 3.1 Kinematics

Member $i\to j$ has initial chord $\Delta X = X_j - X_i$, $L_0 = \lvert\Delta X\rvert$ and
$\alpha_0 = \operatorname{atan2}(\Delta Z, \Delta X)$. In the current configuration
$\Delta x = \Delta X + u_j - u_i$, $l = \lvert\Delta x\rvert$, $c = \cos\alpha$,
$s = \sin\alpha$ and $\alpha = \operatorname{atan2}(\Delta z, \Delta x)$. The rigid chord rotation
is $\beta = \alpha - \alpha_0$. The **natural deformations** are

$$
\bar u = l - L_0 = \frac{(2\Delta X + \Delta u)\cdot\Delta u}{l + L_0}\quad(\text{`elongation`, free of cancellation}),\qquad
\bar\theta_{1} = \operatorname{wrap}(\theta_i - \beta),\quad \bar\theta_{2} = \operatorname{wrap}(\theta_j - \beta),
$$

where $\operatorname{wrap}$ reduces to $(-\pi,\pi]$ (NL-1). This is Crisfield vol. 1 §7.3. The
"local element" is the **linear** frame $k_\ell$ with $L_0$. It is Euler–Bernoulli, or Timoshenko
with the same $\phi = 12EI/(GA_sL_0^2)$ as the linear solver, condensed for hinges
(`frame_local_stiffness_2d`). It is mapped to the natural DOFs by
$d_\text{local} = [0,0,\bar\theta_1,\bar u,0,\bar\theta_2]$:

$$
k_n = P^{\mathsf T}k_\ell P \ (3\times3),\qquad q = [N, M_1, M_2]^{\mathsf T} = k_n\,[\bar u,\bar\theta_1,\bar\theta_2]^{\mathsf T}.
$$

No bowing term and no shallow-arch strain are used. Axial and bending are coupled only through
the geometry, so the strains are small and the rotations large.

### 3.2 Internal force and tangent

With $r = [-c,-s,0,c,s,0]^{\mathsf T}$ and $z = [s,-c,0,-s,c,0]^{\mathsf T}$:

$$
\delta\bar u = r^{\mathsf T}\delta u,\qquad \delta\beta = z^{\mathsf T}\delta u/l,\qquad
B = \begin{bmatrix} r^{\mathsf T}\\ e_3^{\mathsf T} - z^{\mathsf T}/l\\ e_6^{\mathsf T} - z^{\mathsf T}/l\end{bmatrix},\qquad f_\text{int} = B^{\mathsf T}q .
$$

Differentiating at fixed $q$, with $\delta r = z\,\delta\beta$, $\delta z = -r\,\delta\beta$ and
$\delta l = r^{\mathsf T}\delta u$:

$$
K_T = B^{\mathsf T}k_nB + \frac{N}{l}\,zz^{\mathsf T} + \frac{M_1+M_2}{l^2}\,(rz^{\mathsf T} + zr^{\mathsf T}).
$$

This is the **exact** derivative of $f_\text{int}$, and it is symmetric because the element
derives from the potential $\tfrac12 d^{\mathsf T}k_nd$. Check
(`nl_corot2d_tangent_is_the_derivative_of_the_internal_forces`): central differences of
$f_\text{int}$ at a state with $\bar\theta \approx 0.2$ and large $N$, $M$ match $K_T$ to
$10^{-6}\max\lvert K\rvert$, and $K_T$ is symmetric. The check covers a fixed member, a member with
an end hinge, and a Timoshenko member.

Trusses and cables use $f = N r$ and $K_T = (EA/L_0)rr^{\mathsf T} + (N/l)(Z - rr^{\mathsf T})$ with
$N = EA\bar u/L_0$. In 2D and 3D this is exact for any rotation. In the co-rotational solvers a
cable is a bar that also takes compression. The cable solver is in
[special-elements.md](special-elements.md#1-cables).

### 3.3 Releases

A hinge is condensed out of $k_\ell$ before $k_n$ is formed, so the released row and column of
$k_n$ are zero. $M$ at that end is zero for every $\bar\theta$, and the value of the node rotation
does not enter the member. The node's rotation is held by the other members there, by a support,
or by the linear assembler's artificial stiffness (`artificial_stiffness_entries`), which is added
to $K_T$ and $f_\text{int}$ in the same way.

### 3.4 Loads and recovery

The load vector is the linear assembler's $F$. Nodal loads and the fixed-end equivalents of member
loads are fixed in direction and magnitude (**dead loads**, not follower loads). Distributed loads
stay referred to the undeformed member. Member end forces are $k_\ell d_\text{local}$ minus the FEF
taken in the co-rotated frame (`subtract_element_fef`). Equilibrium, though, used the FEF in the
initial frame, so with member loads and large chord rotations the reported member-load share is
rotated by $\beta$ (NL-14). Reactions are $f_\text{int} - F$ on the restrained rows. Thermal loads
and prescribed displacements are refused.

### 3.5 Objectivity

A rigid motion gives $\bar u = 0$ exactly, and $\theta_i = \theta_j = \beta + 2\pi k$, so
$\bar\theta = 0$ after the wrap. Check (`nl_corot2d_rigid_body_motion_is_stress_free`): members in
five directions, including $\alpha_0 = \pi$, and rotations up to $\pm5$ rad give
$\lvert f_\text{int}\rvert < 10^{-6}$. The elastica under an end moment rolls into the exact
circular arc up to $\varphi = 1.5\pi$ (`nl_corot2d_elastica_end_moment_rolls_up`).

---

## 4. Co-rotational frame, 3D

### 4.1 Rotation parametrization

The nodal rotation DOFs are **total rotation vectors updated additively**:
$\theta \leftarrow \theta + \Delta\theta$. There are no quaternions, no incremental
(multiplicative) update, and no tangent operator $T_s(\theta)$. The update is exact for rotations
about a fixed axis. For non-coaxial rotations, an additive increment of the rotation vector is not
the spatial spin (Crisfield vol. 2 §16, Battini–Pacoste 2002). The work conjugate of an applied
nodal "moment" on these DOFs is a spatial moment only to first order in the rotation (NL-3).

### 4.2 Co-rotated frame and natural deformations

1. **Initial frame.** $R_0 = [e_x^0, e_y^0, e_z^0]$ comes from `compute_local_axes_3d`. Its local-y
   reference is resolved once from the initial geometry (`corot_local_y_ref`), so the default
   rule's vertical-member branch cannot switch during iteration.
2. **Current frame** (`corotated_axes_3d`). The initial frame is turned by the *mean* end rotation
   $\bar\psi = (\theta_i + \theta_j)/2$ (Rodrigues). It is then turned by the smallest rotation
   that takes its $x$ axis onto the current chord $e_x = \Delta x/l$. This gives
   $R_n = [e_x, e_y, e_z]$. It is exact for rotations about one axis, and it carries the mean
   twist.
3. **Rigid rotation.** $\beta = \log(R_nR_0^{\mathsf T})^\vee$ is the exact logarithmic map
   (`rotation_vector`), including the $\theta \approx \pi$ branch. It is expressed in co-rotated
   axes, $\beta_\ell = R_n^{\mathsf T}\beta$.
4. **Natural deformations.**

$$
d_n = [0,0,0,\ R_n^{\mathsf T}\theta_i - \beta_\ell,\ \bar u,0,0,\ R_n^{\mathsf T}\theta_j - \beta_\ell],\qquad \bar u = l - L_0 .
$$

The deformational rotations are formed by **vector subtraction** of rotation vectors, not by
$\log(R_n^{\mathsf T}R(\theta_i)R_0)$. This is exact for a rigid motion: then
$\theta_i = \theta_j = \beta$ and $R_n = R(\beta)R_0$. It is also exact for coaxial rotations.
Otherwise the error is $O(\lvert\theta\rvert\,\lvert\bar\theta\rvert)$ (NL-3).

### 4.3 Forces and tangent

$f_\ell = k_\ell d_n$, where $k_\ell$ is the 12×12 linear frame (`frame_local_stiffness_3d`) at
$L_0$, with Timoshenko $\phi_{y,z}$ and condensed releases. The end shears are then rescaled by
$L_0/l$ (`current_length_shears`), so that $V = (M_1+M_2)/l$ balances on the current chord. Then
$f_\text{int} = T_n^{\mathsf T}f_\ell$ with $T_n = \operatorname{diag}(R_n^{\mathsf T},\dots)$.

The tangent is

$$
K_T = T_n^{\mathsf T}\bigl(k_\ell + k_G(N, l)\bigr)T_n ,\qquad N = -f_{\ell,1},
$$

with $k_G$ the condensed Przemieniecki matrix evaluated at the current length. This is an
**updated-Lagrangian approximation**, not the derivative of $f_\text{int}$. It omits
$\partial T_n/\partial u$ acting on $f_\ell$ (the moment terms that the 2D element has),
$\partial d_n/\partial u$ beyond first order, and the $L_0/l$ shear scaling. Equilibrium is still
solved exactly, because the residual is exact, but Newton converges linearly once $M$ is large
(NL-2).

Warping (7-DOF) models are refused, and so are shells, prescribed displacements and thermal loads.
Trusses use §3.2. Member forces are $f_\ell$ plus the linear fixed-end forces at zero
displacement (`compute_corotational_forces_3d`).

### 4.4 Objectivity and releases

Check (`nl_corot3d_solution_is_frame_invariant`): a cantilever under bending loads in both planes
plus torsion has a tip rotation of about 0.5 rad. Solved in three rotated frames, it gives
$Q\,u$ and $Q\,\theta$ to $10^{-6}$. The existing
`corotational_3d_planar_portal_matches_2d_with_and_without_releases` checks the 3D element
against the 2D one in any vertical plane, with pinned beams.

Released members: a Gerber beam with a released member end matches the linear solution at small
load (`nl_corot3d_released_member_small_load_matches_linear`). The leaning-column reproduction in
[SYMBOLIC.md](../verification/SYMBOLIC.md) item 5 (`corotational_3d_leaning_column_matches_pdelta`,
still `#[ignore]`d in `geometric_stiffness_releases.rs`) **passes at this revision**. The three
changes documented in the code comments are the plausible cause: $\beta$ is now projected to the
co-rotated frame before it is subtracted, the log map replaces $\sin\theta$, and the shears are
balanced on the current length. Each of them affected a pin-ended member, whose chord rotation is
large relative to its node rotation (NL-7).

---

## 5. Path following (`arc_length.rs`)

Both procedures use the 2D co-rotational element of §3, so the wrap fix of NL-1 applies to them
too.

**Arc-length (spherical, Crisfield vol. 1 ch. 9).** The constraint is
$\lVert\Delta u\rVert^2 + \Delta\lambda^2\lVert F\rVert^2 = \Delta s^2$, that is $\psi = 1$ with
the load term scaled by $\lVert F\rVert^2$. Displacements (m and rad) are mixed with $\lambda F$
(kN), so the constraint depends on the units (NL-12).

- **Predictor.** $\delta\hat u = K_T^{-1}F$ and $\Delta\lambda = \pm\Delta s/\sqrt{\lVert\delta\hat u\rVert^2+\lVert F\rVert^2}$.
  The sign is that of $\Delta u_\text{prev}\cdot\delta\hat u + \Delta\lambda_\text{prev}\Delta\lambda\lVert F\rVert^2$.
- **Corrector.** $\delta u = \delta u_R + \delta\lambda\,\delta u_F$. The quadratic
  $a\,\delta\lambda^2 + b\,\delta\lambda + c = 0$ has
  $a = \lVert\delta u_F\rVert^2 + \lVert F\rVert^2$,
  $b = 2[(\Delta u + \delta u_R)\cdot\delta u_F + \Delta\lambda\lVert F\rVert^2]$ and
  $c = \lVert\Delta u+\delta u_R\rVert^2 + \Delta\lambda^2\lVert F\rVert^2 - \Delta s^2$
  (checked against Crisfield (9.21)).
- **Root choice.** The code takes the root with the larger $\Delta u\cdot\delta u$, which is
  Crisfield's angle criterion without its $\psi^2\Delta\lambda\,\delta\lambda\lVert F\rVert^2$
  term. If $b^2 < 4ac$ it takes $-b/2a$, which does not satisfy the constraint.
- **Step control.** $\Delta s$ doubles if the step needed $\le$ target/2 iterations and halves if
  it needed $>$ 2·target. A failed step halves $\Delta s$, down to `min_ds`.

The `control_displacement` reported for each step is `u_full[0]`, the first free DOF, which is not
a chosen control DOF. Reactions are not reported.

**Displacement control.** $\delta\lambda = (u_c^\ast - u_c - \delta u_{R,c})/\delta u_{F,c}$
(Batoz–Dhatt). Inclined supports are refused.

---

## 6. Lumped plasticity, secant ("material nonlinear", `material_nonlinear.rs`)

### 6.1 What the code does

Each frame member carries two flags, `yielded_start` and `yielded_end`. After every Newton update,
each end is tested with the **elastic** end forces of the linear recovery
(`compute_internal_forces_2d/3d`):

$$
\text{2D: } \Bigl(\frac{N}{N_p}\Bigr)^2 + \frac{\lvert M\rvert}{M_p} > 1,\qquad
\text{3D: } \Bigl(\frac{N}{N_p}\Bigr)^2 + \frac{\lvert M_y\rvert}{M_{py}} + \frac{\lvert M_z\rvert}{M_{pz}} > 1 .
$$

If either end yields, the **whole member** gets $I \to \alpha I$ (both $I_y$ and $I_z$ in 3D), with
$\alpha$ = `alpha` of the material model, default 0.01. The "internal force" is the total secant
$f_\text{int} = K(\text{flags})\,u$, and the "tangent" is the same $K$.

This is a nonlinear-elastic secant model, not plasticity:

- there is no plastic deformation and no unloading;
- the moment of a yielded member is not held at $M_p$;
- the flags are set from the elastic $K_\text{el}u$, which grows by $1/\alpha$ once the member has
  softened, so a member never returns to elastic.

### 6.2 Consequences (see NL-4..6)

- The load–deflection curve jumps at first yield. Just past it, the deflection grows by roughly
  $1/\alpha$: ×59 for a 1% load step across yield on a cantilever
  (`nl_material_2d_response_is_continuous_at_first_yield`). A bilinear hinge would give about
  1.02.
- Reported member forces are $K_\text{el}u$, not the forces in equilibrium. A determinate
  cantilever reports $M = 100\,PL$ at the base, while the reactions (from $K(\text{flags})u$) give
  $PL$ (`nl_material_2d_member_forces_balance_the_reactions`).
- 2D and 3D used different surfaces for the same planar state (NL-6, fixed): at $N = 0.5N_p$,
  $M = 0.7M_p$ the 2D utilization was 0.95 and the 3D one 0.74. 3D now adds the two moment terms
  linearly, so it is the 2D surface for bending about one axis
  (`nl_material_2d_and_3d_use_the_same_yield_surface`).

`plastic_rotation_*` in `element_status` is reported, but the formulation has no plastic rotation
behind it.

---

## 7. Plastic hinges, event-to-event (`plastic.rs`, `plastic_3d.rs`)

The members are rigid-perfectly-plastic at hinges and linear elastic elsewhere. Loading is
proportional, $\lambda P$. At each event the solver:

1. solves the current structure, with every active hinge modelled as a release, under the unit
   load;
2. finds the smallest $\Delta\lambda$ that brings any section to the yield surface. The sections
   are member ends plus interior extrema, located by sampling and golden-section search on the
   exact moment diagram. A hinge inside a span splits the member;
3. accumulates the moments: $M \leftarrow M + \Delta\lambda\,M_\text{unit}$.

An active hinge holds the moment it had when it formed. This gives a statically admissible field
at every event, so the collapse factor is a **lower bound** (static theorem) as long as no warning
is raised.

- **2D yield.** $\lvert M(x)\rvert \le M_p$, bending only, no N–M interaction.
  $\Delta\lambda = (\pm M_p - M_\text{acc})/M_\text{unit}$, with the sign the moment is moving in
  (`increment_to_mp`). The default $M_p$ is $f_y bh^2/4$ for a rectangle. Otherwise it is
  $1.15\,f_y I/(h/2)$ with $h = \sqrt{12I/A}$. That estimate is conservative for I, circular and
  tubular sections, by about 30% for an I (NL-15).
- **3D yield.** $(M_y/M_{py})^2 + (M_z/M_{pz})^2 \le 1$. $N$, shear and torsion are unlimited.
  $\Delta\lambda$ is the larger root of the quadratic along $M_\text{acc} + \Delta\lambda M_\text{unit}$
  (`increment_to_yield`). A hinge releases both bending rotations and keeps the moment **vector**
  it formed with. The plastic rotation direction is whatever the structure imposes, and the moment
  does not move along the surface, so **normality is not enforced**. The result is still a lower
  bound, but it can be below the associated-flow collapse load (NL-15).
- **Unloading and reloading.** A hinge whose rotation would reverse is closed: the test is
  $m\,\theta<0$ in 2D, and in 3D the normal $\nabla f\cdot M_\text{unit} < 0$ with $\nabla f$ the
  outward normal. A closed hinge that sits on the surface and would be loaded outward reopens.
  Mechanisms come from the rank check (`analyze_kinematics_2d`) in 2D, and from soft-spring solves
  plus nodal balance (`carry`, `balanced`) in 3D. In 3D, constraints, connectors and support
  springs are refused.

---

## 8. Fiber solver, global loop (`fiber_nonlinear.rs`)

The element, its section integration and its material laws are in
[special-elements.md §4](special-elements.md#4-fiber-beam-column-element). The global loop is §1.1
with small displacements: $u_\ell = Tu$ uses the initial $T$, so there is no geometric
nonlinearity. Each Newton iteration resets the fiber histories to the state committed at the last
converged increment. The trial state of the converged iterate is then committed (SP-6). Member
forces are the element resisting forces $q$ at the converged state plus the member-load FEF
(`fiber_member_forces_2d/3d`, SP-7). Reactions are not returned (SP-18). Hinges, shear deformation
and prescribed displacements are refused.

Checks:

- `nl_fiber_end_moment_matches_section_law`: the EPP rectangle law
  $\kappa/\kappa_y = (3-2M/M_y)^{-1/2}$ under an end moment holds to $2\times10^{-3}$ in 1 or 20
  increments, with full or modified Newton. Modified Newton contracts by about 0.9 per iteration
  here.
- `nl_fiber_one_increment_matches_many`: a propped cantilever at $0.95P_c$ gives the same answer
  in 1 and in 40 increments.
- `nl_fiber_member_forces_are_section_resultants`: member $M$ equals the applied moment past yield.

---

## 9. Contact, gaps, tension/compression-only (`contact.rs`)

The formulation is **small displacement with an active set**. Each pass solves the linear model
in the current contact state. Deactivated members are removed by reassembling without them, and
closed gaps and node-to-surface pairs are added as **penalty** springs. The statuses are updated
from that solution, and the passes repeat until no status changes.

- **Gap** (node pair, global direction $d$, opening $g_0$, stiffness $k$). It is closed when
  $u_{j,d} - u_{i,d} < -g_0$. Closed, it adds $k$ on the pair and the force $kg_0$, which together
  give a compressive force $k(u_{i,d}-u_{j,d}-g_0)$ that acts from the moment of closure.
- **Node-to-surface (2D).** The slave node is projected onto the current master segment, giving
  the normal $n$ and parameter $\xi$. With $N = [n, -(1-\xi)n, -\xi n]$ the linearized gap is
  $g = g_0 + N^{\mathsf T}u$, where $g_0$ is measured on the undeformed geometry along the current
  normal. The penalty adds $kNN^{\mathsf T}$ and $-k g_0 N$. Contact is active when $g<0$.
- **Augmented Lagrangian** (optional). After the inner loop,
  $\lambda \leftarrow \lambda + \rho\,k\,\text{penetration}$, repeated up to `al_max_iter`.
- **Coulomb friction.** In the stick state, a tangential spring of stiffness $\mu k$ (not a
  separate tangential penalty) acts on the **total** tangential displacement, measured from zero
  rather than from the point of closure. In the slip state the force is $\mp\mu N$, with $N$ from
  the previous iterate (`next_slip`). It is not a return mapping, and it has no slip history
  between load cases.
- **Tension-only / compression-only members.** They are deactivated by the sign of the elastic
  $N$.
- **Uplift supports (2D).** This is an outer loop that swaps the support type: a support with a
  tensile reaction lifts off, and a lifted node that comes back below its seat bears again. In 3D
  uplift supports are refused.
- **Chattering.** After `max_flips` changes the status of a gap or pair is frozen. A frozen status
  no longer counts as a change, so the loop can return `converged = true` with a state that does
  not match its own solution (a closed gap in tension, an open gap that penetrates). The only sign
  is a text diagnostic (NL-13). Optional damping adds $c(u-u_\text{prev})$ to oscillating gaps
  during iteration only.

---

## 10. Line search and adaptive stepping

Neither is called by any solver. They are library utilities, tested only in
`tests/validation/domains/solver/line_search.rs`.

- `armijo_backtrack` tests $E(u+\alpha\Delta u) \le E(u) + c_1\alpha\,E'(0)$ with
  $E = \tfrac12\lVert R\rVert^2$. The slope helper `directional_derivative` returns
  $-R\cdot\Delta u$, which is the slope of the potential energy. The slope of $E$ is
  $-R^{\mathsf T}K_T\Delta u$, which equals $-\lVert R\rVert^2$ for the Newton step. The two differ
  in value and in units (NL-8).
- `AdaptiveStepper` doubles or halves $\Delta\lambda$ by iteration count, the same rule as the
  arc-length $\Delta s$.

## 11. Imperfections

- **Geometric** (`apply_geometric_imperfections_*`): node coordinates are shifted before the
  analysis. In 2D, `NodeImperfection.dy` shifts $z$.
- **Notional loads** (`notional_loads_*`): $H = r\,\lvert F_g\rvert$ at each node, in the $+$
  `direction`. $F_g$ is the sum of the **nodal** loads along `gravity_axis`. Member loads are
  ignored, so a frame loaded by member loads gets no notional loads (NL-10). `gravity_axis`
  defaults to 1, which is $Z$ in 2D but $Y$ in 3D, so a default 3D definition finds no gravity
  (NL-9).
- **Residual stresses** (`apply_*_residual_stress`). These functions have no callers.
  `solve_with_imperfections_2d/3d` reads `residual_stresses` and `initial_displacements` and then
  ignores both, running a *linear* solve. The functions store $\sigma_r/E$ as a fiber strain, which
  the next material call overwrites, so the stress is lost (NL-11). The ECCS pattern is linear in
  $z$ across the whole section, $-\sigma$ at one edge and $+\sigma$ at the other. That is neither
  the ECCS distribution (tips +, centre −) its comment describes nor self-equilibrated in moment.

---

## 12. Limits of validity

| Procedure | Valid for | Not valid for |
|---|---|---|
| P-Delta | moderate sway, $P < P_\text{cr}$, small rotations (one cubic per member: mesh long columns) | large rotations, post-buckling |
| Co-rotational 2D | arbitrary rigid rotation, small strain; Euler–Bernoulli or Timoshenko local element | dead (non-follower) loads only; member-load reporting under large rotation (NL-14) |
| Co-rotational 3D | rigid rotations of any size; planar or moderately 3D deformation | large non-coaxial rotations with large deformation (NL-3); warping; follower moments |
| Arc-length | limit points of 2D co-rotational models | snap-back with the units-mixed constraint when $\lVert F\rVert$ dominates (NL-12) |
| Material nonlinear | bracketing a collapse load (existing validation tests) | displacements, member forces or anything past first yield (NL-4, NL-5) |
| Plastic event-to-event | first-order collapse load (lower bound), bending-dominated frames | N–M interaction; 3D associated flow |
| Fiber | distributed plasticity at small displacement | geometric nonlinearity; hinges, shear |
| Contact | small displacement, frictionless or simple Coulomb | large sliding; chattering states (NL-13) |

---

## 13. Verification map

| Statement | Test |
|---|---|
| 2D co-rotational $K_T = \partial f_\text{int}/\partial u$, symmetric, with hinge and Timoshenko | `derivation_nonlinear.rs::nl_corot2d_tangent_is_the_derivative_of_the_internal_forces` |
| 2D rigid motion of any size is stress-free | `nl_corot2d_rigid_body_motion_is_stress_free` |
| 2D right-to-left cantilever = mirror image | `nl_corot2d_cantilever_drawn_right_to_left_matches_mirror` |
| 2D elastica, end moment, up to $1.5\pi$ | `nl_corot2d_elastica_end_moment_rolls_up`; also `validation/domains/nonlinear/corotational.rs::validation_corotational_mattiasson_elastica` |
| 3D frame invariance at ~0.5 rad | `nl_corot3d_solution_is_frame_invariant` |
| 3D = 2D for planar frames, with releases | `nonlinear_solver_findings.rs::corotational_3d_planar_portal_matches_2d_with_and_without_releases` |
| 3D released member, small load = linear | `nl_corot3d_released_member_small_load_matches_linear`; `geometric_stiffness_releases.rs::corotational_3d_leaning_column_matches_pdelta` (ignored, passes) |
| P-Delta = beam-column closed form; buckling = Euler | `nl_pdelta_matches_beam_column_and_buckling` |
| P-Delta certified error bounds, sparse/dense parity | `certify_nonlinear.rs::certify_pdelta_*`; `pdelta.rs` inline tests; `pdelta_model_diagnostics.rs` |
| P-Delta with released members (leaning column $B_2$) | `geometric_stiffness_releases.rs::a_leaning_column_amplifies_the_sway_by_its_string_stiffness`, `plane_leaning_column_*` |
| Fiber section law, increment independence, member forces | `nl_fiber_end_moment_matches_section_law`, `nl_fiber_one_increment_matches_many`, `nl_fiber_member_forces_are_section_resultants` |
| Plastic collapse loads | `certify_plastic.rs`, `certify_plastic_3d.rs`, `validation/domains/nonlinear/plastic_*.rs` |
| Contact against equivalent linear models | `nonlinear_solver_findings.rs::contact_2d_*` |
| Arc-length / displacement control | `validation/domains/solver/arc_length.rs` (qualitative: monotonicity, a limit point exists) |

**Gaps.** No test checks:

- the 3D co-rotational tangent, which is not exposed publicly;
- a genuinely 3D large-rotation benchmark (for example the 45° bend of Bathe–Bolourchi);
- the arc-length limit load against a closed form (for example the von Mises truss);
- contact friction under load reversal;
- the 3D plastic solver against an associated-flow reference.

---

## References

- M.A. Crisfield, *Non-linear Finite Element Analysis of Solids and Structures*, vol. 1 (1991), ch. 7 (co-rotational beam), ch. 9 (arc-length); vol. 2 (1997), ch. 16–17 (3D rotations).
- J.-M. Battini, C. Pacoste, "Co-rotational beam elements with warping effects in instability problems", CMAME 191 (2002).
- J.S. Przemieniecki, *Theory of Matrix Structural Analysis* (1968): geometric stiffness.
- W. McGuire, R.H. Gallagher, R.D. Ziemian, *Matrix Structural Analysis*, 2nd ed. (2000): P-Delta, event-to-event hinge analysis.
- J.-L. Batoz, G. Dhatt, "Incremental displacement algorithms for nonlinear problems", IJNME 14 (1979).
- E. Spacone, F.C. Filippou, F.F. Taucer, "Fibre beam-column model for non-linear analysis of R/C frames", EESD 25 (1996).
- J.C. Simo, T.J.R. Hughes, *Computational Inelasticity* (1998): return mapping.
- P. Wriggers, *Computational Contact Mechanics*, 2nd ed. (2006): penalty, augmented Lagrangian, Coulomb friction.
- B.G. Neal, *The Plastic Methods of Structural Analysis* (1977).
- J. Nocedal, S. Wright, *Numerical Optimization* (2006), ch. 3.

---

## Discrepancies and open questions for review

**NL-1. 2D co-rotational chord rotation across the atan2 branch cut. FIXED.**

- *Problem.* $\beta = \operatorname{atan2}(\text{current}) - \operatorname{atan2}(\text{initial})$
  jumps by $2\pi$ when the chord crosses the $-x$ axis. $\theta - \beta$ was used without
  reduction.
- *Effect.* A member drawn right to left ($\alpha_0 = \pi$) whose chord turned counter-clockwise
  by any amount got $2\pi$ of bending. A cantilever fixed at its right end and loaded downward did
  not converge. A member turned rigidly by more than $\pi$ carried forces (142 654 kN at
  $\psi = 4$).
- *Fix.* $\bar\theta = \operatorname{wrap}(\theta-\beta)$ in `assemble_frame_corotational` and
  `compute_corotational_forces` (`wrap_angle`). Arc-length and displacement control use the same
  element.
- *Tests.* `nl_corot2d_rigid_body_motion_is_stress_free`,
  `nl_corot2d_cantilever_drawn_right_to_left_matches_mirror`,
  `nl_corot2d_elastica_end_moment_rolls_up` (fails at $\varphi = 1.5\pi$ before the fix).

**NL-2. 3D co-rotational tangent is approximate. DOCUMENTED-CHOICE.**

- *Problem.* $K_T = T_n^{\mathsf T}(k_\ell + k_G)T_n$ omits $\partial T_n/\partial u$ acting on
  $f_\ell$, the moment terms, and the $L_0/l$ shear scaling (§4.3).
- *Effect.* Converged answers are unaffected because the residual is exact, but convergence is
  slower than quadratic and the tangent cannot be used for stability (sign of $\det K_T$).
- *Test.* None: the 3D element assembly is not public.

**NL-3. 3D rotations are additive total rotation vectors. OPEN.**

- *Problem.* The deformational rotations are $R_n^{\mathsf T}\theta - \beta_\ell$ (vector
  subtraction, §4.1–4.2).
- *What is exact.* Rigid motions and coaxial rotations; frame invariance holds
  (`nl_corot3d_solution_is_frame_invariant`).
- *What is not.* For large non-coaxial rotations, applied nodal moments are not spatial moments
  and the deformational rotations carry an $O(\theta\bar\theta)$ error.
- *Question for the reviewer.* Should the element move to a multiplicative update (Battini–Pacoste
  or Crisfield vol. 2), or should its validity be limited and gated?
- *Test.* None against a 3D reference such as Bathe–Bolourchi.

**NL-4. Material-nonlinear member forces are the elastic $K_\text{el}u$. OPEN.**

- *Problem.* The forces the solve balanced are $K(\text{flags})u$, but the reported member forces
  are $K_\text{el}u$.
- *Effect.* A yielded determinate cantilever reports 101 250 kN·m at its base, against
  $PL$ = 1012.5 kN·m from statics and from the reactions. The yield flags and `utilization` use
  the same inflated values.
- *Test.* `nl_material_2d_member_forces_balance_the_reactions` (ignored).

**NL-5. Material-nonlinear solver is a whole-member secant ($EI\to\alpha EI$), not plasticity. OPEN.**

- *Effect.* The response is discontinuous at first yield: ×59 deflection for a 2% load change. It
  has no plastic deformation, no unloading, and no moment capped at $M_p$.
- *Question for the reviewer.* The fix is a formulation change, for example a bilinear hinge with
  a return map or the fiber element. Should the solver be replaced, or restricted to
  collapse-load bracketing?
- *Test.* `nl_material_2d_response_is_continuous_at_first_yield` (ignored).

**NL-6. 2D and 3D material-nonlinear yield surfaces differ. FIXED (#429).**

- *Problem.* 2D uses $(N/N_p)^2 + \lvert M\rvert/M_p$ and 3D used
  $(N/N_p)^2 + (M_y/M_{py})^2 + (M_z/M_{pz})^2$. The same planar state gave 0.95 in 2D and 0.74
  in 3D. Under $N = 0.5N_p$ a 3D member bent about one axis yielded at $\sqrt{0.75}\,M_p$ instead
  of $0.75\,M_p$ (15% later; the ratio $1/\sqrt{1-n^2}$ grows without bound as $n \to 1$), and
  under equal biaxial moments it yielded at $0.71\,M_p$ about each axis instead of $0.5\,M_p$.
- *Effect.* The 3D surface was unconservative against the rectangle's exact interaction.
- *Fix.* 3D uses $(N/N_p)^2 + \lvert M_y\rvert/M_{py} + \lvert M_z\rvert/M_{pz} \le 1$, in
  yield detection and in the reported utilization (from the reported secant forces, NL-4). For
  bending about one axis it is the 2D surface. For a given $N$ it is the straight chord between
  the two uniaxial points $(1-n^2)M_{py}$ and $(1-n^2)M_{pz}$, which lies inside any convex
  section interaction through those points, so it yields no later than either uniaxial limit
  implies. For the rectangle the uniaxial points are exact and the exact biaxial interaction is
  convex, so the surface is inside or on it.
- *Still open (2D and 3D alike).* The axial term $(N/N_p)^2$ is the rectangle's. For the strong
  axis of an I-section the exact interaction is close to $M/M_p = 1.18(1-n)$, below
  $1 - n^2$ for $n \gtrsim 0.18$ (0.59 against 0.75 at $n = 0.5$), so with high axial force both
  solvers yield later than an I-section does. Making the surface section-dependent is a change to
  both solvers, not part of this fix.
- *Tests.* `nl_material_2d_and_3d_use_the_same_yield_surface`,
  `nl_material_3d_uniaxial_yields_at_the_2d_load`,
  `nl_material_3d_biaxial_yields_no_later_than_the_uniaxial_limits`,
  `nl_material_3d_utilization_matches_hand_calculation` (`engine/tests/derivation_nonlinear.rs`).

**NL-7. SYMBOLIC.md item 5, 3D co-rotational on pin-ended members. FIXED at this revision (not by this work).**

- *Status.* `corotational_3d_leaning_column_matches_pdelta` now passes. Its `#[ignore]` has been
  removed, so it is a regular regression test, and SYMBOLIC.md item 5 has been updated.
- *Likely cause.* The $\beta$ projection, the log-map and the current-length-shear changes in
  `corotational.rs` (§4.4). This was not bisected.
- *Tests.* `nl_corot3d_released_member_small_load_matches_linear` also covers released members.

**NL-8. `line_search::directional_derivative` returns $-R\cdot\Delta u$. OPEN, unused code.**

- *Problem.* The slope of $\tfrac12\lVert R\rVert^2$ is $-R^{\mathsf T}K_T\Delta u$.
- *Effect.* For $K_T = 3$ the helper gives −0.963 and the true slope is −2.89. No solver calls it.
- *Test.* `nl_line_search_slope_is_the_derivative_of_the_residual_energy` (ignored).

**NL-9. `NotionalLoadDef.gravity_axis` defaults to 1, which is $Y$ in 3D. OPEN.**

- *Effect.* With Z up, a default 3D notional-load definition produces no loads, silently.
- *Fix suggested.* Make the field `Option<usize>` with a per-dimension default. This changes a
  shared type, so it was left to review.
- *Test.* `nl_notional_loads_3d_default_gravity_is_z` (ignored).

**NL-10. Notional loads ignore member loads. OPEN.**

- *Problem.* Gravity is read only from nodal loads.
- *Effect.* A beam loaded by a 10 kN/m member load gets 0 instead of $r \times 60$ kN.
- *Test.* `nl_notional_loads_include_member_gravity_loads` (ignored).

**NL-11. Residual stresses and initial displacements are never applied. OPEN.**

- *Problem.* `solve_with_imperfections_2d/3d` (`lib.rs`) reads them and drops them. The residual
  helpers have no callers and do not persist the stress.
- *Effect.* $\sigma = 0$ at zero strain after a −75 MPa residual stress. The ECCS pattern is not
  the documented one (§11).
- *Test.* `nl_residual_stress_survives_the_first_evaluation` (ignored).

**NL-12. Arc-length constraint uses $\psi = 1$ in mixed units. DOCUMENTED-CHOICE.**

- *Details.* The root choice drops the load term, the $b^2<4ac$ fallback violates the constraint,
  `control_displacement` is `u_full[0]`, and no reactions are reported.
- *Test.* None quantitative (gap, §13).

**NL-13. Contact status frozen after `max_flips` still counts as converged. OPEN.**

- *Evidence.* Code path, `solve_contact_2d`: a frozen gap sets no `any_change`, so the inner loop
  ends with `converged = true` and only a diagnostic string.
- *Test.* None (a chattering model is needed).

**NL-14. Co-rotational member loads are dead loads in the initial frame. DOCUMENTED-CHOICE.**

- *Problem.* The reported member forces subtract the FEF in the co-rotated frame.
- *Effect.* Under large chord rotation $\beta$, the member-load share of the reported end forces
  is rotated by $\beta$ relative to the equilibrium that was solved.
- *Test.* None.

**NL-15. Plastic hinge solvers have no N–M interaction, and 3D hinges keep a frozen moment vector. DOCUMENTED-CHOICE.**

- *Effect.* There is no normality in 3D. The answer stays a lower bound but may be below the
  associated-flow collapse load. The default $M_p$ for non-rectangular sections uses a
  shape-factor estimate that is conservative for the usual shapes.
- *Tests.* Existing `certify_plastic*.rs` cover collapse loads.

**NL-16. P-Delta is Picard iteration with a displacement-norm test. DOCUMENTED-CHOICE.**

- *Details.* $N = EA\Delta/L$ is the length-average axial force. $B_2$ uses the 5%/5% filters of
  §2.2.
- *Test.* `nl_pdelta_matches_beam_column_and_buckling`.

**NL-17. Unconverged runs of the material-nonlinear and fiber solvers. OPEN.**

- *Material nonlinear.* After an unconverged increment it carries on to the full load. It reports
  `load_factor` = last converged increment, but displacements and forces from the final,
  unconverged iterate at full load.
- *Fiber.* It stops and reports the unconverged iterate, without a load factor.
- *Comparison.* The co-rotational solvers report the last converged state together with its
  loads.
- *Evidence.* Code path only.
