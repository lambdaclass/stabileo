# Geometric stiffness, mass and dynamics

This file covers what the frame and truss elements contribute to stability and dynamics, and
the solvers built on them:

- the geometric stiffness $K_G$ of frames, trusses and cables (2D and 3D), with releases;
- the consistent and lumped mass of frames and trusses (2D and 3D), including the warping member;
- linear buckling, modal analysis, response spectrum, time integration, Rayleigh damping,
  steady-state harmonic response, Guyan and Craig–Bampton reduction;
- the eigensolvers these call.

Shell geometric stiffness and shell mass are in [shells.md](shells.md). Element stiffness, local
axes, DOF ordering and releases are in [frames.md](frames.md). Constraints, inclined supports and
the free-DOF numbering are in [assembly-constraints.md](assembly-constraints.md). P-Delta and
co-rotational analysis are in [nonlinear.md](nonlinear.md).

Units throughout: lengths in m, $E$ input in MPa and multiplied by 1000 (kN/m²), density input in
kg/m³ and divided by 1000 (t/m³ = kN·s²/m⁴). Masses are therefore in t, forces in kN,
$\omega^2 = \lambda$ in s⁻².

| Topic | Source |
|---|---|
| Frame/truss $K_G$ | `engine/src/solver/geometric_stiffness.rs`: `frame_kg_local_2d`, `frame_kg_local_3d`, `condense_kg_plane`, `truss_kg_2d`, `truss_kg_3d`, `emit_geometric_stiffness_2d/3d`, `build_kg_from_forces_2d/3d`, `geometric_stiffness_terms_2d/3d`, `frame_geometric_end_forces_2d/3d` |
| Mass | `engine/src/solver/mass_matrix.rs`: `frame_consistent_mass`, `truss_consistent_mass`, `frame_consistent_mass_3d`, `frame_consistent_mass_3d_warping`, `assemble_mass_matrix_2d/3d(_sparse, _inclined, _block)`, `compute_total_mass(_3d)` |
| Buckling | `engine/src/solver/buckling.rs`: `buckling_system_2d/3d`, `solve_buckling_2d/3d` |
| Modal | `engine/src/solver/modal.rs`: `solve_modal_2d/3d` |
| Response spectrum | `engine/src/solver/spectral.rs`: `solve_spectral_2d/3d`, `interpolate_spectrum`, `combine_srss`, `combine_cqc` |
| Time history | `engine/src/solver/time_integration.rs`: `solve_time_history_2d/3d(_traced)`, `scheme_parameters`, `compute_effective_load`, `ground_influence`, `validate_integration_params` |
| Damping | `engine/src/solver/damping.rs`: `rayleigh_coefficients`, `rayleigh_from_modes(_sparse)` |
| Harmonic | `engine/src/solver/harmonic.rs`: `solve_harmonic_2d/3d`, `harmonic_modal_from_eigen`, `solve_complex_system` |
| Reduction | `engine/src/solver/reduction.rs`: `guyan_reduce_2d/3d`, `craig_bampton_2d/3d` |
| Eigensolvers | `engine/src/linalg/lanczos.rs`: `lanczos_generalized_eigen(_sparse)`, `lanczos_buckling_eigen_sparse`, `lanczos_irlm`, `dense_generalized_eigen_semidefinite`; `engine/src/linalg/jacobi.rs`: `solve_generalized_eigen` |

Tests written for this document: `engine/tests/derivation_mass_geometric_dynamics.rs` (test
names are quoted below as `dmgd::name`).

---

## 1. Geometric stiffness of frames and trusses

### 1.1 Assumptions

- Small displacements, linearised about the undeformed geometry (initial-stress matrix only).
- The axial force $P$ (tension positive) is constant along the member.
- Transverse displacement is the cubic Hermite (Euler–Bernoulli) interpolant of the end
  translations and rotations, in each bending plane separately. Shear flexibility is ignored in
  $K_G$ even for members whose elastic stiffness is Timoshenko.
- Only the axial force enters $K_G$. There are no terms in the end moments $M_y, M_z$ or the
  torque, and no Wagner term $P\,I_p/A$ on the twist (Section 1.5).

### 1.2 Derivation

The second-order part of the axial strain energy for a constant $P$ is

$$
U_G=\tfrac12\int_0^L P\left(v'^2+w'^2\right)dx .
$$

With $v=\mathbf N\,\mathbf d$, $\mathbf d=(v_1,\theta_1,v_2,\theta_2)$ and the Hermite functions
$N_1=1-3\xi^2+2\xi^3$, $N_2=L(\xi-2\xi^2+\xi^3)$, $N_3=3\xi^2-2\xi^3$, $N_4=L(\xi^3-\xi^2)$,
$K_G=P\int_0^L \mathbf N'^T\mathbf N'\,dx$:

$$
K_G^{(v)}=\frac{P}{30L}\begin{bmatrix}36&3L&-36&3L\\3L&4L^2&-3L&-L^2\\-36&-3L&36&-3L\\3L&-L^2&-3L&4L^2\end{bmatrix}.
$$

This is exactly what `frame_kg_local_2d` writes on local DOFs (1, 2, 4, 5) of $(u_1,v_1,\theta_1,u_2,v_2,\theta_2)$.
Rows 0 and 3 (axial) are zero.

`frame_kg_local_3d` writes the same block on $(v_1,\theta_{z1},v_2,\theta_{z2})$ = DOFs (1, 5, 7, 11)
and on $(w_1,\theta_{y1},w_2,\theta_{y2})$ = DOFs (2, 4, 8, 10) with the $w$–$\theta_y$ couplings
negated, because $\theta_y=-w'$ (the convention of [frames.md](frames.md#24-local-dof-ordering-and-rotation-conventions)).
Rows 0, 3, 6, 9 (axial and torsion) are zero. Test: `dmgd::kg_3d_has_bending_blocks_only`.

Trusses and cables (`truss_kg_2d`, `truss_kg_3d`, already in global axes): with $\mathbf e$ the unit
member axis and $G=I-\mathbf e\mathbf e^T$ the transverse projector,

$$
K_G=\frac{P}{L}\begin{bmatrix}G&-G\\-G&G\end{bmatrix}.
$$

Frames go to global axes as $T^TK_GT$ with the element's own transformation (`transform_stiffness`).
In models with warping DOFs (7 per node) the 12×12 $K_G$ is scattered through
`DOF_MAP_12_TO_14`; the warping DOFs get no geometric stiffness.

### 1.3 Releases (`condense_kg_plane`)

A released end rotation is not a DOF of the member. The elastic stiffness condenses it out
([frames.md §4.4](frames.md#44-member-releases-hinges)), and $K_G$ must follow, otherwise
$-4PL/30$ sits on a rotation nothing else holds. The code expresses the released rotation through
the elastic (Euler–Bernoulli) map that makes its end moment vanish, $\boldsymbol\theta=T\,\mathbf d$,
and uses $K_G^c=T^TK_GT$ on the plane $\mathbf d=(v_1,\theta_1,v_2,\theta_2)$. With $s=+1$ for the
$(v,\theta_z)$ plane and $s=-1$ for $(w,\theta_y)$:

| Release | Row replaced in $T$ |
|---|---|
| start only | $\theta_1 = \frac{3s}{2L}(v_2-v_1)-\tfrac12\theta_2$ |
| end only | $\theta_2 = \frac{3s}{2L}(v_2-v_1)-\tfrac12\theta_1$ |
| both | $\theta_1=\theta_2=\frac{s}{L}(v_2-v_1)$ |

With both ends released the block becomes the string stiffness $(P/L)[1,-1;-1,1]$ on
$(v_1,v_2)$. This is the work $\tfrac12\int P v'^2$ over the propped-cantilever (or chord) shape,
so it is still consistent; it is not the exact $K_G$ of a member with a hinge, which is the
same to first order. In 2D the hinge flags are `hinge_start`/`hinge_end`; in 3D
`release_my_*`, `release_mz_*` per plane. A torsion release has no effect on $K_G$ (there is no
torsion term). Tests: `dmgd::kg_2d_closed_form_symmetry_and_string_limit`;
`engine/tests/geometric_stiffness_releases.rs` (`plane_*`, `a_leaning_column_*`,
`a_member_released_at_one_end_buckles_as_the_pinned_column`); `tests/symbolic_elements.rs::geometric_stiffness_exact`
(all 4 + 64 release combinations against SymPy).

### 1.4 Which axial force

- **Buckling and P-Delta** (`emit_geometric_stiffness_2d/3d`): $P=EA\,(\delta/L-\alpha\,\Delta T)$
  with $\delta=u_{2}-u_{1}$ the local elongation of the linear solution and $\Delta T$ the summed
  uniform thermal loads on the member. $\alpha=12\times10^{-6}$ is hard-coded, the same constant
  the frame thermal load uses ([frames.md §7.4](frames.md#74-thermal-loads-alpha-and-depth-are-fixed-in-the-engine)).
  $EA\,\delta/L$ is the mean of $N(x)$ along the member, which is what a constant-$P$ $K_G$
  integrates; it is right also with axial point or partial loads
  (`opensees_differential_regressions.rs::buckling_uses_mean_axial_force_of_truss_with_axial_point_load`,
  `buckling_3d_uses_mean_axial_force_of_frame_with_partial_axial_load`).
- **`build_kg_from_forces_2d/3d`** (public helpers, no solver path uses them now): $P=(N_\text{start}+N_\text{end})/2$.
  Equal to the mean only when $N$ is linear.
- The per-element "critical force" in the buckling report uses the end average too, and
  $k_\text{eff}=\pi\sqrt{EI/P_{cr}}/L$ with $I=I_z$ (2D) or $\min(I_y,I_z)$ (3D). These are
  derived quantities of the first mode only, meaningful for members that take part in it.

### 1.5 What $K_G$ leaves out, and how much it matters

The full 3D initial-stress matrix of McGuire–Gallagher–Ziemian (2nd ed., eq. 9.18) has, besides
the bending blocks:

1. $P/L$ on the axial DOFs (rigid-body consistency; no effect on the linear buckling load of
   frames);
2. $P\,I_p/(A L)\,[1,-1;-1,1]$ on the twist (Wagner term, linear twist) — or
   $\frac{P I_p}{30AL}[36,3L,-36,3L;\dots]$ on $(\theta_x,\theta_x')$ for the cubic twist of the
   warping element;
3. terms in the end moments $M_{y},M_{z}$ coupling twist and bending (lateral-torsional
   buckling) and in the torque.

Stabileo has none of them (MD-1). Consequences:

- **Torsional and flexural-torsional buckling are not detected.** A doubly symmetric column has a
  pure torsional buckling load $P_T=(GJ+\pi^2EC_w/L^2)\,A/I_p$. Without term 2, $K_G$ has no twist
  entries, so the eigenproblem never finds that mode and reports the flexural load. For a
  200×10 mm cruciform, $L=1.5$ m, pinned with fork supports: $P_E=5860$ kN, $P_T=2993$ kN; the
  solver returns 5860 kN, 96% above the governing load (MD-8,
  `dmgd::cruciform_column_buckles_in_torsion`, ignored; today's value pinned by
  `dmgd::cruciform_column_today_reports_the_euler_load`). Sections at risk: cruciforms, angles,
  tees, thin open sections with low $GJ$ and $C_w$, short columns. For I and box sections in usual
  lengths $P_T\gg P_E$ and the omission does not change the first mode.
- **Lateral-torsional buckling is not detected.** A beam in pure bending has no compressed
  member and is refused ("No compressed elements", `dmgd::beam_in_pure_bending_has_no_buckling_problem`).
  A beam-column gets the axial-force $K_G$ only: its LTB interaction is ignored (unconservative
  for slender unbraced I-beams).
- **Shear flexibility in $K_G$** (the Timoshenko correction $P_{cr}\approx P_E/(1+P_E/(\kappa GA))$)
  is ignored; it matters only for very short, deep or built-up members.

### 1.6 Sign convention and the eigenproblem

$K_G$ is proportional to $P$ with tension positive, so compression makes it negative definite on
the bending DOFs. Buckling solves $K\boldsymbol\phi=\lambda(-K_G)\boldsymbol\phi$ (Section 3).

---

## 2. Mass matrices

### 2.1 Assumptions

- Kinetic energy $T=\tfrac12\int\rho A\,|\dot{\mathbf u}|^2dx$ with the same shape functions as
  the Euler–Bernoulli stiffness: linear axial, cubic Hermite transverse, linear twist (cubic twist
  for warping members). This is the consistent mass.
- **No rotary inertia** $\tfrac12\int\rho I(\dot v'^2+\dot w'^2)dx$ and no shear correction in the
  bending blocks, also for Timoshenko members (MD-3).
- Torsional inertia uses $I_p\approx I_y+I_z$ (exact for a section whose shear centre and centroid
  coincide; the section's torsion constant $J$ is not used).
- A member with **any** release is lumped: $\rho AL/2$ on each translation, nothing on the
  rotations (MD-2).
- There are **no nodal (point) masses**, no rotational nodal inertias and no conversion of loads
  to masses in the engine: mass comes only from `densities[material_id]·A·L` (frames, trusses)
  and from shell volumes. Floor finishes, partitions or a seismic mass from gravity loads must be
  modelled through density.

### 2.2 Frames (`frame_consistent_mass`, `frame_consistent_mass_3d`)

With $m=\rho A L$ (`rho_a·l`, `rho_a = density·A/1000`):

$$
M_\text{axial}=\frac{m}{6}\begin{bmatrix}2&1\\1&2\end{bmatrix},\qquad
M^{(v)}=\frac{m}{420}\begin{bmatrix}156&22L&54&-13L\\22L&4L^2&13L&-3L^2\\54&13L&156&-22L\\-13L&-3L^2&-22L&4L^2\end{bmatrix},
$$

$$
M_\text{torsion}=\frac{\rho I_pL}{6}\begin{bmatrix}2&1\\1&2\end{bmatrix},\quad \rho I_p=\rho A\,\frac{I_y+I_z}{A}.
$$

2D: $M_\text{axial}$ on (0, 3), $M^{(v)}$ on (1, 2, 4, 5). 3D: $M_\text{axial}$ on (0, 6),
$M_\text{torsion}$ on (3, 9), $M^{(v)}$ on (1, 5, 7, 11) and on (2, 4, 8, 10) with the $w$–$\theta_y$
couplings negated. The 2D matrix is exactly the axial plus $(v,\theta_z)$ part of the 3D one, so
2D and 3D models of the same plane frame have the same in-plane mass. Test:
`dmgd::consistent_mass_2d_and_3d_agree` (also checks $\mathbf r^TM\mathbf r=\rho AL$ for a rigid
translation in each direction); `symbolic_elements.rs::mass_exact`.

**Rotary inertia, quantified.** For a simply supported Rayleigh beam
$\omega_n^2=\dfrac{EIk^4}{\rho A(1+r^2k^2)}$, $k=n\pi/L$, $r^2=I/A$. Omitting it overestimates
$\omega_n$ by the factor $\sqrt{1+(n\pi r/L)^2}$. For a rectangular section ($r=h/\sqrt{12}$):

| $L/h$ | mode 1 | mode 2 | mode 3 |
|---|---|---|---|
| 20 | 0.10% | 0.41% | 0.92% |
| 10 | 0.41% | 1.6% | 3.6% |
| 5 | 1.6% | 6.4% | 13.7% |

(the table gives $\sqrt{1+(n\pi r/L)^2}-1$). Shear deformation lowers the frequencies by roughly
$2(1+\nu)/\kappa\approx3$ times as much again (Timoshenko); the stiffness can include it
([frames.md §4](frames.md#4-bending-eulerbernoulli-and-timoshenko)) but the mass never includes
the rotary term. For storey-height columns and ordinary beams ($L/h\ge10$) and the modes that
carry seismic mass the effect is below 1–2%; it matters for deep transfer girders, short shear
walls modelled as frames, and higher modes. `dmgd::modal_frequencies_are_euler_bernoulli_without_rotary_inertia`
pins the EB result on an $L/h=5$ beam with 40 elements and prints the Rayleigh factor.

### 2.3 Warping members (`frame_consistent_mass_3d_warping`)

A member whose section has $C_w>0$ in a 7-DOF model gets a 14×14 mass. The twist is the cubic
Hermite interpolant of $(\theta_{x1},\theta'_{1},\theta_{x2},\theta'_{2})$ (DOFs 3, 6, 10, 13), the same as
its stiffness ([frames.md §5](frames.md#5-torsion-with-restrained-warping-vlasov)), and
$T=\tfrac12\int\rho(I_p\dot\theta^2+C_w\dot\theta'^2)dx$ gives

$$
M_\theta=\frac{\rho I_pL}{420}\begin{bmatrix}156&22L&54&-13L\\ \cdot&4L^2&13L&-3L^2\\ \cdot&\cdot&156&-22L\\ \cdot&\cdot&\cdot&4L^2\end{bmatrix}
+\frac{\rho C_w}{30L}\begin{bmatrix}36&3L&-36&3L\\ \cdot&4L^2&-3L&-L^2\\ \cdot&\cdot&36&-3L\\ \cdot&\cdot&\cdot&4L^2\end{bmatrix}.
$$

The rest is the 12×12 matrix. With any release the member is lumped as in 2.4 (warping DOFs
massless). Non-warping members in a 7-DOF model are embedded through `DOF_MAP_12_TO_14`. Test:
`validation/domains/response/warping_torsion.rs::validation_warping_fork_beam_torsional_frequency`.

### 2.4 Released members, trusses

- Released member, 2D or 3D, warping or not: $\operatorname{diag}(m/2)$ on the translations of
  both ends, zero on every rotation and warping DOF (`dmgd::released_members_are_lumped_translations_only`).
  A torsion release lumps the whole member too. The structure stays correct to first order; the
  discretisation is coarser. On a 6-element pinned beam where the two end members carry a
  (redundant) hinge at the support, the fundamental moves from +0.01% (consistent) to about
  −0.2% of the exact value (`dmgd::lumped_end_members_change_the_fundamental_little`). A node
  reached only by released members or trusses has massless rotations; the eigensolvers handle that
  (Section 4.3).
- Trusses and cables: consistent $\frac{m}{6}[2I,I;I,2I]$ per translation, in global axes (the
  matrix is isotropic, no rotation needed).

### 2.5 Assembly

`assemble_mass_matrix_2d/3d` (dense, all DOFs), `*_sparse` (free block, lower-triangle CSC),
`*_sparse_inclined` (rotated into the inclined-support frames of $K$ by the same
`rotate_inclined_free_block` as $K$), `*_sparse_block(n_total)` (all DOFs, global axes, used for
ground-motion influence). Shells: see [shells.md](shells.md). Members with density $\le0$ are
skipped.

`compute_total_mass(_3d)` is $\sum\rho AL$ over all members plus shell area × thickness × density
(quads by two triangles on the 1–3 diagonal, quad9 by its corners only). This total, including
the part of each member's mass that sits on a support, is the denominator of the reported mass
ratios (Section 4.4).

---

## 3. Linear buckling

`buckling_system_2d/3d`:

1. Linear static solve of the load case.
2. Refuse when no member has $(N_\text{start}+N_\text{end})/2<-10^{-6}$ and (3D) no shell
   contributes to $K_G$.
3. $K$ = the linear path's sparse free-block stiffness (inclined frames, springs, constraints).
4. $K_G$ from the linear displacements (Section 1.4), all element families including shells,
   rotated into the same inclined frames, negated.

`solve_buckling_2d/3d` reduces both through the constraint transform $C$ if any ($C^TKC$,
$C^T(-K_G)C$) and solves

$$
(-K_G)\,\boldsymbol\phi=\mu\,K\,\boldsymbol\phi,\qquad \lambda=1/\mu .
$$

$K$ is SPD, $-K_G$ indefinite when the model has tension and compression together. Only
$\mu>10^{-12}$ are kept; $\mu<0$ are load reversals (the structure would buckle under the
negated load) and are discarded. Load factors are sorted ascending. Mode shapes are rotated
back to global axes and scaled to max |component| = 1.

Eigensolver (`lanczos_buckling_eigen_sparse`): $n\le200$ or $k\ge n/2$: dense
`solve_generalized_eigen(-K_G, K)` (Cholesky of $K$, Jacobi on $L^{-1}(-K_G)L^{-T}$), all
eigenvalues returned. Otherwise Lanczos on $K^{-1}(-K_G)$ with the $K$ inner product (which is
an inner product even when $-K_G$ is indefinite), largest $\mu$ first; dense fallback on failure.

Tests: `tests/core/buckling.rs` (`euler_*`, `buckling_mode_ratio_pinned_pinned`,
`buckling_no_compression_fails`), `tests/certify.rs::certify_buckling_*` (interval enclosures of
$\lambda$), `tests/inclined_support_analyses.rs::buckling_3d_inclined_support_matches_rotated_model`,
`tests/core/sparse_mass.rs::buckling_3d_survives_warping_dofs`,
`geometric_stiffness_releases.rs`, `feature_matrix_regressions.rs::buckling_2d_released_member_matches_pinned_support`.

---

## 4. Modal analysis

### 4.1 Problem

$$
K_{s}\boldsymbol\phi=\omega^2M_{s}\boldsymbol\phi,\qquad K_s=C^TK_{ff}C,\ M_s=C^TM_{ff}C,
$$

$K_{ff},M_{ff}$ the free blocks in the inclined-support frames, $C$ the constraint transform
(identity without constraints). Curved beams are expanded into straight segments first (3D).

### 4.2 Eigensolver

`lanczos_generalized_eigen_sparse` (3D always; 2D at $n_f\ge$ `SPARSE_THRESHOLD`) and
`lanczos_generalized_eigen` (2D dense branch):

- $n\le80$ or $k\ge n/2$: dense `dense_generalized_eigen_semidefinite`: Cholesky of $M$ and
  Jacobi; if $M$ is only semidefinite, the inverse problem $M\mathbf x=\mu K\mathbf x$ (Cholesky
  of $K$), $\lambda=1/\mu$ for $\mu>10^{-12}\mu_\max$. The massless DOFs are thereby condensed
  statically, exactly; no artificial mass is added.
- Otherwise shift-invert Lanczos with $\sigma=0$: operator $K^{-1}M$ (sparse Cholesky of $K$),
  $M$-inner product, full double-Gram–Schmidt reorthogonalisation, $\lambda=1/\theta$. Subspace
  $m=\max(4k,40)$; on non-convergence (residual $|\beta_m s_{mi}|>10^{-10}|\theta_i|$) the subspace
  is doubled up to $n$ instead of restarting. A $\theta=0$ (massless direction) maps to
  $\lambda=\infty$ and is skipped.
- There is no Sturm-sequence check that the $k$ returned eigenvalues are the $k$ lowest.
  Full reorthogonalisation and the growing subspace make a missed eigenvalue unlikely but not
  impossible for clustered spectra.

Modes with $\lambda\le10^{-10}$ (rigid-body or near-mechanism) or non-finite are skipped.

### 4.3 Normalisation and participation

The solver works with the eigenvector as returned (unit $M_s$-norm on the dense path) and
**publishes** the shape in global axes scaled to max |component| = 1 (inclined DOFs rotated
back first). With $\mathbf r_d$ the rigid unit translation along $d\in\{X,Y(,Z)\}$ on all
DOFs, rotated into the inclined frames and cut to the free block:

$$
L_d=\boldsymbol\phi_s^T\,C^T(M_{ff}\,\mathbf r_{d,f}),\qquad
\mathcal M=\boldsymbol\phi_s^TM_s\boldsymbol\phi_s,\qquad
\Gamma_d=\frac{L_d}{\mathcal M},\qquad
M^\text{eff}_d=\Gamma_d^2\,\mathcal M=\frac{L_d^2}{\mathcal M}.
$$

$\Gamma_d$ is then multiplied by the max-norm scale so that $\Gamma_d\boldsymbol\phi_\text{published}$
equals $\Gamma_d\boldsymbol\phi_s$ (the product spectral analysis uses); $M^\text{eff}$ is scale
invariant. The reduction $C^T(M\mathbf r)$ treats $M\mathbf r$ as the force it is (the earlier
$C^T\mathbf r$ multiplied EqualDOF participation by the number of tied nodes;
`tests/modal_constrained_participation.rs`).

Two properties a reviewer should know:

- **Sum of effective masses (MD-4, DOCUMENTED-CHOICE).** Over all modes
  $\sum_n M^\text{eff}_{d,n}=\mathbf r_{d,f}^TM_{ff}\mathbf r_{d,f}$, the mass on the free DOFs.
  The reported `mass_ratio` divides by `compute_total_mass`, which also counts member mass that
  the consistent matrix assigns to supports. A single-element cantilever can reach only
  $156/420=37\%$ (`dmgd::effective_mass_sums_to_free_mass_not_total_mass`); with $n$ elements per
  column the ceiling is roughly $1-1/(2n)$ of the column mass. This is conservative for the
  "90% of the mass" check of seismic codes, but it means coarse meshes cannot reach 90%.
- **Support-coupled inertia (MD-5, OPEN).** For a uniform support motion $\ddot u_g$ the free-DOF
  equation is $M_{ff}\ddot{\mathbf u}+K_{ff}\mathbf u=-(M_{ff}\mathbf r_f+M_{fr}\mathbf r_r)\ddot u_g$
  (relative coordinates; Chopra §9.7, the $m_g$ term). With a consistent mass $M_{fr}\ne0$ for every
  member touching a support. The time-history solver uses the full $(M\mathbf r)_f$
  (`ground_influence`); the modal $\Gamma$ uses only $M_{ff}\mathbf r_f$. Check: with all modes and
  a constant acceleration, $\sum_n\boldsymbol\phi_n\Gamma_n/\omega_n^2=K^{-1}L$ must be the static
  response to the consistent body force, which is nodally exact
  ($\rho A\ddot u_gL^4/8EI$ at a cantilever tip). The free-block $\Gamma$ gives
  $K^{-1}M_{ff}\mathbf r_f$, which for one element per column is $0.781$ of it
  (`dmgd::modal_participation_includes_support_coupled_mass`, ignored;
  `dmgd::modal_participation_today_uses_free_block_mass_only`). The error decays with mesh
  refinement (it involves only the elements touching supports) and vanishes for lumped (released)
  members; it is largest for towers, chimneys and columns modelled with one element. It propagates
  to the response spectrum through $\Gamma$ and $M^\text{eff}$.

### 4.4 Rayleigh coefficients reported by modal

`ModalResult.rayleigh` gives $a_0,a_1$ for $\xi=5\%$ anchored on the first and the **last**
computed mode. Time history and harmonic anchor on the first two modes (Section 6). The modal
value is informational only; no solver reads it.

Tests: `tests/core/modal.rs` (`modal_ss_beam_*`, `modal_cantilever_first_mode`, `modal_total_mass`,
`modal_participation_factors_exist`, `rayleigh_delivers_the_requested_ratio_at_the_real_fundamental`),
`tests/validation/domains/dynamics/modal_frequencies*.rs` (exact beam frequencies for 4 boundary
conditions, convergence, 2D/3D parity), `modal_properties.rs` (M- and K-orthogonality),
`tests/certify.rs::certify_modal_*`, `tests/core/sparse_mass.rs::generalized_eigenpairs_satisfy_their_own_equation`,
`tests/inclined_support_analyses.rs::modal_*_inclined_*`, `tests/modal_constrained_participation.rs`.

---

## 5. Response spectrum (`solve_spectral_2d/3d`)

Input: the modes (period, $\omega$, published shape, $\Gamma_d$, $M^\text{eff}_d$) of one modal run,
a spectrum $S_a(T)$, one direction $d$, a rule (SRSS or CQC, default CQC), $\xi$ (default 0.05),
importance factor $I$ and reduction factor $R$.

Per mode $n$:

$$
S_{a,n}=S_a(T_n)\cdot g^{[\text{in\_g}]}\cdot\frac{I}{R},\qquad S_{d,n}=\frac{S_{a,n}}{\omega_n^2},\qquad
\mathbf u_n=\boldsymbol\phi_n\,\Gamma_{d,n}\,S_{d,n},\qquad V_n=M^\text{eff}_{d,n}S_{a,n}.
$$

- $S_a(T)$ is linear between points and held constant outside the given range (below the first
  and above the last period). `in_g` defaults to true ($g=9.81$).
- Element forces of mode $n$ are recovered from $\mathbf u_n$ with no element loads.

Combination, for each response quantity $r$:

$$
\text{SRSS: } r=\Big(\sum_n r_n^2\Big)^{1/2},\qquad
\text{CQC: } r=\Big|\sum_i\sum_j r_i\rho_{ij}r_j\Big|^{1/2},
$$

$$
\rho_{ij}=\frac{8\xi^2(1+\beta)\beta^{3/2}}{(1-\beta^2)^2+4\xi^2\beta(1+\beta)^2},\qquad\beta=\omega_j/\omega_i .
$$

This is Der Kiureghian (1981) for equal modal damping; $\rho_{ii}=1$ and $\rho(\beta)=\rho(1/\beta)$.
Verified through the public API by `dmgd::cqc_coefficient_is_der_kiureghian_1981` (four frequency
ratios, both mode orders). Unequal modal damping is not supported (one $\xi$).

What the combination is applied to:

- **Displacements:** the signed $\mathbf u_n$ components — correct.
- **Element forces (MD-6, OPEN, conservative):** per mode the code first takes
  $\max(|r_\text{start}|,|r_\text{end}|)$ for $N$, $V$, $M$ (3D: $N,V_y,V_z,M_x,M_y,M_z$) and then
  combines those absolute values. In CQC every cross term $\rho_{ij}|r_i||r_j|$ is then
  non-negative, while the correct one has the sign of $r_ir_j$; and the two ends are mixed across
  modes. The result is an upper bound of the correct CQC (and of the correct SRSS envelope). For
  two closely spaced modes contributing with opposite sign it can be much larger: two modes at
  $\omega$ and $1.1\omega$ with opposite shapes give the base moment 2.7× its correct value while
  the tip displacement is right (`dmgd::spectral_forces_are_combined_signed_like_displacements`,
  ignored). `certify/spectral.rs` reproduces the same absolute-value rule, so a fix has to change
  both.
- **Base shear (MD-7, OPEN, unconservative):** always $\big(\sum_nV_n^2\big)^{1/2}$, also when CQC
  is requested. All $V_n>0$ in one direction, so CQC $\ge$ SRSS: for two modes at $\omega$ and
  $1.1\omega$ ($\rho=0.52$) the reported base shear is $1/1.23$ of the CQC value
  (`dmgd::spectral_base_shear_follows_the_requested_rule`, ignored). The certificate
  (`certify/spectral.rs`, "the solver always uses SRSS here") mirrors it.
- All results are unsigned envelopes. There is no directional combination (SRSS of directions or
  100/30%); each run is one direction, and combining X, Y (and Z) runs is left to the caller.
- $I/R$ scales displacements as well as forces. Codes require inelastic displacements
  ($q\cdot u$ or $C_d\cdot u$); that factor is not applied.

Tests: `tests/validation/domains/dynamics/spectral_response.rs`, `spectral_extended.rs`
(`validation_spectral_sdof_response_matches_sd`, `validation_spectral_cqc_combination`,
`validation_spectral_multi_dof_srss_combination`, …), `tests/certify_nonlinear.rs::certify_spectral_2d_honest`
(interval certificate of the solver's own rule), `inclined_support_analyses.rs::spectral_2d_inclined_roller_matches_rotated_model`,
`modal_constrained_participation.rs`.

---

## 6. Damping (`damping.rs`)

Rayleigh damping $C=a_0M+a_1K$ gives the modal ratio $\xi(\omega)=\dfrac{a_0}{2\omega}+\dfrac{a_1\omega}{2}$.
Requiring $\xi(\omega_1)=\xi(\omega_2)=\xi$:

$$
\begin{bmatrix}1/\omega_1&\omega_1\\1/\omega_2&\omega_2\end{bmatrix}\begin{bmatrix}a_0\\a_1\end{bmatrix}=2\xi\begin{bmatrix}1\\1\end{bmatrix}
\ \Rightarrow\ a_0=\frac{2\xi\,\omega_1\omega_2}{\omega_1+\omega_2},\quad a_1=\frac{2\xi}{\omega_1+\omega_2}
$$

(`rayleigh_coefficients`; Chopra eq. 11.4.9). Between $\omega_1$ and $\omega_2$ the damping is
below $\xi$; above $\omega_2$ it grows linearly (higher modes are over-damped).

`rayleigh_from_modes(_sparse)` anchors on the first two eigenvalues $>10^{-10}$ of the model
itself; with one usable mode on $(\omega_1,3\omega_1)$; without any, on the smallest
$\sqrt{K_{ii}/M_{ii}}$ and $3\times$ that (crude last resort). Used by time history and harmonic.
Modal damping (per-mode $\xi_n$) is not available as a damping matrix; the harmonic modal
superposition uses the Rayleigh $\xi_n=\xi(\omega_n)$.

Tests: inline `damping.rs::tests`, `tests/core/modal.rs::rayleigh_delivers_the_requested_ratio_at_the_real_fundamental`,
`tests/certify_dynamics.rs::hht_and_rayleigh_damping`.

---

## 7. Time integration (`time_integration.rs`)

Discrete system on the reduced space: $M_s\ddot{\mathbf u}+C_s\dot{\mathbf u}+K_s\mathbf u=\mathbf f(t)$,
all in the inclined-support frames, $C_s=a_0M_s+a_1K_s$ (Section 6) or 0.

**Loads.** Ground acceleration: $\mathbf f=-C^T(M\mathbf r)_f\,a_g(t_n)$ with the full mass product
(Section 4.3), $a_g$ in m/s², sampled per step (`ground_accel[n]`, zero beyond the record — the
record must be at the analysis $\Delta t$; nothing checks this). 3D: up to three directions
superposed. Force history: linear in time between records, linear ramp from zero before the first
record, held after the last. With neither, the static load case is applied as a step at $t=0$.

**Newmark** ($\beta,\gamma$; default $\tfrac14,\tfrac12$, average acceleration):

$$
\mathbf u_{n+1}=\mathbf u_n+\Delta t\,\mathbf v_n+\Delta t^2\big[(\tfrac12-\beta)\mathbf a_n+\beta\mathbf a_{n+1}\big],\qquad
\mathbf v_{n+1}=\mathbf v_n+\Delta t\big[(1-\gamma)\mathbf a_n+\gamma\mathbf a_{n+1}\big].
$$

**HHT-α** (Hilber–Hughes–Taylor 1977, $\alpha\in[-\tfrac13,0]$):

$$
M\mathbf a_{n+1}+(1+\alpha)(C\mathbf v_{n+1}+K\mathbf u_{n+1})-\alpha(C\mathbf v_n+K\mathbf u_n)=(1+\alpha)\mathbf f_{n+1}-\alpha\mathbf f_n,
$$

with $\gamma=\tfrac12-\alpha$, $\beta=(1-\alpha)^2/4$ (`scheme_parameters`; $\alpha$ is taken back as
$\tfrac12-\gamma$ so the relation is exact in floating point). $\alpha=0$ is Newmark.

Substituting the updates gives one linear solve per step with the constant matrix

$$
K_\text{eff}=\frac{1}{\beta\Delta t^2}M+(1+\alpha)\Big(K+\frac{\gamma}{\beta\Delta t}C\Big),
$$

factored once (sparse Cholesky; dense LU fallback up to 6000 DOFs), and right-hand side
(`compute_effective_load`)

$$
(1+\alpha)\mathbf f_{n+1}-\alpha\mathbf f_n+M\big(c_1\mathbf u_n+\tfrac{1}{\beta\Delta t}\mathbf v_n+c_3\mathbf a_n\big)
+C\big[(1+\alpha)(c_2\mathbf u_n+c_4\mathbf v_n+c_5\mathbf a_n)+\alpha\mathbf v_n\big]+\alpha K\mathbf u_n,
$$

$c_1=\frac1{\beta\Delta t^2}$, $c_2=\frac{\gamma}{\beta\Delta t}$, $c_3=\frac1{2\beta}-1$, $c_4=\frac\gamma\beta-1$,
$c_5=\frac{\Delta t}2(\frac\gamma\beta-2)$. Initial acceleration from $M\mathbf a_0=\mathbf f_0-C\mathbf v_0-K\mathbf u_0$
When $M$ is singular, the solver takes the minimum-norm solution. Massless motions get no
initial acceleration ($\mathbf a_0\perp\operatorname{null}M$), the right-hand side is projected
orthogonally onto $\operatorname{range}M$, and the massive block is solved exactly.

The null directions need not be coordinate DOFs. An oblique flat shell's drilling rotation is a
combination of $\theta_x,\theta_y,\theta_z$ even when every rotational diagonal is positive. So
each node's rotation triad is first turned to the eigenbasis of its $3\times3$ block of $M$ (an
orthogonal, coordinate-free change of basis), and zero-diagonal directions are then dropped. Before
this change, an oblique shell fell back to diagonal lumping of all of $M$: a 45°-rotated cantilever
quad's $\mathbf a_0$ was 25% off, with a residual of 0.5 in $M\mathbf a=\mathbf f$ (review of
#330, `derivation_shells.rs::shell_time_history_initial_acceleration_is_rotation_invariant`).

**Stability.** Newmark is unconditionally stable for $2\beta\ge\gamma\ge\tfrac12$; $\gamma>\tfrac12$
adds numerical damping (first order accurate); $\gamma<\tfrac12$ amplifies. The code refuses
$\gamma<\tfrac12$ (Newmark) and $\alpha\notin[-\tfrac13,0]$ (HHT), and negative $\xi$
(`validate_integration_params`; `input_validation_gates.rs::newmark_gamma_below_one_half_is_refused`,
`hht_alpha_outside_its_documented_range_is_refused`). Conditionally stable choices
($\beta<\gamma/2$, e.g. linear acceleration $\beta=\tfrac16$, stable for
$\Delta t\le\frac{\sqrt3}{\pi}T_\text{min}\approx0.551T_\text{min}$) are accepted without a warning; the
solver does not compute $T_\text{min}$. HHT with $\alpha\in[-\tfrac13,0]$ is unconditionally stable
and second-order accurate, with high-frequency dissipation growing as $\alpha\to-\tfrac13$. There is
no explicit (central-difference) scheme.

**Outputs.** Histories in global axes; peak displacements per DOF with sign; "peak reactions" are
$K_{rf}\mathbf u_f-\mathbf F_r$ at the single step where $\|\mathbf u_f\|_2$ is largest — elastic
forces only (no $M_{rf}\ddot{\mathbf u}$, no damping), and not an envelope of each reaction.
The `method` field of the input is not read (MD-10): the scheme is HHT iff `alpha` is given.

Tests: `tests/certify_dynamics.rs` (`average_acceleration_residuals_are_honest_and_small`,
`hht_and_rayleigh_damping`, `conditionally_stable_linear_acceleration`, `ground_acceleration_and_3d`
— exact rational residuals of the discrete equations), `dmgd::hht_and_newmark_parameters`,
`tests/validation/textbooks/chopra_dynamics.rs` (`validation_chopra_newmark_energy_conservation`,
`validation_chopra_hht_numerical_dissipation`, `validation_chopra_step_load_daf`),
`tests/integration/time_history_3d.rs`, `inclined_support_analyses.rs::time_history_3d_inclined_support_matches_rotated_model`.

---

## 8. Harmonic (steady-state) response (`harmonic.rs`)

For $\mathbf f\,e^{i\omega t}$ the steady state solves $(K-\omega^2M+i\omega C)\mathbf u=\mathbf f$, $C$
Rayleigh with the input $\xi$ (default 5%) anchored on the first two kept modes. The response at
one DOF $t$ (a linear functional, so a global component at an inclined support is a combination
of free DOFs) is reported as amplitude, phase $=\operatorname{atan2}(\Im,\Re)$ (a lag is negative),
real and imaginary parts.

**Modal superposition** (default). Modes with $0<\lambda_j<16\,\omega_\text{max}^2$ are kept (up to
$\min(100,n/2)$ computed). With $p_j=\phi_{jt}\boldsymbol\phi_j^T\mathbf f/m_j$ and $\xi_j=\xi(\omega_j)$:

$$
u_t=\sum_j\frac{p_j}{\omega_j^2-\omega^2+2i\xi_j\omega_j\omega}.
$$

Static correction of the omitted modes (exact expansion for Rayleigh damping, $d=1+ia_1\omega$,
$z=\omega^2-ia_0\omega$):

$$
\Delta u_t=\frac{r_1}{d}+\frac{z\,r_2}{d^2},\quad r_1=(K^{-1}\mathbf f)_t-\sum_\text{kept}\frac{p_j}{\lambda_j},\quad
r_2=(K^{-1}MK^{-1}\mathbf f)_t-\sum_\text{kept}\frac{p_j}{\lambda_j^2},
$$

applied only where $q=|z|/(\lambda_\text{omit}|d|)<\tfrac12$ ($\lambda_\text{omit}$ a lower bound of the
omitted eigenvalues), otherwise plain superposition plus a warning. `truncation_ratio` reports
$|r_1|/|(K^{-1}\mathbf f)_t|$.

**Direct** (fallback when no usable modes): the real $2n\times2n$ system
$\begin{bmatrix}K-\omega^2M&-\omega C\\\omega C&K-\omega^2M\end{bmatrix}\begin{bmatrix}\mathbf u_r\\\mathbf u_i\end{bmatrix}=\begin{bmatrix}\mathbf f\\0\end{bmatrix}$
by dense LU (capped at $2n\le6000$).

Prescribed support displacements are refused (they are not in the load vector).

Tests: `tests/integration/harmonic.rs`, `tests/certify_nonlinear.rs` (`certify_harmonic_*`,
`harmonic_static_correction_matches_exact`, `harmonic_truncation_is_reported`),
`inclined_support_analyses.rs::harmonic_*`, `constraints_inclined_supports.rs::harmonic_*`.

---

## 9. Model reduction (`reduction.rs`)

Free DOFs (after constraints) are split into boundary $B$ (DOFs of `boundary_nodes`) and interior
$I$.

**Guyan.** Static condensation, $\mathbf u_I=-K_{II}^{-1}K_{IB}\mathbf u_B+K_{II}^{-1}\mathbf f_I$:

$$
\mathbf u=\begin{bmatrix}I\\\Psi\end{bmatrix}\mathbf u_B,\quad\Psi=-K_{II}^{-1}K_{IB},\qquad
K_c=K_{BB}-K_{BI}K_{II}^{-1}K_{IB},\quad \mathbf f_c=\mathbf f_B-K_{BI}K_{II}^{-1}\mathbf f_I .
$$

The condensed system is solved, interior DOFs recovered, and displacements, reactions and member
forces reported (exact for statics). The Guyan mass $M_c=T^TMT$ is **not** computed:
`GuyanInput` has no densities and `m_condensed` is always empty.

**Craig–Bampton.** $T=\begin{bmatrix}I&0\\\Psi&\Phi_m\end{bmatrix}$ with $\Psi$ as above (constraint
modes) and $\Phi_m$ the first $m$ eigenvectors of $K_{II}\boldsymbol\phi=\omega^2M_{II}\boldsymbol\phi$
(fixed-interface modes), each scaled to max |component| = 1 (not mass-normalised). Then
$K_r=T^TKT$, $M_r=T^TMT$ explicitly by blocks:

$$
K_r=\begin{bmatrix}K_c&0\\0&\Phi_m^TK_{II}\Phi_m\end{bmatrix},\quad
M_r=\begin{bmatrix}M_{BB}+M_{BI}\Psi+\Psi^TM_{IB}+\Psi^TM_{II}\Psi&(M_{BI}+\Psi^TM_{II})\Phi_m\\\cdot&\Phi_m^TM_{II}\Phi_m\end{bmatrix}.
$$

The $K$ coupling block $(K_{BI}+\Psi^TK_{II})\Phi_m$ is computed and is zero to round-off; the
modal blocks are diagonal with the modal masses $m_j$ and $\lambda_jm_j$ (not identity and
$\Lambda$, because of the max-norm scaling).

Tests: `tests/validation/benchmarks/reduction_benchmark.rs`, `tests/validation/domains/analysis_methods/matrix_condensation.rs`,
`inclined_support_analyses.rs::craig_bampton_*`, `constraints_inclined_supports.rs::{guyan,craig_bampton}_*`.

---

## 10. Inclined supports in the dynamics paths

`docs/SOLVER_REFERENCE.md` §3 still says the dynamics paths "do not yet back-rotate
inclined-support DOFs". That is no longer true: modal, buckling, spectral, harmonic, time
history, Guyan and Craig–Bampton assemble $M$ and $K_G$ in the same inclined frames as $K$
(`*_inclined`, `rotate_inclined`), rotate the influence vectors and force histories in, and
rotate every reported shape/history back to global axes before normalising. Verified against
the same model with rotated geometry in `tests/inclined_support_analyses.rs` (modal 2D/3D,
harmonic 2D/3D, spectral 2D, buckling 3D, time history 3D, Craig–Bampton 2D/3D, P-Delta 2D) and
`tests/constraints_inclined_supports.rs` (MD-11).

---

## 11. Limits of validity

- Linear, small-displacement dynamics and linearised (bifurcation) buckling about the linear
  static state. Pre-buckling deformation, imperfections and plasticity are not in $\lambda$.
- Buckling detects flexural modes of frames, trusses and shells only; no torsional,
  flexural-torsional or lateral-torsional modes of members (Section 1.5).
- Mass without rotary inertia (Section 2.2), torsional inertia from $I_y+I_z$, lumped mass for
  released members, no nodal masses.
- Modal participation without the support-coupled inertia (MD-5); mass ratios relative to the
  total member mass (MD-4).
- Response spectrum: single direction, equal modal damping, absolute-value force combination
  (MD-6), SRSS base shear (MD-7), no inelastic displacement amplification.
- Time history: implicit Newmark/HHT only, Rayleigh damping only, ground record sampled at
  $\Delta t$, peak reactions at the peak-norm step only.

---

## 12. Verification map

| Item | Verified by | Gap |
|---|---|---|
| $K_G$ closed forms, releases | `symbolic_elements.rs::geometric_stiffness_exact`, `dmgd::kg_2d_*`, `dmgd::kg_3d_*`, `geometric_stiffness_releases.rs` | no torsion / moment terms to verify (absent) |
| Axial force for $K_G$ | `opensees_differential_regressions.rs::buckling_*_mean_axial_force_*` | thermal $\alpha$ fixed |
| Consistent / lumped mass | `symbolic_elements.rs::mass_exact`, `dmgd::consistent_mass_2d_and_3d_agree`, `dmgd::released_members_*`, `core/sparse_mass.rs` | — |
| Warping mass | `warping_torsion.rs::validation_warping_fork_beam_torsional_frequency` | — |
| Buckling eigenproblem | `core/buckling.rs`, `certify.rs::certify_buckling_*`, `geometric_stiffness_releases.rs` | no torsional buckling test passes (MD-8) |
| Modal frequencies, orthogonality | `validation/domains/dynamics/modal_*.rs`, `certify.rs::certify_modal_*` | no Sturm check in the solver |
| Participation, effective mass | `modal_constrained_participation.rs`, `dmgd::effective_mass_sums_*`, `dmgd::modal_participation_*` | MD-5 open |
| CQC coefficient | `dmgd::cqc_coefficient_is_der_kiureghian_1981`, `certify_nonlinear.rs::certify_spectral_2d_honest` | force combination MD-6, base shear MD-7 |
| Newmark / HHT | `certify_dynamics.rs` (exact residuals), `dmgd::hht_and_newmark_parameters`, `input_validation_gates.rs` | no warning for conditional stability |
| Rayleigh | `damping.rs::tests`, `core/modal.rs::rayleigh_delivers_*` | — |
| Harmonic | `certify_nonlinear.rs::certify_harmonic_*`, `harmonic_static_correction_matches_exact` | — |
| Guyan / Craig–Bampton | `reduction_benchmark.rs`, `matrix_condensation.rs`, inclined/constraint parity tests | no Guyan mass |

---

## References

- J. S. Przemieniecki, *Theory of Matrix Structural Analysis*, 1968 (consistent mass, geometric stiffness).
- W. McGuire, R. H. Gallagher, R. D. Ziemian, *Matrix Structural Analysis*, 2nd ed., 2000, ch. 9 (3D geometric stiffness incl. Wagner and moment terms).
- K.-J. Bathe, *Finite Element Procedures*, 1996 (generalized eigenproblem, Lanczos, Sturm sequence, Newmark).
- A. K. Chopra, *Dynamics of Structures*, 4th ed. (Rayleigh damping §11.4, multi-support excitation §9.7, CQC §13.7, Newmark §5.4).
- A. Der Kiureghian, "A response spectrum method for random vibration analysis of MDF systems", *Earthquake Eng. Struct. Dyn.* 9 (1981) 419–435.
- E. L. Wilson, A. Der Kiureghian, E. P. Bayo, "A replacement for the SRSS method in seismic analysis", *EESD* 9 (1981) 187–194.
- H. M. Hilber, T. J. R. Hughes, R. L. Taylor, "Improved numerical dissipation for time integration algorithms in structural dynamics", *EESD* 5 (1977) 283–292.
- N. M. Newmark, "A method of computation for structural dynamics", *J. Eng. Mech. Div. ASCE* 85 (1959).
- R. J. Guyan, "Reduction of stiffness and mass matrices", *AIAA J.* 3 (1965) 380.
- R. R. Craig, M. C. C. Bampton, "Coupling of substructures for dynamic analyses", *AIAA J.* 6 (1968) 1313–1319.
- S. P. Timoshenko, J. M. Gere, *Theory of Elastic Stability*, 1961 (torsional buckling $P_T$).

---

## Discrepancies and open questions for review

| ID | Description | Status | Test |
|---|---|---|---|
| MD-1 | Frame $K_G$ has only the axial-force bending blocks: no $P/L$ axial term, no Wagner term $PI_p/A$ on the twist, no end-moment terms, no shear correction. Listed in SYMBOLIC.md as a documented choice; re-verified against `frame_kg_local_3d`. Consequences in MD-8 and MD-9. #434 adds the Wagner term $P r_0^2/L$ and the shear-centre coupling. | PARTLY FIXED (#434: Wagner term and shear-centre coupling; no P/L axial term, no end-moment terms) | `dmgd::kg_3d_has_bending_blocks_only` |
| MD-2 | Any release (bending or torsion, 2D/3D, warping or not) turns the whole member mass into $\rho AL/2$ per translation with no rotational inertia. Re-verified; impact small (−0.2% on the fundamental of the test beam), but nodes reached only by released members have massless rotations. | DOCUMENTED-CHOICE | `dmgd::released_members_are_lumped_translations_only`, `dmgd::lumped_end_members_change_the_fundamental_little` |
| MD-3 | Consistent mass is Euler–Bernoulli with no rotary inertia (also for Timoshenko members). Frequencies overestimated by $\sqrt{1+(n\pi r/L)^2}$: 1.6/6.4/13.7% for modes 1–3 at $L/h=5$, <1% for $L/h\ge10$ in mode 1. | DOCUMENTED-CHOICE | `dmgd::modal_frequencies_are_euler_bernoulli_without_rotary_inertia` |
| MD-4 | Mass ratios divide by the total member mass, while $\sum_nM^\text{eff}$ over all modes is the free-DOF mass $\mathbf r_f^TM_{ff}\mathbf r_f$; a one-element cantilever tops out at 37%. Conservative for the 90% rule; coarse meshes cannot reach it. Since #434 the sum is $(M\mathbf r)_f^TM_{ff}^{-1}(M\mathbf r)_f$: 75% for one element, tending to the total with refinement. | FIXED (#434, with MD-5) | `dmgd::effective_mass_sums_to_free_mass_not_total_mass` |
| MD-5 | Modal $\Gamma$ uses $M_{ff}\mathbf r_f$ and omits $M_{fr}\mathbf r_r$, the inertia coupled to the moving supports by the consistent mass; time history includes it. The modal static limit is 0.781 of the exact value for a one-element cantilever (better with refinement). Propagates to spectral results via $\Gamma$, $M^\text{eff}$. Fix: compute $L_d$ from $(M\mathbf r)_f$ with the full mass as `ground_influence` does; `certify/spectral.rs` (`influence`) and its reference in `certify_nonlinear.rs` use the same free-block product and must change with it. | FIXED (#434) | `dmgd::modal_participation_includes_support_coupled_mass`; `dmgd::support_coupled_mass_row_is_the_consistent_udl_load` |
| MD-6 | Spectral element forces are combined from per-mode $\max(|r_\text{start}|,|r_\text{end}|)$, so CQC cross terms are never negative and ends are mixed across modes. Conservative (an upper bound), but up to 2.7× in the test with two close, opposite-sign modes. Fix: combine signed start and end values separately, then take the max; `certify/spectral.rs` mirrors the current rule. | FIXED (#434: signed end forces combined per end) | `dmgd::spectral_forces_are_combined_signed_like_displacements` |
| MD-7 | `base_shear` is SRSS of $M^\text{eff}_nS_{a,n}$ even when CQC is requested. Unconservative for closely spaced modes (×1/1.23 at $\omega_2=1.1\omega_1$). Fix: use $\rho_{ij}$ when rule = CQC; the certificate states "the solver always uses SRSS here" and must change with it. | FIXED (#434, #332: base shear combined with the requested rule) | `dmgd::spectral_base_shear_follows_the_requested_rule` |
| MD-8 | Consequence of MD-1: torsional buckling of columns with low $GJ$ (cruciform, angles, short open sections) is not found; the flexural load is reported. 96% overestimate for a 200×10 cruciform, $L=1.5$ m. Unconservative. | FIXED (#434) | `dmgd::cruciform_column_buckles_in_torsion` |
| MD-9 | Consequence of MD-1: no lateral-torsional buckling. Pure bending is refused ("No compressed elements"); in a beam-column the moment's contribution is silently ignored. | DOCUMENTED-CHOICE | `dmgd::beam_in_pure_bending_has_no_buckling_problem` |
| MD-10 | `TimeHistoryInput(3D).method` is never read: `"hht"` without `alpha` runs Newmark, `"newmark"` with `alpha` runs HHT. The result's `method` string does report what ran. | FIXED | `dmgd::time_history_method_field_selects_the_scheme` |
| MD-11 | `SOLVER_REFERENCE.md` §3 says dynamics paths do not back-rotate inclined DOFs; the code and `inclined_support_analyses.rs` show they do. `SOLVER_REFERENCE.md` §3 is now corrected. | FIXED (doc) | `tests/inclined_support_analyses.rs` |
| MD-12 | No nodal (point) masses or rotational nodal inertias exist in the input; seismic mass from loads is not supported. Mass comes only from densities. | FIXED (#399: nodal, line and area masses) | — |
| MD-13 | Response-spectrum and time-history settings without a guard: conditionally stable Newmark ($\beta<\gamma/2$) runs without a warning; the ground record is assumed sampled at the analysis $\Delta t$; spectral $I/R$ also scales displacements; "peak reactions" are elastic forces at the peak-norm step, not per-reaction envelopes. | DOCUMENTED-CHOICE | `certify_dynamics.rs::conditionally_stable_linear_acceleration` |
